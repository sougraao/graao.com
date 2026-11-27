// Sites → Formulários, Pesquisas e Questionários: list, analytics and submissions, plus the builder
// (palette of fields, live canvas, field properties, steps and jumps, quiz scoring, settings, embed, results).
import { icon } from './icons.js';
import { h, pageShell, utabs } from './screens.js';
import { designStage, mountDesignStage } from './design-workspace.js';
import { destinationField, readDestination } from './destination-field.js';
import { defaultTiers, fieldCatalog, fieldKinds, fieldMarkup, formCss, formFields, inputOf, newField, scoreOf, templatesFor, validFields } from './form-fields.js';
import { ask } from './ask.js';

// The three kinds share the engine; each has its own list, analytics and submissions under Sites.
const KINDS = {
  form: { list: 'forms', analytics: 'form-analytics', subs: 'submissions', one: 'formulário', One: 'Formulário', many: 'formulários', Many: 'Formulários', New: 'Novo formulário', all: 'Todos os formulários', icon: 'list', fem: false },
  survey: { list: 'surveys', analytics: 'survey-analytics', subs: 'survey-submissions', one: 'pesquisa', One: 'Pesquisa', many: 'pesquisas', Many: 'Pesquisas', New: 'Nova pesquisa', all: 'Todas as pesquisas', icon: 'chart', fem: true },
  quiz: { list: 'quizzes', analytics: 'quiz-analytics', subs: 'quiz-submissions', one: 'questionário', One: 'Questionário', many: 'questionários', Many: 'Questionários', New: 'Novo questionário', all: 'Todos os questionários', icon: 'award', fem: false }
};
export const siteTabs = [['funnels', 'Funis'], ['websites', 'Sites'], ['blogs', 'Blogs'], ['stores', 'Lojas'], ['forms', 'Formulários'], ['surveys', 'Pesquisas'], ['quizzes', 'Questionários'], ['chat-widget', 'Chat'], ['webinars', 'Webinars'], ['qr-codes', 'QR Codes'], ['analytics', 'Análises']];
export const formTabs = Object.values(KINDS).flatMap(k => [k.list, k.analytics, k.subs]).concat('form');
const kindOf = form => KINDS[form?.kind] ? form.kind : 'form';
const kindForTab = tab => Object.keys(KINDS).find(kind => [KINDS[kind].list, KINDS[kind].analytics, KINDS[kind].subs].includes(tab)) || 'form';
const formsOf = (c, kind) => c.s.forms.filter(form => kindOf(form) === kind);

const fb = { id: '', draft: null, selected: '', dirty: false, section: 'edit', palette: 'quick', query: '', formFilter: '', open: '', range: 30, busy: false, drag: null };
let env = null;
const when = iso => iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
const norm = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const badge = (label, tone = '') => `<span class="badge ${tone}">${h(label)}</span>`;
const formUrl = (c, form) => `/form/${c.workspace}/${form.id}`;
const absolute = path => `${location.origin}${path}`;
const pct = (a, b) => b ? `${(Math.round(a / b * 1000) / 10).toLocaleString('pt-BR')}%` : '—';
const settingsOf = form => ({ button: form.button || 'Enviar', accent: form.accent || '#155eef', showTitle: form.showTitle !== false, addTags: form.addTags || [],
  onSubmit: { action: 'message', message: '', url: '', siteId: '', page: '', serviceId: '', ...(form.onSubmit || {}) }, routes: form.routes || [], schedule: { start: '', end: '', closedMessage: '', ...(form.schedule || {}) } });
const customFieldsOf = c => (c.s.customFields || []).filter(field => field.object === 'Contact');
const subsOf = (c, id, kind) => c.s.submissions.filter(item => id ? item.formId === id : !kind || kindOf(c.s.forms.find(form => form.id === item.formId)) === kind);

/* ───────── Lista, análises e envios ───────── */

function formsPage(c, body, actions = '', kind = kindForTab(c.tab)) {
  const k = KINDS[kind];
  const inner = utabs({
    key: `sites-${k.list}-sub`,
    nested: true,
    label: k.Many,
    current: c.tab || k.list,
    items: [
      { value: k.list, label: k.all, href: `#sites/${k.list}` },
      { value: k.analytics, label: 'Análises', href: `#sites/${k.analytics}` },
      { value: k.subs, label: 'Envios', href: `#sites/${k.subs}` }
    ],
    content: body
  });
  return pageShell({
    title: 'Sites',
    desc: 'Crie funis, sites e formulários com IA, publique e acompanhe visitas e conversões.',
    cta: actions,
    className: 'sites-page fm-page',
    tabs: {
      key: 'sites',
      label: 'Seções de sites',
      current: k.list,
      items: siteTabs
    },
    content: inner
  });
}

function listView(c, kind) {
  const k = KINDS[kind], query = norm(fb.query.trim()), all = formsOf(c, kind);
  const forms = all.filter(form => norm(form.name).includes(query)).sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
  const rows = forms.map(form => {
    const count = subsOf(c, form.id).length, fields = formFields(form).filter(field => !['static', 'break'].includes(fieldKinds[field.type]?.input)).length;
    return `<tr><td><a class="site-name" href="#sites/form/${form.id}">${icon(k.icon, 16)}<span>${h(form.name)}</span></a></td><td>${fields}</td><td>${count}</td>
      <td>${when(form.updated || form.created)}</td><td>${form.active ? badge(k.fem ? 'Publicada' : 'Publicado', 'green') : badge('Rascunho')}</td>
      <td class="site-row-actions">${form.active ? `<a class="icon-btn" href="${formUrl(c, form)}" target="_blank" rel="noopener" title="Abrir publicado" aria-label="Abrir ${h(form.name)} publicado">${icon('external', 15)}</a>` : ''}
        <a class="secondary site-open" href="#sites/form/${form.id}">Editar</a></td></tr>`;
  }).join('');
  const blurb = { form: 'Comece em branco ou de um modelo: contato, orçamento, consultoria, pesquisa ou newsletter.',
    survey: 'Pesquisas em etapas, com uma pergunta por tela se quiser e desvios conforme a resposta.',
    quiz: 'Cada resposta vale pontos; o visitante vê o resultado na hora e o contato recebe a tag da faixa.' }[kind];
  const button = `<button class="primary" data-fm-new="${kind}">${icon('plus', 16)} ${k.New}</button>`;
  return formsPage(c, `${all.length ? `<div class="toolbar"><label class="search">${icon('search', 15)}<input type="search" data-fm-search value="${h(fb.query)}" placeholder="Buscar ${k.many}" aria-label="Buscar ${k.many}"></label></div>` : ''}
    ${rows ? `<div class="surface table-shell"><table class="site-table"><thead><tr><th scope="col">Nome</th><th scope="col">${kind === 'form' ? 'Campos' : 'Perguntas'}</th><th scope="col">Envios</th><th scope="col">Atualizado</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : all.length ? `<div class="surface empty"><strong>Nenhum${k.fem ? 'a' : ''} ${k.one} encontrad${k.fem ? 'a' : 'o'}</strong><p>Tente outro nome.</p></div>`
      : `<div class="surface empty site-empty">${icon(k.icon, 26)}<strong>Nenhum${k.fem ? 'a' : ''} ${k.one} ainda</strong><p>${blurb}</p>${button}</div>`}`, button, kind);
}

const dayKey = date => date.toISOString().slice(0, 10);
function series(c, formId, days, kind) {
  const today = new Date(), out = [];
  for (let i = days - 1; i >= 0; i--) { const d = new Date(today); d.setDate(today.getDate() - i); out.push({ day: dayKey(d), views: 0, subs: 0, direct: 0 }); }
  const index = Object.fromEntries(out.map((row, i) => [row.day, i]));
  for (const form of c.s.forms.filter(form => formId ? form.id === formId : !kind || kindOf(form) === kind)) for (const [day, n] of Object.entries(form.viewsByDay || {})) if (day in index) out[index[day]].views += n;
  for (const sub of subsOf(c, formId, kind)) { const day = String(sub.created).slice(0, 10); if (day in index) { out[index[day]].subs += 1; if (['Link', 'Incorporado'].includes(sub.source)) out[index[day]].direct += 1; } }
  return out;
}

function chart(rows) {
  const max = Math.max(1, ...rows.map(row => row.subs));
  const label = day => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${day}T12:00:00`));
  return `<figure class="surface fm-chart"><figcaption><b>Envios por dia</b><span class="dim">Últimos ${rows.length} dias</span></figcaption>
    <div class="fm-bars" role="img" aria-label="Envios por dia nos últimos ${rows.length} dias, máximo de ${max}">
      <span class="fm-axis" aria-hidden="true"><i>${max}</i><i>0</i></span>
      ${rows.map(row => `<span class="fm-bar" data-tip="${label(row.day)}: ${row.subs} ${row.subs === 1 ? 'envio' : 'envios'} · ${row.views} ${row.views === 1 ? 'visita' : 'visitas'}"><i style="height:${row.subs ? Math.max(4, row.subs / max * 100) : 0}%"></i></span>`).join('')}
    </div><div class="fm-chart-foot dim"><span>${label(rows[0].day)}</span><span>${label(rows.at(-1).day)}</span></div></figure>`;
}

function stats(c, formId, kind) {
  const rows = series(c, formId, fb.range, kind);
  const views = rows.reduce((sum, row) => sum + row.views, 0), subs = rows.reduce((sum, row) => sum + row.subs, 0), direct = rows.reduce((sum, row) => sum + row.direct, 0);
  return `<div class="fm-range" role="group" aria-label="Período">${[7, 30, 90].map(days => `<button class="${fb.range === days ? 'selected' : ''}" aria-pressed="${fb.range === days}" data-fm-range="${days}">${days} dias</button>`).join('')}</div>
    <div class="metrics three"><div class="surface metric"><span>Visitas</span><b>${views}</b></div><div class="surface metric"><span>Envios</span><b>${subs}</b></div><div class="surface metric"><span>Conversão</span><b>${pct(direct, views)}</b></div></div>
    ${chart(rows)}`;
}

function analyticsView(c, kind) {
  const k = KINDS[kind];
  const since = dayKey(new Date(Date.now() - (fb.range - 1) * 864e5));
  const rows = formsOf(c, kind).map(form => {
    const views = Object.entries(form.viewsByDay || {}).filter(([day]) => day >= since).reduce((sum, [, n]) => sum + n, 0);
    const recent = subsOf(c, form.id).filter(sub => String(sub.created).slice(0, 10) >= since), subs = recent.length, direct = recent.filter(sub => ['Link', 'Incorporado'].includes(sub.source)).length;
    const last = subsOf(c, form.id).at(-1);
    return `<tr><td><a href="#sites/form/${form.id}">${h(form.name)}</a></td><td>${views}</td><td>${subs}</td><td>${pct(direct, views)}</td><td>${last ? when(last.created) : '—'}</td></tr>`;
  }).join('');
  return formsPage(c, `${stats(c, '', kind)}${kind === 'quiz' ? tierTable(subsOf(c, '', 'quiz')) : ''}
    ${rows ? `<div class="surface table-shell"><table class="site-table"><caption class="sr-only">Desempenho por ${k.one}</caption><thead><tr><th scope="col">${k.One}</th><th scope="col">Visitas</th><th scope="col">Envios</th><th scope="col">Conversão</th><th scope="col">Último envio</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
    <p class="dim fm-note">Visitas contam aberturas do link e da versão incorporada. Envios feitos pelos funis e sites do AI Studio entram em Envios, mas não na conversão: as visitas deles ficam nas estatísticas do próprio funil.</p>`, '', kind);
}

// How many quiz takers landed in each result tier.
function tierTable(subs) {
  const scored = subs.filter(sub => sub.result);
  if (!scored.length) return '';
  const counts = new Map();
  for (const sub of scored) counts.set(sub.result.tier || 'Sem faixa', (counts.get(sub.result.tier || 'Sem faixa') || 0) + 1);
  const average = Math.round(scored.reduce((sum, sub) => sum + sub.result.percent, 0) / scored.length);
  return `<div class="surface table-shell fm-tiers"><table class="site-table"><caption>Resultados · média de ${average}%</caption><thead><tr><th scope="col">Faixa</th><th scope="col">Pessoas</th><th scope="col">Parcela</th></tr></thead>
    <tbody>${[...counts].map(([tier, n]) => `<tr><td>${h(tier)}</td><td>${n}</td><td>${pct(n, scored.length)}</td></tr>`).join('')}</tbody></table></div>`;
}

function submissionsTable(c, formId, kind = 'form') {
  const query = norm(fb.query.trim()), k = KINDS[kind], scored = kind === 'quiz';
  const list = [...subsOf(c, formId || fb.formFilter, kind)].reverse().filter(sub => !query || norm(`${sub.name} ${sub.email} ${sub.phone} ${(sub.answers || []).map(a => a.value).join(' ')}`).includes(query));
  const formName = id => c.s.forms.find(form => form.id === id)?.name || 'Formulário excluído';
  const rows = list.slice(0, 300).map(sub => {
    const open = fb.open === sub.id;
    return `<tr class="${open ? 'open' : ''}"><td>${when(sub.created)}</td>${formId ? '' : `<td>${h(formName(sub.formId))}</td>`}<td>${sub.contactId ? `<a href="#contacts" data-fm-contact="${sub.contactId}">${h(sub.name || '—')}</a>` : h(sub.name || '—')}</td>
      <td>${h(sub.email || sub.phone || '—')}</td>${scored ? `<td>${sub.result ? `${h(sub.result.tier || '—')} · ${sub.result.percent}%` : '—'}</td>` : ''}<td>${h(sub.source || '—')}</td>
      <td><button class="text-link" data-fm-open="${sub.id}" aria-expanded="${open}">${open ? 'Ocultar' : 'Ver respostas'}</button></td></tr>
      ${open ? `<tr class="fm-answers"><td colspan="${(formId ? 5 : 6) + (scored ? 1 : 0)}"><dl>${(sub.answers?.length ? sub.answers : [{ label: 'Nome', value: sub.name }, { label: 'E-mail', value: sub.email }]).map(a => `<div><dt>${h(a.label)}</dt><dd>${h(a.value || '—')}</dd></div>`).join('')}</dl></td></tr>` : ''}`;
  }).join('');
  return `<div class="toolbar"><label class="search">${icon('search', 15)}<input type="search" data-fm-search value="${h(fb.query)}" placeholder="Buscar nas respostas" aria-label="Buscar nas respostas"></label>
      ${formId ? '' : `<select data-fm-filter aria-label="Filtrar por ${k.one}"><option value="">${k.all}</option>${formsOf(c, kind).map(form => `<option value="${form.id}"${fb.formFilter === form.id ? ' selected' : ''}>${h(form.name)}</option>`).join('')}</select>`}
      <span class="spacer"></span>${list.length ? `<button class="secondary" data-fm-csv="${formId || fb.formFilter}" data-kind="${kind}">${icon('download', 15)} Exportar CSV</button>` : ''}</div>
    ${rows ? `<div class="surface table-shell"><table class="site-table fm-subs"><thead><tr><th scope="col">Recebido</th>${formId ? '' : `<th scope="col">${k.One}</th>`}<th scope="col">Nome</th><th scope="col">Contato</th>${scored ? '<th scope="col">Resultado</th>' : ''}<th scope="col">Origem</th><th scope="col"><span class="sr-only">Respostas</span></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="surface empty">${icon('inbox', 24)}<strong>Nenhum envio${query ? ' encontrado' : ' ainda'}</strong><p>${query ? 'Tente outra busca.' : `Publique ${k.fem ? 'a' : 'o'} ${k.one} e compartilhe o link para receber respostas.`}</p></div>`}`;
}

/* ───────── Construtor ───────── */

function loadDraft(c) {
  const form = c.s.forms.find(item => item.id === c.studio.project);
  if (!form) return null;
  if (fb.id !== form.id || (!fb.dirty && fb.rev !== (form.updated || form.created))) {
    const sameForm = fb.id === form.id;
    Object.assign(fb, { id: form.id, rev: form.updated || form.created, dirty: false, selected: sameForm ? fb.selected : '', section: sameForm ? fb.section : 'edit', palette: sameForm ? fb.palette : 'layers', viewport: sameForm ? fb.viewport : {}, open: '' });
    fb.draft = { name: form.name, description: form.description || '', active: form.active, kind: kindOf(form), oneAtATime: Boolean(form.oneAtATime), tiers: structuredClone(form.tiers?.length ? form.tiers : defaultTiers),
      fields: structuredClone(formFields(form)), ...structuredClone(settingsOf(form)) };
  }
  return form;
}

function paletteHtml(c) {
  const custom = customFieldsOf(c);
  const used = new Set(fb.draft.fields.map(field => field.type === 'custom' ? `custom:${field.customId}` : field.type));
  const fixed = type => Boolean(fieldKinds[type].key) && type !== 'source';
  const tile = (type, label, extra = '') => `<button type="button" class="fb-tile" draggable="true" data-fb-add="${type}"${extra}${fixed(type) && used.has(type) ? ' disabled title="Já está no formulário"' : ''}><span aria-hidden="true">${icon(tileIcon(type), 18)}</span>${h(label)}</button>`;
  return `<aside class="fb-palette dw-panel" aria-label="Estrutura do formulário"><div class="fb-palette-tabs" role="tablist">
      ${[['layers','Camadas'],['quick','Adicionar'],['contact','Contato']].map(([id,label]) => `<button role="tab" aria-selected="${fb.palette === id}" data-fb-palette="${id}">${label}</button>`).join('')}</div>
    <div class="fb-palette-body">${fb.palette === 'layers' ? `<ul class="dw-layer-list" data-fb-layers>${formLayers()}</ul>` : fb.palette === 'quick'
      ? fieldCatalog.filter(([group]) => group !== 'Estrutura' || fb.draft.kind !== 'form').map(([group, types]) => `<section><h3>${h(group)}</h3><div class="fb-tiles">${types.map(type => tile(type, fieldKinds[type].label)).join('')}</div></section>`).join('')
      : custom.length ? `<section><h3>Campos personalizados do contato</h3><div class="fb-tiles">${custom.map(field => `<button type="button" class="fb-tile" draggable="true" data-fb-add="custom" data-custom="${field.id}"${used.has(`custom:${field.id}`) ? ' disabled title="Já está no formulário"' : ''}><span aria-hidden="true">${icon('contacts', 18)}</span>${h(field.name)}</button>`).join('')}</div></section><p class="dim">A resposta é gravada no campo do contato.</p>`
      : `<p class="dim">Nenhum campo personalizado de contato. Crie em <a href="#settings/fields">Configurações → Campos personalizados</a> e ele aparece aqui.</p>`}</div>
    ${fb.palette !== 'layers' ? '<p class="fb-palette-hint dim">Clique para adicionar ao fim ou arraste para a posição.</p>' : ''}</aside>`;
}
const tileIcon = type => ({ name: 'contacts', first_name: 'contacts', last_name: 'contacts', email: 'mail', phone: 'phone', birthday: 'cal', address: 'pin', city: 'pin', state: 'pin', country: 'pin', postal_code: 'pin', organization: 'box', website: 'site',
  break: 'menu', text: 'edit', textarea: 'note', select: 'chevron', multiselect: 'list', checkbox: 'check', radio: 'check', rating: 'star', date: 'cal', number: 'sort', monetary: 'pay', heading: 'note', terms: 'lock', source: 'link' })[type] || 'edit';

function formLayers() {
  return `<li><button class="dw-layer" data-fb-select="" aria-pressed="${!fb.selected}">${icon('list',14)} <span>Formulário</span></button></li>${fb.draft.fields.map(field =>
    `<li><button class="dw-layer${field.type === 'break' ? ' fb-layer-step' : ''}" data-fb-layer="${field.id}" aria-pressed="${fb.selected === field.id}" style="--dw-depth:${field.type === 'break' ? 0 : 1}">${icon(tileIcon(field.type),14)}<span>${h(field.label || fieldKinds[field.type].label)}</span></button></li>`).join('')}`;
}

function canvasItems(c) {
  const custom = c.s.customFields || [];
  if (!fb.draft.fields.length) return '<button class="fb-empty" data-fb-palette="quick">Adicionar campo</button>';
  return fb.draft.fields.map((field, index) => `<div class="fb-item${fb.selected === field.id ? ' selected' : ''}${field.width === 50 ? ' half' : ''}" data-fb-item="${field.id}" draggable="true" tabindex="0" role="button" aria-label="${h(field.label)}: editar campo" aria-pressed="${fb.selected === field.id}">
      ${field.hidden ? `<span class="fb-flag">${icon('lock', 12)} Oculto</span>` : ''}
      ${fieldMarkup(field, { customFields: custom, disabled: true })}
      <div class="fb-tools"><button type="button" class="icon-btn" data-fb-move="-1" data-id="${field.id}" aria-label="Mover para cima"${index === 0 ? ' disabled' : ''}>${icon('updown', 14)}</button>
        <button type="button" class="icon-btn" data-fb-dup="${field.id}" aria-label="Duplicar campo" title="Duplicar">${icon('plus', 14)}</button>
        <button type="button" class="icon-btn" data-fb-del="${field.id}" aria-label="Excluir campo" title="Excluir">${icon('trash', 14)}</button></div></div>`).join('');
}

function canvasHtml(c) {
  const d = fb.draft;
  return `<div class="fb-canvas"><style>${formCss}</style><div class="fb-sheet" style="--sf-accent:${h(d.accent)}">
    ${d.showTitle ? `<header class="fb-sheet-head"><h2>${h(d.name)}</h2>${d.description ? `<p>${h(d.description)}</p>` : ''}</header>` : ''}
    <div class="sf"><div class="sf-grid fb-list" data-fb-list>${canvasItems(c)}</div><button class="sf-submit" type="button" data-fb-select="" tabindex="-1">${h(d.button || 'Enviar')}</button></div></div></div>`;
}

const check = (name, label, value, attrs = '') => `<label class="check"><input type="checkbox" data-fb-prop="${name}"${value ? ' checked' : ''}${attrs}> ${label}</label>`;
function propsHtml(c) {
  const field = fb.draft.fields.find(item => item.id === fb.selected);
  const d = fb.draft;
  if (!field) return `<aside class="fb-props dw-panel" aria-label="Propriedades do formulário"><h2>Propriedades do formulário</h2>
    <label>Nome<input data-fb-form="name" value="${h(d.name)}" maxlength="120"></label>
    <label>Descrição<textarea data-fb-form="description" rows="2" maxlength="1500">${h(d.description)}</textarea></label>
    <label class="check"><input type="checkbox" data-fb-form="showTitle"${d.showTitle ? ' checked' : ''}> Mostrar nome e descrição no topo</label>
    <label>Texto do botão<input data-fb-form="button" value="${h(d.button)}" maxlength="60"></label>
    <label>Cor de destaque<span class="fb-color"><input type="color" data-fb-form="accent" value="${h(d.accent)}"><code>${h(d.accent)}</code></span></label>
    ${d.kind !== 'form' ? `<label class="check"><input type="checkbox" data-fb-form="oneAtATime"${d.oneAtATime ? ' checked' : ''}> Uma pergunta por tela</label>
      <p class="dim">Use “Nova etapa” na paleta para dividir em telas. Com uma pergunta por tela, cada pergunta vira uma tela.</p>` : ''}</aside>`;
  const kind = fieldKinds[field.type], type = inputOf(field, c.s.customFields || []);
  const isStatic = type === 'static', isHidden = type === 'hidden';
  if (type === 'break') return `<aside class="fb-props dw-panel" aria-label="Propriedades da etapa"><div class="fb-props-head"><button type="button" class="icon-btn" data-fb-select="" aria-label="Voltar às propriedades">${icon('left', 16)}</button><h2>Nova etapa</h2></div>
    <label>Título da etapa <small class="dim">opcional</small><input data-fb-prop="label" value="${h(field.label)}" maxlength="200" placeholder="Ex. Sobre a empresa"></label>
    <p class="dim">Tudo abaixo desta marca aparece numa nova tela, com os botões Voltar e Próximo. Respostas de etapas anteriores podem pular direto para cá.</p>
    <div class="fb-props-foot"><button type="button" class="secondary danger" data-fb-del="${field.id}">Excluir etapa</button></div></aside>`;
  const custom = field.type === 'custom' ? (c.s.customFields || []).find(item => item.id === field.customId) : null;
  return `<aside class="fb-props dw-panel" aria-label="Propriedades do campo"><div class="fb-props-head"><button type="button" class="icon-btn" data-fb-select="" aria-label="Voltar às propriedades do formulário">${icon('left', 16)}</button><h2>${h(custom ? custom.name : kind.label)}</h2></div>
    <label>${isStatic ? 'Título' : 'Rótulo'}<input data-fb-prop="label" value="${h(field.label)}" maxlength="200"></label>
    ${isStatic || type === 'consent' ? `<label>${isStatic ? 'Texto' : 'Texto do consentimento'}<textarea data-fb-prop="text" rows="3" maxlength="2000">${h(field.text)}</textarea></label>` : ''}
    ${['text', 'email', 'tel', 'url', 'number', 'money', 'textarea', 'select'].includes(type) ? `<label>Placeholder<input data-fb-prop="placeholder" value="${h(field.placeholder)}" maxlength="120"></label>` : ''}
    ${kind.choices ? `<label>Opções <small class="dim">uma por linha</small><textarea data-fb-prop="options" rows="5">${h(field.options.join('\n'))}</textarea></label>` : ''}
    ${kind.choices && fb.draft.kind === 'quiz' ? scoreEditor(field) : ''}
    ${['select', 'radio'].includes(field.type) && fb.draft.kind !== 'form' ? logicEditor(field) : ''}
    ${isHidden ? `<label>Valor padrão<input data-fb-prop="value" value="${h(field.value)}" maxlength="200"></label><p class="dim">Use <code>?${h(field.key || 'source')}=valor</code> no link para trocar o valor.</p>` : ''}
    ${!isStatic ? `<label>Chave de consulta<input data-fb-prop="key" value="${h(field.key)}" maxlength="40"${kind.key ? ' readonly' : ''} aria-describedby="fb-key-help"></label><small id="fb-key-help" class="dim">${kind.key ? 'Fixa para este tipo de campo.' : 'Gerada pelo rótulo ao salvar.'} Preenche o campo pelo link: <code>?${h(field.key || 'chave')}=…</code></small>` : ''}
    ${!isStatic && !isHidden ? `<label>Texto de ajuda<input data-fb-prop="help" value="${h(field.help)}" maxlength="300"></label>` : ''}
    ${!isStatic ? `<fieldset class="fb-width"><legend>Largura</legend>${[[100, 'Inteira'], [50, 'Metade']].map(([w, label]) => `<label><input type="radio" name="fb-width" data-fb-prop="width" value="${w}"${field.width === w ? ' checked' : ''}> ${label}</label>`).join('')}</fieldset>` : ''}
    ${!isStatic && !isHidden ? `<div class="fb-checks">${check('required', 'Obrigatório', field.required, field.hidden ? ' disabled' : '')}${check('hidden', 'Oculto', field.hidden)}</div>` : ''}
    <div class="fb-props-foot"><button type="button" class="secondary" data-fb-dup="${field.id}">Duplicar</button><button type="button" class="secondary danger" data-fb-del="${field.id}">Excluir campo</button></div></aside>`;
}

function scoreEditor(field) {
  const scores = field.scores || {};
  return `<fieldset class="fb-score"><legend>Pontos por resposta</legend>${field.options.map((option, index) => `<label><span>${h(option)}</span><input type="number" step="1" min="-1000" max="1000" data-fb-score="${index}" value="${scores[option] ?? ''}" placeholder="0" aria-label="Pontos para ${h(option)}"></label>`).join('')}
    <label class="fb-category">Categoria <small class="dim">opcional</small><input data-fb-prop="category" value="${h(field.category || '')}" maxlength="40" placeholder="Ex. Conteúdo"></label></fieldset>`;
}

// Where each answer leads: the next step (default), a later step, or the end.
function logicEditor(field) {
  const list = fb.draft.fields, at = list.indexOf(field);
  const later = list.map((item, index) => ({ item, index })).filter(({ item, index }) => item.type === 'break' && index > at);
  const step = item => `Etapa ${list.filter(other => other.type === 'break').indexOf(item) + 2}${item.label ? ` · ${item.label}` : ''}`;
  const rule = option => field.logic?.find(entry => entry.option === option)?.to || '';
  return `<fieldset class="fb-logic"><legend>Depois desta resposta</legend>${field.options.map((option, index) => `<label><span>${h(option)}</span><select data-fb-logic="${index}" aria-label="Destino de ${h(option)}">
      <option value="">Próxima etapa</option>${later.map(({ item }) => `<option value="${item.id}"${rule(option) === item.id ? ' selected' : ''}>${h(step(item))}</option>`).join('')}<option value="end"${rule(option) === 'end' ? ' selected' : ''}>Ir para o envio</option></select></label>`).join('')}
    ${later.length ? '' : '<p class="dim">Adicione uma “Nova etapa” depois desta pergunta para criar desvios.</p>'}</fieldset>`;
}

function scoringHtml() {
  const d = fb.draft, most = scoreOf({ kind: 'quiz', fields: d.fields, tiers: d.tiers }, {}).max;
  return `<div class="fb-settings fb-scoring">
    <section class="surface padded"><h2>Como a pontuação funciona</h2><p class="dim">Cada resposta vale os pontos definidos nas propriedades da pergunta. O resultado é a soma dos pontos sobre o máximo possível${most ? ` (hoje, <b>${most} pontos</b>)` : ''}, em porcentagem. A faixa define a mensagem, o botão e a tag que o contato recebe.</p>
      ${most ? '' : '<p class="fb-warn">Nenhuma pergunta tem pontos ainda. Selecione uma pergunta de escolha no editor e preencha “Pontos por resposta”.</p>'}</section>
    ${d.tiers.map((tier, index) => `<section class="surface padded fb-tier"><div class="fb-tier-head"><h2>Faixa ${index + 1}</h2>${d.tiers.length > 1 ? `<button type="button" class="secondary danger" data-fb-tier-del="${index}">Remover</button>` : ''}</div>
      <div class="fb-three"><label>Nome<input data-fb-tier="${index}" data-key="name" value="${h(tier.name)}" maxlength="40"></label><label>De (%)<input type="number" min="0" max="100" data-fb-tier="${index}" data-key="min" value="${tier.min}"></label><label>Até (%)<input type="number" min="0" max="100" data-fb-tier="${index}" data-key="max" value="${tier.max}"></label></div>
      <label>Mensagem do resultado<textarea rows="2" data-fb-tier="${index}" data-key="message" maxlength="600">${h(tier.message)}</textarea></label>
      <div class="fb-three"><label>Texto do botão<input data-fb-tier="${index}" data-key="ctaLabel" value="${h(tier.ctaLabel)}" maxlength="60" placeholder="Agendar conversa"></label><label>Link do botão<input type="url" data-fb-tier="${index}" data-key="ctaUrl" value="${h(tier.ctaUrl)}" maxlength="600" placeholder="https://"></label><label>Tag no contato<input data-fb-tier="${index}" data-key="tag" value="${h(tier.tag)}" maxlength="48" placeholder="quiz-${h(norm(tier.name).replace(/[^a-z0-9]+/g, '-'))}"></label></div></section>`).join('')}
    ${d.tiers.length < 10 ? `<button type="button" class="secondary" data-fb-tier-add>${icon('plus', 15)} Adicionar faixa</button>` : ''}</div>`;
}

// Perguntas de escolha, as únicas que decidem destino.
const choiceFields = () => fb.draft.fields.filter(field => ['select', 'radio', 'multiselect', 'checkbox', 'custom'].includes(field.type) && field.options?.length);
function routesHtml(c) {
  const d = fb.draft, fields = choiceFields(), quiz = d.kind === 'quiz';
  // "campo|opção" ou "faixa": uma lista só, para a regra caber em uma linha.
  const when = rule => rule.when === 'tier' ? `tier|${rule.tier}` : `${rule.fieldId}|${rule.option}`;
  const options = rule => `<option value="">Escolha a resposta</option>${quiz ? `<optgroup label="Resultado">${d.tiers.map(tier => `<option value="${h(`tier|${tier.name}`)}"${when(rule) === `tier|${tier.name}` ? ' selected' : ''}>Faixa ${h(tier.name)}</option>`).join('')}</optgroup>` : ''}${fields.map(field => `<optgroup label="${h(field.label)}">${field.options.map(option => `<option value="${h(`${field.id}|${option}`)}"${when(rule) === `${field.id}|${option}` ? ' selected' : ''}>${h(option)} · ${h(field.label.length > 44 ? `${field.label.slice(0, 43)}…` : field.label)}</option>`).join('')}</optgroup>`).join('')}`;
  return `<section class="surface padded"><h2>Destino por resposta</h2><p class="dim">Separe quem segue para a reunião de quem vai para outra página. Quem cair numa regra de desqualificação não conta como Lead no pixel nem recebe o link da agenda, e essa regra vale antes das outras.</p>
    ${d.routes.map((rule, index) => `<div class="fb-route"><div class="fb-tier-head"><h3>Regra ${index + 1}</h3><button type="button" class="secondary danger" data-fb-route-del="${index}">Remover</button></div>
      <div class="fb-two"><label>Quando a resposta for<select data-fb-route="${index}" data-key="when">${options(rule)}</select></label><label>Tag no contato<input data-fb-route="${index}" data-key="tag" value="${h(rule.tag)}" maxlength="48" placeholder="Ex.: lead-qualificado"></label></div>
      <label class="check"><input type="checkbox" data-fb-route="${index}" data-key="disqualify"${rule.disqualify ? ' checked' : ''}> Lead desqualificado</label>
      ${destinationField(c, rule.dest, { attrs: key => `data-fb-route="${index}" data-key="dest.${key}"`, actions: rule.disqualify ? ['message', 'redirect', 'page'] : ['default', 'message', 'redirect', 'page', 'booking'] })}</div>`).join('')}
    ${fields.length || quiz ? (d.routes.length < 30 ? `<button type="button" class="secondary" data-fb-route-add>${icon('plus', 15)} Adicionar regra</button>` : '') : '<p class="fb-warn">Adicione uma pergunta de escolha (lista, opção única ou caixas) para criar regras.</p>'}</section>`;
}

function settingsHtml(c) {
  const d = fb.draft, s = d.onSubmit, sch = d.schedule;
  const local = iso => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
  return `<div class="fb-settings">
    <section class="surface padded"><h2>Ao enviar</h2>
      ${destinationField(c, s, { attrs: key => `data-fb-dest="${key}"`, label: 'Depois do envio' })}
      <p class="dim">Formulários incorporados levam a página inteira para o destino.</p></section>
    ${routesHtml(c)}
    <section class="surface padded"><h2>Contato</h2><p class="dim">Cada envio cria o contato (ou atualiza o existente pelo e-mail ou telefone) e dispara os fluxos com o gatilho “Formulário enviado”.</p>
      <label>Tags para adicionar ao contato<input data-fb-set="addTags" value="${h(d.addTags.join(', '))}" placeholder="lead-site, orcamento" maxlength="400"></label></section>
    <section class="surface padded"><h2>Período de respostas</h2><p class="dim">Fora do período, o formulário mostra a mensagem abaixo no lugar dos campos.</p>
      <div class="fb-two"><label>Início<input type="datetime-local" data-fb-set="schedule.start" value="${local(sch.start)}"></label><label>Fim<input type="datetime-local" data-fb-set="schedule.end" value="${local(sch.end)}"></label></div>
      <label>Mensagem fora do período<input data-fb-set="schedule.closedMessage" value="${h(sch.closedMessage)}" maxlength="300" placeholder="Este formulário não está recebendo respostas agora."></label></section></div>`;
}

function integrateHtml(c, form) {
  const link = absolute(formUrl(c, form));
  const id = `graao-form-${form.id.slice(0, 8)}`;
  const embed = `<iframe id="${id}" src="${link}?embed=1" title="${form.name.replace(/"/g, '')}" style="width:100%;border:0;min-height:420px" loading="lazy"></iframe>\n<script>addEventListener('message',e=>{if(e.data&&e.data.graaoForm==='${form.id}'){document.getElementById('${id}').style.height=e.data.height+'px'}})</script>`;
  if (!form.active) return `<div class="surface empty fb-integrate-off">${icon('lock', 24)}<strong>Publique o formulário para compartilhar</strong><p>O link e o código de incorporação funcionam depois de publicar.</p><button class="primary" data-fb-publish="on">Publicar formulário</button></div>`;
  return `<div class="fb-integrate"><div class="fb-integrate-side">
      <section class="surface padded"><h2>${icon('link', 16)} Link direto</h2><p class="dim">Página própria do formulário. Use os parâmetros para preencher campos, ex.: <code>?email=ana@exemplo.com</code>.</p>
        <div class="fb-copy"><input readonly value="${h(link)}" aria-label="Link do formulário"><button class="secondary" data-fb-copy="${h(link)}">Copiar</button><a class="secondary" href="${h(link)}" target="_blank" rel="noopener">${icon('external', 14)} Abrir</a></div></section>
      <section class="surface padded"><h2>${icon('site', 16)} Incorporar em um site</h2><p class="dim">Cole no HTML do seu site. A altura se ajusta sozinha ao conteúdo.</p>
        <textarea readonly rows="6" class="fb-code" aria-label="Código de incorporação">${h(embed)}</textarea><button class="secondary" data-fb-copy="${h(embed)}">Copiar código</button></section></div>
    <section class="surface padded fb-embed-preview"><h2>Prévia incorporada</h2><iframe src="${formUrl(c, form)}?embed=1&preview=1" title="Prévia do formulário incorporado" data-form-frame="${form.id}"></iframe></section></div>`;
}

function builderView(c) {
  const form = loadDraft(c);
  if (!form) return `<div class="page sites-page"><div class="surface empty"><strong>Não encontrado</strong><p>Pode ter sido excluído.</p><a class="primary" href="#sites/forms">Voltar aos formulários</a></div></div>`;
  const d = fb.draft, k = KINDS[d.kind];
  const sections = [['edit', 'Editar'], ...(d.kind === 'quiz' ? [['scoring', 'Pontuação']] : []), ['settings', 'Configurações'], ['integrate', 'Integrar'], ['results', 'Envios'], ['analytics', 'Análises']];
  if (!sections.some(([id]) => id === fb.section)) fb.section = 'edit';
  const body = fb.section === 'settings' ? settingsHtml(c) : fb.section === 'scoring' ? scoringHtml() : fb.section === 'integrate' ? integrateHtml(c, form)
    : fb.section === 'results' ? `<div class="fb-results">${submissionsTable(c, form.id, d.kind)}</div>`
    : fb.section === 'analytics' ? `<div class="fb-results">${stats(c, form.id)}${d.kind === 'quiz' ? tierTable(subsOf(c, form.id)) : ''}</div>`
    : `<div class="fb-edit dw-columns">${paletteHtml(c)}${designStage({ label: '<span data-fb-board-name>' + h(d.name) + '</span>', width: 640, content: canvasHtml(c),
      tools: `<button type="button" data-fb-palette="quick" aria-pressed="${fb.palette === 'quick'}" title="Adicionar campos">${icon('plus',15)} Campos</button>` })}${propsHtml(c)}</div>`;
  return `<div class="fb dw-workspace">
    <header class="fb-top dw-header"><a class="secondary fb-back" href="#sites/${k.list}">${icon('left', 15)} ${k.Many}</a>
      <div class="fb-title"><h1>${h(d.name)}</h1>${form.active ? badge(k.fem ? 'Publicada' : 'Publicado', 'green') : badge('Rascunho')}${fb.dirty ? badge('Alterações não salvas', 'blue') : ''}</div>
      <div class="fb-top-actions">${form.active ? `<a class="secondary" href="${formUrl(c, form)}" target="_blank" rel="noopener">${icon('external', 14)} Ver publicado</a>` : `<a class="secondary" href="${formUrl(c, form)}?preview=1" target="_blank" rel="noopener">${icon('external', 14)} Prévia</a>`}
        <button class="secondary" data-fb-publish="${form.active ? 'off' : 'on'}">${form.active ? 'Despublicar' : 'Publicar'}</button>
        <button class="primary" data-fb-save${fb.dirty ? '' : ' disabled'}>Salvar</button><button class="icon-btn" data-fb-delete aria-label="Excluir ${k.one}" title="Excluir ${k.one}">${icon('trash', 16)}</button></div></header>
    <nav class="fb-sections" aria-label="Seções do formulário">${sections.map(([id, label]) => `<button class="${fb.section === id ? 'selected' : ''}" aria-current="${fb.section === id ? 'page' : 'false'}" data-fb-section="${id}">${label}</button>`).join('')}</nav>
    ${body}</div>`;
}

export function formsScreen(c) {
  if (c.tab === 'form') return builderView(c);
  const kind = kindForTab(c.tab), k = KINDS[kind];
  if (c.tab === k.analytics) return analyticsView(c, kind);
  if (c.tab === k.subs) return formsPage(c, submissionsTable(c, '', kind), '', kind);
  return listView(c, kind);
}

export function afterFormsRender() {
  mountDesignStage(document.querySelector('.fb .dw-stage'), fb.viewport);
}

/* ───────── Ações ───────── */

function dialog(title, body, submitLabel, onSubmit) {
  const overlay = document.getElementById('overlay');
  overlay.innerHTML = `<dialog id="dialog" class="site-dialog fm-dialog" aria-labelledby="fm-title"><header><div><h2 id="fm-title">${h(title)}</h2></div><button class="icon-btn" type="button" aria-label="Fechar" data-fm-close>${icon('close', 17)}</button></header>
    <form data-fm-dialog><div class="modal-body">${body}<p class="form-status" role="alert"></p></div><footer><button type="button" class="secondary" data-fm-close>Cancelar</button><button class="primary">${h(submitLabel)}</button></footer></form></dialog>`;
  const el = document.getElementById('dialog');
  el.showModal();
  el.querySelector('input:not([type=radio]),textarea')?.focus();
  el.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const status = el.querySelector('.form-status'), button = el.querySelector('button.primary');
    button.disabled = true; status.textContent = '';
    try { await onSubmit(Object.fromEntries(new FormData(event.target))); closeDialog(); }
    catch (error) { status.textContent = error.message; button.disabled = false; }
  });
}
const closeDialog = () => { const overlay = document.getElementById('overlay'); overlay.querySelector('dialog')?.close(); overlay.innerHTML = ''; };

function csv(c, formId, kind) {
  const list = subsOf(c, formId, kind);
  const labels = [...new Set(list.flatMap(sub => (sub.answers || []).map(a => a.label)))];
  const cell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const formName = id => c.s.forms.find(form => form.id === id)?.name || '';
  const lines = [['Recebido', 'Formulário', 'Nome', 'E-mail', 'Telefone', 'Origem', ...labels].map(cell).join(',')];
  for (const sub of list) {
    const map = Object.fromEntries((sub.answers || []).map(a => [a.label, a.value]));
    lines.push([sub.created, formName(sub.formId), sub.name, sub.email, sub.phone, sub.source || 'Link', ...labels.map(label => map[label] ?? '')].map(cell).join(','));
  }
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `envios-${formId ? norm(formName(formId)).replace(/[^a-z0-9]+/g, '-') : 'formularios'}.csv` });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function setPath(target, path, value) {
  const keys = path.split('.');
  let node = target;
  for (const key of keys.slice(0, -1)) node = node[key];
  node[keys.at(-1)] = value;
}

export function installForms(environment) {
  env = environment;
  const { c, mutate, flash } = env;
  // Re-render keeping the palette and properties panels where the user left them.
  const render = () => {
    const keep = ['.fb-palette', '.fb-props'].map(sel => [sel, document.querySelector(sel)?.scrollTop || 0]);
    env.render();
    for (const [sel, top] of keep) { const el = document.querySelector(sel); if (el) el.scrollTop = top; }
  };
  const current = () => c.s.forms.find(item => item.id === fb.id);
  const inBuilder = () => c.view === 'sites' && c.tab === 'form';
  // Marks unsaved changes without re-rendering, so the field being typed in keeps focus.
  const touch = () => {
    if (fb.dirty) return;
    fb.dirty = true;
    const save = document.querySelector('[data-fb-save]'); if (save) save.disabled = false;
    document.querySelector('.fb-title')?.insertAdjacentHTML('beforeend', badge('Alterações não salvas', 'blue'));
  };
  const repaintCanvas = () => { const list = document.querySelector('[data-fb-list]'); if (list) list.innerHTML = canvasItems(c); const sheet = document.querySelector('.fb-sheet'); if (sheet) sheet.style.setProperty('--sf-accent', fb.draft.accent); };

  function addField(type, customId, at) {
    const field = type === 'custom' ? (() => { const custom = (c.s.customFields || []).find(item => item.id === customId); return newField('custom', { label: custom?.name || 'Campo', customId, placeholder: custom?.placeholder || '', key: (custom?.key || '').split('.').pop()?.replace(/-/g, '_') || '' }); })() : newField(type);
    const index = at === undefined || at < 0 ? fb.draft.fields.length : at;
    fb.draft.fields.splice(index, 0, field);
    fb.selected = field.id; fb.dirty = true; render();
  }

  async function save(extra = {}) {
    const d = fb.draft, form = current();
    const fields = validFields(d.fields, c.s.customFields || [], d.kind);
    const data = { name: d.name.trim() || form.name, description: d.description, active: form.active, askPhone: form.askPhone, kind: d.kind, fields, button: d.button, accent: d.accent, showTitle: d.showTitle,
      addTags: d.addTags, onSubmit: d.onSubmit, routes: d.routes, schedule: d.schedule, ...(d.kind !== 'form' ? { oneAtATime: d.oneAtATime } : {}), ...(d.kind === 'quiz' ? { tiers: d.tiers } : {}), ...extra };
    await mutate({ type: 'save', key: 'forms', id: form.id, data });
    fb.dirty = false; fb.rev = '';
  }

  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-fm-new],[data-fm-close],[data-fm-range],[data-fm-open],[data-fm-csv],[data-fm-contact],[data-fb-add],[data-fb-palette],[data-fb-section],[data-fb-item],[data-fb-select],[data-fb-layer],[data-fb-move],[data-fb-dup],[data-fb-del],[data-fb-save],[data-fb-publish],[data-fb-delete],[data-fb-copy],[data-fb-tier-add],[data-fb-tier-del],[data-fb-route-add],[data-fb-route-del]');
    if (!target || !(c.view === 'sites' || target.closest('#overlay'))) return;
    const d = target.dataset;
    try {
      if ('fmClose' in d) { closeDialog(); return; }
      if ('fmNew' in d) {
        const kind = KINDS[d.fmNew] ? d.fmNew : 'form', k = KINDS[kind], templates = templatesFor(kind);
        const blankText = { form: 'Nome e e-mail para você montar o resto.', survey: 'Uma pergunta e os dados de contato.', quiz: 'Uma pergunta com pontos e os dados de contato.' }[kind];
        dialog(k.New, `<label>Nome<input name="name" required maxlength="120" placeholder="Ex. ${h(templates[0].name)}"></label>
          <fieldset class="fm-templates"><legend>Começar com</legend>
            <label class="fm-template"><input type="radio" name="template" value="" checked><span><b>Em branco</b><small>${blankText}</small></span></label>
            ${templates.map(t => `<label class="fm-template"><input type="radio" name="template" value="${t.id}"><span><b>${h(t.name)}</b><small>${h(t.description)}</small></span></label>`).join('')}</fieldset>`,
          `Criar ${k.one}`, async data => {
            const template = templates.find(t => t.id === data.template);
            const name = data.name?.trim() || template?.name;
            if (!name) throw new Error(`Dê um nome ${k.fem ? 'à' : 'ao'} ${k.one}.`);
            const fields = template ? template.build() : kind === 'quiz'
              ? [newField('radio', { label: 'Primeira pergunta / Primera pregunta', key: 'pergunta_1', required: true, options: ['Resposta A / Respuesta A', 'Resposta B / Respuesta B', 'Resposta C / Respuesta C'], scores: { 'Resposta A / Respuesta A': 0, 'Resposta B / Respuesta B': 5, 'Resposta C / Respuesta C': 10 } }), newField('break', { label: 'Seus dados / Tus datos' }), newField('name', { required: true }), newField('email')]
              : kind === 'survey' ? [newField('radio', { label: 'Primeira pergunta / Primera pregunta', key: 'pergunta_1', required: true }), newField('break', { label: 'Seus dados / Tus datos' }), newField('name', { required: true }), newField('email')]
              : [newField('name', { required: true }), newField('email')];
            const id = await mutate({ type: 'save', key: 'forms', data: { name, description: '', active: false, kind, fields, button: kind === 'quiz' ? 'Ver meu resultado / Ver mi resultado' : 'Enviar',
              ...(kind === 'quiz' ? { tiers: defaultTiers } : {}) } });
            Object.assign(fb, { id: '', section: 'edit', selected: '' });
            location.hash = `#sites/form/${id}`; flash(`${k.One} criad${k.fem ? 'a' : 'o'}. Ajuste e publique.`);
          });
        return;
      }
      if ('fbTierAdd' in d) { const last = fb.draft.tiers.at(-1); fb.draft.tiers.push({ name: 'Nova faixa', min: Math.min(100, (last?.max ?? -1) + 1), max: 100, message: '', ctaLabel: '', ctaUrl: '', tag: '' }); fb.dirty = true; render(); return; }
      if (d.fbTierDel) { fb.draft.tiers.splice(Number(d.fbTierDel), 1); fb.dirty = true; render(); return; }
      if ('fbRouteAdd' in d) { fb.draft.routes.push({ when: 'answer', fieldId: '', option: '', tag: '', disqualify: false, dest: { action: 'default' } }); fb.dirty = true; render(); document.querySelector(`[data-fb-route="${fb.draft.routes.length - 1}"]`)?.focus(); return; }
      if (d.fbRouteDel) { fb.draft.routes.splice(Number(d.fbRouteDel), 1); fb.dirty = true; render(); return; }
      if (d.fmRange) { fb.range = Number(d.fmRange); render(); return; }
      if (d.fmOpen) { fb.open = fb.open === d.fmOpen ? '' : d.fmOpen; render(); return; }
      if ('fmCsv' in d) { csv(c, d.fmCsv, d.kind); return; }
      if (d.fmContact) { event.preventDefault(); location.hash = '#contacts'; return; }
      if (!inBuilder()) return;
      if (d.fbPalette) { fb.palette = d.fbPalette; render(); document.querySelector(`.fb-palette [data-fb-palette="${d.fbPalette}"]`)?.focus({ preventScroll: true }); return; }
      if (d.fbSection) {
        if (d.fbSection === fb.section) return;
        fb.section = d.fbSection; fb.open = ''; render(); return;
      }
      if (d.fbAdd) { addField(d.fbAdd, d.custom); return; }
      if (d.fbMove) {
        const list = fb.draft.fields, i = list.findIndex(f => f.id === d.id), j = i + Number(d.fbMove);
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]]; fb.dirty = true; render(); return;
      }
      if (d.fbDup) {
        const i = fb.draft.fields.findIndex(f => f.id === d.fbDup), source = fb.draft.fields[i];
        if (fieldKinds[source.type].key && source.type !== 'source') { flash('Este campo só pode aparecer uma vez.', true); return; }
        const copy = { ...structuredClone(source), id: newField('text').id, key: '', label: `${source.label} (cópia)` };
        fb.draft.fields.splice(i + 1, 0, copy); fb.selected = copy.id; fb.dirty = true; render(); return;
      }
      if (d.fbDel) { fb.draft.fields = fb.draft.fields.filter(f => f.id !== d.fbDel); if (fb.selected === d.fbDel) fb.selected = ''; fb.dirty = true; render(); return; }
      if ('fbSelect' in d) { fb.selected = d.fbSelect; render(); return; }
      if (d.fbLayer) {
        fb.selected = d.fbLayer; render();
        document.querySelector(`[data-fb-layer="${CSS.escape(d.fbLayer)}"]`)?.focus({ preventScroll: true });
        document.querySelector(`[data-fb-item="${CSS.escape(d.fbLayer)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        return;
      }
      if (d.fbItem) { if (event.target.closest('.fb-tools')) return; fb.selected = d.fbItem; render(); return; }
      if (d.fbCopy) { await navigator.clipboard.writeText(d.fbCopy); flash('Copiado.'); return; }
      if ('fbSave' in d) { target.disabled = true; await save(); render(); flash('Formulário salvo.'); return; }
      if (d.fbPublish) {
        target.disabled = true;
        await save({ active: d.fbPublish === 'on' });
        render(); flash(d.fbPublish === 'on' ? 'Formulário publicado.' : 'Formulário fora do ar.'); return;
      }
      if ('fbDelete' in d) {
        const form = current();
        const count = subsOf(c, form.id).length;
        dialog(`Excluir ${KINDS[kindOf(form)].one}?`, `<p>“${h(form.name)}” sai do ar e deixa de receber respostas. ${count ? `Os ${count} envios já recebidos continuam em Envios.` : ''} Isso não pode ser desfeito.</p>`, 'Excluir', async () => {
          await mutate({ type: 'delete', key: 'forms', id: form.id });
          Object.assign(fb, { id: '', dirty: false, draft: null });
          location.hash = `#sites/${KINDS[kindOf(form)].list}`; flash('Excluído.');
        });
      }
    } catch (error) { flash(error.message, true); render(); }
  });

  document.addEventListener('keydown', event => {
    const item = event.target.closest?.('[data-fb-item]');
    if (!item || event.target !== item || !inBuilder()) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fb.selected = item.dataset.fbItem; render(); document.querySelector(`[data-fb-item="${item.dataset.fbItem}"]`)?.focus(); }
  });

  document.addEventListener('input', event => {
    const el = event.target;
    if (el.matches?.('[data-fm-search]')) {
      fb.query = el.value; const at = el.selectionStart; render();
      const next = document.querySelector('[data-fm-search]'); next?.focus(); next?.setSelectionRange(at, at); return;
    }
    if (!inBuilder() || !fb.draft) return;
    if (el.dataset.fbProp) {
      const field = fb.draft.fields.find(f => f.id === fb.selected);
      if (!field) return;
      const prop = el.dataset.fbProp;
      if (prop === 'options') field.options = el.value.split('\n').map(v => v.trim()).filter(Boolean);
      else if (prop === 'width') field.width = Number(el.value);
      else if (el.type === 'checkbox') { field[prop] = el.checked; if (prop === 'hidden' && el.checked) field.required = false; }
      else field[prop] = el.value;
      repaintCanvas(); touch();
      const layers = document.querySelector('[data-fb-layers]'); if (layers) layers.innerHTML = formLayers();
      if (el.type === 'checkbox' || el.type === 'radio') { render(); document.querySelector(el.type === 'radio' ? `[data-fb-prop="${prop}"][value="${el.value}"]` : `[data-fb-prop="${prop}"]`)?.focus(); }
      return;
    }
    if (el.dataset.fbScore !== undefined) {
      const field = fb.draft.fields.find(f => f.id === fb.selected), option = field?.options[Number(el.dataset.fbScore)];
      if (!field || option === undefined) return;
      field.scores = { ...(field.scores || {}) };
      if (el.value === '') delete field.scores[option]; else field.scores[option] = Number(el.value);
      touch(); return;
    }
    if (el.dataset.fbLogic !== undefined) {
      const field = fb.draft.fields.find(f => f.id === fb.selected);
      if (!field) return;
      field.logic = [...document.querySelectorAll('[data-fb-logic]')].map(select => ({ option: field.options[Number(select.dataset.fbLogic)], to: select.value })).filter(rule => rule.option !== undefined && rule.to);
      touch(); return;
    }
    if (el.dataset.fbTier !== undefined) {
      const tier = fb.draft.tiers[Number(el.dataset.fbTier)];
      if (!tier) return;
      tier[el.dataset.key] = ['min', 'max'].includes(el.dataset.key) ? Number(el.value) : el.value;
      touch(); return;
    }
    if (el.dataset.fbDest) {
      fb.draft.onSubmit = readDestination(key => document.querySelector(`[data-fb-dest="${key}"]`)?.value);
      touch(); return;
    }
    if (el.dataset.fbRoute !== undefined) {
      const index = Number(el.dataset.fbRoute), rule = fb.draft.routes[index], key = el.dataset.key;
      if (!rule) return;
      if (key === 'when') {
        const cut = el.value.indexOf('|'), first = el.value.slice(0, cut), rest = el.value.slice(cut + 1);
        Object.assign(rule, cut < 0 ? { when: 'answer', fieldId: '', option: '' } : first === 'tier' ? { when: 'tier', tier: rest } : { when: 'answer', fieldId: first, option: rest });
      }
      else if (key === 'disqualify') {
        rule.disqualify = el.checked;
        if (rule.disqualify && ['default', 'booking'].includes(rule.dest.action)) rule.dest = { ...rule.dest, action: 'message' };
        fb.dirty = true; render(); document.querySelector(`[data-fb-route="${index}"][data-key="disqualify"]`)?.focus(); return;
      }
      else if (key === 'tag') rule.tag = el.value;
      else rule.dest = readDestination(part => document.querySelector(`[data-fb-route="${index}"][data-key="dest.${part}"]`)?.value);
      touch(); return;
    }
    if (el.dataset.fbForm) {
      const key = el.dataset.fbForm;
      fb.draft[key] = el.type === 'checkbox' ? el.checked : el.value;
      if (key === 'name') for (const title of document.querySelectorAll('.fb-title h1, [data-fb-board-name]')) title.textContent = el.value;
      if (key === 'accent') el.nextElementSibling.textContent = el.value;
      if (['showTitle', 'name', 'description', 'button'].includes(key)) { const sheet = document.querySelector('.fb-canvas'); if (sheet) sheet.outerHTML = canvasHtml(c); }
      else repaintCanvas();
      touch(); return;
    }
    if (el.dataset.fbSet) {
      const key = el.dataset.fbSet;
      let value = el.value;
      if (key === 'addTags') value = value.split(',').map(v => v.trim()).filter(Boolean);
      if (key.startsWith('schedule.') && key !== 'schedule.closedMessage') value = value ? new Date(value).toISOString() : '';
      setPath(fb.draft, key, value);
      touch();
    }
  });

  document.addEventListener('change', event => {
    if (event.target.matches?.('[data-fm-filter]')) { fb.formFilter = event.target.value; fb.open = ''; render(); }
  });

  // Drag from the palette to a position, or drag a field to reorder.
  document.addEventListener('dragstart', event => {
    if (!inBuilder()) return;
    const tile = event.target.closest?.('[data-fb-add]'), item = event.target.closest?.('[data-fb-item]');
    if (tile && !tile.disabled) fb.drag = { add: tile.dataset.fbAdd, custom: tile.dataset.custom };
    else if (item) fb.drag = { move: item.dataset.fbItem };
    else return;
    event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', 'field');
  });
  const dropIndex = event => {
    const items = [...document.querySelectorAll('[data-fb-item]')];
    const hit = items.find(item => { const r = item.getBoundingClientRect(); return event.clientY < r.top + r.height / 2 && event.clientX < r.right + 8; });
    return hit ? items.indexOf(hit) : items.length;
  };
  document.addEventListener('dragover', event => {
    if (!fb.drag || !event.target.closest?.('.fb-canvas')) return;
    event.preventDefault();
    document.querySelectorAll('.fb-drop-before').forEach(el => el.classList.remove('fb-drop-before'));
    const items = document.querySelectorAll('[data-fb-item]'), at = dropIndex(event);
    items[at]?.classList.add('fb-drop-before');
    document.querySelector('[data-fb-list]')?.classList.toggle('fb-drop-end', at === items.length);
  });
  document.addEventListener('drop', event => {
    if (!fb.drag || !event.target.closest?.('.fb-canvas')) return;
    event.preventDefault();
    const at = dropIndex(event), drag = fb.drag; fb.drag = null;
    if (drag.add) { addField(drag.add, drag.custom, at); return; }
    const list = fb.draft.fields, from = list.findIndex(f => f.id === drag.move);
    if (from < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(at > from ? at - 1 : at, 0, moved);
    fb.selected = moved.id; fb.dirty = true; render();
  });
  document.addEventListener('dragend', () => { fb.drag = null; document.querySelectorAll('.fb-drop-before').forEach(el => el.classList.remove('fb-drop-before')); document.querySelector('[data-fb-list]')?.classList.remove('fb-drop-end'); });

  // Embedded forms report their height.
  addEventListener('message', event => {
    if (event.origin !== location.origin || !event.data?.graaoForm) return;
    document.querySelectorAll(`[data-form-frame="${CSS.escape(event.data.graaoForm)}"]`).forEach(frame => { frame.style.height = `${Math.min(4000, event.data.height + 8)}px`; });
  });

  // Leaving the builder with unsaved changes asks first.
  let last = location.hash;
  addEventListener('hashchange', async () => {
    const was = last, to = location.hash; last = to;
    if (!fb.dirty || !was.startsWith(`#sites/form/${fb.id}`) || location.hash.startsWith(`#sites/form/${fb.id}`)) return;
    last = was; history.replaceState(null, '', was); dispatchEvent(new HashChangeEvent('hashchange'));
    if (!await ask('Descartar as alterações não salvas deste formulário?', { ok: 'Descartar', cancel: 'Continuar editando' })) return;
    fb.dirty = false; fb.rev = ''; fb.id = ''; location.hash = to;
  }, true);
  addEventListener('beforeunload', event => { if (fb.dirty && inBuilder()) event.preventDefault(); });
}
