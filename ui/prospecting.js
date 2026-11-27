import { icon } from './icons.js';
import { pageShell } from './screens.js';
import { auditAreas } from './agency-data.js';
import { auditReport, escapeProspect as h, isGooglePlace, mapsAddress, offlineReportHtml, safeWebsite, withPlace } from './prospect-report.js';
import { folded, leadStatus, opportunityScore, prospectLeadStatus, prospectSearchText, prospectSections, prospectSources, prospectThemes } from './prospecting-data.js';

const base = '#agency/prospecting';
const tabs = [
  ['all','Todas as contas'], ['ai','Prospect AI'], ['widgets','Widgets'], ['builder','Editor de relatórios'],
  ['analytics','Analytics'], ['settings','Configurações']
];
export const prospectRoutes = [...tabs, ...['search','manual','detail','report','migrate'].map(key => [key,key])];
const route = (page = 'all',id = '') => `${base}/${page}${id ? '/' + encodeURIComponent(id) : ''}`;
const inside = () => location.hash === base || location.hash.startsWith(base + '/');
const ico = (name,size = 16) => icon(name,size);
const cls = (primary = false) => `pr-btn${primary ? ' pr-primary' : ''}`;
const link = (label,page,{id,primary,name} = {}) => `<a class="${cls(primary)}" href="${route(page,id)}">${name ? ico(name) : ''}${h(label)}</a>`;
const btn = (label,action,{id,primary,name,hide = false,attrs = ''} = {}) => `<button type="button" class="${hide ? 'pr-icon' : cls(primary)}" data-pr="${action}" ${id ? `data-id="${h(id)}"` : ''} ${hide ? `title="${h(label)}" aria-label="${h(label)}"` : ''} ${attrs}>${name ? ico(name) : ''}${hide ? '' : h(label)}</button>`;
const external = (url,label) => `<a href="${h(url)}" target="_blank" rel="noopener noreferrer">${h(label)} ${ico('external',13)}</a>`;
const submit = label => `<button class="${cls(true)}">${h(label)}</button>`;
const badge = (label,tone = '') => `<span class="pr-badge ${tone}">${h(label)}</span>`;
const date = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'medium'}).format(new Date(value)) : '—';
const address = row => [row.address,row.city,row.region,row.postal,row.country].filter(Boolean).join(', ');
const stat = row => prospectLeadStatus[leadStatus(row)];
const slug = row => folded(row.name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'prospect';
const options = (entries,value) => entries.map(([key,label]) => `<option value="${h(key)}"${String(value) === String(key) ? ' selected' : ''}>${h(label)}</option>`).join('');
const select = (name,label,entries,value,attrs = '') => `<label>${h(label)}<select name="${name}" ${attrs}>${options(entries,value)}</select></label>`;
const input = (name,label,value = '',attrs = '') => `<label>${h(label)}<input name="${name}" value="${h(value)}" ${attrs}></label>`;
const textarea = (name,label,value = '',limit = 500) => `<label>${h(label)}<textarea name="${name}" maxlength="${limit}">${h(value)}</textarea></label>`;
const checked = (name,label,enabled = false,value = '') => `<label class="pr-check"><input type="checkbox" name="${name}"${value ? ` value="${h(value)}"` : ''}${enabled ? ' checked' : ''}>${h(label)}</label>`;
const form = (type,body,id = '') => `<form class="pr-form" data-pr-form="${type}" data-id="${h(id)}">${body}<p class="form-status" role="alert"></p></form>`;
const panel = (title,body) => `<section class="pr-panel"><h2>${h(title)}</h2>${body}</section>`;
const empty = (name,title,desc,actions = '') => `<div class="pr-empty"><span>${ico(name,25)}</span><h2>${h(title)}</h2><p>${h(desc)}</p>${actions ? `<div class="pr-actions">${actions}</div>` : ''}</div>`;
const radii = [2,5,10,20,30].map(n => [n,`${n} km`]);
const leafletBase = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/';
let leaflet;
function loadLeaflet() {
  if (window.L?.map) return Promise.resolve(window.L);
  leaflet ||= new Promise((resolve,reject) => {
    const css = Object.assign(document.createElement('link'),{rel:'stylesheet',href:leafletBase+'leaflet.css',crossOrigin:'anonymous'});
    const js = Object.assign(document.createElement('script'),{src:leafletBase+'leaflet.js',crossOrigin:'anonymous',onload:() => resolve(window.L),
      onerror:() => { leaflet = null; reject(new Error('Leaflet indisponível')); }});
    document.head.append(css,js);
  });
  return leaflet;
}

export function createProspecting({data,accounts,call,render,dialog,close,flash,download}) {
  const agency = () => data().agency;
  const config = () => agency().prospecting;
  const reports = () => agency().prospects.filter(row => row.report);
  const active = () => agency().prospects.filter(row => !row.archived);
  const allowedSettings = () => data().access.settings;
  const destinations = () => accounts().filter(item => {
    const access = data().access;
    return (!access.accounts || access.accounts.includes(item.id)) && (!access.modules || access.modules.includes('contacts'));
  });
  const S = {
    filters:{query:'',category:'',source:'',status:'',archived:false}, months:6, sections:null,
    search:{keyword:'',location:'',radius:5,result:null,agent:'',showMap:false,selected:new Set()},
    places:new Map(), placesPending:new Set()
  };
  // Prospects do Google Maps só guardam o placeId: nome, endereço, telefone, site e nota vêm ao vivo do Google
  // (prospecting-places) e ficam só na memória da página.
  const placeOf = row => isGooglePlace(row?.placeId) ? S.places.get(row.placeId) || null : null;
  const shown = row => row && placeOf(row) ? withPlace(row,placeOf(row)) : row;
  const shownReport = row => row.report && placeOf(row) ? { ...row.report,business:withPlace(row.report.business,placeOf(row)) } : row.report;
  // Lidos uma vez por sessão do navegador: ficam no sessionStorage da aba (some ao fechar) para que recarregar
  // a página não gaste outra consulta ao Google. Falhas não são guardadas e tentam de novo na próxima carga.
  const placesKey = () => `graao:prospect-places:${data().access?.agencyId || 'agencia'}`;
  let placesRestored = false;
  function restorePlaces() {
    if (placesRestored) return;
    placesRestored = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(placesKey()) || '{}');
      for (const [placeId,place] of Object.entries(saved)) if (place && typeof place === 'object' && !S.places.has(placeId)) S.places.set(placeId,place);
    } catch { /* Sem sessionStorage: os dados são lidos do servidor. */ }
  }
  function rememberPlaces() {
    try { sessionStorage.setItem(placesKey(),JSON.stringify(Object.fromEntries([...S.places].filter(([,place]) => place).slice(-500)))); }
    catch { /* Aba privada ou armazenamento cheio: fica só na memória da página. */ }
  }
  function loadPlaces(rows) {
    restorePlaces();
    const wanted = rows.filter(row => isGooglePlace(row?.placeId) && !S.places.has(row.placeId) && !S.placesPending.has(row.placeId));
    if (!wanted.length || !data().features?.prospectingMaps) return;
    const placeIds = [...new Set(wanted.map(row => row.placeId))];
    for (const placeId of placeIds) S.placesPending.add(placeId);
    call('prospecting-places',{ids:wanted.map(row => row.id).slice(0,60)})
      .then(found => { for (const placeId of placeIds) S.places.set(placeId,found?.[placeId] || null); rememberPlaces(); })
      .catch(() => { for (const placeId of placeIds) S.places.set(placeId,null); })
      .finally(() => { for (const placeId of placeIds) S.placesPending.delete(placeId); render(); });
  }
  const lookup = id => agency().prospects.find(row => row.id === id);
  const act = (op,id = '',body = {}) => call('prospecting-action',{op,id,data:body});
  const go = (page,id) => {
    const next = route(page,id);
    if (location.hash === next) render();
    else location.hash = next;
  };
  const openForm = (type,title,body,{id = '',label = 'Salvar',wide = false} = {}) => {
    dialog(title,body,{form:'prospecting',id,submit:label,wide});
    const node = document.querySelector('#dialog [data-ag-form="prospecting"]');
    node.dataset.prForm = type;
    delete node.dataset.agForm;
  };
  const copyBox = (title,value,label) => dialog(title,`<div class="pr-copy"><label>${h(label)}<input readonly data-pr-copy-value value="${h(value)}"></label>${btn('Copiar','copy-field',{name:'link'})}</div>`,{wide:true});
  const embed = () => data().features.prospectingMapsEmbed;
  function mapFrame(mode,query,label) {
    const url = new URL(`https://www.google.com/maps/embed/v1/${mode}`);
    url.search = new URLSearchParams({key:embed(),q:query,language:'pt-BR'});
    return `<iframe class="pr-map-frame" src="${h(url.href)}" title="${h(label)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  }

  function listed(row) {
    const s = S.filters;
    return Boolean(row.archived) === s.archived && (!s.category || row.categories.includes(s.category)) &&
      (!s.source || row.source === s.source) && (!s.status || leadStatus(row) === s.status) &&
      (!s.query || folded([prospectSearchText(shown(row)),row.owner,row.email,shown(row).phone].filter(Boolean).join(' ')).includes(folded(s.query)));
  }

  function prospectFacts(row) {
    const map = mapsAddress(row);
    const site = safeWebsite(row.website);
    return `<ul class="pr-facts">
      <li>${ico('pin')}<span>${map ? external(map,row.address || row.city ? address(row) : 'Abrir no Google Maps') : 'Endereço indisponível'}</span>
        ${map && embed() ? btn('Ver mapa na plataforma','map-place',{id:row.id,name:'pin',hide:true}) : ''}</li>
      <li>${ico('phone')}<span>${row.phone ? `${h(row.phone)} ${btn('Copiar telefone','copy-phone',{id:row.id,name:'link',hide:true})}` : 'Telefone indisponível'}</span></li>
      <li>${ico('site')}<span>${site ? external(site,new URL(site).hostname.replace(/^www\./,'')) : 'Site indisponível'}</span></li>
      <li>${ico('star')}<span>${Number.isFinite(row.rating) ? `${h(row.rating.toLocaleString('pt-BR'))} de 5${row.reviews == null ? '' : ` · ${row.reviews} avaliações`}` : 'Avaliações indisponíveis'}</span></li>
    </ul>`;
  }

  function card(row) {
    const score = opportunityScore(row.report?.signals);
    const extras = config().categories.filter(item => row.categories.includes(item.id));
    return `<article class="pr-card" aria-label="${h(row.name)}">
      <div class="pr-card-main"><div class="pr-avatar">${h([...row.name][0]?.toUpperCase() || '?')}</div>
      <div class="pr-card-info">
        <h2><a href="${route('detail',row.id)}">${h(row.name)}</a></h2>
        <div class="pr-tags">${badge(stat(row),leadStatus(row).toLowerCase())}${badge(prospectSources[row.source] || row.source)}${row.category ? badge(row.category,'niche') : ''}${extras.map(item => badge(item.name,'category')).join('')}${row.archived ? badge('Arquivado') : ''}</div>
        ${prospectFacts(row)}
      </div>
      <div class="pr-card-score"><span>Oportunidade</span><strong>${score == null ? '—' : `${score}<small>%</small>`}</strong>
        ${row.report ? link('Ver relatório','report',{id:row.id,name:'note'}) : btn('Gerar relatório','audit',{id:row.id,name:'note'})}</div></div>
      <footer>
        <div class="pr-actions">
          ${link('Detalhes','detail',{id:row.id,name:'contacts'})}
          ${btn('Editar prospect','edit',{id:row.id,name:'edit',hide:true})}
          ${row.report && !row.archived ? btn('Compartilhar relatório','share',{id:row.id,name:'link',hide:true}) : ''}
          ${row.archived ? '' : btn('Enviar ao CRM','transfer',{id:row.id,name:'send',hide:true})}
        </div>
        <div class="pr-actions">
          ${row.archived ? btn('Restaurar','restore',{id:row.id,name:'refresh'}) : `${select('status','Status',Object.entries(prospectLeadStatus),leadStatus(row),`data-pr-status="${h(row.id)}" aria-label="Status de ${h(row.name)}"`)}
          ${btn('Arquivar','archive',{id:row.id,name:'box',hide:true})}`}
        </div>
      </footer>
    </article>`;
  }

  function gettingStarted() {
    const rows = agency().prospects;
    const tasks = [
      ['Adicione seu primeiro prospect','search',rows.length],['Compartilhe um relatório','all',rows.some(row => row.shareId)],
      ['Envie um prospect ao CRM','migrate',rows.some(row => Object.keys(row.transfers).length)],
      ['Capture leads com um widget','widgets',config().widgets.some(row => row.active)],['Configure o Prospect AI','ai',config().agents.length]
    ];
    const done = tasks.filter(([, ,value]) => value).length;
    return `<aside class="pr-guide pr-panel" aria-label="Primeiros passos"><h2>Primeiros passos</h2>
      <p>${done} de ${tasks.length} etapas concluídas</p><progress value="${done}" max="${tasks.length}" aria-label="Etapas concluídas"></progress>
      <ol>${tasks.map(([label,page,complete]) => `<li><a href="${route(page)}"><span class="${complete ? 'done' : ''}">${ico(complete ? 'check' : 'right',13)}</span>${h(label)}${ico('right',14)}</a></li>`).join('')}</ol></aside>`;
  }
  function all() {
    const f = S.filters;
    const rows = agency().prospects.filter(listed).sort((a,b) => (b.created || '').localeCompare(a.created || ''));
    loadPlaces(rows);
    return `<div class="pr-account-layout"><section aria-label="Prospects cadastrados">
      <div class="pr-toolbar">
        <label class="pr-search-field">${ico('search')}<input data-pr-filter="query" aria-label="Buscar prospects" placeholder="Buscar prospects…" value="${h(f.query)}"></label>
        ${select('category','Categoria',[['','Todas as categorias'], ...config().categories.map(item => [item.id,item.name])],f.category,'data-pr-filter="category" aria-label="Categoria"')}
        ${select('source','Origem',[['','Todas as origens'], ...Object.entries(prospectSources)],f.source,'data-pr-filter="source" aria-label="Origem"')}
        ${select('status','Status',[['','Todos os status'], ...Object.entries(prospectLeadStatus)],f.status,'data-pr-filter="status" aria-label="Filtrar por status"')}
        ${btn(f.archived ? 'Ver ativos' : 'Arquivados','filter-archive',{name:'box',attrs:`aria-pressed="${f.archived}"`})}
      </div>
      <p class="pr-result-count" aria-live="polite">${rows.length} ${rows.length === 1 ? 'prospect' : 'prospects'}</p>
      <div class="pr-cards">${rows.length ? rows.map(row => card(shown(row))).join('') :
        empty('search',f.archived ? 'Nenhum prospect arquivado' : 'Nenhum prospect encontrado',
          active().length || f.archived ? 'Revise os termos e filtros para ver mais resultados.' : 'Busque uma empresa ou cadastre um prospect para começar.',
          f.archived || active().length ? btn('Limpar filtros','filters-clear') : link('Adicionar prospect','search',{primary:true,name:'plus'}))}</div>
      </section>${gettingStarted()}</div>`;
  }

  function osmMap() {
    const box = document.getElementById('pr-osm-map');
    const result = S.search.result;
    if (!box || box.dataset.ready || result?.provider !== 'osm' || !result.center) return;
    box.dataset.ready = '1';
    loadLeaflet().then(L => {
      if (!box.isConnected) return;
      const map = L.map(box,{scrollWheelZoom:false}).setView([result.center.lat,result.center.lon],13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© colaboradores do <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(map);
      L.circle([result.center.lat,result.center.lon],{radius:(result.radius || S.search.radius)*1000,color:'#e0007a',weight:1,fillOpacity:.04}).addTo(map);
      const points = result.rows.filter(row => Number.isFinite(row.lat) && Number.isFinite(row.lon));
      for (const row of points) {
        L.circleMarker([row.lat,row.lon],{radius:7,color:'#fff',weight:2,fillColor:row.saved ? '#0e7a43' : '#e0007a',fillOpacity:1})
          .addTo(map).bindPopup(`<strong>${h(row.name)}</strong><br>${h([row.category,row.address].filter(Boolean).join(' · '))}`);
      }
      if (points.length) map.fitBounds(points.map(row => [row.lat,row.lon]),{padding:[24,24],maxZoom:15});
    }).catch(() => { box.innerHTML = '<p class="pr-muted">Não foi possível carregar o mapa.</p>'; });
  }

  function search() {
    const s = S.search;
    const maps = data().features.prospectingMaps;
    const query = [s.keyword,s.location].filter(Boolean).join(' em ');
    const rows = s.result?.rows || [];
    const provider = s.result?.provider;
    const hasResults = provider === 'maps' || provider === 'osm';
    const formBody = `<div class="pr-search-grid">${input('keyword','Empresa ou nicho',s.keyword,'placeholder="Ex.: dentistas" required maxlength="120"')}
      ${input('location','Localização',s.location,'placeholder="Ex.: São Paulo, SP" required maxlength="140"')}
      ${select('radius','Raio',radii,s.radius)}${submit('Buscar empresas')}</div>`;
    const details = row => [row.category,address(row)].filter(Boolean).join(' · ') + (Number.isFinite(row.rating) ? ` · ★ ${row.rating}${row.reviews ? ` (${row.reviews})` : ''}` : '');
    const contacts = row => [row.phone ? `${ico('phone',13)}${h(row.phone)}` : '', safeWebsite(row.website) ? `${ico('site',13)}${h(new URL(safeWebsite(row.website)).hostname.replace(/^www\./,''))}` : ''].filter(Boolean).join(' ');
    if (provider === 'osm') setTimeout(osmMap);
    return `${panel('Buscar uma empresa',`${form('search',formBody)}<div class="pr-between">
      <p class="pr-muted">${maps ? 'Resultados do Google Maps dentro do raio selecionado.' : 'Resultados do OpenStreetMap dentro do raio selecionado.'}</p>
      <div class="pr-actions">${s.result && embed() && provider === 'maps' ? btn(s.showMap ? 'Ocultar mapa' : 'Ver mapa','map-search',{name:'pin',attrs:`aria-expanded="${s.showMap}"`}) : ''}
        ${link('Adicionar manualmente','manual',{name:'plus'})}</div></div>`)}
      ${s.showMap && embed() && provider === 'maps' ? panel('Mapa da região',mapFrame('search',query,'Google Maps da região pesquisada')) : ''}
      ${s.result ? `<section class="pr-panel"><div class="pr-between"><h2>${rows.length} ${rows.length === 1 ? 'empresa encontrada' : 'empresas encontradas'}</h2>
        ${hasResults && rows.some(row => !row.saved) ? `<div class="pr-actions">${btn('Selecionar todas','select-all',{name:'check'})}${form('save-maps',submit(`Salvar selecionados (${s.selected.size})`))}</div>` : ''}</div>
        ${provider === 'osm' && s.result.center ? '<div id="pr-osm-map" class="pr-osm-map" role="region" aria-label="Mapa dos resultados"></div>' : ''}
        ${provider === 'maps' ? '<p class="pr-maps-attribution" translate="no">Google Maps</p>' : ''}
        ${rows.length ? `<div class="pr-items">${rows.map(row => `<div class="pr-item">
          ${row.saved ? `<span class="pr-item-icon" title="Já salvo">${ico('check',14)}</span>` : `<input type="checkbox" value="${h(row.placeId)}" data-pr-map ${s.selected.has(row.placeId) ? 'checked' : ''} aria-label="Selecionar ${h(row.name)}">`}
          <div><strong>${h(row.name)}</strong><p>${h(details(row))}</p>${contacts(row) ? `<p class="pr-result-contacts">${contacts(row)}</p>` : ''}</div>
          ${row.saved ? link('Abrir prospect','detail',{id:row.saved}) : external(mapsAddress(row),'Abrir no Maps')}
        </div>`).join('')}</div>
        <p class="pr-muted">${provider === 'osm' ? 'Os dados do OpenStreetMap (nome, endereço, telefone e site, quando existirem) são salvos no prospect.' : provider === 'maps' ? 'O cadastro guarda o vínculo do Maps. Complete os dados comerciais no prospect.' : ''}</p>`
          : `<p class="pr-muted">Nenhuma empresa corresponde à busca. Tente outro termo (ex.: "odontologia") ou aumente o raio.</p>`}</section>` : ''}`;
  }

  function businessForm(row = {}) {
    return form('save',`<div class="pr-field-grid">
      ${input('name','Nome da empresa',row.name,'required maxlength="140"')}${input('website','Site',row.website,'inputmode="url" maxlength="1600" placeholder="empresa.com.br"')}
      ${input('phone','Telefone comercial',row.phone,'type="tel" maxlength="40"')}${input('category','Nicho ou segmento',row.category,'maxlength="100"')}
      ${input('address','Endereço',row.address,'maxlength="220"')}${input('country','País',row.country || 'Brasil','required maxlength="80"')}
      ${input('region','Estado',row.region,'maxlength="100"')}${input('city','Cidade',row.city,'maxlength="100"')}${input('postal','CEP',row.postal,'maxlength="24"')}
    </div>${config().categories.length ? `<fieldset class="pr-fieldset"><legend>Categorias</legend>${config().categories.map(item => checked('categories',item.name,row.categories?.includes(item.id),item.id)).join('')}</fieldset>` : ''}
      <details class="pr-contact"${row.owner || row.email || row.contactPhone ? ' open' : ''}><summary>Ponto de contato (opcional)</summary><div class="pr-field-grid">
        ${input('owner','Nome do contato',row.owner,'maxlength="120"')}${input('email','E-mail',row.email,'type="email" maxlength="240"')}${input('contactPhone','Telefone do contato',row.contactPhone,'type="tel" maxlength="40"')}
      </div></details>
      ${row.id ? '' : checked('audit','Gerar relatório de marketing',true)}
      <div class="pr-actions">${row.id ? link('Cancelar','detail',{id:row.id}) : '<button class="pr-btn" type="reset">Limpar</button>'}${submit(row.id ? 'Salvar alterações' : 'Continuar')}</div>`,row.id);
  }

  function detail(row) {
    const accountLinks = Object.entries(row.transfers).map(([key,value]) => `<li>${h(accounts().find(item => item.id === key)?.name || key)} · ${date(value.at)}${value.opportunity ? ' · Com oportunidade' : ''}</li>`);
    return `<div class="pr-detail-grid">
      ${panel('Resumo do prospect',`<div class="pr-tags">${badge(stat(row),leadStatus(row).toLowerCase())}${badge(prospectSources[row.source] || row.source)}${row.archived ? badge('Arquivado') : ''}</div>
        ${prospectFacts(row)}<p class="pr-muted">Cadastro em ${date(row.created)}${row.category ? ` · ${h(row.category)}` : ''}</p>
        <div class="pr-actions">${btn('Editar prospect','edit',{id:row.id,name:'edit'})}${row.archived ? '' : btn('Enviar ao CRM','transfer',{id:row.id,name:'send'})}</div>`)}
      ${panel('Relatório de marketing',`<p>${row.report ? `Relatório gerado em ${date(row.report.generated)}.` : 'A auditoria ainda não foi gerada.'}</p>
        <div class="pr-actions">${row.report ? link('Ver relatório','report',{id:row.id,primary:true,name:'note'}) : ''}${btn(row.report ? 'Atualizar auditoria' : 'Gerar auditoria','audit',{id:row.id,name:'sliders'})}</div>`)}
      ${panel('Ponto de contato',`<dl><dt>Nome</dt><dd>${h(row.owner || '—')}</dd><dt>E-mail</dt><dd>${h(row.email || '—')}</dd><dt>Telefone</dt><dd>${h(row.contactPhone || '—')}</dd></dl>`)}
      ${panel('Atividade no CRM',`${accountLinks.length ? `<ul>${accountLinks.join('')}</ul>` : '<p>Nenhum contato enviado a uma subconta.</p>'}
        ${!row.workspace && !row.archived && allowedSettings() ? `<button type="button" class="${cls()}" data-ag="prospect-convert" data-id="${h(row.id)}">Criar subconta a partir do prospect</button>` : ''}`)}
    </div>${panel('Notas privadas',`${form('note',textarea('text','Adicionar nota','',2400)+submit('Salvar nota'),row.id)}
      ${row.entries.length ? `<ul class="pr-notes">${row.entries.map(entry => `<li><time>${date(entry.created)}</time><p>${h(entry.text)}</p></li>`).join('')}</ul>` : '<p class="pr-muted">Nenhuma nota cadastrada.</p>'}`)}`;
  }

  function report(row) {
    if (!row.report) return empty('note','Relatório indisponível','Gere uma auditoria para abrir o relatório.',btn('Gerar auditoria','audit',{id:row.id,primary:true}));
    return `<div class="pr-report-tools pr-panel"><div><strong>Relatório de marketing</strong><p class="pr-muted">${row.shareId && !row.archived ? 'Link público ativo.' : 'Visualização privada.'}</p></div><div class="pr-actions">
      ${btn('Atualizar auditoria','audit',{id:row.id,name:'sliders'})}${btn('Exportar HTML','export',{id:row.id,name:'download'})}
      ${row.archived ? '' : btn('Compartilhar','share',{id:row.id,primary:true,name:'link'})}
      ${row.shareId ? btn('Revogar link','unshare',{id:row.id}) : ''}</div></div>${auditReport(shownReport(row),{navigation:false})}`;
  }

  function agents() {
    const list = config().agents;
    const add = btn(list.length ? 'Criar agente' : 'Criar primeiro agente','agent',{name:'plus',primary:true});
    return list.length ? panel('Agentes de prospecção',`<div class="pr-between"><p class="pr-muted">Execute uma busca usando os nichos, o raio e a região de cada agente.</p>${add}</div>
      <div class="pr-items">${list.map(agent => `<div class="pr-item"><span class="pr-item-icon">${ico('spark')}</span><div><strong>${h(agent.name)}</strong>
        <p>${h(agent.niches.join(', '))} · ${h(agent.location)} · ${agent.radius} km</p></div>
        ${btn('Editar','agent',{id:agent.id,name:'edit'})}${btn('Executar busca','run-agent',{id:agent.id,primary:true,name:'search'})}</div>`).join('')}</div>`)
      : empty('spark','Encontre prospects com o Prospect AI','Configure os nichos e a região para executar buscas com os mesmos critérios sempre que precisar.',add);
  }

  function widgets() {
    const list = config().widgets;
    const add = allowedSettings() ? btn('Criar widget','widget',{name:'plus',primary:true}) : '';
    return list.length ? panel('Widgets de captação',`<div class="pr-between"><p class="pr-muted">Envie leads do seu site diretamente para a lista de prospects.</p>${add}</div>
      <div class="pr-items">${list.map(item => `<div class="pr-item"><span class="pr-item-icon">${ico('site')}</span><div><strong>${h(item.name)}</strong><p>${h(item.headline)} · ${item.active ? 'Ativo' : 'Desativado'}</p></div>
      ${allowedSettings() ? btn('Editar','widget',{id:item.id,name:'edit'}) : ''}${item.active ? `${external(`/prospecting/widget/${item.id}`,'Abrir formulário')}${btn('Incorporar','embed',{id:item.id,name:'link'})}` : ''}</div>`).join('')}</div>`)
      : empty('site','Widgets de captação','Crie um formulário personalizado para incorporar no seu site.',add);
  }

  function builder() {
    const brand = config().brand;
    const sample = {generated:new Date().toISOString(),brand,sections:config().sections,business:{name:'Empresa de exemplo',rating:null},signals:{}};
    const fields = `<div class="pr-field-grid">${input('title','Título do relatório',brand.title,'required maxlength="100"')}${select('theme','Cor do relatório',Object.entries(prospectThemes),brand.theme)}</div>
      ${textarea('intro','Introdução',brand.intro,600)}${textarea('footer','Rodapé',brand.footer,300)}`;
    return `<div class="pr-detail-grid pr-builder">
      ${panel('Aparência do relatório',allowedSettings() ? form('brand',fields+submit('Salvar aparência')) : `<p>${h(brand.title)} · ${h(prospectThemes[brand.theme])}</p>`)}
      <section aria-label="Prévia do relatório"><h2>Prévia</h2>${auditReport(sample,{navigation:false})}</section>
    </div>`;
  }

  function analytics() {
    const now = new Date();
    const periods = Array.from({length:S.months},(_, index) => {
      const day = new Date(now.getFullYear(),now.getMonth()-S.months+index+1,1);
      return {
        key:`${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}`,
        label:new Intl.DateTimeFormat('pt-BR',{month:'short',year:'2-digit'}).format(day)
      };
    });
    const start = periods[0].key;
    const isIn = value => value && value.slice(0,7) >= start;
    const rows = agency().prospects;
    const created = rows.filter(row => isIn(row.created));
    const generated = reports().filter(row => isIn(row.report.generated));
    const widgetCount = created.filter(row => row.source === 'Widget').length;
    const won = created.filter(row => leadStatus(row) === 'Won').length;
    const views = row => Object.entries(row.views).reduce((sum,[key,value]) => sum+(isIn(key) ? value : 0),0);
    const top = rows.map(row => [row,views(row)]).filter(([, count]) => count).sort((a,b) => b[1]-a[1]);
    const metrics = [
      ['Relatórios gerados',generated.length],['Taxa de conversão',`${created.length ? Math.round(won/created.length*100) : 0}%`],
      ['Leads captados por widget',widgetCount],['Visualizações dos relatórios',top.reduce((sum,[,count]) => sum+count,0)]
    ];
    const bars = periods.map(item => {
      const byMonth = created.filter(row => row.created.startsWith(item.key));
      const widgets = byMonth.filter(row => row.source === 'Widget').length;
      return {...item,widgets,others:byMonth.length-widgets};
    });
    const max = Math.max(1,...bars.map(item => item.widgets+item.others));
    return `<div class="pr-between"><h2>Desempenho da prospecção</h2>
      ${select('period','Período',[1,3,6,12].map(n => [n,n === 1 ? 'Este mês' : `Últimos ${n} meses`]),S.months,'data-pr-months')}</div>
      <div class="pr-metrics">${metrics.map(([label,value]) => `<article class="pr-panel"><p>${label}</p><b>${value}</b></article>`).join('')}</div>
      ${panel('Novos prospects por mês',`<div class="pr-legend">${badge('Prospecção','category')}${badge('Widgets','won')}</div><div class="pr-bars">
        ${bars.map(item => `<div><span>${h(item.label)}</span><div class="pr-bar-track"><span data-w="${item.others/max*100}"></span><span data-w="${item.widgets/max*100}"></span></div>
        <b>${item.others} + ${item.widgets}</b></div>`).join('')}</div>`)}
      ${panel('Relatórios mais vistos',top.length ? `<div class="pr-items">${top.slice(0,8).map(([row,count]) => `<div class="pr-item"><div><a href="${route('report',row.id)}">${h(row.name)}</a></div><strong>${count} ${count === 1 ? 'visualização' : 'visualizações'}</strong></div>`).join('')}</div>`
        : '<p class="pr-muted">Nenhuma visualização pública registrada no período.</p>')}`;
  }

  function settings() {
    const rows = S.sections || config().sections;
    return panel('Configurações do relatório',`<p>Escolha as seções e a ordem para as próximas auditorias.</p>
      ${form('sections',`<div class="pr-items">
        ${rows.map(({key,visible},index) => `<div class="pr-item">${checked('visible',prospectSections[key],visible,key)}
          ${allowedSettings() ? `<div class="pr-actions">${btn('Mover para cima','section-step',{id:key,hide:true,name:'upload',attrs:`data-step="-1" ${index === 0 ? 'disabled' : ''}`})}
          ${btn('Mover para baixo','section-step',{id:key,hide:true,name:'download',attrs:`data-step="1" ${index === rows.length-1 ? 'disabled' : ''}`})}</div>` : ''}</div>`).join('')}
      </div>${allowedSettings() ? submit('Salvar seções') : ''}`)}
      ${link('Migrar prospects','migrate',{name:'send'})}`);
  }
  function transferFields() {
    return select('workspace','Subconta de destino',[['','Selecione uma subconta'], ...destinations().map(item => [item.id,item.name])],'','required') +
      (!data().access.modules || data().access.modules.includes('opportunities') ? checked('opportunity','Criar também uma oportunidade') : '');
  }
  function migrate() {
    const rows = active();
    if (!rows.length || !destinations().length) return empty('send','Migrar prospects',
      rows.length ? 'Nenhuma subconta está disponível para receber contatos.' : 'Adicione prospects antes de migrar para uma subconta.',link(rows.length ? 'Subcontas' : 'Adicionar prospect',rows.length ? 'all' : 'search'));
    return panel('Migrar prospects',`<p>Selecione os prospects para enviar os contatos e, se desejar, criar oportunidades na subconta.</p>
      ${form('transfer',`<div class="pr-item-fields">${transferFields()}</div><fieldset class="pr-fieldset pr-choices"><legend>Prospects ativos</legend>
        ${rows.map(row => checked('ids',row.name,false,row.id)).join('')}</fieldset>${submit('Enviar ao CRM')}`)}`);
  }

  function categories() {
    const list = config().categories;
    dialog('Categorias dos prospects',`<div class="pr-category-list">${list.length ? list.map(item => `<div class="pr-item"><div><strong>${h(item.name)}</strong>
      <p>${active().filter(row => row.categories.includes(item.id)).length} prospects ativos</p></div>
      ${btn('Editar categoria','category',{id:item.id,hide:true,name:'edit'})}${btn('Excluir categoria','category-delete',{id:item.id,hide:true,name:'trash'})}</div>`).join('')
      : '<p class="pr-muted">Crie sua primeira categoria para organizar a lista de prospects.</p>'}</div>
      <div class="pr-actions">${btn('Nova categoria','category',{primary:true,name:'plus'})}${list.length && active().length ? btn('Aplicar a prospects','categorize',{name:'tag'}) : ''}</div>`,{wide:true});
  }

  function view(page) {
    const id = location.hash.split('/')[3] || '';
    const row = lookup(id);
    const key = page || 'all';
    if (row && ['detail','report'].includes(key)) loadPlaces([row]);
    const selected = ['search','manual','detail','report'].includes(key) ? 'all' : key === 'migrate' ? 'settings' : key;
    const titles = {
      all:'Contas de prospecção', search:'Adicionar prospect', manual:row ? 'Editar prospect' : 'Adicionar prospect manualmente',
      detail:shown(row)?.name || 'Prospect indisponível', report:shown(row)?.name || 'Relatório indisponível',
      ai:'Prospect AI',widgets:'Widgets',builder:'Editor de relatórios',analytics:'Analytics',settings:'Configurações',migrate:'Migrar prospects'
    };
    const views = {all,search,manual:() => businessForm(row),detail:() => detail(shown(row)),report:() => report(row),ai:agents,widgets,builder,analytics,settings,migrate};
    const back = key === 'report' && row ? ['Detalhes do prospect','detail',row.id] : key === 'manual' && row ? ['Detalhes do prospect','detail',row.id]
      : key === 'manual' ? ['Adicionar prospect','search'] : key === 'migrate' ? ['Configurações','settings'] : ['Todas as contas','all'];
    const isNested = ['search','manual','detail','report','migrate'].includes(key);
    const existingRequired = ['detail','report'].includes(key) || (key === 'manual' && id);
    return pageShell({
      title: h(titles[key]),
      back: isNested ? `<a class="page-back" href="${route(back[1],back[2])}">${ico('left',15)}${back[0]}</a>` : '',
      desc: key === 'all' ? `${active().length} ${active().length === 1 ? 'prospect ativo' : 'prospects ativos'} · ${reports().length} ${reports().length === 1 ? 'relatório gerado' : 'relatórios gerados'}` : 'Encontre, audite e converta novos clientes para sua agência.',
      cta: key === 'all' ? `${btn('Categorizar','categories',{name:'tag'})}${link('Adicionar prospect','search',{primary:true,name:'plus'})}` : '',
      className: 'pr-page',
      tabs: {
        key: 'agency-prospecting',
        label: 'Seções de prospecção',
        current: selected,
        items: tabs.map(([name, label]) => ({ value: name, label, href: route(name) }))
      },
      content: `<div class="pr-content">${existingRequired && !row ? empty('inbox','Prospect indisponível','Abra a lista para localizar um prospect cadastrado.',link('Todas as contas','all')) : views[key]()}</div>`
    });
  }

  async function copy(value,inputNode) {
    try { await navigator.clipboard.writeText(value); flash('Copiado.'); }
    catch {
      if (inputNode) { inputNode.focus(); inputNode.select(); }
      else copyBox('Copiar valor',value,'Valor');
    }
  }
  function auditDialog(row) {
    const manual = auditAreas.some(([key]) => Number.isFinite(row[`score_${key}`]));
    openForm('audit','Auditoria de marketing',`<p>A graao analisa o site (velocidade pelo Google PageSpeed, SEO, segurança e LGPD), as ferramentas de marketing, as redes sociais e o perfil no Google. Leva até um minuto.</p>
      ${row.website ? '' : '<p class="pr-muted">Sem site cadastrado: usaremos o site do perfil no Google, se houver.</p>'}
      <details class="pr-contact"${manual ? ' open' : ''}><summary>Ajustes manuais (opcional)</summary><p class="pr-muted">Uma nota de 0 a 10 substitui a nota automática do pilar. Deixe em branco para usar a automática.</p>
      <div class="pr-field-grid">${auditAreas.map(([key,label]) => input(`score_${key}`,label,row[`score_${key}`] ?? '', 'type="number" step="0.1" min="0" max="10"')).join('')}</div></details>`,{id:row.id,label:'Gerar auditoria'});
  }
  function widgetDialog(id) {
    const item = config().widgets.find(row => row.id === id) || {};
    openForm('widget',id ? 'Editar widget' : 'Criar widget',`<div class="pr-field-grid">
      ${input('name','Nome interno',item.name,'required maxlength="80"')}${input('headline','Título do formulário',item.headline,'required maxlength="110"')}
      ${input('button','Texto do botão',item.button || 'Enviar','maxlength="50"')}${select('theme','Cor',Object.entries(prospectThemes),item.theme || 'blue')}</div>
      ${textarea('description','Descrição',item.description,500)}<div class="pr-fieldset">
      ${checked('askPhone','Pedir telefone',item.askPhone)}${checked('audit','Gerar relatório para o prospect',item.audit)}${checked('active','Habilitar formulário',item.active ?? true)}</div>`,{id});
  }
  function agentDialog(id) {
    const item = config().agents.find(row => row.id === id) || {};
    openForm('agent',id ? 'Editar agente' : 'Criar agente',`<div class="pr-field-grid">
      ${input('name','Nome do agente',item.name,'required maxlength="90"')}${input('niches','Até três nichos, separados por vírgulas',item.niches?.join(', '),'required maxlength="400"')}
      ${input('location','Localização',item.location,'required maxlength="140"')}${select('radius','Raio',radii,item.radius || 5)}</div>`,{id});
  }
  async function runSearch(body,agent = '') {
    const result = await call('prospecting-search',agent ? {agent} : body);
    Object.assign(S.search,body,{result,agent,showMap:false,selected:new Set()});
    go('search');
  }
  function moveSection(id,step) {
    const rows = [...(S.sections || config().sections)].map(item => ({...item}));
    for (const box of document.querySelectorAll('[data-pr-form="sections"] input[name=visible]')) {
      rows.find(item => item.key === box.value).visible = box.checked;
    }
    const index = rows.findIndex(item => item.key === id);
    const target = index + step;
    if (index < 0 || !rows[target]) return;
    [rows[index],rows[target]] = [rows[target],rows[index]];
    S.sections = rows;
    render();
    [...document.querySelectorAll('[data-pr="section-step"]')].find(node => node.dataset.id === id && Number(node.dataset.step) === step && !node.disabled)?.focus();
  }
  document.addEventListener('click', async event => {
    if (!inside()) return;
    const button = event.target.closest('[data-pr]');
    if (!button || button.disabled) return;
    const {pr,id,step} = button.dataset;
    const row = lookup(id);
    button.disabled = true;
    try {
      switch (pr) {
        case 'filter-archive': S.filters.archived = !S.filters.archived; render(); break;
        case 'filters-clear': S.filters = {query:'',category:'',source:'',status:'',archived:false}; render(); break;
        case 'map-search':
          S.search.showMap = !S.search.showMap;
          render();
          document.querySelector('[data-pr="map-search"]')?.focus();
          break;
        case 'select-all':
          for (const row of S.search.result?.rows || []) if (!row.saved) S.search.selected.add(row.placeId);
          render();
          break;
        case 'map-place':
          if (row && embed()) {
            const query = row.placeId ? 'place_id:' + row.placeId : address(row);
            dialog('Google Maps',mapFrame('place',query,`Localização de ${row.name}`),{wide:true});
          }
          break;
        case 'edit': go('manual',id); break;
        case 'audit': if (row) auditDialog(row); break;
        case 'archive': case 'restore':
          openForm(pr,pr === 'archive' ? 'Arquivar prospect' : 'Restaurar prospect',`<p>${h(row.name)}</p>`,{id,label:pr === 'archive' ? 'Arquivar' : 'Restaurar'}); break;
        case 'categories': categories(); break;
        case 'category': {
          const item = config().categories.find(item => item.id === id);
          openForm('category',id ? 'Editar categoria' : 'Nova categoria',input('name','Nome da categoria',item?.name,'required maxlength="70"'),{id}); break;
        }
        case 'category-delete':
          openForm('category-delete','Excluir categoria','<p>A categoria será removida de todos os prospects vinculados.</p>',{id,label:'Excluir'}); break;
        case 'categorize': openForm('categorize','Aplicar categoria',
          select('category','Categoria',config().categories.map(item => [item.id,item.name]),'','required')+
          `<fieldset class="pr-fieldset pr-choices"><legend>Prospects ativos</legend>${active().map(item => checked('ids',item.name,false,item.id)).join('')}</fieldset>`,{label:'Aplicar',wide:true}); break;
        case 'transfer':
          if (destinations().length) openForm('transfer','Enviar ao CRM',transferFields(),{id,label:'Enviar'});
          else flash('Nenhuma subconta disponível para receber contatos.',true);
          break;
        case 'share': {
          const token = row.shareId || await act('share',id);
          render();
          const url = new URL(`/prospecting/report/${token}`,location.origin).href;
          dialog('Compartilhar relatório',`<div class="pr-copy"><label>Link público<input readonly data-pr-copy-value value="${h(url)}"></label>
            ${btn('Copiar','copy-field',{name:'link'})}</div><p>${external(url,'Abrir relatório público')}</p>`,{wide:true});
          break;
        }
        case 'unshare': openForm('unshare','Revogar link público','<p>O link atual deixará de abrir o relatório.</p>',{id,label:'Revogar'}); break;
        case 'export': download(`${slug(shown(row))}-auditoria.html`,offlineReportHtml(shownReport(row)),'text/html;charset=utf-8'); break;
        case 'copy-phone': if (row?.phone) await copy(row.phone); break;
        case 'copy-field': {
          const node = button.closest('.pr-copy').querySelector('[data-pr-copy-value]');
          await copy(node.value,node); break;
        }
        case 'agent': agentDialog(id); break;
        case 'run-agent': {
          const item = config().agents.find(item => item.id === id);
          if (item) await runSearch({keyword:item.niches.join(', '),location:item.location,radius:item.radius},id);
          break;
        }
        case 'widget': widgetDialog(id); break;
        case 'embed': {
          const item = config().widgets.find(row => row.id === id);
          const url = new URL(`/prospecting/widget/${id}`,location.origin);
          copyBox('Incorporar widget',`<iframe src="${url.href}" title="${h(item.headline)}" width="100%" height="560" style="border:0" loading="lazy"></iframe>`,'Código de incorporação'); break;
        }
        case 'section-step': moveSection(id,Number(step)); break;
      }
    } catch (error) { flash(error.message,true); }
    finally { if (button.isConnected) button.disabled = false; }
  });
  document.addEventListener('change', async event => {
    if (!inside()) return;
    const node = event.target;
    const {prStatus,prFilter,prMonths} = node.dataset;
    if (prStatus) {
      node.disabled = true;
      try { await act('status',prStatus,{value:node.value}); flash('Status atualizado.'); }
      catch (error) { flash(error.message,true); }
      render();
    } else if (prFilter && node.tagName === 'SELECT') {
      S.filters[prFilter] = node.value;
      render();
      document.querySelector(`[data-pr-filter="${prFilter}"]`)?.focus();
    } else if (prMonths !== undefined) {
      S.months = Number(node.value);
      render();
      document.querySelector('[data-pr-months]')?.focus();
    } else if (node.hasAttribute('data-pr-map')) {
      if (node.checked) S.search.selected.add(node.value);
      else S.search.selected.delete(node.value);
      const save = document.querySelector('[data-pr-form="save-maps"] button');
      if (save) save.textContent = `Salvar selecionados (${S.search.selected.size})`;
    }
  });
  document.addEventListener('input', event => {
    if (!inside() || event.target.dataset.prFilter !== 'query') return;
    const {value,selectionStart,selectionEnd} = event.target;
    S.filters.query = value;
    render();
    const node = document.querySelector('[data-pr-filter="query"]');
    node?.focus();
    node?.setSelectionRange(selectionStart,selectionEnd);
  });
  document.addEventListener('submit', async event => {
    const node = event.target;
    const type = node.dataset.prForm;
    if (!inside() || !type) return;
    event.preventDefault();
    if (node.dataset.pending) return;
    const fd = new FormData(node);
    const body = Object.fromEntries(fd);
    const id = node.dataset.id;
    const button = node.querySelector('button:not([type]), button[type=submit]');
    const status = node.querySelector('.form-status');
    node.dataset.pending = 'true';
    if (button) button.disabled = true;
    if (status) status.textContent = type === 'audit' || (type === 'save' && fd.has('audit')) ? 'Analisando o site e o perfil no Google… isso pode levar até um minuto.' : '';
    try {
      if (type === 'search') { await runSearch(body); return; }
      let result;
      if (type === 'save') result = await act(type,id,{...body,categories:fd.getAll('categories')});
      else if (type === 'archive' || type === 'restore') await act('archive',id,{archived:type === 'archive'});
      else if (type === 'categorize') await act(type,id,{...body,ids:fd.getAll('ids')});
      else if (type === 'transfer') {
        result = await call('prospecting-transfer',{workspace:body.workspace,opportunity:fd.has('opportunity'),ids:id ? [id] : fd.getAll('ids')});
      } else if (type === 'sections') {
        await act(type,id,{order:(S.sections || config().sections).map(item => item.key),visible:fd.getAll('visible')});
        S.sections = null;
      } else if (type === 'save-maps') {
        result = await act(type,id,{placeIds:[...S.search.selected],fromAI:Boolean(S.search.agent)});
        S.search.result = null;
        S.search.selected.clear();
      } else await act(type,id,body);
      if (node.closest('dialog')) close();
      if (type === 'save') go('detail',result);
      else if (type === 'audit') go('report',id);
      else if (type === 'save-maps') go('all');
      else render();
      if (type === 'category' || type === 'category-delete') categories();
      flash(type === 'transfer' ? `${result.length} ${result.length === 1 ? 'prospect enviado' : 'prospects enviados'} ao CRM.` :
        type === 'save-maps' ? `${result.length} ${result.length === 1 ? 'prospect salvo' : 'prospects salvos'}.` : 'Alterações salvas.');
    } catch (error) { if (status) status.textContent = error.message; else flash(error.message,true); }
    finally { delete node.dataset.pending; if (button?.isConnected) button.disabled = false; }
  });
  return {render:view};
}
