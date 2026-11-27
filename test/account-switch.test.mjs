// Troca rápida de conta: várias contas Google conectadas no mesmo navegador (auth.mjs + routes/auth.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ACCOUNTS, createSupabaseAuth } from '../auth.mjs';
import { createAuthRoutes } from '../routes/auth.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';
import { makeServer } from '../server.mjs';

const hex = 'abcdef0123456789';
const people = Object.fromEntries(['ana', 'bia', 'caio', 'duda', 'eva', 'fabio', 'gil'].map((name, k) => [name, {
  id: `${hex[k].repeat(8)}-${hex[k].repeat(4)}-4${hex[k].repeat(3)}-a${hex[k].repeat(3)}-${hex[k].repeat(12)}`,
  email: `${name}@example.com`, email_confirmed_at: '2026-01-01', identities: [{ provider: 'google' }],
  user_metadata: { full_name: name[0].toUpperCase() + name.slice(1), avatar_url: `https://img.example/${name}.png` }
}]));

// Provedor falso com a semântica do Supabase que importa aqui: cada login é uma sessão, o refresh gira o
// token e revogar a sessão derruba o access e o refresh dela.
function provider({ now = () => Date.now(), checkEvery = 0 } = {}) {
  const sessions = [];
  const fake = { sessions, calls: [], down: false };
  const issue = row => {
    const claims = Buffer.from(JSON.stringify({ sub: row.user.id, n: ++row.turn, sid: row.sid, amr: [{ method: 'oauth' }] })).toString('base64url');
    row.access = `test.${claims}.test`;
    row.refresh = `r-${row.sid}-${row.turn}`;
    return { access_token: row.access, refresh_token: row.refresh, expires_in: 3600, user: row.user };
  };
  fake.revoke = name => { for (const row of sessions) if (row.user === people[name]) row.dead = true; };
  fake.alive = name => sessions.filter(row => row.user === people[name] && !row.dead).length;
  fake.auth = createSupabaseAuth({ projectUrl: 'https://test.supabase.co', publishableKey: 'k', now, checkEvery, async request(url, options) {
    const path = url.pathname.replace('/auth/v1/', '');
    fake.calls.push(path);
    if (fake.down) return Response.json({}, { status: 503 });
    const input = options.body && JSON.parse(options.body), token = options.headers.Authorization?.slice(7);
    if (path === 'settings') return Response.json({ external: { google: true } });
    if (path === 'user') {
      const row = sessions.find(s => s.access === token && !s.dead);
      return row ? Response.json(row.user) : Response.json({}, { status: 403 });
    }
    if (path === 'logout') {
      assert.equal(url.searchParams.get('scope'), 'local');
      const row = sessions.find(s => s.access === token);
      if (row) row.dead = true;
      return new Response(null, { status: 204 });
    }
    assert.equal(path, 'token');
    if (url.searchParams.get('grant_type') === 'pkce') {
      const row = { sid: sessions.length + 1, turn: 0, user: people[input.auth_code] };
      if (!row.user) return Response.json({}, { status: 400 });
      sessions.push(row);
      return Response.json(issue(row));
    }
    const row = sessions.find(s => s.refresh === input.refresh_token && !s.dead);
    return row ? Response.json(issue(row)) : Response.json({}, { status: 400 });
  } });
  return fake;
}

// Navegador de brinquedo: guarda e devolve cookies como um navegador de verdade.
function browser(base) {
  const jar = new Map();
  const self = {
    jar, lines: [],
    cookie: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
    async request(path, { body, headers = {} } = {}) {
      const response = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'manual',
        headers: { ...(jar.size && { Cookie: self.cookie() }), ...(body !== undefined && { 'Content-Type': 'application/json' }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      self.lines = response.headers.getSetCookie();
      for (const line of self.lines) {
        const [pair] = line.split(';', 1), at = pair.indexOf('='), name = pair.slice(0, at), value = pair.slice(at + 1);
        if (/Max-Age=0/.test(line) || !value) jar.delete(name); else jar.set(name, value);
      }
      const text = await response.text();
      let data = null;
      try { data = JSON.parse(text); } catch { /* página */ }
      return { status: response.status, data, location: response.headers.get('location'), headers: response.headers };
    },
    get: (path, headers) => self.request(path, { headers }),
    post: (path, body = {}, headers) => self.request(path, { body, headers }),
    async login(name, input = {}) {
      const start = await self.post('/api/auth/google', { next: '/app', ...input });
      assert.equal(start.status, 200, JSON.stringify(start.data));
      return { url: new URL(start.data.url), back: await self.get(`/api/auth/callback/google?code=${name}`) };
    },
    accounts: async () => (await self.get('/api/auth/accounts')).data,
    switchTo: name => self.post('/api/auth/switch', { id: people[name].id }),
    whoami: async () => { const r = await self.get('/api/agency'); return r.data?.access?.session?.email || r.status; }
  };
  return self;
}

async function start(t, options) {
  const fake = provider(options);
  const { server, host, ready } = makeServer({ dbPath: ':memory:', port: 0, auth: fake.auth, allowLocalAccess: false, socialScheduler: false });
  await ready;
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  return { fake, base, page: browser(base) };
}

test('adicionar conta abre o seletor do Google e mantém a conta anterior conectada', async t => {
  const { page } = await start(t);
  const first = await page.login('ana');
  assert.equal(first.back.location, '/app#agency/dashboard');
  assert.equal(first.url.searchParams.get('prompt'), 'select_account');
  const second = await page.login('bia', { add: true });
  assert.equal(second.url.searchParams.get('prompt'), 'select_account');
  assert.equal(second.back.location, '/app#agency/dashboard');
  const list = await page.accounts();
  assert.equal(list.current.email, 'bia@example.com');
  assert.equal(list.max, MAX_ACCOUNTS);
  assert.deepEqual(list.others.map(a => [a.email, a.name, a.picture, a.agency, a.connected]),
    [['ana@example.com', 'Ana', 'https://img.example/ana.png', 'Minha agência', true]]);
  assert.equal(await page.whoami(), 'bia@example.com');
  assert.doesNotMatch(JSON.stringify(list), /r-\d+-\d+|test\./, 'nenhum token sai na lista');
});

test('os cookies das contas são HttpOnly, SameSite=Lax e, em HTTPS, __Host- com Secure', async t => {
  const { page, fake } = await start(t);
  await page.login('ana');
  const own = page.lines.filter(line => /go_(access|account|active)/.test(line) && !/Max-Age=0/.test(line));
  assert.equal(own.length, 3);
  for (const line of own) assert.match(line, /Path=\/; HttpOnly; SameSite=Lax/);
  const res = { lines: [], getHeader() { return this.lines; }, setHeader(_, value) { this.lines = value; } };
  await fake.auth.google({ headers: {}, socket: { encrypted: true } }, res, 'https://graao.com', '/app');
  assert.match(res.lines.join('\n'), /^__Host-go_google_flow=.*; Secure$/m);
});

test('trocar de conta entra na hora, sem passar pelo Google, e volta', async t => {
  const { page, fake } = await start(t);
  await page.login('ana'); await page.login('bia', { add: true });
  fake.calls.length = 0;
  const swap = await page.switchTo('ana');
  assert.equal(swap.status, 200);
  assert.deepEqual(swap.data, { ok: true, url: '/app#agency/dashboard' });
  assert.ok(!fake.calls.includes('settings'));
  assert.equal(await page.whoami(), 'ana@example.com');
  assert.equal((await page.switchTo('bia')).status, 200);
  assert.equal(await page.whoami(), 'bia@example.com');
  assert.deepEqual((await page.accounts()).others.map(a => a.email), ['ana@example.com']);
});

test('só troca para conta deste navegador', async t => {
  const { page, base } = await start(t);
  const other = browser(base);
  await other.login('caio');
  await page.login('ana'); await page.login('bia', { add: true });
  assert.equal((await page.switchTo('caio')).status, 404);
  for (const id of ['', 'x', null, 5, '../', '__proto__']) assert.equal((await page.post('/api/auth/switch', { id })).status, 404, String(id));
  // Cookie forjado com o id de outra pessoa e um token próprio: o dono do token tem de ser o da entrada.
  const bia = page.jar.get('go_account_' + people.bia.id);
  page.jar.set('go_account_' + people.caio.id, bia);
  assert.equal((await page.switchTo('caio')).status, 401);
  assert.notEqual(await page.whoami(), 'caio@example.com');
  page.jar.set('go_account_' + people.duda.id, 'lixo');
  assert.equal((await page.switchTo('duda')).status, 404);
  assert.equal(await other.whoami(), 'caio@example.com');
});

test('ponteiro forjado para outra conta não abre a conta', async t => {
  const { page } = await start(t);
  await page.login('ana');
  page.jar.set('go_active', people.caio.id);
  page.jar.set('go_access_' + people.caio.id, page.jar.get('go_access_' + people.ana.id));
  assert.equal(await page.whoami(), 401);
});

test('a troca, a remoção e a saída recusam outra origem e o método GET', async t => {
  const { page } = await start(t);
  await page.login('ana'); await page.login('bia', { add: true });
  for (const op of ['switch', 'remove', 'logout']) {
    const body = { id: people.ana.id };
    assert.equal((await page.post('/api/auth/' + op, body, { Origin: 'https://evil.example' })).status, 403, op);
    assert.equal((await page.post('/api/auth/' + op, body, { 'Sec-Fetch-Site': 'cross-site' })).status, 403, op);
    assert.equal((await page.get('/api/auth/' + op)).status, 404, op);
  }
  assert.equal(await page.whoami(), 'bia@example.com');
  assert.equal((await page.accounts()).others.length, 1);
});

test('sessão revogada em outro lugar derruba a conta e pede o Google só para ela, com o e-mail sugerido', async t => {
  const { page, fake } = await start(t);
  await page.login('ana'); await page.login('bia', { add: true });
  fake.revoke('ana');
  assert.equal((await page.accounts()).others[0].connected, false);
  const swap = await page.switchTo('ana');
  assert.equal(swap.status, 401);
  assert.equal(swap.data.code, 'ACCOUNT_SIGNED_OUT');
  assert.equal(await page.whoami(), 'bia@example.com');
  const again = await page.login('ana', { account: people.ana.id });
  assert.equal(again.url.searchParams.get('login_hint'), 'ana@example.com');
  assert.equal(again.url.searchParams.get('prompt'), null);
  assert.equal(await page.whoami(), 'ana@example.com');
  assert.deepEqual((await page.accounts()).others.map(a => [a.email, a.connected]), [['bia@example.com', true]]);
});

test('revogação descoberta na própria troca também não derruba a conta atual', async t => {
  const { page, fake } = await start(t);
  await page.login('ana'); await page.login('bia', { add: true });
  fake.revoke('ana');
  assert.equal((await page.switchTo('ana')).status, 401);
  assert.equal(await page.whoami(), 'bia@example.com');
  assert.equal((await page.accounts()).others[0].connected, false);
});

test('conta parada há mais de 30 dias expira', async t => {
  let clock = Date.now();
  const { page } = await start(t, { now: () => clock });
  await page.login('ana');
  clock += 20 * 86400_000;
  await page.login('bia', { add: true });
  clock += 11 * 86400_000;
  const [row] = (await page.accounts()).others;
  assert.deepEqual([row.email, row.connected], ['ana@example.com', false]);
  assert.equal((await page.switchTo('ana')).status, 401);
});

test('sugestão de e-mail só sai de conta já conectada neste navegador', async t => {
  const { page } = await start(t);
  await page.login('ana');
  const { url } = await page.login('bia', { account: people.caio.id, email: 'alvo@example.com' });
  assert.equal(url.searchParams.get('login_hint'), null);
});

test('remover tira a conta da lista e encerra a sessão dela; a atual não se remove por aqui', async t => {
  const { page, fake } = await start(t);
  await page.login('ana'); await page.login('bia', { add: true });
  assert.equal((await page.post('/api/auth/remove', { id: people.bia.id })).status, 400);
  assert.equal((await page.post('/api/auth/remove', { id: people.caio.id })).status, 404);
  assert.equal((await page.post('/api/auth/remove', { id: people.ana.id })).status, 200);
  assert.equal(fake.alive('ana'), 0);
  assert.deepEqual((await page.accounts()).others, []);
  assert.equal(await page.whoami(), 'bia@example.com');
  assert.equal((await page.switchTo('ana')).status, 404);
});

test('sair encerra só a conta atual e passa para a usada por último', async t => {
  let clock = Date.now();
  const { page, fake } = await start(t, { now: () => clock });
  for (const name of ['ana', 'bia', 'caio']) { await page.login(name, { add: true }); clock += 60_000; }
  const out = await page.post('/api/auth/logout');
  assert.equal(out.status, 200);
  assert.deepEqual(out.data, { ok: true, url: '/app#agency/dashboard', account: people.bia.id });
  assert.equal(fake.alive('caio'), 0);
  assert.equal(fake.alive('ana'), 1);
  assert.equal(await page.whoami(), 'bia@example.com');
  assert.deepEqual((await page.accounts()).others.map(a => a.email), ['ana@example.com']);
});

test('sair pula conta já encerrada; sem nenhuma que valha, vai para o login', async t => {
  const { page, fake } = await start(t);
  for (const name of ['ana', 'bia']) await page.login(name, { add: true });
  fake.revoke('ana');
  const out = await page.post('/api/auth/logout');
  assert.deepEqual(out.data, { ok: true, url: '/login' });
  assert.equal((await page.get('/api/agency')).status, 401);
  assert.equal((await page.get('/app')).location, '/login?next=%2Fapp');
  const list = await page.accounts();
  assert.equal(list.current, null);
  assert.deepEqual(list.others.map(a => [a.email, a.connected]), [['ana@example.com', false]]);
});

test('sair de todas encerra todas as sessões e apaga todos os cookies, mesmo com o provedor fora do ar', async t => {
  const { page, fake } = await start(t);
  for (const name of ['ana', 'bia', 'caio']) await page.login(name, { add: true });
  const out = await page.post('/api/auth/logout', { all: true });
  assert.deepEqual(out.data, { ok: true, url: '/login' });
  for (const name of ['ana', 'bia', 'caio']) assert.equal(fake.alive(name), 0, name);
  assert.equal(page.jar.size, 0);

  await page.login('ana'); await page.login('bia', { add: true });
  fake.down = true;
  assert.equal((await page.post('/api/auth/logout', { all: true })).status, 503);
  assert.equal(page.jar.size, 0);
});

test('há um limite de contas por navegador', async t => {
  const { page, fake } = await start(t);
  const names = Object.keys(people);
  for (const name of names.slice(0, MAX_ACCOUNTS)) await page.login(name, { add: true });
  const extra = names[MAX_ACCOUNTS];
  const refused = await page.post('/api/auth/google', { next: '/app', add: true });
  assert.equal(refused.status, 409);
  assert.match(refused.data.error, new RegExp(String(MAX_ACCOUNTS)));
  // Entrando pelo /login o servidor só sabe quem é no retorno: recusa e encerra a sessão recém-criada.
  const { back } = await page.login(extra);
  assert.equal(back.location, '/app?conta=limite');
  assert.equal(fake.alive(extra), 0);
  assert.equal(await page.whoami(), `${names[MAX_ACCOUNTS - 1]}@example.com`);
  // Uma conta encerrada cede o lugar; entrar de novo numa conta da lista nunca esbarra no limite.
  fake.revoke(names[1]);
  await page.accounts();
  assert.equal((await page.login(extra)).back.location, '/app#agency/dashboard');
  assert.equal((await page.login(names[0])).back.location, '/app#agency/dashboard');
  assert.equal((await page.accounts()).others.length, MAX_ACCOUNTS - 1);
});

test('desistir no Google ao adicionar conta volta para a conta que já estava aberta', async t => {
  const { page } = await start(t);
  await page.login('ana');
  await page.post('/api/auth/google', { next: '/app', add: true });
  assert.equal((await page.get('/api/auth/callback/google?error=access_denied')).location, '/app?conta=erro');
  assert.equal(await page.whoami(), 'ana@example.com');
});

test('aba presa na conta anterior não lê nem grava como a nova conta', async t => {
  const { page } = await start(t);
  await page.login('ana');
  const stale = { 'X-Graao-Account': people.ana.id };
  assert.equal((await page.get('/api/agency', stale)).status, 200);
  await page.login('bia', { add: true });
  for (const call of [() => page.get('/api/agency', stale), () => page.post('/api/workspaces', { name: 'Gravado na conta errada' }, stale)]) {
    const blocked = await call();
    assert.equal(blocked.status, 409);
    assert.equal(blocked.data.code, 'ACCOUNT_CHANGED');
    assert.equal(blocked.headers.get('x-graao-account-changed'), '1');
  }
  assert.deepEqual((await page.get('/api/workspaces', { 'X-Graao-Account': people.bia.id })).data.workspaces, []);
});

test('renovação atrasada da conta anterior não devolve o navegador para ela', async t => {
  const { page, base } = await start(t);
  await page.login('ana');
  const late = browser(base);
  for (const [k, v] of page.jar) late.jar.set(k, v);
  late.jar.delete('go_access_' + people.ana.id);   // o access venceu: a requisição vai renovar
  await page.login('bia', { add: true });
  assert.equal(await late.whoami(), 'ana@example.com');
  for (const line of late.lines) assert.doesNotMatch(line, /^go_active=/);
  for (const [k, v] of late.jar) if (k.includes(people.ana.id)) page.jar.set(k, v);
  assert.equal(await page.whoami(), 'bia@example.com');
  assert.equal((await page.switchTo('ana')).status, 200);
});

test('sessão no formato antigo (um cookie por navegador) continua valendo e vira conta da lista', async t => {
  const { page, fake } = await start(t);
  await page.login('ana');
  const legacy = row => { page.jar.clear(); page.jar.set('go_access', row.access); page.jar.set('go_refresh', row.refresh); };
  legacy(fake.sessions.at(-1));
  assert.equal(await page.whoami(), 'ana@example.com');
  assert.ok(![...page.jar.keys()].some(k => k === 'go_access' || k === 'go_refresh'));
  await page.login('bia', { add: true });
  assert.deepEqual((await page.accounts()).others.map(a => [a.email, a.connected]), [['ana@example.com', true]]);
  assert.equal((await page.switchTo('ana')).status, 200);
  // Direto do formato antigo para "Adicionar conta", sem nenhuma chamada no meio.
  page.jar.clear();
  await page.login('caio');
  legacy(fake.sessions.at(-1));
  await page.login('bia', { add: true });
  assert.deepEqual((await page.accounts()).others.map(a => a.email), ['caio@example.com']);
});

test('a conferência das outras contas não gira o token a cada abertura do menu', async t => {
  const { page, fake } = await start(t, { checkEvery: 60_000 });
  await page.login('ana'); await page.login('bia', { add: true });
  fake.calls.length = 0;
  await page.accounts(); await page.accounts();
  assert.equal(fake.calls.filter(c => c === 'token').length, 0);
});

test('provedor fora do ar não apaga nenhuma conta da lista', async t => {
  const { page, fake } = await start(t);
  await page.login('ana'); await page.login('bia', { add: true });
  const before = page.cookie();
  fake.down = true;
  assert.equal((await page.switchTo('ana')).status, 503);
  assert.equal(page.cookie(), before);
  fake.down = false;
  assert.equal((await page.switchTo('ana')).status, 200);
});

test('a entrada da equipe no portal do cliente não passa para a conta trocada', async t => {
  const { page } = await start(t);
  await page.login('ana');
  const { data: { id } } = await page.post('/api/workspaces', { name: 'Cliente' });
  assert.equal((await page.post(`/api/client-portal/${id}/admin-enter`)).status, 200);
  assert.equal((await page.get(`/api/client-portal/${id}/home`)).data.signedIn, true);
  await page.login('bia', { add: true });
  assert.notEqual((await page.get(`/api/client-portal/${id}/home`)).data.signedIn, true);
  await page.switchTo('ana');
  assert.equal((await page.get(`/api/client-portal/${id}/home`)).data.signedIn, true);
});

test('rotas de conta devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const route = createAuthRoutes({ auth: null });
  for (const p of ['/api/state', '/api/authx', '/login']) assert.equal(await route({ p, method: 'GET' }), NEXT_ROUTE, p);
});
