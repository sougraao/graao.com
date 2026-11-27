// Kit compartilhado dos modelos de site: cabeçalho do documento, animações e peças comuns.
// As páginas da graao rodam sem JavaScript (a CSP bloqueia scripts), então todo movimento é CSS:
// revelar ao rolar e parallax usam animation-timeline (navegadores que não suportam mostram o
// conteúdo parado), letreiros e Ken Burns usam keyframes, e menu e perguntas usam checkbox/details.

export const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// Foto do Unsplash (licença gratuita) no tamanho pedido.
export const img = (id, w = 1600) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

// Vídeos gratuitos do Pexels usados como fundo.
export const videos = {
  casaClara: 'https://videos.pexels.com/video-files/7578552/7578552-uhd_2560_1440_30fps.mp4',
  ambiente: 'https://videos.pexels.com/video-files/3773486/3773486-hd_1920_1080_30fps.mp4',
  mar: 'https://videos.pexels.com/video-files/1918465/1918465-hd_1920_1080_24fps.mp4'
};

export const video = (src, poster, cls = 'bgv') => `<video class="${cls}" autoplay muted loop playsinline preload="metadata" poster="${poster}"><source src="${src}" type="video/mp4"></video>`;

// Animações reutilizáveis. Classes:
// .ld (entra ao carregar, atraso em --d) · .rv / .rv-l / .rv-r / .rv-s (revela ao rolar) · .clip (imagem abre de baixo)
// .par (parallax dentro de um contêiner com overflow) · .kb (Ken Burns) · .mq > .mq-t (letreiro infinito)
// .count (número que sobe até --to) · .stack > * (cartões que empilham) · .hz (zoom da imagem no hover)
// .prog (barra de progresso da leitura) · .hdr (cabeçalho que encolhe ao rolar)
export const motionCss = `
@property --n{syntax:'<integer>';inherits:false;initial-value:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;overflow-x:clip;-webkit-font-smoothing:antialiased}
img,video{display:block;max-width:100%}
a{color:inherit}
.count{--n:var(--to);counter-reset:n var(--n)}
.count::after{content:counter(n) var(--suf,'')}
.mq{overflow:hidden;-webkit-mask:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);mask:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.mq-t{display:flex;width:max-content;gap:var(--mq-gap,48px)}
.hz{overflow:hidden}.hz img{transition:transform .9s cubic-bezier(.2,.7,.2,1)}.hz:hover img{transform:scale(1.06)}
.bgv{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.nav-t{position:absolute;opacity:0;pointer-events:none}
details summary{cursor:pointer;list-style:none}details summary::-webkit-details-marker{display:none}
.prog{position:fixed;top:0;left:0;right:0;height:3px;transform-origin:0 50%;transform:scaleX(0);z-index:100;background:var(--accent,#111)}
.ln{display:block;overflow:hidden;padding-bottom:.08em;margin-bottom:-.08em}.ln>span{display:inline-block}
.lift{transition:transform .5s cubic-bezier(.16,1,.3,1),box-shadow .5s}.lift:hover{transform:translateY(-2px)}
.ph-zoom{overflow:hidden}.ph-zoom img{transition:transform 1.2s cubic-bezier(.16,1,.3,1)}.ph-zoom:hover img,a:hover .ph-zoom img{transform:scale(1.03)}
.ul{background:linear-gradient(currentColor,currentColor) 0 100%/0 1px no-repeat;text-decoration:none;transition:background-size .45s cubic-bezier(.16,1,.3,1)}.ul:hover{background-size:100% 1px}
/* Camada com JavaScript (motion.mjs, embutido pelo servidor): estados que o script liga. */
.cursor{position:fixed;left:0;top:0;z-index:999;pointer-events:none;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fff;mix-blend-mode:difference;opacity:0;display:grid;place-items:center;transition:width .4s cubic-bezier(.16,1,.3,1),height .4s cubic-bezier(.16,1,.3,1),margin .4s cubic-bezier(.16,1,.3,1),opacity .3s,background .3s}
.cursor.on{opacity:1}.cursor.link{width:44px;height:44px;margin:-22px 0 0 -22px}
.cursor.named{width:88px;height:88px;margin:-44px 0 0 -44px;mix-blend-mode:normal;background:var(--cursor,#111)}
.cursor span{font:500 13px/1 system-ui,sans-serif;color:#fff;opacity:0;transition:opacity .2s;white-space:nowrap}.cursor.named span{opacity:1}
@media (pointer:fine){html[data-cursor-root].js,html[data-cursor-root].js a,html[data-cursor-root].js label,html[data-cursor-root].js button{cursor:none}}
[data-bar]{transition:transform .55s cubic-bezier(.16,1,.3,1),background .3s,box-shadow .3s}
[data-bar].away{transform:translateY(-110%)}
.js [data-split] .w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.12em;margin-bottom:-.12em}
.js [data-split] .w>span{display:inline-block}
.js .count::after{content:none}
[data-magnetic]{transition:transform .5s cubic-bezier(.16,1,.3,1)}
@media (prefers-reduced-motion:no-preference){
  .js [data-split] .w>span{transform:translateY(110%);transition:transform 1.1s cubic-bezier(.16,1,.3,1);transition-delay:calc(var(--i,0) * 40ms)}
  .js [data-split].is-in .w>span{transform:none}
  .js .count{animation:none}
  .no-tl .rv,.no-tl .rv-s{opacity:0;transform:translateY(28px);transition:opacity 1s,transform 1.1s cubic-bezier(.16,1,.3,1)}
  .no-tl .rv.is-in,.no-tl .rv-s.is-in{opacity:1;transform:none}
  .no-tl .clip{clip-path:inset(100% 0 0 0);transition:clip-path 1.3s cubic-bezier(.16,1,.3,1)}.no-tl .clip.is-in{clip-path:inset(0)}
  @keyframes ld{from{opacity:0;transform:translateY(22px);filter:blur(10px)}to{opacity:1;transform:none;filter:none}}
  @keyframes up{from{transform:translateY(108%)}to{transform:none}}
  @keyframes rv{from{opacity:0;transform:translateY(28px);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}
  .ln>span{animation:up 1.15s cubic-bezier(.16,1,.3,1) both;animation-delay:var(--d,0s)}
  @keyframes rvl{from{opacity:0;transform:translateX(-56px)}to{opacity:1;transform:none}}
  @keyframes rvr{from{opacity:0;transform:translateX(56px)}to{opacity:1;transform:none}}
  @keyframes rvs{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
  @keyframes clip{from{clip-path:inset(100% 0 0 0)}to{clip-path:inset(0 0 0 0)}}
  @keyframes par{from{transform:translateY(-8%) scale(1.16)}to{transform:translateY(8%) scale(1.16)}}
  @keyframes kb{from{transform:scale(1)}to{transform:scale(1.12) translate(-1.5%,-1.5%)}}
  @keyframes mq{to{transform:translateX(calc(-50% - var(--mq-gap,48px)/2))}}
  @keyframes cnt{from{--n:0}to{--n:var(--to)}}
  @keyframes prog{to{transform:scaleX(1)}}
  @keyframes hdr{to{padding-block:10px;background:var(--hdr-bg,rgba(255,255,255,.86));box-shadow:0 1px 0 var(--line,rgba(0,0,0,.08))}}
  .ld{animation:ld 1.1s cubic-bezier(.16,1,.3,1) both;animation-delay:var(--d,0s)}
  .kb{animation:kb 22s ease-in-out infinite alternate}
  .mq-t{animation:mq var(--mq-s,40s) linear infinite}.mq:hover .mq-t{animation-play-state:paused}
  @supports (animation-timeline:view()){
    .rv{animation:rv linear both;animation-timeline:view();animation-range:entry 0% entry 55%}
    .rv-l{animation:rvl linear both;animation-timeline:view();animation-range:entry 0% entry 55%}
    .rv-r{animation:rvr linear both;animation-timeline:view();animation-range:entry 0% entry 55%}
    .rv-s{animation:rvs linear both;animation-timeline:view();animation-range:entry 0% entry 60%}
    .clip{animation:clip linear both;animation-timeline:view();animation-range:entry 0% cover 35%}
    .par{animation:par linear both;animation-timeline:view();animation-range:cover}
    .count{animation:cnt linear both;animation-timeline:view();animation-range:entry 20% cover 45%}
    .prog{animation:prog linear both;animation-timeline:scroll(root)}
    .hdr{animation:hdr linear both;animation-timeline:scroll(root);animation-range:0 220px}
  }
}`;

// Avatar de depoimento com as iniciais do nome: depoimento de exemplo não usa o rosto de uma pessoa real.
export const initials = name => `<span class="ini" aria-hidden="true">${esc(String(name).split(/\s+/).filter(w => w.length > 1).map(w => w[0]).filter((_, i, all) => i === 0 || i === all.length - 1).join('').toUpperCase())}</span>`;

// Documento completo. `fonts` são famílias do Google Fonts no formato da API css2 (ex.: 'Inter:wght@400;600').
export function document({ title, description = '', fonts = [], css = '', body, lang = 'pt-BR', cursor = false }) {
  const families = fonts.map(f => `family=${f.replace(/ /g, '+')}`).join('&');
  return `<!doctype html>
<html lang="${lang}" data-motion${cursor ? ' data-cursor-root' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>${description ? `<meta name="description" content="${esc(description)}">` : ''}
${families ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${families}&display=swap">` : ''}
<style>${motionCss}
${css}</style></head>
<body><div class="prog" aria-hidden="true"></div>
${body}
</body></html>`;
}

// Formulário de contato que vira lead na graao (data-go-lead). `extra` acrescenta campos.
export function leadForm({ cls = 'form', title = '', text = '', button = 'Enviar', extra = '', note = 'Respondemos em até um dia útil. Seus dados ficam só com a gente.' } = {}) {
  return `<form data-go-lead class="${cls}">${title ? `<h3>${title}</h3>` : ''}${text ? `<p>${text}</p>` : ''}
<label>Nome<input name="name" required autocomplete="name" placeholder="Seu nome"></label>
<label>E-mail<input name="email" type="email" required autocomplete="email" placeholder="voce@email.com"></label>
<label>WhatsApp<input name="phone" type="tel" autocomplete="tel" placeholder="(11) 90000-0000"></label>${extra}
<button type="submit">${button}</button><small>${note}</small></form>`;
}

// Menu de navegação com versão móvel sem JavaScript (checkbox + label).
export function nav({ brand, links, cta, ctaHref = 'page:contato', cls = 'hdr' }) {
  const items = links.map(([label, href]) => `<a href="${href}">${label}</a>`).join('');
  return `<header class="${cls}"><a class="brand" href="page:index">${esc(brand)}</a>
<input type="checkbox" id="nav-t" class="nav-t" aria-label="Abrir menu"><label for="nav-t" class="burger" aria-hidden="true"><span></span><span></span></label>
<nav class="menu">${items}${cta ? `<a class="cta" href="${ctaHref}">${cta}</a>` : ''}</nav></header>`;
}

// CSS base do menu (cores vêm das variáveis de cada modelo).
export const navCss = `
.hdr{position:sticky;top:0;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px clamp(16px,4vw,48px);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.hdr .brand{font-weight:700;text-decoration:none;font-size:20px;letter-spacing:-.01em}
.menu{display:flex;align-items:center;gap:clamp(14px,2.4vw,32px)}
.menu a{text-decoration:none;font-size:15px;opacity:.82;transition:opacity .2s}
.menu a:hover{opacity:1}
.menu .cta{opacity:1;padding:10px 18px;border-radius:999px;background:var(--accent);color:var(--on-accent,#fff);font-weight:600}
.burger{display:none;width:40px;height:40px;border-radius:50%;place-items:center;align-content:center;gap:6px;cursor:pointer;border:1px solid var(--line)}
.burger span{display:block;width:16px;height:1.5px;background:currentColor;transition:transform .3s}
@media (max-width:820px){
  .burger{display:grid}
  .menu{position:fixed;inset:64px 12px auto 12px;flex-direction:column;align-items:stretch;gap:4px;padding:12px;border-radius:18px;background:var(--surface);box-shadow:0 20px 60px rgba(0,0,0,.18);opacity:0;visibility:hidden;transform:translateY(-8px);transition:.25s}
  .menu a{padding:12px 14px;font-size:17px}
  .menu .cta{text-align:center;margin-top:6px}
  .nav-t:checked ~ .menu{opacity:1;visibility:visible;transform:none}
  .nav-t:checked + .burger span:first-child{transform:translateY(3.75px) rotate(45deg)}
  .nav-t:checked + .burger span:last-child{transform:translateY(-3.75px) rotate(-45deg)}
}`;

// CSS base do formulário.
export const formCss = `
.form{display:grid;gap:14px}
.form h3{margin:0;font-size:24px}.form p{margin:0;opacity:.75}
.form label{display:grid;gap:6px;font-size:13px;font-weight:600;letter-spacing:.02em}
.form input,.form textarea,.form select{font:inherit;font-weight:400;padding:14px 16px;border-radius:12px;border:1px solid var(--line);background:var(--field,transparent);color:inherit;outline:none;transition:border-color .2s}
.form input:focus,.form textarea:focus,.form select:focus{border-color:var(--accent)}
.form button{font:inherit;font-weight:600;padding:15px 22px;border:0;border-radius:999px;background:var(--accent);color:var(--on-accent,#fff);cursor:pointer;transition:transform .2s,filter .2s}
.form button:hover{transform:translateY(-2px);filter:brightness(1.08)}
.form small{opacity:.6;font-size:12px}`;

// Página de obrigado no estilo do modelo (usada quando o modelo vira funil).
export function thanks({ brand, fonts, css, headerHtml, footerHtml }) {
  return document({ title: `Obrigado · ${brand}`, fonts, css: `${css}
.thx{min-height:70vh;display:grid;place-content:center;text-align:center;gap:18px;padding:80px 20px}
.thx .ok{width:72px;height:72px;margin:0 auto;border-radius:50%;display:grid;place-items:center;font-size:30px;background:var(--accent);color:var(--on-accent,#fff)}
.thx h1{margin:0;font-size:clamp(36px,6vw,64px)}.thx p{margin:0 auto;max-width:520px;opacity:.75}
.thx a{justify-self:center}`, body: `${headerHtml}
<main class="thx"><div class="ok ld" aria-hidden="true">✓</div><h1 class="ld" style="--d:.1s">Recebemos seu contato!</h1>
<p class="ld" style="--d:.2s">Obrigado pelo interesse. Nossa equipe responde em breve pelo WhatsApp ou e-mail que você informou.</p>
<a class="btn ld" style="--d:.3s" href="page:index">Voltar para o início</a></main>
${footerHtml}` });
}
