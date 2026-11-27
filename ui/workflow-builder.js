// Workflow builder: triggers side by side, a vertical tree of steps with if/else and router branches in columns,
// "+" connectors between steps, and an inspector drawn from the shared catalog (ui/workflow-data.js).
import { icon } from './icons.js';
import { h } from './screens.js';
import { FUNCTION_CATALOG, buildWorkflowContext, resolveTemplate } from './expressions.js';
import { actionCatalog, actionSpec, conditionSubjects, eachStep, refSources, splitPercent, stepId, stepSummary, triggerCatalog, triggerSpec, triggerSummary, upgradeWorkflow, variables } from './workflow-data.js';

const MAX_STEPS = 120;
const opportunityStatuses = [['Open', 'Aberta'], ['Won', 'Ganha'], ['Lost', 'Perdida'], ['Abandoned', 'Abandonada']];
const filterText = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const opts = (entries, value) => entries.map(([id, label]) => `<option value="${h(id)}" ${String(id) === String(value ?? '') ? 'selected' : ''}>${h(label)}</option>`).join('')
  + (value && !entries.some(([id]) => String(id) === String(value)) ? `<option value="${h(value)}" selected>Referência removida</option>` : '');
const btn = (op, label, { id = '', cls = 'secondary', glyph = '', disabled = false, data = '' } = {}) =>
  `<button type="button" class="${cls}" data-wf="${op}" data-wf-id="${h(id)}" ${data} ${disabled ? 'disabled' : ''}>${glyph ? icon(glyph, 15) : ''}${label}</button>`;

/* ───────── Árvore ───────── */

export function blankWorkflow(folderId = '') {
  return { name: '', folderId, triggers: [], steps: [], active: false, allowReentry: true };
}

// Old drafts (recipes, AI, saved legacy rows) open in the new shape.
export const asTree = row => {
  const tree = upgradeWorkflow(structuredClone(row));
  for (const trigger of tree.triggers) trigger.config ??= {};
  eachStep(tree.steps, step => { step.config ??= {}; });
  return tree;
};

export function findStep(row, id) {
  let found = null;
  eachStep(row.steps, step => { if (step.id === id) found = step; });
  return found;
}

// A list of steps by key: "root", "<stepId>:yes", "<stepId>:no", "<stepId>:otherwise", "<stepId>:route.<routeId>".
export function listByKey(row, key) {
  if (key === 'root') return row.steps;
  const [id, part] = key.split(':'), step = findStep(row, id);
  if (!step) return null;
  if (part === 'yes' || part === 'no' || part === 'otherwise' || part === 'body') return (step[part] ??= []);
  if (part?.startsWith('route.')) { const route = step.routes?.find(item => item.id === part.slice(6)); return route ? (route.steps ??= []) : null; }
  return null;
}

function parentOf(row, id) {
  let result = null;
  const visit = (list, key) => list.forEach((step, index) => {
    if (step.id === id) result = { list, index, key };
    if (step.type === 'if_else') { visit(step.yes || [], `${step.id}:yes`); visit(step.no || [], `${step.id}:no`); }
    if (step.type === 'router' || step.type === 'split') (step.routes || []).forEach(route => visit(route.steps || [], `${step.id}:route.${route.id}`));
    if (step.type === 'router') visit(step.otherwise || [], `${step.id}:otherwise`);
    if (step.type === 'loop') visit(step.body || [], `${step.id}:body`);
  });
  visit(row.steps, 'root');
  return result;
}

const count = row => { let n = 0; eachStep(row.steps, () => n++); return n; };
const defaults = spec => Object.fromEntries((spec?.fields || []).filter(field => field.kind !== 'conditions').map(field =>
  [field.key, field.value ?? (field.kind === 'select' ? field.options[0][0] : '')]));
const condition = () => ({ subject: 'tag', op: 'has', key: '', value: '' });

export function newStep(type) {
  const spec = actionSpec(type);
  const step = { id: stepId(), type, config: defaults(spec) };
  if (type === 'if_else') Object.assign(step, { yes: [], no: [], config: { match: 'all', conditions: [condition()] } });
  if (type === 'router') Object.assign(step, { routes: [{ id: stepId(), label: 'Caminho 1', match: 'all', conditions: [condition()], steps: [] }], otherwise: [] });
  if (type === 'loop') step.body = [];
  if (type === 'split') Object.assign(step, { routes: [{ id: stepId(), label: 'Caminho A', percent: 50, steps: [] }, { id: stepId(), label: 'Caminho B', percent: 50, steps: [] }] });
  return step;
}

/* ───────── Canvas ───────── */

const tested = (editor, id) => editor.test?.trace?.findLast?.(item => item.id === id) || [...(editor.test?.trace || [])].reverse().find(item => item.id === id);

function card({ key, kind, label, detail, glyph, current, footer, trigger = false, variant = '', ran = '' }) {
  return `<button type="button" class="wf-node wfb-node ${trigger ? 'wf-node-trigger' : ''} ${variant} ${current ? 'current' : ''} ${ran ? 'wfb-ran' : ''}" data-wf="node" data-wf-id="${h(key)}" aria-expanded="${current}" ${ran ? `title="Teste: ${h(ran)}"` : ''}>
    <span class="wf-node-body"><span class="wf-node-icon">${icon(glyph, 20)}</span><span class="wf-node-copy">
    <span class="wf-node-kind">${h(kind)}</span><strong>${h(label)}</strong><small data-wf-detail ${detail ? '' : 'hidden'}>${h(detail || '')}</small></span></span>
    <span class="wf-node-footer"><span>${h(footer)}</span><span data-wf-node-status>${icon(detail || trigger ? 'check' : 'sliders', 13)}</span></span></button>`;
}

// Layout: every card gets x/y coordinates, and the connections are SVG curves from the right port of one card to the
// left port of the next. Branches (Se/Senão, Roteador) stack their paths vertically and merge back into the next step.
const CARD_W = 232, CARD_H = 112, GAP_X = 96, GAP_Y = 40, PILL = 30;

function layoutFlow(c, editor) {
  const nodes = [], edges = [], pills = [], full = count(editor.row) >= MAX_STEPS;
  const mid = CARD_H / 2;
  // Lays out one list of steps starting at (x, y). `incoming` are the ports that flow into its first element.
  const sequence = (steps, key, x, y, incoming, numbering) => {
    let ports = incoming, bottom = y + CARD_H;
    steps.forEach((step, index) => {
      const spec = actionSpec(step.type), number = `${numbering}${index + 1}`;
      ports.forEach((port, i) => edges.push({ from: port, to: { x, y: y + mid }, label: port.label, tone: port.tone, add: i === 0 ? { key, index } : null }));
      nodes.push({ x, y, html: card({ key: step.id, kind: spec?.group || 'Ação', label: spec?.label || step.type, detail: stepSummary(step, c.s), glyph: spec?.icon || 'flow',
        current: editor.node === step.id, footer: `#${number}`, ran: tested(editor, step.id)?.result || '',
        variant: spec?.branch ? 'wfb-branch-node' : step.type === 'goal' ? 'wfb-goal' : step.type === 'end' || step.type === 'goto' ? 'wfb-stop' : '' }) });
      const right = { x: x + CARD_W, y: y + mid };
      if (step.type === 'if_else' || step.type === 'router' || step.type === 'split' || step.type === 'loop') {
        const paths = step.type === 'loop' ? [['Para cada item', '', step.body || [], `${step.id}:body`, `${number}.R`]]
          : step.type === 'if_else'
          ? [['Sim', 'yes', step.yes || [], `${step.id}:yes`, `${number}.S`], ['Não', 'no', step.no || [], `${step.id}:no`, `${number}.N`]]
          : step.type === 'split'
            ? (step.routes || []).map((route, r) => [`${route.label} · ${splitPercent(route.percent)}%`, '', route.steps || [], `${step.id}:route.${route.id}`, `${number}.${String.fromCharCode(65 + r)}`])
            : [...(step.routes || []).map((route, r) => [route.label, '', route.steps || [], `${step.id}:route.${route.id}`, `${number}.${r + 1}`]), ['Caso contrário', 'no', step.otherwise || [], `${step.id}:otherwise`, `${number}.C`]];
        let by = y, endX = x, merged = [];
        for (const [label, tone, list, listKey, num] of paths) {
          const out = sequence(list, listKey, x + CARD_W + GAP_X + 60, by, [{ ...right, label, tone }], `${num}.`);
          merged = merged.concat(out.ports); endX = Math.max(endX, out.endX); by = out.bottom + GAP_Y; bottom = Math.max(bottom, out.bottom);
        }
        ports = merged; x = endX + GAP_X;
      } else if (step.type === 'end' || step.type === 'goto') {
        ports = []; x += CARD_W + GAP_X;
      } else { ports = [right]; x += CARD_W + GAP_X; }
    });
    // End of the list: a "+" that adds at the end; the following step (after a merge) connects from here.
    const pill = { x, y: y + mid - PILL / 2 };
    ports.forEach(port => edges.push({ from: port, to: { x, y: y + mid }, label: port.label, tone: port.tone }));
    if (ports.length || !steps.length) pills.push({ ...pill, html: btn('node-add', '<span class="sr-only">Adicionar ação no fim deste caminho</span>', { cls: 'wf-add wfb-pill', glyph: 'plus', disabled: full, data: `data-wf-list="${h(key)}" data-wf-index="${steps.length}"` }) });
    return { ports: ports.length || !steps.length ? [{ x: x + PILL, y: y + mid }] : [], endX: x + PILL, bottom };
  };
  // Triggers stacked on the left; all of them flow into the first step.
  const triggers = editor.row.triggers;
  const triggerX = 0, firstX = CARD_W + GAP_X + 20;
  const triggerPorts = [];
  triggers.forEach((trigger, index) => {
    const spec = triggerSpec(trigger.type), ty = index * (CARD_H + 20);
    nodes.push({ x: triggerX, y: ty, html: card({ key: `t:${trigger.id}`, kind: 'Gatilho', label: spec?.label || trigger.type, detail: triggerSummary(trigger, c.s), glyph: spec?.icon || 'bolt',
      current: editor.node === `t:${trigger.id}`, footer: `Gatilho ${index + 1}`, trigger: true }) });
    triggerPorts.push({ x: triggerX + CARD_W, y: ty + mid });
  });
  const addY = triggers.length * (CARD_H + 20);
  nodes.push({ x: triggerX, y: addY, html: `<button type="button" class="wfb-add-trigger" data-wf="trigger-add">${icon('plus', 16)}<span><b>Adicionar gatilho</b><small>${triggers.length ? 'Qualquer gatilho inscreve o contato' : 'O que faz o contato entrar no fluxo'}</small></span></button>` });
  const flow = sequence(editor.row.steps, 'root', firstX, 0, triggerPorts.length ? triggerPorts : [], '');
  const end = flow.ports[0];
  if (end) nodes.push({ x: end.x + 14, y: end.y - 13, html: '<span class="wfb-end">Fim do fluxo</span>' });
  const width = Math.max(flow.endX + 140, CARD_W), height = Math.max(flow.bottom, addY + 64) + 20;
  return { nodes, edges, pills, width, height };
}

const curve = ({ from, to }) => { const dx = Math.max(36, (to.x - from.x) / 2); return [from, { x: from.x + dx, y: from.y }, { x: to.x - dx, y: to.y }, to]; };
const along = (edge, t) => { const [a, b, c, d] = curve(edge), u = 1 - t;
  return { x: u ** 3 * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t ** 3 * d.x, y: u ** 3 * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t ** 3 * d.y }; };

function edgeSvg(edges) {
  return edges.map(edge => { const [a, b, c, d] = curve(edge); return `<path class="wfb-edge ${edge.tone || ''}" d="M${a.x},${a.y} C${b.x},${b.y} ${c.x},${c.y} ${d.x},${d.y}"/>`; }).join('');
}

function edgeControls(edges, full) {
  return edges.map(edge => {
    const label = edge.label ? (pt => `<span class="wfb-edge-label ${edge.tone || ''}" style="left:${pt.x}px;top:${pt.y}px">${h(edge.label)}</span>`)(along(edge, 0.42)) : '';
    const add = edge.add ? (pt => `<span class="wfb-edge-add" style="left:${pt.x}px;top:${pt.y}px">${btn('node-add', '<span class="sr-only">Adicionar ação aqui</span>',
      { cls: 'wf-add', glyph: 'plus', disabled: full, data: `data-wf-list="${h(edge.add.key)}" data-wf-index="${edge.add.index}"` })}</span>`)(along(edge, edge.label ? 0.84 : 0.5)) : '';
    return label + add;
  }).join('');
}

export function builderCanvas(c, editor, controls) {
  const { row } = editor;
  const layout = layoutFlow(c, editor), full = count(row) >= MAX_STEPS;
  const panX = editor.panX || 0, panY = editor.panY || 0, zoom = editor.zoom || 1;
  const steps = count(row);
  const place = item => `<div class="wfb-place" style="left:${item.x}px;top:${item.y}px">${item.html}</div>`;
  return `<div class="wf-workbench"><div class="wf-stage" style="background-position:calc(50% + ${panX}px) calc(50% + ${panY}px)">
    <div class="wf-canvas" tabindex="0" role="region" aria-label="Canvas do fluxo"><div class="wf-canvas-space"><div class="wf-track wfb-track" style="--wf-zoom:${zoom};transform:translate3d(${panX}px,${panY}px,0) scale(${zoom})">
      <div class="wfb-graph" style="width:${layout.width}px;height:${layout.height}px">
        <svg class="wfb-edges" width="${layout.width}" height="${layout.height}" aria-hidden="true">${edgeSvg(layout.edges)}</svg>
        ${layout.nodes.map(place).join('')}${layout.pills.map(place).join('')}${edgeControls(layout.edges, full)}
      </div>
    </div></div></div>
    ${controls}
    <div class="wf-dock">${btn('node-add', 'Adicionar ação', { glyph: 'plus', cls: 'wf-dock-add', disabled: steps >= MAX_STEPS, data: `data-wf-list="root" data-wf-index="${row.steps.length}"` })}
      <span>${row.triggers.length} ${row.triggers.length === 1 ? 'gatilho' : 'gatilhos'} · ${steps} ${steps === 1 ? 'etapa' : 'etapas'}</span></div></div>
    ${editor.node ? `<div class="wfb-modal"><button type="button" class="wfb-modal-backdrop" data-wf="node-close" tabindex="-1" aria-label="Fechar"></button>
      <section class="wf-inspector" role="dialog" aria-modal="true" aria-label="Configuração da etapa">${inspector(c, editor)}</section></div>` : ''}</div>`;
}

/* ───────── Inspector ───────── */

function fieldInput(c, editor, field, config, target) {
  const value = config[field.key] ?? '';
  const attrs = `data-wf-cfg="${h(field.key)}" data-wf-target="${h(target)}"`;
  const label = `<span>${h(field.label)}${field.required ? ' <span class="wfb-req" aria-hidden="true">*</span>' : ''}</span>`;
  if (field.kind === 'select') return `<label>${label}<select ${attrs}>${opts(field.options, value)}</select></label>`;
  if (field.kind === 'ref') {
    const entries = refSources[field.source]?.(c.s, c).filter(([id]) => !(field.source === 'workflows' && id === editor.key)) || [];
    return `<label>${label}<select ${attrs}>${opts([['', field.empty || 'Selecione…'], ...entries], value)}</select></label>`;
  }
  if (field.kind === 'step') {
    const entries = [];
    eachStep(editor.row.steps, step => { if (step.id !== target) entries.push([step.id, `${actionSpec(step.type)?.label || step.type}${stepSummary(step, c.s) ? ` · ${stepSummary(step, c.s)}` : ''}`]); });
    return `<label>${label}<select ${attrs}>${opts([['', 'Escolha a etapa'], ...entries], value)}</select></label>`;
  }
  if (field.kind === 'textarea') {
    const sample = c.s.contacts?.[0] || { name: 'Lucas Silva', email: 'lucas@exemplo.com', phone: '+55 11 98765-4321', company: 'Acme' };
    const preview = resolveTemplate(String(value), { ...buildWorkflowContext(c.s, editor.row, sample), workspace: { name: c.s.profile?.name || '' } });
    return `<label>${label}<textarea rows="4" maxlength="4000" ${attrs} data-wf-var-target>${h(value)}</textarea></label>
      <div class="wf-var-preview-box"><span class="wf-var-preview-label">Exemplo com ${h(sample.name)}:</span><div class="wf-var-preview" data-wf-preview="${h(field.key)}">${h(typeof preview === 'string' ? preview : JSON.stringify(preview)) || '(vazio)'}</div></div>`;
  }
  const type = field.kind === 'number' ? 'number' : field.kind === 'time' ? 'time' : field.kind === 'datetime' ? 'datetime-local' : 'text';
  const shown = field.kind === 'datetime' && value ? new Date(value).toLocaleString('sv-SE').slice(0, 16).replace(' ', 'T') : value;
  return `<label>${label}<input type="${type}" ${attrs} value="${h(shown)}" ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} ${field.placeholder ? `placeholder="${h(field.placeholder)}"` : ''} ${type === 'text' ? 'data-wf-var-target maxlength="600"' : ''}></label>`;
}

function fields(c, editor, spec, config, target) {
  return (spec?.fields || []).filter(field => field.kind !== 'conditions' && (!field.when || Object.entries(field.when).every(([key, v]) => (config[key] ?? '') === v)))
    .map(field => fieldInput(c, editor, field, config, target)).join('');
}

function conditionEditor(c, list, match, scope) {
  const rows = list.map((cond, index) => {
    const subject = conditionSubjects.find(item => item[0] === cond.subject) || conditionSubjects[0];
    const at = `data-wf-cond="${h(scope)}" data-wf-cond-index="${index}"`;
    const valueKind = subject[3];
    const needsValue = !['empty', 'not_empty'].includes(cond.op) && valueKind !== 'none';
    let value = '';
    if (valueKind === 'field') value = `<select ${at} data-wf-cond-prop="key" aria-label="Campo">${opts([['', 'Campo…'], ...refSources.contactFields(c.s)], cond.key)}</select>`;
    if (valueKind === 'key') value = cond.subject === 'var' ? `<input ${at} data-wf-cond-prop="key" value="${h(cond.key)}" placeholder="Variável (ex.: intencao)" aria-label="Nome da variável">`
      : `<input ${at} data-wf-cond-prop="key" value="${h(cond.key)}" placeholder="Chave (ex.: body, total)" aria-label="Chave do dado">`;
    if (needsValue) {
      if (valueKind === 'stage') value += `<select ${at} data-wf-cond-prop="value" aria-label="Etapa">${opts([['', 'Etapa…'], ...refSources.stages(c.s)], cond.value)}</select>`;
      else if (valueKind === 'status') value += `<select ${at} data-wf-cond-prop="value" aria-label="Status">${opts(opportunityStatuses, cond.value || 'Won')}</select>`;
      else if (valueKind === 'form') value += `<select ${at} data-wf-cond-prop="value" aria-label="Formulário">${opts([['', 'Qualquer formulário'], ...c.s.forms.map(row => [row.id, row.name])], cond.value)}</select>`;
      else value += `<input ${at} data-wf-cond-prop="value" value="${h(cond.value)}" placeholder="Valor" aria-label="Valor">`;
    }
    return `<div class="wfb-cond">${index ? `<span class="wfb-cond-join">${match === 'any' ? 'ou' : 'e'}</span>` : ''}
      <select ${at} data-wf-cond-prop="subject" aria-label="Condição">${opts(conditionSubjects.map(([id, label]) => [id, label]), cond.subject)}</select>
      <select ${at} data-wf-cond-prop="op" aria-label="Operador">${opts(subject[2], cond.op)}</select>${value}
      ${btn('cond-delete', `<span class="sr-only">Remover condição</span>`, { cls: 'wf-text wfb-icon', glyph: 'close', data: `data-wf-scope="${h(scope)}" data-wf-index="${index}"` })}</div>`;
  }).join('');
  return `<div class="wfb-conditions"><label>Combinar<select data-wf-match="${h(scope)}">${opts([['all', 'Todas as condições (E)'], ['any', 'Qualquer condição (OU)']], match)}</select></label>
    ${rows || '<p class="wf-sub">Sem condições: o caminho sempre é seguido.</p>'}
    ${btn('cond-add', 'Adicionar condição', { glyph: 'plus', cls: 'wf-text', data: `data-wf-scope="${h(scope)}"` })}</div>`;
}

function inspector(c, editor) {
  const close = btn('node-close', '<span class="sr-only">Fechar configuração</span>', { cls: 'wf-canvas-tool', glyph: 'close' });
  if (editor.node.startsWith('t:')) {
    const trigger = editor.row.triggers.find(item => `t:${item.id}` === editor.node);
    if (!trigger) return '';
    const spec = triggerSpec(trigger.type);
    const hook = trigger.type === 'inbound_webhook' ? (trigger.config.secret && editor.key
      ? `<label>Endereço do webhook (POST, JSON)<input readonly value="${h(`${location.origin}/hooks/${c.workspace}/${editor.key}/${trigger.id}?key=${trigger.config.secret}`)}" data-wf-copy></label>
        <p class="wf-sub">Envie <code>email</code> ou <code>phone</code> para o contato ser encontrado ou criado. Os outros campos ficam em <code>{{trigger.campo}}</code>.</p>`
      : '<p class="wf-sub">Salve o fluxo para gerar o endereço do webhook.</p>') : '';
    const delivers = [['contact', 'Contato (nome, e-mail, telefone, tags, campos)'], ...(triggerData[trigger.type] || []).map(([key, label]) => [`trigger.${key}`, label]), ...(trigger.type === 'inbound_webhook' ? [['trigger.campo', 'Cada campo do JSON recebido']] : [])];
    return `<div class="wf-inspector-head"><h2>${icon(spec?.icon || 'bolt', 18)} ${h(spec?.label || 'Gatilho')}</h2>${close}</div>
      <div class="wfb-modal-cols two"><div class="wfb-config">
      <p class="wf-action-desc">${spec?.scheduled ? 'Verificado a cada minuto; dispara uma vez por dia para cada contato que se encaixa.' : 'Filtros vazios aceitam qualquer valor.'}</p>
      ${fields(c, editor, spec, trigger.config, editor.node)}${hook}
      <div class="wf-node-tools">${btn('trigger-delete', 'Remover gatilho', { cls: 'wf-text', glyph: 'trash', id: trigger.id })}</div></div>
      <aside class="wfb-exit" aria-label="Saída do gatilho"><h3>Saída</h3><p class="wf-sub">O que este gatilho entrega para as etapas seguintes:</p>
      <pre>${delivers.map(([key, label]) => `{{${h(key)}}}  ${h(label)}`).join('\n')}</pre></aside></div>`;
  }
  const step = findStep(editor.row, editor.node);
  if (!step) return '';
  const spec = actionSpec(step.type), place = parentOf(editor.row, step.id);
  let body = fields(c, editor, spec, step.config, step.id);
  if (step.type === 'if_else') body += conditionEditor(c, step.config.conditions || [], step.config.match, step.id);
  if (step.type === 'router') {
    body += (step.routes || []).map((route, index) => `<fieldset class="wfb-route"><legend>Caminho ${index + 1}</legend>
      <label>Nome<input value="${h(route.label)}" data-wf-route-label="${h(route.id)}" data-wf-target="${h(step.id)}" maxlength="60"></label>
      ${conditionEditor(c, route.conditions || [], route.match, `${step.id}:${route.id}`)}
      ${btn('route-delete', 'Remover caminho', { cls: 'wf-text', glyph: 'trash', id: route.id, disabled: step.routes.length < 2 })}</fieldset>`).join('')
      + btn('route-add', 'Adicionar caminho', { glyph: 'plus', disabled: (step.routes || []).length >= 6 })
      + '<p class="wf-sub">Os caminhos são testados em ordem; o primeiro que bater é seguido. Se nenhum bater, segue “Caso contrário”.</p>';
  }
  if (step.type === 'split') {
    const total = (step.routes || []).reduce((sum, route) => sum + splitPercent(route.percent), 0);
    body += (step.routes || []).map((route, index) => `<fieldset class="wfb-route"><legend>Caminho ${String.fromCharCode(65 + index)}</legend>
      <label>Nome<input value="${h(route.label)}" data-wf-route-label="${h(route.id)}" data-wf-target="${h(step.id)}" maxlength="60"></label>
      <label>Percentual dos contatos<input type="number" min="0" max="100" step="1" value="${splitPercent(route.percent)}" data-wf-route-percent="${h(route.id)}" data-wf-target="${h(step.id)}"></label>
      ${btn('route-delete', 'Remover caminho', { cls: 'wf-text', glyph: 'trash', id: route.id, disabled: step.routes.length < 3 })}</fieldset>`).join('')
      + btn('route-add', 'Adicionar caminho', { glyph: 'plus', disabled: (step.routes || []).length >= 6 })
      + `<p class="wf-sub ${total === 100 ? '' : 'wfb-warn'}" data-wf-split-total><b>Total: ${total}%</b>${total === 100 ? '' : ' <span>Os percentuais precisam somar 100% para publicar.</span>'}</p>
      <p class="wf-sub">Cada contato é sorteado para um caminho na hora em que chega aqui; o caminho sorteado aparece no histórico da execução.</p>`;
  }
  if (step.type === 'goal') body += '<p class="wf-sub">Se a meta acontecer enquanto o contato está em qualquer etapa anterior, ele pula direto para cá.</p>';
  if (['manual_call', 'manual_sms'].includes(step.type)) body += '<p class="wf-sub">O fluxo pausa até alguém concluir ou dispensar a ação na fila de ações manuais.</p>';
  if (spec?.ai) {
    body += `<p class="wf-sub">A IA roda em segundo plano com a chave da OpenAI de quem salvar o fluxo (sem a chave, as etapas de texto usam a IA gratuita do graao, quando liberada). O contato espera a resposta (até 10 minutos) e segue para a próxima etapa. Para ramificar, use um Se / Senão ou Roteador com a condição “Variável do fluxo”.${step.type === 'ai_decision' ? ' A variável recebe uma das opções e {{vars.NOME_motivo}} traz o motivo.' : step.type === 'ai_intent' ? ' Sem encaixe, a variável fica “outra”; {{vars.NOME_confianca}} traz a confiança de 0 a 100.' : ''} No teste, a IA não é chamada e as variáveis ficam vazias. O uso conta no limite mensal de IA da subconta.</p>`;
    const media = ['ai_image_generate', 'ai_video_generate'].includes(step.type);
    if (!c.features?.contentAI && c.features?.freeAI && !media) body += '<p class="wf-sub">Sem uma chave da OpenAI conectada, esta etapa usa a IA gratuita do graao. Agentes com busca na web precisam da chave.</p>';
    else if (!c.features?.contentAI) body += '<p class="wf-sub wfb-warn">Sem uma chave da OpenAI conectada, estas etapas registram erro e o fluxo segue. Conecte em Visão da agência → Configurações → OpenAI.</p>';
  }
  const run = tested(editor, step.id), outputs = editor.test?.outputs?.[step.id];
  const failed = run && /^(erro|sem |campo |e-mail inválido|contato em não perturbe|não passou)/.test(run.result);
  const exit = `<aside class="wfb-exit" aria-label="Saída"><div class="wfb-exit-status"><h3>Saída</h3>${btn('test-run', editor.test ? 'Re-testar' : 'Testar', { glyph: 'play', cls: 'secondary' })}</div>
    ${!editor.test ? '<span class="wfb-exit-badge off">Sem teste ainda</span><p class="wf-sub">Rode um teste com um contato para ver aqui o resultado desta etapa e os dados que ela gera.</p>'
      : run ? `<span class="wfb-exit-badge ${failed ? 'fail' : ''}">${icon(failed ? 'alert' : 'check', 13)} ${failed ? 'Falhou' : 'Sucesso!'}</span><p><b>${h(run.result)}</b></p>
        ${outputs ? `<pre>${h(JSON.stringify(outputs, null, 2))}</pre>` : '<p class="wf-sub">Esta etapa não gera dados para as próximas.</p>'}
        ${editor.test.contact ? `<p class="wf-sub">Teste com ${h(editor.test.contact)}. Nada foi salvo nem enviado.</p>` : ''}`
      : '<span class="wfb-exit-badge off">Não executada</span><p class="wf-sub">O último teste não passou por esta etapa (outro ramo, filtro ou fim do fluxo).</p>'}</aside>`;
  const stop = spec?.branch || ['goto', 'end', 'wait', 'goal', 'filter'].includes(step.type) ? '' : `<label class="wf-check wfb-stop"><input type="checkbox" data-wf-stop="${h(step.id)}" ${step.config.stopOnError ? 'checked' : ''}>
    <span><b>Erro interrompe o fluxo</b><small>Se esta etapa falhar, a execução para e fica marcada como “Falhou”.</small></span></label>`;
  return `<div class="wf-inspector-head"><h2>${icon(spec?.icon || 'flow', 18)} ${h(spec?.label || 'Ação')}</h2>${close}</div>
    <div class="wfb-modal-cols">${entry(c, editor, step.id)}<div class="wfb-config">${spec?.description ? `<p class="wf-action-desc">${h(spec.description)}</p>` : ''}${body}${stop}
    <div class="wf-node-tools">${btn('node-up', 'Antes', { glyph: 'left', disabled: !place || place.index === 0 })}
      ${btn('node-down', 'Depois', { glyph: 'right', disabled: !place || place.index === place.list.length - 1 })}
      ${btn('node-duplicate', 'Duplicar', { glyph: 'copy' })}
      ${btn('node-delete', spec?.branch ? 'Remover com os ramos' : 'Remover', { cls: 'wf-text', glyph: 'trash' })}</div></div>${exit}</div>`;
}

/* ───────── Entrada: dados e funções disponíveis para a etapa ───────── */

const triggerData = {
  customer_replied: [['body', 'Mensagem recebida'], ['channel', 'Canal']], form_submitted: [['formId', 'Formulário']], survey_submitted: [['formId', 'Pesquisa']],
  quiz_submitted: [['formId', 'Quiz'], ['tier', 'Faixa do resultado']], pipeline_stage_changed: [['stageId', 'Etapa']], opportunity_status_changed: [['status', 'Status']],
  invoice_status: [['status', 'Status'], ['total', 'Valor']], payment_received: [['total', 'Valor pago']], order_submitted: [['storeId', 'Loja'], ['total', 'Total']], order_paid: [['storeId', 'Loja'], ['total', 'Total']],
  review_received: [['score', 'Nota']], chat_started: [['widgetId', 'Chat']], webinar_registered: [['webinarId', 'Webinar']], trigger_link_clicked: [['linkId', 'Link']], email_event: [['event', 'Evento'], ['campaignId', 'Campanha']],
  contact_tag: [['tag', 'Tag'], ['change', 'Adicionada ou removida']], contact_changed: [['fields', 'Campos alterados']], note_changed: [['body', 'Texto novo da nota']],
  custom_event: [['event', 'Nome do evento']],
  user_replied: [['body', 'Mensagem da equipe'], ['channel', 'Canal'], ['user', 'Quem respondeu']], message_failed: [['reason', 'Motivo da falha'], ['channel', 'Canal'], ['body', 'Mensagem não entregue']],
  prospect_received: [['company', 'Empresa'], ['website', 'Site'], ['city', 'Cidade'], ['category', 'Categoria']],
  affiliate_campaign_enrolled: [['campaign', 'Campanha'], ['affiliateId', 'Afiliado']], course_started: [['course', 'Curso'], ['title', 'Aula']],
  course_module_started: [['course', 'Curso'], ['module', 'Módulo'], ['title', 'Aula']], course_module_completed: [['course', 'Curso'], ['module', 'Módulo'], ['title', 'Aula']], appointment_status: [['status', 'Status']],
  community_post_created: [['community', 'Comunidade'], ['title', 'Título do post'], ['body', 'Texto do post']], community_comment_created: [['community', 'Comunidade'], ['title', 'Post comentado'], ['body', 'Comentário']],
  community_join_requested: [['community', 'Comunidade'], ['answers', 'Respostas de entrada']], community_join_rejected: [['community', 'Comunidade']],
  community_access_revoked: [['community', 'Comunidade'], ['reason', 'Motivo (left, removed, banned ou workflow)']], portal_login: [['first', 'Primeiro acesso (yes ou no)']],
  conversation_sla: [['state', 'Situação (soon ou overdue)'], ['channel', 'Canal'], ['minutes', 'Minutos sem resposta'], ['body', 'Mensagem do cliente']],
  coupon_expired: [['code', 'Código do cupom'], ['title', 'Nome do cupom'], ['end', 'Fim da validade']],
  coupon_applied: [['code', 'Código do cupom'], ['title', 'Nome do cupom'], ['discount', 'Desconto'], ['total', 'Total do carrinho']],
  product_viewed: [['title', 'Produto'], ['price', 'Preço'], ['productId', 'Produto (id)'], ['storeId', 'Loja (id)']],
  offer_access_granted: [['offer', 'Oferta'], ['offerId', 'ID da oferta']], offer_access_revoked: [['offer', 'Oferta'], ['offerId', 'ID da oferta']],
  community_event_checked_in: [['community', 'Comunidade'], ['title', 'Evento'], ['eventId', 'ID do evento']],
  community_channel_granted: [['community', 'Comunidade'], ['channel', 'Canal'], ['channelId', 'ID do canal']], community_channel_revoked: [['community', 'Comunidade'], ['channel', 'Canal'], ['channelId', 'ID do canal']],
  community_level_changed: [['community', 'Comunidade'], ['level', 'Novo nível'], ['levelName', 'Nome do nível'], ['previous', 'Nível anterior'], ['direction', 'Subiu ou desceu (up ou down)']]
};
const outputKeys = { create_task: [['id', 'ID'], ['title', 'Título'], ['due', 'Prazo']], create_opportunity: [['id', 'ID'], ['title', 'Título'], ['value', 'Valor'], ['stage', 'Etapa']],
  create_invoice: [['id', 'ID'], ['title', 'Título'], ['value', 'Valor'], ['due', 'Vencimento']], math: [['value', 'Resultado']],
  create_contact: [['id', 'ID'], ['name', 'Nome'], ['email', 'E-mail'], ['created', 'Criado agora (yes ou no)']],
  find_contact: [['found', 'Encontrado (yes ou no)'], ['id', 'ID'], ['name', 'Nome'], ['email', 'E-mail'], ['phone', 'Telefone']],
  merge_contact: [['merged', 'Duplicados mesclados'], ['id', 'ID do contato mantido'], ['name', 'Nome']],
  booking_link: [['url', 'Link de agendamento'], ['expires', 'Vence em']],
  email_verify: [['email_status', 'Situação (valid, invalid ou unknown)'], ['email_motivo', 'Motivo']],
  company_create: [['id', 'ID da empresa'], ['name', 'Nome da empresa'], ['created', 'Criada agora (yes ou no)']],
  company_update: [['id', 'ID da empresa'], ['name', 'Nome da empresa']], company_clear: [['id', 'ID da empresa'], ['name', 'Nome da empresa']],
  book_appointment: [['id', 'ID do agendamento'], ['start', 'Início'], ['end', 'Fim'], ['service', 'Serviço'], ['staff', 'Profissional']],
  find_opportunity: [['found', 'Encontrada (yes ou no)'], ['id', 'ID'], ['title', 'Título'], ['value', 'Valor'], ['stage', 'Etapa'], ['status', 'Status'], ['owner', 'Dono']] };
const functionGroups = [
  ['Condicionais', ['if', 'ifempty', 'ifEmpty', 'switch']],
  ['Texto', ['concat', 'upper', 'lower', 'capitalize', 'startcase', 'trim', 'replace', 'substring', 'split', 'length', 'toString', 'urlEncode', 'urlDecode', 'base64', 'ascii', 'stripHTML', 'escapeHTML', 'escapeMarkdown', 'replaceEmojiCharacters', 'indexOf', 'md5', 'sha1', 'sha256', 'sha512', 'toBinary']],
  ['Números', ['parseInt', 'parseNumber', 'media', 'mediana', 'teto', 'piso', 'trunc', 'valorMaximo', 'valorMinimo', 'valorAbsoluto', 'valorArredondado', 'soma', 'desvioPadraoAmostral', 'desvioPadraoPopulacional', 'formatarNumero', 'random']],
  ['Datas', ['now', 'formatDate', 'addSeconds', 'addMinutes', 'addHours', 'addDays', 'addMonths', 'addYears', 'setSeconds', 'setMinutes', 'setHours', 'setDays', 'setMonths', 'setYears']]
];

function entry(c, editor, target) {
  const tab = editor.ioTab || 'vars';
  const item = (token, label, sample = '') => `<button type="button" class="wfb-io-item" data-wf-insert-var="${h(token)}" title="${h(token)}"><span>${h(label)}</span>${sample !== '' && sample != null ? `<small>${h(String(sample).slice(0, 60))}</small>` : `<code>${h(token.replace(/^\{\{|\}\}$/g, ''))}</code>`}</button>`;
  const group = (title, glyph, items) => items.length ? `<details class="wfb-io-group" open><summary>${icon(glyph, 14)} ${h(title)}</summary>${items.join('')}</details>` : '';
  let content;
  if (tab === 'fns') {
    const known = new Set(functionGroups.flatMap(([, names]) => names));
    const groups = [...functionGroups, ['Listas e objetos', FUNCTION_CATALOG.map(fn => fn.name).filter(name => !known.has(name))]];
    content = groups.map(([title, names]) => {
      const fns = names.map(name => FUNCTION_CATALOG.find(fn => fn.name === name)).filter(Boolean);
      return fns.length ? `<div class="wfb-fn-group"><h4>${h(title)}</h4><div class="wfb-fn-chips">${fns.map(fn =>
        `<button type="button" class="wfb-fn" data-wf-insert-var="{{${h(fn.example.replace(/\$IN\.BODY\.[\w.]+/g, 'contact.name'))}}}" title="${h(`${fn.label}: ${fn.signature}`)}">${h(fn.name)}</button>`).join('')}</div></div>` : '';
    }).join('');
  } else {
    const sample = c.s.contacts?.[0];
    const contactItems = [['first_name', 'Primeiro nome', sample?.name?.split(' ')[0]], ['name', 'Nome completo', sample?.name], ['email', 'E-mail', sample?.email], ['phone', 'Telefone', sample?.phone], ['company', 'Empresa', sample?.company], ['tags', 'Tags', sample?.tags?.join(', ')]]
      .map(([key, label, value]) => item(`{{contact.${key}}}`, label, value))
      .concat((c.s.customFields || []).filter(row => row.object === 'Contact').map(row => item(`{{contact.custom_fields.${row.id}}}`, row.name, sample?.custom?.[row.id])));
    const triggerItems = [...new Map(editor.row.triggers.flatMap(t => [...(triggerData[t.type] || []), ...(t.type === 'inbound_webhook' ? [['campo', 'Campo do JSON recebido (troque “campo”)']] : [])])).entries()].map(([key, label]) => item(`{{trigger.${key}}}`, label));
    const varItems = [], stepItems = [];
    let n = 0;
    eachStep(editor.row.steps, step => {
      n++;
      if (step.id === target) return;
      if (step.type === 'set_variable' && step.config.name) varItems.push(item(`{{vars.${step.config.name}}}`, step.config.name, editor.test?.vars?.[step.config.name]));
      for (const [key, label] of outputKeys[step.type] || []) stepItems.push(item(`{{steps.${step.id}.${key}}}`, `#${n} ${actionSpec(step.type).label} · ${label}`, editor.test?.outputs?.[step.id]?.[key]));
    });
    content = group('Contato', 'contacts', contactItems) + group('Gatilho', 'bolt', triggerItems) + group('Variáveis do fluxo', 'key', varItems)
      + group('Etapas', 'flow', stepItems) + group('Workspace', 'gear', [item('{{workspace.name}}', 'Nome do workspace', c.s.profile?.name)]);
  }
  return `<div class="wfb-entry" aria-label="Dados disponíveis"><h3>Entrada</h3>
    <div class="wfb-entry-tabs" role="tablist">${[['vars', 'Variáveis', 'code'], ['fns', 'Funções', 'gear']].map(([key, label]) =>
      `<button type="button" role="tab" aria-selected="${tab === key}" class="${tab === key ? 'current' : ''}" data-wf="io-tab" data-wf-id="${key}">${h(label)}</button>`).join('')}</div>
    <label class="wf-search wfb-entry-search">${icon('search', 15)}<span class="sr-only">Buscar dado ou função</span><input type="search" data-wf-io-search placeholder="Buscar…"></label>
    <div class="wfb-entry-list">${content}</div><p class="wf-sub wfb-entry-hint">Clique para inserir no campo selecionado.</p></div>`;
}

export function testReport(editor, s) {
  const result = editor.test;
  if (!result) return '';
  const label = id => { const step = findStep(editor.row, id); return step ? actionSpec(step.type)?.label || step.type : 'Etapa'; };
  const ch = result.changes || {};
  const list = (title, rows) => rows?.length ? `<li><b>${h(title)}</b> ${rows.map(row => h(typeof row === 'string' ? row : `${row.channel || row.kind}: ${row.body || row.url || row.phone || ''}`)).join(' · ')}</li>` : '';
  return `<div class="wfb-test-report"><p>${result.status === 'Completed' ? 'Execução concluída' : result.status === 'Failed' ? 'Execução interrompida por erro' : result.status} com <b>${h(result.contact || 'o contato')}</b>. Nada foi salvo nem enviado.</p>
    <ol>${result.trace.map(row => `<li><b>${h(label(row.id))}</b><span>${h(row.result)}</span></li>`).join('') || '<li>Nenhuma etapa executada.</li>'}</ol>
    <h3>O que aconteceria</h3><ul>${list('Tags adicionadas:', ch.tagsAdded) + list('Tags removidas:', ch.tagsRemoved) + list('Mensagens:', ch.messages) + list('Tarefas:', ch.tasks) + list('Oportunidades:', ch.opportunities) + list('Faturas:', ch.invoices) + list('Envios externos (não feitos no teste):', ch.queued) || '<li>Nenhuma alteração no CRM.</li>'}</ul></div>`;
}

/* ───────── Seletores ───────── */

export function pickerHtml(kind, data = '') {
  const groups = kind === 'trigger' ? triggerCatalog : actionCatalog;
  return `<div class="wf-picker" ${data}>
    <label class="wf-search">${icon('search', 17)}<span class="sr-only">Buscar</span><input type="search" placeholder="Buscar ${kind === 'trigger' ? 'gatilho' : 'ação'}…" data-wf-action-search autofocus></label>
    ${groups.map(group => `<div class="wf-picker-category"><h3 class="wf-picker-category-title">${h(group.group)}</h3><div class="wf-picker-grid">${group.items.map(item =>
      btn(kind === 'trigger' ? 'trigger-insert' : 'node-insert', `<span class="wf-node-icon">${icon(item.icon, 20)}</span><span><strong>${h(item.label)}</strong>${item.scheduled ? '<small>Agendado</small>' : item.branch ? '<small>Cria ramificações</small>' : ''}</span>`,
        { id: item.type, cls: 'wf-picker-option' })).join('')}</div></div>`).join('')}
    <p data-wf-no-actions hidden role="status">Nada encontrado.</p></div>`;
}

/* ───────── Edição ───────── */

const condList = (row, scope) => {
  const [id, routeId] = scope.split(':'), step = findStep(row, id);
  if (!step) return null;
  if (routeId) { const route = step.routes?.find(item => item.id === routeId); return route ? { holder: route, key: 'conditions', matchHolder: route } : null; }
  return { holder: step.config, key: 'conditions', matchHolder: step.config };
};

// Applies a click on a builder control. Returns { focus, reveal } when it changed the draft, or null when the op is not a builder op.
export function builderClick(op, target, editor, { pick }) {
  const row = editor.row, id = target.dataset.wfId;
  switch (op) {
    case 'trigger-add': pick('trigger', ''); return { picked: true };
    case 'io-tab': editor.ioTab = id === 'fns' ? 'fns' : 'vars'; return { changed: false, render: true, focus: `.wfb-entry-tabs [data-wf-id="${id}"]` };
    case 'node-add': pick('action', `data-wf-list="${h(target.dataset.wfList)}" data-wf-index="${h(target.dataset.wfIndex)}"`); return { picked: true };
    case 'trigger-insert': {
      if (row.triggers.length >= 10) throw Error('Um fluxo aceita até 10 gatilhos.');
      const trigger = { id: stepId(), type: id, config: defaults(triggerSpec(id)) };
      row.triggers.push(trigger);
      editor.node = `t:${trigger.id}`;
      return { changed: true, closePicker: true, focus: '.wf-inspector select, .wf-inspector input' };
    }
    case 'node-insert': {
      if (count(row) >= MAX_STEPS) throw Error(`Um fluxo aceita até ${MAX_STEPS} etapas.`);
      const picker = target.closest('.wf-picker'), list = listByKey(row, picker.dataset.wfList);
      if (!list) return { closePicker: true };
      const step = newStep(id);
      list.splice(Math.min(Number(picker.dataset.wfIndex) || 0, list.length), 0, step);
      editor.node = step.id;
      return { changed: true, closePicker: true, focus: '.wf-inspector textarea, .wf-inspector input, .wf-inspector select', reveal: true };
    }
    case 'trigger-delete':
      row.triggers = row.triggers.filter(item => item.id !== id);
      editor.node = null;
      return { changed: true };
    case 'node-delete': case 'node-up': case 'node-down': case 'node-duplicate': {
      const place = parentOf(row, editor.node);
      if (!place) return null;
      if (op === 'node-delete') { place.list.splice(place.index, 1); editor.node = null; }
      else if (op === 'node-duplicate') {
        if (count(row) >= MAX_STEPS) throw Error(`Um fluxo aceita até ${MAX_STEPS} etapas.`);
        const copy = structuredClone(place.list[place.index]);
        const fresh = node => { node.id = stepId(); (node.routes || []).forEach(route => { route.id = stepId(); route.steps?.forEach(fresh); }); ['yes', 'no', 'otherwise', 'body'].forEach(part => node[part]?.forEach(fresh)); };
        fresh(copy);
        let n = 0; eachStep([copy], () => n++);
        if (count(row) + n > MAX_STEPS) throw Error(`Um fluxo aceita até ${MAX_STEPS} etapas.`);
        place.list.splice(place.index + 1, 0, copy);
        editor.node = copy.id;
      } else {
        const to = place.index + (op === 'node-up' ? -1 : 1);
        if (to < 0 || to >= place.list.length) return null;
        [place.list[place.index], place.list[to]] = [place.list[to], place.list[place.index]];
      }
      return { changed: true, focus: '.wf-inspector [data-wf]', reveal: true };
    }
    case 'route-add': {
      const step = findStep(row, editor.node);
      if (!step || (step.routes || []).length >= 6) return null;
      if (step.type === 'split') step.routes.push({ id: stepId(), label: `Caminho ${String.fromCharCode(65 + step.routes.length)}`, percent: 0, steps: [] });
      else step.routes.push({ id: stepId(), label: `Caminho ${step.routes.length + 1}`, match: 'all', conditions: [condition()], steps: [] });
      return { changed: true };
    }
    case 'route-delete': {
      const step = findStep(row, editor.node);
      if (!step || step.routes.length < (step.type === 'split' ? 3 : 2)) return null;
      step.routes = step.routes.filter(route => route.id !== id);
      return { changed: true };
    }
    case 'cond-add': case 'cond-delete': {
      const ref = condList(row, target.dataset.wfScope);
      if (!ref) return null;
      ref.holder.conditions ??= [];
      if (op === 'cond-add') { if (ref.holder.conditions.length >= 10) throw Error('Use até 10 condições.'); ref.holder.conditions.push(condition()); }
      else ref.holder.conditions.splice(Number(target.dataset.wfIndex), 1);
      return { changed: true };
    }
    default: return null;
  }
}

// Applies typing/selection in the inspector. Returns 'render' when the inspector must be redrawn, 'live' when only text changed, or null.
export function builderInput(input, editor, c, finalChange) {
  const row = editor.row;
  if (input.dataset.wfCfg) {
    const target = input.dataset.wfTarget;
    const holder = target.startsWith('t:') ? row.triggers.find(item => `t:${item.id}` === target)?.config : findStep(row, target)?.config;
    if (!holder) return null;
    let value = input.value;
    if (input.type === 'number') value = value === '' ? '' : Number(value);
    if (input.type === 'datetime-local') value = value ? new Date(value).toISOString() : '';
    holder[input.dataset.wfCfg] = value;
    updateCard(c, editor, target);
    if (input.tagName === 'TEXTAREA') {
      const preview = document.querySelector(`[data-wf-preview="${CSS.escape(input.dataset.wfCfg)}"]`);
      if (preview) {
        const sample = c.s.contacts?.[0] || { name: 'Lucas Silva', email: 'lucas@exemplo.com' };
        const out = resolveTemplate(input.value, { ...buildWorkflowContext(c.s, row, sample), workspace: { name: c.s.profile?.name || '' } });
        preview.textContent = (typeof out === 'string' ? out : JSON.stringify(out)) || '(vazio)';
      }
    }
    return input.tagName === 'SELECT' && finalChange ? 'render' : 'live';
  }
  if (input.dataset.wfStop) {
    const step = findStep(row, input.dataset.wfStop);
    if (!step) return null;
    if (input.checked) step.config.stopOnError = true; else delete step.config.stopOnError;
    return 'live';
  }
  if (input.dataset.wfRouteLabel) {
    const step = findStep(row, input.dataset.wfTarget), route = step?.routes?.find(item => item.id === input.dataset.wfRouteLabel);
    if (!route) return null;
    route.label = input.value.slice(0, 60);
    return finalChange ? 'render' : 'live';
  }
  if (input.dataset.wfRoutePercent) {
    const step = findStep(row, input.dataset.wfTarget), route = step?.routes?.find(item => item.id === input.dataset.wfRoutePercent);
    if (!route) return null;
    route.percent = splitPercent(input.value);
    return finalChange ? 'render' : 'live';
  }
  if (input.dataset.wfMatch) {
    const ref = condList(row, input.dataset.wfMatch);
    if (!ref) return null;
    ref.matchHolder.match = input.value === 'any' ? 'any' : 'all';
    return 'render';
  }
  if (input.dataset.wfCond) {
    const ref = condList(row, input.dataset.wfCond), cond = ref?.holder.conditions?.[Number(input.dataset.wfCondIndex)];
    if (!cond) return null;
    const prop = input.dataset.wfCondProp;
    cond[prop] = input.value;
    if (prop === 'subject') { const subject = conditionSubjects.find(item => item[0] === input.value); Object.assign(cond, { op: subject[2][0][0], key: '', value: '' }); }
    updateCard(c, editor, input.dataset.wfCond.split(':')[0]);
    return input.tagName === 'SELECT' && finalChange ? 'render' : 'live';
  }
  return null;
}

function updateCard(c, editor, target) {
  const node = document.querySelector(`.wfb-node[data-wf-id="${CSS.escape(target)}"]`);
  if (!node) return;
  const detail = target.startsWith('t:') ? triggerSummary(editor.row.triggers.find(item => `t:${item.id}` === target) || {}, c.s) : stepSummary(findStep(editor.row, target) || {}, c.s);
  const small = node.querySelector('[data-wf-detail]');
  small.textContent = detail || '';
  small.hidden = !detail;
}

export const nodeExists = (editor, key) => !key || (key.startsWith('t:') ? editor.row.triggers.some(item => `t:${item.id}` === key) : Boolean(findStep(editor.row, key)));

export function workflowTriggerText(row, s) {
  const tree = upgradeWorkflow(row);
  if (!tree.triggers.length) return 'Sem gatilho (entrada manual ou por outro fluxo)';
  const first = tree.triggers[0], label = triggerSpec(first.type)?.label || first.type, detail = triggerSummary(first, s);
  return `${label}${detail ? ` · ${detail}` : ''}${tree.triggers.length > 1 ? ` + ${tree.triggers.length - 1}` : ''}`;
}
