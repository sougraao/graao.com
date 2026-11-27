// Exclusão definitiva de uma subconta (lixeira vencida): apaga a linha dela e tudo o que fica fora dela,
// para não sobrar dado nem token de cliente no banco, no R2 ou na Evolution.
//
// Fica de propósito: o livro de cobrança (go_billing_ledger, só aceita inserir), o histórico da agência
// (sai em 730 dias) e os arquivos media-asset-<hash>, que podem ser de outras subcontas.

// Linhas `<tipo>-<subconta>` em go_workspaces: tokens de anúncios, Google e redes sociais, domínio de e-mail,
// portal do cliente e comunidade.
export const SATELLITE_KINDS = ['ads', 'google', 'social', 'email', 'portal', 'community'];

// Quanto esperar entre tentativas quando o R2 ou a Evolution falham, e quando desistir deles.
export const PURGE_RETRY_MS = 60 * 60 * 1000;
export const PURGE_GIVE_UP_MS = 7 * 24 * 60 * 60 * 1000;

export function satelliteRows(id, state) {
  const sites = (state?.studioProjects || []).map(project => project?.id).filter(Boolean).map(project => `studio-${project}`);
  return [...SATELLITE_KINDS.map(kind => `${kind}-${id}`), ...sites];
}

export function createAccountPurge({ store, r2, whatsapp }) {
  const load = async id => { try { return await store.load(id); } catch (e) { if (e?.status === 404) return null; throw e; } };

  // O que está fora do graao (Evolution e R2), em ordem. Devolve as falhas em vez de lançar. Para na primeira falha,
  // para a subconta que espera na lixeira não perder os arquivos à toa; com `force` (desistência) tenta tudo.
  async function external(agencyId, id, { force = false } = {}) {
    const steps = [
      ['WhatsApp (Evolution)', () => whatsapp?.removeWorkspace?.(agencyId, id)],
      ['Arquivos (R2)', () => r2?.removePrefix(`ws/${id}/`)]
    ];
    const failures = [];
    for (const [label, run] of steps) {
      try { await run(); } catch (e) { failures.push(`${label}: ${e.message}`); if (!force) break; }
    }
    return failures;
  }

  // O que está no banco do graao, menos a linha da subconta (quem chama apaga por último, depois de conferir a agência).
  // Um site do AI Studio só sai se for mesmo desta subconta.
  async function local(id) {
    const state = await load(id);
    for (const row of satelliteRows(id, state)) {
      if (row.startsWith('studio-')) {
        const site = await load(row);
        if (site && site.workspace !== id) continue;
      }
      await store.remove(row);
    }
    await store.tracking?.removeWorkspace?.(id);
  }

  return { external, local };
}
