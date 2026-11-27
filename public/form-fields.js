// Forms builder: the field catalog, validation of a form's fields and of a visitor's answers,
// and the HTML of the public form. Shared by the server (public page, submit) and the builder.

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const clean = (value, limit) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
const slugKey = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };

// input: how it renders and validates. map: the contact property it fills. key: fixed query key.
export const fieldKinds = {
  name: { label: 'Nome completo', input: 'text', map: 'name', key: 'name', auto: 'name', placeholder: 'Seu nome' },
  first_name: { label: 'Nome', input: 'text', map: 'firstName', key: 'first_name', auto: 'given-name' },
  last_name: { label: 'Sobrenome', input: 'text', map: 'lastName', key: 'last_name', auto: 'family-name' },
  email: { label: 'E-mail', input: 'email', map: 'email', key: 'email', auto: 'email', placeholder: 'voce@empresa.com' },
  phone: { label: 'Telefone', input: 'tel', map: 'phone', key: 'phone', auto: 'tel', placeholder: '(11) 99999-0000' },
  birthday: { label: 'Data de nascimento', input: 'date', key: 'date_of_birth', auto: 'bday' },
  address: { label: 'Endereço', input: 'text', key: 'address', auto: 'street-address' },
  city: { label: 'Cidade', input: 'text', key: 'city', auto: 'address-level2' },
  state: { label: 'Estado', input: 'text', key: 'state', auto: 'address-level1' },
  country: { label: 'País', input: 'text', key: 'country', auto: 'country-name' },
  postal_code: { label: 'CEP', input: 'text', key: 'postal_code', auto: 'postal-code' },
  organization: { label: 'Empresa', input: 'text', map: 'company', key: 'organization', auto: 'organization' },
  website: { label: 'Site', input: 'url', key: 'website', auto: 'url', placeholder: 'https://www.exemplo.com.br' },
  text: { label: 'Linha única', input: 'text' },
  textarea: { label: 'Várias linhas', input: 'textarea' },
  select: { label: 'Lista suspensa', input: 'select', choices: true },
  multiselect: { label: 'Seleção múltipla', input: 'multi', choices: true },
  checkbox: { label: 'Caixas de seleção', input: 'checkbox', choices: true },
  radio: { label: 'Opção única', input: 'radio', choices: true },
  rating: { label: 'Avaliação', input: 'rating' },
  date: { label: 'Data', input: 'date' },
  number: { label: 'Número', input: 'number' },
  monetary: { label: 'Valor (R$)', input: 'money' },
  heading: { label: 'Texto', input: 'static' },
  terms: { label: 'Termos e consentimento', input: 'consent' },
  source: { label: 'Origem', input: 'hidden', key: 'source' },
  custom: { label: 'Campo do contato', input: 'custom' },
  break: { label: 'Nova etapa', input: 'break' }
};

export const fieldCatalog = [
  ['Estrutura', ['break']],
  ['Dados pessoais', ['name', 'first_name', 'last_name', 'email', 'phone', 'birthday']],
  ['Endereço', ['address', 'city', 'state', 'country', 'postal_code', 'organization', 'website']],
  ['Texto', ['text', 'textarea']],
  ['Escolhas', ['select', 'multiselect', 'checkbox', 'radio']],
  ['Avaliação', ['rating']],
  ['Personalizados', ['heading', 'terms', 'source']],
  ['Outros', ['date', 'number', 'monetary']]
];

let counter = 0;
const newId = () => `f${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newField(type, extra = {}) {
  const kind = fieldKinds[type] || fieldKinds.text;
  const field = { id: newId(), type: fieldKinds[type] ? type : 'text', label: kind.label, placeholder: kind.placeholder || '', key: kind.key || '', required: false, hidden: false, width: 100, options: [], help: '', text: '', value: '' };
  if (kind.choices) field.options = ['Opção 1 / Opción 1', 'Opção 2 / Opción 2', 'Opção 3 / Opción 3'];
  if (type === 'email') field.required = true;
  if (type === 'heading') { field.label = 'Fale com a gente / Contáctenos'; field.text = 'Preencha os campos e retornamos em até 1 dia útil. / Complete los campos y responderemos en 1 día hábil.'; }
  if (type === 'terms') { field.required = true; field.label = 'Consentimento'; field.text = 'Concordo em receber contatos sobre este assunto e aceito a política de privacidade. / Acepto recibir comunicaciones sobre este asunto y acepto la política de privacidad.'; }
  if (type === 'source') { field.hidden = true; field.value = 'Formulário'; }
  if (type === 'rating') field.label = 'Como você avalia? / ¿Cómo evalúas?';
  if (type === 'break') field.label = '';
  return { ...field, ...extra };
}

// The fields of a form saved before the builder existed: name, email and, optionally, phone.
export function formFields(form) {
  if (Array.isArray(form?.fields) && form.fields.length) return form.fields;
  return [
    { ...newField('name'), id: 'legacy-name', required: true },
    { ...newField('email'), id: 'legacy-email' },
    ...(form?.askPhone ? [{ ...newField('phone'), id: 'legacy-phone' }] : [])
  ];
}

// Validates the fields coming from the builder. Throws a message in Portuguese.
export function validFields(input, customFields = [], formKind = 'form') {
  if (Array.isArray(input) && formKind === 'form') input = input.filter(raw => raw?.type !== 'break');
  if (!Array.isArray(input) || !input.length) fail('Adicione pelo menos um campo ao formulário.');
  if (input.length > 60) fail('Um formulário aceita até 60 campos.');
  const keys = new Set(), ids = new Set();
  const fields = input.map(raw => {
    const type = fieldKinds[raw?.type] ? raw.type : fail('Tipo de campo desconhecido.');
    const kind = fieldKinds[type];
    let id = /^[a-z0-9-]{1,40}$/i.test(raw.id || '') ? raw.id : newId();
    while (ids.has(id)) id = newId();
    ids.add(id);
    const field = { id, type, label: clean(raw.label, 200) || kind.label, placeholder: clean(raw.placeholder, 120), key: '',
      required: Boolean(raw.required), hidden: Boolean(raw.hidden), width: Number(raw.width) === 50 ? 50 : 100,
      options: [], help: clean(raw.help, 300), text: String(raw.text ?? '').trim().slice(0, 2000), value: clean(raw.value, 200) };
    if (type === 'custom') {
      const custom = customFields.find(item => item.id === raw.customId && item.object === 'Contact');
      if (!custom) fail(`O campo do contato “${field.label}” não existe mais.`);
      field.customId = custom.id;
      if (custom.type === 'Dropdown (single)') field.options = custom.options.slice(0, 50);
    }
    if (kind.choices) {
      field.options = [...new Set((Array.isArray(raw.options) ? raw.options : String(raw.options || '').split('\n')).map(option => clean(option, 120)).filter(Boolean))].slice(0, 50);
      if (!field.options.length) fail(`Adicione opções ao campo “${field.label}”.`);
      if (formKind === 'quiz' && raw.scores && typeof raw.scores === 'object')
        field.scores = Object.fromEntries(field.options.filter(option => raw.scores[option] !== undefined && raw.scores[option] !== '').map(option => [option, Math.max(-1000, Math.min(1000, Math.round(Number(raw.scores[option]) || 0)))]));
      if (formKind === 'quiz') field.category = clean(raw.category, 40);
      if (formKind !== 'form' && ['select', 'radio'].includes(type) && Array.isArray(raw.logic))
        field.logic = raw.logic.map(rule => ({ option: clean(rule?.option, 120), to: clean(rule?.to, 40) })).filter(rule => field.options.includes(rule.option) && rule.to).slice(0, 50);
    }
    if (type === 'break') { field.label = clean(raw.label, 200); field.required = false; field.hidden = false; }
    if (kind.input === 'static') { field.required = false; field.hidden = false; }
    if (kind.input === 'hidden') { field.hidden = true; field.required = false; }
    if (field.hidden && kind.input !== 'hidden') field.required = false;
    if (!['static', 'break'].includes(kind.input)) {
      let key = kind.key || slugKey(raw.key) || slugKey(field.label) || 'campo';
      if (!kind.key) for (let n = 2; keys.has(key); n++) key = `${slugKey(raw.key) || slugKey(field.label) || 'campo'}_${n}`;
      if (keys.has(key)) fail(`O campo “${field.label}” aparece duas vezes. Use apenas um.`);
      keys.add(key);
      field.key = key;
    }
    return field;
  });
  // A jump goes forward to a later step, or to the end.
  const at = new Map(fields.map((field, index) => [field.id, index]));
  fields.forEach((field, index) => { if (field.logic) field.logic = field.logic.filter(rule => rule.to === 'end' || (fields[at.get(rule.to)]?.type === 'break' && at.get(rule.to) > index)); });
  if (!fields.some(field => ['email', 'phone'].includes(field.type) && !field.hidden)) fail('Inclua um campo de e-mail ou de telefone: é com ele que o contato é criado.');
  return fields;
}

const customInput = (field, customFields) => {
  const custom = customFields.find(item => item.id === field.customId);
  return { 'Multi line': 'textarea', Number: 'number', Monetary: 'money', Date: 'date', Checkbox: 'consent', Email: 'email', Phone: 'tel', 'Dropdown (single)': 'select' }[custom?.type] || 'text';
};
export const inputOf = (field, customFields = []) => field.type === 'custom' ? customInput(field, customFields) : fieldKinds[field.type]?.input || 'text';

const isQuestion = field => !field.hidden && !['static', 'hidden', 'break'].includes(fieldKinds[field.type]?.input);

// Steps of a survey or quiz: a "break" starts a new step; with oneAtATime every question is its own step.
export function slidesOf(form) {
  const slides = [{ anchors: ['start'], title: '', fields: [] }];
  for (const field of formFields(form)) {
    const last = slides.at(-1);
    if (field.type === 'break') {
      if (last.fields.some(isQuestion)) slides.push({ anchors: [field.id], title: field.label, fields: [] });
      else { last.anchors.push(field.id); last.title ||= field.label; }
      continue;
    }
    if (form.oneAtATime && isQuestion(field) && last.fields.some(isQuestion)) slides.push({ anchors: [], title: '', fields: [] });
    slides.at(-1).fields.push(field);
  }
  return slides.filter((slide, index) => index === 0 || slide.fields.length);
}

// The steps a visitor goes through, following the jumps of the answers given.
export function pathOf(form, input = {}) {
  const slides = slidesOf(form), visited = [];
  const at = anchor => slides.findIndex(slide => slide.anchors.includes(anchor));
  for (let i = 0; i >= 0 && i < slides.length && !visited.includes(i);) {
    visited.push(i);
    let next = i + 1;
    for (const field of slides[i].fields) {
      const raw = input[field.key], value = clean(Array.isArray(raw) ? raw[0] : raw, 120);
      const rule = field.logic?.find(item => item.option === value);
      if (!rule) continue;
      next = rule.to === 'end' ? -1 : at(rule.to);
      if (next !== -1 && next <= i) next = i + 1;
      break;
    }
    i = next;
  }
  return { slides, visited };
}

export const defaultTiers = [
  { name: 'Baixo', min: 0, max: 39, message: 'Há bastante espaço para crescer. Vamos montar juntos os primeiros passos?', ctaLabel: '', ctaUrl: '', tag: '' },
  { name: 'Médio', min: 40, max: 70, message: 'Você já tem uma boa base. Alguns ajustes podem acelerar os resultados.', ctaLabel: '', ctaUrl: '', tag: '' },
  { name: 'Alto', min: 71, max: 100, message: 'Excelente! Você está à frente da maioria. Vamos levar isso ao próximo nível?', ctaLabel: '', ctaUrl: '', tag: '' }
];

export function validTiers(input) {
  if (!Array.isArray(input) || !input.length) fail('Crie pelo menos uma faixa de resultado.');
  if (input.length > 10) fail('Use até 10 faixas de resultado.');
  const tiers = input.map(raw => {
    const min = Math.round(Number(raw?.min)), max = Math.round(Number(raw?.max));
    const name = clean(raw?.name, 40) || fail('Dê um nome a cada faixa.');
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max > 100 || min > max) fail(`A faixa “${name}” precisa ir de 0 a 100%, com o início menor que o fim.`);
    const ctaUrl = clean(raw?.ctaUrl, 600);
    if (ctaUrl && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(ctaUrl)) fail(`O link do botão da faixa “${name}” precisa começar com https://`);
    return { name, min, max, message: String(raw?.message ?? '').trim().slice(0, 600), ctaLabel: clean(raw?.ctaLabel, 60), ctaUrl, tag: clean(raw?.tag, 48) };
  }).sort((a, b) => a.min - b.min);
  tiers.slice(1).forEach((tier, index) => { if (tier.min <= tiers[index].max) fail(`As faixas “${tiers[index].name}” e “${tier.name}” se sobrepõem.`); });
  return tiers;
}

// Quiz result: points of the chosen answers over the most points possible, and the matching tier.
export function scoreOf(form, values) {
  let score = 0, max = 0;
  const categories = new Map();
  for (const field of formFields(form).filter(item => fieldKinds[item.type]?.choices && item.scores && Object.keys(item.scores).length)) {
    const points = field.options.map(option => Number(field.scores[option]) || 0);
    const many = ['multiselect', 'checkbox'].includes(field.type);
    const most = many ? points.filter(n => n > 0).reduce((a, b) => a + b, 0) : Math.max(0, ...points);
    const value = values[field.key], chosen = Array.isArray(value) ? value : value ? [value] : [];
    const got = chosen.reduce((sum, option) => sum + (Number(field.scores[option]) || 0), 0);
    score += got; max += most;
    if (field.category) { const row = categories.get(field.category) || { name: field.category, score: 0, max: 0 }; row.score += got; row.max += most; categories.set(field.category, row); }
  }
  const percent = max ? Math.max(0, Math.min(100, Math.round(score / max * 100))) : 0;
  const tiers = form.tiers?.length ? form.tiers : defaultTiers;
  const tier = tiers.find(item => percent >= item.min && percent <= item.max) || null;
  return { score, max, percent, tier: tier?.name || '', tierDetail: tier,
    categories: [...categories.values()].map(row => ({ ...row, percent: row.max ? Math.max(0, Math.min(100, Math.round(row.score / row.max * 100))) : 0 })) };
}

const empty = value => value === undefined || value === null || (Array.isArray(value) ? !value.length : String(value).trim() === '');

// Reads a visitor's answers. Returns the contact data, custom contact values and the answers to keep.
export function readAnswers(form, input, customFields = []) {
  const fields = formFields(form), errors = {}, values = {}, answers = [], contact = {}, custom = {};
  const strict = Array.isArray(form?.fields) && form.fields.length > 0; // forms made before the builder accepted any phone
  const { slides, visited } = pathOf(form, input || {});
  const reached = new Set(visited.flatMap(index => slides[index].fields.map(field => field.id)));
  for (const field of fields) {
    const type = inputOf(field, customFields);
    if (type === 'static' || type === 'break' || !reached.has(field.id)) continue;
    let raw = input?.[field.key];
    if (type === 'hidden') raw = empty(raw) ? field.value : raw;
    const many = ['multi', 'checkbox'].includes(type);
    let value = many ? (Array.isArray(raw) ? raw : empty(raw) ? [] : [raw]).map(item => clean(item, 120)).filter(Boolean) : clean(Array.isArray(raw) ? raw[0] : raw, type === 'textarea' ? 5000 : 500);
    if (type === 'textarea' && !Array.isArray(raw)) value = String(raw ?? '').trim().slice(0, 5000);
    values[field.key] = value;
    if (empty(value) || (type === 'consent' && value !== 'on' && value !== 'true')) {
      if (field.required && !field.hidden) errors[field.key] = type === 'consent' ? 'Marque para continuar.' : 'Preencha este campo.';
      continue;
    }
    let shown = Array.isArray(value) ? value.join(', ') : value;
    if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors[field.key] = 'Use um e-mail válido.';
    else if (type === 'tel' && strict && !/^[+()\d\s.-]{8,24}$/.test(value)) errors[field.key] = 'Use um telefone válido.';
    else if (type === 'url' && !/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(value)) errors[field.key] = 'Use um endereço válido.';
    else if (type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))) errors[field.key] = 'Use uma data válida.';
    else if ((type === 'number' || type === 'money') && !Number.isFinite(Number(String(value).replace(',', '.')))) errors[field.key] = 'Use um número.';
    else if (type === 'rating' && !['1', '2', '3', '4', '5'].includes(value)) errors[field.key] = 'Escolha de 1 a 5.';
    else if (['select', 'radio'].includes(type) && !field.options.includes(value)) errors[field.key] = 'Escolha uma das opções.';
    else if (many && value.some(item => !field.options.includes(item))) errors[field.key] = 'Escolha entre as opções.';
    if (errors[field.key]) continue;
    if (type === 'consent') shown = 'Sim';
    if (type === 'money') shown = Number(String(value).replace(',', '.')).toFixed(2);
    if (type === 'rating') shown = `${value} / 5`;
    const map = fieldKinds[field.type]?.map;
    if (map) contact[map] = type === 'email' ? value.toLowerCase() : value;
    if (field.type === 'custom') custom[field.customId] = type === 'consent' ? true : type === 'money' || type === 'number' ? Number(String(value).replace(',', '.')) : value;
    answers.push({ key: field.key, label: field.label, value: shown });
  }
  const name = contact.name || [contact.firstName, contact.lastName].filter(Boolean).join(' ');
  if (!Object.keys(errors).length && !contact.email && !contact.phone) errors._form = 'Informe um e-mail ou telefone.';
  const result = form?.kind === 'quiz' ? scoreOf(form, values) : null;
  if (result) answers.push({ key: '_result', label: 'Resultado', value: `${result.tier ? `${result.tier} · ` : ''}${result.percent}% (${result.score} de ${result.max} pontos)` });
  return { ok: !Object.keys(errors).length, errors, values, answers: answers.slice(0, 61), result,
    contact: { name: name || contact.email || contact.phone || '', email: contact.email || '', phone: contact.phone || '', company: contact.company || '' }, custom };
}

export function formOpen(form, at = new Date()) {
  const start = form.schedule?.start ? Date.parse(form.schedule.start) : NaN, end = form.schedule?.end ? Date.parse(form.schedule.end) : NaN;
  return !(at.getTime() < start) && !(at.getTime() > end);
}

/* ───────── HTML ───────── */

export function fieldMarkup(field, { values = {}, errors = {}, customFields = [], disabled = false } = {}) {
  const type = inputOf(field, customFields);
  const value = disabled && type === 'hidden' ? field.value : values[field.key];
  const off = disabled ? ' disabled tabindex="-1"' : '';
  const req = field.required && !disabled ? ' required' : '';
  const id = `sf-${esc(field.id)}`;
  const describe = errors[field.key] ? ` aria-invalid="true" aria-describedby="${id}-error"` : '';
  const hint = field.help ? `<small class="sf-help">${esc(field.help)}</small>` : '';
  const error = errors[field.key] ? `<small class="sf-error" id="${id}-error">${esc(errors[field.key])}</small>` : '';
  const label = `<span class="sf-label">${esc(field.label)}${field.required ? ' <i aria-hidden="true">*</i>' : ''}</span>`;
  const attrs = `id="${id}" name="${esc(field.key)}"${req}${off}${describe}`;
  const auto = fieldKinds[field.type]?.auto ? ` autocomplete="${fieldKinds[field.type].auto}"` : '';
  const ph = field.placeholder ? ` placeholder="${esc(field.placeholder)}"` : '';
  const cls = `sf-field sf-${type}${field.width === 50 ? ' sf-half' : ''}${field.hidden ? ' sf-is-hidden' : ''}`;
  if (type === 'break') return disabled ? `<div class="sf-field sf-break" data-field="${esc(field.id)}"><span>Nova etapa</span>${field.label ? `<b>${esc(field.label)}</b>` : ''}</div>` : '';
  if (type === 'static') return `<div class="${cls}" data-field="${esc(field.id)}">${field.label ? `<h3 class="sf-heading">${esc(field.label)}</h3>` : ''}${field.text ? `<p class="sf-text">${esc(field.text)}</p>` : ''}</div>`;
  if (!disabled && (type === 'hidden' || field.hidden)) return `<input type="hidden" name="${esc(field.key)}" value="${esc(empty(value) ? field.value : value)}">`;
  let control;
  if (type === 'textarea') control = `<textarea ${attrs} rows="4" maxlength="5000"${ph}>${esc(value)}</textarea>`;
  else if (type === 'select') control = `<select ${attrs}><option value="">${esc(field.placeholder || 'Selecione')}</option>${field.options.map(option => `<option${option === value ? ' selected' : ''}>${esc(option)}</option>`).join('')}</select>`;
  else if (type === 'multi') control = `<select ${attrs} multiple size="${Math.min(5, field.options.length)}">${field.options.map(option => `<option${(value || []).includes?.(option) ? ' selected' : ''}>${esc(option)}</option>`).join('')}</select>`;
  else if (type === 'checkbox' || type === 'radio') {
    const kind = type === 'radio' ? 'radio' : 'checkbox';
    return `<fieldset class="${cls}" data-field="${esc(field.id)}"${describe}><legend class="sf-label">${esc(field.label)}${field.required ? ' <i aria-hidden="true">*</i>' : ''}</legend>
      <div class="sf-options">${field.options.map((option, index) => `<label class="sf-option"><input type="${kind}" name="${esc(field.key)}" value="${esc(option)}"${kind === 'radio' && field.required && index === 0 && !disabled ? ' required' : ''}${(Array.isArray(value) ? value.includes(option) : value === option) ? ' checked' : ''}${off}> <span>${esc(option)}</span></label>`).join('')}</div>${hint}${error}</fieldset>`;
  }
  else if (type === 'rating') {
    return `<fieldset class="${cls}" data-field="${esc(field.id)}"${describe}><legend class="sf-label">${esc(field.label)}${field.required ? ' <i aria-hidden="true">*</i>' : ''}</legend>
      <div class="sf-stars">${[5, 4, 3, 2, 1].map(n => `<input type="radio" id="${id}-${n}" name="${esc(field.key)}" value="${n}"${String(value) === String(n) ? ' checked' : ''}${field.required && n === 5 && !disabled ? ' required' : ''}${off}><label for="${id}-${n}" title="${n} de 5"><span class="sf-sr">${n} de 5</span>★</label>`).join('')}</div>${hint}${error}</fieldset>`;
  }
  else if (type === 'consent') return `<div class="${cls}" data-field="${esc(field.id)}"><label class="sf-option sf-consent"><input type="checkbox" ${attrs} value="on"${value === 'on' ? ' checked' : ''}> <span>${esc(field.text || field.label)}${field.required ? ' <i aria-hidden="true">*</i>' : ''}</span></label>${hint}${error}</div>`;
  else {
    const html = { email: 'email', tel: 'tel', url: 'url', date: 'date', number: 'number', money: 'number' }[type] || 'text';
    const extra = type === 'money' ? ' step="0.01" min="0" inputmode="decimal"' : type === 'number' ? ' step="any"' : type === 'url' ? ' inputmode="url"' : '';
    control = `${type === 'money' ? '<span class="sf-prefix">R$</span>' : ''}<input type="${html}" ${attrs}${auto}${ph}${extra} maxlength="500" value="${esc(value)}">`;
  }
  return `<label class="${cls}" data-field="${esc(field.id)}">${label}<span class="sf-control">${control}</span>${hint}${error}</label>`;
}

export function formMarkup(form, { action = '', values = {}, errors = {}, customFields = [] } = {}) {
  const alert = errors._form ? `<p class="sf-alert" role="alert">${esc(errors._form)}</p>` : Object.keys(errors).length ? '<p class="sf-alert" role="alert">Confira os campos destacados.</p>' : '';
  const slides = form.kind && form.kind !== 'form' ? slidesOf(form) : [{ anchors: ['start'], title: '', fields: formFields(form) }];
  const grid = slide => `<div class="sf-grid">${slide.fields.map(field => fieldMarkup(field, { values, errors, customFields })).join('')}</div>`;
  const open = `<form class="sf${slides.length > 1 ? ' sf-steps' : ''}" data-graao-lead method="post" action="${esc(action)}" novalidate${slides.length > 1 ? ' data-steps' : ''}>`;
  if (slides.length < 2) return `${open}${alert}${grid(slides[0])}<button class="sf-submit" type="submit">${esc(form.button || 'Enviar')}</button></form>`;
  const logic = { slides: slides.map(slide => ({ anchors: slide.anchors, rules: slide.fields.filter(field => field.logic?.length).map(field => ({ key: field.key, logic: field.logic })) })) };
  return `${open}${alert}<div class="sf-progress" aria-hidden="true"><i></i></div>
    ${slides.map((slide, index) => `<section class="sf-slide" data-slide="${index}" aria-label="Etapa ${index + 1} de ${slides.length}">${slide.title ? `<h2 class="sf-slide-title">${esc(slide.title)}</h2>` : ''}${grid(slide)}</section>`).join('')}
    <div class="sf-nav"><button type="button" class="sf-back" data-back>Voltar</button><span class="sf-count" data-count></span><button type="button" class="sf-submit sf-next" data-next>Próximo</button><button class="sf-submit" type="submit" data-send>${esc(form.button || 'Enviar')}</button></div>
    <script type="application/json" class="sf-logic">${JSON.stringify(logic).replace(/</g, '\\u003c')}</script></form>`;
}

// Runs the steps in the browser: one step at a time, required fields checked, jumps followed.
// Without JavaScript every step shows at once and the server applies the same jumps.
const stepsScript = `(()=>{const f=document.querySelector('form[data-steps]');if(!f)return;f.classList.add('sf-js');
const map=JSON.parse(f.querySelector('.sf-logic').textContent),slides=[...f.querySelectorAll('.sf-slide')],back=f.querySelector('[data-back]'),next=f.querySelector('[data-next]'),send=f.querySelector('[data-send]'),bar=f.querySelector('.sf-progress i'),count=f.querySelector('[data-count]');
const target=i=>{for(const r of map.slides[i].rules){const v=(f.elements[r.key]&&f.elements[r.key].value)||'';const rule=r.logic.find(x=>x.option===v);if(rule){if(rule.to==='end')return -1;const j=map.slides.findIndex(s=>s.anchors.includes(rule.to));return j>i?j:i+1}}return i+1<slides.length?i+1:-1};
let hist=[0];const err=slides.findIndex(s=>s.querySelector('.sf-error'));
if(err>0)while(hist.at(-1)!==err&&hist.length<=slides.length){const t=target(hist.at(-1));if(t<0)break;hist.push(t)}
const ok=i=>{for(const el of slides[i].querySelectorAll('input,select,textarea')){if(!el.checkValidity()){el.reportValidity();return false}}return true};
const show=()=>{const i=hist.at(-1),t=target(i);slides.forEach((s,j)=>{s.hidden=j!==i});back.hidden=hist.length<2;next.hidden=t<0;send.hidden=t>=0;bar.style.width=Math.round((i+1)/slides.length*100)+'%';count.textContent=(i+1)+' de '+slides.length};
next.addEventListener('click',()=>{const i=hist.at(-1);if(!ok(i))return;hist.push(target(i));show();const el=slides[hist.at(-1)].querySelector('input:not([type=hidden]),select,textarea');el&&el.focus()});
back.addEventListener('click',()=>{hist.pop();show()});f.addEventListener('change',show);
f.addEventListener('submit',e=>{if(!next.hidden){e.preventDefault();next.click();return}if(!ok(hist.at(-1))){e.preventDefault();return}slides.forEach((s,j)=>{if(!hist.includes(j))s.querySelectorAll('input,select,textarea').forEach(el=>{el.disabled=true})})});
show()})()`;

export const formCss = `
.sf{--sf-accent:#155eef;display:grid;gap:18px;font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#101828}
.sf-grid{display:flex;flex-wrap:wrap;gap:16px 14px}
.sf-field{flex:1 1 100%;display:grid;gap:6px;min-width:0;margin:0;padding:0;border:0}
.sf-half{flex:1 1 calc(50% - 7px)}
@media (max-width:520px){.sf-half{flex-basis:100%}}
.sf-label{font-weight:600;font-size:14px;padding:0}.sf-label i{color:#d92d20;font-style:normal}
.sf-control{display:flex;align-items:center;gap:6px}
.sf input:not([type=radio]):not([type=checkbox]),.sf select,.sf textarea{width:100%;box-sizing:border-box;min-height:44px;padding:10px 12px;border:1px solid #d0d5dd;border-radius:10px;background:#fff;color:inherit;font:inherit}
.sf textarea{resize:vertical}.sf select[multiple]{min-height:auto}
.sf input:focus-visible,.sf select:focus-visible,.sf textarea:focus-visible{outline:2px solid var(--sf-accent);outline-offset:1px;border-color:var(--sf-accent)}
.sf [aria-invalid=true] input,.sf input[aria-invalid=true],.sf select[aria-invalid=true],.sf textarea[aria-invalid=true]{border-color:#d92d20}
.sf-prefix{color:#667085;font-weight:600}
.sf-options{display:grid;gap:8px}.sf-option{display:flex;align-items:flex-start;gap:8px;font-weight:400;cursor:pointer}
.sf-option input{width:18px;height:18px;margin:2px 0 0;accent-color:var(--sf-accent);flex:none}
.sf-stars{display:inline-flex;flex-direction:row-reverse;justify-content:flex-end;gap:2px}
.sf-stars input{position:absolute;opacity:0;width:1px;height:1px}
.sf-stars label{display:inline-block;flex:none;width:auto;margin:0;font-size:30px;line-height:1;color:#d0d5dd;cursor:pointer;padding:2px}
.sf-stars input:checked~label,.sf-stars label:hover,.sf-stars label:hover~label{color:#f5b301}
.sf-stars input:focus-visible+label{outline:2px solid var(--sf-accent);border-radius:6px}
.sf-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.sf-heading{margin:0;font-size:20px;line-height:1.3}.sf-text{margin:0;color:#475467}
.sf-help{color:#667085;font-size:13px}.sf-error{color:#b42318;font-size:13px;font-weight:600}
.sf-alert{margin:0;padding:10px 12px;border-radius:10px;background:#fef3f2;color:#b42318;font-weight:600}
.sf-submit{min-height:46px;padding:10px 22px;border:0;border-radius:10px;background:var(--sf-accent);color:#fff;font:inherit;font-weight:700;cursor:pointer;justify-self:start}
.sf-submit:hover{filter:brightness(1.08)}.sf-submit:focus-visible{outline:2px solid var(--sf-accent);outline-offset:3px}
.sf-progress{height:6px;border-radius:99px;background:#eaecf0;overflow:hidden;display:none}.sf-progress i{display:block;height:100%;width:0;background:var(--sf-accent);transition:width .25s ease}
.sf-js .sf-progress{display:block}.sf-slide{display:grid;gap:16px}.sf-slide[hidden]{display:none}.sf-slide+.sf-slide{padding-top:18px;border-top:1px solid #eaecf0}.sf-js .sf-slide+.sf-slide{padding-top:0;border:0}
.sf-slide-title{margin:0;font-size:19px;line-height:1.3}
.sf-nav{display:flex;align-items:center;gap:10px}.sf-nav .sf-submit{margin-left:auto}.sf-nav [hidden]{display:none}
.sf-back{min-height:46px;padding:10px 18px;border:1px solid #d0d5dd;border-radius:10px;background:#fff;color:#344054;font:inherit;font-weight:600;cursor:pointer}
.sf-count{color:#667085;font-size:13px}.sf:not(.sf-js) .sf-back,.sf:not(.sf-js) .sf-next,.sf:not(.sf-js) .sf-count{display:none}
.sf-break{flex:1 1 100%;display:flex;align-items:center;gap:10px;padding:8px 0;color:#155eef;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.sf-break::after{content:'';flex:1;border-top:2px dashed #b2ccff}.sf-break b{color:#101828;text-transform:none;letter-spacing:0;font-size:14px}
@media (prefers-reduced-motion:reduce){.sf-progress i{transition:none}}
`;

// The standalone public page of a form (also used inside an iframe when embedded).
export function formPage(form, { action, values, errors, customFields, embed = false, brand = '', notice = '', accent = '#155eef', event = '' } = {}) {
  const color = /^#[0-9a-f]{6}$/i.test(form.accent || '') ? form.accent : accent;
  const r = notice?.result;
  const cta = notice?.cta?.url ? `<a class="sf-submit sf-cta" href="${esc(notice.cta.url)}"${embed ? ' target="_top"' : ''}>${esc(notice.cta.label || 'Saiba mais')}</a>` : '';
  const body = r
    ? `<div class="sf-done sf-result" role="status"><p class="sf-kicker">Seu resultado</p><div class="sf-ring" style="--p:${r.percent}"><b>${r.percent}%</b></div>
        ${r.tier ? `<h1>${esc(r.tier)}</h1>` : ''}${notice.text ? `<p>${esc(notice.text)}</p>` : ''}
        ${r.categories?.length ? `<ul class="sf-cats">${r.categories.map(cat => `<li><span>${esc(cat.name)}</span><span class="sf-cat-bar"><i style="width:${cat.percent}%"></i></span><b>${cat.percent}%</b></li>`).join('')}</ul>` : ''}${cta}</div>`
    : notice
    ? `<div class="sf-done" role="status"><span class="sf-check" aria-hidden="true">✓</span><h1>${esc(notice.title || 'Obrigado!')}</h1>${notice.text ? `<p>${esc(notice.text)}</p>` : ''}${cta}</div>`
    : `${form.showTitle !== false && form.name ? `<header class="sf-head"><h1>${esc(form.name)}</h1>${form.description ? `<p>${esc(form.description)}</p>` : ''}</header>` : ''}${formMarkup(form, { action, values, errors, customFields })}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(form.name || 'Formulário')}${brand ? ` · ${esc(brand)}` : ''}</title><meta name="robots" content="noindex">${event ? `<meta name="graao-event" content="${esc(event)}">` : ''}
<style>${formCss}
html{background:${embed ? 'transparent' : '#f2f4f7'}}body{margin:0;padding:${embed ? '4px' : '40px 16px'}}
.sf-card{max-width:620px;margin:0 auto;${embed ? '' : 'padding:32px;border-radius:18px;background:#fff;box-shadow:0 1px 3px rgba(16,24,40,.1),0 1px 2px rgba(16,24,40,.06);'}font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#101828}
.sf,.sf-card{--sf-accent:${color}}.sf-head{margin-bottom:22px}.sf-head h1{margin:0;font-size:24px;line-height:1.25}.sf-head p{margin:6px 0 0;color:#475467}
.sf-done{display:grid;justify-items:center;gap:8px;text-align:center;padding:24px 0}.sf-check{display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:${color};color:#fff;font-size:26px}
.sf-done h1{margin:4px 0 0;font-size:22px}.sf-done p{margin:0;color:#475467;max-width:46ch}
.sf-brand{margin:18px auto 0;max-width:620px;text-align:center;color:#98a2b3;font-size:12px}
.sf-kicker{margin:0;color:#667085;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
.sf-ring{display:grid;place-items:center;width:128px;height:128px;border-radius:50%;background:conic-gradient(${color} calc(var(--p)*1%),#eaecf0 0)}
.sf-ring b{display:grid;place-items:center;width:100px;height:100px;border-radius:50%;background:#fff;font-size:28px}
.sf-cats{display:grid;gap:8px;width:100%;max-width:380px;margin:8px 0 0;padding:0;list-style:none;text-align:left;font-size:14px}
.sf-cats li{display:grid;grid-template-columns:minmax(0,1fr) 120px 44px;align-items:center;gap:10px}.sf-cat-bar{height:8px;border-radius:99px;background:#eaecf0;overflow:hidden}.sf-cat-bar i{display:block;height:100%;background:${color};border-radius:99px}
.sf-cats b{text-align:right}.sf-cta{display:inline-flex;align-items:center;justify-content:center;margin-top:8px;text-decoration:none;justify-self:center}
</style></head><body><main class="sf-card">${body}</main>${embed || !brand ? '' : `<p class="sf-brand">${esc(brand)}</p>`}
${!notice && form.kind && form.kind !== 'form' && slidesOf(form).length > 1 ? `<script>${stepsScript}</script>` : ''}
${embed ? `<script>(()=>{const send=()=>parent.postMessage({graaoForm:${JSON.stringify(String(form.id || ''))},height:document.documentElement.scrollHeight},'*');addEventListener('load',send);new ResizeObserver(send).observe(document.body)})()</script>` : ''}</body></html>`;
}

/* ───────── Modelos ───────── */

const field = (type, extra) => newField(type, extra);
export const formTemplates = [
  { id: 'contato', name: 'Contato', description: 'Nome, e-mail, telefone e mensagem.', build: () => [field('name', { required: true }), field('email', { width: 50 }), field('phone', { width: 50 }), field('textarea', { label: 'Mensagem', key: 'mensagem', required: true })] },
  { id: 'orcamento', name: 'Pedido de orçamento', description: 'Qualifica o lead com serviço, prazo e verba.', build: () => [field('name', { required: true, width: 50 }), field('organization', { width: 50 }), field('email', { width: 50 }), field('phone', { width: 50, required: true }),
    field('select', { label: 'Qual serviço você procura?', key: 'servico', required: true, options: ['Site', 'Identidade visual', 'Tráfego pago', 'Outro'] }), field('monetary', { label: 'Verba estimada', key: 'verba', width: 50 }), field('date', { label: 'Para quando?', key: 'prazo', width: 50 }), field('textarea', { label: 'Conte sobre o projeto', key: 'projeto' }), field('source', { value: 'Orçamento' })] },
  { id: 'consultoria', name: 'Agendar consultoria', description: 'Data, período preferido e consentimento.', build: () => [field('heading', { label: 'Agende uma conversa', text: 'Escolha o melhor dia e retornamos para confirmar o horário.' }), field('first_name', { required: true, width: 50 }), field('last_name', { width: 50 }), field('email'), field('phone'),
    field('date', { label: 'Melhor data', key: 'melhor_data', required: true, width: 50 }), field('radio', { label: 'Período', key: 'periodo', required: true, width: 50, options: ['Manhã', 'Tarde', 'Noite'] }), field('terms')] },
  { id: 'satisfacao', name: 'Pesquisa de satisfação', description: 'Nota de 1 a 5, recomendação e comentário.', build: () => [field('name', { required: true }), field('email'), field('rating', { label: 'Como você avalia nosso atendimento?', key: 'nota', required: true }),
    field('radio', { label: 'Você nos recomendaria?', key: 'recomendaria', options: ['Sim', 'Talvez', 'Não'] }), field('checkbox', { label: 'O que mais gostou?', key: 'destaques', options: ['Atendimento', 'Prazo', 'Qualidade', 'Preço'] }), field('textarea', { label: 'Comentários', key: 'comentarios' })] },
  { id: 'newsletter', name: 'Newsletter', description: 'Nome, e-mail e consentimento.', build: () => [field('first_name', { required: true }), field('email'), field('terms', { text: 'Quero receber novidades por e-mail. Posso cancelar quando quiser.' })] }
];

const steps = (...groups) => groups.flat();
export const surveyTemplates = [
  { id: 'nps', name: 'Satisfação com desvio', description: 'Quem recomenda vai direto aos dados; quem não recomenda conta o que melhorar.', build: () => {
    const improve = field('break', { label: 'O que podemos melhorar?' }), contact = field('break', { label: 'Seus dados' });
    return steps(field('radio', { label: 'Você recomendaria a gente para um amigo?', key: 'recomendaria', required: true, options: ['Sim, com certeza', 'Talvez', 'Não'], logic: [{ option: 'Sim, com certeza', to: contact.id }] }),
      improve, field('textarea', { label: 'Conte o que faltou para ser uma ótima experiência', key: 'melhorias', required: true }),
      contact, field('name', { required: true }), field('email'));
  } },
  { id: 'onboarding', name: 'Onboarding de cliente', description: 'Três etapas: você, a empresa e os objetivos.', build: () => steps(
    field('break', { label: 'Sobre você' }), field('name', { required: true }), field('email', { width: 50 }), field('phone', { width: 50 }),
    field('break', { label: 'Sobre a empresa' }), field('organization', { required: true }), field('select', { label: 'Segmento', key: 'segmento', options: ['Serviços', 'Varejo', 'Saúde', 'Educação', 'Outro'] }), field('radio', { label: 'Tamanho da equipe', key: 'equipe', options: ['Só eu', '2 a 10', '11 a 50', 'Mais de 50'] }),
    field('break', { label: 'Objetivos' }), field('checkbox', { label: 'O que você quer alcançar?', key: 'objetivos', options: ['Mais clientes', 'Vender online', 'Fortalecer a marca', 'Organizar o atendimento'] }), field('textarea', { label: 'Algo mais que devemos saber?', key: 'observacoes' })) }
];
export const quizTemplates = [
  { id: 'marketing', name: 'Diagnóstico de marketing', description: 'Pontua conteúdo, anúncios e atendimento e mostra o resultado na hora.', build: () => steps(
    field('radio', { label: 'Com que frequência você publica nas redes?', key: 'frequencia', required: true, category: 'Conteúdo', options: ['Quase nunca', 'Uma vez por semana', 'Três vezes ou mais por semana'], scores: { 'Quase nunca': 0, 'Uma vez por semana': 5, 'Três vezes ou mais por semana': 10 } }),
    field('radio', { label: 'Você investe em anúncios pagos?', key: 'anuncios', required: true, category: 'Anúncios', options: ['Não', 'Às vezes', 'Todo mês, com metas'], scores: { 'Não': 0, 'Às vezes': 4, 'Todo mês, com metas': 10 } }),
    field('break', { label: 'Atendimento' }),
    field('checkbox', { label: 'O que você já usa?', key: 'ferramentas', category: 'Atendimento', options: ['WhatsApp Business', 'CRM', 'Respostas automáticas', 'Agendamento online'], scores: { 'WhatsApp Business': 2, CRM: 3, 'Respostas automáticas': 3, 'Agendamento online': 2 } }),
    field('break', { label: 'Para onde mandamos o resultado?' }), field('first_name', { required: true }), field('email')) },
  { id: 'perfil', name: 'Qualificação de lead', description: 'Orçamento, prazo e decisão viram uma nota de prioridade.', build: () => steps(
    field('radio', { label: 'Qual é o orçamento para o projeto?', key: 'orcamento', required: true, options: ['Até R$ 2 mil', 'De R$ 2 mil a R$ 10 mil', 'Acima de R$ 10 mil'], scores: { 'Até R$ 2 mil': 2, 'De R$ 2 mil a R$ 10 mil': 6, 'Acima de R$ 10 mil': 10 } }),
    field('radio', { label: 'Para quando você precisa?', key: 'prazo', required: true, options: ['Sem pressa', 'Nos próximos 3 meses', 'Este mês'], scores: { 'Sem pressa': 1, 'Nos próximos 3 meses': 5, 'Este mês': 10 } }),
    field('radio', { label: 'Você decide a contratação?', key: 'decisor', required: true, options: ['Sim', 'Divido a decisão', 'Não'], scores: { Sim: 10, 'Divido a decisão': 5, 'Não': 0 } }),
    field('break', { label: 'Seus dados' }), field('name', { required: true }), field('email'), field('phone')) }
];
export const templatesFor = kind => kind === 'survey' ? surveyTemplates : kind === 'quiz' ? quizTemplates : formTemplates;
