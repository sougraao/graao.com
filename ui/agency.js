import { brandHighlight, brandIcon, icon as i, logo, brandName, bootScreen, domainBrand, shcLayers } from './icons.js';
import { rodapeHtml } from './rodape.js';
import { desktopPage, desktopPreview, readDesktop } from './agency-desktop.js';
import { createMobileCreator } from './agency-mobile.js';
import { formatTokens, formatUsd, usageKinds } from './ai-data.js';
import { labCatalog, labModes } from './labs-data.js';
import { sidebar } from './sidebar.js';
import { topbar } from './topbar.js';
import { applyBrandColor } from './graao.js';
import { tr, translateDom, getLanguage } from './i18n.js';
import { money, utabs } from './screens.js';
import { colorPicker, mountColorPicker } from './color-picker.js';
import { phoneField } from './phone-input.js';
import { fiscalForm, fiscalMissing, readFiscal } from './fiscal.js';
import { installLedger, ledgerPanel } from './ledger.js';
import { createProspecting, prospectRoutes } from './prospecting.js';
import { createGraaoChat } from './graao-chat.js';
import { enhanceCode } from './bui-mounts.js';
import { brandGroupCsv, brandGroupHtml, groupPeriods } from './brand-group-data.js';
import { presentationsHtml, attachPresentationListeners, closePresentationEditor } from './presentations.js';
import { pranchetaScreen } from './prancheta.js';
import { apiScopes,
  affiliateRate, agencyPlans, agencyRoles, auditAreas, collections, integrationCatalog,
  marketplaceCategories, resellProducts, snapshotAssets, snapshotAssetGroups, subAccountModules, systemEmailKeys,
  appScopes, maxMarkup, rebillProducts, subFeatures, agencyNav, agencyNavGroups, helpCenterUrl, walletProducts
} from './agency-data.js';
import { setupArt } from './setup-art.js';
import { GHL_RUNNING, ghlImportBody, ghlImportState } from './ghl-import-view.js';
import { platformPage, platformBanner } from './platform.js';
import { createAiGatewayPanel } from './ai-gateway.js';

export { agencyNav };
const h = x => String(x ?? '').replace(/[&<>"']/g, v => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[v]);
const day = (d, time = false) => d ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(d)) : '—';
const bytes = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`;
const badge = (text, tone = '') => `<span class="badge ${tone}">${h(tr(text))}</span>`;
const statusTone = { Active: 'green', Paused: 'gold', Closed: 'red', Won: 'green', Lost: 'red', Trial: 'blue', Cancelled: 'red', Requested: 'blue', Withdrawn: '', Planned: 'blue', 'In progress': 'pink', Completed: 'green', Declined: 'red', 'Under review': '' };
const tone = s => statusTone[s] || '';
const initials = s => (s || '').split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || 'AG';
const subTabs = {
  prospecting: prospectRoutes,
  snapshots: [['mine', 'Meus setups'], ['imported', 'Importados'], ['templates', 'Templates de setup'], ['history', 'Histórico de cargas']],
  affiliate: [['dashboard', 'Painel'], ['reports', 'Relatórios de indicações'], ['payment', 'Dados de pagamento'], ['history', 'Histórico de pagamentos']],
  ideas: [['all', 'Todas'], ['Under review', 'Em análise'], ['Planned', 'Planejadas'], ['In progress', 'Em andamento'], ['Completed', 'Concluídas']],
  saas: [['overview', 'Visão geral'], ['plans', 'Planos SaaS'], ['rebilling', 'Rebilling da carteira'], ['accounts', 'Subcontas SaaS']],
  settings: [['profile', 'Meu perfil'], ['company', 'Empresa e marca'], ['fiscal', 'Cadastro fiscal'], ['users', 'Equipe'], ['billing', 'Faturamento e carteira'], ['ledger', 'Livro da cobrança'],
    ['whatsapp', 'WhatsApp'], ['email-services', 'Serviços de e-mail'], ['emails', 'E-mails do sistema'], ['announcements', 'Comunicados'],
    ['workflow-premium', 'Workflow: recursos premium'], ['external-ai', 'Workflow: IA externa'], ['domain-purchase', 'Compra de domínios'],
    ['openai', 'OpenAI'], ['private-integrations', 'Integrações privadas'], ['affiliates', 'Afiliados'], ['menu-links', 'Links de menu'], ['abacatepay', 'AbacatePay'], ['api-keys', 'Chaves de API'],
    ['compliance', 'Conformidade'], ['labs', 'Recursos experimentais'], ['audit', 'Logs de auditoria'], ['storage', 'Armazenamento de mídia']],
  'ai-suite': [['limits', 'Planos e limites'], ['usage', 'Painel de uso'], ['setup', 'Configuração']]
};
const aiPeriods = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['month', 'Este mês']];
const aiFilters = [['', 'Todas as subcontas'], ['nolimit', 'Sem limite'], ['near', 'Perto do limite'], ['blocked', 'No limite'], ['off', 'IA desligada']];
const aiAlertSteps = [0.5, 0.6, 0.7, 0.8, 0.9, 0.95];
// Where an account stands in Central de IA → Planos e limites.
const aiState = a => !a.aiEnabled ? 'off' : !a.aiLimit ? 'nolimit' : a.aiCost >= a.aiLimit ? 'blocked' : a.aiCost >= a.aiLimit * (a.aiAlertAt || 0.8) ? 'near' : 'ok';

export function startAgency(env) {
  const { app, overlay, api, flash, openWorkspace } = env;
  const A = { data: null, openAI: null, openAIOnly: false, wa: null, waFocus: null, waPairOpen: false, page: 'dashboard', sub: '', query: '', status: '', category: '', mktOrigin: '', selected: new Set(), chat: [], navOpen: innerWidth > 700, aiFilter: '', aiPeriod: '30', aiUsage: null, pf: null, pfError: '', pfLoading: false };
  let waPollTimer = null, vlPollTimer = null;
  function stopWaPoll() { if (waPollTimer) { clearInterval(waPollTimer); waPollTimer = null; } }
  const G = s => document.querySelector(s);
  const D = () => A.data.agency;
  const O = () => A.data.overview;
  const M = () => A.data.marketplace || [];
  const accounts = () => O().accounts;
  const accountName = id => accounts().find(a => a.id === id)?.name || 'Subconta removida';
  const match = (...values) => !A.query || values.join(' ').toLowerCase().includes(A.query.toLowerCase());
  const go = (page, sub = '') => { const next = `#agency/${page}${sub ? `/${sub}` : ''}`; if (location.hash === next) render(); else location.hash = next; };

  let visit = 0, loading = false;
  async function call(op, body) {
    const currentVisit = visit;
    const data = await api(`/api/agency/${op}`, body);
    if (currentVisit === visit) A.data = data;
    if (op === 'action' && body.type === 'company') env.onBrandColorChange(data.agency.company.primary, data.agency.company.secondary, data.agency.company.accent);
    return data.result;
  }
  const act = (type, extra = {}) => call('action', { type, ...extra });

  // ---- Dialogs -----------------------------------------------------------
  let returnFocus;
  function close() { const d = G('#dialog'); if (d?.open) d.close(); overlay.innerHTML = ''; if (returnFocus?.isConnected) returnFocus.focus(); }
  function dialog(title, body, { form = '', id = '', submit = 'Salvar', wide = false, description = '' } = {}) {
    returnFocus = document.activeElement;
    overlay.innerHTML = `<dialog id="dialog" class="${wide ? 'ag-wide' : ''}" aria-labelledby="modal-title"><header><div><h2 id="modal-title">${h(tr(title))}</h2>${description ? `<p>${h(tr(description))}</p>` : ''}</div><button class="icon-btn" aria-label="${h(tr('Fechar diálogo'))}" data-close-dialog>${i('close', 17)}</button></header>${form
      ? `<form data-ag-form="${form}" data-id="${h(id)}"><div class="modal-body">${body}<p class="form-status" role="alert"></p></div><footer><button type="button" class="secondary" data-close-dialog>Cancelar</button><button class="primary">${h(submit)}</button></footer></form>`
      : `<div class="modal-body">${body}</div>`}</dialog>`;
    const d = G('#dialog'); d.showModal(); d.addEventListener('cancel', ev => { ev.preventDefault(); close(); });
    let downTarget = null; d.addEventListener('mousedown', ev => { downTarget = ev.target; });
    d.addEventListener('click', ev => {
      if (ev.target === d && downTarget === d) {
        const r = d.getBoundingClientRect();
        if (ev.clientY < r.top || ev.clientY > r.bottom || ev.clientX < r.left || ev.clientX > r.right) close();
      }
    });
    d.querySelector('input:not([type=hidden]),select,textarea')?.focus();
  }
  const confirmBox = (title, text, form, id, submit) => dialog(title, `<p>${h(text)}</p>`, { form, id, submit });

  // ---- Importar do GHL ---------------------------------------------------
  // A janela mostra o código; a extensão do Chrome envia a leitura; daqui o graao consulta o andamento a cada 2 s e,
  // quando os dados chegam, avança a conversão passo a passo (cada passo leva menos de 20 s no servidor).
  let ghlJob = '', ghlTimer = null;
  const stopGhl = () => { clearTimeout(ghlTimer); ghlTimer = null; ghlJob = ''; };
  function paintGhl(job, summary = '') {
    const box = G('#dialog [data-ghl-state]');
    if (!box) return false;
    box.innerHTML = ghlImportState(job, { summary });
    for (const el of box.querySelectorAll('[data-w]')) el.style.width = `${el.dataset.w}%`;
    return true;
  }
  async function watchGhl(jobId) {
    if (ghlJob !== jobId || !G('#dialog [data-ghl-state]')) return;
    let job;
    try {
      job = await api(`/api/agency/ghl-import/${jobId}`);
      while (GHL_RUNNING.includes(job.status) && ghlJob === jobId && paintGhl(job)) job = await api(`/api/agency/ghl-import/${jobId}/step`, {});
    } catch (problem) {
      if (!job) { ghlTimer = setTimeout(() => watchGhl(jobId), 4000); return; }
      job = { ...job, status: 'failed', error: problem.message || 'A conversão parou. Tente de novo.' };
    }
    if (ghlJob !== jobId) return;
    if (job.status === 'waiting' && Date.now() > job.expiresAt) job = { ...job, status: 'failed', error: 'O código expirou. Gere outro para continuar.' };
    if (job.status === 'done') {
      A.data = await api('/api/agency');
      render();
      const setup = D().snapshots.find(s => s.id === job.snapshotId);
      paintGhl(job, setup ? assetSummary(setup.counts) : '');
    } else paintGhl(job);
    if (['done', 'failed'].includes(job.status)) ghlJob = '';
    else ghlTimer = setTimeout(() => watchGhl(jobId), 2000);
  }
  async function openGhlImport() {
    stopGhl();
    const issued = await api('/api/agency/ghl-import-code', {});
    dialog('Importar do GHL', ghlImportBody({ code: issued.code, expiresAt: issued.expiresAt }), { wide: true, description: 'Traga o snapshot da sua agência no GHL como um setup do graao.' });
    for (const el of G('#dialog').querySelectorAll('[data-w]')) el.style.width = `${el.dataset.w}%`;
    ghlJob = issued.jobId;
    ghlTimer = setTimeout(() => watchGhl(issued.jobId), 2000);
  }

  // ---- Form fields -------------------------------------------------------
  const options = token => token === '@accounts' ? accounts().map(a => [a.id, a.name]) : token === '@modules' ? subAccountModules : token.map(v => [v, tr(v)]);
  function field([key, label, type, required, opts], value) {
    const req = required ? ' required' : '';
    const v = value ?? '';
    if (type === 'textarea') return `<label class="ag-full">${h(label)}<textarea name="${key}"${req}>${h(v)}</textarea></label>`;
    if (type === 'check') return `<label class="check"><input type="checkbox" name="${key}" ${v ? 'checked' : ''}> ${h(label)}</label>`;
    if (type === 'select') return `<label>${h(label)}<select name="${key}"${req}>${options(opts).map(([id, text]) => `<option value="${h(id)}" ${String(id) === String(v) ? 'selected' : ''}>${h(text)}</option>`).join('')}</select></label>`;
    if (type === 'multi') {
      const list = options(opts), chosen = Array.isArray(v) ? v : [];
      return `<fieldset class="ag-checks ag-full"><legend>${h(label)}</legend>${list.length ? list.map(([id, text]) => `<label class="check"><input type="checkbox" name="${key}" value="${h(id)}" ${chosen.includes(id) ? 'checked' : ''}> ${h(text)}</label>`).join('') : '<p class="dim">Nenhuma opção disponível.</p>'}</fieldset>`;
    }
    const kind = type === 'score' || type === 'number' ? 'number' : type;
    const range = type === 'score' ? ' min="0" max="10" step="1"' : type === 'number' ? ' min="0" step="0.01"' : '';
    return `<label>${h(label)}<input name="${key}" type="${kind}" value="${h(v)}"${range}${req}></label>`;
  }
  const fieldsFor = (key, row = {}) => `<div class="field-grid">${collections[key].fields.map(f => field(f, row[f[0]] ?? (f[2] === 'select' && f[3] ? undefined : ''))).join('')}</div>`;
  function editRecord(key, id = '', preset = {}) {
    const row = id ? D()[key].find(r => r.id === id) : preset;
    if (id && !row) return;
    const modes = [['', 'Legado (lista vazia herda todos)'], ['inherit', 'Herdar todos os módulos'], ['restricted', 'Somente módulos selecionados'], ['none', 'Nenhum módulo']];
    const access = key === 'users' ? `<label>Modo de acesso<select name="permissionMode">${modes.map(([mode, label]) =>
      `<option value="${mode}" ${(row.permissionMode || '') === mode ? 'selected' : ''}>${h(label)}</option>`).join('')}</select></label>` : '';
    dialog(`${id ? 'Editar' : 'Novo'} ${collections[key].label.toLowerCase()}`, fieldsFor(key, row) + access + (id ? `<button type="button" class="secondary danger ag-delete" data-ag="delete-record" data-key="${key}" data-id="${id}">${i('trash', 15)} Excluir</button>` : ''), { form: `record:${key}`, id, submit: id ? 'Salvar alterações' : 'Criar' });
  }
  function formData(form) {
    const fd = new FormData(form), out = {};
    for (const key of new Set(fd.keys())) {
      const all = fd.getAll(key);
      out[key] = form.querySelector(`input[type=checkbox][name="${CSS.escape(key)}"][value]`) ? all : all.at(-1);
    }
    for (const box of form.querySelectorAll('input[type=checkbox]')) {
      if (box.hasAttribute('value')) out[box.name] ??= [];
      else out[box.name] = box.checked;
    }
    return out;
  }

  // ---- Shell -------------------------------------------------------------
  const head = (title, desc = '', actions = '') => `<header class="page-head"><div><h1>${h(tr(title))}</h1>${desc ? `<p>${h(tr(desc))}</p>` : ''}</div><div class="head-actions">${actions}</div></header>`;
  const tabCard = (page, content, label = 'Seções') => utabs({
    key: `agency-${page}`,
    label,
    current: A.sub || subTabs[page][0][0],
    items: subTabs[page].map(([key, text]) => ({ value: key, label: text, attrs: `data-ag="tab" data-sub="${key}"` })),
    content
  });
  const btn = (label, ag, attrs = '', cls = 'secondary', ico = '') => `<button class="${cls}" data-ag="${ag}" ${attrs}>${ico ? i(ico, 15) : ''}${h(tr(label))}</button>`;
  const primary = (label, ag, attrs = '') => btn(label, ag, attrs, 'primary', 'plus');
  const empty = (title, text, cta = '') => `<div class="empty">${i('inbox', 26)}<strong>${h(tr(title))}</strong><p>${h(tr(text))}</p>${cta}</div>`;
  const table = (cols, rows, nothing) => `<div class="surface table-shell"><table><thead><tr>${cols.map(c => `<th scope="col">${h(tr(c))}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>${rows.length ? '' : nothing}</div>`;
  const metric = (label, value, note = '') => `<div class="surface metric"><span>${h(tr(label))}</span><b>${value}</b>${note ? `<small class="dim">${h(tr(note))}</small>` : ''}</div>`;
  const search = placeholder => `<label class="search">${i('search', 16)}<input data-ag-search value="${h(A.query)}" placeholder="${h(tr(placeholder))}" aria-label="${h(tr(placeholder))}" autocomplete="off"></label>`;
  const sw = (label, on, attrs, disabled = false) => `<label class="ag-sw"><input type="checkbox" role="switch" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''} ${attrs} aria-label="${h(label)}"><span aria-hidden="true"></span></label>`;
  const bar = (pct, cls = '') => `<span class="ag-bar ${cls}"><span data-w="${Math.max(0, Math.min(100, Math.round(pct)))}"></span></span>`;

  function shell(content) {
    const company = D().company;
    const session = A.data.access?.session;
    // Sem login (servidor local), "Agir como" vale também aqui: a faixa é a saída desse modo.
    const acting = !session && localStorage.getItem('go.user');
    const item = ([key, label, ico]) => ({ href: `#agency/${key}`, label: tr(label), icon: ico, current: A.page === key });
    const currentPageLabel = tr(A.page === 'plataforma' ? 'Plataforma' : A.page === 'ai-gateway' ? 'AI Gateway' : agencyNav.find(n => n[0] === A.page)?.[1] || 'Painel da agência');
    const navOf = group => agencyNav.filter(n => n[3] === group).map(item);
    // Ajuda junta os links externos (central de ajuda, comunidade) com as ideias e sugestões.
    const extras = {
      ajuda: [
        { href: helpCenterUrl, label: tr('Central de ajuda'), icon: 'book', external: true },
        ...navOf('ajuda'),
        { href: 'https://chat.whatsapp.com/IuU6twK8qf606ye5wvP638', label: tr('Comunidade'), icon: 'whatsapp', external: true }
      ]
    };
    return `<div class="shell ${A.navOpen ? 'wide' : ''} ag-shell">${sideHtml = sidebar({
      label: tr('Navegação da agência'),
      home: '#agency/dashboard',
      brand: brandName(),
      mark: logo,
      account: { name: company.name || tr('Minha Agência'), logo: company.logo || '', caption: tr('Agência · ir para subconta'), attr: 'data-ag="switch-account"', tip: tr('Trocar para uma subconta') },
      toggle: 'data-ag="nav"',
      open: A.navOpen,
      groups: [
        ...agencyNavGroups.map(([key, title]) => ({ title: tr(title), items: extras[key] || navOf(key) })),
        { title: tr('Atalhos'), items: D().menuLinks.filter(l => l.showOn !== 'Sub-accounts').map(l => ({ href: l.url, label: tr(l.title), icon: l.icon, external: true })) }
      ],
      // Plataforma: só o dono da plataforma vê (limites de Supabase, Vercel, Cloudflare, Hostinger…).
      footer: [
        ...(A.data.access?.platform ? [item(['plataforma', 'Plataforma', 'chart']), item(['ai-gateway', 'AI Gateway', 'spark'])] : []),
        ...navOf('rodape')
      ]
    })}
    <div class="workspace">${topbar({
      crumbs: [
        { label: company.name || tr('Agência'), href: '#agency/dashboard' },
        { label: currentPageLabel }
      ],
      search: 'data-act="search"',
      tools: [
        { icon: 'bell', label: tr('Notificações'), attr: 'data-act="notifications"' }
      ],
      profile: {
        text: initials(session?.name || company.name || D().profile.name || 'AG'),
        picture: session?.picture,
        label: session?.name || tr('Configurações da agência'),
        attr: session ? 'data-act="account" aria-haspopup="dialog"' : 'data-ag="go-profile"'
      }
    })}${acting ? `<div class="ag-banner acting" role="status"><b>Agindo como ${h(A.data.access?.name || '')}</b><span>Módulos e subcontas seguem as permissões deste usuário.</span><button class="secondary" data-act="stop-acting">Parar</button></div>` : ''}<main id="screen" class="screen${A.page === 'ask' ? ' screen-ask-chat' : ''}">${content}${rodapeHtml(brandName())}</main></div></div>`;
  }

  // ---- Pages -------------------------------------------------------------
  const pages = {};

  pages.ask = () => `<div class="sc-host" data-graao-chat-host></div>`;

  // ---- Brand groups: one report over several sub-accounts ----------------
  const groups = () => D().brandGroups || [];
  const groupLink = g => g.share?.id && (!g.share.expires || Date.parse(g.share.expires) > Date.now()) ? `${location.origin}/marcas/${g.share.id}` : '';
  pages['brand-groups'] = () => {
    const open = A.bg?.id && groups().find(g => g.id === A.bg.id);
    if (open) {
      const body = A.bg.error ? `<p class="form-status">${h(A.bg.error)}</p>` : A.bg.data ? brandGroupHtml(A.bg.data) : `<p class="dim">${h(tr('Consolidando as subcontas…'))}</p>`;
      return `<div class="page">${head(open.name, `${tr(groupPeriods[open.period] || groupPeriods[30])} · ${open.accountIds.length} subconta(s)`)}
        <div class="bg-toolbar">${btn('Voltar aos grupos', 'bg-back', '', 'secondary', 'left')}<span class="spacer"></span>${btn('Editar grupo', 'bg-edit', `data-id="${open.id}"`, 'secondary', 'edit')}
        ${btn('Compartilhar', 'bg-share', `data-id="${open.id}"`, 'secondary', 'link')}${btn('Exportar CSV', 'bg-csv', A.bg.data ? '' : 'disabled', 'secondary', 'download')}${btn('Imprimir / PDF', 'bg-print', A.bg.data ? '' : 'disabled', 'secondary', 'download')}</div>
        <section class="bg-report">${body}</section></div>`;
    }
    const card = g => `<article class="surface bg-group"><h2>${h(g.name)}</h2>
      <p class="dim">${h(tr(groupPeriods[g.period] || groupPeriods[30]))} · ${g.accountIds.length} subconta(s)${groupLink(g) ? ` · ${badge('Link ativo', 'green')}` : ''}</p>
      <p class="dim">${h(g.accountIds.map(accountName).slice(0, 6).join(', '))}${g.accountIds.length > 6 ? '…' : ''}</p>
      <div class="inline-gap">${btn('Ver relatório', 'bg-open', `data-id="${g.id}"`, 'primary', 'chart')}${btn('Editar', 'bg-edit', `data-id="${g.id}"`, 'secondary', 'edit')}${btn('Compartilhar', 'bg-share', `data-id="${g.id}"`, 'secondary', 'link')}${btn('Excluir', 'bg-delete', `data-id="${g.id}"`, 'secondary danger', 'trash')}</div></article>`;
    return `<div class="page">${head('Grupos de marcas', 'Consolide em um relatório os resultados das subcontas de um mesmo cliente, rede ou holding.', primary('Novo grupo', 'bg-new'))}
      ${groups().length ? `<div class="bg-groups">${groups().map(card).join('')}</div>` : empty('Nenhum grupo de marcas', 'Crie um grupo para comparar posts, contatos e vendas de várias subcontas lado a lado.', primary('Criar primeiro grupo', 'bg-new'))}</div>`;
  };
  function editGroup(id = '') {
    const g = id ? groups().find(row => row.id === id) : null;
    dialog(g ? 'Editar grupo de marcas' : 'Novo grupo de marcas', `<label>Nome do grupo<input name="name" value="${h(g?.name || '')}" maxlength="80" required placeholder="Ex.: Rede Padaria Sol"></label>
      <label>Período do relatório<select name="period">${Object.entries(groupPeriods).map(([v, label]) => `<option value="${v}" ${(g?.period || '30') === v ? 'selected' : ''}>${h(tr(label))}</option>`).join('')}</select></label>
      ${pickAccounts('accountIds', g?.accountIds || [])}`, { form: 'bg-save', id, submit: g ? 'Salvar grupo' : 'Criar grupo' });
  }
  function shareGroup(id) {
    const g = groups().find(row => row.id === id); if (!g) return;
    const link = groupLink(g), message = `Segue o relatório consolidado “${g.name}”, com os dados atualizados: ${link}`;
    dialog('Compartilhar grupo de marcas', `<div class="bg-share"><p>Quem tiver o link vê o relatório consolidado deste grupo, com dados atuais, sem login e sem acesso às subcontas.</p>
      ${link ? `<label>Link do relatório<input name="shareUrl" value="${h(link)}" readonly></label>
        <p class="dim">${g.share.expires ? `Válido até ${new Date(g.share.expires).toLocaleString(getLanguage() === 'es' ? 'es-419' : 'pt-BR')}` : 'Sem data de validade'}. Gerar outro invalida o link anterior.</p>
        <div class="inline-gap">${btn('Copiar link', 'copy', `data-text="${h(link)}"`, 'secondary', 'copy')}<a class="secondary" href="${h(link)}" target="_blank" rel="noopener">${i('site', 15)}Abrir</a>
        <a class="secondary" href="https://wa.me/?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">${i('whatsapp', 15)}WhatsApp</a>
        <a class="secondary" href="mailto:?subject=${encodeURIComponent(g.name)}&body=${encodeURIComponent(message)}">${i('mail', 15)}E-mail</a>${btn('Revogar link', 'bg-revoke', `data-id="${g.id}"`, 'secondary danger', 'close')}</div>` : ''}
      <div class="field-grid"><label>Validade<select name="days"><option value="7">7 dias</option><option value="30" selected>30 dias</option><option value="90">90 dias</option><option value="0">Sem validade</option></select></label>
      <label>Idioma<select name="lang"><option value="pt">Português</option><option value="es" ${g.share?.lang === 'es' ? 'selected' : ''}>Español</option></select></label></div></div>`,
      { form: 'bg-share', id, submit: link ? 'Gerar novo link' : 'Gerar link' });
  }
  async function openGroup(id) {
    A.bg = { id, data: null, error: '' }; render();
    try { const data = await call('brand-group-report', { id }); if (A.bg?.id === id) A.bg.data = data; }
    catch (e) { if (A.bg?.id === id) A.bg.error = e.message; }
    if (A.page === 'brand-groups') render();
  }

  pages.presentations = () => presentationsHtml(D(), {
    agency: D(),
    getAgency: D,
    act,
    dialog,
    closeDialog: close,
    flash
  });

  pages.prancheta = () => {
    const pranchetaCtx = {
      s: D(),
      agency: D(),
      query: A.query,
      mode: 'agency'
    };
    return pranchetaScreen(pranchetaCtx);
  };

  // ---- Central de IA (7.2): limits per sub-account, usage over a period, defaults ----
  const pct = value => `${Math.round(value * 100)}%`;
  const aiLimitsTab = () => {
    const all = accounts(), manage = A.data.access?.settings;
    const list = all.filter(a => match(a.name, a.id) && (!A.aiFilter || aiState(a) === A.aiFilter)).sort((a, b) => (b.aiCost || 0) - (a.aiCost || 0));
    const count = state => all.filter(a => aiState(a) === state).length;
    const row = a => {
      const state = aiState(a), used = a.aiLimit ? Math.min(100, (a.aiCost / a.aiLimit) * 100) : 0;
      const status = { off: badge('IA desligada'), nolimit: badge('Sem limite', 'blue'), blocked: badge('No limite', 'red'), near: badge('Perto do limite', 'gold'), ok: badge('Dentro do limite', 'green') }[state];
      return `<tr><td><b>${h(a.name)}</b><br><small class="dim">${h(a.id)}</small></td><td>${a.agents}</td>
        <td>${sw(tr('IA ligada nesta subconta'), a.aiEnabled, `data-ag-ai-access="${a.id}"`, !manage)}</td>
        <td>${a.aiResold ? badge('Carteira da subconta', 'blue') : badge('Agência')}</td>
        <td>${formatUsd(a.aiCost)}${a.aiLimit ? `<br>${bar(used, state === 'blocked' ? 'low' : '')}` : ''}</td>
        <td>${a.aiLimit ? `${formatUsd(a.aiLimit)}<br><small class="dim">${h(tr('alerta em'))} ${pct(a.aiAlertAt || 0.8)}</small>` : `<span class="dim">${h(tr('Sem limite'))}</span>`}</td>
        <td>${status}</td><td class="right">${manage ? btn('Editar limite', 'ai-limit', `data-id="${a.id}"`) : ''}</td></tr>`;
    };
    return `<p class="dim">${h(tr('Gasto estimado com IA neste mês, pelos preços públicos dos modelos (a fatura da OpenAI é a referência). Quando a subconta chega ao limite, os recursos de IA param até o mês virar ou o limite subir.'))}</p>
      <div class="metrics">${metric('Custo de IA no mês', formatUsd(O().totals.aiCost))}${metric('IA ligada', `${all.filter(a => a.aiEnabled).length} <small>/ ${all.length}</small>`)}${metric('Perto do limite', count('near'))}${metric('No limite', count('blocked'))}</div>
      <div class="toolbar">${search('Buscar por nome ou ID da subconta…')}<select data-ag-ai-filter aria-label="${h(tr('Filtrar subcontas'))}">${aiFilters.map(([v, label]) => `<option value="${v}" ${A.aiFilter === v ? 'selected' : ''}>${h(tr(label))}</option>`).join('')}</select>${btn('Editar padrões', 'tab', 'data-sub="setup"', 'secondary', 'gear')}</div>
      ${table(['Subconta', 'Agentes', 'IA', 'Cobrança', 'Uso no mês', 'Limite mensal', 'Situação', ''], list.map(row), empty('Nenhuma subconta encontrada', 'Mude a busca ou o filtro.'))}`;
  };
  const aiUsageTab = () => {
    const u = A.aiUsage || {}, period = A.aiPeriod || '30';
    const periods = `<div class="seg" role="group" aria-label="${h(tr('Período'))}">${aiPeriods.map(([v, label]) => btn(label, 'ai-period', `data-period="${v}" aria-pressed="${v === period}"`, 'seg-btn')).join('')}</div>`;
    if (u.error) return `${periods}<p class="form-status" role="alert">${h(u.error)}</p>${btn('Tentar de novo', 'ai-period', `data-period="${period}"`)}`;
    if (!u.data || u.period !== period) return `${periods}<p class="dim">${h(tr('Somando o uso de todas as subcontas…'))}</p>`;
    const d = u.data, t = d.totals, days = Object.entries(d.byDay), max = Math.max(0.000001, ...days.map(([, x]) => x.cost));
    const step = days.length > 31 ? 7 : days.length > 10 ? 3 : 1;
    const kindLabel = key => usageKinds.find(([k]) => k === key)?.[1] || key;
    const rank = (obj, label) => Object.entries(obj).sort((a, b) => b[1].cost - a[1].cost || b[1].calls - a[1].calls)
      .map(([key, x]) => `<tr><td>${h(tr(label(key)))}</td><td>${x.calls}</td><td>${formatTokens(x.inputTokens + x.outputTokens)}</td><td>${formatUsd(x.cost)}</td><td>${bar(t.cost ? (x.cost / t.cost) * 100 : 0)}</td></tr>`);
    return `${periods}
      ${d.partial ? `<p class="surface padded ag-notice">${i('alert', 18)} ${h(tr('Alguma subconta muito ativa guarda só o mês atual completo: os dias mais antigos do período podem estar incompletos.'))}</p>` : ''}
      <div class="metrics">${metric('Custo estimado', formatUsd(t.cost), `${day(d.from)} a ${day(d.to)}`)}${metric('Chamadas de IA', t.calls)}${metric('Tokens', formatTokens(t.inputTokens + t.outputTokens), `${formatTokens(t.inputTokens)} de entrada`)}${metric('Erros', t.errors)}</div>
      <section class="surface padded"><h2>${h(tr('Custo por dia'))}</h2><div class="ag-chart ag-ai-chart">${days.map(([date, x], index) => `<div class="ag-col" title="${h(date.split('-').reverse().join('/'))}: ${h(formatUsd(x.cost))} · ${x.calls} ${h(tr('chamadas'))}"><span class="ag-colbar">${x.cost > 0 ? `<span data-h="${(x.cost / max) * 100}"></span>` : ''}</span><small>${index % step === 0 ? h(date.slice(8, 10) + '/' + date.slice(5, 7)) : ''}</small></div>`).join('')}</div></section>
      <h2 class="section-heading">${h(tr('Por subconta'))}</h2>${table(['Subconta', 'Chamadas', 'Tokens', 'Custo', ''], d.byAccount.map(x => `<tr><td><b>${h(x.name)}</b></td><td>${x.calls}</td><td>${formatTokens(x.inputTokens + x.outputTokens)}</td><td>${formatUsd(x.cost)}</td><td>${bar(t.cost ? (x.cost / t.cost) * 100 : 0)}</td></tr>`), empty('Nenhum uso de IA no período', 'As chamadas de IA das subcontas aparecem aqui.'))}
      <div class="ag-two"><section><h2 class="section-heading">${h(tr('Por produto'))}</h2>${table(['Produto', 'Chamadas', 'Tokens', 'Custo', ''], rank(d.byKind, kindLabel), `<p class="dim table-none">${h(tr('Nenhum uso de IA no período'))}</p>`)}</section>
      <section><h2 class="section-heading">${h(tr('Por modelo'))}</h2>${table(['Modelo', 'Chamadas', 'Tokens', 'Custo', ''], rank(d.byModel, key => key), `<p class="dim table-none">${h(tr('Nenhum uso de IA no período'))}</p>`)}</section></div>`;
  };
  const aiSetupTab = () => {
    const def = D().aiDefaults || { limit: 0, alertAt: 0.8, enabled: true }, manage = A.data.access?.settings;
    const noLimit = accounts().filter(a => !a.aiLimit).length;
    return `<form class="surface settings-form set-form" data-ag-form="ai-defaults"><section class="set-section"><header class="set-head"><h2>${h(tr('Padrões para subcontas novas'))}</h2><p class="dim">${h(tr('Toda subconta criada a partir de agora começa com estes valores.'))}</p></header><div class="set-body"><label>${h(tr('Limite mensal de IA (US$)'))}<input name="limit" type="number" min="0" max="100000" step="0.01" value="${h(def.limit)}"><small class="dim">${h(tr('Use 0 para não limitar.'))}</small></label>
        <label>${h(tr('Avisar quando chegar a'))}<select name="alertAt">${aiAlertSteps.map(v => `<option value="${v}" ${Number(def.alertAt) === v ? 'selected' : ''}>${pct(v)} ${h(tr('do limite'))}</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" name="enabled" ${def.enabled !== false ? 'checked' : ''}> ${h(tr('IA ligada nas subcontas novas'))}</label></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary" ${manage ? '' : 'disabled'}>${h(tr('Salvar padrões'))}</button></footer></form>
      <section class="surface set-card"><div class="set-section"><header class="set-head"><h2>${h(tr('Aplicar o limite padrão agora'))}</h2><p class="dim">${h(tr('Leva o limite e o alerta padrão para as subcontas que já existem.'))}</p></header>
        <div class="set-body"><div class="inline-gap">${btn(`Subcontas sem limite (${noLimit})`, 'ai-apply', 'data-scope="unlimited"', 'secondary')}${btn('Todas as subcontas', 'ai-apply', 'data-scope="all"', 'secondary')}</div></div></div>
        <div class="set-section"><header class="set-head"><h2>${h(tr('Ligado à Central de IA'))}</h2></header><div class="set-body is-list">
        <a class="line-item" href="#agency/settings/openai"><span>${h(tr('Chave da OpenAI usada pelas subcontas'))}</span>${i('arrow', 15)}</a>
        <a class="line-item" href="#agency/saas/rebilling"><span>${h(tr('Revenda de IA com margem (carteira de créditos)'))}</span>${i('arrow', 15)}</a>
        <a class="line-item" href="#agency/settings/labs"><span>${h(tr('Recursos experimentais (Labs)'))}</span>${i('arrow', 15)}</a></div></div></section>`;
  };
  pages['ai-suite'] = () => {
    const sub = A.sub || 'limits';
    const body = sub === 'usage' ? aiUsageTab() : sub === 'setup' ? aiSetupTab() : aiLimitsTab();
    return `<div class="page">${head('Central de IA', 'Limites, uso e padrões de IA de todas as subcontas.')}${tabCard('ai-suite', body, 'Seções da Central de IA')}</div>`;
  };
  async function loadAiUsage(period = A.aiPeriod || '30') {
    A.aiPeriod = period; A.aiUsage = { period }; render();
    try { const data = await call('ai-usage', { period }); A.aiUsage = { period, data }; }
    catch (e) { A.aiUsage = { period, error: e.message }; }
    if (A.page === 'ai-suite' && A.sub === 'usage') render();
  }
  function editAiLimit(id) {
    const a = accounts().find(x => x.id === id); if (!a) return;
    dialog(`Limite de IA: ${a.name}`, `<div class="field-grid"><label>${h(tr('Limite mensal (US$)'))}<input name="limit" type="number" min="0" max="100000" step="0.01" value="${h(a.aiLimit || 0)}"></label>
      <label>${h(tr('Avisar quando chegar a'))}<select name="alertAt">${aiAlertSteps.map(v => `<option value="${v}" ${Number(a.aiAlertAt || 0.8) === v ? 'selected' : ''}>${pct(v)} ${h(tr('do limite'))}</option>`).join('')}</select></label></div>
      <p class="dim">${h(tr('Use 0 para não limitar. Gasto neste mês:'))} ${formatUsd(a.aiCost)}.</p>`, { form: 'ai-limit', id, submit: 'Salvar limite' });
  }

  // ---- Plataforma (admin geral, só o dono): limites dos serviços externos ----
  const isPlatformOwner = () => Boolean(A.data?.access?.platform);
  async function loadPlatform() {
    if (A.pfLoading || !isPlatformOwner()) return;
    A.pfLoading = true; A.pfError = '';
    try { A.pf = await api('/api/platform/usage'); }
    catch (e) { A.pfError = e.message; }
    finally { A.pfLoading = false; }
    if (A.page === 'plataforma' || A.page === 'dashboard') render();
  }
  pages.plataforma = () => {
    if (!isPlatformOwner()) return pages.dashboard();
    if (!A.pf && !A.pfError) { queueMicrotask(loadPlatform); return `<div class="page">${head('Plataforma', 'Conferindo os serviços…')}</div>`; }
    if (!A.pf) return `<div class="page">${head('Plataforma')}<div class="surface padded"><p class="form-status">${h(A.pfError)}</p>${btn('Tentar de novo', 'pf-reload')}</div></div>`;
    return platformPage(A.pf, { h, tr });
  };
  // AI Gateway (provedores, modelos, roteamento e custos da IA): também só o dono da plataforma.
  const aiGateway = createAiGatewayPanel({ api, h, tr, flash, utabs, rerender: () => { if (A.page === 'ai-gateway') render(); } });
  pages['ai-gateway'] = () => {
    if (!isPlatformOwner()) return pages.dashboard();
    aiGateway.install();
    return aiGateway.render();
  };
  async function enablePlatformPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw Error(tr('Este navegador não aceita notificações.'));
    const { key } = await api('/api/push/key');
    if (!key) throw Error(tr('As notificações ainda não foram configuradas no servidor (WEB_PUSH_PUBLIC_KEY).'));
    if (await Notification.requestPermission() !== 'granted') throw Error(tr('Permita as notificações nas configurações do navegador.'));
    const reg = await navigator.serviceWorker.register('/push/sw.js', { scope: '/push/' });
    const raw = atob((key + '='.repeat((4 - key.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, ch => ch.charCodeAt(0)) });
    A.pf = await api('/api/platform/push', { subscription: sub.toJSON() });
  }

  pages.dashboard = () => {
    const t = O().totals, growth = O().growth, max = Math.max(1, ...growth.map(g => g.total));
    const top = [...accounts()].sort((a, b) => b.contacts - a.contacts).slice(0, 8);
    if (isPlatformOwner() && !A.pf && !A.pfError) queueMicrotask(loadPlatform);
    return `<div class="page">${head('Painel da agência', `Boas-vindas, ${D().profile.first}. Métricas consolidadas das suas subcontas e registros da agência.`, primary('Criar subconta', 'new-account'))}
      ${isPlatformOwner() && A.pf ? platformBanner(A.pf, { h, tr }) : ''}
      ${D().abacatepay?.connected ? '' : `<div class="surface padded ag-notice">${i('pay', 20)}<div><b>Os KPIs de faturamento usam registros locais</b><p>A receita dos planos é calculada a partir do plano SaaS atribuído a cada subconta. Conecte o AbacatePay para cobrar as assinaturas por Pix ou cartão.</p></div><a class="secondary" href="#agency/settings/abacatepay">Conectar AbacatePay</a></div>`}
      <div class="metrics">${metric('Receita recorrente mensal (MRR)', money(t.mrr), 'Dos planos SaaS de contas ativas')}${metric('Subcontas ativas', `${t.active} <small>/ ${t.accounts}</small>`, `${t.paused} pausada(s) · ${t.closed} encerrada(s)`)}${metric('Novas neste mês', t.newThisMonth)}${metric('Planos SaaS cadastrados', D().plans.length, 'Disponíveis no Configurador SaaS')}</div>
      <div class="metrics">${metric('Contatos', t.contacts)}${metric('Oportunidades abertas', t.open)}${metric('Execuções de automação', t.runs)}${metric('Saldo da carteira', money(t.wallet))}</div>
      <div class="ag-two"><section class="surface padded"><h2>Crescimento de subcontas</h2><p class="dim">Total de subcontas acumuladas no final de cada mês</p><div class="ag-chart">${growth.map(g => `<div class="ag-col"><b>${g.total}</b><span class="ag-colbar"><span data-h="${(g.total / max) * 100}"></span></span><small>${h(g.month.slice(5))}/${h(g.month.slice(2, 4))}</small></div>`).join('')}</div></section>
      <section class="surface padded"><h2>Configuração da agência</h2>${[['Identidade da marca', D().company.domain || D().company.logo, 'settings/company'], ['Primeiro setup', D().snapshots.length, 'snapshots'], ['Planos SaaS', D().plans.length, 'saas/plans'], ['Membros da equipe', D().users.length, 'settings/users'], ['Programa de afiliados', D().affiliate.accepted, 'affiliate']].map(([label, done, page]) => `<a class="line-item" href="#agency/${page}"><span>${done ? badge('Concluído', 'green') : badge('Pendente')} ${h(label)}</span>${i('arrow', 15)}</a>`).join('')}</section></div>
      <h2 class="section-heading">Subcontas por atividade</h2>${table(['Subconta', 'Status', 'Plano', 'Contatos', 'Negócios abertos', 'Último acesso', ''], top.map(a => `<tr><td><b>${h(a.name)}</b></td><td>${badge(a.status, tone(a.status))}</td><td>${h(a.plan || '—')}</td><td>${a.contacts}</td><td>${a.open}</td><td>${day(a.lastLogin, true)}</td><td class="right">${btn('Acessar', 'open-account', `data-id="${a.id}"`)}</td></tr>`), empty('Nenhuma subconta cadastrada', 'Crie uma subconta para acompanhar as métricas aqui.'))}</div>`;
  };

  pages.prospecting = () => prospecting.render(A.sub);

  function prospectReport(p) {
    const rows = auditAreas.map(([k, label]) => [label, p[`score_${k}`]]);
    return `<div class="ag-report"><p class="dim">${h(p.category || 'Empresa')} · ${h(p.city || '')}</p><h3>${h(p.name)}</h3>${rows.map(([label, v]) => `<div class="ag-score"><span>${h(label)}</span>${v === null || v === undefined ? '<span class="dim">Não avaliado</span>' : `${bar(v * 10, v < 5 ? 'low' : '')}<b>${v}/10</b>`}</div>`).join('')}${p.notes ? `<p>${h(p.notes)}</p>` : ''}</div>`;
  }
  function reportHtml(p) {
    const rows = auditAreas.map(([k, label]) => `<tr><td>${h(label)}</td><td>${p[`score_${k}`] ?? 'Não avaliado'}</td></tr>`).join('');
    return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Auditoria · ${h(p.name)}</title><style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#101828}table{width:100%;border-collapse:collapse}td{border-bottom:1px solid #e2e7ef;padding:10px}</style><p>${h(D().company.name)}</p><h1>Auditoria de presença online: ${h(p.name)}</h1><p>${h(p.website || '')}</p><table>${rows}</table><p>${h(p.notes || '')}</p></html>`;
  }

  pages.accounts = () => {
    const list = accounts().filter(a => match(a.name, a.address, a.phone, a.email) && (!A.status || a.status === A.status));
    const canManage = A.data.access?.settings;
    return `<div class="page">${head('Subcontas', `${accounts().length} subconta(s) cadastradas`, primary('Criar subconta', 'new-account'))}
      <div class="toolbar">${search('Buscar subcontas…')}<select data-ag-status aria-label="Filtrar por status"><option value="">Todos os status</option>${['Active', 'Paused', 'Closed'].map(s => `<option value="${s}" ${A.status === s ? 'selected' : ''}>${tr(s)}</option>`).join('')}</select>
      <label class="check"><input type="checkbox" data-ag-all ${list.length && list.every(a => A.selected.has(a.id)) ? 'checked' : ''}> Selecionar todas</label>
      ${A.selected.size ? `<span class="badge blue">${A.selected.size} selecionada(s)</span>${canManage ? btn('Alterar status', 'bulk-status') : ''}${btn('Carregar setup', 'bulk-snapshot')}` : ''}</div>
      <div class="ag-accounts">${list.map(a => {
        const active = a.status === 'Active';
        const reason = D().accounts[a.id]?.suspendedReason;
        return `<article class="surface padded ag-account"><label class="check ag-pick"><input type="checkbox" data-ag-pick="${a.id}" ${A.selected.has(a.id) ? 'checked' : ''} aria-label="Selecionar ${h(a.name)}"></label>
        <div class="ag-account-main"><h2>${h(a.name)}</h2><div class="inline-gap">${badge(a.status, tone(a.status))}${a.plan ? badge(a.plan, 'blue') : ''}</div><p class="dim">${h(a.address || 'Sem endereço')} · ${h(a.phone || 'Sem telefone')}</p></div>
        <dl class="ag-facts"><div><dt>Criada em</dt><dd>${day(a.created)}</dd></div><div><dt>Último acesso</dt><dd>${a.lastLogin ? day(a.lastLogin, true) : 'N/A'}</dd></div><div><dt>Contatos</dt><dd>${a.contacts}</dd></div><div><dt>Negócios abertos</dt><dd>${a.open}</dd></div></dl>
        ${!active && reason ? `<p class="dim">${h(reason)}</p>` : ''}
        <div class="inline-gap">${active || canManage ? btn(active ? 'Acessar subconta' : 'Abrir suporte', 'open-account', `data-id="${a.id}"`, 'primary') : ''}
        ${canManage ? btn('Editar', 'edit-account', `data-id="${a.id}"`) : ''}
        ${canManage && !active ? btn('Reativar', 'reactivate-account', `data-id="${a.id}"`) : ''}
        ${canManage ? btn('Excluir', 'trash-account', `data-id="${a.id}"`, 'danger') : ''}</div></article>`;
      }).join('') || empty('Nenhuma subconta encontrada', 'Tente outros termos de busca ou limpe os filtros.')}</div>
      ${D().plans.length ? '' : `<p class="dim ag-hint">Dica: crie planos SaaS no Configurador SaaS para atribuir um plano e precificação a cada subconta.</p>`}
      ${canManage ? trashSection() : ''}</div>`;
  };

  // Lixeira: subcontas excluídas ficam encerradas por 30 dias e podem voltar; depois os dados são apagados de vez.
  function trashSection() {
    const trash = A.data.trash || [];
    if (!trash.length) return '';
    const left = at => Math.max(0, Math.ceil((Date.parse(at) - Date.now()) / 86_400_000));
    return `<section class="ag-trash" aria-labelledby="ag-trash-title"><h2 id="ag-trash-title">Lixeira</h2>
      <p class="dim">Subcontas excluídas ficam aqui por 30 dias, sem acesso e sem automações. Depois disso, os dados são apagados de vez.</p>
      <div class="ag-accounts">${trash.map(t => {
        const days = left(t.purgeAt);
        return `<article class="surface padded ag-account"><div class="ag-account-main"><h2>${h(t.name)}</h2><p class="dim">Excluída em ${day(t.deletedAt, true)} por ${h(t.deletedBy)}</p></div>
        <dl class="ag-facts"><div><dt>Apagada de vez em</dt><dd>${days ? `${days} dia${days === 1 ? '' : 's'}` : 'menos de 1 dia'}</dd></div></dl>
        <div class="inline-gap">${btn('Restaurar', 'restore-account', `data-id="${t.id}" data-name="${h(t.name)}"`)}</div></article>`;
      }).join('')}</div></section>`;
  }

  function accountForm(preset = {}) {
    const snaps = D().snapshots;
    return `<div class="field-grid"><label>Nome da empresa<input name="name" required maxlength="70" value="${h(preset.name || '')}"></label><label>E-mail<input name="email" type="email" value="${h(preset.email || '')}"></label>
      ${phoneField({ name: 'phone', label: 'Telefone', value: preset.phone || '', id: 'ag-preset-phone' })}<label>Endereço<input name="address" value="${h(preset.address || '')}"></label>
      <label>Fuso horário<select name="timezone">${['America/Sao_Paulo', 'America/New_York', 'Europe/London', 'UTC'].map(z => `<option>${z}</option>`).join('')}</select></label>
      <label>Moeda<input readonly value="Real brasileiro (BRL)"></label>
      ${preset.templateId ? `<input type="hidden" name="templateId" value="${h(preset.templateId)}"><label>Template de setup<input readonly value="${h(preset.templateName || '')}"></label>` : ''}<label ${preset.templateId ? 'hidden' : ''}>Setup inicial<select name="snapshotId"><option value="">Começar em branco</option>${snaps.map(s => `<option value="${s.id}" ${preset.snapshotId === s.id ? 'selected' : ''}>${h(s.name)}</option>`).join('')}</select></label>
      <label>Plano SaaS<select name="plan"><option value="">Sem plano</option>${D().plans.map(p => `<option value="${p.id}">${h(p.name)} · ${money(p.price)}/mês</option>`).join('')}</select></label></div>`;
  }

  const assetLabelsPt = {
    pipelines: 'Pipelines', stages: 'Etapas', workflows: 'Workflows', forms: 'Formulários', pages: 'Páginas',
    snippetFolders: 'Pastas de snippets', snippets: 'Snippets', triggerLinks: 'Links de gatilho',
    courses: 'Cursos', agents: 'Agentes de IA', studioProjects: 'Sites do Studio', workflowFolders: 'Pastas de workflow',
    customFields: 'Campos personalizados', customValues: 'Valores personalizados', tags: 'Tags', services: 'Calendários',
    knowledgeBases: 'Bases de conhecimento', emailTemplates: 'Modelos de e-mail', documentTemplates: 'Contratos e documentos',
    chatWidgets: 'Chat widgets', brandBoards: 'Brand boards'
  };
  // Collections that follow the records using them and never show up on their own in the asset picker.
  const snapshotHelperKeys = ['stages', 'workflowFolders', 'snippetFolders'];
  const linkedAccounts = snapId => new Set(D().snapshotLoads.filter(l => l.snapshotId === snapId).map(l => l.workspace));
  const snapRowName = row => row.name || row.title || row.key || 'Sem nome';
  const assetSummary = counts => Object.entries(counts || {}).filter(([, n]) => n).map(([k, n]) => `${n} ${(assetLabelsPt[k] || snapshotAssets.find(a => a[0] === k)?.[1] || k).toLowerCase()}`).join(' · ') || 'Sem recursos';
  const assetChips = counts => Object.entries(counts || {}).filter(([k, n]) => n && k !== 'stages' && k !== 'snippetFolders' && k !== 'workflowFolders').slice(0, 5)
    .map(([k, n]) => `<span class="ag-mkt-chip">${n} ${h((assetLabelsPt[k] || k).toLowerCase())}</span>`).join('');

  // GHL-style library table: name with verified badge, version, date, then + (new sub-account), rename, load and a ⋮ menu.
  const verified = '<svg class="ag-verified" viewBox="0 0 16 16" role="img" aria-label="Verificado"><path d="M8 1.5l5 1.8v3.9c0 3.3-2.2 5.7-5 7.3-2.8-1.6-5-4-5-7.3V3.3z"/><path d="M5.6 8.1l1.7 1.7 3.2-3.3"/></svg>';
  const categorySegments = {
    'Saúde e Estética': 'beauty', 'Imobiliário': 'realestate', 'Agências e Serviços': 'agency', 'Educação e Infoprodutos': 'coaching', 'Negócios Locais': 'home',
    'E-commerce': 'other', 'B2B e SaaS': 'agency', 'Outro': 'other', 'Automotivo': 'auto', 'Beleza e Moda': 'beauty', 'Negócios, Coaching e Consultoria': 'coaching',
    'Criativo': 'creative', 'Finanças': 'finance', 'Saúde e Bem-estar': 'health', 'Serviços Residenciais': 'home', 'Seguros': 'insurance', 'Jurídico': 'legal',
    'Agências e Marketing': 'agency', 'Clínicas e Saúde': 'medical', 'Outros Serviços': 'other', 'Restaurantes e Bares': 'food', 'Viagem e Hospitalidade': 'travel'
  };
  const setupCategory = s => s.marketplaceCategory || (s.kind === 'mine' ? 'Setup da agência' : s.kind === 'imported' ? (s.origin === 'ghl' ? 'Importado do GHL' : 'Importado por código') : 'Marketplace');
  const setupSegment = s => s.marketplaceSegment || categorySegments[s.marketplaceCategory] || (s.kind === 'mine' ? 'agency' : 'other');
  // Search, category filter and grid/list switch shared by the setup galleries (scope keeps each tab's choices apart).
  function galleryToolbar(scope, cats, placeholder, extra = '') {
    const view = A.galView?.[scope] === 'list' ? 'list' : 'grid', cat = A.galCat?.[scope] || '';
    return `<div class="toolbar ag-tpl-toolbar">${search(placeholder)}
      <div class="inline-gap">${extra}<label class="ag-tpl-filter">${i('filter', 15)}<select data-ag-gal-category="${scope}" aria-label="Filtrar por categoria"><option value="">Todas as categorias</option>${cats.map(c => `<option ${cat === c ? 'selected' : ''}>${h(c)}</option>`).join('')}</select></label>
      <div class="ag-seg" role="group" aria-label="Visualização">${[['grid', 'grid', 'Grade'], ['list', 'list', 'Lista']].map(([v, ico, l]) => `<button class="icon-btn${view === v ? ' on' : ''}" data-ag="gal-view" data-scope="${scope}" data-view="${v}" aria-pressed="${view === v}" aria-label="${l}" title="${l}">${i(ico, 16)}</button>`).join('')}</div></div></div>`;
  }
  function setupGallery(list) {
    const rows = list.filter(s => match(s.name, s.marketplaceAuthor, setupCategory(s)));
    if (!rows.length) return empty('Nenhum setup encontrado', 'Tente outro nome ou limpe o filtro de categoria.');
    return `<div class="ag-tpl-grid">${rows.map(s => `<button class="ag-tpl-card" data-ag="setup-open" data-id="${s.id}">
      <span class="ag-tpl-top"><span class="ag-tpl-badge">${h(setupCategory(s))}</span><span class="ag-ver">v${s.version || 1}</span></span>
      ${setupArt(setupSegment(s), s.id, s.name)}
      <span class="ag-tpl-name">${s.official || s.kind === 'marketplace' ? verified : ''}${h(s.name)}</span>
      ${s.shared || s.protected ? `<span class="ag-tpl-flags">${s.shared ? '<span class="badge green">Compartilhado</span>' : ''}${s.protected ? '<span class="badge blue">Protegido</span>' : ''}</span>` : ''}
    </button>`).join('')}</div>`;
  }
  function libraryTable(list, mine, withSearch = true) {
    const dateOf = s => mine ? s.created || s.updated : s.importedAt || s.created || s.updated;
    const dir = A.snapSort === 'asc' ? 1 : -1;
    const rows = list.filter(s => match(s.name, s.marketplaceAuthor, s.marketplaceCategory)).sort((a, b) => dir * String(dateOf(a) || '').localeCompare(String(dateOf(b) || '')));
    const publishedIds = new Set(M().filter(item => item.mine && item.sourceSnapshotId).map(item => item.sourceSnapshotId));
    const kebab = s => {
      const items = [['copy', 'Copiar ID do setup', `data-text="${h(s.id)}"`], ['snapshot-history', 'Ver histórico', `data-id="${s.id}"`],
        s.protected ? null : ['snapshot-share', s.shared ? 'Código de compartilhamento' : 'Compartilhar por código', `data-id="${s.id}"`],
        s.kind === 'mine' && s.workspace ? ['snapshot-refresh', 'Atualizar a partir da subconta', `data-id="${s.id}"`] : null,
        ['snapshot-delete', 'Excluir setup', `data-id="${s.id}"`, 'danger']].filter(Boolean);
      return `<details class="ag-kebab"><summary class="icon-btn" aria-label="Mais ações para ${h(s.name)}" title="Mais ações">${i('dots', 16)}</summary><div class="ag-kebab-menu" role="menu">${items.map(([ag, label, attrs, cls]) => `<button type="button" role="menuitem" class="${cls || ''}" data-ag="${ag}" ${attrs}>${h(label)}</button>`).join('')}</div></details>`;
    };
    const icon = (ag, ico, label, s) => `<button class="icon-btn" data-ag="${ag}" data-id="${s.id}" aria-label="${h(label)}: ${h(s.name)}" title="${h(label)}">${i(ico, 16)}</button>`;
    return `${withSearch ? `<div class="toolbar">${search('Nome do setup')}</div>` : ''}
      <div class="surface table-shell ag-lib"><table><thead><tr><th scope="col">Nome do setup</th><th scope="col">Versão</th><th scope="col"><button class="ag-sort" data-ag="snap-sort" aria-label="Ordenar por data">${mine ? 'Criado em' : 'Importado em'} ${i(dir === 1 ? 'arrowUp' : 'arrowDown', 13)}</button></th><th scope="col" class="right">Ações</th></tr></thead>
      <tbody>${rows.map(s => {
        const linked = linkedAccounts(s.id).size;
        const badges = [s.official || s.kind === 'marketplace' ? verified : '', s.shared ? '<span class="badge green">Compartilhado</span>' : '', s.protected ? '<span class="badge blue">Protegido</span>' : '', publishedIds.has(s.id) ? '<span class="badge">No marketplace</span>' : ''].join('');
        const origin = s.kind === 'marketplace' ? `${s.official ? 'Graao' : h(s.marketplaceAuthor || 'Marketplace')}${s.marketplaceCategory ? ` · ${h(s.marketplaceCategory)}` : ''}` : s.kind === 'imported' ? (s.origin === 'ghl' ? 'Importado do GHL' : 'Importado por código') : (s.workspace ? h(accountName(s.workspace)) : 'Setup da agência');
        return `<tr><td><div class="ag-lib-name"><b>${h(s.name)}</b>${badges}</div><small class="dim">${origin} · ${linked ? `${linked} subconta(s) vinculada(s)` : 'nenhuma subconta vinculada'} · ${h(assetSummary(s.counts))}</small></td>
          <td><span class="ag-ver">v${s.version || 1}</span></td><td>${day(dateOf(s), true)}</td>
          <td class="right"><div class="ag-lib-actions">${icon('snapshot-account', 'plus', 'Criar subconta com este setup', s)}${icon('snapshot-rename', 'edit', 'Renomear', s)}${icon('snapshot-load', 'upload', 'Carregar em subcontas', s)}${kebab(s)}</div></td></tr>`;
      }).join('')}</tbody></table>${rows.length ? '' : '<p class="dim padded">Nenhum setup com esse nome.</p>'}</div>`;
  }
  // The audit log has its own endpoint: a page at a time, and the search is made on the server (the whole log, not the
  // page on screen). `trail` holds the cursor of each page already opened.
  const AUDIT_FRESH = 15000;
  let audit = { q: null, trail: [''], entries: [], next: '', at: 0, error: '', busy: false }, auditTimer = 0;
  const onAudit = () => location.hash.startsWith('#agency/settings/audit');
  const auditPage = (q, before, limit = '') => api(`/api/agency/audit?${new URLSearchParams({ q, before, limit })}`);
  function scheduleAudit() {
    const typing = audit.q !== null && audit.q !== A.query;
    if (audit.q !== A.query) audit = { ...audit, q: A.query, trail: [''], entries: [], next: '', at: 0, error: '', busy: true };
    else if (audit.busy) return;
    clearTimeout(auditTimer);
    auditTimer = setTimeout(() => loadAudit(), typing ? 300 : 0);
  }
  async function loadAudit(trail = audit.trail) {
    audit = { ...audit, trail, busy: true };
    const mine = audit;
    try {
      const page = await auditPage(mine.q || '', trail.at(-1));
      mine.entries = page.entries; mine.next = page.next; mine.error = '';
    } catch (e) { mine.entries = []; mine.next = ''; mine.error = e.message; }
    mine.busy = false; mine.at = Date.now();
    if (mine !== audit || !onAudit()) return;
    const field = G('[data-ag-search]'), focused = field && field === document.activeElement ? field.selectionStart : -1;
    render();
    if (focused >= 0) { const next = G('[data-ag-search]'); next?.focus(); next?.setSelectionRange(focused, focused); }
  }
  async function exportAudit() {
    const rows = [], cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    for (let before = '', pages = 0; pages < 40; pages++) {
      const page = await auditPage(A.query, before, 500);
      rows.push(...page.entries);
      before = page.next;
      if (!before) break;
    }
    download('auditoria-agencia.csv', ['Data,Usuario,Acao,Alvo,Detalhes', ...rows.map(a => [a.at, a.actor, a.action, a.target, a.details].map(cell).join(','))].join('\n'), 'text/csv');
  }
  async function loadTemplates() {
    if (A.templatesLoading) return;
    A.templatesLoading = true;
    try { A.templates = (await api('/api/agency/setup-templates', {})).result || []; }
    catch (e) { A.templates = []; flash(e.message, true); }
    finally { A.templatesLoading = false; }
    if (location.hash.startsWith('#agency/snapshots/templates')) render();
  }

  pages.snapshots = () => {
    const sub = ['mine', 'imported', 'templates', 'history'].includes(A.sub) ? A.sub : 'mine';
    const actions = `${btn('Importar do GHL', 'ghl-import', '', 'secondary', 'download')}${btn('Importar setup', 'snapshot-import', '', 'secondary', 'download')}${primary('Criar setup', 'snapshot-create')}`;

    if (sub === 'history') {
      return `<div class="page">${head('Setups de conta', 'Crie e gerencie seus setups', actions)}${tabCard('snapshots', table(['Setup', 'Subconta', 'Modo', 'Adicionados', 'Sobrescritos', 'Ignorados', 'Carregado em'], [...D().snapshotLoads].reverse().map(l => `<tr><td><b>${h(l.snapshot)}</b></td><td>${h(l.account)}</td><td>${l.mode === 'overwrite' ? 'Sobrescrever' : 'Manter existentes'}${l.partial ? ' · seleção' : ''}</td><td>${l.added}</td><td>${l.overwritten}</td><td>${l.skipped}</td><td>${day(l.at, true)}</td></tr>`), empty('Nenhum carregamento registrado', 'Ao carregar um setup em uma subconta, o histórico aparecerá aqui.')), 'Seções de setups')}</div>`;
    }

    if (sub === 'mine' || sub === 'imported') {
      const mine = sub === 'mine';
      const list = D().snapshots.filter(s => mine ? s.kind === 'mine' : s.kind !== 'mine');
      const emptyHtml = mine
        ? `<div class="surface padded ag-explain"><h2>Para que servem os setups de conta</h2><ul><li><b>Reutilização:</b> empacote pipelines, automações, formulários, páginas, agentes de IA e sites da sua melhor subconta.</li><li><b>Consistência:</b> carregue o mesmo setup em cada novo cliente em poucos cliques.</li><li><b>Templates:</b> comece por um dos templates prontos por segmento.</li><li><b>Segurança:</b> contatos, conversas e pagamentos nunca entram no setup.</li></ul><div class="inline-gap">${primary('Criar setup', 'snapshot-create')}${btn('Ver templates de setup', 'go-templates')}</div></div>`
        : `<div class="surface padded ag-explain"><h2>Nenhum setup importado ainda</h2><p class="dim">Setups que você importar por código, trouxer do GHL ou salvar a partir dos templates aparecem aqui.</p><div class="inline-gap">${primary('Importar setup', 'snapshot-import')}${btn('Importar do GHL', 'ghl-import', '', 'secondary', 'download')}${btn('Ver templates de setup', 'go-templates')}</div></div>`;
      const cat = A.galCat?.[sub] || '', shown = list.filter(s => !cat || setupCategory(s) === cat);
      const body = list.length ? `${galleryToolbar(sub, [...new Set(list.map(setupCategory))], 'Nome do setup')}${A.galView?.[sub] === 'list' ? libraryTable(shown, mine, false) : setupGallery(shown)}` : emptyHtml;
      return `<div class="page">${head('Setups de conta', 'Crie e gerencie seus setups', actions)}${tabCard('snapshots', `<div class="ag-snap-head"><h2>${mine ? 'Meus setups' : 'Setups importados'}</h2><p class="dim">${mine ? 'Setups criados por você aparecem aqui' : 'Setups importados por você aparecem aqui'}</p></div>${body}`, 'Seções de setups')}</div>`;
    }

    if (sub === 'templates') {
      if (!A.templates) {
        loadTemplates();
        return `<div class="page">${head('Setups de conta', 'Crie e gerencie seus setups', actions)}${tabCard('snapshots', '<p class="dim" role="status">Carregando templates…</p>', 'Seções de setups')}</div>`;
      }
      const intro = '<div class="ag-snap-head"><h2>Templates de setup</h2><p class="dim">Templates de setup são usados para criar novas subcontas</p></div>';
      if (!A.templates.length) return `<div class="page">${head('Setups de conta', 'Crie e gerencie seus setups', actions)}${tabCard('snapshots', `${intro}${empty('Nenhum template disponível', 'Crie um setup em Meus setups para reutilizar em novas subcontas.')}`, 'Seções de setups')}</div>`;
      const cats = [...new Set(A.templates.map(t => t.category))];
      const list = A.templates.filter(t => (!A.tplCategory || t.category === A.tplCategory) && match(t.title, t.category, ...(t.tags || [])));
      const view = A.tplView === 'list' ? 'list' : 'grid';
      const toolbar = `<div class="toolbar ag-tpl-toolbar">${search('Nome do template')}
        <div class="inline-gap"><label class="ag-tpl-filter">${i('filter', 15)}<select data-ag-tpl-category aria-label="Filtrar por segmento"><option value="">Todos os segmentos</option>${cats.map(c => `<option ${A.tplCategory === c ? 'selected' : ''}>${h(c)}</option>`).join('')}</select></label>
        <div class="ag-seg" role="group" aria-label="Visualização">${[['grid', 'grid', 'Grade'], ['list', 'list', 'Lista']].map(([v, ico, l]) => `<button class="icon-btn${view === v ? ' on' : ''}" data-ag="tpl-view" data-view="${v}" aria-pressed="${view === v}" aria-label="${l}" title="${l}">${i(ico, 16)}</button>`).join('')}</div></div></div>`;
      const cards = view === 'grid'
        ? `<div class="ag-tpl-grid">${list.map(t => `<button class="ag-tpl-card" data-ag="template-open" data-id="${t.id}"><span class="ag-tpl-badge">${h(t.category)}</span>${setupArt(t.segment, t.id, t.title)}<span class="ag-tpl-name">${h(t.title)}</span></button>`).join('')}</div>`
        : table(['Template', 'Segmento', 'Recursos', ''], list.map(t => `<tr><td><div class="ag-tpl-row">${setupArt(t.segment, t.id, t.title)}<b>${h(t.title)}</b></div></td><td><span class="ag-tpl-badge">${h(t.category)}</span></td><td><small>${h(assetSummary(t.counts))}</small></td>
            <td class="right inline-gap">${btn('Detalhes', 'template-open', `data-id="${t.id}"`)}${btn('Criar subconta', 'template-account', `data-id="${t.id}"`, 'primary', 'plus')}</td></tr>`));
      const body = `${intro}${toolbar}${list.length ? cards : empty('Nenhum template encontrado', 'Tente outro nome ou limpe o filtro de segmento.')}`;
      return `<div class="page">${head('Setups de conta', 'Crie e gerencie seus setups', actions)}${tabCard('snapshots', body, 'Seções de setups')}</div>`;
    }

  };

  pages.reselling = () => {
    location.replace('#agency/saas/rebilling');
    return '';
  };

  // SaaS → Rebilling da carteira (7.1): what the agency pays and the markup per metered product, which sub-accounts
  // are rebilled, each wallet's balance, usage and profit this month, and a manual credit or debit.
  const unitPrice = n => n >= 1 ? money(n) : `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
  function rebillingPage(s) {
    const list = accounts().filter(a => match(a.name));
    const rebilled = accounts().filter(a => (s.rebill?.[a.id] || []).length);
    const sum = key => rebilled.reduce((t, a) => t + (key === 'balance' ? a.wallet?.balance || 0 : a.wallet?.month?.[key] || 0), 0);
    const gateway = D().abacatepay?.connected;
    const others = rebillProducts.filter(([key]) => !walletProducts.some(([k]) => k === key));
    const prices = walletProducts.map(([key, label, unit, fallback, charged]) => {
      const cost = s.unitCosts?.[key] ?? fallback, markup = s.rebilling[key] ?? 1;
      return `<tr><th scope="row">${h(label)}</th><td><label class="ag-inline">R$ <input name="cost_${key}" type="number" min="0" max="1000" step="0.0001" required value="${cost}" aria-label="Custo de ${h(label)}"></label><small class="dim">${h(unit)}</small></td>
        <td><label class="ag-inline"><input name="${key}" type="number" min="1" max="${maxMarkup}" step="0.01" required value="${markup}" aria-label="Markup de ${h(label)}"> ×</label></td>
        <td>${unitPrice(cost * markup)} <small class="dim">${key === 'email' ? 'por 1.000 e-mails' : key === 'ai' ? 'por US$ 1 de consumo' : 'por mensagem'}</small></td></tr>`;
    }).join('');
    return `<div class="metrics">${metric('Subcontas com revenda', `${rebilled.length} <small>/ ${accounts().length}</small>`)}${metric('Saldo nas carteiras', money(sum('balance')))}${metric('Cobrado no mês', money(sum('amount')), `Custo ${money(sum('cost'))}`)}${metric('Lucro no mês', money(sum('profit')))}</div>
      <form class="surface settings-form set-form" data-ag-form="saas-rebilling"><section class="set-section"><header class="set-head"><h2>Preços de revenda</h2><p class="dim">Informe quanto a agência paga por unidade e o markup (1× repassa sem margem; até ${maxMarkup}×). O uso das subcontas com revenda ligada é descontado da carteira delas pelo preço final.</p></header><div class="set-body"><div class="table-shell"><table><thead><tr><th scope="col">Produto</th><th scope="col">Seu custo</th><th scope="col">Markup</th><th scope="col">Cliente paga</th></tr></thead><tbody>${prices}</tbody></table></div>
        ${others.map(([key]) => `<input type="hidden" name="${key}" value="${s.rebilling[key]}">`).join('')}
        <label>Avisar quando o saldo ficar abaixo de (R$)<input name="lowBalance" type="number" min="0" max="100000" step="1" value="${s.lowBalance ?? 20}"></label>
        <p class="dim">Telefonia e Voice AI entram quando o provedor de telefonia for decidido (decisão D1). Com saldo zerado, a IA da subconta para; e-mails e WhatsApp continuam e o saldo fica negativo.</p></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Salvar preços</button></footer></form>
      <section class="surface padded"><div class="page-head"><div><h2>Carteiras das subcontas</h2><p class="dim">${gateway ? 'Os clientes podem recarregar por Pix ou cartão em Configurações → Carteira; o valor cai na conta AbacatePay da agência.' : 'Conecte o AbacatePay da agência para os clientes recarregarem por Pix. Até lá, lance os créditos aqui.'}</p></div>${gateway ? badge('Recarga por Pix ativa', 'green') : `<a class="secondary" href="#agency/settings/abacatepay">Conectar AbacatePay</a>`}</div>
        <div class="toolbar">${search('Buscar subcontas…')}</div>
        ${table(['Subconta', ...walletProducts.map(([, label]) => label.split(' (')[0]), 'Saldo', 'Cobrado no mês', 'Lucro no mês', ''], list.map(a => {
          const on = s.rebill?.[a.id] || [], w = a.wallet || { balance: 0, month: { amount: 0, profit: 0 } };
          return `<tr><td><b>${h(a.name)}</b></td>${walletProducts.map(([key, label]) => `<td>${sw(`Revender ${label} em ${a.name}`, on.includes(key), `data-ag-rebill="${a.id}" data-product="${key}"`)}</td>`).join('')}
            <td>${on.length ? `<b class="${w.balance < 0 ? 'ag-negative' : ''}">${money(w.balance)}</b>${w.low ? ` ${badge('Saldo baixo', 'pink')}` : ''}` : '<span class="dim">—</span>'}</td><td>${on.length ? money(w.month.amount) : '—'}</td><td>${on.length ? money(w.month.profit) : '—'}</td>
            <td class="right">${on.length ? btn('Lançar crédito', 'subwallet', `data-id="${a.id}"`) : ''}</td></tr>`;
        }), empty('Nenhuma subconta', 'Crie uma subconta para revender o uso a ela.'))}</section>`;
  }

  pages.addons = () => {
    location.replace('#agency/dashboard');
    return '';
  };

  pages.affiliate = () => {
    const aff = D().affiliate;
    if (!aff.accepted) {
      const steps = [
        ['policy', 'Revisar a política oficial de afiliados'],
        ['video', 'Assistir ao vídeo de conformidade e boas práticas'],
        ['toolkit', 'Baixar o kit de materiais de marketing'],
        ['flowchart', 'Baixar o fluxograma de conformidade']
      ];
      const done = steps.every(([k]) => aff.steps[k]);
      return `<div class="page">${head('Portal de afiliados', 'Ganhe comissões recorrentes indicando novos negócios para a plataforma.')}<form class="surface settings-form set-form" data-ag-form="affiliate-accept"><section class="set-section"><header class="set-head"><h2>Aceite os termos de afiliado</h2><p class="dim">Conclua cada etapa e aceite os termos para liberar seu link exclusivo de indicação.</p><ul class="ag-list"><li>${Math.round(affiliateRate * 100)}% de comissão recorrente em indicações ativas</li><li>Relatórios detalhados de promotor e histórico de pagamentos</li></ul></header><div class="set-body">
        <ol class="ag-steps">${steps.map(([k, label]) => `<li><span>${h(label)}</span>${aff.steps[k] ? badge('Concluído', 'green') : btn('Marcar como concluído', 'affiliate-step', `data-step="${k}" type="button"`)}</li>`).join('')}</ol>
        <label class="check"><input type="checkbox" name="agree" ${done ? '' : 'disabled'}> Li e concordo com os termos e políticas do programa de afiliados</label></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary" ${done ? '' : 'disabled'}>Aceitar termos e participar</button></footer></form></div>`;
    }
    const sub = A.sub || 'dashboard', refs = D().referrals;
    const active = refs.filter(r => r.status === 'Active');
    const link = `${location.origin}/?ref=${aff.code}`;
    const paid = aff.payments.reduce((s, p) => s + p.amount, 0);
    const pageHead = head('Portal de afiliados', `Código de indicação: ${aff.code}`);
    if (sub === 'reports') return `<div class="page">${pageHead}${tabCard('affiliate', `<div class="page-head"><h2>Indicações</h2>${primary('Adicionar indicação', 'new-record', 'data-key="referrals"')}</div>${table(['Empresa', 'Plano', 'Valor da assinatura', 'Comissão mensal', 'Status', 'Pago', ''], refs.filter(r => match(r.name, r.email)).map(r => `<tr><td><b>${h(r.name)}</b><br><small class="dim">${h(r.email)}</small></td><td>${h(r.plan)}</td><td>${money(r.amount)}</td><td>${money(r.amount * affiliateRate)}</td><td>${badge(r.status, tone(r.status))}</td><td>${r.paid ? badge('Pago', 'green') : '—'}</td><td class="right">${btn('Editar', 'edit-record', `data-key="referrals" data-id="${r.id}"`)}</td></tr>`), empty('Nenhuma indicação cadastrada', 'Adicione as empresas que se registraram utilizando seu link.'))}`, 'Seções de afiliados')}</div>`;
    if (sub === 'payment') return `<div class="page">${pageHead}${tabCard('affiliate', `<form class="surface settings-form set-form" data-ag-form="affiliate-payout"><section class="set-section"><header class="set-head"><h2>Dados de pagamento</h2></header><div class="set-body"><div class="field-grid"><label>Método de recebimento<select name="method">${['Transferência bancária', 'PayPal', 'Wise', 'Pix'].map(m => `<option ${aff.payout.method === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label><label>E-mail ou chave de recebimento<input name="email" type="email" value="${h(aff.payout.email)}"></label></div></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Salvar dados</button></footer></form>`, 'Seções de afiliados')}</div>`;
    if (sub === 'history') return `<div class="page">${pageHead}${tabCard('affiliate', `<div class="page-head"><h2>Histórico de pagamentos</h2>${btn('Registrar pagamento de comissões', 'affiliate-pay', '', 'primary')}</div>${table(['Data', 'Valor', 'Indicações', 'Método'], [...aff.payments].reverse().map(p => `<tr><td>${day(p.at, true)}</td><td>${money(p.amount)}</td><td>${p.referrals.length}</td><td>${h(p.method)}</td></tr>`), empty('Nenhum pagamento registrado', 'Os pagamentos de comissões registrados aparecerão aqui.'))}`, 'Seções de afiliados')}</div>`;
    return `<div class="page">${pageHead}${tabCard('affiliate', `<div class="metrics">${metric('Indicações ativas', active.length)}${metric('Comissão mensal', money(active.reduce((s, r) => s + r.amount * affiliateRate, 0)))}${metric('Comissão a receber', money(O().totals.affiliateDue))}${metric('Total pago até hoje', money(paid))}</div>
      <section class="surface set-card"><div class="set-section"><header class="set-head"><h2>Seu link de indicação</h2></header><div class="set-body"><div class="ag-copy"><input readonly value="${h(link)}" aria-label="Link de indicação">${btn('Copiar link', 'copy', `data-text="${h(link)}"`)}</div></div></div></section>`, 'Seções de afiliados')}</div>`;
  };

  pages.partners = () => `<div class="page">${head('Parceiros', 'Diretório centralizado de freelancers, agências parceiras e fornecedores da sua operação.', primary('Adicionar parceiro', 'new-record', 'data-key="partners"'))}<div class="toolbar">${search('Buscar parceiros…')}</div>
    ${table(['Parceiro', 'Serviço prestado', 'Contato', 'Site oficial', ''], D().partners.filter(p => match(p.name, p.service, p.contact)).map(p => `<tr><td><b>${h(p.name)}</b></td><td>${h(tr(p.service))}</td><td>${h(p.contact || '—')}<br><small class="dim">${h(p.email)}</small></td><td>${p.website ? `<a class="text-link" href="${h(p.website)}" target="_blank" rel="noopener">${h(new URL(p.website).hostname)}</a>` : '—'}</td><td class="right">${btn('Editar', 'edit-record', `data-key="partners" data-id="${p.id}"`)}</td></tr>`), empty('Nenhum parceiro cadastrado', 'Adicione parceiros para manter contatos e serviços centralizados.'))}</div>`;

  // A Universidade e a SaaS Education saíram: o aprendizado agora mora na central de ajuda (doc.graao.com,
  // link no menu). Endereços antigos voltam para o painel.
  pages.university = pages['saas-education'] = () => {
    location.replace('#agency/dashboard');
    return '';
  };

  pages.ideas = () => {
    const sub = A.sub || 'all';
    const list = D().ideas.filter(x => (sub === 'all' || x.status === sub) && match(x.title, x.body, x.category)).sort((a, b) => b.votes - a.votes);
    const body = `<div class="toolbar">${search('Buscar ideias…')}</div>
      <div class="ag-ideas">${list.map(x => `<article class="surface padded ag-idea"><button class="ag-vote ${x.voted ? 'on' : ''}" data-ag="idea-vote" data-id="${x.id}" aria-pressed="${x.voted}" aria-label="Votar em ${h(x.title)}">${i('arrow', 15)}<b>${x.votes}</b></button><div><h2>${h(x.title)}</h2><p>${h(x.body)}</p><div class="inline-gap">${badge(x.category)}${badge(x.status, tone(x.status))}<small class="dim">${day(x.created)}</small></div></div>
        <div class="inline-gap">${btn(`Comentários (${x.comments.length})`, 'idea-comments', `data-id="${x.id}"`)}<select data-ag-idea-status="${x.id}" aria-label="Status">${['Under review', 'Planned', 'In progress', 'Completed', 'Declined'].map(s => `<option value="${s}" ${x.status === s ? 'selected' : ''}>${tr(s)}</option>`).join('')}</select></div></article>`).join('') || empty('Nenhuma ideia nesta categoria', 'Envie uma sugestão para abrir a discussão no quadro.')}</div>`;
    return `<div class="page">${head('Ideias e sugestões', 'Compartilhe melhorias e vote nas funcionalidades mais desejadas para a plataforma.', primary('Enviar sugestão', 'new-record', 'data-key="ideas"'))}${tabCard('ideas', body, 'Seções de ideias')}</div>`;
  };

  // Lazy: the helpers it uses are declared further down.
  let mobileCreator;
  pages['mobile-app'] = () => (mobileCreator ??= createMobileCreator({ getApp: () => D().mobileApp, agencyId: () => A.data.access?.agencyId || 'agency', origin: location.origin, head, act, flash, download, rerender: render })).page();

  pages['desktop-app'] = () => desktopPage(D(), location.origin, A.data.access?.agencyId || 'agency');

  // ---- SaaS Configurator --------------------------------------------------
  pages.saas = () => {
    const s = D().saas;
    // Reselling usage works with or without SaaS mode.
    if (!s.enabled && A.sub === 'rebilling') return `<div class="page">${head('Revenda com margem', 'Cobre das subcontas o uso de IA, e-mails e WhatsApp com a sua margem.')}${rebillingPage(s)}</div>`;
    if (!s.enabled) {
      const points = [
        ['chart', 'Escale sua receita', 'O modo SaaS aumenta a retenção dos clientes e cria uma receita recorrente previsível.'],
        ['flow', 'Automatize a operação de receita', 'Cada subconta recebe um plano e a cobrança mensal entra no MRR do painel da agência.'],
        ['pay', 'Aumente suas margens', `A carteira repassa o uso de IA, e-mails e WhatsApp com markup de até ${maxMarkup}×. Dá para revender o uso mesmo sem o modo SaaS, em Revenda com margem.`]
      ];
      return `<div class="page">${head('Configurador SaaS', 'Venda a plataforma com a sua marca, em planos mensais.')}<section class="surface padded ag-hero"><div><h2>Transforme a agência em um software com receita recorrente</h2><ul class="ag-points">${points.map(([ico, t, x]) => `<li><span class="metric-icon">${i(ico)}</span><div><b>${h(t)}</b><p class="dim">${h(x)}</p></div></li>`).join('')}</ul>
        <div class="inline-gap">${btn('Ativar o modo SaaS', 'saas-mode', 'data-on="1"', 'primary', 'spark')}<a class="secondary" href="#agency/saas/rebilling">Revenda com margem</a></div><p class="dim">Os planos são cobrados como assinaturas mensais no AbacatePay, por Pix ou cartão.</p></div>
        <div class="ag-hero-art" aria-hidden="true"><div class="ag-hero-card"><small>Plano mensal</small><b>${money(D().plans[0]?.price || 297)}</b></div><div class="ag-hero-card"><small>Markup da carteira</small><b>até ${maxMarkup}×</b></div><div class="ag-hero-card"><small>Subcontas</small><b>${accounts().length}</b></div></div></section></div>`;
    }
    const sub = A.sub || 'overview', inSaas = accounts().filter(a => s.accounts.includes(a.id));
    const pageHead = head('Configurador SaaS', `Modo SaaS ativo desde ${day(s.enabledAt)}.`, btn('Desativar modo SaaS', 'saas-mode', 'data-on=""'));
    if (sub === 'plans') return `<div class="page">${pageHead}${tabCard('saas', `<div class="page-head"><h2>Planos SaaS</h2>${primary('Novo plano', 'new-record', 'data-key="plans"')}</div>
      ${table(['Plano', 'Preço', 'Período de teste', 'Recursos inclusos', 'Subcontas assinantes', ''], D().plans.map(p => `<tr><td><b>${h(p.name)}</b></td><td>${money(p.price)}/mês</td><td>${p.trialDays ? `${p.trialDays} dias` : '—'}</td><td><small>${h((p.features || '').split('\n').filter(Boolean).join(' · ') || '—')}</small></td><td>${accounts().filter(a => a.plan === p.name).length}</td><td class="right">${btn('Editar', 'edit-record', `data-key="plans" data-id="${p.id}"`)}</td></tr>`), empty('Nenhum plano SaaS cadastrado', 'Os planos definem o valor mensal utilizado no cálculo de receita recorrente.'))}
      <h2 class="section-heading">Plano por subconta</h2>${table(['Subconta', 'Status', 'Plano', ''], accounts().map(a => `<tr><td>${h(a.name)}</td><td>${badge(a.status, tone(a.status))}</td><td>${h(a.plan || '—')}</td><td class="right">${btn('Alterar', 'edit-account', `data-id="${a.id}"`)}</td></tr>`), '')}`, 'Seções do configurador SaaS')}</div>`;
    const suspension = () => {
      const a = s.autoSuspend;
      return `<form class="surface padded settings-form" data-ag-form="saas-suspension"><h2>Plano não pago</h2>
        <label class="check"><input type="checkbox" name="enabled" ${a.enabled ? 'checked' : ''}> Suspender a subconta quando a assinatura falhar</label>
        <p class="dim">A suspensão acontece depois que o AbacatePay esgota as tentativas. A subconta pode pagar e voltar sozinha.</p>
        <div class="field-grid"><label>Tentativas<input type="number" name="maxRetry" min="1" max="10" step="1" required value="${a.maxRetry}"></label>
          <label>Dias entre tentativas<input type="number" name="retryEvery" min="1" max="30" step="1" required value="${a.retryEvery}"></label></div>
        <p class="dim"><small>As tentativas valem para as assinaturas geradas a partir de agora.</small></p>
        <p class="form-status" role="status"></p><button class="primary">Salvar</button></form>`;
    };
    if (sub === 'rebilling') return `<div class="page">${pageHead}${tabCard('saas', rebillingPage(s), 'Seções do configurador SaaS')}</div>`;
    if (sub === 'accounts') return `<div class="page">${pageHead}${tabCard('saas', `<div class="toolbar">${search('Buscar subcontas…')}</div>${table(['Subconta', 'Status', 'Plano', 'Valor mensal', 'Modo SaaS', 'Assinatura', ''], accounts().filter(a => match(a.name)).map(a => `<tr><td><b>${h(a.name)}</b></td><td>${badge(a.status, tone(a.status))}</td><td>${h(a.plan || '—')}</td><td>${a.planPrice ? `${money(a.planPrice)}/mês` : '—'}</td><td>${sw(`Modo SaaS em ${a.name}`, s.accounts.includes(a.id), `data-ag-saas-account="${a.id}"`)}</td><td>${billingCell(a)}</td><td class="right">${btn('Alterar plano', 'edit-account', `data-id="${a.id}"`)}</td></tr>`), empty('Nenhuma subconta', 'Crie uma subconta para ativar o modo SaaS nela.'))}`, 'Seções do configurador SaaS')}</div>`;
    const mrr = inSaas.filter(a => a.status === 'Active').reduce((t, a) => t + a.planPrice, 0);
    const avg = rebillProducts.reduce((t, [k]) => t + s.rebilling[k], 0) / rebillProducts.length;
    const steps = [['Criar planos SaaS', D().plans.length, 'saas/plans'], ['Definir markups da carteira', rebillProducts.some(([k]) => s.rebilling[k] > 1), 'saas/rebilling'], ['Colocar subcontas no modo SaaS', inSaas.length, 'saas/accounts'], ['Conectar o AbacatePay', D().abacatepay?.connected, 'settings/abacatepay']];
    return `<div class="page">${pageHead}${tabCard('saas', `<div class="metrics">${metric('Subcontas no modo SaaS', `${inSaas.length} <small>/ ${accounts().length}</small>`)}${metric('MRR das subcontas SaaS', money(mrr), 'Planos de subcontas ativas')}${metric('Planos SaaS', D().plans.length)}${metric('Markup médio da carteira', `${avg.toFixed(2).replace('.', ',')}×`)}</div>
      <section class="surface padded"><h2>Configuração</h2>${steps.map(([label, done, page]) => `<a class="line-item" href="#agency/${page}"><span>${done ? badge('Concluído', 'green') : badge('Pendente')} ${h(label)}</span>${i('arrow', 15)}</a>`).join('')}</section>${A.data.access?.settings === false ? '' : suspension()}`, 'Seções do configurador SaaS')}</div>`;
  };

  const billingTone = { Pending: 'blue', Trial: 'gold', Active: 'green', PastDue: 'red', Cancelled: 'red' };
  const billingLabel = { Pending: 'Aguardando pagamento', Trial: 'Em teste', Active: 'Ativa', PastDue: 'Em atraso', Cancelled: 'Cancelada' };
  function billingCell(a) {
    const b = D().accounts[a.id]?.billing;
    const live = b?.provider === 'abacatepay' && b.status !== 'Cancelled';
    const parts = live ? [badge(billingLabel[b.status] || b.status, billingTone[b.status] || '')] : [];
    if (live && b.status === 'Pending') parts.push(`<a class="text-link" href="${h(b.url)}" target="_blank" rel="noopener">Abrir link</a>`, btn('Copiar', 'abacate-copy', `data-url="${h(b.url)}"`));
    if (live && ['Active', 'Trial'].includes(b.status) && b.lastPaidAt) parts.push(`<small class="dim">Último pagamento ${day(b.lastPaidAt)}</small>`);
    if (live) parts.push(btn('Cancelar', 'abacate-cancel', `data-id="${a.id}"`));
    else parts.push(btn('Gerar assinatura', 'abacate-subscribe', `data-id="${a.id}" ${D().abacatepay?.connected && a.plan ? '' : 'disabled title="Conecte o AbacatePay e atribua um plano"'}`));
    return `<div class="inline-gap">${parts.join('')}</div>`;
  }

  // ---- Settings ----------------------------------------------------------
  const isOpenAIPage = () => A.page === 'settings' && A.sub === 'openai';
  function openAISettings() {
    const connection = A.openAI;
    const hl = brandHighlight('openai');
    const headHtml = `<div class="shc-panel-head"><span class="shc-icon-tile" aria-hidden="true"><span class="shc-icon">${brandIcon('openai', 24)}</span></span><h2>Chave de API da OpenAI</h2></div>`;
    if (A.data && !A.data.access.session) return `<section class="surface padded shc-card shc-panel" style="--shc-highlight:${hl}">${shcLayers()}${headHtml}<p>Entre na sua conta para conectar uma chave.</p></section>`;
    if (!connection) return `<section class="surface padded shc-card shc-panel" style="--shc-highlight:${hl}">${shcLayers()}${headHtml}<p role="status">Carregando conexão…</p></section>`;
    if (connection.error) return `<section class="surface padded shc-card shc-panel" style="--shc-highlight:${hl}">${shcLayers()}${headHtml}<p role="alert">${h(connection.error)}</p>${btn('Tentar novamente', 'openai-retry')}</section>`;
    return `<form class="surface settings-form set-form shc-card shc-panel${connection.configured ? ' is-connected' : ''}" data-ag-form="openai-connect" style="--shc-highlight:${hl}">
      ${shcLayers()}
      <section class="set-section"><header class="set-head">${headHtml}
      <p class="dim">Use a chave do seu projeto da OpenAI para gerar páginas no AI Studio e testar agentes. O uso é cobrado no seu projeto.</p>
      <a class="text-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">Gerenciar chaves na OpenAI</a></header><div class="set-body">
      <p>${connection.configured ? `Chave conectada · final <code>${h(connection.last4)}</code> · ${h(connection.model)}` : 'Nenhuma chave conectada'}</p>
      <label>${connection.configured ? 'Nova chave de API' : 'Chave de API'}<input name="apiKey" type="password" autocomplete="off" spellcheck="false" maxlength="512" placeholder="sk-…" required></label></div></section>
      <footer class="set-foot"><p class="form-status" role="alert"></p>
        ${connection.configured ? '<button type="button" class="secondary" data-ag="openai-disconnect">Desconectar</button>' : ''}<button type="submit" class="primary">${connection.configured ? 'Substituir chave' : 'Conectar chave'}</button></footer>
    </form>`;
  }
  async function refreshOpenAI() {
    const currentVisit = visit;
    try {
      const connection = await api('/api/openai');
      if (currentVisit === visit) A.openAI = connection;
    } catch (error) {
      if (currentVisit === visit) A.openAI = { error: error.message };
    }
    if (currentVisit === visit && isOpenAIPage()) render();
  }
  const isAbacatePage = () => A.page === 'settings' && A.sub === 'abacatepay';
  async function refreshAbacate() {
    const currentVisit = visit;
    try { const data = await api('/api/abacatepay/agency/status'); if (currentVisit === visit) A.abacate = data; }
    catch (error) { if (currentVisit === visit) A.abacate = { error: error.message }; }
    if (currentVisit === visit && isAbacatePage()) render();
  }
  function abacateSettings() {
    const g = A.abacate, hl = brandHighlight('abacatepay');
    const head = title => `<div class="shc-panel-head"><span class="shc-icon-tile" aria-hidden="true"><span class="shc-icon">${brandIcon('abacatepay', 24)}</span></span><h2>${h(title)}</h2></div>`;
    const card = (body, on = false) => `<div class="surface padded shc-card shc-panel${on ? ' is-connected' : ''}" style="--shc-highlight:${hl}">${shcLayers()}${body}</div>`;
    if (!g) return card(`${head('AbacatePay')}<p class="dim">Verificando a conexão…</p>`);
    if (g.error) return card(`${head('AbacatePay')}<p class="form-status">${h(g.error)}</p>${btn('Tentar novamente', 'abacate-refresh')}`);
    if (!g.connected) return `<form class="surface settings-form set-form shc-card shc-panel" data-ag-form="abacate-connect" style="--shc-highlight:${hl}">${shcLayers()}<section class="set-section"><header class="set-head">${head('Conectar o AbacatePay')}<p>O AbacatePay é o meio de pagamento da agência: cobra os planos SaaS das subcontas como assinaturas mensais por Pix ou cartão e confirma cada pagamento sozinho.</p></header><div class="set-body">
      <p class="dim">Crie uma chave de API v2 com permissão de leitura e escrita em <a class="text-link" href="https://app.abacatepay.com/api-keys" target="_blank" rel="noopener">app.abacatepay.com</a>. Use a chave do modo teste para experimentar sem dinheiro real. Cada subconta conecta a própria conta em Configurações → AbacatePay para receber as suas faturas.</p><label>Chave de API v2<input name="apiKey" required autocomplete="off" spellcheck="false" maxlength="400"></label></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Conectar</button></footer></form>`;
    const hook = g.webhookStatus === 'registered' ? `<p>${badge('Webhook cadastrado automaticamente', 'green')}</p>`
      : `<p class="surface padded ag-warn">${h(g.webhookError || 'Cadastre o webhook no painel do AbacatePay.')} Use os dados abaixo em app.abacatepay.com/webhooks.</p>`;
    const update = g.webhookOutdated ? `<div class="surface padded ag-notice">${i('pay', 20)}<div><b>Há avisos novos do AbacatePay</b><p>Atualize para o graao saber de plano recusado, contestação e devolução.</p></div>${btn('Atualizar avisos', 'abacate-hooks', '', 'primary')}</div>` : '';
    const missing = g.missingEvents?.length ? `<p class="dim"><small>O AbacatePay não aceitou: ${h(g.missingEvents.join(', '))}</small></p>` : '';
    return (D().fiscal ? '' : fiscalMissing('#agency/settings/fiscal')) + update + card(`${head(g.storeName || 'AbacatePay')}<p>${badge('Conectado', 'green')} ${g.devMode ? badge('Modo teste', 'gold') : ''}</p><p class="dim">Chave terminada em <b>${h(g.last4)}</b>, conectada em ${day(g.connectedAt)}. Gere as assinaturas em <a class="text-link" href="#agency/saas/accounts">Configurador SaaS → Subcontas SaaS</a>.</p><div class="inline-gap">${btn('Desconectar', 'abacate-disconnect')}</div>`, true)
      + `<section class="surface set-card"><div class="set-section"><header class="set-head"><h2>Webhook de assinaturas</h2></header><div class="set-body">${hook}<label>URL<input readonly value="${h(g.webhookUrl)}"></label><label>Secret<input readonly value="${h(g.webhookSecret || '')}"></label><p class="dim"><small>Eventos: ${h(g.events.join(', '))}</small></p>${missing}</div></div></section>`;
  }
  const isWhatsAppPage = () => A.page === 'settings' && A.sub === 'whatsapp';
  async function refreshWhatsApp() {
    const currentVisit = visit;
    try {
      const data = await api('/api/whatsapp/agency/status');
      await refreshVerifyLine();
      if (currentVisit === visit) A.wa = data;
      // A tela reaberta no meio da leitura do QR volta a conferir sozinha.
      if (currentVisit === visit && A.vl?.status === 'connecting' && !vlPollTimer) startVerifyLinePoll();
    } catch (error) {
      if (currentVisit === visit) A.wa = { error: error.message };
    }
    if (currentVisit === visit && isWhatsAppPage()) render();
  }
  function startWaPoll(workspaceId) {
    stopWaPoll();
    const currentVisit = visit;
    waPollTimer = setInterval(async () => {
      if (currentVisit !== visit || !isWhatsAppPage() || A.waFocus?.workspace !== workspaceId) { stopWaPoll(); return; }
      try {
        const live = await api(`/api/whatsapp/workspace/status?workspace=${encodeURIComponent(workspaceId)}`);
        if (currentVisit !== visit || A.waFocus?.workspace !== workspaceId) return;
        A.waFocus = { ...live, workspace: workspaceId };
        if (A.wa?.subaccounts?.[workspaceId]) {
          A.wa.subaccounts[workspaceId] = { ...A.wa.subaccounts[workspaceId], status: live.status, phone: live.phone, profileName: live.profileName };
        }
        if (live.status === 'connected') {
          stopWaPoll();
          flash(`WhatsApp de ${accountName(workspaceId)} conectado!`);
        }
        render();
      } catch {}
    }, 3000);
  }
  function waStatusBadge(status) {
    if (status === 'connected') return badge('Conectado', 'green');
    if (status === 'connecting') return badge('Aguardando QR Code', 'blue');
    if (status === 'hibernated') return badge('Hibernado', 'gold');
    return badge('Desconectado', '');
  }
  // Linha do graao que recebe o "Confirmar graao XXXXXX" de quem cria uma agência. Só o dono da plataforma vê.
  async function refreshVerifyLine() {
    if (!isPlatformOwner()) return;
    A.vl = await api('/api/verify/line').catch(e => ({ error: e.message }));
  }
  // Confere a conexão a cada 3 s por até 10 min; quando para, a tela pede o Atualizar em vez de dizer que ainda confere.
  function stopVerifyLinePoll() { clearInterval(vlPollTimer); vlPollTimer = null; }
  function startVerifyLinePoll() {
    stopVerifyLinePoll();
    const currentVisit = visit, until = Date.now() + 600000;
    vlPollTimer = setInterval(async () => {
      if (currentVisit !== visit || !isWhatsAppPage() || Date.now() > until) { stopVerifyLinePoll(); if (currentVisit === visit && isWhatsAppPage()) render(); return; }
      await refreshVerifyLine();
      if (currentVisit !== visit) return;
      if (A.vl?.status === 'connected') { stopVerifyLinePoll(); flash('WhatsApp de confirmação conectado!'); }
      render();
    }, 3000);
  }
  function verifyLineSection() {
    if (!isPlatformOwner()) return '';
    const vl = A.vl;
    const body = !vl ? '<p class="dim">Carregando…</p>'
      : vl.error ? `<p class="form-status" role="alert">${h(vl.error)}</p>`
      : !vl.configured ? `<p class="form-status">Faltam na Vercel: <b>${vl.missing.map(h).join(', ')}</b>.</p><p class="dim">Enquanto faltar, as agências que já existem seguem abertas e o cadastro de agência nova fica fechado.</p>`
      : !vl.server ? '<p class="form-status">O servidor gerenciado da Evolution (EVOLUTION_BASE_URL e EVOLUTION_API_KEY) não está configurado.</p>'
      : `<div class="inline-gap">${vl.missing ? badge('Instância ainda não criada') : waStatusBadge(vl.status)}<span class="dim">+${h(vl.number)} · instância ${h(vl.instance)}</span></div>
         ${vl.status === 'connected' ? '' : vl.qrcode
           ? `<div class="ag-waha-qr ag-gap"><div class="ag-waha-qr-frame"><img src="${h(vl.qrcode)}" alt="QR Code do WhatsApp de confirmação"></div><b>Leia com o WhatsApp do número do graao</b><small class="dim">Aparelhos conectados → Conectar aparelho. ${vlPollTimer ? 'Verificando sozinho…' : 'Depois de ler, clique em <b>Atualizar</b>.'}</small></div>`
           : vl.paircode ? `<p>Código de pareamento: <b class="ag-waha-code">${h(vl.paircode)}</b></p>` : ''}
         <div class="inline-gap ag-gap">${vl.status === 'connected' ? '' : btn('Conectar', 'vl-connect', 'type="button"', 'primary')}${btn('Atualizar', 'vl-refresh', 'type="button"', 'secondary', 'refresh')}</div>`;
    return `
      <form class="surface settings-form set-form ag-gap" data-ag-form="vl-release">
        <section class="set-section"><header class="set-head"><h2>WhatsApp de confirmação</h2>
          <p class="dim">Número do graao que recebe a mensagem de quem cria uma agência e confirma o celular. Nada do que chega nele é guardado.</p></header>
          <div class="set-body">${body}</div></section>
        <section class="set-section"><header class="set-head"><h3>Liberar um número</h3>
          <p class="dim">Para o suporte trocar o celular de uma agência: o número volta a poder confirmar outra conta.</p></header>
          <div class="set-body"><label>Celular com DDD<input name="phone" required inputmode="tel" placeholder="(31) 98123-4567"></label></div></section>
        <footer class="set-foot"><p class="form-status" role="alert"></p><button class="secondary">Liberar número</button></footer>
      </form>`;
  }
  function whatsappSettings() {
    const w = A.wa;
    const markup = String(D().saas.rebilling.whatsapp ?? 1).replace('.', ',');
    const subCfg = w?.subaccounts || {};
    const pl = w?.providerLabel || 'Evolution API';
    const srv = A.waServer;
    const serverCheck = srv ? `<p class="${srv.ok ? 'dim' : 'form-status'}" role="status">${srv.ok ? `Servidor no ar · versão ${h(srv.version)} · ${srv.connected} de ${srv.instances} número(s) conectado(s) · resposta em ${srv.latencyMs} ms` : h(srv.error)}</p>` : '';
    const statusBannerBadge = w?.error
      ? badge('Erro ao consultar', 'red')
      : !w
        ? badge('Carregando…')
        : w.managed && !w.hasCustomServer
          ? badge('Servidor gerenciado ativo', 'green')
          : w.configured
            ? badge(`${pl} conectada`, 'green')
            : badge('Aguardando configuração');

    const serverForm = (heading = '') => `
      <form class="${heading ? 'surface ' : ''}settings-form set-form" data-ag-form="wa-config">
        <section class="set-section">${heading}<div class="set-body"><div class="field-grid">
          <label class="ag-full">URL da Evolution API<input name="baseUrl" type="url" required placeholder="https://whatsapp.suaagencia.com.br" value="${h(w?.baseUrl || '')}"></label>
          <label class="ag-full">API Key global <small class="dim">É o <code>AUTHENTICATION_API_KEY</code> do servidor</small><input name="adminToken" type="password" autocomplete="off" ${w?.hasAdminToken ? '' : 'required'} placeholder="${w?.hasAdminToken ? `Chave salva (••••${h(w.adminTokenLast4)}) — deixe em branco para manter` : 'Cole a API Key global do servidor'}"></label>
        </div></div></section>
        <footer class="set-foot"><p class="form-status" role="alert"></p>
          ${w?.hasCustomServer ? btn('Remover servidor próprio', 'wa-disconnect-server') : ''}
          <button class="primary">Salvar servidor de WhatsApp</button>
        </footer>
      </form>`;

    const focus = A.waFocus;
    const focusName = focus ? accountName(focus.workspace) : '';
    const focusPanel = focus ? `
      <div class="surface padded ag-gap ag-wa-focus">
        <div class="page-head">
          <div>
            <div class="inline-gap"><h2>WhatsApp · ${h(focusName)}</h2>${waStatusBadge(focus.status)}</div>
            <p class="dim">O cliente desta subconta também pode fazer esta conexão direto em <b>Configurações → WhatsApp</b> dentro da subconta.</p>
          </div>
          <div class="inline-gap">
            ${focus.status === 'connected'
              ? btn('Desconectar WhatsApp', 'wa-sub-disconnect', `data-id="${focus.workspace}"`)
              : btn('Atualizar QR Code', 'wa-sub-connect', `data-id="${focus.workspace}"`, 'primary')}
            ${btn('Fechar', 'wa-focus-close')}
          </div>
        </div>
        ${focus.status === 'connected' ? `
          <div class="ag-two">
            <div class="ag-waha-qr">
              <span class="ag-waha-icon">${i('whatsapp', 24)}</span>
              <b>${h(focus.profileName || 'WhatsApp conectado')}</b>
              <small class="dim">${focus.phone ? `+${h(focus.phone)}` : 'Pronto para enviar e receber mensagens em Conversas.'}</small>
            </div>
            <form class="settings-form" data-ag-form="wa-sub-test" data-id="${focus.workspace}">
              <h3>Enviar mensagem de teste</h3>
              <label>Número destino (com DDI)<input name="phone" required inputmode="numeric" placeholder="5511999999999"></label>
              <label>Mensagem<textarea name="text" required maxlength="2000" placeholder="Olá! WhatsApp conectado no Graao via ${h(pl)}."></textarea></label>
              <button class="primary">Enviar teste</button>
              <p class="form-status" role="alert"></p>
            </form>
          </div>
        ` : `
          <div class="ag-two">
            <div class="ag-waha-qr">
              ${focus.qrcode
                ? `<div class="ag-waha-qr-frame"><img src="${h(focus.qrcode)}" alt="QR Code do WhatsApp de ${h(focusName)}"></div>
                   <b>Aponte a câmera do WhatsApp para o QR Code</b>
                   <small class="dim">1. Abra o WhatsApp · 2. Toque em <b>Aparelhos conectados</b> · 3. Escaneie o código.<br>Verificando conexão automaticamente…</small>`
                : focus.paircode
                  ? `<span class="ag-waha-icon">${i('whatsapp', 22)}</span>
                     <b>Digite este código no celular</b>
                     <div class="ag-waha-code">${h(focus.paircode)}</div>
                     <small class="dim">No WhatsApp: <b>Aparelhos conectados → Conectar aparelho → Conectar com número de telefone</b>.</small>`
                  : `<span class="ag-waha-icon">${i('whatsapp', 22)}</span><b>Gerando QR Code…</b><small class="dim">Clique em <b>Atualizar QR Code</b> caso não carregue em alguns segundos.</small>`}
            </div>
            <form class="settings-form" data-ag-form="wa-sub-pair" data-id="${focus.workspace}">
              <h3>Prefere conectar sem câmera?</h3>
              <p class="dim">Informe o número do WhatsApp com DDI e DDD para gerar um código de 8 dígitos.</p>
              <label>Número do WhatsApp (com DDI)<input name="phone" required inputmode="numeric" placeholder="5511999999999"></label>
              <button class="secondary">Gerar código de pareamento</button>
              <p class="form-status" role="alert"></p>
            </form>
          </div>
        `}
      </div>` : '';

    const rows = accounts().filter(a => match(a.name)).map(a => {
      const cfg = subCfg[a.id] || { enabled: true, rebill: false, status: 'disconnected', phone: '', profileName: '' };
      const connectBtn = !w?.configured || !cfg.enabled
        ? `<span class="dim">—</span>`
        : cfg.status === 'connected'
          ? `<div class="inline-gap">${btn('Gerenciar', 'wa-sub-open', `data-id="${a.id}"`)}${btn('Desconectar', 'wa-sub-disconnect', `data-id="${a.id}"`)}</div>`
          : btn('Conectar QR Code', 'wa-sub-connect', `data-id="${a.id}"`, 'primary');
      const removeBtn = w?.configured && cfg.hasInstance ? btn('Excluir instância', 'wa-sub-remove', `data-id="${a.id}"`) : '';
      return `<tr>
        <td><b>${h(a.name)}</b><br><small class="dim">${h(a.id)}</small></td>
        <td>${waStatusBadge(cfg.status)}${cfg.guard?.down ? `<br><small class="form-status">${cfg.guard.reason === 'server' ? 'Servidor fora do ar' : 'Fora do ar'} desde ${h(new Date(cfg.guard.downSince).toLocaleString('pt-BR'))}</small>` : ''}${cfg.guard && (cfg.guard.recovered || cfg.guard.restarts || cfg.guard.webhookFixes) ? `<br><small class="dim" title="Proteção automática">${cfg.guard.recovered} mensagem(ns) recuperada(s) · ${cfg.guard.restarts} reinício(s) · ${cfg.guard.webhookFixes} conserto(s)</small>` : ''}${cfg.phone ? `<br><small class="dim">+${h(cfg.phone)}</small>` : ''}</td>
        <td><div class="inline-gap">${connectBtn}${removeBtn}</div></td>
        <td>${sw(`WhatsApp em ${a.name}`, cfg.enabled, `data-ag-wa-sub="${a.id}" data-field="enabled"`)}</td>
        <td>${sw(`Rebilling de WhatsApp em ${a.name}`, (D().saas.rebill?.[a.id] || []).includes('whatsapp'), `data-ag-rebill="${a.id}" data-product="whatsapp"`, !cfg.enabled)}</td>
      </tr>`;
    });

    const waHl = brandHighlight('whatsapp');
    const waActive = Boolean(w?.configured || (w?.managed && !w?.hasCustomServer));
    return `
      <div class="surface padded ag-notice shc-card shc-panel${waActive ? ' is-connected' : ''}" style="--shc-highlight:${waHl}">
        ${shcLayers()}
        <span class="shc-icon-tile" aria-hidden="true"><span class="shc-icon">${brandIcon('whatsapp', 22)}</span></span>
        <div>
          <div class="inline-gap"><b>Integração com WhatsApp (${h(pl)})</b>${statusBannerBadge}</div>
          <p>Conecte uma única vez o servidor da agência (<a class="text-link" href="https://doc.evolution-api.com" target="_blank" rel="noopener">Evolution API</a>) para que <b>cada subconta</b> conecte o próprio número apenas lendo o QR Code. Markup SaaS atual: <b>${h(markup)}×</b>.</p>
          ${w?.error ? `<p class="form-status">${h(w.error)}</p>` : ''}
          ${serverCheck}
        </div>
        ${w?.configured ? btn('Testar servidor', 'wa-server-check') : ''}
        <a class="secondary" href="#agency/saas/rebilling">Ajustar markup</a>
      </div>

      ${w?.managed && !w?.hasCustomServer ? `
        <div class="surface padded ag-gap">
          <div class="inline-gap">${badge('Modo 1-clique ativo', 'green')}<b>Servidor ${h(pl)} gerenciado pela plataforma</b></div>
          <p class="dim">Os usuários de cada subconta já podem abrir <b>Configurações → WhatsApp</b> e conectar o número apenas escaneando o QR Code — sem digitar URL nem chaves.</p>
          <details class="ag-wa-details"><summary>Usar servidor de WhatsApp próprio (opcional)</summary>${serverForm()}</details>
        </div>
      ` : `
        ${serverForm('<header class="set-head"><h2>Servidor de WhatsApp da agência</h2><p class="dim">Informe uma única vez a URL e a API Key global da sua Evolution API. A chave fica criptografada no Supabase. Depois disso, cada subconta verá apenas o botão <b>Conectar WhatsApp</b> com QR Code.</p></header>')}
      `}

      ${verifyLineSection()}

      ${focusPanel}

      <div class="page-head ag-gap">
        <div>
          <h3>Subcontas conectadas ${badge(`${accounts().length} subconta(s)`, 'blue')}</h3>
          <p class="dim">Cada subconta recebe uma instância isolada na ${h(pl)} e pode parear seu próprio número via QR Code.</p>
        </div>
        <div class="inline-gap">
          ${w?.configured ? btn('Atualizar status', 'wa-refresh', '', 'secondary', 'refresh') : ''}
          ${search('Buscar pelo nome…')}
        </div>
      </div>
      ${table(['Subconta', 'Status', 'Conexão', 'WhatsApp ativo', 'Rebilling ativo'], rows, empty('Nenhuma subconta encontrada', 'Crie uma subconta ou ajuste a busca.'))}`;
  }
  // Per-sub-account switches: access to the feature and rebilling its usage through the wallet.
  function featureTable(key) {
    const [, title, text, byDefault] = subFeatures.find(f => f[0] === key);
    const st = D().subFeatures[key];
    const on = id => Object.hasOwn(st.on, id) ? st.on[id] : byDefault;
    const rows = accounts().filter(a => match(a.name)).map(a => `<tr><td><b>${h(a.name)}</b><br><small class="dim">${h(a.id)}</small></td><td>${sw(`${title} em ${a.name}`, on(a.id), `data-ag-feature="${key}" data-field="on" data-account="${a.id}"`)}</td><td>${sw(`Rebilling de ${title} em ${a.name}`, st.rebill.includes(a.id), `data-ag-feature="${key}" data-field="rebill" data-account="${a.id}"`, !on(a.id))}</td></tr>`);
    return `<div class="page-head"><div><h2>${h(tr(title))}</h2><p class="dim">${h(tr(text))}</p></div></div>
      <div class="page-head"><div><h3>Configurações das subcontas ${badge(`${accounts().length} subcontas`, 'blue')}</h3><p class="dim">Ative ou desative o recurso e o rebilling para cada subconta.</p></div>${search('Buscar pelo nome…')}</div>
      ${table(['Subconta', 'Recurso ativo', 'Rebilling ativo'], rows, empty('Nenhuma subconta encontrada', 'Crie uma subconta ou ajuste a busca.'))}`;
  }
  const settingsPages = {
    openai: openAISettings,
    profile: () => { const p = D().profile; return `<form class="surface settings-form set-form" data-ag-form="profile"><section class="set-section"><header class="set-head"><h2>Dados pessoais</h2></header><div class="set-body"><div class="field-grid"><label>Nome<input name="first" required value="${h(p.first)}"></label><label>Sobrenome<input name="last" required value="${h(p.last)}"></label><label>E-mail<input name="email" type="email" value="${h(p.email)}"></label>${phoneField({ name: 'phone', label: 'Telefone', value: p.phone, id: 'ag-profile-phone' })}</div></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Salvar perfil</button></footer></form>`; },
    company: () => {
      const c = D().company;
      const section = (id, title, text, body, extra = '') => `<section class="set-section" aria-labelledby="ag-company-${id}">
          <header class="set-head"><h2 id="ag-company-${id}">${title}</h2><p class="dim">${text}</p>${extra}</header>
          <div class="set-body">${body}</div>
        </section>`;
      return `<form class="surface settings-form set-form" data-ag-form="company">
        ${section('data', 'Dados da empresa', 'Como a sua agência se identifica para clientes e subcontas.', `<div class="field-grid">
          <label>Nome da empresa<input name="name" required maxlength="120" value="${h(c.name)}"></label>
          <label>Site institucional<input name="website" type="url" value="${h(c.website)}"></label>
          ${phoneField({ name: 'phone', label: 'Telefone', value: c.phone, id: 'ag-company-phone' })}
          <label>Endereço comercial<input name="address" value="${h(c.address)}"></label>
          <label>Fuso horário padrão<select name="timezone">${['America/Sao_Paulo', 'America/New_York', 'Europe/London', 'UTC'].map(z => `<option ${c.timezone === z ? 'selected' : ''}>${z}</option>`).join('')}</select></label>
          <label>Moeda<input readonly value="Real brasileiro (BRL)"></label>
        </div>`)}
        ${section('brand', 'Cores da marca', 'A primária lidera as ações, a secundária cria camadas e o acento marca links e destaques. A prévia muda enquanto você escolhe.', `<div class="ag-company-colors">
          ${colorPicker(c.primary, { name: 'primary', label: 'Cor primária', fallback: '#FF4F9A' })}
          ${colorPicker(c.secondary, { name: 'secondary', label: 'Cor secundária', fallback: '#C4A7FF' })}
          ${colorPicker(c.accent, { name: 'accent', label: 'Cor de acento', fallback: '#6BC9FF' })}
        </div>
        <div class="ag-brand-showcase">
          <div class="ag-brand-mockup-tabs" role="tablist" aria-label="Exemplos de aplicação da paleta">
            <button type="button" class="ag-brand-mockup-tab is-active" role="tab" aria-selected="true" data-ag-brand-mockup-tab data-view="overview">Visão geral</button>
            <button type="button" class="ag-brand-mockup-tab" role="tab" aria-selected="false" data-ag-brand-mockup-tab data-view="components">Componentes</button>
            <button type="button" class="ag-brand-mockup-tab" role="tab" aria-selected="false" data-ag-brand-mockup-tab data-view="surfaces">Fundos e estados</button>
          </div>
          <div class="ag-brand-mockup-panels">
            <div class="ag-brand-mockup-panel is-active" data-ag-brand-mockup-panel="overview" role="tabpanel" aria-label="Prévia: visão geral">
              <div class="ag-brand-mockup-window" inert>
                <aside class="ag-brand-mockup-sidebar">
                  <div class="ag-brand-mockup-logo"><span>s</span><b>graao</b></div>
                  <div class="ag-brand-mockup-nav" aria-label="Navegação simulada">
                    <span class="is-active">Visão geral</span><span>Contatos</span><span>Campanhas</span><span>Relatórios</span>
                  </div>
                  <span class="ag-brand-mockup-side-label">Atalhos</span>
                  <span class="ag-brand-mockup-side-link">Biblioteca</span>
                  <button type="button" class="ag-brand-mockup-side-cta">Nova ação</button>
                </aside>
                <div class="ag-brand-mockup-main">
                  <div class="ag-brand-mockup-topbar"><div><span>WORKSPACE</span><b>Olá, equipe Graao</b></div><span class="ag-brand-mockup-avatar">LG</span></div>
                  <div class="ag-brand-mockup-metrics">
                    <div><span>Leads em movimento</span><b>1.284</b><em>+18,4%</em></div>
                    <div><span>Fluxos ativos</span><b>32</b><em class="is-blue">+6 hoje</em></div>
                    <div><span>Conversão</span><b>8,7%</b><em class="is-lilac">meta em dia</em></div>
                  </div>
                  <div class="ag-brand-mockup-lower">
                    <div class="ag-brand-mockup-card">
                      <div class="ag-brand-mockup-card-head"><b>Nova automação</b><span class="ag-brand-mockup-status">Ativo</span></div>
                      <label>Nome da automação<input readonly value="Nutrir leads quentes"></label>
                      <div class="ag-brand-mockup-actions"><button type="button" class="ag-brand-mockup-primary">Salvar fluxo</button><a href="#agency/settings/company" class="ag-brand-mockup-link">Ver detalhes</a></div>
                    </div>
                    <div class="ag-brand-mockup-card ag-brand-mockup-highlight"><span class="ag-brand-mockup-eyebrow">ACENTO</span><b>Clareza em cada toque</b><p>Links, foco e estados ativos usam o azul Graao.</p><a href="#agency/settings/company" class="ag-brand-mockup-link">Explorar interface</a></div>
                  </div>
                </div>
              </div>
            </div>
            <div class="ag-brand-mockup-panel" data-ag-brand-mockup-panel="components" role="tabpanel" aria-label="Prévia: componentes" hidden>
              <div class="ag-brand-component-grid" inert>
                <div class="ag-brand-component-card"><span class="ag-brand-component-label">Botões</span><div class="ag-brand-button-row"><button type="button" class="ag-brand-demo-primary">Salvar alterações</button><button type="button" class="ag-brand-demo-secondary">Cancelar</button></div><code>primary · secondary</code></div>
                <div class="ag-brand-component-card"><span class="ag-brand-component-label">Links e foco</span><a href="#agency/settings/company" class="ag-brand-demo-link">Abrir relatório</a><div class="ag-brand-demo-focus">Campo em foco</div><code>accent · focus ring</code></div>
                <div class="ag-brand-component-card"><span class="ag-brand-component-label">Campos</span><label class="ag-brand-demo-field">Nome da campanha<input readonly value="Campanha de novembro"></label><label class="ag-brand-demo-field">Segmento<select><option>Leads quentes</option></select></label><code>surface · border</code></div>
              </div>
            </div>
            <div class="ag-brand-mockup-panel" data-ag-brand-mockup-panel="surfaces" role="tabpanel" aria-label="Prévia: fundos e estados" hidden>
              <div class="ag-brand-surfaces-demo" inert>
                <div class="ag-brand-surface-tile ag-brand-surface-pink"><span>Primária</span><b>Ações que pedem decisão</b><small>Verde Graao · var(--g-brand)</small></div>
                <div class="ag-brand-surface-tile ag-brand-surface-lilac"><span>Secundária</span><b>Camadas e agrupamentos</b><small>Verde-escuro Graao · var(--g-brand-2)</small></div>
                <div class="ag-brand-surface-tile ag-brand-surface-blue"><span>Acento</span><b>Feedback e descoberta</b><small>Verde Graao · var(--g-brand-accent)</small></div>
              </div>
            </div>
          </div>
        </div>`, `<button type="button" class="secondary" data-ag-brand-reset>${i('undo')} Restaurar paleta oficial</button>`)}
        ${section('whitelabel', 'White Label das subcontas', 'O endereço e o logotipo que as subcontas veem no lugar da marca da plataforma.', `<div class="field-grid">
          <div><label>Domínio para subcontas<input name="domain" placeholder="app.suaagencia.com.br" value="${h(c.domain)}" aria-describedby="ag-domain-hint"></label>
            ${c.domain ? `<p class="inline-gap"><button type="button" class="secondary" data-ag-domain-check>${i('check')} Verificar domínio</button></p><div class="dim ag-domain-status" data-ag-domain-status role="status"></div>` : ''}
            <small class="dim" id="ag-domain-hint">Prefira um subdomínio, como app.suaagencia.com.br. Depois de salvar, clique em Verificar domínio para ver os registros exatos (em geral um CNAME para cname.vercel-dns.com).</small></div>
          <div class="ag-company-logo">
            <span class="ag-logo-preview">${c.logo ? `<img src="${h(c.logo)}" alt="Logotipo das subcontas">` : i('upload')}</span>
            <div>
              <label>Logotipo<input type="file" name="logoFile" accept="image/png,image/jpeg,image/webp,image/gif" aria-describedby="ag-company-logo-hint"></label>
              <small class="dim" id="ag-company-logo-hint">PNG, JPEG, WebP ou GIF, até 300 KB</small>
              ${c.logo ? '<label class="check"><input type="checkbox" name="removeLogo"> Remover logotipo</label>' : ''}
            </div>
          </div>
        </div>`)}
        <footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Salvar dados da empresa</button></footer>
      </form>`;
    },
    users: () => `<div class="page-head"><div><h2>Membros da equipe</h2><p class="dim">${A.data.access?.session ? 'Use o e-mail confirmado no Supabase para conceder acesso à equipe.' : 'Use “Agir como” para testar as permissões de um usuário.'}</p></div>${primary('Adicionar usuário', 'new-record', 'data-key="users"')}</div>${table(['Nome', 'Função', 'Acesso', 'Permissões de módulos', ''], D().users.map(u => `<tr><td><b>${h(`${u.first} ${u.last}`)}</b><br><small class="dim">${h(u.email)}</small></td><td>${badge(u.role, u.role.startsWith('Agency') ? 'pink' : 'blue')}</td><td><small>${u.role.startsWith('Agency') ? 'Todas as subcontas' : h(u.accounts.map(accountName).join(', ') || 'Nenhuma subconta')}</small></td><td><small>${u.permissionMode === 'none' ? 'Nenhum módulo' : u.permissionMode === 'inherit' ? 'Todos os módulos' : u.permissionMode === 'restricted' || u.permissions?.length ? `${u.permissions?.length || 0} módulos permitidos` : 'Todos os módulos'}</small></td><td class="right inline-gap">${A.data.access?.session ? '' : btn('Agir como', 'act-as', `data-id="${u.id}"`)}${btn('Editar', 'edit-record', `data-key="users" data-id="${u.id}"`)}</td></tr>`), empty('Nenhum membro cadastrado', 'Adicione usuários e defina permissões específicas por subconta e módulo.'))}`,
    billing: () => { const b = D().billing; const wallet = O().totals.wallet; return `<form class="surface settings-form set-form" data-ag-form="billing-plan"><section class="set-section"><header class="set-head"><h2>Plano da agência</h2><p class="dim">O plano é gravado localmente para cálculo de recursos; a alteração não gera cobrança automática no cartão.</p></header><div class="set-body"><div class="ag-plans">${agencyPlans.map(([name, price]) => `<label class="choice"><input type="radio" name="plan" value="${name}" ${b.plan === name ? 'checked' : ''}><strong>${name}</strong><span>${money(price)}/mês</span></label>`).join('')}</div></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Alterar plano</button></footer></form>
      <form class="surface settings-form set-form" data-ag-form="auto-recharge"><section class="set-section"><header class="set-head"><h2>Saldo da carteira</h2></header><div class="set-body"><p class="ag-big">${money(wallet)}</p><label class="check"><input type="checkbox" name="enabled" ${b.autoRecharge.enabled ? 'checked' : ''}> Notificar quando o saldo estiver baixo</label><div class="field-grid"><label>Saldo mínimo de alerta<input name="threshold" type="number" min="0" step="0.01" value="${b.autoRecharge.threshold}"></label><label>Valor sugerido de recarga<input name="amount" type="number" min="0" step="0.01" value="${b.autoRecharge.amount}"></label></div></div></section><footer class="set-foot"><p class="form-status" role="alert"></p>${btn('Registrar lançamento', 'wallet')}<button class="primary">Salvar regras</button></footer></form>
      ${b.autoRecharge.enabled && wallet < b.autoRecharge.threshold ? `<p class="surface padded ag-warn">O saldo da carteira está abaixo de ${money(b.autoRecharge.threshold)}. Registre uma recarga de ${money(b.autoRecharge.amount)}.</p>` : ''}
      <h2 class="section-heading">Histórico de transações da carteira</h2>${table(['Data', 'Tipo', 'Valor', 'Observação'], [...b.wallet].reverse().map(w => `<tr><td>${day(w.at, true)}</td><td>${badge(w.kind === 'Credit' ? 'Crédito' : 'Débito', w.kind === 'Credit' ? 'green' : 'orange')}</td><td>${money(w.amount)}</td><td>${h(w.note || '—')}</td></tr>`), empty('Nenhuma transação', 'Lance créditos e débitos para acompanhar o saldo da carteira da agência.'))}`; },
    'menu-links': () => `<div class="page-head"><div><h2>Links personalizados do menu</h2><p class="dim">Estes links aparecem na barra lateral das subcontas ou da própria agência.</p></div>${primary('Adicionar link', 'new-record', 'data-key="menuLinks"')}</div>${table(['Título', 'URL', 'Exibição', 'Subcontas com acesso', ''], D().menuLinks.map(l => `<tr><td>${i(l.icon, 15)} <b>${h(l.title)}</b></td><td><small>${h(l.url)}</small></td><td>${h(tr(l.showOn))} · ${h(tr(l.openIn))}</td><td><small>${l.accounts.length ? h(l.accounts.map(accountName).join(', ')) : 'Todas'}</small></td><td class="right">${btn('Editar', 'edit-record', `data-key="menuLinks" data-id="${l.id}"`)}</td></tr>`), empty('Nenhum link personalizado', 'Adicione atalhos para sistemas ou ferramentas externas utilizadas pelos clientes.'))}`,
    'api-keys': () => `<div class="page-head"><div><h2>Chaves de API da agência</h2><p class="dim">Chaves de API concedem acesso programático de leitura a subcontas e contatos via <code>/api/v1</code>. O token é exibido apenas uma vez.</p></div>${primary('Criar chave', 'api-key')}</div>
      ${table(['Nome', 'Chave (final)', 'Criada em', 'Último uso', ''], D().apiKeys.map(k => `<tr><td><b>${h(k.name)}</b></td><td><code>go_…${h(k.last4)}</code></td><td>${day(k.created, true)}</td><td>${k.lastUsed ? day(k.lastUsed, true) : 'Nunca'}</td><td class="right">${btn('Revogar', 'api-key-delete', `data-id="${k.id}"`)}</td></tr>`), empty('Nenhuma chave de API', 'Crie chaves de API para automatizar fluxos via scripts ou integrações.'))}
      <p class="dim ag-hint">Tokens com escopos limitados ficam em <a class="text-link" href="#agency/settings/private-integrations">Integrações privadas</a>.</p>
      <div class="surface padded ag-gap"><h2>Endpoints disponíveis</h2><pre class="ag-code" data-bui-code="endpoints.http">GET  ${h(location.origin)}/api/v1/subaccounts
GET  ${h(location.origin)}/api/v1/subaccounts/{id}/contacts
POST ${h(location.origin)}/api/v1/subaccounts/{id}/contacts
Authorization: Bearer &lt;sua-chave&gt;</pre></div>`,
    'private-integrations': () => `<div class="page-head"><div><h2>Integrações privadas</h2><p class="dim">Tokens com escopos estritamente delimitados para scripts e sistemas internos. O token é exibido apenas uma vez.</p></div>${primary('Criar integração', 'private-integration')}</div>
      ${table(['Nome', 'Escopos autorizados', 'Token', 'Criada em', 'Último uso', ''], D().privateIntegrations.map(k => `<tr><td><b>${h(k.name)}</b><br><small class="dim">${h(k.description)}</small></td><td><small>${h(k.scopes.join(', '))}</small></td><td><code>pit_…${h(k.last4)}</code></td><td>${day(k.created, true)}</td><td>${k.lastUsed ? day(k.lastUsed, true) : 'Nunca'}</td><td class="right">${btn('Excluir', 'private-integration-delete', `data-id="${k.id}"`)}</td></tr>`), empty('Nenhuma integração privada', 'Crie uma integração privada para scripts que exigem apenas permissões pontuais.'))}`,
    whatsapp: whatsappSettings,
    phone: whatsappSettings,
    'email-services': () => { const e = D().emailServices, hl = brandHighlight('email');
      // White Label: o domínio de envio da agência na Resend, com os registros SPF/DKIM que faltam publicar.
      const mailStatus = { verified: ['Verificado', 'green'], pending: ['Verificando', 'blue'], failed: ['Falhou', 'red'], temporary_failure: ['Falha temporária', 'red'], not_started: ['Aguardando DNS', ''] };
      const [statusLabel, statusTone] = mailStatus[e.status] || mailStatus.not_started;
      const copyCell = value => `<span class="email-dns-value"><code>${h(value)}</code><button type="button" class="icon-btn" data-ag="copy" data-text="${h(value)}" aria-label="Copiar">${i('copy', 15)}</button></span>`;
      const records = [...(e.records || []), { record: 'DMARC', type: 'TXT', name: `_dmarc.${e.domain}`, value: 'v=DMARC1; p=none;', status: 'recommended' }];
      const recordRows = records.map(r => `<tr><td><b>${h(r.record)}</b></td><td>${h(r.type)}</td><td>${copyCell(r.name)}</td><td>${copyCell(r.value)}</td><td>${r.priority ?? '—'}</td><td>${r.status === 'recommended' ? badge('Recomendado') : badge(...(mailStatus[r.status] || mailStatus.not_started))}</td></tr>`);
      const address = `${e.localPart || 'contato'}@${e.domain}`;
      const connectedText = !e.resendId ? 'Este domínio foi salvo antes da ligação com o serviço de e-mail e nunca foi criado nele. Remova e adicione de novo para receber os registros de DNS.'
        : e.status === 'verified' ? `Verificado. As subcontas escolhidas abaixo enviam como ${h(address)}; as que têm domínio próprio continuam com o delas.`
        : `Publique os registros abaixo no DNS do domínio e clique em <b>Verificar agora</b>. Até lá, as subcontas seguem pelo domínio compartilhado.`;
      return `${e.domain ? `<div class="surface padded ag-notice shc-card shc-panel${e.status === 'verified' ? ' is-connected' : ''}" style="--shc-highlight:${hl}">${shcLayers()}<span class="shc-icon-tile" aria-hidden="true"><span class="shc-icon">${brandIcon('email', 22)}</span></span><div><b>Domínio dedicado: ${h(e.domain)}</b> ${badge(statusLabel, statusTone)}<p>${connectedText}</p></div><div class="inline-gap">${e.resendId && e.status !== 'verified' ? btn('Verificar agora', 'email-domain-status') : ''}${btn('Remover domínio', 'email-domain-remove')}</div></div>
      ${e.resendId ? `<div class="surface table-shell email-dns ag-gap"><table><thead><tr><th scope="col">Registro</th><th scope="col">Tipo</th><th scope="col">Nome</th><th scope="col">Valor</th><th scope="col">Prioridade</th><th scope="col">Status</th></tr></thead><tbody>${recordRows.join('')}</tbody></table></div>` : ''}
      <form class="surface settings-form set-form" data-ag-form="email-domain-accounts"><section class="set-section"><header class="set-head"><h2>Subcontas que enviam pelo domínio dedicado</h2></header><div class="set-body"><label>Endereço de envio<span class="email-local"><input name="localPart" required maxlength="64" value="${h(e.localPart || 'contato')}" aria-label="Parte antes do @"><span>@${h(e.domain)}</span></span></label>${pickAccounts('accounts', e.accounts)}</div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Salvar</button></footer></form>`
      : `<div class="surface padded ag-notice shc-card shc-panel" style="--shc-highlight:${hl}">${shcLayers()}<span class="shc-icon-tile" aria-hidden="true"><span class="shc-icon">${brandIcon('email', 22)}</span></span><div><b>Você está usando um domínio compartilhado</b><p>As subcontas enviam pelo domínio compartilhado da plataforma porque nenhum domínio da agência está conectado. Com um domínio dedicado, faturas, documentos, campanhas e automações das subcontas escolhidas saem com o endereço da agência.</p></div></div>
      <form class="surface settings-form set-form" data-ag-form="email-domain"><section class="set-section"><header class="set-head"><h2>Criar domínio dedicado</h2></header><div class="set-body"><div class="field-grid"><label>Domínio de envio<input name="domain" required placeholder="mail.suaagencia.com.br" maxlength="200"></label><label>Endereço antes do @<input name="localPart" required maxlength="64" value="contato" placeholder="contato"></label></div></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Adicionar domínio</button></footer></form>`}
      <h2 class="section-heading">Desempenho das subcontas</h2>${table(['Subconta', 'Domínio de envio', 'Status'], accounts().map(a => `<tr><td><b>${h(a.name)}</b></td><td>${e.accounts.includes(a.id) && e.status === 'verified' ? h(`${e.localPart || 'contato'}@${e.domain}`) : e.accounts.includes(a.id) ? `${h(e.domain)} (aguardando verificação)` : 'Compartilhado'}</td><td>${badge(a.status, tone(a.status))}</td></tr>`), empty('Nenhuma subconta', 'As subcontas que enviam e-mails aparecem aqui.'))}`; },
    'workflow-premium': () => featureTable('workflow-premium'),
    'external-ai': () => featureTable('external-ai'),
    'domain-purchase': () => featureTable('domain-purchase'),
    affiliates: () => { const aff = D().affiliate, link = `${location.origin}/?ref=${aff.code}`; return `<section class="surface set-card"><div class="set-section"><header class="set-head"><h2>Configurações de afiliado</h2></header><div class="set-body">${aff.accepted ? `<p>Este é o seu link de afiliado. Quem se cadastrar por ele gera ${Math.round(affiliateRate * 100)}% de comissão recorrente para você.</p><div class="ag-copy"><input readonly value="${h(link)}" aria-label="Link de afiliado">${btn('Copiar link', 'copy', `data-text="${h(link)}"`)}</div><p class="dim">Acrescente <code>?ref=${h(aff.code)}</code> ao final de qualquer URL do seu site.</p>` : `<p class="dim">Aceite os termos no Portal de afiliados para gerar seu link.</p><a class="secondary" href="#agency/affiliate">Abrir Portal de afiliados</a>`}</div></div></section>
      <form class="surface settings-form set-form" data-ag-form="affiliate-pixel"><section class="set-section"><header class="set-head"><h2>Configurações da página</h2></header><div class="set-body"><label>ID do Pixel do Facebook<input name="pixelId" inputmode="numeric" maxlength="20" placeholder="ID do Pixel" value="${h(aff.pixelId || '')}"></label></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Salvar</button></footer></form>`; },
    ledger: () => `<div class="page-head"><div><h2>Livro da cobrança</h2><p class="dim">O que a agência recebeu das subcontas: planos, recargas e o movimento das carteiras.</p></div></div>${ledgerPanel({ scope: 'agency', accounts: accounts() })}`,
    fiscal: () => fiscalForm(D().fiscal, { attr: 'data-ag-form="fiscal"', intro: 'Estes dados identificam a agência nos planos e créditos que ela vende às subcontas e vão para o livro que o contador usa.' }),
    abacatepay: abacateSettings,
    announcements: () => `<div class="page-head"><div><h2>Comunicados gerais</h2><p class="dim">Comunicados ativos são exibidos em banner de destaque no topo das subcontas selecionadas.</p></div>${primary('Novo comunicado', 'new-record', 'data-key="announcements"')}</div>${table(['Título', 'Estilo', 'Público-alvo', 'Status', ''], [...D().announcements].reverse().map(a => `<tr><td><b>${h(a.title)}</b><br><small class="dim">${h(a.body.slice(0, 90))}</small></td><td>${h(tr(a.tone))}</td><td><small>${a.accounts.length ? h(a.accounts.map(accountName).join(', ')) : 'Todas as subcontas'}</small></td><td>${badge(a.published ? 'Publicado' : 'Rascunho', a.published ? 'green' : '')}</td><td class="right">${btn('Editar', 'edit-record', `data-key="announcements" data-id="${a.id}"`)}</td></tr>`), empty('Nenhum comunicado', 'Crie comunicados informativos ou alertas para os clientes da agência.'))}`,
    emails: () => `<div class="page-head"><div><h2>E-mails do sistema</h2><p class="dim">Modelos de e-mail disparados pela plataforma. O envio em produção requer um provedor de e-mail conectado.</p></div></div>${systemEmailKeys.map(([key, label]) => { const e = D().systemEmails[key]; return `<form class="surface settings-form set-form" data-ag-form="system-email" data-id="${key}"><section class="set-section"><header class="set-head"><h2>${h(tr(label))}</h2></header><div class="set-body"><label class="ag-full">Assunto<input name="subject" required value="${h(e.subject)}"></label><label class="ag-full">Mensagem<textarea name="body" required>${h(e.body)}</textarea></label></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Salvar modelo</button></footer></form>`; }).join('')}`,
    labs: () => {
      const all = accounts(), manage = A.data.access?.settings;
      const using = (key, mode) => mode === 'all' ? all.length : mode === 'optin' ? all.filter(a => (a.labsOn || []).includes(key)).length : 0;
      return `<section class="surface padded"><h2>${h(tr('Recursos experimentais (Labs)'))}</h2><p class="dim">${h(tr('Funcionalidades em teste. Escolha para cada uma se fica desligada, se cada subconta decide em Configurações → Labs ou se fica ligada em todas.'))}</p></section>
        ${table(['Recurso', 'Onde aparece', 'Disponibilidade', 'Em uso'], labCatalog.map(([key, title, text, where]) => {
          const mode = D().labs?.[key] || 'off';
          return `<tr><td><b>${h(tr(title))}</b><br><small class="dim">${h(tr(text))}</small></td><td>${h(tr(where))}</td>
            <td><select data-ag-lab="${key}" aria-label="${h(tr('Disponibilidade de'))} ${h(tr(title))}" ${manage ? '' : 'disabled'}>${labModes.map(([v, label]) => `<option value="${v}" ${mode === v ? 'selected' : ''}>${h(tr(label))}</option>`).join('')}</select></td>
            <td>${using(key, mode)} <small class="dim">/ ${all.length}</small></td></tr>`;
        }), '')}`;
    },
    compliance: () => { const c = D().compliance; return `<form class="surface settings-form set-form" data-ag-form="compliance"><section class="set-section"><header class="set-head"><h2>Conformidade e privacidade (LGPD)</h2></header><div class="set-body"><div class="field-grid"><label>Período de retenção de dados (dias)<input name="retentionDays" type="number" min="0" max="3650" value="${c.retentionDays}"></label></div><label class="ag-full">Texto padrão de consentimento em formulários<textarea name="consent">${h(c.consent)}</textarea></label><label class="check"><input type="checkbox" name="cookieBanner" ${c.cookieBanner ? 'checked' : ''}> Exibir aviso e banner de cookies nas páginas publicadas</label><label class="check"><input type="checkbox" name="hipaa" ${c.hipaa ? 'checked' : ''}> Modo de dados sensíveis de saúde (requer o complemento correspondente)</label></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Salvar conformidade</button></footer></form>`; },
    audit: () => {
      if (audit.q !== A.query || Date.now() - audit.at > AUDIT_FRESH) scheduleAudit();
      const none = audit.error ? empty('Não foi possível carregar o log', audit.error, btn('Tentar de novo', 'audit-reload'))
        : audit.busy || !audit.at ? `<p class="dim" role="status">${h(tr('Carregando…'))}</p>`
        : A.query ? empty('Nenhum registro encontrado', 'Tente outros termos de busca.')
        : empty('Nenhuma atividade recente', 'Todas as alterações realizadas na agência e nas subcontas são auditadas aqui.');
      const page = audit.trail.length;
      return `<div class="toolbar">${search('Buscar no log de auditoria…')}${btn('Exportar CSV', 'audit-csv', '', 'secondary', 'download')}</div>${table(['Data/Hora', 'Usuário', 'Ação', 'Alvo', 'Detalhes'], audit.entries.map(a => `<tr><td>${day(a.at, true)}</td><td>${h(a.actor)}</td><td><b>${h(a.action)}</b></td><td>${h(a.target)}</td><td><small>${h(a.details)}</small></td></tr>`), none)}
        ${page > 1 || audit.next ? `<div class="inline-gap ag-gap">${btn('Anterior', 'audit-page', `data-step="-1" ${page > 1 && !audit.busy ? '' : 'disabled'}`)}<span>${h(tr('Página'))} ${page}</span>${btn('Próxima', 'audit-page', `data-step="1" ${audit.next && !audit.busy ? '' : 'disabled'}`)}</div>` : ''}`;
    },
    storage: () => { const total = O().totals.storage, max = Math.max(1, ...accounts().map(a => a.storage)); return `<div class="metrics three">${metric('Total de arquivos armazenados', bytes(total))}${metric('Quantidade de arquivos', accounts().reduce((s, a) => s + a.files, 0))}${metric('Subcontas ativas', accounts().length)}</div>${table(['Subconta', 'Arquivos', 'Espaço utilizado', ''], [...accounts()].sort((a, b) => b.storage - a.storage).map(a => `<tr><td><b>${h(a.name)}</b></td><td>${a.files}</td><td>${bytes(a.storage)}</td><td>${bar((a.storage / max) * 100)}</td></tr>`), '')}`; }
  };
  pages.settings = () => { const sub = A.sub || 'profile'; return `<div class="page">${head('Configurações', 'Gerencie dados da empresa, equipe, faturamento, integrações e conformidade.')}${tabCard('settings', `<div class="ag-settings">${settingsPages[sub]()}</div>`, 'Seções de configurações')}</div>`; };

  // ---- Render ------------------------------------------------------------
  function render() {
    if (!active()) return;
    if (!A.data) {
      if (A.openAIOnly && isOpenAIPage()) {
        app.innerHTML = `<main class="page">${head('Configurações', '', '<a class="secondary" href="#dashboard">Voltar para a subconta</a>')}<div class="ag-settings">${openAISettings()}</div></main>`;
      }
      return;
    }
    const prev = document.querySelector('#screen')?.scrollTop || 0;
    const page = pages[A.page] || pages.dashboard;
    document.title = domainBrand()?.name || 'graao';
    applyBrandColor(D().company.primary, D().company.secondary, D().company.accent);
    // The menu stays put while the page redraws: same markup keeps the very same element (no flash, no
    // replayed indicator); a changed one at least keeps where it was scrolled.
    const oldSide = app.querySelector(':scope > .shell > .sidebar'), oldSideHtml = sideHtml;
    const sideTop = oldSide?.querySelector('.side-nav')?.scrollTop || 0;
    app.innerHTML = shell(page());
    const newSide = app.querySelector(':scope > .shell > .sidebar');
    if (oldSide && newSide && sideHtml === oldSideHtml) newSide.replaceWith(oldSide);
    app.querySelector(':scope > .shell > .sidebar .side-nav')?.scrollTo({ top: sideTop, behavior: 'instant' });
    enhanceCode(app);
    for (const picker of app.querySelectorAll('[data-color-picker]')) mountColorPicker(picker);
    const creator = app.querySelector('[data-mobile-creator]');
    if (creator) mobileCreator.mount(creator);
    const chatHost = app.querySelector('[data-graao-chat-host]');
    if (chatHost) graaoChat.mount(chatHost, { conversationId: A.sub });
    else graaoChat.unmount();
    for (const el of app.querySelectorAll('[data-w]')) el.style.width = `${el.dataset.w}%`;
    for (const el of app.querySelectorAll('[data-h]')) el.style.height = `${Math.max(3, Number(el.dataset.h))}%`;
    for (const el of app.querySelectorAll('[data-bg]')) el.style.background = el.dataset.bg;
    if (A.page === 'presentations') {
      attachPresentationListeners(app, {
        agency: D(),
        getAgency: D,
        act,
        dialog,
        closeDialog: close,
        flash
      }, () => render());
    }
    const screen = document.querySelector('#screen'); if (screen && renderKey === `${A.page}/${A.sub}`) screen.scrollTo({ top: prev, behavior: 'instant' });
    renderKey = `${A.page}/${A.sub}`;
  }
  let renderKey = '', sideHtml = '';

  async function show(page, sub) {
    const nextPage = pages[page] ? page : 'dashboard';
    if (nextPage !== A.page) { A.query = ''; A.status = ''; A.selected.clear(); A.bg = null; closePresentationEditor(); }
    A.page = nextPage;
    const normalizedSub = A.page === 'settings' && sub === 'phone' ? 'whatsapp' : A.page === 'settings' && sub === 'stripe' ? 'abacatepay' : sub;
    A.sub = A.page === 'ask'
      ? (sub && /^[\w-]{4,80}$/.test(sub) ? sub : '')
      : A.page === 'prancheta'
        ? sub
        : (subTabs[A.page]?.some(t => t[0] === normalizedSub) ? normalizedSub : '');
    if (A.data) {
      if (!isWhatsAppPage()) stopWaPoll();
      render();
      if (isOpenAIPage() && A.data.access.session && !A.openAI) await refreshOpenAI();
      if (isWhatsAppPage() && !A.wa) await refreshWhatsApp();
      if (isAbacatePage() && !A.abacate) await refreshAbacate();
      if (A.page === 'ai-suite' && A.sub === 'usage' && (!A.aiUsage || A.aiUsage.period !== (A.aiPeriod || '30'))) await loadAiUsage();
      return;
    }
    if (loading) return;
    const currentVisit = visit;
    loading = true;
    applyBrandColor();
    app.innerHTML = bootScreen('Abrindo a agência…');
    try {
      const data = await api('/api/agency');
      if (currentVisit !== visit || !active()) return;
      A.data = data;
      A.openAIOnly = false;
      render();
      if (isOpenAIPage() && data.access.session && !A.openAI) await refreshOpenAI();
      if (isWhatsAppPage() && !A.wa) await refreshWhatsApp();
      if (isAbacatePage() && !A.abacate) await refreshAbacate();
      if (A.page === 'ai-suite' && A.sub === 'usage') void loadAiUsage();
    } catch (e) {
      if (currentVisit !== visit || !active()) return;
      if (e.status === 403 && isOpenAIPage()) {
        A.openAIOnly = true;
        render();
        await refreshOpenAI();
        return;
      }
      app.innerHTML = `<div class="boot"><h1>Visão da agência indisponível</h1><p>${h(e.message)}</p><a href="#dashboard">Voltar para o workspace</a></div>`;
    } finally {
      if (currentVisit === visit) loading = false;
    }
  }

  function leave() {
    visit++;
    loading = false;
    stopWaPoll();
    A.data = null;
    A.openAI = null;
    A.openAIOnly = false;
    A.wa = null;
    A.waFocus = null;
    A.waPairOpen = false;
    graaoChat.reset();
    closePresentationEditor();
  }

  // ---- Events -------------------------------------------------------------
  const active = () => location.hash === '#agency' || location.hash.startsWith('#agency/');
  const download = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const pickAccounts = (name = 'workspaces', chosen = []) => `<fieldset class="ag-checks"><legend>Subcontas selecionadas</legend>${accounts().map(a => `<label class="check"><input type="checkbox" name="${name}" value="${a.id}" ${chosen.includes(a.id) ? 'checked' : ''}> ${h(a.name)}</label>`).join('')}</fieldset>`;
  const oneAccount = (label = 'Subconta de destino') => `<label>${h(label)}<select name="workspace" required>${accounts().map(a => `<option value="${a.id}">${h(a.name)}</option>`).join('')}</select></label>`;
  const secretBox = (title, secret) => dialog(title, `<p>Copie este código agora. Ele não será exibido novamente.</p><div class="ag-copy"><input readonly value="${h(secret)}" aria-label="Código secreto">${btn('Copiar', 'copy', `data-text="${h(secret)}"`)}</div>`);

  installLedger('agency', { api, render });
  document.addEventListener('click', async ev => {
    if (!active()) return;

    // Handle profile click from topbar
    const profBtn = ev.target.closest('[data-ag-profile]');
    if (profBtn) { go('settings', 'company'); return; }

    const domainCheck = ev.target.closest('[data-ag-domain-check]');
    if (domainCheck) {
      const out = domainCheck.parentElement.parentElement.querySelector('[data-ag-domain-status]');
      domainCheck.disabled = true;
      out.textContent = tr('Verificando…');
      try {
        const { result: s } = await api('/api/agency/domain-status', {});
        const proof = s.verification || [];
        const ready = s.pointing && s.verified && !s.proxied;
        const message = !s.hosting ? 'A conexão automática com a hospedagem não está ativa: peça ao suporte do graao para adicionar o domínio.'
          : !s.added ? 'O domínio ainda não foi adicionado à hospedagem. Salve de novo em alguns minutos.'
          : ready ? 'Pronto: o domínio aponta para o graao.'
          : proof.length ? 'Falta provar que o domínio é seu: crie no DNS os registros abaixo e clique em Verificar domínio de novo.'
          : s.proxied ? 'O registro está passando pelo proxy da Cloudflare (nuvem laranja). Mude para “Somente DNS” (nuvem cinza): com o proxy, o endereço mostra erro 525.'
          : 'Aguardando o CNAME: a mudança de DNS pode levar algumas horas.';
        // Os registros que faltam no DNS da agência: o CNAME do endereço e, quando a hospedagem pede, o TXT de posse.
        const records = s.hosting && s.added && !ready ? (s.records || [{ type: 'CNAME', name: s.domain, value: s.cname }, ...proof]) : [];
        out.innerHTML = `<span>${h(tr(message))}</span>${records.length && s.apex ? `<span>${h(tr(`No campo Nome, digite só o que está na coluna Nome: o painel do domínio completa com .${s.apex} sozinho. @ é o próprio ${s.apex}.`))}</span>` : ''}${s.proxied && proof.length ? `<span class="ag-hint">${h(tr('No Cloudflare, deixe o registro do endereço como “Somente DNS” (nuvem cinza).'))}</span>` : ''}${records.length ? `<span class="surface table-shell ag-gap"><table><thead><tr><th scope="col">${h(tr('Tipo'))}</th><th scope="col">${h(tr('Nome'))}</th><th scope="col">${h(tr('Valor'))}</th></tr></thead><tbody>${records.map(r => `<tr><td>${h(r.type)}</td><td><code>${h(r.name)}</code></td><td><code>${h(r.value)}</code></td></tr>`).join('')}</tbody></table></span>` : ''}`;
      } catch (problem) { out.textContent = problem.message; }
      domainCheck.disabled = false;
      return;
    }
    const brandReset = ev.target.closest('[data-ag-brand-reset]');
    if (brandReset) {
      const form = brandReset.closest('form[data-ag-form="company"]');
      const defaults = { primary: '#FF4F9A', secondary: '#C4A7FF', accent: '#6BC9FF' };
      for (const [name, value] of Object.entries(defaults)) {
        const field = form?.querySelector('[name="' + name + '"]');
        if (!field) continue;
        field.value = value;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        D().company[name] = value.toLowerCase();
      }
      applyBrandColor(D().company.primary, D().company.secondary, D().company.accent);
      flash('Paleta oficial Graao restaurada. Salve para aplicar.');
      return;
    }

    const brandTab = ev.target.closest('[data-ag-brand-mockup-tab]');
    if (brandTab) {
      const showcase = brandTab.closest('.ag-brand-showcase');
      const view = brandTab.dataset.view;
      showcase?.querySelectorAll('[data-ag-brand-mockup-tab]').forEach(tab => {
        const active = tab === brandTab;
        tab.classList.toggle('is-active', active);
        tab.setAttribute('aria-selected', String(active));
      });
      showcase?.querySelectorAll('[data-ag-brand-mockup-panel]').forEach(panel => {
        panel.hidden = panel.dataset.agBrandMockupPanel !== view;
        panel.classList.toggle('is-active', !panel.hidden);
      });
      return;
    }

    for (const menu of document.querySelectorAll('.ag-kebab[open]')) if (!menu.contains(ev.target) || ev.target.closest('.ag-kebab-menu [data-ag]')) menu.open = false;
    const b = ev.target.closest('[data-ag]'); if (!b) return;
    const d = b.dataset, id = d.id;
    try {
      switch (d.ag) {
        case 'ai-limit': editAiLimit(id); break;
        case 'ai-period': await loadAiUsage(d.period); break;
        case 'pf-reload': A.pfError = ''; render(); await loadPlatform(); break;
        case 'pf-check': A.pf = await api('/api/platform/check', {}); render(); flash('Serviços conferidos agora.'); break;
        case 'pf-push': await enablePlatformPush(); render(); flash('Notificações de alerta ativadas neste aparelho.'); break;
        case 'ai-apply': {
          const def = D().aiDefaults || {}, all = d.scope === 'all';
          confirmBox(all ? 'Aplicar o limite padrão em todas as subcontas?' : 'Aplicar o limite padrão nas subcontas sem limite?',
            `${def.limit ? `US$ ${Number(def.limit).toFixed(2)} por mês, com alerta em ${pct(def.alertAt || 0.8)}.` : 'O limite padrão é 0: as subcontas ficam sem limite.'}${all ? ' Os limites definidos uma a uma são substituídos.' : ''}`,
            'ai-apply', d.scope, 'Aplicar');
          break;
        }
        case 'bg-new': editGroup(); break;
        case 'bg-edit': editGroup(id); break;
        case 'bg-open': await openGroup(id); break;
        case 'bg-back': A.bg = null; render(); break;
        case 'bg-share': shareGroup(id); break;
        case 'bg-delete': confirmBox('Excluir este grupo de marcas?', 'O relatório e o link compartilhado deixam de existir. As subcontas não são alteradas.', 'bg-delete', id, 'Excluir grupo'); break;
        case 'bg-revoke': await act('brand-group-share', { id, data: { action: 'revoke' } }); render(); shareGroup(id); flash('Link revogado.'); break;
        case 'bg-csv': if (A.bg?.data) download(`grupo-de-marcas-${A.bg.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'relatorio'}.csv`, brandGroupCsv(A.bg.data), 'text/csv;charset=utf-8'); break;
        case 'bg-print': window.print(); break;
        case 'openai-retry': A.openAI = null; render(); await refreshOpenAI(); break;
        case 'openai-disconnect': confirmBox('Desconectar a chave da OpenAI?', 'Você precisará conectar outra chave para voltar a usar os recursos de IA.', 'openai-disconnect', '', 'Desconectar'); break;
        case 'wa-refresh': await refreshWhatsApp(); flash('Status do WhatsApp atualizado.'); break;
        case 'abacate-refresh': A.abacate = null; render(); await refreshAbacate(); break;
        case 'abacate-hooks': A.abacate = await api('/api/abacatepay/agency/refresh-webhook', {}); render(); flash('Avisos do AbacatePay atualizados.'); break;
        case 'abacate-disconnect': confirmBox('Desconectar o AbacatePay?', 'As assinaturas já contratadas continuam no AbacatePay, mas a agência deixa de receber as confirmações de pagamento aqui.', 'abacate-disconnect', '', 'Desconectar'); break;
        case 'abacate-copy': await navigator.clipboard.writeText(d.url); flash('Link da assinatura copiado.'); break;
        case 'abacate-subscribe': {
          b.disabled = true;
          A.data = await api('/api/abacatepay/agency/subscribe', { workspace: id });
          const url = A.data.result?.url;
          render();
          if (url) await navigator.clipboard?.writeText(url).catch(() => {});
          flash(`Link da assinatura de ${accountName(id)} gerado e copiado. Envie ao cliente para ele pagar por Pix ou cartão.`);
          break;
        }
        case 'abacate-cancel': confirmBox(`Cancelar a assinatura de ${accountName(id)}?`, 'A cobrança recorrente é cancelada no AbacatePay. A subconta continua ativa até você mudar o status.', 'abacate-cancel', id, 'Cancelar assinatura'); break;
        case 'wa-disconnect-server': confirmBox('Remover servidor de WhatsApp próprio?', 'A URL e a chave de acesso cadastradas pela agência serão removidas.', 'wa-disconnect-server', '', 'Remover'); break;
        case 'wa-server-check': A.waServer = await api('/api/whatsapp/agency/server'); render(); break;
        case 'wa-sub-remove': confirmBox(`Excluir a instância de ${accountName(id)}?`, 'O número é desconectado e a instância sai do servidor. As conversas continuam no Graao. Para voltar a usar, é só conectar de novo com o QR Code.', 'wa-sub-remove', id, 'Excluir instância'); break;
        case 'wa-focus-close': stopWaPoll(); A.waFocus = null; render(); break;
        case 'wa-sub-open': {
          stopWaPoll();
          const live = await api(`/api/whatsapp/workspace/status?workspace=${encodeURIComponent(id)}`);
          A.waFocus = { ...live, workspace: id };
          if (A.wa?.subaccounts?.[id]) A.wa.subaccounts[id] = { ...A.wa.subaccounts[id], status: live.status, phone: live.phone, profileName: live.profileName };
          if (live.status === 'connecting') startWaPoll(id);
          render();
          break;
        }
        case 'vl-refresh': {
          await refreshVerifyLine();
          if (A.vl?.status === 'connecting') startVerifyLinePoll(); else stopVerifyLinePoll();
          render();
          break;
        }
        case 'vl-connect': {
          A.vl = await api('/api/verify/line', { action: 'connect' });
          if (A.vl.status !== 'connected') startVerifyLinePoll(); else stopVerifyLinePoll();
          render();
          break;
        }
        case 'wa-sub-connect': {
          stopWaPoll();
          A.waFocus = { workspace: id, status: 'connecting', qrcode: '', paircode: '', phone: '', profileName: '' };
          render();
          const live = await api(`/api/whatsapp/workspace/connect?workspace=${encodeURIComponent(id)}`, {});
          A.waFocus = { ...live, workspace: id };
          if (A.wa?.subaccounts?.[id]) A.wa.subaccounts[id] = { ...A.wa.subaccounts[id], hasInstance: true, status: live.status, phone: live.phone, profileName: live.profileName };
          render();
          if (live.status === 'connecting') { startWaPoll(id); flash('QR Code pronto! Aponte a câmera do WhatsApp.'); }
          else if (live.status === 'connected') flash('WhatsApp conectado!');
          break;
        }
        case 'wa-sub-disconnect': {
          stopWaPoll();
          const live = await api(`/api/whatsapp/workspace/disconnect?workspace=${encodeURIComponent(id)}`, {});
          if (A.waFocus?.workspace === id) A.waFocus = { ...live, workspace: id };
          if (A.wa?.subaccounts?.[id]) A.wa.subaccounts[id] = { ...A.wa.subaccounts[id], status: 'disconnected', phone: '' };
          render();
          flash('WhatsApp da subconta desconectado.');
          break;
        }
        case 'go-profile': go('settings', 'company'); break;
        case 'nav': A.navOpen = !A.navOpen; render(); G('[data-ag="nav"]')?.focus(); break;
        case 'tab': go(A.page, d.sub); break;
        case 'switch-account': {
          const view = d.view === 'ai-agents' ? d.view : '';
          const available = !view || !A.data.access.modules || A.data.access.modules.includes(view);
          const personal = A.data.personalWorkspace;
          const tile = name => `<span class="ws-tile" aria-hidden="true">${h(initials(name))}</span>`;
          const personalChoice = personal ? `<button class="choice ws-choice" data-ag="open-personal-workspace" data-view="${view}">${tile(personal.name)}<span class="ws-text"><strong>${h(personal.name)}</strong><span>${tr('Workspace pessoal')}</span></span></button>` : '';
          const choices = personalChoice + accounts().map(a => `<button class="choice ws-choice" data-ag="open-account" data-id="${a.id}" data-view="${view}">${tile(a.name)}<span class="ws-text"><strong>${h(a.name)}</strong><span>${h(tr(a.status))} · ${a.contacts} contatos</span></span></button>`).join('');
          const company = D().company;
          const here = view ? '' : `<p class="ws-label">${tr('Agência')}</p><div class="choice ws-choice ws-agency ws-here" aria-current="true"><span class="ws-tile" aria-hidden="true">${i('users', 18)}</span><span class="ws-text"><strong>${h(company.name || tr('Minha Agência'))}</strong><span>${tr('Você está no painel da agência')}</span></span><span class="ws-current">${i('check', 13)} ${tr('Atual')}</span></div><p class="ws-label">${tr('Subcontas')}</p>`;
          dialog(view ? 'Abrir Agentes de IA' : 'Trocar para uma subconta', available
            ? `<div class="ag-switch ws-switch">${here}${choices || '<p class="dim">Nenhuma subconta disponível.</p>'}</div>`
            : '<p class="dim">Você não tem acesso a Agentes de IA.</p>');
          break;
        }
        case 'open-personal-workspace': close(); await openWorkspace(A.data.personalWorkspace.id, d.view === 'ai-agents' ? d.view : undefined, A.data.personalWorkspace.name); break;
        case 'open-account': {
          close();
          const name = accountName(id);
          // Stamp "último acesso" in the background; the switch no longer waits on it.
          const meta = accounts().find(a => a.id === id);
          if (meta?.status === 'Active') {
            meta.lastLogin = new Date().toISOString();
            api('/api/agency/action', { type: 'account-open', id }).catch(() => {});
          }
          await openWorkspace(id, d.view === 'ai-agents' ? d.view : undefined, name);
          break;
        }
        case 'new-account': dialog('Criar nova subconta', accountForm(), { form: 'account', submit: 'Criar subconta' }); break;
        case 'edit-account': {
          const a = accounts().find(x => x.id === id), meta = D().accounts[id] || {};
          dialog(`Editar ${a.name}`, `<div class="field-grid"><label>Status<select name="status">${['Active', 'Paused', 'Closed'].map(s => `<option value="${s}" ${a.status === s ? 'selected' : ''}>${tr(s)}</option>`).join('')}</select></label><label>Plano SaaS<select name="plan"><option value="">Sem plano</option>${D().plans.map(p => `<option value="${p.id}" ${meta.plan === p.id ? 'selected' : ''}>${h(p.name)}</option>`).join('')}</select></label><label>Endereço<input name="address" value="${h(meta.address)}"></label>${phoneField({ name: 'phone', label: 'Telefone', value: meta.phone || '', id: 'ag-meta-phone' })}<label>Site<input name="website" type="url" value="${h(meta.website)}"></label></div>
            <label>Motivo da suspensão ou encerramento<textarea name="suspendedReason" maxlength="500">${h(meta.suspendedReason || '')}</textarea><small class="dim">Visível para usuários da subconta enquanto o acesso estiver bloqueado.</small></label>`, { form: 'account-meta', id, submit: 'Salvar alterações' });
          break;
        }
        case 'trash-account': {
          const name = accountName(id);
          dialog(`Excluir ${name}?`, `<p>A subconta sai da lista e ninguém mais consegue entrar nela. Automações, campanhas e publicações param na hora.</p>
            <p>Ela fica na <b>Lixeira</b> por 30 dias e pode ser restaurada nesse prazo. Depois, contatos, conversas, negócios e todos os outros dados são apagados de vez.</p>
            <label>Para confirmar, digite <b>${h(name)}</b><input name="confirm" required autocomplete="off" spellcheck="false" maxlength="120"></label>`,
          { form: 'account-trash', id, submit: 'Excluir subconta' });
          G('#dialog form button.primary')?.classList.replace('primary', 'danger');
          break;
        }
        case 'restore-account':
          dialog(`Restaurar ${d.name || 'subconta'}?`, '<p>A subconta volta para a lista com o status que tinha antes de ser excluída. Os usuários recuperam o acesso permitido.</p>', { form: 'account-restore', id, submit: 'Restaurar subconta' });
          break;
        case 'reactivate-account':
          dialog(`Reativar ${accountName(id)}`, '<p>Os usuários recuperam o acesso permitido. Publicações pendentes poderão voltar a ser processadas.</p>', { form: 'account-reactivate', id, submit: 'Reativar subconta' });
          break;
        case 'bulk-status': dialog(`Alterar status de ${A.selected.size} subconta(s)`, `<label>Novo status<select name="status">${['Active', 'Paused', 'Closed'].map(s => `<option value="${s}">${tr(s)}</option>`).join('')}</select></label><label>Motivo visível para usuários com acesso bloqueado<textarea name="suspendedReason" maxlength="500"></textarea></label>`, { form: 'bulk-status', submit: 'Atualizar status' }); break;
        case 'bulk-snapshot': if (!D().snapshots.length) { flash('Crie um setup primeiro.', true); break; } dialog(`Carregar setup em ${A.selected.size} subconta(s)`, `<label>Setup<select name="id">${D().snapshots.map(s => `<option value="${s.id}">${h(s.name)}</option>`).join('')}</select></label>${loadMode()}`, { form: 'bulk-snapshot', submit: 'Carregar setup' }); break;
        case 'new-record': editRecord(d.key); break;
        case 'edit-record': editRecord(d.key, id); break;
        case 'delete-record': confirmBox('Excluir este registro?', 'Esta ação não poderá ser desfeita.', `delete:${d.key}`, id, 'Excluir'); break;
        case 'prospect-report': { const p = D().prospects.find(x => x.id === id); dialog('Relatório de auditoria', prospectReport(p) + `<div class="inline-gap">${btn('Baixar HTML', 'prospect-download', `data-id="${id}"`, 'primary', 'download')}</div>`, { wide: true }); break; }
        case 'prospect-download': { const p = D().prospects.find(x => x.id === id); download(`${p.name.replace(/[^\w-]+/g, '-')}-auditoria.html`, reportHtml(p), 'text/html'); break; }
        case 'prospect-convert': dialog('Criar subconta para este prospect', `<label>Setup inicial<select name="snapshotId"><option value="">Começar em branco</option>${D().snapshots.map(s => `<option value="${s.id}">${h(s.name)}</option>`).join('')}</select></label>`, { form: 'prospect-convert', id, submit: 'Criar subconta' }); break;
        case 'snapshot-create': dialog('Criar setup', `<label>Nome do setup<input name="name" required maxlength="100"></label>${oneAccount('Subconta de origem')}${snapshotAssetGroups.map(([group, keys]) => `<fieldset class="ag-checks"><legend>${h(group)}</legend>${keys.filter(k => k !== 'stages' && k !== 'snippetFolders').map(k => `<label class="check"><input type="checkbox" name="include" value="${k}" checked> ${h(assetLabelsPt[k] || k)}</label>`).join('')}</fieldset>`).join('')}<p class="dim">Contatos, conversas e pagamentos nunca são incluídos. Etapas acompanham os pipelines e pastas acompanham workflows e snippets. Páginas, fluxos e chats entram desligados.</p>`, { form: 'snapshot-create', submit: 'Criar setup' }); break;
        case 'snapshot-load': { const s = D().snapshots.find(x => x.id === id); dialog(`Carregar “${s.name}”`, loadWizard(s), { form: 'snapshot-load', id, submit: 'Carregar setup', wide: true }); break; }
        case 'snapshot-preview': {
          const form = b.closest('form'), out = form.querySelector('[data-snap-conflicts]'), picked = loadPicks(form);
          if (!picked.workspaces.length) { out.innerHTML = '<p class="form-status">Selecione pelo menos uma subconta na etapa 1.</p>'; break; }
          out.innerHTML = '<p class="dim">Verificando conflitos…</p>';
          const result = await call('snapshot-preview', { id: form.dataset.id, workspaces: picked.workspaces, items: picked.items });
          out.innerHTML = conflictTable(result, D().snapshots.find(x => x.id === form.dataset.id)?.protected);
          break;
        }
        case 'snapshot-account': dialog('Criar subconta com este setup', accountForm({ snapshotId: id }), { form: 'account', submit: 'Criar subconta' }); break;
        case 'snapshot-history': {
          const s = D().snapshots.find(x => x.id === id), loads = D().snapshotLoads.filter(l => l.snapshotId === id).reverse();
          dialog(`Histórico de “${s.name}”`, loads.length ? table(['Subconta', 'Modo', 'Adicionados', 'Sobrescritos', 'Mantidos', 'Quando'], loads.map(l => `<tr><td>${h(l.account)}</td><td>${l.mode === 'overwrite' ? 'Sobrescrever' : 'Manter existentes'}${l.partial ? ' · seleção' : ''}</td><td>${l.added}</td><td>${l.overwritten}</td><td>${l.skipped}</td><td>${day(l.at, true)}</td></tr>`)) : empty('Ainda não carregado', 'Quando este setup for carregado em uma subconta, o registro aparece aqui.'), { wide: true });
          break;
        }
        case 'snapshot-share': {
          const mine = D().snapshots.filter(s => !s.protected);
          const s = id ? D().snapshots.find(x => x.id === id) : null;
          dialog('Compartilhar setup por código', `${s ? `<input type="hidden" name="id" value="${h(s.id)}"><p><b>${h(s.name)}</b> · <span class="dim">${h(assetSummary(s.counts))}</span></p>` : `<label>Setup<select name="id" required>${mine.map(x => `<option value="${x.id}">${h(x.name)}</option>`).join('')}</select></label>`}
            <label class="check"><input type="checkbox" name="protect" ${s?.shareProtected ? 'checked' : ''}> Proteger os ativos (quem importa não vê o conteúdo e não pode compartilhar de novo)</label>
            ${s?.shareCode ? `<div class="ag-copy"><input readonly value="${h(s.shareCode)}" aria-label="Código de importação">${btn('Copiar', 'copy', `type="button" data-text="${h(s.shareCode)}"`)}</div>` : '<p class="dim">Vamos gerar um código de 12 caracteres para você enviar à outra agência.</p>'}`, { form: 'snapshot-share', submit: s?.shareCode ? 'Salvar proteção' : 'Gerar código' });
          break;
        }
        case 'snapshot-unshare': confirmBox('Revogar o código de importação?', 'O código deixa de funcionar imediatamente. Quem já importou mantém a cópia.', 'snapshot-unshare', id, 'Revogar'); break;
        case 'snapshot-import': dialog('Importar setup', `<label>Código de importação<input name="code" required maxlength="40" pattern="[0-9a-fA-F]{12}" placeholder="ex.: 3f9a1c0b7d2e" autocomplete="off"></label><p class="dim">Peça o código para a agência que compartilhou o setup. Ele aparece em <b>Meus setups</b> como importado e pode ser carregado em qualquer subconta.</p>`, { form: 'snapshot-import', submit: 'Importar' }); break;
        case 'snapshot-refresh': confirmBox('Atualizar setup?', `Substituir o conteúdo do setup pelos ativos mais recentes de ${accountName(D().snapshots.find(x => x.id === id).workspace)}.`, 'snapshot-refresh', id, 'Atualizar'); break;
        case 'snapshot-rename': { const s = D().snapshots.find(x => x.id === id); dialog('Renomear setup', `<label>Novo nome<input name="name" required maxlength="100" value="${h(s.name)}"></label>`, { form: 'snapshot-rename', id, submit: 'Renomear' }); break; }
        case 'snapshot-delete': confirmBox('Excluir setup?', 'As subcontas que já carregaram este setup manterão seus recursos normalmente.', 'snapshot-delete', id, 'Excluir'); break;
        case 'go-marketplace': close(); go('snapshots', 'templates'); break;
        case 'go-my-setups': close(); go('snapshots', 'imported'); break;
        case 'ghl-import': await openGhlImport(); break;
        case 'ghl-view-setup': stopGhl(); close(); go('snapshots', 'imported'); break;
        case 'go-templates': close(); go('snapshots', 'templates'); break;
        case 'snap-sort': A.snapSort = A.snapSort === 'asc' ? 'desc' : 'asc'; render(); G('[data-ag="snap-sort"]')?.focus(); break;
        case 'gal-view': A.galView = { ...A.galView, [d.scope]: d.view }; render(); G(`[data-ag="gal-view"][data-scope="${d.scope}"][data-view="${d.view}"]`)?.focus(); break;
        case 'setup-open': {
          const s = D().snapshots.find(x => x.id === id); if (!s) break;
          const published = M().some(item => item.mine && item.sourceSnapshotId === s.id), linked = linkedAccounts(s.id).size;
          const extra = [['snapshot-rename', 'Renomear'], s.protected ? null : ['snapshot-share', s.shared ? 'Código de compartilhamento' : 'Compartilhar por código'],
            ['snapshot-history', 'Ver histórico'], s.kind === 'mine' && s.workspace ? ['snapshot-refresh', 'Atualizar a partir da subconta'] : null].filter(Boolean);
          dialog(s.name, `<div class="ag-tpl-detail">${setupArt(setupSegment(s), s.id, s.name)}<div><div class="inline-gap"><span class="ag-tpl-badge">${h(setupCategory(s))}</span><span class="ag-ver">v${s.version || 1}</span>${s.protected ? '<span class="badge blue">Protegido</span>' : ''}${s.shared ? '<span class="badge green">Compartilhado</span>' : ''}</div>
              <p class="dim">${linked ? `${linked} subconta(s) vinculada(s)` : 'Nenhuma subconta vinculada'} · atualizado em ${day(s.updated || s.created, true)}</p><div class="ag-mkt-chips">${assetChips(s.counts)}</div></div></div>
            <div class="inline-gap">${btn('Carregar em subcontas', 'snapshot-load', `data-id="${s.id}"`, 'primary', 'upload')}${btn('Criar subconta com este setup', 'snapshot-account', `data-id="${s.id}"`, 'secondary', 'plus')}</div>
            <div class="inline-gap ag-setup-more">${extra.map(([ag, label]) => btn(label, ag, `data-id="${s.id}"`)).join('')}${btn('Copiar ID', 'copy', `data-text="${h(s.id)}"`)}${btn('Excluir', 'snapshot-delete', `data-id="${s.id}"`, 'secondary danger')}</div>`, { wide: true });
          break;
        }
        case 'tpl-view': A.tplView = d.view; render(); G(`[data-ag="tpl-view"][data-view="${d.view}"]`)?.focus(); break;
        case 'template-open': {
          const t = (A.templates || []).find(x => x.id === id); if (!t) break;
          dialog(t.title, `<div class="ag-tpl-detail">${setupArt(t.segment, t.id, t.title)}<div><span class="ag-tpl-badge">${h(t.category)}</span><p>${h(t.summary)}</p><p class="dim">${h(t.description)}</p><div class="ag-mkt-chips">${assetChips(t.counts)}</div></div></div>
            <div class="inline-gap">${btn('Criar subconta com este template', 'template-account', `data-id="${t.id}"`, 'primary', 'plus')}${btn('Salvar em Importados', 'marketplace-install', `data-id="${t.id}"`)}</div>`, { wide: true });
          break;
        }
        case 'template-account': { const t = (A.templates || []).find(x => x.id === id); close(); dialog(`Criar subconta: ${t?.title || 'template'}`, accountForm({ templateId: id, templateName: t?.title }), { form: 'account', submit: 'Criar subconta' }); break; }
        case 'marketplace-preview': {
          const item = M().find(x => x.id === id);
          if (!item) break;
          const sections = Object.entries(item.preview || {}).map(([k, names]) => {
            const total = item.counts?.[k] || names.length;
            const more = total > names.length ? `<li class="dim">+ ${total - names.length} mais</li>` : '';
            return `<div class="ag-mkt-sec"><h4>${h(assetLabelsPt[k] || k)} (${total})</h4><ul>${names.map(n => `<li>${h(n)}</li>`).join('')}${more}</ul></div>`;
          }).join('');
          const tagsHtml = (item.tags || []).length ? `<div class="ag-mkt-chips">${item.tags.map(t => `<span class="ag-mkt-chip">#${h(t)}</span>`).join('')}</div>` : '';
          const installed = D().snapshots.some(s => s.marketplaceId === item.id);
          const cta = item.mine
            ? `${item.sourceSnapshotId ? btn('Editar / Atualizar publicação', 'marketplace-publish', `data-id="${item.sourceSnapshotId}"`, 'primary') : ''}${btn('Retirar do marketplace', 'marketplace-unpublish', `data-id="${item.id}"`)}`
            : btn(installed ? 'Adicionar outra cópia à biblioteca' : 'Usar este setup gratuitamente', 'marketplace-install', `data-id="${item.id}"`, 'primary');
          dialog(item.title, `<div class="ag-mkt-detail">
            <div class="ag-mkt-art">${setupArt(item.segment || categorySegments[item.category] || 'other', item.id, item.title)}</div>
            <div class="inline-gap"><span class="badge">${h(item.category)}</span>${item.official ? '<span class="badge blue">Graao Oficial</span>' : '<span class="badge">Comunidade</span>'}<span class="badge green">Gratuito</span><span class="dim">Por <b>${h(item.author)}</b> · v${item.version || 1} · ${item.installs === 1 ? '1 uso' : `${item.installs || 0} usos`}</span></div>
            <p class="ag-mkt-desc">${h(item.description || item.summary)}</p>
            ${tagsHtml}
            ${sections ? `<div><h3 style="margin:0 0 8px;font-size:14px">O que vem neste setup</h3><div class="ag-mkt-sections">${sections}</div></div>` : `<p class="dim">${h(assetSummary(item.counts))}</p>`}
            <p class="dim">Contatos, conversas e pagamentos nunca são compartilhados. Páginas e workflows entram como rascunhos prontos para revisão.</p>
            <div class="inline-gap">${cta}</div>
          </div>`, { wide: true });
          break;
        }
        case 'marketplace-install': {
          const installed = await call('marketplace-install', { id });
          render();
          dialog('Setup adicionado à sua biblioteca', `<p><b>${h(installed.name)}</b> foi salvo em <b>Importados</b> e já pode ser carregado em qualquer subconta ou usado como setup inicial.</p><div class="inline-gap">${btn('Carregar em uma subconta agora', 'snapshot-load', `data-id="${installed.snapshotId}"`, 'primary')}${btn('Ver em Importados', 'go-my-setups')}</div>`);
          break;
        }
        case 'marketplace-publish': {
          const own = D().snapshots.filter(s => s.kind === 'mine');
          if (!own.length) {
            flash('Crie um setup a partir de uma subconta primeiro para publicar no marketplace.', true);
            break;
          }
          const selected = own.find(s => s.id === id) || own[0];
          const existing = M().find(x => x.mine && x.sourceSnapshotId === selected.id);
          const isEdit = Boolean(existing);
          dialog(isEdit ? 'Atualizar publicação no marketplace' : 'Publicar setup no marketplace', `<div class="field-grid">
            <label class="ag-full">Setup de origem<select name="snapshotId" required data-ag-mkt-pick>${own.map(s => `<option value="${s.id}" ${s.id === selected.id ? 'selected' : ''}>${h(s.name)} (v${s.version || 1})</option>`).join('')}</select></label>
            <label>Título no marketplace<input name="title" required maxlength="100" value="${h(existing?.title || selected.name)}"></label>
            <label>Categoria / Nicho<select name="category">${marketplaceCategories.map(c => `<option value="${h(c)}" ${(existing?.category || selected.marketplaceCategory || '') === c ? 'selected' : ''}>${h(c)}</option>`).join('')}</select></label>
            <label class="ag-full">Resumo curto (aparece no card)<input name="summary" required maxlength="180" placeholder="Ex.: Funil completo de avaliação, automações e agente de IA pronto para uso." value="${h(existing?.summary || selected.marketplaceSummary || '')}"></label>
            <label class="ag-full">Descrição detalhada<textarea name="description" rows="4" maxlength="1200" placeholder="Explique para qual negócio este setup funciona melhor e o que ele resolve.">${h(existing?.description || selected.marketplaceDescription || '')}</textarea></label>
            <label class="ag-full">Tags (opcional, separadas por vírgula)<input name="tags" maxlength="180" placeholder="ex.: estética, whatsapp, crm, ia" value="${h((existing?.tags || selected.marketplaceTags || []).join(', '))}"></label>
          </div><p class="dim">Publicação gratuita e imediata. Apenas a estrutura do setup é publicada — contatos, conversas e pagamentos nunca são expostos.</p>`, { form: 'marketplace-publish', id: existing?.id || '', submit: isEdit ? 'Atualizar no marketplace' : 'Publicar no marketplace', wide: true });
          break;
        }
        case 'marketplace-unpublish': confirmBox('Retirar setup do marketplace?', 'Ele deixará de aparecer no catálogo público. Agências que já adicionaram este setup continuarão com a cópia local normalmente.', 'marketplace-unpublish', id, 'Retirar do marketplace'); break;
        case 'addon-request': dialog(`Solicitar ${addOns.find(a => a.key === id).name}`, '<label>Observação para a equipe (opcional)<textarea name="note" maxlength="1000"></textarea></label><p class="dim">O pedido será registrado para análise. Nenhuma cobrança é realizada de imediato.</p>', { form: 'addon-request', id, submit: 'Enviar solicitação' }); break;
        case 'addon-cancel': await act('addon-cancel', { id }); render(); flash('Solicitação retirada.'); break;
        case 'affiliate-step': await act('affiliate-step', { data: { step: d.step } }); render(); break;
        case 'affiliate-pay': { const amount = await act('affiliate-pay'); render(); flash(`Pagamento de ${money(amount)} registrado.`); break; }
        case 'copy': await navigator.clipboard.writeText(d.text).then(() => flash('Copiado para a área de transferência.'), () => flash('Selecione o texto e copie manualmente.', true)); break;
        case 'idea-vote': await act('idea-vote', { id }); render(); break;
        case 'idea-comments': { const x = D().ideas.find(r => r.id === id); dialog(x.title, `${x.comments.map(cm => `<div class="line-item"><div><b>${h(cm.author)}</b> <small class="dim">${day(cm.at, true)}</small><p>${h(cm.body)}</p></div></div>`).join('') || '<p class="dim">Nenhum comentário registrado ainda.</p>'}<label>Adicionar comentário<textarea name="body" required maxlength="2000"></textarea></label>`, { form: 'idea-comment', id, submit: 'Comentar' }); break; }
        case 'move-up': case 'move-down': { const li = b.closest('li'); if (d.ag === 'move-up' && li.previousElementSibling) li.parentNode.insertBefore(li, li.previousElementSibling); if (d.ag === 'move-down' && li.nextElementSibling) li.parentNode.insertBefore(li.nextElementSibling, li); b.focus(); break; }
        case 'integration': { const x = integrationCatalog.find(r => r[0] === id); dialog(`Disponibilidade: ${x[1]}`, `<p class="dim">As subcontas selecionadas verão este app disponível. Cada cliente precisará da sua própria conta de ${h(x[1])} para conectar.</p>${pickAccounts('accounts', D().integrations[id]?.accounts || [])}`, { form: 'integration', id, submit: 'Salvar disponibilidade' }); break; }
        case 'act-as': localStorage.setItem('go.user', id); flash('Navegando com as permissões do usuário selecionado.'); location.hash = '#dashboard'; location.reload(); break;
        case 'subwallet': { const acc = accounts().find(a => a.id === id); dialog(`Carteira de ${acc?.name || 'subconta'}`, `<p class="dim">Saldo atual: <b>${money(acc?.wallet?.balance || 0)}</b>. Lance o crédito quando receber do cliente por fora (Pix, boleto, transferência).</p><div class="field-grid"><label>Tipo<select name="kind"><option value="credit">Crédito (recarga recebida)</option><option value="debit">Débito (ajuste)</option></select></label><label>Valor (R$)<input name="amount" type="number" min="0.01" max="100000" step="0.01" required></label></div><label>Observação<input name="note" maxlength="200" placeholder="Ex.: Pix de novembro"></label>`, { form: 'subwallet', id, submit: 'Lançar' }); break; }
        case 'wallet': dialog('Lançamento na carteira', `<div class="field-grid"><label>Tipo de operação<select name="kind"><option value="Credit">Crédito</option><option value="Charge">Débito</option></select></label><label>Valor (R$)<input name="amount" type="number" min="0.01" step="0.01" required></label></div><label>Observação<input name="note" maxlength="200"></label>`, { form: 'wallet', submit: 'Registrar lançamento' }); break;
        case 'api-key': dialog('Criar chave de API', '<label>Identificação da chave<input name="name" required maxlength="80"></label>', { form: 'api-key', submit: 'Criar chave' }); break;
        case 'api-key-delete': confirmBox('Revogar esta chave de API?', 'Sistemas ou integrações que utilizam esta chave deixarão de funcionar imediatamente.', 'api-key-delete', id, 'Revogar'); break;
        case 'private-integration': dialog('Criar integração privada', `<label>Nome da integração<input name="name" required maxlength="80"></label><label>Descrição do propósito<input name="description" maxlength="500"></label><fieldset class="ag-checks"><legend>Escopos de acesso</legend>${apiScopes.map(([scope, label]) => `<label class="check"><input type="checkbox" name="scopes" value="${scope}"> ${h(tr(label))} <small class="dim">${scope}</small></label>`).join('')}</fieldset>`, { form: 'private-integration', submit: 'Criar token' }); break;
        case 'private-integration-delete': confirmBox('Excluir esta integração?', 'O token associado deixará de funcionar imediatamente.', 'private-integration-delete', id, 'Excluir'); break;
        case 'desktop-publish': await act('desktop-app-publish'); go('desktop-app'); flash('App desktop publicado. Envie o link de instalação para a equipe e os clientes.'); break;
        case 'desktop-remove': await act('desktop-app', { data: { [id]: 'remove' } }); go('desktop-app'); flash('Imagem removida.'); break;
        case 'desktop-copy': await navigator.clipboard.writeText(id).then(() => flash('Link copiado.'), () => flash('Selecione o link e copie.', true)); break;
        case 'saas-mode': await act('saas-mode', { data: { enabled: Boolean(d.on) } }); go('saas'); flash(d.on ? 'Modo SaaS ativado.' : 'Modo SaaS desativado.'); break;
        case 'app-install': {
          const name = appName(id), avail = D().integrations[id]?.accounts || [];
          dialog(`Instalar ${name}`, `<label>Onde instalar<select name="scope">${appScopes.map(s => `<option value="${s}">${s === 'Agency' ? 'Na agência' : 'Em uma subconta'}</option>`).join('')}</select></label><label>Subconta (para instalação em subconta)<select name="account"><option value="">—</option>${accounts().filter(a => avail.includes(a.id)).map(a => `<option value="${a.id}">${h(a.name)}</option>`).join('')}</select></label><p class="dim">${avail.length ? 'Só aparecem subcontas para as quais o app está disponível.' : 'O app ainda não está disponível para nenhuma subconta. Use "Gerenciar disponibilidade" para liberá-lo.'}</p>`, { form: 'app-install', id, submit: 'Instalar' });
          break;
        }
        case 'app-uninstall': confirmBox('Desinstalar este app?', 'A instalação sai da lista e deixa de contar nos ganhos.', 'app-uninstall', id, 'Desinstalar'); break;
        case 'email-domain-status': { const status = await act('email-domain-status'); render(); flash(status === 'verified' ? 'Domínio verificado: as subcontas escolhidas já enviam por ele.' : 'Ainda não verificado. A propagação do DNS pode levar algumas horas.', status !== 'verified'); break; }
        case 'email-domain-remove': confirmBox('Remover o domínio dedicado?', 'As subcontas voltam a enviar pelo domínio compartilhado.', 'email-domain-remove', '', 'Remover'); break;
        case 'audit-page': if (!audit.busy) await loadAudit(Number(d.step) > 0 ? [...audit.trail, audit.next] : audit.trail.slice(0, -1)); break;
        case 'audit-reload': await loadAudit(); break;
        case 'audit-csv': await exportAudit(); break;
      }
    } catch (e) { flash(e.message, true); }
  });

  const loadMode = () => `<fieldset class="ag-checks"><legend>Quando já existir um recurso com o mesmo nome</legend><label class="check"><input type="radio" name="mode" value="skip" checked> Manter o recurso existente</label><label class="check"><input type="radio" name="mode" value="overwrite"> Sobrescrever com a versão do setup</label></fieldset>`;

  // Load wizard (GHL parity): 1. sub-accounts (linked / available / all) · 2. assets picked per record · 3. conflict check with a rule per type.
  function loadWizard(s) {
    const linked = linkedAccounts(s.id);
    const filter = linked.size ? 'linked' : 'all';
    const accountsList = accounts().map(a => `<label class="check" data-snap-account="${linked.has(a.id) ? 'linked' : 'available'}" ${filter === 'linked' && !linked.has(a.id) ? 'hidden' : ''}><input type="checkbox" name="workspaces" value="${a.id}"> ${h(a.name)}${linked.has(a.id) ? ' <span class="badge">Vinculada</span>' : ''}</label>`).join('');
    const keys = Object.entries(s.counts || {}).filter(([k, n]) => n && !snapshotHelperKeys.includes(k)).map(([k]) => k);
    const assetsHtml = s.protected || !s.assets
      ? `<p class="dim">Setup protegido: você escolhe os tipos de recurso, mas o conteúdo não é exibido.</p>${keys.map(k => `<label class="check"><input type="checkbox" name="cat" value="${k}" checked> ${h(assetLabelsPt[k] || k)} <span class="dim">(${s.counts[k]})</span></label>`).join('')}`
      : `<input type="search" data-snap-search placeholder="Buscar recurso pelo nome" aria-label="Buscar recurso">${keys.map(k => `<details class="ag-snap-cat"><summary><label class="check"><input type="checkbox" data-snap-cat="${k}" checked> ${h(assetLabelsPt[k] || k)} <span class="dim" data-snap-count="${k}">(${s.counts[k]}/${s.counts[k]})</span></label></summary>
          ${(s.assets[k] || []).map(row => `<label class="check ag-snap-item" data-snap-name="${h(snapRowName(row).toLowerCase())}"><input type="checkbox" name="item" value="${k}:${h(row.id)}" checked> ${h(snapRowName(row))}</label>`).join('')}</details>`).join('')}`;
    return `<ol class="ag-snap-steps">
      <li><fieldset class="ag-checks"><legend>1. Subcontas</legend>
        <div class="inline-gap" role="radiogroup" aria-label="Filtrar subcontas">${[['linked', 'Vinculadas'], ['available', 'Disponíveis'], ['all', 'Todas']].map(([v, l]) => `<label class="check"><input type="radio" name="accountFilter" value="${v}" data-snap-filter ${filter === v ? 'checked' : ''}> ${l}</label>`).join('')}</div>
        ${accountsList || '<p class="dim">Nenhuma subconta criada ainda.</p>'}
        <p class="dim">Vinculadas são as subcontas que já receberam este setup.</p></fieldset></li>
      <li><fieldset class="ag-checks"><legend>2. Recursos</legend>${assetsHtml}<p class="dim">Etapas, pastas, formulários e links usados pelos recursos escolhidos vêm junto automaticamente.</p></fieldset></li>
      <li><fieldset class="ag-checks"><legend>3. Conflitos</legend>${loadMode()}
        <div class="inline-gap">${btn('Verificar conflitos', 'snapshot-preview', 'type="button"', 'secondary', 'search')}<span class="dim">Opcional: veja o que já existe nas subcontas e escolha a regra por tipo.</span></div>
        <div data-snap-conflicts></div></fieldset></li>
    </ol>`;
  }
  // What the wizard asks to load: sub-accounts, records per type ('*' for a whole protected type) and per-type conflict rules.
  function loadPicks(form) {
    const workspaces = [...form.querySelectorAll('input[name="workspaces"]:checked')].map(x => x.value);
    const items = {};
    for (const box of form.querySelectorAll('input[name="item"]:checked')) { const at = box.value.indexOf(':'); (items[box.value.slice(0, at)] ??= []).push(box.value.slice(at + 1)); }
    for (const box of form.querySelectorAll('input[name="cat"]:checked')) items[box.value] = '*';
    const modes = {};
    for (const sel of form.querySelectorAll('select[data-snap-mode]')) if (sel.value) modes[sel.dataset.snapMode] = sel.value;
    return { workspaces, items, modes };
  }
  function conflictTable(result, protectedSnap) {
    const byKey = new Map();
    for (const target of result) for (const c of target.categories) {
      const row = byKey.get(c.key) || { total: c.total, fresh: 0, conflicts: 0, names: new Set() };
      row.fresh += c.fresh; row.conflicts += c.conflicts.length; c.conflicts.forEach(n => n && row.names.add(n));
      byKey.set(c.key, row);
    }
    if (!byKey.size) return '<p class="dim">Nenhum recurso selecionado.</p>';
    const totalConflicts = [...byKey.values()].reduce((n, r) => n + r.conflicts, 0);
    return `<p>${totalConflicts ? `<b>${totalConflicts} conflito(s)</b> em ${result.length} subconta(s). Escolha o que fazer em cada tipo:` : 'Nenhum conflito: tudo será adicionado como novo.'}</p>
      ${table(['Recurso', 'Novos', 'Já existem', 'Quando já existir'], [...byKey].map(([key, r]) => `<tr><td><b>${h(assetLabelsPt[key] || key)}</b>${r.names.size && !protectedSnap ? `<br><small class="dim">${h([...r.names].slice(0, 6).join(', '))}${r.names.size > 6 ? '…' : ''}</small>` : ''}</td><td>${r.fresh}</td><td>${r.conflicts}</td>
        <td>${r.conflicts ? `<select data-snap-mode="${key}" aria-label="Regra para ${h(assetLabelsPt[key] || key)}"><option value="">Usar a regra geral</option><option value="skip">Manter o existente</option><option value="overwrite"${key === 'pipelines' ? ' disabled' : ''}>Sobrescrever</option></select>` : '—'}</td></tr>`))}`;
  }

  document.addEventListener('input', ev => {
    if (!active()) return;
    const el = ev.target;
    if (el.matches('[data-ag-search]')) {
      A.query = el.value; const pos = el.selectionStart; render();
      const next = G('[data-ag-search]'); next.focus(); next.setSelectionRange(pos, pos);
    }
    if (el.matches('[data-snap-search]')) {
      const q = el.value.trim().toLowerCase();
      for (const cat of el.form.querySelectorAll('.ag-snap-cat')) {
        let hits = 0;
        for (const row of cat.querySelectorAll('.ag-snap-item')) { const show = !q || row.dataset.snapName.includes(q); row.hidden = !show; if (show) hits++; }
        cat.hidden = Boolean(q) && !hits; if (q && hits) cat.open = true;
      }
    }
    if (el.matches('[data-ag-price]')) el.form.querySelector('[data-ag-profit]').textContent = money((Number(el.value) || 0) - Number(el.dataset.agPrice));
    if (el.matches('[data-ag-app-price],[data-ag-app-cost]')) { const price = Number(el.form.price.value) || 0; el.form.querySelector('[data-ag-profit]').textContent = money(price ? price - (Number(el.form.cost.value) || 0) : 0); }
    if (el.form?.dataset.agForm === 'company' && (el.name === 'primary' || el.name === 'secondary' || el.name === 'accent') && /^#[0-9a-f]{6}$/i.test(el.value)) {
      D().company[el.name] = el.value.toLowerCase();
      applyBrandColor(D().company.primary, D().company.secondary, D().company.accent);
    }
    if (el.form?.dataset.agForm === 'desktop-app') desktopPreview(el.form, el);
  });

  document.addEventListener('change', async ev => {
    if (!active()) return;
    const el = ev.target;
    if (el.form?.dataset.agForm === 'company' && (el.name === 'primary' || el.name === 'secondary' || el.name === 'accent') && /^#[0-9a-f]{6}$/i.test(el.value)) {
      D().company[el.name] = el.value.toLowerCase();
      applyBrandColor(D().company.primary, D().company.secondary, D().company.accent);
    }
    // Load wizard: account filter and the category/record checkboxes (no server call).
    if (el.matches('[data-snap-filter]')) {
      for (const row of el.form.querySelectorAll('[data-snap-account]')) row.hidden = el.value !== 'all' && row.dataset.snapAccount !== el.value;
      return;
    }
    if (el.matches('[data-snap-cat]') || (el.name === 'item' && el.closest('.ag-snap-cat'))) {
      const cat = el.closest('.ag-snap-cat'), boxes = [...cat.querySelectorAll('input[name="item"]')], head = cat.querySelector('[data-snap-cat]');
      if (el === head) boxes.forEach(box => { box.checked = head.checked; });
      const on = boxes.filter(box => box.checked).length;
      head.checked = on > 0; head.indeterminate = on > 0 && on < boxes.length;
      cat.querySelector('[data-snap-count]').textContent = `(${on}/${boxes.length})`;
      cat.closest('form').querySelector('[data-snap-conflicts]').innerHTML = '';
      return;
    }
    try {
      if (el.matches('[data-ag-status]')) { A.status = el.value; render(); G('[data-ag-status]').focus(); }
      if (el.matches('[data-ag-ai-filter]')) { A.aiFilter = el.value; render(); G('[data-ag-ai-filter]').focus(); }
      if (el.matches('[data-ag-ai-access]')) {
        const x = el.dataset.agAiAccess;
        await call('ai-access', { workspace: x, on: el.checked }); render(); G(`[data-ag-ai-access="${x}"]`)?.focus();
        flash(el.checked ? 'IA ligada na subconta.' : 'IA desligada na subconta.');
      }
      if (el.matches('[data-ag-lab]')) {
        const key = el.dataset.agLab;
        await act('labs', { data: { [key]: el.value } }); render(); G(`[data-ag-lab="${key}"]`)?.focus(); flash('Recursos experimentais atualizados.');
      }
      if (el.matches('[data-ag-gal-category]')) { const scope = el.dataset.agGalCategory; A.galCat = { ...A.galCat, [scope]: el.value }; render(); G(`[data-ag-gal-category="${scope}"]`)?.focus(); }
      if (el.matches('[data-ag-tpl-category]')) { A.tplCategory = el.value; render(); G('[data-ag-tpl-category]').focus(); }
      if (el.matches('[data-ag-mkt-origin]')) { A.mktOrigin = el.value; render(); G('[data-ag-mkt-origin]').focus(); }
      if (el.matches('[data-ag-mkt-pick]')) {
        const snap = D().snapshots.find(s => s.id === el.value);
        const existing = M().find(x => x.mine && x.sourceSnapshotId === el.value);
        if (snap && el.form) {
          el.form.title.value = existing?.title || snap.name || '';
          if (existing?.category) el.form.category.value = existing.category;
          el.form.summary.value = existing?.summary || snap.marketplaceSummary || '';
          el.form.description.value = existing?.description || snap.marketplaceDescription || '';
          el.form.tags.value = (existing?.tags || snap.marketplaceTags || []).join(', ');
        }
      }
      if (el.matches('[data-ag-pick]')) { if (el.checked) A.selected.add(el.dataset.agPick); else A.selected.delete(el.dataset.agPick); render(); G(`[data-ag-pick="${el.dataset.agPick}"]`)?.focus(); }
      if (el.matches('[data-ag-all]')) { const ids = accounts().filter(a => match(a.name, a.address, a.phone, a.email) && (!A.status || a.status === A.status)).map(a => a.id); ids.forEach(x => el.checked ? A.selected.add(x) : A.selected.delete(x)); render(); G('[data-ag-all]').focus(); }
      if (el.matches('[data-ag-feature]')) {
        const sel = `[data-ag-feature="${el.dataset.agFeature}"][data-field="${el.dataset.field}"][data-account="${el.dataset.account}"]`;
        await act('sub-feature', { id: el.dataset.agFeature, data: { account: el.dataset.account, field: el.dataset.field, value: el.checked } }); render(); G(sel)?.focus(); flash('Configuração salva.');
      }
      if (el.matches('[data-ag-wa-sub]')) {
        const ws = el.dataset.agWaSub, field = el.dataset.field;
        A.wa = await api('/api/whatsapp/agency/subaccount', { workspace: ws, [field]: el.checked });
        render(); G(`[data-ag-wa-sub="${ws}"][data-field="${field}"]`)?.focus(); flash('Configuração do WhatsApp salva.');
      }
      if (el.matches('[data-ag-rebill]')) {
        const x = el.dataset.agRebill, product = el.dataset.product;
        const now = new Set(D().saas.rebill?.[x] || []);
        if (el.checked) now.add(product); else now.delete(product);
        await act('rebill-account', { id: x, data: { products: [...now] } }); render(); G(`[data-ag-rebill="${x}"][data-product="${product}"]`)?.focus(); flash('Revenda atualizada.');
      }
      if (el.matches('[data-ag-saas-account]')) { const x = el.dataset.agSaasAccount; await act('saas-account', { id: x, data: { enabled: el.checked } }); render(); G(`[data-ag-saas-account="${x}"]`)?.focus(); flash(el.checked ? 'Subconta no modo SaaS.' : 'Modo SaaS desativado na subconta.'); }
      if (el.matches('[data-ag-idea-status]')) { await act('idea-status', { id: el.dataset.agIdeaStatus, data: { status: el.value } }); render(); flash('Status atualizado.'); }
    } catch (e) { flash(e.message, true); render(); }
  });

  const readImage = file => new Promise((resolve, reject) => {
    if (file.size > 300000) { reject(Error('Selecione uma imagem com menos de 300 KB.')); return; }
    const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(Error('Não foi possível ler a imagem selecionada.')); r.readAsDataURL(file);
  });

  document.addEventListener('submit', async ev => {
    const f = ev.target; if (!f.dataset.agForm || !active()) return;
    ev.preventDefault(); if (f.dataset.pending) return; f.dataset.pending = '1';
    const status = f.querySelector('.form-status'); if (status) status.textContent = '';
    const submit = f.querySelector('button:not([type=button])'); if (submit) submit.disabled = true;
    const name = f.dataset.agForm, id = f.dataset.id, data = formData(f);
    let msg = 'Salvo com sucesso.', keepOpen = false;
    try {
      if (name.startsWith('record:')) { await act('save', { key: name.slice(7), id, data }); msg = id ? 'Alterações salvas.' : 'Criado com sucesso.'; }
      else if (name.startsWith('delete:')) { await act('delete', { key: name.slice(7), id }); msg = 'Excluído com sucesso.'; }
      else switch (name) {
        case 'openai-connect':
        case 'openai-disconnect': {
          const connect = name === 'openai-connect';
          const currentVisit = visit;
          const connection = await api('/api/openai', connect ? { action: 'connect', apiKey: data.apiKey } : { action: 'disconnect' });
          env.onOpenAIChange(connection);
          if (currentVisit !== visit) return;
          A.openAI = connection;
          void graaoChat.refreshState();
          msg = connect ? 'Chave da OpenAI conectada.' : 'Chave da OpenAI desconectada.';
          break;
        }
        case 'abacate-connect': {
          A.abacate = await api('/api/abacatepay/agency/connect', { apiKey: data.apiKey });
          A.data = await api('/api/agency');
          msg = `AbacatePay conectado${A.abacate.storeName ? `: ${A.abacate.storeName}` : ''}.`;
          break;
        }
        case 'abacate-disconnect': {
          A.abacate = await api('/api/abacatepay/agency/disconnect', {});
          A.data = await api('/api/agency');
          msg = 'AbacatePay desconectado.';
          break;
        }
        case 'abacate-cancel': {
          A.data = await api('/api/abacatepay/agency/cancel', { workspace: id });
          msg = 'Assinatura cancelada.';
          break;
        }
        case 'wa-config': {
          stopWaPoll();
          A.waFocus = null;
          A.wa = await api('/api/whatsapp/agency/config', data);
          A.waServer = await api('/api/whatsapp/agency/server').catch(() => null);
          msg = A.waServer?.ok === false ? 'Servidor salvo, mas o teste falhou. Veja o motivo no topo da página.' : 'Servidor de WhatsApp salvo. As subcontas já podem conectar por QR Code!';
          break;
        }
        case 'vl-release': {
          const out = await api('/api/verify/release', data);
          msg = out.released ? 'Número liberado. Ele já pode confirmar outra conta.' : 'Esse número não estava preso a nenhuma agência.';
          break;
        }
        case 'wa-disconnect-server': {
          stopWaPoll();
          A.waFocus = null;
          A.waServer = null;
          A.wa = await api('/api/whatsapp/agency/disconnect-server', {});
          msg = 'Servidor de WhatsApp próprio removido.';
          break;
        }
        case 'wa-sub-remove': {
          stopWaPoll();
          if (A.waFocus?.workspace === id) A.waFocus = null;
          A.wa = await api('/api/whatsapp/agency/remove-instance', { workspace: id });
          msg = 'Instância do WhatsApp excluída.';
          break;
        }
        case 'wa-sub-pair': {
          stopWaPoll();
          const live = await api(`/api/whatsapp/workspace/connect?workspace=${encodeURIComponent(id)}`, { phone: data.phone });
          A.waFocus = { ...live, workspace: id };
          if (A.wa?.subaccounts?.[id]) A.wa.subaccounts[id] = { ...A.wa.subaccounts[id], hasInstance: true, status: live.status };
          if (live.status === 'connecting') startWaPoll(id);
          msg = live.paircode ? 'Código de pareamento gerado!' : 'Conexão iniciada.';
          break;
        }
        case 'wa-sub-test': {
          await api(`/api/whatsapp/workspace/test?workspace=${encodeURIComponent(id)}`, { phone: data.phone, text: data.text });
          msg = 'Mensagem de teste enviada pelo WhatsApp.';
          break;
        }
        case 'account': { const newId = await call('accounts', data); msg = 'Subconta criada.'; close(); dialog('Subconta criada com sucesso', `<p><b>${h(data.name)}</b> está pronta para uso.</p><div class="inline-gap">${btn('Acessar subconta agora', 'open-account', `data-id="${newId}"`, 'primary')}</div>`); keepOpen = true; break; }
        case 'bg-save': {
          const saved = await act('brand-group-save', { id, data: { name: data.name, period: data.period, accountIds: data.accountIds || [] } });
          msg = id ? 'Grupo atualizado.' : 'Grupo criado.';
          if (A.bg?.id === saved || !id) { close(); keepOpen = true; render(); await openGroup(saved); }
          break;
        }
        case 'bg-share': await act('brand-group-share', { id, data: { action: 'create', days: Number(data.days), lang: data.lang } }); close(); render(); shareGroup(id); keepOpen = true; msg = 'Link gerado.'; break;
        case 'bg-delete': await act('brand-group-delete', { id }); if (A.bg?.id === id) A.bg = null; msg = 'Grupo excluído.'; break;
        case 'pres-share-form': {
          const days = Number(data.days);
          await act('presentation-share', { id, data: { action: 'create', days } });
          msg = 'Link público gerado com sucesso!';
          close();
          render();
          break;
        }
        case 'account-meta': await act('account-meta', { id, data }); msg = 'Dados da subconta atualizados.'; break;
        case 'account-reactivate': await act('account-reactivate', { id }); msg = 'Subconta reativada.'; break;
        case 'account-trash': await act('account-trash', { id, data: { confirm: data.confirm } }); A.selected.delete(id); msg = 'Subconta excluída. Ela fica na Lixeira por 30 dias.'; break;
        case 'account-restore': await act('account-restore', { id }); msg = 'Subconta restaurada.'; break;
        case 'bulk-status': for (const x of A.selected) { const meta = D().accounts[x]; await act('account-meta', { id: x, data: { ...meta, status: data.status, suspendedReason: data.suspendedReason } }); } A.selected.clear(); msg = 'Status das subcontas atualizado.'; break;
        case 'bulk-snapshot': await call('snapshot-load', { id: data.id, workspaces: [...A.selected], mode: data.mode }); A.selected.clear(); msg = 'Setup carregado com sucesso.'; break;
        case 'prospect-convert': { const newId = await call('prospect-convert', { id, snapshotId: data.snapshotId }); msg = 'Subconta criada.'; close(); dialog('Subconta criada com sucesso', `<div class="inline-gap">${btn('Acessar subconta agora', 'open-account', `data-id="${newId}"`, 'primary')}</div>`); keepOpen = true; break; }
        case 'snapshot-create': await call('snapshot-create', data); msg = 'Setup criado com sucesso.'; break;
        case 'snapshot-refresh': await call('snapshot-refresh', { id }); msg = 'Setup atualizado com sucesso.'; break;
        case 'snapshot-load': {
          const picked = loadPicks(f);
          if (!picked.workspaces.length) throw Error('Selecione pelo menos uma subconta.');
          if (!Object.values(picked.items).some(v => v === '*' || v.length)) throw Error('Selecione pelo menos um recurso para carregar.');
          const loads = await call('snapshot-load', { id, workspaces: picked.workspaces, mode: data.mode, items: picked.items, modes: picked.modes });
          msg = `Carregado em ${loads.length} subconta(s): ${loads.reduce((s, l) => s + l.added, 0)} adicionados, ${loads.reduce((s, l) => s + l.overwritten, 0)} sobrescritos, ${loads.reduce((s, l) => s + l.skipped, 0)} mantidos.`;
          break;
        }
        case 'snapshot-share': {
          const code = await act('snapshot-share', { id: data.id, data: { protect: Boolean(data.protect) } });
          close(); render(); keepOpen = true;
          dialog('Código de importação', `<p>Envie este código para a agência que vai importar o setup${data.protect ? ' (com proteção de ativos)' : ''}.</p><div class="ag-copy"><input readonly value="${h(code)}" aria-label="Código de importação">${btn('Copiar', 'copy', `data-text="${h(code)}"`)}</div><p class="dim">A outra agência cola o código em Setups de conta → Importar setup.</p>`);
          msg = 'Código de importação pronto.';
          break;
        }
        case 'snapshot-unshare': await act('snapshot-unshare', { id }); msg = 'Código revogado.'; break;
        case 'snapshot-import': { await act('snapshot-import', { data: { code: data.code } }); msg = 'Setup importado.'; close(); go('snapshots', 'imported'); keepOpen = true; break; }
        case 'snapshot-rename': await act('snapshot-rename', { id, data }); msg = 'Setup renomeado.'; break;
        case 'snapshot-delete': await act('snapshot-delete', { id }); msg = 'Setup excluído.'; break;
        case 'marketplace-publish': { const r = await call('marketplace-publish', { ...data, listingId: id }); msg = r.updated ? 'Publicação atualizada no marketplace.' : 'Setup publicado no marketplace!'; break; }
        case 'marketplace-unpublish': await call('marketplace-unpublish', { id }); msg = 'Setup retirado do marketplace.'; break;
        case 'subwallet': await call('subaccount-wallet', { workspace: id, ...data }); msg = data.kind === 'debit' ? 'Débito lançado.' : 'Crédito lançado na carteira.'; break;
        case 'resell': await act('resell', { id, data: { price: data.price, enabled: data.enabled } }); msg = 'Configurações de revenda salvas.'; break;
        case 'addon-request': await act('addon-request', { id, data }); msg = 'Solicitação registrada com sucesso.'; break;
        case 'affiliate-accept': await act('affiliate-accept', { data }); msg = 'Boas-vindas ao programa de afiliados!'; break;
        case 'affiliate-payout': await act('affiliate-payout', { data }); msg = 'Dados de pagamento atualizados.'; break;
        case 'idea-comment': await act('idea-comment', { id, data }); msg = 'Comentário adicionado.'; break;
        case 'integration': await act('integration', { id, data: { accounts: data.accounts } }); msg = 'Disponibilidade de integração atualizada.'; break;
        case 'desktop-app': await act('desktop-app', { data: await readDesktop(f) }); go('desktop-app'); msg = 'Aplicativo desktop salvo.'; break;
        case 'profile': await act('profile', { data }); msg = 'Perfil atualizado com sucesso.'; break;
        case 'company': {
          const file = f.querySelector('[name=logoFile]').files[0];
          const logoValue = data.removeLogo ? 'remove' : file ? await readImage(file) : undefined;
          const { logoFile: _file, removeLogo: _remove, ...rest } = data;
          await act('company', { data: { ...rest, ...(logoValue === undefined ? {} : { logo: logoValue }) } });
          msg = 'Dados da empresa salvos com sucesso.'; break;
        }
        case 'fiscal': await act('fiscal', { data: readFiscal(data) }); msg = 'Cadastro fiscal salvo.'; break;
        case 'billing-plan': await act('billing-plan', { data }); msg = 'Plano da agência atualizado.'; break;
        case 'auto-recharge': await act('auto-recharge', { data }); msg = 'Regras de alerta de saldo salvas.'; break;
        case 'wallet': await act('wallet', { data }); msg = 'Lançamento na carteira registrado.'; break;
        case 'system-email': await act('system-email', { id, data }); msg = 'Modelo de e-mail salvo.'; break;
        case 'ai-defaults': await act('ai-defaults', { data }); msg = 'Padrões de IA salvos.'; break;
        case 'ai-limit': await call('ai-limit', { workspace: id, limit: Number(data.limit) || 0, alertAt: Number(data.alertAt) }); msg = 'Limite de IA salvo.'; break;
        case 'ai-apply': { const changed = await call('ai-apply-defaults', { scope: id }); msg = `Limite padrão aplicado em ${changed} subconta(s).`; break; }
        case 'compliance': await act('compliance', { data }); msg = 'Configurações de conformidade salvas.'; break;
        case 'api-key': { const r = await act('api-key', { data }); close(); render(); secretBox('Chave de API criada', r.secret); keepOpen = true; msg = ''; break; }
        case 'api-key-delete': await act('api-key-delete', { id }); msg = 'Chave de API revogada.'; break;
        case 'private-integration': { const r = await act('private-integration', { data: { ...data, scopes: data.scopes || [] } }); close(); render(); secretBox('Token de integração privada criado', r.secret); keepOpen = true; msg = ''; break; }
        case 'private-integration-delete': await act('private-integration-delete', { id }); msg = 'Integração privada excluída.'; break;
        case 'saas-suspension': await act('saas-suspension', { data }); msg = 'Regras de plano não pago salvas.'; break;
        case 'saas-rebilling': await act('saas-rebilling', { data }); msg = 'Markups da carteira salvos.'; break;
        case 'email-domain': await act('email-domain', { data }); msg = 'Domínio criado. Publique os registros de DNS e clique em Verificar agora.'; break;
        case 'email-domain-accounts': await act('email-domain-accounts', { data: { accounts: data.accounts, localPart: data.localPart } }); msg = 'Subcontas do domínio dedicado salvas.'; break;
        case 'email-domain-remove': await act('email-domain-remove'); msg = 'Domínio dedicado removido.'; break;
        case 'affiliate-pixel': await act('affiliate-pixel', { data }); msg = 'Configurações da página salvas.'; break;
        case 'app-install': await act('app-install', { id, data }); msg = `${appName(id)} instalado.`; break;
        case 'app-uninstall': await act('app-uninstall', { id }); msg = 'App desinstalado.'; break;
        case 'app-resell': await act('app-resell', { id, data }); msg = 'Preço de revenda salvo.'; break;
        case 'pf-settings':
          A.pf = await api('/api/platform/settings', { alertEmail: data.alertEmail, twilioMinUsd: Number(data.twilioMinUsd), plans: { supabase: data.supabase, vercel: data.vercel } });
          msg = 'Configurações da Plataforma salvas.';
          break;
        default: throw Error('Formulário desconhecido.');
      }
      if (!keepOpen) { close(); render(); }
      if (msg) flash(msg);
    } catch (e) {
      if (status) status.textContent = e.message; else flash(e.message, true);
      delete f.dataset.pending; if (submit) submit.disabled = false;
    }
  });

  const prospecting = createProspecting({data:()=>A.data,accounts,call,render,dialog,close,flash,download});
  const graaoChat = createGraaoChat({
    api,
    flash,
    onOpenOpenAISettings: () => go('settings', 'openai'),
    getHeaders: () => {
      if (A.data?.access?.session) return {};
      try { return { 'X-Go-User': localStorage.getItem('go.user') || '' }; } catch { return {}; }
    }
  });
  window.addEventListener('graao:languagechange', () => { if (active()) render(); });
  return { show, leave, session: () => A.data?.access?.session, act, render, agency: () => D() };
}
