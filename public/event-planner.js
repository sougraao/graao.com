import { icon as i } from './icons.js';
import { ask as askUser } from './ask.js';
import { eventGroups, galleryGroups, installTimeline, leavesNow, timelineHtml } from './event-timeline.js';
import { deliveryActive, deliveryOf, deliveryView, installEventSends, sendBanner, sendSummary, sendTools, sendable, targetsField } from './event-sends.js';
import { bindCopyEditor, copyEditorField, replaceText, whatsappHtml } from './event-copy-editor.js';
import {
  audiences, blankEventPlan, briefGroups, channels, eventPlanPhases, eventPlanStatuses,
  eventPlanTeams, eventStatusLabel, itemStatus, launchEventPlan,
  messageTemplates, phaseLabel, teamLabel
} from './event-planner-data.js';

const h = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const same = (a, b) => String(a || '') === String(b || '');
const optionRows = (rows, value) => rows.map(([id, label]) => `<option value="${h(id)}" ${same(id, value) ? 'selected' : ''}>${h(label)}</option>`).join('');
const dateLabel = value => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : '';
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const duration = total => `${Math.floor(total / 60)}h${String(total % 60).padStart(2, '0')}`;
const planOf = event => event?.plan && typeof event.plan === 'object' ? { brief: event.plan.brief || {}, items: Array.isArray(event.plan.items) ? event.plan.items : [] } : { brief: {}, items: [] };
const records = (event, kind) => planOf(event).items.filter(item => item.kind === kind);
const usersOf = c => c.agency?.users || [];
const primary = (label, attrs = '') => `<button class="primary" ${attrs}>${label}</button>`;
const metric = (label, value) => `<div class="surface metric"><span>${label}</span><b>${value}</b></div>`;
const empty = (title, text, icon) => `<div class="empty">${i(icon, 26)}<strong>${h(title)}</strong><p>${h(text)}</p></div>`;
const ui = { workspace: '', selectedId: '', section: 'strategy', phase: 'all', status: 'all', channel: 'all', events: 'active', view: 'cards', zoom: 'day' };

function reset(workspace) {
  if (ui.workspace === workspace) return;
  ui.workspace = workspace; ui.selectedId = ''; ui.events = 'active'; ui.view = 'cards'; openSection('strategy');
}
function openSection(section) { ui.section = section; ui.phase = 'all'; ui.status = 'all'; ui.channel = 'all'; }
function eventProgress(event) {
  const tasks = records(event, 'task'), messages = records(event, 'message'), links = records(event, 'link');
  return {
    tasks, done: tasks.filter(row => row.status === 'feito').length,
    messages, sent: messages.filter(row => row.status === 'enviado').length,
    links, ready: links.filter(row => row.status === 'pronto').length,
    minutes: records(event, 'agenda').reduce((sum, row) => sum + numeric(row.duration), 0)
  };
}

/* ── Linha do tempo ── */
const todayOf = c => new Intl.DateTimeFormat('en-CA', { timeZone: c.s.profile?.timezone || 'America/Sao_Paulo' }).format(new Date());
const toggle = (attr, rows, current) => `<span class="ep-toggle" role="group">${rows.map(([value, label]) => `<button type="button" ${attr}="${value}" aria-pressed="${value === current}">${label}</button>`).join('')}</span>`;
const timelineTools = () => `<span class="ep-send-tools">${toggle('data-ep-tl-zoom', [['day', 'Dia'], ['week', 'Semana']], ui.zoom)}<button type="button" class="secondary" data-ep-tl-today>${i('k', 15)} Hoje</button></span>`;
const timeline = (c, groups) => timelineHtml({ groups, zoom: ui.zoom, today: todayOf(c) });

/* ── Galeria ── */
const eventBadge = { em_andamento: ' blue', concluido: ' green' };
function eventCard(event) {
  const p = eventProgress(event), total = p.tasks.length, percent = total ? Math.round(p.done / total * 100) : 0, key = h(event.id);
  return `<article class="surface ep-card"><button type="button" class="ep-card-body" data-ep-open="${key}"><span class="ep-card-meta"><span class="badge${eventBadge[event.status] || ''}">${h(eventStatusLabel(event.status))}</span><span>${h(dateLabel(event.eventDate) || 'Data a definir')}</span></span><strong class="ep-card-title">${h(event.title)}</strong><span class="ep-card-stats"><span>${total ? `${p.done} de ${total} ${total === 1 ? 'tarefa concluída' : 'tarefas concluídas'}` : 'Sem tarefas'}</span><span><b>${p.sent}/${p.messages.length}</b> mensagens</span><span><b>${p.ready}/${p.links.length}</b> links</span></span><span class="ep-progress" aria-hidden="true"><span style="width:${percent}%"></span></span></button><div class="ep-card-actions" role="group" aria-label="Ações para ${h(event.title)}"><button type="button" class="secondary" data-ep-manage="rename" data-id="${key}">Renomear</button><button type="button" class="secondary" data-ep-manage="duplicate" data-id="${key}">Duplicar</button><button type="button" class="danger plain" data-ep-manage="delete" data-id="${key}">Apagar</button></div></article>`;
}
function gallery(c, pageShell, marketingTabs, shown = ui.view) {
  const all = c.s.eventPlans || [];
  const events = all
    .filter(event => ui.events === 'all' || (ui.events === 'active' ? event.status !== 'arquivado' : event.status === ui.events))
    .sort((a, b) => (a.eventDate || '9999').localeCompare(b.eventDate || '9999') || a.title.localeCompare(b.title, 'pt-BR'));
  const create = primary(`${i('plus', 16)} Novo evento`, 'type="button" data-ep-new');
  const nothing = all.length
    ? empty('Nenhum evento com este status', 'Troque o filtro para ver os outros eventos.', 'filter')
    : `<div class="empty">${i('k', 26)}<strong>Nenhum evento planejado</strong><p>Crie um plano com estratégia, tarefas, mensagens, roteiro e links do lançamento.</p>${create}</div>`;
  const filter = all.length ? `<div class="ep-toolbar"><label>Status<select data-ep-status-filter>${optionRows([['active', 'Ativos'], ['all', 'Todos'], ...eventPlanStatuses], ui.events)}</select></label><span class="spacer"></span>${shown === 'timeline' ? timelineTools() : ''}${toggle('data-ep-view', [['cards', 'Cartões'], ['timeline', 'Linha do tempo']], shown)}</div>` : '';
  return pageShell({ title: 'Planejador de eventos', desc: 'Organize estratégia, operação e comunicação de cada lançamento desta subconta.', className: 'ep', cta: create, tabs: { key: 'marketing', items: marketingTabs, current: 'events', label: 'Seções de marketing' }, content: `${filter}${shown === 'timeline' && events.length ? timeline(c, galleryGroups(events)) : `<section class="ep-gallery" aria-label="Eventos planejados">${events.map(eventCard).join('') || nothing}</section>`}` });
}

/* ── Seções do evento ── */
function ownerLabel(item, users) {
  const user = item.ownerId && users.find(row => row.id === item.ownerId);
  if (user) return user.name;
  if (item.ownerId && users.length) return `Usuário removido (${item.owner || 'sem nome'})`;
  return item.owner || '';
}
const meta = parts => `<p class="ep-item-meta">${parts.filter(Boolean).map(h).join(' · ')}</p>`;
const audienceLabel = item => item.channel === 'grupos' && item.audience ? audiences.find(([key]) => key === item.audience)?.[1] || '' : '';
const when = item => [dateLabel(item.date), item.time].filter(Boolean).join(' · ');
const byDate = (a, b) => (a.date || '9999').localeCompare(b.date || '9999') || (a.time || '99').localeCompare(b.time || '99') || a.title.localeCompare(b.title, 'pt-BR');
const note = item => item.notes ? `<p class="ep-note">${h(item.notes)}</p>` : '';
const visible = items => items.filter(item => (ui.phase === 'all' || item.phase === ui.phase) && (ui.status === 'all' || item.status === ui.status) && (item.kind !== 'message' || ui.channel === 'all' || item.channel === ui.channel));
const sectionHead = (title, text, action) => `<div class="ep-section-head"><div><h2>${title}</h2><p>${text}</p></div>${action}</div>`;
const newItem = (event, kind, label) => primary(`${i('plus', 15)} ${label}`, `type="button" data-ep-item-new="${kind}" data-ep-event="${h(event.id)}"`);
const nothingHere = (event, kind, text, icon) => empty(records(event, kind).length ? 'Nenhum item corresponde aos filtros' : 'Nenhum item nesta seção', text, icon);
function filterBar(kind) {
  const pick = (label, name, rows) => `<label>${label}<select data-ep-filter="${name}">${optionRows(rows, ui[name])}</select></label>`;
  return `<div class="surface ep-filter">${pick('Fase', 'phase', [['all', 'Todas'], ...eventPlanPhases])}${pick('Status', 'status', [['all', 'Todos'], ...itemStatus[kind]])}${kind === 'message' ? pick('Canal', 'channel', [['all', 'Todos'], ...channels]) : ''}</div>`;
}
// "Agendado" em mensagem de WhatsApp é a fila quem marca: na mão, pareceria que vai sair algo que não vai.
const manualStatuses = item => sendable(item) && item.status !== 'agendado' ? itemStatus.message.filter(([key]) => key !== 'agendado') : itemStatus[item.kind];
function itemTools(event, item, extra = '') {
  const ref = `data-ep-event="${h(event.id)}"`, title = h(item.title), delivery = deliveryOf(event, item), locked = item.kind === 'message' && (deliveryActive(delivery) || (delivery?.state === 'done' && delivery.sent > 0));
  return `<select aria-label="Status de ${title}" data-ep-item-status="${h(item.id)}" ${ref}${locked ? ` disabled title="${deliveryActive(delivery) ? 'Cancele o envio para mudar o status' : 'A mensagem já foi enviada'}"` : ''}>${optionRows(manualStatuses(item), item.status)}</select><span class="ep-item-actions">${extra}<button type="button" class="icon-btn" aria-label="Editar ${title}" title="Editar" data-ep-item-edit="${h(item.id)}" ${ref}>${i('edit', 15)}</button><button type="button" class="icon-btn" aria-label="Excluir ${title}" title="Excluir" data-ep-item-delete="${h(item.id)}" ${ref}>${i('trash', 15)}</button></span>`;
}

function strategySection(_c, event) {
  const { brief } = planOf(event);
  return `${sectionHead('Estratégia do evento', 'Alinhe o resultado que a equipe busca, com quem vai falar e o que vai oferecer.', '')}<div class="ep-blocks">${briefGroups.map(([key, title, fields]) => `<section class="surface ep-block" aria-labelledby="ep-brief-${key}"><header class="ep-block-head"><h3 id="ep-brief-${key}">${h(title)}</h3><button type="button" class="secondary" data-ep-brief-group="${key}" data-ep-event="${h(event.id)}" aria-label="Editar ${h(title)}">${i('edit', 15)} Editar</button></header><dl class="ep-facts">${fields.map(([name, label]) => `<div><dt>${h(label)}</dt>${brief[name] ? `<dd>${h(brief[name])}</dd>` : '<dd class="ep-missing">A definir</dd>'}</div>`).join('')}</dl></section>`).join('')}</div>`;
}
function tasksSection(c, event) {
  const rows = visible(records(event, 'task')).sort(byDate);
  return `${sectionHead('Tarefas', 'Acompanhe responsáveis, prazos e entregas por fase.', newItem(event, 'task', 'Nova tarefa'))}${filterBar('task')}<ul class="ep-list">${rows.map(item => `<li class="surface ep-item"><div class="ep-item-main"><h3>${h(item.title)}</h3>${meta([phaseLabel(item.phase), teamLabel(item.team), when(item) || 'Sem prazo', ownerLabel(item, usersOf(c))])}${note(item)}</div><div class="ep-item-side">${itemTools(event, item)}</div></li>`).join('')}</ul>${rows.length ? '' : nothingHere(event, 'task', 'Crie tarefas para transformar a estratégia em entregas.', 'check')}`;
}
function messagesSection(c, event) {
  const rows = visible(records(event, 'message')).sort(byDate), days = new Map();
  for (const item of rows) days.set(item.date || '', [...(days.get(item.date || '') || []), item]);
  const card = item => `<li class="surface ep-item"><div class="ep-item-main"><h3>${h(item.title)}</h3><p class="ep-item-meta">${item.code ? `<span class="ep-code">${h(item.code)}</span> ` : ''}${[(channels.find(([key]) => key === item.channel) || ['', 'Outro'])[1], audienceLabel(item), item.time, phaseLabel(item.phase), ownerLabel(item, usersOf(c))].filter(Boolean).map(h).join(' · ')}</p>${item.notes ? `<details data-ep-details="${h(item.id)}"><summary>Ver copy</summary><div class="ep-copy">${whatsappHtml(item.notes)}</div></details>` : '<p class="ep-note">Sem texto definido.</p>'}${deliveryView(c, event, item)}</div><div class="ep-item-side">${itemTools(event, item, `<button type="button" class="icon-btn" aria-label="Copiar texto de ${h(item.title)}" title="Copiar texto" data-ep-copy="${h(item.id)}" data-ep-event="${h(event.id)}">${i('copy', 15)}</button>`)}</div></li>`;
  const list = [...days].map(([day, items]) => `<section><h3 class="ep-day">${h(dateLabel(day) || 'Sem data')}</h3><ul class="ep-list">${items.map(card).join('')}</ul></section>`).join('');
  return `${sectionHead('Calendário de comunicação', 'Planeje a copy e acompanhe a publicação nos grupos e canais privados.', `<span class="ep-head-tools">${sendTools(c, event)}${newItem(event, 'message', 'Nova mensagem')}</span>`)}${sendBanner(c)}${filterBar('message')}${list || nothingHere(event, 'message', 'Adicione convites, avisos e acompanhamentos da campanha.', 'send')}`;
}
function agendaSection(c, event) {
  const rows = visible(records(event, 'agenda')).sort((a, b) => numeric(a.order) - numeric(b.order) || byDate(a, b));
  return `${sectionHead('Roteiro do dia', 'Organize a ordem, a duração e a condução de cada bloco.', newItem(event, 'agenda', 'Novo bloco'))}${filterBar('agenda')}<ol class="ep-list ep-agenda">${rows.map(item => `<li class="surface ep-item"><span class="ep-time">${h(item.time || '--:--')}</span><div class="ep-item-main"><h3>${h(item.title)}</h3>${meta([`${numeric(item.duration)} min`, dateLabel(item.date), teamLabel(item.team), ownerLabel(item, usersOf(c))])}${note(item)}</div><div class="ep-item-side">${itemTools(event, item)}</div></li>`).join('')}</ol>${rows.length ? '' : nothingHere(event, 'agenda', 'Monte a sequência do evento para a equipe saber o que acontece a cada momento.', 'list')}`;
}
function linksSection(c, event) {
  const rows = visible(records(event, 'link')).sort(byDate);
  return `${sectionHead('Links da operação', 'Centralize páginas, grupos, pesquisas, materiais e checkout.', newItem(event, 'link', 'Novo link'))}${filterBar('link')}<div class="ep-link-grid">${rows.map(item => `<article class="surface ep-link"><div class="ep-item-main"><h3>${h(item.title)}</h3>${meta([phaseLabel(item.phase), dateLabel(item.date), ownerLabel(item, usersOf(c))])}</div>${item.url ? `<a class="ep-url" href="${h(item.url)}" target="_blank" rel="noopener noreferrer">${h(item.url.replace(/^https?:\/\//, ''))} ${i('external', 13)}</a>` : '<p class="ep-note">Endereço ainda não adicionado.</p>'}${note(item)}<div class="ep-link-foot">${itemTools(event, item)}</div></article>`).join('')}</div>${rows.length ? '' : nothingHere(event, 'link', 'Guarde aqui as páginas, materiais e acessos da operação.', 'link')}`;
}
function timelineSection(c, event) {
  const groups = eventGroups(event);
  return `${sectionHead('Linha do tempo', 'Arraste para remarcar, ou use as setas do teclado. Clique para editar.', groups.length ? timelineTools() : '')}${groups.length ? timeline(c, groups) : empty('Nada para mostrar ainda', 'Crie tarefas ou mensagens com data para ver a linha do tempo.', 'k')}`;
}
function integrationsSection(_c, event) {
  const sends = sendSummary(event);
  const binding = event.orchestration || {}, rows = Object.values(binding.items || {});
  const count = key => rows.filter(row => row[key]).length;
  const synced = binding.syncedAt ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(binding.syncedAt)) : 'ainda não sincronizado';
  const card = (label, value, text) => `<article class="surface ep-orch-card"><span>${label}</span><b>${value}</b><p>${text}</p></article>`;
  return `${sectionHead('Integrações', 'Crie entregas nos módulos do Graao e publique eventos para os seus fluxos e webhooks.', primary(`${i('flow', 15)} Sincronizar agora`, `type="button" data-ep-orchestrate="${h(event.id)}"`))}<div class="ep-integrations">${card('Tarefas', count('taskId'), 'Tarefas do CRM vinculadas ao evento.')}${card('Calendário', binding.appointmentId ? 'Ligado' : 'Pendente', 'Um compromisso com o roteiro do dia.')}${card('Social', count('socialPostId'), 'Rascunhos para comunicações no Instagram.')}${card('E-mail', count('emailCampaignId'), 'Campanhas em rascunho para revisão.')}${card('WhatsApp', `${sends.sent}/${sends.total}`, sends.failed ? `Mensagens enviadas. ${sends.failed} com falha.` : 'Mensagens enviadas pela fila do evento.')}</div><section class="surface ep-automation-guide"><h3>Eventos que os fluxos podem ouvir</h3><p class="dim">Em <a class="text-link" href="#automation/workflows">Automações</a>, use o gatilho <b>Evento personalizado</b> e conecte ações, integrações ou webhooks.</p><ul><li><code>event_plan_created</code></li><li><code>event_plan_updated</code></li><li><code>event_plan_status_changed</code></li><li><code>event_plan_orchestrated</code></li><li><code>event_message_scheduled</code></li><li><code>event_message_sent</code></li><li><code>event_message_failed</code></li><li><code>event_item_status_changed</code></li></ul><small class="dim">Última sincronização: ${h(synced)}. A sincronização cria somente rascunhos de Social e E-mail: a revisão e o envio continuam com a equipe.</small></section>`;
}
const sections = [
  { value: 'strategy', label: 'Estratégia', icon: 'bulb', content: strategySection },
  { value: 'tasks', label: 'Tarefas', icon: 'check', content: tasksSection },
  { value: 'messages', label: 'Comunicação', icon: 'send', content: messagesSection },
  { value: 'agenda', label: 'Roteiro do dia', icon: 'list', content: agendaSection },
  { value: 'links', label: 'Links', icon: 'link', content: linksSection },
  { value: 'timeline', label: 'Linha do tempo', icon: 'clock', content: timelineSection },
  { value: 'integrations', label: 'Integrações', icon: 'flow', content: integrationsSection }
];

export function eventView(c, event, { pageShell, utabs, marketingTabs }, section = ui.section) {
  const p = eventProgress(event), key = h(event.id);
  const items = sections.map(({ value, label, icon }) => ({ value, label, icon, attrs: `data-ep-section="${value}"` }));
  const metrics = `<div class="metrics">${metric('Tarefas concluídas', `${p.done}/${p.tasks.length}`)}${metric('Mensagens enviadas', `${p.sent}/${p.messages.length}`)}${metric('Duração do roteiro', duration(p.minutes))}${metric('Links validados', `${p.ready}/${p.links.length}`)}</div>`;
  return pageShell({
    title: h(event.title), desc: `${h(dateLabel(event.eventDate) || 'Data a definir')} · ${h(eventStatusLabel(event.status))}`, className: 'ep',
    back: `<button type="button" class="page-back" data-ep-back>${i('left', 15)} Todos os eventos</button>`,
    cta: `<button type="button" class="secondary" data-ep-edit="${key}">${i('edit', 15)} Editar evento</button><button type="button" class="secondary" data-ep-manage="duplicate" data-id="${key}">${i('copy', 15)} Duplicar</button><button type="button" class="danger plain" data-ep-manage="delete" data-id="${key}">${i('trash', 15)} Excluir</button>${primary(`${i('flow', 15)} Orquestrar`, `type="button" data-ep-orchestrate="${key}"`)}`,
    tabs: { key: 'marketing', items: marketingTabs, current: 'events', label: 'Seções de marketing' },
    content: `${metrics}${utabs({ key: 'ep-sections', nested: true, items, current: section, label: 'Seções do evento', content: sections.find(row => row.value === section).content(c, event) })}`
  });
}
export function eventPlanner(c, helpers, { view } = {}) {
  reset(c.workspace);
  const current = (c.s.eventPlans || []).find(item => item.id === ui.selectedId);
  if (!current) ui.selectedId = '';
  return current ? eventView(c, current, helpers) : gallery(c, helpers.pageShell, helpers.marketingTabs, view);
}

/* ── Formulários ── */
function field(label, name, value = '', { type = 'text', required = false, placeholder = '', options = [], min = '', max = '', maxlength = '' } = {}) {
  const attrs = `${required ? ' required' : ''}${placeholder ? ` placeholder="${h(placeholder)}"` : ''}${min !== '' ? ` min="${h(min)}"` : ''}${max !== '' ? ` max="${h(max)}"` : ''}${maxlength ? ` maxlength="${h(maxlength)}"` : ''}`;
  if (type === 'textarea') return `<label>${h(label)}<textarea name="${h(name)}" rows="4"${attrs}>${h(value)}</textarea></label>`;
  if (type === 'select') return `<label>${h(label)}<select name="${h(name)}"${attrs}>${optionRows(options, value)}</select></label>`;
  return `<label>${h(label)}<input name="${h(name)}" type="${h(type)}" value="${h(value)}"${attrs}></label>`;
}
const pair = (...fields) => `<div class="ep-form-grid">${fields.join('')}</div>`;
const formFoot = (label, remove = '') => `<p class="form-status" role="alert"></p><footer class="ep-form-foot">${remove}<span class="spacer"></span><button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">${label}</button></footer>`;
const formHead = (kind, event, attrs = '') => `<form class="ep-form" data-ep-form="${kind}" data-id="${h(event?.id || '')}" data-revision="${event?.revision || 0}"${attrs}>`;
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function newEventPlan(template, eventDate) {
  if (template !== 'launch') return blankEventPlan();
  if (!validDay(eventDate)) throw Error('Informe uma data válida para montar o cronograma.');
  return launchEventPlan(eventDate);
}
export function eventDialogBody(row) {
  const starter = row ? '' : `<label>Começar com<select name="template" data-ep-template>${optionRows([['launch', 'Modelo de lançamento'], ['blank', 'Evento em branco']], 'launch')}</select></label><p class="ep-hint" data-ep-template-hint>O modelo usa essa data para montar o cronograma de tarefas, mensagens, roteiro e validação de links.</p>`;
  return `${formHead('event', row)}${field('Nome do evento', 'title', row?.title || '', { required: true, maxlength: 160, placeholder: 'Ex.: Masterclass de lançamento' })}${pair(field('Data do evento', 'eventDate', row?.eventDate || '', { type: 'date', required: !row }), field('Status', 'status', row?.status || 'planejado', { type: 'select', options: eventPlanStatuses }))}${starter}${formFoot(row ? 'Salvar alterações' : 'Criar evento')}</form>`;
}
export function briefDialogBody(event, group) {
  const { brief } = planOf(event), fields = briefGroups.find(([key]) => key === group)?.[2] || [];
  return `${formHead('brief', event, ` data-group="${h(group)}"`)}${fields.map(([name, label, hint]) => field(label, name, brief[name], { type: 'textarea', placeholder: hint, maxlength: 5000 })).join('')}${formFoot('Salvar')}</form>`;
}
const kindLabel = { task: 'tarefa', message: 'mensagem', agenda: 'bloco', link: 'link' };
const variables = [['{{contact.first_name}}', 'Primeiro nome'], ['{{contact.name}}', 'Nome completo']];
// Quem saiu da equipe ou foi digitado à mão (eventos antigos) continua como opção, para não se perder ao salvar.
function ownerField(item, users, label) {
  if (!users.length) return field(label, 'ownerText', item.owner, { maxlength: 120, placeholder: 'Nome da pessoa' });
  const rows = [['', 'Sem responsável'], ...users.map(user => [user.id, user.name])];
  let value = item.ownerId || '';
  if (value && !users.some(user => user.id === value)) rows.push([value, ownerLabel(item, users)]);
  if (!value && item.owner) { value = `@${item.owner}`; rows.push([value, item.owner]); }
  return field(label, 'owner', value, { type: 'select', options: rows });
}
const templateFor = (event, code) => code ? messageTemplates(event.eventDate).find(row => row.code === code) : null;
export function itemDialogBody(c, event, kind, item = null) {
  const nextOrder = Math.max(0, ...records(event, 'agenda').map(row => numeric(row.order))) + 1;
  const data = item || { kind, phase: kind === 'agenda' ? 'evento' : 'aquecimento', status: itemStatus[kind][0][0], team: kind === 'message' ? 'copy' : kind === 'link' ? 'dev' : 'estrategia', date: kind === 'agenda' ? event.eventDate || '' : '', time: '', duration: 30, channel: 'grupos', order: nextOrder };
  const date = field(kind === 'task' ? 'Prazo' : kind === 'link' ? 'Prazo para validar o link' : 'Data', 'date', data.date, { type: 'date' });
  const time = field('Horário', 'time', data.time, { type: 'time' });
  const team = field('Área', 'team', data.team, { type: 'select', options: eventPlanTeams });
  const owner = ownerField(data, usersOf(c), kind === 'agenda' ? 'Quem conduz' : 'Responsável');
  const extra = {
    task: () => pair(date, team) + owner,
    message: () => pair(date, time) + pair(field('Canal', 'channel', data.channel, { type: 'select', options: channels }), field('Código', 'code', data.code, { maxlength: 40 })) + `<div data-ep-audience${data.channel === 'grupos' ? '' : ' hidden'}>${field('Grupos de destino', 'audience', data.audience, { type: 'select', options: audiences })}</div>` + targetsField(c, data) + pair(team, owner),
    agenda: () => pair(field('Ordem', 'order', data.order, { type: 'number', required: true, min: 0, max: 999 }), field('Duração em minutos', 'duration', data.duration, { type: 'number', required: true, min: 0, max: 1440 })) + pair(date, time) + pair(team, owner),
    link: () => pair(date, team) + owner + field('Endereço', 'url', data.url, { type: 'url', maxlength: 2000, placeholder: 'https://' })
  }[kind]();
  const notes = kind === 'message'
    ? `${copyEditorField({ name: 'notes', value: data.notes, variables })}${item && templateFor(event, item.code) ? `<button type="button" class="secondary ep-apply" data-ep-apply-template="${h(item.code)}" data-ep-event="${h(event.id)}">${i('refresh', 15)} Aplicar estrutura do modelo</button>` : ''}`
    : field('Observações', 'notes', data.notes, { type: 'textarea', maxlength: 10000 });
  const remove = item ? `<button class="danger plain" type="button" data-ep-item-delete="${h(item.id)}" data-ep-event="${h(event.id)}">${i('trash', 15)} Excluir</button>` : '';
  return `${formHead('item', event, ` data-kind="${h(kind)}" data-item-id="${h(item?.id || '')}"`)}${field(kind === 'message' ? 'Assunto' : 'Título', 'title', data.title, { required: true, maxlength: 240 })}${pair(field('Fase', 'phase', data.phase, { type: 'select', options: eventPlanPhases }), field('Status', 'status', data.status, { type: 'select', options: kind === 'message' ? manualStatuses({ ...data, kind }) : itemStatus[kind] }))}${extra}${notes}${formFoot('Salvar', remove)}</form>`;
}

// Regras do planejamento: valem no formulário e na troca rápida de status.
export function checkItem(item) {
  if (item.url && !/^https?:\/\//i.test(item.url)) throw Error('Informe um endereço válido que comece com http:// ou https://.');
  if (item.kind === 'link' && item.status === 'pronto' && !item.url) throw Error('Preencha o endereço para validar o link.');
  if (item.kind !== 'message') return item;
  if (item.status === 'agendado' && (!item.date || !item.time)) throw Error('Preencha data e horário para marcar a mensagem como agendada.');
  if (item.channel === 'grupos' && !['cancelado', 'enviado'].includes(item.status) && /\{\{\s*contact\./.test(item.notes || '')) throw Error('Mensagem de grupo não pode usar variáveis de contato.');
  return item;
}
export function itemFromValues(kind, values, previous, users) {
  if (!String(values.title || '').trim()) throw Error('Preencha o título.');
  const { owner: choice = '', ownerText, ...fields } = values;
  const user = users.find(row => row.id === choice);
  const owner = ownerText !== undefined ? { ownerId: previous && ownerText === previous.owner ? previous.ownerId || '' : '', owner: ownerText }
    : user ? { ownerId: user.id, owner: user.name }
      : choice.startsWith('@') ? { ownerId: '', owner: choice.slice(1) }
        : choice && choice === previous?.ownerId ? { ownerId: choice, owner: previous.owner }
          : { ownerId: '', owner: '' };
  if (kind === 'message' && fields.channel !== 'grupos') fields.audience = '';
  return checkItem({ ...previous, ...fields, ...owner, kind, id: previous?.id || crypto.randomUUID() });
}

async function copyText(text) {
  if (!text) throw Error('Esta mensagem ainda não tem texto.');
  try { await navigator.clipboard.writeText(text); return; } catch { /* navegador sem permissão: usa a seleção */ }
  const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select(); document.execCommand('copy'); area.remove();
}

/** Depois de desenhar, a linha do tempo volta para onde estava, ou para perto de hoje. */
export function placeTimeline(left, top) {
  const scroll = document.querySelector('[data-ep-tl-scroll]'); if (!scroll) return;
  const { day, today } = scroll.closest('[data-ep-timeline]').dataset;
  scroll.scrollTo({ left: left ?? (today === '' ? 0 : Math.max(0, today * day - scroll.clientWidth / 4)), top, behavior: 'instant' });
}

export function installEventPlanner({ c, mutate, flash, dialog, close, render: draw, api, url, load, ask = askUser }) {
  const render = () => { draw(); placeTimeline(); };
  const find = id => (c.s.eventPlans || []).find(row => row.id === id);
  const itemOf = (event, id) => planOf(event).items.find(item => item.id === id);
  // Uma gravação por vez: cada uma lê o evento já com a revisão da anterior, senão duas trocas rápidas viram conflito.
  let queue = Promise.resolve();
  const inOrder = work => { const run = queue.then(work); queue = run.catch(() => {}); return run; };
  const save = command => inOrder(() => mutate(command));
  // sendNow: a mensagem agendada cujo envio imediato a pessoa confirmou; sem isso o servidor recusa a data que já passou.
  const savePlan = (id, change, revision, sendNow = '') => inOrder(() => {
    const event = find(id); if (!event) throw Error('Evento não encontrado.');
    const plan = structuredClone(planOf(event)); change(plan);
    return mutate({ type: 'save', key: 'eventPlans', id, data: { plan, revision: revision ?? event.revision ?? 0, ...(sendNow && { sendNow }) } });
  });
  // Redesenha sem perder a posição da rolagem nem as copies abertas.
  const repaint = () => {
    const top = document.querySelector('#screen')?.scrollTop || 0;
    const { scrollLeft: left, scrollTop: down } = document.querySelector('[data-ep-tl-scroll]') || {};
    const openItems = new Set([...document.querySelectorAll('[data-ep-details][open]')].map(row => row.dataset.epDetails));
    draw();
    placeTimeline(left, down);
    for (const row of document.querySelectorAll('[data-ep-details]')) row.open = openItems.has(row.dataset.epDetails);
    document.querySelector('#screen')?.scrollTo({ top, behavior: 'instant' });
  };
  installEventSends({ c, api, url, load, save, flash, dialog, close, repaint, find, itemOf, isOpen: () => c.view === 'marketing' && c.tab === 'events' && ui.section === 'messages' ? find(ui.selectedId) : null });
  const timelineMoves = installTimeline({ find, itemOf, savePlan, openItem: (...args) => openItem(...args), repaint: () => repaint(), flash, ask, settled: () => queue, zone: () => c.s.profile?.timezone || 'America/Sao_Paulo' });
  const openItem = (event, kind, item = null) => {
    dialog(`${item ? 'Editar' : 'Adicionar'} ${kindLabel[kind]}`, itemDialogBody(c, event, kind, item));
    bindCopyEditor(document);
  };
  const orchestrate = event => dialog('Orquestrar evento', `${formHead('orchestrate', event)}<p class="dim">O Graao cria somente os registros que ainda não estão vinculados a este evento.</p>${[['tasks', 'Criar tarefas no CRM'], ['calendar', 'Criar compromisso no Calendário a partir do roteiro'], ['social', 'Criar rascunhos do Instagram no Planejador social'], ['email', 'Criar rascunhos de e-mail para revisão']].map(([name, label]) => `<label class="check"><input type="checkbox" name="${name}" checked> ${label}</label>`).join('')}<p class="dim">Também será emitido o evento <code>event_plan_orchestrated</code> para os fluxos e webhooks configurados em Automações.</p>${formFoot('Sincronizar')}</form>`, { description: 'Nenhum envio será disparado automaticamente.' });

  document.addEventListener('click', async domEvent => {
    const target = domEvent.target.closest('[data-ep-open],[data-ep-back],[data-ep-new],[data-ep-edit],[data-ep-manage],[data-ep-section],[data-ep-brief-group],[data-ep-item-new],[data-ep-item-edit],[data-ep-item-delete],[data-ep-copy],[data-ep-orchestrate],[data-ep-apply-template],[data-ep-view],[data-ep-tl-zoom],[data-ep-tl-today]');
    if (!target) return;
    const data = target.dataset;
    try {
      if (data.epEdit || data.epManage || data.epEvent) { await timelineMoves.flush(); await queue; }
      const event = find(data.epEvent);
      if (data.epOpen) { ui.selectedId = data.epOpen; openSection('strategy'); render(); return; }
      if (data.epBack !== undefined) { ui.selectedId = ''; render(); return; }
      if (data.epNew !== undefined) { dialog('Novo evento', eventDialogBody(null), { description: 'Cada evento fica restrito à subconta atual.' }); return; }
      if (data.epView) { ui.view = data.epView; render(); return; }
      if (data.epTlZoom) { ui.zoom = data.epTlZoom; render(); return; }
      if (data.epTlToday !== undefined) { placeTimeline(); return; }
      if (data.epSection) { openSection(data.epSection); render(); return; }
      if (data.epOrchestrate) { const row = find(data.epOrchestrate); if (row) orchestrate(row); return; }
      if (data.epEdit) { const row = find(data.epEdit); if (row) dialog('Editar evento', eventDialogBody(row), { description: 'O plano do evento não muda. Arquivar cancela os envios agendados.' }); return; }
      if (data.epManage) {
        const row = find(data.id); if (!row) return;
        if (data.epManage === 'rename') { dialog('Renomear evento', `${formHead('rename', row)}${field('Nome do evento', 'title', row.title, { required: true, maxlength: 160 })}${formFoot('Renomear')}</form>`); return; }
        if (data.epManage === 'duplicate') { await save({ type: 'event-plan-duplicate', id: row.id }); ui.selectedId = ''; render(); flash('Evento duplicado.'); return; }
        if (!await ask(`Apagar “${row.title}”?`, { text: 'Todo o planejamento vai junto: estratégia, tarefas, mensagens, roteiro e links. O que estava agendado não sai. Não dá para desfazer.', ok: 'Apagar evento' })) return;
        await save({ type: 'delete', key: 'eventPlans', id: row.id }); ui.selectedId = ''; render(); flash('Evento apagado.'); return;
      }
      if (!event) return;
      if (data.epBriefGroup) { dialog(briefGroups.find(([key]) => key === data.epBriefGroup)[1], briefDialogBody(event, data.epBriefGroup)); return; }
      if (data.epItemNew) { openItem(event, data.epItemNew); return; }
      if (data.epItemEdit) { const row = itemOf(event, data.epItemEdit); if (row) openItem(event, row.kind, row); return; }
      if (data.epCopy) { await copyText(itemOf(event, data.epCopy)?.notes); flash('Texto copiado.'); return; }
      if (data.epApplyTemplate) {
        const input = target.closest('form').querySelector('[data-ec] textarea'), template = templateFor(event, data.epApplyTemplate);
        if (!template || input.value === template.notes) return;
        if (input.value.trim() && !await ask('Aplicar a estrutura do modelo?', { text: 'O texto que está no editor será substituído.', ok: 'Aplicar modelo', danger: false })) return;
        replaceText(input, template.notes); return;
      }
      if (data.epItemDelete) {
        if (!await ask('Excluir este item do planejamento?', { ok: 'Excluir item' })) return;
        await savePlan(event.id, plan => { plan.items = plan.items.filter(item => item.id !== data.epItemDelete); });
        close(); repaint(); flash('Item excluído.');
      }
    } catch (error) { flash(error.message, true); }
  });

  document.addEventListener('change', async domEvent => {
    const input = domEvent.target;
    if (input.matches('[data-ep-status-filter]')) { ui.events = input.value; render(); return; }
    if (input.matches('[data-ep-filter]')) { ui[input.dataset.epFilter] = input.value; render(); return; }
    if (input.matches('[data-ep-template]')) {
      const launch = input.value === 'launch';
      input.form.elements.eventDate.required = launch; input.form.querySelector('[data-ep-template-hint]').hidden = !launch; return;
    }
    if (input.name === 'channel' && input.form?.matches('[data-ep-form="item"]')) { input.form.querySelector('[data-ep-audience]').hidden = input.value !== 'grupos'; input.form.querySelector('[data-ep-targets]').hidden = input.value !== 'privado'; return; }
    if (!input.matches('[data-ep-item-status]')) return;
    const event = find(input.dataset.epEvent), item = event && itemOf(event, input.dataset.epItemStatus);
    if (!item) return;
    try {
      checkItem({ ...item, status: input.value });
      const value = input.value;
      await savePlan(event.id, plan => { const row = plan.items.find(entry => entry.id === item.id); if (row) row.status = value; });
      repaint(); flash('Status atualizado.');
    } catch (error) { repaint(); flash(error.message, true); }
  });

  document.addEventListener('submit', async domEvent => {
    const form = domEvent.target;
    if (!form.matches('[data-ep-form]')) return;
    domEvent.preventDefault(); if (form.dataset.pending) return;
    form.dataset.pending = '1';
    const button = form.querySelector('.primary'), status = form.querySelector('.form-status'), id = form.dataset.id, revision = Number(form.dataset.revision);
    const values = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, value.trim()]));
    if (form.dataset.kind === 'message') {
      const picked = new FormData(form);
      values.targets = { tags: picked.getAll('targetTag'), excludeTags: picked.getAll('excludeTag') };
      delete values.targetTag; delete values.excludeTag;
    }
    button?.setAttribute('disabled', ''); if (status) status.textContent = '';
    const event = find(id);
    const done = message => { close(); repaint(); flash(message); };
    try {
      const kind = form.dataset.epForm;
      if (kind !== 'event' && !event) throw Error('Evento não encontrado.');
      if (kind === 'event') {
        const { template, ...base } = values;
        if (id) await save({ type: 'save', key: 'eventPlans', id, data: { ...base, revision } });
        else { ui.selectedId = await save({ type: 'save', key: 'eventPlans', id: '', data: { ...base, plan: newEventPlan(template, base.eventDate) } }); openSection('strategy'); }
        done(id ? 'Evento atualizado.' : 'Evento criado.');
      } else if (kind === 'rename') {
        await save({ type: 'save', key: 'eventPlans', id, data: { title: values.title, revision } });
        done('Evento renomeado.');
      } else if (kind === 'orchestrate') {
        const on = name => form.elements[name].checked;
        await save({ type: 'event-plan-orchestrate', id, data: { tasks: on('tasks'), calendar: on('calendar'), social: on('social'), email: on('email') } });
        done('Integrações sincronizadas.');
      } else if (kind === 'brief') {
        await savePlan(id, plan => { plan.brief = { ...plan.brief, ...values }; }, revision);
        done('Estratégia atualizada.');
      } else if (kind === 'item') {
        const previous = itemOf(event, form.dataset.itemId), row = itemFromValues(form.dataset.kind, values, previous, usersOf(c));
        const leaves = (row.date !== previous?.date || row.time !== previous?.time) && leavesNow(event, row, row.date, c.s.profile?.timezone || 'America/Sao_Paulo', Date.now());
        if (leaves && !await ask('Enviar agora?', { text: `“${row.title}” está agendada. Com essa data, o horário já passou e ela sai em seguida.`, ok: 'Enviar agora' })) return;
        await savePlan(id, plan => { const at = plan.items.findIndex(item => item.id === row.id); if (at === -1) plan.items.push(row); else plan.items[at] = row; }, revision, leaves ? row.id : '');
        done(previous ? 'Item atualizado.' : 'Item criado.');
      }
    } catch (error) { if (status) status.textContent = error.message; else flash(error.message, true); }
    finally { delete form.dataset.pending; button?.removeAttribute('disabled'); }
  });
}
