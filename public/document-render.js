// Documentos e contratos: the HTML of a sent document, shared by the server (public signing page, final
// copy and its SHA-256) and the app (read-only view of sent documents). No inline styles: the public page
// runs under a strict CSP, so colours and widths are classes and the accent is applied by script.
import { documentFonts, fieldKinds, itemsSummary, lineTax, lineTotal, taxKey, videoEmbed } from './document-data.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const when = (iso, zone = 'America/Sao_Paulo') => iso ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: zone }).format(new Date(iso)) : '';
const day = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : esc(value);
export const roleNames = { signer: 'Assina', approver: 'Aprova', cc: 'Recebe cópia' };
export const recipientStates = { waiting: 'Na fila', sent: 'Link enviado', viewed: 'Visualizou', signed: 'Assinou', declined: 'Recusou', cc: 'Recebe cópia', pending: 'Não enviado' };
export const recipientIndex = (doc, id) => Math.max(0, (doc.recipients || []).findIndex(row => row.id === id)) % 10;

function fieldHtml(doc, block, { values, me, interactive, zone }) {
  const recipient = (doc.recipients || []).find(row => row.id === block.recipientId);
  const filled = values?.[block.id];
  const who = recipient?.name || recipient?.label || 'Destinatário';
  const head = `<span class="dc-field-kind">${esc(block.label || fieldKinds[block.kind]?.label)}${block.required ? ' <i aria-label="obrigatório">*</i>' : ''}</span>`;
  let box;
  if (filled) {
    const value = filled.value;
    box = ['signature', 'initials'].includes(block.kind) ? `<span class="dc-field-box filled"><img class="dc-sig" src="${esc(value)}" alt="${esc(block.label)} de ${esc(who)}"></span>`
      : block.kind === 'checkbox' ? `<span class="dc-field-box filled">${value ? '☑ Marcado' : '☐ Não marcado'}</span>`
        : `<span class="dc-field-box filled">${block.kind === 'date' ? day(value) : esc(value)}</span>`;
    return `<div class="dc-field dc-field-${block.kind} dc-rec-${recipientIndex(doc, block.recipientId)} done">${head}${box}<small>${esc(who)} · ${esc(when(filled.at, zone))}</small></div>`;
  }
  if (interactive && block.recipientId === me) {
    return `<div class="dc-field dc-field-${block.kind} dc-rec-${recipientIndex(doc, block.recipientId)} mine" data-field="${esc(block.id)}" data-kind="${block.kind}" data-mode="${block.dateMode || ''}" data-required="${block.required ? '1' : ''}" data-label="${esc(block.label)}">${head}<span class="dc-field-box" data-slot></span><small>Você</small></div>`;
  }
  return `<div class="dc-field dc-field-${block.kind} dc-rec-${recipientIndex(doc, block.recipientId)}">${head}<span class="dc-field-box">Aguardando ${esc(who)}</span><small>${esc(who)}</small></div>`;
}

export function productsHtml(block, selectable) {
  const items = block.items || [];
  if (!items.length) return '';
  const sum = itemsSummary(items);
  // Every tax that appears on a line gets a footer row (0 while its optional lines are unchecked), so the
  // public estimate page can recompute subtotal, taxes and total when the client ticks optional items.
  const taxes = [...new Map(items.filter(item => Number(item.taxRate) > 0).map(item => [taxKey(item), { key: taxKey(item), name: item.taxName || 'Imposto', rate: Number(item.taxRate) }])).values()];
  const amount = key => sum.taxes.find(group => group.key === key)?.amount || 0;
  const pct = rate => String(rate).replace('.', ',');
  const foot = taxes.length ? `<tr class="dc-sub"><td colspan="4">Subtotal</td><td class="num" data-subtotal>${money(sum.subtotal)}</td></tr>${taxes.map(group =>
    `<tr class="dc-sub"><td colspan="4">${esc(group.name)} (${esc(pct(group.rate))}%)</td><td class="num" data-tax-sum="${esc(group.key)}">${money(amount(group.key))}</td></tr>`).join('')}` : '';
  return `<table class="dc-products" data-products><thead><tr><th>Item</th><th class="num">Qtd.</th><th class="num">Preço</th><th class="num">Desc.</th><th class="num">Total</th></tr></thead>
    <tbody>${items.map(item => `<tr class="${item.optional && !item.selected ? 'off' : ''}" data-line="${lineTotal(item) + lineTax(item)}" data-net="${lineTotal(item)}" data-tax="${lineTax(item)}" data-tax-key="${esc(taxKey(item))}"><td>${item.optional
      ? `<label class="dc-optional"><input type="checkbox" data-item="${esc(item.id)}" ${item.selected ? 'checked' : ''} ${selectable ? '' : 'disabled'}> <b>${esc(item.name)}</b> <small>(opcional)</small></label>` : `<b>${esc(item.name)}</b>`}
      ${item.description ? `<small>${esc(item.description)}</small>` : ''}${item.interval ? `<small>Cobrança ${{ Weekly: 'semanal', Monthly: 'mensal', Yearly: 'anual' }[item.interval] || 'recorrente'}</small>` : ''}${Number(item.taxRate) > 0 ? `<small>+ ${esc(item.taxName || 'Imposto')} ${esc(pct(item.taxRate))}%</small>` : ''}</td>
      <td class="num">${esc(item.qty)}</td><td class="num">${money(item.price)}</td><td class="num">${item.discount ? `${esc(item.discount)}%` : '—'}</td><td class="num">${money(lineTotal(item))}</td></tr>`).join('')}</tbody>
    <tfoot>${foot}<tr><td colspan="4">Total</td><td class="num" data-total>${money(sum.total)}</td></tr></tfoot></table>`;
}

function blockHtml(doc, block, opts) {
  const file = id => (opts.files || []).find(row => row.id === id);
  switch (block.type) {
    case 'text': return `<div class="dc-text">${block.html || ''}</div>`;
    case 'image': {
      const src = block.fileId ? file(block.fileId)?.data : block.src;
      return src ? `<figure class="dc-image dc-w-${[25, 50, 75, 100].includes(block.width) ? block.width : 100}"><img src="${esc(src)}" alt="${esc(block.alt)}"></figure>` : '';
    }
    case 'video': {
      const embed = videoEmbed(block.url);
      if (!embed) return '';
      return opts.print ? `<p class="dc-video-link">Vídeo: <a href="${esc(block.url)}">${esc(block.url)}</a></p>`
        : `<div class="dc-video"><iframe src="${esc(embed)}" title="Vídeo" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    }
    case 'table': {
      const [head, ...rest] = block.rows || [[]];
      const row = (cells, tag) => `<tr>${cells.map(cell => `<${tag}>${esc(cell)}</${tag}>`).join('')}</tr>`;
      return `<table class="dc-table">${block.header ? `<thead>${row(head, 'th')}</thead><tbody>${rest.map(cells => row(cells, 'td')).join('')}</tbody>` : `<tbody>${(block.rows || []).map(cells => row(cells, 'td')).join('')}</tbody>`}</table>`;
    }
    case 'products': return productsHtml(block, opts.selectable);
    case 'columns': return `<div class="dc-columns">${['left', 'right'].map(side => `<div class="dc-column">${(block[side] || []).map(inner => blockHtml(doc, inner, opts)).join('')}</div>`).join('')}</div>`;
    case 'attachment': {
      const pdf = file(block.fileId);
      return pdf ? `<div class="dc-attachment"><span><b>${esc(pdf.name)}</b><small>PDF anexado ao documento</small></span>${opts.print ? '' : `<a class="secondary" href="${esc(pdf.data)}" download="${esc(pdf.name)}">Baixar PDF</a>`}</div>` : '';
    }
    case 'page_break': return '<div class="dc-break" aria-hidden="true"></div>';
    case 'field': return fieldHtml(doc, block, opts);
    default: return '';
  }
}

/** The document body (logo + blocks). `blocks` defaults to the frozen copy made when the document was sent. */
export function renderDocument(doc, { files = [], values = doc.values || {}, me = '', interactive = false, selectable = false, print = false, zone, blocks = doc.sentBlocks || doc.blocks || [] } = {}) {
  const font = documentFonts.some(([key]) => key === doc.theme?.font) ? doc.theme.font : 'sans';
  const logo = doc.theme?.logoFileId ? files.find(row => row.id === doc.theme.logoFileId)?.data : '';
  const opts = { files, values, me, interactive, selectable, print, zone };
  return `<article class="dc-sheet preview dc-font-${font}" data-accent="${esc(doc.theme?.accent || '#155eef')}">${logo ? `<img class="dc-logo" src="${esc(logo)}" alt="">` : ''}
    <div class="dc-blocks">${blocks.map(block => `<div class="dc-block dc-${block.type}-block">${blockHtml(doc, block, opts)}</div>`).join('')}</div></article>`;
}

const auditNames = { created: 'Criado', sent: 'Enviado', viewed: 'Visualizado', signed: 'Assinado', approved: 'Aprovado', declined: 'Recusado', void: 'Anulado',
  expired: 'Vencido', completed: 'Concluído', link: 'Novo link gerado', delivered: 'Entrega', charge: 'Cobrança criada', payment: 'Pagamento', paid: 'Pago' };
/** Completion certificate: who signed, when, from where, and the SHA-256 of the document body. */
export function renderCertificate(doc, { zone } = {}) {
  const people = (doc.recipients || []).filter(row => row.role !== 'cc');
  return `<section class="dc-certificate" aria-label="Certificado de conclusão"><h2>Certificado de conclusão</h2>
    <dl class="dc-cert-meta"><div><dt>Documento</dt><dd>${esc(doc.title)}</dd></div><div><dt>Identificador</dt><dd>${esc(doc.id)}</dd></div>
      <div><dt>Enviado em</dt><dd>${esc(when(doc.sentAt, zone))}</dd></div><div><dt>Concluído em</dt><dd>${esc(when(doc.completedAt, zone))}</dd></div>
      <div class="wide"><dt>Hash SHA-256 do conteúdo</dt><dd class="dc-hash">${esc(doc.hash || '')}</dd></div></dl>
    <table class="dc-table"><thead><tr><th>Destinatário</th><th>Ação</th><th>Data e hora</th><th>IP</th></tr></thead><tbody>${people.map(row => `<tr><td><b>${esc(row.name || row.label)}</b><br><small>${esc(row.email)}</small></td>
      <td>${esc(row.status === 'signed' ? (row.role === 'approver' ? 'Aprovou' : 'Assinou') : recipientStates[row.status] || row.status)}</td><td>${esc(when(row.signedAt, zone))}</td><td>${esc(row.ip || '')}</td></tr>`).join('')}</tbody></table>
    <h3>Trilha de auditoria</h3><ol class="dc-audit">${(doc.audit || []).map(entry => `<li><b>${esc(auditNames[entry.event] || entry.event)}</b> · ${esc(when(entry.at, zone))}${entry.detail ? ` · ${esc(entry.detail)}` : ''}${entry.ip ? ` · IP ${esc(entry.ip)}` : ''}</li>`).join('')}</ol>
    <p class="dc-cert-note">Assinatura eletrônica registrada pela Graao (MP 2.200-2/2001, art. 10, §2º, e Lei 14.063/2020), com identificação por link pessoal enviado a cada destinatário, data, hora e IP. Não é assinatura qualificada ICP-Brasil.</p></section>`;
}
