// App mobile white-label (6.6, D2: included in the agency plan). Graao is a web platform, so the mobile app is a
// branded installable app (PWA): Android and iOS add it to the home screen with the agency's name, icon and colors.
// It opens the platform in "app mode": a bottom tab bar with the modules the agency chose (and its own URL modules)
// and push notifications (Web Push). For the stores, the agency gets a package built from the same app — a Trusted
// Web Activity for Google Play (Bubblewrap) and the PWABuilder project for the App Store — published with the
// agency's own developer accounts.
import { mobileModules } from './ui/agency-data.js';
import { cleanTheme, defaultTheme, themeFromColor } from './ui/community-data.js';
import { androidSteps, appStyle, entryView, installSteps, iosSteps, mobileIcons, mobileLabels, mobileRoutes } from './ui/mobile-app-view.js';
import { isAssetUrl } from './asset-store.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const picture = (value, label, limit) => {
  if (!value) return '';
  // Imagem já guardada fora do documento (asset-store.mjs): o formulário reenvia o endereço.
  if (isAssetUrl(value) && value.endsWith('.png')) return value;
  if (typeof value !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value)) fail(`${label}: use uma imagem PNG.`);
  if (value.length > limit) fail(`${label}: imagem grande demais (até ${Math.round(limit * 0.75 / 1024)} KB).`);
  return value;
};
const photo = (value, label, limit) => {
  if (!value) return '';
  if (isAssetUrl(value)) return value;
  if (typeof value !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) fail(`${label}: use uma imagem PNG, JPEG ou WebP.`);
  if (value.length > limit) fail(`${label}: imagem grande demais (até ${Math.round(limit * 0.75 / 1024)} KB).`);
  return value;
};
const colorOf = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : fail('Escolha uma cor válida.');
const httpsUrl = (value, label) => { const v = str(value, 300); if (v && !/^https:\/\/[^\s]+$/i.test(v)) fail(`${label}: use um endereço https://.`); return v; };
const webUrl = value => {
  const v = str(value, 2000);
  if (!v) return '';
  let url = null;
  try { url = new URL(v); } catch { fail('Use um endereço http ou https nos links próprios.'); }
  return ['http:', 'https:'].includes(url.protocol) ? url.href : fail('Use um endereço http ou https nos links próprios.');
};
const packageName = (value, label) => { const v = str(value, 120).toLowerCase(); if (v && !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,}$/.test(v)) fail(`${label}: use o formato br.com.agencia.app.`); return v; };
const fingerprint = value => { const v = String(value || '').trim().toUpperCase(); return /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(v) ? v : ''; };

export { mobileIcons, mobileLabels, mobileRoutes };

/** A new agency's app: in Portuguese, with the community's default theme and the day-to-day modules first. */
export const mobileDefaults = () => ({ appName: 'Minha Agência', primary: defaultTheme().tokens.primary, accent: '#12b76a', loginTitle: 'Bem-vindo de volta', hidden: [],
  order: ['conversations', 'contacts', 'calendars', 'opportunities', 'payments', 'reputation', 'dashboard'], custom: [], theme: defaultTheme(), home: true, cover: '' });

export const mobileStoreDefaults = () => ({ icon: '', icon192: '', icon512: '', status: 'draft', version: 0, publishedAt: '',
  store: { developer: '', supportEmail: '', supportUrl: '', privacyUrl: '', androidPackage: '', iosBundle: '', fingerprints: [], domain: '' } });

/** Fills the fields older agencies do not have (they only had name, colors, login title and modules). */
export function mobileOf(state) {
  const prior = state.mobileApp || {}, base = mobileStoreDefaults();
  // An app saved before the themes keeps its color: without a theme, one is derived from it (mobileTheme).
  state.mobileApp = { ...mobileDefaults(), ...(state.mobileApp ? { theme: null } : {}), ...base, ...prior, store: { ...base.store, ...(prior.store || {}) } };
  const app = state.mobileApp;
  // The old defaults were in English; a draft nobody renamed starts in Portuguese.
  if (app.status !== 'published' && app.appName === 'My Agency') app.appName = 'Minha Agência';
  if (app.status !== 'published' && app.loginTitle === 'Welcome back') app.loginTitle = 'Bem-vindo de volta';
  return app;
}

/** The app's theme: the one the agency picked, or one made from the color it already had. */
export const mobileTheme = app => app.theme || themeFromColor(app.primary);

/** 'mobile-app': name, entry screen, theme, modules and the agency's own links. What is left out stays as it was. */
export function saveMobileLook(state, d) {
  const app = mobileOf(state);
  const has = key => d[key] !== undefined;
  const known = list => (Array.isArray(list) ? list : []).filter(key => mobileModules.some(row => row[0] === key));
  const appName = str(d.appName ?? app.appName, 40) || fail('Dê um nome ao app.');
  let theme = app.theme, primary = colorOf(d.primary ?? app.primary);
  if (d.theme) {
    const clean = cleanTheme(d.theme);
    if (clean.error) fail(clean.error);
    theme = clean.theme; primary = theme.tokens.primary;
  } else if (theme && primary !== theme.tokens.primary) theme = null;
  const custom = has('custom') ? (Array.isArray(d.custom) ? d.custom : []).slice(0, 5).map(item => ({ label: str(item?.label, 40) || fail('Dê um nome a cada link próprio.'), url: webUrl(item?.url) || fail('Informe o endereço de cada link próprio.') })) : app.custom;
  Object.assign(app, { appName, primary, theme, custom, accent: colorOf(d.accent ?? app.accent), loginTitle: has('loginTitle') ? str(d.loginTitle, 60) : app.loginTitle,
    home: has('home') ? Boolean(d.home) : app.home, hidden: has('hidden') ? known(d.hidden) : app.hidden, order: [...new Set([...(has('order') ? known(d.order) : app.order), ...app.order, ...mobileModules.map(row => row[0])])],
    cover: has('cover') ? d.cover === 'remove' ? '' : photo(d.cover, 'Capa', 700000) : app.cover });
  return app;
}

/** 'mobile-app-store': icon and the data the stores ask for (developer, support, privacy, package ids, signing). */
export function saveMobileStore(state, d) {
  const app = mobileOf(state);
  const keep = (key, label, limit) => d[key] === undefined ? app[key] : d[key] === 'remove' ? '' : picture(d[key], label, limit);
  const email = str(d.supportEmail ?? app.store.supportEmail, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('E-mail de suporte inválido.');
  Object.assign(app, { icon: keep('icon', 'Ícone', 700000), icon512: keep('icon512', 'Ícone 512', 400000), icon192: keep('icon192', 'Ícone 192', 120000) });
  app.store = {
    developer: str(d.developer ?? app.store.developer, 80), supportEmail: email, supportUrl: httpsUrl(d.supportUrl ?? app.store.supportUrl, 'Site de suporte'),
    privacyUrl: httpsUrl(d.privacyUrl ?? app.store.privacyUrl, 'Política de privacidade'), androidPackage: packageName(d.androidPackage ?? app.store.androidPackage, 'Pacote Android'),
    iosBundle: packageName(d.iosBundle ?? app.store.iosBundle, 'Bundle ID do iOS'), domain: str(d.domain ?? app.store.domain, 200).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''),
    fingerprints: [...new Set((Array.isArray(d.fingerprints) ? d.fingerprints : String(d.fingerprints ?? app.store.fingerprints.join('\n')).split(/[\s,]+/)).map(fingerprint).filter(Boolean))].slice(0, 5)
  };
  return app;
}

/** 'mobile-app-publish': the app goes live (needs the icon); every publish raises the version. */
export function publishMobile(state) {
  const app = mobileOf(state);
  if (!app.icon) fail('Envie o ícone do app (1024 × 1024) antes de publicar.');
  Object.assign(app, { status: 'published', version: (app.version || 0) + 1, publishedAt: new Date().toISOString() });
  return app;
}

/** What the platform needs to draw the app mode (public once published). */
export function mobileConfig(app, id) {
  const visible = app.order.filter(key => mobileRoutes[key] && !app.hidden.includes(key));
  return { id, name: app.appName, primary: app.primary, accent: app.accent, theme: mobileTheme(app), home: app.home !== false, version: app.version, icon: app.icon192 || app.icon ? `/mobile/${id}/icon-192.png?v=${app.version}` : '',
    modules: visible.map(key => ({ key, label: mobileLabels[key] || mobileModules.find(row => row[0] === key)?.[1] || key, route: mobileRoutes[key], icon: mobileIcons[key] })),
    custom: (app.custom || []).map(item => ({ label: item.label, url: item.url })) };
}

export function mobileManifest(app, id) {
  const icon = (size, key) => app[key] ? [{ src: `/mobile/${id}/icon-${size}.png?v=${app.version}`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any maskable' }] : [];
  return { id: `/mobile/${id}/`, name: app.appName, short_name: app.appName.slice(0, 12), description: app.loginTitle || app.appName, start_url: `/mobile/${id}/?source=app`, scope: '/',
    display: 'standalone', orientation: 'portrait', background_color: mobileTheme(app).tokens.background, theme_color: app.primary, lang: 'pt-BR',
    icons: [...icon(192, 'icon192'), ...icon(512, 'icon512'), ...icon(1024, 'icon')] };
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const mobileCsp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/** The install and sign-in screen; opened from the home screen it goes straight into the app mode, on its first tab. */
export function mobileLaunchPage(app, id) {
  const target = `/app?shell=mobile&agency=${encodeURIComponent(id)}${app.home === false ? '' : '#home'}`;
  const theme = mobileTheme(app), base = `/mobile/${esc(id)}`, installed = app.icon192 || app.icon;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(app.appName)}</title><meta name="theme-color" content="${esc(app.primary)}"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${esc(app.appName.slice(0, 12))}">
<link rel="manifest" href="${base}/manifest.webmanifest">${installed ? `<link rel="icon" href="${base}/icon-192.png?v=${app.version}"><link rel="apple-touch-icon" href="${base}/icon-512.png?v=${app.version}">` : ''}
<style>@font-face{font-family:"Plus Jakarta Sans";src:url(/fonts/plus-jakarta-sans.woff2) format("woff2");font-weight:200 800;font-display:swap}</style><link rel="stylesheet" href="/mobile-app.css"></head>
<body class="ma-root" style="${esc(appStyle(theme))}">${entryView({ name: app.appName, phrase: app.loginTitle, icon: app.icon ? `/mobile/${id}/icon-512.png?v=${app.version}` : '', cover: app.cover ? `/mobile/${id}/cover?v=${coverStamp(app.cover)}` : '', target,
    installHtml: '<button type="button" class="ma-pill ma-pill-soft" id="install" hidden>Instalar o app</button>',
    stepsHtml: installSteps('ios', 'Instale no iPhone', iosSteps, true) + installSteps('android', 'Instale no Android', androidSteps) })}<script>
if('serviceWorker' in navigator)navigator.serviceWorker.register('/mobile/${esc(id)}/sw.js',{scope:'/mobile/${esc(id)}/'}).catch(function(){});
var standalone=matchMedia('(display-mode: standalone)').matches||navigator.standalone;if(standalone)location.replace(${JSON.stringify(target)});
var ios=/iphone|ipad|ipod/i.test(navigator.userAgent);document.getElementById('ios').hidden=!ios;document.getElementById('android').hidden=ios;
var ask,button=document.getElementById('install');addEventListener('beforeinstallprompt',function(e){e.preventDefault();ask=e;button.hidden=false;});
button.onclick=function(){if(ask){ask.prompt();ask=null;button.hidden=true;}};
</script></body></html>`;
}
// A changed cover gets a new address, so phones don't keep the old picture.
const coverStamp = value => isAssetUrl(value) ? value.slice(7, 19) : String(value.length);

/** The service worker: installability, and the push notifications (opened on tap at their link). */
export function mobileWorker(id) {
  return `self.addEventListener('install',function(){self.skipWaiting();});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim());});
self.addEventListener('fetch',function(){});
self.addEventListener('push',function(e){var d={};try{d=e.data?e.data.json():{};}catch(x){d={body:e.data&&e.data.text()};}
e.waitUntil(self.registration.showNotification(d.title||'Nova notificação',{body:d.body||'',icon:'/mobile/${id}/icon-192.png',badge:'/mobile/${id}/icon-192.png',tag:d.tag||undefined,data:{url:d.url||'/app'}}));});
self.addEventListener('notificationclick',function(e){e.notification.close();var url=(e.notification.data&&e.notification.data.url)||'/app';
e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){for(var i=0;i<list.length;i++){if('focus' in list[i]){list[i].navigate(url);return list[i].focus();}}return self.clients.openWindow(url);}));});`;
}

/**
 * The store package: the Bubblewrap config (Google Play, Trusted Web Activity), the Digital Asset Links file the
 * agency's domain serves, and what the App Store and Google Play ask for. The agency builds and submits it with its
 * own developer accounts (D2).
 */
export function storePackage(app, id, origin) {
  const host = app.store.domain || new URL(origin).host, base = `https://${host}`;
  const missing = [
    !app.icon && 'ícone 1024 × 1024', app.status !== 'published' && 'publicar o app', !app.store.androidPackage && 'pacote Android', !app.store.iosBundle && 'Bundle ID do iOS',
    !app.store.developer && 'nome do desenvolvedor', !app.store.supportEmail && 'e-mail de suporte', !app.store.privacyUrl && 'política de privacidade', !app.store.fingerprints.length && 'impressão SHA-256 da chave de assinatura Android'
  ].filter(Boolean);
  const twaManifest = {
    packageId: app.store.androidPackage, host, name: app.appName, launcherName: app.appName.slice(0, 12), display: 'standalone', orientation: 'portrait',
    themeColor: app.primary, navigationColor: app.primary, backgroundColor: '#FFFFFF', enableNotifications: true, startUrl: `/mobile/${id}/?source=app`,
    iconUrl: `${base}/mobile/${id}/icon-512.png`, maskableIconUrl: `${base}/mobile/${id}/icon-512.png`, webManifestUrl: `${base}/mobile/${id}/manifest.webmanifest`,
    appVersionName: `1.0.${app.version || 0}`, appVersionCode: Math.max(1, app.version || 0), signingKey: { path: './android.keystore', alias: 'android' }, generatorApp: 'graao'
  };
  const assetlinks = app.store.androidPackage && app.store.fingerprints.length
    ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: app.store.androidPackage, sha256_cert_fingerprints: app.store.fingerprints } }] : [];
  return {
    ready: !missing.length, missing, host, twaManifest, assetlinks, assetlinksUrl: `${base}/.well-known/assetlinks.json`, manifestUrl: `${base}/mobile/${id}/manifest.webmanifest`,
    listing: { name: app.appName, developer: app.store.developer, supportEmail: app.store.supportEmail, supportUrl: app.store.supportUrl, privacyUrl: app.store.privacyUrl, iosBundle: app.store.iosBundle },
    steps: [
      'Google Play: instale o Bubblewrap (npm i -g @bubblewrap/cli), salve twa-manifest.json numa pasta e rode "bubblewrap build". Envie o .aab no Play Console da agência.',
      `Copie a impressão SHA-256 da chave de assinatura (Play Console → Integridade do app) para o Graao; o arquivo ${base}/.well-known/assetlinks.json passa a liberar o app em tela cheia.`,
      `App Store: em pwabuilder.com, abra ${base}/mobile/${id}/ e baixe o pacote iOS com o Bundle ID ${app.store.iosBundle || '(defina)'}; abra no Xcode, assine com a conta Apple Developer da agência e envie pelo App Store Connect.`,
      'Nas duas lojas, use o nome, o e-mail e os links de suporte e privacidade acima. Cada nova publicação no Graao atualiza o app sem novo envio (o conteúdo vem da web).'
    ]
  };
}

/** /.well-known/assetlinks.json: the published app of the agency whose domain is this host. */
export function assetLinksFor(agencies, host) {
  const clean = String(host || '').toLowerCase().split(':')[0];
  for (const agency of agencies) {
    const app = agency?.mobileApp;
    if (app?.status === 'published' && app.store?.domain === clean && app.store.androidPackage && app.store.fingerprints?.length) {
      return [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: app.store.androidPackage, sha256_cert_fingerprints: app.store.fingerprints } }];
    }
  }
  return null;
}
