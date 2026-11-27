import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { storeProduct, catalog } from '../ui/store-data.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const act = (s, type, id, data) => execute(s, { type, id, data });
const flow = (s, name, trigger) => save(s, 'workflows', { name, active: true, triggers: [trigger], steps: [{ type: 'add_tag', config: { tag: name } }] });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);

function shop() {
  const s = blank();
  const mug = save(s, 'products', { name: 'Caneca', price: 50, kind: 'One time', active: true });
  const cup = save(s, 'products', { name: 'Copo', price: 30, kind: 'One time', active: true });
  const storeId = save(s, 'stores', { name: 'Loja', active: true, items: [{ productId: mug }, { productId: cup }], shipping: { mode: 'none', pickup: true }, taxPercent: 0, payment: { method: 'Pix' } });
  const couponId = save(s, 'coupons', { name: 'Dez por cento', code: 'DEZ', kind: 'Percent', amount: 10, active: true });
  const bia = save(s, 'contacts', { name: 'Bia', email: 'bia@x.test', tags: [] });
  return { s, mug, cup, storeId, couponId, bia };
}

test('T.1 coupon applied: a known contact puts a valid coupon in the cart, once per coupon change', () => {
  const { s, mug, storeId, couponId, bia } = shop();
  const applied = flow(s, 'Cupom no carrinho', { type: 'coupon_applied', config: { couponId } });
  const cart = (email, coupon, session = 'cd'.repeat(16)) => act(s, 'store-cart', storeId, { session, name: 'Cliente', email, items: [{ productId: mug, qty: 2 }], delivery: 'pickup', coupon });
  cart('nova@x.test', 'dez', 'ab'.repeat(16));
  assert.equal(runsOf(s, applied).length, 0, 'an unknown buyer is not a contact yet');
  cart('bia@x.test', '');
  assert.equal(runsOf(s, applied).length, 0, 'no coupon yet');
  cart('bia@x.test', 'dez');
  cart('bia@x.test', 'dez');
  assert.deepEqual(runsOf(s, applied).map(run => run.contactId), [bia], 'the same coupon does not fire again');
  const run = runsOf(s, applied)[0];
  assert.equal(run.context.code, 'DEZ');
  assert.equal(Number(run.context.discount), 10);
  assert.equal(Number(run.context.total), 90);
  assert.throws(() => cart('bia@x.test', 'NAOEXISTE'), /Cupom inválido/);
});

test('T.1 product viewed: the contact comes from the cart session, once a day per product', () => {
  const { s, mug, cup, storeId, bia } = shop();
  const viewed = flow(s, 'Viu produto', { type: 'product_viewed', config: { storeId } });
  const onlyCup = flow(s, 'Viu o copo', { type: 'product_viewed', config: { productId: cup } });
  const session = 'ef'.repeat(16), view = (productId, sid = session) => act(s, 'store-view', storeId, { session: sid, productId });
  assert.deepEqual(view(mug), { tracked: false }, 'a session without a cart e-mail is anonymous');
  act(s, 'store-cart', storeId, { session, name: 'Bia', email: 'bia@x.test', items: [{ productId: mug, qty: 1 }], delivery: 'pickup' });
  assert.deepEqual(view(mug), { tracked: true });
  view(mug);
  view(cup);
  assert.deepEqual(runsOf(s, viewed).map(run => run.context.title), ['Caneca', 'Copo'], 'once a day per product');
  assert.deepEqual(runsOf(s, onlyCup).map(run => run.contactId), [bia]);
  assert.equal(Number(runsOf(s, viewed)[0].context.price), 50);
  assert.throws(() => view('00000000-0000-0000-0000-000000000000'), /Produto não encontrado/);
  assert.throws(() => view(mug, 'nao-e-sessao'), /Sessão inválida/);
});

test('T.1 product viewed: the product page reports the view only with an existing cart session', () => {
  const { s, mug, storeId } = shop();
  const shopRow = s.stores.find(row => row.id === storeId);
  const item = catalog(s, shopRow).find(row => row.id === mug);
  const html = storeProduct(s, shopRow, item, { base: `/loja/demo/${storeId}` });
  assert.ok(html.includes(`"/api/store/demo/${storeId}"+'/view'`), 'posts to the store view endpoint');
  assert.match(html, new RegExp(`graao-cart-session:'\\+"${storeId}"`));
});
