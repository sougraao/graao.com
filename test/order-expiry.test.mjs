// Segurança (auditoria P1, 27/11/2026): um pedido não pago prendia estoque, cupom e cartão-presente para sempre. Agora
// o pedido pago online (AbacatePay) que passa de 60 minutos sem pagamento é cancelado pelo cron. Como a cobrança da
// AbacatePay continua aberta, um pagamento que chega depois marca o pedido e dispara "Pedido pago depois de expirar".
import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { settleCharge } from '../gateway-events.mjs';
import { ORDER_EXPIRY_MINUTES, expiredOrders } from '../store-model.mjs';
import { allTriggers } from '../ui/workflow-data.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);

function shop(method = 'AbacatePay') {
  const s = blank('Loja');
  const productId = save(s, 'products', { name: 'Caneca', price: 50, kind: 'One time', active: true });
  const storeId = save(s, 'stores', { name: 'Loja', active: true, items: [{ productId, stock: 3 }], shipping: { mode: 'none', pickup: true }, taxPercent: 0, payment: { method } });
  save(s, 'coupons', { name: 'Uma vez', code: 'UMAVEZ', kind: 'Percent', amount: 10, active: true, limit: 1 });
  const buy = () => {
    execute(s, { type: 'store-checkout', id: storeId, data: { name: 'Bia', email: 'bia@exemplo.com.br', items: [{ productId, qty: 2 }], coupon: 'UMAVEZ', delivery: 'pickup' } }, { workspace: 'loja' });
    return s.orders.at(-1);
  };
  const stock = () => s.stores.find(row => row.id === storeId).items[0].stock;
  const coupon = () => s.coupons.find(row => row.code === 'UMAVEZ');
  return { s, storeId, buy, stock, coupon };
}
const later = (order, minutes) => new Date(Date.parse(order.created) + minutes * 60000).toISOString();
const expire = (s, at) => execute(s, { type: 'store-orders-expire', data: { at } }, { workspace: 'loja' });

test('P1: an online order without payment is cancelled after 60 minutes and gives stock and coupon back', () => {
  const { s, buy, stock, coupon } = shop();
  const order = buy();
  assert.equal(order.online, true);
  assert.deepEqual([stock(), coupon().redemptions], [1, 1]);
  assert.equal(expire(s, later(order, ORDER_EXPIRY_MINUTES - 1)), 0, 'antes do prazo nada muda');
  assert.equal(s.orders.find(row => row.id === order.id).status, 'Pending');
  assert.equal(expire(s, later(order, ORDER_EXPIRY_MINUTES + 1)), 1);
  const after = s.orders.find(row => row.id === order.id);
  assert.equal(after.status, 'Cancelled');
  assert.ok(after.expiredAt);
  assert.deepEqual([stock(), coupon().redemptions], [3, 0], 'estoque e cupom voltam');
  assert.equal(s.invoices.find(row => row.id === order.invoiceId).status, 'Void');
  assert.equal(expire(s, later(order, ORDER_EXPIRY_MINUTES * 3)), 0, 'uma vez só');
});

test('P1: paid, manual-payment and older orders never expire', () => {
  const paid = shop();
  const order = paid.buy();
  save(paid.s, 'orders', { id: order.id, status: 'Paid', note: '', tracking: '' }, order.id);
  assert.deepEqual(expiredOrders(paid.s, Date.parse(later(order, 600))), []);

  for (const method of ['Pix', 'Bank transfer', 'Cash', 'Manual']) {
    const manual = shop(method);
    const row = manual.buy();
    assert.equal(row.online, false, method);
    assert.deepEqual(expiredOrders(manual.s, Date.parse(later(row, 600))), [], method);
  }

  // Pedidos de antes desta mudança não têm a marca "online" e esperam a equipe, como antes.
  const old = shop();
  const legacy = old.buy();
  delete legacy.online;
  assert.deepEqual(expiredOrders(old.s, Date.parse(later(legacy, 600))), []);
});

test('P1: a payment that arrives after the order expired flags the order and fires "Pedido pago depois de expirar"', () => {
  assert.ok(allTriggers.some(item => item.type === 'order_paid_late'), 'o gatilho aparece no editor de fluxos');
  const { s, storeId, buy } = shop();
  const workflowId = save(s, 'workflows', { name: 'Aviso', active: true, triggers: [{ type: 'order_paid_late', config: { storeId } }], steps: [{ type: 'add_note', config: { body: 'Pago depois de expirar' } }] });
  const order = buy();
  expire(s, later(order, ORDER_EXPIRY_MINUTES + 5));
  const invoice = s.invoices.find(row => row.id === order.invoiceId);
  settleCharge(s, { checkoutId: 'chk_tarde', metadata: { workspace: 'loja', invoiceId: invoice.id }, paidCents: Math.round(invoice.value * 100), method: 'Pix' }, 'loja');
  const after = s.orders.find(row => row.id === order.id);
  assert.equal(after.status, 'Cancelled', 'o pedido não reabre sozinho');
  assert.ok(after.paidLateAt);
  assert.match(after.note, /Pago depois de expirar/);
  assert.equal(s.invoices.find(row => row.id === invoice.id).status, 'Paid', 'o dinheiro recebido fica registrado');
  assert.equal(runsOf(s, workflowId).length, 1, 'o gatilho dispara');
  settleCharge(s, { checkoutId: 'chk_tarde', metadata: { workspace: 'loja', invoiceId: invoice.id }, paidCents: Math.round(invoice.value * 100), method: 'Pix' }, 'loja');
  assert.equal(runsOf(s, workflowId).length, 1, 'a mesma entrega repetida não avisa de novo');
});

test('P1: a payment on time still marks the order paid, as before', () => {
  const { s, buy } = shop();
  const order = buy();
  const invoice = s.invoices.find(row => row.id === order.invoiceId);
  settleCharge(s, { checkoutId: 'chk_ok', metadata: { workspace: 'loja', invoiceId: invoice.id }, paidCents: Math.round(invoice.value * 100), method: 'Pix' }, 'loja');
  assert.equal(s.orders.find(row => row.id === order.id).status, 'Paid');
  assert.deepEqual(expiredOrders(s, Date.parse(later(order, 600))), []);
});
