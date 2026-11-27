// Painel AI Gateway (página da Plataforma, só o dono). Lê e altera /api/platform/ai/*. Nenhuma chave de provedor
// passa por aqui: o painel mostra só se a variável existe e os 4 últimos caracteres. Métrica sem dado aparece como
// "sem dados", nunca como zero inventado.
import { ask } from './ask.js';

const TABS = [['overview', 'Visão geral'], ['providers', 'Provedores'], ['models', 'Modelos'], ['routing', 'Roteamento'], ['costs', 'Custos e planos'],
  ['prompts', 'Prompts'], ['playground', 'Playground'], ['logs', 'Logs']];
const MODES = [['auto', 'graao Auto'], ['free', 'graao Free'], ['fast', 'graao Fast'], ['pro', 'graao Pro'], ['reason', 'graao Reason'], ['vision', 'graao Vision'], ['agent', 'graao Agent'], ['embeddings', 'graao Embeddings']];
const CLASSES = [['public', 'Público'], ['internal', 'Interno'], ['confidential', 'Confidencial'], ['personal', 'Pessoal'], ['sensitive', 'Pessoal sensível'], ['restricted', 'Restrito']];
const FAILURES = [['', 'Nenhuma (chamada real)'], ['rate_limit', 'Rate limit'], ['quota_exhausted', 'Cota esgotada'], ['timeout', 'Timeout'], ['unavailable', 'Provedor fora do ar'],
  ['auth', 'Chave recusada'], ['model_gone', 'Modelo descontinuado'], ['context_exceeded', 'Contexto excedido'], ['policy', 'Bloqueio de política'], ['structured_output', 'JSON inválido']];
const WEIGHTS = [['cost', 'Custo'], ['quality', 'Qualidade'], ['availability', 'Disponibilidade'], ['speed', 'Velocidade'], ['capacity', 'Capacidade restante']];
const CAPS = ['text', 'stream', 'structured', 'tools', 'vision', 'embeddings', 'webSearch', 'reasoning'];
const HEALTH = { closed: ['Normal', 'green'], half: ['Testando', 'orange'], open: ['Pausado', 'red'] };

const nf = new Intl.NumberFormat('pt-BR');
const num = value => value === null || value === undefined ? 'sem dados' : nf.format(value);
const usd = micros => micros === null || micros === undefined ? 'desconhecido' : `US$ ${(Number(micros) / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: Number(micros) > 0 && Number(micros) < 10_000 ? 4 : 2 })}`;
const perM = micros => micros === null || micros === undefined ? '—' : `US$ ${(Number(micros) / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}`;
const pct = (part, whole) => whole ? `${Math.round(part / whole * 1000) / 10}%` : 'sem dados';
const when = ms => ms ? new Date(ms).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export function createAiGatewayPanel({ api, h, tr, flash, rerender, utabs }) {
  const S = { tab: 'overview', overview: null, settings: null, models: null, modelQuery: { provider: '', q: '', eligible: '' }, logs: null, logFilter: {},
    simulation: null, playground: null, streaming: false, loading: false, error: '' };
  const t = text => h(tr(text));
  const badge = (text, tone = '') => `<span class="badge ${tone}">${t(text)}</span>`;
  const button = (label, action, attrs = '', cls = 'secondary') => `<button type="button" class="${cls}" data-aig="${action}" ${attrs}>${t(label)}</button>`;
  const select = (name, options, current) => `<select name="${name}">${options.map(([value, label]) => `<option value="${h(value)}"${String(value) === String(current ?? '') ? ' selected' : ''}>${t(label)}</option>`).join('')}</select>`;
  const check = (name, on, label) => `<label class="aig-check"><input type="checkbox" name="${name}"${on ? ' checked' : ''}> ${t(label)}</label>`;
  const field = (label, control, hint = '') => `<label>${t(label)}${control}${hint ? `<small class="dim">${t(hint)}</small>` : ''}</label>`;
  const input = (name, value, attrs = '') => `<input name="${name}" value="${h(value ?? '')}" ${attrs}>`;
  const section = (title, text, body) => `<section class="set-section"><header class="set-head"><h2>${t(title)}</h2>${text ? `<p>${t(text)}</p>` : ''}</header><div class="set-body">${body}</div></section>`;
  const form = (name, content, submit, attrs = '') => `<form class="surface settings-form set-form" data-aig-form="${name}" ${attrs}>${content}<footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">${t(submit)}</button></footer></form>`;

  async function load(what = S.tab) {
    S.loading = true; S.error = '';
    try {
      if (what === 'overview' || what === 'providers' || !S.overview) S.overview = await api('/api/platform/ai/overview');
      if (['routing', 'costs', 'prompts', 'overview'].includes(what) || !S.settings) S.settings = await api('/api/platform/ai/settings');
      if (what === 'models') S.models = await api(`/api/platform/ai/models?${new URLSearchParams({ ...S.modelQuery, limit: '200' })}`);
      if (what === 'logs') S.logs = await api(`/api/platform/ai/logs?${new URLSearchParams({ ...S.logFilter, limit: '50' })}`);
    } catch (error) { S.error = error.message; }
    finally { S.loading = false; }
    rerender();
  }

  // ---------- Visão geral ----------
  function tile(label, value, detail = '') {
    return `<article class="surface pf-card aig-tile"><span class="dim">${t(label)}</span><b>${h(value)}</b>${detail ? `<small class="pf-detail">${h(detail)}</small>` : ''}</article>`;
  }
  function overviewTab() {
    const o = S.overview;
    const day = o.today, month = o.month, budget = o.budget;
    const available = o.providers.filter(p => p.configured && p.settings.enabled && p.health?.state !== 'open').length;
    const tiles = [
      tile('Requisições hoje', num(day?.requests)), tile('Requisições no mês', num(month?.requests)),
      tile('Tokens no mês', month ? num(month.inputTokens + month.outputTokens) : 'sem dados', month ? `${num(month.inputTokens)} entrada · ${num(month.outputTokens)} saída` : ''),
      tile('Consumo gratuito (mês)', month ? `${num(month.freeRequests)} req.` : 'sem dados', month ? `${pct(month.freeRequests, month.requests)} das requisições` : ''),
      tile('Consumo pago (mês)', month ? `${num(month.paidRequests)} req.` : 'sem dados', month ? `chave da agência: ${num(month.byokRequests)} req.` : ''),
      tile('Custo pago hoje', day ? usd(day.paidCostMicros) : 'sem dados'), tile('Custo pago no mês', usd(budget.monthMicros), `reservado agora: ${usd(budget.reservedMicros)}`),
      tile('Taxa de sucesso (mês)', month ? pct(month.ok, month.requests) : 'sem dados'), tile('Taxa de fallback (mês)', month ? pct(month.fallback, month.requests) : 'sem dados'),
      tile('Cache hit (mês)', month ? pct(month.cacheHits, month.requests) : 'sem dados'),
      tile('Latência média', month?.latencyCount ? `${num(Math.round(month.latencySum / month.latencyCount))} ms` : 'sem dados'),
      tile('Usuários ativos de IA (mês)', num(month?.users)), tile('Organizações consumidoras (mês)', num(month?.orgs)),
      tile('Provedores disponíveis', `${available} de ${o.providers.length}`, `${o.models.eligible} modelos elegíveis de ${o.models.total} no registro`),
      tile('Orçamento pago restante', budget.monthlyMicros > 0 ? usd(budget.remainingMicros) : 'sem orçamento', budget.monthlyMicros > 0 ? `de ${usd(budget.monthlyMicros)} no mês` : 'nada pago é autorizado'),
      tile('Projeção do mês', usd(budget.projectionMicros), 'no ritmo do gasto pago atual')
    ];
    const kill = o.killSwitch;
    const alerts = o.alerts.length ? `<ul class="aig-alerts">${o.alerts.map(a => `<li class="${h(a.level)}"><b>${h(when(Date.parse(a.at)))}</b> ${h(a.text)}</li>`).join('')}</ul>` : `<p class="pf-empty">${t('Nenhum alerta.')}</p>`;
    return `${o.logError ? `<div class="surface padded ag-notice"><b>${t('Log de requisições indisponível.')}</b> ${h(o.logError)}</div>` : ''}
      ${o.logMemoryOnly ? `<p class="pf-unmonitored">${t('Este servidor guarda o log só na memória (sem tabela go_ai_requests).')}</p>` : ''}
      <div class="surface padded aig-kill ${kill.all ? 'on' : ''}"><div><h2>${t('Kill switch')}</h2><p class="dim">${t(kill.all ? 'Todo o gateway está desligado. Nenhuma IA responde.' : kill.paid ? 'Chamadas pagas bloqueadas. Gratuito e chave da agência seguem.' : 'Tudo liberado conforme as regras.')}${kill.reason ? ` · ${h(kill.reason)}` : ''}</p></div>
        <div class="inline-gap">${button(kill.paid ? 'Liberar pago' : 'Bloquear pago', 'kill', `data-key="paid" data-on="${kill.paid ? '0' : '1'}"`, kill.paid ? 'secondary' : 'danger plain')}
        ${button(kill.all ? 'Religar o gateway' : 'Desligar todo o gateway', 'kill', `data-key="all" data-on="${kill.all ? '0' : '1'}"`, kill.all ? 'primary' : 'danger')}</div></div>
      <div class="pf-grid aig-tiles">${tiles.join('')}</div>
      <div class="surface padded"><h2>${t('Alertas')}</h2>${alerts}</div>`;
  }

  // ---------- Provedores ----------
  function providerCard(p) {
    const s = p.settings;
    const [healthText, healthTone] = HEALTH[p.health?.state || 'closed'];
    const status = !p.configured ? badge('Sem credencial', 'gray') : !s.enabled ? badge('Desligado', 'gray') : badge(healthText, healthTone);
    const privacy = s.privacy;
    return `<article class="surface pf-card aig-provider">
      <header class="pf-card-head"><div><h2>${h(p.name)}</h2><span class="pf-plan">${t(`Grupo ${p.group}`)} · ${h(p.adapter)}</span></div>${status}</header>
      <p class="pf-detail">${p.configured ? `${t('Chave')} ${h(p.keyEnv)} ${h(p.last4)}` : `${t('Configure na Vercel:')} ${h(p.missing.join(', '))}`}</p>
      ${p.note ? `<p class="pf-detail">${h(p.note)}</p>` : ''}
      <p class="pf-detail">${t('Modelos no registro')}: ${num(p.models)} · ${t('gratuitos confirmados')}: ${num(p.freeModels)} · ${t('gasto pago no mês')}: ${usd(p.spentMonthMicros)}</p>
      ${p.health ? `<p class="pf-detail">${t('Sucesso')} ${Math.round((p.health.successRate ?? 1) * 100)}% · ${t('latência')} ${p.health.latencyMs ? `${num(p.health.latencyMs)} ms` : '—'}${p.health.lastError ? ` · ${t('último erro')}: ${h(p.health.lastError)} ${h(when(p.health.lastErrorAt))}` : ''}</p>` : ''}
      ${p.quota?.remote ? `<p class="pf-detail">${t('Restante informado pelo provedor')}: ${num(p.quota.remote.remainingRequests)} req. · ${num(p.quota.remote.remainingTokens)} tokens</p>` : ''}
      <div class="inline-gap">${button('Testar conexão', 'test', `data-id="${h(p.id)}"`)}${button('Sincronizar modelos', 'sync', `data-id="${h(p.id)}"`)}${p.health?.state && p.health.state !== 'closed' ? button('Tirar da pausa', 'reset', `data-id="${h(p.id)}"`) : ''}
        <a class="pf-link" href="${h(p.docs)}" target="_blank" rel="noopener">${t('Documentação')} ↗</a>${p.pricing ? `<a class="pf-link" href="${h(p.pricing)}" target="_blank" rel="noopener">${t('Preços')} ↗</a>` : ''}</div>
      <details><summary>${t('Regras deste provedor')}</summary>
        <form class="settings-form aig-form" data-aig-form="provider" data-id="${h(p.id)}">
          ${check('enabled', s.enabled, 'Ligado')}
          ${check('freeTier', s.freeTier, 'Confirmei que a conta da graao aqui está no plano gratuito (sem cobrança)')}
          ${check('commercialUse', s.commercialUse, 'Os termos permitem o uso comercial da graao')}
          ${check('paidAllowed', s.paidAllowed, 'Permitir uso pago (dentro do orçamento)')}
          <div class="field-grid">${field('Prioridade', input('priority', s.priority, 'type="number" min="0" max="99"'))}${field('Orçamento mensal (US$)', input('monthlyBudget', (s.monthlyBudgetMicros || 0) / 1e6, 'inputmode="decimal"'))}</div>
          <p class="dim">${t('Limites da conta (0 = não sei; o gateway usa contadores conservadores)')}</p>
          <div class="field-grid aig-limits">${['rpm', 'rpd', 'tpm', 'tpd', 'tokensMonth', 'concurrency'].map(key => field(key.toUpperCase(), input(`limit_${key}`, s.limits[key], 'type="number" min="0"'))).join('')}</div>
          <p class="dim">${t('Privacidade (sem revisão, o provedor só recebe dado público ou interno)')}</p>
          ${check('reviewed', privacy.reviewed, 'Revisei os termos de dados deste provedor')}
          <div class="field-grid">${field('Usa os dados para treino?', select('trainsOnData', [['unknown', 'Não sei'], ['yes', 'Sim'], ['no', 'Não']], privacy.trainsOnData))}
            ${field('Retenção', select('retention', [['unknown', 'Não sei'], ['none', 'Nenhuma'], ['short', 'Curta (até 30 dias)'], ['long', 'Longa']], privacy.retention))}
            ${field('Classe máxima de dado', select('maxClass', CLASSES, privacy.maxClass))}</div>
          ${check('dpa', privacy.dpa, 'Há contrato de tratamento de dados (DPA) assinado')}
          <footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">${t('Salvar regras')}</button></footer>
        </form></details>
    </article>`;
  }
  const providersTab = () => `<p class="pf-unmonitored">${t('As chaves ficam só nas variáveis de ambiente da Vercel. Provedor sem chave fica desligado sem afetar o resto.')}</p>
    <div class="pf-grid aig-providers">${S.overview.providers.map(providerCard).join('')}</div>`;

  // ---------- Modelos ----------
  function modelRow(m) {
    const price = m.isFree ? badge('Gratuito', 'green') : m.priceKnown ? `${perM(m.pricing.inputMicrosPerM)} / ${perM(m.pricing.outputMicrosPerM)}` : badge('Preço desconhecido', 'orange');
    const caps = CAPS.filter(cap => m.caps?.[cap]).join(', ');
    return `<tr><td><b>${h(m.key)}</b><small class="dim">${h(m.name)}</small></td><td>${price}</td><td>${m.contextWindow ? num(m.contextWindow) : '—'}</td><td>${h(caps || '—')}</td>
      <td>${m.status === 'active' ? (m.enabled ? badge('Ativo', 'green') : badge('Desligado', 'gray')) : badge(m.status, 'red')}</td>
      <td><details><summary>${t('Editar')}</summary><form class="settings-form aig-form" data-aig-form="model" data-key="${h(m.key)}">
        ${check('enabled', m.enabled, 'Ligado')}${check('blocked', m.status === 'blocked', 'Bloquear (descontinuado ou problemático)')}
        ${check('freeTier', m.free?.verified && m.free?.source === 'admin', 'Incluído no plano gratuito da conta (vale só com o plano gratuito confirmado no provedor)')}
        ${m.free?.source === 'api' ? `<p class="dim">${t('Gratuito pelo preço zero na API do provedor.')}</p>` : ''}
        ${field('Uso comercial', select('commercial', [['', 'Herdar do provedor'], ['1', 'Permitido'], ['0', 'Não permitido']], m.commercial === null || m.commercial === undefined ? '' : m.commercial ? '1' : '0'))}
        <div class="field-grid">${field('Qualidade (0 a 1)', input('quality', m.quality, 'type="number" step="0.05" min="0" max="1"'))}${field('Janela de contexto', input('contextWindow', m.contextWindow || '', 'type="number" min="0"'))}
          ${field('Entrada US$/milhão', input('priceIn', m.pricing ? m.pricing.inputMicrosPerM / 1e6 : '', 'inputmode="decimal"'))}${field('Saída US$/milhão', input('priceOut', m.pricing ? m.pricing.outputMicrosPerM / 1e6 : '', 'inputmode="decimal"'))}</div>
        <fieldset class="aig-caps"><legend>${t('Capacidades')}</legend>${CAPS.map(cap => check(`cap_${cap}`, m.caps?.[cap], cap)).join('')}</fieldset>
        <footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">${t('Salvar modelo')}</button></footer></form></details></td></tr>`;
  }
  function modelsTab() {
    const q = S.modelQuery;
    const providers = [['', 'Todos os provedores'], ...S.overview.providers.map(p => [p.id, p.name])];
    const list = S.models ? (S.models.models.length ? `<div class="aig-table-wrap"><table class="aig-table"><thead><tr><th>${t('Modelo')}</th><th>${t('Preço entrada / saída por milhão')}</th><th>${t('Contexto')}</th><th>${t('Capacidades')}</th><th>${t('Status')}</th><th></th></tr></thead><tbody>${S.models.models.map(modelRow).join('')}</tbody></table></div>
      <p class="pf-checked">${t('Mostrando')} ${num(S.models.models.length)} ${t('de')} ${num(S.models.total)}</p>` : `<p class="pf-empty">${t('Nenhum modelo. Sincronize um provedor em Provedores ou cadastre à mão.')}</p>`) : `<p class="pf-empty">${t('Carregando…')}</p>`;
    return `<form class="surface padded aig-filter" data-aig-form="model-filter">${field('Provedor', select('provider', providers, q.provider))}${field('Buscar', input('q', q.q, 'type="search" placeholder="llama, gpt, gemini…"'))}
        ${check('eligible', q.eligible === '1', 'Só elegíveis para a rota automática')}<button class="secondary">${t('Filtrar')}</button></form>
      <div class="surface padded">${list}</div>
      ${form('model-add', section('Cadastrar modelo à mão', 'Para Cloudflare, servidor próprio ou modelo que a API não lista. Entra sem preço: informe o preço ou a gratuidade antes de usar.',
        `<div class="field-grid">${field('Provedor', select('provider', S.overview.providers.map(p => [p.id, p.name]), 'cloudflare'))}${field('Identificador no provedor', input('providerModelId', '', 'required placeholder="@cf/meta/…"'))}
         ${field('Nome', input('name', ''))}${field('Tipo', select('type', [['chat', 'Texto'], ['embedding', 'Embeddings']], 'chat'))}${field('Janela de contexto', input('contextWindow', '', 'type="number" min="0"'))}</div>`), 'Cadastrar')}`;
  }

  // ---------- Roteamento ----------
  function routingTab() {
    const s = S.settings;
    const order = s.routing.freeOrder;
    const sim = S.simulation;
    return `${form('routing', section('Pesos da pontuação', 'Valores relativos; o gateway normaliza para somar 1. Qualidade não é tamanho do modelo: ajuste por modelo em Modelos.',
        `<div class="field-grid">${WEIGHTS.map(([key, label]) => field(label, input(`w_${key}`, s.routing.weights[key], 'type="number" step="0.05" min="0" max="1"'))).join('')}</div>`)
      + section('Tentativas e prazos', 'Quantos modelos tentar, quanto esperar e quando pausar um provedor que falha.',
        `<div class="field-grid">${field('Máximo de tentativas', input('maxAttempts', s.routing.maxAttempts, 'type="number" min="1" max="6"'))}${field('Prazo por tentativa (ms)', input('attemptTimeoutMs', s.routing.attemptTimeoutMs, 'type="number" min="5000"'))}
         ${field('Prazo total (ms)', input('totalTimeoutMs', s.routing.totalTimeoutMs, 'type="number" min="5000"'))}${field('Falhas para pausar provedor', input('breakerFailures', s.routing.breaker.failures, 'type="number" min="1"'))}
         ${field('Pausa (ms)', input('breakerCooldownMs', s.routing.breaker.cooldownMs, 'type="number" min="5000"'))}</div>`)
      + section('Agências sem chave da OpenAI', 'Hoje cada agência usa a própria chave. Ligado, quem não tem chave usa só modelos gratuitos da graao (texto; transcrição e busca na web continuam pedindo chave).',
        field('Comportamento', select('agenciesWithoutKey', [['off', 'Pedir a chave (como hoje)'], ['free', 'Usar a IA gratuita da graao']], s.agenciesWithoutKey))), 'Salvar roteamento')}
      <div class="surface padded"><h2>${t('Ordem do free-first')}</h2><p class="dim">${t('Modelos gratuitos são tentados nesta ordem de provedor.')}</p>
        <ol class="aig-order">${order.map((id, index) => `<li><span>${h(S.overview.providers.find(p => p.id === id)?.name || id)}</span>${index ? button('Subir', 'order', `data-id="${h(id)}" data-dir="-1" aria-label="${t('Subir')}"`) : ''}${index < order.length - 1 ? button('Descer', 'order', `data-id="${h(id)}" data-dir="1"`) : ''}</li>`).join('')}</ol></div>
      <div class="surface padded"><h2>${t('Regras por funcionalidade')}</h2><div class="aig-table-wrap"><table class="aig-table"><thead><tr><th>${t('Funcionalidade')}</th><th>${t('Modo')}</th><th>${t('Classe de dado')}</th><th>${t('Pago')}</th><th>${t('Ligada')}</th><th></th></tr></thead><tbody>
        ${s.features.map(f => `<tr><td><b>${t(f.label)}</b><small class="dim">${h(f.id)}</small></td><td colspan="5"><form class="aig-inline" data-aig-form="feature" data-id="${h(f.id)}">${select('mode', MODES, f.mode)}${select('dataClass', CLASSES, f.dataClass)}
          ${check('allowPaid', f.allowPaid, 'Permitir pago')}${check('enabled', !f.disabled, 'Ligada')}<button class="secondary">${t('Salvar')}</button></form></td></tr>`).join('')}</tbody></table></div></div>
      ${form('simulate', section('Simular roteamento', 'Mostra a decisão sem chamar nenhum provedor e sem gastar nada.',
        `<div class="field-grid">${field('Funcionalidade', select('feature', s.features.map(f => [f.id, f.label]), 'admin.playground'))}${field('Modo', select('mode', MODES, 'auto'))}${field('Plano', select('plan', [['free', 'Free'], ['paid', 'Pago']], 'free'))}
          ${field('Classe de dado', select('dataClass', [['', 'A da funcionalidade'], ...CLASSES], ''))}${field('Tokens de entrada estimados', input('estimatedInputTokens', 1000, 'type="number" min="1"'))}${field('Máximo de saída', input('maxOutputTokens', 1024, 'type="number" min="1"'))}</div>
         <div class="inline-gap">${check('tools', false, 'Ferramentas')}${check('structured', false, 'JSON estruturado')}${check('webSearch', false, 'Busca na web')}</div>
         ${sim ? simulationView(sim) : ''}`), 'Simular')}`;
  }
  function simulationView(sim) {
    const rows = sim.candidates.length ? `<ol class="aig-candidates">${sim.candidates.map(c => `<li><b>${h(c.key)}</b> ${badge(c.tier === 'free' ? 'Gratuito' : c.tier === 'byok' ? 'Chave da agência' : 'Pago', c.tier === 'free' ? 'green' : c.tier === 'paid' ? 'orange' : 'blue')} <span class="dim">${t('nota')} ${h(c.score)}${c.worstCaseMicros ? ` · ${t('pior caso')} ${usd(c.worstCaseMicros)}` : ''}</span></li>`).join('')}</ol>`
      : `<p class="pf-error"><b>${t('Nenhum modelo elegível.')}</b> ${t('O pedido pararia com a mensagem amigável de indisponibilidade.')}</p>`;
    const rejected = sim.rejected.length ? `<details><summary>${t('Descartados')} (${sim.rejected.length})</summary><ul class="aig-rejected">${sim.rejected.map(r => `<li><b>${h(r.key)}</b>: ${h(r.reasons.join(', '))}</li>`).join('')}</ul></details>` : '';
    return `<div class="aig-result"><p class="dim">${t('Modo efetivo')}: ${h(sim.mode)} · ${t('classe de dado')}: ${h(sim.dataClass)} · ${t('tokens estimados')}: ${num(sim.estimatedInputTokens)}</p>${rows}${rejected}</div>`;
  }

  // ---------- Custos e planos ----------
  function costsTab() {
    const s = S.settings;
    const plan = id => s.plans[id];
    const planSection = (id, title, text) => section(title, text, `<div class="field-grid">
        ${id === 'byok' ? '' : check(`${id}_allowPaid`, plan(id).allowPaid, 'Permitir fallback pago (dentro do orçamento)')}
        ${field('Requisições por dia (0 = sem limite)', input(`${id}_dailyRequests`, plan(id).dailyRequests, 'type="number" min="0"'))}${field('Máximo de tokens de entrada', input(`${id}_maxInputTokens`, plan(id).maxInputTokens, 'type="number" min="0"'))}
        ${field('Máximo de tokens de saída', input(`${id}_maxOutputTokens`, plan(id).maxOutputTokens, 'type="number" min="0"'))}${field('Concorrência por organização', input(`${id}_concurrency`, plan(id).concurrency, 'type="number" min="0"'))}</div>`);
    return `${form('budgets', section('Orçamento pago da graao', 'Sem orçamento mensal e diário, nenhuma chamada paga acontece (padrão). Valores em dólar.',
        `<div class="field-grid">${field('Mensal (US$)', input('monthly', s.budgets.monthlyMicros / 1e6, 'inputmode="decimal"'))}${field('Diário (US$)', input('daily', s.budgets.dailyMicros / 1e6, 'inputmode="decimal"'))}
         ${field('Por organização no mês (US$, 0 = sem limite extra)', input('perOrgMonthly', s.budgets.perOrgMonthlyMicros / 1e6, 'inputmode="decimal"'))}${field('Alerta em (% do mensal)', input('alertAt', Math.round(s.budgets.alertAt * 100), 'type="number" min="10" max="100"'))}</div>`)
      + section('Cache', 'Só pedidos determinísticos e sem efeito externo. Nunca compartilhado entre organizações.', `${check('cacheEnabled', s.cache.enabled, 'Cache ligado')}${field('Validade (minutos)', input('cacheMinutes', Math.round(s.cache.ttlMs / 60000), 'type="number" min="0"'))}`), 'Salvar orçamento')}
      ${form('plans', planSection('free', 'Plano Free', 'Política técnica de IA, não muda preço nem assinatura.') + planSection('paid', 'Planos pagos', 'Política técnica para quem tem plano pago.')
        + planSection('byok', 'Chave própria (BYOK)', 'O consumo vai para a organização dona da chave.'), 'Salvar planos')}
      <div class="surface padded"><h2>${t('Exportar')}</h2><p class="dim">${t('As últimas 500 requisições, só metadados (sem prompt nem resposta).')}</p><a class="secondary button" href="/api/platform/ai/logs?format=csv" download>${t('Baixar CSV')}</a></div>
      <div class="surface padded"><h2>${t('Auditoria de alterações')}</h2>${s.audit.length ? `<ul class="aig-audit">${s.audit.map(a => `<li><b>${h(when(Date.parse(a.at)))}</b> ${h(a.actor)} · ${h(a.action)}</li>`).join('')}</ul>` : `<p class="pf-empty">${t('Nenhuma alteração registrada.')}</p>`}</div>`;
  }

  // ---------- Prompts ----------
  function promptsTab() {
    const list = S.settings.prompts;
    const rows = list.length ? list.map(p => `<li><b>${h(p.id)}</b> <span class="dim">${t('publicada')}: v${h(p.published || '—')}</span>
      <div class="inline-gap">${p.versions.map(v => `<span class="aig-version">v${h(v.version)} ${v.note ? `· ${h(v.note)}` : ''} ${v.version === p.published ? badge('Publicada', 'green') : button(p.published > v.version ? 'Voltar para esta' : 'Publicar', 'publish', `data-id="${h(p.id)}" data-version="${h(v.version)}"`)}</span>`).join('')}</div></li>`).join('')
      : `<p class="pf-empty">${t('Nenhum prompt no registro ainda.')}</p>`;
    return `<div class="surface padded"><h2>${t('Prompts registrados')}</h2><ul class="aig-prompts">${rows}</ul></div>
      ${form('prompt', section('Nova versão', 'Salvar cria um rascunho; publicar é um passo separado. Use {{variavel}} no modelo da mensagem. Nunca coloque chave ou dado pessoal aqui.',
        `<div class="field-grid">${field('Identificador', input('id', '', 'required placeholder="marketing.copy"'))}${field('Modo', select('mode', MODES, 'auto'))}${field('Máximo de saída', input('maxOutputTokens', 1024, 'type="number" min="1"'))}${field('Temperatura', input('temperature', '', 'inputmode="decimal" placeholder="padrão do modelo"'))}</div>
         ${field('Prompt de sistema', '<textarea name="system" rows="5"></textarea>')}${field('Modelo da mensagem', '<textarea name="template" rows="4" placeholder="Crie uma copy para {{produto}}."></textarea>')}${field('Nota da versão', input('note', ''))}`), 'Salvar rascunho')}`;
  }

  // ---------- Playground ----------
  function playgroundTab() {
    const r = S.playground;
    let out = '';
    if (r?.simulated) out = `<div class="aig-result"><p><b>${t('Falha simulada')}: ${h(r.kind)}</b></p><p>${h(r.explanation)}</p><p class="dim">${t('Primeira tentativa')}: ${h(r.first || '—')} · ${t('próxima')}: ${h(r.next || '—')}</p><p class="dim">${t('Mensagem ao usuário')}: “${h(r.userMessage)}”</p></div>`;
    else if (r?.error) out = `<div class="aig-result"><p class="pf-error"><b>${h(r.kind || 'erro')}</b> ${h(r.error)}</p></div>`;
    else if (r) out = `<div class="aig-result"><pre class="aig-output">${h(r.json ? JSON.stringify(r.json, null, 2) : r.text || '')}</pre>
      <p class="dim">${h(r.modelKey || r.model || '')} · ${badge(r.tier === 'free' ? 'Gratuito' : r.tier === 'byok' ? 'Chave própria' : r.tier ? 'Pago' : '—', r.tier === 'free' ? 'green' : 'orange')} · ${t('tentativas')} ${num(r.attempts)} · ${num(r.usage?.inputTokens)} + ${num(r.usage?.outputTokens)} tokens (${h(r.usage?.source || '')}) · ${num(r.latencyMs)} ms${r.ttftMs ? ` · ${t('primeiro token')} ${num(r.ttftMs)} ms` : ''} · ${h(r.cost || '')}</p></div>`;
    return `${form('playground', section('Pedido', 'Chamadas reais consomem cota e orçamento como qualquer outra. Falhas simuladas não chamam provedor nenhum.',
      `<div class="field-grid">${field('Modo', select('mode', MODES, 'auto'))}${field('Modelo (opcional, chave do registro)', input('model', '', 'placeholder="groq/…"'))}${field('Plano', select('plan', [['free', 'Free'], ['paid', 'Pago']], 'paid'))}
        ${field('Máximo de saída', input('maxOutputTokens', 512, 'type="number" min="1"'))}${field('Temperatura', input('temperature', '', 'inputmode="decimal"'))}${field('Simular falha', select('simulateFailure', FAILURES, ''))}</div>
       ${field('Sistema', '<textarea name="system" rows="3"></textarea>')}${field('Mensagem', '<textarea name="prompt" rows="5" required></textarea>')}
       ${field('Schema JSON (opcional, ativa resposta estruturada)', '<textarea name="schema" rows="3" placeholder=\'{"type":"object","properties":{"titulo":{"type":"string"}},"required":["titulo"]}\'></textarea>')}
       <div class="inline-gap">${check('stream', false, 'Streaming')}${check('tools', false, 'Ferramenta de teste (hora do servidor)')}</div>
       <div aria-live="polite">${S.streaming ? `<pre class="aig-output" data-aig-stream></pre>` : out}</div>`), S.streaming ? 'Gerando…' : 'Executar')}`;
  }

  // ---------- Logs ----------
  function logsTab() {
    const f = S.logFilter;
    const rows = S.logs?.rows || [];
    const table = rows.length ? `<div class="aig-table-wrap"><table class="aig-table"><thead><tr><th>${t('Quando')}</th><th>${t('Funcionalidade')}</th><th>${t('Organização')}</th><th>${t('Modelo')}</th><th>${t('Status')}</th><th>${t('Tentativas')}</th><th>${t('Tokens')}</th><th>${t('Custo')}</th><th>${t('Latência')}</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${h(when(Date.parse(r.created_at)))}</td><td>${h(r.feature)}</td><td><small>${h(r.org_id)}</small></td><td>${h(r.model || '—')} ${r.tier ? badge(r.tier, r.tier === 'free' ? 'green' : r.tier === 'paid' ? 'orange' : 'blue') : ''}${r.cache_hit ? badge('cache', 'gray') : ''}</td>
        <td>${r.status === 'ok' ? badge('ok', 'green') : badge(r.error_kind || 'erro', 'red')}</td><td>${num(r.attempts)}</td><td>${num(r.input_tokens)} / ${num(r.output_tokens)}</td><td>${r.cost_source === 'free' ? t('grátis') : r.cost_source === 'byok' ? t('chave própria') : usd(r.cost_micros)}</td><td>${r.latency_ms ? `${num(r.latency_ms)} ms` : '—'}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="pf-empty">${t(S.logs?.error || 'Nenhuma requisição registrada com esses filtros.')}</p>`;
    return `<form class="surface padded aig-filter" data-aig-form="log-filter">${field('Status', select('status', [['', 'Todos'], ['ok', 'Ok'], ['error', 'Erro']], f.status))}
        ${field('Provedor', select('provider', [['', 'Todos'], ...S.overview.providers.map(p => [p.id, p.name])], f.provider))}${field('Funcionalidade', input('feature', f.feature, 'placeholder="graao.chat"'))}
        ${field('Tipo', select('tier', [['', 'Todos'], ['free', 'Gratuito'], ['paid', 'Pago'], ['byok', 'Chave própria']], f.tier))}<button class="secondary">${t('Filtrar')}</button></form>
      <div class="surface padded">${table}${S.logs?.next ? button('Carregar mais', 'more-logs') : ''}</div>`;
  }

  function render() {
    if (!S.overview && !S.error) { if (!S.loading) queueMicrotask(() => load('overview')); }
    const head = `<header class="page-head"><div><h1>${t('AI Gateway')}</h1><p>${t('Provedores, modelos, roteamento, custos e testes da IA da graao.')}</p></div><div class="head-actions"><a class="secondary button" href="#agency/plataforma">${t('Voltar para Plataforma')}</a>${button('Atualizar', 'reload')}</div></header>`;
    if (S.error && !S.overview) return `<div class="page" data-aig-root>${head}<div class="surface padded"><p class="form-status">${h(S.error)}</p>${button('Tentar de novo', 'reload')}</div></div>`;
    if (!S.overview || (!S.settings && S.tab !== 'overview' && S.tab !== 'providers')) return `<div class="page" data-aig-root>${head}<div class="pf-grid aig-tiles">${'<article class="surface pf-card aig-tile aig-skeleton"></article>'.repeat(6)}</div></div>`;
    const views = { overview: overviewTab, providers: providersTab, models: modelsTab, routing: routingTab, costs: costsTab, prompts: promptsTab, playground: playgroundTab, logs: logsTab };
    const content = (S.settings || ['overview', 'providers'].includes(S.tab)) ? views[S.tab]() : '';
    return `<div class="page" data-aig-root>${head}${S.error ? `<p class="form-status" role="alert">${h(S.error)}</p>` : ''}${utabs({ key: 'ai-gateway', label: tr('Seções do AI Gateway'), current: S.tab,
      items: TABS.map(([value, label]) => ({ value, label: tr(label), attrs: `data-aig="tab" data-aig-tab="${value}"` })), content })}</div>`;
  }

  // ---------- Ações ----------
  const post = (path, body) => api(path, body);
  const data = f => Object.fromEntries(new FormData(f));
  const flag = (f, name) => Boolean(f.elements[name]?.checked);
  const dollars = value => String(value ?? '').trim().replace(',', '.') || '0';

  async function runStream(body, formEl) {
    S.streaming = true; S.playground = null; rerender();
    const target = () => document.querySelector('[data-aig-stream]');
    let text = '';
    try {
      const response = await fetch('/api/platform/ai/playground', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok || !response.body) throw Error((await response.json().catch(() => ({}))).error || tr('O streaming falhou.'));
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '', final = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        for (let index = buffer.indexOf('\n\n'); index >= 0; index = buffer.indexOf('\n\n')) {
          const line = buffer.slice(0, index).replace(/^data: /, ''); buffer = buffer.slice(index + 2);
          const event = JSON.parse(line);
          if (event.type === 'delta') { text += event.text; const el = target(); if (el) el.textContent = text; }
          else if (event.type === 'done') final = { ...event.result, text };
          else if (event.type === 'error') final = { error: event.message, kind: event.kind };
        }
      }
      S.playground = final || { error: tr('O streaming terminou sem resposta.') };
    } catch (error) { S.playground = { error: error.message }; }
    finally { S.streaming = false; rerender(); formEl?.querySelector('button.primary')?.focus(); }
  }

  async function onClick(ev) {
    const el = ev.target.closest('[data-aig]');
    if (!el?.closest('[data-aig-root]')) return;
    ev.preventDefault();
    const action = el.dataset.aig, id = el.dataset.id;
    try {
      if (action === 'tab') { S.tab = el.dataset.aigTab; rerender(); return load(S.tab); }
      if (action === 'reload') return load(S.tab);
      if (action === 'kill') {
        const on = el.dataset.on === '1', key = el.dataset.key;
        if (on && !await ask(tr(key === 'all' ? 'Desligar todo o AI Gateway?' : 'Bloquear todas as chamadas pagas?'), { text: tr(key === 'all' ? 'Nenhuma funcionalidade de IA vai responder até você religar.' : 'Gratuito e chave própria das agências continuam funcionando.'), ok: tr('Confirmar') })) return;
        await post('/api/platform/ai/settings', { killSwitch: { [key]: on } });
        flash(tr(on ? 'Kill switch ativado.' : 'Kill switch desativado.')); return load('overview');
      }
      if (action === 'test') { const r = await post('/api/platform/ai/provider/test', { id }); flash(r.message, !r.ok); return; }
      if (action === 'sync') { el.disabled = true; const r = await post('/api/platform/ai/provider/sync', { id }); flash(`${tr('Modelos sincronizados')}: ${r.total} (${r.added} ${tr('novos')}, ${r.retired} ${tr('descontinuados')}).`); return load('providers'); }
      if (action === 'reset') { await post('/api/platform/ai/provider/reset', { id }); flash(tr('Provedor tirado da pausa.')); return load('providers'); }
      if (action === 'order') {
        const order = [...S.settings.routing.freeOrder];
        const index = order.indexOf(id), to = index + Number(el.dataset.dir);
        [order[index], order[to]] = [order[to], order[index]];
        S.settings = await post('/api/platform/ai/settings', { routing: { freeOrder: order } }); rerender(); return;
      }
      if (action === 'publish') {
        if (!await ask(tr('Publicar esta versão?'), { text: tr('As funcionalidades que usam este prompt passam a usar esta versão na hora.'), danger: false })) return;
        await post('/api/platform/ai/prompts', { action: 'publish', id, version: Number(el.dataset.version) }); flash(tr('Versão publicada.')); return load('prompts');
      }
      if (action === 'more-logs') {
        const next = await api(`/api/platform/ai/logs?${new URLSearchParams({ ...S.logFilter, after: S.logs.next, limit: '50' })}`);
        S.logs = { ...next, rows: [...S.logs.rows, ...next.rows] }; rerender();
      }
    } catch (error) { flash(error.message, true); el.disabled = false; }
  }

  async function onSubmit(ev) {
    const f = ev.target.closest('form[data-aig-form]');
    if (!f?.closest('[data-aig-root]')) return;
    ev.preventDefault();
    const status = f.querySelector('.form-status');
    const submit = f.querySelector('button.primary, button.secondary');
    if (submit) submit.disabled = true;
    const d = data(f);
    try {
      switch (f.dataset.aigForm) {
        case 'provider': {
          const limits = Object.fromEntries(['rpm', 'rpd', 'tpm', 'tpd', 'tokensMonth', 'concurrency'].map(key => [key, Number(d[`limit_${key}`]) || 0]));
          await post('/api/platform/ai/settings', { provider: { id: f.dataset.id, enabled: flag(f, 'enabled'), freeTier: flag(f, 'freeTier'), commercialUse: flag(f, 'commercialUse'),
            paidAllowed: flag(f, 'paidAllowed'), priority: Number(d.priority), monthlyBudget: dollars(d.monthlyBudget), limits,
            privacy: { reviewed: flag(f, 'reviewed'), trainsOnData: d.trainsOnData, retention: d.retention, maxClass: d.maxClass, dpa: flag(f, 'dpa') } } });
          flash(tr('Regras do provedor salvas.')); await load('providers'); break;
        }
        case 'model': {
          const patch = { enabled: flag(f, 'enabled'), blocked: flag(f, 'blocked'), freeTier: flag(f, 'freeTier'), quality: Number(d.quality), contextWindow: Number(d.contextWindow) || null,
            commercial: d.commercial === '' ? null : d.commercial === '1', caps: Object.fromEntries(CAPS.map(cap => [cap, flag(f, `cap_${cap}`)])) };
          if (d.priceIn !== '' && d.priceOut !== '') patch.pricing = { inputMicrosPerM: Math.round(Number(dollars(d.priceIn)) * 1e6), outputMicrosPerM: Math.round(Number(dollars(d.priceOut)) * 1e6) };
          await post('/api/platform/ai/model', { key: f.dataset.key, patch });
          flash(tr('Modelo salvo.')); await load('models'); break;
        }
        case 'model-filter': S.modelQuery = { provider: d.provider || '', q: d.q || '', eligible: flag(f, 'eligible') ? '1' : '' }; await load('models'); break;
        case 'model-add': await post('/api/platform/ai/model/add', { provider: d.provider, providerModelId: d.providerModelId, name: d.name, type: d.type, contextWindow: Number(d.contextWindow) || null }); flash(tr('Modelo cadastrado.')); await load('models'); break;
        case 'routing':
          S.settings = await post('/api/platform/ai/settings', { routing: { weights: Object.fromEntries(WEIGHTS.map(([key]) => [key, Number(d[`w_${key}`])])), maxAttempts: Number(d.maxAttempts),
            attemptTimeoutMs: Number(d.attemptTimeoutMs), totalTimeoutMs: Number(d.totalTimeoutMs), breaker: { failures: Number(d.breakerFailures), cooldownMs: Number(d.breakerCooldownMs) } }, agenciesWithoutKey: d.agenciesWithoutKey });
          flash(tr('Roteamento salvo.')); rerender(); break;
        case 'feature':
          S.settings = await post('/api/platform/ai/settings', { feature: { id: f.dataset.id, mode: d.mode, dataClass: d.dataClass, allowPaid: flag(f, 'allowPaid'), disabled: !flag(f, 'enabled') } });
          flash(tr('Funcionalidade salva.')); rerender(); break;
        case 'simulate':
          S.simulation = await post('/api/platform/ai/simulate', { feature: d.feature, mode: d.mode, plan: d.plan, dataClass: d.dataClass || undefined, estimatedInputTokens: Number(d.estimatedInputTokens),
            maxOutputTokens: Number(d.maxOutputTokens), needs: { tools: flag(f, 'tools'), webSearch: flag(f, 'webSearch') }, ...(flag(f, 'structured') && { schema: { type: 'object', properties: {} } }), prompt: 'simulação' });
          rerender(); break;
        case 'budgets':
          S.settings = await post('/api/platform/ai/settings', { budgets: { monthly: dollars(d.monthly), daily: dollars(d.daily), perOrgMonthly: dollars(d.perOrgMonthly), alertAt: Number(d.alertAt) / 100 },
            cache: { enabled: flag(f, 'cacheEnabled'), ttlMs: Number(d.cacheMinutes) * 60000 } });
          flash(tr('Orçamento salvo.')); rerender(); break;
        case 'plans':
          for (const id of ['free', 'paid', 'byok']) {
            S.settings = await post('/api/platform/ai/settings', { plan: { id, ...(id !== 'byok' && { allowPaid: flag(f, `${id}_allowPaid`) }), dailyRequests: Number(d[`${id}_dailyRequests`]),
              maxInputTokens: Number(d[`${id}_maxInputTokens`]), maxOutputTokens: Number(d[`${id}_maxOutputTokens`]), concurrency: Number(d[`${id}_concurrency`]) } });
          }
          flash(tr('Planos salvos.')); rerender(); break;
        case 'prompt': await post('/api/platform/ai/prompts', { action: 'save', ...d }); flash(tr('Rascunho salvo. Publique quando estiver pronto.')); await load('prompts'); break;
        case 'log-filter': S.logFilter = Object.fromEntries(Object.entries(d).filter(([, value]) => value)); await load('logs'); break;
        case 'playground': {
          let schema = null;
          if (d.schema?.trim()) { try { schema = JSON.parse(d.schema); } catch { throw Error(tr('O schema não é um JSON válido.')); } }
          const body = { mode: d.mode, model: d.model, plan: d.plan, maxOutputTokens: Number(d.maxOutputTokens), temperature: d.temperature === '' ? undefined : Number(dollars(d.temperature)),
            system: d.system, prompt: d.prompt, schema, simulateFailure: d.simulateFailure || undefined, needs: { tools: flag(f, 'tools') } };
          if (flag(f, 'stream') && !body.simulateFailure && !schema) { await runStream({ ...body, stream: true }, f); break; }
          S.playground = await post('/api/platform/ai/playground', body); rerender(); break;
        }
        default: throw Error(tr('Formulário desconhecido.'));
      }
    } catch (error) {
      if (status) status.textContent = error.message; else flash(error.message, true);
    } finally { if (submit) submit.disabled = false; }
  }

  let installed = false;
  function install() {
    if (installed) return;
    installed = true;
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
  }

  return { render, install, load };
}
