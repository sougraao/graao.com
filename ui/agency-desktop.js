// Agência → Aplicativo desktop (6.7): the customizer of the agency's installable app (theme, icon, name, title,
// subtitle, logo, background, illustration) with a live preview of its sign-in screen, and the Status panel
// (publish, version, link to install). The server side is agency-desktop.mjs.
import { icon } from './icons.js';

const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const desktopPresets = [
  ['graao', 'Laranja Graao', '#111111', '#f5f5f5', '#ff6b1a', '#111111'], ['brasa', 'Brasa', '#fbf6f2', '#2a160b', '#c2410c', '#ffffff'],
  ['ambar', 'Âmbar', '#fdf8ee', '#2b1d07', '#a15c07', '#ffffff'], ['esmeralda', 'Esmeralda', '#f5f8f3', '#14261b', '#1f7a4d', '#ffffff'],
  ['oceano', 'Oceano', '#f3f8f8', '#0d2529', '#0e7490', '#ffffff'], ['violeta', 'Violeta', '#f7f4fa', '#1f1633', '#6d28d9', '#ffffff'],
  ['rosa', 'Rosa', '#fbf4f6', '#2a1220', '#be185d', '#ffffff'], ['ardosia', 'Ardósia', '#f4f6f8', '#1f2933', '#334e68', '#ffffff'],
  ['neon', 'Neon', '#111111', '#f5f5f5', '#1fe5f0', '#062a2d'], ['minimal', 'Minimalista', '#ffffff', '#1a1a1a', '#1a1a1a', '#ffffff']
];
const tokens = [['background', 'Fundo'], ['text', 'Texto'], ['button', 'Botão'], ['buttonText', 'Texto do botão']];
const images = [['icon', 'Ícone do app *', '1024 × 1024, PNG. Aparece na barra de tarefas e no menu iniciar.', 'image/png'], ['logo', 'Logo completo', '512 × 128. No topo da tela de entrada.', 'image/png,image/jpeg,image/webp'],
  ['background', 'Imagem de fundo', '3840 × 2160 (opcional).', 'image/png,image/jpeg,image/webp'], ['illustration', 'Ilustração ou mascote', '600 × 800 (opcional), ao lado da tela de entrada.', 'image/png,image/jpeg,image/webp']];

function screen(app) {
  const t = app.theme;
  return `<div class="dk-window" data-ad-preview style="--bg:${h(t.background)};--fg:${h(t.text)};--btn:${h(t.button)};--btn-fg:${h(t.buttonText)};${app.background ? `background-image:url(${h(app.background)});` : ''}">
    <div class="dk-bar"><span></span><span></span><span></span><b data-ad="appName">${h(app.appName)}</b></div>
    <div class="dk-body"><div class="dk-side">${app.illustration ? `<img src="${h(app.illustration)}" alt="" data-ad-img="illustration">` : '<i data-ad-img="illustration"></i>'}</div>
      <div class="dk-card">${app.logo ? `<img class="dk-logo" src="${h(app.logo)}" alt="" data-ad-img="logo">` : app.icon ? `<img class="dk-mark" src="${h(app.icon)}" alt="" data-ad-img="logo">` : '<i data-ad-img="logo"></i>'}
        <strong data-ad="title">${h(app.title)}</strong><small data-ad="subtitle">${h(app.subtitle)}</small><span class="dk-button">Entrar no <span data-ad="appName">${h(app.appName)}</span></span></div></div></div>`;
}

export function desktopPage(agency, origin, agencyId) {
  const app = { appName: 'My Agency', title: '', subtitle: '', theme: { preset: 'graao', background: '#111111', text: '#f5f5f5', button: '#ff6b1a', buttonText: '#111111' }, status: 'draft', version: 0, ...agency.desktopApp };
  app.theme = { preset: 'graao', background: '#111111', text: '#f5f5f5', button: '#ff6b1a', buttonText: '#111111', ...(agency.desktopApp?.theme || {}) };
  const link = `${origin}/desktop/${agencyId}/`;
  const steps = [Boolean(app.icon), Boolean(app.appName && app.title && app.subtitle), app.status === 'published'];
  return `<div class="page"><header class="page-head"><div><h1>Aplicativo desktop</h1><p>O app da sua agência para Windows, macOS e Linux: janela própria, seu nome e seu ícone, abrindo direto na tela de entrada com a sua marca.</p></div></header>
    <div class="dk-progress" role="progressbar" aria-valuenow="${Math.round(steps.filter(Boolean).length / 3 * 100)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${Math.round(steps.filter(Boolean).length / 3 * 100)}%"></span></div>
    <div class="dk-layout"><form class="surface settings-form set-form is-narrow" data-ag-form="desktop-app">
      <section class="set-section"><header class="set-head"><h2>Tema</h2><p class="dim">Escolha um tema pronto ou monte o seu.</p></header><div class="set-body"><div class="dk-presets">${desktopPresets.map(([id, name, bg, fg, btn]) => `<label class="dk-preset"><input type="radio" name="preset" value="${id}" ${app.theme.preset === id ? 'checked' : ''}>
        <span style="background:${bg};color:${fg}"><i style="background:${btn}"></i>${h(name)}</span></label>`).join('')}
        <label class="dk-preset"><input type="radio" name="preset" value="custom" ${app.theme.preset === 'custom' ? 'checked' : ''}><span>${icon('edit', 13)} Personalizado</span></label></div>
      <div class="field-grid">${tokens.map(([key, label]) => `<label>${label}<input type="color" name="${key}" value="${h(app.theme[key])}"></label>`).join('')}</div></div></section>
      <section class="set-section"><header class="set-head"><h2>Identidade</h2><p class="dim">O nome na barra de tarefas e os textos da tela de entrada.</p></header><div class="set-body">
      <div class="field-grid"><label>Nome do app *<input name="appName" required maxlength="50" value="${h(app.appName)}" placeholder="Ex.: Agência Norte"></label>
        <label>Domínio (opcional)<input name="domain" maxlength="200" value="${h(app.domain || '')}" placeholder="app.suaagencia.com.br"></label></div>
      <label>Título da tela de entrada *<input name="title" required maxlength="150" value="${h(app.title)}"></label>
      <label>Subtítulo *<input name="subtitle" required maxlength="200" value="${h(app.subtitle)}"></label></div></section>
      <section class="set-section"><header class="set-head"><h2>Imagens</h2><p class="dim">Só o ícone é obrigatório.</p></header><div class="set-body is-pairs">${images.map(([key, label, hint, accept]) => `<div class="dk-image"><label>${label}<input type="file" name="${key}File" accept="${accept}"></label>
        <small class="dim">${hint}</small>${app[key] ? `<span class="dk-thumb"><img src="${h(app[key])}" alt=""><button type="button" class="text-link" data-ag="desktop-remove" data-id="${key}">Remover</button></span>` : ''}</div>`).join('')}</div></section>
      <footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">${icon('check', 16)} Salvar</button></footer></form>
      <aside class="dk-aside"><h2>Pré-visualização</h2>${screen(app)}
        <section class="surface padded dk-status"><h2>Status</h2>
          ${app.status === 'published' ? `<p><span class="badge green">Publicado</span> versão ${app.version} · ${h(new Date(app.publishedAt).toLocaleString('pt-BR'))}</p>
            <label>Link para instalar<input readonly value="${h(link)}"></label>
            <div class="inline-gap"><a class="secondary" href="${h(link)}" target="_blank" rel="noopener">${icon('external', 15)} Abrir</a><button type="button" class="secondary" data-ag="desktop-copy" data-id="${h(link)}">${icon('copy', 15)} Copiar link</button>
              <button type="button" class="primary" data-ag="desktop-publish">${icon('send', 15)} Publicar alterações</button></div>`
            : `<p><span class="badge">Rascunho</span> Salve o tema, o nome e o ícone e publique para gerar o link de instalação.</p>
            <button type="button" class="primary" data-ag="desktop-publish" ${app.icon ? '' : 'disabled'}>${icon('send', 15)} Publicar o app</button>${app.icon ? '' : '<p class="dim">Envie o ícone para publicar.</p>'}`}
          <h3>Como os clientes instalam</h3><ol class="dk-steps"><li>Abrem o link no Chrome ou no Edge.</li><li>Clicam em <b>Instalar o app</b> (ou no ícone de instalar da barra de endereço).</li>
            <li>O ${h(app.appName)} aparece no menu iniciar ou no Launchpad, com o seu ícone, e abre na tela de entrada com a sua marca.</li></ol>
          <p class="dim">Mudanças publicadas chegam no próximo uso do app, sem reinstalar.</p></section></aside></div></div>`;
}

/** Live preview while typing or picking colors. */
export function desktopPreview(form, el) {
  const box = form.closest('.dk-layout')?.querySelector('[data-ad-preview]');
  if (!box) return;
  if (['appName', 'title', 'subtitle'].includes(el.name)) box.querySelectorAll(`[data-ad="${el.name}"]`).forEach(node => { node.textContent = el.value; });
  if (el.name === 'preset') {
    const preset = desktopPresets.find(row => row[0] === el.value);
    if (preset) tokens.forEach(([key], i) => { form.elements[key].value = preset[2 + i]; });
  }
  if (tokens.some(([key]) => key === el.name)) { const custom = form.querySelector('[name="preset"][value="custom"]'); if (custom) custom.checked = true; }
  const vars = { background: '--bg', text: '--fg', button: '--btn', buttonText: '--btn-fg' };
  for (const [key, cssVar] of Object.entries(vars)) box.style.setProperty(cssVar, form.elements[key].value);
}

export const readFile = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
/** A square PNG of the icon at one size (center crop), drawn on a canvas. */
export const squarePng = (dataUrl, size) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => { const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size }); const side = Math.min(img.width, img.height);
    canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size); resolve(canvas.toDataURL('image/png')); };
  img.onerror = () => reject(new Error('Não foi possível ler a imagem do ícone.'));
  img.src = dataUrl;
});
/** Shrinks a large picture so it fits the upload limit. */
const fitted = (dataUrl, maxWidth) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => { if (img.width <= maxWidth) return resolve(dataUrl); const canvas = Object.assign(document.createElement('canvas'), { width: maxWidth, height: Math.round(img.height * maxWidth / img.width) });
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/jpeg', 0.82)); };
  img.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
  img.src = dataUrl;
});

/** The form as the 'desktop-app' payload (files become data URIs; the icon also at 512 and 192). */
export async function readDesktop(form) {
  const f = form.elements, theme = { preset: form.querySelector('[name="preset"]:checked')?.value || 'custom' };
  for (const [key] of tokens) theme[key] = f[key].value;
  const data = { appName: f.appName.value, title: f.title.value, subtitle: f.subtitle.value, domain: f.domain.value, theme };
  const iconFile = f.iconFile.files[0];
  if (iconFile) { const raw = await readFile(iconFile); data.icon = await squarePng(raw, 1024); data.icon512 = await squarePng(raw, 512); data.icon192 = await squarePng(raw, 192); }
  if (f.logoFile.files[0]) data.logo = await fitted(await readFile(f.logoFile.files[0]), 1024);
  if (f.backgroundFile.files[0]) data.background = await fitted(await readFile(f.backgroundFile.files[0]), 1920);
  if (f.illustrationFile.files[0]) data.illustration = await fitted(await readFile(f.illustrationFile.files[0]), 800);
  return data;
}
