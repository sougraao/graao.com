// O gato do graao (a logo) e as pupilas que seguem o mouse.
//
// gatoSvg() devolve o gato como SVG inline: cabeça com os olhos e o nariz vazados (fill-rule evenodd, sem
// <mask> nem ids, então vários gatos na mesma página não se atrapalham), bigodes, a barra e as duas pupilas
// como elementos próprios. Importado no navegador, este módulo:
//   - troca as <img> do gato (src com graao-gato ou logo-graao, ou data-gato) pelo SVG inline, mantendo a
//     classe, o tamanho e o texto alternativo, para que a página sem JavaScript continue com a imagem;
//   - move as pupilas de todos os gatos visíveis na direção do ponteiro, um pouco mais quanto mais longe ele está;
//   - faz o gato piscar a cada clique.
// Com "reduzir movimento" ligado no sistema, as pupilas ficam paradas e o gato não pisca. O desenho mestre está em brand/logo-gato.svg.

const HEAD = 'M343 670L340 560C340 482 374 406 404 362C424 262 458 108 508 26C520 0 568 -6 594 18C667 64 767 149 822 207C880 186 940 173 1000 173C1062 173 1126 182 1183 205C1270 110 1360 30 1418 10C1445 -2 1482 0 1493 26C1536 100 1574 212 1596 362C1626 406 1660 482 1660 560L1656 670Z';
const EYE_HOLES = 'M543 500a165 152 0 1 0 330 0a165 152 0 1 0 -330 0ZM1128 500a164 152 0 1 0 328 0a164 152 0 1 0 -328 0Z';
const NOSE_HOLE = 'M999.5 561L1020.7 539.8A8.5 8.5 0 0 1 1032.7 551.8L1011.5 573L1032.7 594.2A8.5 8.5 0 0 1 1020.7 606.2L999.5 585L978.3 606.2A8.5 8.5 0 0 1 966.3 594.2L987.5 573L966.3 551.8A8.5 8.5 0 0 1 978.3 539.8Z';
const WHISKERS = 'M283 500 390 521M263 616 390 591M1716 495 1610 514M1735 612 1610 584';
// Olhos (centro do buraco) e pupilas em repouso, olhando de leve para o nariz.
export const EYES = [
  { cx: 708, cy: 500, px: 721.5, py: 493 },
  { cx: 1292, cy: 500, px: 1277.5, py: 492.5 }
];
// Quanto a pupila anda dentro do olho (unidades do desenho): o buraco tem raio 165×152, a pupila 63,5×62.
const REACH_X = 88, REACH_Y = 76;
// A partir desta distância (px de tela) do olho a pupila já encosta na borda.
const FULL_AT = 220;

const attr = value => String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

/**
 * @param {object} [o]
 * @param {string} [o.cls]     classes do <svg> (sempre ganha g-gato)
 * @param {number|string} [o.width]
 * @param {number|string} [o.height]
 * @param {string} [o.label]   texto para leitores de tela; vazio deixa o gato decorativo
 */
export function gatoSvg({ cls = '', width = '', height = '', label = '' } = {}) {
  const size = `${width !== '' ? ` width="${attr(width)}"` : ''}${height !== '' ? ` height="${attr(height)}"` : ''}`;
  const a11y = label ? ` role="img" aria-label="${attr(label)}"` : ' aria-hidden="true"';
  const pupils = EYES.map(e => `<ellipse class="g-pupila" cx="${e.px}" cy="${e.py}" rx="63.5" ry="62" data-olho="${e.cx} ${e.cy}" style="transition:transform .15s ease-out"/>`).join('');
  // Pálpebras: descem do topo quando o gato pisca; em repouso ficam achatadas (invisíveis). São bem maiores que
  // o olho para não sobrar o contorno da borda serrilhada; o excesso cai sobre a cabeça, da mesma cor.
  const lids = EYES.map(e => `<ellipse class="g-palpebra" cx="${e.cx}" cy="${e.cy}" rx="190" ry="185" style="transform-box:fill-box;transform-origin:50% 0;transform:scaleY(0)"/>`).join('');
  return `<svg class="${attr(cls ? `${cls} g-gato` : 'g-gato')}"${size} viewBox="236 0 1528 696"${a11y} focusable="false">`
    + `<g fill="currentColor"><path fill-rule="evenodd" d="${HEAD}${EYE_HOLES}${NOSE_HOLE}"/>`
    + `<path d="${WHISKERS}" fill="none" stroke="currentColor" stroke-width="53" stroke-linecap="round"/>`
    + `<rect x="236" y="657" width="1528" height="33" rx="16.5"/>${pupils}${lids}</g></svg>`;
}

// Uma piscada: a pálpebra desce, segura um instante fechada e sobe.
export const BLINK = {
  keyframes: [
    { transform: 'scaleY(0)' },
    { transform: 'scaleY(1)', offset: 0.4 },
    { transform: 'scaleY(1)', offset: 0.6 },
    { transform: 'scaleY(0)' }
  ],
  options: { duration: 220, easing: 'ease-in-out' }
};

/** Todos os gatos da página piscam juntos. */
export function blink(root = document) {
  for (const lid of root.querySelectorAll('svg.g-gato .g-palpebra')) lid.animate?.(BLINK.keyframes, BLINK.options);
}

/**
 * Onde a pupila fica para um ponteiro em (dx, dy) do centro do olho, em unidades do desenho, e com o olho
 * medindo `scale` px de tela por unidade. Devolve o deslocamento a partir da posição de repouso.
 */
export function pupilOffset(eye, dx, dy, scale) {
  const dist = Math.hypot(dx, dy);
  if (!dist) return { x: eye.cx - eye.px, y: eye.cy - eye.py };
  const t = Math.min(1, (dist * scale) / FULL_AT);
  return { x: eye.cx + (dx / dist) * REACH_X * t - eye.px, y: eye.cy + (dy / dist) * REACH_Y * t - eye.py };
}

const IMG_SELECTOR = 'img[data-gato], img[src*="graao-gato"], img[src*="logo-graao"]';

/** Troca as <img> do gato pelo SVG inline (as pupilas só se mexem no SVG). */
export function upgradeImages(root = document) {
  for (const img of root.querySelectorAll(IMG_SELECTOR)) {
    const box = img.getBoundingClientRect();
    const holder = document.createElement('span');
    holder.innerHTML = gatoSvg({ cls: img.getAttribute('class') || '', width: img.getAttribute('width') || '', height: img.getAttribute('height') || '', label: img.getAttribute('alt') || '' });
    const svg = holder.firstElementChild;
    // Sem largura nem altura no HTML (logo da central de ajuda), mantém o tamanho que a imagem tinha na tela.
    if (!img.getAttribute('width') && box.width) svg.style.width = `${box.width}px`;
    if (!img.getAttribute('height') && box.height) svg.style.height = `${box.height}px`;
    img.replaceWith(svg);
  }
}

let started = false;
let pointer = null;
let frame = 0;

function look() {
  frame = 0;
  for (const svg of document.querySelectorAll('svg.g-gato')) {
    const ctm = svg.getScreenCTM?.();
    for (const pupil of svg.querySelectorAll('.g-pupila')) {
      const [cx, cy] = String(pupil.dataset.olho).split(' ').map(Number);
      const eye = EYES.find(e => e.cx === cx && e.cy === cy);
      if (!eye) continue;
      if (!pointer || !ctm) { pupil.style.transform = ''; continue; }
      // Ponteiro levado para as unidades do desenho, para comparar com o centro do olho.
      const inverse = ctm.inverse();
      const ux = inverse.a * pointer.x + inverse.c * pointer.y + inverse.e;
      const uy = inverse.b * pointer.x + inverse.d * pointer.y + inverse.f;
      const { x, y } = pupilOffset(eye, ux - eye.cx, uy - eye.cy, Math.hypot(ctm.a, ctm.b));
      pupil.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }
}
const schedule = () => { if (!frame) frame = requestAnimationFrame(look); };

/** Liga as pupilas ao ponteiro (uma vez por página) e troca as imagens do gato que já estiverem na página. */
export function startGato() {
  if (started || typeof document === 'undefined') return;
  started = true;
  const ready = () => upgradeImages();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true }); else ready();
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  window.addEventListener('pointermove', event => { pointer = { x: event.clientX, y: event.clientY }; schedule(); }, { passive: true });
  // Cada clique (ou toque) faz o gato piscar.
  window.addEventListener('pointerdown', () => blink(), { passive: true });
  // O ponteiro saiu da janela: os olhos voltam ao repouso.
  document.documentElement.addEventListener('pointerleave', () => { pointer = null; schedule(); });
  // Gatos que surgem depois (o app redesenha o menu a cada tela) já olham para o lugar certo.
  new MutationObserver(records => {
    if (records.some(r => [...r.addedNodes].some(n => n.nodeType === 1 && (n.matches?.('svg.g-gato, img') || n.querySelector?.('svg.g-gato, img'))))) {
      upgradeImages();
      schedule();
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}

if (typeof document !== 'undefined') startGato();
