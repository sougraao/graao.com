// Generates ui/graao-dark.css: dark-mode overrides for every fixed colour in the stylesheets.
//
// The original sheets (style, dashboard, studio, agency) and graao.css hard-code light colours.
// Instead of hand-copying hundreds of rules, this reads each declaration and maps its colour onto
// the microkit dark palette by role: backgrounds become surfaces, dark text becomes light text,
// light borders become hairlines, and pastel tints become translucent tints of the same hue.
// Hand-tuned dark rules live at the end of graao.css and win over these (same specificity, later).
//
// Run after changing any stylesheet:  npm run build:dark
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ui = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'ui');
const base = ['style.css', 'dashboard.css', 'studio.css', 'agency.css', 'prospecting.css', 'social.css'];
const own = 'graao.css';
const PREFIX = ':root[data-theme=dark]';

// mesmas superfícies escuras de ui/tokens.css
const P = {
  surface: [30, 26, 22], sunken: [38, 33, 28], raised: [51, 44, 37], hairline: [60, 52, 44], divider: [48, 42, 36],
  text: '#faf7f3', text2: '#ddd5cc', text3: '#c4bab0', muted: '#ada399', dim: '#978d83',
};

/* ── tiny CSS reader: rules, @media/@supports blocks; skips @keyframes, @font-face and comments ── */
function parse(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  let i = 0;
  const block = (wrap) => {
    while (i < css.length) {
      const open = css.indexOf('{', i), close = css.indexOf('}', i);
      if (close !== -1 && (open === -1 || close < open)) { i = close + 1; return; }
      if (open === -1) { i = css.length; return; }
      const head = css.slice(i, open).trim();
      i = open + 1;
      if (/^@(media|supports|container)/.test(head)) { block([...wrap, head]); continue; }
      if (head.startsWith('@')) { skip(); continue; }
      const end = css.indexOf('}', i);
      out.push({ wrap, selector: head, body: css.slice(i, end) });
      i = end + 1;
    }
  };
  const skip = () => { let depth = 1; while (i < css.length && depth) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; } };
  block([]);
  return out;
}
const splitTop = (s, sep) => { const parts = []; let depth = 0, cur = ''; for (const ch of s) { if (ch === '(' || ch === '[') depth++; if (ch === ')' || ch === ']') depth--; if (ch === sep && !depth) { parts.push(cur); cur = ''; } else cur += ch; } parts.push(cur); return parts.map(p => p.trim()).filter(Boolean); };
const decls = body => splitTop(body, ';').map(d => { const k = d.indexOf(':'); return k < 0 ? null : [d.slice(0, k).trim().toLowerCase(), d.slice(k + 1).trim()]; }).filter(Boolean);
const group = prop => prop.startsWith('background') ? 'background' : prop.startsWith('border') ? 'border' : prop;

/* ── colours ── */
const COLOR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\bwhite\b/gi;
function rgba(token) {
  token = token.toLowerCase();
  if (token === 'white') return [255, 255, 255, 1];
  if (token.startsWith('#')) {
    let h = token.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map(c => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const n = [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16));
    return [...n, h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1];
  }
  const nums = token.match(/[\d.]+%?/g)?.map(v => v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v));
  if (!nums || nums.length < 3) return null;
  return [nums[0], nums[1], nums[2], nums[3] ?? 1];
}
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, c = max - min;
  let h = 0;
  if (c) h = max === r ? ((g - b) / c) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4;
  return { h: (h * 60 + 360) % 360, l, c };
}
const fam = h => h >= 345 || h < 18 ? 'red' : h < 68 ? 'orange' : h < 175 ? 'green' : (h < 260 ? 'blue' : 'pink');
const css = ([r, g, b], a = 1) => a >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${+a.toFixed(3)})`;
const TINT = { pink: [255, 51, 204], blue: [134, 182, 255], orange: [249, 115, 22], red: [242, 167, 181], green: [118, 210, 155] };
const TEXT_ACCENT = { pink: '#ff9adb', blue: '#86b6ff', orange: '#ffb17a', red: '#f2a7b5', green: '#76d29b' };
const LINE_TINT = { pink: [92, 24, 75], blue: [32, 50, 85], orange: [107, 69, 37], red: [90, 38, 51], green: [31, 77, 53] };

function mapColor(token, role) {
  const c = rgba(token); if (!c) return null;
  const a = c[3], { h, l, c: chroma } = hsl(c), tinted = chroma > 0.06;
  if (role === 'background') {
    if (l < 0.78) return null;                                     // already dark or a saturated accent
    if (tinted) return css(TINT[fam(h)], Math.min(0.22, 0.15 * a + 0.02));
    return css(l >= 0.97 ? P.surface : l >= 0.955 ? P.sunken : l >= 0.9 ? P.raised : P.divider, a);
  }
  if (role === 'border') {
    if (l < 0.7) return null;
    return tinted && chroma > 0.12 ? css(LINE_TINT[fam(h)], a) : css(P.hairline, a);
  }
  if (role === 'text') {
    if (l > 0.62) return null;                                     // light text already reads on dark
    if (chroma > 0.2 && l > 0.15) return TEXT_ACCENT[fam(h)];
    return l < 0.16 ? P.text : l < 0.3 ? P.text2 : l < 0.42 ? P.text3 : l < 0.55 ? P.muted : P.dim;
  }
  return null;
}
function roleOf(prop, value) {
  if (prop === 'background-color') return 'background';
  if (prop === 'background') return /gradient|url\(/i.test(value) ? null : 'background';
  if (/^border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?$/.test(prop)) return 'border';
  if (prop === 'color' || prop === 'fill' || prop === 'stroke' || prop === 'caret-color' || prop === '-webkit-text-fill-color') return 'text';
  if (prop === 'outline-color' || prop === 'column-rule-color' || prop === 'text-decoration-color') return 'border';
  return null;
}
function darkValue(prop, value) {
  if (/var\(|currentcolor|inherit|transparent\s*$/i.test(value) && !COLOR.test(value)) return null;
  COLOR.lastIndex = 0;
  const role = roleOf(prop, value); if (!role) return null;
  let changed = false;
  const next = value.replace(COLOR, t => { const m = mapColor(t, role); if (m) { changed = true; return m; } return t; });
  return changed ? next : null;
}

/* ── build ── */
const ownRules = parse(readFileSync(resolve(ui, own), 'utf8'));
const ownedPairs = new Set();
for (const r of ownRules) for (const s of splitTop(r.selector, ',')) for (const [p, v] of decls(r.body)) if (/var\(/.test(v)) ownedPairs.add(`${r.wrap.join('|')}::${s.replace(/\s+/g, ' ')}::${group(p)}`);

const scope = sel => sel.startsWith(':root') ? sel.replace(/^:root/, PREFIX) : /^html\b/.test(sel) ? sel.replace(/^html/, `html${PREFIX.slice(5)}`) : `${PREFIX} ${sel}`;
const chunks = [];
let count = 0;
for (const file of [...base, own]) {
  for (const r of parse(readFileSync(resolve(ui, file), 'utf8'))) {
    if (/data-theme/.test(r.selector)) continue;
    const selectors = splitTop(r.selector, ',');
    const ds = decls(r.body);
    for (const sel of selectors) {
      if (/\.g-mark|\.sk-|\.spark-tile\b|\.ag-color-knob|\.ag-color-controls/.test(sel)) continue;
      const key = `${r.wrap.join('|')}::${sel.replace(/\s+/g, ' ')}`;
      const out = [];
      for (const [p, v] of ds) {
        // graao.css already themes this property with tokens; leave it to them.
        if (file !== own && ownedPairs.has(`${key}::${group(p)}`)) continue;
        const d = darkValue(p, v);
        if (d) out.push(`${p}:${d}`);
      }
      if (!out.length) continue;
      count++;
      let rule = `${scope(sel)}{${out.join(';')}}`;
      for (const w of [...r.wrap].reverse()) rule = `${w}{${rule}}`;
      chunks.push(rule);
    }
  }
}
const gMarkDarkRules = [
  `${PREFIX} .g-mark .sk-flame{fill:url(#g-flame-grad);stroke:none;filter:none}`,
  `${PREFIX} .g-mark .sk-head{fill:#ffffff}`,
  `${PREFIX} .g-mark .sk-feat{fill:#111317}`,
  `${PREFIX} .g-mark .sk-glint{fill:#ffffff}`
];
const output = `/* Generated by scripts/build-dark.mjs — do not edit. ${count + gMarkDarkRules.length} rules. */\n${[...chunks, ...gMarkDarkRules].join('\n')}\n`;
writeFileSync(resolve(ui, 'graao-dark.css'), output);
// public/ mirrors ui/ for Vercel's static CDN; keep its copy identical.
writeFileSync(resolve(ui, '..', 'public', 'graao-dark.css'), output);
console.log(`graao-dark.css: ${count + gMarkDarkRules.length} rules`);
