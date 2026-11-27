// Visão da agência → Aplicativo móvel (6.6): the creator of the agency's app. Identity and theme, entry screen, modules,
// own links and publishing, one section at a time, beside a preview made of the app's own pieces (mobile-app-view.js).
// Everything is edited in one draft and saved together; what is saved is already live in a published app.
import { readFile, squarePng } from './agency-desktop.js';
import { mobileModules } from './agency-data.js';
import { ask } from './ask.js';
import { contrast, themeFromColor, themeIsDark, themePresets, themeTokens } from './community-data.js';
import { icon as i } from './icons.js';
import { langToggle, tr } from './i18n.js';
import { androidSteps, appStyle, barSplit, entryView, headerView, homeView, installSteps, mobileIcons, mobileLabels, mobileRoutes, sampleHome, sheetView, tabsView } from './mobile-app-view.js';

const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const t = text => h(tr(text));
const MAX_LINKS = 5;
const sections = [['identity', 'Identidade', 'palette'], ['entry', 'Entrada', 'mobile'], ['modules', 'Módulos', 'grid'], ['links', 'Links próprios', 'link'], ['publish', 'Publicação', 'send']];
const storeKeys = ['developer', 'supportEmail', 'supportUrl', 'privacyUrl', 'androidPackage', 'iosBundle', 'domain'];

// ---- The draft (pure) ------------------------------------------------------
/** Everything the creator edits, from the saved app. `icon` and `cover` hold what is shown; `icons` a newly sent icon. */
export function creatorDraft(app) {
  const known = mobileModules.map(row => row[0]);
  return { appName: app.appName || '', loginTitle: app.loginTitle || '', theme: app.theme ? { preset: app.theme.preset, tokens: { ...app.theme.tokens } } : null, primary: app.primary,
    home: app.home !== false, order: [...new Set([...(app.order || []).filter(key => known.includes(key)), ...known])], hidden: (app.hidden || []).filter(key => known.includes(key)),
    custom: (app.custom || []).map(row => ({ label: row.label, url: row.url })), cover: app.cover || '', icon: app.icon || '', icons: null,
    store: { ...Object.fromEntries(storeKeys.map(key => [key, app.store?.[key] || ''])), fingerprints: (app.store?.fingerprints || []).join('\n') } };
}
export const draftTheme = draft => draft.theme || themeFromColor(draft.primary);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The 'mobile-app' payload with only what changed, or null. */
export function lookChanges(base, draft) {
  const data = {};
  for (const key of ['loginTitle', 'theme', 'home', 'order', 'hidden']) if (!same(base[key], draft[key])) data[key] = draft[key];
  const custom = draft.custom.map(row => ({ label: row.label.trim(), url: row.url.trim() })).filter(row => row.label || row.url);
  if (!same(base.custom, custom)) data.custom = custom;
  if (base.cover !== draft.cover) data.cover = draft.cover || 'remove';
  if (base.appName !== draft.appName) data.appName = draft.appName;
  return Object.keys(data).length ? { appName: draft.appName, ...data } : null;
}
/** The 'mobile-app-store' payload (store data and the icon), or null. */
export function storeChanges(base, draft) {
  const icons = draft.icons || (base.icon && !draft.icon ? { icon: 'remove', icon512: 'remove', icon192: 'remove' } : null);
  return same(base.store, draft.store) && !icons ? null : { ...draft.store, ...icons };
}
/** What Apple and Google still need, each with the section and field that solves it. */
export function storeChecklist(app, draft) {
  return [['Ícone do app', Boolean(draft.icon), 'identity', 'icon'], ['App publicado', app.status === 'published', 'publish', 'publish'], ['Nome do desenvolvedor', Boolean(draft.store.developer.trim()), 'publish', 'developer'],
    ['E-mail de suporte', Boolean(draft.store.supportEmail.trim()), 'publish', 'supportEmail'], ['Política de privacidade', Boolean(draft.store.privacyUrl.trim()), 'publish', 'privacyUrl'],
    ['Pacote Android', Boolean(draft.store.androidPackage.trim()), 'publish', 'androidPackage'], ['Impressão SHA-256 da chave Android', Boolean(draft.store.fingerprints.trim()), 'publish', 'fingerprints'],
    ['Bundle ID do iOS', Boolean(draft.store.iosBundle.trim()), 'publish', 'iosBundle']].map(([label, done, section, field]) => ({ label, done, section, field }));
}
/** The short status of each section: [text, done]. */
export function sectionStatus(app, draft) {
  const shown = draft.order.filter(key => !draft.hidden.includes(key)).length, links = draft.custom.filter(row => row.label.trim() || row.url.trim()).length;
  return { identity: !draft.appName.trim() ? ['Falta o nome', false] : !draft.icon ? ['Falta o ícone', false] : ['Pronto', true],
    entry: draft.loginTitle.trim() ? ['Pronto', true] : ['Sem frase', false],
    modules: [`${shown} ${tr('de')} ${draft.order.length}`, shown > 0 || draft.home],
    links: [String(links), null],
    publish: app.status === 'published' ? ['No ar', true] : ['Rascunho', false] };
}
/** The app as the preview draws it. */
export const draftConfig = draft => ({ home: draft.home, modules: draft.order.filter(key => !draft.hidden.includes(key) && mobileRoutes[key]).map(key => ({ key, label: mobileLabels[key], route: mobileRoutes[key], icon: mobileIcons[key] })),
  custom: draft.custom.filter(row => row.label.trim()) });

// ---- Pictures --------------------------------------------------------------
/** The cover, always a JPEG of up to 1200 px that fits the limit. */
const coverPicture = dataUrl => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const width = Math.min(1200, img.width), canvas = Object.assign(document.createElement('canvas'), { width, height: Math.round(img.height * width / img.width) });
    const pen = canvas.getContext('2d');
    pen.fillStyle = '#ffffff'; pen.fillRect(0, 0, canvas.width, canvas.height);
    pen.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.84, 0.7, 0.55, 0.4]) { const out = canvas.toDataURL('image/jpeg', quality); if (out.length < 680000) { resolve(out); return; } }
    reject(new Error(tr('A imagem de capa é grande demais. Envie uma de até 500 KB.')));
  };
  img.onerror = () => reject(new Error(tr('Não foi possível ler a imagem.')));
  img.src = dataUrl;
});

// ---- The screen ------------------------------------------------------------
export function createMobileCreator({ getApp, agencyId, origin, head, act, flash, download, rerender }) {
  let base = null, draft = null, section = 'identity', shown = 'home', mode = '', root = null, busy = false, custom = false;
  const app = () => getApp();
  const start = () => { base = creatorDraft(app()); draft = creatorDraft(app()); custom = false; };
  const dirty = () => Boolean(draft && (lookChanges(base, draft) || storeChanges(base, draft)));
  const link = () => `${origin}/mobile/${agencyId()}/`;
  const isCustom = () => custom || !draft.theme || draft.theme.preset === 'custom';
  const open = () => Boolean(root?.isConnected);
  const $ = selector => root.querySelector(selector);

  // ---- Sections
  const sec = (key, title, text, body) => `<section class="set-section" data-mc-section="${key}"${section === key ? '' : ' hidden'}><header class="set-head"><h2>${t(title)}</h2><p class="dim">${t(text)}</p></header><div class="set-body">${body}</div></section>`;
  const file = (name, label) => `<label class="secondary mc-file">${i('upload', 15)}<span>${t(label)}</span><input type="file" name="${name}" accept="image/png,image/jpeg,image/webp"></label>`;
  const drawPicture = (kind) => kind === 'icon'
    ? `<div class="mc-picture"><span class="mc-icon">${draft.icon ? `<img src="${h(draft.icon)}" alt="${t('Ícone do app')}">` : i('mobile', 26)}</span><div><b>${t('Ícone do app')}</b><small class="dim">${t(draft.icon ? 'Aparece na tela do celular, na entrada e no topo do app.' : 'Imagem quadrada, de preferência 1024 × 1024. Sem ele o app não pode ser publicado.')}</small>
        <span class="inline-gap">${file('iconFile', draft.icon ? 'Trocar ícone' : 'Enviar ícone')}${draft.icon && app().status !== 'published' ? `<button type="button" class="secondary" data-mc="icon-remove">${i('trash', 15)}${t('Remover')}</button>` : ''}</span></div></div>`
    : `<div class="mc-picture mc-picture-wide"><span class="mc-cover">${draft.cover ? `<img src="${h(draft.cover)}" alt="${t('Imagem de capa')}">` : ''}</span><div><b>${t('Imagem de capa')} <span class="dim">(${t('opcional')})</span></b><small class="dim">${t(draft.cover ? 'Aparece no topo da tela de entrada.' : 'Sem imagem, a entrada usa as cores do tema.')}</small>
        <span class="inline-gap">${file('coverFile', draft.cover ? 'Trocar imagem' : 'Enviar imagem')}${draft.cover ? `<button type="button" class="secondary" data-mc="cover-remove">${i('trash', 15)}${t('Remover')}</button>` : ''}</span></div></div>`;
  const swatch = tokens => `<i aria-hidden="true">${['primary', 'background', 'tertiary', 'font'].map(key => `<b style="background:${h(tokens[key])}"></b>`).join('')}</i>`;
  const drawThemes = () => {
    const theme = draftTheme(draft), own = isCustom();
    const choice = (id, name, tokens, on) => `<label class="mc-theme"><input type="radio" name="themePreset" value="${id}"${on ? ' checked' : ''}>${swatch(tokens)}<span>${t(name)}</span></label>`;
    const weak = [[theme.tokens.onPrimary, theme.tokens.primary, 'O texto do botão principal está difícil de ler.'], [theme.tokens.font, theme.tokens.background, 'O texto sobre o fundo está difícil de ler.']].find(([a, b]) => contrast(a, b) < 4.5);
    return `<fieldset class="mc-themes"><legend>${t('Tema')}</legend>${themePresets.map(row => choice(row.id, row.name, row.tokens, !own && draft.theme?.preset === row.id)).join('')}${choice('custom', 'Suas cores', theme.tokens, own)}</fieldset>
      ${own ? `<label class="mc-color">${t('Cor principal')}<input type="color" name="ownColor" value="${h(theme.tokens.primary)}"></label>` : ''}
      <details class="mc-all"><summary>${t('Ajustar todas as cores')}</summary><div class="mc-tokens">${themeTokens.map(([key, label]) => `<label>${t(label)}<input type="color" name="token.${key}" value="${h(theme.tokens[key])}"></label>`).join('')}</div></details>
      ${weak ? `<p class="mc-warn" role="status">${i('alert', 16)}${t(weak[2])}</p>` : ''}
      <p class="dim">${t('São os mesmos temas das comunidades. Cada pessoa escolhe entre claro e escuro no app; sem escolha, vale o modo do tema.')}</p>`;
  };
  const drawModules = () => {
    const config = draftConfig(draft), inBar = new Set(barSplit(config).tabs.map(row => row.key));
    const row = (key, name, on, place, fixed) => `<li data-module="${key}"${fixed ? '' : ' draggable="true"'}><span class="mc-grip" aria-hidden="true">${fixed ? i('home', 17) : '⠿'}</span><label class="check"><input type="checkbox" name="${fixed ? 'home' : 'module'}" value="${key}"${on ? ' checked' : ''}> ${t(name)}</label><small class="mc-place">${t(place)}</small>
      ${fixed ? '' : `<span class="mc-move"><button type="button" class="icon-btn" data-mc="up" data-key="${key}" aria-label="${h(`${tr('Mover para cima')}: ${tr(name)}`)}">${i('arrowUp', 16)}</button><button type="button" class="icon-btn" data-mc="down" data-key="${key}" aria-label="${h(`${tr('Mover para baixo')}: ${tr(name)}`)}">${i('arrowDown', 16)}</button></span>`}</li>`;
    return `<ol class="mc-modules" aria-label="${t('Módulos do app, na ordem em que aparecem')}">${row('home', 'Início', draft.home, draft.home ? 'Primeira aba' : 'Oculto', true)}${draft.order.map(key => {
      const hidden = draft.hidden.includes(key);
      return row(key, mobileLabels[key] || key, !hidden, hidden ? 'Oculto' : inBar.has(key) ? 'Na barra' : 'Em Mais', false);
    }).join('')}</ol><p class="dim">${t('Arraste ou use as setas para mudar a ordem. Cada pessoa só vê os módulos que pode abrir.')}</p>`;
  };
  const drawLinks = () => `${draft.custom.length ? `<ul class="mc-links">${draft.custom.map((row, k) => `<li><label>${t('Nome do botão')}<input name="linkLabel" data-k="${k}" maxlength="40" value="${h(row.label)}" placeholder="${t('Central de ajuda')}"></label><label>${t('Endereço')}<input name="linkUrl" data-k="${k}" type="url" maxlength="2000" value="${h(row.url)}" placeholder="https://"></label><button type="button" class="icon-btn" data-mc="link-remove" data-k="${k}" aria-label="${h(`${tr('Remover link')} ${row.label}`)}">${i('trash', 16)}</button></li>`).join('')}</ul>`
    : `<div class="mc-empty"><span>${i('link', 20)}</span><b>${t('Nenhum link próprio')}</b><p class="dim">${t('Crie botões que abrem um endereço seu, como a central de ajuda ou o site. Eles aparecem em Mais.')}</p></div>`}
    ${draft.custom.length < MAX_LINKS ? `<button type="button" class="secondary" data-mc="link-add">${i('plus', 15)}${t('Adicionar link')}</button>` : `<p class="dim">${t('Limite de cinco links.')}</p>`}`;
  const drawPublish = () => {
    const published = app().status === 'published', list = storeChecklist(app(), draft), done = list.filter(row => row.done).length;
    return `${published ? `<div class="mc-link"><code>${h(link())}</code><span class="inline-gap"><button type="button" class="secondary" data-mc="copy">${i('copy', 15)}${t('Copiar link')}</button><a class="secondary" href="${h(link())}" target="_blank" rel="noopener">${i('external', 15)}${t('Abrir')}</a></span></div>`
      : `<div class="mc-empty"><span>${i('send', 20)}</span><b>${t('O app ainda não está no ar')}</b><p class="dim">${t('Publique para receber o link de instalação e enviar à equipe dos seus clientes.')}</p><button type="button" class="primary" data-mc="publish">${i('send', 16)}${t('Publicar app')}</button></div>`}
      <p class="dim">${t('Incluso no plano da agência. O app é instalável no Android e no iPhone por esse link e abre a plataforma com a sua marca, os módulos que você escolheu e notificações.')}</p>
      <div class="mc-check"><header><b>${t('Apple e Google')}</b><small class="dim">${done} ${t('de')} ${list.length}</small></header><ul>${list.map(row => `<li class="${row.done ? 'ok' : ''}"><i aria-hidden="true">${row.done ? i('check', 13) : ''}</i><span>${t(row.label)}${row.done ? `<span class="mc-sr"> (${t('Pronto')})</span>` : ''}</span>${row.done ? '' : `<button type="button" class="mc-go" data-mc="go" data-section="${row.section}" data-field="${row.field}">${t(row.field === 'publish' ? 'Publicar' : 'Preencher')}</button>`}</li>`).join('')}</ul></div>`;
  };
  const drawStore = () => {
    const field = (name, label, attrs = '') => `<label>${t(label)}<input name="${name}" data-store value="${h(draft.store[name])}" ${attrs}></label>`;
    return `<div class="field-grid">${field('developer', 'Desenvolvedor (como aparece nas lojas)', 'maxlength="80"')}${field('supportEmail', 'E-mail de suporte', 'type="email" maxlength="120"')}${field('supportUrl', 'Site de suporte', 'type="url" placeholder="https://"')}${field('privacyUrl', 'Política de privacidade', 'type="url" placeholder="https://"')}
      ${field('androidPackage', 'Pacote Android', 'placeholder="br.com.suaagencia.app"')}${field('iosBundle', 'Bundle ID do iOS', 'placeholder="br.com.suaagencia.app"')}${field('domain', 'Domínio do app (opcional, apontado para o graao)', 'placeholder="app.suaagencia.com.br"')}</div>
      <label>${t('Impressões SHA-256 da chave de assinatura Android (Play Console → Integridade do app), uma por linha')}<textarea name="fingerprints" data-store rows="2" placeholder="AB:CD:…">${h(draft.store.fingerprints)}</textarea></label>
      <button type="button" class="secondary" data-mc="package">${i('download', 15)}${t('Baixar pacote das lojas')}</button>
      <details><summary>${t('Como publicar nas lojas')}</summary><ol>
        <li>Google Play: instale o Bubblewrap (<code>npm i -g @bubblewrap/cli</code>), coloque o <code>twa-manifest.json</code> do pacote numa pasta e rode <code>bubblewrap build</code>. Envie o arquivo .aab no Play Console da agência.</li>
        <li>Cole aqui a impressão SHA-256 da chave de assinatura; o graao passa a servir <code>/.well-known/assetlinks.json</code> no domínio do app e ele abre em tela cheia.</li>
        <li>App Store: em pwabuilder.com, abra o link de instalação, baixe o pacote iOS com o Bundle ID acima, assine no Xcode com a conta Apple Developer da agência e envie pelo App Store Connect.</li>
        <li>${t('Cada nova publicação no graao atualiza o app instalado, sem novo envio às lojas.')}</li></ol></details>`;
  };

  // ---- Columns
  const drawSide = () => {
    const status = sectionStatus(app(), draft), published = app().status === 'published';
    return `<div class="mc-id"><span class="mc-tile">${draft.icon ? `<img src="${h(draft.icon)}" alt="">` : h((draft.appName.trim()[0] || 'A').toUpperCase())}</span><div><strong>${h(draft.appName.trim() || tr('Sem nome'))}</strong><small>${published ? `${t('Publicado')} · ${t('versão')} ${h(app().version)}` : t('Rascunho')}</small></div></div>
      <nav class="mc-nav" aria-label="${t('Partes do app')}">${sections.map(([key, label, icn]) => `<button type="button" data-mc="section" data-key="${key}"${section === key ? ' aria-current="true"' : ''}>${i(icn, 17)}<span>${t(label)}</span><small class="${status[key][1] === true ? 'ok' : status[key][1] === false ? 'miss' : ''}">${status[key][1] === true && key !== 'modules' ? `${i('check', 12)}<span class="mc-sr">${t(status[key][0])}</span>` : t(status[key][0])}</small></button>`).join('')}</nav>`;
  };
  const drawPreview = () => {
    const config = draftConfig(draft), { tabs, more } = barSplit(config), name = draft.appName.trim() || tr('Sem nome'), views = [['entry', 'Entrada'], ['home', draft.home ? 'Início' : 'App'], ['more', 'Mais']];
    const theme = draftTheme(draft), own = themeIsDark(theme) ? 'dark' : 'light', seen = mode || own, first = tabs[0]?.route || '';
    const screen = draft.home ? homeView(sampleHome()) : `<div class="ma-home"><h1>${t(tabs[0]?.label || 'App')}</h1>${'<div class="mc-ghost"></div>'.repeat(3)}</div>`;
    const inside = shown === 'entry' ? entryView({ name, phrase: draft.loginTitle, icon: draft.icon, cover: draft.cover, stepsHtml: installSteps('', 'Instale no Android', androidSteps) })
      : `<div class="ma-frame-screen">${headerView({ name, icon: draft.icon, account: tr('Clínica Aurora'), unread: 2, profile: { text: 'MS', label: '', attr: '' } })}${screen}${shown === 'more' ? sheetView({ account: tr('Clínica Aurora'), canSwitch: true, modules: more, links: config.custom, push: 'off', dark: seen === 'dark', language: langToggle(), signOut: true }) : ''}</div>${tabsView({ name, tabs, current: first, open: shown === 'more' })}`;
    const seg = (items, current, attr, label) => `<div class="mc-seg" role="group" aria-label="${t(label)}">${items.map(([key, text, icn]) => `<button type="button" data-mc="${attr}" data-key="${key}" aria-pressed="${key === current}"${icn ? ` aria-label="${t(text)}"` : ''}>${icn ? i(icn, 15) : t(text)}</button>`).join('')}</div>`;
    return `<div class="mc-preview-tools">${seg(views, shown, 'view', 'Tela da prévia')}${shown === 'entry' ? '' : seg([['light', 'Claro', 'sun'], ['dark', 'Escuro', 'moon']], seen, 'mode', 'Modo da prévia')}</div>
      <div class="mc-phone" role="img" aria-label="${t('Prévia do app')}"><div class="ma-frame" inert style="${h(appStyle(theme, shown === 'entry' ? '' : seen))}">${inside}</div></div><p class="dim">${t('Prévia com dados de exemplo.')}</p>`;
  };
  const drawFoot = () => `<p class="form-status" role="alert"></p><p class="dim">${t('Alterações não salvas.')} ${app().status === 'published' ? t('O que você salvar já vale no app publicado.') : ''}</p><button type="button" class="secondary" data-mc="discard">${i('undo', 15)}${t('Descartar')}</button><button class="primary">${i('check', 15)}${t('Salvar')}</button>`;

  function page() {
    if (!draft) start();
    const published = app().status === 'published';
    return `<div class="page mc" data-mobile-creator>${head('Aplicativo móvel', 'O app com a sua marca que a equipe dos seus clientes instala no celular.', `<button type="button" class="primary" data-mc="publish">${i('send', 16)}${t(published ? 'Publicar nova versão' : 'Publicar app')}</button>`)}
      <div class="mc-grid"><aside class="surface mc-side" data-mc-side>${drawSide()}</aside>
      <form class="surface settings-form set-form mc-form" novalidate>
        ${sec('identity', 'Identidade', 'O nome, o ícone e as cores que aparecem no app inteiro.', `<label>${t('Nome do app')}<input name="appName" required maxlength="40" value="${h(draft.appName)}"></label><div data-mc-part="icon">${drawPicture('icon')}</div><div data-mc-part="themes" class="mc-part">${drawThemes()}</div>`)}
        ${sec('entry', 'Entrada', 'A primeira tela, onde a pessoa entra e instala o app.', `<label>${t('Frase de boas-vindas')}<input name="loginTitle" maxlength="60" value="${h(draft.loginTitle)}" placeholder="${t('Bem-vindo de volta')}"></label><div data-mc-part="cover">${drawPicture('cover')}</div>`)}
        ${sec('modules', 'Módulos', 'O que aparece no app e em que ordem. Os primeiros ficam na barra; os outros, em Mais.', `<div data-mc-part="modules" class="mc-part">${drawModules()}</div>`)}
        ${sec('links', 'Links próprios', 'Botões do app que abrem um endereço seu.', `<div data-mc-part="links" class="mc-part">${drawLinks()}</div>`)}
        ${sec('publish', 'Publicação', 'O link de instalação e o que a Apple e o Google pedem para publicar o app nas lojas.', `<div data-mc-part="publish" class="mc-part">${drawPublish()}</div>${drawStore()}`)}
        <footer class="set-foot mc-foot"${dirty() ? '' : ' hidden'}>${drawFoot()}</footer></form>
      <aside class="mc-preview" aria-label="${t('Prévia do app')}">${drawPreview()}</aside></div></div>`;
  }

  // ---- Redrawing: the fields being typed in are never replaced.
  const part = (key, html) => { const el = $(`[data-mc-part="${key}"]`); if (el) el.innerHTML = html; };
  function refresh() {
    const along = $('.mc-nav').scrollLeft;
    $('[data-mc-side]').innerHTML = drawSide();
    $('.mc-nav').scrollTo({ left: along, behavior: 'instant' });
    $('.mc-preview').innerHTML = drawPreview();
    const foot = $('.mc-foot');
    foot.hidden = !dirty();
    foot.querySelector('.form-status').textContent = '';
  }
  function showSection(key) {
    section = key;
    for (const el of root.querySelectorAll('[data-mc-section]')) el.hidden = el.dataset.mcSection !== key;
    // The preview follows what is being edited.
    shown = key === 'entry' ? 'entry' : key === 'links' ? 'more' : 'home';
    if (key === 'publish') part('publish', drawPublish());
    refresh();
    $(`[data-mc="section"][data-key="${key}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
  }
  const focusField = name => { const el = $(`[name="${name === 'icon' ? 'iconFile' : name}"]`); el?.focus({ preventScroll: true }); (el?.closest('.mc-picture') || el)?.scrollIntoView({ block: 'center' }); };
  const invalid = (key, field, message) => { showSection(key); field?.focus(); $('.mc-foot .form-status').textContent = message; flash(message, true); return false; };

  function valid() {
    if (!draft.appName.trim()) return invalid('identity', $('[name=appName]'), tr('Dê um nome ao app.'));
    for (const [k, row] of draft.custom.entries()) {
      if (!row.label.trim() && !row.url.trim()) continue;
      if (!row.label.trim()) return invalid('links', root.querySelectorAll('[name=linkLabel]')[k], tr('Dê um nome a cada link próprio.'));
      if (!/^https?:\/\/\S+\.\S+/i.test(row.url.trim())) return invalid('links', root.querySelectorAll('[name=linkUrl]')[k], tr('Use um endereço que comece com https://.'));
    }
    const wrong = [...root.querySelectorAll('[data-store]')].find(el => !el.checkValidity());
    if (wrong) return invalid('publish', wrong, `${wrong.closest('label').firstChild.textContent.trim()}: ${wrong.validationMessage}`);
    return true;
  }
  async function save() {
    if (!valid()) return false;
    const look = lookChanges(base, draft), store = storeChanges(base, draft);
    try {
      if (look) { await act('mobile-app', { data: look }); }
      if (store) await act('mobile-app-store', { data: store });
    } catch (error) {
      // What was saved before the failure is the new starting point; the rest stays in the draft.
      base = creatorDraft(app());
      if (look && base.appName === look.appName) draft = { ...draft, ...base, icon: draft.icon, icons: draft.icons, store: draft.store };
      if (open()) { refresh(); $('.mc-foot .form-status').textContent = error.message; }
      throw error;
    }
    start();
    return true;
  }
  async function publish() {
    if (!draft.icon) { showSection('identity'); focusField('icon'); flash(tr('Envie o ícone do app antes de publicar.'), true); return; }
    if (dirty() && !await save()) return;
    await act('mobile-app-publish');
    start(); section = 'publish';
    rerender();
    flash(tr('App publicado. Envie o link de instalação para a equipe.'));
  }
  const guarded = async work => {
    if (busy) return;
    busy = true;
    root.classList.add('mc-busy');
    try { await work(); } catch (error) { flash(error.message, true); } finally { busy = false; root?.classList.remove('mc-busy'); }
  };
  function move(key, step, to = null) {
    const list = draft.order.filter(row => row !== key), at = draft.order.indexOf(key);
    list.splice(to === null ? Math.max(0, Math.min(list.length, at + step)) : to, 0, key);
    draft.order = list;
    part('modules', drawModules());
    refresh();
  }

  function setTheme(theme, own) {
    draft.theme = theme; custom = own;
    if (theme) draft.primary = theme.tokens.primary;
  }
  function onInput(el) {
    if (el.name === 'appName') draft.appName = el.value;
    else if (el.name === 'loginTitle') draft.loginTitle = el.value;
    else if (el.name === 'linkLabel') draft.custom[el.dataset.k].label = el.value;
    else if (el.name === 'linkUrl') draft.custom[el.dataset.k].url = el.value;
    else if (el.matches('[data-store]')) { draft.store[el.name] = el.value; part('publish', drawPublish()); }
    else if (el.name === 'ownColor') setTheme(themeFromColor(el.value), true);
    else if (el.name?.startsWith('token.')) { const theme = draftTheme(draft); setTheme({ preset: 'custom', tokens: { ...theme.tokens, [el.name.slice(6)]: el.value } }, true); }
    else return;
    refresh();
  }
  async function onChange(el) {
    if (el.name === 'ownColor' || el.name?.startsWith('token.')) { const all = $('.mc-all')?.open; part('themes', drawThemes()); if (all) $('.mc-all').open = true; return; }
    if (el.name === 'themePreset') {
      const preset = themePresets.find(row => row.id === el.value);
      if (preset) setTheme({ preset: preset.id, tokens: { ...preset.tokens } }, false);
      else setTheme(base.theme === null ? null : themeFromColor(draftTheme(draft).tokens.primary), true);
      if (!preset && base.theme === null) draft.primary = base.primary;
      part('themes', drawThemes());
      $(`[name="themePreset"][value="${el.value}"]`)?.focus();
    } else if (el.name === 'home') { draft.home = el.checked; part('modules', drawModules()); $('[name=home]')?.focus(); if (shown !== 'home') shown = 'home'; }
    else if (el.name === 'module') {
      draft.hidden = el.checked ? draft.hidden.filter(key => key !== el.value) : [...draft.hidden, el.value];
      part('modules', drawModules());
      $(`[name="module"][value="${el.value}"]`)?.focus();
    } else if (el.name === 'iconFile' && el.files[0]) {
      const raw = await readFile(el.files[0]);
      draft.icons = { icon: await squarePng(raw, 1024), icon512: await squarePng(raw, 512), icon192: await squarePng(raw, 192) };
      draft.icon = draft.icons.icon512;
      part('icon', drawPicture('icon'));
    } else if (el.name === 'coverFile' && el.files[0]) {
      draft.cover = await coverPicture(await readFile(el.files[0]));
      shown = 'entry';
      part('cover', drawPicture('cover'));
    } else return;
    refresh();
  }
  async function onClick(button) {
    const { mc, key, k } = button.dataset;
    if (mc === 'section') showSection(key);
    else if (mc === 'view') { shown = key; $('.mc-preview').innerHTML = drawPreview(); $(`[data-mc="view"][data-key="${key}"]`)?.focus(); }
    else if (mc === 'mode') { mode = key; $('.mc-preview').innerHTML = drawPreview(); $(`[data-mc="mode"][data-key="${key}"]`)?.focus(); }
    else if (mc === 'up' || mc === 'down') { move(key, mc === 'up' ? -1 : 1); $(`[data-mc="${mc}"][data-key="${key}"]`)?.focus(); }
    else if (mc === 'link-add') { draft.custom.push({ label: '', url: '' }); part('links', drawLinks()); refresh(); [...root.querySelectorAll('[name=linkLabel]')].at(-1)?.focus(); }
    else if (mc === 'link-remove') { draft.custom.splice(Number(k), 1); part('links', drawLinks()); refresh(); $('[data-mc="link-add"]')?.focus(); }
    else if (mc === 'icon-remove') { draft.icon = ''; draft.icons = null; part('icon', drawPicture('icon')); refresh(); }
    else if (mc === 'cover-remove') { draft.cover = ''; part('cover', drawPicture('cover')); refresh(); }
    else if (mc === 'go') { if (button.dataset.field === 'publish') await guarded(publish); else { showSection(button.dataset.section); focusField(button.dataset.field); } }
    else if (mc === 'copy') await navigator.clipboard.writeText(link()).then(() => flash(tr('Link copiado.')), () => flash(tr('Selecione o link e copie.'), true));
    else if (mc === 'discard') { start(); rerender(); }
    else if (mc === 'publish') await guarded(publish);
    else if (mc === 'package') await guarded(async () => {
      const response = await fetch('/api/mobile-app/package'), pack = await response.json();
      if (!response.ok) throw new Error(pack.error || tr('Não foi possível gerar o pacote.'));
      download('twa-manifest.json', JSON.stringify(pack.twaManifest, null, 2), 'application/json');
      download('graao-app-lojas.json', JSON.stringify(pack, null, 2), 'application/json');
      flash(pack.ready ? tr('Pacote baixado: twa-manifest.json e graao-app-lojas.json.') : `${tr('Pacote baixado. Ainda falta:')} ${pack.missing.join(', ')}.`, !pack.ready);
    });
  }

  function mount(el) {
    root = el;
    root.addEventListener('input', event => onInput(event.target));
    root.addEventListener('change', event => { void onChange(event.target).catch(error => flash(error.message, true)); });
    root.addEventListener('click', event => { const button = event.target.closest('[data-mc]'); if (button) void onClick(button); });
    root.querySelector('form').addEventListener('submit', event => { event.preventDefault(); event.stopPropagation(); void guarded(async () => { if (await save()) { rerender(); flash(tr('Aplicativo móvel salvo.')); } }); });
    let dragged = '';
    root.addEventListener('dragstart', event => { dragged = event.target.closest?.('.mc-modules li[draggable]')?.dataset.module || ''; if (dragged) event.dataTransfer.effectAllowed = 'move'; });
    root.addEventListener('dragover', event => { const row = dragged && event.target.closest('.mc-modules li[draggable]'); if (!row) return; event.preventDefault(); for (const li of root.querySelectorAll('.mc-over')) li.classList.remove('mc-over'); row.classList.add('mc-over'); });
    root.addEventListener('drop', event => { const row = dragged && event.target.closest('.mc-modules li[draggable]'); if (!row) return; event.preventDefault(); move(dragged, 0, draft.order.indexOf(row.dataset.module)); dragged = ''; });
    root.addEventListener('dragend', () => { dragged = ''; for (const li of root.querySelectorAll('.mc-over')) li.classList.remove('mc-over'); });
  }

  // ---- Leaving with something unsaved comes back and asks first (the draft lives here, so nothing is lost).
  const here = hash => hash.split('/').slice(0, 2).join('/') === '#agency/mobile-app';
  let last = location.hash;
  addEventListener('hashchange', async () => {
    const was = last, to = location.hash;
    last = to;
    if (!here(was) || here(to) || !draft) return;
    if (!dirty()) { draft = null; return; }
    last = was; history.replaceState(null, '', was); dispatchEvent(new HashChangeEvent('hashchange'));
    if (!await ask(tr('Sair sem salvar?'), { text: tr('As alterações do aplicativo móvel serão perdidas.'), ok: tr('Sair sem salvar'), cancel: tr('Continuar editando') })) return;
    draft = null; location.hash = to;
  });
  addEventListener('beforeunload', event => { if (open() && dirty()) event.preventDefault(); });

  return { page, mount, dirty };
}
