// Vigia do WhatsApp no graao: roda com o cron, por agência, e protege contra as falhas conhecidas da Evolution API.
//   1. Mensagem recebida que o webhook não entregou: busca na Evolution e guarda, sem repetir.
//   2. Webhook apagado ou trocado no servidor: registra de novo.
//   3. Número que caiu em silêncio: marca o incidente na subconta e avisa; avisa de novo quando volta.
//   4. Número "conectado" que não responde: reinicia a instância (a sessão continua, sem novo QR Code).
//   5. Resposta que com certeza não saiu: reenvia quando o número volta, por até 30 minutos.
const MINUTE = 60_000;
export const guardTimes = {
  round: 2 * MINUTE,        // intervalo mínimo entre rodadas da mesma agência
  webhook: 10 * MINUTE,     // conferência do webhook
  probe: 10 * MINUTE,       // pergunta que só uma conexão viva responde
  settle: 45_000,           // o webhook tem este tempo para entregar antes de a busca agir
  overlap: 10 * MINUTE,     // a busca volta um pouco: relógios diferentes e gravações atrasadas
  lookback: 24 * 60 * MINUTE,
  downAfter: 5 * MINUTE,    // queda curta (reinício, troca de rede) não vira alerta
  restartEvery: 60 * MINUTE,
  resend: 30 * MINUTE
};
const PROBE_LIMIT = 3, RESTART_BUDGET = 3, PAGE = 100, MAX_PAGES = 50, MAX_RESENDS = 3, RESEND_BATCH = 10;
export const resendable = ['not_connected', 'server_down'];
const iso = ms => new Date(ms).toISOString();
const ms = value => Date.parse(value || '') || 0;

/** O que a vigia lembra de cada subconta, guardado junto da conexão. */
export function cleanGuard(raw) {
  const g = raw && typeof raw === 'object' ? raw : {};
  const text = value => (typeof value === 'string' ? value.slice(0, 200) : '');
  const count = value => Math.max(0, Math.min(1e6, Math.round(Number(value) || 0)));
  return { openSince: text(g.openSince), sweptUntil: text(g.sweptUntil), downSince: text(g.downSince), alerted: Boolean(g.alerted), reason: text(g.reason),
    probeFails: count(g.probeFails), probeBudget: Math.min(RESTART_BUDGET, count(g.probeBudget)), restartedAt: text(g.restartedAt), restarts: count(g.restarts), recovered: count(g.recovered), webhookFixes: count(g.webhookFixes) };
}

/** Mensagens que podem sair de novo sem risco de repetir: com certeza não foram entregues, e são recentes. */
export function resendQueue(state, now) {
  // Um fluxo de "Falha no envio" já pode ter avisado o contato por outro caminho.
  if ((state.workflows || []).some(flow => flow.active && (flow.triggers || []).some(t => t.type === 'message_failed'))) return [];
  return (state.messages || []).filter(m => m.channel === 'WhatsApp' && m.direction === 'Outbound' && resendable.includes(m.failed)
    && now - ms(m.created) < guardTimes.resend && (m.resends || 0) < MAX_RESENDS).slice(0, RESEND_BATCH);
}

/**
 * wa: operações do WhatsApp (whatsapp.mjs) · store: estados · onIncident avisa as pessoas · onStored entrega os fluxos.
 */
export function createWhatsAppGuard({ wa, store, onIncident = async () => {}, onStored = () => {}, now = Date.now, log = message => console.error(message) }) {
  const ran = new Map(), checked = new Map();
  const due = (kind, id, every, at) => {
    const key = `${kind}:${id}`;
    if (at - (checked.get(key) || 0) < every) return false;
    checked.set(key, at);
    return true;
  };

  // Busca o que chegou à Evolution desde a última rodada. Só avança o marcador quando leu tudo.
  async function sweep(ctx, g, at) {
    const until = at - guardTimes.settle;
    const from = Math.max(ms(g.sweptUntil) - guardTimes.overlap, ms(g.openSince), at - guardTimes.lookback);
    if (!(from > 0) || until <= from) return { stored: 0, until: 0 };
    const entries = [];
    let complete = false;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const found = await wa.findMessages(ctx, { from, until, page, size: PAGE });
      entries.push(...found.records);
      if (found.records.length < PAGE || page >= found.pages) { complete = true; break; }
    }
    if (!complete) log(`WhatsApp (${ctx.workspaceId}): mais de ${PAGE * MAX_PAGES} mensagens para conferir; ficaram as mais recentes.`);
    // Da mais antiga para a mais nova, como teriam chegado.
    const stored = entries.length ? await wa.ingestEntries(ctx.workspaceId, entries.reverse(), { recovered: true }) : 0;
    if (stored) onStored(ctx.workspaceId);
    return { stored, until: complete ? until : 0 };
  }

  async function resend(ctx, at) {
    const state = await store.load(ctx.workspaceId);
    let sent = 0;
    for (const { id } of resendQueue(state, at)) {
      // Reserva antes de enviar: se o processo cair no meio, fica "não confirmada" e nunca repete sozinha.
      let claim = null;
      await store.change(ctx.workspaceId, current => {
        claim = null;
        const m = resendQueue(current, at).find(row => row.id === id);
        const contact = m && current.contacts.find(row => row.id === m.contactId);
        if (!m || !contact?.phone || contact.dnd) return;
        claim = { failed: m.failed, phone: contact.phone, body: m.body };
        m.resends = (m.resends || 0) + 1;
        m.failed = 'unconfirmed';
      });
      if (!claim) continue;
      const result = await wa.deliver(ctx, claim.phone, claim.body);
      await store.change(ctx.workspaceId, current => {
        const m = current.messages.find(row => row.id === id);
        if (!m) return;
        if (result.outcome === 'sent') { delete m.failed; m.resentAt = iso(at); }
        else m.failed = result.outcome === 'waiting' ? 'not_connected' : result.outcome === 'retry' ? 'server_down' : result.outcome === 'failed' ? 'provider_error' : 'unconfirmed';
      });
      if (result.outcome === 'sent') sent++;
      if (['waiting', 'retry'].includes(result.outcome)) break;
    }
    return sent;
  }

  // O aviso fica no estado da subconta para a tela mostrar; some quando o número volta.
  const mark = (workspaceId, health) => store.change(workspaceId, state => { if (health) state.whatsappHealth = health; else delete state.whatsappHealth; });

  async function one(ctx, live, serverError, publicOrigin, at) {
    const before = cleanGuard(ctx.sub.guard), g = { ...before };
    const open = live?.status === 'connected';
    if (open) {
      if (!g.openSince) { g.openSince = iso(at); g.sweptUntil = iso(at); }
      if (g.downSince) {
        if (g.alerted) {
          await mark(ctx.workspaceId, null);
          await onIncident({ ...ctx, kind: 'up', since: g.downSince, at: iso(at), reason: g.reason }).catch(error => log(`WhatsApp (${ctx.workspaceId}): ${error.message}`));
        }
        g.downSince = ''; g.alerted = false; g.reason = '';
      }
      try {
        const { stored, until } = await sweep(ctx, g, at);
        g.recovered += stored;
        // Grava o marcador de tempos em tempos: a busca repetida não custa, gravar a cada rodada custa.
        if (until && (stored || until - ms(g.sweptUntil) > guardTimes.overlap)) g.sweptUntil = iso(until);
      } catch (error) { log(`WhatsApp (${ctx.workspaceId}), busca: ${error.message}`); }
      if (due('webhook', ctx.workspaceId, guardTimes.webhook, at)) {
        try { if (await wa.repairWebhook(ctx, publicOrigin)) g.webhookFixes++; } catch (error) { log(`WhatsApp (${ctx.workspaceId}), webhook: ${error.message}`); }
      }
      if (due('probe', ctx.workspaceId, guardTimes.probe, at)) {
        const alive = await wa.probe(ctx).catch(() => null);
        // Só reinicia quem já respondeu bem: há número em que essa pergunta falha sempre, com a conexão boa.
        if (alive === true) { g.probeFails = 0; g.probeBudget = RESTART_BUDGET; }
        else if (alive === false) g.probeFails++;
        if (g.probeFails >= PROBE_LIMIT && g.probeBudget > 0 && at - ms(g.restartedAt) > guardTimes.restartEvery) {
          g.probeFails = 0; g.probeBudget--; g.restartedAt = iso(at); g.restarts++;
          await wa.restart(ctx).catch(error => log(`WhatsApp (${ctx.workspaceId}), reinício: ${error.message}`));
        }
      }
      try { await resend(ctx, at); } catch (error) { log(`WhatsApp (${ctx.workspaceId}), reenvio: ${error.message}`); }
    } else if (g.openSince) {
      // Só é incidente para quem já esteve conectado e não foi desligado pela própria pessoa.
      if (!g.downSince) g.downSince = iso(at);
      g.reason = serverError ? 'server' : !live ? 'missing' : 'disconnected';
      if (!g.alerted && at - ms(g.downSince) >= guardTimes.downAfter) {
        g.alerted = true;
        await mark(ctx.workspaceId, { status: 'down', reason: g.reason, since: g.downSince });
        await onIncident({ ...ctx, kind: 'down', since: g.downSince, at: iso(at), reason: g.reason }).catch(error => log(`WhatsApp (${ctx.workspaceId}): ${error.message}`));
      }
    }
    return JSON.stringify(g) === JSON.stringify(before) ? null : g;
  }

  /** Uma rodada da agência. Nunca lança: uma subconta com problema não para as outras. */
  async function run(agencyId, workspaceIds, publicOrigin) {
    const at = now();
    if (at - (ran.get(agencyId) || 0) < guardTimes.round) return { checked: 0 };
    ran.set(agencyId, at);
    const targets = await wa.guardTargets(agencyId, workspaceIds);
    if (!targets.length) return { checked: 0 };
    let live = new Map(), serverError = '';
    try { live = await wa.liveAll(targets[0].creds); } catch (error) { serverError = error.message || 'fora do ar'; }
    const updates = {};
    for (const ctx of targets) {
      try {
        const g = await one(ctx, live.get(ctx.sub.instanceName), serverError, publicOrigin, at);
        if (g) updates[ctx.workspaceId] = g;
      } catch (error) { log(`WhatsApp (${ctx.workspaceId}), vigia: ${error.message}`); }
    }
    if (Object.keys(updates).length) await wa.saveGuards(agencyId, updates);
    return { checked: targets.length, serverError };
  }
  return { run };
}
