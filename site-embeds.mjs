// Vídeo, formulário e agenda dentro das páginas publicadas. O HTML guardado só tem marcadores
// (<div data-graao-embed="video|form|booking">); o quadro é montado na hora de servir, com endereços conferidos,
// e a CSP da página libera só os players usados nela.
import { createHash } from 'node:crypto';
import { videoEmbed } from './course-model.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const unesc = value => String(value ?? '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/** A public video address as a player frame or a video file; null when it is neither. */
export function videoSource(address) {
  const known = videoEmbed(address);
  if (known) return { kind: 'frame', src: known };
  let url;
  try { url = new URL(String(address || '').trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const id = url.searchParams.get('v') || '';
  if (/^player-vz-[0-9a-f-]{6,40}\.tv\.pandavideo\.com\.br$/i.test(url.hostname) && url.pathname === '/embed/' && uuid.test(id)) return { kind: 'frame', src: `${url.origin}/embed/?v=${id}` };
  if (/\.(mp4|webm|m4v)$/i.test(url.pathname)) return { kind: 'file', src: url.href };
  return null;
}

const attr = (tag, name) => unesc(tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))?.slice(1).find(v => v !== undefined) || '').trim();
const frame = (src, title, extra) => `<iframe src="${esc(src)}" title="${title}" ${extra}></iframe>`;
const videoBox = 'style="display:block;width:100%;aspect-ratio:16/9;border:0;border-radius:inherit"';
const fitBox = 'data-graao-fit style="display:block;width:100%;min-height:420px;border:0"';

function framed(tag, { workspace, link, lazy }) {
  const kind = attr(tag, 'data-graao-embed').toLowerCase(), id = attr(tag, 'data-id');
  if (kind === 'video') {
    const video = videoSource(attr(tag, 'data-src'));
    if (!video) return '';
    if (video.kind === 'file') return `<video controls playsinline preload="metadata" ${videoBox} src="${esc(video.src)}"></video>`;
    // O YouTube recusa o player sem referência; a página em si continua sem mandar o endereço dela para fora.
    return frame(video.src, 'Vídeo', `${lazy ? 'loading="lazy" ' : ''}${videoBox} referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen`);
  }
  if (kind === 'form' && uuid.test(id)) return frame(`/form/${workspace}/${id}?embed=1`, 'Formulário', fitBox);
  if (kind === 'booking' && uuid.test(id)) return frame(`/agendar/${workspace}?${new URLSearchParams({ embed: '1', servico: id, ...(link && { link }) })}`, 'Agenda', fitBox);
  return '';
}

/** Fills the markers of a page. `link` is the booking link the visit brought (32 hex digits). */
export function renderEmbeds(html, { workspace, link = '' }) {
  if (!/data-graao-embed/i.test(html)) return html;
  const token = /^[0-9a-f]{32}$/.test(link) ? link : '';
  let videos = 0; // O primeiro vídeo e os formulários carregam com a página; os outros vídeos, ao chegar perto.
  const body = html.replace(/<div\b(?=[^>]*\sdata-graao-embed\s*=)(?:[^>"']|"[^"]*"|'[^']*')*>/gi, tag => {
    const lazy = attr(tag, 'data-graao-embed').toLowerCase() === 'video' && videos++ > 0;
    const inner = framed(tag, { workspace, link: token, lazy });
    return inner ? tag + inner : tag.replace(/>$/, ' data-graao-empty>');
  });
  const style = '<style>[data-graao-embed]>:not(iframe):not(video),[data-graao-empty]{display:none!important}[data-graao-embed]{border:0!important;background:none!important;min-height:0!important;padding:0!important}</style>';
  return /<\/head>/i.test(body) ? body.replace(/<\/head>/i, `${style}</head>`) : style + body;
}

// Ajusta a altura dos quadros de formulário e agenda. Cada quadro só fala da própria altura.
const fitSource = `(()=>{addEventListener('message',e=>{const h=Number(e.data&&(e.data.graaoHeight||e.data.height));if(!(h>0&&h<20000)||e.origin!==location.origin)return;for(const f of document.querySelectorAll('iframe[data-graao-fit]'))if(f.contentWindow===e.source)f.style.height=Math.ceil(h)+'px'})})()`;
const fitHash = `'sha256-${createHash('sha256').update(fitSource).digest('base64')}'`;

/** Adds a script hash to a policy that may already have a script-src. */
export function allowScript(csp, hash) {
  return /(^|;\s*)script-src\s/.test(csp) ? csp.replace(/(^|;\s*)script-src\s([^;]*)/, (_, a, v) => `${a}script-src ${v.replace(/'none'\s*/g, '')} ${hash}`) : `${csp}; script-src ${hash}`;
}

/** The policy and the script of a page with frames. Pages without them are untouched. */
export function withEmbeds(headers, html) {
  if (typeof html !== 'string' || !/<iframe\b/i.test(html)) return [headers, html];
  const hosts = new Set();
  for (const [, src] of html.matchAll(/<iframe src="([^"]+)"/gi)) hosts.add(src.startsWith('/') ? "'self'" : new URL(unesc(src)).origin);
  const csp = `${headers['Content-Security-Policy'] || ''}; frame-src ${[...hosts].sort().join(' ')}`;
  const tag = `<script>${fitSource}</script>`;
  const body = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, () => `${tag}</body>`) : html + tag;
  return [{ ...headers, 'Content-Security-Policy': allowScript(csp, fitHash) }, body];
}
