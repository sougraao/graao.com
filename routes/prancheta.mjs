// Rotas da Prancheta (editor de arte da agência e das subcontas): /api/prancheta/<ação> para listar,
// salvar, duplicar, apagar e importar arquivos e para os modelos prontos.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { executeAgency } from '../agency-model.mjs';
import { requireCapability } from '../authorization.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createPranchetaRoutes(deps) {
  const {
    store, error, access, change, changeAgency, loadAgency, payload, requireActiveAccount, workspaceAccess
  } = deps;
  return async function pranchetaRoute({ req, res, p, method, url, id, json, send }) {
    if (p.startsWith('/api/prancheta/')) {
      const isAgencyTarget = id === 'agency' || !id;
      const who = isAgencyTarget
        ? await access(req, res)
        : await workspaceAccess(req, res, id, { modules: ['marketing'] });
      if (isAgencyTarget) {
        requireCapability(who, 'agency', 'Seu usuário não pode abrir a visualização da agência.');
      } else {
        await requireActiveAccount(who.agencyId, id, true);
      }
      const action = p.slice('/api/prancheta/'.length);
      const formatPranchetaMeta = (f) => ({
        id: f.id,
        name: f.name,
        size_bytes: f.size_bytes || (f.document ? JSON.stringify(f.document).length : JSON.stringify(f).length),
        thumbnail: f.thumbnail || null,
        created_at: f.created_at || f.created,
        updated_at: f.updated_at || f.updated || f.created,
        format: f.format || 'custom',
        width: f.width || 1080,
        height: f.height || 1080,
        pages: f.pages || []
      });

      const loadTarget = async () => isAgencyTarget ? loadAgency(who.agencyId) : store.load(id);
      const changeTarget = async (cmd) => {
        if (isAgencyTarget) {
          return changeAgency(who.agencyId, a => executeAgency(a, cmd, { actor: who.name }));
        }
        const res = await change(id, cmd);
        return res.id;
      };

      if (action === 'files') {
        if (method === 'GET') {
          const state = await loadTarget();
          const raw = state.pranchetaFiles || [];
          return json({ files: raw.map(formatPranchetaMeta) });
        }
        if (method === 'POST') {
          const input = await payload(req);
          const savedId = await changeTarget({ type: 'prancheta-save', data: input, id: input.id });
          const state = await loadTarget();
          const raw = state.pranchetaFiles || [];
          return json({ id: savedId, files: raw.map(formatPranchetaMeta) });
        }
      }
      if (action === 'file') {
        const fileId = url.searchParams.get('id') || url.searchParams.get('fileId');
        const state = await loadTarget();
        const raw = state.pranchetaFiles || [];
        const found = raw.find(f => f.id === fileId);
        if (method === 'GET') {
          if (!found) throw error('Arquivo da prancheta não encontrado.', 404);
          const { graaoToDocument } = await import('../prancheta-model.mjs');
          const document = found.document || graaoToDocument(found);
          return json({
            ...formatPranchetaMeta(found),
            document
          });
        }
        if (method === 'POST') {
          const input = await payload(req);
          const targetId = input.id || fileId;
          const savedId = await changeTarget({ type: 'prancheta-save', data: input, id: targetId });
          const nextState = await loadTarget();
          const nextFound = (nextState.pranchetaFiles || []).find(f => f.id === savedId);
          return json({ id: savedId, file: nextFound ? formatPranchetaMeta(nextFound) : null });
        }
      }
      if (action === 'save' && method === 'POST') {
        const input = await payload(req);
        const savedId = await changeTarget({ type: 'prancheta-save', data: input, id: input.id });
        const state = await loadTarget();
        const raw = state.pranchetaFiles || [];
        const found = raw.find(f => f.id === savedId);
        return json({ id: savedId, file: found ? formatPranchetaMeta(found) : null, files: raw.map(formatPranchetaMeta) });
      }
      if (action === 'templates' && method === 'GET') {
        const { createCanonicalTemplates, pranchetaPresets } = await import('../prancheta-model.mjs');
        return json({ templates: createCanonicalTemplates(), presets: pranchetaPresets });
      }
      if (action === 'template-use' && method === 'POST') {
        const input = await payload(req);
        const savedId = await changeTarget({ type: 'prancheta-template', data: input });
        const state = await loadTarget();
        return json({ id: savedId, files: state.pranchetaFiles || [] }, 201);
      }
      if (action === 'delete' && method === 'POST') {
        const input = await payload(req);
        await changeTarget({ type: 'prancheta-delete', id: input.id });
        const state = await loadTarget();
        return json({ ok: true, files: state.pranchetaFiles || [] });
      }
      if (action === 'duplicate' && method === 'POST') {
        const input = await payload(req);
        const copyId = await changeTarget({ type: 'prancheta-duplicate', id: input.id });
        const state = await loadTarget();
        return json({ id: copyId, files: state.pranchetaFiles || [] }, 201);
      }
      if (action === 'export-media' && method === 'POST') {
        const input = await payload(req);
        const fileId = await changeTarget({ type: 'prancheta-export-media', id: input.id, data: input });
        const state = await loadTarget();
        return json({ ok: true, fileId, files: state.files || [] });
      }
      if (action === 'to-social' && method === 'POST') {
        const input = await payload(req);
        const result = await changeTarget({ type: 'prancheta-to-social', id: input.id, data: input });
        const state = await store.load(id);
        return json({ ok: true, ...(result || {}), posts: state.socialPosts || [] });
      }
      throw error('Rota da prancheta não encontrada.', 404);
    }
    return NEXT_ROUTE;
  };
}
