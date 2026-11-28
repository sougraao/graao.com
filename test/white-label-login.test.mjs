// White Label: entrar com Google no domínio da agência (app.agencia.com.br). O Supabase só devolve o login para a
// graao.com (a única origem na lista dele), então antes o Google voltava para lá sem o verificador PKCE, que mora
// no cookie do domínio da agência, e a entrada falhava. Agora o graao.com só repassa o código para a agência.
//
// Segurança (auditoria P0, 27/11/2026): o repasse mandava o código do Google para qualquer domínio que uma agência
// tivesse salvo, sem verificação, e aceitava a URL do Supabase montada por quem fez o link. Uma agência que salvasse um
// domínio apontado para um servidor dela recebia o código de quem clicasse no link e entrava na conta dessa pessoa.
// Agora o repasse fica desligado sem GO_AUTH_RELAY=1, só vale para domínio que a hospedagem serve de verdade (conferido
// na ida e na volta) e a URL do Supabase é montada pelo servidor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseAuth } from '../auth.mjs';
import { createAuthRoutes } from '../routes/auth.mjs';
import { hostingDomains } from '../white-label.mjs';

const ana = { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', email: 'ana@example.com', email_confirmed_at: '2026-01-01', identities: [{ provider: 'google' }], user_metadata: { full_name: 'Ana' } };
const access = `t.${Buffer.from(JSON.stringify({ amr: [{ method: 'oauth' }] })).toString('base64url')}.t`;
const challenge = 'A'.repeat(43);   // desafio PKCE no formato do S256 (43 caracteres base64url)
const supabaseAuthorize = (query = {}) => `https://test.supabase.co/auth/v1/authorize?${new URLSearchParams({ provider: 'google', code_challenge: challenge, code_challenge_method: 's256', ...query })}`;

// relay: o valor de GO_AUTH_RELAY. served: os domínios que a hospedagem serve (na Vercel, verificados e com o DNS certo).
function setup(options = {}) {
  const { served = ['app.agencia.com.br'] } = options;
  const relay = 'relay' in options ? options.relay : true;
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
  // Duas agências: a Um com o domínio dela na hospedagem; a outra salvou evil.example, que aponta para um servidor dela.
  const agencies = {
    'app.agencia.com.br': { id: 'ag-1', state: { company: { domain: 'app.agencia.com.br', name: 'Agência Um' } } },
    'evil.example': { id: 'ag-2', state: { company: { domain: 'evil.example', name: 'Agência Dois' } } }
  };
  const store = { findAgency: async filter => agencies[filter.company.domain] || null };
  const checked = [];
  const hosting = { configured: true, serves: async host => { checked.push(host); return served.includes(host); } };
  const route = createAuthRoutes({
    auth, ready: Promise.resolve(), store, hosting, platformOrigin: 'https://graao.com',
    ...(relay === undefined ? {} : { relay }),
    error: (message, status) => Object.assign(new Error(message), { status }),
    payload: async req => req.body || {},
    accessContext: async () => ({ agency: { company: { name: 'Agência Um' } }, who: { owner: false } })
  });
  // Um navegador por domínio: cada um guarda só os próprios cookies, como no navegador de verdade.
  const jars = { 'app.agencia.com.br': new Map(), 'graao.com': new Map(), 'evil.example': new Map() };
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
  return { visit, jars, exchanged, served, checked };
}

// O código só pode sair do graao.com para um domínio que a hospedagem serve.
const leaves = out => typeof out.location === 'string' && /^https?:\/\//.test(out.location) && new URL(out.location).host !== 'graao.com';

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
  assert.equal((await visit('graao.com', 'GET', `/api/auth/relay?host=atacante.com&to=${encodeURIComponent(supabaseAuthorize())}`)).status, 400);
  assert.equal((await visit('graao.com', 'GET', `/api/auth/relay?host=app.agencia.com.br&to=${encodeURIComponent('https://atacante.com/auth/v1/authorize')}`)).status, 400);
  assert.equal(jars['graao.com'].size, 0);
});

test('Logging in on graao.com itself keeps the old flow and drops a half-done relay', async () => {
  const { visit, jars } = setup();
  await visit('graao.com', 'GET', `/api/auth/relay?host=app.agencia.com.br&to=${encodeURIComponent(supabaseAuthorize())}`);
  assert.ok(jars['graao.com'].get('go_google_relay'));
  const started = await visit('graao.com', 'POST', '/api/auth/google', { next: '/app' });
  assert.equal(new URL(started.json.url).searchParams.get('redirect_to'), 'https://graao.com/api/auth/callback/google');
  assert.equal(jars['graao.com'].has('go_google_relay'), false);
  const done = await visit('graao.com', 'GET', '/api/auth/callback/google?code=code-ana');
  assert.equal(done.location, '/app');
});

// ---- Regressão da auditoria P0 ---------------------------------------------------------------------------------------

test('P0: a domain an agency saved but the hosting does not serve never receives a code', async () => {
  const { visit, jars, exchanged } = setup();
  // O link que o atacante manda para a vítima, com o desafio PKCE dele.
  const link = `/api/auth/relay?host=evil.example&to=${encodeURIComponent(supabaseAuthorize())}`;
  assert.equal((await visit('graao.com', 'GET', link)).status, 400);
  assert.equal(jars['graao.com'].has('go_google_relay'), false);
  // Mesmo com o cookie de repasse plantado, a volta do Google fica no graao.com.
  jars['graao.com'].set('go_google_relay', 'evil.example');
  const back = await visit('graao.com', 'GET', '/api/auth/callback/google?code=code-vitima');
  assert.equal(leaves(back), false, `o código não pode sair do graao.com (foi para ${back.location})`);
  assert.equal(jars['graao.com'].has('go_google_relay'), false);
  assert.equal(exchanged.length, 0);
  // Login começado no próprio evil.example (se ele chegasse aqui) também não vira repasse.
  const started = await visit('evil.example', 'POST', '/api/auth/google', { next: '/app' });
  assert.notEqual(new URL(started.json.url, 'https://evil.example').pathname, '/api/auth/relay');
});

test('P0: the domain is checked again when the code comes back', async () => {
  const { visit, served } = setup();
  const started = await visit('app.agencia.com.br', 'POST', '/api/auth/google', { next: '/app' });
  const relay = new URL(started.json.url);
  await visit('graao.com', 'GET', relay.pathname + relay.search);
  served.length = 0;   // o DNS deixou de apontar para cá entre a ida e a volta
  const back = await visit('graao.com', 'GET', '/api/auth/callback/google?code=code-ana');
  assert.equal(leaves(back), false, `o código não pode sair do graao.com (foi para ${back.location})`);
});

test('P0: graao.com builds the Supabase address itself and keeps only the PKCE challenge', async () => {
  const { visit } = setup();
  const crafted = supabaseAuthorize({ redirect_to: 'https://evil.example/pega', scopes: 'email https://www.googleapis.com/auth/drive', extra: '1' });
  const out = await visit('graao.com', 'GET', `/api/auth/relay?host=app.agencia.com.br&to=${encodeURIComponent(crafted)}`);
  const target = new URL(out.location);
  assert.equal(target.origin + target.pathname, 'https://test.supabase.co/auth/v1/authorize');
  assert.equal(target.searchParams.get('redirect_to'), 'https://graao.com/api/auth/callback/google');
  assert.equal(target.searchParams.get('code_challenge'), challenge);
  assert.deepEqual([...target.searchParams.keys()].sort(), ['code_challenge', 'code_challenge_method', 'prompt', 'provider', 'redirect_to']);
  // Sem um desafio PKCE válido não há repasse.
  const bare = await visit('graao.com', 'GET', `/api/auth/relay?host=app.agencia.com.br&to=${encodeURIComponent('https://test.supabase.co/auth/v1/authorize?provider=google')}`);
  assert.equal(bare.status, 400);
});

test('P0: without GO_AUTH_RELAY=1 there is no relay and the agency domain sends people to graao.com', async () => {
  for (const relay of [undefined, false]) {
    const { visit, jars, checked } = setup({ relay });
    const started = await visit('app.agencia.com.br', 'POST', '/api/auth/google', { next: '/app' });
    assert.equal(started.json.url, 'https://graao.com/login?next=%2Fapp');
    assert.equal(jars['app.agencia.com.br'].has('go_google_flow'), false, 'nenhum fluxo pela metade no domínio da agência');
    assert.equal((await visit('graao.com', 'GET', `/api/auth/relay?host=app.agencia.com.br&to=${encodeURIComponent(supabaseAuthorize())}`)).status, 404);
    jars['graao.com'].set('go_google_relay', 'app.agencia.com.br');
    const back = await visit('graao.com', 'GET', '/api/auth/callback/google?code=code-ana');
    assert.equal(leaves(back), false, `o código não pode sair do graao.com (foi para ${back.location})`);
    assert.equal(jars['graao.com'].has('go_google_relay'), false, 'o cookie antigo de repasse é apagado');
    assert.deepEqual(checked, [], 'desligado, nem consulta a hospedagem');
    // O login no próprio graao.com continua igual.
    const own = await visit('graao.com', 'POST', '/api/auth/google', { next: '/app' });
    assert.equal(new URL(own.json.url).searchParams.get('redirect_to'), 'https://graao.com/api/auth/callback/google');
  }
});

test('P0: the hosting says a domain is served only when Vercel verified it and its DNS points here, reading only', async () => {
  const answer = (verified, misconfigured) => {
    const calls = [];
    const fetch = async (url, init) => {
      calls.push(init.method || 'GET');
      if (url.pathname.endsWith('/config')) return { ok: true, status: 200, json: async () => ({ misconfigured }) };
      return { ok: true, status: 200, json: async () => ({ verified }) };
    };
    return { hosting: hostingDomains({ token: 't', project: 'prj_1', fetch }), calls };
  };
  let probe = answer(true, false);
  assert.equal(await probe.hosting.serves('app.a.com.br'), true);
  assert.deepEqual(probe.calls, ['GET', 'GET'], 'só leitura: não pede nova verificação à Vercel');
  probe = answer(false, false);
  assert.equal(await probe.hosting.serves('app.a.com.br'), false);
  probe = answer(true, true);
  assert.equal(await probe.hosting.serves('app.a.com.br'), false);
  const missing = hostingDomains({ token: 't', project: 'prj_1', fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }) });
  assert.equal(await missing.serves('app.a.com.br'), false);
  assert.equal(await hostingDomains({ token: '', project: '', fetch: async () => { throw new Error('não deveria chamar'); } }).serves('app.a.com.br'), false);
  assert.equal(await probe.hosting.serves(''), false);
});
