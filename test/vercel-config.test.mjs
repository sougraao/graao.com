import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ler = async caminho => readFile(new URL(`../${caminho}`, import.meta.url), 'utf8');

// A Vercel aplica o .vercelignore da raiz a todos os projetos do repositório (app e graao-docs) e ele tira a pasta .git:
// um ignoreCommand com git imprime a ajuda do git diff e o deploy falha.
test('nenhum projeto da Vercel decide o build com git, porque o .vercelignore tira a pasta .git', async () => {
  const ignorados = (await ler('.vercelignore')).split(/\r?\n/).map(l => l.trim());
  assert.ok(ignorados.includes('.git'), 'o .vercelignore continua tirando .git do upload');
  for (const arquivo of ['vercel.json', 'docs-site/vercel.json']) {
    const config = JSON.parse(await ler(arquivo));
    assert.doesNotMatch(String(config.ignoreCommand || ''), /\bgit\b/, `${arquivo}: ignoreCommand com git quebra o deploy`);
  }
});

test('o .vercelignore da raiz não tira a pasta da documentação, que o projeto graao-docs precisa', async () => {
  const ignorados = (await ler('.vercelignore')).split(/\r?\n/).map(l => l.trim().replace(/\/$/, ''));
  assert.ok(!ignorados.includes('docs-site'));
});
