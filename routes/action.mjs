// Rota /api/action: os comandos das telas da subconta (salvar, apagar, mover, enviar...). Confere acesso e plano,
// executa o comando no estado do workspace e devolve o estado e as métricas atualizados.
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { requireWorkspaceCommand, workspaceView } from '../authorization.mjs';
import { inboundAddress } from '../email-inbound.mjs';
import { r2KeysOf } from '../media-model.mjs';
import { mediaMessageIds } from '../message-media.mjs';
import { eachStep } from '../ui/workflow-data.js';
import { NEXT_ROUTE } from './next-route.mjs';

export function createActionRoutes({ error, spaceId, privateSpace, payload, workspaceAccess, runCommand }) {
  return async function actionRoute({ req, res, p, method, id, json }) {
    if (p !== '/api/action' || method !== 'POST') return NEXT_ROUTE;
    if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
    const command = await payload(req);
    const who = await workspaceAccess(req, res, id);
    const { id: result, state, delivery } = await runCommand({ req, res, who, id, command });
    return json({ id: result, ...workspaceView(who, state), ...(delivery ? { delivery } : {}) });
  };
}

// Runs one command as `who` (already allowed into the sub-account) with everything that follows it: sending, media
// cleanup, audit and queues. The screens (/api/action) and the MCP server both write through here.
export function createCommandRunner(deps) {
  const {
    store, r2, messageMedia, clearVideoChunks, documentMail, error, privateSpace, mailSent, deliveryFailure, accountIsActive, change, deliverMetaMessage, emailLater, eventSendsLater, flushLater, listWorkspaces, publicBase, recordAudit, sendingAddress, whatsapp, workspaceAccess
  } = deps;
  return async function runCommand({ req, res, who, id, command }) {
    requireWorkspaceCommand(who, command);
    command.actor = who.name;
    // Whose OpenAI key the workflow's AI steps use: always the saving user, never a value from the client.
    if (command.type === 'save' && command.key === 'workflows' && command.data && typeof command.data === 'object') {
      // "Copiar contato": whoever saves the workflow must be able to open the target sub-account's contacts.
      const targets = new Set();
      eachStep(Array.isArray(command.data.steps) ? command.data.steps : [], step => { if (step?.type === 'copy_contact' && step.config?.workspace) targets.add(String(step.config.workspace)); });
      for (const target of targets) {
        if (target === id) throw error('Copiar contato: escolha outra subconta como destino.', 400);
        await workspaceAccess(req, res, target, { modules: ['contacts'] }).catch(() => { throw error('Copiar contato: seu usuário não tem acesso aos contatos da subconta de destino.', 403); });
      }
      command.data = { ...command.data, aiKey: who.session ? { session: who.session.id, user: who.userId || '', agency: who.agencyId || '' } : null };
    }
    if (command.type === 'phone-number-save' && command.data && typeof command.data === 'object') {
      command.data = { ...command.data, voiceKey: command.data.mode === 'voice_ai' && who.session ? { session: who.session.id, user: who.userId || '', agency: who.agencyId || '' } : null };
    }
    if (['document-send', 'document-link', 'estimate-send', 'estimate-link', 'invoice-send', 'invoice-from-template', 'checkout-remind', 'email-campaign-schedule', 'message', 'review-request', 'reputation-settings'].includes(command.type)) command.data = { ...(command.data && typeof command.data === 'object' ? command.data : {}), origin: publicBase(req) };
    const removedVideo = command.type === 'delete' && command.key === 'videoTestimonials' ? (await store.load(id)).videoTestimonials?.find(row => row.id === command.id) : null;
    const dropsFiles = (command.type === 'delete' && command.key === 'files') || command.type === 'media-empty-trash';
    const keysBefore = dropsFiles && r2 ? r2KeysOf((await store.load(id)).files) : null;
    // A lixeira de contatos guarda as mensagens; a mídia delas sai do R2 quando saem de vez (esvaziar, excluir, 60 dias).
    const dropsMessages = r2 && (/^contact-(trash-|restore$)/.test(command.type) || (command.key === 'contacts' && command.type === 'delete') || (command.type === 'bulk' && command.data?.operation === 'delete'));
    const mediaBefore = dropsMessages ? mediaMessageIds(await store.load(id)) : null;
    const result = await change(id,command,who);
    if (mediaBefore) await messageMedia.removeMissing(id, mediaBefore, mediaMessageIds(result.state));
    if (removedVideo) await clearVideoChunks(id, removedVideo);
    // Objects in R2 go when their records go (a failure only leaves an orphan object, never a broken record).
    const removedKeys = [...(keysBefore || [])].filter(key => !r2KeysOf(result.state.files).has(key));
    if (removedVideo?.r2Key && r2) removedKeys.push(removedVideo.r2Key);
    for (const key of removedKeys) await r2.remove(key).catch(problem => console.error(`R2 delete (${id}): ${problem.message}`));
    let delivery = null;
    let state = result.state;
    if (!privateSpace.test(id) && command.type === 'message' && command.data?.channel === 'WhatsApp' && command.data?.direction === 'Outbound') {
      const contact = state.contacts.find(c => c.id === command.data.contactId);
      // An undelivered message is marked and fires "Falha no envio de mensagem"; the provider error still reaches the user.
      const failed = async reason => {
        const marked = await change(id, { type: 'message-failed', data: { messageId: result.id, reason } });
        state = marked.state;
        if (state.workflowOutbox?.length) flushLater(id);
      };
      if (!contact?.phone) await failed('no_phone');
      else {
        // The stored body: trigger links already replaced by this contact's tracked URLs.
        const sentBody = state.messages.find(m => m.id === result.id)?.body || command.data.body;
        try {
          delivery = await whatsapp.sendWorkspaceText(who.agencyId, id, contact.phone, sentBody,
            (agencyId, workspace) => accountIsActive(agencyId, workspace, 'conversations'));
        } catch (err) { await failed('provider_error').catch(() => {}); throw err; }
        if (!delivery.sent) await failed(deliveryFailure(delivery.reason));
      }
    }
    // A team e-mail in Conversas goes out from the sub-account's sending domain (or the platform address).
    if (!privateSpace.test(id) && command.type === 'message' && command.data?.channel === 'Email' && command.data?.direction === 'Outbound') {
      const contact = state.contacts.find(c => c.id === command.data.contactId);
      const row = state.messages.find(m => m.id === result.id);
      let reason = '';
      if (!contact?.email) reason = 'no_email';
      else {
        const outcome = await documentMail.email(contact.email, { subject: row?.subject || `Mensagem de ${state.profile?.name || 'Graao'}`, text: row?.body || String(command.data.body || '') },
          `team-email-${id}-${result.id}`, { fromName: state.profile?.name || '', fromAddress: await sendingAddress(id), replyTo: inboundAddress(id) }).catch(problem => problem.message);
        if (!mailSent(outcome)) reason = /não configurado/.test(String(outcome)) ? 'not_connected' : 'provider_error';
      }
      delivery = { sent: !reason, ...(reason ? { reason } : {}) };
      if (reason) {
        const marked = await change(id, { type: 'message-failed', data: { messageId: result.id, reason } });
        state = marked.state;
        if (state.workflowOutbox?.length) flushLater(id);
      }
    }
    // A team reply on Messenger or Direct goes out through the page the contact wrote to.
    if (!privateSpace.test(id) && command.type === 'message' && ['Facebook', 'Instagram'].includes(command.data?.channel) && command.data?.direction === 'Outbound') {
      const contact = state.contacts.find(c => c.id === command.data.contactId);
      const network = command.data.channel === 'Facebook' ? 'facebook' : 'instagram';
      const sentBody = state.messages.find(m => m.id === result.id)?.body || command.data.body;
      const sent = await deliverMetaMessage(id, state, { network, recipients: contact?.metaIds || {}, body: sentBody }).catch(() => ({ sent: false, reason: 'provider_error' }));
      delivery = { sent: Boolean(sent.sent), ...(sent.sent ? {} : { reason: sent.reason }) };
      if (!sent.sent) {
        const marked = await change(id, { type: 'message-failed', data: { messageId: result.id, reason: sent.reason } });
        state = marked.state;
        if (state.workflowOutbox?.length) flushLater(id);
      }
    }
    if (!privateSpace.test(id) && ['save','delete','import','opportunity-import','opportunity-move','pipeline','pipeline-settings','pipeline-duplicate','pipeline-delete','stage-delete','smart-tag','smart-tag-delete','profile','bulk','workflow-enroll','workflow-restore','workflow-move'].includes(command.type)) {
      const account = (await listWorkspaces(who.agencyId)).find(w => w.id === id)?.name || id;
      const label = command.type === 'bulk' ? `Bulk ${command.data?.operation || ''} on ${command.data?.object || ''}`.trim() : '';
      await recordAudit(who, command.type === 'delete' ? `Deleted ${command.key}` : command.type === 'save' ? `Saved ${command.key}` : label || `Ran ${command.type}`, account);
    }
    if (state.workflowOutbox?.length) flushLater(id);
    if (command.type === 'email-campaign-schedule') emailLater(id);
    if (['event-message-schedule', 'event-message-retry'].includes(command.type)) eventSendsLater(id);
    return { id: result.id, state, delivery };
  };
}
