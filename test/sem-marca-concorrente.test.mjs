import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

// A interface é da graao (e das agências): nenhum texto que aparece na tela cita a HighLevel.
// Comentários de código podem citar a referência; textos do catálogo de traduções e do HTML, não.
test('nenhum texto da interface ou do catálogo de traduções cita a HighLevel', async () => {
  const pasta = new URL('../ui/', import.meta.url);
  const citam = [];
  for (const nome of await readdir(pasta)) {
    if (!/\.(js|html)$/.test(nome)) continue;
    const linhas = (await readFile(new URL(nome, pasta), 'utf8')).split(/\r?\n/);
    linhas.forEach((linha, i) => {
      const semComentario = linha.replace(/^\s*(\/\/|\/?\*).*$/, '').replace(/\s\/\/\s.*$/, '');
      if (/high\s?level/i.test(semComentario)) citam.push(`ui/${nome}:${i + 1}`);
    });
  }
  for (const nome of ['pt.js', 'es.js']) {
    if (/high\s?level/i.test(await readFile(new URL(`locales/${nome}`, pasta), 'utf8'))) citam.push(`ui/locales/${nome}`);
  }
  assert.deepEqual(citam, []);
});
