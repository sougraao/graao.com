// What the payment gateway's events change in a sub-account: the settlement, refund and dispute of a charge, with the
// ledger fact in the same write. Pure functions over the workspace state; abacatepay.mjs verifies and routes the events.
import { execute } from './model.mjs';
import { cents, gatewayOf, postFact, refundKey, transactionFact } from './ledger-model.mjs';

const stamp = () => new Date().toISOString();
const provider = 'abacatepay';

/** The sub-account's invoice behind a charge. The metadata is only trusted when it names this very sub-account. */
export function chargedInvoice(state, { checkoutId, metadata }, workspace) {
  const byCharge = checkoutId && state.invoices.find(item => item.payment?.checkoutId === checkoutId);
  if (byCharge) return byCharge;
  return metadata?.workspace === workspace && metadata.invoiceId ? state.invoices.find(item => item.id === metadata.invoiceId) || null : null;
}
const orphanSource = metadata => metadata?.invoiceId ? { type: 'invoice', id: String(metadata.invoiceId).slice(0, 60) } : { type: 'document', id: String(metadata?.documentId || '').slice(0, 60) };
// Money with no record behind it only counts when it is a charge of this sub-account's: an agency that uses the same
// gateway account for its plans and recharges also names the sub-account in the metadata.
const ours = (charge, workspace) => charge.metadata?.workspace === workspace && Boolean(charge.metadata.invoiceId || charge.metadata.documentId);

/** Which of a subscription's payments (oldest first) an event speaks of: the latest one when it happened. Without the moment, the last one, unless an earlier one was already returned and it could be that event again. */
export function paymentOf(list, moment, { at, returned }) {
  const time = Date.parse(moment || '');
  if (Number.isNaN(time)) return list.some(returned) && !returned(list.at(-1)) ? null : list.at(-1) || null;
  return list.findLast(item => Date.parse(at(item)) <= time) || list[0] || null;
}

// The invoice of a deleted contact, still in the trash: paid there, it comes back paid when the contact is restored.
const trashedInvoice = (state, { checkoutId, metadata }) => (state.contactTrash || []).flatMap(entry => entry.related?.invoices || [])
  .find(item => item.payment?.checkoutId === checkoutId || (metadata?.invoiceId && item.id === metadata.invoiceId));

/** Returns the invoice that was settled, or null when nothing was (unknown charge or amount below the invoice). */
export function settleCharge(state, charge, workspace) {
  const { checkoutId, method, receiptUrl, paidCents, feeCents, devMode } = charge, at = stamp();
  const sale = extra => postFact(state, { layer: 'account', kind: 'sale', key: `sale:${provider}:${checkoutId}`, amountCents: paidCents, feeCents, method, provider, ref: checkoutId, at, ...extra });
  const invoice = chargedInvoice(state, charge, workspace);
  if (!invoice) {
    // The invoice is gone, but the money is in: it counts, and nothing else changes.
    if (!ours(charge, workspace) || !checkoutId || !(paidCents > 0)) return null;
    if (!devMode) sale({ source: orphanSource(charge.metadata) });
    const trashed = trashedInvoice(state, charge);
    if (trashed && trashed.status !== 'Paid') {
      const whole = paidCents >= cents(trashed.value);
      Object.assign(trashed, { ...(whole && { status: 'Paid', paidMethod: method }), payment: { ...trashed.payment, provider, checkoutId, status: whole ? 'PAID' : 'MISMATCH', paidAt: at, method, receiptUrl: receiptUrl || '',
        receivedCents: paidCents, received: paidCents / 100, feeCents: feeCents ?? null, devMode: Boolean(devMode), noTransaction: true } });
    }
    return null;
  }
  const enough = paidCents !== null && paidCents >= cents(invoice.value);
  if (['REFUNDED', 'DISPUTED'].includes(invoice.payment?.status) && invoice.payment.checkoutId === checkoutId) return null;
  // A re-delivery that does not say the amount: what was already received stands.
  if (paidCents === null && invoice.payment?.checkoutId === checkoutId && invoice.payment.receivedCents > 0) return invoice.status === 'Paid' ? invoice : null;
  invoice.payment = { ...(invoice.payment || {}), provider, checkoutId: checkoutId || invoice.payment?.checkoutId || '', status: enough ? 'PAID' : 'MISMATCH', paidAt: invoice.payment?.paidAt || at, method,
    receiptUrl: receiptUrl || '', receivedCents: paidCents ?? 0, received: (paidCents ?? 0) / 100, feeCents: feeCents ?? null, devMode: Boolean(devMode || invoice.payment?.devMode) };
  if (!enough) {
    if (invoice.status === 'Paid') invoice.payment.status = 'PAID';
    if (paidCents > 0 && !invoice.payment.devMode) sale({ source: { type: 'invoice', id: invoice.id }, contactId: invoice.contactId });
    return null;
  }
  if (invoice.status === 'Paid') {
    // Already closed by hand and now paid online too: a second receipt of money, with its own fact.
    if (!invoice.payment.devMode) sale({ source: { type: 'invoice', id: invoice.id }, contactId: invoice.contactId });
    return invoice;
  }
  invoice.paidMethod = method;
  const order = state.orders?.find(item => item.invoiceId === invoice.id && item.status === 'Pending');
  if (order) {
    order.paidMethod = method;
    execute(state, { type: 'save', key: 'orders', id: order.id, data: { id: order.id, status: 'Paid', note: order.note, tracking: order.tracking } }, { workspace });
  } else {
    execute(state, { type: 'save', key: 'invoices', id: invoice.id, data: { title: invoice.title, contactId: invoice.contactId, value: invoice.value, due: invoice.due, status: 'Paid' } }, { workspace });
    // Pedido online que expirou sem pagamento e foi pago depois: a equipe é avisada (store-model.mjs, orderPaidLate).
    const expired = state.orders?.find(item => item.invoiceId === invoice.id && item.status === 'Cancelled' && item.expiredAt);
    if (expired) execute(state, { type: 'store-order-paid-late', id: expired.id }, { workspace });
  }
  return state.invoices.find(item => item.id === invoice.id);
}

/** A paid instalment of a contract that was deleted: the gateway keeps charging, so the money counts. */
export function settleOrphanInstalment(state, { metadata, paymentId, paidCents, feeCents, method, devMode }, workspace) {
  if (!ours({ metadata }, workspace) || !metadata.documentId || !paymentId || !(paidCents > 0) || devMode) return false;
  return postFact(state, { layer: 'account', kind: 'sale', key: `sale:${provider}:${paymentId}`, amountCents: paidCents, feeCents, method, provider, ref: paymentId, source: orphanSource({ documentId: metadata.documentId }), at: stamp() });
}

// The transactions a charge settled: those of its invoice, even a deleted one, or the payment of that subscription.
function chargedTransactions(state, invoice, { checkoutId, metadata, updatedAt }, workspace) {
  const all = state.transactions || [];
  if (invoice) return all.filter(row => row.invoiceId === invoice.id);
  const list = all.filter(row => checkoutId && row.gateway?.checkoutId === checkoutId).sort((a, b) => Date.parse(a.created) - Date.parse(b.created));
  if (list.length) return [paymentOf(list, updatedAt, { at: row => row.created, returned: row => row.status === 'Refunded' })].filter(Boolean);
  // Paid before the ledger, when the transaction did not keep its charge.
  return metadata?.workspace === workspace && metadata.invoiceId ? all.filter(row => row.invoiceId === metadata.invoiceId && !row.gateway && row.method !== 'Manual') : [];
}
// Was money booked without a transaction? A paid invoice or instalment always has one, unless it was deleted (and left the ledger with it).
const bookedAlone = (state, invoice, metadata) => invoice
  ? Boolean(invoice.payment?.noTransaction) || (invoice.payment?.status === 'DISPUTED' ? invoice.payment.beforeDispute : invoice.payment?.status) === 'MISMATCH'
  : !state.documents?.find(row => row.id === metadata?.documentId)?.payment?.subscription?.payments?.at(-1)?.id;
function moveTransaction(state, tx, status, options) {
  if (tx.status === status) return;
  const prior = { ...tx };
  tx.status = status;
  transactionFact(state, prior, tx, options);
}

function reversed(state, charge, workspace, kind) {
  const invoice = chargedInvoice(state, charge, workspace), txs = chargedTransactions(state, invoice, charge, workspace), at = stamp(), alone = !txs.length && bookedAlone(state, invoice, charge.metadata);
  if (invoice) invoice.payment = { ...invoice.payment, status: 'REFUNDED', refundedAt: invoice.payment?.refundedAt || at };
  for (const tx of txs) moveTransaction(state, tx, 'Refunded', { refundKind: kind });
  if (invoice && alone && invoice.payment.receivedCents > 0 && !invoice.payment.devMode) {
    postFact(state, { layer: 'account', kind, key: refundKey(invoice.payment, invoice.id), amountCents: -invoice.payment.receivedCents, method: invoice.payment.method || '', provider, ref: charge.checkoutId,
      source: { type: 'invoice', id: invoice.id }, contactId: invoice.contactId, at });
  }
  if (!invoice && alone && ours(charge, workspace) && charge.checkoutId && charge.paidCents > 0 && !charge.devMode) {
    // A subscription has many payments in one checkout: the moment tells its refunds apart.
    postFact(state, { layer: 'account', kind, key: `refund:${provider}:${charge.checkoutId}${charge.metadata.documentId && charge.updatedAt ? `:${charge.updatedAt}` : ''}`, amountCents: -charge.paidCents, method: charge.method, provider, ref: charge.checkoutId, source: orphanSource(charge.metadata), at });
  }
  return Boolean(invoice || txs.length);
}

export const refundCharge = (state, charge, workspace) => reversed(state, charge, workspace, 'refund');

/** checkout.disputed carries the outcome in the charge's status: UNDER_DISPUTE (opened), PAID (won) or REFUNDED (lost). */
export function disputeCharge(state, charge, workspace) {
  if (charge.status === 'REFUNDED' || charge.lost) return reversed(state, charge, workspace, 'dispute_lost');
  const invoice = chargedInvoice(state, charge, workspace), txs = chargedTransactions(state, invoice, charge, workspace), opened = charge.status === 'UNDER_DISPUTE';
  if ((!invoice && !txs.length) || (!opened && charge.status !== 'PAID')) return false;
  const payment = invoice?.payment || gatewayOf(state, txs[0] || {}), at = stamp();
  if (payment?.status === 'REFUNDED') return true;
  if (invoice) {
    if (opened) invoice.payment = { ...invoice.payment, status: 'DISPUTED', beforeDispute: invoice.payment.status === 'DISPUTED' ? invoice.payment.beforeDispute : invoice.payment.status, disputedAt: at };
    else invoice.payment = { ...invoice.payment, status: invoice.payment.beforeDispute || 'PAID' };
  }
  for (const tx of txs) if (tx.status === 'Succeeded' || tx.status === 'Disputed') moveTransaction(state, tx, opened ? 'Disputed' : 'Succeeded');
  if (!payment?.devMode && !charge.devMode) {
    postFact(state, { layer: 'account', kind: opened ? 'dispute_opened' : 'dispute_won', key: `${opened ? 'dispute' : 'dispute_won'}:${provider}:${payment?.paymentId || charge.checkoutId}`, amountCents: 0,
      method: payment?.method || charge.method, provider, ref: charge.checkoutId, source: invoice ? { type: 'invoice', id: invoice.id } : { type: 'transaction', id: txs[0].id }, contactId: invoice?.contactId || txs[0]?.contactId || '', at });
  }
  return true;
}
