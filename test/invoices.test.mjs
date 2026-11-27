import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { invoiceTokenHash } from '../invoice-model.mjs';
import { occurrence, upcoming, frequencyLabel, localDay } from '../ui/invoice-data.js';
import { requireWorkspaceCommand } from '../authorization.mjs';
import { documentMessage } from '../document-mail.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const act = (s, type, id, data = {}) => execute(s, { type, id, data, actor: 'Bia' }, { workspace: 'demo' });
const tick = (s, day) => execute(s, { type: 'invoice-tick', data: { at: `${day}T15:00:00.000Z` } }, { workspace: 'demo' });
const hashOf = path => invoiceTokenHash(path.split('#')[1]);
const today = () => localDay(Date.now(), 'America/Sao_Paulo');

function setup() {
  const s = blank();
  const contactId = save(s, 'contacts', { name: 'Ana Souza', email: 'ana@exemplo.com.br', company: 'Padaria Bom Pão' });
  const templateId = save(s, 'invoiceTemplates', { name: 'Mensalidade social', title: 'Gestão de redes sociais', dueDays: 5, terms: 'Pix ou cartão.',
    items: [{ name: 'Gestão', qty: 1, price: 900 }, { name: 'Relatório', qty: 1, price: 100, optional: true, selected: false }] });
  return { s, contactId, templateId };
}

test('Schedules keep the start day and fall back to the end of short months', () => {
  assert.deepEqual([0, 1, 2, 3].map(k => occurrence('2026-01-31', 'monthly', 1, k)), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual([0, 1].map(k => occurrence('2028-02-29', 'yearly', 1, k)), ['2028-02-29', '2029-02-28']);
  assert.equal(occurrence('2026-11-20', 'weekly', 2, 1), '2026-12-04');
  assert.equal(occurrence('2026-11-30', 'daily', 3, 1), '2026-12-03');
  assert.deepEqual(upcoming({ startDate: '2026-11-20', frequency: 'monthly', interval: 1, endMode: 'count', endCount: 2 }, '2026-11-01'), ['2026-11-20', '2026-12-20']);
  assert.deepEqual(upcoming({ startDate: '2026-11-20', frequency: 'monthly', interval: 1, endMode: 'date', endDate: '2027-01-19' }, '2026-11-21'), ['2026-12-20']);
  assert.deepEqual(upcoming({ startDate: '2026-11-20', frequency: 'monthly', interval: 1, endMode: 'count', endCount: 3, issuedCount: 1, lastIssuedOn: '2026-11-20' }, '2026-11-20'),
    ['2026-12-20', '2027-01-20'], 'what was issued today is not listed again');
  assert.equal(frequencyLabel('weekly', 2), 'A cada 2 semanas');
  assert.equal(frequencyLabel('monthly', 1), 'Mensal');
});

test('Templates hold items without optional lines and create numbered invoices for a client', () => {
  const { s, contactId, templateId } = setup();
  const tpl = s.invoiceTemplates.find(row => row.id === templateId);
  assert.equal(tpl.total, 1000, 'an invoice charges every line it lists');
  assert.ok(tpl.items.every(item => !item.optional));
  assert.throws(() => save(s, 'invoiceTemplates', { name: '' }), /nome ao modelo/);
  assert.throws(() => save(s, 'invoiceTemplates', { name: 'X', dueDays: 400 }), /0 a 365/);
  const { id } = act(s, 'invoice-from-template', templateId, { contactId });
  const invoice = s.invoices.find(row => row.id === id);
  assert.deepEqual([invoice.number, invoice.title, invoice.value, invoice.status, invoice.templateId, invoice.items.length], ['FAT-0001', 'Gestão de redes sociais', 1000, 'Open', templateId, 2]);
  assert.equal(invoice.due, new Date(Date.parse(`${invoice.issueDate}T12:00:00Z`) + 5 * 864e5).toISOString());
  assert.equal(act(s, 'invoice-from-template', templateId, { contactId }).id && s.invoices.at(-1).number, 'FAT-0002');
  assert.throws(() => act(s, 'invoice-from-template', templateId, {}), /cliente/);
});

test('An invoice is sent with a personal link that shows only it and leads to payment', () => {
  const { s, contactId, templateId } = setup();
  const { id } = act(s, 'invoice-from-template', templateId, { contactId });
  const { path, sent } = act(s, 'invoice-send', id, { origin: 'https://app.graao.test' });
  assert.match(path, /^\/fatura\/demo#[0-9a-f]{48}$/);
  assert.equal(sent, true);
  const mail = s.workflowOutbox.find(item => item.what === 'invoice');
  assert.deepEqual([mail.email, mail.title, mail.value], ['ana@exemplo.com.br', 'FAT-0001 · Gestão de redes sociais', 1000]);
  assert.match(documentMessage(mail, `https://app.graao.test${path}`).text, /R\$\s1\.000,00.*\n[\s\S]*\/fatura\/demo#/);
  const view = act(s, 'invoice-open', '', { tokenHash: hashOf(path) });
  assert.deepEqual([view.number, view.value, view.payable], ['FAT-0001', 1000, true]);
  assert.match(view.html, /Gestão/);
  assert.doesNotMatch(JSON.stringify(view), /tokens|contactId/);
  assert.deepEqual(act(s, 'invoice-payable', '', { tokenHash: hashOf(path) }), { invoiceId: id });
  const second = act(s, 'invoice-send', id, { notify: false });
  assert.equal(second.sent, false);
  assert.equal(s.workflowOutbox.filter(item => item.what === 'invoice').length, 1, 'copying a link sends nothing');
  assert.throws(() => act(s, 'invoice-open', '', { tokenHash: hashOf(path) }), /não é válido/, 'a new link replaces the old one');
  save(s, 'invoices', { ...s.invoices.find(row => row.id === id), status: 'Paid' }, id);
  assert.throws(() => act(s, 'invoice-payable', '', { tokenHash: hashOf(second.path) }), /já está paga/);
  assert.throws(() => act(s, 'invoice-send', id), /já está paga/);
});

test('A recurring invoice issues one invoice per cycle, e-mails it and completes after the last one', () => {
  const { s, contactId } = setup();
  const start = today();
  save(s, 'workflows', { name: 'Emitida', active: true, triggers: [{ type: 'recurring_invoice_status', config: { status: 'issued' } }], steps: [{ type: 'add_tag', config: { tag: 'fatura-emitida' } }] });
  const id = save(s, 'recurringInvoices', { name: 'Mensalidade', contactId, items: [{ name: 'Gestão', qty: 1, price: 500 }], frequency: 'monthly', startDate: start, endMode: 'count', endCount: 2, dueDays: 3 });
  const rec = () => s.recurringInvoices.find(row => row.id === id);
  assert.deepEqual([rec().status, rec().nextIssueOn, rec().total], ['draft', '', 500]);
  assert.deepEqual(tick(s, start), [], 'drafts issue nothing');
  assert.deepEqual(act(s, 'invoice-recurring-start', id), { nextIssueOn: start });
  const first = tick(s, start);
  assert.equal(first.length, 1);
  assert.deepEqual(tick(s, start), [], 'one invoice per cycle');
  const invoice = s.invoices.find(row => row.id === first[0]);
  assert.deepEqual([invoice.recurringId, invoice.cycle, invoice.value, invoice.status], [id, 1, 500, 'Open']);
  assert.equal(s.workflowOutbox.filter(item => item.what === 'invoice').length, 1);
  assert.ok(s.contacts.find(row => row.id === contactId).tags.includes('fatura-emitida'));
  const next = occurrence(start, 'monthly', 1, 1);
  assert.deepEqual([rec().issuedCount, rec().lastIssuedOn, rec().nextIssueOn], [1, start, next]);
  assert.equal(tick(s, next).length, 1);
  assert.deepEqual([rec().status, rec().nextIssueOn, rec().issuedCount], ['completed', '', 2]);
  assert.throws(() => save(s, 'recurringInvoices', { ...rec(), name: 'Outra' }, id), /terminou/);
});

test('Pausing stops issuing, resuming does not bill missed cycles and the end is checked', () => {
  const { s, contactId } = setup();
  const start = today();
  const id = save(s, 'recurringInvoices', { name: 'Semanal', contactId, items: [{ name: 'Post', qty: 2, price: 50 }], frequency: 'weekly', startDate: start });
  const rec = () => s.recurringInvoices.find(row => row.id === id);
  act(s, 'invoice-recurring-start', id);
  assert.throws(() => execute(s, { type: 'delete', key: 'recurringInvoices', id }), /Pause ou cancele/);
  act(s, 'invoice-recurring-pause', id);
  assert.deepEqual(tick(s, start), [], 'paused issues nothing');
  act(s, 'invoice-recurring-start', id);
  assert.equal(rec().audit.at(-1).event, 'resumed');
  const late = occurrence(start, 'weekly', 1, 3);
  assert.equal(tick(s, late).length, 1, 'a late tick issues a single invoice');
  assert.ok(rec().nextIssueOn > late, 'and jumps past the missed weeks');
  act(s, 'invoice-recurring-cancel', id);
  assert.equal(rec().status, 'cancelled');
  assert.throws(() => act(s, 'invoice-recurring-start', id), /rascunhos e faturas pausadas/);
  const empty = save(s, 'recurringInvoices', { name: 'Sem cliente', items: [] });
  assert.throws(() => act(s, 'invoice-recurring-start', empty), /cliente/);
  const over = save(s, 'recurringInvoices', { name: 'Curta', contactId, items: [{ name: 'A', qty: 1, price: 10 }], startDate: '2026-01-01', endMode: 'date', endDate: '2026-02-01' });
  assert.throws(() => act(s, 'invoice-recurring-start', over), /não sobra nenhuma fatura/);
  assert.throws(() => save(s, 'recurringInvoices', { name: 'X', startDate: '2026-05-01', endMode: 'date', endDate: '2026-04-01' }), /depois do início/);
});

test('Workflows send an invoice and start a recurring invoice from a template', () => {
  const { s, contactId, templateId } = setup();
  save(s, 'workflows', { name: 'Cliente novo', active: true, triggers: [{ type: 'contact_tag', config: { tag: 'cliente' } }],
    steps: [{ type: 'send_invoice', config: { templateId } }, { type: 'start_recurring_invoice', config: { templateId, frequency: 'monthly', interval: 1, count: 6 } }] });
  const contact = s.contacts.find(row => row.id === contactId);
  save(s, 'contacts', { ...contact, tags: ['cliente'] }, contactId);
  const run = s.runs.at(-1);
  assert.ok(run, 'the workflow ran');
  assert.ok(s.invoices.some(row => row.templateId === templateId && row.number === 'FAT-0001'), run.results.join(' | '));
  const rec = s.recurringInvoices.find(row => row.contactId === contactId);
  assert.deepEqual([rec.status, rec.endMode, rec.endCount, rec.total, rec.templateId], ['active', 'count', 6, 1000, templateId]);
});

test('Deleting a contact removes its recurring invoices; the new commands need the payments module', () => {
  const { s, contactId } = setup();
  save(s, 'recurringInvoices', { name: 'Mensal', contactId, items: [{ name: 'A', qty: 1, price: 10 }] });
  execute(s, { type: 'delete', key: 'contacts', id: contactId });
  assert.equal(s.recurringInvoices.length, 0);
  for (const type of ['invoice-from-template', 'invoice-send', 'invoice-recurring-start', 'invoice-recurring-pause', 'invoice-recurring-cancel'])
    assert.doesNotThrow(() => requireWorkspaceCommand({ modules: ['payments'] }, { type }), type);
  for (const type of ['invoice-open', 'invoice-payable', 'invoice-tick'])
    assert.throws(() => requireWorkspaceCommand({ modules: ['payments'] }, { type }), /Unknown operation/, type);
});

test('Payment settings validate receipts and taxes; taxes are copied onto lines and added to totals', () => {
  const { s, contactId } = setup();
  assert.deepEqual([s.paymentSettings.receipts.prefix, s.paymentSettings.receipts.enabled, s.paymentSettings.taxes.length], ['REC-', true, 0]);
  assert.throws(() => act(s, 'payment-settings', '', { receipts: { prefix: '' } }), /prefixo/);
  assert.throws(() => act(s, 'payment-settings', '', { receipts: { ...s.paymentSettings.receipts, replyTo: 'x' } }), /Responder para/);
  assert.throws(() => act(s, 'payment-settings', '', { receipts: s.paymentSettings.receipts, taxes: [{ name: 'ISS', rate: 0 }] }), /alíquota/);
  assert.throws(() => act(s, 'payment-settings', '', { receipts: s.paymentSettings.receipts, taxes: [{ name: 'ISS', rate: 5 }, { name: 'iss', rate: 5 }] }), /já está na lista/);
  act(s, 'payment-settings', '', { receipts: { ...s.paymentSettings.receipts, prefix: 'R-', startNumber: 100 }, taxes: [{ name: 'ISS', rate: 5 }, { name: 'PIS', rate: 0.65 }] });
  const [iss, pis] = s.paymentSettings.taxes;
  const tpl = save(s, 'invoiceTemplates', { name: 'Com imposto', items: [{ name: 'Gestão', qty: 1, price: 1000, taxId: iss.id }, { name: 'Anúncios', qty: 2, price: 100, taxId: pis.id }, { name: 'Sem imposto', qty: 1, price: 50 }] });
  const row = s.invoiceTemplates.find(item => item.id === tpl);
  assert.deepEqual([row.items[0].taxName, row.items[0].taxRate, row.items[2].taxRate], ['ISS', 5, undefined]);
  assert.equal(row.total, 1250 + 50 + 1.3, 'subtotal 1250 + ISS 50 + PIS 1,30');
  const est = save(s, 'estimates', { title: 'Orçamento', items: [{ name: 'Gestão', qty: 1, price: 200, taxId: iss.id }, { name: 'Extra', qty: 1, price: 100, taxId: iss.id, optional: true, selected: false }] });
  assert.equal(s.estimates.find(item => item.id === est).total, 210, 'unselected optional lines add no tax');
  act(s, 'payment-settings', '', { receipts: s.paymentSettings.receipts, taxes: [{ ...iss, rate: 10 }, pis] });
  const { id } = act(s, 'invoice-from-template', tpl, { contactId });
  assert.equal(s.invoices.find(item => item.id === id).value, 1301.3, 'templates keep the rate they were saved with');
  const view = act(s, 'invoice-send', id).path && act(s, 'invoice-open', '', { tokenHash: invoiceTokenHash(s.workflowOutbox.at(-1).path.split('#')[1]) });
  assert.match(view.html, /Subtotal[\s\S]*ISS \(5%\)[\s\S]*PIS \(0,65%\)/);
});

test('A paid invoice gets a numbered receipt once and the client receives it by e-mail', () => {
  const { s, contactId, templateId } = setup();
  act(s, 'payment-settings', '', { receipts: { ...s.paymentSettings.receipts, prefix: 'REC-', startNumber: 42, fromName: 'Studio Norte', replyTo: 'financeiro@studio.com.br',
    subject: '{{titulo}} {{numero_recibo}}', message: 'Olá, {{cliente}}. Recebemos {{valor}} de {{fatura}}. {{desconhecida}}' } });
  const { id } = act(s, 'invoice-from-template', templateId, { contactId });
  const invoice = () => s.invoices.find(row => row.id === id);
  save(s, 'invoices', { ...invoice(), status: 'Paid' }, id);
  assert.equal(invoice().receiptNumber, 'REC-0042');
  const mail = s.workflowOutbox.find(item => item.what === 'receipt');
  assert.deepEqual([mail.subject, mail.fromName, mail.replyTo, mail.email], ['Recibo REC-0042', 'Studio Norte', 'financeiro@studio.com.br', 'ana@exemplo.com.br']);
  assert.equal(mail.message, 'Olá, Ana Souza. Recebemos R$\u00a01.000,00 de FAT-0001 · Gestão de redes sociais. {{desconhecida}}');
  const view = act(s, 'invoice-open', '', { tokenHash: invoiceTokenHash(mail.path.split('#')[1]) });
  assert.deepEqual([view.receipt.number, view.receipt.title], ['REC-0042', 'Recibo']);
  assert.match(view.html, /Recibo REC-0042/);
  save(s, 'invoices', { ...invoice(), status: 'Open' }, id);
  save(s, 'invoices', { ...invoice(), status: 'Paid' }, id);
  assert.equal(invoice().receiptNumber, 'REC-0042', 'the number is given once');
  const second = act(s, 'invoice-from-template', templateId, { contactId }).id;
  act(s, 'payment-settings', '', { receipts: { ...s.paymentSettings.receipts, enabled: false } });
  save(s, 'invoices', { ...s.invoices.find(row => row.id === second), status: 'Paid' }, second);
  assert.equal(s.invoices.find(row => row.id === second).receiptNumber, 'REC-0043', 'numbered even when the e-mail is off');
  assert.equal(s.workflowOutbox.filter(item => item.what === 'receipt').length, 1);
});

test('A store order marked as paid gives its invoice a receipt', () => {
  const s = blank();
  const productId = save(s, 'products', { name: 'Caneca', price: 50, kind: 'One time', active: true });
  const storeId = save(s, 'stores', { name: 'Loja', active: true, items: [{ productId }], shipping: { mode: 'pickup', pickup: true }, taxPercent: 0, payment: { method: 'Pix' } });
  execute(s, { type: 'store-checkout', id: storeId, data: { name: 'Bia', email: 'bia@exemplo.com.br', items: [{ productId, qty: 1 }], delivery: 'pickup' } }, { workspace: 'loja' });
  const order = s.orders.at(-1);
  save(s, 'orders', { id: order.id, status: 'Paid', note: '', tracking: '' }, order.id);
  const invoice = s.invoices.find(row => row.id === order.invoiceId);
  assert.deepEqual([invoice.status, invoice.receiptNumber], ['Paid', 'REC-0001']);
  assert.ok(s.workflowOutbox.some(item => item.what === 'receipt' && item.email === 'bia@exemplo.com.br'));
});
