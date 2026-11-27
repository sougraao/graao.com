import { icon } from './icons.js';
import { h, fmt, tabs } from './screens.js';
import { tr } from './i18n.js';
import { reportWidget } from './dashboard.js';
import { dashboardPeriods, dashboardThemes, dateFields, newWidget, widgetText, widgets } from './dashboard-data.js';
import { newPage, reportCsv, reportPeriod, reportRange, reportTemplates } from './report-data.js';
import { ask } from './ask.js';

const uid = () => crypto.randomUUID();
const button = (action,label,mark='',attributes='',kind='secondary') => `<button type="button" class="${kind}" data-report-act="${action}" ${attributes}>${mark ? icon(mark,16) : ''}${h(label)}</button>`;
const iconButton = (action,label,mark,attributes='') => button(action,'',mark,`aria-label="${h(label)}" title="${h(label)}" ${attributes}`,'icon-btn');
const formButtons = label => `<button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">${label}</button>`;
const option = (value,label,selected) => `<option value="${h(value)}" ${value === selected ? 'selected' : ''}>${h(label)}</option>`;
const select = (label,name,choices,selected) => `<label>${label}<select name="${name}">${choices.map(([value,text])=>option(value,text,selected)).join('')}</select></label>`;
const field = (label,name,value,attributes='') => `<label>${label}<input name="${name}" value="${h(value)}" ${attributes}></label>`;
const paragraph = (label,name,value,max) => `<label>${label}<textarea name="${name}" maxlength="${max}" rows="5">${h(value)}</textarea></label>`;
const fold = value => value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
const link = (label,hash,kind='secondary') => `<a class="${kind}" href="#reporting${hash}">${label}</a>`;
const recommended = ['status','value','conversion','funnel','distribution','tasks'];

function savedReport(c) {
  return c.s.customReports.find(item => item.id === c.reportId);
}
function editorState(c) {
  const report = savedReport(c);
  if (!report) return null;
  const key = `${c.workspace}/${report.id}`;
  if (c.reportDraft?.key !== key) c.reportDraft = { key, report:structuredClone(report), page:report.pages[0].id, dirty:false, preview:false };
  return c.reportDraft;
}
const activePage = draft => draft.report.pages.find(page => page.id === draft.page) || draft.report.pages[0];
export const reportingSections = [['reports','Relatórios'],['attribution','Atribuição'],['google-ads','Google Ads'],['meta-ads','Meta Ads'],['overview','Visão geral'],['calls','Ligações'],['snapshots','Relatórios do painel']];

export function reportList(c) {
  const all = [...c.s.customReports].sort((a,b)=>b.updated.localeCompare(a.updated));
  const matches = all.filter(row => fold(row.name).includes(fold(c.query.trim())));
  const add = link(`${icon('plus',16)} Novo relatório`,'/new','primary');
  const results = all.length ? `<div class="toolbar"><label class="search">${icon('search',16)}<input id="page-search" value="${h(c.query)}" 
      placeholder="Buscar relatórios…" aria-label="Buscar relatórios" autocomplete="off"></label><span class="dim">${matches.length} relatório(s)</span></div>
    <div class="surface table-shell"><table><thead><tr><th>Nome</th><th>Páginas</th><th>Última edição</th><th>Ações</th></tr></thead>
    <tbody>${matches.map(item=>`<tr><td>${link(h(item.name),`/editor/${item.id}`,'text-link')}</td><td>${item.pages.length}</td><td>${fmt(item.updated,c.s.profile.timezone,true)}</td>
    <td><div class="report-actions">${iconButton('share','Compartilhar e agendar envio','link',`data-id="${item.id}"`)}${item.share ? `<span class="badge ${item.schedule ? 'green' : 'blue'}">${item.schedule ? 'Envio agendado' : 'Link ativo'}</span>` : ''}${iconButton('clone','Duplicar','copy',`data-id="${item.id}"`)}${iconButton('delete','Excluir','trash',`data-id="${item.id}"`)}</div></td></tr>`).join('')}</tbody></table>
    ${matches.length ? '' : '<p class="report-no-results">Nenhum relatório corresponde à busca.</p>'}</div>` :
    `<section class="surface report-empty"><div class="report-empty-art" aria-hidden="true">${icon('chart',36)}${icon('list',26)}</div>
    <h2>Crie seu primeiro relatório</h2><p>Monte páginas com métricas e comentários do seu workspace.</p>
    <div class="report-actions">${link('Criar relatório','/new','primary')}<a class="secondary" href="#dashboard">Explorar painéis</a></div></section>`;
  return `<div class="page"><header class="page-head"><div><h1>Relatórios</h1></div>${add}</header>${tabs(reportingSections,'reports')}${results}</div>`;
}

export function reportSources(c) {
  const source = (key,mark,title,detail,disabled=false) => `<article class="surface report-source">
    <span class="metric-icon">${icon(mark,23)}</span><h2>${title}</h2><p>${detail}</p>
    ${button('create',key === 'clone' ? 'Duplicar' : 'Selecionar','',`data-source="${key}" ${disabled ? 'disabled' : ''}`)}</article>`;
  return `<div class="page report-sources"><header class="page-head"><div>${link('Voltar aos relatórios','','text-link')}<h1>Novo relatório</h1></div></header>
    <h2>Origem do relatório</h2><div class="report-source-grid">
      ${source('blank','note','Relatório em branco','Comece com uma página vazia.')}
      ${source('template','grid','Biblioteca de modelos','Use métricas organizadas por objetivo.')}
      ${source('clone','copy','Duplicar relatório','Use um relatório existente como base.',!c.s.customReports.length)}
      ${source('dashboard','chart','Importar de um painel','Copie os widgets de um painel da Graao.',!c.s.dashboards.length)}
    </div></div>`;
}

function pageMarkup(c,draft,page,number,range) {
  const {report, preview} = draft;
  return `<section class="report-paper" aria-label="${h(page.name)}">
    <header class="report-paper-header"><div><span>${h(report.name)}</span><h2>${h(page.name)}</h2></div><span>${h(reportPeriod(report,range))}</span></header>
    <div class="report-widget-grid">${page.widgets.map((widget,index)=>`<section class="report-widget dash-card dash-w${widget.width}" data-report-drop="${widget.id}">
      ${widget.kind !== 'heading' || !preview ? `<header ${preview ? '' : `draggable="true" data-report-drag="${widget.id}"`}><h3>${h(widget.kind === 'heading' ? 'Título' : tr(widget.title))}</h3>
      ${preview ? '' : `<div class="report-actions">
        ${iconButton('widget-up','Mover para antes','left',`data-id="${widget.id}" ${index === 0 ? 'disabled' : ''}`)}
        ${iconButton('widget-down','Mover para depois','right',`data-id="${widget.id}" ${index === page.widgets.length-1 ? 'disabled' : ''}`)}
        ${iconButton('widget-edit','Configurar elemento','edit',`data-id="${widget.id}"`)}
        ${iconButton('widget-remove','Remover elemento','trash',`data-id="${widget.id}"`)}</div>`}</header>` : ''}
      <div class="dash-card-body">${reportWidget(c.s,widget,range,report.period)}</div></section>`).join('')}</div>
    ${!preview && !page.widgets.length ? `<div class="report-blank"><h3>Adicione o primeiro elemento desta página</h3>
      ${button('library','Adicionar widget ou elemento','plus','','primary')}
      <div class="report-suggestions">${recommended.map(kind=>button('widget-add',tr(widgets[kind].title),'plus',`data-id="${kind}"`)).join('')}</div></div>` : ''}
    <footer class="report-paper-footer">${number}</footer></section>`;
}

export function reportEditor(c) {
  const draft = editorState(c);
  if (!draft) return `<div class="page"><h1>Relatório indisponível</h1>${link('Voltar aos relatórios','','text-link')}</div>`;
  const {report, preview, dirty} = draft;
  const range = reportRange(c.s,report);
  const page = activePage(draft);
  const pages = preview ? report.pages : [page];
  const accent = (dashboardThemes[report.theme] || dashboardThemes.default)[1];
  const cover = preview && report.cover ? `<section class="report-paper report-cover"><h2>${h(report.name)}</h2>
    <p>${h(reportPeriod(report,range))}</p>${report.summary ? `<div class="report-summary">${h(report.summary)}</div>` : ''}</section>` : '';
  return `<div class="page report-editor" style="--report-accent:${accent};--dash-accent:${accent}">
    <header class="report-editor-toolbar"><div class="report-editor-title">${button('back','Voltar','left')}<h1>${h(report.name)}</h1>
      ${preview ? '' : iconButton('properties','Editar relatório','edit')}</div>
      <div class="report-actions">${dirty ? '<span class="dim">Alterações pendentes</span>' : ''}
        ${button('preview',preview ? 'Editar' : 'Visualizar',preview ? 'edit' : 'site')}
        ${button('share','Compartilhar','link',`data-id="${report.id}"`)}${button('export','Exportar CSV','download')}${button('print','Imprimir / PDF','download')}
        ${button('save','Salvar','check',dirty ? '' : 'disabled','primary')}
      </div></header>
    <div class="report-layout ${preview ? 'report-preview' : ''}">
      ${preview ? '' : `<aside class="surface report-pages"><h2>Páginas</h2><ol>${report.pages.map(item=>`<li>
        ${button('page-open',item.name,'note',`data-id="${item.id}" aria-pressed="${item.id === page.id}"`)}
      </li>`).join('')}</ol>${button('page-add','Adicionar página','plus',report.pages.length >= 20 ? 'disabled' : '')}</aside>`}
      <div class="report-document">
        ${preview ? '' : `<div class="report-paper-tools report-actions">${button('library','Adicionar widget ou elemento','plus')}
          ${button('properties',dashboardPeriods[report.period],'cal')}
          ${button('page-properties','Configurar página','sliders')}</div>`}
        ${cover}
        ${preview && !report.cover && report.summary ? `<div class="surface report-summary report-summary-inline">${h(report.summary)}</div>` : ''}
        ${pages.map(item=>pageMarkup(c,draft,item,report.pages.indexOf(item)+1,range)).join('')}
      </div></div></div>`;
}

const weekdayNames = ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
const shareActive = report => Boolean(report?.share?.id && (!report.share.expires || Date.parse(report.share.expires) > Date.now()));

// Share link + e-mail schedule of one saved report. Both act on the saved record, not the draft.
function shareMarkup(c, report) {
  const zone = c.s.profile.timezone, active = shareActive(report), s = report.schedule;
  const link = active ? `${location.origin}/relatorio/${c.workspace}/${report.share.id}` : '';
  const message = `Segue o relatório “${report.name}”${c.s.profile.name ? ` de ${c.s.profile.name}` : ''}, com os dados atualizados: ${link}`;
  const shareForm = `<form data-form="report:share" data-id="${h(report.id)}" class="report-share-form">
    <h3>Link público</h3>
    <p class="dim">Qualquer pessoa com o link vê este relatório com os dados atuais, sem login e sem acesso ao restante da conta. Edições salvas aparecem no link na hora.</p>
    ${active ? `<label>Link do relatório<input name="shareUrl" value="${h(link)}" readonly></label>
      <p class="dim">${report.share.expires ? `Válido até ${fmt(report.share.expires,zone,true)}` : 'Sem data de validade'} · idioma ${report.share.lang === 'es' ? 'espanhol' : 'português'}. Gerar outro invalida o link anterior.</p>
      <div class="report-actions">${button('share-copy','Copiar link','copy')}<a class="secondary" href="${h(link)}" target="_blank" rel="noopener">${icon('site',16)}Abrir</a>
        <a class="secondary" href="https://wa.me/?text=${encodeURIComponent(message)}" target="_blank" rel="noopener">${icon('whatsapp',16)}WhatsApp</a>
        <a class="secondary" href="mailto:?subject=${encodeURIComponent(report.name)}&body=${encodeURIComponent(message)}">${icon('mail',16)}E-mail</a></div>` : ''}
    <div class="field-grid">${select('Validade','days',[['7','7 dias'],['30','30 dias'],['90','90 dias'],['0','Sem validade']],'30')}${select('Idioma do relatório','lang',[['pt','Português'],['es','Español']],report.share?.lang || 'pt')}</div>
    <p class="form-status" role="alert"></p>
    <footer class="report-share-foot">${active ? button('share-revoke','Revogar link','close',`data-id="${h(report.id)}"`) : ''}<span class="spacer"></span><button class="primary">${active ? 'Gerar novo link' : 'Gerar link'}</button></footer></form>`;
  const scheduleForm = `<form data-form="report:schedule" data-id="${h(report.id)}" class="report-share-form">
    <h3>Envio automático por e-mail</h3>
    <p class="dim">A Graao envia o link do relatório para os e-mails escolhidos, no fuso ${h(zone)}. Se ainda não houver link, um link sem validade é criado.</p>
    ${c.features?.reportEmail ? '' : '<p class="report-share-warn">O envio por e-mail ainda não está configurado no servidor (RESEND_API_KEY, PORTAL_EMAIL_FROM e PORTAL_PUBLIC_ORIGIN). O agendamento fica salvo e começa a enviar quando a configuração existir.</p>'}
    ${s ? `<p class="dim">${s.lastSent ? `Último envio: ${fmt(s.lastSent,zone,true)}.` : 'Ainda não enviado.'}${s.lastError ? ` <span class="report-share-error">Falha no último envio: ${h(s.lastError)}</span>` : ''}</p>` : ''}
    <div class="field-grid">${select('Frequência','frequency',[['weekly','Toda semana'],['monthly','Todo mês']],s?.frequency || 'weekly')}
      ${select('Dia da semana','weekday',weekdayNames.map((name,n)=>[String(n),name]),String(s?.weekday ?? 1))}
      ${field('Dia do mês (1–28)','monthday',s?.monthday ?? 1,'type="number" min="1" max="28"')}${field('Horário','time',s?.time || '09:00','type="time" required')}</div>
    <label>E-mails (até 10, separados por vírgula)<textarea name="recipients" rows="2" required placeholder="cliente@empresa.com, gerente@empresa.com">${h((s?.recipients || []).join(', '))}</textarea></label>
    ${paragraph('Mensagem no e-mail (opcional)','message',s?.message || '',1000)}
    <p class="form-status" role="alert"></p>
    <footer class="report-share-foot">${s ? button('schedule-remove','Cancelar agendamento','trash',`data-id="${h(report.id)}"`) : ''}<span class="spacer"></span><button class="primary">${s ? 'Salvar agendamento' : 'Agendar envio'}</button></footer></form>`;
  return `<div class="report-share">${shareForm}${scheduleForm}</div>`;
}

export function installReports({ c, dialog, close, render, mutate, flash, download }) {
  const open = (title,body,form,id='',submit='Aplicar') => dialog(title,body,{ form:`report:${form}`,id,buttons:formButtons(submit) });
  const shareDialog = id => {
    const report = c.s.customReports.find(item => item.id === id);
    if (report) dialog('Compartilhar relatório', shareMarkup(c,report), { description: report.name });
  };
  const redraw = () => render();
  const update = (draft,change) => { change(); draft.dirty=true; redraw(); };
  const nameInput = name => field('Nome do relatório','name',name,'required maxlength="100"');
  const pageChoice = (kind,id) => {
    const sources = kind === 'template' ? Object.entries(reportTemplates).map(([key,template])=>[key,template.title]) :
      (kind === 'clone' ? c.s.customReports : c.s.dashboards).map(item=>[item.id,tr(item.name)]);
    const selection = sources.find(([key])=>key === id) || sources[0];
    const label = { template:'Modelo', clone:'Relatório', dashboard:'Painel' }[kind];
    open('Novo relatório',`<input type="hidden" name="source" value="${h(kind)}">${kind === 'blank' ? '' :
      select(label,'sourceId',sources,selection?.[0])}${nameInput(selection && kind !== 'blank' ? `${selection[1]}${kind === 'clone' ? ' · cópia' : ''}` : '')}`,'create','','Criar relatório');
  };
  const widgetForm = (kind,current) => {
    const definition = widgets[kind];
    const widget = current || newWidget(kind,uid());
    const content = ['heading','text','note'].includes(kind);
    open(current ? 'Configurar elemento' : 'Adicionar elemento',
      `<input type="hidden" name="kind" value="${h(kind)}">${field('Título','title',tr(widget.title),'required maxlength="100"')}
      ${select('Largura','width',[[3,'Um quarto'],[4,'Um terço'],[5,'Cinco colunas'],[6,'Metade'],[8,'Dois terços'],[12,'Página inteira']],widget.width)}
      ${definition.pipeline ? select('Pipeline','pipeline',[['','Todos os pipelines'],...c.s.pipelines.map(row=>[row.id,row.name])],widget.pipeline)+
        select('Data de referência','dateField',Object.entries(dateFields),widget.dateField) : ''}
      ${content ? paragraph('Texto','note',widget.note,kind === 'heading' ? 200 : 2000) : ''}
      ${definition.url ? field('Endereço HTTPS','url',widget.url,'type="url" required maxlength="2000"') : ''}`,
      'widget',current?.id || '');
  };
  const library = () => {
    const items = Object.entries(widgets).filter(([,definition]) => !definition.provider);
    dialog('Adicionar widget ou elemento',`<label>Buscar na biblioteca<input type="search" data-report-search placeholder="Nome do widget…" autocomplete="off"></label>
      <div class="report-library">${items.map(([kind,definition])=>`<button type="button" class="secondary" data-report-act="widget-add" data-id="${h(kind)}"
      data-report-term="${h(fold(`${tr(definition.title)} ${widgetText[kind] || ''}`))}"><strong>${h(tr(definition.title))}</strong><small>${h(widgetText[kind] || '')}</small></button>`).join('')}
      <p data-report-search-empty hidden>Nenhum elemento encontrado.</p></div>`);
  };
  const changeOrder = (items,index,destination) => {
    if (destination < 0 || destination >= items.length || index === destination) return;
    items.splice(destination,0,...items.splice(index,1));
  };
  const goToReport = id => { location.hash=`#reporting/editor/${id}`; };
  let saving=false;
  let dragId='';
  document.addEventListener('input',event=>{
    if (!event.target.matches('[data-report-search]')) return;
    const query = fold(event.target.value.trim());
    const items = [...document.querySelectorAll('[data-report-term]')];
    for (const item of items) item.hidden = !item.dataset.reportTerm.includes(query);
    document.querySelector('[data-report-search-empty]').hidden = items.some(item=>!item.hidden);
  });
  document.addEventListener('click',async event=>{
    const control = event.target.closest('[data-report-act]');
    if (!control || control.disabled || c.view !== 'reporting') return;
    const {reportAct:action,id,source} = control.dataset;
    try {
      if (action === 'create' || action === 'clone') return pageChoice(source || 'clone',id);
      if (action === 'share') return shareDialog(id || savedReport(c)?.id);
      if (action === 'share-copy') {
        const input = control.form.elements.shareUrl; input.select();
        try { await navigator.clipboard.writeText(input.value); flash('Link copiado.'); } catch { flash('Link selecionado para copiar.'); }
        return;
      }
      if (action === 'share-revoke') {
        if (!await ask('Revogar o link?', { text: 'Quem tiver o link perde o acesso e o envio agendado é cancelado.', ok: 'Revogar' })) return;
        await mutate({ type:'report-share',id,data:{ action:'revoke' } }); redraw(); shareDialog(id); flash('Link revogado.'); return;
      }
      if (action === 'schedule-remove') {
        await mutate({ type:'report-schedule',id,data:{ action:'remove' } }); redraw(); shareDialog(id); flash('Agendamento cancelado.'); return;
      }
      if (action === 'delete') {
        const record = c.s.customReports.find(item=>item.id === id);
        if (record) open('Excluir relatório',`<p>Excluir “${h(record.name)}” deste workspace?</p><input type="hidden" name="version" value="${record.version}">`,'delete',id,'Excluir relatório');
        return;
      }
      const draft=editorState(c);
      if (!draft) return;
      const {report} = draft;
      const page = activePage(draft);
      const index = page.widgets.findIndex(widget=>widget.id === id);
      if (action === 'back') {
        if (draft.dirty) open('Descartar alterações?', '<p>A última versão salva continua na lista de relatórios.</p>','back','','Descartar e voltar');
        else location.hash='#reporting';
      } else if (action === 'save') {
        if (saving || !draft.dirty) return;
        saving=true; control.disabled=true;
        try {
          await mutate({ type:'report-save',id:report.id,data:report });
          if (c.reportDraft === draft && savedReport(c)) {
            draft.report=structuredClone(savedReport(c)); draft.dirty=false; redraw(); flash('Relatório salvo.');
          }
        } finally { saving=false; if(control.isConnected) control.disabled=false; }
      } else if (action === 'preview' || action === 'print') {
        draft.preview=action === 'print' || !draft.preview; redraw();
        if (action === 'print') requestAnimationFrame(()=>window.print());
      } else if (action === 'export') {
        download('relatorio.csv',reportCsv(c.s,report));
      } else if (action === 'properties') {
        open('Configurar relatório',nameInput(report.name)+paragraph('Resumo','summary',report.summary,4000)+
          select('Período','period',Object.entries(dashboardPeriods),report.period)+
          `<div class="field-grid">${field('Início personalizado','start',report.start,'type="date"')}${field('Fim personalizado','end',report.end,'type="date"')}</div>`+
          select('Tema','theme',Object.entries(dashboardThemes).map(([key,[label]])=>[key,label]),report.theme)+
          `<label class="check"><input name="cover" type="checkbox" ${report.cover ? 'checked' : ''}> Incluir capa</label>`,'properties');
      } else if (action === 'page-open') {
        draft.page=id; redraw();
      } else if (action === 'page-add') {
        if (report.pages.length >= 20) return;
        const added=newPage(uid(),report.pages.length+1);
        update(draft,()=>{report.pages.push(added); draft.page=added.id;});
      } else if (action === 'page-properties') {
        const position=report.pages.indexOf(page)+1;
        open('Configurar página',field('Nome da página','name',page.name,'required maxlength="80"')+
          field('Posição','position',position,`type="number" min="1" max="${report.pages.length}" required`)+
          (report.pages.length > 1 ? '<label class="check"><input type="checkbox" name="remove"> Remover esta página ao aplicar</label>' : ''),'page',page.id);
      } else if (action === 'library') library();
      else if (action === 'widget-add' && Object.hasOwn(widgets,id)) widgetForm(id);
      else if (action === 'widget-edit' && index >= 0) widgetForm(page.widgets[index].kind,page.widgets[index]);
      else if (action === 'widget-remove' && index >= 0) update(draft,()=>page.widgets.splice(index,1));
      else if (action === 'widget-up' || action === 'widget-down') update(draft,()=>changeOrder(page.widgets,index,index+(action === 'widget-up' ? -1 : 1)));
    } catch (error) { flash(error.message,true); }
  });
  document.addEventListener('submit',async event=>{
    const form=event.target;
    const action=form.dataset.form?.startsWith('report:') && form.dataset.form.slice(7);
    if (!action || c.view !== 'reporting') return;
    event.preventDefault();
    if (form.dataset.pending) return;
    form.dataset.pending='true';
    const submit=form.querySelector('button.primary');
    submit.disabled=true;
    try {
      const data=Object.fromEntries(new FormData(form));
      const id=form.dataset.id;
      if (action === 'create') {
        const reportId=await mutate({ type:'report-create',data });
        close(); goToReport(reportId); return;
      }
      if (action === 'share' || action === 'schedule') {
        await mutate(action === 'share' ? { type:'report-share',id,data:{ action:'create',days:Number(data.days),lang:data.lang } }
          : { type:'report-schedule',id,data:{ ...data,weekday:Number(data.weekday),monthday:Number(data.monthday),lang:'pt' } });
        redraw(); shareDialog(id);
        flash(action === 'share' ? 'Link gerado.' : 'Envio agendado.'); return;
      }
      if (action === 'delete') {
        await mutate({ type:'report-delete',id,data:{version:Number(data.version)} });
        close(); redraw(); flash('Relatório excluído.'); return;
      }
      const draft=editorState(c);
      if (!draft) return;
      if (action === 'back') {
        c.reportDraft=null; close(); location.hash='#reporting'; return;
      }
      const {report}=draft;
      const page=activePage(draft);
      if (action === 'properties') {
        if (!data.name.trim()) throw Error('Preencha o nome do relatório.');
        if (data.period === 'custom' && (!data.start || !data.end || data.start > data.end)) throw Error('Escolha um período válido.');
        Object.assign(report,data,{ cover:data.cover === 'on' });
      } else if (action === 'page') {
        if (data.remove && report.pages.length > 1) report.pages=report.pages.filter(item=>item.id !== id);
        else {
          if (!data.name.trim()) throw Error('Preencha o nome da página.');
          page.name=data.name.trim();
          changeOrder(report.pages,report.pages.indexOf(page),Number(data.position)-1);
        }
        draft.page=activePage(draft).id;
      } else if (action === 'widget') {
        if (!data.title.trim()) throw Error('Preencha o título do elemento.');
        if (data.url) {
          const url=new URL(data.url);
          if (url.protocol !== 'https:' || url.username || url.password) throw Error('Use um endereço HTTPS sem usuário e senha.');
        }
        if (['text','note'].includes(data.kind) && !data.note.trim()) throw Error('Preencha o texto do elemento.');
        const index=page.widgets.findIndex(item=>item.id === id);
        const widget={ ...newWidget(data.kind,id || uid()),...data,width:Number(data.width) };
        if (index >= 0) page.widgets[index]=widget;
        else {
          if (page.widgets.length >= 48 || report.pages.reduce((sum,item)=>sum+item.widgets.length,0) >= 100)
            throw Error('Limite de elementos atingido para esta página ou relatório.');
          page.widgets.push(widget);
        }
      }
      close(); draft.dirty=true; redraw();
    } catch(error) { form.querySelector('.form-status').textContent=error.message; }
    finally { delete form.dataset.pending; submit.disabled=false; }
  });
  document.addEventListener('dragstart',event=>{
    const grip=event.target.closest('[data-report-drag]');
    if (!grip) return;
    dragId=grip.dataset.reportDrag;
    event.dataTransfer.setData('text/plain',dragId);
    event.dataTransfer.effectAllowed='move';
  });
  document.addEventListener('dragend',()=>{ dragId=''; });
  document.addEventListener('dragover',event=>{ if (dragId && event.target.closest('[data-report-drop]')) event.preventDefault(); });
  document.addEventListener('drop',event=>{
    const target=event.target.closest('[data-report-drop]');
    if (!target || !dragId || target.dataset.reportDrop === dragId) return;
    const draft=editorState(c);
    if (!draft) return;
    const items=activePage(draft).widgets;
    const from=items.findIndex(item=>item.id === dragId);
    const to=items.findIndex(item=>item.id === target.dataset.reportDrop);
    if (from < 0 || to < 0) return;
    event.preventDefault();
    dragId='';
    update(draft,()=>changeOrder(items,from,to));
  });
}
