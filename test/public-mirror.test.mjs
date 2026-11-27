import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_DIR, PUBLIC_HTML, publicMirrorPlan } from '../scripts/sync-public.mjs';
import { staticFiles } from '../server.mjs';

// public/ é o espelho de ui/ servido pela CDN da Vercel. Um arquivo que falte nele vira chamada à função
// (sem cache); antes da correção do includeFiles, respondia 500 (21/11/2026: invoices.js e outros 39).
test('public/ espelha todo módulo, estilo e página estática de ui/', () => {
  const pending = publicMirrorPlan().map(row => row.path);
  assert.deepEqual(pending, [], `Fora de sincronia com ui/ — rode "node scripts/sync-public.mjs": ${pending.join(', ')}`);
});

test('todo estático que o app serve também está em public/', () => {
  const missing = [...staticFiles.keys()]
    .filter(path => !path.startsWith('/setup-art/'))
    .filter(path => !/\.html$/.test(path) || PUBLIC_HTML.includes(path.slice(1)))
    .filter(path => !existsSync(join(PUBLIC_DIR, path)));
  assert.deepEqual(missing, []);
});

test('a Vercel inclui ui/, os templates de setup e a extensão do Chrome na função que de fato atende (server.mjs), para nada faltar se public/ falhar', async () => {
  const { default: config } = await import('../vercel.json', { with: { type: 'json' } });
  assert.equal(config.functions?.['server.mjs']?.includeFiles, '{ui/**,setup-templates/**,extensions/**}');
});
