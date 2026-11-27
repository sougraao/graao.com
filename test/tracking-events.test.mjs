// Eventos do rastreamento externo em tabela própria (P2.5): os dois bancos, a gravação pela rota pública,
// a leitura paginada, a passagem dos eventos antigos do documento e o funcionamento sem a tabela.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { blank } from '../model.mjs';
import { copyTrackingEvents, createSqliteStore, createSupabaseStore } from '../storage.mjs';
import { createTrackingLog, eventsPage, eventsSummary, TRACKING_DAYS } from '../tracking-events.mjs';
import { makeServer } from '../server.mjs';

const DAY = 86400000;
const iso = ms => new Date(ms).toISOString();
const row = (n, extra = {}) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, created: iso(Date.now() - 1000 * (1000 - n)), type: 'pageview', vid: 'visitor0001',
  url: 'https://www.loja.com.br/', title: 'Loja', event: '', contactId: '', ...extra });

/** Counts the writes to the documents and lets a test break the events table. */
function watched(store = createSqliteStore(':memory:')) {
  const seen = { changes: [], loads: 0, fail: null };
  return { seen, store: { ...store,
    load: id => { if (id === 'demo') seen.loads++; return store.load(id); },
    change: (id, mutate) => { seen.changes.push(id); return store.change(id, mutate); },
    tracking: { ...store.tracking, append: (...args) => { if (seen.fail) throw seen.fail; return store.tracking.append(...args); } } } };
}
const unavailable = () => Object.assign(new Error('sem tabela'), { code: 'tracking_unavailable' });

async function serve(t, store) {
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const get = async path => { const r = await fetch(base + path); return { status: r.status, body: await r.json().catch(() => ({})) }; };
  assert.equal((await get('/api/state?workspace=demo')).status, 200);
  const send = (data, origin = 'https://www.loja.com.br') => fetch(`${base}/t/demo/e`, { method: 'POST', headers: { 'Content-Type': 'text/plain', Origin: origin },
    body: JSON.stringify({ vid: 'visitor0001', type: 'pageview', url: `${origin}/`, ...data }) }).then(r => r.status);
  return { base, get, send, events: (query = '') => get(`/api/tracking/events?workspace=demo${query}`) };
}

test('SQLite: the events table keeps one row per id, separated by sub-account', () => {
  const { tracking } = createSqliteStore(':memory:');
  tracking.append('demo', [row(1), row(2)]);
  tracking.append('demo', [row(2), row(3)]);
  tracking.append('outra', [row(4)]);
  assert.deepEqual(tracking.page('demo').events.map(e => e.id), [row(3).id, row(2).id, row(1).id], 'newest first, no duplicates');
  assert.deepEqual(tracking.page('outra').events.map(e => e.id), [row(4).id]);
});

test('SQLite: pages follow the cursor without skipping rows created in the same instant', () => {
  const { tracking } = createSqliteStore(':memory:');
  const at = iso(Date.now());
  tracking.append('demo', Array.from({ length: 7 }, (_, n) => row(n, { created: at })));
  const ids = [];
  for (let before = ''; ;) {
    const page = tracking.page('demo', { limit: 3, before });
    ids.push(...page.events.map(e => e.id));
    if (!page.next) break;
    before = page.next;
  }
  assert.equal(ids.length, 7);
  assert.equal(new Set(ids).size, 7);
});

test('SQLite and the document give the same page and the same summary', () => {
  const now = Date.now();
  const rows = [
    row(1, { created: iso(now - 9 * DAY) }),
    row(2, { created: iso(now - 2 * DAY), vid: 'visitor0002', contactId: 'ana' }),
    row(3, { created: iso(now - DAY), type: 'form', form: 'contato', contactId: 'ana', fields: { email: 'ana@exemplo.com' } }),
    row(4, { created: iso(now - DAY / 2), type: 'form', form: '', url: 'https://www.loja.com.br/orcamento?x=1', contactId: 'bia', fields: {} }),
    row(5, { created: iso(now - DAY / 4), type: 'form', form: '', url: 'https://loja.com.br/orcamento', contactId: 'caio', fields: {} }),
    row(6, { created: iso(now - 1000), type: 'video', event: '50', video: 'https://x.test/v.mp4', name: '' })
  ];
  const { tracking } = createSqliteStore(':memory:');
  tracking.append('demo', rows);
  const since = iso(now - 7 * DAY);
  const summary = tracking.summary('demo', since);
  assert.deepEqual(summary, eventsSummary(rows, since));
  assert.deepEqual({ views: summary.views, forms: summary.forms, known: summary.known, visitors: summary.visitors }, { views: 1, forms: 3, known: 3, visitors: 2 });
  assert.equal(summary.last.id, rows[5].id);
  assert.deepEqual(summary.byForm.map(f => [f.name, f.total, f.contacts]), [['loja.com.br/orcamento', 2, 2], ['contato', 1, 1]], 'a form with no name is grouped by its page');
  for (const query of [{}, { type: 'form' }, { limit: 2 }, { type: 'form', limit: 1, before: tracking.page('demo', { type: 'form', limit: 1 }).next }]) {
    assert.deepEqual(tracking.page('demo', query), eventsPage(rows, query));
  }
  assert.equal('fields' in tracking.page('demo', { type: 'form' }).events[0], false, 'the answers of a form are not listed');
});

test('SQLite: prune removes only the events older than the limit', () => {
  const { tracking } = createSqliteStore(':memory:');
  tracking.append('demo', [row(1, { created: '2025-01-01T00:00:00.000Z' }), row(2)]);
  tracking.prune('2026-01-01T00:00:00.000Z');
  assert.deepEqual(tracking.page('demo').events.map(e => e.id), [row(2).id]);
});

test('Supabase: append, page, summary and prune use the Data API with the storage key', async () => {
  const calls = [];
  const reply = { last: null, views: 0, forms: 0, known: 0, visitors: 0, byForm: [] };
  const { tracking } = createSupabaseStore({ projectUrl: 'https://test.supabase.co', publishableKey: 'sb_publishable_test', storageKey: 'a'.repeat(64),
    async request(url, options) {
      calls.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), method: options.method, body: options.body && JSON.parse(options.body), headers: options.headers });
      if (options.method === 'GET') return Response.json([3, 2, 1].map(n => ({ data: row(n, { fields: { email: 'x@y.z' } }) })));
      if (url.pathname.includes('/rpc/')) return Response.json(reply);
      return new Response(null, { status: options.method === 'POST' ? 201 : 204 });
    } });
  await tracking.append('demo', [row(1)]);
  const page = await tracking.page('demo', { type: 'form', limit: 2, before: `2026-11-20T10:00:00.000Z_${row(9).id}` });
  assert.deepEqual(await tracking.summary('demo', '2026-11-16T00:00:00.000Z'), reply);
  await tracking.prune('2025-11-01T00:00:00.000Z');
  assert.ok(calls.every(call => call.headers['X-Go-Storage-Key'] === 'a'.repeat(64)));
  assert.equal(calls[0].path, '/rest/v1/go_tracking_events');
  assert.equal(calls[0].query.on_conflict, 'workspace,id');
  assert.match(calls[0].headers.Prefer, /resolution=ignore-duplicates/);
  assert.deepEqual(calls[0].body, [{ workspace: 'demo', id: row(1).id, created_at: calls[0].body[0].created_at, data: { ...row(1), created: calls[0].body[0].created_at } }]);
  assert.deepEqual(calls[1].query, { select: 'data', workspace: 'eq.demo', type: 'eq.form', order: 'created_at.desc,id.desc', limit: '3',
    or: `(created_at.lt."2026-11-20T10:00:00.000Z",and(created_at.eq."2026-11-20T10:00:00.000Z",id.lt."${row(9).id}"))` });
  assert.equal(page.events.length, 2);
  assert.equal(page.next, `${page.events[1].created}_${page.events[1].id}`);
  assert.equal('fields' in page.events[0], false);
  assert.deepEqual([calls[2].path, calls[2].body], ['/rest/v1/rpc/go_tracking_summary', { p_workspace: 'demo', p_since: '2026-11-16T00:00:00.000Z' }]);
  assert.deepEqual([calls[3].method, calls[3].query], ['DELETE', { created_at: 'lt.2025-11-01T00:00:00.000Z' }]);
});

test('Supabase: a project without the table (or without its grants) answers "unavailable" and is not asked again for a while', async () => {
  for (const [status, code] of [[404, 'PGRST205'], [404, 'PGRST202'], [401, '42501']]) {
    let calls = 0, at = 1_000_000;
    const { tracking } = createSupabaseStore({ projectUrl: 'https://test.supabase.co', publishableKey: 'k', storageKey: 'a'.repeat(64), clock: () => at,
      async request() { calls++; return Response.json({ code }, { status }); } });
    await assert.rejects(tracking.append('demo', [row(1)]), { code: 'tracking_unavailable' });
    await assert.rejects(tracking.page('demo'), { code: 'tracking_unavailable' });
    assert.equal(calls, 1, `${code}: remembered`);
    at += 6 * 60_000;
    await assert.rejects(tracking.page('demo'), { code: 'tracking_unavailable' });
    assert.equal(calls, 2, `${code}: checked again after five minutes`);
  }
  const broken = createSupabaseStore({ projectUrl: 'https://test.supabase.co', publishableKey: 'k', storageKey: 'a'.repeat(64), async request() { return Response.json({ code: 'XX000' }, { status: 500 }); } });
  await assert.rejects(broken.tracking.append('demo', [row(1)]), error => error.code === undefined && /500/.test(error.message));
});

test('An anonymous visit goes to the table and does not rewrite the sub-account document', async t => {
  const { seen, store } = watched();
  const { send, events } = await serve(t, store);
  seen.changes.length = 0;
  assert.equal(await send({ title: 'Início' }), 204);
  assert.deepEqual(seen.changes, [], 'no document was saved');
  const { status, body } = await events();
  assert.equal(status, 200);
  assert.deepEqual(body.events.map(e => [e.type, e.title, e.vid, e.contactId]), [['pageview', 'Início', 'visitor0001', '']]);
  assert.equal(body.summary.visitors, 1);
  assert.equal(body.next, '');
  assert.equal((await store.load('demo')).trackingEvents.length, 0);
});

test('A form creates the contact once, and its event is stored in the table already linked to the contact', async t => {
  const { seen, store } = watched();
  const { send, events } = await serve(t, store);
  seen.changes.length = 0;
  assert.equal(await send({ type: 'form', form: 'contato', fields: { nome: 'Bia', email: 'bia@exemplo.com', mensagem: 'Oi' } }), 204);
  assert.deepEqual(seen.changes.filter(id => id === 'demo').length, 1);
  const state = await store.load('demo'), bia = state.contacts.find(c => c.email === 'bia@exemplo.com');
  assert.ok(bia);
  assert.match(state.messages.find(m => m.contactId === bia.id && m.origin === 'tracking').body, /mensagem: Oi/);
  assert.equal(state.trackingEvents.length, 0);
  assert.equal(await send({ url: 'https://www.loja.com.br/obrigado' }), 204);
  const { body } = await events();
  assert.deepEqual(body.events.map(e => [e.type, e.contactId]), [['pageview', bia.id], ['form', bia.id]], 'later visits of that browser count for the contact');
  assert.deepEqual(body.summary.byForm.map(f => [f.name, f.total, f.contacts]), [['contato', 1, 1]]);
  assert.equal((await events('&type=form')).body.events.length, 1);
});

test('A known visitor still fires the workflows when the event lives in the table', async t => {
  const { store } = watched();
  const { base, send } = await serve(t, store);
  const save = await fetch(`${base}/api/action?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ type: 'save', key: 'workflows',
    data: { name: 'Visitou', active: true, triggers: [{ type: 'external_tracking_event', config: { event: 'pageview' } }], steps: [{ type: 'add_tag', config: { tag: 'visitou' } }] } }) });
  assert.equal(save.status, 200);
  await send({ type: 'form', fields: { email: 'caio@exemplo.com' } });
  await send({ url: 'https://www.loja.com.br/precos' });
  assert.ok((await store.load('demo')).contacts.find(c => c.email === 'caio@exemplo.com').tags.includes('visitou'));
});

test('Settings still rule: a domain outside the list is refused and a recording turned off stores nothing', async t => {
  const { store } = watched();
  const { send, events } = await serve(t, store);
  store.change('demo', s => { s.tracking.domains = ['loja.com.br']; s.tracking.pageviews = false; });
  assert.equal(await send({}, 'https://outra.com.br'), 403);
  assert.equal(await send({}), 204);
  assert.equal(await send({ vid: 'x' }), 400);
  assert.deepEqual((await events()).body.events, []);
});

test('Events already in the document move to the table, with nothing lost or repeated', async t => {
  const { store } = watched();
  const { send, events } = await serve(t, store);
  store.change('demo', s => { s.trackingEvents = [row(1), row(2, { type: 'form', form: 'antigo', contactId: 'x' })]; });
  store.tracking.append('demo', [row(1)]);
  assert.deepEqual((await events()).body.events.map(e => e.id), [row(2).id, row(1).id], 'opening the screen moves them');
  assert.equal((await store.load('demo')).trackingEvents.length, 0);
  store.change('demo', s => { s.trackingEvents = [row(3)]; });
  await send({});
  assert.equal((await store.load('demo')).trackingEvents.length, 0, 'a new event moves them too');
  assert.equal((await events()).body.events.length, 4);
});

test('Without the table everything works as before, in the document', async t => {
  const { seen, store } = watched();
  seen.fail = unavailable();
  const { send, events } = await serve(t, store);
  seen.loads = 0;
  assert.equal(await send({ title: 'Início' }), 204);
  const tried = seen.loads;
  seen.loads = 0;
  // Os dois eventos precisam de horários diferentes: no mesmo milissegundo a ordem cai no id aleatório.
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(await send({ type: 'form', form: 'contato', fields: { email: 'bia@exemplo.com' } }), 204);
  assert.equal(seen.loads, tried - 1, 'no extra read of the document while the table is known to be missing');
  const state = await store.load('demo');
  assert.deepEqual(state.trackingEvents.map(e => e.type), ['pageview', 'form']);
  const { body } = await events();
  assert.deepEqual(body.events.map(e => e.type), ['form', 'pageview']);
  assert.equal(body.summary.forms, 1);
  seen.fail = null;
  assert.equal((await events()).body.events.length, 2, 'once the table exists, they move');
  assert.equal((await store.load('demo')).trackingEvents.length, 0);
});

test('A store with no events table (another adapter) keeps the document', async t => {
  const { tracking, ...store } = createSqliteStore(':memory:');
  assert.ok(tracking);
  const { send, events } = await serve(t, store);
  assert.equal(await send({}), 204);
  assert.equal((await store.load('demo')).trackingEvents.length, 1);
  assert.equal((await events()).body.events.length, 1);
});

test('If the table fails after the contact was saved, the event goes back to the document', async t => {
  const { seen, store } = watched();
  const { send } = await serve(t, store);
  seen.fail = new Error('Supabase Data API request failed (500).');
  const warn = console.error;
  console.error = () => {};
  t.after(() => { console.error = warn; });
  assert.equal(await send({ type: 'form', fields: { email: 'bia@exemplo.com' } }), 204);
  const state = await store.load('demo');
  assert.equal(state.contacts.filter(c => c.email === 'bia@exemplo.com').length, 1);
  assert.deepEqual(state.trackingEvents.map(e => e.type), ['form']);
});

test('The events endpoint pages, limits the size and refuses an unknown sub-account', async t => {
  const { store } = watched();
  const { get, events } = await serve(t, store);
  store.tracking.append('demo', Array.from({ length: 120 }, (_, n) => row(n)));
  const first = (await events()).body;
  assert.equal(first.events.length, 100);
  const second = (await events(`&before=${encodeURIComponent(first.next)}`)).body;
  assert.equal(second.events.length, 20);
  assert.equal(second.next, '');
  assert.equal('summary' in second, false, 'the summary comes only with the first page');
  assert.equal((await events('&before=lixo')).status, 400);
  assert.equal((await get('/api/tracking/events?workspace=naoexiste')).status, 404);
});

test('The daily sweep drops events past the retention, once per day, and never throws', async () => {
  const seen = [];
  const store = { load: async () => blank('x'), tracking: { prune: async before => { seen.push(before); } } };
  const log = createTrackingLog({ store });
  const at = Date.parse('2026-11-24T10:00:00.000Z');
  await log.sweep(at); await log.sweep(at + 60_000); await log.sweep(at + DAY);
  assert.deepEqual(seen, [iso(at - TRACKING_DAYS * DAY), iso(at + DAY - TRACKING_DAYS * DAY)]);
  await createTrackingLog({ store: { tracking: { prune: async () => { throw unavailable(); } } } }).sweep(at);
  await createTrackingLog({ store: {} }).sweep(at);
});

test('migrate:sqlite copies the events of each sub-account, and accepts a database older than the table', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'graao-tracking-'));
  const source = createSqliteStore(join(dir, 'go.sqlite')), target = createSqliteStore(':memory:');
  source.tracking.append('demo', [row(1), row(2)]);
  source.tracking.append('outra', [row(3)]);
  source.close();
  const db = new DatabaseSync(join(dir, 'go.sqlite'), { readOnly: true });
  assert.equal(await copyTrackingEvents(db, target), 3);
  db.close();
  assert.deepEqual(target.tracking.page('demo').events.map(e => e.id), [row(2).id, row(1).id]);
  assert.deepEqual(target.tracking.page('outra').events.map(e => e.id), [row(3).id]);
  const old = new DatabaseSync(':memory:');
  assert.equal(await copyTrackingEvents(old, target), 0);
  old.close();
  rmSync(dir, { recursive: true, force: true });
});
