import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import { hydrateWorkspace, uid } from './model.mjs';
import { auditOptions, auditPage, storedEntry } from './agency-audit.mjs';
import { listedEvent, pageOf, pageOptions, storedEvent } from './tracking-events.mjs';
import { sqliteRequestLog, supabaseRequestLog } from './ai-gateway/request-log.mjs';

export function workspaceMissing() {
  return Object.assign(new Error('Workspace not found.'), { status: 404 });
}

export const isDocument = id => id === 'agency' || /^(agency|studio|setup|ghl|social|openai|chat|portal|community|waha|whatsapp|abacatepay|marketplace|google|ads|email|media|platform|phone)-/.test(id);

// Livro da cobrança: só inclusão, com chave única por fato (ledger-model.mjs monta as linhas).
const ledgerLayers = ['platform', 'agency', 'account'];
const ledgerKinds = ['sale', 'manual_sale', 'refund', 'dispute_opened', 'dispute_won', 'dispute_lost', 'adjustment', 'plan_payment', 'wallet_topup', 'wallet_credit', 'wallet_debit', 'wallet_usage'];
const ledgerJson = ['source', 'seller', 'payer', 'detail'], ledgerText = ['method', 'provider', 'provider_ref'];
const ledgerColumns = ['key', 'layer', 'agency_id', 'workspace_id', 'kind', 'amount_cents', 'fee_cents', 'usage_micros', ...ledgerText, ...ledgerJson, 'occurred_at'];
const ledgerValue = (row, column) => row[column] ?? (ledgerJson.includes(column) ? {} : ledgerText.includes(column) ? '' : null);
const sqlList = list => list.map(item => `'${item}'`).join(', ');
const ledgerSchema = `CREATE TABLE IF NOT EXISTS go_billing_ledger (key TEXT PRIMARY KEY, layer TEXT NOT NULL CHECK (layer IN (${sqlList(ledgerLayers)})),
  agency_id TEXT NOT NULL, workspace_id TEXT, kind TEXT NOT NULL CHECK (kind IN (${sqlList(ledgerKinds)})), amount_cents INTEGER NOT NULL, fee_cents INTEGER, usage_micros INTEGER,
  method TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT '', provider_ref TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '{}', seller TEXT NOT NULL DEFAULT '{}',
  payer TEXT NOT NULL DEFAULT '{}', detail TEXT NOT NULL DEFAULT '{}', occurred_at TEXT NOT NULL, recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))) STRICT;
  CREATE INDEX IF NOT EXISTS go_billing_ledger_agency ON go_billing_ledger (agency_id, layer, occurred_at DESC, key DESC);
  CREATE INDEX IF NOT EXISTS go_billing_ledger_workspace ON go_billing_ledger (workspace_id, layer, occurred_at DESC, key DESC);
  CREATE TRIGGER IF NOT EXISTS go_billing_ledger_no_update BEFORE UPDATE ON go_billing_ledger BEGIN SELECT RAISE(ABORT, 'livro imutável'); END;
  CREATE TRIGGER IF NOT EXISTS go_billing_ledger_no_delete BEFORE DELETE ON go_billing_ledger BEGIN SELECT RAISE(ABORT, 'livro imutável'); END;`;
const readCursor = after => {
  const cut = String(after).indexOf('|'), at = Date.parse(String(after).slice(0, Math.max(cut, 0)));
  if (Number.isNaN(at)) throw Object.assign(new Error('Página inválida.'), { status: 400 });
  return { at: new Date(at).toISOString(), key: String(after).slice(cut + 1) };
};
const page = (rows, limit) => ({ rows: rows.slice(0, limit), next: rows.length > limit ? `${rows[limit - 1].occurred_at}|${rows[limit - 1].key}` : '' });

function containsJson(value, expected) {
  if (Array.isArray(expected)) return Array.isArray(value) && expected.every(item => value.some(entry => containsJson(entry, item)));
  if (expected && typeof expected === 'object') {
    return Boolean(value) && Object.entries(expected).every(([key, item]) => containsJson(value[key], item));
  }
  return value === expected;
}

/** The tracking events of the local database: same answers as the Supabase table (P2.5). */
function sqliteTracking(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS tracking_events (workspace TEXT NOT NULL, id TEXT NOT NULL, created TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (workspace, id)) STRICT;
    CREATE INDEX IF NOT EXISTS tracking_events_recent ON tracking_events (workspace, created DESC, id DESC);`);
  const insert = db.prepare('INSERT INTO tracking_events (workspace, id, created, data) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING');
  const page = db.prepare(`SELECT data FROM tracking_events WHERE workspace = ?1 AND (?2 = '' OR data ->> 'type' = ?2)
    AND (?3 = '' OR created < ?3 OR (created = ?3 AND id < ?4)) ORDER BY created DESC, id DESC LIMIT ?5`);
  const counts = db.prepare(`SELECT count(*) FILTER (WHERE data ->> 'type' = 'pageview') AS views, count(*) FILTER (WHERE data ->> 'type' = 'form') AS forms,
    count(DISTINCT nullif(data ->> 'contactId', '')) AS known, count(DISTINCT data ->> 'vid') AS visitors FROM tracking_events WHERE workspace = ? AND created >= ?`);
  // With max(), SQLite takes the other columns from the newest row of the group.
  const byForm = db.prepare(`SELECT data ->> 'formKey' AS name, data ->> 'url' AS url, count(*) AS total, count(DISTINCT nullif(data ->> 'contactId', '')) AS contacts, max(created) AS last
    FROM tracking_events WHERE workspace = ? AND data ->> 'type' = 'form' GROUP BY 1 ORDER BY last DESC, name LIMIT 200`);
  const prune = db.prepare('DELETE FROM tracking_events WHERE created < ?');
  const dropWorkspace = db.prepare('DELETE FROM tracking_events WHERE workspace = ?');
  return {
    removeWorkspace(workspace) { dropWorkspace.run(workspace); },
    append(workspace, rows) {
      for (const row of rows.map(storedEvent)) insert.run(workspace, row.id, row.created, JSON.stringify(row));
    },
    page(workspace, query) {
      const { type, cursor, limit } = pageOptions(query);
      return pageOf(page.all(workspace, type, cursor?.created || '', cursor?.id || '', limit + 1).map(row => JSON.parse(String(row.data))), limit);
    },
    summary(workspace, since) {
      const [last] = page.all(workspace, '', '', '', 1);
      return { last: last ? listedEvent(JSON.parse(String(last.data))) : null, ...counts.get(workspace, since), byForm: byForm.all(workspace).map(row => ({ ...row })) };
    },
    prune(before) { prune.run(before); }
  };
}

/** The agency audit log of the local database: same answers as the Supabase table (P2.5). */
function sqliteAudit(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS agency_audit (agency TEXT NOT NULL, id TEXT NOT NULL, created TEXT NOT NULL, target TEXT NOT NULL, search TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (agency, id)) STRICT;
    CREATE INDEX IF NOT EXISTS agency_audit_recent ON agency_audit (agency, created DESC, id DESC);`);
  const insert = db.prepare('INSERT INTO agency_audit (agency, id, created, target, search, data) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING');
  const page = db.prepare(`SELECT data FROM agency_audit WHERE agency = ?1 AND (?2 = '' OR instr(search, ?2) > 0)
    AND (?3 = '' OR target IN (SELECT value FROM json_each(nullif(?3, ''))))
    AND (?4 = '' OR created < ?4 OR (created = ?4 AND id < ?5)) ORDER BY created DESC, id DESC LIMIT ?6`);
  const prune = db.prepare('DELETE FROM agency_audit WHERE created < ?');
  return {
    append(agency, rows) {
      for (const { entry, search } of rows.map(storedEntry)) insert.run(agency, entry.id, entry.at, entry.target, search, JSON.stringify(entry));
    },
    page(agency, query) {
      const { q, targets, cursor, limit } = auditOptions(query);
      return auditPage(page.all(agency, q, targets ? JSON.stringify(targets) : '', cursor?.at || '', cursor?.id || '', limit + 1).map(row => JSON.parse(String(row.data))), limit);
    },
    prune(before) { prune.run(before); }
  };
}

export function createSqliteStore(path) {
  if (path !== ':memory:') {
    try {
      mkdirSync(dirname(path), { recursive: true });
    } catch (err) {
      path = resolve(tmpdir(), 'go.sqlite');
      mkdirSync(dirname(path), { recursive: true });
    }
  }
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, state TEXT NOT NULL) STRICT;');
  db.exec(ledgerSchema);
  let ledgerInsert = null;
  const get = db.prepare('SELECT state FROM workspaces WHERE id = ?');
  const list = db.prepare("SELECT id, json_extract(state, '$.profile.name') AS name FROM workspaces ORDER BY rowid");
  const listByAgency = db.prepare("SELECT id, json_extract(state, '$.profile.name') AS name FROM workspaces WHERE json_extract(state, '$.agencyId') IS ? ORDER BY rowid");
  const owned = db.prepare("SELECT 1 FROM workspaces WHERE id = ? AND json_extract(state, '$.agencyId') IS ?");
  const agencies = db.prepare("SELECT id, state FROM workspaces WHERE id = 'agency' OR id LIKE 'agency-%' ORDER BY rowid");
  const insert = db.prepare('INSERT INTO workspaces (id, state) VALUES (?, ?) ON CONFLICT(id) DO NOTHING');
  const update = db.prepare('UPDATE workspaces SET state = ? WHERE id = ?');
  const remove = db.prepare('DELETE FROM workspaces WHERE id = ?');

  function load(id) {
    const row = get.get(id);
    if (!row) throw workspaceMissing();
    const state = JSON.parse(row.state);
    return isDocument(id) ? state : hydrateWorkspace(state);
  }

  return {
    kind: 'SQLite',
    tracking: sqliteTracking(db),
    // graao AI Gateway: log de requisições (só metadados).
    aiRequests: sqliteRequestLog(db),
    audit: sqliteAudit(db),
    load,
    list: agencyId => agencyId === undefined ? list.all() : listByAgency.all(agencyId),
    belongsToAgency: (id, agencyId) => Boolean(owned.get(id, agencyId)),
    findAgency(filter) {
      for (const row of agencies.iterate()) {
        const state = JSON.parse(row.state);
        if (containsJson(state, filter)) return { id: row.id, state };
      }
      return null;
    },
    insert: (id, state) => Boolean(insert.run(id, JSON.stringify(state)).changes),
    /** Apaga o documento de vez (subconta que venceu a lixeira). */
    remove: id => { remove.run(id); },
    // Página Plataforma: num banco local só há o tamanho do arquivo; storage e usuários ativos são do Supabase.
    platformUsage: () => {
      const { page_count } = db.prepare('PRAGMA page_count').get();
      const { page_size } = db.prepare('PRAGMA page_size').get();
      return { db_bytes: page_count * page_size, storage_bytes: 0, mau: null };
    },
    change(id, mutate) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const state = load(id);
        const result = mutate(state);
        update.run(JSON.stringify(state), id);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async ledgerAppend(rows) {
      if (!rows.length) return;
      ledgerInsert ??= db.prepare(`INSERT INTO go_billing_ledger (${ledgerColumns.join(', ')}) VALUES (${ledgerColumns.map(() => '?').join(', ')}) ON CONFLICT(key) DO NOTHING`);
      db.exec('BEGIN IMMEDIATE');
      try {
        for (const row of rows) ledgerInsert.run(...ledgerColumns.map(column => ledgerJson.includes(column) ? JSON.stringify(ledgerValue(row, column)) : ledgerValue(row, column)));
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async ledgerList({ layer, agencyId, workspaceId, kind, from, to, limit = 200, after = '' }) {
      const where = ['layer = ?', 'agency_id = ?', 'occurred_at >= ?', 'occurred_at < ?'], values = [layer, agencyId, from, to];
      if (workspaceId !== undefined) { where.push('workspace_id = ?'); values.push(workspaceId); }
      if (kind) { where.push('kind = ?'); values.push(kind); }
      if (after) { const c = readCursor(after); where.push('(occurred_at < ? OR (occurred_at = ? AND key < ?))'); values.push(c.at, c.at, c.key); }
      const rows = db.prepare(`SELECT * FROM go_billing_ledger WHERE ${where.join(' AND ')} ORDER BY occurred_at DESC, key DESC LIMIT ?`).all(...values, limit + 1);
      return page(rows.map(row => ({ ...row, ...Object.fromEntries(ledgerJson.map(column => [column, JSON.parse(row[column])])) })), limit);
    },
    close: () => db.close()
  };
}

// The same document, whatever the order of the keys (jsonb has its own).
const sameJson = (a, b) => a === b || (a.length === b.length && isDeepStrictEqual(JSON.parse(a), JSON.parse(b)));
/** How long a document already read can be used again without being sent again (its revision is asked every time). */
export const KEEP_MS = 30 * 60_000;
const KEEP_ONE = 4_000_000, KEEP_ALL = 32_000_000; // characters: the largest document kept, and all of them together

export function createSupabaseStore({ projectUrl, publishableKey, storageKey, request = fetch, clock = Date.now }) {
  const base = new URL(projectUrl);
  if (base.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/.test(base.hostname) || base.username || base.password || base.port || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('SUPABASE_URL must be an HTTPS Supabase project URL.');
  }
  if (!publishableKey || !/^[a-f0-9]{64}$/.test(storageKey || '')) {
    throw new Error('Set SUPABASE_PUBLISHABLE_KEY and the provisioned GO_STORAGE_KEY.');
  }

  async function table(query, options = {}) {
    return (await api('go_workspaces', query, options)).json();
  }
  async function api(path, query, options = {}) {
    const endpoint = new URL(`/rest/v1/${path}`, base);
    endpoint.search = new URLSearchParams(query);
    const headers = {
      apikey: publishableKey,
      'X-Go-Storage-Key': storageKey,
      Accept: 'application/json',
      ...options.headers
    };
    if (options.body) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await request(endpoint, {
        method: options.method || 'GET',
        headers,
        body: options.body && JSON.stringify(options.body),
        redirect: 'error',
        signal: AbortSignal.timeout(12000)
      });
    } catch {
      throw new Error('Could not connect to the Supabase Data API.');
    }
    if (!response.ok) {
      const { code } = await response.json().catch(() => ({})) || {};
      throw Object.assign(new Error(`Supabase Data API request failed (${response.status}).`), { dataApiCode: code });
    }
    return response;
  }

  // The tables of P2.5. Until the migration and grants of one are applied to the project, every call to it answers
  // '<name>_unavailable' (remembered for five minutes) and its rows stay in the document.
  const missingCodes = new Set(['PGRST202', 'PGRST205', '42P01', '42883', '42501']);
  function optionalTable(label, code) {
    let missingUntil = 0;
    const unavailable = () => Object.assign(new Error(`The ${label} table is not available in this database.`), { code });
    return async (path, query, options) => {
      if (clock() < missingUntil) throw unavailable();
      try { return await api(path, query, options); }
      catch (error) {
        if (!missingCodes.has(error.dataApiCode)) throw error;
        missingUntil = clock() + 5 * 60_000;
        throw unavailable();
      }
    };
  }
  const ledger = optionalTable('billing ledger', 'ledger_unavailable');
  const events = optionalTable('tracking events', 'tracking_unavailable');
  const tracking = {
    async append(workspace, rows) {
      const body = rows.map(storedEvent).map(row => ({ workspace, id: row.id, created_at: row.created, data: row }));
      for (let start = 0; start < body.length; start += 500) {
        await events('go_tracking_events', { on_conflict: 'workspace,id' }, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: body.slice(start, start + 500) });
      }
    },
    async page(workspace, query) {
      const { type, cursor, limit } = pageOptions(query);
      const response = await events('go_tracking_events', { select: 'data', workspace: `eq.${workspace}`, ...(type && { type: `eq.${type}` }), order: 'created_at.desc,id.desc', limit: String(limit + 1),
        ...(cursor && { or: `(created_at.lt."${cursor.created}",and(created_at.eq."${cursor.created}",id.lt."${cursor.id}"))` }) });
      return pageOf((await response.json()).map(row => row.data), limit);
    },
    async summary(workspace, since) {
      return (await events('rpc/go_tracking_summary', {}, { method: 'POST', body: { p_workspace: workspace, p_since: since } })).json();
    },
    async prune(before) {
      await events('go_tracking_events', { created_at: `lt.${before}` }, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    },
    async removeWorkspace(workspace) {
      await events('go_tracking_events', { workspace: `eq.${workspace}` }, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    }
  };

  const entries = optionalTable('agency audit', 'audit_unavailable');
  // In LIKE, the search is literal text; PostgREST reads * as %, with no escape, so it becomes "any one character".
  const likeText = value => value.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '_');
  const quoted = value => `"${value.replace(/["\\]/g, '\\$&')}"`;
  const audit = {
    async append(agency, rows) {
      const body = rows.map(storedEntry).map(({ entry, search }) => ({ agency, id: entry.id, created_at: entry.at, target: entry.target, search, data: entry }));
      for (let start = 0; start < body.length; start += 500) {
        await entries('go_agency_audit', { on_conflict: 'agency,id' }, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: body.slice(start, start + 500) });
      }
    },
    async page(agency, query) {
      const { q, targets, cursor, limit } = auditOptions(query);
      const response = await entries('go_agency_audit', { select: 'data', agency: `eq.${agency}`, ...(q && { search: `like.*${likeText(q)}*` }),
        ...(targets && { target: `in.(${targets.map(quoted).join(',')})` }), order: 'created_at.desc,id.desc', limit: String(limit + 1),
        ...(cursor && { or: `(created_at.lt."${cursor.at}",and(created_at.eq."${cursor.at}",id.lt."${cursor.id}"))` }) });
      return auditPage((await response.json()).map(row => row.data), limit);
    },
    async prune(before) {
      await entries('go_agency_audit', { created_at: `lt.${before}` }, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    }
  };

  // Documents already read. Every write of the app changes the revision, so a later read asks for the row only if its
  // revision is another one: an unchanged document costs an empty answer instead of the whole state. The copy is never
  // used without asking. KEEP_MS is for what does not go through the app (a state edited by hand keeps its revision).
  const kept = new Map();
  let keptSize = 0;
  function forget(id) {
    const old = kept.get(id);
    if (!old) return;
    kept.delete(id);
    keptSize -= old.text.length;
  }
  function keep(id, { revision, state }) {
    forget(id);
    const text = JSON.stringify(state);
    if (!revision || text.length > KEEP_ONE) return text;
    kept.set(id, { revision, text, at: clock() });
    keptSize += text.length;
    for (const oldest of kept.keys()) {
      if (keptSize <= KEEP_ALL) break;
      forget(oldest);
    }
    return text;
  }
  const usable = id => { const had = kept.get(id); return had && clock() - had.at < KEEP_MS ? had : null; };
  const hydrated = (id, state) => isDocument(id) ? state : hydrateWorkspace(state);
  async function read(id) {
    const had = usable(id);
    const [row] = await table({ select: 'state,revision', id: `eq.${id}`, ...(had && { revision: `neq.${had.revision}` }) });
    if (row) {
      const text = keep(id, row);
      return { revision: row.revision, text, state: hydrated(id, row.state) };
    }
    if (!had) { forget(id); throw workspaceMissing(); }
    if (kept.get(id) === had) { kept.delete(id); kept.set(id, had); } // the most recently used stay
    return { revision: had.revision, text: had.text, state: hydrated(id, JSON.parse(had.text)) };
  }
  /** Of these documents, the ones already read whose revision is still the same, in one request: Map of id → state. */
  async function unchanged(ids) {
    const known = ids.filter(usable), found = new Map();
    for (let start = 0; start < known.length; start += 100) {
      const before = new Map(known.slice(start, start + 100).map(id => [id, kept.get(id)]).filter(([, had]) => had));
      if (!before.size) continue;
      for (const { id, revision } of await table({ select: 'id,revision', id: `in.(${[...before.keys()].map(quoted).join(',')})` })) {
        const had = before.get(id);
        if (had && had.revision === revision) found.set(id, hydrated(id, JSON.parse(had.text)));
      }
    }
    return found;
  }

  const agencyFilter = agencyId => agencyId === null ? 'is.null' : `eq.${agencyId}`;
  return {
    kind: 'Supabase',
    tracking,
    aiRequests: supabaseRequestLog(optionalTable('AI requests', 'ai_log_unavailable')),
    audit,
    load: async id => (await read(id)).state,
    unchanged,
    list: agencyId => table({ select: 'id,name', order: 'created_at.asc,id.asc',
      ...(agencyId !== undefined && { 'state->>agencyId': agencyFilter(agencyId) }) }),
    // Página Plataforma: tamanho do banco, do Storage e usuários ativos no mês (função go_platform_usage).
    async platformUsage() {
      return (await api('rpc/go_platform_usage', {}, { method: 'POST', body: {} })).json();
    },
    async belongsToAgency(id, agencyId) {
      const rows = await table({ select: 'id', id: `eq.${id}`, 'state->>agencyId': agencyFilter(agencyId) });
      return rows.length !== 0;
    },
    async findAgency(filter) {
      const [row] = await table({ select: 'id,state', or: '(id.eq.agency,id.like.agency-*)',
        state: 'cs.' + JSON.stringify(filter), order: 'created_at.asc,id.asc', limit: 1 });
      return row || null;
    },
    async insert(id, state) {
      const rows = await table({ on_conflict: 'id', select: 'id' }, {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: { id, state }
      });
      return rows.length === 1;
    },
    /**
     * Apaga o documento de vez (subconta que venceu a lixeira). Enquanto o banco não libera DELETE para a chave do
     * servidor (supabase/provision-storage.sql), a linha fica vazia e fora de toda agência: os dados somem do mesmo jeito.
     */
    async remove(id) {
      forget(id);
      try {
        await api('go_workspaces', { id: `eq.${id}` }, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      } catch (error) {
        if (error.dataApiCode !== '42501') throw error;
        await api('go_workspaces', { id: `eq.${id}` }, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: { state: { agencyId: 'removida', removedAt: new Date(clock()).toISOString(), profile: { name: '' } }, revision: uid() } });
      }
    },
    async change(id, mutate) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const { state, revision, text } = await read(id);
        const result = mutate(state);
        // Nothing to save (the cron asks every minute): writing it again would only make everyone read it again.
        if (sameJson(JSON.stringify(state), text)) return result;
        const saved = await table({ select: 'id', id: `eq.${id}`, revision: `eq.${revision}` }, {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: { state, revision: uid() }
        });
        // Saved (the next read brings it as the database keeps it) or changed by someone else: the copy is not good.
        forget(id);
        if (saved.length === 1) return result;
      }
      throw Object.assign(new Error('The workspace changed concurrently. Please retry.'), { status: 409 });
    },
    async ledgerAppend(rows) {
      if (!rows.length) return;
      await ledger('go_billing_ledger', { on_conflict: 'key' }, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: rows.map(row => Object.fromEntries(ledgerColumns.map(column => [column, ledgerValue(row, column)]))) });
    },
    async ledgerList({ layer, agencyId, workspaceId, kind, from, to, limit: wanted = 200, after = '' }) {
      // PostgREST answers at most 1000 rows, and one more than the page is asked to know whether there is a next one.
      const limit = Math.min(wanted, 999), literal = value => `"${String(value).replace(/["\\]/g, char => `\\${char}`)}"`;
      const both = [`occurred_at.gte.${from}`, `occurred_at.lt.${to}`];
      if (after) { const c = readCursor(after); both.push(`or(occurred_at.lt.${c.at},and(occurred_at.eq.${c.at},key.lt.${literal(c.key)}))`); }
      const rows = await (await ledger('go_billing_ledger', { select: '*', layer: `eq.${layer}`, agency_id: `eq.${agencyId}`, ...(workspaceId !== undefined && { workspace_id: `eq.${workspaceId}` }),
        ...(kind && { kind: `eq.${kind}` }), and: `(${both.join(',')})`, order: 'occurred_at.desc,key.desc', limit: limit + 1 }, {})).json();
      return page(rows.map(row => ({ ...row, occurred_at: new Date(row.occurred_at).toISOString() })), limit);
    },
    close() {}
  };
}

export function supabaseFromEnv(env = process.env) {
  const projectUrl = env.SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
  const storageKey = env.GO_STORAGE_KEY;
  if (!projectUrl && !publishableKey && !storageKey) return null;
  if (!projectUrl) throw new Error('Set SUPABASE_URL to the project URL.');
  return createSupabaseStore({ projectUrl, publishableKey, storageKey });
}

/** The tracking events of a local database, sent to another store (npm run migrate:sqlite). Says how many. */
export async function copyTrackingEvents(db, target) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tracking_events'").get()) return 0;
  let total = 0;
  for (const { workspace } of db.prepare('SELECT DISTINCT workspace FROM tracking_events').all()) {
    const rows = db.prepare('SELECT data FROM tracking_events WHERE workspace = ? ORDER BY created').all(workspace).map(row => JSON.parse(String(row.data)));
    await target.tracking.append(workspace, rows);
    total += rows.length;
  }
  return total;
}

/** The audit log of the agencies of a local database, sent to another store (npm run migrate:sqlite). Says how many. */
export async function copyAuditEntries(db, target) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'agency_audit'").get()) return 0;
  let total = 0;
  for (const { agency } of db.prepare('SELECT DISTINCT agency FROM agency_audit').all()) {
    const rows = db.prepare('SELECT data FROM agency_audit WHERE agency = ? ORDER BY created').all(agency).map(row => JSON.parse(String(row.data)));
    await target.audit.append(agency, rows);
    total += rows.length;
  }
  return total;
}
