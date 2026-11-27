// Marketing → Anúncios (Ad Manager) and the Relatórios → Atribuição / Google Ads / Meta Ads reports.
// Numbers come from ui/ads-data.js; connections and campaign changes go through /api/ads/workspace/*.
import { brandIcon, icon } from './icons.js';
import { h, pageShell } from './screens.js';
import { adNetworks, attributionReport, campaignReport, channelName, channels, eventTypes, eventsCsv, metaCtas, metaObjectives, presetRange, rangePresets } from './ads-data.js';
import { ask } from './ask.js';
import { tr } from './i18n.js';

const ui = { range: '30d', from: '', to: '', kind: 'revenue', network: 'all', channel: '', model: '' };
let status = null, loading = '', requestStatus = () => {};
const networkLabel = id => adNetworks.find(n => n[0] === id)?.[1] || id;
const zoneOf = c => c.s.profile?.timezone || 'America/Sao_Paulo';
const currencyOf = c => c.s.profile?.currency || 'BRL';
const money = (c, value, currency) => value == null ? '—' : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: currency || currencyOf(c), maximumFractionDigits: 2 });
const count = value => value == null ? '—' : Number(value).toLocaleString('pt-BR');
const pct = value => value == null ? '—' : `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const settingsOf = c => c.s.adSettings || { fees: {}, model: 'last', connected: {}, lastSync: {}, syncErrors: {} };
const modelOf = c => ui.model || settingsOf(c).model || 'last';
const when = (c, iso) => iso ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: zoneOf(c) }).format(new Date(iso)) : '—';
const rangeOf = c => presetRange(ui.range, zoneOf(c), new Date(), { from: ui.from, to: ui.to });
const badge = (text, tone = '') => `<span class="badge ${tone}">${h(text)}</span>`;
const statusBadge = s => s === 'active' ? badge('Ativa', 'green') : s === 'paused' ? badge('Pausada') : s ? badge('Outro status', 'blue') : '';
export const reportingAdsTabs = ['attribution', 'google-ads', 'meta-ads'];

function rangeControls(c, extra = '') {
  const [from, to] = rangeOf(c);
  return `<div class="ad-toolbar"><label class="ad-field">Período<select data-ad-set="range">${rangePresets.map(([id, label]) => `<option value="${id}" ${ui.range === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    ${ui.range === 'custom' ? `<label class="ad-field">De<input type="date" data-ad-set="from" value="${h(ui.from || from)}"></label><label class="ad-field">Até<input type="date" data-ad-set="to" value="${h(ui.to || to)}"></label>` : `<span class="dim ad-range">${from.split('-').reverse().join('/')} – ${to.split('-').reverse().join('/')}</span>`}
    <label class="ad-field">Atribuição<select data-ad-set="model"><option value="last" ${modelOf(c) === 'last' ? 'selected' : ''}>Último toque</option><option value="first" ${modelOf(c) === 'first' ? 'selected' : ''}>Primeiro toque</option></select></label>${extra}</div>`;
}

// ---- Marketing → Anúncios ------------------------------------------------------------------------
function connectionCard(c, network) {
  const [id, label] = adNetworks.find(n => n[0] === network), conn = status?.[id] || {}, settings = settingsOf(c);
  const head = `<div class="ad-card-head">${brandIcon(id === 'meta' ? 'meta-ads' : 'google-ads', 28)}<div><b>${label}</b><span class="dim">${conn.connected ? h(conn.user || 'Conectado') : 'Não conectado'}</span></div></div>`;
  if (!status) return `<article class="surface ad-card">${head}<p class="dim">Carregando…</p></article>`;
  if (!status.configured?.[id] && !conn.connected) return `<article class="surface ad-card">${head}<p class="dim">${id === 'meta' ? 'Esta instalação ainda não tem o app da Meta configurado (META_APP_ID e META_APP_SECRET, com as permissões ads_read e ads_management).' : 'Esta instalação ainda não tem o Google Ads configurado (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET, com a Google Ads API ativada no projeto do Google Cloud).'}</p></article>`;
  if (!conn.connected) return `<article class="surface ad-card">${head}<p class="dim">${id === 'meta' ? 'Conecte a conta de anúncios para ver campanhas, gastos e criar anúncios.' : 'Conecte a conta do Google Ads para ver campanhas, gastos e o retorno de cada uma.'}</p><div class="inline-gap"><button type="button" class="primary" data-ad-act="connect" data-network="${id}">${icon('link', 15)} Conectar ${label}</button></div></article>`;
  const select = (kind, list, value, empty) => `<label class="ad-field">${kind === 'account' ? 'Conta de anúncios' : 'Página que assina os anúncios'}<select data-ad-select="${kind}" data-network="${id}"><option value="">${empty}</option>${list.map(a => `<option value="${h(a.id)}" ${a.id === value ? 'selected' : ''}>${h(a.name)}${a.currency ? ` (${h(a.currency)})` : ''}${a.active === false ? ' · inativa' : ''}</option>`).join('')}</select></label>`;
  const error = settings.syncErrors?.[id];
  return `<article class="surface ad-card">${head}
    ${select('account', conn.accounts, conn.accountId, conn.accounts.length ? 'Escolha a conta' : 'Nenhuma conta encontrada')}
    ${id === 'meta' ? select('page', conn.pages, conn.pageId, conn.pages.length ? 'Escolha a Página' : 'Nenhuma Página encontrada') : ''}
    <p class="dim">${settings.lastSync?.[id] ? `Sincronizado em ${when(c, settings.lastSync[id])} · a cada 3 horas` : conn.accountId ? 'Ainda não sincronizado.' : 'Escolha a conta para sincronizar.'}</p>
    ${error ? `<p class="ad-error" role="alert">${icon('alert', 14)} ${h(error)}</p>` : ''}
    <div class="inline-gap"><button type="button" class="secondary" data-ad-act="sync" data-network="${id}" ${conn.accountId && !loading ? '' : 'disabled'}>${icon('refresh', 15)} ${loading === id ? 'Sincronizando…' : 'Sincronizar'}</button>
      <a class="secondary" href="#reporting/${id}-ads">${icon('chart', 15)} Relatório</a><button type="button" class="plain danger" data-ad-act="disconnect" data-network="${id}">Desconectar</button></div></article>`;
}

function campaignsTable(c) {
  const range = rangeOf(c), list = [];
  for (const [id] of adNetworks) {
    if (ui.network !== 'all' && ui.network !== id) continue;
    const report = campaignReport(c.s, id, { range, zone: zoneOf(c), fee: 0, model: modelOf(c) });
    for (const row of report.rows) if (row.id) list.push({ ...row, network: id, currency: (c.s.adCampaigns || []).find(x => x.network === id && x.id === row.id)?.currency });
  }
  list.sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || b.cost - a.cost);
  const filter = `<div class="sp-seg ad-seg" role="group" aria-label="Rede">${[['all', 'Todas'], ...adNetworks.map(n => [n[0], n[1]])].map(([id, label]) => `<button type="button" class="${ui.network === id ? 'on' : ''}" data-ad-set="network" data-value="${id}">${label}</button>`).join('')}</div>`;
  const rows = list.map(r => `<tr><td><div class="ad-camp">${brandIcon(r.network === 'meta' ? 'meta-ads' : 'google-ads', 18)}<b>${h(r.name)}</b></div></td><td>${statusBadge(r.status)}</td>
    <td>${r.budget ? money(c, r.budget, r.currency) : '—'}</td><td>${money(c, r.cost, r.currency)}</td><td>${count(r.clicks)}</td><td>${pct(r.ctr)}</td><td>${count(r.leads)}</td><td>${money(c, r.cpl, r.currency)}</td><td>${money(c, r.revenue)}</td>
    <td class="right"><div class="ad-actions">${r.status === 'other' ? '' : `<button type="button" class="secondary" data-ad-act="status" data-network="${r.network}" data-id="${h(r.id)}" data-on="${r.status === 'active' ? '0' : '1'}">${r.status === 'active' ? 'Pausar' : 'Ativar'}</button>`}
      <button type="button" class="icon-btn" title="Mudar orçamento diário" aria-label="Mudar orçamento diário de ${h(r.name)}" data-ad-act="budget" data-network="${r.network}" data-id="${h(r.id)}">${icon('edit', 15)}</button></div></td></tr>`);
  return `<section class="surface ad-section"><div class="ad-section-head"><h2>Campanhas</h2>${filter}</div>${rangeControls(c)}
    ${rows.length ? `<div class="table-shell"><table><thead><tr><th>Campanha</th><th>Status</th><th>Orçamento/dia</th><th>Custo</th><th>Cliques</th><th>CTR</th><th>Leads</th><th>CPL</th><th>Receita</th><th></th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`
      : `<div class="empty">${icon('meg', 26)}<strong>Nenhuma campanha ainda</strong><p>Conecte uma conta e escolha a conta de anúncios. As campanhas aparecem depois da primeira sincronização.</p></div>`}</section>`;
}

const trackingHelp = `<details class="surface ad-section ad-help"><summary>${icon('bulb', 15)} Como ligar leads e vendas a cada campanha</summary>
  <p>O Graao guarda de onde veio cada visitante das suas páginas, formulários, loja e webinars (UTM, gclid, fbclid e site de origem). Para o relatório saber qual campanha trouxe o lead, use nas URLs dos anúncios:</p>
  <p><b>Google Ads</b> (modelo de acompanhamento da conta): <code>{lpurl}?utm_source=google&amp;utm_medium=cpc&amp;utm_campaign={campaignid}</code></p>
  <p><b>Meta Ads</b> (parâmetros de URL do anúncio): <code>utm_source=facebook&amp;utm_medium=paid&amp;utm_campaign={{campaign.name}}&amp;utm_id={{campaign.id}}</code>. Os anúncios criados pelo Graao já saem com esses parâmetros.</p>
  <p class="dim">Formulários incorporados em outros sites só recebem a origem quando o visitante passou antes por uma página do Graao.</p></details>`;

export function adsScreen(c, { marketingTabs }) {
  if (status?.workspace !== c.workspace) queueMicrotask(() => requestStatus());
  const meta = status?.meta;
  const cta = meta?.connected && meta.accountId ? `<button type="button" class="primary" data-ad-act="create">${icon('plus', 15)} Criar anúncio</button>` : '';
  return pageShell({ title: 'Anúncios', desc: 'Campanhas do Meta Ads e do Google Ads, com o custo, os leads e as vendas de cada uma.', className: 'ad-page', cta,
    tabs: { key: 'marketing', items: marketingTabs, current: 'ads', label: 'Seções de marketing' },
    content: `<div class="ad-cards">${connectionCard(c, 'meta')}${connectionCard(c, 'google')}</div>${campaignsTable(c)}${trackingHelp}` });
}

function createForm(c) {
  const images = (c.s.files || []).filter(f => /^data:image\/(png|jpe?g|gif)/.test(f.data || '')).slice(-24).reverse();
  const local = new Date(Date.now() + 15 * 60_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  return `<form class="ad-form" data-ad-form="create">
    <label>Nome da campanha<input name="name" required maxlength="120" placeholder="Ex.: Promoção de dezembro"></label>
    <div class="field-grid"><label>Objetivo<select name="objective">${metaObjectives.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label>
      <label>Orçamento diário (${h(currencyOf(c))})<input type="number" name="dailyBudget" min="6" step="1" value="20" required></label></div>
    <div class="field-grid"><label>Início<input type="datetime-local" name="start" value="${local}" required></label><label>Término (opcional)<input type="datetime-local" name="end"></label></div>
    <fieldset class="sp-block"><legend>Público</legend><div class="field-grid"><label>Países (códigos)<input name="countries" value="BR" placeholder="BR, PT"></label>
      <label>Gênero<select name="gender"><option value="">Todos</option><option value="female">Mulheres</option><option value="male">Homens</option></select></label>
      <label>Idade mínima<input type="number" name="ageMin" min="18" max="65" value="18"></label><label>Idade máxima<input type="number" name="ageMax" min="18" max="65" value="65"></label></div></fieldset>
    <label>Texto do anúncio<textarea name="message" rows="3" required maxlength="2000" placeholder="O que a pessoa vai ler acima da imagem"></textarea></label>
    <div class="field-grid"><label>Título<input name="headline" maxlength="255" placeholder="Aparece abaixo da imagem"></label><label>Botão<select name="cta">${metaCtas.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label></div>
    <label>Link de destino<input type="url" name="link" required placeholder="https://"></label>
    <fieldset class="sp-block"><legend>Imagem (Mídia Drive)</legend>${images.length ? `<div class="ad-images">${images.map((f, n) => `<label class="ad-image"><input type="radio" name="fileId" value="${h(f.id)}" ${n ? '' : 'checked'}><img src="${h(f.data)}" alt="${h(f.name)}"></label>`).join('')}</div>` : '<p class="dim">Envie uma imagem em Mídia Drive primeiro (PNG, JPG ou GIF, de preferência 1080 × 1080).</p>'}</fieldset>
    <p class="dim">O anúncio é criado <b>pausado</b> na sua conta da Meta, com campanha, público, imagem e parâmetros UTM. Revise e ative quando quiser.</p>
    <p class="form-status" role="alert"></p><footer class="inline-gap"><button class="primary" ${images.length ? '' : 'disabled'}>Criar anúncio pausado</button><button type="button" class="secondary" data-act="close">Cancelar</button></footer></form>`;
}

// ---- Relatórios ----------------------------------------------------------------------------------
const kpi = (label, value, note = '') => `<div class="surface ad-kpi"><span>${label}</span><b>${value}</b>${note ? `<small class="dim">${note}</small>` : ''}</div>`;

function bars(c, days) {
  const max = Math.max(...days.map(d => d.cost), 0);
  if (!max) return '';
  const w = 100 / days.length;
  return `<figure class="surface ad-chart"><figcaption>Custo por dia</figcaption><svg viewBox="0 0 100 30" preserveAspectRatio="none" role="img" aria-label="Custo por dia no período">
    ${days.map((d, n) => `<rect x="${(n * w + w * 0.15).toFixed(2)}" y="${(30 - (d.cost / max) * 28).toFixed(2)}" width="${(w * 0.7).toFixed(2)}" height="${((d.cost / max) * 28).toFixed(2)}" rx="0.4"><title>${d.date.split('-').reverse().join('/')}: ${money(c, d.cost)}</title></rect>`).join('')}</svg></figure>`;
}

function networkReport(c, network) {
  const [id, label] = adNetworks.find(n => n[0] === network), settings = settingsOf(c), fee = settings.fees?.[id] || 0;
  const connected = settings.connected?.[id] || (c.s.adCampaigns || []).some(x => x.network === id);
  const extra = `<label class="ad-field">Taxa de gestão (%)<input type="number" min="0" max="500" step="0.5" value="${fee}" data-ad-fee="${id}"></label>`;
  if (!connected) return `${rangeControls(c, extra)}<div class="surface empty">${brandIcon(id === 'meta' ? 'meta-ads' : 'google-ads', 30)}<strong>${label} não conectado</strong><p>Conecte a conta em Marketing → Anúncios para ver custo, cliques e o retorno de cada campanha.</p><a class="primary" href="#marketing/ads">Ir para Anúncios</a></div>`;
  const report = campaignReport(c.s, id, { range: rangeOf(c), zone: zoneOf(c), fee, model: modelOf(c) }), t = report.total;
  const currency = (c.s.adCampaigns || []).find(x => x.network === id)?.currency;
  const mixed = currency && currency !== currencyOf(c);
  const cols = ['Campanha', 'Status', 'Cliques', 'Custo', 'Receita', 'ROI', 'CPC', 'CTR', 'Vendas', 'Custo por venda', 'Leads', 'CPL', 'Impressões', 'Receita média'];
  const line = (r, total = false) => `<tr${total ? ' class="ad-total"' : ''}><td>${total ? '<b>Total</b>' : `<b>${h(r.name)}</b>`}</td><td>${total ? '' : statusBadge(r.status)}</td><td>${count(r.clicks)}</td><td>${money(c, r.cost, currency)}</td><td>${money(c, r.revenue)}</td>
    <td class="${r.roi > 0 ? 'ad-up' : r.roi < 0 ? 'ad-down' : ''}">${pct(r.roi)}</td><td>${money(c, r.cpc, currency)}</td><td>${pct(r.ctr)}</td><td>${count(r.sales)}</td><td>${money(c, r.cps, currency)}</td><td>${count(r.leads)}</td><td>${money(c, r.cpl, currency)}</td><td>${count(r.impressions)}</td><td>${money(c, r.avgRevenue)}</td></tr>`;
  return `${rangeControls(c, extra)}
    <div class="ad-kpis">${kpi('Custo', money(c, t.cost, currency), fee ? `inclui ${fee}% de gestão` : '')}${kpi('Receita', money(c, t.revenue), `${count(t.sales)} venda(s)`)}${kpi('ROI', pct(t.roi))}${kpi('Leads', count(t.leads), t.platformLeads ? `${count(t.platformLeads)} contados pela rede` : '')}${kpi('CPL', money(c, t.cpl, currency))}${kpi('Cliques', count(t.clicks), `CTR ${pct(t.ctr)}`)}</div>
    ${mixed ? `<p class="ad-error">${icon('alert', 14)} A conta de anúncios usa ${h(currency)} e a receita está em ${h(currencyOf(c))}: o ROI compara moedas diferentes.</p>` : ''}
    ${bars(c, report.days)}
    <div class="surface table-shell ad-report-table"><table><thead><tr>${cols.map(x => `<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${report.rows.map(r => line(r)).join('')}${report.rows.length ? line(t, true) : ''}</tbody></table>${report.rows.length ? '' : '<p class="dim ad-pad">Nenhuma campanha no período.</p>'}</div>
    <p class="dim">Custo, cliques e impressões vêm do ${label}. Leads, vendas e receita vêm do CRM: contatos cuja origem (${modelOf(c) === 'first' ? 'primeiro' : 'último'} toque) aponta para a campanha e faturas pagas no período.</p>`;
}

function attribution(c) {
  const range = rangeOf(c), zone = zoneOf(c), report = attributionReport(c.s, { model: modelOf(c), range, zone });
  const kinds = [['revenue', 'Receita'], ['leads', 'Leads'], ['opportunities', 'Oportunidades']];
  const metric = { revenue: 'revenue', leads: 'leads', opportunities: 'opportunities' }[ui.kind];
  const totalMetric = report.byChannel.reduce((n, ch) => n + ch[metric], 0);
  const share = report.byChannel.filter(ch => ch[metric]).sort((a, b) => b[metric] - a[metric]).map(ch => `<li><span class="ad-dot" style="background:${ch.color}"></span><span>${h(ch.label)}</span>
    <span class="ad-bar"><i style="width:${(ch[metric] / totalMetric * 100).toFixed(1)}%;background:${ch.color}"></i></span><b>${ui.kind === 'revenue' ? money(c, ch[metric]) : count(ch[metric])}</b></li>`).join('');
  const heads = { revenue: ['Vendas', 'Receita'], leads: ['Leads'], opportunities: ['Oportunidades', 'Valor em aberto', 'Ganhas', 'Valor ganho'] }[ui.kind];
  const cells = r => ({ revenue: [count(r.sales), money(c, r.revenue)], leads: [count(r.leads)], opportunities: [count(r.opportunities), money(c, r.pipeline), count(r.won), money(c, r.wonValue)] }[ui.kind]);
  const rows = report.rows.filter(r => ui.kind === 'revenue' ? r.sales : ui.kind === 'leads' ? r.leads : r.opportunities || r.won);
  const events = (c.s.attributionEvents || []).filter(e => e.created.slice(0, 10) >= range[0] && e.created.slice(0, 10) <= range[1] && (!ui.channel || e.channel === ui.channel)).slice(-200).reverse();
  const name = id => (c.s.contacts || []).find(x => x.id === id)?.name || '—';
  const campaign = id => (c.s.adCampaigns || []).find(x => x.id === id)?.name || id || '—';
  return `${rangeControls(c)}
    <div class="sp-seg ad-seg" role="tablist" aria-label="Métrica">${kinds.map(([id, label]) => `<button type="button" role="tab" aria-selected="${ui.kind === id}" class="${ui.kind === id ? 'on' : ''}" data-ad-set="kind" data-value="${id}">${label}</button>`).join('')}</div>
    <div class="ad-kpis">${kpi('Leads', count(report.total.leads))}${kpi('Oportunidades', count(report.total.opportunities), money(c, report.total.pipeline))}${kpi('Negócios ganhos', count(report.total.won), money(c, report.total.wonValue))}${kpi('Receita', money(c, report.total.revenue), `${count(report.total.sales)} fatura(s) paga(s)`)}</div>
    <section class="surface ad-section"><h2>Por canal</h2>${share ? `<ul class="ad-share">${share}</ul>` : '<p class="dim">Nada no período.</p>'}</section>
    <div class="surface table-shell"><table><thead><tr><th>Canal</th><th>Origem</th><th>Campanha</th>${heads.map(x => `<th>${x}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr><td><span class="ad-dot" style="background:${channels.find(x => x[0] === r.channel)?.[2]}"></span> ${h(r.label)}</td><td>${h(r.source || '—')}</td><td>${h(r.campaign || '—')}</td>${cells(r).map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>${rows.length ? '' : '<p class="dim ad-pad">Nada no período.</p>'}</div>
    <section class="surface ad-section"><div class="ad-section-head"><h2>Eventos de sessão</h2><div class="inline-gap"><label class="ad-field">Canal<select data-ad-set="channel"><option value="">Todos</option>${channels.map(([id, label]) => `<option value="${id}" ${ui.channel === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <button type="button" class="secondary" data-ad-act="export" ${events.length ? '' : 'disabled'}>${icon('download', 15)} Exportar CSV</button></div></div>
      ${events.length ? `<div class="table-shell"><table><thead><tr><th>Evento</th><th>Canal</th><th>Contato</th><th>Campanha</th><th>UTM source</th><th>UTM medium</th><th>UTM content</th><th>UTM term</th><th>Referência</th><th>Página</th><th>Data</th></tr></thead>
        <tbody>${events.map(e => `<tr><td>${h(eventTypes[e.type] || e.type)}</td><td>${h(channelName(e.channel))}</td><td>${h(name(e.contactId))}</td><td>${h(campaign(e.campaign))}</td><td>${h(e.source || '—')}</td><td>${h(e.medium || '—')}</td><td>${h(e.content || '—')}</td><td>${h(e.term || '—')}</td><td>${h(e.referrer || '—')}</td><td>${h(e.landing || '—')}</td><td>${when(c, e.created)}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="dim">Nenhum evento no período. Eles aparecem quando visitantes enviam formulários, agendam, compram ou se inscrevem em webinars pelas suas páginas.</p>'}</section>`;
}

export function adsReportScreen(c, { sections }) {
  const view = reportingAdsTabs.includes(c.tab) ? c.tab : 'attribution';
  const titles = { attribution: ['Atribuição', 'De onde vêm seus leads, oportunidades e vendas: anúncios, busca, redes sociais, e-mail e mais.'], 'google-ads': ['Relatório do Google Ads', 'Custo das campanhas e o retorno em leads e vendas do CRM.'], 'meta-ads': ['Relatório do Meta Ads', 'Custo das campanhas do Facebook e Instagram e o retorno em leads e vendas do CRM.'] }[view];
  return pageShell({ title: titles[0], desc: titles[1], className: 'ad-page', tabs: { key: 'reporting', items: sections, current: view, label: 'Seções de relatórios' },
    content: view === 'attribution' ? attribution(c) : networkReport(c, view === 'google-ads' ? 'google' : 'meta') });
}

// ---- Events --------------------------------------------------------------------------------------
export function installAds({ c, api, url, mutate, flash, dialog, close, render }) {
  const here = () => (c.view === 'marketing' && c.tab === 'ads') || (c.view === 'reporting' && reportingAdsTabs.includes(c.tab));
  const take = result => { if (result.state) { c.s = result.state; c.m = result.metrics; } if (result.ads) status = { ...result.ads, workspace: c.workspace }; };
  const loadStatus = async () => {
    if (status?.workspace === c.workspace || loading === 'status') return;
    loading = 'status';
    try { status = { ...await api(url('/api/ads/workspace/status')), workspace: c.workspace }; } catch (error) { status = { configured: {}, meta: {}, google: {}, workspace: c.workspace, error: error.message }; }
    finally { loading = ''; }
    if (c.view === 'marketing' && c.tab === 'ads') render();
  };
  const post = (op, body) => api(url(`/api/ads/workspace/${op}`), body);
  requestStatus = loadStatus; // the screen asks for the connection state when it is drawn
  window.addEventListener('message', async ev => {
    if (ev.origin !== location.origin || ev.data?.type !== 'graao-ads') return;
    if (ev.data.error) { flash(ev.data.error, true); return; }
    status = null; await loadStatus();
    try { take(await api(url('/api/state'))); } catch { /* the next render loads it */ }
    render(); flash(`${networkLabel(ev.data.network)} conectado.`);
  });
  document.addEventListener('change', async event => {
    const el = event.target;
    if (!here()) return;
    try {
      if (el.matches('[data-ad-set]')) {
        const key = el.dataset.adSet; ui[key] = el.value;
        if (key === 'model') await mutate({ type: 'ad-settings', data: { model: el.value } });
        render(); return;
      }
      if (el.matches('[data-ad-fee]')) { await mutate({ type: 'ad-settings', data: { fees: { [el.dataset.adFee]: Number(el.value) || 0 } } }); render(); return; }
      if (el.matches('[data-ad-select]')) {
        const body = { network: el.dataset.network, [el.dataset.adSelect === 'account' ? 'accountId' : 'pageId']: el.value };
        if (el.dataset.adSelect === 'account' && !el.value) return;
        loading = el.dataset.network; render();
        const result = await post('select', body); loading = ''; take(result); render();
        flash(result.syncError ? `Conta escolhida, mas a sincronização falhou: ${result.syncError}` : 'Conta escolhida.', Boolean(result.syncError));
      }
    } catch (error) { loading = ''; render(); flash(error.message, true); }
  });
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-ad-act],[data-ad-set][data-value]');
    if (!el || !here()) return;
    if (el.dataset.adSet) { ui[el.dataset.adSet] = el.dataset.value; render(); return; }
    const { adAct: act, network, id } = el.dataset;
    try {
      if (act === 'connect') window.open(`${url('/api/ads/workspace/connect')}&network=${network}`, 'graao-ads', 'width=600,height=760');
      if (act === 'sync') { loading = network; render(); const result = await post('sync', { network, full: event.shiftKey }); loading = ''; take(result); render(); flash(`${result.synced?.campaigns ?? 0} campanha(s) sincronizada(s).`); }
      if (act === 'disconnect') {
        if (!await ask(`${tr('Desconectar')} ${networkLabel(network)}?`, { text: 'As campanhas somem da lista; os números já sincronizados continuam nos relatórios.', ok: 'Desconectar' })) return;
        take(await post('disconnect', { network })); render(); flash('Desconectado.');
      }
      if (act === 'status') {
        const on = el.dataset.on === '1';
        if (on && !await ask('Ativar esta campanha?', { text: 'Ela volta a gastar o orçamento na rede.', ok: 'Ativar', danger: false })) return;
        el.disabled = true; take(await post('campaign', { network, id, action: on ? 'activate' : 'pause' })); render(); flash(on ? 'Campanha ativada.' : 'Campanha pausada.');
      }
      if (act === 'budget') {
        const camp = (c.s.adCampaigns || []).find(x => x.network === network && x.id === id); if (!camp) return;
        dialog('Orçamento diário', `<form class="ad-form" data-ad-form="budget" data-network="${network}" data-id="${h(id)}"><p><b>${h(camp.name)}</b></p>
          <label>Novo orçamento diário${camp.currency ? ` (${h(camp.currency)})` : ''}<input type="number" name="budget" min="1" step="0.01" value="${camp.budget || ''}" required></label>
          ${network === 'meta' && camp.budgetType !== 'daily' ? '<p class="dim">Esta campanha tem o orçamento nos conjuntos de anúncios; a Meta pode recusar a mudança no nível da campanha.</p>' : ''}
          <p class="form-status" role="alert"></p><footer class="inline-gap"><button class="primary">Salvar</button><button type="button" class="secondary" data-act="close">Cancelar</button></footer></form>`);
      }
      if (act === 'create') dialog('Criar anúncio no Meta Ads', createForm(c));
      if (act === 'export') {
        const range = rangeOf(c);
        const events = (c.s.attributionEvents || []).filter(e => e.created.slice(0, 10) >= range[0] && e.created.slice(0, 10) <= range[1] && (!ui.channel || e.channel === ui.channel));
        const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([eventsCsv(c.s, events)], { type: 'text/csv;charset=utf-8' })), download: `eventos-atribuicao-${range[0]}-a-${range[1]}.csv` });
        link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }
    } catch (error) { loading = ''; render(); flash(error.message, true); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-ad-form]');
    if (!form) return;
    event.preventDefault();
    const note = form.querySelector('.form-status'), button = form.querySelector('button.primary'), f = form.elements;
    button.disabled = true; if (note) note.textContent = '';
    try {
      if (form.dataset.adForm === 'budget') {
        take(await post('campaign', { network: form.dataset.network, id: form.dataset.id, action: 'budget', budget: Number(f.budget.value) }));
        close(); render(); flash('Orçamento atualizado.');
      }
      if (form.dataset.adForm === 'create') {
        if (note) note.textContent = 'Criando campanha, público, imagem e anúncio na Meta…';
        const data = Object.fromEntries(new FormData(form));
        const iso = v => v ? new Date(v).toISOString() : '';
        take(await post('create', { network: 'meta', ...data, start: iso(data.start), end: iso(data.end), dailyBudget: Number(data.dailyBudget), ageMin: Number(data.ageMin), ageMax: Number(data.ageMax) }));
        close(); render(); flash('Anúncio criado e pausado. Ative na lista de campanhas quando quiser.');
      }
    } catch (error) { if (note) note.textContent = error.message; else flash(error.message, true); button.disabled = false; }
  });
}
