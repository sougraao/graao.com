import {tabAccountId} from './account-guard.js';
import {rodapeHtml} from './rodape.js';
import {icon as i, logo, brandName, bootScreen, domainBrand} from './icons.js';
import {nav,h,avatar,screens,publicView,money} from './screens.js';
import { conversationSections, manualQueue, manualType, slaRecords, SLA_CHANNELS } from './conversations.js';
import { createInboxFollower, patchInbox } from './inbox-live.js';
import { deliveryFailures, inboxChange, inboxClick, inboxPage, inboxSubmit, mediaFailed, mediaLoaded, threadMoved } from './inbox.js';
import { dashboardPreferences, installDashboardControls, reportGrid } from './dashboard-controls.js';
import { drawDashboardGauges } from './dashboard.js';
import { launchpadGuide } from './launchpad.js';
import { opportunityStatuses } from './dashboard-data.js';
import { composerAction } from './inbox-data.js';
import { tr, initI18n, getLanguage, translateDom } from './i18n.js';
import { toast } from './toast.js';
import { cardFields, cardLayouts, opportunityCsv, opportunityCsvColumns, opportunityPreferences, opportunityResults, opportunitySorts, quickActions } from './opportunity-data.js';
import { opportunityEvents } from './opportunities.js';
import { parseCsv } from './social-data.js';
import { readFiscal } from './fiscal.js';
import { installLedger } from './ledger.js';
import { formatTaxId } from './tax-id.js';
import { afterStudioRender, exportStudioProject, installStudio, studioBlock } from './studio.js';
import { studioTemplates } from './studio-data.js';
import { sidebar, sideBrand } from './sidebar.js';
import { topbar } from './topbar.js';
import { crmEntityNames, crmEvents, crmForm, crmTabs, customInputs } from './crm.js';
import { socialEvents } from './social.js';
import { installEventPlanner, placeTimeline } from './event-planner.js';
import { mountAgentScreen } from './agents.js';
import { mountAgentHub } from './agent-hub.js';
import { installContentAI } from './content-ai.js';
import { installReputation, reputationTabs } from './reputation.js';
import { afterSitesRender, installSites } from './sites.js';
import { afterFormsRender, installForms } from './forms.js';
import { installChat } from './chat-widgets.js';
import { installBlogs } from './blogs.js';
import { installStores } from './stores.js';
import { installWebinars } from './webinars.js';
import { installQr } from './qr-codes.js';
import { installMedia } from './media.js';
import { installAnalytics } from './sites-analytics.js';
import { unmountDesignStage } from './design-workspace.js';
import { installBuilder, startBuild } from './studio-builder.js';
import { installAutomation } from './automation.js';
import { installClientPortal } from './client-portal.js';
import { installCourses } from './courses.js';
import { installCommunities } from './communities.js';
import { installOffers } from './offers.js';
import { installCertificates } from './certificates.js';
import { installTickets } from './tickets.js';
import { installSequences } from './sequences.js';
import { installLoyalty } from './loyalty.js';
import { installScheduling } from './scheduling.js';
import { installMeetings } from './meetings.js';
import { installSeo } from './seo.js';
import { installWallet } from './wallet.js';
import { installLabs } from './labs.js';
import { installConversationAi } from './conversation-ai.js';
import { installMobileShell, shellAgency } from './mobile-shell.js';
import { contactPreferences, installPreferences } from './preferences.js';
import { installContactTrash } from './contact-trash.js';
import { afterDocumentsRender, installDocuments } from './documents.js';
import { installEstimates } from './estimates.js';
import { installInvoices, invoiceTabs } from './invoices.js';
import { installPaymentSettings } from './payment-settings.js';
import { installEmailMarketing, emailTabs } from './email-marketing.js';
import { installCountdowns } from './countdowns.js';
import { installAffiliates } from './affiliates.js';
import { installAds } from './ads.js';
import { installBrand } from './brand.js';
import { contactScore, installTracking } from './tracking.js';
import { installOrders } from './orders.js';
import { installCatalog } from './catalog.js';
import { installPrancheta } from './prancheta.js';
import { applyBrandColor, setThemeAccount } from './graao.js';
import { installReports } from './reports.js';
import './phone-input.js';
import { clickWith, mountBeautifulUI } from './bui-mounts.js';
import { diffTable, searchList } from './beautiful-ui-more.js';
import { ask, askText } from './ask.js';
import { installAccounts } from './accounts.js';

const app=document.querySelector('#app'), overlay=document.querySelector('#overlay');
const isAppPath=['/','/index.html','/app','/app/','/painel','/painel/'].includes(location.pathname);
const viewPath=!isAppPath ? location.pathname : '';
const c={workspace:new URLSearchParams(location.search).get('workspace')||localStorage.getItem('go.workspace')||'demo',view:'dashboard',tab:'',query:'',tag:'',thread:'',chat:[],month:new Date(),choice:'',askOpen:false,navOpen:false,workspaces:[],conversationFilters:{},wa:null,waPairOpen:false};
let waSubPoll=null;
function stopSubWaPoll(){ if(waSubPoll){ clearInterval(waSubPoll); waSubPoll=null; } }
function startSubWaPoll(){
  stopSubWaPoll();
  const ws=c.workspace;
  waSubPoll=setInterval(async()=>{
    if(c.mode==='agency'||c.view!=='settings'||c.tab!=='whatsapp'||c.workspace!==ws){ stopSubWaPoll(); return; }
    try{
      const live=await api(url('/api/whatsapp/workspace/status'));
      if(c.workspace!==ws||c.view!=='settings'||c.tab!=='whatsapp') return;
      const was=c.wa?.status;
      c.wa=live;
      if(live.status==='connected'){
        stopSubWaPoll();
        if(was!=='connected') flash('WhatsApp conectado com sucesso!');
      }
      render();
    }catch{}
  },3000);
}
async function refreshPay(){
  const ws=c.workspace;
  try{ const live=await api(url('/api/abacatepay/workspace/status')); if(c.workspace===ws) c.pay=live; }
  catch(e){ if(c.workspace===ws) c.pay={error:e.message}; }
  if(c.workspace===ws&&c.mode!=='agency'&&(c.view==='payments'||c.view==='settings'&&c.tab==='abacatepay')) render();
}
// Google Analytics + Business Profile: status for Settings, report numbers for the dashboard widgets.
async function refreshGoogle(){
  const ws=c.workspace;
  if(c.mode==='agency'||!/^[0-9a-f-]{36}$|^demo$/.test(ws)) return;
  try{ const live=await api(url('/api/google/workspace/status')+'&data=1'); if(c.workspace===ws) c.google={...live,workspace:ws}; }
  catch(e){ if(c.workspace===ws) c.google={error:e.message,workspace:ws}; }
  if(c.workspace===ws&&c.mode!=='agency'&&(c.view==='dashboard'||c.view==='settings'&&c.tab==='google')) render();
}
// Conectores (T.2): which apps the sub-account connected and their webhook URLs.
async function refreshConnectors(){
  const ws=c.workspace;
  try{ const live=await api(url('/api/connectors/status')); if(c.workspace===ws) c.connectorStatus={...live,workspace:ws}; }
  catch(e){ if(c.workspace===ws) c.connectorStatus={error:e.message,workspace:ws}; }
  if(c.workspace===ws&&c.mode!=='agency'&&c.view==='settings'&&c.tab==='connectors') render();
}
// Telefonia: the sub-account's Twilio numbers (Configurações → Telefonia).
async function refreshPhone(){
  const ws=c.workspace;
  try{ const live=await api(url('/api/phone/status')); if(c.workspace===ws) c.phoneSetup={...live,workspace:ws}; }
  catch(e){ if(c.workspace===ws) c.phoneSetup={error:e.message,workspace:ws}; }
  if(c.workspace===ws&&c.mode!=='agency'&&c.view==='settings'&&c.tab==='phone') render();
}
// Conversas → Discador: while a session is open, the screen follows the current call (unless a form is being filled).
let dialerPoll=null;
function followDialer(){
  if(dialerPoll) return;
  dialerPoll=setInterval(async()=>{
    const open=(c.s?.dialer?.sessions||[]).some(row=>row.status!=='ended');
    if(c.mode==='agency'||c.view!=='conversations'||c.tab!=='dialer'||!open){ clearInterval(dialerPoll); dialerPoll=null; return; }
    if(document.activeElement?.closest?.('form[data-form="dialer-disposition"]')) return;
    try{ await load(); render(); }catch{}
  },4000);
}
// Serviços de e-mail: the sub-account's sending domain and its DNS records (re-checked with Resend while pending).
async function refreshEmail(){
  const ws=c.workspace;
  try{ const live=await api(url('/api/email/workspace/status')); if(c.workspace===ws) c.emailDomain={...live,workspace:ws}; }
  catch(e){ if(c.workspace===ws) c.emailDomain={error:e.message,workspace:ws}; }
  if(c.workspace===ws&&c.mode!=='agency'&&c.view==='settings'&&c.tab==='email') render();
}
window.addEventListener('message',ev=>{
  if(ev.origin!==location.origin||ev.data?.type!=='graao-google') return;
  if(ev.data.error){ flash(ev.data.error,true); return; }
  flash('Conta Google conectada.'); c.google=null; render(); void refreshGoogle();
});
async function refreshSubWa(){
  const ws=c.workspace;
  try{
    const live=await api(url('/api/whatsapp/workspace/status'));
    if(c.workspace!==ws) return;
    c.wa=live;
    if(live.status==='connecting'&&c.view==='settings'&&c.tab==='whatsapp') startSubWaPoll();
    else stopSubWaPoll();
  }catch(e){
    if(c.workspace===ws) c.wa={error:e.message};
  }
  if(c.workspace===ws && c.mode!=='agency'&&(c.view==='launchpad'||c.view==='settings'&&c.tab==='whatsapp')) render();
}
c.dash = dashboardPreferences(c.workspace);
c.pipeline = '';
c.studio = { brief:'',template:'landing',project:'' };
let modalReturn, busy=false, renderedView='', editor, mountClientPortal, mountCommunities, mountCourses;
const G=s=>document.querySelector(s);
const url=path=>`${path}?workspace=${encodeURIComponent(c.workspace)}`;
function flash(msg,isError=false){ return isError?toast.error(msg):toast.success(msg); }
const actingUser = () => { try { return localStorage.getItem('go.user') || ''; } catch { return ''; } };
const accounts = installAccounts({ session: () => c.access?.session || agencyUI?.session(), beforeLeave: async () => { if (editor) await editor.flush(); } });
// Agência sem celular confirmado, convidado de agência não ativada, agência bloqueada ou cadastro fechado: a tela de verify.js cobre o app.
let gateOpen=null;
function showGate(data){
  gateOpen ??= import('./verify.js').then(({ mountGate }) => mountGate(document.body, { code: data.code, error: data.error, agency: data.agency, api, onDone: () => location.reload() }))
    .catch(error => { gateOpen = null; throw error; });
}
async function api(path,body){
  const headers = c.access?.session ? {} : { 'X-Go-User': actingUser() };
  const response = await fetch(path,body===undefined?{headers}:{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data = await response.json();
  if (response.status === 401 && isAppPath && !path.startsWith('/api/auth/')) {
    const next = (location.pathname === '/' || location.pathname === '/index.html' ? '/app' : location.pathname) + location.search + location.hash;
    location.replace('/login?' + new URLSearchParams({ next }));
  }
  if (!response.ok) {
    if ((response.status === 402 && ['PHONE_REQUIRED', 'AGENCY_NOT_ACTIVE', 'AGENCY_BLOCKED'].includes(data.code)) || ['SIGNUP_CLOSED', 'NOT_INVITED', 'INVITE_PENDING'].includes(data.code)) showGate(data);
    if (data.code === 'ACCOUNT_SUSPENDED' && c.mode !== 'agency' && !path.startsWith('/api/state?') &&
        new URL(path, location.origin).searchParams.get('workspace') === c.workspace) {
      await load();
      if (c.account) { close(); render(); }
    }
    throw Object.assign(Error(data.error||'The request failed.'),{status:response.status,code:data.code,account:data.account});
  }
  if (isAppPath && data.access) { setThemeAccount(data.access.session?.id); accounts.seen(data.access.session); }
  // A tela da agência abre mesmo fechada (marca e nome atrás); `gate` diz o que cobre o app.
  if (data?.gate?.code) showGate(data.gate);
  return data;
}
async function load(){
  const workspace = c.workspace;
  try {
    const data = await api(url('/api/state'));
    if (workspace === c.workspace) Object.assign(c,{s:data.state,m:data.metrics,workspaces:data.workspaces,features:data.features,agency:data.agency,access:data.access,account:data.account,billingNotice:data.billingNotice||''});
  } catch (e) {
    if (e.code !== 'ACCOUNT_SUSPENDED') throw e;
    if (workspace === c.workspace) Object.assign(c,{s:null,m:null,account:e.account});
  }
}
const allowedView = id => id === 'launchpad' || id === 'home' ? !c.access?.modules || c.access.modules.length > 0 : !c.access?.modules || c.access.modules.includes(id) || (id === 'prancheta' && (!c.access?.modules || c.access.modules.includes('marketing') || c.access.modules.includes('prancheta')));
// The agency's installed app (mobile-shell.js); outside it nothing changes.
let mobileShell = { active: () => false, start: () => '', header: () => '', paint() {} };
let agencyUI, agencyEnv, agencyLoading, openingWorkspace;
// O painel da agência (agency.js e os módulos que só ele usa) é baixado na primeira vez que #agency abre:
// quem trabalha só na subconta não carrega esse código. Os ouvintes dele só agem em #agency.
const loadAgency = () => agencyLoading ??= import('./agency.js')
  .then(({ startAgency }) => (agencyUI = startAgency(agencyEnv)))
  .catch(error => { agencyLoading = null; throw error; });
const sessionDismissed=new Set();
const inboxContext=()=>({c,mutate,render,flash,dialog,close});
async function mutate(command){ const workspace=c.workspace;const d=await api(url('/api/action'),command);if(workspace===c.workspace){c.s=d.state;c.m=d.metrics;}return d.id; }
const go=(view,tab='')=>{const next=`#${view}${tab?`/${tab}`:''}`; if(location.hash===next) route(); else location.hash=next;};
const validTabs={media:['trash','folder'],launchpad:['initial','marketing','sales','website','commerce'],contacts:crmTabs.contacts.map(t=>t[0]),conversations:['all','unread','recent','starred',...conversationSections],calendars:['calendar','appointments','services','resources','field','booking','meetings'],opportunities:crmTabs.opportunities.map(t=>t[0]),automation:['workflows','folder','smart','review','deleted','overview','builder','settings','enrollments','logs'],payments:[...crmTabs.payments.map(t=>t[0]),'document','estimate',...invoiceTabs],sites:['funnels','websites','forms','submissions','funnel','form','form-analytics','surveys','survey-analytics','survey-submissions','quizzes','quiz-analytics','quiz-submissions','chat-widget','chat-insights','chat','blogs','blog','post','blog-settings','stores','store','webinars','webinar','qr-codes','qr','analytics','editor','build'],marketing:['social','events',...emailTabs,'countdown','affiliates','ads','loyalty','brand','prancheta'],prancheta:['files','editor','templates'],memberships:['portal','portal-members','portal-settings','courses','course','communities','community','offers','certificates'],reporting:['reports','attribution','google-ads','meta-ads','overview','calls','snapshots','new','editor'],studio:['recent','projects','starred','templates','project','build'],reputation:reputationTabs,'ai-agents':['agent','edit','knowledge','base','templates','logs','usage'],settings:crmTabs.settings.map(t=>t[0])};
function leaveAgentEditor() {
  if (editor) void editor.flush();
  editor = null;
}
async function openInitialWorkspace() {
  const workspace = c.workspace;
  try { await load(); }
  catch (e) {
    if (workspace !== c.workspace) return;
    if (![403,404].includes(e.status)) throw e;
    const {workspaces:open,agency} = await api('/api/workspaces');
    if (workspace !== c.workspace) return;
    if (!open.length && agency) {
      if (c.mode !== 'agency') location.replace('#agency/dashboard');
      return;
    }
    if (!open.length) throw Error('Sua conta ainda não tem acesso a uma subconta.');
    c.workspace = open[0].id;
    c.dash = dashboardPreferences(c.workspace);
    localStorage.setItem('go.workspace',c.workspace);
    await load();
  }
}
function route(){ const [key,tab,project]=location.hash.slice(1).split('/');
  mobileShell.paint();
  if(key==='agency'){
    if (c.access && !c.access.agency) { location.replace('#dashboard'); return; }
    stopSubWaPoll();
    c.mode='agency'; leaveAgentEditor(); close();
    if (agencyUI) { agencyUI.show(tab,project); return; }
    app.innerHTML = bootScreen('Abrindo o painel da agência…');
    loadAgency().then(() => { if (location.hash.startsWith('#agency')) route(); })
      .catch(e => { app.innerHTML = `<div class="boot"><h1>Painel indisponível</h1><p>${h(e.message)}</p><a href="/app?recarregar=${Date.now()}${h(location.hash)}">Tentar de novo</a></div>`; });
    return;
  }
  if(c.mode==='agency'){ agencyUI?.leave(); c.mode=''; renderedView=''; }
  if (c.account) { renderAccountLifecycle(); return; }
  if (!c.s) {
    app.innerHTML = bootScreen('Abrindo o graao…');
    openingWorkspace ??= openInitialWorkspace()
      .then(() => {
        if ((c.s || c.account) && c.mode !== 'agency') {
          if ((!location.hash || location.hash === '#' || location.hash === '') && c.access?.agency && !mobileShell.active()) {
            location.replace('#agency/dashboard');
            return;
          }
          route();
        }
      })
      .catch(e => {
        if (c.mode !== 'agency') app.innerHTML = `<div class="boot boot-error" role="alert"><h1>Não foi possível abrir o workspace</h1><p>${h(e.message)}</p><a class="primary" href="${h(location.pathname + location.search + location.hash)}">Tentar de novo</a></div>`;
      })
      .finally(() => { openingWorkspace = null; });
    return;
  }
  if ((!location.hash || location.hash === '#' || location.hash === '') && c.access?.agency && !mobileShell.active()) {
    location.replace('#agency/dashboard');
    return;
  }
  if (key === 'ask-ai' || key === 'marketplace') { location.hash = '#dashboard'; return; }
  // The AI Studio now lives inside Sites: old links keep working.
  if (key === 'studio') { location.replace(tab === 'project' && project ? `#sites/editor/${project}` : tab === 'build' ? '#sites/build' : '#sites/funnels'); return; }
  const requested = key || mobileShell.start() || 'launchpad';
  const view = key === 'link' && allowedView('conversations') ? 'link'
    : Object.hasOwn(screens,requested) && allowedView(requested) ? requested
      : nav.find(([item]) => allowedView(item))?.[0];
  if (!view) {
    app.innerHTML = `<main class="boot boot-error"><h1>Nenhum módulo disponível</h1><p>Seu acesso a esta subconta está ativo. Solicite as permissões necessárias à sua agência.</p><div class="inline-gap"><button class="secondary" data-act="workspaces">Trocar de workspace</button>${c.access?.agency ? '<a class="secondary" href="#agency/dashboard">Visão da agência</a>' : ''}</div></main>`;
    return;
  }
  const nextTab=view==='link'?tab||'':view==='reporting'?(validTabs.reporting.includes(tab)?tab:'reports'):validTabs[view]?.includes(tab)?tab:'';
  const automationId = view === 'automation' ? project || '' : '';
  const opportunityViews = ['', 'pipeline', 'list'];
  const switchingOpportunityView = c.view === 'opportunities' && view === c.view &&
    opportunityViews.includes(c.tab) && opportunityViews.includes(nextTab);
  if((c.view!==view||c.tab!==nextTab) && !switchingOpportunityView){c.query='';c.tag='';}
  if(view==='automation' && (c.view!==view || c.tab!==nextTab || c.automationId!==automationId)) c.workflowList=null;
  c.view=view;c.tab=nextTab;c.automationId=automationId;c.studio.project=project||'';
  c.reportId=view==='reporting'&&nextTab==='editor'?project||'':'';
  c.emailId=view==='marketing'&&['email-campaign','email-template','email-report'].includes(nextTab)?project||'':'';
  c.agentId=view==='ai-agents'&&['agent','edit','base'].includes(nextTab)?project:'';
  if(view==='launchpad'){ render(); if(allowedView('settings')) void refreshSubWa(); return; }
  if(view==='settings'&&nextTab==='whatsapp'){ render(); void refreshSubWa(); return; }
  stopSubWaPoll();
  if(view==='payments'&&!nextTab||view==='settings'&&nextTab==='abacatepay'||view==='payments'&&nextTab==='document'&&!c.pay){ render(); void refreshPay(); return; }
  if(view==='dashboard'&&c.google?.workspace!==c.workspace||view==='settings'&&nextTab==='google'){ render(); void refreshGoogle(); return; }
  if(view==='settings'&&nextTab==='email'){ if(c.emailDomain?.workspace!==c.workspace) c.emailDomain=null; render(); void refreshEmail(); return; }
  if(view==='conversations'&&nextTab==='dialer'){ render(); followDialer(); return; }
  if(view==='settings'&&nextTab==='connectors'){ if(c.connectorStatus?.workspace!==c.workspace) c.connectorStatus=null; render(); void refreshConnectors(); return; }
  if(view==='settings'&&nextTab==='phone'){ if(c.phoneSetup?.workspace!==c.workspace){ c.phoneSetup=null; c.phoneSearch=null; } render(); void refreshPhone(); return; }
  render(); }
const iconBtn=(name,label,attributes='',cls='icon-btn')=>`<button class="${cls}" aria-label="${tr(label)}" title="${tr(label)}" ${attributes}>${i(name,17)}</button>`;
const navItem=([id,pt,ico])=>({href:`#${id}`,label:tr(pt),icon:ico,current:c.view===id});
function appSidebar(brand){
  const items=nav.slice(0,-1).map((n,k)=>[n,k]).filter(([n])=>allowedView(n[0]));
  const links=(c.agency?.menuLinks||[]).map(l=>l.openIn==='Inside the app'?{href:`#link/${l.id}`,label:tr(l.title),icon:l.icon,current:c.view==='link'&&c.tab===l.id}:{href:l.url,label:tr(l.title),icon:l.icon,external:true});
  return sidebar({label:tr('Navegação'),home:c.access?.agency?'#agency/dashboard':'#launchpad',brand,mark:c.agency?.logo?`<img class="ag-logo" src="${h(c.agency.logo)}" alt="">`:logo,show:sideBrand(brand!==brandName(c.agency?.brand)||c.agency?.logo?c.agency:null),
    account:{name:c.s.profile.name,caption:tr('Subconta · trocar'),attr:'data-act="workspaces"',tip:tr('Trocar de workspace')},
    toggle:'data-act="nav"',open:c.navOpen,
    groups:[{title:tr('Principal'),items:items.filter(([,k])=>k<7).map(([n])=>navItem(n))},{title:tr('Crescimento'),items:items.filter(([,k])=>k>=7).map(([n])=>navItem(n))},{title:tr('Atalhos'),items:links}],
    footer:[...(c.access?.agency?[{href:'#agency/dashboard',label:tr('Visão da agência'),icon:'users'}]:[]),...(allowedView('settings')?[navItem(nav.at(-1))]:[])]});
}
function appTopbar(){
  const session = c.access?.session;
  const active=nav.find(x=>x[0]===c.view), page=c.view==='link'?c.agency?.menuLinks.find(l=>l.id===c.tab)?.title||'Link':tr(active?.[1]);
  const profileLabel = session?.name || tr('Perfil do workspace');
  const profileText = session?.name?.slice(0, 2).toUpperCase() || 'gr';
  return topbar({crumbs:[{label:c.s.profile.name,href:'#launchpad'},{label:page}],search:'data-act="search"',
    tools:[{icon:'bell',label:tr('Notificações'),attr:'data-act="notifications"'}],
    profile:{text:profileText,picture:session?.picture||'',label:profileLabel,attr:session?'data-act="account" aria-haspopup="dialog"':'data-go="settings"'}});
}
function renderAccountLifecycle() {
  stopSubWaPoll();
  const account = c.account;
  const status = account.status === 'Closed' ? 'encerrada' : 'pausada';
  const history = (account.statusHistory || []).slice().reverse();
  const date = value => new Date(value).toLocaleString('pt-BR');
  const support = account.support ? `<p>Modo de suporte · Somente leitura</p>
    <p>${h(c.s.profile.name)} · ${c.m.contacts} contatos · ${c.m.open} oportunidades abertas</p>
    ${history.length ? `<details><summary>Histórico de status</summary><ul>${history.map(row =>
      `<li>${h(date(row.at))} · ${h(row.actor)} · ${h(tr(row.from))} → ${h(tr(row.to))}${row.reason ? ` · ${h(row.reason)}` : ''}</li>`).join('')}</ul></details>` : ''}
    ${Object.keys(account.ignoredWebhooks || {}).length ? `<details><summary>Eventos recebidos durante a suspensão</summary><ul>${Object.entries(account.ignoredWebhooks).map(([provider, row]) =>
      `<li>${h({ waha: 'WAHA', evolution: 'Evolution API' }[provider] || 'WhatsApp')} · ${h(row.count)} ignorado(s) · último em ${h(date(row.lastAt))}</li>`).join('')}</ul></details>` : ''}
    <a class="primary" href="#agency/accounts">Gerenciar subcontas</a>` : account.canReactivate ? `<p>${h(tr('Pague o plano para voltar a usar a subconta. O acesso volta assim que o pagamento for confirmado.'))}</p><button class="primary" data-act="account-pay">${h(tr('Pagar e reativar'))}</button>`
    : `<p>Entre em contato com o suporte da sua agência para recuperar o acesso.</p>`;
  app.innerHTML = `<main class="boot boot-error"><h1>Subconta ${status}</h1>
    ${account.suspendedReason ? `<p>${h(account.suspendedReason)}</p>` : ''}${support}
    <div class="inline-gap"><button class="secondary" data-act="account-retry">Verificar acesso</button><button class="secondary" data-act="workspaces">Trocar de workspace</button></div></main>`;
}
function render(){
  if (c.account) { renderAccountLifecycle(); mobileShell.paint(); return; }
  if(viewPath||c.mode==='agency')return;
  unmountDesignStage(G('.dw-stage'));
  const viewKey = `${c.workspace}:${c.view}:${c.tab}:${c.studio.project}`;
  const previousScroll = renderedView === viewKey ? G('#screen')?.scrollTop || 0 : 0;
  const kanbanScroll = renderedView === viewKey ? G('.kanban')?.scrollLeft || 0 : 0;
  const timelineScroll = renderedView === viewKey ? G('[data-ep-tl-scroll]') : null, timelineAt = timelineScroll && [timelineScroll.scrollLeft, timelineScroll.scrollTop];
  renderedView = viewKey;
  const agencyName=c.agency?.name&&!['My Agency','Minha agência'].includes(c.agency.name)?c.agency.name:'';
  const brand=agencyName||brandName(c.agency?.brand), customLink=c.agency?.menuLinks.find(l=>l.id===c.tab);
  const active=nav.find(x=>x[0]===c.view);
  document.title=brand;
  // In the agency's app the colors come from the app's theme.
  if (mobileShell.active()) applyBrandColor();
  else applyBrandColor(c.agency?.primary, c.agency?.secondary, c.agency?.accent);
  const notices=(c.agency?.announcements||[]).filter(a=>!sessionDismissed.has(a.id)).map(a=>`<div class="ag-banner ${a.tone==='Warning'?'warn':a.tone==='Success'?'ok':''}" role="status"><b>${h(a.title)}</b><span>${h(a.body)}</span><button class="icon-btn" data-dismiss-notice="${h(a.id)}" aria-label="Dispensar aviso">${i('close',15)}</button></div>`).join('');
  const screenHtml=c.view==='link'?(customLink?`<div class="ag-frame"><iframe src="${h(customLink.url)}" title="${h(customLink.title)}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-forms allow-same-origin allow-popups"></iframe><p class="dim">Se a página ficar em branco, o site não permite incorporação. <a class="text-link" href="${h(customLink.url)}" target="_blank" rel="noopener">Abrir em nova aba</a></p></div>`:'<div class="page"><p>Este link não está mais disponível.</p></div>'):screens[c.view](c);
  app.innerHTML=`<div class="shell ${c.navOpen?'wide':''}">${mobileShell.active()?'':appSidebar(brand)}<div class="workspace">${mobileShell.active()?mobileShell.header():appTopbar()}${c.access?.name&&!c.access.session&&actingUser()?`<div class="ag-banner acting" role="status"><b>Agindo como ${h(c.access.name)}</b><span>Módulos e subcontas seguem as permissões deste usuário.</span><button class="secondary" data-act="stop-acting">Parar</button></div>`:''}${notices}${c.launchpadReturn && c.view!=='launchpad' ? `<div class="lp-return"><a href="#launchpad/${h(c.launchpadReturn)}">${i('left',14)} Voltar ao guia</a><span>Continue a configuração. Seu progresso será reconhecido ao voltar.</span><button class="icon-btn" aria-label="Fechar lembrete do guia" data-act="launchpad-dismiss">${i('close',14)}</button></div>` : ''}<main id="screen" class="screen">${c.billingNotice==='past_due'?`<div class="page-notice"><p class="surface padded ag-warn" role="status">${h(tr('O pagamento do plano desta subconta foi recusado. Confira o cartão ou fale com a sua agência para não perder o acesso.'))}</p></div>`:''}${screenHtml}${rodapeHtml(brand)}</main></div></div>`;
  mobileShell.paint();
  if (getLanguage() === 'es') translateDom(app);
  mountBeautifulUI(G('#screen'), c, { render });
  if(c.view==='conversations'&&c.thread) {const area=G('.thread-messages');if(area)area.scrollTop=area.scrollHeight;}
  if(c.view==='dashboard') { G('#screen').scrollTop=previousScroll; }
  if(c.view==='marketing'&&c.tab==='events') placeTimeline(...(timelineAt||[]));
  if(c.view==='dashboard' || c.view==='reporting') { drawDashboardGauges(app); }
  if(c.view==='opportunities') {
    G('#screen').scrollTop = previousScroll;
    const board = G('.kanban');
    if(board) board.scrollLeft = kanbanScroll;
  }
  if(c.view==='studio' || (c.view==='sites' && ['editor','build'].includes(c.tab))) afterStudioRender();
  if(c.view==='sites') { afterSitesRender(); afterFormsRender(); }
  if(c.view==='payments'&&c.tab==='document') afterDocumentsRender();
  if(c.view==='memberships') { mountClientPortal?.(); mountCommunities?.(); mountCourses?.(); }
  const aiHub = G('[data-ai-hub]');
  if (aiHub) {
    const workspace = c.workspace;
    mountAgentHub({
      root: aiHub, flash, rerender: () => { if (c.workspace === workspace && c.view === 'ai-agents') render(); },
      state: () => c.s,
      request: (operation, data) => api(`/api/ai/${operation}?workspace=${encodeURIComponent(workspace)}`, data),
      async createAgent(template) {
        const { agent } = await api(`/api/agents/create?workspace=${encodeURIComponent(workspace)}`, { template });
        if (c.workspace === workspace) c.s.agents.push(agent);
        location.hash = `#ai-agents/edit/${encodeURIComponent(agent.id)}`;
      }
    });
  }
  const agentScreen = G('[data-agent-screen]');
  if (agentScreen?.dataset.agentId && editor?.id === agentScreen.dataset.agentId && editor.workspace === c.workspace) {
    agentScreen.replaceWith(editor.root);
    G('#screen').scrollTop = previousScroll;
  } else {
    leaveAgentEditor();
    if (agentScreen) {
      const workspace = c.workspace;
      editor = mountAgentScreen({
        root: agentScreen, workspace, model: c.features?.agentModel,
        startAgent: c.s.agents.find(agent => agent.id === c.agentId),
        agents: () => c.s.agents,
        runs: () => c.s.agentRuns || [],
        request: (operation, data) => api(`/api/agents/${operation}?workspace=${encodeURIComponent(workspace)}`, data),
        updateAgent(id, agent, rerender = true) {
          if (c.workspace !== workspace) return;
          const index = c.s.agents.findIndex(item => item.id === id);
          if (index !== -1) c.s.agents.splice(index, 1, ...(agent ? [agent] : []));
          else if (agent) c.s.agents.push(agent);
          if (!agent) c.s.agentRuns = (c.s.agentRuns || []).filter(run => run.agent !== id);
          if (rerender && c.mode !== 'agency' && c.view === 'ai-agents' && c.tab !== 'edit') render();
        },
        addRun(run) {
          if (c.workspace !== workspace) return;
          c.s.agentRuns = [run, ...(c.s.agentRuns || [])].slice(0, 100);
          if (c.mode !== 'agency' && c.view === 'ai-agents' && c.tab !== 'edit') render();
        },
        refresh() { if (c.workspace === workspace && c.mode !== 'agency' && c.view === 'ai-agents' && c.tab !== 'edit') render(); }
      });
    }
  }
}
window.addEventListener('beforeunload', event => {
  if (editor?.dirty()) event.preventDefault();
});
function rerenderSearch(focusId,value,start,end){ G('#screen').innerHTML=screens[c.view](c);mountBeautifulUI(G('#screen'),c,{render});const el=G(`#${focusId}`);if(el){el.value=value;el.focus();el.setSelectionRange(start,end);} }
function close(){ const d=G('#dialog');if(d?.open)d.close();overlay.innerHTML='';if(modalReturn?.isConnected)modalReturn.focus(); }
function dialog(title,body,{form='',description='',buttons='',key='',id=''}={}){
  modalReturn=document.activeElement;
  overlay.innerHTML=`<dialog id="dialog" aria-labelledby="modal-title"><header><div><h2 id="modal-title">${h(title)}</h2>${description?`<p>${h(description)}</p>`:''}</div>${iconBtn('close','Fechar','data-act="close"')}</header>${form?`<form data-form="${form}" data-key="${key}" data-id="${id}"><div class="modal-body">${body}<p class="form-status" role="alert"></p></div><footer>${buttons||'<button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Salvar</button>'}</footer></form>`:`<div class="modal-body">${body}</div>`}</dialog>`;
  const d=G('#dialog');d.showModal();d.addEventListener('cancel',ev=>{ev.preventDefault();close();});
  let downTarget=null;d.addEventListener('mousedown',ev=>{downTarget=ev.target;});
  d.addEventListener('click',ev=>{
    if(ev.target===d&&downTarget===d){
      const r=d.getBoundingClientRect();
      if(ev.clientY<r.top||ev.clientY>r.bottom||ev.clientX<r.left||ev.clientX>r.right)close();
    }
  });
}
const list=(arr)=>arr.map(item=>Array.isArray(item)?item:[item,item]);
function field(label,key,v='',type='text',required=false,options=[]){
  const o=required?' required':'';
  if(type==='textarea')return `<label>${label}<textarea name="${key}"${o}>${h(v)}</textarea></label>`;
  if(type==='check')return `<label class="check"><input name="${key}" type="checkbox" ${v?'checked':''}> ${label}</label>`;
  if(type==='select')return `<label>${label}<select name="${key}"${o}>${list(options).map(([id,label])=>`<option value="${h(id)}" ${String(id)===String(v)?'selected':''}>${h(label)}</option>`).join('')}</select></label>`;
  return `<label>${label}<input name="${key}" type="${type}" value="${h(v)}"${o}${type==='number'?' min="0" max="1000000000" step="0.01"':''}></label>`;
}
const localTime=(value,zone)=>{
  if(!value)return '';
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:zone}).formatToParts(new Date(value)).map(a=>[a.type,a.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};
function toInstant(wall,zone){
  if(!wall)return '';
  let target=Date.parse(`${wall}Z`), guess=target;
  for(let n=0;n<4;n++){const represented=Date.parse(`${localTime(guess,zone)}Z`);if(represented===target)break;guess+=target-represented;}
  if(localTime(guess,zone)!==wall)throw Error('This local time is not valid in the workspace time zone.');
  return new Date(guess).toISOString();
}
const contactChoices=()=>[['','Selecione um contato'],...c.s.contacts.map(r=>[r.id,r.name])];
const option=(label,key,value,choices,required=true)=>field(label,key,value,'select',required,choices);
const opportunityStatusChoices=()=>opportunityStatuses.map(status=>[status,tr(status)]);
const pipelineChoices=()=>c.s.pipelines.map(item=>[item.id,tr(item.name)]);
const stageChoices=pipelineId=>c.s.stages.filter(stage=>stage.pipelineId===pipelineId).map(stage=>[stage.id,tr(stage.name)]);
const input=(label,key,value,required=false,type='text')=>field(label,key,value,type,required);
const area=(label,key,value,required=false)=>field(label,key,value,'textarea',required);
const check=(label,key,value)=>field(label,key,value,'check');
const zones=()=>c.s.profile.timezone;
const entityNames={contacts:'Contato',tasks:'Tarefa',opportunities:'Oportunidade',appointments:'Agendamento',workflows:'Fluxo',invoices:'Fatura',campaigns:'Campanha',pages:'Página',forms:'Formulário',courses:'Curso',reviews:'Avaliação',snippets:'Resposta rápida',snippetFolders:'Pasta',triggerLinks:'Link de rastreamento',...crmEntityNames};
// Grammatical gender of each record name, so titles read "Nova tarefa" and "Novo contato".
const feminine=new Set(['tasks','opportunities','invoices','campaigns','pages','reviews','snippetFolders','snippets','companies','subscriptions','transactions']);
const lowerName=key=>{const n=entityNames[key]||'';return key==='tags'?n:n.charAt(0).toLowerCase()+n.slice(1);};
const newTitle=key=>`${feminine.has(key)?'Nova':'Novo'} ${lowerName(key)}`;
const optionalGroup = (attribute, visible, content) => `<fieldset ${attribute} ${visible ? '' : 'hidden disabled'}>${content}</fieldset>`;
function edit(key,id,preset={}){
  const entry=c.s[key]?.find(r=>r.id===id); if(id&&!entry)return;
  const r=entry||preset; let body='';
  switch(key){
    case 'contacts':body=input('Nome completo','name',r.name,true)+`<div class="field-grid">${input('E-mail','email',r.email,false,'email')}${input('Telefone','phone',r.phone,false,'tel')}</div>`+input('CPF ou CNPJ','taxId',formatTaxId(r.taxId||''))+`<label>Empresa<input name="company" list="crm-companies" value="${h(r.company||'')}"></label><datalist id="crm-companies">${c.s.companies.map(x=>`<option value="${h(x.name)}">`).join('')}</datalist>`+input('Tags (separadas por vírgula)','tags',r.tags?.join(', '))+area('Notas','notes',r.notes)+customInputs(c,'Contact',r)+contactScore(r)+contactPreferences(c,r)+(id?`<div class="inline-gap"><button type="button" class="secondary" data-start-thread="${id}">${i('chat',16)} Abrir conversa</button><button type="button" class="secondary" data-edit="tasks" data-contact="${id}">${i('plus',16)} Nova tarefa</button></div>`:'');break;
    case 'tasks':body=input('Título','title',r.title,true)+option('Contato','contactId',r.contactId,contactChoices(),false)+input('Prazo','due',r.due?r.due.slice(0,10):'',false,'date')+input('Responsável','owner',r.owner)+area('Notas','notes',r.notes)+check('Concluída','done',r.done);break;
    case 'opportunities': {
      const pipelineId = c.s.stages.find(stage => stage.id === r.stage)?.pipelineId ||
        c.s.pipelines.find(item => item.id === c.pipeline)?.id || c.s.pipelines[0].id;
      const stages = stageChoices(pipelineId);
      const contact = c.s.contacts.find(item => item.id === r.contactId);
      body='<h3>Contato principal</h3>'+option('Contato','contactId',r.contactId,[['','Selecione um contato'],...contactChoices().slice(1)])+
        `<div class="field-grid"><label>E-mail <output data-opportunity-email>${h(contact?.email || '—')}</output></label>
        <label>Telefone <output data-opportunity-phone>${h(contact?.phone || '—')}</output></label></div>`+
        '<h3>Dados da oportunidade</h3>'+input('Nome da oportunidade','title',r.title,true)+
        `<div class="field-grid">${option('Pipeline','pipelineId',pipelineId,pipelineChoices())}${option('Etapa','stage',r.stage || stages[0]?.[0],stages)}</div>`+
        `<div class="field-grid">${input(`Valor (${c.s.profile.currency})`,'value',r.value??0,true,'number')}${option('Status','status',r.status||'Open',opportunityStatusChoices())}</div>`+
        optionalGroup('data-opportunity-loss',r.status === 'Lost',input('Motivo da perda','lostReason',r.lostReason))+
        `<div class="field-grid">${input('Origem','source',r.source)}${input('Responsável','owner',r.owner)}</div>`+
        `<div class="field-grid">${input('Empresa','company',r.company)}${input('Seguidores (separados por vírgula)','followers',r.followers?.join(', '))}</div>`+
        `<div class="field-grid">${input('Previsão de fechamento','closeDate',r.closeDate,false,'date')}${input('Probabilidade (%), vazio usa a da etapa','probability',r.probability??'',false,'number')}</div>`+
        input('Tags (separadas por vírgula)','tags',r.tags?.join(', '))+customInputs(c,'Opportunity',r);
      break;
    }
    case 'appointments':body=input('Título','title',r.title,true)+option('Contato','contactId',r.contactId,contactChoices(),false)+`<p class="dim">Horários no fuso ${h(zones())}.</p><div class="field-grid">${input('Início','start',localTime(r.start,zones())||(r.date?`${r.date}T09:00`:''),true,'datetime-local')}${input('Fim','end',localTime(r.end,zones())||(r.date?`${r.date}T09:30`:''),true,'datetime-local')}</div>`+((c.s.services||[]).length||(c.s.scheduling?.staff||[]).length?`<div class="field-grid">${option('Serviço','serviceId',r.serviceId||'',[['','Nenhum'],...(c.s.services||[]).map(x=>[x.id,x.name])],false)}${option('Profissional','staffId',r.staffId||'',[['','Ninguém'],...(c.s.scheduling?.staff||[]).map(p=>[p.id,p.name])],false)}</div>`+input('Endereço (serviço em campo)','address',r.address||'',false):'')+option('Status','status',r.status||'Confirmed',['Confirmed','Completed','Canceled'])+area('Notas','notes',r.notes);break;
    case 'snippetFolders': body = input('Nome da pasta','name',r.name,true); break;
    case 'snippets': {
      const type = r.type || r.kind || 'Text';
      body = input('Nome da resposta rápida','name',r.name,true) + option('Tipo','type',type,[['Text','Texto'],['Email','E-mail']]) +
        option('Pasta','folderId',r.folderId || c.conversationFilters.folder || '',[['','Nenhuma pasta'],...c.s.snippetFolders.map(folder => [folder.id,folder.name])],false) +
        optionalGroup('data-snippet-subject',type === 'Email',input('Assunto','subject',r.subject,true)) +
        area('Mensagem','body',r.body,true) + `<p class="dim snippet-fields">Campos: ${[...snippetFields, ...(c.s.customValues || []).filter(v => v.key).map(v => [`{{${v.key}}}`, v.name])]
          .map(([token, label]) => `<code title="${h(label)}">${h(token)}</code>`).join(' ')}. Textos valem para WhatsApp, chat do site, SMS e redes; a conversa mantém o canal aberto.</p>`;
      break;
    }
    case 'triggerLinks': body = input('Nome','name',r.name,true) + input('URL do link','url',r.url,true,'url'); break;
    case 'invoices':body=input('Nome da fatura','title',r.title,true)+option('Contato','contactId',r.contactId,contactChoices())+`<div class="field-grid">${input(`Valor (${c.s.profile.currency})`,'value',r.value??0,true,'number')}${input('Vencimento','due',r.due?.slice(0,10),true,'date')}</div>`+option('Status','status',r.status||'Draft',[['Draft','Rascunho'],['Open','Em aberto'],['Paid','Paga'],['Void','Cancelada']]);break;
    case 'campaigns':body=input('Nome da campanha','name',r.name,true)+option('Canal','channel',r.channel||'Social',[['Social','Social'],['Email','E-mail']])+area('Conteúdo','body',r.body,true)+input('Data prevista','date',r.date?.slice(0,10),false,'date')+option('Status','status',r.status||'Draft',[['Draft','Rascunho'],['Planned','Planejado'],['Archived','Arquivado']]);break;
    case 'pages':body=input('Nome da página','name',r.name,true)+option('Tipo','kind',r.kind||'Funnel',[['Funnel','Funil'],['Website','Site']])+input('Título principal','headline',r.headline,true)+area('Texto da página','body',r.body)+input('Texto do botão','button',r.button)+option('Formulário','formId',r.formId,[['','Nenhum formulário'],...c.s.forms.map(a=>[a.id,`${a.name}${a.active?'':' (Rascunho)'}`])],false)+check('Publicar localmente','active',r.active);break;
    case 'forms':body=input('Nome do formulário','name',r.name,true)+area('Descrição','description',r.description)+check('Pedir número de telefone','askPhone',r.askPhone)+check('Publicar localmente','active',r.active);break;
    case 'courses':body=input('Nome do curso','name',r.name,true)+area('Descrição','description',r.description)+input('Título da aula','lesson',r.lesson,true)+area('Conteúdo da aula','body',r.body)+check('Apenas no portal do cliente','portalOnly',r.portalOnly ?? !id)+check('Publicar curso','active',r.active);break;
    case 'reviews':body=input('Autor da avaliação','author',r.author,true)+option('Nota','score',r.score||5,[5,4,3,2,1])+area('Avaliação','text',r.text,true)+area('Resposta','reply',r.reply);break;
    default:body=crmForm(c,key,r,preset);if(!body)return;
  }
  dialog(id?`Editar ${lowerName(key)}`:newTitle(key),body,{form:'record',key,id:id||'',buttons:`${id?`<button class="danger plain" type="button" data-delete="${key}" data-id="${id}">${i('trash',16)} Excluir</button>`:''}<span class="spacer"></span><button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">${id?'Salvar alterações':`Criar ${lowerName(key)}`}</button>`});
}

function workspaces(){
  const ini = s => String(s || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '·';
  const agency = c.access?.agency ? `<p class="ws-label">${tr('Agência')}</p><button class="choice ws-choice ws-agency" data-act="agency-view"><span class="ws-tile" aria-hidden="true">${i('users',18)}</span><span class="ws-text"><strong>${tr('Visão da agência')}</strong><span>${tr('Painel da agência com todas as subcontas')}</span></span>${i('right',16)}</button>` : '';
  const choices = c.workspaces.map(w => { const here = w.id === c.workspace; return `<button class="choice ws-choice${here ? ' ws-here' : ''}" data-workspace="${w.id}"${here ? ' aria-current="true"' : ''}><span class="ws-tile" aria-hidden="true">${h(ini(w.name))}</span><span class="ws-text"><strong>${h(w.name)}</strong><span>${tr('Subconta')}</span></span>${here ? `<span class="ws-current">${i('check',13)} ${tr('Atual')}</span>` : ''}</button>`; }).join('');
  const create = c.access?.agency ? `<button class="secondary" data-act="new-workspace">${i('plus',16)} Novo workspace</button>` : '';
  dialog('Trocar de workspace', `<div class="ws-switch">${agency}${choices ? `<p class="ws-label">${tr('Subcontas')}</p>${choices}` : ''}${create}</div>`);
}
function switchingCover(name){
  const cover=document.createElement('div');
  cover.className='switch-cover';
  cover.innerHTML=bootScreen(`Abrindo ${h(name||'a subconta')}…`);
  document.body.append(cover);
  return cover;
}
async function useWorkspace(id, view=mobileShell.start()||'launchpad', name){
  const cover=switchingCover(name||c.workspaces.find(w=>w.id===id)?.name);
  try { await enterWorkspace(id, view); } finally { cover.remove(); }
}
async function enterWorkspace(id, view){ leaveAgentEditor();stopSubWaPoll();c.reportDraft=null;c.workspace=id;c.launchpadReturn='';c.wa=null;c.pay=null;c.waPairOpen=false;c.choice='';c.thread='';c.chat=[];c.query='';c.tag='';c.conversationFilters={};c.inbox=undefined;c.dash=dashboardPreferences(id);c.pipeline='';c.opportunityFilters=undefined;c.opportunitySort=undefined;c.opportunityCard=undefined;c.opportunityList='';c.studio={brief:'',template:'landing',project:''};await load(); localStorage.setItem('go.workspace',id);const address=new URL(location.href);address.searchParams.set('workspace',id);history.replaceState(null,'',address);close();go(view); }
function downloads(name,content,type='text/csv;charset=utf-8'){
  const data=typeof content==='string'?new Blob([content],{type}):content, a=document.createElement('a'), u=URL.createObjectURL(data);
  a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),3000);
}
function parseCSV(csv){
  const source=csv.replace(/^\uFEFF/,''), sep=source.split(/\r?\n/,1)[0].includes(';')?';':',';
  const rows=[];let r=[],v='',quoted=false;
  function push(){r.push(v);if(r.some(x=>x.trim()))rows.push(r);r=[];v='';}
  for(let n=0;n<source.length;n++){const a=source[n];if(quoted){if(a==='"'&&source[n+1]==='"'){v+='"';n++;}else if(a==='"')quoted=false;else v+=a;}else if(a==='"'&&!v)quoted=true;else if(a===sep){r.push(v);v='';}else if(a==='\n'||a==='\r'){if(a==='\r'&&source[n+1]==='\n')n++;push();}else v+=a;}
  if(quoted)throw Error('An opening quote in the CSV was not closed.');push();
  const keys=(rows.shift()||[]).map(k=>k.trim().toLowerCase());
  if(!keys.includes('name'))throw Error('The CSV needs a name column. Optional columns: email, phone, company, tags and notes.');
  return rows.map(row=>Object.fromEntries(keys.map((k,n)=>[k,row[n]||''])));
}
async function thread(id){ c.thread=id;await mutate({type:'thread',data:{contactId:id,read:true}});close();go('conversations',c.view==='conversations' && !conversationSections.includes(c.tab) ? c.tab : ''); }
async function move(id,stage){
  const record=c.s.opportunities.find(item=>item.id===id);
  if(!record || record.stage===stage)return;
  await mutate({type:'opportunity-move',id,data:{stage}});
  render();
  flash('Oportunidade movida.');
}

function opportunityDialog(action) {
  const pipelineId = c.s.pipelines.find(item => item.id === c.pipeline)?.id || c.s.pipelines[0].id;
  const cancel = '<button class="secondary" type="button" data-act="close">Cancelar</button>';
  const apply = cancel + '<button class="primary">Aplicar</button>';
  if (action === 'opportunity-sort') {
    const sort = c.opportunitySort || {};
    dialog('Ordenar oportunidades',option('Campo','field',sort.field || 'created',Object.entries(opportunitySorts))+
      option('Direção','direction',sort.direction || 'desc',[['desc','Decrescente'],['asc','Crescente']]),{form:action,buttons:apply});
  } else if (action === 'opportunity-fields') {
    const {layout,fields,actions} = c.opportunityCard || opportunityPreferences(c.workspace,c.access?.session?.id);
    const ordered = (all,chosen) => [...chosen,...Object.keys(all).filter(key=>!chosen.includes(key))];
    const rows = (all,chosen,name) => ordered(all,chosen).map(key=>`<li class="card-pref" data-card-pref><label class="check"><input type="checkbox" name="${name}" value="${key}" ${chosen.includes(key)?'checked':''}> ${all[key]}</label>
      <span class="inline-gap"><button type="button" class="icon-btn" data-card-pref-move="-1" aria-label="Mover ${h(all[key])} para cima">${i('arrowUp',14)}</button><button type="button" class="icon-btn" data-card-pref-move="1" aria-label="Mover ${h(all[key])} para baixo">${i('arrowDown',14)}</button></span></li>`).join('');
    dialog('Personalizar cartões',option('Layout','layout',layout,Object.entries(cardLayouts))+
      `<fieldset class="opportunity-fieldset"><legend>Campos (${fields.length} de ${Object.keys(cardFields).length})</legend><ul class="card-prefs">${rows(cardFields,fields,'field')}</ul></fieldset>`+
      `<fieldset class="opportunity-fieldset"><legend>Ações rápidas</legend><p class="dim">A contagem de cada ação aparece no cartão quando houver.</p><ul class="card-prefs">${rows(quickActions,actions,'action')}</ul></fieldset>`,{form:action,buttons:apply});
  } else if (action === 'opportunity-import') {
    const history = c.s.imports.filter(row=>row.object === 'opportunities').slice(-5).reverse();
    dialog('Importar oportunidades',option('Pipeline padrão','pipelineId',pipelineId,pipelineChoices())+
      '<p>Envie até 500 linhas. Informe <b>title</b> e o <b>email</b> ou <b>contactid</b> de um contato existente. Sem etapa indicada, o Graao usa a primeira do pipeline.</p>'+
      '<button class="secondary" type="button" data-act="opportunity-template">Baixar modelo CSV</button>'+
      '<label>Arquivo CSV<input name="file" type="file" accept=".csv,text/csv" required></label>'+
      (history.length ? '<h3>Importações recentes</h3>'+history.map(row=>`<div class="line-item"><span>${h(row.file || 'CSV')}</span><span>${row.added} importada(s)</span></div>`).join('') : ''),
      {form:action,buttons:cancel+'<button class="primary">Importar</button>'});
  }
}

function manualDetails(id, queueMode = false) {
  const item = c.s.manualActions.find(entry => entry.id === id);
  if (!item) return;
  const contact = c.s.contacts.find(entry => entry.id === item.contactId);
  const tel = String(contact?.phone || '').replace(/[^\d+]/g, '');
  const whatsapp = item.type === 'Manual WhatsApp', pending = item.status === 'Pending';
  const details = `<div class="manual-details"><b>${h(contact?.name || 'Contato removido')}</b>
    ${contact?.phone ? `<p>Telefone · ${h(contact.phone)}${tel && item.type === 'Manual Call' && pending ? ` <a class="secondary" href="tel:${h(tel)}">${i('phone',15)} Ligar</a>` : ''}</p>` : ''}
    <p>${h(item.workflowName)} · ${h(item.assignee || 'Não atribuído')}</p>
    ${whatsapp && pending ? '' : `<p class="pre-wrap">${h(item.instructions)}</p>`}
    ${item.note ? `<p class="pre-wrap">${h(item.note)}</p>` : ''}
    ${contact ? `<button type="button" class="secondary" data-start-thread="${contact.id}">${i('chat',16)} Abrir conversa</button>` : ''}
  </div>`;
  if (item.status !== 'Pending') {
    dialog(manualType(item.type), details, { description: tr(item.status) });
    return;
  }
  // WhatsApp: the suggested message is editable and goes out through the sub-account's WhatsApp before completing.
  const canSend = whatsapp && contact?.phone;
  const draft = whatsapp ? area(contact?.phone ? 'Mensagem para enviar' : 'Mensagem sugerida (o contato não tem telefone)','whatsappBody',item.instructions) : '';
  dialog(manualType(item.type), details + draft + area('Observação do resultado','note',''), { form:'manual-action', id,
    buttons:`<button type="button" class="secondary" data-act="close">Cancelar</button><button class="secondary" name="status" value="Skipped">Pular</button>${canSend ? '<button class="primary" name="status" value="Sent">Enviar pelo WhatsApp e concluir</button>' : '<button class="primary" name="status" value="Completed">Marcar como concluído</button>'}` });
  G('form[data-form="manual-action"]').dataset.queue = String(queueMode);
}

function composer() {
  return G('form[data-form="message"]');
}

function showEmailSubject(form) {
  const isEmail = form.elements.channel.value === 'Email';
  form.querySelector('.message-email').hidden = !isEmail;
  form.elements.subject.disabled = !isEmail;
}

// Remembers the channel of this conversation (the screen is rebuilt on every update) and refreshes the submit label.
function composerChanged(form) {
  c.composer = { thread: c.thread, channel: form.elements.channel.value };
  showEmailSubject(form);
  form.querySelector('[data-compose-submit] span').textContent = tr(composerAction(form.elements.channel.value, form.elements.direction.value));
}

function insertIntoComposer(value) {
  const body = composer().elements.body;
  const start = body.selectionStart;
  const end = body.selectionEnd;
  const prefix = start > 0 && !/\s/.test(body.value[start - 1]) ? ' ' : '';
  const suffix = end < body.value.length && !/\s/.test(body.value[end]) ? ' ' : '';
  body.setRangeText(`${prefix}${value}${suffix}`, start, end, 'end');
  close();
  body.focus();
}

// Fields a snippet can use: the contact, the business, the signed-in user and the custom values.
const snippetFields = [['{{contact.first_name}}','Primeiro nome'],['{{contact.name}}','Nome completo'],['{{contact.email}}','E-mail'],['{{contact.phone}}','Telefone'],
  ['{{contact.company}}','Empresa do contato'],['{{location.name}}','Nome do negócio'],['{{user.name}}','Seu nome']];
function snippetValues(contact = {}) {
  const values = { 'contact.name':contact.name || '', 'contact.first_name':String(contact.name || '').split(/\s+/)[0], 'contact.email':contact.email || '',
    'contact.phone':contact.phone || '', 'contact.company':contact.company || '', 'location.name':c.s.profile.name, 'workspace.name':c.s.profile.name,
    'user.name':c.access?.name || c.me?.name || '' };
  for (const item of c.s.customValues || []) if (item.key) values[item.key] = item.value || '';
  return values;
}
function useSnippet(id) {
  const snippet = c.s.snippets.find(item => item.id === id);
  const contact = c.s.contacts.find(item => item.id === c.thread);
  const values = snippetValues(contact);
  const merge = text => text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (whole,key) => Object.hasOwn(values,key) ? values[key] || '' : whole);
  const form = composer();
  // E-mail snippets switch to e-mail; text snippets keep the conversation's channel (WhatsApp, chat, SMS…),
  // leaving e-mail and internal notes for the most recent channel the contact used.
  const current = form.elements.channel.value;
  if (snippet.type === 'Email') form.elements.channel.value = 'Email';
  else if (['Email','Note'].includes(current)) {
    const last = [...c.s.messages].reverse().find(m => m.contactId === c.thread && !['Email','Note'].includes(m.channel))?.channel;
    form.elements.channel.value = [...form.elements.channel.options].some(o => o.value === last) ? last : 'WhatsApp';
  }
  composerChanged(form);
  if (snippet.type === 'Email' && !form.elements.subject.value) form.elements.subject.value = merge(snippet.subject);
  insertIntoComposer(merge(snippet.body));
}

function pickComposerItem(kind) {
  const snippets = kind === 'snippet';
  const collection = snippets ? c.s.snippets : c.s.triggerLinks;
  const label = snippets ? 'resposta rápida' : 'link de rastreamento';
  const editor = snippets ? '#conversations/snippets' : '#conversations/trigger-links';
  if (!collection.length) {
    dialog(`Inserir ${label}`, `<p>${snippets ? 'Nenhuma resposta rápida foi criada ainda.' : 'Nenhum link de rastreamento foi criado ainda.'}</p><a href="${editor}" class="secondary" data-close-dialog>Abrir ${snippets ? 'Respostas Rápidas' : 'Links de Rastreamento'}</a>`);
    return;
  }
  dialog(`Inserir ${label}`, `<label>Buscar<input id="composer-search" placeholder="Buscar…" autocomplete="off"></label><div class="composer-options">${collection.map(item =>
    `<button type="button" class="choice" data-composer-item ${snippets ? 'data-use-snippet' : 'data-use-link'}="${item.id}">
      <strong>${h(item.name)}</strong>${snippets ? `<span>${h(tr(item.type))} · ${h(item.body.slice(0,120))}</span>` : `<span>${h(item.url)}</span>`}</button>`).join('')}</div>`);
}

async function copyLink(path) {
  const url = new URL(path, location.origin).href;
  try {
    await navigator.clipboard.writeText(url);
    flash('Link copiado.');
  } catch {
    dialog('Copiar link', `<label>URL<input readonly value="${h(url)}"></label>`);
    G('#dialog input').select();
  }
}

function showFieldset(fieldset, visible) {
  if (!fieldset) return;
  fieldset.hidden = !visible;
  fieldset.disabled = !visible;
}

function editStage(id, pipelineId) {
  const stage = c.s.stages.find(item => item.id === id);
  dialog(stage ? 'Editar etapa' : 'Adicionar etapa',input('Nome da etapa','name',stage ? tr(stage.name) : '',true) +
    `<input type="hidden" name="pipelineId" value="${h(stage?.pipelineId || pipelineId)}">` +
    input('Probabilidade de ganho (%) para a previsão','probability',stage?.probability ?? '',false,'number') +
    check('Mostrar no funil e na distribuição por etapa','visible',stage?.visible !== false),{ form:'stage',id:stage?.id || '' });
}

function viewReport(id) {
  const report = c.s.dashboardReports.find(item => item.id === id);
  if (!report) return;
  dialog(report.name,reportGrid(report.rows) + `<button class="secondary" data-report-download="${id}">${i('download',15)} Baixar CSV</button>`);
}

function downloadReport(id) {
  const report = c.s.dashboardReports.find(item => item.id === id);
  if (!report) return;
  const csv = value => {
    let content=String(value);
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(content)) content=`'${content}`;
    return `"${content.replaceAll('"','""')}"`;
  };
  downloads('dashboard-report.csv',[['Widget','Measure','Value'],...report.rows].map(line => line.map(csv).join(',')).join('\r\n'));
}

function conversationFormControls(element) {
  const form = element.form;
  if (!form) return;
  if (form.dataset.form === 'message' && ['channel', 'direction'].includes(element.name)) composerChanged(form);
  if (form.dataset.form === 'phone-number' && element.name === 'mode') { const box = form.querySelector('.phone-voice'); if (box) box.hidden = element.value !== 'voice_ai'; }
  if (form.dataset.key === 'snippets' && element.name === 'type') showFieldset(form.querySelector('[data-snippet-subject]'),element.value === 'Email');
  if (form.dataset.form !== 'conversation-sla') return;
  if (element.name === 'mode') {
    for (const group of form.querySelectorAll('[data-sla-mode]')) showFieldset(group,group.dataset.slaMode === element.value);
  }
  if (element.name === 'automation') {
    const label = form.querySelector('[data-sla-workflows]');
    label.hidden = element.value !== 'selected';
    label.querySelector('select').disabled = label.hidden;
  }
}
function assistant(prompt){const q=prompt.toLowerCase(), m=c.m;if(/deal|pipeline|opportun|lead|venda|funil/.test(q))return `Há ${m.open} oportunidade(s) aberta(s) no valor de ${money(m.openValue)}, e ${m.won} ganha(s). Abra Oportunidades para ver as etapas.`;if(/agenda|appointment|book|calendar/.test(q))return `Há ${m.appointments} agendamento(s) ativos. Abra Calendários para ver datas e detalhes.`;if(/contact|contat/.test(q))return `Você tem ${m.contacts} contato(s). Abra Contatos para buscar, filtrar ou importar mais.`;if(/invoice|pagamento|payment/.test(q))return `${money(m.invoicesPaid)} foi marcado como pago. Abra Pagamentos para ver as faturas e saldos.`;return `Este workspace possui ${m.contacts} contato(s), ${m.open} oportunidade(s) aberta(s) e ${m.unread} mensage(ns) não lida(s). Posso resumir contatos, oportunidades, agendamentos ou faturas.`;}

document.addEventListener('click',async ev=>{
  const setupLink = ev.target.closest('a[data-launchpad-start]');
  if(setupLink && !ev.defaultPrevented && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey){
    ev.preventDefault();
    const [view, tab] = setupLink.getAttribute('href').slice(1).split('/');
    c.launchpadReturn=setupLink.dataset.launchpadStart;
    close();go(view,tab);return;
  }
  const studioLink = ev.target.closest('[data-studio-open]');
  if (studioLink && !ev.defaultPrevented && !ev.metaKey && !ev.ctrlKey && !ev.shiftKey && !ev.altKey) {
    ev.preventDefault();
    const href = studioLink.getAttribute('href');
    try { await mutate({type:'studio-visit',id:studioLink.dataset.studioOpen}); }
    catch { /* The project still opens if the visit could not be recorded. */ }
    if (location.hash === href) render(); else location.hash = href;
    return;
  }
  if (ev.target.closest('[data-close-dialog]')) { close(); return; }
  if (c.inbox?.sortOpen && !ev.target.closest('.inbox-menu,[data-inbox-sort]')) { c.inbox.sortOpen=false; render(); }
  const b=ev.target.closest('button,a[data-act]');if(!b)return;
  const d=b.dataset;
  try {
    if (await inboxClick(b,d,inboxContext())) return;
    if (d.studioTemplate) {
      const template = studioTemplates.find(item => item[0] === d.studioTemplate);
      c.studio.template=template[0];
      if (!c.studio.brief.trim()) c.studio.brief=template[2];
      render(); G('.studio-prompt textarea').focus(); return;
    }
    if (d.studioStar) {
      const project = c.s.studioProjects.find(item => item.id === d.studioStar);
      await mutate({type:'studio-star',id:project.id,data:{starred:!project.starred}});
      if (c.tab === 'project') {
        b.setAttribute('aria-pressed',String(!project.starred));
      } else render();
      return;
    }
    if (d.studioExport) {
      const project = c.s.studioProjects.find(item => item.id === d.studioExport);
      downloads('studio-project.html',exportStudioProject(project),'text/html;charset=utf-8'); return;
    }
    if ('studioAddBlock' in d) {
      const container = G('[data-studio-blocks]');
      if (container.children.length < 12) {
        container.insertAdjacentHTML('beforeend',studioBlock()); container.lastElementChild.querySelector('input').focus();
      }
      return;
    }
    if ('studioRemoveBlock' in d) { b.closest('.studio-block').remove(); return; }
    if(d.launchpadHelp){const guide=launchpadGuide(c,d.launchpadHelp);if(guide)dialog(guide.title,guide.body);return;}
    if(d.act==='launchpad-dismiss'){c.launchpadReturn='';render();return;}
    if (d.dashboardReport) { viewReport(d.dashboardReport); return; }
    if (d.reportDownload) { downloadReport(d.reportDownload); return; }
    if (d.stageNew || d.stageEdit) { editStage(d.stageEdit,d.stageNew); return; }
    if (d.pipelineEdit) {
      const pipeline = c.s.pipelines.find(item => item.id === d.pipelineEdit);
      dialog('Rename pipeline',input('Pipeline name','name',pipeline.name,true),{form:'pipeline',id:pipeline.id}); return;
    }
    if (d.manual) { manualDetails(d.manual); return; }
    if (d.dismissSla) { await mutate({type:'dismiss-sla',id:d.dismissSla}); render(); flash('Prazo de atendimento dispensado.'); return; }
    if (d.manualPage) { c.conversationFilters.manualPage = Number(d.manualPage); render(); return; }
    if (d.openFolder) { c.conversationFilters.folder = d.openFolder; go('conversations','snippets'); return; }
    if (d.copyPath) { await copyLink(d.copyPath); return; }
    if (d.useSnippet) { useSnippet(d.useSnippet); return; }
    if (d.useLink) { insertIntoComposer(`{{trigger_link.${d.useLink}}}`); return; }
    if(d.edit){edit(d.edit,d.id,{date:d.date,stage:d.stage,kind:d.kind,channel:d.channel,contactId:d.contact,object:d.object,name:d.name});return;}
    if(d.dismissNotice){sessionDismissed.add(d.dismissNotice);render();return;}
    if(d.go){close();go(d.go);return;}
    if(d.agGo){close();location.hash='#agency/'+d.agGo;return;}
    if(d.tab){go(c.view,d.tab);return;}
    if(d.choice){c.choice=d.choice;G('.choices')?.querySelectorAll('button').forEach(el=>{const sel=el.dataset.choice===d.choice;el.classList.toggle('chosen',sel);el.setAttribute('aria-pressed',String(sel));});G('[data-act="continue-onboarding"]').disabled=false;return;}
    if(d.workspace){await useWorkspace(d.workspace);return;}
    if(d.thread||d.startThread){await thread(d.thread||d.startThread);return;}
    if(d.task){const r=c.s.tasks.find(a=>a.id===d.task);await mutate({type:'save',key:'tasks',id:r.id,data:{...r,done:!r.done}});render();return;}
    if(d.file){const f=c.s.files.find(a=>a.id===d.file);const [header,body]=f.data.split(',');const data=new Blob([Uint8Array.from(atob(body),x=>x.charCodeAt(0))],{type:header.slice(5).split(';')[0]});downloads(f.name,data);return;}
    if(d.provider){dialog(d.provider,'<p>Esta integração não está disponível no workspace local. Uma conta de provedor e uma conexão autorizada são necessárias.</p>');return;}
    if(d.delete){dialog('Excluir este registro?',`<p>${d.delete==='contacts'?'O contato vai para a Lixeira com mensagens, tarefas, oportunidades, agendamentos e faturas associadas. Você pode restaurá-lo por 60 dias.':'Isso remove o registro deste workspace.'}</p>`,{form:'delete',key:d.delete,id:d.id,buttons:'<button class="secondary" type="button" data-act="close">Cancelar</button><button class="danger">Excluir</button>'});return;}
    if(d.callFilter!==undefined){c.callFilter=d.callFilter;render();return;}
    switch(d.act){
      case 'start-manual': {
        const first = manualQueue(c).find(item => item.status === 'Pending');
        if (first) manualDetails(first.id,true);
        break;
      }
      case 'new-snippet': dialog('Nova resposta rápida', '<div class="quick-list"><button class="secondary" data-edit="snippets" data-kind="Text">Adicionar resposta em texto</button><button class="secondary" data-edit="snippets" data-kind="Email">Adicionar resposta por e-mail</button></div>'); break;
      case 'insert-snippet': pickComposerItem('snippet'); break;
      case 'insert-link': pickComposerItem('link'); break;
      case 'close':close();break;
      case 'nav':c.navOpen=!c.navOpen;render();G('[data-act="nav"]')?.focus();break;
      case 'ask-rail':c.askOpen=!c.askOpen;render();G('[data-act="ask-rail"]').focus();break;
      case 'continue-onboarding': {
        if(busy||!c.choice)break;busy=true;b.disabled=true;
        try {const was=c.s.onboarding;await mutate({type:'onboarding',data:was.kind?{kind:was.kind,goal:c.choice,done:true}:{kind:c.choice}});c.choice='';render();(G('.choice')||G('.ask-composer input'))?.focus();} finally {busy=false;if(b.isConnected)b.disabled=false;}
        break;
      }
      case 'workspaces':
        if (c.account && !c.account.support) {
          const available = await api('/api/workspaces');
          c.workspaces = available.workspaces;
        }
        workspaces();break;
      case 'account-retry':await load();route();break;
      case 'agency-view':close();location.hash='#agency/dashboard';break;
      case 'stop-acting':localStorage.removeItem('go.user');location.reload();break;
      case 'account':await accounts.toggle(b);break;
      case 'new-workspace':dialog('Criar workspace',input('Nome do workspace','name','',true),{form:'workspace',buttons:'<button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Criar workspace</button>'});break;
      case 'search':dialog('Buscar no workspace','<div id="search-results" class="bui-search-host"></div>');mountGlobalSearch();break;
      case 'dialer':dialog('Discador','<p>O discador não está conectado. Chamadas de voz exigem a configuração de um provedor de telefonia autorizado.</p>');break;
      case 'updates':dialog('Novidades','<p>O graao está rodando localmente com tudo atualizado.</p>');break;
      case 'notifications':dialog('Notificações',`<p>${c.m.unread} mensage${c.m.unread===1?'m não lida':'ns não lidas'}.</p><button class="secondary" data-go="conversations">Abrir conversas</button>`);break;
      case 'help':dialog('Ajuda','<p>Gerencie contatos, oportunidades, agendamentos, formulários e automações. Acesse Configurações para gerenciar workspaces.</p><button class="secondary" data-go="dashboard">Abrir painel</button>');break;
      case 'reload':await load();render();flash('Workspace atualizado.');break;
      case 'import':dialog('Importar contatos',`<p>Escolha um arquivo CSV com a coluna <b>name</b>. Opcional: email, phone, company, tags e notes. Até 500 contatos.</p><label>Arquivo CSV<input name="file" type="file" accept=".csv,text/csv" required></label><div class="bui-import-preview" data-import-preview></div><input type="hidden" name="previewRows">`,{form:'import',buttons:'<button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Importar contatos</button>'});mountImportPreview();break;
      case 'opportunity-clear':
        c.opportunityFilters={};c.opportunityList='';c.query='';close();render();G('[data-opp="filters"]')?.focus();break;
      case 'opportunity-sort': case 'opportunity-fields': case 'opportunity-import':
        opportunityDialog(d.act);break;
      case 'opportunity-template':
        downloads('modelo-oportunidades.csv',opportunityCsvColumns.join(',')+'\r\n');break;
      case 'opportunity-export': {
        const pipelineId=c.s.pipelines.find(item=>item.id===c.pipeline)?.id || c.s.pipelines[0].id;
        const rows=opportunityResults(c.s,pipelineId,c.query,c.opportunityFilters,c.opportunitySort);
        downloads('oportunidades.csv',opportunityCsv(c.s,rows));break;
      }
      case 'upload':dialog('Enviar arquivo','<p>PNG, JPEG, GIF, WebP ou PDF de até 700 KB.</p><label>Arquivo<input name="file" type="file" accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" required></label>',{form:'upload',buttons:'<button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Enviar arquivo</button>'});break;
      case 'new-thread':dialog('Nova conversa',option('Contato','contactId','',contactChoices()),{form:'thread',buttons:'<button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Abrir conversa</button>'});break;
      case 'new-pipeline':dialog('Novo pipeline',input('Nome do pipeline','name','',true),{form:'pipeline',buttons:'<button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Criar pipeline</button>'});break;
      case 'toggle-star': {const starred=c.s.messages.some(x=>x.contactId===c.thread&&x.starred);await mutate({type:'thread',data:{contactId:c.thread,starred:!starred}});render();break;}
      case 'mark-unread':await mutate({type:'thread',data:{contactId:c.thread,read:false}});c.thread='';render();flash('Marcada como não lida.');break;
      case 'back-inbox':c.thread='';render();break;
      case 'prev-month':case 'next-month':c.month=new Date(c.month.getFullYear(),c.month.getMonth()+(d.act==='prev-month'?-1:1),1);render();break;
      case 'this-month':c.month=new Date();render();break;
      case 'export': downloads('go-workspace-relatorio.csv',['Métrica,Valor',...Object.entries(c.m).map(([k,v])=>`${k},${v}`)].join('\r\n'));break;
      case 'wa-refresh': await refreshSubWa(); flash('Status do WhatsApp atualizado.'); break;
      case 'wa-toggle-pair': c.waPairOpen=!c.waPairOpen; render(); break;
      case 'wa-connect': {
        stopSubWaPoll();
        c.wa={...(c.wa||{}),available:true,enabled:true,status:'connecting',qrcode:'',paircode:''};
        render();
        const live=await api(url('/api/whatsapp/workspace/connect'),{});
        c.wa=live;
        render();
        if(live.status==='connecting'){ startSubWaPoll(); flash('QR Code gerado! Escaneie com o WhatsApp.'); }
        else if(live.status==='connected') flash('WhatsApp conectado!');
        break;
      }
      case 'account-pay': location.href=(await api(url('/api/billing/reactivate'),{})).url; break;
      case 'abacate-refresh': c.pay=null; render(); await refreshPay(); break;
      case 'abacate-hooks': c.pay=await api(url('/api/abacatepay/workspace/refresh-webhook'),{}); render(); flash('Avisos do AbacatePay atualizados.'); break;
      case 'google-refresh': c.google=null; render(); await refreshGoogle(); break;
      case 'dialer-next': {
        const next=await api(url('/api/phone/dialer/next'),{});
        await load(); render(); flash(next.done?tr('A fila acabou.'):tr('Chamando o próximo contato.')); followDialer();
        break;
      }
      case 'dialer-hangup': await api(url('/api/phone/dialer/hangup'),{}); flash(tr('Ligação encerrada.')); setTimeout(async()=>{ await load(); render(); },1500); break;
      case 'dialer-stop': await api(url('/api/phone/dialer/stop'),{}); await load(); render(); flash(tr('Discador encerrado.')); break;
      case 'dialer-remove': await mutate({type:'dialer-queue-remove',data:{contactId:d.dialerContact}}); render(); break;
      case 'dialer-clear': if(!await ask('Tirar todos os contatos pendentes da fila?', { ok: 'Esvaziar fila' })) break; await mutate({type:'dialer-queue-remove',data:{all:true}}); render(); break;
      case 'connectors-refresh': c.connectorStatus=null; render(); await refreshConnectors(); break;
      case 'connector-copy': await navigator.clipboard.writeText(d.connectorValue).then(()=>flash(tr('URL copiada.')),()=>flash(tr('Selecione a URL e copie.'),true)); break;
      case 'connector-disconnect': {
        if(!await ask('Desconectar este app?', { text: 'Os fluxos que usam os gatilhos e ações dele param de funcionar.', ok: 'Desconectar' })) break;
        c.connectorStatus={...await api(url('/api/connectors/disconnect'),{id:d.connectorId}),workspace:c.workspace}; await load(); render(); flash(tr('App desconectado.'));
        break;
      }
      case 'phone-refresh': c.phoneSetup=null; render(); await refreshPhone(); break;
      case 'phone-buy': {
        const number=d.phoneNumber;
        if(!await ask('Comprar este número?', { text: 'A Twilio cobra a mensalidade do número na conta da plataforma.', ok: 'Comprar', danger: false })) break;
        c.phoneSetup={...c.phoneSetup,...await api(url('/api/phone/buy'),{number,name:''}),workspace:c.workspace}; c.phoneSearch=null;
        await load(); render(); flash(tr('Número comprado. Escolha onde as ligações tocam.'));
        break;
      }
      case 'phone-release': {
        if(!await ask('Liberar este número?', { text: 'Ele volta para a Twilio e pode não ser recuperado.', ok: 'Liberar' })) break;
        c.phoneSetup={...c.phoneSetup,...await api(url('/api/phone/release'),{id:d.phoneId}),workspace:c.workspace};
        await load(); render(); flash(tr('Número liberado.'));
        break;
      }
      case 'phone-call': {
        let agentPhone='';
        try{ agentPhone=localStorage.getItem('graao-agent-phone')||''; }catch{}
        agentPhone=await askText('Qual é o seu telefone?',{text:'O Graao liga primeiro para o seu telefone e, quando você atender, completa a ligação com o contato.',value:agentPhone,type:'tel',ok:'Ligar agora'});
        if(!agentPhone) break;
        try{ localStorage.setItem('graao-agent-phone',agentPhone); }catch{}
        await api(url('/api/phone/call'),{contactId:c.thread,agentPhone});
        await load(); render(); flash(tr('Ligando para você. Atenda para falar com o contato.'));
        break;
      }
      case 'email-refresh': c.emailDomain=null; render(); await refreshEmail(); break;
      case 'email-copy': await navigator.clipboard.writeText(d.value); flash('Copiado.'); break;
      case 'email-verify': {
        c.emailDomain={...await api(url('/api/email/workspace/verify'),{}),workspace:c.workspace};
        render();
        const s=c.emailDomain.domain?.status;
        flash(s==='verified'?'Domínio verificado. Os e-mails já saem por ele.':s==='failed'?'O serviço de e-mail não encontrou os registros. Confira o DNS e tente de novo.':'Verificação iniciada. Pode levar alguns minutos; volte a esta aba para ver o status.', s==='failed');
        break;
      }
      case 'email-remove': {
        if(!await ask('Remover o domínio de envio?', { text: 'Os e-mails desta subconta voltam a sair do endereço da plataforma.', ok: 'Remover' })) break;
        c.emailDomain={...await api(url('/api/email/workspace/remove'),{}),workspace:c.workspace};
        render(); flash('Domínio de envio removido.');
        break;
      }
      case 'google-connect': window.open(url('/api/google/workspace/connect'),'graao-google','width=560,height=720'); break;
      case 'google-disconnect': {
        if(!await ask('Desconectar o Google desta subconta?', { text: 'Os widgets do Google Analytics e do Perfil da Empresa param de mostrar dados.', ok: 'Desconectar' })) break;
        c.google={...await api(url('/api/google/workspace/disconnect'),{}),workspace:c.workspace};
        render(); flash('Google desconectado.');
        break;
      }
      case 'abacate-copy': await navigator.clipboard.writeText(d.url); flash('Link de pagamento copiado.'); break;
      case 'abacate-charge': {
        const r=await api(url('/api/abacatepay/workspace/charge'),{invoiceId:d.id});
        c.s=r.state;c.m=r.metrics;render();
        await navigator.clipboard?.writeText(r.payment.url).catch(()=>{});
        flash('Link de pagamento gerado e copiado.');
        break;
      }
      case 'abacate-disconnect': {
        if(!await ask('Desconectar o AbacatePay deste workspace?', { text: 'Links já enviados continuam valendo, mas as baixas automáticas param.', ok: 'Desconectar' })) break;
        c.pay=await api(url('/api/abacatepay/workspace/disconnect'),{});
        render(); flash('AbacatePay desconectado.');
        break;
      }
      case 'wa-disconnect': {
        stopSubWaPoll();
        c.wa=await api(url('/api/whatsapp/workspace/disconnect'),{});
        c.waPairOpen=false;
        render();
        flash('WhatsApp desconectado.');
        break;
      }
    }
  } catch(e){flash(e.message,true);}
});

// Busca global (Ctrl K) com o Search do Beautiful UI. Escolher um item reaproveita os handlers
// data-go / data-ag-go / data-edit do app.
function mountGlobalSearch(){
  const host=G('#search-results');
  if(!host) return;
  let items;
  if(location.hash.startsWith('#agency')){
    const agNavList=[['dashboard','Painel da agência'],['prospecting','Prospecção'],['accounts','Subcontas'],['snapshots','Setups de conta'],['affiliate','Portal de afiliados'],['partners','Parceiros'],['ideas','Ideias'],['mobile-app','Aplicativo móvel'],['settings','Configurações']];
    let accounts=[];
    try{accounts=JSON.parse(localStorage.getItem('ag_db_v1')||'{}').accounts||[];}catch{}
    items=[...agNavList.map(([k,label])=>({label,keywords:k,run:{agGo:k}})),...accounts.map(a=>({label:a.name||'Subconta',keywords:'subconta',searchOnly:true,run:{agGo:'accounts'}}))];
  }else{
    items=[...nav.filter(x=>allowedView(x[0])).map(([k,label])=>({label:tr(label),keywords:k,run:{go:k}})),
      ...(allowedView('contacts')?c.s.contacts.map(x=>({label:x.name,keywords:`${x.email||''} ${x.phone||''} contato`,searchOnly:true,run:{edit:'contacts',id:x.id}})):[])];
  }
  const list=searchList({items,placeholder:'Buscar módulos e contatos…',label:'Buscar no workspace',limit:8,empty:['Nada encontrado','Tente outro nome de módulo ou contato'],onSelect:item=>clickWith(host,item.run)});
  host.replaceChildren(list.el);
  list.input.focus();
}

// Prévia da importação de contatos com a DiffTable: linhas novas entram (verde) e podem ser
// tiradas com um clique; e-mails que já existem aparecem sem marca e são ignorados.
function mountImportPreview(){
  const file=G('#dialog input[name="file"]'), slot=G('#dialog [data-import-preview]'), hidden=G('#dialog input[name="previewRows"]');
  if(!file||!slot||!hidden) return;
  file.addEventListener('change',async()=>{
    slot.replaceChildren();
    hidden.value='';
    const f=file.files?.[0];
    if(!f||f.size>500000) return;
    let rows;
    try{rows=parseCSV(await f.text()).slice(0,500);}catch(e){slot.textContent=e.message;return;}
    if(!rows.length) return;
    const known=new Set(c.s.contacts.map(x=>String(x.email||'').toLowerCase()).filter(Boolean));
    const list=rows.map((raw,i)=>({key:String(i),raw,values:{name:raw.name||'—',email:raw.email||'—',company:raw.company||'—'},change:raw.email&&known.has(String(raw.email).toLowerCase())?undefined:'add'}));
    const shown=list.slice(0,40), rest=list.slice(40).filter(x=>x.change);
    const sync=included=>{hidden.value=JSON.stringify([...included,...rest].map(x=>x.raw));};
    sync(shown.filter(x=>x.change));
    const fresh=list.filter(x=>x.change).length, dupes=list.length-fresh;
    slot.replaceChildren(diffTable({
      title:`Prévia: ${fresh} novo(s)${dupes?`, ${dupes} já existe(m)`:''}${list.length>shown.length?` · mostrando ${shown.length} de ${list.length}`:''}`,
      hint:'Clique num contato novo para tirar da importação',
      applyButton:false,
      columns:[{key:'name',label:'Nome',width:'1fr'},{key:'email',label:'E-mail',width:'1.25fr'},{key:'company',label:'Empresa',width:'0.9fr'}],
      rows:shown,
      onChange:sync
    }).el);
  });
}

function globalSearch(value){
  const q=value.toLowerCase();
  if (location.hash.startsWith('#agency')) {
    const agNavList = [
      ['dashboard', 'Painel da agência', 'layout'],
      ['prospecting', 'Prospecção', 'search'],
      ['accounts', 'Subcontas', 'users'],
      ['snapshots', 'Setups de conta', 'box'],
      ['affiliate', 'Portal de afiliados', 'gift'],
      ['partners', 'Parceiros', 'users'],
      ['ideas', 'Ideias', 'lightbulb'],
      ['mobile-app', 'Aplicativo móvel', 'phone'],
      ['settings', 'Configurações', 'cog']
    ];
    let agAccounts = [];
    try {
      const db = JSON.parse(localStorage.getItem('ag_db_v1') || '{}');
      agAccounts = db.accounts || [];
    } catch {}
    const navHits = agNavList.filter(x => x.join(' ').toLowerCase().includes(q)).slice(0, 8);
    const accHits = q ? agAccounts.filter(x => (x.name || '').toLowerCase().includes(q)).slice(0, 5) : [];
    G('#search-results').innerHTML = `<div class="quick-list">${navHits.map(([k, pt, ico]) => `<button class="secondary" data-ag-go="${k}">${i(ico, 17)} ${pt}</button>`).join('')}${accHits.map(a => `<button class="secondary" data-ag-go="accounts">${avatar(a.name)} ${h(a.name)}</button>`).join('')}</div>`;
    return;
  }
  G('#search-results').innerHTML=`<div class="quick-list">${nav.filter(x=>allowedView(x[0])&&x.join(' ').toLowerCase().includes(q)).slice(0,8).map(([k,pt,ico])=>`<button class="secondary" data-go="${k}">${i(ico,17)} ${pt}</button>`).join('')}${q&&allowedView('contacts')?c.s.contacts.filter(x=>`${x.name} ${x.email}`.toLowerCase().includes(q)).slice(0,5).map(x=>`<button class="secondary" data-edit="contacts" data-id="${x.id}">${avatar(x.name)} ${h(x.name)}</button>`).join(''):''}</div>`;
}
document.addEventListener('input', e => {
  const el = e.target;
  if (el.name === 'brief' && el.form?.dataset.form === 'studio-create') c.studio.brief=el.value;
  if (el.id === 'page-search') { c.query=el.value; rerenderSearch(el.id,el.value,el.selectionStart,el.selectionEnd); }
  if (el.id === 'global-search') globalSearch(el.value);
  if (el.matches?.('[data-connector-search]')) { c.connectorQuery=el.value; const at=el.selectionStart; render(); const box=G('[data-connector-search]'); if(box){ box.focus(); box.setSelectionRange(at,at); } }
  if (el.id === 'composer-search') {
    for (const item of G('#dialog').querySelectorAll('[data-composer-item]')) item.hidden = !item.textContent.toLowerCase().includes(el.value.toLowerCase());
  }
});
document.addEventListener('change', async e => {
  const el = e.target;
  conversationFormControls(el);
  try { if (await inboxChange(el,inboxContext())) return; } catch (error) { render(); flash(error.message,true); return; }
  if (el.name === 'template' && el.form?.dataset.form === 'studio-create') {
    c.studio.template=el.value;
    const label=G('.studio-mode'), chosen=studioTemplates.find(item=>item[0]===el.value);
    if (label && chosen) label.textContent=`${c.features?.studioAI ? 'Template' : 'Local template'} · ${chosen[1]}`;
  }
  if (el.dataset.convFilter) {
    const filter = el.dataset.convFilter;
    c.conversationFilters[filter] = el.value;
    c.conversationFilters.manualPage = 0;
    render();
    G(`[data-conv-filter="${filter}"]`)?.focus();
  }
  if (el.id === 'tag-filter') { c.tag=el.value; render(); G('#tag-filter')?.focus(); }
  if (el.hasAttribute('data-opportunity-pipeline')) {
    c.pipeline=el.value;
    if(c.opportunityFilters) delete c.opportunityFilters.stage;
    render(); G('[data-opportunity-pipeline]')?.focus();
  }
  if (el.hasAttribute('data-opportunity-status')) {
    c.opportunityFilters={...c.opportunityFilters,status:el.value};
    render();G('[data-opportunity-status]')?.focus();
  }
  if(el.form?.dataset.key==='opportunities') {
    const form=el.form;
    if(el.name==='pipelineId') form.elements.stage.replaceChildren(...stageChoices(el.value).map(([id,name])=>new Option(name,id)));
    if(el.name==='contactId') {
      const contact=c.s.contacts.find(item=>item.id===el.value);
      form.querySelector('[data-opportunity-email]').textContent=contact?.email || '—';
      form.querySelector('[data-opportunity-phone]').textContent=contact?.phone || '—';
      if(contact && !form.elements.title.value.trim()) form.elements.title.value=contact.name;
    }
    if(el.name==='status') {
      const loss=form.querySelector('[data-opportunity-loss]');
      loss.hidden=loss.disabled=el.value!=='Lost';
    }
  }
  if (el.dataset.move) try { await move(el.dataset.move,el.value); } catch (error) { render(); flash(error.message,true); }
});
// Carregar e falhar não sobem na página: só a fase de captura os vê.
document.addEventListener('error',mediaFailed,true);
for(const name of ['load','loadedmetadata'])document.addEventListener(name,mediaLoaded,true);
for(const name of ['wheel','touchmove','pointerdown','keydown'])document.addEventListener(name,threadMoved,{capture:true,passive:true});
document.addEventListener('dragstart',ev=>{const el=ev.target.closest('[data-drag]');if(el){ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text/plain',el.dataset.drag);}});
document.addEventListener('dragover',ev=>{if(ev.target.closest('[data-drop]'))ev.preventDefault();});
document.addEventListener('drop',async ev=>{const el=ev.target.closest('[data-drop]');if(!el)return;ev.preventDefault();try{await move(ev.dataTransfer.getData('text/plain'),el.dataset.drop);}catch(e){flash(e.message,true);}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&c.inbox?.sortOpen&&c.view==='conversations'){c.inbox.sortOpen=false;render();G('[data-inbox-sort]')?.focus();return;}if(!viewPath&&c.s&&c.mode!=='agency'&&(e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();G('[data-act="search"]').click();}});

document.addEventListener('submit',async ev=>{
  const f=ev.target;if(!f.dataset.form || f.dataset.form.startsWith('report:'))return;ev.preventDefault();if(f.dataset.pending)return;f.dataset.pending='true';
  const name=f.dataset.form, fd=new FormData(f,ev.submitter), data=Object.fromEntries(fd), status=f.querySelector('.form-status');
  if(status)status.textContent='';
  const btn=f.querySelector('button[type="submit"],button:not([type])');if(btn)btn.disabled=true;
  try {
    let msg='Salvo.';
    if(name==='record'){
      const {key,id}=f.dataset;
      for(const el of f.querySelectorAll('input[type="checkbox"]'))data[el.name]=el.checked;
      if(key==='appointments'){data.start=toInstant(data.start,zones());data.end=toInstant(data.end,zones());}
      await mutate({type:'save',key,id,data});msg=id?'Alterações salvas.':`${entityNames[key]} ${feminine.has(key)?'criada':'criado'}.`;
    } else if(name==='delete'){await mutate({type:'delete',key:f.dataset.key,id:f.dataset.id});msg='Registro excluído.';}
    else if(name==='fiscal'){await mutate({type:'fiscal',data:readFiscal(data)});msg='Cadastro fiscal salvo.';}
    else if(name==='profile'){await mutate({type:'profile',data});await load();msg='Perfil da empresa salvo.';}
    else if(name==='wa-pair'){
      stopSubWaPoll();
      const live=await api(url('/api/whatsapp/workspace/connect'),{phone:data.phone});
      c.wa=live;
      if(live.status==='connecting') startSubWaPoll();
      msg=live.paircode?'Código de pareamento gerado!':'Conexão iniciada.';
    }
    else if(name==='google-select'){
      c.google={...await api(url('/api/google/workspace/select'),{gaProperty:data.gaProperty||'',gbpLocation:data.gbpLocation||'',gscSite:data.gscSite||''}),workspace:c.workspace};
      render(); flash('Escolha salva. O painel já mostra os dados do Google.'); return;
    }
    else if(name==='connector-connect'){
      const {connectorId,...fields}=data;
      c.connectorStatus={...await api(url('/api/connectors/connect'),{id:connectorId,fields}),workspace:c.workspace};
      await load(); render(); flash(tr('App conectado. Os gatilhos e as ações dele já aparecem no editor de fluxos.')); return;
    }
    else if(name==='dialer-start'){
      c.dialerAgent=data.agentPhone||'';
      await api(url('/api/phone/dialer/start'),{numberId:data.numberId||'',agentPhone:data.agentPhone||''});
      await load(); render(); flash(tr('Ligando para você. Atenda para abrir o discador.')); followDialer(); return;
    }
    else if(name==='dialer-add-tag'){
      const added=await mutate({type:'dialer-queue-add',data:{tag:data.tag||''}});
      render(); flash(`${tr('Contatos adicionados à fila')}: ${Number(added)||0}`); return;
    }
    else if(name==='dialer-disposition'){
      await mutate({type:'dialer-disposition',data:{callId:data.callId,disposition:data.disposition,note:data.note||''}});
      if(data.next==='1'){ const next=await api(url('/api/phone/dialer/next'),{}); await load(); render(); flash(next.done?tr('Resultado salvo. A fila acabou.'):tr('Resultado salvo. Chamando o próximo contato.')); return; }
      await load(); render(); flash(tr('Resultado salvo.')); return;
    }
    else if(name==='phone-search'){
      c.phoneSearchArea=data.areaCode||'';
      c.phoneSearch=(await api(url('/api/phone/search'),{areaCode:data.areaCode||'',contains:data.contains||''})).numbers;
      render(); return;
    }
    else if(name==='phone-number'){
      await mutate({type:'phone-number-save',data:{id:data.id,name:data.name||'',forward:data.forward||'',timeout:Number(data.timeout)||20,record:data.record==='on',voicemail:data.voicemail==='on',greeting:data.greeting||'',mode:data.mode||'forward',
        voiceAgentId:data.voiceAgentId||'',voiceWelcome:data.voiceWelcome||'',voice:data.voice||'',voiceTransfer:data.voiceTransfer||'',voiceServiceId:data.voiceServiceId||'',voiceMaxMinutes:Number(data.voiceMaxMinutes)||10}});
      await refreshPhone(); flash(tr('Número salvo.')); return;
    }
    else if(name==='email-domain-add'){
      c.emailDomain={...await api(url('/api/email/workspace/add'),{domain:data.domain,localPart:data.localPart}),workspace:c.workspace};
      render(); flash('Domínio adicionado. Agora publique os registros no DNS.'); return;
    }
    else if(name==='email-domain-save'){
      c.emailDomain={...await api(url('/api/email/workspace/save'),{localPart:data.localPart}),workspace:c.workspace};
      render(); flash('Remetente salvo.'); return;
    }
    else if(name==='abacate-connect'){
      c.pay=await api(url('/api/abacatepay/workspace/connect'),{apiKey:data.apiKey});
      render(); flash(`AbacatePay conectado${c.pay.storeName?`: ${c.pay.storeName}`:''}.`); return;
    }
    else if(name==='wa-test'){
      await api(url('/api/whatsapp/workspace/test'),{phone:data.phone,text:data.text});
      msg='Mensagem de teste enviada pelo WhatsApp!';
    }
    else if (name==='stage') { await mutate({type:'stage',id:f.dataset.id,data:{ ...data,visible:f.elements.visible.checked }}); msg='Etapa salva.'; }
    else if (name==='pipeline') { await mutate({type:'pipeline',id:f.dataset.id,data}); msg='Pipeline salvo.'; }
    else if(name==='thread'){await thread(data.contactId);return;}
    else if(name.startsWith('inbox-')||name==='team-message'){flash(await inboxSubmit(name,f,data,inboxContext()));return;}
    else if(name==='workspace'){const d=await api('/api/workspaces',data);await useWorkspace(d.id);flash('Subconta criada.');return;}
    else if(name==='message'){
      await mutate({type:'message',data:{...data,contactId:c.thread}});
      // O servidor marca na hora o que não saiu: sem isto a tela diria que deu certo.
      const last=[...c.s.messages].filter(m=>m.contactId===c.thread&&m.direction==='Outbound').sort((a,b)=>String(b.created).localeCompare(String(a.created)))[0];
      if(data.direction==='Outbound'&&last?.failed){f.reset();flash(`${tr('Não entregue')}: ${tr(deliveryFailures[last.failed]||deliveryFailures.provider_error)}`,true);render();return;}
      msg='Mensagem registrada.';
    }
    else if (name === 'manual-action') {
      if (data.status === 'Sent') {
        const item = c.s.manualActions.find(entry => entry.id === f.dataset.id);
        const body = String(data.whatsappBody || '').trim();
        if (!body) throw new Error('Escreva a mensagem antes de enviar.');
        const result = await api(url('/api/action'), { type:'message', data:{ contactId:item.contactId, channel:'WhatsApp', direction:'Outbound', body } });
        if (result.delivery && !result.delivery.sent) throw new Error(result.delivery.reason === 'not-connected' ? 'O WhatsApp da subconta não está conectado. A mensagem ficou registrada na conversa.' : 'O WhatsApp não confirmou o envio. A mensagem ficou registrada na conversa.');
        data.status = 'Completed';
        data.note = [data.note, 'Mensagem enviada pelo WhatsApp.'].filter(Boolean).join('\n');
      }
      delete data.whatsappBody;
      await mutate({ type:'manual-action', id:f.dataset.id, data });
      msg = data.status === 'Skipped' ? 'Action skipped.' : 'Action completed.';
      const next = f.dataset.queue === 'true' && manualQueue(c).find(item => item.status === 'Pending');
      close(); render(); flash(msg);
      if (next) manualDetails(next.id,true);
      return;
    }
    else if (name === 'conversation-sla') {
      const targets = key => ({ soon: data[`${key}Soon`], overdue: data[`${key}Overdue`] });
      await mutate({ type:'conversation-sla', data:{ enabled:f.elements.enabled.checked, mode:data.mode, automation:data.automation,
        workflows:fd.getAll('workflows'), common:targets('common'), channels:Object.fromEntries(SLA_CHANNELS.map(channel => [channel, targets(channel)])) } });
      msg = 'Prazos de atendimento salvos.';
    }
    else if(name==='assistant'){const q=data.prompt.trim();if(q){c.chat.push({self:true,body:q},{body:assistant(q)});render();G('.ask-composer input')?.focus();}return;}
    else if(name==='lead'){await api(`/api/view/f/${f.dataset.workspace}/${f.dataset.id}`,data);f.reset();status.textContent='Thank you. Your information was submitted.';status.classList.add('confirmed');return;}
    else if(name==='import'){if(data.file.size>500000)throw Error('Choose a CSV file under 500 KB.');const previewed=data.previewRows?JSON.parse(data.previewRows):null;if(previewed&&!previewed.length)throw Error('Nenhum contato novo selecionado na prévia.');const n=await mutate({type:'import',data:{rows:previewed||parseCSV(await data.file.text()),file:data.file.name}});msg=`${n} contact${n===1?'':'s'} imported. Existing emails were skipped.`;}
    else if(name==='opportunity-import') {
      if(data.file.size>500000)throw Error('Escolha um CSV de até 500 KB.');
      const n=await mutate({type:name,data:{pipelineId:data.pipelineId,rows:parseCsv(await data.file.text()),file:data.file.name}});
      msg=n===1?'1 oportunidade importada.':`${n} oportunidades importadas.`;
    }
    else if(name==='opportunity-sort' || name==='opportunity-fields') {
      if(name==='opportunity-sort') c.opportunitySort={field:data.field,direction:data.direction};
      if(name==='opportunity-fields') c.opportunityCard=opportunityPreferences(c.workspace,c.access?.session?.id,{layout:data.layout,fields:fd.getAll('field'),actions:fd.getAll('action')});
      close();render();G(`[data-act="${name}"]`)?.focus();return;
    }
    else if(name==='upload'){ const file=data.file;if(file.size>700000)throw Error('Choose a file under 700 KB.');const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('File could not be read.'));reader.readAsDataURL(file);});await mutate({type:'save',key:'files',data:{name:file.name,data:encoded}});msg='Arquivo enviado.';}
    else if (name === 'studio-create') {
      const generating=data.engine==='model', submitter=ev.submitter, original=submitter?.innerHTML;
      const buttons=[...f.querySelectorAll('button')];
      buttons.forEach(button=>{button.disabled=true;});
      f.setAttribute('aria-busy','true');
      if (generating) {
        if (submitter) submitter.textContent='Generating…';
        if (status) { status.classList.add('pending'); status.textContent='Generating your project. This can take up to a minute.'; }
      }
      try {
        c.studio.brief='';
        startBuild({ c, api, url, flash, render },{ brief:data.brief.trim(), kind:'website', template:data.template, reference:(data.reference || '').trim(), ai:data.engine==='model' && Boolean(c.features?.studioAI) });
        return;
      } finally {
        buttons.forEach(button=>{button.disabled=false;});
        f.removeAttribute('aria-busy');
        if (submitter && original !== undefined) submitter.innerHTML=original;
        if (status && generating) { status.classList.remove('pending'); status.textContent=''; }
      }
    }
    else if (name === 'studio-edit') {
      const project=c.s.studioProjects.find(item=>item.id===f.dataset.id);
      const blocks=fd.getAll('blockTitle').map((title,index)=>({title,body:fd.getAll('blockBody')[index]}));
      await mutate({type:'save',key:'studioProjects',id:project.id,data:{...project,...data,blocks}}); msg='Projeto salvo.';
    }
    close();render();flash(msg);
  } catch(e){if(status){status.classList.remove('confirmed');status.textContent=e.message;}else flash(e.message,true);}
  finally {delete f.dataset.pending;if(btn)btn.disabled=false;}
});

if(viewPath){
  try{const result=await api(`/api/view${viewPath}`), workspace=viewPath.split('/')[2]; document.title=domainBrand()?.name||'graao';app.innerHTML=publicView(result,workspace);}
  catch(e){app.innerHTML=`<div class="boot"><h1>Página indisponível</h1><p>${h(e.message)}</p><a href="/app">Voltar para a plataforma</a></div>`;}
}else{
  installDashboardControls({ c,dialog,close,render,load,mutate,flash,go,download:downloads });
  agencyEnv = { app, overlay, api, flash, openWorkspace: useWorkspace, onBrandColorChange: (primary, secondary, accent) => {
    if (!c.agency || c.workspace.startsWith('user-')) return;
    c.agency.primary = primary;
    if (secondary) c.agency.secondary = secondary;
    if (accent) c.agency.accent = accent;
    if (c.mode !== 'agency') render();
  }, onOpenAIChange: connection => {
    if (!c.features) return;
    c.features.studioAI = connection.configured;
    c.features.agentModel = connection.configured && allowedView('ai-agents') ? connection.model : '';
  } };
  installStudio({ c, api, url, flash, render });
  installSites({ c, api, url, mutate, flash, render });
  installForms({ c, api, url, mutate, flash, render });
  installChat({ c, api, url, mutate, flash, render });
  installBlogs({ c, api, url, mutate, flash, render });
  installStores({ c, api, url, mutate, flash, render });
  installWebinars({ c, api, url, mutate, flash, render });
  installQr({ c, api, url, mutate, flash, render });
  installMedia({ c, api, url, mutate, flash, dialog, close, render });
  installAnalytics({ c, render });
  installBuilder({ c, api, url, flash, render });
  installAutomation({ c, mutate, render, flash, dialog, close });
  mountClientPortal = installClientPortal({ c, api, flash, dialog, close });
  mountCourses = installCourses({ c, api, url, mutate, flash, dialog, close, render });
  mountCommunities = installCommunities({ c, api, mutate, flash, dialog, close, render });
  installOffers({ c, api, mutate, flash, dialog, close, render });
  installCertificates({ c, mutate, flash, dialog, close, render });
  installTickets({ c, mutate, flash, dialog, close, render });
  installSequences({ c, mutate, flash, dialog, close, render });
  installLoyalty({ c, mutate, flash, dialog, close, render });
  installScheduling({ c, mutate, flash, dialog, close, render });
  installMeetings({ c, mutate, flash, dialog, close, render });
  installPreferences({ c, mutate, flash, render });
  installContactTrash({ c, mutate, flash, render });
  installDocuments({ c, api, mutate, flash, dialog, close, render });
  installEstimates({ c, api, mutate, flash, dialog, close, render });
  installInvoices({ c, api, mutate, flash, dialog, close, render });
  installPaymentSettings({ c, mutate, flash, render });
  installEmailMarketing({ c, mutate, flash, dialog, close, render, api, url, load });
  installReputation({ c, api, url, mutate, flash, dialog, close, render });
  installSeo({ c, api, url, mutate, flash, dialog, close, render });
  installLedger('account', { api, render });
  installWallet({ c, api, url, flash, render });
  installLabs({ c, mutate, flash, render });
  installConversationAi({ c, api, url, flash, render });
  installContentAI({ api, flash, workspace: () => c.workspace, enabled: kind => Boolean(c.features?.contentAI || (kind === 'gbp' && c.features?.reviewAI)) });
  installEventPlanner({ c, mutate, flash, dialog, close, render, api, url, load });
  installCountdowns({ c, mutate, flash, dialog, close, render });
  installAffiliates({ c, api, url, mutate, flash, dialog, close, render });
  installAds({ c, api, url, mutate, flash, dialog, close, render });
  installBrand({ c, api, url, mutate, flash, dialog, close, render });
  installTracking({ c, mutate, flash, dialog, close, render, api });
  installOrders({ c, mutate, flash, dialog, close, render });
  installCatalog({ c, mutate, flash, dialog, close, render });
  installPrancheta({
    account: tabAccountId,
    c,
    api,
    url,
    mutate: async (command) => {
      if (location.hash.startsWith('#agency')) {
        return (agencyUI || await loadAgency()).act(command.type, command);
      }
      return mutate(command);
    },
    flash,
    render: () => {
      if (location.hash.startsWith('#agency')) {
        agencyUI?.render();
        return;
      }
      render();
    },
    getState: () => {
      if (location.hash.startsWith('#agency')) {
        return agencyUI?.agency();
      }
      return c.s;
    }
  });
  installReports({ c, dialog, close, render, mutate, flash, download:downloads });
  crmEvents({ G, mutate, render, flash, dialog, close, c, api });
  opportunityEvents({ c, G, mutate, render, flash, dialog, close });
  socialEvents({ c, G, api, url, mutate, render, flash, dialog, close, load });
  window.addEventListener('hashchange',route);
  setInterval(() => {
    if (!c.s?.conversationSla.enabled || c.view !== 'conversations' || document.hidden || overlay.innerHTML) return;
    if (c.tab === 'analytics') { if (!G('select:focus')) render(); return; }
    const clocks = [...document.querySelectorAll('[data-sla-clock]')];
    if (!clocks.length) return;
    const records = slaRecords(c.s);
    for (const clock of clocks) {
      const active = records.find(item => item.id === clock.dataset.slaClock);
      if (!active) continue;
      clock.textContent = `${active.channel} · ${active.state}`;
      clock.classList.toggle('red', active.state === 'Overdue');
      clock.classList.toggle('blue', active.state !== 'Overdue');
    }
  },15000);
  // Conversas ao vivo: mensagens, ligações e atribuições chegam sem recarregar a página.
  const inboxOpen=()=>c.mode!=='agency'&&!c.account&&!viewPath&&c.view==='conversations'&&!conversationSections.includes(c.tab)&&!document.hidden&&Boolean(G('.conversation-page'));
  const drawInbox=()=>{const page=document.createElement('template');page.innerHTML=inboxPage(c);if(getLanguage()==='es')translateDom(page.content);return page.content;};
  const showInbox=async apply=>{
    const before=drawInbox(), unread=()=>c.s.messages.filter(m=>m.contactId===c.thread&&!m.read).length, had=unread();
    if(!apply()) return;
    const patch=drawn=>{ const root=G('.conversation-page'); if(root&&!patchInbox(root,drawn,drawInbox())&&!G('form :focus')) render(); };
    patch(before);
    // A conversa aberta diante da pessoa já está sendo lida.
    if(c.thread&&unread()>had&&document.hasFocus()&&inboxOpen()){
      const thread=c.thread, drawn=drawInbox();
      await mutate({type:'thread',data:{contactId:thread,read:true}});
      if(inboxOpen()&&c.thread===thread) patch(drawn);
    }
  };
  const follower=createInboxFollower({c,watching:inboxOpen,request:mark=>api(`${url('/api/conversations/live')}&mark=${encodeURIComponent(mark)}`),changed:showInbox});
  setInterval(()=>follower.tick(),1000);
  for(const name of ['pointerdown','keydown','pointermove'])window.addEventListener(name,()=>follower.used(),{passive:true});
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) follower.tick({now:true}); });
  window.addEventListener('focus',()=>follower.tick({now:true}));
  window.addEventListener('focus',async()=>{
    if (!c.s || overlay.innerHTML || busy || G('form :focus')) return;
    const live = (c.view === 'sites' && c.tab === 'submissions') ||
      (c.view === 'conversations' && ['analytics','link-analysis','manual-actions'].includes(c.tab));
    if (live) try { await load(); render(); } catch { /* The current view remains available. */ }
  });
  initI18n();
  window.addEventListener('graao:languagechange', () => { if (c.mode !== 'agency') render(); });
  if (shellAgency()) {
    app.innerHTML = bootScreen('Abrindo o app…');
    mobileShell = await installMobileShell({ c, app, api, url, flash, allowed: allowedView, screens }).catch(() => mobileShell);
  }
  route();
}
