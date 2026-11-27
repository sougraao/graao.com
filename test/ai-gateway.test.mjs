// graao AI Gateway: roteamento, fallback, cotas, orçamento, segurança e compatibilidade.
// Todos os provedores aqui são SIMULADOS (fetch falso). Os testes provam a lógica do gateway, não o comportamento
// real de cada provedor em produção.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createGraaoAI } from '../ai-gateway/gateway.mjs';
import { validateProviderUrl } from '../ai-gateway/ssrf.mjs';
import { redact } from '../ai-gateway/privacy.mjs';
import { costMicros, worstCaseMicros } from '../ai-gateway/accounting.mjs';
import { dollarsToMicros, RUNTIME_ROW } from '../ai-gateway/config.mjs';
import { classifyHttp } from '../ai-gateway/errors.mjs';
import { sqliteRequestLog } from '../ai-gateway/request-log.mjs';
import { createAiGatewayRoutes } from '../routes/ai-gateway.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';
import { openAIResponse } from '../openai.mjs';

const KEYS = { GROQ_API_KEY: 'gsk_segredo_de_teste_9999', OPENROUTER_API_KEY: 'sk-or-segredo-de-teste-8888' };
const FREE = { freeTier: true, quality: 0.5 };
const PAID = { pricing: { inputMicrosPerM: 1_000_000, outputMicrosPerM: 2_000_000 }, quality: 0.9 };
const PAID_ON = [{ provider: { id: 'openrouter', paidAllowed: true } }, { plan: { id: 'paid', allowPaid: true } }, { budgets: { monthly: '10', daily: '5' } }];
const ASK = (text = 'Olá') => ({ feature: 'admin.playground', messages: [{ role: 'user', content: text }] });
const CTX = { org: 'org-a', user: 'u1', plan: 'free' };

function memoryStore({ failRuntime = () => false } = {}) {
  const rows = new Map();
  // Como o Supabase: go_workspaces.name é gerada de state.profile.name e é NOT NULL.
  const named = (id, state) => { if (typeof state?.profile?.name !== 'string') throw new Error(`documento ${id} sem profile.name (400 no Supabase)`); };
  return {
    rows,
    async load(id) { if (!rows.has(id)) throw Object.assign(new Error('not found'), { status: 404 }); return structuredClone(rows.get(id)); },
    async insert(id, value) { if (failRuntime() && id === RUNTIME_ROW) throw new Error('storage down'); named(id, value); if (!rows.has(id)) rows.set(id, structuredClone(value)); },
    async change(id, mutate) {
      if (failRuntime() && id === RUNTIME_ROW) throw new Error('storage down');
      const state = structuredClone(rows.get(id));
      const result = mutate(state); // síncrono: atômico como o compare-and-swap do store real
      named(id, state);
      rows.set(id, state);
      return result;
    }
  };
}

const chat = (text, { model = 'm', headers = {}, usage = { prompt_tokens: 10, completion_tokens: 5 }, toolCalls = null } = {}) => new Response(JSON.stringify({
  id: 'c', model, usage,
  choices: [{ index: 0, finish_reason: toolCalls ? 'tool_calls' : 'stop', message: { role: 'assistant', content: text, ...(toolCalls && { tool_calls: toolCalls }) } }]
}), { status: 200, headers: { 'content-type': 'application/json', ...headers } });
const status = (code, body = '{}', headers = {}) => new Response(body, { status: code, headers });

function fakeFetch(hosts) {
  const calls = [];
  const request = async (url, init = {}) => {
    const u = new URL(String(url?.url || url));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ host: u.hostname, path: u.pathname, body, headers: init.headers });
    const handler = hosts[u.hostname];
    if (!handler) return status(503, '{"error":"sem simulação"}');
    return handler({ url: u, body, init, n: calls.filter(call => call.host === u.hostname).length });
  };
  request.calls = calls;
  request.count = host => calls.filter(call => call.host === host).length;
  return request;
}

async function setup({ env = KEYS, hosts = {}, models = [], settings = [], store = memoryStore(), ...options } = {}) {
  const request = fakeFetch(hosts);
  const gw = createGraaoAI({ store, env, request, sleep: async () => {}, ...options });
  for (const id of ['groq', 'openrouter']) await gw.admin.saveSettings({ provider: { id, enabled: true, commercialUse: true, freeTier: true } }, 'teste');
  for (const [key, patch, extra = {}] of models) {
    const [provider, ...rest] = key.split('/');
    await gw.admin.createModel({ provider, providerModelId: rest.join('/'), contextWindow: 32_000, ...extra }, 'teste');
    await gw.admin.updateModel(key, patch, 'teste');
  }
  for (const input of settings) await gw.admin.saveSettings(input, 'teste');
  return { gw, store, request };
}
const groqOk = text => () => chat(text);
const both = (groq, openrouter) => ({ 'api.groq.com': groq, 'openrouter.ai': openrouter });

// ---------- Roteamento e free-first ----------
test('free-first: com gratuito disponível, o pago nem é chamado', async () => {
  const { gw, request } = await setup({ hosts: both(groqOk('grátis'), groqOk('pago')), models: [['groq/livre', FREE], ['openrouter/caro', PAID]], settings: PAID_ON });
  const result = await gw.generate(ASK(), { ...CTX, plan: 'paid' });
  assert.equal(result.text, 'grátis');
  assert.equal(result.tier, 'free');
  assert.equal(result.costMicros, 0);
  assert.equal(request.count('openrouter.ai'), 0);
});

test('429 (rate limit) troca de provedor e põe o modelo em espera', async () => {
  const { gw, request, store } = await setup({ hosts: both(() => status(429, '{"error":"rate limit"}', { 'retry-after': '30' }), groqOk('reserva')), models: [['groq/livre', FREE], ['openrouter/livre', FREE]] });
  const result = await gw.generate(ASK(), CTX);
  assert.equal(result.provider, 'openrouter');
  assert.equal(result.attempts, 2);
  assert.equal(request.count('api.groq.com'), 1, 'rate limit não repete no mesmo provedor');
  const cooldown = store.rows.get(RUNTIME_ROW).cooldown;
  assert.ok(Object.entries(cooldown).some(([key, until]) => key.includes('groq') && until > Date.now()));
});

test('429 de cota diária vira cota esgotada (não rajada) e troca de provedor', async () => {
  assert.equal(classifyHttp(429, 'You exceeded your current quota, please check your plan').kind, 'quota_exhausted');
  const { gw } = await setup({ hosts: both(() => status(429, '{"error":"daily quota exceeded"}'), groqOk('reserva')), models: [['groq/livre', FREE], ['openrouter/livre', FREE]] });
  assert.equal((await gw.generate(ASK(), CTX)).provider, 'openrouter');
});

test('timeout repete uma vez no mesmo provedor e depois troca', async () => {
  const timeout = () => { throw Object.assign(new Error('demorou'), { name: 'TimeoutError' }); };
  const { gw, request } = await setup({ hosts: both(timeout, groqOk('reserva')), models: [['groq/livre', FREE], ['openrouter/livre', FREE]] });
  const result = await gw.generate(ASK(), CTX);
  assert.equal(result.provider, 'openrouter');
  assert.equal(request.count('api.groq.com'), 2);
});

test('chave recusada (401) não repete e troca de provedor; 404 de modelo também troca', async () => {
  for (const failure of [status(401, '{"error":"invalid api key"}'), status(404, '{"error":"model_not_found"}')]) {
    const { gw, request } = await setup({ hosts: both(() => failure.clone(), groqOk('reserva')), models: [['groq/livre', FREE], ['openrouter/livre', FREE]] });
    assert.equal((await gw.generate(ASK(), CTX)).provider, 'openrouter');
    assert.equal(request.count('api.groq.com'), 1);
  }
});

test('circuit breaker: depois de falhas seguidas o provedor fica em pausa e nem é chamado', async () => {
  const { gw, request } = await setup({ hosts: both(() => status(500), groqOk('reserva')), models: [['groq/livre', FREE], ['openrouter/livre', FREE]],
    settings: [{ routing: { breaker: { failures: 2, cooldownMs: 60_000 } } }] });
  await gw.generate(ASK(), CTX);
  const before = request.count('api.groq.com');
  assert.equal(before, 2);
  const result = await gw.generate(ASK('de novo'), CTX);
  assert.equal(result.provider, 'openrouter');
  assert.equal(request.count('api.groq.com'), before, 'provedor em pausa não recebe chamada');
  const overview = await gw.admin.overview();
  assert.equal(overview.providers.find(p => p.id === 'groq').health.state, 'open');
  await gw.admin.resetProvider('groq', 'teste');
  assert.equal((await gw.admin.overview()).providers.find(p => p.id === 'groq').health, null);
});

test('contexto maior que a janela do modelo: o roteador descarta sem chamar', async () => {
  const { gw, request } = await setup({ hosts: both(groqOk('pequeno'), groqOk('grande')), models: [['groq/pequeno', FREE, { contextWindow: 1000 }], ['openrouter/grande', FREE]] });
  const result = await gw.generate(ASK('x'.repeat(6000)), CTX);
  assert.equal(result.provider, 'openrouter');
  assert.equal(request.count('api.groq.com'), 0);
});

// ---------- Pago, preço e gratuidade ----------
test('sem orçamento definido, nada pago acontece (padrão seguro)', async () => {
  const { gw, request } = await setup({ hosts: both(groqOk('x'), groqOk('pago')), models: [['openrouter/caro', PAID]],
    settings: [{ provider: { id: 'openrouter', paidAllowed: true } }, { plan: { id: 'paid', allowPaid: true } }] });
  await assert.rejects(gw.generate(ASK(), { ...CTX, plan: 'paid' }), error => error.kind === 'budget');
  assert.equal(request.count('openrouter.ai'), 0);
});

test('plano Free não usa pago mesmo com orçamento', async () => {
  const { gw, request } = await setup({ hosts: both(groqOk('x'), groqOk('pago')), models: [['openrouter/caro', PAID]], settings: PAID_ON });
  await assert.rejects(gw.generate(ASK(), CTX), error => error.kind === 'no_route');
  assert.equal(request.count('openrouter.ai'), 0);
});

test('preço desconhecido nunca é usado como pago nem tratado como grátis; nome com "free" não basta', async () => {
  const { gw, request } = await setup({ hosts: both(groqOk('x'), groqOk('?')), models: [['openrouter/llama:free', { quality: 0.9 }]], settings: PAID_ON });
  const [model] = (await gw.admin.modelsView({})).models;
  assert.equal(model.isFree, false);
  assert.equal(model.priceKnown, false);
  const decision = await gw.admin.simulate(ASK(), { ...CTX, plan: 'paid' });
  assert.deepEqual(decision.candidates, []);
  assert.ok(decision.rejected[0].reasons.includes('preço desconhecido'));
  await assert.rejects(gw.generate(ASK(), { ...CTX, plan: 'paid' }));
  assert.equal(request.count('openrouter.ai'), 0);
});

test('sincronização do OpenRouter: preço zero da API é grátis, preço por token vira micro-dólar inteiro, sumido vira inativo', async () => {
  let listing = [
    { id: 'meta/llama:free', name: 'Llama grátis', context_length: 8192, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['tools'] },
    { id: 'openai/gpt-x', name: 'GPT X', context_length: 128000, pricing: { prompt: '0.0000025', completion: '0.00001' } }
  ];
  const { gw } = await setup({ hosts: { 'openrouter.ai': ({ url }) => url.pathname.endsWith('/models') ? new Response(JSON.stringify({ data: listing })) : status(500) } });
  const summary = await gw.admin.syncProvider('openrouter', 'teste');
  assert.equal(summary.added, 2);
  const models = Object.fromEntries((await gw.admin.modelsView({ provider: 'openrouter' })).models.map(m => [m.key, m]));
  assert.equal(models['openrouter/meta/llama:free'].isFree, true);
  assert.equal(models['openrouter/meta/llama:free'].caps.tools, true);
  assert.deepEqual([models['openrouter/openai/gpt-x'].pricing.inputMicrosPerM, models['openrouter/openai/gpt-x'].pricing.outputMicrosPerM], [2_500_000, 10_000_000]);
  assert.equal(models['openrouter/openai/gpt-x'].isFree, false);
  await gw.admin.updateModel('openrouter/openai/gpt-x', { quality: 0.95 }, 'teste');
  listing = listing.slice(0, 1);
  assert.equal((await gw.admin.syncProvider('openrouter', 'teste')).retired, 1);
  const after = (await gw.admin.modelsView({ q: 'gpt-x' })).models[0];
  assert.equal(after.status, 'inactive');
  assert.equal(after.quality, 0.95, 'revisão do administrador sobrevive à sincronização');
});

test('orçamento: duas chamadas pagas simultâneas não estouram o limite (reserva atômica) e o custo é inteiro', async () => {
  const slow = () => new Promise(resolve => setTimeout(() => resolve(chat('pago')), 20));
  // pior caso de cada chamada ≈ 2000 µUS$ (1000 tokens de saída a US$ 2/milhão); o diário cabe só uma.
  const { gw, request } = await setup({ hosts: both(groqOk('x'), slow), models: [['openrouter/caro', PAID]],
    settings: [...PAID_ON.slice(0, 2), { budgets: { monthly: '1', daily: '0.003' } }] });
  const input = { ...ASK(), maxOutputTokens: 1000 };
  const results = await Promise.allSettled([gw.generate(input, { ...CTX, plan: 'paid' }), gw.generate(input, { ...CTX, plan: 'paid' })]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.kind, 'budget');
  assert.equal(request.count('openrouter.ai'), 1);
  const ok = results.find(r => r.status === 'fulfilled').value;
  assert.equal(ok.costMicros, 20, '10 tokens × US$1/M + 5 × US$2/M = 20 µUS$');
  assert.ok(Number.isInteger(ok.costMicros));
  assert.equal((await gw.admin.overview()).budget.dayMicros, 20);
});

test('idempotência: a mesma chave não chama o provedor duas vezes', async () => {
  const slow = () => new Promise(resolve => setTimeout(() => resolve(chat('uma vez')), 10));
  const { gw, request } = await setup({ hosts: both(slow, groqOk('x')), models: [['groq/livre', FREE]] });
  const input = { ...ASK(), idempotencyKey: 'pedido-123' };
  const [a, b] = await Promise.all([gw.generate(input, CTX), gw.generate(input, CTX)]);
  assert.equal(a.requestId, b.requestId);
  assert.equal(request.count('api.groq.com'), 1);
});

test('cache: reaproveita só dentro da mesma organização', async () => {
  const { gw, request } = await setup({ hosts: both(groqOk('fixo'), groqOk('x')), models: [['groq/livre', FREE]] });
  const input = { ...ASK('classifique'), cache: true, temperature: 0 };
  await gw.generate(input, CTX);
  const again = await gw.generate(input, CTX);
  assert.equal(again.cached, true);
  assert.equal(request.count('api.groq.com'), 1);
  const other = await gw.generate(input, { ...CTX, org: 'org-b' });
  assert.equal(other.cached, false);
  assert.equal(request.count('api.groq.com'), 2);
});

test('kill switch geral desliga tudo; kill switch de pago bloqueia só o pago', async () => {
  const { gw, request } = await setup({ hosts: both(groqOk('grátis'), groqOk('pago')), models: [['groq/livre', FREE], ['openrouter/caro', PAID]], settings: PAID_ON });
  await gw.admin.saveSettings({ killSwitch: { all: true } }, 'teste');
  await assert.rejects(gw.generate(ASK(), CTX), error => error.kind === 'disabled');
  assert.equal(request.calls.length, 0);
  await gw.admin.saveSettings({ killSwitch: { all: false, paid: true } }, 'teste');
  assert.equal((await gw.generate(ASK(), { ...CTX, plan: 'paid' })).tier, 'free');
  await gw.admin.updateModel('groq/livre', { enabled: false }, 'teste');
  await assert.rejects(gw.generate(ASK('só pago'), { ...CTX, plan: 'paid' }));
  assert.equal(request.count('openrouter.ai'), 0);
});

// ---------- Streaming, JSON estruturado e agentes ----------
test('streaming interrompido depois do primeiro texto não recomeça em outro provedor', async () => {
  const broken = () => new Response(new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'Olá, ' } }] })}\n\n`));
      controller.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'tudo' } }] })}\n\n`));
      setTimeout(() => controller.error(new Error('conexão caiu')), 5);
    }
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const { gw, request } = await setup({ hosts: both(broken, groqOk('outra resposta')), models: [['groq/livre', FREE], ['openrouter/livre', FREE]] });
  const deltas = [];
  await assert.rejects(async () => { for await (const event of gw.stream(ASK(), CTX)) if (event.type === 'delta') deltas.push(event.text); });
  assert.equal(deltas.join(''), 'Olá, tudo');
  assert.equal(request.count('openrouter.ai'), 0);
});

test('JSON estruturado inválido tenta outro modelo uma vez; inválido de novo vira erro', async () => {
  const schema = { name: 'r', schema: { type: 'object', properties: { titulo: { type: 'string' } }, required: ['titulo'] } };
  const good = await setup({ hosts: both(groqOk('isto não é json'), groqOk('{"titulo":"ok"}')), models: [['groq/livre', FREE, { caps: { structured: true } }], ['openrouter/livre', FREE, { caps: { structured: true } }]] });
  assert.deepEqual((await good.gw.structured({ ...ASK(), schema }, CTX)).json, { titulo: 'ok' });
  const bad = await setup({ hosts: both(groqOk('nada'), groqOk('{"outro":1}')), models: [['groq/livre', FREE, { caps: { structured: true } }], ['openrouter/livre', FREE, { caps: { structured: true } }]] });
  await assert.rejects(bad.gw.structured({ ...ASK(), schema }, CTX), error => error.kind === 'structured_output');
});

test('agente: ferramenta repetida roda uma vez, sem permissão não roda e efeito externo espera aprovação', async () => {
  const call = (id, name, args) => ({ id, type: 'function', function: { name, arguments: JSON.stringify(args) } });
  let step = 0;
  const groq = () => (++step === 1
    ? chat(null, { toolCalls: [call('a', 'buscar', { q: 'x' }), call('b', 'buscar', { q: 'x' }), call('c', 'apagar', { id: 1 })] })
    : chat('pronto'));
  const { gw } = await setup({ hosts: both(groq, groqOk('x')), models: [['groq/agente', FREE, { caps: { tools: true } }]] });
  let searches = 0, deletes = 0;
  const tools = [
    { name: 'buscar', description: 'busca', parameters: { type: 'object', properties: {} }, handler: () => ({ ok: ++searches }) },
    { name: 'apagar', description: 'apaga', parameters: { type: 'object', properties: {} }, permission: 'contacts.delete', handler: () => { deletes++; return { ok: true }; } }
  ];
  const result = await gw.agent({ ...ASK(), tools }, { ...CTX, plan: 'paid' });
  assert.equal(result.text, 'pronto');
  assert.equal(searches, 1, 'mesma chamada (nome + argumentos) executa uma vez');
  assert.equal(deletes, 0, 'sem a permissão no contexto a ferramenta não roda');

  step = 0;
  const external = [{ ...tools[1], permission: undefined, sideEffect: true }];
  const pending = await gw.agent({ ...ASK(), tools: [tools[0], ...external] }, { ...CTX, plan: 'paid' });
  assert.deepEqual(pending.pendingApproval?.name, 'apagar');
  assert.equal(deletes, 0, 'efeito externo sem aprovação humana não roda');
});

// ---------- Falhas de infraestrutura ----------
test('se o documento de cotas falhar, o gratuito segue e o pago é bloqueado', async () => {
  let broken = false;
  const store = memoryStore({ failRuntime: () => broken });
  const { gw, request } = await setup({ store, hosts: both(groqOk('grátis'), groqOk('pago')), models: [['groq/livre', FREE], ['openrouter/caro', PAID]], settings: PAID_ON });
  broken = true;
  assert.equal((await gw.generate(ASK(), CTX)).text, 'grátis');
  await gw.admin.updateModel('groq/livre', { enabled: false }, 'teste');
  await assert.rejects(gw.generate(ASK('pago'), { ...CTX, plan: 'paid' }));
  assert.equal(request.count('openrouter.ai'), 0);
});

// ---------- Privacidade, uso comercial e segurança ----------
test('dado confidencial não vai para provedor sem revisão de privacidade; sem uso comercial confirmado também não', async () => {
  const { gw } = await setup({ hosts: both(groqOk('x'), groqOk('x')), models: [['groq/livre', FREE]] });
  const confidential = await gw.admin.simulate({ ...ASK(), feature: 'graao.chat' }, CTX);
  assert.deepEqual(confidential.candidates, []);
  assert.ok(confidential.rejected[0].reasons.includes('privacidade incompatível'));
  await gw.admin.saveSettings({ provider: { id: 'groq', commercialUse: false } }, 'teste');
  const commercial = await gw.admin.simulate(ASK(), CTX);
  assert.ok(commercial.rejected[0].reasons.includes('uso comercial não confirmado'));
});

test('SSRF: só https público; recusa rede privada, metadados da nuvem, credenciais na URL e DNS que aponta para dentro', async () => {
  const publicDns = async () => [{ address: '93.184.216.34', family: 4 }];
  const privateDns = async () => [{ address: '192.168.0.10', family: 4 }];
  for (const url of ['http://api.exemplo.com/v1', 'https://10.0.0.5/v1', 'https://169.254.169.254/latest', 'https://user:senha@api.exemplo.com/v1',
    'https://api.exemplo.com/v1?x=1', 'https://api.exemplo.com:8080/v1', 'http://localhost:11434/v1', 'https://[::1]/v1']) {
    await assert.rejects(validateProviderUrl(url, { resolve: publicDns }), undefined, url);
  }
  await assert.rejects(validateProviderUrl('https://interno.exemplo.com/v1', { resolve: privateDns }));
  assert.equal(await validateProviderUrl('https://api.exemplo.com/v1/', { resolve: publicDns }), 'https://api.exemplo.com/v1');
  assert.equal(await validateProviderUrl('http://localhost:11434/v1', { allowLocal: true }), 'http://localhost:11434/v1');
});

test('servidor próprio com URL privada é recusado antes de qualquer chamada', async () => {
  const store = memoryStore();
  const request = fakeFetch({});
  const gw = createGraaoAI({ store, request, env: { GRAAO_AI_COMPAT_BASE_URL: 'https://interno.exemplo.com/v1' }, resolveHost: async () => [{ address: '10.1.2.3', family: 4 }] });
  await assert.rejects(gw.admin.syncProvider('compat', 'teste'));
  assert.equal(request.calls.length, 0);
});

test('nenhuma chave aparece no painel, nas respostas nem no log', async () => {
  const { gw } = await setup({ hosts: both(() => status(401, `{"error":"invalid key ${KEYS.GROQ_API_KEY}"}`), groqOk('ok')), models: [['groq/livre', FREE], ['openrouter/livre', FREE]] });
  const result = await gw.generate(ASK(), CTX);
  const exposed = JSON.stringify([result, await gw.admin.overview(), await gw.admin.settingsView(), await gw.admin.modelsView({}), await gw.admin.logs({})]);
  for (const secret of Object.values(KEYS)) assert.ok(!exposed.includes(secret), 'chave vazou');
  assert.ok(exposed.includes('••••9999'), 'o painel mostra só os 4 últimos');
  const text = redact('chave sk-proj-abcdefghijklmnop1234 de joao@exemplo.com, CPF 123.456.789-09');
  assert.ok(!text.includes('abcdefghijklmnop') && !text.includes('joao@exemplo.com') && !text.includes('123.456.789-09'));
});

test('limites informados pelo provedor (cabeçalhos x-ratelimit) ficam registrados', async () => {
  const headers = { 'x-ratelimit-limit-requests': '14400', 'x-ratelimit-remaining-requests': '14321', 'x-ratelimit-reset-requests': '6s', 'x-ratelimit-remaining-tokens': '5800' };
  const { gw } = await setup({ hosts: both(() => chat('ok', { headers }), groqOk('x')), models: [['groq/livre', FREE]] });
  await gw.generate(ASK(), CTX);
  const groq = (await gw.admin.overview()).providers.find(p => p.id === 'groq');
  assert.equal(groq.quota.remote.remainingRequests, 14321);
});

// ---------- Contabilidade ----------
test('dinheiro em micro-dólar inteiro: sem arredondamento de ponto flutuante', () => {
  assert.equal(dollarsToMicros('0.1'), 100_000);
  assert.equal(dollarsToMicros('25.50'), 25_500_000);
  assert.equal(dollarsToMicros('abc'), null);
  assert.equal(costMicros({ inputMicrosPerM: 150_000, outputMicrosPerM: 600_000 }, { inputTokens: 1, outputTokens: 1 }), 1, 'arredonda para cima, nunca para zero');
  assert.equal(worstCaseMicros({ inputMicrosPerM: 1_000_000, outputMicrosPerM: 2_000_000 }, 1000, 1000), 3000);
});

test('log de requisições no SQLite não aceita alteração', () => {
  const db = new DatabaseSync(':memory:');
  const log = sqliteRequestLog(db);
  log.append([{ id: 'r1', created_at: new Date().toISOString(), org_id: 'org-a', feature: 'graao.chat', status: 'ok', attempts: 1 }]);
  assert.throws(() => db.exec("UPDATE go_ai_requests SET status = 'error' WHERE id = 'r1'"));
});

// ---------- Painel (rotas) ----------
test('rotas do painel: 404 para quem não é o dono, dados para o dono', async () => {
  const { gw } = await setup();
  const routes = owner => createAiGatewayRoutes({ gateway: gw, verifiedUser: () => ({ id: owner, email: '' }), agencyOwnerId: 'dono', auth: {}, localAccess: false,
    error: (message, code) => Object.assign(new Error(message), { status: code }), payload: async () => ({}) });
  const call = handler => handler({ req: {}, res: {}, p: '/api/platform/ai/overview', method: 'GET', url: new URL('http://x/api/platform/ai/overview'), json: data => data });
  await assert.rejects(call(routes('outra-agencia')), error => error.status === 404);
  const data = await call(routes('dono'));
  assert.ok(Array.isArray(data.providers));
  assert.equal(await routes('dono')({ req: {}, res: {}, p: '/api/platform/usage', method: 'GET', url: new URL('http://x'), json: d => d }), NEXT_ROUTE);
});

// ---------- Compatibilidade com o caminho antigo (openai.mjs) ----------
test('chave da agência: o corpo vai sem tradução para a OpenAI e os erros antigos continuam iguais', async () => {
  const sent = [];
  const request = async (url, init) => { sent.push({ url: String(url), body: JSON.parse(init.body), auth: init.headers.Authorization || init.headers.authorization });
    return new Response(JSON.stringify({ id: 'resp', model: 'gpt-4.1-mini', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'oi' }] }], usage: { input_tokens: 3, output_tokens: 1 } })); };
  const gw = createGraaoAI({ store: memoryStore(), env: {}, request, sleep: async () => {} });
  const body = { model: 'gpt-4.1-mini', input: [{ role: 'user', content: 'oi' }], text: { format: { type: 'json_schema', name: 'x', schema: { type: 'object' } } } };
  const out = await openAIResponse(body, { apiKey: 'sk-agencia', timeout: 5000, problem: 'falhou', gateway: gw, gatewayContext: { org: 'sub-1', feature: 'content.writer' } });
  assert.equal(out.id, 'resp');
  assert.equal(sent[0].url, 'https://api.openai.com/v1/responses');
  assert.deepEqual(sent[0].body, { ...body, store: false });
  assert.equal(sent[0].auth, 'Bearer sk-agencia');

  const refused = createGraaoAI({ store: memoryStore(), env: {}, request: async () => status(401, '{"error":{"message":"bad key"}}'), sleep: async () => {} });
  await assert.rejects(openAIResponse(body, { apiKey: 'sk-ruim', timeout: 5000, problem: 'falhou', gateway: refused, gatewayContext: { org: 'sub-1' } }),
    error => error.status === 422 && /OpenAI recusou a chave/.test(error.message));

  // Sem chave e sem a IA da graao liberada (padrão): continua pedindo a chave.
  await assert.rejects(gw.responses(body, { org: 'sub-1' }), error => error.kind === 'disabled');
});
