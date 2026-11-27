// O favicon é o gato sem fundo; o app o repinta com a cor principal ativa trocando o laranja padrão (graao.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ler = arquivo => readFileSync(new URL(`../${arquivo}`, import.meta.url), 'utf8');

test('favicon do graao não tem fundo e usa o laranja que o app troca pela cor ativa', () => {
  const svg = ler('ui/favicon.svg');
  assert.doesNotMatch(svg, /<rect width="1768"/, 'o quadrado de fundo saiu');
  assert.match(svg, /fill="#ff6b1a"/);
  assert.equal(ler('public/favicon.svg'), svg, 'public/ espelha ui/');
  assert.doesNotMatch(ler('docs-site/public/favicon.svg'), /<rect width="1768"/);
});

test('aplicar a cor da marca repinta o favicon com a cor principal ativa', () => {
  const graao = ler('ui/graao.js');
  assert.match(graao, /paintFavicon\(custom \? primary : DEFAULT_BRAND_PRIMARY\)/);
  assert.match(graao, /replaceAll\(DEFAULT_BRAND_PRIMARY, color\)/);
  assert.match(graao, /if \(original !== '\/favicon\.svg'\) return;/, 'logo de White Label fica como está');
});
