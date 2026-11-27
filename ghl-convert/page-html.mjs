// Limpa o HTML renderizado de uma página do GHL para virar página de um site da Graao:
// tira scripts, comentários e estado do Nuxt, corta o CSS que a página não usa, troca formulários, pesquisas e agendas
// pelos blocos da Graao (data-graao-embed) e reescreve os links entre páginas do mesmo site.

const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;

// Fim do elemento que abre em `start` (o índice do "<"), contando as tags com o mesmo nome.
export function elementEnd(html, start) {
  const open = /^<([a-z][\w-]*)/i.exec(html.slice(start, start + 40));
  if (!open) return -1;
  const name = open[1].toLowerCase();
  if (VOID.test(name)) return html.indexOf('>', start) + 1;
  const tag = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, 'gi');
  tag.lastIndex = start;
  let depth = 0;
  for (let m; (m = tag.exec(html));) {
    if (m[1]) depth--;
    else if (!m[2]) depth++;
    if (depth === 0) return tag.lastIndex;
  }
  return -1;
}

// Troca o elemento com este id pelo HTML dado. Devolve o HTML novo (igual se o id não existir).
export function replaceElement(html, id, replacement) {
  const at = html.search(new RegExp(`<[a-z][\\w-]*\\b[^>]*\\sid="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i'));
  if (at < 0) return html;
  const end = elementEnd(html, at);
  return end < 0 ? html : html.slice(0, at) + replacement + html.slice(end);
}

/* ───────── CSS ───────── */

// Quebra um CSS em blocos de primeiro nível: { prelude, body } (regras) ou { at } (at-rules sem bloco).
function blocks(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const brace = css.indexOf('{', i), semi = css.indexOf(';', i);
    if (brace < 0) break;
    if (semi >= 0 && semi < brace && css.slice(i, semi).trim().startsWith('@')) { out.push({ at: css.slice(i, semi + 1).trim() }); i = semi + 1; continue; }
    let depth = 0, j = brace;
    for (; j < css.length; j++) { if (css[j] === '{') depth++; else if (css[j] === '}' && --depth === 0) break; }
    out.push({ prelude: css.slice(i, brace).trim(), body: css.slice(brace + 1, j) });
    i = j + 1;
  }
  return out;
}

// Um seletor serve à página quando todas as classes e ids dele aparecem no HTML.
function selectorUsed(selector, used) {
  const names = selector.replace(/:not\([^)]*\)/g, '').replace(/::?[\w-]+(\([^)]*\))?/g, '').match(/[.#]-?[_a-zA-Z][\w-]*/g) || [];
  return names.every(name => used.has(name));
}

export function pruneCss(css, used) {
  const keep = [];
  for (const block of blocks(css)) {
    if (block.at) { if (!/^@(charset|import)/i.test(block.at)) keep.push(block.at); continue; }
    const { prelude, body } = block;
    if (/^@(media|supports|container)/i.test(prelude)) {
      const inner = pruneCss(body, used);
      if (inner) keep.push(`${prelude}{${inner}}`);
    } else if (/^@(font-face|keyframes|-webkit-keyframes|page|property)/i.test(prelude)) {
      if (/^@font-face/i.test(prelude) && /Font Awesome/i.test(body) && !used.has('.fa')) continue;
      keep.push(`${prelude}{${body}}`);
    } else if (prelude.startsWith('@')) {
      keep.push(`${prelude}{${body}}`);
    } else {
      const selectors = prelude.split(',').map(s => s.trim()).filter(s => selectorUsed(s, used));
      if (selectors.length) keep.push(`${selectors.join(',')}{${body.trim()}}`);
    }
  }
  return keep.join('');
}

const minifyCss = css => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};:,>])\s*/g, '$1').replace(/;}/g, '}').trim();

/* ───────── Página ───────── */

const esc = value => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
export const embed = (kind, id, label) => `<div data-graao-embed="${kind}" data-id="${esc(id)}" style="min-height:120px"><span>${esc(label)}</span></div>`;

// Troca o conteúdo do primeiro elemento (dentro de `segment`) cuja tag de abertura casa com `open`.
function replaceInner(segment, open, inner) {
  const m = open.exec(segment);
  if (!m) return segment;
  const end = elementEnd(segment, m.index);
  if (end < 0) return segment;
  const close = segment.lastIndexOf('</', end - 1);
  return segment.slice(0, m.index + m[0].length) + inner + segment.slice(close);
}

/**
 * A prévia do GHL sai com os valores personalizados já trocados (e vazios, numa subconta modelo). `fills` devolve os
 * marcadores {{ custom_values.x }} aos elementos: { id, text, buttonText, href, img }.
 */
export function restoreFills(body, fills = []) {
  for (const fill of fills) {
    const at = body.search(new RegExp(`<[a-z][\\w-]*\\b[^>]*\\sid="${fill.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'i'));
    if (at < 0) continue;
    const end = elementEnd(body, at);
    if (end < 0) continue;
    let part = body.slice(at, end);
    if (fill.text) part = replaceInner(part, /<div\b[^>]*\sclass="[^"]*\btext-output\b[^"]*"[^>]*>/i, `<div>${fill.text}</div>`);
    if (fill.buttonText) part = replaceInner(part, /<(?:span|div)\b[^>]*\sclass="main-heading-button"[^>]*>/i, fill.buttonText);
    if (fill.href) part = part.replace(/(<a\b[^>]*\shref=")[^"]*(")/i, `$1${esc(fill.href)}$2`);
    if (fill.img) part = part.replace(/<img\b([^>]*?)\ssrc(?:="[^"]*")?(?=[\s>/])/i, `<img$1 src="${esc(fill.img)}"`);
    body = body.slice(0, at) + part + body.slice(end);
  }
  return body;
}

/**
 * html: a página renderizada pelo GHL. elements: [{ id, kind: 'form'|'survey'|'booking'|'video', ref, label, url }].
 * links: Map do caminho da página no GHL (/servico-1) para o endereço na Graao (servico-1, ou ../site/pagina).
 */
/**
 * Imagens de fundo que o GHL aplicava por script: { id, url, opacity, options } viram CSS. A imagem fica num ::before
 * atrás do conteúdo, com a opacidade do GHL sobre a cor de fundo do bloco. Um marcador {{ custom_values.x }} na url é
 * preenchido quando a página é servida.
 */
export function backgroundCss(backgrounds = [], body = '') {
  const position = options => /top/.test(options || '') ? 'center top' : /bottom/.test(options || '') ? 'center bottom' : 'center';
  return backgrounds.filter(bg => body.includes(`id="${bg.id}"`) && !/["\\<>()]/.test(bg.url)).map(bg => {
    const opacity = Number.isFinite(Number(bg.opacity)) && String(bg.opacity).trim() !== '' ? Math.min(1, Math.max(0, Number(bg.opacity))) : 1;
    const size = /repeat|tile/.test(bg.options || '') ? 'auto' : 'cover';
    return `#${bg.id}{position:relative;isolation:isolate}#${bg.id}::before{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;`
      + `background:url("${bg.url}") ${position(bg.options)}/${size} ${size === 'auto' ? 'repeat' : 'no-repeat'};opacity:${opacity}}`;
  }).join('');
}

export function cleanPage(html, { title = '', elements = [], fills = [], links = new Map(), lang = 'pt-BR', backgrounds = [] } = {}) {
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] || '';
  let body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html)?.[1] || html;
  body = body.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  body = restoreFills(body, fills);
  // As animações de entrada começam invisíveis e dependem do script do GHL, que não vem junto.
  body = body.replace(/(\sstyle="[^"]*?)opacity:\s*0(?:\.0+)?(?![.\d])\s*;?/gi, '$1');
  for (const el of elements) {
    const replacement = el.kind === 'video'
      ? `<div data-graao-embed="video" data-src="${esc(el.url || '')}" style="min-height:120px"><span>${esc(el.url ? el.label || 'Vídeo' : 'Vídeo: cole o link no painel Design')}</span></div>`
      : embed(el.kind === 'survey' ? 'form' : el.kind, el.ref, el.label);
    body = replaceElement(body, el.id, replacement);
  }
  // Links entre páginas do mesmo site.
  body = body.replace(/\shref="([^"#?]*)([^"]*)"/g, (all, path, rest) => links.has(path) ? ` href="${links.get(path)}${rest}"` : all);
  body = body.replace(/\s(?:data-v-[\w]+|data-animation-class|is-preview="[^"]*")(?:="[^"]*")?/g, '').replace(/\n\s*\n/g, '\n');
  const used = new Set();
  for (const m of body.matchAll(/\sclass="([^"]*)"/g)) for (const name of m[1].split(/\s+/)) if (name) used.add(`.${name}`);
  for (const m of body.matchAll(/\sid="([^"]*)"/g)) used.add(`#${m[1]}`);
  // Cada <style> do GHL vira um só. O GHL tem content:'\' (string sem fim): no <style> dele o estrago para ali, no nosso
  // engoliria todas as regras seguintes, então a string vira vazia.
  const css = [...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi), ...body.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map(m => m[1].replace(/(content\s*:\s*)(['"])\\\2/g, '$1$2$2')).join('\n')
    // Os ícones (Font Awesome 5) vêm do CDN do GHL; as páginas da Graao só carregam fontes do Google e do cdnjs.
    .replace(/https:\/\/stcdn\.leadconnectorhq\.com\/funnel\/fontawesome\/webfonts\//g, 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/webfonts/');
  body = body.replace(/<style\b[\s\S]*?<\/style>/gi, '');
  const fonts = [...head.matchAll(/<link\b[^>]*href="(https:\/\/fonts\.googleapis\.com\/[^"]+)"[^>]*>/gi)].map(m => m[1].replace(/&amp;/g, '&'));
  const style = minifyCss(pruneCss(minifyCss(css), used)) + backgroundCss(backgrounds, body);
  return `<!doctype html>\n<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>\n`
    + [...new Set(fonts)].map(href => `<link rel="stylesheet" href="${esc(href)}">`).join('\n')
    + `\n<style>${style}</style></head><body>${body.trim()}</body></html>`;
}

/** Endereços http(s) de imagens num HTML ou CSS: src, srcset e url(...). Sem repetição, na ordem em que aparecem. */
export function imageUrls(value) {
  const text = String(value || '');
  const found = [];
  const add = url => { url = url.trim().replace(/&amp;/g, '&'); if (/^https?:\/\//i.test(url) && !found.includes(url)) found.push(url); };
  for (const m of text.matchAll(/\ssrc="([^"]+)"/gi)) add(m[1]);
  for (const m of text.matchAll(/\ssrcset="([^"]+)"/gi)) for (const part of m[1].split(',')) add(part.trim().split(/\s+/)[0]);
  for (const m of text.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) add(m[2]);
  return found;
}

/** Troca endereços (chaves do map) pelos novos, numa string ou em qualquer objeto (devolve uma cópia). */
export function replaceUrls(value, map) {
  if (typeof value === 'string') { let out = value; for (const [from, to] of map) if (out.includes(from)) out = out.split(from).join(to); return out; }
  if (Array.isArray(value)) return value.map(item => replaceUrls(item, map));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceUrls(item, map)]));
  return value;
}
