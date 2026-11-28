// Stores: a storefront over the Payments products, the checkout that turns a cart into an order and an
// open invoice, and the order lifecycle (paid → transaction, cancelled → stock back and invoice void).
import { tagsChanged } from './contact-tags.mjs';
import { slugify } from './ui/blog-data.js';
import { giftCardFor, inventoryCheck, moveInventory, redeemGiftCard } from './catalog-model.mjs';

export const storeCollections = ['stores', 'orders'];
export const orderStatuses = ['Pending', 'Paid', 'Fulfilled', 'Cancelled'];

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const cents = value => Math.round(Number(value) * 100) / 100;
const money = (value, label) => { const n = cents(String(value ?? '').replace(',', '.')); if (!Number.isFinite(n) || n < 0 || n > 1e9) fail(`${label} precisa ser um valor válido.`); return n; };
const mail = value => { const v = str(value, 160).toLowerCase(); if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail('Use um e-mail válido.'); return v; };
const digits = value => String(value || '').replace(/\D/g, '');
const today = () => new Date().toISOString().slice(0, 10);
const tagList = value => [...new Set((Array.isArray(value) ? value : str(value, 400).split(',')).map(tag => str(tag, 48)).filter(Boolean))].slice(0, 20);

export const storeFields = {
  stores: (s, d) => {
    const seen = new Set();
    const items = (Array.isArray(d.items) ? d.items : []).slice(0, 200).map(raw => {
      const product = s.products.find(row => row.id === raw?.productId);
      if (!product) fail('Um dos produtos da loja não existe mais em Pagamentos.');
      if (product.kind !== 'One time') fail(`“${product.name}” é recorrente. A loja vende produtos de pagamento único.`);
      let slug = slugify(raw.slug || product.name) || 'produto';
      for (let n = 2; seen.has(slug); n++) slug = `${slugify(raw.slug || product.name) || 'produto'}-${n}`;
      seen.add(slug);
      const image = str(raw.imageUrl, 600);
      if (image && !/^https:\/\/[^\s"'<>]+$/i.test(image)) fail(`A foto de “${product.name}” precisa ser um endereço https://`);
      const stock = raw.stock === '' || raw.stock === null || raw.stock === undefined ? null : Math.round(Number(raw.stock));
      if (stock !== null && (!Number.isFinite(stock) || stock < 0 || stock > 1e6)) fail(`Use um estoque válido para “${product.name}” (vazio = sem controle).`);
      return { productId: product.id, slug, imageUrl: image, stock, category: str(raw.category, 40), hidden: Boolean(raw.hidden) };
    });
    const mode = ['none', 'flat', 'free-over'].includes(d.shipping?.mode) ? d.shipping.mode : 'none';
    const method = ['AbacatePay', 'Pix', 'Bank transfer', 'Cash', 'Manual'].includes(d.payment?.method) ? d.payment.method : 'Pix';
    const tax = Number(d.taxPercent || 0);
    if (!Number.isFinite(tax) || tax < 0 || tax > 50) fail('O imposto precisa ficar entre 0% e 50%.');
    return { name: str(d.name, 80) || fail('Dê um nome à loja.'), description: str(d.description, 400), active: Boolean(d.active),
      color: /^#[0-9a-f]{6}$/i.test(d.color || '') ? d.color.toLowerCase() : '#155eef', items,
      shipping: { mode, flat: mode === 'none' ? 0 : money(d.shipping?.flat ?? 0, 'O frete'), freeOver: mode === 'free-over' ? money(d.shipping?.freeOver ?? 0, 'O valor para frete grátis') : 0, pickup: d.shipping?.pickup !== false, pickupNote: str(d.shipping?.pickupNote, 200) },
      taxPercent: cents(tax), payment: { method, instructions: str(d.payment?.instructions, 800) }, requirePhone: Boolean(d.requirePhone), addTags: tagList(d.addTags),
      thanks: str(d.thanks, 400) };
  },
  // Orders come from the checkout; the team only moves their status.
  orders: (s, d) => {
    const prior = d.id && s.orders.find(row => row.id === d.id);
    if (!prior) fail('Pedidos são criados pela loja, no checkout.');
    const status = orderStatuses.includes(d.status) ? d.status : prior.status;
    if (prior.status === 'Cancelled' && status !== 'Cancelled') fail('Um pedido cancelado não pode ser reaberto.');
    return { status, note: str(d.note ?? prior.note, 1000), tracking: str(d.tracking ?? prior.tracking, 120) };
  }
};

export function storeBeforeDelete(s, key, id) {
  if (key === 'products' && s.stores.some(store => store.items.some(item => item.productId === id))) fail('Este produto está numa loja. Tire-o da loja antes de excluir.', 409);
  if (key === 'stores' && s.orders.some(order => order.storeId === id && order.status === 'Pending')) fail('Esta loja tem pedidos pendentes. Conclua ou cancele antes de excluir.', 409);
  if (key === 'orders') fail('Pedidos não podem ser excluídos. Cancele o pedido.', 409);
}

// Paid closes the invoice with a transaction; cancelled voids it and puts the stock back.
export function storeAfterSave(s, key, prior, row, add) {
  if (key !== 'orders' || !prior || prior.status === row.status) return;
  const invoice = s.invoices.find(item => item.id === row.invoiceId);
  const store = s.stores.find(item => item.id === row.storeId);
  if (row.status === 'Paid' || (row.status === 'Fulfilled' && prior.status === 'Pending')) {
    if (invoice && invoice.status !== 'Paid') invoice.status = 'Paid';
    if (!s.transactions.some(item => item.invoiceId === row.invoiceId && row.invoiceId)) add(s, 'transactions', { contactId: row.contactId, amount: row.total, date: today(), method: row.paidMethod || (store?.payment?.method === 'AbacatePay' ? 'Pix' : store?.payment?.method) || 'Manual', source: 'Invoice', status: 'Succeeded', note: `Pedido #${row.number}`, invoiceId: row.invoiceId || '' });
    row.paidAt ||= new Date().toISOString();
  }
  if (row.status === 'Fulfilled') row.fulfilledAt ||= new Date().toISOString();
  if (row.status === 'Cancelled') {
    if (invoice && invoice.status !== 'Paid') invoice.status = 'Void';
    for (const line of row.items) { const item = store?.items.find(entry => entry.productId === line.productId); if (item && item.stock !== null) item.stock += line.qty; }
    // O uso do cupom volta com o estoque: um pedido cancelado não gasta o limite do cupom.
    const coupon = row.coupon && s.coupons.find(item => item.code === row.coupon);
    if (coupon && coupon.redemptions > 0) coupon.redemptions -= 1;
    row.cancelledAt = new Date().toISOString();
  }
}

// Pedido pago online que fica sem pagamento é cancelado depois deste tempo, devolvendo estoque, cupom e cartão-presente.
export const ORDER_EXPIRY_MINUTES = 60;

/** Pedidos online pendentes há mais de ORDER_EXPIRY_MINUTES e com a fatura ainda sem pagamento. */
export function expiredOrders(s, at = Date.now()) {
  const limit = at - ORDER_EXPIRY_MINUTES * 60000;
  return (s.orders || []).filter(order => order.status === 'Pending' && order.online === true && Date.parse(order.created) <= limit
    && s.invoices.find(item => item.id === order.invoiceId)?.status !== 'Paid').map(order => order.id);
}

/**
 * O pagamento de um pedido que já expirou chegou (a cobrança da AbacatePay continua aberta depois da expiração): o pedido
 * fica cancelado, com o aviso na observação e o gatilho "Pedido pago depois de expirar", para a equipe enviar ou estornar.
 */
export function orderPaidLate(s, id, run) {
  const order = s.orders.find(row => row.id === id);
  if (!order || order.status !== 'Cancelled' || !order.expiredAt || order.paidLateAt) return false;
  order.paidLateAt = new Date().toISOString();
  order.note = str(`${order.note ? `${order.note}\n` : ''}Pago depois de expirar. Confira o estoque e envie o pedido ou estorne o pagamento.`, 1000);
  run(s, 'order_paid_late', { contactId: order.contactId, storeId: order.storeId, total: order.total });
  return true;
}

function couponFor(s, code, subtotal) {
  if (!code) return null;
  const coupon = s.coupons.find(item => item.code === str(code, 30).toUpperCase());
  const now = today();
  if (!coupon || !coupon.active || (coupon.start && now < coupon.start) || (coupon.end && now > coupon.end) || (coupon.limit && coupon.redemptions >= coupon.limit)) fail('Cupom inválido ou expirado.');
  const off = coupon.kind === 'Percent' ? cents(subtotal * coupon.amount / 100) : Math.min(subtotal, coupon.amount);
  return { coupon, off };
}

// The authoritative price of a cart: products, stock, coupon, shipping and tax are read from the workspace.
export function quoteOrder(s, store, input = {}) {
  const wanted = new Map();
  for (const raw of Array.isArray(input.items) ? input.items.slice(0, 50) : []) {
    const qty = Math.round(Number(raw?.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 99) fail('Use quantidades entre 1 e 99.');
    wanted.set(raw.productId, (wanted.get(raw.productId) || 0) + qty);
  }
  if (!wanted.size) fail('Seu carrinho está vazio.');
  const lines = [...wanted].map(([productId, qty]) => {
    const item = store.items.find(entry => entry.productId === productId && !entry.hidden);
    const product = item && s.products.find(row => row.id === productId && row.active !== false);
    if (!product) fail('Um dos produtos não está mais à venda. Atualize o carrinho.');
    if (item.stock !== null && qty > item.stock) fail(item.stock ? `Só há ${item.stock} unidade(s) de “${product.name}”.` : `“${product.name}” esgotou.`);
    inventoryCheck(product, qty);
    return { productId, name: product.name, price: product.price, qty, total: cents(product.price * qty) };
  });
  const subtotal = cents(lines.reduce((sum, line) => sum + line.total, 0));
  const found = couponFor(s, input.coupon, subtotal);
  const discount = found?.off || 0;
  const delivery = input.delivery === 'pickup' && store.shipping.pickup ? 'pickup' : store.shipping.mode === 'none' ? (store.shipping.pickup ? 'pickup' : 'none') : 'shipping';
  const after = cents(subtotal - discount);
  const shipping = delivery !== 'shipping' ? 0 : store.shipping.mode === 'free-over' && after >= store.shipping.freeOver ? 0 : store.shipping.flat;
  const tax = cents(after * (store.taxPercent || 0) / 100);
  const gross = cents(after + shipping + tax);
  // A gift card pays part or all of the total (Pagamentos → Cartões-presente).
  const card = giftCardFor(s, input.giftCard, gross);
  return { lines, subtotal, discount, coupon: found?.coupon.code || '', delivery, shipping, tax, giftCard: card?.card.code || '', giftCardAmount: card?.amount || 0,
    total: cents(gross - (card?.amount || 0)), coupon_: found?.coupon, giftCard_: card?.card };
}

export function storeCheckout(s, command, { add, run }) {
  const { id, data: d = {} } = command;
  const store = s.stores.find(item => item.id === id);
  if (!store?.active) fail('Esta loja não está aberta.', 404);
  const quote = quoteOrder(s, store, d);
  const name = str(d.name, 120) || fail('Informe seu nome.');
  const email = mail(d.email) || fail('Informe seu e-mail.');
  const phone = str(d.phone, 48);
  if (store.requirePhone && !phone) fail('Informe seu telefone.');
  if (phone && !/^[+()\d\s.-]{8,24}$/.test(phone)) fail('Use um telefone válido.');
  const address = quote.delivery === 'shipping' ? Object.fromEntries(['zip', 'street', 'number', 'complement', 'district', 'city', 'state'].map(key => [key, str(d.address?.[key], key === 'street' ? 160 : 80)])) : null;
  if (address && (!address.zip || !address.street || !address.number || !address.city || !address.state)) fail('Preencha o endereço de entrega: CEP, rua, número, cidade e estado.');
  let contact = s.contacts.find(item => item.email === email) || (phone && s.contacts.find(item => digits(item.phone) && digits(item.phone) === digits(phone)));
  if (!contact) {
    contact = add(s, 'contacts', { name, email, phone, tags: store.addTags, company: '', notes: '', custom: {} });
    run(s, 'Contact created', { contactId: contact.id });
  } else {
    if (!contact.phone && phone) contact.phone = phone;
    if (store.addTags.length) { const before = contact.tags || []; contact.tags = [...new Set([...before, ...store.addTags])].slice(0, 20); tagsChanged(s, contact, before, run); }
    contact.updated = new Date().toISOString();
  }
  for (const line of quote.lines) { const item = store.items.find(entry => entry.productId === line.productId); if (item.stock !== null) item.stock -= line.qty; }
  if (quote.coupon_) {
    const coupon = quote.coupon_;
    coupon.redemptions = (coupon.redemptions || 0) + 1;
    run(s, 'coupon_redeemed', { contactId: contact.id, couponId: coupon.id, code: coupon.code, title: coupon.name });
    if (coupon.limit && coupon.redemptions >= coupon.limit) run(s, 'coupon_limit_reached', { contactId: contact.id, couponId: coupon.id, code: coupon.code, title: coupon.name });
  }
  const number = s.orders.reduce((max, order) => Math.max(max, order.number || 0), 1000) + 1;
  const invoice = add(s, 'invoices', { title: `Pedido #${number} · ${store.name}`, contactId: contact.id, value: quote.total, due: today(), status: 'Open' });
  const { coupon_, giftCard_, ...totals } = quote;
  // online: pago pela AbacatePay. Só esses expiram sem pagamento (expiredOrders); Pix manual, transferência e dinheiro
  // esperam a baixa da equipe.
  const order = add(s, 'orders', { storeId: store.id, number, contactId: contact.id, name, email, phone, ...totals, items: quote.lines, address, note: str(d.note, 500), status: 'Pending', invoiceId: invoice.id, tracking: '',
    online: store.payment.method === 'AbacatePay' });
  if (s.orders.length > 20000) s.orders.splice(0, s.orders.length - 20000);
  moveInventory(s, quote.lines, -1, `Pedido #${number}`);
  redeemGiftCard(s, giftCard_, quote.giftCardAmount, order);
  run(s, 'order_submitted', { contactId: contact.id, storeId: store.id, total: quote.total });
  if (quote.total === 0 && quote.giftCardAmount > 0) {
    // Fully paid with a gift card: nothing left to charge.
    Object.assign(order, { status: 'Paid', paidAt: new Date().toISOString(), paidMethod: 'Cartão-presente' });
    invoice.status = 'Paid';
    run(s, 'order_paid', { contactId: contact.id, storeId: store.id, total: 0 });
  }
  return order.id;
}
