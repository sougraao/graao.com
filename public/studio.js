import { icon } from './icons.js';
import { h, utabs } from './screens.js';
import { studioTemplates, studioThemes } from './studio-data.js';
import { blockGroups, blockHtml, cleanImage, cleanLink, cleanVideo, sectionBlocks } from './studio-blocks.js';
import { afterBuilderRender, builderView } from './studio-builder.js';
import { designStage, mountDesignStage, resizeDesignStage } from './design-workspace.js';
import { ask } from './ask.js';

const templateName = key => studioTemplates.find(template => template[0] === key)?.[1] || 'Projeto';
const projectLink = (id,label) => `<a href="#sites/editor/${id}" data-studio-open="${id}">${h(label)}</a>`;

function tile(c, project) {
  const pages = project.pages?.length || 1;
  return `<article class="studio-tile"><a class="studio-thumb theme-${project.theme}" href="#sites/editor/${project.id}" data-studio-open="${project.id}" aria-label="Abrir ${h(project.name)}"><i></i><i></i><i></i></a>
    <div class="studio-tile-label"><div><h3>${projectLink(project.id,project.name)}</h3><p>${h(templateName(project.template))} · ${pages} página${pages === 1 ? '' : 's'}${project.publishedAt ? ' · <span class="studio-live">Publicado</span>' : ''}</p></div>
    <button class="icon-btn ${project.starred ? 'studio-selected-star' : ''}" data-studio-star="${project.id}" aria-label="${project.starred ? 'Remover dos favoritos' : 'Favoritar'} ${h(project.name)}" aria-pressed="${Boolean(project.starred)}">${icon('star',17)}</button></div></article>`;
}

const studioHomeItems = [['recent','Recentes'],['projects','Meus projetos'],['starred','Favoritos'],['templates','Modelos']].map(([id,label]) => ({ value: id, label, href: `#studio/${id}` }));

function home(c) {
  const view = c.tab || 'templates';
  const projects = [...c.s.studioProjects].sort((a,b) => String(b.viewedAt || b.created).localeCompare(a.viewedAt || a.created));
  const selected = studioTemplates.find(item => item[0] === c.studio.template);
  const prompt = `<section class="studio-hero"><div class="studio-hero-inner"><h1>Crie seu site</h1>
    <form class="studio-prompt" data-form="studio-create">
      <textarea name="brief" placeholder="Descreva o que você quer criar…" aria-label="Descreva o que você quer criar" required maxlength="4000">${h(c.studio.brief)}</textarea>
      <div class="studio-compose-actions"><label><span class="sr-only">Modelo</span><select name="template">${studioTemplates.map(([id,title]) =>
        `<option value="${id}" ${id === c.studio.template ? 'selected' : ''}>${h(title)}</option>`).join('')}</select></label>
        <div class="spacer"></div>${c.features?.studioAI ? `<button class="secondary" name="engine" value="starter">Usar modelo</button><button class="primary" name="engine" value="model">${icon('spark',16)} Gerar</button>` :
          `<button class="studio-create primary" name="engine" value="starter" aria-label="Criar a partir de um modelo" title="Criar a partir de um modelo">${icon('arrow',19)}</button>`}</div>
      ${c.features?.studioAI ? `<label class="studio-reference">${icon('external',14)}<span class="sr-only">Site de referência (opcional)</span><input name="reference" type="url" maxlength="500" placeholder="Site de referência para o layout (opcional), https://…" autocomplete="off"></label>` : '<p class="dim"><a class="text-link" href="#agency/settings/openai">Conecte sua chave da OpenAI</a> para gerar páginas com IA.</p>'}
      <p class="form-status" role="alert"></p></form>
    ${selected ? `<p class="studio-mode">${c.features?.studioAI ? 'Modelo' : 'Modelo local'} · ${h(selected[1])}</p>` : ''}</div></section>`;
  let main;
  if (view === 'templates') {
    main = `<div class="studio-tiles">${studioTemplates.map(([id,title,description],index) => `<button class="studio-tile studio-template" type="button" data-studio-template="${id}">
      <div class="studio-thumb theme-${studioThemes[index%studioThemes.length]}"><i></i><i></i><i></i></div>
      <div class="studio-tile-label"><div><h3>${h(title)}</h3><p>${h(description)}</p></div></div></button>`).join('')}</div>`;
  } else {
    const visible = projects.filter(project => (view !== 'starred' || project.starred) &&
      (!c.query || `${project.name} ${templateName(project.template)}`.toLowerCase().includes(c.query.toLowerCase())));
    main = `<label class="studio-search"><span class="sr-only">Buscar projetos</span><input id="page-search" value="${h(c.query)}" placeholder="Buscar projetos…"></label>` +
      (visible.length ? `<div class="studio-tiles">${visible.slice(0,view === 'recent' ? 12 : 60).map(project => tile(c,project)).join('')}</div>` :
        `<div class="studio-empty">${icon(view === 'starred' ? 'star' : 'folder',26)} <p>${view === 'starred' ? 'Nenhum projeto favorito' : 'Nenhum projeto encontrado'}</p></div>`);
  }
  return prompt + utabs({ key: 'studio-home', className: 'studio-library', label: 'Seções do AI Studio', items: studioHomeItems, current: view, content: main });
}

function workspaceRail(c) {
  const recent = c.s.studioProjects.slice().sort((a,b) => String(b.viewedAt).localeCompare(a.viewedAt)).slice(0,5);
  return `<aside class="studio-rail"><a href="#studio" class="studio-workspace"><span>${h(c.s.profile.name.charAt(0).toUpperCase())}</span><strong>${h(c.s.profile.name)}</strong></a>
    <nav aria-label="AI Studio"><a href="#studio" ${!c.tab || c.tab === 'templates' ? 'aria-current="page"' : ''}>${icon('grid',16)} Início</a>
      <p>Projetos</p><a href="#studio/projects" ${c.tab === 'projects' ? 'aria-current="page"' : ''}>${icon('folder',16)} Todos os projetos</a>
      <a href="#studio/starred" ${c.tab === 'starred' ? 'aria-current="page"' : ''}>${icon('star',16)} Favoritos</a>
      <p>Recentes</p>${recent.length ? recent.map(project => projectLink(project.id,project.name)).join('') : '<small>Nenhum projeto recente</small>'}</nav></aside>`;
}

function projectSections(project) {
  return `<div class="studio-preview theme-${h(project.theme)}"><div class="studio-preview-top"><div>${h(project.name)}</div><small>${h(templateName(project.template))}</small></div>
    <div class="studio-preview-hero"><h2>${h(project.headline)}</h2>${project.summary ? `<p>${h(project.summary)}</p>` : ''}</div>
    <div class="studio-preview-blocks">${project.blocks.map(item => `<section><h3>${h(item.title)}</h3>${item.body ? `<p>${h(item.body)}</p>` : ''}</section>`).join('')}</div></div>`;
}

export function exportStudioProject(project) {
  const colors = { indigo:'#eef0ff', forest:'#e7f5ee', amber:'#fff4dc', rose:'#fcebf0' };
  return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${h(project.name)}</title>
    <style>body{margin:0;font-family:system-ui,sans-serif;color:#182140;background:#f7f8fb}small{color:#596889}.studio-preview-top{display:flex;justify-content:space-between;gap:1em;padding:1.1rem;border-bottom:1px solid #e1e5f0;background:white}.studio-preview-hero{padding:clamp(2rem,8vw,6rem);background:${colors[project.theme]};text-align:center}.studio-preview-hero h2{font-size:clamp(2rem,6vw,4rem);margin:0}.studio-preview-blocks{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem;margin:2rem auto;max-width:1100px;padding:1rem}.studio-preview-blocks section{background:white;border-radius:12px;padding:1.5rem;box-shadow:0 1px 3px #0001}p{white-space:pre-wrap;overflow-wrap:anywhere}</style>
    <main>${projectSections(project)}</main></html>`;
}

export function studioBlock(item = { title:'', body:'' }) {
  return `<section class="studio-block"><label>Section title<input name="blockTitle" value="${h(item.title)}" required maxlength="100"></label>
    <label>Section content<textarea name="blockBody" maxlength="2200">${h(item.body)}</textarea></label>
    <button class="secondary" type="button" data-studio-remove-block>Remove section</button></section>`;
}

// ---- Site editor ---------------------------------------------------------------
// Pages are real HTML documents served by /studio-preview with a CSP that blocks scripts.
// Visual editing runs on the same-origin preview.

let env = null;
let selected = null, dirty = false, saving = false;
const S = () => {
  const st = env.c.studio;
  st.log ??= []; st.device ??= 'desktop'; st.panel ??= 'design'; st.visual ??= true; st.code ??= false;
  return st;
};
const devices = [['desktop','Desktop','monitor',1280],['tablet','Tablet','tablet',768],['mobile','Celular','mobile',390]];
const deviceWidth = () => devices.find(([id]) => id === S().device)[3];
const fmt = iso => iso ? new Intl.DateTimeFormat('pt-BR',{ day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }).format(new Date(iso)) : '';
const currentPage = () => S().doc?.pages?.find(item => item.id === S().page) || S().doc?.pages?.[0];

function pagesColumn(doc, page, funnel) {
  const label = funnel ? 'Etapas' : 'Páginas';
  return `<aside class="sx-pages dw-panel" aria-label="Estrutura"><section class="dw-panel-section"><h2>${label}</h2><ul>${doc.pages.map(item => `<li class="${item.id === page.id ? 'current' : ''}">
    <button class="sx-page" data-studio-page="${item.id}" aria-current="${item.id === page.id}">${icon('site',15)}<span>${h(item.name)}</span><small>/${item.slug === 'index' ? '' : h(item.slug)}</small></button>
    <span class="sx-page-tools"><button class="icon-btn" data-studio-rename-page="${item.id}" aria-label="Renomear ${h(item.name)}">${icon('edit',14)}</button>${item.slug === 'index' ? '' :
      `<button class="icon-btn" data-studio-delete-page="${item.id}" aria-label="Excluir ${h(item.name)}">${icon('trash',14)}</button>`}</span></li>`).join('')}</ul>
    <button class="secondary" data-studio-add-page ${doc.pages.length >= 50 ? 'disabled' : ''}>${icon('plus',15)} ${funnel ? 'Adicionar etapa' : 'Adicionar página'}</button></section>
    <section class="dw-panel-section"><h2>Camadas</h2><div data-studio-layers><p class="dim">${S().visual ? 'Carregando página…' : 'Disponíveis na edição visual.'}</p></div></section></aside>`;
}

function aiPanel(c) {
  const log = (S().doc?.chat || []).slice(-30);
  return `<div class="sx-selection" id="sx-selection">${selectionHtml()}</div>
    <div class="sx-log" aria-live="polite">${log.length ? log.map(item => `<div class="sx-entry${item.undone ? ' undone' : ''}"><p class="sx-you">${h(item.ask)}</p><p class="sx-ai">${h(item.reply).replace(/\n/g, '<br>')}</p>
      <div class="sx-entry-tools"><small>${fmt(item.at)}${item.page ? ` · ${h(item.page)}` : ''}${item.undone ? ' · desfeita' : ''}</small>${item.before && !item.undone ? `<button class="text-link" data-studio-undo="${item.id}" title="Volta o site para antes desta alteração">${icon('refresh',13)} Desfazer</button>` : ''}</div></div>`).join('') :
      `<p class="dim">Descreva uma alteração. Para editar uma parte específica, selecione um elemento no modo de edição visual.</p>`}</div>
    ${c.features?.studioAI ? `<form class="sx-ask" data-studio-form="revise"><label class="sr-only" for="sx-instruction">Alteração desejada</label><textarea id="sx-instruction" name="instruction" required maxlength="2000" placeholder="Peça à IA uma alteração nesta página…"></textarea>
      <p class="form-status" role="alert"></p><button class="primary">${icon('spark',15)} Aplicar com IA</button></form>`
      : '<p class="dim"><a class="text-link" href="#agency/settings/openai">Conecte sua chave da OpenAI</a> para aplicar alterações com IA. A edição visual e o código continuam disponíveis.</p>'}`;
}
function versionsPanel(doc) {
  return `<ol class="sx-versions">${doc.versions.map((version, index) => `<li><div><b>${h(version.label)}</b><small>${fmt(version.at)}${index === 0 ? ' · atual' : ''}</small></div>
    ${index === 0 ? '' : `<button class="secondary" data-studio-restore="${version.id}">Restaurar</button>`}</li>`).join('')}</ol>`;
}
function publishPanel(c, project, doc) {
  const live = `/s/${c.workspace}/${project.id}`;
  const leads = project.formId ? c.s.submissions.filter(item => item.formId === project.formId).length : 0;
  const stale = doc.published && doc.published.rev !== doc.rev;
  return `<div class="sx-publish"><p>${doc.published ? `<span class="badge green">Publicado</span> ${fmt(doc.published.at)}` : '<span class="badge">Rascunho</span>'}${stale ? ' <span class="badge gold">Alterações pendentes</span>' : ''}</p>
    <div class="inline-gap">${doc.published ? `<button class="primary" data-studio-publish="on" ${stale ? '' : 'disabled'}>Atualizar site</button><button class="secondary" data-studio-publish="off">Despublicar</button>`
      : '<button class="primary" data-studio-publish="on">Publicar</button>'}</div>
    ${doc.published ? `<label class="sx-live">Endereço do site<span><input readonly value="${h(location.origin + live)}" aria-label="Endereço do site"><a class="secondary" href="${live}" target="_blank" rel="noopener">${icon('external',14)} Abrir</a></span></label>` : ''}
    <p><b>${leads}</b> lead${leads === 1 ? '' : 's'} deste site. ${project.formId ? '<a class="text-link" href="#sites/submissions">Ver envios</a>' : 'Ao publicar, um formulário em Sites passa a receber os leads.'}</p>
    <p class="dim">Os envios do formulário criam contatos e acionam os fluxos com o gatilho “Formulário enviado”.</p></div>`;
}

function canvas(c, project, doc, page) {
  const st = S();
  if (st.code) return `<form class="sx-code" data-studio-form="code"><label class="sr-only" for="sx-code">HTML de ${h(page.name)}</label>
    <textarea id="sx-code" name="html" spellcheck="false" autocomplete="off">${h(page.html)}</textarea>
    <div class="inline-gap"><button class="primary">Aplicar código</button><span class="dim">Scripts e manipuladores de eventos são removidos ao salvar.</span></div><p class="form-status" role="alert"></p></form>`;
  return designStage({
    label: `${h(page.name)} <span data-studio-width>${deviceWidth()} px</span>`, width: deviceWidth(),
    content: `<iframe id="studio-frame" title="Prévia de ${h(page.name)}" sandbox="allow-same-origin" src="/studio-preview/${c.workspace}/${project.id}/${page.id}?r=${doc.rev}"></iframe>`,
    tools: `<button type="button" data-studio-visual aria-pressed="${st.visual}" title="Selecionar e editar" aria-label="Selecionar e editar">${icon('cursor',16)}</button>
      <button type="button" data-studio-preview aria-pressed="${!st.visual}" title="Navegar na prévia" aria-label="Navegar na prévia">${icon('play',16)}</button>
      ${st.visual ? `<details class="sx-insert"><summary title="Inserir elemento" aria-label="Inserir elemento">${icon('plus',16)}</summary>
        <div>${blockGroups.map(([group, items]) => `<section><h3>${group}</h3>${items.map(([id,label]) => `<button type="button" data-studio-insert="${id}">${label}</button>`).join('')}</section>`).join('')}</div></details>` : ''}
      <div class="sx-devices" role="group" aria-label="Tamanho da prévia">${devices.map(([id,label,ico]) => `<button type="button" data-studio-device="${id}" aria-pressed="${st.device === id}" aria-label="${label}" title="${label}">${icon(ico,16)}</button>`).join('')}</div>`
  });
}

const panelContent = (c, project, doc) => S().panel === 'versions' ? versionsPanel(doc) : S().panel === 'publish' ? publishPanel(c, project, doc) : S().panel === 'ai' ? aiPanel(c) : inspectorHtml();

function editor(c, project) {
  const st = S();
  const doc = st.docFor === project.id ? st.doc : null;
  if (!doc) { if (st.loadError?.id !== project.id) queueMicrotask(() => env?.loadDoc(project.id)); return `<section class="studio-editor padded"><a class="secondary" href="#sites/funnels">${icon('left',15)} Sites</a><p class="dim">${st.loadError?.id === project.id ? h(st.loadError.message) : `Abrindo ${h(project.name)}…`}</p>${st.loadError?.id === project.id ? '<button class="secondary" data-studio-retry>Tentar novamente</button>' : ''}</section>`; }
  const page = doc.pages.find(item => item.id === st.page) || doc.pages[0];
  st.page = page.id;
  const panel = st.panel;
  return `<section class="studio-editor sx dw-workspace"><header class="studio-editor-head dw-header"><a href="#sites/funnel/${project.id}" class="secondary">${icon('left',15)} ${project.kind === 'funnel' ? 'Funil' : 'Site'}</a>
    <h1>${h(project.name)}</h1>
    <span class="dim sx-dirty" data-studio-dirty role="status" hidden>Alterações não salvas</span>
    <div class="spacer"></div>
    ${st.visual ? '<button class="secondary" data-studio-discard disabled>Descartar</button><button class="primary" data-studio-save-visual disabled>Salvar</button>' : ''}
    <button class="secondary" data-studio-code aria-pressed="${st.code}">${icon('list',15)} Código</button>
    <button class="icon-btn" data-studio-star="${project.id}" aria-pressed="${Boolean(project.starred)}" title="Favorito" aria-label="Favorito">${icon('star',16)}</button>
    <button class="icon-btn" data-studio-download title="Exportar HTML" aria-label="Exportar HTML">${icon('download',16)}</button></header>
    <div class="sx-columns dw-columns">${pagesColumn(doc,page,project.kind === 'funnel')}<div class="sx-canvas">${canvas(c,project,doc,page)}</div>
    <aside class="sx-panel dw-panel"><div class="sx-tabs" role="tablist" aria-label="Painel lateral">${[['design','Design'],['ai','IA'],['versions','Versões'],['publish','Publicação']].map(([id,label]) =>
      `<button role="tab" data-studio-panel="${id}" aria-selected="${panel === id}">${label}</button>`).join('')}</div>
      <div class="sx-panel-body">${panelContent(c,project,doc)}</div></aside></div></section>`;
}

export function studio(c) {
  if (c.tab === 'build') return `<div class="studio-shell">${builderView(c)}</div>`;
  const project = ['project', 'editor'].includes(c.tab) && c.s.studioProjects.find(item => item.id === c.studio.project);
  return `<div class="studio-shell"><section class="studio-main">${project ? editor(c,project) : home(c)}</section></div>`;
}

// ---- Editor behaviour -------------------------------------------------------------

const frame = () => document.getElementById('studio-frame');
const editStyle = '[data-go-hover]{outline:2px dashed #a00070!important;outline-offset:2px}[data-go-selected]{outline:3px solid #a00070!important;outline-offset:2px}[contenteditable]{cursor:text}';
const layerSelector = 'header, nav, main, section, article, aside, footer, div[id], [data-graao-embed], h1, h2, h3, h4, h5, h6, p, a, img, ul, ol, form, label, input:not([type=hidden]), button, select, textarea';
const textSelector = 'h1, h2, h3, h4, h5, h6, p, a, button, label, span, small, strong, em, li, blockquote, figcaption, div';
const canEditText = element => element?.matches(textSelector) && !element.closest('[data-graao-embed]') && !element.querySelector('input, textarea, select, button, form, img, svg, video, iframe, div, section, p, ul, ol');
const styles = [['color','Cor do texto','color'], ['background-color','Fundo','color'], ['font-size','Tamanho do texto (px)','number'],
  ['padding','Espaçamento interno (px)','number'], ['border-radius','Arredondamento (px)','number']];
function colorHex(value) {
  const rgb = value.match(/^rgba?\((\d+), (\d+), (\d+)/)?.slice(1);
  return rgb ? `#${rgb.map(channel => Number(channel).toString(16).padStart(2,'0')).join('')}` : '#000000';
}

// Cabeçalho, rodapé e o conteúdo principal são a moldura da página: não se duplicam nem mudam de lugar.
const movable = element => Boolean(element?.parentElement) && !element.matches('html, body, main, header, footer');
const neighbour = (element, step) => {
  let next = step < 0 ? element.previousElementSibling : element.nextElementSibling;
  while (next && next.matches('script, style, template')) next = step < 0 ? next.previousElementSibling : next.nextElementSibling;
  return next && !next.matches('header, footer') ? next : null;
};
function actionButtons() {
  const parent = selected.parentElement && !selected.parentElement.matches('html, body') ? '<button class="secondary" data-studio-parent>Selecionar o de fora</button>' : '';
  if (!movable(selected)) return parent;
  return `<button class="secondary" data-studio-move-el="-1" ${neighbour(selected,-1) ? '' : 'disabled'}>Mover para cima</button>
    <button class="secondary" data-studio-move-el="1" ${neighbour(selected,1) ? '' : 'disabled'}>Mover para baixo</button>
    <button class="secondary" data-studio-duplicate-el>Duplicar</button>${parent}`;
}
// O que a página publicada vai mostrar no lugar do marcador.
function embedFields(target) {
  const kind = target.dataset.graaoEmbed, value = kind === 'video' ? target.dataset.src || '' : target.dataset.id || '';
  if (kind === 'video') return `<label class="sx-field">Link do vídeo<input type="text" data-studio-embed="src" value="${h(value)}" maxlength="600" spellcheck="false" placeholder="https://youtu.be/…"></label><p class="sx-field-note dim" data-studio-attr-note role="status">YouTube, Vimeo, Loom, Panda Video ou um arquivo .mp4. Sem link, o vídeo não aparece na página publicada.</p>`;
  const rows = kind === 'form' ? (env.c.s.forms || []).map(row => [row.id, `${row.name}${row.active ? '' : ' (rascunho)'}`]) : (env.c.s.services || []).filter(row => row.active && row.kind !== 'rental').map(row => [row.id, row.name]);
  return `<label class="sx-field">${kind === 'form' ? 'Formulário' : 'Serviço da agenda'}<select data-studio-embed="id"><option value="">Escolha</option>${rows.map(([id, name]) => `<option value="${h(id)}"${id === value ? ' selected' : ''}>${h(name)}</option>`).join('')}</select></label>
    <p class="sx-field-note dim" data-studio-attr-note role="status">${kind === 'form' ? (rows.length ? 'As respostas e o destino são os do formulário, em Sites → Formulários.' : 'Crie um formulário em Sites → Formulários.') : rows.length ? 'Precisa da página de agendamento ligada em Calendários.' : 'Crie um serviço em Calendários → Serviços.'}</p>`;
}
function setEmbed(target, name, raw) {
  const value = name === 'src' ? cleanVideo(raw) : raw;
  if (name === 'src' && raw.trim() && !value) return 'Use um link https do YouTube, Vimeo, Loom, Panda Video ou um arquivo .mp4.';
  if (value) target.setAttribute(`data-${name}`, value); else target.removeAttribute(`data-${name}`);
  const row = name === 'id' && [...env.c.s.forms, ...(env.c.s.services || [])].find(item => item.id === value);
  const label = target.querySelector('span');
  const word = { video: 'Vídeo', form: 'Formulário', booking: 'Agenda' }[target.dataset.graaoEmbed];
  if (label) label.textContent = value ? `${word}: ${row ? row.name : value.replace(/^https:\/\/(www\.)?/, '')}` : `${word}: configure no painel Design`;
  setDirty(true);
  return '';
}
function attributeFields() {
  const marker = selected.closest('[data-graao-embed]');
  if (marker) return embedFields(marker);
  const link = selected.closest('a'), photo = selected.matches('img') ? selected : null;
  const field = (name, label, value, extra = '') => `<label class="sx-field">${label}<input type="text" data-studio-attr="${name}" value="${h(value)}" maxlength="2000" spellcheck="false" ${extra}></label>`;
  return `${link ? `${field('href','Link',link.getAttribute('href') || '','list="sx-links" placeholder="https:// ou page:contato"')}
      <datalist id="sx-links">${(S().doc?.pages || []).map(page => `<option value="page:${h(page.slug)}">${h(page.name)}</option>`).join('')}</datalist>` : ''}
    ${photo ? field('src','Endereço da foto',/^https:/i.test(photo.getAttribute('src') || '') ? photo.getAttribute('src') : '','placeholder="https://"') + field('alt','Descrição da foto',photo.getAttribute('alt') || '') : ''}
    ${link || photo ? '<p class="sx-field-note dim" data-studio-attr-note role="status"></p>' : ''}`;
}

function inspectorHtml() {
  if (!S().visual) return '<p class="dim">Ative a edição visual para ajustar os elementos.</p>';
  if (!selected?.isConnected) return '<p class="dim">Selecione um elemento na página ou em Camadas para editar suas propriedades.</p>';
  const computed = selected.ownerDocument.defaultView.getComputedStyle(selected);
  return `<section class="sx-inspector"><div class="sx-inspector-head"><h2>&lt;${h(selected.localName)}&gt;</h2><button class="icon-btn" data-studio-unselect aria-label="Limpar seleção">${icon('close',14)}</button></div>
    <div class="sx-actions">${canEditText(selected) ? '<button class="secondary" data-studio-edit-text>Editar texto</button>' : ''}${actionButtons()}</div>
    ${attributeFields()}
    ${styles.map(([name, label, type]) => {
      const value = selected.style.getPropertyValue(name) || computed.getPropertyValue(name);
      const match = value.match(/^(\d+(?:\.\d+)?)px$/);
      return `<label>${label}<input type="${type}" data-studio-style="${name}" value="${type === 'color' ? colorHex(computed.getPropertyValue(name)) : match?.[1] ?? ''}" ${type === 'number' ? 'min="0" max="1000" step="any"' : ''}></label>`;
    }).join('')}
    <details><summary>Redefinir estilos</summary><div>${styles.map(([name,label]) => `<button class="secondary" data-studio-reset-style="${name}">${label}</button>`).join('')}</div></details>
    <button class="secondary sx-remove" data-studio-remove-el>${icon('trash',14)} Excluir elemento</button></section>`;
}

let layers = [];
function showLayers() {
  const panel = document.querySelector('[data-studio-layers]');
  if (!panel || !S().visual) return;
  const body = frame()?.contentDocument?.body;
  if (!body) {
    const cur = currentPage();
    if (cur?.html && !panel.querySelector('.dw-layer-list')) {
      try {
        const parsed = new DOMParser().parseFromString(cur.html, 'text/html');
        const parsedElements = [...parsed.body.querySelectorAll(layerSelector)].filter(el => !el.closest('[hidden]'));
        if (parsedElements.length) {
          const parsedIndices = new Map(parsedElements.map((el, idx) => [el, idx]));
          panel.innerHTML = `<ul class="dw-layer-list">${parsedElements.map((el, idx) => {
            let depth = 0;
            for (let parent = el.parentElement; parent && parent !== parsed.body; parent = parent.parentElement) if (parsedIndices.has(parent)) depth++;
            const text = (el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('placeholder') ||
              [...el.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join(' ')).trim();
            return `<li><button class="dw-layer" data-studio-layer-preview="${idx}" style="--dw-depth:${Math.min(5,depth)}"><small>${h(el.localName)}</small>${text ? `<span>${h(text.slice(0,80))}</span>` : ''}</button></li>`;
          }).join('')}</ul>`;
        }
      } catch {}
    }
    return;
  }
  layers = [...body.querySelectorAll(layerSelector)].filter(element => !element.closest('[hidden]') && element.getClientRects().length);
  const indices = new Map(layers.map((element, index) => [element, index]));
  panel.innerHTML = layers.length ? `<ul class="dw-layer-list">${layers.map((element, index) => {
    let depth = 0;
    for (let parent = element.parentElement; parent && parent !== body; parent = parent.parentElement) if (indices.has(parent)) depth++;
    const text = (element.dataset.graaoEmbed && element.textContent || element.getAttribute('aria-label') || element.getAttribute('alt') || element.getAttribute('placeholder') ||
      [...element.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent).join(' ')).trim();
    return `<li><button class="dw-layer" data-studio-layer="${index}" aria-pressed="${element === selected}" style="--dw-depth:${Math.min(5,depth)}"><small>${h(element.localName)}</small>${text ? `<span>${h(text.slice(0,80))}</span>` : ''}</button></li>`;
  }).join('')}</ul>` : '<p class="dim">Esta página está vazia.</p>';
}
function clean(node) {
  node.querySelectorAll('#go-edit-style').forEach(item => item.remove());
  for (const item of [node, ...node.querySelectorAll('[data-go-hover],[data-go-selected],[data-go-ready],[contenteditable]')]) {
    for (const name of ['data-go-hover','data-go-selected','data-go-ready','contenteditable']) item.removeAttribute?.(name);
  }
  return node;
}
const serialize = () => `<!doctype html>\n${clean(frame().contentDocument.documentElement.cloneNode(true)).outerHTML}`;
function selectionHtml() {
  if (!selected?.isConnected) return '';
  const text = selected.textContent.replace(/\s+/g,' ').trim().slice(0,70);
  return `<div class="sx-chip"><span><b>&lt;${h(selected.tagName.toLowerCase())}&gt;</b> ${h(text || 'elemento')}</span>
    <span class="inline-gap"><button class="secondary" data-studio-edit-text>Editar texto</button><button class="secondary" data-studio-remove-el>Excluir</button><button class="icon-btn" data-studio-unselect aria-label="Limpar seleção">${icon('close',14)}</button></span></div>`;
}
function showSelection() {
  const box = document.getElementById('sx-selection');
  if (box) box.innerHTML = selectionHtml();
  if (S().panel === 'design') document.querySelector('.sx-panel-body').innerHTML = inspectorHtml();
  document.querySelectorAll('[data-studio-layer]').forEach((button, index) => button.setAttribute('aria-pressed', String(layers[index] === selected)));
}
function select(element) {
  if (selected !== element) selected?.removeAttribute('contenteditable');
  selected?.removeAttribute('data-go-selected');
  selected = element?.ownerDocument.body.contains(element) && element !== element.ownerDocument.body ? element : null;
  selected?.setAttribute('data-go-selected','');
  showSelection();
}
function setDirty(value) {
  dirty = value;
  for (const button of document.querySelectorAll('[data-studio-save-visual],[data-studio-discard]')) button.disabled = !value || saving;
  const status = document.querySelector('[data-studio-dirty]');
  if (status) status.hidden = !value;
}
const preparedDocs = new WeakSet();
function prepareFrame() {
  const doc = frame()?.contentDocument;
  if (!doc?.body || doc.URL === 'about:blank' || preparedDocs.has(doc)) return;
  preparedDocs.add(doc);
  selected = null; setDirty(false); showSelection();
  doc.addEventListener('submit', event => event.preventDefault(), true);
  doc.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (link || event.target.closest('button') || (S().visual && !event.target.isContentEditable)) event.preventDefault();
    if (!S().visual) {
      const href = link?.getAttribute('href') || '';
      const slug = href.match(/^page:([a-z0-9-]+)(?:#[\w-]*)?$/)?.[1];
      const target = slug && S().doc.pages.find(item => item.slug === slug);
      if (target) { S().page = target.id; env.render(); }
      if (href.startsWith('#')) doc.getElementById(href.slice(1))?.scrollIntoView({ block: 'start', behavior: 'instant' });
      return;
    }
    if (event.target.isContentEditable) return;
    select(event.target.closest('a, button') || event.target.closest(layerSelector) || event.target);
  }, true);
  if (!S().visual) return;
  const style = doc.createElement('style'); style.id = 'go-edit-style'; style.textContent = editStyle; doc.head.append(style);
  doc.addEventListener('mouseover', event => { if (event.target !== doc.body) event.target.setAttribute('data-go-hover',''); });
  doc.addEventListener('mouseout', event => event.target.removeAttribute?.('data-go-hover'));
  doc.addEventListener('dblclick', event => { event.preventDefault(); editText(selected); });
  doc.addEventListener('input', () => setDirty(true));
  doc.addEventListener('focusout', event => {
    if (!event.target.hasAttribute('contenteditable')) return;
    event.target.removeAttribute('contenteditable');
    showLayers();
  });
  doc.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    select(null);
    frame()?.closest('.dw-scroll')?.focus({ preventScroll: true });
  });
  showLayers();
}
function editText(element) {
  if (!canEditText(element)) return;
  select(element);
  element.setAttribute('contenteditable','plaintext-only');
  element.focus();
}

// O conteúdo de uma seção costuma ficar numa caixa única que centraliza e limita a largura.
const innerBox = section => section.children.length === 1 && section.firstElementChild.matches('div') ? section.firstElementChild : section.querySelector(':scope > .wrap');
// O botão novo segue a página: usa a classe do botão dela ou, sem classe, a cor do primeiro botão visível.
function pageLook(doc) {
  const buttonClass = doc.querySelector('main a.btn, main .btn') ? 'btn' : '';
  const view = doc.defaultView;
  for (const item of doc.querySelectorAll('main .btn, main button, main .cta, header .cta')) {
    const style = view.getComputedStyle(item);
    if (item.getClientRects().length && !/^(transparent|rgba\(.*, 0\))$/.test(style.backgroundColor)) return { buttonClass, accent: style.backgroundColor, onAccent: style.color };
  }
  return { buttonClass };
}
function afterChange(element) {
  select(element);
  showLayers();
  element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  setDirty(true);
}
function duplicateElement() {
  if (!movable(selected)) return;
  const copy = clean(selected.cloneNode(true));
  for (const item of [copy, ...copy.querySelectorAll('[id]')]) item.removeAttribute('id');
  selected.after(copy);
  afterChange(copy);
}
function moveElement(step) {
  const other = movable(selected) && neighbour(selected, step);
  if (!other) return;
  if (step < 0) other.before(selected); else other.after(selected);
  afterChange(selected);
}
function setAttribute(name, value) {
  const target = name === 'href' ? selected?.closest('a') : selected;
  if (!target?.isConnected) return '';
  if (name === 'alt') { target.setAttribute('alt', value.trim()); setDirty(true); return ''; }
  const safe = name === 'href' ? cleanLink(value) : cleanImage(value);
  if (!safe) return name === 'href' ? 'Use um endereço https://, page:pagina, #secao, tel: ou mailto:.' : 'Use um endereço de foto que comece com https://.';
  target.setAttribute(name, safe);
  if (name === 'src') { target.removeAttribute('srcset'); target.removeAttribute('sizes'); }
  setDirty(true);
  return '';
}

function insertElement(tag) {
  const doc = frame()?.contentDocument;
  if (!doc?.body || !preparedDocs.has(doc)) return;
  const container = selected?.closest('main') || doc.querySelector('main') || doc.body;
  const holder = doc.createElement('div');
  holder.innerHTML = blockHtml(tag, pageLook(doc));
  const element = holder.firstElementChild;
  if (!element) return;
  const isSection = sectionBlocks.includes(tag);
  const place = selected?.closest('form') || selected; // Depois do formulário, nunca no meio dos campos.
  const anchor = !isSection && place?.isConnected && !place.closest('header,nav,footer') ? place : null;
  const textAnchor = anchor?.closest('h1,h2,h3,h4,h5,h6,p');
  if (textAnchor) textAnchor.after(element);
  else if (anchor?.matches('section, article, aside')) (innerBox(anchor) || anchor).append(element);
  else if (anchor && !anchor.matches('main, body')) (anchor.closest('a, button, li, label, summary') || anchor).after(element);
  else {
    let block = selected;
    while (block && block.parentElement !== container) block = block.parentElement;
    if (block && !block.matches('footer')) block.after(element);
    else container.insertBefore(element, container.querySelector(':scope > footer'));
  }
  afterChange(element);
}
export function afterStudioRender() {
  const iframe = frame();
  if (!iframe) { afterBuilderRender(); return; }
  mountDesignStage(iframe.closest('.dw-stage'), S().viewport ??= {});
  showLayers();
  iframe.addEventListener('load', prepareFrame);
  if (iframe.contentDocument?.readyState === 'complete' && iframe.contentDocument.URL !== 'about:blank') prepareFrame();
}

function blocked() {
  if (!dirty) return false;
  env.flash('Salve ou descarte as alterações visuais primeiro.', true);
  return true;
}
function modal(title, body, form, submit) {
  const overlay = document.getElementById('overlay');
  overlay.innerHTML = `<dialog id="dialog" aria-labelledby="modal-title"><header><div><h2 id="modal-title">${h(title)}</h2></div><button class="icon-btn" aria-label="Fechar" data-close-dialog>${icon('close',17)}</button></header>
    <form data-studio-form="${form}"><div class="modal-body">${body}<p class="form-status" role="alert"></p></div><footer><button type="button" class="secondary" data-close-dialog>Cancelar</button><button class="primary">${h(submit)}</button></footer></form></dialog>`;
  const dialog = document.getElementById('dialog'); dialog.showModal();
  dialog.addEventListener('cancel', event => { event.preventDefault(); overlay.innerHTML = ''; });
  let downTarget = null; dialog.addEventListener('mousedown', ev => { downTarget = ev.target; });
  dialog.addEventListener('click', ev => {
    if (ev.target === dialog && downTarget === dialog) {
      const r = dialog.getBoundingClientRect();
      if (ev.clientY < r.top || ev.clientY > r.bottom || ev.clientX < r.left || ev.clientX > r.right) closeModal();
    }
  });
  dialog.querySelector('input,textarea')?.focus();
}
const closeModal = () => { const overlay = document.getElementById('overlay'); overlay.querySelector('dialog')?.close(); overlay.innerHTML = ''; };

export function installStudio(environment) {
  env = environment;
  const { c, api, url, flash, render } = env;
  const currentPage = () => S().doc.pages.find(item => item.id === S().page);
  async function call(op, body) {
    const { workspace } = c;
    const { project } = S();
    const result = await api(url(`/api/studio/${op}`), { id: project, viewPage: S().page || '', ...body });
    if (c.workspace === workspace) {
      c.s = result.state; c.m = result.metrics;
      if (S().project === project) Object.assign(S(), { doc: result.doc, docFor: project });
    }
    return result.result;
  }
  env.loadDoc = async projectId => {
    if (S().loading === projectId) return;
    S().loading = projectId;
    try {
      const { doc } = await api(`${url('/api/studio/doc')}&id=${encodeURIComponent(projectId)}${S().page ? `&page=${encodeURIComponent(S().page)}` : ''}`);
      if (S().project !== projectId) return;
      Object.assign(S(), { doc, docFor: projectId, page: doc.pages.some(item => item.id === S().page) ? S().page : doc.pages[0].id, visual: true, code: false, panel: 'design', viewport: {} });
      render();
    } catch (error) { if (S().project === projectId) { S().loadError = { id: projectId, message: error.message }; render(); } }
    finally { S().loading = ''; }
  };

  document.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || !button.closest('.studio-editor, #dialog')) return;
    const d = button.dataset;
    try {
      if ('studioRetry' in d) { S().loadError = null; render(); return; }
      if (d.studioDevice) {
        S().device = d.studioDevice;
        document.querySelectorAll('[data-studio-device]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        document.querySelector('[data-studio-width]').textContent = `${deviceWidth()} px`;
        resizeDesignStage(button.closest('.dw-stage'), deviceWidth());
        return;
      }
      if ('studioVisual' in d || 'studioPreview' in d) {
        const visual = 'studioVisual' in d;
        if (S().visual === visual || blocked()) return;
        S().visual = visual; render(); return;
      }
      if ('studioCode' in d) { if (blocked()) return; S().code = !S().code; S().visual = !S().code; render(); return; }
      if (d.studioPanel) {
        S().panel = d.studioPanel;
        document.querySelectorAll('[data-studio-panel]').forEach(b => b.setAttribute('aria-selected', String(b === button)));
        document.querySelector('.sx-panel-body').innerHTML = panelContent(c, c.s.studioProjects.find(p => p.id === S().project), S().doc);
        return;
      }
      if ('studioLayer' in d) { const element = layers[Number(d.studioLayer)]; select(element); element?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); return; }
      if (d.studioInsert) { insertElement(d.studioInsert); const menu = button.closest('details'); menu.open = false; menu.querySelector('summary').focus(); return; }
      if (d.studioPage) {
        if (d.studioPage === S().page || blocked()) return;
        const project = S().project, target = d.studioPage;
        // A large site comes with the HTML of one page at a time.
        if (typeof S().doc.pages.find(item => item.id === target)?.html !== 'string') {
          const { doc } = await api(`${url('/api/studio/doc')}&id=${encodeURIComponent(project)}&page=${encodeURIComponent(target)}`);
          if (S().project !== project) return;
          S().doc = doc;
        }
        S().page = target; S().viewport = {}; render(); return;
      }
      if (d.studioUndo) { if (blocked()) return; button.disabled = true; await call('chat-undo', { entryId: d.studioUndo }); render(); flash('Alteração desfeita. As mudanças feitas depois dela também foram desfeitas.'); return; }
      if ('studioAddPage' in d) { if (blocked()) return;
        modal('Adicionar página', `<label>Nome da página<input name="name" required maxlength="60" placeholder="Sobre nós"></label><label>O que a página deve conter?<textarea name="description" maxlength="1500"></textarea></label>${c.features?.studioAI ? '<label class="check"><input type="checkbox" name="ai" checked> Gerar com IA no mesmo estilo da página inicial</label>' : ''}`, 'add-page', 'Adicionar página'); return; }
      if (d.studioRenamePage) { if (blocked()) return; const page = S().doc.pages.find(item => item.id === d.studioRenamePage);
        modal('Renomear página', `<input type="hidden" name="pageId" value="${page.id}"><label>Nome da página<input name="name" required maxlength="60" value="${h(page.name)}"></label>`, 'rename-page', 'Renomear'); return; }
      if (d.studioDeletePage) { if (blocked()) return; const page = S().doc.pages.find(item => item.id === d.studioDeletePage);
        modal('Excluir página?', `<input type="hidden" name="pageId" value="${page.id}"><p>“${h(page.name)}” será removida. Você pode restaurá-la em Versões.</p>`, 'delete-page', 'Excluir'); return; }
      if (d.studioRestore) { if (blocked()) return; await call('restore', { versionId: d.studioRestore }); render(); flash('Versão restaurada.'); return; }
      if (d.studioPublish) { if (blocked()) return; button.disabled = true; await call('publish', { publish: d.studioPublish === 'on' }); render(); flash(d.studioPublish === 'on' ? 'Site publicado.' : 'Site despublicado.'); return; }
      if ('studioDownload' in d) {
        const page = currentPage();
        const html = page.html.replace(/(href\s*=\s*["'])page:([a-z0-9-]+)(["'])/gi, (_, a, slug, b) => `${a}${slug}.html${b}`);
        const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })); link.download = `${page.slug}.html`; link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000); return;
      }
      if ('studioEditText' in d) { editText(selected); return; }
      if (d.studioResetStyle && selected?.style.getPropertyValue(d.studioResetStyle)) { selected.style.removeProperty(d.studioResetStyle); setDirty(true); showSelection(); return; }
      if (d.studioMoveEl) { moveElement(Number(d.studioMoveEl)); return; }
      if ('studioDuplicateEl' in d) { duplicateElement(); return; }
      if ('studioParent' in d && selected?.parentElement) { select(selected.parentElement); return; }
      if ('studioRemoveEl' in d && selected) { selected.remove(); select(null); showLayers(); setDirty(true); return; }
      if ('studioUnselect' in d) { select(null); return; }
      if ('studioDiscard' in d) { setDirty(false); render(); return; }
      if ('studioSaveVisual' in d) {
        if (saving) return;
        const html = serialize();
        saving = true; setDirty(true);
        try { await call('save', { pageId: S().page, html, label: 'Edição visual' }); }
        finally { saving = false; setDirty(dirty); }
        if (button.isConnected && serialize() === html) { setDirty(false); render(); }
        else if (button.isConnected) button.disabled = false;
        flash('Alterações salvas.'); return;
      }
    } catch (error) { flash(error.message, true); if (dirty) setDirty(true); else render(); }
  });

  document.addEventListener('change', event => {
    const input = event.target;
    const marker = input.dataset?.studioEmbed && selected?.isConnected && selected.closest('[data-graao-embed]');
    if (marker) {
      const problem = setEmbed(marker, input.dataset.studioEmbed, input.value);
      const note = document.querySelector('[data-studio-attr-note]');
      if (note && problem) { note.textContent = problem; note.classList.add('error'); } else { note?.classList.remove('error'); showLayers(); }
      return;
    }
    if (!input.dataset?.studioAttr || !selected?.isConnected) return;
    const problem = setAttribute(input.dataset.studioAttr, input.value);
    const note = document.querySelector('[data-studio-attr-note]');
    if (note) { note.textContent = problem; note.classList.toggle('error', Boolean(problem)); }
    if (!problem) showLayers();
  });
  document.addEventListener('input', event => {
    const input = event.target;
    const name = input.dataset?.studioStyle;
    if (!name || !selected?.isConnected || !input.validity.valid) return;
    if (!input.value) selected.style.removeProperty(name);
    else selected.style.setProperty(name, input.type === 'number' ? `${input.value}px` : input.value);
    setDirty(true);
  });

  document.addEventListener('submit', async event => {
    const form = event.target;
    const name = form.dataset?.studioForm;
    if (!name) return;
    event.preventDefault();
    if (form.dataset.pending) return;
    form.dataset.pending = '1';
    const status = form.querySelector('.form-status'), buttons = [...form.querySelectorAll('button')], data = Object.fromEntries(new FormData(form));
    buttons.forEach(b => { b.disabled = true; });
    if (status) status.textContent = '';
    try {
      if (name === 'revise') {
        const instruction = data.instruction.trim();
        const selection = selected?.isConnected ? clean(selected.cloneNode(true)).outerHTML : '';
        if (dirty) { await call('save', { pageId: S().page, html: serialize(), label: 'Edição visual' }); setDirty(false); }
        if (status) { status.classList.add('pending'); status.textContent = 'Aplicando a alteração…'; }
        const result = await call('revise', { pageId: S().page, instruction, selection });
        S().log.push({ project: S().project, ask: instruction, reply: result?.change || 'Concluído.' });
        setDirty(false); render(); flash('Página atualizada.');
      } else if (name === 'code') {
        await call('save', { pageId: S().page, html: data.html, label: 'Edição de código' }); render(); flash('Código aplicado.');
      } else if (name === 'add-page') {
        if (status && data.ai) { status.classList.add('pending'); status.textContent = 'Gerando a página…'; }
        const pageId = await call('page', { action: 'add', name: data.name, description: data.description, ai: Boolean(data.ai) });
        S().page = pageId; closeModal(); render(); flash('Página adicionada.');
      } else if (name === 'rename-page') {
        await call('page', { action: 'rename', pageId: data.pageId, name: data.name }); closeModal(); render(); flash('Página renomeada.');
      } else if (name === 'delete-page') {
        await call('page', { action: 'delete', pageId: data.pageId }); S().page = ''; closeModal(); render(); flash('Página excluída.');
      }
    } catch (error) {
      if (status) { status.classList.remove('pending'); status.textContent = error.message; } else flash(error.message, true);
    } finally {
      delete form.dataset.pending;
      if (form.isConnected) buttons.forEach(b => { b.disabled = false; });
    }
  });
  window.addEventListener('hashchange', async event => {
    if (!dirty || !frame()) return;
    const to = location.hash;
    event.stopImmediatePropagation();
    history.replaceState(null, '', event.oldURL);
    if (!await ask('Descartar as alterações não salvas desta página?', { ok: 'Descartar', cancel: 'Continuar editando' })) return;
    setDirty(false); location.hash = to;
  }, true);
  window.addEventListener('beforeunload', event => { if (dirty) event.preventDefault(); });
}
