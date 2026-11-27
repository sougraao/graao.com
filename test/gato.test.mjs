// O gato do graao: as pupilas são elementos próprios (para seguirem o mouse) e cada gato é independente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLINK, EYES, gatoSvg, pupilOffset } from '../ui/gato.js';
import { logo } from '../ui/icons.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('o gato não usa máscara nem ids, então vários na mesma página não se atrapalham', () => {
  const svg = gatoSvg({ cls: 'g-mark', width: 36, height: 36 });
  assert.doesNotMatch(svg, /<mask|\sid="/);
  assert.match(svg, /fill-rule="evenodd"/);
  assert.equal(svg.match(/class="g-pupila"/g).length, 2);
  assert.match(svg, /^<svg class="g-mark g-gato" width="36" height="36"/);
  assert.match(svg, /aria-hidden="true"/);
  assert.match(gatoSvg({ label: 'graao' }), /role="img" aria-label="graao"/);
  assert.match(logo, /g-gato/);
});

test('o gato tem pálpebras escondidas que fecham o olho inteiro quando ele pisca', () => {
  const svg = gatoSvg();
  const lids = [...svg.matchAll(/<ellipse class="g-palpebra" cx="(\d+)" cy="(\d+)" rx="(\d+)" ry="(\d+)" style="([^"]*)"/g)];
  assert.equal(lids.length, 2);
  for (const [, cx, cy, rx, ry, style] of lids) {
    const eye = EYES.find(e => e.cx === Number(cx) && e.cy === Number(cy));
    assert.ok(eye, 'cada pálpebra fica sobre um olho');
    assert.ok(Number(rx) >= 165 && Number(ry) >= 152, 'cobre o buraco do olho inteiro');
    assert.match(style, /transform:scaleY\(0\)/, 'em repouso fica escondida');
  }
  // As pálpebras vêm depois das pupilas, para cobri-las.
  assert.ok(svg.indexOf('g-palpebra') > svg.lastIndexOf('g-pupila'));
  assert.deepEqual([BLINK.keyframes[0].transform, BLINK.keyframes.at(-1).transform], ['scaleY(0)', 'scaleY(0)']);
  assert.ok(BLINK.keyframes.some(k => k.transform === 'scaleY(1)'), 'fecha o olho por um instante');
});

test('a pupila segue a direção do ponteiro sem sair do olho', () => {
  const [left] = EYES;
  const inside = (o, eye) => ((eye.px + o.x - eye.cx) / (165 - 63.5)) ** 2 + ((eye.py + o.y - eye.cy) / (152 - 62)) ** 2 <= 1;
  const right = pupilOffset(left, 5000, 0, 1);
  assert.ok(left.px + right.x > left.cx, 'olha para a direita');
  const up = pupilOffset(left, 0, -5000, 1);
  assert.ok(left.py + up.y < left.cy, 'olha para cima');
  for (const [dx, dy] of [[5000, 0], [-5000, 0], [0, 5000], [0, -5000], [4000, 4000], [-3000, 2000]]) {
    for (const eye of EYES) assert.ok(inside(pupilOffset(eye, dx, dy, 1), eye), `${dx},${dy}`);
  }
  // Perto do olho a pupila anda pouco; longe, encosta na borda.
  assert.ok(Math.abs(pupilOffset(left, 20, 0, 1).x + left.px - left.cx) < Math.abs(right.x + left.px - left.cx));
});

test('landing, privacidade e central de ajuda carregam o script do gato', () => {
  for (const page of ['ui/index.html', 'ui/privacidade.html', 'public/index.html', 'public/privacidade.html']) assert.match(read(page), /<script type="module" src="\/gato\.js"><\/script>/, page);
  assert.match(read('docs-site/astro.config.mjs'), /src: '\/gato\.js'/);
  assert.equal(read('docs-site/public/gato.js'), read('ui/gato.js'), 'docs-site/public/gato.js é cópia de ui/gato.js');
  assert.match(read('server.mjs'), /\['\/gato\.js','text\/javascript; charset=utf-8'\]/);
});
