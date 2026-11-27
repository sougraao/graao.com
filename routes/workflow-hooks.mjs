// Webhook de entrada das automações (/hooks/<subconta>/<automação>/<gatilho>): um sistema de fora dispara o gatilho
// "inbound_webhook" de uma automação ativa, com a chave em ?key= ou no cabeçalho x-graao-key.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { timingSafeEqual } from 'node:crypto';
import { NEXT_ROUTE } from './next-route.mjs';

export function createWorkflowHookRoutes(deps) {
  const { store, ready, error, workspaceSegment, change, flushLater, payload, publicAccountPolicy } = deps;
  const hookPath = new RegExp(`^/hooks/${workspaceSegment}/([0-9a-f-]{36})/([a-z0-9]{6,40})$`, 'i');
  return async function workflowHookRoutes({ req, p, method, url, json }) {
    const hook = p.match(hookPath);
    if (hook && method === 'POST') {
      await ready;
      const [, workspace, workflowId, triggerId] = hook;
      const state = await Promise.resolve().then(() => store.load(workspace)).catch(() => null);
      const flow = state?.workflows?.find(row => row.id === workflowId && row.active);
      const secret = flow?.triggers?.find(t => t.id === triggerId && t.type === 'inbound_webhook')?.config?.secret || '';
      const key = String(url.searchParams.get('key') || req.headers['x-graao-key'] || '');
      if (!secret || key.length !== secret.length || !timingSafeEqual(Buffer.from(key), Buffer.from(secret))) throw error('Webhook não encontrado.', 404);
      await publicAccountPolicy(workspace, true, 'automation');
      const body = await payload(req).catch(() => ({}));
      const result = await change(workspace, { type: 'workflow-hook', data: { workflowId, triggerId, payload: body && typeof body === 'object' && !Array.isArray(body) ? body : {} } });
      if (result.state.workflowOutbox?.length) flushLater(workspace);
      return json({ ok: true, run: result.id === 'already-enrolled' ? null : result.id }, 202);
    }
    return NEXT_ROUTE;
  };
}
