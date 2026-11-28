// Rotas das lojas: a vitrine pública (/loja/<subconta>/<loja>, com produto e carrinho) e a API da vitrine
// (/api/store/<subconta>/<loja>/<op>: orçamento, checkout, carrinho, recuperação, avaliação e produto visualizado).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { AGENCY_ID } from '../agency-model.mjs';
import { cartTokenHash } from '../checkout-model.mjs';
import { quoteOrder } from '../store-model.mjs';
import { catalog, methodLabel, storeCart, storeHome, storeProduct } from '../ui/store-data.js';
import { NEXT_ROUTE } from './next-route.mjs';

export function createStorePageRoutes(deps) {
  const {
    store, ready, error, publicAccountPolicy, publicPreview, storePath, withPixels
  } = deps;
  return async function storePageRoute({ req, res, p, method, url }) {
    // Stores: catalog, product page and cart. Totals always come from quoteOrder on the server.
    const storeRoute = p.match(storePath);
    if (storeRoute && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, storeId, cart, slug] = storeRoute;
      await publicAccountPolicy(workspace, false, 'sites');
      const state = await store.load(workspace);
      const shop = state.stores?.find(item => item.id === storeId);
      const preview = await publicPreview(req, res, url, workspace);
      if (!shop || (!shop.active && !preview)) throw error('Esta loja não está aberta.',404);
      const base = `/loja/${workspace}/${storeId}`;
      let body;
      if (cart) body = storeCart(state, shop, { base, workspace });
      else if (slug) { const item = catalog(state, shop).find(row => row.slug === slug); if (!item) throw error('Produto não encontrado.',404); body = storeProduct(state, shop, item, { base }); }
      else body = storeHome(state, shop, { base, category:String(url.searchParams.get('categoria') || '').slice(0,40), collection:String(url.searchParams.get('colecao') || '').slice(0,80) });
      const [storeHeaders, storeBody] = withPixels(state, workspace, { 'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store', 'Referrer-Policy':'strict-origin-when-cross-origin',
        'Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' https: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'" }, body);
      res.writeHead(200, storeHeaders);
      return res.end(method === 'HEAD' ? undefined : storeBody);
    }
    return NEXT_ROUTE;
  };
}

export function createStoreApiRoutes(deps) {
  const {
    store, ready, error, abacate, allowSign, allowTracking, allowPurchase = () => true, allowQuote = () => true, change, flushLater, payload, publicAccountPolicy, publicBase, storeApi
  } = deps;
  const clientIp = req => String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
  return async function storeApiRoute({ req, p, method, json }) {
    const storeCall = p.match(storeApi);
    if (storeCall) {
      await ready;
      if (method !== 'POST') throw error('Method not allowed.',405);
      const [, workspace, storeId, op] = storeCall;
      const input = await payload(req);
      await publicAccountPolicy(workspace, true, 'sites');
      await publicAccountPolicy(workspace, true, 'payments');
      if (op === 'cart') {
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
        if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.',429);
        return json((await change(workspace,{ type:'store-cart', id:storeId, data:{ session:input.session, name:input.name, email:input.email, phone:input.phone, items:input.items, coupon:input.coupon, delivery:input.delivery } })).id);
      }
      if (op === 'view') {
        // "Produto visualizado": the contact comes from the cart session on the server, never from the page.
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
        if (!allowTracking(ip)) throw error('Muitas visualizações a partir desta conexão. Aguarde alguns minutos.',429);
        const viewed = await change(workspace,{ type:'store-view', id:storeId, data:{ session:input.session, productId:input.productId } });
        if (viewed.state.workflowOutbox?.length) flushLater(workspace);
        return json({ tracked: Boolean(viewed.id?.tracked) });
      }
      if (op === 'review') {
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
        if (!allowSign(ip)) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.',429);
        return json((await change(workspace,{ type:'store-review', id:storeId, data:{ productId:input.productId, name:input.name, email:input.email, rating:input.rating, title:input.title, body:input.body, website:input.website } })).id,201);
      }
      if (op === 'restore') {
        const digest = cartTokenHash(input.token);
        if (!digest) throw error('Este link de recuperação não é válido.',404);
        return json((await change(workspace,{ type:'store-cart-restore', id:storeId, data:{ tokenHash:digest } })).id);
      }
      if (op === 'quote') {
        if (!allowQuote(clientIp(req))) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.',429);
        const state = await store.load(workspace);
        const shop = state.stores?.find(item => item.id === storeId && item.active);
        if (!shop) throw error('Esta loja não está aberta.',404);
        const { coupon_, giftCard_, ...quote } = quoteOrder(state, shop, input);
        return json(quote);
      }
      if (!allowPurchase(clientIp(req))) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.',429);
      const result = await change(workspace,{ type:'store-checkout', id:storeId, data:input });
      const order = result.state.orders.find(item => item.id === result.id), shop = result.state.stores.find(item => item.id === storeId);
      let payUrl = '';
      if (shop.payment.method === 'AbacatePay') {
        const origin = publicBase(req), back = `${origin}/loja/${workspace}/${storeId}`;
        payUrl = await abacate.chargeInvoice(result.state.agencyId || AGENCY_ID, workspace, order.invoiceId, origin, { returnUrl: back, completionUrl: back })
          .then(payment => payment.url).catch(() => '');
      }
      return json({ number:order.number, total:order.total, method:methodLabel[shop.payment.method] || shop.payment.method, instructions:shop.payment.instructions, thanks:shop.thanks, payUrl },201);
    }
    return NEXT_ROUTE;
  };
}
