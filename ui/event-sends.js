// Envio das mensagens do Planejador de eventos pelo WhatsApp: agendar, acompanhar, escolher grupos e ritmo.
import { icon as i } from './icons.js';
import { ask } from './ask.js';
import { whatsappHtml } from './event-copy-editor.js';

const h = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const zoneOf = c => c.s.profile?.timezone || 'America/Sao_Paulo';
const moment = (value, zone, style = 'medium') => new Intl.DateTimeFormat('pt-BR', { dateStyle: style, timeStyle: 'short', timeZone: zone }).format(new Date(value));
const clock = (value, zone) => new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', timeZone: zone }).format(new Date(value));
const settingsLink = label => `<a class="text-link" href="#settings/whatsapp">${label}</a>`;
const foot = (label, attrs = '') => `<p class="form-status" role="alert"></p><footer class="ep-form-foot"><span class="spacer"></span><button class="secondary" type="button" data-act="close">Cancelar</button><button class="primary"${attrs}>${label}</button></footer>`;
const form = (kind, event, attrs = '') => `<form class="ep-form" data-eps-form="${kind}" data-id="${h(event?.id || '')}"${attrs}>`;

export const sendable = item => item.kind === 'message' && ['grupos', 'privado'].includes(item.channel);
export const deliveryOf = (event, item) => event.deliveries?.[item.id];
export const deliveryActive = delivery => ['scheduled', 'sending'].includes(delivery?.state);
export const canSend = c => !c.access?.modules || ['marketing', 'conversations'].every(module => c.access.modules.includes(module));
const rowsOf = (c, event, item) => (c.s.eventSends || []).filter(row => row.eventId === event.id && row.itemId === item.id);

function progress(delivery) {
  return [`${delivery.sent} de ${delivery.total} enviadas`, delivery.failed ? plural(delivery.failed, 'falha', 'falhas') : '', delivery.skipped ? `${delivery.skipped} fora da lista` : '', delivery.late ? `${delivery.late} com atraso` : ''].filter(Boolean).join(' · ');
}
export function deliveryView(c, event, item) {
  if (!sendable(item) || !canSend(c)) return '';
  const delivery = deliveryOf(event, item), active = deliveryActive(delivery), ref = `data-ep-event="${h(event.id)}"`;
  const button = (attrs, icon, label, kind = 'secondary') => `<button type="button" class="${kind}" ${attrs} ${ref}>${i(icon, 15)} ${label}</button>`;
  const schedule = button(`data-ep-schedule="${h(item.id)}"`, 'send', 'Agendar envio');
  const failures = delivery && (delivery.failed || delivery.skipped) ? button(`data-ep-failures="${h(item.id)}"`, 'alert', delivery.failed ? 'Ver falhas' : 'Ver quem ficou de fora') : '';
  let text = '', actions = schedule;
  if (active) {
    const started = delivery.sent + delivery.failed + delivery.skipped > 0 || delivery.state === 'sending';
    text = started ? progress(delivery) : `Agendada para ${moment(delivery.dueAt, zoneOf(c))} · ${plural(delivery.total, 'envio', 'envios')}`;
    actions = failures + button(`data-ep-cancel-send="${h(item.id)}"`, 'clock', 'Cancelar envio');
  } else if (delivery?.state === 'done') { text = progress(delivery); actions = failures + (delivery.sent ? '' : schedule); }
  else if (delivery?.state === 'canceled') text = `Envio cancelado${delivery.sent ? ` · ${delivery.sent} já ${delivery.sent === 1 ? 'tinha' : 'tinham'} saído` : ''}`;
  else if (item.status === 'agendado') text = 'Sem envio programado. Agende para a mensagem sair pela Graao.';
  return `<div class="ep-delivery">${text ? `<span>${h(text)}</span>` : ''}<span class="spacer"></span>${actions}</div>`;
}

/** Aviso no topo da Comunicação: número fora do ar ou fila acumulada. */
export function sendBanner(c, now = Date.now()) {
  const waiting = (c.s.eventSends || []).filter(row => row.status === 'queued' && Date.parse(row.dueAt) <= now);
  if (!waiting.length) return '';
  const blocked = waiting.find(row => /desconectado|suspensa|recusou o envio/i.test(row.error || ''));
  if (blocked) return `<p class="ep-banner" role="status">${i('alert', 16)} <span><b>${h(blocked.error.replace(/\.$/, ''))}.</b> ${plural(waiting.length, 'mensagem espera', 'mensagens esperam')} e saem quando a conexão voltar. ${settingsLink('Abrir a conexão')}</span></p>`;
  if (!waiting.some(row => Date.parse(row.dueAt) <= now - 60_000)) return '';
  const { minGapSeconds = 20, maxGapSeconds = 60, dailyCap = 150 } = c.s.eventSendSettings || {};
  const contacts = waiting.filter(row => row.target === 'contact').length;
  const days = Math.floor(contacts / dailyCap), end = now + days * 86_400_000 + ((contacts % dailyCap) * (minGapSeconds + maxGapSeconds) / 2 + (waiting.length - contacts) * 3) * 1000;
  return `<p class="ep-banner" role="status">${i('clock', 16)} <span>${plural(waiting.length, 'mensagem aguardando', 'mensagens aguardando')} · previsão de término ${days ? moment(end, zoneOf(c), 'short') : clock(end, zoneOf(c))}</span></p>`;
}
export function sendTools(c, event) {
  if (!canSend(c)) return '';
  return `<span class="ep-send-tools"><button type="button" class="secondary" data-ep-groups="${h(event.id)}" data-ep-event="${h(event.id)}">${i('users', 15)} Grupos do evento</button><button type="button" class="secondary" data-ep-pace data-ep-event="${h(event.id)}">${i('settings', 15)} Ritmo de envio</button></span>`;
}
export function sendSummary(event) {
  const sum = key => Object.values(event.deliveries || {}).reduce((total, delivery) => total + (delivery[key] || 0), 0);
  return { total: sum('total'), sent: sum('sent'), failed: sum('failed') };
}

/* ── Diálogos ── */
const partHtml = part => part.kind === 'poll'
  ? `<div class="ep-part"><small>Enquete</small><b>${h(part.question)}</b><ul>${part.options.map(option => `<li>${h(option)}</li>`).join('')}</ul></div>`
  : `<div class="ep-part">${whatsappHtml(part.text)}</div>`;
export function scheduleDialogBody(event, item, preview, { now = Date.now(), zone }) {
  const { skipped } = preview, group = item.channel === 'grupos', late = preview.dueAt && Date.parse(preview.dueAt) <= now;
  const out = [skipped.dnd ? `${skipped.dnd} com “não perturbe”` : '', skipped.noPhone ? `${skipped.noPhone} sem telefone` : '', skipped.duplicate ? `${skipped.duplicate} com telefone repetido` : ''].filter(Boolean).join(' · ');
  const people = preview.recipients ? `${group ? plural(preview.recipients, 'grupo', 'grupos') : plural(preview.recipients, 'contato', 'contatos')}: ${preview.sample.map(h).join(', ')}${preview.recipients > preview.sample.length ? '…' : ''}` : 'Ninguém ainda';
  const begin = late ? now : Date.parse(preview.dueAt), starts = late ? `Agora (estava marcada para ${moment(preview.dueAt, zone, 'short')})` : preview.dueAt ? moment(preview.dueAt, zone, 'short') : 'Sem data';
  const when = `${starts}${preview.endsAt ? ` · termina por volta de ${Date.parse(preview.endsAt) - begin < 43_200_000 ? clock(preview.endsAt, zone) : moment(preview.endsAt, zone, 'short')}` : ''}`;
  return `${form('schedule', event, ` data-item="${h(item.id)}"`)}<dl class="ep-facts"><div><dt>Para</dt><dd>${people}</dd></div><div><dt>Quando</dt><dd>${h(when)}</dd></div>${out ? `<div><dt>Ficam de fora</dt><dd>${h(out)}</dd></div>` : ''}</dl><div><span class="ec-label">${preview.parts.length > 1 ? `${preview.parts.length} mensagens, nesta ordem` : 'Como vai sair'}</span><div class="ep-parts">${preview.parts.map(partHtml).join('')}</div></div>${preview.problem ? `<p class="ep-banner" role="alert">${i('alert', 16)} <span>${h(preview.problem)}</span></p>` : ''}${foot(late ? 'Enviar agora' : 'Agendar envio', preview.problem ? ' disabled' : '')}</form>`;
}
const reasons = { 'not-connected': `O WhatsApp não está conectado. ${settingsLink('Conectar agora')}`, unsupported: 'Esta conexão do WhatsApp não lista grupos.', 'account-suspended': 'A conta está suspensa.' };
export function groupsDialogBody(event, { groups, reason }) {
  const known = new Map(groups.map(group => [group.jid, group]));
  const list = (name, title, hint) => {
    const chosen = new Map((event.groups?.[name] || []).map(group => [group.jid, group]));
    const rows = [...[...chosen.values()].filter(group => !known.has(group.jid)).map(group => ({ ...group, gone: !reason })), ...groups];
    return `<fieldset class="ep-picks"><legend>${title}</legend><p class="ep-hint">${hint}</p>${rows.length > 8 ? '<input type="search" data-eps-search placeholder="Buscar grupo" aria-label="Buscar grupo">' : ''}<div class="ep-picks-list">${rows.map(group => `<label class="check" data-eps-name="${h(group.name.toLowerCase())}"><input type="checkbox" name="${name}" value="${h(group.jid)}" data-name="${h(group.name)}"${chosen.has(group.jid) ? ' checked' : ''}><span>${h(group.name)} <small class="dim">${group.gone ? 'não encontrado neste número' : group.size ? plural(group.size, 'participante', 'participantes') : ''}</small></span></label>`).join('') || '<p class="dim">Nenhum grupo.</p>'}</div></fieldset>`;
  };
  return `${form('groups', event)}${reason ? `<p class="ep-banner" role="status">${i('alert', 16)} <span>${reasons[reason] || 'Não foi possível listar os grupos.'}</span></p>` : ''}${list('base', 'Grupos antigos e ativos', 'Recebem as mensagens de captação.')}${list('evento', 'Grupo do evento', 'Recebe aquecimento, evento e vendas.')}${foot('Salvar grupos')}</form>`;
}
export function settingsDialogBody(settings) {
  const number = (label, name, min, max) => `<label>${label}<input type="number" name="${name}" value="${h(settings[name])}" min="${min}" max="${max}" required></label>`;
  return `${form('pace', null)}<p class="dim">Vale para as mensagens no privado desta subconta. Intervalos maiores e teto menor reduzem o risco de o WhatsApp bloquear o número.</p><div class="ep-form-grid">${number('Intervalo mínimo (segundos)', 'minGapSeconds', 10, 300)}${number('Intervalo máximo (segundos)', 'maxGapSeconds', 10, 300)}</div>${number('Máximo de mensagens por dia', 'dailyCap', 1, 1000)}${foot('Salvar ritmo')}</form>`;
}
export function failuresBody(c, event, item) {
  const rows = rowsOf(c, event, item).filter(row => ['failed', 'skipped'].includes(row.status)), failed = rows.filter(row => row.status === 'failed'), unconfirmed = failed.filter(row => row.unconfirmed).length, sure = failed.length - unconfirmed;
  const button = (include, label) => `<button type="button" class="secondary" data-ep-retry="${include}" data-item="${h(item.id)}" data-ep-event="${h(event.id)}">${i('refresh', 15)} ${label}</button>`;
  return `<ul class="ep-failures">${rows.slice(0, 200).map(row => `<li><b>${h(row.name || row.to)}</b><span class="badge${row.status === 'failed' ? row.unconfirmed ? ' blue' : ' red' : ''}">${row.status === 'failed' ? row.unconfirmed ? 'Não confirmada' : 'Falhou' : 'Fora da lista'}</span><small class="dim">${h(row.error)}</small></li>`).join('') || '<li class="dim">O histórico desta mensagem já saiu da fila.</li>'}</ul><footer class="ep-form-foot"><span class="spacer"></span>${sure ? button('failed', `Reenviar ${plural(sure, 'falha', 'falhas')}`) : ''}${unconfirmed ? button('all', `Reenviar tudo, incluindo ${plural(unconfirmed, 'não confirmada', 'não confirmadas')}`) : ''}</footer>`;
}
/** Etiquetas do privado, no formulário da mensagem. */
export function targetsField(c, data) {
  const targets = { tags: data.targets?.tags || [], excludeTags: data.targets?.excludeTags || [] };
  const all = [...new Map([...(c.s?.contacts || []).flatMap(contact => contact.tags || []), ...targets.tags, ...targets.excludeTags].map(tag => [tag.toLowerCase(), tag])).values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const pick = (title, name, chosen) => { const on = new Set(chosen.map(tag => tag.toLowerCase())); return `<fieldset class="ep-picks"><legend>${title}</legend><div class="ep-picks-list">${all.map(tag => `<label class="check"><input type="checkbox" name="${name}" value="${h(tag)}"${on.has(tag.toLowerCase()) ? ' checked' : ''}><span>${h(tag)}</span></label>`).join('') || '<p class="dim">Nenhuma etiqueta nos contatos.</p>'}</div></fieldset>`; };
  return `<div data-ep-targets${data.channel === 'privado' ? '' : ' hidden'}><div class="ep-form-grid">${pick('Enviar para quem tem', 'targetTag', targets.tags)}${pick('Menos quem tem', 'excludeTag', targets.excludeTags)}</div></div>`;
}

export function installEventSends({ c, api, url, load, save, flash, dialog, close, repaint, find, itemOf, isOpen }) {
  const zone = () => zoneOf(c);
  document.addEventListener('click', async domEvent => {
    const target = domEvent.target.closest('[data-ep-schedule],[data-ep-cancel-send],[data-ep-failures],[data-ep-retry],[data-ep-groups],[data-ep-pace]');
    if (!target) return;
    const data = target.dataset;
    try {
      if (data.epPace !== undefined) { dialog('Ritmo de envio', settingsDialogBody(c.s.eventSendSettings)); return; }
      const event = find(data.epEvent); if (!event) return;
      if (data.epGroups) { dialog('Grupos do evento', groupsDialogBody(event, await api(url('/api/whatsapp/workspace/groups')))); return; }
      const item = itemOf(event, data.epSchedule || data.epCancelSend || data.epFailures || data.item); if (!item) return;
      if (data.epSchedule) { const preview = await save({ type: 'event-message-preview', id: event.id, data: { itemId: item.id } }); dialog(item.title, scheduleDialogBody(event, item, preview, { zone: zone() }), { description: 'Confira antes de agendar.' }); return; }
      if (data.epFailures) { dialog('Quem não recebeu', failuresBody(c, event, item)); return; }
      if (data.epCancelSend) {
        if (!await ask('Cancelar este envio?', { text: 'O que ainda não saiu fica fora da fila. O que já foi enviado não volta.', ok: 'Cancelar envio', cancel: 'Manter' })) return;
        await save({ type: 'event-message-cancel', id: event.id, data: { itemId: item.id } }); repaint(); flash('Envio cancelado.'); return;
      }
      if (data.epRetry === 'all' && !await ask('Reenviar o que não foi confirmado?', { text: 'Essas mensagens podem ter chegado. Confira no WhatsApp antes, para ninguém receber duas vezes.', ok: 'Reenviar tudo' })) return;
      const { total, dropped } = await save({ type: 'event-message-retry', id: event.id, data: { itemId: item.id, include: data.epRetry } });
      close(); repaint(); flash(`${plural(total, 'envio voltou', 'envios voltaram')} para a fila.${dropped ? ` ${plural(dropped, 'ficou', 'ficaram')} de fora por não fazer mais parte dos destinos.` : ''}`);
    } catch (error) { flash(error.message, true); }
  });
  document.addEventListener('input', domEvent => {
    if (!domEvent.target.matches?.('[data-eps-search]')) return;
    const query = domEvent.target.value.trim().toLowerCase();
    for (const row of domEvent.target.closest('fieldset').querySelectorAll('[data-eps-name]')) row.hidden = !row.dataset.epsName.includes(query);
  });
  document.addEventListener('submit', async domEvent => {
    const target = domEvent.target;
    if (!target.matches('[data-eps-form]')) return;
    domEvent.preventDefault(); if (target.dataset.pending) return;
    target.dataset.pending = '1';
    const button = target.querySelector('.primary'), status = target.querySelector('.form-status');
    button?.setAttribute('disabled', ''); status.textContent = '';
    try {
      const kind = target.dataset.epsForm, id = target.dataset.id;
      if (kind === 'schedule') {
        const { total } = await save({ type: 'event-message-schedule', id, data: { itemId: target.dataset.item } });
        close(); repaint(); flash(`${plural(total, 'envio agendado', 'envios agendados')}.`);
      } else if (kind === 'groups') {
        const chosen = name => [...target.querySelectorAll(`input[name="${name}"]:checked`)].map(input => ({ jid: input.value, name: input.dataset.name }));
        await save({ type: 'event-groups-save', id, data: { base: chosen('base'), evento: chosen('evento') } });
        close(); repaint(); flash('Grupos salvos.');
      } else {
        await save({ type: 'event-send-settings', data: Object.fromEntries(new FormData(target)) });
        close(); repaint(); flash('Ritmo salvo.');
      }
    } catch (error) { status.textContent = error.message; }
    finally { delete target.dataset.pending; button?.removeAttribute('disabled'); }
  });
  // Com envio em andamento, a tela acompanha. Nunca por cima de um diálogo ou de um campo em uso.
  setInterval(async () => {
    const event = isOpen();
    if (!event || document.hidden || document.querySelector('dialog[open]') || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '')) return;
    if (!Object.values(event.deliveries || {}).some(deliveryActive)) return;
    try { await load(); if (isOpen() && !document.querySelector('dialog[open]')) repaint(); } catch { /* sem rede: tenta na próxima volta */ }
  }, 30_000)?.unref?.();
}
