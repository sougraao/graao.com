import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { blank, execute } from '../model.mjs';
import { trackerScript, trackingDefaults } from '../tracking.mjs';
import { triggerSpec } from '../ui/workflow-data.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const flow = (s, name, trigger, steps = [{ type: 'add_tag', config: { tag: name } }]) => save(s, 'workflows', { name, active: true, triggers: [trigger], steps });
const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 teste').toString('base64')}`;

test('"Associação criada": a contact linked to a registered company, by the record or by the workflow, and a deal linked to a contact', () => {
  assert.deepEqual(triggerSpec('association_created').fields.map(field => field.key), ['object']);
  const s = blank();
  save(s, 'companies', { name: 'Acme Ltda' });
  const company = flow(s, 'empresa', { type: 'association_created', config: { object: 'company' } });
  const deal = flow(s, 'oportunidade', { type: 'association_created', config: { object: 'opportunity' } });
  const ana = save(s, 'contacts', { name: 'Ana', company: 'acme ltda', tags: [], custom: {} });
  assert.equal(runsOf(s, company).length, 1, 'a new contact of a registered company');
  save(s, 'contacts', { ...s.contacts.find(row => row.id === ana), notes: 'mudou só a nota' }, ana);
  save(s, 'contacts', { name: 'Bia', company: 'Empresa que não está no cadastro', tags: [], custom: {} });
  assert.equal(runsOf(s, company).length, 1, 'same company or an unregistered name does not fire');

  const viaFlow = flow(s, 'via-fluxo', { type: 'contact_tag', config: { change: 'added', tag: 'b2b' } }, [{ type: 'company_create', config: { name: 'Nova Empresa SA' } }]);
  const caio = save(s, 'contacts', { name: 'Caio', tags: [], custom: {} });
  save(s, 'contacts', { ...s.contacts.find(row => row.id === caio), tags: ['b2b'] }, caio);
  assert.equal(runsOf(s, viaFlow)[0].status, 'Completed');
  assert.equal(runsOf(s, company).at(-1).contactId, caio);
  assert.equal(runsOf(s, company).length, 2);

  const stage = s.stages[0].id;
  save(s, 'opportunities', { title: 'Projeto', value: 1000, stage, contactId: ana });
  assert.equal(runsOf(s, deal).length, 1);
  assert.equal(runsOf(s, deal)[0].contactId, ana);
});

test('"Vídeo assistido": the tracking script reports HTML5 video marks and a known visitor fires the chosen mark once', () => {
  const script = trackerScript('demo', 'https://app.graao.test', trackingDefaults());
  assert.match(script, /timeupdate/);
  assert.doesNotThrow(() => new Function(script));
  assert.match(trackerScript('demo', 'https://app.graao.test', { ...trackingDefaults(), videos: false }), /"videos":false/);
  const s = blank();
  const half = flow(s, 'metade', { type: 'video_watched', config: { percent: '50', video: 'aula' } });
  const started = flow(s, 'comecou', { type: 'video_watched', config: {} });
  const contactId = save(s, 'contacts', { name: 'Davi', email: 'davi@x.test', tags: [], custom: {} });
  s.tracking = { ...trackingDefaults(), visitors: { visitante01: contactId } };
  const event = (mark, extra = {}) => execute(s, { type: 'tracking-event', data: { vid: 'visitante01', type: 'video', event: mark, video: 'https://cdn.x.test/aula-1.mp4', name: '', url: 'https://site.x.test/curso', ...extra } });
  for (const mark of ['25', '50', '75', '100']) event(mark);
  assert.equal(runsOf(s, half).length, 1);
  assert.equal(runsOf(s, started).length, 1);
  event('33');
  event('50', { video: 'https://cdn.x.test/outro.mp4' });
  assert.equal(runsOf(s, half).length, 1, 'odd marks and other videos are ignored');
  s.tracking.videos = false;
  event('25');
  assert.equal(runsOf(s, started).length, 1, 'video tracking can be turned off');
  execute(s, { type: 'tracking-event', data: { vid: 'anonimo99', type: 'video', event: '25', video: 'x.mp4', url: 'https://site.x.test' } });
  assert.equal(runsOf(s, started).length, 1);
});

test('"Arquivo enviado no portal do cliente": the client sends a file from the portal; it lands in Arquivos and fires the trigger', async t => {
  const s = blank();
  const docs = flow(s, 'documento', { type: 'portal_file_uploaded', config: { kind: 'doc' } });
  const photos = flow(s, 'foto', { type: 'portal_file_uploaded', config: { kind: 'photo' } });
  const fileId = execute(s, { type: 'portal-file', data: { email: 'eva@x.test', name: 'Eva', fileName: 'contrato.pdf', data: PDF } });
  const eva = s.contacts.find(row => row.email === 'eva@x.test');
  assert.deepEqual([s.files.find(row => row.id === fileId).source, s.files.find(row => row.id === fileId).contactId], ['portal', eva.id]);
  assert.ok(s.messages.some(row => row.contactId === eva.id && row.body === 'Arquivo enviado pelo portal: contrato.pdf'));
  assert.deepEqual([runsOf(s, docs).length, runsOf(s, photos).length], [1, 0]);
  assert.throws(() => execute(s, { type: 'portal-file', data: { email: 'eva@x.test', fileName: 'x.exe', data: 'data:application/x-msdownload;base64,AAAA' } }), /700 KB/);

  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) });
    return { status: r.status, cookie: r.headers.get('set-cookie'), body: await r.json() };
  };
  await call('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Recebi arquivo', active: true, triggers: [{ type: 'portal_file_uploaded', config: {} }], steps: [{ type: 'add_tag', config: { tag: 'mandou-arquivo' } }] } });
  const api = '/api/client-portal/demo';
  const { body: invite } = await call(`${api}/admin`, { action: 'invite', email: 'fabio@example.test' });
  const as = { Cookie: (await call(`${api}/exchange`, { token: invite.accessPath.split('#access=')[1] })).cookie.split(';')[0] };
  assert.equal((await call(`${api}/files`, { name: 'nota.pdf', data: PDF })).status, 401, 'only a signed-in client sends files');
  const sent = await call(`${api}/files`, { name: 'nota.pdf', data: PDF }, as);
  assert.equal(sent.status, 201);
  assert.deepEqual(sent.body.files.map(row => row.name), ['nota.pdf']);
  assert.equal((await call(`${api}/files`, { name: 'grande.pdf', data: `data:application/pdf;base64,${'A'.repeat(1_000_100)}` }, as)).status, 400, 'over 700 KB is refused');
  const home = await call(`${api}/home`, undefined, as);
  assert.deepEqual(home.body.files.map(row => row.name), ['nota.pdf']);
  const state = (await call('/api/state?workspace=demo')).body.state;
  const fabio = state.contacts.find(row => row.email === 'fabio@example.test');
  assert.ok(fabio.tags.includes('mandou-arquivo'));
});
