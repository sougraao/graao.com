import { tr } from './i18n.js';
// graao icon system — vanilla ports of lucide-animated (https://lucide-animated.com, MIT).
// Every icon inherits currentColor so light mode, dark mode and user brand colors work everywhere.
// Sub-elements carry semantic classes animated by lucide-animated.css + the delegated trigger in graao.js.

const defs = {
  // ── Theme & Navigation ────────────────────────────────────────────────────
  sun: {
    k: 'sun',
    body: `<circle cx="12" cy="12" r="4"/>`
      + `<path class="la-ray la-r1" d="M12 2v2"/>`
      + `<path class="la-ray la-r2" d="m19.07 4.93-1.41 1.41"/>`
      + `<path class="la-ray la-r3" d="M20 12h2"/>`
      + `<path class="la-ray la-r4" d="m17.66 17.66 1.41 1.41"/>`
      + `<path class="la-ray la-r5" d="M12 20v2"/>`
      + `<path class="la-ray la-r6" d="m6.34 17.66-1.41 1.41"/>`
      + `<path class="la-ray la-r7" d="M2 12h2"/>`
      + `<path class="la-ray la-r8" d="m4.93 4.93 1.41 1.41"/>`
  },
  moon: {
    k: 'moon',
    body: `<path class="la-body" d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`
  },
  updown: {
    k: 'chevrons-up-down',
    body: `<path class="la-down" d="m7 15 5 5 5-5"/><path class="la-up" d="m7 9 5-5 5 5"/>`
  },
  panel: {
    k: 'panel-left-open',
    body: `<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path class="la-chev" d="m14 9 3 3-3 3"/>`
  },
  panelClose: {
    k: 'panel-left-close',
    body: `<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path class="la-chev" d="m16 15-3-3 3-3"/>`
  },
  sidebar: {
    k: 'panel-left-open',
    body: `<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path class="la-chev" d="m14 9 3 3-3 3"/>`
  },
  home: {
    k: 'house',
    body: `<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>`
  },
  logout: {
    k: 'logout',
    body: `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>`
  },
  menu: {
    k: 'menu',
    body: `<line class="la-l1" x1="4" x2="20" y1="6" y2="6"/><line class="la-l2" x1="4" x2="20" y1="12" y2="12"/><line class="la-l3" x1="4" x2="20" y1="18" y2="18"/>`
  },

  // ── Core Modules ──────────────────────────────────────────────────────────
  spark: {
    k: 'sparkles',
    body: `<path class="la-spark" d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>`
      + `<g class="la-twinkle"><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></g>`
  },
  grid: {
    k: 'layout-grid',
    body: `<rect class="la-q1" width="7" height="7" x="3" y="3" rx="1"/>`
      + `<rect class="la-q2" width="7" height="7" x="14" y="3" rx="1"/>`
      + `<rect class="la-q3" width="7" height="7" x="14" y="14" rx="1"/>`
      + `<rect class="la-q4" width="7" height="7" x="3" y="14" rx="1"/>`
  },
  chat: {
    k: 'message-circle',
    body: `<path class="la-body" d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>`
  },
  temporary: {
    k: 'message-circle-dashed',
    body: `<path class="la-seg la-s1" d="M13.5 3.1c-.5 0-1-.1-1.5-.1s-1 .1-1.5.1"/>`
      + `<path class="la-seg la-s2" d="M19.3 6.8a10.45 10.45 0 0 0-2.1-2.1"/>`
      + `<path class="la-seg la-s3" d="M20.9 13.5c.1-.5.1-1 .1-1.5s-.1-1-.1-1.5"/>`
      + `<path class="la-seg la-s4" d="M17.2 19.3a10.45 10.45 0 0 0 2.1-2.1"/>`
      + `<path class="la-seg la-s5" d="M10.5 20.9c.5.1 1 .1 1.5.1s1-.1 1.5-.1"/>`
      + `<path class="la-seg la-s6" d="M3.5 17.5 2 22l4.5-1.5"/>`
      + `<path class="la-seg la-s7" d="M3.1 10.5c0 .5-.1 1-.1 1.5s.1 1 .1 1.5"/>`
      + `<path class="la-seg la-s8" d="M6.8 4.7a10.45 10.45 0 0 0-2.1 2.1"/>`
  },
  cal: {
    k: 'calendar-days',
    body: `<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>`
      + `<circle class="la-dot la-d1" cx="8" cy="14" r="1" fill="currentColor" stroke="none"/>`
      + `<circle class="la-dot la-d2" cx="12" cy="14" r="1" fill="currentColor" stroke="none"/>`
      + `<circle class="la-dot la-d3" cx="16" cy="14" r="1" fill="currentColor" stroke="none"/>`
      + `<circle class="la-dot la-d4" cx="8" cy="18" r="1" fill="currentColor" stroke="none"/>`
      + `<circle class="la-dot la-d5" cx="12" cy="18" r="1" fill="currentColor" stroke="none"/>`
      + `<circle class="la-dot la-d6" cx="16" cy="18" r="1" fill="currentColor" stroke="none"/>`
  },
  contacts: {
    k: 'id-card',
    body: `<rect width="20" height="14" x="2" y="5" rx="2"/>`
      + `<circle class="la-draw la-d1" cx="9" cy="11" r="2" pathLength="1"/>`
      + `<path class="la-draw la-d2" d="M6.17 15a3 3 0 0 1 5.66 0" pathLength="1"/>`
      + `<path class="la-draw la-d3" d="M16 10h2" pathLength="1"/>`
      + `<path class="la-draw la-d4" d="M16 14h2" pathLength="1"/>`
  },
  leads: {
    k: 'git-fork',
    body: `<circle class="la-draw la-d1" cx="12" cy="18" r="3" pathLength="1"/>`
      + `<path class="la-draw la-d2" d="M12 12v3" pathLength="1"/>`
      + `<path class="la-draw la-d2" d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" pathLength="1"/>`
      + `<circle class="la-draw la-d3" cx="6" cy="6" r="3" pathLength="1"/>`
      + `<circle class="la-draw la-d3" cx="18" cy="6" r="3" pathLength="1"/>`
  },
  pay: {
    k: 'receipt',
    body: `<path d="M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z"/>`
      + `<path class="la-draw la-d1" d="M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8" pathLength="1"/>`
      + `<path class="la-draw la-d2" d="M12 17V7" pathLength="1"/>`
  },
  palette: {
    k: 'palette',
    body: `<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.563-2.512 5.563-5.563C22 6.5 17.5 2 12 2z"/>`
  },
  prancheta: {
    k: 'palette',
    body: `<rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/><path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  },
  studio: {
    k: 'layers',
    body: `<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/>`
      + `<path class="la-mid" d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>`
      + `<path class="la-bot" d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/>`
  },
  send: {
    k: 'send',
    body: `<g class="la-plane"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></g>`
      + `<path class="la-trail" d="M2 22c2-1.2 3.8-3 5-5.2" stroke-dasharray="2 2" stroke-width="1.2" pathLength="1"/>`
  },
  flow: {
    k: 'workflow',
    body: `<rect class="la-draw la-d1" width="8" height="8" x="3" y="3" rx="2" pathLength="1"/>`
      + `<path class="la-draw la-d2" d="M7 11v4a2 2 0 0 0 2 2h4" pathLength="1"/>`
      + `<rect class="la-draw la-d3" width="8" height="8" x="13" y="13" rx="2" pathLength="1"/>`
  },
  site: {
    k: 'layout-panel-top',
    body: `<rect class="la-top" width="18" height="7" x="3" y="3" rx="1"/>`
      + `<rect class="la-left" width="7" height="7" x="3" y="14" rx="1"/>`
      + `<rect class="la-right" width="7" height="7" x="14" y="14" rx="1"/>`
  },
  play: {
    k: 'play',
    body: `<polygon class="la-tri" points="6 3 20 12 6 21 6 3"/>`
  },
  folder: {
    k: 'folder-open',
    body: `<path class="la-body" d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>`
  },
  award: {
    k: 'award',
    body: `<path class="la-ribbon" d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/>`
      + `<circle class="la-medal" cx="12" cy="8" r="6"/>`
  },
  chart: {
    k: 'chart-column',
    body: `<path d="M3 3v16a2 2 0 0 0 2 2h16"/>`
      + `<path class="la-draw la-b1" d="M8 17v-3" pathLength="1"/>`
      + `<path class="la-draw la-b2" d="M13 17V9" pathLength="1"/>`
      + `<path class="la-draw la-b3" d="M18 17V5" pathLength="1"/>`
  },
  apps: {
    k: 'blocks',
    body: `<path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"/>`
      + `<path class="la-block" d="M14 3h7v7h-7z"/>`
  },
  gear: {
    k: 'settings',
    body: `<g class="la-spin"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></g>`
  },
  search: {
    k: 'search',
    body: `<g class="la-body"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></g>`
  },
  pin: {
    k: 'map-pin',
    body: `<g class="la-pin"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle class="la-draw" cx="12" cy="10" r="3" pathLength="1"/></g>`
  },
  bolt: {
    k: 'zap',
    body: `<path class="la-draw" d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" pathLength="1"/>`
  },
  lang: {
    k: 'languages',
    body: `<path class="la-draw la-d1" d="M7 2h1" pathLength="1"/>`
      + `<path class="la-draw la-d2" d="M2 5h12" pathLength="1"/>`
      + `<path class="la-draw la-d3" d="m4 14 6-6 3-3" pathLength="1"/>`
      + `<path class="la-draw la-d4" d="m5 8 6 6" pathLength="1"/>`
      + `<path class="la-draw la-d4" d="m22 22-5-10-5 10" pathLength="1"/>`
      + `<path class="la-draw la-d4" d="M14 18h6" pathLength="1"/>`
  },
  phone: {
    k: 'phone',
    body: `<path class="la-body" d="M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"/>`
  },
  meg: {
    k: 'radio-tower',
    body: `<path class="la-w2" d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9"/>`
      + `<path class="la-w1" d="M7.8 4.7a6.14 6.14 0 0 0-.8 7.5"/>`
      + `<circle cx="12" cy="9" r="2"/>`
      + `<path class="la-w1" d="M16.2 4.8c2 2 2.26 5.11.8 7.47"/>`
      + `<path class="la-w2" d="M19.1 1.9a9.96 9.96 0 0 1 0 14.1"/>`
      + `<path d="M9.5 18h5"/><path d="m8 22 4-11 4 11"/>`
  },
  bell: {
    k: 'bell',
    body: `<g class="la-body"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></g>`
  },
  help: {
    k: 'circle-help',
    body: `<circle cx="12" cy="12" r="10"/><g class="la-q"><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></g>`
  },
  lock: {
    k: 'lock',
    body: `<g class="la-body"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path class="la-shackle" d="M7 11V7a5 5 0 0 1 10 0v4" pathLength="1"/></g>`
  },

  // ── Arrows, Chevrons & Actions ────────────────────────────────────────────
  arrow: {
    k: 'arrow-right',
    body: `<path class="la-shaft" d="M5 12h14"/><path class="la-head" d="m12 5 7 7-7 7"/>`
  },
  arrowUp: {
    k: 'arrow-up',
    body: `<path class="la-shaft" d="M12 19V5"/><path class="la-head" d="m5 12 7-7 7 7"/>`
  },
  arrowDown: {
    k: 'arrow-down',
    body: `<path class="la-shaft" d="M12 5v14"/><path class="la-head" d="m19 12-7 7-7-7"/>`
  },
  plus: {
    k: 'plus',
    body: `<g class="la-spin"><path d="M5 12h14"/><path d="M12 5v14"/></g>`
  },
  logout: {
    k: 'log-out',
    body: `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><g class="la-fwd"><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></g>`
  },
  close: {
    k: 'x',
    body: `<path class="la-draw la-x1" d="M18 6 6 18" pathLength="1"/><path class="la-draw la-x2" d="m6 6 12 12" pathLength="1"/>`
  },
  chevron: {
    k: 'chevron-down',
    body: `<path class="la-chev" d="m6 9 6 6 6-6"/>`
  },
  left: {
    k: 'chevron-left',
    body: `<path class="la-chev" d="m15 18-6-6 6-6"/>`
  },
  right: {
    k: 'chevron-right',
    body: `<path class="la-chev" d="m9 18 6-6-6-6"/>`
  },
  undo: {
    k: 'undo',
    body: `<path class="la-chev" d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>`
  },
  redo: {
    k: 'redo',
    body: `<path class="la-chev" d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>`
  },
  dots: {
    k: 'dots',
    body: `<circle class="la-dot la-d1" cx="5" cy="12" r="1.25" fill="currentColor" stroke="none"/>`
      + `<circle class="la-dot la-d2" cx="12" cy="12" r="1.25" fill="currentColor" stroke="none"/>`
      + `<circle class="la-dot la-d3" cx="19" cy="12" r="1.25" fill="currentColor" stroke="none"/>`
  },
  check: {
    k: 'check',
    body: `<path class="la-draw" d="M4 12 9 17 20 6" pathLength="1"/>`
  },
  star: {
    k: 'star',
    body: `<polygon class="la-body" points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>`
  },
  filter: {
    k: 'filter',
    body: `<polygon class="la-body" points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>`
  },
  download: {
    k: 'download',
    body: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><g class="la-arrow"><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></g>`
  },
  upload: {
    k: 'upload',
    body: `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><g class="la-arrow"><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></g>`
  },
  external: {
    k: 'external-link',
    body: `<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><g class="la-arrow"><path d="M15 3h6v6"/><path d="M10 14 21 3"/></g>`
  },
  mail: {
    k: 'mail',
    body: `<rect width="20" height="16" x="2" y="4" rx="2"/><path class="la-flap" d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>`
  },
  list: {
    k: 'align-left',
    body: `<line class="la-l1" x1="3" x2="21" y1="6" y2="6"/><line class="la-l2" x1="3" x2="15" y1="12" y2="12"/><line class="la-l3" x1="3" x2="17" y1="18" y2="18"/>`
  },
  edit: {
    k: 'square-pen',
    body: `<path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path class="la-pen" d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/>`
  },
  inbox: {
    k: 'mailbox',
    body: `<path d="M22 17a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5C2 7 4 5 6.5 5H18c2.2 0 4 1.8 4 4v8Z"/>`
      + `<path class="la-flag" d="M18 11V9H15"/>`
      + `<path d="M6.5 5C9 5 11 7 11 9.5V17a2 2 0 0 1-2 2"/><line x1="6" x2="7" y1="10" y2="10"/>`
  },
  trash: {
    k: 'delete',
    body: `<g class="la-lid"><path d="M3 6h18"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></g>`
      + `<g class="la-bin"><path d="M19 8v12c0 1-1 2-2 2H7c-1 0-2-1-2-2V8"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></g>`
  },
  sort: {
    k: 'sort',
    body: `<g class="la-up"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/></g><g class="la-down"><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></g>`
  },
  clock: {
    k: 'clock',
    body: `<circle cx="12" cy="12" r="10"/><line class="la-hour" x1="12" x2="12" y1="12" y2="6"/><line class="la-min" x1="12" x2="16" y1="12" y2="12"/>`
  },

  // ── Studio, Devices, CRM & Utilities ──────────────────────────────────────
  cursor: {
    k: 'cursor-click',
    body: `<path class="la-ptr" d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/>`
      + `<path class="la-ray la-c1" d="M14 4.1 12 6"/>`
      + `<path class="la-ray la-c2" d="m5.1 8-2.9-.8"/>`
      + `<path class="la-ray la-c3" d="m6 12-1.9 2"/>`
      + `<path class="la-ray la-c4" d="M7.2 2.2 8 5.1"/>`
  },
  hand: {
    k: 'hand',
    body: `<g class="la-body"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></g>`
  },
  tablet: {
    k: 'device',
    body: `<g class="la-body"><rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><line x1="12" x2="12.01" y1="18" y2="18"/></g>`
  },
  mobile: {
    k: 'device',
    body: `<g class="la-body"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></g>`
  },
  monitor: {
    k: 'monitor',
    body: `<rect class="la-screen" width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>`
  },
  refresh: {
    k: 'refresh-cw',
    body: `<g class="la-spin"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></g>`
  },
  retry: {
    k: 'rotate-ccw',
    body: `<g class="la-spin"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></g>`
  },
  sliders: {
    k: 'sliders-horizontal',
    body: `<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/>`
      + `<line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/>`
      + `<line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/>`
      + `<line class="la-k1" x1="14" x2="14" y1="2" y2="6"/>`
      + `<line class="la-k2" x1="8" x2="8" y1="10" y2="14"/>`
      + `<line class="la-k3" x1="16" x2="16" y1="18" y2="22"/>`
  },
  note: {
    k: 'file-text',
    body: `<g class="la-body"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>`
      + `<path class="la-draw la-l1" d="M10 9H8" pathLength="1"/>`
      + `<path class="la-draw la-l2" d="M16 13H8" pathLength="1"/>`
      + `<path class="la-draw la-l3" d="M16 17H8" pathLength="1"/></g>`
  },
  users: {
    k: 'users',
    body: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>`
      + `<g class="la-second"><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></g>`
  },
  box: {
    k: 'box',
    body: `<path class="la-draw la-d1" d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" pathLength="1"/>`
      + `<path class="la-draw la-d2" d="m3.3 7 8.7 5 8.7-5" pathLength="1"/>`
      + `<path class="la-draw la-d3" d="M12 22V12" pathLength="1"/>`
  },
  tag: {
    k: 'tag',
    body: `<g class="la-body"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/></g>`
  },
  gift: {
    k: 'gift',
    body: `<g class="la-lid"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2c0 1.5 1.5 2 4 4"/><path d="M12 8V4a2 2 0 0 1 2-2 2 2 0 0 1 2 2c0 1.5-1.5 2-4 4"/></g>`
      + `<path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M12 12v9"/>`
  },
  link: {
    k: 'link',
    body: `<path class="la-draw la-c1" d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" pathLength="1"/>`
      + `<path class="la-draw la-c2" d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" pathLength="1"/>`
  },
  book: {
    k: 'book-text',
    body: `<g class="la-body"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><path d="M8 11h8"/><path d="M8 7h6"/></g>`
  },
  bulb: {
    k: 'bulb',
    body: `<path class="la-glow" d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>`
      + `<path d="M9 18h6"/><path d="M10 22h4"/>`
  },
  alert: {
    k: 'badge-alert',
    body: `<g class="la-body"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></g>`
  },
  key: {
    k: 'key',
    body: `<g class="la-body"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/></g>`
  },
  pipette: {
    k: 'pipette',
    body: `<g class="la-body"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></g>`
  },

  // ── Graao Chat & Audio / Media Controls ────────────────────────────────────
  mic: {
    k: 'mic',
    body: `<path d="M12 19v3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><rect class="la-cap" width="6" height="13" x="9" y="2" rx="3"/>`
  },
  wave: {
    k: 'audio-lines',
    body: `<path d="M2 10v3"/>`
      + `<path class="la-bar la-b1" d="M6 6v11"/>`
      + `<path class="la-bar la-b2" d="M10 3v18"/>`
      + `<path class="la-bar la-b3" d="M14 8v7"/>`
      + `<path class="la-bar la-b4" d="M18 5v13"/>`
      + `<path d="M22 10v3"/>`
  },
  stop: {
    k: 'stop',
    body: `<rect class="la-body" x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>`
  },
  copy: {
    k: 'copy',
    body: `<rect class="la-front" width="14" height="14" x="8" y="8" rx="2" ry="2"/><path class="la-back" d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>`
  },
  thumbUp: {
    k: 'upvote',
    body: `<g class="la-body"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></g>`
  },
  thumbDown: {
    k: 'downvote',
    body: `<g class="la-body"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/></g>`
  },
  speaker: {
    k: 'volume',
    body: `<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>`
      + `<path class="la-w1" d="M16 9a5 5 0 0 1 0 6"/>`
      + `<path class="la-w2" d="M19.364 18.364a9 9 0 0 0 0-12.728"/>`
  },
  paperclip: {
    k: 'attach-file',
    body: `<path class="la-draw" d="M6 7.909V16a6 6 0 0 0 12 0V6a4 4 0 0 0-8 0v9.182a2 2 0 0 0 4 0V8" pathLength="1"/>`
  }
};

// Semantic aliases used across graao-chat and platform modules
const aliases = {
  settings: 'gear',
  newChat: 'edit',
  chevronLeft: 'left',
  chevronRight: 'right',
  chevronDown: 'chevron',
  more: 'dots',
  file: 'note'
};

// WhatsApp brand glyph (Bootstrap Icons MIT), animated cleanly with la-icon
const whatsappIcon = (size, extraClass = '') => {
  const cls = `la-icon la-whatsapp whatsapp-icon${extraClass ? ` ${extraClass}` : ''}`;
  return `<svg class="${cls}" data-la="whatsapp" width="${size}" height="${size}" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path class="la-body" d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/></svg>`;
};

export const icon = (name, size = 18, extraClass = '') => {
  if (name === 'whatsapp') return whatsappIcon(size, extraClass);
  const resolved = aliases[name] || name;
  const def = defs[resolved] || defs.grid;
  const cls = `la-icon la-${def.k}${extraClass ? ` ${extraClass}` : ''}`;
  return `<svg class="${cls}" data-la="${def.k}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${def.body}</svg>`;
};

// Social & platform brand marks (Microkit Social Highlight Cards × Graao).
// Every mark inherits currentColor so resting silhouettes and luminous brand glows work in light & dark mode.
const brandMarks = {
  facebook: {
    highlight: '#1877f2',
    body: `<path fill="currentColor" d="M13.5 21v-7.6h2.6l.4-3h-3V8.5c0-.87.24-1.46 1.5-1.46h1.6V4.36c-.28-.04-1.23-.12-2.34-.12-2.31 0-3.9 1.41-3.9 4v2.16H7.8v3h2.56V21h3.14Z"/>`
  },
  instagram: {
    highlight: '#e4405f',
    body: `<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.4" cy="6.6" r="1.2" fill="currentColor"/>`
  },
  linkedin: {
    highlight: '#0a66c2',
    body: `<path fill="currentColor" d="M5.1 3.5a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2ZM3.3 8.9h3.6V20H3.3V8.9Zm5.8 0h3.4v1.5h.1c.5-.9 1.6-1.9 3.5-1.9 3.7 0 4.4 2.4 4.4 5.6V20h-3.6v-5.1c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V20H9.1V8.9Z"/>`
  },
  tiktok: {
    highlight: 'var(--shc-mono)',
    body: `<path fill="currentColor" d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48Z"/>`
  },
  youtube: {
    highlight: '#ff0033',
    body: `<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M21.58 7.19a2.51 2.51 0 0 0-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42a2.51 2.51 0 0 0-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81a2.51 2.51 0 0 0 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42a2.51 2.51 0 0 0 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81ZM10 15V9l5.2 3-5.2 3Z"/>`
  },
  pinterest: {
    highlight: '#e60023',
    body: `<path fill="currentColor" d="M12.02 2C6.49 2 2 6.49 2 12.02c0 4.24 2.64 7.87 6.36 9.32-.09-.79-.17-2.01.04-2.87.18-.78 1.18-5.02 1.18-5.02s-.3-.6-.3-1.5c0-1.4.81-2.45 1.83-2.45.86 0 1.28.65 1.28 1.42 0 .87-.55 2.16-.84 3.36-.24 1 .5 1.82 1.49 1.82 1.79 0 3.17-1.89 3.17-4.61 0-2.41-1.73-4.1-4.21-4.1-2.87 0-4.55 2.15-4.55 4.38 0 .87.33 1.8.75 2.3.08.1.09.19.07.29-.08.32-.25 1-.28 1.14-.04.19-.15.23-.34.14-1.25-.58-2.03-2.41-2.03-3.88 0-3.16 2.3-6.06 6.62-6.06 3.48 0 6.18 2.48 6.18 5.79 0 3.45-2.18 6.23-5.2 6.23-1.02 0-1.97-.53-2.3-1.15l-.62 2.38c-.23.87-.84 1.97-1.25 2.64.94.29 1.94.45 2.97.45 5.53 0 10.02-4.49 10.02-10.02C22.04 6.49 17.55 2 12.02 2Z"/>`
  },
  threads: {
    highlight: 'var(--shc-mono)',
    body: `<path fill="currentColor" d="M16.29 11.17c-.08-.04-.17-.08-.26-.11-.15-2.8-1.68-4.4-4.25-4.42h-.04c-1.54 0-2.82.66-3.61 1.85l1.46 1c.61-.92 1.56-1.12 2.15-1.12h.03c.85.01 1.49.25 1.9.74.3.35.5.84.6 1.45-.75-.13-1.56-.17-2.43-.12-2.44.14-4.01 1.56-3.9 3.54.05.99.55 1.85 1.4 2.41.72.47 1.64.7 2.6.65 1.27-.07 2.27-.56 2.96-1.44.52-.67.85-1.53 1.01-2.62.6.36 1.05.84 1.3 1.42.42.98.45 2.59-.87 3.91-1.16 1.16-2.55 1.66-4.65 1.67-2.34-.02-4.1-.77-5.25-2.23-1.08-1.37-1.64-3.32-1.66-5.78.02-2.46.58-4.41 1.66-5.78 1.15-1.46 2.91-2.21 5.25-2.23 2.35.02 4.14.77 5.33 2.24.58.72 1.02 1.63 1.31 2.7l1.73-.46c-.35-1.33-.9-2.47-1.66-3.4-1.54-1.91-3.79-2.89-6.69-2.91h-.02c-2.9.02-5.12 1-6.64 2.91C3.57 6.3 2.93 8.63 2.9 11.49v.02c.03 2.86.67 5.19 2.02 6.89 1.52 1.91 3.74 2.89 6.64 2.91h.02c2.58-.02 4.41-.69 5.93-2.21 1.97-1.97 1.91-4.44 1.26-5.95-.46-1.07-1.34-1.95-2.48-2.48Zm-4.12 4.35c-1.07.06-2.18-.42-2.24-1.45-.04-.76.54-1.61 2.29-1.71.2-.01.39-.02.58-.02.63 0 1.21.06 1.75.18-.2 2.48-1.36 2.94-2.38 3Z"/>`
  },
  bluesky: {
    highlight: '#1185fe',
    body: `<path fill="currentColor" d="M5.77 4.44C8.26 6.31 10.94 10.1 12 12.29c1.06-2.19 3.74-5.98 6.23-7.85C20.08 3.05 23 1.98 23 5.34c0 .67-.38 5.64-.61 6.45-.78 2.81-3.64 3.53-6.18 3.1 4.44.76 5.57 3.26 3.13 5.76-4.63 4.75-6.65-1.19-7.17-2.71-.1-.28-.14-.41-.17-.41-.03 0-.07.13-.17.41-.52 1.52-2.54 7.46-7.17 2.71-2.44-2.5-1.31-5 3.13-5.76-2.54.43-5.4-.29-6.18-3.1C1.38 10.98 1 6.01 1 5.34c0-3.36 2.92-2.29 4.77-.9Z"/>`
  },
  gbp: {
    highlight: '#34a853',
    body: `<path fill="currentColor" d="M21.35 11.1h-9.18v2.92h5.27c-.24 1.48-1.6 4.35-5.27 4.35-3.17 0-5.76-2.62-5.76-5.87s2.59-5.87 5.76-5.87c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.79 4.1 14.68 3.17 12.17 3.17 7.1 3.17 3 7.27 3 12.33s4.1 9.17 9.17 9.17c5.29 0 8.8-3.72 8.8-8.95 0-.6-.06-1.06-.15-1.45Z"/>`
  },
  whatsapp: {
    highlight: 'var(--shc-whatsapp)',
    whatsapp: true
  },
  openai: {
    highlight: '#10a37f',
    body: `<path fill="currentColor" d="M20.23 9.88a4.96 4.96 0 0 0-.43-4.08 5.02 5.02 0 0 0-5.4-2.4A5.02 5.02 0 0 0 5.83 5.2a4.96 4.96 0 0 0-3.32 2.41 5.02 5.02 0 0 0 .62 5.89 4.96 4.96 0 0 0 .43 4.08 5.02 5.02 0 0 0 5.4 2.4 4.96 4.96 0 0 0 3.74 1.66 5.02 5.02 0 0 0 4.8-3.48 4.96 4.96 0 0 0 3.33-2.41 5.02 5.02 0 0 0-.6-5.87Zm-7.53 10.45a3.73 3.73 0 0 1-2.4-.87l.12-.07 3.98-2.3a.65.65 0 0 0 .33-.56v-5.62l1.68.97a.06.06 0 0 1 .03.05v4.65a3.74 3.74 0 0 1-3.74 3.75Zm-8.04-3.43a3.72 3.72 0 0 1-.45-2.51l.12.07 3.98 2.3a.65.65 0 0 0 .65 0l4.86-2.81v1.94a.06.06 0 0 1-.02.05l-4.03 2.33a3.74 3.74 0 0 1-5.11-1.37Zm-1.05-8.68a3.73 3.73 0 0 1 1.95-1.64v4.73a.65.65 0 0 0 .32.56l4.86 2.81-1.68.97a.06.06 0 0 1-.06 0L4.98 13.3a3.74 3.74 0 0 1-1.37-5.08Zm13.84 3.22-4.86-2.81 1.68-.97a.06.06 0 0 1 .06 0l4.02 2.32a3.74 3.74 0 0 1-.58 6.75v-4.73a.65.65 0 0 0-.32-.56Zm1.67-2.52-.12-.07-3.98-2.3a.65.65 0 0 0-.65 0L9.51 9.36V7.42a.06.06 0 0 1 .03-.05l4.02-2.32a3.74 3.74 0 0 1 5.56 3.87Zm-10.52 3.46-1.68-.97a.06.06 0 0 1-.03-.05V6.71a3.74 3.74 0 0 1 6.13-2.88l-.12.07-3.98 2.3a.65.65 0 0 0-.32.56v5.62Zm.91-1.97 2.16-1.25 2.17 1.25v2.5l-2.17 1.25-2.16-1.25v-2.5Z"/>`
  },
  abacatepay: {
    highlight: '#7cb342',
    body: `<path fill="currentColor" opacity=".55" d="M12 2.4c-2.5 0-4.1 2.4-4.7 5.2-.3 1.4-1.2 2.5-2 3.8A7.3 7.3 0 0 0 12 21.6a7.3 7.3 0 0 0 6.7-10.2c-.8-1.3-1.7-2.4-2-3.8-.6-2.8-2.2-5.2-4.7-5.2Z"/><circle cx="12" cy="14.7" r="3.3" fill="currentColor"/>`
  },
  meta: {
    highlight: '#0081fb',
    body: `<path fill="currentColor" d="M17.1 5.5c-2.06 0-3.53 1.45-4.7 3.47-1.15-2.02-2.6-3.47-4.65-3.47C4.52 5.5 2 8.79 2 13.08c0 3.24 1.69 5.42 4.35 5.42 2.02 0 3.42-1.16 5.14-4.08l.51-.87.52.87c1.73 2.92 3.12 4.08 5.14 4.08 2.66 0 4.34-2.18 4.34-5.42 0-4.29-2.52-7.58-4.9-7.58ZM6.57 16.05c-1.28 0-2.12-1.1-2.12-2.97 0-2.66 1.38-5.12 3.27-5.12 1.24 0 2.28 1.17 3.35 3.18l-1.08 1.84c-1.37 2.33-2.23 3.07-3.42 3.07Zm10.86 0c-1.18 0-2.05-.74-3.42-3.07l-1.08-1.84c1.07-2.01 2.11-3.18 3.35-3.18 1.9 0 3.27 2.46 3.27 5.12 0 1.87-.84 2.97-2.12 2.97Z"/>`
  },
  'google-analytics': {
    highlight: '#f59e0b',
    body: `<rect x="16" y="3" width="4.5" height="18" rx="2.25" fill="currentColor"/><rect x="9.75" y="9" width="4.5" height="12" rx="2.25" fill="currentColor" opacity=".82"/><circle cx="5.75" cy="18.75" r="2.25" fill="currentColor" opacity=".68"/>`
  },
  'google-ads': {
    highlight: '#4285f4',
    body: `<path fill="currentColor" d="M15.86 3.6a2.35 2.35 0 0 0-3.21.86L5.6 16.65a2.35 2.35 0 1 0 4.07 2.35l7.05-12.19a2.35 2.35 0 0 0-.86-3.21Z" opacity=".78"/><path fill="currentColor" d="M18.4 16.65 14.34 9.6l-2.35 4.07 2.34 4.07a2.35 2.35 0 0 0 4.07-1.09Z"/><circle cx="7.64" cy="17.83" r="2.35" fill="currentColor"/>`
  },
  twilio: {
    highlight: '#f22f46',
    body: `<path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2.7a7.3 7.3 0 1 0 0 14.6 7.3 7.3 0 0 0 0-14.6Zm-2.6 2.8a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8Zm5.2 0a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8Zm-5.2 5.2a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8Zm5.2 0a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8Z"/>`
  },
  'google-calendar': { highlight: '#4285f4', fallbackIcon: 'cal' },
  email: { highlight: 'var(--g-brand)', fallbackIcon: 'mail' }
};

const brandAliases = {
  'meta-ads': 'meta',
  'Meta Ads': 'meta',
  'Meta': 'meta',
  'Google Analytics': 'google-analytics',
  'Google Business Profile': 'gbp',
  'Perfil da Empresa no Google': 'gbp',
  'Google Ads': 'google-ads',
  'Google Agenda': 'google-calendar',
  'Entrega de e-mail': 'email',
  'Provedor de e-mail': 'email',
  'AbacatePay': 'abacatepay',
  'Twilio': 'twilio',
  'WhatsApp': 'whatsapp',
  'OpenAI': 'openai'
};

export const brandHighlight = id => {
  const key = brandAliases[id] || id;
  return brandMarks[key]?.highlight || 'var(--g-brand)';
};

export const brandIcon = (id, size = 28, extraClass = '') => {
  const key = brandAliases[id] || id;
  const mark = brandMarks[key];
  if (!mark) return icon('external', size, extraClass);
  if (mark.whatsapp) return whatsappIcon(size, extraClass);
  if (mark.fallbackIcon) return icon(mark.fallbackIcon, size, extraClass);
  const cls = `shc-svg${extraClass ? ` ${extraClass}` : ''}`;
  return `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${mark.body}</svg>`;
};

export const shcLayers = () => `<span class="shc-glow" aria-hidden="true"></span><span class="shc-beam" aria-hidden="true"></span>`;

export const logo=`<svg class="g-mark" width="36" height="36" viewBox="0 0 1000 1000" aria-hidden="true" fill="none"><defs><linearGradient id="g-flame-grad" x1="15%" y1="90%" x2="85%" y2="10%"><stop offset="0%" stop-color="var(--g-brand,#ff4f9a)"/><stop offset="100%" stop-color="var(--g-brand-2,#c4a7ff)"/></linearGradient></defs><g class="sk-root"><g class="sk-fr sk-f1"><path class="sk-flame" fill="url(#g-flame-grad)" d="M 701.65 68.47 C 703.83 71.75 703.83 71.75 703.97 74.76 C 701.37 82.27 693.87 86.07 687.57 90.40 C 677.14 97.58 667.95 105.43 659.01 114.39 C 658.03 115.36 657.04 116.33 656.02 117.34 C 633.74 140.51 618.97 170.98 619.43 203.23 C 619.97 220.12 627.59 234.76 639.77 246.25 C 644.97 250.73 650.93 254.13 656.83 257.60 C 679.07 271.01 695.03 287.84 701.65 313.35 C 706.95 343.05 696.83 368.35 680.29 392.24 C 679.06 394.01 677.82 395.78 676.58 397.55 C 666.98 411.39 661.51 424.03 663.39 441.26 C 665.31 449.06 668.84 455.55 675.43 460.36 C 683.42 465.11 691.47 465.29 700.55 464.21 C 707.42 462.41 712.04 458.05 715.86 452.19 C 719.66 445.57 720.74 438.65 721.80 431.21 C 725.41 406.01 736.87 383.64 757.40 368.01 C 769.02 360.26 783.83 351.65 798.26 352.91 C 802.22 353.80 802.22 353.80 804.48 355.10 C 806.06 358.16 805.15 360.31 804.41 363.64 C 803.39 366.32 802.33 368.93 801.20 371.56 C 792.27 393.38 794.32 415.54 802.97 437.16 C 807.53 447.49 813.65 457.09 819.41 466.78 C 825.07 476.30 830.45 485.83 835.02 495.92 C 835.18 496.27 835.18 496.27 836.00 498.04 C 855.01 539.80 858.65 588.91 843.76 632.57 C 841.21 639.29 838.19 645.79 835.02 652.25 C 834.48 653.36 833.94 654.47 833.38 655.61 C 826.73 668.50 817.73 680.11 807.69 690.51 C 807.12 691.10 806.55 691.69 805.96 692.30 C 798.72 699.80 791.37 706.89 783.19 713.38 C 756.93 734.42 741.46 760.64 732.33 792.65 C 725.78 815.48 716.26 836.46 700.55 854.49 C 699.77 855.40 698.98 856.30 698.17 857.24 C 695.72 860.00 693.23 862.72 690.72 865.42 C 689.99 866.22 689.27 867.01 688.52 867.83 C 672.51 884.72 651.76 896.70 630.59 905.87 C 629.88 906.18 629.17 906.48 628.44 906.80 C 595.36 920.85 560.28 921.91 525.09 917.28 C 513.72 915.81 502.52 915.38 491.07 915.37 C 490.69 915.37 490.69 915.37 488.75 915.36 C 474.04 915.32 459.57 916.56 445.29 920.22 C 444.37 920.44 443.45 920.67 442.50 920.90 C 437.09 922.24 431.69 923.62 426.29 925.00 C 423.21 925.79 420.13 926.57 417.05 927.35 C 414.82 927.92 412.58 928.50 410.35 929.08 C 367.85 940.00 324.66 936.30 286.23 914.62 C 276.10 908.37 267.33 901.07 258.90 892.75 C 258.43 892.29 258.43 892.29 256.03 889.93 C 237.80 870.95 228.00 846.70 223.20 821.15 C 220.13 804.96 211.25 792.10 200.87 779.66 C 196.09 773.93 191.94 767.80 187.84 761.57 C 187.16 760.55 186.49 759.53 185.79 758.48 C 162.55 722.17 142.13 677.13 141.66 633.31 C 141.65 632.47 141.64 631.62 141.63 630.75 C 141.45 612.43 141.34 594.60 146.30 576.81 C 146.56 575.87 146.83 574.92 147.10 573.94 C 156.90 539.96 175.66 510.36 198.77 483.89 C 199.73 482.73 200.69 481.56 201.65 480.39 C 204.43 477.10 207.46 474.58 210.80 471.87 C 212.63 470.05 214.45 468.23 216.26 466.40 C 222.55 460.41 229.00 454.82 235.87 449.52 C 243.20 443.86 250.00 437.79 256.71 431.42 C 257.48 430.72 258.25 430.02 259.05 429.30 C 275.13 414.20 284.82 393.91 294.43 374.43 C 310.96 340.98 334.18 312.85 370.11 299.85 C 377.83 297.42 385.21 295.27 393.36 295.86 C 396.03 297.50 396.03 297.50 397.74 299.14 C 397.13 304.47 395.37 308.64 392.95 313.35 C 385.62 328.41 383.38 344.26 387.83 360.54 C 389.37 364.64 391.51 367.97 394.12 371.47 C 395.55 373.48 395.55 373.48 396.64 376.76 C 398.42 377.78 398.42 377.78 401.02 378.94 C 404.71 381.13 404.71 381.13 406.51 382.22 C 414.97 386.50 424.52 386.93 433.69 384.75 C 442.31 381.58 448.83 376.35 453.41 368.36 C 459.03 356.19 458.92 343.20 454.73 330.59 C 452.17 324.35 449.01 318.40 445.94 312.42 C 430.98 283.10 423.11 253.70 433.00 221.20 C 441.79 194.21 457.57 171.35 477.07 151.00 C 478.51 149.50 479.93 147.99 481.36 146.47 C 488.59 138.97 496.54 132.64 504.87 126.41 C 505.48 125.95 506.10 125.49 506.73 125.01 C 524.95 111.39 544.66 100.44 565.00 90.34 C 565.89 89.89 566.79 89.44 567.72 88.98 C 592.75 76.66 619.49 68.57 646.99 64.10 C 648.23 63.88 649.47 63.66 650.75 63.44 C 666.15 61.73 687.85 60.00 701.65 68.47 Z"/><path class="sk-flame" fill="url(#g-flame-grad)" d="M 262.18 277.28 C 263.15 282.83 261.04 287.18 258.87 292.18 C 252.09 308.67 257.57 327.86 263.76 343.61 C 267.76 353.88 269.82 364.06 266.55 374.91 C 262.09 384.59 254.36 390.40 244.69 394.25 C 235.17 397.42 222.52 396.30 213.44 392.33 C 213.00 392.11 213.00 392.11 210.80 390.97 C 209.94 390.53 209.08 390.09 208.19 389.64 C 198.85 384.17 192.74 375.38 189.56 365.15 C 188.54 360.90 188.40 356.79 188.45 352.43 C 188.46 351.53 188.47 350.62 188.48 349.69 C 188.98 331.56 197.81 315.74 209.70 302.42 C 210.44 301.59 211.18 300.76 211.95 299.90 C 221.40 289.90 247.57 267.53 262.18 277.28 Z"/><path class="sk-flame" fill="url(#g-flame-grad)" d="M 741.82 180.53 C 759.52 188.13 773.42 201.97 780.77 219.75 C 785.70 232.56 785.25 248.24 780.64 261.06 C 778.51 265.86 776.02 269.93 772.71 274.00 C 772.40 274.37 772.40 274.37 770.88 276.27 C 763.30 284.74 751.93 290.75 740.57 291.71 C 732.72 291.86 727.10 290.44 720.44 286.29 C 716.26 281.99 714.60 277.39 714.36 271.47 C 714.67 263.62 717.48 256.71 720.46 249.52 C 728.50 230.02 731.72 209.84 723.51 189.82 C 723.15 189.10 722.79 188.38 722.42 187.63 C 721.81 181.90 721.81 181.90 723.99 178.95 C 729.87 176.52 736.02 178.48 741.82 180.53 Z"/></g><g class="sk-fr sk-f2"><path class="sk-flame" fill="url(#g-flame-grad)" d="M 756.39 54.41 C 758.66 57.81 758.66 57.81 758.83 60.94 C 756.12 68.72 748.45 72.66 741.88 77.14 C 730.79 84.58 720.62 92.71 710.25 101.99 C 709.09 103.00 707.92 104.00 706.71 105.05 C 679.10 129.03 655.10 160.53 644.32 193.84 C 638.84 211.27 641.37 226.37 649.70 238.21 C 653.46 242.83 658.34 246.33 663.15 249.91 C 681.42 263.72 692.92 281.04 694.05 307.28 C 695.05 337.79 683.05 363.74 666.09 388.23 C 664.88 390.04 663.66 391.85 662.45 393.67 C 653.26 407.83 648.43 420.76 651.51 438.38 C 654.07 446.35 658.17 452.97 665.20 457.88 C 673.63 462.73 681.70 462.91 690.67 461.81 C 697.38 459.98 701.59 455.53 704.89 449.54 C 708.13 442.78 708.66 435.71 709.18 428.11 C 711.49 402.33 722.68 379.42 743.63 363.40 C 755.67 355.45 771.11 346.61 785.44 347.91 C 789.33 348.82 789.33 348.82 791.49 350.15 C 792.85 353.29 791.80 355.50 790.86 358.91 C 789.70 361.66 788.52 364.34 787.29 367.04 C 778.08 389.40 780.78 412.08 790.77 434.19 C 796.16 444.74 803.12 454.55 809.78 464.43 C 816.35 474.15 822.67 483.86 828.22 494.14 C 828.41 494.50 828.41 494.50 829.40 496.30 C 852.02 538.77 858.15 588.53 843.77 632.55 C 841.21 639.29 838.19 645.79 835.02 652.25 C 834.48 653.36 833.94 654.47 833.38 655.61 C 826.73 668.50 817.73 680.11 807.69 690.51 C 807.12 691.10 806.55 691.69 805.96 692.30 C 798.72 699.80 791.37 706.89 783.19 713.38 C 756.93 734.42 741.46 760.64 732.33 792.65 C 725.78 815.48 716.26 836.46 700.55 854.49 C 699.77 855.40 698.98 856.30 698.17 857.24 C 695.72 860.00 693.23 862.72 690.72 865.42 C 689.99 866.22 689.27 867.01 688.52 867.83 C 672.51 884.72 651.76 896.70 630.59 905.87 C 629.88 906.18 629.17 906.48 628.44 906.80 C 595.36 920.85 560.28 921.91 525.09 917.28 C 513.72 915.81 502.52 915.38 491.07 915.37 C 490.69 915.37 490.69 915.37 488.75 915.36 C 474.04 915.32 459.57 916.56 445.29 920.22 C 444.37 920.44 443.45 920.67 442.50 920.90 C 437.09 922.24 431.69 923.62 426.29 925.00 C 423.21 925.79 420.13 926.57 417.05 927.35 C 414.82 927.92 412.58 928.50 410.35 929.08 C 367.85 940.00 324.66 936.30 286.23 914.62 C 276.10 908.37 267.33 901.07 258.90 892.75 C 258.43 892.29 258.43 892.29 256.03 889.93 C 237.80 870.95 228.00 846.70 223.20 821.15 C 220.13 804.96 211.25 792.10 200.87 779.66 C 196.09 773.93 191.94 767.80 187.84 761.57 C 187.16 760.55 186.49 759.53 185.79 758.48 C 162.55 722.17 142.13 677.13 141.67 633.29 C 141.66 632.45 141.65 631.60 141.64 630.72 C 141.38 612.28 140.98 594.29 145.39 576.29 C 145.61 575.34 145.84 574.38 146.07 573.39 C 153.92 538.93 170.22 508.84 190.80 481.88 C 191.64 480.70 192.49 479.51 193.33 478.32 C 195.79 474.96 198.58 472.39 201.65 469.63 C 203.31 467.77 204.95 465.91 206.59 464.05 C 212.32 457.93 218.26 452.23 224.67 446.82 C 231.53 441.03 237.85 434.83 244.10 428.32 C 244.83 427.61 245.55 426.89 246.30 426.15 C 261.53 410.71 270.64 389.94 280.42 369.98 C 299.29 335.66 326.67 306.76 365.21 293.40 C 373.47 290.90 381.33 288.69 389.35 289.29 C 391.65 290.98 391.65 290.98 392.99 292.67 C 391.25 298.15 388.66 302.43 385.35 307.28 C 375.55 322.75 371.36 339.03 374.46 355.73 C 375.77 359.94 377.74 363.35 380.21 366.94 C 381.57 369.00 381.57 369.00 382.57 372.37 C 384.33 373.41 384.33 373.41 386.90 374.60 C 390.55 376.85 390.55 376.85 392.34 377.96 C 400.76 382.35 410.31 382.79 419.49 380.55 C 428.15 377.31 434.77 371.95 439.63 363.75 C 445.96 351.27 447.01 337.94 444.35 324.99 C 442.71 318.58 440.51 312.47 438.51 306.32 C 430.06 276.16 430.65 245.89 451.49 212.38 C 469.89 184.53 493.57 160.91 519.48 139.88 C 521.36 138.32 523.22 136.76 525.08 135.19 C 534.36 127.43 543.91 120.88 553.69 114.44 C 554.40 113.96 555.12 113.48 555.86 112.99 C 576.70 98.89 597.99 87.55 619.31 77.08 C 620.23 76.62 621.17 76.15 622.13 75.67 C 647.61 62.90 674.23 54.52 701.51 49.88 C 702.74 49.65 703.97 49.43 705.23 49.20 C 720.51 47.42 742.08 45.63 756.39 54.41 Z"/><path class="sk-flame" fill="url(#g-flame-grad)" d="M 262.79 270.17 C 262.30 275.89 259.09 280.36 255.71 285.51 C 245.37 302.47 247.58 322.19 251.80 338.36 C 254.86 348.90 256.25 359.34 252.53 370.47 C 247.89 380.39 240.15 386.34 230.51 390.29 C 221.03 393.53 208.37 392.39 199.24 388.32 C 198.80 388.09 198.80 388.09 196.59 386.93 C 195.73 386.48 194.87 386.03 193.98 385.56 C 184.66 379.96 178.71 370.95 175.93 360.46 C 175.15 356.10 175.28 351.89 175.67 347.41 C 175.75 346.49 175.84 345.56 175.93 344.60 C 178.47 325.99 189.77 309.73 204.25 296.04 C 205.17 295.19 206.08 294.33 207.04 293.45 C 218.78 283.16 250.92 260.13 262.79 270.17 Z"/><path class="sk-flame" fill="url(#g-flame-grad)" d="M 774.71 170.40 C 789.77 178.25 798.76 192.54 799.77 210.89 C 800.23 224.10 794.54 240.26 785.91 253.47 C 782.35 258.41 778.68 262.61 774.22 266.80 C 773.81 267.18 773.81 267.18 771.77 269.13 C 761.96 277.85 749.11 284.04 737.52 285.02 C 729.63 285.18 724.35 283.72 718.71 279.45 C 715.63 275.02 715.18 270.29 716.58 264.19 C 719.17 256.11 724.08 248.99 729.33 241.58 C 743.91 221.48 754.24 200.66 753.16 179.99 C 753.06 179.25 752.95 178.51 752.84 177.73 C 754.23 171.81 754.23 171.81 757.42 168.77 C 764.13 166.25 769.62 168.28 774.71 170.40 Z"/></g><g class="sk-fr sk-f3"><path class="sk-flame" fill="url(#g-flame-grad)" d="M 708.20 76.90 C 709.45 80.11 709.45 80.11 708.75 83.05 C 704.09 90.40 695.57 94.12 688.13 98.35 C 675.87 105.38 664.77 113.06 653.78 121.83 C 652.58 122.78 651.38 123.73 650.14 124.72 C 623.35 147.40 604.33 177.25 602.43 208.86 C 602.58 225.43 610.30 239.80 622.81 251.07 C 628.19 255.47 634.31 258.81 640.39 262.22 C 663.47 275.39 680.76 291.92 689.85 316.99 C 698.37 346.21 690.98 371.11 676.81 394.65 C 675.74 396.39 674.66 398.14 673.58 399.88 C 665.14 413.52 660.61 425.99 663.56 442.99 C 665.89 450.69 669.71 457.10 676.49 461.85 C 684.66 466.54 692.71 466.72 701.76 465.65 C 708.56 463.87 713.01 459.56 716.58 453.78 C 720.06 447.24 720.77 440.41 721.38 433.07 C 723.14 408.22 732.57 386.17 751.51 370.78 C 762.31 363.15 776.19 354.67 790.76 355.91 C 794.81 356.79 794.81 356.79 797.22 358.07 C 799.13 361.08 798.45 363.20 798.06 366.48 C 797.33 369.11 796.54 371.68 795.68 374.27 C 788.89 395.77 792.81 417.62 802.91 438.94 C 808.03 449.14 814.58 458.62 820.70 468.19 C 826.64 477.59 832.22 487.01 836.93 496.99 C 837.09 497.33 837.09 497.33 837.93 499.08 C 856.77 540.42 859.44 589.14 843.80 632.58 C 841.21 639.29 838.19 645.79 835.02 652.25 C 834.48 653.36 833.94 654.47 833.38 655.61 C 826.73 668.50 817.73 680.11 807.69 690.51 C 807.12 691.10 806.55 691.69 805.96 692.30 C 798.72 699.80 791.37 706.89 783.19 713.38 C 756.93 734.42 741.46 760.64 732.33 792.65 C 725.78 815.48 716.26 836.46 700.55 854.49 C 699.77 855.40 698.98 856.30 698.17 857.24 C 695.72 860.00 693.23 862.72 690.72 865.42 C 689.99 866.22 689.27 867.01 688.52 867.83 C 672.51 884.72 651.76 896.70 630.59 905.87 C 629.88 906.18 629.17 906.48 628.44 906.80 C 595.36 920.85 560.28 921.91 525.09 917.28 C 513.72 915.81 502.52 915.38 491.07 915.37 C 490.69 915.37 490.69 915.37 488.75 915.36 C 474.04 915.32 459.57 916.56 445.29 920.22 C 444.37 920.44 443.45 920.67 442.50 920.90 C 437.09 922.24 431.69 923.62 426.29 925.00 C 423.21 925.79 420.13 926.57 417.05 927.35 C 414.82 927.92 412.58 928.50 410.35 929.08 C 367.85 940.00 324.66 936.30 286.23 914.62 C 276.10 908.37 267.33 901.07 258.90 892.75 C 258.43 892.29 258.43 892.29 256.03 889.93 C 237.80 870.95 228.00 846.70 223.20 821.15 C 220.13 804.96 211.25 792.10 200.87 779.66 C 196.09 773.93 191.94 767.80 187.84 761.57 C 187.16 760.55 186.49 759.53 185.79 758.48 C 162.55 722.17 142.13 677.13 141.70 633.32 C 141.69 632.48 141.69 631.63 141.69 630.77 C 141.77 612.52 142.01 594.79 147.35 577.12 C 147.64 576.19 147.93 575.24 148.22 574.27 C 158.66 540.58 177.65 511.27 200.51 485.09 C 201.44 483.95 202.38 482.79 203.32 481.63 C 206.02 478.38 208.99 475.89 212.25 473.22 C 214.03 471.42 215.79 469.62 217.54 467.81 C 223.62 461.90 229.84 456.38 236.47 451.14 C 243.51 445.56 249.98 439.56 256.30 433.28 C 257.03 432.59 257.75 431.90 258.51 431.19 C 273.51 416.29 281.49 396.29 289.21 377.10 C 302.15 344.17 322.33 316.50 356.95 303.72 C 364.44 301.33 371.62 299.22 379.82 299.80 C 382.65 301.41 382.65 301.41 384.52 303.02 C 384.43 308.26 383.09 312.36 381.15 316.99 C 375.43 331.81 374.93 347.40 381.15 363.42 C 383.13 367.46 385.62 370.74 388.59 374.19 C 390.23 376.17 390.23 376.17 391.65 379.40 C 393.54 380.40 393.54 380.40 396.25 381.54 C 400.16 383.70 400.16 383.70 402.07 384.77 C 410.94 388.99 420.54 389.42 429.50 387.27 C 437.81 384.14 443.80 378.99 447.56 371.12 C 451.88 359.14 450.35 346.36 444.78 333.95 C 441.54 327.81 437.75 321.96 434.05 316.08 C 416.31 287.26 406.47 258.39 415.61 226.49 C 425.23 200.02 442.89 177.61 465.00 157.67 C 466.66 156.21 468.32 154.73 469.99 153.24 C 478.47 145.89 487.57 139.69 497.10 133.59 C 497.80 133.14 498.52 132.69 499.24 132.22 C 520.39 118.89 542.69 108.18 565.58 98.29 C 566.58 97.85 567.60 97.41 568.65 96.96 C 597.00 84.91 626.01 77.00 654.79 72.63 C 656.09 72.42 657.40 72.20 658.74 71.99 C 674.63 70.31 696.84 68.62 708.20 76.90 Z"/><path class="sk-flame" fill="url(#g-flame-grad)" d="M 247.04 281.54 C 248.46 287.00 246.72 291.27 244.99 296.18 C 239.81 312.39 247.32 331.26 255.24 346.76 C 260.36 356.87 263.52 366.89 261.38 377.57 C 257.88 387.11 250.70 392.83 241.39 396.63 C 232.16 399.75 219.41 398.65 209.96 394.74 C 209.50 394.52 209.50 394.52 207.20 393.40 C 206.30 392.96 205.39 392.53 204.46 392.09 C 194.60 386.70 187.61 378.04 183.37 367.96 C 181.90 363.78 181.32 359.73 180.90 355.44 C 180.81 354.55 180.72 353.66 180.63 352.74 C 179.14 334.90 186.26 319.34 196.80 306.25 C 197.45 305.43 198.11 304.62 198.80 303.77 C 207.32 293.94 231.73 271.97 247.04 281.54 Z"/><path class="sk-flame" fill="url(#g-flame-grad)" d="M 726.25 186.61 C 743.35 194.06 756.47 207.63 763.39 225.07 C 768.37 237.64 768.36 253.03 764.39 265.61 C 762.56 270.33 760.34 274.32 757.32 278.32 C 757.04 278.69 757.04 278.69 755.66 280.55 C 748.77 288.87 737.92 294.78 726.65 295.72 C 718.81 295.87 713.07 294.47 706.04 290.40 C 701.50 286.17 699.47 281.65 698.79 275.84 C 698.57 268.13 700.99 261.34 703.63 254.28 C 711.14 235.14 714.50 215.35 707.23 195.72 C 706.92 195.01 706.61 194.30 706.29 193.57 C 706.12 187.95 706.12 187.95 708.56 185.06 C 714.67 182.68 720.63 184.60 726.25 186.61 Z"/></g><g class="sk-fr sk-f4"><path class="sk-flame" fill="url(#g-flame-grad)" d="M 649.14 58.63 C 652.19 62.00 652.19 62.00 653.17 65.08 C 652.78 72.78 646.46 76.68 641.56 81.12 C 633.55 88.48 627.13 96.53 621.50 105.71 C 620.89 106.71 620.27 107.70 619.63 108.74 C 606.43 132.47 603.75 163.67 616.03 196.66 C 622.00 213.92 633.79 228.89 648.84 240.62 C 655.07 245.20 661.77 248.67 668.39 252.21 C 693.10 265.91 711.42 283.08 720.10 309.10 C 725.70 339.36 714.36 365.13 695.74 389.43 C 694.33 391.23 692.91 393.03 691.48 394.83 C 680.34 408.90 673.37 421.74 673.15 439.24 C 674.12 447.16 676.88 453.75 682.90 458.63 C 690.34 463.44 698.37 463.63 707.58 462.53 C 714.65 460.71 719.78 456.28 724.30 450.34 C 728.90 443.62 730.82 436.59 732.79 429.04 C 739.39 403.43 753.15 380.68 774.95 364.78 C 787.07 356.89 802.30 348.12 816.68 349.41 C 820.60 350.31 820.60 350.31 822.80 351.64 C 824.22 354.75 823.19 356.94 822.25 360.33 C 821.06 363.06 819.82 365.72 818.49 368.39 C 807.61 390.59 807.20 413.12 813.23 435.08 C 816.53 445.57 821.51 455.31 826.14 465.14 C 830.75 474.79 835.15 484.45 838.75 494.67 C 838.88 495.03 838.88 495.03 839.54 496.82 C 855.71 539.08 858.26 588.65 843.71 632.56 C 841.21 639.29 838.19 645.79 835.02 652.25 C 834.48 653.36 833.94 654.47 833.38 655.61 C 826.73 668.50 817.73 680.11 807.69 690.51 C 807.12 691.10 806.55 691.69 805.96 692.30 C 798.72 699.80 791.37 706.89 783.19 713.38 C 756.93 734.42 741.46 760.64 732.33 792.65 C 725.78 815.48 716.26 836.46 700.55 854.49 C 699.77 855.40 698.98 856.30 698.17 857.24 C 695.72 860.00 693.23 862.72 690.72 865.42 C 689.99 866.22 689.27 867.01 688.52 867.83 C 672.51 884.72 651.76 896.70 630.59 905.87 C 629.88 906.18 629.17 906.48 628.44 906.80 C 595.36 920.85 560.28 921.91 525.09 917.28 C 513.72 915.81 502.52 915.38 491.07 915.37 C 490.69 915.37 490.69 915.37 488.75 915.36 C 474.04 915.32 459.57 916.56 445.29 920.22 C 444.37 920.44 443.45 920.67 442.50 920.90 C 437.09 922.24 431.69 923.62 426.29 925.00 C 423.21 925.79 420.13 926.57 417.05 927.35 C 414.82 927.92 412.58 928.50 410.35 929.08 C 367.85 940.00 324.66 936.30 286.23 914.62 C 276.10 908.37 267.33 901.07 258.90 892.75 C 258.43 892.29 258.43 892.29 256.03 889.93 C 237.80 870.95 228.00 846.70 223.20 821.15 C 220.13 804.96 211.25 792.10 200.87 779.66 C 196.09 773.93 191.94 767.80 187.84 761.57 C 187.16 760.55 186.49 759.53 185.79 758.48 C 162.55 722.17 142.13 677.13 141.62 633.30 C 141.60 632.46 141.58 631.60 141.56 630.73 C 141.18 612.33 140.96 594.38 145.98 576.45 C 146.25 575.50 146.53 574.54 146.81 573.55 C 157.59 539.24 178.17 509.30 203.66 482.49 C 204.74 481.31 205.82 480.12 206.90 478.94 C 210.03 475.60 213.33 473.05 216.97 470.30 C 219.00 468.45 221.02 466.61 223.04 464.75 C 230.02 458.68 237.12 453.01 244.63 447.63 C 252.64 441.88 260.19 435.72 267.67 429.25 C 268.53 428.54 269.39 427.83 270.27 427.10 C 288.16 411.76 300.10 391.13 311.50 371.31 C 329.76 337.26 352.61 308.59 387.69 295.33 C 395.20 292.85 402.39 290.66 410.59 291.26 C 413.41 292.94 413.41 292.94 415.26 294.61 C 415.07 300.04 413.57 304.30 411.40 309.10 C 404.49 324.45 402.10 340.60 405.86 357.18 C 407.15 361.35 409.07 364.74 411.42 368.30 C 412.70 370.35 412.70 370.35 413.52 373.68 C 415.22 374.72 415.22 374.72 417.72 375.90 C 421.22 378.13 421.22 378.13 422.92 379.24 C 430.99 383.59 440.49 384.03 449.87 381.81 C 458.78 378.59 465.75 373.27 470.94 365.14 C 477.29 352.75 477.67 339.52 473.61 326.67 C 470.98 320.31 467.66 314.25 464.35 308.15 C 446.79 278.24 433.86 248.23 435.36 215.03 C 435.25 187.43 442.49 164.04 453.96 143.21 C 454.80 141.68 455.61 140.13 456.43 138.57 C 460.67 130.89 466.10 124.41 471.98 118.03 C 472.41 117.56 472.85 117.09 473.30 116.59 C 486.32 102.64 502.06 91.41 518.97 81.06 C 519.71 80.60 520.46 80.14 521.24 79.67 C 542.49 67.03 567.01 58.73 593.38 54.15 C 594.56 53.92 595.75 53.70 596.98 53.47 C 611.97 51.72 633.27 49.94 649.14 58.63 Z"/><path class="sk-flame" fill="url(#g-flame-grad)" d="M 277.18 272.31 C 278.92 277.97 277.35 282.41 275.74 287.51 C 270.30 304.33 276.43 323.89 282.50 339.94 C 286.13 350.39 287.64 360.76 283.58 371.80 C 278.29 381.65 270.00 387.56 259.94 391.48 C 250.09 394.70 237.55 393.56 228.88 389.52 C 228.47 389.30 228.47 389.30 226.38 388.14 C 225.56 387.69 224.75 387.24 223.90 386.79 C 215.08 381.22 209.74 372.28 207.31 361.87 C 206.55 357.54 206.63 353.36 206.89 348.92 C 206.93 348.00 206.98 347.07 207.03 346.13 C 207.86 327.66 216.37 311.54 227.49 297.95 C 228.16 297.11 228.84 296.26 229.54 295.38 C 238.02 285.18 261.01 262.35 277.18 272.31 Z"/><path class="sk-flame" fill="url(#g-flame-grad)" d="M 730.26 173.44 C 750.78 181.21 769.59 195.37 782.69 213.55 C 791.30 226.64 794.79 242.66 792.89 255.75 C 791.65 260.65 789.87 264.80 787.22 268.96 C 786.96 269.34 786.96 269.34 785.73 271.27 C 779.32 279.92 768.65 286.05 757.39 287.03 C 749.55 287.18 743.78 285.73 736.65 281.50 C 731.92 277.11 729.62 272.42 728.46 266.38 C 727.40 258.36 728.86 251.31 730.29 243.96 C 733.41 224.04 730.52 203.42 715.39 182.94 C 714.77 182.21 714.14 181.47 713.50 180.70 C 710.76 174.84 710.76 174.84 711.83 171.82 C 716.78 169.33 723.68 171.34 730.26 173.44 Z"/></g><path class="sk-head" fill="#FFFFFF" d="M 607.63 459.84 C 608.36 460.36 609.1 460.89 609.85 461.42 C 612.2 463.11 614.53 464.82 616.86 466.54 C 617.57 467.06 618.28 467.58 619.01 468.12 C 623.36 471.4 627.23 474.91 631 478.84 C 632.84 480.68 634.78 482.32 636.81 483.96 C 679.26 520.86 704.23 583.7 709 638.55 C 711.55 675.11 706.26 715.08 681.97 744.08 C 681.59 744.54 681.59 744.54 679.66 746.88 C 662.06 767.35 638.81 778.82 612 781.24 C 603.92 781.63 595.98 781.15 587.95 780.15 C 587.99 781.08 588.03 782.01 588.07 782.96 C 588.47 800.31 585.13 817.91 572.85 830.99 C 560.53 842.05 547.35 845.48 531.14 844.96 C 518.98 844.28 509.76 838.99 501.32 830.37 C 492.62 819.99 490.77 807.4 489.57 794.36 C 489.41 794.89 489.41 794.89 488.6 797.57 C 484.34 811.29 478.84 824.24 466.07 832.12 C 452.97 838.94 437.79 840.68 423.49 836.45 C 412.88 832.25 403.82 825.55 398.83 815.13 C 393.48 802.24 393.94 790.45 395.55 776.87 C 394.94 778.02 394.33 779.17 393.7 780.35 C 385.32 795.91 376.8 807.14 359.64 813.38 C 355.65 814.5 351.78 814.57 347.65 814.52 C 346.79 814.51 345.93 814.5 345.04 814.49 C 332.85 814.15 322.43 809.49 313.59 801.05 C 303.89 790.54 299.66 777.23 300.05 762.96 C 301.22 752.17 304.34 741.75 309.19 732.05 C 308.81 732 308.81 732 306.89 731.76 C 281.5 728.12 260.72 716.02 244.69 695.97 C 226.79 670.53 221.7 640.04 226.74 609.64 C 228.32 600.99 230.77 592.73 233.75 584.47 C 234.24 583.12 234.72 581.78 235.22 580.39 C 244.34 556.4 258.3 535.79 275.3 516.69 C 275.54 516.41 275.54 516.41 276.78 515 C 294.21 495.2 314.93 478.78 337.61 465.31 C 338.32 464.88 339.03 464.46 339.76 464.02 C 418.83 417.12 529.47 403.98 607.63 459.84 Z"/> <path class="sk-feat" fill="#000000" transform="translate(368 600) rotate(13)" d="M -66 17 Q 0 -66 66 17 A 12 12 0 0 1 45 29 Q 0 -26 -45 29 A 12 12 0 0 1 -66 17 Z"/><path class="sk-feat" fill="#000000" transform="translate(368 600) rotate(13)" d="M -50 -12 L -75 -34 A 8 8 0 0 1 -63 -46 L -38 -24 Z M -27 -32 L -42 -60 A 8 8 0 0 1 -28 -67 L -13 -39 Z"/> <path class="sk-feat" fill="#000000" d="M 625.82 591.34 C 626.67 591.96 627.52 592.58 628.4 593.21 C 629.58 594.05 630.75 594.88 631.96 595.74 C 644.34 607.84 650.52 623.3 650.81 640.43 C 650.77 654.79 646.69 667.85 638.24 679.58 C 637.79 680.24 637.33 680.91 636.87 681.59 C 628.19 693.02 612.81 701.14 598.89 703.63 C 585.5 704.78 571.94 704.85 559.53 699.25 C 558.51 698.8 557.48 698.35 556.43 697.89 C 541.61 690.58 530.85 678.66 525.23 663.18 C 520.37 646.91 522.67 631.39 530.01 616.17 C 533.68 610.02 537.82 604.58 543.13 599.77 C 543.78 599.11 544.42 598.45 545.08 597.77 C 550.01 592.95 555.04 589.68 561.24 586.79 C 561.91 586.48 562.58 586.16 563.27 585.84 C 583.45 576.9 607.7 578.92 625.82 591.34 Z"/> <path class="sk-feat" fill="#000000" d="M 472.07 634.75 C 481.62 639.36 485.57 650.75 489.57 659.9 C 489.82 660.47 489.82 660.47 491.09 663.36 C 493.51 669.42 495.21 675.22 493.94 681.76 C 491.66 686.24 489.83 688.64 485.19 690.51 C 476.94 691.86 471.16 689.7 464.42 685.04 C 463.69 684.43 462.96 683.83 462.2 683.2 C 458.72 680.88 455.2 682.16 451.3 682.86 C 444.01 684.04 439.23 684.45 432.72 680.67 C 429.64 678.32 428.55 676.9 427.32 673.22 C 427.15 664.58 432.55 659.24 438.18 653.34 C 438.86 652.6 439.54 651.87 440.24 651.11 C 448.47 642.49 459.3 632.2 472.07 634.75 Z"/> <path class="sk-glint" fill="#FFFFFF" d="M 622.66 601.62 C 627.43 606.52 630.14 612.53 630.7 619.36 C 630.37 626.1 627.69 632.19 622.94 636.94 C 617.66 641.34 612.25 643.15 605.45 643.5 C 597.83 642.52 591.71 638.42 586.86 632.57 C 583.27 626.17 582.98 619.93 584.67 612.89 C 586.86 606.46 591.31 602.57 596.7 598.68 C 605.91 594.36 614.39 596.54 622.66 601.62 Z"/> <path class="sk-feat" fill="#000000" d="M 645.42 708.34 C 649.44 711.13 651.25 714.67 653.55 718.93 C 654.15 720.02 654.76 721.11 655.39 722.23 C 660.18 731.22 660.18 731.22 659.82 735.06 C 658.88 737.93 658.27 739.13 655.73 740.8 C 652.52 741.27 652.52 741.27 649.17 740.8 C 644.64 737.19 642.22 732.29 639.54 727.27 C 639.31 726.86 639.31 726.86 638.15 724.81 C 636.07 720.94 634.95 718.57 635.03 714.11 C 636.06 711.28 636.06 711.28 639.06 709.09 C 642.61 708 642.61 708 645.42 708.34 Z"/> <path class="sk-feat" fill="#000000" d="M 617.47 713.47 C 621.38 717.73 624 722.5 626.63 727.61 C 627.04 728.36 627.46 729.12 627.89 729.9 C 629.9 733.82 630.72 735.65 629.95 740.12 C 628.4 742.98 628.4 742.98 625.12 745.17 C 621.91 745.1 621.91 745.1 618.56 744.08 C 615.12 740.27 612.58 736.12 610.09 731.64 C 609.42 730.46 608.75 729.28 608.06 728.06 C 606.35 723.95 606.1 721.16 606.54 716.74 C 609.66 712.06 612.32 711.71 617.47 713.47 Z"/> <path class="sk-glint" fill="#FFFFFF" d="M 580.3 647.87 C 583.74 650.87 584.56 652.66 585.29 657.17 C 584.67 660.99 584.67 660.99 582.42 664.2 C 578.38 667.04 576.4 667.24 571.56 666.46 C 568.41 664.75 568.41 664.75 566.09 662.08 C 564.84 657.8 564.55 655.49 566.29 651.36 C 570.5 646.28 573.97 646.18 580.3 647.87 Z"/></g></svg>`;

// Workspaces saved before the graao rename still carry the old defaults; those read as graao's own.
export const brandName=b=>!b||b==='GO Workspace'||b==='graao'?'graao':b;

// Loading screen: the skull-flame mark (drawn by .boot::before) over the status line and one
// playful line, drawn once per page load so the app and agency loaders tell the same joke.
const quips = [
  'Acendendo a chama…',
  'Acordando a caveira… ela pediu mais cinco minutinhos.',
  'Esquentando os leads…',
  'Colocando as oportunidades em fila indiana…',
  'Dando um cafezinho pro servidor…',
  'Contando os contatos nos dedos. São muitos.',
  'Alinhando os pixels um por um…',
  'Polindo a caveira pra você…'
];
const quip = quips[Math.floor(Math.random() * quips.length)];
const escText = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/**
 * White Label: aberto no domínio de uma agência, o servidor marca o <html> com o nome e o logotipo dela
 * (white-label.mjs brandedPage). Devolve { name, logo } nesse caso e null na graao.
 */
export const domainBrand = () => {
  const data = typeof document === 'undefined' ? null : document.documentElement.dataset;
  return data?.marca === 'agencia' ? { name: data.marcaNome || '', logo: data.marcaLogo || '' } : null;
};
export const bootScreen = title => {
  const marca = domainBrand();
  // No domínio da agência: o logotipo e o nome dela, sem a caveira nem as piadas da graao.
  if (marca) {
    const mark = marca.logo ? `<img class="boot-logo" src="${escText(marca.logo)}" alt="">` : '';
    const line = title === 'Abrindo a graao…' && marca.name ? `Abrindo ${marca.name}…` : tr(title);
    return `<div class="boot boot-live boot-marca" role="status">${mark}<strong class="boot-title">${escText(line)}</strong></div>`;
  }
  const quip = quips[Math.floor(Math.random() * quips.length)];
  return `<div class="boot boot-live" role="status">${logo.replace('class="g-mark" width="36" height="36"', 'class="g-mark boot-mark" width="96" height="96"')}<strong class="boot-title">${tr(title)}</strong><small class="boot-quip">${tr(quip)}</small></div>`;
};
