import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { requireWorkspaceCommand, workspaceView } from '../authorization.mjs';
import { cleanHtml, cloneBlocks, documentContext, documentTotal, lineTotal, socLibrary, socTemplates, videoEmbed } from '../ui/document-data.js';
import { buildWorkflowContext, resolveTemplate } from '../ui/expressions.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const signer = { id: 'rec-client', label: 'Cliente', role: 'signer', order: 1 };

function workspace() {
  const s = blank();
  const contactId = save(s, 'contacts', { name: 'Ana Souza', email: 'ana@exemplo.test', company: 'Padaria Bom Pão' });
  const productId = save(s, 'products', { name: 'Gestão de redes', price: 1500, kind: 'Recurring', interval: 'Monthly', active: true });
  return { s, contactId, productId };
}

test('Text blocks keep only formatting tags and safe links', () => {
  assert.equal(cleanHtml('<p onclick="x()">Oi <b>Ana</b><script>alert(1)</script></p>'), '<p>Oi <b>Ana</b>alert(1)</p>');
  assert.equal(cleanHtml('<a href="javascript:alert(1)">x</a>'), '<a>x</a>');
  assert.equal(cleanHtml('<a href="https://graao.com/?a=1&b=2">site</a>'), '<a href="https://graao.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">site</a>');
  assert.equal(cleanHtml('<img src=x onerror=alert(1)>Texto'), 'Texto');
  assert.equal(cleanHtml('<div>Linha</div>'), '<p>Linha</p>');
  assert.equal(cleanHtml('5 < 6 & "aspas" &amp; {{contact.name}}'), '5 &lt; 6 &amp; &quot;aspas&quot; &amp; {{contact.name}}');
});

test('Price lists add up quantity, price and discount; optional items count only when selected', () => {
  assert.equal(lineTotal({ qty: 3, price: 1500, discount: 10 }), 4050);
  const blocks = [{ type: 'products', items: [{ qty: 1, price: 100 }, { qty: 2, price: 50, optional: true, selected: false }, { qty: 1, price: 30, optional: true, selected: true }] },
    { type: 'text', html: '' }, { type: 'products', items: [{ qty: 0.5, price: 99.99 }] }];
  assert.equal(documentTotal(blocks), 180);
});

test('Video blocks accept YouTube, Vimeo and Loom links only', () => {
  assert.equal(videoEmbed('https://youtu.be/dQw4w9WgXcQ'), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(videoEmbed('https://vimeo.com/123456789'), 'https://player.vimeo.com/video/123456789');
  assert.equal(videoEmbed('https://www.loom.com/share/0123456789abcdef0123456789abcdef'), 'https://www.loom.com/embed/0123456789abcdef0123456789abcdef');
  assert.equal(videoEmbed('https://evil.test/watch?v=1'), '');
});

test('A document saves its blocks, recipients and variables, and the server computes the total', () => {
  const { s, contactId, productId } = workspace();
  const id = save(s, 'documents', {
    title: 'Proposta Padaria', kind: 'proposal', contactId, total: 999999,
    recipients: [{ ...signer, contactId }],
    variables: [{ key: 'prazo', label: 'Prazo', value: '30 dias' }],
    blocks: [
      { id: 'b-text-01', type: 'text', html: '<h1>Oi {{contact.first_name}}</h1><script>x</script>' },
      { id: 'b-prod-01', type: 'products', items: [{ productId, qty: 2, discount: 10 }, { name: 'Setup', qty: 1, price: 500, optional: true, selected: false }] },
      { id: 'b-field-1', type: 'field', kind: 'signature', recipientId: 'rec-client' },
      { id: 'b-field-2', type: 'field', kind: 'date', recipientId: 'nao-existe' }
    ]
  });
  const doc = s.documents.find(row => row.id === id);
  assert.equal(doc.status, 'draft');
  assert.equal(doc.total, 2700);
  assert.equal(doc.blocks[0].html, '<h1>Oi {{contact.first_name}}</h1>x');
  assert.deepEqual([doc.blocks[1].items[0].name, doc.blocks[1].items[0].price, doc.blocks[1].items[0].interval], ['Gestão de redes', 1500, 'Monthly']);
  assert.equal(doc.recipients[0].email, 'ana@exemplo.test', 'the contact fills the recipient e-mail');
  assert.equal(doc.blocks[3].recipientId, 'rec-client', 'a field without a valid recipient goes to the first one');
  assert.equal(doc.blocks[2].label, 'Campo de assinatura');
});

test('Invalid documents are rejected with a clear message', () => {
  const { s } = workspace();
  assert.throws(() => save(s, 'documents', { title: '' }), /título/);
  assert.throws(() => save(s, 'documents', { title: 'X', contactId: 'nao-existe' }), /contato/);
  assert.throws(() => save(s, 'documents', { title: 'X', blocks: [{ type: 'iframe' }] }), /desconhecido/);
  assert.throws(() => save(s, 'documents', { title: 'X', blocks: [{ type: 'video', url: 'https://evil.test/v' }] }), /YouTube/);
  assert.throws(() => save(s, 'documents', { title: 'X', blocks: [{ type: 'products', items: [{ name: 'A', qty: 1, price: 10, discount: 120 }] }] }), /desconto/);
  assert.throws(() => save(s, 'documents', { title: 'X', blocks: [{ type: 'image', fileId: 'nao-existe' }] }), /imagem/);
  assert.throws(() => save(s, 'documents', { title: 'X', blocks: [{ type: 'columns', left: [{ type: 'products', items: [] }], right: [] }] }), /colunas/);
  assert.throws(() => save(s, 'documents', { title: 'X', variables: [{ key: 'Prazo Final' }] }), /chave/);
  assert.throws(() => save(s, 'documents', { title: 'X', recipients: Array.from({ length: 11 }, () => ({ label: 'R' })) }), /10 destinatários/);
  assert.throws(() => save(s, 'documents', { title: 'X', blocks: Array.from({ length: 201 }, () => ({ type: 'page_break' })) }), /200 blocos/);
});

test('A sent document is frozen: saving only changes the archive flag', () => {
  const { s } = workspace();
  const id = save(s, 'documents', { title: 'Contrato', blocks: [{ type: 'text', html: '<p>Original</p>' }] });
  const doc = s.documents.find(row => row.id === id);
  doc.status = 'sent';
  save(s, 'documents', { title: 'Mudado', archived: true, blocks: [{ type: 'text', html: '<p>Mudado</p>' }] }, id);
  const after = s.documents.find(row => row.id === id);
  assert.deepEqual([after.title, after.blocks[0].html, after.archived, after.status], ['Contrato', '<p>Original</p>', true, 'sent']);
  assert.throws(() => execute(s, { type: 'delete', key: 'documents', id }), /Anule/);
});

test('Templates and library items save; the Graao starters are valid documents', () => {
  const { s } = workspace();
  for (const tpl of socTemplates) {
    const id = save(s, 'documentTemplates', { ...tpl, blocks: cloneBlocks(tpl.blocks) });
    assert.equal(s.documentTemplates.find(row => row.id === id).blocks.length, tpl.blocks.length);
  }
  for (const item of socLibrary) save(s, 'contentBlocks', { name: item.name, category: item.category, blocks: cloneBlocks(item.blocks) });
  assert.equal(s.contentBlocks.length, socLibrary.length);
  assert.throws(() => save(s, 'contentBlocks', { name: 'Vazio', blocks: [] }), /bloco/);
});

test('Deleting a contact, product, opportunity, file or template keeps the document and drops the reference', () => {
  const { s, contactId, productId } = workspace();
  const fileId = save(s, 'files', { name: 'logo.png', data: 'data:image/png;base64,iVBORw0KGgo=' });
  const templateId = save(s, 'documentTemplates', { title: 'Base' });
  const id = save(s, 'documents', { title: 'Proposta', contactId, templateId, recipients: [{ ...signer, contactId }], theme: { logoFileId: fileId },
    blocks: [{ type: 'products', items: [{ productId, qty: 1 }] }, { type: 'columns', left: [{ type: 'image', fileId }], right: [] }] });
  for (const [key, ref] of [['contacts', contactId], ['products', productId], ['files', fileId], ['documentTemplates', templateId]]) execute(s, { type: 'delete', key, id: ref });
  const doc = s.documents.find(row => row.id === id);
  assert.deepEqual([doc.contactId, doc.recipients[0].contactId, doc.blocks[0].items[0].productId, doc.blocks[0].items[0].name, doc.theme.logoFileId, doc.blocks[1].left[0].fileId, doc.templateId],
    ['', '', '', 'Gestão de redes', '', '', '']);
  assert.equal(doc.total, 1500, 'the item keeps its price');
});

test('Documents belong to the Payments module', () => {
  const { s } = workspace();
  save(s, 'documents', { title: 'Proposta' });
  const sales = { modules: ['payments'] }, support = { modules: ['contacts'] };
  for (const key of ['documents', 'documentTemplates', 'contentBlocks']) {
    assert.doesNotThrow(() => requireWorkspaceCommand(sales, { type: 'save', key, data: {} }));
    assert.throws(() => requireWorkspaceCommand(support, { type: 'save', key, data: {} }), /permissão/);
  }
  assert.equal(workspaceView(sales, s).state.documents.length, 1);
  assert.equal(workspaceView(support, s).state.documents.length, 0);
});

test('Preview variables resolve contact, workspace and document values', () => {
  const { s, contactId } = workspace();
  const id = save(s, 'documents', { title: 'Proposta', contactId, expiresAt: '2026-12-31', variables: [{ key: 'prazo', value: '30 dias' }],
    blocks: [{ type: 'products', items: [{ name: 'A', qty: 1, price: 1234.5 }] }] });
  const doc = s.documents.find(row => row.id === id);
  const context = { ...buildWorkflowContext(s, {}, s.contacts[0]), ...documentContext(doc) };
  assert.equal(resolveTemplate('{{contact.first_name}} · {{doc.prazo}} · {{document.total}} · {{document.expires_at}}', context).replace(/\s/g, ' '), 'Ana · 30 dias · R$ 1.234,50 · 31/12/2026');
});
