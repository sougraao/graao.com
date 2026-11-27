import { icon as i, brandIcon } from './icons.js';
import { tr } from './i18n.js';
import { avatar, badge, date, empty, h, money, search, tabs } from './screens.js';
import { slaRecords } from './conversations.js';
import { conversationAiBar } from './conversation-ai.js';
import { messageParts, textPieces } from './message-media.js';
import { composerAction, composerChannels, fixedRuleValues, inboxFilterFields, inboxRule, inboxSorts, replyChannel } from './inbox-data.js';

// Inbox layout: box navigation | conversation list | open thread | contact panel with a section rail.
// On a phone the conversation list opens first; the folders are one tap away.
const phone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 760px)').matches;
export const inboxState = c => (c.inbox ??= { box:'team', nav:!phone(), sort:'latest', sortOpen:false, rules:[], match:'and', picked:[], panel:'contact' });
export const me = c => c.access?.name || 'Owner';
export function teammates(c) {
  const users = (c.agency?.users || []).filter(u => u.role?.startsWith('Agency') || u.accounts?.includes(c.workspace)).map(u => u.name);
  return [...new Set([me(c), ...users].filter(Boolean))];
}
const origin = message => message?.origin || 'human';
// Why an outbound message was not delivered (set by the server after the WhatsApp provider answers).
export const deliveryFailures = { not_connected: 'WhatsApp desconectado. Sai sozinha se o número voltar em até 30 minutos', server_down: 'Servidor do WhatsApp fora do ar. Sai sozinha se voltar em até 30 minutos',
  unconfirmed: 'Envio não confirmado. Confira no celular antes de mandar de novo', wrong_recipient: 'O servidor entregou em outro número. Avise o suporte', no_phone: 'Contato sem telefone', invalid_phone: 'Telefone inválido',
  suspended: 'Conta suspensa', provider_error: 'Erro do provedor' };
const time = message => message ? +new Date(message.created) : null;

export function inboxThreads(s, clock = Date.now()) {
  const meta = new Map((s.threads || []).map(row => [row.contactId, row]));
  const settings = s.conversationSla;
  const pending = new Map();
  for (const record of slaRecords(s, clock)) {
    if (record.answered || record.state === 'Dismissed') continue;
    const prior = pending.get(record.contactId);
    if (!prior || record.started < prior.started) pending.set(record.contactId, record);
  }
  const byContact = new Map();
  for (const message of s.messages) {
    if (!byContact.has(message.contactId)) byContact.set(message.contactId, []);
    byContact.get(message.contactId).push(message);
  }
  return s.contacts.flatMap(contact => {
    const messages = byContact.get(contact.id);
    if (!messages?.length) return [];
    const info = meta.get(contact.id), sla = pending.get(contact.id);
    const targets = sla && (settings.mode === 'channel' ? settings.channels[sla.channel] : settings.common);
    return [{
      contact, messages, latest: messages.at(-1),
      lastOutbound: messages.findLast(m => m.direction === 'Outbound'),
      lastManual: messages.findLast(m => origin(m) === 'human'),
      unread: messages.filter(m => !m.read).length, starred: messages.some(m => m.starred),
      assignee: info?.assignee || '', followers: info?.followers || [],
      sla, slaDue: sla && targets ? +new Date(sla.started) + targets.overdue * 60000 : null
    }];
  });
}

export function matchesRule(t, rule) {
  const hit = {
    assigned: () => t.assignee === rule.value,
    follower: () => t.followers.includes(rule.value),
    mention: () => t.messages.some(m => m.body.includes(`@${rule.value}`)),
    direction: () => t.latest.direction === rule.value,
    outboundType: () => Boolean(t.lastOutbound) && origin(t.lastOutbound) === rule.value,
    channel: () => t.latest.channel === rule.value,
    tag: () => t.contact.tags.includes(rule.value),
    sla: () => t.sla?.state === rule.value
  }[rule.field]?.() ?? false;
  return rule.op === 'not' ? !hit : hit;
}
const applyRules = (list, rules, match) => rules.length
  ? list.filter(t => match === 'or' ? rules.some(r => matchesRule(t, r)) : rules.every(r => matchesRule(t, r))) : list;

// Missing values sort last in either direction.
const order = (pick, dir) => (a, b) => {
  const x = pick(a), y = pick(b);
  if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
  return dir * (x - y);
};
const sorters = {
  latest: order(t => time(t.latest), -1), oldest: order(t => time(t.latest), 1),
  'latest-manual': order(t => time(t.lastManual), -1), 'oldest-manual': order(t => time(t.lastManual), 1),
  'sla-overdue': order(t => t.sla ? +new Date(t.sla.started) : null, 1), 'sla-next': order(t => t.slaDue, 1)
};

function boxThreads(c, all, box) {
  const mine = me(c);
  if (box === 'all') return all.filter(t => t.assignee === mine || t.followers.includes(mine));
  if (box === 'assigned') return all.filter(t => t.assignee === mine);
  if (box === 'followed') return all.filter(t => t.followers.includes(mine));
  const view = box.startsWith('view:') && c.s.inboxViews.find(v => `view:${v.id}` === box);
  return view ? applyRules(all, view.rules, view.match) : all;
}

export function visibleThreads(c, all = inboxThreads(c.s)) {
  const st = inboxState(c), mode = c.tab || 'all', q = c.query.toLowerCase();
  const list = applyRules(boxThreads(c, all, st.box), st.rules, st.match).filter(t =>
    (mode !== 'unread' || t.unread) && (mode !== 'starred' || t.starred) &&
    (mode !== 'recent' || Date.now() - time(t.latest) < 604800000) &&
    (!q || [t.contact.name, t.contact.email, t.contact.phone, t.latest.body].some(v => String(v || '').toLowerCase().includes(q))));
  return list.sort(sorters[st.sort] || sorters.latest);
}

export function ruleValues(c, field) {
  if (fixedRuleValues[field]) return fixedRuleValues[field];
  if (field === 'tag') return [...new Set(c.s.contacts.flatMap(x => x.tags))].sort().map(t => [t, t]);
  const people = teammates(c).map(n => [n, n]);
  return field === 'assigned' ? [['', 'Ninguém (sem atribuição)'], ...people] : people;
}
const fieldLabel = id => inboxFilterFields.find(f => f[0] === id)?.[1] || id;
const valueLabel = (c, rule) => ruleValues(c, rule.field).find(v => v[0] === rule.value)?.[1] || rule.value;
export const ruleText = (c, rule) => `${fieldLabel(rule.field)} ${rule.op === 'not' ? 'não é' : 'é'} ${valueLabel(c, rule)}`;

const options = (choices, value) => choices.map(([id, label]) => `<option value="${h(id)}" ${id === value ? 'selected' : ''}>${h(label)}</option>`).join('');
export function ruleRow(c, rule = { field:'assigned', op:'is', value:'' }) {
  return `<div class="rule-row" data-rule>
    <select data-rule-field aria-label="Tipo de filtro">${options(inboxFilterFields, rule.field)}</select>
    <select data-rule-op aria-label="Operador">${options([['is','é'],['not','não é']], rule.op)}</select>
    <select data-rule-value aria-label="Valor">${options(ruleValues(c, rule.field), rule.value)}</select>
    <button type="button" class="icon-btn" data-rule-remove aria-label="Remover condição">${i('close',14)}</button></div>`;
}
export function ruleEditor(c, rules, match) {
  return `<div class="rule-list" data-rules>${(rules.length ? rules : [undefined]).map(r => ruleRow(c, r)).join('')}</div>
    <div class="rule-actions"><button type="button" class="secondary" data-rule-add>${i('plus',14)} Adicionar condição</button>
    <fieldset class="rule-match"><legend>Combinar condições com</legend>
      <label><input type="radio" name="match" value="and" ${match !== 'or' ? 'checked' : ''}> E (todas)</label>
      <label><input type="radio" name="match" value="or" ${match === 'or' ? 'checked' : ''}> OU (qualquer)</label></fieldset></div>`;
}
export const readRules = form => [...form.querySelectorAll('[data-rule]')].map(row => inboxRule({
  field: row.querySelector('[data-rule-field]').value, op: row.querySelector('[data-rule-op]').value, value: row.querySelector('[data-rule-value]').value
})).filter(Boolean);

function stamp(c, value) {
  const d = new Date(value), tz = c.s.profile.timezone;
  const same = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d) === new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  return new Intl.DateTimeFormat('pt-BR', { timeZone: tz, ...(same ? { hour:'2-digit', minute:'2-digit' } : { day:'2-digit', month:'short' }) }).format(d);
}
function messageContent(value) {
  return textPieces(value).map(({ text, href }) => href
    ? `<a class="text-link" href="${h(href)}" target="_blank" rel="noopener noreferrer nofollow">${h(href.startsWith('/') ? new URL(href, location.origin).href : text)}</a>`
    : h(text)).join('');
}

const fileSize = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const mediaLabels = { image: 'Imagem', video: 'Vídeo', gif: 'GIF', audio: 'Áudio', document: 'Documento', sticker: 'Figurinha' };
// A GIF do WhatsApp é um vídeo curto sem som: repete sozinha, menos para quem pediu menos movimento.
const stillMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
// Com as medidas do arquivo, o espaço fica reservado e a conversa não pula quando a mídia carrega.
function mediaBox({ kind, width, height }) {
  if (!(width > 0 && height > 0)) return '';
  const wide = Math.round(Math.min(kind === 'sticker' ? 150 : 300, width, 340 * width / height));
  return ` style="width:${wide}px;aspect-ratio:${Number(width)}/${Number(height)}"`;
}
function attachmentView(c, message, part) {
  const local = `/api/whatsapp/workspace/media?workspace=${encodeURIComponent(c.workspace)}&message=${encodeURIComponent(message.id)}`;
  const src = h(part.url || local), download = h(part.url || `${local}&download=1`), label = h(tr(mediaLabels[part.kind])), name = part.name ? h(part.name) : label;
  const missing = `data-message-media="${part.kind}"`, box = mediaBox(part);
  switch (part.kind) {
    case 'image':
    case 'sticker': return `<a class="message-media ${part.kind === 'sticker' ? 'sticker' : ''}" ${missing} href="${src}" target="_blank" rel="noopener noreferrer" aria-label="${h(tr('Abrir imagem'))}"><img src="${src}"${box} alt="${name}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`;
    case 'gif': return `<div class="message-media" ${missing}><video src="${src}"${box} ${stillMotion() ? 'controls' : 'autoplay'} loop muted playsinline preload="metadata" aria-label="${label}"></video></div>`;
    case 'video': return `<div class="message-media" ${missing}><video src="${src}"${box} controls playsinline preload="metadata" aria-label="${label}"></video></div>`;
    case 'audio': return `<div class="message-media audio" ${missing}><audio src="${src}" controls preload="none" aria-label="${label}"></audio></div>`;
    default: return `<a class="message-file" href="${download}" target="_blank" rel="noopener noreferrer">${i('note', 18)}<span><b>${name}</b><small>${part.size ? `${fileSize(part.size)} · ` : ''}${h(tr('Baixar arquivo'))}</small></span></a>`;
  }
}
// O arquivo não veio (apagado do WhatsApp, servidor fora do ar): diz o que era, no lugar do ícone quebrado.
export function mediaFailed(event) {
  const box = event.target?.closest?.('[data-message-media]');
  if (!box) return;
  const note = document.createElement('span');
  note.className = 'message-media-missing';
  note.textContent = `${tr(mediaLabels[box.dataset.messageMedia])} · ${tr('arquivo indisponível')}`;
  box.replaceWith(note);
}
// A conversa abre no fim; a mídia que carrega depois não pode empurrar a última mensagem para fora da tela, a menos
// que a pessoa já tenha rolado. Cada renderização cria a área de novo, sem a marca.
export function mediaLoaded(event) {
  const area = event.target?.closest?.('[data-message-media]')?.closest('.thread-messages');
  if (area && !area.dataset.moved) area.scrollTop = area.scrollHeight;
}
export function threadMoved(event) {
  const area = event.target?.closest?.('.thread-messages');
  if (area) area.dataset.moved = '1';
}
function messageBody(c, message) {
  const { text, attachments } = messageParts(message);
  return attachments.map(part => attachmentView(c, message, part)).join('') + (text.trim() ? `<p>${messageContent(text)}</p>` : '');
}

const boxes = [['all','Todas','list'],['assigned','Atribuídas a mim','contacts'],['followed','Seguidas por mim','users']];
function navPanel(c, st, all) {
  const unread = box => boxThreads(c, all, box).filter(t => t.unread).length;
  const item = (box, label, ico, extra = '') => {
    const n = box === 'internal' ? 0 : unread(box);
    return `<li><button class="inbox-box ${st.box === box ? 'selected' : ''}" data-inbox-box="${h(box)}" aria-current="${st.box === box ? 'true' : 'false'}">
      ${ico ? i(ico,15) : ''}<span>${h(label)}</span>${n ? `<span class="box-count" aria-label="${n} não lidas">${n}</span>` : ''}</button>${extra}</li>`;
  };
  return `<aside class="inbox-nav" aria-label="Caixas de entrada">
    <button class="primary" data-inbox-new>${i('chat',16)} Nova conversa</button>
    <button class="secondary" data-act="import">${i('upload',16)} Importar</button>
    ${search(c.query,'Buscar conversas…')}
    <h3>Minha caixa</h3><ul>${boxes.map(([box,label,ico]) => item(box,label,ico)).join('')}</ul>
    <ul>${item('team','Caixa da equipe','inbox')}${item('internal','Chat interno','chat')}</ul>
    <h3>Visões</h3><ul>${c.s.inboxViews.map(v => item(`view:${v.id}`, v.name, 'filter',
      `<button class="icon-btn view-delete" data-inbox-delete-view="${v.id}" aria-label="Excluir a visão ${h(v.name)}" title="Excluir visão">${i('trash',14)}</button>`)).join('')}</ul>
    <button class="text-link create-view" data-inbox-create-view>${i('plus',14)} Criar visão</button></aside>`;
}

function boxTitle(c, box) {
  if (box.startsWith('view:')) return c.s.inboxViews.find(v => `view:${v.id}` === box)?.name || 'Visão';
  return { all:'Minha caixa', assigned:'Atribuídas a mim', followed:'Seguidas por mim', team:'Caixa da equipe' }[box] || 'Conversas';
}

const channelBadge = ch => {
  if (ch === 'Instagram') return `<span style="display:inline-flex;align-items:center;gap:4px;color:#e1306c;">${brandIcon('instagram', 13)} <b>Instagram</b></span>`;
  if (ch === 'Facebook') return `<span style="display:inline-flex;align-items:center;gap:4px;color:#1877f2;">${brandIcon('facebook', 13)} <b>Facebook</b></span>`;
  if (ch === 'WhatsApp') return `<span style="display:inline-flex;align-items:center;gap:4px;color:#22c55e;">${i('whatsapp', 13)} <b>WhatsApp</b></span>`;
  if (ch === 'Call') return `<span style="display:inline-flex;align-items:center;gap:4px;">${i('phone', 13)} <b>${h(tr('Ligação'))}</b></span>`;
  return h(tr(ch));
};

function listPanel(c, st, list) {
  const slaOn = c.s.conversationSla.enabled;
  const picked = st.picked.filter(id => list.some(t => t.contact.id === id));
  st.picked = picked;
  const sortMenu = st.sortOpen ? `<div class="inbox-menu" role="menu" aria-label="Ordenar conversas">${inboxSorts.map(([id,label]) => {
    const off = id.startsWith('sla') && !slaOn;
    return `<button role="menuitemradio" aria-checked="${st.sort === id}" data-inbox-sort-pick="${id}" ${off ? 'disabled' : ''}>
      <span>${label}${off ? '<small>Configure o SLA em Configurações para usar.</small>' : ''}</span>${st.sort === id ? i('check',15) : ''}</button>`;
  }).join('')}</div>` : '';
  const chips = st.rules.length ? `<div class="rule-chips">${st.rules.map((rule, n) => `<span class="rule-chip">${h(ruleText(c, rule))}
      <button class="icon-btn" data-inbox-rule-remove="${n}" aria-label="Remover filtro ${h(ruleText(c, rule))}">${i('close',12)}</button></span>`).join(`<small>${st.match === 'or' ? 'ou' : 'e'}</small>`)}
      <button class="text-link" data-inbox-rules-clear>Limpar</button></div>` : '';
  const assign = `<select data-inbox-bulk-assign aria-label="Atribuir selecionadas"><option value="__">Atribuir a…</option>${options([['','Ninguém'], ...teammates(c).map(n => [n,n])], '__')}</select>`;
  const bulk = picked.length ? `<div class="inbox-bulk" role="toolbar" aria-label="Ações em massa"><b>${picked.length} selecionada${picked.length > 1 ? 's' : ''}</b>
      <button class="icon-btn" data-inbox-bulk="read" title="Marcar como lida" aria-label="Marcar como lida">${i('check',15)}</button>
      <button class="icon-btn" data-inbox-bulk="unread" title="Marcar como não lida" aria-label="Marcar como não lida">${i('mail',15)}</button>
      <button class="icon-btn" data-inbox-bulk="star" title="Marcar com estrela" aria-label="Marcar com estrela">${i('star',15)}</button>
      <button class="icon-btn" data-inbox-bulk="unstar" title="Remover estrela" aria-label="Remover estrela">${i('close',15)}</button>${assign}</div>` : '';
  const all = list.length && picked.length === list.length;
  return `<section class="thread-list" aria-label="Conversas">
    <div class="thread-list-head">
      <button class="icon-btn" data-inbox-nav aria-label="${st.nav ? 'Recolher' : 'Expandir'} painel de caixas" aria-expanded="${st.nav}">${i(st.nav ? 'left' : 'right',16)}</button>
      <h2>${h(boxTitle(c, st.box))}</h2><div class="spacer"></div>
      <button class="icon-btn ${st.rules.length ? 'active' : ''}" data-inbox-filter aria-label="Filtrar conversas" title="Filtrar">${i('filter',16)}${st.rules.length ? `<span class="filter-count">${st.rules.length}</span>` : ''}</button>
      <button class="icon-btn" data-inbox-sort aria-label="Ordenar conversas" title="Ordenar" aria-expanded="${st.sortOpen}">${i('sort',16)}</button>${sortMenu}</div>
    ${chips}${tabs([['unread','Não lidas'],['all','Todas'],['recent','Recentes'],['starred','Com estrela']], c.tab || 'all')}
    <label class="pick-all"><input type="checkbox" data-inbox-pick-all ${all ? 'checked' : ''} ${list.length ? '' : 'disabled'}> Selecionar tudo</label>${bulk}
    <div class="thread-items">${list.map(t => `<div class="thread-row ${c.thread === t.contact.id ? 'selected' : ''}">
      <input type="checkbox" data-inbox-pick="${t.contact.id}" ${picked.includes(t.contact.id) ? 'checked' : ''} aria-label="Selecionar conversa com ${h(t.contact.name)}">
      <button data-thread="${t.contact.id}" class="thread-preview ${c.thread === t.contact.id ? 'selected' : ''} ${t.unread ? 'is-unread' : ''}">
        ${avatar(t.contact.name)}<span><b>${t.latest.channel === 'Instagram' ? `<span style="color:#e1306c;display:inline-flex;vertical-align:middle;margin-right:4px;">${brandIcon('instagram', 12)}</span>` : t.latest.channel === 'Facebook' ? `<span style="color:#1877f2;display:inline-flex;vertical-align:middle;margin-right:4px;">${brandIcon('facebook', 12)}</span>` : t.latest.channel === 'WhatsApp' ? `<span style="color:#22c55e;display:inline-flex;vertical-align:middle;margin-right:4px;">${i('whatsapp', 12)}</span>` : ''}${h(t.contact.name)}</b><small>${t.latest.direction === 'Outbound' ? 'Você: ' : ''}${h(t.latest.body)}</small></span>
        <span class="thread-meta"><time datetime="${h(t.latest.created)}">${stamp(c, t.latest.created)}</time>
          <span class="thread-flags">${t.sla ? `<span class="badge ${t.sla.state === 'Overdue' ? 'red' : 'blue'}" title="SLA">${h(tr(t.sla.state))}</span>` : ''}${t.starred ? `<span class="gold" aria-label="Com estrela">${i('star',13)}</span>` : ''}${t.unread ? `<span class="unread-count" aria-label="${t.unread} não lidas">${t.unread}</span>` : ''}${t.assignee ? `<span class="assignee" title="Atribuída a ${h(t.assignee)}">${avatar(t.assignee,'tiny')}</span>` : ''}</span></span>
      </button></div>`).join('') || empty('Nenhuma conversa', st.rules.length ? 'Nenhuma conversa corresponde aos filtros.' : 'Selecione uma caixa ou inicie uma nova conversa.','chat')}</div></section>`;
}

// O número da subconta está fora do ar há alguns minutos (whatsapp-guard.mjs).
export function whatsappNotice(s) {
  const health = s.whatsappHealth;
  if (health?.status !== 'down') return '';
  const why = health.reason === 'server' ? 'O servidor do WhatsApp não está respondendo. Estamos tentando de novo sozinhos.' : 'O número foi desconectado. Se não voltar sozinho, leia o QR Code em Configurações → WhatsApp.';
  return `<div class="wa-notice" role="status"><b>${h(tr('WhatsApp fora do ar'))}</b><span>${h(tr(why))}</span><a class="text-link" href="#settings/whatsapp">${h(tr('Ver conexão'))}</a></div>`;
}

function threadPanel(c, all) {
  const t = all.find(item => item.contact.id === c.thread);
  if (!t) return `<section class="thread-body">${empty('Nenhuma conversa selecionada','Selecione uma caixa ou inicie uma nova conversa.','inbox')}</section>`;
  const { contact } = t, following = t.followers.includes(me(c));
  const channel = replyChannel(t.messages, c.composer?.thread === contact.id ? c.composer.channel : '');
  const deadlines = slaRecords(c.s).filter(item => !item.answered && item.state !== 'Dismissed' && item.contactId === c.thread);
  return `<section class="thread-body"><div class="thread-header">
      <button class="icon-btn mobile-back" data-act="back-inbox" aria-label="Voltar para a caixa de entrada">${i('left')}</button>
      ${avatar(contact.name)}<b>${h(contact.name)}</b><div class="spacer"></div>
      <label class="thread-assign">${i('contacts',14)}<select data-inbox-assign aria-label="Atribuir conversa">${options([['','Sem atribuição'], ...teammates(c).map(n => [n,n])], t.assignee)}</select></label>
      <button class="icon-btn ${following ? 'active' : ''}" data-inbox-follow aria-pressed="${following}" aria-label="${following ? 'Deixar de seguir' : 'Seguir'} conversa" title="${following ? 'Deixar de seguir' : 'Seguir'}">${i('bell')}</button>
      <button class="icon-btn ${t.starred ? 'gold' : ''}" data-act="toggle-star" aria-label="Marcar ou desmarcar estrela">${i('star')}</button>
      ${contact.phone && (c.s.phone?.numbers || []).length ? `<button class="icon-btn" data-act="phone-call" aria-label="${h(tr('Ligar pelo número da Graao'))}" title="${h(tr('Ligar pelo número da Graao'))}">${i('phone')}</button>` : ''}
      <button class="icon-btn" data-act="mark-unread" aria-label="Marcar como não lida">${i('mail')}</button></div>
    ${deadlines.length ? `<div class="thread-sla">${deadlines.map(item => `<span class="sla-clock-group">
      <span class="badge ${item.state === 'Overdue' ? 'red' : 'blue'}" data-sla-clock="${item.id}">${tr(item.channel)} · ${tr(item.state)}</span>
      <button class="icon-btn" aria-label="Dispensar SLA de ${tr(item.channel)}" title="Dispensar SLA" data-dismiss-sla="${item.id}">${i('close',13)}</button></span>`).join('')}</div>` : ''}
    <div class="thread-messages">${t.messages.map(m => `<div class="message ${m.direction === 'Outbound' ? 'outbound' : ''} ${origin(m) !== 'human' ? 'automated' : ''}">
      <small>${channelBadge(m.channel)} · ${date(m.created,c,true)}${origin(m) === 'workflow' ? ' · Automação' : ''}${m.failed ? ` · <span class="badge red" title="${h(tr(deliveryFailures[m.failed] || deliveryFailures.provider_error))}">${tr('Não entregue')}</span>` : ''}</small>${m.subject ? `<b class="message-subject">${h(m.subject)}</b>` : ''}${messageBody(c, m)}${m.callId && m.recordingUrl ? `<audio class="call-recording" controls preload="none" src="/api/phone/recording?workspace=${encodeURIComponent(c.workspace)}&amp;call=${encodeURIComponent(m.callId)}" aria-label="${h(tr('Gravação da ligação'))}"></audio>` : ''}</div>`).join('')}</div>
    ${conversationAiBar(c, contact.id)}
    <form class="message-compose" data-form="message"><p>As mensagens ficam registradas nesta caixa de entrada.</p>
      <div class="inline-gap"><select name="channel" aria-label="Canal">${composerChannels.map(([value, label]) => `<option value="${value}"${value === channel ? ' selected' : ''}>${label}</option>`).join('')}</select>
        <select name="direction" aria-label="Direção"><option value="Outbound">Enviada</option><option value="Inbound">Recebida</option></select>
        <button type="button" class="secondary" data-act="insert-snippet">Inserir modelo</button>
        <button type="button" class="secondary" data-act="insert-link">Inserir link de rastreamento</button></div>
      <label class="message-email"${channel === 'Email' ? '' : ' hidden'}>Assunto<input name="subject" maxlength="240"${channel === 'Email' ? '' : ' disabled'}></label>
      <textarea name="body" placeholder="Escreva uma mensagem… use @nome para mencionar alguém da equipe." aria-label="Mensagem" required></textarea>
      <button class="primary" data-compose-submit>${i('send',15)} <span>${composerAction(channel, 'Outbound')}</span></button></form></section>`;
}

const rail = [['contact','Contato','contacts'],['activity','Atividade','clock'],['opportunities','Oportunidades','leads'],['tasks','Tarefas','check'],
  ['notes','Notas','edit'],['appointments','Agendamentos','cal'],['payments','Pagamentos','pay']];
const add = (label, key, contact) => `<button class="secondary" data-edit="${key}" data-contact="${contact}">${i('plus',14)} ${label}</button>`;
const items = (rows, nothing) => rows.length ? `<ul class="panel-list">${rows.join('')}</ul>` : `<p class="panel-empty">${nothing}</p>`;
function panelBody(c, st, t) {
  const x = t.contact, id = x.id;
  switch (st.panel) {
    case 'activity': {
      const events = [...t.messages.map(m => ({ at:m.created, text:`${m.direction === 'Outbound' ? 'Mensagem enviada' : 'Mensagem recebida'} · ${tr(m.channel)}` })),
        ...c.s.runs.filter(r => r.contactId === id).map(r => ({ at:r.created, text:`Automação “${r.name}” · ${tr(r.status)}` })),
        ...c.s.tasks.filter(r => r.contactId === id).map(r => ({ at:r.created, text:`Tarefa criada: ${r.title}` }))]
        .sort((a,b) => b.at.localeCompare(a.at)).slice(0, 30);
      return items(events.map(e => `<li><span>${h(e.text)}</span><small>${date(e.at,c,true)}</small></li>`), 'Nenhuma atividade registrada.');
    }
    case 'opportunities': return add('Oportunidade','opportunities',id) + items(c.s.opportunities.filter(r => r.contactId === id).map(r =>
      `<li><button class="identity" data-edit="opportunities" data-id="${r.id}"><b>${h(r.title)}</b></button><small>${h(tr(c.s.stages.find(s => s.id === r.stage)?.name) || '—')} · ${money(r.value)}</small>${badge(r.status, r.status === 'Won' ? 'green' : '')}</li>`), 'Nenhuma oportunidade.');
    case 'tasks': return add('Tarefa','tasks',id) + items(c.s.tasks.filter(r => r.contactId === id).map(r =>
      `<li><b>${h(r.title)}</b><small>${r.due ? date(r.due,c) : 'Sem prazo'}</small><button class="pill-button ${r.done ? 'completed' : ''}" data-task="${r.id}">${r.done ? 'Concluída' : 'Em aberto'}</button></li>`), 'Nenhuma tarefa.');
    case 'notes': return `<button class="secondary" data-edit="contacts" data-id="${id}">${i('edit',14)} Editar notas</button>${x.notes ? `<p class="panel-notes">${h(x.notes)}</p>` : '<p class="panel-empty">Nenhuma nota.</p>'}`;
    case 'appointments': return add('Agendamento','appointments',id) + items(c.s.appointments.filter(r => r.contactId === id).map(r =>
      `<li><button class="identity" data-edit="appointments" data-id="${r.id}"><b>${h(r.title)}</b></button><small>${date(r.start,c,true)}</small>${badge(r.status)}</li>`), 'Nenhum agendamento.');
    case 'payments': return add('Fatura','invoices',id) + items(c.s.invoices.filter(r => r.contactId === id).map(r =>
      `<li><button class="identity" data-edit="invoices" data-id="${r.id}"><b>${h(r.title)}</b></button><small>${money(r.value)} · vence ${date(r.due,c)}</small>${badge(r.status, r.status === 'Paid' ? 'green' : '')}</li>`), 'Nenhuma fatura.');
    default: return `<div class="panel-identity">${avatar(x.name)}<div><b>${h(x.name)}</b>${x.company ? `<small>${h(x.company)}</small>` : ''}</div></div>
      <dl class="panel-fields"><dt>E-mail</dt><dd>${h(x.email || '—')}</dd><dt>Telefone</dt><dd>${h(x.phone || '—')}</dd>
      <dt>Atribuída a</dt><dd>${h(t.assignee || 'Ninguém')}</dd><dt>Seguidores</dt><dd>${h(t.followers.join(', ') || '—')}</dd>
      <dt>Tags</dt><dd>${x.tags.map(tag => badge(tag,'blue')).join(' ') || '—'}</dd></dl>
      <button class="secondary" data-edit="contacts" data-id="${id}">${i('edit',14)} Editar contato</button>
      ${(() => { const open = (c.s.tickets || []).filter(row => row.contactId === id && !['resolved', 'closed'].includes(row.status));
        return open.length ? `<a class="text-link" href="#conversations/tickets">${i('inbox',14)} ${open.length} ${open.length === 1 ? 'ticket aberto' : 'tickets abertos'}: #${open.map(row => row.number).join(', #')}</a>` : ''; })()}
      <button class="secondary" data-tk="new-from-thread" data-contact="${id}">${i('plus',14)} Criar ticket</button>`;
  }
}
function contactPanel(c, st, all) {
  const t = all.find(item => item.contact.id === c.thread);
  const title = rail.find(r => r[0] === st.panel)?.[1] || 'Contato';
  return `<aside class="contact-panel" aria-label="Detalhes do contato">
    <div class="contact-panel-body">${t ? `<h2>${title}</h2>${panelBody(c, st, t)}` : empty('Nenhum contato selecionado','Selecione uma conversa da lista para ver os dados do contato.','contacts')}</div>
    <nav class="contact-rail" aria-label="Seções do contato">${rail.map(([id,label,ico]) => `<button class="icon-btn ${st.panel === id ? 'selected' : ''}" data-inbox-panel="${id}" aria-pressed="${st.panel === id}" aria-label="${label}" title="${label}" ${t ? '' : 'disabled'}>${i(ico,17)}</button>`).join('')}</nav></aside>`;
}

function teamChat(c) {
  const mine = me(c);
  return `<section class="team-chat" aria-label="Chat interno"><div class="thread-list-head">
      <button class="icon-btn" data-inbox-nav aria-label="${inboxState(c).nav ? 'Recolher' : 'Expandir'} painel de caixas">${i(inboxState(c).nav ? 'left' : 'right',16)}</button>
      <h2>Chat interno</h2><small>Visível só para a equipe deste workspace.</small></div>
    <div class="thread-messages">${c.s.teamMessages.map(m => `<div class="message ${m.author === mine ? 'outbound' : ''}">
      <small><b>${h(m.author)}</b> · ${date(m.created,c,true)}</small><p>${messageContent(m.body)}</p></div>`).join('') || empty('Nenhuma mensagem da equipe','Combine retornos e passe contexto sem que o contato veja.','chat')}</div>
    <form class="message-compose" data-form="team-message"><textarea name="body" maxlength="2000" placeholder="Escreva para a equipe…" aria-label="Mensagem para a equipe" required></textarea>
      <button class="primary">${i('send',15)} Enviar</button></form></section>`;
}

export function inboxPage(c) {
  const st = inboxState(c);
  if (st.box.startsWith('view:') && !c.s.inboxViews.some(v => `view:${v.id}` === st.box)) st.box = 'team';
  const all = inboxThreads(c.s);
  const internal = st.box === 'internal';
  const middle = internal ? teamChat(c) : listPanel(c, st, visibleThreads(c, all)) + threadPanel(c, all) + contactPanel(c, st, all);
  return `<div class="conversation-page">${whatsappNotice(c.s)}<div class="inbox-shell ${st.nav ? 'nav-open' : ''} ${internal ? 'internal' : ''} ${c.thread && !internal ? 'has-thread' : ''}">${navPanel(c, st, all)}${middle}</div></div>`;
}

// Event handlers. `ctx` carries app.js helpers so this module stays free of app state wiring.
export async function inboxClick(b, d, ctx) {
  const { c, mutate, render, flash, dialog, close } = ctx;
  if (c.view !== 'conversations') return false;
  const st = inboxState(c);
  if ('inboxNav' in d) { st.nav = !st.nav; render(); return true; }
  if (d.inboxBox) {
    st.box = d.inboxBox; st.picked = []; c.thread = '';
    if (matchMedia('(max-width: 760px)').matches) st.nav = false;
    close(); render(); return true;
  }
  if ('inboxSort' in d) { st.sortOpen = !st.sortOpen; render(); return true; }
  if (d.inboxSortPick) { st.sort = d.inboxSortPick; st.sortOpen = false; render(); return true; }
  if (d.inboxPanel) { st.panel = d.inboxPanel; render(); return true; }
  if (d.inboxRuleRemove) { st.rules.splice(Number(d.inboxRuleRemove), 1); render(); return true; }
  if ('inboxRulesClear' in d) { st.rules = []; render(); return true; }
  if ('inboxNew' in d) {
    dialog('Iniciar uma nova conversa', `<p>Converse com contatos ou alinhe o atendimento com a equipe.</p><div class="new-conversation">
      <button type="button" class="choice" data-act="new-thread">${i('contacts',22)}<strong>Mensagem para contatos</strong><span>Abra a conversa com um ou mais contatos.</span></button>
      <button type="button" class="choice" data-inbox-box="internal">${i('users',22)}<strong>Mensagem para a equipe</strong><span>Fale com colegas no chat interno.</span></button></div>`);
    return true;
  }
  if ('inboxFilter' in d) {
    dialog('Filtros', ruleEditor(c, st.rules, st.match), { form:'inbox-filter',
      buttons:'<button class="secondary" type="button" data-inbox-filter-clear>Limpar</button><button class="primary">Aplicar</button>' });
    return true;
  }
  if ('inboxCreateView' in d) {
    dialog('Criar visão', `<label>Nome da visão<input name="name" maxlength="60" required></label>${ruleEditor(c, st.rules, st.match)}`,
      { form:'inbox-view', description:'Salve um conjunto de filtros como uma caixa na barra lateral.' });
    return true;
  }
  if ('inboxFilterClear' in d) { st.rules = []; close(); render(); return true; }
  if (d.inboxDeleteView) {
    await mutate({ type:'delete', key:'inboxViews', id:d.inboxDeleteView });
    if (st.box === `view:${d.inboxDeleteView}`) st.box = 'team';
    render(); flash('Visão excluída.'); return true;
  }
  if ('ruleAdd' in d) { b.closest('form').querySelector('[data-rules]').insertAdjacentHTML('beforeend', ruleRow(c)); return true; }
  if ('ruleRemove' in d) {
    const list = b.closest('[data-rules]');
    if (list.children.length > 1) b.closest('[data-rule]').remove();
    return true;
  }
  if ('inboxFollow' in d) {
    const following = b.getAttribute('aria-pressed') === 'true';
    await mutate({ type:'thread', data:{ contactId:c.thread, follow:!following } });
    render(); flash(following ? 'Você deixou de seguir a conversa.' : 'Você está seguindo a conversa.'); return true;
  }
  if (d.inboxBulk) {
    const change = { read:{ read:true }, unread:{ read:false }, star:{ starred:true }, unstar:{ starred:false } }[d.inboxBulk];
    const n = st.picked.length;
    await mutate({ type:'thread', data:{ contactIds:st.picked, ...change } });
    st.picked = []; render(); flash(`${n} conversa${n > 1 ? 's' : ''} atualizada${n > 1 ? 's' : ''}.`); return true;
  }
  return false;
}

export async function inboxChange(el, ctx) {
  const { c, mutate, render, flash } = ctx;
  if (c.view !== 'conversations') return false;
  const st = inboxState(c);
  if (el.dataset.inboxPick) {
    st.picked = el.checked ? [...new Set([...st.picked, el.dataset.inboxPick])] : st.picked.filter(id => id !== el.dataset.inboxPick);
    render(); document.querySelector(`[data-inbox-pick="${el.dataset.inboxPick}"]`)?.focus(); return true;
  }
  if ('inboxPickAll' in el.dataset) {
    st.picked = el.checked ? visibleThreads(c).map(t => t.contact.id) : [];
    render(); document.querySelector('[data-inbox-pick-all]')?.focus(); return true;
  }
  if ('ruleField' in el.dataset) {
    el.closest('[data-rule]').querySelector('[data-rule-value]').innerHTML = options(ruleValues(c, el.value), '');
    return true;
  }
  if ('inboxAssign' in el.dataset) {
    await mutate({ type:'thread', data:{ contactId:c.thread, assignee:el.value } });
    render(); flash(el.value ? `Conversa atribuída a ${el.value}.` : 'Atribuição removida.'); return true;
  }
  if ('inboxBulkAssign' in el.dataset && el.value !== '__') {
    const n = st.picked.length;
    await mutate({ type:'thread', data:{ contactIds:st.picked, assignee:el.value } });
    st.picked = []; render(); flash(`${n} conversa${n > 1 ? 's' : ''} ${el.value ? `atribuída${n > 1 ? 's' : ''} a ${el.value}` : 'sem atribuição'}.`); return true;
  }
  return false;
}

// Returns the confirmation message for an inbox form, or null when the form is not the inbox's.
export async function inboxSubmit(name, form, data, ctx) {
  const { c, mutate, render, close } = ctx;
  const st = inboxState(c);
  if (name === 'inbox-filter') {
    st.rules = readRules(form); st.match = data.match === 'or' ? 'or' : 'and'; st.picked = [];
    close(); render(); return st.rules.length ? 'Filtros aplicados.' : 'Filtros removidos.';
  }
  if (name === 'inbox-view') {
    const rules = readRules(form);
    if (!rules.length) throw Error('Adicione pelo menos uma condição.');
    const id = await mutate({ type:'save', key:'inboxViews', data:{ name:data.name, match:data.match, rules } });
    st.box = `view:${id}`; st.rules = []; c.thread = ''; close(); render(); return 'Visão criada.';
  }
  if (name === 'team-message') {
    await mutate({ type:'team-message', data:{ body:data.body } });
    render(); document.querySelector('.team-chat textarea')?.focus(); return 'Mensagem enviada para a equipe.';
  }
  return null;
}
