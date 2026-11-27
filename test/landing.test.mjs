import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSupabaseAuth } from '../auth.mjs';
import { blank } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { verifiedAgencies } from './helpers/verified-agencies.mjs';

async function start(options = { auth: null, allowLocalAccess: true }) {
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, ...options });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  return { base, close: () => new Promise(resolve => server.close(resolve)) };
}

test('Root is the public home page, /login is the Google login and the platform stays under /app', async t => {
  const local = await start();
  t.after(local.close);

  for (const path of ['/', '/index.html']) {
    const res = await fetch(local.base + path);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /<h1 id="hero-title">/);
    assert.match(html, /href="\/login"/, 'the home page links to the login');
    assert.match(html, /href="\/home\.css"/);
    assert.match(html, /src="\/home\.js"/);
    assert.doesNotMatch(html, /id="google-signin-btn"/);
  }

  for (const path of ['/login', '/login.html']) {
    const res = await fetch(local.base + path);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /id="google-signin-btn"/);
    assert.match(html, /Continuar com Google/);
    assert.doesNotMatch(html, /<nav\b|<details\b/);
    // O único rodapé do login é a linha de direitos e versão, sem links.
    const footer = html.match(/<footer\b[\s\S]*?<\/footer>/g) || [];
    assert.equal(footer.length, 1);
    assert.match(footer[0], /Feito no Brasil com ☕, mordidas e muito MCP\./);
    assert.doesNotMatch(footer[0], /<a\b/);
  }

  for (const [path, type] of [['/login.css', /text\/css/], ['/login.js', /text\/javascript/], ['/home.css', /text\/css/], ['/home.js', /text\/javascript/]]) {
    const res = await fetch(local.base + path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-type'), type);
  }

  for (const path of ['/landing.html', '/landing.css', '/landing.js']) {
    assert.equal((await fetch(local.base + path)).status, 404, `${path} must not expose an old page`);
  }

  for (const path of ['/app', '/painel']) {
    const res = await fetch(local.base + path);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /<div id="app">/);
    assert.match(html, /src="\/app\.js"/);
  }
});

const alice = { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', email: 'alice@example.com', email_confirmed_at: '2026-01-01', identities: [{ provider: 'google' }] };
const bob = { id: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', email: 'bob@example.com', email_confirmed_at: '2026-01-01', identities: [{ provider: 'google' }] };
const owner = { id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc', email: 'owner@example.com', email_confirmed_at: '2026-01-01', identities: [{ provider: 'google' }] };
const users = { alice, bob, owner };
const reply = (value, status = 200) => Response.json(value, { status });
const post = (base, route, body, headers = {}) => fetch(base + route, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body),
  redirect: 'manual'
});
const cookies = result => result.headers.getSetCookie().map(line => line.split(';', 1)[0]).filter(part => !part.endsWith('=')).join('; ');

function session(name, method = 'oauth') {
  const user = users[name];
  const claims = Buffer.from(JSON.stringify({ sub: user.id, amr: [{ method }] })).toString('base64url');
  return { access_token: 'test.' + claims + '.test', refresh_token: name + '-' + method, expires_in: 3600, user };
}

function provider(google = true) {
  const signedOut = new Set();
  const sessions = Object.keys(users).flatMap(name => ['oauth', 'password'].map(method => session(name, method)));
  const projectUrl = 'https://test.supabase.co';
  return createSupabaseAuth({ projectUrl, publishableKey: 'public-key', async request(url, options) {
    assert.equal(url.origin, projectUrl);
    assert.equal(options.headers.apikey, 'public-key');
    const input = options.body && JSON.parse(options.body);
    switch (url.pathname) {
      case '/auth/v1/settings':
        return reply({ external: { google } });
      case '/auth/v1/token': {
        const grant = url.searchParams.get('grant_type');
        if (grant === 'refresh_token') {
          const refreshed = sessions.find(candidate => candidate.refresh_token === input.refresh_token && !signedOut.has(candidate.access_token));
          return refreshed ? reply(refreshed) : reply({}, 400);
        }
        assert.equal(grant, 'pkce');
        assert.match(input.code_verifier, /^[a-zA-Z0-9_-]{43}$/);
        const [name, method] = input.auth_code.split('-');
        return users[name] ? reply(session(name, method)) : reply({}, 400);
      }
      case '/auth/v1/user': {
        const token = options.headers.Authorization.slice('Bearer '.length);
        const current = sessions.find(candidate => candidate.access_token === token && !signedOut.has(token));
        return current ? reply(current.user) : reply({}, 401);
      }
      case '/auth/v1/logout':
        assert.equal(url.searchParams.get('scope'), 'local');
        signedOut.add(options.headers.Authorization.slice('Bearer '.length));
        return new Response(null, { status: 204 });
      default: throw Error('Unexpected Auth API request');
    }
  } });
}

async function oauthLogin(base, code, next = '/app') {
  const start = await post(base, '/api/auth/google', { next });
  assert.equal(start.status, 200);
  return fetch(base + '/api/auth/callback/google?code=' + code, {
    headers: { Cookie: cookies(start) },
    redirect: 'manual'
  });
}

test('Google OAuth requires a PKCE verifier and rejects password sessions', async t => {
  const { base, close } = await start({ auth: provider() });
  t.after(close);
  const app = await fetch(base + '/app', { redirect: 'manual' });
  assert.equal(app.status, 303);
  assert.equal(app.headers.get('location'), '/login?next=%2Fapp');
  assert.equal((await post(base, '/api/auth/login', { email: alice.email, password: 'example' })).status, 404);
  assert.equal((await post(base, '/api/auth/signup', { email: alice.email, password: 'example' })).status, 404);

  const startGoogle = await post(base, '/api/auth/google', { next: '/app#dashboard', email: alice.email, credential: 'fake.jwt.token' });
  assert.doesNotMatch(cookies(startGoogle), /go_access/);
  const target = new URL((await startGoogle.json()).url);
  assert.equal(target.pathname, '/auth/v1/authorize');
  assert.equal(target.searchParams.get('provider'), 'google');
  assert.equal(target.searchParams.get('redirect_to'), base + '/api/auth/callback/google');
  const flow = cookies(startGoogle).split('=')[1];
  const { verifier } = JSON.parse(Buffer.from(flow, 'base64url').toString('utf8'));
  assert.equal(target.searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));
  const back = base + '/api/auth/callback/google?code=alice-oauth';
  assert.equal((await fetch(back, { redirect: 'manual' })).headers.get('location'), '/login?error=google');
  const result = await fetch(back, { redirect: 'manual', headers: { Cookie: cookies(startGoogle) } });
  assert.equal(result.headers.get('location'), '/app#dashboard');
  assert.match(result.headers.getSetCookie().join('\n'), /go_access_[a-f0-9-]{36}=.*HttpOnly; SameSite=Lax/);
  const wrongMethod = await oauthLogin(base, 'alice-password');
  assert.equal(wrongMethod.headers.get('location'), '/login?error=google');
  assert.doesNotMatch(cookies(wrongMethod), /go_access/);
  for (const cookie of ['go_access=' + session('alice','password').access_token, 'go_refresh=alice-password']) {
    assert.equal((await fetch(base + '/api/state', { headers: { Cookie: cookie } })).status, 401);
  }
});

test('Google accounts open empty agencies and existing agency permissions still apply', async t => {
  const store = verifiedAgencies(createSqliteStore(':memory:'));
  const ownerWorkspaceId = 'user-' + owner.id;
  await store.insert(ownerWorkspaceId, blank('Workspace pessoal do proprietário'));
  const { base, close } = await start({ auth: provider(), agencyOwnerId: owner.id, store });
  t.after(close);
  const forged = { 'X-Go-User': owner.id };
  assert.equal((await fetch(base + '/api/state', { headers: forged })).status, 401);
  const login = await oauthLogin(base, 'alice-oauth', '//another-site.example');
  assert.equal(login.headers.get('location'), '/app#agency/dashboard');
  const headers = { Cookie: cookies(login), ...forged };
  const list = await fetch(base + '/api/workspaces', { headers }).then(r => r.json());
  assert.deepEqual(list, { workspaces: [], agency: true });
  const personalPath = '/api/state?workspace=user-' + alice.id;
  assert.equal((await fetch(base + personalPath, { headers })).status, 404);
  assert.equal((await fetch(base + '/api/state?workspace=demo', { headers })).status, 403);
  assert.equal((await fetch(base + '/api/state?workspace=user-' + bob.id, { headers })).status, 403);
  const newAgency = await fetch(base + '/api/agency', { headers }).then(r => r.json());
  assert.equal(newAgency.access.owner, true);
  assert.deepEqual(newAgency.overview.accounts, []);

  const admin = await oauthLogin(base, 'owner-oauth');
  const adminHeaders = { Cookie: cookies(admin) };
  const agencyResponse = await fetch(base + '/api/agency', { headers: adminHeaders });
  assert.equal(agencyResponse.status, 200);
  const agency = await agencyResponse.json();
  assert.equal(agency.personalWorkspace.id, ownerWorkspaceId);
  assert.ok(agency.overview.accounts.every(w => !w.id.startsWith('user-')));
  const ownerPath = '/api/state?workspace=' + ownerWorkspaceId;
  const ownerResponse = await fetch(base + ownerPath, { headers: adminHeaders });
  assert.equal(ownerResponse.status, 200);
  const ownerState = await ownerResponse.json();
  assert.equal(ownerState.state.profile.name, 'Workspace pessoal do proprietário');
  assert.equal(ownerState.access.agency, true);
  assert.deepEqual(ownerState.workspaces.map(w => w.id).sort(), ['demo', ownerWorkspaceId]);
  assert.equal((await fetch(base + ownerPath, { headers })).status, 403);
  assert.equal((await fetch(base + personalPath, { headers: adminHeaders })).status, 403);
  const secondAccount = await post(base, '/api/workspaces', { name: 'Segundo cliente' }, adminHeaders);
  assert.equal(secondAccount.status, 201);
  const { id: secondAccountId } = await secondAccount.json();
  const membership = await post(base, '/api/agency/action', {
    type: 'save', key: 'users',
    data: { first: 'Bob', last: 'Test', email: bob.email, role: 'Account User', accounts: ['demo', secondAccountId], permissions: ['contacts'] }
  }, adminHeaders);
  assert.equal(membership.status, 200);
  const memberLogin = await oauthLogin(base, 'bob-oauth');
  const memberHeaders = { Cookie: cookies(memberLogin) };
  const memberState = await fetch(base + '/api/state?workspace=demo', { headers: memberHeaders }).then(r => r.json());
  assert.deepEqual(memberState.access.modules, ['contacts']);
  assert.deepEqual(memberState.workspaces.map(w => w.id).sort(), ['demo', secondAccountId].sort());
  assert.equal((await fetch(base + '/api/state?workspace=' + secondAccountId, { headers: memberHeaders })).status, 200);
  assert.equal((await fetch(base + '/api/agency', { headers: memberHeaders })).status, 403);

  const child = await post(base, '/api/workspaces', { name: 'Cliente Alice' }, headers);
  assert.equal(child.status, 201);
  const { id } = await child.json();
  assert.equal((await fetch(base + '/api/state?workspace=' + id, { headers })).status, 200);
  assert.equal((await fetch(base + '/api/state?workspace=' + id, { headers: adminHeaders })).status, 403);
  assert.equal((await fetch(base + ownerPath, { headers })).status, 403);

  const renewed = await fetch(base + '/api/workspaces', { headers: { Cookie: 'go_refresh=alice-oauth' } });
  assert.equal(renewed.status, 200);
  assert.match(cookies(renewed), /go_access_[a-f0-9-]{36}=/);
  const logout = await post(base, '/api/auth/logout', {}, headers);
  assert.equal(logout.status, 200);
  assert.ok(logout.headers.getSetCookie().every(line => line.includes('Max-Age=0')));
  assert.equal((await fetch(base + '/api/workspaces', { headers })).status, 401);
});

test('Users in one agency supply their own OpenAI key for Studio and agent tests', async t => {
  const store = verifiedAgencies(createSqliteStore(':memory:'));
  const aliceKey = 'sk-fixture-alice-123456789012';
  const bobKey = 'sk-fixture-bob-987654321098';
  const html = '<!doctype html><html lang="pt-BR"><head><title>Site</title></head><body><h1>Site de teste</h1></body></html>';
  const generations = [];
  const { base, close } = await start({
    auth: provider(), agencyOwnerId: alice.id, store, agentModel: 'fixture-model', openAISecret: 'fixture-encryption-secret',
    async openAIRequest(url, options) {
      assert.equal(new URL(url).origin, 'https://api.openai.com');
      const key = options.headers.Authorization.slice('Bearer '.length);
      if (options.method === 'GET') {
        assert.equal(new URL(url).pathname, '/v1/models/fixture-model');
        return [aliceKey, bobKey].includes(key) ? reply({ id: 'fixture-model' }) : reply({ error: 'invalid' }, 401);
      }
      assert.equal(new URL(url).pathname, '/v1/responses');
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'fixture-model');
      assert.equal(body.store, false);
      const kind = body.text?.format.name || 'agent';
      generations.push({ key, kind });
      const answers = { studio_site: { name: 'Site de teste', summary: 'Resumo', theme: 'indigo', html },
        studio_page: { html }, studio_revision: { html, change: 'Página atualizada' } };
      return reply({ status: 'completed', output: [{ content: [{ type: 'output_text', text: answers[kind] ? JSON.stringify(answers[kind]) : 'Resposta de teste' }] }] });
    }
  });
  t.after(close);
  const aliceHeaders = { Cookie: cookies(await oauthLogin(base, 'alice-oauth')) };
  assert.equal((await post(base, '/api/agency/action', { type: 'save', key: 'users', data: {
    first: 'Bob', last: 'Test', email: bob.email, role: 'Account User', accounts: ['demo']
  } }, aliceHeaders)).status, 200);
  const bobHeaders = { Cookie: cookies(await oauthLogin(base, 'bob-oauth')) };
  const connect = (apiKey, headers) => post(base, '/api/openai', { action: 'connect', apiKey }, headers);
  const state = headers => fetch(base + '/api/state', { headers }).then(res => res.json());
  const requestStudio = (route, data, headers = aliceHeaders) => post(base, '/api/studio' + route, data, headers);
  const input = { brief: 'Site de teste', template: 'landing', mode: 'model' };

  assert.equal((await connect(aliceKey, {})).status, 401);
  assert.equal((await requestStudio('', input)).status, 503);
  assert.equal(generations.length, 0);
  const connection = await connect(aliceKey, aliceHeaders);
  assert.equal(connection.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await connection.json(), { configured: true, last4: '9012', model: 'fixture-model' });
  assert.equal((await connect('sk-fixture-invalid-123456789012', aliceHeaders)).status, 422);
  assert.equal(JSON.stringify(await store.load('openai-' + alice.id)).includes(aliceKey), false);
  assert.equal((await state(aliceHeaders)).features.studioAI, true);
  assert.equal((await state(bobHeaders)).features.studioAI, false);
  assert.equal((await requestStudio('', input, bobHeaders)).status, 503);

  const created = await requestStudio('', input);
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const { doc } = await fetch(base + '/api/studio/doc?id=' + id, { headers: aliceHeaders }).then(res => res.json());
  assert.equal((await requestStudio('/revise', { id, pageId: doc.pages[0].id, instruction: 'Revise o título' })).status, 200);
  assert.equal((await requestStudio('/page', { id, action: 'add', name: 'Contato', ai: true })).status, 200);
  const { agent } = await post(base, '/api/agents/create', { name: 'Atendimento' }, aliceHeaders).then(res => res.json());
  const preview = { id: agent.id, revision: agent.revision, version: 'draft', messages: ['Olá'] };
  assert.equal((await connect(bobKey, bobHeaders)).status, 200);
  assert.equal((await post(base, '/api/agents/test', preview, bobHeaders).then(res => res.json())).reply, 'Resposta de teste');
  assert.deepEqual(generations, [
    { key: aliceKey, kind: 'studio_site' }, { key: aliceKey, kind: 'studio_revision' },
    { key: aliceKey, kind: 'studio_page' }, { key: bobKey, kind: 'agent' }
  ]);
  assert.equal((await post(base, '/api/openai', { action: 'disconnect' }, aliceHeaders)).status, 200);
  assert.equal((await state(aliceHeaders)).features.studioAI, false);
  assert.equal((await state(bobHeaders)).features.studioAI, true);
  assert.equal((await store.load('openai-' + alice.id)).token, undefined);
  assert.equal((await requestStudio('', { ...input, mode: 'starter' })).status, 201);
});

test('Agency profiles force Brazilian Portuguese even with a legacy language value', async t => {
  const store = verifiedAgencies(createSqliteStore(':memory:'));
  const { base, close } = await start({ auth: null, allowLocalAccess: true, store });
  t.after(close);
  await store.change('agency', state => { state.profile.language = 'English (United States)'; });
  const agency = await fetch(base + '/api/agency').then(res => res.json());
  assert.equal(agency.agency.profile.language, 'Português (Brasil)');
  for (const fields of [{}, { language: 'Español' }]) {
    const saved = await post(base, '/api/agency/action', { type: 'profile', data: { first: 'Ana', last: 'Lima', ...fields } });
    assert.equal(saved.status, 200);
    assert.equal((await saved.json()).agency.profile.language, 'Português (Brasil)');
  }
});

// O login com Google exige uma política de privacidade publicada (e a LGPD também): ela fica pública,
// sem sessão, mesmo com a autenticação ligada.
test('A política de privacidade é pública em /privacidade, sem sessão', async t => {
  const authOn = { auth: { hasSession: () => false, user: async () => null, session: async () => null }, allowLocalAccess: false };
  const server = await start(authOn);
  t.after(server.close);
  for (const path of ['/privacidade', '/privacidade/', '/privacidade.html']) {
    const res = await fetch(server.base + path, { redirect: 'manual' });
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /Política de Privacidade/);
    assert.match(html, /LGPD/);
  }
  const art = await fetch(server.base + '/graao-gato.svg');
  assert.equal(art.status, 200);
  assert.equal(art.headers.get('content-type'), 'image/svg+xml');
});
