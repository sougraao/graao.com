// graao motion layer: vanilla ports of microkit.co interactions (MIT).
// The app re-renders whole regions with innerHTML, so every enhancement is re-applied
// after each render. Indicators remember their last spot by key and slide from there,
// which makes a full re-render read as one continuous motion.
import { icon } from './icons.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const last = new Map();   // indicator key -> {x,y,w,h}
const counts = new Map(); // metric key -> last shown value

const rel = (el, host) => {
  const a = el.getBoundingClientRect(), b = host.getBoundingClientRect();
  const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  return {
    x: (a.left - b.left) / z + host.scrollLeft - host.clientLeft,
    y: (a.top - b.top) / z + host.scrollTop - host.clientTop,
    w: a.width / z,
    h: a.height / z
  };
};
const keyOf = (host, items, prefix) => `${prefix}:${host.getAttribute('aria-label') || ''}:${items.map(n => n.textContent.trim()).join('|')}`;

// Moves `node` to `to`, starting from where the same key last was (FLIP across re-renders).
function slide(node, key, to, apply) {
  const from = last.get(key);
  if (from && !reduce && (from.x !== to.x || from.y !== to.y || from.w !== to.w || from.h !== to.h)) {
    node.style.transition = 'none'; apply(node, from); void node.offsetWidth; node.style.transition = '';
  }
  apply(node, to);
  last.set(key, to);
}

/* Glide Pill Tabs: selected pill + hover glide */
function pillTabs(track) {
  const tabs = [...track.querySelectorAll(':scope > button')];
  if (!tabs.length) return;
  track.classList.add('g-pill');
  const pill = Object.assign(document.createElement('span'), { className: 'g-indicator', ariaHidden: 'true' });
  track.prepend(pill);
  const key = keyOf(track, tabs, 'tabs');
  const place = () => {
    const on = track.querySelector(':scope > button.selected, :scope > button[aria-selected="true"]');
    if (!on) { pill.style.opacity = '0'; return; }
    pill.style.opacity = '1';
    slide(pill, key, { x: on.offsetLeft, y: 0, w: on.offsetWidth, h: 0 }, (n, r) => { n.style.transform = `translateX(${r.x}px)`; n.style.width = `${r.w}px`; });
  };
  place();
  // Tabs that only toggle a class (no re-render) still move the pill.
  new MutationObserver(place).observe(track, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-selected'] });
  glide(track, 'button');
}

/* Hover Glide: one highlight travels between siblings instead of each lighting up on its own */
function glide(host, selector, ring = false, deep = false) {
  const g = Object.assign(document.createElement('span'), { className: `g-glide${ring ? ' g-ring' : ''}`, ariaHidden: 'true' });
  host.prepend(g);
  let shown = false;
  const place = item => {
    const r = rel(item, host);
    if (!shown) g.style.transition = 'opacity 180ms ease';
    g.style.transform = `translate(${r.x}px,${r.y}px)`; g.style.width = `${r.w}px`; g.style.height = `${r.h}px`;
    if (ring) g.style.borderRadius = getComputedStyle(item).borderTopLeftRadius;
    if (!shown) { void g.offsetWidth; g.style.transition = ''; shown = true; }
    g.dataset.visible = '';
  };
  const hide = () => { shown = false; delete g.dataset.visible; };
  // By default only direct children count, so nested matches (a button inside a card) never steal the highlight.
  // `deep` lets grouped items (sidebar sections) share one highlight.
  const pick = e => {
    let item = e.target instanceof Element && e.target.closest(selector);
    if (!deep) while (item && item.parentElement !== host) item = item.parentElement?.closest(selector);
    if (item && host.contains(item)) place(item);
  };
  host.addEventListener('pointerover', pick);
  host.addEventListener('focusin', pick);
  host.addEventListener('pointerleave', hide);
  host.addEventListener('focusout', e => { if (!(e.relatedTarget instanceof Node && host.contains(e.relatedTarget)) && !host.matches(':hover')) hide(); });
}

/* Spotlight Indicator (microkit.co): glowing vertical rail that slides to the active lateral menu item */
const spotLast = new Map();
const sideScroll = new Map();

function spotlight(host, opts = {}) {
  if (!(host instanceof HTMLElement)) return;
  const {
    key = 'spot',
    group = key,
    activeSelector = '.current, [aria-current="page"], [aria-current="true"], .selected, .active, [aria-pressed="true"]',
    inset = 4,
    left = null
  } = typeof opts === 'string' ? { key: opts } : opts;

  host._gSpotCleanup?.();

  if (sideScroll.has(key)) host.scrollTop = sideScroll.get(key);
  let onScroll = null;
  if (host.classList.contains('side-nav')) {
    onScroll = () => sideScroll.set(key, host.scrollTop);
    host.addEventListener('scroll', onScroll, { passive: true });
  }

  host.classList.add('g-spot-host');
  let bar = host.querySelector(':scope > .g-spot');
  if (!bar) {
    bar = document.createElement('span');
    bar.className = 'g-spot';
    bar.setAttribute('aria-hidden', 'true');
    if (left !== null) bar.style.left = `${left}px`;
    host.prepend(bar);
  } else if (left !== null) {
    bar.style.left = `${left}px`;
  }

  let animated = false;
  let rafId = 0;

  const ensureBar = () => {
    if (!bar.isConnected && host.isConnected) host.prepend(bar);
  };

  const place = (instant = false) => {
    if (!host.isConnected) return;
    ensureBar();
    const active = host.querySelector(activeSelector);
    if (!active) {
      delete bar.dataset.visible;
      return;
    }
    const r = rel(active, host);
    if (r.h <= 0) {
      delete bar.dataset.visible;
      return;
    }
    const pad = Math.min(inset, Math.max(2, Math.floor(r.h * 0.16)));
    const top = Math.round((r.y + pad) * 10) / 10;
    const height = Math.max(12, Math.round((r.h - pad * 2) * 10) / 10);
    const vpTop = active.getBoundingClientRect().top;

    const prev = spotLast.get(group);
    const sameSpot = prev && prev.id === key && Math.abs(prev.top - top) < 0.5 && Math.abs(prev.height - height) < 0.5;

    if (!animated && !instant && !reduce && prev && !sameSpot) {
      let fromTop = prev.top;
      if (prev.id !== key) {
        const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
        const hostRect = host.getBoundingClientRect();
        fromTop = Math.round(((prev.vpTop - hostRect.top) / z + host.scrollTop - host.clientTop + pad) * 10) / 10;
      }
      bar.style.transition = 'none';
      bar.style.top = `${fromTop}px`;
      bar.style.height = `${prev.height}px`;
      bar.dataset.visible = '';
      void bar.offsetHeight;
      bar.style.transition = '';
    } else if ((!animated && !prev) || instant || reduce) {
      bar.style.transition = 'none';
      bar.style.top = `${top}px`;
      bar.style.height = `${height}px`;
      bar.dataset.visible = '';
      void bar.offsetHeight;
      bar.style.transition = '';
    }

    bar.style.top = `${top}px`;
    bar.style.height = `${height}px`;
    bar.dataset.visible = '';
    spotLast.set(group, { id: key, top, height, vpTop });

    if (!animated) {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => { animated = true; });
    }
  };

  place(false);

  const mo = new MutationObserver(records => {
    const onlyBar = records.every(rec =>
      rec.target === bar ||
      (rec.type === 'childList' && rec.addedNodes.length === 1 && rec.addedNodes[0] === bar && rec.removedNodes.length === 0)
    );
    if (onlyBar) return;
    place(false);
  });
  mo.observe(host, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'aria-current', 'aria-pressed', 'aria-selected']
  });

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      if (!host.isConnected) { cleanup(); return; }
      place(true);
    });
    ro.observe(host);
  }

  const cleanup = () => {
    cancelAnimationFrame(rafId);
    mo.disconnect();
    ro?.disconnect();
    if (onScroll) host.removeEventListener('scroll', onScroll);
  };
  host._gSpotCleanup = cleanup;
}

/* Sidebar open/close: the shell is rebuilt on toggle, so the column width is replayed from its last state. */
const shellState = new Map();
function shellMotion(shell) {
  const kind = shell.classList.contains('ag-shell') ? 'agency' : 'app';
  const wide = shell.classList.contains('wide'), before = shellState.get(kind);
  shellState.set(kind, wide);
  if (before === undefined || before === wide || reduce || innerWidth <= 700) return;
  shell.style.transition = 'none';
  shell.style.gridTemplateColumns = `${before ? 248 : 64}px minmax(0,1fr)`;
  void shell.offsetWidth;
  shell.style.transition = ''; shell.style.gridTemplateColumns = '';
  if (wide) { shell.classList.add('g-expanding'); setTimeout(() => shell.classList.remove('g-expanding'), 700); }
}

/* Tooltips for the collapsed rail (labels are hidden there) */
const tip = Object.assign(document.createElement('div'), { className: 'g-tip', role: 'tooltip' });
tip.id = 'g-tip';
document.body.append(tip);
let tipFor = null;
const showTip = el => {
  tipFor = el;
  tip.textContent = el.dataset.tip;
  const r = el.getBoundingClientRect();
  tip.style.setProperty('--tx', `${Math.round(r.right + 12)}px`);
  tip.style.setProperty('--ty', `${Math.round(r.top + r.height / 2 - tip.offsetHeight / 2)}px`);
  tip.dataset.show = '';
};
const hideTip = () => { tipFor = null; delete tip.dataset.show; };
const tipTarget = e => e.target instanceof Element ? e.target.closest('.shell:not(.wide) .g-side [data-tip]') : null;
document.addEventListener('pointerover', e => { const el = tipTarget(e); if (el && el !== tipFor) showTip(el); else if (!el && tipFor) hideTip(); });
document.addEventListener('focusin', e => { const el = tipTarget(e); if (el && el.matches(':focus-visible')) showTip(el); else hideTip(); });
for (const type of ['pointerdown', 'scroll', 'hashchange', 'blur']) addEventListener(type, hideTip, true);

/* Sliding Underline Tabs (microkit.co): bordered card + sliding pill underline + content panel enter */
const utabLast = new Map();   // key -> { x, w }
const utabScroll = new Map(); // key -> scrollLeft
const utabActive = new Map(); // key -> active tab id

function mountSlidingUnderline({ host, head = null, list, track, panel = null, key, activeValue = null }) {
  if (!(host instanceof HTMLElement) || !(track instanceof HTMLElement)) return;
  host._gUtabsCleanup?.();

  const scroller = list || host;
  const headEl = head || (host.classList.contains('g-utabs-head') ? host : host.querySelector(':scope > .g-utabs-head'));

  let prevBtn = headEl?.querySelector(':scope > .g-utabs-nav.prev');
  let nextBtn = headEl?.querySelector(':scope > .g-utabs-nav.next');
  if (headEl && scroller && (!prevBtn || !nextBtn)) {
    if (!prevBtn) {
      prevBtn = document.createElement('button');
      prevBtn.type = 'button';
      prevBtn.className = 'g-utabs-nav prev is-disabled';
      prevBtn.setAttribute('aria-label', 'Rolar para esquerda');
      prevBtn.setAttribute('title', 'Rolar para esquerda');
      prevBtn.tabIndex = -1;
      prevBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
      headEl.prepend(prevBtn);
    }
    if (!nextBtn) {
      nextBtn = document.createElement('button');
      nextBtn.type = 'button';
      nextBtn.className = 'g-utabs-nav next is-disabled';
      nextBtn.setAttribute('aria-label', 'Rolar para direita');
      nextBtn.setAttribute('title', 'Rolar para direita');
      nextBtn.tabIndex = -1;
      nextBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
      headEl.append(nextBtn);
    }
  }

  // `*{scroll-behavior:smooth}` would animate every restore: reveal() then reads a stale 0 and pushes the
  // active tab to the edge. Restores, reveals and drags jump; only the arrow buttons glide.
  const jump = left => scroller.scrollTo({ left, behavior: 'instant' });
  const scrollStep = () => Math.max(180, Math.floor(scroller.clientWidth * 0.65));
  const onPrev = e => { e.preventDefault(); scroller.scrollBy({ left: -scrollStep(), behavior: 'smooth' }); };
  const onNext = e => { e.preventDefault(); scroller.scrollBy({ left: scrollStep(), behavior: 'smooth' }); };
  prevBtn?.addEventListener('click', onPrev);
  nextBtn?.addEventListener('click', onNext);

  const onWheel = e => {
    if (e.ctrlKey) return;
    const overflow = scroller.scrollWidth - scroller.clientWidth;
    if (overflow <= 1) return;
    if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
      const canRight = e.deltaY > 0 && scroller.scrollLeft < overflow - 1;
      const canLeft = e.deltaY < 0 && scroller.scrollLeft > 1;
      if (canRight || canLeft) {
        jump(scroller.scrollLeft + e.deltaY);
        e.preventDefault();
      }
    }
  };
  scroller.addEventListener('wheel', onWheel, { passive: false });

  // Drag the strip with the mouse (touch already pans natively). A drag never counts as a click on a tab.
  let drag = null, dragged = false;
  const onDown = e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || scroller.scrollWidth - scroller.clientWidth <= 1) return;
    drag = { id: e.pointerId, x: e.clientX, left: scroller.scrollLeft, moved: false };
    dragged = false;
  };
  const onMove = e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved) {
      if (Math.abs(dx) < 6) return;
      drag.moved = true;
      scroller.setPointerCapture?.(e.pointerId);
      scroller.classList.add('is-dragging');
    }
    jump(drag.left - dx);
  };
  const onUp = e => {
    if (!drag || e.pointerId !== drag.id) return;
    dragged = drag.moved;
    drag = null;
    scroller.classList.remove('is-dragging');
  };
  const onClickCapture = e => {
    if (!dragged) return;
    dragged = false;
    e.preventDefault();
    e.stopPropagation();
  };
  const onDragStart = e => e.preventDefault();
  scroller.addEventListener('pointerdown', onDown);
  scroller.addEventListener('pointermove', onMove);
  scroller.addEventListener('pointerup', onUp);
  scroller.addEventListener('pointercancel', onUp);
  scroller.addEventListener('click', onClickCapture, true);
  scroller.addEventListener('dragstart', onDragStart);

  const syncFade = () => {
    const overflow = scroller.scrollWidth - scroller.clientWidth;
    const hasOverflow = overflow > 4;
    if (headEl) headEl.toggleAttribute('data-has-overflow', hasOverflow);
    scroller.toggleAttribute('data-fade-left', hasOverflow && scroller.scrollLeft > 4);
    scroller.toggleAttribute('data-fade-right', hasOverflow && scroller.scrollLeft < overflow - 4);
    if (prevBtn) {
      const disabled = !hasOverflow || scroller.scrollLeft <= 4;
      prevBtn.classList.toggle('is-disabled', disabled);
      prevBtn.disabled = disabled;
    }
    if (nextBtn) {
      const disabled = !hasOverflow || scroller.scrollLeft >= overflow - 4;
      nextBtn.classList.toggle('is-disabled', disabled);
      nextBtn.disabled = disabled;
    }
  };
  if (utabScroll.has(key)) jump(utabScroll.get(key));

  // Page tabs stick under the floating top bar (CSS); while stuck they get the same blurred edge as the bar.
  // A head that is not sticky never leaves the top of its card, so the check is the same for every strip.
  const syncStuck = () => {
    if (!host.isConnected) { cleanup(); return; }
    headEl.toggleAttribute('data-stuck', headEl.getBoundingClientRect().top - host.getBoundingClientRect().top > 1);
  };
  if (headEl) { document.addEventListener('scroll', syncStuck, { capture: true, passive: true }); syncStuck(); }
  const onScroll = () => { utabScroll.set(key, scroller.scrollLeft); syncFade(); };
  scroller.addEventListener('scroll', onScroll, { passive: true });

  let bar = track.querySelector(':scope > .g-utabs-indicator');
  if (!bar) {
    bar = document.createElement('span');
    bar.className = 'g-utabs-indicator';
    bar.setAttribute('aria-hidden', 'true');
    track.append(bar);
  }

  let animated = false;
  let rafId = 0;

  const findActive = () =>
    track.querySelector(':scope > .selected, :scope > .current, :scope > [aria-selected="true"], :scope > [aria-current="page"], :scope > [aria-current="true"], :scope > [aria-pressed="true"]');

  const reveal = on => {
    if (!on || scroller.scrollWidth <= scroller.clientWidth + 2) return;
    const left = on.offsetLeft;
    const right = left + on.offsetWidth;
    const pad = 36;
    if (left < scroller.scrollLeft + pad) {
      jump(Math.max(0, left - pad));
    } else if (right > scroller.scrollLeft + scroller.clientWidth - pad) {
      jump(Math.min(scroller.scrollWidth - scroller.clientWidth, right - scroller.clientWidth + pad));
    }
    utabScroll.set(key, scroller.scrollLeft);
  };

  const place = (instant = false) => {
    if (!track.isConnected) return;
    if (!bar.isConnected) track.append(bar);
    const on = findActive();
    if (!on || on.offsetWidth <= 0) {
      delete bar.dataset.visible;
      return;
    }
    const inset = 0;
    const x = Math.round((on.offsetLeft + inset) * 10) / 10;
    const w = Math.max(14, Math.round((on.offsetWidth - inset * 2) * 10) / 10);
    const prev = utabLast.get(key);
    const same = prev && Math.abs(prev.x - x) < 0.5 && Math.abs(prev.w - w) < 0.5;

    if (!animated && !instant && !reduce && prev && !same) {
      bar.style.transition = 'none';
      bar.style.transform = `translateX(${prev.x}px)`;
      bar.style.width = `${prev.w}px`;
      bar.dataset.visible = '';
      void bar.offsetWidth;
      bar.style.transition = '';
    } else if ((!animated && !prev) || instant || reduce) {
      bar.style.transition = 'none';
      bar.style.transform = `translateX(${x}px)`;
      bar.style.width = `${w}px`;
      bar.dataset.visible = '';
      void bar.offsetWidth;
      bar.style.transition = '';
    }

    bar.style.transform = `translateX(${x}px)`;
    bar.style.width = `${w}px`;
    bar.dataset.visible = '';
    utabLast.set(key, { x, w });
    if (!animated) reveal(on);
    syncFade();

    if (!animated) {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => { animated = true; });
    }
  };

  place(false);

  if (panel instanceof HTMLElement) {
    const activeId = activeValue ?? findActive()?.textContent?.trim() ?? '';
    const prevActive = utabActive.get(key);
    utabActive.set(key, activeId);
    if (prevActive !== undefined && prevActive !== activeId && !reduce) {
      panel.classList.remove('is-entering');
      void panel.offsetWidth;
      panel.classList.add('is-entering');
      setTimeout(() => panel.classList.remove('is-entering'), 700);
    }
  }

  const mo = new MutationObserver(records => {
    const onlyBar = records.every(rec =>
      rec.target === bar ||
      (rec.type === 'childList' && rec.addedNodes.length === 1 && rec.addedNodes[0] === bar && rec.removedNodes.length === 0)
    );
    if (onlyBar) return;
    place(false);
  });
  mo.observe(track, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'aria-selected', 'aria-current', 'aria-pressed']
  });

  let ro = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => {
      if (!track.isConnected) { cleanup(); return; }
      place(true);
      syncFade();
    });
    ro.observe(track);
    if (scroller !== track) ro.observe(scroller);
    if (headEl && headEl !== scroller) ro.observe(headEl);
  }

  const cleanup = () => {
    cancelAnimationFrame(rafId);
    mo.disconnect();
    ro?.disconnect();
    scroller.removeEventListener('scroll', onScroll);
    scroller.removeEventListener('wheel', onWheel);
    document.removeEventListener('scroll', syncStuck, { capture: true });
    scroller.removeEventListener('pointerdown', onDown);
    scroller.removeEventListener('pointermove', onMove);
    scroller.removeEventListener('pointerup', onUp);
    scroller.removeEventListener('pointercancel', onUp);
    scroller.removeEventListener('click', onClickCapture, true);
    scroller.removeEventListener('dragstart', onDragStart);
    prevBtn?.removeEventListener('click', onPrev);
    nextBtn?.removeEventListener('click', onNext);
  };
  host._gUtabsCleanup = cleanup;
}

function slidingUnderlineTabs(host) {
  const head = host.querySelector(':scope > .g-utabs-head');
  const list = head?.querySelector(':scope > .g-utabs-list') || host.querySelector('.g-utabs-list');
  const track = list?.querySelector(':scope > .g-utabs-track');
  const panel = host.querySelector(':scope > .g-utabs-panel');
  if (!track) return;
  const items = [...track.querySelectorAll(':scope > button, :scope > a')];
  const key = `utabs:${host.dataset.utabs || keyOf(track, items, 'utabs')}`;
  mountSlidingUnderline({ host, head, list, track, panel, key, activeValue: host.dataset.utabsActive ?? null });
}

function slidingUnderlineBar(bar) {
  const items = [...bar.querySelectorAll(':scope > button, :scope > a')];
  if (!items.length) return;
  bar.classList.add('g-utabs-bar');
  let track = bar.querySelector(':scope > .g-utabs-track');
  if (!track) {
    track = document.createElement('div');
    track.className = 'g-utabs-track';
    for (const item of items) {
      item.classList.add('g-utabs-tab');
      track.append(item);
    }
    bar.append(track);
  }
  const key = `ubar:${bar.dataset.utabs || keyOf(track, items, bar.className)}`;
  mountSlidingUnderline({ host: bar, list: bar, track, panel: null, key });
}

/* Legacy fallback underline for any remaining link-based sub-navigation */
function underline(nav) {
  const on = nav.querySelector(':scope > a[aria-current]');
  if (!on) return;
  const u = Object.assign(document.createElement('span'), { className: 'g-underline', ariaHidden: 'true' });
  nav.append(u);
  slide(u, `under:${nav.closest('[class]')?.className}`, { x: on.offsetLeft, y: 0, w: on.offsetWidth, h: 0 }, (n, p) => { n.style.transform = `translateX(${p.x}px)`; n.style.width = `${p.w}px`; });
}

/* ───────── Count Up Number (Microkit × Graao) ─────────
   Faithful vanilla port of microkit.co/components/count-up-number:
   - Phantom-box inline-grid reserves the final settled width from frame 0 (zero layout shift)
   - Screen readers & clipboard read the settled value; the animated ticker is aria-hidden & right-aligned
   - Exponential ease-out (1 - 2^(-10p)) triggered on viewport entry via IntersectionObserver
   - Continuous interpolation from the last shown value on filter updates, fresh count-up on route/refresh
   - Full pt-BR & en-US currency, percentage, decimal, rating and unit support */
export function resetCountUps(prefix = '') {
  if (!prefix) { counts.clear(); return; }
  for (const key of counts.keys()) if (key.startsWith(prefix)) counts.delete(key);
}

function parseCountUp(raw) {
  if (!raw || !/\d/.test(raw)) return null;
  const m = raw.match(/^(\s*)([+-]?)([^\d+-]*?)(\d[\d.,]*)(.*)$/s);
  if (!m) return null;
  const [, lead, sign, mid, num, post] = m;
  // Never touch compound expressions (dates like 18/11/2026, ranges, "3 + 5") or text labels ("Etapa 1").
  if (/\d/.test(post)) return null;
  if (mid && !/^[\sR$US€£]*$/i.test(mid)) return null;

  const hasComma = num.includes(',');
  const hasDot = num.includes('.');
  const isPtBr = mid.includes('R$') || hasComma || /^\d{1,3}(\.\d{3})+$/.test(num);
  const locale = isPtBr ? 'pt-BR' : 'en-US';
  const decSep = isPtBr ? ',' : '.';
  const groupSep = isPtBr ? '.' : ',';
  const decIdx = num.lastIndexOf(decSep);
  const decimals = decIdx >= 0 ? num.length - decIdx - 1 : 0;
  const useGrouping = isPtBr
    ? (hasDot && (!hasComma || num.indexOf('.') < decIdx))
    : (hasComma && (!hasDot || num.indexOf(',') < decIdx));

  const normalized = isPtBr ? num.replace(/\./g, '').replace(',', '.') : num.replace(/,/g, '');
  const absTarget = Number(normalized);
  if (!Number.isFinite(absTarget)) return null;

  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping
  });
  if (formatter.format(absTarget) !== num) return null;

  const target = sign === '-' ? -absTarget : absTarget;
  const explicitPlus = sign === '+';
  const renderValue = value => {
    const abs = Math.abs(value);
    const rounded = decimals > 0 ? Number(abs.toFixed(decimals)) : Math.round(abs);
    const isZero = rounded === 0;
    const prefixSign = isZero
      ? (explicitPlus && target > 0 ? '+' : '')
      : value < 0 ? '-' : (explicitPlus ? '+' : '');
    return `${lead}${prefixSign}${mid}${formatter.format(isZero ? 0 : abs)}${post}`;
  };

  return { target, renderValue, settledText: raw };
}

function countUp(el, key, duration = 1800) {
  if (!(el instanceof HTMLElement) || el.querySelector('.g-cu')) return;
  const node = [...el.childNodes].find(n => n.nodeType === 3 && /\d/.test(n.textContent));
  if (!node) return;

  const parsed = parseCountUp(node.textContent);
  if (!parsed) return;

  const { target, renderValue, settledText } = parsed;
  const from = counts.get(key) ?? 0;
  counts.set(key, target);

  const wrap = document.createElement('span');
  wrap.className = 'g-cu';
  const phantom = document.createElement('span');
  phantom.className = 'g-cu-value';
  phantom.textContent = settledText;
  const ticker = document.createElement('span');
  ticker.className = 'g-cu-ticker';
  ticker.setAttribute('aria-hidden', 'true');
  const shouldAnimate = !reduce && from !== target;
  ticker.textContent = shouldAnimate ? renderValue(from) : settledText;
  wrap.append(phantom, ticker);
  node.replaceWith(wrap);

  if (!shouldAnimate) return;

  const runAnimation = () => {
    const start = performance.now();
    const length = Math.max(200, duration);
    const step = now => {
      if (!ticker.isConnected) return;
      const p = Math.min(1, (now - start) / length);
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      const current = from + (target - from) * eased;
      counts.set(key, current);
      ticker.textContent = renderValue(current);
      if (p < 1) {
        requestAnimationFrame(step);
      } else {
        counts.set(key, target);
        ticker.textContent = settledText;
      }
    };
    requestAnimationFrame(step);
  };

  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      runAnimation();
    }, { threshold: [0.25, 0.5] });
    io.observe(wrap);
  } else {
    runAnimation();
  }
}

function enhanceDashboardCard(card, scopeKey) {
  const cardId = card.dataset.dashboardCard || card.dataset.reportDrop || card.querySelector('header h2, header h3')?.textContent.trim() || 'card';
  const prefix = `dash:${scopeKey}:${cardId}`;
  const groups = [
    ['.dash-number b', 'num', 1900],
    ['.dash-status-total b', 'status', 1800],
    ['.dash-gauge b', 'gauge', 1800],
    ['.dash-conversion-value, .dash-conversion > strong', 'conv-rev', 1800],
    ['.dash-small-stats b', 'small', 1700],
    ['.dash-trend-total b', 'trend', 1700],
    ['.dash-delta .dash-delta-num', 'delta', 1400],
    ['.dash-meter strong', 'meter', 1300],
    ['.dash-funnel td:first-child b', 'funnel-val', 1300],
    ['.dash-funnel td:not(:first-child)', 'funnel-pct', 1300],
    ['.dash-table tbody td', 'table', 1200]
  ];
  for (const [selector, slot, duration] of groups) {
    card.querySelectorAll(selector).forEach((el, idx) => {
      countUp(el, `${prefix}:${slot}:${idx}`, duration);
    });
  }
}

/* ───────── Blur Glide Select & Floating Menus (microkit.co) ───────── */
const CHEV_SVG = icon('chevron', 14);
const CHECK_SVG = icon('check', 14);
const SEARCH_SVG = icon('search', 13);
const foldText = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

if (!HTMLSelectElement.prototype._gSelectPatched) {
  HTMLSelectElement.prototype._gSelectPatched = true;
  for (const prop of ['value', 'selectedIndex']) {
    const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, prop);
    if (!desc?.set) continue;
    Object.defineProperty(HTMLSelectElement.prototype, prop, {
      configurable: true,
      enumerable: desc.enumerable,
      get() { return desc.get.call(this); },
      set(v) { desc.set.call(this, v); this._gSync?.(); }
    });
  }
}

let activeSelectMenu = null;
let selectIdSeq = 0;

function closeSelectMenu(restoreFocus = false) {
  const cur = activeSelectMenu;
  if (!cur) return;
  activeSelectMenu = null;
  cur.cleanup();
  cur.wrap.classList.remove('is-open');
  cur.trigger.setAttribute('aria-expanded', 'false');
  cur.trigger.removeAttribute('aria-controls');
  delete cur.menu.dataset.open;
  const dispose = () => {
    try { if (cur.menu.matches(':popover-open')) cur.menu.hidePopover(); } catch {}
    cur.menu.remove();
  };
  if (reduce) dispose();
  else setTimeout(dispose, 270);
  if (restoreFocus && cur.trigger.isConnected) cur.trigger.focus();
}

function openSelectMenu(select, wrap, trigger, sync) {
  if (select.disabled) return;
  if (activeSelectMenu?.select === select) { closeSelectMenu(true); return; }
  if (activeSelectMenu) closeSelectMenu(false);

  const menuId = `g-select-menu-${++selectIdSeq}`;
  const menu = document.createElement('div');
  menu.id = menuId;
  menu.className = 'g-menu-surface g-select-menu';
  menu.setAttribute('role', 'presentation');
  if ('showPopover' in HTMLElement.prototype) menu.setAttribute('popover', 'manual');

  const optionCount = select.options.length;
  const searchable = optionCount >= 8;
  let searchWrap = null;
  let searchInput = null;
  if (searchable) {
    searchWrap = document.createElement('div');
    searchWrap.className = 'g-menu-search';
    searchWrap.innerHTML = SEARCH_SVG;
    searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Buscar…';
    searchInput.autocomplete = 'off';
    searchInput.setAttribute('aria-label', 'Filtrar opções');
    searchWrap.append(searchInput);
    menu.append(searchWrap);
  }

  const list = document.createElement('div');
  list.className = 'g-menu-list';
  list.setAttribute('role', 'listbox');
  const labelText = trigger.getAttribute('aria-label');
  if (labelText) list.setAttribute('aria-label', labelText);

  const hi = document.createElement('span');
  hi.className = 'g-menu-highlight';
  hi.setAttribute('aria-hidden', 'true');
  list.append(hi);

  const items = [];
  const appendOption = (opt, groupLabel = '') => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'g-menu-option';
    btn.setAttribute('role', 'option');
    btn.setAttribute('aria-selected', opt.selected ? 'true' : 'false');
    if (opt.disabled) {
      btn.setAttribute('aria-disabled', 'true');
      btn.tabIndex = -1;
    }
    const text = opt.textContent.trim() || opt.label || '';
    btn.dataset.search = foldText(`${text} ${groupLabel}`);
    btn.innerHTML = `<span class="g-menu-option-label"></span><span class="g-menu-check" aria-hidden="true">${CHECK_SVG}</span>`;
    btn.firstElementChild.textContent = text;
    items.push({ btn, opt, group: groupLabel });
    list.append(btn);
  };

  for (const child of select.children) {
    if (child.tagName === 'OPTGROUP') {
      const grp = document.createElement('div');
      grp.className = 'g-menu-group';
      grp.textContent = child.label || '';
      list.append(grp);
      const groupItems = [];
      for (const opt of child.children) {
        if (opt.tagName === 'OPTION') {
          appendOption(opt, child.label || '');
          groupItems.push(items[items.length - 1]);
        }
      }
      grp._gItems = groupItems;
    } else if (child.tagName === 'OPTION') {
      appendOption(child);
    }
  }

  const emptyMsg = document.createElement('div');
  emptyMsg.className = 'g-menu-empty';
  emptyMsg.textContent = 'Nenhuma opção encontrada';
  emptyMsg.hidden = items.length > 0;
  list.append(emptyMsg);
  menu.append(list);

  const host = select.closest('dialog') || document.body;
  host.append(menu);
  if ('showPopover' in HTMLElement.prototype) {
    try { menu.showPopover(); } catch {}
  }

  let hiShown = false;
  let activeIdx = items.findIndex(x => x.opt.selected && !x.opt.disabled);
  if (activeIdx < 0) activeIdx = items.findIndex(x => !x.opt.disabled);

  const visibleEnabled = () => items.filter(x => !x.btn.hidden && !x.opt.disabled);

  const moveHighlight = (btn, instant = false) => {
    if (!btn || btn.hidden) {
      hiShown = false;
      delete hi.dataset.visible;
      return;
    }
    const top = btn.offsetTop;
    const h = btn.offsetHeight;
    if (!h) return;
    if (!hiShown || instant) hi.style.transition = 'opacity .18s ease';
    hi.style.transform = `translateY(${top}px)`;
    hi.style.height = `${h}px`;
    if (!hiShown || instant) { void hi.offsetWidth; hi.style.transition = ''; hiShown = true; }
    hi.dataset.visible = '';
  };

  const setActive = (item, scroll = false, instant = false) => {
    for (const x of items) x.btn.classList.remove('is-active');
    if (!item || item.btn.hidden || item.opt.disabled) {
      activeIdx = -1;
      moveHighlight(null);
      return;
    }
    activeIdx = items.indexOf(item);
    item.btn.classList.add('is-active');
    if (scroll) item.btn.scrollIntoView({ block: 'nearest' });
    moveHighlight(item.btn, instant);
  };

  const commit = item => {
    if (!item || item.opt.disabled) return;
    const changed = select.selectedIndex !== item.opt.index;
    select.selectedIndex = item.opt.index;
    sync();
    wrap.classList.remove('is-invalid');
    closeSelectMenu(true);
    if (changed) {
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const position = () => {
    if (!trigger.isConnected) { closeSelectMenu(false); return; }
    const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const r = trigger.getBoundingClientRect();
    const trLeft = r.left / z, trRight = r.right / z, trTop = r.top / z, trBottom = r.bottom / z, trW = r.width / z;
    const vpW = window.innerWidth / z, vpH = window.innerHeight / z;
    const pad = 8, gap = 6;

    const minW = Math.min(Math.max(trW, 184), vpW - pad * 2);
    const maxW = Math.min(Math.max(trW, 340), vpW - pad * 2);
    menu.style.minWidth = `${Math.round(minW)}px`;
    menu.style.maxWidth = `${Math.round(maxW)}px`;

    const searchH = searchWrap ? searchWrap.offsetHeight : 0;
    const spaceBelow = vpH - trBottom - gap - pad;
    const spaceAbove = trTop - gap - pad;
    const desiredListH = Math.min(list.scrollHeight + 2, 292);
    const desiredTotal = desiredListH + searchH + 12;

    const placeBottom = spaceBelow >= Math.min(desiredTotal, 220) || spaceBelow >= spaceAbove;
    const availSpace = placeBottom ? spaceBelow : spaceAbove;
    const listMax = Math.max(110, Math.min(292, availSpace - searchH - 12));
    list.style.maxHeight = `${Math.floor(listMax)}px`;

    const mw = Math.min(menu.offsetWidth || minW, vpW - pad * 2);
    let left = trLeft;
    if (left + mw > vpW - pad) left = trRight - mw;
    left = Math.max(pad, Math.min(left, vpW - mw - pad));

    menu.dataset.side = placeBottom ? 'bottom' : 'top';
    const top = placeBottom
      ? Math.round(trBottom + gap)
      : Math.max(pad, Math.round(trTop - gap - menu.offsetHeight));

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${top}px`;
  };

  position();
  wrap.classList.add('is-open');
  trigger.setAttribute('aria-expanded', 'true');
  trigger.setAttribute('aria-controls', menuId);
  void menu.offsetWidth;
  menu.dataset.open = '';

  if (activeIdx >= 0) {
    setActive(items[activeIdx], true, true);
  }

  if (searchInput) {
    searchInput.focus({ preventScroll: true });
    searchInput.addEventListener('input', () => {
      const q = foldText(searchInput.value.trim());
      let shown = 0;
      for (const x of items) {
        const match = !q || x.btn.dataset.search.includes(q);
        x.btn.hidden = !match;
        if (match) shown++;
      }
      for (const grp of list.querySelectorAll('.g-menu-group')) {
        grp.hidden = !grp._gItems?.some(x => !x.btn.hidden);
      }
      emptyMsg.hidden = shown > 0;
      const first = visibleEnabled()[0] || null;
      setActive(first, false, true);
      position();
    });
  }

  list.addEventListener('pointerover', e => {
    const btn = e.target instanceof Element && e.target.closest('.g-menu-option');
    if (!btn) return;
    const item = items.find(x => x.btn === btn);
    if (item && !item.opt.disabled) setActive(item, false, false);
  });
  list.addEventListener('pointerleave', () => {
    hiShown = false;
    delete hi.dataset.visible;
  });
  list.addEventListener('click', e => {
    const btn = e.target instanceof Element && e.target.closest('.g-menu-option');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const item = items.find(x => x.btn === btn);
    commit(item);
  });

  const step = delta => {
    const vis = visibleEnabled();
    if (!vis.length) return;
    const cur = items[activeIdx];
    const pos = vis.indexOf(cur);
    const next = pos < 0 ? (delta > 0 ? 0 : vis.length - 1) : (pos + delta + vis.length) % vis.length;
    setActive(vis[next], true, false);
  };

  let typeBuf = '', typeTimer = 0;
  const onKeyDown = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSelectMenu(true); return; }
    if (e.key === 'Tab') { closeSelectMenu(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); return; }
    if (e.key === 'Home' && !searchInput) { e.preventDefault(); const v = visibleEnabled(); if (v.length) setActive(v[0], true, false); return; }
    if (e.key === 'End' && !searchInput) { e.preventDefault(); const v = visibleEnabled(); if (v.length) setActive(v[v.length - 1], true, false); return; }
    if (e.key === 'Enter' || (e.key === ' ' && document.activeElement !== searchInput)) {
      e.preventDefault();
      e.stopPropagation();
      const target = (activeIdx >= 0 && !items[activeIdx].btn.hidden) ? items[activeIdx] : visibleEnabled()[0];
      if (target) commit(target);
      return;
    }
    if (!searchInput && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      typeBuf += foldText(e.key);
      clearTimeout(typeTimer);
      typeTimer = setTimeout(() => { typeBuf = ''; }, 650);
      const match = visibleEnabled().find(x => x.btn.dataset.search.startsWith(typeBuf))
        || visibleEnabled().find(x => x.btn.dataset.search.includes(typeBuf));
      if (match) setActive(match, true, false);
    }
  };

  const onPointerDown = e => {
    const t = e.target;
    if (t instanceof Node && (menu.contains(t) || trigger.contains(t))) return;
    closeSelectMenu(false);
  };

  const onScroll = e => {
    if (e.target instanceof Node && menu.contains(e.target)) return;
    position();
  };

  const onResize = () => position();
  const onHostClose = () => closeSelectMenu(false);

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onScroll, true);
  if (host.tagName === 'DIALOG') host.addEventListener('close', onHostClose);

  activeSelectMenu = {
    select, wrap, trigger, menu,
    cleanup() {
      clearTimeout(typeTimer);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
      if (host.tagName === 'DIALOG') host.removeEventListener('close', onHostClose);
    }
  };
}

function enhanceSelect(select) {
  if (select.dataset.gSelect) return;
  if (select.multiple || select.size > 1) return;
  if (select.hasAttribute('data-native-select')) return;
  if (select.closest('.fb-sheet')) return;
  select.dataset.gSelect = '1';

  const wrap = document.createElement('span');
  wrap.className = 'g-select';
  select.parentNode.insertBefore(wrap, select);
  wrap.append(select);

  select.classList.add('g-select-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'g-select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');

  const ariaLabel = select.getAttribute('aria-label');
  if (ariaLabel) trigger.setAttribute('aria-label', ariaLabel);
  const ariaLabelledBy = select.getAttribute('aria-labelledby');
  if (ariaLabelledBy) trigger.setAttribute('aria-labelledby', ariaLabelledBy);

  const valSpan = document.createElement('span');
  valSpan.className = 'g-select-value';
  const chevSpan = document.createElement('span');
  chevSpan.className = 'g-select-chev';
  chevSpan.setAttribute('aria-hidden', 'true');
  chevSpan.innerHTML = CHEV_SVG;
  trigger.append(valSpan, chevSpan);
  wrap.append(trigger);

  const sync = () => {
    const opt = select.options[select.selectedIndex] || select.options[0];
    const text = opt ? (opt.textContent.trim() || opt.label || '') : '';
    valSpan.textContent = text || 'Selecione…';
    const isPlaceholder = !opt || (opt.value === '' && /^selecione|^escolh|^—$|^-$|^$/i.test(text));
    if (isPlaceholder) valSpan.dataset.placeholder = '';
    else delete valSpan.dataset.placeholder;
    trigger.disabled = select.disabled;
    trigger.title = text;
  };
  select._gSync = sync;
  sync();

  new MutationObserver(sync).observe(select, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['disabled', 'selected', 'label', 'value']
  });

  select.addEventListener('change', sync);
  select.addEventListener('focus', () => { if (!select.disabled) trigger.focus(); });
  select.addEventListener('invalid', () => {
    wrap.classList.add('is-invalid');
    trigger.focus();
  });

  trigger.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    openSelectMenu(select, wrap, trigger, sync);
  });

  trigger.addEventListener('keydown', e => {
    if (activeSelectMenu?.select === select) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      openSelectMenu(select, wrap, trigger, sync);
    }
  });
}

function enhanceFloatingMenu(menu, itemSelector, deep = false) {
  menu.classList.add('g-floating-menu');
  glide(menu, itemSelector, false, deep);
}

document.addEventListener('reset', e => {
  if (!(e.target instanceof HTMLFormElement)) return;
  requestAnimationFrame(() => e.target.querySelectorAll('select[data-g-select]').forEach(s => s._gSync?.()));
}, true);

function enhance(root) {
  const fresh = (sel, fn) => root.querySelectorAll(sel).forEach(el => { if (el.dataset.g) return; el.dataset.g = '1'; fn(el); });
  fresh('.g-utabs', slidingUnderlineTabs);
  fresh('.thread-list .tabs, .ags-tabs, .wf-builder-meta .wf-tabs', slidingUnderlineBar);
  fresh('.tabs:not(.g-utabs-bar)', pillTabs);
  fresh('.shell', shellMotion);
  fresh('.g-side .side-nav', n => {
    const kind = n.closest('.ag-shell') ? 'agency' : 'app';
    spotlight(n, { key: `${kind}-nav`, group: `sidebar:${kind}`, activeSelector: '.nav-link.current, .nav-link[aria-current="page"]' });
  });
  fresh('.g-side .side-foot', n => {
    const kind = n.closest('.ag-shell') ? 'agency' : 'app';
    spotlight(n, { key: `${kind}-foot`, group: `sidebar:${kind}`, activeSelector: '.nav-link.current, .nav-link[aria-current="page"]' });
  });
  fresh('.inbox-nav', n => spotlight(n, { key: 'inbox-nav', activeSelector: '.inbox-box.selected, .inbox-box[aria-current="true"]' }));
  fresh('.contact-rail', n => spotlight(n, { key: 'inbox-contact-rail', activeSelector: '.icon-btn.selected, .icon-btn[aria-pressed="true"]', left: 2 }));
  fresh('.sc-history', n => spotlight(n, { key: 'graao-chat-history', activeSelector: '.sc-history-item.active' }));
  fresh('.ags-items', n => spotlight(n, { key: 'agents-list', activeSelector: '.ags-item[aria-current]' }));
  fresh('.site-step-list > ol', n => spotlight(n, { key: 'site-steps', activeSelector: '.site-step-item[aria-current="true"]', left: 0 }));
  fresh('.sx-pages ul', n => spotlight(n, { key: 'studio-pages', activeSelector: 'li.current, .sx-page[aria-current="true"]', left: 0 }));
  fresh('.report-pages > ol', n => spotlight(n, { key: 'report-pages', activeSelector: 'button[aria-pressed="true"]', left: 0 }));
  fresh('.conversations-nav nav', underline);
  // fresh('.choices', n => glide(n, '.choice', true));
  fresh('.card-grid', n => glide(n, '.surface', true));
  fresh('.metrics', n => { glide(n, '.surface', true); n.querySelectorAll(':scope > .metric').forEach((m, idx) => { const b = m.querySelector('b'); if (b) countUp(b, `metric:${location.hash}:${m.firstElementChild?.textContent.trim() || idx}`, 1800); }); });
  fresh('.pr-metrics', n => { n.querySelectorAll(':scope > .pr-panel').forEach((panel, idx) => { const b = panel.querySelector('b'); if (b) countUp(b, `prospect:${location.hash}:${panel.querySelector('p')?.textContent.trim() || idx}`, 1800); }); });
  fresh('.ag-chart', n => { n.querySelectorAll('.ag-col b').forEach((b, idx) => countUp(b, `ag-chart:${location.hash}:${idx}`, 1300)); });
  fresh('.dashboard-page .dash-card, .report-paper .dash-card', card => {
    const scope = card.closest('.dashboard-page')?.dataset.dashboardId || card.closest('.report-paper')?.getAttribute('aria-label') || location.hash || 'dash';
    enhanceDashboardCard(card, scope);
  });
  fresh('.studio-tiles', n => glide(n, '.studio-tile', true));
  fresh('.ags-menu-list', n => enhanceFloatingMenu(n, 'a, button', false));
  fresh('.inbox-menu', n => enhanceFloatingMenu(n, 'button:not(:disabled)', false));
  fresh('.sc-menu', n => enhanceFloatingMenu(n, '.sc-menu-item', true));
  root.querySelectorAll('select').forEach(enhanceSelect);
  root.querySelectorAll(ICON_SWAP_BTN_SELECTOR).forEach(enhanceIconSwapButton);
}

/* ───────── Cursor Edge Glow Button (microkit.co) ───────── */
const ICON_SWAP_BTN_SELECTOR = [
  '.primary:not(.plain)', '.secondary:not(.plain)', '.danger:not(.plain)', '.continue', '.studio-create',
  '.dash-save', '.pr-btn.pr-primary', '.ags-send', '.ags-new',
  '.ag-brand-mockup-side-cta', '.ag-brand-mockup-primary', '.ag-brand-demo-primary', '.ag-brand-demo-secondary',
  '.bui-btn:not(.bui-icon-btn)'
].join(', ');
const ICON_SWAP_EXCLUDED = '.icon-btn, .side-toggle, .theme-toggle, .tool-btn, .top-menu, .lang-btn, .dash-tool.dash-square, .bui-icon-btn, .bui-prompt-btn, .bui-chat-send, .bui-search-clear, .bui-selection-toggle, .bui-selection-retry, .bui-sidebar-collapse, .bui-sidebar-expand, .bui-sidebar-search-btn, .bui-sidebar-search-close';

function enhanceIconSwapButton(btn) {
  if (!(btn instanceof HTMLElement) || btn.matches(ICON_SWAP_EXCLUDED) || btn.classList.contains('graao-icon-swap')) return;
  if (btn.dataset.graaoIconSwap === '1') return;
  const original = [...btn.childNodes];
  if (!original.some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()) && !btn.querySelector('svg, .sr-only')) return;

  const iconWrap = document.createElement('span');
  iconWrap.className = 'graao-icon-swap-icon';
  const existingIcon = original.find(n => n.nodeType === Node.ELEMENT_NODE && n.nodeName.toLowerCase() === 'svg');
  if (existingIcon) iconWrap.append(existingIcon);
  else iconWrap.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>';

  const label = document.createElement('span');
  label.className = 'graao-icon-swap-label';
  original.filter(n => n !== existingIcon).forEach(n => label.append(n));
  const content = document.createElement('span');
  content.className = 'graao-icon-swap-content';
  content.append(iconWrap, label);
  const arrow = document.createElement('span');
  arrow.className = 'graao-icon-swap-arrow';
  arrow.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>';
  btn.classList.add('graao-icon-swap');
  btn.dataset.graaoIconSwap = '1';
  btn.replaceChildren(content, arrow);
}

/* Staggered entrance when the route changes (not on every data re-render) */
let entering = true;
const section = () => location.hash.slice(1).split('/')[0];
const routeKey = () => location.hash.slice(1).split('/').slice(0, 2).join('/');
let shownSection = section();
let shownRoute = routeKey();
// Switching tabs inside a screen keeps the page in place; only a new screen plays the entrance.
addEventListener('hashchange', () => {
  closeSelectMenu(false);
  const nextSection = section();
  const nextRoute = routeKey();
  const pageChanged = nextSection !== shownSection || (nextSection === 'agency' && nextRoute !== shownRoute);
  if (nextRoute !== shownRoute) { shownRoute = nextRoute; resetCountUps(); }
  if (nextSection !== shownSection) { shownSection = nextSection; entering = true; }
  if (pageChanged) { utabLast.clear(); utabActive.clear(); }
});

let queued = false;
const run = () => {
  queued = false;
  if (tipFor && !tipFor.isConnected) hideTip();
  if (activeSelectMenu && !activeSelectMenu.trigger.isConnected) closeSelectMenu(false);
  document.documentElement.classList.add('g-ready');
  enhance(document);
  if (entering) {
    const page = document.querySelector('#screen > .page, #screen > .dashboard-page, #screen .studio-main, #screen > .conversations-shell, .ag-shell .screen > .page, #app .workspace .page');
    if (page) {
      entering = false;
      if (!reduce) { page.classList.add('g-enter'); setTimeout(() => page.classList.remove('g-enter'), 1100); }
    }
  }
};
new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(run); } })
  .observe(document.body, { childList: true, subtree: true });
run();

/* Cursor-tracked light inside circular studio-create button */
document.addEventListener('pointermove', e => {
  const btn = e.target instanceof Element && e.target.closest('.studio-create');
  if (!btn) return;
  const r = btn.getBoundingClientRect();
  btn.style.setProperty('--gx', `${e.clientX - r.left}px`);
  btn.style.setProperty('--gy', `${e.clientY - r.top}px`);
}, { passive: true });

// Indicators measured before web fonts finished loading are re-measured once they land.
document.fonts?.ready.then(() => document.querySelectorAll('[data-g]').forEach(el => {
  el._gSpotCleanup?.();
  el._gUtabsCleanup?.();
  el.querySelectorAll(':scope > .g-indicator, :scope > .g-spot, :scope > .g-underline, :scope > .g-glide, .g-utabs-indicator').forEach(n => n.remove());
  delete el.dataset.g;
})).then(() => { last.clear(); spotLast.clear(); utabLast.clear(); run(); });

/* Theme toggle: microkit diagonal wipe via View Transitions API */
let themeBusy = null;
let themeStorageKey;
// O graao abre no escuro (paleta oficial #0F0F0F/#202020 + verde); o claro é escolha de quem usa.
let themeFallback = 'dark';

function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === 'dark') html.setAttribute('data-theme', 'dark');
  else html.removeAttribute('data-theme');
  window.dispatchEvent(new CustomEvent('graao:theme-change'));
}

// Paleta oficial do graao: verde #5DD62C principal, verde-escuro #337418 secundário (mesmos padrões de agency-model.mjs).
// Pares que já foram o padrão (rosa/lilás, laranja/amarelo, roxo) contam como padrão até a agência escolher outro.
const DEFAULT_BRAND_PRIMARY = '#5dd62c';
const DEFAULT_BRAND_SECONDARY = '#337418';
const DEFAULT_BRAND_ACCENT = '#5dd62c';
const LEGACY_DEFAULT_PAIRS = new Set([
  '#ff4f9a|#c4a7ff',
  '#ff00bb|#fc972d',
  '#ff701a|#ffd52a',
  '#d62976|#962fbf'
]);

function relativeLuminance(hex) {
  const [red, green, blue] = hex.slice(1).match(/../g).map(part => {
    const channel = Number.parseInt(part, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function applyBrandColor(primaryValue, secondaryValue, accentValue) {
  const root = document.documentElement;
  const primary = /^#[0-9a-f]{6}$/i.test(primaryValue) ? primaryValue.toLowerCase() : DEFAULT_BRAND_PRIMARY;
  const secondary = /^#[0-9a-f]{6}$/i.test(secondaryValue) ? secondaryValue.toLowerCase() : DEFAULT_BRAND_SECONDARY;
  const accent = /^#[0-9a-f]{6}$/i.test(accentValue) ? accentValue.toLowerCase() : DEFAULT_BRAND_ACCENT;
  root.style.setProperty('--g-brand-accent', accent);
  const custom = (primary !== DEFAULT_BRAND_PRIMARY || secondary !== DEFAULT_BRAND_SECONDARY)
    && !LEGACY_DEFAULT_PAIRS.has(`${primary}|${secondary}`);
  root.toggleAttribute('data-custom-brand', custom);
  if (!custom) {
    for (const prop of [
      '--g-custom-brand', '--g-custom-brand-2', '--g-custom-brand-accent',
      '--g-brand-on', '--g-brand-depth',
      '--g-brand-2-on', '--g-brand-2-depth',
      '--g-grad-on'
    ]) root.style.removeProperty(prop);
    window.dispatchEvent(new CustomEvent('graao:theme-change'));
    return;
  }

  const lum1 = relativeLuminance(primary);
  const lum2 = relativeLuminance(secondary);
  // texto escuro quando ele contrasta mais que o branco (empate em luminância 0,18)
  const light1 = lum1 > 0.18;
  const light2 = lum2 > 0.18;
  const gradLight = light1;

  root.style.setProperty('--g-custom-brand', primary);
  root.style.setProperty('--g-custom-brand-2', secondary);
  root.style.setProperty('--g-custom-brand-accent', accent);
  root.style.setProperty('--g-brand-on', light1 ? '#0f131a' : '#fff');
  root.style.setProperty('--g-brand-depth', lum1 > 0.08 ? '#000' : '#fff');
  root.style.setProperty('--g-brand-2-on', light2 ? '#0f131a' : '#fff');
  root.style.setProperty('--g-brand-2-depth', lum2 > 0.08 ? '#000' : '#fff');
  root.style.setProperty('--g-grad-on', gradLight ? '#0f131a' : '#fff');
  window.dispatchEvent(new CustomEvent('graao:theme-change'));
}

export function setThemeAccount(accountId) {
  const key = accountId ? `graao.theme:${accountId}` : 'graao.theme';
  if (themeStorageKey === key) return;
  themeStorageKey = key;
  let savedTheme;
  try {
    savedTheme = localStorage.getItem(key);
    if (!accountId && !savedTheme) savedTheme = localStorage.getItem('graao.theme');
  } catch {}
  applyTheme(savedTheme || themeFallback);
}

/** The mode for who never chose one (the mobile app uses its theme's own). */
export function setThemeFallback(theme) {
  themeFallback = theme === 'dark' ? 'dark' : 'light';
  let savedTheme;
  try { savedTheme = localStorage.getItem(themeStorageKey || 'graao.theme'); } catch {}
  if (!savedTheme) applyTheme(themeFallback);
}

export function toggleTheme(to) {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = to === 'light' || to === 'dark' ? to : current === 'dark' ? 'light' : 'dark';
  if (current === next) return Promise.resolve();

  const key = themeStorageKey;
  const swap = () => {
    if (themeStorageKey !== key) return;
    applyTheme(next);
    if (key) {
      // a última escolha também vale para o script do app.html, que pinta o tema antes do JS saber a conta
      try { localStorage.setItem(key, next); localStorage.setItem('graao.theme', next); } catch {}
    }
  };

  if (themeBusy) {
    try { themeBusy.skipTransition(); } catch {}
  }

  if (reduce || !document.startViewTransition || document.visibilityState !== 'visible') {
    swap();
    return Promise.resolve();
  }

  html.setAttribute('data-theme-to', next);
  html.setAttribute('data-g-theme-to', next);
  const transition = (themeBusy = document.startViewTransition(swap));
  const done = () => {
    if (themeBusy === transition) {
      themeBusy = null;
      html.removeAttribute('data-theme-to');
      html.removeAttribute('data-g-theme-to');
    }
  };
  transition.finished.then(done, done);
  return transition.updateCallbackDone;
}
window.toggleTheme = toggleTheme;

document.addEventListener('click', e => {
  const btn = e.target instanceof Element && e.target.closest('[data-theme-toggle]');
  if (!btn) return;
  toggleTheme().then(() => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const nextIcon = btn.querySelector(dark ? '.tt-moon .la-icon' : '.tt-sun .la-icon');
    if (nextIcon) playLucideIcon(nextIcon, true);
  });
});

/* ───────── Lucide-Animated delegated motion trigger ─────────
   Plays each icon's signature choreography to completion on hover or keyboard focus,
   matching https://lucide-animated.com even when the pointer sweeps quickly across items. */
const LA_HOST = 'a,button,summary,[role="button"],[role="tab"],[role="menuitem"],[role="option"],.nav-link,.tool-btn,.icon-btn,.studio-tile,.metric';
const laTimers = new WeakMap();

function playLucideIcon(svg, restart = false) {
  if (reduce || !svg || !svg.isConnected) return;
  if (svg.classList.contains('la-active')) {
    if (!restart) return;
    svg.classList.remove('la-active');
    void svg.getBoundingClientRect();
  }
  svg.classList.add('la-active');
  clearTimeout(laTimers.get(svg));
  laTimers.set(svg, setTimeout(() => {
    svg.classList.remove('la-active');
    laTimers.delete(svg);
  }, 880));
}

function resolveLaHost(target) {
  if (!(target instanceof Element)) return null;
  return target.closest(LA_HOST) || target.closest('.la-icon');
}

function triggerHostIcons(host) {
  if (!host) return;
  if (host.classList.contains('la-icon')) {
    playLucideIcon(host);
    return;
  }
  host.querySelectorAll('.la-icon').forEach(svg => {
    if (svg.parentElement?.closest(LA_HOST) === host) {
      playLucideIcon(svg);
    }
  });
}

let lastLaHost = null;
document.addEventListener('pointerover', e => {
  if (reduce) return;
  const el = resolveLaHost(e.target);
  if (el === lastLaHost) return;
  lastLaHost = el;
  if (el && !(el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true')) {
    triggerHostIcons(el);
  }
}, { passive: true });
document.addEventListener('pointerout', e => {
  if (lastLaHost && (!e.relatedTarget || !(e.relatedTarget instanceof Node) || !lastLaHost.contains(e.relatedTarget))) {
    lastLaHost = null;
  }
}, { passive: true });
document.addEventListener('focusin', e => {
  if (reduce) return;
  const el = resolveLaHost(e.target);
  if (el && el.matches(':focus-visible')) triggerHostIcons(el);
});
