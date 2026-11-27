import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { blank } from '../model.mjs';
import { publicBilling } from '../agency-billing-model.mjs';

const WS = '11111111-2222-4333-8444-555555555555';
const PAGE = '66666666-7777-4888-9999-aaaaaaaaaaaa';
const people = {
  root: { id: 'root-owner', email: 'dona@graao.test' },
  nova: { id: 'u1', email: 'nova@agencia.test' },
  convidado: { id: 'u2', email: 'convidado@agencia.test' }
};

const LINE = { number: '5500000000000', instance: 'graao-verify', secret: 'segredo-de-teste' };

async function boot(t, options = {}) {
  const store = createSqliteStore(':memory:');
  const auth = {
    user: async req => people[req.headers['x-test-user']] || null,
    hasSession: req => Boolean(people[req.headers['x-test-user']]),
    session: async req => people[req.headers['x-test-user']] || null
  };
  const { server, host, ready } = makeServer({ store, auth, agencyOwnerId: 'root-owner', allowLocalAccess: false, port: 0, socialScheduler: false, phoneVerify: LINE, ...options });
  await ready;
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const get = async (path, who) => {
    const r = await fetch(base + path, { headers: who ? { 'x-test-user': who } : {} });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return { store, get };
}

test('Agência nova fica fechada até confirmar o celular, mas vê a própria tela de agência', async t => {
  const { get } = await boot(t);
  const agency = await get('/api/agency', 'nova');
  assert.equal(agency.status, 200, JSON.stringify(agency.body));
  assert.equal(agency.body.billing.status, 'Unverified');
  assert.equal(agency.body.gate?.code, 'PHONE_REQUIRED', 'a tela da agência diz ao app para mostrar a confirmação');
  const blocked = await get('/api/workspaces', 'nova');
  assert.equal(blocked.status, 402);
  assert.equal(blocked.body.code, 'PHONE_REQUIRED');
  assert.equal(blocked.body.billing.status, 'Unverified');
});

test('A agência da graao é isenta e segue aberta', async t => {
  const { get } = await boot(t);
  const workspaces = await get('/api/workspaces', 'root');
  assert.equal(workspaces.status, 200, JSON.stringify(workspaces.body));
  assert.equal((await get('/api/agency', 'root')).body.billing.status, 'Exempt');
});

test('Convidado de agência ainda não ativada recebe o aviso do responsável', async t => {
  const { store, get } = await boot(t);
  await get('/api/agency', 'nova');
  await store.change('agency-u1', state => {
    state.users.push({ id: 'm2', first: 'Con', last: 'Vidado', email: 'convidado@agencia.test', role: 'Agency User', loginEnabled: true });
  });
  const denied = await get('/api/workspaces', 'convidado');
  assert.equal(denied.status, 402);
  assert.equal(denied.body.code, 'AGENCY_NOT_ACTIVE');
  assert.equal(denied.body.error, 'A agência ainda não foi ativada pelo responsável.');
});

test('Página pública de subconta de agência sem celular confirmado continua no ar', async t => {
  const { store, get } = await boot(t);
  await get('/api/agency', 'nova');
  const page = { id: PAGE, name: 'Oferta', active: true, slug: 'oferta', blocks: [] };
  await store.insert(WS, { ...blank(), agencyId: 'agency-u1', pages: [page] });
  await store.change('agency-u1', state => { state.accounts[WS] = { name: 'Cliente', status: 'Active' }; });
  const view = await get(`/api/view/p/${WS}/${PAGE}`);
  assert.equal(view.status, 200, JSON.stringify(view.body));
});

test('Sem a linha de confirmação, a agência que já existe segue aberta', async t => {
  const { store, get } = await boot(t, { phoneVerify: { number: '', instance: '', secret: '' } });
  const agency = await get('/api/agency', 'nova');
  assert.equal(agency.status, 200, JSON.stringify(agency.body));
  assert.equal((await store.load('agency-u1')).billing.status, 'Unverified');
  assert.equal(agency.body.gate, null);
  const list = await get('/api/workspaces', 'nova');
  assert.equal(list.status, 200, JSON.stringify(list.body));
});

test('Sem a linha de confirmação no ar, o cadastro de agência nova fica fechado', async t => {
  const { store, get } = await boot(t, { phoneVerify: { number: '', instance: '', secret: '' }, signupOpen: false });
  const closed = await get('/api/agency', 'nova');
  assert.equal(closed.status, 503);
  assert.equal(closed.body.code, 'SIGNUP_CLOSED');
  await assert.rejects(async () => store.load('agency-u1'), /not found/i, 'nenhuma agência foi criada');
  const root = await get('/api/agency', 'root');
  assert.equal(root.status, 200, 'a agência da graao continua entrando');
});

test('A cobrança pública não mostra o celular inteiro', () => {
  const view = publicBilling({ status: 'Trial', trialEndsAt: '2026-12-16T12:00:00.000Z', extended: false, plan: 'Starter', phone: '5531981234567', subscription: { id: 'sub_x', status: 'ACTIVE', planId: 'starter', nextChargeAt: '2027-01-01', cancelAt: '', secret: 'x' }, verify: { hash: 'h' } }, new Date('2026-12-13T12:00:00Z'));
  assert.deepEqual(view, { status: 'Trial', trialEndsAt: '2026-12-16T12:00:00.000Z', extended: false, daysLeft: 3, plan: 'Starter', phone: '•••• 4567',
    subscription: { status: 'ACTIVE', planId: 'starter', nextChargeAt: '2027-01-01', cancelAt: '' } });
});
