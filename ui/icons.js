import { tr } from './i18n.js';
import { gatoSvg } from './gato.js';
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

// Marca do graao: o gato espiando, com as pupilas seguindo o mouse (gato.js). Cor herdada de .g-mark.
export const logo=gatoSvg({ cls: 'g-mark', width: 36, height: 36 });

// Workspaces saved before the graao rename still carry the old defaults; those read as graao's own.
export const brandName=b=>!b||b==='GO Workspace'||b==='graao'?'graao':b;

// Tela de carregamento: o gato sobre a linha de status e uma frase divertida embaixo. As frases se revezam
// enquanto a tela estiver aberta. A posição na lista vale para a página toda: redesenhar a tela ("Abrindo o
// graao…" e depois "Abrindo o painel da agência…") mantém a frase da vez em vez de sortear outra e reiniciar
// a entrada (antes ela podia ficar invisível).
export const quips = [
  'Afiando as unhas do gato…',
  'Acordando o gato… ele pediu mais cinco minutinhos.',
  'Esquentando os leads…',
  'Colocando as oportunidades em fila indiana…',
  'Dando um cafezinho pro servidor…',
  'Contando os contatos nos dedos. São muitos.',
  'Alinhando os pixels um por um…',
  'Penteando os bigodes do gato pra você…'
];
export const QUIP_EVERY = 2400;
let quipAt = Math.floor(Math.random() * quips.length);
let quipTimer = 0;
// Troca a frase de toda tela de carregamento aberta; para sozinho quando não há mais nenhuma.
function nextQuip() {
  const open = typeof document === 'undefined' ? [] : [...document.querySelectorAll('.boot-quip')];
  if (!open.length) { clearInterval(quipTimer); quipTimer = 0; return; }
  quipAt = (quipAt + 1) % quips.length;
  for (const el of open) {
    const fresh = el.cloneNode(false);
    fresh.textContent = tr(quips[quipAt]);
    el.replaceWith(fresh);
  }
}
const escText = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/**
 * White Label: aberto no domínio de uma agência, o servidor marca o <html> com o nome e o logotipo dela
 * (white-label.mjs brandedPage). Devolve { name, logo } nesse caso e null no graao.
 */
export const domainBrand = () => {
  const data = typeof document === 'undefined' ? null : document.documentElement.dataset;
  return data?.marca === 'agencia' ? { name: data.marcaNome || '', logo: data.marcaLogo || '' } : null;
};
export const bootScreen = title => {
  const marca = domainBrand();
  // No domínio da agência: o logotipo e o nome dela, sem o gato nem as piadas do graao.
  if (marca) {
    const mark = marca.logo ? `<img class="boot-logo" src="${escText(marca.logo)}" alt="">` : '';
    const line = title === 'Abrindo o graao…' && marca.name ? `Abrindo ${marca.name}…` : tr(title);
    return `<div class="boot boot-live boot-marca" role="status">${mark}<strong class="boot-title">${escText(line)}</strong></div>`;
  }
  if (!quipTimer && typeof setInterval === 'function' && typeof document !== 'undefined') quipTimer = setInterval(nextQuip, QUIP_EVERY);
  return `<div class="boot boot-live" role="status">${gatoSvg({ cls: 'g-mark boot-mark', width: 132, height: 60 })}<strong class="boot-title">${tr(title)}</strong><small class="boot-quip" aria-hidden="true">${tr(quips[quipAt])}</small></div>`;
};
