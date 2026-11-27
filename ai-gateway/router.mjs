// graao Intelligent Router. Duas etapas:
// A) filtros obrigatórios: qualquer motivo tira o modelo da rota (e o motivo aparece na simulação do painel);
// B) pontuação dos elegíveis com pesos configuráveis (custo, qualidade, disponibilidade, velocidade, capacidade).
// Free-first: nos modos de uso geral, modelos gratuitos vêm antes, na ordem de provedores do administrador;
// depois a chave própria da organização (BYOK); por último o pago autorizado.
import { MODES } from './contracts.mjs';
import { featurePolicy } from './config.mjs';
import { isFree, priceKnown } from './registry.mjs';
import { privacyAllows, rankOf } from './privacy.mjs';
import { breakerAllows, CONSERVATIVE_FREE_LIMITS, quotaCheck } from './limits.mjs';
import { worstCaseMicros } from './accounting.mjs';

const FREE_FIRST_MODES = new Set(['auto', 'free', 'fast', 'agent', 'vision', 'embeddings']);
const UNKNOWN_CONTEXT_MAX = 8000; // janela desconhecida: só pedidos pequenos

export const scopes = model => ({ provider: `p:${model.provider}`, model: `m:${model.key}` });

function limitsFor(model, providerConfig, free) {
  const provider = providerConfig.limits || {};
  const own = { rpm: model.limits?.rpm || 0, rpd: model.limits?.rpd || 0, tpm: model.limits?.tpm || 0, tpd: model.limits?.tpd || 0 };
  const unknown = !own.rpm && !own.rpd && !own.tpm && !own.tpd;
  return { model: free && unknown ? { ...CONSERVATIVE_FREE_LIMITS } : own, provider: { rpm: provider.rpm || 0, rpd: provider.rpd || 0, tpm: provider.tpm || 0, tpd: provider.tpd || 0, tokensMonth: provider.tokensMonth || 0 } };
}

/**
 * @param {object} req pedido normalizado (contracts.normalizeRequest)
 * @param {object} ctx { org, plan, credentials: { [providerId]: 'global' | 'org' }, estimatedInputTokens, now }
 * @param {object} config documento de configuração (withDefaults)
 * @param {object} runtime documento de execução (withRuntimeDefaults); só lido aqui
 */
export function route(req, ctx, config, runtime) {
  const now = ctx.now ?? Date.now();
  const policy = featurePolicy(config, req.feature);
  const mode = req.mode === 'auto' && policy.mode ? policy.mode : req.mode;
  const profile = MODES[mode] || MODES.auto;
  const plan = config.plans[ctx.plan] || config.plans.free;
  const needs = new Set([...req.needs, ...profile.needs]);
  const wantsEmbeddings = mode === 'embeddings' || needs.has('embeddings');
  const tokens = ctx.estimatedInputTokens || 0;
  const candidates = [], rejected = [];
  // Cópia para leitura: checar cota/circuito rola janelas e muda estado, e aqui nada pode ser gravado.
  const view = structuredClone(runtime);
  // A classe efetiva é a mais restrita entre a declarada no pedido e a da funcionalidade.
  const dataClass = req.dataClass && rankOf(req.dataClass) > rankOf(policy.dataClass) ? req.dataClass : policy.dataClass;
  const explicit = req.model && ctx.plan !== 'free' ? req.model : '';

  for (const model of Object.values(config.models)) {
    const reasons = [];
    const providerConfig = config.providers[model.provider];
    if (!providerConfig) continue;
    const credential = ctx.credentials?.[model.provider];
    const byok = credential === 'org';
    if (explicit && explicit !== model.key && explicit !== model.providerModelId) continue;
    if (!credential) reasons.push('sem credencial');
    if (!byok && !providerConfig.enabled) reasons.push('provedor desligado');
    if (!model.enabled) reasons.push('modelo desligado');
    if (model.status !== 'active') reasons.push(`modelo ${model.status}`);
    if (wantsEmbeddings ? !model.caps.embeddings : !model.caps.text) reasons.push('não faz esta tarefa');
    for (const need of needs) if (need !== 'embeddings' && !model.caps[need]) reasons.push(`sem suporte a ${need}`);
    if (!plan.modes.includes(mode)) reasons.push('modo fora do plano');
    if (model.plans?.length && !model.plans.includes(ctx.plan)) reasons.push('modelo fora do plano');
    if (plan.maxInputTokens > 0 && tokens > plan.maxInputTokens) reasons.push('contexto acima do plano');
    const window = model.contextWindow;
    if (window ? tokens + Math.min(req.maxOutputTokens, model.maxOutput || req.maxOutputTokens) > window : tokens > UNKNOWN_CONTEXT_MAX) reasons.push('contexto excedido');
    if (!byok && !privacyAllows(providerConfig.privacy, dataClass)) reasons.push('privacidade incompatível');
    if (!byok && !(model.commercial ?? providerConfig.commercialUse)) reasons.push('uso comercial não confirmado');

    const free = !byok && isFree(model, providerConfig);
    const tier = free ? 'free' : byok ? 'byok' : 'paid';
    let worst = null;
    if (tier === 'paid') {
      if (!priceKnown(model)) reasons.push('preço desconhecido');
      else worst = worstCaseMicros(model.pricing, tokens, req.maxOutputTokens);
      if (mode === 'free' || profile.freeOnly) reasons.push('modo só gratuito');
      if (config.killSwitch.paid) reasons.push('pago bloqueado (kill switch)');
      if (!providerConfig.paidAllowed) reasons.push('pago não liberado no provedor');
      if (!(plan.allowPaid || policy.allowPaid)) reasons.push('pago não autorizado no plano');
    }
    if (tier === 'byok' && (mode === 'free' || profile.freeOnly)) reasons.push('modo só gratuito');

    const s = scopes(model);
    if (!breakerAllows(view, model.provider, now)) reasons.push('provedor em pausa (circuit breaker)');
    if (!byok) {
      const limits = limitsFor(model, providerConfig, free);
      const providerQuota = quotaCheck(view, s.provider, limits.provider, tokens, now);
      const modelQuota = quotaCheck(view, s.model, limits.model, tokens, now);
      if (!providerQuota.ok) reasons.push(`cota do provedor (${providerQuota.reason})`);
      if (!modelQuota.ok) reasons.push(`cota do modelo (${modelQuota.reason})`);
    } else if ((runtime.cooldown[s.model] || 0) > now) reasons.push('em espera (rate limit)');

    if (reasons.length) { rejected.push({ key: model.key, reasons }); continue; }
    candidates.push({ model, tier, byok, free, worstCaseMicros: worst, score: 0, breakdown: null });
  }
  if (!candidates.length) return { mode, policy, dataClass, candidates: [], rejected };

  // Etapa B: pontuação.
  const weights = profile.weights || config.routing.weights;
  const blended = c => c.model.pricing ? c.model.pricing.inputMicrosPerM + 3 * c.model.pricing.outputMicrosPerM : 0;
  const maxPrice = Math.max(1, ...candidates.map(blended));
  for (const candidate of candidates) {
    const { model } = candidate;
    const health = runtime.health[model.provider] || {};
    const observed = runtime.models[model.key] || {};
    const latency = observed.latencyMs ?? health.latencyMs ?? null;
    const remote = runtime.quota[`p:${model.provider}`]?.remote;
    const capacity = remote?.limitRequests > 0 && remote.remainingRequests !== null ? remote.remainingRequests / remote.limitRequests : 0.5;
    const breakdown = {
      cost: candidate.tier === 'free' ? 1 : candidate.tier === 'byok' ? 0.8 : Math.max(0, 0.7 * (1 - blended(candidate) / maxPrice)),
      quality: Math.max(0, Math.min(1, (model.quality ?? 0.5) * (0.7 + 0.3 * (observed.successRate ?? 1)))),
      availability: Math.max(0, Math.min(1, (health.successRate ?? 1) * (health.state === 'half' ? 0.5 : 1))),
      speed: latency === null ? 0.5 : 1 / (1 + latency / 2000),
      capacity: Math.max(0, Math.min(1, capacity))
    };
    candidate.breakdown = breakdown;
    candidate.score = Math.round(Object.entries(weights).reduce((sum, [key, weight]) => sum + weight * (breakdown[key] ?? 0), 0) * 1000) / 1000;
  }
  const freeFirst = FREE_FIRST_MODES.has(mode);
  const order = config.routing.freeOrder;
  const rank = c => order.includes(c.model.provider) ? order.indexOf(c.model.provider) : order.length + (config.providers[c.model.provider]?.priority ?? 50);
  const tierRank = c => ctx.preferByok && c.tier === 'byok' ? -1 : ({ free: 0, byok: 1, paid: 2 })[c.tier];
  candidates.sort((a, b) => {
    if (freeFirst || ctx.preferByok) {
      const tiers = tierRank(a) - tierRank(b);
      if (tiers) return tiers;
      if (a.tier === 'free' && b.tier === 'free' && rank(a) !== rank(b)) return rank(a) - rank(b);
    }
    return b.score - a.score || a.model.key.localeCompare(b.model.key);
  });
  return { mode, policy, dataClass, candidates, rejected };
}

/**
 * Ordem das tentativas: a lista do roteador, no máximo `maxAttempts`, sem repetir um provedor que já falhou por
 * motivo do provedor (o gateway filtra em tempo de execução com `skipProviders`).
 */
export function attemptPlan(candidates, maxAttempts) {
  return candidates.slice(0, Math.max(1, maxAttempts * 3));
}
