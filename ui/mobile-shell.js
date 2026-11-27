// App mobile white-label (6.6): the "app mode" of the platform. Opened from the agency's installed app
// (/app?shell=mobile&agency=<id>), it paints the platform with the app's theme and draws the app's header, the tab bar
// with the modules the agency chose (only the ones this person can open), the "Mais" sheet and the Início screen.
// The agency's own panel (#agency) stays the regular platform. Drawing: mobile-app-view.js; styles: mobile-app.css.
import { themeIsDark } from './community-data.js';
import { setThemeFallback, toggleTheme } from './graao.js';
import { getLanguage, langToggle, tr } from './i18n.js';
import { appStyle, barSplit, headerView, homeView, sheetView, tabsView } from './mobile-app-view.js';
import { homeData } from './mobile-home-data.js';

const KEY = 'graao-mobile-shell';
const keyBytes = base64 => { const raw = atob((base64 + '='.repeat((4 - base64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, ch => ch.charCodeAt(0)); };

/** The agency app id when the platform runs in app mode (remembered for the session of the installed app). */
export function shellAgency() {
  const params = new URLSearchParams(location.search);
  let id = params.get('shell') === 'mobile' ? params.get('agency') || '' : '';
  try { if (id) sessionStorage.setItem(KEY, id); else id = sessionStorage.getItem(KEY) || ''; } catch {}
  return /^[\w-]{1,60}$/.test(id) ? id : '';
}

/** Outside the app nothing changes: no header of its own, and #home does not exist. */
const off = { active: () => false, start: () => '', header: () => '', paint() {} };

export async function installMobileShell({ c, app, api, url, flash, allowed, screens }) {
  const id = shellAgency();
  if (!id) return off;
  let config;
  try { config = await fetch(`/mobile/${encodeURIComponent(id)}/config.json`).then(r => r.ok ? r.json() : null); } catch {}
  if (!config) return off;

  const html = document.documentElement, viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && !viewport.content.includes('viewport-fit')) viewport.content += ', viewport-fit=cover';
  const agencyView = () => location.hash.startsWith('#agency');
  const active = () => !agencyView();
  const home = config.home !== false;
  const person = () => c.access?.session?.name || '';
  if (home) screens.home = () => homeView(homeData(c.s, { allowed, name: person(), lang: getLanguage() }));

  const bar = document.createElement('div'), sheet = document.createElement('div');
  bar.style.display = sheet.style.display = 'contents';
  document.body.append(bar, sheet);
  let open = false, push = 'off', styled = '';

  // The person's own choice of light or dark rules; without one, the agency's theme does.
  setThemeFallback(themeIsDark(config.theme) ? 'dark' : 'light');
  const dark = () => html.getAttribute('data-theme') === 'dark';
  const paintTheme = () => {
    const css = active() ? appStyle(config.theme, dark() ? 'dark' : 'light') : '';
    html.toggleAttribute('data-app-mode', Boolean(css));
    if (css === styled) return;
    for (const rule of styled.split(';')) if (rule) html.style.removeProperty(rule.slice(0, rule.indexOf(':')));
    for (const rule of css.split(';')) if (rule) html.style.setProperty(rule.slice(0, rule.indexOf(':')), rule.slice(rule.indexOf(':') + 1));
    styled = css;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', css ? getComputedStyle(html).getPropertyValue('--cm-background').trim() || '#f4f6f8' : '#f4f6f8');
  };
  const split = () => barSplit(config, allowed);
  const current = () => c.view;

  const drawSheet = () => {
    if (!open) { sheet.innerHTML = ''; return; }
    const { more } = split();
    sheet.innerHTML = sheetView({ account: c.s?.profile.name || '', canSwitch: Boolean(c.access?.agency) || (c.workspaces || []).length > 1, modules: more, links: config.custom || [],
      push, dark: dark(), language: langToggle(), signOut: Boolean(c.access?.session), current: current() });
  };
  const drawBar = () => {
    const shown = active() && c.s && !c.account;
    html.style.setProperty('--ma-bar', shown ? 'calc(65px + env(safe-area-inset-bottom))' : '0px');
    bar.innerHTML = shown ? tabsView({ name: config.name, tabs: split().tabs, current: current(), open }) : '';
  };
  const toggle = (next, focus = true) => {
    if (open === next) return;
    open = next;
    app.inert = open;
    drawBar(); drawSheet();
    if (open) sheet.querySelector('.ma-sheet')?.focus();
    else if (focus) bar.querySelector('[data-ma-more]')?.focus();
  };
  const paint = () => { paintTheme(); if (!active()) { toggle(false, false); } drawBar(); };

  const registration = () => 'serviceWorker' in navigator ? navigator.serviceWorker.getRegistration(`/mobile/${id}/`) : Promise.resolve(null);
  const readPush = async () => {
    try { push = (await (await registration())?.pushManager?.getSubscription()) && Notification.permission === 'granted' ? 'on' : 'off'; } catch { push = 'off'; }
    if (open) drawSheet();
  };
  async function togglePush() {
    if (push === 'on') {
      const sub = await (await registration())?.pushManager?.getSubscription();
      if (sub) { await api(url('/api/push/unsubscribe'), { endpoint: sub.endpoint }); await sub.unsubscribe(); }
      push = 'off'; drawSheet();
      flash(tr('Notificações desligadas neste celular.'));
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error(tr('Este celular não aceita notificações por aqui. No iPhone, instale o app na Tela de Início primeiro.'));
    const { key } = await api('/api/push/key');
    if (!key) throw new Error(tr('As notificações ainda não foram configuradas pela agência.'));
    if (await Notification.requestPermission() !== 'granted') throw new Error(tr('Permita as notificações para este app nas configurações do celular.'));
    const reg = await navigator.serviceWorker.register(`/mobile/${id}/sw.js`, { scope: `/mobile/${id}/` });
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    await api(url('/api/push/subscribe'), { subscription: sub.toJSON(), app: id });
    push = 'on'; drawSheet();
    flash(tr('Notificações ativadas: você recebe as novas mensagens desta subconta.'));
  }

  addEventListener('graao:theme-change', () => { paintTheme(); drawSheet(); });
  addEventListener('graao:languagechange', () => { drawBar(); drawSheet(); });
  addEventListener('hashchange', paint);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && open) toggle(false); });
  document.addEventListener('click', async event => {
    const at = selector => event.target instanceof Element && event.target.closest(selector);
    if (at('[data-ma-more]')) { toggle(!open); if (open) void readPush(); return; }
    if (at('.ma-tabs a')) { toggle(false, false); return; }
    if (at('[data-ma-close]')) { toggle(false, !at('[data-act]') && !at('a')); return; }
    if (at('[data-ma-mode]')) { void toggleTheme(); return; }
    if (at('[data-ma-push]')) { try { await togglePush(); } catch (error) { flash(error.message, true); } return; }
    if (open && event.target instanceof Element && event.target.matches('[data-ma-veil]')) toggle(false);
  });
  // A module the agency left out of the app is still reachable by a link; the tab bar only marks what it has.
  return { active, paint, start: () => split().tabs[0]?.route || '', header() {
    const session = c.access?.session;
    return headerView({ name: config.name, icon: config.icon, account: c.s.profile.name, unread: c.m?.unread || 0,
      profile: { text: (session?.name || c.s.profile.name || 'A').slice(0, 2).toUpperCase(), picture: session?.picture || '', label: session?.name || tr('Perfil do workspace'), attr: session ? 'data-act="account"' : 'data-go="settings"' } });
  } };
}
