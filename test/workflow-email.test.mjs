import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { blank, execute } from '../model.mjs';
import { actionSpec } from '../ui/workflow-data.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
function run(steps, contact = {}) {
  const s = blank('W');
  const id = save(s, 'workflows', { name: 'Envio', active: true, triggers: [{ type: 'contact_created' }], steps });
  const contactId = save(s, 'contacts', { name: 'Ana Lima', email: 'ana@x.test', phone: '+55 81 99999-0000', tags: [], custom: {}, ...contact });
  return { s, contact: s.contacts.find(row => row.id === contactId), results: s.runs.find(row => row.workflowId === id).results.join(' | '), outbox: s.workflowOutbox || [] };
}

test('"Enviar e-mail" queues the delivery with the preference link in the footer; no e-mail marks the message', () => {
  const { s, contact, outbox, results } = run([{ type: 'send_email', config: { subject: 'Oi, {{contact.first_name}}', body: 'Seu pedido saiu.' } }]);
  const item = outbox.find(row => row.kind === 'email');
  assert.match(results, /na fila de envio/);
  assert.equal(item.to, 'ana@x.test');
  assert.equal(item.subject, 'Oi, Ana');
  assert.equal(item.path, `/preferencias/demo/${contact.prefToken}`);
  assert.equal(item.body, `Seu pedido saiu.\n\n—\nPara escolher o que você recebe: /preferencias/demo/${contact.prefToken}`);
  assert.equal(s.messages.find(row => row.id === item.messageId).body, 'Seu pedido saiu.', 'Conversas keeps the message without the footer');

  const none = run([{ type: 'send_email', config: { subject: 'Oi', body: 'Texto' } }], { email: '' });
  assert.match(none.results, /contato sem e-mail/);
  assert.equal(none.s.messages.find(row => row.channel === 'Email').failed, 'no_email');
  assert.equal(none.outbox.filter(row => row.kind === 'email').length, 0);
});

test('"Pedir consentimento" sends the preference page by WhatsApp or e-mail, with the link where the text asks', () => {
  assert.deepEqual(actionSpec('send_optin').fields.map(field => field.key), ['channel', 'subject', 'body']);
  const whats = run([{ type: 'send_optin', config: { channel: 'WhatsApp', body: 'Oi, {{contact.first_name}}! Escolha aqui: {{link_preferencias}} Obrigado.' } }]);
  const item = whats.outbox.find(row => row.kind === 'whatsapp');
  const path = `/preferencias/demo/${whats.contact.prefToken}`;
  assert.equal(item.body, `Oi, Ana! Escolha aqui: ${path} Obrigado.`);
  assert.equal(item.path, path);
  assert.ok(whats.contact.optInRequestedAt);
  const mail = run([{ type: 'send_optin', config: { channel: 'Email', subject: 'Preferências', body: 'Quer continuar recebendo?' } }]);
  const sent = mail.outbox.find(row => row.kind === 'email');
  assert.equal(sent.body, `Quer continuar recebendo?\n/preferencias/demo/${mail.contact.prefToken}`, 'without the placeholder the link goes at the end');
  assert.equal(sent.subject, 'Preferências');
  assert.match(run([{ type: 'send_optin', config: { channel: 'WhatsApp', body: 'Oi' } }], { phone: '' }).results, /contato sem telefone/);
  assert.match(run([{ type: 'send_optin', config: { channel: 'WhatsApp', body: 'Oi' } }], { dnd: true }).results, /não perturbe/);
});

test('The server sends workflow and team e-mails through the mailer; a mailer error marks the message as not delivered', async t => {
  const sent = [];
  let fail = '';
  const documentMail = {
    linkOf: item => item.path ? `https://app.graao.test${item.path}` : '',
    // Like the real mailer: always a sentence, "e-mail enviado" on success.
    async email(to, { subject, text }, idempotency, options) { if (fail) return fail; sent.push({ to, subject, text, idempotency, options }); return 'e-mail enviado'; }
  };
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false, documentMail });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => (await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) })).json();
  const state = async () => (await call('/api/state?workspace=demo')).state;
  await call('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Boas-vindas', active: true, triggers: [{ type: 'contact_created' }],
    steps: [{ type: 'send_email', config: { subject: 'Bem-vinda, {{contact.first_name}}', body: 'Que bom ter você aqui.' } }] } });
  const { id: contactId } = await call('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Bia Souza', email: 'bia@example.test', tags: [], custom: {} } });
  let s;
  for (let i = 0; i < 60 && !sent.length; i++) { await new Promise(resolve => setTimeout(resolve, 20)); }
  s = await state();
  const bia = s.contacts.find(row => row.id === contactId);
  assert.equal(sent[0].to, 'bia@example.test');
  assert.equal(sent[0].subject, 'Bem-vinda, Bia');
  assert.equal(sent[0].text, `Que bom ter você aqui.\n\n—\nPara escolher o que você recebe: https://app.graao.test/preferencias/demo/${bia.prefToken}`);
  assert.match(sent[0].idempotency, /^wf-email-demo-/);
  assert.ok(s.runs.find(row => row.name === 'Boas-vindas').results.includes('E-mail: enviado'));

  const reply = await call('/api/action?workspace=demo', { type: 'message', data: { contactId, channel: 'Email', direction: 'Outbound', subject: 'Sua dúvida', body: 'Respondendo por aqui.' } });
  assert.deepEqual(reply.delivery, { sent: true });
  assert.deepEqual([sent.at(-1).subject, sent.at(-1).text], ['Sua dúvida', 'Respondendo por aqui.']);

  fail = 'e-mail não enviado (HTTP 422)';
  const rejected = await call('/api/action?workspace=demo', { type: 'message', data: { contactId, channel: 'Email', direction: 'Outbound', subject: 'Erro', body: 'Recusado pela Resend.' } });
  assert.deepEqual(rejected.delivery, { sent: false, reason: 'provider_error' });
  fail = 'e-mail não configurado (RESEND_API_KEY e PORTAL_EMAIL_FROM)';
  const failed = await call('/api/action?workspace=demo', { type: 'message', data: { contactId, channel: 'Email', direction: 'Outbound', subject: 'De novo', body: 'Outra mensagem.' } });
  assert.deepEqual(failed.delivery, { sent: false, reason: 'not_connected' });
  s = await state();
  assert.equal(s.messages.find(row => row.body === 'Outra mensagem.').failed, 'not_connected');
});
