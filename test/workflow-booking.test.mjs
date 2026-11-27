import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const flow = (s, name, trigger, steps) => save(s, 'workflows', { name, active: true, triggers: [trigger], steps });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const everyDay = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(w => [w, ['08:00', '20:00']]));

function setup() {
  const s = blank();
  s.profile.timezone = 'America/Sao_Paulo';
  execute(s, { type: 'scheduling-settings', data: { enabled: true, step: 60, leadMinutes: 0, horizonDays: 30, staff: [{ name: 'Ana' }], hours: everyDay, origin: 'https://app.graao.test/qualquer/coisa' } });
  const ana = s.scheduling.staff[0].id;
  const service = save(s, 'services', { name: 'Avaliação', duration: 60, price: 0, staffIds: [ana] });
  return { s, service };
}

test('T.1 book appointment: the first free time of the service, from some days ahead', () => {
  const { s, service } = setup();
  const booked = flow(s, 'Agendar', { type: 'contact_tag', config: { change: 'added', tag: 'agendar' } }, [
    { id: 'agenda1', type: 'book_appointment', config: { serviceId: service, afterDays: 2 } },
    { type: 'add_note', config: { body: 'Marcado: {{steps.agenda1.service}} com {{steps.agenda1.staff}}' } }
  ]);
  const listened = flow(s, 'Agendou', { type: 'appointment_booked' }, [{ type: 'add_tag', config: { tag: 'agendado' } }]);
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: ['agendar'], custom: {} });
  const run = runsOf(s, booked)[0];
  assert.equal(run.status, 'Completed', run.results.join(' | '));
  const appointment = s.appointments.find(row => row.contactId === ana);
  assert.ok(appointment, 'the appointment was created');
  assert.equal(appointment.source, 'workflow');
  const inTwoDays = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 2 * 864e5));
  assert.ok(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(appointment.start)) >= inTwoDays, 'not before the chosen day');
  assert.equal(run.outputs.agenda1.id, appointment.id);
  assert.ok(s.messages.some(row => row.contactId === ana && row.body === 'Marcado: Avaliação com Ana'));
  assert.equal(runsOf(s, listened).length, 1, 'the booking fires "Agendamento criado"');
  assert.ok(s.contacts.find(row => row.id === ana).tags.includes('agendado'));
  // The same time is taken now: a second contact gets the next free one.
  const bia = save(s, 'contacts', { name: 'Bia', email: 'bia@x.test', tags: ['agendar'], custom: {} });
  const second = s.appointments.find(row => row.contactId === bia);
  assert.ok(second && Date.parse(second.start) >= Date.parse(appointment.end));
});

test('T.1 appointment note: writes on the next appointment of the contact', () => {
  const { s, service } = setup();
  const ana = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', tags: [], custom: {} });
  const id = flow(s, 'Nota', { type: 'contact_tag', config: { change: 'added', tag: 'nota' } }, [
    { type: 'appointment_note', config: { which: 'next', body: 'Trazer exames de {{contact.first_name}}', mode: 'append' } }
  ]);
  const later = new Date(Date.now() + 3 * 864e5), sooner = new Date(Date.now() + 864e5);
  const at = (date, hour) => { const d = new Date(date); d.setUTCHours(hour, 0, 0, 0); return d.toISOString(); };
  save(s, 'appointments', { title: 'Depois', contactId: ana, start: at(later, 14), end: at(later, 15), notes: 'Primeira vez' });
  const next = save(s, 'appointments', { title: 'Antes', contactId: ana, start: at(sooner, 14), end: at(sooner, 15), notes: 'Primeira vez' });
  save(s, 'contacts', { ...s.contacts.find(row => row.id === ana), tags: ['nota'] }, ana);
  assert.equal(s.appointments.find(row => row.id === next).notes, 'Primeira vez\nTrazer exames de Ana');
  assert.equal(s.appointments.find(row => row.title === 'Depois').notes, 'Primeira vez');
  const bia = save(s, 'contacts', { name: 'Bia', email: 'bia@x.test', tags: ['nota'], custom: {} });
  assert.ok(runsOf(s, id).find(run => run.contactId === bia).results.some(line => /sem agendamento/.test(line)));
  assert.ok(service);
});

test('T.1 one-time booking link: a personal link, used once, through the public page', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const action = async body => { const r = await fetch(`${base}/api/action?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) }); const json = await r.json(); assert.equal(r.status, 200, JSON.stringify(json)); return json.id; };
  const state = async () => (await (await fetch(`${base}/api/state?workspace=demo`)).json()).state;
  const post = (path, fields) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base }, body: new URLSearchParams(fields) });

  await action({ type: 'scheduling-settings', data: { enabled: true, step: 60, leadMinutes: 0, horizonDays: 30, staff: [{ name: 'Ana' }], hours: everyDay, origin: 'https://app.graao.test' } });
  const staff = (await state()).scheduling.staff[0].id;
  const service = await action({ type: 'save', key: 'services', data: { name: 'Avaliação', duration: 60, price: 0, staffIds: [staff] } });
  await action({ type: 'save', key: 'workflows', data: { name: 'Convite', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'convidar' } }],
    steps: [{ type: 'booking_link', config: { serviceId: service, days: 7, variable: 'link_agendamento' } }, { type: 'add_note', config: { body: 'Agende aqui: {{vars.link_agendamento}}' } }] } });
  const carla = await action({ type: 'save', key: 'contacts', data: { name: 'Carla Dias', email: 'carla@x.test', phone: '+5511977776666', tags: ['convidar'], custom: {} } });

  let s = await state();
  const note = s.messages.find(row => row.contactId === carla && row.channel === 'Note').body;
  const url = note.replace('Agende aqui: ', '');
  assert.match(url, new RegExp(`^https://app\\.graao\\.test/agendar/demo\\?link=[0-9a-f]{32}&servico=${service}$`), 'a full link with the saved address');
  const path = url.replace('https://app.graao.test', ''), token = new URL(url).searchParams.get('link');

  const page = await (await fetch(base + path)).text();
  assert.match(page, /value="Carla Dias"/, 'the page comes filled with the contact');
  assert.match(page, new RegExp(`name="link" value="${token}"`));
  const start = page.match(/name="inicio" value="([^"]+)"/)[1];
  const booked = await post(path, { link: token, servico: service, inicio: start, nome: 'Outra Pessoa', email: 'outra@x.test' });
  assert.equal(booked.status, 200);
  s = await state();
  const mine = s.appointments.filter(row => row.contactId === carla);
  assert.equal(mine.length, 1, 'the booking goes to the link contact, whatever the form says');
  assert.equal(mine[0].source, 'link');
  assert.ok(!s.contacts.some(row => row.email === 'outra@x.test'));

  const used = await fetch(base + path);
  assert.match(await used.text(), /já foi usado ou expirou/);
  const second = await post(path, { link: token, servico: service, inicio: start, nome: 'Carla Dias', email: 'carla@x.test' });
  assert.equal(second.status, 410, 'a link books only once');
  assert.match(await second.text(), /já foi usado ou expirou/);
});
