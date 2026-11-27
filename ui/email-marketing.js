// Marketing → E-mails: statistics, campaigns and templates, the block editor with a live preview, and the
// report of each campaign (opens, clicks, unsubscribes and the A/B result). Follows GoHighLevel's
// /marketing/emails (Statistics, Campaigns, Templates); the names, texts and look are Graao's.
import { aiTool } from './content-ai.js';
import { sequencesScreen } from './sequences.js';
import { colorOf, defaultBoard } from './brand-data.js';
import { contentTones } from './content-ai-data.js';
import { icon } from './icons.js';
import { h, pageShell, search } from './screens.js';
import { BLOCK_TYPES, FONTS, MAX_BLOCKS, MERGE_FIELDS, mergeValues, newBlock, renderEmail, fillText, starterDesign } from './email-blocks.js';
import { ask } from './ask.js';

export const emailTabs = ['email', 'email-campaigns', 'email-templates', 'email-campaign', 'email-template', 'email-report', 'email-sequences', 'email-sequence'];
const ed = { key: '', draft: null, dirty: false, open: 0, device: 'desktop' };
const STATUS = { draft: ['Rascunho', ''], scheduled: ['Agendada', 'blue'], testing: ['Teste A/B', 'blue'], sending: ['Enviando', 'blue'], sent: ['Enviada', 'green'], cancelled: ['Cancelada', 'red'] };
const badge = (label, tone = '') => `<span class="badge ${tone}">${h(label)}</span>`;
const people = n => `${n || 0} contato${n === 1 ? '' : 's'}`;
const pct = (part, whole) => whole ? `${Math.round(part / whole * 1000) / 10}%`.replace('.', ',') : '—';
const when = iso => { const d = new Date(iso); return iso && !Number.isNaN(d.getTime()) ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'; };
const field = (label, control, hint = '') => `<label class="em-field"><span>${h(label)}</span>${control}${hint ? `<small class="dim">${hint}</small>` : ''}</label>`;
// The AI button sits beside the label, outside it, so clicking the label still focuses the field.
let aiOn = false;
const aiField = (label, control, target, hint = '') => aiOn ? `<div class="ai-wrap">${field(label, control, hint)}${aiTool(target, 'email', label)}</div>` : field(label, control, hint);
const isEmail = value => /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z0-9-]{2,}$/i.test(value);

const secondary = current => `<nav class="em-subtabs" aria-label="Seções de e-mail">${[['email', 'Estatísticas'], ['email-campaigns', 'Campanhas'], ['email-sequences', 'Sequências'], ['email-templates', 'Modelos']]
  .map(([key, label]) => `<a href="#marketing/${key}" class="${key === current ? 'active' : ''}"${key === current ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
const shell = (c, ctx, current, content, cta = '') => pageShell({ title: 'Marketing', desc: 'Monte e-mails com blocos, envie para os seus contatos e acompanhe aberturas e cliques.', cta,
  tabs: { key: 'marketing', items: ctx.marketingTabs, current: 'email', label: 'Seções de marketing' }, content: secondary(current) + content });

/** Contacts that the audience reaches (same rules as the server: e-mail, not DND, not unsubscribed, unique). */
function reach(c, audience) {
  const wanted = (audience?.tags || []).map(tag => tag.toLowerCase()), seen = new Set();
  let n = 0;
  for (const contact of c.s.contacts) {
    const email = String(contact.email || '').trim().toLowerCase();
    if (!isEmail(email) || contact.dnd || contact.emailUnsubscribed || contact.optOut?.email || seen.has(email)) continue;
    if (audience?.topicId && contact.topics?.[audience.topicId] === false) continue;
    if (audience?.mode === 'tags' && !(contact.tags || []).some(tag => wanted.includes(String(tag).toLowerCase()))) continue;
    seen.add(email); n++;
  }
  return n;
}
const allTags = c => [...new Set([...(c.s.tags || []).map(t => t.name || t), ...c.s.contacts.flatMap(row => row.tags || [])].filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
const sampleValues = c => mergeValues(c.s.contacts.find(row => row.email) || { name: 'Ana Souza', email: 'ana@exemplo.com.br', company: 'Exemplo' }, c.s.profile);

// ---------- Statistics ----------
function statistics(c, ctx) {
  const days = Number(c.emailDays) || 30, since = Date.now() - days * 864e5;
  const rows = (c.s.emailCampaigns || []).filter(row => row.startedAt && Date.parse(row.startedAt) >= since).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const sum = key => rows.reduce((n, row) => n + (row.stats?.[key] || 0), 0);
  const sent = sum('sent');
  const kpi = (label, value, note = '') => `<div class="surface padded em-kpi"><span class="dim">${h(label)}</span><b>${value}</b>${note ? `<small class="dim">${note}</small>` : ''}</div>`;
  const table = rows.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Campanha</th><th scope="col">Envio</th><th scope="col">Enviados</th><th scope="col">Abertura</th><th scope="col">Cliques</th><th scope="col">Tipo</th></tr></thead><tbody>${rows.map(row => {
      const st = row.stats || {};
      return `<tr><td><a class="text-link" href="#marketing/email-report/${h(row.id)}"><b>${h(row.name)}</b></a></td><td>${h(when(row.startedAt))}</td><td>${st.sent || 0}</td><td>${pct(st.opened, st.sent)}</td><td>${pct(st.clicked, st.sent)}</td><td>${row.ab?.enabled ? badge('Teste A/B', 'blue') : 'Normal'}</td></tr>`;
    }).join('')}</tbody></table></div>`
    : `<div class="surface padded empty">${icon('send', 22)}<strong>Nenhuma campanha enviada nos últimos ${days} dias</strong><p>Crie uma campanha, envie e os números aparecem aqui.</p><a class="primary" href="#marketing/email-campaigns">Ver campanhas</a></div>`;
  return shell(c, ctx, 'email', `<div class="toolbar"><label class="em-period">Período <select data-em-days>${[7, 30, 90, 365].map(n => `<option value="${n}"${n === days ? ' selected' : ''}>Últimos ${n} dias</option>`).join('')}</select></label></div>
    <div class="em-kpis">${kpi('Campanhas', rows.length)}${kpi('E-mails enviados', sent)}${kpi('Taxa de abertura', pct(sum('opened'), sent), `${sum('opened')} abertura${sum('opened') === 1 ? '' : 's'}`)}${kpi('Taxa de cliques', pct(sum('clicked'), sent), `${sum('clicked')} clique${sum('clicked') === 1 ? '' : 's'}`)}${kpi('Cancelaram a inscrição', sum('unsubscribed'))}</div>${table}`,
    `<button type="button" class="primary" data-em-act="new-campaign">${icon('plus', 16)} Nova campanha</button>`);
}

// ---------- Lists ----------
function campaigns(c, ctx) {
  const q = String(c.query || '').toLowerCase();
  const rows = (c.s.emailCampaigns || []).filter(row => !q || `${row.name} ${row.subject}`.toLowerCase().includes(q)).sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
  const body = rows.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Campanha</th><th scope="col">Status</th><th scope="col">Data</th><th scope="col">Enviados</th><th scope="col">Abertura</th><th scope="col">Cliques</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows.map(row => {
      const [label, tone] = STATUS[row.status] || STATUS.draft, st = row.stats || {}, draft = row.status === 'draft';
      const date = row.status === 'scheduled' ? row.scheduledAt : row.startedAt || row.updated || row.created;
      return `<tr><td><a class="text-link" href="#marketing/${draft ? 'email-campaign' : 'email-report'}/${h(row.id)}"><b>${h(row.name)}</b></a><br><small class="dim">${h(row.subject || 'Sem assunto')}</small></td>
        <td>${badge(label, tone)}</td><td>${h(when(date))}</td><td>${draft ? '—' : st.sent || 0}</td><td>${draft ? '—' : pct(st.opened, st.sent)}</td><td>${draft ? '—' : pct(st.clicked, st.sent)}</td>
        <td class="right"><span class="inline-gap"><button type="button" class="icon-btn" data-em-act="duplicate" data-id="${h(row.id)}" title="Duplicar" aria-label="Duplicar ${h(row.name)}">${icon('copy', 15)}</button>${['sending', 'testing'].includes(row.status) ? '' : `<button type="button" class="icon-btn" data-em-act="delete" data-key="emailCampaigns" data-id="${h(row.id)}" title="Excluir" aria-label="Excluir ${h(row.name)}">${icon('trash', 15)}</button>`}</span></td></tr>`;
    }).join('')}</tbody></table></div>`
    : `<div class="surface padded empty">${icon('send', 22)}<strong>Nenhuma campanha ainda</strong><p>Monte o e-mail com blocos, escolha o público e envie.</p><button type="button" class="primary" data-em-act="new-campaign">Nova campanha</button></div>`;
  return shell(c, ctx, 'email-campaigns', `<div class="toolbar">${search(c.query || '', 'Buscar campanhas…')}</div>${body}`,
    `<button type="button" class="primary" data-em-act="new-campaign">${icon('plus', 16)} Nova campanha</button>`);
}

function templates(c, ctx) {
  const rows = (c.s.emailTemplates || []).slice().sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
  const body = rows.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Modelo</th><th scope="col">Assunto</th><th scope="col">Atualizado</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>${rows.map(row =>
      `<tr><td><a class="text-link" href="#marketing/email-template/${h(row.id)}"><b>${h(row.name)}</b></a></td><td>${h(row.subject || '—')}</td><td>${h(when(row.updated || row.created))}</td>
        <td class="right"><span class="inline-gap"><button type="button" class="secondary" data-em-act="use-template" data-id="${h(row.id)}">Usar em campanha</button><button type="button" class="icon-btn" data-em-act="delete" data-key="emailTemplates" data-id="${h(row.id)}" title="Excluir" aria-label="Excluir ${h(row.name)}">${icon('trash', 15)}</button></span></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="surface padded empty">${icon('file', 22)}<strong>Nenhum modelo ainda</strong><p>Guarde um layout para reaproveitar em várias campanhas.</p><button type="button" class="primary" data-em-act="new-template">Novo modelo</button></div>`;
  return shell(c, ctx, 'email-templates', body, `<button type="button" class="primary" data-em-act="new-template">${icon('plus', 16)} Novo modelo</button>`);
}

// ---------- Editor ----------
function load(c, kind) {
  const key = `${kind}:${c.emailId}`, list = kind === 'campaign' ? c.s.emailCampaigns : c.s.emailTemplates;
  const row = (list || []).find(item => item.id === c.emailId);
  if (!row) return null;
  if (ed.key !== key || !ed.draft) Object.assign(ed, { key, dirty: false, open: 0, draft: structuredClone({ name: row.name, subject: row.subject || '', preheader: row.preheader || '', fromName: row.fromName || '', replyTo: row.replyTo || '',
    blocks: row.blocks || [], style: row.style || starterDesign().style, audience: row.audience || { mode: 'all', tags: [] }, ab: row.ab || { enabled: false, subjectB: '', preheaderB: '', testPercent: 20, metric: 'opens', waitHours: 4 } }) });
  return row;
}

function blockEditor(b, i, count, open, timers = []) {
  const label = BLOCK_TYPES.find(([type]) => type === b.type)?.[1] || b.type;
  const align = (value, def = 'left') => `<select data-em-b="align" data-i="${i}">${[['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']].map(([v, l]) => `<option value="${v}"${(value || def) === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  const input = (prop, value, attrs = '') => `<input data-em-b="${prop}" data-i="${i}" value="${h(value ?? '')}" ${attrs}>`;
  let body = '';
  if (b.type === 'heading') body = aiField('Texto', input('text', b.text, 'maxlength="300"'), `[data-em-b="text"][data-i="${i}"]`) + `<div class="em-two">${field('Tamanho', `<select data-em-b="level" data-i="${i}"><option value="1"${b.level !== 2 ? ' selected' : ''}>Grande</option><option value="2"${b.level === 2 ? ' selected' : ''}>Médio</option></select>`)}${field('Alinhamento', align(b.align))}</div>`;
  if (b.type === 'text') body = aiField('Texto', `<textarea data-em-b="text" data-i="${i}" rows="6" maxlength="8000">${h(b.text)}</textarea>`, `[data-em-b="text"][data-i="${i}"]`, 'Use **negrito**, *itálico* e [texto do link](https://…). Uma linha em branco separa parágrafos.') + field('Alinhamento', align(b.align));
  if (b.type === 'button') body = `<div class="em-two">${aiField('Texto do botão', input('label', b.label, 'maxlength="80"'), `[data-em-b="label"][data-i="${i}"]`)}${field('Link', input('url', b.url, 'type="url" placeholder="https://"'))}</div><div class="em-two">${field('Cor', `<input type="color" data-em-b="color" data-i="${i}" value="${h(b.color || '#ff4f9a')}">`, 'Vazio usa a cor de destaque.')}${field('Alinhamento', align(b.align, 'center'))}</div>`;
  if (b.type === 'image') body = field('Endereço da imagem (https)', input('src', b.src, 'type="url" placeholder="https://…/imagem.jpg"'), 'Use uma imagem pública, como as da Mídia Drive ou do seu site.') + `<div class="em-two">${field('Texto alternativo', input('alt', b.alt, 'maxlength="200"'))}${field('Link ao clicar', input('url', b.url, 'type="url" placeholder="https:// (opcional)"'))}</div><div data-bui="email-tune" data-kind="image" data-i="${i}" data-width="${h(b.width ?? 100)}" data-align="${h(b.align || 'center')}"></div><div class="em-two bui-tune-source">${field('Largura (%)', input('width', b.width, 'type="number" min="20" max="100" step="5"'))}${field('Alinhamento', align(b.align, 'center'))}</div>`;
  if (b.type === 'spacer') body = `<div data-bui="email-tune" data-kind="spacer" data-i="${i}" data-height="${h(b.height ?? 24)}"></div><div class="bui-tune-source">${field('Altura (px)', input('height', b.height, 'type="number" min="8" max="80" step="4"'))}</div>`;
  if (b.type === 'divider') body = '<p class="dim">Uma linha fina separa as seções.</p>';
  if (b.type === 'countdown') body = timers.length
    ? field('Contador', `<select data-em-b="timerId" data-i="${i}"><option value="">Escolha um contador…</option>${timers.map(t => `<option value="${h(t.id)}"${t.id === b.timerId ? ' selected' : ''}>${h(t.name)}</option>`).join('')}</select>`,
        'A imagem anima por 1 minuto a partir de quando o e-mail é aberto. Contadores “evergreen” contam a partir do envio.') + field('Alinhamento', align(b.align, 'center'))
    : '<p class="dim">Nenhum contador criado ainda. <a class="text-link" href="#marketing/countdown">Criar em Marketing → Contadores</a>.</p>';
  const summary = b.type === 'text' ? String(b.text || '').split('\n')[0] : b.type === 'heading' ? b.text : b.type === 'button' ? b.label : b.type === 'image' ? b.alt || b.src : '';
  return `<li class="em-block${open ? ' open' : ''}"><div class="em-block-head"><button type="button" class="em-block-toggle" data-em-act="toggle" data-i="${i}" aria-expanded="${open}"><b>${h(label)}</b><span class="dim ellipsis">${h(summary || '')}</span></button>
    <span class="inline-gap"><button type="button" class="icon-btn" data-em-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Subir" aria-label="Subir bloco">${icon('arrowUp', 14)}</button><button type="button" class="icon-btn" data-em-act="down" data-i="${i}" ${i === count - 1 ? 'disabled' : ''} title="Descer" aria-label="Descer bloco">${icon('arrowDown', 14)}</button><button type="button" class="icon-btn" data-em-act="remove" data-i="${i}" title="Remover" aria-label="Remover bloco">${icon('trash', 14)}</button></span></div>
    ${open ? `<div class="em-block-body">${body}</div>` : ''}</li>`;
}

function preview(c) {
  const d = ed.draft, values = sampleValues(c);
  const { html } = renderEmail({ blocks: d.blocks, style: d.style, preheader: fillText(d.preheader, values), business: c.s.profile?.name, values, unsubscribe: '#', keepUnknown: true,
    countdownSrc: id => (c.s.countdownTimers || []).some(t => t.id === id) ? `${location.origin}/cd/${c.workspace}/${id}.gif` : '' });
  return { html, subject: fillText(d.subject, values, true), from: d.fromName || c.s.profile?.name || 'Graao' };
}
const previewHead = p => `<p><b>De:</b> ${h(p.from)}</p><p><b>Assunto:</b> ${h(p.subject || 'Sem assunto')}</p>`;

function editor(c, ctx, kind) {
  const row = load(c, kind);
  if (!row) return shell(c, ctx, kind === 'campaign' ? 'email-campaigns' : 'email-templates', `<div class="surface padded empty"><strong>Não encontramos este e-mail</strong><a class="secondary" href="#marketing/${kind === 'campaign' ? 'email-campaigns' : 'email-templates'}">Voltar</a></div>`);
  if (kind === 'campaign' && row.status !== 'draft') { location.replace(`#marketing/email-report/${row.id}`); return ''; }
  aiOn = Boolean(c.features?.contentAI);
  const d = ed.draft, camp = kind === 'campaign', p = preview(c), tags = allTags(c);
  const chips = `<p class="em-vars"><span class="dim">Campos:</span> ${MERGE_FIELDS.map(([token, label]) => `<button type="button" class="chip" data-em-var="${h(token)}" title="${h(label)}">${h(token)}</button>`).join(' ')}</p>`;
  const audience = camp ? `<section class="surface padded em-section"><h2>Público</h2>
      <fieldset class="em-radios"><label><input type="radio" name="em-aud" data-em-aud="all"${d.audience.mode !== 'tags' ? ' checked' : ''}> Todos os contatos</label><label><input type="radio" name="em-aud" data-em-aud="tags"${d.audience.mode === 'tags' ? ' checked' : ''}> Contatos com as tags</label></fieldset>
      ${d.audience.mode === 'tags' ? (tags.length ? `<div class="em-tags">${tags.map(tag => `<label class="chip"><input type="checkbox" data-em-tag="${h(tag)}"${d.audience.tags.includes(tag) ? ' checked' : ''}> ${h(tag)}</label>`).join('')}</div>` : '<p class="dim">Nenhuma tag nos contatos ainda.</p>') : ''}
      <label>Assunto (central de preferências)<select data-em-topic><option value="">Sem assunto: todos que aceitam e-mail</option>${(c.s.preferences?.topics || [{ id: 'novidades', name: 'Novidades' }, { id: 'promocoes', name: 'Promoções' }]).map(t => `<option value="${h(t.id)}"${d.audience.topicId === t.id ? ' selected' : ''}>${h(t.name)}</option>`).join('')}</select></label>
      <p class="em-reach" data-em-reach>${reachText(c)}</p></section>
    <section class="surface padded em-section"><div class="inline-gap"><h2>Teste A/B do assunto</h2><label class="switch-line"><input type="checkbox" data-em-ab="enabled"${d.ab.enabled ? ' checked' : ''}> Ativar</label></div>
      ${d.ab.enabled ? `<p class="dim">Uma parte do público recebe o assunto A ou o B. Depois da espera, o restante recebe o vencedor.</p>
      ${aiField('Assunto B', `<input data-em-ab="subjectB" maxlength="200" value="${h(d.ab.subjectB)}">`, '[data-em-ab="subjectB"]')}${aiField('Pré-cabeçalho B', `<input data-em-ab="preheaderB" maxlength="200" value="${h(d.ab.preheaderB)}" placeholder="Vazio usa o pré-cabeçalho A">`, '[data-em-ab="preheaderB"]')}
      <div class="em-three">${field('Grupo de teste', `<select data-em-ab="testPercent">${[10, 20, 30, 40, 50].map(n => `<option value="${n}"${Number(d.ab.testPercent) === n ? ' selected' : ''}>${n}% do público</option>`).join('')}</select>`)}
        ${field('Vence quem tiver mais', `<select data-em-ab="metric"><option value="opens"${d.ab.metric !== 'clicks' ? ' selected' : ''}>Aberturas</option><option value="clicks"${d.ab.metric === 'clicks' ? ' selected' : ''}>Cliques</option></select>`)}
        ${field('Esperar', `<select data-em-ab="waitHours">${[1, 2, 4, 8, 12, 24, 48, 72].map(n => `<option value="${n}"${Number(d.ab.waitHours) === n ? ' selected' : ''}>${n} h</option>`).join('')}</select>`)}</div>` : '<p class="dim">Descubra qual assunto abre mais: teste dois assuntos com parte do público antes de enviar para todos.</p>'}</section>` : '';
  const settings = `<section class="surface padded em-section"><div class="em-section-head"><h2>Mensagem</h2>${aiOn ? `<button type="button" class="secondary" data-em-act="ai-write">${icon('spark', 14)} Escrever com IA</button>` : ''}</div>
      ${aiField('Assunto', `<input data-em="subject" maxlength="200" value="${h(d.subject)}" placeholder="Ex.: {{contact.first_name}}, chegou a sua oferta">`, '[data-em="subject"]')}
      ${aiField('Pré-cabeçalho', `<input data-em="preheader" maxlength="200" value="${h(d.preheader)}" placeholder="Aparece ao lado do assunto na caixa de entrada">`, '[data-em="preheader"]')}
      <div class="em-two">${field('Nome do remetente', `<input data-em="fromName" maxlength="80" value="${h(d.fromName)}" placeholder="${h(c.s.profile?.name || '')}">`)}${field('Responder para', `<input type="email" data-em="replyTo" maxlength="160" value="${h(d.replyTo)}" placeholder="contato@suaempresa.com.br">`)}</div>
      ${chips}<p class="dim"><small>O endereço de envio é o domínio da subconta em <a class="text-link" href="#settings/email">Configurações → Serviços de e-mail</a> ou, sem ele, o da plataforma.</small></p></section>`;
  const brand = defaultBoard(c.s.brandBoards);
  const style = `<section class="surface padded em-section"><div class="em-section-head"><h2>Estilo</h2>${brand ? `<button type="button" class="secondary" data-em-act="apply-brand">Aplicar marca: ${h(brand.name)}</button>` : '<a class="text-link" href="#marketing/brand">Criar a marca</a>'}</div><div class="em-colors">${[['background', 'Fundo'], ['card', 'Conteúdo'], ['text', 'Texto'], ['accent', 'Destaque']].map(([k, l]) => field(l, `<input type="color" data-em-style="${k}" value="${h(d.style[k])}">`)).join('')}
      ${field('Fonte', `<select data-em-style="font">${FONTS.map(([v, l]) => `<option value="${h(v)}"${d.style.font === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`)}</div></section>`;
  const blocks = `<section class="surface padded em-section"><h2>Blocos</h2><ol class="em-blocks">${d.blocks.map((b, i) => blockEditor(b, i, d.blocks.length, ed.open === i, c.s.countdownTimers || [])).join('')}</ol>
      ${d.blocks.length < MAX_BLOCKS ? `<div class="em-add"><span class="dim">Adicionar:</span> ${BLOCK_TYPES.map(([type, label]) => `<button type="button" class="secondary" data-em-act="add" data-type="${type}">${icon('plus', 13)} ${label}</button>`).join('')}</div>` : ''}</section>`;
  const back = camp ? 'email-campaigns' : 'email-templates';
  const actions = `<span class="inline-gap"><button type="button" class="secondary" data-em-act="test">${icon('send', 15)} Enviar teste</button>${camp ? `<button type="button" class="secondary" data-em-act="save-template">Salvar como modelo</button>` : ''}
    <button type="button" class="${camp ? 'secondary' : 'primary'}" data-em-act="save"${ed.dirty ? '' : ' disabled'}>Salvar</button>${camp ? `<button type="button" class="primary" data-em-act="schedule">Enviar ou agendar</button>` : ''}</span>`;
  return pageShell({ title: camp ? 'Campanha de e-mail' : 'Modelo de e-mail', desc: '', cta: actions,
    tabs: { key: 'marketing', items: ctx.marketingTabs, current: 'email', label: 'Seções de marketing' },
    content: `<div class="em-titlebar"><a class="secondary" href="#marketing/${back}">${icon('left', 15)} Voltar</a><input class="em-name" data-em="name" maxlength="120" value="${h(d.name)}" aria-label="Nome"></div>
      <div class="em-editor"><div class="em-side">${settings}${audience}${blocks}${style}</div>
      <div class="em-preview surface padded"><div class="inline-gap em-preview-bar"><b>Prévia</b><span class="em-device">${[['desktop', 'Computador'], ['mobile', 'Celular']].map(([k, l]) => `<button type="button" class="${ed.device === k ? 'active' : ''}" data-em-act="device" data-device="${k}" aria-pressed="${ed.device === k}">${l}</button>`).join('')}</span></div>
        <div class="em-preview-head" data-em-head>${previewHead(p)}</div><iframe class="em-frame ${ed.device}" title="Prévia do e-mail" sandbox="allow-same-origin" data-em-frame srcdoc="${h(p.html)}"></iframe></div></div>` });
}
function reachText(c) {
  const n = reach(c, ed.draft.audience);
  return n ? `<b>${n}</b> contato${n === 1 ? '' : 's'} vão receber${n > 2000 ? ' (no máximo 2.000 por campanha)' : ''}. Contatos sem e-mail, em não perturbe ou que saíram da lista ficam de fora.` : 'Nenhum contato com e-mail neste público.';
}

// ---------- Report ----------
function report(c, ctx) {
  const row = (c.s.emailCampaigns || []).find(item => item.id === c.emailId);
  if (!row) return shell(c, ctx, 'email-campaigns', '<div class="surface padded empty"><strong>Campanha não encontrada</strong></div>');
  if (row.status === 'draft') { location.replace(`#marketing/email-campaign/${row.id}`); return ''; }
  const st = row.stats || {}, [label, tone] = STATUS[row.status] || STATUS.draft;
  const kpi = (name, value, note = '') => `<div class="surface padded em-kpi"><span class="dim">${h(name)}</span><b>${value}</b>${note ? `<small class="dim">${note}</small>` : ''}</div>`;
  const ab = row.ab?.enabled ? (() => {
    const v = st.variants || {}, metric = row.ab.metric === 'clicks' ? 'cliques' : 'aberturas';
    const line = (k, subject) => `<tr><td><b>${k}</b>${row.ab.winner === k ? ` ${badge('Vencedor', 'green')}` : ''}</td><td>${h(subject)}</td><td>${v[k]?.sent || 0}</td><td>${pct(v[k]?.opened, v[k]?.sent)}</td><td>${pct(v[k]?.clicked, v[k]?.sent)}</td></tr>`;
    const status = row.status === 'testing' ? `O vencedor por ${metric} é escolhido em ${h(when(row.testEndsAt))}; o restante do público recebe o assunto vencedor.` : row.ab.winner ? `O assunto ${row.ab.winner} venceu por ${metric} e foi para o restante do público.` : '';
    return `<section class="surface padded em-section"><h2>Teste A/B</h2><p class="dim">${status}</p><div class="table-shell"><table><thead><tr><th scope="col">Versão</th><th scope="col">Assunto</th><th scope="col">Enviados no teste</th><th scope="col">Abertura</th><th scope="col">Cliques</th></tr></thead><tbody>${line('A', row.subject)}${line('B', row.ab.subjectB)}</tbody></table></div></section>`;
  })() : '';
  const recipient = r => {
    const state = { sent: 'Enviado', failed: 'Falhou', queued: 'Na fila', sending: 'Enviando', held: 'Aguardando o teste', skipped: 'Cancelado' }[r.st] || r.st;
    return `<tr><td>${h(r.n || '—')}</td><td>${h(r.e)}</td><td>${r.st === 'failed' ? `<span title="${h(r.err || '')}">${badge(state, 'red')}</span>` : h(state)}${r.v && row.ab?.enabled ? ` <small class="dim">${h(r.v)}</small>` : ''}</td><td>${r.o ? h(when(r.o)) : '—'}</td><td>${r.k ? `${h(when(r.k))}${r.clicks > 1 ? ` <small class="dim">(${r.clicks}×)</small>` : ''}` : '—'}</td><td>${r.u ? badge('Saiu', 'red') : ''}</td></tr>`;
  };
  const list = row.recipients || [], shown = list.slice(0, 300);
  const recipients = list.length ? `<section class="surface padded em-section"><h2>Destinatários</h2><div class="table-shell"><table><thead><tr><th scope="col">Nome</th><th scope="col">E-mail</th><th scope="col">Envio</th><th scope="col">Abriu</th><th scope="col">Clicou</th><th scope="col"><span class="sr-only">Inscrição</span></th></tr></thead><tbody>${shown.map(recipient).join('')}</tbody></table></div>${list.length > shown.length ? `<p class="dim">Mostrando 300 de ${list.length}.</p>` : ''}</section>` : '';
  const when2 = row.status === 'scheduled' ? `Agendada para ${h(when(row.scheduledAt))}.` : row.startedAt ? `Envio iniciado em ${h(when(row.startedAt))}${row.completedAt ? `, concluído em ${h(when(row.completedAt))}` : ''}.` : '';
  const cancel = ['scheduled', 'sending', 'testing'].includes(row.status) ? `<button type="button" class="secondary" data-em-act="cancel" data-id="${h(row.id)}">${row.status === 'scheduled' ? 'Cancelar agendamento' : 'Parar envio'}</button>` : '';
  return pageShell({ title: row.name, desc: `Assunto: ${row.subject}`, cta: `<span class="inline-gap"><button type="button" class="secondary" data-em-act="refresh">${icon('refresh', 15)} Atualizar</button>${cancel}<button type="button" class="secondary" data-em-act="duplicate" data-id="${h(row.id)}">${icon('copy', 15)} Duplicar</button></span>`,
    tabs: { key: 'marketing', items: ctx.marketingTabs, current: 'email', label: 'Seções de marketing' },
    content: `${secondary('email-campaigns')}<p class="inline-gap">${badge(label, tone)} <span class="dim">${when2}</span></p>
      <div class="em-kpis">${kpi('Destinatários', st.recipients || 0)}${kpi('Enviados', st.sent || 0, st.pending ? `${st.pending} na fila` : '')}${kpi('Abertura', pct(st.opened, st.sent), people(st.opened))}${kpi('Cliques', pct(st.clicked, st.sent), people(st.clicked))}${kpi('Saíram da lista', st.unsubscribed || 0)}${kpi('Falhas', st.failed || 0)}</div>
      <p class="dim"><small>Aberturas dependem de o leitor de e-mail carregar imagens; alguns abrem automaticamente. Cliques são o número mais confiável.</small></p>${ab}${recipients}` });
}

export function emailMarketingScreen(c, ctx) {
  if (c.tab === 'email-campaigns') return campaigns(c, ctx);
  if (c.tab === 'email-templates') return templates(c, ctx);
  if (c.tab === 'email-campaign') return editor(c, ctx, 'campaign');
  if (c.tab === 'email-template') return editor(c, ctx, 'template');
  if (c.tab === 'email-report') return report(c, ctx);
  if (c.tab === 'email-sequences' || c.tab === 'email-sequence') return sequencesScreen(c, body => shell(c, ctx, 'email-sequences', body));
  return statistics(c, ctx);
}

const localInput = at => { const d = new Date(at - new Date(at).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

// Puts an AI draft into the editor: subject lines and the first heading, text and button.
export function applyEmailDraft(d, draft) {
  d.subject = draft.subject;
  d.preheader = draft.preheader;
  if (d.ab.enabled && draft.subjectB) d.ab.subjectB = draft.subjectB;
  const put = (type, values, after) => {
    const found = d.blocks.find(b => b.type === type);
    if (found) return Object.assign(found, values);
    const block = { ...newBlock(type), ...values };
    d.blocks.splice(after ? d.blocks.indexOf(after) + 1 : 0, 0, block);
    return block;
  };
  const heading = put('heading', { text: draft.heading });
  const text = put('text', { text: draft.body }, heading);
  put('button', { label: draft.buttonLabel }, text);
}

export function installEmailMarketing({ c, mutate, flash, dialog, close, render, api, url, load: reload }) {
  const here = () => c.view === 'marketing' && emailTabs.includes(c.tab);
  const editing = () => here() && ['email-campaign', 'email-template'].includes(c.tab) && ed.draft;
  const kind = () => c.tab === 'email-campaign' ? 'campaign' : 'template';
  let focused = null;
  const refresh = () => {
    if (!editing()) return;
    const save = document.querySelector('[data-em-act="save"]'); if (save) save.disabled = !ed.dirty;
    const p = preview(c);
    const frame = document.querySelector('[data-em-frame]'); if (frame) frame.srcdoc = p.html;
    const head = document.querySelector('[data-em-head]'); if (head) head.innerHTML = previewHead(p);
    const reachEl = document.querySelector('[data-em-reach]'); if (reachEl) reachEl.innerHTML = reachText(c);
  };
  const touch = (full = false) => { ed.dirty = true; if (full) render(); else refresh(); };
  const payload = () => ({ ...ed.draft, ab: ed.draft.ab });
  async function saveDraft() {
    await mutate({ type: 'save', key: kind() === 'campaign' ? 'emailCampaigns' : 'emailTemplates', id: c.emailId, data: payload() });
    ed.dirty = false; ed.key = '';
  }
  async function create(key, data, go) {
    const id = await mutate({ type: 'save', key, data });
    ed.key = ''; location.hash = `#marketing/${go}/${id}`;
  }
  window.addEventListener('beforeunload', event => { if (editing() && ed.dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('hashchange', () => { if (!editing()) { ed.key = ''; ed.draft = null; ed.dirty = false; } });
  document.addEventListener('focusin', event => { if (editing() && event.target.matches('[data-em="subject"],[data-em="preheader"],[data-em-b="text"],[data-em-b="label"],[data-em-ab="subjectB"],[data-em-b="text"]')) focused = event.target; });
  document.addEventListener('input', event => {
    if (!editing()) return;
    const el = event.target, d = ed.draft;
    if (el.matches('[data-em]')) { d[el.dataset.em] = el.value; touch(); }
    else if (el.matches('[data-em-b]')) {
      const b = d.blocks[Number(el.dataset.i)]; if (!b) return;
      const prop = el.dataset.emB;
      b[prop] = ['width', 'height', 'level'].includes(prop) ? Number(el.value) : el.value;
      touch();
      const summary = el.closest('.em-block')?.querySelector('.em-block-toggle .dim'); if (summary && ['text', 'label', 'alt'].includes(prop)) summary.textContent = String(el.value).split('\n')[0];
    }
    else if (el.matches('[data-em-style]')) { d.style[el.dataset.emStyle] = el.value; touch(); }
    else if (el.matches('[data-em-ab]') && el.type !== 'checkbox') { d.ab[el.dataset.emAb] = ['testPercent', 'waitHours'].includes(el.dataset.emAb) ? Number(el.value) : el.value; touch(); }
  });
  document.addEventListener('change', event => {
    const el = event.target;
    if (here() && el.matches('[data-em-days]')) { c.emailDays = Number(el.value); render(); return; }
    if (!editing()) return;
    const d = ed.draft;
    if (el.matches('[data-em-aud]')) { d.audience.mode = el.dataset.emAud; touch(true); }
    if (el.matches('[data-em-topic]')) { d.audience.topicId = el.value; touch(true); }
    else if (el.matches('[data-em-tag]')) { const tag = el.dataset.emTag; d.audience.tags = el.checked ? [...new Set([...d.audience.tags, tag])] : d.audience.tags.filter(t => t !== tag); touch(); }
    else if (el.matches('[data-em-ab="enabled"]')) { d.ab.enabled = el.checked; touch(true); }
    else if (el.matches('select[data-em-b], select[data-em-style], select[data-em-ab]')) refresh();
  });
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-em-act],[data-em-var]');
    if (!el || !here()) return;
    const ds = el.dataset, d = ed.draft;
    try {
      if (ds.emVar && editing()) {
        const target = focused?.isConnected ? focused : document.querySelector('[data-em="subject"]');
        const at = target.selectionStart ?? target.value.length;
        target.value = `${target.value.slice(0, at)}${ds.emVar}${target.value.slice(target.selectionEnd ?? at)}`;
        target.dispatchEvent(new Event('input', { bubbles: true })); target.focus(); target.setSelectionRange(at + ds.emVar.length, at + ds.emVar.length);
        return;
      }
      switch (ds.emAct) {
        case 'new-campaign': await create('emailCampaigns', { name: 'Nova campanha', subject: '', fromName: '', ...starterDesign(), audience: { mode: 'all', tags: [] } }, 'email-campaign'); break;
        case 'new-template': await create('emailTemplates', { name: 'Novo modelo', ...starterDesign() }, 'email-template'); break;
        case 'use-template': {
          const t = c.s.emailTemplates.find(row => row.id === ds.id);
          await create('emailCampaigns', { name: t.name, subject: t.subject, preheader: t.preheader, fromName: t.fromName, replyTo: t.replyTo, blocks: t.blocks, style: t.style, audience: { mode: 'all', tags: [] } }, 'email-campaign');
          break;
        }
        case 'duplicate': { const id = await mutate({ type: 'email-campaign-duplicate', id: ds.id }); flash('Campanha duplicada como rascunho.'); location.hash = `#marketing/email-campaign/${id}`; break; }
        case 'delete':
          if (!await ask('Excluir este item?', { text: 'Não dá para desfazer.', ok: 'Excluir' })) break;
          await mutate({ type: 'delete', key: ds.key, id: ds.id }); render(); flash('Excluído.'); break;
        case 'cancel':
          if (!await ask('Cancelar este envio?', { text: 'Quem ainda não recebeu não vai receber; um agendamento volta a ser rascunho.', ok: 'Cancelar envio', cancel: 'Voltar' })) break;
          await mutate({ type: 'email-campaign-cancel', id: ds.id }); render(); flash('Envio cancelado.'); break;
        case 'refresh': await reload(); render(); break;
        case 'toggle': ed.open = ed.open === Number(ds.i) ? -1 : Number(ds.i); render(); break;
        case 'add': d.blocks.push(newBlock(ds.type)); ed.open = d.blocks.length - 1; touch(true); break;
        case 'remove': d.blocks.splice(Number(ds.i), 1); ed.open = -1; touch(true); break;
        case 'up': case 'down': { const i = Number(ds.i), j = ds.emAct === 'up' ? i - 1 : i + 1; [d.blocks[i], d.blocks[j]] = [d.blocks[j], d.blocks[i]]; ed.open = j; touch(true); break; }
        case 'device': ed.device = ds.device; render(); break;
        case 'save': el.disabled = true; await saveDraft(); render(); flash('Salvo.'); break;
        case 'apply-brand': {
          const brand = defaultBoard(c.s.brandBoards);
          if (!brand || !editing()) break;
          const pick = (...roles) => roles.map(role => colorOf(brand, role)).find(Boolean);
          // The text sits on the content card, so the card takes the brand background and the page around it a neutral.
          const accent = pick('primary', 'accent', 'secondary'), text = pick('text'), card = pick('background'), background = pick('neutral') || card;
          Object.assign(d.style, { ...(accent && { accent }), ...(text && { text }), ...(card && { card }), ...(background && { background }) });
          touch(true); flash(`Cores de ${brand.name} aplicadas ao e-mail.`);
          break;
        }
        case 'save-template': { const id = await mutate({ type: 'save', key: 'emailTemplates', data: { ...payload(), name: d.name } }); flash('Modelo salvo. Ele aparece em Modelos.'); void id; break; }
        case 'test':
          dialog('Enviar e-mail de teste', `<form class="em-form" data-em-test><label class="em-field"><span>Enviar para</span><input type="email" name="to" required maxlength="160" value="${h(c.access?.email || c.me?.email || '')}" autocomplete="email"></label>
            <p class="dim">O teste usa os dados do primeiro contato com e-mail nos campos personalizados. Os links não são rastreados.</p><div class="inline-gap"><button class="primary">Enviar teste</button><button type="button" class="secondary" data-act="close">Cancelar</button></div><p class="form-status" role="alert"></p></form>`);
          break;
        case 'ai-write': {
          if (!editing()) break;
          dialog('Escrever com IA', `<form class="em-form" data-em-ai><label class="em-field"><span>Objetivo do e-mail</span><textarea name="brief" rows="3" required maxlength="2000" placeholder="Ex.: anunciar o cardápio de verão com entrega grátis no bairro até domingo"></textarea></label>
            <div class="em-two"><label class="em-field"><span>Chamada para ação</span><input name="cta" maxlength="200" placeholder="Ex.: Pedir agora"></label><label class="em-field"><span>Público</span><input name="audience" maxlength="300" placeholder="Ex.: clientes que já pediram"></label></div>
            <div class="em-two"><label class="em-field"><span>Tom</span><select name="tone">${contentTones.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label><label class="em-field"><span>Idioma</span><select name="language"><option value="pt">Português</option><option value="es">Espanhol</option></select></label></div>
            <p class="dim">A IA preenche o assunto, o pré-cabeçalho${d.ab.enabled ? ', o assunto B do teste A/B' : ''} e o primeiro título, texto e botão. Imagens, links e os outros blocos ficam como estão. Revise antes de enviar: dados que a IA não sabe aparecem como [[marcadores]].</p>
            <div class="inline-gap"><button class="primary">${icon('spark', 14)} Escrever</button><button type="button" class="secondary" data-act="close">Cancelar</button></div><p class="form-status" role="alert"></p></form>`);
          break;
        }
        case 'schedule': {
          if (!d.subject.trim()) { flash('Escreva o assunto antes de enviar.', true); break; }
          const n = reach(c, d.audience);
          dialog('Enviar campanha', `<form class="em-form" data-em-schedule><p><b>${n}</b> contato${n === 1 ? '' : 's'} vão receber “${h(d.subject)}”${d.ab.enabled ? `, com teste A/B em ${d.ab.testPercent}% do público` : ''}.</p>
            <fieldset class="em-radios"><label><input type="radio" name="when" value="now" checked> Enviar agora</label><label><input type="radio" name="when" value="later"> Agendar para</label></fieldset>
            <label class="em-field"><span>Data e hora</span><input type="datetime-local" name="at" min="${localInput(Date.now())}" value="${localInput(Date.now() + 3600_000)}"></label>
            <div class="inline-gap"><button class="primary">Confirmar envio</button><button type="button" class="secondary" data-act="close">Cancelar</button></div><p class="form-status" role="alert"></p></form>`);
          break;
        }
      }
    } catch (error) { if (el.matches('button')) el.disabled = false; flash(error.message, true); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (form.matches('[data-em-ai]')) {
      event.preventDefault();
      const status = form.querySelector('.form-status'), button = form.querySelector('button.primary');
      button.disabled = true; status.textContent = 'Escrevendo o e-mail…';
      try {
        const fields = Object.fromEntries(new FormData(form));
        const draft = await api(url('/api/content-ai/email'), { ...fields, ab: Boolean(ed.draft?.ab.enabled) });
        if (!editing()) { close(); return; }
        applyEmailDraft(ed.draft, draft);
        close(); touch(true); flash('E-mail escrito pela IA. Revise os [[marcadores]] antes de enviar.');
      } catch (error) { button.disabled = false; status.textContent = error.message; }
      return;
    }
    if (!form.matches('[data-em-test],[data-em-schedule]')) return;
    event.preventDefault();
    const status = form.querySelector('.form-status'), button = form.querySelector('button.primary');
    button.disabled = true; status.textContent = '';
    try {
      const fields = new FormData(form);
      if (form.matches('[data-em-test]')) {
        const d = ed.draft;
        await api(url('/api/email/campaign/test'), { to: fields.get('to'), subject: d.subject, preheader: d.preheader, blocks: d.blocks, style: d.style, fromName: d.fromName, replyTo: d.replyTo });
        close(); flash(`Teste enviado para ${fields.get('to')}.`); return;
      }
      const later = fields.get('when') === 'later';
      const at = later ? new Date(String(fields.get('at'))).getTime() : Date.now();
      if (later && !(at > Date.now())) throw new Error('Escolha uma data no futuro.');
      if (ed.dirty) await saveDraft();
      const id = c.emailId;
      await mutate({ type: 'email-campaign-schedule', id, data: { at: new Date(at).toISOString() } });
      close(); ed.key = ''; ed.draft = null;
      flash(later ? 'Campanha agendada.' : 'Envio iniciado. Os números aparecem no relatório.');
      location.hash = `#marketing/email-report/${id}`;
    } catch (error) { button.disabled = false; status.textContent = error.message; }
  });
}
