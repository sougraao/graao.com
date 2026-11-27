// Toasts do graao: avisos empilhados no canto da tela, sem dependências (estilos em toast.css).
//
//   toast('Salvo.')                                   aviso neutro
//   toast.success / error / warning / info / loading  com ícone; erros ficam mais tempo na tela
//   toast('Contato excluído.', { description, duration, id, action: { label: 'Desfazer', onClick } })
//   toast.promise(salvar(), { loading: 'Salvando…', success: 'Salvo.', error: e => e.message })
//   toast.dismiss(id)  /  toast.dismiss()             fecha um ou todos
//
// Passar o mesmo `id` atualiza o aviso existente em vez de criar outro. O texto é escrito em
// português e o observador do i18n traduz os elementos assim que entram na página.

const VISIBLE = 3;        // avisos visíveis na pilha; os mais antigos somem até expirar
const GAP = 10;           // espaço entre avisos com a pilha aberta
const PEEK = 12;          // quanto cada aviso de trás aparece com a pilha fechada
const EXIT_MS = 220;
const SWIPE_PX = 64;
const DURATION = { default: 4600, success: 4600, info: 4600, warning: 6000, error: 7000, loading: Infinity };

const ICONS = {
  success: '<path d="M20 6 9 17l-5-5"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16.5h.01"/>',
  warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4.5M12 8h.01"/>',
  loading: '<path d="M21 12a9 9 0 1 1-6.2-8.56"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>'
};
const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

const toasts = [];        // o mais novo primeiro
let host, list, polite, assertive, expanded = false, seq = 0;

function mount() {
  if (host) return place();
  host = document.createElement('section');
  host.className = 'toaster';
  host.setAttribute('aria-label', 'Avisos');
  // Como popover, a pilha entra na camada de topo e fica acima dos diálogos modais.
  if ('popover' in host) host.popover = 'manual';
  list = document.createElement('ol');
  polite = liveRegion('polite');
  assertive = liveRegion('assertive');
  host.append(list, polite, assertive);
  host.addEventListener('pointerenter', () => setExpanded(true));
  host.addEventListener('pointerleave', () => { if (!host.contains(document.activeElement)) setExpanded(false); });
  host.addEventListener('focusin', () => setExpanded(true));
  host.addEventListener('focusout', event => { if (!host.contains(event.relatedTarget) && !host.matches(':hover')) setExpanded(false); });
  document.addEventListener('visibilitychange', () => toasts.forEach(document.hidden ? pause : resume));
  addEventListener('resize', () => { toasts.forEach(measure); layout(); });
  // Diálogos abrem, fecham e somem do DOM (o app troca o #overlay inteiro): a pilha acompanha.
  new MutationObserver(() => { if (!host.isConnected || toasts.length) place(); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
  document.addEventListener('close', () => queueMicrotask(place), true);
  place();
}

// Com um diálogo modal aberto, tudo fora dele fica inerte: a pilha precisa morar dentro do modal
// do topo para continuar clicável. Sem modal, volta para o <body>.
function place() {
  let target = document.body;
  try { target = [...document.querySelectorAll('dialog:modal')].at(-1) || document.body; } catch {}
  // Mover o nó fecha o popover; reabrir depois do modal o põe acima dele na camada de topo.
  if (host.parentNode !== target) target.append(host);
  if (host.popover === 'manual' && !host.matches(':popover-open')) try { host.showPopover(); } catch {}
}

function liveRegion(level) {
  const region = document.createElement('div');
  region.className = 'toast-sr';
  region.setAttribute('aria-live', level);
  region.setAttribute('aria-atomic', 'true');
  return region;
}

// Leitores de tela não anunciam de forma confiável uma região viva recém-criada, então o texto
// vai para regiões fixas. Um elemento novo (não só texto) deixa o i18n traduzir o anúncio.
function announce(t) {
  const line = document.createElement('span');
  line.textContent = t.description ? `${t.title}${/[.!?…:]$/.test(t.title) ? '' : '.'} ${t.description}` : t.title;
  (t.type === 'error' ? assertive : polite).replaceChildren(line);
}


const text = value => value instanceof Error ? value.message : String(value ?? '');

function show(type, message, opts = {}) {
  if (typeof document === 'undefined') return '';
  mount();
  const title = text(message), description = text(opts.description);
  let t = opts.id != null && toasts.find(item => item.id === opts.id && !item.removed);
  // O mesmo aviso repetido (ex.: “Copiado.” várias vezes) reaproveita o da frente em vez de empilhar.
  const front = toasts[0];
  if (!t && opts.id == null && front && !front.removed && front.type === type && front.title === title && front.description === description) t = front;
  const fresh = !t;
  if (fresh) {
    t = { id: opts.id ?? `toast-${++seq}` };
    t.el = document.createElement('li');
    t.el.className = 'toast';
    t.el.dataset.entering = '';
    bindSwipe(t);
    t.el.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); dismiss(t.id); } });
    toasts.unshift(t);
    list.append(t.el);
  }
  Object.assign(t, { type, title, description, action: opts.action, onDismiss: opts.onDismiss, duration: opts.duration ?? DURATION[type] ?? DURATION.default });
  render(t);
  if (!fresh) bump(t);
  measure(t);
  layout();
  if (fresh) { t.el.getBoundingClientRect(); delete t.el.dataset.entering; }
  arm(t);
  announce(t);
  return t.id;
}

function render(t) {
  const el = t.el;
  el.dataset.type = t.type;
  el.setAttribute('role', t.type === 'error' ? 'alert' : 'status');
  el.setAttribute('aria-live', 'off');   // o anúncio sai pelas regiões fixas; evita leitura dobrada
  const parts = [];
  if (ICONS[t.type]) {
    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.innerHTML = svg(t.type);
    parts.push(icon);
  }
  const body = document.createElement('div');
  body.className = 'toast-body';
  const title = document.createElement('p');
  title.className = 'toast-title';
  title.textContent = t.title;
  body.append(title);
  if (t.description) {
    const description = document.createElement('p');
    description.className = 'toast-desc';
    description.textContent = t.description;
    body.append(description);
  }
  parts.push(body);
  if (t.action?.label) {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'toast-action';
    action.textContent = t.action.label;
    action.addEventListener('click', event => {
      t.action.onClick?.(event);
      if (!event.defaultPrevented) dismiss(t.id);
    });
    parts.push(action);
  }
  if (t.type !== 'loading') {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Fechar aviso');
    close.innerHTML = svg('close');
    close.addEventListener('click', () => dismiss(t.id));
    parts.push(close);
  }
  el.replaceChildren(...parts);
}

function bump(t) {
  t.el.classList.remove('toast-bump');
  t.el.getBoundingClientRect();
  t.el.classList.add('toast-bump');
}

// Altura natural do aviso, sem a altura fixa que a pilha fechada impõe aos de trás.
function measure(t) {
  const previous = t.el.style.height;
  t.el.style.height = 'auto';
  t.height = t.el.offsetHeight;
  t.el.style.height = previous;
}

function layout() {
  const live = toasts.filter(t => !t.removed);
  let offset = 0;
  live.forEach((t, index) => {
    const el = t.el, front = index === 0;
    el.toggleAttribute('data-front', front);
    el.toggleAttribute('data-hidden', index >= VISIBLE);
    el.style.setProperty('--y', `${expanded ? -offset : -index * PEEK}px`);
    el.style.setProperty('--s', expanded ? 1 : Math.max(0, 1 - index * 0.05));
    el.style.height = `${expanded || front ? t.height : live[0].height}px`;
    el.style.zIndex = String(live.length - index);
    offset += t.height + GAP;
  });
  const shown = Math.min(live.length, VISIBLE);
  const stack = !live.length ? 0 : expanded
    ? live.slice(0, shown).reduce((sum, t) => sum + t.height, 0) + GAP * (shown - 1)
    : live[0].height + PEEK * (shown - 1);
  host.style.setProperty('--stack-h', `${stack}px`);
}

function setExpanded(value) {
  value = value && toasts.some(t => !t.removed);
  if (value === expanded) return;
  expanded = value;
  host.toggleAttribute('data-expanded', expanded);
  toasts.forEach(expanded ? pause : resume);
  layout();
}

function arm(t) {
  clearTimeout(t.timer);
  t.started = 0;
  t.remaining = t.duration;
  if (!expanded && !document.hidden) resume(t);
}
function resume(t) {
  if (t.removed || t.started || !Number.isFinite(t.remaining)) return;
  t.started = Date.now();
  t.timer = setTimeout(() => dismiss(t.id), Math.max(0, t.remaining));
}
function pause(t) {
  if (!t.started) return;
  clearTimeout(t.timer);
  t.remaining -= Date.now() - t.started;
  t.started = 0;
}

function dismiss(id) {
  const targets = toasts.filter(t => !t.removed && (id == null || t.id === id));
  for (const t of targets) {
    clearTimeout(t.timer);
    t.removed = true;
    t.el.dataset.removed = '';
    t.el.inert = true;
    setTimeout(() => {
      t.el.remove();
      toasts.splice(toasts.indexOf(t), 1);
    }, EXIT_MS);
    t.onDismiss?.(t.id);
  }
  if (!targets.length) return;
  if (!toasts.some(t => !t.removed)) setExpanded(false);
  layout();
}

// Arrastar para o lado fecha o aviso (toque e mouse).
function bindSwipe(t) {
  let startX = 0, dx = 0, active = false;
  t.el.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    active = true; startX = event.clientX; dx = 0;
    t.el.setPointerCapture(event.pointerId);
  });
  t.el.addEventListener('pointermove', event => {
    if (!active) return;
    dx = event.clientX - startX;
    if (Math.abs(dx) > 4) t.el.dataset.swiping = '';
    t.el.style.setProperty('--dx', `${dx}px`);
  });
  const end = () => {
    if (!active) return;
    active = false;
    delete t.el.dataset.swiping;
    if (Math.abs(dx) >= SWIPE_PX) {
      t.el.style.setProperty('--dx', `${Math.sign(dx) * (t.el.offsetWidth + 40)}px`);
      dismiss(t.id);
    } else t.el.style.removeProperty('--dx');
  };
  t.el.addEventListener('pointerup', end);
  t.el.addEventListener('pointercancel', end);
}

export function toast(message, opts) { return show('default', message, opts); }
toast.success = (message, opts) => show('success', message, opts);
toast.error = (message, opts) => show('error', message, opts);
toast.warning = (message, opts) => show('warning', message, opts);
toast.info = (message, opts) => show('info', message, opts);
toast.loading = (message, opts) => show('loading', message, opts);
toast.dismiss = dismiss;
toast.promise = (promise, messages = {}) => {
  const id = toast.loading(messages.loading ?? 'Carregando…', { description: messages.description });
  const pick = (value, result) => typeof value === 'function' ? value(result) : value;
  const run = typeof promise === 'function' ? promise() : promise;
  Promise.resolve(run).then(
    result => { const message = pick(messages.success, result); message == null ? dismiss(id) : toast.success(message, { id }); },
    error => toast.error(pick(messages.error, error) || text(error) || 'Algo deu errado.', { id })
  );
  return run;
};

export default toast;
