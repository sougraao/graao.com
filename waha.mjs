// Integração WhatsApp via WAHA (WhatsApp HTTP API — https://waha.devlike.pro).
// Armazena configuração e chave X-Api-Key selada em `waha-<agencyId>` (SQLite/Supabase),
// gerencia sessões, QR Code, código de pareamento, envio de teste, subcontas e webhook de entrada.
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { execute } from './model.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const rowId = agencyId => `waha-${agencyId}`;
const cleanSession = value => {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return 'default';
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(s)) throw fail('Use apenas letras, números, ponto, hífen ou sublinhado no nome da sessão.');
  return s;
};
const cleanBaseUrl = value => {
  const raw = typeof value === 'string' ? value.trim().replace(/\/+$/, '') : '';
  if (!raw) throw fail('Informe a URL do servidor WAHA (ex.: https://waha.suaagencia.com.br).');
  let u;
  try { u = new URL(raw); } catch { throw fail('Informe uma URL válida para o servidor WAHA.'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) {
    throw fail('A URL do WAHA deve começar com http:// ou https://.');
  }
  return u.origin + u.pathname.replace(/\/+$/, '');
};
const digits = value => String(value || '').replace(/\D/g, '');
const toChatId = phone => {
  const raw = String(phone || '').trim();
  if (/@[cg]\.us$|@lid$/i.test(raw)) return raw;
  const d = digits(raw);
  if (d.length < 10 || d.length > 15) throw fail('Informe um número válido com DDI e DDD (ex.: 5511999999999).');
  return `${d}@c.us`;
};

function sealKey(secret, id, plaintext) {
  if (!plaintext) return '';
  if (!secret) return `plain:${Buffer.from(plaintext, 'utf8').toString('base64url')}`;
  const key = createHmac('sha256', secret).update('graao:waha:v1').digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(id));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map(p => p.toString('base64url')).join('.');
}

function unsealKey(secret, id, token) {
  if (!token) return '';
  if (token.startsWith('plain:')) return Buffer.from(token.slice(6), 'base64url').toString('utf8');
  if (!secret) return '';
  try {
    const key = createHmac('sha256', secret).update('graao:waha:v1').digest();
    const [iv, tag, ct] = token.split('.').map(p => Buffer.from(p, 'base64url'));
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

function defaultState() {
  return {
    profile: { name: 'WhatsApp (WAHA)' },
    baseUrl: '',
    apiKeySealed: '',
    apiKeyLast4: '',
    session: 'default',
    webhookSecret: randomBytes(24).toString('hex'),
    subaccounts: {}
  };
}

function normalizeRow(row) {
  const base = defaultState();
  const out = { ...base, ...(row || {}) };
  out.profile = { name: 'WhatsApp (WAHA)', ...(out.profile || {}) };
  out.session = typeof out.session === 'string' && out.session ? out.session : 'default';
  if (!out.webhookSecret) out.webhookSecret = base.webhookSecret;
  if (!out.subaccounts || typeof out.subaccounts !== 'object' || Array.isArray(out.subaccounts)) out.subaccounts = {};
  return out;
}

export function createWahaHandler({ store, secret = process.env.GO_STORAGE_KEY || '', request = fetch }) {
  async function ensureRow(agencyId) {
    const id = rowId(agencyId);
    try {
      return normalizeRow(await store.load(id));
    } catch (err) {
      if (err.status !== 404) throw err;
      const fresh = defaultState();
      await store.insert(id, fresh);
      return normalizeRow(await store.load(id));
    }
  }

  async function changeRow(agencyId, mutate) {
    await ensureRow(agencyId);
    return store.change(rowId(agencyId), raw => {
      const row = normalizeRow(raw);
      Object.assign(raw, row);
      return mutate(raw);
    });
  }

  async function wahaFetch(row, agencyId, pathname, { method = 'GET', body, accept = 'application/json', timeout = 15000 } = {}) {
    if (!row.baseUrl) throw fail('Configure primeiro a URL do servidor WAHA.', 400);
    const apiKey = unsealKey(secret, rowId(agencyId), row.apiKeySealed);
    const headers = { Accept: accept };
    if (apiKey) headers['X-Api-Key'] = apiKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await request(`${row.baseUrl}${pathname}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeout)
      });
    } catch {
      throw fail('Não foi possível conectar ao servidor WAHA. Verifique se a URL está acessível.', 502);
    }
    if (res.status === 401 || res.status === 403) {
      throw fail('O servidor WAHA recusou a chave X-Api-Key. Confira a chave configurada.', 422);
    }
    return res;
  }

  async function fetchSessionInfo(row, agencyId, sessionName) {
    if (!row.baseUrl) return { reachable: false, status: 'UNCONFIGURED', me: null, error: '' };
    try {
      const res = await wahaFetch(row, agencyId, `/api/sessions/${encodeURIComponent(sessionName)}`, { timeout: 8000 });
      if (res.status === 404) return { reachable: true, status: 'STOPPED', me: null, error: '' };
      if (!res.ok) return { reachable: false, status: 'ERROR', me: null, error: `WAHA respondeu HTTP ${res.status}.` };
      const data = await res.json().catch(() => ({}));
      return {
        reachable: true,
        status: String(data.status || 'STOPPED').toUpperCase(),
        me: data.me || null,
        error: ''
      };
    } catch (err) {
      return { reachable: false, status: 'OFFLINE', me: null, error: err.message };
    }
  }

  function publicConfig(row, agencyId, publicOrigin, live = null) {
    return {
      configured: Boolean(row.baseUrl),
      baseUrl: row.baseUrl || '',
      hasApiKey: Boolean(row.apiKeySealed),
      apiKeyLast4: row.apiKeyLast4 || '',
      session: row.session || 'default',
      webhookUrl: `${publicOrigin}/api/waha/webhook/${encodeURIComponent(agencyId)}/${row.webhookSecret}`,
      subaccounts: row.subaccounts || {},
      live
    };
  }

  async function workspaceForSession(agencyId, row, session, listWorkspaces) {
    const workspaces = await listWorkspaces(agencyId);
    const entries = Object.entries(row.subaccounts || {}).filter(([, cfg]) => cfg?.enabled);
    const target = entries.find(([, cfg]) => (cfg.session || row.session || 'default') === session) || entries[0];
    if (!target) return workspaces[0]?.id;
    return workspaces.find(workspace => workspace.id === target[0])?.id;
  }

  async function handleWebhook({ req, url, payload, listWorkspaces, webhookBlockReason, json }) {
    let rawPath = url.searchParams.get('__path') || url.pathname;
    if (!rawPath.startsWith('/')) rawPath = '/' + rawPath;
    rawPath = rawPath.replace(/\/+/g, '/');
    const match = rawPath.match(/^\/api\/waha\/webhook\/([^/]+)\/([a-f0-9]{32,128})$/);
    if (!match) throw fail('Webhook inválido.', 404);
    const [, encodedAgencyId, token] = match;
    const agencyId = decodeURIComponent(encodedAgencyId);
    let row;
    try { row = normalizeRow(await store.load(rowId(agencyId))); }
    catch (e) { if (e.status === 404) throw fail('Assinatura do webhook inválida.', 403); throw e; }
    if (!safeEqual(row.webhookSecret, token)) throw fail('Assinatura do webhook inválida.', 403);

    const event = await payload(req);
    if (event.event !== 'message' || !event.payload || event.payload.fromMe) {
      return json({ ok: true, ignored: true });
    }
    const sessionName = String(event.session || row.session || 'default');
    const fromRaw = String(event.payload.from || '');
    const body = String(event.payload.body || '').trim().slice(0, 4000);
    if (!fromRaw || !body || fromRaw.endsWith('@g.us') || fromRaw === 'status@broadcast') {
      return json({ ok: true, ignored: true });
    }

    const phone = digits(fromRaw.replace(/@.*$/, ''));
    const senderName = String(event.payload._data?.notifyName || event.payload.notifyName || phone || 'Contato WhatsApp').slice(0, 120);
    const targetWorkspace = await workspaceForSession(agencyId, row, sessionName, listWorkspaces);
    if (!targetWorkspace) return json({ ok: true, stored: false });
    const ignored = await webhookBlockReason(agencyId, targetWorkspace, 'waha');
    if (ignored) {
      return json({ ok: true, ignored: true, reason: ignored });
    }

    await store.change(targetWorkspace, state => {
      let contact = state.contacts.find(c => digits(c.phone) === phone && phone.length >= 8);
      if (!contact) {
        const contactId = execute(state, {
          type: 'save',
          key: 'contacts',
          data: { name: senderName, phone: `+${phone}`, tags: ['WhatsApp'] }
        });
        contact = state.contacts.find(c => c.id === contactId);
      }
      if (contact) {
        execute(state, {
          type: 'message',
          data: { contactId: contact.id, channel: 'WhatsApp', direction: 'Inbound', body }
        });
      }
    });
    return json({ ok: true, stored: true, workspace: targetWorkspace });
  }

  async function handleApi({ req, res, url, method, who, payload, publicOrigin, listWorkspaces, requireActiveAccount, json }) {
    let rawPath = url.searchParams.get('__path') || url.pathname;
    if (!rawPath.startsWith('/')) rawPath = '/' + rawPath;
    rawPath = rawPath.replace(/\/+/g, '/');
    const op = rawPath.slice('/api/waha/'.length).replace(/\/+$/, '');
    async function requireSessionActive(row, session) {
      const workspace = await workspaceForSession(agencyId, row, session, listWorkspaces);
      if (workspace) await requireActiveAccount(agencyId, workspace, true, 'conversations');
    }
    const agencyId = who.agencyId;

    if (op === 'status' && method === 'GET') {
      const row = await ensureRow(agencyId);
      const sessionName = url.searchParams.get('session') ? cleanSession(url.searchParams.get('session')) : row.session;
      const live = await fetchSessionInfo(row, agencyId, sessionName);
      return json(publicConfig(row, agencyId, publicOrigin, live));
    }

    if (op === 'config' && method === 'POST') {
      const body = await payload(req);
      const baseUrl = cleanBaseUrl(body.baseUrl);
      const session = cleanSession(body.session);
      const rawKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      const clearKey = Boolean(body.clearApiKey);
      const saved = await changeRow(agencyId, row => {
        row.baseUrl = baseUrl;
        row.session = session;
        if (clearKey) {
          row.apiKeySealed = '';
          row.apiKeyLast4 = '';
        } else if (rawKey) {
          row.apiKeySealed = sealKey(secret, rowId(agencyId), rawKey);
          row.apiKeyLast4 = rawKey.slice(-4);
        }
        return normalizeRow(row);
      });
      const live = await fetchSessionInfo(saved, agencyId, saved.session);
      return json(publicConfig(saved, agencyId, publicOrigin, live));
    }

    if (op === 'disconnect' && method === 'POST') {
      const saved = await changeRow(agencyId, row => {
        row.baseUrl = '';
        row.apiKeySealed = '';
        row.apiKeyLast4 = '';
        row.session = 'default';
        return normalizeRow(row);
      });
      return json(publicConfig(saved, agencyId, publicOrigin, { reachable: false, status: 'UNCONFIGURED', me: null, error: '' }));
    }

    if (op === 'session' && method === 'POST') {
      const body = await payload(req);
      const action = String(body.action || '');
      if (!['start', 'stop', 'logout', 'restart'].includes(action)) throw fail('Ação de sessão inválida.');
      const row = await ensureRow(agencyId);
      const sessionName = body.session ? cleanSession(body.session) : row.session;
      const webhookUrl = `${publicOrigin}/api/waha/webhook/${encodeURIComponent(agencyId)}/${row.webhookSecret}`;

      if (action === 'start' || action === 'restart') await requireSessionActive(row, sessionName);
      if (action === 'start') {
        const config = /^https:\/\//i.test(webhookUrl)
          ? { webhooks: [{ url: webhookUrl, events: ['message', 'session.status'] }] }
          : undefined;
        let resApi = await wahaFetch(row, agencyId, `/api/sessions/${encodeURIComponent(sessionName)}/start`, { method: 'POST' });
        if (resApi.status === 404 || resApi.status === 422) {
          await requireSessionActive(row, sessionName);
          resApi = await wahaFetch(row, agencyId, '/api/sessions', {
            method: 'POST',
            body: { name: sessionName, start: true, ...(config ? { config } : {}) }
          });
        }
        if (!resApi.ok && resApi.status !== 409) {
          const errText = await resApi.text().catch(() => '');
          throw fail(`Não foi possível iniciar a sessão no WAHA (HTTP ${resApi.status})${errText ? `: ${errText.slice(0, 140)}` : ''}.`, 502);
        }
      } else if (action === 'stop' || action === 'logout' || action === 'restart') {
        const resApi = await wahaFetch(row, agencyId, `/api/sessions/${encodeURIComponent(sessionName)}/${action}`, { method: 'POST' });
        if (!resApi.ok && resApi.status !== 404) {
          throw fail(`Não foi possível executar "${action}" no WAHA (HTTP ${resApi.status}).`, 502);
        }
      }

      const live = await fetchSessionInfo(row, agencyId, sessionName);
      return json(publicConfig(row, agencyId, publicOrigin, live));
    }

    if (op === 'qr' && method === 'GET') {
      const row = await ensureRow(agencyId);
      const sessionName = url.searchParams.get('session') ? cleanSession(url.searchParams.get('session')) : row.session;
      const resApi = await wahaFetch(row, agencyId, `/api/${encodeURIComponent(sessionName)}/auth/qr`, {
        method: 'GET',
        accept: 'application/json, image/png;q=0.9'
      });
      if (!resApi.ok) {
        if (resApi.status === 404 || resApi.status === 422) {
          throw fail('QR Code indisponível agora. Inicie a sessão e aguarde o status SCAN_QR_CODE.', 409);
        }
        throw fail(`Não foi possível obter o QR Code no WAHA (HTTP ${resApi.status}).`, 502);
      }
      const ctype = (resApi.headers.get('content-type') || '').toLowerCase();
      let dataUrl = '';
      if (ctype.includes('application/json')) {
        const data = await resApi.json().catch(() => ({}));
        if (data.data) dataUrl = `data:${data.mimetype || 'image/png'};base64,${data.data}`;
      } else {
        const buf = Buffer.from(await resApi.arrayBuffer());
        dataUrl = `data:${ctype.split(';')[0] || 'image/png'};base64,${buf.toString('base64')}`;
      }
      if (!dataUrl) throw fail('O WAHA não retornou uma imagem de QR Code.', 502);
      return json({ dataUrl, session: sessionName });
    }

    if (op === 'pair-code' && method === 'POST') {
      const body = await payload(req);
      const phoneNumber = digits(body.phoneNumber);
      if (phoneNumber.length < 10 || phoneNumber.length > 15) throw fail('Informe o número com DDI e DDD (ex.: 5511999999999).');
      const row = await ensureRow(agencyId);
      const sessionName = body.session ? cleanSession(body.session) : row.session;
      await requireSessionActive(row, sessionName);
      const resApi = await wahaFetch(row, agencyId, `/api/${encodeURIComponent(sessionName)}/auth/request-code`, {
        method: 'POST',
        body: { phoneNumber }
      });
      if (!resApi.ok) throw fail(`Não foi possível gerar o código de pareamento (HTTP ${resApi.status}). Verifique se a sessão está em SCAN_QR_CODE.`, 502);
      const data = await resApi.json().catch(() => ({}));
      if (!data.code) throw fail('O WAHA não retornou um código de pareamento.', 502);
      return json({ code: String(data.code), session: sessionName });
    }

    if (op === 'test' && method === 'POST') {
      const body = await payload(req);
      const chatId = toChatId(body.phone);
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : '';
      if (!text) throw fail('Escreva uma mensagem para testar o envio.');
      const row = await ensureRow(agencyId);
      const sessionName = body.session ? cleanSession(body.session) : row.session;
      await requireSessionActive(row, sessionName);
      const resApi = await wahaFetch(row, agencyId, '/api/sendText', {
        method: 'POST',
        body: { session: sessionName, chatId, text }
      });
      if (!resApi.ok) {
        const detail = await resApi.text().catch(() => '');
        throw fail(`Falha ao enviar pelo WAHA (HTTP ${resApi.status})${detail ? `: ${detail.slice(0, 140)}` : ''}.`, 502);
      }
      const sent = await resApi.json().catch(() => ({}));
      return json({ ok: true, id: sent.id || sent._data?.id?._serialized || '', chatId, session: sessionName });
    }

    if (op === 'subaccount' && method === 'POST') {
      const body = await payload(req);
      const workspace = String(body.workspace || '');
      const allowed = (await listWorkspaces(agencyId)).some(w => w.id === workspace);
      if (!allowed) throw fail('Subconta inválida.', 400);
      await requireActiveAccount(agencyId, workspace, true, 'conversations');
      const saved = await changeRow(agencyId, row => {
        const prev = row.subaccounts[workspace] || { enabled: false, rebill: false, session: row.session || 'default' };
        const enabled = body.enabled !== undefined ? Boolean(body.enabled) : Boolean(prev.enabled);
        const rebill = enabled ? (body.rebill !== undefined ? Boolean(body.rebill) : Boolean(prev.rebill)) : false;
        const session = body.session !== undefined ? cleanSession(body.session) : (prev.session || row.session || 'default');
        row.subaccounts[workspace] = { enabled, rebill, session };
        return normalizeRow(row);
      });
      return json({ subaccounts: saved.subaccounts });
    }

    throw fail('Rota do WhatsApp não encontrada.', 404);
  }

  return { handleApi, handleWebhook };
}
