// Segurança (auditoria, item 9): convidar um e-mail colocava a pessoa dentro da agência no primeiro login, sem ela
// saber nem aceitar. No graao.com quem foi convidado agora escolhe: entrar como membro ou criar a própria agência.
// No domínio da agência continua entrando direto (ela foi lá de propósito). Quem já era membro antes não vê a escolha.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { gateView } from '../ui/verify.js';

const DOMAIN = 'app.agencia.test';
const people = {
  dona: { id: 'u1', email: 'dona@agencia.test', name: 'Dona' },
  convidada: { id: 'u2', email: 'convidada@gmail.test', name: 'Convidada' },
  antiga: { id: 'u3', email: 'antiga@gmail.test', name: 'Antiga' }
};

async function boot(t) {
  const store = createSqliteStore(':memory:');
  const auth = {
    user: async req => people[req.headers['x-test-user']] || null,
    hasSession: req => Boolean(people[req.headers['x-test-user']]),
    session: async req => people[req.headers['x-test-user']] || null
  };
  const { server, host, ready } = makeServer({ store, auth, agencyOwnerId: 'root-owner', allowLocalAccess: false, port: 0, socialScheduler: false });
  await ready;
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, who, { body, domain } = {}) => {
    const headers = { 'x-test-user': who, ...(domain ? { 'x-forwarded-host': domain } : {}), ...(body ? { 'content-type': 'application/json' } : {}) };
    const r = await fetch(base + path, body ? { method: 'POST', headers, body: JSON.stringify(body) } : { headers });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  // A dona abre a agência e convida pela tela de usuários, como no app.
  assert.equal((await call('/api/agency', 'dona')).status, 200);
  await store.change('agency-u1', state => { state.company.name = 'Agência Um'; state.company.domain = DOMAIN; });
  const invited = await call('/api/agency/action', 'dona', { body: { type: 'save', key: 'users', data: { first: 'Pessoa', last: 'Convidada', email: 'convidada@gmail.test', role: 'Agency User' } } });
  assert.equal(invited.status, 200, JSON.stringify(invited.body));
  const member = async email => (await store.load('agency-u1')).users.find(user => user.email === email);
  return { store, call, member };
}

test('Convidada no graao.com não entra na agência sem aceitar; depois de aceitar, entra', async t => {
  const { store, call, member } = await boot(t);
  const asked = await call('/api/workspaces', 'convidada');
  assert.equal(asked.status, 409, JSON.stringify(asked.body));
  assert.equal(asked.body.code, 'INVITE_PENDING');
  assert.equal(asked.body.agency, 'Agência Um');
  await assert.rejects(async () => store.load('agency-u2'), /Workspace not found/, 'perguntar não cria agência');
  assert.equal((await member('convidada@gmail.test')).invitePending, true);

  const accepted = await call('/api/invite/accept', 'convidada', { body: {} });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal((await member('convidada@gmail.test')).invitePending, undefined);
  const inside = await call('/api/agency', 'convidada');
  assert.equal(inside.status, 200, JSON.stringify(inside.body));
  assert.equal(inside.body.agency.company.name, 'Agência Um');
});

test('Quem escolhe criar a própria agência fica com ela e não volta a ver o convite', async t => {
  const { store, call, member } = await boot(t);
  assert.equal((await call('/api/workspaces', 'convidada')).body.code, 'INVITE_PENDING');
  const own = await call('/api/invite/decline', 'convidada', { body: {} });
  assert.equal(own.status, 200, JSON.stringify(own.body));
  assert.ok(await store.load('agency-u2'), 'a agência própria foi criada');
  const next = await call('/api/agency', 'convidada');
  assert.equal(next.status, 200);
  assert.notEqual(next.body.agency.company.name, 'Agência Um');
  assert.equal((await member('convidada@gmail.test')).invitePending, true, 'a agência que convidou continua vendo o convite como não aceito');
});

test('No domínio da agência a convidada entra direto e o convite fica aceito', async t => {
  const { call, member } = await boot(t);
  const there = await call('/api/workspaces', 'convidada', { domain: DOMAIN });
  assert.equal(there.status, 200, JSON.stringify(there.body));
  assert.equal((await member('convidada@gmail.test')).invitePending, undefined);
  assert.equal((await call('/api/workspaces', 'convidada')).status, 200, 'depois, no graao.com, também entra sem perguntar');
});

test('Membro liberado antes da mudança (sem marca de convite) entra como sempre', async t => {
  const { store, call } = await boot(t);
  await store.change('agency-u1', state => { state.users.push({ id: 'm9', first: 'Pessoa', last: 'Antiga', email: 'antiga@gmail.test', role: 'Agency User', loginEnabled: true }); });
  assert.equal((await call('/api/workspaces', 'antiga')).status, 200);
});

test('Editar um membro não recria o convite; trocar o e-mail sim', async t => {
  const { call, member } = await boot(t);
  await call('/api/invite/accept', 'convidada', { body: {} });
  const { id } = await member('convidada@gmail.test');
  await call('/api/agency/action', 'dona', { body: { type: 'save', key: 'users', id, data: { first: 'Nome', last: 'Novo', email: 'convidada@gmail.test', role: 'Agency User' } } });
  assert.equal((await member('convidada@gmail.test')).invitePending, undefined);
  await call('/api/agency/action', 'dona', { body: { type: 'save', key: 'users', id, data: { first: 'Nome', last: 'Novo', email: 'antiga@gmail.test', role: 'Agency User' } } });
  assert.equal((await member('antiga@gmail.test')).invitePending, true);
});

test('A tela do convite oferece as duas escolhas', () => {
  const html = gateView({ code: 'INVITE_PENDING', agency: 'Agência <Um>', error: 'x' }, undefined, null);
  assert.match(html, /Agência &lt;Um&gt; convidou você/);
  assert.match(html, /data-vf-invite="accept"[^>]*>Entrar como membro</);
  assert.match(html, /data-vf-invite="own"[^>]*>Criar minha agência</);
});
