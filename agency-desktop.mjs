// App desktop white-label (6.7): the agency's own installable app. Graao is a web platform, so the desktop
// app is a branded Progressive Web App: Chrome and Edge install it on Windows, macOS and Linux with its own
// window, name and icon. It opens on a branded sign-in screen; sign-in happens in the same window and lands in
// the platform. The agency customizes the theme, icon, name, title, subtitle, logo, background and illustration.

import { isAssetUrl } from './asset-store.mjs';

export const desktopPresets = [
  { id: 'graao', name: 'Laranja Graao', background: '#111111', text: '#f5f5f5', button: '#ff6b1a', buttonText: '#111111' },
  { id: 'brasa', name: 'Brasa', background: '#fbf6f2', text: '#2a160b', button: '#c2410c', buttonText: '#ffffff' },
  { id: 'ambar', name: 'Âmbar', background: '#fdf8ee', text: '#2b1d07', button: '#a15c07', buttonText: '#ffffff' },
  { id: 'esmeralda', name: 'Esmeralda', background: '#f5f8f3', text: '#14261b', button: '#1f7a4d', buttonText: '#ffffff' },
  { id: 'oceano', name: 'Oceano', background: '#f3f8f8', text: '#0d2529', button: '#0e7490', buttonText: '#ffffff' },
  { id: 'violeta', name: 'Violeta', background: '#f7f4fa', text: '#1f1633', button: '#6d28d9', buttonText: '#ffffff' },
  { id: 'rosa', name: 'Rosa', background: '#fbf4f6', text: '#2a1220', button: '#be185d', buttonText: '#ffffff' },
  { id: 'ardosia', name: 'Ardósia', background: '#f4f6f8', text: '#1f2933', button: '#334e68', buttonText: '#ffffff' },
  { id: 'neon', name: 'Neon', background: '#111111', text: '#f5f5f5', button: '#1fe5f0', buttonText: '#062a2d' },
  { id: 'minimal', name: 'Minimalista', background: '#ffffff', text: '#1a1a1a', button: '#1a1a1a', buttonText: '#ffffff' }
];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const hex = (value, label) => { const v = String(value || '').toLowerCase(); if (!/^#[0-9a-f]{6}$/.test(v)) fail(`Escolha uma cor válida para "${label}".`); return v; };
/** A data-URI image under a size limit (characters of base64). */
const picture = (value, label, limit, { png = false } = {}) => {
  if (!value) return '';
  // Imagem já guardada fora do documento (asset-store.mjs): o formulário reenvia o endereço.
  if (isAssetUrl(value) && (png ? value.endsWith('.png') : /\.(?:png|jpg|webp)$/.test(value))) return value;
  const pattern = png ? /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/ : /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/;
  if (typeof value !== 'string' || !pattern.test(value)) fail(`${label}: use uma imagem ${png ? 'PNG' : 'PNG, JPEG ou WebP'}.`);
  if (value.length > limit) fail(`${label}: imagem grande demais (até ${Math.round(limit * 0.75 / 1024)} KB).`);
  return value;
};

export const desktopDefaults = () => ({ appName: 'My Agency', title: 'Todas as ferramentas de vendas e marketing em um só lugar', subtitle: 'Entre para acessar seus clientes, conversas e automações.',
  theme: { preset: 'graao', ...desktopPresets[0] }, icon: '', icon512: '', icon192: '', logo: '', background: '', illustration: '', domain: '', status: 'draft', version: 0, publishedAt: '' });

/** Fills the fields older agencies do not have (they only had name, color and domain). */
export function desktopOf(state) {
  const base = desktopDefaults(), prior = state.desktopApp || {};
  state.desktopApp = { ...base, ...prior, theme: { ...base.theme, ...(prior.theme || {}), ...(prior.primary && !prior.theme ? { button: prior.primary } : {}) } };
  // Um rascunho ainda no padrão antigo (Rosa Graao) passa para o padrão novo; app publicado fica como está.
  const app = state.desktopApp;
  const rosaAntigo = app.theme.preset === 'rosa' && app.theme.button === '#b71889' && app.theme.background === '#fff5fa';
  const laranjaQuente = app.theme.preset === 'graao' && app.theme.background === '#100d0a';
  if (app.status !== 'published' && (rosaAntigo || laranjaQuente)) app.theme = { ...base.theme };
  return app;
}

/** 'desktop-app': saves the customizer. Images that are left out stay as they were; 'remove' clears one. */
export function saveDesktop(state, d) {
  const app = desktopOf(state);
  const keep = (key, label, limit, opts) => d[key] === undefined ? app[key] : d[key] === 'remove' ? '' : picture(d[key], label, limit, opts);
  const preset = desktopPresets.find(row => row.id === d.theme?.preset);
  const theme = { preset: preset ? preset.id : 'custom', background: hex(d.theme?.background ?? app.theme.background, 'Fundo'), text: hex(d.theme?.text ?? app.theme.text, 'Texto'),
    button: hex(d.theme?.button ?? app.theme.button, 'Botão'), buttonText: hex(d.theme?.buttonText ?? app.theme.buttonText, 'Texto do botão') };
  Object.assign(app, {
    appName: str(d.appName ?? app.appName, 50) || fail('Dê um nome ao app.'), title: str(d.title ?? app.title, 150) || fail('Escreva o título da tela de entrada.'),
    subtitle: str(d.subtitle ?? app.subtitle, 200) || fail('Escreva o subtítulo da tela de entrada.'), theme, domain: str(d.domain ?? app.domain, 200).toLowerCase(),
    icon: keep('icon', 'Ícone', 700000, { png: true }), icon512: keep('icon512', 'Ícone 512', 400000, { png: true }), icon192: keep('icon192', 'Ícone 192', 120000, { png: true }),
    logo: keep('logo', 'Logo', 400000), background: keep('background', 'Imagem de fundo', 900000), illustration: keep('illustration', 'Ilustração', 700000)
  });
  return app;
}

/** 'desktop-app-publish': the app goes live (needs the icon); every publish raises the version. */
export function publishDesktop(state) {
  const app = desktopOf(state);
  if (!app.icon) fail('Envie o ícone do app (1024 × 1024) antes de publicar.');
  Object.assign(app, { status: 'published', version: (app.version || 0) + 1, publishedAt: new Date().toISOString() });
  return app;
}

/** The web app manifest that makes the browser offer "Install". */
export function desktopManifest(app, id) {
  const icon = (size, key) => app[key] ? [{ src: `/desktop/${id}/icon-${size}.png?v=${app.version}`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' }] : [];
  return { id: `/desktop/${id}/`, name: app.appName, short_name: app.appName.slice(0, 12), description: app.subtitle, start_url: `/desktop/${id}/`, scope: '/', display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'], background_color: app.theme.background, theme_color: app.theme.button, lang: 'pt-BR',
    icons: [...icon(192, 'icon192'), ...icon(512, 'icon512'), ...icon(1024, 'icon')] };
}

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const desktopCsp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; manifest-src 'self'; worker-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/** The branded sign-in screen the installed app opens on; also offers "Install" in a normal browser tab. */
export function desktopLaunchPage(app, id, { signedIn = false, preview = false } = {}) {
  const t = app.theme;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(app.appName)}</title><meta name="theme-color" content="${esc(t.button)}">${preview ? '' : `<link rel="manifest" href="/desktop/${esc(id)}/manifest.webmanifest">`}
${app.icon192 || app.icon ? `<link rel="icon" href="/desktop/${esc(id)}/icon-192.png?v=${app.version}">` : ''}
<style>*{box-sizing:border-box}html,body{height:100%}body{margin:0;font:16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;background:${esc(t.background)};color:${esc(t.text)};display:grid;grid-template-columns:1fr 1fr;min-height:100vh}
${app.background ? `body{background-image:url(${esc(app.background)});background-size:cover;background-position:center}` : ''}
.side{display:grid;place-items:center;padding:48px}.side img{max-width:min(420px,90%);max-height:70vh;object-fit:contain}
.card{align-self:center;justify-self:center;width:min(440px,calc(100% - 48px));background:color-mix(in srgb,${esc(t.background)} 92%,white);border-radius:20px;padding:40px;box-shadow:0 20px 60px rgba(0,0,0,.12);display:grid;gap:14px}
.logo{max-height:48px;max-width:240px;object-fit:contain}.mark{width:56px;height:56px;border-radius:14px}h1{margin:0;font-size:28px;line-height:1.2}p{margin:0;opacity:.8}
.btn{display:block;text-align:center;text-decoration:none;background:${esc(t.button)};color:${esc(t.buttonText)};border:0;border-radius:12px;padding:14px 18px;font:600 16px system-ui,sans-serif;cursor:pointer}
.ghost{background:transparent;color:${esc(t.text)};border:1px solid color-mix(in srgb,${esc(t.text)} 25%,transparent)}small{opacity:.7}[hidden]{display:none}
@media (max-width:820px){body{grid-template-columns:1fr}.side{display:none}}</style></head>
<body><div class="side">${app.illustration ? `<img src="${esc(app.illustration)}" alt="">` : ''}</div>
<main class="card">${app.logo ? `<img class="logo" src="${esc(app.logo)}" alt="${esc(app.appName)}">` : app.icon ? `<img class="mark" src="${esc(app.icon)}" alt="">` : ''}
<h1>${esc(app.title)}</h1><p>${esc(app.subtitle)}</p>
<a class="btn" href="/app">${signedIn ? `Abrir ${esc(app.appName)}` : `Entrar no ${esc(app.appName)}`}</a>
${preview ? '' : `<button class="btn ghost" id="install" hidden>Instalar o app neste computador</button><small id="hint">No Chrome ou no Edge, use o ícone de instalar na barra de endereço para ter o ${esc(app.appName)} como app.</small>`}
</main>${preview ? '' : `<script>
if('serviceWorker' in navigator)navigator.serviceWorker.register('/desktop/${esc(id)}/sw.js',{scope:'/desktop/${esc(id)}/'}).catch(function(){});
var ask;addEventListener('beforeinstallprompt',function(e){e.preventDefault();ask=e;document.getElementById('install').hidden=false;});
document.getElementById('install').onclick=function(){if(ask){ask.prompt();ask=null;this.hidden=true;}};
if(matchMedia('(display-mode: standalone)').matches)document.getElementById('hint').hidden=true;
</script>`}</body></html>`;
}

/** A minimal service worker: it only exists so browsers treat the app as installable; it never caches data. */
export const desktopWorker = "self.addEventListener('install',function(){self.skipWaiting();});self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim());});self.addEventListener('fetch',function(){});";
