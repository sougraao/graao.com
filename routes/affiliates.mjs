// Rotas públicas do programa de afiliados: o link de indicação (/r/<subconta>/<código>[/<campanha>], que grava o
// cookie do primeiro toque), a página de cadastro e o painel privado do afiliado (/afiliados/<subconta>[/<token>])
// e a API de cadastro (/api/afiliados/<subconta>/signup).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { affiliatePortal, portalTokenHash } from '../affiliate-model.mjs';
import { affiliatePageCsp, renderPortal, renderSignup } from '../affiliate-page.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

const affiliateCookie = workspace => `graao_af_${workspace.replace(/[^\w-]/g, '')}`;

export function createAffiliateRoutes(deps) {
  const { store, ready, error, workspaceSegment, allowSign, change, flushLater, payload, publicAccountPolicy, publicBase, referralsOf } = deps;
  const affiliateLink = new RegExp(`^/r/${workspaceSegment}/([a-z0-9]{3,20})(?:/([0-9a-f-]{36}))?/?$`);
  const affiliatePagePath = new RegExp(`^/afiliados/${workspaceSegment}(?:/([0-9a-f]{48}))?/?$`);
  const affiliateSignupApi = new RegExp(`^/api/afiliados/${workspaceSegment}/signup$`);
  return async function affiliateRoutes({ req, res, p, method, json }) {
    // Affiliates: the referral link, the program sign-up and the affiliate's private dashboard.
    const referral = p.match(affiliateLink);
    if (referral && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, code, campaignId = ''] = referral;
      await publicAccountPolicy(workspace, false, 'marketing');
      const clicked = method === 'GET' ? (await change(workspace, { type: 'affiliate-click', data: { code, campaignId } })).id : null;
      if (!clicked) throw error('Este link de afiliado não está ativo.', 404);
      const cookie = affiliateCookie(workspace);
      const current = referralsOf(req)[workspace];
      const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer',
        Location: clicked.destination.startsWith('/') ? publicBase(req) + clicked.destination : clicked.destination };
      // First touch: an earlier referral keeps its credit while it is still valid.
      if (!current || Date.now() - current.at > clicked.cookieDays * 864e5) {
        const secure = String(req.headers['x-forwarded-proto'] || '').includes('https') || publicBase(req).startsWith('https') ? '; Secure' : '';
        headers['Set-Cookie'] = [...[res.getHeader('Set-Cookie') || []].flat(), `${cookie}=${encodeURIComponent(`${clicked.affiliateId}.${clicked.campaignId}.${Date.now()}`)}; Max-Age=${clicked.cookieDays * 86400}; Path=/; HttpOnly; SameSite=Lax${secure}`];
      }
      res.writeHead(302, headers);
      return res.end();
    }
    const affiliatePage = p.match(affiliatePagePath);
    if (affiliatePage && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, token = ''] = affiliatePage;
      await publicAccountPolicy(workspace, false, 'marketing');
      const state = await store.load(workspace);
      let page;
      if (token) {
        const portal = affiliatePortal(state, portalTokenHash(token));
        if (!portal) throw error('Este link de painel não é válido. Peça um novo à empresa.', 404);
        page = renderPortal(state, portal, { workspace, origin: publicBase(req) });
      } else page = renderSignup(state, { workspace });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': affiliatePageCsp, 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
      return res.end(method === 'HEAD' ? undefined : page);
    }
    const affiliateJoin = p.match(affiliateSignupApi);
    if (affiliateJoin && method === 'POST') {
      await ready;
      const [, workspace] = affiliateJoin;
      await publicAccountPolicy(workspace, true, 'marketing');
      const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
      if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.', 429);
      const input = await payload(req);
      const result = (await change(workspace, { type: 'affiliate-signup', data: { name: input.name, email: input.email, phone: input.phone, pix: input.pix, terms: input.terms === true, website: input.website } })).id;
      flushLater(workspace);
      return json(result.token ? { ok: true, approval: result.status, portal: `/afiliados/${workspace}/${result.token}` } : { ok: true }, 201);
    }
    return NEXT_ROUTE;
  };
}
