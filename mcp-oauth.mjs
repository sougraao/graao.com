// OAuth 2.1 do servidor MCP: regras de cliente, pedido e conexão (grant). Sem rede e sem rota; as rotas estão em
// routes/mcp.mjs. As conexões ficam na agência (agency.mcpGrants) e guardam só o hash dos tokens.
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const MINUTE = 60000, DAY = 86400000;
const CODE_LIFE = 5 * MINUTE, TOKEN_LIFE = 60 * MINUTE, REFRESH_LIFE = 90 * DAY, RETRY_GRACE = MINUTE;
export const MAX_GRANTS = 100;
export const tokenPrefix = 'graao_mcp_';
const clientPrefix = 'graao_client_';
// Desktop apps that receive the answer through their own link scheme.
const appSchemes = new Set(['cursor:', 'vscode:', 'vscode-insiders:', 'windsurf:', 'claude:']);
const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);

export const digest = value => createHash('sha256').update(String(value)).digest('hex');
const secret = prefix => prefix + randomBytes(24).toString('hex');
const iso = at => new Date(at).toISOString();
const past = (value, now) => !(Date.parse(value) > now);

export class OAuthProblem extends Error {
  constructor(code, message) { super(message); this.code = code; this.status = 400; }
}
const problem = (code, message) => { throw new OAuthProblem(code, message); };

/** A return address is a web page over https, a program on the person's own computer, or a known app link. */
export function safeRedirect(value) {
  if (typeof value !== 'string' || value.length > 500) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.hash || value.includes('#') || url.username || url.password) return null;
  if (url.protocol === 'https:' || appSchemes.has(url.protocol) || (url.protocol === 'http:' && loopback.has(url.hostname))) return url;
  return null;
}

// Registration is open, so the client id itself carries what was registered: nothing to store, nothing to fill up.
export function registerClient(input) {
  const redirects = Array.isArray(input?.redirect_uris) ? input.redirect_uris : [];
  if (!redirects.length || redirects.length > 5 || !redirects.every(safeRedirect)) problem('invalid_redirect_uri', 'Envie de 1 a 5 endereços de retorno https ou locais.');
  const name = String(input.client_name || 'Cliente MCP').replace(/[\p{C}]/gu, '').trim().slice(0, 60) || 'Cliente MCP';
  const id = clientPrefix + Buffer.from(JSON.stringify({ n: name, r: redirects })).toString('base64url');
  if (id.length > 1200) problem('invalid_client_metadata', 'Registro longo demais.');
  return { client_id: id, client_name: name, redirect_uris: redirects, token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] };
}

function readClient(id) {
  if (typeof id !== 'string' || !id.startsWith(clientPrefix) || id.length > 1200) return null;
  try {
    const { n, r } = JSON.parse(Buffer.from(id.slice(clientPrefix.length), 'base64url').toString('utf8'));
    return typeof n === 'string' && Array.isArray(r) ? { name: n.slice(0, 60), redirects: r } : null;
  } catch { return null; }
}

// A program on the person's computer opens a new port each time, so only the port may differ there.
function sameRedirect(registered, asked) {
  if (registered === asked) return true;
  const a = safeRedirect(registered), b = safeRedirect(asked);
  if (!a || !b || a.protocol !== 'http:' || b.protocol !== 'http:') return false;
  return a.hostname === b.hostname && a.pathname === b.pathname && a.search === b.search;
}

/** Validates an authorization request. Throws before any redirect when the client or the address can't be trusted. */
export function readRequest(request, base) {
  const client = readClient(request?.client_id);
  if (!client) problem('invalid_client', 'A IA que pediu acesso não está registrada. Tente conectar de novo.');
  const redirect = safeRedirect(request.redirect_uri);
  if (!redirect || !client.redirects.some(uri => sameRedirect(uri, request.redirect_uri))) problem('invalid_request', 'O endereço de retorno não confere com o registro.');
  if (request.response_type !== 'code') problem('unsupported_response_type', 'Pedido inválido.');
  if (request.code_challenge_method !== 'S256' || !/^[\w-]{43}$/.test(request.code_challenge || '')) problem('invalid_request', 'O pedido precisa usar PKCE (S256).');
  let workspace = '';
  if (request.resource) {
    const resource = String(request.resource).split('?')[0].replace(/\/$/, '');
    const match = resource === `${base}/api/mcp` ? ['', ''] : resource.startsWith(`${base}/api/mcp/`) ? ['', resource.slice(`${base}/api/mcp/`.length)] : null;
    if (!match || match[1].includes('/')) problem('invalid_target', 'O pedido é para outro endereço (resource).');
    workspace = match[1];
  }
  return { client, redirect, redirectUri: request.redirect_uri, clientId: request.client_id, challenge: request.code_challenge, state: request.state, workspace };
}

/** Where the person is sent back, with the code or the refusal. */
export function answerUrl({ redirect, state }, params) {
  const url = new URL(redirect);
  for (const [key, value] of Object.entries({ ...params, ...(state !== undefined && { state: String(state).slice(0, 1000) }) })) url.searchParams.set(key, value);
  return url.href;
}

const dead = (grant, now) => grant.refreshHash ? past(grant.refreshExpires, now) : past(grant.codeExpires, now);

export function openGrant(agency, request, { userId, userName, workspace, access }, now = Date.now()) {
  agency.mcpGrants = (agency.mcpGrants || []).filter(grant => !dead(grant, now));
  if (agency.mcpGrants.length >= MAX_GRANTS) throw Object.assign(new Error('A agência chegou ao limite de conexões de IA. Revogue uma antes de criar outra.'), { status: 409 });
  const code = secret('');
  agency.mcpGrants.push({
    id: randomUUID(), client: request.client.name, host: request.redirect.host || request.redirect.protocol.replace(':', ''), clientHash: digest(request.clientId),
    redirect: request.redirectUri, challenge: request.challenge, userId, userName, workspace, access, created: iso(now), lastUsed: '',
    codeHash: digest(code), codeExpires: iso(now + CODE_LIFE), codeUsed: false, tokenHash: '', tokenExpires: '', refreshHash: '', refreshExpires: '', oldRefreshHash: '', rotatedAt: ''
  });
  return code;
}

function issue(grant, now) {
  const token = secret(tokenPrefix), refresh = secret('graao_mcpr_');
  Object.assign(grant, { tokenHash: digest(token), tokenExpires: iso(now + TOKEN_LIFE), refreshHash: digest(refresh), refreshExpires: iso(now + REFRESH_LIFE) });
  return { access_token: token, token_type: 'Bearer', expires_in: TOKEN_LIFE / 1000, refresh_token: refresh, scope: grant.access === 'write' ? 'read write' : 'read' };
}
const drop = (agency, grant) => { agency.mcpGrants = agency.mcpGrants.filter(row => row !== grant); return null; };

// Both exchanges change the agency and return the tokens, or null (invalid_grant): a refusal must still be saved when
// it ends the connection, so it can't be an exception inside the change.
export function redeemCode(agency, form, now = Date.now()) {
  const grant = agency.mcpGrants?.find(row => row.codeHash === digest(form.code));
  if (!grant) return null;
  if (grant.codeUsed) return drop(agency, grant);
  const verifier = String(form.code_verifier || '');
  const proof = createHash('sha256').update(verifier).digest('base64url');
  if (past(grant.codeExpires, now) || grant.clientHash !== digest(form.client_id) || grant.redirect !== form.redirect_uri || proof !== grant.challenge) return null;
  grant.codeUsed = true;
  return issue(grant, now);
}

export function renewGrant(agency, form, now = Date.now()) {
  const hash = digest(form.refresh_token);
  const grant = agency.mcpGrants?.find(row => row.refreshHash === hash || row.oldRefreshHash === hash);
  if (!grant) return null;
  if (grant.refreshHash !== hash) return past(iso(Date.parse(grant.rotatedAt) + RETRY_GRACE), now) ? drop(agency, grant) : null;
  if (past(grant.refreshExpires, now) || grant.clientHash !== digest(form.client_id)) return null;
  Object.assign(grant, { oldRefreshHash: grant.refreshHash, rotatedAt: iso(now) });
  return issue(grant, now);
}

export const liveGrant = (agency, token, now = Date.now()) => {
  const grant = agency.mcpGrants?.find(row => row.tokenHash === digest(token));
  return grant && !past(grant.tokenExpires, now) ? grant : null;
};

export const grantFilters = {
  code: value => ({ mcpGrants: [{ codeHash: digest(value) }] }), token: value => ({ mcpGrants: [{ tokenHash: digest(value) }] }),
  refresh: value => ({ mcpGrants: [{ refreshHash: digest(value) }] }), oldRefresh: value => ({ mcpGrants: [{ oldRefreshHash: digest(value) }] })
};

export const grantView = ({ id, client, host, userName, workspace, access, created, lastUsed }) => ({ id, client, host, userName, workspace, access, created, lastUsed });
