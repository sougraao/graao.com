import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore, createSupabaseStore } from '../storage.mjs';

function mockWahaServer() {
  const calls = [];
  let sessionStatus = 'STOPPED';
  const request = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method: init.method || 'GET', path: u.pathname, key: init.headers?.['X-Api-Key'] || '', body });

    if (u.pathname === '/api/sessions/default' && (init.method || 'GET') === 'GET') {
      return new Response(JSON.stringify({
        name: 'default',
        status: sessionStatus,
        me: sessionStatus === 'WORKING' ? { id: '5511999990000@c.us', pushName: 'Graao Oficial' } : null
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (u.pathname === '/api/sessions/default/start' && init.method === 'POST') {
      sessionStatus = 'SCAN_QR_CODE';
      return new Response(JSON.stringify({ name: 'default', status: sessionStatus }), { status: 200 });
    }
    if (u.pathname === '/api/sessions/default/stop' && init.method === 'POST') {
      sessionStatus = 'STOPPED';
      return new Response(JSON.stringify({ name: 'default', status: sessionStatus }), { status: 200 });
    }
    if (u.pathname === '/api/default/auth/qr') {
      return new Response(JSON.stringify({ mimetype: 'image/png', data: 'iVBORw0KGgo=' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (u.pathname === '/api/default/auth/request-code' && init.method === 'POST') {
      return new Response(JSON.stringify({ code: 'ABCD-1234' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (u.pathname === '/api/sendText' && init.method === 'POST') {
      sessionStatus = 'WORKING';
      return new Response(JSON.stringify({ id: 'true_5511988887777@c.us_ABC' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ error: 'not found' }), { status: 404 });
  };
  return { calls, request };
}

async function start(opts = {}) {
  const store = opts.store || createSqliteStore(':memory:');
  const { server, host } = makeServer({
    allowLocalAccess: true,
    auth: null,
    store,
    port: 0,
    openAISecret: 'b'.repeat(64),
    ...opts
  });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined
      ? { headers }
      : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return { base, call, store, close: () => new Promise(resolve => server.close(resolve)) };
}

test('WAHA integration seals X-Api-Key, controls session/QR/pairing, sends test text, routes webhooks to Conversas', async t => {
  const waha = mockWahaServer();
  const local = await start({ wahaRequest: waha.request }); t.after(local.close);

  // Configure WAHA server
  const cfg = await local.call('/api/waha/config', {
    baseUrl: 'https://waha.example.test',
    apiKey: 'secret-waha-key-9876',
    session: 'default'
  });
  assert.equal(cfg.status, 200);
  assert.equal(cfg.body.configured, true);
  assert.equal(cfg.body.hasApiKey, true);
  assert.equal(cfg.body.apiKeyLast4, '9876');
  assert.equal(JSON.stringify(cfg.body).includes('secret-waha-key-9876'), false);

  // Raw stored row must not contain plaintext API key and must carry profile.name
  const stored = await local.store.load('waha-agency');
  assert.equal(stored.profile.name, 'WhatsApp (WAHA)');
  assert.equal(JSON.stringify(stored).includes('secret-waha-key-9876'), false);

  // Start session and fetch QR + pairing code
  const started = await local.call('/api/waha/session', { action: 'start' });
  assert.equal(started.status, 200);
  assert.equal(started.body.live.status, 'SCAN_QR_CODE');

  const qr = await local.call('/api/waha/qr');
  assert.equal(qr.status, 200);
  assert.match(qr.body.dataUrl, /^data:image\/png;base64,/);

  const pair = await local.call('/api/waha/pair-code', { phoneNumber: '+55 (11) 99999-8888' });
  assert.equal(pair.status, 200);
  assert.equal(pair.body.code, 'ABCD-1234');

  // Send test message (verifying X-Api-Key header passed to WAHA)
  const sent = await local.call('/api/waha/test', { phone: '5511988887777', text: 'Olá via WAHA!' });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.chatId, '5511988887777@c.us');
  const sendCall = waha.calls.find(c => c.path === '/api/sendText');
  assert.equal(sendCall.key, 'secret-waha-key-9876');

  // Enable WhatsApp & rebilling for demo sub-account
  const sub = await local.call('/api/waha/subaccount', { workspace: 'demo', enabled: true, rebill: true, session: 'default' });
  assert.equal(sub.status, 200);
  assert.deepEqual(sub.body.subaccounts.demo, { enabled: true, rebill: true, session: 'default' });

  // Webhook delivers inbound message into demo's Conversas inbox
  const webhookPath = new URL(cfg.body.webhookUrl).pathname;
  const badHook = await local.call('/api/waha/webhook/agency/' + '0'.repeat(48), { event: 'message' });
  assert.equal(badHook.status, 403);

  const hook = await local.call(webhookPath, {
    event: 'message',
    session: 'default',
    payload: {
      id: 'msg-1',
      from: '5531987654321@c.us',
      fromMe: false,
      body: 'Oi, quero saber sobre os planos!',
      _data: { notifyName: 'Maria Silva' }
    }
  });
  assert.equal(hook.status, 200);
  assert.equal(hook.body.stored, true);
  assert.equal(hook.body.workspace, 'demo');

  const demo = (await local.call('/api/state?workspace=demo')).body.state;
  const contact = demo.contacts.find(c => c.name === 'Maria Silva');
  assert.ok(contact, 'Inbound WhatsApp webhook should create contact');
  const msg = demo.messages.find(m => m.contactId === contact.id && m.channel === 'WhatsApp');
  assert.equal(msg?.body, 'Oi, quero saber sobre os planos!');
  assert.equal(msg?.direction, 'Inbound');
  assert.equal((await local.call('/api/agency/action', { type: 'account-meta', id: 'demo', data: { status: 'Closed' } })).status, 200);
  const ignored = await local.call(webhookPath, {
    event: 'message', session: 'default', payload: { id: 'msg-closed', from: '5531777777777@c.us', body: 'Do not deliver' }
  });
  assert.equal(ignored.status, 200);
  assert.deepEqual(ignored.body, { ok: true, ignored: true, reason: 'ACCOUNT_SUSPENDED' });
  const callsBeforeTest = waha.calls.length;
  assert.equal((await local.call('/api/waha/test', { phone: '5511988887777', text: 'Do not send' })).body.code, 'ACCOUNT_SUSPENDED');
  assert.equal((await local.call('/api/waha/session', { action: 'start' })).status, 403);
  assert.equal(waha.calls.length, callsBeforeTest);
  const { ledgerOutbox, ...kept } = local.store.load('demo');
  assert.deepEqual(ledgerOutbox, []);
  assert.deepEqual(kept, demo, 'the browser gets everything but the ledger outbox');
  assert.equal(local.store.load('agency').accounts.demo.ignoredWebhooks.waha.count, 1);
});

test('WAHA config persists cleanly through Supabase store rules and denies sub-account users', async t => {
  const rows = new Map();
  const storageKey = 'c'.repeat(64);
  const supabaseStore = createSupabaseStore({
    projectUrl: 'https://test.supabase.co',
    publishableKey: 'sb_publishable_test',
    storageKey,
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
      if (idParam) {
        const cur = rows.get(idParam);
        return new Response(JSON.stringify(cur ? [structuredClone(cur)] : []), { status: 200 });
      }
      return new Response(JSON.stringify([...rows.values()].map(({ id, name }) => ({ id, name }))), { status: 200 });
    }
  });

  const waha = mockWahaServer();
  const local = await start({ store: supabaseStore, wahaRequest: waha.request }); t.after(local.close);

  const saved = await local.call('/api/waha/config', { baseUrl: 'https://waha.example.test', session: 'default' });
  assert.equal(saved.status, 200);
  assert.equal(rows.get('waha-agency')?.name, 'WhatsApp (WAHA)');

  const userId = (await local.call('/api/agency/action', {
    type: 'save',
    key: 'users',
    data: { first: 'Lucas', last: 'Melo', email: 'lucas@example.test', role: 'Account User', accounts: ['demo'], permissions: ['contacts'] }
  })).body.result;
  const denied = await local.call('/api/waha/status', undefined, { 'X-Go-User': userId });
  assert.equal(denied.status, 403);
});
