// Brand boards: validation, the default board and the import of a brand from a public website.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { privateAddress } from './workflow-delivery.mjs';
import { brandFonts, brandLimits, brandPresets, colorRoles, voiceTraits } from './ui/brand-data.js';

export const brandCollections = ['brandBoards'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const clip = (value, limit) => (typeof value === 'string' ? value.trim().slice(0, limit) : '');
const hex = value => (/^#[0-9a-f]{6}$/i.test(String(value || '').trim()) ? String(value).trim().toLowerCase() : '');
const words = list => [...new Set((Array.isArray(list) ? list : String(list || '').split(',')).map(item => clip(String(item), brandLimits.word)).filter(Boolean))].slice(0, brandLimits.words);

function logo(value) {
  if (!value) return '';
  if (typeof value !== 'string') fail('Logo inválido.');
  if (/^https:\/\/[^\s"'<>]+$/i.test(value) && value.length <= 600) return value;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(value);
  if (!match) fail('Envie o logo em PNG, JPG ou WebP.');
  if (match[2].length * 3 / 4 > brandLimits.logoBytes) fail('O logo deve ter até 300 KB.');
  return value;
}

export const brandFields = {
  brandBoards: (s, d) => {
    const colors = (Array.isArray(d.colors) ? d.colors : []).slice(0, brandLimits.colors).map(color => ({
      role: colorRoles.some(([id]) => id === color?.role) ? color.role : 'neutral', name: clip(color?.name, 40), hex: hex(color?.hex) || fail('Use cores no formato #RRGGBB.')
    }));
    const fonts = { heading: brandFonts.includes(d.fonts?.heading) ? d.fonts.heading : 'Inter', body: brandFonts.includes(d.fonts?.body) ? d.fonts.body : 'Inter' };
    const voice = d.voice && typeof d.voice === 'object' ? d.voice : {};
    if (!d.id && s.brandBoards.length >= brandLimits.boards) fail(`A subconta guarda até ${brandLimits.boards} marcas.`);
    const prior = s.brandBoards.find(row => row.id === d.id);
    const isDefault = d.isDefault === true || (prior?.isDefault && d.isDefault !== false) || !s.brandBoards.some(row => row.id !== d.id);
    if (isDefault) for (const row of s.brandBoards) if (row.id !== d.id) row.isDefault = false;
    return {
      name: clip(d.name, 80) || fail('Dê um nome à marca.'), isDefault, logo: logo(d.logo), logoDark: logo(d.logoDark), colors, fonts,
      voice: {
        summary: clip(voice.summary, 600), audience: clip(voice.audience, 300),
        traits: (Array.isArray(voice.traits) ? voice.traits : []).filter(trait => voiceTraits.includes(trait)).slice(0, 5),
        use: words(voice.use), avoid: words(voice.avoid), example: clip(voice.example, 1200)
      },
      source: clip(d.source, 300)
    };
  }
};

export function presetBoard(id) {
  const preset = brandPresets.find(row => row.id === id) || fail('Modelo de marca não encontrado.', 404);
  return { name: preset.name, colors: preset.colors.map(([role, value]) => ({ role, hex: value, name: '' })), fonts: { heading: preset.fonts[0], body: preset.fonts[1] }, voice: {} };
}

/* ───────── Import from a website ───────── */

const luminance = value => { const [r, g, b] = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
// HSL saturation, so dark but colorful brand tones (forest green, coffee brown) still count as brand colors.
const saturation = value => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), light = (max + min) / 2;
  return max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
};
const expand = value => (value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value).toLowerCase();

// Reads colors, fonts and a logo from a page's HTML and CSS. Pure: the caller fetches safely.
export function brandFromPage({ html = '', css = '', url }) {
  const base = new URL(url);
  const absolute = href => { try { const target = new URL(href, base); return target.protocol === 'https:' ? target.href : ''; } catch { return ''; } };
  const theme = /<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-f]{3,6})["']/i.exec(html)?.[1] || /<meta[^>]+content=["'](#[0-9a-f]{3,6})["'][^>]+name=["']theme-color["']/i.exec(html)?.[1];
  const counts = new Map();
  for (const [value] of `${html}\n${css}`.matchAll(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const color = expand(value);
    counts.set(color, (counts.get(color) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([color]) => color);
  const vivid = ranked.filter(color => saturation(color) > 0.2 && luminance(color) > 0.05 && luminance(color) < 0.92);
  const dark = ranked.find(color => luminance(color) < 0.2 && saturation(color) < 0.3) || '#111827';
  const light = ranked.find(color => luminance(color) > 0.93) || '#ffffff';
  const brandColors = [...new Set([theme && expand(theme), ...vivid].filter(Boolean))].slice(0, 3);
  const colors = [
    ...brandColors.map((value, index) => ({ role: ['primary', 'secondary', 'accent'][index], hex: value, name: '' })),
    { role: 'background', hex: light, name: '' }, { role: 'text', hex: dark, name: '' }
  ];
  const fonts = [];
  for (const [link] of html.matchAll(/fonts\.googleapis\.com\/css2?\?[^"'\s>]+/gi)) {
    for (const [, family] of link.replace(/&amp;/g, '&').matchAll(/family=([^:&|]+)/g)) fonts.push(decodeURIComponent(family.replace(/\+/g, ' ')));
  }
  for (const [, family] of `${css}\n${html}`.matchAll(/font-family\s*:\s*["']?([^;,"'}]+)/gi)) fonts.push(family.trim());
  const known = fonts.map(name => brandFonts.find(font => font.toLowerCase() === name.toLowerCase())).filter(Boolean);
  const icon = /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i.exec(html)?.[1]
    || /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1]
    || /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i.exec(html)?.[1];
  const title = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i.exec(html)?.[1] || /<title>([^<]{1,80})<\/title>/i.exec(html)?.[1] || base.hostname;
  const description = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,600})["']/i.exec(html)?.[1] || '';
  return {
    name: clip(title.replace(/\s+[|·–-]\s+.*$/, ''), 80) || base.hostname, colors, fonts: { heading: known[0] || 'Inter', body: known[1] || known[0] || 'Inter' },
    logo: icon ? absolute(icon) : '', voice: { summary: clip(description.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'), 600) }, source: base.href
  };
}

async function readCapped(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel().catch(() => {}); break; }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk))).toString('utf8');
}

async function safeGet(href, { fetchImpl, resolve, limit, accept }) {
  let target;
  for (let hop = 0; hop < 4; hop++) {
    try { target = new URL(href); } catch { fail('Endereço inválido.'); }
    if (target.protocol !== 'https:' || target.username || target.password || (target.port && target.port !== '443')) fail('Use o endereço do site com https://.');
    const host = target.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [{ address: host }] : await resolve(host, { all: true }).catch(() => []);
    if (!addresses.length) fail('Não encontramos esse domínio.');
    if (addresses.some(entry => privateAddress(entry.address))) fail('Esse endereço não é um site público.');
    const response = await fetchImpl(target, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'graao-brand-import/1.0', accept } })
      .catch(error => fail(error?.name === 'TimeoutError' ? 'O site demorou demais para responder.' : 'Não foi possível abrir o site.', 502));
    if ([301, 302, 303, 307, 308].includes(response.status) && response.headers.get('location')) { href = new URL(response.headers.get('location'), target).href; continue; }
    if (!response.ok) fail(`O site respondeu com erro (${response.status}).`, 502);
    return { text: await readCapped(response, limit), url: target.href };
  }
  fail('O site redireciona vezes demais.', 502);
}

// The page and its first stylesheet, for brandFromPage.
export async function fetchPublicPage(href, { fetchImpl = fetch, resolve = lookup } = {}) {
  const page = await safeGet(href, { fetchImpl, resolve, limit: 1_500_000, accept: 'text/html' });
  const sheet = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/i.exec(page.text)?.[1] || /<link[^>]+href=["']([^"']+\.css[^"']*)["'][^>]+rel=["']stylesheet["']/i.exec(page.text)?.[1];
  let css = '';
  if (sheet) {
    try { css = (await safeGet(new URL(sheet, page.url).href, { fetchImpl, resolve, limit: 500_000, accept: 'text/css' })).text; } catch { css = ''; }
  }
  return { html: page.text, css, url: page.url };
}
