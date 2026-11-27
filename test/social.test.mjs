import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { useFetch, seal, unseal } from '../social-providers.mjs';
import { blank, execute } from '../model.mjs';
import { evergreenDue, settle } from '../social-model.mjs';
import { bestTimes, nextOccurrence, occurrencesBetween, parseCsv, postIssues } from '../ui/social-data.js';
import { writeCaption } from '../social-ai.mjs';

const reply = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

// A fake of every network endpoint the tests touch. `calls` records what the planner sent.
function fakeNetworks(onRequest) {
  const calls = [];
  useFetch(async (url, init = {}) => {
    const u = new URL(url), body = init.body && typeof init.body === 'string' ? (init.body.startsWith('{') ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body))) : init.body;
    calls.push({ url: u.href, method: init.method || 'GET', body, auth: init.headers?.Authorization });
    const path = u.pathname;
    await onRequest?.(path, body);
    if (u.host === 'graph.facebook.com') {
      if (path.endsWith('/oauth/access_token')) return reply({ access_token: u.searchParams.get('grant_type') ? 'long-user' : 'short-user' });
      if (path.endsWith('/me/accounts')) return reply({ data: [{ id: 'page1', name: 'Padaria Sol', access_token: 'page-token', picture: { data: { url: 'https://cdn.example/p.png' } },
        instagram_business_account: { id: 'ig1', username: 'padariasol', profile_picture_url: 'https://cdn.example/i.png' } }] });
      if (path.endsWith('/page1/feed')) return reply({ id: 'page1_99' });
      if (path.endsWith('/page1/photos')) return reply({ id: 'photo1', post_id: 'page1_77' });
      if (path.endsWith('/ig1/media')) return reply({ id: 'container1' });
      if (path.endsWith('/ig1/media_publish')) return reply({ id: 'igpost1' });
      if (path.endsWith('/igpost1')) return reply({ permalink: 'https://instagram.com/p/abc' });
      if (path.endsWith('/comments')) return reply({ id: 'c1' });
    }
    if (u.host === 'bsky.social') {
      if (path.endsWith('createSession')) return body.password === 'abcd-efgh-ijkl-mnop' ? reply({ did: 'did:plc:me', handle: 'me.bsky.social', accessJwt: 'a1', refreshJwt: 'r1' }) : reply({ error: 'AuthenticationRequired', message: 'Invalid identifier or password' }, 401);
      if (path.endsWith('getProfile')) return reply({ displayName: 'Eu no Bluesky' });
      if (path.endsWith('refreshSession')) return reply({ accessJwt: 'a2', refreshJwt: 'r2' });
      if (path.endsWith('createRecord')) return reply({ uri: 'at://did:plc:me/app.bsky.feed.post/3kxyz', cid: 'c' });
    }
    return reply({ error: { message: `unexpected ${u.href}` } }, 500);
  });
  return calls;
}

async function start() {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { redirect: 'manual', headers } : { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = null; }
    return { status: r.status, body: json, text, location: r.headers.get('location'), type: r.headers.get('content-type') };
  };
  const workspace = (await call('/api/workspaces', { name: 'Social test' })).body.id;
  const q = path => `${path}${path.includes('?') ? '&' : '?'}workspace=${workspace}`;
  const act = command => call(q('/api/action'), command);
  const state = async () => (await call(q('/api/state'))).body.state;
  return { call, q, act, state, workspace, close: () => new Promise(resolve => server.close(resolve)) };
}

test('Posts validate accounts, media and character limits before they can be scheduled', () => {
  const accounts = [{ id: 'a', provider: 'instagram' }, { id: 'b', provider: 'bluesky' }];
  assert.deepEqual(postIssues({ accountIds: [], summary: 'oi', media: [] }, accounts), ['Escolha ao menos uma conta.']);
  assert.match(postIssues({ accountIds: ['a'], summary: 'oi', media: [] }, accounts).join(), /Instagram: adicione uma imagem/);
  assert.match(postIssues({ accountIds: ['b'], summary: 'x'.repeat(301), media: [] }, accounts).join(), /Bluesky: o texto passa de 300/);
  assert.deepEqual(postIssues({ accountIds: ['b'], summary: 'x'.repeat(301), overrides: { bluesky: 'curto' }, media: [] }, accounts), [], 'a per-network text replaces the main text');

  const s = blank();
  s.socialAccounts.push({ id: 'b', provider: 'bluesky', name: 'Eu' });
  assert.throws(() => execute(s, { type: 'social-post', data: { summary: 'oi', accountIds: ['b'], mode: 'schedule', scheduleDate: '2020-01-01T10:00:00Z' } }), /futuro/);
  assert.throws(() => execute(s, { type: 'social-post', data: { summary: 'oi', accountIds: ['zzz'], mode: 'draft' } }), /desconectada/);
  const draft = execute(s, { type: 'social-post', data: { summary: '', accountIds: [], mode: 'draft' } });
  assert.equal(s.socialPosts.find(p => p.id === draft).status, 'draft', 'drafts may be incomplete');
});

test('Recurring posts repeat and leave a published copy for each occurrence', () => {
  assert.equal(nextOccurrence('2026-01-01T09:00:00.000Z', { freq: 'weekly', interval: 1 }, '2026-01-01T09:00:00.000Z'), '2026-01-08T09:00:00.000Z');
  assert.equal(nextOccurrence('2026-01-01T09:00:00.000Z', { freq: 'daily', interval: 1, until: '2026-01-01T23:59:59.000Z' }), '');
  assert.equal(occurrencesBetween({ scheduleDate: '2026-01-01T09:00:00.000Z', recurrence: { freq: 'daily', interval: 2 } }, Date.parse('2026-01-01'), Date.parse('2026-01-08')).length, 4);

  const s = blank(); let n = 0;
  const ids = { uid: () => `id${++n}`, now: () => '2026-01-01T09:00:00.000Z' };
  s.socialPosts.push({ id: 'p', status: 'in_progress', scheduleDate: '2026-01-01T09:00:00.000Z', recurrence: { freq: 'daily', interval: 1 }, accountIds: ['a'], results: [], media: [] });
  settle(s, 'p', [{ accountId: 'a', ok: true, url: 'https://x' }], ids);
  const [parent, child] = s.socialPosts;
  assert.equal(parent.status, 'scheduled');
  assert.ok(parent.scheduleDate > '2026-01-01T09:00:00.000Z', 'the series moves to its next date');
  assert.equal(child.status, 'published'); assert.equal(child.parentId, 'p'); assert.equal(child.recurrence, null);
});

test('The evergreen queue reschedules category posts in rotation at its slots', () => {
  const s = blank();
  s.socialAccounts.push({ id: 'a', provider: 'facebook', name: 'Página' });
  s.socialCategories.push({ id: 'cat', name: 'Dicas', evergreen: true, slots: [{ day: 1, time: '09:00' }], accountIds: ['a'] });
  s.socialPosts.push({ id: 'p1', categoryId: 'cat', status: 'published', summary: 'Dica 1', media: [], accountIds: ['a'], source: 'post' },
    { id: 'p2', categoryId: 'cat', status: 'draft', summary: 'Dica 2', media: [], accountIds: [], source: 'post' });
  const monday = new Date('2026-11-16T09:05:00Z');
  const first = evergreenDue(s, monday, 'UTC');
  assert.equal(first.length, 1); assert.equal(first[0].summary, 'Dica 1'); assert.deepEqual(first[0].accountIds, ['a']);
  assert.equal(evergreenDue(s, new Date('2026-11-16T09:30:00Z'), 'UTC').length, 0, 'one post per slot');
  assert.equal(evergreenDue(s, new Date('2026-11-23T09:01:00Z'), 'UTC')[0].summary, 'Dica 2', 'the next slot picks the next post');
});

test('CSV reader handles quotes, semicolons and the template columns', () => {
  const rows = parseCsv('date;content;accounts\n2026-12-01 09:00;"Olá; mundo ""bom""";todas\n');
  assert.deepEqual(rows, [{ date: '2026-12-01 09:00', content: 'Olá; mundo "bom"', accounts: 'todas' }]);
});

test('CSV preview does not import posts and confirmation revalidates the batch', async t => {
  const local = await start(); t.after(local.close);
  const preview = data => local.call(local.q('/api/social/csv-preview'), data);
  const rows = parseCsv('postAtSpecificTime,content,imageUrls,tags,followUpComment\n,"Rascunho",https://example.com/foto.jpg,"novidade,graao",Olá\n2030-02-31 12:00,Data inválida,,,');
  const data = { rows, file: 'lote.csv', accountIds: [], asDraft: true, requireValid: true };
  const result = await preview(data);
  assert.deepEqual(result.body.rows[0], { index: 0, status: 'draft', date: '', accounts: 0 });
  assert.match(result.body.rows[1].error, /Data ou horário inválido/);
  assert.equal((await local.state()).socialPosts.length, 0);
  assert.equal((await local.act({ type: 'social-csv', data })).status, 409);
  assert.equal((await local.state()).socialPosts.length, 0);
  const imported = await local.act({ type: 'social-csv', data: { ...data, includeIndices: [0] } });
  assert.equal(imported.body.id.created, 1);
  const { socialPosts: [post], socialImports: [log] } = await local.state();
  assert.equal(post.firstComment, 'Olá');
  assert.deepEqual(post.tags, ['novidade', 'graao']);
  assert.equal(post.media[0].url, 'https://example.com/foto.jpg');
  assert.equal(log.count, 1);
  assert.equal(log.total, 2);
  assert.match(log.errors[0], /Linha 3/);
  assert.ok(Number.isFinite(Date.parse(log.created)));
});

test('Social connect invites are scoped to a workspace, add-only and revocable', async t => {
  process.env.META_APP_ID = 'app-id'; process.env.META_APP_SECRET = 'app-secret';
  t.after(() => { delete process.env.META_APP_ID; delete process.env.META_APP_SECRET; });
  fakeNetworks();
  const local = await start(); t.after(local.close);
  const invite = action => local.call(local.q('/api/social/invite'), action);
  const generated = await invite({ action: 'create', hours: 1 });
  assert.equal(generated.status, 200);
  const link = new URL(generated.body.url), token = link.hash.slice(1);
  assert.match(link.pathname, new RegExp(`^/social-connect/${local.workspace}$`));
  assert.match((await local.call(link.pathname)).text, /Conecte suas redes sociais/);
  const call = (action, extra = {}) => local.call(local.q('/api/social/invited'), { action, token, ...extra });
  assert.equal((await local.call('/api/social/invited?workspace=demo', { action: 'info', token })).status, 404);
  const info = await call('info');
  assert.deepEqual(Object.keys(info.body).sort(), ['expires', 'providers']);
  assert.equal((await call('disconnect')).status, 400);

  const authorization = await call('start', { provider: 'instagram' });
  const nonce = new URL(authorization.body.url).searchParams.get('state');
  const callback = await local.call(`/api/social/callback/facebook?code=good&state=${nonce}`);
  const requestId = callback.text.match(/"requestId":"([^"]+)"/)[1];
  assert.equal((await local.call(local.q('/api/social/candidates'), { requestId })).status, 404);
  const candidates = await call('candidates', { requestId });
  assert.deepEqual(candidates.body.candidates.map(x => x.provider), ['facebook', 'instagram']);
  assert.deepEqual((await call('attach', { requestId, picks: [1] })).body, { connected: 1 });
  assert.equal((await call('attach', { requestId, picks: [1] })).status, 404);
  assert.deepEqual((await local.state()).socialAccounts.map(x => x.provider), ['instagram']);
  await invite({ action: 'revoke' });
  assert.equal((await call('info')).status, 404);
  assert.equal((await invite({ action: 'status' })).body.expires, null);
});

test('Tokens are sealed so stored rows never hold them in clear text', () => {
  const box = seal({ token: 'secret-token' });
  assert.ok(!box.includes('secret-token'));
  assert.deepEqual(unseal(box), { token: 'secret-token' });
  assert.equal(unseal(box.slice(0, -4) + 'AAAA'), null, 'tampered values are rejected');
});

test('Facebook login connects pages and Instagram accounts, then posts publish to each network', async t => {
  process.env.META_APP_ID = 'app-id'; process.env.META_APP_SECRET = 'app-secret';
  t.after(() => { delete process.env.META_APP_ID; delete process.env.META_APP_SECRET; });
  let onRequest;
  const calls = fakeNetworks((path, body) => onRequest?.(path, body));
  const local = await start(); t.after(local.close);

  assert.equal((await local.call(local.q('/api/state'))).body.features.social.facebook, true);
  assert.equal((await local.call(local.q('/api/social/connect/linkedin'))).status, 409, 'networks without keys cannot start a login');

  const startLogin = await local.call(local.q('/api/social/connect/instagram'));
  assert.equal(startLogin.status, 302);
  const auth = new URL(startLogin.location);
  assert.equal(auth.host, 'www.facebook.com');
  assert.match(auth.searchParams.get('scope'), /instagram_content_publish/);
  assert.match(auth.searchParams.get('redirect_uri'), /\/api\/social\/callback\/facebook$/, 'Instagram shares the Facebook redirect');

  const bad = await local.call(`/api/social/callback/facebook?code=x&state=forged`);
  assert.match(bad.text, /expirou/);
  const back = await local.call(`/api/social/callback/facebook?code=good&state=${auth.searchParams.get('state')}`);
  assert.match(back.type, /text\/html/);
  const requestId = back.text.match(/"requestId":"([^"]+)"/)[1];
  assert.equal((await local.call(`/api/social/callback/facebook?code=good&state=${auth.searchParams.get('state')}`)).text.includes('expirou'), true, 'a state works once');

  const { candidates } = (await local.call(local.q('/api/social/candidates'), { requestId })).body;
  assert.deepEqual(candidates.map(x => [x.provider, x.name]), [['facebook', 'Padaria Sol'], ['instagram', 'padariasol']]);
  const attached = await local.call(local.q('/api/social/attach'), { requestId, picks: [0, 1] });
  assert.equal(attached.status, 200);
  const raw = JSON.stringify(attached.body.state);
  assert.ok(!raw.includes('page-token') && !raw.includes('long-user'), 'tokens never reach the browser');
  const [page, ig] = attached.body.state.socialAccounts;
  assert.equal(page.provider, 'facebook'); assert.equal(ig.provider, 'instagram');
  assert.equal((await local.call(local.q('/api/social/attach'), { requestId, picks: [0] })).status, 404, 'a pending login is used once');

  // Publish now on both networks with an image from the media drive.
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const file = (await local.act({ type: 'save', key: 'files', data: { name: 'foto.png', data: png } })).body.id;
  const media = await local.call(`/m/${local.workspace}/${file}`);
  assert.equal(media.status, 200); assert.equal(media.type, 'image/png');

  const post = (await local.act({ type: 'social-post', data: { summary: 'Pão quentinho saindo agora!', accountIds: [page.id, ig.id], media: [{ fileId: file }], firstComment: '#padaria', mode: 'now' } })).body.id;
  const cronSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'fixture-social-cron';
  t.after(() => {
    if (cronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = cronSecret;
  });
  const cron = () => local.call('/api/social/cron', undefined, { Authorization: 'Bearer fixture-social-cron' });
  const callCount = calls.length;
  const scheduled = (await local.state()).socialPosts.find(row => row.id === post);
  const planResponse = await local.call('/api/agency/action', { type: 'save', key: 'plans', data: { name: 'Without marketing', price: 0, modules: ['contacts'] } });
  assert.equal(planResponse.status, 200, planResponse.body.error);
  assert.equal((await local.call('/api/agency/action', { type: 'account-meta', id: local.workspace, data: { status: 'Active', plan: planResponse.body.result } })).status, 200);
  assert.deepEqual((await cron()).body, { published: 0 });
  assert.equal((await local.call(local.q('/api/social/run'), {})).status, 403);
  assert.equal(calls.length, callCount);
  assert.equal((await local.call('/api/agency/action', { type: 'account-meta', id: local.workspace, data: { status: 'Active', plan: '' } })).status, 200);
  for (const status of ['Paused', 'Closed']) {
    const metadata = await local.call('/api/agency/action', { type: 'account-meta', id: local.workspace, data: { status } });
    assert.equal(metadata.status, 200);
    assert.deepEqual((await cron()).body, { published: 0 });
    assert.equal((await local.call(local.q('/api/social/run'), {})).body.code, 'ACCOUNT_SUSPENDED');
    assert.equal(calls.length, callCount);
    assert.deepEqual((await local.state()).socialPosts.find(row => row.id === post), scheduled);
  }
  assert.equal((await local.call('/api/agency/action', { type: 'account-reactivate', id: local.workspace })).status, 200);
  const run = await local.call(local.q('/api/social/run'), {});
  assert.equal(run.body.published, 1);
  const done = run.body.state.socialPosts.find(p => p.id === post);
  assert.equal(done.status, 'published', done.error);
  assert.deepEqual(done.results.map(r => r.url), ['https://www.facebook.com/page1_77', 'https://instagram.com/p/abc']);
  const photo = calls.find(c => c.url.includes('/page1/photos'));
  assert.equal(photo.body.caption, 'Pão quentinho saindo agora!');
  assert.match(photo.body.url, new RegExp(`/m/${local.workspace}/${file}$`), 'the network fetches the image from the public media route');
  assert.ok(calls.some(c => c.url.includes('/igpost1/comments') && c.body.message === '#padaria'), 'first comment is posted');

  const schedule = async summary => {
    const saved = await local.act({ type: 'social-post', data: {
      summary, accountIds: [page.id, ig.id], media: [{ fileId: file }], mode: 'now'
    } });
    assert.equal(saved.status, 200, saved.body.error);
    return saved.body.id;
  };
  const first = await schedule('Suspensão durante o envio');
  const pending = await schedule('Aguardando reativação');
  onRequest = async (path, body) => {
    if (!path.endsWith('/page1/photos') || body.caption !== 'Suspensão durante o envio') return;
    const paused = await local.call('/api/agency/action', { type: 'account-meta', id: local.workspace, data: { status: 'Paused' } });
    assert.equal(paused.status, 200);
  };
  const firstBatch = await cron();
  assert.deepEqual(firstBatch.body, { published: 1 });
  let posts = (await local.state()).socialPosts;
  const results = posts.find(row => row.id === first).results;
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.match(results[1].error, /suspensa/);
  assert.equal(posts.find(row => row.id === pending).status, 'scheduled');
  assert.ok(!posts.find(row => row.id === pending).claimedAt);
  assert.equal((await local.call('/api/agency/action', { type: 'account-reactivate', id: local.workspace })).status, 200);
  assert.deepEqual((await cron()).body, { published: 1 });
  posts = (await local.state()).socialPosts;
  assert.equal(posts.find(row => row.id === pending).status, 'published');
  assert.equal(calls.filter(c => c.body?.caption === 'Suspensão durante o envio').length, 1);

  // Approval: a post that needs approval waits in review until approved.
  const review = (await local.act({ type: 'social-post', data: { summary: 'Promo de sexta', accountIds: [page.id], needsApproval: true, mode: 'schedule', scheduleDate: new Date(Date.now() + 86_400_000).toISOString() } })).body.id;
  let s = await local.state();
  assert.equal(s.socialPosts.find(p => p.id === review).status, 'in_review');
  await local.act({ type: 'social-review', id: review, data: { decision: 'approved' } });
  s = await local.state();
  assert.equal(s.socialPosts.find(p => p.id === review).status, 'scheduled');
  assert.equal((await local.act({ type: 'social-post', id: post, data: { summary: 'editar', accountIds: [page.id], mode: 'draft' } })).status, 409, 'published posts are locked');

  // CSV: rows become scheduled posts; unknown accounts are reported per line.
  const csv = await local.act({ type: 'social-csv', data: { file: 'lote.csv', offset: '-03:00', rows: [
    { date: '2030-01-10 09:00', content: 'Post do lote', accounts: 'Padaria Sol' },
    { date: '2030-01-11 09:00', content: 'Outro', accounts: 'Conta que não existe' }] } });
  assert.equal(csv.body.id.created, 1); assert.match(csv.body.id.errors[0], /Linha 3/);
  s = await local.state();
  assert.equal(s.socialPosts.find(p => p.summary === 'Post do lote').scheduleDate, '2030-01-10T12:00:00.000Z', 'CSV times use the sub-account offset');

  // Disconnecting an account turns its only-scheduled posts back into drafts.
  await local.call(local.q('/api/social/disconnect'), { id: page.id });
  s = await local.state();
  assert.equal(s.socialPosts.find(p => p.id === review).status, 'draft');
});

test('A social OAuth callback rechecks the current permissions of the member who began it', async t => {
  process.env.META_APP_ID = 'app-id';
  process.env.META_APP_SECRET = 'app-secret';
  t.after(() => { delete process.env.META_APP_ID; delete process.env.META_APP_SECRET; });
  const local = await start();
  t.after(local.close);
  const calls = fakeNetworks();
  const profile = { first: 'Social', last: 'Member', email: 'social@example.test', role: 'Account User', accounts: [local.workspace] };
  const save = (permissions, id) => local.call('/api/agency/action', { type: 'save', key: 'users', id, data: { ...profile, permissions } });
  const member = await save(['marketing']);
  assert.equal(member.status, 200);
  const id = member.body.result;
  const begin = await local.call(local.q(`/api/social/connect/facebook?user=${id}`));
  assert.equal(begin.status, 302);
  assert.equal((await save(['contacts'], id)).status, 200);
  const state = new URL(begin.location).searchParams.get('state');
  const callback = await local.call(`/api/social/callback/facebook?code=good&state=${state}`);
  assert.match(callback.text, /não tem permissão/);
  assert.doesNotMatch(callback.text, /"requestId":"/);
  assert.equal(calls.length, 0);
});

test('Bluesky connects with an app password and publishes with link facets', async t => {
  const calls = fakeNetworks();
  const local = await start(); t.after(local.close);
  assert.equal((await local.call(local.q('/api/social/bluesky'), { identifier: 'me.bsky.social', password: 'minha-senha' })).status, 400, 'the main password is refused');
  assert.equal((await local.call(local.q('/api/social/bluesky'), { identifier: 'me.bsky.social', password: 'zzzz-zzzz-zzzz-zzzz' })).status, 502);
  const ok = await local.call(local.q('/api/social/bluesky'), { identifier: '@me.bsky.social', password: 'abcd-efgh-ijkl-mnop' });
  assert.equal(ok.status, 200);
  const account = ok.body.state.socialAccounts[0];
  assert.equal(account.name, 'Eu no Bluesky');
  await local.act({ type: 'social-post', data: { summary: 'Novo post https://graao.com #marketing', accountIds: [account.id], mode: 'now' } });
  const run = await local.call(local.q('/api/social/run'), {});
  const post = run.body.state.socialPosts[0];
  assert.equal(post.status, 'published', post.error);
  assert.equal(post.results[0].url, 'https://bsky.app/profile/did:plc:me/post/3kxyz');
  const record = calls.find(c => c.url.endsWith('createRecord')).body.record;
  assert.deepEqual(record.facets.map(f => f.features[0].$type), ['app.bsky.richtext.facet#link', 'app.bsky.richtext.facet#tag']);
  assert.equal(calls.find(c => c.url.endsWith('createRecord')).auth, 'Bearer a2', 'the session is refreshed before posting');
});

test('Clients approve or ask for changes from a revocable approval link without logging in', async t => {
  fakeNetworks();
  const local = await start(); t.after(local.close);
  const account = (await local.call(local.q('/api/social/bluesky'), { identifier: 'me.bsky.social', password: 'abcd-efgh-ijkl-mnop' })).body.state.socialAccounts[0];
  const later = new Date(Date.now() + 86_400_000).toISOString();
  const post = data => local.act({ type: 'social-post', data: { accountIds: [account.id], mode: 'schedule', scheduleDate: later, needsApproval: true, ...data } });
  const first = (await post({ summary: 'Lançamento de verão', media: [{ url: 'https://example.com/verao.jpg' }] })).body.id;
  const second = (await post({ summary: 'Promoção da semana' })).body.id;

  const link = action => local.call(local.q('/api/social/approval-link'), action);
  assert.equal((await link({ action: 'create', hours: 5 })).status, 400, 'only the offered validity periods are accepted');
  const created = (await link({ action: 'create', hours: 168 })).body;
  const page = new URL(created.url), token = page.hash.slice(1);
  assert.equal(page.pathname, `/aprovar/${local.workspace}`);
  const html = await local.call(page.pathname);
  assert.match(html.text, /Posts aguardando sua aprovação/);
  assert.equal((await link({ action: 'status' })).body.expires, created.expires);
  assert.equal((await link({ action: 'send-whatsapp' })).status, 400, 'phone is required');
  assert.equal((await link({ action: 'send-whatsapp', phone: '11999998888', url: created.url })).status, 400, 'reports when whatsapp is not connected');

  const call = (action, extra = {}) => local.call(local.q('/api/social/approval'), { action, token, ...extra });
  assert.equal((await local.call('/api/social/approval?workspace=demo', { action: 'list', token })).status, 404, 'a token only opens its own workspace');
  assert.equal((await local.call(local.q('/api/social/approval'), { action: 'list', token: 'f'.repeat(64) })).status, 404);
  const listed = (await call('list')).body;
  assert.deepEqual(listed.posts.map(p => p.summary), ['Lançamento de verão', 'Promoção da semana']);
  assert.deepEqual(listed.posts[0].media, [{ type: 'image', src: 'https://example.com/verao.jpg' }]);
  assert.deepEqual(listed.posts[0].accounts, [{ name: 'Eu no Bluesky', provider: 'bluesky', network: 'Bluesky' }]);
  assert.equal(JSON.stringify(listed).includes(account.id), false, 'internal ids of accounts stay private');

  assert.equal((await call('decide', { postId: first, decision: 'approved' })).status, 400, 'the reviewer must say who they are');
  assert.equal((await call('decide', { postId: second, decision: 'rejected', name: 'Ana' })).status, 400, 'asking for changes needs a comment');
  await call('decide', { postId: first, decision: 'approved', name: 'Ana' });
  const after = (await call('decide', { postId: second, decision: 'rejected', name: 'Ana', note: 'Trocar a foto' })).body;
  assert.equal(after.posts.length, 0);
  assert.deepEqual(after.reviewed.map(r => [r.approval, r.by]).sort(), [['approved', 'Ana'], ['rejected', 'Ana']]);
  assert.equal((await call('decide', { postId: first, decision: 'approved', name: 'Ana' })).status, 409, 'a post is decided once');

  const state = await local.state();
  const byId = id => state.socialPosts.find(p => p.id === id);
  assert.deepEqual([byId(first).status, byId(first).reviewedBy], ['scheduled', 'Ana (cliente)']);
  assert.deepEqual([byId(second).status, byId(second).approval, byId(second).reviewNote], ['draft', 'rejected', 'Trocar a foto']);

  await link({ action: 'revoke' });
  assert.equal((await call('list')).status, 404);
  assert.equal((await link({ action: 'status' })).body.expires, null);
});

test('Caption AI explains how to connect OpenAI and keeps hashtags apart from the text', async t => {
  const local = await start(); t.after(local.close);
  assert.equal((await local.call(local.q('/api/social/ai'), { brief: '' })).status, 400);
  const missing = await local.call(local.q('/api/social/ai'), { brief: 'Cardápio de verão' });
  assert.equal(missing.status, 409);
  assert.match(missing.body.error, /OpenAI/);

  let sent;
  const request = async (_url, init) => {
    sent = JSON.parse(init.body);
    return reply({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ caption: 'Chegou o verão! [[preço]]', hashtags: ['#verao', 'cardápio', 'promo!', 'verao', 'comida boa'] }) }] }] });
  };
  const result = await writeCaption({ apiKey: 'sk-test', model: 'test-model', request }, { brief: 'Cardápio de verão', providers: ['bluesky', 'instagram'], tone: 'divertido' });
  assert.deepEqual(result, { caption: 'Chegou o verão! [[preço]]', hashtags: ['verao', 'cardápio', 'comidaboa'] });
  assert.match(sent.instructions, /Bluesky, Instagram/);
  assert.match(sent.instructions, /divertido/);
  assert.match(sent.instructions, /at most 200 characters/, 'the shortest network limit drives the caption size');
});

test('Best posting times favour slots shared by the chosen networks and skip busy times', () => {
  const wednesday = bestTimes(['instagram', 'facebook'], 3, { busy: ['11:10'] });
  assert.ok(wednesday.some(s => s.time === '13:00' && s.networks === 2), 'a slot good for both networks is suggested');
  assert.ok(!wednesday.some(s => s.time === '11:00'), 'a slot next to another post is skipped');
  assert.deepEqual(wednesday.map(s => s.time), [...wednesday.map(s => s.time)].sort(), 'suggestions read in time order');
  assert.deepEqual(bestTimes(['linkedin'], 0), [], 'no forced suggestion for a network whose audience is away on weekends');
  assert.equal(bestTimes(['tiktok'], 2, { history: ['19:20'] }).find(s => s.time === '19:00').habit, true, 'slots near past publishing times are marked');
  assert.ok(bestTimes([], 1).length > 0, 'without accounts there are still general suggestions');
});

test('Social secret rows satisfy the Supabase rule that every row has profile.name', async t => {
  process.env.META_APP_ID = 'app-id'; process.env.META_APP_SECRET = 'app-secret';
  t.after(() => { delete process.env.META_APP_ID; delete process.env.META_APP_SECRET; });
  // go_workspaces.name is generated from state.profile.name and NOT NULL in Supabase.
  const sqlite = createSqliteStore(':memory:');
  const store = { ...sqlite, insert: (id, state) => { if (!state?.profile?.name) throw Object.assign(new Error('Supabase Data API request failed (400).'), {}); return sqlite.insert(id, state); } };
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const r = await fetch(`http://${host}:${server.address().port}/api/social/connect/facebook?workspace=demo`, { redirect: 'manual' });
  assert.equal(r.status, 302);
  assert.match(r.headers.get('location'), /facebook\.com/);
});

test('Social webhooks save and validate outbound URLs and event triggers', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const base = `http://${host}:${server.address().port}`;
  const res = await fetch(`${base}/api/action?workspace=demo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'save',
      key: 'socialWebhooks',
      data: {
        name: 'Notificações n8n',
        url: 'https://webhook.site/test-uuid',
        events: ['post.published', 'post.failed'],
        active: true
      }
    })
  });
  assert.equal(res.status, 200);
  const { id } = await res.json();
  assert.ok(id, 'webhook created with id');

  const state = await store.load('demo');
  const wh = state.socialWebhooks.find(w => w.id === id);
  assert.equal(wh.name, 'Notificações n8n');
  assert.equal(wh.url, 'https://webhook.site/test-uuid');
  assert.deepEqual(wh.events, ['post.published', 'post.failed']);
  assert.equal(wh.active, true);
});

test('Social interactions ingest into Conversations inbox as Instagram/Facebook messages and create leads', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const base = `http://${host}:${server.address().port}`;

  // 1. Simula chegada de comentário do Instagram
  const res = await fetch(`${base}/api/social/interactions?workspace=demo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      network: 'instagram',
      kind: 'comment',
      handle: 'luiz.caramelo',
      authorName: 'Luiz Caramelo',
      body: 'Qual o valor desse serviço?'
    })
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.ok(data.contactId, 'created lead in CRM');
  assert.ok(data.msgId, 'created inbound message in conversations');

  // 2. Valida o contato criado e a mensagem no Inbox
  const state = await store.load('demo');
  const contact = state.contacts.find(c => c.id === data.contactId);
  assert.equal(contact.name, 'Luiz Caramelo');
  assert.ok(contact.tags.includes('Instagram'));

  const msg = state.messages.find(m => m.id === data.msgId);
  assert.equal(msg.channel, 'Instagram');
  assert.equal(msg.direction, 'Inbound');
  assert.equal(msg.body, 'Qual o valor desse serviço?');

  // 3. Atendente responde pelo canal Instagram
  const replyRes = await fetch(`${base}/api/action?workspace=demo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'message',
      data: {
        contactId: contact.id,
        channel: 'Instagram',
        direction: 'Outbound',
        body: 'Olá Luiz! Te mandamos os detalhes por mensagem privada.'
      }
    })
  });
  assert.equal(replyRes.status, 200);
  const replyJson = await replyRes.json();
  assert.ok(replyJson.id);

  const updatedState = await store.load('demo');
  const replyMsg = updatedState.messages.find(m => m.id === replyJson.id);
  assert.equal(replyMsg.channel, 'Instagram');
  assert.equal(replyMsg.direction, 'Outbound');
});

test('Competitor benchmarking records and post location/userTags metadata persist', async t => {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const base = `http://${host}:${server.address().port}`;

  // 1. Cadastra um concorrente
  const compRes = await fetch(`${base}/api/action?workspace=demo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'save',
      key: 'socialCompetitors',
      data: {
        name: 'Agência Rival',
        handle: 'agenciarival',
        network: 'instagram',
        followers: 45000,
        postsPerWeek: 5,
        notes: 'Forte presença em reels com ofertas diretas'
      }
    })
  });
  assert.equal(compRes.status, 200);
  const compJson = await compRes.json();
  assert.ok(compJson.id);

  // 2. Cria post com localização e menções/marcações
  const postRes = await fetch(`${base}/api/action?workspace=demo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'social-post',
      data: {
        summary: 'Inauguração do novo escritório em BH!',
        location: 'Belo Horizonte, MG',
        userTags: '@caramelo.designer, @graao.app',
        mode: 'draft'
      }
    })
  });
  assert.equal(postRes.status, 200);
  const postJson = await postRes.json();
  assert.ok(postJson.id);

  const state = await store.load('demo');
  const competitor = state.socialCompetitors.find(c => c.id === compJson.id);
  assert.equal(competitor.name, 'Agência Rival');
  assert.equal(competitor.handle, 'agenciarival');
  assert.equal(competitor.followers, 45000);
  assert.equal(competitor.postsPerWeek, 5);

  const post = state.socialPosts.find(p => p.id === postJson.id);
  assert.equal(post.location, 'Belo Horizonte, MG');
  assert.equal(post.userTags, '@caramelo.designer, @graao.app');
});
