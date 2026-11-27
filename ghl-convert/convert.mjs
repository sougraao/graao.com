// Converte uma subconta extraída do GHL num template de setup da Graao.
// Entrada: { dump, triggers, surveys, page(pageId) } (a extração do GHL em memória; a leitura de pasta fica em scripts/ghl-template).
// Saída: o objeto do template { id, title, ..., assets, sites } pronto para gravar em setup-templates/<id>.json.
import { createHash } from 'node:crypto';
import { cleanPage } from './page-html.mjs';
import { fieldKinds } from '../ui/form-fields.js';

const hash = (value, size = 8) => createHash('sha1').update(String(value)).digest('hex').slice(0, size);
const slugOf = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const keyOf = value => slugOf(value).replace(/-/g, '_');
const decode = text => String(text || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// HTML de mensagem (e-mail, nota, rótulo) em texto: parágrafos viram linhas, links viram "texto (endereço)".
export function htmlToText(html) {
  let text = String(html || '')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (all, url, label) => { const inner = label.replace(/<[^>]+>/g, '').trim(); return inner && inner !== url ? `${inner} (${url})` : url; })
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n').replace(/<li\b[^>]*>/gi, '• ').replace(/<[^>]+>/g, '');
  text = decode(text).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/** As páginas de funis e sites que o conversor vai pedir a page(), na ordem; funis "… copy" ficam de fora. */
export function pagesOf(dump) {
  return (dump.funnels || []).filter(funnel => !/\bcopy$/i.test(String(funnel.name || '').trim()))
    .flatMap(funnel => (funnel.pages || []).map(p => ({ pageId: p._id || p.id, funnelId: funnel._id || funnel.id })));
}

/* ───────── Conversão ───────── */

const FIELD_TYPES = { TEXT: 'Single line', LARGE_TEXT: 'Multi line', NUMERICAL: 'Number', MONETORY: 'Monetary', DATE: 'Date', SINGLE_OPTIONS: 'Dropdown (single)',
  RADIO: 'Dropdown (single)', PHONE: 'Phone', EMAIL: 'Email', CHECKBOX: 'Multi line', MULTIPLE_OPTIONS: 'Multi line', FILE_UPLOAD: 'Single line', TEXTBOX_LIST: 'Multi line' };
const OBJECTS = { contact: 'Contact', opportunity: 'Opportunity', business: 'Company', company: 'Company' };
const UNITS = { minutes: 'minutes', minute: 'minutes', mins: 'minutes', hour: 'hours', hours: 'hours', days: 'days', day: 'days' };

export function convert(source, meta) {
  const { dump, triggers, surveys, page } = source;
  const P = meta.prefix;
  const id = (kind, ghl) => `${P}-${kind}-${hash(ghl)}`;
  const stepId = ghl => `${P}${hash(ghl, 10)}`;
  const notes = [];
  const note = text => { if (!notes.includes(text)) notes.push(text); };
  const assets = {};

  // Campos personalizados (contato, oportunidade e empresa).
  const folders = new Map((dump.customFieldFolders?.customFieldFolders || []).map(f => [f.id, f.name]));
  const fieldById = new Map();
  assets.customFields = (dump.customFields?.customFields || []).filter(f => !f.standard).map(f => {
    const row = { id: id('cf', f.id), name: f.name, object: OBJECTS[f.model] || 'Contact', type: FIELD_TYPES[f.dataType] || 'Single line',
      options: (f.picklistOptions || []).map(String).slice(0, 50), folder: folders.get(f.parentId) || '', placeholder: f.placeholder || '', key: f.fieldKey || `contact.${keyOf(f.name)}` };
    if (!['Dropdown (single)'].includes(row.type)) row.options = [];
    if (['MULTIPLE_OPTIONS', 'CHECKBOX'].includes(f.dataType)) note(`Campo "${f.name}": múltipla escolha no GHL; na Graao vira texto (as opções ficam separadas por vírgula).`);
    fieldById.set(f.id, row);
    return row;
  });
  const fieldRef = ghlId => fieldById.has(ghlId) ? `custom:${fieldById.get(ghlId).id}` : '';

  // Valores personalizados: só os nomes (o GHL não leva o conteúdo nos snapshots).
  const valueFolders = new Map((dump.customValueFolders?.customValueFolders || []).map(f => [f.id, f.name]));
  assets.customValues = (dump.customValues?.customValues || []).map(v => {
    const key = (/custom_values\.([\w]+)/.exec(v.fieldKey || '')?.[1]) || keyOf(v.name);
    return { id: id('cv', v.id), name: v.name, folder: valueFolders.get(v.parentId) || '', value: '', key: `custom_values.${key}` };
  });

  assets.tags = (dump.tags?.tags || []).map(t => ({ id: id('tg', t.id), name: t.name, description: t.description || '', category: '' }));
  const tagNames = new Set(assets.tags.map(t => t.name));
  const ensureTag = name => { if (name && !tagNames.has(name)) { tagNames.add(name); assets.tags.push({ id: id('tg', `extra-${name}`), name, description: '', category: '' }); } };

  // Pipelines e etapas.
  const stageById = new Map();
  assets.pipelines = []; assets.stages = [];
  for (const p of dump.pipelines?.pipelines || []) {
    assets.pipelines.push({ id: id('pl', p.id), name: p.name });
    for (const s of p.stages || []) { const row = { id: id('st', s.id), pipelineId: id('pl', p.id), name: s.name }; assets.stages.push(row); stageById.set(s.id, row); }
  }
  const stageRef = ghl => stageById.get(ghl)?.id || '';
  const pipelineRef = ghl => (dump.pipelines?.pipelines || []).some(p => p.id === ghl) ? id('pl', ghl) : '';

  // Calendários viram serviços da agenda.
  const minutes = (value, unit) => Math.round(Number(value || 0) * ({ hours: 60, hour: 60, days: 1440, day: 1440 }[unit] || 1));
  assets.services = (dump.calendars?.calendars || []).map(c => ({
    id: id('sv', c.id), name: c.name.replace(/\s*-\s*\{\{location\.name\}\}/, '').trim(), description: htmlToText(c.description || ''), kind: 'appointment',
    duration: minutes(c.slotDuration || 30, c.slotDurationUnit), buffer: minutes(c.slotBuffer || 0, c.slotBufferUnit), price: 0, staffIds: [], resourceIds: [], rentalUnit: '', maxUnits: 1,
    leadMinutes: minutes(c.allowBookingAfter || 0, c.allowBookingAfterUnit), horizonDays: Math.max(1, Math.round(minutes(c.allowBookingFor || 30, c.allowBookingForUnit || 'days') / 1440)),
    active: true, color: c.eventColor || '#155eef'
  }));
  const serviceRef = ghl => (dump.calendars?.calendars || []).some(c => c.id === ghl) ? id('sv', ghl) : '';

  // Formulários e pesquisas.
  const dest = extra => ({ action: 'default', message: '', url: '', siteId: '', page: '', serviceId: '', ...extra });
  const STANDARD = { first_name: 'first_name', last_name: 'last_name', full_name: 'name', name: 'name', email: 'email', phone: 'phone', organization: 'organization', company_name: 'organization',
    website: 'website', city: 'city', state: 'state', country: 'country', postal_code: 'postal_code', address: 'address', address1: 'address', date_of_birth: 'birthday', source: 'source' };
  const LOOSE = { text: 'text', large_text: 'textarea', textarea: 'textarea', single_options: 'select', radio: 'radio', multiple_options: 'checkbox', checkbox: 'checkbox', date: 'date', monetory: 'monetary', numerical: 'number', number: 'number', file_upload: 'text', email: 'email', phone: 'phone' };
  const formField = (f, index, prefix) => {
    const base = { id: `${prefix}${index}`, label: decode(String(f.label || '').replace(/<[^>]+>/g, '')).trim().slice(0, 200), placeholder: String(f.placeholder || '').slice(0, 120), key: '', required: Boolean(f.required), hidden: Boolean(f.hidden), width: Number(f.fieldWidthPercentage) === 50 ? 50 : 100, options: [], help: '', text: '', value: '' };
    if (f.tag === 'button' || f.type === 'submit' || f.tag === 'captcha' || f.type === 'captcha') return null;
    if (['header', 'html'].includes(f.tag) || ['h1', 'h2', 'h3', 'html'].includes(f.type)) {
      const text = htmlToText(f.label || f.html || '');
      return text ? { ...base, type: 'heading', label: text.split('\n')[0].slice(0, 200), text: text.split('\n').slice(1).join('\n').trim(), required: false } : null;
    }
    if (f.tag === 'image' || f.type === 'img') return null;
    if (/terms|tnc/i.test(f.tag || '')) return { ...base, type: 'terms', text: htmlToText(f.label || ''), label: 'Consentimento', required: true };
    if (STANDARD[f.tag]) { const type = STANDARD[f.tag]; return { ...base, type, key: fieldKinds[type]?.key || '', label: base.label || fieldKinds[type]?.label || f.tag }; }
    const custom = fieldById.get(f.tag) || fieldById.get(f.id);
    if (custom && custom.object === 'Contact') return { ...base, type: 'custom', customId: custom.id, options: custom.options };
    const type = LOOSE[f.type] || 'text';
    return { ...base, type, key: keyOf(f.fieldKey?.replace(/^\w+\./, '') || f.label), options: ['select', 'radio', 'checkbox'].includes(type) ? (f.picklistOptions || f.options || []).map(String).filter(Boolean).slice(0, 50) : [] };
  };
  const onSubmit = action => {
    if (!action) return dest();
    const url = String(action.redirectUrl || '').trim();
    if (/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url)) return dest({ action: 'redirect', url });
    // {{ custom_values.company_website_link }}/thank-you: uma página do próprio site, resolvida depois que os sites existem.
    if (url) return dest({ action: 'page', siteId: '', page: url.replace(/[?#].*$/, '').split('/').filter(Boolean).pop() || 'index' });
    const message = htmlToText(action.thankyouText || '');
    return message ? dest({ action: 'message', message: message.slice(0, 600) }) : dest();
  };
  const formById = new Map();
  assets.forms = (dump.forms || []).map(form => {
    const ghlFields = form.formData?.form?.fields || [];
    const button = htmlToText(ghlFields.find(f => f.tag === 'button')?.label || '') || 'Enviar';
    const row = { id: id('fm', form._id), name: form.name, description: '', kind: 'form', askPhone: true, active: false, accent: `#${String(form.formData?.form?.style?.ac || '155eef').slice(0, 6)}`, showTitle: false,
      button: button.slice(0, 60), addTags: [], fields: ghlFields.map((f, i) => formField(f, i, `${hash(form._id, 4)}f`)).filter(Boolean),
      onSubmit: onSubmit(form.formData?.form?.formAction), routes: [], schedule: { start: '', end: '', closedMessage: '' } };
    formById.set(form._id, row);
    return row;
  });
  for (const survey of surveys) {
    const fields = [];
    (survey.formData?.slides || []).forEach((slide, s) => {
      if (s > 0) fields.push({ id: `${hash(survey._id, 4)}b${s}`, type: 'break', label: slide.slideName || '', placeholder: '', key: '', required: false, hidden: false, width: 100, options: [], help: '', text: '', value: '' });
      (slide.slideData || []).forEach((f, i) => { const field = formField(f, `${s}x${i}`, `${hash(survey._id, 4)}s`); if (field) fields.push(field); });
    });
    // No GHL a pesquisa pode vir depois de um formulário que já identificou o contato. Na Graao ela cria o contato,
    // então ganha um último passo com nome, e-mail e telefone.
    if (!fields.some(f => f.type === 'email' || f.type === 'phone')) {
      const p = hash(survey._id, 4);
      fields.push({ id: `${p}bz`, type: 'break', label: 'Seus dados', placeholder: '', key: '', required: false, hidden: false, width: 100, options: [], help: '', text: '', value: '' },
        ...['name', 'email', 'phone'].map(type => formField({ tag: type, required: true }, `z${type}`, `${p}s`)));
      note(`Pesquisa "${survey.name}" não pedia e-mail nem telefone: ganhou o passo "Seus dados" no fim.`);
    }
    const row = { id: id('fm', survey._id), name: survey.name, description: '', kind: 'survey', askPhone: true, active: false, accent: '#155eef', showTitle: false, button: 'Enviar', addTags: [], fields,
      onSubmit: onSubmit(survey.formData?.formAction || survey.formData?.surveyAction), routes: [], schedule: { start: '', end: '', closedMessage: '' } };
    formById.set(survey._id, row);
    assets.forms.push(row);
  }
  const formRef = ghl => formById.get(ghl)?.id || '';
  // Página que aponta para um formulário que a subconta não tem (apagado, ou de outra conta): usa o de captação do site.
  const leadForm = (assets.forms.find(f => f.kind === 'form' && /website|opt-in|site/i.test(f.name))
    || assets.forms.find(f => f.kind === 'form' && !/interno/i.test(f.name)) || assets.forms[0])?.id || '';
  const pageFormRef = ghl => formRef(ghl) || leadForm;

  // Links de rastreamento: o clique também marca a tag clicou-<link>, usada pelas esperas e condições.
  const linkById = new Map();
  assets.triggerLinks = (dump.links?.links || []).map(l => { const row = { id: id('lk', l.id), name: l.name, url: l.redirectTo || 'https://' }; linkById.set(l.id, row); return row; });
  const linkTag = ghl => `clicou-${slugOf(linkById.get(ghl)?.name || ghl).slice(0, 30)}`;

  // Modelos de e-mail.
  assets.emailTemplates = (dump.emailTemplates || []).filter(e => e.html).map(e => ({
    id: id('em', e.id), name: e.name, subject: '', preheader: '', fromName: '', replyTo: '',
    style: { background: '#f4f5f7', card: '#ffffff', text: '#1f2937', accent: '#155eef', font: 'system' },
    blocks: htmlToText(/<body[\s\S]*<\/body>/i.exec(e.html)?.[0] || e.html).split(/\n{2,}/).filter(Boolean).slice(0, 40).map(text => ({ type: 'text', text: text.slice(0, 8000), align: 'left' }))
  }));

  // Bases de conhecimento e agentes de IA.
  const skipBase = meta.skipKnowledgeBases || [];
  const baseById = new Map();
  assets.knowledgeBases = (dump.knowledgeBases || []).filter(k => !skipBase.some(rx => rx.test(k.name))).map(k => {
    const sources = [
      ...(k.faqs || []).map(q => ({ id: id('kq', q.id), kind: 'faq', title: q.question.slice(0, 120), question: q.question.slice(0, 240), text: q.answer.slice(0, 20000) })),
      ...(k.sources || []).filter(s => s.text).map(s => ({ id: id('ks', s.content || s.url), kind: 'url', title: (s.title || s.url || 'Página').slice(0, 120), url: s.url || '', text: s.text.slice(0, 20000) }))
    ].slice(0, 40);
    const row = { id: id('kb', k.id), name: k.name.slice(0, 60), description: '', sources };
    baseById.set(k.id, row);
    return row;
  }).filter(k => k.sources.length);
  assets.agents = (dump.aiEmployees || []).map(a => ({
    id: id('ag', a.id), name: a.name, icon: 'spark', description: htmlToText(a.goal || '').split('\n')[0].slice(0, 200),
    instructions: [a.personality && `## Personalidade\n${a.personality}`, a.goal && `## Objetivo\n${a.goal}`, a.instructions && `## Instruções\n${a.instructions}`].filter(Boolean).join('\n\n'),
    baseRefs: (a.knowledgeBaseIds || []).map(k => baseById.get(k)?.id).filter(Boolean)
  }));
  const agentRef = ghl => (dump.aiEmployees || []).some(a => a.id === ghl) ? id('ag', ghl) : '';

  // Chat do site.
  assets.chatWidgets = (dump.chatWidgets?.chatWidgets || []).map(w => ({ id: id('cw', w._id), name: w.name, type: 'live', active: false, color: '#155eef', position: 'right', agentName: 'Equipe',
    heading: 'Fale com a gente', subheading: 'Respondemos em poucos minutos.', prompt: 'Quer um orçamento? Fale com a gente por aqui.', promptDelay: 8, welcome: 'Oi! Como podemos ajudar?',
    thanks: 'Recebemos sua mensagem. Já vamos te responder!', legal: w.settings?.legalMsg || '', askName: 'required', askEmail: 'optional', askPhone: 'required', tags: [] }));

  /* ───────── Workflows ───────── */

  const workflowIds = new Map((dump.workflows || []).map(w => [w._id || w.id, id('wf', w._id || w.id)]));
  const workflowRef = ghl => workflowIds.get(ghl) || '';
  assets.workflowFolders = (dump.workflowFolders || []).map(f => ({ id: id('wo', f.id), name: f.name }));
  const tagsInWorkflow = new Map(); // ghl workflow id → tag that marks "contact is in this workflow"

  const convertCondition = (c, triggerIds) => {
    const sub = c.conditionSubType, op = c.conditionOperator, value = c.conditionValue;
    switch (c.conditionType) {
      case 'trigger': return { subject: 'trigger', op: 'equals', key: 'triggerId', value: triggerIds.get(value) || '' };
      case 'contact_reply': return sub === 'message.body' ? { subject: 'trigger', op: 'not_empty', key: 'body', value: '' } : { subject: 'replied', op: String(value) === 'false' ? 'no' : 'yes', key: '', value: '' };
      case 'events': if (sub === 'link_clicked') { ensureTag(linkTag(value)); return { subject: 'tag', op: op === '!=' ? 'not_has' : 'has', key: '', value: linkTag(value) }; } break;
      case 'custom_values': return { subject: 'var', op: { has_no_value: 'empty', has_value: 'not_empty', '==': 'equals', '!=': 'not_equals' }[op] || 'not_empty', key: String(sub).replace(/[{}\s]/g, ''), value: ['==', '!='].includes(op) ? String([].concat(value ?? '')[0] ?? '') : '' };
      case 'workflow_contact': {
        const tag = `no-fluxo-${hash(value, 6)}`; tagsInWorkflow.set(value, tag); ensureTag(tag);
        return { subject: 'tag', op: op === 'index-of-false' ? 'not_has' : 'has', key: '', value: tag };
      }
      case 'proposal_estimate_update': return { subject: 'trigger', op: 'equals', key: 'status', value: String(value).toLowerCase() };
      case 'opportunities':
        if (sub === 'pipelineStageId') return { subject: 'stage', op: op === '!=' ? 'not_in' : 'in', key: '', value: stageRef(value) };
        if (sub === 'monetaryParsedValue') return { subject: 'trigger', op: op === 'has_no_value' ? 'empty' : 'equals', key: 'value', value: op === 'has_no_value' ? '' : String(value) };
        break;
      case 'contact_detail':
        if (sub === 'tags') {
          if (op === 'has_no_value') return { subject: 'field', op: 'empty', key: 'tags', value: '' };
          const tags = [].concat(value || []);
          return { subject: 'tag', op: op === 'index-of-false' ? 'not_has' : 'has', key: '', value: tags[0] || '' };
        }
        if (fieldById.has(sub)) return { subject: 'field', op: { '==': 'equals', '!=': 'not_equals', has_value: 'not_empty', has_no_value: 'empty' }[op] || 'equals', key: fieldRef(sub), value: [].concat(value ?? '')[0] ?? '' };
        return { subject: 'field', op: { '==': 'equals', '!=': 'not_equals', has_value: 'not_empty', has_no_value: 'empty' }[op] || 'equals', key: String(sub).replace(/^contact\./, ''), value: [].concat(value ?? '')[0] ?? '' };
    }
    note(`Condição do GHL sem equivalente direto (${c.conditionType}/${sub}): revise o caminho.`);
    return null;
  };

  const msgBody = text => String(text || '').replace(/\{\{\s*custom_values\.([\w]+)\s*\}\}/g, '{{custom_values.$1}}');

  const convertWorkflow = w => {
    const nodes = new Map((w.workflowData?.templates || []).map(n => [n.id, n]));
    const ghlTriggers = Array.isArray(triggers[w._id || w.id]) ? triggers[w._id || w.id] : [];
    const triggerIds = new Map();
    const filters = [];
    const out = [];
    for (const t of ghlTriggers) {
      const made = convertTrigger(t, filters);
      for (const trig of made) { trig.id = `${P}t${hash(t.id + trig.type + JSON.stringify(trig.config), 9)}`; out.push(trig); }
      if (made[0]) triggerIds.set(t.id, made[0].id);
    }
    const used = new Set();
    const firstStep = new Map(); // GHL node id -> the first step made from it (where a "go to" lands)
    // stopAt: the node where the paths of a split or condition meet again; the steps from it on follow the split, once.
    const chain = (startId, depth = 0, stopAt = null) => {
      const steps = [];
      for (let at = startId; at && at !== stopAt && nodes.has(at) && !used.has(at);) {
        const n = nodes.get(at); used.add(at);
        const made = convertNode(n, depth, triggerIds, stopAt);
        if (made.steps[0] && !firstStep.has(n.id)) firstStep.set(n.id, made.steps[0].id);
        steps.push(...made.steps);
        if (made.stop) break;
        at = typeof n.next === 'string' ? n.next : null;
      }
      return steps;
    };
    // A branch of a condition, multi-path or transition: the steps after its marker node.
    const branch = (markerId, depth, stopAt = null) => { const marker = nodes.get(markerId); if (!marker) return []; used.add(markerId); return chain(typeof marker.next === 'string' ? marker.next : null, depth + 1, stopAt); };
    // In GHL the paths of a split often meet again: one path ends with "go to" a step of the other. That step is the meeting point.
    const mergePoint = markerIds => {
      const paths = markerIds.map(markerId => {
        const seen = [];
        let goto = null;
        for (let at = nodes.get(markerId)?.next; typeof at === 'string' && nodes.has(at) && !seen.includes(at);) {
          const n = nodes.get(at);
          if (n.type === 'goto') { goto = n.attributes?.targetNodeId || null; break; }
          seen.push(at);
          at = n.next;
        }
        return { seen, goto };
      });
      for (const { goto } of paths) if (goto && paths.some(other => other.seen.includes(goto))) return goto;
      return null;
    };
    // The steps after a split or condition: from the meeting point on, at the same level.
    const afterMerge = (merge, depth, stopAt) => merge && merge !== stopAt ? chain(merge, depth, stopAt) : [];

    function convertNode(n, depth, trigIds, stopAt = null) {
      const a = n.attributes || {};
      const S = (type, config = {}, extra = {}) => ({ id: stepId(n.id + type + JSON.stringify(config).slice(0, 40)), type, config, ...extra });
      const one = step => ({ steps: [step] });
      switch (n.type) {
        case 'add_contact_tag': (a.tags || []).forEach(ensureTag); return { steps: (a.tags || []).map((tag, i) => ({ ...S('add_tag', { tag }), id: stepId(`${n.id}-${i}`) })) };
        case 'remove_contact_tag': return { steps: (a.tags || []).map((tag, i) => ({ ...S('remove_tag', { tag }), id: stepId(`${n.id}-${i}`) })) };
        case 'sms': return one(S('send_whatsapp', { body: msgBody(a.body) }));
        case 'email': return one(S('send_email', { subject: msgBody(a.subject) || '(sem assunto)', body: msgBody(htmlToText(a.html || a.body)) }));
        case 'instagram-dm': return one(S('send_instagram_dm', { body: msgBody(a.body), buttons: '' }));
        case 'messenger': return one(S('send_messenger', { body: msgBody(a.body), buttons: '' }));
        case 'internal_notification': {
          const body = a.type === 'email' ? `${a.email?.subject ? a.email.subject + '\n\n' : ''}${htmlToText(a.email?.body || a.email?.html || '')}` : (a.sms?.body || a.body || '');
          return one(S('internal_notification', { body: msgBody(body).slice(0, 4000) }));
        }
        case 'add_notes': return one(S('add_note', { body: msgBody(htmlToText(a.html || a.body)) }));
        case 'task-notification': return one(S('create_task', { title: msgBody(a.title || 'Tarefa'), dueDays: 0, owner: '' }));
        case 'assign_user': note('Atribuir usuário: no GHL apontava para pessoas da equipe; escolha quem recebe os contatos.'); return one(S('assign_user', { user: '' }));
        case 'internal-add-opportunity-owner': return one(S('opportunity_owner', { op: 'set', owner: '', pipelineId: '' }));
        case 'update_contact_field': return { steps: (a.fields || []).map((f, i) => ({ ...S('update_field', { field: fieldRef(f.field) || String(f.field || '').replace(/^contact\./, ''), value: msgBody(String(f.value ?? '')) }), id: stepId(`${n.id}-${i}`) })) };
        case 'create_opportunity': return one(S('create_opportunity', { title: msgBody(a.opportunity_name || '{{contact.name}}'), stageId: stageRef(a.pipeline_stage_id), value: Number(a.monetary_value) || 0 }));
        case 'internal_create_opportunity': case 'internal_update_opportunity': {
          const input = key => (a.__customInputFields__ || []).find(f => f.filterField === key)?.value;
          const stage = stageRef(input('pipelineStageId'));
          if (!stage) return one(S('opportunity_status', { status: String(input('status') || 'Open').replace(/^\w/, c => c.toUpperCase()) }));
          return one(S('create_opportunity', { title: '{{contact.name}}', stageId: stage, value: Number(input('monetaryValue')) || 0 }));
        }
        case 'add_to_workflow': return one(S('add_to_workflow', { workflowId: workflowRef(a.workflow_id) }));
        case 'remove_from_workflow': return one(S('remove_from_workflow', { workflowId: workflowRef(a.workflow_id) }));
        case 'update_conversation_ai_status': return one(S('conversation_ai_status', { state: a.status === 'inactive' ? 'inactive' : 'active', agentId: agentRef(a.assignedEmployeeId), mode: '', channel: '', serviceId: '' }));
        case 'webhook': return one(S('webhook', { url: a.url || '', method: a.method || 'POST' }));
        case 'review_request': return one(S('review_request', { channel: 'WhatsApp' }));
        case 'event_start_date': return one(S('set_event_date', { date: msgBody(a.value || '') }));
        case 'facebook_conversion_api': return one(S('meta_conversion', { event: a.event_name || 'Lead', customEvent: '', value: msgBody(a.value || ''), currency: a.currency || 'BRL', testCode: '' }));
        case 'google_analytics': return one(S('custom_webhook', { method: 'POST', url: 'https://www.google-analytics.com/mp/collect?measurement_id={{custom_values.ga4_measurement_id}}&api_secret={{custom_values.ga4_api_secret}}',
          headers: '', contentType: 'json', body: JSON.stringify({ client_id: '{{contact.id}}', events: [{ name: (n.name || 'conversao').replace(/[^\w]+/g, '_').toLowerCase().slice(0, 40) }] }), variable: '' }));
        case 'drip': return one(S('drip', { batch: Number(a.batchSize) || 50, amount: Number(a.interval?.value) || 1, unit: UNITS[a.interval?.timeUnit] || 'days' }));
        case 'goto':
          if (a.targetNodeId && a.targetNodeId === stopAt) return { steps: [], stop: true };
          return { steps: [S('goto', { target: a.targetNodeId ? stepId(`${a.targetNodeId}`) : '' }, { ghlTarget: a.targetNodeId })], stop: true };
        case 'wait': return { steps: convertWait(n, S, depth, stopAt), stop: (a.transitions || []).length > 1 };
        case 'if_else': {
          if (n.nodeType !== 'condition-node') return { steps: [] };
          const next = Array.isArray(n.next) ? n.next : [];
          const noId = next.find(x => nodes.get(x)?.nodeType === 'branch-no');
          const merge = mergePoint([...(a.branches || []).map(b => b.id), noId].filter(Boolean));
          const yes = (a.branches || []).map(b => ({ b, steps: branch(b.id, depth, merge) }));
          const no = noId ? branch(noId, depth, merge) : [];
          const conds = b => (b.segments || []).flatMap(s => s.conditions || []).map(c => convertCondition(c, trigIds)).filter(Boolean);
          const match = b => (b.segments?.[0]?.operator || b.operator) === 'or' ? 'any' : 'all';
          if (yes.length === 1) return { steps: [S('if_else', { match: match(yes[0].b), conditions: conds(yes[0].b) }, { yes: yes[0].steps, no }), ...afterMerge(merge, depth, stopAt)], stop: true };
          return { steps: [S('router', {}, { routes: yes.slice(0, 6).map(({ b, steps }) => ({ id: stepId(b.id), label: b.name || 'Caminho', match: match(b), conditions: conds(b), steps })), otherwise: no }), ...afterMerge(merge, depth, stopAt)], stop: true };
        }
        case 'workflow_split': {
          const weights = a.extras?.weightDistribution || {};
          const merge = mergePoint((a.transitions || []).map(t => t.id));
          const routes = (a.transitions || []).map(t => ({ id: stepId(t.id), label: t.name, percent: Number(weights[t.id]) || Math.round(100 / a.transitions.length), steps: branch(t.id, depth, merge) }));
          return { steps: [S('split', {}, { routes }), ...afterMerge(merge, depth, stopAt)], stop: true };
        }
        case 'find_opportunity': {
          const found = (a.transitions || []).find(t => /not found/i.test(t.name) === false), missing = (a.transitions || []).find(t => /not found/i.test(t.name));
          const merge = mergePoint([found?.id, missing?.id].filter(Boolean));
          const step = S('find_opportunity', { pipelineId: pipelineRef(a.pipelineId) || '', status: '' });
          return { steps: [step, S('if_else', { match: 'all', conditions: [{ subject: 'var', op: 'equals', key: `steps.${step.id}.found`, value: 'yes' }] }, { yes: found ? branch(found.id, depth, merge) : [], no: missing ? branch(missing.id, depth, merge) : [] }), ...afterMerge(merge, depth, stopAt)], stop: true };
        }
        case 'fb_interactive_messenger': {
          const steps = [S('send_messenger', { body: msgBody(a.message || ''), buttons: (a.buttons || []).map(b => b.title || b.text).filter(Boolean).join('\n') })];
          const timeout = (a.transitions || []).find(t => t.conditionType === 'default') || (a.transitions || [])[0];
          return { steps: steps.concat(timeout ? branch(timeout.id, depth, stopAt) : []), stop: true };
        }
        case 'transition': return { steps: [] };
        default:
          note(`Ação do GHL sem equivalente (${n.type}): ficou como nota interna no fluxo.`);
          return one(S('internal_notification', { body: `Etapa do GHL a revisar: ${n.name || n.type}` }));
      }
    }

    function convertWait(n, S, depth, stopAt = null) {
      const a = n.attributes || {};
      const after = a.startAfter || {};
      const amount = Math.max(1, Math.round(Number(after.value) || 1));
      const unit = UNITS[after.type] || 'days';
      const transitions = a.transitions || [];
      if (a.type === 'reply' || a.type === 'link_clicked') {
        const days = Math.max(1, Math.ceil(minutes(after.value || 1, after.type === 'hour' ? 'hours' : after.type) / 1440));
        const event = a.type === 'reply' ? { event: 'customer_replied', eventValue: '' } : (() => { const tag = linkTag([].concat(a.link || [])[0]); ensureTag(tag); return { event: 'contact_tag', eventValue: tag }; })();
        const wait = S('wait', { mode: 'event', ...event, timeoutDays: days });
        if (transitions.length > 1) {
          const happened = transitions.find(t => !/timeout/i.test(t.name)), timeout = transitions.find(t => /timeout/i.test(t.name));
          const cond = a.type === 'reply' ? { subject: 'replied', op: 'yes', key: '', value: '' } : { subject: 'tag', op: 'has', key: '', value: event.eventValue };
          const merge = mergePoint([happened?.id, timeout?.id].filter(Boolean));
          return [wait, S('if_else', { match: 'all', conditions: [cond] }, { yes: happened ? branch(happened.id, depth, merge) : [], no: timeout ? branch(timeout.id, depth, merge) : [] }), ...afterMerge(merge, depth, stopAt)];
        }
        return [wait];
      }
      if (a.type === 'appointment') {
        const s = a.appointmentStartAfter || {};
        const m = minutes(s.value || 0, s.type);
        const [offset, offsetUnit] = m % 1440 === 0 ? [m / 1440, 'days'] : m % 60 === 0 ? [m / 60, 'hours'] : [m, 'minutes'];
        return [S('wait', { mode: 'event_date', offset, offsetUnit, direction: s.when === 'after' ? 'after' : 'before' })];
      }
      if (a.window?.days) note('Esperas do GHL com janela de horário (dias úteis, 9h às 17h): na Graao a espera conta o tempo corrido.');
      return [S('wait', { mode: 'delay', amount, unit })];
    }

    let steps = chain(w.workflowData?.templates?.[0]?.id);
    // goto: aponta para o primeiro passo feito do nó de destino (ou do próximo nó que virou passo).
    const landing = target => { for (let at = target, hops = 0; at && hops < 50; hops++) { if (firstStep.has(at)) return firstStep.get(at); const next = nodes.get(at)?.next; at = typeof next === 'string' ? next : null; } return ''; };
    const walk = list => { for (const s of list || []) { if (s.type === 'goto') { s.config.target = landing(s.ghlTarget); delete s.ghlTarget; } walk(s.yes); walk(s.no); walk(s.otherwise); for (const r of s.routes || []) walk(r.steps); } };
    walk(steps);
    // The field conditions of the triggers become one filter step: all of them for a single trigger; with several triggers
    // (1, 2 or 3 stars, each its own trigger in GHL), any one of them. A trigger with no condition lets every run through.
    const sets = filters.filter(set => set.length);
    if (sets.length && sets.length === filters.length) {
      const conditions = sets.length === 1 ? sets[0] : sets.map(set => set[0]);
      if (sets.length > 1 && sets.some(set => set.length > 1)) note(`Fluxo "${w.name}": gatilhos com várias condições de campo viraram um filtro "qualquer uma"; confira.`);
      steps = [{ id: stepId(`${w._id}-filter`), type: 'filter', config: { match: sets.length === 1 ? 'all' : 'any', conditions } }, ...steps];
    }
    const marker = tagsInWorkflow.get(w._id || w.id);
    if (marker) steps = [{ id: stepId(`${w._id}-marker`), type: 'add_tag', config: { tag: marker } }, ...steps];
    const folder = w.folderId || w.parentId;
    return { id: workflowRef(w._id || w.id), folderId: folder && (dump.workflowFolders || []).some(f => f.id === folder) ? id('wo', folder) : '', name: w.name, active: false, allowReentry: Boolean(w.allowMultiple), triggers: out, steps };
  };

  function convertTrigger(t, filters) {
    const cond = field => (t.conditions || []).find(c => c.field === field);
    const val = field => cond(field)?.value;
    const many = field => [].concat(val(field) ?? []).filter(v => v !== '' && v !== null);
    const make = (type, config = {}) => ({ type, config });
    // A field condition of a trigger: the run goes on only if the contact field matches (one set per trigger; see the filter step).
    const own = [];
    for (const c of t.conditions || []) {
      if (/^contact\.(?!dnd)/.test(c.field) && fieldById.has(c.id || c.field.slice(8))) own.push({ subject: 'field', op: c.operator === '!=' ? 'not_equals' : 'equals', key: fieldRef(c.id || c.field.slice(8)), value: String([].concat(c.value)[0] ?? '') });
    }
    filters.push(own);
    switch (t.type) {
      case 'pipeline_stage_updated': return [make('pipeline_stage_changed', { stageId: stageRef(val('opportunity.pipelineStageId')) })];
      case 'customer_reply': {
        const type = Number(val('message.type'));
        const keyword = [].concat(val('message.body') || [])[0] || '';
        if (type === 11 || type === 18) return [make('social_dm_received', { network: type === 11 ? 'facebook' : 'instagram', keyword })];
        if (type === 5) return [make('chat_started', { widgetId: assets.chatWidgets[0]?.id || '' })];
        return [make('customer_replied', { channel: { 2: 'WhatsApp', 19: 'WhatsApp', 3: 'Email' }[type] || '', keyword })];
      }
      case 'form_submission': { const ids = many('form.id'); return (ids.length ? ids : ['']).map(f => make('form_submitted', { formId: formRef(f), qualified: '' })); }
      case 'survey_submission': { const ids = many('survey.id'); return (ids.length ? ids : ['']).map(f => make('survey_submitted', { formId: formRef(f), qualified: '' })); }
      case 'appointment': case 'customer_appointment': {
        const status = String(val('appointment.status') || 'confirmed').toLowerCase();
        if (['cancelled', 'canceled', 'noshow', 'no_show', 'showed'].includes(status)) return [make('appointment_status', { status: status.startsWith('cancel') ? 'Canceled' : status === 'showed' ? 'Completed' : '' })];
        const calendar = serviceRef(val('calendar.id'));
        return [calendar ? make('service_booked', { serviceId: calendar, kind: '' }) : make('appointment_booked')];
      }
      case 'contact_tag': {
        const added = cond('tagsAdded'), removed = cond('tagsRemoved');
        if (removed) return [].concat(removed.value).map(tag => { ensureTag(tag); return make('contact_tag', { change: 'removed', tag }); });
        return [].concat(added?.value ?? '').map(tag => { ensureTag(tag); return make('contact_tag', { change: 'added', tag }); });
      }
      case 'contact_changed': { const c = (t.conditions || []).find(x => /^contact\./.test(x.field)); return [make('contact_changed', { field: c ? (fieldRef(c.id || c.field.slice(8)) || c.field.slice(8)) : '' })]; }
      case 'proposal_estimate_update': return [make('document_status', { status: { SIGNED: 'signed', COMPLETED: 'completed', VIEWED: 'viewed', SENT: 'sent' }[val('status')] || '', templateId: '' })];
      case 'trigger_link': { const l = val('link.id'); const tag = linkTag(l); ensureTag(tag); return [make('trigger_link_clicked', { linkId: linkById.get(l)?.id || '' })]; }
      case 'call_status': {
        const statuses = [...new Set([].concat(val('call_status') || []).map(s => ({ busy: 'busy', voicemail: 'voicemail', 'no-answer': 'missed', canceled: 'missed', completed: 'answered', failed: 'failed' }[s] || 'missed')))];
        return statuses.map(status => make('call_details', { direction: val('message.direction') || '', status, numberId: '' }));
      }
      case 'reputation_review_received': return [make('review_received', { maxScore: String(Math.min(4, Number(val('review.rating')) || 3)) })];
      case 'opportunity_decay': return [make('stale_opportunity', { days: Number(val('opportunity.lastActionDate')) || 7, stageId: '' })];
      case 'ig_comment_on_post': return [make('social_comment_received', { network: 'instagram', keyword: [].concat(val('ig.body') || [])[0] || '' })];
      case 'facebook_lead_gen': return [make('meta_lead_form', { formId: '', campaign: '', test: '' })];
      case 'opportunity_changed': return [make('opportunity_changed')];
      case 'opportunity_created': return [make('opportunity_created', { pipelineId: '' })];
      case 'birthday_reminder': note('Lembrete de aniversário: escolha o campo de data de nascimento no gatilho.'); return [make('birthday_reminder', { field: '', days: 0, time: '09:00' })];
      case 'dnd_contact': return [make('contact_dnd', { state: val('contact.dnd') === false ? 'off' : 'on' })];
      case 'payment_received': return [make('payment_received')];
      case 'external_tracking': return [make('external_tracking_event', { event: [].concat(val('eventType') || [])[0] === 'form' ? 'form' : '', url: '' })];
    }
    note(`Gatilho do GHL sem equivalente (${t.type}): o fluxo ficou sem esse gatilho.`);
    return [];
  }

  // The GHL list repeats each workflow once per folder level; a "New Workflow" with no steps is left out.
  const unique = [...new Map((dump.workflows || []).map(w => [w._id || w.id, w])).values()]
    .filter(w => !/^New Workflow/i.test(w.name));
  assets.workflows = unique.map(convertWorkflow);
  // "Ir para": troca o id do nó do GHL pelo do passo convertido, quando o nó virou passo.
  const each = (list, fn) => { for (const s of list || []) { fn(s); each(s.yes, fn); each(s.no, fn); each(s.otherwise, fn); for (const r of s.routes || []) each(r.steps, fn); } };
  for (const w of assets.workflows) {
    const ids = new Set(); each(w.steps, s => ids.add(s.id));
    each(w.steps, s => { if (s.type === 'goto' && !ids.has(s.config.target)) { note(`Fluxo "${w.name}": um "ir para" do GHL ficou sem destino.`); s.config.target = ''; } });
  }
  // Clique em link de rastreamento → tag clicou-<link> (as esperas e condições convertidas usam essa tag).
  for (const link of assets.triggerLinks) {
    const ghl = [...linkById].find(([, row]) => row === link)?.[0];
    const tag = linkTag(ghl);
    if (!tagNames.has(tag)) continue;
    assets.workflows.push({ id: id('wf', `link-${ghl}`), folderId: '', name: `Link clicado: ${link.name} → tag ${tag}`, active: false, allowReentry: true,
      triggers: [{ id: `${P}t${hash(`link-${ghl}`, 9)}`, type: 'trigger_link_clicked', config: { linkId: link.id } }], steps: [{ id: stepId(`link-${ghl}`), type: 'add_tag', config: { tag } }] });
  }

  /* ───────── Sites e funis ───────── */

  assets.studioProjects = [];
  const sites = {};
  const pageValues = new Set();
  for (const funnel of dump.funnels || []) {
    if (/\bcopy$/i.test(funnel.name.trim())) continue;
    const projectId = id('site', funnel._id);
    const ordered = [...funnel.pages];
    const stepOrder = new Map((funnel.steps || []).map(s => [s.id, s.sequence]));
    ordered.sort((x, y) => (stepOrder.get(x.stepId) ?? 999) - (stepOrder.get(y.stepId) ?? 999));
    const home = ordered.findIndex(p => p.url === '/' || /^home$/i.test(p.name.trim()));
    if (home > 0) ordered.unshift(ordered.splice(home, 1)[0]);
    const taken = [];
    const slugs = ordered.map((p, i) => { let s = i === 0 ? 'index' : slugOf(String(p.url || p.name).replace(/^\//, '')) || `pagina-${i + 1}`; for (let n = 2; taken.includes(s); n++) s = `${slugOf(String(p.url || p.name))}-${n}`; taken.push(s); return s; });
    const links = new Map();
    ordered.forEach((p, i) => { const path = String(p.url || ''); if (path) { links.set(path, `page:${slugs[i]}`); links.set(path.replace(/\/$/, '') || '/', `page:${slugs[i]}`); } });
    // The GHL preview links pages by id (/preview/<pageId>). A page of another funnel (often its "Copy") goes to the page of
    // this site with the same name, or nowhere.
    const plainName = name => String(name || '').replace(/\s+clone(\s+clone)*$/i, '').trim().toLowerCase();
    for (const other of dump.funnels || []) for (const p of other.pages || []) {
      const at = other._id === funnel._id ? ordered.indexOf(p) : ordered.findIndex(own => plainName(own.name) === plainName(p.name));
      links.set(`/preview/${p._id}`, at >= 0 ? `page:${slugs[at]}` : '#');
    }
    const pages = ordered.map((p, i) => {
      let data = {}; try { data = JSON.parse(p.pageData || '{}'); } catch { data = {}; }
      const elements = [];
      const backgrounds = [];
      const walk = o => { if (Array.isArray(o)) return o.forEach(walk); if (!o || typeof o !== 'object') return;
        // O GHL põe a imagem de fundo de seções, linhas e colunas por script; aqui ela vira CSS.
        const bg = o.extra?.bgImage?.value;
        if (typeof o.id === 'string' && bg?.mediaType !== 'video' && typeof bg?.url === 'string' && bg.url.trim())
          backgrounds.push({ id: o.id, url: bg.url.trim(), opacity: bg.opacity, options: bg.options });
        if (o.type === 'element' && typeof o.id === 'string') {
          const ex = o.extra || {};
          if (o.tagName === 'c-form' && ex.formId?.value) elements.push({ id: o.id, kind: 'form', ref: pageFormRef(ex.formId.value), label: formRef(ex.formId.value) ? `Formulário: ${ex.formId.text || ''}` : 'Formulário' });
          if (o.tagName === 'c-survey' && ex.surveyId?.value) elements.push({ id: o.id, kind: 'survey', ref: pageFormRef(ex.surveyId.value), label: `Pesquisa: ${ex.surveyId.text || ''}` });
          if (o.tagName === 'c-calendar' && ex.calendarId?.value) elements.push({ id: o.id, kind: 'booking', ref: serviceRef(ex.calendarId.value), label: `Agenda: ${String(ex.calendarId.text || '').replace(/\s*-\s*\{\{location\.name\}\}/, '')}` });
          if (o.tagName === 'c-video') { const v = ex.videoProperties?.value || {}; const url = v.type === 'selfHosted' ? v.selfHostedVideo?.url : v.url; elements.push({ id: o.id, kind: 'video', url: url || '', label: 'Vídeo' }); }
          // Os valores personalizados que a prévia apagou voltam como marcadores {{ custom_values.x }}.
          const cv = value => typeof value === 'string' && /\{\{\s*custom_values\./.test(value) ? value : '';
          const fill = { id: o.id };
          if (['c-heading', 'c-sub-heading', 'c-paragraph', 'c-bullet-list'].includes(o.tagName)) fill.text = cv(ex.text?.value);
          if (o.tagName === 'c-button') {
            fill.buttonText = cv(ex.text?.value);
            const action = ex.action?.value;
            fill.href = action === 'call' && cv(ex.phoneNumber?.value) ? `tel:${ex.phoneNumber.value}` : action === 'email' && cv(ex.emailAddress?.value) ? `mailto:${ex.emailAddress.value}`
              : ['url', 'go-to-website', 'visit-website'].includes(action) || !action ? cv(ex.visitWebsite?.value?.url) : '';
          }
          if (['c-image', 'c-nav-menu'].includes(o.tagName)) fill.img = cv(ex.imageProperties?.value?.url);
          if (fill.text || fill.buttonText || fill.href || fill.img) fills.push(fill);
          for (const key of JSON.stringify(ex).matchAll(/custom_values\.(\w+)/g)) pageValues.add(key[1]);
        }
        Object.values(o).forEach(walk); };
      const fills = [];
      walk(data.sections);
      const raw = page(p._id);
      if (!raw) note(`A página "${p.name}" não pôde ser baixada.`);
      for (const { url } of backgrounds) for (const key of url.matchAll(/custom_values\.(\w+)/g)) pageValues.add(key[1]);
      const html = raw ? cleanPage(raw, { title: p.name, elements, fills, links, backgrounds }) : `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${p.name}</title></head><body><h1>${p.name}</h1></body></html>`;
      return { name: p.name.replace(/\s+clone(\s+clone)*$/i, '').trim() || p.name, slug: slugs[i], html };
    });
    const firstForm = pages.map(pg => /data-graao-embed="form" data-id="([^"]+)"/.exec(pg.html)?.[1]).find(Boolean) || '';
    assets.studioProjects.push({ id: projectId, name: funnel.name, headline: funnel.name, summary: '', brief: '', template: 'landing', theme: 'indigo', kind: funnel.kind === 'website' ? 'website' : 'funnel',
      blocks: [], design: null, reference: '', formId: firstForm, publishedAt: '', publishedRev: 0, rev: 1, starred: false, pages: pages.map((pg, i) => ({ id: `${projectId}-p${i + 1}`, name: pg.name, slug: pg.slug })) });
    sites[projectId] = pages;
  }

  // Formulários que levavam a uma página do site: o site que usa o formulário e tem a página; sem ela, a mensagem padrão.
  for (const form of assets.forms || []) {
    for (const holder of [form, ...(form.routes || [])]) {
      const to = holder.onSubmit || holder.destination;
      if (to?.action !== 'page' || to.siteId) continue;
      const slug = to.page;
      // O GHL acrescenta números ao slug de páginas clonadas: thank-you vira thank-you-page393881-8639.
      const page = project => (sites[project.id] || []).find(pg => pg.slug === slug) || (sites[project.id] || []).find(pg => pg.slug.startsWith(`${slug}-`));
      const site = assets.studioProjects.find(p => page(p) && sites[p.id].some(pg => pg.html.includes(`data-id="${form.id}"`)))
        || assets.studioProjects.find(page);
      if (site) Object.assign(to, { siteId: site.id, page: page(site).slug });
      else { Object.assign(to, { action: 'default', page: '' }); note(`Formulário "${form.name}" levava a /${slug}, que nenhum site tem: mostra a mensagem padrão.`); }
    }
  }

  // Valores personalizados usados nas páginas e mensagens que a subconta não tinha criado: entram vazios, com nome legível.
  const used = new Set(pageValues);
  for (const key of JSON.stringify(assets).matchAll(/custom_values\.(\w+)/g)) used.add(key[1]);
  for (const key of used) {
    if (assets.customValues.some(v => v.key === `custom_values.${key}`)) continue;
    assets.customValues.push({ id: id('cv', `used-${key}`), name: key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()), folder: 'Site', value: '', key: `custom_values.${key}` });
  }

  // Tira coleções vazias.
  for (const key of Object.keys(assets)) if (!assets[key]?.length) delete assets[key];
  return { assets, sites, notes };
}
