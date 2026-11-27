// Workflow engine: several triggers with filters, a tree of steps (if/else, router, wait, goal, goto…)
// compiled into a graph when a contact enrolls, runs that pause and resume, scheduled triggers, and an
// outbox for the calls the server makes after saving (outbound webhooks, WhatsApp).
import { createHash, randomBytes } from 'node:crypto';
import { buildWorkflowContext, evaluateExpression, resolveTemplate } from './expressions.mjs';
import { scoreTriggerMatches } from './scoring-model.mjs';
import { canMessage } from './preference-model.mjs';
import { slaRecords } from './ui/conversation-sla.js';
import { e164 } from './twilio.mjs';
import { connectorStep } from './ui/connectors-data.js';
import { actionSpec, aiExtractFields, aiOptions, aiVariableName, allActions, allTriggers, eachStep, splitPercent, triggerSpec, upgradeWorkflow } from './ui/workflow-data.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : typeof value === 'number' ? String(value) : '';
const lower = value => String(value ?? '').trim().toLowerCase();
// Phones compare by digits, with or without Brazil's +55: "+55 11 98888-0000" is "(11) 98888-0000".
const digitsOf = value => { const digits = String(value || '').replace(/\D/g, ''); return digits.length >= 12 && digits.startsWith('55') ? digits.slice(2) : digits; };
const samePhone = (a, b) => { const x = digitsOf(a); return x.length >= 8 && x === digitsOf(b); };
const tagList = list => [...new Set((list || []).map(tag => str(tag, 48)).filter(Boolean))].slice(0, 20);
// Meta (Conversions API and custom audiences): normalized, then SHA-256, as Meta asks. A Brazilian phone without
// the country code gets 55. Empty values stay empty (never the hash of an empty string).
const sha256 = value => value ? createHash('sha256').update(value).digest('hex') : '';
const metaPhone = value => { const digits = String(value || '').replace(/\D/g, ''); return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits.length >= 12 ? digits : ''; };
const metaIdentity = contact => {
  const [first = '', ...rest] = String(contact.name || '').trim().toLowerCase().split(/\s+/);
  return { email: sha256(String(contact.email || '').trim().toLowerCase()), phone: sha256(metaPhone(contact.phone)),
    first: sha256(first), last: sha256(rest.at(-1) || ''), external: sha256(String(contact.id || '')) };
};
const FAILURES = /^(erro|sem contato|sem nome|sem oportunidade|sem agendamento|sem conversa|campo removido|campo inválido|e-mail inválido|contato em não perturbe)/;

// Telefonia (2.4): the IVR steps answer a live call. Each one adds verbs to the call's script (s.callScripts[callSid]);
// the server turns them into TwiML. Gather, connect and record wait for Twilio's next request (callInput).
export const IVR_STEPS = new Set(['ivr_say', 'ivr_gather', 'ivr_connect', 'ivr_record', 'ivr_hangup']);
const IVR_WAIT = 20 * 60 * 1000;
/** The call's script, created on first use and pruned to the 50 most recent calls. */
export function callScript(s, callSid, create = true) {
  s.callScripts ||= {};
  if (!s.callScripts[callSid] && create) {
    const old = Object.entries(s.callScripts).sort((a, b) => String(a[1].at).localeCompare(String(b[1].at)));
    while (old.length >= 50) delete s.callScripts[old.shift()[0]];
    s.callScripts[callSid] = { verbs: [], wait: null, owner: '', done: false, at: new Date().toISOString() };
  }
  return s.callScripts[callSid] || null;
}

// Bot de IA nas conversas: the channels it can answer on, and the step that sends on each.
export const BOT_CHANNELS = { WhatsApp: 'send_whatsapp', Email: 'send_email', 'Live chat': 'send_live_chat', Instagram: 'send_instagram_dm', Facebook: 'send_messenger', SMS: 'send_sms' };
const BOT_DAILY_REPLIES = 30;

/** The agent's answer split into the text for the client and what the bot decided ([[TRANSFERIR]], [[ENCERRAR]], [[AGENDAR AAAA-MM-DD HH:MM]]). */
export function botDecision(reply) {
  const raw = String(reply ?? '');
  const booking = raw.match(/\[\[\s*AGENDAR\s+(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})\s*\]\]/i);
  const action = /\[\[\s*TRANSFERIR\s*\]\]/i.test(raw) ? 'handoff' : booking ? 'book' : /\[\[\s*ENCERRAR\s*\]\]/i.test(raw) ? 'end' : 'reply';
  const text = raw.replace(/\[\[[^\]]{0,40}\]\]/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
  return { action, text, day: booking?.[1] || '', time: booking?.[2] || '' };
}

// "Código personalizado": the lines of the step ("nome = expressão", "//" comments), or the first problem.
export function customCodeLines(code) {
  const lines = [];
  for (const [index, raw] of String(code || '').split('\n').entries()) {
    const text = raw.trim();
    if (!text || text.startsWith('//')) continue;
    const match = text.match(/^([A-Za-z_]\w{0,39})\s*=(?!=)\s*([\s\S]+)$/);
    if (!match) return { error: `linha ${index + 1}: use nome = expressão` };
    lines.push({ line: index + 1, name: match[1], expression: match[2] });
  }
  if (!lines.length) return { error: 'escreva pelo menos uma linha nome = expressão' };
  if (lines.length > 50) return { error: 'até 50 linhas' };
  return lines;
}

// "Definir data do evento": a date (and time) as written by people or stored in a field, read in the sub-account's
// time zone: 2026-12-01, 2026-12-01 19:30, 01/12/2026, 01/12/2026 19:30 or a full ISO date. Returns ms, or null.
export function eventInstant(value, zone = 'America/Sao_Paulo') {
  const raw = String(value || '').trim();
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s+(\d{2}):(\d{2}))?$/);
  if (br) m = [raw, br[3], br[2], br[1], br[4], br[5]];
  if (!m) { const at = /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? Date.parse(raw) : NaN; return Number.isFinite(at) ? at : null; }
  const [y, mo, d, h, mi] = m.slice(1).map(part => Number(part ?? 0));
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // The zone's offset at that moment (Intl), applied once more to settle daylight-saving edges.
  const offsetAt = at => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(at)).map(part => [part.type, part.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - at;
  };
  try { const first = guess - offsetAt(guess); return guess - offsetAt(first); } catch { return null; }
}

// "Formatar data": AAAA-MM-DD, a date with time or "hoje", plus some days, in the sub-account's time zone.
export function formatDate(value, days = 0, format = 'br', zone = 'America/Sao_Paulo') {
  const raw = String(value || '').trim();
  const at = /^(hoje|today|hoy)$/i.test(raw) ? Date.now()
    : /^\d{4}-\d{2}-\d{2}$/.test(raw) ? Date.parse(`${raw}T12:00:00Z`)
      : /^\d{2}\/\d{2}\/\d{4}$/.test(raw) ? Date.parse(`${raw.slice(6)}-${raw.slice(3, 5)}-${raw.slice(0, 2)}T12:00:00Z`) : Date.parse(raw);
  if (!Number.isFinite(at)) return null;
  const date = new Date(at + days * 864e5), dateOnly = /^\d{4}-\d{2}-\d{2}$|^\d{2}\/\d{2}\/\d{4}$/.test(raw);
  const timeZone = dateOnly ? 'UTC' : zone;
  const part = options => new Intl.DateTimeFormat('pt-BR', { timeZone, ...options }).format(date);
  if (format === 'iso') return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  if (format === 'long') return part({ day: 'numeric', month: 'long', year: 'numeric' });
  if (format === 'weekday') return part({ weekday: 'long' });
  if (format === 'time') return dateOnly ? null : part({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return part({ day: '2-digit', month: '2-digit', year: 'numeric' });
}

// "Formatar número": accepts 1234.5, 1.234,56 or R$ 1.234,56.
export function formatNumber(value, format = 'decimal') {
  let raw = String(value ?? '').replace(/[R$\s%]/g, '');
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  const n = Number(raw);
  if (raw === '' || !Number.isFinite(n)) return null;
  if (format === 'brl') return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
  if (format === 'integer') return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(n);
  if (format === 'percent') return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n)}%`;
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
// "Teste A/B": draws one path by its percent (paths at 0% are never taken; all at 0% split evenly).
export function pickSplit(routes, random = Math.random) {
  if (!routes?.length) return null;
  const total = routes.reduce((sum, route) => sum + (Number(route.percent) || 0), 0);
  if (!total) return routes[Math.floor(random() * routes.length)] || routes[0];
  let ticket = random() * total;
  for (const route of routes) { ticket -= Number(route.percent) || 0; if (ticket < 0 && route.percent > 0) return route; }
  return routes.findLast(route => route.percent > 0);
}
// "Formatar lista": a text read as a list (a JSON array, or items split by the separator; "\n" is one per line),
// trimmed and without empty items. Lists come back joined by `joiner` (comma, semicolon, pipe, and, line, space, none).
const JOINERS = { comma: ', ', semicolon: '; ', pipe: ' | ', and: ' e ', line: '\n', space: ' ', none: '' };
export function listItems(value, separator = ',') {
  const raw = String(value ?? '').trim();
  let items = null;
  if (raw.startsWith('[')) try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) items = parsed.map(item => typeof item === 'object' && item ? JSON.stringify(item) : String(item ?? '')); } catch { /* not JSON: split below */ }
  const sep = String(separator ?? '') || ',';
  return (items ?? raw.split(sep === '\\n' ? '\n' : sep)).map(item => item.trim()).filter(Boolean);
}
export function formatList(value, { op = 'count', separator = ',', position = 1, search = '', joiner = 'comma' } = {}) {
  const items = listItems(value, separator);
  const join = list => list.join(JOINERS[joiner] ?? JOINERS.comma);
  switch (op) {
    case 'first': return items[0] ?? '';
    case 'last': return items.at(-1) ?? '';
    case 'item': { const n = Math.trunc(Number(position) || 1); return (n < 0 ? items.at(n) : items[n - 1]) ?? ''; }
    case 'contains': return items.some(item => lower(item) === lower(search)) ? 'yes' : 'no';
    case 'unique': { const seen = new Set(); return join(items.filter(item => !seen.has(lower(item)) && seen.add(lower(item)))); }
    case 'sort': return join([...items].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true })));
    case 'reverse': return join([...items].reverse());
    case 'join': return join(items);
    default: return String(items.length);
  }
}
const MAX_LOOP = 50, MAX_RUN_STEPS = 1000;
const MAX_STEPS = 120, MAX_DEPTH = 4, CONDITIONS = ['tag', 'field', 'dnd', 'stage', 'opportunity_status', 'replied', 'submitted', 'trigger', 'var'];
const AI_TIMEOUT = 10 * 60000, VIDEO_TIMEOUT = 40 * 60000;
const scheduledTypes = allTriggers.filter(item => item.scheduled).map(item => item.type);

/* ───────── Validação ───────── */

function cleanConfig(s, spec, raw = {}, { publishing, label }) {
  const out = {};
  for (const field of spec?.fields || []) {
    if (field.kind === 'conditions') continue;
    let value = raw[field.key];
    if (field.kind === 'number') {
      value = value === '' || value === undefined || value === null ? (field.value ?? '') : Number(value);
      if (value !== '' && (!Number.isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max))) fail(`${label}: “${field.label}” fora do intervalo permitido.`);
    } else if (field.kind === 'select') {
      value = str(String(value ?? field.value ?? field.options[0]?.[0] ?? ''), 40);
      if (!field.options.some(([key]) => key === value)) value = field.options[0]?.[0] ?? '';
    } else if (field.kind === 'time') {
      value = /^\d{2}:\d{2}$/.test(value || '') ? value : field.value || '09:00';
    } else if (field.kind === 'datetime') {
      value = value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : '';
    } else value = str(value ?? field.value ?? '', field.kind === 'textarea' ? 4000 : 600);
    if (field.kind === 'ref' && field.required && !value && field.source === 'stages') value = s.stages?.[0]?.id || '';
    const shown = !field.when || Object.entries(field.when).every(([key, expected]) => (raw[key] ?? '') === expected || out[key] === expected);
    if (publishing && shown && field.required && (value === '' || value === undefined)) fail(`${label}: preencha “${field.label}”.`);
    out[field.key] = value;
  }
  return out;
}

function cleanConditions(raw) {
  return (Array.isArray(raw) ? raw : []).slice(0, 10).map(item => ({
    subject: CONDITIONS.includes(item?.subject) ? item.subject : 'tag', op: str(item?.op, 20) || 'has', key: str(item?.key, 80), value: str(item?.value, 200)
  }));
}

export function workflowRecord(s, d) {
  const row = upgradeWorkflow(d);
  const publishing = Boolean(d.active);
  const ids = new Set();
  const uniqueId = value => { let id = /^[a-z0-9]{6,40}$/i.test(value || '') ? value : `n${randomBytes(5).toString('hex')}`; while (ids.has(id)) id = `n${randomBytes(5).toString('hex')}`; ids.add(id); return id; };
  const prior = d.id ? s.workflows.find(item => item.id === d.id) : null;
  const triggers = (row.triggers || []).slice(0, 10).map(raw => {
    const spec = triggerSpec(raw?.type) || fail('Gatilho desconhecido.');
    const config = cleanConfig(s, spec, raw.config, { publishing, label: spec.label });
    const id = uniqueId(raw.id);
    if (spec.type === 'inbound_webhook') config.secret = /^[0-9a-f]{32}$/.test(raw.config?.secret || '') ? raw.config.secret : prior?.triggers?.find(t => t.id === id)?.config?.secret || randomBytes(16).toString('hex');
    return { id, type: spec.type, config };
  });
  let count = 0;
  const list = (steps, depth) => {
    if (depth > 6) fail('Use no máximo 6 níveis de ramificação.');
    return (Array.isArray(steps) ? steps : []).map(raw => {
      if (++count > MAX_STEPS) fail(`Um fluxo aceita até ${MAX_STEPS} etapas.`);
      const spec = actionSpec(raw?.type) || fail('Ação desconhecida.');
      const step = { id: uniqueId(raw.id), type: spec.type, config: cleanConfig(s, spec, raw.config, { publishing, label: spec.label }) };
      if (raw.config?.stopOnError === true) step.config.stopOnError = true;
      if (spec.type === 'filter') { step.config.conditions = cleanConditions(raw.config?.conditions); step.config.match = raw.config?.match === 'any' ? 'any' : 'all'; }
      if (spec.type === 'if_else') { step.config.conditions = cleanConditions(raw.config?.conditions); step.config.match = raw.config?.match === 'any' ? 'any' : 'all'; step.yes = list(raw.yes, depth + 1); step.no = list(raw.no, depth + 1); }
      if (spec.type === 'router') {
        step.routes = (Array.isArray(raw.routes) ? raw.routes : []).slice(0, 6).map((route, index) => ({ id: uniqueId(route?.id), label: str(route?.label, 60) || `Caminho ${index + 1}`, match: route?.match === 'any' ? 'any' : 'all', conditions: cleanConditions(route?.conditions), steps: list(route?.steps, depth + 1) }));
        step.otherwise = list(raw.otherwise, depth + 1);
      }
      if (spec.type === 'loop') {
        step.body = list(raw.body, depth + 1);
        if (publishing && step.config.mode !== 'count' && !String(step.config.items || '').trim()) fail('Repetir: informe a lista.');
        if (publishing && !step.body.length) fail('Repetir: coloque pelo menos uma etapa dentro.');
      }
      if (spec.type === 'split') {
        const routes = (Array.isArray(raw.routes) ? raw.routes : []).slice(0, 6);
        if (routes.length < 2) fail('Teste A/B: use de 2 a 6 caminhos.');
        step.routes = routes.map((route, index) => ({ id: uniqueId(route?.id), label: str(route?.label, 60) || `Caminho ${String.fromCharCode(65 + index)}`, percent: splitPercent(route?.percent), steps: list(route?.steps, depth + 1) }));
        if (publishing && step.routes.reduce((sum, route) => sum + route.percent, 0) !== 100) fail('Teste A/B: os percentuais dos caminhos precisam somar 100%.');
      }
      if (spec.type === 'webhook' && step.config.url && !/^https:\/\/[^\s/]+\.[^\s]+$/i.test(step.config.url)) fail('O webhook precisa de um endereço https://');
      return step;
    });
  };
  const steps = list(row.steps, 0);
  const all = new Set();
  eachStep(steps, step => all.add(step.id));
  eachStep(steps, step => { if (step.type === 'goto' && step.config.target && !all.has(step.config.target)) step.config.target = ''; });
  if (publishing) {
    if (!steps.length) fail('Adicione pelo menos uma ação para publicar.');
    eachStep(steps, step => { if (step.type === 'goto' && !step.config.target) fail('“Ir para outra etapa”: escolha a etapa de destino.'); });
    if (triggers.some(t => t.type === 'scheduler') && triggers.find(t => t.type === 'scheduler').config.tag === '') fail('Agendador: informe a tag dos contatos que entram.');
  }
  let ai = false;
  eachStep(steps, step => { if (actionSpec(step.type)?.ai) ai = true; });
  if (publishing) {
    eachStep(steps, step => {
      const spec = actionSpec(step.type);
      if (step.type === 'ai_decision' && aiOptions(step.config.options).length < 2) fail(`${spec.label}: informe pelo menos duas opções.`);
      if (step.type === 'ai_intent' && aiOptions(step.config.intents).length < 2) fail(`${spec.label}: informe pelo menos duas intenções.`);
      if (step.type === 'ai_extract' && !aiExtractFields(step.config.fields).length) fail(`${spec.label}: informe os dados a extrair, um por linha.`);
      if (step.type === 'custom_code' && customCodeLines(step.config.code).error) fail(`${spec.label}: ${customCodeLines(step.config.code).error}.`);
      if (spec?.ai && step.type !== 'ai_extract' && !aiVariableName(step.config.variable)) fail(`${spec.label}: informe o nome da variável.`);
    });
  }
  // Set only by the server from the saving user's session; the run checks it against the workspace's agency.
  const key = d.aiKey && typeof d.aiKey === 'object' && typeof d.aiKey.session === 'string' ? { session: str(d.aiKey.session, 80), user: str(d.aiKey.user, 80), agency: str(d.aiKey.agency, 120) } : null;
  return { name: str(d.name, 240) || fail('Dê um nome ao fluxo.'), triggers, steps, active: publishing, folderId: d.folderId || '', allowReentry: d.allowReentry !== false, fired: prior?.fired || {},
    aiKey: ai ? key || prior?.aiKey || null : null };
}

/* ───────── Grafo ───────── */

export function compile(steps) {
  const nodes = {};
  const chain = (items, after) => {
    for (let i = items.length - 1; i >= 0; i--) {
      const step = items[i], node = { type: step.type, config: step.config || {}, next: after };
      if (step.type === 'if_else') { node.yes = chain(step.yes || [], after); node.no = chain(step.no || [], after); }
      if (step.type === 'router') { node.routes = (step.routes || []).map(route => ({ label: route.label, match: route.match, conditions: route.conditions || [], first: chain(route.steps || [], after) })); node.otherwise = chain(step.otherwise || [], after); }
      if (step.type === 'split') node.routes = (step.routes || []).map(route => ({ label: route.label, percent: route.percent, first: chain(route.steps || [], after) }));
      // The body's last step goes back to the loop step, which decides between the next item and the rest of the flow.
      if (step.type === 'loop') node.body = chain(step.body || [], step.id);
      nodes[step.id] = node;
      after = step.id;
    }
    return after;
  };
  const first = chain(steps || [], '');
  return { nodes, first };
}

/* ───────── Motor ───────── */

export function createEngine({ add, now, preferencePath = null, makeAffiliate = null, requestReview = null, sendDocument = null, sendEstimate = null, sendInvoice = null, startRecurring = null, updateInventory = null, createSocialPost = null, issueCredential = null, ticketAction = null, sequenceAction = null, loyaltyAction = null, onEvent = null, adjustScore = null, removeRecord = null, affiliateAction = null, bookingLink = null, appointmentNote = null, bookAppointment = null, companyAction = null, freeSlots = null, zonedTime = null, dialerAdd = null }) {
  const contactOf = (s, id) => s.contacts.find(row => row.id === id);
  const fieldValue = (s, contact, key) => {
    if (!contact) return '';
    if (key?.startsWith('custom:')) return contact.custom?.[key.slice(7)] ?? '';
    return contact[key] ?? '';
  };
  // Templates use the shared expression engine: {{contact.first_name}}, {{upper(contact.name)}}, {{trigger.body}}…
  const output = (run, id, data) => { run.outputs = { ...(run.outputs || {}), [id]: data }; };
  // A flow value in a condition: a variable, a step result (steps.<id>.<field>) or a custom value of the account (custom_values.<key>).
  const flowValue = (s, run, key = '') => {
    const step = /^steps\.([^.]+)\.(\w+)$/.exec(key);
    if (step) return run.outputs?.[step[1]]?.[step[2]] ?? '';
    if (key.startsWith('custom_values.')) return (s.customValues || []).find(row => row.key === key)?.value ?? '';
    return run.vars?.[aiVariableName(key) || key] ?? '';
  };
  const mergeContext = (s, contact, run = {}) => ({ ...buildWorkflowContext(s, run, contact), workspace: { name: s.profile?.name || '' }, trigger: { ...(run.context || {}), ...(run.context?.payload || {}) }, vars: run.vars || {}, steps: run.outputs || {} });
  const merge = (text, s, contact, run = {}) => {
    const context = { ...buildWorkflowContext(s, run, contact), workspace: { name: s.profile?.name || '' }, trigger: { ...(run.context || {}), ...(run.context?.payload || {}) }, vars: run.vars || {}, steps: run.outputs || {} };
    const out = resolveTemplate(String(text ?? ''), context);
    return out == null ? '' : typeof out === 'object' ? JSON.stringify(out) : String(out);
  };
  const outbox = (s, item) => { s.workflowOutbox ??= []; s.workflowOutbox.push({ id: randomBytes(8).toString('hex'), created: now(), ...item }); if (s.workflowOutbox.length > 500) s.workflowOutbox.splice(0, s.workflowOutbox.length - 500); };

  function test(s, run, cond) {
    const contact = contactOf(s, run.contactId);
    const opportunities = contact ? s.opportunities.filter(row => row.contactId === contact.id) : [];
    const latest = [...opportunities].sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)))[0];
    const value = cond.value;
    switch (cond.subject) {
      case 'tag': { const has = (contact?.tags || []).some(tag => lower(tag) === lower(value)); return cond.op === 'not_has' ? !has : has; }
      case 'dnd': return cond.op === 'on' ? Boolean(contact?.dnd) : !contact?.dnd;
      case 'stage': { const has = opportunities.some(row => row.stage === value); return cond.op === 'not_in' ? !has : has; }
      case 'opportunity_status': return cond.op === 'is_not' ? latest?.status !== value : latest?.status === value;
      case 'replied': { const yes = s.messages.some(row => row.contactId === run.contactId && row.direction === 'Inbound' && row.created >= run.created); return cond.op === 'no' ? !yes : yes; }
      case 'submitted': { const yes = s.submissions.some(row => row.contactId === run.contactId && (!value || row.formId === value)); return cond.op === 'no' ? !yes : yes; }
      case 'field': case 'trigger': case 'var': {
        const actual = cond.subject === 'field' ? fieldValue(s, contact, cond.key) : cond.subject === 'var' ? flowValue(s, run, cond.key) : run.context?.[cond.key] ?? '';
        const a = lower(Array.isArray(actual) ? actual.join(',') : actual), b = lower(value);
        switch (cond.op) {
          case 'equals': return a === b; case 'not_equals': return a !== b; case 'contains': return a.includes(b); case 'not_contains': return !a.includes(b);
          case 'empty': return a === ''; case 'not_empty': return a !== '';
          case 'gt': return Number(actual) > Number(value); case 'lt': return Number(actual) < Number(value);
          default: return false;
        }
      }
      default: return false;
    }
  }
  const passes = (s, run, conditions = [], match = 'all') => !conditions.length || (match === 'any' ? conditions.some(c => test(s, run, c)) : conditions.every(c => test(s, run, c)));

  const eventMatches = (type, value, event, ctx, s) => {
    if (type !== event) return false;
    if (event === 'opportunity_status_changed' && !value) return ctx.status === 'Won';
    if (!value) return true;
    const v = lower(value);
    if (event === 'contact_tag') return ctx.change !== 'removed' && lower(ctx.tag) === v;
    if (event === 'form_submitted') { const form = s.forms.find(row => row.id === ctx.formId); return ctx.formId === value || lower(form?.name) === v; }
    if (event === 'customer_replied') return lower(ctx.body).includes(v);
    return true;
  };

  function matchTrigger(trigger, type, ctx) {
    if (trigger.type !== type) return false;
    const c = trigger.config || {};
    const app = type.startsWith('conn_') ? connectorStep(type) : null;
    if (app?.kind === 'trigger') return app.spec.fields.every(field => {
      const want = String(c[field.key] ?? '').trim();
      if (!want) return true;
      if (field.key === 'keyword') return lower(ctx.text).includes(lower(want));
      if (field.key === 'minTotal') return Number(ctx.total) >= Number(want.replace(',', '.'));
      if (['channel', 'spreadsheetId', 'sheet', 'baseId', 'table', 'reaction'].includes(field.key)) return lower(ctx[field.key]) === lower(want).replace(/^[#:]|:$/g, '');
      return lower(ctx[field.key]).includes(lower(want));
    });
    switch (type) {
      case 'contact_changed': return !c.field || (ctx.fields || []).includes(c.field);
      case 'contact_tag': return (c.change || 'added') === ctx.change && (!c.tag || lower(c.tag) === lower(ctx.tag));
      case 'contact_dnd': return (c.state || 'on') === ctx.state;
      case 'customer_replied': return (!c.channel || c.channel === ctx.channel) && (!c.keyword || lower(ctx.body).includes(lower(c.keyword)));
      case 'social_comment_received': return (!c.network || c.network === ctx.network) && (!c.keyword || lower(ctx.body || ctx.comment).includes(lower(c.keyword)));
      case 'social_dm_received': return (!c.network || c.network === ctx.network) && (!c.keyword || lower(ctx.body).includes(lower(c.keyword)));
      case 'site_page_viewed': return (!c.projectId || c.projectId === ctx.projectId) && (!c.page || lower(String(c.page).trim().replace(/^\/+|\/+$/g, '') || 'index') === lower(ctx.page));
      case 'external_tracking_event': return (!c.event || c.event === ctx.event) && (!c.url || lower(ctx.url).includes(lower(c.url)));
      case 'score_changed': return scoreTriggerMatches(c, ctx);
      case 'association_created': return !c.object || c.object === ctx.object;
      case 'email_received': return (!c.subject || lower(ctx.subject).includes(lower(c.subject))) && (!c.from || lower(ctx.from).includes(lower(c.from)));
      case 'conversation_ai_event': return (!c.event || c.event === ctx.event) && (!c.agentId || c.agentId === ctx.agentId);
      case 'call_details': return (!c.direction || c.direction === ctx.direction) && (!c.status || c.status === ctx.status) && (!c.numberId || c.numberId === ctx.numberId);
      case 'phone_validated': return (!c.result || c.result === (ctx.valid === 'sim' ? 'valid' : 'invalid')) && (!c.lineType || c.lineType === ctx.lineType);
      case 'ivr_call': return !c.numberId || c.numberId === ctx.numberId;
      case 'dialer_disposition': return !c.disposition || c.disposition === ctx.disposition;
      case 'voice_ai_ended': return (!c.outcome || c.outcome === ctx.outcome) && (!c.agentId || c.agentId === ctx.agentId) && (!c.direction || c.direction === ctx.direction);
      case 'portal_file_uploaded': return !c.kind || c.kind === ctx.kind;
      case 'video_watched': return Number(ctx.percent) === (Number(c.percent) || 25) && (!c.video || lower(ctx.video).includes(lower(c.video))) && (!c.url || lower(ctx.url).includes(lower(c.url)));
      case 'whatsapp_ad_click': return (!c.adId || c.adId === ctx.adId) && (!c.keyword || lower(ctx.body).includes(lower(c.keyword)));
      case 'meta_lead_form': case 'google_lead_form':
        return (!c.formId || c.formId === ctx.formId || lower(ctx.form).includes(lower(c.formId))) && (!c.campaign || c.campaign === ctx.campaignId || lower(ctx.campaign).includes(lower(c.campaign)))
          && (!c.test || c.test === ctx.test);
      case 'ad_lead': return (!c.network || c.network === ctx.network) && (!c.campaign || lower(ctx.campaign).includes(lower(c.campaign)));
      case 'social_post_published': return (!c.status || c.status === ctx.status) && (!c.network || String(ctx.networks || '').split(',').includes(c.network)) && (!c.categoryId || c.categoryId === ctx.categoryId);
      case 'form_submitted': case 'survey_submitted': return (!c.formId || c.formId === ctx.formId) && (!c.qualified || c.qualified === ctx.qualified);
      case 'quiz_submitted': return (!c.formId || c.formId === ctx.formId) && (!c.qualified || c.qualified === ctx.qualified) && (!c.tier || lower(c.tier) === lower(ctx.tier));
      case 'trigger_link_clicked': return !c.linkId || c.linkId === ctx.linkId;
      case 'chat_started': return !c.widgetId || c.widgetId === ctx.widgetId;
      case 'webinar_registered': return !c.webinarId || c.webinarId === ctx.webinarId;
      case 'loyalty_reward_redeemed': return !c.rewardId || c.rewardId === ctx.rewardId;
      case 'loyalty_tier_changed': return !c.tier || String(c.tier).toLowerCase() === String(ctx.tier || '').toLowerCase();
      case 'preferences_changed': return !c.all || c.all === ctx.all;
      case 'email_sequence_completed': return !c.sequenceId || c.sequenceId === ctx.sequenceId;
      case 'ticket_created': return (!c.priority || c.priority === ctx.priority) && (!c.category || c.category === ctx.category);
      case 'ticket_status_changed': return (!c.status || c.status === ctx.status) && (!c.priority || c.priority === ctx.priority);
      case 'badge_issued': case 'certificate_issued': case 'course_completed':
      case 'lesson_completed': case 'lesson_started': case 'course_access_granted': case 'course_access_revoked':
      case 'course_started': case 'course_module_started': case 'course_module_completed': return !c.courseId || c.courseId === ctx.courseId;
      case 'affiliate_campaign_enrolled': return !c.campaignId || c.campaignId === ctx.campaignId;
      case 'offer_access_granted': case 'offer_access_revoked': return !c.offerId || c.offerId === ctx.offerId;
      case 'community_event_checked_in': return (!c.communityId || c.communityId === ctx.communityId) && (!c.eventId || c.eventId === ctx.eventId);
      case 'community_channel_granted': case 'community_channel_revoked': return !c.channel || c.channel === `${ctx.communityId}:${ctx.channelId}`;
      case 'community_level_changed': return (!c.communityId || c.communityId === ctx.communityId) && (!c.direction || c.direction === ctx.direction) && (!c.level || String(c.level) === String(ctx.level));
      case 'course_quiz_submitted': return (!c.courseId || c.courseId === ctx.courseId) && (!c.passed || c.passed === ctx.passed);
      case 'course_assignment_submitted': return !c.courseId || c.courseId === ctx.courseId;
      case 'course_assignment_graded': return (!c.courseId || c.courseId === ctx.courseId) && (!c.status || c.status === ctx.status);
      case 'community_member_joined': case 'community_post_created': case 'community_comment_created':
      case 'community_join_requested': case 'community_join_rejected': return !c.communityId || c.communityId === ctx.communityId;
      case 'community_access_revoked': return (!c.communityId || c.communityId === ctx.communityId) && (!c.reason || c.reason === ctx.reason);
      case 'portal_login': return !c.first || c.first === ctx.first;
      case 'community_event_registered': return (!c.communityId || c.communityId === ctx.communityId) && (!c.eventId || c.eventId === ctx.eventId) && (!c.paid || c.paid === ctx.paid);
      case 'review_received': return !c.maxScore || Number(ctx.score) <= Number(c.maxScore);
      case 'video_testimonial': return !c.collectorId || c.collectorId === ctx.collectorId;
      case 'affiliate_created': case 'affiliate_lead': case 'affiliate_sale': return !c.affiliateId || c.affiliateId === ctx.affiliateId;
      case 'appointment_status': return !c.status || c.status === ctx.status;
      case 'field_status_changed': return !c.status || c.status === ctx.status;
      case 'meeting_summarized': return !c.sentiment || c.sentiment === ctx.sentiment;
      case 'opportunity_created': return !c.pipelineId || c.pipelineId === ctx.pipelineId;
      case 'opportunity_status_changed': return !c.status || c.status === ctx.status;
      case 'pipeline_stage_changed': return !c.stageId || c.stageId === ctx.stageId;
      case 'invoice_status': return !c.status || c.status === ctx.status;
      case 'estimate_status': return !c.status || c.status === ctx.status;
      case 'recurring_invoice_status': return !c.status || c.status === ctx.status;
      case 'document_paid': return !c.templateId || c.templateId === ctx.templateId;
      case 'document_status': return (!c.status || c.status === ctx.status) && (!c.templateId || c.templateId === ctx.templateId);
      case 'order_submitted': case 'order_paid': case 'order_fulfilled': return !c.storeId || c.storeId === ctx.storeId;
      case 'email_event': return (!c.event || c.event === ctx.event) && (!c.campaignId || c.campaignId === ctx.campaignId);
      case 'product_review': return (!c.storeId || c.storeId === ctx.storeId) && (!c.rating || Number(ctx.rating) <= Number(c.rating));
      case 'abandoned_checkout': return (!c.storeId || c.storeId === ctx.storeId) && (!c.status || c.status === ctx.status);
      case 'inbound_webhook': return ctx.triggerId === trigger.id;
      case 'ai_usage_alert': return !c.level || c.level === ctx.level;
      case 'service_booked': return (!c.serviceId || c.serviceId === ctx.serviceId) && (!c.kind || c.kind === ctx.kind);
      case 'subscription_status': return !c.status || c.status === ctx.status;
      case 'coupon_redeemed': case 'coupon_limit_reached': case 'coupon_expired': return !c.couponId || c.couponId === ctx.couponId;
      case 'coupon_applied': return (!c.couponId || c.couponId === ctx.couponId) && (!c.storeId || c.storeId === ctx.storeId);
      case 'product_viewed': return (!c.storeId || c.storeId === ctx.storeId) && (!c.productId || c.productId === ctx.productId);
      case 'conversation_sla': return (!c.state || c.state === ctx.state) && (!c.channel || c.channel === ctx.channel);
      case 'cart_updated': return !c.storeId || c.storeId === ctx.storeId;
      case 'custom_event': return !c.event || lower(String(c.event).trim()) === lower(ctx.event);
      case 'user_replied': return (!c.channel || c.channel === ctx.channel) && (!c.user || lower(c.user) === lower(ctx.user)) && (!c.keyword || lower(ctx.body).includes(lower(c.keyword)));
      case 'message_failed': return (!c.channel || c.channel === ctx.channel) && (!c.reason || c.reason === ctx.reason);
      case 'prospect_received': return (!c.isNew || c.isNew === ctx.isNew) && (!c.withOpportunity || c.withOpportunity === ctx.withOpportunity) && (!c.category || lower(ctx.category).includes(lower(c.category)));
      default: return scheduledTypes.includes(type) ? ctx.triggerId === trigger.id : true;
    }
  }

  function enroll(s, workflow, ctx = {}, event = '') {
    const contactId = ctx.contactId || '';
    if (contactId && workflow.allowReentry === false && s.runs.some(row => row.workflowId === workflow.id && row.contactId === contactId)) return '';
    if (contactId && s.runs.some(row => row.workflowId === workflow.id && row.contactId === contactId && ['Running', 'Waiting'].includes(row.status))) return '';
    const graph = compile(upgradeWorkflow(workflow).steps);
    const context = Object.fromEntries(Object.entries(ctx).filter(([key, value]) => !['depth'].includes(key) && (typeof value !== 'object' || key === 'payload')).map(([key, value]) => [key, key === 'payload' ? JSON.parse(JSON.stringify(value).slice(0, 8000) || '{}') : String(value).slice(0, 500)]));
    const run = add(s, 'runs', { name: workflow.name, workflowId: workflow.id, event, contactId, context, graph, at: graph.first, results: [], steps: 0, status: 'Running', nextAction: 0, actions: [] });
    if (s.runs.length > 20000) s.runs.splice(0, s.runs.length - 20000);
    // Started by a booking: "Aguardar em relação à data do evento" counts from the appointment without an extra step.
    const booked = ctx.appointmentId && (s.appointments || []).find(row => row.id === ctx.appointmentId);
    if (booked) {
      const zone = s.profile?.timezone || 'America/Sao_Paulo', when = new Date(booked.start), part = options => new Intl.DateTimeFormat('pt-BR', { timeZone: zone, ...options }).format(when);
      run.eventDate = when.toISOString();
      run.vars = { data_evento: run.eventDate, evento_dia: part({ weekday: 'long', day: '2-digit', month: '2-digit' }), evento_hora: part({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) };
    }
    proceed(s, run, (ctx.depth || 0) + 1);
    return run.id;
  }

  function perform(s, run, node, depth, id) {
    const contact = contactOf(s, run.contactId), c = node.config || {}, text = value => merge(value, s, contact, run);
    const needsContact = !['internal_notification', 'custom_event', 'webhook', 'create_task', 'create_social_post', 'update_custom_value', 'date_format', 'number_format', 'list_format', 'create_contact', 'find_contact'].includes(node.type);
    if (needsContact && !contact) return 'sem contato';
    const message = (channel, body, subject = '') => add(s, 'messages', { contactId: contact.id, body: text(body).slice(0, 5000), subject, channel, direction: 'Outbound', read: true, starred: false, origin: 'workflow', workflowId: run.workflowId });
    switch (node.type) {
      case 'add_tag': case 'remove_tag': {
        const tag = text(c.tag).trim(), has = (contact.tags || []).some(t => lower(t) === lower(tag));
        if (node.type === 'add_tag' && !has) { contact.tags = tagList([...(contact.tags || []), tag]); emit(s, 'contact_tag', { contactId: contact.id, change: 'added', tag, depth }); }
        if (node.type === 'remove_tag' && has) { contact.tags = contact.tags.filter(t => lower(t) !== lower(tag)); emit(s, 'contact_tag', { contactId: contact.id, change: 'removed', tag, depth }); }
        return 'concluída';
      }
      case 'update_field': {
        const value = text(c.value);
        if (c.field?.startsWith('custom:')) {
          const field = (s.customFields || []).find(row => row.id === c.field.slice(7));
          if (!field) return 'campo removido';
          contact.custom = { ...(contact.custom || {}), [field.id]: ['Number', 'Monetary'].includes(field.type) ? Number(value) || 0 : field.type === 'Checkbox' ? ['sim', 'true', '1', 'yes'].includes(lower(value)) : value.slice(0, 5000) };
        } else if (['name', 'email', 'phone', 'company'].includes(c.field)) {
          if (c.field === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'e-mail inválido';
          contact[c.field] = c.field === 'email' ? value.toLowerCase() : value.slice(0, 240);
        } else return 'campo inválido';
        contact.updated = now();
        return 'concluída';
      }
      case 'assign_user': case 'remove_user': {
        let meta = s.threads.find(row => row.contactId === contact.id);
        if (!meta) meta = add(s, 'threads', { contactId: contact.id, assignee: '', followers: [] });
        meta.assignee = node.type === 'assign_user' ? text(c.user).slice(0, 80) : '';
        meta.updated = now();
        return 'concluída';
      }
      case 'set_dnd': {
        const on = c.state !== 'off';
        if (Boolean(contact.dnd) !== on) { contact.dnd = on; contact.updated = now(); emit(s, 'contact_dnd', { contactId: contact.id, state: on ? 'on' : 'off', depth }); }
        return 'concluída';
      }
      case 'add_note': message('Note', c.body); return 'concluída';
      case 'send_email': {
        // Sent by the server through the sub-account's sending domain, with the contact's preference link in the footer.
        if (contact.dnd) return 'contato em não perturbe';
        if (!canMessage(contact, 'Email', c.topicId)) return 'contato não aceita este e-mail (preferências)';
        const subject = text(c.subject).trim().slice(0, 240);
        const row = message('Email', c.body, subject);
        if (!contact.email) { messageFailed(s, { messageId: row.id, reason: 'no_email' }, depth); return 'erro: contato sem e-mail'; }
        const path = preferencePath ? preferencePath(contact) : '';
        outbox(s, { kind: 'email', runId: run.id, to: contact.email, subject: subject || (s.profile?.name ? `Mensagem de ${s.profile.name}` : 'Mensagem'),
          body: `${row.body}${path ? `\n\n—\nPara escolher o que você recebe: ${path}` : ''}`, path, contactId: contact.id, messageId: row.id });
        return 'registrada e na fila de envio';
      }
      case 'send_optin': {
        // "Pedir consentimento": the contact's preference page, where they choose channels and topics (Preferências mudaram fires).
        if (contact.dnd) return 'contato em não perturbe';
        if (!preferencePath) return 'erro: preferências indisponíveis';
        const channel = c.channel === 'Email' ? 'Email' : 'WhatsApp';
        const path = preferencePath(contact), raw = String(c.body || '');
        const body = raw.includes('{{link_preferencias}}') ? raw.split('{{link_preferencias}}').join(path) : `${raw.trim()}\n${path}`;
        const row = message(channel, body, channel === 'Email' ? text(c.subject).trim().slice(0, 240) || 'Suas preferências de comunicação' : '');
        contact.optInRequestedAt = now();
        if (channel === 'Email') {
          if (!contact.email) { messageFailed(s, { messageId: row.id, reason: 'no_email' }, depth); return 'erro: contato sem e-mail'; }
          outbox(s, { kind: 'email', runId: run.id, to: contact.email, subject: row.subject, body: row.body, path, contactId: contact.id, messageId: row.id });
        } else {
          if (!contact.phone) { messageFailed(s, { messageId: row.id, reason: 'no_phone' }, depth); return 'erro: contato sem telefone'; }
          outbox(s, { kind: 'whatsapp', runId: run.id, phone: contact.phone, body: row.body, path, contactId: contact.id, messageId: row.id });
        }
        return 'pedido de consentimento na fila de envio';
      }
      case 'send_sms': if (contact.dnd) return 'contato em não perturbe'; if (!canMessage(contact, 'SMS', c.topicId)) return 'contato não aceita SMS (preferências)'; message('SMS', c.body); return 'registrada em Conversas';
      case 'send_live_chat': {
        // Optional reply buttons: the visitor taps one and it is sent as their message.
        const row = message('Live chat', c.body);
        const buttons = [...new Set(text(c.buttons).split('\n').map(line => line.trim().slice(0, 30)).filter(Boolean))].slice(0, 6);
        if (buttons.length) row.buttons = buttons;
        return buttons.length ? `enviada ao chat com ${buttons.length} botão(ões)` : 'enviada ao chat';
      }
      case 'push_notification': {
        // "Notificação push": to the team's mobile app or to the contact's devices (client portal); the server sends.
        const title = text(c.title).trim().slice(0, 80), body = text(c.body).trim().slice(0, 240);
        if (!title || !body) return 'erro: escreva o título e o texto';
        const target = c.target === 'contact' ? 'contact' : 'team';
        const link = text(c.url).trim().slice(0, 500);
        const url = /^https:\/\/\S+$/i.test(link) || /^\/[\w\-/#?=&.%]*$/.test(link) ? link : target === 'team' ? `/app#conversations` : '';
        outbox(s, { kind: 'push', runId: run.id, target, contactId: contact.id, title, body, url, tag: `wf-${run.workflowId}` });
        return target === 'team' ? 'notificação para a equipe na fila' : 'notificação para o contato na fila';
      }
      case 'dialer_add': {
        // "Adicionar ao discador": the contact goes to the power dialer queue (Conversas → Discador).
        if (!dialerAdd) return 'erro: discador indisponível';
        if (!e164(contact.phone)) return 'erro: contato sem telefone válido';
        return dialerAdd(s, contact) ? 'na fila do discador' : 'já estava na fila do discador';
      }
      case 'voice_ai_call': {
        // "Ligação do Voice AI": the server dials the contact and the agent talks (voice-ai.mjs), with this flow's OpenAI.
        const number = (s.phone?.numbers || []).find(row => row.id === c.numberId);
        if (!number) return 'erro: número do Graao não encontrado (Configurações → Telefonia)';
        const agent = (s.agents || []).find(row => row.id === c.agentId);
        if (!agent) return 'erro: agente não encontrado';
        if (!agent.published) return 'erro: o agente não está publicado';
        if (contact.dnd) return 'contato em não perturbe';
        const to = e164(contact.phone);
        if (!to) return 'erro: contato sem telefone válido';
        outbox(s, { kind: 'voice-ai-call', runId: run.id, workflowId: run.workflowId, contactId: contact.id, numberId: number.id, to,
          voice: { agentId: agent.id, goal: text(c.goal).trim().slice(0, 1500), welcome: text(c.welcome).trim().slice(0, 400), voice: c.voice, transfer: text(c.transfer).trim(), serviceId: c.serviceId || '', maxMinutes: c.maxMinutes } });
        return `${agent.name} vai ligar para ${to}`;
      }
      case 'call': case 'voicemail_drop': {
        const number = (s.phone?.numbers || []).find(row => row.id === c.numberId);
        if (!number) return 'erro: número do Graao não encontrado (Configurações → Telefonia)';
        if (contact.dnd) return 'contato em não perturbe';
        const to = e164(contact.phone);
        if (!to) return 'erro: contato sem telefone válido';
        if (node.type === 'call') {
          const agent = e164(text(c.agentPhone)) || e164((number.forward || [])[0]);
          if (!agent) return 'erro: informe o telefone da equipe ou o encaminhamento do número';
          outbox(s, { kind: 'phone-call', runId: run.id, workflowId: run.workflowId, contactId: contact.id, numberId: number.id, to, agent });
          return `ligando para ${agent} e depois para ${to}`;
        }
        const message = c.kind === 'play' ? '' : text(c.message).trim().slice(0, 1500), url = c.kind === 'play' ? text(c.url).trim().slice(0, 1000) : '';
        if (c.kind === 'play' ? !/^https:\/\/\S+$/i.test(url) : !message) return c.kind === 'play' ? 'erro: endereço do áudio inválido (use https://)' : 'erro: escreva o recado';
        outbox(s, { kind: 'voicemail-drop', runId: run.id, workflowId: run.workflowId, contactId: contact.id, numberId: number.id, to, message, url });
        return `recado na fila para ${to}`;
      }
      case 'conversation_ai_status': {
        if (c.state === 'off') {
          if (!contact.aiBot) return 'o bot já estava desligado';
          delete contact.aiBot;
          return 'bot desligado';
        }
        const agent = (s.agents || []).find(row => row.id === c.agentId);
        if (!agent) return 'erro: agente não encontrado';
        if (!agent.published) return 'erro: o agente não está publicado';
        contact.aiBot = { status: 'on', agentId: agent.id, mode: c.mode === 'suggest' ? 'suggest' : 'auto', channel: BOT_CHANNELS[c.channel] ? c.channel : 'last',
          serviceId: str(c.serviceId, 80), workflowId: run.workflowId, since: now(), day: '', replies: 0 };
        return `bot ligado com ${agent.name}`;
      }
      case 'custom_code': {
        // "Código personalizado": lines "nome = expressão" in the Graao expression language — parsed, never eval'd, with
        // no network or disk. Each result is a flow variable; the next lines use it by name and later steps as {{vars.nome}}.
        const lines = customCodeLines(c.code);
        if (lines.error) return `erro: ${lines.error}`;
        const out = {};
        for (const { line, name, expression } of lines) {
          let value;
          try { value = evaluateExpression(expression, { ...out, ...mergeContext(s, contact, run) }); } catch (problem) { return `erro: linha ${line}: ${problem.message}`; }
          const result = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
          out[name] = result.slice(0, 4000);
          run.vars = { ...(run.vars || {}), [name]: out[name] };
        }
        output(run, id, out);
        return Object.entries(out).map(([name, value]) => `${name} = ${value.slice(0, 40)}`).join(', ').slice(0, 200);
      }
      case 'log_call': {
        // "Registrar ligação": a call made or received outside the Graao, in the call log and in Conversas.
        const direction = c.direction === 'inbound' ? 'inbound' : 'outbound';
        const status = ['answered', 'missed', 'voicemail', 'busy'].includes(c.status) ? c.status : 'answered';
        const minutes = Math.max(0, Math.min(600, Number(text(c.duration)) || 0));
        const notes = text(c.notes).trim().slice(0, 2000);
        const call = add(s, 'calls', { contactId: contact.id, direction, status, duration: Math.round(minutes * 60), notes, phone: text(c.phone).trim().slice(0, 40) || contact.phone || '',
          source: 'external', workflowId: run.workflowId });
        const label = `${direction === 'inbound' ? 'Ligação recebida' : 'Ligação feita'} · ${({ answered: 'atendida', missed: 'não atendida', voicemail: 'caixa postal', busy: 'ocupado' })[status]}${minutes ? ` · ${minutes} min` : ''}`;
        add(s, 'messages', { contactId: contact.id, body: [label, notes].filter(Boolean).join('\n'), channel: 'Call', direction: direction === 'inbound' ? 'Inbound' : 'Outbound', read: true, starred: false,
          origin: 'workflow', workflowId: run.workflowId, callId: call.id });
        output(run, id, { callId: call.id, status });
        return label;
      }
      case 'set_event_date': {
        // "Definir data do evento": the date the "Aguardar em relação à data do evento" steps count from.
        const raw = text(c.date).trim();
        const at = eventInstant(raw, s.profile?.timezone || 'America/Sao_Paulo');
        if (at === null) return `erro: data inválida: ${raw.slice(0, 40) || '(vazia)'}`;
        run.eventDate = new Date(at).toISOString();
        run.vars = { ...(run.vars || {}), data_evento: run.eventDate };
        output(run, id, { eventDate: run.eventDate });
        return `data do evento: ${run.eventDate}`;
      }
      case 'send_instagram_dm': case 'send_messenger': {
        // Delivered through the page connected in the Social Planner, to the id Meta gave when the contact wrote first.
        const network = node.type === 'send_messenger' ? 'facebook' : 'instagram', channel = network === 'facebook' ? 'Facebook' : 'Instagram';
        const place = network === 'facebook' ? 'Messenger' : 'Direct';
        if (contact.dnd) return 'contato em não perturbe';
        if (!text(c.body).trim()) return 'erro: mensagem vazia';
        const buttons = [...new Set(text(c.buttons).split('\n').map(line => line.trim().slice(0, 20)).filter(Boolean))].slice(0, 13);
        const row = message(channel, c.body);
        if (buttons.length) row.buttons = buttons;
        const recipients = Object.fromEntries(Object.entries(contact.metaIds || {}).filter(([key]) => key.startsWith(`${network}:`)));
        if (!Object.keys(recipients).length) { messageFailed(s, { messageId: row.id, reason: 'no_recipient' }, depth); return `erro: o contato ainda não escreveu pelo ${place}`; }
        outbox(s, { kind: 'meta-message', runId: run.id, network, recipients, body: row.body, buttons, contactId: contact.id, messageId: row.id });
        return `registrada e na fila de envio (${place})`;
      }
      case 'create_social_post': {
        if (!createSocialPost) return 'erro: planejador social indisponível';
        const made = createSocialPost(s, c, text);
        if (made.error) return `erro: ${made.error}`;
        output(run, id, { id: made.id, status: made.status });
        return made.status === 'scheduled' ? 'post agendado' : made.status === 'in_review' ? 'post enviado para aprovação' : made.problem ? `rascunho criado: ${made.problem}`.slice(0, 300) : 'rascunho criado';
      }
      case 'reply_social_comment': {
        const network = run.context?.network === 'facebook' ? 'facebook' : run.context?.network === 'instagram' ? 'instagram' : '';
        const accountId = String(run.context?.accountId || '');
        const commentId = String(run.context?.commentId || '');
        const channel = network === 'facebook' ? 'Facebook' : 'Instagram';
        if (!network || !/^\d{3,64}$/.test(accountId) || !/^\d{3,64}(?:_\d{3,64})?$/.test(commentId)) return 'erro: esta ação exige um comentário recebido pela Meta';
        if (!text(c.body).trim()) return 'erro: resposta vazia';
        const row = message(channel, c.body);
        row.commentId = commentId;
        row.publicComment = true;
        outbox(s, { kind: 'meta-comment-reply', runId: run.id, network, accountId, commentId, body: row.body, contactId: contact.id, messageId: row.id });
        return 'registrada e na fila de resposta pública';
      }
      case 'adjust_score': {
        const points = Math.round(Number(text(c.points)));
        if (!Number.isFinite(points) || !points) return 'erro: pontos inválidos';
        if (!adjustScore) return 'erro: pontuação indisponível';
        const score = adjustScore(s, contact, Math.max(-1000, Math.min(1000, points)), `Automação: ${run.name}`, depth);
        output(run, id, { score });
        return `pontuação: ${score}`;
      }
      case 'loyalty_points': {
        const points = Math.round(Number(text(c.points)));
        if (!points || Math.abs(points) > 1000000) return 'erro: pontos inválidos';
        if (!s.loyalty?.enabled) return 'programa de fidelidade desligado';
        loyaltyAction?.(s, contact, points, text(c.reason) || `Automação: ${run.name}`, depth);
        return `${points > 0 ? '+' : ''}${points} pontos`;
      }
      case 'add_to_sequence': case 'remove_from_sequence': return sequenceAction ? sequenceAction(s, contact, node.type, c.sequenceId) : 'erro: sequências indisponíveis';
      case 'create_ticket': case 'update_ticket': {
        if (node.type === 'create_ticket' && !text(c.subject)) return 'erro: informe o assunto do ticket';
        const ticket = ticketAction?.(s, contact, node.type, { ...c, subject: text(c.subject), description: text(c.description) }, depth);
        if (!ticket) return node.type === 'create_ticket' ? 'erro: tickets indisponíveis' : 'contato sem ticket aberto';
        output(run, id, { number: ticket.number, ticketId: ticket.id });
        return node.type === 'create_ticket' ? `ticket #${ticket.number} criado` : `ticket #${ticket.number}: ${ticket.status}`;
      }
      case 'issue_certificate': case 'issue_badge': {
        const kind = node.type === 'issue_badge' ? 'badge' : 'certificate';
        if (!contact.name && !contact.email) return 'erro: contato sem nome nem e-mail';
        const subject = text(c.subject);
        if (!subject) return 'erro: informe sobre o que é o certificado';
        const row = issueCredential?.(s, contact, c.templateId, subject, kind, depth);
        if (!row) return 'erro: modelo de certificado não encontrado';
        output(run, id, { code: row.code });
        return `${kind === 'badge' ? 'badge' : 'certificado'} emitido (${row.code})`;
      }
      case 'grant_course_access': case 'revoke_course_access': case 'grant_community_access': case 'revoke_community_access': {
        // The portal and the communities live in their own documents: the server applies the change after saving.
        const course = node.type.includes('course');
        const target = course ? s.courses.find(row => row.id === c.courseId) : (s.communities || []).find(row => row.id === c.communityId);
        if (!target) return `erro: ${course ? 'curso' : 'comunidade'} não encontrado(a)`;
        if (!contact.email) return 'erro: contato sem e-mail';
        outbox(s, { kind: 'access', runId: run.id, action: node.type, ...(course ? { courseId: target.id } : { communityId: target.id }),
          contactId: contact.id, email: contact.email, name: contact.name || '' });
        return `${target.name}: na fila`;
      }
      case 'register_event': {
        const event = (s.communityEvents || []).find(row => row.id === c.eventId);
        if (!event) return 'erro: evento não encontrado';
        if (event.access === 'paid' && c.ticket !== 'comp') return 'erro: evento pago (o contato precisa comprar o ingresso, ou escolha inscrever como cortesia)';
        if (!contact.email) return 'erro: contato sem e-mail';
        outbox(s, { kind: 'access', runId: run.id, action: node.type, eventId: event.id, communityId: event.communityId, contactId: contact.id, email: contact.email, name: contact.name || '', comp: event.access === 'paid' });
        return `${event.title}: na fila`;
      }
      case 'grant_channel_access': case 'revoke_channel_access': {
        const [groupId, channelId] = String(c.channel || '').split(':');
        const group = (s.communities || []).find(row => row.id === groupId), channel = group?.channels.find(row => row.id === channelId && row.private);
        if (!channel) return 'erro: canal privado não encontrado';
        if (!contact.email) return 'erro: contato sem e-mail';
        outbox(s, { kind: 'access', runId: run.id, action: node.type, communityId: group.id, channelId: channel.id, contactId: contact.id, email: contact.email, name: contact.name || '' });
        return `#${channel.name}: na fila`;
      }
      case 'grant_offer': case 'revoke_offer': case 'community_points': {
        // Offers and community points also live in the portal and community documents: applied by the server after saving.
        const offer = node.type !== 'community_points' && (s.offers || []).find(row => row.id === c.offerId);
        const group = node.type === 'community_points' && (s.communities || []).find(row => row.id === c.communityId);
        if (node.type !== 'community_points' && !offer) return 'erro: oferta não encontrada';
        if (node.type === 'community_points' && !group) return 'erro: comunidade não encontrada';
        const points = Math.trunc(Number(c.points));
        if (group && (!points || Math.abs(points) > 1000)) return 'erro: informe de -1000 a 1000 pontos (diferente de zero)';
        if (!contact.email) return 'erro: contato sem e-mail';
        outbox(s, { kind: 'access', runId: run.id, action: node.type, ...(offer ? { offerId: offer.id } : { communityId: group.id, points, note: text(c.note || '').slice(0, 200) }),
          contactId: contact.id, email: contact.email, name: contact.name || '' });
        return `${offer ? offer.title : group.name}: na fila`;
      }
      case 'company_create': case 'company_update': case 'company_clear': {
        if (!companyAction) return 'erro: empresas indisponíveis';
        const linkedBefore = contact.company;
        const config = { ...c, name: text(c.name || ''), value: text(c.value ?? ''), ...Object.fromEntries(['phone', 'email', 'website', 'city'].map(key => [key, text(c[key] || '')])) };
        const done = companyAction(s, contact, node.type, config);
        if (done.error) return `erro: ${done.error}`;
        output(run, id, { id: done.company.id, name: done.company.name, created: done.created ? 'yes' : 'no' });
        if (node.type === 'company_create' && lower(linkedBefore) !== lower(contact.company)) emit(s, 'association_created', { contactId: contact.id, object: 'company', companyId: done.company.id, title: done.company.name, depth });
        if (node.type === 'company_create') return `${done.company.name}${done.created ? ' (criada)' : ''} associada`;
        return node.type === 'company_update' ? `${done.company.name}: ${c.field} atualizado` : `${done.company.name}: ${done.cleared.join(', ')} limpo(s)`;
      }
      case 'booking_link': {
        if (!bookingLink) return 'erro: agenda indisponível';
        const made = bookingLink(s, contact, { serviceId: c.serviceId || '', days: c.days });
        if (made.error) return `erro: ${made.error}`;
        const name = String(c.variable || '').trim().replace(/[^\w]/g, '_').slice(0, 40);
        if (name) run.vars = { ...(run.vars || {}), [name]: made.url };
        output(run, id, { url: made.url, expires: made.expires });
        return `link criado (vale até ${formatDate(made.expires, 0, 'br', s.profile?.timezone)})`;
      }
      case 'appointment_note': {
        if (!appointmentNote) return 'erro: agenda indisponível';
        const body = text(c.body).trim();
        if (!body) return 'erro: escreva a nota';
        const row = appointmentNote(s, contact, { which: c.which, body, mode: c.mode });
        return row ? `nota em ${row.title}` : 'sem agendamento';
      }
      case 'book_appointment': {
        if (!bookAppointment) return 'erro: agenda indisponível';
        const made = bookAppointment(s, contact, { serviceId: c.serviceId, afterDays: c.afterDays, address: text(c.address || '') });
        if (made.error) return `erro: ${made.error}`;
        output(run, id, { id: made.id, start: made.start, end: made.end, service: made.service, staff: made.staff });
        return `${made.service}: ${formatDate(made.start, 0, 'br', s.profile?.timezone)} às ${formatDate(made.start, 0, 'time', s.profile?.timezone)}${made.staff ? ` com ${made.staff}` : ''}`;
      }
      case 'make_affiliate': return makeAffiliate ? makeAffiliate(s, contact, c.campaignId) : 'erro: afiliados indisponíveis';
      case 'update_affiliate': case 'add_affiliate_campaign': case 'remove_affiliate_campaign': case 'assign_affiliate_lead': case 'affiliate_manual_sale':
        return affiliateAction ? affiliateAction(s, contact, node.type, { ...c, note: text(c.note || '') }, depth) : 'erro: afiliados indisponíveis';
      case 'review_request': {
        const channel = ['WhatsApp', 'SMS', 'Email'].includes(c.channel) ? c.channel : 'WhatsApp';
        if (contact.dnd) return 'contato em não perturbe';
        if (channel === 'Email' && !contact.email) return 'erro: contato sem e-mail';
        if (channel !== 'Email' && !contact.phone) return 'erro: contato sem telefone';
        if (!requestReview) return 'erro: pedidos de avaliação indisponíveis';
        requestReview(s, contact, channel, run);
        return channel === 'SMS' ? 'link de avaliação registrado em Conversas' : 'link de avaliação na fila de envio';
      }
      case 'send_whatsapp': {
        const channel = 'WhatsApp';
        if (contact.dnd) return 'contato em não perturbe';
        if (!canMessage(contact, 'WhatsApp', c.topicId)) return 'contato não aceita WhatsApp (preferências)';
        const row = message(channel, c.body, channel === 'Email' ? 'Sua opinião importa' : '');
        if (!contact.phone) { messageFailed(s, { messageId: row.id, reason: 'no_phone' }, depth); return 'erro: contato sem telefone'; }
        outbox(s, { kind: 'whatsapp', runId: run.id, phone: contact.phone, body: row.body, contactId: contact.id, messageId: row.id });
        return 'registrada e na fila de envio';
      }
      case 'whatsapp_media': {
        // A file by public https URL; the server checks the address before the provider fetches it.
        if (contact.dnd) return 'contato em não perturbe';
        if (!canMessage(contact, 'WhatsApp', c.topicId)) return 'contato não aceita WhatsApp (preferências)';
        const type = ['image', 'video', 'document', 'audio'].includes(c.mediaType) ? c.mediaType : 'image';
        const url = text(c.url).trim().slice(0, 2000), caption = text(c.caption).trim().slice(0, 1000), fileName = text(c.fileName).trim().slice(0, 120);
        if (!/^https:\/\/\S+$/i.test(url)) return 'erro: endereço do arquivo inválido (use https://)';
        const kind = { image: 'Imagem', video: 'Vídeo', document: 'Documento', audio: 'Áudio' }[type];
        const row = message('WhatsApp', [`[${kind}${fileName ? `: ${fileName}` : ''}] ${url}`, caption].filter(Boolean).join('\n'));
        if (!contact.phone) { messageFailed(s, { messageId: row.id, reason: 'no_phone' }, depth); return 'erro: contato sem telefone'; }
        outbox(s, { kind: 'whatsapp-media', runId: run.id, phone: contact.phone, media: { type, url, caption: type === 'audio' ? '' : caption, fileName }, contactId: contact.id, messageId: row.id });
        return `${kind.toLowerCase()} na fila de envio`;
      }
      case 'meta_conversion': {
        // Meta Conversions API: the server sends it with the token of the Meta Ads connection.
        const pixel = String(s.tracking?.metaPixel || '');
        if (!pixel) return 'erro: configure o Pixel da Meta em Marketing → Rastreamento';
        const name = c.event === 'custom' ? text(c.customEvent).trim().replace(/[^\w]/g, '_').slice(0, 40) : String(c.event || 'Lead');
        if (!name) return 'erro: informe o nome do evento personalizado';
        const who = metaIdentity(contact);
        if (!who.email && !who.phone) return 'erro: contato sem e-mail nem telefone';
        const amount = Number(text(c.value).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
        const userData = Object.fromEntries(Object.entries({ em: who.email, ph: who.phone, fn: who.first, ln: who.last, external_id: who.external }).filter(([, v]) => v).map(([k, v]) => [k, [v]]));
        const event = { event_name: name, event_time: Math.floor(Date.now() / 1000), event_id: `${run.id}:${id}`, action_source: 'system_generated', user_data: userData,
          ...(Number.isFinite(amount) && amount > 0 ? { custom_data: { value: Math.round(amount * 100) / 100, currency: /^[A-Z]{3}$/.test(String(c.currency || '')) ? c.currency : 'BRL' } } : {}) };
        outbox(s, { kind: 'meta-capi', runId: run.id, pixel, event, testCode: String(c.testCode || '').trim().slice(0, 40) });
        return `${name} na fila para a Meta`;
      }
      case 'ga4_event': {
        // GA4 Measurement Protocol: the contact is identified by an id derived from it (no e-mail or phone goes to Google).
        const measurementId = String(s.tracking?.ga4 || '');
        if (!measurementId) return 'erro: configure o ID de medição do GA4 em Marketing → Rastreamento';
        if (!s.tracking?.ga4SecretSet) return 'erro: configure o segredo da API do GA4 em Marketing → Rastreamento';
        const name = c.event === 'custom' ? text(c.customEvent).trim().replace(/[^\w]/g, '_').replace(/^[^a-zA-Z]+/, '').slice(0, 40) : String(c.event || 'generate_lead');
        if (!name) return 'erro: informe o nome do evento personalizado';
        const amount = Number(text(c.value).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
        const params = { source: 'graao_workflow', workflow: String(run.name || '').slice(0, 100), engagement_time_msec: 1,
          ...(Number.isFinite(amount) && amount > 0 ? { value: Math.round(amount * 100) / 100, currency: /^[A-Z]{3}$/.test(String(c.currency || '')) ? c.currency : 'BRL' } : {}) };
        const clientId = `${parseInt(sha256(contact.id).slice(0, 8), 16)}.${parseInt(sha256(contact.id).slice(8, 16), 16)}`;
        outbox(s, { kind: 'ga4-event', runId: run.id, measurementId, clientId, userId: contact.id, event: { name, params } });
        return `${name} na fila para o Google Analytics`;
      }
      case 'google_ads_conversion': {
        // Offline conversion: the click that brought the contact (gclid from the attribution) and, if chosen, the
        // hashed e-mail and phone (enhanced conversions for leads). The server sends it with the Google Ads connection.
        const actionId = String(c.actionId || '').replace(/\D/g, '');
        if (!actionId) return 'erro: informe o ID da ação de conversão';
        const gclid = String(contact.attribution?.last?.gclid || contact.attribution?.first?.gclid || '').slice(0, 200);
        const who = metaIdentity(contact), withData = c.identifiers === 'yes';
        if (!gclid && !(withData && (who.email || who.phone))) return 'sem clique do Google Ads (gclid) para este contato';
        const amount = Number(text(c.value).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
        outbox(s, { kind: 'google-ads-conversion', runId: run.id, actionId, gclid, at: now(), value: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0,
          currency: /^[A-Z]{3}$/.test(String(c.currency || '')) ? c.currency : 'BRL',
          email: withData ? who.email : '', phone: withData && metaPhone(contact.phone) ? sha256(`+${metaPhone(contact.phone)}`) : '' });
        return `conversão na fila para o Google Ads${gclid ? '' : ' (sem clique, pelos dados do contato)'}`;
      }
      case 'meta_audience': {
        const audience = String(c.audienceId || '').replace(/\D/g, '');
        if (!audience) return 'erro: informe o ID do público personalizado';
        const who = metaIdentity(contact);
        if (!who.email && !who.phone) return 'erro: contato sem e-mail nem telefone';
        outbox(s, { kind: 'meta-audience', runId: run.id, audience, remove: c.op === 'remove', row: [who.email, who.phone] });
        return c.op === 'remove' ? 'remoção do público na fila' : 'inclusão no público na fila';
      }
      case 'whatsapp_typing': {
        if (contact.dnd) return 'contato em não perturbe';
        if (!contact.phone) return 'erro: contato sem telefone';
        const seconds = Math.min(25, Math.max(1, Math.round(Number(c.seconds) || 3)));
        outbox(s, { kind: 'whatsapp-typing', runId: run.id, phone: contact.phone, seconds });
        return `"digitando…" por ${seconds} s na fila`;
      }
      case 'whatsapp_interactive': {
        if (contact.dnd) return 'contato em não perturbe';
        if (!canMessage(contact, 'WhatsApp', c.topicId)) return 'contato não aceita WhatsApp (preferências)';
        const kind = ['buttons', 'list', 'poll'].includes(c.kind) ? c.kind : 'buttons';
        const limit = { buttons: [3, 20], list: [10, 24], poll: [12, 100] }[kind];
        const options = [...new Set(text(c.options).split('\n').map(line => line.trim()).filter(Boolean))];
        const body = text(c.body).trim().slice(0, 1000);
        if (!body) return 'erro: mensagem vazia';
        if (options.length < (kind === 'poll' ? 2 : 1) || options.length > limit[0]) return `erro: ${kind === 'buttons' ? 'botões' : kind === 'list' ? 'a lista' : 'a enquete'} aceita${kind === 'poll' ? ' de 2' : ' de 1'} a ${limit[0]} opções`;
        if (options.some(option => option.length > limit[1])) return `erro: cada opção tem até ${limit[1]} caracteres`;
        const row = message('WhatsApp', `${body}\n${options.map(option => `• ${option}`).join('\n')}`);
        if (!contact.phone) { messageFailed(s, { messageId: row.id, reason: 'no_phone' }, depth); return 'erro: contato sem telefone'; }
        outbox(s, { kind: 'whatsapp-interactive', runId: run.id, phone: contact.phone, interactive: { kind, body, options, buttonText: kind === 'list' ? text(c.buttonText).trim().slice(0, 20) : '', footer: text(c.footer).trim().slice(0, 60) }, contactId: contact.id, messageId: row.id });
        return `${kind === 'buttons' ? 'botões' : kind === 'list' ? 'lista' : 'enquete'} na fila de envio`;
      }
      case 'internal_notification': add(s, 'teamMessages', { author: 'Automação', body: `${run.name}: ${text(c.body)}`.slice(0, 2000) }); return 'enviada ao chat interno';
      case 'create_task': {
        const due = new Date(Date.now() + (Number(c.dueDays) || 0) * 864e5).toISOString();
        const task = add(s, 'tasks', { title: text(c.title).slice(0, 240) || 'Tarefa do fluxo', contactId: contact?.id || '', due, done: false, owner: text(c.owner).slice(0, 80), notes: '' });
        output(run, id, { id: task.id, title: task.title, due: task.due });
        return 'concluída';
      }
      case 'create_opportunity': {
        const stage = s.stages.find(row => row.id === c.stageId) || s.stages[0];
        const open = s.opportunities.find(row => row.contactId === contact.id && row.pipelineId === stage.pipelineId && row.status === 'Open');
        if (open) {
          const moved = open.stage !== stage.id;
          Object.assign(open, { stage: stage.id, value: Number(c.value) || open.value, updated: now() });
          if (moved) emit(s, 'pipeline_stage_changed', { contactId: contact.id, stageId: stage.id, depth });
          output(run, id, { id: open.id, title: open.title, value: open.value, stage: stage.name });
          return 'atualizada';
        }
        const deal = add(s, 'opportunities', { title: text(c.title).slice(0, 240) || contact.name, contactId: contact.id, stage: stage.id, pipelineId: stage.pipelineId, value: Number(c.value) || 0, status: 'Open', statusChangedAt: now(), source: 'Workflow', owner: '', tags: [], followers: [], company: '', closeDate: '', probability: 0, lostReason: '', custom: {} });
        output(run, id, { id: deal.id, title: deal.title, value: deal.value, stage: stage.name });
        emit(s, 'opportunity_created', { contactId: contact.id, pipelineId: stage.pipelineId, depth });
        return 'criada';
      }
      case 'opportunity_status': {
        const latest = s.opportunities.filter(row => row.contactId === contact.id).sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)))[0];
        if (!latest) return 'sem oportunidade';
        if (latest.status !== c.status) { latest.status = c.status; latest.statusChangedAt = now(); latest.updated = now(); emit(s, 'opportunity_status_changed', { contactId: contact.id, status: c.status, depth }); }
        return 'concluída';
      }
      case 'send_document': {
        if (!sendDocument) return 'indisponível';
        try {
          const doc = sendDocument(s, contact, { ...c, title: text(c.title).slice(0, 160) }, depth);
          output(run, id, { id: doc.id, title: doc.title, total: doc.total });
          return 'enviado';
        } catch (error) { return error.message; }
      }
      case 'send_estimate': {
        if (!sendEstimate) return 'indisponível';
        try {
          const est = sendEstimate(s, contact, c, depth);
          output(run, id, { id: est.id, number: est.number, total: est.total });
          return 'enviado';
        } catch (error) { return error.message; }
      }
      case 'send_invoice': {
        if (!sendInvoice) return 'indisponível';
        try {
          const invoice = sendInvoice(s, contact, c, depth);
          output(run, id, { id: invoice.id, number: invoice.number, value: invoice.value, due: invoice.due });
          return 'enviada';
        } catch (error) { return error.message; }
      }
      case 'update_inventory': {
        if (!updateInventory) return 'indisponível';
        try {
          const product = updateInventory(s)(c);
          output(run, id, { id: product.id, name: product.name, quantity: product.quantity });
          return 'atualizado';
        } catch (error) { return error.message; }
      }
      case 'start_recurring_invoice': {
        if (!startRecurring) return 'indisponível';
        try {
          const rec = startRecurring(s, contact, c, depth);
          output(run, id, { id: rec.id, name: rec.name, total: rec.total, next: rec.nextIssueOn });
          return 'iniciada';
        } catch (error) { return error.message; }
      }
      case 'create_invoice': {
        const due = new Date(Date.now() + (Number(c.dueDays) || 0) * 864e5).toISOString().slice(0, 10);
        const invoice = add(s, 'invoices', { title: text(c.title).slice(0, 240), contactId: contact.id, value: Math.max(0, Math.round((Number(c.value) || 0) * 100) / 100), due, status: 'Open' });
        output(run, id, { id: invoice.id, title: invoice.title, value: invoice.value, due });
        return 'criada';
      }
      case 'math': {
        if (c.field === 'score') {
          // The lead score changes through adjustScore, so "Pontuação do lead mudou" still fires.
          const current = Number(contact.score) || 0, n = Number(c.number) || 0;
          const result = Math.round({ add: current + n, subtract: current - n, multiply: current * n, divide: n ? current / n : current, set: n }[c.op] ?? current);
          const score = adjustScore ? adjustScore(s, contact, result - current, `Automação: ${run.name}`, depth) : current;
          output(run, id, { value: score });
          return `= ${score}`;
        }
        const field = (s.customFields || []).find(row => `custom:${row.id}` === c.field);
        if (!field) return 'campo removido';
        const current = Number(contact.custom?.[field.id]) || 0, n = Number(c.number) || 0;
        const result = { add: current + n, subtract: current - n, multiply: current * n, divide: n ? current / n : current, set: n }[c.op] ?? current;
        contact.custom = { ...(contact.custom || {}), [field.id]: Math.round(result * 100) / 100 };
        output(run, id, { value: contact.custom[field.id] });
        return `= ${contact.custom[field.id]}`;
      }
      case 'text_format': {
        const value = String(fieldValue(s, contact, c.field));
        const out = { upper: value.toUpperCase(), lower: value.toLowerCase(), trim: value.trim(), title: value.toLowerCase().replace(/(^|\s)\p{L}/gu, ch => ch.toUpperCase()) }[c.op] ?? value;
        if (c.field?.startsWith('custom:')) contact.custom = { ...(contact.custom || {}), [c.field.slice(7)]: out }; else contact[c.field] = out;
        return 'concluída';
      }
      case 'set_variable': {
        const name = String(c.name || '').trim().replace(/[^\w]/g, '_').slice(0, 40);
        if (!name) return 'sem nome';
        const value = c.value?.trim().match(/^\{\{[\s\S]*\}\}$/) ? resolveTemplate(c.value, mergeContext(s, contact, run)) : text(c.value);
        run.vars = { ...(run.vars || {}), [name]: typeof value === 'string' ? value.slice(0, 4000) : value };
        output(run, id, { [name]: run.vars[name] });
        return `${name} = ${typeof value === 'string' ? value.slice(0, 60) : JSON.stringify(value).slice(0, 60)}`;
      }
      case 'edit_conversation': {
        const rows = s.messages.filter(row => row.contactId === contact.id);
        if (!rows.length) return 'sem conversa';
        const change = { read: ['read', true], unread: ['read', false], star: ['starred', true], unstar: ['starred', false] }[c.op];
        if (!change) return 'erro: escolha o que fazer';
        if (change[0] === 'read' && !change[1]) rows.at(-1).read = false; else rows.forEach(row => { row[change[0]] = change[1]; });
        return 'concluída';
      }
      case 'conversation_followers': {
        const names = text(c.users).split(',').map(name => name.trim().slice(0, 80)).filter(Boolean).slice(0, 20);
        if (!names.length) return 'erro: informe as pessoas';
        let meta = s.threads.find(row => row.contactId === contact.id);
        if (!meta) meta = add(s, 'threads', { contactId: contact.id, assignee: '', followers: [] });
        const lowered = new Set(names.map(lower));
        const merged = new Map();
        for (const name of [...(meta.followers || []), ...names]) if (!merged.has(lower(name))) merged.set(lower(name), name);
        meta.followers = c.op === 'remove' ? (meta.followers || []).filter(name => !lowered.has(lower(name))) : [...merged.values()];
        meta.updated = now();
        return `seguidores: ${meta.followers.join(', ') || 'ninguém'}`;
      }
      case 'delete_contact': {
        if (!removeRecord) return 'erro: exclusão indisponível';
        const name = contact.name;
        removeRecord(s, 'contacts', contact.id);
        run.contactId = '';
        return `${name} foi para a lixeira`;
      }
      case 'merge_contact': {
        if (!removeRecord) return 'erro: mesclagem indisponível';
        const by = ['email', 'phone'].includes(c.by) ? c.by : 'any', email = lower(contact.email);
        const twins = s.contacts.filter(row => row.id !== contact.id && ((by !== 'phone' && email && lower(row.email) === email) || (by !== 'email' && contact.phone && samePhone(contact.phone, row.phone))));
        if (!twins.length) { output(run, id, { merged: '0', id: contact.id, name: contact.name }); return 'nenhum duplicado'; }
        const order = row => s.contacts.indexOf(row);
        const keeper = c.keep === 'oldest' ? [contact, ...twins].sort((a, b) => String(a.created || '').localeCompare(String(b.created || '')) || order(a) - order(b))[0] : contact;
        const gone = [contact, ...twins].filter(row => row.id !== keeper.id), added = [], wasDnd = Boolean(keeper.dnd);
        const visitors = s.tracking?.visitors || {};
        for (const dup of gone) {
          // The kept contact wins; its empty fields take the duplicate's values. DND from either side is kept.
          for (const key of ['name', 'email', 'phone', 'company']) if (!keeper[key] && dup[key]) keeper[key] = dup[key];
          const filled = Object.entries(keeper.custom || {}).filter(([, value]) => value !== '' && value != null);
          keeper.custom = { ...(dup.custom || {}), ...Object.fromEntries(filled) };
          for (const tag of dup.tags || []) if (!(keeper.tags || []).some(t => lower(t) === lower(tag))) { keeper.tags = [...(keeper.tags || []), tag]; added.push(tag); }
          if (dup.notes && !String(keeper.notes || '').includes(dup.notes)) keeper.notes = [keeper.notes, dup.notes].filter(Boolean).join('\n\n').slice(0, 20000);
          if (dup.dnd) keeper.dnd = true;
          for (const [channel, off] of Object.entries(dup.optOut || {})) if (off) keeper.optOut = { ...keeper.optOut, [channel]: true };
          // One conversation per contact: followers and assignee join the kept thread.
          const thread = (s.threads || []).find(row => row.contactId === keeper.id);
          if (thread) {
            for (const other of s.threads.filter(row => row.contactId === dup.id)) { thread.followers = [...new Set([...(thread.followers || []), ...(other.followers || [])])]; thread.assignee ||= other.assignee || ''; }
            s.threads = s.threads.filter(row => row.contactId !== dup.id);
          }
          // Every record of the duplicate (messages, tasks, deals, bookings, invoices, orders…) moves to the kept contact.
          for (const [key, rows] of Object.entries(s)) {
            if (!Array.isArray(rows) || ['contacts', 'contactTrash', 'runs'].includes(key)) continue;
            for (const row of rows) if (row && typeof row === 'object' && row.contactId === dup.id) row.contactId = keeper.id;
          }
          for (const other of s.runs) if (other.contactId === dup.id) {
            if (other.id !== run.id && ['Running', 'Waiting'].includes(other.status)) { Object.assign(other, { status: 'Removed', at: '', waitFor: null, wakeAt: '' }); other.results?.push('Contato mesclado em outro'); }
            other.contactId = keeper.id;
          }
          for (const [vid, owner] of Object.entries(visitors)) if (owner === dup.id) visitors[vid] = keeper.id;
          // Messenger and Direct ids keep reaching the kept contact (the kept one's own ids win).
          if (dup.metaIds) keeper.metaIds = { ...dup.metaIds, ...(keeper.metaIds || {}) };
          removeRecord(s, 'contacts', dup.id);
        }
        keeper.tags = [...new Set(keeper.tags || [])];
        keeper.updated = now();
        run.contactId = keeper.id;
        output(run, id, { merged: String(gone.length), id: keeper.id, name: keeper.name });
        for (const tag of added) emit(s, 'contact_tag', { contactId: keeper.id, change: 'added', tag, depth });
        if (!wasDnd && keeper.dnd) emit(s, 'contact_dnd', { contactId: keeper.id, state: 'on', depth });
        return `${gone.length} duplicado(s) mesclado(s) em ${keeper.name}${keeper.id === contact.id ? '' : ' (o fluxo segue com ele)'}`;
      }
      case 'create_contact': {
        const name = text(c.name).trim().slice(0, 240), email = lower(text(c.email).trim()).slice(0, 254), phone = text(c.phone).trim().slice(0, 48);
        if (!name && !email && !phone) return 'erro: informe nome, e-mail ou telefone';
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return `erro: e-mail inválido: ${email.slice(0, 60)}`;
        const known = (email && s.contacts.find(row => lower(row.email) === email)) || (phone && s.contacts.find(row => samePhone(phone, row.phone)));
        if (known) { output(run, id, { id: known.id, name: known.name, email: known.email || '', created: 'no' }); return `já existia: ${known.name}`; }
        const tags = tagList(text(c.tags).split(','));
        const made = add(s, 'contacts', { name: name || email || phone, email, phone, tags, company: '', notes: '', custom: {} });
        output(run, id, { id: made.id, name: made.name, email: made.email, created: 'yes' });
        emit(s, 'contact_created', { contactId: made.id, depth });
        for (const tag of tags) emit(s, 'contact_tag', { contactId: made.id, change: 'added', tag, depth });
        return `criado: ${made.name}`;
      }
      case 'find_contact': {
        const wanted = text(c.value).trim();
        if (!wanted) return 'erro: informe o valor procurado';
        const by = ['email', 'phone', 'field'].includes(c.by) ? c.by : 'email';
        if (by === 'field' && !c.field) return 'erro: escolha o campo';
        const match = row => by === 'email' ? lower(row.email) === lower(wanted)
          : by === 'phone' ? samePhone(wanted, row.phone)
          : lower(String(fieldValue(s, row, c.field) ?? '').trim()) === lower(wanted);
        const found = s.contacts.find(match);
        if (!found) { output(run, id, { found: 'no', id: '', name: '', email: '', phone: '' }); return 'não encontrado'; }
        output(run, id, { found: 'yes', id: found.id, name: found.name, email: found.email || '', phone: found.phone || '' });
        if (c.then === 'switch' && found.id !== run.contactId) { run.contactId = found.id; return `encontrado: ${found.name} (o fluxo segue com ele)`; }
        return `encontrado: ${found.name}`;
      }
      case 'opportunity_owner': case 'opportunity_followers': {
        const deal = s.opportunities.filter(row => row.contactId === contact.id && row.status === 'Open' && (!c.pipelineId || row.pipelineId === c.pipelineId))
          .sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)))[0];
        if (!deal) return 'sem oportunidade aberta';
        if (node.type === 'opportunity_owner') {
          const owner = c.op === 'clear' ? '' : text(c.owner).trim().slice(0, 80);
          if (c.op !== 'clear' && !owner) return 'erro: informe a pessoa';
          deal.owner = owner; deal.updated = now();
          return owner ? `${deal.title}: dono ${owner}` : `${deal.title}: sem dono`;
        }
        const names = text(c.users).split(',').map(name => name.trim().slice(0, 48)).filter(Boolean).slice(0, 20);
        if (!names.length) return 'erro: informe as pessoas';
        const gone = new Set(names.map(lower)), merged = new Map();
        for (const name of [...(deal.followers || []), ...names]) if (!merged.has(lower(name))) merged.set(lower(name), name);
        deal.followers = c.op === 'remove' ? (deal.followers || []).filter(name => !gone.has(lower(name))) : [...merged.values()].slice(0, 20);
        deal.updated = now();
        return `${deal.title}: seguidores ${deal.followers.join(', ') || 'ninguém'}`;
      }
      case 'find_opportunity': {
        const deal = s.opportunities.filter(row => row.contactId === contact.id && (!c.pipelineId || row.pipelineId === c.pipelineId) && (!c.status || row.status === c.status))
          .sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)))[0];
        if (!deal) { output(run, id, { found: 'no', id: '', title: '', value: '', stage: '', status: '', owner: '' }); return 'não encontrada'; }
        const stage = s.stages.find(row => row.id === deal.stage);
        output(run, id, { found: 'yes', id: deal.id, title: deal.title, value: deal.value, stage: stage?.name || '', status: deal.status, owner: deal.owner || '' });
        return `encontrada: ${deal.title}`;
      }
      case 'remove_opportunity': {
        if (!removeRecord) return 'erro: exclusão indisponível';
        const latest = s.opportunities.filter(row => row.contactId === contact.id && (!c.pipelineId || row.pipelineId === c.pipelineId))
          .sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)))[0];
        if (!latest) return 'sem oportunidade';
        removeRecord(s, 'opportunities', latest.id);
        return `removida: ${latest.title}`;
      }
      case 'appointment_status_update': {
        if (!['Confirmed', 'Completed', 'Canceled'].includes(c.status)) return 'erro: escolha o status';
        const mine = s.appointments.filter(row => row.contactId === contact.id);
        const stamp = Date.now();
        const next = mine.filter(row => Date.parse(row.start) >= stamp && row.status !== 'Canceled').sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0]
          || mine.sort((a, b) => Date.parse(b.start) - Date.parse(a.start))[0];
        if (!next) return 'sem agendamento';
        if (next.status !== c.status) {
          next.status = c.status; next.updated = now();
          emit(s, 'appointment_status', { contactId: contact.id, appointmentId: next.id, status: c.status, depth });
        }
        output(run, id, { id: next.id, title: next.title, start: next.start, status: next.status });
        return `${next.title}: ${c.status}`;
      }
      case 'update_custom_value': {
        const row = (s.customValues || []).find(item => item.id === c.valueId);
        if (!row) return 'erro: valor personalizado removido';
        row.value = text(c.value).slice(0, 5000);
        row.updated = now();
        return `${row.name} = ${row.value.slice(0, 60)}`;
      }
      case 'date_format': case 'number_format': {
        const name = String(c.variable || '').trim().replace(/[^\w]/g, '_').slice(0, 40);
        if (!name) return 'sem nome';
        const formatted = node.type === 'date_format' ? formatDate(text(c.value), Number(c.days) || 0, c.format, s.profile?.timezone) : formatNumber(text(c.value), c.format);
        if (formatted === null) return `erro: ${node.type === 'date_format' ? 'data' : 'número'} inválido(a): ${text(c.value).slice(0, 40)}`;
        run.vars = { ...(run.vars || {}), [name]: formatted };
        output(run, id, { [name]: formatted });
        return `${name} = ${formatted}`;
      }
      case 'copy_contact': {
        // The server copies it into the other sub-account (same agency) after the run is saved.
        const target = String(c.workspace || '');
        if (!target) return 'erro: escolha a subconta de destino';
        const extra = tagList(text(c.tags).split(','));
        outbox(s, { kind: 'copy-contact', runId: run.id, workspace: target, tags: extra,
          contact: { name: contact.name || '', email: contact.email || '', phone: contact.phone || '', company: contact.company || '', tags: c.copyTags === 'yes' ? contact.tags || [] : [] } });
        return 'na fila para copiar';
      }
      case 'custom_event': {
        // "Disparar evento personalizado": starts the workflows whose "Evento personalizado" trigger has this name.
        const name = text(c.event).trim().slice(0, 60);
        if (!name) return 'erro: informe o nome do evento';
        // Without these limits a workflow without a contact could multiply itself: no self-trigger, at most
        // 5 events per run, and chains of at most three workflows (A → B → C).
        if (depth >= 3) return 'erro: eventos encadeados demais (até 3 fluxos em sequência)';
        run.customEvents = (run.customEvents || 0) + 1;
        if (run.customEvents > 5) return 'erro: no máximo 5 eventos por execução';
        const payload = {};
        for (const line of String(c.data || '').split(/\r?\n/).slice(0, 20)) {
          const at = line.indexOf('=');
          const key = at > 0 ? aiVariableName(line.slice(0, at)) : '';
          if (key && !['event', 'contactid', 'depth', 'payload'].includes(key)) payload[key] = text(line.slice(at + 1)).trim().slice(0, 500);
        }
        // One budget for the whole cascade started by the first event: at most 50 workflows in total.
        const root = !eventCascade;
        const cascade = eventCascade ||= { left: 50 };
        const before = cascade.left;
        try { emit(s, 'custom_event', { contactId: contact?.id || '', event: name, payload, fromWorkflow: run.workflowId, depth }); }
        finally { if (root) eventCascade = null; }
        const started = before - cascade.left;
        if (!started && cascade.left <= 0) return `erro: evento ${name} não disparado (limite de 50 fluxos por cascata de eventos)`;
        return `evento ${name}: ${started} fluxo(s) iniciado(s)`;
      }
      case 'whatsapp_window': {
        // WhatsApp's customer service window: 24 hours from the contact's last WhatsApp message.
        const name = String(c.variable || '').trim().replace(/[^\w]/g, '_').slice(0, 40) || 'janela_whatsapp';
        const last = s.messages.filter(row => row.contactId === contact.id && row.channel === 'WhatsApp' && row.direction === 'Inbound')
          .reduce((latest, row) => (row.created || '') > latest ? row.created : latest, '');
        const left = last ? Math.floor((Date.parse(last) + 864e5 - Date.now()) / 6e4) : 0;
        const values = { [name]: left > 0 ? 'aberta' : 'fechada', [`${name}_minutos`]: String(Math.max(left, 0)) };
        run.vars = { ...(run.vars || {}), ...values };
        output(run, id, values);
        return left > 0 ? `janela aberta (restam ${Math.floor(left / 60)} h ${left % 60} min)` : last ? 'janela fechada (última mensagem há mais de 24 h)' : 'janela fechada (o contato nunca mandou WhatsApp)';
      }
      case 'list_format': {
        const name = String(c.variable || '').trim().replace(/[^\w]/g, '_').slice(0, 40);
        if (!name) return 'sem nome';
        const result = formatList(text(c.value), { op: c.op, separator: c.separator, position: c.position, search: text(c.search).trim(), joiner: c.joiner }).slice(0, 5000);
        run.vars = { ...(run.vars || {}), [name]: result };
        output(run, id, { [name]: result });
        return `${name} = ${result.slice(0, 80)}`;
      }
      case 'webhook': {
        outbox(s, { kind: 'webhook', runId: run.id, url: c.url, method: c.method || 'POST', body: { workflow: { id: run.workflowId, name: run.name }, trigger: run.event, context: run.context,
          contact: contact ? { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone, company: contact.company, tags: contact.tags, custom: contact.custom || {} } : null } });
        return 'na fila de envio';
      }
      default: return 'ignorada';
    }
  }

  function proceed(s, run, depth = 1) {
    if (!run.graph) { // runs saved before the engine: continue the remaining linear actions
      run.graph = compile(upgradeWorkflow({ actions: (run.actions || []).slice(run.nextAction || 0) }).steps);
      run.at = run.graph.first;
    }
    let jumps = 0;
    while (run.at) {
      if (++run.steps > MAX_RUN_STEPS) { run.status = 'Failed'; run.results.push('Fluxo interrompido: etapas demais (possível repetição infinita)'); return; }
      const id = run.at, node = run.graph.nodes[id];
      if (!node) { run.at = ''; break; }
      const label = actionSpec(node.type)?.label || node.type, c = node.config || {};
      const trace = text => { (run.trace ??= []).push({ id, type: node.type, result: text }); if (run.trace.length > 300) run.trace.shift(); };
      if (run.test && (node.type === 'wait' || node.type === 'manual_sms' || node.type === 'manual_call' || node.type === 'manual_whatsapp' || (node.type === 'goal' && c.otherwise === 'wait'))) {
        run.results.push(`${label}: (teste) pulada`); trace('pulada no teste'); run.at = node.next; continue;
      }
      if (node.type === 'filter') {
        const ok = passes(s, run, c.conditions, c.match);
        run.results.push(`${label}: ${ok ? 'passou' : 'não passou, fluxo encerrado'}`); trace(ok ? 'passou' : 'não passou');
        if (!ok) { run.at = ''; break; }
        run.at = node.next; continue;
      }
      if (node.type === 'wait') {
        run.at = node.next;
        run.status = 'Waiting';
        if (c.mode === 'until') { if (!c.until || Date.parse(c.until) <= Date.now()) { run.status = 'Running'; run.results.push(`${label}: data já passou, seguindo`); continue; } run.wakeAt = c.until; }
        else if (c.mode === 'event') { run.waitFor = { type: c.event, value: c.eventValue || '' }; run.wakeAt = new Date(Date.now() + (Number(c.timeoutDays) || 3) * 864e5).toISOString(); }
        else if (c.mode === 'event_date') {
          // Before or after the date set by "Definir data do evento"; a moment already past goes straight on.
          if (!run.eventDate) { run.status = 'Running'; run.results.push(`${label}: sem data do evento definida, seguindo`); continue; }
          const offset = Math.max(0, Number(c.offset) || 0) * ({ minutes: 6e4, hours: 36e5, days: 864e5 }[c.offsetUnit] || 864e5);
          const target = Date.parse(run.eventDate) + (c.direction === 'after' ? offset : -offset);
          if (!Number.isFinite(target) || target <= Date.now()) { run.status = 'Running'; run.results.push(`${label}: o momento já passou, seguindo`); continue; }
          run.wakeAt = new Date(target).toISOString();
        }
        else run.wakeAt = new Date(Date.now() + (Number(c.amount) || 1) * ({ minutes: 6e4, hours: 36e5, days: 864e5 }[c.unit] || 864e5)).toISOString();
        run.results.push(`${label}: aguardando ${run.waitFor ? 'o evento' : `até ${new Date(run.wakeAt).toISOString()}`}`);
        return;
      }
      if (node.type === 'if_else') { const ok = passes(s, run, c.conditions, c.match); run.results.push(`${label}: ${ok ? 'sim' : 'não'}`); trace(ok ? 'sim' : 'não'); run.at = ok ? node.yes : node.no; continue; }
      if (node.type === 'router') { const route = node.routes.find(item => passes(s, run, item.conditions, item.match)); run.results.push(`${label}: ${route ? route.label : 'caso contrário'}`); trace(route ? route.label : 'caso contrário'); run.at = route ? route.first : node.otherwise; continue; }
      if (node.type === 'split') {
        const route = pickSplit(node.routes);
        if (!route) { run.results.push(`${label}: sem caminhos`); trace('sem caminhos'); run.at = node.next; continue; }
        run.results.push(`${label}: ${route.label}`); trace(route.label); run.at = route.first; continue;
      }
      if (node.type === 'loop') {
        const loops = (run.loops ??= {});
        if (!loops[id]) {
          const name = String(c.variable || 'item').trim().replace(/[^\w]/g, '_').slice(0, 40) || 'item';
          const items = c.mode === 'count' ? Array.from({ length: Math.min(MAX_LOOP, Math.max(0, Math.trunc(Number(c.times)) || 0)) }, (_, i) => String(i + 1))
            : listItems(merge(c.items, s, contactOf(s, run.contactId), run), c.separator).slice(0, MAX_LOOP);
          loops[id] = { name, items, index: 0 };
          run.results.push(`${label}: ${items.length} repetição(ões)`);
        }
        const state = loops[id];
        if (state.index >= state.items.length || !node.body) {
          delete loops[id]; trace(`concluído (${state.items.length})`); run.at = node.next; continue;
        }
        const n = state.index++;
        run.vars = { ...(run.vars || {}), [state.name]: state.items[n], [`${state.name}_numero`]: String(n + 1), [`${state.name}_total`]: String(state.items.length) };
        trace(`${n + 1}/${state.items.length}: ${state.items[n].slice(0, 40)}`);
        run.at = node.body; continue;
      }
      if (node.type === 'drip') {
        if (run.test) { run.results.push(`${label}: (teste) pulada`); trace('pulada no teste'); run.at = node.next; continue; }
        // One slot per interval: the first contacts of a slot go now, later ones wait for the next slot with room.
        const every = Math.max(1, Number(c.amount) || 1) * ({ minutes: 6e4, hours: 36e5, days: 864e5 }[c.unit] || 36e5), batch = Math.max(1, Number(c.batch) || 1), stamp = Date.now();
        const counters = (s.workflowCounters ??= {}), key = `drip:${run.workflowId}:${id}`;
        let slot = counters[key];
        if (!slot || slot.at + every <= stamp) slot = { at: stamp, used: 1 };
        else if (slot.used < batch) slot = { at: slot.at, used: slot.used + 1 };
        else slot = { at: slot.at + every, used: 1 };
        counters[key] = slot;
        run.at = node.next;
        if (slot.at <= stamp) { run.results.push(`${label}: liberado no lote atual`); trace('liberado'); continue; }
        run.status = 'Waiting'; run.wakeAt = new Date(slot.at).toISOString();
        run.results.push(`${label}: na fila do lote de ${run.wakeAt}`); trace('na fila');
        return;
      }
      if (node.type === 'goal') {
        if (c.otherwise === 'end') { run.results.push(`${label}: meta não alcançada, fluxo encerrado`); run.at = ''; break; }
        if (c.otherwise === 'wait') { run.status = 'Waiting'; run.waitFor = { type: c.event, value: c.eventValue || '', goal: id }; run.wakeAt = ''; run.at = node.next; run.results.push(`${label}: aguardando a meta`); return; }
        run.results.push(`${label}: seguindo`); run.at = node.next; continue;
      }
      if (node.type === 'goto') { if (++jumps > 25) { run.status = 'Failed'; run.results.push(`${label}: repetições demais`); return; } run.results.push(`${label}: ok`); run.at = c.target; continue; }
      if (node.type === 'end') { run.results.push(`${label}: ok`); run.at = ''; break; }
      if (node.type === 'add_to_workflow') {
        const other = s.workflows.find(row => row.id === c.workflowId);
        const enrolled = other?.active && depth < MAX_DEPTH ? enroll(s, other, { contactId: run.contactId, depth }, 'Adicionado por outro fluxo') : '';
        run.results.push(`${label}: ${enrolled ? `inscrito em ${other.name}` : other?.active ? 'já estava no fluxo' : 'fluxo não publicado'}`);
        run.at = node.next; continue;
      }
      if (node.type === 'remove_from_workflow') {
        const target = c.workflowId || run.workflowId;
        for (const other of s.runs) if (other.id !== run.id && other.workflowId === target && other.contactId === run.contactId && ['Running', 'Waiting'].includes(other.status)) Object.assign(other, { status: 'Removed', at: '', waitFor: null, wakeAt: '' });
        run.results.push(`${label}: ok`);
        if (target === run.workflowId) { run.at = ''; break; }
        run.at = node.next; continue;
      }
      if (node.type === 'remove_from_all_workflows') {
        let removed = 0;
        if (run.contactId) for (const other of s.runs) if (other.id !== run.id && other.contactId === run.contactId && ['Running', 'Waiting'].includes(other.status)) { Object.assign(other, { status: 'Removed', at: '', waitFor: null, wakeAt: '' }); removed++; }
        run.results.push(`${label}: ${run.contactId ? `${removed} execução(ões) encerrada(s)` : 'sem contato'}`); trace(`${removed} encerrada(s)`);
        if (c.scope === 'all') { run.at = ''; break; }
        run.at = node.next; continue;
      }
      if (node.type === 'manual_sms' || node.type === 'manual_call' || node.type === 'manual_whatsapp') {
        const contact = contactOf(s, run.contactId);
        if (!contact) { run.results.push(`${label}: sem contato`); run.at = node.next; continue; }
        add(s, 'manualActions', { runId: run.id, workflowId: run.workflowId, workflowName: run.name, contactId: contact.id, type: { manual_sms: 'Manual SMS', manual_whatsapp: 'Manual WhatsApp' }[node.type] || 'Manual Call', instructions: merge(c.body, s, contact, run), assignee: c.assignee || '', status: 'Pending' });
        run.status = 'Waiting'; run.at = node.next; run.wakeAt = ''; run.results.push(`${label}: aguardando ação manual`);
        return;
      }
      if (IVR_STEPS.has(node.type)) {
        if (run.test) { run.results.push(`${label}: (teste) pulada`); trace('pulada no teste'); run.at = node.next; continue; }
        const callSid = String(run.context?.callSid || '');
        const script = callSid ? callScript(s, callSid) : null;
        const problem = !callSid ? 'o fluxo não começou por Início da URA' : !script || script.done ? 'a ligação já terminou' : script.owner && script.owner !== run.id ? 'a ligação já está sendo atendida por outro fluxo' : '';
        if (problem) { run.results.push(`${label}: erro: ${problem}`); trace(`erro: ${problem}`); run.at = node.next; continue; }
        script.owner = run.id;
        const contact = contactOf(s, run.contactId), say = value => merge(value, s, contact, run).trim().slice(0, 3000);
        const speak = () => c.kind === 'play' ? (/^https:\/\/\S+$/i.test(say(c.url)) ? { verb: 'play', url: say(c.url) } : null) : say(c.message) ? { verb: 'say', text: say(c.message) } : null;
        let wait = '';
        if (node.type === 'ivr_say') { const verb = speak(); if (verb) script.verbs.push(verb); }
        if (node.type === 'ivr_gather') {
          script.verbs.push({ verb: 'gather', prompt: say(c.message), digits: Math.min(10, Math.max(1, Math.trunc(Number(c.digits)) || 1)), timeout: Math.min(30, Math.max(3, Math.trunc(Number(c.timeout)) || 6)) });
          wait = 'gather';
        }
        if (node.type === 'ivr_connect') {
          const to = [...new Set(say(c.to).split(/[\n,;]+/).map(value => e164(value)).filter(Boolean))].slice(0, 10);
          if (!to.length) { run.results.push(`${label}: erro: nenhum telefone válido`); trace('erro: nenhum telefone válido'); run.at = node.next; continue; }
          script.verbs.push({ verb: 'dial', to, timeout: Math.min(60, Math.max(5, Math.trunc(Number(c.timeout)) || 20)), record: c.record === 'yes' });
          wait = 'dial';
        }
        if (node.type === 'ivr_record') {
          if (say(c.message)) script.verbs.push({ verb: 'say', text: say(c.message) });
          script.verbs.push({ verb: 'record', maxLength: Math.min(600, Math.max(10, Math.trunc(Number(c.maxLength)) || 120)) });
          wait = 'record';
        }
        if (node.type === 'ivr_hangup') { if (say(c.message)) script.verbs.push({ verb: 'say', text: say(c.message) }); script.verbs.push({ verb: 'hangup' }); script.done = true; }
        if (!wait) { run.results.push(`${label}: ${node.type === 'ivr_hangup' ? 'ligação encerrada' : 'concluída'}`); trace('concluída'); run.at = node.next; continue; }
        script.wait = { runId: run.id, step: id, kind: wait, variable: aiVariableName(c.variable) || 'ivr_digitos' };
        run.status = 'Waiting'; run.waitFor = { type: 'call', step: id, callSid }; run.wakeAt = new Date(Date.now() + IVR_WAIT).toISOString(); run.at = node.next;
        run.results.push(`${label}: aguardando a ligação`); trace('aguardando a ligação');
        return;
      }
      if (node.type === 'phone_validate') {
        // The server asks Twilio Lookup after saving; the run waits like "Verificar e-mail" and resumes with the answer.
        const contact = contactOf(s, run.contactId), phone = e164(contact?.phone);
        if (!phone) {
          run.results.push(`${label}: erro: contato sem telefone`); trace('erro: contato sem telefone');
          if (c.stopOnError) { run.status = 'Failed'; run.at = ''; run.finished = now(); return; }
          run.at = node.next; continue;
        }
        if (run.test) { run.vars = { ...(run.vars || {}), telefone_status: '', telefone_tipo: '' }; run.results.push(`${label}: (teste) consulta não executada`); trace('pulada no teste'); run.at = node.next; continue; }
        outbox(s, { kind: 'phone-lookup', runId: run.id, stepId: id, phone });
        run.status = 'Waiting'; run.waitFor = { type: 'ai', step: id }; run.wakeAt = new Date(Date.now() + AI_TIMEOUT).toISOString(); run.at = node.next;
        run.results.push(`${label}: consultando ${phone}`); trace('consultando');
        return;
      }
      if (node.type === 'email_verify') {
        // The server checks the domain (DNS) after saving; the run waits like an AI step and resumes with the answer.
        const contact = contactOf(s, run.contactId);
        if (!contact?.email) {
          run.results.push(`${label}: erro: contato sem e-mail`); trace('erro: contato sem e-mail');
          if (c.stopOnError) { run.status = 'Failed'; run.at = ''; run.finished = now(); return; }
          run.at = node.next; continue;
        }
        if (run.test) { run.vars = { ...(run.vars || {}), email_status: '', email_motivo: '' }; run.results.push(`${label}: (teste) verificação não executada`); trace('pulada no teste'); run.at = node.next; continue; }
        outbox(s, { kind: 'email-verify', runId: run.id, stepId: id, email: contact.email });
        run.status = 'Waiting'; run.waitFor = { type: 'ai', step: id }; run.wakeAt = new Date(Date.now() + AI_TIMEOUT).toISOString(); run.at = node.next;
        run.results.push(`${label}: verificando ${contact.email}`); trace('verificando');
        return;
      }
      if (node.type === 'marketing_audit') {
        // The server audits the site (and the Google profile, when Maps is set up) and resumes the run with the result.
        const contact = contactOf(s, run.contactId);
        const name = aiVariableName(c.variable) || 'auditoria';
        const website = merge(c.website, s, contact, run).trim().slice(0, 300), business = merge(c.business, s, contact, run).trim().slice(0, 120);
        if (run.test) {
          const empty = Object.fromEntries(['', '_velocidade', '_seo', '_seguranca', '_conformidade', '_reputacao', '_site_ok', '_resumo'].map(part => [`${name}${part}`, '']));
          run.vars = { ...(run.vars || {}), ...empty }; output(run, id, empty);
          run.results.push(`${label}: (teste) auditoria não executada`); trace('pulada no teste'); run.at = node.next; continue;
        }
        if (!website && !business) {
          run.results.push(`${label}: erro: informe o site ou o nome da empresa`); trace('erro: sem site nem empresa');
          if (c.stopOnError) { run.status = 'Failed'; run.at = ''; run.finished = now(); return; }
          run.at = node.next; continue;
        }
        outbox(s, { kind: 'marketing-audit', runId: run.id, stepId: id, variable: name, website, business, city: merge(c.city, s, contact, run).trim().slice(0, 120) });
        run.status = 'Waiting'; run.waitFor = { type: 'ai', step: id }; run.wakeAt = new Date(Date.now() + AI_TIMEOUT).toISOString(); run.at = node.next;
        run.results.push(`${label}: auditando ${website || business}`); trace('auditando');
        return;
      }
      if (node.type === 'custom_webhook') {
        // The server sends it after saving; the run waits like an AI step and resumes with the answer.
        const request = customWebhookRequest(s, run, c, contactOf(s, run.contactId));
        const name = aiVariableName(c.variable) || 'resposta';
        if (run.test) {
          run.vars = { ...(run.vars || {}), [name]: '', [`${name}_status`]: '' };
          output(run, id, { [name]: '', [`${name}_status`]: '' });
          run.results.push(`${label}: (teste) não enviado: ${request.method} ${request.url || '(sem endereço)'}`); trace('pulada no teste'); run.at = node.next; continue;
        }
        if (request.problem) {
          run.results.push(`${label}: erro: ${request.problem}`); trace(`erro: ${request.problem}`);
          if (c.stopOnError) { run.status = 'Failed'; run.at = ''; run.finished = now(); return; }
          run.at = node.next; continue;
        }
        outbox(s, { kind: 'custom-webhook', runId: run.id, stepId: id, variable: name, url: request.url, method: request.method, headers: request.headers, contentType: request.contentType, body: request.body });
        run.status = 'Waiting'; run.waitFor = { type: 'ai', step: id }; run.wakeAt = new Date(Date.now() + AI_TIMEOUT).toISOString(); run.at = node.next;
        run.results.push(`${label}: ${request.method} ${request.url.slice(0, 120)}`); trace('aguardando a resposta');
        return;
      }
      const app = node.type.startsWith('conn_') ? connectorStep(node.type) : null;
      if (app?.kind === 'action') {
        const contact = contactOf(s, run.contactId);
        const input = Object.fromEntries(app.spec.fields.map(field => [field.key, merge(String(c[field.key] ?? field.value ?? ''), s, contact, run).trim().slice(0, 12000)]));
        const missing = app.spec.fields.find(field => field.required && !input[field.key]);
        if (run.test || missing || !s.connectors?.[app.connector.id]) {
          const line = run.test ? '(teste) app não chamado' : missing ? `erro: preencha ${missing.label}` : `erro: conecte o ${app.connector.name} em Configurações → Conectores`;
          run.results.push(`${label}: ${line}`); trace(line);
          if (!run.test && c.stopOnError) { run.status = 'Failed'; run.at = ''; run.finished = now(); return; }
          run.at = node.next; continue;
        }
        outbox(s, { kind: 'connector', runId: run.id, stepId: id, connector: app.connector.id, action: app.key, input });
        run.status = 'Waiting'; run.waitFor = { type: 'ai', step: id }; run.wakeAt = new Date(Date.now() + AI_TIMEOUT).toISOString(); run.at = node.next;
        run.results.push(`${label}: chamando o ${app.connector.name}`); trace(`chamando o ${app.connector.name}`);
        return;
      }
      if (actionSpec(node.type)?.ai) {
        const contact = contactOf(s, run.contactId);
        const request = aiRequest(s, run, node, contact);
        if (run.test) {
          run.vars = { ...(run.vars || {}), ...Object.fromEntries(request.names.map(name => [name, ''])) };
          run.results.push(`${label}: (teste) IA não executada, variáveis vazias`); trace('pulada no teste'); run.at = node.next; continue;
        }
        if (request.problem) {
          run.results.push(`${label}: erro: ${request.problem}`); trace(`erro: ${request.problem}`);
          if (c.stopOnError) { run.status = 'Failed'; run.at = ''; run.finished = now(); return; }
          run.at = node.next; continue;
        }
        outbox(s, { kind: 'ai', runId: run.id, stepId: id, workflowId: run.workflowId, action: node.type, ...request.payload });
        run.status = 'Waiting'; run.waitFor = { type: 'ai', step: id }; run.wakeAt = new Date(Date.now() + (node.type === 'ai_video_generate' ? VIDEO_TIMEOUT : AI_TIMEOUT)).toISOString(); run.at = node.next;
        run.results.push(`${label}: aguardando a IA`); trace('aguardando a IA');
        return;
      }
      let result;
      try { result = perform(s, run, node, depth, id); } catch (error) { result = `erro: ${error.message}`; }
      run.results.push(`${label}: ${result}`);
      trace(result);
      if (c.stopOnError && FAILURES.test(result)) { run.status = 'Failed'; run.at = ''; run.results.push('Fluxo interrompido: a etapa falhou e está marcada para parar em caso de erro'); run.finished = now(); return; }
      run.at = node.next;
    }
    run.status = 'Completed';
    run.finished = now();
    run.wakeAt = ''; run.waitFor = null;
  }

  // "Webhook personalizado": the request with the variables filled in now. Each {{…}} is escaped for
  // where it lands (URL, JSON string), so a contact's name with quotes cannot break the address or the body.
  function customWebhookRequest(s, run, c, contact) {
    const fill = (template, escape = value => value) => String(template ?? '').replace(/\{\{[\s\S]*?\}\}/g, token => escape(merge(token, s, contact, run)));
    const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(c.method) ? c.method : 'POST';
    const url = fill(c.url, encodeURIComponent).trim().slice(0, 2000);
    const headers = {};
    for (const line of String(c.headers || '').split(/\r?\n/).slice(0, 20)) {
      const at = line.indexOf(':');
      if (at > 0 && line.slice(0, at).trim()) headers[line.slice(0, at).trim().slice(0, 60)] = fill(line.slice(at + 1)).replace(/[\r\n]+/g, ' ').trim().slice(0, 2000);
    }
    const contentType = ['json', 'form', 'none'].includes(c.contentType) ? c.contentType : 'json';
    let body = '', problem = /^https:\/\/\S+$/i.test(url) ? '' : 'endereço inválido (use https://)';
    if (!['GET', 'DELETE'].includes(method) && contentType === 'json') {
      body = String(c.body || '').trim()
        ? fill(c.body, value => JSON.stringify(value).slice(1, -1))
        : JSON.stringify({ workflow: { id: run.workflowId, name: run.name }, trigger: run.event, context: run.context,
          contact: contact ? { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone, company: contact.company, tags: contact.tags, custom: contact.custom || {} } : null });
      try { JSON.parse(body); } catch { problem ||= 'o corpo não é um JSON válido'; }
    }
    if (!['GET', 'DELETE'].includes(method) && contentType === 'form') {
      const form = new URLSearchParams();
      for (const line of String(c.body || '').split(/\r?\n/).slice(0, 50)) {
        const at = line.indexOf('=');
        if (at > 0) form.append(line.slice(0, at).trim(), fill(line.slice(at + 1)).trim());
      }
      body = form.toString();
    }
    return { url, method, headers, contentType, body: body.slice(0, 100000), problem };
  }

  // What an AI step sends to the model, resolved now so the call does not depend on later changes.
  function aiRequest(s, run, node, contact) {
    const c = node.config || {}, text = value => merge(value, s, contact, run).slice(0, 12000);
    const variable = aiVariableName(c.variable);
    switch (node.type) {
      case 'ai_decision': return { names: [variable], payload: { variable, question: text(c.question), options: aiOptions(c.options), input: text(c.input) } };
      case 'ai_intent': return { names: [variable], payload: { variable, intents: aiOptions(c.intents), input: text(c.input) } };
      case 'ai_translate': return { names: [variable], payload: { variable, language: c.language || 'pt', input: text(c.input) } };
      case 'ai_image_generate': case 'ai_video_generate': {
        const prompt = text(c.prompt).trim();
        const payload = node.type === 'ai_image_generate' ? { variable, prompt, size: c.size || '1024x1024', quality: c.quality || 'medium' } : { variable, prompt, seconds: c.seconds || '4', size: c.size || '1280x720' };
        return { names: [variable, `${variable}_id`], payload, problem: prompt ? '' : 'a descrição ficou vazia' };
      }
      case 'ai_prompt': {
        const prompt = text(c.prompt).trim();
        return { names: [variable], payload: { variable, prompt, input: text(c.input), length: ['short', 'medium', 'long'].includes(c.length) ? c.length : 'short' },
          problem: prompt ? '' : 'o pedido para a IA ficou vazio' };
      }
      case 'ai_extract': { const fields = aiExtractFields(c.fields); return { names: fields.map(item => item.name), payload: { fields, input: text(c.input) } }; }
      case 'ai_image': {
        const image = text(c.image).trim();
        return { names: [variable], payload: { variable, image, question: text(c.question) || 'Descreva a imagem.' }, problem: /^https:\/\/\S+$/i.test(image) ? '' : 'endereço da imagem inválido (use https://)' };
      }
      case 'ai_summarize': {
        const conversation = c.source !== 'text';
        const input = conversation && contact
          ? s.messages.filter(row => row.contactId === contact.id && row.channel !== 'Note').sort((a, b) => String(a.created).localeCompare(String(b.created))).slice(-30)
            .map(row => `${row.direction === 'Inbound' ? 'Cliente' : 'Equipe'} (${row.channel}): ${String(row.body || '').slice(0, 800)}`).join('\n')
          : text(c.input);
        return { names: [variable], payload: { variable, length: c.length || 'short', note: c.note === 'yes', input }, problem: conversation && !contact ? 'sem contato' : '' };
      }
      case 'ai_agent': {
        const agent = (s.agents || []).find(row => row.id === c.agentId), input = text(c.input).trim();
        return { names: [variable], payload: { variable, agentId: c.agentId || '', input },
          problem: !agent ? 'agente não encontrado' : !agent.published ? 'o agente não está publicado' : !input ? 'a mensagem para o agente ficou vazia' : '' };
      }
      case 'conversation_ai': {
        const agent = (s.agents || []).find(row => row.id === c.agentId);
        if (!contact) return { names: [variable], payload: {}, problem: 'sem contato' };
        const input = botInput(s, contact, { channel: botChannel(s, contact, c.channel), serviceId: c.serviceId });
        return { names: [variable], payload: { variable, agentId: c.agentId || '', input },
          problem: !agent ? 'agente não encontrado' : !agent.published ? 'o agente não está publicado' : '' };
      }
      default: return { names: [], payload: {}, problem: 'ação de IA desconhecida' };
    }
  }

  // Bot de IA nas conversas: the channel it answers on (the client's last one by default) and the agent's input.
  function botChannel(s, contact, wanted) {
    if (BOT_CHANNELS[wanted]) return wanted;
    const last = s.messages.filter(row => row.contactId === contact.id && row.direction === 'Inbound' && BOT_CHANNELS[row.channel]).sort((a, b) => String(b.created).localeCompare(String(a.created)))[0];
    return last?.channel || 'WhatsApp';
  }
  function botInput(s, contact, { channel, serviceId }) {
    const service = (s.services || []).find(row => row.id === serviceId && row.active);
    const slots = service && freeSlots ? freeSlots(s, service.id) : [];
    const history = s.messages.filter(row => row.contactId === contact.id && row.channel !== 'Note').sort((a, b) => String(a.created).localeCompare(String(b.created))).slice(-20)
      .map(row => `${row.direction === 'Inbound' ? 'Cliente' : 'Equipe'}: ${String(row.body || '').replace(/\s+/g, ' ').slice(0, 700)}`).join('\n');
    return [
      `Você atende ${contact.name || 'um cliente'} pelo canal ${channel} em nome de ${s.profile?.name || 'nossa empresa'}. Escreva só a próxima mensagem da equipe: curta, no idioma do cliente, sem inventar preços, prazos ou políticas que não estejam na sua base de conhecimento.`,
      'Regras:',
      '- Se o cliente pedir para falar com uma pessoa, reclamar com irritação ou perguntar algo que você não sabe, escreva [[TRANSFERIR]] e uma frase dizendo que alguém da equipe vai continuar.',
      '- Se o cliente agradecer e se despedir, encerrando o assunto, escreva [[ENCERRAR]] junto da despedida.',
      ...(slots.length ? [`- Horários livres para ${service.name} (fuso ${s.profile?.timezone || 'America/Sao_Paulo'}): ${slots.map(slot => `${slot.day} ${slot.time}`).join(', ')}. Ofereça alguns quando o cliente quiser marcar. Quando ele escolher um desses, escreva [[AGENDAR AAAA-MM-DD HH:MM]] com o horário escolhido e confirme. Nunca ofereça outros horários.`] : []),
      '',
      'Conversa (a mais antiga primeiro):',
      history || '(sem mensagens)'
    ].join('\n').slice(0, 12000);
  }
  // The bot's answer: book, hand off or end, then the reply goes out on the channel (or as a suggestion note).
  // `run` is the workflow run of a "Bot de IA na conversa" step, or a stand-in for the bot switched on in the conversation.
  function botAnswer(s, { run, contact, config, reply, stepId = '', depth = 0 }) {
    const decision = botDecision(reply);
    const agentId = config.agentId || '', channel = botChannel(s, contact, config.channel);
    const event = (name, extra = {}) => emit(s, 'conversation_ai_event', { contactId: contact.id, event: name, agentId, channel, body: decision.text, ...extra, depth: depth + 1 });
    const lines = [];
    let booked = null;
    if (decision.action === 'book') {
      const at = zonedTime ? zonedTime(decision.day, decision.time, s.profile?.timezone || 'America/Sao_Paulo') : NaN;
      booked = config.serviceId && bookAppointment && Number.isFinite(at) ? bookAppointment(s, contact, { serviceId: config.serviceId, start: new Date(at).toISOString() }) : { error: 'sem serviço para marcar' };
      lines.push(booked.error ? `não marcou: ${booked.error}` : `marcou ${decision.day} ${decision.time}`);
    }
    if (['handoff', 'end'].includes(decision.action) && contact.aiBot) delete contact.aiBot;
    if (decision.text) {
      if (config.mode === 'suggest') {
        add(s, 'messages', { contactId: contact.id, body: `Sugestão do bot de IA (${channel}): ${decision.text}`.slice(0, 5000), subject: '', channel: 'Note', direction: 'Outbound', read: false, starred: false, origin: 'workflow', workflowId: run.workflowId || '' });
        lines.push('sugestão em Conversas');
      } else {
        const lastSubject = s.messages.filter(row => row.contactId === contact.id && row.channel === 'Email' && row.subject).sort((a, b) => String(b.created).localeCompare(String(a.created)))[0]?.subject || '';
        // Braces are broken so the agent's text is sent as written, never read as {{variables}}.
        const body = decision.text.replace(/\{\{/g, '{ {').replace(/\}\}/g, '} }');
        const sent = perform(s, run, { type: BOT_CHANNELS[channel], config: { body, subject: lastSubject ? (/^re:/i.test(lastSubject) ? lastSubject : `Re: ${lastSubject}`) : '' } }, depth, stepId);
        lines.push(`${channel}: ${sent}`);
      }
    }
    if (decision.action === 'handoff') {
      add(s, 'messages', { contactId: contact.id, body: 'O bot de IA passou esta conversa para a equipe.', subject: '', channel: 'Note', direction: 'Outbound', read: false, starred: false, origin: 'workflow', workflowId: run.workflowId || '' });
      lines.push('passou para a equipe');
    }
    if (decision.text) event(config.mode === 'suggest' ? 'suggested' : 'replied');
    if (booked && !booked.error) event('booked', { appointmentId: booked.id, start: booked.start });
    if (decision.action === 'handoff') event('handoff');
    if (decision.action === 'end') { lines.push('encerrou o atendimento'); event('ended'); }
    return { decision, line: lines.join(' · ') || 'sem resposta' };
  }
  // A new message of a client whose conversation has the bot on: the agent answers (at most BOT_DAILY_REPLIES a day).
  function botInbound(s, ctx) {
    const contact = contactOf(s, ctx.contactId), bot = contact?.aiBot;
    if (!bot || bot.status !== 'on' || !BOT_CHANNELS[ctx.channel]) return;
    if (bot.channel !== 'last' && bot.channel !== ctx.channel) return;
    const agent = (s.agents || []).find(row => row.id === bot.agentId && row.published);
    const day = String(now()).slice(0, 10);
    if (bot.day !== day) Object.assign(bot, { day, replies: 0 });
    if (!agent || bot.replies >= BOT_DAILY_REPLIES || (s.workflowOutbox || []).some(item => item.bot && item.contactId === contact.id)) return;
    bot.replies++;
    outbox(s, { kind: 'ai', bot: true, runId: '', stepId: '', contactId: contact.id, workflowId: bot.workflowId, action: 'conversation_ai', variable: 'resposta_bot', agentId: bot.agentId,
      input: botInput(s, contact, { channel: botChannel(s, contact, bot.channel), serviceId: bot.serviceId }) });
  }
  // The answer to botInbound: no workflow run, the bot's settings are on the contact.
  function botResult(s, item) {
    const contact = contactOf(s, item.contactId), bot = contact?.aiBot;
    if (!contact || !bot) return false;
    if (item.error) {
      add(s, 'messages', { contactId: contact.id, body: `O bot de IA não respondeu: ${str(item.error, 200)}`, subject: '', channel: 'Note', direction: 'Outbound', read: false, starred: false, origin: 'workflow', workflowId: bot.workflowId || '' });
      return true;
    }
    const reply = String(Object.values(item.vars || {})[0] ?? '');
    const stand = { id: '', workflowId: bot.workflowId || '', contactId: contact.id, vars: {}, outputs: {}, results: [], context: {} };
    botAnswer(s, { run: stand, contact, config: bot, reply });
    return true;
  }

  function callInput(s, { callSid = '', digits = '', dialStatus = '', recordingUrl = '', ended = false } = {}) {
    const script = callScript(s, String(callSid), false);
    if (!script) return false;
    if (ended) script.done = true;
    const wait = script.wait;
    const run = wait && s.runs.find(row => row.id === wait.runId && row.status === 'Waiting' && row.waitFor?.type === 'call' && row.waitFor.step === wait.step);
    script.wait = null;
    if (!run) return Boolean(ended);
    const label = actionSpec(run.graph?.nodes?.[wait.step]?.type)?.label || 'URA';
    let vars = {}, line = '';
    if (wait.kind === 'gather') { vars = { [wait.variable]: str(String(digits || ''), 20).replace(/[^\d*#]/g, '') }; line = vars[wait.variable] ? `digitou ${vars[wait.variable]}` : 'sem resposta'; }
    if (wait.kind === 'dial') { vars = { ivr_transferencia: str(String(dialStatus || (ended ? 'completed' : 'no-answer')), 30) }; line = `transferência: ${vars.ivr_transferencia}`; }
    if (wait.kind === 'record') {
      const url = /^https:\/\/api\.twilio\.com\//.test(String(recordingUrl)) ? String(recordingUrl).slice(0, 500) : '';
      vars = { ivr_gravacao: url };
      line = url ? 'recado gravado' : 'sem recado';
      const contact = contactOf(s, run.contactId), call = (s.calls || []).find(row => row.callSid === callSid);
      if (url && contact) {
        if (call) Object.assign(call, { status: 'voicemail', voicemailUrl: url });
        add(s, 'messages', { contactId: contact.id, body: 'Recado gravado na URA', subject: '', channel: 'Call', direction: 'Inbound', read: false, starred: false, origin: 'workflow', workflowId: run.workflowId, callId: call?.id || '', recordingUrl: url });
      }
    }
    if (ended && wait.kind !== 'record') line = line || 'ligação encerrada';
    run.vars = { ...(run.vars || {}), ...vars };
    output(run, wait.step, vars);
    run.results.push(`${label}: ${line}`);
    (run.trace ??= []).push({ id: wait.step, type: run.graph?.nodes?.[wait.step]?.type, result: line });
    resume(s, run);
    return true;
  }

  // The answer of an AI step: variables, a line in the run and, for summaries, an optional note.
  function aiResult(s, item) {
    if (item?.bot) return botResult(s, item);
    const run = s.runs.find(row => row.id === item?.runId);
    if (!run || run.status !== 'Waiting' || run.waitFor?.type !== 'ai' || run.waitFor.step !== item.stepId) return false;
    const node = run.graph?.nodes?.[item.stepId], label = actionSpec(node?.type)?.label || 'IA';
    const trace = value => { (run.trace ??= []).push({ id: item.stepId, type: node?.type, result: value }); if (run.trace.length > 300) run.trace.shift(); };
    if (item.error) {
      // A webhook that answered with an error still leaves its status and body for a later Se / Senão.
      if (node?.type === 'custom_webhook' && item.vars && typeof item.vars === 'object') {
        const vars = Object.fromEntries(Object.entries(item.vars).map(([name, value]) => [aiVariableName(name), str(String(value ?? ''), 4000)]).filter(([name]) => name).slice(0, 12));
        run.vars = { ...(run.vars || {}), ...vars };
        output(run, item.stepId, vars);
      }
      const line = `erro: ${str(item.error, 200)}`;
      run.results.push(`${label}: ${line}`); trace(line);
      if (node?.config?.stopOnError) { Object.assign(run, { status: 'Failed', at: '', waitFor: null, wakeAt: '', finished: now() }); run.results.push('Fluxo interrompido: a etapa falhou e está marcada para parar em caso de erro'); return true; }
      resume(s, run);
      return true;
    }
    let vars = Object.fromEntries(Object.entries(item.vars && typeof item.vars === 'object' ? item.vars : {})
      .map(([name, value]) => [aiVariableName(name), str(String(value ?? ''), 4000)]).filter(([name]) => name).slice(0, 12));
    // "Bot de IA na conversa": the reply goes out (or is suggested) and the bot's decision is kept with it.
    let botLine = '';
    if (node?.type === 'conversation_ai' && contactOf(s, run.contactId)) {
      const name = aiVariableName(node.config?.variable) || 'resposta_bot';
      const answered = botAnswer(s, { run, contact: contactOf(s, run.contactId), config: node.config || {}, reply: item.vars?.[name] ?? Object.values(item.vars || {})[0] ?? '', stepId: item.stepId });
      vars = { [name]: answered.decision.text, bot_acao: { reply: 'responder', handoff: 'transferir', end: 'encerrar', book: 'agendar' }[answered.decision.action] };
      botLine = answered.line;
    }
    run.vars = { ...(run.vars || {}), ...vars };
    output(run, item.stepId, vars);
    const shown = botLine || Object.entries(vars).map(([name, value]) => `${name} = ${value.slice(0, 60)}`).join(' · ') || 'sem resultado';
    run.results.push(`${label}: ${shown}`); trace(shown);
    const contact = contactOf(s, run.contactId);
    // "Verificar e-mail": the answer stays on the contact (emailStatus) and an invalid address can get a tag.
    if (node?.type === 'email_verify' && contact && ['valid', 'invalid', 'unknown'].includes(vars.email_status)) {
      Object.assign(contact, { emailStatus: vars.email_status, emailCheckedAt: now() });
      const tag = str(node.config?.invalidTag || '', 48);
      if (vars.email_status === 'invalid' && tag && !(contact.tags || []).some(t => lower(t) === lower(tag))) { contact.tags = tagList([...(contact.tags || []), tag]); emit(s, 'contact_tag', { contactId: contact.id, change: 'added', tag }); }
    }
    if (node?.type === 'phone_validate' && contact && ['valid', 'invalid'].includes(vars.telefone_status)) {
      Object.assign(contact, { phoneStatus: vars.telefone_status, phoneLineType: vars.telefone_tipo || '', phoneCheckedAt: now() });
      const tag = str(node.config?.invalidTag || '', 48);
      if (vars.telefone_status === 'invalid' && tag && !(contact.tags || []).some(t => lower(t) === lower(tag))) { contact.tags = tagList([...(contact.tags || []), tag]); emit(s, 'contact_tag', { contactId: contact.id, change: 'added', tag, depth: 1 }); }
      emit(s, 'phone_validated', { contactId: contact.id, valid: vars.telefone_status === 'valid' ? 'sim' : 'não', lineType: vars.telefone_tipo || '', carrier: vars.telefone_operadora || '', depth: 1 });
    }
    const auditSummary = node?.type === 'marketing_audit' ? Object.entries(vars).find(([key]) => key.endsWith('_resumo'))?.[1] : '';
    if (auditSummary && node.config?.note !== 'no' && contact) {
      add(s, 'messages', { contactId: contact.id, body: `Auditoria de marketing\n${auditSummary}`.slice(0, 5000), subject: '', channel: 'Note', direction: 'Outbound', read: true, starred: false, origin: 'workflow', workflowId: run.workflowId });
    }
    if (node?.type === 'ai_summarize' && node.config?.note === 'yes' && contact && Object.values(vars)[0]) {
      add(s, 'messages', { contactId: contact.id, body: `Resumo da IA: ${Object.values(vars)[0]}`.slice(0, 5000), subject: '', channel: 'Note', direction: 'Outbound', read: true, starred: false, origin: 'workflow', workflowId: run.workflowId });
    }
    resume(s, run);
    return true;
  }

  function resume(s, run, note) {
    run.status = 'Running'; run.wakeAt = ''; run.waitFor = null;
    if (note) run.results.push(note);
    proceed(s, run);
  }

  // Workflows still allowed to start in the current cascade of custom events (null outside one).
  let eventCascade = null;

  // An event: resume waits, reach goals, and enroll the workflows whose triggers match.
  function emit(s, type, ctx = {}) {
    const depth = ctx.depth || 0;
    if (depth > MAX_DEPTH) return;
    // Lead scoring (and other listeners) see each event first, with this engine's trigger filter.
    onEvent?.(s, type, ctx, { matches: trigger => matchTrigger(trigger, type, ctx) });
    if (type === 'customer_replied') botInbound(s, ctx);
    if (ctx.contactId) {
      for (const run of s.runs.filter(row => row.contactId === ctx.contactId && ['Running', 'Waiting'].includes(row.status) && row.graph)) {
        if (run.status === 'Waiting' && run.waitFor && eventMatches(run.waitFor.type, run.waitFor.value, type, ctx, s)) { resume(s, run, run.waitFor.goal ? 'Meta alcançada' : 'Evento aconteceu: seguindo'); continue; }
        const goal = Object.entries(run.graph.nodes).find(([, node]) => node.type === 'goal' && eventMatches(node.config.event, node.config.eventValue, type, ctx, s));
        if (goal && run.status !== 'Running') { run.at = goal[1].next; s.manualActions.filter(item => item.runId === run.id && item.status === 'Pending').forEach(item => { item.status = 'Skipped'; item.finished = now(); }); resume(s, run, 'Meta alcançada: pulando para a meta'); }
      }
    }
    for (const workflow of s.workflows.filter(row => row.active)) {
      if (type === 'custom_event' && (ctx.fromWorkflow === workflow.id || eventCascade?.left <= 0)) continue;
      const flow = upgradeWorkflow(workflow);
      const matched = (flow.triggers || []).find(trigger => matchTrigger(trigger, type, ctx));
      if (!matched) continue;
      if (type === 'custom_event' && eventCascade) eventCascade.left--;
      // triggerId: which trigger started the run, for conditions like "came in through this trigger".
      enroll(s, workflow, { ...ctx, depth, triggerId: ctx.triggerId || matched.id }, triggerSpec(type)?.label || type);
    }
  }

  // An outbound message that could not be delivered: marked on the message, then the "message_failed" event.
  function messageFailed(s, { messageId, reason }, depth = 0) {
    const row = s.messages.find(item => item.id === messageId);
    if (!row || row.direction !== 'Outbound' || row.failed) return false;
    row.failed = String(reason || 'provider_error').slice(0, 40);
    row.failedAt = now();
    // A failure handler whose own message fails would trigger itself (or another handler) forever: those stay quiet.
    const sender = row.workflowId ? s.workflows.find(item => item.id === row.workflowId) : null;
    if (sender && (upgradeWorkflow(sender).triggers || []).some(trigger => trigger.type === 'message_failed')) return true;
    emit(s, 'message_failed', { contactId: row.contactId, channel: row.channel, reason: row.failed, body: row.body, messageId: row.id, depth });
    return true;
  }

  // What changed in a saved record, as workflow events.
  function recordChange(s, key, prior, row) {
    const base = { contactId: row.contactId || '' };
    // "Associação criada": a contact linked to a registered company, or an opportunity linked to a contact.
    if (key === 'contacts' && row.company && lower(row.company) !== lower(prior?.company)) {
      const company = (s.companies || []).find(item => lower(item.name) === lower(row.company));
      if (company) emit(s, 'association_created', { contactId: row.id, object: 'company', companyId: company.id, title: company.name });
    }
    if (key === 'opportunities' && row.contactId && row.contactId !== prior?.contactId) emit(s, 'association_created', { contactId: row.contactId, object: 'opportunity', opportunityId: row.id, title: row.title || row.name || '' });
    if (key === 'contacts') {
      if (!prior) { emit(s, 'contact_created', { contactId: row.id }); for (const tag of row.tags || []) emit(s, 'contact_tag', { contactId: row.id, change: 'added', tag }); return; }
      const fields = ['name', 'email', 'phone', 'company'].filter(field => (prior[field] || '') !== (row[field] || ''));
      for (const id of new Set([...Object.keys(prior.custom || {}), ...Object.keys(row.custom || {})])) if (JSON.stringify(prior.custom?.[id] ?? '') !== JSON.stringify(row.custom?.[id] ?? '')) fields.push(`custom:${id}`);
      if (fields.length) emit(s, 'contact_changed', { contactId: row.id, fields });
      const before = (prior.tags || []).map(lower), after = (row.tags || []).map(lower);
      for (const tag of row.tags || []) if (!before.includes(lower(tag))) emit(s, 'contact_tag', { contactId: row.id, change: 'added', tag });
      for (const tag of prior.tags || []) if (!after.includes(lower(tag))) emit(s, 'contact_tag', { contactId: row.id, change: 'removed', tag });
      if (Boolean(prior.dnd) !== Boolean(row.dnd)) emit(s, 'contact_dnd', { contactId: row.id, state: row.dnd ? 'on' : 'off' });
      if ((prior.notes || '') !== (row.notes || '')) emit(s, 'note_changed', { contactId: row.id, body: row.notes || '' });
    }
    if (key === 'tasks') { if (!prior) emit(s, 'task_added', base); else if (!prior.done && row.done) emit(s, 'task_completed', base); }
    if (key === 'appointments') { if (!prior) emit(s, 'appointment_booked', { ...base, appointmentId: row.id }); else if (prior.status !== row.status) emit(s, 'appointment_status', { ...base, status: row.status }); }
    if (key === 'opportunities') {
      if (!prior) emit(s, 'opportunity_created', { ...base, pipelineId: row.pipelineId });
      else {
        if (prior.stage !== row.stage) emit(s, 'pipeline_stage_changed', { ...base, stageId: row.stage });
        if (prior.status !== row.status) emit(s, 'opportunity_status_changed', { ...base, status: row.status });
        emit(s, 'opportunity_changed', base);
      }
    }
    if (key === 'invoices' && (!prior || prior.status !== row.status)) emit(s, 'invoice_status', { ...base, status: row.status, total: row.value });
    if (key === 'transactions' && !prior && row.status === 'Succeeded') emit(s, 'payment_received', { ...base, total: row.amount });
    if (key === 'transactions' && row.status === 'Refunded' && prior?.status !== 'Refunded') emit(s, 'refund', { ...base, total: row.amount, transactionId: row.id });
    if (key === 'subscriptions' && (!prior || prior.status !== row.status)) emit(s, 'subscription_status', { ...base, status: row.status, subscriptionId: row.id });
    if (key === 'appointments' && !prior && row.serviceId) {
      const service = (s.services || []).find(item => item.id === row.serviceId);
      if (service) emit(s, 'service_booked', { ...base, serviceId: service.id, kind: service.kind, appointmentId: row.id, title: service.name });
    }
    if (key === 'reviews' && !prior) emit(s, 'review_received', { contactId: row.contactId || '', score: row.score });
    if (key === 'orders' && prior && prior.status !== row.status && row.status === 'Paid') emit(s, 'order_paid', { ...base, storeId: row.storeId, total: row.total });
    if (key === 'orders' && prior && prior.status !== row.status && row.status === 'Fulfilled') emit(s, 'order_fulfilled', { ...base, storeId: row.storeId, total: row.total });
  }

  // Every minute: wake runs whose time came, and fire scheduled triggers once per day.
  function tick(s, at = Date.now()) {
    let woke = 0;
    for (const run of s.runs.filter(row => row.status === 'Waiting' && row.wakeAt && Date.parse(row.wakeAt) <= at && row.graph)) {
      resume(s, run, run.waitFor ? 'Tempo de espera esgotado: seguindo' : 'Espera concluída'); woke++;
    }
    const zone = s.profile?.timezone || 'America/Sao_Paulo';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date(at)).map(p => [p.type, p.value]));
    const today = `${parts.year}-${parts.month}-${parts.day}`, clock = `${parts.hour}:${parts.minute}`, weekday = String(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday));
    const shift = (day, days) => new Date(Date.parse(`${day}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
    let fired = 0;
    for (const workflow of s.workflows.filter(row => row.active)) {
      for (const trigger of upgradeWorkflow(workflow).triggers.filter(t => scheduledTypes.includes(t.type))) {
        const c = trigger.config || {};
        if (clock < (c.time || '09:00') && trigger.type !== 'stale_opportunity') continue;
        workflow.fired ??= {};
        if (workflow.fired[trigger.id] === today) continue;
        if (trigger.type === 'scheduler' && c.frequency === 'weekly' && c.weekday !== weekday) continue;
        workflow.fired[trigger.id] = today;
        let contacts = [];
        if (trigger.type === 'scheduler') contacts = s.contacts.filter(row => c.tag && (row.tags || []).some(tag => lower(tag) === lower(c.tag)));
        if (trigger.type === 'birthday_reminder') { const target = shift(today, Number(c.days) || 0).slice(5); contacts = s.contacts.filter(row => String(row.custom?.[c.field] || '').slice(5, 10) === target); }
        if (trigger.type === 'task_reminder') {
          const target = shift(today, Number(c.days) || 0);
          const due = (s.tasks || []).filter(row => !row.done && row.contactId && String(row.due || '').slice(0, 10) === target);
          contacts = [...new Set(due.map(row => row.contactId))].map(id => contactOf(s, id)).filter(Boolean);
        }
        if (trigger.type === 'custom_date_reminder') { const target = shift(today, -(Number(c.offset) || 0)); contacts = s.contacts.filter(row => String(row.custom?.[c.field] || '').slice(0, 10) === target); }
        if (trigger.type === 'stale_opportunity') {
          const limit = at - (Number(c.days) || 7) * 864e5;
          const stale = s.opportunities.filter(row => row.status === 'Open' && (!c.stageId || row.stage === c.stageId) && Date.parse(row.updated || row.created) <= limit);
          contacts = [...new Set(stale.map(row => row.contactId))].map(id => contactOf(s, id)).filter(Boolean);
        }
        for (const contact of contacts.slice(0, 500)) { if (enroll(s, workflow, { contactId: contact.id, triggerId: trigger.id, depth: 1 }, triggerSpec(trigger.type).label)) fired++; }
      }
    }
    const listening = type => s.workflows.some(row => row.active && (upgradeWorkflow(row).triggers || []).some(t => t.type === type));
    // "SLA da conversa": once per waiting customer message and state (due soon, then overdue), last 7 days only.
    if (listening('conversation_sla')) {
      const open = slaRecords(s, at).filter(row => !row.answered && ['Due soon', 'Overdue'].includes(row.state) && row.contactId && Date.parse(row.started) >= at - 7 * 864e5);
      const byId = open.length ? new Map(s.messages.map(row => [row.id, row])) : new Map();
      for (const record of open.slice(0, 500)) {
        const message = byId.get(record.id), state = record.state === 'Overdue' ? 'overdue' : 'soon';
        if (!message || (message.slaFired || []).includes(state)) continue;
        message.slaFired = state === 'overdue' ? ['soon', 'overdue'] : ['soon'];
        emit(s, 'conversation_sla', { contactId: record.contactId, state, channel: record.channel, minutes: String(Math.floor(record.elapsed)), body: String(message.body || '').slice(0, 500), messageId: message.id, depth: 1 });
        fired++;
      }
    }
    // "Cupom expirou": the day after the coupon's last valid day, once per coupon (no contact).
    const couponFlows = listening('coupon_expired');
    for (const coupon of s.coupons || []) {
      if (!coupon.end || today <= coupon.end || coupon.expiredFor === coupon.end) continue;
      coupon.expiredFor = coupon.end;
      if (coupon.end < shift(today, -7)) continue;
      emit(s, 'coupon_expired', { contactId: '', couponId: coupon.id, code: coupon.code || '', title: coupon.name || '', end: coupon.end, depth: 1 });
      if (couponFlows) fired++;
    }
    return { woke, fired };
  }

  function finishManual(s, id, data, one, str2) {
    const item = s.manualActions.find(row => row.id === id);
    if (!item) fail('Manual action not found.', 404);
    if (item.status === data.status && ['Completed', 'Skipped'].includes(item.status)) return id;
    if (item.status !== 'Pending') fail('Manual action is no longer pending.', 409);
    const run = s.runs.find(row => row.id === item.runId);
    if (run?.status !== 'Waiting') fail('This workflow is no longer waiting.', 409);
    item.status = one(data.status, ['Completed', 'Skipped'], 'outcome');
    item.finished = now();
    item.note = str2(data.note, 2500);
    if (item.status === 'Completed' && item.note) add(s, 'messages', { contactId: item.contactId, direction: 'Outbound', channel: 'Note', read: true, starred: false, origin: 'internal', body: `${item.type}: ${item.note}` });
    resume(s, run, `${item.type}: ${item.status === 'Completed' ? 'concluída manualmente' : 'ignorada manualmente'}`);
    return id;
  }

  function inbound(s, workflowId, triggerId, payload) {
    const workflow = s.workflows.find(row => row.id === workflowId && row.active);
    const trigger = workflow && upgradeWorkflow(workflow).triggers.find(t => t.id === triggerId && t.type === 'inbound_webhook');
    if (!trigger) fail('Webhook não encontrado.', 404);
    const flat = Object.fromEntries(Object.entries(payload || {}).filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v)).slice(0, 60).map(([k, v]) => [str(k, 40), str(String(v), 500)]));
    const email = lower(flat.email || ''), phone = str(flat.phone || '', 48);
    let contact = (email && s.contacts.find(row => row.email === email)) || (phone && s.contacts.find(row => String(row.phone || '').replace(/\D/g, '') === phone.replace(/\D/g, '')));
    if (!contact && (email || phone)) {
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('E-mail inválido no webhook.');
      contact = add(s, 'contacts', { name: str(flat.name || flat.full_name || email || phone, 120), email, phone, tags: [], company: str(flat.company || '', 160), notes: '', custom: {} });
      emit(s, 'contact_created', { contactId: contact.id });
    }
    return enroll(s, workflow, { contactId: contact?.id || '', triggerId, payload: flat, depth: 1 }, 'Webhook de entrada') || 'already-enrolled';
  }

  // Runs a draft against one contact on a throwaway copy of the state: waits and manual steps are skipped.
  function testRun(s, draft, contactId) {
    const workflow = { ...workflowRecord(s, { ...draft, active: false }), id: draft.id || 'rascunho', active: false };
    const before = { messages: s.messages.length, tasks: s.tasks.length, opportunities: s.opportunities.length, invoices: s.invoices.length, outbox: (s.workflowOutbox || []).length };
    const contact = contactOf(s, contactId);
    const tagsBefore = [...(contact?.tags || [])];
    const graph = compile(workflow.steps);
    const run = add(s, 'runs', { name: workflow.name, workflowId: workflow.id, event: 'Teste', contactId: contact?.id || '', context: {}, graph, at: graph.first, results: [], steps: 0, status: 'Running', test: true });
    proceed(s, run, 1);
    const after = contactOf(s, contactId);
    return {
      status: run.status, results: run.results, trace: run.trace || [], outputs: run.outputs || {}, vars: run.vars || {},
      changes: {
        tagsAdded: (after?.tags || []).filter(tag => !tagsBefore.includes(tag)), tagsRemoved: tagsBefore.filter(tag => !(after?.tags || []).includes(tag)),
        messages: s.messages.slice(before.messages).map(row => ({ channel: row.channel, body: row.body })),
        tasks: s.tasks.slice(before.tasks).map(row => row.title), opportunities: s.opportunities.slice(before.opportunities).map(row => row.title),
        invoices: s.invoices.slice(before.invoices).map(row => row.title), queued: (s.workflowOutbox || []).slice(before.outbox).map(row => ({ kind: row.kind, url: row.url || '', phone: row.phone ? 'contato' : '' }))
      }
    };
  }

  return { emit, enroll, recordChange, tick, finishManual, inbound, proceed, aiResult, messageFailed, callInput, test: testRun };
}
