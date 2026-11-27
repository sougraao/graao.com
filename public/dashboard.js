import { brandHighlight, brandIcon, icon, shcLayers } from './icons.js';
import { h, money, fmt } from './screens.js';
import { tr } from './i18n.js';
import { comparisonMode, conversionTotals, dashboardPeriods, dashboardThemes, dateFields, dateMatches, dayAt, effectiveWidget, priorDates,
  recommendedWidgets, resolveDates, salesTotals, scopedDeals, sourceTotals, stageTotals, statusTotals, widgetText, widgets } from './dashboard-data.js';
import { fixedCaption, metricByKind, metricCategories, metricGroups, metricTrend, metricValue } from './dashboard-metrics.js';

const barColors = ['blue','green','red','gray'];
const pct = value => `${Number(value.toFixed(1)).toLocaleString('pt-BR')}%`;
const integer = value => new Intl.NumberFormat('pt-BR').format(value);
const formatMoney = value => money(value);
const glyph = (id,label,ico) => `<button class="dash-tool dash-square" type="button" data-dash-act="${id}" aria-label="${label}" title="${label}">${icon(ico,17)}</button>`;
const tool = (id,label,ico = '') => `<button class="dash-tool" type="button" data-dash-act="${id}">${ico ? icon(ico,16) : ''}${label}</button>`;
const categoryLabels = Object.fromEntries([...metricCategories, ['elements','Elementos']]);
const normalized = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase();

export function selectMarkup(label, attr, selected, choices, blank = '') {
  return `<label class="dash-select"><span class="sr-only">${h(label)}</span><select ${attr}>${blank ? `<option value="">${h(blank)}</option>` : ''}${choices.map(([value,name]) =>
    `<option value="${h(value)}" ${selected === value ? 'selected' : ''}>${h(name)}</option>`).join('')}</select>${icon('chevron',13)}</label>`;
}

export function activeDashboard(c) {
  return c.s.dashboards.find(board => board.id === c.dash.id) || c.s.dashboards.find(board => board.id === c.s.defaultDashboard) || c.s.dashboards[0];
}

export const dashboardZone = (c, board = activeDashboard(c)) => board?.timezone || c.s.profile.timezone;

export function dashboardRange(c) {
  return resolveDates(c.dash.range,dashboardZone(c));
}

function emptyMessage(label = 'Nenhum dado encontrado', mark = 'search', link = '') {
  return `<div class="dash-empty"><span>${icon(mark,19)}</span><p>${h(label)}</p>${link}</div>`;
}

function meters(rows, c, amount, max = Math.max(1,...rows.map(amount))) {
  return `<div class="dash-meters">${rows.map((row,index) => `<div class="dash-meter tone-${barColors[index%4]}">
    <div><span>${h(tr(row.status || row.name))}</span><strong>${h(c(row))}</strong></div>
    <meter min="0" max="${max}" value="${amount(row)}" aria-label="${h(tr(row.status || row.name))}"></meter></div>`).join('')}</div>`;
}

function moneyOrNumber(value, useMoney) { return useMoney ? formatMoney(value) : integer(value); }

function delta(change, show, suffix = 'vs. comparação') {
  if (change === null || change === undefined || Number.isNaN(change)) return '';
  const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const sign = change > 0 ? '+' : '';
  return `<small class="dash-delta ${direction}"><span class="dash-delta-num">${sign}${show(change)}</span>${suffix ? `<span class="dash-delta-label">${suffix}</span>` : ''}</small>`;
}

function metricStatus(c, widget, deals, previous) {
  if (!deals.length) return emptyMessage();
  const isValue = widget.kind === 'value';
  const key = isValue ? 'value' : 'count';
  const total = deals.reduce((sum,record) => sum + (isValue ? record.value : 1),0);
  const change = previous ? total - previous.reduce((sum,record) => sum + (isValue ? record.value : 1),0) : null;
  return `<div class="dash-status-total"><b>${moneyOrNumber(total,isValue)}</b>${delta(change,value => moneyOrNumber(value,isValue))}</div>` +
    meters(statusTotals(deals),row => moneyOrNumber(row[key],isValue),row => row[key]);
}

function conversion(c, config, deals, previous) {
  const value = conversionTotals(deals);
  const change = previous ? value.rate - conversionTotals(previous).rate : null;
  return `<div class="dash-conversion"><div class="dash-gauge"><canvas width="240" height="240" data-dash-gauge="${value.rate}" data-dash-gauge-key="${h(config.id || 'conversion')}" aria-hidden="true"></canvas><b>${pct(value.rate)}</b></div>
    <small class="dash-conversion-label">Receita ganha</small><strong class="dash-conversion-value">${formatMoney(value.revenue)}</strong>${delta(change,amount => `${amount.toFixed(1).replace('.',',')} p.p.`)}</div>`;
}

function funnel(c, rows) {
  const max = Math.max(1, ...rows.map(row => row.count));
  return `<div class="dash-funnel"><div class="dash-funnel-ticks"><span>0</span><span>${max}</span></div><table><thead><tr><th class="sr-only">Etapa</th><th>Acumulado</th><th>Próxima etapa</th></tr></thead><tbody>${rows.map((row,index) => {
    const cumulative = rows[0].count ? row.count / rows[0].count * 100 : index ? 0 : 100;
    const next = index && rows[index - 1].count ? row.count / rows[index - 1].count * 100 : 0;
    return `<tr><td><div><span>${h(tr(row.name))}</span><b>${formatMoney(row.value)}</b></div><meter min="0" max="${max}" value="${row.count}" aria-label="${h(tr(row.name))}"></meter></td><td>${pct(cumulative)}</td><td>${index ? pct(next) : '—'}</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function tasks(c, config, range) {
  const options = c.dash.view[config.id] || {};
  const excludes = options.taskStatus === 'Completed' ? false : options.taskStatus !== 'All';
  const owners = [...new Set(c.s.tasks.map(task => task.owner).filter(Boolean))].sort();
  const records = c.s.tasks.filter(task => (options.taskStatus === 'All' || (excludes ? !task.done : task.done)) &&
    (!options.owner || task.owner === options.owner) && dateMatches(task.due?.slice(0,10),range,c.s.profile.timezone));
  records.sort((a,b) => (options.order !== 'desc' ? 1 : -1) * String(a.due || '9999').localeCompare(String(b.due || '9999')));
  const selects = `<div class="dash-card-filters">
    ${selectMarkup('Status das tarefas',`data-dash-widget="${config.id}" data-dash-field="taskStatus"`,options.taskStatus || 'Pending',[['Pending','Pendentes'],['Completed','Concluídas'],['All','Todas']])}
    ${selectMarkup('Ordenar tarefas',`data-dash-widget="${config.id}" data-dash-field="order"`,options.order || 'asc',[['asc','Prazo mais próximo'],['desc','Prazo mais distante']])}
    ${selectMarkup('Responsável',`data-dash-widget="${config.id}" data-dash-field="owner"`,options.owner || '',owners.map(label => [label,label]),'Todos os usuários')}</div>`;
  if (!records.length) return selects + emptyMessage('Nenhuma tarefa encontrada','check','<a href="#contacts/tasks" class="text-link">Ver tarefas</a>');
  return selects + `<div class="dash-tasks">${records.map(task => `<div class="dash-task">
    <button type="button" class="dash-task-check" data-task="${task.id}" aria-pressed="${task.done}" aria-label="${h(task.done ? `Reabrir ${task.title}` : `Concluir ${task.title}`)}">${task.done ? icon('check',14) : ''}</button>
    <div><b>${h(task.title)}</b>${task.notes ? `<p>${h(task.notes)}</p>` : ''}<small>${h(c.s.contacts.find(contact => contact.id === task.contactId)?.name || 'Sem contato')} · Responsável: ${h(task.owner || 'ninguém')}</small></div>
    <small>${fmt(task.due,'UTC')}</small></div>`).join('')}</div>`;
}

function manual(c, config, range) {
  const view = c.dash.view[config.id] || {};
  const workflows = new Map(c.s.workflows.map(row => [row.id,row.name]));
  for (const item of c.s.manualActions) if (!workflows.has(item.workflowId)) workflows.set(item.workflowId,item.workflowName);
  const assignees = [...new Set(c.s.manualActions.map(row => row.assignee).filter(Boolean))].sort();
  const pending = c.s.manualActions.filter(row => row.status === 'Pending' && (!view.workflow || view.workflow === row.workflowId) &&
    (!view.owner || view.owner === row.assignee) && dateMatches(row.created,range,c.s.profile.timezone));
  const counts = [['Ligações',pending.filter(row => row.type === 'Manual Call').length],['SMS',pending.filter(row => row.type === 'Manual SMS').length],['Total pendente',pending.length]];
  return `<div class="dash-card-filters">
    ${selectMarkup('Automação',`data-dash-widget="${config.id}" data-dash-field="workflow"`,view.workflow || '',[...workflows],'Todas as automações')}
    ${selectMarkup('Responsável',`data-dash-widget="${config.id}" data-dash-field="owner"`,view.owner || '',assignees.map(label => [label,label]),'Todos os usuários')}</div>
    <div class="dash-small-stats">${counts.map(([label,value]) => `<div><b>${value}</b><small>${label}</small></div>`).join('')}</div>
    <a href="#conversations/manual-actions" class="text-link dash-widget-link">Ver ações manuais ${icon('arrow',15)}</a>`;
}

function sources(c, deals) {
  const rows = sourceTotals(deals);
  if (!rows.length) return emptyMessage();
  return `<div class="dash-table"><table><thead><tr>${['Origem','Total de leads','Em aberto','Ganhas','Perdidas','Abandonadas','Valor total'].map(col => `<th>${col}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr><th>${h(row.source === 'N/A' ? 'Sem origem' : row.source)}</th><td>${row.count}</td>${row.totals.map(status => `<td>${status.count}</td>`).join('')}<td>${formatMoney(row.value)}</td></tr>`).join('')}</tbody></table></div>`;
}

function sales(c, deals) {
  const sales = salesTotals(deals);
  const duration = sales.duration >= 86400000 ? `${(sales.duration/86400000).toFixed(1).replace('.',',')} d` : sales.duration >= 3600000 ? `${(sales.duration/3600000).toFixed(1).replace('.',',')} h` : sales.duration >= 60000 ? `${Math.round(sales.duration/60000)} min` : `${Math.round(sales.duration/1000)} s`;
  const days = sales.duration / 86400000;
  const velocity = days >= 1 ? `${formatMoney(sales.value / days)}/dia` : '—';
  return `<div class="dash-small-stats">${[['Duração média da venda',duration],['Valor total vendido',formatMoney(sales.value)],['Velocidade de vendas',velocity]].map(([label,value]) => `<div><b>${value}</b><small>${label}</small></div>`).join('')}</div>`;
}

function showMetric(metric, value) {
  if (value === null || value === undefined) return '—';
  if (metric.unit === 'money') return formatMoney(value);
  if (metric.unit === 'rating') return `${value.toFixed(1).replace('.',',')} ★`;
  return integer(value);
}

function trendChart(metric, series) {
  const rows = series.buckets;
  const max = Math.max(...rows.map(row => row.value), 0);
  if (!max) return emptyMessage('Nenhum dado no período');
  const width = 600, height = 180, gap = rows.length > 40 ? 1 : 3;
  const bar = Math.max(2,(width - gap * (rows.length - 1)) / rows.length);
  const total = rows.reduce((sum,row) => sum + row.value,0);
  const ticks = [0, Math.floor((rows.length - 1) / 2), rows.length - 1].filter((value,index,all) => all.indexOf(value) === index);
  return `<div class="dash-trend"><div class="dash-trend-total"><b>${showMetric(metric,total)}</b><small>no período · por ${series.unit === 'day' ? 'dia' : series.unit === 'week' ? 'semana' : 'mês'}</small></div>
    <svg viewBox="0 0 ${width} ${height + 22}" role="img" aria-label="${h(metric.title)}" preserveAspectRatio="none">
      <line x1="0" x2="${width}" y1="${height}" y2="${height}" class="dash-axis"/>
      ${rows.map((row,index) => {
        const tall = row.value ? Math.max(3,row.value / max * (height - 8)) : 0;
        return `<rect x="${(index * (bar + gap)).toFixed(1)}" y="${(height - tall).toFixed(1)}" width="${bar.toFixed(1)}" height="${tall.toFixed(1)}" rx="2"><title>${h(row.name)}: ${h(showMetric(metric,row.value))}</title></rect>`;
      }).join('')}
      ${ticks.map(index => `<text x="${Math.min(width - 2,Math.max(2,index * (bar + gap) + bar / 2)).toFixed(1)}" y="${height + 16}" text-anchor="${index === 0 ? 'start' : index === rows.length - 1 ? 'end' : 'middle'}">${h(rows[index].name)}</text>`).join('')}
    </svg></div>`;
}

function metricBody(c, config, ctx, comparison) {
  const metric = metricByKind[config.kind];
  if (metric.type === 'number') {
    const value = metricValue(metric,c.s,ctx);
    const before = comparison && !metric.fixed ? metricValue(metric,c.s,ctx,comparison) : null;
    const change = before === null || value === null ? null : value - before;
    return `<div class="dash-number"><b>${showMetric(metric,value)}</b>${delta(change,amount => showMetric(metric,amount))}</div>`;
  }
  if (metric.type === 'breakdown') {
    const rows = metricGroups(metric,c.s,ctx);
    if (!rows.length) return emptyMessage('Nenhum dado no período');
    const shown = rows.slice(0,8);
    return meters(shown,row => showMetric(metric,row.value),row => row.value) + (rows.length > shown.length ? `<p class="dash-more">+${rows.length - shown.length} outros grupos</p>` : '');
  }
  return trendChart(metric,metricTrend(metric,c.s,ctx));
}

function elementBody(config, report = false) {
  if (config.kind === 'heading') return `<div class="dash-heading-body"><h2>${h(config.title)}</h2>${config.note ? `<p>${h(config.note)}</p>` : ''}</div>`;
  if (config.kind === 'text') return `<p class="dash-note">${h(config.note)}</p>`;
  if (config.kind === 'image') return config.url ? `<img class="dash-image" src="${h(config.url)}" alt="${h(config.title)}" loading="lazy" referrerpolicy="no-referrer">` : emptyMessage('Informe o endereço da imagem','edit');
  return config.url ? `<iframe class="dash-embed" src="${h(config.url)}" title="${h(config.title)}" loading="lazy" referrerpolicy="no-referrer" sandbox="${report ? 'allow-scripts' : 'allow-scripts allow-same-origin allow-forms allow-popups'}"></iframe>
    <a class="text-link dash-widget-link" href="${h(config.url)}" target="_blank" rel="noopener noreferrer">Abrir em nova aba ${icon('external',14)}</a>` : emptyMessage('Informe o endereço da página','edit');
}

const googleKinds = { 'ga-count':'ga', 'ga-chart':'ga', business:'gbp' };
const whole = value => new Intl.NumberFormat('pt-BR').format(Math.round(value || 0));
const monthLabel = key => new Intl.DateTimeFormat('pt-BR',{ month:'short', timeZone:'UTC' }).format(new Date(`${key}-01T00:00:00Z`)).replace('.','');
function googleBars(rows, valueKey, labelOf, title) {
  const max = Math.max(1,...rows.map(row => row[valueKey]));
  return `<div class="gw-bars" role="img" aria-label="${h(title)}">${rows.map(row => `<span class="gw-bar" title="${h(labelOf(row))}: ${whole(row[valueKey])}"><i style="height:${Math.max(2,Math.round(row[valueKey]/max*100))}%"></i>${labelOf.short ? `<small>${h(labelOf.short(row))}</small>` : ''}</span>`).join('')}</div>`;
}
function googleWidget(c, config, definition) {
  const product = googleKinds[config.kind];
  const g = c.google;
  const hl = brandHighlight(definition.provider);
  const placeholder = (text, cta = 'Ver integrações') => `<div class="shc-card shc-widget" style="--shc-highlight:${hl}">${shcLayers()}<span class="shc-icon" aria-hidden="true">${brandIcon(definition.provider, 32)}</span><strong>${h(definition.provider)}</strong><p class="dim">${h(text)}</p>${cta ? `<a href="#settings/google" class="shc-widget-cta">${h(cta)}</a>` : ''}</div>`;
  if (!g || g.workspace !== c.workspace && g.workspace) return placeholder('Carregando dados do Google…','');
  if (g.error) return placeholder(g.error,'Ver integração');
  if (!g.connected) return placeholder('Integração não conectada neste workspace.','Conectar Google');
  const chosen = product === 'ga' ? g.gaProperty : g.gbpLocation;
  if (!chosen) return placeholder(product === 'ga' ? 'Escolha a propriedade do Google Analytics desta subconta.' : 'Escolha o local do Perfil da Empresa desta subconta.','Escolher');
  const data = g.data?.[product];
  if (!data) return placeholder('Carregando dados do Google…','');
  if (data.error) return placeholder(data.error,'Ver integração');
  const source = `<p class="gw-source">${brandIcon(definition.provider,14)} ${h(product === 'ga' ? g.gaName : g.gbpName)}</p>`;
  if (config.kind === 'ga-count') {
    return `<div class="gw-stats">${[['Sessões',data.totals.sessions],['Usuários',data.totals.users],['Visualizações',data.totals.views]].map(([label,value]) => `<div><b>${whole(value)}</b><span>${label}</span></div>`).join('')}</div>${source}`;
  }
  if (config.kind === 'ga-chart') {
    const label = row => monthLabel(row.month); label.short = label;
    return `${googleBars(data.months,'sessions',label,'Sessões por mês nos últimos 12 meses')}<p class="gw-legend">Sessões por mês · ${whole(data.totals.sessions)} no período</p>${source}`;
  }
  const label = row => new Intl.DateTimeFormat('pt-BR',{ day:'2-digit', month:'short', timeZone:'UTC' }).format(new Date(`${row.day}T00:00:00Z`));
  return `<div class="gw-stats">${[['Visualizações no Google',data.totals.views],['Ligações',data.totals.calls],['Cliques no site',data.totals.website],['Pedidos de rota',data.totals.directions]].map(([name,value]) => `<div><b>${whole(value)}</b><span>${name}</span></div>`).join('')}</div>
    ${googleBars(data.days,'views',label,'Visualizações por dia nos últimos 30 dias')}${source}`;
}

function widgetBody(c, config, range, comparison, ctx) {
  const definition = widgets[config.kind];
  if (definition.provider && googleKinds[config.kind] && !ctx.report) return googleWidget(c, config, definition);
  if (definition.provider) {
    const hl = brandHighlight(definition.provider);
    return `<div class="shc-card shc-widget" style="--shc-highlight:${hl}">${shcLayers()}<span class="shc-icon" aria-hidden="true">${brandIcon(definition.provider, 32)}</span><strong>${h(definition.provider)}</strong><p class="dim">Integração não conectada neste workspace.</p><a href="#settings" class="shc-widget-cta">Ver integrações</a></div>`;
  }
  if (config.kind === 'note') return `<p class="dash-note">${h(config.note)}</p>`;
  if (definition.element) return elementBody(config,ctx.report);
  if (definition.metric) return metricBody(c,config,ctx,comparison);
  if (config.kind === 'manual') return manual(c,config,range);
  if (config.kind === 'tasks') return tasks(c,config,range);
  const zone = c.s.profile.timezone;
  if (config.kind === 'contacts') {
    const tag = c.dash.quickTag;
    const total = c.s.contacts.filter(contact => (!tag || contact.tags.includes(tag)) && dateMatches(contact.created,range,zone)).length;
    return `<div class="dash-small-stats"><div><b>${total}</b><small>Contatos criados</small></div><a href="#contacts" class="text-link">Ver contatos</a></div>`;
  }
  if (config.kind === 'appointments') {
    const records = c.s.appointments.filter(item => item.status !== 'Canceled' && dateMatches(item.start,range,zone));
    return `<div class="dash-small-stats"><div><b>${records.length}</b><small>Agendamentos</small></div><a href="#calendars" class="text-link">Ver calendário</a></div>`;
  }
  if (config.kind === 'invoices') {
    const value = c.s.invoices.filter(item => item.status === 'Paid' && dateMatches(item.due,range,zone)).reduce((sum,item) => sum + item.value,0);
    return `<div class="dash-small-stats"><div><b>${formatMoney(value)}</b><small>Faturas pagas</small></div><a href="#payments" class="text-link">Ver pagamentos</a></div>`;
  }
  const deals = scopedDeals(c.s,config,range,{owner:config.owner});
  const before = comparison ? scopedDeals(c.s,config,comparison,{owner:config.owner}) : null;
  if (config.kind === 'status' || config.kind === 'value') return metricStatus(c,config,deals,before);
  if (config.kind === 'conversion') return conversion(c,config,deals,before);
  if (config.kind === 'source') return sources(c,deals);
  if (config.kind === 'efficiency') return sales(c,deals);
  const stage = stageTotals(c.s,config.pipeline,deals);
  if (config.kind === 'funnel') return funnel(c,stage.funnel);
  const present = stage.distribution.filter(row => row.count);
  return present.length ? meters(present,row => integer(row.count),row => row.count) : emptyMessage();
}

function caption(c, config, definition) {
  if (definition.pipeline) return dateFields[config.dateField];
  if (definition.metric) {
    const metric = metricByKind[config.kind];
    return metric.fixed ? fixedCaption[metric.fixed] : dashboardPeriods[c.dash.range.period] || 'Últimos 30 dias';
  }
  if (definition.period) return definition.period === 'Last 12 months' ? 'Últimos 12 meses' : 'Últimos 30 dias';
  return '';
}

function widgetCard(c, entry, index, count, range, comparison, ctx) {
  const config = effectiveWidget(c.s,entry,c.dash.draft ? {} : c.dash.view[entry.id]);
  const definition = widgets[config.kind];
  const editor = c.dash.draft;
  const title = tr(entry.title);
  const note = caption(c,config,definition);
  const users = config.kind === 'efficiency' ? [...new Set(c.s.opportunities.map(record => record.owner).filter(Boolean))].sort() : [];
  const pipeline = definition.pipeline ? `<div class="dash-card-filters">
    ${selectMarkup(`Pipeline de ${title}`,`data-dash-widget="${entry.id}" data-dash-field="pipeline"`,config.pipeline,c.s.pipelines.map(row => [row.id,tr(row.name)]),definition.needsPipeline ? '' : 'Todos os pipelines')}
    ${config.kind === 'efficiency' ? selectMarkup('Responsável pela oportunidade',`data-dash-widget="${entry.id}" data-dash-field="owner"`,config.owner || '',users.map(label => [label,label]),'Todos os usuários') : ''}</div>` : '';
  const editTools = editor ? `<div class="dash-edit-tools">
    <button type="button" class="icon-btn" data-dash-act="up" data-widget="${entry.id}" aria-label="Mover ${h(title)} para antes" title="Mover para antes" ${index ? '' : 'disabled'}>${icon('left',15)}</button>
    <button type="button" class="icon-btn" data-dash-act="down" data-widget="${entry.id}" aria-label="Mover ${h(title)} para depois" title="Mover para depois" ${index + 1 < count ? '' : 'disabled'}>${icon('right',15)}</button>
    <button type="button" class="icon-btn" data-dash-act="duplicate-widget" data-widget="${entry.id}" aria-label="Duplicar ${h(title)}" title="Duplicar">${icon('plus',15)}</button>
    <button type="button" class="icon-btn" data-dash-act="remove" data-widget="${entry.id}" aria-label="Remover ${h(title)}" title="Remover">${icon('trash',15)}</button></div>` : '';
  const cardSettings = editor || definition.pipeline ? `<button type="button" class="icon-btn dash-card-settings" data-dash-act="widget-settings" data-widget="${entry.id}" aria-label="Configurar ${h(title)}" title="Configurar widget">${icon('sliders',15)}</button>` : '';
  const heading = config.kind === 'heading';
  const classes = ['dash-card',`dash-w${entry.width}`,index < 3 && ['status','value','conversion'].includes(entry.kind) ? 'dash-primary' : '',
    entry.kind === 'note' ? 'dash-note-card' : '',definition.element ? `dash-element dash-el-${config.kind}` : '',definition.metric ? `dash-metric dash-kind-${metricByKind[config.kind].type}` : ''].filter(Boolean).join(' ');
  const header = heading && !editor ? '' : `<header ${editor ? `draggable="true" data-dash-drag="${entry.id}"` : ''}><div><h2>${h(heading ? 'Título' : title)}</h2>${note ? `<p>${h(note)}</p>` : ''}</div>${editTools}${cardSettings}</header>`;
  return `<section class="${classes}" data-dashboard-card="${entry.id}">${header}
    <div class="dash-card-body">${pipeline}${widgetBody(c,config,range,comparison,ctx)}</div></section>`;
}

export function reportWidget(state, widget, range, period) {
  const config = effectiveWidget(state,widget);
  const context = { report:true, range, zone:state.profile.timezone, today:dayAt(new Date(),state.profile.timezone), tag:'' };
  return widgetBody({ s:state, dash:{ range:{ period }, view:{} } },config,range,null,context);
}

function libraryItem(kind, board) {
  const definition = widgets[kind];
  const added = board.widgets.some(item => item.kind === kind);
  const metric = metricByKind[kind];
  const ico = definition.element ? { heading:'note', text:'note', image:'upload', embed:'external', note:'note' }[kind] || 'note'
    : metric ? { number:'chart', breakdown:'list', trend:'chart' }[metric.type] : definition.provider ? 'external' : 'grid';
  return `<button type="button" class="dash-lib-item" data-dash-act="widget-add" data-widget="${kind}">
    <span class="dash-lib-icon">${icon(ico,16)}</span><span><b>${h(tr(definition.title))}</b><small>${h(widgetText[kind] || '')}</small></span>
    ${added ? '<span class="dash-lib-added" title="Já está no painel">no painel</span>' : icon('plus',15)}</button>`;
}

export function libraryList(c, board) {
  const lib = c.dash.lib;
  const kinds = Object.keys(widgets).filter(kind => lib.sub === 'elements' ? widgets[kind].category === 'elements' : widgets[kind].category !== 'elements');
  if (lib.sub === 'elements') return `<div class="dash-lib-group">${kinds.map(kind => libraryItem(kind,board)).join('')}</div>`;
  const query = normalized(lib.query.trim());
  if (query) {
    const found = kinds.filter(kind => normalized(`${tr(widgets[kind].title)} ${widgetText[kind] || ''} ${categoryLabels[widgets[kind].category]}`).includes(query));
    return `<p class="dash-lib-count">${found.length} ${found.length === 1 ? 'widget encontrado' : 'widgets encontrados'}</p>
      ${found.length ? `<div class="dash-lib-group">${found.map(kind => libraryItem(kind,board)).join('')}</div>` : '<p class="dash-lib-empty">Nenhum widget com esse nome. Tente outra palavra.</p>'}`;
  }
  return `<p class="dash-lib-count">${kinds.length} widgets disponíveis</p>
    <h3 class="dash-lib-heading">Recomendados</h3><div class="dash-lib-group">${recommendedWidgets.map(kind => libraryItem(kind,board)).join('')}</div>
    <h3 class="dash-lib-heading">Por categoria</h3>
    ${metricCategories.map(([key,label]) => {
      const group = kinds.filter(kind => widgets[kind].category === key);
      return group.length ? `<details class="dash-lib-category" ${lib.open.includes(key) ? 'open' : ''} data-dash-category="${key}"><summary><span>${h(label)}</span><span class="dash-lib-badge">${group.length}</span>${icon('chevron',14)}</summary>
        <div class="dash-lib-group">${group.map(kind => libraryItem(kind,board)).join('')}</div></details>` : '';
    }).join('')}`;
}

function library(c, board) {
  const lib = c.dash.lib;
  const tabs = [['widgets','Widgets'],['themes','Temas']];
  const subs = [['builtin','Prontos'],['elements','Elementos']];
  const body = lib.tab === 'themes'
    ? `<p class="dash-lib-count">A cor do tema aparece nos gráficos e destaques deste painel.</p><div class="dash-themes" role="radiogroup" aria-label="Tema do painel">${Object.entries(dashboardThemes).map(([key,[label,color]]) =>
      `<button type="button" role="radio" aria-checked="${(board.theme || 'default') === key}" class="dash-theme" data-dash-act="theme" data-widget="${key}" style="--swatch:${color}"><span class="dash-theme-preview"><i></i><i></i><i></i></span>${h(label)}</button>`).join('')}</div>`
    : `<div class="dash-lib-subtabs" role="tablist">${subs.map(([key,label]) => `<button type="button" role="tab" aria-selected="${lib.sub === key}" data-dash-act="lib-sub" data-widget="${key}">${label}</button>`).join('')}</div>
      ${lib.sub === 'builtin' ? `<label class="search dash-lib-search">${icon('search',15)}<input type="search" data-dash-library-search value="${h(lib.query)}" placeholder="Buscar widgets" aria-label="Buscar widgets"></label>` : ''}
      <div class="dash-lib-list" data-dash-library-list>${libraryList(c,board)}</div>`;
  return `<aside class="dash-library" aria-label="Biblioteca de widgets">
    <div class="dash-lib-tabs" role="tablist">${tabs.map(([key,label]) => `<button type="button" role="tab" aria-selected="${lib.tab === key}" data-dash-act="lib-tab" data-widget="${key}">${label}</button>`).join('')}</div>
    ${body}</aside>`;
}

export function dashboard(c) {
  c.dash.lib ||= { tab:'widgets', sub:'builtin', query:'', open:[] };
  const saved = activeDashboard(c);
  const board = c.dash.draft || saved;
  const zone = dashboardZone(c,saved);
  const view = zone === c.s.profile.timezone ? c : { ...c, s:{ ...c.s, profile:{ ...c.s.profile, timezone:zone } } };
  const range = dashboardRange(c);
  const mode = comparisonMode(c.dash.range);
  const comparison = mode ? priorDates(range,mode) : null;
  const ctx = { range, zone, today:dayAt(new Date(),zone), tag:c.dash.quickTag };
  const editing = Boolean(c.dash.draft);
  const compatible = board.widgets.some(item => widgets[item.kind].quick);
  const period = dashboardPeriods[c.dash.range.period] || 'Últimos 30 dias';
  const [, accent] = dashboardThemes[board.theme] || dashboardThemes.default;
  const toolbar = editing ? `<div class="dash-right">
    ${glyph('undo','Desfazer','left')}${glyph('redo','Refazer','right')}${tool('cancel','Cancelar')}
    <button class="primary dash-save" data-dash-act="save">Salvar alterações</button></div>` : `<div class="dash-right">
    ${glyph('refresh','Atualizar painel','refresh')}${glyph('note','Adicionar nota adesiva','note')}${tool('dates',`${period}${mode ? ' · comparando' : ''} ${icon('chevron',14)}`,'cal')}
    ${tool('summary',`Resumo do painel ${icon('spark',15)}`)}${tool('edit','Editar painel','edit')}
    ${glyph('report','Enviar como relatório','send')}${glyph('more','Mais ações','dots')}</div>`;
  const tags = [...new Set(c.s.contacts.flatMap(contact => contact.tags))].sort();
  const grid = `<div class="dashboard-grid" aria-label="Widgets do painel">${board.widgets.map((entry,index) => widgetCard(view,entry,index,board.widgets.length,range,comparison,ctx)).join('') ||
    `<div class="dash-card dash-w12">${emptyMessage(editing ? 'Escolha widgets na biblioteca à esquerda' : 'Este painel ainda não tem widgets','grid',editing ? '' : tool('edit','Editar painel','plus'))}</div>`}</div>`;
  return `<div class="dashboard-page ${editing ? 'editing' : ''}" data-dashboard-id="${h(board.id)}" style="--dash-accent:${accent}"><div class="dashboard-toolbar" aria-label="Cabeçalho do painel"><div class="dash-switch">
    <h1>${tool(editing ? 'rename' : 'switch',`${h(tr(board.name))} ${icon(editing ? 'edit' : 'chevron',15)}`)}</h1>${editing ? '' : tool('new','Novo','plus')}</div>${toolbar}</div>
    <div class="dash-quick"><button data-dash-act="quick" ${compatible ? '' : 'disabled'} title="${compatible ? 'Filtrar widgets de contatos por tag' : 'Nenhum widget deste painel aceita filtros rápidos'}">Filtros rápidos</button>
    ${compatible && c.dash.showQuick ? selectMarkup('Tag do contato','data-dash-quick',c.dash.quickTag,tags.map(label => [label,label]),'Todas as tags') : ''}
    ${saved.timezone ? `<span class="dash-zone">${icon('clock',14)} Fuso do painel: ${h(saved.timezone)}</span>` : ''}</div>
    ${editing ? `<div class="dash-edit-layout">${library(c,board)}${grid}</div>` : `<div class="dash-bui-row" data-bui="dashboard-ai" aria-label="Insights e próximo passo"></div>${grid}`}</div>`;
}

const gaugeValues = new Map();

export function resetDashboardGauges() {
  gaugeValues.clear();
}

function paintGaugeFrame(canvas, paint, rate) {
  const start = -Math.PI / 2;
  paint.clearRect(0, 0, 240, 240);
  paint.lineWidth = 16;
  const styles = getComputedStyle(canvas);
  const brand = styles.color || styles.getPropertyValue('--dash-accent').trim() || styles.getPropertyValue('--g-brand').trim() || '#5dd62c';
  paint.strokeStyle = styles.getPropertyValue('--g-gauge-track').trim() || '#e4eaf7';
  paint.beginPath(); paint.arc(120, 120, 110, 0, Math.PI * 2); paint.stroke();
  paint.lineCap = 'round';
  paint.strokeStyle = brand;
  if (rate > 0.05) {
    paint.beginPath(); paint.arc(120, 120, 110, start, start + Math.PI * 2 * Math.min(rate, 100) / 100); paint.stroke();
  } else {
    paint.fillStyle = brand;
    paint.beginPath(); paint.arc(120, 10, 8, 0, Math.PI * 2); paint.fill();
  }
}

export function drawDashboardGauges(root, { instant = false } = {}) {
  if (!root) return;
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const boardId = root.querySelector?.('.dashboard-page')?.dataset.dashboardId || location?.hash || 'dash';
  for (const canvas of root.querySelectorAll('[data-dash-gauge]')) {
    const paint = canvas.getContext('2d');
    if (!paint) continue;
    const target = Math.max(0, Number(canvas.dataset.dashGauge) || 0);
    const key = `${boardId}:${canvas.dataset.dashGaugeKey || 'gauge'}`;
    const from = instant || reduced ? target : (gaugeValues.get(key) ?? 0);
    gaugeValues.set(key, target);

    if (canvas._gGaugeRaf) { cancelAnimationFrame(canvas._gGaugeRaf); canvas._gGaugeRaf = 0; }
    if (canvas._gGaugeIo) { canvas._gGaugeIo.disconnect(); canvas._gGaugeIo = null; }

    if (instant || reduced || Math.abs(target - from) < 0.01) {
      paintGaugeFrame(canvas, paint, target);
      continue;
    }

    paintGaugeFrame(canvas, paint, from);
    const animate = () => {
      const start = performance.now(), length = 1800;
      const step = now => {
        if (!canvas.isConnected) return;
        const p = Math.min(1, (now - start) / length);
        const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        const cur = from + (target - from) * eased;
        gaugeValues.set(key, cur);
        paintGaugeFrame(canvas, paint, cur);
        if (p < 1) canvas._gGaugeRaf = requestAnimationFrame(step);
        else { canvas._gGaugeRaf = 0; gaugeValues.set(key, target); }
      };
      canvas._gGaugeRaf = requestAnimationFrame(step);
    };

    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        canvas._gGaugeIo = null;
        animate();
      }, { threshold: 0.25 });
      canvas._gGaugeIo = io;
      io.observe(canvas);
    } else {
      animate();
    }
  }
}

if (typeof window !== 'undefined' && !window._graaoGaugeThemeBound) {
  window._graaoGaugeThemeBound = true;
  window.addEventListener('graao:theme-change', () => {
    const host = document.getElementById('app');
    if (host) drawDashboardGauges(host, { instant: true });
  });
}
