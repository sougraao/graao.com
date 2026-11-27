import { activeDashboard, dashboardRange, libraryList, resetDashboardGauges } from './dashboard.js';
import { comparisonMode, comparisonModes, dashboardPeriods, dateFields, effectiveWidget, newWidget, reportRows, validDay, widgets } from './dashboard-data.js';
import { resetCountUps } from './graao.js';
import { h } from './screens.js';
import { tr } from './i18n.js';

export function dashboardPreferences(workspace) {
  const key = `go.dashboard.${workspace}`;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { /* Use defaults. */ }
  return { key, id:saved.id || '', range:{ period:'30', ...saved.range }, view:{}, showQuick:false, quickTag:'', draft:null, undo:[], redo:[],
    lib:{ tab:'widgets', sub:'builtin', query:'', open:[] } };
}

const select = (name, label, choices, value) => `<label>${label}<select name="${name}">${choices.map(([key,text]) =>
  `<option value="${h(key)}" ${String(value) === String(key) ? 'selected' : ''}>${h(text)}</option>`).join('')}</select></label>`;
const text = (name,label,value = '',extra = 'required maxlength="100"') => `<label>${label}<input name="${name}" value="${h(value)}" ${extra}></label>`;
const current = context => context.dash.draft || activeDashboard(context);
const zones = (() => { try { return Intl.supportedValuesOf('timeZone'); } catch { return []; } })();

export function installDashboardControls({ c, dialog, close, render, load, mutate, flash, go, download }) {
  let lastElementAdd = 0;
  const remember = () => { try { localStorage.setItem(c.dash.key,JSON.stringify({ id:c.dash.id, range:c.dash.range })); } catch { /* Private mode. */ } };

  function startEditing() {
    const saved = activeDashboard(c);
    c.dash.draft = { id:saved.id,name:saved.name,version:saved.version,theme:saved.theme || 'default',widgets:structuredClone(saved.widgets) };
    c.dash.undo = [];
    c.dash.redo = [];
  }

  function edit(change) {
    c.dash.undo = [...c.dash.undo,structuredClone(c.dash.draft)].slice(-25);
    change(c.dash.draft);
    c.dash.redo = [];
    render();
  }

  function reorder(id, target) {
    if (!c.dash.draft) return;
    const records = c.dash.draft.widgets;
    const index = records.findIndex(item => item.id === id);
    if (index < 0 || target < 0 || target >= records.length || index === target) return;
    edit(board => board.widgets.splice(target,0,...board.widgets.splice(index,1)));
  }

  function dialogForm(title, body, action, options = {}) {
    dialog(title,body,{ ...options,form:`dashboard-${action}` });
    const form = document.querySelector('#dialog form');
    form.dataset.boardForm = action;
    delete form.dataset.form;
    return form;
  }

  function elementFields(kind, entry = {}) {
    if (kind === 'heading') return text('note','Subtítulo (opcional)',entry.note,'maxlength="200"');
    if (kind === 'text' || kind === 'note') return `<label>Texto<textarea name="note" maxlength="2000" required>${h(entry.note)}</textarea></label>`;
    if (widgets[kind]?.url) return text('url',kind === 'image' ? 'Endereço da imagem (https)' : 'Endereço da página (https)',entry.url,'type="url" required maxlength="2000" placeholder="https://"') +
      (kind === 'embed' ? '<p class="dim">Alguns sites não permitem ser exibidos dentro de outra página. Nesse caso, use o link “Abrir em nova aba”.</p>' : '');
    return '';
  }

  function configureWidget(id) {
    const entry = current(c).widgets.find(item => item.id === id);
    if (!entry) return;
    const config = effectiveWidget(c.s,entry,c.dash.draft ? {} : c.dash.view[id]);
    const definition = widgets[entry.kind];
    const titles = !c.dash.draft ? '' : text('title',entry.kind === 'heading' ? 'Título' : 'Título do widget',tr(entry.title)) + select('width','Largura',
      [[3,'Um quarto'],[4,'Um terço'],[5,'Cinco colunas'],[6,'Metade'],[8,'Dois terços'],[12,'Largura total']],entry.width);
    const pipeline = definition.pipeline ? select('dateField','Data usada no cálculo',Object.entries(dateFields),config.dateField) +
      select('pipeline','Pipeline',[...(definition.needsPipeline ? [] : [['','Todos os pipelines']]),...c.s.pipelines.map(item => [item.id,tr(item.name)])],config.pipeline) : '';
    const content = c.dash.draft || entry.kind === 'note' ? elementFields(entry.kind,entry) : '';
    dialogForm(`Configurar ${tr(entry.title)}`,titles+pipeline+content,'widget',{ id });
  }

  async function saveBoard(board) {
    await mutate({ type:'dashboard-save', id:board.id, data:board });
    c.dash.draft = null;
    c.dash.undo = [];
    c.dash.redo = [];
    c.dash.view = {};
    close(); render(); flash('Painel salvo.');
  }

  function switcherList(query = '') {
    const term = query.trim().toLowerCase();
    const boards = c.s.dashboards.filter(board => tr(board.name).toLowerCase().includes(term));
    const active = activeDashboard(c).id;
    return boards.map(board => `<button class="choice" data-dash-act="choose" data-widget="${board.id}"><strong>${h(tr(board.name))}${board.id === c.s.defaultDashboard ? ' <span class="badge pink">Padrão</span>' : ''}</strong>
      <span>${board.id === active ? 'Painel aberto · ' : ''}${board.widgets.length} widgets</span></button>`).join('') || '<p class="dim">Nenhum painel com esse nome.</p>';
  }

  const act = {
    switch() {
      dialog('Painéis',`<label class="search dash-switch-search"><input type="search" data-dash-switch-search placeholder="Buscar painel" aria-label="Buscar painel"></label>
        <div class="dash-switch-list" data-dash-switch-list>${switcherList()}</div>`,{ description:`${c.s.dashboards.length} de 20 painéis neste workspace` });
      document.querySelector('[data-dash-switch-search]')?.focus();
    },
    choose(id) { c.dash.id=id; c.dash.view={}; c.dash.quickTag=''; remember(); resetCountUps('dash:'); resetDashboardGauges(); close(); render(); },
    new() { dialogForm('Criar painel',text('name','Nome do painel') + select('copyFrom','Começar com',
      [['','Painel em branco'],...c.s.dashboards.map(board => [board.id,`Cópia de ${tr(board.name)}`])],''),'new'); },
    async refresh() { await load(); resetCountUps('dash:'); resetDashboardGauges(); render(); flash('Painel atualizado.'); },
    quick() { c.dash.showQuick=!c.dash.showQuick; render(); },
    dates() {
      const { period,start,end } = c.dash.range;
      dialogForm('Período',select('period','Período',Object.entries(dashboardPeriods),period) +
        `<fieldset class="dash-date-fields" ${period === 'custom' ? '' : 'hidden disabled'}><div class="field-grid">
          <label>Início<input type="date" name="start" value="${validDay(start) ? start : ''}" required></label>
          <label>Fim<input type="date" name="end" value="${validDay(end) ? end : ''}" required></label></div></fieldset>
        ${select('compare','Comparar com',Object.entries(comparisonModes),comparisonMode(c.dash.range))}
        <p class="dim">A comparação aparece nos widgets de número, status e conversão. Períodos sem data inicial não têm comparação.</p>`,'dates',
      { buttons:'<button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary">Aplicar</button>' });
    },
    edit() { startEditing(); render(); },
    cancel() { c.dash.draft=null; render(); },
    rename() { dialogForm('Renomear painel',text('name','Nome do painel',tr(current(c).name)),'rename'); },
    save() { return saveBoard(c.dash.draft); },
    undo() {
      const previous = c.dash.undo.pop();
      if (previous) { c.dash.redo.push(c.dash.draft); c.dash.draft=previous; render(); }
    },
    redo() {
      const next = c.dash.redo.pop();
      if (next) { c.dash.undo.push(c.dash.draft); c.dash.draft=next; render(); }
    },
    up(id) { reorder(id,current(c).widgets.findIndex(item => item.id === id)-1); },
    down(id) { reorder(id,current(c).widgets.findIndex(item => item.id === id)+1); },
    remove(id) { edit(board => board.widgets=board.widgets.filter(item => item.id !== id)); },
    'duplicate-widget'(id) {
      edit(board => {
        const index = board.widgets.findIndex(item => item.id === id);
        if (index >= 0) board.widgets.splice(index+1,0,{ ...structuredClone(board.widgets[index]), id:crypto.randomUUID() });
      });
    },
    'widget-settings':configureWidget,
    'widget-add'(kind) {
      // The Enter that submits the element dialog returns focus to this button; ignore its key-up click.
      if (!c.dash.draft || !widgets[kind] || Date.now() - lastElementAdd < 500) return;
      if (widgets[kind].url || kind === 'text') {
        dialogForm(`Adicionar ${tr(widgets[kind].title).toLowerCase()}`,text('title','Título',tr(widgets[kind].title)) + elementFields(kind),'element',{ id:kind });
        return;
      }
      edit(board => { board.widgets.push({ ...newWidget(kind,crypto.randomUUID()), title:tr(widgets[kind].title) }); });
      flash(`${tr(widgets[kind].title)} entrou no fim do painel.`);
    },
    'lib-tab'(tab) { c.dash.lib.tab=tab; render(); },
    'lib-sub'(sub) { c.dash.lib.sub=sub; render(); },
    theme(name) { edit(board => { board.theme=name; }); },
    note() { dialogForm('Adicionar nota adesiva',text('title','Título','Nota adesiva') + '<label>Nota<textarea name="note" maxlength="2000" required></textarea></label>','note'); },
    more() {
      const board = activeDashboard(c);
      const item = (action,label,extra = '') => `<button class="secondary" data-dash-act="${action}" ${extra}>${label}</button>`;
      dialog('Ações do painel',`<div class="dash-actions-list">
        ${item('duplicate','Duplicar')}
        ${item('make-default',board.id === c.s.defaultDashboard ? 'Já é o painel padrão' : 'Definir como padrão',board.id === c.s.defaultDashboard ? 'disabled' : '')}
        ${item('timezone','Fuso horário do painel')}
        ${item('export','Exportar modelo')}
        ${item('import','Importar modelo')}
        ${item('history','Histórico de versões')}
        ${item('delete','Excluir painel',c.s.dashboards.length > 1 ? 'data-danger' : 'disabled title="O workspace precisa de pelo menos um painel"')}</div>`,{ description:tr(board.name) });
    },
    duplicate() { dialogForm('Duplicar painel',text('name','Nome do painel',`${tr(activeDashboard(c).name)} (cópia)`),'duplicate'); },
    async 'make-default'() {
      await mutate({ type:'dashboard-default', id:activeDashboard(c).id, data:{} });
      close(); render(); flash('Este painel abre por padrão para quem ainda não escolheu outro.');
    },
    timezone() {
      const board = activeDashboard(c);
      dialogForm('Fuso horário do painel',`<label>Fuso horário<input name="timezone" list="dash-zones" value="${h(board.timezone || '')}" placeholder="${h(c.s.profile.timezone)} (fuso do workspace)" maxlength="64"></label>
        <datalist id="dash-zones">${zones.map(zone => `<option value="${h(zone)}">`).join('')}</datalist>
        <p class="dim">Os períodos e as datas deste painel usam esse fuso. Deixe em branco para usar o fuso do workspace.</p>`,'timezone');
    },
    export() {
      const board = activeDashboard(c);
      const template = { format:'graao-dashboard', version:1, name:board.name, theme:board.theme || 'default',
        widgets:board.widgets.map(({ id, ...widget }) => ({ ...widget, pipeline:'' })) };
      const file = `${tr(board.name).normalize('NFD').replace(/[^\w-]+/g,'-').replace(/^-+|-+$/g,'').toLowerCase() || 'painel'}.json`;
      download(file,JSON.stringify(template,null,2),'application/json');
      close(); flash('Modelo exportado. Os pipelines voltam para “Todos os pipelines” ao importar.');
    },
    import() {
      dialogForm('Importar modelo',`<label>Arquivo do modelo (.json)<input type="file" name="file" accept="application/json,.json" required></label>
        ${text('name','Nome do novo painel','','maxlength="80" placeholder="Usa o nome do modelo se ficar em branco"')}
        <p class="dim">Use um arquivo gerado em “Exportar modelo”. O modelo cria um painel novo; nenhum painel existente é alterado.</p>`,'import');
    },
    delete() {
      dialogForm('Excluir painel?',`<p>O painel <b>${h(tr(activeDashboard(c).name))}</b> e o histórico de versões dele serão excluídos. Os relatórios já enviados continuam em Relatórios.</p>`,'delete',
        { buttons:'<button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary danger">Excluir painel</button>' });
    },
    history() {
      const board = activeDashboard(c);
      const entries = board.history.map(entry => `<button type="button" class="choice" data-dash-act="restore" data-widget="${entry.version}"><strong>Versão ${entry.version} · ${h(tr(entry.name))}</strong><span>${h(new Date(entry.when).toLocaleString('pt-BR'))} · ${entry.widgets.length} widgets</span></button>`).join('');
      dialog('Histórico de versões',entries || '<p>Nenhuma versão salva ainda.</p>',{ description:`Versão atual: ${board.version}` });
    },
    async restore(version) {
      const board = activeDashboard(c);
      await mutate({ type:'dashboard-restore', id:board.id, data:{ version:board.version, restoreVersion:Number(version) } });
      c.dash.view={}; close(); render(); flash('Versão restaurada.');
    },
    summary() {
      const rows = reportRows(c.s,activeDashboard(c),c.dash.view,dashboardRange(c),c.dash.quickTag);
      dialog('Resumo do painel', reportGrid(rows),{ description:`${dashboardPeriods[c.dash.range.period] || 'Últimos 30 dias'} · com os filtros de cada widget` });
    },
    report() { dialogForm('Enviar como relatório',text('name','Nome do relatório',`Relatório ${tr(activeDashboard(c).name)}`),'report',{ description:'Uma cópia das métricas atuais fica salva em Relatórios.' }); }
  };

  document.addEventListener('click', async event => {
    const button = event.target.closest('button[data-dash-act]');
    if (!button || !c.s) return;
    const action = act[button.dataset.dashAct];
    if (!action || button.disabled) return;
    button.disabled = true;
    try { await action(button.dataset.widget); }
    catch (error) { flash(error.message,true); }
    finally { if (button.isConnected) button.disabled=false; }
  });

  document.addEventListener('input', event => {
    const field = event.target;
    if (field.matches('[data-dash-library-search]')) {
      c.dash.lib.query = field.value;
      const target = document.querySelector('[data-dash-library-list]');
      if (target && c.dash.draft) target.innerHTML = libraryList(c,c.dash.draft);
    }
    if (field.matches('[data-dash-switch-search]')) {
      const target = document.querySelector('[data-dash-switch-list]');
      if (target) target.innerHTML = switcherList(field.value);
    }
  });

  document.addEventListener('toggle', event => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement) || !details.dataset.dashCategory) return;
    const key = details.dataset.dashCategory;
    c.dash.lib.open = details.open ? [...new Set([...c.dash.lib.open,key])] : c.dash.lib.open.filter(item => item !== key);
  }, true);

  document.addEventListener('change', event => {
    const field = event.target;
    const id = field.dataset.dashWidget;
    if (id) {
      const key = field.dataset.dashField;
      if (c.dash.draft && key === 'pipeline') edit(board => { board.widgets.find(item => item.id === id).pipeline=field.value; });
      else {
        (c.dash.view[id] ||= {})[key] = field.value;
        render();
      }
      document.querySelector(`[data-dash-widget="${id}"][data-dash-field="${key}"]`)?.focus();
    }
    if (field.hasAttribute('data-dash-quick')) {
      c.dash.quickTag=field.value; render(); document.querySelector('[data-dash-quick]')?.focus();
    }
    if (field.name === 'period' && field.form?.dataset.boardForm === 'dates') {
      const target = field.form.querySelector('fieldset');
      target.disabled = target.hidden = field.value !== 'custom';
    }
  });

  async function readTemplate(file) {
    if (!file || !file.size) throw new Error('Escolha um arquivo de modelo.');
    if (file.size > 200000) throw new Error('O arquivo é grande demais para um modelo de painel.');
    let template;
    try { template = JSON.parse(await file.text()); } catch { throw new Error('O arquivo não é um JSON válido.'); }
    if (template?.format !== 'graao-dashboard' || !Array.isArray(template.widgets)) throw new Error('Este arquivo não é um modelo de painel do graao.');
    const unknown = template.widgets.filter(widget => !widgets[widget?.kind]).length;
    return { template, widgets:template.widgets.filter(widget => widgets[widget?.kind]), unknown };
  }

  const submit = {
    async new(data) { act.choose(await mutate({type:'dashboard-create',data})); flash('Painel criado.'); },
    async duplicate(data) { act.choose(await mutate({type:'dashboard-create',data:{ ...data,copyFrom:activeDashboard(c).id }})); flash('Painel duplicado.'); },
    dates(data) {
      const { period,start,end } = data;
      if (period === 'custom' && (!validDay(start) || !validDay(end) || start > end)) throw new Error('Escolha uma data de início e de fim válidas.');
      c.dash.range={ period,start,end,compare:Object.hasOwn(comparisonModes,data.compare) ? data.compare : '' }; remember(); close(); render();
    },
    rename(data) { close(); edit(board => { board.name=data.name.trim() || board.name; }); },
    element(data,kind) {
      if (widgets[kind].url) {
        let url;
        try { url = new URL(data.url); } catch { throw new Error('Informe um endereço https válido.'); }
        if (url.protocol !== 'https:') throw new Error('Use um endereço que comece com https://.');
      }
      lastElementAdd = Date.now();
      close();
      edit(board => { board.widgets.push({ ...newWidget(kind,crypto.randomUUID()), title:data.title.trim() || tr(widgets[kind].title), note:data.note || '', url:data.url || '' }); });
      flash(`${data.title.trim() || tr(widgets[kind].title)} entrou no fim do painel.`);
    },
    async note(data) {
      const board = activeDashboard(c);
      const widget = { ...newWidget('note',crypto.randomUUID()), ...data };
      await saveBoard({ ...board,widgets:[...board.widgets,widget] });
    },
    widget(data,id) {
      close();
      if (c.dash.draft) edit(board => Object.assign(board.widgets.find(item => item.id === id),data,{ width:Number(data.width) }));
      else {
        const entry = activeDashboard(c).widgets.find(item => item.id === id);
        if (entry?.kind === 'note' && data.note !== undefined) {
          const board = activeDashboard(c);
          return saveBoard({ ...board, widgets:board.widgets.map(item => item.id === id ? { ...item, note:data.note } : item) });
        }
        (c.dash.view[id] ||= {}); Object.assign(c.dash.view[id],data); render();
      }
    },
    async 'timezone'(data) {
      await mutate({ type:'dashboard-timezone', id:activeDashboard(c).id, data });
      close(); render(); flash(data.timezone ? `Fuso do painel: ${data.timezone}.` : 'O painel voltou a usar o fuso do workspace.');
    },
    async import(data, _id, form) {
      const { template, widgets:list, unknown } = await readTemplate(form.elements.file.files[0]);
      const id = await mutate({ type:'dashboard-create', data:{ name:data.name.trim() || String(template.name || 'Painel importado').slice(0,80), theme:template.theme, widgets:list } });
      act.choose(id);
      flash(unknown ? `Modelo importado. ${unknown} widget(s) desconhecido(s) ficaram de fora.` : 'Modelo importado.');
    },
    async delete() {
      const next = await mutate({ type:'dashboard-delete', id:activeDashboard(c).id, data:{} });
      act.choose(next); flash('Painel excluído.');
    },
    async report(data) {
      await mutate({ type:'dashboard-report',id:activeDashboard(c).id,data:{ ...data,...c.dash.range,view:c.dash.view,tag:c.dash.quickTag } });
      close(); go('reporting','snapshots'); flash('Relatório salvo.');
    }
  };

  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.dataset.boardForm) return;
    event.preventDefault();
    if (form.dataset.pending) return;
    form.dataset.pending='true';
    const button = form.querySelector('button.primary');
    button.disabled=true;
    try { await submit[form.dataset.boardForm](Object.fromEntries([...new FormData(form)].filter(([, value]) => typeof value === 'string')),form.dataset.id,form); }
    catch (error) { const note = form.querySelector('.form-status'); if (note) note.textContent=error.message; else flash(error.message,true); }
    finally { delete form.dataset.pending; if (button.isConnected) button.disabled=false; }
  });

  document.addEventListener('dragstart',event => {
    const handle = event.target.closest?.('[data-dash-drag]');
    if (handle) event.dataTransfer.setData('application/go-widget',handle.dataset.dashDrag);
  });
  document.addEventListener('dragover',event => {
    if (c.dash.draft && event.target.closest?.('[data-dashboard-card]') && event.dataTransfer.types.includes('application/go-widget')) event.preventDefault();
  });
  document.addEventListener('drop',event => {
    const card = event.target.closest?.('[data-dashboard-card]');
    const id = event.dataTransfer.getData('application/go-widget');
    if (!c.dash.draft || !id || !card) return;
    event.preventDefault();
    reorder(id,c.dash.draft.widgets.findIndex(item => item.id === card.dataset.dashboardCard));
  });
}

export function reportGrid(rows) {
  if (!rows.length) return '<p>Este painel não tem métricas.</p>';
  return `<div class="dash-table"><table><thead><tr><th>Widget</th><th>Medida</th><th>Valor</th></tr></thead><tbody>${rows.map(row =>
    `<tr>${row.map(value => `<td>${h(tr(String(value)))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
