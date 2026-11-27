// Rotas do servidor MCP: /api/mcp (as ferramentas), o OAuth que conecta uma IA com o login do graao, a tela de
// consentimento (/mcp/autorizar) e a lista de IAs conectadas.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hydrateAgency, userAccess } from '../agency-model.mjs';
import { afterLogin } from '../auth.mjs';
import { answerUrl, digest, grantFilters, grantView, liveGrant, OAuthProblem, openGrant, readRequest, redeemCode, registerClient, renewGrant, tokenPrefix } from '../mcp-oauth.mjs';
import { createMcpHandler, mcpInfo } from '../mcp-server.mjs';
import { mcpTools } from '../mcp-tools.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

const mcpPath = /^\/api\/mcp(?:\/([^/]+))?\/?$/;
const resourcePath = /^\/\.well-known\/oauth-protected-resource(\/api\/mcp(?:\/[0-9a-z-]+)?)?$/;
const serverPath = /^\/\.well-known\/(?:oauth-authorization-server|openid-configuration)$/;
const readScopes = [...new Set(mcpTools.filter(tool => tool.access === 'read').map(tool => tool.scope))];
const USE_WRITE = 10 * 60000;

export function createMcpRoutes(deps) {
  const {
    store, ready, root, auth, localAccess, error, spaceId, privateSpace, payload, runCommand, publicBase, stamp, recordAudit, listWorkspaces,
    access, apiCredential, changeAgency, loadAgency, requireWorkspaceAccess, workspaceAccess
  } = deps;
  const handle = createMcpHandler({ store, run: runCommand });

  // ---- Who is calling ----
  // An AI sends a key or an OAuth token in the Authorization header; the app itself may use the signed-in session.
  // A bad credential never falls back to the session, and a credential in the URL is never read.
  async function caller(req, res, asked) {
    const header = String(req.headers.authorization || '');
    if (!header) {
      if (auth && !auth.hasSession(req)) throw error('Conecte com uma chave de API ou com o login do graao.', 401);
      return { workspace: asked, who: await workspaceAccess(req, res, asked, { hide: true }) };
    }
    const token = header.replace(/^Bearer\s+/i, '');
    if (token.startsWith(tokenPrefix)) return grantCaller(token, asked);
    const key = await apiCredential(req);
    const workspace = asked || key.account || '';
    if (key.account && key.account !== workspace) throw error('O token deste app só vale para a subconta onde ele foi instalado.', 403);
    requireWorkspaceId(workspace);
    const actor = { agencyId: key.agencyId, modules: null, name: `API · ${key.name}`, scopes: key.scopes };
    return { workspace, who: await requireWorkspaceAccess(await loadAgency(key.agencyId), actor, workspace, { hide: true, reason: false }) };
  }

  // The connection acts as the person who allowed it, with what that person may do today.
  async function grantCaller(token, asked) {
    const ended = () => error('Esta conexão terminou. Conecte de novo.', 401);
    const match = await store.findAgency(grantFilters.token(token));
    const grant = match && liveGrant(match.state, token);
    if (!grant) throw ended();
    const agency = hydrateAgency(match.state, match.id);
    const person = userAccess(agency, grant.userId);
    if (!person || (grant.userId && !agency.users.find(user => user.id === grant.userId)?.loginEnabled)) throw ended();
    if (asked && asked !== grant.workspace) throw error('Esta conexão é de outra subconta.', 403);
    const actor = { ...person, agencyId: match.id, userId: grant.userId, name: `${person.name} (${grant.client})`, scopes: grant.access === 'write' ? null : readScopes };
    const who = await requireWorkspaceAccess(agency, actor, grant.workspace, { hide: true, reason: false });
    if (!(Date.now() - Date.parse(grant.lastUsed) < USE_WRITE)) await changeAgency(match.id, doc => {
      const row = doc.mcpGrants.find(item => item.id === grant.id);
      if (row) row.lastUsed = stamp();
    });
    return { workspace: grant.workspace, who };
  }

  function requireWorkspaceId(workspace) {
    if (!spaceId.test(workspace) && !privateSpace.test(workspace)) throw error('Subconta não informada ou inválida. Use /api/mcp/<id da subconta>.', 400);
  }

  // ---- OAuth ----
  async function form(req) {
    if (/^application\/json/i.test(req.headers['content-type'] || '')) return payload(req);
    let size = 0; const chunks = [];
    for await (const part of req) { size += part.length; if (size > 12000) throw error('Request is too large.', 413); chunks.push(part); }
    return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
  }
  async function exchange(input) {
    const byCode = input.grant_type === 'authorization_code';
    if (!byCode && input.grant_type !== 'refresh_token') throw new OAuthProblem('unsupported_grant_type', 'Tipo de troca não aceito.');
    const value = byCode ? input.code : input.refresh_token;
    const filters = byCode ? [grantFilters.code] : [grantFilters.refresh, grantFilters.oldRefresh];
    let match = null;
    for (const filter of value ? filters : []) match ||= await store.findAgency(filter(value));
    const tokens = match && await changeAgency(match.id, agency => (byCode ? redeemCode : renewGrant)(agency, input));
    if (!tokens) throw new OAuthProblem('invalid_grant', 'O código ou token não vale mais. Conecte de novo.');
    return tokens;
  }
  async function revoke(token) {
    for (const filter of token ? [grantFilters.token, grantFilters.refresh] : []) {
      const match = await store.findAgency(filter(token));
      if (match) await changeAgency(match.id, agency => { agency.mcpGrants = agency.mcpGrants.filter(row => ![row.tokenHash, row.refreshHash].includes(digest(token))); });
    }
  }
  const metadata = base => ({
    issuer: base, authorization_endpoint: `${base}/mcp/autorizar`, token_endpoint: `${base}/api/mcp/oauth/token`,
    registration_endpoint: `${base}/api/mcp/oauth/register`, revocation_endpoint: `${base}/api/mcp/oauth/revoke`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'], revocation_endpoint_auth_methods_supported: ['none'], scopes_supported: ['read', 'write']
  });

  // ---- Consent screen ----
  async function consent({ req, res, method, url, json }) {
    const who = await access(req, res);
    const base = publicBase(req);
    if (method === 'GET') {
      const request = readRequest(Object.fromEntries(url.searchParams), base);
      const workspaces = (await listWorkspaces(who.agencyId)).filter(row => !who.accounts || who.accounts.includes(row.id));
      return json({ client: { name: request.client.name, host: request.redirect.host || request.redirect.protocol.replace(':', '') }, person: who.name, selected: request.workspace,
        workspaces: workspaces.map(({ id, name }) => ({ id, name })) });
    }
    const input = await payload(req);
    const request = readRequest(input.request, base);
    if (input.allow !== true) return json({ redirect: answerUrl(request, { error: 'access_denied' }) });
    const workspace = String(input.workspace || '');
    if (request.workspace && request.workspace !== workspace) throw error('O pedido é de outra subconta.', 400);
    if (!['read', 'write'].includes(input.access)) throw error('Escolha o que a IA pode fazer.', 400);
    await requireWorkspaceAccess(await loadAgency(who.agencyId), who, workspace, { hide: true });
    if (privateSpace.test(workspace)) throw error('O espaço pessoal não conecta IAs. Escolha uma subconta.', 400);
    const code = await changeAgency(who.agencyId, agency => openGrant(agency, request, { userId: who.userId || '', userName: who.name, workspace, access: input.access }));
    await recordAudit(who, 'MCP connected', request.client.name, `${workspace} · ${input.access}`);
    return json({ redirect: answerUrl(request, { code }) });
  }

  // ---- Connected AIs of one sub-account: each person sees their own; who manages the agency sees all. ----
  async function grants({ req, res, method, url, json }) {
    const workspace = url.searchParams.get('workspace') || '';
    const who = await workspaceAccess(req, res, workspace, { hide: true });
    const mine = grant => grant.workspace === workspace && (who.settings || grant.userId === (who.userId || ''));
    if (method === 'POST') {
      const { id } = await payload(req);
      const removed = await changeAgency(who.agencyId, agency => {
        const grant = (agency.mcpGrants || []).find(row => row.id === id && mine(row));
        if (!grant) throw error('Conexão não encontrada.', 404);
        agency.mcpGrants = agency.mcpGrants.filter(row => row !== grant);
        return grant.client;
      });
      await recordAudit(who, 'MCP revoked', removed, workspace);
    }
    const agency = await loadAgency(who.agencyId);
    return json({ grants: (agency.mcpGrants || []).filter(row => mine(row) && row.refreshHash && Date.parse(row.refreshExpires) > Date.now()).map(grantView) });
  }

  async function oauthRoute(p, { req, method, json }) {
    if (method !== 'POST') throw error('Método não permitido.', 405);
    try {
      if (p === '/api/mcp/oauth/register') return json(registerClient(await payload(req)), 201);
      if (p === '/api/mcp/oauth/token') return json(await exchange(await form(req)));
      await revoke((await form(req)).token);
      return json({});
    } catch (problem) {
      if (problem instanceof OAuthProblem) return json({ error: problem.code, error_description: problem.message }, 400);
      throw problem;
    }
  }

  return async function mcpRoute(ctx) {
    const { req, res, p, method, url, json, send, goTo } = ctx;
    const resource = p.match(resourcePath);
    if (resource) {
      const base = publicBase(req);
      return json({ resource: base + (resource[1] || '/api/mcp'), authorization_servers: [base], scopes_supported: ['read', 'write'], bearer_methods_supported: ['header'], resource_name: 'graao' });
    }
    if (serverPath.test(p)) return json(metadata(publicBase(req)));
    if (p === '/mcp/autorizar') {
      if (!localAccess && !auth?.hasSession(req)) {
        const search = new URLSearchParams(url.search); search.delete('__path');
        return goTo('/login?' + new URLSearchParams({ next: afterLogin(`/mcp/autorizar?${search}`) }));
      }
      return send(200, 'text/html; charset=utf-8', readFileSync(resolve(root, 'ui/mcp-autorizar.html')));
    }
    if (!p.startsWith('/api/mcp')) return NEXT_ROUTE;
    await ready;
    if (p === '/api/mcp/consent') return consent(ctx);
    if (p === '/api/mcp/grants') return grants(ctx);
    if (['/api/mcp/oauth/register', '/api/mcp/oauth/token', '/api/mcp/oauth/revoke'].includes(p)) return oauthRoute(p, ctx);
    const match = p.match(mcpPath);
    if (!match) return NEXT_ROUTE;
    if (method !== 'POST') {
      // Without a session there is no event stream to open; the plain GET stays as a status page.
      if (method === 'GET' && !String(req.headers.accept || '').includes('text/event-stream')) {
        return json({ ...mcpInfo, status: 'online', tools: mcpTools.map(tool => tool.name),
          catalog: mcpTools.map(({ name, title, description, module, access }) => ({ name, title, description, module, access })) });
      }
      res.setHeader('Allow', 'POST');
      throw error('Método não permitido.', 405);
    }
    const asked = match[1] || url.searchParams.get('workspace') || String(req.headers['x-workspace'] || '');
    try {
      if (asked || !req.headers.authorization && !auth) requireWorkspaceId(asked);
      const { who, workspace } = await caller(req, res, asked);
      const response = await handle(await payload(req), { workspace, who, request: { req, res } });
      return response ? json(response) : send(202, 'application/json; charset=utf-8', '');
    } catch (problem) {
      // The 401 tells an MCP client where to sign in.
      if (problem.status === 401) res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${publicBase(req)}/.well-known/oauth-protected-resource/api/mcp${match[1] ? `/${match[1]}` : ''}"`);
      throw problem;
    }
  };
}
