// Pagamentos → Faturas recorrentes e Modelos de fatura: lists (status tabs with counts and search), the
// editors with a live preview, the schedule (frequency, start, end, next issue dates), the trail and the
// invoices already issued. Also the "Usar modelo" and "Enviar" actions of the Faturas tab.
import { icon } from './icons.js';
import { h, fmt, pageShell, search } from './screens.js';
import { crmTabs } from './crm.js';
import { lineItemAction, lineItemInput, lineItemsEditor, itemsTotal } from './line-items.js';
import { renderInvoice } from './invoice-render.js';
import { endLabel, endModes, frequencies, frequencyLabel, invoicePaymentState, invoiceStateLabels, localDay, MAX_INTERVAL, recurringEvents, recurringStatuses, recurringTabs, upcoming } from './invoice-data.js';

const iv = { status: 'all', key: '', id: '', rev: '', draft: null, dirty: false };
let env = null;
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const badge = (label, tone = '') => `<span class="badge ${tone}">${h(label)}</span>`;
const option = (value, text, chosen) => `<option value="${h(value)}"${String(value) === String(chosen) ? ' selected' : ''}>${h(text)}</option>`;
const contactOf = (c, id) => c.s.contacts.find(row => row.id === id) || null;
const day = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0, 10).split('-').reverse().join('/') : '—';
const statusBadge = rec => { const [, name, tone] = recurringStatuses.find(([key]) => key === rec.status) || recurringStatuses[0]; return badge(name, tone); };
const invoiceBadge = row => badge(...invoiceStateLabels[invoicePaymentState(row)]);
const trailNames = Object.fromEntries([...recurringEvents, ['delivered', 'Entrega']]);
const field = (label, control, hint = '') => `<label class="es-field">${h(label)}${control}${hint ? `<small class="dim">${hint}</small>` : ''}</label>`;
const editable = rec => !['completed', 'cancelled'].includes(rec.status);
const tabsOf = current => ({ key: 'payments', items: crmTabs.payments, current, label: 'Seções de pagamentos' });
const kinds = {
  'recurring-invoice': { key: 'recurringInvoices', list: 'recurring', name: 'Fatura recorrente', saved: 'Fatura recorrente salva.' },
  'invoice-template': { key: 'invoiceTemplates', list: 'invoice-templates', name: 'Modelo de fatura', saved: 'Modelo salvo.' }
};
const deleteForm = (kind, row, text) => `<form class="co-form" data-iv-form="delete" data-kind="${kind}" data-id="${h(row.id)}"><p>${text}</p>
  <p class="form-status" role="alert" data-iv-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="danger" type="submit">Excluir</button></div></form>`;

/* ───────── Listas ───────── */

function recurringList(c) {
  const q = (c.query || '').trim().toLocaleLowerCase('pt-BR');
  const all = c.s.recurringInvoices || [];
  const inStatus = (rec, status) => status === 'all' || rec.status === status;
  const rows = all.filter(rec => inStatus(rec, iv.status) && (!q || [rec.name, contactOf(c, rec.contactId)?.name].some(v => String(v || '').toLocaleLowerCase('pt-BR').includes(q))))
    .sort((a, b) => (b.updated || b.created || '').localeCompare(a.updated || a.created || ''));
  const table = rows.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Nome</th><th scope="col">Cliente</th><th scope="col">Última emissão</th><th scope="col">Próxima</th>
      <th scope="col">Frequência</th><th scope="col" class="right">Valor</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
    <tbody>${rows.map(rec => `<tr><td><a class="dc-title" data-no-translate="1" href="#payments/recurring-invoice/${h(rec.id)}">${h(rec.name)}</a></td>
      <td>${h(contactOf(c, rec.contactId)?.name || '—')}</td><td>${h(day(rec.lastIssuedOn))}</td><td>${h(rec.status === 'active' ? day(rec.nextIssueOn) : '—')}</td>
      <td>${h(frequencyLabel(rec.frequency, rec.interval))} <small class="dim">· ${h(endLabel(rec))}</small></td><td class="right"><b>${money(rec.total)}</b></td><td>${statusBadge(rec)}</td>
      <td class="right dc-actions"><a class="icon-btn" href="#payments/recurring-invoice/${h(rec.id)}" aria-label="Abrir ${h(rec.name)}" title="Abrir">${icon('edit', 16)}</a>
        <button type="button" class="icon-btn" data-iv-act="duplicate" data-kind="recurring-invoice" data-id="${h(rec.id)}" aria-label="Duplicar ${h(rec.name)}" title="Duplicar">${icon('copy', 16)}</button>
        ${rec.status === 'active' ? '' : `<button type="button" class="icon-btn" data-iv-act="delete" data-kind="recurring-invoice" data-id="${h(rec.id)}" aria-label="Excluir ${h(rec.name)}" title="Excluir">${icon('trash', 16)}</button>`}</td></tr>`).join('')}</tbody></table></div>`
    : `<div class="surface empty">${icon('pay', 26)}<strong>${all.length ? 'Nenhuma fatura recorrente aqui' : 'Cobre todo mês sem lembrar de emitir'}</strong>
      <p>${all.length ? 'Tente outra situação ou busca.' : 'Monte os itens uma vez, escolha a frequência e a Graao emite a fatura e manda o link de pagamento ao cliente a cada ciclo.'}</p>
      ${all.length ? '' : '<button type="button" class="primary" data-iv-act="new" data-kind="recurring-invoice">Nova fatura recorrente</button>'}</div>`;
  return pageShell({ title: 'Pagamentos', desc: 'Faturas emitidas sozinhas a cada ciclo, com link de pagamento para o cliente.',
    cta: `<button type="button" class="primary" data-iv-act="new" data-kind="recurring-invoice">${icon('plus', 16)} Nova fatura recorrente</button>`,
    tabs: tabsOf('recurring'),
    content: `<div class="dc-page"><div class="dc-segment" role="group" aria-label="Situação das faturas recorrentes">${recurringTabs.map(([value, text]) =>
      `<button type="button" data-iv-status="${value}" aria-pressed="${iv.status === value}">${text} <span>${all.filter(rec => inStatus(rec, value)).length}</span></button>`).join('')}</div>
      <div class="toolbar dc-toolbar">${search(c.query, 'Buscar por nome ou cliente…')}</div>${table}</div>` });
}

function templateList(c) {
  const q = (c.query || '').trim().toLocaleLowerCase('pt-BR');
  const all = c.s.invoiceTemplates || [];
  const rows = all.filter(tpl => !q || [tpl.name, tpl.title].some(v => String(v || '').toLocaleLowerCase('pt-BR').includes(q)))
    .sort((a, b) => (b.updated || b.created || '').localeCompare(a.updated || a.created || ''));
  const used = tpl => c.s.invoices.filter(row => row.templateId === tpl.id).length;
  const table = rows.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Nome</th><th scope="col">Título na fatura</th><th scope="col">Itens</th><th scope="col">Vencimento</th>
      <th scope="col" class="right">Valor</th><th scope="col">Usado</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
    <tbody>${rows.map(tpl => `<tr><td><a class="dc-title" data-no-translate="1" href="#payments/invoice-template/${h(tpl.id)}">${h(tpl.name)}</a></td><td data-no-translate="1">${h(tpl.title)}</td>
      <td>${tpl.items.length}</td><td>${tpl.dueDays} dia${tpl.dueDays === 1 ? '' : 's'}</td><td class="right"><b>${money(tpl.total)}</b></td><td>${used(tpl)}×</td>
      <td class="right dc-actions"><button type="button" class="secondary" data-iv-act="use" data-id="${h(tpl.id)}">Criar fatura</button>
        <a class="icon-btn" href="#payments/invoice-template/${h(tpl.id)}" aria-label="Abrir ${h(tpl.name)}" title="Abrir">${icon('edit', 16)}</a>
        <button type="button" class="icon-btn" data-iv-act="duplicate" data-kind="invoice-template" data-id="${h(tpl.id)}" aria-label="Duplicar ${h(tpl.name)}" title="Duplicar">${icon('copy', 16)}</button>
        <button type="button" class="icon-btn" data-iv-act="delete" data-kind="invoice-template" data-id="${h(tpl.id)}" aria-label="Excluir ${h(tpl.name)}" title="Excluir">${icon('trash', 16)}</button></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="surface empty">${icon('pay', 26)}<strong>${all.length ? 'Nenhum modelo encontrado' : 'Guarde as faturas que você repete'}</strong>
      <p>${all.length ? 'Tente outra busca.' : 'Itens, condições e prazo de vencimento prontos para virar fatura em dois cliques, para começar uma fatura recorrente ou para os fluxos de automação.'}</p>
      ${all.length ? '' : '<button type="button" class="primary" data-iv-act="new" data-kind="invoice-template">Novo modelo</button>'}</div>`;
  return pageShell({ title: 'Pagamentos', desc: 'Modelos com itens, condições e vencimento para criar faturas rapidamente.',
    cta: `<button type="button" class="primary" data-iv-act="new" data-kind="invoice-template">${icon('plus', 16)} Novo modelo</button>`,
    tabs: tabsOf('invoice-templates'),
    content: `<div class="dc-page"><div class="toolbar dc-toolbar">${search(c.query, 'Buscar modelos…')}</div>${table}</div>` });
}

/* ───────── Editores ───────── */

function load(c, kind) {
  const id = c.studio?.project || '';
  const row = (c.s[kinds[kind].key] || []).find(item => item.id === id);
  if (!row) return null;
  const rev = row.updated || row.created;
  if (iv.id !== id || iv.key !== kind || (!iv.dirty && iv.rev !== rev)) Object.assign(iv, { key: kind, id, rev, draft: structuredClone(row), dirty: false });
  return row;
}
const previewOf = (c, d, kind) => renderInvoice({ title: kind === 'recurring-invoice' ? d.name : d.title, items: d.items, value: itemsTotal(d.items), notes: d.notes, terms: d.terms,
  issueDate: kind === 'recurring-invoice' ? (d.status === 'active' ? d.nextIssueOn : d.startDate) : '', due: '' }, { company: c.s.profile.name, contact: contactOf(c, d.contactId) });

function head(c, kind, row, actions) {
  const d = iv.draft, k = kinds[kind];
  const name = kind === 'recurring-invoice' ? d.name : d.name;
  return `<header class="page-head"><div><a class="secondary fb-back" href="#payments/${k.list}">${icon('left', 15)} ${kind === 'recurring-invoice' ? 'Faturas recorrentes' : 'Modelos de fatura'}</a>
      <h1><span data-no-translate="1" data-iv-title>${h(name)}</span></h1><p>${kind === 'recurring-invoice' ? statusBadge(row) : badge(k.name)} <b data-iv-sum>${money(itemsTotal(d.items))}</b>
        ${kind === 'recurring-invoice' ? `<span class="dim">${h(frequencyLabel(d.frequency, d.interval))}</span>` : ''} ${iv.dirty ? badge('Alterações não salvas', 'blue') : ''}</p></div>
    <div class="head-actions">${editable(row) ? `<button type="button" class="secondary" data-iv-save${iv.dirty ? '' : ' disabled'}>Salvar</button>` : ''}${actions}</div></header>`;
}

function templateEditor(c, row) {
  const d = iv.draft;
  return `<div class="page es-page">${head(c, 'invoice-template', row, `<button type="button" class="primary" data-iv-act="use" data-id="${h(row.id)}">Criar fatura</button>
      <button type="button" class="icon-btn" data-iv-act="delete" data-kind="invoice-template" data-id="${h(row.id)}" aria-label="Excluir" title="Excluir">${icon('trash', 16)}</button>`)}
    <div class="es-grid"><form class="surface es-form" data-iv-form="edit" novalidate>
      <div class="es-two">${field('Nome do modelo', `<input data-iv="name" maxlength="160" value="${h(d.name)}">`, 'Só a sua equipe vê.')}${field('Título na fatura', `<input data-iv="title" maxlength="160" value="${h(d.title)}">`, 'O cliente vê este título.')}</div>
      <h2>Itens</h2>${lineItemsEditor(d.items, c.s.products, { optional: false, taxes: c.s.paymentSettings?.taxes || [] })}
      ${field('Vencimento (dias depois da emissão)', `<input type="number" data-iv="dueDays" min="0" max="365" value="${h(d.dueDays ?? 7)}">`)}
      ${field('Observações', `<textarea data-iv="notes" rows="3" maxlength="2000">${h(d.notes)}</textarea>`)}
      ${field('Condições', `<textarea data-iv="terms" rows="3" maxlength="4000" placeholder="Ex.: pagamento por Pix ou cartão até o vencimento.">${h(d.terms)}</textarea>`)}
    </form><div class="es-preview" data-no-translate="1" data-iv-preview>${previewOf(c, d, 'invoice-template')}</div></div></div>`;
}

function scheduleBox(c, d) {
  const from = localDay(Date.now(), c.s.profile.timezone);
  const dates = d.status === 'completed' || d.status === 'cancelled' ? [] : upcoming(d, from, 4);
  return `<section class="iv-next" data-iv-next><h2>Próximas emissões</h2>${dates.length ? `<ol>${dates.map(value => `<li>${h(day(value))}</li>`).join('')}</ol>`
    : `<p class="dim">${d.status === 'completed' ? 'Todas as faturas foram emitidas.' : d.status === 'cancelled' ? 'Cobrança cancelada.' : 'Com esse término não sobra nenhuma emissão.'}</p>`}
    ${d.status === 'active' || d.status === 'paused' ? '' : '<p class="dim">Nada é emitido enquanto a fatura recorrente não for ativada.</p>'}</section>`;
}

function recurringEditor(c, row) {
  const d = iv.draft, zone = c.s.profile.timezone, open = editable(row);
  const lock = open ? '' : ' disabled';
  const actions = {
    draft: `<button type="button" class="primary" data-iv-act="start" data-id="${h(row.id)}">${icon('send', 15)} Ativar</button>`,
    active: `<button type="button" class="secondary" data-iv-act="pause" data-id="${h(row.id)}">Pausar</button><button type="button" class="secondary" data-iv-act="cancel" data-id="${h(row.id)}">Cancelar cobrança</button>`,
    paused: `<button type="button" class="primary" data-iv-act="start" data-id="${h(row.id)}">Retomar</button><button type="button" class="secondary" data-iv-act="cancel" data-id="${h(row.id)}">Cancelar cobrança</button>`
  }[row.status] || '';
  const notes = { active: `Ativa. A próxima fatura sai em ${day(row.nextIssueOn)}${row.send ? ' e vai por e-mail ao cliente' : ''}. Mudanças salvas valem para as próximas emissões.`,
    paused: 'Pausada: nada é emitido até você retomar. Ciclos perdidos não são cobrados depois.',
    completed: `Concluída em ${fmt(row.completedAt || row.updated, zone, true)}, com ${row.issuedCount} fatura${row.issuedCount === 1 ? '' : 's'} emitida${row.issuedCount === 1 ? '' : 's'}.`,
    cancelled: 'Cancelada. As faturas já emitidas continuam em Faturas. Duplique para começar outra.' };
  const issued = (row.invoiceIds || []).map(id => c.s.invoices.find(item => item.id === id)).filter(Boolean).reverse();
  const templates = c.s.invoiceTemplates || [];
  return `<div class="page es-page">${head(c, 'recurring-invoice', row, `${actions}<button type="button" class="secondary" data-iv-act="duplicate" data-kind="recurring-invoice" data-id="${h(row.id)}">Duplicar</button>
      ${row.status === 'active' ? '' : `<button type="button" class="icon-btn" data-iv-act="delete" data-kind="recurring-invoice" data-id="${h(row.id)}" aria-label="Excluir" title="Excluir">${icon('trash', 16)}</button>`}`)}
    ${notes[row.status] ? `<p class="dc-locked surface" role="status">${h(notes[row.status])}</p>` : ''}
    <div class="es-grid"><form class="surface es-form" data-iv-form="edit" novalidate><fieldset class="iv-fields"${lock}>
      <div class="es-two">${field('Nome', `<input data-iv="name" maxlength="160" value="${h(d.name)}">`, 'Aparece como título de cada fatura, com a data.')}
        ${field('Cliente', `<select data-iv="contactId"><option value="">Escolha…</option>${c.s.contacts.map(item => option(item.id, item.name, d.contactId)).join('')}</select>`)}</div>
      ${templates.length && open ? `<div class="iv-template">${field('Preencher com um modelo', `<select data-iv-template><option value="">Escolha um modelo…</option>${templates.map(tpl => option(tpl.id, `${tpl.name} · ${money(tpl.total)}`, '')).join('')}</select>`, 'Copia itens, observações, condições e vencimento.')}</div>` : ''}
      <h2>Agenda</h2>
      <div class="es-two">${field('Frequência', `<select data-iv="frequency">${frequencies.map(([value, text]) => option(value, text, d.frequency)).join('')}</select>`)}
        ${field('Repetir a cada', `<input type="number" data-iv="interval" min="1" max="${MAX_INTERVAL}" value="${h(d.interval || 1)}">`, h(frequencyLabel(d.frequency, d.interval)))}</div>
      <div class="es-two">${field('Começa em', `<input type="date" data-iv="startDate" value="${h(d.startDate)}">`, 'A primeira fatura sai nesse dia.')}
        ${field('Termina', `<select data-iv="endMode">${endModes.map(([value, text]) => option(value, text, d.endMode)).join('')}</select>`)}</div>
      ${d.endMode === 'count' ? field('Número de faturas', `<input type="number" data-iv="endCount" min="1" max="240" value="${h(d.endCount || 12)}">`, row.issuedCount ? `${row.issuedCount} já emitida${row.issuedCount === 1 ? '' : 's'}.` : '') : ''}
      ${d.endMode === 'date' ? field('Última emissão até', `<input type="date" data-iv="endDate" value="${h(d.endDate || '')}">`) : ''}
      ${field('Vencimento (dias depois de cada emissão)', `<input type="number" data-iv="dueDays" min="0" max="365" value="${h(d.dueDays ?? 7)}">`)}
      <h2>Itens</h2>${lineItemsEditor(d.items, c.s.products, { optional: false, taxes: c.s.paymentSettings?.taxes || [] })}
      ${field('Observações', `<textarea data-iv="notes" rows="3" maxlength="2000">${h(d.notes)}</textarea>`)}
      ${field('Condições', `<textarea data-iv="terms" rows="3" maxlength="4000">${h(d.terms)}</textarea>`)}
      <fieldset class="dc-channels"><legend>A cada emissão</legend><label><input type="checkbox" data-iv="send" ${d.send !== false ? 'checked' : ''}><span><b>Enviar a fatura por e-mail</b><small>Com o link para pagar por Pix ou cartão.</small></span></label>
        ${d.send !== false ? `<label><input type="checkbox" data-iv-channel="whatsapp" ${(d.channels || []).includes('whatsapp') ? 'checked' : ''}><span><b>WhatsApp também</b><small>Se o contato tiver telefone.</small></span></label>` : ''}</fieldset>
    </fieldset></form>
    <div class="iv-side"><div class="es-preview" data-no-translate="1" data-iv-preview>${previewOf(c, d, 'recurring-invoice')}</div>${scheduleBox(c, d)}
      ${issued.length ? `<section><h2>Faturas emitidas</h2><ul class="dc-pay-list">${issued.slice(0, 24).map(item => `<li><span data-no-translate="1">${h(item.number || '')} · ${h(item.title)}</span>
        <small>${money(item.value)} · vence ${h(day(item.due))}</small>${invoiceBadge(item)}</li>`).join('')}</ul><a class="secondary" href="#payments/invoices">Ver em Faturas</a></section>` : ''}
      ${(row.audit || []).length ? `<section><h2>Trilha</h2><ol class="dc-trail">${[...row.audit].reverse().slice(0, 40).map(entry => `<li><b>${h(trailNames[entry.event] || entry.event)}</b> · ${h(fmt(entry.at, zone, true))}${entry.detail ? ` · <span data-no-translate="1">${h(entry.detail)}</span>` : ''}</li>`).join('')}</ol></section>` : ''}
    </div></div></div>`;
}

export const invoiceTabs = ['recurring', 'recurring-invoice', 'invoice-templates', 'invoice-template'];

export function invoicesScreen(c) {
  if (c.tab === 'recurring') return recurringList(c);
  if (c.tab === 'invoice-templates') return templateList(c);
  const row = load(c, c.tab);
  if (!row) return `<div class="page"><div class="surface empty">${icon('pay', 26)}<strong>${kinds[c.tab].name} não encontrado</strong><p>Pode ter sido excluído.</p><a class="primary" href="#payments/${kinds[c.tab].list}">Voltar</a></div></div>`;
  return c.tab === 'recurring-invoice' ? recurringEditor(c, row) : templateEditor(c, row);
}

/* ───────── Ações ───────── */

const linkDialog = (path, sent) => `<div class="co-form"><p>${sent ? 'O cliente recebe a fatura por e-mail (se o e-mail da plataforma estiver configurado). ' : ''}Você também pode copiar o link e mandar por onde preferir:</p>
  <div class="dc-link-row"><input readonly value="${h(location.origin + path)}" aria-label="Link da fatura"><button type="button" class="secondary" data-dc-copy="${h(location.origin + path)}">Copiar</button></div>
  <p class="dim">O link é pessoal e mostra só esta fatura. Gerar um novo desativa o anterior.</p><div class="co-form-actions"><button type="button" class="primary" data-act="close">Fechar</button></div></div>`;
const common = d => ({ items: (d.items || []).map(item => ({ ...item, optional: false })), notes: d.notes, terms: d.terms, dueDays: d.dueDays ?? 7 });
const payload = (kind, d) => kind === 'recurring-invoice'
  ? { name: d.name, contactId: d.contactId, templateId: d.templateId, ...common(d), frequency: d.frequency, interval: d.interval, startDate: d.startDate, endMode: d.endMode,
    endCount: d.endCount, endDate: d.endDate, send: d.send !== false, channels: d.channels || ['email'] }
  : { name: d.name, title: d.title, ...common(d) };
const contactPicker = (c, name = 'contactId') => `<label>Cliente<select name="${name}" required><option value="">Escolha…</option>${c.s.contacts.map(item => option(item.id, item.name, '')).join('')}</select></label>`;

export function installInvoices(environment) {
  env = environment;
  const { c, mutate, flash, dialog, close } = env;
  const here = () => c.view === 'payments' && [...invoiceTabs, 'invoices', ''].includes(c.tab || '');
  const editing = () => c.view === 'payments' && kinds[c.tab] && iv.key === c.tab && iv.draft && editable(iv.draft);
  const render = () => { const top = document.querySelector('#screen')?.scrollTop || 0; env.render(); const screen = document.querySelector('#screen'); if (screen) screen.scrollTop = top; };
  const touch = () => {
    if (!iv.dirty) { iv.dirty = true; const save = document.querySelector('[data-iv-save]'); if (save) save.disabled = false; }
    const preview = document.querySelector('[data-iv-preview]'); if (preview) preview.innerHTML = previewOf(c, iv.draft, iv.key);
    const sum = document.querySelector('[data-iv-sum]'); if (sum) sum.textContent = money(itemsTotal(iv.draft.items));
    const title = document.querySelector('[data-iv-title]'); if (title) title.textContent = iv.draft.name;
  };
  async function save() {
    await mutate({ type: 'save', key: kinds[iv.key].key, id: iv.id, data: payload(iv.key, iv.draft) });
    const saved = kinds[iv.key].saved;
    iv.dirty = false; iv.id = '';
    render(); flash(saved);
  }
  const numeric = new Set(['interval', 'endCount', 'dueDays']);

  window.addEventListener('beforeunload', event => { if (iv.dirty && editing()) { event.preventDefault(); event.returnValue = ''; } });
  document.addEventListener('input', event => {
    if (!editing()) return;
    const el = event.target;
    if (el.matches('[data-li]') && lineItemInput(iv.draft.items, el)) { touch(); return; }
    if (el.matches('input[data-iv], textarea[data-iv]') && el.type !== 'checkbox' && el.type !== 'date') { iv.draft[el.dataset.iv] = numeric.has(el.dataset.iv) ? Number(el.value) : el.value; touch(); }
  });
  document.addEventListener('change', event => {
    if (!editing()) return;
    const el = event.target;
    if (el.matches('[data-li], [data-li-add]')) { if (lineItemAction(iv.draft.items, el, c.s.products, c.s.paymentSettings?.taxes || [])) { iv.dirty = true; render(); } return; }
    if (el.matches('[data-iv-template]')) {
      const tpl = (c.s.invoiceTemplates || []).find(row => row.id === el.value);
      if (!tpl) return;
      Object.assign(iv.draft, { templateId: tpl.id, items: structuredClone(tpl.items), notes: tpl.notes, terms: tpl.terms, dueDays: tpl.dueDays, name: iv.draft.name || tpl.title });
      iv.dirty = true; render(); flash(`Itens de “${tpl.name}” copiados. Salve para manter.`); return;
    }
    if (el.matches('[data-iv-channel]')) {
      const set = new Set(iv.draft.channels || ['email']);
      if (el.checked) set.add(el.dataset.ivChannel); else set.delete(el.dataset.ivChannel);
      iv.draft.channels = ['email', ...[...set].filter(value => value !== 'email')]; iv.dirty = true; render(); return;
    }
    if (el.matches('select[data-iv], input[type=checkbox][data-iv], input[type=date][data-iv], input[type=number][data-iv]')) {
      iv.draft[el.dataset.iv] = el.type === 'checkbox' ? el.checked : numeric.has(el.dataset.iv) ? Number(el.value) : el.value;
      iv.dirty = true; render();
    }
  });
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-iv-act],[data-iv-status],[data-iv-save],[data-li-blank],[data-li-del],[data-li-move]');
    if (!el || !(here() || el.closest('#overlay'))) return;
    const ds = el.dataset;
    if (el.matches('[data-li-blank],[data-li-del],[data-li-move]') && !kinds[c.tab]) return;
    try {
      if (ds.ivStatus) { iv.status = ds.ivStatus; render(); return; }
      if ('ivSave' in ds) { el.disabled = true; await save(); return; }
      if (el.matches('[data-li-blank],[data-li-del],[data-li-move]')) { if (editing() && lineItemAction(iv.draft.items, el, c.s.products, c.s.paymentSettings?.taxes || [])) { iv.dirty = true; render(); } return; }
      const kind = ds.kind, k = kinds[kind];
      const row = k ? (c.s[k.key] || []).find(item => item.id === ds.id) : null;
      switch (ds.ivAct) {
        case 'new':
          dialog(kind === 'recurring-invoice' ? 'Nova fatura recorrente' : 'Novo modelo de fatura', `<form class="co-form" data-iv-form="new" data-kind="${kind}">
            <label>Nome<input name="name" required maxlength="160" placeholder="${kind === 'recurring-invoice' ? 'Ex.: Mensalidade de gestão' : 'Ex.: Pacote de redes sociais'}"></label>
            ${kind === 'recurring-invoice' ? `${contactPicker(c).replace(' required', '')}${(c.s.invoiceTemplates || []).length ? `<label>Começar de um modelo<select name="templateId"><option value="">Em branco</option>${c.s.invoiceTemplates.map(tpl => option(tpl.id, `${tpl.name} · ${money(tpl.total)}`, '')).join('')}</select></label>` : ''}` : ''}
            <p class="form-status" role="alert" data-iv-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary" type="submit">Criar</button></div></form>`);
          return;
        case 'duplicate': {
          const copy = { ...payload(kind, row), name: `${row.name} (cópia)`, items: row.items.map(item => ({ ...item, id: undefined })) };
          if (kind === 'recurring-invoice') copy.startDate = '';
          const id = await mutate({ type: 'save', key: k.key, data: copy });
          flash(kind === 'recurring-invoice' ? 'Fatura recorrente duplicada como rascunho.' : 'Modelo duplicado.'); location.hash = `#payments/${kind}/${id}`; return;
        }
        case 'delete':
          dialog(`Excluir ${k.name.toLowerCase()}`, deleteForm(kind, row, kind === 'recurring-invoice'
            ? `“${h(row.name)}” será excluída. As faturas já emitidas continuam em Faturas.` : `O modelo “${h(row.name)}” será excluído. As faturas criadas com ele continuam em Faturas.`));
          return;
        case 'start': {
          if (iv.dirty && editing()) await save();
          const result = await mutate({ type: 'invoice-recurring-start', id: ds.id });
          iv.id = ''; render(); flash(`Fatura recorrente ativa. A próxima sai em ${day(result.nextIssueOn)}.`); return;
        }
        case 'pause': await mutate({ type: 'invoice-recurring-pause', id: ds.id }); iv.id = ''; render(); flash('Fatura recorrente pausada.'); return;
        case 'cancel':
          dialog('Cancelar cobrança', `<form class="co-form" data-iv-form="cancel" data-id="${h(ds.id)}"><p>Nenhuma fatura nova será emitida. As já emitidas continuam em Faturas, em aberto ou pagas.</p>
            <label>Motivo (opcional)<input name="reason" maxlength="200"></label>
            <p class="form-status" role="alert" data-iv-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Voltar</button><button class="danger" type="submit">Cancelar cobrança</button></div></form>`);
          return;
        case 'use': {
          const tpl = (c.s.invoiceTemplates || []).find(item => item.id === ds.id);
          const templates = c.s.invoiceTemplates || [];
          if (!templates.length) { location.hash = '#payments/invoice-templates'; flash('Crie um modelo de fatura primeiro.'); return; }
          dialog('Criar fatura a partir de modelo', `<form class="co-form" data-iv-form="use">
            <label>Modelo<select name="templateId" required>${templates.map(item => option(item.id, `${item.name} · ${money(item.total)}`, tpl?.id || '')).join('')}</select></label>
            ${contactPicker(c)}<fieldset class="dc-channels"><legend>Depois de criar</legend><label><input type="checkbox" name="send" checked><span><b>Enviar ao cliente por e-mail</b><small>Com o link para pagar.</small></span></label></fieldset>
            <p class="form-status" role="alert" data-iv-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary" type="submit">Criar fatura</button></div></form>`);
          return;
        }
        case 'send-invoice': {
          const invoice = c.s.invoices.find(item => item.id === ds.id);
          const contact = contactOf(c, invoice?.contactId);
          dialog('Enviar fatura', `<form class="co-form" data-iv-form="send-invoice" data-id="${h(ds.id)}"><p>O cliente recebe um link pessoal que mostra a fatura e o botão para pagar por Pix ou cartão.</p>
            <fieldset class="dc-channels"><legend>Enviar</legend><label><input type="checkbox" name="email" ${contact?.email ? 'checked' : 'disabled'}><span><b>Por e-mail</b><small>${h(contact?.email || 'O contato não tem e-mail: copie o link.')}</small></span></label>
              <label><input type="checkbox" name="whatsapp"${contact?.email ? '' : ' disabled'}><span><b>WhatsApp também</b><small>Se o contato tiver telefone.</small></span></label></fieldset>
            <p class="form-status" role="alert" data-iv-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary" type="submit">Gerar link</button></div></form>`);
          return;
        }
      }
    } catch (error) { el.disabled = false; flash(error.message, true); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-iv-form]');
    if (!form || form.dataset.ivForm === 'edit') { if (form) event.preventDefault(); return; }
    event.preventDefault();
    const fields = new FormData(form), submit = form.querySelector('button[type="submit"]'), error = form.querySelector('[data-iv-error]');
    submit.disabled = true; error.textContent = '';
    try {
      const kind = form.dataset.ivForm, id = form.dataset.id;
      if (kind === 'new') {
        const type = form.dataset.kind, tpl = (c.s.invoiceTemplates || []).find(row => row.id === fields.get('templateId'));
        const data = type === 'recurring-invoice'
          ? { name: fields.get('name'), contactId: fields.get('contactId') || '', frequency: 'monthly', interval: 1, endMode: 'never', ...(tpl ? { templateId: tpl.id, items: tpl.items.map(item => ({ ...item, id: undefined })), notes: tpl.notes, terms: tpl.terms, dueDays: tpl.dueDays } : { items: [] }) }
          : { name: fields.get('name'), items: [] };
        const created = await mutate({ type: 'save', key: kinds[type].key, data });
        close(); flash(type === 'recurring-invoice' ? 'Fatura recorrente criada como rascunho.' : 'Modelo criado.'); location.hash = `#payments/${type}/${created}`; return;
      }
      if (kind === 'delete') {
        const type = form.dataset.kind;
        await mutate({ type: 'delete', key: kinds[type].key, id }); close(); flash('Excluído.');
        if (kinds[c.tab]) location.hash = `#payments/${kinds[type].list}`; else render(); return;
      }
      if (kind === 'cancel') { await mutate({ type: 'invoice-recurring-cancel', id, data: { reason: fields.get('reason') } }); close(); iv.id = ''; render(); flash('Cobrança cancelada.'); return; }
      if (kind === 'use') {
        const send = fields.has('send');
        const result = await mutate({ type: 'invoice-from-template', id: fields.get('templateId'), data: { contactId: fields.get('contactId'), send } });
        close(); render();
        if (result.path) dialog('Fatura criada', linkDialog(result.path, result.sent)); else flash('Fatura criada em Faturas.');
        return;
      }
      if (kind === 'send-invoice') {
        const result = await mutate({ type: 'invoice-send', id, data: { notify: fields.has('email'), channels: fields.has('whatsapp') ? ['email', 'whatsapp'] : ['email'] } });
        close(); render(); dialog('Fatura enviada', linkDialog(result.path, result.sent));
      }
    } catch (failure) { error.textContent = failure.message; submit.disabled = false; }
  });
}
