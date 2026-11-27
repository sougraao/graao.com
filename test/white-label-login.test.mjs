// White Label: entrar com Google no domínio da agência (app.agencia.com.br). O Supabase só devolve o login para a
// graao.com (a única origem na lista dele), então antes o Google voltava para lá sem o verificador PKCE, que mora
// no cookie do domínio da agência, e a entrada falhava. Agora o graao.com só repassa o código para a agência.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseAuth } from '../auth.mjs';
import { createAuthRoutes } from '../routes/auth.mjs';

const ana = { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', email: 'ana@example.com', email_confirmed_at: '2026-01-01', identities: [{ provider: 'google' }], user_metadata: { full_name: 'Ana' } };
const access = `t.${Buffer.from(JSON.stringify({ amr: [{ method: 'oauth' }] })).toString('base64url')}.t`;

function setup() {
  const exchanged = [];
  const auth = createSupabaseAuth({ projectUrl: 'https://test.supabase.co', publishableKey: 'k', async request(url, options) {
    const path = url.pathname.replace('/auth/v1/', '');
    if (path === 'settings') return Response.json({ external: { google: true } });
    if (path === 'token') {
      const input = JSON.parse(options.body);
      exchanged.push(input);
      return input.auth_code === 'code-ana' ? Response.json({ access_token: access, refresh_token: 'r1', expires_in: 3600, user: ana }) : Response.json({}, { status: 400 });
    }
    return Response.json({}, { status: 404 });
  } });
  const store = { findAgency: async filter => filter.company.domain === 'app.agencia.com.br' ? { id: 'ag-1', state: { company: { domain: 'app.agencia.com.br', name: 'Agência Um' } } } : null };
  const route = createAuthRoutes({
    auth, ready: Promise.resolve(), store, platformOrigin: 'https://graao.com',
    error: (message, status) => Object.assign(new Error(message), { status }),
    payload: async req => req.body || {},
    accessContext: async () => ({ agency: { company: { name: 'Agência Um' } }, who: { owner: false } })
  });
  // Um navegador por domínio: cada um guarda só os próprios cookies, como no navegador de verdade.
  const jars = { 'app.agencia.com.br': new Map(), 'graao.com': new Map() };
  async function visit(host, method, path, body) {
    const jar = jars[host];
    const req = { headers: { host, cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') }, body };
    const headers = {};
    const res = { getHeader: name => headers[name.toLowerCase()], setHeader: (name, value) => { headers[name.toLowerCase()] = value; } };
    const url = new URL(path, `https://${host}`);
    let out;
    try {
      out = await route({ req, res, p: url.pathname, method, url, json: value => ({ json: value }), goTo: location => ({ location }) });
    } catch (problem) { out = { status: problem.status, error: problem.message }; }
    for (const line of [headers['set-cookie'] || []].flat()) {
      const [pair, ...rest] = line.split(';'), at = pair.indexOf('=');
      if (/Max-Age=0/.test(rest.join(';'))) jar.delete(pair.slice(0, at)); else jar.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return out;
  }
  return { visit, jars, exchanged };
}

test('Google login on the agency domain goes through graao.com and ends on the agency domain', async () => {
  const { visit, jars, exchanged } = setup();
  const started = await visit('app.agencia.com.br', 'POST', '/api/auth/google', { next: '/app' });
  const relay = new URL(started.json.url);
  assert.equal(relay.origin, 'https://graao.com');
  assert.equal(relay.pathname, '/api/auth/relay');
  assert.equal(relay.searchParams.get('host'), 'app.agencia.com.br');
  const authorize = new URL(relay.searchParams.get('to'));
  assert.equal(authorize.origin, 'https://test.supabase.co');
  assert.equal(authorize.searchParams.get('redirect_to'), 'https://graao.com/api/auth/callback/google', 'o Supabase volta para a origem que ele aceita');
  assert.ok(jars['app.agencia.com.br'].get('go_google_flow'), 'o verificador PKCE fica no domínio da agência');

  const toGoogle = await visit('graao.com', 'GET', relay.pathname + relay.search);
  assert.equal(toGoogle.location, authorize.href);
  assert.equal(jars['graao.com'].get('go_google_relay'), 'app.agencia.com.br');

  const back = await visit('graao.com', 'GET', '/api/auth/callback/google?code=code-ana');
  assert.equal(back.location, 'https://app.agencia.com.br/api/auth/callback/google?code=code-ana');
  assert.equal(exchanged.length, 0, 'o graao.com não troca o código: ela não tem o verificador');
  assert.equal(jars['graao.com'].has('go_google_relay'), false, 'o repasse vale uma vez só');

  const done = await visit('app.agencia.com.br', 'GET', '/api/auth/callback/google?code=code-ana');
  assert.equal(done.location, '/app');
  assert.equal(exchanged.length, 1);
  assert.equal(jars['app.agencia.com.br'].get('go_active'), ana.id, 'a conta abre no domínio da agência');
});

test('The relay only sends codes to an agency domain and only to the Supabase login', async () => {
  const { visit, jars } = setup();
  const supabase = 'https://test.supabase.co/auth/v1/authorize?provider=google';
  assert.equal((await visit('graao.com', 'GET', `/api/auth/relay?host=atacante.com&to=${encodeURIComponent(supabase)}`)).status, 400);
  assert.equal((await visit('graao.com', 'GET', `/api/auth/relay?host=app.agencia.com.br&to=${encodeURIComponent('https://atacante.com/auth/v1/authorize')}`)).status, 400);
  assert.equal(jars['graao.com'].size, 0);
});

test('Logging in on graao.com itself keeps the old flow and drops a half-done relay', async () => {
  const { visit, jars } = setup();
  await visit('graao.com', 'GET', `/api/auth/relay?host=app.agencia.com.br&to=${encodeURIComponent('https://test.supabase.co/auth/v1/authorize?provider=google')}`);
  assert.ok(jars['graao.com'].get('go_google_relay'));
  const started = await visit('graao.com', 'POST', '/api/auth/google', { next: '/app' });
  assert.equal(new URL(started.json.url).searchParams.get('redirect_to'), 'https://graao.com/api/auth/callback/google');
  assert.equal(jars['graao.com'].has('go_google_relay'), false);
  const done = await visit('graao.com', 'GET', '/api/auth/callback/google?code=code-ana');
  assert.equal(done.location, '/app');
});
