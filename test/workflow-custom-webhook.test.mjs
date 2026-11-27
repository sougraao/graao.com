import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { deliverCustomWebhook } from '../workflow-delivery.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const publicDns = async () => [{ address: '93.184.216.34' }];

function setup(config, after = [{ type: 'add_tag', config: { tag: 'status {{vars.api_status}}' } }]) {
  const s = blank();
  const id = save(s, 'workflows', { name: 'API', active: true, triggers: [{ type: 'contact_created' }], steps: [{ type: 'custom_webhook', config: { variable: 'api', ...config } }, ...after] });
  const ana = save(s, 'contacts', { name: 'Ana "Aspas" Lima', email: 'ana@x.test', tags: [], custom: {} });
  const run = runsOf(s, id)[0];
  const item = (s.workflowOutbox || []).find(row => row.kind === 'custom-webhook');
  return { s, id, ana, run, item };
}

test('T.1 custom webhook: fills URL, headers and JSON body with escaped variables, and waits', () => {
  const { s, run, item } = setup({ method: 'PATCH', url: 'https://api.exemplo.com/c?email={{contact.email}}&n={{contact.name}}',
    headers: 'Authorization: Bearer abc\nX-Contato: {{contact.name}}', contentType: 'json', body: '{"nome": "{{contact.name}}", "fixo": 1}' });
  assert.equal(run.status, 'Waiting');
  assert.equal(item.method, 'PATCH');
  assert.equal(item.url, 'https://api.exemplo.com/c?email=ana%40x.test&n=Ana%20%22Aspas%22%20Lima');
  assert.deepEqual(item.headers, { Authorization: 'Bearer abc', 'X-Contato': 'Ana "Aspas" Lima' });
  assert.deepEqual(JSON.parse(item.body), { nome: 'Ana "Aspas" Lima', fixo: 1 }, 'quotes in a name do not break the JSON');
  assert.equal(item.variable, 'api');
  assert.ok(s.workflowOutbox.every(row => row.kind !== 'webhook'));
});

test('T.1 custom webhook: the answer becomes variables and the flow resumes; errors keep status and body', () => {
  const { s, ana, run, item } = setup({ method: 'POST', url: 'https://api.exemplo.com/x', contentType: 'form', body: 'nome={{contact.name}}\norigem=graao' });
  assert.equal(item.body, 'nome=Ana+%22Aspas%22+Lima&origem=graao');
  execute(s, { type: 'workflow-ai-result', data: { results: [{ runId: run.id, stepId: item.stepId, vars: { api: '{"id":7}', api_status: '201', api_id: '7' } }] } });
  assert.equal(run.status, 'Completed');
  assert.equal(run.vars.api_id, '7');
  assert.ok(s.contacts.find(row => row.id === ana).tags.includes('status 201'));

  const failed = setup({ method: 'GET', url: 'https://api.exemplo.com/y', stopOnError: true });
  execute(failed.s, { type: 'workflow-ai-result', data: { results: [{ runId: failed.run.id, stepId: failed.item.stepId, error: 'falhou (404)', vars: { api: 'não achei', api_status: '404' } }] } });
  assert.equal(failed.run.status, 'Failed', 'stop on error');
  assert.equal(failed.run.vars.api_status, '404');
});

test('T.1 custom webhook: bad address or invalid JSON stop at the step; test runs do not call', () => {
  const bad = setup({ url: 'http://inseguro.test' });
  assert.match(bad.run.results.join(' '), /endereço inválido/);
  assert.equal(bad.item, undefined);
  const json = setup({ url: 'https://api.exemplo.com', contentType: 'json', body: '{"quebrado": ' });
  assert.match(json.run.results.join(' '), /JSON válido/);
  const empty = setup({ url: 'https://api.exemplo.com' });
  assert.equal(JSON.parse(empty.item.body).contact.email, 'ana@x.test', 'an empty JSON body sends the contact and trigger data');

  const before = empty.s.workflowOutbox.length;
  const tested = execute(empty.s, { type: 'workflow-test', data: { contactId: empty.ana, workflow: { name: 'Teste', triggers: [{ type: 'contact_created' }],
    steps: [{ type: 'custom_webhook', config: { url: 'https://api.exemplo.com', variable: 'api' } }] } } });
  assert.equal(empty.s.workflowOutbox.length, before, 'a test run calls nothing');
  assert.match(JSON.stringify(tested), /\(teste\) não enviado/);
});

test('T.1 custom webhook delivery: method, safe headers, JSON fields as variables, private networks blocked', async () => {
  let seen;
  const fetchImpl = async (url, options) => { seen = { url: String(url), ...options }; return new Response(JSON.stringify({ id: 9, ok: true, nested: { a: 1 }, nome: 'Ana' }), { status: 200 }); };
  const out = await deliverCustomWebhook({ url: 'https://api.exemplo.com/z', method: 'PUT', variable: 'Resposta', contentType: 'json', body: '{"a":1}',
    headers: { Authorization: 'Bearer x', Host: 'evil.test', 'Bad Header': 'x' } }, { fetchImpl, resolve: publicDns });
  assert.equal(seen.method, 'PUT');
  assert.equal(seen.headers.authorization, 'Bearer x');
  assert.equal(seen.headers.host, undefined, 'host cannot be overridden');
  assert.equal(seen.headers['content-type'], 'application/json');
  assert.equal(seen.body, '{"a":1}');
  assert.deepEqual(out.vars, { resposta: '{"id":9,"ok":true,"nested":{"a":1},"nome":"Ana"}', resposta_status: '200', resposta_id: '9', resposta_ok: 'true', resposta_nome: 'Ana' });

  const notFound = await deliverCustomWebhook({ url: 'https://api.exemplo.com/z', method: 'GET', variable: 'r', body: 'ignored' },
    { fetchImpl: async (url, options) => { seen = options; return new Response('nada', { status: 404 }); }, resolve: publicDns });
  assert.equal(seen.body, undefined, 'GET sends no body');
  assert.deepEqual(notFound, { error: 'falhou (404)', vars: { r: 'nada', r_status: '404' } });

  const internal = await deliverCustomWebhook({ url: 'https://interno.test', method: 'POST', variable: 'r' }, { fetchImpl, resolve: async () => [{ address: '10.0.0.5' }] });
  assert.deepEqual(internal, { error: 'endereço de rede interna bloqueado' });
});
