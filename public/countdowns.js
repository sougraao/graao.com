// Marketing → Contadores: countdown timers for e-mails (animated GIF) and pages (embed code).
// Follows GoHighLevel's /marketing/countdown-timer; the names, texts and look are Graao's.
import { icon } from './icons.js';
import { h, pageShell } from './screens.js';
import { DEFAULT_STYLE, TEMPLATES, countdownMarkup, describeTimer, durationMinutes, embedCode } from './countdown-data.js';
import { ask } from './ask.js';
import { tr } from './i18n.js';

const cd = { draft: null, id: '' };
const field = (label, control, hint = '') => `<label class="em-field"><span>${h(label)}</span>${control}${hint ? `<small class="dim">${hint}</small>` : ''}</label>`;
const gifUrl = (c, id) => `${location.origin}/cd/${c.workspace}/${id}.gif`;
const localNow = offsetDays => { const d = new Date(Date.now() + offsetDays * 864e5); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export function countdownScreen(c, ctx) {
  const rows = (c.s.countdownTimers || []).slice().sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const body = rows.length ? `<div class="cd-list">${rows.map(row => {
      const ended = row.mode === 'date' && Date.parse(row.endAt) <= Date.now();
      return `<article class="surface padded cd-card"><div class="cd-card-head"><div><h2>${h(row.name)}</h2><p class="dim">${row.mode === 'evergreen' ? 'Evergreen' : 'Data fixa'} · ${h(describeTimer(row))}${ended ? ' · <b>encerrado</b>' : ''}</p></div>
        <span class="inline-gap"><button type="button" class="secondary" data-cd-act="edit" data-id="${h(row.id)}">${icon('edit', 15)} Editar</button><button type="button" class="icon-btn" data-cd-act="delete" data-id="${h(row.id)}" title="Excluir" aria-label="Excluir ${h(row.name)}">${icon('trash', 15)}</button></span></div>
        <img class="cd-gif" src="${h(gifUrl(c, row.id))}?v=${encodeURIComponent(row.updated || row.created)}" alt="Prévia de ${h(row.name)}" width="400" height="122" loading="lazy">
        <div class="cd-uses"><div><b>No e-mail</b><p class="dim">Use o bloco <b>Contador</b> no construtor de e-mails, ou a imagem:</p><span class="inline-gap"><button type="button" class="secondary" data-cd-copy="${h(gifUrl(c, row.id))}">${icon('copy', 14)} Copiar endereço da imagem</button></span></div>
          <div><b>Em páginas e sites</b><p class="dim">Cole o código no seu site ou num bloco de código HTML:</p><span class="inline-gap"><button type="button" class="secondary" data-cd-copy="${h(embedCode(location.origin, c.workspace, row.id, row.name))}">${icon('copy', 14)} Copiar código</button><a class="secondary" href="/cd/${h(c.workspace)}/${h(row.id)}" target="_blank" rel="noopener">${icon('external', 14)} Abrir</a></span></div></div></article>`;
    }).join('')}</div>`
    : `<div class="surface padded empty">${icon('clock', 22)}<strong>Nenhum contador ainda</strong><p>Crie uma contagem regressiva para uma oferta e use em e-mails e páginas.</p><button type="button" class="primary" data-cd-act="new">Novo contador</button></div>`;
  return pageShell({ title: 'Marketing', desc: 'Contagens regressivas para e-mails e páginas: a imagem do e-mail se atualiza a cada abertura.',
    cta: `<button type="button" class="primary" data-cd-act="new">${icon('plus', 16)} Novo contador</button>`,
    tabs: { key: 'marketing', items: ctx.marketingTabs, current: 'countdown', label: 'Seções de marketing' }, content: body });
}

function previewOf(d) {
  const remaining = d.mode === 'evergreen' ? durationMinutes(d.duration) * 60000 : (d.endLocal ? new Date(d.endLocal).getTime() - Date.now() : 0);
  return countdownMarkup(d, remaining);
}

function editorForm(d) {
  const s = d.style;
  const num = (key, label, max) => field(label, `<input type="number" min="0" max="${max}" data-cd-dur="${key}" value="${h(d.duration[key] || 0)}">`);
  return `<form class="em-form cd-form" data-cd-form>
    ${field('Nome', `<input data-cd="name" required maxlength="100" value="${h(d.name)}" placeholder="Ex.: Black Friday">`)}
    <fieldset class="em-radios"><label><input type="radio" name="cd-mode" data-cd-mode="date"${d.mode !== 'evergreen' ? ' checked' : ''}> Data fixa</label><label><input type="radio" name="cd-mode" data-cd-mode="evergreen"${d.mode === 'evergreen' ? ' checked' : ''}> Evergreen (duração)</label></fieldset>
    <div data-cd-when>${d.mode === 'evergreen'
      ? `<div class="em-three">${num('days', 'Dias', 365)}${num('hours', 'Horas', 23)}${num('minutes', 'Minutos', 59)}</div><p class="dim"><small>Conta a partir do envio do e-mail ou da primeira visita de cada pessoa à página.</small></p>`
      : field('Termina em', `<input type="datetime-local" data-cd="endLocal" required value="${h(d.endLocal)}">`, 'No fuso horário da subconta (Configurações → Perfil da empresa).')}</div>
    <div class="em-two">${field('Modelo', `<select data-cd-style="template">${TEMPLATES.map(([k, l]) => `<option value="${k}"${s.template === k ? ' selected' : ''}>${l}</option>`).join('')}</select>`)}
      ${field('Ao terminar', `<select data-cd-exp="mode"><option value="zero"${d.expired.mode !== 'text' ? ' selected' : ''}>Mostrar zeros</option><option value="text"${d.expired.mode === 'text' ? ' selected' : ''}>Mostrar um texto</option></select>`)}</div>
    ${d.expired.mode === 'text' ? field('Texto ao terminar', `<input data-cd-exp="text" maxlength="32" value="${h(d.expired.text)}">`, 'Na imagem do e-mail saem só letras sem acento, números e pontuação simples.') : ''}
    <div class="em-colors">${[['background', 'Fundo'], ['box', s.template === 'boxes' ? 'Caixas' : 'Números'], ['digits', 'Números nas caixas'], ['labels', 'Rótulos']].filter(([k]) => s.template === 'boxes' || k !== 'digits')
      .map(([k, l]) => field(l, `<input type="color" data-cd-style="${k}" value="${h(s[k])}">`)).join('')}</div>
    <div class="cd-preview" data-cd-preview>${previewOf(d)}</div>
    <div class="inline-gap"><button class="primary">Salvar contador</button><button type="button" class="secondary" data-act="close">Cancelar</button></div><p class="form-status" role="alert"></p></form>`;
}

export function installCountdowns({ c, mutate, flash, dialog, close, render }) {
  const here = () => c.view === 'marketing' && c.tab === 'countdown';
  const open = row => {
    cd.id = row?.id || '';
    cd.draft = structuredClone(row ? { name: row.name, mode: row.mode, endLocal: row.endLocal || localNow(7), duration: row.duration, style: row.style, expired: row.expired }
      : { name: '', mode: 'date', endLocal: localNow(7), duration: { days: 2, hours: 0, minutes: 0 }, style: { ...DEFAULT_STYLE }, expired: { mode: 'zero', text: 'Oferta encerrada' } });
    dialog(row ? 'Editar contador' : 'Novo contador', editorForm(cd.draft));
  };
  const redraw = () => { const form = document.querySelector('[data-cd-form]'); if (form) form.outerHTML = editorForm(cd.draft); };
  const preview = () => { const el = document.querySelector('[data-cd-preview]'); if (el) el.innerHTML = previewOf(cd.draft); };
  document.addEventListener('input', event => {
    const el = event.target;
    if (!cd.draft || !el.closest('[data-cd-form]')) return;
    if (el.matches('[data-cd]')) cd.draft[el.dataset.cd] = el.value;
    else if (el.matches('[data-cd-dur]')) cd.draft.duration[el.dataset.cdDur] = Number(el.value) || 0;
    else if (el.matches('[data-cd-style]')) cd.draft.style[el.dataset.cdStyle] = el.value;
    else if (el.matches('[data-cd-exp="text"]')) cd.draft.expired.text = el.value;
    preview();
  });
  document.addEventListener('change', event => {
    const el = event.target;
    if (!cd.draft || !el.closest('[data-cd-form]')) return;
    if (el.matches('[data-cd-mode]')) { cd.draft.mode = el.dataset.cdMode; redraw(); }
    else if (el.matches('[data-cd-style="template"]')) { cd.draft.style.template = el.value; redraw(); }
    else if (el.matches('[data-cd-exp="mode"]')) { cd.draft.expired.mode = el.value; redraw(); }
  });
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-cd-act],[data-cd-copy]');
    if (!el || !here()) return;
    try {
      if (el.dataset.cdCopy) { await navigator.clipboard.writeText(el.dataset.cdCopy); flash('Copiado.'); return; }
      const row = (c.s.countdownTimers || []).find(item => item.id === el.dataset.id);
      if (el.dataset.cdAct === 'new') open(null);
      if (el.dataset.cdAct === 'edit' && row) open(row);
      if (el.dataset.cdAct === 'delete' && row) {
        const used = (c.s.emailCampaigns || []).some(camp => ['draft', 'scheduled'].includes(camp.status) && camp.blocks?.some(b => b.type === 'countdown' && b.timerId === row.id));
        if (!await ask(`${tr('Excluir')} “${row.name}”?`, { text: `${used ? `${tr('Ele está em uma campanha que ainda não foi enviada.')} ` : ''}${tr('E-mails já enviados passam a mostrar uma imagem vazia no lugar.')}`, ok: 'Excluir' })) return;
        await mutate({ type: 'delete', key: 'countdownTimers', id: row.id }); render(); flash('Contador excluído.');
      }
    } catch (error) { flash(error.message, true); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!form.matches('[data-cd-form]')) return;
    event.preventDefault();
    const status = form.querySelector('.form-status'), button = form.querySelector('button.primary');
    button.disabled = true; status.textContent = '';
    try {
      await mutate({ type: 'save', key: 'countdownTimers', id: cd.id || undefined, data: cd.draft });
      close(); cd.draft = null; render(); flash('Contador salvo.');
    } catch (error) { button.disabled = false; status.textContent = error.message; }
  });
}
