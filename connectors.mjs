// T.2 — Catálogo de conectores, lado do servidor: what each app action calls, how each app's webhook is checked and
// read, and the triggers checked every 5 minutes (Google Sheets, Airtable). The catalog itself (names, fields) is
// ui/connectors-data.js. Credentials are sealed in the sub-account (social-providers.mjs seal) and never reach the browser.
import { createHmac, createSign, timingSafeEqual } from 'node:crypto';
import { connectorById } from './ui/connectors-data.js';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const clip = (value, limit = 500) => String(value ?? '').slice(0, limit);
const lower = value => String(value ?? '').trim().toLowerCase();
const equal = (a, b) => { const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || '')); return x.length > 0 && x.length === y.length && timingSafeEqual(x, y); };
const hmac = (algo, key, data, encoding) => createHmac(algo, key).update(data).digest(encoding);

/** "Coluna = valor" lines → { Coluna: 'valor' }. */
export function pairs(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/).slice(0, 60)) {
    const at = line.indexOf('=');
    if (at > 0 && line.slice(0, at).trim()) out[line.slice(0, at).trim().slice(0, 100)] = line.slice(at + 1).trim().slice(0, 5000);
  }
  return out;
}
const json = (text, label) => { try { const value = JSON.parse(String(text || '{}')); if (!value || typeof value !== 'object') throw 0; return value; } catch { fail(`${label}: JSON inválido.`); } };
const columnName = index => { let name = '', n = index + 1; while (n > 0) { const r = (n - 1) % 26; name = String.fromCharCode(65 + r) + name; n = Math.floor((n - 1) / 26); } return name; };

// ---- HTTP ----
async function call(request, url, { method = 'GET', headers = {}, body, form } = {}) {
  const response = await request(url, { method, redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...headers },
    body: form ? new URLSearchParams(form).toString() : body !== undefined ? JSON.stringify(body) : undefined }).catch(() => null);
  if (!response) fail('o app não respondeu', 502);
  const text = await response.text().catch(() => '');
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 500) }; }
  if (!response.ok) fail(`HTTP ${response.status}: ${clip(data.error?.message || data.message || data.error || data.errors?.[0]?.message || data.raw || '', 200)}`, 502);
  return data;
}

// ---- Google (service account → access token, cached for its hour) ----
const googleTokens = new Map();
export async function googleToken(serviceAccount, request = fetch, now = Date.now()) {
  const account = typeof serviceAccount === 'string' ? json(serviceAccount, 'Chave da conta de serviço') : serviceAccount;
  if (!account.client_email || !account.private_key) fail('Chave da conta de serviço sem client_email ou private_key.');
  const cached = googleTokens.get(account.client_email);
  if (cached && cached.expires > now + 60000) return cached.token;
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const claims = { iss: account.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3600 };
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
  const data = await call(request, 'https://oauth2.googleapis.com/token', { method: 'POST', form: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` } });
  googleTokens.set(account.client_email, { token: data.access_token, expires: now + (Number(data.expires_in) || 3600) * 1000 });
  return data.access_token;
}

// Google Sheets: header-based rows ("Coluna = valor" goes to the column whose header matches).
async function sheets(request, auth) {
  const token = await googleToken(auth.serviceAccount, request);
  const headers = { Authorization: `Bearer ${token}` };
  const base = id => `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`;
  const range = (sheet, a1 = '') => encodeURIComponent(`${sheet || 'Página1'}${a1 ? `!${a1}` : ''}`);
  const read = async (id, sheet) => (await call(request, `${base(id)}/values/${range(sheet)}`, { headers })).values || [];
  const rowFrom = (header, values, current = []) => {
    const row = header.map((_, index) => current[index] ?? '');
    for (const [name, value] of Object.entries(values)) {
      const index = header.findIndex(cell => lower(cell) === lower(name));
      if (index < 0) fail(`Coluna "${name}" não existe no cabeçalho da aba.`);
      row[index] = value;
    }
    return row;
  };
  const find = (all, column, value, many = false) => {
    const header = all[0] || [], index = header.findIndex(cell => lower(cell) === lower(column));
    if (index < 0) fail(`Coluna "${column}" não existe no cabeçalho da aba.`);
    const hits = [];
    for (let r = 1; r < all.length; r++) if (lower(all[r][index]) === lower(value)) { hits.push(r + 1); if (!many) break; }
    return hits;
  };
  const asObject = (header, row) => Object.fromEntries(header.map((name, index) => [name, row?.[index] ?? '']));
  return { headers, base, range, read, rowFrom, find, asObject };
}

/** Runs one connector action; answers the step's variables (named <app>_<output>). */
export async function runConnectorAction(id, key, auth, input, { request = fetch } = {}) {
  const v = values => Object.fromEntries(Object.entries(values).map(([name, value]) => [`${id}_${name}`, typeof value === 'object' ? JSON.stringify(value).slice(0, 4000) : clip(value, 4000)]));
  const bearer = token => ({ Authorization: `Bearer ${token}` });
  if (id === 'slack') {
    const slack = async (method, body, get = false) => {
      const data = get ? await call(request, `https://slack.com/api/${method}?${new URLSearchParams(body)}`, { headers: bearer(auth.botToken) })
        : await call(request, `https://slack.com/api/${method}`, { method: 'POST', headers: { ...bearer(auth.botToken), 'Content-Type': 'application/json; charset=utf-8' }, body });
      if (!data.ok) fail(`Slack: ${data.error || 'erro'}`, 502);
      return data;
    };
    const channel = String(input.channel || '').replace(/^#/, '');
    if (key === 'send_message') { const d = await slack('chat.postMessage', { channel, text: input.text }); return v({ ts: d.ts, channel: d.channel }); }
    if (key === 'update_message') { const d = await slack('chat.update', { channel, ts: input.ts, text: input.text }); return v({ ts: d.ts }); }
    if (key === 'create_channel') { const d = await slack('conversations.create', { name: lower(input.name).replace(/[^a-z0-9_-]+/g, '-').slice(0, 80), is_private: input.private === 'yes' }); return v({ channel: d.channel.id }); }
    if (key === 'invite_user') { const d = await slack('conversations.invite', { channel, users: input.user }); return v({ channel: d.channel.id }); }
    if (key === 'find_channel') {
      const d = await slack('conversations.list', { types: 'public_channel,private_channel', limit: '1000', exclude_archived: 'true' }, true);
      const found = (d.channels || []).find(row => lower(row.name) === lower(String(input.name).replace(/^#/, '')));
      if (!found) fail('Slack: canal não encontrado', 404);
      return v({ channel: found.id });
    }
    if (key === 'find_user') { const d = await slack('users.lookupByEmail', { email: input.email }, true); return v({ user: d.user.id, name: d.user.real_name || d.user.name }); }
  }
  if (id === 'google_sheets') {
    const g = await sheets(request, auth), sheet = input.sheet || 'Página1', idOf = input.spreadsheetId;
    if (key === 'add_row' || key === 'update_row' || key === 'update_rows' || key === 'update_by_lookup' || key === 'lookup_row' || key === 'lookup_rows' || key === 'clear_by_lookup') {
      const all = await g.read(idOf, sheet), header = all[0] || [];
      if (!header.length) fail('A aba não tem cabeçalho na primeira linha.');
      const last = columnName(header.length - 1);
      const put = async (rowNumber, values) => call(request, `${g.base(idOf)}/values/${g.range(sheet, `A${rowNumber}:${last}${rowNumber}`)}?valueInputOption=USER_ENTERED`, { method: 'PUT', headers: g.headers, body: { values: [g.rowFrom(header, values, all[rowNumber - 1] || [])] } });
      if (key === 'add_row') {
        const d = await call(request, `${g.base(idOf)}/values/${g.range(sheet, 'A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: 'POST', headers: g.headers, body: { values: [g.rowFrom(header, pairs(input.values))] } });
        return v({ row: String(d.updates?.updatedRange || '').match(/(\d+)(?::[A-Z]+\d+)?$/)?.[1] || '' });
      }
      if (key === 'update_row') { await put(Number(input.row), pairs(input.values)); return v({ row: input.row }); }
      if (key === 'update_rows') { const rows = String(input.rows).split(/[\s,;]+/).map(Number).filter(n => n > 1).slice(0, 100); for (const n of rows) await put(n, pairs(input.values)); return v({ count: rows.length }); }
      const hits = g.find(all, input.column, input.value, key === 'lookup_rows');
      if (key === 'lookup_rows') return v({ count: hits.length, rows: hits.join(','), json: hits.slice(0, 20).map(n => g.asObject(header, all[n - 1])) });
      if (!hits.length) fail('Nenhuma linha encontrada.', 404);
      if (key === 'lookup_row') return v({ row: hits[0], json: g.asObject(header, all[hits[0] - 1]) });
      if (key === 'update_by_lookup') { await put(hits[0], pairs(input.values)); return v({ row: hits[0] }); }
      await call(request, `${g.base(idOf)}/values/${g.range(sheet, `A${hits[0]}:${last}${hits[0]}`)}:clear`, { method: 'POST', headers: g.headers, body: {} });
      return v({ row: hits[0] });
    }
    if (key === 'add_rows') {
      const rows = String(input.rows || '').split(/\r?\n/).filter(line => line.trim()).slice(0, 500).map(line => line.split(';').map(cell => cell.trim()));
      await call(request, `${g.base(idOf)}/values/${g.range(sheet, 'A1')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: 'POST', headers: g.headers, body: { values: rows } });
      return v({ rows: rows.length });
    }
    if (key === 'clear_row') { await call(request, `${g.base(idOf)}/values/${g.range(sheet, `A${Number(input.row)}:ZZ${Number(input.row)}`)}:clear`, { method: 'POST', headers: g.headers, body: {} }); return v({ row: input.row }); }
    if (key === 'format_rows' || key === 'remove_rows') {
      const start = Number(input.start), end = Number(input.end), sheetId = Number(input.sheetId) || 0;
      if (!(start >= 1 && end >= start)) fail('Informe as linhas (da e até).');
      const color = String(input.color || '#ffffff').match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i) || [0, 'ff', 'ff', 'ff'];
      const request_ = key === 'remove_rows' ? { deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: start - 1, endIndex: end } } }
        : { repeatCell: { range: { sheetId, startRowIndex: start - 1, endRowIndex: end }, cell: { userEnteredFormat: { backgroundColor: { red: parseInt(color[1], 16) / 255, green: parseInt(color[2], 16) / 255, blue: parseInt(color[3], 16) / 255 }, textFormat: { bold: input.bold === 'yes' } } }, fields: 'userEnteredFormat(backgroundColor,textFormat.bold)' } };
      await call(request, `${g.base(idOf)}:batchUpdate`, { method: 'POST', headers: g.headers, body: { requests: [request_] } });
      return v({});
    }
  }
  if (id === 'shopify') {
    const shop = String(auth.shop || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[\w-]+\.myshopify\.com$/.test(shop)) fail('Loja Shopify inválida (use minhaloja.myshopify.com).');
    const d = await call(request, `https://${shop}/admin/api/2024-10/customers/search.json?query=${encodeURIComponent(`email:${input.email}`)}`, { headers: { 'X-Shopify-Access-Token': auth.accessToken } });
    const customer = d.customers?.[0];
    if (!customer) fail('Cliente não encontrado na Shopify.', 404);
    return v({ customer: customer.id, orders: customer.orders_count ?? '', spent: customer.total_spent ?? '' });
  }
  if (id === 'airtable') {
    const url = `https://api.airtable.com/v0/${encodeURIComponent(input.baseId)}/${encodeURIComponent(input.table)}`;
    if (key === 'create_record') { const d = await call(request, url, { method: 'POST', headers: bearer(auth.token), body: { fields: pairs(input.fields), typecast: true } }); return v({ record: d.id }); }
    if (key === 'update_record') { const d = await call(request, `${url}/${encodeURIComponent(input.record)}`, { method: 'PATCH', headers: bearer(auth.token), body: { fields: pairs(input.fields), typecast: true } }); return v({ record: d.id }); }
    if (key === 'find_record') {
      const d = await call(request, `${url}?${new URLSearchParams({ filterByFormula: input.formula, maxRecords: '1' })}`, { headers: bearer(auth.token) });
      if (!d.records?.length) fail('Nenhum registro encontrado.', 404);
      return v({ record: d.records[0].id, json: d.records[0].fields });
    }
  }
  if (id === 'hubspot') {
    if (key === 'upsert_contact') {
      const properties = Object.fromEntries(Object.entries({ email: input.email, firstname: input.firstname, lastname: input.lastname, phone: input.phone }).filter(([, value]) => value));
      const d = await call(request, 'https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert', { method: 'POST', headers: bearer(auth.token), body: { inputs: [{ idProperty: 'email', id: input.email, properties }] } });
      return v({ id: d.results?.[0]?.id || '' });
    }
    if (key === 'create_deal') { const d = await call(request, 'https://api.hubapi.com/crm/v3/objects/deals', { method: 'POST', headers: bearer(auth.token), body: { properties: { dealname: input.name, ...(input.amount ? { amount: input.amount } : {}), dealstage: input.stage || 'appointmentscheduled', pipeline: 'default' } } }); return v({ id: d.id }); }
  }
  if (id === 'notion') {
    const d = await call(request, 'https://api.notion.com/v1/pages', { method: 'POST', headers: { ...bearer(auth.token), 'Notion-Version': '2022-06-28' }, body: {
      parent: { database_id: input.database }, properties: { [input.titleProperty || 'Name']: { title: [{ text: { content: clip(input.title, 2000) } }] } },
      ...(input.content ? { children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: clip(input.content, 2000) } }] } }] } : {}) } });
    return v({ id: d.id, url: d.url });
  }
  if (id === 'asana') { const d = await call(request, 'https://app.asana.com/api/1.0/tasks', { method: 'POST', headers: bearer(auth.token), body: { data: { name: input.name, notes: input.notes || '', projects: [input.project], ...(input.due ? { due_on: input.due } : {}) } } }); return v({ id: d.data?.gid, url: d.data?.permalink_url }); }
  if (id === 'clickup') { const d = await call(request, `https://api.clickup.com/api/v2/list/${encodeURIComponent(input.list)}/task`, { method: 'POST', headers: { Authorization: auth.token }, body: { name: input.name, description: input.description || '' } }); return v({ id: d.id, url: d.url }); }
  if (id === 'todoist') { const d = await call(request, 'https://api.todoist.com/rest/v2/tasks', { method: 'POST', headers: bearer(auth.token), body: { content: input.content, description: input.description || '', ...(input.due ? { due_string: input.due, due_lang: 'pt' } : {}), ...(input.project ? { project_id: input.project } : {}) } }); return v({ id: d.id, url: d.url }); }
  if (id === 'linear') {
    const d = await call(request, 'https://api.linear.app/graphql', { method: 'POST', headers: { Authorization: auth.apiKey }, body: { query: 'mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id url } } }', variables: { input: { teamId: input.team, title: input.title, description: input.description || '' } } } });
    if (d.errors?.length || !d.data?.issueCreate?.success) fail(`Linear: ${d.errors?.[0]?.message || 'erro'}`, 502);
    return v({ id: d.data.issueCreate.issue.id, url: d.data.issueCreate.issue.url });
  }
  if (id === 'jira') {
    const site = String(auth.site || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^[\w-]+\.atlassian\.net$/.test(site)) fail('Site do Jira inválido (use suaempresa.atlassian.net).');
    const d = await call(request, `https://${site}/rest/api/3/issue`, { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${auth.email}:${auth.token}`).toString('base64')}` }, body: { fields: {
      project: { key: input.project }, summary: input.summary, issuetype: { name: input.type || 'Task' },
      ...(input.description ? { description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: clip(input.description, 5000) }] }] } } : {}) } } });
    return v({ key: d.key, url: `https://${site}/browse/${d.key}` });
  }
  if (id === 'monday') {
    const d = await call(request, 'https://api.monday.com/v2', { method: 'POST', headers: { Authorization: auth.token }, body: { query: 'mutation ($board: ID!, $name: String!) { create_item (board_id: $board, item_name: $name) { id } }', variables: { board: input.board, name: input.name } } });
    if (d.errors?.length) fail(`Monday: ${d.errors[0].message}`, 502);
    return v({ id: d.data?.create_item?.id });
  }
  if (id === 'basecamp') {
    const d = await call(request, `https://3.basecampapi.com/${encodeURIComponent(auth.account)}/buckets/${encodeURIComponent(input.project)}/todolists/${encodeURIComponent(input.list)}/todos.json`, { method: 'POST', headers: { ...bearer(auth.token), 'User-Agent': 'Graao (suporte@graao.com)' }, body: { content: input.content, description: input.description || '' } });
    return v({ id: d.id, url: d.app_url });
  }
  if (id === 'klaviyo') {
    const headers = { Authorization: `Klaviyo-API-Key ${auth.apiKey}`, revision: '2024-10-15' };
    if (key === 'add_to_list') {
      const profile = await call(request, 'https://a.klaviyo.com/api/profile-import', { method: 'POST', headers, body: { data: { type: 'profile', attributes: { email: input.email, ...(input.phone ? { phone_number: input.phone } : {}) } } } });
      await call(request, `https://a.klaviyo.com/api/lists/${encodeURIComponent(input.list)}/relationships/profiles`, { method: 'POST', headers, body: { data: [{ type: 'profile', id: profile.data.id }] } });
      return v({});
    }
    if (key === 'track_event') {
      await call(request, 'https://a.klaviyo.com/api/events', { method: 'POST', headers, body: { data: { type: 'event', attributes: { properties: pairs(input.properties),
        metric: { data: { type: 'metric', attributes: { name: input.metric } } }, profile: { data: { type: 'profile', attributes: { email: input.email } } } } } } });
      return v({});
    }
  }
  if (id === 'housecall_pro') { const d = await call(request, 'https://api.housecallpro.com/customers', { method: 'POST', headers: { Authorization: `Token ${auth.apiKey}` }, body: { first_name: input.first_name, last_name: input.last_name, email: input.email, mobile_number: input.phone } }); return v({ id: d.id }); }
  if (id === 'apify') { const d = await call(request, `https://api.apify.com/v2/acts/${encodeURIComponent(input.actor)}/runs`, { method: 'POST', headers: bearer(auth.token), body: json(input.input, 'Entrada') }); return v({ run: d.data?.id, dataset: d.data?.defaultDatasetId, status: d.data?.status }); }
  if (id === 'browse_ai') { const d = await call(request, `https://api.browse.ai/v2/robots/${encodeURIComponent(input.robot)}/tasks`, { method: 'POST', headers: bearer(auth.apiKey), body: { inputParameters: json(input.input, 'Parâmetros') } }); return v({ task: d.result?.id, status: d.result?.status }); }
  if (id === 'mistral' || id === 'openrouter') {
    const url = id === 'mistral' ? 'https://api.mistral.ai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    const d = await call(request, url, { method: 'POST', headers: { ...bearer(auth.apiKey), ...(id === 'openrouter' ? { 'X-Title': 'Graao' } : {}) }, body: { model: input.model, messages: [{ role: 'user', content: clip(input.prompt, 12000) }] } });
    return v({ answer: d.choices?.[0]?.message?.content || '' });
  }
  fail('Ação de conector desconhecida.', 404);
}

// ---- Webhooks: checked, then turned into trigger events ({ key, ctx, contact }) ----
const flat = (value, out = {}, prefix = '') => {
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 80)) {
      if (item && typeof item === 'object' && ('name' in item || 'key' in item || 'label' in item) && ('value' in item || 'values' in item)) out[lower(item.name || item.key || item.label)] = [].concat(item.values ?? item.value).join(', ');
      else flat(item, out, prefix);
    }
  } else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value).slice(0, 200)) { if (item && typeof item === 'object') flat(item, out, `${prefix}${key}.`); else out[lower(`${prefix}${key}`)] = String(item ?? ''); }
  return out;
};
/** Email, phone and name found anywhere in a lead payload (TikTok, LinkedIn, Jotform, Google Forms…). */
export function leadContact(payload) {
  const fields = flat(payload), entries = Object.entries(fields);
  const email = entries.find(([, value]) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))?.[1].trim() || '';
  const phone = entries.find(([key, value]) => /phone|telefone|celular|whatsapp|mobile/.test(key) && /\d{8,}/.test(value.replace(/\D/g, '')))?.[1] || '';
  const named = key => entries.find(([k]) => k.split('.').pop() === key)?.[1] || '';
  const name = named('full_name') || named('name') || named('nome') || [named('first_name'), named('last_name')].filter(Boolean).join(' ');
  return { email: email.toLowerCase().slice(0, 254), phone: clip(phone, 40), name: clip(name, 120) };
}

export function readWebhook(id, { raw, headers, auth = {}, now = Date.now() }) {
  const body = (() => {
    const type = String(headers['content-type'] || '');
    if (/json/.test(type) || /^\s*[{[]/.test(raw)) { try { return JSON.parse(raw); } catch { return {}; } }
    if (/multipart\/form-data/.test(type)) {
      const boundary = type.match(/boundary=([^;]+)/)?.[1], out = {};
      for (const part of boundary ? raw.split(`--${boundary}`) : []) {
        const name = part.match(/name="([^"]+)"/)?.[1];
        if (name) out[name] = part.split(/\r?\n\r?\n/).slice(1).join('\n\n').replace(/\r?\n$/, '');
      }
      return out;
    }
    return Object.fromEntries(new URLSearchParams(raw));
  })();
  if (id === 'slack') {
    const timestamp = headers['x-slack-request-timestamp'];
    if (!auth.signingSecret || Math.abs(now / 1000 - Number(timestamp)) > 300 || !equal(headers['x-slack-signature'], `v0=${hmac('sha256', auth.signingSecret, `v0:${timestamp}:${raw}`, 'hex')}`)) fail('Assinatura do Slack inválida.', 401);
    if (body.type === 'url_verification') return { reply: { challenge: body.challenge }, events: [] };
    const e = body.event || {};
    if (e.bot_id || e.subtype) return { events: [] };
    const base = { channel: e.channel || e.item?.channel || '', user: e.user || '', text: e.text || '' };
    if (e.type === 'message') return { events: [{ key: e.channel_type === 'im' ? 'direct_message' : 'message', ctx: base }] };
    if (e.type === 'app_mention') return { events: [{ key: 'mention', ctx: base }] };
    if (e.type === 'reaction_added') return { events: [{ key: 'reaction', ctx: { ...base, reaction: e.reaction } }] };
    if (e.type === 'member_joined_channel') return { events: [{ key: 'member_joined', ctx: base }] };
    return { events: [] };
  }
  if (id === 'shopify') {
    if (!auth.apiSecret || !equal(headers['x-shopify-hmac-sha256'], hmac('sha256', auth.apiSecret, raw, 'base64'))) fail('Assinatura da Shopify inválida.', 401);
    if (headers['x-shopify-topic'] && headers['x-shopify-topic'] !== 'orders/create') return { events: [] };
    const customer = body.customer || {};
    return { events: [{ key: 'order_placed', ctx: { order: body.name || String(body.id || ''), total: body.total_price || '', currency: body.currency || '', status: body.financial_status || '', items: (body.line_items || []).map(item => item.name || item.title).join(', ').slice(0, 500) },
      contact: { email: lower(body.email || customer.email), phone: body.phone || customer.phone || '', name: [customer.first_name, customer.last_name].filter(Boolean).join(' ') } }] };
  }
  if (id === 'calendly') {
    if (auth.signingKey) {
      const parts = Object.fromEntries(String(headers['calendly-webhook-signature'] || '').split(',').map(item => item.split('=')));
      if (!parts.t || Math.abs(now / 1000 - Number(parts.t)) > 300 || !equal(parts.v1, hmac('sha256', auth.signingKey, `${parts.t}.${raw}`, 'hex'))) fail('Assinatura do Calendly inválida.', 401);
    }
    const key = body.event === 'invitee.canceled' ? 'invitee_canceled' : body.event === 'invitee.created' ? 'invitee_created' : '';
    const p = body.payload || {};
    return { events: key ? [{ key, ctx: { event: p.scheduled_event?.name || '', start: p.scheduled_event?.start_time || '' }, contact: { email: lower(p.email), phone: p.text_reminder_number || '', name: p.name || '' } }] : [] };
  }
  if (id === 'calcom') {
    if (auth.secret && !equal(headers['x-cal-signature-256'], hmac('sha256', auth.secret, raw, 'hex'))) fail('Assinatura do Cal.com inválida.', 401);
    const key = { BOOKING_CREATED: 'booking_created', BOOKING_CANCELLED: 'booking_cancelled' }[body.triggerEvent];
    const p = body.payload || {}, attendee = p.attendees?.[0] || {};
    return { events: key ? [{ key, ctx: { event: p.type || p.title || '', start: p.startTime || '' }, contact: { email: lower(attendee.email), phone: attendee.phoneNumber || '', name: attendee.name || '' } }] : [] };
  }
  if (id === 'typeform') {
    if (auth.secret && !equal(headers['typeform-signature'], `sha256=${hmac('sha256', auth.secret, raw, 'base64')}`)) fail('Assinatura do Typeform inválida.', 401);
    const r = body.form_response || {};
    const answers = Object.fromEntries((r.answers || []).map(answer => [answer.field?.ref || answer.field?.id, answer[answer.type]?.label ?? answer[answer.type]?.labels?.join(', ') ?? answer[answer.type]]));
    const email = (r.answers || []).find(answer => answer.type === 'email')?.email || '', phone = (r.answers || []).find(answer => answer.type === 'phone_number')?.phone_number || '';
    return { events: [{ key: 'form_response', ctx: { form: r.definition?.title || r.form_id || '', ...Object.fromEntries(Object.entries(answers).slice(0, 40).map(([k, val]) => [k, clip(typeof val === 'object' ? JSON.stringify(val) : val, 500)])) },
      contact: { ...leadContact(body), ...(email ? { email: lower(email) } : {}), ...(phone ? { phone } : {}) } }] };
  }
  if (id === 'jotform') {
    const answers = (() => { try { return JSON.parse(body.rawRequest || '{}'); } catch { return {}; } })();
    return { events: [{ key: 'submission', ctx: { form: body.formTitle || body.formID || '' }, contact: leadContact(answers) }] };
  }
  if (id === 'google_forms') return { events: [{ key: 'response', ctx: { form: body.form || '', ...Object.fromEntries(Object.entries(body.responses || {}).slice(0, 40).map(([k, val]) => [k, clip([].concat(val).join(', '), 500)])) }, contact: leadContact(body.responses || body) }] };
  if (id === 'fathom') {
    const invitee = (body.calendar_invitees || []).find(person => person.is_external !== false && person.email) || {};
    return { events: [{ key: 'meeting_ready', ctx: { title: body.meeting_title || body.title || '', summary: clip(body.default_summary?.markdown_formatted || body.summary || '', 4000), url: body.share_url || body.url || '' }, contact: { email: lower(invitee.email), name: invitee.name || '', phone: '' } }] };
  }
  if (id === 'tiktok_leads' || id === 'linkedin_leads') return { events: [{ key: 'form_submitted', ctx: { form: String(body.form_name || body.formName || body.form_id || body.formId || body.lead?.form_id || '') }, contact: leadContact(body) }] };
  fail('Este conector não recebe webhooks.', 404);
}

// ---- Triggers checked every 5 minutes. Answers { cursor, events }; the first check only sets the cursor. ----
export async function pollConnector(id, key, config, auth, cursor, { request = fetch, now = Date.now() } = {}) {
  if (id === 'google_sheets') {
    const g = await sheets(request, auth);
    if (key === 'new_row') {
      const all = await g.read(config.spreadsheetId, config.sheet || 'Página1'), header = all[0] || [];
      const seen = cursor === undefined || cursor === null ? all.length : Number(cursor);
      return { cursor: all.length, events: all.slice(Math.max(1, seen)).slice(0, 50).map((row, index) => ({ key, ctx: { spreadsheetId: config.spreadsheetId, sheet: config.sheet || 'Página1', row: Math.max(1, seen) + index + 1, ...g.asObject(header, row) } })) };
    }
    if (key === 'new_worksheet') {
      const d = await call(request, `${g.base(config.spreadsheetId)}?fields=sheets.properties`, { headers: g.headers });
      const tabs = (d.sheets || []).map(row => row.properties), known = cursor ? String(cursor).split(',') : null;
      return { cursor: tabs.map(tab => tab.sheetId).join(','), events: known ? tabs.filter(tab => !known.includes(String(tab.sheetId))).map(tab => ({ key, ctx: { spreadsheetId: config.spreadsheetId, sheet: tab.title, sheetId: tab.sheetId } })) : [] };
    }
    if (key === 'new_spreadsheet') {
      const q = "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false";
      const d = await call(request, `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, orderBy: 'createdTime desc', pageSize: '50', fields: 'files(id,name,createdTime)' })}`, { headers: g.headers });
      const files = d.files || [], latest = files[0]?.createdTime || cursor || new Date(now).toISOString();
      return { cursor: latest, events: cursor ? files.filter(file => file.createdTime > cursor).reverse().map(file => ({ key, ctx: { spreadsheetId: file.id, name: file.name } })) : [] };
    }
  }
  if (id === 'airtable' && key === 'new_record') {
    const since = cursor || new Date(now).toISOString();
    if (!cursor) return { cursor: since, events: [] };
    const formula = `IS_AFTER(CREATED_TIME(), "${since}")`;
    const d = await call(request, `https://api.airtable.com/v0/${encodeURIComponent(config.baseId)}/${encodeURIComponent(config.table)}?${new URLSearchParams({ filterByFormula: formula, pageSize: '50' })}`, { headers: { Authorization: `Bearer ${auth.token}` } });
    const records = (d.records || []).sort((a, b) => String(a.createdTime).localeCompare(String(b.createdTime)));
    return { cursor: records.at(-1)?.createdTime || since, events: records.map(record => ({ key, ctx: { baseId: config.baseId, table: config.table, record: record.id, ...Object.fromEntries(Object.entries(record.fields || {}).slice(0, 40).map(([k, val]) => [k, clip(typeof val === 'object' ? JSON.stringify(val) : val, 500)])) } })) };
  }
  fail('Gatilho sem consulta.', 404);
}

/** Checks a new connection with a cheap call where the app has one (Slack auth.test); others are checked on first use. */
export async function testConnection(id, auth, { request = fetch } = {}) {
  const def = connectorById(id);
  for (const field of def.auth) if (field.required && !String(auth[field.key] || '').trim()) fail(`Preencha "${field.label}".`);
  if (id === 'slack') { const d = await call(request, 'https://slack.com/api/auth.test', { method: 'POST', headers: { Authorization: `Bearer ${auth.botToken}` }, body: {} }); if (!d.ok) fail(`Slack: ${d.error || 'token inválido'}`); return d.team || ''; }
  if (id === 'google_sheets') { const account = json(auth.serviceAccount, 'Chave da conta de serviço'); await googleToken(account, request); return account.client_email; }
  return '';
}
