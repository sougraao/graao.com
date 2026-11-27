import test from 'node:test';
import assert from 'node:assert/strict';
import { emailDomains, normalizeDomain, normalizeLocalPart, workspaceSender } from '../email-domain.mjs';
import { documentMailer } from '../document-mail.mjs';
import { reportMailer } from '../report-share.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const records = status => [
  { record: 'SPF', name: 'send.mail', type: 'MX', ttl: 'Auto', status, value: 'feedback-smtp.sa-east-1.amazonses.com', priority: 10 },
  { record: 'SPF', name: 'send.mail', type: 'TXT', ttl: 'Auto', status, value: '"v=spf1 include:amazonses.com ~all"' },
  { record: 'DKIM', name: 'resend._domainkey.mail', type: 'TXT', ttl: 'Auto', status, value: 'p=MIGfMA0GCSqGSIb3DQEB' }
];

/** A stand-in for the Resend Domains API: the domain turns verified after one POST /verify. */
function fakeResend(calls = []) {
  const domains = new Map();
  return async (input, options = {}) => {
    const url = new URL(String(input)), method = options.method || 'GET';
    calls.push({ method, path: url.pathname, body: options.body ? JSON.parse(options.body) : null, auth: options.headers?.Authorization });
    const [, , id, verb] = url.pathname.split('/');
    if (method === 'POST' && url.pathname === '/domains') {
      const { name, region } = JSON.parse(options.body);
      if ([...domains.values()].some(d => d.name === name)) return reply({ statusCode: 403, name: 'validation_error', message: `The domain ${name} is already registered.` }, 403);
      const domain = { id: `dom_${domains.size + 1}`, name, region, status: 'not_started', verified: false };
      domains.set(domain.id, domain);
      return reply({ ...domain, records: records('not_started') });
    }
    const domain = domains.get(id);
    if (!domain) return reply({ statusCode: 404, name: 'not_found', message: 'Domain not found' }, 404);
    if (method === 'POST' && verb === 'verify') { domain.verified = true; return reply({ object: 'domain', id }); }
    if (method === 'DELETE') { domains.delete(id); return reply({ object: 'domain', id, deleted: true }); }
    const status = domain.verified ? 'verified' : 'not_started';
    return reply({ ...domain, status, records: records(status) });
  };
}

test('Domains and sender names are cleaned before reaching Resend', () => {
  assert.equal(normalizeDomain(' https://Mail.Clinica.com.br/contato '), 'mail.clinica.com.br');
  assert.equal(normalizeDomain('ana@envio.padaria.com'), 'envio.padaria.com');
  for (const bad of ['', 'localhost', '192.168.0.1', 'clínica.com.br', '-x.com', 'a..b.com', 'x.c0m']) assert.throws(() => normalizeDomain(bad), /domínio válido/, bad);
  assert.equal(normalizeLocalPart(' Contato '), 'contato');
  assert.equal(normalizeLocalPart('financeiro.loja_1'), 'financeiro.loja_1');
  for (const bad of ['', '.ana', 'ana.', 'a..b', 'ana maria', 'ana@x']) assert.throws(() => normalizeLocalPart(bad), /antes do @/, bad);
  assert.equal(workspaceSender({ emailDomain: { status: 'pending', name: 'mail.x.com', localPart: 'oi' } }), '');
  assert.equal(workspaceSender({ emailDomain: { status: 'verified', name: 'mail.x.com', localPart: 'oi' } }), 'oi@mail.x.com');
});

test('Without a key, managing domains says the installation is not configured', async () => {
  const api = emailDomains({ key: '' });
  assert.equal(api.configured, false);
  await assert.rejects(api.add('mail.x.com'), /não está configurado/);
});

test('A sub-account adds its domain, sees SPF/DKIM records, verifies it and the e-mails go out from it', async t => {
  const calls = [], sent = [];
  const sendMail = async (input, options) => {
    const body = JSON.parse(options.body);
    sent.push(body);
    return reply({ id: `email_${sent.length}` });
  };
  const documentMail = documentMailer({ key: 're_test', from: 'Graao <no-reply@graao.com>', publicOrigin: 'https://app.graao.test', request: sendMail });
  const emailDomainApi = emailDomains({ key: 're_test', base: 'https://resend.test', request: fakeResend(calls) });
  process.env.PORTAL_EMAIL_FROM = 'Graao <no-reply@graao.com>';
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store: createSqliteStore(':memory:'), port: 0, documentMail, emailDomainApi });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => { delete process.env.PORTAL_EMAIL_FROM; return new Promise(resolve => server.close(resolve)); });
  const base = `http://${host}:${server.address().port}`;
  const get = async path => (await fetch(base + path)).json();
  const post = async (path, body) => (await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();

  const empty = await get('/api/email/workspace/status?workspace=demo');
  assert.deepEqual([empty.configured, empty.domain, empty.sender, empty.platformAddress], [true, null, '', 'no-reply@graao.com']);
  assert.match((await post('/api/email/workspace/add?workspace=demo', { domain: 'não é domínio' })).error, /domínio válido/);
  assert.match((await post('/api/email/workspace/add?workspace=demo', { domain: 'mail.padaria.com.br', localPart: 'a b' })).error, /antes do @/);

  const added = await post('/api/email/workspace/add?workspace=demo', { domain: 'https://Mail.Padaria.com.br', localPart: 'Financeiro' });
  assert.deepEqual([added.domain.name, added.domain.status, added.domain.address, added.sender], ['mail.padaria.com.br', 'not_started', 'financeiro@mail.padaria.com.br', '']);
  assert.deepEqual(added.domain.records.map(r => `${r.record} ${r.type} ${r.name}`), ['SPF MX send.mail', 'SPF TXT send.mail', 'DKIM TXT resend._domainkey.mail']);
  assert.equal(added.domain.dmarc.name, '_dmarc.mail.padaria.com.br');
  assert.equal(JSON.stringify(added).includes('dom_1'), false, 'the Resend id stays on the server');
  assert.deepEqual(calls[0], { method: 'POST', path: '/domains', body: { name: 'mail.padaria.com.br', region: 'sa-east-1' }, auth: 'Bearer re_test' });
  assert.match((await post('/api/email/workspace/add?workspace=demo', { domain: 'outro.com.br' })).error, /já tem um domínio/);

  const pending = await get('/api/email/workspace/status?workspace=demo');
  assert.equal(pending.domain.statusLabel, 'Aguardando DNS');
  assert.ok(calls.some(call => call.method === 'GET' && call.path === '/domains/dom_1'), 'a pending domain is re-checked on status');

  const verified = await post('/api/email/workspace/verify?workspace=demo', {});
  assert.deepEqual([verified.domain.status, verified.sender], ['verified', 'financeiro@mail.padaria.com.br']);
  assert.ok(verified.domain.records.every(r => r.status === 'verified'));
  assert.ok(verified.domain.verifiedAt);
  const checks = calls.length;
  await get('/api/email/workspace/status?workspace=demo');
  assert.equal(calls.length, checks, 'a verified domain is not re-checked on every visit');

  const renamed = await post('/api/email/workspace/save?workspace=demo', { localPart: 'contato' });
  assert.equal(renamed.sender, 'contato@mail.padaria.com.br');

  // An invoice e-mail now leaves from the sub-account's domain, under the workspace name.
  const action = command => post('/api/action?workspace=demo', command);
  const contactId = (await action({ type: 'save', key: 'contacts', data: { name: 'Ana Souza', email: 'ana@exemplo.com.br' } })).id;
  const templateId = (await action({ type: 'save', key: 'invoiceTemplates', data: { name: 'Mensal', title: 'Gestão', dueDays: 5, items: [{ name: 'Gestão', qty: 1, price: 900 }] } })).id;
  const invoiceId = (await action({ type: 'invoice-from-template', id: templateId, data: { contactId } })).id.id;
  await action({ type: 'invoice-send', id: invoiceId, data: { origin: base } });
  for (let k = 0; k < 50 && !sent.length; k++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(sent.length, 1);
  assert.match(sent[0].from, /<contato@mail\.padaria\.com\.br>$/);
  assert.deepEqual(sent[0].to, ['ana@exemplo.com.br']);

  const removed = await post('/api/email/workspace/remove?workspace=demo', {});
  assert.deepEqual([removed.domain, removed.sender], [null, '']);
  assert.ok(calls.some(call => call.method === 'DELETE' && call.path === '/domains/dom_1'));
  assert.match((await post('/api/email/workspace/verify?workspace=demo', {})).error, /Adicione um domínio/);
});

test('When Resend refuses the domain, the e-mail falls back to the platform address', async () => {
  const sent = [];
  const request = async (input, options) => {
    const body = JSON.parse(options.body);
    sent.push({ from: body.from, idem: options.headers['Idempotency-Key'] });
    return reply({}, body.from.includes('mail.loja.com') ? 403 : 200);
  };
  const mailer = documentMailer({ key: 're_test', from: 'Graao <no-reply@graao.com>', publicOrigin: 'https://app.graao.test', request });
  const outcome = await mailer.email('ana@x.com', { subject: 'Oi', text: 'Olá' }, 'doc-1', { fromName: 'Loja', fromAddress: 'oi@mail.loja.com' });
  assert.match(outcome, /endereço da plataforma.*mail\.loja\.com/);
  assert.deepEqual(sent, [{ from: 'Loja <oi@mail.loja.com>', idem: 'doc-1' }, { from: 'Loja <no-reply@graao.com>', idem: 'doc-1-platform' }]);
  assert.equal(await mailer.email('ana@x.com', { subject: 'Oi', text: 'Olá' }, 'doc-2', {}), 'e-mail enviado');

  const reports = [];
  const reportMail = reportMailer({ key: 're_test', from: 'Graao <no-reply@graao.com>', publicOrigin: 'https://app.graao.test', request: async (input, options) => { reports.push(JSON.parse(options.body).from); return reply({}); } });
  const report = { id: 'r1', name: 'Mensal', share: { id: 'sh1' }, schedule: { recipients: ['dono@x.com'], message: '' } };
  await reportMail.send('demo', { profile: { name: 'Padaria <Bom Pão>' } }, report, '2026-11', { fromAddress: 'oi@mail.loja.com' });
  assert.deepEqual(reports, ['Padaria Bom Pão <oi@mail.loja.com>']);
});
