// Opportunities extras: the advanced-filter rule builder, saved lists, smart tags and quick actions on cards,
// the pipeline admin (list, stages, display, smart tags) and the forecast (summary and timeline board).
// screens.js renders the pieces; app.js calls opportunityEvents once.
import { icon as i } from './icons.js';
import { tr } from './i18n.js';
import { badge, fmt, h, money as mt, pageShell } from './screens.js';
import { crmTabs } from './crm.js';
import { addMonths, closeDateIn, forecast, forecastColumns, forecastGroups, riskSettings } from './crm-data.js';
import { opportunityStatuses } from './dashboard-data.js';
import { opportunityLists, opportunityPreferences, quickActions } from './opportunity-data.js';
import {
  cleanRules, datePresets, describeRule, matchesRules, noValueOps, prebuiltSmartTags, ruleContext, ruleCount, ruleField, ruleFields,
  ruleTypes, smartTagColors, smartTagsFor, smartTagsOf
} from './opportunity-filters.js';

const ui = { workspace: '', editing: '', pipelineTab: 'stages', pipelineQuery: '', tagEditing: null,
  forecast: { pipelineId: '', view: 'summary', groupBy: 'status', granularity: 'month', start: '', rules: [] } };
let current = null; // the app state while a builder is open; choice fields read their options from it
const sync = c => { if (ui.workspace !== c.workspace) Object.assign(ui, { workspace: c.workspace, editing: '', pipelineTab: 'stages', pipelineQuery: '', forecast: { ...ui.forecast, pipelineId: '', rules: [], start: '' } }); current = c; };
const statusLabel = { Open: 'Aberta', Won: 'Ganha', Lost: 'Perdida', Abandoned: 'Abandonada' };
const colorName = { orange: 'Laranja', blue: 'Azul', green: 'Verde', red: 'Vermelho', purple: 'Roxo', pink: 'Rosa', slate: 'Ardósia', gray: 'Cinza', teal: 'Verde-água', '': 'Sem cor' };
const opts = (pairs, value) => pairs.map(([key, label]) => `<option value="${h(key)}" ${String(key) === String(value ?? '') ? 'selected' : ''}>${h(label)}</option>`).join('');
const day = (value, c) => value ? fmt(value.length === 10 ? `${value}T12:00:00Z` : value, c.s.profile.timezone) : '—';
const btn = (label, attrs, ico = '', cls = 'secondary') => `<button type="button" class="${cls}" ${attrs}>${ico ? i(ico, 15) : ''}${label}</button>`;
const store = (key, update) => {
  try { if (update !== undefined) localStorage.setItem(key, JSON.stringify(update)); return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return update ?? null; }
};
const riskKey = c => `graao.forecast-risk.${c.workspace}`;

// ---- Rule builder --------------------------------------------------------------------------------
function choiceOptions(field) {
  if (field === 'status') return opportunityStatuses.map(status => [status, statusLabel[status] || tr(status)]);
  if (field === 'stage') {
    const s = current?.s; if (!s) return [];
    return s.pipelines.flatMap(pipeline => s.stages.filter(stage => stage.pipelineId === pipeline.id)
      .map(stage => [stage.id, s.pipelines.length > 1 ? `${tr(pipeline.name)} · ${tr(stage.name)}` : tr(stage.name)]));
  }
  return [];
}
const choiceLabel = field => value => choiceOptions(field).find(([key]) => key === value)?.[1] || value;

function ruleValue(rule) {
  const [, , type] = ruleField(rule.field);
  if (type === 'date') {
    const preset = rule.value || 'today';
    const dateInput = (name, value, label) => `<label class="rule-value"><span class="sr-only">${label}</span><input type="date" data-rule-input="${name}" value="${h(value || '')}" aria-label="${label}"></label>`;
    return `<label class="rule-value"><span class="sr-only">Período</span><select data-rule-preset aria-label="Período">${opts(datePresets, preset)}</select></label>`
      + (['on', 'after', 'before', 'between'].includes(preset) ? dateInput('date', rule.date, preset === 'between' ? 'De' : 'Data') : '')
      + (preset === 'between' ? dateInput('date2', rule.date2, 'Até') : '')
      + (['inLast', 'moreThan', 'lessThan'].includes(preset) ? `<label class="rule-value"><span class="sr-only">Dias</span><input type="number" min="0" max="3650" step="1" data-rule-input="days" value="${h(rule.days ?? '')}" placeholder="Dias" aria-label="Dias"></label>` : '');
  }
  if (noValueOps.has(rule.op)) return '';
  if (type === 'choice') {
    const chosen = Array.isArray(rule.value) ? rule.value : [];
    return `<fieldset class="rule-value rule-choices"><legend class="sr-only">Valores</legend>${choiceOptions(rule.field).map(([key, label]) =>
      `<label class="check"><input type="checkbox" data-rule-choice value="${h(key)}" ${chosen.includes(key) ? 'checked' : ''}> ${h(label)}</label>`).join('')}</fieldset>`;
  }
  const value = Array.isArray(rule.value) ? rule.value.join(', ') : rule.value ?? '';
  const kind = type === 'number' ? 'type="number" step="any"' : 'type="text" maxlength="200"';
  const hint = type === 'list' ? 'Valores separados por vírgula' : 'Valor';
  return `<label class="rule-value"><span class="sr-only">${hint}</span><input ${kind} data-rule-input="value" value="${h(value)}" placeholder="${hint}" aria-label="${hint}"></label>`;
}
function ruleRow(rule) {
  const field = ruleField(rule.field) || ruleFields[0];
  const groups = [...new Set(ruleFields.map(item => item[3]))];
  const fieldSelect = `<select data-rule-field aria-label="Campo">${groups.map(group => `<optgroup label="${group}">${opts(ruleFields.filter(item => item[3] === group).map(item => [item[0], item[1]]), field[0])}</optgroup>`).join('')}</select>`;
  return `<div class="rule-row" data-rule>${fieldSelect}<select data-rule-op aria-label="Operador">${opts(ruleTypes[field[2]], rule.op)}</select>
    <div class="rule-values">${ruleValue({ ...rule, field: field[0] })}</div>
    <button type="button" class="icon-btn" data-rule-remove aria-label="Remover condição">${i('trash', 15)}</button></div>`;
}
const blankRule = (field = 'status') => {
  const type = ruleField(field)[2];
  return { field, op: ruleTypes[type][0][0], value: type === 'date' ? 'today' : type === 'choice' ? [] : '' };
};
const ruleGroup = (group, index) => `${index ? '<div class="rule-or" aria-hidden="true">OU</div>' : ''}<fieldset class="rule-group surface" data-rule-group>
  <legend class="sr-only">Grupo ${index + 1}: todas as condições precisam ser verdadeiras</legend>${group.map(ruleRow).join('<div class="rule-and" aria-hidden="true">E</div>')}
  <button type="button" class="text-link" data-rule-add>${i('plus', 14)} Adicionar condição (E)</button></fieldset>`;
/** Editable rule set: groups joined by OR, conditions inside a group joined by AND. */
export function ruleBuilder(groups, c) {
  if (c) current = c;
  const list = groups?.length ? groups : [[blankRule()]];
  return `<div class="rule-builder" data-rule-builder><p class="dim">Uma oportunidade aparece quando atende a todas as condições de pelo menos um grupo.</p>
    <div data-rule-groups>${list.map(ruleGroup).join('')}</div>
    <button type="button" class="secondary" data-rule-add-group>${i('plus', 15)} Adicionar grupo (OU)</button></div>`;
}
function readRule(row) {
  const field = row.querySelector('[data-rule-field]').value, op = row.querySelector('[data-rule-op]').value;
  const type = ruleField(field)[2];
  const input = name => row.querySelector(`[data-rule-input="${name}"]`)?.value ?? '';
  if (type === 'date') return { field, op, value: row.querySelector('[data-rule-preset]')?.value || 'today', date: input('date'), date2: input('date2'), days: input('days') };
  if (type === 'choice') return { field, op, value: [...row.querySelectorAll('[data-rule-choice]:checked')].map(box => box.value) };
  return { field, op, value: type === 'list' ? input('value').split(',').map(v => v.trim()).filter(Boolean) : input('value') };
}
/** Rules as typed in a builder, cleaned the same way the server cleans them. */
export const readRules = root => cleanRules([...root.querySelectorAll('[data-rule-group]')].map(group => [...group.querySelectorAll('[data-rule]')].map(readRule)));
const ruleSummary = groups => groups.map(group => group.map(rule => describeRule(rule, choiceLabel(rule.field))).join(' e ')).join(' · ou · ');

// ---- Board pieces --------------------------------------------------------------------------------
/** Saved-list tabs above the board. The first tab is the default open-opportunities view. */
export function listTabs(c) {
  sync(c);
  const lists = opportunityLists(c.workspace, c.access?.session?.id);
  const active = c.opportunityList || '';
  const tab = (id, label) => `<button type="button" class="opportunity-list-tab${id === active ? ' selected' : ''}" data-opp-list="${h(id)}" aria-pressed="${id === active}">${h(label)}</button>`;
  return `<div class="opportunity-lists" role="group" aria-label="Listas salvas">${tab('', 'Oportunidades abertas')}${lists.map(list => tab(list.id, list.name)).join('')}
    ${btn('Lista', 'data-opp="list-new" aria-label="Nova lista salva"', 'plus', 'text-link')}</div>`;
}
/** "More" menu next to the add button. */
export const moreMenu = () => `<details class="opportunity-more"><summary class="icon-btn" aria-label="Mais opções">${i('dots', 17)}</summary><div class="opportunity-more-menu surface">
  ${btn('Exportar CSV', 'data-act="opportunity-export"', 'download', 'plain')}${btn('Gerenciar listas salvas', 'data-opp="lists-manage"', 'list', 'plain')}
  ${btn('Configurar pipelines', 'data-tab="pipelines"', 'gear', 'plain')}</div></details>`;
export const filterButton = c => {
  const n = ruleCount(c.opportunityFilters?.rules) + ['owner', 'source', 'tag', 'stage', 'minValue', 'maxValue'].filter(key => c.opportunityFilters?.[key]).length;
  return btn(`Filtros avançados${n ? ` (${n})` : ''}`, 'data-opp="filters"', 'filter', n ? 'secondary is-active' : 'secondary');
};

/** Everything a card needs, computed once per render. */
export function cardContext(c, pipelineId) {
  sync(c);
  const s = c.s, ctx = ruleContext(s), tags = smartTagsFor(s, pipelineId);
  const prefs = c.opportunityCard || opportunityPreferences(c.workspace, c.access?.session?.id);
  const now = new Date().toISOString();
  const count = (list, key) => list.reduce((map, row) => row[key] ? map.set(row[key], (map.get(row[key]) || 0) + 1) : map, new Map());
  const unread = count(s.messages.filter(m => !m.read && m.direction !== 'Outbound'), 'contactId');
  const openTasks = count(s.tasks.filter(t => !t.done), 'contactId');
  const next = new Map();
  for (const a of s.appointments.filter(a => a.status === 'Confirmed' && a.start >= now).sort((x, y) => x.start.localeCompare(y.start)))
    if (!next.has(a.contactId)) next.set(a.contactId, a);
  return { ctx, tags, prefs, unread, openTasks, next, contacts: ctx.contacts };
}
export const smartTagChips = (deal, k) => smartTagsOf(deal, k.tags, k.ctx).map(tag => `<span class="smart-tag st-${tag.color}" title="${h(tag.description || tag.name)}">${h(tag.name)}</span>`).join('');
/** Quick-action icons with counts at the bottom of a card. */
export function quickActionBar(deal, k, c) {
  const contact = k.contacts.get(deal.contactId);
  if (!contact) return '';
  const items = k.prefs.actions.map(action => {
    if (action === 'call') return contact.phone ? `<a class="quick-action" href="tel:${h(contact.phone.replace(/[^\d+]/g, ''))}" title="Ligar para ${h(contact.phone)}" aria-label="Ligar para ${h(contact.name)}">${i('phone', 14)}</a>` : '';
    if (action === 'unread') { const n = k.unread.get(contact.id) || 0; return `<button type="button" class="quick-action" data-start-thread="${contact.id}" title="Conversas não lidas" aria-label="${n} mensagens não lidas de ${h(contact.name)}">${i('chat', 14)}${n ? `<b>${n}</b>` : ''}</button>`; }
    if (action === 'tags') { const n = contact.tags?.length || 0; return n ? `<span class="quick-action" title="${h(contact.tags.join(', '))}" aria-label="${n} tags do contato">${i('tag', 14)}<b>${n}</b></span>` : ''; }
    if (action === 'notes') return contact.notes ? `<span class="quick-action" title="${h(contact.notes.slice(0, 160))}" aria-label="Contato tem notas">${i('note', 14)}<b>1</b></span>` : '';
    if (action === 'tasks') { const n = k.openTasks.get(contact.id) || 0; return `<button type="button" class="quick-action" data-edit="tasks" data-contact="${contact.id}" title="Tarefas abertas · nova tarefa" aria-label="${n} tarefas abertas; criar tarefa">${i('check', 14)}${n ? `<b>${n}</b>` : ''}</button>`; }
    if (action === 'appointment') { const a = k.next.get(contact.id); return a ? `<span class="quick-action appointment" title="${h(a.title)}">${i('cal', 14)} ${fmt(a.start, c.s.profile.timezone, true)}</span>` : ''; }
    return '';
  }).join('');
  return items ? `<div class="quick-actions">${items}</div>` : '';
}
/** Stage header style for the pipeline's color mode. */
export const stageStyle = (pipeline, stage) => {
  const mode = pipeline.colorMode || 'none';
  return mode === 'none' || !stage.color ? '' : ` stage-color st-${stage.color} stage-${mode}`;
};

// ---- Pipelines -----------------------------------------------------------------------------------
export function pipelinesView(c, tabCfg) {
  sync(c);
  const s = c.s, pipeline = s.pipelines.find(item => item.id === ui.editing);
  if (pipeline) return pipelineEditor(c, pipeline, tabCfg);
  const q = ui.pipelineQuery.toLowerCase();
  const rows = s.pipelines.map((item, index) => ({ item, index })).filter(({ item }) => !q || item.name.toLowerCase().includes(q));
  const last = s.pipelines.length - 1;
  return pageShell({
    title: 'Oportunidades', desc: 'Use pipelines para acompanhar oportunidades e o andamento das vendas por etapa.',
    cta: `<button class="primary" data-act="new-pipeline">${i('plus', 16)} Criar pipeline</button>`, tabs: tabCfg,
    content: `<div class="toolbar"><label class="search">${i('search', 16)}<input data-pipeline-search value="${h(ui.pipelineQuery)}" placeholder="Buscar pipelines…" aria-label="Buscar pipelines" autocomplete="off"></label></div>
      <div class="surface table-shell"><table><thead><tr><th scope="col">#</th><th scope="col">Pipeline</th><th scope="col">Etapas</th><th scope="col">Oportunidades</th><th scope="col">Atualizado em</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>
      ${rows.map(({ item, index }) => `<tr><td>${index + 1}</td><td><button class="text-link" data-opp-pipeline="${item.id}">${h(tr(item.name))}</button>${item.smartTags?.length ? ` <small class="dim">${item.smartTags.length} smart tag(s)</small>` : ''}</td>
        <td>${s.stages.filter(stage => stage.pipelineId === item.id).length}</td><td>${s.opportunities.filter(deal => deal.pipelineId === item.id).length}</td><td>${day(item.updated || item.created, c)}</td>
        <td class="right"><div class="inline-gap row-actions">
          <button class="icon-btn" data-opp-pipeline="${item.id}" aria-label="Editar ${h(tr(item.name))}" title="Editar">${i('edit', 15)}</button>
          <button class="icon-btn" data-opp-pipeline-dup="${item.id}" aria-label="Duplicar ${h(tr(item.name))}" title="Duplicar">${i('copy', 15)}</button>
          <button class="icon-btn" data-opp-pipeline-move="${item.id}" data-dir="-1" aria-label="Mover ${h(tr(item.name))} para cima" title="Mover para cima" ${index === 0 ? 'disabled' : ''}>${i('arrowUp', 15)}</button>
          <button class="icon-btn" data-opp-pipeline-move="${item.id}" data-dir="1" aria-label="Mover ${h(tr(item.name))} para baixo" title="Mover para baixo" ${index === last ? 'disabled' : ''}>${i('arrowDown', 15)}</button>
          <button class="icon-btn" data-opp-pipeline-delete="${item.id}" aria-label="Excluir ${h(tr(item.name))}" title="Excluir" ${s.pipelines.length === 1 ? 'disabled' : ''}>${i('trash', 15)}</button>
        </div></td></tr>`).join('')}</tbody></table>${rows.length ? '' : `<div class="empty">${i('search', 26)}<strong>Nenhum pipeline encontrado</strong><p>Tente outro termo de busca.</p></div>`}</div>`
  });
}
function pipelineEditor(c, pipeline, tabCfg) {
  const s = c.s, stages = s.stages.filter(stage => stage.pipelineId === pipeline.id);
  const mode = pipeline.colorMode || 'none';
  const sub = [['stages', 'Etapas'], ['smart-tags', 'Smart tags']];
  const subTabs = `<div class="opportunity-subtabs" role="group" aria-label="Seções do pipeline">${sub.map(([key, label]) => `<button type="button" class="${ui.pipelineTab === key ? 'selected' : ''}" aria-pressed="${ui.pipelineTab === key}" data-opp-pipeline-tab="${key}">${label}</button>`).join('')}</div>`;
  const head = `<div class="pipeline-editor-head"><button class="icon-btn" data-opp-pipeline="" aria-label="Voltar para pipelines">${i('left', 17)}</button><h2>${h(tr(pipeline.name))}</h2>
    <button class="icon-btn" data-pipeline-edit="${pipeline.id}" aria-label="Renomear pipeline">${i('edit', 15)}</button></div>${subTabs}`;
  let body;
  if (ui.pipelineTab === 'smart-tags') {
    const tags = pipeline.smartTags || [];
    body = `<div class="toolbar"><label class="tag-filter"><span class="sr-only">Smart tags prontas</span><select data-opp-prebuilt aria-label="Adicionar smart tag pronta"><option value="">Adicionar smart tag pronta…</option>${prebuiltSmartTags.filter(tag => !tags.some(t => t.name === tag.name)).map(tag => `<option value="${tag.key}">${h(tag.name)} · ${h(tag.description)}</option>`).join('')}</select></label>
      <span class="spacer"></span>${btn('Nova smart tag', `data-opp-tag-new="${pipeline.id}"`, 'plus', 'primary')}</div>
      <p class="dim crm-intro">Smart tags aparecem nos cartões quando a oportunidade atende às regras. Elas são calculadas na hora e não alteram as tags da oportunidade.</p>
      <div class="surface table-shell"><table><thead><tr><th scope="col">Smart tag</th><th scope="col">Regra</th><th scope="col">Pipelines</th><th scope="col">Oportunidades</th><th scope="col">Alterada em</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>
      ${tags.map(tag => {
        const ctx = ruleContext(s), hits = s.opportunities.filter(deal => (tag.allPipelines || deal.pipelineId === pipeline.id) && matchesRules(deal, tag.rules, ctx)).length;
        return `<tr><td><span class="smart-tag st-${tag.color}">${h(tag.name)}</span>${tag.description ? `<br><small class="dim">${h(tag.description)}</small>` : ''}</td><td><small>${h(ruleSummary(tag.rules))}</small></td><td>${tag.allPipelines ? 'Todos' : 'Este'}</td><td>${hits}</td><td>${day(tag.updated, c)}</td>
          <td class="right"><div class="inline-gap row-actions"><button class="icon-btn" data-opp-tag-edit="${tag.id}" aria-label="Editar ${h(tag.name)}">${i('edit', 15)}</button><button class="icon-btn" data-opp-tag-delete="${tag.id}" aria-label="Excluir ${h(tag.name)}">${i('trash', 15)}</button></div></td></tr>`;
      }).join('')}</tbody></table>${tags.length ? '' : `<div class="empty">${i('tag', 26)}<strong>Nenhuma smart tag ainda</strong><p>Crie tags por regra para priorizar negócios sem esforço manual, ou comece por uma pronta.</p></div>`}</div>`;
  } else {
    const modes = [['none', 'Padrão (sem cor)'], ['dot', 'Ponto colorido'], ['tint', 'Fundo tingido']];
    body = `<section class="surface padded pipeline-setting"><label class="switch-row"><span><b>Usar probabilidade por oportunidade</b><br><small class="dim">Ligado: cada oportunidade usa a própria probabilidade (ou a da etapa, se vazia). Desligado: a previsão usa só a probabilidade da etapa.</small></span>
        <input type="checkbox" role="switch" data-opp-setting="dealProbability" ${pipeline.dealProbability !== false ? 'checked' : ''}></label></section>
      <fieldset class="surface padded pipeline-setting"><legend><b>Cores das etapas</b></legend><p class="dim">Como a cor de cada etapa aparece no quadro.</p><div class="color-modes">
        ${modes.map(([key, label]) => `<label class="color-mode${mode === key ? ' selected' : ''}"><input type="radio" name="colorMode" data-opp-setting="colorMode" value="${key}" ${mode === key ? 'checked' : ''}><span class="color-mode-sample mode-${key}">Etapa</span>${label}</label>`).join('')}</div></fieldset>
      <div class="toolbar"><span class="spacer"></span>${btn('Adicionar etapa', `data-stage-new="${pipeline.id}"`, 'plus', 'primary')}</div>
      <div class="surface table-shell"><table><thead><tr><th scope="col">Ordem</th><th scope="col">Etapa</th><th scope="col">Probabilidade</th><th scope="col">Nos relatórios</th><th scope="col">Cor</th><th scope="col">Oportunidades</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>
      ${stages.map((stage, index) => `<tr><td><div class="inline-gap row-actions"><button class="icon-btn" data-opp-stage-move="${stage.id}" data-dir="-1" aria-label="Mover ${h(tr(stage.name))} para cima" ${index === 0 ? 'disabled' : ''}>${i('arrowUp', 15)}</button><button class="icon-btn" data-opp-stage-move="${stage.id}" data-dir="1" aria-label="Mover ${h(tr(stage.name))} para baixo" ${index === stages.length - 1 ? 'disabled' : ''}>${i('arrowDown', 15)}</button></div></td>
        <td><b>${h(tr(stage.name))}</b></td>
        <td><label class="inline-input"><span class="sr-only">Probabilidade de ${h(tr(stage.name))}</span><input type="number" min="0" max="100" step="0.01" data-opp-stage-chance="${stage.id}" value="${h(stage.probability ?? '')}" placeholder="—"> %</label></td>
        <td><label class="check"><input type="checkbox" data-opp-stage-visible="${stage.id}" ${stage.visible !== false ? 'checked' : ''}> <span class="sr-only">Mostrar ${h(tr(stage.name))} no funil e na distribuição por etapa</span>Funil e distribuição</label></td>
        <td><label><span class="sr-only">Cor de ${h(tr(stage.name))}</span><select data-opp-stage-color="${stage.id}">${opts(['', 'blue', 'green', 'orange', 'red', 'purple', 'pink', 'teal', 'gray'].map(key => [key, colorName[key]]), stage.color || '')}</select></label></td>
        <td>${s.opportunities.filter(deal => deal.stage === stage.id).length}</td>
        <td class="right"><div class="inline-gap row-actions"><button class="icon-btn" data-stage-edit="${stage.id}" aria-label="Editar ${h(tr(stage.name))}">${i('edit', 15)}</button><button class="icon-btn" data-opp-stage-delete="${stage.id}" aria-label="Excluir ${h(tr(stage.name))}" ${stages.length === 1 ? 'disabled' : ''}>${i('trash', 15)}</button></div></td></tr>`).join('')}</tbody></table></div>`;
  }
  return pageShell({ title: 'Oportunidades', desc: 'Configure etapas, probabilidades, cores e smart tags do pipeline.', tabs: tabCfg, content: head + body });
}
function smartTagDialog(c, dialog, pipelineId, tag) {
  const t = tag || { name: '', description: '', color: 'orange', allPipelines: false, rules: [[blankRule('value')]] };
  ui.tagEditing = { pipelineId, id: tag?.id || '' };
  dialog(tag ? 'Editar smart tag' : 'Nova smart tag', `<form data-opp-form="smart-tag" class="opp-form">
    <label>Nome da tag<input name="name" value="${h(t.name)}" maxlength="40" required placeholder="Ex.: Parada, Inativa"></label>
    <label>Descrição<textarea name="description" maxlength="200" placeholder="Ex.: sem atividade nos últimos 90 dias">${h(t.description)}</textarea></label>
    <fieldset class="smart-tag-colors"><legend>Cor</legend>${smartTagColors.map(color => `<label class="swatch st-${color}"><input type="radio" name="color" value="${color}" ${t.color === color ? 'checked' : ''}><span class="sr-only">${colorName[color]}</span></label>`).join('')}</fieldset>
    <label class="check"><input type="checkbox" name="allPipelines" ${t.allPipelines ? 'checked' : ''}> Aplicar a todos os pipelines</label>
    <h3>Regra</h3>${ruleBuilder(t.rules, c)}
    <p class="form-status" role="alert"></p><footer class="inline-gap"><span class="spacer"></span><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">${tag ? 'Salvar smart tag' : 'Criar smart tag'}</button></footer></form>`);
}

// ---- Forecast ------------------------------------------------------------------------------------
export function forecastView(c, tabCfg) {
  sync(c);
  const s = c.s, f = ui.forecast, risk = riskSettings(store(riskKey(c)));
  const ctx = ruleContext(s), rules = cleanRules(f.rules);
  const match = rules.length ? deal => matchesRules(deal, rules, ctx) : undefined;
  const data = forecast(s, { pipelineId: f.pipelineId, match, risk, groupBy: f.groupBy });
  const stageName = id => tr(s.stages.find(st => st.id === id)?.name || '—');
  const filters = `<label class="tag-filter"><span class="sr-only">Pipeline</span><select data-opp-forecast="pipelineId" aria-label="Pipeline"><option value="">Todos os pipelines</option>${opts(s.pipelines.map(p => [p.id, tr(p.name)]), f.pipelineId)}</select></label>
    <div class="opportunity-subtabs" role="group" aria-label="Visão da previsão">${[['summary', 'Resumo', 'chart'], ['timeline', 'Linha do tempo', 'cal']].map(([key, label, ico]) => `<button type="button" class="${f.view === key ? 'selected' : ''}" aria-pressed="${f.view === key}" data-opp-forecast-view="${key}">${i(ico, 14)} ${label}</button>`).join('')}</div>
    <span class="spacer"></span>${btn(`Filtros avançados${rules.length ? ` (${ruleCount(rules)})` : ''}`, 'data-opp="forecast-filters"', 'filter', rules.length ? 'secondary is-active' : 'secondary')}`;
  const metric = (title, value, note, tone = '') => `<div class="surface metric"><span>${title}</span><b class="${tone}">${value}</b><small class="dim">${note}</small></div>`;
  if (f.view === 'timeline') return pageShell({ title: 'Oportunidades', desc: 'Previsão de receita por data prevista de fechamento.', cta: `<button class="primary" data-edit="opportunities">${i('plus', 16)} Adicionar oportunidade</button>`, tabs: tabCfg,
    content: `<div class="toolbar opportunity-toolbar">${filters}</div>${forecastTimeline(c, data)}` });
  const levelInfo = { High: ['Alto', 'red'], Medium: ['Médio', 'gold'], Low: ['Baixo', ''] };
  const riskCards = Object.entries(levelInfo).map(([level, [label, tone]]) => {
    const { count, value } = data.riskTotals[level], r = risk[level];
    const rule = `Adiada ${r.slips}+ vez(es) ou atrasada ${r.days}+ dia(s)${level === 'High' ? '' : level === 'Medium' ? ' (exceto alto)' : ' (exceto alto e médio)'}`;
    return `<details class="risk-card risk-${level.toLowerCase()}"><summary><span><b>Risco ${label.toLowerCase()}</b><small class="dim">${rule}</small></span><span>${count} (${mt(value)})</span></summary>
      ${data.risk[level].length ? data.risk[level].map(x => `<div class="line-item"><button class="text-link" data-edit="opportunities" data-id="${x.deal.id}">${h(x.deal.title)}</button><small class="dim">${day(x.deal.closeDate, c)} · ${x.deal.slips || 0} adiamento(s)${x.late ? ` · ${x.late} dia(s) de atraso` : ''}</small>${badge(label, tone)}</div>`).join('') : '<p class="dim">Nenhuma oportunidade.</p>'}</details>`;
  }).join('');
  const total = Object.values(data.riskTotals).reduce((sum, x) => ({ count: sum.count + x.count, value: sum.value + x.value }), { count: 0, value: 0 });
  const quality = (title, list, note, ico) => `<details class="quality-card"><summary><span>${i(ico, 16)}<span><b>${title}</b><small class="dim">${note}</small></span></span><b>${list.length}</b></summary>
    ${list.slice(0, 8).map(d => `<div class="line-item"><span>${h(d.title)} <small class="dim">${h(stageName(d.stage))}</small></span><button class="secondary" data-edit="opportunities" data-id="${d.id}">Corrigir</button></div>`).join('') || '<p class="dim">Tudo certo.</p>'}</details>`;
  const groupLabel = key => f.groupBy === 'status' ? statusLabel[key] || key : f.groupBy === 'closeMonth'
    ? key ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T12:00:00Z`)) : 'Sem data'
    : key || 'Sem responsável';
  const top = Math.max(1, ...data.groups.map(g => g.potential + g.won));
  const bars = data.groups.map(g => `<div class="forecast-bar-row"><span>${h(groupLabel(g.key))}</span><div class="forecast-bar" role="img" aria-label="${h(groupLabel(g.key))}: ganha ${mt(g.won)}, esperada ${mt(g.expected)}, potencial ${mt(g.potential)}">
    <i class="won" style="width:${g.won / top * 100}%"></i><i class="expected" style="width:${g.expected / top * 100}%"></i><i class="potential" style="width:${Math.max(0, g.potential - g.expected) / top * 100}%"></i></div></div>`).join('');
  const sums = data.groups.reduce((t, g) => ({ count: t.count + g.count, potential: t.potential + g.potential, expected: t.expected + g.expected, won: t.won + g.won, total: t.total + g.total }), { count: 0, potential: 0, expected: 0, won: 0, total: 0 });
  return pageShell({
    title: 'Oportunidades', desc: 'Acompanhe a receita prevista, os negócios em risco e a qualidade dos dados.', tabs: tabCfg,
    content: `<div class="toolbar opportunity-toolbar">${filters}</div>
      <div class="metrics">${metric('Receita potencial máxima', mt(data.potential), 'Se todas as oportunidades abertas fecharem')}${metric('Receita esperada', mt(data.expected), 'Pela probabilidade da oportunidade ou da etapa')}${metric('Receita ganha', mt(data.won), 'Oportunidades ganhas', 'positive')}${metric('Oportunidades abertas', data.open, 'Em andamento')}</div>
      <div class="ag-two forecast-panels"><section class="surface padded"><div class="section-heading"><h2>Oportunidades em risco</h2>${btn('Ajustar critérios', 'data-opp="risk-settings"', 'sliders', 'text-link')}</div>
        <p class="dim">Previsão de fechamento adiada ou vencida. ${badge(`${total.count} · ${mt(total.value)}`, 'blue')}</p>${riskCards}</section>
        <section class="surface padded"><h2>Corrija os dados da previsão</h2><p class="dim">A qualidade dos dados define a precisão da previsão.</p>
        ${quality('Sem data de fechamento', data.missingClose, 'Ficam fora da linha do tempo.', 'cal')}${quality('Sem valor', data.missingValue, 'Somam R$ 0 aos totais.', 'pay')}
        ${quality('Vencidas', data.overdue, 'Podem inflar a previsão.', 'clock')}${quality('Sem probabilidade', data.missingChance, 'Contam como 0% na receita esperada.', 'alert')}</section></div>
      <div class="toolbar"><label class="tag-filter">Agrupar por <select data-opp-forecast="groupBy">${opts(Object.entries(forecastGroups), f.groupBy)}</select></label></div>
      <section class="surface padded"><div class="section-heading"><h2>Oportunidades por ${forecastGroups[f.groupBy].toLowerCase()}</h2>
        <div class="forecast-legend" aria-hidden="true"><span class="won">Ganha</span><span class="expected">Esperada</span><span class="potential">Potencial máxima</span></div></div>
        <div class="forecast-bars">${bars || '<p class="dim">Sem oportunidades.</p>'}</div></section>
      <div class="surface table-shell"><table><thead><tr><th scope="col">${forecastGroups[f.groupBy]}</th><th scope="col">Oportunidades</th><th scope="col">Potencial máxima</th><th scope="col">Esperada</th><th scope="col">Ganha</th><th scope="col">Total potencial</th></tr></thead><tbody>
        ${data.groups.map(g => `<tr><td><b>${h(groupLabel(g.key))}</b></td><td>${g.count}</td><td>${mt(g.potential)}</td><td>${g.key === 'Open' || f.groupBy !== 'status' ? mt(g.expected) : '—'}</td><td>${mt(g.won)}</td><td>${mt(g.total)}</td></tr>`).join('')}
        <tr class="total-row"><td><b>Total</b></td><td>${sums.count}</td><td>${mt(sums.potential)}</td><td>${mt(sums.expected)}</td><td>${mt(sums.won)}</td><td>${mt(sums.total)}</td></tr></tbody></table></div>`
  });
}
function forecastTimeline(c, data) {
  const f = ui.forecast, today = ruleContext(c.s).today.slice(0, 7);
  f.start ||= today;
  const columns = forecastColumns(data.deals, { granularity: f.granularity, start: f.start, count: 4, expectedOf: data.expectedOf });
  const label = column => !column.from ? 'Sem data de fechamento' : column.quarter
    ? `${Math.floor((Number(column.from.slice(5)) - 1) / 3) + 1}º tri ${column.from.slice(0, 4)}`
    : new Intl.DateTimeFormat('pt-BR', { month: 'long', year: column.from.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric', timeZone: 'UTC' }).format(new Date(`${column.from}-01T12:00:00Z`));
  const stageName = id => tr(c.s.stages.find(st => st.id === id)?.name || '');
  const card = deal => `<article class="deal opportunity-card" draggable="true" data-forecast-drag="${deal.id}"><button class="deal-title" data-edit="opportunities" data-id="${deal.id}">${h(deal.title)}</button>
    <dl><div><dt>Valor</dt><dd>${mt(deal.value)}</dd></div><div><dt>Etapa</dt><dd>${h(stageName(deal.stage))}</dd></div><div><dt>Status</dt><dd>${badge(statusLabel[deal.status] || deal.status, deal.status === 'Won' ? 'green' : deal.status === 'Open' ? 'blue' : 'red')}</dd></div>${deal.closeDate ? `<div><dt>Fechamento</dt><dd>${day(deal.closeDate, c)}</dd></div>` : ''}</dl>
    <label><span class="sr-only">Mudar a previsão de fechamento de ${h(deal.title)}</span><input type="date" data-forecast-date="${deal.id}" value="${h(deal.closeDate || '')}"></label></article>`;
  const step = f.granularity === 'quarter' ? 3 : 1;
  return `<div class="toolbar opportunity-toolbar"><div class="inline-gap">${btn('', `data-opp-forecast-shift="${-step}" aria-label="Período anterior"`, 'left')}${btn('Hoje', 'data-opp-forecast-shift="0"')}${btn('', `data-opp-forecast-shift="${step}" aria-label="Próximo período"`, 'right')}</div>
    <span class="spacer"></span><label class="tag-filter"><span class="sr-only">Agrupar a linha do tempo</span><select data-opp-forecast="granularity" aria-label="Período">${opts([['month', 'Mês'], ['quarter', 'Trimestre']], f.granularity)}</select></label></div>
    <p class="dim">Arraste um cartão para outra coluna ou mude a data no cartão para atualizar a previsão de fechamento. Adiar uma oportunidade aberta conta como adiamento.</p>
    <div class="kanban forecast-board">${columns.map(column => `<section class="kanban-col${column.from ? '' : ' no-date'}" data-forecast-drop="${column.from}"><div class="kanban-head">
      <h2>${column.from ? '' : i('alert', 14)} ${h(label(column))}</h2>
      <div class="opportunity-stage-totals"><span>${column.deals.length} ${column.deals.length === 1 ? 'oportunidade' : 'oportunidades'}</span><b class="positive">${mt(column.won)}</b></div>
      <div class="opportunity-stage-totals"><span>+${column.share}% de ${mt(column.total)}</span><b>${mt(column.expected)}</b></div></div>
      <div class="kanban-cards">${column.deals.map(card).join('')}</div></section>`).join('')}</div>`;
}

// ---- Events --------------------------------------------------------------------------------------
export function opportunityEvents({ c, G, mutate, render, flash, dialog, close }) {
  const user = () => c.access?.session?.id;
  const refocus = selector => { render(); G(selector)?.focus(); };
  const run = async (command, message, selector) => {
    try { await mutate(command); render(); if (message) flash(message); if (selector) G(selector)?.focus(); }
    catch (e) { render(); flash(e.message, true); }
  };
  const pipelineOf = () => c.s.pipelines.find(item => item.id === c.pipeline) || c.s.pipelines[0];
  const filtersDialog = target => {
    const rules = target === 'forecast' ? ui.forecast.rules : c.opportunityFilters?.rules || [];
    dialog('Filtros avançados', `<form data-opp-form="filters" data-target="${target}" class="opp-form">${ruleBuilder(rules, c)}
      <p class="form-status" role="alert"></p><footer class="inline-gap"><button type="button" class="secondary" data-opp-rules-clear>Limpar tudo</button><span class="spacer"></span><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Aplicar</button></footer></form>`);
  };
  const listsDialog = () => {
    const lists = opportunityLists(c.workspace, user());
    dialog('Listas salvas', lists.length ? `<form data-opp-form="lists" class="opp-form"><p class="dim">Renomeie ou exclua as listas. Cada lista guarda a visualização, os filtros e a ordenação.</p>
      ${lists.map(list => `<div class="line-item"><label class="grow"><span class="sr-only">Nome da lista</span><input name="name:${h(list.id)}" value="${h(list.name)}" maxlength="60" required></label>
        <small class="dim">${list.view === 'list' ? 'Lista' : 'Quadro'}${list.filters.rules.length ? ` · ${ruleCount(list.filters.rules)} filtro(s)` : ''}</small>
        <label class="check"><input type="checkbox" name="delete" value="${h(list.id)}"> Excluir</label></div>`).join('')}
      <footer class="inline-gap"><span class="spacer"></span><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Salvar</button></footer></form>`
      : '<p>Nenhuma lista salva. Use “+ Lista” para salvar os filtros e a ordenação atuais.</p>');
  };
  const replaceRow = (row, rule) => { row.outerHTML = ruleRow(rule); };

  document.addEventListener('click', async ev => {
    const el = ev.target.closest('button,a,[data-opp-list]');
    if (!el) return;
    const d = el.dataset;
    if (d.cardPrefMove) {
      const item = el.closest('[data-card-pref]'), up = d.cardPrefMove === '-1';
      const sibling = up ? item.previousElementSibling : item.nextElementSibling;
      if (sibling) { if (up) sibling.before(item); else sibling.after(item); el.focus(); }
      return;
    }
    if (d.opp === 'filters') { filtersDialog('board'); return; }
    if (d.opp === 'forecast-filters') { filtersDialog('forecast'); return; }
    if (d.opp === 'lists-manage') { el.closest('details')?.removeAttribute('open'); listsDialog(); return; }
    if (d.opp === 'list-new') {
      const view = c.tab === 'list' ? 'list' : 'pipeline';
      dialog('Nova lista', `<form data-opp-form="list-new" class="opp-form"><label>Nome da lista<input name="name" maxlength="60" required placeholder="Ex.: Propostas acima de 5 mil"></label>
        <fieldset><legend>Visualização</legend><label class="check"><input type="radio" name="view" value="pipeline" ${view === 'pipeline' ? 'checked' : ''}> Quadro: cartões em cada etapa</label>
        <label class="check"><input type="radio" name="view" value="list" ${view === 'list' ? 'checked' : ''}> Lista: tabela</label></fieldset>
        <p class="dim">A lista guarda os filtros (${ruleCount(c.opportunityFilters?.rules) || 'nenhum'}${c.opportunityFilters?.status ? `, status ${statusLabel[c.opportunityFilters.status] || c.opportunityFilters.status}` : ''}) e a ordenação atuais.</p>
        <footer class="inline-gap"><span class="spacer"></span><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Salvar lista</button></footer></form>`);
      return;
    }
    if ('oppList' in d) {
      c.opportunityList = d.oppList;
      const list = opportunityLists(c.workspace, user()).find(item => item.id === d.oppList);
      c.opportunityFilters = list ? { status: list.filters.status, rules: list.filters.rules } : { status: 'Open' };
      c.opportunitySort = list ? list.sort : undefined;
      if (list && c.tab !== list.view) { location.hash = `#opportunities/${list.view}`; return; }
      refocus(`[data-opp-list="${CSS.escape(d.oppList)}"]`); return;
    }
    if (d.opp === 'risk-settings') {
      const risk = riskSettings(store(riskKey(c)));
      dialog('Critérios de risco', `<form data-opp-form="risk" class="opp-form"><p class="dim">Uma oportunidade aberta entra no nível mais alto que atingir. Use 0 para ignorar um critério.</p>
        ${Object.entries({ High: 'Alto', Medium: 'Médio', Low: 'Baixo' }).map(([level, label]) => `<fieldset class="field-grid"><legend>Risco ${label.toLowerCase()}</legend>
          <label>Adiamentos (a partir de)<input type="number" min="0" max="365" step="1" name="${level}.slips" value="${risk[level].slips}" required></label>
          <label>Dias de atraso (a partir de)<input type="number" min="0" max="365" step="1" name="${level}.days" value="${risk[level].days}" required></label></fieldset>`).join('')}
        <footer class="inline-gap"><button type="button" class="secondary" data-opp-risk-reset>Restaurar padrão</button><span class="spacer"></span><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Salvar</button></footer></form>`);
      return;
    }
    if ('oppRiskReset' in d) { store(riskKey(c), null); close(); refocus('[data-opp="risk-settings"]'); flash('Critérios de risco restaurados.'); return; }
    // Rule builder
    if ('ruleAddGroup' in d) {
      const groups = el.closest('[data-rule-builder]').querySelector('[data-rule-groups]');
      groups.insertAdjacentHTML('beforeend', ruleGroup([blankRule()], groups.querySelectorAll('[data-rule-group]').length));
      [...groups.querySelectorAll('[data-rule-field]')].pop()?.focus();
      return;
    }
    if ('ruleAdd' in d) { el.insertAdjacentHTML('beforebegin', `<div class="rule-and" aria-hidden="true">E</div>${ruleRow(blankRule())}`); el.previousElementSibling.querySelector('[data-rule-field]').focus(); return; }
    if ('ruleRemove' in d) {
      const row = el.closest('[data-rule]'), group = row.closest('[data-rule-group]'), builder = row.closest('[data-rule-builder]');
      const joint = row.previousElementSibling?.classList.contains('rule-and') ? row.previousElementSibling : row.nextElementSibling?.classList.contains('rule-and') ? row.nextElementSibling : null;
      joint?.remove(); row.remove();
      if (!group.querySelector('[data-rule]')) {
        const or = group.previousElementSibling?.classList.contains('rule-or') ? group.previousElementSibling : group.nextElementSibling?.classList.contains('rule-or') ? group.nextElementSibling : null;
        or?.remove(); group.remove();
      }
      builder.querySelector('[data-rule-field]')?.focus() || builder.querySelector('[data-rule-add-group]')?.focus();
      return;
    }
    if ('oppRulesClear' in d) {
      const form = el.closest('form');
      if (form.dataset.target === 'forecast') ui.forecast.rules = []; else c.opportunityFilters = { status: c.opportunityFilters?.status ?? 'Open' };
      close(); refocus(form.dataset.target === 'forecast' ? '[data-opp="forecast-filters"]' : '[data-opp="filters"]'); return;
    }
    // Pipelines
    if ('oppPipeline' in d) { ui.editing = d.oppPipeline; ui.pipelineTab = 'stages'; refocus(d.oppPipeline ? '.pipeline-editor-head h2' : '[data-pipeline-search]'); return; }
    if (d.oppPipelineTab) { ui.pipelineTab = d.oppPipelineTab; refocus(`[data-opp-pipeline-tab="${d.oppPipelineTab}"]`); return; }
    if (d.oppPipelineDup) { const name = tr(c.s.pipelines.find(p => p.id === d.oppPipelineDup)?.name); await run({ type: 'pipeline-duplicate', id: d.oppPipelineDup }, `${name} duplicado.`); return; }
    if (d.oppPipelineMove || d.oppStageMove) {
      const stageMode = Boolean(d.oppStageMove), id = d.oppPipelineMove || d.oppStageMove;
      const stage = stageMode && c.s.stages.find(st => st.id === id);
      const rows = stageMode ? c.s.stages.filter(st => st.pipelineId === stage.pipelineId) : c.s.pipelines;
      const ids = rows.map(row => row.id), from = ids.indexOf(id), to = from + Number(d.dir);
      if (to < 0 || to >= ids.length) return;
      [ids[from], ids[to]] = [ids[to], ids[from]];
      const selector = `[data-opp-${stageMode ? 'stage' : 'pipeline'}-move="${id}"][data-dir="${d.dir}"]`;
      await run(stageMode ? { type: 'stage-order', data: { pipelineId: stage.pipelineId, ids } } : { type: 'pipeline-order', data: { ids } }, 'Ordem atualizada.');
      (G(`${selector}:not([disabled])`) || G(`[data-opp-${stageMode ? 'stage' : 'pipeline'}-move="${id}"]:not([disabled])`))?.focus();
      return;
    }
    if (d.oppPipelineDelete || d.oppStageDelete) {
      const stageMode = Boolean(d.oppStageDelete), id = d.oppPipelineDelete || d.oppStageDelete;
      const name = tr((stageMode ? c.s.stages : c.s.pipelines).find(row => row.id === id)?.name);
      dialog(`Excluir ${stageMode ? 'a etapa' : 'o pipeline'} “${name}”?`, `<p>${stageMode ? 'Só é possível excluir uma etapa sem oportunidades.' : 'O pipeline e suas etapas serão excluídos. Só é possível excluir um pipeline sem oportunidades.'} Fluxos que começam ${stageMode ? 'nesta etapa' : 'nessas etapas'} serão despublicados.</p>
        <div class="inline-gap"><span class="spacer"></span><button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary danger" type="button" data-opp-confirm-delete="${id}" data-kind="${stageMode ? 'stage' : 'pipeline'}">Excluir</button></div>`);
      return;
    }
    if (d.oppConfirmDelete) {
      close();
      if (d.kind === 'pipeline' && ui.editing === d.oppConfirmDelete) ui.editing = '';
      await run({ type: `${d.kind}-delete`, id: d.oppConfirmDelete }, d.kind === 'stage' ? 'Etapa excluída.' : 'Pipeline excluído.');
      return;
    }
    if (d.oppTagNew) { smartTagDialog(c, dialog, d.oppTagNew); return; }
    if (d.oppTagEdit) { const pipeline = c.s.pipelines.find(p => p.id === ui.editing); smartTagDialog(c, dialog, pipeline.id, pipeline.smartTags.find(t => t.id === d.oppTagEdit)); return; }
    if (d.oppTagDelete) { await run({ type: 'smart-tag-delete', id: d.oppTagDelete, data: { pipelineId: ui.editing } }, 'Smart tag excluída.', '[data-opp-tag-new]'); return; }
    // Forecast
    if (d.oppForecastView) { ui.forecast.view = d.oppForecastView; refocus(`[data-opp-forecast-view="${d.oppForecastView}"]`); return; }
    if ('oppForecastShift' in d) {
      const today = ruleContext(c.s).today.slice(0, 7), n = Number(d.oppForecastShift);
      ui.forecast.start = n ? addMonths(ui.forecast.start || today, n) : today;
      refocus(`[data-opp-forecast-shift="${d.oppForecastShift}"]`); return;
    }
  });

  document.addEventListener('change', async ev => {
    const el = ev.target, d = el.dataset;
    const row = el.closest('[data-rule]');
    if (row && (d.ruleField !== undefined || d.ruleOp !== undefined || d.rulePreset !== undefined)) {
      const rule = readRule(row);
      if (d.ruleField !== undefined) Object.assign(rule, blankRule(rule.field));
      const marker = d.ruleField !== undefined ? '[data-rule-field]' : d.ruleOp !== undefined ? '[data-rule-op]' : '[data-rule-preset]';
      const index = [...row.parentElement.children].indexOf(row), parent = row.parentElement;
      replaceRow(row, rule); parent.children[index]?.querySelector(marker)?.focus();
      return;
    }
    if (d.oppSetting) {
      const value = d.oppSetting === 'colorMode' ? el.value : el.checked;
      await run({ type: 'pipeline-settings', id: ui.editing, data: { [d.oppSetting]: value } }, 'Pipeline atualizado.', d.oppSetting === 'colorMode' ? `[data-opp-setting="colorMode"][value="${value}"]` : `[data-opp-setting="${d.oppSetting}"]`);
      return;
    }
    const stageId = d.oppStageChance || d.oppStageVisible || d.oppStageColor;
    if (stageId) {
      const stage = c.s.stages.find(st => st.id === stageId);
      const data = { name: stage.name, probability: stage.probability ?? '', visible: stage.visible !== false, color: stage.color || '' };
      if (d.oppStageChance) data.probability = el.value;
      if (d.oppStageVisible) data.visible = el.checked;
      if (d.oppStageColor) data.color = el.value;
      const key = d.oppStageChance ? 'chance' : d.oppStageVisible ? 'visible' : 'color';
      await run({ type: 'stage', id: stageId, data }, 'Etapa atualizada.', `[data-opp-stage-${key}="${stageId}"]`);
      return;
    }
    if (d.oppPrebuilt !== undefined && el.value) {
      const tag = prebuiltSmartTags.find(t => t.key === el.value);
      await run({ type: 'smart-tag', data: { pipelineId: ui.editing, name: tag.name, color: tag.color, description: tag.description, rules: tag.rules } }, `Smart tag “${tag.name}” criada.`, '[data-opp-prebuilt]');
      return;
    }
    if (d.oppForecast) { ui.forecast[d.oppForecast] = el.value; if (d.oppForecast === 'granularity') ui.forecast.start = ''; refocus(`[data-opp-forecast="${d.oppForecast}"]`); return; }
    if (d.forecastDate) await run({ type: 'opportunity-close', id: d.forecastDate, data: { closeDate: el.value } }, 'Previsão de fechamento atualizada.', `[data-forecast-date="${d.forecastDate}"]`);
  });

  document.addEventListener('input', ev => {
    if (ev.target.matches('[data-pipeline-search]')) {
      const { value, selectionStart } = ev.target;
      ui.pipelineQuery = value; render();
      const box = G('[data-pipeline-search]'); box?.focus(); box?.setSelectionRange(selectionStart, selectionStart);
    }
  });

  document.addEventListener('dragstart', ev => { const card = ev.target.closest?.('[data-forecast-drag]'); if (card) { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/forecast', card.dataset.forecastDrag); } });
  document.addEventListener('dragover', ev => { if (ev.target.closest?.('[data-forecast-drop]') && ev.dataTransfer.types.includes('text/forecast')) ev.preventDefault(); });
  document.addEventListener('drop', async ev => {
    const column = ev.target.closest?.('[data-forecast-drop]');
    if (!column || !ev.dataTransfer.types.includes('text/forecast')) return;
    ev.preventDefault();
    const id = ev.dataTransfer.getData('text/forecast'), deal = c.s.opportunities.find(row => row.id === id);
    if (!deal) return;
    const closeDate = closeDateIn({ from: column.dataset.forecastDrop }, deal.closeDate);
    if (closeDate !== (deal.closeDate || '')) await run({ type: 'opportunity-close', id, data: { closeDate } }, closeDate ? 'Previsão de fechamento atualizada.' : 'Previsão de fechamento removida.');
  });

  document.addEventListener('submit', async ev => {
    const form = ev.target.closest('[data-opp-form]');
    if (!form) return;
    ev.preventDefault();
    const status = form.querySelector('.form-status'), kind = form.dataset.oppForm;
    try {
      if (kind === 'filters') {
        const rules = readRules(form);
        if (form.dataset.target === 'forecast') { ui.forecast.rules = rules; close(); refocus('[data-opp="forecast-filters"]'); return; }
        c.opportunityFilters = { status: c.opportunityFilters?.status ?? 'Open', rules };
        close(); refocus('[data-opp="filters"]'); return;
      }
      if (kind === 'list-new') {
        const data = Object.fromEntries(new FormData(form));
        const lists = opportunityLists(c.workspace, user());
        if (lists.length >= 20) throw Error('Você pode salvar até 20 listas.');
        const id = `l${Date.now().toString(36)}`;
        opportunityLists(c.workspace, user(), [...lists, { id, name: data.name.trim(), view: data.view, filters: { status: c.opportunityFilters?.status ?? 'Open', rules: c.opportunityFilters?.rules || [] }, sort: c.opportunitySort || {} }]);
        c.opportunityList = id; close();
        if ((c.tab === 'list' ? 'list' : 'pipeline') !== data.view) { location.hash = `#opportunities/${data.view}`; } else refocus(`[data-opp-list="${id}"]`);
        flash('Lista salva.'); return;
      }
      if (kind === 'lists') {
        const fd = new FormData(form), drop = new Set(fd.getAll('delete'));
        const lists = opportunityLists(c.workspace, user()).filter(list => !drop.has(list.id)).map(list => ({ ...list, name: String(fd.get(`name:${list.id}`) || list.name).trim() || list.name }));
        opportunityLists(c.workspace, user(), lists);
        if (drop.has(c.opportunityList)) { c.opportunityList = ''; c.opportunityFilters = { status: 'Open' }; c.opportunitySort = undefined; }
        close(); render(); flash('Listas atualizadas.'); return;
      }
      if (kind === 'risk') {
        const fd = new FormData(form), out = {};
        for (const level of ['High', 'Medium', 'Low']) out[level] = { slips: Number(fd.get(`${level}.slips`)), days: Number(fd.get(`${level}.days`)) };
        store(riskKey(c), riskSettings(out)); close(); refocus('[data-opp="risk-settings"]'); flash('Critérios de risco salvos.'); return;
      }
      if (kind === 'smart-tag') {
        const data = Object.fromEntries(new FormData(form));
        const rules = readRules(form);
        if (!rules.length) throw Error('Adicione pelo menos uma condição.');
        const { pipelineId, id } = ui.tagEditing;
        await mutate({ type: 'smart-tag', id: id || undefined, data: { pipelineId, name: data.name, description: data.description, color: data.color, allPipelines: data.allPipelines === 'on', rules } });
        close(); render(); flash(id ? 'Smart tag salva.' : 'Smart tag criada.'); G('[data-opp-tag-new]')?.focus(); return;
      }
    } catch (e) { if (status) status.textContent = e.message; else flash(e.message, true); }
  });
}
export const opportunityTabs = crmTabs.opportunities;
