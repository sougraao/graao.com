import test from 'node:test';
import assert from 'node:assert/strict';
import { createAbacatePayHandler, webhookEvents } from '../abacatepay.mjs';
import { createSqliteStore } from '../storage.mjs';
import { fakeAbacate, KEY_SHOP, startBilling } from './helpers/abacate.mjs';

const ORIGIN = 'https://app.graao.test';
function setup(t) {
  const store = createSqliteStore(':memory:'), gateway = fakeAbacate();
  t.after(() => store.close());
  const abacate = createAbacatePayHandler({ store, secret: 'seal-secret-with-more-than-32-chars!', request: gateway.request });
  return { store, gateway, abacate, hooks: () => gateway.webhooks.map(row => row.id),
    calls: () => gateway.calls.filter(call => call.path.startsWith('/v2/webhooks/')).map(call => call.path.split('/').pop()) };
}
const optional = ['subscription.payment_failed', 'subscription.plan_changed'];

test('Conexão nova pede os 14 avisos', async t => {
  const { gateway, abacate } = setup(t);
  const view = await abacate.connect('agency', 'demo', KEY_SHOP, ORIGIN);
  assert.equal(webhookEvents.length, 14);
  for (const event of [...optional, 'checkout.disputed', 'checkout.lost', 'transparent.disputed', 'transparent.lost']) assert.ok(webhookEvents.includes(event), event);
  assert.deepEqual(gateway.webhooks[0].events, webhookEvents);
  assert.deepEqual([view.webhookStatus, view.missingEvents, view.webhookOutdated], ['registered', [], false]);
});

test('Se o gateway recusar, cria sem os dois eventos duvidosos e diz quais faltam', async t => {
  const { gateway, abacate } = setup(t);
  gateway.state.refuseEvents = optional;
  const view = await abacate.connect('agency', 'demo', KEY_SHOP, ORIGIN);
  assert.equal(view.webhookStatus, 'registered');
  assert.deepEqual(view.missingEvents, optional);
  assert.equal(view.webhookOutdated, false, 'não fica pedindo o que o gateway não aceita');
  assert.equal(gateway.webhooks[0].events.length, 12);
});

async function old(t) {
  const c = setup(t);
  await c.abacate.connect('agency', 'demo', KEY_SHOP, ORIGIN);
  c.gateway.webhooks[0].events = ['checkout.completed'];
  c.store.change('abacatepay-agency', row => { delete row.subaccounts.demo.webhookEvents; delete row.subaccounts.demo.webhookMissing; });
  c.gateway.webhooks.push({ id: 'webh_other', endpoint: 'https://loja.example/hook', events: ['checkout.completed'] });
  c.secret = c.store.load('abacatepay-agency').subaccounts.demo.webhookSecret;
  c.gateway.calls.length = 0;
  return c;
}

test('Conta já conectada precisa atualizar; o novo aviso nasce antes de o antigo sair, com o mesmo segredo', async t => {
  const c = await old(t), [before] = c.hooks();
  assert.equal((await c.abacate.status('agency', 'demo', ORIGIN)).webhookOutdated, true);
  const view = await c.abacate.refreshWebhook('agency', 'demo', ORIGIN);
  assert.deepEqual(c.calls(), ['list', 'create', 'delete']);
  assert.deepEqual([view.webhookOutdated, view.webhookStatus], [false, 'registered']);
  assert.equal(c.hooks().includes(before), false);
  assert.equal(c.hooks().includes('webh_other'), true, 'o aviso de outro sistema fica');
  assert.equal(c.gateway.webhooks.find(row => row.id !== 'webh_other').secret, c.secret);
  assert.equal(c.store.load('abacatepay-agency').subaccounts.demo.webhookSecret, c.secret);
});

test('Se criar falhar, o antigo permanece e a tela mostra o erro', async t => {
  const c = await old(t), before = c.hooks();
  c.gateway.state.failCreateWebhook = true;
  await assert.rejects(c.abacate.refreshWebhook('agency', 'demo', ORIGIN), /Internal error/);
  assert.deepEqual(c.hooks(), before);
  assert.equal((await c.abacate.status('agency', 'demo', ORIGIN)).webhookOutdated, true);
});

test('Atualizar exige conexão e endereço público, e a rota exige permissão', async t => {
  const c = setup(t);
  await assert.rejects(c.abacate.refreshWebhook('agency', 'demo', ORIGIN), error => error.status === 409);
  await c.abacate.connect('agency', 'demo', KEY_SHOP, ORIGIN);
  await assert.rejects(c.abacate.refreshWebhook('agency', 'demo', 'http://localhost:1'), /HTTPS/);
  const b = await startBilling(t);
  await b.connect();
  assert.equal((await b.send('/api/abacatepay/workspace/refresh-webhook?workspace=demo', {})).status, 400, 'a rota existe e responde o motivo');
  const user = (await b.send('/api/agency/action', { type: 'save', key: 'users', data: { first: 'Lia', last: 'Melo', email: 'lia@example.test', role: 'Account User', accounts: ['demo'], permissionMode: 'restricted', permissions: ['contacts'] } })).body.result;
  assert.equal((await b.send('/api/abacatepay/workspace/refresh-webhook?workspace=demo', {}, { 'X-Go-User': user })).status, 403);
});
