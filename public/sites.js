// Sites → Funis e Sites. Each funnel or website is an AI Studio project (multi-page HTML site),
// so pages are built, edited and published with the same engine, including AI generation.
import { icon } from './icons.js';
import { h, pageShell } from './screens.js';
import { siteTemplateCategories, siteTemplates } from './site-template-data.js';
import { startBuild } from './studio-builder.js';
import { studio } from './studio.js';
import { siteTabs } from './forms.js';

const view = { doc: null, docFor: '', loading: '', section: 'steps', page: '', query: '', busy: false };
let env = null;
const kindOf = project => project.kind === 'funnel' ? 'funnel' : 'website';
const words = kind => kind === 'funnel'
  ? { one: 'funil', One: 'Funil', many: 'funis', step: 'etapa', Step: 'Etapa', steps: 'etapas', Steps: 'Etapas', list: 'funnels', New: 'Novo funil' }
  : { one: 'site', One: 'Site', many: 'sites', step: 'página', Step: 'Página', steps: 'páginas', Steps: 'Páginas', list: 'websites', New: 'Novo site' };
const when = iso => iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
const normalized = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const siteBase = (c, project) => `/s/${c.workspace}/${project.id}`;
const pageUrl = (c, project, page) => `${siteBase(c, project)}${page.slug === 'index' ? '' : `/${page.slug}`}`;

function status(project) {
  if (!project.publishedAt) return ['Rascunho', ''];
  return project.rev && project.publishedRev && project.rev !== project.publishedRev ? ['Alterações não publicadas', 'blue'] : ['Publicado', 'green'];
}
const badge = ([label, tone]) => `<span class="badge ${tone}">${h(label)}</span>`;

/* ───────── Lista ───────── */

function listRows(c, kind) {
  const query = normalized(view.query.trim());
  const projects = c.s.studioProjects.filter(project => kindOf(project) === kind && normalized(project.name).includes(query))
    .sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
  if (!projects.length) return '';
  const w = words(kind);
  return projects.map(project => {
    const pages = project.pages?.length || 1;
    return `<tr><td><a class="site-name" href="#sites/funnel/${project.id}">${icon(kind === 'funnel' ? 'flow' : 'site', 16)}<span>${h(project.name)}</span></a></td>
      <td>${when(project.updated || project.created)}</td><td>${pages} ${pages === 1 ? w.step : w.steps}</td><td>${badge(status(project))}</td>
      <td class="site-row-actions">${project.publishedAt ? `<a class="icon-btn" href="${siteBase(c, project)}" target="_blank" rel="noopener" title="Abrir site publicado" aria-label="Abrir ${h(project.name)} publicado">${icon('external', 15)}</a>` : ''}
        <a class="secondary site-open" href="#sites/funnel/${project.id}">Abrir</a></td></tr>`;
  }).join('');
}

function legacyPages(c, kind) {
  const label = kind === 'funnel' ? 'Funnel' : 'Website';
  const pages = c.s.pages.filter(page => page.kind === label);
  if (!pages.length) return '';
  return `<section class="site-legacy"><h2>Páginas simples</h2><p class="dim">Páginas de uma seção criadas antes do construtor de ${kind === 'funnel' ? 'funis' : 'sites'}. Continuam funcionando.</p>
    <div class="site-legacy-list">${pages.map(page => `<div class="surface site-legacy-item"><b>${h(page.name)}</b>${badge(page.active ? ['Publicado', 'green'] : ['Rascunho', ''])}
      <span class="spacer"></span>${page.active ? `<a class="secondary" href="/p/${c.workspace}/${page.id}" target="_blank" rel="noopener">${icon('external', 14)} Ver</a>` : ''}
      <button class="secondary" data-edit="pages" data-id="${page.id}">${icon('edit', 15)} Editar</button></div>`).join('')}</div></section>`;
}

function list(c) {
  const kind = c.tab === 'websites' ? 'website' : 'funnel';
  const w = words(kind);
  const rows = listRows(c, kind);
  const any = c.s.studioProjects.some(project => kindOf(project) === kind);
  const content = `${any ? `<div class="toolbar"><label class="search">${icon('search', 15)}<input type="search" data-site-search value="${h(view.query)}" placeholder="Buscar ${w.many}" aria-label="Buscar ${w.many}"></label></div>` : ''}
    ${rows ? `<div class="surface table-shell"><table class="site-table"><thead><tr><th scope="col">Nome</th><th scope="col">Última atualização</th><th scope="col">${w.Steps}</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : any ? `<div class="surface empty"><strong>Nenhum ${w.one} encontrado</strong><p>Tente outro nome.</p></div>`
      : `<div class="surface empty site-empty">${icon(kind === 'funnel' ? 'flow' : 'site', 26)}<strong>Nenhum ${w.one} ainda</strong>
        <p>${kind === 'funnel' ? 'Monte uma sequência de páginas: captura, oferta e obrigado. O formulário de cada etapa leva o visitante para a próxima.' : 'Monte um site com várias páginas, menu entre elas e formulário de contato.'}</p>
        <div class="inline-gap"><button class="primary" data-site-new="ai" data-kind="${kind}">${icon('spark', 16)} Construir com IA</button><button class="secondary" data-site-new="blank" data-kind="${kind}">Começar em branco</button></div></div>`}
    ${legacyPages(c, kind)}`;
  return pageShell({
    title: 'Sites',
    desc: 'Crie funis, sites e formulários com IA, publique e acompanhe visitas e conversões.',
    cta: `<button class="secondary" data-site-new="ai" data-kind="${kind}">${icon('spark', 16)} Construir com IA</button><button class="primary" data-site-new="blank" data-kind="${kind}">${icon('plus', 16)} ${w.New}</button>`,
    className: 'sites-page',
    tabs: {
      key: 'sites',
      label: 'Seções de sites',
      current: c.tab || 'funnels',
      items: siteTabs
    },
    content
  });
}

/* ───────── Detalhe ───────── */

function stepPanel(c, project, doc, page, w) {
  const index = doc.pages.indexOf(page);
  const first = page.slug === 'index';
  const ai = c.features?.studioAI;
  return `<section class="surface site-step" aria-label="${w.Step} selecionada">
    <header class="site-step-head"><div><span class="site-step-number">${w.Step} ${index + 1}</span><h2>${h(page.name)}</h2></div>
      <div class="inline-gap">${project.publishedAt && project.pages?.some(item => item.id === page.id) ? `<a class="secondary" href="${pageUrl(c, project, page)}" target="_blank" rel="noopener">${icon('external', 14)} Ver publicada</a>` : ''}
        <button class="primary" data-site-edit-page="${page.id}">${icon('edit', 15)} Editar página</button></div></header>
    <div class="site-step-grid">
      <div class="site-preview"><iframe title="Prévia de ${h(page.name)}" src="/studio-preview/${c.workspace}/${project.id}/${page.id}?v=${doc.rev}" tabindex="-1"></iframe></div>
      <div class="site-step-fields">
        <form data-site-form="rename"><label>Nome<input name="name" required maxlength="60" value="${h(page.name)}"></label><button class="secondary">Renomear</button></form>
        <form data-site-form="slug"><label>Caminho
          <span class="site-path"><span>${h(siteBase(c, project))}/</span><input name="slug" maxlength="48" value="${first ? '' : h(page.slug)}" ${first ? 'disabled placeholder="(endereço principal)"' : 'required'}></span></label>
          ${first ? `<small class="dim">A primeira ${w.step} abre no endereço principal do ${w.one}.</small>` : '<button class="secondary">Salvar caminho</button>'}</form>
        ${kindOf(project) === 'funnel' ? `<p class="site-hint">${icon('arrow', 14)} ${index + 1 < doc.pages.length ? `Quem enviar o formulário desta etapa vai para <b>${h(doc.pages[index + 1].name)}</b>.` : 'Esta é a última etapa. Quem enviar o formulário aqui vê a mensagem de confirmação.'}</p>` : ''}
        <form data-site-form="revise" class="site-ai-box"><label>Editar com IA<textarea name="instruction" rows="3" maxlength="2000" ${ai ? '' : 'disabled'} placeholder="Ex. Troque o título por uma chamada mais direta e adicione uma seção de depoimentos com marcadores para preencher"></textarea></label>
          ${ai ? `<button class="secondary">${icon('spark', 15)} Aplicar com IA</button>` : '<small class="dim">Conecte a OpenAI em Visão da agência → Configurações → OpenAI para editar com IA.</small>'}</form>
        <div class="site-step-actions"><button class="secondary" data-site-duplicate="${page.id}">Duplicar</button>${first ? '' : `<button class="secondary danger-text" data-site-delete-page="${page.id}">${icon('trash', 15)} Excluir</button>`}</div>
      </div></div></section>`;
}

function stepsSection(c, project, doc, w) {
  const page = doc.pages.find(item => item.id === view.page) || doc.pages[0];
  view.page = page.id;
  return `<div class="site-steps">
    <aside class="surface site-step-list" aria-label="${w.Steps}"><h2>${w.Steps} do ${w.one}</h2><ol>${doc.pages.map((item, index) => `<li>
      <button class="site-step-item" data-site-page="${item.id}" aria-current="${item.id === page.id}"><span class="site-step-index">${index + 1}</span><span><b>${h(item.name)}</b><small>/${item.slug === 'index' ? '' : h(item.slug)}</small></span></button>
      ${item.slug === 'index' ? '' : `<span class="site-move"><button class="icon-btn" data-site-move="up" data-page="${item.id}" aria-label="Subir ${h(item.name)}" ${index > 1 ? '' : 'disabled'}>${icon('chevron', 14)}</button>
        <button class="icon-btn" data-site-move="down" data-page="${item.id}" aria-label="Descer ${h(item.name)}" ${index < doc.pages.length - 1 ? '' : 'disabled'}>${icon('chevron', 14)}</button></span>`}</li>`).join('')}</ol>
      <button class="primary site-add" data-site-add-step ${doc.pages.length >= 50 ? 'disabled title="Limite de 50 páginas"' : ''}>${icon('plus', 15)} Adicionar ${w.step}</button></aside>
    ${stepPanel(c, project, doc, page, w)}</div>`;
}

function statsSection(c, project, doc, w) {
  const stats = doc.stats || {};
  const rows = doc.pages.map(page => ({ page, views: stats[page.id]?.views || 0, optins: stats[page.id]?.optins || 0 }));
  const total = rows.reduce((sum, row) => ({ views: sum.views + row.views, optins: sum.optins + row.optins }), { views: 0, optins: 0 });
  const rate = row => row.views ? `${(row.optins / row.views * 100).toFixed(1).replace('.', ',')}%` : '—';
  return `<section class="surface site-section"><header class="site-section-head"><div><h2>Estatísticas</h2>
      <p class="dim">${doc.statsSince ? `Desde ${when(doc.statsSince)}.` : 'Ainda sem visitas.'} Contamos as visitas e os envios de formulário nas ${w.steps} publicadas.</p></div>
      <button class="secondary" data-site-reset-stats ${doc.statsSince ? '' : 'disabled'}>Zerar estatísticas</button></header>
    <div class="table-shell"><table><thead><tr><th scope="col">${w.Step}</th><th scope="col">Visitas</th><th scope="col">Envios</th><th scope="col">Taxa de conversão</th></tr></thead>
      <tbody>${rows.map(row => `<tr><td>${h(row.page.name)} <small class="dim">/${row.page.slug === 'index' ? '' : h(row.page.slug)}</small></td><td>${row.views}</td><td>${row.optins}</td><td>${rate(row)}</td></tr>`).join('')}
      <tr class="site-total"><th scope="row">Total</th><td>${total.views}</td><td>${total.optins}</td><td>${rate(total)}</td></tr></tbody></table></div>
    ${project.publishedAt ? '' : `<p class="site-hint">${icon('alert', 14)} Publique o ${w.one} para começar a contar visitas.</p>`}</section>`;
}

function seoSection(c, project, doc, w) {
  const ai = c.features?.studioAI;
  return `<section class="surface site-section"><header class="site-section-head"><div><h2>SEO</h2>
      <p class="dim">Título e descrição que aparecem no Google e ao compartilhar o link. Publique de novo para aplicar ao ${w.one} publicado.</p></div></header>
    <div class="site-seo-list">${doc.pages.map(page => `<form class="site-seo" data-site-form="seo" data-page="${page.id}">
      <h3>${h(page.name)} <small class="dim">/${page.slug === 'index' ? '' : h(page.slug)}</small></h3>
      <label>Título <small class="dim" data-count-for="title">${(page.seo?.title || '').length}/70</small><input name="title" maxlength="70" value="${h(page.seo?.title || '')}" placeholder="${h(page.name)}"></label>
      <label>Descrição <small class="dim" data-count-for="description">${(page.seo?.description || '').length}/170</small><textarea name="description" rows="2" maxlength="170">${h(page.seo?.description || '')}</textarea></label>
      <div class="inline-gap"><button class="secondary">Salvar</button>${ai ? `<button type="button" class="secondary" data-site-seo-ai="${page.id}">${icon('spark', 15)} Gerar com IA</button>` : ''}</div></form>`).join('')}</div></section>`;
}

function settingsSection(c, project, w) {
  const form = c.s.forms.find(item => item.id === project.formId);
  return `<section class="surface site-section"><header class="site-section-head"><div><h2>Configurações</h2></div></header>
    <form class="site-settings" data-site-form="settings">
      <label>Nome<input name="name" required maxlength="80" value="${h(project.name)}"></label>
      <label>Tipo<select name="kind"><option value="funnel" ${kindOf(project) === 'funnel' ? 'selected' : ''}>Funil: o formulário leva para a próxima etapa</option>
        <option value="website" ${kindOf(project) === 'website' ? 'selected' : ''}>Site: o formulário mostra a confirmação na mesma página</option></select></label>
      <button class="primary">Salvar</button></form>
    <dl class="site-facts">
      <div><dt>Endereço</dt><dd>${project.publishedAt ? `<a class="text-link" href="${siteBase(c, project)}" target="_blank" rel="noopener">${h(location.origin + siteBase(c, project))}</a>` : 'Publique para gerar o endereço.'}</dd></div>
      <div><dt>Formulário que recebe os leads</dt><dd>${form ? `<a class="text-link" href="#sites/forms">${h(form.name)}</a>` : 'Criado automaticamente na primeira publicação.'}</dd></div>
      <div><dt>Domínio próprio</dt><dd>Indisponível nesta versão: o ${w.one} é servido pelo endereço do graao.</dd></div>
    </dl>
    <div class="site-danger"><div><b>Excluir ${w.one}</b><p class="dim">Tira o ${w.one} do ar e apaga o projeto. Os contatos e envios já recebidos continuam no CRM.</p></div>
      <button class="secondary danger-text" data-site-delete>${icon('trash', 15)} Excluir ${w.one}</button></div></section>`;
}

function detail(c) {
  const project = c.s.studioProjects.find(item => item.id === c.studio.project);
  if (!project) return '<div class="page"><a class="text-link" href="#sites/funnels">← Sites</a><div class="surface empty"><strong>Funil ou site não encontrado</strong></div></div>';
  const kind = kindOf(project);
  const w = words(kind);
  const doc = view.docFor === project.id ? view.doc : null;
  const sections = [['steps', w.Steps], ['stats', 'Estatísticas'], ['seo', 'SEO'], ['settings', 'Configurações']];
  const [label] = status(project);
  const publishLabel = !project.publishedAt ? 'Publicar' : label === 'Alterações não publicadas' ? 'Publicar alterações' : 'Despublicar';
  const body = !doc ? '<div class="surface empty"><strong>Carregando…</strong></div>'
    : view.section === 'stats' ? statsSection(c, project, doc, w) : view.section === 'seo' ? seoSection(c, project, doc, w)
    : view.section === 'settings' ? settingsSection(c, project, w) : stepsSection(c, project, doc, w);
  const cta = `${project.publishedAt ? `<a class="secondary" href="${siteBase(c, project)}" target="_blank" rel="noopener">${icon('external', 15)} Ver publicado</a>` : ''}
    <a class="secondary" href="#sites/editor/${project.id}" data-site-edit-page="${doc ? view.page || doc.pages[0].id : ''}">${icon('edit', 15)} Abrir editor</a>
    ${publishLabel === 'Despublicar' ? '<button class="secondary" data-site-publish="off">Despublicar</button>' : `<button class="primary" data-site-publish="on">${publishLabel}</button>`}
    ${publishLabel === 'Publicar alterações' ? '<button class="secondary" data-site-publish="off">Despublicar</button>' : ''}`;
  return pageShell({
    title: h(project.name),
    back: `<a class="page-back" href="#sites/${w.list}">${icon('left', 15)} ${kind === 'funnel' ? 'Funis' : 'Sites'}</a>`,
    desc: `<span class="inline-gap">${badge([w.One, 'pink'])}${badge(status(project))}<span class="dim">${project.pages?.length || 1} ${(project.pages?.length || 1) === 1 ? w.step : w.steps}</span></span>`,
    cta,
    className: 'site-detail',
    attrs: `data-site-detail="${project.id}"`,
    tabs: {
      key: `site-detail:${project.id}`,
      label: 'Seções',
      current: view.section,
      items: sections.map(([key, text]) => ({ value: key, label: text, attrs: `data-site-section="${key}" aria-pressed="${view.section === key}"` }))
    },
    content: body
  });
}

export function sitesScreen(c) {
  if (c.tab === 'editor' || c.tab === 'build') return studio(c);
  if (c.tab === 'funnel') return detail(c);
  return list(c);
}

export function afterSitesRender() {
  const c = env?.c;
  if (!c || c.view !== 'sites' || c.tab !== 'funnel') return;
  const id = c.studio.project;
  const project = c.s.studioProjects.find(item => item.id === id);
  if (!project || view.loading === id) return;
  if (view.docFor === id && (!project.rev || view.doc?.rev === project.rev)) return;
  if (c.studio.docFor === id && c.studio.doc && (!project.rev || c.studio.doc.rev === project.rev)) {
    Object.assign(view, { doc: c.studio.doc, docFor: id, page: c.studio.doc.pages.some(item => item.id === view.page) ? view.page : c.studio.doc.pages[0].id });
    return;
  }
  view.loading = id;
  env.api(`${env.url('/api/studio/doc')}&id=${encodeURIComponent(id)}`)
    .then(({ doc }) => {
      Object.assign(view, { doc, docFor: id, page: doc.pages.some(item => item.id === view.page) ? view.page : doc.pages[0].id });
      c.studio.doc = doc;
      c.studio.docFor = id;
      if (c.view === 'sites' && c.studio.project === id) env.render();
    })
    .catch(error => env.flash(error.message, true))
    .finally(() => { view.loading = ''; });
}

/* ───────── Diálogos ───────── */

function modal(title, body, form, submit) {
  const overlay = document.getElementById('overlay');
  overlay.innerHTML = `<dialog id="dialog" class="site-dialog" aria-labelledby="modal-title"><header><div><h2 id="modal-title">${h(title)}</h2></div><button class="icon-btn" type="button" aria-label="Fechar" data-site-close>${icon('close', 17)}</button></header>
    <form data-site-form="${form}"><div class="modal-body">${body}<p class="form-status" role="alert"></p></div><footer><button type="button" class="secondary" data-site-close>Cancelar</button><button class="primary">${h(submit)}</button></footer></form></dialog>`;
  const dialog = document.getElementById('dialog');
  dialog.showModal();
  dialog.addEventListener('cancel', event => { if (view.busy) event.preventDefault(); else closeModal(); });
  dialog.querySelector('input:not([type=radio]),textarea')?.focus();
}
const closeModal = () => { const overlay = document.getElementById('overlay'); overlay.querySelector('dialog')?.close(); overlay.innerHTML = ''; };

function createDialog(c, kind, mode) {
  const w = words(kind);
  const ai = c.features?.studioAI;
  const option = (value, title, text, iconName) => `<label class="site-choice"><input type="radio" name="mode" value="${value}" ${value === mode ? 'checked' : ''}>
    <span class="site-choice-icon">${icon(iconName, 20)}</span><b>${title}</b><small>${text}</small></label>`;
  modal(`${w.New}`, `<input type="hidden" name="kind" value="${kind}">
    <div class="site-choices" role="radiogroup" aria-label="Como começar">
      ${option('blank', 'Em branco', `Comece com ${kind === 'funnel' ? 'uma página de captura e uma de obrigado' : 'uma página inicial'} e edite como quiser.`, 'edit')}
      ${option('model', 'Construir com IA', ai ? 'A IA pergunta a direção visual, planeja as etapas e constrói todas.' : 'Pergunta a direção visual e monta as etapas com o gerador local.', 'spark')}
      ${option('starter', 'A partir de modelo', 'Escolha um dos modelos de site prontos, com fotos, vídeos e animações.', 'grid')}</div>
    <div data-site-mode="blank"><label>Nome do ${w.one}<input name="name" maxlength="80" placeholder="${kind === 'funnel' ? 'Ex. Aula gratuita de marketing' : 'Ex. Clínica Sorriso'}"></label></div>
    <div data-site-mode="model"><label>O que o ${w.one} deve vender ou apresentar?<textarea name="brief" rows="4" maxlength="4000" placeholder="Ex. Funil para uma clínica odontológica em BH captar pacientes para clareamento, com oferta de avaliação gratuita"></textarea></label>
      <label>Site de referência (opcional)<input name="reference" type="url" maxlength="500" placeholder="https://"></label>
      <p class="dim">Antes de construir, você escolhe a paleta, as fontes e o layout. A estrutura do site de referência serve só de inspiração; os textos não são copiados.</p>
      ${ai ? '' : '<p class="site-hint">Sem a OpenAI conectada, o construtor usa o gerador local. Conecte em Visão da agência → Configurações → OpenAI para a IA escrever as páginas.</p>'}</div>
    <div data-site-mode="starter">${templateGallery(w)}</div>`,
  'create', kind === 'funnel' ? 'Criar funil' : 'Criar site');
  syncModes();
}

// Galeria de modelos (como a biblioteca de templates do GHL): filtro por categoria, busca,
// miniatura ao vivo de cada modelo e link para ver o modelo inteiro numa aba nova.
function templateGallery(w) {
  const chip = ([id, name], index) => `<label class="tpl-chip"><input type="radio" name="tplCategory" value="${id}" ${index ? '' : 'checked'}>${h(name)}</label>`;
  const card = (t, index) => {
    const category = siteTemplateCategories.find(([id]) => id === t.category)?.[1] || '';
    return `<label class="tpl-card" data-tpl-category="${t.category}" data-tpl-text="${h(`${t.name} ${category} ${t.description}`.toLowerCase())}">
      <input type="radio" name="siteTemplate" value="${t.id}" ${index ? '' : 'checked'}>
      <span class="tpl-thumb" style="background-image:url('${t.cover}')"><iframe src="/studio-template/${t.id}/index?thumb" title="Miniatura do modelo ${h(t.name)}" loading="lazy" tabindex="-1" aria-hidden="true"></iframe></span>
      <span class="tpl-info"><b>${h(t.name)}</b><small>${h(category)} · ${t.pages.length} ${t.pages.length === 1 ? 'página' : 'páginas'}</small>
        <small class="tpl-desc">${h(t.description)}</small>
        <span class="tpl-tags">${t.effects.map(e => `<i>${h(e)}</i>`).join('')}</span>
        <a class="tpl-preview" href="/studio-template/${t.id}/index" target="_blank" rel="noopener">Pré-visualizar ${icon('external', 13)}</a></span></label>`;
  };
  return `<label>Nome do ${w.one}<input name="starterName" maxlength="80" placeholder="Ex. Clínica Sorriso (aparece no lugar da marca do modelo)"></label>
    <div class="tpl-bar"><div class="tpl-chips" role="radiogroup" aria-label="Categoria">${[['all', 'Todos'], ...siteTemplateCategories].map(chip).join('')}</div>
      <input type="search" class="tpl-search" data-tpl-search placeholder="Buscar modelos" aria-label="Buscar modelos"></div>
    <div class="tpl-grid" role="radiogroup" aria-label="Modelo">${siteTemplates.map(card).join('')}</div>
    <p class="tpl-empty dim" hidden>Nenhum modelo encontrado.</p>`;
}

function filterTemplates(form) {
  const category = form.elements.tplCategory?.value || 'all';
  const query = (form.querySelector('[data-tpl-search]')?.value || '').trim().toLowerCase();
  let shown = 0;
  for (const card of form.querySelectorAll('.tpl-card')) {
    const visible = (category === 'all' || card.dataset.tplCategory === category) && (!query || card.dataset.tplText.includes(query));
    card.hidden = !visible; shown += visible;
  }
  form.querySelector('.tpl-empty').hidden = shown > 0;
}

function syncModes() {
  const form = document.querySelector('[data-site-form="create"]');
  if (!form) return;
  const mode = form.elements.mode.value;
  for (const block of form.querySelectorAll('[data-site-mode]')) block.hidden = block.dataset.siteMode !== mode;
}

/* ───────── Comportamento ───────── */

export function installSites(environment) {
  env = environment;
  const { c, api, url, mutate, render, flash } = env;
  const project = () => c.s.studioProjects.find(item => item.id === c.studio.project);

  async function call(op, body) {
    const result = await api(url(`/api/studio/${op}`), { id: c.studio.project, ...body });
    c.s = result.state; c.m = result.metrics;
    Object.assign(view, { doc: result.doc, docFor: c.studio.project });
    c.studio.doc = result.doc;
    c.studio.docFor = c.studio.project;
    return result.result;
  }

  function openEditor(pageId) {
    c.studio.page = pageId;
    if (view.doc && view.docFor === c.studio.project) {
      c.studio.doc = view.doc;
      c.studio.docFor = c.studio.project;
    }
    location.hash = `#sites/editor/${c.studio.project}`;
  }

  document.addEventListener('input', event => {
    const field = event.target;
    if (field.matches('[data-site-search]')) {
      view.query = field.value;
      const body = document.querySelector('.site-table tbody');
      const kind = c.tab === 'websites' ? 'website' : 'funnel';
      if (body) body.innerHTML = listRows(c, kind) || `<tr><td colspan="5" class="dim">Nenhum resultado para “${h(view.query)}”.</td></tr>`;
    }
    const counter = field.closest('.site-seo')?.querySelector(`[data-count-for="${field.name}"]`);
    if (counter) counter.textContent = `${field.value.length}/${field.maxLength}`;
  });
  document.addEventListener('change', event => {
    const form = event.target.closest('[data-site-form="create"]');
    if (form && event.target.name === 'mode') syncModes();
    if (form && event.target.name === 'tplCategory') filterTemplates(form);
  });
  document.addEventListener('input', event => { if (event.target.matches('[data-tpl-search]')) filterTemplates(event.target.form); });

  document.addEventListener('click', async event => {
    const target = event.target.closest('button, a');
    if (!target) return;
    const d = target.dataset;
    if ('siteClose' in d) { if (!view.busy) closeModal(); return; }
    if (d.siteNew) { createDialog(c, d.kind, d.siteNew === 'ai' ? 'model' : 'blank'); return; }
    if (!target.closest('[data-site-detail]')) return;
    if (d.siteEditPage !== undefined) { event.preventDefault(); openEditor(d.siteEditPage || view.page); return; }
    if (target.tagName === 'A' || target.disabled || view.busy) return;
    const w = words(kindOf(project()));
    try {
      if (d.siteSection) { view.section = d.siteSection; render(); return; }
      if (d.sitePage) { view.page = d.sitePage; render(); return; }
      if (d.siteMove) { view.busy = true; await call('page', { action: 'move', pageId: d.page, direction: d.siteMove }); render(); return; }
      if (d.siteDuplicate) { view.busy = true; view.page = await call('page', { action: 'duplicate', pageId: d.siteDuplicate }); render(); flash(`${w.Step} duplicada.`); return; }
      if (d.siteDeletePage) {
        const page = view.doc.pages.find(item => item.id === d.siteDeletePage);
        modal(`Excluir ${w.step}?`, `<input type="hidden" name="pageId" value="${page.id}"><p>“${h(page.name)}” será removida. Você pode restaurá-la pelo histórico de versões do AI Studio.</p>`, 'delete-page', 'Excluir');
        return;
      }
      if ('siteAddStep' in d) {
        const ai = c.features?.studioAI;
        modal(`Adicionar ${w.step}`, `<label>Nome<input name="name" required maxlength="60" placeholder="${kindOf(project()) === 'funnel' ? 'Ex. Oferta especial' : 'Ex. Sobre nós'}"></label>
          <label>Caminho (opcional)<input name="slug" maxlength="48" placeholder="oferta-especial"></label>
          <label>O que a ${w.step} deve conter?<textarea name="description" rows="3" maxlength="1500" placeholder="Ex. Oferta do plano anual com 3 benefícios, garantia e formulário"></textarea></label>
          <label class="check"><input type="checkbox" name="ai" ${ai ? 'checked' : 'disabled'}> Criar com IA, no mesmo estilo da primeira ${w.step}</label>
          ${ai ? '<p class="dim">Com IA, a criação leva de 1 a 3 minutos.</p>' : '<p class="dim">Sem a OpenAI conectada, a página nasce de um modelo simples para você editar.</p>'}`, 'add-step', 'Adicionar');
        return;
      }
      if (d.sitePublish) {
        view.busy = true; target.disabled = true;
        await call('publish', { publish: d.sitePublish === 'on' });
        render(); flash(d.sitePublish === 'on' ? `${w.One} publicado.` : `${w.One} fora do ar.`); return;
      }
      if ('siteResetStats' in d) { view.busy = true; await call('stats-reset', {}); render(); flash('Estatísticas zeradas.'); return; }
      if (d.siteSeoAi) {
        view.busy = true; target.disabled = true; target.textContent = 'Gerando…';
        await call('seo-ai', { pageId: d.siteSeoAi }); render(); flash('SEO gerado. Revise e publique de novo para aplicar.'); return;
      }
      if ('siteDelete' in d) {
        modal(`Excluir ${w.one}?`, `<p>“${h(project().name)}” sai do ar e o projeto é apagado, com todas as ${w.steps} e versões. Isso não pode ser desfeito.</p>`, 'delete-site', `Excluir ${w.one}`);
      }
    } catch (error) { flash(error.message, true); render(); }
    finally { view.busy = false; }
  });

  const submit = {
    async create(data, form) {
      const mode = data.mode;
      if (mode === 'model') {
        if (!data.brief?.trim()) throw new Error('Descreva o que você quer construir.');
        closeModal();
        startBuild(env, { brief: data.brief.trim(), kind: data.kind, template: 'landing', reference: data.reference || '', ai: Boolean(c.features?.studioAI) });
        return;
      }
      const body = { kind: data.kind, mode };
      if (mode === 'blank') body.name = data.name;
      if (mode === 'model') Object.assign(body, { brief: data.brief, template: 'landing', reference: data.reference || undefined });
      if (mode === 'starter') {
        const template = siteTemplates.find(item => item.id === data.siteTemplate);
        if (!template) throw new Error('Escolha um modelo.');
        const name = data.starterName.trim() || template.brand;
        Object.assign(body, { siteTemplate: template.id, name, brief: `${name}. ${template.description}` });
      }
      if (mode === 'blank' && !body.name?.trim()) throw new Error('Dê um nome.');
      if (mode === 'model' && !body.brief?.trim()) throw new Error('Descreva o que você quer construir.');
      form.querySelector('.form-status').classList.add('confirmed');
      form.querySelector('.form-status').textContent = mode === 'model' ? 'A IA está montando as páginas. Isso leva de 1 a 3 minutos…' : 'Criando…';
      const before = new Set(c.s.studioProjects.map(item => item.id));
      const result = await api(url('/api/studio'), body);
      c.s = result.state; c.m = result.metrics;
      const created = c.s.studioProjects.find(item => !before.has(item.id));
      closeModal();
      Object.assign(view, { section: 'steps', page: '', doc: null, docFor: '' });
      location.hash = `#sites/funnel/${created.id}`;
      flash(data.kind === 'funnel' ? 'Funil criado.' : 'Site criado.');
    },
    async 'add-step'(data, form) {
      form.querySelector('.form-status').classList.add('confirmed');
      form.querySelector('.form-status').textContent = data.ai ? 'A IA está criando a página…' : 'Criando…';
      const pageId = await call('page', { action: 'add', name: data.name, description: data.description, ai: Boolean(data.ai) });
      if (data.slug?.trim()) {
        try { await call('page', { action: 'slug', pageId, slug: data.slug }); }
        catch (error) { flash(`Página criada, mas o caminho não foi aceito: ${error.message}`, true); }
      }
      view.page = pageId; closeModal(); render(); flash('Página adicionada.');
    },
    async 'delete-page'(data) { await call('page', { action: 'delete', pageId: data.pageId }); view.page = ''; closeModal(); render(); flash('Página excluída.'); },
    async rename(data) { await call('page', { action: 'rename', pageId: view.page, name: data.name }); render(); flash('Nome salvo.'); },
    async slug(data) { await call('page', { action: 'slug', pageId: view.page, slug: data.slug }); render(); flash('Caminho salvo. Publique de novo para aplicar.'); },
    async revise(data, form) {
      if (!data.instruction?.trim()) throw new Error('Descreva a mudança.');
      form.querySelector('button').textContent = 'Aplicando…';
      const change = await call('revise', { pageId: view.page, instruction: data.instruction });
      render(); flash(change?.change || 'Página atualizada.');
    },
    async seo(data, form) { await call('seo', { pageId: form.dataset.page, title: data.title, description: data.description }); render(); flash('SEO salvo. Publique de novo para aplicar.'); },
    async settings(data) {
      await mutate({ type: 'studio-meta', id: c.studio.project, data: { name: data.name, kind: data.kind } });
      render(); flash('Configurações salvas.');
    },
    async 'delete-site'() {
      const current = project();
      const list = words(kindOf(current)).list;
      if (current.publishedAt) await call('publish', { publish: false });
      await mutate({ type: 'delete', key: 'studioProjects', id: current.id });
      closeModal(); Object.assign(view, { doc: null, docFor: '' });
      location.hash = `#sites/${list}`; flash('Excluído.');
    }
  };

  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-site-form]');
    if (!form) return;
    event.preventDefault();
    if (view.busy) return;
    const button = form.querySelector('button.primary, button:not([type=button])');
    const note = form.querySelector('.form-status');
    view.busy = true;
    if (button) button.disabled = true;
    if (note) { note.textContent = ''; note.classList.remove('confirmed'); }
    try {
      const data = Object.fromEntries(new FormData(form));
      await submit[form.dataset.siteForm](data, form);
    } catch (error) {
      if (note) { note.classList.remove('confirmed'); note.textContent = error.message; } else flash(error.message, true);
    } finally {
      view.busy = false;
      if (button?.isConnected) button.disabled = false;
    }
  });
}
