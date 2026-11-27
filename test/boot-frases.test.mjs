// Tela de carregamento: o gato, o título e uma frase divertida que se mantém entre redesenhos e se reveza.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bootScreen, quips, QUIP_EVERY } from '../ui/icons.js';

const quipOf = html => html.match(/<small class="boot-quip"[^>]*>([^<]*)<\/small>/)?.[1];

test('a tela de carregamento mostra uma das frases divertidas', () => {
  const html = bootScreen('Abrindo o graao…');
  assert.ok(quips.includes(quipOf(html)), html);
  assert.match(html, /g-gato/);
});

test('redesenhar a tela mantém a frase da vez (antes sorteava outra e ela podia nem aparecer)', () => {
  assert.equal(quipOf(bootScreen('Abrindo o graao…')), quipOf(bootScreen('Abrindo o painel da agência…')));
  // A entrada da frase não espera: com atraso, um redesenho logo em seguida a deixava invisível.
  const css = readFileSync(new URL('../ui/graao.css', import.meta.url), 'utf8');
  assert.match(css, /\.boot-quip\{[^}]*animation:g-quip [.\d]+s var\(--ease-out\) both\}/);
  assert.ok(QUIP_EVERY >= 1500 && QUIP_EVERY <= 4000, 'tempo para ler cada frase');
});

test('o carregamento antes do JavaScript também tem frase, menos no domínio da agência', async () => {
  const { brandedPage } = await import('../white-label.mjs');
  const html = readFileSync(new URL('../ui/app.html', import.meta.url), 'utf8');
  assert.ok(quips.includes(quipOf(html)), 'app.html traz uma das frases');
  const branded = brandedPage(html, { name: 'Agência Um' });
  assert.doesNotMatch(branded, /boot-quip/);
  assert.match(branded, /Abrindo Agência Um…/);
});

test('o gato do carregamento e do Pergunte ao Graao segue a proporção dele (≈2,2:1), sem sobra em cima e embaixo', () => {
  const css = readFileSync(new URL('../ui/graao.css', import.meta.url), 'utf8') + readFileSync(new URL('../ui/graao-chat.css', import.meta.url), 'utf8');
  const ratio = (w, h) => Number(w) / Number(h);
  for (const rule of [/\.boot::before\{content:'';width:(\d+)px;height:(\d+)px/, /\.boot \.boot-mark\{width:(\d+)px;height:(\d+)px/, /\.sc-home-badge \.g-mark \{[^}]*width: (\d+)px;\s*height: (\d+)px/]) {
    const [, w, h] = css.match(rule);
    assert.ok(Math.abs(ratio(w, h) - 1528 / 696) < 0.12, `${rule}: ${w}×${h}`);
  }
  assert.match(bootScreen('Abrindo o graao…'), /width="132" height="60"/);
});

test('as frases falam do gato, não da caveira antiga, e todas têm tradução em espanhol', () => {
  const es = readFileSync(new URL('../ui/locales/es.js', import.meta.url), 'utf8');
  assert.ok(quips.length >= 6);
  for (const quip of quips) {
    assert.doesNotMatch(quip, /caveira|chama/i, quip);
    assert.ok(es.includes(JSON.stringify(quip) + ':'), `tradução: ${quip}`);
  }
});
