// Deck model for the presentations editor (format "deck", version 2).
//
// Shaped after what Google Slides does internally (docs/implementation/06-apresentacoes-google-slides.md):
// a theme (12 colors + 2 fonts + master elements) → layouts with typed placeholders → slides with freely
// positioned elements. Every edit is a small operation with an exact inverse, so the editor gets
// undo/redo for free and the server receives batches of operations against a revision number.
//
// Pure module: no DOM, imported by the browser editor and by the server.

export const DECK_FORMAT = 'deck';
export const DECK_VERSION = 2;
export const PAGE = Object.freeze({ width: 960, height: 540 });
export const LIMITS = Object.freeze({ slides: 150, elements: 250, runs: 400, text: 6000, ops: 400, imageBytes: 450_000, deckBytes: 3_500_000 });

export const THEME_COLOR_KEYS = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'link', 'muted'];
export const THEME_COLOR_LABELS = {
  dk1: 'Texto escuro', lt1: 'Fundo claro', dk2: 'Escuro 2', lt2: 'Claro 2', accent1: 'Destaque 1', accent2: 'Destaque 2',
  accent3: 'Destaque 3', accent4: 'Destaque 4', accent5: 'Destaque 5', accent6: 'Destaque 6', link: 'Link', muted: 'Texto suave'
};
export const FONT_CHOICES = ['Plus Jakarta Sans', 'Arial', 'Helvetica', 'Verdana', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New'];

export const SHAPES = [
  ['rect', 'Retângulo'], ['roundRect', 'Retângulo arredondado'], ['ellipse', 'Elipse'], ['triangle', 'Triângulo'],
  ['rightTriangle', 'Triângulo retângulo'], ['diamond', 'Losango'], ['parallelogram', 'Paralelogramo'], ['trapezoid', 'Trapézio'],
  ['pentagon', 'Pentágono'], ['hexagon', 'Hexágono'], ['octagon', 'Octógono'], ['star5', 'Estrela'], ['arrowRight', 'Seta para a direita'],
  ['arrowLeft', 'Seta para a esquerda'], ['arrowUp', 'Seta para cima'], ['arrowDown', 'Seta para baixo'], ['chevron', 'Divisa'],
  ['homePlate', 'Pentágono seta'], ['plus', 'Mais'], ['heart', 'Coração'], ['speech', 'Balão de fala'], ['cloud', 'Nuvem']
];
const SHAPE_IDS = new Set(SHAPES.map(([id]) => id));

export const ICONS = ['i-browser', 'i-search', 'i-people', 'i-chart', 'i-alert', 'i-globe', 'i-tag', 'i-crm', 'i-mobile', 'i-plussearch', 'star'];

const BASE_TEXT = { font: '@body', size: 18, weight: 400, color: '@dk1', align: 'left', valign: 'top', lineHeight: 1.25, letterSpacing: 0 };

// ---- Themes -------------------------------------------------------------------------------------

function masterChrome() {
  return [
    { id: 'm-bar', type: 'shape', shape: 'rect', x: 0, y: 0, w: 960, h: 5, fill: '@accent1', stroke: 'none' },
    { id: 'm-brand', type: 'brand', x: 640, y: 18, w: 260, h: 36 },
    { id: 'm-number', type: 'text', auto: 'slideNumber', x: 760, y: 506, w: 140, h: 16,
      runs: [{ t: '' }], style: { ...BASE_TEXT, size: 10, weight: 700, color: '@muted', align: 'right', letterSpacing: 0.08 } }
  ];
}

export const THEMES = {
  proposta: {
    id: 'proposta', name: 'Proposta graao', background: '@lt1',
    colors: { dk1: '#0b315c', lt1: '#ffffff', dk2: '#08284d', lt2: '#f3f9f9', accent1: '#f65b00', accent2: '#eff5f7', accent3: '#2563eb', accent4: '#16a34a', accent5: '#facc15', accent6: '#9333ea', link: '#2563eb', muted: '#45617d' },
    fonts: { heading: 'Arial', body: 'Arial' },
    master: masterChrome()
  },
  simples: {
    id: 'simples', name: 'Simples claro', background: '@lt1',
    colors: { dk1: '#1f2937', lt1: '#ffffff', dk2: '#374151', lt2: '#f3f4f6', accent1: '#3b82f6', accent2: '#e0ecff', accent3: '#10b981', accent4: '#f59e0b', accent5: '#ef4444', accent6: '#8b5cf6', link: '#2563eb', muted: '#6b7280' },
    fonts: { heading: 'Plus Jakarta Sans', body: 'Plus Jakarta Sans' },
    master: [{ id: 'm-number', type: 'text', auto: 'slideNumber', x: 820, y: 506, w: 100, h: 16, runs: [{ t: '' }], style: { ...BASE_TEXT, size: 10, color: '@muted', align: 'right' } }]
  },
  noite: {
    id: 'noite', name: 'Noite', background: '@lt1',
    colors: { dk1: '#f8fafc', lt1: '#0f172a', dk2: '#e2e8f0', lt2: '#1e293b', accent1: '#f472b6', accent2: '#312e81', accent3: '#38bdf8', accent4: '#34d399', accent5: '#fbbf24', accent6: '#a78bfa', link: '#38bdf8', muted: '#94a3b8' },
    fonts: { heading: 'Plus Jakarta Sans', body: 'Plus Jakarta Sans' },
    master: [{ id: 'm-bar', type: 'shape', shape: 'rect', x: 60, y: 500, w: 40, h: 4, fill: '@accent1', stroke: 'none' },
      { id: 'm-number', type: 'text', auto: 'slideNumber', x: 820, y: 494, w: 100, h: 16, runs: [{ t: '' }], style: { ...BASE_TEXT, size: 10, color: '@muted', align: 'right' } }]
  }
};

// ---- Layouts (placeholders, Slides-style) ------------------------------------------------------

const ph = (id, placeholder, x, y, w, h, style, prompt) => ({ id, type: 'text', placeholder, prompt, x, y, w, h, runs: [{ t: '' }], style: { ...BASE_TEXT, ...style } });
const TITLE = { font: '@heading', size: 40, weight: 800, lineHeight: 1.08, letterSpacing: -0.02 };

export const LAYOUTS = [
  { id: 'title', name: 'Capa', elements: [
    ph('title', 'title', 60, 170, 840, 130, { ...TITLE, size: 48, valign: 'bottom' }, 'Clique para adicionar o título'),
    ph('subtitle', 'subtitle', 60, 316, 840, 60, { size: 20, color: '@muted' }, 'Clique para adicionar o subtítulo')] },
  { id: 'section', name: 'Cabeçalho de seção', elements: [
    ph('title', 'title', 60, 200, 840, 90, { ...TITLE, size: 44, valign: 'bottom' }, 'Título da seção'),
    ph('subtitle', 'subtitle', 60, 300, 840, 40, { size: 18, color: '@muted' }, 'Descrição da seção')] },
  { id: 'title-body', name: 'Título e corpo', elements: [
    ph('title', 'title', 60, 70, 840, 70, TITLE, 'Clique para adicionar o título'),
    ph('body', 'body', 60, 160, 840, 300, { size: 20, bullets: 'disc', lineHeight: 1.4 }, 'Clique para adicionar o texto')] },
  { id: 'two-columns', name: 'Título e duas colunas', elements: [
    ph('title', 'title', 60, 70, 840, 70, TITLE, 'Clique para adicionar o título'),
    ph('body', 'body', 60, 160, 405, 300, { size: 18, bullets: 'disc', lineHeight: 1.4 }, 'Clique para adicionar o texto'),
    ph('body2', 'body', 495, 160, 405, 300, { size: 18, bullets: 'disc', lineHeight: 1.4 }, 'Clique para adicionar o texto')] },
  { id: 'title-only', name: 'Somente título', elements: [ph('title', 'title', 60, 70, 840, 70, TITLE, 'Clique para adicionar o título')] },
  { id: 'main-point', name: 'Ideia principal', elements: [ph('title', 'title', 90, 150, 780, 240, { ...TITLE, size: 44, align: 'center', valign: 'middle' }, 'Escreva a ideia principal')] },
  { id: 'big-number', name: 'Número grande', elements: [
    ph('title', 'title', 60, 110, 840, 170, { ...TITLE, size: 120, color: '@accent1', align: 'center', valign: 'bottom' }, 'xx%'),
    ph('body', 'body', 160, 300, 640, 80, { size: 20, align: 'center', color: '@muted' }, 'Clique para adicionar o texto')] },
  { id: 'caption', name: 'Legenda', elements: [ph('body', 'body', 60, 440, 840, 50, { size: 18, color: '@muted' }, 'Adicione uma legenda')] },
  { id: 'blank', name: 'Em branco', elements: [] }
];
const LAYOUT_IDS = new Set(LAYOUTS.map(l => l.id));

// ---- Helpers ------------------------------------------------------------------------------------

export const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
let seq = 0;
export function newId(prefix = 'e') {
  seq = (seq + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const isDeck = p => p?.format === DECK_FORMAT;
export const runsText = runs => (runs || []).map(r => r.t).join('');
export const textRuns = text => [{ t: String(text ?? '') }];

export function themeOf(deck) { return deck?.theme || THEMES.proposta; }

export function resolveColor(deck, value, fallback = 'none') {
  if (value == null || value === '') return fallback;
  if (value === 'none') return 'none';
  if (typeof value === 'string' && value.startsWith('@')) return themeOf(deck).colors[value.slice(1)] || fallback;
  return value;
}
export function resolveFont(deck, value) {
  const fonts = themeOf(deck).fonts;
  if (value === '@heading') return fonts.heading;
  if (value === '@body' || !value) return fonts.body;
  return value;
}

export function layoutById(id) { return LAYOUTS.find(l => l.id === id) || LAYOUTS.find(l => l.id === 'blank'); }

export function elementBounds(el) {
  if (el.type === 'line') {
    const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2);
    return { x, y, w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
  }
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}

// ---- Creation -----------------------------------------------------------------------------------

export function createSlide(layoutId = 'title-body') {
  const layout = layoutById(layoutId);
  return {
    id: newId('s'), layoutId: layout.id, notes: '', hideMaster: false, skipped: false,
    elements: layout.elements.map(e => ({ ...clone(e), id: newId('e') }))
  };
}

function brandFrom(company = {}, source = {}) {
  return {
    name: String(source.agencyName || company.agencyName || company.name || 'Minha Agência').slice(0, 80),
    logo: typeof (source.agencyLogo ?? company.agencyLogo ?? company.logo) === 'string' ? (source.agencyLogo ?? company.agencyLogo ?? company.logo) : ''
  };
}

export function themeWithBrand(themeId, primary, accent) {
  const theme = clone(THEMES[themeId] || THEMES.proposta);
  if (/^#[0-9a-f]{6}$/i.test(primary || '')) theme.colors.dk1 = primary.toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(accent || '')) theme.colors.accent1 = accent.toLowerCase();
  return theme;
}

export function createDeck({ title = 'Nova apresentação', company = {}, themeId = 'proposta' } = {}) {
  const theme = themeWithBrand(themeId, themeId === 'proposta' ? (company.primaryColor || company.primary) : '', themeId === 'proposta' ? (company.accentColor || company.secondaryColor || company.secondary) : '');
  const cover = createSlide('title');
  cover.elements[0].runs = textRuns(title);
  return withLegacyMirror({
    format: DECK_FORMAT, version: DECK_VERSION, id: `pres-${Date.now()}`, title, name: title, description: '',
    page: { ...PAGE }, theme, brand: brandFrom(company), rev: 0, slides: [cover]
  });
}

// Keeps the fields the gallery, the share route and older code read (agencyName, colors, title).
export function withLegacyMirror(deck) {
  deck.name = deck.title;
  deck.agencyName = deck.brand?.name || '';
  deck.agencyLogo = deck.brand?.logo || '';
  deck.primaryColor = deck.theme.colors.dk1;
  deck.accentColor = deck.secondaryColor = deck.theme.colors.accent1;
  return deck;
}

// ---- Legacy (v1, form-based) → deck -------------------------------------------------------------
// v1 slides were HTML laid out on a 1440×810 stage; positions below follow that CSS and are scaled to 960×540.

const K = PAGE.width / 1440;

function legacyRuns(raw) {
  const text = String(raw || '').replace(/<br\s*\/?>/gi, '\n');
  const runs = [];
  const re = /<span[^>]*class=["'][^"']*accent[^"']*["'][^>]*>([\s\S]*?)<\/span>|\*([^*]+)\*/gi;
  let last = 0, m;
  const plain = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ t: plain(text.slice(last, m.index)) });
    runs.push({ t: plain(m[1] ?? m[2]), color: '@accent1' });
    last = re.lastIndex;
  }
  if (last < text.length) runs.push({ t: plain(text.slice(last)) });
  return runs.filter(r => r.t).length ? runs.filter(r => r.t) : [{ t: '' }];
}

function estimateLines(text, sizePx, widthPx) {
  return String(text).split('\n').reduce((n, line) => n + Math.max(1, Math.ceil((line.length * sizePx * 0.52) / widthPx)), 0);
}

function legacySlide(v1, index, total, brand) {
  const els = [];
  const add = (el) => { els.push({ id: newId('e'), ...el }); };
  const T = (x, y, w, h, runs, style) => add({ type: 'text', x: x * K, y: y * K, w: w * K, h: h * K, runs, style: { ...BASE_TEXT, ...style, size: +(style.size * K).toFixed(2) } });
  const box = (x, y, w, h, fill, extra = {}) => add({ type: 'shape', shape: extra.radius ? 'roundRect' : 'rect', x: x * K, y: y * K, w: w * K, h: h * K, fill, stroke: 'none', ...extra, radius: (extra.radius || 0) * K });
  const icon = (x, y, s, id) => add(id === 'star'
    ? { type: 'text', x: x * K, y: y * K, w: s * K, h: s * K, runs: [{ t: '★' }], style: { ...BASE_TEXT, size: +(s * K).toFixed(2), color: '@accent1', align: 'center', valign: 'middle', lineHeight: 1 } }
    : { type: 'icon', icon: ICONS.includes(id) ? id : 'i-browser', x: x * K, y: y * K, w: s * K, h: s * K, color: '@dk1', accent: '@accent1' });
  const pills = (list, y) => {
    let x = 90;
    for (const p of list) {
      const w = 52 + p.length * 13.6;
      add({ type: 'shape', shape: 'roundRect', x: x * K, y: y * K, w: w * K, h: 54 * K, radius: 27 * K, fill: '@lt1', stroke: '@dk1', strokeWidth: 2.5 * K,
        runs: [{ t: p }], style: { ...BASE_TEXT, size: +(22 * K).toFixed(2), weight: 800, align: 'center', valign: 'middle', lineHeight: 1.1 } });
      x += w + 16;
    }
  };
  const eyebrow = v1.eyebrow || brand.name;
  const layout = v1.layout || 'cover';
  const top = { cover: 105, pain: 108, solution: 118, services: 137, sales: 137, bundle: 110, process: 114, blank: 114 }[layout] || 114;
  T(90, top, 1100, 27, [{ t: eyebrow }], { size: 19, weight: 800, letterSpacing: 0.285, uppercase: true, color: '@accent1', lineHeight: 1.4 });
  const headSize = { cover: 61, solution: 68, pain: 65 }[layout] || 65;
  const headText = runsText(legacyRuns(v1.headline));
  const headW = layout === 'cover' ? 1205 : layout === 'solution' ? 965 : 1260;
  const headH = estimateLines(headText, headSize, headW) * headSize * 1.07;
  const headY = top + 46;
  T(90, headY, headW, headH, legacyRuns(v1.headline), { font: '@heading', size: headSize, weight: 800, lineHeight: 1.06, letterSpacing: -0.025, color: '@dk1' });
  let y = headY + headH;
  if (v1.rule && layout !== 'cover') { box(90, y + 22, 114, 7, '@accent1'); y += 29; }
  const cards = v1.cards || [];
  switch (layout) {
    case 'cover':
      if (v1.pills?.length) pills(v1.pills, y + 52);
      break;
    case 'pain': {
      let iy = y + 31;
      for (const it of v1.items || []) {
        add({ type: 'shape', shape: 'ellipse', x: 90 * K, y: iy * K, w: 64 * K, h: 64 * K, fill: '@accent2', stroke: 'none' });
        icon(105, iy + 15, 34, it.icon);
        T(180, iy + 8, 1150, 48, [{ t: it.text }], { size: 33, weight: 800, valign: 'middle', letterSpacing: -0.015 });
        iy += 90;
      }
      break;
    }
    case 'solution': {
      const w = (1260 - 32) / 2;
      cards.forEach((c, n) => {
        const x = 90 + n * (w + 32), cy = y + 50;
        box(x, cy, w, 260, '@lt2');
        box(x, cy, 9, 260, c.accent ? '@accent1' : '@dk1');
        icon(x + w / 2 - 25, cy + 50, 51, c.icon);
        T(x + 20, cy + 112, w - 40, 46, legacyRuns(c.title), { size: 39, weight: 800, align: 'center' });
        T(x + 20, cy + 166, w - 40, 60, [{ t: c.desc || '' }], { size: 26, color: '@muted', align: 'center' });
      });
      break;
    }
    case 'services':
    case 'bundle':
    case 'sales': {
      const cols = layout === 'services' ? 3 : layout === 'bundle' ? 5 : 2;
      const gap = layout === 'bundle' ? 18 : layout === 'sales' ? 27 : 23;
      const h = layout === 'bundle' ? 215 : layout === 'sales' ? 323 : 282;
      const w = (1260 - gap * (cols - 1)) / cols;
      const cy = y + (layout === 'bundle' ? 26 : 35);
      cards.slice(0, cols * 2).forEach((c, n) => {
        const x = 90 + (n % cols) * (w + gap), yy = cy + Math.floor(n / cols) * (h + gap);
        box(x, yy, w, h, '@lt2');
        if (layout === 'sales') box(x, yy, 8, h, c.accent ? '@accent1' : '@dk1'); else box(x, yy, w, 6, '@accent1');
        const left = layout === 'sales';
        const is = layout === 'bundle' ? 43 : 48;
        icon(left ? x + 43 : x + w / 2 - is / 2, yy + (left ? 40 : 34), is, c.icon);
        const ty = yy + (left ? 117 : 34 + is + 26);
        const tSize = layout === 'bundle' ? 22 : layout === 'sales' ? 32 : 27;
        T(left ? x + 43 : x + 18, ty, left ? w - 86 : w - 36, tSize * 2.3, legacyRuns(c.title), { size: tSize, weight: 800, lineHeight: 1.14, align: left ? 'left' : 'center' });
        if (c.desc && layout !== 'bundle') T(left ? x + 43 : x + 22, ty + tSize * 2.3 + 8, left ? w - 86 : w - 44, h - (ty - yy) - tSize * 2.3 - 20, [{ t: c.desc }], { size: layout === 'sales' ? 23 : 20, color: '@muted', lineHeight: 1.45, align: left ? 'left' : 'center' });
      });
      if (layout === 'bundle' && v1.pills?.length) pills(v1.pills, cy + h + 42);
      break;
    }
    case 'process': {
      const steps = v1.steps || [];
      const w = 1260 / Math.max(1, steps.length);
      steps.forEach((st, n) => {
        const x = 90 + n * w, sy = y + 60;
        add({ type: 'shape', shape: 'ellipse', x: x * K, y: sy * K, w: 64 * K, h: 64 * K, fill: '@accent1', stroke: 'none',
          runs: [{ t: st.number || String(n + 1) }], style: { ...BASE_TEXT, size: +(26 * K).toFixed(2), weight: 800, color: '@lt1', align: 'center', valign: 'middle', lineHeight: 1 } });
        const titleRuns = legacyRuns(st.title);
        const titleH = estimateLines(runsText(titleRuns), 26, w - 30) * 26 * 1.15 + 6;
        T(x, sy + 86, w - 30, titleH, titleRuns, { size: 26, weight: 800, lineHeight: 1.15 });
        if (st.desc) T(x, sy + 96 + titleH, w - 30, 120, [{ t: st.desc }], { size: 19, color: '@muted', lineHeight: 1.45 });
      });
      break;
    }
    default: {
      const text = (v1.items || []).map(it => it.text).join('\n');
      if (text) T(90, y + 35, 980, 300, [{ t: text }], { size: 24, color: '@muted', lineHeight: 1.6 });
    }
  }
  if (v1.footer) T(90, 810 - (layout === 'cover' ? 43 : 32) - 18, 700, 20, [{ t: v1.footer }], { size: 14, weight: 700, letterSpacing: 0.18, color: '#b6c1c7', uppercase: true });
  return { id: String(v1.id || newId('s')).slice(0, 64), layoutId: 'blank', notes: '', hideMaster: false, skipped: false, elements: els };
}

export function deckFromLegacy(v1 = {}, company = {}) {
  if (isDeck(v1)) return clone(v1);
  const brand = brandFrom(company, v1);
  const theme = themeWithBrand('proposta', v1.primaryColor || company.primary, v1.accentColor || v1.secondaryColor || company.secondary);
  const slides = (v1.slides || []).map((s, i, all) => legacySlide(s, i, all.length, brand));
  const title = String(v1.title || v1.name || 'Apresentação').slice(0, 120);
  const deck = {
    format: DECK_FORMAT, version: DECK_VERSION, id: v1.id || `pres-${Date.now()}`, title, description: String(v1.description || '').slice(0, 300),
    page: { ...PAGE }, theme, brand, rev: 0, slides: slides.length ? slides : [createSlide('title')]
  };
  for (const key of ['created', 'updated', 'share']) if (v1[key] !== undefined) deck[key] = clone(v1[key]);
  return withLegacyMirror(deck);
}

// ---- Operations ---------------------------------------------------------------------------------
// Each op mutates the deck and returns its exact inverse. A user action is a transaction (array of ops);
// undo applies the inverses in reverse order.

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

function findSlide(deck, id) {
  const index = deck.slides.findIndex(s => s.id === id);
  if (index < 0) fail('Slide não encontrado.', 409);
  return { slide: deck.slides[index], index };
}
function findEl(slide, id) {
  const index = slide.elements.findIndex(e => e.id === id);
  if (index < 0) fail('Elemento não encontrado.', 409);
  return { el: slide.elements[index], index };
}
function setKeys(target, values) {
  const prev = {};
  for (const [key, value] of Object.entries(values || {})) {
    if (key === 'id' || key === 'elements') continue;
    prev[key] = key in target ? clone(target[key]) : null;
    if (value === null) delete target[key]; else target[key] = clone(value);
  }
  return prev;
}
const clampIndex = (i, len) => Math.max(0, Math.min(len, Number.isInteger(i) ? i : len));

export function applyOp(deck, op) {
  switch (op?.t) {
    case 'el.add': {
      const { slide } = findSlide(deck, op.s);
      if (slide.elements.some(e => e.id === op.el?.id)) fail('Elemento duplicado.', 409);
      const i = clampIndex(op.i, slide.elements.length);
      slide.elements.splice(i, 0, clone(op.el));
      return { t: 'el.del', s: op.s, id: op.el.id };
    }
    case 'el.del': {
      const { slide } = findSlide(deck, op.s);
      const { el, index } = findEl(slide, op.id);
      slide.elements.splice(index, 1);
      return { t: 'el.add', s: op.s, el, i: index };
    }
    case 'el.set': {
      const { slide } = findSlide(deck, op.s);
      const { el } = findEl(slide, op.id);
      return { t: 'el.set', s: op.s, id: op.id, v: setKeys(el, op.v) };
    }
    case 'el.z': {
      const { slide } = findSlide(deck, op.s);
      const { el, index } = findEl(slide, op.id);
      slide.elements.splice(index, 1);
      slide.elements.splice(clampIndex(op.i, slide.elements.length), 0, el);
      return { t: 'el.z', s: op.s, id: op.id, i: index };
    }
    case 'slide.add': {
      if (deck.slides.some(s => s.id === op.slide?.id)) fail('Slide duplicado.', 409);
      deck.slides.splice(clampIndex(op.i, deck.slides.length), 0, clone(op.slide));
      return { t: 'slide.del', id: op.slide.id };
    }
    case 'slide.del': {
      const { slide, index } = findSlide(deck, op.id);
      if (deck.slides.length <= 1) fail('A apresentação precisa ter pelo menos um slide.');
      deck.slides.splice(index, 1);
      return { t: 'slide.add', slide, i: index };
    }
    case 'slide.move': {
      const { slide, index } = findSlide(deck, op.id);
      deck.slides.splice(index, 1);
      deck.slides.splice(clampIndex(op.i, deck.slides.length), 0, slide);
      return { t: 'slide.move', id: op.id, i: index };
    }
    case 'slide.set': {
      const { slide } = findSlide(deck, op.id);
      return { t: 'slide.set', id: op.id, v: setKeys(slide, op.v) };
    }
    case 'deck.set': {
      const allowed = Object.fromEntries(Object.entries(op.v || {}).filter(([k]) => ['title', 'description', 'theme', 'brand'].includes(k)));
      const prev = setKeys(deck, allowed);
      withLegacyMirror(deck);
      return { t: 'deck.set', v: prev };
    }
    default: fail('Operação desconhecida.');
  }
}

export function applyOps(deck, ops) {
  const inverse = [];
  for (const op of ops) inverse.unshift(applyOp(deck, op));
  return inverse;
}

// ---- Validation (server side) -------------------------------------------------------------------

const num = (v, min, max, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, +n.toFixed(2))) : d; };
const str = (v, max) => typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v).slice(0, max) : '';
const COLOR = /^(#[0-9a-f]{6}|#[0-9a-f]{8}|none|@(dk1|lt1|dk2|lt2|accent[1-6]|link|muted))$/i;
const color = (v, d = 'none') => typeof v === 'string' && COLOR.test(v) ? v.toLowerCase() : d;
const IMAGE = /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i;
const imageSrc = v => {
  if (typeof v !== 'string') return '';
  if (IMAGE.test(v)) { if (v.length > LIMITS.imageBytes * 1.37) fail('Cada imagem pode ter até 450 KB.'); return v; }
  if (/^https:\/\/[^\s"'<>]{4,1500}$/.test(v)) return v;
  return '';
};

function cleanStyle(s = {}) {
  const out = {
    font: FONT_CHOICES.includes(s.font) || s.font === '@heading' || s.font === '@body' ? s.font : '@body',
    size: num(s.size, 4, 400, 18), weight: [300, 400, 500, 600, 700, 800, 900].includes(Number(s.weight)) ? Number(s.weight) : 400,
    color: color(s.color, '@dk1'), align: ['left', 'center', 'right', 'justify'].includes(s.align) ? s.align : 'left',
    valign: ['top', 'middle', 'bottom'].includes(s.valign) ? s.valign : 'top',
    lineHeight: num(s.lineHeight, 0.6, 4, 1.25), letterSpacing: num(s.letterSpacing, -0.2, 1, 0)
  };
  if (s.italic) out.italic = true;
  if (s.underline) out.underline = true;
  if (s.uppercase) out.uppercase = true;
  if (['disc', 'number', 'check'].includes(s.bullets)) out.bullets = s.bullets;
  return out;
}

function cleanRuns(runs) {
  const list = Array.isArray(runs) ? runs.slice(0, LIMITS.runs) : [];
  let total = 0;
  const out = list.map(r => {
    const t = str(r?.t, LIMITS.text - total); total += t.length;
    const run = { t };
    if (r?.b) run.b = true;
    if (r?.i) run.i = true;
    if (r?.u) run.u = true;
    if (r?.s) run.s = true;
    if (r?.color && COLOR.test(r.color)) run.color = color(r.color);
    if (r?.size) run.size = num(r.size, 4, 400, 18);
    if (typeof r?.href === 'string' && /^(https?:\/\/|mailto:)[^\s"'<>]{1,500}$/.test(r.href)) run.href = r.href;
    return run;
  }).filter((r, i) => r.t || i === 0);
  return out.length ? out : [{ t: '' }];
}

export function cleanElement(el, { master = false } = {}) {
  const type = ['text', 'shape', 'image', 'line', 'icon'].concat(master ? ['brand'] : []).includes(el?.type) ? el.type : fail('Tipo de elemento inválido.');
  const base = { id: str(el.id, 64) || newId('e'), type };
  if (type === 'line') {
    Object.assign(base, { x1: num(el.x1, -2000, 3000), y1: num(el.y1, -2000, 3000), x2: num(el.x2, -2000, 3000), y2: num(el.y2, -2000, 3000),
      stroke: color(el.stroke, '@dk1'), strokeWidth: num(el.strokeWidth, 0.25, 40, 2) });
    if (['dash', 'dot'].includes(el.dash)) base.dash = el.dash;
    if (['arrow', 'circle'].includes(el.arrowStart)) base.arrowStart = el.arrowStart;
    if (['arrow', 'circle'].includes(el.arrowEnd)) base.arrowEnd = el.arrowEnd;
  } else {
    Object.assign(base, { x: num(el.x, -2000, 3000), y: num(el.y, -2000, 3000), w: num(el.w, 1, 4000, 100), h: num(el.h, 1, 4000, 50) });
    if (el.rot) base.rot = num(el.rot, -360, 360);
    if (el.flipH) base.flipH = true;
    if (el.flipV) base.flipV = true;
  }
  if (el.opacity !== undefined && el.opacity !== 1) base.opacity = num(el.opacity, 0, 1, 1);
  if (el.locked) base.locked = true;
  if (el.name) base.name = str(el.name, 80);
  if (el.alt) base.alt = str(el.alt, 300);
  if (type === 'text' || type === 'shape') {
    base.runs = cleanRuns(el.runs);
    base.style = cleanStyle(el.style);
    if (el.placeholder && ['title', 'subtitle', 'body'].includes(el.placeholder)) { base.placeholder = el.placeholder; base.prompt = str(el.prompt, 80); }
    if (el.auto === 'slideNumber') base.auto = 'slideNumber';
    if (el.autoHeight) base.autoHeight = true;
  }
  if (type === 'shape' || type === 'text') {
    base.fill = color(el.fill, type === 'shape' ? '@accent2' : 'none');
    base.stroke = color(el.stroke, 'none');
    if (base.stroke !== 'none') base.strokeWidth = num(el.strokeWidth, 0.25, 40, 1);
    if (['dash', 'dot'].includes(el.dash)) base.dash = el.dash;
    if (el.shadow) base.shadow = true;
  }
  if (type === 'shape') {
    base.shape = SHAPE_IDS.has(el.shape) ? el.shape : 'rect';
    if (el.radius) base.radius = num(el.radius, 0, 1000);
  }
  if (type === 'image') {
    base.src = imageSrc(el.src) || fail('Imagem inválida.');
    base.fit = el.fit === 'contain' ? 'contain' : 'cover';
    if (el.radius) base.radius = num(el.radius, 0, 1000);
    if (el.stroke && el.stroke !== 'none') { base.stroke = color(el.stroke); base.strokeWidth = num(el.strokeWidth, 0.25, 40, 1); }
  }
  if (type === 'icon') {
    base.icon = ICONS.includes(el.icon) ? el.icon : 'i-browser';
    base.color = color(el.color, '@dk1');
    base.accent = color(el.accent, '@accent1');
  }
  return base;
}

function cleanTheme(t = {}) {
  const fallback = THEMES[t.id] || THEMES.proposta;
  const colors = {};
  for (const k of THEME_COLOR_KEYS) colors[k] = /^#[0-9a-f]{6}$/i.test(t.colors?.[k] || '') ? t.colors[k].toLowerCase() : fallback.colors[k];
  const font = f => FONT_CHOICES.includes(f) ? f : 'Arial';
  const master = (Array.isArray(t.master) ? t.master : fallback.master).slice(0, 20).map(e => cleanElement(e, { master: true }));
  return { id: str(t.id, 40) || 'custom', name: str(t.name, 60) || 'Tema', background: color(t.background, '@lt1'), colors, fonts: { heading: font(t.fonts?.heading), body: font(t.fonts?.body) }, master };
}

function cleanBackground(b) {
  if (!b) return null;
  if (typeof b === 'string') return COLOR.test(b) ? color(b) : null;
  if (b.image) return { image: imageSrc(b.image) || fail('Imagem de fundo inválida.'), fit: b.fit === 'contain' ? 'contain' : 'cover' };
  return null;
}

export function sanitizeDeck(input = {}, company = {}) {
  const title = str(input.title || input.name, 120).trim() || fail('Informe o título da apresentação.');
  const rawSlides = Array.isArray(input.slides) ? input.slides : [];
  if (!rawSlides.length) fail('A apresentação precisa ter pelo menos um slide.');
  if (rawSlides.length > LIMITS.slides) fail(`A apresentação pode ter no máximo ${LIMITS.slides} slides.`);
  const ids = new Set();
  const slides = rawSlides.map(s => {
    const elements = Array.isArray(s?.elements) ? s.elements : [];
    if (elements.length > LIMITS.elements) fail(`Cada slide pode ter no máximo ${LIMITS.elements} elementos.`);
    let id = str(s?.id, 64) || newId('s');
    while (ids.has(id)) id = newId('s');
    ids.add(id);
    const elIds = new Set();
    // Absent keys mean "inherit"; null is reserved by the ops for "remove this key", so it is never stored.
    const out = {
      id, layoutId: LAYOUT_IDS.has(s.layoutId) ? s.layoutId : 'blank', notes: str(s.notes, 5000),
      hideMaster: Boolean(s.hideMaster), skipped: Boolean(s.skipped),
      elements: elements.map(e => { const c = cleanElement(e); while (elIds.has(c.id)) c.id = newId('e'); elIds.add(c.id); return c; })
    };
    const background = cleanBackground(s.background);
    if (background) out.background = background;
    return out;
  });
  const brand = { name: str(input.brand?.name ?? input.agencyName ?? company.name, 80) || 'Minha Agência', logo: imageSrc(input.brand?.logo ?? input.agencyLogo ?? '') };
  const deck = withLegacyMirror({
    format: DECK_FORMAT, version: DECK_VERSION, title, description: str(input.description, 300),
    page: { ...PAGE }, theme: cleanTheme(input.theme), brand, rev: Number.isInteger(input.rev) && input.rev >= 0 ? input.rev : 0, slides
  });
  const id = str(input.id, 80);
  if (id) deck.id = id;
  if (JSON.stringify(deck).length > LIMITS.deckBytes) fail('A apresentação passou de 3,5 MB. Use imagens menores ou remova algumas.');
  return deck;
}
