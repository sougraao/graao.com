// O painel da agência (agency.js e os módulos que só ele usa) é carregado sob demanda pelo app da subconta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL(`../ui/${file}`, import.meta.url), 'utf8');
const staticImports = src => [...src.matchAll(/^\s*import\s[^;]*?from\s*['"]\.\/([^'"]+)['"]/gm)].map(m => m[1]);

test('app.js só carrega agency.js por import() ao abrir #agency', () => {
  const app = read('app.js');
  assert.ok(!staticImports(app).includes('agency.js'), 'agency.js não pode voltar a ser import estático do app.js');
  assert.match(app, /import\(\s*['"]\.\/agency\.js['"]\s*\)/);
  assert.match(app, /agencyUI\?\.leave\(\)/, 'sair da agência funciona mesmo sem o painel carregado');
});

test('módulos exclusivos do painel da agência não são importados pelo app da subconta', () => {
  // Cada um destes só é usado a partir de agency.js; se outro módulo do app passar a importá-lo de forma fixa,
  // ele volta para a abertura de todo mundo. Atualize a lista se um deles virar compartilhado de propósito.
  const agencyOnly = ['agency-data.js', 'agency-desktop.js', 'agency-mobile.js', 'graao-chat.js', 'presentations.js', 'prospecting.js', 'brand-group-data.js', 'color-picker.js', 'setup-art.js'];
  const app = read('app.js');
  const appImports = staticImports(app);
  for (const file of agencyOnly) assert.ok(!appImports.includes(file), `${file} importado direto pelo app.js`);
});
