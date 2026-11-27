import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../ui/graao-chat.css', import.meta.url), 'utf8');

test('O Pergunte ao Graao começa abaixo do topo flutuante, como as outras telas', () => {
  const regra = css.match(/\.screen-ask-chat\s*\{([^}]*)\}/)[1];
  assert.match(regra, /padding:\s*var\(--lg-top-h,\s*0px\)\s+0\s+0\s*!important/);
  // Com um aviso acima da tela, quem desce a altura do topo é o aviso; a tela não reserva de novo.
  assert.match(css, /:is\(\.ag-banner,\s*\.lp-return\)\s*~\s*\.screen-ask-chat\s*\{\s*padding-top:\s*0\s*!important/);
});
