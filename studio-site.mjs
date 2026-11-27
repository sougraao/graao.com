// AI Studio sites: real HTML pages kept in their own store row (`studio-<projectId>`),
// so the workspace state only carries project metadata.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';
import { allowScript, renderEmbeds, withEmbeds } from './site-embeds.mjs';
import { siteMotion } from './site-templates/motion.mjs';

// versionChars: the HTML the old versions may hold together (they keep only the pages that changed after them).
export const SITE_LIMITS = { pages: 50, html: 400000, versions: 12, versionChars: 4_000_000 };
export const siteRowId = projectId => `studio-${projectId}`;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const now = () => new Date().toISOString();
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export function slugify(name, taken = []) {
  const base = String(name || 'page').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'page';
  let slug = base, n = 2;
  while (taken.includes(slug) || slug === 'lead') slug = `${base}-${n++}`;
  return slug;
}

// Defence in depth only: every page is also served with a CSP that blocks all scripts.
// Frames of video, form and calendar are markers here and are built when the page is served (site-embeds.mjs).
const blocked = 'script|iframe|frame|frameset|object|embed|applet|base|noscript|template|portal';
export function sanitizeHtml(input) {
  if (typeof input !== 'string' || !input.trim()) fail('The page is empty.');
  if (input.length > SITE_LIMITS.html) fail(`A page can have up to ${SITE_LIMITS.html.toLocaleString('en-US')} characters of HTML.`);
  let html = input
    .replace(new RegExp(`<(${blocked})\\b[\\s\\S]*?<\\/\\1\\s*>`, 'gi'), '')
    .replace(new RegExp(`<\\/?(${blocked})\\b[^>]*>`, 'gi'), '')
    .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, '')
    .replace(/<link\b[^>]*>/gi, tag => /href\s*=\s*["']https:\/\/fonts\.googleapis\.com\//i.test(tag) && /rel\s*=\s*["']?stylesheet/i.test(tag) ? tag : '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:srcdoc|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:data-go-(?:ready|hover|selected)|contenteditable)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=[\s>/])/gi, '')
    .replace(/\b(href|src|action|xlink:href|srcset|poster)\s*=\s*(["']?)\s*(?:javascript|vbscript|data:text\/html)[^"'>\s]*\2/gi, '$1="#"');
  if (!/^\s*<!doctype html/i.test(html)) html = `<!doctype html>\n${html}`;
  return html;
}

const palette = { indigo: ['#4f46e5', '#eef0ff'], forest: ['#13795b', '#e7f5ee'], amber: ['#b45309', '#fff4dc'], rose: ['#be185d', '#fcebf0'] };
// Page built from the structured fields (local template mode and projects created before HTML pages existed).
export function pageFromStructure(project, pageName = '') {
  const [accent, tint] = palette[project.theme] || palette.indigo;
  const blocks = (project.blocks || []).map(b => `<article><h3>${esc(b.title)}</h3>${b.body ? `<p>${esc(b.body)}</p>` : '<p>[[Write this section]]</p>'}</article>`).join('');
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(pageName || project.name)}</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#172036;background:#fbfbfd;line-height:1.55}
header{display:flex;justify-content:space-between;align-items:center;padding:18px clamp(16px,5vw,64px);background:#fff;border-bottom:1px solid #e6e8f0}
header b{font-size:18px}header a{color:${accent};font-weight:600;text-decoration:none}
.hero{padding:clamp(56px,10vw,120px) clamp(16px,5vw,64px);background:${tint};text-align:center}
.hero h1{font-size:clamp(32px,6vw,58px);line-height:1.08;letter-spacing:-.03em;margin:0 auto 16px;max-width:900px}
.hero p{max-width:640px;margin:0 auto;font-size:18px;color:#3b4660}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:18px;max-width:1100px;margin:56px auto;padding:0 16px}
.grid article{background:#fff;border:1px solid #e6e8f0;border-radius:14px;padding:22px}.grid h3{margin:0 0 8px}
.lead{max-width:560px;margin:0 auto 72px;padding:28px;background:#fff;border:1px solid #e6e8f0;border-radius:16px}
.lead h2{margin:0 0 14px}.lead label{display:grid;gap:6px;margin-bottom:12px;font-weight:600;font-size:14px}
.lead input{font:inherit;padding:11px 12px;border:1px solid #cdd3e0;border-radius:9px}
.lead button{font:inherit;font-weight:700;color:#fff;background:${accent};border:0;border-radius:9px;padding:12px 18px;cursor:pointer}
footer{text-align:center;padding:28px;color:#6b7590;font-size:14px}
</style></head>
<body><header><b>${esc(project.name)}</b><a href="#contato">Contato</a></header>
<section class="hero"><h1>${esc(pageName || project.headline || project.name)}</h1>${project.summary ? `<p>${esc(project.summary)}</p>` : ''}</section>
<section class="grid">${blocks}</section>
<section class="lead" id="contato"><h2>Fale com a gente</h2><form data-go-lead>
<label>Nome<input name="name" required autocomplete="name"></label><label>E-mail<input name="email" type="email" required autocomplete="email"></label>
<label>Telefone<input name="phone" type="tel" autocomplete="tel"></label><button>Enviar</button></form></section>
<footer>${esc(project.name)}</footer></body></html>`;
}

export function newSiteDoc({ workspace, project, pages }) {
  const doc = { profile: { name: `AI Studio ${project.id}` }, workspace, project: project.id, rev: 1, pages: [], versions: [], published: null };
  for (const page of pages) doc.pages.push({ id: randomUUID(), name: page.name, slug: slugify(page.slug || page.name, doc.pages.map(p => p.slug)), html: sanitizeHtml(page.html), updated: now() });
  doc.pages[0].slug = 'index';
  snapshot(doc, 'Created');
  return doc;
}
// Versions and the published copy share the HTML of the pages, so a site of many large pages is not stored many times.
// A page in a version without `html` has the HTML of the same page in the next newer version that has it, or else of the
// current page; a page of the published copy without `html` has the HTML of the current page. Before the HTML of a page
// changes or the page goes away, detach() writes the old HTML once where those copies look for it.
const pageCopy = ({ id, name, slug, seo }) => ({ id, name, slug, ...(seo && { seo }) });
const hasHtml = copy => typeof copy?.html === 'string';
function detach(doc, pageId) {
  const page = doc.pages.find(p => p.id === pageId);
  if (!page) return;
  for (let i = doc.versions.length - 1; i >= 0; i--) {
    const copy = doc.versions[i].pages.find(p => p.id === pageId);
    if (!copy) continue;
    if (!hasHtml(copy)) copy.html = page.html;
    break;
  }
  const live = doc.published?.pages?.find(p => p.id === pageId);
  if (live && !hasHtml(live)) live.html = page.html;
}
function versionHtml(doc, index, pageId) {
  for (let i = index; i < doc.versions.length; i++) {
    const copy = doc.versions[i].pages.find(p => p.id === pageId);
    if (hasHtml(copy)) return copy.html;
  }
  return doc.pages.find(p => p.id === pageId)?.html ?? '';
}
/** The pages of a version, with their HTML. */
export const versionPages = (doc, version) => { const index = doc.versions.indexOf(version); return version.pages.map(p => ({ ...p, html: versionHtml(doc, index, p.id) })); };
/** The published pages, with their HTML (none when the site is not published). */
export const publishedPages = doc => (doc.published?.pages || []).map(p => hasHtml(p) ? p : { ...p, html: doc.pages.find(page => page.id === p.id)?.html ?? '' });
function snapshot(doc, label) {
  doc.versions.push({ id: randomUUID(), at: now(), label: String(label || 'Saved').slice(0, 120), pages: doc.pages.map(pageCopy) });
  if (doc.versions.length > SITE_LIMITS.versions) doc.versions.splice(0, doc.versions.length - SITE_LIMITS.versions);
  const kept = () => doc.versions.reduce((n, v) => n + v.pages.reduce((m, p) => m + (hasHtml(p) ? p.html.length : 0), 0), 0);
  while (doc.versions.length > 1 && kept() > SITE_LIMITS.versionChars) doc.versions.shift();
  doc.rev = (doc.rev || 0) + 1;
}
export const findPage = (doc, pageId) => doc.pages.find(p => p.id === pageId) || fail('Page not found.', 404);

export function savePage(doc, pageId, html, label) {
  const page = findPage(doc, pageId);
  const clean = sanitizeHtml(html);
  if (clean !== page.html) detach(doc, page.id);
  page.html = clean; page.updated = now();
  snapshot(doc, label);
  return page.id;
}
export function addPage(doc, name, html) {
  if (doc.pages.length >= SITE_LIMITS.pages) fail(`A site can have up to ${SITE_LIMITS.pages} pages.`);
  const clean = String(name || '').trim().slice(0, 60) || fail('Page name is required.');
  const page = { id: randomUUID(), name: clean, slug: slugify(clean, doc.pages.map(p => p.slug).concat('index')), html: sanitizeHtml(html), updated: now() };
  doc.pages.push(page);
  snapshot(doc, `Added page ${clean}`);
  return page.id;
}
export function renamePage(doc, pageId, name) {
  const page = findPage(doc, pageId);
  page.name = String(name || '').trim().slice(0, 60) || fail('Page name is required.');
  snapshot(doc, `Renamed page to ${page.name}`);
  return page.id;
}
export function deletePage(doc, pageId) {
  const page = findPage(doc, pageId);
  if (page.slug === 'index') fail('The home page cannot be deleted.');
  detach(doc, pageId);
  doc.pages = doc.pages.filter(p => p.id !== pageId);
  snapshot(doc, `Deleted page ${page.name}`);
  return pageId;
}
export function duplicatePage(doc, pageId) {
  const page = findPage(doc, pageId);
  if (doc.pages.length >= SITE_LIMITS.pages) fail(`Um site pode ter até ${SITE_LIMITS.pages} páginas.`);
  const name = `${page.name} (cópia)`.slice(0, 60);
  const copy = { id: randomUUID(), name, slug: slugify(name, doc.pages.map(p => p.slug).concat('index')), html: page.html, ...(page.seo && { seo: { ...page.seo } }), updated: now() };
  doc.pages.splice(doc.pages.indexOf(page) + 1, 0, copy);
  snapshot(doc, `Duplicou a página ${page.name}`);
  return copy.id;
}

// The first page is always the home page (slug "index"); the others can change places.
export function movePage(doc, pageId, direction) {
  const page = findPage(doc, pageId);
  const from = doc.pages.indexOf(page);
  const to = from + (direction === 'up' ? -1 : 1);
  if (page.slug === 'index' || to < 1 || to >= doc.pages.length) fail('Esta página não pode ir para essa posição.');
  doc.pages.splice(to, 0, ...doc.pages.splice(from, 1));
  snapshot(doc, `Moveu a página ${page.name}`);
  return page.id;
}

export function setSlug(doc, pageId, value) {
  const page = findPage(doc, pageId);
  if (page.slug === 'index') fail('A primeira página fica no endereço principal e não tem caminho próprio.');
  const slug = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  if (!slug || slug === 'index' || slug === 'lead') fail('Use letras, números e hífens no caminho.');
  if (doc.pages.some(p => p.id !== page.id && p.slug === slug)) fail('Outra página já usa esse caminho.');
  const before = page.slug;
  if (before === slug) return page.id;
  const link = new RegExp(`(href\\s*=\\s*["'])page:${before}(["'])`, 'gi');
  for (const other of doc.pages) {
    const html = other.html.replace(link, `$1page:${slug}$2`);
    if (html !== other.html) { detach(doc, other.id); other.html = html; }
  }
  page.slug = slug;
  snapshot(doc, `Mudou o caminho de ${page.name} para /${slug}`);
  return page.id;
}

export function setSeo(doc, pageId, input) {
  const page = findPage(doc, pageId);
  const clean = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
  page.seo = { title: clean(input?.title, 70), description: clean(input?.description, 170) };
  snapshot(doc, `SEO de ${page.name}`);
  return page.id;
}

// Visit and opt-in counters per page. They live outside the page versions.
export function countVisit(doc, pageId, field) {
  doc.stats ||= {};
  doc.statsSince ||= now();
  const row = doc.stats[pageId] ||= { views: 0, optins: 0 };
  row[field] = (row[field] || 0) + 1;
  return row[field];
}
export function resetStats(doc) {
  doc.stats = {};
  doc.statsSince = now();
  return doc.statsSince;
}

export function thankYouPage(project) {
  const [accent, tint] = palette[project.theme] || palette.indigo;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Obrigado · ${esc(project.name)}</title>
<style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#172036;background:${tint};padding:24px}
main{max-width:560px;text-align:center;background:#fff;border:1px solid #e6e8f0;border-radius:18px;padding:clamp(28px,6vw,48px)}
.mark{width:56px;height:56px;margin:0 auto 18px;border-radius:50%;display:grid;place-items:center;background:${accent};color:#fff;font-size:28px;font-weight:700}
h1{margin:0 0 10px;font-size:clamp(26px,5vw,36px);letter-spacing:-.02em}p{margin:0 0 22px;color:#3b4660;line-height:1.55}a{color:${accent};font-weight:600}</style></head>
<body><main><div class="mark" aria-hidden="true">✓</div><h1>Recebemos seus dados!</h1><p>Obrigado pelo interesse em ${esc(project.name)}. Nossa equipe vai entrar em contato em breve.</p><a href="page:index">Voltar para o início</a></main></body></html>`;
}

// AI conversation of a project, newest last. `before` is the version to restore when the change is undone.
export function chatEntry(doc, { ask, reply, before = '', page = '' }) {
  doc.chat ||= [];
  const entry = { id: randomUUID(), at: now(), ask: String(ask).slice(0, 4000), reply: String(reply || '').slice(0, 4000), before, page: String(page).slice(0, 60) };
  doc.chat.push(entry);
  if (doc.chat.length > 60) doc.chat.splice(0, doc.chat.length - 60);
  return entry.id;
}

export function restoreVersion(doc, versionId) {
  const version = doc.versions.find(v => v.id === versionId) || fail('Version not found.', 404);
  const pages = versionPages(doc, version).map(p => ({ ...p, updated: now() }));
  for (const page of doc.pages) if (pages.find(p => p.id === page.id)?.html !== page.html) detach(doc, page.id);
  doc.pages = pages;
  snapshot(doc, `Restored “${version.label.slice(0, 90)}”`);
  return version.id;
}
export function publish(doc, on) {
  doc.published = on ? { at: now(), rev: doc.rev, pages: doc.pages.map(pageCopy) } : null;
  return doc.published?.at || '';
}
// What the browser needs: page HTML for the code editor, version labels without their copies.
// A large site sends only the HTML of the page on screen (`page`); the others come with their size and the editor asks for them.
const SEND_ALL_HTML = 1_500_000;
export const publicDoc = (doc, page = '') => ({
  rev: doc.rev, pages: doc.pages.reduce((n, p) => n + p.html.length, 0) <= SEND_ALL_HTML ? doc.pages
    : doc.pages.map((p, i) => p.id === page || (i === 0 && !doc.pages.some(other => other.id === page)) ? p : (({ html, ...rest }) => ({ ...rest, size: html.length }))(p)), chat: doc.chat || [], stats: doc.stats || {}, statsSince: doc.statsSince || '', published: doc.published ? { at: doc.published.at, rev: doc.published.rev, slugs: doc.published.pages.map(p => p.slug) } : null,
  versions: doc.versions.map(({ id, at, label }) => ({ id, at, label })).reverse()
});

// ---- Serving ----------------------------------------------------------------

const pageCsp = ancestors => `default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; img-src https: data:; media-src https:; form-action 'self'; base-uri 'none'; frame-ancestors ${ancestors}`;
export const previewHeaders = { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': pageCsp("'self'"), 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' };
// same-origin (not no-referrer) so the browser sends a real Origin header when the lead form posts back.
export const publicHeaders = { ...previewHeaders, 'Content-Security-Policy': pageCsp("'none'"), 'Referrer-Policy': 'same-origin' };

function withSeo(html, seo) {
  if (!seo?.title && !seo?.description) return html;
  let result = html;
  if (seo.title) result = /<title\b[^>]*>[\s\S]*?<\/title>/i.test(result) ? result.replace(/<title\b[^>]*>[\s\S]*?<\/title>/i, `<title>${esc(seo.title)}</title>`)
    : result.replace(/<head\b[^>]*>/i, m => `${m}<title>${esc(seo.title)}</title>`);
  if (seo.description) {
    result = result.replace(/<meta\b[^>]*name\s*=\s*["']description["'][^>]*>/gi, '');
    result = result.replace(/<head\b[^>]*>/i, m => `${m}<meta name="description" content="${esc(seo.description)}">`);
  }
  return result;
}

// Animações dos modelos de site: páginas com <html data-motion> recebem o script do kit (site-templates/motion.mjs)
// na hora de servir, e a CSP libera só esse texto exato pelo hash. O HTML guardado nunca tem script
// (o sanitizador remove), então uma página editada não consegue rodar nada além disso.
// O navegador troca \r\n por \n ao ler o HTML e só depois confere o hash: com o checkout do Windows
// (autocrlf) o código da função vem com \r\n, então normalizamos antes de calcular.
const motionSource = `(${siteMotion})();`.replace(/\r\n?/g, '\n');
const motionHash = `'sha256-${createHash('sha256').update(motionSource).digest('base64')}'`;
export function withMotion(headers, html) {
  if (typeof html !== 'string' || !/<html\b[^>]*\sdata-motion\b/i.test(html)) return [headers, html];
  const csp = String(headers['Content-Security-Policy'] || '');
  const script = allowScript(csp, motionHash);
  const tag = `<script>${motionSource}</script>`;
  const body = /<\/body>/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tag}</body>`) : html + tag;
  return [{ ...headers, 'Content-Security-Policy': script }, body];
}

export { withEmbeds };
// The custom values of the account, by key without the prefix: {{custom_values.company_name}} in a page shows the value.
export const siteValues = state => Object.fromEntries((state?.customValues || []).filter(row => String(row?.key || '').startsWith('custom_values.')).map(row => [row.key.slice(14), String(row.value ?? '')]));
const fillValues = (html, values) => html.replace(/\{\{\s*custom_values\.(\w+)\s*\}\}/g, (_, key) => esc(values[key] ?? '')).replace(/\{\{\s*right_now\.year\s*\}\}/g, String(new Date().getFullYear()));
export function renderPublic(page, { base, notice = '', workspace = '', link = '', values = {} }) {
  let html = fillValues(withSeo(workspace ? renderEmbeds(page.html, { workspace, link }) : page.html, page.seo), values)
    .replace(/(href\s*=\s*["'])page:([a-z0-9-]+)(#[\w-]*)?(["'])/gi, (_, a, slug, hash = '', b) => `${a}${slug === 'index' ? base : `${base}/${slug}`}${hash}${b}`)
    .replace(/<form\b([^>]*)>/gi, (_, attrs) => `<form${attrs.replace(/\s(?:action|method|target|enctype)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')} data-graao-lead action="${base}" method="post"><input type="hidden" name="_page" value="${esc(page.slug)}">`);
  if (notice) {
    const banner = `<div role="status" style="position:sticky;top:0;z-index:9999;padding:14px 18px;font:600 15px system-ui,sans-serif;text-align:center;${notice.ok ? 'background:#ecfdf3;color:#067647' : 'background:#fef3f2;color:#b42318'}">${esc(notice.text)}</div>`;
    html = /<body\b[^>]*>/i.test(html) ? html.replace(/<body\b[^>]*>/i, m => m + banner) : banner + html;
  }
  return html;
}

// ---- Reference website (layout inspiration) ---------------------------------

function privateAddress(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return privateAddress(v.slice(7));
    return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
}
const textOf = html => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export async function readReference(raw, request = fetch) {
  let url;
  try { url = new URL(String(raw).trim()); } catch { fail('Enter a valid reference address, starting with https://'); }
  for (let hop = 0; hop < 4; hop++) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80', '443'].includes(url.port))) fail('Use a public http or https address for the reference.');
    const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
    if (!addresses.length) fail('The reference address could not be found.');
    if (addresses.some(a => privateAddress(a.address))) fail('The reference must be a public website.');
    const response = await request(url, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'pt-BR,en;q=0.8', 'User-Agent': 'Mozilla/5.0 (compatible; GO-Workspace-Studio/1.0; layout reference)' } }).catch(() => null);
    if (!response) fail('The reference website did not respond.');
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get('location')) { url = new URL(response.headers.get('location'), url); continue; }
    if (!response.ok) fail(`The reference website refused the request (status ${response.status}). Try another address or create without a reference.`);
    if (!/text\/html|application\/xhtml/i.test(response.headers.get('content-type') || '')) fail('The reference address did not return a web page.');
    const reader = response.body.getReader(); const chunks = []; let size = 0;
    while (size < 600000) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); size += value.length; }
    reader.cancel().catch(() => {});
    const html = Buffer.concat(chunks).toString('utf8').replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1>/gi, '');
    const title = textOf(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '');
    const headings = [...html.matchAll(/<(h[1-3])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => `${m[1].toUpperCase()}: ${textOf(m[2])}`).filter(l => l.length > 4).slice(0, 40);
    const buttons = [...html.matchAll(/<(?:button|a)\b[^>]*>([\s\S]*?)<\/(?:button|a)>/gi)].map(m => textOf(m[1])).filter(t => t && t.length < 40).slice(0, 25);
    const sections = (html.match(/<section\b/gi) || []).length;
    return { url: url.href, summary: [`Reference page: ${url.hostname}`, title && `Title: ${title}`, `Sections: ${sections}`, 'Heading order:', ...headings, buttons.length ? `Buttons and links: ${[...new Set(buttons)].join(' | ')}` : ''].filter(Boolean).join('\n').slice(0, 5000) };
  }
  return fail('The reference address redirects too many times.');
}

// Local page built from a design direction (palette, fonts and layout chosen in the builder).
function luminance(color) {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function designedPage({ siteName, page, design, role = 'page', summary = '' }) {
  const [base, surface, accent, highlight] = design.palette.colors;
  const dark = luminance(base) < 0.25;
  const ink = dark ? '#f5f3ee' : '#16181d';
  const muted = dark ? 'rgba(245,243,238,.72)' : 'rgba(22,24,29,.7)';
  const line = dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.1)';
  const onAccent = luminance(accent) > 0.45 ? '#16181d' : '#ffffff';
  const family = name => name.trim().replace(/ /g, '+');
  const fonts = [...new Set([design.fonts.heading, design.fonts.body])].map(name => `family=${family(name)}:wght@400;600;700`).join('&');
  const form = `<form data-go-lead class="lead"><h2>${role === 'contact' ? 'Fale com a gente' : 'Quero participar'}</h2>
<label>Nome<input name="name" required autocomplete="name"></label><label>E-mail<input name="email" type="email" required autocomplete="email"></label>
<label>Telefone<input name="phone" type="tel" autocomplete="tel"></label><button>Enviar</button><small>[[Frase curta sobre privacidade dos dados]]</small></form>`;
  const intro = `<p class="kicker">${esc(siteName)}</p><h1>${esc(role === 'thanks' ? 'Recebemos seus dados!' : page.name === 'Início' || page.slug === 'index' ? siteName : page.name)}</h1>
<p class="lede">${esc(role === 'thanks' ? 'Obrigado pelo interesse. Nossa equipe vai entrar em contato em breve.' : page.purpose || summary || '[[Descreva a oferta em uma frase]]')}</p>`;
  const benefits = `<section class="benefits">${['[[Benefício 1]]', '[[Benefício 2]]', '[[Benefício 3]]'].map((title, index) => `<article><span>${index + 1}</span><h3>${title}</h3><p>[[Explique este benefício em uma ou duas frases]]</p></article>`).join('')}</section>`;
  const body = role === 'thanks'
    ? `<main class="thanks"><div class="mark" aria-hidden="true">✓</div>${intro}<a class="button" href="page:index">Voltar para o início</a></main>`
    : design.layout === 'split' || design.layout === 'sidebar'
      ? `<main class="hero split ${design.layout}"><div class="copy">${intro}${design.layout === 'sidebar' ? benefits : ''}</div><aside>${form}</aside></main>${design.layout === 'split' ? benefits : ''}`
      : design.layout === 'centered'
        ? `<main class="hero centered">${intro}${form}</main>${benefits}`
        : `<main class="hero stacked">${intro}<a class="button" href="#form">Quero participar</a></main>${benefits}<section class="form-band" id="form">${form}</section>`;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(page.name)} · ${esc(siteName)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fonts}&display=swap">
<style>
*{box-sizing:border-box}body{margin:0;background:${base};color:${ink};font-family:"${design.fonts.body}",system-ui,sans-serif;line-height:1.6}
h1,h2,h3{font-family:"${design.fonts.heading}",Georgia,serif;line-height:1.1;margin:0}
header{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:20px clamp(18px,5vw,64px);border-bottom:1px solid ${line}}
header b{font-family:"${design.fonts.heading}",serif;font-size:20px}header a{color:${accent};text-decoration:none;font-weight:600}
.hero{padding:clamp(48px,9vw,110px) clamp(18px,5vw,64px)}.kicker{margin:0 0 14px;color:${accent};font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
h1{font-size:clamp(36px,6vw,68px);letter-spacing:-.02em;margin-bottom:18px}.lede{max-width:620px;margin:0;color:${muted};font-size:18px}
.split{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr);gap:clamp(28px,5vw,72px);align-items:center}
.sidebar{grid-template-columns:minmax(0,1.6fr) minmax(300px,.7fr);align-items:start}.sidebar aside{position:sticky;top:24px}
.centered{text-align:center;display:grid;justify-items:center;gap:8px}.centered .lede{margin:0 auto 28px}
.lead{display:grid;gap:12px;padding:clamp(22px,3vw,32px);border-radius:18px;background:${surface};border:1px solid ${line};width:100%;max-width:460px;text-align:left}
.lead h2{font-size:26px;margin-bottom:4px}.lead label{display:grid;gap:6px;font-size:14px;font-weight:600}
.lead input{font:inherit;padding:12px 14px;border-radius:10px;border:1px solid ${line};background:${dark ? 'rgba(255,255,255,.06)' : '#fff'};color:inherit}
.lead button,.button{display:inline-block;font:inherit;font-weight:700;padding:14px 20px;border:0;border-radius:10px;background:${accent};color:${onAccent};text-decoration:none;cursor:pointer;text-align:center}
.lead small{color:${muted};font-size:12px}.benefits{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:18px;padding:0 clamp(18px,5vw,64px) clamp(48px,8vw,96px)}
.benefits article{padding:24px;border-radius:16px;background:${surface};border:1px solid ${line}}.benefits span{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:${highlight};color:${luminance(highlight) > .45 ? '#16181d' : '#fff'};font-weight:700;margin-bottom:12px}
.benefits h3{font-size:22px;margin-bottom:8px}.benefits p{margin:0;color:${muted}}.form-band{display:grid;justify-items:center;padding:0 18px clamp(56px,8vw,96px)}
.thanks{min-height:70vh;display:grid;place-content:center;justify-items:center;text-align:center;gap:10px;padding:48px 18px}.thanks .lede{margin-bottom:18px}
.mark{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:${accent};color:${onAccent};font-size:30px;font-weight:700}
footer{padding:28px clamp(18px,5vw,64px);border-top:1px solid ${line};color:${muted};font-size:14px}
@media(max-width:820px){.split,.sidebar{grid-template-columns:1fr}.sidebar aside{position:static}}
</style></head>
<body><header><b>${esc(siteName)}</b><a href="${role === 'thanks' ? 'page:index' : '#form'}">${role === 'thanks' ? 'Início' : 'Fale com a gente'}</a></header>
${body.replace('<form data-go-lead class="lead">', '<form data-go-lead class="lead" id="form">')}
<footer>${esc(siteName)} · [[Endereço ou cidade]]</footer></body></html>`;
}
