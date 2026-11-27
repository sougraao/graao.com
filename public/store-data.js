// Stores: the public storefront (catalog, product, cart and checkout). The cart lives in the visitor's
// browser; every price, stock check, coupon and total is recalculated by the server.

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const hex = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#155eef';
export const brl = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
export const methodLabel = { AbacatePay: 'Pix ou cartão online', Pix: 'Pix', 'Bank transfer': 'Transferência bancária', Cash: 'Dinheiro na retirada', Manual: 'Combinar com a loja' };
export const statusLabel = { Pending: 'Aguardando pagamento', Paid: 'Pago', Fulfilled: 'Enviado / entregue', Cancelled: 'Cancelado' };

// What the storefront may show: visible items with an active one-time product.
export function catalog(state, store) {
  return store.items.filter(item => !item.hidden).map(item => {
    const product = state.products.find(row => row.id === item.productId && row.active !== false && row.kind === 'One time');
    if (!product) return null;
    // The store's own limit and the product inventory (Pagamentos → Estoque): the smaller one wins.
    const tracked = product.trackInventory && !product.allowBackorder ? Math.max(0, Number(product.quantity) || 0) : null;
    const stock = item.stock === null ? tracked : tracked === null ? item.stock : Math.min(item.stock, tracked);
    const collections = (state.productCollections || []).filter(row => row.productIds.includes(product.id)).map(row => row.slug);
    return { id: product.id, slug: item.slug, name: product.name, description: product.description, price: product.price, image: item.imageUrl, category: item.category, stock, collections };
  }).filter(Boolean);
}

/** Approved reviews of a product (Pagamentos → Avaliações) and their average. */
export function approvedReviews(state, productId) {
  const rows = (state.productReviews || []).filter(row => row.productId === productId && row.status === 'approved').sort((a, b) => b.created.localeCompare(a.created));
  return { count: rows.length, average: rows.length ? Math.round(rows.reduce((n, row) => n + row.rating, 0) / rows.length * 10) / 10 : 0, rows: rows.slice(0, 30) };
}
const stars = n => `<span class="st-stars" aria-label="${n} de 5 estrelas">${'★'.repeat(Math.round(n))}${'☆'.repeat(5 - Math.round(n))}</span>`;

const css = color => `
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#101828;background:#f8f9fb}
a{color:${hex(color)}}button,input,select,textarea{font:inherit}
.st-top{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #eaecf0}.st-top div{max-width:1120px;margin:0 auto;padding:14px 20px;display:flex;align-items:center;gap:16px}
.st-top a{color:#101828;text-decoration:none}.st-brand{font-weight:800;font-size:19px}.st-cart{margin-left:auto;display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:99px;background:${hex(color)};color:#fff !important;font-weight:700;font-size:14px}
.st-cart b{display:grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:99px;background:#fff;color:${hex(color)};font-size:12px}
main{max-width:1120px;margin:0 auto;padding:32px 20px 72px}.st-hero h1{margin:0;font-size:clamp(28px,4vw,40px);line-height:1.15}.st-hero p{margin:8px 0 0;color:#475467;max-width:60ch}
.st-cats{display:flex;flex-wrap:wrap;gap:8px;margin:22px 0}.st-cats a{padding:6px 14px;border-radius:99px;border:1px solid #d0d5dd;background:#fff;color:#344054;text-decoration:none;font-size:14px;font-weight:600}.st-cats a[aria-current]{background:#101828;border-color:#101828;color:#fff}
.st-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:20px}
.st-card{display:flex;flex-direction:column;border-radius:16px;background:#fff;border:1px solid #eaecf0;overflow:hidden}
.st-card>a{display:block;color:inherit;text-decoration:none}.st-img{display:block;width:100%;aspect-ratio:1;object-fit:cover;background:linear-gradient(135deg,${hex(color)}1f,${hex(color)}55)}
.st-card div{display:grid;gap:6px;padding:14px 16px 16px}.st-card h2{margin:0;font-size:16px;line-height:1.35}.st-card h2 a{color:inherit;text-decoration:none}.st-price{font-weight:800;font-size:18px}
.st-add{min-height:42px;border:0;border-radius:10px;background:${hex(color)};color:#fff;font-weight:700;cursor:pointer}.st-add:disabled{background:#d0d5dd;color:#475467;cursor:not-allowed}
.st-add:focus-visible,.st-cats a:focus-visible,.st-cart:focus-visible{outline:2px solid ${hex(color)};outline-offset:2px}
.st-out{color:#b42318;font-size:13px;font-weight:700}.st-empty{padding:48px;border:1px dashed #d0d5dd;border-radius:16px;text-align:center;color:#475467;background:#fff}
.st-product{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:36px;align-items:start}.st-product .st-img{border-radius:18px}
.st-product h1{margin:0 0 8px;font-size:32px;line-height:1.2}.st-product .st-price{font-size:26px}.st-desc{white-space:pre-line;color:#344054}
.st-buy{display:flex;gap:10px;align-items:center;margin:18px 0}.st-qty{width:84px;min-height:44px;padding:8px 10px;border:1px solid #d0d5dd;border-radius:10px}
.st-buy .st-add{flex:1;min-height:46px}.st-back{display:inline-block;margin-bottom:18px;font-size:14px}
.st-checkout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(300px,1fr);gap:28px;align-items:start}
.st-box{padding:20px;border-radius:16px;background:#fff;border:1px solid #eaecf0;display:grid;gap:14px}.st-box h2{margin:0;font-size:18px}
.st-line{display:grid;grid-template-columns:56px minmax(0,1fr) auto;gap:12px;align-items:center}.st-line .st-img{width:56px;border-radius:10px}
.st-line b{display:block;font-size:15px}.st-line small{color:#667085}.st-line-tools{display:flex;align-items:center;gap:6px;margin-top:4px}
.st-line-tools button{width:28px;height:28px;border:1px solid #d0d5dd;border-radius:8px;background:#fff;cursor:pointer}.st-remove{width:auto !important;padding:0 8px;color:#b42318}
.st-sum{display:grid;gap:6px;font-size:15px}.st-sum div{display:flex;justify-content:space-between}.st-sum .st-total{padding-top:8px;border-top:1px solid #eaecf0;font-size:19px;font-weight:800}
.st-box label{display:grid;gap:4px;font-size:13.5px;font-weight:600}.st-box input,.st-box select,.st-box textarea{width:100%;min-height:42px;padding:9px 11px;border:1px solid #d0d5dd;border-radius:10px;background:#fff;color:inherit}
.st-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.st-three{display:grid;grid-template-columns:2fr 1fr;gap:10px}
.st-radio{display:flex;gap:16px;flex-wrap:wrap}.st-radio label{display:flex;align-items:center;gap:6px;font-weight:500}.st-radio input{width:auto;min-height:0}
.st-coupon{display:flex;gap:8px}.st-coupon button{padding:0 14px;border:1px solid #d0d5dd;border-radius:10px;background:#fff;font-weight:700;cursor:pointer}
.st-error{margin:0;color:#b42318;font-weight:600}.st-done{max-width:620px;margin:0 auto;text-align:center;display:grid;gap:12px;justify-items:center}
.st-done span{display:grid;place-items:center;width:60px;height:60px;border-radius:50%;background:${hex(color)};color:#fff;font-size:30px}
.st-pay{width:100%;padding:16px;border-radius:14px;background:#fff;border:1px solid #eaecf0;text-align:left;white-space:pre-line}
.st-stars{color:#f79009;letter-spacing:1px}.st-rating{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:4px 0 0;color:#475467;font-size:14px}
.st-reviews{margin-top:40px;display:grid;gap:16px}.st-reviews h2{margin:0;font-size:22px}.st-review{padding:16px;border-radius:14px;background:#fff;border:1px solid #eaecf0}
.st-review p{margin:6px 0 0;white-space:pre-line}.st-review small{color:#667085}.st-reply{margin-top:10px;padding:10px 12px;border-radius:10px;background:#f2f4f7;font-size:14px}
.st-rate{display:flex;gap:4px;border:0;padding:0;margin:0}.st-rate label{cursor:pointer;font-size:26px;color:#d0d5dd;display:inline-block}.st-rate input{position:absolute;opacity:0;width:1px;height:1px}.st-rate label.on{color:#f79009}.st-rate input:focus-visible+span{outline:2px solid currentColor;outline-offset:2px}
.st-hp{position:absolute;left:-9999px}
@media (max-width:820px){.st-product,.st-checkout{grid-template-columns:minmax(0,1fr)}}
`;

function layout(store, base, title, body, script = '') {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(store.description || store.name)}"><style>${css(store.color)}</style></head>
<body><header class="st-top"><div><a class="st-brand" href="${esc(base)}">${esc(store.name)}</a><a class="st-cart" href="${esc(base)}/carrinho">Carrinho <b data-st-count>0</b></a></div></header>
<main>${body}</main><script>${cartScript(store.id)}${script}</script></body></html>`;
}

// Shared by every page: the cart in localStorage, the counter and the "add to cart" buttons.
const cartScript = storeId => `const KEY='graao-cart:'+${JSON.stringify(storeId)};
const readCart=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]').filter(x=>x&&x.productId&&x.qty>0)}catch{return[]}};
const writeCart=c=>{try{localStorage.setItem(KEY,JSON.stringify(c))}catch{}count()};
const count=()=>{const n=readCart().reduce((a,x)=>a+x.qty,0);document.querySelectorAll('[data-st-count]').forEach(e=>{e.textContent=n})};
document.addEventListener('click',e=>{const b=e.target.closest('[data-st-add]');if(!b)return;const qty=Math.max(1,Math.min(99,Number((document.querySelector('[data-st-qty]')||{}).value||1)));const c=readCart();const row=c.find(x=>x.productId===b.dataset.stAdd);if(row)row.qty=Math.min(99,row.qty+qty);else c.push({productId:b.dataset.stAdd,qty});writeCart(c);const t=b.textContent;b.textContent='Adicionado ✓';setTimeout(()=>{b.textContent=t},1200)});
count();`;

const card = (item, base) => `<article class="st-card"><a href="${esc(base)}/p/${esc(item.slug)}" tabindex="-1" aria-hidden="true">${item.image ? `<img class="st-img" src="${esc(item.image)}" alt="" loading="lazy">` : '<span class="st-img"></span>'}</a>
  <div><h2><a href="${esc(base)}/p/${esc(item.slug)}">${esc(item.name)}</a></h2><span class="st-price">${brl(item.price)}</span>
  ${item.stock === 0 ? '<span class="st-out">Esgotado</span><button class="st-add" disabled>Esgotado</button>' : `<button class="st-add" type="button" data-st-add="${esc(item.id)}">Adicionar ao carrinho</button>`}</div></article>`;

export function storeHome(state, store, { base, category = '', collection = '' }) {
  const items = catalog(state, store);
  const categories = [...new Set(items.map(item => item.category).filter(Boolean))];
  const groups = (state.productCollections || []).filter(row => items.some(item => item.collections.includes(row.slug)));
  const shown = collection ? items.filter(item => item.collections.includes(collection)) : category ? items.filter(item => item.category === category) : items;
  return layout(store, base, store.name, `<section class="st-hero"><h1>${esc(store.name)}</h1>${store.description ? `<p>${esc(store.description)}</p>` : ''}</section>
    ${categories.length || groups.length ? `<nav class="st-cats" aria-label="Categorias e coleções"><a href="${esc(base)}"${category || collection ? '' : ' aria-current="page"'}>Tudo</a>${groups.map(row => `<a href="${esc(base)}?colecao=${encodeURIComponent(row.slug)}"${collection === row.slug ? ' aria-current="page"' : ''}>${esc(row.name)}</a>`).join('')}${categories.map(cat => `<a href="${esc(base)}?categoria=${encodeURIComponent(cat)}"${category === cat ? ' aria-current="page"' : ''}>${esc(cat)}</a>`).join('')}</nav>` : '<div style="height:22px"></div>'}
    ${shown.length ? `<div class="st-grid">${shown.map(item => card(item, base)).join('')}</div>` : '<p class="st-empty">Nenhum produto à venda ainda.</p>'}`);
}

export function storeProduct(state, store, item, { base }) {
  const rated = approvedReviews(state, item.id), api = base.replace(/^\/loja\//, '/api/store/');
  const day = iso => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso));
  const reviews = `<section class="st-reviews" aria-labelledby="st-rv"><h2 id="st-rv">Avaliações</h2>
    ${rated.count ? `<p class="st-rating">${stars(rated.average)} <b>${String(rated.average).replace('.', ',')}</b> de 5 · ${rated.count} avaliaç${rated.count === 1 ? 'ão' : 'ões'}</p>${rated.rows.map(row => `<article class="st-review">${stars(row.rating)} <b>${esc(row.title || '')}</b>
      <p>${esc(row.body)}</p><small>${esc(row.name)} · ${day(row.created)}</small>${row.reply ? `<div class="st-reply"><b>Resposta da loja:</b> ${esc(row.reply)}</div>` : ''}</article>`).join('')}` : '<p class="st-rating">Ainda não há avaliações. Seja a primeira pessoa a avaliar.</p>'}
    <form class="st-box" data-st-review novalidate><h2>Avaliar este produto</h2>
      <fieldset class="st-rate" data-st-rate><legend style="font-weight:700;font-size:13.5px;margin-bottom:4px">Sua nota *</legend>${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="rating" value="${n}" required><span aria-hidden="true">★</span><span style="position:absolute;left:-9999px">${n} estrela${n > 1 ? 's' : ''}</span></label>`).join('')}</fieldset>
      <div class="st-two"><label>Nome *<input name="name" required maxlength="80" autocomplete="name"></label><label>E-mail * <small style="font-weight:400;color:#667085">(não aparece)</small><input name="email" type="email" required maxlength="160" autocomplete="email"></label></div>
      <label>Título<input name="title" maxlength="120"></label><label>Sua avaliação *<textarea name="body" rows="3" required maxlength="2000"></textarea></label>
      <label class="st-hp" aria-hidden="true">Site<input name="website" tabindex="-1" autocomplete="off"></label>
      <p class="st-error" data-st-review-error role="alert" hidden></p><button class="st-add" type="submit">Enviar avaliação</button></form></section>`;
  // Only a visitor whose cart session already exists (the cart page made it) reports the view.
  const script = `try{const sv=localStorage.getItem('graao-cart-session:'+${JSON.stringify(store.id)});if(/^[0-9a-f]{32}$/.test(sv||''))fetch(${JSON.stringify(api)}+'/view',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:sv,productId:${JSON.stringify(item.id)}}),keepalive:true}).catch(()=>{})}catch{}
const rf=document.querySelector('[data-st-review]');
rf.addEventListener('change',e=>{if(e.target.name!=='rating')return;const v=Number(e.target.value);rf.querySelectorAll('[data-st-rate] label').forEach((l,i)=>l.classList.toggle('on',i<v))});
rf.addEventListener('submit',async e=>{e.preventDefault();const er=rf.querySelector('[data-st-review-error]');for(const el of rf.elements){if(el.willValidate&&!el.checkValidity()){el.reportValidity();return}}
 const f=Object.fromEntries(new FormData(rf)),b=rf.querySelector('button[type=submit]');b.disabled=true;er.hidden=true;
 try{const r=await fetch(${JSON.stringify(api)}+'/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...f,productId:${JSON.stringify(item.id)}})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Não foi possível enviar.');
  rf.innerHTML='<h2>Obrigado pela avaliação!</h2><p style="margin:0">Ela aparece aqui depois que a loja aprovar.</p>'}
 catch(x){er.textContent=x.message;er.hidden=false;b.disabled=false}});`;
  return layout(store, base, `${item.name} · ${store.name}`, `<a class="st-back" href="${esc(base)}">← Voltar à loja</a><div class="st-product">
    ${item.image ? `<img class="st-img" src="${esc(item.image)}" alt="${esc(item.name)}">` : '<span class="st-img"></span>'}
    <div><h1>${esc(item.name)}</h1>${rated.count ? `<p class="st-rating">${stars(rated.average)} ${String(rated.average).replace('.', ',')} · <a href="#st-rv">${rated.count} avaliaç${rated.count === 1 ? 'ão' : 'ões'}</a></p>` : ''}<span class="st-price">${brl(item.price)}</span>
      ${item.stock === 0 ? '<p class="st-out">Esgotado</p>' : `<div class="st-buy"><label class="sr" for="st-qty" style="position:absolute;left:-9999px">Quantidade</label><input id="st-qty" class="st-qty" type="number" min="1" max="${item.stock ?? 99}" value="1" data-st-qty><button class="st-add" type="button" data-st-add="${esc(item.id)}">Adicionar ao carrinho</button></div>`}
      ${item.stock ? `<p class="st-desc"><small>${item.stock} em estoque</small></p>` : ''}${item.description ? `<p class="st-desc">${esc(item.description)}</p>` : ''}</div></div>${reviews}`, script);
}

export function storeCart(state, store, { base, workspace }) {
  const items = catalog(state, store).map(({ id, name, price, image, slug }) => ({ id, name, price, image, slug }));
  const ship = store.shipping, pickup = ship.pickup, shipping = ship.mode !== 'none';
  const body = `<div data-st-checkout><h1 style="margin:0 0 20px">Carrinho</h1><div class="st-checkout">
    <form class="st-box" data-st-form novalidate><h2>Seus dados</h2>
      <label>Nome completo *<input name="name" required maxlength="120" autocomplete="name"></label>
      <div class="st-two"><label>E-mail *<input name="email" type="email" required maxlength="160" autocomplete="email"></label><label>Telefone${store.requirePhone ? ' *' : ''}<input name="phone" type="tel" maxlength="48" autocomplete="tel"${store.requirePhone ? ' required' : ''}></label></div>
      ${shipping && pickup ? `<fieldset class="st-radio" style="border:0;padding:0;margin:0"><legend style="font-weight:700;margin-bottom:6px">Entrega</legend><label><input type="radio" name="delivery" value="shipping" checked> Entrega no endereço</label><label><input type="radio" name="delivery" value="pickup"> Retirar na loja</label></fieldset>` : `<input type="hidden" name="delivery" value="${shipping ? 'shipping' : 'pickup'}">`}
      ${shipping ? `<div data-st-address><div class="st-three"><label>CEP *<input name="zip" maxlength="12" autocomplete="postal-code" inputmode="numeric"></label><label>Número *<input name="number" maxlength="20"></label></div>
        <label>Rua *<input name="street" maxlength="160" autocomplete="address-line1"></label><div class="st-two"><label>Complemento<input name="complement" maxlength="80"></label><label>Bairro<input name="district" maxlength="80"></label></div>
        <div class="st-three"><label>Cidade *<input name="city" maxlength="80" autocomplete="address-level2"></label><label>UF *<input name="state" maxlength="2" autocomplete="address-level1"></label></div></div>` : ''}
      ${pickup && ship.pickupNote ? `<p data-st-pickup style="margin:0;color:#475467;font-size:14px"${shipping ? ' hidden' : ''}>${esc(ship.pickupNote)}</p>` : ''}
      <label>Observações<textarea name="note" rows="2" maxlength="500"></textarea></label>
      <p class="st-error" data-st-error role="alert" hidden></p><button class="st-add" type="submit" data-st-submit>Finalizar pedido</button>
      <p style="margin:0;color:#667085;font-size:13px">Pagamento: ${esc(methodLabel[store.payment.method] || store.payment.method)}. ${store.payment.method === 'AbacatePay' ? 'Ao finalizar, você vai para a página segura de pagamento.' : 'As instruções aparecem ao finalizar.'}</p></form>
    <aside class="st-box" aria-label="Resumo do pedido"><h2>Resumo</h2><div data-st-lines></div>
      <div class="st-coupon"><label style="flex:1" class="sr-label"><span style="position:absolute;left:-9999px">Cupom</span><input name="coupon" form="st-none" placeholder="Cupom de desconto" data-st-coupon maxlength="30"></label><button type="button" data-st-apply>Aplicar</button></div>
      <div class="st-coupon"><label style="flex:1" class="sr-label"><span style="position:absolute;left:-9999px">Cartão-presente</span><input name="giftcard" form="st-none" placeholder="Cartão-presente (código)" data-st-gift maxlength="20"></label><button type="button" data-st-gift-apply>Usar</button></div>
      <div class="st-sum" data-st-sum></div></aside></div></div>`;
  const script = `
const items=${JSON.stringify(items).replace(/</g, '\\u003c')},api=${JSON.stringify(`/api/store/${workspace}/${store.id}`)},base=${JSON.stringify(base)};
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v||0);
const form=document.querySelector('[data-st-form]'),lines=document.querySelector('[data-st-lines]'),sum=document.querySelector('[data-st-sum]'),err=document.querySelector('[data-st-error]');
let coupon='',gift='';
const SKEY='graao-cart-session:'+${JSON.stringify(store.id)};
const newSession=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');
let session=(()=>{try{let v=localStorage.getItem(SKEY);if(!/^[0-9a-f]{32}$/.test(v||'')){v=newSession();localStorage.setItem(SKEY,v)}return v}catch{return newSession()}})();
let capTimer=0;
const capture=()=>{const f=form.elements;if(!f.email||!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(f.email.value)||!readCart().length)return;clearTimeout(capTimer);
 capTimer=setTimeout(()=>{fetch(api+'/cart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session,name:f.name?f.name.value:'',email:f.email.value,phone:f.phone?f.phone.value:'',items:readCart(),coupon,delivery:delivery()})}).catch(()=>{})},800)};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const delivery=()=>(form.elements.delivery&&form.elements.delivery.value)||'pickup';
const call=async(path,body)=>{const r=await fetch(api+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Não foi possível concluir.');return d};
const draw=async()=>{let cart=readCart().filter(x=>items.some(i=>i.id===x.productId));writeCart(cart);
 if(!cart.length){document.querySelector('[data-st-checkout]').innerHTML='<p class="st-empty">Seu carrinho está vazio. <a href="'+base+'">Ver produtos</a></p>';return}
 lines.innerHTML=cart.map(x=>{const i=items.find(p=>p.id===x.productId);return '<div class="st-line">'+(i.image?'<img class="st-img" src="'+esc(i.image)+'" alt="">':'<span class="st-img"></span>')+'<div><b>'+esc(i.name)+'</b><small>'+brl(i.price)+' cada</small><div class="st-line-tools"><button type="button" data-st-dec="'+i.id+'" aria-label="Menos uma unidade">−</button><span>'+x.qty+'</span><button type="button" data-st-inc="'+i.id+'" aria-label="Mais uma unidade">+</button><button type="button" class="st-remove" data-st-del="'+i.id+'">Remover</button></div></div><b>'+brl(i.price*x.qty)+'</b></div>'}).join('');
 try{const q=await call('/quote',{items:cart,coupon,giftCard:gift,delivery:delivery()});err.hidden=true;
  sum.innerHTML='<div><span>Subtotal</span><span>'+brl(q.subtotal)+'</span></div>'+(q.discount?'<div><span>Desconto ('+esc(q.coupon)+')</span><span>−'+brl(q.discount)+'</span></div>':'')+(q.delivery==='shipping'?'<div><span>Frete</span><span>'+(q.shipping?brl(q.shipping):'Grátis')+'</span></div>':'')+(q.tax?'<div><span>Impostos</span><span>'+brl(q.tax)+'</span></div>':'')+(q.giftCardAmount?'<div><span>Cartão-presente ('+esc(q.giftCard)+')</span><span>−'+brl(q.giftCardAmount)+'</span></div>':'')+'<div class="st-total"><span>Total</span><span>'+brl(q.total)+'</span></div>';capture()}
 catch(e){if(coupon){coupon='';document.querySelector('[data-st-coupon]').value=''}if(gift&&/presente/i.test(e.message)){gift='';document.querySelector('[data-st-gift]').value=''}err.textContent=e.message;err.hidden=false}};
document.addEventListener('click',e=>{const t=e.target.closest('[data-st-inc],[data-st-dec],[data-st-del],[data-st-apply],[data-st-gift-apply]');if(!t)return;const c=readCart();
 if(t.dataset.stApply!==undefined){coupon=document.querySelector('[data-st-coupon]').value.trim();draw();return}
 if(t.dataset.stGiftApply!==undefined){gift=document.querySelector('[data-st-gift]').value.trim();draw();return}
 const id=t.dataset.stInc||t.dataset.stDec||t.dataset.stDel,row=c.find(x=>x.productId===id);if(!row)return;
 if(t.dataset.stInc)row.qty=Math.min(99,row.qty+1);if(t.dataset.stDec)row.qty-=1;writeCart(t.dataset.stDel?c.filter(x=>x.productId!==id):c.filter(x=>x.qty>0));draw()});
form.addEventListener('change',e=>{if(['name','email','phone'].includes(e.target.name))capture();if(e.target.name==='delivery'){const a=document.querySelector('[data-st-address]'),p=document.querySelector('[data-st-pickup]');if(a)a.hidden=delivery()==='pickup';if(p)p.hidden=delivery()!=='pickup';draw()}});
form.addEventListener('submit',async e=>{e.preventDefault();for(const el of form.elements){if(el.willValidate&&!el.checkValidity()){el.reportValidity();return}}
 const f=Object.fromEntries(new FormData(form)),b=form.querySelector('[data-st-submit]');b.disabled=true;err.hidden=true;
 try{const o=await call('/checkout',{session,items:readCart(),coupon,giftCard:gift,delivery:f.delivery,name:f.name,email:f.email,phone:f.phone,note:f.note,address:{zip:f.zip,street:f.street,number:f.number,complement:f.complement,district:f.district,city:f.city,state:f.state}});
  writeCart([]);clearTimeout(capTimer);try{localStorage.removeItem(SKEY)}catch{}document.querySelector('[data-st-checkout]').innerHTML='<div class="st-done"><span aria-hidden="true">✓</span><h1 style="margin:0">Pedido #'+o.number+' recebido</h1><p>Total: <b>'+brl(o.total)+'</b>. Guarde o número do pedido; a loja fala com você por '+esc(f.email)+'.</p>'+(o.payUrl?'<p><a class="st-paynow" href="'+esc(o.payUrl)+'" style="display:inline-block;padding:12px 20px;border-radius:10px;background:currentColor;font-weight:600;text-decoration:none"><span style="color:#fff">Pagar agora com Pix ou cartão</span></a></p>':'')+(o.instructions?'<div class="st-pay"><b>Como pagar ('+esc(o.method)+')</b>\\n'+esc(o.instructions)+'</div>':'')+(o.thanks?'<p>'+esc(o.thanks)+'</p>':'')+'<a href="'+base+'">Continuar comprando</a></div>';window.scrollTo(0,0)}
 catch(x){err.textContent=x.message;err.hidden=false;b.disabled=false}});
const rec=(location.hash.match(/recuperar=([0-9a-f]{48})/)||[])[1];
if(rec){history.replaceState(null,'',location.pathname);call('/restore',{token:rec}).then(d=>{const f=form.elements;if(d.session){session=d.session;try{localStorage.setItem(SKEY,d.session)}catch{}}
 if(d.items&&d.items.length)writeCart(d.items);if(d.name&&f.name)f.name.value=d.name;if(d.email&&f.email)f.email.value=d.email;if(d.phone&&f.phone)f.phone.value=d.phone;if(d.coupon){coupon=d.coupon;const c=document.querySelector('[data-st-coupon]');if(c)c.value=d.coupon}draw()}).catch(()=>draw())}
else draw();`;
  return layout(store, base, `Carrinho · ${store.name}`, body, script);
}
