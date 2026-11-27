import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { tokenHash } from '../document-model.mjs';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const act = (s, type, id, data = {}) => execute(s, { type, id, data }, { workspace: 'demo' });
const tokenOf = path => path.split('#')[1];
const open = (s, path, extra = {}) => act(s, 'document-open', '', { tokenHash: tokenHash(tokenOf(path)), ip: '203.0.113.9', ...extra });
const sign = (s, path, data) => act(s, 'document-sign', '', { tokenHash: tokenHash(tokenOf(path)), ip: '203.0.113.9', accept: true, ...data });

function setup({ ordered = false, expiresAt = '' } = {}) {
  const s = blank();
  s.profile.email = 'dono@agencia.com.br';
  const contactId = save(s, 'contacts', { name: 'Ana Souza', email: 'ana@exemplo.com.br', company: 'Padaria Bom Pão', phone: '+55 11 99999-0000' });
  const id = save(s, 'documents', {
    title: 'Contrato Padaria', contactId, ordered, expiresAt,
    recipients: [{ id: 'rec-ana', label: 'Cliente', contactId, role: 'signer', order: 1 }, { id: 'rec-bia', label: 'Agência', name: 'Bia Lima', email: 'bia@agencia.com.br', role: 'signer', order: 2 },
      { id: 'rec-cc', label: 'Financeiro', name: 'Caio', email: 'caio@agencia.com.br', role: 'cc', order: 3 }],
    variables: [{ key: 'prazo', value: '30 dias' }],
    blocks: [
      { id: 'b-text-01', type: 'text', html: '<p>Contratante: {{contact.company}} · prazo {{doc.prazo}}</p>' },
      { id: 'b-prod-01', type: 'products', items: [{ id: 'item-base1', name: 'Gestão', qty: 1, price: 1000 }, { id: 'item-extra', name: 'Extra', qty: 1, price: 300, optional: true, selected: false }] },
      { id: 'f-ana-sig', type: 'field', kind: 'signature', recipientId: 'rec-ana' },
      { id: 'f-ana-txt', type: 'field', kind: 'text', label: 'CPF', recipientId: 'rec-ana' },
      { id: 'f-ana-day', type: 'field', kind: 'date', recipientId: 'rec-ana' },
      { id: 'f-bia-sig', type: 'field', kind: 'signature', recipientId: 'rec-bia' }
    ]
  });
  return { s, id, contactId, doc: () => s.documents.find(row => row.id === id) };
}

test('Sending checks recipients and signature fields, freezes variables and creates one personal link per signer', () => {
  const { s, id, doc } = setup();
  const workflow = save(s, 'workflows', { name: 'Avisar envio', active: true, triggers: [{ type: 'document_status', config: { status: 'sent' } }], steps: [{ type: 'add_tag', config: { tag: 'contrato-enviado' } }] });
  assert.ok(workflow);
  const { links } = act(s, 'document-send', id, { channels: ['email', 'whatsapp'], message: 'Segue o contrato.', origin: 'https://app.graao.test' });
  assert.equal(links.length, 2, 'without order, every signer gets a link at once (cc only at the end)');
  assert.match(links[0].path, /^\/assinar\/demo#[0-9a-f]{48}$/);
  const sent = doc();
  assert.equal(sent.status, 'sent');
  assert.equal(sent.sentBlocks[0].html, '<p>Contratante: Padaria Bom Pão · prazo 30 dias</p>');
  assert.equal(sent.blocks[0].html, '<p>Contratante: {{contact.company}} · prazo {{doc.prazo}}</p>', 'the editable original keeps the variables');
  assert.deepEqual(sent.recipients.map(row => row.status), ['sent', 'sent', 'cc']);
  assert.ok(sent.recipients.every(row => !JSON.stringify(row).includes(tokenOf(links[0].path))), 'only the hash of the token is stored');
  const outbox = s.workflowOutbox.filter(item => item.kind === 'document');
  assert.deepEqual(outbox.map(item => [item.email, item.channels.join('+'), item.phone]), [['ana@exemplo.com.br', 'email+whatsapp', '+55 11 99999-0000'], ['bia@agencia.com.br', 'email+whatsapp', '']]);
  assert.ok(s.contacts[0].tags.includes('contrato-enviado'), 'the document_status trigger ran the workflow');
  assert.throws(() => act(s, 'document-send', id), /já foi enviado/);
  save(s, 'documents', { title: 'Mudou' }, id);
  assert.equal(doc().title, 'Contrato Padaria', 'a sent document is frozen');
});

test('Sending refuses documents without e-mail, without signature field or past the deadline', () => {
  const a = setup();
  a.doc().recipients[1].email = '';
  assert.throws(() => act(a.s, 'document-send', a.id), /e-mail de Bia Lima/);
  const b = setup();
  b.doc().blocks = b.doc().blocks.filter(block => block.id !== 'f-bia-sig');
  assert.throws(() => act(b.s, 'document-send', b.id), /campo de assinatura para Bia Lima/);
  const c = setup({ expiresAt: '2020-01-01' });
  assert.throws(() => act(c.s, 'document-send', c.id), /validade/);
});

test('Signing in order: the second signer only gets a link after the first; completion hashes the copy and notifies everyone', () => {
  const { s, id, doc } = setup({ ordered: true });
  const { links } = act(s, 'document-send', id, {});
  assert.equal(links.length, 1);
  assert.deepEqual(doc().recipients.map(row => row.status), ['sent', 'waiting', 'cc']);

  const first = open(s, links[0].path);
  assert.equal(first.me.name, 'Ana Souza');
  assert.equal(first.canSign, true);
  assert.equal(first.selectable, true);
  assert.deepEqual(first.fields.map(field => field.id), ['f-ana-sig', 'f-ana-txt', 'f-ana-day']);
  assert.match(first.html, /data-field="f-ana-sig"/);
  assert.doesNotMatch(first.html, /bia@agencia/, 'the page does not show other e-mails');
  assert.equal(doc().recipients[0].status, 'viewed');

  assert.throws(() => sign(s, links[0].path, { values: { 'f-ana-txt': '123' } }), /Assine no campo/);
  assert.throws(() => sign(s, links[0].path, { values: { 'f-ana-sig': 'data:image/png;base64,<script>', 'f-ana-txt': '1' } }), /não é válida/);
  assert.throws(() => sign(s, links[0].path, { accept: false, values: { 'f-ana-sig': PNG, 'f-ana-txt': '1' } }), /Confirme/);
  const afterAna = sign(s, links[0].path, { values: { 'f-ana-sig': PNG, 'f-ana-txt': '123.456.789-00' }, items: ['item-extra'] });
  assert.equal(afterAna.me.status, 'signed');
  assert.deepEqual(afterAna.waitingFor, ['Bia Lima']);
  assert.equal(doc().total, 1300, 'the optional item chosen by the first signer counts');
  assert.equal(doc().values['f-ana-day'].value, new Date().toISOString().slice(0, 10), 'date fields fill with the signing day');
  assert.equal(doc().recipients[1].status, 'sent', 'the next in order got a link');
  assert.throws(() => sign(s, links[0].path, { values: { 'f-ana-sig': PNG } }), /não está mais aguardando/);

  const biaLink = s.workflowOutbox.filter(item => item.recipientId === 'rec-bia').at(-1).path;
  const before = s.workflowOutbox.length;
  const done = sign(s, biaLink, { values: { 'f-bia-sig': PNG } });
  assert.equal(done.status, 'completed');
  assert.match(doc().hash, /^[0-9a-f]{64}$/);
  assert.equal(done.intact, true);
  assert.match(done.certificate, /Certificado de conclusão/);
  assert.match(done.certificate, new RegExp(doc().hash));
  const finals = s.workflowOutbox.slice(before);
  assert.deepEqual(finals.filter(item => item.final).map(item => item.email).sort(), ['ana@exemplo.com.br', 'bia@agencia.com.br', 'caio@agencia.com.br']);
  assert.ok(finals.some(item => item.kind === 'document-owner' && item.event === 'completed' && item.email === 'dono@agencia.com.br'));
  assert.equal(open(s, links[0].path).status, 'completed', 'the first link still opens the final copy');
  assert.deepEqual(doc().audit.map(entry => entry.event), ['sent', 'viewed', 'signed', 'signed', 'completed']);
  assert.equal(doc().audit[2].ip, '203.0.113.9');
});

test('Declining, voiding, expiring and replacing a link close the right doors', () => {
  const a = setup();
  act(a.s, 'document-send', a.id, {});
  assert.equal(a.doc().status, 'sent');
  const pathA = a.s.workflowOutbox.find(item => item.recipientId === 'rec-ana').path;
  const declined = act(a.s, 'document-decline', '', { tokenHash: tokenHash(tokenOf(pathA)), reason: 'Valor acima do combinado' });
  assert.equal(declined.status, 'declined');
  assert.equal(a.doc().declineReason, 'Valor acima do combinado');
  assert.throws(() => sign(a.s, pathA, { values: {} }), /não está mais aguardando/);
  act(a.s, 'document-void', a.id, { reason: 'Nova versão' });
  assert.equal(open(a.s, pathA).status, 'void');

  const b = setup({ expiresAt: new Date(Date.now() + 864e5).toISOString().slice(0, 10) });
  act(b.s, 'document-send', b.id, {});
  const pathB = b.s.workflowOutbox.find(item => item.recipientId === 'rec-ana').path;
  const fresh = act(b.s, 'document-link', b.id, { recipientId: 'rec-ana' });
  assert.throws(() => open(b.s, pathB), /não é válido ou foi substituído/);
  assert.equal(open(b.s, fresh.path).me.name, 'Ana Souza');
  b.doc().expiresAt = '2020-01-01';
  const late = open(b.s, fresh.path);
  assert.equal(late.status, 'expired');
  assert.equal(late.canSign, false);
  assert.throws(() => act(b.s, 'document-link', b.id, { recipientId: 'rec-ana' }), /não tem um link ativo/);
  execute(b.s, { type: 'delete', key: 'documents', id: b.id });
  assert.equal(b.s.documents.length, 0, 'expired documents can be deleted');
});

test('The workflow action sends a document from a template to the enrolled contact', () => {
  const s = blank();
  const contactId = save(s, 'contacts', { name: 'Rafa Lima', email: 'rafa@exemplo.com.br' });
  const templateId = save(s, 'documentTemplates', { title: 'Proposta padrão', recipients: [{ id: 'role-client', label: 'Cliente', role: 'signer', order: 1 }],
    blocks: [{ type: 'text', html: '<p>Olá {{contact.first_name}}</p>' }, { type: 'field', kind: 'signature', recipientId: 'role-client' }] });
  save(s, 'workflows', { name: 'Proposta automática', active: true, triggers: [{ type: 'contact_tag', config: { tag: 'quer-proposta' } }],
    steps: [{ type: 'send_document', config: { templateId, channel: 'email', expiresDays: 10 } }] });
  save(s, 'contacts', { name: 'Rafa Lima', email: 'rafa@exemplo.com.br', tags: ['quer-proposta'] }, contactId);
  const doc = s.documents.at(-1);
  assert.equal(doc?.status, 'sent');
  assert.equal(doc.title, 'Proposta padrão · Rafa Lima');
  assert.equal(doc.sentBlocks[0].html, '<p>Olá Rafa</p>');
  assert.equal(doc.recipients[0].email, 'rafa@exemplo.com.br');
  assert.equal(doc.templateId, templateId);
  assert.ok(s.workflowOutbox.some(item => item.kind === 'document' && item.email === 'rafa@exemplo.com.br'));
  assert.match(s.runs.at(-1).results.join(' '), /enviado/);
});

test('Public signing API: page with strict CSP, open and sign by token, no workspace data leaks', async () => {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, body: json, text, csp: r.headers.get('content-security-policy') };
  };
  try {
    const workspace = (await call('/api/workspaces', { name: 'Assinaturas' })).body.id;
    const action = command => call(`/api/action?workspace=${workspace}`, command);
    const contactId = (await action({ type: 'save', key: 'contacts', data: { name: 'Ana Souza', email: 'ana@exemplo.com.br', notes: 'SEGREDO-INTERNO' } })).body.id;
    const id = (await action({ type: 'save', key: 'documents', data: { title: 'Proposta', contactId, recipients: [{ id: 'rec-ana', label: 'Cliente', contactId, role: 'signer' }],
      blocks: [{ type: 'text', html: '<p>Oi {{contact.first_name}}</p>' }, { id: 'f-sig-0001', type: 'field', kind: 'signature', recipientId: 'rec-ana' }] } })).body.id;
    const sent = await action({ type: 'document-send', id, data: { origin: 'https://evil.test' } });
    assert.equal(sent.status, 200);
    const path = sent.body.id.links[0].path;
    assert.ok(path.startsWith(`/assinar/${workspace}#`));

    const page = await call(path.split('#')[0]);
    assert.equal(page.status, 200);
    assert.match(page.text, /document-sign\.js/);
    assert.match(page.csp, /script-src 'self'/);
    assert.doesNotMatch(page.csp, /unsafe-inline/);

    const token = path.split('#')[1];
    assert.equal((await call(`/api/assinar/${workspace}`, { action: 'open', token: 'f'.repeat(48) })).status, 404);
    assert.equal((await call(`/api/assinar/${workspace}`, { action: 'open', token: 'nope' })).status, 404);
    const opened = await call(`/api/assinar/${workspace}`, { action: 'open', token });
    assert.equal(opened.status, 200);
    assert.match(opened.body.html, /Oi Ana/);
    assert.doesNotMatch(opened.text, /SEGREDO-INTERNO|ana@exemplo\.com\.br/, 'the page only gets this document');
    const signed = await call(`/api/assinar/${workspace}`, { action: 'sign', token, accept: true, values: { 'f-sig-0001': PNG } });
    assert.equal(signed.status, 200);
    assert.equal(signed.body.status, 'completed');
    const state = (await call(`/api/state?workspace=${workspace}`)).body.state;
    const doc = state.documents.find(row => row.id === id);
    assert.equal(doc.status, 'completed');
    assert.equal(doc.audit.find(entry => entry.event === 'signed').ip.length > 0, true);
  } finally {
    server.close();
  }
});
