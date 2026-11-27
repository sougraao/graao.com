import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeServer } from '../server.mjs';
import { createSqliteStore, createSupabaseStore } from '../storage.mjs';
import { createWhatsAppHandler } from '../whatsapp.mjs';
import { API_KEY, QR, fakeEvolution } from './helpers/fake-evolution.mjs';

const SECRET = 'whatsapp-test-seal-secret-32-chars!';
const MANAGED = { evolutionBaseUrl: 'https://evo.graao.test', evolutionApiKey: API_KEY };
let messageSeq = 0;
const upsert = (phone, text, pushName) => ({
  event: 'messages.upsert', instance: 'graao_demo',
  data: { key: { remoteJid: `${phone}@s.whatsapp.net`, fromMe: false, id: `IN${++messageSeq}` }, pushName, message: { conversation: text }, messageType: 'conversation' }
});

async function boot(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'graao-whatsapp-'));
  const store = options.store || createSqliteStore(join(dir, 'go.sqlite'));
  const { server } = makeServer({
    store,
    auth: null,
    allowLocalAccess: true,
    port: 0,
    openAISecret: SECRET,
    socialScheduler: false,
    ...options
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  async function call(path, body, extraHeaders = {}) {
    const headers = { ...extraHeaders };
    const init = body === undefined
      ? { method: 'GET', headers }
      : { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const res = await fetch(`${base}${path}`, init);
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  return { base, call, store };
}

test('Managed 1-click QR isolates sub-accounts, routes inbound webhooks and dispatches outbound Conversas', async t => {
  const evo = fakeEvolution();
  const local = await boot(t, { whatsappRequest: evo.request, ...MANAGED });

  // Create a second sub-account
  const created = await local.call('/api/agency/accounts', { name: 'Clínica Sol' });
  assert.equal(created.status, 200);
  const sub2 = created.body.result;

  // Agency sees managed mode active without configuring anything
  const agStatus = await local.call('/api/whatsapp/agency/status');
  assert.equal(agStatus.status, 200);
  assert.equal(agStatus.body.managed, true);
  assert.equal(agStatus.body.configured, true);
  assert.equal(JSON.stringify(agStatus.body).includes(API_KEY), false);

  // Sub-account 1 (demo) connects with 1 click -> gets QR Code immediately
  const conn1 = await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  assert.equal(conn1.status, 200);
  assert.equal(conn1.body.status, 'connecting');
  assert.equal(conn1.body.qrcode, QR);
  assert.equal(JSON.stringify(conn1.body).includes('hash-graao_demo'), false);
  assert.equal(JSON.stringify(conn1.body).includes(API_KEY), false);

  // Sub-account 2 connects independently via pairing code -> gets its OWN separate instance
  const conn2 = await local.call(`/api/whatsapp/workspace/connect?workspace=${sub2}`, { phone: '+55 (31) 99999-1111' });
  assert.equal(conn2.status, 200);
  assert.equal(conn2.body.status, 'connecting');
  assert.equal(conn2.body.paircode, 'WZYX-1234');
  assert.deepEqual([...evo.instances.keys()].sort(), ['graao_demo', `graao_${sub2}`.slice(0, 37)].sort(), 'Each sub-account must provision its own isolated instance');

  // Verify tokens are sealed in DB (no plaintext token stored)
  const rawDoc = await local.store.load('whatsapp-agency');
  assert.equal(rawDoc.profile.name, 'WhatsApp (Evolution API)');
  assert.equal(JSON.stringify(rawDoc).includes('hash-graao_'), false);

  // Simulate user scanning QR code on demo's phone
  evo.markOpen('graao_demo', '5531988887777', 'Atendimento Demo');

  const polled = await local.call('/api/whatsapp/workspace/status?workspace=demo');
  assert.equal(polled.status, 200);
  assert.equal(polled.body.status, 'connected');
  assert.equal(polled.body.phone, '5531988887777');
  assert.equal(polled.body.profileName, 'Atendimento Demo');

  // Inbound webhook delivers directly into demo's Conversas
  const hookPath = new URL(polled.body.webhookUrl).pathname;
  const badHook = await local.call(`/api/whatsapp/webhook/agency/demo/${'0'.repeat(48)}`, upsert('5511977776666', 'x'));
  assert.equal(badHook.status, 403);

  const hook = await local.call(hookPath, upsert('5511977776666', 'Oi! Quero agendar uma demo.', 'Carlos Mendes'));
  assert.equal(hook.status, 200);
  assert.equal(hook.body.stored, true);
  assert.equal(hook.body.workspace, 'demo');

  const demoState = (await local.call('/api/state?workspace=demo')).body.state;
  const contact = demoState.contacts.find(c => c.name === 'Carlos Mendes');
  assert.ok(contact, 'Inbound webhook should auto-create contact');
  const inbound = demoState.messages.find(m => m.contactId === contact.id && m.channel === 'WhatsApp');
  assert.equal(inbound?.body, 'Oi! Quero agendar uma demo.');
  assert.equal(inbound?.direction, 'Inbound');

  // Sending outbound WhatsApp from Conversas dispatches live through the Evolution API
  const reply = await local.call('/api/action?workspace=demo', {
    type: 'message',
    data: { contactId: contact.id, channel: 'WhatsApp', direction: 'Outbound', body: 'Claro, qual melhor horário?' }
  });
  assert.equal(reply.status, 200);
  assert.equal(reply.body.delivery?.sent, true);
  const sendCall = evo.calls.find(c => c.path === '/message/sendText/graao_demo');
  assert.equal(sendCall?.body?.number, '5511977776666');
  assert.equal(sendCall?.body?.text, 'Claro, qual melhor horário?');
  assert.equal(sendCall?.headers?.apikey, API_KEY);

  // Without a phone the message stays in Conversas, marked as failed ("Falha no envio de mensagem").
  const noPhone = await local.call('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Sem telefone', tags: [], custom: {} } });
  const undelivered = await local.call('/api/action?workspace=demo', {
    type: 'message', data: { contactId: noPhone.body.id, channel: 'WhatsApp', direction: 'Outbound', body: 'Oi' }
  });
  assert.equal(undelivered.status, 200);
  assert.equal(undelivered.body.state.messages.find(m => m.id === undelivered.body.id)?.failed, 'no_phone');

  const message = upsert('5511966665555', 'Suspended message', 'Blocked contact');
  const beforePaused = local.store.load('demo');
  const sendCount = evo.calls.length;
  const plan = await local.call('/api/agency/action', { type: 'save', key: 'plans', data: { name: 'Without conversations', price: 0, modules: ['settings'] } });
  assert.equal(plan.status, 200, plan.body.error);
  const assignedPlan = await local.call('/api/agency/action', { type: 'account-meta', id: 'demo', data: { status: 'Active', plan: plan.body.result } });
  assert.equal(assignedPlan.status, 200);
  assert.equal((await local.call(hookPath, message)).body.reason, 'MODULE_DISABLED');
  assert.deepEqual(local.store.load('demo'), beforePaused);
  for (const status of ['Paused', 'Closed']) {
    assert.equal((await local.call('/api/agency/action', { type: 'account-meta', id: 'demo', data: { status } })).status, 200);
    const ignored = await local.call(hookPath, message);
    assert.equal(ignored.status, 200);
    assert.deepEqual(ignored.body, { ok: true, ignored: true, reason: 'ACCOUNT_SUSPENDED' });
    assert.equal((await local.call('/api/action?workspace=demo', {
      type: 'message', data: { contactId: contact.id, channel: 'WhatsApp', direction: 'Outbound', body: 'Do not send' }
    })).body.code, 'ACCOUNT_SUSPENDED');
    assert.equal((await local.call('/api/whatsapp/workspace/test?workspace=demo', { phone: '5511966665555', text: 'Do not send' })).status, 403);
    assert.deepEqual(local.store.load('demo'), beforePaused);
    assert.equal(evo.calls.length, sendCount);
  }
  assert.equal(local.store.load('agency').accounts.demo.ignoredWebhooks.evolution.count, 2);
  assert.ok(rawDoc.subaccounts.demo.tokenSealed);
  assert.equal(local.store.load('whatsapp-agency').subaccounts.demo.tokenSealed, rawDoc.subaccounts.demo.tokenSealed);
  assert.equal((await local.call('/api/agency/action', { type: 'account-reactivate', id: 'demo' })).status, 200);
  assert.equal((await local.call(hookPath, message)).body.stored, true);

  // Disconnect demo cleanly
  const disc = await local.call('/api/whatsapp/workspace/disconnect?workspace=demo', {});
  assert.equal(disc.status, 200);
  assert.equal(disc.body.status, 'disconnected');
});

test('Agency config persists through Supabase rules and sub-account users can connect their own QR only', async t => {
  const rows = new Map();
  const supabaseStore = createSupabaseStore({
    projectUrl: 'https://test.supabase.co',
    publishableKey: 'sb_publishable_test',
    storageKey: 'd'.repeat(64),
    async request(url, options = {}) {
      const u = new URL(url);
      const method = options.method || 'GET';
      const idParam = u.searchParams.get('id')?.replace(/^eq\./, '');
      const revParam = u.searchParams.get('revision')?.replace(/^eq\./, '');
      if (method === 'POST') {
        const body = JSON.parse(options.body);
        assert.ok(body.state?.profile?.name, `Row ${body.id} must have profile.name`);
        if (rows.has(body.id)) return new Response(JSON.stringify([]), { status: 200 });
        rows.set(body.id, { id: body.id, name: body.state.profile.name, state: structuredClone(body.state), revision: 'rev-0' });
        return new Response(JSON.stringify([{ id: body.id }]), { status: 201 });
      }
      if (method === 'PATCH') {
        const body = JSON.parse(options.body);
        assert.ok(body.state?.profile?.name, `PATCH ${idParam} must preserve profile.name`);
        const cur = rows.get(idParam);
        if (!cur || (revParam && cur.revision !== revParam)) return new Response(JSON.stringify([]), { status: 200 });
        cur.state = structuredClone(body.state);
        cur.revision = body.revision;
        return new Response(JSON.stringify([{ id: idParam }]), { status: 200 });
      }
      if (method === 'GET') {
        if (idParam) {
          const cur = rows.get(idParam);
          return new Response(JSON.stringify(cur ? [cur] : []), { status: 200 });
        }
        return new Response(JSON.stringify([...rows.values()].map(({ id, name }) => ({ id, name }))), { status: 200 });
      }
      return new Response('[]', { status: 200 });
    }
  });

  const evo = fakeEvolution();
  const local = await boot(t, { store: supabaseStore, whatsappRequest: evo.request, evolutionBaseUrl: '', evolutionApiKey: '' });

  // Agency configures its Evolution server once
  const cfg = await local.call('/api/whatsapp/agency/config', {
    baseUrl: 'https://wa.agencia.test',
    adminToken: API_KEY
  });
  assert.equal(cfg.status, 200);
  assert.equal(cfg.body.configured, true);
  assert.equal(cfg.body.adminTokenLast4, 'cret');
  assert.ok(rows.has('whatsapp-agency'));
  assert.equal(JSON.stringify(rows.get('whatsapp-agency')).includes(API_KEY), false);

  // Create a sub-account-only user with access to demo
  const uRes = await local.call('/api/agency/action', {
    type: 'save',
    key: 'users',
    data: { first: 'Ana', last: 'Cliente', email: 'ana@demo.test', role: 'Account Admin', accounts: ['demo'], permissions: ['conversations', 'settings'] }
  });
  assert.equal(uRes.status, 200);
  const subUserId = uRes.body.result;

  // Sub-account user CANNOT access the agency server config
  const denied = await local.call('/api/whatsapp/agency/status', undefined, { 'X-Go-User': subUserId });
  assert.equal(denied.status, 403);

  // Sub-account user CAN connect their own WhatsApp with 1-click QR code (without seeing server URL or admin token)
  const subConnect = await local.call('/api/whatsapp/workspace/connect?workspace=demo', {}, { 'X-Go-User': subUserId });
  assert.equal(subConnect.status, 200);
  assert.equal(subConnect.body.qrcode, QR);
  assert.equal(JSON.stringify(subConnect.body).includes('wa.agencia.test'), false);
  assert.equal(JSON.stringify(subConnect.body).includes(API_KEY), false);
});

test('An event message is never repeated inside the call', async t => {
  const evo = fakeEvolution();
  let reply = null, sends = 0;
  const request = async (url, init) => {
    if (!String(url).includes('/message/sendText/') || !reply) return evo.request(url, init);
    sends++;
    return reply();
  };
  const local = await boot(t, { whatsappRequest: request, ...MANAGED });
  await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  evo.markOpen('graao_demo', '5531988887777', 'Demo');
  await local.call('/api/whatsapp/workspace/status?workspace=demo');
  const handler = createWhatsAppHandler({ store: local.store, secret: SECRET, request, ...MANAGED });
  const send = () => handler.sendEventMessage('agency', 'demo', { to: '5511977776666', part: { kind: 'text', text: 'Oi' } }, async () => true);
  const broken = { 502: () => new Response('{}', { status: 502 }), ECONNRESET: () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); } };
  for (const [name, answer] of Object.entries(broken)) {
    reply = answer; sends = 0;
    assert.equal((await send()).outcome, 'unconfirmed', name);
    assert.equal(sends, 1, name);
  }
});
