// Estado da agência perante a graao: celular confirmado, teste, plano pago, bloqueio.
// Puro: o servidor decide quando gravar; aqui só as regras.
export const TRIAL_DAYS = 15;
const DAY = 86400000;
const STATUSES = ['Unverified', 'Trial', 'Active', 'PastDue', 'Blocked', 'Exempt'];

/** Preenche os campos da cobrança sem mexer em plano, carteira e recarga. */
export function hydrateBilling(billing, { root = false } = {}) {
  const b = billing || {};
  b.status = root ? 'Exempt' : STATUSES.includes(b.status) ? b.status : 'Unverified';
  b.trialEndsAt ??= '';
  b.extended ??= false;
  b.subscription ??= null;
  b.failures ??= [];
  b.phone ??= '';
  b.phoneVerifiedAt ??= '';
  b.referredBy ??= null;
  b.blockedAt ??= '';
  b.blockedReason ??= '';
  b.verify ??= null;
  return b;
}

export function startTrial(billing, now) {
  billing.status = 'Trial';
  billing.trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * DAY).toISOString();
}

export function agencyAccess(billing, now) {
  const status = billing?.status || 'Unverified';
  const gate = status === 'Unverified' ? 'PHONE_REQUIRED' : status === 'Blocked' ? 'AGENCY_BLOCKED' : '';
  const end = status === 'Trial' && billing.trialEndsAt ? Date.parse(billing.trialEndsAt) : NaN;
  const daysLeft = Number.isFinite(end) ? Math.max(0, Math.ceil((end - now.getTime()) / DAY)) : null;
  return { status, canUse: !gate, daysLeft, gate, plan: billing?.plan || '' };
}

/** O que a tela da agência pode ver da própria cobrança (sem hash do código, sem celular inteiro). */
export function publicBilling(billing, now) {
  const { status, daysLeft, plan } = agencyAccess(billing, now);
  const sub = billing?.subscription;
  const phone = String(billing?.phone || '');
  return {
    status, trialEndsAt: billing?.trialEndsAt || '', extended: Boolean(billing?.extended), daysLeft, plan,
    phone: phone ? `•••• ${phone.slice(-4)}` : '',
    subscription: sub ? { status: sub.status || '', planId: sub.planId || '', nextChargeAt: sub.nextChargeAt || '', cancelAt: sub.cancelAt || '' } : null
  };
}
