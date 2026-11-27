// Sites → Lojas: stores over the Payments products, setup checklist, orders and settings.
import { icon } from './icons.js';
import { h, pageShell, utabs } from './screens.js';
import { siteTabs } from './forms.js';
import { brl, methodLabel, statusLabel } from './store-data.js';
import { ask } from './ask.js';

export const storeTabs = ['stores', 'store'];
const sv = { id: '', rev: '', draft: null, dirty: false, section: 'products', status: '', open: '' };
let env = null;
const badge = (label, tone = '') => `<span class="badge ${tone}">${h(label)}</span>`;
const when = iso => iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
const storeUrl = (c, store) => `/loja/${c.workspace}/${store.id}`;
const tone = { Pending: 'blue', Paid: 'green', Fulfilled: 'green', Cancelled: '' };
const paidTotal = orders => orders.filter(order => ['Paid', 'Fulfilled'].includes(order.status)).reduce((sum, order) => sum + order.total, 0);

function metrics(orders) {
  const paid = orders.filter(order => ['Paid', 'Fulfilled'].includes(order.status));
  return `<div class="metrics three"><div class="surface metric"><span>Pedidos</span><b>${orders.length}</b></div><div class="surface metric"><span>Faturamento pago</span><b>${brl(paidTotal(orders))}</b></div><div class="surface metric"><span>Ticket médio</span><b>${paid.length ? brl(paidTotal(orders) / paid.length) : '—'}</b></div></div>`;
}

function listView(c) {
  const button = `<button class="primary" data-st-new>${icon('plus', 16)} Nova loja</button>`;
  const rows = [...c.s.stores].sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created))).map(store => {
    const orders = c.s.orders.filter(order => order.storeId === store.id);
    return `<tr><td><a class="site-name" href="#sites/store/${store.id}">${icon('box', 16)}<span>${h(store.name)}</span></a></td><td>${store.items.length}</td><td>${orders.length}</td><td>${brl(paidTotal(orders))}</td><td>${store.active ? badge('Aberta', 'green') : badge('Rascunho')}</td>
      <td class="site-row-actions">${store.active ? `<a class="icon-btn" href="${storeUrl(c, store)}" target="_blank" rel="noopener" title="Ver loja" aria-label="Ver ${h(store.name)}">${icon('external', 15)}</a>` : ''}<a class="secondary site-open" href="#sites/store/${store.id}">Abrir</a></td></tr>`;
  }).join('');
  return pageShell({ title: 'Sites', desc: 'Crie funis, sites e formulários com IA, publique e acompanhe visitas e conversões.', cta: button, className: 'sites-page st-page',
    tabs: { key: 'sites', label: 'Seções de sites', current: 'stores', items: siteTabs },
    content: `${metrics(c.s.orders)}${rows ? `<div class="surface table-shell"><table class="site-table"><thead><tr><th scope="col">Loja</th><th scope="col">Produtos</th><th scope="col">Pedidos</th><th scope="col">Faturamento pago</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="surface empty site-empty">${icon('box', 26)}<strong>Nenhuma loja ainda</strong><p>Venda os produtos de Pagamentos com carrinho, cupons, frete e pedidos. Cada pedido gera uma fatura.</p>${button}</div>`}` });
}

/* ───────── Loja ───────── */

function loadDraft(c) {
  const store = c.s.stores.find(row => row.id === c.studio.project);
  if (!store) return null;
  if (sv.id !== store.id || (!sv.dirty && sv.rev !== (store.updated || store.created))) {
    if (sv.id !== store.id) Object.assign(sv, { section: 'products', status: '', open: '' });
    Object.assign(sv, { id: store.id, rev: store.updated || store.created, dirty: false, draft: structuredClone(store) });
  }
  return store;
}

function checklist(c, store) {
  const d = sv.draft;
  const steps = [['Produtos', d.items.length > 0, 'products'], ['Pagamento', Boolean(d.payment.instructions), 'settings'], ['Frete', d.shipping.mode !== 'none' || d.shipping.pickup, 'settings'],
    ['Impostos', true, 'settings'], ['Personalizar', Boolean(d.description), 'settings'], ['Publicar', store.active, '']];
  const done = steps.filter(step => step[1]).length;
  return `<section class="surface st-steps" aria-label="Configuração da loja"><b>${done}/6</b><ol>${steps.map(([label, ok, section]) => `<li class="${ok ? 'done' : ''}">${section ? `<button type="button" data-st-section="${section}">` : '<span>'}<i aria-hidden="true">${ok ? '✓' : ''}</i>${label}${section ? '</button>' : '</span>'}</li>`).join('')}</ol></section>`;
}

function productsHtml(c) {
  const d = sv.draft;
  const available = c.s.products.filter(product => product.kind === 'One time' && !d.items.some(item => item.productId === product.id));
  const rows = d.items.map((item, index) => {
    const product = c.s.products.find(row => row.id === item.productId);
    return `<tr><td>${item.imageUrl ? `<img class="st-thumb" src="${h(item.imageUrl)}" alt="">` : `<span class="st-thumb" aria-hidden="true">${icon('box', 16)}</span>`}</td>
      <td><b>${h(product?.name || 'Produto removido')}</b><small class="dim">${h(product ? brl(product.price) : '')}${product && product.active === false ? ' · inativo em Pagamentos' : ''}</small></td>
      <td><input data-st-item="${index}" data-key="category" value="${h(item.category)}" maxlength="40" aria-label="Categoria de ${h(product?.name)}" placeholder="Categoria"></td>
      <td><input type="number" min="0" data-st-item="${index}" data-key="stock" value="${item.stock ?? ''}" aria-label="Estoque de ${h(product?.name)}" placeholder="Sem controle"></td>
      <td><input type="url" data-st-item="${index}" data-key="imageUrl" value="${h(item.imageUrl)}" maxlength="600" aria-label="Foto de ${h(product?.name)}" placeholder="https://"></td>
      <td><label class="check"><input type="checkbox" data-st-item="${index}" data-key="hidden"${item.hidden ? ' checked' : ''}> Oculto</label></td>
      <td class="site-row-actions"><button class="icon-btn" data-st-remove="${index}" aria-label="Tirar ${h(product?.name)} da loja" title="Tirar da loja">${icon('trash', 15)}</button></td></tr>`;
  }).join('');
  return `<div class="toolbar"><select data-st-pick aria-label="Adicionar produto de Pagamentos"><option value="">Adicionar produto de Pagamentos…</option>${available.map(product => `<option value="${product.id}">${h(product.name)} · ${brl(product.price)}</option>`).join('')}</select>
      <button class="secondary" data-st-new-product>${icon('plus', 15)} Novo produto</button><span class="spacer"></span><a class="text-link" href="#payments/products">Gerenciar em Pagamentos</a></div>
    ${rows ? `<div class="surface table-shell"><table class="site-table st-items"><thead><tr><th scope="col"><span class="sr-only">Foto</span></th><th scope="col">Produto</th><th scope="col">Categoria</th><th scope="col">Estoque</th><th scope="col">Foto (https://)</th><th scope="col">Vitrine</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="dim st-note">Preço, nome e descrição vêm de Pagamentos → Produtos. Estoque vazio vende sem limite.</p>`
      : '<div class="surface empty"><strong>Nenhum produto na loja</strong><p>Escolha produtos de pagamento único de Pagamentos ou crie um novo.</p></div>'}`;
}

function ordersHtml(c, store) {
  const orders = c.s.orders.filter(order => order.storeId === store.id && (!sv.status || order.status === sv.status)).sort((a, b) => b.number - a.number);
  const all = c.s.orders.filter(order => order.storeId === store.id);
  const rows = orders.slice(0, 200).map(order => {
    const open = sv.open === order.id;
    return `<tr class="${open ? 'open' : ''}"><td><b>#${order.number}</b></td><td>${when(order.created)}</td><td>${h(order.name)}<small class="dim">${h(order.email)}</small></td><td>${order.items.reduce((sum, line) => sum + line.qty, 0)}</td><td><b>${brl(order.total)}</b></td><td>${badge(statusLabel[order.status], tone[order.status])}</td>
      <td><button class="text-link" data-st-open="${order.id}" aria-expanded="${open}">${open ? 'Fechar' : 'Detalhes'}</button></td></tr>
      ${open ? `<tr class="fm-answers"><td colspan="7"><div class="st-order">
        <div><h3>Itens</h3><ul>${order.items.map(line => `<li>${line.qty} × ${h(line.name)} <span class="dim">${brl(line.price)}</span> <b>${brl(line.total)}</b></li>`).join('')}</ul>
          <dl class="st-sums"><div><dt>Subtotal</dt><dd>${brl(order.subtotal)}</dd></div>${order.discount ? `<div><dt>Desconto ${h(order.coupon)}</dt><dd>−${brl(order.discount)}</dd></div>` : ''}<div><dt>${order.delivery === 'shipping' ? 'Frete' : 'Retirada'}</dt><dd>${order.delivery === 'shipping' ? (order.shipping ? brl(order.shipping) : 'Grátis') : '—'}</dd></div>${order.tax ? `<div><dt>Impostos</dt><dd>${brl(order.tax)}</dd></div>` : ''}<div><dt>Total</dt><dd><b>${brl(order.total)}</b></dd></div></dl></div>
        <div><h3>Entrega</h3>${order.address ? `<p>${h(order.address.street)}, ${h(order.address.number)}${order.address.complement ? ` – ${h(order.address.complement)}` : ''}<br>${h(order.address.district)} · ${h(order.address.city)}/${h(order.address.state)} · CEP ${h(order.address.zip)}</p>` : '<p>Retirada na loja</p>'}
          ${order.phone ? `<p>Telefone: ${h(order.phone)}</p>` : ''}${order.note ? `<p><b>Observação:</b> ${h(order.note)}</p>` : ''}<p><a class="text-link" href="#payments/invoices">Ver fatura em Pagamentos</a></p></div>
        <form class="st-order-form" data-st-order="${order.id}"><h3>Andamento</h3><label>Status<select name="status"${order.status === 'Cancelled' ? ' disabled' : ''}>${['Pending', 'Paid', 'Fulfilled', 'Cancelled'].map(status => `<option value="${status}"${order.status === status ? ' selected' : ''}>${statusLabel[status]}</option>`).join('')}</select></label>
          <label>Código de rastreio<input name="tracking" value="${h(order.tracking)}" maxlength="120"></label><button class="primary"${order.status === 'Cancelled' ? ' disabled' : ''}>Salvar andamento</button>
          <p class="dim">Pago fecha a fatura e registra a transação. Cancelado devolve o estoque e anula a fatura.</p></form></div></td></tr>` : ''}`;
  }).join('');
  return `${metrics(all)}<div class="toolbar"><select data-st-status aria-label="Filtrar pedidos"><option value="">Todos os pedidos</option>${['Pending', 'Paid', 'Fulfilled', 'Cancelled'].map(status => `<option value="${status}"${sv.status === status ? ' selected' : ''}>${statusLabel[status]}</option>`).join('')}</select></div>
    ${rows ? `<div class="surface table-shell"><table class="site-table fm-subs"><thead><tr><th scope="col">Pedido</th><th scope="col">Data</th><th scope="col">Cliente</th><th scope="col">Itens</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Detalhes</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="surface empty">${icon('box', 24)}<strong>${all.length ? 'Nenhum pedido com esse status' : 'Nenhum pedido ainda'}</strong><p>${all.length ? 'Escolha outro filtro.' : 'Abra a loja e faça um pedido de teste pelo carrinho.'}</p></div>`}`;
}

function settingsHtml() {
  const d = sv.draft, ship = d.shipping;
  const set = (key, label, value, extra = '') => `<label>${label}<input data-st-set="${key}" value="${h(value)}"${extra}></label>`;
  return `<div class="fb-settings">
    <section class="surface padded"><h2>Loja</h2>${set('name', 'Nome', d.name, ' maxlength="80"')}<label>Descrição<textarea data-st-set="description" rows="2" maxlength="400">${h(d.description)}</textarea></label>
      <label>Cor<span class="fb-color"><input type="color" data-st-set="color" value="${h(d.color)}"><code>${h(d.color)}</code></span></label></section>
    <section class="surface padded"><h2>Entrega</h2><fieldset class="cw-segment"><legend>Frete</legend>${[['none', 'Sem entrega'], ['flat', 'Valor fixo'], ['free-over', 'Fixo, grátis acima de um valor']].map(([id, label]) => `<label><input type="radio" name="st-ship" data-st-set="shipping.mode" value="${id}"${ship.mode === id ? ' checked' : ''}> ${label}</label>`).join('')}</fieldset>
      ${ship.mode !== 'none' ? `<div class="fb-two">${set('shipping.flat', 'Valor do frete (R$)', ship.flat, ' type="number" min="0" step="0.01"')}${ship.mode === 'free-over' ? set('shipping.freeOver', 'Grátis a partir de (R$)', ship.freeOver, ' type="number" min="0" step="0.01"') : ''}</div>` : ''}
      <label class="check"><input type="checkbox" data-st-set="shipping.pickup"${ship.pickup ? ' checked' : ''}> Permitir retirada na loja</label>${ship.pickup ? set('shipping.pickupNote', 'Instruções de retirada', ship.pickupNote, ' maxlength="200" placeholder="Rua da Bahia, 100 · seg a sex, 9h às 18h"') : ''}</section>
    <section class="surface padded"><h2>Pagamento e impostos</h2><label>Forma de pagamento<select data-st-set="payment.method">${Object.entries(methodLabel).map(([id, label]) => `<option value="${id}"${d.payment.method === id ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Instruções de pagamento (aparecem ao finalizar)<textarea data-st-set="payment.instructions" rows="3" maxlength="800" placeholder="Chave Pix: ... · Envie o comprovante pelo WhatsApp">${h(d.payment.instructions)}</textarea></label>
      ${set('taxPercent', 'Imposto sobre o pedido (%)', d.taxPercent, ' type="number" min="0" max="50" step="0.01"')}<p class="dim">A cobrança acontece fora do graao (Pix, transferência ou na retirada). Marque o pedido como pago quando receber.</p></section>
    <section class="surface padded"><h2>Checkout e contato</h2><label class="check"><input type="checkbox" data-st-set="requirePhone"${d.requirePhone ? ' checked' : ''}> Pedir telefone obrigatório</label>
      ${set('addTags', 'Tags para o contato', (d.addTags || []).join(', '), ' maxlength="400" placeholder="cliente-loja"')}<label>Mensagem depois do pedido<textarea data-st-set="thanks" rows="2" maxlength="400">${h(d.thanks)}</textarea></label></section>
    <div class="inline-gap"><button class="secondary danger" data-st-delete>Excluir loja</button></div></div>`;
}

function storeView(c) {
  const store = loadDraft(c);
  if (!store) return `<div class="page sites-page"><div class="surface empty"><strong>Loja não encontrada</strong><a class="primary" href="#sites/stores">Voltar às lojas</a></div></div>`;
  const d = sv.draft, pending = c.s.orders.filter(order => order.storeId === store.id && order.status === 'Pending').length;
  const body = sv.section === 'orders' ? ordersHtml(c, store) : sv.section === 'settings' ? settingsHtml() : productsHtml(c);
  return `<div class="fb dw-workspace st-editor"><header class="fb-top dw-header"><a class="secondary fb-back" href="#sites/stores">${icon('left', 15)} Lojas</a>
      <div class="fb-title"><h1>${h(d.name)}</h1>${store.active ? badge('Aberta', 'green') : badge('Rascunho')}${sv.dirty ? badge('Alterações não salvas', 'blue') : ''}</div>
      <div class="fb-top-actions"><a class="secondary" href="${storeUrl(c, store)}${store.active ? '' : '?preview=1'}" target="_blank" rel="noopener">${icon('external', 14)} ${store.active ? 'Ver loja' : 'Prévia'}</a>
        <button class="secondary" data-st-publish="${store.active ? 'off' : 'on'}">${store.active ? 'Fechar loja' : 'Abrir loja'}</button><button class="primary" data-st-save${sv.dirty ? '' : ' disabled'}>Salvar</button></div></header>
    ${checklist(c, store)}
    <nav class="fb-sections" aria-label="Seções da loja">${[['products', `Produtos (${d.items.length})`], ['orders', `Pedidos${pending ? ` (${pending} pendente${pending > 1 ? 's' : ''})` : ''}`], ['settings', 'Configurações']].map(([id, label]) => `<button class="${sv.section === id ? 'selected' : ''}" aria-current="${sv.section === id ? 'page' : 'false'}" data-st-section="${id}">${label}</button>`).join('')}</nav>
    <div class="st-body">${body}</div></div>`;
}

export function storeScreen(c) { return c.tab === 'store' ? storeView(c) : listView(c); }

/* ───────── Ações ───────── */

function dialog(title, body, label, onSubmit) {
  const overlay = document.getElementById('overlay');
  overlay.innerHTML = `<dialog id="dialog" class="site-dialog fm-dialog" aria-labelledby="st-title"><header><div><h2 id="st-title">${h(title)}</h2></div><button class="icon-btn" type="button" aria-label="Fechar" data-st-close>${icon('close', 17)}</button></header>
    <form><div class="modal-body">${body}<p class="form-status" role="alert"></p></div><footer><button type="button" class="secondary" data-st-close>Cancelar</button><button class="primary">${h(label)}</button></footer></form></dialog>`;
  const el = document.getElementById('dialog');
  el.showModal(); el.querySelector('input,textarea')?.focus();
  el.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const status = el.querySelector('.form-status'), button = el.querySelector('button.primary');
    button.disabled = true; status.textContent = '';
    try { await onSubmit(Object.fromEntries(new FormData(event.target))); close(); } catch (error) { status.textContent = error.message; button.disabled = false; }
  });
}
const close = () => { const overlay = document.getElementById('overlay'); overlay.querySelector('dialog')?.close(); overlay.innerHTML = ''; };
function setPath(target, path, value) { const keys = path.split('.'); let node = target; for (const key of keys.slice(0, -1)) node = node[key]; node[keys.at(-1)] = value; }

export function installStores(environment) {
  env = environment;
  const { c, mutate, flash, render } = env;
  const inStore = () => c.view === 'sites' && c.tab === 'store';
  const current = () => c.s.stores.find(row => row.id === sv.id);
  const touch = () => {
    if (sv.dirty) return;
    sv.dirty = true;
    const save = document.querySelector('[data-st-save]'); if (save) save.disabled = false;
    document.querySelector('.st-editor .fb-title')?.insertAdjacentHTML('beforeend', badge('Alterações não salvas', 'blue'));
  };
  const save = async (extra = {}) => { await mutate({ type: 'save', key: 'stores', id: sv.id, data: { ...sv.draft, ...extra } }); sv.dirty = false; sv.rev = ''; };

  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-st-close],[data-st-new],[data-st-section],[data-st-remove],[data-st-new-product],[data-st-open],[data-st-save],[data-st-publish],[data-st-delete]');
    if (!target || !(c.view === 'sites' || target.closest('#overlay'))) return;
    const d = target.dataset;
    try {
      if ('stClose' in d) { close(); return; }
      if ('stNew' in d) {
        dialog('Nova loja', `<label>Nome<input name="name" required maxlength="80" placeholder="Ex. Loja La Vaca"></label><label>Descrição<textarea name="description" rows="2" maxlength="400"></textarea></label>`, 'Criar loja', async data => {
          const id = await mutate({ type: 'save', key: 'stores', data: { name: data.name, description: data.description, active: false, items: [], shipping: { mode: 'flat', flat: 0, pickup: true }, payment: { method: 'Pix', instructions: '' } } });
          sv.id = ''; location.hash = `#sites/store/${id}`; flash('Loja criada. Adicione os produtos.');
        });
        return;
      }
      if (!inStore()) return;
      if (d.stSection) { sv.section = d.stSection; sv.open = ''; render(); return; }
      if (d.stRemove) { sv.draft.items.splice(Number(d.stRemove), 1); sv.dirty = true; render(); return; }
      if ('stNewProduct' in d) {
        dialog('Novo produto', `<label>Nome<input name="name" required maxlength="120"></label><label>Preço (R$)<input name="price" type="number" min="0" step="0.01" required></label><label>Descrição<textarea name="description" rows="3" maxlength="2000"></textarea></label><p class="dim">O produto também aparece em Pagamentos → Produtos.</p>`, 'Criar e adicionar', async data => {
          const id = await mutate({ type: 'save', key: 'products', data: { name: data.name, price: Number(data.price), description: data.description, kind: 'One time', active: true } });
          sv.draft.items.push({ productId: id, slug: '', imageUrl: '', stock: null, category: '', hidden: false }); sv.dirty = true; render(); flash('Produto criado. Salve a loja para publicar.');
        });
        return;
      }
      if (d.stOpen) { sv.open = sv.open === d.stOpen ? '' : d.stOpen; render(); return; }
      if ('stSave' in d) { target.disabled = true; await save(); render(); flash('Loja salva.'); return; }
      if (d.stPublish) { target.disabled = true; await save({ active: d.stPublish === 'on' }); render(); flash(d.stPublish === 'on' ? 'Loja aberta.' : 'Loja fechada.'); return; }
      if ('stDelete' in d) {
        const store = current();
        dialog('Excluir loja?', `<p>“${h(store.name)}” sai do ar. Os pedidos e as faturas continuam em Pagamentos. Isso não pode ser desfeito.</p>`, 'Excluir', async () => { await mutate({ type: 'delete', key: 'stores', id: store.id }); sv.id = ''; location.hash = '#sites/stores'; flash('Loja excluída.'); });
      }
    } catch (error) { flash(error.message, true); render(); }
  });

  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-st-order]');
    if (!form || !inStore()) return;
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    try { await mutate({ type: 'save', key: 'orders', id: form.dataset.stOrder, data }); render(); flash('Andamento salvo.'); }
    catch (error) { flash(error.message, true); }
  });

  document.addEventListener('change', event => {
    const el = event.target;
    if (!inStore() || !sv.draft) return;
    if (el.matches('[data-st-status]')) { sv.status = el.value; sv.open = ''; render(); return; }
    if (el.matches('[data-st-pick]') && el.value) { sv.draft.items.push({ productId: el.value, slug: '', imageUrl: '', stock: null, category: '', hidden: false }); sv.dirty = true; render(); }
  });

  document.addEventListener('input', event => {
    const el = event.target;
    if (!inStore() || !sv.draft) return;
    if (el.dataset.stItem !== undefined) {
      const item = sv.draft.items[Number(el.dataset.stItem)], key = el.dataset.key;
      item[key] = el.type === 'checkbox' ? el.checked : key === 'stock' ? (el.value === '' ? null : Number(el.value)) : el.value;
      touch(); return;
    }
    if (!el.dataset.stSet) return;
    const key = el.dataset.stSet;
    const value = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : key === 'addTags' ? el.value.split(',').map(tag => tag.trim()).filter(Boolean) : el.value;
    setPath(sv.draft, key, value);
    if (key === 'color') el.nextElementSibling.textContent = el.value;
    if (key === 'name') document.querySelector('.st-editor .fb-title h1').textContent = el.value;
    touch();
    if (key === 'shipping.mode' || key === 'shipping.pickup') { render(); document.querySelector(`[data-st-set="${key}"]${el.type === 'radio' ? `[value="${el.value}"]` : ''}`)?.focus(); }
  });

  let last = location.hash;
  addEventListener('hashchange', async () => {
    const was = last, to = location.hash; last = to;
    if (!sv.dirty || !was.startsWith(`#sites/store/${sv.id}`) || location.hash.startsWith(`#sites/store/${sv.id}`)) return;
    last = was; history.replaceState(null, '', was); dispatchEvent(new HashChangeEvent('hashchange'));
    if (!await ask('Descartar as alterações não salvas desta loja?', { ok: 'Descartar', cancel: 'Continuar editando' })) return;
    sv.dirty = false; sv.rev = ''; sv.id = ''; location.hash = to;
  }, true);
}
