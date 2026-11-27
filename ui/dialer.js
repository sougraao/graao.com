// Conversas → Discador (6b.9, power dialer): a queue of contacts and the member's session. The member stays on the
// line (a Twilio conference) while the dialer calls one contact after the other; each call gets a result.
import { icon as i } from './icons.js';
import { tr } from './i18n.js';

const h = x => String(x ?? '').replace(/[&<>"']/g, v => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[v]);
export const DISPOSITIONS = [['interested', 'Interessado'], ['callback', 'Retornar depois'], ['not_interested', 'Sem interesse'], ['no_answer', 'Não atendeu'], ['voicemail', 'Caixa postal'], ['wrong_number', 'Número errado']];
const STATUS = { ringing: ['Chamando', 'blue'], answered: ['Em conversa', 'green'], missed: ['Não atendeu', 'red'], busy: ['Ocupado', 'red'], failed: ['Falhou', 'red'], voicemail: ['Caixa postal', ''] };
const pretty = number => { const d = String(number || '').replace(/\D/g, ''); return d.startsWith('55') && d.length >= 12 ? `(${d.slice(2, 4)}) ${d.slice(4, -4)}-${d.slice(-4)}` : number; };
const option = (value, label, current) => `<option value="${h(value)}" ${value === current ? 'selected' : ''}>${h(tr(label))}</option>`;

/** The member's session that is still open (the newest). */
export const dialerSession = s => [...(s.dialer?.sessions || [])].reverse().find(row => row.status !== 'ended') || null;

export function dialerPanel(c) {
  const s = c.s, numbers = s.phone?.numbers || [], dialer = s.dialer || { queue: [], sessions: [] };
  const contacts = new Map(s.contacts.map(row => [row.id, row]));
  const pending = dialer.queue.filter(row => row.status === 'pending' && contacts.has(row.contactId));
  const session = dialerSession(s);
  if (!numbers.length) return `<div class="surface padded"><h2>${h(tr('Discador'))}</h2><p class="dim">${h(tr('Compre um número em Configurações → Telefonia para usar o discador.'))}</p><a class="secondary" href="#settings/phone">${h(tr('Abrir Telefonia'))}</a></div>`;

  const start = `<form class="settings-form inline-gap" data-form="dialer-start">
      <label>${h(tr('Ligar pelo número'))}<select name="numberId">${numbers.map(n => option(n.id, n.name ? `${n.name} (${pretty(n.number)})` : pretty(n.number), '')).join('')}</select></label>
      <label>${h(tr('Seu telefone'))}<input name="agentPhone" value="${h(c.dialerAgent || '')}" placeholder="(11) 99999-0000" required></label>
      <button class="primary" ${pending.length ? '' : 'disabled'}>${i('phone', 15)} ${h(tr('Iniciar discador'))}</button><p class="form-status" role="alert"></p>
    </form><p class="dim">${h(tr('O Graao liga para o seu telefone e mantém a linha aberta. Depois, cada contato da fila entra na ligação com você, um por vez.'))}</p>`;

  const call = session?.currentCallId ? s.calls.find(row => row.id === session.currentCallId) : null;
  const contact = call && contacts.get(call.contactId);
  const [label, tone] = call ? (call.ended && call.status === 'answered' ? ['Encerrada', ''] : STATUS[call.status] || [call.status, '']) : ['', ''];
  const current = call ? `<div class="surface padded dialer-current">
      <div class="inline-gap"><b>${h(contact?.name || pretty(call.phone))}</b><span class="dim">${h(pretty(call.phone))}</span><span class="badge ${tone}">${h(tr(label))}</span><div class="spacer"></div>
        ${call.ended ? '' : `<button class="secondary" data-act="dialer-hangup">${i('close', 14)} ${h(tr('Desligar'))}</button>`}</div>
      ${contact ? `<p class="dim">${h([contact.company, contact.email, (contact.tags || []).join(', ')].filter(Boolean).join(' · '))}</p>` : ''}
      ${call.disposition ? `<p><span class="badge green">${h(tr(DISPOSITIONS.find(([key]) => key === call.disposition)?.[1] || call.disposition))}</span></p>` : `<form class="settings-form" data-form="dialer-disposition">
        <input type="hidden" name="callId" value="${h(call.id)}">
        <label>${h(tr('Resultado'))}<select name="disposition" required><option value="">${h(tr('Escolha o resultado'))}</option>${DISPOSITIONS.map(([key, text]) => option(key, text, '')).join('')}</select></label>
        <label>${h(tr('Anotação (opcional)'))}<textarea name="note" rows="2" maxlength="1000"></textarea></label>
        <div class="inline-gap"><button class="primary" name="next" value="1">${h(tr('Salvar e chamar o próximo'))}</button><button class="secondary" name="next" value="0">${h(tr('Só salvar'))}</button></div><p class="form-status" role="alert"></p>
      </form>`}
    </div>` : '';
  const ready = session && (!call || (call.ended && call.disposition) || call.status === 'failed');
  const live = session ? `<div class="inline-gap"><span class="badge ${session.status === 'active' ? 'green' : 'blue'}">${h(tr(session.status === 'active' ? 'Você está na linha' : 'Ligando para você…'))}</span>
      <span class="dim">${h(tr('Ligações nesta sessão'))}: ${h(session.calls || 0)}</span><div class="spacer"></div>
      ${ready && pending.length ? `<button class="primary" data-act="dialer-next">${i('phone', 15)} ${h(tr('Chamar o próximo'))}</button>` : ''}
      <button class="secondary" data-act="dialer-stop">${h(tr('Encerrar discador'))}</button></div>${current}` : start;

  const tags = [...new Set(s.contacts.flatMap(row => row.tags || []))].sort((a, b) => a.localeCompare(b));
  const queue = `<div class="surface padded"><div class="inline-gap"><h3>${h(tr('Fila'))} (${pending.length})</h3><div class="spacer"></div>
      ${pending.length ? `<button class="secondary" data-act="dialer-clear">${h(tr('Limpar fila'))}</button>` : ''}</div>
    <form class="inline-gap" data-form="dialer-add-tag"><label>${h(tr('Adicionar contatos com a tag'))}<select name="tag" required><option value="">${h(tr('Escolha a tag'))}</option>${tags.map(tag => option(tag, tag, '')).join('')}</select></label><button class="secondary">${i('plus', 14)} ${h(tr('Adicionar'))}</button></form>
    <p class="dim">${h(tr('Também entram pela ação de fluxo Adicionar ao discador. Contatos sem telefone ou em não perturbe ficam de fora.'))}</p>
    <ul class="panel-list">${pending.slice(0, 100).map(row => { const x = contacts.get(row.contactId); return `<li><b>${h(x.name)}</b> <span class="dim">${h(pretty(x.phone))}</span>
      <button class="icon-btn" data-act="dialer-remove" data-dialer-contact="${h(x.id)}" aria-label="${h(tr('Tirar da fila'))}" title="${h(tr('Tirar da fila'))}">${i('close', 14)}</button></li>`; }).join('') || `<li class="dim">${h(tr('A fila está vazia.'))}</li>`}</ul></div>`;

  const done = s.calls.filter(row => row.kind === 'dialer' && row.disposition).sort((a, b) => String(b.created).localeCompare(String(a.created))).slice(0, 10);
  const recent = done.length ? `<div class="surface padded"><h3>${h(tr('Últimos resultados'))}</h3><ul class="panel-list">${done.map(row => `<li><b>${h(contacts.get(row.contactId)?.name || pretty(row.phone))}</b>
    <span class="badge">${h(tr(DISPOSITIONS.find(([key]) => key === row.disposition)?.[1] || row.disposition))}</span>${row.notes ? ` <span class="dim">${h(row.notes)}</span>` : ''}</li>`).join('')}</ul></div>` : '';
  return `<div class="dialer"><div class="surface padded"><h2>${h(tr('Discador'))}</h2>${live}</div>${queue}${recent}</div>`;
}
