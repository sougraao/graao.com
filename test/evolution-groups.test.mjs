import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { createWhatsAppHandler } from '../whatsapp.mjs';

const KEY = 'evo-global-key-super-secret', SECRET = 'evolution-test-seal-secret-32-chars!';
const GROUP = '120363000000000000@g.us';
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const active = async () => true;
const text = value => ({ kind: 'text', text: value });

// Subconta conectada numa Evolution falsa; `reply` troca a resposta das chamadas de envio e de grupos.
async function connected(t, { open = true } = {}) {
  const calls = [];
  const evo = { calls, reply: null, state: 'close' };
  const request = async (url, init = {}) => {
    const u = new URL(url), body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path: u.pathname, search: u.search, body });
    if (u.pathname === '/instance/create') return json({ instance: { instanceName: body.instanceName }, hash: 'h' }, 201);
    if (u.pathname === '/instance/fetchInstances') return json([{ name: 'graao_demo', connectionStatus: evo.state, ownerJid: '5511999990000@s.whatsapp.net' }]);
    if (u.pathname.startsWith('/instance/connect/')) return json({ base64: 'data:image/png;base64,AAAA', code: 'x' });
    if (u.pathname.startsWith('/message/') || u.pathname.startsWith('/group/')) {
      if (evo.reply) return evo.reply(u, body);
      if (u.pathname.startsWith('/group/fetchAllGroups/')) return json([
        { id: GROUP, subject: 'Zeladores', size: 12 }, { id: '5511999990000-1600000000@g.us', subject: 'Alunas', size: 40 }, { id: 'lixo', subject: 'X' }
      ]);
      return json({ key: { id: 'ID1' } }, 201);
    }
    return json({});
  };
  const dir = mkdtempSync(join(tmpdir(), 'graao-evo-groups-')), store = createSqliteStore(join(dir, 'go.sqlite'));
  const options = { evolutionBaseUrl: 'https://evo.graao.test', evolutionApiKey: KEY };
  const { server } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, openAISecret: SECRET, socialScheduler: false, whatsappRequest: request, ...options });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise(done => server.close(done)); rmSync(dir, { recursive: true, force: true }); });
  await fetch(`${base}/api/whatsapp/workspace/connect?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  if (open) evo.state = 'open';
  await fetch(`${base}/api/whatsapp/workspace/status?workspace=demo`);
  calls.length = 0;
  const handler = createWhatsAppHandler({ store, secret: SECRET, request, ...options });
  return { evo, calls, base, store, send: message => handler.sendEventMessage('agency', 'demo', message, active), groups: () => handler.listWorkspaceGroups('agency', 'demo', active), handler };
}
const sends = calls => calls.filter(c => c.path.startsWith('/message/'));

test('Lists the groups of the connected number by name', async t => {
  const wa = await connected(t);
  assert.deepEqual(await wa.groups(), { reason: '', groups: [{ jid: '5511999990000-1600000000@g.us', name: 'Alunas', size: 40 }, { jid: GROUP, name: 'Zeladores', size: 12 }] });
  const call = wa.calls.find(c => c.path.startsWith('/group/'));
  assert.equal(call.path + call.search, '/group/fetchAllGroups/graao_demo?getParticipants=false');
  const res = await fetch(`${wa.base}/api/whatsapp/workspace/groups?workspace=demo`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).groups.length, 2);
});

test('Listing groups needs marketing and conversations, not settings', async t => {
  const wa = await connected(t);
  const list = async (permissions, email) => {
    const res = await fetch(`${wa.base}/api/agency/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'save', key: 'users', data: { first: 'Ana', last: 'Lima', email, role: 'Account User', accounts: ['demo'], permissions } }) });
    const { result } = await res.json();
    return (await fetch(`${wa.base}/api/whatsapp/workspace/groups?workspace=demo`, { headers: { 'X-Go-User': result } })).status;
  };
  assert.equal(await list(['marketing'], 'a@example.test'), 403);
  assert.equal(await list(['settings'], 'b@example.test'), 403);
  assert.equal(await list(['marketing', 'conversations'], 'c@example.test'), 200);
});

test('A disconnected number has no groups and keeps messages waiting', async t => {
  const wa = await connected(t, { open: false });
  assert.deepEqual(await wa.groups(), { reason: 'not-connected', groups: [] });
  assert.equal((await wa.send({ to: GROUP, part: text('Oi') })).outcome, 'waiting');
  assert.equal(sends(wa.calls).length, 0);
});

test('Sends text and polls to a group and text to a phone', async t => {
  const wa = await connected(t);
  assert.deepEqual(await wa.send({ to: GROUP, part: text('Oi *grupo*') }), { outcome: 'sent', id: 'ID1', error: '' });
  assert.equal((await wa.send({ to: GROUP, part: { kind: 'poll', question: 'Vai?', options: ['Sim', 'Não'] } })).outcome, 'sent');
  assert.equal((await wa.send({ to: '+55 (11) 98888-7777', part: text('Oi') })).outcome, 'sent');
  assert.deepEqual(sends(wa.calls).map(c => [c.path, c.body.number]), [
    ['/message/sendText/graao_demo', GROUP], ['/message/sendPoll/graao_demo', GROUP], ['/message/sendText/graao_demo', '5511988887777']
  ]);
  assert.equal(sends(wa.calls)[0].body.text, 'Oi *grupo*');
  assert.deepEqual([sends(wa.calls)[1].body.name, sends(wa.calls)[1].body.values, sends(wa.calls)[1].body.selectableCount], ['Vai?', ['Sim', 'Não'], 1]);
});

test('Invalid recipients fail without calling the server', async t => {
  const wa = await connected(t);
  for (const to of ['abc@g.us', '123', '', '120363@s.whatsapp.net@g.us']) assert.equal((await wa.send({ to, part: text('Oi') })).outcome, 'failed', to);
  assert.equal(sends(wa.calls).length, 0);
});

test('Only what surely was not sent may be retried, and never inside the call', async t => {
  const wa = await connected(t);
  const outcome = async reply => {
    wa.calls.length = 0; wa.evo.reply = reply;
    const result = await wa.send({ to: GROUP, part: text('Oi') });
    assert.equal(sends(wa.calls).length, 1, 'uma chamada só');
    return result.outcome;
  };
  const thrown = (name, code) => () => { throw Object.assign(new TypeError('fetch failed'), { name, cause: code ? { code } : undefined }); };
  assert.equal(await outcome(() => json({}, 503)), 'retry');
  assert.equal(await outcome(thrown('TypeError', 'ECONNREFUSED')), 'retry');
  assert.equal(await outcome(thrown('TypeError', 'ENOTFOUND')), 'retry');
  assert.equal(await outcome(thrown('TypeError', 'ECONNRESET')), 'unconfirmed');
  assert.equal(await outcome(thrown('TimeoutError')), 'unconfirmed');
  assert.equal(await outcome(() => json({}, 502)), 'unconfirmed');
  assert.equal(await outcome(() => json({}, 500)), 'unconfirmed');
  assert.equal(await outcome(() => json({}, 429)), 'unconfirmed');
  assert.equal(await outcome(() => json({ response: { message: ['Connection Closed'] } }, 400)), 'waiting');
  assert.equal(await outcome(() => json({ response: { message: [{ exists: false, number: '5511' }] } }, 400)), 'failed');
});

async function action(base, command) {
  const res = await fetch(`${base}/api/action?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
  const body = await res.json();
  assert.equal(res.status, 200, body.error);
  return body;
}
const until = async check => { for (let n = 0; n < 100; n++) { if (await check()) return true; await new Promise(done => setTimeout(done, 30)); } return false; };

test('From the planner to WhatsApp: a due message leaves at once and the cron does not wait for the rest', async t => {
  const wa = await connected(t);
  for (let n = 1; n <= 2; n++) await action(wa.base, { type: 'save', key: 'contacts', data: { name: `Fila${n}`, phone: `551190000000${n}`, tags: ['fila-teste'] } });
  const itemId = '6ccf69dd-f808-4258-b12c-9d5de1f06c88', groupId = '3c4ad2e7-7ec3-4b15-a35c-155e081bd240';
  const base = { kind: 'message', status: 'pronto', date: '2020-01-01', time: '10:00' };
  const { id } = await action(wa.base, { type: 'save', key: 'eventPlans', data: { title: 'Aula', eventDate: '2026-12-10', plan: { brief: {}, items: [
    { ...base, id: itemId, title: 'Privado', channel: 'privado', notes: 'Oi, {{contact.first_name}}!', targets: { tags: ['fila-teste'], excludeTags: [] } },
    { ...base, id: groupId, title: 'Grupo', channel: 'grupos', audience: 'base', notes: 'Oi grupo' }] } } });
  await action(wa.base, { type: 'event-groups-save', id, data: { base: [{ jid: GROUP, name: 'Zeladores' }], evento: [] } });
  await action(wa.base, { type: 'event-message-schedule', id, data: { itemId } });
  await action(wa.base, { type: 'event-message-schedule', id, data: { itemId: groupId } });
  assert.ok(await until(() => sends(wa.calls).length === 2), 'um privado e o grupo saem na hora');
  assert.deepEqual(sends(wa.calls).map(c => [c.body.number, c.body.text]).sort(), [[GROUP, 'Oi grupo'], ['5511900000001', 'Oi, Fila1!']]);
  const before = process.env.CRON_SECRET; process.env.CRON_SECRET = 'segredo-do-cron';
  t.after(() => { if (before === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = before; });
  const started = Date.now(), cron = await fetch(`${wa.base}/api/social/cron`, { headers: { Authorization: 'Bearer segredo-do-cron' } });
  assert.equal(cron.status, 200);
  assert.ok(Date.now() - started < 5000, 'o cron responde sem esperar o intervalo do privado');
  await new Promise(done => setTimeout(done, 200));
  assert.equal(sends(wa.calls).length, 2, 'o segundo privado espera o intervalo');
  const state = await wa.store.load('demo');
  assert.deepEqual(state.eventSends.map(row => row.status).sort(), ['queued', 'sent', 'sent']);
  assert.equal(state.eventPlans.find(row => row.id === id).plan.items[1].status, 'enviado');
});

test('A suspended account waits instead of sending', async t => {
  const wa = await connected(t);
  const result = await wa.handler.sendEventMessage('agency', 'demo', { to: GROUP, part: text('Oi') }, async () => false);
  assert.equal(result.outcome, 'waiting');
  assert.equal(sends(wa.calls).length, 0);
});

test('A send refused while the number is up is a failure, never an endless wait', async t => {
  const wa = await connected(t);
  for (const status of [401, 403, 404]) {
    wa.evo.reply = () => json({ message: 'Grupo não encontrado' }, status); wa.evo.state = 'open';
    assert.equal((await wa.send({ to: GROUP, part: text('Oi') })).outcome, 'failed', String(status));
    wa.evo.reply = () => { wa.evo.state = 'close'; return json({}, status); };
    await fetch(`${wa.base}/api/whatsapp/workspace/status?workspace=demo`);
    assert.equal((await wa.send({ to: GROUP, part: text('Oi') })).outcome, 'waiting', String(status));
    wa.evo.state = 'open'; await fetch(`${wa.base}/api/whatsapp/workspace/status?workspace=demo`);
  }
});
