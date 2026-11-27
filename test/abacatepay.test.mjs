import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { signBody } from '../abacatepay.mjs';
import { saveFiscal } from './helpers/fiscal.mjs';

const KEY_AGENCY = 'abc_dev_agencykey_0000aaaa';
const KEY_SHOP = 'abc_dev_shopkey_0000bbbb';

// A stand-in for api.abacatepay.com/v2 that records every call.
function fakeAbacate() {
  const calls = [], products = new Map();
  let seq = 0;
  const ok = data => new Response(JSON.stringify({ data, error: null, success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const bad = (status, error) => new Response(JSON.stringify({ data: null, error, success: false }), { status });
  async function request(url, init = {}) {
    const u = new URL(url), body = init.body ? JSON.parse(init.body) : null;
    const auth = init.headers?.Authorization || '';
    calls.push({ path: u.pathname, method: init.method || 'GET', body, auth });
    if (![KEY_AGENCY, KEY_SHOP].some(key => auth === `Bearer ${key}`)) return bad(401, 'Invalid or inactive API key');
    if (u.pathname === '/v2/stores/get') return ok({ id: 'store_1', name: auth.includes('agency') ? 'Agência Teste' : 'Loja Teste', balance: 0 });
    if (u.pathname === '/v2/products/create') {
      if (products.has(body.externalId)) return bad(400, 'Product with this externalId already exists');
      products.set(body.externalId, body);
      return ok({ id: `prod_${++seq}`, ...body, status: 'ACTIVE' });
    }
    if (u.pathname === '/v2/checkouts/create' || u.pathname === '/v2/subscriptions/create') {
      if (!products.has(body.items[0].id)) return bad(400, `Product ${body.items[0].id} not found`);
      const id = `bill_${++seq}`;
      return ok({ id, url: `https://app.abacatepay.com/pay/${id}`, status: 'PENDING', devMode: true, amount: products.get(body.items[0].id).price, externalId: body.externalId });
    }
    if (u.pathname === '/v2/subscriptions/cancel') return ok({ id: body.id, status: 'CANCELLED' });
    return bad(404, 'Not found');
  }
  return { request, calls, products };
}

async function start(t) {
  const gateway = fakeAbacate();
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false,
    openAISecret: 'abacate-test-seal-secret-32-chars!!', abacatePayRequest: gateway.request });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const send = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const hook = async (webhookUrl, secret, event, { sign = true } = {}) => {
    const raw = JSON.stringify(event);
    const r = await fetch(`${webhookUrl}?webhookSecret=${secret}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': sign ? signBody(raw) : 'x' }, body: raw });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return { base, send, hook, gateway, save: (key, data, id) => send('/api/action?workspace=demo', { type: 'save', key, id, data }),
    state: async () => (await send('/api/state?workspace=demo')).body.state };
}

test('A sub-account connects AbacatePay, charges an invoice and the webhook books the payment once', async t => {
  const { send, hook, gateway, save, state } = await start(t);
  assert.equal((await send('/api/abacatepay/workspace/charge?workspace=demo', { invoiceId: 'x' })).status, 404);
  await send('/api/action?workspace=demo', saveFiscal);
  assert.equal((await send('/api/abacatepay/workspace/connect?workspace=demo', { apiKey: 'abc_dev_wrong_key_0000' })).status, 400, 'a refused key is not saved');
  const connected = await send('/api/abacatepay/workspace/connect?workspace=demo', { apiKey: KEY_SHOP });
  assert.equal(connected.status, 200);
  assert.equal(connected.body.connected, true);
  assert.equal(connected.body.storeName, 'Loja Teste');
  assert.equal(connected.body.webhookStatus, 'manual', 'http origins cannot register a webhook');
  assert.equal(JSON.stringify(connected.body).includes(KEY_SHOP), false, 'the key never comes back');

  const contact = (await save('contacts', { name: 'Ana', email: 'ana@example.com' })).body.state.contacts.at(-1);
  const invoice = (await save('invoices', { title: 'Consultoria novembro', contactId: contact.id, value: 250, due: '2026-11-30', status: 'Draft' })).body.state.invoices.at(-1);
  const charged = await send('/api/abacatepay/workspace/charge?workspace=demo', { invoiceId: invoice.id });
  assert.equal(charged.status, 200);
  assert.match(charged.body.payment.url, /^https:\/\/app\.abacatepay\.com\/pay\/bill_/);
  assert.equal(gateway.products.get(`graao-inv-${invoice.id}-25000`).price, 25000, 'amounts go in cents');
  const again = await send('/api/abacatepay/workspace/charge?workspace=demo', { invoiceId: invoice.id });
  assert.equal(again.body.payment.checkoutId, charged.body.payment.checkoutId, 'a pending link is reused');
  let s = await state();
  assert.equal(s.invoices.find(row => row.id === invoice.id).status, 'Open');

  const paid = { id: 'log_1', event: 'checkout.completed', apiVersion: 2, devMode: true,
    data: { checkout: { id: charged.body.payment.checkoutId, frequency: 'ONE_TIME', status: 'PAID', paidAmount: Math.round(invoice.value * 100), receiptUrl: 'https://app.abacatepay.com/receipt/1' }, payerInformation: { method: 'PIX' } } };
  assert.equal((await hook(connected.body.webhookUrl, 'f'.repeat(48), paid)).status, 401, 'the secret proves the sender');
  assert.equal((await hook(connected.body.webhookUrl, connected.body.webhookSecret, paid, { sign: false })).status, 401, 'the signature proves the body');
  const delivered = await hook(connected.body.webhookUrl, connected.body.webhookSecret, paid);
  assert.equal(delivered.status, 200);
  assert.equal(delivered.body.handled, true);
  assert.equal((await hook(connected.body.webhookUrl, connected.body.webhookSecret, paid)).body.duplicate, true, 'retries are ignored');
  s = await state();
  const row = s.invoices.find(item => item.id === invoice.id);
  assert.equal(row.status, 'Paid');
  assert.equal(row.payment.receiptUrl, 'https://app.abacatepay.com/receipt/1');
  const txs = s.transactions.filter(tx => tx.invoiceId === invoice.id);
  assert.equal(txs.length, 1);
  assert.equal(txs[0].method, 'Pix');

  await hook(connected.body.webhookUrl, connected.body.webhookSecret, { ...paid, id: 'log_2', event: 'checkout.refunded' });
  assert.equal((await state()).transactions.find(tx => tx.invoiceId === invoice.id).status, 'Refunded');
  assert.equal((await send('/api/abacatepay/workspace/charge?workspace=demo', { invoiceId: invoice.id })).status, 409, 'paid invoices are not charged again');
});

test('A store set to AbacatePay sends the buyer to the payment page and the webhook pays the order', async t => {
  const { send, hook, save, state } = await start(t);
  await send('/api/action?workspace=demo', saveFiscal);
  const connected = (await send('/api/abacatepay/workspace/connect?workspace=demo', { apiKey: KEY_SHOP })).body;
  const mug = (await save('products', { name: 'Caneca', price: 59.9, kind: 'One time', active: true })).body.state.products.at(-1);
  const shop = (await save('stores', { name: 'Loja', active: true, items: [{ productId: mug.id }], shipping: { mode: 'none', pickup: true }, payment: { method: 'AbacatePay' } })).body.state.stores.at(-1);
  const order = await send(`/api/store/demo/${shop.id}/checkout`, { items: [{ productId: mug.id, qty: 1 }], name: 'Bia', email: 'bia@example.com', delivery: 'pickup' });
  assert.equal(order.status, 201);
  assert.match(order.body.payUrl, /^https:\/\/app\.abacatepay\.com\/pay\//);
  let s = await state();
  const placed = s.orders.at(-1);
  const checkoutId = s.invoices.find(item => item.id === placed.invoiceId).payment.checkoutId;
  await hook(connected.webhookUrl, connected.webhookSecret, { id: 'log_9', event: 'checkout.completed', data: { checkout: { id: checkoutId, frequency: 'ONE_TIME', paidAmount: Math.round(placed.total * 100) }, payerInformation: { method: 'CARD' } } });
  s = await state();
  assert.equal(s.orders.at(-1).status, 'Paid');
  assert.equal(s.invoices.find(item => item.id === placed.invoiceId).status, 'Paid');
  assert.equal(s.transactions.find(tx => tx.invoiceId === placed.invoiceId).method, 'Card');
});

test('The agency bills a SaaS plan as an AbacatePay subscription and follows its lifecycle', async t => {
  const { send, hook, gateway } = await start(t);
  const before = await send('/api/agency');
  assert.equal(before.body.agency.abacatepay.connected, false);
  assert.equal(before.body.agency.stripe, undefined);
  const plan = (await send('/api/agency/action', { type: 'save', key: 'plans', data: { name: 'Pro', price: 297, trialDays: 7 } })).body.result;
  assert.equal((await send('/api/abacatepay/agency/subscribe', { workspace: 'demo' })).status, 409, 'the agency account must be connected');
  await send('/api/agency/action', saveFiscal);
  const connected = (await send('/api/abacatepay/agency/connect', { apiKey: KEY_AGENCY })).body;
  assert.equal(connected.storeName, 'Agência Teste');
  assert.equal((await send('/api/abacatepay/agency/subscribe', { workspace: 'demo' })).status, 400, 'the sub-account needs a plan');
  await send('/api/agency/action', { type: 'account-meta', id: 'demo', data: { plan, status: 'Active' } });
  const subscribed = await send('/api/abacatepay/agency/subscribe', { workspace: 'demo' });
  assert.equal(subscribed.status, 200);
  const billing = subscribed.body.agency.accounts.demo.billing;
  assert.equal(billing.status, 'Pending');
  assert.match(billing.url, /^https:\/\/app\.abacatepay\.com\/pay\//);
  const product = gateway.products.get(`graao-plan-${plan}-29700-t7`);
  assert.deepEqual([product.cycle, product.trialDays, product.price], ['MONTHLY', 7, 29700]);
  assert.equal(subscribed.body.agency.abacatepay.connected, true);

  const event = (name, extra = {}) => ({ id: `log_${name}`, event: name, data: { subscription: { id: 'subs_1', status: 'ACTIVE', method: 'CARD' }, checkout: { id: billing.checkoutId }, payment: { id: 'card_1', amount: 29700 }, ...extra } });
  await hook(connected.webhookUrl, connected.webhookSecret, event('subscription.trial_started'));
  let meta = (await send('/api/agency')).body.agency.accounts.demo.billing;
  assert.deepEqual([meta.status, meta.subscriptionId], ['Trial', 'subs_1']);
  await hook(connected.webhookUrl, connected.webhookSecret, event('subscription.renewed'));
  meta = (await send('/api/agency')).body.agency.accounts.demo.billing;
  assert.equal(meta.status, 'Active');
  assert.equal(meta.payments.length, 1);
  assert.equal(meta.payments[0].amount, 297);
  assert.equal((await send('/api/abacatepay/agency/subscribe', { workspace: 'demo' })).status, 409, 'one live subscription per sub-account');

  const cancelled = await send('/api/abacatepay/agency/cancel', { workspace: 'demo' });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.agency.accounts.demo.billing.status, 'Cancelled');
  assert.deepEqual(gateway.calls.at(-1).body, { id: 'subs_1' });
  const raw = JSON.stringify((await send('/api/abacatepay/agency/status')).body);
  assert.equal(raw.includes(KEY_AGENCY), false);
});
