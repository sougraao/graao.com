import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSupabaseAuth } from '../auth.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { TRASH_DAYS, trashExpired, trashList } from '../agency-model.mjs';
import { createR2 } from '../r2-storage.mjs';

const oauthClaims = Buffer.from(JSON.stringify({ amr: [{ method: 'oauth' }] })).toString('base64url');
const identity = email => ({ id: randomUUID(), email, email_confirmed_at: '2026-11-18', identities: [{ provider: 'google' }] });
const tokenFor = user => `${user.id}.${oauthClaims}.signature`;
const DAY = 86_400_000;

async function start(t, options = {}) {
  const owner = identity('owner-a@example.test');
  const other = identity('owner-b@example.test');
  const users = new Map([owner, other].map(user => [tokenFor(user), user]));
  const auth = createSupabaseAuth({
    projectUrl: 'https://test.supabase.co', publishableKey: 'test',
    async request(url, options) {
      const user = users.get(options.headers.Authorization?.slice(7));
      return user ? Response.json(user) : Response.json({}, { status: 401 });
    }
  });
  const store = createSqliteStore(':memory:');
  const { server, host, ready, purgeTrash } = makeServer({ store, auth, agencyOwnerId: owner.id, allowLocalAccess: false, socialScheduler: false, port: 0, ...options });
  await ready;
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, { user, body } = {}) => {
    const response = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Cookie: `go_access=${tokenFor(user)}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json() };
  };
  const created = await call('/api/workspaces', { user: owner, body: { name: 'Padaria Sol' } });
  assert.equal(created.status, 201, created.body.error);
  return { store, owner, other, call, purgeTrash, workspace: created.body.id };
}

test('Excluir subconta: confirma pelo nome, some de tudo, pode ser restaurada e é apagada depois de 30 dias', async t => {
  const { store, owner, other, call, purgeTrash, workspace } = await start(t);
  const action = body => call('/api/agency/action', { user: owner, body });
  const listed = async () => (await call('/api/workspaces', { user: owner })).body.workspaces.map(w => w.id);
  assert.equal((await call(`/api/action?workspace=${workspace}`, { user: owner, body: { type: 'save', key: 'contacts', data: { name: 'Cliente fiel' } } })).status, 200);
  const before = store.load(workspace);

  const wrong = await action({ type: 'account-trash', id: workspace, data: { confirm: 'padaria sol' } });
  assert.equal(wrong.status, 400);
  assert.match(wrong.body.error, /Digite o nome/);
  assert.equal((await call('/api/agency/action', { user: other, body: { type: 'account-trash', id: workspace, data: { confirm: 'Padaria Sol' } } })).status, 404);
  assert.ok((await listed()).includes(workspace));

  const trashed = await action({ type: 'account-trash', id: workspace, data: { confirm: 'Padaria Sol' } });
  assert.equal(trashed.status, 200, trashed.body.error);
  assert.ok(!(await listed()).includes(workspace));
  assert.ok(!trashed.body.overview.accounts.some(a => a.id === workspace));
  assert.deepEqual(trashed.body.trash.map(row => [row.id, row.name]), [[workspace, 'Padaria Sol']]);
  assert.equal((await call(`/api/state?workspace=${workspace}`, { user: owner })).status, 404);
  assert.equal((await action({ type: 'account-meta', id: workspace, data: { status: 'Active' } })).status, 404);
  assert.equal(store.load('agency').accounts[workspace].status, 'Closed');

  assert.deepEqual(await purgeTrash('agency', Date.now() + (TRASH_DAYS - 1) * DAY), []);
  const restored = await action({ type: 'account-restore', id: workspace });
  assert.equal(restored.status, 200, restored.body.error);
  assert.deepEqual(restored.body.trash, []);
  assert.ok((await listed()).includes(workspace));
  assert.equal(store.load('agency').accounts[workspace].status, 'Active');
  assert.deepEqual(store.load(workspace).contacts, before.contacts);
  assert.equal((await call(`/api/state?workspace=${workspace}`, { user: owner })).status, 200);

  assert.equal((await action({ type: 'account-trash', id: workspace, data: { confirm: 'Padaria Sol' } })).status, 200);
  assert.deepEqual(await purgeTrash('agency', Date.now() + (TRASH_DAYS + 1) * DAY), [workspace]);
  assert.throws(() => store.load(workspace), { status: 404 });
  const agency = store.load('agency');
  assert.equal(agency.accounts[workspace], undefined);
  assert.ok(agency.audit.some(row => row.action === 'Sub-account permanently deleted' && row.target === 'Padaria Sol'));
  assert.deepEqual((await call('/api/agency', { user: owner })).body.trash, []);
  assert.equal(exists(store, 'whatsapp-agency'), false, 'a exclusão criou a linha do WhatsApp de uma agência sem WhatsApp');
});

test('Excluir subconta: uma assinatura de plano em andamento precisa ser cancelada antes', async t => {
  const { store, owner, call, workspace } = await start(t);
  store.change('agency', agency => { agency.accounts[workspace].billing = { status: 'Active' }; });
  const response = await call('/api/agency/action', { user: owner, body: { type: 'account-trash', id: workspace, data: { confirm: 'Padaria Sol' } } });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /Cancele a cobrança/);
  assert.equal(store.load('agency').accounts[workspace].trash, undefined);
});

test('Lixeira: lista da mais recente para a mais antiga e vence em 30 dias', () => {
  const agency = { accounts: {
    a: { name: 'Antiga', trash: { at: '2026-10-01T00:00:00.000Z', by: 'Ana' } },
    b: { name: 'Nova', trash: { at: '2026-11-20T00:00:00.000Z', by: 'Bia' } },
    c: { name: 'Ativa' }
  } };
  assert.deepEqual(trashList(agency).map(row => row.id), ['b', 'a']);
  assert.equal(trashList(agency)[1].purgeAt, '2026-10-31T00:00:00.000Z');
  assert.deepEqual(trashExpired(agency, Date.parse('2026-11-25T00:00:00.000Z')), ['a']);
});

// Um bucket em memória atrás do cliente R2 de verdade, com listagem paginada de 2 em 2.
function fakeBucket() {
  const objects = new Set();
  const account = 'c'.repeat(32);
  const request = async (url, init) => {
    const address = new URL(url);
    if (init.method === 'GET' && address.searchParams.get('list-type') === '2') {
      const prefix = address.searchParams.get('prefix') || '';
      const all = [...objects].filter(key => key.startsWith(prefix)).sort();
      const from = Number(address.searchParams.get('continuation-token') || 0), more = from + 2 < all.length;
      const keys = all.slice(from, from + 2).map(key => `<Contents><Key>${key.replace(/&/g, '&amp;')}</Key></Contents>`).join('');
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><ListBucketResult>${keys}<IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${from + 2}</NextContinuationToken>` : ''}</ListBucketResult>`);
    }
    const key = decodeURIComponent(address.pathname.replace('/graao-arquivos/', ''));
    if (init.method === 'DELETE') { objects.delete(key); return new Response(null, { status: 204 }); }
    return new Response(null, { status: 404 });
  };
  return { objects, r2: createR2({ accountId: account, accessKeyId: 'key', secretAccessKey: 'secret', bucket: 'graao-arquivos', request }) };
}

// Evolution API falsa: anota as chamadas e pode ficar fora do ar.
function fakeEvolution() {
  const calls = [];
  let down = false;
  const request = async (url, init = {}) => {
    calls.push(`${init.method || 'GET'} ${new URL(url).pathname}`);
    return down ? Response.json({ message: 'fora do ar' }, { status: 500 }) : Response.json({});
  };
  return { calls, request, setDown: value => { down = value; } };
}

const SATELLITES = ['ads', 'google', 'social', 'email', 'portal', 'community'];

async function startWithEverything(t) {
  const bucket = fakeBucket(), evo = fakeEvolution();
  const ctx = await start(t, { r2: bucket.r2, whatsappRequest: evo.request, evolutionBaseUrl: 'https://evo.graao.test', evolutionApiKey: 'chave-global' });
  const { store, workspace, call, owner } = ctx;
  const outra = (await call('/api/workspaces', { user: owner, body: { name: 'Outra Loja' } })).body.id;
  for (const id of [workspace, outra]) {
    for (const kind of SATELLITES) store.insert(`${kind}-${id}`, { token: `segredo-${kind}` });
    store.change(id, state => { state.studioProjects = [{ id: `site-${id}` }]; });
    store.insert(`studio-site-${id}`, { workspace: id, pages: [] });
    store.tracking.append(id, [{ id: `ev-${id}`, created: new Date().toISOString(), type: 'pageview', vid: 'v1' }]);
    for (const key of [`ws/${id}/files/a`, `ws/${id}/files/b`, `ws/${id}/messages/m1`]) bucket.objects.add(key);
  }
  store.insert('whatsapp-agency', { subaccounts: {
    [workspace]: { provider: 'evolution', instanceName: 'graao_padaria', enabled: true },
    [outra]: { provider: 'evolution', instanceName: 'graao_outra', enabled: true }
  } });
  store.change('agency', agency => {
    agency.users = [...(agency.users || []), { id: 'u-ana', name: 'Ana', email: 'ana@example.test', role: 'Account User', accounts: [workspace, outra] }];
  });
  const trashed = await call('/api/agency/action', { user: owner, body: { type: 'account-trash', id: workspace, data: { confirm: 'Padaria Sol' } } });
  assert.equal(trashed.status, 200, trashed.body.error);
  return { ...ctx, outra, bucket, evo };
}

const exists = (store, id) => { try { store.load(id); return true; } catch (e) { if (e.status === 404) return false; throw e; } };

test('Exclusão definitiva leva junto tudo o que era da subconta e não toca na outra', async t => {
  const { store, purgeTrash, workspace, outra, bucket, evo } = await startWithEverything(t);
  const later = Date.now() + (TRASH_DAYS + 1) * DAY;
  assert.deepEqual(await purgeTrash('agency', later), [workspace]);

  assert.equal(exists(store, workspace), false);
  for (const kind of SATELLITES) {
    assert.equal(exists(store, `${kind}-${workspace}`), false, `${kind}-<subconta> ficou para trás`);
    assert.equal(exists(store, `${kind}-${outra}`), true, `${kind}-<outra> foi apagada`);
  }
  assert.equal(exists(store, `studio-site-${workspace}`), false);
  assert.equal(exists(store, `studio-site-${outra}`), true);
  assert.deepEqual(store.tracking.page(workspace, {}).events, []);
  assert.equal(store.tracking.page(outra, {}).events.length, 1);
  assert.deepEqual([...bucket.objects].sort(), [`ws/${outra}/files/a`, `ws/${outra}/files/b`, `ws/${outra}/messages/m1`]);
  assert.deepEqual(evo.calls.filter(c => c.startsWith('DELETE')), ['DELETE /instance/logout/graao_padaria', 'DELETE /instance/delete/graao_padaria']);
  const wa = store.load('whatsapp-agency');
  assert.equal(wa.subaccounts[workspace], undefined);
  assert.ok(wa.subaccounts[outra]);
  const agency = store.load('agency');
  assert.deepEqual(agency.users.find(u => u.id === 'u-ana').accounts, [outra]);
  assert.equal(agency.accounts[workspace], undefined);
});

test('Exclusão definitiva: WhatsApp fora do ar segura a subconta na lixeira e tenta de novo depois de 1 hora', async t => {
  const { store, purgeTrash, workspace, bucket, evo } = await startWithEverything(t);
  const due = Date.now() + (TRASH_DAYS + 1) * DAY, HOUR = 3_600_000;
  evo.setDown(true);
  assert.deepEqual(await purgeTrash('agency', due), []);
  assert.equal(exists(store, workspace), true);
  assert.equal(exists(store, `ads-${workspace}`), true);
  const failed = store.load('agency').accounts[workspace].trash.purgeFailed;
  assert.match(failed.error, /Evolution/);
  assert.equal(bucket.objects.size, 6);

  const tried = evo.calls.length;
  assert.deepEqual(await purgeTrash('agency', due + HOUR / 2), []);
  assert.equal(evo.calls.length, tried, 'tentou de novo antes de 1 hora');

  evo.setDown(false);
  assert.deepEqual(await purgeTrash('agency', due + HOUR + 1), [workspace]);
  assert.equal(exists(store, workspace), false);
  assert.equal(exists(store, `ads-${workspace}`), false);
});

test('Exclusão definitiva: depois de 7 dias de falha apaga o que é do graao e anota o que ficou de fora', async t => {
  const { store, purgeTrash, workspace, evo } = await startWithEverything(t);
  const due = Date.now() + (TRASH_DAYS + 1) * DAY;
  evo.setDown(true);
  assert.deepEqual(await purgeTrash('agency', due), []);
  assert.deepEqual(await purgeTrash('agency', due + 8 * DAY), [workspace]);
  assert.equal(exists(store, workspace), false);
  assert.equal(exists(store, `google-${workspace}`), false);
  const note = store.load('agency').audit.find(row => row.action === 'Sub-account permanently deleted' && row.target === 'Padaria Sol');
  assert.match(note.details || '', /Evolution/);
});
