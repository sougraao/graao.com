// Reputação: overview, reviews (reply by hand or with AI), review requests with personal links, and the
// settings of the public review page, its QR code and the request messages.
import { icon } from './icons.js';
import { h, pageShell } from './screens.js';
import { qrSvg } from './qr.js';
import { aiTool } from './content-ai.js';
import { directories, hoursRows, listingStatuses } from './gbp-data.js';
import { seoContent, visibilityContent } from './seo.js';
import { ask } from './ask.js';

export const reputationTabs = ['overview', 'reviews', 'requests', 'google', 'listings', 'seo', 'visibility', 'widgets', 'videos', 'settings'];
const layouts = [['carousel', 'Carrossel'], ['grid', 'Grade'], ['list', 'Lista'], ['badge', 'Selo com a nota']];
const themes = [['auto', 'Automático (claro ou escuro, como o aparelho do visitante)'], ['light', 'Claro'], ['dark', 'Escuro']];
const videoStatus = { pending: ['Aguardando aprovação', ''], approved: ['Aprovado', 'green'], hidden: ['Oculto', 'pink'] };
const view = { widget: '' };
// Business Profile data comes from Google on demand, so it lives outside the workspace state.
const gbp = { workspace: '', loading: false, status: null, error: '', code: 0 };
let env = null;
async function loadGbp(c, refresh = false) {
  const workspace = c.workspace;
  Object.assign(gbp, { workspace, loading: true, error: '' });
  try {
    const status = await env.api(env.url('/api/gbp/status') + (refresh ? '&refresh=1' : ''));
    if (gbp.workspace === workspace) Object.assign(gbp, { status, code: 0 });
  } catch (error) {
    if (gbp.workspace === workspace) Object.assign(gbp, { status: null, error: error.message, code: error.status || 0 });
  } finally {
    if (gbp.workspace === workspace) { gbp.loading = false; if (c.view === 'reputation' && ['google', 'listings'].includes(c.tab)) env.render(); }
  }
}
const channels = [['WhatsApp', 'WhatsApp'], ['Email', 'E-mail'], ['SMS', 'SMS']];
const tones = [['cordial', 'Cordial'], ['formal', 'Formal'], ['descontraido', 'Descontraído'], ['empatico', 'Empático']];
const statusLabel = { sent: ['Enviado', ''], opened: ['Abriu o link', 'blue'], reviewed: ['Avaliou', 'green'] };
const filters = { score: '', replied: '', query: '' };
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const when = iso => (iso ? dateFormat.format(new Date(iso)) : '—');
const stars = score => `<span class="rp-stars" aria-label="${score} de 5 estrelas">${'★'.repeat(score)}<span>${'★'.repeat(5 - score)}</span></span>`;
const reviewLink = c => `${location.origin}/avaliar/${c.workspace}`;
const pill = (text, tone = '') => `<span class="badge ${tone}">${h(text)}</span>`;

function stats(c) {
  const reviews = c.s.reviews || [], requests = c.s.reviewRequests || [];
  const count = list => requests.filter(row => list.includes(row.status)).length;
  return {
    total: reviews.length, average: reviews.length ? reviews.reduce((sum, row) => sum + Number(row.score || 0), 0) / reviews.length : 0,
    pending: reviews.filter(row => !row.reply).length, requests: requests.length, opened: count(['opened', 'reviewed']), reviewed: count(['reviewed']),
    distribution: [5, 4, 3, 2, 1].map(score => [score, reviews.filter(row => Number(row.score) === score).length])
  };
}

function shell(c, tab, content, cta = '') {
  return pageShell({
    title: 'Reputação', desc: 'Peça avaliações, responda e acompanhe a nota da empresa.', className: 'rp-page',
    cta: cta || `<button type="button" class="primary" data-rp-act="request">${icon('send', 15)} Pedir avaliações</button>`,
    tabs: { key: 'reputation', label: 'Seções de reputação', current: tab, items: [
      { value: 'overview', label: 'Visão geral', href: '#reputation/overview' }, { value: 'reviews', label: 'Avaliações', href: '#reputation/reviews' },
      { value: 'requests', label: 'Pedidos', href: '#reputation/requests' }, { value: 'google', label: 'Perfil no Google', href: '#reputation/google' },
      { value: 'listings', label: 'Listagens', href: '#reputation/listings' }, { value: 'seo', label: 'SEO', href: '#reputation/seo' },
      { value: 'visibility', label: 'Visibilidade na IA', href: '#reputation/visibility' }, { value: 'widgets', label: 'Widgets', href: '#reputation/widgets' },
      { value: 'videos', label: 'Vídeos', href: '#reputation/videos' }, { value: 'settings', label: 'Link e mensagens', href: '#reputation/settings' }] },
    content
  });
}

function linkCard(c) {
  const link = reviewLink(c);
  const settings = c.s.reputation || {};
  const sites = [settings.googleUrl && 'Google', settings.facebookUrl && 'Facebook', settings.otherUrl && (settings.otherLabel || 'outro site')].filter(Boolean);
  return `<section class="surface padded rp-link">
    <div class="rp-link-text"><h2>Link de avaliação</h2>
      <p class="dim">Compartilhe no balcão, na nota fiscal ou nas redes. Os pedidos enviados a contatos usam um link pessoal, que liga a avaliação ao contato.</p>
      <div class="rp-copy"><input readonly value="${h(link)}" aria-label="Link de avaliação"><button type="button" class="secondary" data-rp-act="copy" data-value="${h(link)}">${icon('copy', 14)} Copiar</button>
        <a class="secondary" href="${h(link)}" target="_blank" rel="noopener">${icon('link', 14)} Abrir</a></div>
      <p class="dim">${sites.length ? `Depois de avaliar, o cliente pode publicar também no ${sites.join(', ')}.` : 'Adicione o link do Google em “Link e mensagens” para o cliente publicar a avaliação lá também.'}</p></div>
    <div class="rp-qr">${qrSvg(link, { size: 132, margin: 2, label: 'QR Code do link de avaliação' })}<a class="text-link" href="#sites/qr-codes">Criar QR Code com contagem de leituras</a></div>
  </section>`;
}

function overview(c) {
  const st = stats(c);
  const max = Math.max(1, ...st.distribution.map(([, n]) => n));
  const metric = (label, value, note = '') => `<div class="surface metric"><span>${label}</span><b>${value}</b>${note ? `<small class="dim">${note}</small>` : ''}</div>`;
  return shell(c, 'overview', `
    <div class="metrics rp-metrics">${metric('Nota média', st.total ? `${st.average.toFixed(1).replace('.', ',')} <small>/ 5</small>` : '—', `${st.total} ${st.total === 1 ? 'avaliação' : 'avaliações'}`)}
      ${metric('Aguardando resposta', st.pending)}${metric('Pedidos enviados', st.requests, st.requests ? `${Math.round(st.opened / st.requests * 100)}% abriram o link` : '')}
      ${metric('Viraram avaliação', st.requests ? `${Math.round(st.reviewed / st.requests * 100)}%` : '—', `${st.reviewed} de ${st.requests} ${st.requests === 1 ? 'pedido' : 'pedidos'}`)}</div>
    <div class="rp-two">
      <section class="surface padded"><h2>Distribuição das notas</h2><div class="rp-dist">${st.distribution.map(([score, n]) => `<div class="rp-dist-row"><span>${score} ★</span><span class="rp-bar"><span style="width:${Math.round(n / max * 100)}%"></span></span><b>${n}</b></div>`).join('')}</div></section>
      ${linkCard(c)}
    </div>`);
}

function reviewCard(c, review) {
  const aiOn = Boolean(c.features?.reviewAI);
  return `<article class="surface rp-review" data-review="${h(review.id)}">
    <header><div><b>${h(review.author)}</b> ${stars(Number(review.score) || 0)}${review.hidden ? ` ${pill('Oculta nos widgets')}` : ''}</div><span class="rp-review-meta"><small class="dim">${h(review.source || 'Manual')}${review.googleName && review.reply ? ' · resposta publicada no Google' : ''} · ${when(review.created)}</small>
      <button type="button" class="wf-text rp-link-btn" data-rp-act="visibility" data-id="${h(review.id)}" data-hidden="${review.hidden ? '' : '1'}">${review.hidden ? 'Mostrar nos widgets' : 'Ocultar nos widgets'}</button></span></header>
    <p class="rp-text">${h(review.text)}</p>
    <form class="rp-reply" data-rp-reply="${h(review.id)}">
      <label class="sr-only" for="reply-${h(review.id)}">Resposta para ${h(review.author)}</label>
      <textarea id="reply-${h(review.id)}" name="reply" rows="${review.reply ? 3 : 2}" maxlength="2500" placeholder="Escreva uma resposta…">${h(review.reply || '')}</textarea>
      <div class="rp-reply-bar">${aiOn ? `<button type="button" class="secondary" data-rp-act="ai-reply" data-id="${h(review.id)}">${icon('spark', 14)} Sugerir com IA</button>` : ''}
        <span class="form-status" role="status"></span><button class="primary">${review.googleName ? (review.reply ? 'Atualizar no Google' : 'Responder no Google') : review.reply ? 'Atualizar resposta' : 'Salvar resposta'}</button></div>
    </form>
  </article>`;
}

function reviews(c) {
  const query = filters.query.trim().toLowerCase();
  const list = [...(c.s.reviews || [])].reverse().filter(row => (!filters.score || String(row.score) === filters.score)
    && (!filters.replied || (filters.replied === 'yes' ? row.reply : !row.reply))
    && (!query || `${row.author} ${row.text} ${row.reply || ''}`.toLowerCase().includes(query)));
  const toolbar = `<div class="toolbar rp-toolbar"><label class="search">${icon('search', 15)}<input type="search" data-rp-filter="query" value="${h(filters.query)}" placeholder="Buscar nas avaliações" aria-label="Buscar nas avaliações"></label>
    <select data-rp-filter="score" aria-label="Nota"><option value="">Todas as notas</option>${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${filters.score === String(n) ? 'selected' : ''}>${n} estrela${n > 1 ? 's' : ''}</option>`).join('')}</select>
    <select data-rp-filter="replied" aria-label="Resposta"><option value="">Com e sem resposta</option><option value="no" ${filters.replied === 'no' ? 'selected' : ''}>Sem resposta</option><option value="yes" ${filters.replied === 'yes' ? 'selected' : ''}>Respondidas</option></select></div>`;
  const aiNote = c.features?.reviewAI ? '' : '<p class="dim">Conecte a OpenAI em Visão da agência → Configurações → OpenAI para sugerir respostas com IA.</p>';
  const body = (c.s.reviews || []).length
    ? `${toolbar}${aiNote}<div class="rp-list">${list.map(row => reviewCard(c, row)).join('') || '<p class="dim rp-empty-row">Nenhuma avaliação com esses filtros.</p>'}</div>`
    : `<div class="surface empty">${icon('star', 26)}<strong>Nenhuma avaliação ainda</strong><p>Envie pedidos de avaliação aos seus clientes ou compartilhe o link de avaliação.</p><button type="button" class="primary" data-rp-act="request">${icon('send', 15)} Pedir avaliações</button></div>`;
  return shell(c, 'reviews', body, `<span class="inline-gap"><button class="secondary" data-edit="reviews">${icon('plus', 15)} Adicionar manualmente</button><button type="button" class="primary" data-rp-act="request">${icon('send', 15)} Pedir avaliações</button></span>`);
}

function requests(c) {
  const rows = (c.s.reviewRequests || []).slice(0, 300);
  const contact = id => c.s.contacts.find(row => row.id === id);
  const table = rows.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Contato</th><th scope="col">Canal</th><th scope="col">Origem</th><th scope="col">Enviado</th><th scope="col">Situação</th></tr></thead><tbody>
    ${rows.map(row => { const [label, tone] = statusLabel[row.status] || statusLabel.sent; return `<tr><td><b>${h(contact(row.contactId)?.name || 'Contato excluído')}</b></td><td>${h(channels.find(([id]) => id === row.channel)?.[1] || row.channel)}</td><td>${row.source === 'workflow' ? 'Automação' : 'Manual'}</td><td>${when(row.sent)}</td><td>${pill(label, tone)}</td></tr>`; }).join('')}
  </tbody></table></div>`
    : `<div class="surface empty">${icon('send', 26)}<strong>Nenhum pedido enviado</strong><p>Cada contato recebe um link pessoal. Você acompanha aqui quem abriu e quem avaliou. Para pedir sempre depois de uma venda ou atendimento, use a ação “Pedir avaliação” num workflow.</p></div>`;
  return shell(c, 'requests', table);
}

function settings(c) {
  const s = c.s.reputation || {};
  const field = (label, html, hint = '') => `<label>${label}${html}${hint ? `<small class="dim">${hint}</small>` : ''}</label>`;
  const text = (name, value, extra = '') => `<input name="${name}" value="${h(value || '')}" ${extra}>`;
  const area = (name, value, rows = 3, max = 1000) => `<textarea name="${name}" rows="${rows}" maxlength="${max}">${h(value || '')}</textarea>`;
  return shell(c, 'settings', `${linkCard(c)}<form class="surface settings-form set-form" data-rp-settings>
    <section class="set-section"><header class="set-head"><h2>Página de avaliação</h2><p class="dim">O que o cliente lê ao abrir o link.</p></header><div class="set-body">
      ${field('Título', text('title', s.title, 'maxlength="120" required'))}${field('Texto de apoio', area('intro', s.intro, 2, 400))}</div></section>
    <section class="set-section"><header class="set-head"><h2>Sites de avaliação públicos</h2><p class="dim">Depois de enviar a avaliação, todo cliente vê os mesmos botões, qualquer que seja a nota. O Google não permite filtrar quem é convidado a avaliar.</p></header><div class="set-body">
      ${field('Link de avaliação do Google', text('googleUrl', s.googleUrl, 'type="url" maxlength="500" placeholder="https://g.page/r/…/review"'), 'No Perfil da Empresa no Google, use “Pedir avaliações” e copie o link.')}
      ${field('Facebook', text('facebookUrl', s.facebookUrl, 'type="url" maxlength="500" placeholder="https://facebook.com/…/reviews"'))}
      <div class="rp-two-fields">${field('Outro site', text('otherUrl', s.otherUrl, 'type="url" maxlength="500" placeholder="https://"'))}${field('Nome do outro site', text('otherLabel', s.otherLabel, 'maxlength="40" placeholder="Ex.: TripAdvisor"'))}</div></div></section>
    <section class="set-section"><header class="set-head"><h2>Mensagens dos pedidos</h2><p class="dim">Use {{contact.first_name}}, {{workspace.name}} e, obrigatoriamente, {{review.link}}, que vira o link pessoal de cada contato.</p></header><div class="set-body">
      ${field('WhatsApp', area('whatsapp', s.whatsapp, 3, 1000))}${field('SMS', area('sms', s.sms, 2, 320), 'O envio de SMS depende do provedor de telefonia; até lá, a mensagem fica registrada em Conversas.')}
      ${field('Assunto do e-mail', text('emailSubject', s.emailSubject, 'maxlength="200"'))}${field('E-mail', area('email', s.email, 6, 4000))}</div></section>
    <section class="set-section"><header class="set-head"><h2>Respostas com IA</h2><p class="dim">A IA só sugere. Você revisa e salva cada resposta. O uso conta no limite mensal de IA da subconta.</p></header><div class="set-body">
      <div class="rp-two-fields">${field('Tom das respostas', `<select name="replyTone">${tones.map(([id, label]) => `<option value="${id}" ${s.replyTone === id ? 'selected' : ''}>${label}</option>`).join('')}</select>`)}
        ${field('Assinatura', text('signature', s.signature, 'maxlength="120" placeholder="Ex.: Equipe La Vaca"'))}</div></div></section>
    <footer class="set-foot"><p class="form-status" role="status"></p><button class="primary">Salvar</button></footer>
  </form>`, ' ');
}

function google(c) {
  if (gbp.workspace !== c.workspace) queueMicrotask(() => loadGbp(c));
  if (gbp.workspace !== c.workspace || (gbp.loading && !gbp.status)) return shell(c, 'google', '<div class="surface padded"><p class="dim">Carregando o Perfil da Empresa no Google…</p></div>', ' ');
  if (!gbp.status) {
    const settings = c.access?.modules === null || c.access?.modules?.includes?.('settings') || !c.access;
    return shell(c, 'google', `<div class="surface empty">${icon('star', 26)}<strong>${gbp.code === 409 ? 'Conecte o Perfil da Empresa no Google' : 'Não foi possível ler o Perfil da Empresa'}</strong>
      <p>${h(gbp.error)}</p>${settings ? '<a class="primary" href="#settings/google">Abrir Configurações → Google</a>' : '<p class="dim">Peça a quem administra a subconta para conectar o Google.</p>'}
      ${gbp.code === 409 ? '' : '<button type="button" class="secondary" data-rp-act="gbp-refresh">Tentar de novo</button>'}</div>`, ' ');
  }
  const st = gbp.status, d = st.details || {};
  const { score, items } = st.checklist;
  const hours = hoursRows(d.regularHours);
  const google = (c.s.reviews || []).filter(row => row.googleName);
  const pending = google.filter(row => !row.reply).length;
  const address = d.storefrontAddress ? [...(d.storefrontAddress.addressLines || []), d.storefrontAddress.locality, d.storefrontAddress.administrativeArea].filter(Boolean).join(', ') : '';
  return shell(c, 'google', `
    <section class="surface padded rp-gbp-head">
      <div class="rp-score" style="--score:${score}" role="img" aria-label="Nota de otimização ${score} de 100"><b>${score}</b><small>de 100</small></div>
      <div><h2>${h(st.name)}</h2><p class="dim">${h(address || 'Sem endereço público')}${d.categories?.primaryCategory?.displayName ? ` · ${h(d.categories.primaryCategory.displayName)}` : ''}</p>
        <p class="dim">${score >= 85 ? 'Perfil bem completo. Mantenha as publicações e respostas em dia.' : 'Complete os itens abaixo para aparecer melhor nas buscas e no Maps.'}</p></div>
      <button type="button" class="secondary" data-rp-act="gbp-refresh">${icon('refresh', 14)} Atualizar</button>
    </section>
    <div class="rp-two">
      <section class="surface padded"><h2>Otimização</h2><ul class="rp-checklist">${items.map(item => `<li class="${item.done ? 'done' : ''}"><span aria-hidden="true">${item.done ? '✓' : '•'}</span><div><b>${h(item.label)}</b>${item.done ? '' : `<small class="dim">${h(item.tip)}</small>`}</div></li>`).join('')}</ul></section>
      <section class="surface padded rp-gbp-reviews"><h2>Avaliações do Google</h2>
        <p class="dim">${st.syncedAt ? `Última sincronização: ${when(st.syncedAt)}.` : 'Ainda não sincronizado.'} ${google.length} avaliações do Google${pending ? `, ${pending} sem resposta` : ''}.</p>
        <p class="dim">As respostas que você salvar na aba Avaliações são publicadas no Google.</p>
        <div class="rp-widget-actions"><button type="button" class="primary" data-rp-act="gbp-sync" ${st.account ? '' : 'disabled'}>${icon('refresh', 14)} Sincronizar avaliações</button>${pending ? '<a class="secondary" href="#reputation/reviews" data-rp-act="filter-pending">Responder pendentes</a>' : ''}</div>
        ${st.account ? '' : '<p class="dim">Escolha o local de novo em Configurações → Google para liberar as avaliações.</p>'}</section>
    </div>
    <form class="surface settings-form set-form rp-gbp-form" data-rp-gbp>
      <section class="set-section"><header class="set-head"><h2>Editar no Google</h2><p class="dim">Categorias, fotos e endereço continuam no painel do Google. As mudanças podem passar por revisão do Google antes de aparecer.</p></header><div class="set-body">
      <div class="ai-wrap"><label>Descrição<textarea id="gbp-description" name="description" rows="5" maxlength="750">${h(d.profile?.description || '')}</textarea><small class="dim" data-gbp-count></small></label>${aiTool('#gbp-description', 'gbp', 'Descrição do Google')}</div>
      <div class="rp-two-fields"><label>Telefone<input name="phone" maxlength="30" value="${h(d.phoneNumbers?.primaryPhone || '')}" placeholder="(11) 99999-0000"></label>
        <label>Site<input name="website" type="url" maxlength="500" value="${h(d.websiteUri || '')}" placeholder="https://"></label></div>
      <fieldset class="rp-hours" data-gbp-hours><legend>Horário de funcionamento</legend>
        ${hours.map(row => `<div class="rp-hour" data-day="${row.day}"><label class="rp-check"><input type="checkbox" data-hour="open" ${row.open ? 'checked' : ''}> ${row.label}</label>
          <input type="time" data-hour="from" value="${row.from}" aria-label="${row.label}: abre"><span class="dim">às</span><input type="time" data-hour="to" value="${row.to === '24:00' ? '23:59' : row.to}" aria-label="${row.label}: fecha">
          ${row.split ? '<small class="dim">tem mais de um turno no Google</small>' : ''}</div>`).join('')}
        ${hours.some(row => row.split) ? '<p class="dim">Dias com mais de um turno ficam como estão, a menos que você altere algum horário.</p>' : ''}
      </fieldset></div></section>
      <footer class="set-foot"><p class="form-status" role="status"></p><button class="primary">Salvar no Google</button></footer>
    </form>`, ' ');
}

function listings(c) {
  if (gbp.workspace !== c.workspace) queueMicrotask(() => loadGbp(c));
  const d = gbp.status?.details || {};
  const address = d.storefrontAddress ? [...(d.storefrontAddress.addressLines || []), d.storefrontAddress.locality, d.storefrontAddress.administrativeArea, d.storefrontAddress.postalCode].filter(Boolean).join(', ') : '';
  const canonical = [['Nome', d.title || c.s.profile?.name || ''], ['Endereço', address], ['Telefone', d.phoneNumbers?.primaryPhone || c.s.profile?.phone || ''], ['Site', d.websiteUri || '']];
  const saved = c.s.listings || {};
  const ok = directories.filter(([id]) => saved[id]?.status === 'ok').length;
  const rows = directories.map(([id, name, claim, note]) => {
    const row = saved[id] || {};
    const status = listingStatuses.find(([key]) => key === (row.status || 'unchecked'));
    return `<form class="rp-listing" data-rp-listing="${id}">
      <div class="rp-listing-name"><b>${h(name)}</b><small class="dim">${h(note)}</small><span>${pill(status[1], status[2])}${row.checked ? ` <small class="dim">verificado em ${when(row.checked)}</small>` : ''}</span></div>
      <label class="sr-only" for="listing-${id}">Endereço do perfil em ${h(name)}</label><input id="listing-${id}" name="url" type="url" maxlength="500" value="${h(row.url || '')}" placeholder="https:// (endereço do seu perfil)">
      <label class="sr-only" for="listing-status-${id}">Situação em ${h(name)}</label><select id="listing-status-${id}" name="status">${listingStatuses.map(([key, label]) => `<option value="${key}" ${key === (row.status || 'unchecked') ? 'selected' : ''}>${label}</option>`).join('')}</select>
      <span class="rp-widget-actions"><a class="secondary" href="${h(row.url || claim)}" target="_blank" rel="noopener">${row.url ? 'Abrir perfil' : 'Cadastrar'}</a><button class="primary">Salvar</button></span>
    </form>`;
  }).join('');
  return shell(c, 'listings', `
    <section class="surface set-card"><div class="set-section"><header class="set-head"><h2>Dados oficiais da empresa</h2>
        <p class="dim">${gbp.status ? 'Vindos do Perfil da Empresa no Google.' : 'Conecte o Google em Configurações para usar os dados do Perfil da Empresa.'} Use exatamente estes dados em todos os diretórios: diferenças confundem o Google e os clientes.</p></header><div class="set-body">
        <dl class="rp-nap">${canonical.map(([label, value]) => `<div><dt>${label}</dt><dd>${value ? `${h(value)} <button type="button" class="wf-text rp-link-btn" data-rp-act="copy" data-value="${h(value)}">Copiar</button>` : '<span class="dim">—</span>'}</dd></div>`).join('')}</dl></div></div>
      <div class="set-section"><header class="set-head"><h2>Presença nos diretórios</h2><p class="dim">A graao não sincroniza estes diretórios automaticamente (isso exige um parceiro pago, como a Yext). Confira cada perfil, corrija o que estiver diferente e registre aqui.</p></header><div class="set-body">
        <div class="rp-score small" style="--score:${Math.round(ok / directories.length * 100)}" role="img" aria-label="${ok} de ${directories.length} diretórios corretos"><b>${ok}/${directories.length}</b><small>corretos</small></div></div></div></section>
    <section class="rp-listings">${rows}</section>`, ' ');
}

function widgetCode(c, widget) {
  return `<script src="${location.origin}/rw/${c.workspace}/${widget.id}/widget.js" async></script>`;
}

function widgets(c) {
  const list = c.s.reviewWidgets || [];
  if (!list.some(row => row.id === view.widget)) view.widget = list[0]?.id || '';
  const selected = list.find(row => row.id === view.widget);
  const cards = list.map(row => `<article class="surface rp-widget${row.id === view.widget ? ' selected' : ''}">
      <header><b>${h(row.name)}</b>${row.active ? pill('Ativo', 'green') : pill('Pausado')}</header>
      <small class="dim">${h(layouts.find(([id]) => id === row.layout)?.[1] || '')} · nota ${row.minScore}+ · até ${row.max} avaliações${row.showVideos ? ' · com vídeos' : ''}</small>
      <div class="rp-widget-actions"><button type="button" class="secondary" data-rp-act="widget-preview" data-id="${h(row.id)}">Ver prévia</button>
        <button type="button" class="secondary" data-rp-act="copy" data-value="${h(widgetCode(c, row))}">${icon('copy', 14)} Copiar código</button>
        <button type="button" class="secondary" data-rp-act="widget-edit" data-id="${h(row.id)}">${icon('edit', 14)} Editar</button>
        <button type="button" class="icon-btn" data-rp-act="delete" data-key="reviewWidgets" data-id="${h(row.id)}" aria-label="Excluir widget ${h(row.name)}" title="Excluir">${icon('trash', 15)}</button></div>
    </article>`).join('');
  const body = list.length ? `<div class="rp-widgets">${cards}</div>
    ${selected ? `<section class="surface padded rp-preview"><div class="rp-preview-head"><h2>Prévia: ${h(selected.name)}</h2><a class="text-link" href="/rw/${h(c.workspace)}/${h(selected.id)}" target="_blank" rel="noopener">Abrir em nova aba</a></div>
      <p class="dim">Cole o código onde o widget deve aparecer no site. Ele se ajusta à altura do conteúdo.</p>
      <code class="rp-code">${h(widgetCode(c, selected))}</code>
      ${selected.active ? `<iframe class="rp-frame" title="Prévia do widget" src="/rw/${h(c.workspace)}/${h(selected.id)}?v=${encodeURIComponent(selected.updated || selected.created || '')}"></iframe>` : '<p class="dim">Ative o widget para ver a prévia.</p>'}</section>` : ''}`
    : `<div class="surface empty">${icon('grid', 26)}<strong>Nenhum widget ainda</strong><p>Mostre as melhores avaliações e depoimentos em vídeo no seu site, com uma linha de código.</p><button type="button" class="primary" data-rp-act="widget-edit">${icon('plus', 15)} Criar widget</button></div>`;
  return shell(c, 'widgets', body, `<button type="button" class="primary" data-rp-act="widget-edit">${icon('plus', 15)} Novo widget</button>`);
}

function widgetForm(row = {}) {
  const value = (key, fallback) => row[key] ?? fallback;
  const check = (name, label, on) => `<label class="rp-check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${label}</label>`;
  return `<form class="rp-form" data-rp-widget data-id="${h(row.id || '')}">
    <label>Nome<input name="name" required maxlength="80" value="${h(value('name', ''))}" placeholder="Ex.: Página inicial"></label>
    <label>Título no widget (opcional)<input name="title" maxlength="120" value="${h(value('title', ''))}" placeholder="Ex.: O que nossos clientes dizem"></label>
    <div class="rp-two-fields"><label>Formato<select name="layout">${layouts.map(([id, label]) => `<option value="${id}" ${value('layout', 'carousel') === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Tema<select name="theme">${themes.map(([id, label]) => `<option value="${id}" ${value('theme', 'auto') === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
    <div class="rp-two-fields"><label>Nota mínima<select name="minScore">${[5, 4, 3, 2, 1].map(n => `<option value="${n}" ${Number(value('minScore', 4)) === n ? 'selected' : ''}>${n} estrela${n > 1 ? 's' : ''} ou mais</option>`).join('')}</select></label>
      <label>Máximo de avaliações<input name="max" type="number" min="1" max="30" value="${h(value('max', 9))}"></label></div>
    <label>Cor de destaque<input name="accent" type="color" value="${h(value('accent', '#ff4f9a'))}"></label>
    ${check('showReplies', 'Mostrar as respostas da empresa', value('showReplies', true))}${check('showVideos', 'Incluir depoimentos em vídeo aprovados', value('showVideos', false))}${check('active', 'Widget ativo', value('active', true))}
    <p class="dim">Só aparecem avaliações com comentário e que não estejam ocultas. Os nomes aparecem abreviados (ex.: Ana L.).</p>
    <div class="inline-gap"><button class="primary">Salvar widget</button><button type="button" class="secondary" data-act="close">Cancelar</button></div>
    <p class="form-status" role="alert"></p>
  </form>`;
}

function videos(c) {
  const collectors = c.s.videoCollectors || [], list = c.s.videoTestimonials || [];
  const collectorName = id => collectors.find(row => row.id === id)?.name || 'Coletor excluído';
  const link = row => `${location.origin}/depoimento/${c.workspace}/${row.id}`;
  const collectorRows = collectors.map(row => `<article class="surface rp-collector">
      <div><b>${h(row.name)}</b> ${row.active ? pill('Ativo', 'green') : pill('Pausado')}<p class="dim">${h(row.question)} · até ${row.maxSeconds} s</p></div>
      <div class="rp-widget-actions"><button type="button" class="secondary" data-rp-act="copy" data-value="${h(link(row))}">${icon('copy', 14)} Copiar link</button>
        <a class="secondary" href="${h(link(row))}" target="_blank" rel="noopener">${icon('link', 14)} Abrir</a>
        <button type="button" class="secondary" data-rp-act="collector-edit" data-id="${h(row.id)}">${icon('edit', 14)} Editar</button>
        <button type="button" class="icon-btn" data-rp-act="delete" data-key="videoCollectors" data-id="${h(row.id)}" aria-label="Excluir coletor ${h(row.name)}" title="Excluir">${icon('trash', 15)}</button></div>
    </article>`).join('');
  const cards = list.map(row => { const [label, tone] = videoStatus[row.status] || videoStatus.pending; return `<article class="surface rp-video">
      <video controls preload="metadata" playsinline src="/api/video?workspace=${encodeURIComponent(c.workspace)}&amp;id=${encodeURIComponent(row.id)}"></video>
      <div class="rp-video-body"><b>${h(row.name)}</b> ${pill(label, tone)}
        <small class="dim">${h(collectorName(row.collectorId))} · ${row.seconds ? `${row.seconds} s · ` : ''}${when(row.created)}${row.email ? ` · ${h(row.email)}` : ''}</small>
        <div class="rp-widget-actions">${row.status !== 'approved' ? `<button type="button" class="primary" data-rp-act="video-status" data-id="${h(row.id)}" data-status="approved">Aprovar</button>` : ''}
          ${row.status !== 'hidden' ? `<button type="button" class="secondary" data-rp-act="video-status" data-id="${h(row.id)}" data-status="hidden">Ocultar</button>` : ''}
          <button type="button" class="icon-btn" data-rp-act="delete" data-key="videoTestimonials" data-id="${h(row.id)}" aria-label="Excluir depoimento de ${h(row.name)}" title="Excluir">${icon('trash', 15)}</button></div></div>
    </article>`; }).join('');
  return shell(c, 'videos', `
    <section class="rp-section"><div class="rp-preview-head"><h2>Coletores</h2><button type="button" class="secondary" data-rp-act="collector-edit">${icon('plus', 14)} Novo coletor</button></div>
      <p class="dim">Um coletor é um link com uma pergunta. O cliente grava pelo celular ou envia um vídeo de até 15 MB, autorizando a publicação.</p>
      ${collectorRows ? `<div class="rp-collectors">${collectorRows}</div>` : ''}</section>
    <section class="rp-section"><h2>Depoimentos recebidos</h2>
      ${cards ? `<div class="rp-videos">${cards}</div>` : `<div class="surface empty">${icon('play', 26)}<strong>Nenhum depoimento ainda</strong><p>${collectors.length ? 'Envie o link do coletor aos seus clientes.' : 'Crie um coletor e envie o link aos seus clientes.'} Os vídeos chegam aqui para aprovação.</p></div>`}</section>`,
    `<button type="button" class="primary" data-rp-act="collector-edit">${icon('plus', 15)} Novo coletor</button>`);
}

function collectorForm(row = {}) {
  return `<form class="rp-form" data-rp-collector data-id="${h(row.id || '')}">
    <label>Nome<input name="name" required maxlength="80" value="${h(row.name || '')}" placeholder="Ex.: Clientes de 2026"></label>
    <label>Pergunta para o cliente<textarea name="question" required rows="2" maxlength="300" placeholder="Ex.: Como a nossa equipe ajudou você?">${h(row.question || '')}</textarea></label>
    <div class="rp-two-fields"><label>Duração máxima<select name="maxSeconds">${[15, 30, 45, 60, 90, 120].map(n => `<option value="${n}" ${Number(row.maxSeconds || 60) === n ? 'selected' : ''}>${n} segundos</option>`).join('')}</select></label>
      <label>Mensagem de agradecimento<input name="thanks" maxlength="300" value="${h(row.thanks || 'Obrigado! Seu depoimento foi enviado.')}"></label></div>
    <label class="rp-check"><input type="checkbox" name="active" ${row.active === false ? '' : 'checked'}> Coletor ativo</label>
    <div class="inline-gap"><button class="primary">Salvar coletor</button><button type="button" class="secondary" data-act="close">Cancelar</button></div>
    <p class="form-status" role="alert"></p>
  </form>`;
}

export function reputationScreen(c) {
  const tab = reputationTabs.includes(c.tab) ? c.tab : 'overview';
  const seo = c => shell(c, 'seo', seoContent(c), ' '), visibility = c => shell(c, 'visibility', visibilityContent(c), ' ');
  return { overview, reviews, requests, google, listings, seo, visibility, widgets, videos, settings }[tab](c);
}

function requestDialog(c) {
  const contacts = [...c.s.contacts].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR')).slice(0, 500);
  return `<form class="rp-request" data-rp-request>
    <label>Canal<select name="channel">${channels.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label>
    <label class="search">${icon('search', 15)}<input type="search" data-rp-contact-query placeholder="Buscar contatos" aria-label="Buscar contatos"></label>
    <div class="rp-contacts" role="group" aria-label="Contatos">${contacts.map(row => `<label class="rp-contact" data-name="${h(`${row.name} ${row.email || ''} ${row.phone || ''}`.toLowerCase())}"><input type="checkbox" name="contact" value="${h(row.id)}">
      <span><b>${h(row.name)}</b><small class="dim">${h([row.phone, row.email].filter(Boolean).join(' · ') || 'Sem telefone e e-mail')}</small></span></label>`).join('') || '<p class="dim">Nenhum contato ainda.</p>'}</div>
    <label class="rp-check"><input type="checkbox" name="force"> Enviar também para quem recebeu um pedido nos últimos 7 dias</label>
    <p class="dim">Cada contato recebe a mensagem do canal definida em “Link e mensagens”, com o link pessoal. Contatos em “não perturbe” ficam de fora.</p>
    <div class="inline-gap"><button class="primary">Enviar pedidos</button><button type="button" class="secondary" data-act="close">Cancelar</button><span data-rp-count class="dim"></span></div>
    <p class="form-status" role="alert"></p>
  </form>`;
}

export function installReputation({ c, api, url, mutate, flash, dialog, close, render }) {
  env = { api, url, render };
  const here = () => c.view === 'reputation';
  const count = () => { const area = document.querySelector('#gbp-description'); const out = document.querySelector('[data-gbp-count]'); if (area && out) out.textContent = `${area.value.length} / 750 caracteres${area.value.length < 250 ? ' · use pelo menos 250' : ''}`; };
  window.addEventListener('hashchange', () => setTimeout(count));
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-rp-act]');
    if (!el || !here()) return;
    const act = el.dataset.rpAct;
    try {
      if (act === 'copy') { await navigator.clipboard.writeText(el.dataset.value); flash('Link copiado.'); }
      if (act === 'request') dialog('Pedir avaliações', requestDialog(c));
      if (act === 'widget-edit') dialog(el.dataset.id ? 'Editar widget' : 'Novo widget', widgetForm((c.s.reviewWidgets || []).find(row => row.id === el.dataset.id)));
      if (act === 'collector-edit') dialog(el.dataset.id ? 'Editar coletor' : 'Novo coletor', collectorForm((c.s.videoCollectors || []).find(row => row.id === el.dataset.id)));
      if (act === 'widget-preview') { view.widget = el.dataset.id; render(); }
      if (act === 'gbp-refresh') { gbp.status = null; await loadGbp(c, true); }
      if (act === 'filter-pending') { filters.replied = 'no'; }
      if (act === 'gbp-sync') {
        el.disabled = true;
        try {
          const result = await api(url('/api/gbp/sync'), {});
          c.s = result.state; c.m = result.metrics;
          await loadGbp(c);
          flash(result.total ? `${result.added} avaliações novas e ${result.updated} atualizadas, de ${result.total} no Google.` : 'Nenhuma avaliação no Google ainda.');
        } finally { el.disabled = false; }
      }
      if (act === 'visibility') { await mutate({ type: 'review-visibility', id: el.dataset.id, data: { hidden: el.dataset.hidden === '1' } }); render(); }
      if (act === 'video-status') {
        const row = c.s.videoTestimonials.find(item => item.id === el.dataset.id);
        await mutate({ type: 'save', key: 'videoTestimonials', id: row.id, data: { status: el.dataset.status, name: row.name } });
        render(); flash(el.dataset.status === 'approved' ? 'Depoimento aprovado. Ele já pode aparecer nos widgets com vídeos.' : 'Depoimento ocultado.');
      }
      if (act === 'delete') {
        const [title, text] = { reviewWidgets: ['Excluir este widget?', 'Sites que usam o código deixam de mostrá-lo.'], videoCollectors: ['Excluir este coletor?', 'O link deixa de funcionar; os vídeos recebidos continuam.'], videoTestimonials: ['Excluir este depoimento?', 'O vídeo é apagado.'] }[el.dataset.key] || ['Excluir este item?', ''];
        if (!await ask(title, { text, ok: 'Excluir' })) return;
        await mutate({ type: 'delete', key: el.dataset.key, id: el.dataset.id }); render(); flash('Excluído.');
      }
      if (act === 'ai-reply') {
        const form = document.querySelector(`[data-rp-reply="${CSS.escape(el.dataset.id)}"]`);
        const status = form.querySelector('.form-status');
        el.disabled = true; status.textContent = 'Escrevendo…';
        try {
          const { text } = await api(url('/api/content-ai/review-reply'), { reviewId: el.dataset.id });
          form.elements.reply.value = text; form.elements.reply.rows = 4; status.textContent = 'Sugestão pronta. Revise e salve.';
          form.elements.reply.focus();
        } catch (error) { status.textContent = error.message; }
        finally { el.disabled = false; }
      }
    } catch (error) { flash(error.message, true); }
  });
  document.addEventListener('input', event => {
    if (!here()) return;
    if (event.target.id === 'gbp-description') count();
    if (event.target.closest('[data-gbp-hours]')) event.target.closest('[data-gbp-hours]').dataset.changed = '1';
    const query = event.target.closest('[data-rp-contact-query]');
    if (query) {
      const q = query.value.trim().toLowerCase();
      for (const row of document.querySelectorAll('.rp-contact')) row.hidden = Boolean(q) && !row.dataset.name.includes(q);
    }
    const filter = event.target.closest('[data-rp-filter="query"]');
    if (filter) {
      filters.query = filter.value; const at = filter.selectionStart; render();
      const next = document.querySelector('[data-rp-filter="query"]'); next?.focus(); next?.setSelectionRange(at, at);
    }
  });
  document.addEventListener('change', event => {
    if (!here()) return;
    const filter = event.target.closest('select[data-rp-filter]');
    if (filter) { filters[filter.dataset.rpFilter] = filter.value; render(); }
    if (event.target.matches('.rp-contact input')) {
      const n = document.querySelectorAll('.rp-contact input:checked').length;
      const count = document.querySelector('[data-rp-count]'); if (count) count.textContent = n ? `${n} selecionado${n > 1 ? 's' : ''}` : '';
    }
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!here() || !form.matches('[data-rp-request],[data-rp-reply],[data-rp-settings],[data-rp-widget],[data-rp-collector],[data-rp-gbp],[data-rp-listing]')) return;
    event.preventDefault();
    const status = form.querySelector('.form-status'), button = form.querySelector('button.primary');
    button.disabled = true; if (status) status.textContent = '';
    try {
      if (form.matches('[data-rp-request]')) {
        const contactIds = [...form.querySelectorAll('input[name="contact"]:checked')].map(input => input.value);
        const result = await api(url('/api/action'), { type: 'review-request', data: { channel: form.elements.channel.value, contactIds, force: form.elements.force.checked } });
        c.s = result.state; c.m = result.metrics;
        const summary = result.id || { sent: 0, skipped: [] };
        if (!summary.sent && summary.skipped.length) throw new Error(`Nenhum pedido enviado. ${summary.skipped.slice(0, 3).join('; ')}${summary.skipped.length > 3 ? '…' : ''}`);
        close(); location.hash = '#reputation/requests'; render();
        flash(`${summary.sent} pedido${summary.sent === 1 ? '' : 's'} enviado${summary.sent === 1 ? '' : 's'}${summary.skipped.length ? `; ${summary.skipped.length} ficaram de fora (${summary.skipped.slice(0, 2).join('; ')}${summary.skipped.length > 2 ? '…' : ''})` : ''}.`);
        return;
      }
      if (form.matches('[data-rp-gbp]')) {
        const box = form.querySelector('[data-gbp-hours]');
        const body = { description: form.elements.description.value, phone: form.elements.phone.value, website: form.elements.website.value };
        if (box.dataset.changed) body.hours = [...box.querySelectorAll('.rp-hour')].map(row => ({ day: row.dataset.day, open: row.querySelector('[data-hour="open"]').checked, from: row.querySelector('[data-hour="from"]').value, to: row.querySelector('[data-hour="to"]').value }));
        if (status) status.textContent = 'Enviando ao Google…';
        gbp.status = await api(url('/api/gbp/profile'), body);
        render(); flash('Perfil atualizado no Google. Algumas mudanças passam por revisão antes de aparecer.');
        return;
      }
      if (form.matches('[data-rp-listing]')) {
        await mutate({ type: 'listing-save', data: { id: form.dataset.rpListing, url: form.elements.url.value.trim(), status: form.elements.status.value } });
        render(); flash('Diretório atualizado.');
        return;
      }
      if (form.matches('[data-rp-widget],[data-rp-collector]')) {
        const data = Object.fromEntries(new FormData(form));
        for (const key of ['showReplies', 'showVideos', 'active']) if (form.elements[key]) data[key] = form.elements[key].checked;
        const key = form.matches('[data-rp-widget]') ? 'reviewWidgets' : 'videoCollectors';
        const id = await mutate({ type: 'save', key, ...(form.dataset.id && { id: form.dataset.id }), data });
        if (key === 'reviewWidgets') view.widget = id;
        close(); render(); flash(key === 'reviewWidgets' ? 'Widget salvo. Copie o código para o seu site.' : 'Coletor salvo. Copie o link e envie aos clientes.');
        return;
      }
      if (form.matches('[data-rp-reply]')) {
        const review = c.s.reviews.find(row => row.id === form.dataset.rpReply);
        if (review.googleName) {
          const result = await api(url('/api/gbp/reply'), { reviewId: review.id, reply: form.elements.reply.value.trim() });
          c.s = result.state; c.m = result.metrics;
          render(); flash('Resposta publicada no Google.');
          return;
        }
        await mutate({ type: 'save', key: 'reviews', id: review.id, data: { author: review.author, score: review.score, text: review.text, reply: form.elements.reply.value.trim() } });
        render(); flash('Resposta salva.');
        return;
      }
      const data = Object.fromEntries(new FormData(form));
      await mutate({ type: 'reputation-settings', data });
      render(); flash('Configurações salvas.');
    } catch (error) { if (status) status.textContent = error.message; else flash(error.message, true); button.disabled = false; }
  });
}
