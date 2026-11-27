// Conectar uma IA ao servidor MCP com o login da graao (OAuth 2.1): registro, consentimento, tokens e revogação.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createSupabaseAuth, afterLogin } from '../auth.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

const oauthClaims = Buffer.from(JSON.stringify({ amr: [{ method: 'oauth' }] })).toString('base64url');
const identity = email => ({ id: randomUUID(), email, email_confirmed_at: '2026-11-18', identities: [{ provider: 'google' }] });
const tokenFor = user => `${user.id}.${oauthClaims}.signature`;
const callback = 'https://claude.ai/api/mcp/auth_callback';

async function start(t) {
  const owner = identity('owner@example.test'), member = identity('member@example.test'), other = identity('other@example.test');
  const users = new Map([owner, member, other].map(user => [tokenFor(user), user]));
  const auth = createSupabaseAuth({
    projectUrl: 'https://test.supabase.co', publishableKey: 'test',
    async request(_url, options) {
      const user = users.get(options.headers.Authorization?.slice(7));
      return user ? Response.json(user) : Response.json({}, { status: 401 });
    }
  });
  const store = createSqliteStore(':memory:');
  const { server, host, ready } = makeServer({ store, auth, agencyOwnerId: owner.id, allowLocalAccess: false, socialScheduler: false, port: 0 });
  await ready;
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, { user, body, form, headers } = {}) => {
    const response = await fetch(base + path, {
      method: body || form ? 'POST' : 'GET', redirect: 'manual',
      headers: { ...(user && { Cookie: `go_access=${tokenFor(user)}` }), ...(body && { 'Content-Type': 'application/json' }), ...headers },
      body: body ? JSON.stringify(body) : form ? new URLSearchParams(form) : undefined
    });
    const raw = await response.text();
    let parsed = raw; try { parsed = JSON.parse(raw); } catch { /* HTML page */ }
    return { status: response.status, headers: response.headers, body: parsed };
  };
  const agencyAction = async body => {
    const response = await call('/api/agency/action', { user: owner, body });
    assert.equal(response.status, 200, response.body.error);
    return response.body.result;
  };
  const account = async name => (await call('/api/workspaces', { user: owner, body: { name } })).body.id;
  const workspace = await account('Conta A'), second = await account('Conta B');
  await call(`/api/action?workspace=${workspace}`, { user: owner, body: { type: 'save', key: 'contacts', data: { name: 'Cliente A' } } });
  const register = async (extra = {}) => call('/api/mcp/oauth/register', { body: { client_name: 'Claude', redirect_uris: [callback], ...extra } });
  // The whole dance: register, consent as `user`, exchange the code.
  const authorize = async ({ user = owner, target = workspace, access = 'write', resource } = {}) => {
    const verifier = randomBytes(32).toString('base64url');
    const clientId = (await register()).body.client_id;
    const request = { response_type: 'code', client_id: clientId, redirect_uri: callback, state: 'abc', code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), ...(resource && { resource }) };
    const consent = await call('/api/mcp/consent', { user, body: { request, workspace: target, access, allow: true } });
    const code = consent.status === 200 ? new URL(consent.body.redirect).searchParams.get('code') : '';
    return { consent, clientId, verifier, code, request };
  };
  const exchange = ({ clientId, verifier, code }, extra = {}) => call('/api/mcp/oauth/token', { form: { grant_type: 'authorization_code', client_id: clientId, code, code_verifier: verifier, redirect_uri: callback, ...extra } });
  const connect = async options => (await exchange(await authorize(options))).body;
  const rpc = (token, method, params, path = '/api/mcp') => call(path, { headers: { Authorization: `Bearer ${token}` }, body: { jsonrpc: '2.0', id: 1, method, params } });
  const tool = (token, name, args = {}, path) => rpc(token, 'tools/call', { name, arguments: args }, path);
  return { base, store, owner, member, other, call, agencyAction, workspace, second, register, authorize, exchange, connect, rpc, tool };
}

test('OAuth do MCP: o 401 aponta os metadados e eles descrevem o servidor', async t => {
  const { base, call, workspace } = await start(t);
  for (const path of ['/api/mcp', `/api/mcp/${workspace}`]) {
    const denied = await call(path, { body: { jsonrpc: '2.0', id: 1, method: 'initialize' } });
    assert.equal(denied.status, 401, path);
    assert.equal(denied.headers.get('www-authenticate'), `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource${path}"`);
    const resource = await call(`/.well-known/oauth-protected-resource${path}`);
    assert.equal(resource.body.resource, base + path);
    assert.deepEqual(resource.body.authorization_servers, [base]);
  }
  const { body } = await call('/.well-known/oauth-authorization-server');
  assert.equal(body.issuer, base);
  assert.deepEqual(body.code_challenge_methods_supported, ['S256']);
  assert.deepEqual(body.token_endpoint_auth_methods_supported, ['none']);
  for (const key of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint', 'revocation_endpoint']) assert.ok(body[key].startsWith(base), key);
});

test('OAuth do MCP: do registro à ferramenta, só na subconta escolhida', async t => {
  const { connect, tool, rpc, workspace, second } = await start(t);
  const token = await connect();
  assert.equal(token.token_type, 'Bearer');
  assert.ok(token.expires_in > 0 && token.refresh_token);
  for (const path of ['/api/mcp', `/api/mcp/${workspace}`]) {
    assert.equal(JSON.parse((await tool(token.access_token, 'list_crm_contacts', {}, path)).body.result.content[0].text).contacts[0].name, 'Cliente A');
  }
  assert.equal((await rpc(token.access_token, 'tools/list', {}, `/api/mcp/${second}`)).status, 403);
});

test('OAuth do MCP: conexão de leitura não mostra nem executa ferramentas que gravam', async t => {
  const { store, connect, tool, rpc, workspace } = await start(t);
  const { access_token } = await connect({ access: 'read' });
  const { tools } = (await rpc(access_token, 'tools/list')).body.result;
  assert.ok(tools.length && tools.every(item => item.annotations.readOnlyHint));
  assert.equal((await tool(access_token, 'create_contact', { name: 'x' })).body.result.isError, true);
  assert.equal(store.load(workspace).contacts.length, 1);
});

test('OAuth do MCP: sem sessão ninguém consente, e a página leva ao login e volta', async t => {
  const { authorize, call } = await start(t);
  const { request } = await authorize();
  assert.equal((await call('/api/mcp/consent', { body: { request, allow: true } })).status, 401);
  const page = await call(`/mcp/autorizar?${new URLSearchParams(request)}`);
  assert.equal(page.status, 303);
  const next = new URL(page.headers.get('location'), 'http://x').searchParams.get('next');
  assert.equal(new URL(next, 'http://x').searchParams.get('client_id'), request.client_id);
  assert.equal(afterLogin(next), next);
  assert.equal(afterLogin('https://evil.test/mcp/autorizar'), '/app');
  assert.equal(afterLogin('//evil.test/mcp/autorizar'), '/app');
});

test('OAuth do MCP: a tela de consentimento mostra quem pede e as subcontas que a pessoa abre', async t => {
  const { authorize, call, owner, workspace, second } = await start(t);
  const { request } = await authorize();
  const { body } = await call(`/api/mcp/consent?${new URLSearchParams({ ...request, resource: 'x' })}`, { user: owner });
  assert.match(body.error, /resource|endereço/i);
  const ok = await call(`/api/mcp/consent?${new URLSearchParams(request)}`, { user: owner });
  assert.equal(ok.body.client.name, 'Claude');
  assert.equal(ok.body.client.host, 'claude.ai');
  assert.deepEqual(ok.body.workspaces.map(row => row.id).filter(id => id !== 'demo').sort(), [workspace, second].sort());
});

test('OAuth do MCP: o endereço da subconta já vem escolhido e não pode ser trocado', async t => {
  const { base, authorize, call, owner, workspace, second } = await start(t);
  const resource = `${base}/api/mcp/${workspace}`;
  const { request } = await authorize({ resource });
  assert.equal((await call(`/api/mcp/consent?${new URLSearchParams(request)}`, { user: owner })).body.selected, workspace);
  const swapped = await call('/api/mcp/consent', { user: owner, body: { request, workspace: second, access: 'read', allow: true } });
  assert.equal(swapped.status, 400);
});

test('OAuth do MCP: negar volta para a IA com access_denied e não cria conexão', async t => {
  const { store, authorize, call, owner } = await start(t);
  const { request } = await authorize();
  const before = store.load('agency').mcpGrants.length;
  const { body } = await call('/api/mcp/consent', { user: owner, body: { request, allow: false } });
  const url = new URL(body.redirect);
  assert.equal(url.searchParams.get('error'), 'access_denied');
  assert.equal(url.searchParams.get('state'), 'abc');
  assert.equal(store.load('agency').mcpGrants.length, before);
});

test('OAuth do MCP: endereços de retorno perigosos são recusados no registro e no consentimento', async t => {
  const { register, authorize, call, owner } = await start(t);
  for (const uri of ['javascript:alert(1)', 'data:text/html,x', 'http://evil.test/cb', 'file:///etc/passwd', 'https://user:pw@claude.ai/cb', 'https://claude.ai/cb#frag', 'nada']) {
    const response = await register({ redirect_uris: [uri] });
    assert.equal(response.status, 400, uri);
    assert.equal(response.body.error, 'invalid_redirect_uri', uri);
  }
  for (const uri of ['http://127.0.0.1:5555/cb', 'http://localhost/cb', 'cursor://anysphere.cursor-mcp/oauth/callback']) assert.equal((await register({ redirect_uris: [uri] })).status, 201, uri);
  const { request } = await authorize();
  const swapped = await call('/api/mcp/consent', { user: owner, body: { request: { ...request, redirect_uri: 'https://evil.test/cb' }, allow: false } });
  assert.equal(swapped.status, 400);
  assert.equal(swapped.body.redirect, undefined);
  const forged = `graao_client_${Buffer.from(JSON.stringify({ n: 'x', r: ['javascript:alert(1)'] })).toString('base64url')}`;
  assert.equal((await call('/api/mcp/consent', { user: owner, body: { request: { ...request, client_id: forged, redirect_uri: 'javascript:alert(1)' }, allow: false } })).status, 400);
});

test('OAuth do MCP: em localhost a porta pode mudar, como a especificação pede', async t => {
  const { register, authorize, call, owner, workspace } = await start(t);
  const { request } = await authorize();
  const clientId = (await register({ redirect_uris: ['http://127.0.0.1:1111/cb'] })).body.client_id;
  const go = redirect => call('/api/mcp/consent', { user: owner, body: { request: { ...request, client_id: clientId, redirect_uri: redirect }, workspace, access: 'read', allow: true } });
  assert.equal((await go('http://127.0.0.1:2222/cb')).status, 200);
  assert.equal((await go('http://127.0.0.1:2222/outro')).status, 400);
});

test('OAuth do MCP: PKCE é obrigatório e conferido', async t => {
  const { authorize, exchange, call, owner } = await start(t);
  const flow = await authorize();
  const weak = await call('/api/mcp/consent', { user: owner, body: { request: { ...flow.request, code_challenge_method: 'plain' }, allow: true } });
  assert.equal(weak.status, 400);
  for (const extra of [{ code_verifier: 'errado'.repeat(10) }, { redirect_uri: 'https://claude.ai/outro' }, { client_id: 'graao_client_outro' }]) {
    const response = await exchange(flow, extra);
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'invalid_grant');
  }
});

test('OAuth do MCP: código usado duas vezes derruba a conexão', async t => {
  const { authorize, exchange, rpc } = await start(t);
  const flow = await authorize();
  const first = await exchange(flow);
  assert.equal((await rpc(first.body.access_token, 'ping')).status, 200);
  assert.equal((await exchange(flow)).body.error, 'invalid_grant');
  assert.equal((await rpc(first.body.access_token, 'ping')).status, 401);
});

test('OAuth do MCP: código e token vencidos não valem', async t => {
  const { store, authorize, exchange, connect, rpc } = await start(t);
  const flow = await authorize();
  const past = new Date(Date.now() - 1000).toISOString();
  store.change('agency', agency => { for (const grant of agency.mcpGrants) grant.codeExpires = past; });
  assert.equal((await exchange(flow)).body.error, 'invalid_grant');
  const { access_token } = await connect();
  store.change('agency', agency => { for (const grant of agency.mcpGrants) grant.tokenExpires = past; });
  assert.equal((await rpc(access_token, 'ping')).status, 401);
});

test('OAuth do MCP: renovar troca os dois tokens, e reutilizar o antigo derruba a conexão', async t => {
  const { store, connect, call, rpc, authorize } = await start(t);
  const first = await connect();
  const { clientId } = await authorize();
  const renew = token => call('/api/mcp/oauth/token', { form: { grant_type: 'refresh_token', refresh_token: token, client_id: clientId } });
  const second = await renew(first.refresh_token);
  assert.equal(second.status, 200);
  assert.notEqual(second.body.refresh_token, first.refresh_token);
  assert.equal((await rpc(first.access_token, 'ping')).status, 401);
  assert.equal((await rpc(second.body.access_token, 'ping')).status, 200);
  // A retry right away is only refused; later it means the token leaked.
  assert.equal((await renew(first.refresh_token)).body.error, 'invalid_grant');
  assert.equal((await rpc(second.body.access_token, 'ping')).status, 200);
  store.change('agency', agency => { for (const grant of agency.mcpGrants) if (grant.rotatedAt) grant.rotatedAt = new Date(Date.now() - 600000).toISOString(); });
  assert.equal((await renew(first.refresh_token)).body.error, 'invalid_grant');
  assert.equal((await rpc(second.body.access_token, 'ping')).status, 401);
});

test('OAuth do MCP: a conexão nunca pode mais que a pessoa, e acaba quando ela sai da equipe', async t => {
  const { agencyAction, member, connect, authorize, tool, rpc, workspace, second } = await start(t);
  const staff = { first: 'Bia', last: 'Lima', email: member.email, role: 'Account User', accounts: [workspace], permissionMode: 'restricted', permissions: ['contacts'], loginEnabled: true };
  const id = await agencyAction({ type: 'save', key: 'users', data: staff });
  assert.equal((await authorize({ user: member, target: second })).consent.status, 404);
  const { access_token } = await connect({ user: member });
  const { tools } = (await rpc(access_token, 'tools/list')).body.result;
  assert.ok(tools.some(item => item.name === 'list_crm_contacts'));
  assert.ok(!tools.some(item => item.name === 'list_invoices'));
  assert.equal((await tool(access_token, 'list_invoices')).body.result.isError, true);
  await agencyAction({ type: 'delete', key: 'users', id });
  assert.equal((await rpc(access_token, 'ping')).status, 401);
});

test('OAuth do MCP: quem conectou vê e revoga, e nada do que aparece na tela serve de token', async t => {
  const { store, connect, call, rpc, owner, other, workspace } = await start(t);
  const { access_token } = await connect();
  const list = await call(`/api/mcp/grants?workspace=${workspace}`, { user: owner });
  assert.equal(list.body.grants[0].client, 'Claude');
  assert.doesNotMatch(JSON.stringify(list.body), /hash|challenge/i);
  assert.doesNotMatch(JSON.stringify((await call('/api/agency', { user: owner })).body), /mcpGrants|tokenHash/);
  const id = list.body.grants[0].id;
  assert.notEqual((await call(`/api/mcp/grants?workspace=${workspace}`, { user: other, body: { id } })).status, 200);
  assert.equal((await rpc(access_token, 'ping')).status, 200);
  assert.equal((await call(`/api/mcp/grants?workspace=${workspace}`, { user: owner, body: { id } })).status, 200);
  assert.equal((await rpc(access_token, 'ping')).status, 401);
  assert.equal(store.load('agency').mcpGrants.length, 0);
});

test('OAuth do MCP: a IA pode encerrar a própria conexão', async t => {
  const { connect, call, rpc } = await start(t);
  const { access_token, refresh_token } = await connect();
  assert.equal((await call('/api/mcp/oauth/revoke', { form: { token: refresh_token } })).status, 200);
  assert.equal((await rpc(access_token, 'ping')).status, 401);
  assert.equal((await call('/api/mcp/oauth/revoke', { form: { token: 'desconhecido' } })).status, 200);
});

test('OAuth do MCP: o token do MCP não abre a API pública nem as telas', async t => {
  const { connect, call, workspace } = await start(t);
  const { access_token } = await connect();
  const headers = { Authorization: `Bearer ${access_token}` };
  assert.equal((await call(`/api/v1/subaccounts/${workspace}/contacts`, { headers })).status, 401);
  assert.equal((await call(`/api/state?workspace=${workspace}`, { headers })).status, 401);
});
