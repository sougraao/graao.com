// Web Push (RFC 8030/8291/8292) without dependencies: VAPID (ES256) and the aes128gcm payload encryption. The app
// mobile white-label (6.6) and the client portal subscribe; the workflows and Conversas send.
import { createECDH, createCipheriv, createPrivateKey, hkdfSync, randomBytes, sign } from 'node:crypto';

const b64u = buffer => Buffer.from(buffer).toString('base64url');
const fromB64u = value => Buffer.from(String(value || ''), 'base64url');

/** A new VAPID key pair (base64url): publicKey goes to the browser, privateKey stays on the server. */
export function vapidKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}
export const pushConfigured = (env = process.env) => Boolean(env.WEB_PUSH_PUBLIC_KEY && env.WEB_PUSH_PRIVATE_KEY);

/** The VAPID Authorization header for an endpoint (the JWT audience is the push service origin). */
export function vapidHeader(endpoint, { publicKey, privateKey, subject = 'mailto:suporte@graao.com', now = Date.now() }) {
  const pub = fromB64u(publicKey);
  const key = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: b64u(fromB64u(privateKey)), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject }));
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${publicKey}`;
}

/** RFC 8291: the payload encrypted for the subscription's p256dh and auth keys (one aes128gcm record). */
export function encryptPayload(payload, { p256dh, auth }, { salt = randomBytes(16), server = null } = {}) {
  const receiver = fromB64u(p256dh), secret = fromB64u(auth);
  if (receiver.length !== 65 || secret.length < 16) throw Object.assign(new Error('Inscrição de push inválida.'), { status: 400 });
  const ecdh = server || createECDH('prime256v1');
  if (!server) ecdh.generateKeys();
  const local = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(receiver);
  const ikm = Buffer.from(hkdfSync('sha256', shared, secret, Buffer.concat([Buffer.from('WebPush: info\0'), receiver, local]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21); salt.copy(header, 0); header.writeUInt32BE(4096, 16); header[20] = local.length;
  return Buffer.concat([header, local, body]);
}

/**
 * Sends one notification. Answers { ok, gone } — gone is true when the push service says the subscription no longer
 * exists (404/410), so the caller deletes it.
 */
export async function sendPush(subscription, message, { env = process.env, request = fetch } = {}) {
  if (!pushConfigured(env)) return { ok: false, gone: false, error: 'push não configurado (WEB_PUSH_PUBLIC_KEY e WEB_PUSH_PRIVATE_KEY)' };
  if (!/^https:\/\//.test(String(subscription?.endpoint || ''))) return { ok: false, gone: true, error: 'endereço inválido' };
  const body = encryptPayload(JSON.stringify(message).slice(0, 3000), subscription);
  const response = await request(subscription.endpoint, { method: 'POST', signal: AbortSignal.timeout(10000), redirect: 'error', body,
    headers: { Authorization: vapidHeader(subscription.endpoint, { publicKey: env.WEB_PUSH_PUBLIC_KEY, privateKey: env.WEB_PUSH_PRIVATE_KEY, subject: env.WEB_PUSH_SUBJECT || undefined }),
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal' } }).catch(() => null);
  if (!response) return { ok: false, gone: false, error: 'o serviço de push não respondeu' };
  return { ok: response.ok, gone: response.status === 404 || response.status === 410, error: response.ok ? '' : `HTTP ${response.status}` };
}

/** The subscription a browser sends (PushSubscription.toJSON()), validated. */
export function pushSubscription(value) {
  const endpoint = String(value?.endpoint || ''), p256dh = String(value?.keys?.p256dh || ''), auth = String(value?.keys?.auth || '');
  if (!/^https:\/\/[^\s]{10,1000}$/.test(endpoint) || fromB64u(p256dh).length !== 65 || fromB64u(auth).length < 16) return null;
  return { endpoint, p256dh, auth };
}
