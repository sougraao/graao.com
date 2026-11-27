import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { leadContact, pollConnector, readWebhook, runConnectorAction } from '../connectors.mjs';
import { pollJobs } from '../connector-model.mjs';
import { connectorStep, connectors } from '../ui/connectors-data.js';
import { allActions, allTriggers, triggerSpec } from '../ui/workflow-data.js';

// T.2 — Catálogo de conectores: apps with their own triggers and actions in the workflow editor.
const hmac = (algo, key, data, enc) => createHmac(algo, key).update(data).digest(enc);
const fakeFetch = routes => {
  const calls = [];
  const request = async (url, options = {}) => {
    calls.push({ url, method: options.method || 'GET', headers: options.headers || {}, body: options.body ? (String(options.headers?.['Content-Type']).includes('json') ? JSON.parse(options.body) : String(options.body)) : undefined });
    const hit = routes.find(([pattern]) => pattern.test(`${options.method || 'GET'} ${url}`));
    const [status, body] = hit ? (typeof hit[1] === 'function' ? hit[1](calls.at(-1)) : hit[1]) : [404, { error: 'not mocked' }];
    return { ok: status < 400, status, text: async () => JSON.stringify(body) };
  };
  return { request, calls };
};

test('The catalog: 27 apps, every trigger and action is a workflow type of its own', () => {
  assert.equal(connectors.length, 27);
  const types = [...connectors.flatMap(c => c.triggers.map(t => `conn_${c.id}__${t.key}`)), ...connectors.flatMap(c => c.actions.map(a => `conn_${c.id}__${a.key}`))];
  assert.equal(new Set(types).size, types.length);
  for (const type of types) assert.ok(allTriggers.some(t => t.type === type) || allActions.some(a => a.type === type), type);
  assert.equal(triggerSpec('conn_slack__message').group, 'Apps · Slack');
  assert.deepEqual([connectorStep('conn_google_sheets__add_row').kind, connectorStep('conn_google_sheets__new_row').kind], ['action', 'trigger']);
  assert.equal(connectorStep('conn_nada__x'), null);
});

test('Actions: Slack, Google Sheets (service account, header-based rows), Airtable, Linear and OpenRouter calls', async () => {
  const slack = fakeFetch([[/chat\.postMessage/, [200, { ok: true, ts: '171.2', channel: 'C1' }]], [/users\.lookupByEmail/, [200, { ok: false, error: 'users_not_found' }]]]);
  assert.deepEqual(await runConnectorAction('slack', 'send_message', { botToken: 'xoxb-1' }, { channel: '#vendas', text: 'Novo lead' }, { request: slack.request }), { slack_ts: '171.2', slack_channel: 'C1' });
  assert.deepEqual([slack.calls[0].headers.Authorization, slack.calls[0].body], ['Bearer xoxb-1', { channel: 'vendas', text: 'Novo lead' }]);
  await assert.rejects(runConnectorAction('slack', 'find_user', { botToken: 'xoxb-1' }, { email: 'x@y.test' }, { request: slack.request }), /users_not_found/);

  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const serviceAccount = JSON.stringify({ client_email: 'robo@proj.iam.gserviceaccount.com', private_key: privateKey });
  const sheetRows = [['Nome', 'E-mail', 'Status'], ['Ana', 'ana@x.test', 'novo'], ['Bia', 'bia@x.test', 'novo']];
  const sheets = fakeFetch([
    [/POST https:\/\/oauth2\.googleapis\.com\/token/, call => { assert.match(call.body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=/); return [200, { access_token: 'ya29', expires_in: 3600 }]; }],
    [/GET .*\/values\/P%C3%A1gina1$/, [200, { values: sheetRows }]],
    [/POST .*:append/, call => [200, { updates: { updatedRange: 'Página1!A4:C4' }, echo: call.body }]],
    [/PUT .*\/values\//, [200, {}]]
  ]);
  const auth = { serviceAccount };
  assert.deepEqual(await runConnectorAction('google_sheets', 'add_row', auth, { spreadsheetId: 'S1', sheet: 'Página1', values: 'e-mail = caio@x.test\nNome = Caio' }, { request: sheets.request }), { google_sheets_row: '4' });
  assert.deepEqual(sheets.calls.find(call => /:append/.test(call.url)).body, { values: [['Caio', 'caio@x.test', '']] }, 'columns by header, any case');
  assert.equal(sheets.calls.filter(call => /oauth2/.test(call.url)).length, 1);
  const found = await runConnectorAction('google_sheets', 'lookup_row', auth, { spreadsheetId: 'S1', sheet: 'Página1', column: 'E-mail', value: 'BIA@x.test' }, { request: sheets.request });
  assert.deepEqual([found.google_sheets_row, JSON.parse(found.google_sheets_json).Nome], ['3', 'Bia']);
  await runConnectorAction('google_sheets', 'update_by_lookup', auth, { spreadsheetId: 'S1', sheet: 'Página1', column: 'Nome', value: 'Ana', values: 'Status = cliente' }, { request: sheets.request });
  const put = sheets.calls.find(call => call.method === 'PUT');
  assert.match(decodeURIComponent(put.url), /Página1!A2:C2\?valueInputOption=USER_ENTERED$/);
  assert.deepEqual(put.body, { values: [['Ana', 'ana@x.test', 'cliente']] }, 'the other cells are kept');
  await assert.rejects(runConnectorAction('google_sheets', 'add_row', auth, { spreadsheetId: 'S1', values: 'Telefone = 1' }, { request: sheets.request }), /Coluna "Telefone" não existe/);

  const poll = await pollConnector('google_sheets', 'new_row', { spreadsheetId: 'S1', sheet: 'Página1' }, auth, undefined, { request: sheets.request });
  assert.deepEqual([poll.cursor, poll.events.length], [3, 0], 'the first check only remembers where it is');
  sheetRows.push(['Davi', 'davi@x.test', 'novo']);
  const next = await pollConnector('google_sheets', 'new_row', { spreadsheetId: 'S1', sheet: 'Página1' }, auth, poll.cursor, { request: sheets.request });
  assert.deepEqual([next.cursor, next.events.map(e => [e.ctx.row, e.ctx.Nome])], [4, [[4, 'Davi']]]);

  const airtable = fakeFetch([[/POST https:\/\/api\.airtable\.com\/v0\/appX\/Leads/, call => [200, { id: 'rec1', fields: call.body.fields }]]]);
  assert.deepEqual(await runConnectorAction('airtable', 'create_record', { token: 'pat1' }, { baseId: 'appX', table: 'Leads', fields: 'Nome = Ana\nOrigem = Graao' }, { request: airtable.request }), { airtable_record: 'rec1' });
  assert.deepEqual(airtable.calls[0].body, { fields: { Nome: 'Ana', Origem: 'Graao' }, typecast: true });
  const linear = fakeFetch([[/api\.linear\.app\/graphql/, [200, { data: { issueCreate: { success: true, issue: { id: 'L1', url: 'https://linear.app/x/L1' } } } }]]]);
  assert.deepEqual(await runConnectorAction('linear', 'create_issue', { apiKey: 'lin_api_1' }, { team: 'T1', title: 'Bug' }, { request: linear.request }), { linear_id: 'L1', linear_url: 'https://linear.app/x/L1' });
  assert.equal(linear.calls[0].headers.Authorization, 'lin_api_1');
  const router = fakeFetch([[/openrouter\.ai/, [200, { choices: [{ message: { content: 'Olá!' } }] }]]]);
  assert.deepEqual(await runConnectorAction('openrouter', 'chat', { apiKey: 'sk-or' }, { model: 'openai/gpt-4o-mini', prompt: 'Diga olá' }, { request: router.request }), { openrouter_answer: 'Olá!' });
});

test('Webhooks: signatures of Slack, Shopify, Calendly and Typeform; lead forms find the contact anywhere in the payload', () => {
  const now = 1_790_000_000_000, ts = String(now / 1000);
  const slackBody = JSON.stringify({ type: 'event_callback', event: { type: 'message', channel: 'C1', user: 'U1', text: 'quero um orçamento', channel_type: 'channel' } });
  const slackHeaders = { 'content-type': 'application/json', 'x-slack-request-timestamp': ts, 'x-slack-signature': `v0=${hmac('sha256', 'sig', `v0:${ts}:${slackBody}`, 'hex')}` };
  assert.deepEqual(readWebhook('slack', { raw: slackBody, headers: slackHeaders, auth: { signingSecret: 'sig' }, now }).events, [{ key: 'message', ctx: { channel: 'C1', user: 'U1', text: 'quero um orçamento' } }]);
  assert.throws(() => readWebhook('slack', { raw: slackBody, headers: slackHeaders, auth: { signingSecret: 'outro' }, now }), /Slack inválida/);
  const challenge = JSON.stringify({ type: 'url_verification', challenge: 'abc' });
  assert.deepEqual(readWebhook('slack', { raw: challenge, headers: { ...slackHeaders, 'x-slack-signature': `v0=${hmac('sha256', 'sig', `v0:${ts}:${challenge}`, 'hex')}` }, auth: { signingSecret: 'sig' }, now }).reply, { challenge: 'abc' });

  const order = JSON.stringify({ id: 1, name: '#1001', total_price: '250.00', currency: 'BRL', email: 'Eva@X.test', customer: { first_name: 'Eva', last_name: 'Rocha' }, line_items: [{ name: 'Camiseta' }] });
  const shop = readWebhook('shopify', { raw: order, headers: { 'x-shopify-hmac-sha256': hmac('sha256', 'segredo', order, 'base64'), 'x-shopify-topic': 'orders/create' }, auth: { apiSecret: 'segredo' } });
  assert.deepEqual([shop.events[0].ctx.total, shop.events[0].contact], ['250.00', { email: 'eva@x.test', phone: '', name: 'Eva Rocha' }]);
  assert.throws(() => readWebhook('shopify', { raw: order, headers: { 'x-shopify-hmac-sha256': 'x' }, auth: { apiSecret: 'segredo' } }), /Shopify inválida/);

  const invite = JSON.stringify({ event: 'invitee.created', payload: { email: 'fe@x.test', name: 'Fê', scheduled_event: { name: 'Consultoria', start_time: '2026-12-01T12:00:00Z' } } });
  const t = String(Math.floor(now / 1000));
  assert.equal(readWebhook('calendly', { raw: invite, headers: { 'calendly-webhook-signature': `t=${t},v1=${hmac('sha256', 'k', `${t}.${invite}`, 'hex')}` }, auth: { signingKey: 'k' }, now }).events[0].key, 'invitee_created');
  const form = JSON.stringify({ form_response: { form_id: 'F1', definition: { title: 'Orçamento' }, answers: [{ type: 'email', email: 'gui@x.test', field: { ref: 'email' } }, { type: 'text', text: 'Site novo', field: { ref: 'pedido' } }] } });
  const typed = readWebhook('typeform', { raw: form, headers: { 'typeform-signature': `sha256=${hmac('sha256', 's', form, 'base64')}` }, auth: { secret: 's' } }).events[0];
  assert.deepEqual([typed.ctx.form, typed.ctx.pedido, typed.contact.email], ['Orçamento', 'Site novo', 'gui@x.test']);

  assert.deepEqual(leadContact({ lead: { field_data: [{ name: 'full_name', values: ['Hugo Lima'] }, { name: 'email', values: ['hugo@x.test'] }, { name: 'phone_number', values: ['+55 11 98888-7777'] }] } }),
    { email: 'hugo@x.test', phone: '+55 11 98888-7777', name: 'Hugo Lima' });
  const boundary = 'XyZ';
  const multipart = [`--${boundary}`, 'Content-Disposition: form-data; name="formTitle"', '', 'Contato', `--${boundary}`, 'Content-Disposition: form-data; name="rawRequest"', '', JSON.stringify({ q3_email: 'ines@x.test', q4_name: { first: 'Inês', last: 'Melo' } }), `--${boundary}--`].join('\r\n');
  const jot = readWebhook('jotform', { raw: multipart, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }).events[0];
  assert.deepEqual([jot.ctx.form, jot.contact.email], ['Contato', 'ines@x.test']);
});

test('Events in the sub-account: lead events find or create the contact; filters of the triggers; 5-minute jobs', () => {
  const s = blank();
  s.connectors = { shopify: { sealed: 'x', hook: 'h' }, google_sheets: { sealed: 'x' } };
  const save = data => execute(s, { type: 'save', key: 'workflows', data: { active: true, steps: [{ type: 'add_tag', config: { tag: data.name } }], ...data } });
  const big = save({ name: 'pedido-grande', triggers: [{ type: 'conn_shopify__order_placed', config: { minTotal: '200' } }] });
  const any = save({ name: 'pedido', triggers: [{ type: 'conn_shopify__order_placed', config: {} }] });
  save({ name: 'linha', triggers: [{ type: 'conn_google_sheets__new_row', config: { spreadsheetId: 'S1', sheet: 'Leads' } }] });
  save({ name: 'linha-2', triggers: [{ type: 'conn_google_sheets__new_row', config: { spreadsheetId: 'S1', sheet: 'Leads' } }] });
  execute(s, { type: 'connector-event', data: { connector: 'shopify', key: 'order_placed', ctx: { total: '250.00', order: '#1001' }, contact: { email: 'Eva@x.test', name: 'Eva' } } });
  execute(s, { type: 'connector-event', data: { connector: 'shopify', key: 'order_placed', ctx: { total: '99.90' }, contact: { email: 'eva@x.test' } } });
  const eva = s.contacts.filter(row => row.email === 'eva@x.test');
  assert.equal(eva.length, 1, 'one contact, found by e-mail the second time');
  assert.deepEqual(eva[0].tags.slice(0, 1), ['Shopify']);
  assert.deepEqual([s.runs.filter(run => run.workflowId === big).length, s.runs.filter(run => run.workflowId === any).length], [1, 2]);
  assert.deepEqual(pollJobs(s).map(job => [job.id, job.key, job.config.sheet]), [['google_sheets', 'new_row', 'Leads']], 'the same check once');
  assert.throws(() => execute(s, { type: 'connector-event', data: { connector: 'slack', key: 'nada' } }), /não encontrado/);
});

test('Server: connect Slack (checked, sealed), its signed event fires a workflow whose Slack step posts the message', async t => {
  const slackApi = fakeFetch([[/auth\.test/, [200, { ok: true, team: 'Equipe Sol' }]], [/chat\.postMessage/, [200, { ok: true, ts: '1.1', channel: 'C9' }]]]);
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false, connectorRequest: slackApi.request });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => { const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };

  assert.equal((await call('/api/connectors/connect?workspace=demo', { id: 'slack', fields: {} })).status, 400, 'the token is required');
  const connected = (await call('/api/connectors/connect?workspace=demo', { id: 'slack', fields: { botToken: 'xoxb-segredo', signingSecret: 'assinatura' } })).body.connectors.slack;
  assert.deepEqual([connected.connected, connected.account], [true, 'Equipe Sol']);
  const hook = new URL(connected.hookUrl).pathname;
  const state = (await call('/api/state?workspace=demo')).body.state;
  assert.doesNotMatch(JSON.stringify(state), /xoxb-segredo|assinatura/, 'the credentials never reach the browser');

  await call('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Aviso no Slack', active: true, triggers: [{ type: 'conn_slack__mention', config: {} }],
    steps: [{ type: 'conn_slack__send_message', config: { channel: 'C9', text: 'Fui mencionado: {{trigger.text}}' } }] } });
  const event = JSON.stringify({ type: 'event_callback', event: { type: 'app_mention', channel: 'C1', user: 'U1', text: '<@B1> ajuda aqui' } });
  const ts = String(Math.floor(Date.now() / 1000));
  const post = (path, body, signature) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Slack-Request-Timestamp': ts, 'X-Slack-Signature': signature }, body });
  assert.equal((await post(hook, event, 'v0=errada')).status, 401);
  assert.equal((await post(hook.replace(/[^/]+$/, 'x'.repeat(32)), event, 'v0=x')).status, 404, 'a wrong token is not found');
  assert.equal((await post(hook, event, `v0=${hmac('sha256', 'assinatura', `v0:${ts}:${event}`, 'hex')}`)).status, 200);
  let sent;
  for (let i = 0; i < 100 && !sent; i++) { sent = slackApi.calls.find(row => /chat\.postMessage/.test(row.url)); if (!sent) await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.deepEqual(sent?.body, { channel: 'C9', text: 'Fui mencionado: <@B1> ajuda aqui' });
  let runs;
  for (let i = 0; i < 100; i++) { runs = (await call('/api/state?workspace=demo')).body.state.runs; if (runs.some(run => run.status === 'Completed')) break; await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.equal(runs.find(run => run.name === 'Aviso no Slack')?.vars?.slack_ts, '1.1');
  assert.equal((await call('/api/connectors/disconnect?workspace=demo', { id: 'slack' })).body.connectors.slack.connected, false);
});
