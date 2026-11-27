// Documentos e contratos: the catalog shared by the server (validation, totals) and the browser (editor,
// preview) — document kinds and statuses, block and field types, recipient roles, the Graao content
// library and starter templates, the HTML allowlist and the price list math. See docs/implementation/05.

export const documentKinds = [['proposal', 'Proposta'], ['contract', 'Contrato'], ['document', 'Documento']];
export const documentStatuses = [['draft', 'Rascunho', ''], ['sent', 'Aguardando', 'blue'], ['completed', 'Concluído', 'green'],
  ['declined', 'Recusado', 'red'], ['expired', 'Expirado', 'gold'], ['void', 'Anulado', '']];
export const recipientRoles = [['signer', 'Assina'], ['approver', 'Aprova'], ['cc', 'Recebe cópia']];
export const documentFonts = [['sans', 'Sem serifa', 'Inter, "Segoe UI", system-ui, sans-serif'], ['serif', 'Serifada', 'Georgia, "Times New Roman", serif'],
  ['mono', 'Técnica', '"JetBrains Mono", ui-monospace, monospace']];
export const libraryCategories = [['about', 'Sobre nós'], ['benefits', 'Benefícios'], ['pricing', 'Planos'], ['team', 'Equipe'], ['video', 'Vídeo'], ['columns', 'Duas colunas'], ['other', 'Outros']];
export const recipientColors = ['#155eef', '#c4320a', '#067647', '#7a2e98', '#b54708', '#0e7090', '#c11574', '#344054', '#4e5ba6', '#a15c07'];

export const blockKinds = {
  text: { label: 'Texto', icon: 'note' },
  image: { label: 'Imagem', icon: 'palette' },
  video: { label: 'Vídeo', icon: 'play' },
  table: { label: 'Tabela', icon: 'grid' },
  products: { label: 'Lista de produtos', icon: 'pay' },
  columns: { label: 'Duas colunas', icon: 'panel' },
  attachment: { label: 'Anexo PDF', icon: 'paperclip' },
  page_break: { label: 'Quebra de página', icon: 'menu' },
  field: { label: 'Campo', icon: 'edit' }
};
export const fieldKinds = {
  signature: { label: 'Campo de assinatura', icon: 'edit' },
  initials: { label: 'Rubrica', icon: 'key' },
  text: { label: 'Texto', icon: 'note' },
  date: { label: 'Data', icon: 'cal' },
  checkbox: { label: 'Caixa de seleção', icon: 'check' }
};
export const LIMITS = { blocks: 200, recipients: 10, variables: 30, items: 50, tableRows: 20, tableCols: 8, columnBlocks: 6, html: 20000 };

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const round2 = value => Math.round(Number(value) * 100) / 100;
export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const validId = value => typeof value === 'string' && /^[a-z0-9_-]{4,40}$/i.test(value);

/* ───────── HTML do bloco de texto ───────── */

const allowedTags = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'div']);
const escapeText = value => value.replace(/&(?!(#\d{1,7}|#x[0-9a-f]{1,6}|[a-z][a-z0-9]{1,31});)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const safeHref = value => {
  const href = String(value || '').replace(/&amp;/g, '&').trim();
  return /^(https?:\/\/|mailto:)[^\s"'<>]+$/i.test(href) ? href.replace(/&/g, '&amp;') : '';
};
/** Keeps only formatting tags (no attributes except a safe link href); everything else becomes text. */
export function cleanHtml(value, limit = LIMITS.html) {
  const source = String(value ?? '').slice(0, limit);
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^<>]*)>/g;
  let out = '', last = 0, match;
  while ((match = tag.exec(source))) {
    out += escapeText(source.slice(last, match.index));
    last = tag.lastIndex;
    const [, closing, rawName, attributes] = match, name = rawName.toLowerCase();
    if (!allowedTags.has(name)) continue;
    const tagName = name === 'div' ? 'p' : name;
    if (closing) { if (tagName !== 'br') out += `</${tagName}>`; continue; }
    if (tagName === 'a') {
      const href = safeHref(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attributes)?.slice(1).find(Boolean));
      out += href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">` : '<a>';
    } else out += `<${tagName}>`;
  }
  return out + escapeText(source.slice(last));
}

/* ───────── Lista de produtos ───────── */

export const lineTotal = item => round2(Math.max(0, Number(item.qty) || 0) * Math.max(0, Number(item.price) || 0) * (1 - Math.min(100, Math.max(0, Number(item.discount) || 0)) / 100));
export const itemCounts = item => !item.optional || item.selected;
/** Tax of one line (added on top of the net line total, like GoHighLevel's exclusive taxes). */
export const lineTax = item => { const rate = Math.min(100, Math.max(0, Number(item.taxRate) || 0)); return rate ? round2(lineTotal(item) * rate / 100) : 0; };
export const taxKey = item => `${item.taxName || 'Imposto'}|${Number(item.taxRate) || 0}`;
/** Subtotal, taxes grouped by name and rate, and total of a price list (optional items count only when selected). */
export function itemsSummary(items = []) {
  const groups = new Map();
  let subtotal = 0, tax = 0;
  for (const item of (items || []).filter(itemCounts)) {
    const net = lineTotal(item), part = lineTax(item);
    subtotal += net; tax += part;
    if (!part) continue;
    const key = taxKey(item), group = groups.get(key) || { key, name: item.taxName || 'Imposto', rate: Number(item.taxRate), amount: 0 };
    group.amount = round2(group.amount + part);
    groups.set(key, group);
  }
  return { subtotal: round2(subtotal), taxes: [...groups.values()], tax: round2(tax), total: round2(subtotal + tax) };
}
/** Sum of every price list in the document, taxes included. */
export function documentTotal(blocks = []) {
  return round2((blocks || []).filter(block => block?.type === 'products').reduce((sum, block) => sum + itemsSummary(block.items).total, 0));
}

/* ───────── Vídeo ───────── */

/** Embed address for YouTube, Vimeo and Loom links, or '' when the link is not one of them. */
export function videoEmbed(url) {
  const value = String(url || '').trim();
  let match = /^https:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,20})/i.exec(value);
  if (match) return `https://www.youtube-nocookie.com/embed/${match[1]}`;
  match = /^https:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d{5,12})/i.exec(value);
  if (match) return `https://player.vimeo.com/video/${match[1]}`;
  match = /^https:\/\/(?:www\.)?loom\.com\/(?:share|embed)\/([0-9a-f]{20,40})/i.exec(value);
  if (match) return `https://www.loom.com/embed/${match[1]}`;
  return '';
}

/* ───────── Blocos novos e cópias ───────── */

export function newBlock(type, extra = {}) {
  const id = newId();
  switch (type) {
    case 'text': return { id, type, html: '<p>Escreva aqui. Use variáveis como {{contact.first_name}}.</p>', ...extra };
    case 'image': return { id, type, fileId: '', src: '', alt: '', width: 100, ...extra };
    case 'video': return { id, type, url: '', ...extra };
    case 'table': return { id, type, header: true, rows: [['Item', 'Descrição'], ['', '']], ...extra };
    case 'products': return { id, type, items: [], ...extra };
    case 'columns': return { id, type, left: [newBlock('text', { html: '<p>Coluna da esquerda.</p>' })], right: [newBlock('text', { html: '<p>Coluna da direita.</p>' })], ...extra };
    case 'attachment': return { id, type, fileId: '', ...extra };
    case 'page_break': return { id, type, ...extra };
    case 'field': return { id, type, kind: 'signature', label: 'Assinatura do signatário', required: true, recipientId: '', dateMode: 'signed_at', ...extra };
    default: return null;
  }
}
/** Deep copy of blocks with fresh ids (inserting library items, duplicating, starting from a template). */
export function cloneBlocks(blocks = []) {
  return structuredClone(blocks || []).map(block => {
    block.id = newId();
    if (block.type === 'columns') { block.left = cloneBlocks(block.left); block.right = cloneBlocks(block.right); }
    if (block.type === 'products') block.items = (block.items || []).map(item => ({ ...item, id: newId() }));
    return block;
  });
}
export const newRecipient = (index = 0, extra = {}) => ({ id: newId(), label: index ? `Signatário ${index + 1}` : 'Cliente', contactId: '', name: '', email: '', role: 'signer', order: index + 1, ...extra });

/** A drawn or typed signature, sent by the signing page as a PNG under 200 KB. */
export const signatureValid = value => typeof value === 'string' && value.length <= 270000 && /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(value);

/* ───────── Validação (servidor) ───────── */

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const money = (value, label) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1e9) fail(`Informe um valor válido em ${label}.`);
  return round2(n);
};

export function validItem(state, raw) {
  if (!isObject(raw)) fail('Item da lista de produtos inválido.');
  const productId = text(raw.productId, 60);
  const product = productId ? (state.products || []).find(row => row.id === productId) : null;
  const name = text(raw.name, 160) || product?.name || fail('Dê um nome a cada item da lista de produtos.');
  const qty = Number(raw.qty ?? 1);
  if (!Number.isFinite(qty) || qty <= 0 || qty > 1e6) fail(`Informe uma quantidade válida para “${name}”.`);
  const discount = Number(raw.discount || 0);
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) fail(`O desconto de “${name}” precisa estar entre 0 e 100%.`);
  const optional = Boolean(raw.optional);
  // A tax from Pagamentos → Configurações is copied onto the line (name and rate), so later changes to the
  // tax list do not alter what was already sent or issued.
  const taxId = text(raw.taxId, 60);
  const tax = taxId ? (state.paymentSettings?.taxes || []).find(row => row.id === taxId) : null;
  return { id: validId(raw.id) ? raw.id : newId(), productId: product ? product.id : '', name, description: text(raw.description, 600),
    qty: round2(qty), price: money(raw.price ?? product?.price ?? 0, `“${name}”`), discount: round2(discount),
    interval: product?.kind === 'Recurring' ? product.interval || '' : '', optional, selected: optional ? raw.selected !== false : true,
    ...(tax ? { taxId: tax.id, taxName: tax.name, taxRate: tax.rate } : {}) };
}

function validFile(state, fileId, kind) {
  const id = text(fileId, 60);
  if (!id) return '';
  const file = (state.files || []).find(row => row.id === id);
  const ok = file && (kind === 'pdf' ? file.data?.startsWith('data:application/pdf') : file.data?.startsWith('data:image/'));
  return ok ? id : fail(kind === 'pdf' ? 'Escolha um PDF da Mídia Drive.' : 'Escolha uma imagem da Mídia Drive.');
}

function validBlock(state, raw, recipients, nested = false) {
  if (!isObject(raw) || !Object.hasOwn(blockKinds, raw.type)) fail('Bloco de documento desconhecido.');
  const type = raw.type, id = validId(raw.id) ? raw.id : newId();
  if (nested && !['text', 'image'].includes(type)) fail('As colunas aceitam só texto e imagem.');
  switch (type) {
    case 'text': return { id, type, html: cleanHtml(raw.html) };
    case 'image': {
      const src = text(raw.src, 1000);
      if (src && !/^https:\/\/[^\s"'<>]+$/i.test(src)) fail('O endereço da imagem precisa começar com https://');
      const width = [25, 50, 75, 100].includes(Number(raw.width)) ? Number(raw.width) : 100;
      return { id, type, fileId: validFile(state, raw.fileId, 'image'), src, alt: text(raw.alt, 200), width };
    }
    case 'video': {
      const url = text(raw.url, 500);
      if (url && !videoEmbed(url)) fail('Use um link do YouTube, Vimeo ou Loom no bloco de vídeo.');
      return { id, type, url };
    }
    case 'table': {
      const rows = Array.isArray(raw.rows) ? raw.rows.slice(0, LIMITS.tableRows) : [];
      const width = Math.min(LIMITS.tableCols, Math.max(1, ...rows.map(row => Array.isArray(row) ? row.length : 0)));
      return { id, type, header: raw.header !== false, rows: (rows.length ? rows : [['']]).map(row => Array.from({ length: width }, (_, i) => text(Array.isArray(row) ? row[i] : '', 500))) };
    }
    case 'products': {
      const items = Array.isArray(raw.items) ? raw.items : [];
      if (items.length > LIMITS.items) fail(`Uma lista de produtos aceita até ${LIMITS.items} itens.`);
      return { id, type, items: items.map(item => validItem(state, item)) };
    }
    case 'columns': {
      const side = list => {
        if (!Array.isArray(list) || list.length > LIMITS.columnBlocks) fail(`Cada coluna aceita até ${LIMITS.columnBlocks} blocos.`);
        return list.map(block => validBlock(state, block, recipients, true));
      };
      return { id, type, left: side(raw.left || []), right: side(raw.right || []) };
    }
    case 'attachment': return { id, type, fileId: validFile(state, raw.fileId, 'pdf') };
    case 'page_break': return { id, type };
    case 'field': {
      const kind = Object.hasOwn(fieldKinds, raw.kind) ? raw.kind : fail('Tipo de campo desconhecido.');
      const recipientId = recipients.some(row => row.id === raw.recipientId) ? raw.recipientId : recipients[0]?.id || '';
      return { id, type, kind, label: text(raw.label, 120) || fieldKinds[kind].label, required: raw.required !== false, recipientId,
        dateMode: kind === 'date' && raw.dateMode === 'pick' ? 'pick' : 'signed_at' };
    }
  }
}

export function validBlocks(state, blocks, recipients = []) {
  if (blocks === undefined) return [];
  if (!Array.isArray(blocks)) fail('Conteúdo do documento inválido.');
  if (blocks.length > LIMITS.blocks) fail(`Um documento aceita até ${LIMITS.blocks} blocos.`);
  return blocks.map(block => validBlock(state, block, recipients));
}

export function validRecipients(state, list) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) fail('Lista de destinatários inválida.');
  if (list.length > LIMITS.recipients) fail(`Um documento aceita até ${LIMITS.recipients} destinatários.`);
  return list.map((raw, index) => {
    if (!isObject(raw)) fail('Destinatário inválido.');
    const contactId = text(raw.contactId, 60);
    const contact = contactId ? (state.contacts || []).find(row => row.id === contactId) : null;
    if (contactId && !contact) fail('Escolha um contato desta subconta para o destinatário.');
    const email = text(raw.email, 254).toLowerCase() || contact?.email || '';
    if (email && !/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email)) fail(`O e-mail do destinatário ${index + 1} não é válido.`);
    const order = Number.isInteger(Number(raw.order)) && Number(raw.order) >= 1 && Number(raw.order) <= LIMITS.recipients ? Number(raw.order) : index + 1;
    return { id: validId(raw.id) ? raw.id : newId(), label: text(raw.label, 60) || `Destinatário ${index + 1}`, contactId: contact?.id || '',
      name: text(raw.name, 120) || contact?.name || '', email, role: recipientRoles.some(([value]) => value === raw.role) ? raw.role : 'signer', order };
  });
}

export function validVariables(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list) || list.length > LIMITS.variables) fail(`Use até ${LIMITS.variables} variáveis por documento.`);
  const seen = new Set();
  return list.map(raw => {
    const key = text(raw?.key, 40).toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) fail('A chave da variável usa letras minúsculas, números e _ (ex.: prazo_entrega).');
    if (seen.has(key)) fail(`A variável ${key} aparece duas vezes.`);
    seen.add(key);
    return { key, label: text(raw?.label, 80) || key, value: text(raw?.value, 1000) };
  });
}

export function validTheme(state, raw) {
  const theme = isObject(raw) ? raw : {};
  return { accent: /^#[0-9a-f]{6}$/i.test(theme.accent || '') ? theme.accent.toLowerCase() : '#155eef',
    font: documentFonts.some(([value]) => value === theme.font) ? theme.font : 'sans',
    logoFileId: validFile(state, theme.logoFileId, 'image') };
}

/* ───────── Cobrança após assinar (item 1.4) ───────── */

export const paymentModes = [['one_time', 'Pagamento único'], ['recurring', 'Assinatura mensal']];
export const paymentTimings = [['on_sign', 'Logo depois de assinar'], ['invoice', 'Fatura com prazo']];
/** Payment settings of a draft or template; null means the document does not charge. */
export function validPayment(raw) {
  if (!raw || typeof raw !== 'object' || !raw.mode) return null;
  const mode = paymentModes.some(([key]) => key === raw.mode) ? raw.mode : fail('Escolha como cobrar o documento.');
  const timing = paymentTimings.some(([key]) => key === raw.timing) ? raw.timing : 'on_sign';
  const dueDays = Math.round(Number(raw.dueDays ?? 7));
  if (!Number.isFinite(dueDays) || dueDays < 0 || dueDays > 365) fail('O prazo da fatura vai de 0 a 365 dias.');
  let schedule = [];
  if (mode === 'one_time' && Array.isArray(raw.schedule) && raw.schedule.length) {
    if (raw.schedule.length > 12) fail('Use até 12 parcelas.');
    schedule = raw.schedule.map((part, index) => {
      const percent = Math.round(Number(part?.percent) * 100) / 100, days = Math.round(Number(part?.dueDays));
      if (!(percent > 0 && percent <= 100)) fail(`A parcela ${index + 1} precisa de um percentual entre 0 e 100.`);
      if (!Number.isFinite(days) || days < 0 || days > 730) fail(`O prazo da parcela ${index + 1} vai de 0 a 730 dias.`);
      return { percent, dueDays: days };
    });
    const sum = Math.round(schedule.reduce((n, part) => n + part.percent, 0) * 100) / 100;
    if (sum !== 100) fail(`As parcelas somam ${String(sum).replace('.', ',')}%. Ajuste para 100%.`);
  }
  return { mode, timing, dueDays, schedule, interval: mode === 'recurring' ? 'Monthly' : '' };
}
/** The charges a payment setting creates for a total: one per installment, or one monthly charge. */
export function paymentParts(payment, total) {
  if (!payment || !(total > 0)) return [];
  if (payment.mode === 'recurring') return [{ value: round2(total), dueDays: payment.timing === 'on_sign' ? 0 : payment.dueDays, recurring: true }];
  const parts = payment.schedule?.length ? payment.schedule : [{ percent: 100, dueDays: payment.timing === 'on_sign' ? 0 : payment.dueDays }];
  let left = round2(total);
  return parts.map((part, index) => {
    const value = index === parts.length - 1 ? left : round2(total * part.percent / 100);
    left = round2(left - value);
    return { value, dueDays: part.dueDays, index: index + 1, of: parts.length };
  });
}

/* ───────── Variáveis na prévia ───────── */

/** Values for {{doc.*}} and {{document.*}}, to merge into the workflow context (contact, account…). */
export function documentContext(doc, total = documentTotal(doc?.blocks)) {
  return {
    doc: Object.fromEntries((doc?.variables || []).map(row => [row.key, row.value])),
    document: { title: doc?.title || doc?.name || '', total: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total),
      expires_at: doc?.expiresAt ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${doc.expiresAt}T12:00:00`)) : '' }
  };
}
export const contactVariables = [['contact.first_name', 'Primeiro nome'], ['contact.name', 'Nome completo'], ['contact.email', 'E-mail'],
  ['contact.phone', 'Telefone'], ['contact.company', 'Empresa'], ['account.name', 'Nome da empresa (subconta)'],
  ['document.title', 'Título do documento'], ['document.total', 'Total do documento'], ['document.expires_at', 'Validade']];

/* ───────── Biblioteca de conteúdo e modelos da Graao ───────── */

const t = html => ({ type: 'text', html });
export const socLibrary = [
  { id: 'graao-about', name: 'Sobre nós', category: 'about', blocks: [t('<h2>Sobre nós</h2><p>Somos a {{account.name}}. Ajudamos empresas como a {{contact.company}} a crescer com processos claros, atendimento próximo e resultados que dá para medir.</p><p>Conte aqui a história da empresa, há quanto tempo atua e o que a diferencia.</p>')] },
  { id: 'graao-benefits', name: 'Benefícios', category: 'benefits', blocks: [t('<h2>O que você ganha</h2><ul><li><b>Mais tempo:</b> tarefas repetitivas passam a rodar sozinhas.</li><li><b>Mais clareza:</b> relatórios simples, com os números que importam.</li><li><b>Mais vendas:</b> nenhum contato fica sem resposta.</li></ul>')] },
  { id: 'graao-pricing', name: 'Planos', category: 'pricing', blocks: [t('<h2>Investimento</h2><p>Escolha os itens que fazem sentido para você. Os itens opcionais podem ser marcados antes de assinar.</p>'), { type: 'products', items: [] }] },
  { id: 'graao-team', name: 'Equipe', category: 'team', blocks: [t('<h2>Quem vai cuidar do seu projeto</h2>'), { type: 'table', header: true, rows: [['Nome', 'Função', 'Contato'], ['', 'Gerente de conta', ''], ['', 'Especialista', '']] }] },
  { id: 'graao-video', name: 'Vídeo', category: 'video', blocks: [t('<h2>Uma mensagem para você</h2><p>Grave um vídeo curto explicando a proposta e cole o link abaixo.</p>'), { type: 'video', url: '' }] },
  { id: 'graao-columns', name: 'Duas colunas', category: 'columns', blocks: [{ type: 'columns', left: [t('<h3>Hoje</h3><p>Como o cliente trabalha agora e o que o impede de crescer.</p>')], right: [t('<h3>Com a gente</h3><p>Como vai ficar depois do projeto e em quanto tempo.</p>')] }] }
];

const signer = { id: 'role-client', label: 'Cliente', contactId: '', name: '', email: '', role: 'signer', order: 1 };
const signatureBlocks = [t('<h2>Assinaturas</h2><p>Ao assinar, as partes concordam com os termos deste documento.</p>'),
  { type: 'field', kind: 'signature', label: 'Assinatura do cliente', required: true, recipientId: signer.id, dateMode: 'signed_at' },
  { type: 'field', kind: 'date', label: 'Data', required: true, recipientId: signer.id, dateMode: 'signed_at' }];
export const socTemplates = [
  { id: 'graao-proposal', title: 'Proposta comercial', kind: 'proposal', recipients: [signer], ordered: false, variables: [{ key: 'prazo', label: 'Prazo de entrega', value: '30 dias' }],
    theme: { accent: '#155eef', font: 'sans', logoFileId: '' },
    blocks: [t('<h1>Proposta para {{contact.company}}</h1><p>Olá, {{contact.first_name}}. Preparamos esta proposta com base na nossa conversa.</p>'),
      ...socLibrary[0].blocks, ...socLibrary[1].blocks, t('<h2>Investimento</h2>'), { type: 'products', items: [] },
      t('<p>Prazo de entrega: {{doc.prazo}}. Esta proposta vale até {{document.expires_at}}.</p>'), ...signatureBlocks] },
  { id: 'graao-contract', title: 'Contrato de prestação de serviços', kind: 'contract', recipients: [signer], ordered: false,
    variables: [{ key: 'inicio', label: 'Data de início', value: '' }, { key: 'vigencia', label: 'Vigência', value: '12 meses' }],
    theme: { accent: '#344054', font: 'serif', logoFileId: '' },
    blocks: [t('<h1>Contrato de prestação de serviços</h1><p><b>Contratante:</b> {{contact.name}} ({{contact.company}}), e-mail {{contact.email}}.</p><p><b>Contratada:</b> {{account.name}}.</p>'),
      t('<h2>1. Objeto</h2><p>Descreva os serviços que serão prestados.</p><h2>2. Prazo</h2><p>Início em {{doc.inicio}}, com vigência de {{doc.vigencia}}.</p><h2>3. Valor e pagamento</h2><p>Pelos serviços, a contratante paga o valor abaixo.</p>'),
      { type: 'products', items: [] },
      t('<h2>4. Rescisão</h2><p>Qualquer parte pode encerrar este contrato com aviso de 30 dias por escrito.</p><h2>5. Foro</h2><p>Fica eleito o foro da comarca da contratada.</p>'),
      { type: 'page_break' }, ...signatureBlocks] }
];
