// Mensagens do Facebook (Messenger) e do Instagram (Direct) pela plataforma de mensagens da Meta.
//
// Entrada: a Meta chama POST /api/meta/webhook com as mensagens das páginas e contas profissionais
// conectadas no Social Planner (assinatura X-Hub-Signature-256 com META_APP_SECRET); GET responde a
// verificação com META_WEBHOOK_VERIFY_TOKEN. Saída: POST /{page-id}/messages com o token da página,
// tanto para o Messenger quanto para o Direct (o destinatário é o id que a Meta mandou na entrada).
// A Meta só aceita resposta comum até 24 horas depois da última mensagem do contato.
import { createHmac, timingSafeEqual } from 'node:crypto';

const graphVersion = () => process.env.META_GRAPH_VERSION || 'v23.0';
const str = (value, limit = 2000) => typeof value === 'string' ? value.slice(0, limit) : '';

/** The webhook body really came from Meta: HMAC-SHA256 of the raw body with the app secret. */
export function metaSignatureValid(raw, header, secret) {
  if (!secret || typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The incoming messages of a webhook body, one per message: Messenger (object "page") and Instagram (object
 * "instagram"). Echoes of what the business sent, reads and reactions are skipped.
 */
export function metaInbound(body) {
  const network = body?.object === 'page' ? 'facebook' : body?.object === 'instagram' ? 'instagram' : '';
  if (!network || !Array.isArray(body.entry)) return [];
  const out = [];
  for (const entry of body.entry.slice(0, 50)) {
    for (const event of Array.isArray(entry?.messaging) ? entry.messaging.slice(0, 50) : []) {
      const message = event?.message;
      if (!message || message.is_echo || message.is_deleted) continue;
      const senderId = str(event.sender?.id, 64), accountId = str(event.recipient?.id || entry.id, 64);
      const attachments = (Array.isArray(message.attachments) ? message.attachments : []).map(item => item?.payload?.url ? `[${item.type || 'anexo'}] ${str(item.payload.url, 1000)}` : '').filter(Boolean);
      const text = [str(message.text, 4000), ...attachments].filter(Boolean).join('\n');
      if (!/^\d{3,64}$/.test(senderId) || !/^\d{3,64}$/.test(accountId) || !text) continue;
      out.push({ network, accountId, senderId, mid: str(message.mid, 200), body: text, quickReply: str(message.quick_reply?.payload, 200) });
    }
  }
  return out;
}

/** Public comments received through Page feed or Instagram comment webhooks. */
export function metaComments(body) {
  const network = body?.object === 'page' ? 'facebook' : body?.object === 'instagram' ? 'instagram' : '';
  if (!network || !Array.isArray(body.entry)) return [];
  const out = [];
  const commentId = value => str(String(value?.comment_id ?? value?.id ?? ''), 140);
  const validCommentId = value => /^\d{3,64}(?:_\d{3,64})?$/.test(value);
  for (const entry of body.entry.slice(0, 50)) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes.slice(0, 50) : []) {
      const value = change?.value || {};
      const isFacebookComment = network === 'facebook' && change?.field === 'feed' && value.item === 'comment' && ['add', 'edited'].includes(value.verb);
      const isInstagramComment = network === 'instagram' && ['comments', 'live_comments'].includes(change?.field);
      if (!isFacebookComment && !isInstagramComment) continue;
      const accountId = str(String(entry?.id ?? ''), 64), id = commentId(value);
      const senderId = str(String(value.from?.id ?? value.sender_id ?? value.from_id ?? ''), 64);
      const body = str(value.message ?? value.text, 4000);
      if (!/^\d{3,64}$/.test(accountId) || !validCommentId(id) || !body || senderId === accountId) continue;
      const handle = str(value.from?.username ?? value.username, 120).replace(/^@/, '');
      const authorName = str(value.from?.name ?? value.from?.username ?? value.username, 120);
      out.push({ network, accountId, commentId: id, senderId, body, authorName, handle,
        mediaId: str(String(value.media?.id ?? value.media_id ?? value.post_id ?? value.parent_id ?? ''), 140),
        parentId: str(String(value.parent_id ?? ''), 140) });
    }
  }
  return out;
}

/** The Lead Ads submissions of a webhook body (object "page", field "leadgen"). */
export function metaLeads(body) {
  if (body?.object !== 'page' || !Array.isArray(body.entry)) return [];
  const out = [];
  for (const entry of body.entry.slice(0, 50)) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes.slice(0, 50) : []) {
      if (change?.field !== 'leadgen') continue;
      const value = change.value || {};
      const leadgenId = str(String(value.leadgen_id ?? ''), 64), pageId = str(String(value.page_id ?? entry.id ?? ''), 64);
      if (!/^\d{3,64}$/.test(leadgenId) || !/^\d{3,64}$/.test(pageId)) continue;
      out.push({ pageId, leadgenId, formId: str(String(value.form_id ?? ''), 64), adId: str(String(value.ad_id ?? ''), 64) });
    }
  }
  return out;
}

/** A lead's answers, form and campaign, read with the page token (needs leads_retrieval). */
export async function fetchMetaLead({ token, leadgenId, formId }, request = fetch) {
  const get = async path => {
    const response = await request(`https://graph.facebook.com/${graphVersion()}/${path}${path.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(10000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(str(data.error?.message, 200) || 'A Meta não devolveu o lead.'), { status: 502 });
    return data;
  };
  const lead = await get(`${encodeURIComponent(leadgenId)}?fields=field_data,form_id,campaign_name,campaign_id,ad_name,is_organic,created_time`);
  const form = await get(`${encodeURIComponent(lead.form_id || formId)}?fields=name`).catch(() => ({}));
  return { lead, formName: str(form.name, 160) };
}

/** Quick-reply buttons from the step's text: one per line, up to 13, 20 characters each (Meta's limits). */
export function quickReplies(text) {
  const titles = [...new Set(String(text || '').split('\n').map(line => line.trim().slice(0, 20)).filter(Boolean))].slice(0, 13);
  return titles.map(title => ({ content_type: 'text', title, payload: title }));
}

/** Why Meta refused a message, in the reasons "Falha no envio de mensagem" knows. */
export function metaFailure(error) {
  const code = Number(error?.code), sub = Number(error?.error_subcode);
  if (code === 190 || code === 200 && sub === 2018065) return 'not_connected';
  if (code === 10 && sub === 2018278 || sub === 2534022) return 'window_closed';
  if (code === 551 || sub === 1545041 || code === 100 && sub === 2018001) return 'no_recipient';
  return 'provider_error';
}

/** Sends one text (with optional quick replies) to a Messenger or Instagram user through the page. */
export async function sendMetaMessage({ token, pageId, recipientId, text, buttons = [] }, request = fetch) {
  if (!token || !pageId) return { sent: false, reason: 'not_connected' };
  if (!recipientId) return { sent: false, reason: 'no_recipient' };
  const message = { text: str(text, 2000) };
  if (buttons.length) message.quick_replies = buttons;
  let response;
  try {
    response = await request(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(pageId)}/messages?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: recipientId }, messaging_type: 'RESPONSE', message }), signal: AbortSignal.timeout(15000)
    });
  } catch { return { sent: false, reason: 'provider_error' }; }
  const data = await response.json().catch(() => ({}));
  if (response.ok && data.message_id) return { sent: true, id: str(data.message_id, 200) };
  return { sent: false, reason: metaFailure(data.error), detail: str(data.error?.message, 300) };
}

/** Replies to a public Facebook or Instagram comment from the connected business. */
export async function sendMetaCommentReply({ token, commentId, network, text }, request = fetch) {
  if (!token || !commentId) return { sent: false, reason: 'not_connected' };
  const message = str(text, 1000).trim();
  if (!message) return { sent: false, reason: 'provider_error' };
  const edge = network === 'instagram' ? 'replies' : 'comments';
  let response;
  try {
    response = await request(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(commentId)}/${edge}?access_token=${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }), signal: AbortSignal.timeout(15000)
    });
  } catch { return { sent: false, reason: 'provider_error' }; }
  const data = await response.json().catch(() => ({}));
  if (response.ok) return { sent: true, id: str(String(data.id ?? data.comment_id ?? ''), 200) };
  return { sent: false, reason: metaFailure(data.error), detail: str(data.error?.message, 300) };
}

/** The sender's name, for a new contact (best effort; the profile may be private). */
export async function metaSenderName({ token, senderId, network }, request = fetch) {
  if (!token || !senderId) return '';
  const fields = network === 'instagram' ? 'name,username' : 'first_name,last_name';
  try {
    const response = await request(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(senderId)}?fields=${fields}&access_token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(8000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return '';
    return str(network === 'instagram' ? data.name || (data.username ? `@${data.username}` : '') : [data.first_name, data.last_name].filter(Boolean).join(' '), 120);
  } catch { return ''; }
}

/** Lets the page send this app Messenger, comment, Direct and Lead Ads webhooks; asked when the account is connected. */
export async function subscribeMetaPage({ token, pageId }, request = fetch) {
  if (!token || !pageId) return false;
  try {
    const response = await request(`https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(pageId)}/subscribed_apps?subscribed_fields=messages,leadgen,feed&access_token=${encodeURIComponent(token)}`, { method: 'POST', signal: AbortSignal.timeout(10000) });
    return response.ok;
  } catch { return false; }
}
