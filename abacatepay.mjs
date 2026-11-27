// AbacatePay: the payment gateway. The agency connects one account to bill its SaaS plans (subscriptions)
// and each sub-account may connect its own account to collect invoices and store orders (hosted checkout).
// API keys are sealed with GO_STORAGE_KEY in a row of their own; webhooks prove their origin with the
// per-connection secret in the URL and their integrity with the HMAC-SHA256 signature of the raw body.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { execute } from './model.mjs';
import { disputeCharge, paymentOf, refundCharge, settleCharge, settleOrphanInstalment } from './gateway-events.mjs';
import { postFact } from './ledger-model.mjs';
import { restoreFromBilling, suspendForBilling } from './agency-model.mjs';

export const ABACATEPAY_API = 'https://api.abacatepay.com/v2';
// Published by AbacatePay for every account: it signs the body, the secret proves the sender.
export const ABACATEPAY_SIGNATURE_KEY = 't9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9';
export const webhookEvents = ['checkout.completed', 'checkout.refunded', 'checkout.disputed', 'checkout.lost',
  'transparent.completed', 'transparent.refunded', 'transparent.disputed', 'transparent.lost',
  'subscription.completed', 'subscription.trial_started', 'subscription.renewed', 'subscription.cancelled', 'subscription.payment_failed', 'subscription.plan_changed'];
// Documented as events, but not in the list accepted when a webhook is created: dropped when the gateway refuses them.
const doubtfulEvents = ['subscription.payment_failed', 'subscription.plan_changed'];
const AGENCY_SCOPE = 'agency';
// The gateway gave up on the subscription by itself (the agency or the client cancelling is not this).
const suspendingReasons = new Set(['max_payment_retries_exceeded', 'dispute_opened', 'pix_automatic_authorization_refused']);
const methodNames = { PIX: 'Pix', CARD: 'Card', BOLETO: 'Boleto' };

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const rowId = agencyId => `abacatepay-${agencyId}`;
const stamp = () => new Date().toISOString();
const cents = value => Math.round(Number(value || 0) * 100);
const clean = (value, limit = 200) => String(value ?? '').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '').trim().slice(0, limit);

function deriveKey(secret) {
  const material = typeof secret === 'string' && secret.trim() ? secret.trim() : 'graao-local-dev-abacatepay-seal-key-do-not-use-without-env';
  return createHash('sha256').update(material).digest();
}
function seal(secret, aad, plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  cipher.setAAD(Buffer.from(aad));
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${enc.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}
function unseal(secret, aad, sealed) {
  const parts = String(sealed || '').split('.');
  if (parts.length !== 3) return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(parts[0], 'base64url'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[1], 'base64url')), decipher.final()]).toString('utf8');
  } catch { return ''; }
}
function safeEqual(a, b) {
  const left = Buffer.from(String(a || '')), right = Buffer.from(String(b || ''));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}
export function signBody(raw) {
  return createHmac('sha256', ABACATEPAY_SIGNATURE_KEY).update(raw).digest('base64');
}

const eventList = value => Array.isArray(value) ? value.filter(item => webhookEvents.includes(item)) : [];
const blankRow = () => ({ profile: { name: 'AbacatePay' }, agency: null, subaccounts: {}, seen: [] });
function normalizeConn(raw) {
  if (!raw || typeof raw !== 'object' || !raw.keySealed) return null;
  return {
    keySealed: String(raw.keySealed), last4: String(raw.last4 || '').slice(-4), storeName: String(raw.storeName || '').slice(0, 120),
    storeId: String(raw.storeId || '').slice(0, 80), devMode: Boolean(raw.devMode),
    webhookSecret: typeof raw.webhookSecret === 'string' && raw.webhookSecret.length >= 32 ? raw.webhookSecret : randomBytes(24).toString('hex'),
    webhookStatus: ['registered', 'manual', 'failed'].includes(raw.webhookStatus) ? raw.webhookStatus : 'manual',
    webhookEvents: eventList(raw.webhookEvents), webhookMissing: eventList(raw.webhookMissing),
    webhookError: String(raw.webhookError || '').slice(0, 240), connectedAt: String(raw.connectedAt || '')
  };
}
function normalizeRow(raw) {
  const row = { ...blankRow(), ...(raw && typeof raw === 'object' ? raw : {}) };
  row.profile = { name: 'AbacatePay' };
  row.agency = normalizeConn(row.agency);
  const subs = row.subaccounts && typeof row.subaccounts === 'object' ? row.subaccounts : {};
  row.subaccounts = Object.fromEntries(Object.entries(subs).map(([id, conn]) => [id, normalizeConn(conn)]).filter(([, conn]) => conn));
  row.seen = Array.isArray(row.seen) ? row.seen.filter(id => typeof id === 'string').slice(-300) : [];
  return row;
}
const connOf = (row, scope) => scope === AGENCY_SCOPE ? row.agency : row.subaccounts[scope] || null;
const aadOf = (agencyId, scope) => `${rowId(agencyId)}:${scope}`;
const webhookPath = (agencyId, scope) => `/api/abacatepay/webhook/${encodeURIComponent(agencyId)}/${encodeURIComponent(scope)}`;

function resolvePath(url) {
  let raw = url.searchParams.get('__path') || url.pathname;
  if (!raw.startsWith('/')) raw = '/' + raw;
  return raw.replace(/\/+/g, '/');
}
async function rawBody(req, limit = 512000) {
  let size = 0; const chunks = [];
  for await (const part of req) { size += part.length; if (size > limit) throw fail('Request is too large.', 413); chunks.push(part); }
  return Buffer.concat(chunks);
}

export function createAbacatePayHandler({ store, secret = process.env.GO_STORAGE_KEY, request = fetch, baseUrl = ABACATEPAY_API }) {
  async function loadRow(agencyId) {
    try { return normalizeRow(await store.load(rowId(agencyId))); }
    catch (err) { if (err?.status !== 404) throw err; }
    await store.insert(rowId(agencyId), blankRow());
    return normalizeRow(await store.load(rowId(agencyId)));
  }
  async function changeRow(agencyId, mutate) {
    await loadRow(agencyId);
    let updated;
    await store.change(rowId(agencyId), raw => {
      const row = normalizeRow(raw);
      const result = mutate(row);
      updated = normalizeRow(row);
      Object.assign(raw, updated);
      return result;
    });
    return updated;
  }

  async function call(apiKey, path, { method = 'GET', body, query } = {}) {
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    const init = { method, headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15000) };
    if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    let res;
    try { res = await request(`${baseUrl}${path}${qs}`, init); }
    catch (err) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw fail('O AbacatePay não respondeu a tempo.', 504);
      throw fail(`Não foi possível falar com o AbacatePay: ${err?.message || 'erro de rede'}.`, 502);
    }
    const text = await res.text().catch(() => '');
    let parsed = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { error: text.slice(0, 200) }; }
    if (!res.ok || parsed.success === false || parsed.error) {
      const message = typeof parsed.error === 'string' ? parsed.error : parsed.message || `HTTP ${res.status}`;
      throw Object.assign(fail(res.status === 401 ? `Chave do AbacatePay recusada: ${message}` : `AbacatePay: ${message}`, res.status === 401 ? 400 : 502), { gateway: message });
    }
    return parsed.data ?? parsed;
  }
  const keyOf = (row, agencyId, scope) => {
    const conn = connOf(row, scope);
    const key = conn && unseal(secret, aadOf(agencyId, scope), conn.keySealed);
    if (!key) throw fail(scope === AGENCY_SCOPE ? 'Conecte o AbacatePay da agência em Configurações → AbacatePay.' : 'Conecte o AbacatePay desta subconta em Configurações → Integrações.', 409);
    return key;
  };

  function view(row, agencyId, scope, publicOrigin) {
    const conn = connOf(row, scope);
    if (!conn) return { connected: false, webhookUrl: `${publicOrigin}${webhookPath(agencyId, scope)}`, events: webhookEvents };
    return {
      connected: true, storeName: conn.storeName, last4: conn.last4, devMode: conn.devMode, connectedAt: conn.connectedAt,
      webhookStatus: conn.webhookStatus, webhookError: conn.webhookError, events: webhookEvents, missingEvents: conn.webhookMissing,
      webhookOutdated: conn.webhookStatus === 'failed' || (conn.webhookStatus === 'registered' && webhookEvents.some(event => !conn.webhookEvents.includes(event) && !conn.webhookMissing.includes(event))),
      webhookUrl: `${publicOrigin}${webhookPath(agencyId, scope)}`, webhookSecret: conn.webhookSecret
    };
  }

  async function createWebhook(apiKey, scope, endpoint, webhookSecret) {
    const create = events => call(apiKey, '/webhooks/create', { method: 'POST', body: { name: `graao · ${scope === AGENCY_SCOPE ? 'agência' : 'subconta'}`, endpoint, secret: webhookSecret, events } });
    try { await create(webhookEvents); return { webhookEvents, webhookMissing: [] }; }
    catch (err) {
      if (!/event/i.test(err.gateway || '')) throw err;
      const accepted = webhookEvents.filter(event => !doubtfulEvents.includes(event));
      await create(accepted);
      return { webhookEvents: accepted, webhookMissing: doubtfulEvents };
    }
  }
  // AbacatePay webhooks cannot be edited: the new one is created (same address and secret) and only then the old ones go.
  async function refreshWebhook(agencyId, scope, publicOrigin) {
    const row = await loadRow(agencyId), conn = connOf(row, scope), apiKey = keyOf(row, agencyId, scope);
    const endpoint = `${publicOrigin}${webhookPath(agencyId, scope)}`;
    if (!/^https:\/\//i.test(endpoint)) throw fail('O endereço do app não é HTTPS público; cadastre o webhook no painel do AbacatePay.');
    const listed = await call(apiKey, '/webhooks/list', { query: { limit: 100 } });
    const before = (Array.isArray(listed) ? listed : []).filter(item => item?.endpoint === endpoint && item.id);
    const created = await createWebhook(apiKey, scope, endpoint, conn.webhookSecret);
    for (const item of before) await call(apiKey, '/webhooks/delete', { method: 'POST', body: { id: item.id } }).catch(err => console.warn(`AbacatePay: aviso antigo não removido (${err.gateway || err.message}).`));
    const updated = await changeRow(agencyId, current => { Object.assign(connOf(current, scope) || {}, created, { webhookStatus: 'registered', webhookError: '' }); });
    return view(updated, agencyId, scope, publicOrigin);
  }

  async function connect(agencyId, scope, apiKeyRaw, publicOrigin) {
    const apiKey = typeof apiKeyRaw === 'string' ? apiKeyRaw.trim() : '';
    if (apiKey.length < 12 || apiKey.length > 400 || /\s/.test(apiKey)) throw fail('Cole a chave de API v2 do AbacatePay (app.abacatepay.com → Chaves de API).');
    const shop = await call(apiKey, '/stores/get');
    const webhookSecret = randomBytes(24).toString('hex');
    const endpoint = `${publicOrigin}${webhookPath(agencyId, scope)}`;
    let webhookStatus = 'manual', webhookError = '', created = {};
    if (/^https:\/\//i.test(endpoint)) {
      try {
        created = await createWebhook(apiKey, scope, endpoint, webhookSecret);
        webhookStatus = 'registered';
      } catch (err) { webhookStatus = 'failed'; webhookError = err.gateway || err.message; }
    } else webhookError = 'O endereço do app não é HTTPS público; cadastre o webhook no painel do AbacatePay quando publicar.';
    const row = await changeRow(agencyId, current => {
      const conn = {
        keySealed: seal(secret, aadOf(agencyId, scope), apiKey), last4: apiKey.slice(-4), storeName: clean(shop?.name || shop?.store?.name, 120),
        storeId: clean(shop?.id || shop?.store?.id, 80), devMode: Boolean(shop?.devMode) || /test|dev/i.test(apiKey.slice(0, 12)),
        webhookSecret, webhookStatus, webhookError, ...created, connectedAt: stamp()
      };
      if (scope === AGENCY_SCOPE) current.agency = conn; else current.subaccounts[scope] = conn;
    });
    return view(row, agencyId, scope, publicOrigin);
  }
  async function disconnect(agencyId, scope, publicOrigin) {
    const row = await changeRow(agencyId, current => { if (scope === AGENCY_SCOPE) current.agency = null; else delete current.subaccounts[scope]; });
    return view(row, agencyId, scope, publicOrigin);
  }

  // A product per price: AbacatePay checkouts are built from catalog items, addressed by their externalId.
  async function ensureProduct(apiKey, product) {
    try { await call(apiKey, '/products/create', { method: 'POST', body: { currency: 'BRL', ...product } }); }
    catch (err) { if (!/exist|duplicad|already/i.test(err.gateway || '')) throw err; }
    return product.externalId;
  }

  async function createCheckout(agencyId, scope, { reference, name, amount, returnUrl, completionUrl, metadata }) {
    const row = await loadRow(agencyId);
    const apiKey = keyOf(row, agencyId, scope);
    const price = cents(amount);
    if (price < 100) throw fail('O AbacatePay cobra a partir de R$ 1,00.');
    const productId = await ensureProduct(apiKey, { externalId: `graao-${reference}-${price}`, name: clean(name, 120) || 'Cobrança', price });
    const body = { items: [{ id: productId, quantity: 1 }], externalId: `${reference}-${Date.now().toString(36)}`, methods: ['PIX', 'CARD'], metadata };
    if (/^https?:\/\//.test(returnUrl || '')) body.returnUrl = returnUrl;
    if (/^https?:\/\//.test(completionUrl || '')) body.completionUrl = completionUrl;
    const checkout = await call(apiKey, '/checkouts/create', { method: 'POST', body });
    if (!checkout?.id || !checkout?.url) throw fail('O AbacatePay não devolveu o link de pagamento.', 502);
    return { provider: 'abacatepay', checkoutId: String(checkout.id), url: String(checkout.url), status: String(checkout.status || 'PENDING'),
      amount: price / 100, devMode: Boolean(checkout.devMode), createdAt: stamp() };
  }

  // ---- Sub-account: invoices and store orders ----------------------------------------------
  async function chargeInvoice(agencyId, workspaceId, invoiceId, publicOrigin, { returnUrl, completionUrl } = {}) {
    const state = await store.load(workspaceId);
    const invoice = state.invoices?.find(item => item.id === invoiceId);
    if (!invoice) throw fail('Fatura não encontrada.', 404);
    if (invoice.status === 'Paid') throw fail('Esta fatura já está paga.', 409);
    if (invoice.status === 'Void') throw fail('Esta fatura foi cancelada.', 409);
    if (invoice.payment?.status === 'MISMATCH') throw fail('Esta fatura recebeu um pagamento com valor diferente. Dê baixa manual ou crie outra fatura.', 409);
    if (['REFUNDED', 'DISPUTED'].includes(invoice.payment?.status)) throw fail('O pagamento desta fatura foi devolvido ou contestado. Crie outra fatura para cobrar de novo.', 409);
    const reuse = invoice.payment?.provider === 'abacatepay' && invoice.payment.status === 'PENDING' && invoice.payment.amount === invoice.value;
    if (reuse) return invoice.payment;
    const back = `${publicOrigin}/app#payments`;
    const payment = await createCheckout(agencyId, workspaceId, {
      reference: `inv-${invoiceId}`, name: invoice.title, amount: invoice.value,
      returnUrl: returnUrl || back, completionUrl: completionUrl || back, metadata: { workspace: workspaceId, invoiceId }
    });
    await store.change(workspaceId, current => {
      const row = current.invoices.find(item => item.id === invoiceId);
      if (!row) throw fail('Fatura não encontrada.', 404);
      row.payment = payment;
      if (row.status === 'Draft') row.status = 'Open';
      row.updated = stamp();
    });
    return payment;
  }

  // ---- Agency: SaaS plans billed as subscriptions -------------------------------------------
  async function subscribe(agencyId, workspaceId, plan, publicOrigin, { trial: withTrial = true, retryPolicy = null } = {}) {
    const row = await loadRow(agencyId);
    const apiKey = keyOf(row, agencyId, AGENCY_SCOPE);
    if (!plan) throw fail('Atribua um plano SaaS a esta subconta antes de gerar a assinatura.');
    const price = cents(plan.price);
    if (price < 100) throw fail('O plano precisa custar pelo menos R$ 1,00.');
    const product = { externalId: `graao-plan-${plan.id}-${price}`, name: clean(plan.name, 120) || 'Plano', price, cycle: 'MONTHLY' };
    const trial = withTrial ? Math.round(Number(plan.trialDays) || 0) : 0;
    if (trial >= 1 && trial <= 90) { product.trialDays = trial; product.externalId += `-t${trial}`; }
    const productId = await ensureProduct(apiKey, product);
    const body = { items: [{ id: productId, quantity: 1 }], externalId: `saas-${workspaceId}-${Date.now().toString(36)}`, methods: ['PIX', 'CARD'],
      completionUrl: `${publicOrigin}/app`, returnUrl: `${publicOrigin}/app`, metadata: { workspace: workspaceId, planId: plan.id }, ...(retryPolicy && { retryPolicy }) };
    let checkout;
    try { checkout = await call(apiKey, '/subscriptions/create', { method: 'POST', body }); }
    catch (err) {
      if (!/PIX is not available/i.test(err.gateway || '')) throw err;
      checkout = await call(apiKey, '/subscriptions/create', { method: 'POST', body: { ...body, methods: ['CARD'] } });
    }
    if (!checkout?.id || !checkout?.url) throw fail('O AbacatePay não devolveu o link da assinatura.', 502);
    return { provider: 'abacatepay', checkoutId: String(checkout.id), url: String(checkout.url), status: 'Pending', planId: plan.id, planName: plan.name,
      amount: price / 100, subscriptionId: '', devMode: Boolean(checkout.devMode), createdAt: stamp(), updatedAt: stamp(), payments: [] };
  }
  // ---- Sub-account: monthly subscription of a signed document ----------------------------------
  async function subscribeWorkspace(agencyId, scope, { reference, name, amount, returnUrl, completionUrl, metadata }) {
    const row = await loadRow(agencyId);
    const apiKey = keyOf(row, agencyId, scope);
    const price = cents(amount);
    if (price < 100) throw fail('O AbacatePay cobra a partir de R$ 1,00.');
    const productId = await ensureProduct(apiKey, { externalId: `graao-${reference}-${price}-mensal`, name: clean(name, 120) || 'Assinatura', price, cycle: 'MONTHLY' });
    const body = { items: [{ id: productId, quantity: 1 }], externalId: `${reference}-${Date.now().toString(36)}`, methods: ['PIX', 'CARD'], metadata };
    if (/^https?:\/\//.test(returnUrl || '')) body.returnUrl = returnUrl;
    if (/^https?:\/\//.test(completionUrl || '')) body.completionUrl = completionUrl;
    let checkout;
    try { checkout = await call(apiKey, '/subscriptions/create', { method: 'POST', body }); }
    catch (err) {
      if (!/PIX is not available/i.test(err.gateway || '')) throw err;
      checkout = await call(apiKey, '/subscriptions/create', { method: 'POST', body: { ...body, methods: ['CARD'] } });
    }
    if (!checkout?.id || !checkout?.url) throw fail('O AbacatePay não devolveu o link da assinatura.', 502);
    return { provider: 'abacatepay', checkoutId: String(checkout.id), url: String(checkout.url), status: 'PENDING', amount: price / 100, devMode: Boolean(checkout.devMode), createdAt: stamp() };
  }
  async function cancelSubscription(agencyId, billing) {
    if (!billing?.subscriptionId) return;
    const row = await loadRow(agencyId);
    await call(keyOf(row, agencyId, AGENCY_SCOPE), '/subscriptions/cancel', { method: 'POST', body: { id: billing.subscriptionId } })
      .catch(err => { if (!/not found|not active/i.test(err.gateway || '')) throw err; });
  }
  function bookPlanPayment(agency, accountId, billing, event, data, devMode) {
    const pay = data?.payment || {}, id = String(pay.id || ''), paidCents = Math.round(Number(pay.paidAmount || pay.amount || 0));
    if (id && (billing.payments || []).some(item => item.id === id)) return;
    billing.payments = [...(billing.payments || []), { id, amount: paidCents / 100, at: stamp(), receiptUrl: String(pay.receiptUrl || ''), ...(devMode ? { test: true } : id && { booked: true }) }].slice(-24);
    if (!id) console.warn(`AbacatePay ${event}: pagamento de plano sem id (${accountId}); confira no painel do gateway.`);
    else if (paidCents > 0 && !devMode) postFact(agency, { layer: 'agency', kind: 'plan_payment', key: `plan:abacatepay:${id}`, workspaceId: accountId, amountCents: paidCents, feeCents: Number.isInteger(pay.platformFee) ? pay.platformFee : null,
      method: methodNames[data?.subscription?.method] || '', provider: 'abacatepay', ref: id, source: { type: 'plan', id: billing.planId || '' }, at: stamp(), detail: { plan: billing.planName || '' } });
  }
  // A subscription that was already replaced: its money still counts, the account and the new subscription do not change.
  function latePayment(agency, event, data, { checkoutId, subscriptionId, devMode }) {
    for (const [accountId, meta] of Object.entries(agency.accounts || {})) {
      const billing = meta?.billing?.previous?.find(item => (checkoutId && item.checkoutId === checkoutId) || (subscriptionId && item.subscriptionId === subscriptionId));
      if (!billing) continue;
      const paid = event === 'subscription.completed' || event === 'subscription.renewed', current = meta.billing;
      // The customer paid a link that had been replaced, and nothing else is being charged: what was paid is the subscription.
      if (paid && billing.status !== 'Cancelled' && ['Pending', 'Cancelled'].includes(current.status)) {
        const { previous, history: _history, failures: _failures, url: _url, ...kept } = current;
        meta.billing = { ...billing, previous: [...previous.filter(item => item !== billing), kept].slice(-12) };
        return subscriptionEvent(agency, event, data, { devMode });
      }
      if (paid) bookPlanPayment(agency, accountId, billing, event, data, devMode);
      // Two subscriptions being charged: the agency has to cancel one of them.
      const twice = paid && billing.status !== 'Cancelled' && ['Active', 'Trial', 'PastDue'].includes(current.status);
      return { accountId, effect: twice ? 'duplicate' : '', name: meta.name || accountId, plan: billing.planName || '', subscriptionId: subscriptionId || billing.subscriptionId || '' };
    }
    return { accountId: '', effect: '' };
  }
  // Applies a subscription event to the sub-account's billing record, with the payment in the ledger.
  function subscriptionEvent(agency, event, data, { devMode = false } = {}) {
    const checkoutId = String(data?.checkout?.id || ''), subscriptionId = String(data?.subscription?.id || '');
    const entry = Object.entries(agency.accounts || {}).find(([, meta]) => meta?.billing?.provider === 'abacatepay'
      && ((checkoutId && meta.billing.checkoutId === checkoutId) || (subscriptionId && meta.billing.subscriptionId === subscriptionId)));
    if (!entry) return latePayment(agency, event, data, { checkoutId, subscriptionId, devMode });
    const billing = entry[1].billing;
    let effect = '';
    if (subscriptionId) billing.subscriptionId = subscriptionId;
    const ended = event === 'subscription.cancelled' || data?.subscription?.status === 'CANCELLED';
    // Deliveries can come out of order: what is cancelled stays cancelled (a new subscription is another record).
    if (ended || billing.status === 'Cancelled') billing.status = 'Cancelled';
    else if (event === 'subscription.payment_failed') billing.status = 'PastDue';
    else if (event === 'subscription.trial_started') billing.status = 'Trial';
    else if (event !== 'subscription.plan_changed') billing.status = 'Active';
    billing.history = [...(billing.history || []), { at: stamp(), event, detail: clean(data?.subscription?.cancelledDueTo || data?.status || '', 200) }].slice(-100);
    billing.method = methodNames[data?.subscription?.method] || billing.method || '';
    if (event === 'subscription.completed' || event === 'subscription.renewed') {
      billing.lastPaidAt = stamp();
      effect = 'paid';
      bookPlanPayment(agency, entry[0], billing, event, data, devMode);
    }
    if (event === 'subscription.trial_started') effect = 'trial';
    if (event === 'subscription.plan_changed') effect = 'changed';
    let notify = 0;
    if (event === 'subscription.payment_failed' && billing.status === 'PastDue') {
      effect = 'past_due';
      const retryNumber = Math.max(1, Math.round(Number(data?.retryNumber) || (billing.failures?.length || 0) + 1));
      if (!(billing.failures || []).some(item => item.retryNumber === retryNumber)) {
        billing.failures = [...(billing.failures || []), { at: stamp(), retryNumber }].slice(-40);
        notify = retryNumber;
      }
    }
    if (['Active', 'Trial'].includes(billing.status) && effect === 'paid') billing.failures = [];
    if (['Active', 'Trial'].includes(billing.status) && ['paid', 'trial'].includes(effect)) restoreFromBilling(agency, entry[0]);
    if (event === 'subscription.cancelled') {
      effect = 'ended';
      if (agency.saas?.autoSuspend?.enabled && suspendingReasons.has(String(data?.subscription?.cancelledDueTo || ''))) suspendForBilling(agency, entry[0]);
    }
    if (billing.status === 'Cancelled') billing.cancelledAt ||= stamp();
    billing.updatedAt = stamp();
    return { accountId: entry[0], effect, notify, name: entry[1].name || entry[0], plan: billing.planName || '', subscriptionId: billing.subscriptionId };
  }
  // A refund or dispute of a plan's payment: the charge is the checkout of the subscription, so the moment tells which payment.
  function planReversal(agency, charge, event) {
    const [accountId, billing] = Object.entries(agency.accounts || {}).flatMap(([id, meta]) => meta?.billing ? [meta.billing, ...(meta.billing.previous || [])].map(item => [id, item]) : [])
      .find(([, item]) => charge.checkoutId && item.checkoutId === charge.checkoutId) || [];
    const payments = (billing?.payments || []).filter(item => item.id);
    const payment = paymentOf(payments, charge.updatedAt, { at: item => item.at, returned: item => Boolean(item.refunded) });
    if (payments.length && !payment) console.warn(`AbacatePay ${event}: sem data para saber de qual pagamento do plano (${accountId}); confira no painel do gateway.`);
    if (!payment) return '';
    const lost = charge.lost || (/\.disputed$/.test(event) && charge.status === 'REFUNDED'), back = lost || /\.refunded$/.test(event);
    const kind = lost ? 'dispute_lost' : back ? 'refund' : charge.status === 'UNDER_DISPUTE' ? 'dispute_opened' : charge.status === 'PAID' ? 'dispute_won' : '';
    if (!kind) return '';
    if (back && payment.refunded) return accountId;
    if (back) payment.refunded = true;
    if (!payment.test && !charge.devMode) postFact(agency, { layer: 'agency', kind, key: `${back ? 'refund' : kind}:abacatepay:${payment.id}`, workspaceId: accountId, amountCents: back ? -Math.round(payment.amount * 100) : 0,
      provider: 'abacatepay', ref: payment.id, source: { type: 'plan', id: billing.planId || '' }, at: stamp(), detail: { plan: billing.planName || '' } });
    return accountId;
  }

  // ---- Webhook ------------------------------------------------------------------------------
  const whole = value => Number.isInteger(value) ? value : null;
  // The charge of a checkout.* or transparent.* event. The amount paid comes from the event or, missing there, from the gateway.
  async function chargeOf(body, conn, agencyId, scope, row) {
    const data = body.data || {}, charge = data.checkout || data.transparent || {}, checkoutId = String(charge.id || '');
    let paidCents = whole(charge.paidAmount) ?? whole(charge.amount);
    if (paidCents === null && checkoutId && /.(completed|refunded)$/.test(body.event)) {
      const found = await call(keyOf(row, agencyId, scope), '/checkouts/get', { query: { id: checkoutId } }).catch(() => null);
      paidCents = whole(found?.paidAmount);
    }
    return { checkoutId, status: String(charge.status || ''), metadata: charge.metadata || null, frequency: charge.frequency, method: methodNames[data.payerInformation?.method] || 'Pix', receiptUrl: charge.receiptUrl || '',
      updatedAt: String(charge.updatedAt || ''), paidCents, feeCents: whole(charge.platformFee), devMode: Boolean(body.devMode || conn.devMode), lost: /.lost$/.test(body.event) };
  }
  // AbacatePay only repeats a delivery on 5xx, 408 or 429: a write conflict (409) would lose the event for good.
  async function handleWebhook(input) {
    try { return await receive(input); }
    catch (err) { if (err?.status === 409) throw fail('Conflito de gravação. Repita o envio.', 503); throw err; }
  }
  async function receive({ req, url, json, listWorkspaces, changeAgency, onSubscription, onInvoicePaid, onWalletTopup, onWalletReversal }) {
    const match = resolvePath(url).match(/^\/api\/abacatepay\/webhook\/([^/]+)\/([^/]+)$/);
    if (!match) throw fail('Webhook inválido.', 404);
    const agencyId = decodeURIComponent(match[1]), scope = decodeURIComponent(match[2]);
    const raw = await rawBody(req);
    let row;
    try { row = normalizeRow(await store.load(rowId(agencyId))); }
    catch (err) { if (err.status === 404) throw fail('Webhook não autorizado.', 401); throw err; }
    const conn = connOf(row, scope);
    const given = url.searchParams.get('webhookSecret') || req.headers['x-webhook-secret'] || '';
    if (!conn || !safeEqual(conn.webhookSecret, given)) throw fail('Webhook não autorizado.', 401);
    if (!safeEqual(signBody(raw), req.headers['x-webhook-signature'])) throw fail('Assinatura do webhook inválida.', 401);
    let body;
    try { body = JSON.parse(raw.toString('utf8')); } catch { throw fail('Invalid JSON request.', 400); }
    const event = String(body?.event || ''), data = body?.data || {}, deliveryId = String(body?.id || '');
    if (deliveryId && row.seen.includes(deliveryId)) return json({ ok: true, duplicate: true });

    let handled = false;
    if (scope === AGENCY_SCOPE) {
      if (event.startsWith('subscription.')) {
        let result = { accountId: '', effect: '' };
        await changeAgency(agencyId, agency => { result = subscriptionEvent(agency, event, data, { devMode: Boolean(body.devMode || conn.devMode) }); });
        handled = Boolean(result.accountId);
        if (handled && onSubscription) await onSubscription(agencyId, result, event, data).catch(err => console.error(`Assinatura (${result.accountId}): ${err.message}`));
      } else if ((event === 'checkout.completed' || event === 'transparent.completed') && onWalletTopup) {
        // A sub-account's wallet recharge, paid into the agency's AbacatePay account.
        const charge = await chargeOf(body, conn, agencyId, scope, row);
        if (charge.frequency !== 'SUBSCRIPTION' && charge.checkoutId) handled = Boolean(await onWalletTopup(agencyId, { ...charge, workspace: String(charge.metadata?.walletTopup || '') }));
      } else if (/^(checkout|transparent)\.(refunded|disputed|lost)$/.test(event)) {
        const charge = await chargeOf(body, conn, agencyId, scope, row);
        if (!charge.checkoutId) console.warn(`AbacatePay ${event} sem cobrança (${agencyId}).`);
        else if (charge.metadata?.walletTopup && onWalletReversal) handled = Boolean(await onWalletReversal(agencyId, { ...charge, event, workspace: String(charge.metadata.walletTopup) }));
        else await changeAgency(agencyId, agency => { handled = Boolean(planReversal(agency, charge, event)); });
      }
    } else {
      if (!(await listWorkspaces(agencyId)).some(w => w.id === scope)) throw fail('Subconta não encontrada.', 404);
      const charge = await chargeOf(body, conn, agencyId, scope, row), { checkoutId } = charge;
      if ((event === 'checkout.completed' && charge.frequency !== 'SUBSCRIPTION') || event === 'transparent.completed') {
        let invoice = null;
        await store.change(scope, state => { invoice = settleCharge(state, charge, scope); });
        handled = Boolean(invoice);
        if (invoice && onInvoicePaid) await onInvoicePaid(scope, structuredClone(invoice)).catch(() => {});
      } else if (event === 'checkout.refunded' || event === 'transparent.refunded') {
        await store.change(scope, state => { handled = refundCharge(state, charge, scope); });
      } else if (/^(checkout|transparent).(disputed|lost)$/.test(event)) {
        await store.change(scope, state => { handled = checkoutId ? disputeCharge(state, charge, scope) : false; });
        if (!checkoutId) console.warn(`AbacatePay ${event} sem cobrança (${scope}).`);
      } else if (event.startsWith('subscription.')) {
        const pay = data?.payment || {}, paid = /^subscription\.(completed|renewed)$/.test(event);
        await store.change(scope, state => {
          handled = execute(state, { type: 'document-subscription', data: { event, checkoutId, subscriptionId: String(data?.subscription?.id || ''), paymentId: String(pay.id || ''),
            feeCents: pay.platformFee, devMode: Boolean(body.devMode || conn.devMode),
            amount: Number(pay.paidAmount || pay.amount || 0) / 100, method: methodNames[data?.subscription?.method] || '', receiptUrl: String(pay.receiptUrl || '') } }, { workspace: scope });
          if (!handled && paid) settleOrphanInstalment(state, { metadata: charge.metadata, paymentId: String(pay.id || ''), paidCents: whole(pay.paidAmount) ?? whole(pay.amount), feeCents: whole(pay.platformFee),
            method: methodNames[data?.subscription?.method] || 'Card', devMode: charge.devMode }, scope);
        });
      }
    }
    if (deliveryId) await changeRow(agencyId, current => { current.seen = [...current.seen, deliveryId].slice(-300); });
    return json({ ok: true, handled, event });
  }

  return {
    status: async (agencyId, scope, publicOrigin) => view(await loadRow(agencyId), agencyId, scope, publicOrigin),
    connected: async (agencyId, scope) => Boolean(connOf(await loadRow(agencyId), scope)),
    connect, disconnect, refreshWebhook, createCheckout, chargeInvoice, subscribe, subscribeWorkspace, cancelSubscription, handleWebhook,
    AGENCY_SCOPE
  };
}
