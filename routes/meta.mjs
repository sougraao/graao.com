// Webhook da Meta (/api/meta/webhook): a verificação da Meta (GET) e, assinados com o segredo do app (POST), as mensagens
// do Messenger e do Direct das páginas conectadas e os leads do Lead Ads, cada um entregue à subconta dona da página.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { metaLeadFields } from '../lead-forms.mjs';
import { fetchMetaLead, metaComments, metaInbound, metaLeads, metaSenderName, metaSignatureValid } from '../meta-messaging.mjs';
import { execute } from '../model.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createMetaRoutes(deps) {
  const {
    store, ready, error, change, flushLater, metaFetch, metaRoutesRow, metaSender, publicAccountPolicy
  } = deps;
  return async function metaRoute({ req, p, method, url, json, send }) {
    // Messenger and Direct: Meta's verification (GET) and the messages of the connected pages (POST, signed).
    if (p === '/api/meta/webhook') {
      await ready;
      if (method === 'GET') {
        const verify = process.env.META_WEBHOOK_VERIFY_TOKEN || '';
        if (!verify || url.searchParams.get('hub.mode') !== 'subscribe' || url.searchParams.get('hub.verify_token') !== verify) throw error('Forbidden.', 403);
        return send(200, 'text/plain; charset=utf-8', String(url.searchParams.get('hub.challenge') || '').slice(0, 200));
      }
      if (method !== 'POST') throw error('Method not allowed.', 405);
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > 1_000_000) throw error('Payload too large.', 413); chunks.push(chunk); }
      const raw = Buffer.concat(chunks);
      if (!metaSignatureValid(raw, req.headers['x-hub-signature-256'], process.env.META_APP_SECRET || '')) throw error('Invalid signature.', 401);
      let body;
      try { body = JSON.parse(raw.toString('utf8')); } catch { throw error('Invalid JSON.', 400); }
      const routes = (await metaRoutesRow()).routes || {};
      const touched = new Set();
      for (const message of metaInbound(body)) {
        const route = routes[message.accountId];
        if (!route || route.network !== message.network) continue;
        try {
          if (!await publicAccountPolicy(route.workspace, false, 'conversations')) continue;
          const state = await store.load(route.workspace);
          const key = `${message.network}:${message.accountId}`;
          const known = (state.contacts || []).some(row => row.metaIds?.[key] === message.senderId);
          const sender = known ? null : await metaSender(route.workspace, state, key);
          const authorName = sender ? await metaSenderName({ token: sender.token, senderId: message.senderId, network: message.network }, metaFetch) : '';
          await change(route.workspace, { type: 'social-interaction-trigger', data: { kind: 'dm', network: message.network, body: message.body, senderId: message.senderId, accountId: message.accountId, mid: message.mid, authorName } });
          touched.add(route.workspace);
        } catch (problem) { console.error(`Meta webhook (${route.workspace}): ${problem.message}`); }
      }
      // Public comments are recorded in Conversas and trigger social_comment_received workflows.
      for (const comment of metaComments(body)) {
        const route = routes[comment.accountId];
        if (!route || route.network !== comment.network) continue;
        try {
          if (!await publicAccountPolicy(route.workspace, false, 'conversations')) continue;
          await change(route.workspace, { type: 'social-interaction-trigger', data: { kind: 'comment', network: comment.network, body: comment.body, comment: comment.body,
            senderId: comment.senderId, accountId: comment.accountId, commentId: comment.commentId, mediaId: comment.mediaId, parentId: comment.parentId,
            mid: comment.commentId, authorName: comment.authorName, handle: comment.handle } });
          touched.add(route.workspace);
        } catch (problem) { console.error(`Meta comment (${route.workspace}): ${problem.message}`); }
      }
      // Lead Ads: the lead's answers are read with the page token, then become a contact and the trigger.
      for (const lead of metaLeads(body)) {
        const route = routes[lead.pageId];
        if (!route || route.network !== 'facebook') continue;
        try {
          if (!await publicAccountPolicy(route.workspace, false, 'marketing')) continue;
          const state = await store.load(route.workspace);
          const sender = await metaSender(route.workspace, state, `facebook:${lead.pageId}`);
          if (!sender) continue;
          const found = await fetchMetaLead({ token: sender.token, leadgenId: lead.leadgenId, formId: lead.formId }, metaFetch);
          const touch = found.lead.is_organic ? null : { source: 'facebook', medium: 'paid_social', campaign: String(found.lead.campaign_name || ''), at: new Date().toISOString(), channel: 'meta_ads' };
          await store.change(route.workspace, s => execute(s, { type: 'ad-form-lead', data: { network: 'meta', leadId: lead.leadgenId, formId: String(found.lead.form_id || lead.formId),
            formName: found.formName, campaign: String(found.lead.campaign_name || ''), campaignId: String(found.lead.campaign_id || ''), fields: metaLeadFields(found.lead) } },
            { workspace: route.workspace, ...(touch ? { attribution: { first: touch, last: touch } } : {}) }));
          touched.add(route.workspace);
        } catch (problem) { console.error(`Meta lead (${route.workspace}): ${problem.message}`); }
      }
      for (const workspace of touched) flushLater(workspace);
      return json({ ok: true });
    }
    return NEXT_ROUTE;
  };
}
