// Marketing → Marca: brand boards with the Design Kit (logo, colors, fonts) and the Brand Voice the AI
// writers follow. One board is the default: its voice goes into every AI text and its colors into the editors.
import { icon } from './icons.js';
import { h, pageShell } from './screens.js';
import { brandFonts, brandLimits, brandPresets, colorRoles, fontUrl, voiceTraits } from './brand-data.js';
import { ask, askText } from './ask.js';

const drafts = new Map();
const roleLabel = Object.fromEntries(colorRoles);
const boardId = () => location.hash.split('/')[2] || '';
const blank = () => ({ name: 'Minha marca', colors: [{ role: 'primary', hex: '#5dd62c', name: 'Verde Graao' }, { role: 'secondary', hex: '#337418', name: 'Verde-escuro Graao' }, { role: 'accent', hex: '#0f0f0f', name: 'Preto Graao' }, { role: 'background', hex: '#ffffff', name: '' }, { role: 'text', hex: '#111827', name: '' }], fonts: { heading: 'Inter', body: 'Inter' }, voice: {} });

function loadFonts(families) {
  const href = fontUrl(families);
  if (!families.length || document.querySelector(`link[data-brand-fonts="${CSS.escape(href)}"]`)) return;
  const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
  link.dataset.brandFonts = href;
  document.head.append(link);
}

const swatches = colors => `<span class="br-swatches">${colors.map(color => `<span style="background:${h(color.hex)}" title="${h(roleLabel[color.role] || '')} ${h(color.hex)}"></span>`).join('')}</span>`;
const logoImg = (board, cls = '') => board.logo ? `<img class="br-logo ${cls}" src="${h(board.logo)}" alt="Logo de ${h(board.name)}" referrerpolicy="no-referrer">` : `<span class="br-logo br-logo-empty ${cls}" aria-hidden="true">${h((board.name || '?').slice(0, 1).toUpperCase())}</span>`;

function shell(c, content, cta = '') {
  return pageShell({ title: 'Marca', desc: 'Logo, cores, fontes e o jeito de falar da empresa. A IA escreve na voz da marca padrão.', className: 'br-page', cta,
    tabs: { key: 'marketing', items: c.marketingTabs, current: 'brand', label: 'Seções de marketing' }, content });
}

function list(c) {
  const boards = c.s.brandBoards || [];
  loadFonts(boards.flatMap(board => [board.fonts?.heading, board.fonts?.body]).filter(Boolean));
  const cta = `<button type="button" class="primary" data-br-act="new">${icon('plus', 15)} Nova marca</button>`;
  if (!boards.length) {
    return shell(c, `<div class="surface empty">${icon('palette', 26)}<strong>Monte a marca da empresa</strong><p>Importe do site, comece por um modelo ou do zero. Com a marca pronta, a IA escreve no tom da empresa e as cores aparecem nos editores.</p>${cta}</div>`, cta);
  }
  return shell(c, `<div class="br-grid">${boards.map(board => `<article class="surface br-card">
      <header>${logoImg(board)}<div><b>${h(board.name)}</b>${board.isDefault ? ' <span class="badge green">Padrão</span>' : ''}</div></header>
      ${swatches(board.colors || [])}
      <p class="br-font-sample" style="font-family:'${h(board.fonts?.heading)}',sans-serif">${h(board.fonts?.heading)} <span style="font-family:'${h(board.fonts?.body)}',sans-serif">/ ${h(board.fonts?.body)}</span></p>
      <p class="dim">${board.voice?.traits?.length ? `Voz: ${board.voice.traits.map(h).join(', ')}` : 'Voz da marca ainda não definida'}</p>
      <div class="br-actions"><a class="secondary" href="#marketing/brand/${h(board.id)}">${icon('edit', 14)} Editar</a>
        ${board.isDefault ? '' : `<button type="button" class="secondary" data-br-act="default" data-id="${h(board.id)}">Tornar padrão</button>`}
        <button type="button" class="icon-btn" data-br-act="delete" data-id="${h(board.id)}" aria-label="Excluir marca ${h(board.name)}" title="Excluir">${icon('trash', 15)}</button></div>
    </article>`).join('')}</div>`, cta);
}

function colorRow(color, index) {
  return `<div class="br-color" data-index="${index}">
    <input type="color" value="${h(color.hex)}" data-br-color="hex" aria-label="Cor ${index + 1}">
    <input value="${h(color.hex)}" data-br-color="text" maxlength="7" aria-label="Código da cor ${index + 1}" class="br-hex">
    <select data-br-color="role" aria-label="Papel da cor ${index + 1}">${colorRoles.map(([id, label]) => `<option value="${id}" ${color.role === id ? 'selected' : ''}>${label}</option>`).join('')}</select>
    <input value="${h(color.name || '')}" data-br-color="name" maxlength="40" placeholder="Nome (opcional)" aria-label="Nome da cor ${index + 1}">
    <button type="button" class="icon-btn" data-br-act="color-remove" data-index="${index}" aria-label="Remover cor ${index + 1}" title="Remover">${icon('trash', 14)}</button>
  </div>`;
}

function preview(draft) {
  const color = role => draft.colors.find(item => item.role === role)?.hex;
  const primary = color('primary') || '#5dd62c', background = color('background') || '#ffffff', text = color('text') || '#111827', accent = color('accent') || color('secondary') || primary;
  return `<div class="br-preview" style="background:${h(background)};color:${h(text)}">
    <div class="br-preview-top">${logoImg(draft, 'small')}<b style="font-family:'${h(draft.fonts.heading)}',sans-serif">${h(draft.name)}</b></div>
    <h3 style="font-family:'${h(draft.fonts.heading)}',sans-serif">Um título com a cara da marca</h3>
    <p style="font-family:'${h(draft.fonts.body)}',sans-serif">${h(draft.voice?.example || 'Este é um parágrafo de exemplo com a fonte de texto da marca. Escreva um exemplo na voz da marca para ver aqui.')}</p>
    <span class="br-preview-btn" style="background:${h(primary)};font-family:'${h(draft.fonts.body)}',sans-serif">Botão principal</span>
    <span class="br-preview-tag" style="border-color:${h(accent)};color:${h(accent)}">Destaque</span>
  </div>`;
}

function editor(c, id) {
  const board = (c.s.brandBoards || []).find(row => row.id === id);
  if (!board) return shell(c, `<div class="surface empty"><strong>Marca não encontrada</strong><a class="secondary" href="#marketing/brand">Voltar</a></div>`);
  if (!drafts.has(id)) drafts.set(id, structuredClone({ name: board.name, isDefault: board.isDefault, logo: board.logo || '', logoDark: board.logoDark || '', colors: board.colors || [], fonts: board.fonts || { heading: 'Inter', body: 'Inter' }, voice: board.voice || {}, source: board.source || '' }));
  const d = drafts.get(id);
  loadFonts([d.fonts.heading, d.fonts.body]);
  const fontSelect = key => `<select data-br-font="${key}">${brandFonts.map(font => `<option ${d.fonts[key] === font ? 'selected' : ''}>${font}</option>`).join('')}</select>`;
  const words = key => (d.voice[key] || []).join(', ');
  return shell(c, `
    <div class="br-titlebar"><a class="secondary" href="#marketing/brand">${icon('left', 15)} Marcas</a><input class="br-name" data-br-field="name" maxlength="80" value="${h(d.name)}" aria-label="Nome da marca">
      <label class="rp-check"><input type="checkbox" data-br-field="isDefault" ${d.isDefault ? 'checked' : ''}> Marca padrão</label></div>
    <div class="br-editor">
      <form class="br-form" data-br-form data-id="${h(id)}">
        <section class="surface padded"><h2>Logo</h2>
          <div class="br-logos">${['logo', 'logoDark'].map(key => `<div class="br-logo-field"><span class="br-logo-box ${key === 'logoDark' ? 'dark' : ''}">${d[key] ? `<img src="${h(d[key])}" alt="" referrerpolicy="no-referrer">` : '<span class="dim">sem logo</span>'}</span>
            <label class="secondary br-upload">${key === 'logo' ? 'Logo principal' : 'Versão para fundo escuro'}<input type="file" accept="image/png,image/jpeg,image/webp" data-br-logo="${key}"></label>
            ${d[key] ? `<button type="button" class="wf-text br-link" data-br-act="logo-remove" data-key="${key}">Remover</button>` : ''}</div>`).join('')}</div>
          <p class="dim">PNG, JPG ou WebP de até 300 KB. Prefira fundo transparente.</p></section>
        <section class="surface padded"><h2>Cores</h2><div class="br-colors">${d.colors.map(colorRow).join('')}</div>
          ${d.colors.length < brandLimits.colors ? `<button type="button" class="secondary" data-br-act="color-add">${icon('plus', 14)} Adicionar cor</button>` : ''}</section>
        <section class="surface padded"><h2>Fontes</h2><div class="rp-two-fields"><label>Títulos${fontSelect('heading')}</label><label>Textos${fontSelect('body')}</label></div></section>
        <section class="surface padded br-voice"><div class="br-section-head"><h2>Voz da marca</h2>${c.features?.contentAI ? `<button type="button" class="secondary" data-br-act="voice-ai">${icon('spark', 14)} Gerar com IA</button>` : ''}</div>
          <p class="dim">A IA da plataforma (e-mails, posts, blog, respostas a avaliações) segue a voz da marca padrão.</p>
          <label>Quem é a empresa<textarea data-br-voice="summary" rows="3" maxlength="600" placeholder="O que faz, para quem e o que a torna diferente">${h(d.voice.summary || '')}</textarea></label>
          <label>Público<input data-br-voice="audience" maxlength="300" value="${h(d.voice.audience || '')}" placeholder="Ex.: famílias da zona oeste que pedem delivery à noite"></label>
          <fieldset class="br-traits"><legend>Personalidade (até 5)</legend>${voiceTraits.map(trait => `<label class="chip"><input type="checkbox" data-br-trait value="${h(trait)}" ${(d.voice.traits || []).includes(trait) ? 'checked' : ''}> ${h(trait)}</label>`).join('')}</fieldset>
          <div class="rp-two-fields"><label>Palavras que usamos<input data-br-voice="use" value="${h(words('use'))}" placeholder="separadas por vírgula"></label><label>Palavras que evitamos<input data-br-voice="avoid" value="${h(words('avoid'))}" placeholder="separadas por vírgula"></label></div>
          <label>Exemplo de texto na voz da marca<textarea data-br-voice="example" rows="3" maxlength="1200">${h(d.voice.example || '')}</textarea></label></section>
        <div class="rp-save"><span class="form-status" role="status"></span><button class="primary">Salvar marca</button></div>
      </form>
      <aside class="br-side"><h2>Prévia</h2><div data-br-preview>${preview(d)}</div>${d.source ? `<p class="dim">Importada de ${h(d.source)}</p>` : ''}</aside>
    </div>`);
}

export function brandScreen(c, ctx) {
  const view = { ...c, marketingTabs: ctx.marketingTabs };
  const id = boardId();
  return id ? editor(view, id) : list(view);
}

function newDialog() {
  return `<div class="br-new">
    <form class="br-import" data-br-import><label>Importar do site<input name="url" type="url" required placeholder="https://www.suaempresa.com.br"></label>
      <button class="primary">Importar</button><p class="form-status" role="alert"></p></form>
    <p class="dim">Lemos as cores, as fontes e o ícone do site. Revise tudo antes de salvar.</p>
    <h3>Ou comece por um modelo</h3>
    <div class="br-presets">${brandPresets.map(preset => `<button type="button" class="br-preset" data-br-act="preset" data-id="${preset.id}">
      ${swatches(preset.colors.map(([role, hex]) => ({ role, hex })))}<b style="font-family:'${preset.fonts[0]}',sans-serif">${h(preset.name)}</b><small class="dim">${preset.fonts.join(' + ')}</small></button>`).join('')}</div>
    <button type="button" class="secondary" data-br-act="blank">Começar do zero</button>
  </div>`;
}

export function installBrand({ c, api, url, mutate, flash, dialog, close, render }) {
  const here = () => c.view === 'marketing' && c.tab === 'brand';
  const current = () => drafts.get(boardId());
  const refreshPreview = () => { const box = document.querySelector('[data-br-preview]'); if (box && current()) { box.innerHTML = preview(current()); loadFonts([current().fonts.heading, current().fonts.body]); } };
  const create = async data => {
    const id = await mutate({ type: 'save', key: 'brandBoards', data });
    close(); drafts.delete(id); location.hash = `#marketing/brand/${id}`;
  };
  window.addEventListener('hashchange', () => { if (!here()) drafts.clear(); });

  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-br-act]');
    if (!el || !here()) return;
    const act = el.dataset.brAct, d = current();
    try {
      if (act === 'new') { loadFonts(brandPresets.flatMap(preset => preset.fonts)); dialog('Nova marca', newDialog()); }
      if (act === 'blank') await create(blank());
      if (act === 'preset') {
        const preset = brandPresets.find(row => row.id === el.dataset.id);
        await create({ name: preset.name, colors: preset.colors.map(([role, hex]) => ({ role, hex, name: '' })), fonts: { heading: preset.fonts[0], body: preset.fonts[1] }, voice: {} });
      }
      if (act === 'default') {
        const board = c.s.brandBoards.find(row => row.id === el.dataset.id);
        await mutate({ type: 'save', key: 'brandBoards', id: board.id, data: { ...board, isDefault: true } });
        render(); flash(`${board.name} agora é a marca padrão.`);
      }
      if (act === 'delete') {
        if (!await ask('Excluir esta marca?', { text: 'A IA deixa de usar a voz dela.', ok: 'Excluir' })) return;
        await mutate({ type: 'delete', key: 'brandBoards', id: el.dataset.id }); render(); flash('Marca excluída.');
      }
      if (!d) return;
      if (act === 'color-add') { d.colors.push({ role: 'neutral', hex: '#9ca3af', name: '' }); render(); }
      if (act === 'color-remove') { d.colors.splice(Number(el.dataset.index), 1); render(); }
      if (act === 'logo-remove') { d[el.dataset.key] = ''; render(); }
      if (act === 'voice-ai') {
        const about = d.voice.summary || await askText('O que a empresa faz e para quem?', { text: 'Conte em poucas frases. A IA usa isso para escrever a voz da marca.', multiline: true, ok: 'Gerar voz' }) || '';
        if (!about.trim()) return;
        el.disabled = true;
        try {
          const { voice } = await api(url('/api/brand/voice-ai'), { name: d.name, about, audience: d.voice.audience || '' });
          d.voice = { ...d.voice, ...voice }; render(); flash('Voz da marca sugerida pela IA. Revise e salve.');
        } finally { el.disabled = false; }
      }
    } catch (error) { flash(error.message, true); }
  });

  document.addEventListener('input', event => {
    const d = current();
    if (!here() || !d) return;
    const el = event.target;
    if (el.matches('[data-br-field="name"]')) d.name = el.value;
    if (el.matches('[data-br-voice]')) {
      const key = el.dataset.brVoice;
      d.voice[key] = ['use', 'avoid'].includes(key) ? el.value.split(',').map(word => word.trim()).filter(Boolean) : el.value;
    }
    const row = el.closest('.br-color');
    if (row) {
      const color = d.colors[Number(row.dataset.index)];
      const prop = el.dataset.brColor;
      if (prop === 'hex') { color.hex = el.value; row.querySelector('[data-br-color="text"]').value = el.value; }
      if (prop === 'text' && /^#[0-9a-f]{6}$/i.test(el.value)) { color.hex = el.value.toLowerCase(); row.querySelector('[data-br-color="hex"]').value = color.hex; }
      if (prop === 'name') color.name = el.value;
    }
    refreshPreview();
  });

  document.addEventListener('change', async event => {
    const d = current();
    if (!here() || !d) return;
    const el = event.target;
    if (el.matches('[data-br-field="isDefault"]')) d.isDefault = el.checked;
    if (el.matches('[data-br-color="role"]')) d.colors[Number(el.closest('.br-color').dataset.index)].role = el.value;
    if (el.matches('[data-br-font]')) d.fonts[el.dataset.brFont] = el.value;
    if (el.matches('[data-br-trait]')) {
      const chosen = [...document.querySelectorAll('[data-br-trait]:checked')].map(input => input.value);
      if (chosen.length > 5) { el.checked = false; flash('Escolha até 5 traços de personalidade.', true); return; }
      d.voice.traits = chosen;
    }
    if (el.matches('[data-br-logo]')) {
      const file = el.files[0];
      if (!file) return;
      if (file.size > brandLimits.logoBytes) { flash('O logo deve ter até 300 KB.', true); el.value = ''; return; }
      d[el.dataset.brLogo] = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      render();
      return;
    }
    refreshPreview();
  });

  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!here() || !form.matches('[data-br-form],[data-br-import]')) return;
    event.preventDefault();
    const status = form.querySelector('.form-status'), button = form.querySelector('button.primary');
    button.disabled = true; status.textContent = form.matches('[data-br-import]') ? 'Lendo o site…' : '';
    try {
      if (form.matches('[data-br-import]')) {
        const { board } = await api(url('/api/brand/import'), { url: form.elements.url.value.trim() });
        await create(board);
        flash('Marca importada. Confira as cores, as fontes e o logo.');
        return;
      }
      const id = form.dataset.id;
      await mutate({ type: 'save', key: 'brandBoards', id, data: current() });
      drafts.delete(id); render(); flash('Marca salva.');
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  });
}

