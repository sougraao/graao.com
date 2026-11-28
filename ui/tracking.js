// Configurações → Rastreamento externo (script for the business's own site, pixels GA4 / Tag Manager /
// Meta on the Graao public pages, events received) and Configurações → Pontuação de leads (rules that add
// or remove points when a contact does something, using the workflow triggers and their filters).
import { icon as i } from './icons.js';
import { badge, fmt, h, pageShell } from './screens.js';
import { refSources, triggerSpec, triggerSummary } from './workflow-data.js';
import { scoreBand, scoreEvents, scoreStarters } from './scoring-data.js';
import { ask } from './ask.js';

const views = [['install', 'Instalação'], ['settings', 'Configurações'], ['forms', 'Formulários'], ['events', 'Diagnóstico']];
let view = 'install', eventFilter = '';
// The events come from their own endpoint, a page at a time; the sub-account state no longer carries them.
const FRESH = 15000;
let feed = { key: '', at: 0, events: [], next: '', summary: null, error: '', busy: false }, fetchEvents = null;
const feedKey = c => `${c.workspace}|${eventFilter}`;
/** Loads the first page when the screen opens, changes sub-account or filter, or gets old; `more` adds the next page. */
async function loadFeed(c, redraw, more = false) {
  const key = feedKey(c);
  if (!fetchEvents || (feed.busy && feed.key === key)) return;
  if (!more && feed.key === key && Date.now() - feed.at < FRESH) return;
  if (feed.key !== key) feed = { key, at: 0, events: [], next: '', summary: feed.key.split('|')[0] === c.workspace ? feed.summary : null, error: '', busy: false };
  const mine = feed;
  mine.busy = true;
  try {
    const page = await fetchEvents(c.workspace, eventFilter, more ? mine.next : '');
    mine.events = more ? [...mine.events, ...page.events] : page.events;
    mine.next = page.next; mine.error = '';
    if (page.summary) mine.summary = page.summary;
  } catch (error) { mine.error = error.message; }
  mine.busy = false; mine.at = Date.now();
  if (mine === feed) redraw();
}

const when = (c, d) => d ? fmt(d, c.s.profile?.timezone, true) : '—';
const contactName = (c, id) => c.s.contacts.find(row => row.id === id)?.name || '';
const empty = (title, text, ico) => `<div class="empty">${i(ico, 26)}<strong>${title}</strong><p>${text}</p></div>`;
const table = (cols, rows, nothing) => `<div class="surface table-shell"><table><thead><tr>${cols.map(col => `<th scope="col">${col}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>${rows.length ? '' : nothing}</div>`;
const metric = (title, value, note = '') => `<div class="surface metric"><span>${title}</span><b>${value}</b>${note ? `<small class="dim">${note}</small>` : ''}</div>`;
const code = (text, label, file = '') => `<div class="tk-code" data-bui-code-wrap><pre data-bui-code="${h(file || (label && !/copiar/i.test(label) ? label : 'codigo-do-site.html'))}"><code>${h(text)}</code></pre><button type="button" class="secondary" data-tk-act="copy" data-value="${h(text)}">${i('copy', 15)} ${label || 'Copiar código'}</button></div>`;

const scriptUrl = c => `${location.origin}/t/${c.workspace}.js`;
const scriptTag = c => `<script src="${scriptUrl(c)}" async></script>`;
const pagePath = url => { try { const u = new URL(url); return `${u.hostname.replace(/^www\./, '')}${u.pathname}`; } catch { return url || '—'; } };

// ---- Rastreamento externo -----------------------------------------------------------------------
const summary = () => feed.summary || { last: null, views: 0, forms: 0, known: 0, visitors: 0, byForm: [] };

function statusCard(c) {
  if (feed.error) return `<section class="surface padded tk-status">${i('alert', 20)}<div><b>Não foi possível carregar os eventos</b><p class="dim">${h(feed.error)}</p></div>
    <button type="button" class="secondary" data-tk-act="reload">Tentar de novo</button></section>`;
  if (!feed.summary) return `<section class="surface padded tk-status">${i('site', 20)}<div><b>Carregando…</b></div></section>`;
  const sum = summary();
  const live = sum.last && Date.now() - Date.parse(sum.last.created) < 7 * 86400000;
  return `<section class="surface padded tk-status">${i(live ? 'check' : 'site', 20)}<div>
    <b>${sum.last ? (live ? 'Script recebendo eventos' : 'Nenhum evento nos últimos 7 dias') : 'Aguardando o primeiro evento'}</b>
    <p class="dim">${sum.last ? `Último evento em ${h(when(c, sum.last.created))} · ${h(pagePath(sum.last.url))}` : 'Instale o código no seu site e abra uma página para testar.'}</p></div>
    ${badge(live ? 'Ativo' : 'Inativo', live ? 'green' : '')}</section>`;
}

function installView(c) {
  return `${statusCard(c)}
    <section class="surface padded tk-section"><h2>1. Copie o código de rastreamento</h2>
      <p class="dim">Cole antes de <code>&lt;/head&gt;</code> em todas as páginas do seu site (WordPress, Wix, Webflow, Shopify ou HTML próprio). Em gerenciadores de tag, crie uma tag HTML personalizada com o mesmo código.</p>
      ${code(scriptTag(c))}</section>
    <section class="surface padded tk-section"><h2>2. O que ele registra</h2>
      <ul class="tk-list">
        <li><b>Visitas de página</b> com a origem da visita (UTM, gclid, fbclid e site de origem; primeiro e último toque).</li>
        <li><b>Formulários HTML enviados</b>: com e-mail ou telefone, o contato é criado ou atualizado, as respostas viram uma nota e as visitas seguintes contam para ele.</li>
        <li><b>Vídeos assistidos</b>: vídeos HTML5 do seu site chegando a 25, 50, 75 e 100% (para contatos conhecidos, no gatilho Vídeo assistido).</li>
        <li><b>Eventos seus</b>: chame <code>graao.track('nome-do-evento')</code> para registrar um clique ou uma conversão.</li>
      </ul>
      <p class="dim">Senhas, cartões, CPF e campos ocultos nunca são enviados. Para ignorar um formulário, acrescente <code>data-graao-ignore</code> à tag <code>&lt;form&gt;</code>.</p></section>
    <section class="surface padded tk-section"><h2>3. Use nas automações e na pontuação</h2>
      <p class="dim">O gatilho <b>Evento do rastreamento externo</b> dispara quando um contato conhecido visita uma página ou envia um formulário. As regras de pontuação usam o mesmo evento.</p>
      <div class="inline-gap"><a class="secondary" href="#automation/workflows">${i('flow', 15)} Abrir automações</a><a class="secondary" href="#settings/scoring">${i('star', 15)} Pontuação de leads</a></div></section>`;
}

function settingsView(c) {
  const t = { ga4: '', gtm: '', metaPixel: '', domains: [], pageviews: true, forms: true, ...(c.s.tracking || {}) };
  return `<form class="surface settings-form set-form" data-tk-form="settings">
      <section class="set-section"><header class="set-head"><h2>Pixels nas páginas do Graao</h2><p class="dim">Carregados em sites, funis, lojas, ofertas, blog e webinars desta subconta. Formulários enviados geram o evento <i>generate_lead</i> no GA4 e <i>Lead</i> no Pixel da Meta.</p></header><div class="set-body">
      <div class="field-grid">
        <label>ID de medição do Google Analytics 4<input name="ga4" value="${h(t.ga4)}" placeholder="G-XXXXXXXXXX" maxlength="24" spellcheck="false" autocomplete="off"></label>
        <label>ID do contêiner do Google Tag Manager<input name="gtm" value="${h(t.gtm)}" placeholder="GTM-XXXXXXX" maxlength="16" spellcheck="false" autocomplete="off"></label>
        <label>ID do Pixel da Meta<input name="metaPixel" value="${h(t.metaPixel)}" placeholder="123456789012345" inputmode="numeric" maxlength="20" spellcheck="false" autocomplete="off"></label>
        <label>Segredo da API do GA4 (Measurement Protocol)<input name="ga4Secret" type="password" value="" placeholder="${t.ga4SecretSet ? 'Configurado. Deixe vazio para manter' : 'Opcional, para os fluxos enviarem eventos'}" maxlength="64" spellcheck="false" autocomplete="new-password"></label>
      </div>
      <p class="dim"><small>O segredo fica guardado com criptografia no servidor e não aparece de novo aqui. Ele é criado no GA4 em Administrador → Fluxos de dados → Chaves secretas da API do Measurement Protocol.${t.ga4SecretSet ? ' <button type="button" class="text-link" data-tk-ga4-clear>Remover segredo</button>' : ''}</small></p>
      <p class="dim"><small>Por segurança, o contêiner do Tag Manager não carrega nas páginas públicas do graao (funil, formulário, agenda, loja, oferta e link de pagamento); o GA4 e o Pixel da Meta funcionam nelas. No seu próprio site o Tag Manager funciona normalmente.</small></p></div></section>
      <section class="set-section"><header class="set-head"><h2>Script do seu site</h2><p class="dim">O que o código instalado no site registra.</p></header><div class="set-body">
      <label class="switch-row"><span><b>Registrar visitas de página</b><br><small class="dim">Cada página aberta com o script conta como visita.</small></span><input type="checkbox" name="pageviews"${t.pageviews !== false ? ' checked' : ''}></label>
      <label class="switch-row"><span><b>Capturar formulários HTML</b><br><small class="dim">Formulários com e-mail ou telefone criam ou atualizam o contato.</small></span><input type="checkbox" name="forms"${t.forms !== false ? ' checked' : ''}></label>
      <label class="switch-row"><span><b>Acompanhar vídeos</b><br><small class="dim">Vídeos HTML5 (tag video) assistidos até 25, 50, 75 e 100% por contatos conhecidos disparam o gatilho Vídeo assistido. Vídeos do YouTube e de outros players em iframe não são lidos.</small></span><input type="checkbox" name="videos"${t.videos !== false ? ' checked' : ''}></label>
      <label>Domínios permitidos<textarea name="domains" rows="3" placeholder="suaempresa.com.br&#10;*.suaempresa.com.br" spellcheck="false">${h((t.domains || []).join('\n'))}</textarea></label>
      <p class="dim"><small>Um por linha. Vazio aceita eventos de qualquer site; use <code>*.dominio.com</code> para incluir os subdomínios.</small></p></div></section>
      <footer class="set-foot"><p class="form-status" role="status"></p><button class="primary">Salvar configurações</button></footer>
    </form>`;
}

function formsView(c) {
  const sample = `<form name="contato">\n  <input name="nome" placeholder="Seu nome">\n  <input name="email" type="email" placeholder="Seu e-mail">\n  <input name="telefone" placeholder="WhatsApp">\n  <button>Enviar</button>\n</form>`;
  const rows = summary().byForm;
  return `<section class="surface padded tk-section"><h2>Formulários HTML</h2>
      <p class="dim">Com o script instalado, qualquer formulário do seu site vira contato, sem configurar nada. Reconhecemos os campos pelo nome: <code>email</code>/<code>e-mail</code>, <code>telefone</code>/<code>phone</code>/<code>whatsapp</code>, <code>nome</code>/<code>name</code>, <code>sobrenome</code> e <code>empresa</code>. Os demais campos entram na nota do contato.</p>
      ${code(sample, 'Copiar exemplo')}</section>
    <section class="surface padded tk-section"><h2>Formulários de lead do Google Ads</h2>
      <p class="dim">No Google Ads, abra o formulário de lead do anúncio, vá em <b>Integração de dados de leads → Webhook</b> e cole a URL e a chave abaixo. Cada lead vira contato (com o clique na atribuição) e dispara o gatilho <b>Formulário de lead do Google Ads</b>. Use <b>Enviar dados de teste</b> no Google para conferir.</p>
      ${code(`${location.origin}/api/google-leads/${c.workspace}`, 'Copiar URL', 'URL do webhook')}
      ${c.s.tracking?.googleLeadKey ? code(c.s.tracking.googleLeadKey, 'Copiar chave', 'Chave') : '<p class="dim">Ainda não há chave.</p>'}
      <div class="inline-gap"><button type="button" class="secondary" data-tk-act="google-lead-key">${i('key', 15)} ${c.s.tracking?.googleLeadKey ? 'Gerar chave nova' : 'Gerar chave'}</button></div></section>
    <section class="surface padded tk-section"><h2>Formulários de cadastro do Facebook e Instagram</h2>
      <p class="dim">Os leads dos formulários de cadastro (Lead Ads) das páginas conectadas no <a href="#marketing/social">Social Planner</a> chegam sozinhos, pela permissão de leads da Meta. Cada lead vira contato e dispara o gatilho <b>Formulário de cadastro do Facebook</b>. Se a página foi conectada antes, conecte de novo para dar a permissão de leads.</p></section>
    <section class="surface padded tk-section"><h2>Formulários em iframe</h2>
      <p class="dim">Formulários do Graao incorporados no seu site já criam o contato direto. Formulários de outras ferramentas em iframe não podem ser lidos pelo script (o navegador isola o iframe): use a integração da ferramenta ou um webhook de entrada nas automações.</p></section>
    <h2 class="section-heading">Formulários recebidos</h2>
    ${table(['Formulário', 'Página', 'Envios', 'Contatos', 'Último envio'], rows.map(r => `<tr><td><b>${h(r.name)}</b></td><td><small>${h(pagePath(r.url))}</small></td><td>${r.total}</td><td>${r.contacts}</td><td>${h(when(c, r.last))}</td></tr>`),
      feed.error ? empty('Não foi possível carregar os eventos', h(feed.error), 'alert') : !feed.summary ? empty('Carregando…', '', 'list') : empty('Nenhum formulário recebido', 'Os formulários do seu site aparecem aqui depois do primeiro envio.', 'list'))}`;
}

function eventsView(c) {
  const sum = summary();
  const label = e => e.type === 'form' ? badge('Formulário', 'pink') : e.event ? badge(e.event, 'gold') : badge('Visita', 'blue');
  return `${statusCard(c)}
    <div class="metrics">${metric('Visitas (7 dias)', sum.views)}${metric('Visitantes únicos', sum.visitors)}${metric('Formulários enviados', sum.forms)}${metric('Contatos identificados', sum.known)}</div>
    <div class="toolbar"><label class="tag-filter">${i('filter', 15)}<select data-tk-filter aria-label="Tipo de evento"><option value="">Todos os eventos</option><option value="pageview"${eventFilter === 'pageview' ? ' selected' : ''}>Visitas</option><option value="form"${eventFilter === 'form' ? ' selected' : ''}>Formulários</option></select></label></div>
    ${table(['Quando', 'Evento', 'Página', 'Contato', 'Visitante'], feed.events.map(e => `<tr><td>${h(when(c, e.created))}</td><td>${label(e)}${e.form ? ` <small class="dim">${h(e.form)}</small>` : ''}</td><td><small title="${h(e.url)}">${h(pagePath(e.url))}</small>${e.title ? `<br><small class="dim">${h(e.title)}</small>` : ''}</td><td>${e.contactId && contactName(c, e.contactId) ? `<button class="text-link" data-edit="contacts" data-id="${e.contactId}">${h(contactName(c, e.contactId))}</button>` : `<small class="dim">${e.contactId ? 'Contato' : 'Anônimo'}</small>`}</td><td><code>${h(e.vid.slice(0, 8))}</code></td></tr>`),
      feed.error ? '' : !feed.at ? empty('Carregando…', '', 'site') : empty('Nenhum evento ainda', 'Abra uma página do seu site com o script instalado. O evento aparece aqui em segundos.', 'site'))}
    ${feed.next ? `<div class="inline-gap"><button type="button" class="secondary" data-tk-act="more">Carregar mais eventos</button></div>` : ''}
    <section class="surface padded tk-section"><h2>Não aparece nada?</h2><ul class="tk-list">
      <li>Confira se o código está no HTML publicado (Ctrl+U na página) e se o endereço é <code>${h(scriptUrl(c))}</code>.</li>
      <li>Se você preencheu domínios permitidos, o domínio do site precisa estar na lista.</li>
      <li>Bloqueadores de anúncio no seu navegador podem barrar o script; teste numa janela anônima.</li>
      <li>O mesmo endereço aceita até 300 eventos a cada 10 minutos.</li></ul></section>`;
}

let redrawTracking = () => {};
export function trackingScreen(c, tabs) {
  if (view !== 'settings') void loadFeed(c, redrawTracking);
  const body = { install: installView, settings: settingsView, forms: formsView, events: eventsView }[view] || installView;
  return pageShell({ title: 'Configurações', desc: 'Gerencie o workspace ativo.', tabs, className: 'tk-page',
    content: `<nav class="tk-views" aria-label="Rastreamento externo">${views.map(([key, label]) => `<button type="button" class="${key === view ? 'active' : ''}" aria-pressed="${key === view}" data-tk-view="${key}">${label}</button>`).join('')}</nav>${body(c)}` });
}

// ---- Pontuação de leads -------------------------------------------------------------------------
const scoreBadge = score => { const band = scoreBand(score); return `<b class="sc-score ${score < 0 ? 'neg' : ''}">${score || 0}</b>${band ? ` ${badge(band[1], band[2])}` : ''}`; };
const pointsBadge = points => badge(`${points > 0 ? '+' : ''}${points} pts`, points > 0 ? 'green' : 'red');
const ruleAction = (c, rule) => { const spec = triggerSpec(rule.trigger?.type), detail = triggerSummary(rule.trigger || {}, c.s); return `${h(spec?.label || rule.trigger?.type)}${detail ? `<br><small class="dim">${h(detail)}</small>` : ''}`; };

export function scoringScreen(c, tabs) {
  const rules = c.s.scoringRules || [], q = (c.query || '').toLowerCase();
  const shown = rules.filter(r => !q || `${r.name} ${triggerSpec(r.trigger?.type)?.label || ''}`.toLowerCase().includes(q));
  const scored = c.s.contacts.filter(x => Number(x.score)), top = [...scored].sort((a, b) => b.score - a.score).slice(0, 10);
  const avg = scored.length ? Math.round(scored.reduce((n, x) => n + Number(x.score), 0) / scored.length) : 0;
  const starters = rules.length ? '' : `<section class="surface set-card"><div class="set-section"><header class="set-head"><h2>Comece com regras prontas</h2><p class="dim">Pontos sugeridos para os sinais de interesse mais comuns. Ajuste depois.</p></header><div class="set-body"><div class="sc-starters">${scoreStarters.map((r, n) => `<label class="sc-starter"><input type="checkbox" data-sc-starter="${n}" checked><span><b>${h(r.name)}</b> ${pointsBadge(r.points)}${r.once ? ' <small class="dim">uma vez</small>' : ''}</span></label>`).join('')}</div>
    </div></div><footer class="set-foot"><button type="button" class="primary" data-tk-act="starters">${i('plus', 15)} Criar regras selecionadas</button></footer></section>`;
  return pageShell({ title: 'Configurações', desc: 'Gerencie o workspace ativo.', tabs, className: 'tk-page',
    cta: `<button class="primary" data-tk-act="rule-new">${i('plus', 16)} Nova regra</button>`,
    content: `<p class="dim crm-intro">Cada ação do contato soma ou tira pontos. A pontuação aparece na lista de contatos, pode filtrar automações (gatilho <b>Pontuação do lead mudou</b>, com mínimo) e ser ajustada por elas (ação <b>Ajustar pontuação do lead</b>).</p>
      <div class="metrics">${metric('Regras ativas', rules.filter(r => r.active !== false).length, `${rules.length} no total`)}${metric('Contatos pontuados', scored.length)}${metric('Pontuação média', avg)}${metric('Leads quentes', c.s.contacts.filter(x => Number(x.score) >= 100).length, '100 pontos ou mais')}</div>
      ${starters}
      <div class="toolbar"><label class="search">${i('search', 16)}<input id="page-search" value="${h(c.query)}" placeholder="Buscar regras…" aria-label="Buscar regras" autocomplete="off"></label></div>
      ${table(['Regra', 'Ação do contato', 'Cálculo', 'Ativa', ''], shown.map(r => `<tr><td><b>${h(r.name)}</b></td><td>${ruleAction(c, r)}</td><td>${pointsBadge(r.points)}${r.once ? '<br><small class="dim">Só a primeira vez</small>' : '<br><small class="dim">Toda vez</small>'}</td>
        <td><label class="sc-toggle"><input type="checkbox" data-sc-active="${r.id}"${r.active !== false ? ' checked' : ''} aria-label="Regra ativa"></label></td>
        <td class="right"><button class="icon-btn" title="Editar regra" aria-label="Editar regra" data-tk-act="rule-edit" data-id="${r.id}">${i('edit', 16)}</button><button class="icon-btn" title="Excluir regra" aria-label="Excluir regra" data-tk-act="rule-delete" data-id="${r.id}">${i('trash', 16)}</button></td></tr>`),
        empty(rules.length ? 'Nenhuma regra encontrada' : 'Nenhuma regra de pontuação', rules.length ? 'Tente outra busca.' : 'Crie uma regra para dar pontos quando o contato demonstrar interesse.', 'star'))}
      <h2 class="section-heading">Contatos com maior pontuação</h2>
      ${table(['Contato', 'Pontuação', 'Último motivo', 'Atualizada em'], top.map(x => `<tr><td><button class="text-link" data-edit="contacts" data-id="${x.id}">${h(x.name)}</button></td><td>${scoreBadge(x.score)}</td><td><small>${h(x.scoreHistory?.[0]?.reason || '—')}</small></td><td>${h(when(c, x.scoreUpdated))}</td></tr>`),
        empty('Nenhum contato pontuado', 'Os contatos aparecem aqui quando uma regra ou automação der pontos.', 'contacts'))}` });
}

function fieldHtml(c, field, value) {
  const label = `${h(field.label)}`;
  const opts = list => list.map(([key, text]) => `<option value="${h(key)}"${String(value ?? '') === String(key) ? ' selected' : ''}>${h(text)}</option>`).join('');
  if (field.kind === 'select') return `<label>${label}<select data-sc-cfg="${field.key}">${opts(field.options)}</select></label>`;
  if (field.kind === 'ref') return `<label>${label}<select data-sc-cfg="${field.key}">${opts([['', field.empty || 'Qualquer um'], ...(refSources[field.source]?.(c.s) || [])])}</select></label>`;
  return `<label>${label}<input data-sc-cfg="${field.key}" type="${field.kind === 'number' ? 'number' : 'text'}" value="${h(value ?? '')}" maxlength="200"${field.placeholder ? ` placeholder="${h(field.placeholder)}"` : ''}></label>`;
}
const configFields = (c, type, config = {}) => (triggerSpec(type)?.fields || []).filter(f => ['select', 'ref', 'text', 'number'].includes(f.kind)).map(f => fieldHtml(c, f, config[f.key])).join('');

function ruleForm(c, rule) {
  const r = rule || { name: '', trigger: { type: 'form_submitted', config: {} }, points: 10, once: false, active: true };
  const groups = new Map();
  for (const type of scoreEvents) { const spec = triggerSpec(type); if (!spec) continue; groups.set(spec.group, [...(groups.get(spec.group) || []), spec]); }
  return `<form class="settings-form sc-form" data-tk-form="rule" data-id="${h(rule?.id || '')}">
    <label>Nome da regra<input name="name" value="${h(r.name)}" maxlength="80" placeholder="Ex.: Pediu orçamento" required></label>
    <label>Quando o contato<select name="type" data-sc-type>${[...groups].map(([group, specs]) => `<optgroup label="${h(group)}">${specs.map(s => `<option value="${s.type}"${s.type === r.trigger.type ? ' selected' : ''}>${h(s.label)}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <div class="sc-config" data-sc-config>${configFields(c, r.trigger.type, r.trigger.config)}</div>
    <div class="field-grid"><label>Pontos (negativo tira pontos)<input name="points" type="number" min="-1000" max="1000" step="1" value="${h(r.points)}" required></label>
      <label>Contar<select name="once"><option value="">Toda vez que acontecer</option><option value="1"${r.once ? ' selected' : ''}>Só a primeira vez</option></select></label></div>
    <label class="switch-row"><span><b>Regra ativa</b></span><input type="checkbox" name="active"${r.active !== false ? ' checked' : ''}></label>
    <div class="rp-save"><span class="form-status" role="alert"></span><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Salvar regra</button></div>
  </form>`;
}

// ---- Contact: score and history inside the contact dialog --------------------------------------
export function contactScore(contact) {
  if (!contact?.id) return '';
  const history = contact.scoreHistory || [];
  return `<details class="sc-contact"><summary>${i('star', 15)} Pontuação do lead: ${scoreBadge(Number(contact.score) || 0)}</summary>
    ${history.length ? `<ul>${history.slice(0, 10).map(e => `<li>${pointsBadge(e.points)} <span>${h(e.reason || 'Ajuste')}</span> <small class="dim">${h(new Date(e.at).toLocaleString())} · total ${e.score}</small></li>`).join('')}</ul>` : '<p class="dim">Sem pontos ainda. Crie regras em Configurações → Pontuação de leads.</p>'}</details>`;
}
export const contactScoreCell = contact => Number(contact.score) ? scoreBadge(Number(contact.score)) : '<span class="dim">—</span>';

// ---- Events --------------------------------------------------------------------------------------
export function installTracking({ c, mutate, flash, dialog, close, render, api }) {
  // The GA4 API secret goes to its own write-only endpoint; the answer is the sub-account view, as after an action.
  const saveGa4Secret = async secret => { const view = await api(`/api/tracking/ga4-secret?workspace=${encodeURIComponent(c.workspace)}`, { secret }); if (view?.state) { c.s = view.state; if (view.metrics) c.m = view.metrics; } };
  fetchEvents = (workspace, type, before) => api(`/api/tracking/events?${new URLSearchParams({ workspace, type, before })}`);
  // Not over the settings form (it would drop what is being typed); the page stays where it was.
  redrawTracking = () => {
    if (c.view !== 'settings' || c.tab !== 'tracking' || view === 'settings') return;
    const top = document.querySelector('#screen')?.scrollTop || 0;
    render();
    const screen = document.querySelector('#screen');
    if (screen) screen.scrollTop = top;
  };
  document.addEventListener('click', async event => {
    if (!here() || !event.target.closest('[data-tk-ga4-clear]')) return;
    try { await saveGa4Secret(''); render(); flash('Segredo do GA4 removido.'); } catch (error) { flash(error.message); }
  });
  const here = () => c.view === 'settings' && ['tracking', 'scoring'].includes(c.tab);
  const ruleData = form => {
    const config = {};
    for (const el of form.querySelectorAll('[data-sc-cfg]')) if (el.value !== '') config[el.dataset.scCfg] = el.value;
    return { name: form.elements.name.value, trigger: { type: form.elements.type.value, config }, points: Number(form.elements.points.value), once: form.elements.once.value === '1', active: form.elements.active.checked };
  };

  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-tk-act],[data-tk-view]');
    if (!el || !here()) return;
    if (el.dataset.tkView) { view = el.dataset.tkView; render(); return; }
    const act = el.dataset.tkAct;
    try {
      if (act === 'copy') await navigator.clipboard.writeText(el.dataset.value).then(() => flash('Código copiado.'), () => flash('Selecione o código e copie manualmente.', true));
      if (act === 'reload') { feed.at = 0; el.disabled = true; await loadFeed(c, redrawTracking); }
      if (act === 'more') { el.disabled = true; await loadFeed(c, redrawTracking, true); }
      if (act === 'google-lead-key') {
        if (c.s.tracking?.googleLeadKey && !await ask('Gerar uma chave nova?', { text: 'Os formulários do Google Ads com a chave antiga param de mandar leads até você trocar a chave lá.', ok: 'Gerar chave nova' })) return;
        await mutate({ type: 'tracking-google-lead-key' }); render(); flash('Chave gerada. Copie a URL e a chave para o formulário de lead do Google Ads.');
      }
      if (act === 'rule-new') dialog('Nova regra de pontuação', ruleForm(c));
      if (act === 'rule-edit') dialog('Editar regra de pontuação', ruleForm(c, c.s.scoringRules.find(r => r.id === el.dataset.id)));
      if (act === 'rule-delete') {
        if (!await ask('Excluir esta regra?', { text: 'Os pontos já dados continuam nos contatos.', ok: 'Excluir' })) return;
        await mutate({ type: 'delete', key: 'scoringRules', id: el.dataset.id }); render(); flash('Regra excluída.');
      }
      if (act === 'starters') {
        const picked = [...document.querySelectorAll('[data-sc-starter]:checked')].map(box => scoreStarters[Number(box.dataset.scStarter)]);
        if (!picked.length) { flash('Selecione ao menos uma regra.', true); return; }
        el.disabled = true;
        for (const rule of picked) await mutate({ type: 'save', key: 'scoringRules', data: { ...rule, active: true } });
        render(); flash(`${picked.length} regra(s) criada(s).`);
      }
    } catch (error) { el.disabled = false; flash(error.message, true); }
  });

  document.addEventListener('change', async event => {
    const el = event.target;
    if (!here()) return;
    if (el.matches('[data-tk-filter]')) { eventFilter = el.value; render(); return; }
    if (el.matches('[data-sc-type]')) { const box = el.form.querySelector('[data-sc-config]'); box.innerHTML = configFields(c, el.value); return; }
    if (el.matches('[data-sc-active]')) {
      const rule = c.s.scoringRules.find(r => r.id === el.dataset.scActive);
      try { await mutate({ type: 'save', key: 'scoringRules', id: rule.id, data: { ...rule, active: el.checked } }); render(); flash(el.checked ? 'Regra ativada.' : 'Regra pausada.'); }
      catch (error) { el.checked = !el.checked; flash(error.message, true); }
    }
  });

  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!here() || !form.matches('[data-tk-form]')) return;
    event.preventDefault();
    const status = form.querySelector('.form-status'), button = form.querySelector('button.primary');
    button.disabled = true; status.textContent = '';
    try {
      if (form.dataset.tkForm === 'settings') {
        const f = form.elements;
        if (f.ga4Secret.value.trim()) await saveGa4Secret(f.ga4Secret.value.trim());
        await mutate({ type: 'tracking-settings', data: { ga4: f.ga4.value, gtm: f.gtm.value, metaPixel: f.metaPixel.value, domains: f.domains.value, pageviews: f.pageviews.checked, forms: f.forms.checked, videos: f.videos.checked } });
        render(); flash('Rastreamento salvo.');
      } else {
        const id = form.dataset.id || undefined;
        await mutate({ type: 'save', key: 'scoringRules', id, data: ruleData(form) });
        close(); render(); flash(id ? 'Regra atualizada.' : 'Regra criada.');
      }
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  });
}
