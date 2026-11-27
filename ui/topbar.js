// graao header, shared by the sub-account and agency shells.
// Left: breadcrumb. Right: global search (Ctrl K), one grouped toolbar,
// the language toggle, the theme toggle and the profile. The sidebar toggle lives in the sidebar itself.
import { icon as i } from './icons.js';
import { tr, langToggle } from './i18n.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

export const themeToggle = () =>
  `<button type="button" class="theme-toggle" data-theme-toggle data-tip="${tr('Alternar tema')}" data-tip-pos="bottom" aria-label="${tr('Alternar entre tema claro e escuro')}"><span class="tt-sun">${i('sun', 17)}</span><span class="tt-moon">${i('moon', 17)}</span></button>`;

/**
 * @param {object} o
 * @param {{label:string, href?:string}[]} o.crumbs
 * @param {string} [o.search]  attribute that opens search
 * @param {{icon:string,label:string,attr:string,dot?:boolean}[]} [o.tools]
 * @param {{text:string,label:string,attr:string,picture?:string}} [o.profile]
 */
export function topbar(o) {
  const crumbs = o.crumbs.filter(c => c.label).map((c, k, all) => {
    const text = tr(c.label);
    return k === all.length - 1
      ? `<span class="crumb-current" aria-current="page">${esc(text)}</span>`
      : `${c.href ? `<a class="crumb" href="${esc(c.href)}">${esc(text)}</a>` : `<span class="crumb">${esc(text)}</span>`}<span class="crumb-sep" aria-hidden="true">/</span>`;
  }).join('');
  const tools = (o.tools || []).map(t => {
    const text = tr(t.label);
    return `<button type="button" class="tool-btn" ${t.attr} data-tip="${esc(text)}" data-tip-pos="bottom" aria-label="${esc(text)}">${i(t.icon, 17)}${t.dot ? '<span class="tool-dot" aria-hidden="true"></span>' : ''}</button>`;
  }).join('');
  return `<header class="topbar g-top">
    <nav class="crumbs" aria-label="${esc(tr('Você está em'))}">${crumbs}</nav>
    ${o.search ? `<button type="button" class="top-search" ${o.search} aria-label="${esc(tr('Buscar no workspace'))}" aria-keyshortcuts="Control+K">${i('search', 15)}<span>${esc(tr('Buscar módulos e contatos…'))}</span><kbd>Ctrl K</kbd></button>` : '<div class="spacer"></div>'}
    <div class="tool-group" role="group" aria-label="${esc(tr('Ferramentas'))}">${tools}${themeToggle()}</div>
    ${langToggle()}
    ${o.profile ? `<button type="button" class="avatar avatar-pink top-profile" ${o.profile.attr} data-tip="${esc(tr(o.profile.label))}" data-tip-pos="bottom" aria-label="${esc(tr(o.profile.label))}">${o.profile.picture ? `<img src="${esc(o.profile.picture)}" alt="">` : esc(o.profile.text)}</button>` : ''}
  </header>`;
}
