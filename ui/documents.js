// Pagamentos → Documentos e contratos: list (status tabs, period, search), templates, content library and
// the block editor (palette, A4 page, properties), with variables and a preview as the client will see
// it. Sending and signing come in item 1.3 (docs/implementation/05-documentos-contratos.md).
import { icon } from './icons.js';
import { h, fmt, pageShell, search } from './screens.js';
import { crmTabs } from './crm.js';
import { designStage, mountDesignStage } from './design-workspace.js';
import { buildWorkflowContext, resolveTemplate } from './expressions.js';
import { recipientIndex, recipientStates, renderCertificate, renderDocument, roleNames } from './document-render.js';
import { askText } from './ask.js';
import {
  blockKinds, cloneBlocks, contactVariables, documentContext, documentFonts, documentKinds, documentStatuses, documentTotal, fieldKinds,
  libraryCategories, lineTotal, newBlock, newId, newRecipient, paymentModes, paymentParts, paymentTimings, recipientColors, recipientRoles, socLibrary, socTemplates, videoEmbed
} from './document-data.js';

const dc = { section: 'documents', status: 'draft', period: 'all', id: '', key: '', rev: '', draft: null, selected: '', dirty: false,
  palette: 'blocks', panel: 'block', preview: false, as: '', fieldRecipient: '', viewport: {}, drag: null };
let env = null;

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const badge = (label, tone = '') => `<span class="badge ${tone}">${h(label)}</span>`;
const label = (list, value) => list.find(([key]) => key === value)?.[1] || '';
const statusBadge = doc => { const [, name, tone] = documentStatuses.find(([key]) => key === doc.status) || documentStatuses[0]; return badge(name, tone); };
const collections = ['documents', 'documentTemplates', 'contentBlocks'];
const recordOf = (c, id) => { for (const key of collections) { const row = (c.s[key] || []).find(item => item.id === id); if (row) return [key, row]; } return [null, null]; };
const contactName = (c, id) => c.s.contacts.find(row => row.id === id)?.name || '';
const editable = () => dc.key !== 'documents' || dc.draft?.status === 'draft';
const titleOf = d => d.title ?? d.name ?? '';
const option = (value, text, chosen) => `<option value="${h(value)}"${value === chosen ? ' selected' : ''}>${h(text)}</option>`;
const colorOf = (d, recipientId) => recipientColors[Math.max(0, (d.recipients || []).findIndex(row => row.id === recipientId)) % recipientColors.length];
const fileData = (c, id) => c.s.files.find(file => file.id === id)?.data || '';
const images = c => c.s.files.filter(file => file.data?.startsWith('data:image/') && !file.trashedAt);
const pdfs = c => c.s.files.filter(file => file.data?.startsWith('data:application/pdf') && !file.trashedAt);
const pills = html => String(html || '').replace(/\{\{[^{}<>]+\}\}/g, match => `<span class="dc-var" contenteditable="false">${match}</span>`);
const unpill = html => String(html || '').replace(/<span class="dc-var"[^>]*>([\s\S]*?)<\/span>/g, '$1');

/* ───────── Lista ───────── */

const statusTabs = [['all', 'Todos'], ['draft', 'Rascunhos'], ['sent', 'Aguardando'], ['completed', 'Concluídos'], ['payments', 'Pagamentos'], ['archived', 'Arquivados']];
const inStatus = (doc, status) => status === 'archived' ? doc.archived : !doc.archived && (status === 'all' || (status === 'payments' ? Boolean(doc.payment) : doc.status === status));
const periods = [['all', 'Qualquer data'], ['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['90', 'Últimos 90 dias']];
const inPeriod = row => dc.period === 'all' || Date.parse(row.updated || row.created) >= Date.now() - Number(dc.period) * 864e5;
const matches = (c, ...values) => { const q = (c.query || '').trim().toLocaleLowerCase('pt-BR'); return !q || values.some(v => String(v || '').toLocaleLowerCase('pt-BR').includes(q)); };
const byUpdated = (a, b) => (b.updated || b.created || '').localeCompare(a.updated || a.created || '');

function documentsList(c) {
  const all = c.s.documents || [];
  const rows = all.filter(doc => inStatus(doc, dc.status) && inPeriod(doc) && matches(c, doc.title, contactName(c, doc.contactId))).sort(byUpdated);
  const segment = `<div class="dc-segment" role="group" aria-label="Situação dos documentos">${statusTabs.map(([value, text]) =>
    `<button type="button" data-dc-status="${value}" aria-pressed="${dc.status === value}">${text} <span>${all.filter(doc => inStatus(doc, value)).length}</span></button>`).join('')}</div>`;
  const toolbar = `<div class="toolbar dc-toolbar">${search(c.query, 'Buscar por título ou cliente…')}
    <label class="dc-period"><span class="sr-only">Período</span><select data-dc-period>${periods.map(([value, text]) => option(value, text, dc.period)).join('')}</select></label></div>`;
  const table = rows.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Título</th><th scope="col">Status</th><th scope="col">Cliente</th><th scope="col">Alterado em</th><th scope="col" class="right">Valor</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
    <tbody>${rows.map(doc => `<tr><td><a class="dc-title" data-no-translate="1" href="#payments/document/${h(doc.id)}">${h(doc.title)}</a><small class="dim">${h(label(documentKinds, doc.kind))}</small></td>
      <td>${statusBadge(doc)}${doc.archived ? ` ${badge('Arquivado')}` : ''}</td><td>${h(contactName(c, doc.contactId) || '—')}</td>
      <td>${h(fmt(doc.updated || doc.created, c.s.profile.timezone, true))}</td><td class="right"><b>${money(doc.total)}</b></td>
      <td class="right dc-actions">${actionButtons([['edit', doc.status === 'draft' ? 'Editar' : 'Abrir', `href="#payments/document/${h(doc.id)}"`],
        ['copy', 'Duplicar', `data-dc-act="duplicate" data-id="${h(doc.id)}"`], ['file', 'Salvar como modelo', `data-dc-act="to-template" data-id="${h(doc.id)}"`],
        ['folder', doc.archived ? 'Desarquivar' : 'Arquivar', `data-dc-act="archive" data-id="${h(doc.id)}"`], ['trash', 'Excluir', `data-dc-act="delete" data-key="documents" data-id="${h(doc.id)}"`]], doc.title)}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="surface empty">${icon('file', 26)}<strong>${all.length ? 'Nenhum documento aqui' : 'Crie sua primeira proposta ou contrato'}</strong>
      <p>${all.length ? 'Tente outra situação, período ou busca.' : 'Comece em branco ou a partir de um modelo. Monte o conteúdo em blocos, inclua a lista de produtos e os campos de assinatura.'}</p>
      ${all.length ? '' : '<button type="button" class="primary" data-dc-act="new">Novo documento</button>'}</div>`;
  return segment + toolbar + table;
}

function actionButtons(list, name) {
  return list.map(([ico, text, attributes]) => attributes.startsWith('href')
    ? `<a class="icon-btn" ${attributes} aria-label="${h(text)}: ${h(name)}" title="${h(text)}">${icon(ico, 16)}</a>`
    : `<button type="button" class="icon-btn" ${attributes} aria-label="${h(text)}: ${h(name)}" title="${h(text)}">${icon(ico, 16)}</button>`).join('');
}

function templatesList(c) {
  const own = (c.s.documentTemplates || []).filter(row => matches(c, row.title)).sort(byUpdated);
  return `<section class="dc-group"><h2>Modelos da Graao</h2><div class="dc-cards">${socTemplates.map(tpl => `<article class="surface dc-card">
      <span class="dc-card-icon">${icon(tpl.kind === 'contract' ? 'book' : 'file', 18)}</span><div><b>${h(tpl.title)}</b><small class="dim">${h(label(documentKinds, tpl.kind))} · ${tpl.blocks.length} blocos</small></div>
      <div class="dc-card-actions"><button type="button" class="secondary" data-dc-act="use" data-id="${tpl.id}">Usar</button><button type="button" class="secondary" data-dc-act="copy-graao-template" data-id="${tpl.id}">Duplicar para editar</button></div></article>`).join('')}</div></section>
    <section class="dc-group"><div class="dc-group-head"><h2>Seus modelos</h2><button type="button" class="secondary" data-dc-act="new-template">${icon('plus', 15)} Novo modelo</button></div>
    <div class="toolbar">${search(c.query, 'Buscar modelos…')}</div>
    ${own.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Título</th><th scope="col">Tipo</th><th scope="col" class="right">Valor</th><th scope="col">Alterado em</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${own.map(tpl => `<tr><td><a class="dc-title" data-no-translate="1" href="#payments/document/${h(tpl.id)}">${h(tpl.title)}</a></td><td>${h(label(documentKinds, tpl.kind))}</td><td class="right">${money(tpl.total)}</td>
        <td>${h(fmt(tpl.updated || tpl.created, c.s.profile.timezone, true))}</td>
        <td class="right dc-actions"><button type="button" class="secondary" data-dc-act="use" data-id="${h(tpl.id)}">Usar</button>${actionButtons([['edit', 'Editar', `href="#payments/document/${h(tpl.id)}"`],
          ['copy', 'Duplicar', `data-dc-act="duplicate-template" data-id="${h(tpl.id)}"`], ['trash', 'Excluir', `data-dc-act="delete" data-key="documentTemplates" data-id="${h(tpl.id)}"`]], tpl.title)}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="dim dc-note">Salve um documento como modelo, ou crie um do zero, para reaproveitar o conteúdo, os destinatários e as variáveis.</p>`}</section>`;
}

function libraryList(c) {
  const own = (c.s.contentBlocks || []).filter(row => matches(c, row.name)).sort(byUpdated);
  const card = (item, graao) => `<article class="surface dc-card"><span class="dc-card-icon">${icon(blockKinds[item.blocks[0]?.type]?.icon || 'note', 18)}</span>
    <div><b>${h(item.name)}</b><small class="dim">${h(label(libraryCategories, item.category))} · ${item.blocks.length} ${item.blocks.length === 1 ? 'bloco' : 'blocos'}</small></div>
    <div class="dc-card-actions">${graao ? `<button type="button" class="secondary" data-dc-act="copy-graao-block" data-id="${item.id}">Duplicar para editar</button>`
      : `<a class="secondary" href="#payments/document/${h(item.id)}">Editar</a><button type="button" class="icon-btn" data-dc-act="delete" data-key="contentBlocks" data-id="${h(item.id)}" aria-label="Excluir: ${h(item.name)}" title="Excluir">${icon('trash', 16)}</button>`}</div></article>`;
  return `<p class="dim dc-note">Trechos prontos para inserir em qualquer documento pelo editor, na aba Biblioteca.</p>
    <section class="dc-group"><h2>Da Graao</h2><div class="dc-cards">${socLibrary.map(item => card(item, true)).join('')}</div></section>
    <section class="dc-group"><div class="dc-group-head"><h2>Seus itens</h2><button type="button" class="secondary" data-dc-act="new-block">${icon('plus', 15)} Novo item</button></div>
    ${own.length ? `<div class="dc-cards">${own.map(item => card(item, false)).join('')}</div>` : '<p class="dim dc-note">Nenhum item seu ainda. Duplique um item da Graao ou crie um do zero.</p>'}</section>`;
}

function listView(c) {
  const sections = [['documents', 'Documentos'], ['templates', 'Modelos'], ['library', 'Biblioteca de conteúdo']];
  const body = dc.section === 'templates' ? templatesList(c) : dc.section === 'library' ? libraryList(c) : documentsList(c);
  return pageShell({ title: 'Pagamentos', desc: 'Propostas, contratos e documentos com campos de assinatura, lista de produtos e variáveis.',
    cta: `<button type="button" class="primary" data-dc-act="new">${icon('plus', 16)} Novo documento</button>`,
    tabs: { key: 'payments', items: crmTabs.payments, current: 'documents', label: 'Seções de pagamentos' },
    content: `<div class="dc-page"><nav class="dc-subnav" aria-label="Documentos e contratos">${sections.map(([id, text]) =>
      `<button type="button" data-dc-section="${id}" aria-current="${dc.section === id ? 'page' : 'false'}">${text}</button>`).join('')}</nav>${body}</div>` });
}

/* ───────── Editor: página ───────── */

function previewContext(c, d) {
  const contactId = dc.key === 'documents' ? d.contactId || dc.as : dc.as;
  const contact = c.s.contacts.find(row => row.id === contactId) || null;
  return { ...buildWorkflowContext(c.s, {}, contact), ...documentContext(d, documentTotal(d.blocks)) };
}
// Variables become plain, escaped text: the preview never runs HTML coming from contact data.
function resolved(html, context) {
  return String(html || '').replace(/\{\{[^{}<>]+\}\}/g, match => {
    let value;
    try { value = resolveTemplate(match.replace(/&amp;/g, '&'), context); } catch { value = ''; }
    return value === '' || value == null ? '<mark class="dc-missing">—</mark>' : h(value);
  });
}

function productsHtml(block, preview) {
  const items = block.items || [];
  if (!items.length) return `<div class="dc-placeholder">${icon('pay', 18)} Lista de produtos vazia. Adicione itens no painel à direita.</div>`;
  const total = items.filter(item => !item.optional || item.selected).reduce((n, item) => n + lineTotal(item), 0);
  return `<table class="dc-products"><thead><tr><th>Item</th><th class="num">Qtd.</th><th class="num">Preço</th><th class="num">Desc.</th><th class="num">Total</th></tr></thead>
    <tbody>${items.map(item => `<tr class="${item.optional && !item.selected ? 'off' : ''}"><td>${item.optional ? `<input type="checkbox" ${item.selected ? 'checked' : ''} disabled aria-label="Item opcional"> ` : ''}<b data-no-translate="1">${h(item.name)}</b>${item.optional ? ' <small>(opcional)</small>' : ''}
      ${item.description ? `<small data-no-translate="1">${h(item.description)}</small>` : ''}${item.interval ? `<small>Cobrança ${h({ Weekly: 'semanal', Monthly: 'mensal', Yearly: 'anual' }[item.interval] || 'recorrente')}</small>` : ''}</td>
      <td class="num">${h(item.qty)}</td><td class="num">${money(item.price)}</td><td class="num">${item.discount ? `${h(item.discount)}%` : '—'}</td><td class="num">${money(lineTotal(item))}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td colspan="4">Total</td><td class="num">${money(total)}</td></tr></tfoot></table>`;
}

function blockInner(c, d, block, preview, context) {
  switch (block.type) {
    case 'text': return preview ? `<div class="dc-text" data-no-translate="1">${resolved(block.html, context)}</div>`
      : `<div class="dc-text" data-no-translate="1" contenteditable="${editable()}" data-dc-text="${h(block.id)}" aria-label="Texto do documento">${pills(block.html)}</div>`;
    case 'image': {
      const src = block.fileId ? fileData(c, block.fileId) : block.src;
      return src ? `<figure class="dc-image" style="width:${block.width || 100}%"><img src="${h(src)}" alt="${h(block.alt)}"></figure>`
        : `<div class="dc-placeholder">${icon('palette', 18)} Escolha uma imagem da Mídia Drive ou cole um endereço.</div>`;
    }
    case 'video': {
      const embed = videoEmbed(block.url);
      if (!embed) return `<div class="dc-placeholder">${icon('play', 18)} Cole um link do YouTube, Vimeo ou Loom.</div>`;
      return preview ? `<div class="dc-video"><iframe src="${h(embed)}" title="Vídeo" loading="lazy" allowfullscreen></iframe></div>`
        : `<div class="dc-placeholder dc-video-ph">${icon('play', 22)}<span>${h(block.url)}</span></div>`;
    }
    case 'table': {
      const [head, ...rest] = block.rows || [[]];
      const cells = (row, tag) => `<tr>${row.map(cell => `<${tag}>${preview ? resolved(h(cell), context) : h(cell)}</${tag}>`).join('')}</tr>`;
      return `<table class="dc-table" data-no-translate="1">${block.header ? `<thead>${cells(head, 'th')}</thead><tbody>${rest.map(row => cells(row, 'td')).join('')}</tbody>`
        : `<tbody>${(block.rows || []).map(row => cells(row, 'td')).join('')}</tbody>`}</table>`;
    }
    case 'products': return productsHtml(block, preview);
    case 'columns': return `<div class="dc-columns">${['left', 'right'].map(side => `<div class="dc-column">${(block[side] || []).map(inner => blockShell(c, d, inner, preview, context, true)).join('')
      || '<div class="dc-placeholder">Coluna vazia</div>'}</div>`).join('')}</div>`;
    case 'attachment': {
      const file = c.s.files.find(row => row.id === block.fileId);
      return file ? `<div class="dc-attachment">${icon('paperclip', 18)}<span><b>${h(file.name)}</b><small>PDF anexado ao documento</small></span>${preview ? `<a class="secondary" href="${h(file.data)}" download="${h(file.name)}">Abrir</a>` : ''}</div>`
        : `<div class="dc-placeholder">${icon('paperclip', 18)} Escolha um PDF da Mídia Drive.</div>`;
    }
    case 'page_break': return `<div class="dc-break"><span>Quebra de página</span></div>`;
    case 'field': {
      const recipient = (d.recipients || []).find(row => row.id === block.recipientId);
      const color = colorOf(d, block.recipientId);
      return `<div class="dc-field dc-field-${block.kind}" style="--dc-rec:${color}"><span class="dc-field-kind">${icon(fieldKinds[block.kind]?.icon || 'edit', 15)} <span data-no-translate="1">${h(block.label)}</span>${block.required ? ' <i aria-label="obrigatório">*</i>' : ''}</span>
        <span class="dc-field-box">${block.kind === 'checkbox' ? '<span class="dc-check"></span>' : block.kind === 'date' && block.dateMode === 'signed_at' ? 'Preenchida na assinatura' : block.kind === 'signature' ? 'Assine aqui' : block.kind === 'initials' ? 'Rubrica' : ''}</span>
        ${recipient ? `<small data-no-translate="1">${h(recipient.name || recipient.label)}</small>` : '<small>Sem destinatário</small>'}</div>`;
    }
    default: return '';
  }
}

function blockShell(c, d, block, preview, context, nested = false) {
  const inner = blockInner(c, d, block, preview, context);
  if (preview || !editable()) return `<div class="dc-block dc-${block.type}-block">${inner}</div>`;
  const kind = block.type === 'field' ? fieldKinds[block.kind]?.label : blockKinds[block.type]?.label;
  return `<div class="dc-block dc-${block.type}-block${dc.selected === block.id ? ' selected' : ''}${nested ? ' nested' : ''}" data-dc-block="${h(block.id)}">
    <div class="dc-tools" role="toolbar" aria-label="${h(kind)}"><span class="dc-tag">${h(kind)}</span>
      ${nested ? '' : `<button type="button" class="dc-handle" draggable="true" data-dc-drag="${h(block.id)}" aria-label="Arrastar bloco" title="Arrastar">${icon('hand', 13)}</button>
      <button type="button" data-dc-move="-1" data-id="${h(block.id)}" aria-label="Mover para cima" title="Mover para cima">↑</button>
      <button type="button" data-dc-move="1" data-id="${h(block.id)}" aria-label="Mover para baixo" title="Mover para baixo">↓</button>`}
      <button type="button" data-dc-dup="${h(block.id)}" aria-label="Duplicar bloco" title="Duplicar">${icon('copy', 13)}</button>
      <button type="button" data-dc-del="${h(block.id)}" aria-label="Excluir bloco" title="Excluir">${icon('trash', 13)}</button></div>${inner}</div>`;
}

function pageHtml(c) {
  const d = dc.draft, preview = dc.preview || !editable(), context = preview ? previewContext(c, d) : null;
  const font = documentFonts.find(([key]) => key === d.theme?.font)?.[2] || documentFonts[0][2];
  const logo = d.theme?.logoFileId ? fileData(c, d.theme.logoFileId) : '';
  const blocks = d.blocks.length ? d.blocks.map(block => blockShell(c, d, block, preview, context)).join('')
    : `<div class="dc-empty-page">${icon('file', 26)}<b>Página em branco</b><p>Clique em um bloco à esquerda ou arraste para cá.</p></div>`;
  return `<article class="dc-sheet${preview ? ' preview' : ''}" style="--dc-accent:${h(d.theme?.accent || '#155eef')};--dc-font:${h(font)}" data-dc-sheet>
    ${logo ? `<img class="dc-logo" src="${h(logo)}" alt="">` : ''}<div class="dc-blocks" data-dc-blocks>${blocks}</div></article>`;
}

/* ───────── Editor: paleta e propriedades ───────── */

function paletteHtml(c) {
  const d = dc.draft, isLibrary = dc.key === 'contentBlocks';
  const tabs = [['blocks', 'Blocos'], ...(isLibrary ? [] : [['fields', 'Campos'], ['library', 'Biblioteca']])];
  if (!tabs.some(([id]) => id === dc.palette)) dc.palette = 'blocks';
  const tile = (attributes, ico, text) => `<button type="button" class="fb-tile dc-tile" draggable="true" ${attributes}><span aria-hidden="true">${icon(ico, 16)}</span>${h(text)}</button>`;
  let body = '';
  if (dc.palette === 'blocks') body = `<div class="fb-tiles">${Object.entries(blockKinds).filter(([type]) => type !== 'field' && !(isLibrary && type === 'attachment'))
    .map(([type, kind]) => tile(`data-dc-add="${type}"`, kind.icon, kind.label)).join('')}</div>`;
  if (dc.palette === 'fields') {
    const chosen = d.recipients.some(row => row.id === dc.fieldRecipient) ? dc.fieldRecipient : d.recipients[0]?.id || '';
    body = `<label class="dc-mini">Quem preenche<select data-dc-field-recipient>${d.recipients.map(row => option(row.id, row.name || row.label, chosen)).join('') || '<option value="">Cliente (será criado)</option>'}</select></label>
      <div class="fb-tiles">${Object.entries(fieldKinds).map(([kind, spec]) => tile(`data-dc-add="field" data-kind="${kind}"`, spec.icon, spec.label)).join('')}</div>
      <p class="fb-palette-hint dim">Cada campo pertence a um destinatário. A cor mostra de quem é.</p>`;
  }
  if (dc.palette === 'library') {
    const item = (row, graao) => `<button type="button" class="dc-lib" data-dc-lib="${h(row.id)}"><b>${h(row.name)}</b><small>${h(label(libraryCategories, row.category))}${graao ? ' · Graao' : ''}</small></button>`;
    body = `<div class="dc-lib-list">${socLibrary.map(row => item(row, true)).join('')}${(c.s.contentBlocks || []).map(row => item(row, false)).join('')}</div>
      <p class="fb-palette-hint dim">O trecho entra depois do bloco selecionado.</p>`;
  }
  return `<aside class="fb-palette dw-panel dc-palette" aria-label="Elementos do documento"><div class="fb-palette-tabs" role="tablist">${tabs.map(([id, text]) =>
    `<button role="tab" aria-selected="${dc.palette === id}" data-dc-palette="${id}">${text}</button>`).join('')}</div>
    <div class="fb-palette-body">${body}${dc.palette === 'blocks' ? '<p class="fb-palette-hint dim">Clique para adicionar depois do bloco selecionado ou arraste para a posição.</p>' : ''}</div></aside>`;
}

const field = (text, control, hint = '') => `<label class="dc-prop">${h(text)}${control}${hint ? `<small class="dim">${hint}</small>` : ''}</label>`;
const input = (attributes, value, type = 'text', extra = '') => `<input type="${type}" ${attributes} value="${h(value ?? '')}" ${extra}>`;

function blockProps(c, d) {
  const block = findBlock(d.blocks, dc.selected);
  if (!block) return `<p class="dim dc-note">Selecione um bloco na página para editar. O texto se edita direto na página.</p>`;
  const prop = (name, value, type = 'text', extra = '') => input(`data-dc-prop="${name}"`, value, type, extra);
  switch (block.type) {
    case 'text': return `<div class="dc-format" role="toolbar" aria-label="Formatação">${[['bold', '<b>N</b>', 'Negrito'], ['italic', '<i>I</i>', 'Itálico'], ['underline', '<u>S</u>', 'Sublinhado'],
      ['h1', 'T1', 'Título'], ['h2', 'T2', 'Subtítulo'], ['h3', 'T3', 'Seção'], ['p', '¶', 'Parágrafo'], ['insertUnorderedList', '•', 'Lista'], ['insertOrderedList', '1.', 'Lista numerada'], ['link', icon('link', 14), 'Link'], ['unlink', '⨯', 'Remover link']]
      .map(([cmd, glyph, title]) => `<button type="button" data-dc-cmd="${cmd}" aria-label="${title}" title="${title}">${glyph}</button>`).join('')}</div>
      <p class="dim dc-note">Selecione o texto na página e use os botões. Para inserir uma variável, clique no ponto do texto e escolha abaixo.</p>${variableChips(d)}`;
    case 'image': return field('Imagem da Mídia Drive', `<select data-dc-prop="fileId"><option value="">Nenhuma</option>${images(c).map(file => option(file.id, file.name, block.fileId)).join('')}</select>`)
      + field('Ou endereço da imagem', prop('src', block.src, 'url', 'placeholder="https://"'), 'Usado só quando nenhuma imagem da Mídia Drive está escolhida.')
      + field('Texto alternativo', prop('alt', block.alt)) + field('Largura', `<select data-dc-prop="width">${[25, 50, 75, 100].map(w => option(String(w), `${w}%`, String(block.width || 100))).join('')}</select>`);
    case 'video': return field('Link do vídeo', prop('url', block.url, 'url', 'placeholder="https://youtu.be/…"'), 'YouTube, Vimeo ou Loom. Na prévia e para o cliente, o vídeo toca na página.');
    case 'table': return `<label class="cp-checkbox dc-check-row"><input type="checkbox" data-dc-prop="header" ${block.header ? 'checked' : ''}><span>Primeira linha é cabeçalho</span></label>
      <div class="dc-grid" style="--cols:${block.rows[0]?.length || 1}">${block.rows.map((row, r) => row.map((cell, col) => `<input aria-label="Linha ${r + 1}, coluna ${col + 1}" data-dc-cell="${r},${col}" value="${h(cell)}">`).join('')).join('')}</div>
      <div class="dc-row-actions"><button type="button" class="secondary" data-dc-table="add-row">+ Linha</button><button type="button" class="secondary" data-dc-table="add-col">+ Coluna</button>
      <button type="button" class="secondary" data-dc-table="del-row"${block.rows.length < 2 ? ' disabled' : ''}>− Linha</button><button type="button" class="secondary" data-dc-table="del-col"${(block.rows[0]?.length || 1) < 2 ? ' disabled' : ''}>− Coluna</button></div>`;
    case 'products': return `${block.items.map((item, index) => `<fieldset class="dc-item"><legend>${h(item.name || `Item ${index + 1}`)}</legend>
        ${field('Nome', input(`data-dc-item="name" data-index="${index}"`, item.name))}${field('Descrição', input(`data-dc-item="description" data-index="${index}"`, item.description))}
        <div class="dc-three">${field('Qtd.', input(`data-dc-item="qty" data-index="${index}"`, item.qty, 'number', 'min="0.01" step="any"'))}${field('Preço (R$)', input(`data-dc-item="price" data-index="${index}"`, item.price, 'number', 'min="0" step="0.01"'))}${field('Desc. %', input(`data-dc-item="discount" data-index="${index}"`, item.discount, 'number', 'min="0" max="100" step="any"'))}</div>
        <label class="cp-checkbox dc-check-row"><input type="checkbox" data-dc-item="optional" data-index="${index}" ${item.optional ? 'checked' : ''}><span>Opcional (o cliente escolhe)</span></label>
        ${item.optional ? `<label class="cp-checkbox dc-check-row"><input type="checkbox" data-dc-item="selected" data-index="${index}" ${item.selected ? 'checked' : ''}><span>Vem marcado</span></label>` : ''}
        <div class="dc-row-actions"><span class="dim" data-dc-line="${index}">${money(lineTotal(item))}</span><button type="button" class="icon-btn" data-dc-item-del="${index}" aria-label="Remover ${h(item.name)}" title="Remover">${icon('trash', 15)}</button></div></fieldset>`).join('')}
      ${field('Adicionar produto do catálogo', `<select data-dc-item-add><option value="">Escolha um produto…</option>${c.s.products.filter(p => p.active !== false).map(p => option(p.id, `${p.name} · ${money(p.price)}`, '')).join('')}</select>`)}
      <button type="button" class="secondary" data-dc-item-blank>${icon('plus', 14)} Item avulso</button>
      <p class="dc-total">Total do bloco: <b data-dc-block-total>${money(block.items.filter(item => !item.optional || item.selected).reduce((n, item) => n + lineTotal(item), 0))}</b></p>`;
    case 'columns': return `<p class="dim dc-note">Clique no texto de cada coluna para editar. Adicione blocos às colunas:</p>
      <div class="dc-row-actions">${['left', 'right'].map(side => ['text', 'image'].map(type => `<button type="button" class="secondary" data-dc-col-add="${side}:${type}">+ ${type === 'text' ? 'Texto' : 'Imagem'} à ${side === 'left' ? 'esquerda' : 'direita'}</button>`).join('')).join('')}</div>`;
    case 'attachment': return field('PDF da Mídia Drive', `<select data-dc-prop="fileId"><option value="">Escolha…</option>${pdfs(c).map(file => option(file.id, file.name, block.fileId)).join('')}</select>`,
      pdfs(c).length ? 'O cliente vê o PDF junto com o documento.' : 'Envie um PDF para a Mídia Drive primeiro.');
    case 'page_break': return '<p class="dim dc-note">Começa uma nova página na impressão e na cópia final.</p>';
    case 'field': return field('Tipo', `<select data-dc-prop="kind">${Object.entries(fieldKinds).map(([kind, spec]) => option(kind, spec.label, block.kind)).join('')}</select>`)
      + field('Rótulo', input('data-dc-prop="label"', block.label))
      + field('Quem preenche', `<select data-dc-prop="recipientId">${d.recipients.map(row => option(row.id, row.name || row.label, block.recipientId)).join('')}</select>`)
      + `<label class="cp-checkbox dc-check-row"><input type="checkbox" data-dc-prop="required" ${block.required ? 'checked' : ''}><span>Obrigatório</span></label>`
      + (block.kind === 'date' ? field('Data', `<select data-dc-prop="dateMode">${option('signed_at', 'Preenchida com a data da assinatura', block.dateMode)}${option('pick', 'O destinatário escolhe', block.dateMode)}</select>`) : '');
    default: return '';
  }
}

function variableChips(d) {
  const own = (d.variables || []).map(row => [`doc.${row.key}`, row.label]);
  return `<div class="dc-vars">${[...contactVariables, ...own].map(([path, text]) => `<button type="button" class="dc-chip" data-dc-var="${h(path)}" title="{{${h(path)}}}">${h(text)}</button>`).join('')}</div>`;
}

function documentProps(c, d) {
  if (dc.key === 'contentBlocks') return field('Nome', input('data-dc-doc="name"', d.name, 'text', 'maxlength="120"'))
    + field('Categoria', `<select data-dc-doc="category">${libraryCategories.map(([value, text]) => option(value, text, d.category)).join('')}</select>`);
  const theme = d.theme || {};
  const opportunities = c.s.opportunities.filter(row => !d.contactId || row.contactId === d.contactId);
  return field('Título', input('data-dc-doc="title"', d.title, 'text', 'maxlength="160"'))
    + field('Tipo', `<select data-dc-doc="kind">${documentKinds.map(([value, text]) => option(value, text, d.kind)).join('')}</select>`)
    + (dc.key === 'documents' ? field('Cliente', `<select data-dc-doc="contactId"><option value="">Sem cliente</option>${c.s.contacts.map(row => option(row.id, row.name, d.contactId)).join('')}</select>`, 'Usado nas variáveis {{contact.*}} e como primeiro destinatário.')
      + field('Oportunidade', `<select data-dc-doc="opportunityId"><option value="">Nenhuma</option>${opportunities.map(row => option(row.id, row.title, d.opportunityId)).join('')}</select>`)
      + field('Válido até', input('data-dc-doc="expiresAt"', d.expiresAt, 'date'), 'Depois desta data, o link de assinatura para de funcionar.') : '')
    + `<h3 class="dc-subhead">Tema</h3>`
    + field('Cor de destaque', input('data-dc-theme="accent"', theme.accent || '#155eef', 'color'))
    + field('Fonte', `<select data-dc-theme="font">${documentFonts.map(([value, text]) => option(value, text, theme.font)).join('')}</select>`)
    + field('Logo', `<select data-dc-theme="logoFileId"><option value="">Sem logo</option>${images(c).map(file => option(file.id, file.name, theme.logoFileId)).join('')}</select>`);
}

function recipientProps(c, d) {
  return `<label class="cp-checkbox dc-check-row"><input type="checkbox" data-dc-doc="ordered" ${d.ordered ? 'checked' : ''}><span>Assinar em ordem<small>O próximo só recebe o link depois que o anterior assinar.</small></span></label>
    ${d.recipients.map((row, index) => `<fieldset class="dc-recipient" style="--dc-rec:${recipientColors[index % recipientColors.length]}"><legend><i class="dc-dot"></i>${h(row.label)}</legend>
      ${field('Papel no documento', input(`data-dc-rec="label" data-id="${h(row.id)}"`, row.label, 'text', 'maxlength="60" placeholder="Ex.: Cliente, Testemunha"'))}
      ${dc.key === 'documents' ? field('Contato', `<select data-dc-rec="contactId" data-id="${h(row.id)}"><option value="">Preencher à mão</option>${c.s.contacts.map(contact => option(contact.id, contact.name, row.contactId)).join('')}</select>`)
        + field('Nome', input(`data-dc-rec="name" data-id="${h(row.id)}"`, row.name)) + field('E-mail', input(`data-dc-rec="email" data-id="${h(row.id)}"`, row.email, 'email'))
        : index === 0 ? '<p class="dim dc-note">Preenchido com o cliente de cada documento (ou com o contato da automação).</p>'
        : field('Nome', input(`data-dc-rec="name" data-id="${h(row.id)}"`, row.name)) + field('E-mail', input(`data-dc-rec="email" data-id="${h(row.id)}"`, row.email, 'email'), 'Para alguém fixo, como quem assina pela sua empresa. Deixe em branco para preencher em cada documento.')}
      <div class="dc-two">${field('Ação', `<select data-dc-rec="role" data-id="${h(row.id)}">${recipientRoles.map(([value, text]) => option(value, text, row.role)).join('')}</select>`)}
        ${d.ordered ? field('Ordem', input(`data-dc-rec="order" data-id="${h(row.id)}"`, row.order, 'number', `min="1" max="10"`)) : ''}</div>
      <div class="dc-row-actions"><span class="dim">${d.blocks.filter(block => block.type === 'field' && block.recipientId === row.id).length} campo(s)</span>
        <button type="button" class="icon-btn" data-dc-rec-del="${h(row.id)}" aria-label="Remover ${h(row.label)}" title="Remover"${d.recipients.length < 2 ? ' disabled' : ''}>${icon('trash', 15)}</button></div></fieldset>`).join('')}
    <button type="button" class="secondary" data-dc-rec-add${d.recipients.length >= 10 ? ' disabled' : ''}>${icon('plus', 14)} Adicionar destinatário</button>`;
}

function variableProps(d) {
  return `<p class="dim dc-note">Valores deste documento. No texto, use {{doc.chave}}.</p>
    ${(d.variables || []).map((row, index) => `<fieldset class="dc-item"><legend>{{doc.${h(row.key)}}}</legend>
      <div class="dc-two">${field('Chave', input(`data-dc-variable="key" data-index="${index}"`, row.key, 'text', 'pattern="[a-z][a-z0-9_]*" maxlength="40"'))}${field('Nome', input(`data-dc-variable="label" data-index="${index}"`, row.label))}</div>
      ${field('Valor', input(`data-dc-variable="value" data-index="${index}"`, row.value))}
      <div class="dc-row-actions"><span></span><button type="button" class="icon-btn" data-dc-variable-del="${index}" aria-label="Remover variável" title="Remover">${icon('trash', 15)}</button></div></fieldset>`).join('')}
    <button type="button" class="secondary" data-dc-variable-add>${icon('plus', 14)} Nova variável</button>
    <h3 class="dc-subhead">Variáveis disponíveis</h3>${variableChips(d)}<p class="dim dc-note">Clique no texto da página e depois na variável para inserir.</p>`;
}

function paymentProps(c, d) {
  const pay = d.payment;
  const total = documentTotal(d.blocks);
  const connected = c.pay && !c.pay.error ? Boolean(c.pay.connected) : null;
  const head = field('Cobrança', `<select data-dc-pay="mode"><option value="">Sem cobrança</option>${paymentModes.map(([value, text]) => option(value, text, pay?.mode || '')).join('')}</select>`,
    'Quando todos assinarem, a Graao cria a cobrança no valor total do documento.');
  if (!pay?.mode) return head + '<p class="dim dc-note">O documento só coleta assinaturas.</p>';
  const parts = paymentParts(pay, total);
  const schedule = pay.mode === 'one_time' ? `<h3 class="dc-subhead">Parcelas</h3>
    ${(pay.schedule || []).map((part, index) => `<div class="dc-two dc-part">${field(`Parcela ${index + 1} (%)`, input(`data-dc-part="percent" data-index="${index}"`, part.percent, 'number', 'min="1" max="100" step="any"'))}
      ${field('Vence em (dias)', input(`data-dc-part="dueDays" data-index="${index}"`, part.dueDays, 'number', 'min="0" max="730"'))}<button type="button" class="icon-btn" data-dc-part-del="${index}" aria-label="Remover parcela" title="Remover">${icon('trash', 15)}</button></div>`).join('')}
    <button type="button" class="secondary" data-dc-part-add${(pay.schedule || []).length >= 12 ? ' disabled' : ''}>${icon('plus', 14)} ${(pay.schedule || []).length ? 'Adicionar parcela' : 'Dividir em parcelas'}</button>
    ${(pay.schedule || []).length ? `<p class="dim dc-note">Soma: ${h(String(Math.round((pay.schedule || []).reduce((n, part) => n + Number(part.percent || 0), 0) * 100) / 100).replace('.', ','))}% (precisa dar 100%).</p>` : ''}` : '';
  return head + field('Quando cobrar', `<select data-dc-pay="timing">${paymentTimings.map(([value, text]) => option(value, text, pay.timing || 'on_sign')).join('')}</select>`,
      pay.timing === 'invoice' ? 'A fatura vai junto com a cópia final; o cliente paga pelo link até o vencimento.' : 'Quem assinar por último vai direto para o pagamento (Pix ou cartão).')
    + (pay.timing === 'invoice' && !(pay.schedule || []).length ? field('Vencimento (dias depois de assinar)', input('data-dc-pay="dueDays"', pay.dueDays ?? 7, 'number', 'min="0" max="365"')) : '')
    + schedule
    + `<h3 class="dc-subhead">Resumo</h3><ul class="dc-pay-summary">${parts.length ? parts.map(part => `<li><span>${part.recurring ? 'Todo mês' : part.of > 1 ? `Parcela ${part.index}` : 'Pagamento'}${part.dueDays ? ` · em ${part.dueDays} dias` : ' · ao assinar'}</span><b>${money(part.value)}</b></li>`).join('')
      : '<li>Inclua uma lista de produtos com valor.</li>'}</ul>`
    + (pay.mode === 'recurring' ? '<p class="dim dc-note">A cobrança recorrente é mensal, pelo AbacatePay. Cancelar a assinatura não altera o documento.</p>' : '')
    + (connected === false ? '<p class="dc-warn">Conecte o AbacatePay em Configurações → AbacatePay para receber online. Sem isso, as faturas ficam em Pagamentos para baixa manual.</p>' : '');
}

function propsHtml(c) {
  const d = dc.draft;
  const tabs = dc.key === 'contentBlocks' ? [['block', 'Bloco'], ['document', 'Item']] : [['block', 'Bloco'], ['document', 'Documento'], ['recipients', 'Destinatários'], ['variables', 'Variáveis'], ['payment', 'Pagamento']];
  if (!tabs.some(([id]) => id === dc.panel)) dc.panel = 'block';
  const body = dc.panel === 'document' ? documentProps(c, d) : dc.panel === 'recipients' ? recipientProps(c, d) : dc.panel === 'variables' ? variableProps(d)
    : dc.panel === 'payment' ? paymentProps(c, d) : blockProps(c, d);
  return `<aside class="fb-props dw-panel dc-props" aria-label="Propriedades"><div class="fb-palette-tabs" role="tablist">${tabs.map(([id, text]) =>
    `<button role="tab" aria-selected="${dc.panel === id}" data-dc-panel="${id}">${text}</button>`).join('')}</div><div class="dc-props-body">${body}</div></aside>`;
}

/* ───────── Editor: tela ───────── */

function normalize(key, row) {
  const d = structuredClone(row);
  d.blocks ||= [];
  if (key !== 'contentBlocks') { d.recipients ||= []; d.variables ||= []; d.theme ||= { accent: '#155eef', font: 'sans', logoFileId: '' }; }
  else d.recipients = [];
  return d;
}
function loadDraft(c) {
  const id = c.studio?.project || '';
  const [key, row] = recordOf(c, id);
  if (!row) return null;
  const rev = row.updated || row.created;
  if (dc.id !== id || (!dc.dirty && dc.rev !== rev)) {
    const same = dc.id === id;
    Object.assign(dc, { id, key, rev, draft: normalize(key, row), dirty: false, selected: same ? dc.selected : '', panel: same ? dc.panel : 'block',
      palette: same ? dc.palette : 'blocks', preview: same ? dc.preview : false, viewport: same ? dc.viewport : {} });
  }
  return row;
}

function editorView(c) {
  const row = loadDraft(c);
  if (!row) return `<div class="page"><div class="surface empty">${icon('file', 26)}<strong>Documento não encontrado</strong><p>Pode ter sido excluído.</p><a class="primary" href="#payments/documents">Voltar aos documentos</a></div></div>`;
  if (dc.key === 'documents' && row.status !== 'draft') return sentView(c, row);
  const d = dc.draft, isDoc = dc.key === 'documents', locked = !editable();
  const what = isDoc ? label(documentKinds, d.kind) : dc.key === 'documentTemplates' ? 'Modelo' : 'Biblioteca de conteúdo';
  const previewBar = dc.preview && !isDoc ? `<label class="dc-as">Ver como<select data-dc-as><option value="">Contato de exemplo</option>${c.s.contacts.map(row => option(row.id, row.name, dc.as)).join('')}</select></label>` : '';
  const stage = designStage({ label: `<span data-dc-board-name data-no-translate="1">${h(titleOf(d))}</span>`, width: 794, content: pageHtml(c),
    tools: locked ? '' : `<button type="button" data-dc-preview aria-pressed="${dc.preview}" title="Ver como o cliente verá">${icon('external', 15)} Prévia</button>` });
  return `<div class="fb dc dw-workspace">
    <header class="fb-top dw-header"><a class="secondary fb-back" href="#payments/documents">${icon('left', 15)} Documentos</a>
      <div class="fb-title"><h1 data-no-translate="1">${h(titleOf(d) || 'Sem título')}</h1>${badge(what)}${isDoc ? statusBadge(d) : ''}<span class="dc-sum">${money(documentTotal(d.blocks))}</span>${dc.dirty ? badge('Alterações não salvas', 'blue') : ''}</div>
      <div class="fb-top-actions">${previewBar}${locked ? '' : `<button type="button" class="secondary" data-dc-preview aria-pressed="${dc.preview}">${dc.preview ? 'Voltar a editar' : 'Prévia'}</button>`}
        ${isDoc ? `<button type="button" class="secondary" data-dc-act="to-template" data-id="${h(dc.id)}">Salvar como modelo</button>` : ''}
        ${locked || dc.preview ? '' : `<button type="button" class="${isDoc ? 'secondary' : 'primary'}" data-dc-save${dc.dirty ? '' : ' disabled'}>Salvar</button>`}
        ${isDoc && !locked ? `<button type="button" class="primary" data-dc-act="send" data-id="${h(dc.id)}">${icon('send', 15)} Enviar</button>` : ''}
        <button type="button" class="icon-btn" data-dc-act="delete" data-key="${dc.key}" data-id="${h(dc.id)}" aria-label="Excluir" title="Excluir">${icon('trash', 16)}</button></div></header>
    ${locked ? '<p class="dc-locked" role="status">Este documento já foi enviado e não pode mais ser editado. Para mudar algo, anule e duplique.</p>' : ''}
    <div class="fb-edit dw-columns dc-columns-wrap${dc.preview || locked ? ' previewing' : ''}">${dc.preview || locked ? '' : paletteHtml(c)}${stage}${dc.preview || locked ? '' : propsHtml(c)}</div></div>`;
}

/* ───────── Documento enviado: acompanhamento ───────── */

const trailNames = { created: 'Criado', sent: 'Enviado', viewed: 'Visualizado', signed: 'Assinado', approved: 'Aprovado', declined: 'Recusado', void: 'Anulado',
  expired: 'Vencido', completed: 'Concluído', link: 'Novo link gerado', delivered: 'Entrega', charge: 'Cobrança criada', payment: 'Pagamento', paid: 'Pago' };
const payStates = { configured: 'Cobrança ao concluir', pending: 'Aguardando pagamento', partial: 'Pago em parte', paid: 'Pago', none: 'Sem valor a cobrar' };
function paymentSection(c, doc) {
  const pay = doc.payment;
  if (!pay) return '';
  const invoices = (pay.invoiceIds || []).map(id => c.s.invoices.find(row => row.id === id)).filter(Boolean);
  const sub = pay.subscription;
  const rows = invoices.map(row => `<li><span data-no-translate="1">${h(row.title)}</span><small>${money(row.value)} · vence ${h(fmt(row.due, c.s.profile.timezone))}</small>${badge(row.status === 'Paid' ? 'Paga' : row.status === 'Void' ? 'Anulada' : 'Em aberto', row.status === 'Paid' ? 'green' : 'blue')}</li>`).join('');
  return `<section><h2>Pagamento</h2><p class="dc-pay-state">${badge(payStates[pay.status || 'configured'] || pay.status, pay.status === 'paid' ? 'green' : pay.status === 'partial' ? 'gold' : 'blue')}
    <small>${h(label(paymentModes, pay.mode))} · ${h(label(paymentTimings, pay.timing))}</small></p>
    ${rows ? `<ul class="dc-pay-list">${rows}</ul><a class="secondary" href="#payments/invoices">Ver em Faturas</a>` : ''}
    ${sub ? `<p class="dc-note">Assinatura mensal de <b>${money(sub.amount)}</b>: ${h({ pending: 'aguardando a primeira mensalidade', active: 'ativa', cancelled: 'cancelada' }[sub.status] || sub.status)}${sub.payments?.length ? ` · ${sub.payments.length} mensalidade(s) paga(s)` : ''}</p>` : ''}
    ${!rows && !sub && doc.status !== 'completed' ? `<p class="dim dc-note">As faturas são criadas quando todos assinarem (${money(doc.total)}).</p>` : ''}</section>`;
}
function sentView(c, doc) {
  const zone = c.s.profile.timezone;
  const live = doc.status === 'sent';
  const people = doc.recipients.map(row => `<article class="surface dc-person dc-rec-${recipientIndex(doc, row.id)}"><i class="dc-dot"></i>
      <div><b data-no-translate="1">${h(row.name || row.label)}</b><small><span data-no-translate="1">${h(row.email)}</span> · ${h(roleNames[row.role] || '')}${doc.ordered && row.role !== 'cc' ? ` · ${row.order}º` : ''}</small>
        <small>${h(recipientStates[row.status] || row.status || '')}${row.signedAt ? ` em ${h(fmt(row.signedAt, zone, true))}` : row.viewedAt ? ` em ${h(fmt(row.viewedAt, zone, true))}` : ''}</small></div>
      <div class="dc-person-actions">${(live && ['sent', 'viewed'].includes(row.status)) || (doc.status === 'completed' && row.email) ? `<button type="button" class="secondary" data-dc-act="link" data-id="${h(doc.id)}" data-recipient="${h(row.id)}">Copiar novo link</button>
        <button type="button" class="secondary" data-dc-act="resend" data-id="${h(doc.id)}" data-recipient="${h(row.id)}">${doc.status === 'completed' ? 'Reenviar cópia' : 'Reenviar'}</button>` : ''}</div></article>`).join('');
  const trail = [...(doc.audit || [])].reverse().map(entry => `<li><b>${h(trailNames[entry.event] || entry.event)}</b> · ${h(fmt(entry.at, zone, true))}${entry.detail ? ` · <span data-no-translate="1">${h(entry.detail)}</span>` : ''}${entry.ip ? ` · IP ${h(entry.ip)}` : ''}</li>`).join('');
  const notes = { sent: 'Aguardando assinaturas. Cada destinatário tem um link pessoal (as entregas aparecem na trilha); você pode copiar um novo link ou reenviar.', completed: 'Assinado por todos. A cópia final com o certificado segue para cada destinatário; confira as entregas na trilha de auditoria.',
    declined: `Recusado${doc.declineReason ? `: “${doc.declineReason}”` : '.'} Anule e duplique para mandar uma nova versão.`, expired: 'O prazo de assinatura terminou. Anule e duplique para mandar uma nova versão.', void: 'Documento anulado: os links não funcionam mais.' };
  const sheet = renderDocument(doc, { files: c.s.files, zone }).replace('<article class="dc-sheet', `<article style="--dc-accent:${h(doc.theme?.accent || '#155eef')}" class="dc-sheet`);
  return `<div class="page dc-sent">
    <header class="page-head"><div><a class="secondary fb-back" href="#payments/documents">${icon('left', 15)} Documentos</a>
      <h1 data-no-translate="1">${h(doc.title)}</h1><p>${statusBadge(doc)} ${badge(label(documentKinds, doc.kind))} <b>${money(doc.total)}</b> · Enviado em ${h(fmt(doc.sentAt, zone, true))}</p></div>
      <div class="head-actions">${['sent', 'expired', 'declined'].includes(doc.status) ? `<button type="button" class="secondary" data-dc-act="void" data-id="${h(doc.id)}">Anular</button>` : ''}
        <button type="button" class="secondary" data-dc-act="duplicate" data-id="${h(doc.id)}">Duplicar</button>
        ${doc.status === 'completed' ? `<button type="button" class="secondary" data-dc-act="print">${icon('download', 15)} Imprimir ou PDF</button>` : ''}
        ${doc.status !== 'sent' ? `<button type="button" class="icon-btn" data-dc-act="delete" data-key="documents" data-id="${h(doc.id)}" aria-label="Excluir" title="Excluir">${icon('trash', 16)}</button>` : ''}</div></header>
    <p class="dc-locked surface" role="status">${h(notes[doc.status] || '')}</p>
    <div class="dc-sent-grid"><div class="dc-sent-doc" data-no-translate="1">${sheet}${doc.status === 'completed' ? renderCertificate(doc, { zone }) : ''}</div>
      <aside class="dc-sent-side"><section><h2>Destinatários${doc.ordered ? ' <small class="dim">(em ordem)</small>' : ''}</h2><div class="dc-people">${people}</div></section>
        ${paymentSection(c, doc)}<section><h2>Trilha de auditoria</h2><ol class="dc-trail">${trail}</ol></section></aside></div></div>`;
}

// Exemplo da mensagem do envio: fala de proposta, contrato ou documento conforme o tipo.
export function exemploDeMensagem(kind) {
  const nome = { proposal: 'a proposta', contract: 'o contrato' }[kind] || 'o documento';
  return `Olá! Segue ${nome} conforme conversamos.`;
}

function sendDialog(c, d) {
  const people = d.recipients.map(row => `<li><b data-no-translate="1">${h(row.name || row.label)}</b> <span class="dim" data-no-translate="1">${h(row.email || 'sem e-mail')}</span> · ${h(roleNames[row.role])}${d.ordered && row.role !== 'cc' ? ` · ${row.order}º` : ''}</li>`).join('');
  return `<form class="co-form" data-dc-form="send" data-id="${h(d.id)}">
    <p>Cada pessoa recebe um link pessoal para ${d.ordered ? 'assinar na ordem definida' : 'assinar'}. Depois de enviado, o documento não pode mais ser editado.</p>
    <ul class="dc-send-list">${people}</ul>
    <fieldset class="dc-channels"><legend>Enviar por</legend>
      <label><input type="checkbox" checked disabled><span><b>E-mail</b><small>Sempre: é por ele que chega a cópia final.</small></span></label>
      <label><input type="checkbox" name="whatsapp"><span><b>WhatsApp também</b><small>Para destinatários ligados a um contato com telefone.</small></span></label></fieldset>
    <label>Assunto (opcional)<input name="subject" maxlength="160" placeholder="${h(`${c.s.profile.name} enviou “${d.title}” para você assinar`)}"></label>
    <label>Mensagem (opcional)<textarea name="message" rows="3" maxlength="2000" placeholder="${h(exemploDeMensagem(d.kind))}"></textarea></label>
    <p class="form-status" role="alert" data-dc-error></p>
    <div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary" type="submit">Enviar agora</button></div></form>`;
}

function linksDialog(links) {
  return `<div class="co-form"><p>Pronto. Se o e-mail estiver configurado, cada pessoa já recebeu o link. Você também pode copiar e mandar por onde preferir:</p>
    <ul class="dc-send-list">${links.map(link => `<li><b data-no-translate="1">${h(link.name)}</b><div class="dc-link-row"><input readonly value="${h(location.origin + link.path)}" aria-label="Link de ${h(link.name)}">
      <button type="button" class="secondary" data-dc-copy="${h(location.origin + link.path)}">Copiar</button></div></li>`).join('')}</ul>
    <p class="dim">Os links são pessoais: quem abre assina em nome do destinatário.</p>
    <div class="co-form-actions"><button type="button" class="primary" data-act="close">Fechar</button></div></div>`;
}

export function documentsScreen(c) { return c.tab === 'document' ? editorView(c) : listView(c); }
export function afterDocumentsRender() { mountDesignStage(document.querySelector('.dc .dw-stage'), dc.viewport); }

/* ───────── Árvore de blocos ───────── */

function findBlock(blocks, id) {
  for (const block of blocks || []) {
    if (block.id === id) return block;
    if (block.type === 'columns') { const inner = findBlock(block.left, id) || findBlock(block.right, id); if (inner) return inner; }
  }
  return null;
}
function parentList(blocks, id) {
  if ((blocks || []).some(block => block.id === id)) return blocks;
  for (const block of blocks || []) if (block.type === 'columns') { const list = parentList(block.left, id) || parentList(block.right, id); if (list) return list; }
  return null;
}
const topIndex = id => dc.draft.blocks.findIndex(block => block.id === id || (block.type === 'columns' && findBlock([block], id)));

/* ───────── Ações ───────── */

const payloadOf = (key, d) => key === 'contentBlocks' ? { name: d.name, category: d.category, blocks: d.blocks }
  : { title: d.title, kind: d.kind, theme: d.theme, recipients: d.recipients, ordered: d.ordered, variables: d.variables, blocks: d.blocks, payment: d.payment || null,
    ...(key === 'documents' ? { contactId: d.contactId, opportunityId: d.opportunityId, templateId: d.templateId, expiresAt: d.expiresAt, archived: d.archived } : {}) };
const templatePayload = d => ({ ...payloadOf('documentTemplates', d), title: d.title, blocks: cloneBlocks(d.blocks),
  recipients: d.recipients.map((row, index) => index === 0 || row.contactId ? { ...row, contactId: '', name: '', email: '' } : row) });

function newDocumentDialog(c, presetTemplate = '') {
  const own = c.s.documentTemplates || [];
  const radio = (value, title, desc) => `<label class="fm-template"><input type="radio" name="template" value="${h(value)}" ${value === presetTemplate ? 'checked' : ''}><span><b>${h(title)}</b><small>${h(desc)}</small></span></label>`;
  return `<form class="co-form" data-dc-form="new">
    <label>Título<input name="title" required maxlength="160" placeholder="Ex.: Proposta de gestão de redes sociais"></label>
    <div class="dc-two"><label>Tipo<select name="kind">${documentKinds.map(([value, text]) => option(value, text, 'proposal')).join('')}</select></label>
      <label>Cliente<select name="contactId"><option value="">Escolher depois</option>${c.s.contacts.map(row => option(row.id, row.name, '')).join('')}</select></label></div>
    <fieldset class="fm-templates"><legend>Começar com</legend>${radio('', 'Em branco', 'Página vazia com um destinatário.')}
      ${socTemplates.map(tpl => radio(tpl.id, tpl.title, `Modelo da Graao · ${label(documentKinds, tpl.kind)}`)).join('')}
      ${own.map(tpl => radio(tpl.id, tpl.title, `Seu modelo · ${label(documentKinds, tpl.kind)}`)).join('')}</fieldset>
    <p class="form-status" role="alert" data-dc-error></p>
    <div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary" type="submit">Criar documento</button></div></form>`;
}

function fromTemplate(c, templateId, { title, kind, contactId }) {
  const tpl = socTemplates.find(row => row.id === templateId) || (c.s.documentTemplates || []).find(row => row.id === templateId);
  const contact = c.s.contacts.find(row => row.id === contactId);
  const recipients = structuredClone(tpl?.recipients?.length ? tpl.recipients : [newRecipient(0)]);
  if (contact) Object.assign(recipients[0], { contactId: contact.id, name: contact.name, email: contact.email || '' });
  return { title, kind: tpl && !kind ? tpl.kind : kind || tpl?.kind || 'proposal', contactId: contact?.id || '', opportunityId: '', expiresAt: '',
    templateId: tpl && !tpl.id.startsWith('graao-') ? tpl.id : '', theme: structuredClone(tpl?.theme || { accent: '#155eef', font: 'sans', logoFileId: '' }),
    recipients, ordered: Boolean(tpl?.ordered), variables: structuredClone(tpl?.variables || []), payment: structuredClone(tpl?.payment || null), blocks: cloneBlocks(tpl?.blocks || [newBlock('text', { html: '<h1>Título do documento</h1><p>Comece a escrever aqui.</p>' })]) };
}

function confirmDelete(key, row) {
  const what = { documents: ['documento', 'O documento'], documentTemplates: ['modelo', 'O modelo'], contentBlocks: ['item', 'O item'] }[key];
  return `<form class="co-form" data-dc-form="delete" data-key="${key}" data-id="${h(row.id)}"><p>${what[1]} “${h(titleOf(row))}” será excluído. Esta ação não pode ser desfeita.</p>
    <p class="form-status" role="alert" data-dc-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="danger" type="submit">Excluir ${what[0]}</button></div></form>`;
}

export function installDocuments(environment) {
  env = environment;
  const { c, mutate, flash, dialog, close } = env;
  const inList = () => c.view === 'payments' && c.tab === 'documents';
  const inEditor = () => c.view === 'payments' && c.tab === 'document' && dc.draft;
  const render = () => {
    const keep = ['.dc-palette .fb-palette-body', '.dc-props-body', '.dw-scroll'].map(sel => [sel, document.querySelector(sel)?.scrollTop || 0]);
    env.render();
    for (const [sel, top] of keep) { const el = document.querySelector(sel); if (el) el.scrollTop = top; }
  };
  // Marks unsaved changes without re-rendering, so the control being typed in keeps focus.
  const touch = () => {
    if (dc.dirty) return;
    dc.dirty = true;
    const save = document.querySelector('[data-dc-save]'); if (save) save.disabled = false;
    document.querySelector('.dc .fb-title')?.insertAdjacentHTML('beforeend', badge('Alterações não salvas', 'blue'));
  };
  const repaintPage = () => {
    const sheet = document.querySelector('[data-dc-sheet]');
    if (sheet) sheet.outerHTML = pageHtml(c);
    const sum = document.querySelector('.dc-sum'); if (sum) sum.textContent = money(documentTotal(dc.draft.blocks));
    const name = document.querySelector('[data-dc-board-name]'); if (name) name.textContent = titleOf(dc.draft);
  };
  const ensureRecipient = () => { if (!dc.draft.recipients.length && dc.key !== 'contentBlocks') dc.draft.recipients.push(newRecipient(0, dc.draft.contactId ? contactRecipient(dc.draft.contactId) : {})); return dc.draft.recipients[0]?.id || ''; };
  const contactRecipient = id => { const contact = c.s.contacts.find(row => row.id === id); return contact ? { contactId: contact.id, name: contact.name, email: contact.email || '' } : {}; };

  function insert(blocks, at) {
    const list = dc.draft.blocks;
    const index = at ?? (dc.selected ? topIndex(dc.selected) + 1 : list.length);
    list.splice(index < 0 ? list.length : index, 0, ...blocks);
    dc.selected = blocks[0]?.id || dc.selected;
    dc.dirty = true;
    dc.panel = 'block';
    render();
  }
  function makeBlock(type, kind) {
    if (type !== 'field') return newBlock(type);
    const recipientId = dc.draft.recipients.some(row => row.id === dc.fieldRecipient) ? dc.fieldRecipient : ensureRecipient();
    return newBlock('field', { kind, label: kind === 'signature' ? 'Assinatura do signatário' : fieldKinds[kind]?.label || 'Campo', recipientId });
  }
  function libraryBlocks(id) {
    const item = socLibrary.find(row => row.id === id) || (c.s.contentBlocks || []).find(row => row.id === id);
    const recipientId = dc.draft.recipients[0]?.id || '';
    return cloneBlocks(item?.blocks || []).map(block => block.type === 'field' ? { ...block, recipientId: block.recipientId || recipientId } : block);
  }

  async function save() {
    const d = dc.draft;
    const id = await mutate({ type: 'save', key: dc.key, id: dc.id, data: payloadOf(dc.key, d) });
    const row = (c.s[dc.key] || []).find(item => item.id === id);
    if (row) Object.assign(dc, { draft: normalize(dc.key, row), rev: row.updated || row.created, dirty: false });
    render();
    flash('Salvo.');
  }
  async function create(key, data, message) {
    const id = await mutate({ type: 'save', key, data });
    flash(message);
    location.hash = `#payments/document/${id}`;
  }

  window.addEventListener('beforeunload', event => { if (dc.dirty && inEditor()) { event.preventDefault(); event.returnValue = ''; } });

  document.addEventListener('keydown', event => {
    if (!inEditor() || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return;
    event.preventDefault();
    if (dc.dirty) save().catch(error => flash(error.message, true));
  });

  // Formatting buttons keep the text selection: act on mousedown, before the editable loses focus.
  document.addEventListener('mousedown', event => {
    const button = event.target.closest('[data-dc-cmd],[data-dc-var]');
    if (!button || !inEditor()) return;
    event.preventDefault();
    const editableEl = document.activeElement?.closest?.('[data-dc-text]') || document.querySelector(`[data-dc-text="${CSS.escape(dc.selected)}"]`);
    if (!editableEl) { flash('Clique no texto da página antes.', true); return; }
    if (document.activeElement !== editableEl) { editableEl.focus(); const range = document.createRange(); range.selectNodeContents(editableEl); range.collapse(false); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range); }
    const cmd = button.dataset.dcCmd;
    if (button.dataset.dcVar) document.execCommand('insertHTML', false, `<span class="dc-var" contenteditable="false">{{${h(button.dataset.dcVar)}}}</span>&nbsp;`);
    else if (['h1', 'h2', 'h3', 'p'].includes(cmd)) document.execCommand('formatBlock', false, cmd);
    else if (cmd === 'link') { insertLink(editableEl); return; }
    else document.execCommand(cmd, false);
    syncText(editableEl);
  });

  // The dialog takes the focus, so the selected text is put back before the link is created.
  async function insertLink(el) {
    const selection = getSelection();
    const range = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const url = (await askText('Endereço do link', { type: 'url', placeholder: 'https://…', ok: 'Inserir link' }))?.trim();
    if (!url || !/^(https?:\/\/|mailto:)/i.test(url) || !range || !el.isConnected) return;
    el.focus();
    selection.removeAllRanges(); selection.addRange(range);
    document.execCommand('createLink', false, url);
    syncText(el);
  }

  function syncText(el) {
    const block = findBlock(dc.draft.blocks, el.dataset.dcText);
    if (!block) return;
    block.html = unpill(el.innerHTML);
    touch();
  }

  document.addEventListener('input', event => {
    const el = event.target;
    if (inEditor()) {
      const d = dc.draft;
      if (el.matches('[data-dc-text]')) { syncText(el); return; }
      const block = findBlock(d.blocks, dc.selected);
      if (el.matches('[data-dc-prop]') && block && el.type !== 'checkbox' && el.tagName !== 'SELECT') { block[el.dataset.dcProp] = el.value; touch(); repaintPage(); return; }
      if (el.matches('[data-dc-cell]') && block) { const [r, col] = el.dataset.dcCell.split(',').map(Number); block.rows[r][col] = el.value; touch(); repaintPage(); return; }
      if (el.matches('[data-dc-item]') && block && el.type !== 'checkbox') {
        const item = block.items[Number(el.dataset.index)], name = el.dataset.dcItem;
        item[name] = ['qty', 'price', 'discount'].includes(name) ? Number(el.value) : el.value;
        const line = document.querySelector(`[data-dc-line="${el.dataset.index}"]`); if (line) line.textContent = money(lineTotal(item));
        const sum = document.querySelector('[data-dc-block-total]'); if (sum) sum.textContent = money(block.items.filter(row => !row.optional || row.selected).reduce((n, row) => n + lineTotal(row), 0));
        touch(); repaintPage(); return;
      }
      if (el.matches('[data-dc-doc]') && el.type !== 'checkbox' && el.tagName !== 'SELECT') { d[el.dataset.dcDoc] = el.value; touch(); repaintPage(); return; }
      if (el.matches('[data-dc-pay]') && el.tagName !== 'SELECT') { d.payment[el.dataset.dcPay] = Number(el.value); touch(); return; }
      if (el.matches('[data-dc-part]')) { d.payment.schedule[Number(el.dataset.index)][el.dataset.dcPart] = Number(el.value); touch(); return; }
      if (el.matches('[data-dc-theme]') && el.type === 'color') { d.theme.accent = el.value; touch(); repaintPage(); return; }
      if (el.matches('[data-dc-rec]') && el.tagName !== 'SELECT') {
        const row = d.recipients.find(item => item.id === el.dataset.id);
        if (row) { row[el.dataset.dcRec] = el.dataset.dcRec === 'order' ? Number(el.value) : el.value; touch(); repaintPage(); }
        return;
      }
      if (el.matches('[data-dc-variable]')) {
        const row = d.variables[Number(el.dataset.index)];
        if (row) { row[el.dataset.dcVariable] = el.dataset.dcVariable === 'key' ? el.value.toLowerCase() : el.value; touch(); repaintPage(); }
      }
    }
  });

  document.addEventListener('change', event => {
    const el = event.target;
    if (inList() && el.matches('[data-dc-period]')) { dc.period = el.value; render(); return; }
    if (!inEditor()) return;
    const d = dc.draft, block = findBlock(d.blocks, dc.selected);
    if (el.matches('[data-dc-prop]') && block && (el.type === 'checkbox' || el.tagName === 'SELECT')) {
      const name = el.dataset.dcProp;
      block[name] = el.type === 'checkbox' ? el.checked : name === 'width' ? Number(el.value) : el.value;
      if (name === 'kind') block.label = fieldKinds[el.value]?.label || block.label;
      dc.dirty = true; render(); return;
    }
    if (el.matches('[data-dc-item]') && block && el.type === 'checkbox') {
      const item = block.items[Number(el.dataset.index)];
      item[el.dataset.dcItem] = el.checked;
      if (el.dataset.dcItem === 'optional') item.selected = true;
      dc.dirty = true; render(); return;
    }
    if (el.matches('[data-dc-item-add]') && block && el.value) {
      const product = c.s.products.find(row => row.id === el.value);
      if (product) block.items.push({ id: newId(), productId: product.id, name: product.name, description: product.description || '', qty: 1, price: product.price, discount: 0,
        interval: product.kind === 'Recurring' ? product.interval : '', optional: false, selected: true });
      dc.dirty = true; render(); return;
    }
    if (el.matches('[data-dc-doc]') && (el.type === 'checkbox' || el.tagName === 'SELECT')) {
      const name = el.dataset.dcDoc;
      d[name] = el.type === 'checkbox' ? el.checked : el.value;
      if (name === 'contactId' && el.value) {
        const first = d.recipients[0];
        if (first && !first.contactId && !first.email) Object.assign(first, contactRecipient(el.value));
        if (d.opportunityId && c.s.opportunities.find(row => row.id === d.opportunityId)?.contactId !== el.value) d.opportunityId = '';
      }
      dc.dirty = true; render(); return;
    }
    if (el.matches('[data-dc-theme]') && el.tagName === 'SELECT') { d.theme[el.dataset.dcTheme] = el.value; dc.dirty = true; render(); return; }
    if (el.matches('[data-dc-rec]') && el.tagName === 'SELECT') {
      const row = d.recipients.find(item => item.id === el.dataset.id);
      if (row) { row[el.dataset.dcRec] = el.value; if (el.dataset.dcRec === 'contactId') Object.assign(row, el.value ? contactRecipient(el.value) : { contactId: '' }); }
      dc.dirty = true; render(); return;
    }
    if (el.matches('[data-dc-pay]') && el.tagName === 'SELECT') {
      if (el.dataset.dcPay === 'mode') d.payment = el.value ? { timing: 'on_sign', dueDays: 7, schedule: [], ...(d.payment || {}), mode: el.value } : null;
      else d.payment[el.dataset.dcPay] = el.value;
      if (d.payment?.mode === 'recurring') d.payment.schedule = [];
      dc.dirty = true; render(); return;
    }
    if (el.matches('[data-dc-pay], [data-dc-part]')) { dc.dirty = true; render(); return; }
    if (el.matches('[data-dc-field-recipient]')) { dc.fieldRecipient = el.value; return; }
    if (el.matches('[data-dc-as]')) { dc.as = el.value; repaintPage(); }
  });

  document.addEventListener('focusin', event => {
    const text = event.target.closest?.('[data-dc-text]');
    if (!text || !inEditor() || dc.selected === text.dataset.dcText) return;
    dc.selected = text.dataset.dcText;
    document.querySelectorAll('.dc-block.selected').forEach(el => el.classList.remove('selected'));
    text.closest('.dc-block')?.classList.add('selected');
    dc.panel = 'block';
    const props = document.querySelector('.dc-props');
    if (props) props.outerHTML = propsHtml(c);
  });

  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-dc-part-add],[data-dc-part-del],[data-dc-act],[data-dc-section],[data-dc-status],[data-dc-palette],[data-dc-panel],[data-dc-add],[data-dc-lib],[data-dc-block],[data-dc-move],[data-dc-dup],[data-dc-del],[data-dc-save],[data-dc-preview],[data-dc-table],[data-dc-item-del],[data-dc-item-blank],[data-dc-col-add],[data-dc-rec-add],[data-dc-rec-del],[data-dc-variable-add],[data-dc-variable-del]');
    const copy = event.target.closest('[data-dc-copy]');
    if (copy) { try { await navigator.clipboard.writeText(copy.dataset.dcCopy); flash('Link copiado.'); } catch { copy.previousElementSibling?.select(); } return; }
    if (!target || !(c.view === 'payments' && ['documents', 'document'].includes(c.tab))) return;
    const ds = target.dataset;
    try {
      if (ds.dcSection) { dc.section = ds.dcSection; c.query = ''; render(); return; }
      if (ds.dcStatus) { dc.status = ds.dcStatus; render(); document.querySelector(`[data-dc-status="${ds.dcStatus}"]`)?.focus(); return; }
      if (ds.dcAct) { await listAction(ds.dcAct, ds, target); return; }
      if (!inEditor()) return;
      const d = dc.draft;
      if (ds.dcPalette) { dc.palette = ds.dcPalette; render(); return; }
      if (ds.dcPanel) { dc.panel = ds.dcPanel; render(); return; }
      if ('dcSave' in ds) { target.disabled = true; await save(); return; }
      if ('dcPreview' in ds) { dc.preview = !dc.preview; render(); return; }
      if (ds.dcAdd) { insert([makeBlock(ds.dcAdd, ds.kind)]); return; }
      if (ds.dcLib) { insert(libraryBlocks(ds.dcLib)); return; }
      if (ds.dcMove) {
        const list = parentList(d.blocks, ds.id), index = list.findIndex(block => block.id === ds.id), next = index + Number(ds.dcMove);
        if (next < 0 || next >= list.length) return;
        [list[index], list[next]] = [list[next], list[index]]; dc.dirty = true; render(); return;
      }
      if (ds.dcDup) { const list = parentList(d.blocks, ds.dcDup), index = list.findIndex(block => block.id === ds.dcDup); const [copy] = cloneBlocks([list[index]]); list.splice(index + 1, 0, copy); dc.selected = copy.id; dc.dirty = true; render(); return; }
      if (ds.dcDel) { const list = parentList(d.blocks, ds.dcDel); list.splice(list.findIndex(block => block.id === ds.dcDel), 1); if (dc.selected === ds.dcDel) dc.selected = ''; dc.dirty = true; render(); return; }
      if (ds.dcTable) {
        const block = findBlock(d.blocks, dc.selected), width = block.rows[0]?.length || 1;
        if (ds.dcTable === 'add-row' && block.rows.length < 20) block.rows.push(Array(width).fill(''));
        if (ds.dcTable === 'add-col' && width < 8) block.rows.forEach(row => row.push(''));
        if (ds.dcTable === 'del-row' && block.rows.length > 1) block.rows.pop();
        if (ds.dcTable === 'del-col' && width > 1) block.rows.forEach(row => row.pop());
        dc.dirty = true; render(); return;
      }
      if (ds.dcItemDel !== undefined) { findBlock(d.blocks, dc.selected).items.splice(Number(ds.dcItemDel), 1); dc.dirty = true; render(); return; }
      if ('dcItemBlank' in ds) { findBlock(d.blocks, dc.selected).items.push({ id: newId(), productId: '', name: 'Novo item', description: '', qty: 1, price: 0, discount: 0, interval: '', optional: false, selected: true }); dc.dirty = true; render(); return; }
      if (ds.dcColAdd) { const [side, type] = ds.dcColAdd.split(':'); const block = findBlock(d.blocks, dc.selected); if (block[side].length < 6) block[side].push(newBlock(type)); dc.dirty = true; render(); return; }
      if ('dcRecAdd' in ds) { d.recipients.push(newRecipient(d.recipients.length)); dc.dirty = true; render(); return; }
      if (ds.dcRecDel) {
        d.recipients = d.recipients.filter(row => row.id !== ds.dcRecDel);
        const fallback = d.recipients[0]?.id || '';
        const visit = blocks => blocks.forEach(block => { if (block.type === 'field' && block.recipientId === ds.dcRecDel) block.recipientId = fallback; if (block.type === 'columns') { visit(block.left); visit(block.right); } });
        visit(d.blocks); dc.dirty = true; render(); return;
      }
      if ('dcPartAdd' in ds) {
        const schedule = d.payment.schedule ||= [];
        if (!schedule.length) schedule.push({ percent: 50, dueDays: 0 }, { percent: 50, dueDays: 30 });
        else schedule.push({ percent: 0, dueDays: (schedule.at(-1)?.dueDays || 0) + 30 });
        dc.dirty = true; render(); return;
      }
      if (ds.dcPartDel !== undefined) { d.payment.schedule.splice(Number(ds.dcPartDel), 1); dc.dirty = true; render(); return; }
      if ('dcVariableAdd' in ds) { d.variables.push({ key: `variavel_${d.variables.length + 1}`, label: 'Nova variável', value: '' }); dc.dirty = true; render(); return; }
      if (ds.dcVariableDel !== undefined) { d.variables.splice(Number(ds.dcVariableDel), 1); dc.dirty = true; render(); return; }
      if (ds.dcBlock && !event.target.closest('[data-dc-text], .dc-tools') && dc.selected !== ds.dcBlock) {
        event.stopPropagation();
        dc.selected = ds.dcBlock; dc.panel = 'block'; render();
      }
    } catch (error) { target.disabled = false; flash(error.message, true); }
  });

  async function listAction(action, ds) {
    const doc = (c.s.documents || []).find(row => row.id === ds.id);
    if (action === 'send') {
      if (dc.dirty) await save();
      dialog('Enviar para assinatura', sendDialog(c, dc.draft));
      return;
    }
    if (action === 'void') { dialog('Anular documento', `<form class="co-form" data-dc-form="void" data-id="${h(doc.id)}"><p>Os links de assinatura param de funcionar e ninguém mais pode assinar “${h(doc.title)}”. Assinaturas já feitas continuam na trilha.</p>
      <label>Motivo (opcional)<input name="reason" maxlength="300"></label><p class="form-status" role="alert" data-dc-error></p>
      <div class="co-form-actions"><button type="button" class="secondary" data-act="close">Voltar</button><button class="danger" type="submit">Anular documento</button></div></form>`); return; }
    if (action === 'link' || action === 'resend') {
      const result = await mutate({ type: 'document-link', id: ds.id, data: { recipientId: ds.recipient, notify: action === 'resend' } });
      render();
      if (action === 'resend') { flash('Link novo enviado. O anterior deixou de funcionar.'); return; }
      const url = location.origin + result.path;
      try { await navigator.clipboard.writeText(url); flash('Link novo copiado. O anterior deixou de funcionar.'); }
      catch { dialog('Novo link', linksDialog([{ name: doc.recipients.find(row => row.id === ds.recipient)?.name || '', path: result.path }])); }
      return;
    }
    if (action === 'print') { print(); return; }
    if (action === 'new') { dialog('Novo documento', newDocumentDialog(c)); return; }
    if (action === 'use') { dialog('Novo documento', newDocumentDialog(c, ds.id)); return; }
    if (action === 'new-template') { await create('documentTemplates', { title: 'Novo modelo', kind: 'proposal', recipients: [newRecipient(0)], blocks: [newBlock('text', { html: '<h1>Título do modelo</h1><p>Escreva aqui.</p>' })] }, 'Modelo criado.'); return; }
    if (action === 'new-block') { await create('contentBlocks', { name: 'Novo item', category: 'other', blocks: [newBlock('text')] }, 'Item criado.'); return; }
    if (action === 'copy-graao-template') { const tpl = socTemplates.find(row => row.id === ds.id); await create('documentTemplates', { ...structuredClone(tpl), id: undefined, title: `${tpl.title} (cópia)`, blocks: cloneBlocks(tpl.blocks) }, 'Modelo duplicado.'); return; }
    if (action === 'copy-graao-block') { const item = socLibrary.find(row => row.id === ds.id); await create('contentBlocks', { name: `${item.name} (cópia)`, category: item.category, blocks: cloneBlocks(item.blocks) }, 'Item duplicado.'); return; }
    if (action === 'duplicate' && doc) { await create('documents', { ...payloadOf('documents', normalize('documents', doc)), title: `${doc.title} (cópia)`, archived: false, blocks: cloneBlocks(doc.blocks) }, 'Documento duplicado.'); return; }
    if (action === 'duplicate-template') { const tpl = c.s.documentTemplates.find(row => row.id === ds.id); await create('documentTemplates', { ...payloadOf('documentTemplates', normalize('documentTemplates', tpl)), title: `${tpl.title} (cópia)`, blocks: cloneBlocks(tpl.blocks) }, 'Modelo duplicado.'); return; }
    if (action === 'to-template') {
      const source = dc.id === ds.id && dc.draft ? dc.draft : normalize('documents', doc);
      await mutate({ type: 'save', key: 'documentTemplates', data: templatePayload(source) });
      flash('Modelo salvo. Ele aparece em Documentos → Modelos.');
      return;
    }
    if (action === 'archive' && doc) {
      await mutate({ type: 'save', key: 'documents', id: doc.id, data: { ...payloadOf('documents', normalize('documents', doc)), archived: !doc.archived } });
      render(); flash(doc.archived ? 'Documento desarquivado.' : 'Documento arquivado.');
      return;
    }
    if (action === 'delete') { const row = (c.s[ds.key] || []).find(item => item.id === ds.id); if (row) dialog('Excluir', confirmDelete(ds.key, row)); }
  }

  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-dc-form]');
    if (!form) return;
    event.preventDefault();
    const fields = new FormData(form), submit = form.querySelector('button[type="submit"]'), error = form.querySelector('[data-dc-error]');
    submit.disabled = true; error.textContent = '';
    try {
      if (form.dataset.dcForm === 'delete') {
        const { key, id } = form.dataset;
        await mutate({ type: 'delete', key, id });
        close();
        if (dc.id === id) { dc.id = ''; dc.draft = null; dc.dirty = false; location.hash = '#payments/documents'; } else render();
        flash('Excluído.');
        return;
      }
      if (form.dataset.dcForm === 'send') {
        const result = await mutate({ type: 'document-send', id: form.dataset.id, data: { channels: fields.has('whatsapp') ? ['email', 'whatsapp'] : ['email'], subject: fields.get('subject'), message: fields.get('message') } });
        dc.id = ''; render();
        dialog('Documento enviado', linksDialog(result.links || []));
        return;
      }
      if (form.dataset.dcForm === 'void') {
        await mutate({ type: 'document-void', id: form.dataset.id, data: { reason: fields.get('reason') } });
        close(); render(); flash('Documento anulado.');
        return;
      }
      const data = fromTemplate(c, fields.get('template') || '', { title: String(fields.get('title') || '').trim(), kind: fields.get('kind'), contactId: fields.get('contactId') });
      const id = await mutate({ type: 'save', key: 'documents', data });
      close();
      location.hash = `#payments/document/${id}`;
      flash('Documento criado.');
    } catch (failure) { error.textContent = failure.message; submit.disabled = false; }
  });

  /* Arrastar: blocos da paleta e reordenar blocos da página. */
  const clearMarks = () => document.querySelectorAll('.dc-drop-before,.dc-drop-after').forEach(el => el.classList.remove('dc-drop-before', 'dc-drop-after'));
  document.addEventListener('dragstart', event => {
    if (!inEditor()) return;
    const tile = event.target.closest?.('[data-dc-add],[data-dc-drag]');
    if (!tile) return;
    dc.drag = tile.dataset.dcDrag ? { move: tile.dataset.dcDrag } : { add: tile.dataset.dcAdd, kind: tile.dataset.kind };
    event.dataTransfer.effectAllowed = 'copyMove';
    event.dataTransfer.setData('text/plain', 'dc');
  });
  document.addEventListener('dragover', event => {
    if (!dc.drag || !inEditor()) return;
    const zone = event.target.closest?.('[data-dc-blocks]');
    if (!zone) return;
    event.preventDefault();
    clearMarks();
    const block = event.target.closest('.dc-block:not(.nested)');
    if (block) { const box = block.getBoundingClientRect(); block.classList.add(event.clientY < box.top + box.height / 2 ? 'dc-drop-before' : 'dc-drop-after'); }
  });
  document.addEventListener('dragend', () => { dc.drag = null; clearMarks(); });
  document.addEventListener('drop', event => {
    if (!dc.drag || !inEditor()) return;
    const zone = event.target.closest?.('[data-dc-blocks]');
    if (!zone) return;
    event.preventDefault();
    const target = event.target.closest('.dc-block:not(.nested)');
    const list = dc.draft.blocks;
    let index = list.length;
    if (target) { const box = target.getBoundingClientRect(); index = list.findIndex(block => block.id === target.dataset.dcBlock) + (event.clientY < box.top + box.height / 2 ? 0 : 1); }
    const drag = dc.drag; dc.drag = null; clearMarks();
    if (drag.move) {
      const from = list.findIndex(block => block.id === drag.move);
      if (from < 0) return;
      const [moved] = list.splice(from, 1);
      list.splice(from < index ? index - 1 : index, 0, moved);
      dc.dirty = true; render(); return;
    }
    insert([makeBlock(drag.add, drag.kind)], index);
  });
}
