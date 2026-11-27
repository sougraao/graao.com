// Social Planner network adapters: OAuth sign-in, token refresh and publishing for each network.
// App keys come from environment variables (see networks[].env in ui/social-data.js). Account tokens are
// sealed with AES-256-GCM before they are stored and never reach the browser.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mediaKind, network, textFor } from './ui/social-data.js';

const graphVersion = () => process.env.META_GRAPH_VERSION || 'v23.0';
const linkedinVersion = () => process.env.LINKEDIN_API_VERSION || '202510';
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const env = name => process.env[name] || '';

// ---- Token sealing -----------------------------------------------------------------------------
// The fixed keys below only exist for local development. On the host (Vercel/Lambda) a missing
// SOCIAL_TOKEN_KEY/GO_STORAGE_KEY is a configuration error: refuse instead of sealing with a public key.
const hosted = () => Boolean(env('VERCEL') || env('AWS_LAMBDA_FUNCTION_NAME'));
const keySecret = () => {
  const secret = env('SOCIAL_TOKEN_KEY') || env('GO_STORAGE_KEY');
  if (!secret && hosted()) fail('Configure SOCIAL_TOKEN_KEY ou GO_STORAGE_KEY no servidor para guardar os acessos às redes.', 500);
  return secret;
};
const key = (legacy = false) => createHash('sha256').update(keySecret() || (legacy ? 'graao-local-social-key' : 'graao-local-social-key')).digest();
export function seal(value) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}
export function unseal(text) {
  const [v, iv, tag, data] = String(text || '').split('.');
  if (v !== 'v1') return null;
  for (const k of [key(false), key(true)]) {
    try {
      const d = createDecipheriv('aes-256-gcm', k, Buffer.from(iv, 'base64url')); d.setAuthTag(Buffer.from(tag, 'base64url'));
      return JSON.parse(Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8'));
    } catch {}
  }
  return null;
}

// ---- HTTP --------------------------------------------------------------------------------------
let fetcher = (...args) => fetch(...args);
export const useFetch = f => { fetcher = f; };
const form = data => new URLSearchParams(Object.entries(data).filter(([, v]) => v !== undefined && v !== ''));
async function call(url, { method = 'GET', token, headers = {}, json, body, raw = false, auth = 'Bearer' } = {}) {
  const res = await fetcher(url, { method, headers: { ...(token ? { Authorization: `${auth} ${token}` } : {}), ...(json ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: json ? JSON.stringify(json) : body, signal: AbortSignal.timeout(60_000) });
  if (raw) { if (!res.ok) fail(`A rede recusou o envio (${res.status}).`, 502); return res; }
  const text = await res.text(); let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { message: text.slice(0, 300) }; }
  if (!res.ok || data.error?.message || (data.error && typeof data.error === 'string' && data.error !== 'ok')) {
    const msg = data.error?.error_user_msg || data.error?.message || data.error_description || data.message || data.error?.code || (typeof data.error === 'string' ? data.error : '') || `HTTP ${res.status}`;
    fail(String(msg).slice(0, 400), 502);
  }
  if (data.error?.code && data.error.code !== 'ok') fail(String(data.error.message || data.error.code).slice(0, 400), 502);
  return Object.assign(data, { _headers: res.headers });
}
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---- OAuth configuration -------------------------------------------------------------------------
const meta = { id: () => env('META_APP_ID'), secret: () => env('META_APP_SECRET') };
const oauth = {
  facebook: {
    keys: meta,
    url: ({ redirectUri, state }) => `https://www.facebook.com/${graphVersion()}/dialog/oauth?` + form({ client_id: meta.id(), redirect_uri: redirectUri, state, response_type: 'code',
      ...(env('META_LOGIN_CONFIG_ID') ? { config_id: env('META_LOGIN_CONFIG_ID') } : { scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,business_management,instagram_basic,instagram_content_publish,instagram_manage_comments,pages_manage_engagement,pages_messaging,pages_manage_metadata,instagram_manage_messages,leads_retrieval,pages_manage_ads' }) }),
    async exchange({ code, redirectUri }) {
      const g = `https://graph.facebook.com/${graphVersion()}`;
      const short = await call(`${g}/oauth/access_token?` + form({ client_id: meta.id(), client_secret: meta.secret(), redirect_uri: redirectUri, code }));
      const long = await call(`${g}/oauth/access_token?` + form({ grant_type: 'fb_exchange_token', client_id: meta.id(), client_secret: meta.secret(), fb_exchange_token: short.access_token }));
      const pages = await call(`${g}/me/accounts?` + form({ fields: 'id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url}', limit: '100' }), { token: long.access_token });
      const out = [];
      for (const p of pages.data || []) {
        out.push({ provider: 'facebook', externalId: p.id, name: p.name, avatar: p.picture?.data?.url, kind: 'Página', secret: { token: p.access_token } });
        const ig = p.instagram_business_account;
        if (ig) out.push({ provider: 'instagram', externalId: ig.id, name: ig.name || ig.username, handle: ig.username ? `@${ig.username}` : '', avatar: ig.profile_picture_url, kind: 'Conta profissional', secret: { token: p.access_token, pageId: p.id } });
      }
      return out;
    }
  },
  threads: {
    keys: { id: () => env('THREADS_APP_ID'), secret: () => env('THREADS_APP_SECRET') },
    url: ({ redirectUri, state }) => 'https://threads.net/oauth/authorize?' + form({ client_id: env('THREADS_APP_ID'), redirect_uri: redirectUri, scope: 'threads_basic,threads_content_publish', response_type: 'code', state }),
    async exchange({ code, redirectUri }) {
      const short = await call('https://graph.threads.net/oauth/access_token', { method: 'POST', body: form({ client_id: env('THREADS_APP_ID'), client_secret: env('THREADS_APP_SECRET'), grant_type: 'authorization_code', redirect_uri: redirectUri, code }) });
      const long = await call('https://graph.threads.net/access_token?' + form({ grant_type: 'th_exchange_token', client_secret: env('THREADS_APP_SECRET'), access_token: short.access_token }));
      const me = await call('https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url', { token: long.access_token });
      return [{ provider: 'threads', externalId: me.id, name: me.name || me.username, handle: `@${me.username}`, avatar: me.threads_profile_picture_url, secret: { token: long.access_token, expiresAt: Date.now() + (long.expires_in || 5_184_000) * 1000 } }];
    },
    async refresh(secret) {
      const r = await call('https://graph.threads.net/refresh_access_token?' + form({ grant_type: 'th_refresh_token', access_token: secret.token }));
      return { ...secret, token: r.access_token, expiresAt: Date.now() + (r.expires_in || 5_184_000) * 1000 };
    }
  },
  linkedin: {
    keys: { id: () => env('LINKEDIN_CLIENT_ID'), secret: () => env('LINKEDIN_CLIENT_SECRET') },
    url: ({ redirectUri, state }) => 'https://www.linkedin.com/oauth/v2/authorization?' + form({ response_type: 'code', client_id: env('LINKEDIN_CLIENT_ID'), redirect_uri: redirectUri, state, scope: 'openid profile w_member_social' }),
    async exchange({ code, redirectUri }) {
      const t = await call('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', body: form({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: env('LINKEDIN_CLIENT_ID'), client_secret: env('LINKEDIN_CLIENT_SECRET') }) });
      const me = await call('https://api.linkedin.com/v2/userinfo', { token: t.access_token });
      return [{ provider: 'linkedin', externalId: me.sub, name: me.name, avatar: me.picture, kind: 'Perfil', secret: { token: t.access_token, refresh: t.refresh_token || '', expiresAt: Date.now() + (t.expires_in || 5_184_000) * 1000 } }];
    },
    async refresh(secret) {
      if (!secret.refresh) fail('O acesso ao LinkedIn expirou. Reconecte a conta.', 401);
      const t = await call('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', body: form({ grant_type: 'refresh_token', refresh_token: secret.refresh, client_id: env('LINKEDIN_CLIENT_ID'), client_secret: env('LINKEDIN_CLIENT_SECRET') }) });
      return { ...secret, token: t.access_token, refresh: t.refresh_token || secret.refresh, expiresAt: Date.now() + t.expires_in * 1000 };
    }
  },
  tiktok: {
    keys: { id: () => env('TIKTOK_CLIENT_KEY'), secret: () => env('TIKTOK_CLIENT_SECRET') },
    url: ({ redirectUri, state }) => 'https://www.tiktok.com/v2/auth/authorize/?' + form({ client_key: env('TIKTOK_CLIENT_KEY'), scope: 'user.info.basic,video.publish,video.upload', response_type: 'code', redirect_uri: redirectUri, state }),
    async exchange({ code, redirectUri }) {
      const t = await call('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', body: form({ client_key: env('TIKTOK_CLIENT_KEY'), client_secret: env('TIKTOK_CLIENT_SECRET'), code, grant_type: 'authorization_code', redirect_uri: redirectUri }) });
      const me = (await call('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', { token: t.access_token })).data?.user || {};
      return [{ provider: 'tiktok', externalId: t.open_id, name: me.display_name || 'TikTok', avatar: me.avatar_url, secret: { token: t.access_token, refresh: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 } }];
    },
    async refresh(secret) {
      const t = await call('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', body: form({ client_key: env('TIKTOK_CLIENT_KEY'), client_secret: env('TIKTOK_CLIENT_SECRET'), grant_type: 'refresh_token', refresh_token: secret.refresh }) });
      return { ...secret, token: t.access_token, refresh: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 };
    }
  },
  pinterest: {
    keys: { id: () => env('PINTEREST_APP_ID'), secret: () => env('PINTEREST_APP_SECRET') },
    url: ({ redirectUri, state }) => 'https://www.pinterest.com/oauth/?' + form({ client_id: env('PINTEREST_APP_ID'), redirect_uri: redirectUri, response_type: 'code', scope: 'boards:read,pins:read,pins:write,user_accounts:read', state }),
    async exchange({ code, redirectUri }) {
      const basic = Buffer.from(`${env('PINTEREST_APP_ID')}:${env('PINTEREST_APP_SECRET')}`).toString('base64');
      const t = await call('https://api.pinterest.com/v5/oauth/token', { method: 'POST', token: basic, auth: 'Basic', body: form({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }) });
      const me = await call('https://api.pinterest.com/v5/user_account', { token: t.access_token });
      const boards = await call('https://api.pinterest.com/v5/boards?page_size=100', { token: t.access_token });
      const secret = { token: t.access_token, refresh: t.refresh_token, expiresAt: Date.now() + (t.expires_in || 2_592_000) * 1000 };
      return (boards.items || []).map(b => ({ provider: 'pinterest', externalId: b.id, name: b.name, handle: `@${me.username}`, avatar: me.profile_image, kind: 'Pasta', secret }));
    },
    async refresh(secret) {
      const basic = Buffer.from(`${env('PINTEREST_APP_ID')}:${env('PINTEREST_APP_SECRET')}`).toString('base64');
      const t = await call('https://api.pinterest.com/v5/oauth/token', { method: 'POST', token: basic, auth: 'Basic', body: form({ grant_type: 'refresh_token', refresh_token: secret.refresh }) });
      return { ...secret, token: t.access_token, refresh: t.refresh_token || secret.refresh, expiresAt: Date.now() + (t.expires_in || 2_592_000) * 1000 };
    }
  }
};
const google = scope => ({
  keys: { id: () => env('GOOGLE_CLIENT_ID'), secret: () => env('GOOGLE_CLIENT_SECRET') },
  url: ({ redirectUri, state }) => 'https://accounts.google.com/o/oauth2/v2/auth?' + form({ client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: redirectUri, response_type: 'code', scope, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state }),
  token: ({ code, redirectUri }) => call('https://oauth2.googleapis.com/token', { method: 'POST', body: form({ code, client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), redirect_uri: redirectUri, grant_type: 'authorization_code' }) }),
  async refresh(secret) {
    if (!secret.refresh) fail('O acesso ao Google expirou. Reconecte a conta.', 401);
    const t = await call('https://oauth2.googleapis.com/token', { method: 'POST', body: form({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), refresh_token: secret.refresh, grant_type: 'refresh_token' }) });
    return { ...secret, token: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
  }
});
oauth.youtube = { ...google('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly'),
  async exchange(args) {
    const t = await this.token(args);
    const ch = await call('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { token: t.access_token });
    const secret = { token: t.access_token, refresh: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 };
    return (ch.items || []).map(c => ({ provider: 'youtube', externalId: c.id, name: c.snippet.title, handle: c.snippet.customUrl || '', avatar: c.snippet.thumbnails?.default?.url, kind: 'Canal', secret }));
  } };
oauth.gbp = { ...google('https://www.googleapis.com/auth/business.manage'),
  async exchange(args) {
    const t = await this.token(args);
    const secret = { token: t.access_token, refresh: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 }, out = [];
    const accounts = await call('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', { token: t.access_token });
    for (const a of accounts.accounts || []) {
      const locs = await call(`https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title&pageSize=100`, { token: t.access_token });
      for (const l of locs.locations || []) out.push({ provider: 'gbp', externalId: `${a.name}/${l.name}`, name: l.title, handle: a.accountName || '', kind: 'Local', secret });
    }
    return out;
  } };
oauth.instagram = oauth.facebook;

/** Which networks can connect with the keys present in this deployment. */
export function availability() {
  return Object.fromEntries(['facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'pinterest', 'threads', 'bluesky', 'gbp']
    .map(id => [id, id === 'bluesky' || Boolean(oauth[id]?.keys.id() && oauth[id]?.keys.secret())]));
}
export function authUrl(provider, { redirectUri, state }) {
  const o = oauth[provider] || fail('Esta rede não usa login OAuth.');
  if (!availability()[provider]) fail(`As chaves de ${network(provider).name} ainda não foram configuradas.`, 409);
  return o.url({ redirectUri, state });
}
export async function exchange(provider, args) {
  const o = oauth[provider] || fail('Rede desconhecida.');
  const found = await o.exchange(args);
  if (!found.length) fail(`Nenhuma ${network(provider).kind.toLowerCase()} foi encontrada nesta conta de ${network(provider).name}.`, 404);
  return found;
}

// ---- Bluesky (app password, no developer app) ---------------------------------------------------
const pds = () => env('BLUESKY_SERVICE') || 'https://bsky.social';
export async function blueskyLogin(identifier, password) {
  const id = String(identifier || '').trim().replace(/^@/, ''), pw = String(password || '').trim();
  if (!id || !/^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i.test(pw)) fail('Informe o usuário e uma senha de app do Bluesky (formato xxxx-xxxx-xxxx-xxxx).');
  const s = await call(`${pds()}/xrpc/com.atproto.server.createSession`, { method: 'POST', json: { identifier: id, password: pw } });
  let profile = {};
  try { profile = await call(`${pds()}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(s.did)}`, { token: s.accessJwt }); } catch { /* the avatar is optional */ }
  return [{ provider: 'bluesky', externalId: s.did, name: profile.displayName || s.handle, handle: `@${s.handle}`, avatar: profile.avatar, kind: 'Perfil', secret: { token: s.accessJwt, refresh: s.refreshJwt, identifier: id, password: pw } }];
}
async function blueskySession(secret) {
  try { const r = await call(`${pds()}/xrpc/com.atproto.server.refreshSession`, { method: 'POST', token: secret.refresh }); return { ...secret, token: r.accessJwt, refresh: r.refreshJwt }; }
  catch { const [fresh] = await blueskyLogin(secret.identifier, secret.password); return fresh.secret; }
}
/** Rich-text facets: links, #hashtags and @mentions (handles that resolve to an account). */
export async function facets(text) {
  const enc = new TextEncoder(), out = [];
  const byteAt = i => enc.encode(text.slice(0, i)).length;
  for (const m of text.matchAll(/https?:\/\/[^\s)]+/g)) out.push({ index: { byteStart: byteAt(m.index), byteEnd: byteAt(m.index + m[0].length) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] });
  for (const m of text.matchAll(/(^|\s)#([\p{L}\p{N}_]{1,60})/gu)) { const start = m.index + m[1].length; out.push({ index: { byteStart: byteAt(start), byteEnd: byteAt(start + m[2].length + 1) }, features: [{ $type: 'app.bsky.richtext.facet#tag', tag: m[2] }] }); }
  const handles = [...text.matchAll(/(^|[\s(])@([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)/gi)].slice(0, 20);
  for (const m of handles) {
    const handle = m[2].replace(/[.-]+$/, ''), start = m.index + m[1].length;
    const did = await call(`${pds()}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle.toLowerCase())}`).then(r => r.did).catch(() => '');
    if (did) out.push({ index: { byteStart: byteAt(start), byteEnd: byteAt(start + handle.length + 1) }, features: [{ $type: 'app.bsky.richtext.facet#mention', did }] });
  }
  return out;
}
const metaTag = (html, name) => {
  const tag = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([t]) => t).find(t => new RegExp(`\\b(property|name)=["']${name}["']`, 'i').test(t));
  return (tag?.match(/\bcontent=["']([^"']*)["']/i)?.[1] || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
};
/** Link card for a URL: page title, description and a thumbnail blob. Any failure leaves a plain card. */
async function linkCard(url, token) {
  const card = { uri: url, title: url, description: '' };
  try {
    const page = await fetcher(url, { headers: { Accept: 'text/html' }, signal: AbortSignal.timeout(8_000), redirect: 'follow' });
    if (!page.ok || !/html/i.test(page.headers.get('content-type') || '')) return card;
    const html = (await page.text()).slice(0, 500_000);
    card.title = (metaTag(html, 'og:title') || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || url).trim().slice(0, 300);
    card.description = (metaTag(html, 'og:description') || metaTag(html, 'description')).slice(0, 1000);
    const image = metaTag(html, 'og:image');
    if (/^https?:\/\//i.test(image)) {
      const r = await fetcher(new URL(image, url).href, { signal: AbortSignal.timeout(8_000) });
      const type = r.headers.get('content-type') || '';
      const bytes = r.ok && /^image\//.test(type) ? Buffer.from(await r.arrayBuffer()) : null;
      if (bytes && bytes.length <= 1_000_000) card.thumb = (await call(`${pds()}/xrpc/com.atproto.repo.uploadBlob`, { method: 'POST', token, headers: { 'Content-Type': type }, body: bytes })).blob;
    }
  } catch { /* the card still links */ }
  return card;
}

// ---- Publishing ----------------------------------------------------------------------------------
/** Publishes one post on one account. `media` items carry a public `url` and a `bytes()` loader. */
export async function publish(account, secret, post, media) {
  let s = secret || fail('A conta precisa ser reconectada.', 401);
  const o = oauth[account.provider];
  if (account.provider === 'bluesky') s = await blueskySession(s);
  else if (s.expiresAt && s.expiresAt < Date.now() + 300_000 && o?.refresh) s = await o.refresh(s);
  const text = textFor(post, account.provider);
  const result = await publishers[account.provider](account, s, { ...post, text }, media);
  return { ...result, secret: s };
}

const publishers = {
  async facebook(a, s, p, media) {
    const g = `https://graph.facebook.com/${graphVersion()}`, page = a.externalId, token = s.token;
    const images = media.filter(m => mediaKind(m) === 'image'), video = media.find(m => mediaKind(m) === 'video');
    let id;
    if (p.type === 'reel') {
      if (!video) fail('Reels do Facebook precisam de um vídeo.');
      const start = await call(`${g}/${page}/video_reels`, { method: 'POST', token, json: { upload_phase: 'start' } });
      await call(`https://rupload.facebook.com/video-upload/${graphVersion()}/${start.video_id}`, { method: 'POST', token, auth: 'OAuth', headers: { file_url: video.url } });
      await call(`${g}/${page}/video_reels`, { method: 'POST', token, json: { upload_phase: 'finish', video_id: start.video_id, video_state: 'PUBLISHED', description: p.text } });
      id = start.video_id;
    } else if (p.type === 'story') {
      if (video) {
        const start = await call(`${g}/${page}/video_stories`, { method: 'POST', token, json: { upload_phase: 'start' } });
        await call(`https://rupload.facebook.com/video-upload/${graphVersion()}/${start.video_id}`, { method: 'POST', token, auth: 'OAuth', headers: { file_url: video.url } });
        id = (await call(`${g}/${page}/video_stories`, { method: 'POST', token, json: { upload_phase: 'finish', video_id: start.video_id } })).post_id;
      } else {
        const photo = await call(`${g}/${page}/photos`, { method: 'POST', token, json: { url: images[0]?.url || fail('Stories precisam de mídia.'), published: false } });
        id = (await call(`${g}/${page}/photo_stories`, { method: 'POST', token, json: { photo_id: photo.id } })).post_id;
      }
    } else if (video) {
      id = (await call(`${g}/${page}/videos`, { method: 'POST', token, json: { file_url: video.url, description: p.text } })).id;
    } else if (images.length === 1) {
      const r = await call(`${g}/${page}/photos`, { method: 'POST', token, json: { url: images[0].url, caption: p.text } }); id = r.post_id || r.id;
    } else if (images.length > 1) {
      const ids = [];
      for (const m of images) ids.push((await call(`${g}/${page}/photos`, { method: 'POST', token, json: { url: m.url, published: false } })).id);
      id = (await call(`${g}/${page}/feed`, { method: 'POST', token, json: { message: p.text, attached_media: ids.map(media_fbid => ({ media_fbid })) } })).id;
    } else {
      id = (await call(`${g}/${page}/feed`, { method: 'POST', token, json: { message: p.text, ...(p.link ? { link: p.link } : {}) } })).id;
    }
    if (p.firstComment && p.type === 'post') await call(`${g}/${id}/comments`, { method: 'POST', token, json: { message: p.firstComment } }).catch(() => null);
    return { ok: true, externalId: id, url: `https://www.facebook.com/${id}` };
  },
  async instagram(a, s, p, media) {
    const g = `https://graph.facebook.com/${graphVersion()}`, ig = a.externalId, token = s.token;
    const container = async (m, extra = {}) => {
      const video = mediaKind(m) === 'video';
      const body = { ...(video ? { video_url: m.url, media_type: p.type === 'story' ? 'STORIES' : 'REELS' } : { image_url: m.url, ...(p.type === 'story' ? { media_type: 'STORIES' } : {}) }), ...extra };
      const id = (await call(`${g}/${ig}/media`, { method: 'POST', token, json: body })).id;
      if (video) await ready(`${g}/${id}?fields=status_code`, token, 'status_code', 'FINISHED');
      return id;
    };
    if (!media.length) fail('O Instagram precisa de uma imagem ou vídeo.');
    let creation;
    if (media.length === 1 || p.type === 'story') creation = await container(media[0], p.type === 'story' ? {} : { caption: p.text });
    else {
      const children = [];
      for (const m of media.slice(0, 10)) children.push(await container({ ...m }, { is_carousel_item: true, ...(mediaKind(m) === 'video' ? { media_type: 'VIDEO' } : {}) }));
      creation = (await call(`${g}/${ig}/media`, { method: 'POST', token, json: { media_type: 'CAROUSEL', children: children.join(','), caption: p.text } })).id;
      await ready(`${g}/${creation}?fields=status_code`, token, 'status_code', 'FINISHED');
    }
    const id = (await call(`${g}/${ig}/media_publish`, { method: 'POST', token, json: { creation_id: creation } })).id;
    if (p.firstComment && p.type !== 'story') await call(`${g}/${id}/comments`, { method: 'POST', token, json: { message: p.firstComment } }).catch(() => null);
    const link = await call(`${g}/${id}?fields=permalink`, { token }).catch(() => ({}));
    return { ok: true, externalId: id, url: link.permalink || '' };
  },
  async threads(a, s, p, media) {
    const g = 'https://graph.threads.net/v1.0', uid = a.externalId, token = s.token;
    const make = async (body) => { const id = (await call(`${g}/${uid}/threads`, { method: 'POST', token, json: body })).id; await ready(`${g}/${id}?fields=status`, token, 'status', 'FINISHED'); return id; };
    const one = m => mediaKind(m) === 'video' ? { media_type: 'VIDEO', video_url: m.url } : { media_type: 'IMAGE', image_url: m.url };
    let creation;
    if (!media.length) creation = await make({ media_type: 'TEXT', text: p.text, ...(p.link ? { link_attachment: p.link } : {}) });
    else if (media.length === 1) creation = await make({ ...one(media[0]), text: p.text });
    else {
      const children = [];
      for (const m of media.slice(0, 20)) children.push(await make({ ...one(m), is_carousel_item: true }));
      creation = await make({ media_type: 'CAROUSEL', children: children.join(','), text: p.text });
    }
    const id = (await call(`${g}/${uid}/threads_publish`, { method: 'POST', token, json: { creation_id: creation } })).id;
    if (p.firstComment) {
      // First comment: a text reply to the new thread, published the same way.
      try {
        const reply = await make({ media_type: 'TEXT', text: p.firstComment.slice(0, 500), reply_to_id: id });
        await call(`${g}/${uid}/threads_publish`, { method: 'POST', token, json: { creation_id: reply } });
      } catch { /* the post itself went out */ }
    }
    const link = await call(`${g}/${id}?fields=permalink`, { token }).catch(() => ({}));
    return { ok: true, externalId: id, url: link.permalink || '' };
  },
  async linkedin(a, s, p, media) {
    const headers = { 'LinkedIn-Version': linkedinVersion(), 'X-Restli-Protocol-Version': '2.0.0' }, owner = `urn:li:person:${a.externalId}`;
    if (media.some(m => mediaKind(m) === 'video')) fail('Vídeos no LinkedIn ainda não são suportados pelo planejador. Use imagens ou link.');
    const ids = [];
    for (const m of media.slice(0, 20)) {
      const init = await call('https://api.linkedin.com/rest/images?action=initializeUpload', { method: 'POST', token: s.token, headers, json: { initializeUploadRequest: { owner } } });
      await call(init.value.uploadUrl, { method: 'PUT', token: s.token, body: await m.bytes(), raw: true });
      ids.push(init.value.image);
    }
    const content = ids.length > 1 ? { multiImage: { images: ids.map(id => ({ id })) } } : ids.length ? { media: { id: ids[0] } } : p.link ? { article: { source: p.link, title: p.text.split('\n')[0].slice(0, 200) || p.link } } : undefined;
    const r = await call('https://api.linkedin.com/rest/posts', { method: 'POST', token: s.token, headers, json: { author: owner, commentary: p.text.replace(/[(){}[\]<>@|~_*\\]/g, m => `\\${m}`), visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false, ...(content ? { content } : {}) } });
    const id = r._headers.get('x-restli-id') || r.id || '';
    return { ok: true, externalId: id, url: id ? `https://www.linkedin.com/feed/update/${id}` : '' };
  },
  async tiktok(a, s, p, media) {
    const info = (await call('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', { method: 'POST', token: s.token, json: {} })).data || {};
    const options = info.privacy_level_options || ['SELF_ONLY'], wanted = env('TIKTOK_PRIVACY') || 'PUBLIC_TO_EVERYONE';
    const privacy = options.includes(wanted) ? wanted : options.includes('PUBLIC_TO_EVERYONE') ? 'PUBLIC_TO_EVERYONE' : options[0];
    const video = media.find(m => mediaKind(m) === 'video');
    const r = video
      ? await call('https://open.tiktokapis.com/v2/post/publish/video/init/', { method: 'POST', token: s.token, json: { post_info: { title: p.text.slice(0, 2200), privacy_level: privacy }, source_info: { source: 'PULL_FROM_URL', video_url: video.url } } })
      : await call('https://open.tiktokapis.com/v2/post/publish/content/init/', { method: 'POST', token: s.token, json: { media_type: 'PHOTO', post_mode: 'DIRECT_POST',
        post_info: { title: p.text.split('\n')[0].slice(0, 90), description: p.text.slice(0, 4000), privacy_level: privacy }, source_info: { source: 'PULL_FROM_URL', photo_images: media.map(m => m.url).slice(0, 35), photo_cover_index: 0 } } });
    return { ok: true, externalId: r.data?.publish_id || '', url: '' };
  },
  async youtube(a, s, p, media) {
    const video = media.find(m => mediaKind(m) === 'video') || fail('O YouTube precisa de um vídeo.');
    const bytes = await video.bytes();
    const title = (p.text.split('\n')[0] || 'Vídeo').slice(0, 100);
    const start = await call('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', { method: 'POST', token: s.token, raw: true,
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(bytes.length), 'X-Upload-Content-Type': 'video/*' },
      body: JSON.stringify({ snippet: { title, description: p.text.slice(0, 5000), tags: p.tags || [] }, status: { privacyStatus: env('YOUTUBE_PRIVACY') || 'public', selfDeclaredMadeForKids: false } }) });
    const r = await call(start.headers.get('location'), { method: 'PUT', token: s.token, headers: { 'Content-Type': 'video/*' }, body: bytes });
    return { ok: true, externalId: r.id, url: `https://youtu.be/${r.id}` };
  },
  async gbp(a, s, p, media) {
    const image = media.find(m => mediaKind(m) === 'image');
    const r = await call(`https://mybusiness.googleapis.com/v4/${a.externalId}/localPosts`, { method: 'POST', token: s.token, json: { languageCode: 'pt-BR', summary: p.text.slice(0, 1500), topicType: 'STANDARD',
      ...(image ? { media: [{ mediaFormat: 'PHOTO', sourceUrl: image.url }] } : {}), ...(p.link ? { callToAction: { actionType: 'LEARN_MORE', url: p.link } } : {}) } });
    return { ok: true, externalId: r.name || '', url: r.searchUrl || '' };
  },
  async pinterest(a, s, p, media) {
    const image = media.find(m => mediaKind(m) === 'image'), video = media.find(m => mediaKind(m) === 'video');
    if (!image) fail(video ? 'Vídeos no Pinterest ainda não são suportados. Use uma imagem.' : 'O Pinterest precisa de uma imagem.');
    const r = await call('https://api.pinterest.com/v5/pins', { method: 'POST', token: s.token, json: { board_id: a.externalId, title: p.text.split('\n')[0].slice(0, 100), description: p.text.slice(0, 500),
      ...(p.link ? { link: p.link } : {}), media_source: { source_type: 'image_url', url: image.url } } });
    return { ok: true, externalId: r.id, url: `https://www.pinterest.com/pin/${r.id}/` };
  },
  async bluesky(a, s, p, media) {
    const record = { $type: 'app.bsky.feed.post', text: p.text, createdAt: new Date().toISOString(), langs: ['pt'], facets: await facets(p.text) };
    const images = media.filter(m => mediaKind(m) === 'image').slice(0, 4), video = media.find(m => mediaKind(m) === 'video');
    const upload = (bytes, type) => call(`${pds()}/xrpc/com.atproto.repo.uploadBlob`, { method: 'POST', token: s.token, headers: { 'Content-Type': type }, body: bytes }).then(r => r.blob);
    if (video) {
      // A video goes alone: Bluesky does not mix it with images. The app processes it after posting.
      const bytes = await video.bytes(); if (bytes.length > 100_000_000) fail('O Bluesky aceita vídeos de até 100 MB.');
      record.embed = { $type: 'app.bsky.embed.video', video: await upload(bytes, video.mime || 'video/mp4'), alt: String(video.alt || '').slice(0, 1000) };
    } else if (images.length) {
      const list = [];
      for (const m of images) {
        const bytes = await m.bytes(); if (bytes.length > 1_000_000) fail('O Bluesky aceita imagens de até 1 MB.');
        list.push({ alt: String(m.alt || '').slice(0, 1000), image: await upload(bytes, m.mime || 'image/jpeg') });
      }
      record.embed = { $type: 'app.bsky.embed.images', images: list };
    } else if (p.link) record.embed = { $type: 'app.bsky.embed.external', external: await linkCard(p.link, s.token) };
    const create = rec => call(`${pds()}/xrpc/com.atproto.repo.createRecord`, { method: 'POST', token: s.token, json: { repo: a.externalId, collection: 'app.bsky.feed.post', record: rec } });
    const r = await create(record);
    if (p.firstComment) {
      // The first comment is a reply to the post itself (root and parent are the same).
      const ref = { uri: r.uri, cid: r.cid };
      await create({ $type: 'app.bsky.feed.post', text: p.firstComment.slice(0, 300), createdAt: new Date().toISOString(), langs: ['pt'], facets: await facets(p.firstComment.slice(0, 300)), reply: { root: ref, parent: ref } }).catch(() => null);
    }
    return { ok: true, externalId: r.uri, url: `https://bsky.app/profile/${a.externalId}/post/${r.uri.split('/').pop()}` };
  }
};

/** Polls a media container until the network finished processing it (videos take a while). */
async function ready(url, token, field, done, tries = Number(env('SOCIAL_POLL_TRIES') || 40)) {
  for (let n = 0; n < tries; n++) {
    const r = await call(url, { token });
    if (r[field] === done) return;
    if (['ERROR', 'EXPIRED'].includes(r[field])) fail('A rede não conseguiu processar a mídia.', 502);
    await wait(Number(env('SOCIAL_POLL_MS') || 3000));
  }
  fail('A rede demorou demais para processar a mídia. Tente de novo.', 504);
}
