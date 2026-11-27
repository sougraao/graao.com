// Anúncios e atribuição of a sub-account. Public commands (forms, sites, store, webinars) run with the
// visitor's first and last touch (see the graao_at_ cookie in server.mjs): new contacts keep both, and each
// form, booking, order or webinar sign-up becomes a session event. Campaigns and daily numbers synced
// from Meta Ads and Google Ads live here too; their tokens stay in the separate `ads-<workspace>` row.
import { randomUUID } from 'node:crypto';
import { adNetworks, cleanTouch, directTouch, metaCtas, metaObjectives, paidChannels } from './ui/ads-data.js';

export const adCollections = ['adCampaigns', 'adStats', 'attributionEvents'];
export const adDefaults = () => ({ fees: { meta: 0, google: 0 }, model: 'last', connected: { meta: false, google: false }, lastSync: {}, syncErrors: {} });

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : typeof value === 'number' ? String(value) : '';
const num = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const networkIds = adNetworks.map(n => n[0]);

/** adSettings with every key present (older workspaces have none). */
export function adSettingsOf(s) {
  const base = adDefaults(), cur = s.adSettings || {};
  s.adSettings = { ...base, ...cur, fees: { ...base.fees, ...(cur.fees || {}) }, connected: { ...base.connected, ...(cur.connected || {}) }, lastSync: { ...(cur.lastSync || {}) }, syncErrors: { ...(cur.syncErrors || {}) } };
  return s.adSettings;
}

/** 'ad-settings': the management fee per network and the attribution model used by the reports. */
export function saveAdSettings(s, d) {
  const settings = adSettingsOf(s);
  if (d.fees) for (const id of networkIds) if (d.fees[id] !== undefined) settings.fees[id] = Math.round(num(d.fees[id], 0, 500) * 100) / 100;
  if (d.model !== undefined) settings.model = d.model === 'first' ? 'first' : 'last';
  return settings;
}

const sources = [['submissions', 'form_submission'], ['appointments', 'booking'], ['orders', 'order'], ['webinarRegistrations', 'webinar']];
/** Lengths of the collections whose new rows become session events, taken before a public command. */
export const attributionSnapshot = s => ({ contacts: new Set((s.contacts || []).map(c => c.id)), sizes: Object.fromEntries(sources.map(([key]) => [key, (s[key] || []).length])) });

/**
 * After a public command: new contacts get their first and last touch, and every new submission,
 * booking, order or webinar sign-up becomes a session event (refreshing the contact's last touch).
 * A lead from a paid channel fires the "Lead de anúncio" workflow trigger.
 */
export function recordAttribution(s, before, touches = {}, { emit } = {}) {
  const now = new Date().toISOString();
  const first = cleanTouch(touches.first), last = cleanTouch(touches.last) || first;
  const touch = last || directTouch(now);
  const events = s.attributionEvents ??= [];
  const event = (type, contactId, extra = {}) => events.push({ id: randomUUID(), created: now, type, contactId, channel: touch.channel, source: touch.source, medium: touch.medium, campaign: touch.campaign || touch.utmId,
    content: touch.content, term: touch.term, referrer: touch.referrer, landing: touch.landing, ...extra });
  const fired = new Set();
  const adLead = contact => {
    if (!emit || fired.has(contact.id) || !paidChannels.includes(touch.channel)) return;
    fired.add(contact.id);
    emit(s, 'ad_lead', { contactId: contact.id, network: touch.channel, campaign: touch.campaign || touch.utmId, source: touch.source });
  };
  for (const contact of s.contacts || []) {
    if (before.contacts.has(contact.id)) continue;
    contact.attribution = { first: first || touch, last: touch };
    event('lead', contact.id);
    adLead(contact);
  }
  for (const [key, type] of sources) {
    for (const row of (s[key] || []).slice(before.sizes[key] ?? 0)) {
      const contact = (s.contacts || []).find(c => c.id === row.contactId); if (!contact) continue;
      if (!contact.attribution) contact.attribution = { first: first || touch, last: touch };
      else if (last && Date.parse(last.at) >= Date.parse(contact.attribution.last?.at || 0)) contact.attribution.last = last;
      event(type, contact.id, type === 'order' ? { value: Number(row.total) || 0 } : {});
      if (type === 'form_submission') adLead(contact);
    }
  }
  if (events.length > 10000) events.splice(0, events.length - 10000);
}

/**
 * Stores what a sync brought from a network: the campaign list (replaced) and daily numbers for the
 * synced days (replaced day by day, so a re-sync corrects late conversions). Keeps 400 days.
 */
export function storeAdSync(s, network, { account = {}, campaigns = [], stats = [], from, to }) {
  if (!networkIds.includes(network)) fail('Rede de anúncios desconhecida.');
  const settings = adSettingsOf(s);
  s.adCampaigns = [...(s.adCampaigns || []).filter(c => c.network !== network), ...campaigns.slice(0, 1000).map(c => ({
    network, id: str(String(c.id), 40), name: str(c.name, 200) || `Campanha ${c.id}`, status: ['active', 'paused'].includes(c.status) ? c.status : 'other',
    rawStatus: str(c.rawStatus, 40), objective: str(c.objective, 60), budget: Number(c.budget) || 0, budgetType: c.budgetType === 'lifetime' ? 'lifetime' : c.budgetType === 'daily' ? 'daily' : '',
    budgetResource: str(c.budgetResource, 200), currency: str(account.currency, 8), accountId: str(account.id, 40) }))];
  const keep = (s.adStats || []).filter(r => r.network !== network || r.date < from || r.date > to);
  const fresh = stats.filter(r => /^\d{4}-\d\d-\d\d$/.test(r.date) && r.date >= from && r.date <= to).map(r => ({ network, campaignId: str(String(r.campaignId), 40), date: r.date,
    spend: Math.round((Number(r.spend) || 0) * 100) / 100, clicks: Math.round(Number(r.clicks) || 0), impressions: Math.round(Number(r.impressions) || 0), leads: Math.round(Number(r.leads) || 0) }));
  const oldest = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  s.adStats = [...keep, ...fresh].filter(r => r.date >= oldest);
  settings.lastSync[network] = new Date().toISOString();
  delete settings.syncErrors[network];
  return { campaigns: campaigns.length, days: fresh.length };
}

/** A campaign changed in the network (status or budget): mirror it until the next sync. */
export function patchAdCampaign(s, network, id, patch) {
  const row = (s.adCampaigns || []).find(c => c.network === network && c.id === String(id));
  if (row) Object.assign(row, patch);
  return row;
}

/** Marks the connection state shown without reading the secret row. */
export function markAdConnection(s, network, connected, error = '') {
  const settings = adSettingsOf(s);
  settings.connected[network] = Boolean(connected);
  if (error) settings.syncErrors[network] = str(error, 300); else delete settings.syncErrors[network];
  if (!connected) { s.adCampaigns = (s.adCampaigns || []).filter(c => c.network !== network); delete settings.lastSync[network]; }
}

/**
 * A Meta ad from the Ad Manager form, validated before anything is sent: name, objective, daily budget,
 * dates, audience (countries, ages, gender), text, headline, link, button and a Mídia Drive image.
 */
export function metaAdInput(s, d) {
  const name = str(d.name, 120) || fail('Dê um nome à campanha.');
  const objective = metaObjectives.some(o => o[0] === d.objective) ? d.objective : fail('Escolha o objetivo.');
  const dailyBudget = Number(d.dailyBudget);
  if (!(dailyBudget >= 6 && dailyBudget <= 100000)) fail('Informe um orçamento diário entre 6 e 100.000.');
  const start = d.start ? new Date(d.start) : new Date(Date.now() + 10 * 60_000);
  if (!Number.isFinite(+start) || +start < Date.now() - 5 * 60_000) fail('A data de início precisa ser agora ou no futuro.');
  const end = d.end ? new Date(d.end) : null;
  if (end && (!Number.isFinite(+end) || +end <= +start + 864e5)) fail('A data de término precisa ser pelo menos um dia depois do início.');
  const countries = [...new Set((Array.isArray(d.countries) ? d.countries : String(d.countries || 'BR').split(/[\s,]+/)).map(c => String(c).trim().toUpperCase()).filter(c => /^[A-Z]{2}$/.test(c)))].slice(0, 25);
  if (!countries.length) fail('Escolha ao menos um país (código de 2 letras, como BR).');
  const ageMin = Math.round(num(d.ageMin || 18, 18, 65)), ageMax = Math.round(num(d.ageMax || 65, ageMin, 65));
  const genders = d.gender === 'male' ? [1] : d.gender === 'female' ? [2] : [];
  const message = str(d.message, 2000) || fail('Escreva o texto do anúncio.');
  let link = '';
  try { const u = new URL(str(d.link, 2000)); if (['http:', 'https:'].includes(u.protocol) && !u.username && !u.password) link = u.href; } catch { /* reported below */ }
  if (!link) fail('Informe o link de destino (http ou https).');
  const cta = metaCtas.some(c => c[0] === d.cta) ? d.cta : 'LEARN_MORE';
  const file = (s.files || []).find(f => f.id === d.fileId) || fail('Escolha uma imagem do Mídia Drive.');
  const [, mime, b64] = String(file.data || '').match(/^data:(image\/(?:png|jpeg|jpg|gif));base64,(.*)$/) || [];
  if (!b64) fail('A imagem precisa ser PNG, JPG ou GIF.');
  const image = Buffer.from(b64, 'base64');
  if (image.length > 30_000_000) fail('A imagem passa de 30 MB.');
  return { ad: { name, objective, dailyBudget: Math.round(dailyBudget * 100) / 100, start: start.toISOString(), end: end ? end.toISOString() : '', countries, ageMin, ageMax, genders,
    message, headline: str(d.headline, 255), link, cta }, image, mime };
}
