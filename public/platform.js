// Página Plataforma (admin geral, só o dono): plano, uso e limites dos serviços externos, a partir da View
// que /api/platform/usage devolve. Puro: recebe os dados e o escape/tradução, devolve HTML.
import { formatAmount, dayMonth } from './platform-format.js';

export { formatAmount };

const PLAN_NAMES = { free: 'Free', pro: 'Pro', hobby: 'Hobby' };
const SETUP = {
  supabase: 'a função go_platform_usage no SQL Editor do Supabase',
  vercel: 'VERCEL_API_TOKEN e VERCEL_TEAM_ID',
  cloudflare: 'CLOUDFLARE_API_TOKEN',
  hostinger: 'HOSTINGER_API_TOKEN',
  evolution: 'EVOLUTION_BASE_URL e EVOLUTION_API_KEY',
  twilio: 'TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN (só se o graao usar a telefonia)',
  openai: 'OPENAI_ADMIN_KEY (gasto do mês da conta do graao; as agências usam chaves próprias)',
  resend: 'RESEND_API_KEY com acesso total',
  meta: 'META_APP_ID e META_APP_SECRET'
};
const LEVEL_TEXT = { ok: 'Normal', warn: 'Atenção', critical: 'Urgente' };

const alerting = view => view.services.flatMap(service => service.status === 'ok'
  ? service.metrics.filter(m => m.level === 'warn' || m.level === 'critical').map(m => ({ service, metric: m })) : []);

function metricValue(metric) {
  const kind = metric.kind || 'usage';
  if (kind === 'deadline') return `vence em ${formatAmount(metric.used, 'days')}`;
  if (kind === 'check') return metric.note || '';
  if (kind === 'floor') return `${formatAmount(metric.used, metric.unit)} (mínimo ${formatAmount(metric.limit, metric.unit)})`;
  if (metric.used === null || metric.used === undefined) return metric.note || 'sem dados';
  return metric.limit ? `${formatAmount(metric.used, metric.unit)} de ${formatAmount(metric.limit, metric.unit)}` : formatAmount(metric.used, metric.unit);
}

function metricRow(metric, h) {
  const level = ['warn', 'critical'].includes(metric.level) ? metric.level : 'ok';
  const badge = metric.kind === 'check' ? (metric.used === null || metric.used === undefined ? '—' : metric.used ? 'OK' : 'Pendente')
    : metric.pct !== null && metric.pct !== undefined ? `${Math.round(metric.pct)}%`
    : metric.used === null || metric.used === undefined ? '—' : LEVEL_TEXT[level];
  const bar = metric.pct !== null && metric.pct !== undefined
    ? `<span class="pf-bar ${level}" aria-hidden="true"><span data-w="${Math.max(0, Math.min(100, Math.round(metric.pct)))}"></span></span>` : '';
  const forecast = metric.projection === 'safe' ? 'não estoura neste ciclo'
    : metric.projection ? `no ritmo atual: cheio em ${dayMonth(metric.projection)}` : '';
  return `<div class="pf-metric"><div class="pf-row"><span>${h(metric.label)}</span><span class="pf-level ${level}">${h(badge)}</span></div>
    ${bar}<small class="pf-detail">${h(metricValue(metric))}${forecast ? ` · ${h(forecast)}` : ''}</small></div>`;
}

function card(service, h) {
  const plan = PLAN_NAMES[service.plan] || service.plan || '';
  const link = service.link ? `<a class="pf-link" href="${h(service.link)}" target="_blank" rel="noopener">Painel ↗</a>` : '';
  let body;
  if (service.status === 'not-configured') {
    body = `<p class="pf-empty"><b>Não conectado.</b> Configure ${h(SETUP[service.service] || 'as variáveis do serviço')}. O passo a passo está em docs/plataforma-limites.md.</p>`;
  } else if (service.status === 'error') {
    body = `<p class="pf-error"><b>Não consegui ler os dados:</b> ${h(service.error || 'erro desconhecido')}${service.service === 'supabase' ? '. Confira se a função go_platform_usage foi criada no SQL Editor.' : ''}</p>`;
  } else {
    body = service.metrics.map(metric => metricRow(metric, h)).join('') || '<p class="pf-empty">Sem métricas.</p>';
  }
  return `<article class="surface pf-card ${h(service.status)}" data-service="${h(service.service)}"><header class="pf-card-head"><div><h2>${h(service.name)}</h2>${plan ? `<span class="pf-plan">${h(plan)}</span>` : ''}</div>${link}</header>${body}</article>`;
}

/** A faixa de aviso (página Plataforma e painel da agência). Vazia quando nada está em 80% ou mais. */
export function platformBanner(view, { h, tr = x => x, link = true }) {
  const items = alerting(view);
  if (!items.length) return '';
  const worst = items.some(({ metric }) => metric.level === 'critical') ? 'critical' : 'warn';
  const title = `${items.length} ${items.length === 1 ? 'limite perto de estourar' : 'limites perto de estourar'}`;
  const list = items.map(({ service, metric }) => `${service.name} · ${metric.label} ${metric.pct !== null && metric.pct !== undefined ? `${Math.round(metric.pct)}%` : metricValue(metric)}`).join('  ·  ');
  return `<div class="surface padded pf-banner ${worst}" role="status"><div><b>${h(tr(title))}</b><span>${h(list)}</span></div>${link ? `<a class="secondary" href="#agency/plataforma">${h(tr('Ver Plataforma'))}</a>` : ''}</div>`;
}

export function platformPage(view, { h, tr = x => x }) {
  const checked = view.checkedAt ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(view.checkedAt)) : 'ainda não conferido';
  const noChannelText = view.settings.alertEmail
    ? 'O e-mail de alerta está salvo, mas o envio de e-mail não está configurado no servidor (RESEND_API_KEY e PORTAL_EMAIL_FROM). Ative as notificações neste aparelho ou configure o envio.'
    : 'Informe um e-mail ou ative as notificações neste aparelho para ser avisado antes de um limite estourar.';
  const noChannel = !view.channels.email && !view.channels.push
    ? `<div class="surface padded pf-banner warn" role="alert"><div><b>${h(tr('Nenhum canal de alerta ativo'))}</b><span>${h(tr(noChannelText))}</span></div></div>` : '';
  const plans = view.settings.plans || {};
  const option = (value, current) => `<option value="${value}" ${current === value ? 'selected' : ''}>${PLAN_NAMES[value]}</option>`;
  return `<div class="page pf">
    <header class="page-head"><div><h1>${h(tr('Plataforma'))}</h1><p>${h(tr('Planos, uso e limites dos serviços que mantêm o graao no ar. Conferido de hora em hora.'))}</p></div>
      <div class="head-actions"><span class="pf-checked">${h(tr('Última conferência'))}: ${h(checked)}</span><button class="secondary" data-ag="pf-check">${h(tr('Conferir agora'))}</button></div></header>
    ${platformBanner(view, { h, tr, link: false })}${noChannel}
    <div class="pf-grid">${view.services.map(service => card(service, h)).join('')}</div>
    <p class="pf-unmonitored">${h(tr('Sem acompanhamento automático'))}: ${view.unmonitored.map(item => `<a href="${h(item.url)}" target="_blank" rel="noopener">${h(item.name)} ↗</a>`).join(' · ')}</p>
    <section class="surface padded pf-settings"><h2>${h(tr('Alertas e planos'))}</h2>
      <form data-ag-form="pf-settings" class="field-grid">
        <label>${h(tr('E-mail para alertas'))}<input name="alertEmail" type="email" maxlength="200" value="${h(view.settings.alertEmail)}" placeholder="voce@empresa.com"></label>
        <label>${h(tr('Saldo mínimo do Twilio (US$)'))}<input name="twilioMinUsd" type="number" min="0" max="10000" step="1" value="${h(view.settings.twilioMinUsd)}"></label>
        <label>${h(tr('Plano do Supabase'))}<select name="supabase">${option('free', plans.supabase || 'free')}${option('pro', plans.supabase)}</select></label>
        <label>${h(tr('Plano da Vercel (se a API não informar)'))}<select name="vercel">${option('hobby', plans.vercel || 'hobby')}${option('pro', plans.vercel)}</select></label>
        <div class="pf-actions"><button class="primary">${h(tr('Salvar'))}</button><p class="form-status" role="status"></p></div>
      </form>
      <div class="pf-push"><button class="secondary" data-ag="pf-push">${h(tr('Ativar notificações neste aparelho'))}</button><span class="pf-checked">${view.settings.pushDevices} ${h(tr(view.settings.pushDevices === 1 ? 'aparelho ativo' : 'aparelhos ativos'))}</span></div>
    </section>
  </div>`;
}
