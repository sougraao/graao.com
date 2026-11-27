import { AUDIT_IN_DOCUMENT } from './agency-audit.mjs';
import { usageSummary } from './ui/ai-data.js';
import { sanitizeFiscal } from './tax-id.mjs';
import { desktopDefaults, publishDesktop, saveDesktop } from './agency-desktop.mjs';
import { mobileDefaults, mobileOf, publishMobile, saveMobileLook, saveMobileStore } from './agency-mobile.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { isAssetUrl } from './asset-store.mjs';
import { defaults, metrics, uid, now } from './model.mjs';
import { hydrateProspecting } from './prospecting-model.mjs';
import { hydrateBilling } from './agency-billing-model.mjs';
import { agentTemplate } from './agent-model.mjs';
import { sanitizePresentation } from './presentation-model.mjs';
import { isDeck, sanitizeDeck, applyOps as applyDeckOps, LIMITS as DECK_LIMITS } from './ui/deck-model.js';
import { pranchetaFileRecord, createCanonicalTemplates, checkPranchetaSave, applyPranchetaSave, isThumbnailOnlySave } from './prancheta-model.mjs';
import { walletKeys, walletProducts, walletSummary } from './wallet-model.mjs';
import { labCatalog, labModes } from './ui/labs-data.js';
import { whiteLabelHost } from './white-label.mjs';
import { applyDomainStatus, normalizeLocalPart } from './email-domain.mjs';
import { apiScopes,
  accountStatuses, affiliateRate, agencyLevel, agencyPlans, addOns, collections, integrationCatalog,
  resellProducts, snapshotAssets, subAccountModules, systemEmailKeys,
  appScopes, maxMarkup, rebillProducts, subFeatures, workflowBuilders
} from './ui/agency-data.js';

export const AGENCY_ID = 'agency';
const platformLanguage = 'Português (Brasil)';
const platformBrand = 'graao';
// Paleta oficial da graao (2026-11-27): verde #5DD62C, verde-escuro #337418.
const defaultPrimary = '#5dd62c';
const defaultSecondary = '#337418';
const defaultAccent = '#5dd62c';
// O padrão anterior (rosa, lilás e azul): quem nunca trocou as cores passa para a paleta nova.
const previousDefault = { primary: '#ff4f9a', secondary: '#c4a7ff', accent: '#6bc9ff' };
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : typeof value === 'number' ? String(value).slice(0, limit) : '';
const req = (value, label, limit) => str(value, limit) || fail(`${label} is required.`);
const one = (value, options, label) => options.includes(value) ? value : fail(`Choose a valid ${label}.`);
const num = (value, label, max = 1e9) => {
  if (value === '' || value === undefined || value === null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) fail(`Enter a valid ${label.toLowerCase()}.`);
  return Math.round(n * 100) / 100;
};
const email = (value, label = 'email address') => {
  const v = str(value).toLowerCase();
  if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail(`Enter a valid ${label}.`);
  return v;
};
const url = (value, label) => {
  const v = str(value, 2000);
  if (!v) return '';
  try { const u = new URL(v); if (!['http:', 'https:'].includes(u.protocol)) throw Error(); return u.href; }
  catch { return fail(`${label} must be an http or https address.`); }
};
const color = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : fail('Choose a valid color.');
const image = value => {
  if (!value) return '';
  // Imagem já guardada fora do documento (asset-store.mjs): o formulário reenvia o endereço.
  if (isAssetUrl(value)) return value;
  if (typeof value !== 'string' || value.length > 400000 || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(value)) fail('Choose a PNG, JPEG, WebP or GIF image under 300 KB.');
  return value;
};
export const hash = text => createHash('sha256').update(text).digest('hex');

export function blankAgency() {
  return {
    profile: { name: 'Agency', first: 'Agency', last: 'Owner', email: '', phone: '', language: platformLanguage },
    company: { name: 'My Agency', brand: platformBrand, domain: '', website: '', phone: '', address: '', primary: defaultPrimary, secondary: defaultSecondary, accent: defaultAccent, logo: '', timezone: 'America/Sao_Paulo', currency: defaults.profile.currency },
    fiscal: null, ledgerOutbox: [],
    accounts: {}, plans: [], snapshots: [], snapshotLoads: [], ghlImports: [], prospects: [], partners: [], ideas: [], menuLinks: [], announcements: [],
    users: [], referrals: [], addonRequests: [], apiKeys: [], privateIntegrations: [], mcpGrants: [], audit: [], brandGroups: [], presentations: [], pranchetaFiles: [],
    reselling: Object.fromEntries(resellProducts.map(p => [p.key, { price: p.base, disabled: [] }])),
    affiliate: { accepted: false, steps: {}, code: '', payout: { method: 'PayPal', email: '' }, payments: [] },
    learning: { completed: [] },
    mobileApp: mobileDefaults(),
    desktopApp: desktopDefaults(),
    integrations: {},
    billing: hydrateBilling({ plan: 'Starter', wallet: [], autoRecharge: { enabled: false, threshold: 10, amount: 25 } }),
    systemEmails: Object.fromEntries(systemEmailKeys.map(([key, , subject, body]) => [key, { subject, body }])),
    labs: Object.fromEntries(labCatalog.map(([key]) => [key, 'off'])),
    aiDefaults: { limit: 0, alertAt: 0.8, enabled: true },
    compliance: { retentionDays: 365, consent: 'By submitting, you agree to receive messages from this business.', cookieBanner: true, hipaa: false },
    saas: { enabled: false, enabledAt: '', rebilling: Object.fromEntries(rebillProducts.map(([key]) => [key, 1])), accounts: [],
      unitCosts: Object.fromEntries(walletProducts.map(([key, , , cost]) => [key, cost])), rebill: {}, lowBalance: 20, autoSuspend: { enabled: true, maxRetry: 3, retryEvery: 1 } },
    workflowSettings: { builder: 'Standard', overrides: {} },
    subFeatures: Object.fromEntries(subFeatures.map(([key]) => [key, { on: {}, rebill: [] }])),
    emailServices: { domain: '', added: '', accounts: [] },
    apps: { installs: [], resell: {} }
  };
}

const flag = value => value === true || value === 'on' || value === 'true';
const domainName = value => {
  const v = str(value, 200).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return /^(?=.{4,200}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(v) ? v : fail('Enter a domain such as mail.youragency.com.');
};
const featureOn = (agency, key, account) => {
  const spec = subFeatures.find(f => f[0] === key);
  const on = agency.subFeatures[key]?.on || {};
  return Object.hasOwn(on, account) ? on[account] : Boolean(spec?.[3]);
};

/** `id` decide a isenção da raiz; sem id, a cobrança guardada fica como está (só leitura). */
export function hydrateAgency(state, id) {
  const fresh = blankAgency();
  // A mobile app saved before the themes keeps its own color (mobileTheme derives one from it).
  if (state.mobileApp && state.mobileApp.theme === undefined) state.mobileApp = { ...state.mobileApp, theme: null };
  // Agencies from before this option keep their sub-accounts running until they turn it on.
  if (!state.saas?.autoSuspend) state.saas = { ...fresh.saas, ...state.saas, autoSuspend: { ...fresh.saas.autoSuspend, enabled: false } };
  for (const [key, value] of Object.entries(fresh)) {
    if (state[key] === undefined) state[key] = value;
    else if (value && typeof value === 'object' && !Array.isArray(value) && !['accounts', 'integrations', 'reselling', 'systemEmails', 'labs'].includes(key)) state[key] = { ...value, ...state[key] };
  }
  mobileOf(state);
  delete state.stripe;
  state.profile.language = platformLanguage;
  state.company.brand = platformBrand;
  state.company.currency = defaults.profile.currency;
  if (state.company.primary === previousDefault.primary && state.company.secondary === previousDefault.secondary) {
    state.company.primary = defaultPrimary;
    state.company.secondary = defaultSecondary;
    if (!state.company.accent || state.company.accent === previousDefault.accent) state.company.accent = defaultAccent;
  }
  if (!/^#[0-9a-f]{6}$/i.test(state.company.primary || '')) state.company.primary = defaultPrimary;
  if (!/^#[0-9a-f]{6}$/i.test(state.company.secondary || '')) state.company.secondary = defaultSecondary;
  if (!/^#[0-9a-f]{6}$/i.test(state.company.accent || '')) state.company.accent = defaultAccent;
  for (const product of resellProducts) state.reselling[product.key] ??= { price: product.base, disabled: [] };
  for (const [key] of rebillProducts) state.saas.rebilling[key] ??= 1;
  state.fiscal ??= null; state.ledgerOutbox ??= [];
  hydrateBilling(state.billing, { root: id === AGENCY_ID });
  state.saas.unitCosts ??= {}; state.saas.rebill ??= {}; state.saas.lowBalance ??= 20;
  for (const [key, , , cost] of walletProducts) state.saas.unitCosts[key] ??= cost;
  for (const [key] of subFeatures) state.subFeatures[key] ??= { on: {}, rebill: [] };
  // Labs used to be on/off switches for the agency itself; they are now a mode per feature offered to sub-accounts.
  state.labs = Object.fromEntries(labCatalog.map(([key]) => [key, labModes.some(([mode]) => mode === state.labs?.[key]) ? state.labs[key] : 'off']));
  return hydrateProspecting(state);
}

function sanitize(key, input, accountIds) {
  const spec = collections[key];
  const out = {};
  for (const [field, label, type, required, options] of spec.fields) {
    const raw = input[field];
    let value;
    switch (type) {
      case 'email': value = email(raw, label.toLowerCase()); break;
      case 'url': value = url(raw, label); break;
      case 'number': value = num(raw, label); break;
      case 'score': value = raw === '' || raw === undefined ? null : num(raw, label, 10); break;
      case 'check': value = raw === true || raw === 'on' || raw === 'true'; break;
      case 'select': value = raw === undefined && !required ? '' : one(raw, options, label.toLowerCase()); break;
      case 'textarea': value = str(raw, 5000); break;
      case 'multi': {
        const allowed = options === '@accounts' ? accountIds : options === '@modules' ? subAccountModules.map(m => m[0]) : options;
        const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
        value = [...new Set(list.filter(v => allowed.includes(v)))];
        break;
      }
      default: value = str(raw, type === 'tel' ? 48 : 240);
    }
    if (required && (value === '' || value === null)) fail(`${label} is required.`);
    out[field] = value;
  }
  return out;
}

export function audit(state, actor, action, target = '', details = '') {
  state.audit.push({ id: uid(), at: now(), actor: str(actor, 120) || 'Agency Owner', action, target: str(target, 200), details: str(details, 500) });
  if (state.audit.length > AUDIT_IN_DOCUMENT) state.audit.splice(0, state.audit.length - AUDIT_IN_DOCUMENT);
}

/** Dias que uma subconta excluída fica na lixeira, encerrada, antes de os dados serem apagados de vez. */
export const TRASH_DAYS = 30;
const DAY_MS = 86_400_000;
export const inTrash = (agency, id) => Boolean(agency?.accounts?.[id]?.trash);
/** A lixeira da agência, da exclusão mais recente para a mais antiga, com a data em que cada uma será apagada. */
export function trashList(agency) {
  return Object.entries(agency.accounts || {}).filter(([, meta]) => meta?.trash).map(([id, meta]) => ({
    id, name: meta.name || id, deletedAt: meta.trash.at, deletedBy: meta.trash.by,
    purgeAt: new Date(Date.parse(meta.trash.at) + TRASH_DAYS * DAY_MS).toISOString()
  })).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
}
/** Subcontas cuja lixeira venceu em `at` (ms): os dados delas podem ser apagados. */
export const trashExpired = (agency, at = Date.now()) => trashList(agency).filter(row => Date.parse(row.purgeAt) <= at).map(row => row.id);

export function accountLifecycle(agency, id) {
  const meta = agency.accounts?.[id];
  const status = meta?.status || 'Active';
  return {
    status,
    suspendedReason: status === 'Active' ? '' : meta?.suspendedReason || '',
    suspendedAt: status === 'Paused' ? meta?.suspendedAt || '' : '',
    ...(status === 'Paused' && meta?.suspendedBy ? { suspendedBy: meta.suspendedBy } : {}),
    closedAt: status === 'Closed' ? meta?.closedAt || '' : ''
  };
}

function updateAccountStatus(state, id, meta, status, reason, actor) {
  const previous = meta.status || 'Active';
  if (reason !== undefined || previous !== status) meta.suspendedReason = status === 'Active' ? '' : str(reason, 500);
  if (previous === status) return;
  const at = now();
  meta.suspendedBy = '';
  Object.assign(meta, { status, suspendedAt: status === 'Paused' ? at : '', closedAt: status === 'Closed' ? at : '' });
  meta.statusHistory = [...(meta.statusHistory || []).slice(-99), {
    from: previous, to: status, at, actor, reason: meta.suspendedReason
  }];
  audit(state, actor, 'Sub-account status changed', id, `${previous} → ${status}`);
}

/** May this person pay to bring the sub-account back? Only its admins (or the agency's), and only a pause made by billing. */
export const canReactivate = (state, id, who) => state.accounts?.[id]?.status === 'Paused' && state.accounts[id].suspendedBy === 'billing'
  && ['Account Admin', 'Agency Owner', 'Agency Admin'].includes(who?.role);
/** A new subscription takes the place of the old one, which stays known: its money can still come back or be disputed. */
export function replaceBilling(state, id, billing) {
  const meta = state.accounts[id] = { ...(state.accounts[id] || {}) }, old = meta.billing;
  const { previous = [], history: _history, failures: _failures, url: _url, ...kept } = old || {};
  meta.billing = { ...billing, ...(old && { previous: [...previous, kept].slice(-12) }) };
  return meta.billing;
}
const billingActor = 'Cobrança automática';
/** Pauses an active sub-account whose plan was not paid. False when there was nothing to pause. */
export function suspendForBilling(state, id, reason = 'Pagamento do plano não confirmado.') {
  const meta = state.accounts?.[id];
  if (!meta || (meta.status || 'Active') !== 'Active') return false;
  updateAccountStatus(state, id, meta, 'Paused', reason, billingActor);
  meta.suspendedBy = 'billing';
  return true;
}
/** Lifts only the pause that billing itself made. */
export function restoreFromBilling(state, id) {
  const meta = state.accounts?.[id];
  if (meta?.status !== 'Paused' || meta.suspendedBy !== 'billing') return false;
  updateAccountStatus(state, id, meta, 'Active', '', billingActor);
  return true;
}

const pick = (state, key, id) => state[key].find(item => item.id === id) || fail('Record not found.', 404);

// Commands that only touch the agency record.
export function executeAgency(state, command, { accountIds = [], actor, sharedSnapshot, emailDomain } = {}) {
  const { type, key, id } = command;
  const d = command.data && typeof command.data === 'object' && !Array.isArray(command.data) ? command.data : {};
  const log = (action, target, details) => audit(state, actor, action, target, details);
  switch (type) {
    case 'save': {
      if (!Object.hasOwn(collections, key)) fail('Unknown record type.');
      const clean = sanitize(key, d, accountIds);
      if (key === 'users' && state.users.some(u => u.email === clean.email && u.id !== id)) fail('A user with this email already exists.');
      if (key === 'users' && agencyLevel(clean.role)) clean.accounts = [];
      if (key === 'users' && d.permissionMode !== undefined) {
        clean.permissionMode = one(d.permissionMode, ['', 'inherit', 'restricted', 'none'], 'permission mode');
      }
      if (key === 'plans' && d.modules !== undefined) {
        if (!Array.isArray(d.modules) || d.modules.some(module => !subAccountModules.some(([key]) => key === module))) fail('Choose valid plan modules.');
        clean.modules = [...new Set(d.modules)];
      }
      if (id) {
        const row = pick(state, key, id);
        Object.assign(row, clean, { updated: now() });
        log(`${collections[key].label} updated`, row.name || row.title || row.first || id);
        return row.id;
      }
      if (state[key].length >= collections[key].max) fail(`You can keep up to ${collections[key].max} records of this type.`);
      const row = { id: uid(), created: now(), ...clean };
      if (key === 'ideas') Object.assign(row, { status: 'Under review', votes: 1, voted: true, comments: [] });
      if (key === 'referrals') row.paid = false;
      state[key].push(row);
      log(`${collections[key].label} created`, row.name || row.title || `${row.first} ${row.last}`);
      return row.id;
    }
    case 'delete': {
      if (!Object.hasOwn(collections, key)) fail('Unknown record type.');
      const row = pick(state, key, id);
      state[key] = state[key].filter(item => item.id !== id);
      if (key === 'plans') for (const meta of Object.values(state.accounts)) if (meta.plan === id) meta.plan = '';
      log(`${collections[key].label} deleted`, row.name || row.title || row.first || id);
      return id;
    }
    // Brand groups: consolidated reports over several sub-accounts, with an optional public link.
    case 'brand-group-save': {
      const name = str(d.name, 80) || fail('Informe o nome do grupo.');
      const chosen = [...new Set((Array.isArray(d.accountIds) ? d.accountIds : [d.accountIds]).filter(x => typeof x === 'string' && x))];
      if (!chosen.length) fail('Escolha ao menos uma subconta para o grupo.');
      if (chosen.length > 100) fail('Um grupo pode ter até 100 subcontas.');
      if (chosen.some(x => !accountIds.includes(x))) fail('Uma das subcontas escolhidas não existe mais.');
      const period = ['7', '30', '90'].includes(String(d.period)) ? String(d.period) : '30';
      if (id) {
        const row = pick(state, 'brandGroups', id);
        Object.assign(row, { name, accountIds: chosen, period, updated: now() });
        log('Brand group updated', name);
        return row.id;
      }
      if (state.brandGroups.length >= 50) fail('A agência pode ter até 50 grupos de marcas.');
      const row = { id: uid(), created: now(), name, accountIds: chosen, period };
      state.brandGroups.push(row);
      log('Brand group created', name, `${chosen.length} subconta(s)`);
      return row.id;
    }
    case 'brand-group-delete': {
      const row = pick(state, 'brandGroups', id);
      state.brandGroups = state.brandGroups.filter(item => item.id !== id);
      log('Brand group deleted', row.name);
      return id;
    }
    case 'brand-group-share': {
      const row = pick(state, 'brandGroups', id);
      if (d.action === 'revoke') { delete row.share; log('Brand group link revoked', row.name); return id; }
      const days = Number(d.days);
      if (![7, 30, 90, 0].includes(days)) fail('Escolha a validade do link.');
      row.share = { id: randomBytes(32).toString('hex'), created: now(), expires: days ? new Date(Date.now() + days * 86_400_000).toISOString() : '', lang: d.lang === 'es' ? 'es' : 'pt' };
      log('Brand group link created', row.name, days ? `${days} dias` : 'sem validade');
      return id;
    }
    // Presentations: client pitches, proposals and slide decks created by the agency
    case 'presentation-save': {
      state.presentations ??= [];
      const clean = sanitizePresentation(d, state.company);
      const targetId = id || d.id;
      const existing = targetId ? state.presentations.find(item => item.id === targetId) : null;
      if (existing) {
        // Replace the content wholesale: a deck saved over a legacy row (or the reverse) must not keep stale keys.
        const keep = { id: existing.id, created: existing.created, share: existing.share };
        for (const key of Object.keys(existing)) delete existing[key];
        Object.assign(existing, clean, keep, { updated: now() });
        if (isDeck(existing)) existing.rev = (Number(clean.rev) || 0) + 1;
        if (!existing.share) delete existing.share;
        log('Presentation updated', existing.name || existing.title);
        return existing.id;
      }
      if (state.presentations.length >= 100) fail('A agência pode ter até 100 apresentações.');
      const row = { id: targetId || uid(), created: now(), updated: now(), ...clean };
      state.presentations.push(row);
      log('Presentation created', row.name || row.title, `${row.slides.length} lâmina(s)`);
      return row.id;
    }
    // Editor autosave: a batch of operations against the revision the editor last saw (Google Slides' /save model).
    case 'presentation-ops': {
      state.presentations ??= [];
      const row = pick(state, 'presentations', id);
      if (!isDeck(row)) fail('Abra a apresentação no editor para convertê-la antes de salvar alterações.');
      const ops = Array.isArray(d.ops) && d.ops.length ? d.ops : fail('Envie as alterações da apresentação.');
      if (ops.length > DECK_LIMITS.ops) fail('Alterações demais de uma vez. Tente salvar novamente.');
      if (Number(d.rev) !== (Number(row.rev) || 0)) fail('Esta apresentação foi alterada em outra aba ou por outra pessoa. Recarregue para continuar editando.', 409);
      const draft = JSON.parse(JSON.stringify(row));
      applyDeckOps(draft, ops);
      const clean = sanitizeDeck(draft, state.company);
      const keep = { id: row.id, created: row.created, share: row.share };
      for (const key of Object.keys(row)) delete row[key];
      Object.assign(row, clean, keep, { rev: (Number(draft.rev) || 0) + 1, updated: now() });
      if (!row.share) delete row.share;
      return row.rev;
    }
    case 'presentation-delete': {
      state.presentations ??= [];
      const row = pick(state, 'presentations', id);
      state.presentations = state.presentations.filter(item => item.id !== id);
      log('Presentation deleted', row.name || row.title);
      return id;
    }
    case 'presentation-duplicate': {
      state.presentations ??= [];
      const row = pick(state, 'presentations', id);
      if (state.presentations.length >= 100) fail('A agência pode ter até 100 apresentações.');
      const clone = JSON.parse(JSON.stringify(row));
      clone.id = uid();
      clone.name = `${row.name || row.title} (Cópia)`;
      clone.title = clone.name;
      clone.created = now();
      clone.updated = now();
      delete clone.share;
      state.presentations.push(clone);
      log('Presentation duplicated', clone.name);
      return clone.id;
    }
    case 'presentation-share': {
      state.presentations ??= [];
      const row = pick(state, 'presentations', id);
      if (d.action === 'revoke') {
        delete row.share;
        log('Presentation link revoked', row.name || row.title);
        return id;
      }
      const days = Number(d.days);
      if (![7, 30, 90, 0].includes(days)) fail('Escolha a validade do link.');
      row.share = {
        id: randomBytes(32).toString('hex'),
        created: now(),
        expires: days ? new Date(Date.now() + days * 86_400_000).toISOString() : '',
        lang: d.lang === 'es' ? 'es' : 'pt'
      };
      log('Presentation link created', row.name || row.title, days ? `${days} dias` : 'sem validade');
      return id;
    }
    // Prancheta: Design files and vector artwork created at the agency level
    case 'prancheta-save': {
      state.pranchetaFiles ??= [];
      const targetId = id || d.id;
      const existing = targetId ? state.pranchetaFiles.find(item => item.id === targetId) : null;
      checkPranchetaSave(existing, d, fail);
      if (existing) {
        // Miniatura e salvamento automático do editor não entram no histórico um a um.
        const quiet = isThumbnailOnlySave(d) || d.expectedUpdatedAt !== undefined;
        applyPranchetaSave(existing, state, d, now);
        if (!quiet) log('Prancheta updated', existing.name);
        return existing.id;
      }
      const record = pranchetaFileRecord(state, d);
      if (state.pranchetaFiles.length >= 200) fail('A agência pode ter até 200 arquivos na prancheta.');
      const row = { ...record, id: targetId || uid(), created: now(), updated: now() };
      state.pranchetaFiles.unshift(row);
      log('Prancheta created', row.name);
      return row.id;
    }
    case 'prancheta-delete': {
      state.pranchetaFiles ??= [];
      const existing = state.pranchetaFiles.find(item => item.id === id);
      if (!existing) fail('Design não encontrado.', 404);
      state.pranchetaFiles = state.pranchetaFiles.filter(item => item.id !== id);
      log('Prancheta deleted', existing.name);
      return id;
    }
    case 'prancheta-duplicate': {
      state.pranchetaFiles ??= [];
      const existing = state.pranchetaFiles.find(item => item.id === id);
      if (!existing) fail('Design não encontrado.', 404);
      if (state.pranchetaFiles.length >= 200) fail('A agência pode ter até 200 arquivos na prancheta.');
      const copy = JSON.parse(JSON.stringify(existing));
      copy.id = uid();
      copy.name = `${existing.name} (Cópia)`.slice(0, 150);
      copy.created = now();
      copy.updated = now();
      state.pranchetaFiles.unshift(copy);
      log('Prancheta duplicated', copy.name);
      return copy.id;
    }
    case 'prancheta-template': {
      state.pranchetaFiles ??= [];
      if (state.pranchetaFiles.length >= 200) fail('A agência pode ter até 200 arquivos na prancheta.');
      const templates = createCanonicalTemplates();
      const tpl = templates.find(t => t.id === d.templateId) || templates[0];
      const row = {
        id: uid(),
        name: tpl.name,
        format: tpl.format,
        width: tpl.width,
        height: tpl.height,
        pages: JSON.parse(JSON.stringify(tpl.pages)),
        created: now(),
        updated: now()
      };
      state.pranchetaFiles.unshift(row);
      log('Prancheta created from template', row.name);
      return row.id;
    }
    case 'prancheta-export-media': {
      const existing = id ? state.pranchetaFiles?.find(f => f.id === id) : null;
      const dataUri = d.data || existing?.thumbnail;
      if (!dataUri || typeof dataUri !== 'string') fail('Imagem inválida para exportação.');
      log('Prancheta exported', existing?.name || 'Arte');
      return existing?.id || id || uid();
    }
    case 'account-meta': {
      const meta = accountIds.includes(id) && state.accounts[id] || fail('Sub-account not found.', 404);
      const plan = str(d.plan, 60);
      if (plan && !state.plans.some(p => p.id === plan)) fail('Choose a valid plan.');
      const status = one(d.status, accountStatuses, 'status');
      Object.assign(meta, { address: str(d.address, 240), phone: str(d.phone, 48), website: url(d.website, 'Website'), plan });
      updateAccountStatus(state, id, meta, status, d.suspendedReason, actor);
      log('Sub-account updated', meta.name || id, `Status ${status}`);
      return id;
    }
    case 'account-reactivate': {
      const meta = accountIds.includes(id) && state.accounts[id] || fail('Sub-account not found.', 404);
      updateAccountStatus(state, id, meta, 'Active', '', actor);
      return id;
    }
    // Excluir subconta: vai para a lixeira encerrada (ninguém entra, nada roda) e os dados somem depois de TRASH_DAYS.
    case 'account-trash': {
      const meta = accountIds.includes(id) && state.accounts[id] || fail('Sub-account not found.', 404);
      const name = meta.name || id;
      if (str(d.confirm, 120) !== name) fail('Digite o nome da subconta exatamente como aparece para confirmar a exclusão.');
      if (['Active', 'Trial', 'PastDue'].includes(meta.billing?.status)) fail('Esta subconta tem uma assinatura de plano em andamento. Cancele a cobrança antes de excluí-la.');
      const before = { status: meta.status || 'Active', reason: meta.suspendedReason || '' };
      updateAccountStatus(state, id, meta, 'Closed', 'Subconta excluída pela agência.', actor);
      meta.trash = { at: now(), by: str(actor, 120) || 'Agency Owner', ...before };
      log('Sub-account deleted', name, `Lixeira por ${TRASH_DAYS} dias`);
      return id;
    }
    case 'account-restore': {
      const meta = state.accounts[id]?.trash ? state.accounts[id] : fail('Esta subconta não está na lixeira.', 404);
      const { status, reason } = meta.trash;
      delete meta.trash;
      updateAccountStatus(state, id, meta, accountStatuses.includes(status) ? status : 'Active', reason || '', actor);
      log('Sub-account restored', meta.name || id);
      return id;
    }
    case 'account-open': {
      const meta = accountIds.includes(id) && state.accounts[id] || fail('Sub-account not found.', 404);
      if (meta.status && meta.status !== 'Active') return id;
      meta.lastLogin = now();
      return id;
    }
    case 'idea-vote': {
      const idea = pick(state, 'ideas', id);
      idea.voted = !idea.voted; idea.votes += idea.voted ? 1 : -1;
      return id;
    }
    case 'idea-status': {
      const idea = pick(state, 'ideas', id);
      idea.status = one(d.status, ['Under review', 'Planned', 'In progress', 'Completed', 'Declined'], 'status');
      log('Idea status changed', idea.title, idea.status);
      return id;
    }
    case 'idea-comment': {
      const idea = pick(state, 'ideas', id);
      idea.comments.push({ id: uid(), at: now(), author: str(actor, 120) || 'Agency Owner', body: req(d.body, 'Comment', 2000) });
      return id;
    }
    case 'resell': {
      const product = resellProducts.find(p => p.key === id) || fail('Product not found.', 404);
      const price = num(d.price, 'Price', 100000);
      if (price < product.base) fail(`The customer price cannot be below your cost of $${product.base}.`);
      const enabled = Array.isArray(d.enabled) ? d.enabled.filter(v => accountIds.includes(v)) : [];
      state.reselling[id] = { price, disabled: accountIds.filter(a => !enabled.includes(a)) };
      log('Reselling price saved', product.name, `$${price}/mo · ${enabled.length} enabled`);
      return id;
    }
    case 'addon-request': {
      const addon = addOns.find(a => a.key === id) || fail('Add-on not found.', 404);
      if (state.addonRequests.some(r => r.addon === id && r.status === 'Requested')) fail('This add-on already has an open request.');
      state.addonRequests.push({ id: uid(), addon: id, status: 'Requested', created: now(), note: str(d.note, 1000) });
      log('Add-on requested', addon.name);
      return id;
    }
    case 'addon-cancel': {
      const request = pick(state, 'addonRequests', id);
      request.status = 'Withdrawn';
      return id;
    }
    case 'affiliate-step': {
      const step = one(d.step, ['policy', 'video', 'toolkit', 'flowchart'], 'step');
      state.affiliate.steps[step] = true;
      return step;
    }
    case 'affiliate-accept': {
      const done = ['policy', 'video', 'toolkit', 'flowchart'].every(step => state.affiliate.steps[step]);
      if (!done) fail('Complete the four steps before accepting the terms.');
      if (d.agree !== true && d.agree !== 'on') fail('Confirm that you read the affiliate policy.');
      state.affiliate.accepted = true; state.affiliate.acceptedAt = now();
      state.affiliate.code ||= randomBytes(4).toString('hex');
      log('Affiliate terms accepted');
      return state.affiliate.code;
    }
    case 'affiliate-payout': {
      state.affiliate.payout = { method: one(d.method, ['PayPal', 'Bank transfer', 'Wise'], 'payout method'), email: email(d.email, 'payout email') };
      log('Affiliate payout details updated', state.affiliate.payout.method);
      return 'payout';
    }
    case 'affiliate-pay': {
      const due = state.referrals.filter(r => r.status === 'Active' && !r.paid);
      if (!due.length) fail('There are no unpaid active referrals.');
      const amount = Math.round(due.reduce((sum, r) => sum + r.amount * affiliateRate, 0) * 100) / 100;
      due.forEach(r => { r.paid = true; });
      state.affiliate.payments.push({ id: uid(), at: now(), amount, referrals: due.map(r => r.id), method: state.affiliate.payout.method });
      log('Affiliate payout recorded', `$${amount}`);
      return amount;
    }
    case 'learning': {
      const lesson = req(d.lesson, 'Lesson', 20);
      const list = state.learning.completed;
      state.learning.completed = list.includes(lesson) ? list.filter(l => l !== lesson) : [...list, lesson];
      return lesson;
    }
    case 'profile': {
      Object.assign(state.profile, { first: req(d.first, 'Nome', 80), last: req(d.last, 'Sobrenome', 80), email: email(d.email), phone: str(d.phone, 48), language: platformLanguage });
      state.profile.name = `${state.profile.first} ${state.profile.last}`;
      log('Profile updated');
      return 'profile';
    }
    case 'fiscal': {
      state.fiscal = sanitizeFiscal(d);
      log('Fiscal record updated', state.fiscal.name);
      return 'fiscal';
    }
    case 'company': {
      Object.assign(state.company, { name: req(d.name, 'Nome da empresa', 120), brand: platformBrand, domain: d.domain === undefined ? state.company.domain || '' : whiteLabelHost(d.domain),
        website: url(d.website, 'Website'), phone: str(d.phone, 48), address: str(d.address, 300), primary: color(d.primary),
        secondary: d.secondary === undefined ? state.company.secondary || defaultSecondary : color(d.secondary),
        accent: d.accent === undefined ? state.company.accent || defaultAccent : color(d.accent),
        timezone: req(d.timezone, 'Time zone', 60), currency: defaults.profile.currency });
      if (d.logo !== undefined) state.company.logo = d.logo === 'remove' ? '' : d.logo ? image(d.logo) : state.company.logo;
      log('Company settings updated', state.company.name);
      return 'company';
    }
    case 'mobile-app': {
      saveMobileLook(state, d);
      log('Mobile app settings saved', state.mobileApp.appName);
      return 'mobile';
    }
    case 'desktop-app': {
      saveDesktop(state, d);
      log('Desktop app settings saved', state.desktopApp.appName);
      return 'desktop';
    }
    case 'mobile-app-store': {
      saveMobileStore(state, d);
      log('Mobile app store data saved', state.mobileApp.appName);
      return 'mobile';
    }
    case 'mobile-app-publish': {
      const app = publishMobile(state);
      log('Mobile app published', `${app.appName} v${app.version}`);
      return 'mobile';
    }
    case 'desktop-app-publish': {
      const app = publishDesktop(state);
      log('Desktop app published', `${app.appName} v${app.version}`);
      return 'desktop';
    }
    case 'integration': {
      const item = integrationCatalog.find(entry => entry[0] === id) || fail('Integration not found.', 404);
      const accounts = Array.isArray(d.accounts) ? d.accounts.filter(v => accountIds.includes(v)) : [];
      state.integrations[id] = { accounts, updated: now() };
      log('Integration availability changed', item[1], `${accounts.length} sub-accounts`);
      return id;
    }
    case 'saas-mode': {
      state.saas.enabled = flag(d.enabled);
      if (state.saas.enabled && !state.saas.enabledAt) state.saas.enabledAt = now();
      log(state.saas.enabled ? 'SaaS mode enabled' : 'SaaS mode disabled');
      return state.saas.enabled;
    }
    case 'saas-suspension': {
      const whole = (value, min, max, message) => { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : fail(message); };
      state.saas.autoSuspend = { enabled: flag(d.enabled), maxRetry: whole(d.maxRetry, 1, 10, 'O número de tentativas vai de 1 a 10.'), retryEvery: whole(d.retryEvery, 1, 30, 'O intervalo entre tentativas vai de 1 a 30 dias.') };
      log('Plan payment failure settings updated', state.saas.autoSuspend.enabled ? 'On' : 'Off');
      return 'suspension';
    }
    case 'saas-rebilling': {
      for (const [key, label] of rebillProducts) {
        const markup = num(d[key], `${label} markup`, maxMarkup);
        if (markup < 1) fail(`${label} markup must be between 1× and ${maxMarkup}×.`);
        state.saas.rebilling[key] = markup;
      }
      for (const [key, label] of walletProducts) {
        if (d[`cost_${key}`] === undefined || d[`cost_${key}`] === '') continue;
        const cost = Number(String(d[`cost_${key}`]).replace(',', '.'));
        if (!Number.isFinite(cost) || cost < 0 || cost > 1000) fail(`Informe o custo de ${label} entre 0 e 1.000.`);
        state.saas.unitCosts[key] = Math.round(cost * 1e4) / 1e4;
      }
      if (d.lowBalance !== undefined && d.lowBalance !== '') state.saas.lowBalance = num(d.lowBalance, 'Low balance alert', 100000);
      log('Wallet rebilling updated');
      return 'rebilling';
    }
    case 'rebill-account': {
      if (!accountIds.includes(id)) fail('Sub-account not found.', 404);
      const wanted = new Set(Array.isArray(d.products) ? d.products : []);
      const products = walletKeys.filter(key => wanted.has(key));
      if (products.length) state.saas.rebill[id] = products; else delete state.saas.rebill[id];
      log(products.length ? 'Wallet rebilling enabled for sub-account' : 'Wallet rebilling disabled for sub-account', id, products.join(', '));
      return id;
    }
    case 'saas-account': {
      if (!accountIds.includes(id)) fail('Sub-account not found.', 404);
      state.saas.accounts = state.saas.accounts.filter(a => a !== id && accountIds.includes(a));
      if (flag(d.enabled)) state.saas.accounts.push(id);
      log(flag(d.enabled) ? 'SaaS mode enabled for sub-account' : 'SaaS mode disabled for sub-account', id);
      return id;
    }
    case 'workflow-builder': {
      const builder = one(d.builder, workflowBuilders, 'default builder');
      const overrides = {};
      for (const account of accountIds) {
        const value = d[`o_${account}`];
        if (value && value !== 'default') overrides[account] = one(value, workflowBuilders, 'builder');
      }
      state.workflowSettings = { builder, overrides };
      log('Default workflow builder changed', builder, `${Object.keys(overrides).length} sub-account overrides`);
      return builder;
    }
    case 'sub-feature': {
      const spec = subFeatures.find(f => f[0] === id) || fail('Setting not found.', 404);
      const account = accountIds.includes(d.account) ? d.account : fail('Sub-account not found.', 404);
      const field = one(d.field, ['on', 'rebill'], 'setting');
      const value = flag(d.value);
      const entry = state.subFeatures[id];
      if (field === 'on') {
        entry.on[account] = value;
        if (!value) entry.rebill = entry.rebill.filter(a => a !== account);
      } else {
        if (value && !featureOn(state, id, account)) fail(`Enable ${spec[1]} for this sub-account before rebilling it.`);
        entry.rebill = entry.rebill.filter(a => a !== account);
        if (value) entry.rebill.push(account);
      }
      log(`${spec[1]} ${field === 'on' ? 'access' : 'rebilling'} ${value ? 'enabled' : 'disabled'}`, account);
      return id;
    }
    // White Label: o domínio de envio da agência é criado na Resend (o servidor passa o resultado em emailDomain) e,
    // verificado, vira o remetente das subcontas escolhidas que não têm domínio próprio.
    case 'email-domain': {
      const live = emailDomain || fail('O domínio de envio precisa ser criado no serviço de e-mail.', 503);
      state.emailServices = { domain: domainName(d.domain), added: now(), accounts: [], localPart: normalizeLocalPart(d.localPart || 'contato'),
        resendId: live.id, region: live.region, status: live.status, records: live.records, checkedAt: now(), verifiedAt: live.status === 'verified' ? now() : '' };
      log('Dedicated sending domain added', state.emailServices.domain);
      return state.emailServices.domain;
    }
    case 'email-domain-status': {
      if (!state.emailServices.domain || !emailDomain) fail('Add a dedicated domain first.');
      state.emailServices = applyDomainStatus(state.emailServices, emailDomain, now());
      return state.emailServices.status;
    }
    case 'email-domain-accounts': {
      if (!state.emailServices.domain) fail('Add a dedicated domain first.');
      if (d.localPart !== undefined) state.emailServices.localPart = normalizeLocalPart(d.localPart);
      state.emailServices.accounts = Array.isArray(d.accounts) ? d.accounts.filter(v => accountIds.includes(v)) : [];
      log('Dedicated domain sub-accounts changed', state.emailServices.domain, `${state.emailServices.accounts.length} sub-accounts`);
      return 'email';
    }
    case 'email-domain-remove': {
      const old = state.emailServices.domain || fail('No dedicated domain to remove.');
      state.emailServices = { domain: '', added: '', accounts: [] };
      log('Dedicated sending domain removed', old);
      return 'email';
    }
    case 'affiliate-pixel': {
      const pixelId = str(d.pixelId, 32);
      if (pixelId && !/^\d{5,20}$/.test(pixelId)) fail('The Facebook Pixel ID has only digits (5 to 20).');
      state.affiliate.pixelId = pixelId;
      log('Affiliate page settings saved');
      return 'pixel';
    }
    case 'app-install': {
      const app = integrationCatalog.find(entry => entry[0] === id) || fail('App not found.', 404);
      const scope = one(d.scope, appScopes, 'installation level');
      const account = scope === 'Sub-account' ? (accountIds.includes(d.account) ? d.account : fail('Choose a sub-account.')) : '';
      if (account && !state.integrations[id]?.accounts.includes(account)) fail(`Make ${app[1]} available to this sub-account first.`);
      if (state.apps.installs.some(x => x.app === id && x.account === account)) fail(`${app[1]} is already installed there.`);
      state.apps.installs.push({ id: uid(), app: id, scope, account, at: now(), by: str(actor, 120) || 'Agency Owner' });
      log('App installed', app[1], account || 'Agency');
      return id;
    }
    case 'app-uninstall': {
      const row = state.apps.installs.find(x => x.id === id) || fail('Installation not found.', 404);
      state.apps.installs = state.apps.installs.filter(x => x.id !== id);
      log('App uninstalled', integrationCatalog.find(entry => entry[0] === row.app)?.[1] || row.app, row.account || 'Agency');
      return id;
    }
    case 'app-resell': {
      const app = integrationCatalog.find(entry => entry[0] === id) || fail('App not found.', 404);
      const cost = num(d.cost, 'App cost', 100000), price = num(d.price, 'Reselling price', 100000);
      if (price && price < cost) fail('The reselling price cannot be lower than the app cost.');
      state.apps.resell[id] = { cost, price };
      log('App reselling price changed', app[1], `$${price}`);
      return id;
    }
    case 'billing-plan': {
      const plan = one(d.plan, agencyPlans.map(p => p[0]), 'plan');
      state.billing.plan = plan; log('Agency plan changed', plan);
      return plan;
    }
    case 'wallet': {
      const amount = num(d.amount, 'Amount', 100000);
      if (!amount) fail('Enter an amount above zero.');
      const kind = one(d.kind, ['Credit', 'Charge'], 'entry type');
      state.billing.wallet.push({ id: uid(), at: now(), kind, amount, note: str(d.note, 200) });
      log(`Wallet ${kind.toLowerCase()} recorded`, `$${amount}`);
      return 'wallet';
    }
    case 'auto-recharge': {
      state.billing.autoRecharge = { enabled: d.enabled === true || d.enabled === 'on', threshold: num(d.threshold, 'Threshold', 10000), amount: num(d.amount, 'Recharge amount', 10000) };
      log('Wallet auto-recharge updated', state.billing.autoRecharge.enabled ? 'On' : 'Off');
      return 'auto';
    }
    case 'system-email': {
      const entry = systemEmailKeys.find(e => e[0] === id) || fail('Email not found.', 404);
      state.systemEmails[id] = { subject: req(d.subject, 'Subject', 200), body: req(d.body, 'Body', 5000) };
      log('System email updated', entry[1]);
      return id;
    }
    case 'labs': {
      for (const [key, title] of labCatalog) {
        if (d[key] === undefined) continue;
        state.labs[key] = one(d[key], labModes.map(([mode]) => mode), `mode for ${title}`);
      }
      log('Labs features updated', labCatalog.map(([key, title]) => `${title}: ${labModes.find(([mode]) => mode === state.labs[key])[1]}`).join(' · '));
      return 'labs';
    }
    case 'ai-defaults': {
      const limit = Number(d.limit ?? 0);
      if (!Number.isFinite(limit) || limit < 0 || limit > 100000) fail('Informe um limite mensal entre US$ 0 e US$ 100.000. Use 0 para não limitar.');
      const alertAt = Number(d.alertAt ?? 0.8);
      if (!Number.isFinite(alertAt) || alertAt < 0.5 || alertAt > 0.95) fail('O alerta deve ficar entre 50% e 95% do limite.');
      state.aiDefaults = { limit: Math.round(limit * 100) / 100, alertAt, enabled: d.enabled === undefined ? true : flag(d.enabled) };
      log('AI defaults updated', `US$ ${state.aiDefaults.limit} · alerta ${Math.round(alertAt * 100)}% · IA ${state.aiDefaults.enabled ? 'ligada' : 'desligada'} em subcontas novas`);
      return 'ai-defaults';
    }
    case 'compliance': {
      state.compliance = { retentionDays: num(d.retentionDays, 'Retention period', 3650), consent: str(d.consent, 1000), cookieBanner: d.cookieBanner === true || d.cookieBanner === 'on', hipaa: d.hipaa === true || d.hipaa === 'on' };
      log('Compliance settings updated');
      return 'compliance';
    }
    case 'api-key': {
      if (state.apiKeys.length >= 10) fail('Delete an existing key before creating another.');
      const secret = `go_${randomBytes(24).toString('hex')}`;
      const row = { id: uid(), name: req(d.name, 'Key name', 80), hash: hash(secret), last4: secret.slice(-4), created: now(), lastUsed: '' };
      state.apiKeys.push(row);
      log('API key created', row.name);
      return { id: row.id, secret };
    }
    case 'api-key-delete': {
      const row = pick(state, 'apiKeys', id);
      state.apiKeys = state.apiKeys.filter(k => k.id !== id);
      log('API key revoked', row.name);
      return id;
    }
    case 'private-integration': {
      if (state.privateIntegrations.length >= 20) fail('Delete an integration before creating another.');
      const scopes = (Array.isArray(d.scopes) ? d.scopes : []).filter(s => apiScopes.some(([key]) => key === s));
      if (!scopes.length) fail('Choose at least one scope.');
      const secret = `pit_${randomBytes(24).toString('hex')}`;
      const row = { id: uid(), name: req(d.name, 'Integration name', 80), description: str(d.description, 500), scopes, hash: hash(secret), last4: secret.slice(-4), created: now(), lastUsed: '' };
      state.privateIntegrations.push(row);
      log('Private integration created', row.name, scopes.join(', '));
      return { id: row.id, secret };
    }
    case 'private-integration-delete': {
      const row = pick(state, 'privateIntegrations', id);
      state.privateIntegrations = state.privateIntegrations.filter(k => k.id !== id);
      log('Private integration deleted', row.name);
      return id;
    }
    case 'snapshot-rename': {
      const snap = pick(state, 'snapshots', id);
      snap.name = req(d.name, 'Snapshot name', 100); snap.updated = now();
      log('Snapshot renamed', snap.name);
      return id;
    }
    case 'snapshot-delete': {
      const snap = pick(state, 'snapshots', id);
      state.snapshots = state.snapshots.filter(s => s.id !== id);
      log('Snapshot deleted', snap.name);
      return id;
    }
    case 'snapshot-share': {
      const snap = pick(state, 'snapshots', id);
      if (snap.protected) fail('Este setup foi importado com proteção de ativos e não pode ser compartilhado novamente.', 403);
      snap.shareCode ||= randomBytes(6).toString('hex');
      snap.shared = true;
      // Asset protection: the agency that imports can load the setup into its sub-accounts, but cannot see what is inside or pass it on.
      snap.shareProtected = Boolean(d.protect);
      snap.sharedAt = now();
      log('Snapshot share link created', snap.name, snap.shareProtected ? 'Asset protection on' : '');
      return snap.shareCode;
    }
    case 'snapshot-unshare': {
      const snap = pick(state, 'snapshots', id);
      snap.shareCode = ''; snap.shared = false; snap.shareProtected = false;
      log('Snapshot share link revoked', snap.name);
      return id;
    }
    case 'snapshot-import': {
      const code = req(d.code, 'Share code', 40).toLowerCase();
      const source = state.snapshots.find(s => s.shareCode === code && s.shared) ||
        (sharedSnapshot?.shareCode === code && sharedSnapshot) || fail('No snapshot uses this share code.', 404);
      if (state.snapshots.length >= 50) fail('You can keep up to 50 snapshots.');
      const { shareCode: _code, shared: _shared, shareProtected, sharedAt: _at, marketplaceId: _mkt, ...rest } = structuredClone(source);
      const copy = { ...rest, id: uid(), name: `${source.name} (importado)`, kind: 'imported', protected: Boolean(shareProtected || source.protected),
        shareCode: '', shared: false, importedAt: now(), created: now(), updated: now() };
      state.snapshots.push(copy);
      log('Snapshot imported', copy.name, copy.protected ? 'Asset protection on' : '');
      return copy.id;
    }
    default: return fail('Unknown agency action.');
  }
}

// ---- Snapshots -------------------------------------------------------------

const refs = { stages: { pipelineId: 'pipelines' }, pages: { formId: 'forms' }, snippets: { folderId: 'snippetFolders' },
  workflows: { linkId: 'triggerLinks', formId: 'forms', stageId: 'stages', folderId: 'workflowFolders' } };
// Two records are "the same" when they share this identity; custom fields and values match on their merge key.
const label = (key, item) => key === 'stages' ? `${item.pipelineId}:${item.name}`
  : (key === 'customFields' || key === 'customValues') && item.key ? item.key
    : (item.name || item.title || '').toLowerCase();
// Load order: a record is created after everything it points to.
const loadOrder = ['customFields', 'customValues', 'tags', 'pipelines', 'stages', 'snippetFolders', 'forms', 'triggerLinks', 'pages', 'snippets',
  'workflowFolders', 'workflows', 'courses', 'services', 'emailTemplates', 'documentTemplates', 'brandBoards', 'knowledgeBases', 'agents', 'chatWidgets', 'studioProjects'];
// Helper collections that never appear on their own in the asset picker: they follow the records that use them.
export const snapshotHelperKeys = ['stages', 'workflowFolders', 'snippetFolders'];

export function extractSnapshot(workspace, include = snapshotAssets.map(a => a[0])) {
  const assets = {};
  for (const [key] of snapshotAssets) if (include.includes(key)) assets[key] = structuredClone(workspace[key] || []);
  if (assets.stages && !assets.pipelines) assets.pipelines = structuredClone(workspace.pipelines);
  if (assets.pipelines && !assets.stages) assets.stages = structuredClone((workspace.stages || []).filter(s => assets.pipelines.some(p => p.id === s.pipelineId)));
  if (assets.pages && !assets.forms) assets.forms = structuredClone(workspace.forms.filter(f => assets.pages.some(p => p.formId === f.id)));
  if (assets.snippets && !assets.snippetFolders) assets.snippetFolders = structuredClone((workspace.snippetFolders || [])
    .filter(folder => assets.snippets.some(snippet => snippet.folderId === folder.id)));
  if (assets.workflows) assets.workflowFolders = structuredClone((workspace.workflowFolders || [])
    .filter(folder => assets.workflows.some(workflow => workflow.folderId === folder.id)));
  for (const page of assets.pages || []) page.active = false;
  for (const workflow of assets.workflows || []) workflow.active = false;
  for (const widget of assets.chatWidgets || []) widget.active = false;
  // Agents travel without memory or publication, but remember which knowledge bases they used.
  if (assets.agents) assets.agents = assets.agents.map(agent => ({ ...agentTemplate(agent), baseRefs: assets.knowledgeBases ? [...(agent.bases || [])] : [] }));
  const counts = Object.fromEntries(Object.entries(assets).map(([key, list]) => [key, list.length]));
  return { assets, counts };
}

// Properties whose string values point at other records (formId, stageIds, pipelineId, value of a trigger…).
const refKey = key => /(^|[a-z])(Id|Ids)$/.test(key) || /^(id|ids|value|values|form|forms|pipeline|stage|link|workflow|calendar|template|service|agent|widget|baseRefs)$/i.test(key);
// Every record id a snapshot record points to, at any depth (workflow triggers and steps keep their links in nested configs).
function referencedIds(value, out = new Set(), key = '') {
  if (typeof value === 'string') { if (value.startsWith('custom:')) out.add(value.slice(7)); else if (key && refKey(key) && value.length >= 3) out.add(value); return out; }
  if (Array.isArray(value)) { for (const entry of value) referencedIds(entry, out, key); return out; }
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) if (k !== 'id') referencedIds(v, out, k);
  return out;
}
// Rewrites every link inside a record with the ids the records received in the target account.
function remapIds(value, idMap, key = '') {
  // A custom field named in a workflow ("custom:<id>", in conditions and field updates) follows its new id too.
  if (typeof value === 'string') return value.startsWith('custom:') && idMap.has(value.slice(7)) ? `custom:${idMap.get(value.slice(7))}` : key && refKey(key) && idMap.has(value) ? idMap.get(value) : value;
  if (Array.isArray(value)) return value.map(entry => remapIds(entry, idMap, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'id' ? v : remapIds(v, idMap, k)]));
  return value;
}

// Which records of the snapshot a load touches. `items` maps an asset type to the ids picked in it;
// without `items` everything loads. Picking a record brings along what it depends on.
export function snapshotSelection(snapshot, items) {
  const assets = snapshot.assets || {};
  const all = key => new Set((assets[key] || []).map(row => row.id));
  if (!items || typeof items !== 'object') return Object.fromEntries(Object.keys(assets).map(key => [key, all(key)]));
  const picked = {};
  for (const key of Object.keys(assets)) {
    if (snapshotHelperKeys.includes(key)) continue;
    // '*' picks the whole type (used for protected setups, whose records the agency cannot see).
    if (items[key] === '*') { picked[key] = all(key); continue; }
    const ids = Array.isArray(items[key]) ? items[key].map(String) : [];
    picked[key] = new Set(ids.filter(id => assets[key].some(row => row.id === id)));
  }
  const owner = new Map();
  for (const [key, rows] of Object.entries(assets)) for (const row of rows || []) if (row?.id) owner.set(row.id, key);
  // Pipelines bring all their stages; then follow links until nothing new is pulled in.
  for (const row of assets.stages || []) if (picked.pipelines?.has(row.pipelineId)) (picked.stages ??= new Set()).add(row.id);
  const queue = Object.entries(picked).flatMap(([key, ids]) => [...ids].map(id => [key, id]));
  while (queue.length) {
    const [key, id] = queue.pop();
    const row = assets[key]?.find(r => r.id === id);
    const links = referencedIds(row);
    for (const ref of links) {
      const refType = owner.get(ref);
      if (!refType || picked[refType]?.has(ref)) continue;
      (picked[refType] ??= new Set()).add(ref);
      queue.push([refType, ref]);
      if (refType === 'stages') { const stage = assets.stages.find(s => s.id === ref); if (stage && !picked.pipelines?.has(stage.pipelineId)) { (picked.pipelines ??= new Set()).add(stage.pipelineId); queue.push(['pipelines', stage.pipelineId]); } }
      if (refType === 'pipelines') for (const stage of assets.stages || []) if (stage.pipelineId === ref) (picked.stages ??= new Set()).add(stage.id);
    }
  }
  return picked;
}

// Pass 1 of a load: the id every picked record will have in the target (an existing look-alike, or a new one).
function planSnapshot(target, snapshot, picked) {
  const idMap = new Map(), plan = [];
  for (const key of loadOrder) {
    for (const original of (snapshot.assets?.[key] || []).filter(row => picked[key]?.has(row.id))) {
      const probe = key === 'stages' ? { ...original, pipelineId: idMap.get(original.pipelineId) ?? original.pipelineId } : original;
      const match = (target[key] || []).find(existing => label(key, existing) === label(key, probe));
      const id = match ? match.id : uid();
      idMap.set(original.id, id);
      plan.push({ key, original, match });
    }
  }
  return { idMap, plan };
}

// Dry run of a load: per asset type, how many records are picked and which already exist in the target.
export function previewSnapshot(target, snapshot, items) {
  const { plan } = planSnapshot(target, snapshot, snapshotSelection(snapshot, items));
  const out = new Map();
  for (const { key, original, match } of plan) {
    if (snapshotHelperKeys.includes(key)) continue;
    const row = out.get(key) || { key, total: 0, fresh: 0, conflicts: [] };
    row.total++;
    if (match) row.conflicts.push(original.name || original.title || original.key || ''); else row.fresh++;
    out.set(key, row);
  }
  return [...out.values()];
}

export function applySnapshot(target, snapshot, mode = 'skip', studioMap = null, { items, modes = {} } = {}) {
  const { idMap, plan } = planSnapshot(target, snapshot, snapshotSelection(snapshot, items));
  const report = { added: 0, overwritten: 0, skipped: 0 };
  const exists = (refType, id) => (target[refType] || []).some(r => r.id === id);
  for (const { key, original, match } of plan) {
    const rule = modes[key] === 'overwrite' || modes[key] === 'skip' ? modes[key] : mode;
    target[key] ??= [];
    const id = idMap.get(original.id);
    if (match && !(rule === 'overwrite' && key !== 'pipelines')) { report.skipped++; continue; }
    // Only what is really loaded brings its pages: a site kept as it is keeps its pages too.
    if (key === 'studioProjects' && studioMap) { studioMap.set(original.id, id); studioMap.ids = idMap; }
    const item = remapIds(structuredClone(key === 'agents' ? agentTemplate(original) : original), idMap);
    // Direct links to records that are neither in the load nor in the account are cleared.
    for (const [field, refType] of Object.entries(refs[key] || {})) if (item[field] && !exists(refType, item[field]) && ![...idMap.values()].includes(item[field])) item[field] = '';
    if (key === 'agents') item.bases = (original.baseRefs || []).map(base => idMap.get(base)).filter(Boolean);
    delete item.baseRefs;
    if (key === 'services') {
      // Staff and rooms belong to the account that made the snapshot; keep only links that also exist here.
      item.staffIds = (item.staffIds || []).filter(staff => (target.scheduling?.staff || []).some(p => p.id === staff));
      item.resourceIds = (item.resourceIds || []).filter(room => (target.resources || []).some(r => r.id === room));
    }
    if (match) {
      if (key === 'agents') Object.assign(item, { active: Boolean(match.published), revision: uid() });
      Object.assign(match, { ...item, id: match.id, updated: now() });
      report.overwritten++;
    } else {
      target[key].push({ ...item, id, created: now() });
      report.added++;
    }
  }
  return report;
}

// ---- Overview ----------------------------------------------------------------

const monthKey = iso => iso.slice(0, 7);
export function agencyOverview(agency, workspaces) {
  const accounts = workspaces.map(({ id, name, state, metrics: scopedMetrics }) => {
    const meta = agency.accounts[id] || {};
    const m = scopedMetrics || metrics(state);
    const plan = agency.plans.find(p => p.id === meta.plan);
    const resold = resellProducts.filter(p => !agency.reselling[p.key]?.disabled.includes(id));
    const storage = state.files.reduce((sum, f) => sum + Math.floor((f.data.length - f.data.indexOf(',') - 1) * 3 / 4), 0);
    return {
      id, name, status: meta.status || 'Active', created: meta.created || '', lastLogin: meta.lastLogin || '', plan: plan?.name || '', planPrice: plan?.price || 0,
      address: meta.address || '', phone: meta.phone || state.profile.phone || '', website: meta.website || '', email: state.profile.email,
      currency: state.profile.currency, contacts: m.contacts, open: m.open, openValue: m.openValue, won: m.won, wonValue: m.wonValue,
      invoicesPaid: m.invoicesPaid, appointments: m.appointments, workflows: state.workflows.length, runs: state.runs.length, files: state.files.length, storage,
      aiCost: usageSummary(state.ai).cost, aiLimit: Number(state.ai?.limit) || 0, aiAlertAt: Number(state.ai?.alertAt) || 0.8,
      aiEnabled: !state.ai?.disabled, aiResold: Boolean(state.wallet?.pricing?.ai), agents: (state.agents || []).length, wallet: walletSummary(state),
      labsOn: Object.keys(state.labs?.on || {}),
      resold: resold.map(p => p.key)
    };
  });
  const live = accounts.filter(a => a.status === 'Active');
  const resale = account => resellProducts.reduce((sum, p) => sum + (account.resold.includes(p.key) && agency.reselling[p.key].price > 0 ? agency.reselling[p.key].price : 0), 0);
  const profit = account => resellProducts.reduce((sum, p) => sum + (account.resold.includes(p.key) && agency.reselling[p.key].price > 0 ? agency.reselling[p.key].price - p.base : 0), 0);
  const mrr = live.reduce((sum, a) => sum + a.planPrice, 0);
  const thisMonth = monthKey(now());
  const months = [];
  for (let k = 5; k >= 0; k--) { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - k); months.push(d.toISOString().slice(0, 7)); }
  const growth = months.map(month => ({ month, total: accounts.filter(a => (a.created || '0000') .slice(0, 7) <= month).length, added: accounts.filter(a => a.created && monthKey(a.created) === month).length }));
  const affiliateDue = agency.referrals.filter(r => r.status === 'Active' && !r.paid).reduce((s, r) => s + r.amount * affiliateRate, 0);
  const wallet = agency.billing.wallet.reduce((s, w) => s + (w.kind === 'Credit' ? w.amount : -w.amount), 0);
  return {
    accounts,
    totals: {
      accounts: accounts.length, active: live.length, paused: accounts.filter(a => a.status === 'Paused').length, closed: accounts.filter(a => a.status === 'Closed').length,
      newThisMonth: accounts.filter(a => a.created && monthKey(a.created) === thisMonth).length,
      mrr, resale: live.reduce((s, a) => s + resale(a), 0), resaleProfit: live.reduce((s, a) => s + profit(a), 0),
      contacts: accounts.reduce((s, a) => s + a.contacts, 0), open: accounts.reduce((s, a) => s + a.open, 0), runs: accounts.reduce((s, a) => s + a.runs, 0),
      storage: accounts.reduce((s, a) => s + a.storage, 0), aiCost: Math.round(accounts.reduce((s, a) => s + a.aiCost, 0) * 1e6) / 1e6, affiliateDue: Math.round(affiliateDue * 100) / 100, wallet: Math.round(wallet * 100) / 100,
      snapshots: agency.snapshots.length, prospects: agency.prospects.length
    },
    growth
  };
}

// Public view of agency settings that a sub-account screen needs.
export function agencyForWorkspace(agency, workspace, includePermissions = false) {
  const applies = item => !item.accounts?.length || item.accounts.includes(workspace);
  return {
    brand: platformBrand, name: agency.company.name, primary: agency.company.primary, secondary: agency.company.secondary || defaultSecondary, accent: agency.company.accent || defaultAccent, logo: agency.company.logo,
    menuLinks: agency.menuLinks.filter(l => l.showOn !== 'Agency' && applies(l)).map(({ id, title, url: href, icon, openIn }) => ({ id, title, url: href, icon, openIn })),
    announcements: agency.announcements.filter(a => a.published && applies(a)).map(({ id, title, body, tone }) => ({ id, title, body, tone })),
    users: agency.users.filter(user => String(user.role || '').startsWith('Agency') || user.accounts?.includes(workspace))
      .map(({ id, first, last, role, accounts, permissions }) => ({
        id, name: `${first} ${last}`, role, accounts: includePermissions ? accounts : (String(role || '').startsWith('Agency') ? [] : [workspace]),
        ...(includePermissions && { permissions })
      }))
  };
}

// Access rules for an acting user (local operator chooses who they act as; this is not authentication).
export function userAccess(agency, userId) {
  if (!userId) return { role: 'Agency Owner', agency: true, settings: true, accounts: null, modules: null, permissionMode: 'unspecified', name: agency.profile.name || 'Agency Owner' };
  const user = agency.users.find(u => u.id === userId);
  if (!user) return null;
  const name = `${user.first} ${user.last}`;
  const saved = Array.isArray(user.permissions) ? user.permissions : [];
  const permissionMode = user.permissionMode || (saved.length ? 'restricted' : user.permissions ? 'inherit' : 'unspecified');
  const modules = permissionMode === 'inherit' || permissionMode === 'unspecified' ? null
    : permissionMode === 'restricted' ? saved : [];
  const role = user.role;
  const agencyMember = ['Agency Owner', 'Agency Admin', 'Agency User'].includes(role);
  return { role, agency: agencyMember, settings: role === 'Agency Owner' || role === 'Agency Admin',
    accounts: agencyMember ? null : Array.isArray(user.accounts) ? user.accounts : [], modules, permissionMode, name };
}
