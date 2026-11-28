import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSupabaseAuth } from '../auth.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { verifiedAgencies } from './helpers/verified-agencies.mjs';
import { blank } from '../model.mjs';

const oauthClaims = Buffer.from(JSON.stringify({ amr: [{ method: 'oauth' }] })).toString('base64url');
const identity = email => ({ id: randomUUID(), email, email_confirmed_at: '2026-11-18', identities: [{ provider: 'google' }] });
const tokenFor = user => `${user.id}.${oauthClaims}.signature`;

async function start(t) {
  const ownerA = identity('owner-a@example.test');
  const ownerB = identity('owner-b@example.test');
  const member = identity('member@example.test');
  const expired = 'expired-token';
  const users = new Map([ownerA, ownerB, member].map(user => [tokenFor(user), user]));
  const auth = createSupabaseAuth({
    projectUrl: 'https://test.supabase.co',
    publishableKey: 'test',
    async request(url, options) {
      assert.equal(url.pathname, '/auth/v1/user');
      const token = options.headers.Authorization?.slice(7);
      if (token === expired) return Response.json({ code: 'bad_jwt', msg: 'JWT expired' }, { status: 401 });
      const user = users.get(token);
      return user ? Response.json(user) : Response.json({}, { status: 401 });
    }
  });
  const store = verifiedAgencies(createSqliteStore(':memory:'));
  const { server, host, ready } = makeServer({
    store, auth, agencyOwnerId: ownerA.id, allowLocalAccess: false, socialScheduler: false, port: 0
  });
  await ready;
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, { user, body, headers, accessToken } = {}) => {
    const token = accessToken || (user && tokenFor(user));
    const response = await fetch(base + path, {
      headers: {
        ...(token && { Cookie: `go_access=${token}` }),
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        ...headers
      },
      method: body === undefined ? 'GET' : 'POST',
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie') };
  };
  const createWorkspace = async (user, name) => {
    const response = await call('/api/workspaces', { user, body: { name } });
    assert.equal(response.status, 201, response.body.error);
    return response.body.id;
  };
  const agencyAction = async (user, body) => {
    const response = await call('/api/agency/action', { user, body });
    assert.equal(response.status, 200, response.body.error);
    return response.body.result;
  };
  return { base, store, ownerA, ownerB, member, expired, call, createWorkspace, agencyAction };
}

test('Signed-in agencies and a member assigned to multiple workspaces cannot change tenant through HTTP input', async t => {
  const { store, ownerA, ownerB, member, call, createWorkspace, agencyAction } = await start(t);
  const a1 = await createWorkspace(ownerA, 'A1');
  const a2 = await createWorkspace(ownerA, 'A2');
  const a3 = await createWorkspace(ownerA, 'A3');
  const b1 = await createWorkspace(ownerB, 'B1');
  const agencyB = `agency-${ownerB.id}`;
  await agencyAction(ownerA, {
    type: 'save', key: 'users',
    data: { first: 'Team', last: 'Member', email: member.email, loginEnabled: true, role: 'Account User', accounts: [a1, a2], permissions: ['contacts'] }
  });

  const available = await call('/api/workspaces', { user: member });
  assert.equal(available.status, 200);
  assert.deepEqual(available.body.workspaces.map(row => row.id).sort(), [a1, a2].sort());
  for (const workspace of [a1, a2]) {
    assert.equal((await call(`/api/state?workspace=${workspace}`, { user: member })).status, 200);
  }
  for (const [user, target] of [[ownerA, b1], [ownerB, a1], [member, a3], [member, b1]]) {
    assert.equal((await call(`/api/state?workspace=${target}&agencyId=${agencyB}`, { user })).status, 403);
    assert.equal((await call(`/api/action?workspace=${target}`, {
      user, body: { type: 'save', key: 'contacts', agencyId: agencyB, data: { name: 'Foreign write' } }
    })).status, 403);
  }

  const foreignContact = await call(`/api/action?workspace=${b1}`, {
    user: ownerB, body: { type: 'save', key: 'contacts', data: { name: 'B private contact' } }
  });
  assert.equal(foreignContact.status, 200);
  assert.equal((await call(`/api/action?workspace=${a1}&agencyId=${agencyB}`, {
    user: member, body: { type: 'save', key: 'contacts', id: foreignContact.body.id, workspaceId: b1, data: { name: 'Changed' } }
  })).status, 404);
  assert.equal((await call(`/api/action?workspace=${a1}`, {
    user: member, body: { type: 'save', key: 'contacts', workspaceId: b1, agencyId: agencyB, data: { name: 'A local contact' } }
  })).status, 200);
  assert.equal(store.load(a1).contacts[0].name, 'A local contact');
  assert.equal(store.load(b1).agencyId, agencyB);
  assert.deepEqual(store.load(b1).contacts.map(row => row.name), ['B private contact']);

  const personal = `user-${ownerA.id}`;
  store.insert(personal, blank('Personal'));
  assert.equal((await call(`/api/state?workspace=${personal}`, { user: ownerA })).status, 200);
  assert.equal((await call(`/api/state?workspace=${personal}`, { user: ownerB })).status, 403);
});

test('Public API keys and private integration scopes are bounded by the issuing agency', async t => {
  const { ownerA, ownerB, call, createWorkspace, agencyAction } = await start(t);
  const a1 = await createWorkspace(ownerA, 'A1');
  const b1 = await createWorkspace(ownerB, 'B1');
  const root = '/api/v1/subaccounts';
  const global = await agencyAction(ownerA, { type: 'api-key', data: { name: 'Agency A' } });
  const reader = await agencyAction(ownerA, { type: 'private-integration', data: { name: 'Reader A', scopes: ['contacts.read'] } });
  const bearer = ({ secret }) => ({ Authorization: `Bearer ${secret}` });
  const list = await call(root, { headers: bearer(global) });
  assert.equal(list.status, 200);
  assert.ok(list.body.subaccounts.some(row => row.id === a1));
  assert.ok(!list.body.subaccounts.some(row => row.id === b1));
  for (const key of [global, reader]) {
    assert.equal((await call(`${root}/${a1}/contacts`, { headers: bearer(key) })).status, 200);
    assert.equal((await call(`${root}/${b1}/contacts`, { headers: bearer(key) })).status, 404);
  }
  assert.equal((await call(`${root}/${b1}/contacts`, { headers: bearer(global), body: { name: 'Denied' } })).status, 404);
  assert.equal((await call(root, { headers: bearer(reader) })).status, 401);
  assert.equal((await call(`${root}/${a1}/contacts`, { headers: bearer(reader), body: { name: 'Denied' } })).status, 401);
  await agencyAction(ownerA, { type: 'private-integration-delete', id: reader.id });
  assert.equal((await call(`${root}/${a1}/contacts`, { headers: bearer(reader) })).status, 401);
});

test('An expired access token and expired or foreign portal invitations cannot authenticate', async t => {
  const { store, ownerA, ownerB, expired, call, createWorkspace } = await start(t);
  const a1 = await createWorkspace(ownerA, 'A1');
  const b1 = await createWorkspace(ownerB, 'B1');
  const state = `/api/state?workspace=${a1}`;
  assert.equal((await call(state, { accessToken: expired })).status, 401);
  assert.equal((await call(state, { accessToken: 'invalid-token' })).status, 401);
  assert.equal((await call(state)).status, 401);
  const portal = id => `/api/client-portal/${id}`;
  assert.equal((await call(`${portal(a1)}/admin`, { user: ownerB })).status, 403);
  const invite = async (id, user) => {
    const response = await call(`${portal(id)}/admin`, {
      user, body: { action: 'invite', email: 'student@example.test' }
    });
    assert.equal(response.status, 200, response.body.error);
    const fragment = new URL(response.body.accessPath, 'https://example.test').hash;
    assert.match(fragment, /^#access=/);
    return fragment.slice('#access='.length);
  };
  const token = await invite(a1, ownerA);
  await invite(b1, ownerB);
  const exchange = (id, token) => call(`${portal(id)}/exchange`, { body: { token } });
  assert.equal((await exchange(b1, token)).status, 401);
  store.change(`portal-${a1}`, row => { row.links[0].expires = 1; });
  assert.equal((await exchange(a1, token)).status, 401);
  const fresh = await invite(a1, ownerA);
  assert.equal((await exchange(a1, fresh)).status, 200);
  assert.equal((await exchange(a1, fresh)).status, 401);
});

test('Account lifecycle blocks operators and API keys while agency support is read-only and audited', async t => {
  const { store, ownerA, ownerB, member, call, createWorkspace, agencyAction } = await start(t);
  const workspace = await createWorkspace(ownerA, 'Lifecycle account');
  const query = `?workspace=${workspace}`;
  const action = `/api/action${query}`;
  const state = `/api/state${query}`;
  const passwordlessMember = role => ({
    first: 'Team', last: 'Member', email: member.email, role, accounts: [workspace], permissions: []
  });
  const memberId = await agencyAction(ownerA, { type: 'save', key: 'users', data: passwordlessMember('Account User') });
  const setRole = role => agencyAction(ownerA, { type: 'save', key: 'users', id: memberId, data: passwordlessMember(role) });
  const command = { type: 'save', key: 'contacts', data: { name: 'Historical contact' } };
  assert.equal((await call(action, { user: member, body: command })).status, 200);
  const preserved = store.load(workspace);
  const originalAccount = store.load('agency').accounts[workspace];
  const key = await agencyAction(ownerA, { type: 'api-key', data: { name: 'Lifecycle key' } });
  const integration = await agencyAction(ownerA, { type: 'private-integration', data: { name: 'Lifecycle input', scopes: ['contacts.write'] } });
  const headers = secret => ({ Authorization: `Bearer ${secret}` });
  const contacts = `/api/v1/subaccounts/${workspace}/contacts`;
  const setStatus = status => agencyAction(ownerA, {
    type: 'account-meta', id: workspace, data: { ...originalAccount, status, suspendedReason: 'Maintenance' }
  });
  const suspended = async (path, request, status) => {
    const response = await call(path, request);
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'ACCOUNT_SUSPENDED');
    assert.equal(response.body.account.status, status);
    return response.body.account;
  };

  await setStatus('Paused');
  const paused = await suspended(state, { user: member }, 'Paused');
  assert.equal(paused.suspendedReason, 'Maintenance');
  assert.ok(paused.suspendedAt);
  await suspended(action, { user: member, body: command }, 'Paused');
  assert.deepEqual(await suspended(contacts, { headers: headers(key.secret) }, 'Paused'), { status: 'Paused' });
  await suspended(contacts, { headers: headers(integration.secret), body: { name: 'Denied' } }, 'Paused');
  const foreign = await call(state, { user: ownerB });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.account, undefined);

  await setRole('Account Admin');
  await setStatus('Closed');
  const closed = await suspended(state, { user: member }, 'Closed');
  assert.ok(closed.closedAt);
  await suspended(action, { user: member, body: command }, 'Closed');
  const beforeSupport = await call(state, { user: ownerA });
  assert.equal(beforeSupport.status, 200);
  assert.equal(beforeSupport.body.account.support, true);
  assert.deepEqual(beforeSupport.body.state.contacts, preserved.contacts);
  const protectedRoutes = [
    [action, { type: 'delete', key: 'contacts', id: preserved.contacts[0].id }],
    [`/api/studio/doc${query}`],
    [`/api/agents/test${query}`, {}],
    [`/api/social/run${query}`, {}],
    [`/api/whatsapp/workspace/status${query}`],
    [`/api/client-portal/${workspace}/admin`]
  ];
  for (const [path, body] of protectedRoutes) await suspended(path, { user: ownerA, body }, 'Closed');
  assert.deepEqual(store.load(workspace), preserved);
  assert.ok(store.audit.page('agency').entries.some(row => row.action === 'Sub-account support viewed' && row.target === workspace));

  await setRole('Agency User');
  await suspended(state, { user: member }, 'Closed');
  for (const body of [{ type: 'account-meta', id: workspace, data: { status: 'Active' } }, { type: 'account-reactivate', id: workspace }]) {
    assert.equal((await call('/api/agency/action', { user: member, body })).status, 403);
    assert.equal((await call('/api/agency/action', { user: ownerB, body })).status, 404);
  }
  await setRole('Agency Admin');
  assert.equal((await call(state, { user: member })).body.account.support, true);
  await agencyAction(member, { type: 'account-reactivate', id: workspace });
  await setRole('Account User');
  assert.equal((await call(state, { user: member })).status, 200);
  assert.equal((await call(action, { user: member, body: command })).status, 200);
  assert.equal(store.load(workspace).contacts.length, preserved.contacts.length + 1);
  const meta = store.load('agency').accounts[workspace];
  assert.deepEqual(meta.statusHistory.map(row => [row.from, row.to]), [
    ['Active', 'Paused'], ['Paused', 'Closed'], ['Closed', 'Active']
  ]);
  assert.equal(meta.suspendedReason, '');
});

test('Paused public content stays readable without transactions and a closed workspace becomes unavailable', async t => {
  const { base, store, ownerA, ownerB, call, createWorkspace, agencyAction } = await start(t);
  const workspace = await createWorkspace(ownerA, 'Public lifecycle');
  const query = `?workspace=${workspace}`;
  const save = async (key, data) => {
    const response = await call(`/api/action${query}`, { user: ownerA, body: { type: 'save', key, data } });
    assert.equal(response.status, 200, response.body.error);
    return response.body.id;
  };
  const form = await save('forms', { name: 'Lead form', active: true });
  const draft = await save('forms', { name: 'Unpublished form', active: false });
  const course = await save('courses', { name: 'Unrestricted lesson', lesson: 'First', body: 'Course material', active: true, portalOnly: false });
  const link = await save('triggerLinks', { name: 'Tracked', url: 'https://example.test/target' });
  const file = await save('files', { name: 'media.png', data: 'data:image/png;base64,iVBORw0KGgo=' });
  const media = `/m/${workspace}/${file}`;
  assert.equal((await fetch(base + media)).status, 404);
  assert.equal((await fetch(base + media, { headers: { Cookie: `go_access=${tokenFor(ownerB)}` } })).status, 404);
  assert.equal((await fetch(base + media, { headers: { Cookie: `go_access=${tokenFor(ownerA)}` } })).status, 200);
  store.change(workspace, state => {
    state.socialPosts.push({ id: randomUUID(), status: 'published', media: [{ fileId: file }] });
  });
  const site = await call(`/api/studio${query}`, { user: ownerA, body: { mode: 'blank', name: 'Public site' } });
  assert.equal(site.status, 201, site.body.error);
  assert.equal((await call(`/api/studio/publish${query}`, { user: ownerA, body: { id: site.body.id, publish: true } })).status, 200);
  const portal = `/api/client-portal/${workspace}`;
  const invite = async () => {
    const response = await call(`${portal}/admin`, { user: ownerA, body: { action: 'invite', email: 'student@example.test', courseIds: [course] } });
    assert.equal(response.status, 200, response.body.error);
    return new URL(response.body.accessPath, base).hash.slice('#access='.length);
  };
  const exchange = token => call(`${portal}/exchange`, { body: { token } });
  const signedIn = await exchange(await invite());
  assert.equal(signedIn.status, 200);
  const portalSession = { headers: { Cookie: signedIn.cookie.split(';')[0] } };
  const token = await invite();
  const path = `/form/${workspace}/${form}`;
  const draftPath = `/form/${workspace}/${draft}?preview=1`;
  assert.equal((await fetch(base + draftPath, { headers: { Cookie: 'go_access=fabricated' } })).status, 401);
  assert.equal((await fetch(base + draftPath, { headers: { Cookie: `go_access=${tokenFor(ownerB)}` } })).status, 404);
  assert.equal((await fetch(base + draftPath, { headers: { Cookie: `go_access=${tokenFor(ownerA)}` } })).status, 200);

  const setStatus = status => agencyAction(ownerA, { type: 'account-meta', id: workspace, data: { status, suspendedReason: 'Private maintenance reason' } });
  const publicSite = `/s/${workspace}/${site.body.id}`;
  const tracked = `/r/${workspace}/${link}`;
  const coursePath = `/api/view/course/${workspace}/${course}`;
  const submit = target => fetch(base + target, {
    method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'name=New&email=new%40example.test'
  });
  await setStatus('Paused');
  const saved = store.load(workspace);
  const savedSite = store.load(`studio-${site.body.id}`);
  for (const target of [path, publicSite, media, coursePath, `/portal/${workspace}`]) {
    assert.equal((await fetch(base + target)).status, 200);
  }
  const click = await fetch(base + tracked, { redirect: 'manual' });
  assert.equal(click.status, 302);
  assert.equal(click.headers.get('location'), 'https://example.test/target');
  for (const target of [path, publicSite]) {
    const response = await submit(target);
    assert.equal(response.status, 403);
    assert.doesNotMatch(await response.text(), /Private maintenance reason/);
  }
  const denied = await call(`/api/view/f/${workspace}/${form}`, { body: { name: 'New', email: 'new@example.test' } });
  assert.equal(denied.status, 403);
  assert.equal((await exchange(token)).status, 403);
  assert.equal((await call(`${portal}/course/${course}`, portalSession)).status, 200);
  assert.deepEqual(store.load(workspace), saved);
  assert.deepEqual(store.load(`studio-${site.body.id}`), savedSite);
  await setStatus('Closed');
  for (const target of [path, publicSite, tracked, media, coursePath, `/portal/${workspace}`, `${portal}/home`]) {
    const response = await fetch(base + target, { redirect: 'manual' });
    assert.equal(response.status, 404, target);
    assert.doesNotMatch(await response.text(), /Private maintenance reason/);
  }
  assert.equal((await submit(path)).status, 404);
  assert.equal((await exchange(token)).status, 404);
  assert.equal((await call(`${portal}/course/${course}`, portalSession)).status, 404);
  await agencyAction(ownerA, { type: 'account-reactivate', id: workspace });
  assert.equal((await exchange(token)).status, 200);
  assert.equal((await submit(path)).status, 200);
  assert.ok(store.load(workspace).contacts.some(row => row.email === 'new@example.test'));
});

test('Module permissions scope state and mutation responses and are refreshed within an existing login', async t => {
  const { store, ownerA, member, call, createWorkspace, agencyAction } = await start(t);
  const workspace = await createWorkspace(ownerA, 'Restricted workspace');
  const action = `/api/action?workspace=${workspace}`;
  const state = `/api/state?workspace=${workspace}`;
  const command = (user, body) => call(action, { user, body });
  const save = async (key, data) => {
    const response = await command(ownerA, { type: 'save', key, data });
    assert.equal(response.status, 200, response.body.error);
    return response.body.id;
  };
  const contact = await save('contacts', { name: 'Related Contact' });
  const unrelated = await save('contacts', { name: 'Independent Contact' });
  await save('invoices', { title: 'Sensitive invoice', contactId: contact, value: 500, due: '2026-12-31', status: 'Paid' });
  const report = await command(ownerA, { type: 'report-create', data: { name: 'Sensitive report' } });
  assert.equal(report.status, 200, report.body.error);
  store.change(workspace, state => {
    state.dashboardReports.push({ id: randomUUID(), name: 'Legacy report', rows: [['Revenue', 'Total', 500]] });
    state.legacyPrivate = { sentinel: 'Only complete scope' };
  });
  const directory = { first: 'Module', last: 'Operator', email: member.email, role: 'Account User', accounts: [workspace] };
  const userId = await agencyAction(ownerA, { type: 'save', key: 'users', data: { ...directory, permissions: ['contacts'] } });
  const grant = (permissions, permissionMode) => agencyAction(ownerA, {
    type: 'save', key: 'users', id: userId, data: { ...directory, permissions, permissionMode }
  });
  const read = () => call(state, { user: member });
  const assertFiltered = ({ state: data, metrics }) => {
    assert.deepEqual(data.invoices, []);
    assert.deepEqual(data.transactions, []);
    assert.deepEqual(data.customReports, []);
    assert.deepEqual(data.dashboardReports, []);
    assert.equal(data.legacyPrivate, undefined);
    assert.equal(metrics.invoicesPaid, 0);
  };
  assertFiltered((await read()).body);
  assertFiltered((await command(member, { type: 'import', data: { rows: [{ name: 'Imported', email: 'imported@example.test' }] } })).body);
  for (const denied of [
    { type: 'report-create', data: { name: 'Forbidden report' }, role: 'Agency Owner', actor: 'Owner', permissions: [] },
    { type: 'report-save', id: report.body.id, data: { version: 1 } },
    { type: 'report-delete', id: report.body.id, data: { version: 1 } },
    { type: 'team-message', data: { body: 'Unauthorized team message' } },
    { type: 'save', key: 'inboxViews', data: { name: 'Unauthorized inbox view' } },
    { type: 'bulk', data: { object: 'opportunities', operation: 'delete', ids: [unrelated] } },
    { type: 'delete', key: 'contacts', id: contact },
    { type: 'bulk', data: { object: 'contacts', operation: 'delete', ids: [unrelated, contact] } }
  ]) {
    assert.equal((await command(member, denied)).status, 403, denied.type);
  }
  assert.ok(store.load(workspace).contacts.some(row => row.id === unrelated));
  assert.equal(store.load(workspace).invoices.length, 1);
  assert.equal((await command(member, { type: 'delete', key: 'contacts', id: unrelated })).status, 200);

  await grant([], '');
  assert.equal((await read()).body.state.invoices[0].title, 'Sensitive invoice', 'legacy empty lists still inherit access');
  await grant(['contacts'], 'none');
  const blocked = await read();
  assert.deepEqual(blocked.body.access.modules, []);
  assert.deepEqual(blocked.body.state.contacts, []);
  assert.equal((await command(member, { type: 'save', key: 'contacts', data: { name: 'Denied' } })).status, 403);
  await grant(['reporting'], 'restricted');
  const reporting = (await read()).body;
  assert.deepEqual(reporting.access.modules, ['reporting']);
  assert.equal(reporting.state.customReports.length, 1);
  assert.deepEqual(reporting.state.dashboardReports, [], 'legacy snapshots can contain data from unauthorized modules');
  assert.equal((await command(member, { type: 'report-create', data: { name: 'Allowed report' } })).status, 200);
  await agencyAction(ownerA, { type: 'delete', key: 'users', id: userId });
  assert.equal((await read()).status, 403, 'revocation removes access even with the original session cookie');
});

test('Structured plan permissions apply to the dashboard state, specialized routes, public content and API keys', async t => {
  const { ownerA, member, call, createWorkspace, agencyAction } = await start(t);
  const workspace = await createWorkspace(ownerA, 'Plan workspace');
  const query = `?workspace=${workspace}`;
  await agencyAction(ownerA, { type: 'save', key: 'users', data: {
    first: 'Plan', last: 'Member', email: member.email, role: 'Account User', accounts: [workspace], permissions: ['contacts', 'studio', 'sites']
  } });
  const form = await call(`/api/action${query}`, { user: ownerA, body: { type: 'save', key: 'forms', data: { name: 'Live form', active: true } } });
  assert.equal(form.status, 200);
  const formPath = `/api/view/f/${workspace}/${form.body.id}`;
  assert.equal((await call(formPath)).status, 200);
  const plan = await agencyAction(ownerA, { type: 'save', key: 'plans', data: { name: 'Restricted', price: 10, modules: ['contacts', 'payments'] } });
  await agencyAction(ownerA, { type: 'account-meta', id: workspace, data: { status: 'Active', plan } });
  assert.deepEqual((await call(`/api/state${query}`, { user: member })).body.access.modules, ['contacts']);
  assert.equal((await call(`/api/studio/discover${query}`, { user: member, body: { brief: 'Try hidden module' } })).status, 403);
  assert.equal((await call(formPath)).status, 404);
  assert.equal((await call(formPath, { body: { name: 'Denied', email: 'denied@example.test' } })).status, 404);

  const { secret } = await agencyAction(ownerA, { type: 'api-key', data: { name: 'Plan-scoped key' } });
  const headers = { Authorization: `Bearer ${secret}` };
  const contacts = `/api/v1/subaccounts/${workspace}/contacts`;
  assert.equal((await call(contacts, { headers })).status, 200);
  await agencyAction(ownerA, { type: 'save', key: 'plans', id: plan, data: { name: 'Restricted', price: 10, modules: ['payments'] } });
  assert.equal((await call(contacts, { headers })).status, 403);
  assert.equal((await call(contacts, { headers, body: { name: 'Denied by plan' } })).status, 403);
  assert.deepEqual((await call(`/api/state${query}`, { user: member })).body.access.modules, []);
});

test('Agency admins cannot grant the owner role and agency operators cannot reach central settings', async t => {
  const { ownerA, member, call, agencyAction } = await start(t);
  const staff = { first: 'Agency', last: 'Staff', email: member.email, role: 'Agency Admin', accounts: [], permissions: [] };
  const id = await agencyAction(ownerA, { type: 'save', key: 'users', data: staff });
  const owner = await agencyAction(ownerA, { type: 'save', key: 'users', data: { ...staff, email: 'owner-role@example.test', role: 'Agency Owner' } });
  const agency = body => call('/api/agency/action', { user: member, body });
  assert.equal((await agency({ type: 'save', key: 'users', id, data: { ...staff, role: 'Agency Owner' } })).status, 403);
  assert.equal((await agency({ type: 'delete', key: 'users', id: owner })).status, 403);
  assert.equal((await agency({ type: 'api-key', data: { name: 'Admin integration' } })).status, 200);
  await agencyAction(ownerA, { type: 'save', key: 'users', id, data: { ...staff, role: 'Agency User', permissions: ['contacts'] } });
  const view = await call('/api/agency', { user: member });
  assert.equal(view.status, 200);
  assert.deepEqual(view.body.agency.apiKeys, []);
  assert.deepEqual(view.body.agency.users, []);
  assert.equal(view.body.overview.accounts[0].open, 0);
  assert.equal((await agency({ type: 'save', key: 'plans', data: { name: 'Unauthorized plan', price: 10 } })).status, 403);
  assert.equal((await call('/api/whatsapp/agency/status', { user: member })).status, 403);
});

test('Public Sites previews verify identity and tenant and suspended accounts reject new visitor operations', async t => {
  const { base, store, ownerA, ownerB, call, createWorkspace, agencyAction } = await start(t);
  const workspace = await createWorkspace(ownerA, 'Public Sites authorization');
  const id = randomUUID();
  store.change(workspace, state => {
    state.blogs.push({ id, name: 'Private draft blog', active: false });
    state.stores.push({ id, name: 'Private draft store', active: false });
    state.webinars.push({ id, name: 'Private draft webinar', active: false });
    state.chatWidgets.push({ id, name: 'Private draft chat', active: false });
  });
  const previews = [
    `/b/${workspace}/${id}?preview=1`,
    `/loja/${workspace}/${id}?preview=1`,
    `/w/${workspace}/${id}?preview=1`,
    `/chat/${workspace}/${id}/demo`
  ];
  for (const path of previews) {
    assert.equal((await fetch(base + path, { headers: { Cookie: 'go_access=fabricated' } })).status, 401);
    assert.equal((await fetch(base + path, { headers: { Cookie: `go_access=${tokenFor(ownerB)}` } })).status, 404);
  }
  const writes = [
    `/api/webinar/${workspace}/${id}/register`,
    `/api/store/${workspace}/${id}/checkout`,
    `/api/store/${workspace}/${id}/quote`,
    `/api/chat/${workspace}/${id}/start`,
    `/api/chat/${workspace}/${id}/send`
  ];
  const saved = store.load(workspace);
  for (const [status, expected] of [['Paused', 403], ['Closed', 404]]) {
    await agencyAction(ownerA, { type: 'account-meta', id: workspace, data: { status } });
    for (const path of writes) assert.equal((await call(path, { body: {} })).status, expected, path);
    assert.deepEqual(store.load(workspace), saved);
  }
  for (const path of [...previews, `/q/${workspace}/${id}`]) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
});

test('Copiar contato: saving the workflow needs access to the target sub-account, in the same agency', async t => {
  const { ownerA, ownerB, member, call, createWorkspace, agencyAction } = await start(t);
  const a1 = await createWorkspace(ownerA, 'A1');
  const a2 = await createWorkspace(ownerA, 'A2');
  const a3 = await createWorkspace(ownerA, 'A3');
  const b1 = await createWorkspace(ownerB, 'B1');
  await agencyAction(ownerA, {
    type: 'save', key: 'users',
    data: { first: 'Team', last: 'Member', email: member.email, loginEnabled: true, role: 'Account User', accounts: [a1, a2], permissions: ['contacts', 'automation'] }
  });
  const save = (user, target) => call(`/api/action?workspace=${a1}`, { user, body: { type: 'save', key: 'workflows',
    data: { name: 'Copiar', active: true, triggers: [{ type: 'contact_created' }], steps: [{ type: 'copy_contact', config: { workspace: target } }] } } });
  assert.equal((await save(member, a2)).status, 200, 'a sub-account the member can open');
  const denied = await save(member, a3);
  assert.equal(denied.status, 403);
  assert.match(denied.body.error, /acesso aos contatos da subconta de destino/);
  assert.equal((await save(ownerA, b1)).status, 403, 'another agency is never a target');
  assert.equal((await save(ownerA, a3)).status, 200);
});
