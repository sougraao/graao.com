// Ilustrações dos templates de setup (uma por segmento da GHL, 123 no total, e a do funil de reuniões), no estilo editorial da graao.
// Os SVGs ficam em /setup-art/<chave>.svg e usam 4 cores: o pink e o laranja viram as duas cores da conta
// (--g-brand e --g-brand-2, via --ilu-primaria/--ilu-secundaria em agency.css); preto e branco são fixos.
// Para herdar essas variáveis o SVG precisa estar no DOM, então setupArt() devolve um contêiner leve e o
// arquivo é buscado e inserido quando o card entra na tela (e fica em cache para os próximos renders).

export const setupArtBySegment = {
  agency: ['affiliate-marketing-agency', 'content-creator', 'crm-software', 'event-marketing', 'funil-reunioes-qualificadas', 'marketing-agency', 'public-relations-firm', 'saas', 'visual-advertising-agency'],
  auto: ['auto-body-and-painting', 'auto-dealer-sales', 'automotive-detailing', 'automotive-repair-mechanic', 'brake-muffler-shop', 'car-rental-agency', 'roadside-assistance', 'tire-shop', 'towing-service'],
  beauty: ['barber-shop', 'clothing-boutique-tailor', 'day-spa', 'eyelash-salon', 'hair-salon', 'jewelry-shop', 'modeling-agency', 'nail-salon', 'skin-care-clinic'],
  coaching: ['business-coaching', 'career-coach', 'education-tutor', 'financial-consultant', 'it-consultant', 'life-coach', 'real-estate-consultant', 'stocks-trading-advisor'],
  creative: ['copywriter', 'dance-company', 'event-planner', 'floral-shop', 'graphic-design', 'interior-design', 'photographer', 'tattoo-shop', 'video-producer', 'web-designer'],
  finance: ['accounting-firm', 'banking-and-payment', 'bookkeeper', 'credit-repair', 'financial-investor', 'financial-planner', 'lender', 'tax-accounting'],
  food: ['bakery', 'bistro', 'caterer', 'coffee-shop', 'donut-shop', 'ice-cream-shop', 'steakhouse'],
  health: ['gym', 'holistic-wellness', 'martial-arts', 'mental-health-clinic', 'nutrition-wellness', 'personal-trainer', 'weight-loss', 'wellness-coaching', 'wellness-retreat', 'yoga'],
  home: ['appliance-repair-shop', 'construction-company', 'dry-cleaners', 'electrician', 'housekeeper', 'hvac', 'landscaping', 'pest-control', 'plumber', 'pressure-washing', 'roofing', 'solar'],
  insurance: ['commercial-insurance', 'life-insurance', 'p-c-insurance', 'travel-insurance'],
  legal: ['bankruptcy-lawyer', 'compensation-lawyer', 'defense-lawyer', 'family-lawyer', 'immigration-lawyer', 'mediation-services', 'personal-injury-attorney', 'real-estate-attorney'],
  medical: ['chiropractor', 'dental', 'dermatologist', 'family-practice-physician', 'hair-loss-clinic', 'home-health-care', 'medical-spa', 'optometrist', 'physical-therapy-clinic'],
  other: ['assisted-living-facility', 'child-care', 'locksmith', 'pet-groomer', 'phone-repair-shop'],
  realestate: ['architecture-firm', 'home-inspector', 'home-staging', 'mortgage-lender', 'property-investor', 'property-management', 'real-estate-agent', 'real-estate-broker', 'title-company'],
  travel: ['bed-and-breakfast', 'boat-tour-agency', 'campground', 'hotel', 'rv-rental-agency', 'short-term-rental-management', 'travel-agency']
};

const allKeys = new Set(Object.values(setupArtBySegment).flat());
const hash = text => [...String(text)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const esc = text => String(text).replace(/[<>&"]/g, '');

// Template oficial ("template-<chave>") usa a própria ilustração; qualquer outro setup recebe uma
// ilustração fixa do mesmo segmento, escolhida pelo hash do id.
export function setupArtKey(segment, seed = segment) {
  const own = String(seed || '').replace(/^template-/, '');
  if (String(seed).startsWith('template-') && allKeys.has(own)) return own;
  const pool = setupArtBySegment[segment] || setupArtBySegment.other;
  return pool[hash(seed) % pool.length];
}

export function setupArt(segment, seed = segment, label = '') {
  const key = setupArtKey(segment, seed);
  const cached = cache.get(key);
  const inner = typeof cached === 'string' ? cached : '';
  return `<span class="ag-art ag-ilu" role="img" aria-label="${esc(label)}" data-ilu="${key}"${inner ? ' data-ilu-ok' : ''}>${inner}</span>`;
}

const cache = new Map(); // chave -> texto do SVG (ou Promise enquanto carrega)

function load(key) {
  if (!cache.has(key)) {
    cache.set(key, fetch(`/setup-art/${key}.svg`)
      .then(r => (r.ok ? r.text() : Promise.reject(new Error(r.status))))
      .then(text => (text.trimStart().startsWith('<svg') ? text : Promise.reject(new Error('svg inválido'))))
      .then(text => { cache.set(key, text); return text; })
      .catch(() => { cache.delete(key); return ''; }));
  }
  const value = cache.get(key);
  return typeof value === 'string' ? Promise.resolve(value) : value;
}

async function fill(el) {
  if (el.hasAttribute('data-ilu-ok')) return;
  el.setAttribute('data-ilu-ok', '');
  const text = await load(el.dataset.ilu);
  if (text && el.isConnected) el.innerHTML = text;
  else el.removeAttribute('data-ilu-ok');
}

function watch() {
  const seen = new WeakSet();
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); fill(e.target); } }), { rootMargin: '300px' })
    : null;
  const scan = root => root.querySelectorAll?.('[data-ilu]:not([data-ilu-ok])').forEach(el => {
    if (seen.has(el)) return;
    seen.add(el);
    io ? io.observe(el) : fill(el);
  });
  new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 && (n.matches?.('[data-ilu]') ? scan(n.parentNode || n) : scan(n))))).observe(document.documentElement, { childList: true, subtree: true });
  scan(document);
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch, { once: true });
  else watch();
}
