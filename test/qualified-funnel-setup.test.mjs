// Funil de reuniões qualificadas: blocos do editor, campo de destino, lembretes da reunião e o setup oficial.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { sanitizeHtml } from '../studio-site.mjs';
import { destinationField, readDestination } from '../ui/destination-field.js';
import { blockHtml, cleanVideo } from '../ui/studio-blocks.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const hours = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(w => [w, ['09:00', '18:00']]));

async function start(t) {
  const { server, host } = makeServer({ store: createSqliteStore(':memory:'), auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => (await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  const post = (path, body) => fetch(base + path, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base }, body: new URLSearchParams(body) });
  return { call, post, get: path => fetch(base + path, { redirect: 'manual' }) };
}

test('The editor offers video, form and calendar blocks, and checks the video address', () => {
  for (const [id, kind] of [['video', 'video'], ['graao-form', 'form'], ['booking', 'booking']]) {
    const html = blockHtml(id);
    assert.match(html, new RegExp(`^<div data-graao-embed="${kind}"`), id);
    assert.equal(sanitizeHtml(html).includes(html), true, `${id} survives the sanitizer`);
  }
  assert.equal(cleanVideo(' https://youtu.be/UV19exMToaY '), 'https://youtu.be/UV19exMToaY');
  for (const bad of ['', 'youtu.be/x', 'javascript:alert(1)', 'https://exemplo.com/pagina', 'https://youtube.com.evil.com/watch?v=UV19exMToaY']) assert.equal(cleanVideo(bad), '', bad);
});

test('The destination field lists pages and services and reads back what was chosen', () => {
  const s = blank();
  const service = save(s, 'services', { name: 'Reunião', duration: 60 });
  s.studioProjects.push({ id: 'p1', name: 'Funil <1>', kind: 'funnel', pages: [{ id: 'a', name: 'Início', slug: 'index' }, { id: 'b', name: 'Agenda', slug: 'agenda' }] });
  const html = destinationField({ s }, { action: 'page', siteId: 'p1', page: 'agenda' }, { attrs: key => `name="after.${key}"`, actions: ['message', 'redirect', 'page', 'booking'] });
  assert.match(html, /<option value="p1\|agenda" selected>/);
  assert.match(html, /Funil &lt;1&gt;/);
  assert.match(html, new RegExp(`<option value="${service}"`));
  const form = { 'after.action': 'page', 'after.target': 'p1|agenda', 'after.url': '', 'after.message': 'oi', 'after.serviceId': '' };
  assert.deepEqual(readDestination(key => form[`after.${key}`]), { action: 'page', message: 'oi', url: '', siteId: 'p1', page: 'agenda', serviceId: '' });
  assert.match(destinationField({ s }, { action: 'page', siteId: 'sumiu', page: 'x' }, { attrs: () => '' }), /Página excluída/);
});

test('A workflow started by a booking counts its waits from the appointment', () => {
  const s = blank();
  s.profile.timezone = 'America/Sao_Paulo';
  const service = save(s, 'services', { name: 'Reunião', duration: 60 });
  const contactId = save(s, 'contacts', { name: 'Ana', email: 'ana@exemplo.com' });
  const flow = save(s, 'workflows', { name: 'Lembrete', active: true, triggers: [{ type: 'service_booked', config: { serviceId: service } }],
    steps: [{ type: 'wait', config: { mode: 'event_date', offset: 24, offsetUnit: 'hours', direction: 'before' } }, { type: 'add_note', config: { body: '{{vars.evento_dia}} às {{vars.evento_hora}}' } }] });
  const when = '2031-05-14T17:00:00.000Z';
  save(s, 'appointments', { title: 'Reunião', contactId, start: when, end: '2031-05-14T18:00:00.000Z', serviceId: service });
  const run = s.runs.find(row => row.workflowId === flow);
  assert.equal(run.eventDate, when);
  assert.equal(run.wakeAt, '2031-05-13T17:00:00.000Z');
  assert.deepEqual([run.vars.evento_dia, run.vars.evento_hora], ['quarta-feira, 14/05', '14:00']);
});

test('Loading a setup again does not overwrite a site the account already edited', async t => {
  const { call } = await start(t);
  await call('/api/studio?workspace=demo', { mode: 'blank', kind: 'funnel', name: 'Funil' });
  const snap = (await call('/api/agency/snapshot-create', { workspace: 'demo', name: 'Base', include: ['studioProjects'] })).agency.snapshots[0];
  const account = (await call('/api/agency/accounts', { name: 'Cliente', email: 'c@exemplo.com', snapshotId: snap.id })).result;
  const copy = (await call(`/api/state?workspace=${account}`)).state.studioProjects[0].id;
  const { doc } = await call(`/api/studio/doc?workspace=${account}&id=${copy}`);
  await call(`/api/studio/save?workspace=${account}`, { id: copy, pageId: doc.pages[0].id, html: '<!doctype html><html><body><h1>Editado pelo cliente</h1></body></html>' });
  await call('/api/agency/snapshot-load', { id: snap.id, workspaces: [account], mode: 'skip' });
  assert.match((await call(`/api/studio/doc?workspace=${account}&id=${copy}`)).doc.pages[0].html, /Editado pelo cliente/);
});

const TEMPLATE = 'template-funil-reunioes-qualificadas';
test('The funnel template can be saved to the library and loaded, pages included, into an account that already exists', async t => {
  const { call } = await start(t);
  const saved = await call('/api/agency/marketplace-install', { id: TEMPLATE });
  assert.equal(saved.agency.snapshots.length, 1);
  await call('/api/agency/snapshot-load', { id: saved.result.snapshotId, workspaces: ['demo'], mode: 'skip' });
  const project = (await call('/api/state?workspace=demo')).state.studioProjects.find(row => row.name === 'Funil de Reuniões Qualificadas');
  const { doc } = await call(`/api/studio/doc?workspace=demo&id=${project.id}`);
  assert.deepEqual(doc.pages.map(page => page.slug), ['index', 'agenda', 'confirmacao', 'proximo-passo']);
});

test('The funnel template creates an account with a working funnel: every link points inside it', async t => {
  const { call, get, post } = await start(t);
  assert.ok(!(await call('/api/agency')).marketplace.some(row => row.title === 'Funil de Reuniões Qualificadas'), 'only in the template gallery');
  const account = (await call('/api/agency/accounts', { name: 'Cliente', email: 'c@exemplo.com', templateId: TEMPLATE })).result;
  assert.equal((await call('/api/agency')).agency.snapshots.length, 0, 'it does not take a slot of the library');
  const { state } = await call(`/api/state?workspace=${account}`);
  const project = state.studioProjects[0], form = state.forms.find(row => row.routes?.length), service = state.services[0];
  assert.equal(project.formId, form.id);
  assert.equal(form.onSubmit.siteId, project.id);
  assert.ok(form.routes.every(rule => rule.dest.action === 'default' || rule.dest.siteId === project.id));
  assert.deepEqual([service.leadMinutes, service.horizonDays, service.after.siteId, service.after.page], [1080, 4, project.id, 'confirmacao']);
  const { doc } = await call(`/api/studio/doc?workspace=${account}&id=${project.id}`);
  assert.deepEqual(doc.pages.map(page => page.slug), ['index', 'agenda', 'confirmacao', 'proximo-passo']);
  const all = doc.pages.map(page => page.html).join('');
  assert.ok(all.includes(`data-id="${form.id}"`) && all.includes(`data-id="${service.id}"`));
  for (const [, id] of all.matchAll(/data-id="([^"]*)"/g)) assert.ok([...state.forms, ...state.services].some(row => row.id === id), id);
  assert.doesNotMatch(all, /\[\[|\p{Extended_Pictographic}/u, 'no markers and no emojis');
  // Workflows load off, are valid, and point at this account's records.
  const ids = new Set(['stages', 'forms', 'services', 'workflows'].flatMap(key => state[key].map(row => row.id)));
  assert.ok(state.workflows.length >= 4 && state.workflows.every(row => row.active === false));
  for (const row of state.workflows) {
    for (const [, id] of JSON.stringify(row).matchAll(/"(?:formId|stageId|serviceId|workflowId)":"([^"]+)"/g)) assert.ok(ids.has(id), `${row.name}: ${id}`);
    const again = await call(`/api/action?workspace=${account}`, { type: 'save', key: 'workflows', id: row.id, data: row });
    assert.equal(again.error, undefined, row.name);
  }
  // The form and the service are valid as saved by the screens, too.
  for (const [key, row] of [['forms', form], ['services', service]]) assert.equal((await call(`/api/action?workspace=${account}`, { type: 'save', key, id: row.id, data: row })).error, undefined, key);
  // The whole path, as a visitor.
  await call(`/api/action?workspace=${account}`, { type: 'scheduling-settings', data: { enabled: true, hours } });
  await call(`/api/studio/publish?workspace=${account}`, { id: project.id, publish: true });
  const keyOf = id => form.fields.find(field => field.id === id).key;
  const invest = keyOf(form.routes.find(rule => rule.disqualify).fieldId);
  const base = Object.fromEntries(form.fields.filter(field => field.key).map(field => [field.key, field.options?.[0] || (field.type === 'email' ? 'ana@exemplo.com' : field.type === 'phone' ? '11 99999-0000' : 'Texto')]));
  const yes = await post(`/form/${account}/${form.id}`, { ...base, [invest]: 'Sim' });
  assert.match(yes.headers.get('location') || '', new RegExp(`^/s/${account}/${project.id}/agenda\\?link=[0-9a-f]{32}`));
  const agenda = await (await get(yes.headers.get('location'))).text();
  assert.match(agenda, new RegExp(`servico=${service.id}&amp;link=[0-9a-f]{32}`));
  const no = await post(`/form/${account}/${form.id}`, { ...base, email: 'bia@exemplo.com', [invest]: 'Não' });
  assert.equal(no.headers.get('location'), `/s/${account}/${project.id}/proximo-passo`);
});
