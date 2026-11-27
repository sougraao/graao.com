// Beautiful UI (https://www.beautifului.dev, MIT, Shane Levine), portado de React/TSX
// para DOM puro. Fonte original em vendor/beautifului/src. Estilos em beautiful-ui.css.
// Cada fábrica devolve { el, ...métodos } e um destroy() para parar timers.

const SVG = 'http://www.w3.org/2000/svg';
const SPARK = 'M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z';
const SWAP_ARROW = '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>';

function node(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

function svg(markup, { size = 14, className = '', fill = 'none', stroke = 'currentColor', width = 2 } = {}) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', fill);
  s.setAttribute('stroke', stroke);
  s.setAttribute('stroke-width', width);
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  if (className) s.setAttribute('class', className);
  s.innerHTML = markup;
  return s;
}

const chevronDown = opts => svg('<path d="M6 9l6 6 6-6"/>', { width: 2.2, ...opts });

export function formatElapsed(ms) {
  const total = Math.max(0, ms) / 1000;
  if (total < 60) return `${total.toFixed(1)}s`;
  return `${Math.floor(total / 60)}m ${(total % 60).toFixed(1)}s`;
}

/* ── Shimmer ─────────────────────────────────────────────── */

export function shimmer(text, className = '') {
  return node('span', `bui-shimmer ${className}`.trim(), text);
}

/* ── LoadingState: grade de pixels + rótulo + cronômetro ─── */

const CHEVRON = Array.from({ length: 9 }, (_, i) => (i % 3 + Math.abs(Math.floor(i / 3) - 1)) * 90);
const ORBIT_ORDER = [0, 1, 2, 5, 8, 7, 6, 3];
const ORBIT = Array.from({ length: 9 }, (_, i) => (ORBIT_ORDER.includes(i) ? ORBIT_ORDER.indexOf(i) * 110 : null));
const PATTERNS = {
  Drive: { delays: CHEVRON, dur: 650, round: false },
  Dots: { delays: CHEVRON, dur: 650, round: true },
  Orbit: { delays: ORBIT, dur: 950, round: false }
};

export function loaderGrid(variant = 'Drive') {
  const { delays, dur, round } = PATTERNS[variant] || PATTERNS.Drive;
  const grid = node('span', `bui-loading-grid${round ? ' is-round' : ''}`);
  grid.setAttribute('aria-hidden', 'true');
  for (const delay of delays) {
    const cell = node('span');
    if (delay === null) cell.style.opacity = '0.07';
    else cell.style.animation = `bui-pixel-on ${dur}ms ease-in-out ${delay}ms infinite`;
    grid.append(cell);
  }
  return grid;
}

export function loadingState({ label = 'Pensando', variant = 'Drive', since = Date.now() } = {}) {
  const el = node('div', 'bui-loading');
  el.setAttribute('role', 'status');
  const labelEl = shimmer(label, 'bui-loading-label');
  const elapsed = node('span', 'bui-loading-elapsed', formatElapsed(Date.now() - since));
  el.append(loaderGrid(variant), labelEl, elapsed);
  const timer = setInterval(() => {
    if (!el.isConnected && el.dataset.mounted) return destroy();
    if (el.isConnected) el.dataset.mounted = '1';
    elapsed.textContent = formatElapsed(Date.now() - since);
  }, 100);
  function destroy() { clearInterval(timer); }
  return {
    el,
    setLabel(text) { labelEl.textContent = text; },
    destroy
  };
}

/* ── ThinkingState: rastro expansível (raciocínio ou passos) ─ */

export function thinkingState({ active = 'Pensando', done = 'Raciocínio', working = true, open = false, text = '', rows = null } = {}) {
  const el = node('div', 'bui-thinking');
  const head = node('button', 'bui-thinking-head');
  head.type = 'button';
  const spark = svg(`<path d="${SPARK}"/>`, { size: 16, fill: 'currentColor', stroke: 'none', className: 'bui-thinking-spark' });
  const status = node('span');
  status.setAttribute('role', 'status');
  status.style.display = 'contents';
  const label = node('span', 'bui-thinking-label');
  status.append(label);
  head.append(spark, status, chevronDown({ size: 14, className: 'bui-thinking-chevron', stroke: 'currentColor' }));

  const panel = node('div', 'bui-thinking-panel');
  const clip = node('div', 'bui-thinking-clip');
  const trace = node('div', 'bui-thinking-trace');
  const body = rows ? node('div', 'bui-thinking-rows') : node('p', 'bui-thinking-text');
  trace.append(body);
  clip.append(trace);
  panel.append(clip);
  el.append(head, panel);

  let isWorking = working;
  let manual = null;
  const state = { active, done };

  function paint() {
    const expanded = manual ?? (isWorking && open);
    el.classList.toggle('is-working', isWorking);
    el.classList.toggle('is-open', expanded);
    head.setAttribute('aria-expanded', String(expanded));
    label.className = `bui-thinking-label ${isWorking ? 'bui-shimmer' : 'bui-thinking-done'}`;
    label.textContent = isWorking ? state.active : state.done;
  }

  function renderRows(list) {
    body.replaceChildren(...list.map((row, i) => {
      const r = node('div', 'bui-thinking-row');
      r.style.animationDelay = `${i * 120}ms`;
      const last = i === list.length - 1;
      if (isWorking && last && !row.done) r.append(node('span', 'bui-spinner'));
      else r.append(svg('<path d="M20 6L9 17l-5-5"/>', { size: 14, width: 2.5, className: 'bui-check', stroke: 'currentColor' }));
      r.append(node('b', null, row.primary));
      if (row.secondary) r.append(node('small', null, row.secondary));
      return r;
    }));
  }

  head.addEventListener('click', () => {
    manual = !(manual ?? (isWorking && open));
    paint();
  });

  if (rows) renderRows(rows); else body.textContent = text;
  paint();

  return {
    el,
    setText(value) { if (!rows) body.textContent = value; },
    setRows(list) { rows = list; renderRows(list); },
    setWorking(value) { isWorking = value; paint(); if (rows) renderRows(rows); },
    setDone(value) { state.done = value; paint(); },
    setActive(value) { state.active = value; paint(); },
    get open() { return el.classList.contains('is-open'); },
    destroy() {}
  };
}

/* ── StreamText: caret sólido enquanto chega texto, pisca depois ─ */

export function streamCaret(streaming = true) {
  const caret = node('span', `bui-stream-caret${streaming ? ' is-streaming' : ''}`);
  caret.setAttribute('aria-hidden', 'true');
  return caret;
}

/** Revela `text` em `target` aos poucos, com a borda borrada do original. */
export function streamText(target, text, { charsPerTick = 2, tickMs = 9, blurTail = 6, caret = true, onProgress, onDone } = {}) {
  let count = 0;
  const head = document.createTextNode('');
  const tail = node('span', 'bui-stream-tail');
  const car = caret ? streamCaret(true) : null;
  target.replaceChildren(head, tail, ...(car ? [car] : []));
  const timer = setInterval(() => {
    // Com a aba em segundo plano os timers ficam lentos: revela o resto de uma vez.
    count = document.hidden ? text.length : Math.min(count + charsPerTick, text.length);
    const shown = text.slice(0, count);
    const streaming = count < text.length;
    const split = streaming ? Math.max(0, shown.length - blurTail) : shown.length;
    head.data = shown.slice(0, split);
    tail.textContent = shown.slice(split);
    onProgress?.();
    if (!streaming) {
      clearInterval(timer);
      car?.classList.remove('is-streaming');
      onDone?.();
    }
  }, tickMs);
  return { destroy() { clearInterval(timer); } };
}

/* ── ToolChips: chamadas de ferramenta como linhas compactas ─ */

const TOOL_ICONS = {
  think: `<path d="${SPARK}" fill="currentColor" stroke="none"/>`,
  write: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  run: '<path d="M4 17l6-5-6-5M12 19h8"/>',
  read: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'
};

/** steps: [{ icon, label, chip, mono?, detailMono?, detail: [{ text, tone? }] }] */
export function toolChips({ header, steps = [], open = true } = {}) {
  const el = node('div', `bui-tools${open ? ' is-open' : ''}`);
  const head = node('button', 'bui-tools-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', String(open));
  const headLabel = node('span', null, header || `${steps.length} ${steps.length === 1 ? 'ferramenta' : 'ferramentas'}`);
  head.append(chevronDown({ size: 12 }), headLabel);
  const panel = node('div', 'bui-tools-panel');
  const clip = node('div', 'bui-tools-clip');
  const list = node('div', 'bui-tools-list');
  clip.append(list);
  panel.append(clip);
  el.append(head, panel);

  head.addEventListener('click', () => {
    const next = !el.classList.contains('is-open');
    el.classList.toggle('is-open', next);
    head.setAttribute('aria-expanded', String(next));
  });

  function add(step) {
    const item = node('div', 'bui-tool');
    const row = node('button', 'bui-tool-row');
    row.type = 'button';
    row.setAttribute('aria-expanded', 'false');
    const ico = node('span', 'bui-tool-icon');
    ico.append(
      svg(TOOL_ICONS[step.icon] || TOOL_ICONS.run, { size: 13, className: 'bui-tool-glyph' }),
      chevronDown({ size: 12, className: 'bui-tool-chevron' })
    );
    row.append(ico, node('span', 'bui-tool-label', step.label));
    if (step.chip) row.append(node('span', `bui-tool-chip${step.mono ? ' is-mono' : ''}`, step.chip));
    item.append(row);
    if (step.detail?.length) {
      const wrap = node('div', 'bui-tool-detail-wrap');
      const dclip = node('div', 'bui-tool-detail-clip');
      const detail = node('div', `bui-tool-detail${step.detailMono ? ' is-mono' : ''}`);
      for (const line of step.detail) detail.append(node('span', line.tone === 'add' ? 'is-add' : '', line.text));
      dclip.append(detail);
      wrap.append(dclip);
      item.append(wrap);
      row.addEventListener('click', () => {
        const next = !item.classList.contains('is-open');
        item.classList.toggle('is-open', next);
        row.setAttribute('aria-expanded', String(next));
      });
    }
    list.append(item);
    if (!header) headLabel.textContent = `${list.children.length} ${list.children.length === 1 ? 'ferramenta' : 'ferramentas'}`;
    return item;
  }

  steps.forEach(add);
  return { el, add, setHeader(text) { headLabel.textContent = text; }, destroy() {} };
}

/* ── Átomos: Button, Monogram, EntityChip, ValuePill ─────── */

function mountIconSwap(buttonEl, label, iconMarkup = SPARK) {
  buttonEl.classList.add('graao-icon-swap');
  const content = node('span', 'graao-icon-swap-content');
  const iconEl = node('span', 'graao-icon-swap-icon');
  iconEl.append(svg(`<path d="${iconMarkup}"/>`, { size: 14, width: 1.9 }));
  const labelEl = node('span', 'graao-icon-swap-label', label);
  const arrowEl = node('span', 'graao-icon-swap-arrow');
  arrowEl.append(svg(SWAP_ARROW, { size: 15, width: 2.1 }));
  content.append(iconEl, labelEl);
  buttonEl.replaceChildren(content, arrowEl);
  buttonEl._graaoIconSwapLabel = labelEl;
  return buttonEl;
}

export function setIconSwapLabel(buttonEl, label) {
  const labelEl = buttonEl?._graaoIconSwapLabel || buttonEl?.querySelector('.graao-icon-swap-label');
  if (labelEl) labelEl.textContent = label;
  else if (buttonEl) buttonEl.textContent = label;
  return buttonEl;
}

/** variant: primary | secondary | ghost | accent | success | quiet; size: xs | sm | md */
export function iconSwapButton(label, { variant = 'secondary', size = 'sm', type = 'button', onClick, className = '', iconMarkup = SPARK } = {}) {
  const b = node('button', `bui-btn is-${variant} is-${size} ${className}`.trim());
  b.type = type;
  mountIconSwap(b, label, iconMarkup);
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

/** Todos os botões de ação do Beautiful UI usam o mesmo contrato Icon Swap da graao. */
export function button(label, options = {}) {
  return iconSwapButton(label, options);
}

export function monogram(text, color = '#e08a3c') {
  const m = node('span', 'bui-monogram', text);
  m.style.background = color;
  m.setAttribute('aria-hidden', 'true');
  return m;
}

export function entityChip(name, { color, mark } = {}) {
  const chip = node('span', 'bui-entity');
  chip.append(monogram(mark ?? name.charAt(0).toUpperCase(), color), node('span', null, name));
  return chip;
}

/** tone: neutral | green | orange | red | accent */
export function valuePill(text, tone = 'neutral') {
  return node('span', `bui-pill is-${tone}`, text);
}

/* ── GlideMenu: uma camada de hover que desliza entre as linhas ─ */

export function glideMenu(container, rowSelector = '[data-menu-row]') {
  // Idempotente: pode ser chamado de novo depois de repintar o conteúdo.
  if (container.dataset.buiGlide) return container;
  container.dataset.buiGlide = '1';
  container.classList.add('bui-glide');
  const layer = node('span', 'bui-glide-layer');
  layer.setAttribute('aria-hidden', 'true');
  container.prepend(layer);
  const moveTo = target => {
    const row = target instanceof Element ? target.closest(rowSelector) : null;
    if (!row || !container.contains(row)) return;
    if (layer.parentNode !== container) container.prepend(layer); // sobreviveu a um replaceChildren
    layer.style.transition = layer.classList.contains('is-visible') ? '' : 'none';
    const c = container.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    layer.style.top = `${r.top - c.top}px`;
    layer.style.height = `${r.height}px`;
    layer.classList.add('is-visible');
  };
  container.addEventListener('mouseover', e => moveTo(e.target));
  container.addEventListener('focusin', e => moveTo(e.target));
  container.addEventListener('mouseleave', () => layer.classList.remove('is-visible'));
  container.addEventListener('focusout', e => { if (!container.contains(e.relatedTarget)) layer.classList.remove('is-visible'); });
  return container;
}

/* ── ApprovalCard: perguntas uma de cada vez, antes de agir ─ */

const CHECK = '<path d="M20 6L9 17l-5-5"/>';

/** questions: [{ q, type: 'radio' | 'check', options: [] }] */
export function approvalCard({ questions = [], labels = {}, onSubmit, onDismiss } = {}) {
  const t = { skip: 'Pular', continue: 'Continuar', send: 'Enviar', custom: 'Outra coisa…', sent: 'Respostas enviadas', dismiss: 'Fechar', ...labels };
  const el = node('div', 'bui-approval');
  const card = node('div', 'bui-card bui-approval-card');
  const close = node('button', 'bui-icon-btn bui-approval-close');
  close.type = 'button';
  close.setAttribute('aria-label', t.dismiss);
  close.append(svg('<path d="M18 6L6 18M6 6l12 12"/>', { width: 2.2 }));
  const viewport = node('div', 'bui-approval-viewport');
  viewport.setAttribute('aria-live', 'polite');
  const track = node('div', 'bui-approval-track');
  viewport.append(track);
  const pad = node('div', 'bui-card-pad');
  pad.append(viewport);

  const answers = questions.map(() => []);
  const custom = questions.map(() => '');
  let qi = 0;
  let timer = 0;

  const panes = questions.map((question, qIdx) => {
    const pane = node('div', 'bui-approval-q');
    pane.append(node('div', 'bui-approval-title', question.q));
    const menu = node('div', 'bui-approval-options');
    question.options.forEach((option, i) => {
      const opt = node('button', 'bui-approval-opt');
      opt.type = 'button';
      opt.dataset.menuRow = '';
      opt.setAttribute('aria-pressed', 'false');
      const mark = node('span', `bui-approval-mark ${question.type === 'radio' ? 'is-radio' : 'is-check'}`);
      if (question.type === 'radio') mark.append(node('span', 'bui-approval-dot'));
      else mark.append(svg(CHECK, { size: 12, width: 3 }));
      opt.append(mark, node('span', 'bui-approval-label', option));
      opt.addEventListener('click', () => { if (qIdx === qi) toggle(i); });
      menu.append(opt);
    });
    const row = node('label', 'bui-approval-opt is-input');
    row.dataset.menuRow = '';
    const input = node('input');
    input.placeholder = t.custom;
    input.setAttribute('aria-label', 'Resposta personalizada');
    input.addEventListener('input', () => {
      custom[qIdx] = input.value;
      if (question.type === 'radio') answers[qIdx] = [];
      paint();
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && hasAnswer()) { e.preventDefault(); advance(); }
    });
    row.append(input);
    menu.append(row);
    glideMenu(menu);
    pane.append(menu);
    track.append(pane);
    return pane;
  });

  const foot = node('div', 'bui-card-footer bui-approval-foot');
  const nav = node('div', 'bui-approval-nav');
  const prev = node('button', 'bui-step-btn');
  prev.type = 'button';
  prev.setAttribute('aria-label', 'Pergunta anterior');
  prev.append(svg('<path d="M18 15l-6-6-6 6"/>'));
  const counter = node('span', 'bui-approval-count');
  const next = node('button', 'bui-step-btn');
  next.type = 'button';
  next.setAttribute('aria-label', 'Próxima pergunta');
  next.append(svg('<path d="M6 9l6 6 6-6"/>'));
  nav.append(prev, counter, next);
  const actions = node('div', 'bui-approval-actions');
  const skip = button(t.skip, { variant: 'ghost' });
  const go = button(t.continue, { variant: 'accent' });
  actions.append(skip, go);
  foot.append(nav, actions);
  card.append(close, pad, foot);
  el.append(card);

  const last = () => qi === questions.length - 1;
  const hasAnswer = () => answers[qi].length > 0 || Boolean(custom[qi].trim());

  function goTo(n) {
    clearTimeout(timer);
    const dir = n < qi ? 'down' : 'up';
    qi = Math.min(Math.max(n, 0), questions.length - 1);
    paint(dir);
  }
  function send() {
    clearTimeout(timer);
    const result = questions.map((question, i) => ({
      question: question.q,
      answers: answers[i].map(k => question.options[k]).concat(custom[i].trim() ? [custom[i].trim()] : [])
    }));
    const done = node('div', 'bui-approval-sent');
    const badge = node('span', 'bui-approval-ok');
    badge.append(svg(CHECK, { size: 11, width: 3 }));
    const pill = node('span', 'bui-approval-sent-pill');
    pill.append(badge, document.createTextNode(t.sent));
    done.append(pill);
    el.replaceChildren(done);
    onSubmit?.(result);
  }
  function advance() { if (last()) send(); else goTo(qi + 1); }
  function toggle(i) {
    const type = questions[qi].type;
    const picked = answers[qi];
    answers[qi] = type === 'radio' ? [i] : picked.includes(i) ? picked.filter(x => x !== i) : [...picked, i];
    if (type === 'radio') {
      custom[qi] = '';
      panes[qi].querySelector('input').value = '';
      clearTimeout(timer);
      timer = setTimeout(advance, 480);
    }
    paint();
  }
  function paint(dir) {
    panes.forEach((pane, idx) => {
      const active = idx === qi;
      pane.classList.toggle('is-active', active);
      pane.setAttribute('aria-hidden', String(!active));
      pane.querySelectorAll('button, input').forEach(b => { b.tabIndex = active ? 0 : -1; });
      pane.querySelectorAll('.bui-approval-opt:not(.is-input)').forEach((opt, i) => {
        const on = answers[idx].includes(i);
        opt.classList.toggle('is-on', on);
        opt.setAttribute('aria-pressed', String(on));
      });
    });
    const pane = panes[qi];
    if (pane?.offsetHeight) {
      viewport.style.height = `${pane.offsetHeight}px`;
      track.style.transform = `translate3d(0, ${-pane.offsetTop}px, 0)`;
    }
    const label = `${qi + 1} / ${questions.length}`;
    if (counter.textContent !== label) {
      counter.textContent = label;
      if (dir) {
        counter.classList.remove('is-roll-up', 'is-roll-down');
        void counter.offsetWidth;
        counter.classList.add(dir === 'down' ? 'is-roll-down' : 'is-roll-up');
      }
    }
    prev.disabled = qi <= 0;
    next.disabled = last();
    go.textContent = last() ? t.send : t.continue;
    go.disabled = !hasAnswer();
  }

  prev.addEventListener('click', () => goTo(qi - 1));
  next.addEventListener('click', () => goTo(qi + 1));
  skip.addEventListener('click', () => (last() ? dismiss() : goTo(qi + 1)));
  go.addEventListener('click', advance);
  close.addEventListener('click', dismiss);
  function dismiss() { clearTimeout(timer); ro.disconnect(); el.remove(); onDismiss?.(); }

  // Só mede depois de montado: até lá, apenas a pergunta ativa aparece (sem salto de altura).
  const ro = new ResizeObserver(() => {
    if (!el.isConnected || !panes[qi]?.offsetHeight) return;
    if (!el.classList.contains('is-ready')) {
      el.classList.add('is-ready');
      paint();
      requestAnimationFrame(() => el.classList.add('is-animated'));
    } else paint();
  });
  panes.forEach(pane => ro.observe(pane));
  paint();
  return { el, destroy() { clearTimeout(timer); ro.disconnect(); } };
}

/* ── TaskRows: status das tarefas do agente ─────────────── */

function spinnerRing(step, active) {
  const r = 11;
  const c = 2 * Math.PI * r;
  const ring = node('span', 'bui-ring');
  ring.append(svg(`<circle cx="12" cy="12" r="${r}" stroke="var(--bui-line)" stroke-width="2"/>${active ? `<circle cx="12" cy="12" r="${r}" stroke="var(--bui-ink-3)" stroke-width="2" stroke-dasharray="${c * 0.28} ${c * 0.72}"/>` : ''}`,
    { size: 24, width: 2, className: active ? 'is-spinning' : '' }));
  ring.append(node('span', null, step ?? ''));
  return ring;
}

/** rows: [{ key, label, amount, status: 'done' | 'running' | 'pending' | 'failed', step, details: [{ label, meta }] }] */
export function taskRows({ rows = [], labels = {}, list = false, onToggle } = {}) {
  const t = { done: 'Concluída', failed: 'Falhou', ...labels };
  const el = node('div', `bui-tasks${list ? ' is-list' : ''}`);
  const items = new Map();

  function badge(row) {
    if (row.status === 'done' || row.status === 'failed') {
      const b = node('span', `bui-task-badge is-${row.status === 'done' ? 'green' : 'red'}`);
      b.append(svg(row.status === 'done' ? CHECK : '<path d="M18 6L6 18M6 6l12 12"/>', { size: 12, width: 3.5 }));
      return b;
    }
    return spinnerRing(row.step, row.status === 'running');
  }
  function pill(row) {
    if (row.status === 'done') return node('span', 'bui-task-pill is-green', t.done);
    if (row.status === 'failed') return node('span', 'bui-task-pill is-red', t.failed);
    return null;
  }
  function render(row, i) {
    const item = items.get(row.key) || node('div', 'bui-task');
    item.style.animationDelay = `${i * 80}ms`;
    const head = node('button', 'bui-task-head');
    head.type = 'button';
    head.setAttribute('aria-expanded', String(item.classList.contains('is-open')));
    const slot = node('span', 'bui-task-slot');
    slot.append(badge(row));
    head.append(slot, node('span', 'bui-task-label', row.label));
    if (row.amount) head.append(node('span', 'bui-task-amount', row.amount));
    const p = pill(row);
    if (p) head.append(p);
    if (row.details?.length) head.append(chevronDown({ size: 15, className: 'bui-task-chevron' }));
    const wrap = node('div', 'bui-task-detail-wrap');
    const clip = node('div', 'bui-task-detail-clip');
    const detail = node('div', 'bui-task-detail');
    const lines = node('div', 'bui-task-lines');
    for (const d of row.details || []) {
      const line = node('div', 'bui-task-line');
      line.append(node('span', null, d.label), node('small', null, d.meta ?? ''));
      lines.append(line);
    }
    detail.append(node('span', 'bui-task-rail'), lines);
    clip.append(detail);
    wrap.append(clip);
    head.addEventListener('click', () => {
      if (!row.details?.length) return;
      const open = item.classList.toggle('is-open');
      head.setAttribute('aria-expanded', String(open));
      onToggle?.(row.key, open);
    });
    item.replaceChildren(head, wrap);
    items.set(row.key, item);
    return item;
  }
  function set(list) { el.replaceChildren(...list.map(render)); rows = list; }
  set(rows);
  return {
    el,
    set,
    update(key, patch) { set(rows.map(r => (r.key === key ? { ...r, ...patch } : r))); },
    destroy() {}
  };
}

/* ── RecommendationCard: sugestão com medidor de confiança ─ */

function meter(signal, tone) {
  const m = node('span', 'bui-meter');
  for (let bar = 0; bar < 3; bar++) {
    const b = node('span');
    b.style.background = bar < signal ? tone : 'var(--bui-line-strong)';
    m.append(b);
  }
  return m;
}

/** options: [{ key, body (Node | string), short, signal 0-3, tone, label, cta, ctaVariant }] */
export function recommendationCard({ title, options = [], labels = {}, onAccept } = {}) {
  const t = { alternatives: 'Alternativas', other: 'Outras opções', accepted: 'Aceito', ...labels };
  const el = node('div', 'bui-card bui-reco');
  const top = node('div', 'bui-card-pad');
  const body = node('p', 'bui-reco-body');
  top.append(node('span', 'bui-reco-title', title), body);
  const drawer = node('div', 'bui-reco-drawer');
  const dclip = node('div', 'bui-reco-clip');
  const dlist = node('div', 'bui-reco-list');
  dclip.append(dlist);
  drawer.append(dclip);
  const foot = node('div', 'bui-card-footer bui-reco-foot');
  const status = node('span', 'bui-reco-status');
  const acts = node('span', 'bui-reco-actions');
  const alt = button(t.alternatives, { variant: 'secondary' });
  alt.setAttribute('aria-expanded', 'false');
  const cta = button('', { variant: 'accent' });
  acts.append(alt, cta);
  foot.append(status, acts);
  el.append(top, drawer, foot);

  let selected = 0;
  let accepted = false;
  function paint() {
    const o = options[selected];
    body.replaceChildren(typeof o.body === 'string' ? document.createTextNode(o.body) : o.body.cloneNode(true));
    body.style.animation = 'none';
    void body.offsetWidth;
    body.style.animation = '';
    status.replaceChildren(meter(o.signal, o.tone), node('span', null, o.label));
    cta.className = `bui-btn graao-icon-swap is-${accepted ? 'success' : o.ctaVariant || 'accent'} is-sm`;
    setIconSwapLabel(cta, accepted ? t.accepted : o.cta);
    dlist.replaceChildren(node('p', 'bui-reco-other', t.other), ...options.map((opt, i) => {
      if (i === selected) return null;
      const row = node('button', 'bui-reco-row');
      row.type = 'button';
      row.append(meter(opt.signal, opt.tone), node('span', 'bui-reco-short', opt.short), node('small', null, opt.label));
      row.addEventListener('click', () => { selected = i; accepted = false; paint(); });
      return row;
    }).filter(Boolean));
  }
  alt.addEventListener('click', () => {
    const open = el.classList.toggle('is-open');
    alt.setAttribute('aria-expanded', String(open));
  });
  cta.addEventListener('click', () => {
    if (accepted) return;
    accepted = true;
    paint();
    onAccept?.(options[selected]);
  });
  paint();
  return { el, destroy() {} };
}

/* ── ContextCards: trechos recuperados com a fonte ───────── */

/** chunks: [{ title, chars, body, source, badge, tone }] */
export function contextCards({ chunks = [], header = 'Trechos', count } = {}) {
  const el = node('div', 'bui-context');
  const head = node('div', 'bui-context-head');
  head.append(node('span', null, header), node('span', 'bui-context-count', String(count ?? chunks.length)));
  el.append(head);
  chunks.forEach((chunk, i) => {
    const card = node('div', 'bui-card bui-context-card');
    card.style.animationDelay = `${i * 100}ms`;
    const bar = node('div', 'bui-context-bar');
    const name = node('span', 'bui-context-title');
    name.append(svg('<path d="M4 6h16M4 12h16M4 18h10"/>', { size: 11, width: 2.5 }), node('span', null, chunk.title));
    bar.append(name);
    if (chunk.chars) bar.append(node('small', null, chunk.chars));
    const src = node('span', 'bui-context-source');
    src.style.transitionDelay = `${i * 80}ms`;
    const b = node('span', 'bui-context-badge', chunk.badge || 'TXT');
    b.style.background = chunk.tone || 'var(--bui-ink-3)';
    src.append(b, node('span', null, chunk.source));
    const foot = node('div', 'bui-context-foot');
    foot.append(src);
    card.append(bar, node('p', 'bui-context-body', chunk.body), foot);
    el.append(card);
  });
  const timer = setTimeout(() => el.classList.add('is-shown'), 700);
  return { el, destroy() { clearTimeout(timer); } };
}

// Ajudantes internos, reaproveitados por beautiful-ui-more.js.
export { node as buiNode, svg as buiSvg, chevronDown as buiChevron };
