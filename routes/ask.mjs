// Pergunte à Graao (/api/ask/...): a conversa da agência com a IA sobre as subcontas.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { requireCapability } from '../authorization.mjs';
import { agencyOverview } from '../agency-model.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createAskRoutes(deps) {
  const { accessContext, verifiedUser, handleAsk, listWorkspaces, ensureAccounts, agencyWorkspaceViews, publicAgency, abacate } = deps;
  return async function askRoutes({ req, res, p, method, url, json }) {
    if (p.startsWith('/api/ask/')) {
      const { agency, who } = await accessContext(req, await verifiedUser(req, res));
      requireCapability(who, 'agency', 'Seu usuário não pode acessar o Pergunte à Graao.');
      return await handleAsk({
        req, res, url, method, who, json,
        loadContext: async () => {
          const workspaces = await listWorkspaces(who.agencyId);
          ensureAccounts(agency, workspaces);
          const states = await agencyWorkspaceViews(agency, who, workspaces);
          return { agency: { ...publicAgency(agency, who), abacatepay: { connected: await abacate.connected(who.agencyId, abacate.AGENCY_SCOPE) } }, overview: agencyOverview(agency, states) };
        }
      });
    }
    return NEXT_ROUTE;
  };
}
