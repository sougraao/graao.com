// Beautiful UI (https://www.beautifului.dev, MIT, Shane Levine): segunda parte do port para DOM puro.
// Fonte original em vendor/beautifului/src/components/primitives. Estilos em beautiful-ui.css.
import { buiNode as node, buiSvg as svg, buiChevron as chevronDown, button, contextCards, glideMenu, shimmer, streamText, taskRows, thinkingState, toolChips } from './beautiful-ui.js';

const CHECK = '<path d="M20 6L9 17l-5-5"/>';
const CLOSE = '<path d="M18 6L6 18M6 6l12 12"/>';
const SEARCH = '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>';
const COPY = '<rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>';
const fold = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/* ── Search: busca de comandos com filtro ao vivo ────────── */

export function searchList({ items = [], placeholder = 'Buscar…', label = 'Buscar', empty = ['Nada encontrado', 'Ajuste a busca e tente de novo'], limit = 5, onSelect } = {}) {
  const el = node('div', 'bui-card bui-search');
  const row = node('label', 'bui-search-field');
  const input = node('input');
  input.type = 'search';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', label);
  const clear = node('button', 'bui-search-clear');
  clear.type = 'button';
  clear.setAttribute('aria-label', 'Limpar busca');
  clear.append(svg(CLOSE, { size: 11, width: 2.2 }));
  row.append(svg(SEARCH, { size: 14 }), input, clear);
  const body = node('div', 'bui-search-body');
  el.append(row, body);

  function paint() {
    const q = fold(input.value.trim());
    const results = q ? items.filter(item => fold(`${item.label ?? item} ${item.keywords || ''}`).includes(q)).slice(0, 12) : items.filter(item => !item.searchOnly).slice(0, limit);
    clear.hidden = !input.value;
    if (q.length > 2 && !results.length) {
      const box = node('div', 'bui-search-empty');
      const ico = node('span', 'bui-search-empty-icon');
      ico.append(svg(SEARCH, { size: 15, width: 1.8 }));
      box.append(ico, node('b', null, empty[0]), node('span', null, empty[1]));
      body.replaceChildren(box);
      return;
    }
    const list = node('div', 'bui-search-list');
    for (const item of results) {
      const text = item.label ?? item;
      const b = node('button', 'bui-search-item', text);
      b.type = 'button';
      b.dataset.menuRow = '';
      b.addEventListener('click', () => { input.value = text; paint(); onSelect?.(item); });
      list.append(b);
    }
    body.replaceChildren(glideMenu(list));
  }
  input.addEventListener('input', paint);
  clear.addEventListener('click', () => { input.value = ''; paint(); input.focus(); });
  paint();
  return { el, input, setItems(next) { items = next; paint(); }, destroy() {} };
}

/* ── FilterTable: chips de status que filtram a tabela ──── */

/**
 * columns: [{ key, label, width?: '1.3fr' }]
 * statuses: [{ key, label, color }] — a coluna `statusKey` vira um selo colorido
 * rows: [{ ...valores por coluna }]
 */
export function filterTable({ columns = [], rows = [], statuses = [], statusKey = 'status', allLabel = 'Todos', label = 'Tabela' } = {}) {
  const el = node('div', 'bui-filter');
  const chips = node('div', 'bui-filter-chips');
  const region = node('div', 'bui-card bui-filter-table');
  region.setAttribute('role', 'region');
  region.setAttribute('aria-label', label);
  region.tabIndex = 0;
  const inner = node('div', 'bui-filter-inner');
  const template = columns.map(c => `minmax(0, ${c.width || '1fr'})`).join(' ');
  inner.style.setProperty('--bui-cols', template);
  inner.style.minWidth = `${Math.max(320, columns.length * 110)}px`;
  region.append(inner);
  el.append(chips, region);
  const byKey = Object.fromEntries(statuses.map(s => [s.key, s]));
  let filter = 'all';

  function pill(value) {
    const s = byKey[value];
    const p = node('span', 'bui-status', s?.label ?? value);
    if (s?.color) p.style.setProperty('--tag-base', s.color);
    return p;
  }
  function paint() {
    const counts = { all: rows.length };
    for (const r of rows) counts[r[statusKey]] = (counts[r[statusKey]] || 0) + 1;
    chips.replaceChildren(...[{ key: 'all', label: allLabel }, ...statuses].map(f => {
      const b = node('button', 'bui-filter-chip');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(filter === f.key));
      if (f.color) {
        const dot = node('span', 'bui-filter-dot');
        dot.style.background = f.color;
        b.append(dot);
      }
      b.append(document.createTextNode(f.label), node('span', 'bui-filter-count', String(counts[f.key] || 0)));
      b.addEventListener('click', () => { filter = f.key; paint(); });
      return b;
    }));
    const head = node('div', 'bui-filter-row is-head');
    for (const c of columns) head.append(node('span', null, c.label));
    inner.replaceChildren(head, ...rows.map(r => {
      const wrap = node('div', 'bui-filter-wrap');
      wrap.classList.toggle('is-hidden', filter !== 'all' && r[statusKey] !== filter);
      const clip = node('div', 'bui-filter-clip');
      const line = node('div', 'bui-filter-row');
      columns.forEach((c, i) => {
        const cell = node('span', i === 0 ? 'is-strong' : '');
        if (c.render) cell.append(c.render(r));
        else if (c.key === statusKey) cell.append(pill(r[c.key]));
        else cell.append(node('span', null, r[c.key] ?? ''));
        line.append(cell);
      });
      clip.append(line);
      wrap.append(clip);
      return wrap;
    }));
  }
  paint();
  return { el, setRows(next) { rows = next; paint(); }, destroy() {} };
}

/* ── CodeBlock: listagem numerada ou diff unificado ──────── */

const KEYWORDS = new Set(['import', 'from', 'export', 'default', 'async', 'function', 'const', 'let', 'var', 'await', 'return', 'if', 'else', 'for', 'while', 'new', 'throw', 'try', 'catch', 'null', 'true', 'false', 'undefined']);
const TOKEN = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|\b\d+(?:\.\d+)?\b|\b(?:import|from|export|default|async|function|const|let|var|await|return|if|else|for|while|new|throw|try|catch|null|true|false|undefined)\b|[A-Za-z_$][\w$]*(?=\s*\())/g;

export function highlightInto(target, text) {
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const t = m[0];
    if (m.index > last) target.append(document.createTextNode(text.slice(last, m.index)));
    const kind = /^["'`\d]/.test(t) ? 'is-literal' : KEYWORDS.has(t) ? 'is-keyword' : 'is-call';
    target.append(node('span', kind, t));
    last = m.index + t.length;
  }
  if (last < text.length) target.append(document.createTextNode(text.slice(last)));
  return target;
}

/**
 * lines: string[] (vista Código) ou diff: [{ old, cur, type: 'ctx'|'add'|'del', pieces: [{ text, change? }] }]
 */
export function codeBlock({ filename = 'arquivo', lines = [], diff = null, code, labels = {}, onCopy } = {}) {
  const t = { copy: 'Copiar', copied: 'Copiado', ...labels };
  const el = node('div', 'bui-card bui-code');
  const head = node('div', 'bui-code-head');
  const file = node('span', 'bui-code-file');
  file.append(svg('<path d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"/>', { size: 15, width: 1.8 }), node('span', null, filename));
  head.append(file);
  if (diff) {
    const stat = node('span', 'bui-code-stat');
    stat.append(node('span', 'is-add', `+${diff.filter(r => r.type === 'add').length}`), node('span', 'is-del', `-${diff.filter(r => r.type === 'del').length}`));
    head.append(stat);
  } else {
    const copy = node('button', 'bui-code-copy');
    copy.type = 'button';
    copy.setAttribute('aria-label', 'Copiar código');
    const paintCopy = done => {
      copy.classList.toggle('is-done', done);
      copy.replaceChildren(svg(done ? CHECK : COPY, { size: 11, width: done ? 3 : 2 }), document.createTextNode(done ? t.copied : t.copy));
    };
    paintCopy(false);
    copy.addEventListener('click', async () => {
      const raw = code ?? lines.join('\n');
      try { await navigator.clipboard.writeText(raw); } catch { return; }
      paintCopy(true);
      onCopy?.(raw);
      setTimeout(() => paintCopy(false), 1500);
    });
    head.append(copy);
  }
  const body = node('div', 'bui-code-body');
  const list = node('div', 'bui-code-lines');
  if (diff) {
    for (const r of diff) {
      const row = node('div', `bui-code-line is-${r.type}`);
      row.append(node('span', 'bui-code-num', String((r.type === 'del' ? r.old : r.cur) ?? '')));
      const c = node('code');
      for (const p of r.pieces) highlightInto(p.change ? c.appendChild(node('mark', `is-${p.change}`)) : c, p.text);
      row.append(c);
      list.append(row);
    }
  } else {
    lines.forEach((line, i) => {
      const row = node('div', 'bui-code-line');
      row.append(node('span', 'bui-code-num', String(i + 1)), highlightInto(node('code'), line));
      list.append(row);
    });
  }
  body.append(list);
  el.append(head, body);
  return { el, destroy() {} };
}

/* ── DiffTable: edição proposta, linha a linha ───────────── */

/**
 * columns: [{ key, label, width? }]
 * rows: [{ key, values: {...}, change?: 'remove' | 'add' }]
 */
export function diffTable({ title = 'Alterações propostas', columns = [], rows = [], hint = 'Clique nas linhas alteradas para incluir ou tirar', applyButton = true, onApply, onChange } = {}) {
  const el = node('div', 'bui-card bui-diff');
  const bar = node('div', 'bui-diff-bar');
  const hintEl = node('small', null, hint);
  bar.append(node('span', null, title), hintEl);
  const table = node('div', 'bui-diff-table');
  table.style.setProperty('--bui-cols', columns.map(c => `minmax(0, ${c.width || '1fr'})`).join(' '));
  const foot = node('div', 'bui-card-footer bui-diff-foot');
  el.append(bar, table, foot);
  const include = Object.fromEntries(rows.filter(r => r.change).map(r => [r.key, true]));
  let applied = false;

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  function paint() {
    const head = node('div', 'bui-diff-row is-head');
    for (const c of columns) head.append(node('span', null, c.label));
    table.replaceChildren(head, ...rows.map(r => {
      const on = r.change ? include[r.key] : false;
      const row = node('div', `bui-diff-row${r.change ? ` is-${r.change}` : ''}${on ? ' is-on' : ''}`);
      columns.forEach((c, i) => {
        const cell = node('span', null, r.values[c.key] ?? '');
        if (r.change && i === columns.length - 1) {
          const mark = node('span', `bui-diff-mark${on ? ' is-on' : ''}`);
          if (on) mark.append(svg(CHECK, { size: 11, width: 3 }));
          cell.append(mark);
        }
        row.append(cell);
      });
      if (r.change && !applied) {
        row.tabIndex = 0;
        row.setAttribute('role', 'checkbox');
        row.setAttribute('aria-checked', String(on));
        const toggle = () => { include[r.key] = !include[r.key]; paint(); onChange?.(rows.filter(x => x.change && include[x.key])); };
        row.addEventListener('click', toggle);
        row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      }
      return row;
    }));
    const removals = rows.filter(r => r.change === 'remove' && include[r.key]).length;
    const additions = rows.filter(r => r.change === 'add' && include[r.key]).length;
    const total = removals + additions;
    hintEl.hidden = applied;
    if (applied) {
      const ok = node('span', 'bui-approval-sent-pill');
      const badge = node('span', 'bui-approval-ok');
      badge.append(svg(CHECK, { size: 11, width: 3 }));
      ok.append(badge, document.createTextNode(`${plural(total, 'alteração aplicada', 'alterações aplicadas')}`));
      foot.replaceChildren(ok);
      return;
    }
    const summary = node('small', null, `${plural(removals, 'remoção', 'remoções')} · ${plural(additions, 'inclusão', 'inclusões')}`);
    if (!applyButton) { foot.replaceChildren(summary); return; }
    const apply = button(`Aplicar ${plural(total, 'alteração', 'alterações')}`, { variant: 'accent' });
    apply.disabled = total === 0;
    apply.addEventListener('click', () => {
      applied = true;
      paint();
      onApply?.(rows.filter(r => r.change && include[r.key]));
    });
    foot.replaceChildren(summary, apply);
  }
  paint();
  return { el, destroy() {} };
}

/* ── StreamingText: palavras com fontes, ações e sugestões ─ */

/**
 * text: string com marcadores [n] para citar sources[n-1]
 * sources: [{ name, domain, href, image? }]
 */
export function streamingText({ text = '', sources = [], followUps = [], labels = {}, wordMs = 55, actions: shown = ['copy', 'retry', 'up', 'down'], onFollowUp, onAction, onDone } = {}) {
  const t = { sources: `${sources.length} ${sources.length === 1 ? 'fonte' : 'fontes'}`, followUps: 'Continue com', ...labels };
  const el = node('div', 'bui-streaming');
  const p = node('p', 'bui-streaming-text');
  const caret = node('span', 'bui-streaming-caret');
  const actions = node('div', 'bui-streaming-actions');
  const drawer = node('div', 'bui-streaming-drawer');
  const dclip = node('div', 'bui-streaming-clip');
  const dlist = node('div', 'bui-streaming-sources');
  dclip.append(dlist);
  drawer.append(dclip);
  const follow = node('div', 'bui-streaming-follow');
  el.append(p, actions, drawer, follow);

  const avatar = (src, cls) => {
    if (src.image) {
      const img = node('img', cls);
      img.src = src.image;
      img.alt = '';
      return img;
    }
    return node('span', `${cls} is-letter`, (src.name || src.domain || '?').charAt(0).toUpperCase());
  };
  const chip = src => {
    const a = node('a', 'bui-source-chip');
    a.href = src.href;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.append(avatar(src, 'bui-source-avatar'), node('span', null, src.domain));
    return a;
  };

  const tokens = text.split(/(\[\d+\])/).flatMap(part => {
    const m = part.match(/^\[(\d+)\]$/);
    if (m) return sources[m[1] - 1] ? [{ cite: sources[m[1] - 1] }] : [];
    return part.split(/(\s+)/).filter(Boolean).map(w => ({ text: w }));
  });

  const ACTIONS = [
    ['copy', 'Copiar', COPY],
    ['retry', 'Tentar de novo', '<path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/>'],
    ['up', 'Resposta boa', '<path d="M7 10v12M15 5.88L14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88z"/>'],
    ['down', 'Resposta ruim', '<path d="M17 14V2M9 18.12L10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88z"/>']
  ];
  for (const [key, label, path] of ACTIONS.filter(([key]) => shown.includes(key))) {
    const b = node('button', 'bui-icon-btn is-sm');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.append(svg(path, { size: 15, width: 1.8 }));
    b.addEventListener('click', () => {
      if (key === 'copy') navigator.clipboard?.writeText(p.textContent.trim()).catch(() => {});
      onAction?.(key);
    });
    actions.append(b);
  }
  if (sources.length) {
    const toggle = node('button', 'bui-streaming-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    const stack = node('span', 'bui-avatar-stack');
    for (const s of sources.slice(0, 4)) stack.append(avatar(s, 'bui-source-avatar is-round'));
    toggle.append(stack, node('span', null, t.sources));
    toggle.addEventListener('click', () => {
      const open = el.classList.toggle('is-sources');
      toggle.setAttribute('aria-expanded', String(open));
    });
    actions.append(toggle);
    for (const s of sources) {
      const a = node('a', 'bui-streaming-source');
      a.href = s.href;
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.append(avatar(s, 'bui-source-avatar is-md'), node('span', null, s.name), node('small', null, s.domain));
      dlist.append(a);
    }
  }
  if (followUps.length) {
    follow.append(node('p', null, t.followUps));
    followUps.forEach((q, i) => {
      const b = node('button', 'bui-streaming-follow-btn');
      b.type = 'button';
      b.style.animationDelay = `${i * 90}ms`;
      b.append(svg('<path d="M9 10l-5 5 5 5"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/>', { size: 11 }), document.createTextNode(q));
      b.addEventListener('click', () => onFollowUp?.(q, i));
      follow.append(b);
    });
  }

  let i = 0;
  p.append(caret);
  const timer = setInterval(() => {
    // Com a aba em segundo plano o navegador atrasa os timers: mostra o resto de uma vez.
    do {
      const tok = tokens[i++];
      if (tok) caret.before(tok.cite ? chip(tok.cite) : document.createTextNode(tok.text));
    } while (document.hidden && i < tokens.length);
    if (i >= tokens.length) {
      clearInterval(timer);
      caret.remove();
      el.classList.add('is-done');
      onDone?.();
    }
  }, wordMs);
  return { el, destroy() { clearInterval(timer); } };
}

/* ── ChatComposer: painel de chat com abas e compositor ─── */

/**
 * onSend(text, reply) — `reply({ label, sub, time, body })` adiciona uma resposta ao fio.
 */
export function chatComposer({ tabs = [], placeholder = 'Escreva ou marque com @', onSend, onTab, actions = [] } = {}) {
  const el = node('div', 'bui-card bui-chat');
  const head = node('div', 'bui-chat-head');
  const tabRow = node('div', 'bui-chat-tabs');
  const tools = node('div', 'bui-chat-tools');
  head.append(tabRow, tools);
  const thread = node('div', 'bui-chat-thread');
  const composer = node('div', 'bui-chat-composer');
  const field = node('div', 'bui-chat-field');
  const input = node('input');
  input.placeholder = placeholder;
  input.setAttribute('aria-label', 'Mensagem');
  const send = node('button', 'bui-chat-send');
  send.type = 'button';
  send.setAttribute('aria-label', 'Enviar');
  send.append(svg('<path d="M12 19V5M5 12l7-7 7 7"/>', { size: 16, width: 2.4 }));
  const sendRow = node('div', 'bui-chat-send-row');
  sendRow.append(send);
  field.append(input, sendRow);
  composer.append(field);
  el.append(head, thread, composer);

  let tab = tabs[0];
  const paintTabs = () => tabRow.replaceChildren(...tabs.map(name => {
    const b = node('button', 'bui-chat-tab', name);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(name === tab));
    b.addEventListener('click', () => { tab = name; paintTabs(); onTab?.(name); });
    return b;
  }));
  paintTabs();
  for (const { label, path, onClick } of actions) {
    const b = node('button', 'bui-icon-btn is-sm');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.append(svg(path, { size: 15 }));
    if (onClick) b.addEventListener('click', onClick);
    tools.append(b);
  }
  field.addEventListener('click', () => input.focus());
  const paintSend = () => { send.disabled = !input.value.trim(); };
  input.addEventListener('input', paintSend);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  send.addEventListener('click', submit);
  paintSend();

  let last = null;
  function reply({ label = '', sub = '', time = '', body = '' }) {
    last?.classList.remove('is-resolving');
    const sec = node('div', 'bui-chat-reply is-resolving');
    const meta = node('div', 'bui-chat-meta');
    meta.append(node('b', null, label), node('span', null, sub));
    if (time) meta.append(node('span', 'is-ink', `por ${time}`));
    sec.append(meta, node('p', null, body));
    thread.append(sec);
    last = sec;
    setTimeout(() => sec.classList.remove('is-resolving'), 1200);
    thread.scrollTop = thread.scrollHeight;
    return sec;
  }
  function submit() {
    const text = input.value.trim();
    if (!text) return;
    const wrap = node('div', 'bui-chat-user');
    wrap.append(node('div', 'bui-chat-bubble', text));
    thread.append(wrap);
    thread.scrollTop = thread.scrollHeight;
    input.value = '';
    paintSend();
    onSend?.(text, reply);
  }
  return { el, input, reply, destroy() {} };
}

/* ── PromptBar: compositor com @ fontes, / comandos, modelo e ditado ─ */

const PB_GLYPHS = {
  clip: '<path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
};
const MIC = '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>';
const SpeechRec = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

function parseToken(draft) {
  const m = /(^|\s)([@/])([\p{L}\w-]*)$/u.exec(draft);
  return m ? { kind: m[2] === '@' ? 'at' : 'slash', query: fold(m[3]), start: m.index + m[1].length } : null;
}

/**
 * sources: [{ key, name, desc, glyph?, attach? }]  — menu do @ (e do +)
 * commands: [{ key, name: '/cmd', desc }]         — menu do /
 * models: [{ key, name, tag, celebrate? }]        — seletor de modelo
 * onSend({ text, attachments, model }) · onAttach(): Promise<string[]> (nomes de arquivos)
 */
export function promptBar({ sources = [], commands = [], models = [], model, pill = false, tall = false, placeholder = 'Escreva uma mensagem…', onSend, onAttach, onModel } = {}) {
  const el = node('div', 'bui-prompt');
  const anchor = node('div', 'bui-prompt-anchor');
  const menuEl = node('div', 'bui-prompt-menu');
  menuEl.hidden = true;
  const modelMenu = node('div', 'bui-prompt-menu is-model');
  modelMenu.hidden = true;
  const box = node('div', `bui-prompt-box${pill ? ' is-pill' : ''}${tall ? ' is-tall' : ''}`);
  const sweep = node('span', 'bui-prompt-sweep');
  sweep.setAttribute('aria-hidden', 'true');
  const files = node('div', 'bui-prompt-files');
  const controls = node('div', 'bui-prompt-controls');
  const plus = node('button', 'bui-prompt-btn is-plus');
  plus.type = 'button';
  plus.setAttribute('aria-label', 'Anexos e fontes');
  plus.append(svg('<path d="M12 5v14M5 12h14"/>', { size: 16 }));
  const input = node('textarea', 'bui-prompt-input');
  input.rows = 1;
  input.placeholder = placeholder;
  input.setAttribute('aria-label', 'Mensagem');
  const modelBtn = node('button', 'bui-prompt-model');
  modelBtn.type = 'button';
  modelBtn.setAttribute('aria-label', 'Escolher modelo');
  const mic = node('button', 'bui-prompt-btn is-mic');
  mic.type = 'button';
  mic.setAttribute('aria-label', 'Ditar');
  mic.append(svg(MIC, { size: 15 }));
  const send = node('button', 'bui-prompt-btn is-send');
  send.type = 'button';
  send.setAttribute('aria-label', 'Enviar');
  send.append(svg('<path d="M12 19V5M5 12l7-7 7 7"/>', { size: 16, width: 2.4 }));
  controls.append(...(sources.length ? [plus] : []), input);
  if (models.length) controls.append(modelBtn);
  if (SpeechRec) controls.append(mic);
  controls.append(send);
  box.append(sweep, files, controls);
  anchor.append(menuEl, modelMenu, box);
  el.append(anchor);

  let current = models.find(m => m.key === model) || models[0];
  let attachments = [];
  let active = 0;
  let plusOpen = false;
  let dismissed = false;
  let rec = null;

  const token = () => (dismissed ? null : parseToken(input.value));
  function rows() {
    const t = token();
    const kind = plusOpen ? 'at' : t?.kind;
    const q = plusOpen ? '' : t?.query ?? '';
    if (kind === 'at') return { kind, q, list: sources.filter(s => fold(s.name).includes(q)) };
    if (kind === 'slash') return { kind, q, list: commands.filter(c => fold(c.name.slice(1)).startsWith(q)) };
    return { kind: null, q, list: [] };
  }
  function paintMenu() {
    const { kind, q, list } = rows();
    menuEl.hidden = !kind;
    if (!kind) return;
    if (active >= list.length) active = 0;
    const items = list.map((r, i) => {
      const b = node('button', `bui-prompt-row${i === active ? ' is-active' : ''}`);
      b.type = 'button';
      b.dataset.menuRow = '';
      b.addEventListener('mousedown', e => e.preventDefault());
      b.addEventListener('mouseenter', () => { active = i; mark(); });
      b.addEventListener('click', () => pick(r, kind));
      if (kind === 'at') {
        const ico = node('span', 'bui-prompt-row-icon');
        ico.append(svg(PB_GLYPHS[r.glyph] || PB_GLYPHS[r.attach ? 'clip' : 'layers'], { size: 15, width: 1.8 }));
        b.append(ico);
      }
      b.append(node('b', null, r.name), node('span', null, r.desc || ''));
      return b;
    });
    const listEl = node('div', 'bui-prompt-rows');
    listEl.append(...(items.length ? items : [node('div', 'bui-prompt-empty', `Nada para “${q}”`)]));
    menuEl.replaceChildren(listEl, node('div', 'bui-prompt-hint', kind === 'at' ? 'Digite para buscar fontes e arquivos' : 'Digite para buscar comandos'));
  }
  const mark = () => menuEl.querySelectorAll('.bui-prompt-row').forEach((b, i) => b.classList.toggle('is-active', i === active));

  function paintModel() {
    if (!current) return;
    modelBtn.replaceChildren(document.createTextNode(current.name), chevronDown({ size: 11, width: 2.4 }));
    modelMenu.replaceChildren(...models.map(m => {
      const b = node('button', 'bui-prompt-row is-model');
      b.type = 'button';
      b.dataset.menuRow = '';
      b.addEventListener('mousedown', e => e.preventDefault());
      b.append(node('b', null, m.name), node('span', null, m.tag || ''));
      const check = svg(CHECK, { size: 13, width: 2.5 });
      check.style.visibility = m.key === current.key ? 'visible' : 'hidden';
      b.append(check);
      b.addEventListener('click', () => {
        current = m;
        modelMenu.hidden = true;
        paintModel();
        onModel?.(m);
        if (m.celebrate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          sweep.classList.remove('is-on');
          void sweep.offsetWidth;
          sweep.classList.add('is-on');
        }
        input.focus();
      });
      return b;
    }));
    glideMenu(modelMenu);
  }
  function paintFiles() {
    files.replaceChildren(...attachments.map((name, i) => {
      const f = node('span', 'bui-prompt-file');
      const x = node('button', 'bui-prompt-file-x');
      x.type = 'button';
      x.setAttribute('aria-label', `Remover ${name}`);
      x.append(svg(CLOSE, { size: 10, width: 2.5 }));
      x.addEventListener('click', () => { attachments.splice(i, 1); paintFiles(); paint(); });
      f.append(svg(PB_GLYPHS.file, { size: 12, width: 1.8 }), node('span', null, name), x);
      return f;
    }));
    files.hidden = !attachments.length;
    box.classList.toggle('has-files', attachments.length > 0);
  }
  function paint() {
    send.disabled = !input.value.trim() && !attachments.length;
    input.style.height = '0px';
    const h = input.scrollHeight;
    input.style.height = `${Math.min(Math.max(h, tall ? 68 : 28), tall ? 160 : 100)}px`;
    input.style.overflowY = h > (tall ? 160 : 100) ? 'auto' : 'hidden';
    box.classList.toggle('is-wide', tall || input.value.includes('\n') || h > 30);
    plus.setAttribute('aria-expanded', String(plusOpen));
    paintMenu();
  }
  async function pick(row, kind) {
    const t = token();
    const before = t ? input.value.slice(0, t.start) : input.value;
    if (row.attach) {
      input.value = before;
      const names = await onAttach?.();
      if (names?.length) { attachments.push(...names); paintFiles(); }
    } else if (kind === 'at') input.value = `${before}@${row.name} `;
    else input.value = row.text ? `${before}${row.text}` : `${before}${row.name} `;
    plusOpen = false;
    dismissed = false;
    paint();
    input.focus();
  }
  function submit() {
    if (send.disabled) return;
    onSend?.({ text: input.value.trim(), attachments: [...attachments], model: current?.key });
    input.value = '';
    attachments = [];
    plusOpen = false;
    modelMenu.hidden = true;
    paintFiles();
    paint();
  }

  input.addEventListener('input', () => { dismissed = false; plusOpen = false; active = 0; paint(); });
  input.addEventListener('keydown', e => {
    const { kind, list } = rows();
    if (kind && list.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length;
        mark();
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') { e.preventDefault(); pick(list[active], kind); return; }
    }
    if (e.key === 'Escape') { dismissed = true; plusOpen = false; modelMenu.hidden = true; paint(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  });
  plus.addEventListener('click', () => { modelMenu.hidden = true; plusOpen = !plusOpen; active = 0; paint(); input.focus(); });
  modelBtn.addEventListener('click', () => {
    plusOpen = false;
    paint();
    modelMenu.hidden = !modelMenu.hidden;
    if (!modelMenu.hidden) {
      const a = anchor.getBoundingClientRect();
      const b = modelBtn.getBoundingClientRect();
      modelMenu.style.left = `${Math.max(0, Math.min(b.left - a.left, a.width - 176))}px`;
      modelMenu.style.bottom = `${a.bottom - b.top + 8}px`;
    }
  });
  send.addEventListener('click', submit);
  mic.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new SpeechRec();
    rec.lang = document.documentElement.lang || 'pt-BR';
    rec.onresult = ev => {
      const text = [...ev.results].map(r => r[0].transcript).join(' ');
      input.value = input.value ? `${input.value.trimEnd()} ${text}` : text;
      paint();
    };
    rec.onend = () => { rec = null; mic.classList.remove('is-listening'); mic.setAttribute('aria-pressed', 'false'); input.placeholder = placeholder; };
    mic.classList.add('is-listening');
    mic.setAttribute('aria-pressed', 'true');
    input.placeholder = 'Ouvindo…';
    rec.start();
  });
  const outside = e => { if (!el.contains(e.target)) { plusOpen = false; modelMenu.hidden = true; paint(); } };
  document.addEventListener('pointerdown', outside);
  const eq = node('span', 'bui-eq');
  for (let i = 0; i < 3; i++) eq.append(node('span'));
  mic.append(eq);

  glideMenu(menuEl);
  paintModel();
  paintFiles();
  paint();
  return {
    el,
    input,
    focus() { input.focus(); },
    destroy() { document.removeEventListener('pointerdown', outside); rec?.stop(); }
  };
}

/* ── SidebarNav: barra lateral que recolhe de 224px para 52px ─ */

const SB_ICONS = {
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  userAdd: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 10l-2 2 2 2"/>',
  spark: `<path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/>`
};
export const sidebarIcons = SB_ICONS;

/**
 * workspace: { name, mark?, icon? } · menu: [{ label, icon, onClick } | 'divider']
 * nav: [{ key, label, icon, count? }] · recents: [{ id, label }]
 */
export function sidebarNav({ workspace = { name: 'Workspace' }, menu = [], nav = [], active, recents = [], recentsLabel = 'Conversas', newLabel = 'Nova conversa', footer, onNew, onNavigate, onPick } = {}) {
  const el = node('aside', 'bui-sidebar');
  el.setAttribute('aria-label', 'Navegação');
  const tree = node('div', 'bui-sidebar-tree');
  el.append(tree);
  let current = active;
  let picked = null;

  const top = node('div', 'bui-sidebar-top');
  const ws = node('button', 'bui-sidebar-ws');
  ws.type = 'button';
  ws.setAttribute('aria-expanded', 'false');
  const logo = node('span', 'bui-sidebar-logo');
  logo.append(svg(workspace.icon || SB_ICONS.spark, { size: 18, width: 1.8 }));
  ws.append(logo, node('span', 'bui-sidebar-copy bui-sidebar-ws-name', workspace.name), chevronDown({ size: 16, className: 'bui-sidebar-copy' }));
  const collapseBtn = node('button', 'bui-sidebar-collapse');
  collapseBtn.type = 'button';
  collapseBtn.setAttribute('aria-label', 'Recolher barra lateral');
  collapseBtn.append(svg(SB_ICONS.panel, { size: 18, width: 1.8 }));
  const expandBtn = node('button', 'bui-sidebar-expand');
  expandBtn.type = 'button';
  expandBtn.setAttribute('aria-label', 'Abrir barra lateral');
  const flipped = svg(SB_ICONS.panel, { size: 18, width: 1.8 });
  flipped.style.transform = 'scaleX(-1)';
  expandBtn.append(flipped);
  top.append(ws, collapseBtn, expandBtn);

  const row = (icon, label, { count, on, onClick } = {}) => {
    const b = node('button', `bui-sidebar-row${on ? ' is-active' : ''}`);
    b.type = 'button';
    b.dataset.menuRow = '';
    b.title = label;
    if (icon) {
      const i = node('span', 'bui-sidebar-icon');
      i.append(svg(SB_ICONS[icon] || icon, { size: 18, width: 1.8 }));
      b.append(i);
    }
    b.append(node('span', 'bui-sidebar-copy bui-sidebar-label', label));
    if (count) b.append(node('span', 'bui-sidebar-copy bui-sidebar-count', count));
    if (onClick) b.addEventListener('click', onClick);
    return b;
  };
  const navGroup = node('div', 'bui-sidebar-group');
  const recentHead = node('div', 'bui-sidebar-copy bui-sidebar-recent-head');
  const recentLabel = node('span', 'bui-sidebar-recent-label');
  recentLabel.append(chevronDown({ size: 16 }), node('span', null, recentsLabel));
  const searchBtn = node('button', 'bui-sidebar-search-btn');
  searchBtn.type = 'button';
  searchBtn.setAttribute('aria-label', 'Buscar conversas');
  searchBtn.append(svg(SEARCH, { size: 16 }));
  const searchBox = node('div', 'bui-sidebar-search');
  const searchInput = node('input');
  searchInput.placeholder = 'Buscar conversas';
  searchInput.setAttribute('aria-label', 'Buscar no histórico');
  const searchClose = node('button', 'bui-sidebar-search-close');
  searchClose.type = 'button';
  searchClose.setAttribute('aria-label', 'Fechar busca');
  searchClose.append(svg(CLOSE, { size: 14 }));
  searchBox.append(svg(SEARCH, { size: 15 }), searchInput, searchClose);
  recentHead.append(recentLabel, searchBtn, searchBox);
  const recentGroup = node('div', 'bui-sidebar-group');
  const scroll = node('div', 'bui-sidebar-scroll');
  scroll.append(recentHead, recentGroup);
  tree.append(top, navGroup, scroll);
  if (footer) {
    const f = node('div', 'bui-sidebar-copy bui-sidebar-foot');
    const b = button(footer.label, { variant: 'ghost', size: 'sm', onClick: footer.onClick });
    f.append(b);
    tree.append(f);
  }

  function paintNav() {
    navGroup.replaceChildren(
      row('edit', newLabel, { onClick: () => { picked = null; current = null; paintAll(); onNew?.(); } }),
      ...nav.map(n => row(n.icon, n.label, { count: n.count, on: current === n.key, onClick: () => { current = n.key; picked = null; paintAll(); onNavigate?.(n.key); } }))
    );
  }
  function paintRecents() {
    const q = fold(searchInput.value.trim());
    const list = recents.filter(r => fold(r.label).includes(q));
    recentGroup.replaceChildren(...list.map(r => row(null, r.label, { on: picked === r.id, onClick: () => { picked = r.id; current = null; paintAll(); onPick?.(r); } })));
    if (q && !list.length) recentGroup.append(node('div', 'bui-sidebar-copy bui-sidebar-empty', 'Nenhuma conversa encontrada'));
  }
  function paintAll() { paintNav(); paintRecents(); }
  glideMenu(navGroup);
  glideMenu(recentGroup);
  paintAll();

  const setCollapsed = value => {
    el.classList.toggle('is-collapsed', value);
    collapseBtn.tabIndex = value ? -1 : 0;
    expandBtn.tabIndex = value ? 0 : -1;
    if (value) { closeSearch(); closeMenu(); }
  };
  collapseBtn.addEventListener('click', () => setCollapsed(true));
  expandBtn.addEventListener('click', () => setCollapsed(false));
  const closeSearch = () => { recentHead.classList.remove('is-searching'); searchInput.value = ''; paintRecents(); };
  searchBtn.addEventListener('click', () => { recentHead.classList.add('is-searching'); setTimeout(() => searchInput.focus(), 60); });
  searchClose.addEventListener('click', closeSearch);
  searchInput.addEventListener('input', paintRecents);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') closeSearch(); });

  let pop = null;
  const closeMenu = () => { pop?.remove(); pop = null; ws.setAttribute('aria-expanded', 'false'); };
  ws.addEventListener('click', () => {
    if (pop) return closeMenu();
    if (!menu.length) return;
    const r = ws.getBoundingClientRect();
    pop = node('div', 'bui-sidebar-menu');
    pop.style.top = `${r.bottom + 6}px`;
    pop.style.left = `${r.left}px`;
    const head = node('button', 'bui-sidebar-menu-row is-head');
    head.type = 'button';
    head.dataset.menuRow = '';
    head.append(node('span', 'bui-sidebar-mark', workspace.mark || workspace.name.charAt(0)), node('span', null, workspace.name), svg(CHECK, { size: 16, width: 2.2 }));
    head.addEventListener('click', closeMenu);
    pop.append(head);
    for (const item of menu) {
      if (item === 'divider') { pop.append(node('div', 'bui-sidebar-divider')); continue; }
      const b = node('button', 'bui-sidebar-menu-row');
      b.type = 'button';
      b.dataset.menuRow = '';
      const i = node('span', 'bui-sidebar-icon');
      i.append(svg(SB_ICONS[item.icon] || item.icon || SB_ICONS.plus, { size: 16, width: 1.8 }));
      b.append(i, node('span', null, item.label));
      b.addEventListener('click', () => { closeMenu(); item.onClick?.(); });
      pop.append(b);
    }
    glideMenu(pop);
    document.body.append(pop);
    ws.setAttribute('aria-expanded', 'true');
  });
  const outside = e => { if (pop && !pop.contains(e.target) && !ws.contains(e.target)) closeMenu(); };
  document.addEventListener('pointerdown', outside);
  setCollapsed(false);

  return {
    el,
    setCollapsed,
    setRecents(next) { recents = next; paintRecents(); },
    setActive(key) { current = key; picked = null; paintAll(); },
    destroy() { closeMenu(); document.removeEventListener('pointerdown', outside); }
  };
}

/* ── AgentScreen: composição completa para agentes, chat e atividade ─── */

/**
 * Tela de agente composta pelos mesmos blocos que a referência Beautiful UI usa:
 * sidebar, resposta em streaming, thinking, tool chips, contexto, tarefas e prompt bar.
 */
export function agentScreen({
  workspace = { name: 'Minha agência', mark: 'S' },
  menu = [],
  nav = [],
  recents = [],
  active,
  title = 'Agente de follow-up',
  subtitle = 'Conversa de teste',
  response = 'Encontrei 14 oportunidades sem movimento há mais de 14 dias. Separei as três que merecem um follow-up hoje.',
  tools = [],
  chunks = [],
  tasks = [],
  prompt = {},
  onNew,
  onNavigate,
  onPick,
  onSend
} = {}) {
  const el = node('section', 'bui-agent-screen');
  const frame = node('div', 'bui-agent-frame');
  const side = sidebarNav({ workspace, menu, nav, active, recents, onNew, onNavigate, onPick });
  const main = node('main', 'bui-agent-main');
  const head = node('header', 'bui-agent-head');
  const headCopy = node('div', 'bui-agent-head-copy');
  headCopy.append(node('strong', null, title), node('small', null, subtitle));
  const status = node('span', 'bui-agent-status');
  status.append(node('i', null), node('span', null, 'Ativo'));
  head.append(headCopy, status);

  const body = node('div', 'bui-agent-body');
  const thread = node('div', 'bui-agent-thread');
  const thought = thinkingState({ active: 'Lendo o funil', open: true, rows: [
    { primary: 'Consultando oportunidades abertas', secondary: '32 registros' },
    { primary: 'Identificando contatos sem movimento' }
  ] });
  const toolsBlock = toolChips({ header: '3 ferramentas', steps: tools.length ? tools : [
    { icon: 'search', label: 'Consultou', chip: 'oportunidades.abertas', mono: true },
    { icon: 'read', label: 'Leu', chip: 'histórico de contato', mono: true },
    { icon: 'write', label: 'Escreveu', chip: 'follow-up.md', mono: true }
  ] });
  const answer = streamingText({ text: response, sources: [
    { name: 'Painel da agência', domain: 'graao', href: '#' },
    { name: 'Histórico do funil', domain: 'graao', href: '#' }
  ], followUps: ['Abrir oportunidades', 'Montar a sequência de follow-up'], onFollowUp: onSend });
  thread.append(thought.el, toolsBlock.el, answer.el);
  if (chunks.length) thread.append(contextCards({ header: 'Contexto usado', chunks }).el);

  const rail = node('aside', 'bui-agent-rail');
  rail.append(node('h3', null, 'Atividade recente'));
  const taskBlock = taskRows({ list: true, rows: tasks.length ? tasks : [
    { key: 'a', label: 'Conferiu as oportunidades', amount: '32 registros', status: 'done' },
    { key: 'b', label: 'Montou a lista de follow-up', amount: '7 itens', status: 'running' },
    { key: 'c', label: 'Rascunhou as mensagens', amount: '3 mensagens', status: 'pending' }
  ] });
  rail.append(taskBlock.el);
  body.append(thread, rail);

  const composer = promptBar({
    placeholder: 'Pergunte algo sobre sua agência…',
    sources: prompt.sources || [],
    commands: prompt.commands || [],
    models: prompt.models || [],
    onSend: payload => onSend?.(payload)
  });
  main.append(head, body, composer.el);
  frame.append(side.el, main);
  el.append(frame);
  return {
    el,
    destroy() {
      side.destroy?.();
      thought.destroy?.();
      toolsBlock.destroy?.();
      answer.destroy?.();
      taskBlock.destroy?.();
      composer.destroy?.();
    }
  };
}

/* ── Flowchart: fluxo em tela pontilhada, com cartões arrastáveis ─ */

const mix = (hue, pct, base = 'var(--bui-surface)') => `color-mix(in srgb, ${hue} ${pct}%, ${base})`;
const FC_PAD = 24;
const FC_GAP = 64;
const FC_PILL = 30;
const HANDLE = '<g fill="currentColor" stroke="none">' + [3, 8, 13].map(y => `<circle cx="3" cy="${y}" r="1.1"/><circle cx="7.5" cy="${y}" r="1.1"/>`).join('') + '</g>';

function selectChip(value, items, { dot, align = 'left', width = 176, onPick } = {}) {
  const wrap = node('span', 'bui-fc-select');
  wrap.dataset.ui = '';
  const b = node('button', 'bui-fc-chip is-select');
  b.type = 'button';
  b.setAttribute('aria-expanded', 'false');
  const paint = () => {
    b.replaceChildren();
    if (dot) { const d = node('span', 'bui-fc-dot'); d.style.background = dot; b.append(d); }
    b.append(node('span', 'bui-fc-chip-text', value), chevronDown({ size: 11, width: 2.4 }));
  };
  paint();
  let menuEl = null;
  const close = () => { menuEl?.remove(); menuEl = null; b.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside); };
  const outside = e => { if (!wrap.contains(e.target)) close(); };
  b.addEventListener('click', () => {
    if (menuEl) return close();
    menuEl = node('div', `bui-prompt-menu is-model bui-fc-menu is-${align}`);
    menuEl.style.width = `${width}px`;
    for (const item of items) {
      const name = item.name ?? item;
      const r = node('button', 'bui-prompt-row is-model');
      r.type = 'button';
      r.dataset.menuRow = '';
      r.append(node('b', null, name), node('span', null, item.tag || ''));
      const check = svg(CHECK, { size: 13, width: 2.5 });
      check.style.visibility = name === value ? 'visible' : 'hidden';
      r.append(check);
      r.addEventListener('click', () => { value = name; paint(); close(); onPick?.(name); });
      menuEl.append(r);
    }
    glideMenu(menuEl);
    wrap.append(menuEl);
    b.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside);
  });
  wrap.append(b);
  return wrap;
}

/**
 * steps: [{ id, row, x (0–1), w, kind: { label, hue }, hue, title, caption, icon?,
 *           conditions?: [{ lead: 'Se', source: 'pedido', prop: { value, items }, op: 'é', value: { value, items, dot? } }] }]
 * edges: [{ from, to }]
 */
export function flowchart({ steps = [], edges = [], onSelect, onChange } = {}) {
  const el = node('div', 'bui-flow');
  const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  lines.setAttribute('class', 'bui-flow-lines');
  el.append(lines);
  const nodes = new Map();
  const offsets = {};
  let selected = null;
  let drag = null;

  for (const step of steps) {
    const wrap = node('div', 'bui-flow-node');
    if (step.kind) {
      const pill = node('span', 'bui-flow-kind', step.kind.label);
      pill.style.background = mix(step.kind.hue, 14, 'var(--bui-inset)');
      pill.style.color = mix(step.kind.hue, 80, 'var(--bui-ink)');
      wrap.append(pill);
    }
    if (step.conditions) {
      const card = node('div', 'bui-flow-card is-condition');
      const body = node('div', 'bui-flow-cond');
      step.conditions.forEach((c, i) => {
        const line = node('div', 'bui-flow-cond-row');
        line.append(svg(HANDLE, { size: 16, className: 'bui-flow-handle' }), node('span', 'bui-flow-lead', c.lead || (i ? 'e' : 'Se')));
        if (c.source) {
          const s = node('span', 'bui-fc-chip is-source');
          s.dataset.ui = '';
          s.append(svg(PB_GLYPHS.layers, { size: 12, width: 1.8 }), document.createTextNode(c.source));
          line.append(s);
        }
        if (c.prop) line.append(selectChip(c.prop.value, c.prop.items, { width: 144, onPick: v => { c.prop.value = v; onChange?.(step, c); } }));
        line.append(node('span', 'bui-flow-lead is-op', c.op || 'é'));
        if (c.value) line.append(selectChip(c.value.value, c.value.items, { dot: c.value.dot || '#f09a2f', align: 'right', width: 220, onPick: v => { c.value.value = v; onChange?.(step, c); } }));
        body.append(line);
      });
      card.append(body);
      wrap.append(card);
    } else {
      const card = node('button', 'bui-flow-card');
      card.type = 'button';
      card.setAttribute('aria-pressed', 'false');
      const ico = node('span', 'bui-flow-icon');
      const hue = step.hue || 'var(--bui-accent)';
      ico.style.background = mix(hue, 12);
      ico.style.color = hue;
      ico.style.boxShadow = `0 0 0 1px ${mix(hue, 20)}`;
      ico.append(svg(step.icon || SB_ICONS.spark, { size: 16, width: 1.8 }));
      const text = node('span', 'bui-flow-text');
      text.append(node('b', null, step.title || ''), node('small', null, step.caption || ''));
      card.append(ico, text);
      card.addEventListener('click', () => {
        if (drag?.moved) return;
        selected = selected === step.id ? null : step.id;
        el.querySelectorAll('.bui-flow-card[aria-pressed]').forEach(c => c.setAttribute('aria-pressed', 'false'));
        card.setAttribute('aria-pressed', String(selected === step.id));
        layout();
        onSelect?.(selected ? step : null);
      });
      wrap.append(card);
    }
    wrap.addEventListener('pointerdown', e => {
      if (e.target.closest('[data-ui]')) return;
      const o = offsets[step.id] || { dx: 0, dy: 0 };
      drag = { id: step.id, x: e.clientX, y: e.clientY, dx: o.dx, dy: o.dy, moved: false };
      wrap.setPointerCapture(e.pointerId);
    });
    wrap.addEventListener('pointermove', e => {
      if (!drag || drag.id !== step.id) return;
      const dx = drag.dx + e.clientX - drag.x;
      const dy = drag.dy + e.clientY - drag.y;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 3) return;
      drag.moved = true;
      offsets[step.id] = { dx, dy };
      layout(step.id);
    });
    const end = () => { if (drag?.id === step.id) { const moved = drag.moved; setTimeout(() => { drag = null; }, moved ? 0 : 0); if (!moved) drag = null; } };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
    nodes.set(step.id, wrap);
    el.append(wrap);
  }

  function layout(dragging) {
    const cw = el.clientWidth || 480;
    const rows = [...new Set(steps.map(s => s.row))].sort((a, b) => a - b);
    const h = id => nodes.get(id).offsetHeight || 90;
    const rowH = rows.map(r => Math.max(...steps.filter(s => s.row === r).map(s => h(s.id))));
    const rowY = [];
    rows.forEach((_, i) => { rowY[i] = i === 0 ? FC_PAD : rowY[i - 1] + rowH[i - 1] + FC_GAP; });
    const canvasH = rowY[rows.length - 1] + rowH[rows.length - 1] + FC_PAD;
    el.style.height = `${canvasH}px`;
    const place = {};
    for (const s of steps) {
      const w = Math.min(s.w || 300, cw * 0.92);
      const baseCx = s.x * cw;
      const baseTop = rowY[rows.indexOf(s.row)];
      const o = offsets[s.id] || { dx: 0, dy: 0 };
      const cx = Math.min(Math.max(baseCx + o.dx, w / 2 + 8), cw - w / 2 - 8);
      const top = Math.min(Math.max(baseTop + o.dy, 8), canvasH - h(s.id) - 8);
      offsets[s.id] = { dx: cx - baseCx, dy: top - baseTop };
      place[s.id] = { cx, top, w, h: h(s.id), pill: s.kind ? FC_PILL : 0 };
      const n = nodes.get(s.id);
      n.style.left = `${cx}px`;
      n.style.top = `${top}px`;
      n.style.width = `${w}px`;
      n.style.zIndex = dragging === s.id ? 2 : 1;
    }
    lines.setAttribute('width', cw);
    lines.setAttribute('height', canvasH);
    lines.innerHTML = edges.map(e => {
      const a = place[e.from];
      const b = place[e.to];
      if (!a || !b) return '';
      const from = { x: a.cx, y: a.top + a.h };
      const to = { x: b.cx, y: b.top + b.pill };
      const k = Math.min(Math.max(Math.abs(to.y - from.y) * 0.55, 24), 84);
      const lit = selected === e.from || selected === e.to;
      return `<path d="M ${from.x} ${from.y} C ${from.x} ${from.y + k}, ${to.x} ${to.y - k}, ${to.x} ${to.y}" fill="none" stroke="${lit ? 'var(--bui-accent)' : 'var(--bui-line-strong)'}" stroke-width="1.25"/>`;
    }).join('');
  }
  const ro = new ResizeObserver(() => layout());
  ro.observe(el);
  nodes.forEach(n => ro.observe(n));
  requestAnimationFrame(() => layout());
  return { el, layout, destroy() { ro.disconnect(); } };
}

/* ── InsightCards: carrossel de insights com mini gráficos ─ */
/* O original desenha com a lib `liveline` (canvas). Aqui é um SVG próprio: linha suavizada
 * (Catmull-Rom), grade leve, cursor e dica ao passar o mouse. */

function smoothValues(values, per = 9) {
  if (values.length < 3) return values.slice();
  const out = [];
  const n = values.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = values[Math.max(0, i - 1)], p1 = values[i], p2 = values[i + 1], p3 = values[Math.min(n - 1, i + 2)];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      out.push(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3));
    }
  }
  out.push(values[n - 1]);
  // A curva não pode passar dos valores reais (ex.: ficar negativa entre semanas sem venda).
  const lo = Math.min(...values), hi = Math.max(...values);
  return out.map(v => Math.min(hi, Math.max(lo, v)));
}

/** series: [{ name, values, color }] · format(v) */
export function lineChart({ series = [], format = v => v.toFixed(2), height = 166, smooth = true } = {}) {
  const el = node('div', 'bui-chart');
  el.style.height = `${height}px`;
  const plot = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  plot.setAttribute('preserveAspectRatio', 'none');
  plot.setAttribute('aria-hidden', 'true');
  const cursor = node('span', 'bui-chart-cursor');
  const tipAnchor = node('span', 'bui-chart-tip-anchor');
  const tip = node('div', 'bui-chart-tip');
  tipAnchor.append(tip);
  cursor.hidden = tipAnchor.hidden = true;
  el.append(plot, cursor, tipAnchor);
  const data = series.map(s => ({ ...s, dense: smooth ? smoothValues(s.values) : s.values.slice() }));
  const count = data[0]?.dense.length || 0;
  const all = data.flatMap(d => d.dense);
  const min = Math.min(...all), max = Math.max(...all);
  const PAD_T = 34, PAD_B = 22;

  function draw() {
    const w = el.clientWidth || 300;
    const h = height;
    plot.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const y = v => PAD_T + (1 - (v - min) / ((max - min) || 1)) * (h - PAD_T - PAD_B);
    const x = i => 6 + (i / Math.max(1, count - 1)) * (w - 12);
    const grid = [0, 1, 2, 3].map(k => {
      const gy = PAD_T + (k / 3) * (h - PAD_T - PAD_B);
      return `<line x1="0" x2="${w}" y1="${gy}" y2="${gy}" stroke="var(--bui-line)" stroke-dasharray="2 4"/>`;
    }).join('');
    const paths = data.map(d => `<path d="${d.dense.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${d.color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`).join('');
    const dots = data.map(d => `<circle cx="${x(count - 1)}" cy="${y(d.dense[count - 1])}" r="3.2" fill="${d.color}"/>`).join('');
    plot.innerHTML = grid + paths + dots;
  }
  const hover = e => {
    const r = el.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const i = Math.round(p * (count - 1));
    const pct = (i / Math.max(1, count - 1)) * 100;
    cursor.hidden = tipAnchor.hidden = false;
    cursor.style.left = `${pct}%`;
    tipAnchor.style.left = `${Math.min(Math.max(pct, 28), 72)}%`;
    tip.replaceChildren(...data.map(d => {
      const item = node('span', 'bui-chart-tip-item');
      const dot = node('span', 'bui-chart-tip-dot');
      dot.style.background = d.color;
      item.append(dot, document.createTextNode(format(d.dense[i])));
      return item;
    }));
    el.dispatchEvent(new CustomEvent('bui-hover', { detail: { index: i, values: data.map(d => d.dense[i]) } }));
  };
  const leave = () => {
    cursor.hidden = tipAnchor.hidden = true;
    el.dispatchEvent(new CustomEvent('bui-hover', { detail: null }));
  };
  el.addEventListener('pointermove', hover);
  el.addEventListener('pointerdown', hover);
  el.addEventListener('pointerleave', leave);
  el.addEventListener('pointercancel', leave);
  const ro = new ResizeObserver(draw);
  ro.observe(el);
  draw();
  return { el, destroy() { ro.disconnect(); } };
}

function insightBody(card) {
  const box = node('div', 'bui-card bui-insight-card');
  const panel = (headText, right, chart) => {
    const p = node('div', 'bui-insight-panel');
    const h = node('div', 'bui-insight-panel-head');
    const label = node('span', null, headText);
    h.append(label, right || node('span', 'bui-insight-tag', card.tag || 'Instantâneo'));
    p.append(h, chart.el);
    chart.el.addEventListener('bui-hover', e => {
      label.textContent = e.detail ? card.format?.(e.detail.values[0]) ?? headText : headText;
    });
    return p;
  };
  if (card.type === 'compare') {
    const legend = node('div', 'bui-insight-legend');
    for (const s of card.series) {
      const col = node('div');
      const name = node('span', 'bui-insight-name');
      const dot = node('span', 'bui-insight-dot');
      dot.style.background = s.color;
      name.append(dot, document.createTextNode(s.name));
      const big = node('b', `bui-insight-big is-${s.tone || 'neutral'}`, (card.format || (v => v))(s.values.at(-1)));
      col.append(name, big);
      if (s.sub) col.append(node('code', `bui-insight-mono is-${s.tone || 'neutral'}`, s.sub));
      legend.append(col);
    }
    box.append(legend, panel(card.caption || 'Tendência', null, lineChart({ series: card.series, format: card.format })));
  } else if (card.type === 'metric') {
    const top = node('div', 'bui-insight-top');
    const title = node('span', 'bui-insight-title');
    if (card.alert) title.append(svg('<path d="M12 19V5M5 12l7-7 7 7"/>', { size: 12, width: 2.5, stroke: 'var(--bui-red)' }));
    title.append(document.createTextNode(card.title));
    top.append(title, node('span', 'bui-insight-tag', card.tag || 'Instantâneo'));
    const metrics = card.metrics;
    let metric = metrics[0];
    const seg = node('span', 'bui-insight-seg');
    const slot = node('div');
    const paintMetric = () => {
      seg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(metrics[i] === metric)));
      slot.replaceChildren(panel(metric.caption || '', seg, lineChart({ series: [{ name: metric.label, values: metric.values, color: card.color || '#ee5c61' }], format: metric.format, smooth: false })));
    };
    metrics.forEach(m => {
      const b = node('button', null, m.label);
      b.type = 'button';
      b.addEventListener('click', () => { metric = m; paintMetric(); });
      seg.append(b);
    });
    card.format = v => metric.format(v);
    paintMetric();
    const foot = node('div', 'bui-insight-foot');
    foot.append(node('b', null, card.total || ''));
    if (card.delta) foot.append(node('code', 'bui-insight-mono is-red', card.delta));
    if (card.note) foot.append(node('small', null, card.note));
    box.append(top, slot, foot);
  } else if (card.type === 'allocation') {
    const segs = card.segments;
    let active = segs[0];
    const title = node('span', 'bui-insight-title', card.title);
    const big = node('b', 'bui-insight-hero');
    const bar = node('div', 'bui-insight-bar');
    bar.setAttribute('role', 'group');
    const legend = node('div', 'bui-insight-chips');
    const detail = node('div', 'bui-insight-detail');
    const paintSeg = () => {
      big.textContent = active.amount;
      [...bar.children].forEach((b, i) => { b.setAttribute('aria-pressed', String(segs[i] === active)); });
      [...legend.children].forEach((b, i) => { b.setAttribute('aria-pressed', String(segs[i] === active)); });
      detail.replaceChildren(node('b', null, active.label), node('small', null, active.note || card.note || ''));
      detail.firstChild.style.color = active.color;
    };
    for (const s of segs) {
      const b = node('button', 'bui-insight-seg-bar');
      b.type = 'button';
      b.style.width = `${s.pct}%`;
      b.style.background = s.color;
      b.setAttribute('aria-label', `${s.label}: ${s.pct}%`);
      b.append(node('span'));
      b.addEventListener('click', () => { active = s; paintSeg(); });
      bar.append(b);
      const c = node('button', 'bui-insight-chip');
      c.type = 'button';
      const d = node('span', 'bui-insight-dot');
      d.style.background = s.color;
      c.append(d, document.createTextNode(`${s.name} `), node('span', null, `${s.pct}%`));
      c.addEventListener('click', () => { active = s; paintSeg(); });
      legend.append(c);
    }
    paintSeg();
    box.append(title, big, bar, legend, detail);
  }
  return box;
}

/**
 * pages: [{ key, prose: Node | string, pill?, card: { type: 'compare' | 'metric' | 'allocation', ... } }]
 */
export function insightCards({ title = 'Insights', pages = [], onPill } = {}) {
  const el = node('div', 'bui-insights');
  const head = node('div', 'bui-insights-head');
  const name = node('span', 'bui-insights-title');
  name.append(node('b', null, title), node('span', null, String(pages.length)));
  const nav = node('span', 'bui-insights-nav');
  const body = node('div', 'bui-insights-body');
  head.append(name, nav);
  el.append(head, body);
  let page = 0;
  [['M15 18l-6-6 6-6', 'Insight anterior', -1], ['M9 6l6 6-6 6', 'Próximo insight', 1]].forEach(([d, label, dir]) => {
    const b = node('button', 'bui-icon-btn is-sm');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.append(svg(`<path d="${d}"/>`, { size: 13, width: 2.2 }));
    b.addEventListener('click', () => { page = (page + dir + pages.length) % pages.length; paint(); });
    nav.append(b);
  });
  function paint() {
    const p = pages[page];
    const prose = node('p', 'bui-insights-prose');
    prose.append(typeof p.prose === 'string' ? document.createTextNode(p.prose) : p.prose);
    const kids = [prose, insightBody(p.card)];
    if (p.pill) {
      const pill = node('button', 'bui-insights-pill', p.pill);
      pill.type = 'button';
      pill.addEventListener('click', () => onPill?.(p));
      kids.push(pill);
    }
    body.classList.remove('is-in');
    void body.offsetWidth;
    body.replaceChildren(...kids);
    body.classList.add('is-in');
  }
  if (pages.length) paint();
  return { el, go(i) { page = i; paint(); }, destroy() {} };
}

/** Menção inline estilo @entidade, usada na prosa dos insights. */
export function mention(name, color = 'var(--bui-accent)') {
  const m = node('span', 'bui-mention');
  const d = node('span', 'bui-insight-dot');
  d.style.background = color;
  m.append(d, document.createTextNode(`@${name}`));
  return m;
}
export function monoValue(text, tone = 'red') { return node('code', `bui-insight-mono is-${tone}`, text); }

/* ── FineTuneCard: inspetor com campos de arrastar (scrub) ─ */

/** Campo numérico que ajusta ao arrastar o rótulo, com ↑/↓ (⇧ = ×10) ou digitando. */
export function scrubField({ label, value = 0, min = 0, max = 100, step = 1, suffix = '', initial = value, onChange } = {}) {
  const el = node('label', 'bui-scrub');
  const handle = node('span', 'bui-scrub-handle', label);
  handle.setAttribute('role', 'slider');
  handle.setAttribute('aria-label', label);
  handle.setAttribute('aria-valuemin', min);
  handle.setAttribute('aria-valuemax', max);
  handle.tabIndex = 0;
  const input = node('input');
  input.inputMode = 'numeric';
  input.setAttribute('aria-label', `${label}: valor`);
  el.append(handle, input);
  if (suffix) el.append(node('span', 'bui-scrub-suffix', suffix));
  const clamp = v => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const set = (v, emit = true) => {
    value = clamp(v);
    input.value = String(value);
    handle.setAttribute('aria-valuenow', value);
    el.classList.toggle('is-active', value !== initial);
    if (emit) onChange?.(value);
  };
  let drag = null;
  handle.addEventListener('pointerdown', e => { handle.setPointerCapture(e.pointerId); drag = { x: e.clientX, v: value }; });
  handle.addEventListener('pointermove', e => { if (drag) set(drag.v + ((e.clientX - drag.x) / 2) * step); });
  handle.addEventListener('pointerup', () => { drag = null; });
  handle.addEventListener('keydown', e => {
    const mult = e.shiftKey ? 10 : 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); set(value + step * mult); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); set(value - step * mult); }
  });
  input.addEventListener('input', () => {
    const n = Number(input.value.replace(/[^\d.-]/g, ''));
    if (input.value.trim() && !Number.isNaN(n)) set(n);
  });
  input.addEventListener('blur', () => set(value, false));
  set(value, false);
  return { el, get value() { return value; }, set };
}

const SEG_SHAPES = {
  row: '<rect x="2" y="9" width="5" height="6" rx="1.2"/><rect x="9.5" y="9" width="5" height="6" rx="1.2"/><rect x="17" y="9" width="5" height="6" rx="1.2"/>',
  col: '<rect x="8" y="3" width="8" height="7" rx="1.2"/><rect x="8" y="14" width="8" height="7" rx="1.2"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>',
  alignLeft: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  alignCenter: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  alignRight: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'
};

/**
 * fields: [{ key, label, value, min, max, step?, suffix? }] · options: string[]
 * segments: [{ key, label, shape: 'row' | 'col' | 'grid' }]
 */
export function fineTuneCard({ title = 'Ajustes', fields = [], options = [], segments, segment, labels = {}, onChange } = {}) {
  const t = { layout: 'Layout', type: 'Tipo', placeholder: 'Escolher', adjust: 'Ajustar', edited: 'Editado', ...labels };
  const segs = segments ?? [{ key: 'row', label: 'Linha', shape: 'row' }, { key: 'col', label: 'Coluna', shape: 'col' }, { key: 'grid', label: 'Grade', shape: 'grid' }];
  const firstSeg = segs.some(s => s.key === segment) ? segment : segs[0]?.key;
  const firstIndex = Math.max(0, segs.findIndex(s => s.key === firstSeg));
  const el = node('div', 'bui-card bui-tune');
  const head = node('div', 'bui-tune-head');
  const status = node('span');
  head.append(node('b', null, title), status);
  const body = node('div', 'bui-card-pad bui-tune-body');
  if (segs.length) body.append(node('p', null, t.layout));
  const seg = node('div', 'bui-tune-seg');
  seg.style.setProperty('--n', segs.length);
  const thumb = node('span', 'bui-tune-thumb');
  seg.append(thumb);
  thumb.style.transform = `translateX(${firstIndex * 100}%)`;
  const state = { segment: firstSeg, values: Object.fromEntries(fields.map(f => [f.key, f.value])), type: null };
  const emit = () => { paintStatus(); onChange?.({ ...state, values: { ...state.values } }); };
  segs.forEach((s, i) => {
    const b = node('button', 'bui-tune-seg-btn');
    b.type = 'button';
    b.setAttribute('aria-label', s.label);
    b.append(svg(SEG_SHAPES[s.shape] || SEG_SHAPES.row, { size: 14, width: 1.6 }));
    b.addEventListener('click', () => {
      state.segment = s.key;
      thumb.style.transform = `translateX(${i * 100}%)`;
      seg.querySelectorAll('.bui-tune-seg-btn').forEach((x, j) => x.setAttribute('aria-pressed', String(j === i)));
      emit();
    });
    b.setAttribute('aria-pressed', String(i === firstIndex));
    seg.append(b);
  });
  if (segs.length) body.append(seg);
  for (let i = 0; i < fields.length; i += 2) {
    const pair = node('div', 'bui-tune-pair');
    for (const f of fields.slice(i, i + 2)) {
      pair.append(scrubField({ ...f, initial: f.value, onChange: v => { state.values[f.key] = v; emit(); } }).el);
    }
    body.append(pair);
  }
  el.append(head, body);
  if (options.length) {
    const foot = node('div', 'bui-card-footer bui-tune-foot');
    const wrap = node('div', 'bui-tune-select');
    const trigger = node('button', 'bui-tune-trigger');
    trigger.type = 'button';
    trigger.setAttribute('aria-expanded', 'false');
    const val = node('span', 'is-placeholder', t.placeholder);
    trigger.append(val, chevronDown({ size: 11, width: 2.5 }));
    const menuEl = node('div', 'bui-tune-menu');
    menuEl.hidden = true;
    for (const o of options) {
      const b = node('button', 'bui-tune-option', o);
      b.type = 'button';
      b.dataset.menuRow = '';
      b.addEventListener('click', () => {
        state.type = o;
        val.textContent = o;
        val.className = '';
        menuEl.querySelectorAll('.bui-tune-option').forEach(x => x.classList.toggle('is-on', x === b));
        close();
        emit();
      });
      menuEl.append(b);
    }
    glideMenu(menuEl);
    const close = () => { menuEl.hidden = true; trigger.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside); };
    const outside = e => { if (!wrap.contains(e.target)) close(); };
    trigger.addEventListener('click', () => {
      if (!menuEl.hidden) return close();
      menuEl.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', outside);
    });
    wrap.append(trigger, menuEl);
    foot.append(node('small', null, t.type), wrap);
    el.append(foot);
  }
  function paintStatus() {
    const changed = state.segment !== firstSeg || state.type || fields.some(f => state.values[f.key] !== f.value);
    status.className = changed ? 'bui-tune-edited' : 'bui-tune-adjust';
    if (changed) status.replaceChildren(svg(CHECK, { size: 10, width: 3 }), document.createTextNode(t.edited));
    else {
      const badge = node('span', 'bui-tune-badge');
      badge.append(svg('<path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/>', { size: 9, fill: 'currentColor', stroke: 'none' }));
      status.replaceChildren(badge, shimmer(t.adjust, 'bui-tune-shimmer'));
    }
  }
  paintStatus();
  return { el, get state() { return { ...state, values: { ...state.values } }; }, destroy() {} };
}

/* ── SelectionActions: barra de IA presa ao trecho selecionado ─ */

const SA_ICONS = {
  explain: '<path d="M21 12a8 8 0 0 1-11.7 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.2M12 16.5h.01"/>',
  improve: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  shorten: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  tone: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01"/>',
  grammar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/>',
  retry: '<path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"/>'
};
export const selectionIcons = SA_ICONS;

/**
 * lead: texto antes do trecho · original: trecho selecionado
 * actions: { primary: [{ id, label, icon, busy? , run? }], more: [...] } — sem `run` o botão só avisa onAction
 * onRun(instruction, original) → Promise<string> com o texto reescrito
 */
export function selectionActions({ lead = '', original = '', actions, labels = {}, prompt = true, onRun, onAction, onKeep, onDiscard, onError } = {}) {
  const t = { keep: 'Manter', discard: 'Descartar', placeholder: 'Descreva a edição', editing: 'Editando', ...labels };
  const acts = actions || {
    primary: [{ id: 'explain', label: 'Explicar', icon: 'explain' }, { id: 'improve', label: 'Melhorar', icon: 'improve', busy: 'Melhorando', run: 'Melhorar' }],
    more: [{ id: 'shorten', label: 'Encurtar', icon: 'shorten', busy: 'Encurtando', run: 'Encurtar' }, { id: 'tone', label: 'Tom', icon: 'tone', busy: 'Ajustando o tom', run: 'Mudar o tom' }, { id: 'grammar', label: 'Gramática', icon: 'grammar', busy: 'Revisando', run: 'Corrigir a gramática' }]
  };
  const el = node('div', 'bui-selection');
  const p = node('p', 'bui-selection-text');
  const pick = node('span', 'bui-selection-pick', original);
  p.append(document.createTextNode(lead), pick);
  const floater = node('div', 'bui-selection-float');
  const bar = node('div', 'bui-selection-bar');
  floater.append(bar);
  el.append(p, floater);

  let current = original;
  let proposal = '';
  let last = null;
  let streamer = null;

  const pillBtn = (label, icon, onClick, cls = 'bui-btn is-quiet is-xs') => {
    const b = node('button', cls);
    b.type = 'button';
    if (icon) b.append(svg(SA_ICONS[icon] || icon, { size: 14, width: 1.8 }));
    if (label) b.append(document.createTextNode(label));
    b.addEventListener('click', onClick);
    return b;
  };
  const sep = () => node('span', 'bui-selection-sep');

  function idle() {
    el.classList.remove('is-expanded', 'is-typing');
    const form = node('form', 'bui-selection-form');
    const input = node('input');
    input.placeholder = t.placeholder;
    input.setAttribute('aria-label', t.placeholder);
    form.append(input);
    const presets = node('div', 'bui-selection-presets');
    if (prompt) presets.append(sep());
    for (const a of acts.primary) presets.append(pillBtn(a.label, a.icon, () => (a.run ? run(a.run, a.busy) : onAction?.(a.id, current))));
    const more = node('div', 'bui-selection-more');
    for (const a of acts.more) more.append(pillBtn(a.label, a.icon, () => (a.run ? run(a.run, a.busy) : onAction?.(a.id, current))));
    const toggle = node('button', 'bui-selection-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Mais ações');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.append(svg('<path d="M9 6l6 6-6 6"/>', { size: 14, width: 1.8 }));
    toggle.addEventListener('click', () => {
      const open = el.classList.toggle('is-expanded');
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Menos ações' : 'Mais ações');
      place();
    });
    presets.append(more, sep(), toggle);
    const sendWrap = node('div', 'bui-selection-send');
    const send = node('button', 'bui-selection-send-btn');
    send.type = 'button';
    send.setAttribute('aria-label', 'Enviar instrução');
    send.append(svg('<path d="M12 19V5M5 12l7-7 7 7"/>', { size: 16, width: 2.4 }));
    sendWrap.append(send);
    const submit = () => { if (input.value.trim()) run(input.value.trim()); };
    form.addEventListener('submit', e => { e.preventDefault(); submit(); });
    send.addEventListener('click', submit);
    input.addEventListener('input', () => { el.classList.toggle('is-typing', Boolean(input.value.trim())); place(); });
    if (prompt) swap(form, presets, sendWrap);
    else swap(presets);
  }
  function busy(label, thinking) {
    const s = node('span', 'bui-selection-busy');
    s.append(node('span', 'bui-spinner'), thinking ? shimmer(`${label}…`) : node('span', null, `${label}…`));
    swap(s);
  }
  async function run(instruction, busyLabel) {
    last = [instruction, busyLabel];
    onAction?.(instruction, current);
    if (!onRun) return;
    busy(busyLabel || t.editing, true);
    let rewrite;
    try { rewrite = await onRun(instruction, current); } catch (error) { idle(); onError?.(error); return; }
    if (!rewrite) { idle(); return; }
    proposal = rewrite;
    busy(busyLabel || t.editing, false);
    streamer?.destroy();
    streamer = streamText(pick, rewrite, { onProgress: place, onDone: result });
  }
  function result() {
    pick.textContent = proposal;
    const keep = pillBtn(t.keep, CHECK, () => { current = proposal; onKeep?.(current); idle(); }, 'bui-selection-keep');
    const discard = pillBtn(t.discard, CLOSE, () => { pick.textContent = current; onDiscard?.(); idle(); });
    const retry = pillBtn('', 'retry', () => { pick.textContent = current; run(...last); }, 'bui-selection-retry');
    retry.setAttribute('aria-label', 'Tentar de novo');
    swap(keep, discard, sep(), retry);
  }
  function swap(...kids) {
    const before = bar.getBoundingClientRect().width;
    bar.style.width = '';
    bar.replaceChildren(...kids);
    const after = bar.getBoundingClientRect().width;
    if (before && Math.abs(after - before) > 1 && bar.animate) {
      bar.animate([{ width: `${before}px` }, { width: `${after}px` }], { duration: 320, easing: 'cubic-bezier(0.23,1,0.32,1)' });
    }
    place();
  }
  let frame = 0;
  function place() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const rects = pick.getClientRects();
      const lastLine = rects[rects.length - 1];
      if (!lastLine) return;
      const b = pick.getBoundingClientRect();
      const host = el.getBoundingClientRect();
      // Texto longo rola dentro do parágrafo: a barra fica presa à parte visível.
      const bottom = Math.min(lastLine.bottom, p.getBoundingClientRect().bottom);
      const x = Math.min(Math.max(b.left - host.left + b.width / 2, 120), Math.max(120, host.width - 120));
      floater.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(bottom - host.top + 8)}px, 0) translateX(-50%)`;
      floater.classList.add('is-visible');
    });
  }
  const ro = new ResizeObserver(place);
  ro.observe(el);
  idle();
  return { el, get text() { return current; }, destroy() { ro.disconnect(); streamer?.destroy(); cancelAnimationFrame(frame); } };
}

/* ── RecordsTable: grade de registros estilo planilha com coluna de IA ─ */

const TAG_BASES = ['oklch(0.76 0.13 70)', 'oklch(0.77 0.16 122)', 'oklch(0.80 0.15 101)', 'oklch(0.62 0.18 293)', 'oklch(0.71 0.16 48)', 'oklch(0.72 0.10 221)', 'oklch(0.64 0.19 27)', 'oklch(0.66 0.21 323)', 'oklch(0.70 0.13 162)', 'oklch(0.67 0.19 3)'];
const tagBase = name => {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return TAG_BASES[h % TAG_BASES.length];
};
const COL_GLYPHS = {
  title: '<path d="M4 21V5a2 2 0 0 1 2-2h8l6 6v12"/><path d="M9 21v-4h6v4M8 9h2M8 13h2M14 13h2"/>',
  tags: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  text: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  date: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  status: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  ai: '<path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/>'
};

function tagList(tags) {
  const box = node('div', 'bui-rec-tags');
  box.title = tags.join(', ');
  const paint = () => {
    box.replaceChildren(...tags.map(t => { const s = node('span', 'bui-rec-tag', t); s.style.setProperty('--tag-base', tagBase(t)); return s; }));
    const avail = box.clientWidth;
    if (!avail) return;
    const kids = [...box.children];
    let used = 0;
    let fit = 0;
    for (let i = 0; i < kids.length; i++) {
      const next = used + (fit ? 4 : 0) + kids[i].offsetWidth;
      const extra = kids.length - (i + 1) ? 4 + 28 : 0;
      if (next + extra > avail) break;
      used = next;
      fit++;
    }
    kids.slice(fit).forEach(k => k.remove());
    if (fit < tags.length) box.append(node('span', 'bui-rec-more', `+${tags.length - fit}`));
  };
  const ro = new ResizeObserver(paint);
  ro.observe(box);
  return box;
}

/**
 * columns: [{ key, label, type: 'title'|'tags'|'text'|'date'|'status'|'link', width?, sort?: (a, b) => n, statuses?: { value: { label, color } } }]
 * rows: [{ id, ...valores }] · ai: { label, prompt?, compute(row) → Promise<string> } adiciona a coluna de IA pelo “+”
 */
export function recordsTable({ columns = [], rows = [], ai, footerLabel = 'registros', selected: initial = [], onSelect, onOpen } = {}) {
  const el = node('div', 'bui-card bui-rec');
  const scroll = node('div', 'bui-rec-scroll');
  const table = node('table', 'bui-rec-table');
  scroll.append(table);
  el.append(scroll);
  const widths = Object.fromEntries(columns.map(c => [c.key, c.width || (c.type === 'title' ? 260 : 190)]));
  const selected = new Set(initial.filter(id => rows.some(r => r.id === id)));
  let sort = { key: columns[0]?.key, dir: 1 };
  let aiCol = null;
  const aiValues = new Map();
  let calcIndex = -1;

  function compare(a, b) {
    const c = columns.find(x => x.key === sort.key) || (aiCol && sort.key === 'ai' ? { key: 'ai' } : null);
    if (!c) return 0;
    if (c.sort) return c.sort(a, b) * sort.dir;
    const va = c.key === 'ai' ? aiValues.get(a.id) ?? '' : a[c.key];
    const vb = c.key === 'ai' ? aiValues.get(b.id) ?? '' : b[c.key];
    if (c.statuses) return ((c.statuses[va]?.rank ?? 0) - (c.statuses[vb]?.rank ?? 0)) * sort.dir;
    return String(Array.isArray(va) ? va.join() : va ?? '').localeCompare(String(Array.isArray(vb) ? vb.join() : vb ?? ''), 'pt-BR', { numeric: true }) * sort.dir;
  }
  const checkbox = (checked, mixed, label, onChange) => {
    const l = node('label', 'bui-rec-check');
    l.title = label;
    const i = node('input');
    i.type = 'checkbox';
    i.checked = checked;
    i.setAttribute('aria-label', label);
    i.addEventListener('change', onChange);
    const box = node('span', `bui-rec-check-box${checked || mixed ? ' is-active' : ''}`);
    if (mixed) box.append(node('span', 'bui-rec-dash'));
    else if (checked) box.append(svg('<path d="m5 12 4 4L19 6"/>', { size: 12, width: 2 }));
    l.append(i, box);
    l.addEventListener('click', e => e.stopPropagation());
    return l;
  };
  function headerCell(c, sticky) {
    const th = node('th', `bui-rec-th${sticky ? ' is-sticky' : ''}`);
    th.style.width = th.style.minWidth = `${widths[c.key] ?? 240}px`;
    const b = node('button', 'bui-rec-head-btn');
    b.type = 'button';
    const ico = node('span', 'bui-rec-head-icon');
    ico.append(svg(COL_GLYPHS[c.type] || COL_GLYPHS.text, { size: 14, width: 1.8 }));
    b.append(ico, node('span', 'bui-rec-head-label', c.label));
    const s = node('span', `bui-rec-sort${sort.key === c.key ? ' is-visible' : ''}${sort.key === c.key && sort.dir === -1 ? ' is-desc' : ''}`);
    s.append(svg('<path d="M12 5v14M5 12l7 7 7-7"/>', { size: 12 }));
    b.append(s);
    b.setAttribute('aria-label', `Ordenar por ${c.label}`);
    b.addEventListener('click', () => { sort = { key: c.key, dir: sort.key === c.key ? -sort.dir : 1 }; paint(); });
    th.append(b);
    if (sticky) th.prepend(checkbox(selected.size === rows.length && rows.length > 0, selected.size > 0 && selected.size < rows.length, 'Selecionar todos', () => {
      if (selected.size === rows.length) selected.clear(); else rows.forEach(r => selected.add(r.id));
      paint();
      onSelect?.([...selected]);
    }));
    const handle = node('span', 'bui-rec-resize');
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-label', `Redimensionar ${c.label}`);
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const x0 = e.clientX;
      const w0 = widths[c.key] ?? th.offsetWidth;
      handle.classList.add('is-resizing');
      const move = ev => {
        widths[c.key] = Math.max(110, Math.min(520, w0 + ev.clientX - x0));
        th.style.width = th.style.minWidth = `${widths[c.key]}px`;
      };
      const up = () => { handle.classList.remove('is-resizing'); handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
    th.append(handle);
    return th;
  }
  function cell(c, r, i) {
    const td = node('td', `bui-rec-td is-${c.type || 'text'}${c.type === 'title' ? ' is-sticky' : ''}`);
    const v = r[c.key];
    if (c.type === 'title') {
      td.append(checkbox(selected.has(r.id), false, `Selecionar ${v}`, () => {
        if (selected.has(r.id)) selected.delete(r.id); else selected.add(r.id);
        paint();
        onSelect?.([...selected]);
      }));
      td.append(node('span', 'bui-rec-num', String(i + 1)));
      const mark = node('span', 'bui-rec-mark', String(v || '?').charAt(0).toUpperCase());
      mark.style.setProperty('--tag-base', tagBase(v));
      const name = node('button', 'bui-rec-name', v);
      name.type = 'button';
      name.addEventListener('click', () => onOpen?.(r));
      td.append(mark, name);
    } else if (c.type === 'tags') td.append(tagList(v || []));
    else if (c.type === 'status') {
      const s = c.statuses?.[v] || { label: v, color: 'var(--bui-ink-3)' };
      const wrap = node('span', 'bui-rec-status');
      const dot = node('span', 'bui-rec-dot');
      dot.style.background = s.color;
      wrap.append(dot, node('span', null, s.label ?? ''));
      td.append(wrap);
    } else if (c.type === 'link') {
      if (v) {
        const a = node('a', 'bui-rec-link');
        a.href = /^https?:/.test(v) ? v : `https://${v}`;
        a.target = '_blank';
        a.rel = 'noreferrer';
        a.append(svg(COL_GLYPHS.link, { size: 12 }), node('span', null, v.replace(/^https?:\/\//, '')));
        td.append(a);
      } else td.append(node('span', 'bui-rec-muted', '—'));
    } else td.append(node('span', v ? '' : 'bui-rec-muted', v || '—'));
    return td;
  }
  function paint() {
    const ordered = [...rows].sort(compare);
    const thead = node('thead');
    const hr = node('tr');
    columns.forEach((c, i) => hr.append(headerCell(c, i === 0)));
    if (aiCol) hr.append(headerCell({ key: 'ai', label: aiCol.label, type: 'ai', width: 240 }));
    if (ai) {
      const add = node('th', 'bui-rec-th is-add');
      const b = node('button', 'bui-rec-add');
      b.type = 'button';
      b.setAttribute('aria-label', 'Adicionar propriedade de IA');
      b.append(svg('<path d="M12 5v14M5 12h14"/>', { size: 14 }));
      b.disabled = Boolean(aiCol);
      b.addEventListener('click', addAi);
      add.append(b);
      hr.append(add);
    }
    thead.append(hr);
    const tbody = node('tbody');
    ordered.forEach((r, i) => {
      const tr = node('tr', `bui-rec-row${selected.has(r.id) ? ' is-selected' : ''}`);
      columns.forEach(c => tr.append(cell(c, r, i)));
      if (aiCol) {
        const td = node('td', 'bui-rec-td is-ai');
        const idx = rows.indexOf(r);
        if (aiValues.has(r.id)) td.append(node('span', 'bui-rec-ai-value', aiValues.get(r.id)));
        else if (idx <= calcIndex + 1 && calcIndex >= -1 && aiCol.running) {
          const c = node('span', 'bui-rec-calc');
          c.append(node('span', 'bui-rec-muted', 'Calculando…'), node('span', 'bui-rec-pulse'));
          td.append(c);
        } else td.append(node('span', 'bui-rec-muted', '—'));
        tr.append(td);
      }
      if (ai) tr.append(node('td', 'bui-rec-td is-add'));
      tbody.append(tr);
    });
    const tfoot = node('tfoot');
    const fr = node('tr');
    const first = node('td', 'bui-rec-td is-sticky bui-rec-foot');
    first.append(node('span', 'bui-rec-muted', selected.size ? `${selected.size} de ${rows.length} selecionados` : `${rows.length} ${footerLabel}`));
    fr.append(first);
    for (let k = 1; k < columns.length + (aiCol ? 1 : 0) + (ai ? 1 : 0); k++) fr.append(node('td', 'bui-rec-td bui-rec-foot'));
    tfoot.append(fr);
    table.replaceChildren(thead, tbody, tfoot);
  }
  function addAi() {
    const label = ai.label || 'IA';
    aiCol = { label, running: true };
    calcIndex = -1;
    paint();
    (async () => {
      for (const r of rows) {
        let v = '';
        try { v = await ai.compute(r); } catch { v = '—'; }
        aiValues.set(r.id, v);
        calcIndex++;
        if (!el.isConnected) break;
        paint();
      }
      aiCol.running = false;
      paint();
    })();
  }
  paint();
  return { el, setRows(next) { rows = next; selected.clear(); paint(); }, get selected() { return [...selected]; }, destroy() {} };
}
