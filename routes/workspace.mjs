// Subconta: o estado que o app carrega ao abrir (/api/state) e o teste de um workflow em rascunho numa cópia da
// subconta, sem gravar nem enviar nada (/api/workflow-test).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no fechamento
// de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { agencyForWorkspace, blankAgency } from '../agency-model.mjs';
import { hasModule, workspaceView } from '../authorization.mjs';
import { execute } from '../model.mjs';
import { availability } from '../social-providers.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createWorkspaceRoutes(deps) {
  const { store, error, spaceId, privateSpace, accessContext, verifiedUser, requireWorkspaceAccess, visibleWorkspaces, workspaceAccess, payload, openAI, writeAudit, localAccess, contentAI, reportMail, agentModel } = deps;
  return async function workspaceRoutes({ req, res, p, method, id, json }) {
    if (p==='/api/state' && method!=='POST') {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
      const { agency, who: actor } = await accessContext(req,await verifiedUser(req,res));
      const isPersonal = privateSpace.test(id);
      const who = await requireWorkspaceAccess(agency, actor, id, { support: true });
      const studio = hasModule(who, 'sites'), agents = hasModule(who, 'ai-agents'), marketing = hasModule(who, 'marketing'), reputation = hasModule(who, 'reputation');
      const [state, workspaces, aiStatus] = await Promise.all([
        store.load(id), visibleWorkspaces(who), !who.support && (studio || agents || marketing || reputation) ? openAI.status(who.session) : null
      ]);
      // Sem chave, as ações de texto dos fluxos usam a IA gratuita do graao quando o dono da plataforma a liberou.
      const freeAI = Boolean(aiStatus && !aiStatus.configured && await openAI.platformAvailable?.());
      if (who.support) await writeAudit(who, 'Sub-account support viewed', id, who.account.status);
      return json({ ...workspaceView(who, state), workspaces,
        ...(!isPersonal && hasModule(who, 'settings') && agency.accounts[id]?.billing?.status === 'PastDue' && { billingNotice: 'past_due' }),
        features:{studioAI: Boolean(aiStatus?.configured && studio), socialAI: Boolean(aiStatus?.configured && marketing), contentAI: Boolean((aiStatus?.configured || (localAccess && contentAI)) && (marketing || studio)), reviewAI: Boolean((aiStatus?.configured || (localAccess && contentAI)) && reputation), reportEmail: reportMail.configured, freeAI, social: marketing ? availability() : {}, agentModel: aiStatus?.configured && agents ? agentModel : ''},
        agency:agencyForWorkspace(isPersonal ? blankAgency() : agency,id,who.settings),
        ...(who.support && { account: { ...who.account, support: true, statusHistory: agency.accounts[id]?.statusHistory || [],
          ignoredWebhooks: agency.accounts[id]?.ignoredWebhooks || {} } }),
        access:{agency:who.agency,modules:who.modules,name:who.name,session:who.session}});
    }
    // Dry run of a workflow draft for one contact, on a copy of the workspace: nothing is saved or sent.
    if (p==='/api/workflow-test' && method==='POST') {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
      const body = await payload(req);
      await workspaceAccess(req, res, id, { modules: ['automation'] });
      const copy = structuredClone(await store.load(id));
      return json({ result: execute(copy, { type: 'workflow-test', data: body }) });
    }
    return NEXT_ROUTE;
  };
}
