import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { blank, execute } from '../model.mjs';
import { useAdsFetch } from '../ads-providers.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const reply = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function run(config, tracking = { ga4: 'G-ABC1234', ga4SecretSet: true }) {
  const s = blank();
  s.tracking = { ...(s.tracking || {}), ...tracking };
  const id = save(s, 'workflows', { name: 'GA4', active: true, triggers: [{ type: 'contact_created' }], steps: [{ type: 'ga4_event', config }] });
  const contactId = save(s, 'contacts', { name: 'Ana', email: 'ana@x.test', phone: '+55 81 99999-0000', tags: [], custom: {} });
  return { contactId, results: s.runs.find(row => row.workflowId === id).results.join(' '), item: (s.workflowOutbox || []).find(row => row.kind === 'ga4-event') };
}

test('T.1 GA4 event: a stable client id from the contact, the value, and no personal data', () => {
  const { contactId, item } = run({ event: 'purchase', value: '89,90', currency: 'BRL' });
  assert.equal(item.measurementId, 'G-ABC1234');
  assert.match(item.clientId, /^\d+\.\d+$/);
  assert.equal(run({ event: 'purchase' }).item.clientId === item.clientId, false, 'each contact has its own client id');
  assert.equal(item.userId, contactId);
  assert.deepEqual(item.event, { name: 'purchase', params: { source: 'graao_workflow', workflow: 'GA4', engagement_time_msec: 1, value: 89.9, currency: 'BRL' } });
  assert.doesNotMatch(JSON.stringify(item), /ana@x|99999/, 'no e-mail or phone goes to Google Analytics');
  assert.equal(run({ event: 'custom', customEvent: '1 proposta enviada' }).item.event.name, 'proposta_enviada', 'GA4 names start with a letter');
  assert.match(run({ event: 'generate_lead' }, { ga4: '' }).results, /ID de medição do GA4/);
  assert.match(run({ event: 'generate_lead' }, { ga4: 'G-ABC1234', ga4SecretSet: false }).results, /segredo da API do GA4/);
});

test('T.1 GA4 through the server: the secret is write-only and sealed, and the event reaches the Measurement Protocol', async t => {
  const sent = [];
  useAdsFetch(async (url, init = {}) => { sent.push({ url: new URL(url), body: JSON.parse(init.body || '{}') }); return reply(null, 204); });
  t.after(() => useAdsFetch((...a) => fetch(...a)));
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = async (path, body) => { const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };

  await post('/api/action?workspace=demo', { type: 'tracking-settings', data: { ga4: 'G-ABC1234' } });
  assert.equal((await post('/api/tracking/ga4-secret?workspace=demo', { secret: 'bad secret!' })).status, 400);
  const saved = await post('/api/tracking/ga4-secret?workspace=demo', { secret: 'Abc_DEF-1234567890' });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.state.tracking.ga4SecretSet, true);
  assert.doesNotMatch(JSON.stringify(saved.body), /Abc_DEF-1234567890/, 'the secret never comes back');
  assert.doesNotMatch(JSON.stringify((await (await fetch(`${base}/api/state?workspace=demo`)).json())), /Abc_DEF-1234567890/);
  assert.equal((await post('/api/tracking/ga4-secret?workspace=demo', { secret: 'Abc_DEF-1234567890' })).status, 200);

  await post('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Lead no GA4', active: true, triggers: [{ type: 'contact_created' }], steps: [{ type: 'ga4_event', config: { event: 'generate_lead' } }] } });
  await post('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Bia', email: 'bia.ga4@x.test', tags: [], custom: {} } });
  let runRow;
  for (let i = 0; i < 50 && !(runRow?.results || []).some(line => /^Google Analytics: /.test(line)); i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    runRow = (await (await fetch(`${base}/api/state?workspace=demo`)).json()).state.runs.find(row => row.name === 'Lead no GA4');
  }
  const [call] = sent;
  assert.equal(call.url.origin + call.url.pathname, 'https://www.google-analytics.com/mp/collect');
  assert.deepEqual([call.url.searchParams.get('measurement_id'), call.url.searchParams.get('api_secret')], ['G-ABC1234', 'Abc_DEF-1234567890']);
  assert.equal(call.body.events[0].name, 'generate_lead');
  assert.ok(runRow.results.includes('Google Analytics: generate_lead enviado'), runRow.results.join(' | '));

  const cleared = await post('/api/tracking/ga4-secret?workspace=demo', { secret: '' });
  assert.equal(cleared.body.state.tracking.ga4SecretSet, false, 'an empty value removes the secret');
});
