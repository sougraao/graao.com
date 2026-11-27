// Log de auditoria da agência em tabela própria (P2.5, fatia 2): os dois bancos, a anotação avulsa que não regrava o
// documento, a passagem em lotes do que está no documento, a leitura paginada com busca, as permissões e o
// funcionamento sem a tabela.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { copyAuditEntries, createSqliteStore, createSupabaseStore } from '../storage.mjs';
import { AUDIT_BATCH, AUDIT_DAYS, AUDIT_IN_DOCUMENT, createAuditLog, entriesPage, entryId } from '../agency-audit.mjs';
import { makeServer } from '../server.mjs';

const DAY = 86400000;
const iso = ms => new Date(ms).toISOString();
const base0 = Date.parse('2026-11-01T12:00:00.000Z');
const row = (n, extra = {}) => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, at: iso(base0 + 1000 * n), actor: 'Ana Lima',
  action: 'Saved contacts', target: 'Loja', details: '', ...extra });
const unavailable = () => Object.assign(new Error('sem tabela'), { code: 'audit_unavailable' });
const quiet = async (t, fn) => { const keep = console.error; console.error = () => {}; t.after(() => { console.error = keep; }); try { return await fn(); } finally { console.error = keep; } };

/** Counts the writes to the documents and lets a test break the table. */
function watched(store = createSqliteStore(':memory:')) {
  const seen = { changes: [], fail: null };
  return { seen, store: { ...store,
    change: (id, mutate) => { seen.changes.push(id); return store.change(id, mutate); },
    audit: { ...store.audit, append: (...args) => { if (seen.fail) throw seen.fail; return store.audit.append(...args); },
      page: (...args) => { if (seen.fail) throw seen.fail; return store.audit.page(...args); } } } };
}
async function serve(t, store) {
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  assert.equal((await call('/api/state?workspace=demo')).status, 200);
  const save = (name, headers) => call('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name } }, headers);
  return { call, save, act: (body, headers) => call('/api/agency/action', body, headers) };
}
const ids = page => page.entries.map(e => e.id);

test('SQLite: one row per id, separated by agency, newest first', () => {
  const { audit } = createSqliteStore(':memory:');
  audit.append('agency', [row(1), row(2)]);
  audit.append('agency', [row(2), row(3)]);
  audit.append('agency-2', [row(4)]);
  assert.deepEqual(ids(audit.page('agency')), [row(3).id, row(2).id, row(1).id]);
  assert.deepEqual(ids(audit.page('agency-2')), [row(4).id]);
});

test('SQLite and the document answer the same: search, target and cursor, with ties in the same instant', () => {
  const { audit } = createSqliteStore(':memory:');
  const rows = [row(1), row(2, { actor: 'João 100%_real', action: 'Sub-account created', target: 'demo' }), row(3, { target: 'demo', details: 'Plano "Ouro"' }),
    row(4, { at: row(3).at }), row(5, { at: row(3).at, actor: 'ÁLVARO' }), row(6, { target: '' })];
  audit.append('agency', rows);
  const queries = [{}, { q: 'sub-ACCOUNT' }, { q: '100%_REAL' }, { q: '%' }, { q: 'álvaro' }, { q: 'nada disso' }, { targets: ['Loja', 'demo'] }, { targets: ['demo'], q: 'ouro' }, { targets: [] }, { limit: 2 }];
  for (const query of queries) assert.deepEqual(audit.page('agency', query), entriesPage(rows, query), JSON.stringify(query));
  const all = [];
  for (let before = ''; ;) { const page = audit.page('agency', { limit: 2, before }); all.push(...ids(page)); before = page.next; if (!before) break; }
  assert.deepEqual(all, ids(audit.page('agency')), 'no row skipped or repeated');
  assert.throws(() => audit.page('agency', { before: "x' or 1=1" }), error => error.status === 400);
});

test('An old entry without id or with a broken date is stored once and does not stop the others', () => {
  const { audit } = createSqliteStore(':memory:');
  const old = { at: 'ontem', actor: 'Ana', action: 'Antiga' };
  audit.append('agency', [old, row(1)]);
  audit.append('agency', [old]);
  assert.equal(audit.page('agency').entries.length, 2);
  assert.equal(entryId(old), entryId({ ...old }));
});

test('Supabase: append, page with search and sub-account, and prune use the Data API with the storage key', async () => {
  const seen = [];
  const store = createSupabaseStore({ projectUrl: 'https://abc.supabase.co', publishableKey: 'pk', storageKey: 'a'.repeat(64),
    request: async (url, options) => { seen.push({ url: new URL(url), ...options }); return new Response(options.method === 'GET' ? JSON.stringify([{ data: row(2) }, { data: row(1) }]) : null, { status: options.method === 'GET' ? 200 : 201 }); } });
  await store.audit.append('agency', [row(1, { details: 'Áé' })]);
  const body = JSON.parse(seen[0].body);
  assert.equal(seen[0].url.pathname, '/rest/v1/go_agency_audit');
  assert.equal(seen[0].headers['X-Go-Storage-Key'], 'a'.repeat(64));
  assert.match(seen[0].headers.Prefer, /ignore-duplicates/);
  assert.deepEqual([body[0].agency, body[0].id, body[0].created_at, body[0].target], ['agency', row(1).id, row(1).at, 'Loja']);
  assert.equal(body[0].search, 'ana lima\nsaved contacts\nloja\náé');
  const page = await store.audit.page('agency-9', { q: '50%_A*b\\', targets: ['A "b", c\\', 'demo'], before: `${row(5).at}_${row(5).id}`, limit: 1 });
  const query = seen[1].url.searchParams;
  assert.equal(query.get('agency'), 'eq.agency-9');
  assert.equal(query.get('search'), 'like.*50\\%\\_a_b\\\\*');
  assert.equal(query.get('target'), 'in.("A \\"b\\", c\\\\","demo")');
  assert.equal(query.get('limit'), '2');
  assert.match(query.get('or'), /^\(created_at\.lt\."2026-/);
  assert.deepEqual(page, { entries: [row(2)], next: `${row(2).at}_${row(2).id}` });
  await store.audit.prune(row(1).at);
  assert.equal(seen[2].method, 'DELETE');
  assert.equal(seen[2].url.searchParams.get('created_at'), `lt.${row(1).at}`);
});

test('Supabase: without the audit table the answer is "unavailable" for a while, and the tracking table is not affected', async () => {
  let at = 0; const asked = [];
  const store = createSupabaseStore({ projectUrl: 'https://abc.supabase.co', publishableKey: 'pk', storageKey: 'a'.repeat(64), clock: () => at,
    request: async url => { const { pathname } = new URL(url); asked.push(pathname); return pathname.endsWith('go_agency_audit') ? Response.json({ code: 'PGRST205' }, { status: 404 }) : Response.json([]); } });
  for (let i = 0; i < 3; i++) await assert.rejects(store.audit.append('agency', [row(1)]), { code: 'audit_unavailable' });
  assert.equal(asked.length, 1, 'remembered');
  await store.tracking.page('demo', {});
  assert.equal(asked.length, 2);
  at = 6 * 60_000;
  await assert.rejects(store.audit.page('agency', {}), { code: 'audit_unavailable' });
  assert.equal(asked.length, 3, 'asked again later');
});

test('Saving in a sub-account is audited without writing the agency document again', async t => {
  const { seen, store } = watched();
  const local = await serve(t, store);
  seen.changes.length = 0;
  assert.equal((await local.save('Ana')).status, 200);
  assert.ok(seen.changes.includes('demo'));
  assert.ok(!seen.changes.includes('agency'), 'the agency document was not touched');
  const { entries } = (await local.call('/api/agency/audit')).body;
  assert.equal(entries[0].action, 'Saved contacts');
  assert.equal(store.load('agency').audit.some(e => e.action === 'Saved contacts'), false);
});

test('What is audited with a change of the agency enters the document in the same write and goes to the table in batches', async t => {
  const { store } = watched();
  const local = await serve(t, store);
  const link = n => local.act({ type: 'save', key: 'menuLinks', data: { title: `L${n}`, url: 'https://x.example.test/', icon: 'help', openIn: 'New tab', showOn: 'Sub-accounts' } });
  assert.equal((await link(0)).status, 200);
  const before = store.load('agency').audit.length;
  assert.ok(before >= 1, 'durable with the change itself');
  store.change('agency', s => { for (let n = 1; s.audit.length < AUDIT_BATCH; n++) s.audit.push(row(n)); });
  assert.equal((await local.act({ type: 'labs', data: {} })).status, 200);
  assert.equal((await link(1)).status, 200);
  assert.ok(store.load('agency').audit.length < AUDIT_BATCH, 'the batch left the document');
  const all = [];
  for (let next = ''; ;) { const page = (await local.call(`/api/agency/audit?limit=20&before=${next}`)).body; all.push(...page.entries); next = page.next; if (!next) break; }
  assert.equal(new Set(all.map(e => e.id)).size, all.length, 'nothing repeated');
  assert.deepEqual(all.filter(e => e.target === 'L0' || e.target === 'L1').map(e => e.target).sort(), ['L0', 'L1'], 'both changes are there');
  for (let n = 1; n <= AUDIT_BATCH - before; n++) assert.ok(all.some(e => e.id === row(n).id), `entry ${n} was kept`);
});

test('An entry written between the copy and the removal stays in the document', async () => {
  const store = createSqliteStore(':memory:');
  store.insert('agency', { audit: Array.from({ length: AUDIT_BATCH }, (_, n) => row(n)) });
  const log = createAuditLog({ store: { ...store, audit: { ...store.audit, append: (id, rows) => { store.audit.append(id, rows); store.change(id, s => { s.audit.push(row(900)); }); } } } });
  await log.settle('agency', AUDIT_BATCH);
  assert.deepEqual(store.load('agency').audit.map(e => e.id), [row(900).id]);
  assert.equal(ids(store.audit.page('agency', { limit: 500 })).length, AUDIT_BATCH);
});

test('Without the table everything works as before, in the document and up to its limit', async t => {
  const { seen, store } = watched();
  seen.fail = unavailable();
  const local = await serve(t, store);
  assert.equal((await local.save('Bia')).status, 200);
  assert.ok(store.load('agency').audit.some(e => e.action === 'Saved contacts'));
  store.change('agency', s => { s.audit = Array.from({ length: AUDIT_IN_DOCUMENT }, (_, n) => row(n)); });
  assert.equal((await local.save('Caio')).status, 200);
  assert.equal(store.load('agency').audit.length, AUDIT_IN_DOCUMENT);
  const page = (await local.call('/api/agency/audit?q=saved&limit=3')).body;
  assert.equal(page.entries.length, 3);
  assert.ok(page.next);
  seen.fail = null;
  assert.equal((await local.call('/api/agency/audit?limit=500')).body.entries.length, 500, 'the table appeared: the old entries are in it');
  assert.equal(store.load('agency').audit.length, 0, 'and left the document');
});

test('A store with no audit table (another adapter) keeps the document', async t => {
  const { audit: _audit, ...store } = createSqliteStore(':memory:');
  const local = await serve(t, store);
  assert.equal((await local.save('Davi')).status, 200);
  assert.equal((await local.call('/api/agency/audit')).body.entries[0].action, 'Saved contacts');
});

test('If the table fails, the entry goes to the document and nothing is lost', async t => quiet(t, async () => {
  const { seen, store } = watched();
  const local = await serve(t, store);
  seen.fail = new Error('rede');
  assert.equal((await local.save('Eva')).status, 200);
  assert.ok(store.load('agency').audit.some(e => e.action === 'Saved contacts'));
  seen.fail = null;
  assert.ok((await local.call('/api/agency/audit')).body.entries.some(e => e.action === 'Saved contacts'));
}));

test('Permissions: the agency log needs the agency settings; the sub-account log shows only its own entries', async t => {
  const { store } = watched();
  const local = await serve(t, store);
  const staff = (await local.act({ type: 'save', key: 'users', data: { first: 'Bia', last: 'Reis', email: 'bia@example.test', role: 'Agency User' } })).body.result;
  assert.equal((await local.call('/api/agency/audit', undefined, { 'X-Go-User': staff })).status, 403);
  await local.save('Fabi');
  store.audit.append('agency', [row(1, { target: 'Outra loja', action: 'Segredo' })]);
  const mine = (await local.call('/api/audit?workspace=demo')).body;
  assert.ok(mine.entries.some(e => e.action === 'Saved contacts'));
  assert.ok(!mine.entries.some(e => e.action === 'Segredo'));
  assert.equal((await local.call('/api/audit?workspace=nao-existe')).status, 404);
  assert.equal((await local.call('/api/agency/audit?before=x')).status, 400);
  const agency = (await local.call('/api/agency')).body.agency;
  assert.equal('audit' in agency, false, 'the agency view no longer carries the log');
  assert.equal('audit' in (await local.call('/api/state?workspace=demo')).body, false);
});

test('The daily sweep drops entries past the retention, once per day, and never throws', async t => {
  const calls = [];
  const log = createAuditLog({ store: { audit: { prune: before => { calls.push(before); } } } });
  const at = Date.parse('2026-11-24T10:00:00Z');
  await log.sweep(at); await log.sweep(at + 60_000);
  assert.deepEqual(calls, [iso(at - AUDIT_DAYS * DAY)]);
  await log.sweep(at + DAY);
  assert.equal(calls.length, 2);
  await quiet(t, () => createAuditLog({ store: { audit: { prune: () => { throw new Error('rede'); } } } }).sweep(at));
  await createAuditLog({ store: {} }).sweep(at);
  const { audit } = createSqliteStore(':memory:');
  audit.append('agency', [row(1), row(2)]);
  audit.prune(row(2).at);
  assert.deepEqual(ids(audit.page('agency')), [row(2).id]);
});

test('migrate:sqlite copies the log of each agency, and accepts a database older than the table', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'graao-audit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = createSqliteStore(join(dir, 'a.sqlite'));
  store.audit.append('agency', [row(1), row(2)]); store.audit.append('agency-2', [row(3)]);
  store.close();
  const db = new DatabaseSync(join(dir, 'a.sqlite')), got = {};
  assert.equal(await copyAuditEntries(db, { audit: { append: (agency, rows) => { got[agency] = rows.length; } } }), 3);
  assert.deepEqual(got, { agency: 2, 'agency-2': 1 });
  db.close();
  const old = new DatabaseSync(':memory:');
  assert.equal(await copyAuditEntries(old, {}), 0);
  old.close();
});
