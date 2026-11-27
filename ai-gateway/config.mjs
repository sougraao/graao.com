// Configuração do graao AI Gateway: um documento do store ('platform-ai'), editado só pelo dono da plataforma.
// O padrão é seguro: nenhum provedor ligado, nada pago, nada de dado pessoal para provedor não revisado.
// Valores monetários são inteiros em micro-dólares (1 US$ = 1.000.000), nunca float.
import { DATA_CLASSES, defaultPrivacy, sanitizePrivacy } from './privacy.mjs';
import { MODE_IDS } from './contracts.mjs';
import { PROVIDERS, providerById } from './providers/catalog.mjs';

export const CONFIG_ROW = 'platform-ai';
export const RUNTIME_ROW = 'platform-ai-runtime';

export const DEFAULT_WEIGHTS = Object.freeze({ cost: 0.3, quality: 0.25, availability: 0.2, speed: 0.15, capacity: 0.1 });
export const DEFAULT_FREE_ORDER = Object.freeze(['groq', 'openrouter', 'cloudflare', 'gemini', 'mistral']);

// Funcionalidades que já usam IA (todas pela chave própria da agência hoje) e as novas que passam pelo gateway.
// dataClass é o pior caso do contexto que cada uma envia.
export const FEATURES = Object.freeze({
  'graao.chat': { label: 'Pergunte ao Graao', dataClass: 'confidential', mode: 'auto' },
  'content.writer': { label: 'Escrita de conteúdo', dataClass: 'confidential', mode: 'auto' },
  'conversation.reply': { label: 'Respostas nas Conversas', dataClass: 'personal', mode: 'auto' },
  'agent.reply': { label: 'Agentes de IA', dataClass: 'personal', mode: 'agent' },
  'agent.design': { label: 'Criação de agentes', dataClass: 'internal', mode: 'pro' },
  'workflow.ai': { label: 'Ações de IA nas automações', dataClass: 'personal', mode: 'auto' },
  'blog.writer': { label: 'Blog', dataClass: 'internal', mode: 'auto' },
  'seo.writer': { label: 'SEO', dataClass: 'internal', mode: 'auto' },
  'social.writer': { label: 'Redes sociais', dataClass: 'internal', mode: 'auto' },
  'studio.site': { label: 'Estúdio de sites', dataClass: 'internal', mode: 'pro' },
  'meeting.summary': { label: 'Resumo de reuniões', dataClass: 'personal', mode: 'auto' },
  'legacy.openai': { label: 'Outras chamadas de IA', dataClass: 'confidential', mode: 'auto' },
  'admin.playground': { label: 'Playground (administração)', dataClass: 'internal', mode: 'auto' }
});

export const PLAN_IDS = Object.freeze(['free', 'paid', 'byok']);
const DEFAULT_PLANS = {
  free: { allowPaid: false, dailyRequests: 50, maxInputTokens: 16_000, maxOutputTokens: 2048, concurrency: 2, modes: ['auto', 'free', 'fast', 'embeddings'] },
  paid: { allowPaid: false, dailyRequests: 2000, maxInputTokens: 128_000, maxOutputTokens: 8192, concurrency: 8, modes: MODE_IDS.slice() },
  byok: { allowPaid: true, dailyRequests: 0, maxInputTokens: 0, maxOutputTokens: 0, concurrency: 16, modes: MODE_IDS.slice() }
};

const blankProvider = (id, index) => ({
  enabled: false, priority: DEFAULT_FREE_ORDER.includes(id) ? DEFAULT_FREE_ORDER.indexOf(id) : 10 + index,
  // O administrador confirma que a conta do graao neste provedor está no plano gratuito (sem cartão/cobrança).
  freeTier: false,
  // Liberar uso pago deste provedor (ainda limitado pelo orçamento e pelo kill switch).
  paidAllowed: false,
  // Os termos do provedor permitem o uso comercial do graao (revisado por pessoa). Sem isso, nada vai à rota automática.
  commercialUse: false,
  privacy: defaultPrivacy(),
  // Limites da conta informados pelo administrador (0 = desconhecido; o gateway usa contadores conservadores).
  limits: { rpm: 0, rpd: 0, tpm: 0, tpd: 0, tokensMonth: 0, concurrency: 4 },
  monthlyBudgetMicros: 0
});

export function blankConfig() {
  return {
    version: 1,
    killSwitch: { all: false, paid: false, reason: '', at: '' },
    providers: Object.fromEntries(PROVIDERS.map((provider, index) => [provider.id, blankProvider(provider.id, index)])),
    models: {},
    routing: {
      weights: { ...DEFAULT_WEIGHTS }, freeOrder: [...DEFAULT_FREE_ORDER],
      maxAttempts: 3, attemptTimeoutMs: 45_000, totalTimeoutMs: 90_000, retrySameMax: 1,
      breaker: { failures: 5, cooldownMs: 60_000 }
    },
    features: {},
    // Agências sem chave própria: 'off' (como hoje: pede a chave) ou 'free' (usa modelos gratuitos do graao).
    agenciesWithoutKey: 'off',
    plans: structuredClone(DEFAULT_PLANS),
    budgets: { monthlyMicros: 0, dailyMicros: 0, perOrgMonthlyMicros: 0, alertAt: 0.8 },
    cache: { enabled: true, ttlMs: 10 * 60_000 },
    logContent: false,
    prompts: {},
    updatedAt: ''
  };
}

/** Junta o documento salvo ao padrão (chaves novas de versões futuras aparecem sem migração). */
export function withDefaults(saved = {}) {
  const base = blankConfig();
  const config = { ...base, ...saved };
  config.killSwitch = { ...base.killSwitch, ...saved.killSwitch };
  config.providers = Object.fromEntries(PROVIDERS.map(provider => {
    const current = saved.providers?.[provider.id] || {};
    const merged = { ...base.providers[provider.id], ...current, limits: { ...base.providers[provider.id].limits, ...current.limits } };
    merged.privacy = sanitizePrivacy(current.privacy || {}, defaultPrivacy());
    return [provider.id, merged];
  }));
  config.routing = { ...base.routing, ...saved.routing, weights: { ...base.routing.weights, ...saved.routing?.weights }, breaker: { ...base.routing.breaker, ...saved.routing?.breaker } };
  config.plans = /** @type {any} */ (Object.fromEntries(PLAN_IDS.map(id => [id, { ...base.plans[id], ...saved.plans?.[id] }])));
  config.budgets = { ...base.budgets, ...saved.budgets };
  config.cache = { ...base.cache, ...saved.cache };
  config.models = saved.models || {};
  config.features = saved.features || {};
  config.prompts = saved.prompts || {};
  return config;
}

const int = (value, min, max, fallback) => {
  const parsed = Math.round(Number(value));
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};
const MAX_MICROS = 1_000_000 * 1_000_000; // US$ 1 milhão
/** Dólares digitados no painel (string/number) → micro-dólares inteiros, sem passar por float acumulado. */
export function dollarsToMicros(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!/^\d{1,7}(\.\d{1,6})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'));
}

/** Aplica uma alteração do painel. Só campos conhecidos; tudo validado. Devolve a lista do que mudou (auditoria). */
export function applySettings(config, input = {}) {
  const changes = [];
  const note = (what, value) => changes.push({ what, value });
  if (input.killSwitch && typeof input.killSwitch === 'object') {
    for (const key of ['all', 'paid']) if (input.killSwitch[key] !== undefined) { config.killSwitch[key] = Boolean(input.killSwitch[key]); note(`killSwitch.${key}`, config.killSwitch[key]); }
    config.killSwitch.reason = String(input.killSwitch.reason ?? config.killSwitch.reason ?? '').slice(0, 200);
    config.killSwitch.at = new Date().toISOString();
  }
  if (input.provider && typeof input.provider === 'object') {
    const id = String(input.provider.id || '');
    if (!providerById(id)) throw Object.assign(new Error('Provedor desconhecido.'), { status: 400 });
    const target = config.providers[id];
    const patch = input.provider;
    for (const key of ['enabled', 'freeTier', 'paidAllowed', 'commercialUse']) if (patch[key] !== undefined) { target[key] = Boolean(patch[key]); note(`${id}.${key}`, target[key]); }
    if (patch.priority !== undefined) { target.priority = int(patch.priority, 0, 99, target.priority); note(`${id}.priority`, target.priority); }
    if (patch.limits) for (const key of Object.keys(target.limits)) if (patch.limits[key] !== undefined) { target.limits[key] = int(patch.limits[key], 0, 1e12, target.limits[key]); note(`${id}.limits.${key}`, target.limits[key]); }
    if (patch.privacy) { target.privacy = sanitizePrivacy(patch.privacy, target.privacy); note(`${id}.privacy`, target.privacy.maxClass); }
    if (patch.monthlyBudget !== undefined) {
      const micros = dollarsToMicros(patch.monthlyBudget);
      if (micros === null) throw Object.assign(new Error('Orçamento do provedor inválido.'), { status: 400 });
      target.monthlyBudgetMicros = Math.min(micros, MAX_MICROS); note(`${id}.monthlyBudget`, target.monthlyBudgetMicros);
    }
  }
  if (input.routing && typeof input.routing === 'object') {
    const routing = input.routing;
    if (routing.weights) {
      const weights = {};
      for (const key of Object.keys(DEFAULT_WEIGHTS)) weights[key] = Math.max(0, Math.min(1, Number(routing.weights[key] ?? config.routing.weights[key]) || 0));
      const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
      if (total <= 0) throw Object.assign(new Error('Os pesos precisam somar mais que zero.'), { status: 400 });
      config.routing.weights = Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, Math.round(value / total * 1000) / 1000]));
      note('routing.weights', config.routing.weights);
    }
    if (Array.isArray(routing.freeOrder)) {
      const order = routing.freeOrder.filter(id => providerById(id)).filter((id, index, list) => list.indexOf(id) === index);
      config.routing.freeOrder = order; note('routing.freeOrder', order);
    }
    if (routing.maxAttempts !== undefined) { config.routing.maxAttempts = int(routing.maxAttempts, 1, 6, 3); note('routing.maxAttempts', config.routing.maxAttempts); }
    if (routing.attemptTimeoutMs !== undefined) config.routing.attemptTimeoutMs = int(routing.attemptTimeoutMs, 5000, 280_000, 45_000);
    if (routing.totalTimeoutMs !== undefined) config.routing.totalTimeoutMs = int(routing.totalTimeoutMs, 5000, 290_000, 90_000);
    if (routing.breaker) config.routing.breaker = { failures: int(routing.breaker.failures, 1, 50, 5), cooldownMs: int(routing.breaker.cooldownMs, 5000, 3_600_000, 60_000) };
  }
  if (input.feature && typeof input.feature === 'object') {
    const id = String(input.feature.id || '');
    if (!/^[a-z][a-z0-9_.-]{1,63}$/.test(id)) throw Object.assign(new Error('Funcionalidade inválida.'), { status: 400 });
    const current = config.features[id] || {};
    const patch = input.feature;
    config.features[id] = {
      mode: MODE_IDS.includes(patch.mode) ? patch.mode : current.mode || FEATURES[id]?.mode || 'auto',
      dataClass: DATA_CLASSES.includes(patch.dataClass) ? patch.dataClass : current.dataClass || FEATURES[id]?.dataClass || 'confidential',
      allowPaid: patch.allowPaid === undefined ? Boolean(current.allowPaid) : Boolean(patch.allowPaid),
      disabled: patch.disabled === undefined ? Boolean(current.disabled) : Boolean(patch.disabled),
      monthlyBudgetMicros: patch.monthlyBudget !== undefined ? (dollarsToMicros(patch.monthlyBudget) ?? 0) : current.monthlyBudgetMicros || 0
    };
    note(`feature.${id}`, config.features[id]);
  }
  if (input.agenciesWithoutKey !== undefined) {
    config.agenciesWithoutKey = input.agenciesWithoutKey === 'free' ? 'free' : 'off';
    note('agenciesWithoutKey', config.agenciesWithoutKey);
  }
  if (input.plan && typeof input.plan === 'object' && PLAN_IDS.includes(input.plan.id)) {
    const target = config.plans[input.plan.id];
    const patch = input.plan;
    if (patch.allowPaid !== undefined && input.plan.id !== 'byok') target.allowPaid = Boolean(patch.allowPaid);
    for (const key of ['dailyRequests', 'maxInputTokens', 'maxOutputTokens', 'concurrency']) if (patch[key] !== undefined) target[key] = int(patch[key], 0, 10_000_000, target[key]);
    if (Array.isArray(patch.modes)) target.modes = patch.modes.filter(mode => MODE_IDS.includes(mode));
    note(`plan.${input.plan.id}`, target);
  }
  if (input.budgets && typeof input.budgets === 'object') {
    for (const [field, key] of [['monthly', 'monthlyMicros'], ['daily', 'dailyMicros'], ['perOrgMonthly', 'perOrgMonthlyMicros']]) {
      if (input.budgets[field] === undefined) continue;
      const micros = dollarsToMicros(input.budgets[field]);
      if (micros === null) throw Object.assign(new Error('Valor de orçamento inválido. Use dólares, como 25 ou 25.50.'), { status: 400 });
      config.budgets[key] = Math.min(micros, MAX_MICROS); note(`budgets.${key}`, config.budgets[key]);
    }
    if (input.budgets.alertAt !== undefined) config.budgets.alertAt = Math.max(0.1, Math.min(1, Number(input.budgets.alertAt) || 0.8));
  }
  if (input.cache && typeof input.cache === 'object') {
    if (input.cache.enabled !== undefined) config.cache.enabled = Boolean(input.cache.enabled);
    if (input.cache.ttlMs !== undefined) config.cache.ttlMs = int(input.cache.ttlMs, 0, 24 * 3_600_000, config.cache.ttlMs);
    note('cache', config.cache);
  }
  config.updatedAt = new Date().toISOString();
  return changes;
}

/** Política efetiva da funcionalidade (padrão do catálogo + ajuste do administrador). */
export function featurePolicy(config, feature) {
  const base = FEATURES[feature] || FEATURES['legacy.openai'];
  return { mode: base.mode, dataClass: base.dataClass, allowPaid: false, disabled: false, monthlyBudgetMicros: 0, ...config.features?.[feature] };
}
