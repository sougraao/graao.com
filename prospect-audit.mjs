// Automated marketing audit for prospects: website health, marketing stack,
// social presence and Google Business Profile completeness.
//
// Scoring mirrors the public methodology of the HighLevel prospecting audit:
// website health = loading speed 40% (PageSpeed, mobile 70% / desktop 30%),
// on-page SEO 20%, security 20%, compliance & consent 20%.
//
// Only derived checks and scores are persisted. Raw Google Places content
// (rating, phone, hours) is read live and never stored, matching the Places
// caching terms already followed by the Maps search.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { findPlace, placeDetails, placesConfigured } from './prospecting-places.mjs';

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 5;
const PAGE_TIMEOUT = 12_000;
const PSI_TIMEOUT = 45_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; GraaoAudit/1.0; +https://graao.com)';
const psiKey = process.env.PROSPECTING_PAGESPEED_KEY?.trim() || '';

// ---------- Network safety ----------

export function blockedAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a,b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19));
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return blockedAddress(mapped[1]);
    return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('::ffff:') || v.startsWith('64:ff9b') || v.startsWith('2001:db8');
  }
  return true;
}

function safeLookup(hostname,options,callback) {
  dns.lookup(hostname,{ ...options, all:true },(error,addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(item => blockedAddress(item.address))) {
      return callback(Object.assign(new Error('Endereço bloqueado.'),{ code:'EBLOCKED' }));
    }
    if (options.all) return callback(null,addresses);
    return callback(null,addresses[0].address,addresses[0].family);
  });
}

export function auditableUrl(value) {
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.')) return null;
    if (url.port && !['80','443'].includes(url.port)) return null;
    const host = url.hostname.replace(/^\[|\]$/g,'');
    if (net.isIP(host) && blockedAddress(host)) return null;
    if (/(^|\.)(localhost|local|internal|localdomain)$/i.test(host)) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}

function requestOnce(url,{ method = 'GET',maxBytes = MAX_BYTES,timeout = PAGE_TIMEOUT } = {}) {
  return new Promise((resolve,reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const started = Date.now();
    const req = client.request(url,{ method,lookup:safeLookup,timeout,headers:{
      'User-Agent':USER_AGENT,Accept:'text/html,application/xhtml+xml,*/*;q=0.8','Accept-Language':'pt-BR,pt;q=0.9,en;q=0.6'
    } },res => {
      const ttfb = Date.now()-started;
      const chunks = [];
      let size = 0, truncated = false;
      res.on('data',chunk => {
        size += chunk.length;
        if (size > maxBytes) { truncated = true; res.destroy(); return; }
        chunks.push(chunk);
      });
      res.on('close',() => resolve({ status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks),truncated,ttfb,total:Date.now()-started,url:url.href }));
      res.on('error',reject);
    });
    req.on('timeout',() => req.destroy(Object.assign(new Error('Tempo esgotado.'),{ code:'ETIMEDOUT' })));
    req.on('error',reject);
    req.end();
  });
}

export async function fetchPage(input,options = {}) {
  let url = typeof input === 'string' ? auditableUrl(input) : input;
  if (!url) throw Object.assign(new Error('Endereço inválido.'),{ code:'EINVALID' });
  const chain = [];
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await requestOnce(url,options);
    chain.push({ url:url.href,status:response.status });
    const location = response.headers.location;
    if (response.status >= 300 && response.status < 400 && location) {
      const next = auditableUrl(new URL(location,url).href);
      if (!next) throw Object.assign(new Error('Redirecionamento bloqueado.'),{ code:'EBLOCKED' });
      url = next;
      continue;
    }
    const type = String(response.headers['content-type'] || '');
    const charset = /charset=(iso-8859-1|latin1|windows-1252)/i.test(type) ? 'latin1' : 'utf8';
    return { ...response,chain,text:response.body.toString(charset) };
  }
  throw Object.assign(new Error('Redirecionamentos demais.'),{ code:'EREDIRECT' });
}

// ---------- PageSpeed Insights ----------

export async function pageSpeed(url,strategy) {
  const params = new URLSearchParams({ url,strategy,locale:'pt-BR' });
  params.append('category','performance');
  if (psiKey) params.set('key',psiKey);
  const response = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`,{ signal:AbortSignal.timeout(PSI_TIMEOUT) });
  if (!response.ok) throw new Error(`PageSpeed ${response.status}`);
  const json = await response.json();
  const audits = json.lighthouseResult?.audits || {};
  const score = json.lighthouseResult?.categories?.performance?.score;
  if (!Number.isFinite(score)) throw new Error('PageSpeed sem pontuação');
  const metric = key => audits[key]?.displayValue || '';
  return { score:Math.round(score*100),lcp:metric('largest-contentful-paint'),cls:metric('cumulative-layout-shift'),tbt:metric('total-blocking-time') };
}

// ---------- HTML analysis ----------

const attr = (tag,name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,'i'))?.slice(1).find(v => v !== undefined) ?? null;
const tags = (html,name) => html.match(new RegExp(`<${name}\\b[^>]*>`,'gi')) || [];
const metaContent = (html,key) => {
  const tag = tags(html,'meta').find(item => (attr(item,'name') || attr(item,'property') || '').toLowerCase() === key);
  return tag ? (attr(tag,'content') || '').trim() : null;
};
const entities = { amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ' };
const decode = value => value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,(match,code) => {
  if (code[0] === '#') {
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2),16) : Number(code.slice(1));
    return point > 0 && point < 0x110000 ? String.fromCodePoint(point) : match;
  }
  return entities[code.toLowerCase()] ?? match;
});
const plain = value => decode(String(value || '').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();

export const stackCatalog = [
  // [key, label, group, pattern]
  ['ga4','Google Analytics','analytics',/googletagmanager\.com\/gtag\/js\?id=G-|gtag\(\s*['"]config['"]\s*,\s*['"]G-|google-analytics\.com\/(analytics|ga)\.js/i],
  ['gtm','Google Tag Manager','analytics',/googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/],
  ['clarity','Microsoft Clarity','analytics',/clarity\.ms\/tag/i],
  ['hotjar','Hotjar','analytics',/static\.hotjar\.com|hotjar\.com\/c\/hotjar/i],
  ['metaPixel','Meta Pixel','ads',/connect\.facebook\.net\/[^"']*\/fbevents\.js|fbq\(\s*['"]init/i],
  ['googleAds','Google Ads','ads',/googleadservices\.com|gtag\(\s*['"]config['"]\s*,\s*['"]AW-|['"]AW-\d{6,}/i],
  ['tiktokPixel','TikTok Pixel','ads',/analytics\.tiktok\.com|ttq\.load\(/i],
  ['linkedinInsight','LinkedIn Insight','ads',/snap\.licdn\.com\/li\.lms-analytics|_linkedin_partner_id/i],
  ['rdstation','RD Station','crm',/d335luupugsy2\.cloudfront\.net|rdstation\.com\.br|rd-station/i],
  ['hubspot','HubSpot','crm',/js\.hs-scripts\.com|js\.hsforms\.net|hs-analytics/i],
  ['whatsapp','Botão de WhatsApp','chat',/wa\.me\/|api\.whatsapp\.com\/send|web\.whatsapp\.com\/send/i],
  ['chatWidget','Chat no site','chat',/widget\.intercom\.io|js\.intercomcdn\.com|static\.zdassets\.com|embed\.tawk\.to|code\.jivosite\.com|jivochat|client\.crisp\.chat|js\.driftt\.com|widgets\.leadconnectorhq\.com|tidio\.co|chatwoot|zenvia|blip\.ai|octadesk/i],
  ['booking','Agendamento online','conversion',/calendly\.com|doctoralia|agendor|simplybook|booksy\.com|agenda\.com\.br/i],
  ['schema','Dados estruturados (Schema.org)','seo',/application\/ld\+json/i],
  ['wordpress','WordPress','cms',/wp-content\/|wp-includes\/|<meta[^>]+generator[^>]+wordpress/i],
  ['wix','Wix','cms',/static\.wixstatic\.com|wix\.com website builder|_wixCssImports/i],
  ['squarespace','Squarespace','cms',/static1\.squarespace\.com|squarespace-cdn/i],
  ['webflow','Webflow','cms',/assets\.website-files\.com|data-wf-page|cdn\.prod\.website-files\.com/i],
  ['framer','Framer','cms',/framerusercontent\.com|framer\.com\/m\//i],
  ['shopify','Shopify','cms',/cdn\.shopify\.com|Shopify\.theme/i],
  ['nuvemshop','Nuvemshop','cms',/d26lpennugtm8s\.cloudfront\.net|nuvemshop|tiendanube/i],
  ['leadconnector','LeadConnector','cms',/leadconnectorhq\.com|msgsndr\.com|filesafe\.space/i]
];

const socialCatalog = [
  ['instagram','Instagram',/https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/|explore\/|accounts\/)([A-Za-z0-9_.]{2,30})/i],
  ['facebook','Facebook',/https?:\/\/(?:www\.|m\.|pt-br\.)?facebook\.com\/(?!sharer|share|dialog|plugins|tr\b|tr\?)([A-Za-z0-9_.-]{2,80})/i],
  ['linkedin','LinkedIn',/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in|school)\/([A-Za-z0-9_-]{2,100})/i],
  ['tiktok','TikTok',/https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]{2,30})/i],
  ['youtube','YouTube',/https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)([A-Za-z0-9_.-]{2,100})/i],
  ['x','X (Twitter)',/https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!intent|share|home)([A-Za-z0-9_]{2,15})/i]
];

const check = (key,label,ok,detail = '') => ({ key,label,ok,...(detail ? { detail } : {}) });
const pct = rows => {
  const scored = rows.filter(row => row.ok !== null);
  return scored.length ? Math.round(scored.filter(row => row.ok).length/scored.length*100) : null;
};

export function analyzeHtml(html,{ url,headers = {},httpRedirectsToHttps = null,sitemap = null,robots = null } = {}) {
  const head = html.slice(0,400_000);
  const title = plain(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
  const description = metaContent(head,'description');
  const h1 = (html.match(/<h1\b[\s\S]*?<\/h1>/gi) || []).map(plain).filter(Boolean);
  const robotsMeta = (metaContent(head,'robots') || '').toLowerCase();
  const images = tags(html,'img');
  const withAlt = images.filter(tag => (attr(tag,'alt') || '').trim()).length;
  const lang = attr(tags(head,'html')[0] || '','lang');
  const canonical = tags(head,'link').some(tag => /canonical/i.test(attr(tag,'rel') || ''));
  const viewport = metaContent(head,'viewport');
  const ogTitle = metaContent(head,'og:title');
  const https = url?.startsWith('https:');
  const hsts = Boolean(headers['strict-transport-security']);
  const lower = html.toLowerCase();
  const links = (html.match(/href\s*=\s*["'][^"']+["']/gi) || []).map(item => item.replace(/^href\s*=\s*["']|["']$/gi,''));
  const anchorText = html.match(/<a\b[\s\S]*?<\/a>/gi) || [];
  const linkMatches = pattern => links.some(href => pattern.test(href)) || anchorText.some(a => pattern.test(plain(a)));

  const seo = [
    check('title','Título da página (10–70 caracteres)',title.length >= 10 && title.length <= 70,title ? `${title.length} caracteres` : 'Ausente'),
    check('description','Meta description (50–170 caracteres)',Boolean(description) && description.length >= 50 && description.length <= 170,description ? `${description.length} caracteres` : 'Ausente'),
    check('h1','Um título principal (H1)',h1.length === 1,`${h1.length} encontrado(s)`),
    check('viewport','Adaptado para celular (viewport)',Boolean(viewport)),
    check('lang','Idioma declarado',Boolean(lang),lang || ''),
    check('canonical','URL canônica',canonical),
    check('alt','Imagens com texto alternativo',images.length ? withAlt/images.length >= 0.8 : null,images.length ? `${withAlt} de ${images.length}` : 'Sem imagens'),
    check('indexable','Página indexável',!/noindex/.test(robotsMeta) && !/noindex/i.test(String(headers['x-robots-tag'] || ''))),
    check('opengraph','Prévia para redes sociais (Open Graph)',Boolean(ogTitle)),
    check('sitemap','Sitemap XML',sitemap),
    check('robots','Arquivo robots.txt',robots)
  ];
  const security = [
    check('https','Página servida por HTTPS',Boolean(https)),
    check('certificate','Certificado SSL válido',Boolean(https)),
    check('redirect','HTTP redireciona para HTTPS',httpRedirectsToHttps),
    check('hsts','HSTS ativo',hsts)
  ];
  const securityInfo = [
    check('csp','Content-Security-Policy',Boolean(headers['content-security-policy'])),
    check('frame','Proteção contra iframe (X-Frame-Options)',Boolean(headers['x-frame-options']) || /frame-ancestors/i.test(String(headers['content-security-policy'] || ''))),
    check('nosniff','X-Content-Type-Options',/nosniff/i.test(String(headers['x-content-type-options'] || '')))
  ];
  const consentTools = /cookiebot|onetrust|cookieyes|cookie-law-info|complianz|cookie-notice|termly|iubenda|usercentrics|adopt\.?tech|lgpd-cookie|cookieconsent|cookie-consent/i;
  const compliance = [
    check('privacy','Política de privacidade',linkMatches(/privacidade|privacy|pol[ií]tica-de-dados|lgpd/i)),
    check('terms','Termos de uso',linkMatches(/termos|terms|condi[cç][oõ]es/i)),
    check('consent','Aviso de cookies (LGPD)',consentTools.test(html) || (/cookies?/i.test(lower) && /(aceitar|aceito|concordo|accept)/i.test(lower))),
    check('contact','Contato visível (telefone, e-mail ou WhatsApp)',links.some(href => /^(tel:|mailto:)|wa\.me|whatsapp\.com/i.test(href)))
  ];
  const stack = stackCatalog.filter(([, , ,pattern]) => pattern.test(html)).map(([key,label,group]) => ({ key,label,group }));
  const social = [];
  for (const [network,label,pattern] of socialCatalog) {
    const found = links.find(href => pattern.test(href));
    if (found) social.push({ network,label,url:found.split(/[?#]/)[0].slice(0,300) });
  }
  return { title:title.slice(0,160),seo,security,securityInfo,compliance,stack,social };
}

// ---------- Scoring ----------

function estimatedSpeed(page) {
  const kb = page.body.length/1024;
  const ttfbScore = page.ttfb <= 600 ? 100 : page.ttfb >= 3000 ? 10 : Math.round(100-(page.ttfb-600)/2400*90);
  const sizeScore = kb <= 300 ? 100 : kb >= 1500 ? 30 : Math.round(100-(kb-300)/1200*70);
  return Math.round(ttfbScore*0.7+sizeScore*0.3);
}

export function websiteHealth({ performance,seo,security,compliance }) {
  const parts = [[performance?.score,0.4],[pct(seo),0.2],[pct(security),0.2],[pct(compliance),0.2]].filter(([value]) => Number.isFinite(value));
  const weight = parts.reduce((sum,[,w]) => sum+w,0);
  return weight ? Math.round(parts.reduce((sum,[value,w]) => sum+value*w,0)/weight) : null;
}

export function reputationScore(rating,count) {
  if (!Number.isFinite(rating)) return null;
  const quality = Math.max(0,Math.min(1,(rating-1)/4))*7;
  const volume = Math.min(3,Math.log10((count || 0)+1)*1.2);
  return Math.round((quality+volume)*10)/10;
}

const round = value => Number.isFinite(value) ? Math.round(value*10)/10 : null;

export function auditSignals(audit) {
  const health = audit.website?.health;
  const stack = new Set((audit.stack || []).map(item => item.key));
  const ads = !audit.website?.reachable ? null :
    (stack.has('ga4') || stack.has('gtm') ? 4 : 0) + (stack.has('metaPixel') ? 3 : 0) + (stack.has('googleAds') ? 2 : 0) +
    (stack.has('tiktokPixel') || stack.has('linkedinInsight') ? 1 : 0);
  return {
    website:audit.website ? round(Number.isFinite(health?.score) ? health.score/10 : 0) : null,
    reviews:round(audit.reputation?.score),
    listings:round(Number.isFinite(audit.profile?.score) ? audit.profile.score/10 : null),
    social:audit.website?.reachable ? round(Math.min(10,(audit.social || []).length*2.5)) : null,
    ads:round(ads)
  };
}

// ---------- Collection ----------

function profileChecks(place) {
  const photos = place.photos?.length || 0;
  const rows = [
    check('found','Empresa encontrada no Google Maps',true),
    check('operational','Status ativo no Google',place.businessStatus ? place.businessStatus === 'OPERATIONAL' : null),
    check('phone','Telefone no perfil',Boolean(place.nationalPhoneNumber || place.internationalPhoneNumber)),
    check('website','Site vinculado ao perfil',Boolean(place.websiteUri)),
    check('hours','Horário de funcionamento',Boolean(place.regularOpeningHours?.weekdayDescriptions?.length || place.regularOpeningHours?.periods?.length)),
    check('photos','Pelo menos 5 fotos',photos >= 5,`${photos}${photos >= 10 ? '+' : ''} foto(s)`),
    check('category','Categoria principal definida',Boolean(place.primaryType || place.primaryTypeDisplayName)),
    check('reviews','Pelo menos 10 avaliações',Number(place.userRatingCount || 0) >= 10)
  ];
  return { found:true,checks:rows,score:pct(rows) };
}

async function settle(promise) {
  try { return await promise; } catch { return null; }
}

export async function collectProspectAudit(row,{ places = placesConfigured,lookupPlace = findPlace,details = placeDetails,page = fetchPage,speed = pageSpeed } = {}) {
  const audit = { checkedAt:new Date().toISOString() };
  let placeId = row.placeId || '';
  let place = null;
  if (places) {
    if (!placeId && row.name && (row.city || row.address)) placeId = (await settle(lookupPlace(row.name,[row.address,row.city,row.region].filter(Boolean).join(', ')))) || '';
    if (placeId) place = await settle(details(placeId));
  }
  if (placeId && !row.placeId) audit.placeId = placeId;
  if (place) {
    audit.profile = profileChecks(place);
    const rating = Number.isFinite(place.rating) ? place.rating : row.rating;
    const count = Number.isFinite(place.userRatingCount) ? place.userRatingCount : row.reviews;
    audit.reputation = { score:reputationScore(rating,count),source:Number.isFinite(place.rating) ? 'google' : 'manual' };
  } else if (places && !row.placeId) {
    audit.profile = { found:false,checks:[check('found','Empresa encontrada no Google Maps',false)],score:0 };
  }
  if (!audit.reputation && Number.isFinite(row.rating)) audit.reputation = { score:reputationScore(row.rating,row.reviews),source:'manual' };

  const target = auditableUrl(row.website || place?.websiteUri || '');
  if (target) {
    let home = await settle(page(target));
    let certificateFailed = false;
    if (!home && target.protocol === 'https:') {
      const fallback = new URL(target.href);
      fallback.protocol = 'http:';
      home = await settle(page(fallback));
      certificateFailed = Boolean(home);
    }
    if (!home || home.status >= 400) {
      audit.website = { url:target.href,reachable:false,status:home?.status || null,health:{ score:0 } };
    } else {
      const finalUrl = new URL(home.url);
      const origin = finalUrl.origin;
      const httpVersion = new URL(finalUrl.href);
      httpVersion.protocol = 'http:';
      const [plainHttp,sitemap,robots,mobile,desktop] = await Promise.all([
        finalUrl.protocol === 'https:' ? settle(page(httpVersion.href,{ maxBytes:20_000 })) : null,
        settle(page(`${origin}/sitemap.xml`,{ maxBytes:200_000 })),
        settle(page(`${origin}/robots.txt`,{ maxBytes:100_000 })),
        settle(speed(finalUrl.href,'mobile')),
        settle(speed(finalUrl.href,'desktop'))
      ]);
      const sitemapOk = Boolean(sitemap && sitemap.status < 400 && /<(urlset|sitemapindex)\b/i.test(sitemap.text)) ||
        Boolean(robots && robots.status < 400 && /^\s*sitemap:/im.test(robots.text));
      const result = analyzeHtml(home.text,{
        url:finalUrl.href,headers:home.headers,
        httpRedirectsToHttps:finalUrl.protocol === 'https:' ? (plainHttp ? plainHttp.url.startsWith('https:') : null) : false,
        sitemap:sitemapOk,robots:Boolean(robots && robots.status < 400 && /user-agent|disallow|allow|sitemap/i.test(robots.text))
      });
      if (certificateFailed) result.security.find(item => item.key === 'certificate').detail = 'O acesso via HTTPS falhou';
      const performance = mobile || desktop ? {
        score:Math.round((mobile?.score ?? desktop.score)*0.7+(desktop?.score ?? mobile.score)*0.3),
        mobile:mobile?.score ?? null,desktop:desktop?.score ?? null,lcp:mobile?.lcp || desktop?.lcp || '',source:'pagespeed'
      } : { score:estimatedSpeed(home),mobile:null,desktop:null,ttfb:home.ttfb,source:'estimate' };
      const health = { performance,seo:result.seo,security:result.security,securityInfo:result.securityInfo,compliance:result.compliance };
      health.score = websiteHealth(health);
      health.parts = { performance:performance.score,seo:pct(result.seo),security:pct(result.security),compliance:pct(result.compliance) };
      audit.website = { url:finalUrl.href,reachable:true,status:home.status,title:result.title,health };
      audit.stack = result.stack;
      audit.social = result.social;
    }
  } else {
    audit.website = null;
  }
  const meaningful = audit.website !== null || audit.profile || audit.reputation;
  return meaningful ? audit : null;
}

// ---------- Workflows ----------

/**
 * "Gerar auditoria de marketing" (workflows): the audit as variables. <name> is the website health
 * (0–100), then the parts, the reputation (0–10), whether the site answered and a summary in plain
 * Portuguese with the pending items. Returns { vars } or { error } when nothing could be audited.
 */
export function marketingAuditVars(audit,name = 'auditoria') {
  if (!audit) return { error:'não foi possível auditar (site fora do ar ou empresa não encontrada)' };
  const site = audit.website, health = site?.health || {}, parts = health.parts || {};
  const value = number => Number.isFinite(number) ? String(number) : '';
  const pending = site?.reachable ? [...(health.seo || []),...(health.security || []),...(health.compliance || []),...(audit.profile?.checks || [])]
    .filter(row => row.ok === false).map(row => row.label) : (audit.profile?.checks || []).filter(row => row.ok === false).map(row => row.label);
  const lines = [
    site ? (site.reachable ? `Saúde do site: ${health.score ?? '—'}/100 (velocidade ${parts.performance ?? '—'}, SEO ${parts.seo ?? '—'}, segurança ${parts.security ?? '—'}, conformidade ${parts.compliance ?? '—'}).` : `O site ${site.url} não respondeu.`) : 'Sem site para auditar.',
    audit.profile ? `Perfil no Google: ${audit.profile.found ? `${audit.profile.score ?? '—'}% completo` : 'não encontrado'}.` : '',
    Number.isFinite(audit.reputation?.score) ? `Reputação: ${audit.reputation.score}/10.` : '',
    (audit.social || []).length ? `Redes no site: ${audit.social.map(row => row.label).join(', ')}.` : '',
    pending.length ? `A melhorar: ${pending.slice(0,8).join('; ')}${pending.length > 8 ? `; e mais ${pending.length-8}` : ''}.` : ''
  ].filter(Boolean);
  return { vars:{
    [name]:value(site?.reachable ? health.score : site ? 0 : null),
    [`${name}_velocidade`]:value(parts.performance),[`${name}_seo`]:value(parts.seo),
    [`${name}_seguranca`]:value(parts.security),[`${name}_conformidade`]:value(parts.compliance),
    [`${name}_reputacao`]:value(audit.reputation?.score),[`${name}_site_ok`]:site ? (site.reachable ? 'sim' : 'nao') : '',
    [`${name}_resumo`]:lines.join('\n')
  } };
}
