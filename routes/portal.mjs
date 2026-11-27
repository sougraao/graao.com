// Rotas do portal de membros (área do cliente): API /api/client-portal/<workspace>/<operação>
// (entrada, cursos, progresso, comunidade, fidelidade, arquivos, push, ofertas) e as páginas do portal.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AGENCY_ID } from '../agency-model.mjs';
import { portalCookie } from '../client-portal.mjs';
import { loyaltyView } from '../loyalty-model.mjs';
import { pushSubscription } from '../web-push.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createPortalRoutes(deps) {
  const {
    store, auth, ready, root, error, portalApi, portalPage, abacate, change, clientPortal, community, flushLater, grantOffer, payload, publicAccountPolicy, publicBase, requireActiveAccount, workspaceAccess
  } = deps;
  return async function portalRoute({ req, res, p, method, url, id, json, send, proto }) {
    const portalMatch = p.match(portalApi);
    if (portalMatch) {
      const [, workspace, operation, courseId] = portalMatch;
      if (operation === 'offer-grant') {
        if (method !== 'POST' || !courseId) throw error('Método indisponível.',405);
        const who = await workspaceAccess(req, res, workspace, { modules: ['memberships'] });
        await requireActiveAccount(who.agencyId, workspace, true);
        const invoice = (await store.load(workspace)).invoices.find(row => row.id === courseId && row.offerId);
        if (!invoice) throw error('Venda não encontrada.',404);
        return json(await grantOffer(workspace, invoice.offerId, invoice.contactId, invoice.id));
      }
      if (operation !== 'community-admin' && Boolean(courseId) !== ['course','progress','community'].includes(operation)) throw error('Página do portal não encontrada.',404);
      if (operation === 'community-admin') {
        const who = await workspaceAccess(req, res, workspace, { modules: ['memberships'] });
        const input = method === 'POST' ? await payload(req) : null;
        await requireActiveAccount(who.agencyId, workspace, true);
        const state = await store.load(workspace);
        const days = [7, 30, 90, 365].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
        return json(await community.admin(workspace, state, await clientPortal.directory(workspace), courseId, input, { days }));
      }
      // Fidelidade: the member redeems a reward with their points (their contact is found by the portal access).
      // The client sends a file to the team (Arquivos, a note in Conversas and the workflow trigger).
      if (operation === 'push') {
        if (method !== 'POST') throw error('Método indisponível.',405);
        await publicAccountPolicy(workspace, true, 'memberships');
        const { member } = await clientPortal.session(workspace, portalCookie(req,res,workspace,undefined,proto === 'https'));
        const input = await payload(req), sub = pushSubscription(input.subscription);
        if (!sub) throw error('Inscrição de notificação inválida.',400);
        const state = await store.load(workspace);
        const contact = state.contacts.find(row => row.id === member.contactId) || state.contacts.find(row => (row.email || '').toLowerCase() === member.email);
        if (!contact) throw error('Contato não encontrado.',404);
        await change(workspace, { type: 'push-subscribe', data: { ...sub, kind: 'contact', contactId: contact.id } });
        return json({ ok: true }, 201);
      }
      if (operation === 'files') {
        await publicAccountPolicy(workspace, method === 'POST', 'memberships');
        const { member } = await clientPortal.session(workspace, portalCookie(req,res,workspace,undefined,proto === 'https'));
        const mine = st => { const contact = st.contacts.find(row => row.id === member.contactId) || st.contacts.find(row => (row.email || '').toLowerCase() === member.email);
          return (st.files || []).filter(row => row.source === 'portal' && contact && row.contactId === contact.id).slice(-20).reverse().map(row => ({ id: row.id, name: row.name, created: row.created })); };
        if (method === 'GET') return json({ files: mine(await store.load(workspace)) });
        if (method !== 'POST') throw error('Método indisponível.',405);
        const input = await payload(req);
        const result = await change(workspace, { type: 'portal-file', data: { contactId: member.contactId || '', email: member.email, name: member.name || '', fileName: String(input.name || ''), data: String(input.data || '') } });
        flushLater(workspace);
        return json({ files: mine(result.state) }, 201);
      }
      if (operation === 'loyalty') {
        if (method !== 'POST') throw error('Método indisponível.',405);
        const input = await payload(req);
        await publicAccountPolicy(workspace, true, 'memberships');
        const { member } = await clientPortal.session(workspace, portalCookie(req,res,workspace,undefined,proto === 'https'));
        const state = await store.load(workspace);
        const contact = state.contacts.find(row => row.id === member.contactId) || state.contacts.find(row => (row.email || '').toLowerCase() === member.email);
        if (!contact) throw error('Ainda não há pontos na sua conta.',409);
        const result = await change(workspace, { type: 'loyalty-redeem', data: { contactId: contact.id, rewardId: String(input.rewardId || '') } });
        flushLater(workspace);
        return json({ redeemed: result.id, loyalty: loyaltyView(result.state, contact.id) });
      }
      if (operation === 'community') {
        const input = method === 'POST' ? await payload(req) : null;
        await publicAccountPolicy(workspace, method === 'POST', 'memberships');
        const { doc, member } = await clientPortal.session(workspace, portalCookie(req,res,workspace,undefined,proto === 'https'));
        const state = await store.load(workspace);
        // Paid access to the community: an invoice for the chosen plan; access opens (or is extended) with the payment.
        if (input?.action === 'subscribe') {
          const { group, plan } = await community.reservePlan(workspace, state, member, courseId, String(input.planId || ''), input.answers);
          const agencyId = state.agencyId || AGENCY_ID;
          if (!(await abacate.connected(agencyId, workspace))) throw error('A assinatura desta comunidade ainda não está disponível. Fale com a equipe.',409);
          const invoiceId = (await change(workspace,{ type:'community-plan-invoice', id:group.id, data:{ planId:plan.id, email:member.email, name:member.name, contactId:member.contactId || '', memberId:member.id } })).id;
          const origin = publicBase(req), page = `${origin}/portal/${workspace}`;
          const payment = await abacate.chargeInvoice(agencyId, workspace, invoiceId, origin, { returnUrl:`${page}?plano=voltou`, completionUrl:`${page}?plano=pago` });
          await community.markPlanPending(workspace, courseId, member.id, invoiceId, input.answers);
          return json({ community: await community.read(workspace, await store.load(workspace), doc, member, courseId, {}), payUrl: payment.url });
        }
        // A paid event ticket: an invoice for the member, charged by AbacatePay; the seat comes with the payment.
        if (input?.action === 'ticket') {
          const event = await community.reserve(workspace, state, member, courseId, String(input.eventId || ''));
          const agencyId = state.agencyId || AGENCY_ID;
          if (!(await abacate.connected(agencyId, workspace))) throw error('A venda de ingressos ainda não está disponível. Fale com a equipe.',409);
          const invoiceId = (await change(workspace,{ type:'community-event-ticket', id:event.id, data:{ email:member.email, name:member.name, contactId:member.contactId || '', memberId:member.id } })).id;
          const origin = publicBase(req), page = `${origin}/portal/${workspace}`;
          const payment = await abacate.chargeInvoice(agencyId, workspace, invoiceId, origin, { returnUrl:`${page}?evento=voltou`, completionUrl:`${page}?evento=pago` });
          await community.markPending(workspace, courseId, event.id, member.id, invoiceId);
          return json({ community: await community.read(workspace, state, doc, member, courseId, {}), payUrl: payment.url });
        }
        const result = input ? await community.act(workspace, state, doc, member, courseId, input)
          : await community.read(workspace, state, doc, member, courseId, { channelId: String(url.searchParams.get('channel') || '').slice(0, 60), period: url.searchParams.get('period') || '30' });
        return json({ community: result });
      }
      if (operation === 'admin') {
        const who = await workspaceAccess(req, res, workspace, { modules: ['memberships'] });
        const input = method === 'POST' ? await payload(req) : null;
        await requireActiveAccount(who.agencyId, workspace, true);
        const state = await store.load(workspace);
        if (input?.action === 'staff-enter') {
          const staffUser = {
            email: who.session?.email || state.profile?.email || 'admin@graao.com',
            name: who.session?.user_metadata?.name || who.session?.name || state.profile?.name || 'Administrador',
            photo: who.session?.picture || who.session?.user_metadata?.avatar_url || ''
          };
          const result = await clientPortal.admin(workspace, state, { ...input, ...staffUser });
          if (result.memberId && state.communities?.length) {
            await community.enroll(workspace, result.memberId, state.communities.map(g => g.id));
          }
          return json(result);
        }
        return json(await clientPortal.admin(workspace, state, input));
      }
      const secure = proto === 'https';
      if (method === 'POST' && operation === 'admin-enter') {
        const who = await workspaceAccess(req, res, workspace, { modules: ['memberships'] });
        await requireActiveAccount(who.agencyId, workspace, true);
        const state = await store.load(workspace);
        const staffUser = {
          email: who.session?.email || state.profile?.email || 'admin@graao.com',
          name: who.session?.user_metadata?.name || who.session?.name || state.profile?.name || 'Administrador',
            photo: who.session?.picture || who.session?.user_metadata?.avatar_url || ''
        };
        const result = await clientPortal.admin(workspace, state, { action: 'staff-enter', ...staffUser });
        if (result.memberId && state.communities?.length) {
          await community.enroll(workspace, result.memberId, state.communities.map(g => g.id));
        }
        const session = await clientPortal.exchange(workspace, result.token, { staff: true });
        portalCookie(req, res, workspace, session, secure, { staff: true });
        return json({ ok: true });
      }
      if (method === 'POST' && operation === 'exchange') {
        const { token } = await payload(req);
        await publicAccountPolicy(workspace, true, 'memberships');
        const session = await clientPortal.exchange(workspace, token);
        portalCookie(req, res, workspace, session, secure);
        return json({ ok:true });
      }
      if (method === 'POST' && operation === 'logout') {
        await clientPortal.signOut(workspace, portalCookie(req,res,workspace,undefined,secure));
        portalCookie(req,res,workspace,'',secure);
        return json({ ok:true });
      }
      if (method === 'POST' && operation === 'progress') {
        const input = await payload(req);
        await publicAccountPolicy(workspace, true, 'memberships');
        const state = await store.load(workspace);
        return json(await clientPortal.progress(workspace, state, portalCookie(req,res,workspace,undefined,secure), courseId, input));
      }
      if (method === 'POST' || !['home','course'].includes(operation)) throw error('Método indisponível.',405);
      const active = await publicAccountPolicy(workspace, false, 'memberships');
      const state = await store.load(workspace);
      const lessonId = String(url.searchParams.get('lesson') || '').slice(0, 60);
      let page = await clientPortal.content(workspace, state, portalCookie(req,res,workspace,undefined,secure), courseId, lessonId, { track: active });
      if (operation === 'home' && !page.signedIn && auth?.hasSession(req)) {
        try {
          const who = await workspaceAccess(req, res, workspace, { modules: ['memberships'], hide: true });
          const staffUser = {
            email: who.session?.email || state.profile?.email || 'admin@graao.com',
            name: who.session?.user_metadata?.name || who.session?.name || state.profile?.name || 'Administrador',
            photo: who.session?.picture || who.session?.user_metadata?.avatar_url || ''
          };
          const result = await clientPortal.admin(workspace, state, { action: 'staff-enter', ...staffUser });
          if (result.memberId && state.communities?.length) {
            await community.enroll(workspace, result.memberId, state.communities.map(g => g.id));
          }
          const session = await clientPortal.exchange(workspace, result.token, { staff: true });
          portalCookie(req, res, workspace, session, secure, { staff: true });
          page = await clientPortal.content(workspace, state, session, courseId, lessonId, { track: active });
        } catch {}
      }
      if (operation === 'home' && page.signedIn) {
        const { member } = await clientPortal.session(workspace, portalCookie(req,res,workspace,undefined,secure));
        page.communities = await community.home(workspace, state, member);
        const contact = state.contacts.find(row => row.id === member.contactId) || state.contacts.find(row => (row.email || '').toLowerCase() === member.email);
        page.loyalty = loyaltyView(state, contact?.id || '');
        page.files = (state.files || []).filter(row => row.source === 'portal' && contact && row.contactId === contact.id).slice(-20).reverse().map(row => ({ id: row.id, name: row.name, created: row.created }));
      }
      return json(page);
    }
    const portal = p.match(portalPage);
    if (portal && method !== 'POST') {
      await ready;
      await publicAccountPolicy(portal[1], false, 'memberships');
      res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; media-src 'self' data: https:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.loom.com; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; form-action 'self'");
      return send(200,'text/html; charset=utf-8',method==='HEAD' ? undefined : readFileSync(resolve(root,'ui','client-portal.html')));
    }
    return NEXT_ROUTE;
  };
}
