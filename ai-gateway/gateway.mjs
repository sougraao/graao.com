// graao AI Gateway: a camada única entre as funcionalidades do graao e os provedores de IA.
//
//   funcionalidade → graaoAI.generate/stream/structured/embed/agent (pedido normalizado + contexto do servidor)
//     → kill switch e política da funcionalidade → roteador (filtros + pontuação, free-first)
//     → para cada tentativa: reserva atômica (cota, concorrência, orçamento) → adapter → conciliação
//     → log de requisição (metadados) → resposta normalizada
//
// Identidade (organização, usuário, plano, chave BYOK) vem SEMPRE do contexto montado pelo servidor a partir da
// sessão (ver server.mjs), nunca do corpo enviado pelo navegador.
import { randomUUID, createHash } from 'node:crypto';
import { blankUsage, fromResponsesBody, normalizeRequest, toResponsesResult } from './contracts.mjs';
import { canFallback, canRetrySame, classifyThrown, countsForBreaker, GatewayError } from './errors.mjs';
import { applySettings, blankConfig, CONFIG_ROW, featurePolicy, FEATURES, RUNTIME_ROW, withDefaults } from './config.mjs';
import { addManualModel, isFree, listModels, mergeSync, priceKnown, reviewModel } from './registry.mjs';
import { route, scopes } from './router.mjs';
import { acquire, applyRemoteLimits, blankRuntime, breakerAllows, breakerRecord, budgetReserve, budgetSettle, budgetView, CONSERVATIVE_FREE_LIMITS, observeModel,
  planDailyAllows, planDailyCount, quotaCheck, quotaConsume, quotaReconcile, release, setCooldown, withRuntimeDefaults } from './limits.mjs';
import { costMicros, estimateInputTokens, worstCaseMicros } from './accounting.mjs';
import { cacheable, cacheKey, createMemoryCache } from './cache.mjs';
import { createAdapter, globalCredential, providerById, PROVIDERS } from './providers/index.mjs';
import { validateProviderUrl } from './ssrf.mjs';
import { memoryRequestLog } from './request-log.mjs';
import { redact } from './privacy.mjs';
import { listPrompts, publishVersion, renderPrompt, saveVersion } from './prompts.mjs';

const CONFIG_TTL_MS = 10_000;
const AUDIT_MAX = 300;
const ALERTS_MAX = 50;
const RETENTION_DAYS = 180;

const sleepFor = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

/** Valida o esquema JSON mínimo (tipos e obrigatórios do primeiro nível) sem biblioteca externa. */
export function checkSchema(value, schema) {
  if (!schema || typeof schema !== 'object') return true;
  const type = schema.type;
  if (type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    for (const key of schema.required || []) if (!(key in value)) return false;
    for (const [key, sub] of Object.entries(schema.properties || {})) if (key in value && !checkSchema(value[key], sub)) return false;
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!(key in (schema.properties || {}))) return false;
    return true;
  }
  if (type === 'array') return Array.isArray(value) && (!schema.items || value.every(item => checkSchema(item, schema.items)));
  if (type === 'string') return typeof value === 'string' && (!schema.enum || schema.enum.includes(value));
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (Array.isArray(type)) return type.some(option => checkSchema(value, { ...schema, type: option }));
  return true;
}

function parseStructured(text, schema) {
  const raw = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  let value;
  try { value = JSON.parse(raw); } catch { return { ok: false }; }
  return checkSchema(value, schema?.schema) ? { ok: true, value } : { ok: false };
}

/** Mensagem amigável quando nenhum modelo sobrou, pelo motivo que mais apareceu. */
function noRouteError(rejected) {
  const reasons = rejected.flatMap(item => item.reasons);
  const count = word => reasons.filter(reason => reason.includes(word)).length;
  if (!reasons.length) return new GatewayError('no_route', { internal: 'registro vazio' });
  if (count('cota') && count('cota') >= reasons.length / 3) return new GatewayError('quota_exhausted', { internal: 'cotas esgotadas' });
  if (count('pago') && rejected.every(item => item.reasons.some(reason => reason.includes('pago') || reason.includes('cota') || reason.includes('sem credencial') || reason.includes('desligado')))) {
    return new GatewayError('no_route', { internal: 'só restaram modelos pagos não autorizados' });
  }
  if (count('contexto excedido') === rejected.length) return new GatewayError('context_exceeded', { internal: 'contexto' });
  return new GatewayError('no_route', { internal: redact(reasons.slice(0, 5).join('; '), 200) });
}

/**
 * Opções: store (load/insert/change + aiRequests opcional), env (chaves globais dos provedores), request (fetch),
 * clock, random, cache, allowLocalUrls (aceitar http://localhost como servidor próprio, só desenvolvimento),
 * resolveHost (DNS, para testes), log e sleep.
 * @param {any} [options]
 */
export function createGraaoAI({ store, env = process.env, request = fetch, clock = Date.now, random = Math.random, cache = createMemoryCache(),
  allowLocalUrls = false, resolveHost, log = null, sleep = sleepFor } = {}) {
  const requestLog = store?.aiRequests || memoryRequestLog();
  let configCache = null;
  const verifiedUrls = new Map();
  const inflight = new Map(); // idempotência dentro da instância: mesma chave = mesma promessa

  // ---------- Documentos ----------
  async function loadRow(id, blank) {
    try { return await store.load(id); }
    catch (error) { if (error.status === 404) return blank(); throw error; }
  }
  async function loadConfig({ fresh = false } = {}) {
    if (!fresh && configCache && clock() - configCache.at < CONFIG_TTL_MS) return configCache.value;
    const value = withDefaults(await loadRow(CONFIG_ROW, blankConfig));
    configCache = { at: clock(), value };
    return value;
  }
  // go_workspaces.name é gerada de state.profile.name e não aceita nulo: todo documento leva um nome.
  async function changeRow(id, label, blank, normalize, mutate) {
    try { await store.load(id); }
    catch (error) { if (error.status !== 404) throw error; await store.insert(id, { ...blank(), profile: { name: label } }); }
    return store.change(id, state => {
      const value = normalize(state);
      const result = mutate(value);
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, value, { profile: { name: label } });
      return result;
    });
  }
  const changeConfig = async mutate => { const result = await changeRow(CONFIG_ROW, 'AI Gateway', blankConfig, withDefaults, mutate); configCache = null; return result; };
  const changeRuntime = mutate => changeRow(RUNTIME_ROW, 'AI Gateway (estado)', blankRuntime, withRuntimeDefaults, mutate);
  const loadRuntime = async () => withRuntimeDefaults(await loadRow(RUNTIME_ROW, blankRuntime));

  // ---------- Credenciais ----------
  async function credentialFor(provider, ctx, source) {
    if (source === 'org') {
      const apiKey = ctx.byok?.[provider.id];
      if (!apiKey) return null;
      const global = globalCredential(provider, env);
      return { baseUrl: global.baseUrl || (typeof provider.baseUrl === 'string' ? provider.baseUrl : ''), apiKey };
    }
    const global = globalCredential(provider, env);
    if (!global.configured) return null;
    if (provider.customUrl) {
      // Revalida a URL (DNS pode mudar depois da configuração) no máximo a cada 5 minutos.
      const seen = verifiedUrls.get(global.baseUrl);
      if (!seen || clock() - seen > 5 * 60_000) {
        await validateProviderUrl(global.baseUrl, { allowLocal: allowLocalUrls, ...(resolveHost && { resolve: resolveHost }) });
        verifiedUrls.set(global.baseUrl, clock());
      }
    }
    return { baseUrl: global.baseUrl, apiKey: global.apiKey };
  }
  function credentialMap(ctx) {
    const map = {};
    for (const provider of PROVIDERS) {
      if (ctx.byok?.[provider.id]) map[provider.id] = 'org';
      else if (globalCredential(provider, env).configured) map[provider.id] = 'global';
    }
    return map;
  }

  function context(ctx = {}) {
    const org = String(ctx.org || '').slice(0, 120);
    if (!org) throw new GatewayError('invalid_request', { internal: 'contexto sem organização' });
    const byok = ctx.byok && typeof ctx.byok === 'object' ? ctx.byok : {};
    const plan = Object.keys(byok).length && ctx.plan !== 'paid' ? 'byok' : ['free', 'paid', 'byok'].includes(ctx.plan) ? ctx.plan : 'free';
    return { org, workspace: String(ctx.workspace || '').slice(0, 120), user: String(ctx.user || '').slice(0, 120), plan, byok,
      preferByok: ctx.preferByok !== false && Object.keys(byok).length > 0, permissions: new Set(ctx.permissions || []), onUsage: ctx.onUsage };
  }

  // ---------- Log e alertas ----------
  async function writeLog(entry) {
    try { await requestLog.append([entry]); }
    catch (error) { log?.warn?.(`[ai-gateway] log indisponível: ${error.code || error.message}`); }
  }
  function pushAlert(runtime, level, text) {
    runtime.alerts.unshift({ at: new Date(clock()).toISOString(), level, text: String(text).slice(0, 200) });
    runtime.alerts.splice(ALERTS_MAX);
  }

  // ---------- Reserva e conciliação (atômicas no documento de execução) ----------
  async function reserve(candidate, req, ctx, config, attemptId, estimatedTokens, firstAttempt) {
    const { model } = candidate;
    const providerConfig = config.providers[model.provider];
    const s = scopes(model);
    const plan = config.plans[ctx.plan];
    const policy = featurePolicy(config, req.feature);
    const micros = candidate.tier === 'paid' ? worstCaseMicros(model.pricing, estimatedTokens, req.maxOutputTokens) : 0;
    try {
      return await changeRuntime(runtime => {
        const now = clock();
        if (!breakerAllows(runtime, model.provider, now)) return { ok: false, reason: 'breaker' };
        if (firstAttempt && !planDailyAllows(runtime, ctx.org, plan.dailyRequests, now)) return { ok: false, reason: 'plan-daily', final: 'quota_exhausted' };
        if (!candidate.byok) {
          const free = candidate.tier === 'free';
          const modelLimits = { rpm: model.limits?.rpm || 0, rpd: model.limits?.rpd || 0, tpm: model.limits?.tpm || 0, tpd: model.limits?.tpd || 0 };
          const unknown = !modelLimits.rpm && !modelLimits.rpd && !modelLimits.tpm && !modelLimits.tpd;
          const providerCheck = quotaCheck(runtime, s.provider, providerConfig.limits, estimatedTokens, now);
          const modelCheck = quotaCheck(runtime, s.model, free && unknown ? CONSERVATIVE_FREE_LIMITS : modelLimits, estimatedTokens, now);
          if (!providerCheck.ok || !modelCheck.ok) return { ok: false, reason: `quota:${providerCheck.reason || modelCheck.reason}` };
        }
        if (!acquire(runtime, `org:${ctx.org}`, plan.concurrency, attemptId, now)) return { ok: false, reason: 'concurrency', final: 'rate_limit' };
        if (!candidate.byok && !acquire(runtime, `p:${model.provider}`, providerConfig.limits.concurrency, attemptId, now)) { release(runtime, `org:${ctx.org}`, attemptId); return { ok: false, reason: 'provider-concurrency' }; }
        if (micros > 0) {
          const result = budgetReserve(runtime, { id: attemptId, micros, org: ctx.org, feature: req.feature, provider: model.provider }, {
            dailyMicros: config.budgets.dailyMicros, monthlyMicros: config.budgets.monthlyMicros, perOrgMonthlyMicros: config.budgets.perOrgMonthlyMicros,
            featureMonthlyMicros: policy.monthlyBudgetMicros, providerMonthlyMicros: providerConfig.monthlyBudgetMicros }, now);
          if (!result.ok) { release(runtime, `org:${ctx.org}`, attemptId); release(runtime, `p:${model.provider}`, attemptId); return { ok: false, reason: `budget:${result.reason}`, budget: true }; }
        }
        if (!candidate.byok) { quotaConsume(runtime, s.provider, estimatedTokens, now); quotaConsume(runtime, s.model, estimatedTokens, now); }
        if (firstAttempt) planDailyCount(runtime, ctx.org, now);
        return { ok: true, micros, at: now };
      });
    } catch (error) {
      // Sem o documento de execução não há como garantir orçamento: pago para; gratuito/BYOK seguem (degradado).
      log?.warn?.(`[ai-gateway] reserva indisponível: ${error.message}`);
      if (micros > 0) return { ok: false, reason: 'runtime-unavailable', budget: true };
      return { ok: true, micros: 0, at: clock(), degraded: true };
    }
  }

  async function settle(candidate, req, ctx, config, attemptId, reservation, outcome) {
    const { model } = candidate;
    const s = scopes(model);
    if (reservation.degraded) return;
    try {
      await changeRuntime(runtime => {
        const now = clock();
        release(runtime, `org:${ctx.org}`, attemptId);
        release(runtime, `p:${model.provider}`, attemptId);
        if (!candidate.byok) {
          const actual = outcome.usage ? outcome.usage.inputTokens + outcome.usage.outputTokens : 0;
          quotaReconcile(runtime, s.provider, outcome.estimatedTokens, actual, reservation.at, now);
          quotaReconcile(runtime, s.model, outcome.estimatedTokens, actual, reservation.at, now);
          applyRemoteLimits(runtime, s.provider, outcome.rateLimit, now);
        }
        if (outcome.error) {
          const kind = outcome.error.kind;
          if (kind === 'rate_limit') setCooldown(runtime, candidate.byok ? s.model : s.provider, outcome.error.retryAfterMs ?? 20_000, now);
          if (kind === 'quota_exhausted') setCooldown(runtime, s.model, outcome.error.retryAfterMs ?? 60 * 60_000, now);
          if (kind === 'model_gone') setCooldown(runtime, s.model, 6 * 3_600_000, now);
        }
        const before = runtime.health[model.provider]?.state;
        // Chave própria recusada é problema daquela organização, não do provedor: não abre o circuito de todos.
        const counts = outcome.error ? countsForBreaker(outcome.error.kind) && !(candidate.byok && outcome.error.kind === 'auth') : false;
        const health = breakerRecord(runtime, model.provider, { ok: !outcome.error, kind: outcome.error?.kind, latencyMs: outcome.latencyMs, countsAsFailure: counts }, config.routing.breaker, now);
        if (before !== 'open' && health.state === 'open') pushAlert(runtime, 'critical', `${providerById(model.provider)?.name || model.provider} pausado pelo circuit breaker (${outcome.error?.kind}).`);
        observeModel(runtime, model.key, { ok: !outcome.error, latencyMs: outcome.latencyMs });
        const spent = outcome.costMicros > 0 && candidate.tier === 'paid' ? outcome.costMicros : 0;
        const monthBefore = runtime.budget.monthMicros;
        budgetSettle(runtime, { id: attemptId, micros: spent, org: ctx.org, feature: req.feature, provider: model.provider }, now);
        const limit = config.budgets.monthlyMicros;
        if (limit > 0 && monthBefore < limit * config.budgets.alertAt && runtime.budget.monthMicros >= limit * config.budgets.alertAt) {
          pushAlert(runtime, 'warn', `Gasto pago do mês passou de ${Math.round(config.budgets.alertAt * 100)}% do orçamento.`);
        }
      });
    } catch (error) {
      // A resposta já aconteceu: a reserva expira sozinha (10 min) e a vaga de concorrência em 5 min.
      log?.warn?.(`[ai-gateway] conciliação indisponível: ${error.message}`);
    }
  }

  // ---------- Execução de uma tentativa ----------
  async function attempt(kind, candidate, req, ctx, { signal, deadline, attemptTimeoutMs, emit }) {
    const provider = providerById(candidate.model.provider);
    const credential = await credentialFor(provider, ctx, candidate.byok ? 'org' : 'global');
    if (!credential) throw new GatewayError('auth', { provider: provider.id, internal: 'sem credencial' });
    const adapter = createAdapter({ provider, baseUrl: credential.baseUrl, apiKey: credential.apiKey, request });
    const timeoutMs = Math.max(1000, Math.min(attemptTimeoutMs, deadline - clock()));
    const options = { model: candidate.model.providerModelId, signal, timeoutMs };
    const started = clock();
    if (kind === 'embed') {
      const result = await adapter.generateEmbeddings(req.input || [], options);
      return { ...result, text: '', toolCalls: [], finishReason: 'stop', latencyMs: clock() - started, ttftMs: null, rateLimit: null };
    }
    if (kind === 'stream') {
      let text = '', ttftMs = null, final = null;
      for await (const event of adapter.streamText(req, options)) {
        if (event.type === 'delta') {
          if (ttftMs === null) ttftMs = clock() - started;
          text += event.text;
          emit?.(event.text);
        } else if (event.type === 'done') final = event;
      }
      return { text, toolCalls: final?.toolCalls || [], finishReason: final?.finishReason || 'stop', usage: final?.usage || blankUsage(), model: final?.model, rateLimit: final?.rateLimit, latencyMs: clock() - started, ttftMs };
    }
    const result = await adapter.generateText(req, options);
    return { ...result, latencyMs: clock() - started, ttftMs: null };
  }

  /**
   * O laço de tentativas com fallback. `kind`: generate | stream | structured | embed.
   */
  async function run(kind, input, rawCtx, { signal = undefined, onDelta = undefined } = {}) {
    const requestId = randomUUID();
    const started = clock();
    const req = input?.__normalized ? input : normalizeRequest({ ...input, stream: kind === 'stream' });
    const ctx = context(rawCtx);
    const config = await loadConfig();
    const logBase = { id: requestId, created_at: new Date(started).toISOString(), org_id: ctx.org, workspace_id: ctx.workspace || null,
      user_id: ctx.user ? createHash('sha256').update(ctx.user).digest('hex').slice(0, 16) : null, feature: req.feature, mode: req.mode, plan: ctx.plan,
      requested_model: req.model || null, stream: kind === 'stream', data_class: req.dataClass || featurePolicy(config, req.feature).dataClass, prompt_version: req.promptVersion || null };
    const fail = async (error, attempts = [], extra = {}) => {
      await writeLog({ ...logBase, status: 'error', error_kind: error.kind, attempts: attempts.length, latency_ms: clock() - started, cost_micros: 0, cost_source: 'unknown',
        usage_source: 'unknown', detail: { attempts, reason: redact(error.internal, 200), ...extra } });
      throw error;
    };

    if (config.killSwitch.all) return fail(new GatewayError('disabled', { internal: 'kill switch geral' }));
    const policy = featurePolicy(config, req.feature);
    if (policy.disabled) return fail(new GatewayError('disabled', { internal: 'funcionalidade desligada' }));
    const plan = config.plans[ctx.plan];
    if (plan.maxOutputTokens > 0) req.maxOutputTokens = Math.min(req.maxOutputTokens, plan.maxOutputTokens);

    // Idempotência: mesma chave dentro da instância devolve o mesmo resultado (nada de cobrança dupla).
    const idem = req.idempotencyKey ? `${ctx.org}:${req.idempotencyKey}` : '';
    if (idem && inflight.has(idem)) return inflight.get(idem);

    const job = (async () => {
      const estimatedTokens = kind === 'embed' ? Math.ceil((req.input || []).join(' ').length / 3) : estimateInputTokens(req.messages, req.tools);
      const runtime = await loadRuntime().catch(() => blankRuntime());
      const decision = route(req, { org: ctx.org, plan: ctx.plan, credentials: credentialMap(ctx), estimatedInputTokens: estimatedTokens, preferByok: ctx.preferByok, now: clock() }, config, runtime);
      logBase.mode = decision.mode;
      logBase.data_class = decision.dataClass;

      // Cache (só o que é determinístico e sem efeito externo; chave inclui a organização).
      const useCache = config.cache.enabled && kind !== 'stream' && kind !== 'embed' && cacheable(req);
      const key = useCache ? cacheKey(req, ctx, decision.mode) : '';
      if (useCache) {
        const hit = cache.get(key);
        if (hit && hit.org === ctx.org) {
          await writeLog({ ...logBase, status: 'ok', provider: hit.result.provider, model: hit.result.model, tier: hit.result.tier, attempts: 0, cache_hit: true,
            input_tokens: 0, output_tokens: 0, cost_micros: 0, cost_source: 'free', usage_source: 'reported', latency_ms: clock() - started });
          return { ...hit.result, requestId, cached: true };
        }
      }
      if (!decision.candidates.length) return fail(noRouteError(decision.rejected), [], { rejected: decision.rejected.slice(0, 20) });

      const deadline = started + config.routing.totalTimeoutMs;
      const total = AbortSignal.timeout(Math.max(1000, deadline - clock()));
      const combined = signal ? AbortSignal.any([signal, total]) : total;
      const attempts = [];
      const failedProviders = new Set();
      let lastError = null, delivered = false, structuredRetried = false, budgetBlocked = false;

      for (const candidate of decision.candidates) {
        if (attempts.filter(item => item.status !== 'skipped').length >= config.routing.maxAttempts) break;
        if (failedProviders.has(candidate.model.provider)) continue;
        if (signal?.aborted) return fail(new GatewayError('cancelled'), attempts);
        if (clock() >= deadline) { lastError = new GatewayError('timeout', { internal: 'prazo total' }); break; }
        let sameTries = 0;
        while (true) {
          const attemptId = randomUUID();
          const reservation = await reserve(candidate, req, ctx, config, attemptId, estimatedTokens, attempts.length === 0);
          if (!reservation.ok) {
            attempts.push({ provider: candidate.model.provider, model: candidate.model.key, status: 'skipped', reason: reservation.reason });
            if (reservation.final) return fail(new GatewayError(reservation.final, { internal: reservation.reason }), attempts);
            if (reservation.budget) budgetBlocked = true;
            break;
          }
          const record = { provider: candidate.model.provider, model: candidate.model.key, tier: candidate.tier, status: 'ok', ms: 0 };
          attempts.push(record);
          let outcome;
          try {
            outcome = await attempt(kind, candidate, req, ctx, { signal: combined, deadline, attemptTimeoutMs: config.routing.attemptTimeoutMs,
              emit: text => { delivered = true; onDelta?.(text); } });
          } catch (thrown) {
            const error = classifyThrown(thrown, { provider: candidate.model.provider, model: candidate.model.key, cancelled: Boolean(signal?.aborted) });
            if (!signal?.aborted && total.aborted && error.kind === 'cancelled') error.kind = 'timeout';
            record.status = 'error'; record.kind = error.kind; record.ms = clock() - reservation.at;
            await settle(candidate, req, ctx, config, attemptId, reservation, { error, estimatedTokens, latencyMs: null, usage: null, rateLimit: thrown?.rateLimit || null, costMicros: 0 });
            await ctx.onUsage?.({ model: candidate.model.providerModelId, usage: {}, ms: record.ms, error: error.message });
            lastError = error;
            // Depois que o texto começou a sair, nunca reiniciar em outro provedor (o usuário veria duas respostas).
            if (delivered || error.kind === 'cancelled' || !canFallback(error.kind)) return fail(error, attempts);
            if (canRetrySame(error.kind) && sameTries < config.routing.retrySameMax && clock() < deadline) {
              sameTries++;
              const base = Math.min(8000, 400 * 2 ** sameTries);
              const wait = Math.min(error.retryAfterMs ?? base + Math.floor(random() * base), Math.max(0, deadline - clock() - 1000));
              try { await sleep(wait, combined); } catch { return fail(new GatewayError(signal?.aborted ? 'cancelled' : 'timeout'), attempts); }
              continue;
            }
            if (['auth', 'unavailable', 'timeout', 'transient', 'quota_exhausted'].includes(error.kind)) failedProviders.add(candidate.model.provider);
            break;
          }

          // Sucesso do provedor: confere formato, contabiliza e devolve.
          const usage = outcome.usage || blankUsage();
          if (usage.source !== 'reported' && kind !== 'embed') {
            usage.inputTokens = estimatedTokens; usage.outputTokens = Math.ceil(String(outcome.text || '').length / 3); usage.source = 'estimated';
          }
          const priced = priceKnown(candidate.model) ? costMicros(candidate.model.pricing, usage) : null;
          const cost = candidate.tier === 'free' ? 0 : priced;
          record.ms = outcome.latencyMs;
          let json;
          if (kind === 'structured') {
            const parsed = parseStructured(outcome.text, req.schema);
            if (!parsed.ok) {
              const error = new GatewayError('structured_output', { provider: candidate.model.provider, model: candidate.model.key });
              record.status = 'error'; record.kind = 'structured_output';
              await settle(candidate, req, ctx, config, attemptId, reservation, { error, estimatedTokens, latencyMs: outcome.latencyMs, usage, rateLimit: outcome.rateLimit, costMicros: cost || 0 });
              // Falhar também custa: o consumo da tentativa vai para a organização.
              await ctx.onUsage?.({ model: outcome.model || candidate.model.providerModelId, usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens }, ms: outcome.latencyMs, error: error.message });
              lastError = error;
              if (structuredRetried) return fail(error, attempts);
              structuredRetried = true;
              break;
            }
            json = parsed.value;
          }
          await settle(candidate, req, ctx, config, attemptId, reservation, { estimatedTokens, latencyMs: outcome.latencyMs, usage, rateLimit: outcome.rateLimit, costMicros: cost || 0 });
          await ctx.onUsage?.({ model: outcome.model || candidate.model.providerModelId, usage: { input_tokens: usage.inputTokens, output_tokens: usage.outputTokens }, ms: outcome.latencyMs });
          const result = {
            requestId, text: outcome.text || '', ...(json !== undefined && { json }), ...(kind === 'embed' && { vectors: outcome.vectors }),
            toolCalls: outcome.toolCalls || [], finishReason: outcome.finishReason || 'stop',
            usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cachedTokens: usage.cachedTokens, reasoningTokens: usage.reasoningTokens, source: usage.source },
            costMicros: cost, costSource: candidate.tier === 'free' ? 'free' : candidate.tier === 'byok' ? 'byok' : cost === null ? 'unknown' : usage.source === 'reported' ? 'real' : 'estimated',
            providerCostMicros: usage.providerCostMicros ?? null,
            provider: candidate.model.provider, model: outcome.model || candidate.model.providerModelId, modelKey: candidate.model.key, tier: candidate.tier,
            mode: decision.mode, attempts: attempts.filter(item => item.status !== 'skipped').length, latencyMs: clock() - started, ttftMs: outcome.ttftMs, cached: false
          };
          await writeLog({ ...logBase, status: 'ok', provider: result.provider, model: result.modelKey, tier: result.tier, attempts: result.attempts,
            input_tokens: usage.inputTokens, output_tokens: usage.outputTokens, cached_tokens: usage.cachedTokens, reasoning_tokens: usage.reasoningTokens, usage_source: usage.source,
            cost_micros: cost ?? null, provider_cost_micros: usage.providerCostMicros ?? null, cost_source: result.costSource, latency_ms: result.latencyMs, ttft_ms: outcome.ttftMs,
            detail: { attempts, score: candidate.score ?? null } });
          if (useCache) cache.set(key, { org: ctx.org, result }, req.cacheTtlMs || config.cache.ttlMs);
          return result;
        }
      }
      if (!lastError && budgetBlocked) return fail(new GatewayError('budget', { internal: 'orçamento' }), attempts);
      return fail(lastError || noRouteError(decision.rejected), attempts);
    })();
    if (idem) { inflight.set(idem, job); job.finally(() => setTimeout(() => inflight.delete(idem), 10 * 60_000).unref?.()).catch(() => {}); }
    return job;
  }

  // ---------- API para as funcionalidades ----------
  const generate = (input, ctx, options) => run('generate', input, ctx, options);
  const structured = (input, ctx, options) => {
    if (!input?.schema) throw new GatewayError('invalid_request', { internal: 'structured sem schema' });
    return run('structured', input, ctx, options);
  };
  const embed = (input, ctx, options) => run('embed', { ...input, mode: 'embeddings', messages: [] }, ctx, options);

  /** Streaming: um iterador assíncrono de { type: 'delta', text } e, no fim, { type: 'done', result }. */
  function stream(input, ctx, options = {}) {
    const queue = [];
    let wake = null, finished = false, failure = null, result = null;
    const push = item => { queue.push(item); wake?.(); };
    run('stream', input, ctx, { ...options, onDelta: text => push({ type: 'delta', text }) })
      .then(value => { result = value; }, error => { failure = error; })
      .finally(() => { finished = true; wake?.(); });
    return {
      async *[Symbol.asyncIterator]() {
        while (true) {
          if (queue.length) { yield queue.shift(); continue; }
          if (finished) break;
          await new Promise(resolve => { wake = resolve; });
          wake = null;
        }
        if (failure) throw failure;
        yield { type: 'done', result };
      }
    };
  }

  /**
   * Agente com ferramentas registradas. Cada ferramenta traz { name, description, parameters, permission?, sideEffect?, handler }.
   * A resposta da IA nunca autoriza nada sozinha: ferramenta sem permissão no contexto não roda; ferramenta com efeito
   * externo só roda com `approve(call)` verdadeiro; a mesma chamada (nome + argumentos) nunca executa duas vezes.
   */
  async function agent(input, rawCtx, { maxSteps = 6, maxCostMicros = 0, approve = null, signal = undefined } = {}) {
    const ctx = context(rawCtx);
    const registry = new Map((input.tools || []).map(tool => [tool.name, tool]));
    const tools = [...registry.values()].map(({ name, description, parameters }) => ({ name, description, parameters }));
    const messages = [...(input.messages || [])];
    const executed = new Map();
    const steps = [];
    let spent = 0;
    for (let step = 0; step < Math.min(maxSteps, 12); step++) {
      const result = await run('generate', { ...input, mode: input.mode || 'agent', messages, tools }, rawCtx, { signal });
      spent += result.costMicros || 0;
      steps.push({ step, model: result.modelKey, toolCalls: result.toolCalls.map(call => call.name), costMicros: result.costMicros });
      if (!result.toolCalls.length) return { ...result, steps, spentMicros: spent };
      if (maxCostMicros > 0 && spent >= maxCostMicros) return { ...result, steps, spentMicros: spent, stopped: 'budget' };
      messages.push({ role: 'assistant', content: result.text || '', toolCalls: result.toolCalls });
      for (const call of result.toolCalls) {
        const tool = registry.get(call.name);
        let output;
        const dedupe = `${call.name}:${createHash('sha256').update(String(call.arguments || '')).digest('hex')}`;
        if (!tool) output = { error: 'ferramenta desconhecida' };
        else if (tool.permission && !ctx.permissions.has(tool.permission)) output = { error: 'sem permissão para esta ação' };
        else if (executed.has(dedupe)) output = executed.get(dedupe);
        else if (tool.sideEffect && !(approve && await approve({ name: call.name, arguments: call.arguments }))) {
          return { ...result, steps, spentMicros: spent, pendingApproval: { name: call.name, arguments: call.arguments } };
        } else {
          let args = {};
          try { args = JSON.parse(call.arguments || '{}'); } catch { args = null; }
          output = args === null ? { error: 'argumentos inválidos' } : await Promise.resolve(tool.handler(args, { idempotencyKey: `${result.requestId}:${dedupe}`, org: ctx.org }))
            .catch(error => ({ error: String(error?.message || 'falha na ferramenta').slice(0, 200) }));
          executed.set(dedupe, output);
        }
        messages.push({ role: 'tool', toolCallId: call.id, content: JSON.stringify(output ?? null).slice(0, 20_000) });
      }
    }
    return { text: '', steps, spentMicros: spent, stopped: 'max_steps' };
  }

  /**
   * Compatibilidade com o formato da Responses API (as funcionalidades atuais, via openai.mjs). Com a chave da agência,
   * o corpo vai sem tradução para a OpenAI (mesmo comportamento de antes) e ganha kill switch, circuit breaker,
   * repetição de falha passageira e log. Sem chave, só quando o administrador liberou: modelos gratuitos do graao.
   */
  async function responses(body, rawCtx, { signal = undefined, timeoutMs = 60_000 } = {}) {
    const ctx = context(rawCtx);
    const feature = FEATURES[rawCtx.feature] ? rawCtx.feature : 'legacy.openai';
    if (!ctx.byok.openai) {
      const config = await loadConfig();
      if (config.agenciesWithoutKey !== 'free') throw new GatewayError('disabled', { internal: 'sem chave e sem IA do graao liberada' });
      const req = fromResponsesBody(body, { feature });
      if (req.needs.includes('webSearch')) throw new GatewayError('no_route', { internal: 'web_search só com a chave da OpenAI' });
      const result = await run('generate', { ...req, __normalized: true, mode: 'free' }, { ...rawCtx, byok: {}, plan: 'free' }, { signal });
      return toResponsesResult(result);
    }
    const config = await loadConfig();
    const requestId = randomUUID();
    const started = clock();
    const base = { id: requestId, created_at: new Date(started).toISOString(), org_id: ctx.org, workspace_id: ctx.workspace || null,
      user_id: ctx.user ? createHash('sha256').update(ctx.user).digest('hex').slice(0, 16) : null, feature, mode: 'byok', plan: 'byok', requested_model: String(body.model || '').slice(0, 120),
      provider: 'openai', tier: 'byok', data_class: featurePolicy(config, feature).dataClass, stream: false };
    if (config.killSwitch.all) {
      await writeLog({ ...base, status: 'error', error_kind: 'disabled', attempts: 0, latency_ms: 0, detail: { reason: 'kill switch geral' } });
      throw new GatewayError('disabled', { internal: 'kill switch geral' });
    }
    const runtime = await loadRuntime().catch(() => blankRuntime());
    if (!breakerAllows(structuredClone(runtime), 'openai', clock())) {
      await writeLog({ ...base, status: 'error', error_kind: 'unavailable', attempts: 0, latency_ms: 0, detail: { reason: 'circuit breaker aberto' } });
      throw new GatewayError('unavailable', { provider: 'openai', internal: 'circuit breaker aberto' });
    }
    const provider = providerById('openai');
    const adapter = createAdapter({ provider, baseUrl: String(provider.baseUrl), apiKey: ctx.byok.openai, request });
    const candidate = { model: { provider: 'openai', key: `openai/${body.model}`, providerModelId: body.model, limits: {} }, tier: 'byok', byok: true };
    let tries = 0;
    while (true) {
      const attemptStarted = clock();
      try {
        const out = await adapter.passthrough(body, { signal, timeoutMs, model: body.model });
        const latencyMs = clock() - attemptStarted;
        await settle(candidate, { feature }, ctx, config, randomUUID(), { at: attemptStarted, micros: 0 }, { estimatedTokens: 0, latencyMs, usage: null, rateLimit: null, costMicros: 0 });
        await writeLog({ ...base, status: 'ok', model: `openai/${out.model}`, attempts: tries + 1, input_tokens: out.usage.inputTokens, output_tokens: out.usage.outputTokens,
          cached_tokens: out.usage.cachedTokens, reasoning_tokens: out.usage.reasoningTokens, usage_source: out.usage.source, cost_source: 'byok', latency_ms: clock() - started });
        return out.data;
      } catch (thrown) {
        const error = classifyThrown(thrown, { provider: 'openai', model: body.model, cancelled: Boolean(signal?.aborted) });
        await settle(candidate, { feature }, ctx, config, randomUUID(), { at: attemptStarted, micros: 0 }, { error, estimatedTokens: 0, latencyMs: null, usage: null, rateLimit: thrown?.rateLimit || null, costMicros: 0 });
        if (canRetrySame(error.kind) && tries < config.routing.retrySameMax && !signal?.aborted) {
          tries++;
          await sleep(error.retryAfterMs ?? 500 * 2 ** tries, signal).catch(() => {});
          continue;
        }
        await writeLog({ ...base, status: 'error', error_kind: error.kind, attempts: tries + 1, latency_ms: clock() - started, detail: { reason: redact(error.internal, 200) } });
        throw error;
      }
    }
  }

  /** Há modelo gratuito do graao liberado para agências sem chave? (decide se openai.mjs pede a chave ou segue) */
  async function platformFreeAvailable() {
    const config = await loadConfig();
    if (config.killSwitch.all || config.agenciesWithoutKey !== 'free') return false;
    return Object.values(config.models).some(model => model.enabled && model.status === 'active' && config.providers[model.provider]?.enabled
      && globalCredential(providerById(model.provider), env).configured && isFree(model, config.providers[model.provider]));
  }

  // ---------- Administração (painel AI Gateway, só o dono da plataforma) ----------
  async function audit(actor, action, changes) {
    await changeConfig(config => {
      config.audit = [{ at: new Date(clock()).toISOString(), actor: String(actor || '').slice(0, 120), action, changes: JSON.parse(JSON.stringify(changes ?? null)) }, ...(config.audit || [])].slice(0, AUDIT_MAX);
    }).catch(() => {});
  }

  function providersView(config, runtime) {
    const now = clock();
    return PROVIDERS.map(provider => {
      const credential = globalCredential(provider, env);
      const settings = config.providers[provider.id];
      const models = Object.values(config.models).filter(model => model.provider === provider.id);
      const health = runtime.health[provider.id] || null;
      const quota = runtime.quota[`p:${provider.id}`] || null;
      return {
        id: provider.id, name: provider.name, group: provider.group, adapter: provider.adapter, docs: provider.docs, pricing: provider.pricing || '', note: provider.note || '',
        configured: credential.configured, missing: credential.missing, keyEnv: provider.keyEnv, last4: credential.last4 ? `••••${credential.last4}` : '',
        byok: Boolean(provider.byok), settings, models: models.length, freeModels: models.filter(model => isFree(model, settings)).length,
        health: health && { state: health.state === 'open' && now >= health.openedUntil ? 'half' : health.state, failures: health.failures, lastError: health.lastError,
          lastErrorAt: health.lastErrorAt || null, lastOkAt: health.lastOkAt || null, latencyMs: health.latencyMs, successRate: health.successRate, openedUntil: health.openedUntil || null },
        quota: quota && { day: quota.day, rpd: quota.rpd, tpd: quota.tpd, tokensMonth: quota.tokensMonth, remote: quota.remote },
        cooldownUntil: runtime.cooldown[`p:${provider.id}`] > now ? runtime.cooldown[`p:${provider.id}`] : null,
        spentMonthMicros: runtime.budget.month === new Date(now).toISOString().slice(0, 7) ? runtime.budget.providers[provider.id] || 0 : 0
      };
    });
  }

  async function overview() {
    const [config, runtime] = await Promise.all([loadConfig({ fresh: true }), loadRuntime()]);
    const now = clock();
    const today = new Date(now).toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01T00:00:00.000Z`;
    let month = null, day = null, logError = '';
    try {
      month = await requestLog.summary(monthStart);
      day = await requestLog.summary(`${today}T00:00:00.000Z`);
    } catch (error) { logError = error.code === 'ai_log_unavailable' ? 'A tabela go_ai_requests ainda não foi criada no Supabase.' : 'Não consegui ler o log de requisições.'; }
    const budget = budgetView(runtime, now);
    const dayOfMonth = Number(today.slice(8, 10));
    const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
    return {
      killSwitch: config.killSwitch, agenciesWithoutKey: config.agenciesWithoutKey, logMemoryOnly: Boolean(requestLog.memory), logError,
      today: day?.total || null, month: month?.total || null, byDay: month?.byDay || {}, byProvider: month?.byProvider || {}, byFeature: month?.byFeature || {},
      budget: { ...budget, monthlyMicros: config.budgets.monthlyMicros, dailyMicros: config.budgets.dailyMicros, perOrgMonthlyMicros: config.budgets.perOrgMonthlyMicros, alertAt: config.budgets.alertAt,
        remainingMicros: config.budgets.monthlyMicros > 0 ? Math.max(0, config.budgets.monthlyMicros - budget.monthMicros - budget.reservedMicros) : 0,
        projectionMicros: dayOfMonth ? Math.round(budget.monthMicros / dayOfMonth * daysInMonth) : 0 },
      providers: providersView(config, runtime), alerts: runtime.alerts.slice(0, 20),
      models: { total: Object.keys(config.models).length, eligible: listModels(config, { onlyEligible: true }).length },
      checkedAt: new Date(now).toISOString()
    };
  }

  async function settingsView() {
    const config = await loadConfig({ fresh: true });
    return {
      killSwitch: config.killSwitch, routing: config.routing, budgets: config.budgets, plans: config.plans, cache: config.cache, agenciesWithoutKey: config.agenciesWithoutKey,
      features: Object.entries(FEATURES).map(([id, base]) => ({ id, label: base.label, ...featurePolicy(config, id) })),
      audit: (config.audit || []).slice(0, 50), prompts: listPrompts(config)
    };
  }

  async function saveSettings(input, actor) {
    const changes = await changeConfig(config => applySettings(config, input));
    if (input?.cache?.enabled === false) cache.clear();
    await audit(actor, 'settings', changes);
    return settingsView();
  }

  async function syncProvider(id, actor) {
    const provider = providerById(id);
    if (!provider) throw Object.assign(new Error('Provedor desconhecido.'), { status: 400 });
    if (provider.sync === 'none') throw Object.assign(new Error('Este provedor não tem listagem de modelos pela API. Cadastre os modelos à mão.'), { status: 400 });
    const credential = await credentialFor(provider, { byok: {} }, 'global');
    if (!credential) throw Object.assign(new Error(`Configure ${globalCredential(provider, env).missing.join(' e ')} na Vercel primeiro.`), { status: 400 });
    const adapter = createAdapter({ provider, baseUrl: credential.baseUrl, apiKey: credential.apiKey, request });
    let rows;
    try { rows = await adapter.listModels(); }
    catch (error) { throw Object.assign(new Error(`O provedor recusou a listagem: ${error.kind || 'erro'}.`), { status: 502 }); }
    const summary = await changeConfig(config => mergeSync(config, id, rows, new Date(clock()).toISOString()));
    await audit(actor, 'sync', { provider: id, ...summary });
    return summary;
  }

  async function testProvider(id) {
    const provider = providerById(id);
    if (!provider) throw Object.assign(new Error('Provedor desconhecido.'), { status: 400 });
    const credential = await credentialFor(provider, { byok: {} }, 'global').catch(error => { throw Object.assign(new Error(error.message), { status: 400 }); });
    if (!credential) return { ok: false, message: `Faltam variáveis: ${globalCredential(provider, env).missing.join(', ')}.` };
    const adapter = createAdapter({ provider, baseUrl: credential.baseUrl, apiKey: credential.apiKey, request });
    try {
      const health = await adapter.checkHealth();
      const quota = await adapter.accountQuota?.().catch(() => null);
      return { ok: true, latencyMs: health.latencyMs, quota, message: `Conectado em ${health.latencyMs} ms.` };
    } catch (error) {
      const kind = error.kind || 'unavailable';
      return { ok: false, kind, message: kind === 'auth' ? 'A chave foi recusada pelo provedor.' : kind === 'timeout' ? 'O provedor não respondeu a tempo.' : 'O provedor não respondeu como esperado.' };
    }
  }

  async function modelsView(query = {}) {
    const config = await loadConfig({ fresh: true });
    const runtime = await loadRuntime();
    const list = listModels(config, { provider: query.provider, query: query.q, onlyEligible: query.eligible === '1' || query.eligible === true });
    const limit = Math.max(1, Math.min(Number(query.limit) || 100, 500));
    return { total: list.length, models: list.slice(0, limit).map(model => ({ ...model, observed: runtime.models[model.key] || null })) };
  }

  async function updateModel(key, patch, actor) {
    const model = await changeConfig(config => reviewModel(config, key, patch, new Date(clock()).toISOString()));
    await audit(actor, 'model', { key, patch });
    return model;
  }
  async function createModel(input, actor) {
    const model = await changeConfig(config => addManualModel(config, input, new Date(clock()).toISOString()));
    await audit(actor, 'model-add', { key: model.key });
    return model;
  }

  /** Simulação de roteamento: mostra a decisão e os descartados, sem chamar provedor nenhum. */
  async function simulate(input, rawCtx) {
    const req = normalizeRequest({ messages: [{ role: 'user', content: 'simulação' }], ...input });
    const ctx = context(rawCtx);
    const [config, runtime] = await Promise.all([loadConfig({ fresh: true }), loadRuntime()]);
    const estimatedTokens = Number(input.estimatedInputTokens) > 0 ? Number(input.estimatedInputTokens) : estimateInputTokens(req.messages, req.tools);
    const decision = route(req, { org: ctx.org, plan: ctx.plan, credentials: credentialMap(ctx), estimatedInputTokens: estimatedTokens, preferByok: ctx.preferByok, now: clock() }, config, runtime);
    return {
      mode: decision.mode, dataClass: decision.dataClass, estimatedInputTokens: estimatedTokens, killSwitch: config.killSwitch,
      candidates: decision.candidates.slice(0, config.routing.maxAttempts * 3).map((candidate, index) => ({ order: index + 1, key: candidate.model.key, tier: candidate.tier, score: candidate.score,
        breakdown: candidate.breakdown, worstCaseMicros: candidate.worstCaseMicros })),
      rejected: decision.rejected.slice(0, 80)
    };
  }

  async function logs(query = {}) {
    try { return await requestLog.page(query); }
    catch (error) { return { rows: [], next: '', error: error.code === 'ai_log_unavailable' ? 'A tabela go_ai_requests ainda não foi criada no Supabase.' : 'Não consegui ler o log.' }; }
  }

  // Retenção do log (180 dias). Uma vez por dia por instância, chamado pelo cron.
  let prunedOn = '';
  async function prune(at = clock()) {
    const today = new Date(at).toISOString().slice(0, 10);
    if (prunedOn === today) return;
    prunedOn = today;
    await requestLog.prune(new Date(at - RETENTION_DAYS * 86_400_000).toISOString()).catch(error => log?.warn?.(`[ai-gateway] retenção: ${error.code || error.message}`));
  }

  async function prompts(action, input = {}, actor) {
    if (action === 'list') return listPrompts(await loadConfig({ fresh: true }));
    if (action === 'save') { const out = await changeConfig(config => saveVersion(config, String(input.id || ''), input, new Date(clock()).toISOString())); await audit(actor, 'prompt-save', out); return out; }
    if (action === 'publish') { const out = await changeConfig(config => publishVersion(config, String(input.id || ''), input.version)); await audit(actor, 'prompt-publish', out); return out; }
    if (action === 'render') return renderPrompt(await loadConfig({ fresh: true }), String(input.id || ''), input.variables || {}, { version: input.version });
    throw Object.assign(new Error('Ação desconhecida.'), { status: 400 });
  }

  /** Limpa o circuito de um provedor (botão "tentar de novo" do painel). */
  async function resetProvider(id, actor) {
    if (!providerById(id)) throw Object.assign(new Error('Provedor desconhecido.'), { status: 400 });
    await changeRuntime(runtime => { delete runtime.health[id]; delete runtime.cooldown[`p:${id}`]; });
    await audit(actor, 'provider-reset', { provider: id });
    return { ok: true };
  }

  return {
    generate, stream, structured, embed, agent, responses, platformFreeAvailable,
    admin: { overview, settingsView, saveSettings, syncProvider, testProvider, modelsView, updateModel, createModel, simulate, logs, prune, prompts, resetProvider,
      loadConfig: () => loadConfig({ fresh: true }) }
  };
}
