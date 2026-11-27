// Rotas de anúncios (Meta Ads e Google Ads): retorno do login OAuth em /api/ads/callback e as operações da subconta
// em /api/ads/workspace/<op> (conectar, escolher conta, sincronizar, criar e alterar campanhas, desconectar).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { adSettingsOf, markAdConnection, metaAdInput, patchAdCampaign } from '../ads-model.mjs';
import { adsAuthUrl, adsExchange, createMetaAd, setCampaignBudget, setCampaignStatus } from '../ads-providers.mjs';
import { workspaceView } from '../authorization.mjs';
import { uid } from '../model.mjs';
import { seal } from '../social-providers.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createAdsRoutes(deps) {
  const {
    store, localAccess, error, spaceId, privateSpace, stamp, adsAccess, adsCallbackPath, adsPopup, adsView, payload, publicBase, recordAudit, runAds, socialActor, socialRow, workspaceAccess
  } = deps;
  return async function adsRoute({ req, res, p, method, url, id, json, send }) {
    // Anúncios: OAuth of Meta Ads / Google Ads, account choice, sync, campaign changes and Meta ad creation.
    if (p === adsCallbackPath && method === 'GET') {
      const base = publicBase(req);
      res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
      try {
        await socialRow('ads-oauth');
        const nonce = url.searchParams.get('state') || '';
        const pending = await store.change('ads-oauth', row => { const v = row.states[nonce]; delete row.states[nonce]; return v; });
        if (!pending || Date.parse(pending.at) < Date.now() - 15 * 60_000) throw error('Este login expirou. Tente conectar de novo.',400);
        if (localAccess && pending.actor !== 'local-owner') req.localSocialUser = pending.actor;
        const who = await workspaceAccess(req, res, pending.workspace, { modules: ['marketing'] });
        if (pending.actor !== socialActor(who)) throw error('Esta autorização pertence a outra sessão.',403);
        if (url.searchParams.get('error')) throw error('A autorização foi cancelada.',400);
        const network = pending.network, label = network === 'meta' ? 'Meta Ads' : 'Google Ads';
        const found = await adsExchange(network, { code: url.searchParams.get('code') || '', redirectUri: base + adsCallbackPath });
        const rowId = `ads-${pending.workspace}`;
        await socialRow(rowId);
        const accountId = await store.change(rowId, row => {
          const prior = row[network] || {};
          const keep = (list, value) => list.some(item => item.id === value) ? value : '';
          row[network] = { token: seal(found.secret), user: found.user, accounts: found.accounts, pages: found.pages || [], connectedAt: stamp(),
            accountId: keep(found.accounts, prior.accountId) || (found.accounts.length === 1 ? found.accounts[0].id : ''),
            pageId: keep(found.pages || [], prior.pageId) || (found.pages?.length === 1 ? found.pages[0].id : '') };
          return row[network].accountId;
        });
        await store.change(pending.workspace, s => markAdConnection(s, network, true));
        await recordAudit(who, `${label} conectado`, found.user || pending.workspace).catch(() => {});
        if (accountId) runAds(pending.workspace, network, { full: true }).catch(() => {});
        return send(200,'text/html; charset=utf-8',adsPopup(base, { network }));
      } catch (e) {
        return send(200,'text/html; charset=utf-8',adsPopup(base, { error: e.message }));
      }
    }
    if (p.startsWith('/api/ads/workspace/')) {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.', 404);
      const op = p.slice('/api/ads/workspace/'.length).replace(/\/+$/, '');
      const who = await workspaceAccess(req, res, id, { modules: ['marketing'] });
      const rowId = `ads-${id}`;
      if (op === 'connect' && method === 'GET') {
        const network = url.searchParams.get('network');
        if (!['meta', 'google'].includes(network)) throw error('Escolha a rede de anúncios.', 400);
        const nonce = uid();
        const target = adsAuthUrl(network, { redirectUri: publicBase(req) + adsCallbackPath, state: nonce });
        await socialRow('ads-oauth');
        await store.change('ads-oauth', row => {
          for (const [k, v] of Object.entries(row.states)) if (Date.parse(v.at) < Date.now() - 15 * 60_000) delete row.states[k];
          row.states[nonce] = { workspace: id, network, at: stamp(), actor: socialActor(who) };
        });
        res.writeHead(302, { Location: target }); return res.end();
      }
      if (op === 'status' && method === 'GET') return json(adsView(await socialRow(rowId)));
      if (method !== 'POST') throw error('Method not allowed.', 405);
      const body = await payload(req);
      const net = ['meta', 'google'].includes(body.network) ? body.network : null;
      if (!net) throw error('Escolha a rede de anúncios.', 400);
      const label = net === 'meta' ? 'Meta Ads' : 'Google Ads';
      const reply = async extra => json({ ...workspaceView(who, await store.load(id)), ads: adsView(await socialRow(rowId)), ...extra });
      if (op === 'select') {
        await socialRow(rowId);
        const changed = await store.change(rowId, row => {
          const a = row[net];
          if (!a?.token) throw error(`Conecte o ${label} primeiro.`, 409);
          let moved = false;
          if (body.accountId !== undefined) {
            if (!a.accounts.some(item => item.id === body.accountId)) throw error('Escolha uma conta de anúncios desta conexão.', 400);
            moved = a.accountId !== body.accountId; a.accountId = body.accountId;
          }
          if (body.pageId !== undefined) {
            if (body.pageId && !(a.pages || []).some(item => item.id === body.pageId)) throw error('Escolha uma Página desta conexão.', 400);
            a.pageId = body.pageId;
          }
          return moved;
        });
        if (changed) {
          // Another ad account: its numbers replace the old account's.
          await store.change(id, s => { s.adCampaigns = (s.adCampaigns || []).filter(c => c.network !== net); s.adStats = (s.adStats || []).filter(r => r.network !== net); delete adSettingsOf(s).lastSync[net]; });
          const synced = await runAds(id, net, { full: true }).then(() => '', e => e.message);
          return reply({ syncError: synced });
        }
        return reply({});
      }
      if (op === 'sync') return reply({ synced: await runAds(id, net, { full: body.full === true }) });
      if (op === 'campaign') {
        const camp = (await store.load(id)).adCampaigns?.find(c => c.network === net && c.id === String(body.id || ''));
        if (!camp) throw error('Campanha não encontrada. Sincronize de novo.', 404);
        const { secret, account } = await adsAccess(id, net);
        if (body.action === 'pause' || body.action === 'activate') {
          const on = body.action === 'activate';
          await setCampaignStatus(net, secret, account, camp.id, on);
          await store.change(id, s => patchAdCampaign(s, net, camp.id, { status: on ? 'active' : 'paused', rawStatus: on ? (net === 'meta' ? 'ACTIVE' : 'ENABLED') : 'PAUSED' }));
          await recordAudit(who, `Campanha ${on ? 'ativada' : 'pausada'} (${label})`, camp.name).catch(() => {});
        } else if (body.action === 'budget') {
          await setCampaignBudget(net, secret, account, camp, body.budget);
          await store.change(id, s => patchAdCampaign(s, net, camp.id, { budget: Math.round(Number(body.budget) * 100) / 100 }));
          await recordAudit(who, `Orçamento da campanha alterado (${label})`, `${camp.name}: ${body.budget}`).catch(() => {});
        } else throw error('Ação inválida.', 400);
        return reply({});
      }
      if (op === 'create') {
        if (net !== 'meta') throw error('A criação de anúncios pelo Graao está disponível para o Meta Ads.', 400);
        const { ad, image } = metaAdInput(await store.load(id), body);
        const { secret, account, page } = await adsAccess(id, 'meta');
        if (!page) throw error('Escolha a Página do Facebook que vai assinar o anúncio.', 409);
        const created = await createMetaAd(secret, account, page, ad, image);
        await recordAudit(who, 'Anúncio criado no Meta Ads (pausado)', ad.name).catch(() => {});
        await runAds(id, 'meta').catch(() => null);
        return reply({ created });
      }
      if (op === 'disconnect') {
        await socialRow(rowId);
        await store.change(rowId, row => { delete row[net]; });
        await store.change(id, s => markAdConnection(s, net, false));
        await recordAudit(who, `${label} desconectado`, id).catch(() => {});
        return reply({});
      }
      throw error('Not found.', 404);
    }
    return NEXT_ROUTE;
  };
}
