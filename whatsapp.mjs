// WhatsApp das subcontas: cada subconta recebe uma instância isolada num servidor de WhatsApp da agência
// (ou gerenciado pela plataforma via variáveis de ambiente). O servidor é a Evolution API v2
// (https://doc.evolution-api.com), com a chave global no header `apikey`. A stack da VPS fica em deploy/evolution.
// Os segredos ficam selados (AES-256-GCM) em `whatsapp-<agencyId>` no SQLite/Supabase.
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { execute } from './model.mjs';
import { cleanGuard } from './whatsapp-guard.mjs';
import { mediaPlaceholder } from './ui/message-media.js';
import { R2_MAX_BYTES } from './r2-storage.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const digits = value => String(value || '').replace(/\D+/g, '');
const rowId = agencyId => `whatsapp-${agencyId}`;
const PROVIDER = 'evolution';
const PROVIDER_LABEL = 'Evolution API';
const isHttps = value => /^https:\/\//i.test(String(value || ''));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function deriveKey(secret) {
  const material = typeof secret === 'string' && secret.trim()
    ? secret.trim()
    : 'graao-local-dev-whatsapp-seal-key-do-not-use-without-env';
  return createHash('sha256').update(material).digest();
}

function sealSecret(secret, aad, plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret), iv);
  cipher.setAAD(Buffer.from(String(aad)));
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `${iv.toString('base64url')}.${enc.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}

function unsealSecret(secret, aad, sealed) {
  if (!sealed) return '';
  const parts = String(sealed).split('.');
  if (parts.length !== 3) return '';
  try {
    const decipher = createDecipheriv('aes-256-gcm', deriveKey(secret), Buffer.from(parts[0], 'base64url'));
    decipher.setAAD(Buffer.from(String(aad)));
    decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(parts[1], 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function cleanBaseUrl(raw) {
  const value = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
  if (!value) throw fail(`Informe a URL do servidor ${PROVIDER_LABEL} (ex.: https://whatsapp.suaagencia.com.br).`);
  let parsed;
  try { parsed = new URL(value); } catch { throw fail(`URL da ${PROVIDER_LABEL} inválida.`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw fail(`A URL da ${PROVIDER_LABEL} deve usar http:// ou https://.`);
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

const INSTANCE_PREFIX = 'graao_';
const INSTANCE_NAME_LIMIT = 37;
function instanceSlug(workspaceId) {
  const clean = String(workspaceId || 'ws').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, INSTANCE_NAME_LIMIT - INSTANCE_PREFIX.length) || 'ws';
  return `${INSTANCE_PREFIX}${clean}`;
}

function normalizeQr(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  if (value.startsWith('data:image/')) return value;
  if (/^[A-Za-z0-9+/=\r\n]{100,}$/.test(value)) return `data:image/png;base64,${value.replace(/\s+/g, '')}`;
  return '';
}

function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (['connected', 'open', 'working', 'authenticated'].includes(s)) return 'connected';
  if (['connecting', 'qrcode', 'scan_qr_code', 'starting', 'pairing'].includes(s)) return 'connecting';
  if (s === 'hibernated') return 'hibernated';
  return 'disconnected';
}

function extractPhone(value) {
  if (!value) return '';
  if (typeof value === 'object') {
    return extractPhone(value.id || value.jid || value.owner || value.phone || value.number || '');
  }
  const raw = String(value).replace(/@.*$/, '').replace(/:.*$/, '');
  return digits(raw);
}

async function readJsonSafe(res) {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 240) }; }
}

// ---------- Evolution API v2 ----------

const GROUP_JID = /^\d[\d-]{5,40}@g\.us$/;

const EVOLUTION_EVENTS = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'CALL'];

function evolutionError(data) {
  const raw = data?.response?.message ?? data?.message ?? data?.error ?? '';
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map(item => {
    if (typeof item === 'string') return item;
    if (item && item.exists === false) return `o número ${digits(item.number || item.jid)} não tem WhatsApp`;
    return item ? JSON.stringify(item) : '';
  }).filter(Boolean).join('; ').slice(0, 200);
}

// Conteúdo do Baileys fora dos envelopes comuns (temporária, visualização única, editada, álbum, figurinha animada).
function unwrap(message, once = false, depth = 0) {
  if (!message || typeof message !== 'object' || depth > 4) return { message: null, once };
  const single = message.viewOnceMessage?.message || message.viewOnceMessageV2?.message || message.viewOnceMessageV2Extension?.message;
  const inner = single || message.ephemeralMessage?.message || message.documentWithCaptionMessage?.message || message.editedMessage?.message
    || message.associatedChildMessage?.message || message.lottieStickerMessage?.message;
  return inner ? unwrap(inner, once || Boolean(single), depth + 1) : { message, once };
}

// A mídia da mensagem e, quando o arquivo não fica no graao, o porquê em `skip`.
function evolutionMedia(raw) {
  const { message, once } = unwrap(raw);
  if (!message) return null;
  const [kind, part] = message.imageMessage ? ['image', message.imageMessage]
    : message.videoMessage || message.ptvMessage ? [message.videoMessage?.gifPlayback ? 'gif' : 'video', message.videoMessage || message.ptvMessage]
      : message.audioMessage ? ['audio', message.audioMessage]
        : message.documentMessage ? ['document', message.documentMessage]
          : message.stickerMessage ? ['sticker', message.stickerMessage] : [];
  if (!kind) return null;
  const size = Number(part.fileLength?.low ?? part.fileLength) || 0; // o Baileys manda número, texto ou Long
  const side = value => Math.round(Number(value)) > 0 ? Math.min(20000, Math.round(Number(value))) : 0;
  const width = side(part.width), height = side(part.height);
  const skip = once || part.viewOnce ? 'once' : size > R2_MAX_BYTES ? 'big' : kind === 'sticker' && part.isLottie ? 'lottie' : '';
  return { kind, mime: String(part.mimetype || '').split(';')[0].trim().toLowerCase().slice(0, 100), name: String(part.fileName || '').trim().slice(0, 200), size, ...(width && height ? { width, height } : {}), skip };
}

function evolutionText(raw) {
  const { message } = unwrap(raw);
  if (!message) return '';
  const text = message.conversation || message.extendedTextMessage?.text || message.imageMessage?.caption
    || message.videoMessage?.caption || message.documentMessage?.caption || message.buttonsResponseMessage?.selectedDisplayText
    || message.listResponseMessage?.title || message.templateButtonReplyMessage?.selectedDisplayText
    || message.interactiveResponseMessage?.body?.text
    || message.templateMessage?.hydratedTemplate?.hydratedContentText || message.templateMessage?.hydratedFourRowTemplate?.hydratedContentText
    || message.templateMessage?.interactiveMessageTemplate?.body?.text || message.interactiveMessage?.body?.text
    || message.buttonsMessage?.contentText || message.listMessage?.description || message.listMessage?.title || '';
  if (text) return String(text);
  const media = evolutionMedia(raw);
  if (media) {
    const label = mediaPlaceholder(media.kind, media.name);
    return media.skip === 'once' ? label.replace(/\]$/, ' de visualização única]') : media.skip === 'big' ? label.replace(/\]$/, ' acima de 50 MB]')
      : media.skip === 'lottie' ? '[Figurinha animada]' : label;
  }
  if (message.locationMessage || message.liveLocationMessage) return '[Localização]';
  if (message.contactMessage || message.contactsArrayMessage) return '[Contato]';
  const titled = (label, title) => `[${label}] ${title || ''}`.trim();
  const poll = message.pollCreationMessage || message.pollCreationMessageV2 || message.pollCreationMessageV3;
  if (poll) return titled('Enquete', poll.name);
  if (message.eventMessage) return titled('Evento', message.eventMessage.name);
  if (message.productMessage) return titled('Produto', message.productMessage.product?.title);
  if (message.orderMessage) return titled('Pedido', message.orderMessage.orderTitle);
  if (message.groupInviteMessage) return titled('Convite de grupo', message.groupInviteMessage.groupName);
  if (message.stickerPackMessage) return titled('Pacote de figurinhas', message.stickerPackMessage.name);
  return '';
}

/** Só o texto e o remetente das mensagens recebidas, para quem não guarda nada (a confirmação do celular). */
export function inboundTexts(payload) {
  const event = String(payload?.event || payload?.type || '').toLowerCase().replace(/_/g, '.');
  if (event !== 'messages.upsert') return [];
  const data = payload.data;
  const list = Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : [data || {}];
  return list.map(evolutionInbound).filter(Boolean).map(({ phone, lid, text }) => ({ phone, lid, text }));
}

function evolutionInbound(entry) {
  const key = entry?.key || {};
  if (key.fromMe) return null;
  let jid = String(key.remoteJid || '');
  if (!jid || /@g\.us$|@broadcast$|@newsletter$/i.test(jid)) return null;
  // WhatsApp agora pode identificar o contato por LID; a Evolution manda o número real em remoteJidAlt/senderPn.
  // Sem nenhum dos dois, a mensagem entra pelo LID: melhor um contato sem telefone do que uma mensagem perdida.
  const lid = [key.remoteJid, key.remoteJidAlt].map(value => String(value || '')).find(value => /^\d+@lid$/i.test(value))?.replace(/@lid$/i, '') || '';
  if (/@lid$/i.test(jid)) {
    const alt = [key.remoteJidAlt, key.senderPn, entry.senderPn].map(value => String(value || '')).find(value => value && !/@lid$/i.test(value));
    jid = alt || '';
  }
  const phone = jid ? extractPhone(jid) : '';
  const vote = pollVote(entry);
  const text = (vote ? `Escolheu: ${vote}` : evolutionText(entry.message)).trim().slice(0, 4000);
  if (!text || (phone ? phone.length < 8 : !lid)) return null;
  const senderName = String(entry.pushName || (phone ? `+${phone}` : 'Contato do WhatsApp')).trim().slice(0, 120);
  const ad = adReferral(entry);
  const { skip, ...media } = evolutionMedia(entry.message) || { skip: 'none' };
  return { id: String(key.id || '').slice(0, 120), phone, lid, text, senderName, at: (Number(entry.messageTimestamp) || 0) * 1000, ...(ad ? { ad } : {}), ...(skip ? {} : { media }) };
}

// Ligação recebida no WhatsApp. Só o começo (offer) e os três resultados que dizem o que houve; `terminate` vem tanto
// de quem desligou quanto de quem atendeu no celular, então não muda nada.
const callResults = { offer: 'recebida', accept: 'atendida', reject: 'recusada', timeout: 'não atendida' };
function evolutionCall(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  const id = String(data.id || '').slice(0, 120), status = String(data.status || '');
  if (!id || !Object.hasOwn(callResults, status) || data.isGroup) return null;
  const from = [data.from, data.chatId].map(value => String(value || ''));
  const jid = from.find(value => /@(s\.whatsapp\.net|c\.us)$/i.test(value)), hidden = from.find(value => /@lid$/i.test(value));
  const phone = jid ? extractPhone(jid) : '', lid = hidden ? extractPhone(hidden) : '';
  if (phone ? phone.length < 8 : !lid) return null;
  return { id, status, video: Boolean(data.isVideo), phone, lid, senderName: phone ? `+${phone}` : 'Contato do WhatsApp' };
}

// "Click to WhatsApp" ads: the first message carries the ad in contextInfo.externalAdReply (Baileys), in the
// entry or inside the text/image message.
function adReferral(entry) {
  const message = entry?.message || {};
  const contexts = [entry?.contextInfo, message.contextInfo, message.extendedTextMessage?.contextInfo, message.imageMessage?.contextInfo, message.videoMessage?.contextInfo];
  const ad = contexts.map(context => context?.externalAdReply).find(item => item && (item.sourceId || item.sourceUrl || item.ctwaClid));
  if (!ad) return null;
  const clip = (value, limit) => String(value || '').trim().slice(0, limit);
  return { id: clip(ad.sourceId, 80), url: clip(ad.sourceUrl, 500), title: clip(ad.title, 200), clickId: clip(ad.ctwaClid, 200), type: clip(ad.sourceType, 40) };
}

// A poll vote, when the Evolution API delivers it decrypted (the chosen option names).
function pollVote(entry) {
  const update = entry?.message?.pollUpdateMessage;
  const options = update?.vote?.selectedOptions || entry?.pollUpdates?.[0]?.vote?.selectedOptions;
  if (!update && !entry?.pollUpdates) return '';
  return (Array.isArray(options) ? options : []).map(option => typeof option === 'string' ? option : option?.name).filter(Boolean).map(name => String(name).slice(0, 100)).join(', ');
}

function createEvolutionAdapter(call) {
  const send = (creds, path, options = {}) => call(creds.baseUrl, path, {
    ...options,
    headers: { apikey: creds.adminToken, ...(options.headers || {}) }
  });
  const name = sub => encodeURIComponent(sub.instanceName);
  const webhookBody = url => ({ enabled: true, url, byEvents: false, base64: false, events: EVOLUTION_EVENTS });

  async function connectOnce(creds, sub, phone) {
    const query = phone ? `?number=${encodeURIComponent(phone)}` : '';
    const res = await send(creds, `/instance/connect/${name(sub)}${query}`);
    if (res.status === 404) return { missing: true };
    const data = await readJsonSafe(res);
    if (!res.ok) {
      const detail = evolutionError(data);
      throw fail(`Não foi possível iniciar a conexão na Evolution API (HTTP ${res.status})${detail ? `: ${detail}` : ''}.`, 502);
    }
    const state = data.instance?.state || data.instance?.status || '';
    const qrcode = normalizeQr(data.base64 || data.qrcode?.base64 || '');
    const paircode = String(data.pairingCode || data.qrcode?.pairingCode || '').trim();
    return { status: state ? normalizeStatus(state) : 'connecting', qrcode, paircode, phone: '', profileName: '' };
  }

  return {
    async provision({ creds, sub, webhookUrl }) {
      const body = {
        instanceName: sub.instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: false,
        groupsIgnore: true,
        rejectCall: false,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false
      };
      if (isHttps(webhookUrl)) body.webhook = webhookBody(webhookUrl);
      const res = await send(creds, '/instance/create', { method: 'POST', body });
      const data = await readJsonSafe(res);
      if (!res.ok) {
        const detail = evolutionError(data);
        // A instância já existe no servidor (ex.: banco do app restaurado): reaproveita, a chave global basta.
        if ([400, 403, 409].includes(res.status) && /already in use|already exists|já existe|em uso/i.test(detail)) {
          return { token: sub.instanceName, status: 'disconnected' };
        }
        if (res.status === 401) throw fail('A Evolution API recusou a API Key global. Confira a chave configurada.', 422);
        throw fail(`Não foi possível criar a instância na Evolution API (HTTP ${res.status})${detail ? `: ${detail}` : ''}.`, 502);
      }
      const token = String(typeof data.hash === 'string' ? data.hash : (data.hash?.apikey || data.instance?.token || sub.instanceName));
      return { token, status: normalizeStatus(data.instance?.status || data.instance?.state) };
    },
    async setWebhook({ creds, sub, webhookUrl }) {
      await send(creds, `/webhook/set/${name(sub)}`, { method: 'POST', body: { webhook: webhookBody(webhookUrl) } });
    },
    async status({ creds, sub }) {
      const res = await send(creds, `/instance/fetchInstances?instanceName=${name(sub)}`, { timeout: 10000 });
      if (res.status === 404) return { missing: true };
      if (res.status === 401) return { error: 'A Evolution API recusou a API Key global.' };
      const data = await readJsonSafe(res);
      if (!res.ok) return { error: `HTTP ${res.status}` };
      const list = Array.isArray(data) ? data : (data && typeof data === 'object' && !data.raw ? [data] : []);
      const item = list.find(row => (row.name || row.instanceName || row.instance?.instanceName) === sub.instanceName);
      if (!item) return { missing: true };
      const inst = item.instance || item;
      const status = normalizeStatus(inst.connectionStatus || inst.status || inst.state);
      const live = {
        status,
        qrcode: '',
        paircode: '',
        phone: status === 'connected' ? extractPhone(inst.ownerJid || inst.owner || inst.number || '') : '',
        profileName: String(inst.profileName || '').trim().slice(0, 120)
      };
      // Enquanto aguarda a leitura, o /connect devolve o QR atual sem reiniciar o socket.
      if (status === 'connecting') {
        const qr = await connectOnce(creds, sub, '').catch(() => null);
        if (qr && !qr.missing) {
          live.qrcode = qr.qrcode;
          live.paircode = qr.paircode;
          if (qr.status === 'connected') live.status = 'connected';
        }
      }
      return live;
    },
    async connect({ creds, sub, phone }) {
      let parsed = await connectOnce(creds, sub, phone);
      if (parsed.missing || parsed.status === 'connected') return parsed;
      if (phone && !parsed.paircode) {
        // Já havia um QR em andamento: encerra e reabre pedindo código de pareamento para o número.
        await send(creds, `/instance/logout/${name(sub)}`, { method: 'DELETE' }).catch(() => null);
        await wait(800);
        parsed = await connectOnce(creds, sub, phone);
      }
      return parsed;
    },
    // QR que não vem (a Evolution às vezes responde vazio enquanto abre a conexão): espera e pede de novo.
    async connectPatient(args) {
      let parsed = await this.connect(args);
      for (let attempt = 0; attempt < 2 && !parsed.missing && parsed.status !== 'connected' && !parsed.qrcode && !parsed.paircode; attempt++) {
        await wait(args.pause);
        parsed = await this.connect(args);
      }
      return parsed;
    },
    async disconnect({ creds, sub }) {
      await send(creds, `/instance/logout/${name(sub)}`, { method: 'DELETE' });
    },
    // Apaga a instância do servidor. Sair antes desconecta o aparelho no celular; a que já não existe está resolvida.
    async remove({ creds, sub }) {
      await send(creds, `/instance/logout/${name(sub)}`, { method: 'DELETE' }).catch(() => null);
      const res = await send(creds, `/instance/delete/${name(sub)}`, { method: 'DELETE', retry: true, timeout: 25000 });
      if (res.ok || res.status === 404) return;
      const detail = evolutionError(await readJsonSafe(res));
      throw fail(`Não foi possível excluir a instância na Evolution API (HTTP ${res.status})${detail ? `: ${detail}` : ''}.`, 502);
    },
    // Confere o servidor: no ar, versão e chave global. `names` limita a contagem às instâncias da agência.
    async server({ creds, names }) {
      const started = Date.now();
      const home = await send(creds, '/', { timeout: 10000 });
      const info = await readJsonSafe(home);
      if (!home.ok || !info.version) return { ok: false, error: `O endereço respondeu, mas não é uma Evolution API (HTTP ${home.status}).` };
      const version = String(info.version).slice(0, 20);
      const res = await send(creds, '/instance/fetchInstances', { timeout: 15000 });
      if (res.status === 401 || res.status === 403) return { ok: false, version, error: 'A Evolution API recusou a API Key global. Confira a chave configurada.' };
      const data = await readJsonSafe(res);
      if (!res.ok && res.status !== 404) return { ok: false, version, error: `A Evolution API respondeu HTTP ${res.status} ao listar as instâncias.` };
      const own = (Array.isArray(data) ? data : []).filter(row => names.has(row.name || row.instanceName || row.instance?.instanceName));
      const open = own.filter(row => normalizeStatus((row.instance || row).connectionStatus || (row.instance || row).status) === 'connected');
      return { ok: true, version, instances: own.length, connected: open.length, latencyMs: Date.now() - started };
    },
    // ---------- Vigia (whatsapp-guard.mjs) ----------
    /** Todas as instâncias do servidor: nome → { status }. */
    async listAll({ creds }) {
      const res = await send(creds, '/instance/fetchInstances', { timeout: 15000, bypass: true });
      if (res.status === 404) return new Map();
      const data = await readJsonSafe(res);
      if (!res.ok || !Array.isArray(data)) throw fail(`A Evolution API respondeu HTTP ${res.status} ao listar as instâncias.`, 502);
      return new Map(data.map(row => [String(row.name || row.instanceName || row.instance?.instanceName || ''), { status: normalizeStatus((row.instance || row).connectionStatus || (row.instance || row).status) }]));
    },
    async findMessages({ creds, sub }, { from, until, page, size }) {
      const body = { where: { messageTimestamp: { gte: new Date(from).toISOString(), lte: new Date(until).toISOString() } }, page, offset: size };
      const res = await send(creds, `/chat/findMessages/${name(sub)}`, { method: 'POST', body, timeout: 20000 });
      const data = await readJsonSafe(res);
      const records = data?.messages?.records;
      if (!res.ok || !Array.isArray(records)) throw fail(`Não foi possível buscar as mensagens (HTTP ${res.status}).`, 502);
      return { records, pages: Number(data.messages.pages) || 1 };
    },
    async webhook({ creds, sub }) {
      const res = await send(creds, `/webhook/find/${name(sub)}`);
      if (!res.ok) return null;
      const data = await readJsonSafe(res);
      return data && typeof data === 'object' ? data : null;
    },
    /** Pergunta que só uma conexão viva responde. true: respondeu · false: travou · null: não dá para saber. */
    async probe({ creds, sub }) {
      if (!sub.phone) return null;
      try {
        const res = await send(creds, `/chat/fetchBusinessProfile/${name(sub)}`, { method: 'POST', body: { number: sub.phone }, timeout: 20000 });
        return res.ok ? true : res.status === 500 ? false : null;
      } catch (err) {
        return err?.status === 504 ? false : null;
      }
    },
    async restart({ creds, sub }) {
      const res = await send(creds, `/instance/restart/${name(sub)}`, { method: 'POST', timeout: 20000 });
      if (!res.ok) throw fail(`Não foi possível reiniciar a instância (HTTP ${res.status}).`, 502);
    },
    async groups({ creds, sub }) {
      const res = await send(creds, `/group/fetchAllGroups/${name(sub)}?getParticipants=false`, { timeout: 30000 });
      const data = await readJsonSafe(res);
      if (!res.ok) throw fail(`Não foi possível listar os grupos (HTTP ${res.status})${evolutionError(data) ? `: ${evolutionError(data)}` : ''}.`, 502);
      return (Array.isArray(data) ? data : data.groups || []).map(row => ({ jid: String(row.id || ''), name: String(row.subject || '').trim().slice(0, 120) || 'Grupo sem nome', size: Number(row.size) || 0 }));
    },
    async send({ creds, sub, number, text, retry = true }) {
      const res = await send(creds, `/message/sendText/${name(sub)}`, { method: 'POST', body: { number, text }, retry, timeout: 25000 });
      const data = await readJsonSafe(res);
      return { ok: res.ok, status: res.status, message: res.ok ? '' : evolutionError(data), id: String(data.key?.id || data.id || ''), jid: String(data.key?.remoteJid || '') };
    },
    // Workflows: a file by public URL (image, video, document or audio) and the "typing…" indicator.
    async sendMedia({ creds, sub, number, media }) {
      const body = { number, mediatype: media.type, media: media.url, ...(media.caption ? { caption: media.caption } : {}), ...(media.fileName ? { fileName: media.fileName } : {}) };
      const res = await send(creds, `/message/sendMedia/${name(sub)}`, { method: 'POST', body, retry: true, timeout: 45000 });
      const data = await readJsonSafe(res);
      return { ok: res.ok, status: res.status, message: res.ok ? '' : evolutionError(data), id: String(data.key?.id || data.id || '') };
    },
    // Workflows: reply buttons (up to 3), a list (up to 10 options) or a poll; button and list answers come back as text.
    async interactive({ creds, sub, number, message, retry = true }) {
      const { kind, body, options, buttonText, footer } = message;
      const path = kind === 'buttons' ? 'sendButtons' : kind === 'list' ? 'sendList' : 'sendPoll';
      const payload = kind === 'buttons'
        ? { number, title: '', description: body, footer: footer || '', buttons: options.map((label, n) => ({ type: 'reply', displayText: label, id: `opcao_${n + 1}` })) }
        : kind === 'list'
          ? { number, title: '', description: body, buttonText: buttonText || 'Ver opções', footerText: footer || '', sections: [{ title: 'Opções', rows: options.map((label, n) => ({ title: label, description: '', rowId: `opcao_${n + 1}` })) }] }
          : { number, name: body, selectableCount: 1, values: options };
      const res = await send(creds, `/message/${path}/${name(sub)}`, { method: 'POST', body: payload, retry, timeout: 25000 });
      const data = await readJsonSafe(res);
      return { ok: res.ok, status: res.status, message: res.ok ? '' : evolutionError(data), id: String(data.key?.id || data.id || '') };
    },
    /** Os bytes de uma mídia recebida. O servidor acha a mensagem pelo id e baixa do WhatsApp. */
    async media({ creds, sub, id }) {
      const res = await send(creds, `/chat/getBase64FromMediaMessage/${name(sub)}`, { method: 'POST', body: { message: { key: { id } }, convertToMp4: false }, timeout: 40000, isolated: true });
      const data = await readJsonSafe(res);
      if (!res.ok || typeof data.base64 !== 'string' || !data.base64) {
        throw [400, 404].includes(res.status) || res.ok ? fail('O WhatsApp não tem mais este arquivo.', 404) : fail(`Não foi possível buscar o arquivo no WhatsApp (HTTP ${res.status}).`, 502);
      }
      return { mime: String(data.mimetype || '').split(';')[0].trim().toLowerCase(), name: String(data.fileName || ''), bytes: Buffer.from(data.base64, 'base64') };
    },
    async presence({ creds, sub, number, seconds }) {
      const res = await send(creds, `/chat/sendPresence/${name(sub)}`, { method: 'POST', body: { number, presence: 'composing', delay: seconds * 1000 }, timeout: seconds * 1000 + 15000 });
      const data = await readJsonSafe(res);
      return { ok: res.ok, status: res.status, message: res.ok ? '' : evolutionError(data) };
    },
    parseWebhook(body) {
      const event = String(body.event || body.type || '').toLowerCase().replace(/_/g, '.');
      if (event === 'connection.update') {
        const d = body.data || {};
        const status = normalizeStatus(d.state || d.status);
        return {
          kind: 'connection',
          parsed: {
            status,
            phone: status === 'connected' ? extractPhone(d.wuid || d.ownerJid || body.sender || '') : '',
            profileName: String(d.profileName || '').trim().slice(0, 120)
          }
        };
      }
      if (event === 'call') {
        const call = evolutionCall(Array.isArray(body.data) ? body.data[0] : body.data);
        return call ? { kind: 'call', call } : { kind: 'ignore' };
      }
      if (event !== 'messages.upsert') return { kind: 'ignore' };
      const list = Array.isArray(body.data) ? body.data : Array.isArray(body.data?.messages) ? body.data.messages : [body.data || {}];
      return { kind: 'messages', items: list.map(evolutionInbound).filter(Boolean) };
    }
  };
}

// ---------- Estado persistido ----------

function blankRow() {
  return {
    profile: { name: `WhatsApp (${PROVIDER_LABEL})` },
    provider: PROVIDER,
    baseUrl: '',
    adminTokenSealed: '',
    adminTokenLast4: '',
    subaccounts: {}
  };
}

function normalizeSub(workspaceId, raw) {
  let sub = raw && typeof raw === 'object' ? raw : {};
  // Vínculo anterior à Evolution: fica só o que a agência decidiu (ativo, rebilling) e a URL do webhook.
  if (sub.provider !== PROVIDER) sub = { enabled: sub.enabled, rebill: sub.rebill, instanceName: sub.instanceName, webhookSecret: sub.webhookSecret };
  return {
    enabled: sub.enabled !== undefined ? Boolean(sub.enabled) : true,
    rebill: Boolean(sub.rebill),
    instanceName: String(sub.instanceName || instanceSlug(workspaceId)).slice(0, 48),
    provider: PROVIDER,
    tokenSealed: String(sub.tokenSealed || ''),
    tokenLast4: String(sub.tokenLast4 || ''),
    webhookSecret: typeof sub.webhookSecret === 'string' && sub.webhookSecret.length >= 32
      ? sub.webhookSecret
      : randomBytes(24).toString('hex'),
    status: normalizeStatus(sub.status),
    phone: digits(sub.phone),
    profileName: String(sub.profileName || '').slice(0, 120),
    updatedAt: String(sub.updatedAt || ''),
    ...(sub.guard ? { guard: cleanGuard(sub.guard) } : {})
  };
}

function normalizeRow(row) {
  const next = { ...blankRow(), ...(row && typeof row === 'object' ? row : {}) };
  // Servidor salvo antes da Evolution: a URL e a chave não servem mais.
  const current = !row || row.provider === PROVIDER;
  next.provider = PROVIDER;
  next.profile = { name: `WhatsApp (${PROVIDER_LABEL})` };
  next.baseUrl = current ? String(next.baseUrl || '') : '';
  next.adminTokenSealed = current ? String(next.adminTokenSealed || '') : '';
  next.adminTokenLast4 = current ? String(next.adminTokenLast4 || '') : '';
  const subs = next.subaccounts && typeof next.subaccounts === 'object' ? next.subaccounts : {};
  next.subaccounts = Object.fromEntries(Object.entries(subs).map(([id, cfg]) => [id, normalizeSub(id, cfg)]));
  return next;
}

function resolvePath(url) {
  let rawPath = url.searchParams.get('__path') || url.pathname;
  if (!rawPath.startsWith('/')) rawPath = '/' + rawPath;
  return rawPath.replace(/\/+/g, '/');
}

export function createWhatsAppHandler({
  store,
  secret = process.env.GO_STORAGE_KEY,
  request = fetch,
  evolutionBaseUrl = process.env.EVOLUTION_BASE_URL || '',
  evolutionApiKey = process.env.EVOLUTION_API_KEY || '',
  qrPause = 2500,
  onMedia = null
}) {
  const managed = { baseUrl: String(evolutionBaseUrl || '').trim().replace(/\/+$/, ''), adminToken: String(evolutionApiKey || '').trim() };
  const hasManaged = Boolean(managed.baseUrl && managed.adminToken);

  // Disjuntor: servidor que não respondeu 3 vezes seguidas não segura os próximos envios; em 20 s tenta de novo.
  // Só conta espera esgotada: recusa e 502/503 voltam na hora e não atrasam ninguém.
  const breakers = new Map();
  const breakerOf = baseUrl => { if (!breakers.has(baseUrl)) breakers.set(baseUrl, { fails: 0, until: 0 }); return breakers.get(baseUrl); };
  const notDelivered = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'];
  const slow = err => ['TimeoutError', 'AbortError'].includes(err?.name) || ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(networkCode(err));
  const networkCode = err => err?.cause?.code || err?.code || 'unknown';

  async function call(baseUrl, path, { method = 'GET', headers = {}, body, timeout = 15000, retry = false, bypass = false, isolated = false } = {}) {
    if (!baseUrl) throw fail(`Servidor ${PROVIDER_LABEL} não configurado.`, 400);
    const breaker = breakerOf(baseUrl);
    if (!bypass && breaker.until > Date.now()) throw Object.assign(fail(`A ${PROVIDER_LABEL} está fora do ar. Nova tentativa em instantes.`, 503), { network: 'CIRCUIT' });
    // `isolated`: uma busca demorada (mídia grande) não conta como servidor fora do ar.
    const trip = () => { if (!isolated && ++breaker.fails >= 3) { breaker.fails = 0; breaker.until = Date.now() + 20_000; } };
    const allHeaders = { Accept: 'application/json', ...headers };
    if (body !== undefined) allHeaders['Content-Type'] = 'application/json';
    const attempt = async () => {
      const init = { method, headers: allHeaders, signal: AbortSignal.timeout(timeout) };
      if (body !== undefined) init.body = JSON.stringify(body);
      return request(`${baseUrl}${path}`, init);
    };
    let res;
    try {
      res = await attempt();
      // Só repete o que com certeza não chegou: 503 do proxy (container reiniciando) ou conexão recusada.
      // Um 502 ou uma conexão cortada no meio pode ter enviado; repetir duplicaria a mensagem.
      if (retry && res.status === 503) { await wait(1500); res = await attempt(); }
    } catch (first) {
      let err = first;
      if (retry && notDelivered.includes(networkCode(err))) {
        await wait(1500);
        try { res = await attempt(); } catch (second) { err = second; }
      }
      if (!res) {
        if (slow(err)) trip();
        if (err?.name === 'TimeoutError' || err?.name === 'AbortError') throw fail(`A ${PROVIDER_LABEL} não respondeu a tempo (timeout).`, 504);
        throw Object.assign(fail(`Não foi possível alcançar a ${PROVIDER_LABEL}: ${err?.message || 'erro de rede'}.`, 502), { network: networkCode(err) });
      }
    }
    if (!isolated) { breaker.fails = 0; breaker.until = 0; }
    return res;
  }

  const adapter = createEvolutionAdapter(call);

  async function ensureRow(agencyId) {
    const id = rowId(agencyId);
    try {
      return normalizeRow(await store.load(id));
    } catch (err) {
      if (err?.status !== 404) throw err;
    }
    await store.insert(id, blankRow());
    return normalizeRow(await store.load(id));
  }

  async function changeRow(agencyId, mutate) {
    await ensureRow(agencyId);
    let updated = null;
    await store.change(rowId(agencyId), raw => {
      const normalized = normalizeRow(raw);
      updated = normalizeRow(mutate(normalized) || normalized);
      Object.assign(raw, updated);
    });
    return updated;
  }

  function serverCredentials(row, agencyId) {
    const customUrl = String(row.baseUrl || '').trim().replace(/\/+$/, '');
    const customAdmin = unsealSecret(secret, `${rowId(agencyId)}:admin`, row.adminTokenSealed);
    if (customUrl && customAdmin) {
      return { baseUrl: customUrl, adminToken: customAdmin, managed: false, configured: true };
    }
    if (hasManaged) return { ...managed, managed: true, configured: true };
    return { baseUrl: customUrl, adminToken: customAdmin, managed: false, configured: false };
  }

  const subFor = (row, workspaceId) => normalizeSub(workspaceId, row.subaccounts?.[workspaceId]);

  function instanceTokenOf(row, agencyId, workspaceId) {
    const sub = subFor(row, workspaceId);
    if (!sub.tokenSealed) return '';
    return unsealSecret(secret, `${rowId(agencyId)}:sub:${workspaceId}`, sub.tokenSealed);
  }

  const webhookUrlOf = (publicOrigin, agencyId, workspaceId, sub) =>
    `${publicOrigin}/api/whatsapp/webhook/${encodeURIComponent(agencyId)}/${encodeURIComponent(workspaceId)}/${sub.webhookSecret}`;

  async function saveLive(agencyId, workspaceId, parsed) {
    return changeRow(agencyId, current => {
      const cur = normalizeSub(workspaceId, current.subaccounts[workspaceId]);
      cur.status = parsed.status;
      if (parsed.phone) cur.phone = parsed.phone;
      if (parsed.profileName) cur.profileName = parsed.profileName;
      if (parsed.status === 'disconnected') cur.phone = '';
      cur.updatedAt = new Date().toISOString();
      current.subaccounts[workspaceId] = cur;
      return current;
    });
  }

  async function forgetInstance(agencyId, workspaceId) {
    await changeRow(agencyId, current => {
      const cur = normalizeSub(workspaceId, current.subaccounts[workspaceId]);
      cur.tokenSealed = '';
      cur.tokenLast4 = '';
      cur.status = 'disconnected';
      cur.phone = '';
      cur.guard = cleanGuard(null);
      current.subaccounts[workspaceId] = cur;
      return current;
    });
  }

  async function ensureInstance(agencyId, workspaceId, publicOrigin) {
    let row = await ensureRow(agencyId);
    const creds = serverCredentials(row, agencyId);
    if (!creds.configured) {
      throw fail('O WhatsApp ainda não foi configurado pela agência.', 400);
    }
    let sub = subFor(row, workspaceId);
    if (!sub.enabled) {
      throw fail('O recurso de WhatsApp não está habilitado para esta subconta.', 403);
    }
    // Grava o vínculo antes de usá-lo: sem registro salvo, cada leitura sortearia outro segredo e a Evolution
    // chamaria um endereço que o webhook recusa.
    row = await changeRow(agencyId, current => {
      current.subaccounts[workspaceId] = subFor(current, workspaceId);
      return current;
    });
    sub = row.subaccounts[workspaceId];
    const webhookUrl = webhookUrlOf(publicOrigin, agencyId, workspaceId, sub);

    let token = instanceTokenOf(row, agencyId, workspaceId);
    if (!token) {
      const created = await adapter.provision({ creds, sub, webhookUrl });
      token = created.token;
      row = await changeRow(agencyId, current => {
        const nextSub = subFor(current, workspaceId);
        nextSub.tokenSealed = sealSecret(secret, `${rowId(agencyId)}:sub:${workspaceId}`, token);
        nextSub.tokenLast4 = token.slice(-4);
        nextSub.status = created.status || 'disconnected';
        nextSub.updatedAt = new Date().toISOString();
        current.subaccounts[workspaceId] = nextSub;
        return current;
      });
      sub = row.subaccounts[workspaceId];
    }

    // Regrava o webhook a cada conexão: corrige domínio trocado ou instância recriada no servidor.
    if (isHttps(webhookUrl)) {
      await adapter.setWebhook({ creds, token, sub, webhookUrl }).catch(() => {});
    }
    return { row, sub, token, creds, webhookUrl };
  }

  async function fetchLiveSubStatus(row, agencyId, workspaceId) {
    const creds = serverCredentials(row, agencyId);
    const sub = subFor(row, workspaceId);
    const token = instanceTokenOf(row, agencyId, workspaceId);
    const offline = { status: 'disconnected', qrcode: '', paircode: '', phone: '', profileName: '' };
    if (!creds.configured || !token) return { ...offline, reachable: creds.configured };
    try {
      const live = await adapter.status({ creds, token, sub });
      if (live.missing) {
        // A instância sumiu do servidor: esquece o vínculo para recriar no próximo "Conectar".
        await forgetInstance(agencyId, workspaceId);
        return { ...offline, reachable: true, tokenExpired: true };
      }
      if (live.error) {
        return { status: sub.status, qrcode: '', paircode: '', phone: sub.phone, profileName: sub.profileName, reachable: false, error: live.error };
      }
      await saveLive(agencyId, workspaceId, live);
      return { ...live, reachable: true };
    } catch (err) {
      return { status: sub.status, qrcode: '', paircode: '', phone: sub.phone, profileName: sub.profileName, reachable: false, error: err.message };
    }
  }

  const guardView = sub => {
    const g = cleanGuard(sub.guard);
    return { down: g.alerted, downSince: g.downSince, reason: g.reason, recovered: g.recovered, restarts: g.restarts, webhookFixes: g.webhookFixes };
  };

  function publicSubView(row, agencyId, workspaceId, publicOrigin, live = null) {
    const creds = serverCredentials(row, agencyId);
    const sub = subFor(row, workspaceId);
    return {
      provider: PROVIDER,
      providerLabel: PROVIDER_LABEL,
      available: creds.configured,
      managed: creds.managed,
      workspace: workspaceId,
      enabled: sub.enabled,
      rebill: sub.rebill,
      status: live ? live.status : sub.status,
      phone: live ? (live.phone || sub.phone) : sub.phone,
      profileName: live ? (live.profileName || sub.profileName) : sub.profileName,
      qrcode: live?.qrcode || '',
      paircode: live?.paircode || '',
      guard: guardView(sub),
      webhookUrl: webhookUrlOf(publicOrigin, agencyId, workspaceId, sub),
      error: live?.error || ''
    };
  }

  function publicAgencyView(row, agencyId, workspaces, publicOrigin) {
    const creds = serverCredentials(row, agencyId);
    const hasCustom = Boolean(row.baseUrl && row.adminTokenSealed);
    return {
      provider: PROVIDER,
      providerLabel: PROVIDER_LABEL,
      configured: creds.configured,
      managed: creds.managed,
      hasCustomServer: hasCustom,
      baseUrl: row.baseUrl || '',
      hasAdminToken: Boolean(row.adminTokenSealed),
      adminTokenLast4: row.adminTokenLast4 || '',
      subaccounts: Object.fromEntries(workspaces.map(ws => {
        const sub = subFor(row, ws.id);
        return [ws.id, {
          enabled: sub.enabled,
          rebill: sub.rebill,
          status: sub.status,
          phone: sub.phone,
          profileName: sub.profileName,
          hasInstance: Boolean(sub.tokenSealed),
          guard: guardView(sub),
          webhookUrl: webhookUrlOf(publicOrigin, agencyId, ws.id, sub)
        }];
      }))
    };
  }

  // The sub-account's connected instance, or the reason it cannot send now.
  async function workspaceSender(agencyId, workspaceId, accountIsActive) {
    let row = await ensureRow(agencyId);
    const creds = serverCredentials(row, agencyId);
    let sub = subFor(row, workspaceId);
    const token = instanceTokenOf(row, agencyId, workspaceId);
    if (!creds.configured || !sub.enabled || !token) return { reason: 'not-connected' };
    if (sub.status !== 'connected') {
      const live = await fetchLiveSubStatus(row, agencyId, workspaceId);
      if (live.status !== 'connected') return { reason: 'not-connected' };
      row = await ensureRow(agencyId);
      sub = subFor(row, workspaceId);
    }
    if (!await accountIsActive(agencyId, workspaceId)) return { reason: 'account-suspended' };
    return { creds, token, sub };
  }

  /** Workflows: a file by public https URL. media = { type: image|video|document|audio, url, caption, fileName }. */
  async function sendWorkspaceMedia(agencyId, workspaceId, phoneRaw, media, accountIsActive) {
    const number = digits(phoneRaw);
    if (number.length < 10 || number.length > 15) return { sent: false, reason: 'invalid-phone' };
    const sender = await workspaceSender(agencyId, workspaceId, accountIsActive);
    if (sender.reason) return { sent: false, reason: sender.reason };
    const result = await adapter.sendMedia({ ...sender, number, media: {
      type: ['image', 'video', 'document', 'audio'].includes(media?.type) ? media.type : 'document', url: String(media?.url || '').slice(0, 2000),
      caption: String(media?.caption || '').slice(0, 1000), fileName: String(media?.fileName || '').slice(0, 120) } });
    if (!result.ok) throw fail(`Falha ao enviar pelo WhatsApp (HTTP ${result.status})${result.message ? `: ${result.message}` : ''}.`, 502);
    return { sent: true, id: result.id };
  }

  /** Conversas: uma mídia recebida, pelo id da mensagem no WhatsApp. O número pode estar desconectado agora. */
  async function fetchWorkspaceMedia(agencyId, workspaceId, waId) {
    const row = await ensureRow(agencyId), creds = serverCredentials(row, agencyId), sub = subFor(row, workspaceId);
    if (!creds.configured || !instanceTokenOf(row, agencyId, workspaceId)) throw fail('O WhatsApp desta subconta não está conectado.', 404);
    return adapter.media({ creds, sub, id: waId });
  }

  /** Workflows: buttons, a list or a poll. message = { kind: buttons|list|poll, body, options[], buttonText, footer }. */
  async function sendWorkspaceInteractive(agencyId, workspaceId, phoneRaw, message, accountIsActive) {
    const number = digits(phoneRaw);
    if (number.length < 10 || number.length > 15) return { sent: false, reason: 'invalid-phone' };
    const sender = await workspaceSender(agencyId, workspaceId, accountIsActive);
    if (sender.reason) return { sent: false, reason: sender.reason };
    const kind = ['buttons', 'list', 'poll'].includes(message?.kind) ? message.kind : 'buttons';
    const result = await adapter.interactive({ ...sender, number, message: { kind, body: String(message?.body || '').slice(0, 1000),
      options: (Array.isArray(message?.options) ? message.options : []).map(option => String(option).slice(0, 100)).slice(0, 12),
      buttonText: String(message?.buttonText || '').slice(0, 20), footer: String(message?.footer || '').slice(0, 60) } });
    if (!result.ok) throw fail(`Falha ao enviar a mensagem interativa pelo WhatsApp (HTTP ${result.status})${result.message ? `: ${result.message}` : ''}.`, 502);
    return { sent: true, id: result.id };
  }

  /** Workflows: "typing…" for 1 to 25 seconds before the next message. */
  async function sendWorkspacePresence(agencyId, workspaceId, phoneRaw, secondsRaw, accountIsActive) {
    const number = digits(phoneRaw);
    if (number.length < 10 || number.length > 15) return { sent: false, reason: 'invalid-phone' };
    const sender = await workspaceSender(agencyId, workspaceId, accountIsActive);
    if (sender.reason) return { sent: false, reason: sender.reason };
    const seconds = Math.min(25, Math.max(1, Math.round(Number(secondsRaw) || 3)));
    const result = await adapter.presence({ ...sender, number, seconds });
    if (!result.ok) throw fail(`Falha ao mostrar "digitando" no WhatsApp (HTTP ${result.status})${result.message ? `: ${result.message}` : ''}.`, 502);
    return { sent: true, seconds };
  }

  async function sendWorkspaceText(agencyId, workspaceId, phoneRaw, textRaw, accountIsActive) {
    const number = digits(phoneRaw);
    const text = typeof textRaw === 'string' ? textRaw.trim().slice(0, 4000) : '';
    if (number.length < 10 || number.length > 15) return { sent: false, reason: 'invalid-phone' };
    if (!text) return { sent: false, reason: 'empty-text' };
    const sender = await workspaceSender(agencyId, workspaceId, accountIsActive);
    if (sender.reason) return { sent: false, reason: sender.reason };
    const result = await sendOnce(sender, agencyId, workspaceId, number, () => adapter.send({ ...sender, number, text }));
    if (result.outcome === 'sent') return { sent: true, id: result.id };
    if (result.outcome === 'failed' && !result.wrongRecipient) throw fail(`Falha ao enviar pelo WhatsApp: ${result.error}`, 502);
    return { sent: false, reason: result.wrongRecipient ? 'wrong-recipient' : { waiting: 'not-connected', retry: 'server-down' }[result.outcome] || 'unconfirmed' };
  }

  // A Evolution já entregou no próprio número em vez do contato (issue 2496): 200 não prova o destinatário.
  // O nono dígito some em números antigos do Brasil, por isso compara os 8 últimos.
  const tail = value => digits(value).slice(-8);
  const reachedOther = (jid, number) => /@s\.whatsapp\.net$/i.test(jid) && tail(extractPhone(jid)) !== tail(number);

  /**
   * Um envio, classificado. Nunca lança. sent: saiu · waiting: número fora do ar · retry: com certeza não saiu ·
   * unconfirmed: pode ter saído, não repetir sozinho · failed: recusada.
   */
  async function sendOnce(sender, agencyId, workspaceId, number, attempt) {
    const result = (outcome, error = '', id = '', extra = {}) => ({ outcome, id, error: String(error).slice(0, 200), ...extra });
    try {
      const res = await attempt();
      if (res.ok) return reachedOther(res.jid || '', number) ? result('failed', 'A Evolution entregou a mensagem em outro número.', res.id, { wrongRecipient: true }) : result('sent', '', res.id);
      if (/connection closed/i.test(res.message)) return result('waiting', 'WhatsApp desconectado.');
      // Pode ser a conexão (chave trocada, instância apagada) ou o destino (grupo que acabou). Só a conexão fora do ar vale esperar.
      if ([401, 403, 404].includes(res.status)) {
        const live = await fetchLiveSubStatus(await ensureRow(agencyId), agencyId, workspaceId);
        if (live.reachable === false || live.status !== 'connected') return result('waiting', 'A conexão do WhatsApp recusou o envio.');
      }
      if (res.status === 503) return result('retry', 'O servidor do WhatsApp está reiniciando.');
      return result(res.status >= 500 || [408, 429].includes(res.status) ? 'unconfirmed' : 'failed', res.message || `Resposta HTTP ${res.status}.`);
    } catch (err) {
      return result([...notDelivered, 'CIRCUIT'].includes(err?.network) ? 'retry' : 'unconfirmed', err?.message || 'Falha no envio.');
    }
  }

  /** Planejador de eventos: grupos do número conectado, por nome. */
  async function listWorkspaceGroups(agencyId, workspaceId, accountIsActive) {
    const sender = await workspaceSender(agencyId, workspaceId, accountIsActive);
    if (sender.reason) return { reason: sender.reason, groups: [] };
    const groups = (await adapter.groups(sender)).filter(row => GROUP_JID.test(row.jid));
    return { reason: '', groups: groups.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) };
  }

  /**
   * Planejador de eventos: uma mensagem a um grupo ou contato, sem repetir a chamada. Nunca lança.
   * sent: saiu · waiting: número fora do ar, tentar depois · retry: com certeza não saiu ·
   * unconfirmed: pode ter saído, não repetir sozinho · failed: recusada.
   */
  async function sendEventMessage(agencyId, workspaceId, { to, part }, accountIsActive) {
    const group = String(to || '').includes('@'), number = group ? String(to) : digits(to);
    const result = (outcome, error = '', id = '') => ({ outcome, id, error: String(error).slice(0, 200) });
    if (group ? !GROUP_JID.test(number) : number.length < 10 || number.length > 15) return result('failed', 'Destino inválido.');
    try {
      const sender = await workspaceSender(agencyId, workspaceId, accountIsActive);
      if (sender.reason) return result('waiting', sender.reason === 'account-suspended' ? 'Conta suspensa.' : 'WhatsApp desconectado.');
      const { outcome, error, id } = await sendOnce(sender, agencyId, workspaceId, number, () => part.kind === 'poll'
        ? adapter.interactive({ ...sender, number, retry: false, message: { kind: 'poll', body: part.question, options: part.options } })
        : adapter.send({ ...sender, number, text: part.text, retry: false }));
      return result(outcome, error, id);
    } catch (err) {
      return result([...notDelivered, 'CIRCUIT'].includes(err?.network) ? 'retry' : 'unconfirmed', err?.message || 'Falha no envio.');
    }
  }

  // ---------- Vigia (whatsapp-guard.mjs) ----------

  /** O contato de quem escreveu ou ligou: pelo número, pelo LID, ou um novo. */
  function contactOf(state, { phone, lid, senderName }) {
    let contact = phone ? state.contacts.find(c => digits(c.phone) === phone) : null;
    if (!contact && lid) contact = state.contacts.find(c => c.waLid === lid);
    if (!contact) {
      const contactId = execute(state, {
        type: 'save',
        key: 'contacts',
        data: { name: senderName, phone: phone ? `+${phone}` : '', tags: phone ? ['WhatsApp'] : ['WhatsApp', 'Sem telefone'] }
      });
      contact = state.contacts.find(c => c.id === contactId);
    }
    if (!contact) return null;
    if (lid) contact.waLid = lid;
    // O número de um contato que entrou pelo LID apareceu depois.
    if (phone && !contact.phone) {
      contact.phone = `+${phone}`;
      contact.tags = (contact.tags || []).filter(tag => tag !== 'Sem telefone');
    }
    return contact;
  }

  /** Ligação do WhatsApp: uma linha na conversa, que acompanha o resultado. Não é resposta do cliente: não dispara fluxo. */
  async function ingestCall(workspaceId, { id, status, video, phone, lid, senderName }) {
    let stored = false;
    await store.change(workspaceId, state => {
      stored = false;
      const known = state.messages.find(m => m.waCall?.id === id);
      if (known) {
        // Repetição do aviso de início, ou um aviso atrasado depois do resultado.
        if (known.waCall.status !== 'offer' || status === 'offer') return;
        known.waCall = { id, status };
        known.body = known.body.replace(/[^·]*$/, ` ${callResults[status]}`);
        stored = true;
        return;
      }
      if (status !== 'offer') return;
      const contact = contactOf(state, { phone, lid, senderName });
      if (!contact) return;
      state.messages.push({ id: randomUUID(), created: new Date().toISOString(), contactId: contact.id, body: `Ligação de ${video ? 'vídeo' : 'voz'} do WhatsApp · ${callResults[status]}`, subject: '',
        channel: 'Call', direction: 'Inbound', read: false, starred: false, origin: 'phone', waCall: { id, status } });
      stored = true;
    });
    return stored;
  }

  /** Guarda mensagens recebidas, do webhook ou da busca. Devolve quantas são novas. */
  async function ingestItems(workspaceId, items, { recovered = false } = {}) {
    let stored = 0, withMedia = [], owner = '';
    await store.change(workspaceId, state => {
      stored = 0; withMedia = []; owner = state.agencyId || '';
      for (const { id, phone, lid, text, senderName, ad, at, media } of items) {
        // A Evolution repete o webhook quando não recebe a resposta a tempo: a mesma mensagem entra uma vez só.
        if (id && state.messages.some(m => m.waId === id)) continue;
        // Sem identificador não há como saber se já entrou: a busca não arrisca repetir.
        if (recovered && !id) continue;
        const contact = contactOf(state, { phone, lid, senderName });
        if (!contact) continue;
        const messageId = execute(state, {
          type: 'message',
          data: { contactId: contact.id, channel: 'WhatsApp', direction: 'Inbound', body: text }
        });
        const message = state.messages.find(m => m.id === messageId);
        if (message && id) message.waId = id;
        if (message && id && media) { message.media = media; withMedia.push({ ...message }); }
        // Recuperada: fica na hora em que o contato escreveu, não na hora em que foi achada.
        if (message && recovered && at > 0) { message.created = new Date(at).toISOString(); message.recovered = true; }
        stored++;
        // A message that came from a "Click to WhatsApp" ad: its own trigger and the ad in the contact's attribution.
        if (ad) execute(state, { type: 'whatsapp-ad-click', data: { contactId: contact.id, ...ad, body: text } });
      }
    });
    if (withMedia.length) onMedia?.(owner, workspaceId, withMedia);
    return stored;
  }

  const guardOps = {
    /** Subcontas com instância e WhatsApp ligado, sem criar registro para quem nunca usou. */
    async guardTargets(agencyId, workspaceIds, active) {
      let row;
      try { row = normalizeRow(await store.load(rowId(agencyId))); }
      catch (error) { if (error?.status === 404) return []; throw error; }
      const creds = serverCredentials(row, agencyId);
      if (!creds.configured) return [];
      const targets = [];
      for (const workspaceId of workspaceIds) {
        if (!row.subaccounts[workspaceId]) continue;
        const sub = subFor(row, workspaceId), token = instanceTokenOf(row, agencyId, workspaceId);
        if (!sub.enabled || !token) continue;
        if (active && !await active(agencyId, workspaceId)) continue;
        targets.push({ agencyId, workspaceId, creds, sub, token });
      }
      return targets;
    },
    liveAll: creds => adapter.listAll({ creds }),
    findMessages: (ctx, range) => adapter.findMessages(ctx, range),
    ingestEntries: (workspaceId, entries, options) => {
      const items = entries.map(evolutionInbound).filter(Boolean);
      return items.length ? ingestItems(workspaceId, items, options) : 0;
    },
    /** Webhook apagado, desligado ou com outro segredo: registra de novo. Mantém o domínio https que já estava lá. */
    async repairWebhook(ctx, publicOrigin) {
      const now = await adapter.webhook(ctx);
      let origin = publicOrigin;
      try { const url = new URL(now?.url || ''); if (url.protocol === 'https:') origin = url.origin; } catch { /* sem webhook válido */ }
      const webhookUrl = webhookUrlOf(origin, ctx.agencyId, ctx.workspaceId, ctx.sub);
      if (!isHttps(webhookUrl)) return false;
      const events = Array.isArray(now?.events) ? now.events : [];
      if (now && now.enabled !== false && now.url === webhookUrl && EVOLUTION_EVENTS.every(event => events.includes(event))) return false;
      await adapter.setWebhook({ ...ctx, webhookUrl });
      return true;
    },
    probe: ctx => adapter.probe(ctx),
    restart: ctx => adapter.restart(ctx),
    deliver(ctx, phoneRaw, text) {
      const number = digits(phoneRaw);
      if (number.length < 10 || number.length > 15) return { outcome: 'failed', error: 'Telefone inválido.' };
      return sendOnce(ctx, ctx.agencyId, ctx.workspaceId, number, () => adapter.send({ ...ctx, number, text: String(text || '').slice(0, 4000), retry: false }));
    },
    saveGuards: (agencyId, updates) => changeRow(agencyId, row => {
      for (const [workspaceId, guard] of Object.entries(updates)) {
        const sub = row.subaccounts[workspaceId];
        // Desligado de propósito no meio da rodada: a vigia não ressuscita o histórico.
        if (sub?.tokenSealed) sub.guard = cleanGuard(guard);
      }
      return row;
    })
  };

  async function handleWebhook({ req, url, payload, listWorkspaces, webhookBlockReason, json, onStored = null }) {
    const rawPath = resolvePath(url);
    const match = rawPath.match(/^\/api\/whatsapp\/webhook\/([^/]+)\/([^/]+)\/([a-f0-9]{32,128})$/);
    if (!match) throw fail('Webhook inválido.', 404);
    const agencyId = decodeURIComponent(match[1]);
    const workspaceId = decodeURIComponent(match[2]);
    const secretToken = match[3];

    let row;
    try { row = normalizeRow(await store.load(rowId(agencyId))); }
    catch (e) { if (e.status === 404) throw fail('Assinatura do webhook inválida.', 403); throw e; }
    const saved = row.subaccounts[workspaceId];
    if (!saved || !safeEqual(saved.webhookSecret, secretToken)) {
      throw fail('Assinatura do webhook inválida.', 403);
    }

    const workspaces = await listWorkspaces(agencyId);
    if (!workspaces.some(w => w.id === workspaceId)) {
      throw fail('Subconta não encontrada.', 404);
    }

    const body = await payload(req);
    const ignored = await webhookBlockReason(agencyId, workspaceId, PROVIDER);
    if (ignored) {
      return json({ ok: true, ignored: true, reason: ignored });
    }
    const event = adapter.parseWebhook(body);

    if (event.kind === 'connection') {
      await saveLive(agencyId, workspaceId, event.parsed);
      return json({ ok: true, event: 'connection', status: event.parsed.status });
    }

    if (event.kind === 'call') {
      const stored = await ingestCall(workspaceId, event.call);
      return json({ ok: true, event: 'call', ...(stored ? { stored: true } : { ignored: true }) });
    }

    if (event.kind !== 'messages' || !event.items.length) {
      return json({ ok: true, ignored: true });
    }

    const stored = await ingestItems(workspaceId, event.items);
    if (!stored) return json({ ok: true, ignored: true, reason: 'DUPLICATE' });
    // Workflows the message started (Cliente respondeu, anúncio…) deliver now, not on the next tick.
    onStored?.(workspaceId);
    return json({ ok: true, stored: true, workspace: workspaceId });
  }

  async function handleAgencyApi({ req, url, method, who, payload, publicOrigin, listWorkspaces, requireActiveAccount, json }) {
    const rawPath = resolvePath(url);
    const op = rawPath.slice('/api/whatsapp/agency/'.length).replace(/\/+$/, '');
    const agencyId = who.agencyId;
    const workspaces = await listWorkspaces(agencyId);

    if (op === 'status' && method === 'GET') {
      const row = await ensureRow(agencyId);
      return json(publicAgencyView(row, agencyId, workspaces, publicOrigin));
    }

    if (op === 'config' && method === 'POST') {
      const body = await payload(req);
      const baseUrl = cleanBaseUrl(body.baseUrl);
      const rawToken = typeof body.adminToken === 'string' ? body.adminToken.trim() : '';
      const existing = await ensureRow(agencyId);
      if (!rawToken && !existing.adminTokenSealed) throw fail('Informe a API Key global (AUTHENTICATION_API_KEY) da sua Evolution API.');
      const saved = await changeRow(agencyId, row => {
        row.baseUrl = baseUrl;
        if (rawToken) {
          row.adminTokenSealed = sealSecret(secret, `${rowId(agencyId)}:admin`, rawToken);
          row.adminTokenLast4 = rawToken.slice(-4);
        }
        return row;
      });
      return json(publicAgencyView(saved, agencyId, workspaces, publicOrigin));
    }

    // Teste do servidor (depois de instalar a VPS ou de trocar a chave): nunca lança, devolve o motivo.
    if (op === 'server' && method === 'GET') {
      const row = await ensureRow(agencyId);
      const creds = serverCredentials(row, agencyId);
      if (!creds.configured) return json({ ok: false, error: 'Nenhum servidor de WhatsApp configurado.' });
      const names = new Set(workspaces.map(ws => subFor(row, ws.id).instanceName));
      try {
        return json(await adapter.server({ creds, names }));
      } catch (err) {
        if (!err?.status) throw err;
        return json({ ok: false, error: err.message });
      }
    }

    if (op === 'remove-instance' && method === 'POST') {
      const body = await payload(req);
      const workspace = String(body.workspace || '');
      if (!workspaces.some(w => w.id === workspace)) throw fail('Subconta inválida.', 400);
      const row = await ensureRow(agencyId);
      const creds = serverCredentials(row, agencyId);
      if (!creds.configured) throw fail('O WhatsApp ainda não foi configurado pela agência.', 400);
      await adapter.remove({ creds, sub: subFor(row, workspace) });
      await forgetInstance(agencyId, workspace);
      return json(publicAgencyView(await ensureRow(agencyId), agencyId, workspaces, publicOrigin));
    }

    if (op === 'disconnect-server' && method === 'POST') {
      const saved = await changeRow(agencyId, row => {
        row.baseUrl = '';
        row.adminTokenSealed = '';
        row.adminTokenLast4 = '';
        return row;
      });
      return json(publicAgencyView(saved, agencyId, workspaces, publicOrigin));
    }

    if (op === 'subaccount' && method === 'POST') {
      const body = await payload(req);
      const workspace = String(body.workspace || '');
      if (!workspaces.some(w => w.id === workspace)) throw fail('Subconta inválida.', 400);
      await requireActiveAccount(agencyId, workspace, true, 'conversations');
      const saved = await changeRow(agencyId, row => {
        const prev = normalizeSub(workspace, row.subaccounts[workspace]);
        const enabled = body.enabled !== undefined ? Boolean(body.enabled) : prev.enabled;
        const rebill = enabled ? (body.rebill !== undefined ? Boolean(body.rebill) : prev.rebill) : false;
        row.subaccounts[workspace] = { ...prev, enabled, rebill };
        return row;
      });
      return json(publicAgencyView(saved, agencyId, workspaces, publicOrigin));
    }

    throw fail('Rota do WhatsApp não encontrada.', 404);
  }

  async function handleWorkspaceApi({ req, url, method, agencyId, workspaceId, payload, publicOrigin, requireActiveAccount, json }) {
    const rawPath = resolvePath(url);
    const op = rawPath.slice('/api/whatsapp/workspace/'.length).replace(/\/+$/, '');

    if (op === 'status' && method === 'GET') {
      const row = await ensureRow(agencyId);
      const live = await fetchLiveSubStatus(row, agencyId, workspaceId);
      const refreshed = await ensureRow(agencyId);
      return json(publicSubView(refreshed, agencyId, workspaceId, publicOrigin, live));
    }

    if (op === 'groups' && method === 'GET') {
      return json(await listWorkspaceGroups(agencyId, workspaceId, async () => { await requireActiveAccount(agencyId, workspaceId, true, 'marketing'); return true; }));
    }

    if (op === 'connect' && method === 'POST') {
      const body = await payload(req).catch(() => ({}));
      const phone = digits(body.phone || '');
      if (body.phone && (phone.length < 10 || phone.length > 15)) {
        throw fail('Informe o número com DDI e DDD (ex.: 5511999999999).');
      }
      await requireActiveAccount(agencyId, workspaceId, true, 'conversations');
      let ctx = await ensureInstance(agencyId, workspaceId, publicOrigin);
      await requireActiveAccount(agencyId, workspaceId, true, 'conversations');
      let parsed = await adapter.connectPatient({ ...ctx, phone, pause: qrPause });
      const empty = p => !p.missing && p.status !== 'connected' && !p.qrcode && !p.paircode;
      if (empty(parsed) && !ctx.sub.phone && !cleanGuard(ctx.sub.guard).openSince) {
        // Instância que nunca pareou e não gera QR: apaga e cria outra. A que já pareou nunca é apagada sozinha.
        await adapter.remove(ctx).catch(() => {});
        await forgetInstance(agencyId, workspaceId);
        ctx = await ensureInstance(agencyId, workspaceId, publicOrigin);
        parsed = await adapter.connectPatient({ ...ctx, phone, pause: qrPause });
      }
      if (parsed.missing) {
        // A instância foi apagada no servidor: recria uma vez e tenta de novo.
        await forgetInstance(agencyId, workspaceId);
        ctx = await ensureInstance(agencyId, workspaceId, publicOrigin);
        parsed = await adapter.connectPatient({ ...ctx, phone, pause: qrPause });
        if (parsed.missing) throw fail('A instância do WhatsApp não foi encontrada no servidor.', 502);
      }
      const nextStatus = parsed.status === 'connected' ? 'connected' : 'connecting';
      const saved = await saveLive(agencyId, workspaceId, { ...parsed, status: nextStatus });
      return json(publicSubView(saved, agencyId, workspaceId, publicOrigin, { ...parsed, status: nextStatus }));
    }

    if (op === 'disconnect' && method === 'POST') {
      const row = await ensureRow(agencyId);
      const creds = serverCredentials(row, agencyId);
      const token = instanceTokenOf(row, agencyId, workspaceId);
      if (creds.configured && token) {
        const sub = subFor(row, workspaceId);
        await adapter.disconnect({ creds, token, sub }).catch(() => {});
      }
      await saveLive(agencyId, workspaceId, { status: 'disconnected' });
      // Desconectou porque quis: a vigia para de cuidar até conectar de novo.
      const saved = await changeRow(agencyId, current => { current.subaccounts[workspaceId].guard = cleanGuard(null); return current; });
      try { await store.change(workspaceId, state => { delete state.whatsappHealth; }); } catch { /* o aviso some na próxima conexão */ }
      return json(publicSubView(saved, agencyId, workspaceId, publicOrigin, { status: 'disconnected', qrcode: '', paircode: '', phone: '', profileName: '' }));
    }

    if (op === 'test' && method === 'POST') {
      const body = await payload(req);
      const number = digits(body.phone);
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 2000) : '';
      if (number.length < 10 || number.length > 15) throw fail('Informe o número de destino com DDI e DDD (ex.: 5511999999999).');
      if (!text) throw fail('Escreva uma mensagem para testar o envio.');
      const row = await ensureRow(agencyId);
      const creds = serverCredentials(row, agencyId);
      const token = instanceTokenOf(row, agencyId, workspaceId);
      if (!creds.configured || !token) throw fail('Conecte o WhatsApp desta subconta antes de enviar mensagens.', 409);
      await requireActiveAccount(agencyId, workspaceId, true, 'conversations');
      const sub = subFor(row, workspaceId);
      const result = await adapter.send({ creds, token, sub, number, text });
      if (!result.ok) {
        throw fail(`Falha ao enviar pela ${PROVIDER_LABEL} (HTTP ${result.status})${result.message ? `: ${result.message}` : ''}.`, 502);
      }
      return json({ ok: true, id: result.id, number });
    }

    throw fail('Rota do WhatsApp não encontrada.', 404);
  }

  // Subconta apagada de vez: desconecta o aparelho, apaga a instância na Evolution e tira a subconta da linha da agência.
  // Sem servidor configurado não há instância para apagar. Erro da Evolution sobe (quem chama tenta de novo).
  async function removeWorkspace(agencyId, workspaceId) {
    // Só lê: uma agência sem WhatsApp não ganha uma linha nova por causa da exclusão.
    const raw = await Promise.resolve().then(() => store.load(rowId(agencyId))).catch(e => { if (e?.status === 404) return null; throw e; });
    if (!raw?.subaccounts?.[workspaceId]) return false;
    const row = normalizeRow(raw);
    const creds = serverCredentials(row, agencyId);
    if (creds.configured) await adapter.remove({ creds, sub: subFor(row, workspaceId) });
    await changeRow(agencyId, current => { delete current.subaccounts[workspaceId]; return current; });
    return true;
  }

  // A linha de confirmação do celular (routes/verify.mjs): uma instância do graao no servidor global, sem row de agência.
  function verifyLine(instanceName) {
    if (!hasManaged || !instanceName) return null;
    const sub = { instanceName };
    return {
      provision: webhookUrl => adapter.provision({ creds: managed, sub, webhookUrl }).then(async created => {
        await adapter.setWebhook({ creds: managed, sub, webhookUrl });
        return created;
      }),
      status: () => adapter.status({ creds: managed, sub }),
      connect: () => adapter.connectPatient({ creds: managed, sub, phone: '', pause: qrPause }),
      sendText: (number, text) => adapter.send({ creds: managed, sub, number, text, retry: false })
    };
  }

  return { handleAgencyApi, handleWorkspaceApi, handleWebhook, fetchWorkspaceMedia, removeWorkspace, sendWorkspaceText, sendWorkspaceMedia, sendWorkspacePresence, sendWorkspaceInteractive, listWorkspaceGroups, sendEventMessage, guardOps, verifyLine };
}
