// Segurança (auditoria P1, 27/11/2026): o checkout da loja, o link de pagamento e o cálculo do carrinho (/quote) não
// tinham limite. Um script prendia o estoque, gastava os usos de um cupom, enchia o CRM, criava cobranças na AbacatePay
// e testava códigos de cupom em massa. E cancelar um pedido devolvia o estoque, mas não o uso do cupom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';

const fake = '00000000-0000-0000-0000-000000000000';

async function start(t) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const send = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const save = (key, data, id) => send('/api/action?workspace=demo', { type: 'save', key, id, data });
  const state = async () => (await send('/api/state?workspace=demo')).body.state;
  return { send, save, state };
}

const statuses = async (n, call) => { const out = []; for (let i = 0; i < n; i += 1) out.push((await call(i)).status); return out; };

test('P1: the 21st store checkout from one connection in 10 minutes gets 429, and the cart keeps working', async t => {
  const { send } = await start(t);
  const api = `/api/store/demo/${fake}`;
  const first = await statuses(20, () => send(`${api}/checkout`, { items: [{ productId: 'x', qty: 1 }] }));
  assert.ok(first.every(status => status !== 429), `as 20 primeiras não são barradas (${first})`);
  assert.equal((await send(`${api}/checkout`, { items: [] })).status, 429);
  assert.notEqual((await send(`${api}/cart`, { session: 'a'.repeat(32), items: [] })).status, 429, 'o carrinho tem contador próprio');
});

test('P1: the 31st quote from one connection gets 429, so coupon codes cannot be tried in bulk', async t => {
  const { send } = await start(t);
  const first = await statuses(30, i => send(`/api/store/demo/${fake}/quote`, { items: [{ productId: 'x', qty: 1 }], coupon: `TESTE${i}` }));
  assert.ok(first.every(status => status !== 429), `as 30 primeiras não são barradas (${first})`);
  assert.equal((await send(`/api/store/demo/${fake}/quote`, { items: [], coupon: 'VIP50' })).status, 429);
});

test('P1: the 21st payment-link purchase from one connection gets 429', async t => {
  const { send } = await start(t);
  const first = await statuses(20, () => send(`/api/pagar/demo/${fake}`, { name: 'Ana', email: 'ana@exemplo.com' }));
  assert.ok(first.every(status => status !== 429), `as 20 primeiras não são barradas (${first})`);
  assert.equal((await send(`/api/pagar/demo/${fake}`, { name: 'Ana', email: 'ana@exemplo.com' })).status, 429);
});

test('P1: cancelling an order gives the coupon use back', async t => {
  const { send, save, state } = await start(t);
  const mug = (await save('products', { name: 'Caneca', price: 50, kind: 'One time', active: true })).body.state.products.at(-1);
  const shop = (await save('stores', { name: 'Loja', active: true, items: [{ productId: mug.id, stock: 5 }], shipping: { mode: 'none', pickup: true }, taxPercent: 0, payment: { method: 'Pix', instructions: 'Chave Pix' } })).body.state.stores.at(-1);
  await save('coupons', { name: 'Uma vez', code: 'UMAVEZ', kind: 'Percent', amount: 10, active: true, limit: 1 });
  const api = `/api/store/demo/${shop.id}`;
  const buy = { items: [{ productId: mug.id, qty: 1 }], coupon: 'UMAVEZ', delivery: 'pickup', name: 'Ana', email: 'ana@exemplo.com' };
  assert.equal((await send(`${api}/checkout`, buy)).status, 201);
  let s = await state();
  assert.equal(s.coupons.find(row => row.code === 'UMAVEZ').redemptions, 1);
  assert.equal((await send(`${api}/quote`, buy)).status, 400, 'limite do cupom atingido');

  const order = s.orders.at(-1);
  await save('orders', { id: order.id, status: 'Cancelled' }, order.id);
  s = await state();
  assert.equal(s.orders.find(row => row.id === order.id).status, 'Cancelled');
  assert.equal(s.coupons.find(row => row.code === 'UMAVEZ').redemptions, 0, 'o uso do cupom volta');
  assert.equal(s.stores.find(row => row.id === shop.id).items[0].stock, 5, 'o estoque volta, como antes');
  assert.equal((await send(`${api}/quote`, buy)).status, 200, 'o cupom vale de novo');
  // Cancelar de novo (salvar o mesmo status) não devolve duas vezes.
  await save('orders', { id: order.id, status: 'Cancelled', note: 'conferido' }, order.id);
  assert.equal((await state()).coupons.find(row => row.code === 'UMAVEZ').redemptions, 0);
});
