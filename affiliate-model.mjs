// Affiliate Manager for the business's own affiliates: campaigns with commission rules, affiliates with a
// code and a private portal, attribution of new contacts (first touch, via the /r/ link cookie), commissions
// on paid invoices (pending → approved after a hold period → paid, reversed when the invoice is voided)
// and payouts recorded by the team.
import { createHash, randomBytes, randomUUID } from 'node:crypto';

export const affiliateCollections = ['affiliateCampaigns', 'affiliates', 'affiliateCommissions', 'affiliatePayouts'];
export const affiliateDefaults = () => ({ signup: false, autoApprove: false, terms: '', minPayout: 50 });

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const clip = (value, limit) => (typeof value === 'string' ? value.trim().slice(0, limit) : '');
const money = value => Math.round(Number(value || 0) * 100) / 100;
const num = (value, min, max, fallback) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
const now = () => new Date().toISOString();
export const portalTokenHash = token => /^[0-9a-f]{48}$/.test(token || '') ? createHash('sha256').update(token).digest('hex') : '';
const slug = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 16);

function destination(value) {
  const text = clip(value, 500);
  if (!text) fail('Informe para onde o link do afiliado leva.');
  if (/^\/[^/\\]/.test(text) || /^https:\/\/[^\s]+$/i.test(text)) return text;
  fail('O destino deve começar com https:// ou ser uma página desta plataforma (começando com /).');
}

export const affiliateFields = {
  affiliateCampaigns: (s, d) => {
    const type = d.commissionType === 'fixed' ? 'fixed' : 'percent';
    const value = money(d.commissionValue);
    if (!(value > 0) || (type === 'percent' && value > 90)) fail(type === 'percent' ? 'A comissão deve ficar entre 0,01% e 90%.' : 'Informe o valor fixo da comissão.');
    return {
      name: clip(d.name, 80) || fail('Dê um nome à campanha.'), description: clip(d.description, 400), destination: destination(d.destination),
      commissionType: type, commissionValue: value, recurring: d.recurring === 'all' ? 'all' : 'first',
      cookieDays: Math.round(num(d.cookieDays, 1, 365, 60)), holdDays: Math.round(num(d.holdDays, 0, 90, 7)),
      active: d.active !== false && d.active !== 'off'
    };
  },
  affiliates: (s, d) => {
    const email = clip(d.email, 160).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Informe o e-mail do afiliado.');
    if (s.affiliates.some(row => row.id !== d.id && row.email === email)) fail('Já existe um afiliado com este e-mail.', 409);
    const prior = s.affiliates.find(row => row.id === d.id);
    let code = slug(d.code) || prior?.code || slug(d.name) || 'parceiro';
    if (code.length < 3) code = `${code}parceiro`;
    if (s.affiliates.some(row => row.id !== d.id && row.code === code)) {
      if (d.code && slug(d.code) === code) fail('Este código já está em uso. Escolha outro.', 409);
      let n = 2; while (s.affiliates.some(row => row.id !== d.id && row.code === `${code}${n}`)) n++;
      code = `${code}${n}`;
    }
    const campaigns = (Array.isArray(d.campaignIds) ? d.campaignIds : []).filter(id => s.affiliateCampaigns.some(row => row.id === id));
    return {
      name: clip(d.name, 80) || fail('Informe o nome do afiliado.'), email, phone: clip(d.phone, 30), pix: clip(d.pix, 120), code,
      campaignIds: [...new Set(campaigns)], status: ['active', 'pending', 'paused'].includes(d.status) ? d.status : 'active', note: clip(d.note, 400)
    };
  }
};

export function affiliateSettings(s) {
  s.affiliateSettings = { ...affiliateDefaults(), ...(s.affiliateSettings || {}) };
  return s.affiliateSettings;
}

export function saveAffiliateSettings(s, d) {
  const settings = affiliateSettings(s);
  Object.assign(settings, { signup: d.signup === true || d.signup === 'on', autoApprove: d.autoApprove === true || d.autoApprove === 'on', terms: clip(d.terms, 4000), minPayout: money(num(d.minPayout, 0, 100000, 50)) });
  return settings;
}

// A fresh private link for the affiliate portal. Only the hash is kept.
export function issuePortalToken(s, affiliateId) {
  const affiliate = s.affiliates.find(row => row.id === affiliateId) || fail('Afiliado não encontrado.', 404);
  const token = randomBytes(24).toString('hex');
  affiliate.portalHash = portalTokenHash(token);
  affiliate.portalIssued = now();
  return { token, affiliateId: affiliate.id };
}

export function affiliateSignup(s, d, { emit }) {
  const settings = affiliateSettings(s);
  if (!settings.signup) fail('As inscrições de afiliados estão fechadas.', 403);
  if (clip(d.website, 200)) return { ok: true };
  if (d.terms !== true && settings.terms) fail('Aceite os termos do programa de afiliados.');
  const email = clip(d.email, 160).toLowerCase();
  if (s.affiliates.some(row => row.email === email)) fail('Este e-mail já está inscrito. Peça o link do seu painel à empresa.', 409);
  if (s.affiliates.length >= 2000) fail('O programa atingiu o limite de afiliados.', 409);
  const campaigns = s.affiliateCampaigns.filter(row => row.active).map(row => row.id);
  const details = affiliateFields.affiliates(s, { name: d.name, email, phone: d.phone, pix: d.pix, campaignIds: campaigns, status: settings.autoApprove ? 'active' : 'pending' });
  const affiliate = { id: randomUUID(), created: now(), clicks: 0, clicksByDay: {}, ...details, source: 'Inscrição' };
  s.affiliates.push(affiliate);
  emit(s, 'affiliate_created', { contactId: '', affiliateId: affiliate.id });
  return { ...issuePortalToken(s, affiliate.id), status: affiliate.status };
}

// The /r/ link: which campaign a click belongs to, counted per day.
export function affiliateClick(s, d) {
  const affiliate = s.affiliates.find(row => row.code === clip(d.code, 40) && row.status === 'active');
  if (!affiliate) return null;
  const campaigns = s.affiliateCampaigns.filter(row => row.active && affiliate.campaignIds.includes(row.id));
  const campaign = campaigns.find(row => row.id === d.campaignId) || campaigns[0];
  if (!campaign) return null;
  const day = now().slice(0, 10);
  affiliate.clicks = (affiliate.clicks || 0) + 1;
  affiliate.clicksByDay = Object.fromEntries(Object.entries({ ...(affiliate.clicksByDay || {}), [day]: (affiliate.clicksByDay?.[day] || 0) + 1 }).slice(-90));
  return { affiliateId: affiliate.id, campaignId: campaign.id, destination: campaign.destination, cookieDays: campaign.cookieDays };
}

// First touch: contacts created during a request that carried a valid referral cookie.
export function attributeContacts(s, before, ref, { emit }) {
  const affiliate = s.affiliates.find(row => row.id === ref?.affiliateId && row.status === 'active');
  const campaign = s.affiliateCampaigns.find(row => row.id === ref?.campaignId && row.active);
  if (!affiliate || !campaign || !affiliate.campaignIds.includes(campaign.id)) return 0;
  if (Date.now() - Number(ref.at || 0) > campaign.cookieDays * 864e5) return 0;
  let count = 0;
  for (const contact of s.contacts) {
    if (before.has(contact.id) || contact.affiliate) continue;
    contact.affiliate = { affiliateId: affiliate.id, campaignId: campaign.id, at: now() };
    count++;
    emit(s, 'affiliate_lead', { contactId: contact.id, affiliateId: affiliate.id });
  }
  return count;
}

const commissionOf = (campaign, base) => money(campaign.commissionType === 'fixed' ? Math.min(campaign.commissionValue, base) : base * campaign.commissionValue / 100);

// Runs after every command: commissions for newly paid invoices of referred contacts, approvals after
// the hold period and reversals of voided invoices. Old invoices are only marked as seen.
export function settleAffiliates(s, { emit }) {
  if (!s.affiliates?.length) return;
  const at = now();
  for (const invoice of s.invoices) {
    if (invoice.status !== 'Paid' || invoice.affiliateSeen) continue;
    invoice.affiliateSeen = at;
    const contact = s.contacts.find(row => row.id === invoice.contactId);
    const ref = contact?.affiliate;
    if (!ref || !(Number(invoice.value) > 0)) continue;
    const paidAt = invoice.paidAt || invoice.updated || at;
    if (String(paidAt) < String(ref.at)) continue;
    const campaign = s.affiliateCampaigns.find(row => row.id === ref.campaignId);
    const affiliate = s.affiliates.find(row => row.id === ref.affiliateId);
    if (!campaign || !affiliate || affiliate.status === 'paused') continue;
    if (campaign.recurring === 'first' && s.affiliateCommissions.some(row => row.contactId === contact.id && row.campaignId === campaign.id && row.status !== 'reversed')) continue;
    const value = commissionOf(campaign, Number(invoice.value));
    if (!(value > 0)) continue;
    const commission = { id: randomUUID(), created: at, affiliateId: affiliate.id, campaignId: campaign.id, contactId: contact.id, invoiceId: invoice.id,
      base: money(invoice.value), value, status: 'pending', approveAfter: new Date(Date.parse(at) + campaign.holdDays * 864e5).toISOString(), payoutId: '' };
    s.affiliateCommissions.unshift(commission);
    emit(s, 'affiliate_sale', { contactId: contact.id, affiliateId: affiliate.id, total: value });
  }
  for (const commission of s.affiliateCommissions) {
    if (!['pending', 'approved'].includes(commission.status)) continue;
    // Manual sales (from a workflow) have no invoice to void: only the hold period applies.
    const invoice = commission.invoiceId ? s.invoices.find(row => row.id === commission.invoiceId) : null;
    if (commission.invoiceId && (!invoice || invoice.status === 'Void' || invoice.payment?.status === 'REFUNDED')) { Object.assign(commission, { status: 'reversed', reversedAt: at }); continue; }
    if (commission.status === 'pending' && commission.approveAfter <= at && !commission.manual) Object.assign(commission, { status: 'approved', approvedAt: at });
  }
}

export function reviewCommission(s, id, d) {
  const commission = s.affiliateCommissions.find(row => row.id === id) || fail('Comissão não encontrada.', 404);
  if (commission.status === 'paid') fail('Esta comissão já foi paga.', 409);
  const status = ['approved', 'reversed', 'pending'].includes(d.status) ? d.status : fail('Escolha aprovar, segurar ou estornar.');
  Object.assign(commission, { status, manual: status === 'pending', [`${status}At`]: now() });
  return commission;
}

// A payout records money the team sent outside graao (PIX, transfer) for the approved commissions.
export function recordPayout(s, d, { add }) {
  const affiliate = s.affiliates.find(row => row.id === d.affiliateId) || fail('Afiliado não encontrado.', 404);
  const owed = s.affiliateCommissions.filter(row => row.affiliateId === affiliate.id && row.status === 'approved');
  if (!owed.length) fail('Este afiliado não tem comissões aprovadas para pagar.', 409);
  const amount = money(owed.reduce((sum, row) => sum + row.value, 0));
  const method = ['pix', 'transfer', 'other'].includes(d.method) ? d.method : 'pix';
  const payout = add(s, 'affiliatePayouts', { affiliateId: affiliate.id, amount, method, reference: clip(d.reference, 120), commissionIds: owed.map(row => row.id), paidAt: now() });
  for (const row of owed) Object.assign(row, { status: 'paid', payoutId: payout.id, paidAt: payout.paidAt });
  return payout;
}

export function addAffiliateFromContact(s, contact, campaignId, { emit }) {
  const email = String(contact.email || '').toLowerCase();
  if (!email) return 'erro: contato sem e-mail';
  const existing = s.affiliates.find(row => row.email === email);
  const campaign = s.affiliateCampaigns.find(row => row.id === campaignId && row.active);
  if (!campaign) return 'erro: campanha de afiliados inativa ou removida';
  if (existing) {
    if (!existing.campaignIds.includes(campaign.id)) {
      existing.campaignIds.push(campaign.id);
      emit(s, 'affiliate_campaign_enrolled', { contactId: contact.id, affiliateId: existing.id, campaignId: campaign.id, campaign: campaign.name });
    }
    return 'já era afiliado; campanha adicionada';
  }
  const details = affiliateFields.affiliates(s, { name: contact.name, email, phone: contact.phone, campaignIds: [campaign.id], status: 'active' });
  const affiliate = { id: randomUUID(), created: now(), clicks: 0, clicksByDay: {}, ...details, contactId: contact.id, source: 'Automação' };
  s.affiliates.push(affiliate);
  emit(s, 'affiliate_created', { contactId: contact.id, affiliateId: affiliate.id });
  emit(s, 'affiliate_campaign_enrolled', { contactId: contact.id, affiliateId: affiliate.id, campaignId: campaign.id, campaign: campaign.name });
  return `afiliado criado (código ${affiliate.code})`;
}

// The affiliate behind a contact: linked when created from the contact, otherwise by e-mail.
export const affiliateOfContact = (s, contact) => contact ? (s.affiliates || []).find(row => row.contactId === contact.id)
  || (contact.email && (s.affiliates || []).find(row => row.email === String(contact.email).toLowerCase())) || null : null;

// Campaigns added to an affiliate on the screen: "Afiliado entrou em campanha" for each new one.
export function affiliateCampaignChanges(s, prior, row, { emit }) {
  const before = new Set(prior?.campaignIds || []);
  const contact = s.contacts.find(item => item.id === row.contactId) || (row.email && s.contacts.find(item => String(item.email || '').toLowerCase() === row.email));
  for (const id of row.campaignIds || []) {
    if (before.has(id)) continue;
    const campaign = s.affiliateCampaigns.find(item => item.id === id);
    emit(s, 'affiliate_campaign_enrolled', { contactId: contact?.id || '', affiliateId: row.id, campaignId: id, campaign: campaign?.name || '' });
  }
}

// Workflow actions of the Affiliate Manager, run on the workflow's contact.
export function affiliateWorkflow(s, contact, action, config, { emit }) {
  const c = config || {};
  if (action === 'assign_affiliate_lead') {
    const affiliate = s.affiliates.find(row => row.id === c.affiliateId);
    if (!affiliate) return 'erro: afiliado removido';
    if (affiliate.status !== 'active') return 'erro: afiliado não está ativo';
    const campaign = c.campaignId ? s.affiliateCampaigns.find(row => row.id === c.campaignId && row.active)
      : s.affiliateCampaigns.find(row => row.active && affiliate.campaignIds.includes(row.id));
    if (!campaign) return 'erro: campanha de afiliados inativa ou removida';
    if (contact.affiliate?.affiliateId && c.replace !== 'yes') return contact.affiliate.affiliateId === affiliate.id ? 'já indicado por este afiliado' : 'já indicado por outro afiliado (mantido)';
    if (!affiliate.campaignIds.includes(campaign.id)) {
      affiliate.campaignIds.push(campaign.id);
      emit(s, 'affiliate_campaign_enrolled', { contactId: affiliateContactId(s, affiliate), affiliateId: affiliate.id, campaignId: campaign.id, campaign: campaign.name });
    }
    contact.affiliate = { affiliateId: affiliate.id, campaignId: campaign.id, at: now(), source: 'workflow' };
    emit(s, 'affiliate_lead', { contactId: contact.id, affiliateId: affiliate.id });
    return `indicado por ${affiliate.name} (${campaign.name})`;
  }
  if (action === 'affiliate_manual_sale') {
    const ref = contact.affiliate;
    const affiliate = ref && s.affiliates.find(row => row.id === ref.affiliateId);
    const campaign = ref && s.affiliateCampaigns.find(row => row.id === ref.campaignId);
    if (!affiliate || !campaign) return 'sem afiliado: o contato não foi indicado por ninguém';
    if (affiliate.status === 'paused') return 'erro: afiliado pausado';
    const base = money(c.amount);
    if (!(base > 0)) return 'erro: informe o valor da venda';
    const value = commissionOf(campaign, base);
    const at = now();
    const commission = { id: randomUUID(), created: at, affiliateId: affiliate.id, campaignId: campaign.id, contactId: contact.id, invoiceId: '', base, value, status: 'pending',
      approveAfter: new Date(Date.parse(at) + campaign.holdDays * 864e5).toISOString(), payoutId: '', source: 'workflow', note: clip(c.note, 200) };
    s.affiliateCommissions.unshift(commission);
    emit(s, 'affiliate_sale', { contactId: contact.id, affiliateId: affiliate.id, total: value });
    const brl = amount => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount).replace(/\s/g, ' ');
    return `venda de ${brl(base)} para ${affiliate.name}: comissão ${brl(value)}`;
  }
  const affiliate = affiliateOfContact(s, contact);
  if (!affiliate) return 'erro: o contato não é afiliado';
  if (action === 'update_affiliate') {
    if (!['active', 'paused', 'pending'].includes(c.status)) return 'erro: escolha a situação';
    affiliate.status = c.status;
    affiliate.updated = now();
    return `${affiliate.name}: ${{ active: 'ativo', paused: 'pausado', pending: 'aguardando aprovação' }[c.status]}`;
  }
  const campaign = s.affiliateCampaigns.find(row => row.id === c.campaignId);
  if (!campaign) return 'erro: campanha de afiliados removida';
  if (action === 'add_affiliate_campaign') {
    if (affiliate.campaignIds.includes(campaign.id)) return `já estava em ${campaign.name}`;
    affiliate.campaignIds.push(campaign.id);
    emit(s, 'affiliate_campaign_enrolled', { contactId: contact.id, affiliateId: affiliate.id, campaignId: campaign.id, campaign: campaign.name });
    return `entrou em ${campaign.name}`;
  }
  if (action === 'remove_affiliate_campaign') {
    if (!affiliate.campaignIds.includes(campaign.id)) return `não estava em ${campaign.name}`;
    affiliate.campaignIds = affiliate.campaignIds.filter(id => id !== campaign.id);
    return `saiu de ${campaign.name}`;
  }
  return 'ignorada';
}

const affiliateContactId = (s, affiliate) => affiliate.contactId || s.contacts.find(row => String(row.email || '').toLowerCase() === affiliate.email)?.id || '';

// What the affiliate sees in the portal: their own numbers, never customer data.
export function affiliatePortal(s, tokenHash) {
  const affiliate = s.affiliates.find(row => row.portalHash && row.portalHash === tokenHash);
  if (!affiliate) return null;
  const commissions = s.affiliateCommissions.filter(row => row.affiliateId === affiliate.id);
  const sum = status => money(commissions.filter(row => row.status === status).reduce((total, row) => total + row.value, 0));
  return {
    affiliate: { name: affiliate.name, code: affiliate.code, status: affiliate.status, pix: affiliate.pix ? `${affiliate.pix.slice(0, 3)}…${affiliate.pix.slice(-2)}` : '' },
    campaigns: s.affiliateCampaigns.filter(row => row.active && affiliate.campaignIds.includes(row.id)).map(row => ({ id: row.id, name: row.name, description: row.description,
      commission: row.commissionType === 'fixed' ? `R$ ${row.commissionValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} por venda` : `${row.commissionValue.toLocaleString('pt-BR')}% de cada venda`,
      recurring: row.recurring, cookieDays: row.cookieDays })),
    stats: { clicks: affiliate.clicks || 0, leads: s.contacts.filter(row => row.affiliate?.affiliateId === affiliate.id).length, sales: commissions.filter(row => row.status !== 'reversed').length,
      pending: sum('pending'), approved: sum('approved'), paid: sum('paid') },
    commissions: commissions.slice(0, 50).map(row => ({ date: row.created.slice(0, 10), value: row.value, status: row.status })),
    payouts: s.affiliatePayouts.filter(row => row.affiliateId === affiliate.id).slice(-20).reverse().map(row => ({ date: row.paidAt.slice(0, 10), amount: row.amount, method: row.method }))
  };
}
