// Shared reports: the read-only page behind a report's public link (rendered on the server, so the
// browser receives only the report, never the workspace state) and the scheduled e-mail with that link.
import { reportWidget } from './ui/dashboard.js';
import { dashboardThemes } from './ui/dashboard-data.js';
import { reportPeriod, reportRange } from './ui/report-data.js';
import { h } from './ui/screens.js';
import { getLanguage, setLanguage, tr } from './ui/i18n.js';
import { shareActive } from './report-model.mjs';

export const sharedReportPath = (workspace, report) => `/relatorio/${workspace}/${report.share.id}`;
export const findSharedReport = (state, shareId) => state.customReports?.find(report => report.share?.id === shareId && shareActive(report)) || null;

const copy = {
  pt: { updated: 'Dados atualizados em', made: 'Relatório compartilhado pelo Graao', lang: 'Idioma', page: 'Página' },
  es: { updated: 'Datos actualizados el', made: 'Informe compartido por Graao', lang: 'Idioma', page: 'Página' }
};

// The app translates widget text by walking the DOM; there is no DOM here, so the text between tags
// is looked up in the catalog instead. Numbers, dates and unknown strings stay as they are.
const translateText = html => html.replace(/>([^<>]+)</g, (whole, text) => {
  const value = text.trim();
  if (!value || /^[\d\s.,:%–\-/$R€]+$/.test(value)) return whole;
  const out = tr(value);
  return out === value ? whole : `>${text.replace(value, h(out))}<`;
});

/** Complete HTML of a shared report, translated to `lang` ('pt' or 'es'). */
export function sharedReportPage(state, report, { lang = 'pt', path = '' } = {}) {
  const previous = getLanguage(), words = copy[lang] || copy.pt;
  setLanguage(lang === 'es' ? 'es' : 'pt');
  try {
    const range = reportRange(state, report), zone = state.profile?.timezone || 'America/Sao_Paulo';
    const accent = (dashboardThemes[report.theme] || dashboardThemes.default)[1];
    const brand = state.profile?.name || '';
    const stamp = new Intl.DateTimeFormat(lang === 'es' ? 'es-419' : 'pt-BR', { dateStyle: 'long', timeStyle: 'short', timeZone: zone }).format(new Date());
    const pages = report.pages.map((page, n) => `<section class="report-paper" aria-label="${h(page.name)}">
      <header class="report-paper-header"><div><span>${h(report.name)}</span><h2>${h(page.name)}</h2></div><span>${h(reportPeriod(report, range))}</span></header>
      <div class="report-widget-grid">${page.widgets.map(widget => `<section class="report-widget dash-card dash-w${widget.width}">
        ${widget.kind === 'heading' ? '' : `<header><h3>${h(tr(widget.title))}</h3></header>`}
        <div class="dash-card-body">${reportWidget(state, widget, range, report.period)}</div></section>`).join('')}</div>
      <footer class="report-paper-footer">${words.page} ${n + 1}</footer></section>`).join('');
    const cover = report.cover ? `<section class="report-paper report-cover"><h2>${h(report.name)}</h2><p>${h(reportPeriod(report, range))}</p>
      ${report.summary ? `<div class="report-summary">${h(report.summary)}</div>` : ''}</section>` : report.summary ? `<div class="surface report-summary report-summary-inline">${h(report.summary)}</div>` : '';
    return `<!doctype html><html lang="${lang === 'es' ? 'es-419' : 'pt-BR'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${h(report.name)}${brand ? ` · ${h(brand)}` : ''}</title>
<link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/graao.css"><link rel="stylesheet" href="/dashboard.css"><link rel="stylesheet" href="/reports.css"></head>
<body><main class="report-shared report-editor" style="--report-accent:${h(accent)};--dash-accent:${h(accent)}">
<header class="report-shared-head"><div><p class="dim">${h(brand || words.made)}</p><h1>${h(report.name)}</h1><p class="dim">${words.updated} ${h(stamp)}</p></div>
<nav aria-label="${words.lang}" class="report-shared-lang"><a href="${h(path)}?lang=pt" ${lang === 'pt' ? 'aria-current="true"' : ''}>PT</a><a href="${h(path)}?lang=es" ${lang === 'es' ? 'aria-current="true"' : ''}>ES</a></nav></header>
<div class="report-layout report-preview"><div class="report-document">${lang === 'es' ? translateText(cover + pages) : cover + pages}</div></div>
<p class="dim report-shared-foot">${words.made}</p></main></body></html>`;
  } finally { setLanguage(previous); }
}

/** E-mail delivery through Resend, the same provider and sender the client portal uses. */
export function reportMailer({ key = process.env.RESEND_API_KEY, from = process.env.PORTAL_EMAIL_FROM, publicOrigin = process.env.PORTAL_PUBLIC_ORIGIN, request = fetch } = {}) {
  let origin = '';
  try { const url = new URL(publicOrigin); if (url.protocol === 'https:') origin = url.origin; } catch { /* reported as not configured */ }
  const configured = Boolean(key && from && origin);
  return {
    configured,
    /** `fromAddress`: the sub-account's verified sending domain (Serviços de e-mail), shown with the workspace name. */
    async send(workspace, state, report, slot, { fromAddress = '' } = {}) {
      if (!configured) throw new Error('O envio por e-mail não está configurado (RESEND_API_KEY, PORTAL_EMAIL_FROM e PORTAL_PUBLIC_ORIGIN).');
      const link = origin + sharedReportPath(workspace, report), brand = state.profile?.name || 'Graao';
      const subject = `${report.name} · ${brand}`;
      const text = `${report.schedule.message ? `${report.schedule.message}\n\n` : ''}O relatório “${report.name}” de ${brand} está disponível com os dados mais recentes:\n\n${link}\n\nVocê recebe este e-mail porque ${brand} programou o envio deste relatório.`;
      const post = (sender, idem) => request('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idem },
        body: JSON.stringify({ from: sender, to: report.schedule.recipients, subject, text })
      }).catch(() => null);
      const idem = `report-${workspace}-${report.id}-${slot}`;
      let response = await post(fromAddress ? `${brand.replace(/[<>"\r\n]/g, '').trim() || 'Graao'} <${fromAddress}>` : from, idem);
      if (fromAddress && response?.status === 403) response = await post(from, `${idem}-platform`);
      if (!response?.ok) throw new Error(`O serviço de e-mail não confirmou o envio${response ? ` (HTTP ${response.status})` : ''}.`);
    }
  };
}
