import { reputationScreen } from './reputation.js';
import {brandHighlight, brandIcon, icon as i, shcLayers} from './icons.js';
import {tr, getLanguage} from './i18n.js';
import {phoneField} from './phone-input.js';
import {invoicePaymentState, invoiceStateLabels} from './invoice-data.js';
import {fiscalForm, fiscalMissing} from './fiscal.js';
import {conversationPage} from './conversations.js';
import {inboxPage} from './inbox.js';
import {dashboard} from './dashboard.js';
import {launchpad} from './launchpad.js';
import {studio} from './studio.js';
import {bulkBar, contactsTab, crmTabs, opportunitiesTab, paymentsTab, pickBox, pickHead, settingsTab} from './crm.js';
import {socialPlanner} from './social.js';
import {eventPlanner} from './event-planner.js';
import {agentsScreen} from './agents.js';
import {sitesScreen} from './sites.js';
import { formsScreen, formTabs } from './forms.js';
import { chatScreen, chatTabs } from './chat-widgets.js';
import { blogScreen, blogTabs } from './blogs.js';
import { storeScreen, storeTabs } from './stores.js';
import { webinarScreen, webinarTabs } from './webinars.js';
import { qrScreen, qrTabs } from './qr-codes.js';
import { analyticsScreen, analyticsTabs } from './sites-analytics.js';
import {automationScreen} from './automation.js';
import {portalAdminScreen, portalTabs} from './client-portal.js';
import {mediaScreen} from './media.js';
import {coursesScreen} from './courses.js';
import {communitiesScreen} from './communities.js';
import {offersScreen} from './offers.js';
import { certificatesScreen } from './certificates.js';
import {documentsScreen} from './documents.js';
import {estimatesScreen} from './estimates.js';
import {invoicesScreen, invoiceTabs} from './invoices.js';
import {paymentSettingsScreen} from './payment-settings.js';
import {emailServicesView} from './email-services.js';
import {phoneSettingsView} from './phone-settings.js';
import {callReportView} from './call-report.js';
import {connectorsView} from './connectors.js';
import {emailMarketingScreen} from './email-marketing.js';
import {countdownScreen} from './countdowns.js';
import { affiliatesScreen } from './affiliates.js';
import { adsReportScreen, adsScreen, reportingAdsTabs } from './ads.js';
import { brandScreen } from './brand.js';
import { loyaltyScreen } from './loyalty.js';
import { preferencesScreen } from './preferences.js';
import { walletScreen } from './wallet.js';
import { labsScreen } from './labs.js';
import { trashView } from './contact-trash.js';
import { schedulingScreen, schedulingTabs } from './scheduling.js';
import { meetingsScreen } from './meetings.js';
import { contactScoreCell, scoringScreen, trackingScreen } from './tracking.js';
import {ordersScreenFor, orderTabsKeys} from './orders.js';
import {catalogScreen, catalogTabs} from './catalog.js';
import {pranchetaScreen} from './prancheta.js';
import {reportEditor, reportList, reportSources, reportingSections} from './reports.js';
import {cardFields, opportunityPreferences, opportunityResults} from './opportunity-data.js';
import {opportunityStatuses} from './dashboard-data.js';
import {cardContext, filterButton, forecastView, listTabs, moreMenu, pipelinesView, quickActionBar, smartTagChips, stageStyle} from './opportunities.js';

export const nav=[['launchpad','Launchpad','sun','Setup guide'],['dashboard','Painel de controle','grid','Dashboard'],['conversations','Conversas','chat','Conversations'],['calendars','Calendários','cal','Calendars'],['contacts','Contatos','contacts','Contacts'],['opportunities','Oportunidades','leads','Opportunities'],['payments','Pagamentos','pay','Payments'],['ai-agents','Agentes de IA','spark','AI Agents'],['marketing','Marketing','send','Marketing'],['automation','Automações','flow','Automation'],['sites','Sites','site','Sites'],['memberships','Assinaturas','play','Memberships'],['media','Mídia Drive','folder','Media Storage'],['reputation','Reputação','award','Reputation'],['reporting','Relatórios','chart','Reporting'],['settings','Configurações','gear','Settings']];
export const h=x=>String(x??'').replace(/[&<>"']/g,v=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[v]);
const brl = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
export function money(value) { return brl.format(value || 0); }
export const fmt=(d,tz='America/Sao_Paulo',time=false)=>d ? new Intl.DateTimeFormat('pt-BR',{timeZone:tz,day:'2-digit',month:'short',year:'numeric',...(time?{hour:'2-digit',minute:'2-digit'}:{})}).format(new Date(d)) : '—';
export const initials=n=>n?.trim().split(/\s+/).slice(0,2).map(v=>v[0]?.toUpperCase()).join('')||'GO';
export const badge=(s,t='')=>`<span class="badge ${t}">${h(tr(s))}</span>`;
export const avatar=(n,cls='')=>`<span aria-hidden="true" class="avatar ${cls}">${h(initials(n))}</span>`;
const primary=(label,key,extra='')=>`<button class="primary" data-edit="${key}" ${extra}>${i('plus',16)} ${label}</button>`;
const action=(label,action,ico='')=>`<button class="secondary" data-act="${action}">${ico?i(ico,16):''}${label}</button>`;
const link=(label,view)=>`<a class="text-link" href="#${view}">${label} ${i('arrow',15)}</a>`;
export const tabs=(values,current)=>`<div class="tabs" aria-label="Seção">${values.map(([value,label])=>`<button data-tab="${value}" class="${value===current?'selected':''}" aria-pressed="${value===current}">${label}</button>`).join('')}</div>`;
export function utabs({ key, items, current, content = '', label = 'Seções', nested = false, flush = false, fill = false, className = '' }) {
  const buttons = items.map(entry => {
    const item = Array.isArray(entry) ? { value: entry[0], label: entry[1] } : entry;
    const on = item.value === current;
    const glyph = item.icon ? i(item.icon, 15) : '';
    const text = item.rawLabel ?? h(item.label);
    if (item.href !== undefined) {
      return `<a class="g-utabs-tab${on ? ' selected' : ''}" href="${h(item.href)}"${on ? ' aria-current="page"' : ''}${item.attrs ? ` ${item.attrs}` : ''}>${glyph}${text}</a>`;
    }
    const attrs = item.attrs ?? `data-tab="${h(item.value)}"`;
    return `<button type="button" role="tab" class="g-utabs-tab${on ? ' selected' : ''}" ${attrs} aria-selected="${on}">${glyph}${text}</button>`;
  }).join('');
  const navLeft = `<button type="button" class="g-utabs-nav prev is-disabled" aria-label="Rolar para esquerda" title="Rolar para esquerda" tabindex="-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg></button>`;
  const navRight = `<button type="button" class="g-utabs-nav next is-disabled" aria-label="Rolar para direita" title="Rolar para direita" tabindex="-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></button>`;
  return `<section class="g-utabs${nested ? ' is-nested' : ''}${flush ? ' is-flush' : ''}${fill ? ' is-fill' : ''}${className ? ` ${className}` : ''}" data-utabs="${h(key)}" data-utabs-active="${h(current)}"><div class="g-utabs-head">${navLeft}<div class="g-utabs-list" role="tablist" aria-label="${h(label)}"><div class="g-utabs-track">${buttons}</div></div>${navRight}</div><div class="g-utabs-panel${flush ? ' is-flush' : ''}" role="tabpanel">${content}</div></section>`;
}
export function pageShell({ title, desc = '', cta = '', back = '', className = '', attrs = '', tabs: tabCfg = null, content = '' }) {
  const header = `<header class="page-head"><div>${back}<h1>${title}</h1>${desc ? `<p>${desc}</p>` : ''}</div><div class="head-actions">${cta}</div></header>`;
  const body = tabCfg ? utabs({ ...tabCfg, content }) : content;
  return `<div class="page${className ? ` ${className}` : ''}"${attrs ? ` ${attrs}` : ''}>${header}${body}</div>`;
}
const head=(title,desc='',cta='',sub='')=>`<header class="page-head"><div><h1>${tr(title)}</h1>${desc?`<p>${tr(desc)}</p>`:''}</div><div class="head-actions">${cta}</div></header>${sub}`;
const empty=(title,desc,icon='inbox',cta='')=>`<div class="empty">${i(icon,26)}<strong>${tr(title)}</strong><p>${tr(desc)}</p>${cta}</div>`;
const search=(v,label='Buscar…')=>`<label class="search">${i('search',16)}<input id="page-search" value="${h(v)}" placeholder="${tr(label)}" aria-label="${tr(label)}" autocomplete="off"></label>`;
const wrap=content=>`<div class="page">${content}</div>`;
const table=(columns,rows,nothing)=>`<div class="surface table-shell"><table><thead><tr>${columns.map(c=>`<th scope="col">${tr(c)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>${rows.length?'':nothing}</div>`;
const row=(cells,key,id)=>`<tr>${cells.map(c=>`<td>${c}</td>`).join('')}<td class="right"><button class="icon-btn" title="Editar registro" aria-label="Editar registro" data-edit="${key}" data-id="${id}">${i('edit',16)}</button></td></tr>`;
const date=(d,c,time=false)=>fmt(d,c.s.profile.timezone,time);
const name=(id,c)=>c.s.contacts.find(r=>r.id===id)?.name||'—';
const mt=money;
const filter=(rows,q,fields)=>rows.filter(r=>!q||fields.some(f=>String(r[f]||'').toLowerCase().includes(q.toLowerCase())));
const top=(rows,q,fields)=>filter([...rows].reverse(),q,fields);
const viewLink=(label,kind,id,c)=>`<a class="secondary" href="/${kind}/${c.workspace}/${id}" target="_blank" rel="noopener">${i('external',14)} ${label}</a>`;

const business=[['small','Tenho um pequeno negócio','Sou corretor de imóveis e preciso de uma plataforma única para gerenciar leads, retornos e clientes.'],['agency','Agência de marketing','Tenho uma agência e preciso de uma plataforma para lançar, automatizar e gerenciar os negócios dos clientes.'],['saas','Negócio SaaS','Quero colocar minha marca nesta plataforma e revendê-la como se fosse minha.'],['other','Outra coisa','Outro segmento, consultoria ou modelo de negócio não listado acima.']];
const goals=[['contacts','Organizar meus contatos','Monte uma lista de contatos e acompanhe cada relacionamento.'],['opportunities','Gerenciar leads e negócios','Crie oportunidades e mova-as pelo seu pipeline.'],['calendars','Marcar agendamentos','Configure um calendário para ligações e reuniões.'],['sites','Criar um site ou formulário','Crie uma página para captar novos leads.'],['automation','Automatizar retornos','Configure ações que rodam quando algo muda.']];
const bubble=(body)=>`<div class="ai-msg"><div class="spark-tile">${i('spark',15)}</div><div>${body}</div></div>`;
export function askAI(c){
  const o=c.s.onboarding, stage=o.done?2:o.kind?1:0;
  const opts=(stage===0?business:goals).map(([id,title,desc])=>`<button class="choice ${c.choice===id?'chosen':''}" data-choice="${id}" aria-pressed="${c.choice===id}"><strong>${title}</strong>${desc?`<span>${stage===0?'ex.: ':''}${desc}</span>`:''}</button>`).join('');
  const content=stage===0?`${bubble('Seu workspace está em configuração guiada. Escolha como vai usá-lo e depois um primeiro objetivo para configurar as ferramentas de que precisa.')}${bubble(`Olá, boas-vindas! Sou seu assistente de configuração. Vou ajudar você a montar o que mais importa, para que o workspace fique pronto do jeito que você trabalha — começando com algumas perguntas rápidas. Leva menos de um minuto.<div class="choices">${opts}</div><button class="continue" data-act="continue-onboarding" ${!c.choice?'disabled':''}>Continuar ${i('arrow',17)}</button>`)}`:stage===1?bubble(`Ótimo! O que você quer fazer primeiro?<div class="choices">${opts}</div><div class="inline-gap"><button class="continue" data-act="continue-onboarding" ${!c.choice?'disabled':''}>Continuar ${i('arrow',17)}</button></div>`):`${bubble(`Seu workspace está pronto. Seu primeiro objetivo é <strong>${goals.find(g=>g[0]===o.goal)?.[1]||'começar'}</strong>. ${link('Abrir módulo recomendado',o.goal)}`)}${bubble('Posso resumir seu workspace e sugerir um próximo passo. Experimente “Como está meu funil?” ou “Quantos agendamentos eu tenho?” <span class="badge pink">Assistente local</span>')}${c.chat.map(x=>x.self?`<div class="user-msg">${h(x.body)}</div>`:bubble(h(x.body))).join('')}`;
  return `<div class="ask-layout"><section class="ask-main" aria-label="Configuração guiada"><div class="ask-scroll"><div class="ask-thread">${content}</div></div><div class="ask-bottom">${stage===2?`<form class="ask-composer" data-form="assistant"><input name="prompt" placeholder="Pergunte sobre seu workspace…" aria-label="Pergunte sobre seu workspace" required><button class="icon-btn" aria-label="Enviar pergunta">${i('send',17)}</button></form>`:`<div class="ask-composer muted">${i('lock',16)}<span>Primeiro, algumas etapas de configuração rápida, depois pergunte qualquer coisa.</span></div>`}</div></section></div>`;
}

function contacts(c){
  if(['bulk','fields','companies'].includes(c.tab)) return contactsTab(c,c.tab);
  if(c.tab==='trash') return pageShell({ title: 'Contatos', desc: 'Gerencie leads, tarefas, campos personalizados e empresas deste workspace.', tabs: { key: 'contacts', items: crmTabs.contacts, current: 'trash', label: 'Seções de contatos' }, content: trashView(c) });
  const tab=c.tab||'all', list=tab==='tasks'?top(c.s.tasks,c.query,['title']):top(c.s.contacts,c.query,['name','email','phone','company','tags']);
  const tag=c.tag, tags=[...new Set(c.s.contacts.flatMap(x=>x.tags))].sort();
  const body = `<div class="toolbar">${search(c.query,tab==='tasks'?'Buscar tarefas…':'Busca rápida…')}${tab==='all'?`<label class="tag-filter">${i('filter',15)}<select id="tag-filter" aria-label="Filtrar contatos por tag"><option value="">Todas as tags</option>${tags.map(t=>`<option ${t===tag?'selected':''}>${h(t)}</option>`).join('')}</select></label>`:''}</div>`+(tab==='tasks'?(list.length
    // Tarefas em FilterTable (Beautiful UI): chips por status filtram a lista; o botão de status e o lápis usam os handlers de sempre.
    ?`<div data-bui="tasks-filter" data-rows="${h(JSON.stringify(list.map(r=>({id:r.id,title:r.title,contact:name(r.contactId,c),due:r.due?fmt(r.due,c.s.profile.timezone):'—',done:Boolean(r.done),status:r.done?'done':r.due&&Date.parse(r.due)<Date.now()?'overdue':'open'}))))}"></div>`
    :table(['Tarefa','Contato','Prazo','Status',''],[],empty('Nenhuma tarefa encontrada','Adicione uma tarefa para acompanhar os retornos.','check'))):(()=>{const shown=list.filter(r=>!tag||r.tags.includes(tag));return bulkBar(c,'contacts')+(shown.length
    // Contatos em RecordsTable (Beautiful UI): ordenação, colunas redimensionáveis e seleção para as ações em massa.
    ?`<div data-bui="contacts-records" data-rows="${h(JSON.stringify(shown.map(r=>({id:r.id,name:r.name,phone:r.phone||'',email:r.email||'',company:r.company||'',score:Number(r.score)||0,scoreText:Number(r.score)?String(Number(r.score)):'',tags:r.tags||[]}))))}"></div>`
    :table(['Nome','Telefone','E-mail','Empresa','Pontuação','Tags'],[],empty('Nenhum contato encontrado','Crie um contato ou tente outro filtro.','contacts')))})());
  return pageShell({
    title: 'Contatos',
    desc: 'Gerencie leads, tarefas, campos personalizados e empresas deste workspace.',
    cta: tab==='tasks'?primary('Adicionar tarefa','tasks'):`${action('Importar','import','upload')}${primary('Adicionar contato','contacts')}`,
    tabs: { key: 'contacts', items: crmTabs.contacts, current: tab, label: 'Seções de contatos' },
    content: body
  });
}
function conversations(c) {
  return conversationPage(c,inboxPage);
}
function calendars(c){
  const calendarTabs = { key: 'calendars', items: [['calendar','Calendário'],['appointments','Agendamentos'],...schedulingTabs,['meetings','Reuniões']], current: c.tab||'calendar', label: 'Seções de calendários' };
  if (schedulingTabs.some(([k]) => k === c.tab)) return schedulingScreen(c, calendarTabs);
  if (c.tab === 'meetings') return meetingsScreen(c, calendarTabs);
  const y=c.month.getFullYear(), m=c.month.getMonth(), title=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(c.month), shift=(new Date(y,m,1).getDay()+6)%7, len=new Date(y,m+1,0).getDate(), tab=c.tab||'calendar';
  const keyFor=n=>`${y}-${String(m+1).padStart(2,'0')}-${String(n).padStart(2,'0')}`;
  const dates=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:c.s.profile.timezone});
  const cells=Array.from({length:Math.ceil((shift+len)/7)*7},(_,j)=>{const n=j+1-shift;if(n<1||n>len)return `<div class="day off" aria-hidden="true"></div>`;const k=keyFor(n), apps=c.s.appointments.filter(a=>dates.format(new Date(a.start))===k);return `<div class="day ${dates.format(new Date())===k?'today':''}"><button class="day-number" data-edit="appointments" data-date="${k}" aria-label="Agendar em ${k}">${n}</button>${apps.map(a=>`<button class="appointment ${a.status==='Canceled'?'cancelled':''}" data-edit="appointments" data-id="${a.id}">${h(a.title)}</button>`).join('')}</div>`;}).join('');
  const body = tab==='calendar'?`<div class="surface calendar"><div class="calendar-head"><button class="icon-btn" data-act="prev-month" aria-label="Mês anterior">${i('left')}</button><b>${title}</b><button class="icon-btn" data-act="next-month" aria-label="Próximo mês">${i('right')}</button><div class="spacer"></div>${action('Hoje','this-month')}</div><div class="weekdays">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(a=>`<span>${a}</span>`).join('')}</div><div class="calendar-grid">${cells}</div></div>`:table(['Agendamento','Contato','Início','Fim','Status',''],[...c.s.appointments].sort((a,b)=>a.start.localeCompare(b.start)).map(r=>row([`<b>${h(r.title)}</b>`,h(name(r.contactId,c)),date(r.start,c,true),date(r.end,c,true),badge(r.status,r.status==='Canceled'?'red':'blue')],'appointments',r.id)),empty('Nenhum agendamento','Marque um agendamento para começar.','cal'));
  return pageShell({
    title: 'Calendários',
    desc: 'Organize sua agenda e acompanhe os agendamentos deste workspace.',
    cta: primary('Novo agendamento','appointments'),
    tabs: calendarTabs,
    content: body
  });
}
function opportunities(c){
  const {s} = c;
  const view = c.tab || 'pipeline';
  if (view === 'bulk') return opportunitiesTab(c,view);
  const pipeline = s.pipelines.find(item => item.id === c.pipeline) || s.pipelines[0];
  const stages = s.stages.filter(stage => stage.pipelineId === pipeline.id);
  const local = opportunityResults(s,pipeline.id,c.query,c.opportunityFilters,c.opportunitySort);
  const filters = c.opportunityFilters || { status:'Open' };
  const filterCount = Object.entries(filters).filter(([key,value]) => key === 'rules' ? value?.length : Boolean(value)).length;
  const tabCfg = { key: 'opportunities', items: crmTabs.opportunities.filter(([key]) => key !== 'list'), current: view === 'list' ? 'pipeline' : view, label: 'Seções de oportunidades' };
  if (view === 'pipelines') return pipelinesView(c,tabCfg);
  if (view === 'forecast') return forecastView(c,tabCfg);
  const stageNames = new Map(stages.map(stage => [stage.id,tr(stage.name)]));
  const contacts = new Map(s.contacts.map(contact => [contact.id,contact]));
  const colors = status => status === 'Won' ? 'green' : ['Lost','Abandoned'].includes(status) ? 'red' : 'blue';
  const nothing = filterCount || c.query
    ? empty('Nenhuma oportunidade corresponde aos filtros','', 'filter', action('Limpar filtros','opportunity-clear','close'))
    : empty('Nenhuma oportunidade neste pipeline','', 'leads', primary('Adicionar oportunidade','opportunities'));
  const title = (item, className) => `<button class="${className}" data-edit="opportunities" data-id="${item.id}">${h(item.title)}</button>`;
  const list = table([pickHead('opportunities',local.map(x => x.id)),'Oportunidade','Contato','Etapa','Valor','Status','Responsável','Origem',''],local.map(item => row([pickBox('opportunities',item.id),
    title(item,'text-link'),h(contacts.get(item.contactId)?.name || '—'),h(stageNames.get(item.stage)),mt(item.value,c),
    badge(item.status,colors(item.status)),h(item.owner || '—'),h(item.source || '—')
  ],'opportunities',item.id)),nothing);
  const extras = cardContext(c,pipeline.id);
  const { layout, fields } = extras.prefs;
  const card = item => {
    const contact = contacts.get(item.contactId);
    const values = {
      contact:h(contact?.name), company:h(item.company || contact?.company), owner:h(item.owner), source:h(item.source),
      value:mt(item.value,c), status:badge(item.status,colors(item.status)), closeDate:item.closeDate ? date(`${item.closeDate}T12:00:00Z`,c) : '',
      tags:item.tags?.map(tag => badge(tag)).join(' '), lostReason:item.status === 'Lost' ? h(item.lostReason) : ''
    };
    const chips = fields.includes('smartTags') ? smartTagChips(item,extras) : '';
    return `<article class="deal opportunity-card layout-${layout}" draggable="true" data-drag="${item.id}">
      <div class="opportunity-card-title">${title(item,'deal-title')}${pickBox('opportunities',item.id)}</div>
      ${chips ? `<div class="smart-tags">${chips}</div>` : ''}
      <dl>${fields.filter(field => values[field]).map(field => `<div><dt${layout === 'unlabeled' ? ' class="sr-only"' : ''}>${cardFields[field]}</dt><dd>${values[field]}</dd></div>`).join('')}</dl>
      ${quickActionBar(item,extras,c)}
      <label><span class="sr-only">Mover ${h(item.title)} para a etapa</span><select data-move="${item.id}">
      ${stages.map(stage => `<option value="${stage.id}" ${stage.id === item.stage ? 'selected' : ''}>${h(tr(stage.name))}</option>`).join('')}</select></label>
    </article>`;
  };
  const board = `<div class="kanban">${stages.map((stage,index) => {
    const matches = local.filter(item => item.stage === stage.id);
    return `<section class="kanban-col tone-${index%4}${stageStyle(pipeline,stage)}" data-drop="${stage.id}"><div class="kanban-head">
      <h2>${h(tr(stage.name))} <button class="icon-btn" data-edit="opportunities" data-stage="${stage.id}" aria-label="Adicionar em ${h(tr(stage.name))}">${i('plus',15)}</button></h2>
      <div class="opportunity-stage-totals"><span>${matches.length} ${matches.length === 1 ? 'oportunidade' : 'oportunidades'}</span>
      <b>${mt(matches.reduce((sum,item) => sum + item.value,0),c)}</b></div></div>
      <div class="kanban-cards">${matches.map(card).join('')}</div></section>`;
  }).join('')}</div>${local.length ? '' : nothing}`;
  const quickStatus = [['','Todos os status'],...opportunityStatuses.map(status => [status,tr(status)])];
  return pageShell({
    title: 'Oportunidades',
    desc: 'Acompanhe negócios no pipeline, previsões de receita e etapas de vendas.',
    cta: action('Importar','opportunity-import','upload') + primary('Adicionar oportunidade','opportunities') + moreMenu(),
    tabs: tabCfg,
    content: `${listTabs(c)}<div class="toolbar opportunity-toolbar">
      <label class="tag-filter"><select data-opportunity-pipeline aria-label="Pipeline">${s.pipelines.map(item => `<option value="${item.id}" ${item.id === pipeline.id ? 'selected' : ''}>${h(tr(item.name))}</option>`).join('')}</select></label>
      <span class="dim" role="status">${local.length} ${local.length === 1 ? 'oportunidade' : 'oportunidades'}</span>
      <div class="spacer"></div>
      <div class="opportunity-views" aria-label="Visualização">
        <button class="secondary" data-tab="pipeline" aria-pressed="${view === 'pipeline'}">${i('grid',15)} Quadro</button>
        <button class="secondary" data-tab="list" aria-pressed="${view === 'list'}">${i('list',15)} Lista</button>
      </div>
    </div><div class="toolbar opportunity-toolbar">
      <label class="tag-filter"><select data-opportunity-status aria-label="Status das oportunidades">${quickStatus.map(([value,label]) =>
        `<option value="${value}" ${value === (filters.status || '') ? 'selected' : ''}>${h(label)}</option>`).join('')}</select></label>
      ${filterButton(c)}
      ${action('Ordenar','opportunity-sort','sort')}
      <div class="spacer"></div>${search(c.query,'Buscar oportunidades…')}
      ${view === 'pipeline' ? action('Personalizar cartões','opportunity-fields','sliders') : ''}
    </div>${bulkBar(c,'opportunities')}${view === 'list' ? list : board}`
  });
}
function invoicePayCell(r,c){
  const p=r.payment;
  if(r.status==='Paid') return p?.receiptUrl?`<a class="text-link" href="${h(p.receiptUrl)}" target="_blank" rel="noopener">Comprovante</a>`:(p?.method?h(tr(p.method)):'');
  if(r.status==='Void') return '';
  if(p?.status==='MISMATCH') return `<span class="dim">${h(tr('Recebido'))} ${mt(p.received||0,c)}</span>`;
  if(p?.status==='REFUNDED'||p?.status==='DISPUTED') return '';
  const send=r.status==='Open'&&r.value>0?`<button class="secondary" data-iv-act="send-invoice" data-id="${r.id}">${i('send',15)} Enviar</button>`:'';
  if(p?.provider==='abacatepay'&&p.status==='PENDING'&&p.url&&p.amount===r.value) return `<span class="inline-gap">${send}<a class="secondary" href="${h(p.url)}" target="_blank" rel="noopener">Abrir</a><button class="secondary" data-act="abacate-copy" data-url="${h(p.url)}">Copiar link</button></span>`;
  return `<span class="inline-gap">${send}${c.pay?.connected?`<button class="secondary" data-act="abacate-charge" data-id="${r.id}">${i('pay',15)} Cobrar</button>`:''}</span>`;
}
function gatewayStrip(c){
  const g=c.pay;
  if(!g||g.error) return '';
  if(g.connected) return `${c.s.fiscal===null&&(!c.access?.modules||c.access.modules.includes('settings'))?fiscalMissing('#settings/fiscal'):''}<p class="dim">${badge('AbacatePay conectado','green')} ${g.devMode?badge('Modo teste','gold'):''} Use <b>Cobrar</b> para gerar o link de Pix ou cartão. A fatura é marcada como paga sozinha quando o cliente paga.</p>`;
  return `<div class="surface padded ag-notice">${i('pay',20)}<div><b>Receba as faturas por Pix ou cartão</b><p>Conecte a conta AbacatePay deste workspace para gerar links de pagamento e dar baixa automática.</p></div><a class="secondary" href="#settings/abacatepay">Conectar AbacatePay</a></div>`;
}
function abacateSubView(c){
  const g=c.pay, hl=brandHighlight('abacatepay');
  const tile=`<span class="shc-icon-tile" aria-hidden="true"><span class="shc-icon">${brandIcon('abacatepay',22)}</span></span>`;
  const card=(body,on=false)=>`<div class="surface padded shc-card shc-panel${on?' is-connected':''}" style="--shc-highlight:${hl}">${shcLayers()}${body}</div>`;
  if(!g) return card(`${tile}<h2>AbacatePay</h2><p class="dim">Verificando a conexão…</p>`);
  if(g.error) return card(`${tile}<h2>AbacatePay</h2><p class="form-status">${h(g.error)}</p><button class="secondary" data-act="abacate-refresh">Tentar novamente</button>`);
  if(!g.connected) return `<form class="surface settings-form set-form shc-card shc-panel" data-form="abacate-connect" style="--shc-highlight:${hl}">${shcLayers()}<section class="set-section"><header class="set-head">${tile}<h2>Conectar AbacatePay</h2><p class="dim">Receba faturas e pedidos da loja por Pix ou cartão. Crie uma chave de API v2 com permissão de leitura e escrita em <a class="text-link" href="https://app.abacatepay.com/api-keys" target="_blank" rel="noopener">app.abacatepay.com</a>. Para experimentar sem dinheiro real, use a chave do modo teste.</p></header><div class="set-body"><label>Chave de API v2<input name="apiKey" required autocomplete="off" spellcheck="false" maxlength="400"></label></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Conectar</button></footer></form>`;
  const hook=g.webhookStatus==='registered'?`<p>${badge('Webhook cadastrado automaticamente','green')}</p>`:`<p class="ag-warn surface padded">${h(g.webhookError||'Cadastre o webhook no painel do AbacatePay.')} Use os dados abaixo em app.abacatepay.com/webhooks.</p>`;
  const update=g.webhookOutdated&&g.webhookSecret?`<div class="surface padded ag-notice">${i('pay',20)}<div><b>Há avisos novos do AbacatePay</b><p>Atualize para a graao saber de contestação e devolução.</p></div><button class="primary" data-act="abacate-hooks">Atualizar avisos</button></div>`:'';
  return update+card(`${tile}<div class="inline-gap"><h2>${h(g.storeName||'AbacatePay')}</h2>${badge('Conectado','green')}${g.devMode?badge('Modo teste','gold'):''}</div><p class="dim">Chave terminada em <b>${h(g.last4)}</b>. Faturas e pedidos da loja são cobrados por Pix ou cartão, e o pagamento é confirmado automaticamente.</p><div class="inline-gap"><a class="primary" href="#payments">Abrir faturas</a><button class="secondary" data-act="abacate-disconnect">Desconectar</button></div>`,true)
    +`<section class="surface set-card"><div class="set-section"><header class="set-head"><h2>Webhook de pagamentos</h2></header><div class="set-body">${hook}<label>URL<input readonly value="${h(g.webhookUrl)}"></label>${g.webhookSecret?`<label>Secret<input readonly value="${h(g.webhookSecret)}"></label>`:''}<p class="dim"><small>Eventos: ${h(g.events.join(', '))}</small></p></div></div></section>`;
}
function payments(c){
  if(['documents','document'].includes(c.tab)) return documentsScreen(c);
  if(['estimates','estimate'].includes(c.tab)) return estimatesScreen(c);
  if(invoiceTabs.includes(c.tab)) return invoicesScreen(c);
  if(c.tab==='payment-settings') return paymentSettingsScreen(c);
  if(orderTabsKeys.includes(c.tab)) return ordersScreenFor(c);
  if(catalogTabs.includes(c.tab)) return catalogScreen(c);
  if((c.tab||'invoices')!=='invoices') return paymentsTab(c,c.tab);
  const s=c.s, records=top(s.invoices,c.query,['title','status']);
  return pageShell({
    title: 'Pagamentos',
    desc: 'Acompanhe as faturas registradas neste workspace.',
    cta: `${(s.invoiceTemplates||[]).length?`<button type="button" class="secondary" data-iv-act="use">${i('copy',15)} Usar modelo</button>`:''}${primary('Nova fatura','invoices')}`,
    tabs: { key: 'payments', items: crmTabs.payments, current: c.tab||'invoices', label: 'Seções de pagamentos' },
    content: `<div class="metrics three"><div class="surface metric"><span>Saldo em aberto</span><b>${mt(s.invoices.filter(x=>x.status==='Open').reduce((a,r)=>a+r.value,0),c)}</b></div><div class="surface metric"><span>Pagamentos registrados</span><b>${mt(c.m.invoicesPaid,c)}</b></div><div class="surface metric"><span>Total de faturas</span><b>${s.invoices.length}</b></div></div>${gatewayStrip(c)}<div class="toolbar">${search(c.query,'Buscar faturas…')}</div>`+table(['Fatura','Contato','Valor','Vencimento','Status','Cobrança',''],records.map(r=>row([`<b>${h(r.title)}</b>`,h(name(r.contactId,c)),mt(r.value,c),date(r.due,c),badge(...invoiceStateLabels[invoicePaymentState(r)]),invoicePayCell(r,c)],'invoices',r.id)),empty('Nenhuma fatura registrada','Crie uma fatura e cobre por Pix ou cartão com o AbacatePay, ou marque o pagamento manualmente.','pay'))
  });
}
function marketing(c){
  const t=c.tab||'social';
  const marketingTabs = [['social','Planejador social'],['events','Eventos'],['email','E-mails'],['countdown','Contadores'],['affiliates','Afiliados'],['ads','Anúncios'],['loyalty','Fidelidade'],['brand','Marca']];
  if(t==='affiliates') return affiliatesScreen(c,{ marketingTabs });
  if(t==='ads') return adsScreen(c,{ marketingTabs });
  if(t==='brand') return brandScreen(c,{ marketingTabs });
  if(t==='loyalty') return loyaltyScreen(c,{ marketingTabs });
  if(t==='social') return socialPlanner(c,{ pageShell, utabs, marketingTabs });
  if(t==='events') return eventPlanner(c,{ pageShell, utabs, marketingTabs });
  if(t==='countdown') return countdownScreen(c,{ marketingTabs });
  return emailMarketingScreen(c,{ marketingTabs });
}
function sites(c){
  if(formTabs.includes(c.tab)) return formsScreen(c);
  if(chatTabs.includes(c.tab)) return chatScreen(c);
  if(blogTabs.includes(c.tab)) return blogScreen(c);
  if(storeTabs.includes(c.tab)) return storeScreen(c);
  if(webinarTabs.includes(c.tab)) return webinarScreen(c);
  if(qrTabs.includes(c.tab)) return qrScreen(c);
  if(analyticsTabs.includes(c.tab)) return analyticsScreen(c);
  if(!['forms','submissions'].includes(c.tab)) return sitesScreen(c);
  const t=c.tab||'funnels', p=t==='websites'?'Website':'Funnel', s=c.s;
  return pageShell({
    title: 'Sites',
    desc: 'Crie páginas de captura locais e receba envios.',
    cta: t==='submissions'?'':t==='forms'?primary('Novo formulário','forms'):primary(p==='Website'?'Novo site':'Novo funil','pages',`data-kind="${p}"`),
    tabs: { key: 'sites', items: [['funnels','Funis'],['websites','Sites'],['forms','Formulários'],['submissions','Envios']], current: t, label: 'Seções de sites' },
    content: t==='submissions'?table(['Formulário','Nome','E-mail','Recebido'],[...s.submissions].reverse().map(r=>`<tr><td>${h(s.forms.find(f=>f.id===r.formId)?.name||'Formulário excluído')}</td><td>${h(r.name||'—')}</td><td>${h(r.email||'—')}</td><td>${date(r.created,c,true)}</td></tr>`),empty('Nenhum envio','Publique um formulário e use o link local para captar um lead.','inbox')):`<div class="card-grid">${[...(t==='forms'?s.forms:s.pages.filter(r=>r.kind===p))].reverse().map(r=>`<article class="surface padded resource"><span class="metric-icon">${i(t==='forms'?'list':'site')}</span><div><h2>${h(r.name)}</h2><p>${h(r.headline||r.description||'')}</p></div>${badge(r.active?'Publicado localmente':'Draft',r.active?'green':'')}<div class="inline-gap">${r.active?viewLink('Abrir',t==='forms'?'f':'p',r.id,c):''}<button class="secondary" data-edit="${t==='forms'?'forms':'pages'}" data-id="${r.id}">${i('edit',15)} Editar</button></div></article>`).join('')||empty(t==='forms'?'Nenhum formulário ainda':t==='websites'?'Nenhum site ainda':'Nenhum funil ainda','Crie um item para visualizá-lo ou publicá-lo localmente.','site')}</div>`
  });
}
function memberships(c){
  return ['courses','course'].includes(c.tab) ? coursesScreen(c) : ['communities','community'].includes(c.tab) ? communitiesScreen(c) : c.tab === 'offers' ? offersScreen(c) : c.tab === 'certificates' ? certificatesScreen(c) : portalAdminScreen(c);
}
const media = c => mediaScreen(c);
function reporting(c){
  const view=c.tab || 'reports';
  if (view === 'reports') return reportList(c);
  if (view === 'new') return reportSources(c);
  if (view === 'editor') return reportEditor(c);
  if (reportingAdsTabs.includes(view)) return adsReportScreen(c, { sections: reportingSections });
  const tabCfg = { key: 'reporting', items: reportingSections, current: view, label: 'Seções de relatórios' };
  if (view==='calls') return callReportView(c, { pageShell, tabs: tabCfg });
  if (view==='snapshots') return pageShell({
    title: 'Relatórios',
    desc: 'Cópias salvas a partir dos seus painéis de métricas.',
    tabs: tabCfg,
    content: table(['Nome','Painel','Salvo em','Período',''],[...c.s.dashboardReports].reverse().map(report =>
      `<tr><td><b>${h(report.name)}</b></td><td>${h(tr(report.dashboard))}</td><td>${date(report.created,c,true)}</td><td>${h(report.start ? `${report.start} – ${report.end}` : 'Todo o período')}</td><td><button class="secondary" data-dashboard-report="${report.id}">Abrir relatório</button></td></tr>`),empty('Nenhum relatório do painel','Use “Enviar como relatório” em um painel para salvar uma cópia aqui.','chart'))
  });
  const cols=['Módulo','Registros','Observações'], values=[['Contatos',c.m.contacts,'Todos os contatos salvos'],['Oportunidades',c.m.open,`Em aberto · ${mt(c.m.openValue,c)}`],['Negócios ganhos',c.m.won,`Ganhos · ${mt(c.m.wonValue,c)}`],['Agendamentos',c.m.appointments,'Não inclui agendamentos cancelados'],['Faturas',c.s.invoices.length,`${mt(c.m.invoicesPaid,c)} marcados como pagos`],['Envios de formulário',c.s.submissions.length,'Todos os envios recebidos'],['Fluxos',c.s.runs.length,'Execuções registradas']];
  return pageShell({
    title: 'Relatórios',
    desc: 'Resumo do workspace com base nos registros atuais.',
    cta: action('Exportar relatório','export','download'),
    tabs: tabCfg,
    content: table(cols,values.map(r=>`<tr>${r.map((x,j)=>`<td>${j===0?`<b>${x}</b>`:x}</td>`).join('')}</tr>`),'')
  });
}
function whatsappSubView(c){
  const w=c.wa, waHl=brandHighlight('whatsapp');
  const waCard=(body,connected=false)=>`<div class="surface padded sub-wa-card shc-card shc-panel${connected?' is-connected':''}" style="--shc-highlight:${waHl}">${shcLayers()}${body}</div>`;
  const waIcon=(size=24)=>`<span class="shc-icon-tile" aria-hidden="true"><span class="shc-icon">${brandIcon('whatsapp',size)}</span></span>`;
  if(!w) return waCard(`${waIcon(22)}<h2>WhatsApp</h2><p class="dim">Verificando conexão do WhatsApp desta subconta…</p>`);
  if(w.error) return waCard(`${waIcon(22)}<h2>WhatsApp</h2><p class="form-status">${h(w.error)}</p><button class="secondary" data-act="wa-refresh">Tentar novamente</button>`);
  if(!w.available) return waCard(`${waIcon(22)}<h2>WhatsApp ainda não disponível</h2><p class="dim">Peça ao administrador da agência para ativar a integração de WhatsApp nas configurações da agência.</p>${c.access?.agency?'<a class="primary" href="#agency/settings/whatsapp">Configurar na agência</a>':''}`);
  if(!w.enabled) return waCard(`${waIcon(22)}<h2>WhatsApp desativado nesta subconta</h2><p class="dim">O recurso de WhatsApp não está habilitado para este workspace no momento.</p>`);
  if(w.status==='connected'){
    return `<div class="stack">
      ${waCard(`
        ${waIcon(24)}
        <div class="inline-gap"><h2>${h(w.profileName||'WhatsApp conectado')}</h2>${badge('Conectado','green')}</div>
        <p class="dim">${w.phone?`Número conectado: <b>+${h(w.phone)}</b><br>`:''}Mensagens recebidas chegam automaticamente em <b>Conversas</b> e respostas pelo canal WhatsApp são enviadas por este número.</p>
        <div class="inline-gap">
          <a class="primary" href="#conversations">Abrir Conversas</a>
          <button class="secondary" data-act="wa-refresh">Atualizar status</button>
          <button class="secondary" data-act="wa-disconnect">Desconectar</button>
        </div>
      `,true)}
      <form class="surface settings-form set-form" data-form="wa-test"><section class="set-section"><header class="set-head"><h2>Enviar mensagem de teste</h2><p class="dim">Teste o disparo real pelo WhatsApp conectado nesta subconta.</p></header><div class="set-body"><label>Número destino (com DDI)<input name="phone" required inputmode="numeric" placeholder="5511999999999"></label>
        <label>Mensagem<textarea name="text" required maxlength="2000" placeholder="Olá! Mensagem de teste enviada pela Graao."></textarea></label></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Enviar teste</button></footer></form>
    </div>`;
  }
  if(w.status==='connecting'){
    return waCard(`
      ${waIcon(22)}
      <div class="inline-gap"><h2>Escaneie o QR Code</h2>${badge('Aguardando leitura','blue')}</div>
      ${w.qrcode
        ? `<div class="ag-waha-qr-frame"><img src="${h(w.qrcode)}" alt="QR Code para conectar o WhatsApp"></div>
           <ol class="sub-wa-steps"><li>Abra o <b>WhatsApp</b> no seu celular</li><li>Toque em <b>Aparelhos conectados → Conectar aparelho</b></li><li>Aponte a câmera para este QR Code</li></ol>
           <small class="dim">A página detecta automaticamente assim que o celular confirmar a conexão.</small>`
        : w.paircode
          ? `<div class="ag-waha-code" aria-label="Código de pareamento">${h(w.paircode)}</div>
             <p class="dim">No WhatsApp: <b>Aparelhos conectados → Conectar aparelho → Conectar com número de telefone</b> e digite o código acima.</p>`
          : `<p class="dim">Preparando QR Code…</p>`}
      <div class="inline-gap">
        <button class="primary" data-act="wa-connect">Atualizar QR Code</button>
        <button class="secondary" data-act="wa-disconnect">Cancelar</button>
      </div>
    `);
  }
  return waCard(`
    ${waIcon(24)}
    <div class="inline-gap"><h2>Conectar WhatsApp</h2>${badge('Desconectado')}</div>
    <p class="dim">Conecte o número desta subconta em segundos: basta clicar abaixo e apontar a câmera do WhatsApp para o QR Code.</p>
    <div class="inline-gap">
      <button class="primary" data-act="wa-connect">${i('whatsapp',16)} Conectar WhatsApp</button>
      <button class="secondary" data-act="wa-toggle-pair">${c.waPairOpen?'Ocultar opção por número':'Conectar por número de telefone'}</button>
    </div>
    ${c.waPairOpen?`<form class="settings-form sub-wa-pair" data-form="wa-pair"><label>Seu número de WhatsApp (com DDI e DDD)<input name="phone" required inputmode="numeric" placeholder="5511999999999"></label><button class="secondary">Gerar código de 8 dígitos</button><p class="form-status" role="alert"></p></form>`:''}
  `);
}
function googleSubView(c){
  const g=c.google, hl=brandHighlight('Google Analytics');
  const tile=`<span class="shc-icon-tile" aria-hidden="true"><span class="shc-icon">${brandIcon('Google Analytics',22)}</span></span>`;
  const card=(body,on=false)=>`<div class="surface padded shc-card shc-panel${on?' is-connected':''}" style="--shc-highlight:${hl}">${shcLayers()}${body}</div>`;
  if(!g) return card(`${tile}<h2>Google</h2><p class="dim">Verificando a conexão…</p>`);
  if(g.error) return card(`${tile}<h2>Google</h2><p class="form-status">${h(g.error)}</p><button class="secondary" data-act="google-refresh">Tentar novamente</button>`);
  if(!g.configured) return card(`${tile}<h2>Google Analytics e Perfil da Empresa</h2><p class="dim">A conexão com o Google ainda não foi configurada nesta instalação da graao. Peça ao administrador da agência para definir <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code>.</p>`);
  if(!g.connected) return card(`${tile}<h2>Conectar Google Analytics, Perfil da Empresa e Search Console</h2><p class="dim">Entre com a conta Google que tem acesso ao Google Analytics (GA4), ao Perfil da Empresa e ao Search Console deste cliente. A graao lê os relatórios: sessões, usuários e visualizações do site; visualizações, ligações, cliques no site e rotas no Google; e cliques, impressões e posição das pesquisas do site.</p><button class="primary" data-act="google-connect">${brandIcon('Google Business Profile',16)} Conectar com o Google</button>`);
  const opt=(list,value,blank)=>`<option value="">${h(blank)}</option>`+list.map(item=>`<option value="${h(item.id)}" ${item.id===value?'selected':''}>${h(item.name)}${item.account?` · ${h(item.account)}`:''}${item.address?` · ${h(item.address)}`:''}</option>`).join('');
  const note=key=>g.errors?.[key]?`<p class="ag-warn surface padded">${h(g.errors[key])}</p>`:'';
  const status=(d,name)=>!d?'':d.error?`<p class="form-status">${h(d.error)}</p>`:`<p class="dim">${badge('Recebendo dados','green')} ${h(name)}</p>`;
  return `<form class="surface settings-form set-form shc-card shc-panel is-connected" data-form="google-select" style="--shc-highlight:${hl}">${shcLayers()}<section class="set-section"><header class="set-head">${tile}<div class="inline-gap"><h2>Google</h2>${badge('Conectado','green')}</div><p class="dim">Conta <b>${h(g.email||'Google')}</b>. Escolha o que aparece no painel desta subconta.</p>
      <div class="inline-gap"><button type="button" class="secondary" data-act="google-connect">Trocar conta Google</button><button type="button" class="secondary" data-act="google-disconnect">Desconectar</button></div></header><div class="set-body">
      <label>Propriedade do Google Analytics (GA4)<select name="gaProperty">${opt(g.properties,g.gaProperty,g.properties.length?'Não mostrar':'Nenhuma propriedade encontrada')}</select></label>${note('analytics')}${status(g.data?.ga,g.gaName)}
      <label>Local do Perfil da Empresa<select name="gbpLocation">${opt(g.locations,g.gbpLocation,g.locations.length?'Não mostrar':'Nenhum local encontrado')}</select></label>${note('business')}${status(g.data?.gbp,g.gbpName)}
      <label>Site do Search Console (Reputação → SEO)<select name="gscSite">${opt(g.sites||[],g.gscSite,(g.sites||[]).length?'Não usar':'Nenhum site encontrado')}</select></label>${note('search')}${!(g.sites||[]).length&&!g.errors?.search?'<p class="dim">Nenhum site? Confira se o site está verificado no Search Console com esta conta. Se a conta foi conectada antes do SEO existir, use “Trocar conta Google” para dar a nova permissão.</p>':''}
      </div></section><footer class="set-foot"><p class="form-status" role="alert"></p><a class="secondary" href="#dashboard">Abrir painel</a><button class="primary">Salvar escolha</button></footer></form>`;
}
function settings(c){
  if(c.tab==='labs') return labsScreen(c,{ key: 'settings', items: crmTabs.settings.map(([k, label]) => [k, tr(label)]), current: c.tab, label: tr('Seções de configurações') });
  if(c.tab==='wallet') return walletScreen(c,{ key: 'settings', items: crmTabs.settings.map(([k, label]) => [k, tr(label)]), current: c.tab, label: tr('Seções de configurações') });
  if(['tracking','scoring','preferences'].includes(c.tab)){ const tabs={ key: 'settings', items: crmTabs.settings.map(([k, label]) => [k, tr(label)]), current: c.tab, label: tr('Seções de configurações') }; return c.tab==='tracking'?trackingScreen(c,tabs):c.tab==='preferences'?preferencesScreen(c,tabs):scoringScreen(c,tabs); }
  if(c.tab&&!['business','fiscal','workspaces','whatsapp','abacatepay','google','email','phone','connectors'].includes(c.tab)) return settingsTab(c,c.tab);
  const p=c.s.profile;
  const tab = c.tab || 'business';
  const body = tab==='fiscal'?fiscalForm(c.s.fiscal,{attr:'data-form="fiscal"'}):tab==='connectors'?connectorsView(c):tab==='phone'?phoneSettingsView(c):tab==='email'?emailServicesView(c):tab==='google'?googleSubView(c):tab==='abacatepay'?abacateSubView(c):tab==='whatsapp'?whatsappSubView(c):tab==='workspaces'?`<section class="surface set-card"><div class="set-section"><header class="set-head"><h2>Seus workspaces</h2><p class="dim">As subcontas que você pode abrir.</p></header><div class="set-body is-list">${c.workspaces.map(w=>`<div class="line-item"><b>${h(w.name)}</b>${w.id===c.workspace?badge('Atual','blue'):`<button class="secondary" data-workspace="${w.id}">Trocar</button>`}</div>`).join('')}</div></div></section>`:`<form data-form="profile" class="surface settings-form set-form"><section class="set-section"><header class="set-head"><h2>Perfil da empresa</h2><p class="dim">Os dados que aparecem em faturas, e-mails e páginas desta subconta.</p></header><div class="set-body"><div class="field-grid"><label>Nome do workspace<input name="name" value="${h(p.name)}" required></label><label>E-mail da empresa<input name="email" type="email" value="${h(p.email)}"></label>${phoneField({ name: 'phone', label: 'Telefone', value: p.phone, id: 'sub-profile-phone' })}<label>Fuso horário<input name="timezone" value="${h(p.timezone)}" required></label><label>Moeda<input readonly value="Real brasileiro (BRL)"></label><label>${tr('Idioma da plataforma')}<select data-lang-choice-select><option value="pt" ${getLanguage()==='pt'?'selected':''}>Português (Brasil)</option><option value="es" ${getLanguage()==='es'?'selected':''}>Español (Latinoamérica)</option></select></label></div></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Salvar alterações</button></footer></form>`;
  return pageShell({
    title: tr('Configurações'),
    desc: tr('Gerencie o workspace ativo.'),
    cta: action(tr('Novo workspace'),'new-workspace','plus'),
    tabs: { key: 'settings', items: crmTabs.settings.map(([k, label]) => [k, tr(label)]), current: tab, label: tr('Seções de configurações') },
    content: body
  });
}
export const screens={launchpad,'ask-ai':dashboard,dashboard,conversations,calendars,contacts,opportunities,automation:automationScreen,payments,marketing,sites,memberships,media,reputation:reputationScreen,reporting,settings,studio,'ai-agents':agentsScreen,prancheta:()=>pageShell({title:'Prancheta',desc:'A ferramenta de prancheta foi movida para a visão da agência.',cta:'<a class="primary" href="#agency/prancheta">Ir para Prancheta da Agência</a>',content:empty('Ferramenta da Agência','A Prancheta Criativa agora está centralizada no menu da sua agência.','palette')})};
export { date, empty, name, primary, row, search, table };

export function publicView(data,workspace){
  const {kind,row:r,form,brand}=data;
  const formHtml=f=>`<form class="surface padded settings-form lead-form" data-form="lead" data-id="${f.id}" data-workspace="${workspace}"><h2>${h(f.name)}</h2><p>${h(f.description)}</p><label>Nome<input name="name" required maxlength="240" autocomplete="name"></label><label>E-mail<input name="email" type="email" required autocomplete="email"></label>${f.askPhone?phoneField({ name: 'phone', label: 'Telefone', id: `lead-phone-${f.id}` }):''}<button class="primary">Enviar ${i('arrow',16)}</button><p class="form-status" role="status"></p></form>`;
  return `<div class="public-page"><header>${h(brand)} ${badge('Prévia local')}</header><main>${kind==='f'?formHtml(r):kind==='course'?`<article class="surface padded"><p class="dim">${h(r.name)}</p><h1>${h(r.lesson)}</h1><p>${h(r.description)}</p><div class="public-body">${h(r.body)}</div></article>`:`<section class="public-hero"><p>${h(r.name)}</p><h1>${h(r.headline)}</h1><p>${h(r.body)}</p>${r.button&&form?`<a class="primary" href="#lead">${h(r.button)} ${i('arrow',16)}</a>`:''}</section>${form?`<div id="lead" class="surface padded lead-frame"><iframe src="/form/${h(workspace)}/${h(form.id)}?embed=1" title="${h(form.name)}" data-form-frame="${h(form.id)}" style="width:100%;border:0;min-height:380px"></iframe></div>`:''}`}</main></div>`;
}
