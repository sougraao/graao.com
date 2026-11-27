// Configurações → Telefonia (2.4): the sub-account's Twilio numbers. Buy by area code (DDD), choose where calls ring,
// recording, voicemail and the IVR switch (the workflows that start with "Início da URA" answer the call).
import { icon as i, shcLayers } from './icons.js';
import { tr } from './i18n.js';

const h = x => String(x ?? '').replace(/[&<>"']/g, v => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[v]);
const card = (body, on = false) => `<div class="surface padded shc-card shc-panel phone-settings${on ? ' is-connected' : ''}">${shcLayers()}${body}</div>`;
const tile = `<span class="shc-icon-tile" aria-hidden="true"><span class="shc-icon">${i('phone', 22)}</span></span>`;
const pretty = number => {
  const d = String(number || '').replace(/\D/g, '');
  return d.startsWith('55') && (d.length === 12 || d.length === 13) ? `(${d.slice(2, 4)}) ${d.slice(4, -4)}-${d.slice(-4)}` : number;
};

const VOICES = [['Polly.Camila', 'Camila (pt-BR)'], ['Polly.Vitoria', 'Vitória (pt-BR)'], ['Polly.Thiago', 'Thiago (pt-BR)'], ['Polly.Lupe', 'Lupe (es)'], ['Polly.Joanna', 'Joanna (en)']];
const options = (rows, current, empty = '') => `${empty ? `<option value="">${h(tr(empty))}</option>` : ''}${rows.map(([value, label]) => `<option value="${h(value)}" ${value === current ? 'selected' : ''}>${h(tr(label))}</option>`).join('')}`;

// Voice AI (3.2): the published agent that answers the number, its first words, voice, transfer and booking.
function voiceFields(c, n) {
  const agents = (c.s.agents || []).filter(row => row.published).map(row => [row.id, row.name]);
  const services = (c.s.services || []).filter(row => row.active !== false).map(row => [row.id, row.name]);
  return `<fieldset class="phone-voice" ${n.mode === 'voice_ai' ? '' : 'hidden'}><legend>${h(tr('Voice AI'))}</legend>
    ${agents.length ? '' : `<p class="dim">${h(tr('Publique um agente em IA → Agentes para ele atender as ligações.'))}</p>`}
    <label>${h(tr('Agente que atende'))}<select name="voiceAgentId">${options(agents, n.voiceAgentId, 'Escolha o agente')}</select></label>
    <label>${h(tr('Primeira fala (vazio: "Olá! Você ligou para…")'))}<input name="voiceWelcome" maxlength="400" value="${h(n.voiceWelcome)}"></label>
    <label>${h(tr('Voz'))}<select name="voice">${options(VOICES, n.voice || 'Polly.Camila')}</select></label>
    <label>${h(tr('Transferir para (telefone da equipe, opcional)'))}<input name="voiceTransfer" value="${h(pretty(n.voiceTransfer))}" placeholder="(11) 99999-0000"></label>
    <label>${h(tr('Marcar horários do serviço (opcional)'))}<select name="voiceServiceId">${options(services, n.voiceServiceId, 'Não marcar horários')}</select></label>
    <label>${h(tr('Duração máxima (minutos)'))}<input name="voiceMaxMinutes" type="number" min="1" max="15" value="${h(n.voiceMaxMinutes || 10)}"></label>
    <p class="dim">${h(tr('O agente usa a OpenAI de quem salvar este número. A transcrição vai para Conversas e dispara Ligação do Voice AI terminou.'))}</p>
  </fieldset>`;
}

function numberForm(c, n) {
  return `<form class="settings-form surface padded phone-number" data-form="phone-number">
    <input type="hidden" name="id" value="${h(n.id)}">
    <div class="inline-gap"><b>${h(pretty(n.number))}</b>${n.mode === 'ivr' || n.ivr ? `<span class="badge blue">${h(tr('URA ligada'))}</span>` : n.mode === 'voice_ai' ? `<span class="badge blue">${h(tr('Voice AI'))}</span>` : ''}<div class="spacer"></div>
      <button type="button" class="secondary" data-act="phone-release" data-phone-id="${h(n.id)}">${i('trash', 14)} ${h(tr('Liberar número'))}</button></div>
    <label>${h(tr('Nome'))}<input name="name" maxlength="60" value="${h(n.name)}" placeholder="${h(tr('Ex.: Recepção'))}"></label>
    <label>${h(tr('Tocar nestes telefones (um por linha, todos ao mesmo tempo)'))}<textarea name="forward" rows="2" placeholder="(11) 99999-0000">${h((n.forward || []).map(pretty).join('\n'))}</textarea></label>
    <label>${h(tr('Tocar por (segundos)'))}<input name="timeout" type="number" min="5" max="60" value="${h(n.timeout || 20)}"></label>
    <label class="check"><input type="checkbox" name="record" ${n.record ? 'checked' : ''}> ${h(tr('Gravar as ligações (avise quem liga, como pede a LGPD)'))}</label>
    <label class="check"><input type="checkbox" name="voicemail" ${n.voicemail !== false ? 'checked' : ''}> ${h(tr('Caixa postal quando ninguém atende'))}</label>
    <label>${h(tr('Mensagem da caixa postal'))}<textarea name="greeting" rows="2" maxlength="600" placeholder="${h(tr('Não conseguimos atender agora. Deixe seu recado após o sinal.'))}">${h(n.greeting)}</textarea></label>
    <label>${h(tr('Quem atende as ligações recebidas'))}<select name="mode" data-phone-mode>${options([['forward', 'Os telefones acima (e a caixa postal)'], ['ivr', 'A URA: os fluxos com o gatilho Início da URA'], ['voice_ai', 'O Voice AI: um agente de IA conversa por voz']], n.mode || (n.ivr ? 'ivr' : 'forward'))}</select></label>
    ${voiceFields(c, n)}
    <div class="inline-gap"><button class="primary">${h(tr('Salvar número'))}</button></div><p class="form-status" role="alert"></p>
  </form>`;
}

export function phoneSettingsView(c) {
  const p = c.phoneSetup;
  const title = `${tile}<h2>${h(tr('Telefonia'))}</h2>`;
  if (!p) return card(`${title}<p class="dim">${h(tr('Carregando os números…'))}</p>`);
  if (p.error) return card(`${title}<p class="form-status">${h(p.error)}</p><button class="secondary" data-act="phone-refresh">${h(tr('Tentar novamente'))}</button>`);
  if (!p.configured) return card(`${title}<p class="dim">${h(tr('A telefonia ainda não foi configurada nesta instalação do graao. Peça ao administrador da agência para definir'))} <code>TWILIO_ACCOUNT_SID</code>, <code>TWILIO_AUTH_TOKEN</code> ${h(tr('e'))} <code>PHONE_PUBLIC_ORIGIN</code>.</p>`);
  const found = c.phoneSearch || [];
  return `${card(`${title}<p class="dim">${h(tr('Números de telefone da subconta, pela Twilio. As ligações aparecem em Conversas e em Relatórios → Ligações e disparam o gatilho Ligação terminou.'))}</p>
    <form class="settings-form inline-gap" data-form="phone-search">
      <label>${h(tr('DDD'))}<input name="areaCode" inputmode="numeric" maxlength="2" placeholder="11" value="${h(c.phoneSearchArea || '')}"></label>
      <label>${h(tr('Contém os dígitos (opcional)'))}<input name="contains" inputmode="numeric" maxlength="8"></label>
      <button class="secondary">${i('search', 14)} ${h(tr('Procurar números'))}</button><p class="form-status" role="alert"></p>
    </form>
    ${found.length ? `<ul class="panel-list phone-found">${found.map(row => `<li><b>${h(pretty(row.number))}</b> <span class="dim">${h(row.locality)}</span>
      <button class="primary" data-act="phone-buy" data-phone-number="${h(row.number)}">${h(tr('Comprar'))}</button></li>`).join('')}</ul>` : c.phoneSearch ? `<p class="dim">${h(tr('Nenhum número disponível com esse filtro.'))}</p>` : ''}
    <p class="dim">${h(tr('Números do Brasil pedem o cadastro regulatório na Twilio (endereço e documento da empresa). Se a compra for recusada, conclua o cadastro na Twilio e tente de novo.'))}</p>`, p.numbers.length > 0)}
    ${p.numbers.map(n => numberForm(c, n)).join('') || `<p class="dim surface padded">${h(tr('Nenhum número ainda.'))}</p>`}`;
}
