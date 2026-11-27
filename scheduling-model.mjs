// Agenda de serviços, locação de recursos e serviço em campo (6b.6).
// Services (duration, price, buffer, team, resources) are booked at a public page; resources have a quantity
// (rooms, equipment, vehicles, rental items) and appointments only conflict per professional and per resource.
// Field jobs carry the customer's address and a status the technician moves along (a caminho, no local, concluído).
import { randomBytes } from 'node:crypto';
import { heightHash, heightScript, validDestination } from './destinations.mjs';

export const schedulingCollections = ['services', 'resources'];
export const serviceKinds = [['appointment', 'Atendimento no local'], ['field', 'Serviço em campo'], ['rental', 'Locação']];
export const resourceKinds = [['room', 'Sala'], ['equipment', 'Equipamento'], ['vehicle', 'Veículo'], ['rental', 'Item para locação']];
export const fieldStatuses = [['scheduled', 'Agendado'], ['en_route', 'A caminho'], ['on_site', 'No local'], ['done', 'Concluído']];
const weekdays = [0, 1, 2, 3, 4, 5, 6];
const MIN = 60000, DAY = 86400000;

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const int = (value, min, max, label) => {
  const n = Number(value ?? 0);
  if (!Number.isInteger(n) || n < min || n > max) fail(`${label}: use um número inteiro de ${min} a ${max}.`);
  return n;
};
const money = value => { const n = Math.round(Number(value || 0) * 100) / 100; if (!Number.isFinite(n) || n < 0 || n > 1e7) fail('Preço inválido.'); return n; };
const time = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? value : '';
const minutesOf = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));
const ms = iso => Date.parse(iso);

export const schedulingDefaults = () => ({ enabled: false, title: 'Agende um horário', intro: 'Escolha o serviço, o dia e o horário.',
  hours: { 0: [], 1: ['09:00', '18:00'], 2: ['09:00', '18:00'], 3: ['09:00', '18:00'], 4: ['09:00', '18:00'], 5: ['09:00', '18:00'], 6: ['09:00', '13:00'] },
  step: 30, leadMinutes: 120, horizonDays: 30, staff: [] });
export const schedulingOf = s => { s.scheduling = { ...schedulingDefaults(), ...(s.scheduling || {}) }; return s.scheduling; };
// A service may have its own minimum notice and booking window; empty follows the account.
const leadOf = (conf, service) => service?.leadMinutes ?? conf.leadMinutes;
const horizonOf = (conf, service) => service?.horizonDays ?? conf.horizonDays;
export const zoneOf = s => s.profile?.timezone || 'America/Sao_Paulo';
const webOrigin = value => { try { const u = new URL(String(value || '')); return ['http:', 'https:'].includes(u.protocol) ? u.origin : ''; } catch { return ''; } };

// ---- One-time booking links (workflow action "Gerar link de agendamento de uso único") ----
/** A valid link: known, not used and not expired. */
export function bookingLinkOf(s, token, at = Date.now()) {
  if (!/^[0-9a-f]{32}$/.test(String(token || ''))) return null;
  const row = (s.bookingLinks || []).find(item => item.token === token);
  return row && !row.usedAt && Date.parse(row.expires) > at && s.contacts.some(c => c.id === row.contactId) ? row : null;
}
/** A personal link to the public page for one contact (and optionally one service), valid for some days and one booking. */
export function createBookingLink(s, workspace, contact, { serviceId = '', days = 7, person = null, submissionId = '' } = {}, at = Date.now()) {
  const conf = schedulingOf(s);
  if (!conf.enabled) return { error: 'agendamento online desligado (Calendários → Página de agendamento)' };
  if (serviceId && !(s.services || []).some(x => x.id === serviceId && x.active)) return { error: 'serviço não encontrado ou inativo' };
  const valid = Math.min(Math.max(1, Math.trunc(Number(days)) || 7), 90);
  const token = randomBytes(16).toString('hex'), expires = new Date(at + valid * DAY).toISOString();
  (s.bookingLinks ||= []).push({ token, contactId: contact.id, serviceId, created: new Date(at).toISOString(), expires, usedAt: '', appointmentId: '', ...(person && { person }), ...(submissionId && { submissionId }) });
  s.bookingLinks = s.bookingLinks.filter(row => !row.usedAt && Date.parse(row.expires) > at - 30 * DAY || row.usedAt && Date.parse(row.usedAt) > at - 30 * DAY).slice(-5000);
  const path = `/agendar/${workspace}?${new URLSearchParams({ link: token, ...(serviceId ? { servico: serviceId } : {}) })}`;
  const base = conf.origin || webOrigin(s.reputation?.origin);
  return { token, path, url: base ? `${base}${path}` : path, expires };
}

/** "Nota no agendamento": writes on the contact's next appointment (or the latest one). */
export function noteOnAppointment(s, contact, { which = 'next', body = '', mode = 'append' } = {}, at = Date.now()) {
  const mine = s.appointments.filter(a => a.contactId === contact.id && a.status !== 'Canceled');
  const row = which === 'last' ? [...mine].sort((a, b) => String(b.created || b.start).localeCompare(String(a.created || a.start)))[0]
    : mine.filter(a => ms(a.end) >= at).sort((a, b) => ms(a.start) - ms(b.start))[0];
  if (!row) return null;
  const note = String(body || '').trim();
  row.notes = (mode === 'replace' ? note : [row.notes, note].filter(Boolean).join('\n')).slice(0, 3000);
  row.updated = new Date(at).toISOString();
  return row;
}

/** "Agendar horário": the first free time of a service from some days ahead, for the workflow's contact. */
// `start` (an ISO instant offered by upcomingSlots) books that exact free time; without it, the first free time from `afterDays`.
export function bookForContact(s, contact, { serviceId = '', afterDays = 0, address = '', start = '' } = {}, { save, at = Date.now() }) {
  const conf = schedulingOf(s);
  const service = (s.services || []).find(x => x.id === serviceId && x.active);
  if (!service) return { error: 'serviço não encontrado ou inativo' };
  if (service.kind === 'rental') return { error: 'locações pedem quantidade e período: use a página de agendamento' };
  const where = str(address, 300);
  if (service.kind === 'field' && !where) return { error: 'serviço em campo precisa de endereço' };
  const zone = zoneOf(s), first = addDays(dayIn(at, zone), Math.min(Math.max(0, Math.trunc(Number(afterDays)) || 0), 365));
  const wanted = start ? Date.parse(start) : NaN;
  if (start && !Number.isFinite(wanted)) return { error: 'horário inválido' };
  for (let i = 0; i <= Math.min(horizonOf(conf, service), 120); i++) {
    const slots = availableSlots(s, service.id, start ? dayIn(wanted, zone) : addDays(first, i), { at });
    const slot = start ? slots.find(row => Date.parse(row.start) === wanted) : slots[0];
    if (start && !slot) return { error: 'o horário escolhido não está mais livre' };
    if (!slot) continue;
    const id = save('appointments', { title: `${service.name} · ${contact.name || 'Cliente'}`, contactId: contact.id, start: slot.start, end: slot.end, status: 'Confirmed',
      serviceId: service.id, staffId: slot.staffId, resourceIds: service.resourceIds, quantity: 1, address: where, notes: '', source: 'workflow' });
    return { id, start: slot.start, end: slot.end, service: service.name, staff: conf.staff.find(p => p.id === slot.staffId)?.name || '' };
  }
  return { error: 'nenhum horário livre na agenda aberta' };
}

// ---- Time zone helpers (wall time in the workspace zone ⇄ instants) ----
function offsetAt(at, zone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(new Date(at)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(at / MIN) * MIN;
}
/** The instant of a wall-clock time (YYYY-MM-DD, HH:MM) in a zone. */
export function zonedInstant(day, hhmm, zone) {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)));
  let at = guess - offsetAt(guess, zone);
  const again = guess - offsetAt(at, zone);
  if (again !== at) at = again;
  return at;
}
export const dayIn = (at, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
export const clockIn = (at, zone) => new Intl.DateTimeFormat('pt-BR', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(at));
const weekdayOf = day => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const addDays = (day, n) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

// ---- Records ----
const ids = (s, key, list, label) => {
  const rows = [...new Set((Array.isArray(list) ? list : list ? [list] : []).map(String).filter(Boolean))];
  for (const id of rows) if (!(s[key] || []).some(r => r.id === id)) fail(`${label} não encontrado.`, 404);
  return rows;
};

const blankOr = (value, read) => value === undefined || value === null || value === '' ? null : read(value);

export const schedulingFields = {
  services: (s, d) => {
    const kind = serviceKinds.some(([k]) => k === d.kind) ? d.kind : 'appointment';
    const staffIds = [...new Set((Array.isArray(d.staffIds) ? d.staffIds : d.staffIds ? [d.staffIds] : []).map(String))];
    for (const id of staffIds) if (!schedulingOf(s).staff.some(p => p.id === id)) fail('Profissional não encontrado.', 404);
    const resourceIds = ids(s, 'resources', d.resourceIds, 'Recurso');
    if (kind === 'rental' && resourceIds.length !== 1) fail('Uma locação usa exatamente um recurso.');
    const rentalUnit = kind === 'rental' ? (d.rentalUnit === 'day' ? 'day' : 'hour') : '';
    return {
      name: str(d.name, 80) || fail('Dê um nome ao serviço.'), description: str(d.description, 500), kind,
      duration: kind === 'rental' ? (rentalUnit === 'day' ? 1440 : 60) : int(d.duration ?? 60, 5, 720, 'Duração (minutos)'),
      buffer: int(d.buffer ?? 0, 0, 240, 'Intervalo depois (minutos)'), price: money(d.price), staffIds, resourceIds, rentalUnit,
      maxUnits: kind === 'rental' ? int(d.maxUnits ?? (rentalUnit === 'day' ? 7 : 8), 1, 90, 'Duração máxima da locação') : 1,
      leadMinutes: blankOr(d.leadMinutes, v => int(v, 0, 20160, 'Antecedência mínima (minutos)')), horizonDays: blankOr(d.horizonDays, v => int(v, 1, 365, 'Agenda aberta por (dias)')),
      after: validDestination(s, d.after?.action === 'booking' || d.after?.action === 'default' ? { action: 'message' } : d.after, 'Depois de agendar'),
      active: d.active !== false && d.active !== 'false', color: /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color : '#b71889'
    };
  },
  resources: (s, d) => ({
    name: str(d.name, 80) || fail('Dê um nome ao recurso.'), kind: resourceKinds.some(([k]) => k === d.kind) ? d.kind : 'room',
    quantity: int(d.quantity ?? 1, 1, 999, 'Quantidade'), notes: str(d.notes, 300), active: d.active !== false && d.active !== 'false'
  })
};

// ---- Conflicts ----
const live = a => a.status !== 'Canceled';
const blockEnd = a => ms(a.blockedUntil || a.end);
const overlaps = (a, start, end) => ms(a.start) < end && blockEnd(a) > start;

export function staffFree(s, staffId, start, end, except = '') {
  return !s.appointments.some(a => a.id !== except && live(a) && a.staffId === staffId && overlaps(a, start, end));
}
export function resourceUsed(s, resourceId, start, end, except = '') {
  return s.appointments.filter(a => a.id !== except && live(a) && (a.resourceIds || []).includes(resourceId) && overlaps(a, start, end))
    .reduce((n, a) => n + (a.quantity || 1), 0);
}

/** Normalizes an appointment (manual, booked online or a field job) and checks it against the team and the resources. */
export function appointmentRecord(s, d, { date, contactId, req }) {
  const prior = d.id ? s.appointments.find(a => a.id === d.id) : null;
  const keep = (key, fallback) => d[key] === undefined ? (prior?.[key] ?? fallback) : d[key];
  const start = date(d.start), end = date(d.end);
  if (ms(end) <= ms(start)) fail('End time must be after start time.');
  const serviceId = String(keep('serviceId', '') || '');
  const service = serviceId ? (s.services || []).find(x => x.id === serviceId) || fail('Serviço não encontrado.', 404) : null;
  const staffId = String(keep('staffId', '') || '');
  if (staffId && !schedulingOf(s).staff.some(p => p.id === staffId)) fail('Profissional não encontrado.', 404);
  const resourceIds = ids(s, 'resources', keep('resourceIds', service?.resourceIds || []), 'Recurso');
  const quantity = int(keep('quantity', 1), 1, 999, 'Quantidade');
  const address = str(keep('address', ''), 300);
  if (service?.kind === 'field' && !address) fail('Informe o endereço do atendimento.');
  const status = ['Confirmed', 'Completed', 'Canceled'].includes(d.status || 'Confirmed') ? d.status || 'Confirmed' : fail('Invalid status.');
  const field = service?.kind === 'field' || Boolean(address && keep('fieldStatus', ''));
  const fieldStatus = field ? (fieldStatuses.some(([k]) => k === keep('fieldStatus', '')) ? keep('fieldStatus', '') : 'scheduled') : '';
  const blockedUntil = new Date(ms(end) + (service?.buffer || 0) * MIN).toISOString();
  const row = { title: str(d.title, 200) || service?.name || req(d.title, 'Title'), contactId: contactId(s, d.contactId, true), start, end, status, notes: str(d.notes, 3000),
    serviceId, staffId, resourceIds, quantity, address, fieldStatus, blockedUntil, source: str(keep('source', ''), 20) };
  if (status !== 'Canceled') checkConflicts(s, row, d.id || '');
  return row;
}

function checkConflicts(s, row, except) {
  const start = ms(row.start), end = ms(row.blockedUntil);
  if (row.staffId && !staffFree(s, row.staffId, start, end, except)) fail('Este profissional já tem um agendamento neste horário.');
  for (const id of row.resourceIds) {
    const resource = s.resources.find(r => r.id === id);
    if (resourceUsed(s, id, start, ms(row.end), except) + row.quantity > resource.quantity) fail(`${resource.name}: sem disponibilidade neste horário.`);
  }
  // Appointments without a professional or a resource share the single workspace calendar (the original behavior).
  if (!row.staffId && !row.resourceIds.length && s.appointments.some(a => a.id !== except && live(a) && !a.staffId && !(a.resourceIds || []).length && overlaps(a, start, ms(row.end))))
    fail('This time overlaps an existing appointment.');
}

// ---- Availability ----
const pickStaff = (s, service, start, end) => {
  if (!service.staffIds.length) return '';
  return service.staffIds.find(id => staffFree(s, id, start, end)) ?? null;
};
const resourcesFit = (s, service, start, end, quantity) => service.resourceIds.every(id => {
  const resource = s.resources.find(r => r.id === id);
  return resource && resource.active !== false && resourceUsed(s, id, start, end) + quantity <= resource.quantity;
});

/** The free start times of a service on one day (in the workspace zone). Rentals take the number of hours/days and the quantity. */
export function availableSlots(s, serviceId, day, { at = Date.now(), units = 1, quantity = 1 } = {}) {
  const service = (s.services || []).find(x => x.id === serviceId && x.active);
  if (!service || !/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return [];
  const conf = schedulingOf(s), zone = zoneOf(s), today = dayIn(at, zone);
  if (day < today || day > addDays(today, horizonOf(conf, service))) return [];
  const [open, close] = conf.hours[weekdayOf(day)] || [];
  if (!time(open) || !time(close)) return [];
  const length = service.kind === 'rental' ? Math.min(Math.max(1, units), service.maxUnits) * service.duration : service.duration;
  const slots = [];
  const last = service.kind === 'rental' && service.rentalUnit === 'day' ? minutesOf(open) : minutesOf(close) - length;
  for (let m = minutesOf(open); m <= last; m += conf.step) {
    const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const start = zonedInstant(day, hhmm, zone), end = start + length * MIN;
    if (start < at + leadOf(conf, service) * MIN) continue;
    const staffId = pickStaff(s, service, start, end + service.buffer * MIN);
    if (staffId === null || !resourcesFit(s, service, start, end, quantity)) continue;
    slots.push({ start: new Date(start).toISOString(), end: new Date(end).toISOString(), time: hhmm, staffId });
  }
  return slots;
}

/** The next free times of a service (the bot of Conversas offers these), at most `count`, from now. */
export function upcomingSlots(s, serviceId, { count = 8, at = Date.now() } = {}) {
  const service = (s.services || []).find(x => x.id === serviceId && x.active);
  if (!service || service.kind === 'rental') return [];
  const conf = schedulingOf(s), zone = zoneOf(s), today = dayIn(at, zone), found = [];
  for (let i = 0; i <= Math.min(horizonOf(conf, service), 60) && found.length < count; i++) {
    const day = addDays(today, i);
    // At most three times per day, spread over the day, so the offer covers several days.
    const slots = availableSlots(s, serviceId, day, { at });
    const picks = slots.length <= 3 ? slots : [slots[0], slots[Math.floor(slots.length / 2)], slots.at(-1)];
    for (const slot of picks) if (found.length < count) found.push({ start: slot.start, day, time: slot.time });
  }
  return found;
}

/** What the public page shows. */
export function bookingView(s, { serviceId = '', day = '', units = 1, quantity = 1, link = '', at = Date.now() } = {}) {
  const conf = schedulingOf(s);
  if (!conf.enabled) return null;
  const personal = link ? bookingLinkOf(s, link, at) : null, owner = personal && s.contacts.find(c => c.id === personal.contactId);
  if (personal?.serviceId) serviceId = personal.serviceId;
  const zone = zoneOf(s), today = dayIn(at, zone);
  const services = (s.services || []).filter(x => x.active).map(x => ({ id: x.id, name: x.name, description: x.description, kind: x.kind, duration: x.duration, price: x.price, rentalUnit: x.rentalUnit, maxUnits: x.maxUnits,
    maxQuantity: x.kind === 'rental' ? s.resources.find(r => r.id === x.resourceIds[0])?.quantity || 1 : 1 }));
  const service = services.find(x => x.id === serviceId) || null;
  const days = Array.from({ length: Math.min(horizonOf(conf, service && s.services.find(x => x.id === service.id)) + 1, 14) }, (_, i) => addDays(today, i)).filter(d => (conf.hours[weekdayOf(d)] || []).length === 2);
  const chosen = !service ? '' : days.includes(day) ? day : days.find(d => availableSlots(s, service.id, d, { at, units, quantity }).length) || days[0] || '';
  return { business: s.profile?.name || '', title: conf.title, intro: conf.intro, zone, services: personal?.serviceId ? services.filter(x => x.id === personal.serviceId) : services, service, days, day: chosen,
    link: personal ? personal.token : '', person: personal?.person ? { name: personal.person.name || '', email: personal.person.email || '', phone: personal.person.phone || '' } : owner ? { name: owner.name || '', email: owner.email || '', phone: owner.phone || '' } : null,
    linkError: link && !personal ? 'Este link de agendamento já foi usado ou expirou. Você ainda pode agendar normalmente.' : '',
    units: Math.min(Math.max(1, units), service?.maxUnits || 1), quantity: Math.min(Math.max(1, quantity), service?.maxQuantity || 1),
    slots: service && chosen ? availableSlots(s, service.id, chosen, { at, units, quantity }) : [] };
}

// ---- Commands ----
export function saveSchedulingSettings(s, d) {
  const conf = schedulingOf(s);
  if (d.enabled !== undefined) conf.enabled = Boolean(d.enabled);
  if (d.origin !== undefined) conf.origin = webOrigin(d.origin) || conf.origin || '';
  if (d.title !== undefined) conf.title = str(d.title, 100) || schedulingDefaults().title;
  if (d.intro !== undefined) conf.intro = str(d.intro, 400);
  if (d.step !== undefined) conf.step = [10, 15, 20, 30, 45, 60, 90, 120].includes(Number(d.step)) ? Number(d.step) : fail('Intervalo entre horários inválido.');
  if (d.leadMinutes !== undefined) conf.leadMinutes = int(d.leadMinutes, 0, 20160, 'Antecedência mínima (minutos)');
  if (d.horizonDays !== undefined) conf.horizonDays = int(d.horizonDays, 1, 365, 'Agenda aberta por (dias)');
  if (d.hours !== undefined) {
    conf.hours = Object.fromEntries(weekdays.map(w => {
      const [open, close] = Array.isArray(d.hours?.[w]) ? d.hours[w].map(time) : [];
      if (!open || !close) return [w, []];
      if (minutesOf(close) <= minutesOf(open)) fail('O horário de fechamento precisa ser depois da abertura.');
      return [w, [open, close]];
    }));
  }
  if (d.staff !== undefined) {
    const rows = Array.isArray(d.staff) ? d.staff : [];
    if (rows.length > 50) fail('Use até 50 profissionais.');
    conf.staff = rows.map(row => ({ id: /^[0-9a-f]{8}$/.test(row?.id || '') ? row.id : randomBytes(4).toString('hex'), name: str(row?.name, 60) || fail('Dê um nome a cada profissional.') }));
    const known = new Set(conf.staff.map(p => p.id));
    for (const service of s.services || []) service.staffIds = (service.staffIds || []).filter(id => known.has(id));
  }
  return conf;
}

/** A visitor books a service at the public page (finds or creates the contact). */
export function bookService(s, d, { save, at = Date.now() }) {
  const conf = schedulingOf(s);
  if (!conf.enabled) fail('O agendamento online está desligado.', 404);
  const personal = d.link ? bookingLinkOf(s, d.link, at) || fail('Este link de agendamento já foi usado ou expirou.', 410) : null;
  if (personal?.serviceId && personal.serviceId !== d.serviceId) fail('Este link é para outro serviço.');
  const service = (s.services || []).find(x => x.id === d.serviceId && x.active) || fail('Serviço não encontrado.', 404);
  const name = str(d.name, 120) || fail('Informe seu nome.');
  const email = str(d.email, 160).toLowerCase(), phone = str(d.phone, 40);
  if (!email && !phone) fail('Informe um e-mail ou telefone.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('E-mail inválido.');
  const address = str(d.address, 300);
  if (service.kind === 'field' && !address) fail('Informe o endereço do atendimento.');
  const units = Number(d.units) || 1, quantity = Number(d.quantity) || 1;
  const startAt = ms(d.start);
  if (!Number.isFinite(startAt)) fail('Escolha um horário.');
  const slot = availableSlots(s, service.id, dayIn(startAt, zoneOf(s)), { at, units, quantity }).find(x => ms(x.start) === startAt);
  if (!slot) fail('Este horário acabou de ser ocupado. Escolha outro.', 409);
  let contact = personal ? s.contacts.find(c => c.id === personal.contactId) : s.contacts.find(c => (email && (c.email || '').toLowerCase() === email) || (!email && phone && (c.phone || '').replace(/\D/g, '') === phone.replace(/\D/g, '')));
  const contactId = contact ? contact.id : save('contacts', { name, email, phone, tags: ['agendamento-online'] });
  contact = s.contacts.find(c => c.id === contactId);
  const unitsText = service.kind === 'rental' ? ` (${Math.min(Math.max(1, units), service.maxUnits)} ${service.rentalUnit === 'day' ? 'dia(s)' : 'hora(s)'}${quantity > 1 ? ` · ${quantity} un.` : ''})` : '';
  const id = save('appointments', { title: `${service.name}${unitsText} · ${contact.name || name}`, contactId, start: slot.start, end: slot.end, status: 'Confirmed',
    serviceId: service.id, staffId: slot.staffId, resourceIds: service.resourceIds, quantity: service.kind === 'rental' ? quantity : 1, address, notes: str(d.notes, 1000), source: personal ? 'link' : 'online' });
  if (personal) Object.assign(personal, { usedAt: new Date(at).toISOString(), appointmentId: id });
  return { id, start: slot.start, end: slot.end, service: service.name, staff: conf.staff.find(p => p.id === slot.staffId)?.name || '' };
}

export function schedulingCommand(s, command, { save, run, now }) {
  const { type, data: d = {} } = command;
  if (type === 'scheduling-settings') return saveSchedulingSettings(s, d) && 'ok';
  if (type === 'scheduling-book') return bookService(s, d, { save });
  if (type === 'field-status') {
    const row = s.appointments.find(a => a.id === d.id) || fail('Agendamento não encontrado.', 404);
    if (!row.fieldStatus) fail('Este agendamento não é um serviço em campo.');
    const status = fieldStatuses.some(([k]) => k === d.status) ? d.status : fail('Situação inválida.');
    if (row.fieldStatus === status) return row.id;
    row.fieldStatus = status; row.updated = now();
    row.fieldLog = [...(row.fieldLog || []), { status, at: now(), by: str(command.actor, 80) }].slice(-20);
    if (status === 'done' && row.status === 'Confirmed') { row.status = 'Completed'; run(s, 'appointment_status', { contactId: row.contactId, appointmentId: row.id, status: 'Completed' }); }
    run(s, 'field_status_changed', { contactId: row.contactId, appointmentId: row.id, status });
    return row.id;
  }
  fail('Comando de agenda desconhecido.');
}

/** A day's field route: the jobs in order, with a Maps link for the whole route. */
export function fieldRoute(s, day, staffId = '') {
  const zone = zoneOf(s);
  const jobs = s.appointments.filter(a => a.fieldStatus && live(a) && dayIn(ms(a.start), zone) === day && (!staffId || a.staffId === staffId)).sort((a, b) => ms(a.start) - ms(b.start));
  const stops = jobs.map(a => a.address).filter(Boolean);
  return { jobs, mapsUrl: stops.length ? `https://www.google.com/maps/dir/${stops.map(encodeURIComponent).join('/')}` : '' };
}

// ---- Public page ----
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const bookingCsp = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'";
/** Inside a page of the business (or on its own website) the calendar may be framed and tells its height. */
export const bookingEmbedCsp = `${bookingCsp.replace("frame-ancestors 'none'", 'frame-ancestors *')}; script-src ${heightHash}`;
const brl = n => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
const dayLabel = day => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
const durationText = x => x.kind === 'rental' ? `${brl(x.price)} por ${x.rentalUnit === 'day' ? 'dia' : 'hora'}` : `${x.duration} min${x.price ? ` · ${brl(x.price)}` : ''}`;

/** The public booking page (plain HTML forms, no script). */
export function bookingPage(view, { base, done = null, error = '', form = {}, embed = false }) {
  const link = params => `${base}?${new URLSearchParams(Object.entries({ ...params, link: view.link, embed: embed ? '1' : '' }).filter(([, v]) => v !== '' && v != null)).toString()}`;
  const s = view.service, personal = view.link ? `<input type="hidden" name="link" value="${esc(view.link)}">` : '';
  // Inside a page the service is already chosen and the page has its own title: the steps start at the day.
  let count = 0;
  const step = text => `<h2>${++count}. ${text}</h2>`;
  const tail = embed ? `<script>${heightScript}</script>` : '';
  form = view.person && !form.nome ? { ...form, nome: view.person.name, email: view.person.email, telefone: view.person.phone } : form;
  const head = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${done?.event ? `<meta name="graao-event" content="${esc(done.event)}">` : ''}<title>${esc(view.title)}</title>
<style>*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;background:#f6f5f8;color:#1e1821;padding:24px 16px}main{max-width:640px;margin:0 auto;background:#fff;border:1px solid #e8e1e9;border-radius:16px;padding:28px;display:grid;gap:16px}
h1{margin:0;font-size:24px}h2{margin:0;font-size:17px}p{margin:0;color:#5d5560}a{color:#a00070}.list{display:grid;gap:8px;margin:0;padding:0;list-style:none}.svc{display:block;padding:12px 14px;border:1px solid #e8e1e9;border-radius:12px;text-decoration:none;color:inherit}.svc.on{border-color:#b71889;background:#fff4fa}.svc small{display:block;color:#7a727d}
.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{padding:8px 12px;border:1px solid #e8e1e9;border-radius:999px;text-decoration:none;color:inherit;font-size:14px}.chip.on{background:#b71889;border-color:#b71889;color:#fff}
.slots{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px}.slots label{position:relative}.slots input{position:absolute;opacity:0}.slots span{display:block;text-align:center;padding:9px 0;border:1px solid #e8e1e9;border-radius:10px;cursor:pointer}.slots input:checked+span{background:#b71889;color:#fff;border-color:#b71889}.slots input:focus-visible+span{outline:2px solid #b71889;outline-offset:2px}
form{display:grid;gap:12px}label{display:grid;gap:4px;font-size:14px;font-weight:600}input,textarea,select{font:inherit;padding:10px 12px;border:1px solid #d9d0da;border-radius:10px;width:100%}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
button{font:600 15px system-ui,sans-serif;background:#b71889;color:#fff;border:0;border-radius:10px;padding:12px 18px;cursor:pointer}.ok{background:#ecf8f0;border:1px solid #3aa66a;border-radius:10px;padding:12px 14px;color:#146c2e}.err{background:#fff4f3;border:1px solid #e3655b;border-radius:10px;padding:10px 12px;color:#9c1c12}
@media (max-width:480px){main{padding:20px}.row{grid-template-columns:1fr}}${embed ? 'body{background:transparent;padding:2px}main{max-width:none;padding:0;border:0;border-radius:0;background:none}' : ''}</style></head><body><main>${embed ? '' : `<p>${esc(view.business)}</p><h1>${esc(view.title)}</h1>`}`;
  if (done) return `${head}<div class="ok" role="status"><b>Agendado!</b><br>${esc(done.service)} em ${esc(done.when)}${done.staff ? ` com ${esc(done.staff)}` : ''}. Você vai receber a confirmação pelos nossos canais.</div><p><a href="${esc(base)}${embed ? '?embed=1' : ''}">Fazer outro agendamento</a></p></main>${tail}</body></html>`;
  const services = `<ul class="list">${view.services.map(x => `<li><a class="svc${s?.id === x.id ? ' on' : ''}" href="${esc(link({ servico: x.id }))}"><b>${esc(x.name)}</b><small>${esc(durationText(x))}${x.kind === 'field' ? ' · no seu endereço' : ''}</small>${x.description ? `<small>${esc(x.description)}</small>` : ''}</a></li>`).join('')}</ul>`;
  if (!view.services.length) return `${head}<p>Nenhum serviço disponível para agendar no momento.</p></main>${tail}</body></html>`;
  let body = `${view.linkError ? `<p class="err" role="alert">${esc(view.linkError)}</p>` : ''}${embed ? '' : `${view.intro ? `<p>${esc(view.intro)}</p>` : ''}`}${embed && s ? `<p><b>${esc(s.name)}</b> · ${esc(durationText(s))}</p>` : `${step('Serviço')}${services}`}`;
  if (s) {
    const keep = { servico: s.id, unidades: view.units > 1 ? view.units : '', qtd: view.quantity > 1 ? view.quantity : '' };
    if (s.kind === 'rental') body += `<form method="get" action="${esc(base)}">${personal}<input type="hidden" name="servico" value="${esc(s.id)}"><input type="hidden" name="dia" value="${esc(view.day)}"><div class="row">
      <label>${s.rentalUnit === 'day' ? 'Dias' : 'Horas'}<select name="unidades">${Array.from({ length: s.maxUnits }, (_, i) => `<option${i + 1 === view.units ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label>
      <label>Quantidade<select name="qtd">${Array.from({ length: Math.min(s.maxQuantity, 20) }, (_, i) => `<option${i + 1 === view.quantity ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label></div><button type="submit">Ver disponibilidade</button></form>`;
    body += `${step('Dia')}${view.days.length ? `<div class="chips">${view.days.map(d => `<a class="chip${d === view.day ? ' on' : ''}" href="${esc(link({ ...keep, dia: d }))}">${esc(dayLabel(d))}</a>`).join('')}</div>` : '<p>Sem dias abertos para agendamento.</p>'}`;
    body += `${step('Horário')}${error ? `<p class="err" role="alert">${esc(error)}</p>` : ''}`;
    if (!view.slots.length) body += `<p>Nenhum horário livre neste dia. Tente outro.</p>`;
    else body += `<form method="post" action="${esc(link({ servico: s.id, dia: view.day }))}">${personal}<input type="hidden" name="servico" value="${esc(s.id)}"><input type="hidden" name="unidades" value="${view.units}"><input type="hidden" name="qtd" value="${view.quantity}">
      <fieldset style="border:0;padding:0;margin:0"><legend class="sr" style="position:absolute;left:-9999px">Horário</legend><div class="slots">${view.slots.map((x, i) => `<label><input type="radio" name="inicio" value="${esc(x.start)}" required${(form.inicio ? form.inicio === x.start : i === 0) ? ' checked' : ''}><span>${esc(x.time)}</span></label>`).join('')}</div></fieldset>
      ${step('Seus dados')}<label>Nome<input name="nome" required maxlength="120" autocomplete="name" value="${esc(form.nome || '')}"></label>
      <div class="row"><label>E-mail<input name="email" type="email" maxlength="160" autocomplete="email" value="${esc(form.email || '')}"></label><label>Telefone<input name="telefone" maxlength="40" autocomplete="tel" value="${esc(form.telefone || '')}"></label></div>
      ${s.kind === 'field' ? `<label>Endereço do atendimento<input name="endereco" required maxlength="300" autocomplete="street-address" value="${esc(form.endereco || '')}"></label>` : ''}
      <label>Observações<textarea name="notas" rows="3" maxlength="1000">${esc(form.notas || '')}</textarea></label>
      <p>Horários no fuso ${esc(view.zone)}.</p><button type="submit">Confirmar agendamento</button></form>`;
  }
  return `${head}${body}</main>${tail}</body></html>`;
}
