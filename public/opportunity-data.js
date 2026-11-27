import { cleanRules, matchesRules, ruleContext } from './opportunity-filters.js';

export const cardFields = {
  smartTags:'Smart tags', contact:'Contato', company:'Empresa', owner:'Responsável', source:'Origem',
  value:'Valor', status:'Status', closeDate:'Previsão de fechamento', tags:'Tags', lostReason:'Motivo da perda'
};
export const cardLayouts = { default:'Padrão', compact:'Compacto', unlabeled:'Sem rótulos' };
export const opportunitySorts = {
  created:'Data de criação', updated:'Última alteração', title:'Nome da oportunidade',
  value:'Valor', closeDate:'Previsão de fechamento'
};

export const quickActions = { call:'Ligar', unread:'Conversas não lidas', tags:'Tags', notes:'Notas', tasks:'Tarefas', appointment:'Próximo agendamento confirmado' };

const initialFields = ['smartTags','contact','owner','source','value','status','closeDate'];
const known = (map, values) => [...new Set(values)].filter(value => Object.hasOwn(map, value));
/** Card layout, the shown fields in the user's order, and the quick actions. Kept per workspace and user. */
export function opportunityPreferences(workspace, user, update) {
  const key = `graao.opportunities.${workspace}.${user || 'local'}`;
  const shape = saved => ({
    layout:Object.hasOwn(cardLayouts,saved.layout) ? saved.layout : 'default',
    fields:Array.isArray(saved.fields) ? known(cardFields,saved.fields) : initialFields,
    actions:Array.isArray(saved.actions) ? known(quickActions,saved.actions) : Object.keys(quickActions)
  });
  try {
    if (update) localStorage.setItem(key, JSON.stringify(update));
    return shape(update || JSON.parse(localStorage.getItem(key) || '{}'));
  } catch { return shape(update || {}); }
}

/** Saved lists ("smart lists"): a name, a view and the filters and sort in force when it was saved. */
export function opportunityLists(workspace, user, update) {
  const key = `graao.opportunity-lists.${workspace}.${user || 'local'}`;
  const clean = rows => (Array.isArray(rows) ? rows : []).slice(0, 20).filter(row => row?.id && row.name).map(row => ({
    id:String(row.id).slice(0,40), name:String(row.name).slice(0,60), view:row.view === 'list' ? 'list' : 'pipeline',
    filters:{ status:typeof row.filters?.status === 'string' ? row.filters.status : '', rules:cleanRules(row.filters?.rules) },
    sort:{ field:Object.hasOwn(opportunitySorts,row.sort?.field) ? row.sort.field : 'created', direction:row.sort?.direction === 'asc' ? 'asc' : 'desc' }
  }));
  try {
    if (update) localStorage.setItem(key, JSON.stringify(clean(update)));
    return clean(update || JSON.parse(localStorage.getItem(key) || '[]'));
  } catch { return clean(update || []); }
}

const fold = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();
const collator = new Intl.Collator('pt-BR', { sensitivity:'base', numeric:true });
export function opportunityResults(state, pipelineId, query, filters = { status:'Open' }, sort = {}, at = Date.now()) {
  const contacts = new Map(state.contacts.map(contact => [contact.id,contact]));
  const rules = filters.rules?.length ? cleanRules(filters.rules) : [];
  const ctx = rules.length ? ruleContext(state, { at }) : null;
  const sortField = Object.hasOwn(opportunitySorts,sort.field) ? sort.field : 'created';
  const term = fold(query);
  const rows = state.opportunities.filter(record => {
    if (record.pipelineId !== pipelineId) return false;
    const contact = contacts.get(record.contactId);
    if (filters.status && record.status !== filters.status) return false;
    if (filters.stage && record.stage !== filters.stage) return false;
    if (filters.owner && !fold(record.owner).includes(fold(filters.owner))) return false;
    if (filters.source && !fold(record.source).includes(fold(filters.source))) return false;
    if (filters.tag && !record.tags?.some(tag => fold(tag).includes(fold(filters.tag)))) return false;
    if (filters.minValue && record.value < Number(filters.minValue)) return false;
    if (filters.maxValue && record.value > Number(filters.maxValue)) return false;
    if (rules.length && !matchesRules(record, rules, ctx)) return false;
    return !term || [record.title,record.company,record.source,record.owner,contact?.name,contact?.email,contact?.phone]
      .some(value => fold(value).includes(term));
  });
  return rows.sort((left,right) => {
    const a = sortField === 'updated' ? left.updated || left.created : left[sortField];
    const b = sortField === 'updated' ? right.updated || right.created : right[sortField];
    if (a === b) return (right.created || '').localeCompare(left.created || '');
    if (a === '' || a == null) return 1;
    if (b === '' || b == null) return -1;
    const order = sortField === 'value' ? a - b : collator.compare(a,b);
    return sort.direction === 'asc' ? order : -order;
  });
}

export const opportunityCsvColumns = ['title','email','contactid','pipeline','stage','status','value','owner','source','company','closedate','tags','followers','lostreason'];
export function opportunityCsv(state, rows) {
  const lookup = records => new Map(records.map(row => [row.id,row.name]));
  const contacts = new Map(state.contacts.map(row => [row.id,row.email]));
  const pipelines = lookup(state.pipelines), stages = lookup(state.stages);
  const escape = value => {
    const raw = String(value ?? '');
    const safe = typeof value === 'string' && /^[\s]*[=+\-@]/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replaceAll('"','""') + '"';
  };
  return '\uFEFF' + [opportunityCsvColumns,...rows.map(row => [
    row.title,contacts.get(row.contactId),row.contactId,pipelines.get(row.pipelineId),stages.get(row.stage),row.status,row.value,
    row.owner,row.source,row.company,row.closeDate,row.tags?.join(', '),row.followers?.join(', '),row.lostReason
  ])].map(line => line.map(escape).join(',')).join('\r\n');
}
