import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { pollConnector, readWebhook, runConnectorAction, testConnection } from '../connectors.mjs';

// API falsa: cada rota devolve um JSON (ou { status, json }); todas as chamadas ficam registradas.
function fakeApi(routes) {
  const calls = [];
  const request = async (url, init = {}) => {
    const body = init.body && /json/.test(init.headers?.['Content-Type'] || '') ? JSON.parse(init.body) : init.body;
    calls.push({ url: String(url), method: init.method, headers: init.headers, body });
    const hit = routes.find(([pattern]) => (pattern instanceof RegExp ? pattern.test(url) : String(url).startsWith(pattern)));
    if (!hit) return new Response(JSON.stringify({ error: `sem rota: ${url}` }), { status: 404 });
    const reply = typeof hit[1] === 'function' ? hit[1](String(url), init, body) : hit[1];
    const { status = 200, json = reply } = reply && reply.status && reply.json !== undefined ? reply : { json: reply };
    return new Response(JSON.stringify(json), { status });
  };
  return { calls, request };
}
const run = (id, key, auth, input, api) => runConnectorAction(id, key, auth, input, { request: api.request });

test('Slack: busca de canal e de usuário, canal inexistente e erro da API', async () => {
  const api = fakeApi([
    ['https://slack.com/api/conversations.list', { ok: true, channels: [{ id: 'C1', name: 'vendas' }] }],
    ['https://slack.com/api/users.lookupByEmail', { ok: true, user: { id: 'U1', name: 'ana', real_name: 'Ana Souza' } }],
    ['https://slack.com/api/chat.update', { ok: false, error: 'message_not_found' }]
  ]);
  assert.deepEqual(await run('slack', 'find_channel', { botToken: 'xoxb' }, { name: '#Vendas' }, api), { slack_channel: 'C1' });
  assert.deepEqual(await run('slack', 'find_user', { botToken: 'xoxb' }, { email: 'ana@x.com' }, api), { slack_user: 'U1', slack_name: 'Ana Souza' });
  assert.equal(api.calls[0].headers.Authorization, 'Bearer xoxb');
  await assert.rejects(run('slack', 'find_channel', { botToken: 'xoxb' }, { name: 'nada' }, api), { status: 404, message: 'Slack: canal não encontrado' });
  await assert.rejects(run('slack', 'update_message', { botToken: 'xoxb' }, { channel: 'C1', ts: '1', text: 'x' }, api), { status: 502, message: 'Slack: message_not_found' });
});

test('Shopify: valida a loja, acha o cliente e avisa quando não existe', async () => {
  const api = fakeApi([[/customers\/search\.json\?query=email%3Aana/, { customers: [{ id: 9, orders_count: 3, total_spent: '120.00' }] }], [/customers\/search/, { customers: [] }]]);
  await assert.rejects(run('shopify', 'find_customer', { shop: 'loja.com', accessToken: 't' }, { email: 'ana@x.com' }, api), /Loja Shopify inválida/);
  assert.deepEqual(await run('shopify', 'find_customer', { shop: 'https://minha-loja.myshopify.com/admin', accessToken: 't' }, { email: 'ana@x.com' }, api),
    { shopify_customer: '9', shopify_orders: '3', shopify_spent: '120.00' });
  assert.equal(api.calls[0].headers['X-Shopify-Access-Token'], 't');
  await assert.rejects(run('shopify', 'find_customer', { shop: 'minha-loja.myshopify.com', accessToken: 't' }, { email: 'bia@x.com' }, api), { status: 404 });
});

test('Airtable: cria, atualiza e busca registro (com e sem resultado)', async () => {
  const api = fakeApi([
    [/\/v0\/app1\/Leads\?/, (url) => (url.includes('vazio') ? { records: [] } : { records: [{ id: 'rec2', fields: { Nome: 'Ana' } }] })],
    [/\/v0\/app1\/Leads\/rec1$/, { id: 'rec1' }],
    ['https://api.airtable.com/v0/app1/Leads', { id: 'rec1' }]
  ]);
  const auth = { token: 'pat' };
  assert.deepEqual(await run('airtable', 'create_record', auth, { baseId: 'app1', table: 'Leads', fields: 'Nome = Ana\nIdade = 30' }, api), { airtable_record: 'rec1' });
  assert.deepEqual(api.calls[0].body, { fields: { Nome: 'Ana', Idade: '30' }, typecast: true });
  assert.deepEqual(await run('airtable', 'update_record', auth, { baseId: 'app1', table: 'Leads', record: 'rec1', fields: 'Nome = Bia' }, api), { airtable_record: 'rec1' });
  assert.equal(api.calls[1].method, 'PATCH');
  assert.deepEqual(await run('airtable', 'find_record', auth, { baseId: 'app1', table: 'Leads', formula: '{Nome}="Ana"' }, api), { airtable_record: 'rec2', airtable_json: '{"Nome":"Ana"}' });
  await assert.rejects(run('airtable', 'find_record', auth, { baseId: 'app1', table: 'Leads', formula: 'vazio' }, api), { status: 404 });
});

test('HubSpot, Notion, Asana, ClickUp, Todoist, Basecamp e Housecall Pro mandam o corpo certo e devolvem os ids', async () => {
  const api = fakeApi([
    ['https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert', { results: [{ id: 'h1' }] }],
    ['https://api.hubapi.com/crm/v3/objects/deals', { id: 'd1' }],
    ['https://api.notion.com/v1/pages', { id: 'n1', url: 'https://notion.so/n1' }],
    ['https://app.asana.com/api/1.0/tasks', { data: { gid: 'a1', permalink_url: 'https://app.asana.com/a1' } }],
    ['https://api.clickup.com/api/v2/list/L1/task', { id: 'c1', url: 'https://app.clickup.com/c1' }],
    ['https://api.todoist.com/rest/v2/tasks', { id: 't1', url: 'https://todoist.com/t1' }],
    ['https://3.basecampapi.com/', { id: 'b1', app_url: 'https://3.basecamp.com/b1' }],
    ['https://api.housecallpro.com/customers', { id: 'hc1' }]
  ]);
  assert.deepEqual(await run('hubspot', 'upsert_contact', { token: 'k' }, { email: 'ana@x.com', firstname: 'Ana', phone: '' }, api), { hubspot_id: 'h1' });
  assert.deepEqual(api.calls[0].body.inputs[0], { idProperty: 'email', id: 'ana@x.com', properties: { email: 'ana@x.com', firstname: 'Ana' } });
  assert.deepEqual(await run('hubspot', 'create_deal', { token: 'k' }, { name: 'Contrato', amount: '500' }, api), { hubspot_id: 'd1' });
  assert.deepEqual(api.calls[1].body.properties, { dealname: 'Contrato', amount: '500', dealstage: 'appointmentscheduled', pipeline: 'default' });
  assert.deepEqual(await run('notion', 'create_page', { token: 'k' }, { database: 'db', title: 'Reunião', content: 'Pauta' }, api), { notion_id: 'n1', notion_url: 'https://notion.so/n1' });
  assert.equal(api.calls[2].headers['Notion-Version'], '2022-06-28');
  assert.equal(api.calls[2].body.properties.Name.title[0].text.content, 'Reunião');
  assert.deepEqual(await run('asana', 'create_task', { token: 'k' }, { name: 'Ligar', project: 'P1', due: '2026-12-01' }, api), { asana_id: 'a1', asana_url: 'https://app.asana.com/a1' });
  assert.equal(api.calls[3].body.data.due_on, '2026-12-01');
  assert.deepEqual(await run('clickup', 'create_task', { token: 'pk' }, { list: 'L1', name: 'Tarefa' }, api), { clickup_id: 'c1', clickup_url: 'https://app.clickup.com/c1' });
  assert.equal(api.calls[4].headers.Authorization, 'pk', 'ClickUp usa o token sem Bearer');
  assert.deepEqual(await run('todoist', 'create_task', { token: 'k' }, { content: 'Comprar', due: 'amanhã', project: 'p9' }, api), { todoist_id: 't1', todoist_url: 'https://todoist.com/t1' });
  assert.deepEqual([api.calls[5].body.due_lang, api.calls[5].body.project_id], ['pt', 'p9']);
  assert.deepEqual(await run('basecamp', 'create_todo', { token: 'k', account: '99' }, { project: '1', list: '2', content: 'Fazer' }, api), { basecamp_id: 'b1', basecamp_url: 'https://3.basecamp.com/b1' });
  assert.match(api.calls[6].url, /\/99\/buckets\/1\/todolists\/2\/todos\.json$/);
  assert.deepEqual(await run('housecall_pro', 'create_customer', { apiKey: 'k' }, { first_name: 'Ana', email: 'ana@x.com', phone: '11' }, api), { housecall_pro_id: 'hc1' });
  assert.equal(api.calls[7].headers.Authorization, 'Token k');
});

test('Linear, Jira e Monday: sucesso, erro do GraphQL e site inválido', async () => {
  const api = fakeApi([
    ['https://api.linear.app/graphql', (url, init, body) => (body.variables.input.title === 'falha'
      ? { errors: [{ message: 'team not found' }] } : { data: { issueCreate: { success: true, issue: { id: 'L-1', url: 'https://linear.app/L-1' } } } })],
    ['https://empresa.atlassian.net/rest/api/3/issue', { key: 'PRJ-7' }],
    ['https://api.monday.com/v2', { errors: [{ message: 'board inválido' }] }]
  ]);
  assert.deepEqual(await run('linear', 'create_issue', { apiKey: 'lin' }, { team: 'T', title: 'Bug' }, api), { linear_id: 'L-1', linear_url: 'https://linear.app/L-1' });
  await assert.rejects(run('linear', 'create_issue', { apiKey: 'lin' }, { team: 'T', title: 'falha' }, api), { status: 502, message: 'Linear: team not found' });
  await assert.rejects(run('jira', 'create_issue', { site: 'evil.example.com', email: 'a', token: 'b' }, { project: 'PRJ', summary: 'x' }, api), /Site do Jira inválido/);
  assert.deepEqual(await run('jira', 'create_issue', { site: 'https://empresa.atlassian.net/', email: 'ana@x.com', token: 'tk' }, { project: 'PRJ', summary: 'Erro', description: 'Detalhe' }, api),
    { jira_key: 'PRJ-7', jira_url: 'https://empresa.atlassian.net/browse/PRJ-7' });
  const jira = api.calls.find(call => call.url.includes('atlassian'));
  assert.equal(jira.headers.Authorization, `Basic ${Buffer.from('ana@x.com:tk').toString('base64')}`);
  assert.equal(jira.body.fields.description.content[0].content[0].text, 'Detalhe');
  await assert.rejects(run('monday', 'create_item', { token: 'm' }, { board: '1', name: 'x' }, api), { status: 502, message: 'Monday: board inválido' });
});

test('Klaviyo, Apify, Browse AI e modelos (Mistral, OpenRouter)', async () => {
  const api = fakeApi([
    ['https://a.klaviyo.com/api/profile-import', { data: { id: 'p1' } }],
    ['https://a.klaviyo.com/api/lists/', {}],
    ['https://a.klaviyo.com/api/events', {}],
    ['https://api.apify.com/v2/acts/', { data: { id: 'run1', defaultDatasetId: 'ds1', status: 'RUNNING' } }],
    ['https://api.browse.ai/v2/robots/', { result: { id: 'task1', status: 'in-progress' } }],
    ['https://api.mistral.ai/v1/chat/completions', { choices: [{ message: { content: 'Olá!' } }] }],
    ['https://openrouter.ai/api/v1/chat/completions', { choices: [] }]
  ]);
  assert.deepEqual(await run('klaviyo', 'add_to_list', { apiKey: 'kl' }, { email: 'ana@x.com', list: 'LST' }, api), {});
  assert.deepEqual(api.calls[1].body, { data: [{ type: 'profile', id: 'p1' }] });
  assert.equal(api.calls[0].headers.Authorization, 'Klaviyo-API-Key kl');
  assert.deepEqual(await run('klaviyo', 'track_event', { apiKey: 'kl' }, { email: 'ana@x.com', metric: 'Compra', properties: 'valor = 10' }, api), {});
  assert.deepEqual(api.calls[2].body.data.attributes.properties, { valor: '10' });
  assert.deepEqual(await run('apify', 'run_actor', { token: 'ap' }, { actor: 'user~scraper', input: '{"url":"https://x"}' }, api), { apify_run: 'run1', apify_dataset: 'ds1', apify_status: 'RUNNING' });
  await assert.rejects(run('apify', 'run_actor', { token: 'ap' }, { actor: 'a', input: '{quebrado' }, api), /Entrada: JSON inválido/);
  assert.deepEqual(await run('browse_ai', 'run_robot', { apiKey: 'br' }, { robot: 'r1', input: '{}' }, api), { browse_ai_task: 'task1', browse_ai_status: 'in-progress' });
  assert.deepEqual(await run('mistral', 'chat', { apiKey: 'mi' }, { model: 'mistral-small', prompt: 'Oi' }, api), { mistral_answer: 'Olá!' });
  assert.deepEqual(await run('openrouter', 'chat', { apiKey: 'or' }, { model: 'x', prompt: 'Oi' }, api), { openrouter_answer: '' });
  assert.equal(api.calls.at(-1).headers['X-Title'], 'Graao');
});

test('erros genéricos: ação desconhecida, HTTP com mensagem e app que não responde', async () => {
  const api = fakeApi([['https://api.todoist.com/rest/v2/tasks', { status: 403, json: { error: 'Forbidden token' } }]]);
  await assert.rejects(run('desconhecido', 'x', {}, {}, api), { status: 404, message: 'Ação de conector desconhecida.' });
  await assert.rejects(run('slack', 'acao_que_nao_existe', { botToken: 'x' }, {}, api), { status: 404 }, 'app com várias ações recusa ação desconhecida');
  assert.equal(api.calls.length, 0);
  await assert.rejects(run('todoist', 'create_task', { token: 'k' }, { content: 'x' }, api), { status: 502, message: 'HTTP 403: Forbidden token' });
  await assert.rejects(runConnectorAction('todoist', 'create_task', { token: 'k' }, { content: 'x' }, { request: async () => { throw new Error('rede'); } }), { status: 502, message: 'o app não respondeu' });
});

test('webhooks: Slack (verificação, reação, entrada, bot ignorado), Cal.com assinado, formulários e Fathom', () => {
  const now = 1_800_000_000_000, ts = String(now / 1000), secret = 'slack-secret';
  const slack = body => {
    const raw = JSON.stringify(body);
    return readWebhook('slack', { raw, now, auth: { signingSecret: secret }, headers: { 'content-type': 'application/json', 'x-slack-request-timestamp': ts,
      'x-slack-signature': `v0=${createHmac('sha256', secret).update(`v0:${ts}:${raw}`).digest('hex')}` } });
  };
  assert.deepEqual(slack({ type: 'url_verification', challenge: 'abc' }), { reply: { challenge: 'abc' }, events: [] });
  assert.deepEqual(slack({ event: { type: 'reaction_added', user: 'U1', reaction: 'tada', item: { channel: 'C1' } } }).events, [{ key: 'reaction', ctx: { channel: 'C1', user: 'U1', text: '', reaction: 'tada' } }]);
  assert.equal(slack({ event: { type: 'member_joined_channel', channel: 'C2', user: 'U2' } }).events[0].key, 'member_joined');
  assert.deepEqual(slack({ event: { type: 'message', bot_id: 'B1', text: 'eco' } }).events, []);
  assert.deepEqual(slack({ event: { type: 'team_join' } }).events, []);
  assert.throws(() => readWebhook('slack', { raw: '{}', now, auth: { signingSecret: secret }, headers: { 'x-slack-request-timestamp': String(now / 1000 - 1000), 'x-slack-signature': 'v0=x' } }), { status: 401 });

  const calRaw = JSON.stringify({ triggerEvent: 'BOOKING_CANCELLED', payload: { title: 'Consulta', startTime: '2026-12-01T10:00:00Z', attendees: [{ email: 'Ana@X.com', name: 'Ana', phoneNumber: '+5511' }] } });
  const cal = readWebhook('calcom', { raw: calRaw, auth: { secret: 'cs' }, headers: { 'content-type': 'application/json', 'x-cal-signature-256': createHmac('sha256', 'cs').update(calRaw).digest('hex') } });
  assert.deepEqual(cal.events[0], { key: 'booking_cancelled', ctx: { event: 'Consulta', start: '2026-12-01T10:00:00Z' }, contact: { email: 'ana@x.com', phone: '+5511', name: 'Ana' } });
  assert.throws(() => readWebhook('calcom', { raw: calRaw, auth: { secret: 'cs' }, headers: { 'x-cal-signature-256': 'errada' } }), { status: 401 });

  const boundary = 'XYZ';
  const multipart = [`--${boundary}`, 'Content-Disposition: form-data; name="formTitle"', '', 'Orçamento', `--${boundary}`, 'Content-Disposition: form-data; name="rawRequest"', '',
    JSON.stringify({ q3_email: 'bia@x.com', q4_telefone: '(11) 98888-7777', q2_nome: { first: 'Bia' } }), `--${boundary}--`].join('\r\n');
  const jot = readWebhook('jotform', { raw: multipart, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
  assert.equal(jot.events[0].ctx.form, 'Orçamento');
  assert.equal(jot.events[0].contact.email, 'bia@x.com');
  assert.equal(jot.events[0].contact.phone, '(11) 98888-7777');

  const forms = readWebhook('google_forms', { raw: JSON.stringify({ form: 'Pesquisa', responses: { Email: 'caio@x.com', Cores: ['azul', 'verde'] } }), headers: { 'content-type': 'application/json' } });
  assert.deepEqual(forms.events[0].ctx, { form: 'Pesquisa', Email: 'caio@x.com', Cores: 'azul, verde' });
  const fathom = readWebhook('fathom', { raw: JSON.stringify({ meeting_title: 'Kickoff', default_summary: { markdown_formatted: 'Resumo' }, share_url: 'https://fathom.video/x',
    calendar_invitees: [{ email: 'eu@graao.com', is_external: false }, { email: 'Cliente@X.com', name: 'Cliente' }] }), headers: { 'content-type': 'application/json' } });
  assert.deepEqual(fathom.events[0], { key: 'meeting_ready', ctx: { title: 'Kickoff', summary: 'Resumo', url: 'https://fathom.video/x' }, contact: { email: 'cliente@x.com', name: 'Cliente', phone: '' } });
  const tiktok = readWebhook('tiktok_leads', { raw: 'form_name=Promo&email=dani%40x.com&full_name=Dani', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.deepEqual(tiktok.events[0], { key: 'form_submitted', ctx: { form: 'Promo' }, contact: { email: 'dani@x.com', phone: '', name: 'Dani' } });
  assert.throws(() => readWebhook('notion', { raw: '{}', headers: {} }), { status: 404 });
});

test('gatilhos: Airtable marca o cursor na primeira vez e depois traz só os registros novos', async () => {
  const api = fakeApi([[/api\.airtable\.com\/v0\/app1\/Leads\?/, { records: [{ id: 'r2', createdTime: '2026-11-02T00:00:00Z', fields: { Nome: 'Bia' } }, { id: 'r1', createdTime: '2026-11-01T00:00:00Z', fields: { Nome: 'Ana' } }] }]]);
  const now = Date.parse('2026-10-31T00:00:00Z');
  const first = await pollConnector('airtable', 'new_record', { baseId: 'app1', table: 'Leads' }, { token: 'k' }, undefined, { request: api.request, now });
  assert.deepEqual(first, { cursor: '2026-10-31T00:00:00.000Z', events: [] });
  assert.equal(api.calls.length, 0, 'a primeira consulta não chama a API');
  const next = await pollConnector('airtable', 'new_record', { baseId: 'app1', table: 'Leads' }, { token: 'k' }, first.cursor, { request: api.request, now });
  assert.deepEqual(next.events.map(event => event.ctx.record), ['r1', 'r2']);
  assert.equal(next.cursor, '2026-11-02T00:00:00Z');
  assert.equal(new URL(api.calls[0].url).searchParams.get('filterByFormula'), 'IS_AFTER(CREATED_TIME(), "2026-10-31T00:00:00.000Z")');
  await assert.rejects(pollConnector('hubspot', 'x', {}, {}, null, { request: api.request }), { status: 404 });
});

test('Google Sheets: token da conta de serviço, linhas em lote, limpar, formatar, remover e gatilhos de abas e planilhas', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const serviceAccount = JSON.stringify({ client_email: `robo-${Date.now()}@proj.iam.gserviceaccount.com`, private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) });
  const api = fakeApi([
    ['https://oauth2.googleapis.com/token', { access_token: 'gtok', expires_in: 3600 }],
    [/:batchUpdate$/, {}],
    [/:clear$/, {}],
    [/:append\?/, { updates: { updatedRange: 'Página1!A5:C5' } }],
    [/\?fields=sheets\.properties$/, { sheets: [{ properties: { sheetId: 0, title: 'Página1' } }, { properties: { sheetId: 7, title: 'Nova' } }] }],
    [/drive\/v3\/files\?/, { files: [{ id: 's2', name: 'Novo', createdTime: '2026-11-03T00:00:00Z' }, { id: 's1', name: 'Velho', createdTime: '2026-10-01T00:00:00Z' }] }]
  ]);
  const auth = { serviceAccount };
  assert.deepEqual(await run('google_sheets', 'add_rows', auth, { spreadsheetId: 'S', rows: 'Ana; 30\n\nBia; 25' }, api), { google_sheets_rows: '2' });
  const token = api.calls[0];
  assert.match(token.body, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=/);
  assert.deepEqual(api.calls[1].body, { values: [['Ana', '30'], ['Bia', '25']] });
  assert.equal(api.calls[1].headers.Authorization, 'Bearer gtok');
  assert.deepEqual(await run('google_sheets', 'clear_row', auth, { spreadsheetId: 'S', row: '4' }, api), { google_sheets_row: '4' });
  assert.match(decodeURIComponent(api.calls.at(-1).url), /Página1!A4:ZZ4:clear$/);
  await assert.rejects(run('google_sheets', 'format_rows', auth, { spreadsheetId: 'S', start: '5', end: '2' }, api), /Informe as linhas/);
  await run('google_sheets', 'format_rows', auth, { spreadsheetId: 'S', start: '2', end: '3', color: '#ff0000', bold: 'yes' }, api);
  assert.deepEqual(api.calls.at(-1).body.requests[0].repeatCell.cell.userEnteredFormat, { backgroundColor: { red: 1, green: 0, blue: 0 }, textFormat: { bold: true } });
  await run('google_sheets', 'remove_rows', auth, { spreadsheetId: 'S', start: '2', end: '3', sheetId: '7' }, api);
  assert.deepEqual(api.calls.at(-1).body.requests[0].deleteDimension.range, { sheetId: 7, dimension: 'ROWS', startIndex: 1, endIndex: 3 });
  assert.equal(api.calls.filter(call => call.url.includes('oauth2')).length, 1, 'o token fica guardado durante a hora');

  const tabsFirst = await pollConnector('google_sheets', 'new_worksheet', { spreadsheetId: 'S' }, auth, null, { request: api.request });
  assert.deepEqual(tabsFirst, { cursor: '0,7', events: [] });
  const tabsNext = await pollConnector('google_sheets', 'new_worksheet', { spreadsheetId: 'S' }, auth, '0', { request: api.request });
  assert.deepEqual(tabsNext.events, [{ key: 'new_worksheet', ctx: { spreadsheetId: 'S', sheet: 'Nova', sheetId: 7 } }]);
  const files = await pollConnector('google_sheets', 'new_spreadsheet', {}, auth, '2026-11-01T00:00:00Z', { request: api.request });
  assert.deepEqual(files, { cursor: '2026-11-03T00:00:00Z', events: [{ key: 'new_spreadsheet', ctx: { spreadsheetId: 's2', name: 'Novo' } }] });
});

test('testar conexão: campo obrigatório, Slack válido e recusado, Google Sheets e app sem teste', async () => {
  await assert.rejects(testConnection('slack', {}, { request: async () => new Response('{}') }), /Preencha/);
  const ok = fakeApi([['https://slack.com/api/auth.test', { ok: true, team: 'Equipe Graao' }]]);
  assert.equal(await testConnection('slack', { botToken: 'xoxb', signingSecret: 's' }, { request: ok.request }), 'Equipe Graao');
  const bad = fakeApi([['https://slack.com/api/auth.test', { ok: false, error: 'invalid_auth' }]]);
  await assert.rejects(testConnection('slack', { botToken: 'xoxb', signingSecret: 's' }, { request: bad.request }), /Slack: invalid_auth/);
  await assert.rejects(testConnection('google_sheets', { serviceAccount: '{"client_email":"a@b.c"}' }, { request: ok.request }), /sem client_email ou private_key/);
  assert.equal(await testConnection('notion', { token: 'k' }, { request: ok.request }), '');
});
