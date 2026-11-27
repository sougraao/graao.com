// Blocos prontos do menu "Inserir" do editor de sites.
// Só estilos em linha e relativos: o bloco herda a fonte e a cor do texto da página e se adapta ao celular sem
// media queries. Nada de altura de tela (vh), que cresce com o quadro do editor, e nada de script.
// Os textos são instruções para preencher, nunca depoimentos ou números inventados.

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

// Espaço reservado para foto: um quadro neutro, guardado na própria página até a pessoa trocar.
export const placeholderImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#d7dade"/><path d="M0 640 380 330l230 200 180-150 410 360v60H0z" fill="#bcc2c9"/><circle cx="880" cy="230" r="80" fill="#c9ced4"/></svg>')}`;

const line = 'border:1px solid color-mix(in srgb,currentColor 18%,transparent)';
const soft = 'background:color-mix(in srgb,currentColor 6%,transparent)';
const h2 = text => `<h2 style="margin:0;font-size:clamp(30px,4vw,56px);line-height:1.08">${text}</h2>`;
const p = text => `<p style="margin:0;max-width:620px;font-size:17px;line-height:1.6;opacity:.8">${text}</p>`;
const photo = (ratio = '4/3') => `<img src="${placeholderImage}" alt="" style="display:block;width:100%;aspect-ratio:${ratio};object-fit:cover;border-radius:16px">`;
const section = (body, { center = false } = {}) => `<section style="padding:clamp(56px,8vw,120px) 20px"><div style="display:grid;gap:32px;width:min(1200px,100%);margin:0 auto${center ? ';justify-items:center;text-align:center' : ''}">${body}</div></section>`;
const grid = (items, min = 260) => `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,${min}px),1fr));gap:24px;width:100%">${items.join('')}</div>`;
const times = (count, make) => Array.from({ length: count }, (_, index) => make(index + 1));

function button(text, { accent = '#111111', onAccent = '#ffffff', buttonClass = '' } = {}) {
  return buttonClass
    ? `<a class="${esc(buttonClass)}" href="#">${text}</a>`
    : `<a href="#" style="display:inline-block;width:max-content;max-width:100%;padding:14px 26px;border-radius:999px;background:${esc(accent)};color:${esc(onAccent)};font-weight:600;text-decoration:none">${text}</a>`;
}
function form({ accent = '#111111', onAccent = '#ffffff' } = {}) {
  const field = 'font:inherit;padding:13px 14px;border-radius:10px;background:transparent;color:inherit;width:100%;' + line;
  const label = (text, input) => `<label style="display:grid;gap:6px;font-size:14px">${text}${input}</label>`;
  return `<form data-go-lead style="display:grid;gap:14px;width:min(520px,100%);text-align:left">${label('Nome', `<input name="name" required autocomplete="name" style="${field}">`)}${label('E-mail', `<input name="email" type="email" required autocomplete="email" style="${field}">`)}${label('WhatsApp', `<input name="phone" type="tel" autocomplete="tel" style="${field}">`)}<button type="submit" style="font:inherit;font-weight:600;padding:14px 22px;border:0;border-radius:999px;background:${esc(accent)};color:${esc(onAccent)};cursor:pointer">Enviar</button></form>`;
}

// Vídeo, formulário e agenda: aqui só um marcador; o quadro é montado ao servir a página (site-embeds.mjs).
const embed = (kind, text, ratio = '') => `<div data-graao-embed="${kind}" style="display:grid;place-items:center;width:100%;min-height:220px;${ratio}padding:24px;border-radius:16px;text-align:center;${line};${soft}"><span style="opacity:.75">${text}</span></div>`;

// [id, nome, gerador]. Elementos entram junto do que está selecionado; seções entram entre as seções da página.
export const blockGroups = [
  ['Elementos', [
    ['h2', 'Título', () => '<h2>Novo título</h2>'],
    ['p', 'Parágrafo', () => '<p>Novo parágrafo</p>'],
    ['button', 'Botão', look => button('Novo botão', look)],
    ['image', 'Imagem', () => photo('3/2')],
    ['video', 'Vídeo', () => embed('video', 'Vídeo: cole o link no painel Design', 'aspect-ratio:16/9;')],
    ['form', 'Formulário simples', look => form(look)],
    ['graao-form', 'Formulário com perguntas', () => embed('form', 'Formulário: escolha no painel Design')],
    ['booking', 'Agenda', () => embed('booking', 'Agenda: escolha o serviço no painel Design')],
    ['divider', 'Divisor', () => '<hr style="width:100%;border:0;border-top:1px solid currentColor;opacity:.2;margin:24px 0">']
  ]],
  ['Seções', [
    ['section', 'Seção vazia', () => section(h2('Nova seção'))],
    ['split', 'Texto e foto', look => section(grid([`<div style="display:grid;gap:20px;align-content:center">${h2('O que você quer mostrar')}${p('Explique em duas ou três frases.')}<div>${button('Saiba mais', look)}</div></div>`, photo()], 320))],
    ['features', 'Três destaques', () => section(h2('Por que escolher a gente') + grid(times(3, n => `<div style="display:grid;gap:10px;padding:26px;border-radius:16px;${soft}"><h3 style="margin:0;font-size:21px">Destaque ${n}</h3><p style="margin:0;opacity:.8">Explique este ponto em uma frase.</p></div>`)))],
    ['numbers', 'Números', () => section(grid(times(3, n => `<div style="display:grid;gap:6px"><strong style="font-size:clamp(40px,5vw,72px);line-height:1">00</strong><span style="opacity:.75">Descreva o número ${n}</span></div>`), 200))],
    ['gallery', 'Galeria', () => section(h2('Galeria') + grid(times(3, () => photo('1/1')), 240))],
    ['quote', 'Depoimento', () => section(`<blockquote style="margin:0;font-size:clamp(24px,3vw,40px);line-height:1.25;max-width:900px">Cole aqui o que o seu cliente disse.</blockquote>${p('Nome do cliente')}`, { center: true })],
    ['faq', 'Perguntas', () => section(h2('Perguntas frequentes') + `<div>${times(3, n => `<details style="padding:18px 0;border-bottom:1px solid color-mix(in srgb,currentColor 18%,transparent)"${n === 1 ? ' open' : ''}><summary style="cursor:pointer;font-size:18px;font-weight:600">Pergunta ${n}</summary><p style="margin:12px 0 0;opacity:.8">Escreva aqui a resposta.</p></details>`).join('')}</div>`)],
    ['cta', 'Chamada', look => section(h2('Convide a pessoa a dar o próximo passo') + p('Diga o que acontece depois do clique.') + button('Falar com a gente', look), { center: true })],
    ['contact', 'Contato', look => section(grid([`<div style="display:grid;gap:18px;align-content:start">${h2('Fale com a gente')}${p('Diga em quanto tempo você responde.')}</div>`, form(look)], 320))]
  ]]
];

export const sectionBlocks = blockGroups[1][1].map(([id]) => id);

export function blockHtml(id, look = {}) {
  const block = blockGroups.flatMap(([, items]) => items).find(item => item[0] === id);
  return block ? block[2](look) : '';
}

// Endereços que um link ou uma foto pode ter; devolve '' para o que não é aceito (javascript:, data:, http em foto).
export function cleanLink(value) {
  const text = String(value || '').trim();
  if (/^(https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:[+\d\s().-]+|page:[a-z0-9-]+(#[\w-]*)?|#[\w-]*)$/i.test(text)) return text;
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/[^\s"'<>]*)?$/i.test(text) ? `https://${text}` : '';
}
// Vídeos que a página sabe mostrar: YouTube, Vimeo, Loom, Panda Video ou um arquivo de vídeo em https.
export function cleanVideo(value) {
  const text = String(value || '').trim();
  let url;
  try { url = new URL(text); } catch { return ''; }
  if (url.protocol !== 'https:') return '';
  const known = /^(?:(?:www\.|m\.)?youtube\.com|youtu\.be|(?:www\.)?vimeo\.com|(?:www\.)?loom\.com|player-vz-[0-9a-f-]+\.tv\.pandavideo\.com\.br)$/i.test(url.hostname);
  return known || /\.(mp4|webm|m4v)$/i.test(url.pathname) ? text : '';
}
export const cleanImage = value => (/^https:\/\/[^\s"'<>]+$/i.test(String(value || '').trim()) ? String(value).trim() : '');
