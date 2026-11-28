// Rastreamento externo: (1) pixels of the sub-account (Google Analytics 4, Google Tag Manager and Meta
// Pixel) loaded on the Graao public pages through /t/<workspace>/pixels.js, and (2) a tracking script the
// business installs on its own website (/t/<workspace>.js): it records page views and turns HTML form
// submissions into contacts, with the visit's source (UTM, click ids, referrer).
import { randomUUID } from 'node:crypto';
import { cleanTouch } from './ui/ads-data.js';

export const trackingCollections = ['trackingEvents'];
export const trackingDefaults = () => ({ ga4: '', gtm: '', metaPixel: '', domains: [], pageviews: true, forms: true, videos: true, visitors: {} });

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : typeof value === 'number' ? String(value) : '';

export function trackingOf(s) {
  s.tracking = { ...trackingDefaults(), ...(s.tracking || {}) };
  if (!s.tracking.visitors || typeof s.tracking.visitors !== 'object') s.tracking.visitors = {};
  return s.tracking;
}

/** 'tracking-settings': pixel ids, the domains allowed to send events, and what the external script records. */
export function saveTracking(s, d) {
  const t = trackingOf(s);
  const id = (value, pattern, label) => { const v = str(value, 40).toUpperCase(); if (v && !pattern.test(v)) fail(`${label} inválido.`); return v; };
  if (d.ga4 !== undefined) t.ga4 = id(d.ga4, /^G-[A-Z0-9]{4,20}$/, 'ID de medição do GA4 (formato G-XXXXXXX)');
  if (d.gtm !== undefined) t.gtm = id(d.gtm, /^GTM-[A-Z0-9]{4,12}$/, 'ID do contêiner do Tag Manager (formato GTM-XXXXXX)');
  if (d.metaPixel !== undefined) { const v = str(d.metaPixel, 30); if (v && !/^\d{6,20}$/.test(v)) fail('ID do Pixel da Meta inválido (só números).'); t.metaPixel = v; }
  if (d.domains !== undefined) {
    const list = (Array.isArray(d.domains) ? d.domains : String(d.domains || '').split(/[\s,]+/)).map(v => str(v, 120).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')).filter(Boolean);
    for (const host of list) if (!/^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) fail(`Domínio inválido: ${host}`);
    t.domains = [...new Set(list)].slice(0, 20);
  }
  if (d.pageviews !== undefined) t.pageviews = Boolean(d.pageviews);
  if (d.forms !== undefined) t.forms = Boolean(d.forms);
  if (d.videos !== undefined) t.videos = Boolean(d.videos);
  return t;
}

/** May a page on this origin send events? With no domains set, any site may (like an embedded form). */
export function originAllowed(t, origin) {
  if (!t.domains?.length) return true;
  let host = '';
  try { host = new URL(origin).hostname.toLowerCase().replace(/^www\./, ''); } catch { return false; }
  return t.domains.some(d => d.startsWith('*.') ? host === d.slice(2) || host.endsWith(d.slice(1)) : host === d);
}

// ---- Pixels on the Graao public pages -------------------------------------------------------------
// Segurança: o Tag Manager roda o que o dono do contêiner quiser (tags de HTML personalizado), e as páginas públicas
// ficam na mesma origem do app. Por isso o servidor só o liga com GO_PUBLIC_GTM=1 ({ gtm: false } nos outros casos).
export const hasPixels = (t, { gtm = true } = {}) => Boolean(t?.ga4 || (gtm && t?.gtm) || t?.metaPixel);
const vendors = {
  script: ['https://www.googletagmanager.com', 'https://connect.facebook.net'],
  connect: ['https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com', 'https://www.facebook.com', 'https://connect.facebook.net'],
  img: ['https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://www.googletagmanager.com', 'https://www.facebook.com'],
  frame: ['https://www.googletagmanager.com']
};
/**
 * The page's CSP with the pixel vendors allowed. pixels.js comes from this site ('self') and loads the
 * vendors' scripts; nothing inline is added. Tag Manager tags that inject inline code stay blocked.
 */
export function widenCsp(csp, { gtm = true } = {}) {
  const parts = new Map(String(csp || '').split(';').map(p => p.trim()).filter(Boolean).map(p => { const [name, ...rest] = p.split(/\s+/); return [name, rest]; }));
  const add = (name, values) => {
    const cur = (parts.get(name) || []).filter(v => v !== "'none'");
    parts.set(name, [...new Set([...cur, ...values])]);
  };
  add('script-src', ["'self'", ...vendors.script]);
  add('connect-src', ["'self'", ...vendors.connect]);
  if (!(parts.get('img-src') || []).includes('https:')) add('img-src', vendors.img);
  if (gtm) add('frame-src', vendors.frame);
  return [...parts].map(([name, values]) => [name, ...values].join(' ')).join('; ');
}
/** The pixels loader tag, before </head> (or at the start of a fragment). */
export function injectPixels(html, workspace) {
  const tag = `<script src="/t/${workspace}/pixels.js" async></script>`;
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${tag}</head>`) : tag + html;
}

/**
 * pixels.js: GA4, Tag Manager and Meta Pixel. Forms decided by the server (data-graao-lead) and bookings count through a
 * marker the server puts on the next page (?graao_ev=lead.<id> or <meta name="graao-event">), so a disqualified lead never
 * counts and a reload never counts twice. Other public forms keep sending Lead on submit. Inside a frame of the same
 * site the page view was already counted by the page around it.
 */
export function pixelsScript(t, { gtm = true } = {}) {
  if (!hasPixels(t, { gtm })) return '/* Nenhum pixel configurado. */';
  const cfg = JSON.stringify({ ga4: t.ga4 || '', gtm: (gtm && t.gtm) || '', meta: t.metaPixel || '' });
  return `(function(){var c=${cfg},w=window,d=document,inner=false;try{inner=w.parent!==w&&w.parent.location.origin===location.origin;}catch(e){}
function load(src){var s=d.createElement('script');s.async=true;s.src=src;d.head.appendChild(s);}
w.dataLayer=w.dataLayer||[];
if(c.gtm){w.dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});load('https://www.googletagmanager.com/gtm.js?id='+encodeURIComponent(c.gtm));}
if(c.ga4){w.gtag=w.gtag||function(){w.dataLayer.push(arguments);};w.gtag('js',new Date());w.gtag('config',c.ga4,inner?{send_page_view:false}:{});load('https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(c.ga4));}
if(c.meta){var f=w.fbq=w.fbq||function(){f.callMethod?f.callMethod.apply(f,arguments):f.queue.push(arguments);};if(!w._fbq)w._fbq=f;f.push=f;f.loaded=true;f.version='2.0';f.queue=f.queue||[];
w.fbq('init',c.meta);if(!inner)w.fbq('track','PageView');load('https://connect.facebook.net/en_US/fbevents.js');}
var q=new URLSearchParams(location.search),m=d.querySelector('meta[name="graao-event"]'),ev=q.get('graao_ev')||(m&&m.getAttribute('content'))||'',kind=ev.split('.')[0],
fb={lead:'Lead',schedule:'Schedule'}[kind],ga={lead:'generate_lead',schedule:'schedule'}[kind];
if(fb){var seen=null;try{seen=w.sessionStorage.getItem('graao_ev_'+ev);w.sessionStorage.setItem('graao_ev_'+ev,'1');}catch(e){}
if(!seen){if(w.fbq&&c.meta)w.fbq('track',fb,{},{eventID:ev});if(w.gtag&&c.ga4)w.gtag('event',ga);if(c.gtm)w.dataLayer.push({event:'graao_'+kind});}}
if(q.has('graao_ev')){q.delete('graao_ev');var rest=q.toString();try{w.history.replaceState(null,'',location.pathname+(rest?'?'+rest:'')+location.hash);}catch(e){}}
d.addEventListener('submit',function(e){var t=e&&e.target;if(t&&t.hasAttribute&&t.hasAttribute('data-graao-lead'))return;if(w.gtag&&c.ga4)w.gtag('event','generate_lead');if(w.fbq&&c.meta)w.fbq('track','Lead');if(c.gtm)w.dataLayer.push({event:'graao_lead'});},true);
})();`;
}

// ---- The script for the business's own website ---------------------------------------------------
/**
 * /t/<workspace>.js: keeps an anonymous visitor id and the first/last touch in localStorage, sends a
 * page view, and sends HTML forms that have an e-mail or phone field (forms marked data-graao-ignore and
 * password, card or document fields are never read). Events go with navigator.sendBeacon.
 */
export function trackerScript(workspace, origin, t) {
  const cfg = JSON.stringify({ endpoint: `${origin}/t/${workspace}/e`, pageviews: t.pageviews !== false, forms: t.forms !== false, videos: t.videos !== false });
  return `(function(){if(window.__graaoTracker)return;window.__graaoTracker=1;var c=${cfg},w=window,d=document,ls;
try{ls=w.localStorage;ls.setItem('graao_t','1');}catch(e){ls=null;}
function get(k){try{return ls&&JSON.parse(ls.getItem(k)||'null');}catch(e){return null;}}function set(k,v){try{ls&&ls.setItem(k,JSON.stringify(v));}catch(e){}}
var vid=get('graao_vid');if(!vid){vid=(Date.now().toString(36)+Math.random().toString(36).slice(2,12));set('graao_vid',vid);}
var q=new URLSearchParams(location.search),ref='';try{ref=d.referrer?new URL(d.referrer).hostname.replace(/^www\\./,''):'';}catch(e){}
if(ref===location.hostname.replace(/^www\\./,''))ref='';
var t={source:q.get('utm_source')||'',medium:q.get('utm_medium')||'',campaign:q.get('utm_campaign')||'',content:q.get('utm_content')||'',term:q.get('utm_term')||'',utmId:q.get('utm_id')||'',gclid:q.get('gclid')||q.get('gbraid')||q.get('wbraid')||'',fbclid:q.get('fbclid')||'',referrer:ref,landing:location.pathname.slice(0,200),at:new Date().toISOString()};
if(t.source||t.medium||t.campaign||t.utmId||t.gclid||t.fbclid||t.referrer){if(!get('graao_ft'))set('graao_ft',t);set('graao_lt',t);}
function send(body){body.vid=vid;body.url=location.href.slice(0,500);body.title=(d.title||'').slice(0,200);body.touches={first:get('graao_ft'),last:get('graao_lt')};
var data=JSON.stringify(body);if(navigator.sendBeacon&&navigator.sendBeacon(c.endpoint,new Blob([data],{type:'text/plain'})))return;
try{fetch(c.endpoint,{method:'POST',body:data,keepalive:true,mode:'no-cors',headers:{'Content-Type':'text/plain'}});}catch(e){}}
if(c.pageviews)send({type:'pageview'});
var skip=/pass|senha|card|cartao|cvv|cvc|cpf|cnpj|rg|ssn|token|secret/i;
d.addEventListener('submit',function(ev){if(!c.forms)return;var f=ev.target;if(!f||!f.elements||f.hasAttribute('data-graao-ignore'))return;var out={},n=0;
for(var i=0;i<f.elements.length&&n<40;i++){var el=f.elements[i],k=el.name||el.id;if(!k||el.disabled||skip.test(k)||/^(password|file|submit|button|hidden)$/.test(el.type))continue;
if((el.type==='checkbox'||el.type==='radio')&&!el.checked)continue;out[k.slice(0,60)]=String(el.value||'').slice(0,500);n++;}
send({type:'form',form:(f.getAttribute('name')||f.id||f.getAttribute('action')||'').slice(0,120),fields:out});},true);
w.graao={track:function(name){send({type:'pageview',event:String(name||'').slice(0,60)});}};
var marks=[25,50,75,100];function watch(v){if(v.__graao)return;v.__graao={};var mark=function(m){if(v.__graao[m])return;v.__graao[m]=1;send({type:'video',event:String(m),video:String(v.currentSrc||v.src||'').slice(0,300),name:String(v.getAttribute('title')||v.getAttribute('aria-label')||'').slice(0,120)});};
v.addEventListener('timeupdate',function(){if(!v.duration||!isFinite(v.duration))return;var p=v.currentTime/v.duration*100;for(var i=0;i<marks.length;i++)if(p>=marks[i]-0.5)mark(marks[i]);});v.addEventListener('ended',function(){mark(25);mark(50);mark(75);mark(100);});}
function scan(){var l=d.getElementsByTagName('video');for(var i=0;i<l.length;i++)watch(l[i]);}if(c.videos){scan();setInterval(scan,3000);}
})();`;
}

const emailKey = /e-?mail/i, phoneKey = /phone|fone|tel|whats|celular|mobile/i, nameKey = /^(name|nome|full_?name|nome_?completo|your-name|first_?name|primeiro_?nome)$/i;
const lastKey = /^(last_?name|sobrenome)$/i, companyKey = /company|empresa|organi[sz]ation/i;
/** Contact details found in the fields of an external form. */
export function contactFromFields(fields) {
  const out = { name: '', email: '', phone: '', company: '' };
  let last = '';
  for (const [key, raw] of Object.entries(fields || {})) {
    const value = str(raw, 240);
    if (!value) continue;
    if (!out.email && (emailKey.test(key) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) out.email = value.toLowerCase();
    else if (!out.phone && phoneKey.test(key) && value.replace(/\D/g, '').length >= 8) out.phone = value.slice(0, 40);
    else if (!out.name && nameKey.test(key)) out.name = value.slice(0, 120);
    else if (lastKey.test(key)) last = value.slice(0, 80);
    else if (!out.company && companyKey.test(key)) out.company = value.slice(0, 120);
  }
  if (last) out.name = `${out.name} ${last}`.trim();
  return out;
}

/**
 * 'tracking-event' (public): a page view or a form sent from the business's site. Forms with an e-mail
 * or phone find or create the contact, keep the answers as a note and link the visitor to the contact,
 * so later page views count for the contact (workflows and lead scoring).
 */
export function trackingEvent(s, d, { add, run, now }) {
  const event = newTrackingEvent(s, d, now);
  if (!event) return null;
  const { row, contact: info } = event, { vid, url, type } = row, t = trackingOf(s);
  const events = s.trackingEvents ??= [];
  if (info) {
    const digits = v => String(v || '').replace(/\D/g, '');
    let contact = (info.email && s.contacts.find(c => c.email === info.email)) || (info.phone && s.contacts.find(c => digits(c.phone) && digits(c.phone) === digits(info.phone)));
    if (!contact) {
      contact = add(s, 'contacts', { name: info.name || info.email || info.phone, email: info.email, phone: info.phone, company: info.company, tags: ['Site externo'], notes: '', source: 'Site externo' });
      run(s, 'Contact created', { contactId: contact.id });
    } else {
      for (const k of ['phone', 'email', 'company']) if (!contact[k] && info[k]) contact[k] = info[k];
      if (!contact.name && info.name) contact.name = info.name;
      contact.updated = now();
    }
    const body = [`Formulário do site${row.form ? ` (${row.form})` : ''}${url ? ` · ${url}` : ''}`, ...Object.entries(row.fields).map(([k, v]) => `${k}: ${v}`)].join('\n').slice(0, 5000);
    add(s, 'messages', { contactId: contact.id, body, channel: 'Note', direction: 'Inbound', read: false, starred: false, origin: 'tracking' });
    row.contactId = contact.id;
    t.visitors[vid] = contact.id;
    const keys = Object.keys(t.visitors);
    if (keys.length > 5000) for (const k of keys.slice(0, keys.length - 5000)) delete t.visitors[k];
  }
  events.push(row);
  if (events.length > 5000) events.splice(0, events.length - 5000);
  // "Vídeo assistido": 25, 50, 75 and 100% of an HTML5 video, once each per page load, for a known visitor.
  if (row.contactId && type === 'video') run(s, 'video_watched', { contactId: row.contactId, percent: Number(row.event), video: row.name || row.video, url });
  else if (row.contactId) run(s, 'external_tracking_event', { contactId: row.contactId, event: type, url, name: row.event || row.form });
  return row.id;
}

/**
 * The same event checked against the settings, without saving anything: { row, contact } (contact: the
 * details found in a form, or null), or null when the sub-account turned that recording off.
 */
export function newTrackingEvent(s, d, now = () => new Date().toISOString()) {
  const t = trackingOf(s);
  const vid = /^[a-z0-9]{6,40}$/i.test(String(d.vid || '')) ? String(d.vid) : '';
  if (!vid) fail('Visitante inválido.');
  const type = d.type === 'form' ? 'form' : d.type === 'video' ? 'video' : 'pageview';
  if (type === 'form' && t.forms === false) return null;
  if (type === 'video' && (t.videos === false || !['25', '50', '75', '100'].includes(String(d.event)))) return null;
  if (type === 'pageview' && t.pageviews === false) return null;
  let url = '';
  try { const u = new URL(str(d.url, 500)); if (['http:', 'https:'].includes(u.protocol)) url = `${u.origin}${u.pathname}${u.search}`.slice(0, 500); } catch { /* kept empty */ }
  /** @type {Record<string, any>} */
  const row = { id: randomUUID(), created: now(), type, vid, url, title: str(d.title, 200), event: str(d.event, 60), contactId: t.visitors[vid] || '',
    ...(type === 'video' ? { video: str(d.video, 300), name: str(d.name, 120) } : {}) };
  let contact = null;
  if (type === 'form') {
    row.form = str(d.form, 120);
    row.fields = Object.fromEntries(Object.entries(d.fields && typeof d.fields === 'object' ? d.fields : {}).slice(0, 40).map(([k, v]) => [str(k, 60), str(v, 500)]).filter(([k]) => k));
    const info = contactFromFields(row.fields);
    if (info.email || info.phone) contact = info;
  }
  return { row, contact };
}

// ---- Sites and funnels published on the Graao ----------------------------------------------------------
const visitorId = value => /^[a-z0-9]{6,40}$/i.test(String(value || '')) ? String(value) : '';

/** A form sent from a Graao site: that browser (its visitor cookie) is now this contact. */
export function linkVisitor(s, vid, contactId) {
  const id = visitorId(vid);
  if (!id || !contactId) return;
  const visitors = trackingOf(s).visitors;
  visitors[id] = contactId;
  const keys = Object.keys(visitors);
  if (keys.length > 5000) for (const k of keys.slice(0, keys.length - 5000)) delete visitors[k];
}

const SITE_VIEW_GAP = 30 * 60000;
/**
 * 'site-pageview' (server only): a page of a published site or funnel opened by a browser the sub-account
 * knows. Fires "Página do site ou funil visitada" once per contact and page every 30 minutes.
 */
export function sitePageview(s, d, { run, now }) {
  const t = trackingOf(s);
  const contactId = t.visitors[visitorId(d.vid)];
  if (!contactId || !s.contacts.some(row => row.id === contactId)) return '';
  const pageId = str(d.pageId, 60), page = str(d.page, 60).toLowerCase() || 'index', projectId = str(d.projectId, 60);
  const views = t.siteViews && typeof t.siteViews === 'object' ? t.siteViews : (t.siteViews = {});
  const key = `${contactId}:${pageId || page}`, at = now();
  if (views[key] && Date.parse(at) - Date.parse(views[key]) < SITE_VIEW_GAP) return '';
  views[key] = at;
  const keys = Object.keys(views);
  if (keys.length > 2000) for (const k of keys.slice(0, keys.length - 2000)) delete views[k];
  const project = (s.studioProjects || []).find(row => row.id === projectId);
  run(s, 'site_page_viewed', { contactId, projectId, pageId, page, site: project?.name || '', kind: project?.kind || '' });
  return contactId;
}

/** The touches sent by the external script, checked like the cookie ones. */
export const touchesFrom = d => ({ first: cleanTouch(d?.touches?.first), last: cleanTouch(d?.touches?.last) });
