// graao Model Registry: os modelos que o gateway conhece, vindos da sincronização com a API oficial de cada provedor
// e da revisão do administrador. Regras:
// - gratuidade nunca pelo nome: só quando a API informa preço zero (OpenRouter) ou quando o administrador confirma
//   que a conta do graao está no plano gratuito do provedor E marca o modelo como incluído nele;
// - preço desconhecido = fora da rota automática até alguém informar;
// - modelo que some da listagem do provedor fica 'inactive' (descontinuado), não é apagado.
import { CAPABILITIES } from './contracts.mjs';
import { providerById } from './providers/catalog.mjs';

export const MODEL_STATUSES = Object.freeze(['active', 'deprecated', 'inactive', 'blocked']);
export const modelKey = (provider, providerModelId) => `${provider}/${providerModelId}`;

const caps = (input = {}) => Object.fromEntries(CAPABILITIES.map(cap => [cap, Boolean(input[cap])]));
const num = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : null;

/** Entrada nova a partir de uma linha da listagem do provedor. */
function fromListing(providerId, row, now) {
  return {
    key: modelKey(providerId, row.providerModelId), provider: providerId, providerModelId: row.providerModelId,
    name: String(row.name || row.providerModelId).slice(0, 120), description: String(row.description || '').slice(0, 200),
    status: MODEL_STATUSES.includes(row.status) ? row.status : 'active', type: /embed/i.test(row.providerModelId) && !row.caps?.text ? 'embedding' : 'chat',
    caps: caps(row.caps), contextWindow: num(row.contextWindow), maxOutput: num(row.maxOutput),
    pricing: row.pricing ? { inputMicrosPerM: row.pricing.inputMicrosPerM, outputMicrosPerM: row.pricing.outputMicrosPerM, requestMicros: row.pricing.requestMicros ?? 0, source: 'api', verifiedAt: now } : null,
    free: null, enabled: true, quality: 0.5, commercial: null, modes: [], plans: [], limits: { rpm: 0, rpd: 0, tpm: 0, tpd: 0 },
    syncedAt: now, source: providerById(providerId)?.pricing || providerById(providerId)?.docs || '', expiresAt: row.expiresAt || ''
  };
}

/** Funde a listagem sincronizada no registro, preservando tudo o que o administrador revisou. Devolve um resumo. */
export function mergeSync(config, providerId, rows, now = new Date().toISOString()) {
  const seen = new Set();
  let added = 0, updated = 0, retired = 0;
  for (const row of rows) {
    const key = modelKey(providerId, row.providerModelId);
    seen.add(key);
    const incoming = fromListing(providerId, row, now);
    const current = config.models[key];
    if (!current) { config.models[key] = incoming; added++; continue; }
    // Da API: capacidades, janela, status do provedor e preço com fonte 'api'. Do administrador: o resto.
    current.name = incoming.name;
    current.description = incoming.description || current.description;
    current.contextWindow = incoming.contextWindow ?? current.contextWindow;
    current.maxOutput = incoming.maxOutput ?? current.maxOutput;
    current.caps = { ...current.caps, ...Object.fromEntries(Object.entries(incoming.caps).filter(([, value]) => value)) };
    if (current.status !== 'blocked') current.status = incoming.status;
    if (incoming.pricing && current.pricing?.source !== 'admin') current.pricing = incoming.pricing;
    // Preço da API mudou de zero para pago: a gratuidade confirmada pela API cai na hora.
    if (current.free?.source === 'api' && !isZeroPrice(current.pricing)) current.free = null;
    current.syncedAt = now;
    current.expiresAt = incoming.expiresAt;
    updated++;
  }
  for (const model of Object.values(config.models)) {
    if (model.provider === providerId && !seen.has(model.key) && model.status === 'active' && model.source !== 'admin-manual') { model.status = 'inactive'; retired++; }
  }
  // Gratuidade confirmada pela API (preço zero na listagem oficial).
  for (const key of seen) {
    const model = config.models[key];
    if (isZeroPrice(model.pricing) && model.pricing.source === 'api' && !model.free) model.free = { verified: true, source: 'api', at: now };
  }
  return { added, updated, retired, total: seen.size };
}

export const isZeroPrice = pricing => Boolean(pricing) && pricing.inputMicrosPerM === 0 && pricing.outputMicrosPerM === 0 && !(pricing.requestMicros > 0);
export const priceKnown = model => Boolean(model.pricing) && Number.isInteger(model.pricing.inputMicrosPerM) && Number.isInteger(model.pricing.outputMicrosPerM);

/**
 * O modelo custa zero PARA O GRAAO agora? Preço zero da API, ou plano gratuito da conta confirmado no provedor
 * e o modelo marcado pelo administrador como incluído nesse plano.
 */
export function isFree(model, providerConfig) {
  if (!model.free?.verified) return false;
  if (model.free.source === 'api') return isZeroPrice(model.pricing);
  return Boolean(providerConfig?.freeTier);
}

/** Revisão do administrador num modelo. Lança erro de validação; devolve o modelo. */
export function reviewModel(config, key, patch = {}, now = new Date().toISOString()) {
  const model = config.models[key];
  if (!model) throw Object.assign(new Error('Modelo não encontrado. Sincronize o provedor ou cadastre o modelo.'), { status: 404 });
  if (patch.enabled !== undefined) model.enabled = Boolean(patch.enabled);
  if (patch.blocked !== undefined) model.status = patch.blocked ? 'blocked' : model.status === 'blocked' ? 'active' : model.status;
  if (patch.quality !== undefined) model.quality = Math.max(0, Math.min(1, Number(patch.quality) || 0));
  if (patch.commercial !== undefined) model.commercial = patch.commercial === null ? null : Boolean(patch.commercial);
  if (patch.caps) model.caps = { ...model.caps, ...caps({ ...model.caps, ...patch.caps }) };
  if (patch.contextWindow !== undefined) model.contextWindow = num(patch.contextWindow);
  if (patch.maxOutput !== undefined) model.maxOutput = num(patch.maxOutput);
  if (Array.isArray(patch.modes)) model.modes = patch.modes.filter(mode => typeof mode === 'string').slice(0, 10);
  if (Array.isArray(patch.plans)) model.plans = patch.plans.filter(plan => ['free', 'paid', 'byok'].includes(plan));
  if (patch.limits) for (const key of ['rpm', 'rpd', 'tpm', 'tpd']) if (patch.limits[key] !== undefined) model.limits[key] = Math.max(0, Math.round(Number(patch.limits[key]) || 0));
  if (patch.pricing) {
    const input = Number(patch.pricing.inputMicrosPerM), output = Number(patch.pricing.outputMicrosPerM);
    if (!Number.isInteger(input) || !Number.isInteger(output) || input < 0 || output < 0) throw Object.assign(new Error('Preço inválido.'), { status: 400 });
    model.pricing = { inputMicrosPerM: input, outputMicrosPerM: output, requestMicros: Math.max(0, Math.round(Number(patch.pricing.requestMicros) || 0)), source: 'admin', verifiedAt: now };
    if (model.free?.source === 'api' && !isZeroPrice(model.pricing)) model.free = null;
  }
  // "Incluído no plano gratuito da conta": só vale com o plano gratuito do provedor confirmado (isFree confere).
  if (patch.freeTier !== undefined) model.free = patch.freeTier ? { verified: true, source: 'admin', at: now } : null;
  return model;
}

/** Cadastro manual (servidor próprio, Cloudflare, modelos que a API não lista). */
export function addManualModel(config, { provider, providerModelId, name, type = 'chat', caps: capabilities = {}, contextWindow, maxOutput }, now = new Date().toISOString()) {
  if (!providerById(provider)) throw Object.assign(new Error('Provedor desconhecido.'), { status: 400 });
  const id = String(providerModelId || '').trim();
  if (!/^[A-Za-z0-9@._:/-]{1,160}$/.test(id)) throw Object.assign(new Error('Identificador do modelo inválido.'), { status: 400 });
  const key = modelKey(provider, id);
  if (config.models[key]) throw Object.assign(new Error('Esse modelo já está no registro.'), { status: 409 });
  config.models[key] = { ...fromListing(provider, { providerModelId: id, name: name || id, caps: { text: type !== 'embedding', stream: type !== 'embedding', embeddings: type === 'embedding', ...capabilities }, contextWindow, maxOutput }, now),
    type: type === 'embedding' ? 'embedding' : 'chat', pricing: null, source: 'admin-manual' };
  return config.models[key];
}

/** Visão pública do registro para o painel (sem campos internos). */
export function listModels(config, { provider = '', query = '', onlyEligible = false } = {}) {
  const text = String(query).toLowerCase();
  return Object.values(config.models)
    .filter(model => !provider || model.provider === provider)
    .filter(model => !text || model.key.toLowerCase().includes(text) || model.name.toLowerCase().includes(text))
    .map(model => ({ ...model, isFree: isFree(model, config.providers[model.provider]), priceKnown: priceKnown(model) }))
    .filter(model => !onlyEligible || (model.enabled && model.status === 'active' && (model.isFree || model.priceKnown)))
    .sort((a, b) => Number(b.isFree) - Number(a.isFree) || a.key.localeCompare(b.key));
}
