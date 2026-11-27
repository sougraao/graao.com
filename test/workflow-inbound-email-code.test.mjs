import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { blank, execute } from '../model.mjs';
import { inboundAddress, inboundEmail, inboundWorkspace, replyText, sender, svixValid } from '../email-inbound.mjs';
import { customCodeLines } from '../workflow-engine.mjs';
import { actionSpec, triggerSpec } from '../ui/workflow-data.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const flow = (s, name, trigger, steps = [{ type: 'add_tag', config: { tag: name } }]) => save(s, 'workflows', { name, active: true, triggers: [trigger], steps });
const SECRET = `whsec_${Buffer.from('segredo-de-teste-123').toString('base64')}`;
const sign = (raw, { id = 'msg_1', timestamp = Math.floor(Date.now() / 1000), secret = SECRET } = {}) => {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  return { 'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64')}` };
};

test('Inbound e-mail helpers: the sub-account address, the Svix signature, the sender and the reply without the quote', t => {
  const previous = process.env.INBOUND_EMAIL_DOMAIN;
  t.after(() => { if (previous === undefined) delete process.env.INBOUND_EMAIL_DOMAIN; else process.env.INBOUND_EMAIL_DOMAIN = previous; });
  delete process.env.INBOUND_EMAIL_DOMAIN;
  assert.equal(inboundAddress('demo'), '', 'no domain, no inbound address');
  process.env.INBOUND_EMAIL_DOMAIN = 'Inbox.Graao.test';
  assert.equal(inboundAddress('demo'), 'conversas+demo@inbox.graao.test');
  assert.equal(inboundWorkspace(['Equipe <CONVERSAS+demo@inbox.graao.test>']), 'demo');
  assert.equal(inboundWorkspace(['conversas+demo@outro.test', 'x@inbox.graao.test']), '');

  const raw = JSON.stringify({ type: 'email.received' });
  assert.equal(svixValid(raw, sign(raw), SECRET), true);
  assert.equal(svixValid(`${raw} `, sign(raw), SECRET), false, 'a changed body fails');
  assert.equal(svixValid(raw, sign(raw, { timestamp: Math.floor(Date.now() / 1000) - 3600 }), SECRET), false, 'an old signature fails');
  assert.equal(svixValid(raw, sign(raw), ''), false, 'no secret, nothing is accepted');

  assert.deepEqual(sender('"Ana Lima" <Ana@X.test>'), { email: 'ana@x.test', name: 'Ana Lima' });
  assert.deepEqual(sender({ email: 'bia@x.test', name: 'Bia' }), { email: 'bia@x.test', name: 'Bia' });
  assert.equal(sender('sem-email'), null);
  assert.equal(replyText('Pode ser terça.\n\nEm seg., 1 de dez. de 2026, Equipe escreveu:\n> Qual dia?'), 'Pode ser terça.');
  assert.equal(replyText('', '<p>Oi&nbsp;tudo bem?</p><div>Abraço</div>'), 'Oi tudo bem?\nAbraço');
});

test('inboundEmail reads the body from the Resend API when the webhook does not carry it', async () => {
  const asked = [];
  const request = async (url, options) => { asked.push([url, options.headers.Authorization]); return { ok: true, json: async () => ({ text: 'Quero o orçamento.\n> citação' }) }; };
  const email = await inboundEmail({ type: 'email.received', data: { email_id: 'em_1', from: 'Caio <caio@x.test>', to: ['conversas+demo@inbox.graao.test'], subject: 'Orçamento' } }, { key: 're_key', request });
  assert.deepEqual(asked, [['https://api.resend.com/emails/receiving/em_1', 'Bearer re_key']]);
  assert.deepEqual([email.id, email.from.email, email.subject, email.body], ['em_1', 'caio@x.test', 'Orçamento', 'Quero o orçamento.']);
  assert.equal(await inboundEmail({ type: 'email.sent', data: {} }), null);
});

test('"E-mail recebido": the e-mail becomes a message in Conversas, creates the contact when needed and never repeats', () => {
  assert.deepEqual(triggerSpec('email_received').fields.map(field => field.key), ['subject', 'from']);
  const s = blank();
  const budget = flow(s, 'orcamento', { type: 'email_received', config: { subject: 'orçamento' } });
  const company = flow(s, 'empresa', { type: 'email_received', config: { from: '@acme.test' } });
  const replied = flow(s, 'respondeu', { type: 'customer_replied', config: { channel: 'Email' } });
  const msgId = execute(s, { type: 'email-inbound', data: { id: 'em_1', email: 'Dani@Acme.test', name: 'Dani', subject: 'Pedido de orçamento', body: 'Vocês atendem sábado?' } });
  const dani = s.contacts.find(row => row.email === 'dani@acme.test');
  assert.ok(dani, 'a new contact from the sender');
  const message = s.messages.find(row => row.id === msgId);
  assert.deepEqual([message.contactId, message.channel, message.direction, message.body, message.externalId], [dani.id, 'Email', 'Inbound', 'Vocês atendem sábado?', 'em_1']);
  assert.deepEqual([runsOf(s, budget).length, runsOf(s, company).length, runsOf(s, replied).length], [1, 1, 1]);
  assert.equal(execute(s, { type: 'email-inbound', data: { id: 'em_1', email: 'dani@acme.test', subject: 'Pedido de orçamento', body: 'de novo' } }), '', 'the same e-mail id is ignored');
  execute(s, { type: 'email-inbound', data: { id: 'em_2', email: 'dani@acme.test', subject: 'Obrigado', body: '' } });
  assert.equal(s.contacts.filter(row => row.email === 'dani@acme.test').length, 1, 'the contact is found by e-mail');
  assert.deepEqual([runsOf(s, budget).length, runsOf(s, company).length], [1, 2]);
  assert.throws(() => execute(s, { type: 'email-inbound', data: { id: 'em_3', email: 'invalido' } }), /E-mail inválido/);
});

test('POST /api/email/inbound accepts only signed Resend events for a sub-account address; e-mails go out with that Reply-To', async t => {
  const env = { INBOUND_EMAIL_DOMAIN: process.env.INBOUND_EMAIL_DOMAIN, RESEND_INBOUND_SECRET: process.env.RESEND_INBOUND_SECRET };
  t.after(() => { for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  process.env.INBOUND_EMAIL_DOMAIN = 'inbox.graao.test';
  process.env.RESEND_INBOUND_SECRET = SECRET;
  const sent = [];
  const documentMail = { linkOf: () => '', async email(to, message, idempotency, options) { sent.push(options); return 'e-mail enviado'; } };
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false, documentMail, inboundFetch: async () => ({ ok: false }) });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = (raw, headers) => fetch(`${base}/api/email/inbound`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: raw });
  const event = to => JSON.stringify({ type: 'email.received', data: { email_id: `em_${to.length}`, from: 'Eva <eva@x.test>', to: [to], subject: 'Dúvida', text: 'Como funciona?' } });

  const raw = event('conversas+demo@inbox.graao.test');
  assert.equal((await post(raw, {})).status, 401, 'unsigned');
  assert.equal((await post(raw, sign(raw, { secret: `whsec_${Buffer.from('outro').toString('base64')}` }))).status, 401, 'wrong secret');
  assert.deepEqual(await (await post(event('alguem@outro.test'), sign(event('alguem@outro.test')))).json(), { ok: true, ignored: true });
  assert.deepEqual(await (await post(raw, sign(raw))).json(), { ok: true });
  const state = (await (await fetch(`${base}/api/state?workspace=demo`)).json()).state;
  const eva = state.contacts.find(row => row.email === 'eva@x.test');
  assert.ok(state.messages.some(row => row.contactId === eva.id && row.direction === 'Inbound' && row.body === 'Como funciona?'));

  const rejected = await fetch(`${base}/api/action?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'email-inbound', data: { id: 'x', email: 'fake@x.test' } }) });
  assert.ok(rejected.status >= 400, 'the browser cannot fake an inbound e-mail');

  const reply = await (await fetch(`${base}/api/action?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'message', data: { contactId: eva.id, channel: 'Email', direction: 'Outbound', subject: 'Re: Dúvida', body: 'Assim.' } }) })).json();
  assert.deepEqual(reply.delivery, { sent: true });
  assert.equal(sent.at(-1).replyTo, 'conversas+demo@inbox.graao.test');
});

test('"Código personalizado": lines "nome = expressão" become flow variables, in order, without network or disk', () => {
  assert.deepEqual(actionSpec('custom_code').fields.map(field => field.key), ['code']);
  assert.deepEqual(customCodeLines('// só comentário\n\n'), { error: 'escreva pelo menos uma linha nome = expressão' });
  assert.match(customCodeLines('total == 2').error, /linha 1/);
  assert.match(customCodeLines(Array.from({ length: 51 }, (_, i) => `v${i} = ${i}`).join('\n')).error, /50 linhas/);
  const s = blank();
  assert.throws(() => flow(s, 'ruim', { type: 'contact_tag', config: { change: 'added', tag: 'x' } }, [{ type: 'custom_code', config: { code: 'isso não é código' } }]), /Código personalizado: linha 1/);
  const id = flow(s, 'calculo', { type: 'contact_tag', config: { change: 'added', tag: 'vip' } }, [
    { id: 'code', type: 'custom_code', config: { code: '// desconto\ntotal = 200 * 0.9\nnome = upper(contact.first_name)\nfaixa = total > 100 ? "alta" : "baixa"' } },
    { type: 'add_tag', config: { tag: '{{vars.nome}}-{{vars.faixa}}' } }
  ]);
  const contactId = save(s, 'contacts', { name: 'Gabi Souza', tags: [], custom: {} });
  save(s, 'contacts', { ...s.contacts.find(row => row.id === contactId), tags: ['vip'] }, contactId);
  const run = runsOf(s, id)[0];
  assert.equal(run.status, 'Completed');
  assert.deepEqual(run.vars, { total: '180', nome: 'GABI', faixa: 'alta' });
  assert.ok(s.contacts.find(row => row.id === contactId).tags.includes('GABI-alta'));

  const broken = flow(s, 'quebrado', { type: 'contact_tag', config: { change: 'added', tag: 'erro' } }, [{ type: 'custom_code', config: { code: 'x = fetch("https://x.test")' } }]);
  save(s, 'contacts', { ...s.contacts.find(row => row.id === contactId), tags: ['vip', 'erro'] }, contactId);
  assert.match(JSON.stringify(runsOf(s, broken)[0]), /erro: linha 1/, 'unknown functions are refused, nothing is called');
});
