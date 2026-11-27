import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { verifyLink } from '../phone-verify.mjs';
import { API_KEY, fakeEvolution } from './helpers/fake-evolution.mjs';

const SECRET = 'segredo-do-webhook-de-teste';
const LINE = { number: '5500000000000', instance: 'graao-verify', secret: SECRET };
const PHONE = '5531981234567';
// Cada nome vira uma pessoa com a própria agência (agency-<nome>).
const person = name => name ? { id: name, email: `${name}@agencia.test` } : null;

async function boot(t, phoneVerify = LINE) {
  const store = createSqliteStore(':memory:');
  const evo = fakeEvolution();
  evo.instances.set(LINE.instance, { state: 'open', ownerJid: `${LINE.number}@s.whatsapp.net`, profileName: 'graao', webhook: null, pairing: '' });
  const auth = { user: async req => person(req.headers['x-test-user']), hasSession: () => true, session: async req => person(req.headers['x-test-user']) };
  const { server, host, ready } = makeServer({ store, auth, agencyOwnerId: 'root-owner', allowLocalAccess: false, port: 0, socialScheduler: false,
    evolutionBaseUrl: 'https://evo.test', evolutionApiKey: API_KEY, whatsappRequest: evo.request, phoneVerify });
  await ready;
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, { who, body, ip } = {}) => {
    const headers = { ...(who && { 'x-test-user': who }), ...(ip && { 'x-forwarded-for': ip }), ...(body && { 'Content-Type': 'application/json', Origin: base }) };
    const r = await fetch(base + path, body ? { method: 'POST', headers, body: JSON.stringify(body) } : { headers });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  let n = 0;
  const deliver = (key, text, secret = SECRET) => call(`/api/verify/whatsapp/${secret}`, { body: {
    event: 'messages.upsert', instance: LINE.instance,
    data: { key: { fromMe: false, id: `MSG${++n}`, ...key }, pushName: 'Pessoa', message: { conversation: text }, messageTimestamp: 1767225600 }
  } });
  const from = phone => ({ remoteJid: `${phone}@s.whatsapp.net` });
  const sent = () => evo.calls.filter(c => c.path === `/message/sendText/${LINE.instance}`).map(c => c.body);
  return { store, call, deliver, from, sent };
}

test('Confirmar libera o teste e responde no WhatsApp', async t => {
  const { call, deliver, from, sent } = await boot(t);
  const started = await call('/api/verify/start', { who: 'nova', body: { phone: '(31) 98123-4567' } });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.equal(started.body.number, LINE.number);
  assert.equal(started.body.link, verifyLink(LINE.number, started.body.code));
  assert.ok(Date.parse(started.body.expiresAt) > Date.now());
  assert.deepEqual((await call('/api/verify/status', { who: 'nova' })).body, { status: 'waiting', reason: '' });
  assert.equal((await deliver(from(PHONE), `Confirmar graao ${started.body.code.toLowerCase()}`)).status, 200);
  assert.equal((await call('/api/verify/status', { who: 'nova' })).body.status, 'verified');
  const agency = await call('/api/agency', { who: 'nova' });
  assert.equal(agency.body.billing.status, 'Trial');
  assert.equal(agency.body.billing.phone, '•••• 4567');
  assert.equal(agency.body.agency.billing.verify, undefined, 'o hash do código não sai do servidor');
  assert.equal((await call('/api/workspaces', { who: 'nova' })).status, 200);
  assert.deepEqual(sent().at(-1), { number: PHONE, text: 'Pronto, sua conta da graao está confirmada.' });
  const taken = await call('/api/verify/start', { who: 'outra', body: { phone: PHONE } });
  assert.deepEqual([taken.status, taken.body.code], [409, 'PHONE_TAKEN']);
  const again = await call('/api/verify/start', { who: 'nova', body: { phone: '5531911112222' } });
  assert.equal(again.status, 409, 'agência já confirmada não gera outro código');
});

test('Mensagem de outro número não confirma', async t => {
  const { call, deliver, from, sent } = await boot(t);
  const { body } = await call('/api/verify/start', { who: 'nova', body: { phone: PHONE } });
  await deliver(from('5531999990000'), `Confirmar graao ${body.code}`);
  assert.deepEqual((await call('/api/verify/status', { who: 'nova' })).body, { status: 'refused', reason: 'other-phone' });
  assert.equal((await call('/api/workspaces', { who: 'nova' })).body.code, 'PHONE_REQUIRED');
  assert.deepEqual(sent().at(-1), { number: '5531999990000', text: 'Abra o WhatsApp no celular deste número e envie a mensagem de novo.' });
});

test('Duas agências, mesmo número, ao mesmo tempo: uma só confirma', async t => {
  const { call, deliver, from, sent } = await boot(t);
  const a = (await call('/api/verify/start', { who: 'nova', body: { phone: PHONE } })).body.code;
  const b = (await call('/api/verify/start', { who: 'outra', body: { phone: PHONE } })).body.code;
  await Promise.all([deliver(from(PHONE), `Confirmar graao ${a}`), deliver(from(PHONE), `Confirmar graao ${b}`)]);
  const statuses = [(await call('/api/verify/status', { who: 'nova' })).body, (await call('/api/verify/status', { who: 'outra' })).body];
  assert.equal(statuses.filter(s => s.status === 'verified').length, 1, JSON.stringify(statuses));
  assert.deepEqual(statuses.find(s => s.status !== 'verified'), { status: 'refused', reason: 'phone-taken' });
  assert.ok(sent().some(m => m.text === 'Este número já tem uma conta na graao.'));
});

test('Remetente só com LID é recusado com a resposta de abrir pelo celular', async t => {
  const { call, deliver, sent } = await boot(t);
  const { body } = await call('/api/verify/start', { who: 'nova', body: { phone: PHONE } });
  await deliver({ remoteJid: '123456789012345@lid' }, `Confirmar graao ${body.code}`);
  assert.deepEqual((await call('/api/verify/status', { who: 'nova' })).body, { status: 'waiting', reason: 'lid' });
  assert.deepEqual(sent().at(-1), { number: '123456789012345@lid', text: 'Abra o WhatsApp no celular deste número e envie a mensagem de novo.' });
  await deliver({ remoteJid: '123456789012345@lid', remoteJidAlt: `${PHONE}@s.whatsapp.net` }, `Confirmar graao ${body.code}`);
  assert.equal((await call('/api/verify/status', { who: 'nova' })).body.status, 'verified');
});

test('Mensagem comum não é guardada em lugar nenhum', async t => {
  const { store, call, deliver, from, sent } = await boot(t);
  await call('/api/agency', { who: 'nova' });
  const before = JSON.stringify(store.list());
  const agencyBefore = JSON.stringify(store.load('agency-nova'));
  assert.equal((await deliver(from('5531977776666'), 'Oi, tudo bem? Meu pedido chegou?')).status, 200);
  assert.equal((await deliver(from('5531977776666'), 'Confirmar graao ZZZZZZ')).status, 200);
  assert.equal(JSON.stringify(store.list()), before);
  assert.equal(JSON.stringify(store.load('agency-nova')), agencyBefore);
  assert.equal(sent().length, 0);
});

test('Segredo errado no caminho: 404', async t => {
  const { deliver, from } = await boot(t);
  assert.equal((await deliver(from(PHONE), 'Confirmar graao AAAAAA', 'outro-segredo')).status, 404);
});

test('Sexto código na mesma hora: 429', async t => {
  const { call } = await boot(t);
  for (let i = 0; i < 5; i++) assert.equal((await call('/api/verify/start', { who: 'nova', body: { phone: PHONE } })).status, 200);
  assert.equal((await call('/api/verify/start', { who: 'nova', body: { phone: PHONE } })).status, 429);
});

test('Mais de 20 códigos do mesmo IP na hora: 429', async t => {
  const { call } = await boot(t);
  for (let i = 0; i < 20; i++) {
    const ok = await call('/api/verify/start', { who: `p${Math.floor(i / 4)}`, ip: '203.0.113.9', body: { phone: PHONE } });
    assert.equal(ok.status, 200, `tentativa ${i + 1}`);
  }
  assert.equal((await call('/api/verify/start', { who: 'p9', ip: '203.0.113.9', body: { phone: PHONE } })).status, 429);
  assert.equal((await call('/api/verify/start', { who: 'p9', ip: '203.0.113.10', body: { phone: PHONE } })).status, 200);
});

test('Sem a linha de confirmação configurada: 503 VERIFY_OFF', async t => {
  const { call } = await boot(t, null);
  const off = await call('/api/verify/start', { who: 'nova', body: { phone: PHONE } });
  assert.deepEqual([off.status, off.body.code], [503, 'VERIFY_OFF']);
});

test('Celular inválido: 400', async t => {
  const { call } = await boot(t);
  assert.equal((await call('/api/verify/start', { who: 'nova', body: { phone: '31 3333-4444' } })).status, 400);
});

test('Linha de confirmação: só o dono da plataforma vê, conecta e libera um número', async t => {
  const { call, deliver, from } = await boot(t);
  assert.equal((await call('/api/verify/line', { who: 'nova' })).status, 403);
  const line = await call('/api/verify/line', { who: 'root-owner' });
  assert.equal(line.status, 200, JSON.stringify(line.body));
  assert.equal(line.body.configured, true);
  assert.equal(line.body.status, 'connected');
  assert.equal(line.body.instance, LINE.instance);
  const connected = await call('/api/verify/line', { who: 'root-owner', body: { action: 'connect' } });
  assert.equal(connected.status, 200, JSON.stringify(connected.body));
  const started = await call('/api/verify/start', { who: 'nova', body: { phone: PHONE } });
  await deliver(from(PHONE), `Confirmar graao ${started.body.code}`);
  assert.equal((await call('/api/verify/start', { who: 'outra', body: { phone: PHONE } })).body.code, 'PHONE_TAKEN');
  assert.equal((await call('/api/verify/release', { who: 'nova', body: { phone: PHONE } })).status, 403);
  const released = await call('/api/verify/release', { who: 'root-owner', body: { phone: PHONE } });
  assert.deepEqual(released.body, { released: true });
  assert.equal((await call('/api/verify/start', { who: 'outra', body: { phone: PHONE } })).status, 200, 'número liberado pode ser usado de novo');
  assert.deepEqual((await call('/api/verify/release', { who: 'root-owner', body: { phone: '5531900001111' } })).body, { released: false });
});

test('Linha de confirmação sem as variáveis diz quais faltam', async t => {
  const { call } = await boot(t, { number: '', instance: 'graao-verify', secret: '' });
  const line = await call('/api/verify/line', { who: 'root-owner' });
  assert.deepEqual(line.body, { configured: false, missing: ['GRAAO_VERIFY_WHATSAPP', 'GRAAO_VERIFY_SECRET'] });
});
