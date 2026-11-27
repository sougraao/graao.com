import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { twilioSignature } from '../twilio.mjs';
import { actionSpec, triggerSpec } from '../ui/workflow-data.js';

// Power dialer (6b.9): the queue, the member's conference line, one contact after the other and their results.
const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const flow = (s, name, trigger, steps) => save(s, 'workflows', { name, active: true, triggers: [trigger], steps });
const TOKEN = 'token-de-teste';

test('Dialer queue: by tag, by workflow and by hand; results fire "Resultado do discador"', () => {
  assert.deepEqual(actionSpec('dialer_add').fields, []);
  assert.deepEqual(triggerSpec('dialer_disposition').fields.map(field => field.key), ['disposition']);
  const s = blank();
  const ana = save(s, 'contacts', { name: 'Ana', phone: '11 95555-0001', tags: ['lista'], custom: {} });
  save(s, 'contacts', { name: 'Sem telefone', tags: ['lista'], custom: {} });
  save(s, 'contacts', { name: 'Não perturbe', phone: '11 95555-0002', dnd: true, tags: ['lista'], custom: {} });
  assert.equal(execute(s, { type: 'dialer-queue-add', data: { tag: 'LISTA' } }), 1, 'only contacts with a phone and without DND');
  assert.equal(execute(s, { type: 'dialer-queue-add', data: { contactIds: [ana] } }), 0, 'pending once');
  const flowId = flow(s, 'para o discador', { type: 'contact_tag', config: { change: 'added', tag: 'ligar' } }, [{ type: 'dialer_add', config: {} }]);
  const bia = save(s, 'contacts', { name: 'Bia', phone: '11 95555-0003', tags: [], custom: {} });
  save(s, 'contacts', { ...s.contacts.find(row => row.id === bia), tags: ['ligar'] }, bia);
  assert.match(s.runs.find(run => run.workflowId === flowId).results.join(' '), /na fila do discador/);
  assert.deepEqual(s.dialer.queue.filter(row => row.status === 'pending').map(row => row.contactId), [ana, bia]);
  execute(s, { type: 'dialer-queue-remove', data: { contactId: bia } });
  assert.equal(s.dialer.queue.filter(row => row.status === 'pending').length, 1);

  const interested = flow(s, 'interessado', { type: 'dialer_disposition', config: { disposition: 'interested' } }, [{ type: 'add_tag', config: { tag: 'quente' } }]);
  const callId = execute(s, { type: 'phone-call-start', data: { direction: 'outbound', kind: 'dialer', dialerId: 'dl-1', contactId: ana, to: '+5511955550001' } });
  s.dialer.queue[0].callId = callId;
  assert.throws(() => execute(s, { type: 'dialer-disposition', data: { callId, disposition: 'talvez' } }), /Escolha o resultado/);
  execute(s, { type: 'dialer-disposition', data: { callId, disposition: 'interested', note: 'Quer proposta até sexta' } });
  execute(s, { type: 'dialer-disposition', data: { callId, disposition: 'interested' } });
  assert.deepEqual([s.calls.find(row => row.id === callId).disposition, s.dialer.queue[0].status], ['interested', 'done']);
  assert.equal(s.runs.filter(run => run.workflowId === interested).length, 1, 'once per call');
  assert.ok(s.contacts.find(row => row.id === ana).tags.includes('quente'));
  assert.ok(s.messages.some(row => row.contactId === ana && row.body === 'Discador: Interessado\nQuer proposta até sexta'));
});

test('Server: the member joins a conference, the dialer brings each contact in and stops at the end of the queue', async t => {
  const twilioCalls = [];
  const twilioRequest = async (url, options = {}) => {
    const form = options.body ? Object.fromEntries(new URLSearchParams(options.body)) : {};
    twilioCalls.push({ url, form });
    const ok = body => ({ ok: true, status: 200, json: async () => body });
    if (url.endsWith('/IncomingPhoneNumbers.json')) return ok({ sid: 'PN1', phone_number: form.PhoneNumber });
    if (url.endsWith('/Calls.json')) return ok({ sid: `CA${twilioCalls.length}` });
    if (/\/Calls\/CA\d+\.json$/.test(url)) return ok({});
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const phoneEnv = { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: TOKEN, PHONE_PUBLIC_ORIGIN: 'https://graao.test' };
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false, twilioRequest, phoneEnv });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const action = async body => { const r = await call('/api/action?workspace=demo', body); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.id; };
  const twilio = async (path, params) => (await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': twilioSignature(`https://graao.test${path}`, params, TOKEN) }, body: new URLSearchParams(params).toString() })).text();
  const state = async () => (await call('/api/state?workspace=demo')).body.state;

  await call('/api/phone/buy?workspace=demo', { number: '+551140001000' });
  assert.equal((await call('/api/phone/dialer/next?workspace=demo', {})).status, 409, 'start first');
  const one = await action({ type: 'save', key: 'contacts', data: { name: 'Caio', phone: '11 95555-1111', tags: ['frio'], custom: {} } });
  const two = await action({ type: 'save', key: 'contacts', data: { name: 'Davi', phone: '11 95555-2222', tags: ['frio'], custom: {} } });
  assert.equal(await action({ type: 'dialer-queue-add', data: { tag: 'frio' } }), 2);

  const started = await call('/api/phone/dialer/start?workspace=demo', { agentPhone: '11 97777-0000' });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  const agentLeg = twilioCalls.at(-1).form;
  assert.equal(agentLeg.To, '+5511977770000');
  const session = started.body.session;
  assert.equal(agentLeg.Url, `https://graao.test/api/phone/twilio/dialer/demo?session=${session}`);
  let xml = await twilio(`/api/phone/twilio/dialer/demo?session=${session}`, { CallSid: 'CAagent' });
  assert.match(xml, new RegExp(`<Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">graao-dialer-${session}</Conference>`));
  assert.equal((await state()).dialer.sessions.find(row => row.id === session).status, 'active');

  const first = (await call('/api/phone/dialer/next?workspace=demo', {})).body;
  assert.equal(first.contactId, one);
  assert.equal(twilioCalls.at(-1).form.To, '+5511955551111');
  assert.equal((await call('/api/phone/dialer/next?workspace=demo', {})).status, 409, 'one call at a time');
  xml = await twilio(`/api/phone/twilio/join/demo?call=${first.callId}`, { CallSid: 'CAc1' });
  assert.match(xml, new RegExp(`endConferenceOnExit="false" beep="false">graao-dialer-${session}<`));
  await twilio(`/api/phone/twilio/status/demo?call=${first.callId}`, { CallSid: 'CAc1', CallStatus: 'completed', CallDuration: '48' });
  await action({ type: 'dialer-disposition', data: { callId: first.callId, disposition: 'callback', note: 'Ligar amanhã' } });

  const second = (await call('/api/phone/dialer/next?workspace=demo', {})).body;
  assert.equal(second.contactId, two);
  await twilio(`/api/phone/twilio/status/demo?call=${second.callId}`, { CallSid: 'CAc2', CallStatus: 'no-answer', CallDuration: '0' });
  assert.deepEqual((await call('/api/phone/dialer/next?workspace=demo', {})).body, { done: true });
  let s = await state();
  assert.deepEqual([s.calls.find(row => row.id === first.callId).status, s.calls.find(row => row.id === second.callId).status], ['answered', 'missed']);
  assert.equal(s.dialer.sessions.find(row => row.id === session).calls, 2);

  assert.equal((await call('/api/phone/dialer/stop?workspace=demo', {})).status, 200);
  assert.ok(twilioCalls.some(row => row.url.endsWith('/Calls/CAagent.json') && row.form.Status === 'completed'), 'the member line is hung up');
  s = await state();
  assert.equal(s.dialer.sessions.find(row => row.id === session).status, 'ended');
});
