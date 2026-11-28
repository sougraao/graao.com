// Rotas públicas dos links de pagamento: a página (/pagar/<subconta>/<link>) e a compra
// (/api/pagar/<subconta>/<link>), que abre a fatura e devolve a cobrança da AbacatePay. Mesmo desenho das ofertas.
import { AGENCY_ID } from '../agency-model.mjs';
import { paymentLinkCsp, paymentLinkPath, renderPaymentLinkPage, sellableLink } from '../payment-link.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createPaymentLinkRoutes(deps) {
  const { store, ready, error, workspaceSegment, abacate, allowPurchase = () => true, change, payload, publicAccountPolicy, publicBase, clientPortal, withPixels } = deps;
  const pagePath = new RegExp(`^/pagar/${workspaceSegment}/([0-9a-f-]{36})/?$`);
  const apiPath = new RegExp(`^/api/pagar/${workspaceSegment}/([0-9a-f-]{36})$`);
  const sellable = (state, linkId) => {
    try { return sellableLink(state, linkId); } catch (failure) { throw error(failure.message, failure.status || 400); }
  };
  return async function paymentLinkRoutes({ req, res, p, method, url, json }) {
    const page = p.match(pagePath);
    if (page && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, linkId] = page;
      await publicAccountPolicy(workspace, false, 'payments');
      const state = await store.load(workspace);
      const sale = sellable(state, linkId);
      const color = (await clientPortal.directory(workspace)).settings?.color || '';
      const status = ['pago', 'voltou'].includes(url.searchParams.get('status')) ? url.searchParams.get('status') : '';
      const [headers, body] = withPixels(state, workspace, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': paymentLinkCsp },
        renderPaymentLinkPage(state, sale, { workspace, status, color }));
      res.writeHead(200, headers);
      return res.end(method === 'HEAD' ? undefined : body);
    }
    const api = p.match(apiPath);
    if (api) {
      await ready;
      if (method !== 'POST') throw error('Method not allowed.', 405);
      const [, workspace, linkId] = api;
      // Cada compra abre fatura, contato e cobrança na AbacatePay: no máximo 20 por conexão a cada 10 minutos.
      const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
      if (!allowPurchase(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.', 429);
      const input = await payload(req);
      await publicAccountPolicy(workspace, true, 'payments');
      const current = await store.load(workspace);
      sellable(current, linkId);
      const agencyId = current.agencyId || AGENCY_ID;
      if (!(await abacate.connected(agencyId, workspace))) throw error('O pagamento online deste link ainda não está disponível. Fale com a equipe.', 409);
      const result = await change(workspace, { type: 'payment-link-checkout', id: linkId, data: { name: input.name, email: input.email } });
      const origin = publicBase(req), back = `${origin}${paymentLinkPath(workspace, linkId)}`;
      const payment = await abacate.chargeInvoice(agencyId, workspace, result.id, origin, { returnUrl: `${back}?status=voltou`, completionUrl: `${back}?status=pago` });
      return json({ payUrl: payment.url });
    }
    return NEXT_ROUTE;
  };
}
