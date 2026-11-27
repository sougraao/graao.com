import { dateMatches, dayAt, metricByKind, metricGroups, metricTrend, metricValue, metricWidgets } from './dashboard-metrics.js';

export { dateMatches, dayAt };
export const salesPipeline = 'sales';
export const opportunityStatuses = ['Open','Won','Lost','Abandoned'];
export const dateFields = { status:'Por mudança de status', created:'Por data de criação', updated:'Por última atualização' };
export const dashboardPeriods = {
  '30':'Últimos 30 dias', today:'Hoje', yesterday:'Ontem', tomorrow:'Amanhã', week:'Esta semana', previousWeek:'Semana passada',
  nextWeek:'Próxima semana', '7':'Últimos 7 dias', '90':'Últimos 90 dias', month:'Este mês', previousMonth:'Mês passado',
  nextMonth:'Próximo mês', quarter:'Este trimestre', previousQuarter:'Trimestre passado', nextQuarter:'Próximo trimestre',
  year:'Este ano', previousYear:'Ano passado', nextYear:'Próximo ano', tillDate:'Até hoje', all:'Todo o período', custom:'Período personalizado'
};
export const comparisonModes = { '':'Sem comparação', previous:'Período anterior', year:'Mesmo período do ano anterior' };
export const dashboardThemes = {
  default:['Cor da marca','var(--g-brand, #5dd62c)'], blue:['Azul','#2563eb'], green:['Verde','#15803d'], purple:['Roxo','#7c3aed'], red:['Vermelho','#dc2626'],
  orange:['Laranja','#ea580c'], yellow:['Âmbar','#d97706'], teal:['Turquesa','#0e7490'], graphite:['Grafite','#475569']
};
export const widgets = {
  status:{ title:'Opportunity status', width:5, pipeline:true },
  value:{ title:'Opportunity value', width:4, pipeline:true },
  conversion:{ title:'Conversion rate', width:3, pipeline:true },
  funnel:{ title:'Funnel', width:6, pipeline:true, needsPipeline:true },
  distribution:{ title:'Stages distribution', width:6, pipeline:true, needsPipeline:true },
  tasks:{ title:'Tasks', width:6 },
  manual:{ title:'Manual actions', width:6 },
  source:{ title:'Lead source report', width:12, pipeline:true },
  'ga-count':{ title:'Google Analytics count', width:4, provider:'Google Analytics', period:'Last 12 months' },
  'ga-chart':{ title:'Google Analytics chart', width:8, provider:'Google Analytics', period:'Last 12 months' },
  business:{ title:'Google Business Profile', width:12, provider:'Google Business Profile', period:'Last 30 days' },
  'meta-ads':{ title:'Meta Ads report', width:6, provider:'Meta Ads' },
  'google-ads':{ title:'Google Ads report', width:6, provider:'Google Ads' },
  'email-health':{ title:'Email health report', width:6, provider:'Entrega de e-mail' },
  efficiency:{ title:'Sales efficiency', width:6, pipeline:true },
  contacts:{ title:'Contacts created', width:4, quick:true },
  appointments:{ title:'Appointments', width:4 },
  invoices:{ title:'Paid invoices', width:4 },
  note:{ title:'Sticky note', width:4, category:'elements' },
  heading:{ title:'Título', width:12, category:'elements', element:true },
  text:{ title:'Caixa de texto', width:6, category:'elements', element:true },
  image:{ title:'Imagem', width:6, category:'elements', element:true, url:true },
  embed:{ title:'Conteúdo incorporado', width:6, category:'elements', element:true, url:true },
  ...Object.fromEntries(metricWidgets.map(metric => [metric.kind, { title:metric.title, width:metric.width, category:metric.category,
    metric:true, quick:Boolean(metric.quick) }]))
};
for (const kind of ['status','value','conversion','funnel','distribution','source','efficiency']) widgets[kind].category = 'general';
for (const kind of ['tasks','manual']) widgets[kind].category = 'tasks';
for (const kind of ['ga-count','ga-chart','business','meta-ads','google-ads','email-health']) widgets[kind].category = 'integrations';
widgets.contacts.category = 'contacts';
widgets.appointments.category = 'appointments';
widgets.invoices.category = 'payments';
export const widgetText = {
  status:'Compare oportunidades por status', value:'Compare o valor das oportunidades por status', conversion:'Taxa de conversão e receita ganha',
  funnel:'Avanço das oportunidades pelas etapas', distribution:'Oportunidades por etapa do pipeline', source:'Leads e valor por origem',
  efficiency:'Duração média e valor das vendas', tasks:'Lista de tarefas com filtros', manual:'Ligações e SMS manuais pendentes',
  contacts:'Contatos criados no período', appointments:'Agendamentos não cancelados', invoices:'Valor das faturas pagas',
  'ga-count':'Sessões e usuários do Google Analytics', 'ga-chart':'Tráfego do Google Analytics por mês', business:'Visualizações e ações no Google',
  'meta-ads':'Investimento e resultados no Meta Ads', 'google-ads':'Investimento e resultados no Google Ads', 'email-health':'Entrega, aberturas e rejeições',
  note:'Anotação colorida para a equipe', heading:'Título para separar seções', text:'Parágrafo com orientações ou contexto',
  image:'Imagem por endereço https', embed:'Página externa por endereço https',
  ...Object.fromEntries(metricWidgets.map(metric => [metric.kind, metric.text]))
};
export const recommendedWidgets = ['m-contacts-count','m-revenue-trend','m-contacts-tags','m-appointments-count'];

const defaultKinds = ['status','value','conversion','funnel','distribution','tasks','manual','source','ga-count','ga-chart',
  'business','meta-ads','google-ads','email-health','efficiency'];

export function newWidget(kind,id) {
  const definition = widgets[kind];
  return { id, kind, title:definition.title, width:definition.width, pipeline:'', dateField:'status', note:'', url:'' };
}

export function defaultDashboard() {
  return { id:'dashboard', name:'Dashboard', version:1, theme:'default', timezone:'', widgets:defaultKinds.map(kind => newWidget(kind,kind)), history:[] };
}

function addDays(day, count) {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0,10);
}

export function validDay(day) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0,10) === day;
}

function quarterStart(day) {
  const month = Math.floor((Number(day.slice(5,7)) - 1) / 3) * 3 + 1;
  return `${day.slice(0,4)}-${String(month).padStart(2,'0')}-01`;
}

function shiftMonths(day, count) {
  const value = new Date(`${day.slice(0,7)}-01T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + count);
  return value.toISOString().slice(0,10);
}

export function resolveDates(filters, timezone, now = new Date()) {
  const today = dayAt(now,timezone);
  const period = Object.hasOwn(dashboardPeriods,filters.period) ? filters.period : '30';
  const first = `${today.slice(0,7)}-01`;
  const sunday = addDays(today,-new Date(`${today}T00:00:00Z`).getUTCDay());
  const quarter = quarterStart(today);
  const year = Number(today.slice(0,4));
  const span = (start, months) => ({ start, end:addDays(shiftMonths(start,months),-1) });
  if (period === 'all') return { start:'', end:'' };
  if (period === 'custom' && validDay(filters.start) && validDay(filters.end) && filters.start <= filters.end) {
    return { start:filters.start, end:filters.end };
  }
  switch (period) {
    case 'today': return { start:today, end:today };
    case 'yesterday': { const day = addDays(today,-1); return { start:day, end:day }; }
    case 'tomorrow': { const day = addDays(today,1); return { start:day, end:day }; }
    case 'week': return { start:sunday, end:addDays(sunday,6) };
    case 'previousWeek': return { start:addDays(sunday,-7), end:addDays(sunday,-1) };
    case 'nextWeek': return { start:addDays(sunday,7), end:addDays(sunday,13) };
    case 'month': return { start:first, end:today };
    case 'previousMonth': return span(shiftMonths(first,-1),1);
    case 'nextMonth': return span(shiftMonths(first,1),1);
    case 'quarter': return span(quarter,3);
    case 'previousQuarter': return span(shiftMonths(quarter,-3),3);
    case 'nextQuarter': return span(shiftMonths(quarter,3),3);
    case 'year': return { start:`${year}-01-01`, end:today };
    case 'previousYear': return { start:`${year-1}-01-01`, end:`${year-1}-12-31` };
    case 'nextYear': return { start:`${year+1}-01-01`, end:`${year+1}-12-31` };
    case 'tillDate': return { start:'0001-01-01', end:today };
    default: return { start:addDays(today,1-(Number(period) || 30)), end:today };
  }
}

function minusYear(day) {
  const target = `${Number(day.slice(0,4)) - 1}${day.slice(4)}`;
  return validDay(target) ? target : addDays(`${Number(day.slice(0,4)) - 1}-03-01`,-1);
}

export function priorDates(range, mode = 'previous') {
  if (!range.start || range.start === '0001-01-01' || !mode) return null;
  if (mode === 'year') return { start:minusYear(range.start), end:minusYear(range.end) };
  const days = Math.round((Date.parse(range.end) - Date.parse(range.start)) / 86400000) + 1;
  return { start:addDays(range.start,-days), end:addDays(range.start,-1) };
}

export const comparisonMode = range => range.compare === true ? 'previous'
  : Object.hasOwn(comparisonModes,range.compare || '') ? range.compare || '' : '';

function opportunityDate(record, field) {
  if (field === 'created') return record.created;
  if (field === 'updated') return record.updated || record.created;
  return record.statusChangedAt || record.created;
}

export function scopedDeals(state, widget, range, filters = {}) {
  return state.opportunities.filter(record => (!widget.pipeline || record.pipelineId === widget.pipeline) &&
    (!filters.owner || record.owner === filters.owner) &&
    dateMatches(opportunityDate(record,widget.dateField),range,state.profile.timezone));
}

const totalValue = records => records.reduce((sum,record) => sum + record.value,0);

export function statusTotals(deals) {
  return opportunityStatuses.map(status => {
    const records = deals.filter(record => record.status === status);
    return { status, count:records.length, value:totalValue(records) };
  });
}

export function conversionTotals(deals) {
  const won = deals.filter(record => record.status === 'Won');
  return { rate:deals.length ? 100 * won.length / deals.length : 0, revenue:totalValue(won), count:won.length };
}

export function stageTotals(state, pipelineId, deals) {
  const stages = state.stages.filter(stage => stage.pipelineId === pipelineId && stage.visible !== false);
  const open = deals.filter(record => record.status === 'Open');
  const won = deals.filter(record => record.status === 'Won');
  const lost = deals.filter(record => record.status === 'Lost');
  const abandoned = deals.filter(record => record.status === 'Abandoned');
  const exact = stages.map(stage => {
    const match = open.filter(record => record.stage === stage.id);
    return { name:stage.name, count:match.length, value:totalValue(match) };
  });
  const closed = (name, records) => ({ name, count:records.length, value:totalValue(records) });
  const wonTotal = closed('Won',won);
  const funnel = [...exact.map((row,index) => ({ ...row,
    count:exact.slice(index).reduce((sum,item) => sum + item.count,won.length),
    value:exact.slice(index).reduce((sum,item) => sum + item.value,wonTotal.value)
  })),wonTotal];
  return { funnel, distribution:[...exact,wonTotal,closed('Lost',lost),closed('Abandoned',abandoned)] };
}

export function sourceTotals(deals) {
  const groups = new Map();
  for (const deal of deals) {
    const source = deal.source || 'N/A';
    if (!groups.has(source)) groups.set(source,[]);
    groups.get(source).push(deal);
  }
  return Array.from(groups,([source,records]) => ({ source, count:records.length,
    value:totalValue(records), totals:statusTotals(records) })).sort((a,b) => b.count - a.count || a.source.localeCompare(b.source));
}

export function salesTotals(deals) {
  const won = deals.filter(record => record.status === 'Won');
  const durations = won.map(record => Date.parse(record.statusChangedAt || record.created) - Date.parse(record.created)).filter(ms => ms >= 0);
  return { value:totalValue(won), duration:durations.length ? durations.reduce((sum,ms) => sum + ms,0) / durations.length : 0 };
}

export function effectiveWidget(state, widget, view = {}) {
  const config = { ...widget, ...view };
  const available = state.pipelines.some(item => item.id === config.pipeline);
  if (!available) config.pipeline = widgets[widget.kind].needsPipeline ? state.pipelines[0]?.id || '' : '';
  return config;
}

export function reportRows(state, dashboard, view, range, tag = '', now = new Date()) {
  const result = [];
  const ctx = { range, zone:state.profile.timezone, today:dayAt(now,state.profile.timezone), tag };
  for (const widget of dashboard.widgets) {
    const metric = metricByKind[widget.kind];
    if (metric) {
      if (metric.type === 'number') {
        const value = metricValue(metric,state,ctx);
        result.push([widget.title,metric.unit === 'money' ? 'Valor' : metric.unit === 'rating' ? 'Média' : 'Total',value === null ? '—' : Number(value.toFixed(2))]);
      } else if (metric.type === 'breakdown') result.push(...metricGroups(metric,state,ctx).slice(0,12).map(row => [widget.title,row.name,row.value]));
      else result.push(...metricTrend(metric,state,ctx).buckets.filter(row => row.value).map(row => [widget.title,row.name,row.value]));
      continue;
    }
    const config = effectiveWidget(state,widget,view[widget.id]);
    const deals = scopedDeals(state,config,range,{owner:config.owner});
    if (widget.kind === 'status' || widget.kind === 'value') {
      const key = widget.kind === 'status' ? 'count' : 'value';
      result.push(...statusTotals(deals).map(row => [widget.title,row.status,row[key]]));
    }
    if (widget.kind === 'conversion') {
      const conversion = conversionTotals(deals);
      result.push([widget.title,'Conversion %',Number(conversion.rate.toFixed(2))],[widget.title,'Won revenue',conversion.revenue]);
    }
    if (widget.kind === 'funnel' || widget.kind === 'distribution') {
      result.push(...stageTotals(state,config.pipeline,deals)[widget.kind].map(row => [widget.title,row.name,row.count]));
    }
    if (widget.kind === 'source') result.push(...sourceTotals(deals).map(row => [widget.title,row.source,row.count]));
    if (widget.kind === 'efficiency') {
      const sales = salesTotals(deals);
      result.push([widget.title,'Total sale value',sales.value],[widget.title,'Average duration (hours)',Number((sales.duration/3600000).toFixed(2))]);
    }
    if (widget.kind === 'manual') {
      const pending = state.manualActions.filter(row => row.status === 'Pending' && (!config.workflow || row.workflowId === config.workflow) &&
        (!config.owner || row.assignee === config.owner) && dateMatches(row.created,range,state.profile.timezone));
      result.push([widget.title,'Phone',pending.filter(item => item.type === 'Manual Call').length],
        [widget.title,'SMS',pending.filter(item => item.type === 'Manual SMS').length],[widget.title,'Total pending',pending.length]);
    }
    if (widget.kind === 'tasks') {
      const status = config.taskStatus || 'Pending';
      const count = state.tasks.filter(row => (status === 'All' || row.done === (status === 'Completed')) &&
        (!config.owner || row.owner === config.owner) && dateMatches(row.due?.slice(0,10),range,state.profile.timezone)).length;
      result.push([widget.title,status,count]);
    }
    if (widget.kind === 'contacts') result.push([widget.title,'Contacts',state.contacts.filter(row => (!tag || row.tags.includes(tag)) && dateMatches(row.created,range,state.profile.timezone)).length]);
    if (widget.kind === 'appointments') result.push([widget.title,'Appointments',state.appointments.filter(row => row.status !== 'Canceled' && dateMatches(row.start,range,state.profile.timezone)).length]);
    if (widget.kind === 'invoices') result.push([widget.title,'Paid value',state.invoices.filter(row => row.status === 'Paid' && dateMatches(row.due,range,state.profile.timezone)).reduce((sum,row) => sum + row.value,0)]);
  }
  return result;
}
