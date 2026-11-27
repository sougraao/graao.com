// Página Plataforma: lê plano e uso de cada serviço externo. Um coletor por serviço, `request` injetado.
// Nenhum token sai daqui: erros viram textos curtos ("HTTP 401", "tempo esgotado"), sem URL nem cabeçalho.
import { PLAN_LIMITS } from './platform-limits.mjs';
import { dayMonth } from './ui/platform-format.js';

const MiB = 1024 * 1024, DAY = 86_400_000;
const HOSTINGER = 'https://developers.hostinger.com';
const CLASS_B = new Set(['HeadBucket', 'HeadObject', 'GetObject', 'UsageSummary', 'GetBucketEncryption', 'GetBucketLocation', 'GetBucketCors', 'GetBucketLifecycleConfiguration']);
const FREE_OPS = new Set(['DeleteObject', 'DeleteBucket', 'AbortMultipartUpload']);

class ProviderError extends Error {}
class TimeoutError extends ProviderError { constructor() { super('tempo esgotado'); } }

const reading = (service, name, fields) => ({ service, name, status: 'ok', plan: '', link: '', metrics: [], ...fields });
const notConfigured = (service, name, link = '') => reading(service, name, { status: 'not-configured', link });
const metric = (key, label, used, limit, unit, cycle, extra = {}) => ({ key, label, used, limit, unit, cycle, ...extra });
const failed = (service, name, problem) => ({ ...reading(service, name, { status: 'error' }), error: problem instanceof ProviderError ? problem.message : 'falha na leitura' });
/** Um coletor que nunca lança: qualquer falha vira a leitura de erro daquele serviço. */
const guarded = (service, name, collect) => async context => {
  try { return await collect(context); } catch (problem) { return failed(service, name, problem); }
};

/** Data no formato que as APIs aceitam: sem milissegundos (a Hostinger responde 500 a "…00.123Z"). */
const isoSeconds = at => new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z');
const monthStartOf = now => { const at = new Date(now); return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1); };
/** Acrescenta a etapa ao erro ("HTTP 500 em métricas"), para saber qual chamada falhou. */
const step = (label, promise) => promise.catch(problem => {
  throw problem instanceof ProviderError && !(problem instanceof TimeoutError) ? new ProviderError(`${problem.message} em ${label}`) : problem;
});

/**
 * Tenta de novo uma vez quando o serviço responde 5xx (falha passageira do lado dele), mas só se a
 * segunda tentativa ainda cabe no tempo do coletor: senão o collectAll cortaria com "tempo esgotado"
 * e o erro real sumiria. `attempt(ms)` recebe o tempo máximo da chamada.
 */
async function retryServerError(attempt, { timeoutMs, deadline, waitMs }) {
  try {
    return await attempt(timeoutMs);
  } catch (problem) {
    const left = deadline - Date.now() - waitMs;
    if (!/^HTTP 5\d\d$/.test(problem?.message || '') || left < 1000) throw problem;
    await new Promise(resolve => setTimeout(resolve, waitMs));
    return attempt(Math.min(timeoutMs, left));
  }
}

/** GET/POST com tempo máximo; qualquer resposta que não seja 2xx vira "HTTP <status>". */
const fetchJson = async (request, url, options, timeoutMs) => (await fetchResponse(request, url, options, timeoutMs)).body;

/** Como fetchJson, mas devolve também a resposta, para ler cabeçalhos de uso. */
async function fetchResponse(request, url, options, timeoutMs) {
  let response;
  try {
    response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs), ...options });
  } catch (problem) {
    if (problem?.name === 'TimeoutError' || problem?.name === 'AbortError') throw new TimeoutError();
    throw new ProviderError('sem conexão');
  }
  if (!response.ok) {
    // O corpo fica só em `code` (o "name" que a API devolve), para o coletor decidir; nunca vai para a tela.
    const code = await response.json().then(body => String(body?.name || body?.code || ''), () => '');
    throw Object.assign(new ProviderError(`HTTP ${response.status}`), { code });
  }
  try { return { response, body: await response.json() }; } catch { throw new ProviderError('resposta inválida'); }
}

export const collectSupabase = guarded('supabase', 'Supabase', async function collectSupabase({ env, store, settings }) {
  const ref = URL.parse(env.SUPABASE_URL || '')?.hostname.split('.')[0] || '';
  const link = ref ? `https://supabase.com/dashboard/project/${ref}/settings/billing/usage` : 'https://supabase.com/dashboard';
  if (typeof store?.platformUsage !== 'function') return notConfigured('supabase', 'Supabase', link);
  const plan = PLAN_LIMITS.supabase[settings.plans?.supabase] ? settings.plans.supabase : 'free';
  const limits = PLAN_LIMITS.supabase[plan];
  const usage = await store.platformUsage();
  return reading('supabase', 'Supabase', { plan, link, metrics: [
    metric('db', 'Banco', usage.db_bytes ?? null, limits.db, 'bytes', 'total'),
    metric('storage', 'Storage', usage.storage_bytes ?? null, limits.storage, 'bytes', 'total'),
    metric('mau', 'Ativos no mês', usage.mau ?? null, limits.mau, 'count', 'month'),
    metric('egress', 'Tráfego (egress)', null, null, 'bytes', 'month', { note: 'a API não informa' })
  ] });
});

export const collectVercel = guarded('vercel', 'Vercel', async function collectVercel({ env, request, settings, now, timeoutMs = 8000 }) {
  const token = env.VERCEL_API_TOKEN, team = env.VERCEL_TEAM_ID;
  if (!token || !team) return notConfigured('vercel', 'Vercel', 'https://vercel.com/dashboard');
  const headers = { Authorization: `Bearer ${token}` };
  const info = await fetchJson(request, `https://api.vercel.com/v2/teams/${encodeURIComponent(team)}`, { headers }, timeoutMs);
  const detected = String(info?.billing?.plan || '').toLowerCase();
  const plan = PLAN_LIMITS.vercel[detected] ? detected : PLAN_LIMITS.vercel[settings.plans?.vercel] ? settings.plans.vercel : 'hobby';
  const since = now - DAY;
  let count = 0, until = null;
  for (let page = 0; page < 100; page++) {
    const query = new URLSearchParams({ teamId: team, since: String(since), limit: '100', ...(until ? { until: String(until) } : {}) });
    const data = await fetchJson(request, `https://api.vercel.com/v6/deployments?${query}`, { headers }, timeoutMs);
    count += (data.deployments || []).length;
    until = data.pagination?.next;
    if (!until) break;
  }
  return reading('vercel', 'Vercel', {
    plan, link: info?.slug ? `https://vercel.com/${info.slug}/~/usage` : 'https://vercel.com/dashboard',
    metrics: [metric('deploys24h', 'Deploys em 24 h', count, PLAN_LIMITS.vercel[plan].deploys24h, 'count', 'day24h')]
  });
});

const R2_QUERY = `query($account: String!, $since: Time!, $monthStart: Time!, $now: Time!) {
  viewer { accounts(filter: { accountTag: $account }) {
    storage: r2StorageAdaptiveGroups(limit: 1000, filter: { datetime_geq: $since, datetime_leq: $now }) { dimensions { bucketName } max { payloadSize metadataSize } }
    operations: r2OperationsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $monthStart, datetime_leq: $now }) { dimensions { actionType } sum { requests } }
  } }
}`;

export const collectCloudflare = guarded('cloudflare', 'Cloudflare R2', async function collectCloudflare({ env, request, now, timeoutMs = 8000 }) {
  const token = env.CLOUDFLARE_API_TOKEN;
  if (!token) return notConfigured('cloudflare', 'Cloudflare R2', 'https://dash.cloudflare.com/');
  // A conta vem da variável ou, sem ela, do próprio token (um token de uma conta só lista essa conta).
  // CLOUDFLARE_ACCOUNT_ID existe porque R2_ACCOUNT_ID sozinho liga o armazenamento R2 do app e derruba o servidor.
  let account = env.R2_ACCOUNT_ID || env.CLOUDFLARE_ACCOUNT_ID;
  if (!account) {
    const listed = await step('contas', fetchJson(request, 'https://api.cloudflare.com/client/v4/accounts?per_page=5', { headers: { Authorization: `Bearer ${token}` } }, timeoutMs));
    const accounts = Array.isArray(listed?.result) ? listed.result : [];
    if (accounts.length !== 1) throw new ProviderError(accounts.length ? 'o token vê mais de uma conta: defina CLOUDFLARE_ACCOUNT_ID' : 'o token não vê nenhuma conta');
    account = accounts[0].id;
  }
  const variables = { account, since: isoSeconds(now - DAY), monthStart: isoSeconds(monthStartOf(now)), now: isoSeconds(now) };
  const data = await fetchJson(request, 'https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: R2_QUERY, variables })
  }, timeoutMs);
  if (data?.errors?.length) throw new ProviderError(String(data.errors[0]?.message || 'erro no GraphQL').slice(0, 120));
  const found = data?.data?.viewer?.accounts?.[0];
  if (!found) throw new ProviderError('conta não encontrada');
  const stored = (found.storage || []).reduce((sum, row) => sum + Number(row.max?.payloadSize || 0) + Number(row.max?.metadataSize || 0), 0);
  let classA = 0, classB = 0;
  for (const row of found.operations || []) {
    const action = row.dimensions?.actionType, requests = Number(row.sum?.requests || 0);
    if (FREE_OPS.has(action)) continue;
    if (CLASS_B.has(action)) classB += requests; else classA += requests;
  }
  const limits = PLAN_LIMITS.cloudflare.free;
  return reading('cloudflare', 'Cloudflare R2', { plan: 'free', link: `https://dash.cloudflare.com/${account}/r2/overview`, metrics: [
    metric('r2Storage', 'Armazenamento', stored, limits.r2Storage, 'bytes', 'total'),
    metric('r2ClassA', 'Operações classe A', classA, limits.r2ClassA, 'count', 'month'),
    metric('r2ClassB', 'Operações classe B', classB, limits.r2ClassB, 'count', 'month')
  ] });
});

/** O valor mais recente de uma série { timestamp: valor } da Hostinger, ou a média. */
const latest = series => { const keys = Object.keys(series?.usage || {}); return keys.length ? Number(series.usage[keys.sort((a, b) => b - a)[0]]) : null; };
const average = series => { const values = Object.values(series?.usage || {}).map(Number); return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; };

export const collectHostinger = guarded('hostinger', 'Hostinger', async function collectHostinger({ env, request, now, timeoutMs = 8000, retryWaitMs = 500 }) {
  const deadline = Date.now() + timeoutMs;
  const token = env.HOSTINGER_API_TOKEN;
  const link = 'https://hpanel.hostinger.com/vps';
  if (!token) return notConfigured('hostinger', 'Hostinger', link);
  const headers = { Authorization: `Bearer ${token}` };
  const machines = await step('VPS', fetchJson(request, `${HOSTINGER}/api/vps/v1/virtual-machines`, { headers }, timeoutMs));
  if (!Array.isArray(machines) || !machines.length) throw new ProviderError('nenhuma VPS na conta');
  const evolutionHost = URL.parse(env.EVOLUTION_BASE_URL || '')?.hostname || '';
  const vm = machines.find(m => evolutionHost && (m.hostname === evolutionHost || (m.ipv4 || []).some(ip => ip.address === evolutionHost))) || machines[0];
  const query = new URLSearchParams({ date_from: isoSeconds(now - 6 * 3_600_000), date_to: isoSeconds(now) });
  // A assinatura só traz o vencimento: se ela falhar, os números da VPS continuam aparecendo.
  // As métricas às vezes dão 500 e voltam no minuto seguinte (visto em 26/11): uma segunda tentativa.
  const metricsUrl = `${HOSTINGER}/api/vps/v1/virtual-machines/${vm.id}/metrics?${query}`;
  const [usage, subscriptions] = await Promise.all([
    step('métricas', retryServerError(ms => fetchJson(request, metricsUrl, { headers }, ms), { timeoutMs, deadline, waitMs: retryWaitMs })),
    fetchJson(request, `${HOSTINGER}/api/billing/v1/subscriptions`, { headers }, timeoutMs).catch(() => null)
  ]);
  const cpu = average(usage?.cpu_usage);
  const metrics = [
    metric('disk', 'Disco', latest(usage?.disk_space), vm.disk ? vm.disk * MiB : null, 'bytes', 'total'),
    metric('ram', 'Memória', latest(usage?.ram_usage), vm.memory ? vm.memory * MiB : null, 'bytes', 'now'),
    metric('cpu', 'CPU (média 6 h)', cpu === null ? null : Math.round(cpu * 10) / 10, 100, 'percent', 'now')
  ];
  let plan = vm.plan || '';
  const subscription = (Array.isArray(subscriptions) ? subscriptions : []).find(s => s.id === vm.subscription_id);
  const ends = Date.parse(subscription?.expires_at || '');
  if (subscription && Number.isFinite(ends)) {
    if (subscription.is_auto_renewed) plan += ` · renova sozinho em ${dayMonth(new Date(subscription.next_billing_at || subscription.expires_at).toISOString().slice(0, 10))}`;
    else metrics.push(metric('expires', 'Vence', Math.max(0, Math.floor((ends - now) / DAY)), 0, 'days', 'now', { kind: 'deadline' }));
  }
  return reading('hostinger', 'Hostinger', { plan, link, metrics });
});

export const collectEvolution = guarded('evolution', 'Evolution API', async function collectEvolution({ env, request, timeoutMs = 8000 }) {
  const base = String(env.EVOLUTION_BASE_URL || '').replace(/\/+$/, ''), key = env.EVOLUTION_API_KEY;
  if (!base || !key) return notConfigured('evolution', 'Evolution API');
  const instances = await fetchJson(request, `${base}/instance/fetchInstances`, { headers: { apikey: key } }, timeoutMs);
  return reading('evolution', 'Evolution API', { plan: 'VPS própria', link: base, metrics: [
    metric('instances', 'Instâncias', Array.isArray(instances) ? instances.length : null, null, 'count', 'now')
  ] });
});

export const collectTwilio = guarded('twilio', 'Twilio', async function collectTwilio({ env, request, settings, timeoutMs = 8000 }) {
  const sid = env.TWILIO_ACCOUNT_SID, secret = env.TWILIO_AUTH_TOKEN;
  const link = 'https://console.twilio.com/us1/billing/manage-billing/billing-overview';
  if (!sid || !secret) return notConfigured('twilio', 'Twilio', link);
  const data = await fetchJson(request, `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Balance.json`, {
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${secret}`).toString('base64')}` }
  }, timeoutMs);
  const balance = Number.parseFloat(data?.balance);
  return reading('twilio', 'Twilio', { plan: data?.currency ? `Saldo em ${data.currency}` : '', link, metrics: [
    metric('balance', 'Saldo', Number.isFinite(balance) ? balance : null, Number(settings.twilioMinUsd ?? 10), 'usd', 'now', { kind: 'floor' })
  ] });
});

export const collectOpenAI = guarded('openai', 'OpenAI', async function collectOpenAI({ env, request, now, timeoutMs = 8000 }) {
  // Só as chaves da conta do graao: OPENAI_API_KEY é a do "Pergunte ao Graao"; as agências usam chaves próprias.
  const key = env.OPENAI_API_KEY, admin = env.OPENAI_ADMIN_KEY;
  const link = 'https://platform.openai.com/usage';
  if (!key && !admin) return notConfigured('openai', 'OpenAI', link);
  const metrics = [];
  if (key) {
    const base = String(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
    await step('chave', fetchJson(request, `${base}/models`, { headers: { Authorization: `Bearer ${key}` } }, timeoutMs));
    metrics.push(metric('key', 'Chave da API', 1, null, 'check', 'now', { kind: 'check', note: 'aceita pela OpenAI' }));
  }
  if (admin) {
    // Gasto do mês pela Costs API: só uma chave de administrador (sk-admin-…) lê.
    const query = new URLSearchParams({ start_time: String(Math.floor(monthStartOf(now) / 1000)), bucket_width: '1d', limit: '31' });
    const costs = await step('gastos', fetchJson(request, `https://api.openai.com/v1/organization/costs?${query}`, { headers: { Authorization: `Bearer ${admin}` } }, timeoutMs));
    const spent = (costs?.data || []).flatMap(bucket => bucket.results || []).reduce((sum, row) => sum + Number(row.amount?.value || 0), 0);
    metrics.push(metric('spend', 'Gasto no mês', Math.round(spent * 100) / 100, null, 'usd', 'month'));
  }
  return reading('openai', 'OpenAI', { plan: 'pago por uso', link, metrics });
});

export const collectResend = guarded('resend', 'Resend', async function collectResend({ env, request, timeoutMs = 8000 }) {
  const key = env.RESEND_API_KEY;
  if (!key) return notConfigured('resend', 'Resend', 'https://resend.com/emails');
  const base = String(env.RESEND_API_URL || 'https://api.resend.com').replace(/\/+$/, '');
  // Ler domínios pede uma chave de acesso total. Uma chave só de envio (o mínimo de poder) responde 401
  // "restricted_api_key": não é falha, só não dá para conferir o domínio.
  let data;
  try {
    data = await fetchJson(request, `${base}/domains`, { headers: { Authorization: `Bearer ${key}` } }, timeoutMs);
  } catch (problem) {
    if (problem?.code !== 'restricted_api_key') throw problem instanceof ProviderError && !(problem instanceof TimeoutError) ? new ProviderError(`${problem.message} em domínios`) : problem;
    return reading('resend', 'Resend', { plan: 'chave só de envio', link: 'https://resend.com/domains', metrics: [
      metric('domain', 'Domínio do remetente', null, null, 'check', 'now', { kind: 'check', note: 'a chave é só de envio: o domínio não é conferido' })
    ] });
  }
  const domains = Array.isArray(data?.data) ? data.data : [];
  const sender = String(env.PORTAL_EMAIL_FROM || '').match(/@([^>\s]+)/)?.[1]?.toLowerCase() || '';
  const domain = sender ? domains.find(d => String(d.name).toLowerCase() === sender) : domains[0];
  const verified = domain?.status === 'verified';
  const note = !domain ? (sender ? `${sender} não está cadastrado no Resend` : 'nenhum domínio cadastrado')
    : verified ? `${domain.name} verificado` : `${domain.name}: ${domain.status || 'sem status'}`;
  return reading('resend', 'Resend', { link: 'https://resend.com/domains', metrics: [
    metric('domain', 'Domínio do remetente', verified ? 1 : 0, null, 'check', 'now', { kind: 'check', note })
  ] });
});

export const collectMeta = guarded('meta', 'Meta', async function collectMeta({ env, request, timeoutMs = 8000 }) {
  const id = env.META_APP_ID, secret = env.META_APP_SECRET;
  if (!id || !secret) return notConfigured('meta', 'Meta', 'https://developers.facebook.com/apps/');
  const version = env.META_GRAPH_VERSION || 'v23.0';
  // Token do app no cabeçalho, nunca na URL. O X-App-Usage diz quanto do limite por hora o app já usou.
  const { response, body } = await step('app', fetchResponse(request, `https://graph.facebook.com/${version}/${encodeURIComponent(id)}?fields=name`, {
    headers: { Authorization: `OAuth ${id}|${secret}` }
  }, timeoutMs));
  let usage = null;
  try {
    const parsed = JSON.parse(response.headers?.get?.('x-app-usage') || 'null');
    if (parsed) usage = Math.max(...['call_count', 'total_time', 'total_cputime'].map(k => Number(parsed[k]) || 0));
  } catch { usage = null; }
  return reading('meta', 'Meta', { plan: body?.name ? String(body.name).slice(0, 60) : '', link: `https://developers.facebook.com/apps/${encodeURIComponent(id)}/dashboard/`, metrics: [
    metric('appRate', 'Limite de chamadas (1 h)', usage, 100, 'percent', 'now', usage === null ? { note: 'a Meta não informou' } : {})
  ] });
});

const COLLECTORS = [
  ['supabase', 'Supabase', collectSupabase], ['vercel', 'Vercel', collectVercel], ['cloudflare', 'Cloudflare R2', collectCloudflare],
  ['hostinger', 'Hostinger', collectHostinger], ['evolution', 'Evolution API', collectEvolution], ['twilio', 'Twilio', collectTwilio],
  ['openai', 'OpenAI', collectOpenAI], ['resend', 'Resend', collectResend], ['meta', 'Meta', collectMeta]
];

/** Os serviços em paralelo, cada um com tempo máximo. Uma falha vira `status: 'error'` só daquele serviço. */
export async function collectAll({ env, request, store, settings, now, timeoutMs = 8000 }) {
  const context = { env, request, store, settings, now, timeoutMs };
  return Promise.all(COLLECTORS.map(async ([service, name, collect]) => {
    let timer;
    const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new TimeoutError()), timeoutMs + 250); });
    try {
      return await Promise.race([collect(context), limit]);
    } catch (problem) {
      return failed(service, name, problem);
    } finally {
      clearTimeout(timer);
    }
  }));
}
