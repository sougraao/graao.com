// Janela "Importar do GHL" em Setups de conta: o passo a passo, o código, o andamento da conversão e o relatório.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GHL_EXTENSION_URL, GHL_EXTENSION_ZIP, ghlImportBody, ghlImportState, ghlPhase } from '../ui/ghl-import-view.js';

const job = (status, extra = {}) => ({ id: 'j1', status, pagesDone: 0, pagesTotal: 0, imagesDone: 0, imagesTotal: 0, notes: [], error: '', snapshotId: '', ...extra });

test('the Importados tab shows the GHL import button and dialog', () => {
  const agency = readFileSync(new URL('../ui/agency.js', import.meta.url), 'utf8');
  assert.match(agency, /btn\('Importar do GHL', 'ghl-import'/, 'button next to Importar setup');
  assert.match(agency, /case 'ghl-import':/, 'dialog opens from the button');
  const body = ghlImportBody({ code: 'ABC-234-XYZ', expiresAt: 1_800_000, now: 0 });
  assert.match(body, />ABC-234-XYZ</);
  assert.match(body, /vale 30 min/);
  assert.ok(body.includes(`href="${GHL_EXTENSION_ZIP}" download=`) && /Instalar no Chrome/.test(body), 'the button downloads the extension folder');
  assert.ok(body.includes(`href="${GHL_EXTENSION_URL}"`) && /Carregar sem compactação/.test(body), 'how to load it, with the help article');
  assert.equal((body.match(/<li>/g) || []).length, 3, 'three steps');
  assert.match(body, /data-ghl-state/);
  assert.match(ghlImportBody({ code: '<b>', expiresAt: 0, now: 0 }), /&lt;b&gt;/, 'the code is escaped');
});

test('shows each phase of the conversion', () => {
  assert.equal(ghlPhase(job('waiting')).text, 'Esperando a extensão…');
  assert.equal(ghlPhase(job('pages', { pagesDone: 12, pagesTotal: 41 })).text, 'Baixando páginas 12/41');
  assert.equal(ghlPhase(job('converting')).text, 'Convertendo');
  assert.equal(ghlPhase(job('images', { imagesDone: 8, imagesTotal: 30 })).text, 'Copiando imagens 8/30');
  const fractions = ['waiting', 'receiving', 'received', 'pages', 'converting', 'images', 'saving', 'done'].map(s => ghlPhase(job(s)).fraction);
  assert.deepEqual([...fractions].sort((a, b) => a - b), fractions, 'progress only moves forward');
});

test('the report lists the counts and the notes, with a button to the setup', () => {
  const html = ghlImportState(job('done', { snapshotId: 's1', notes: ['A página "Início" não pôde ser baixada.', '<script>'] }), { summary: '2 workflows · 3 etiquetas' });
  assert.match(html, /2 workflows · 3 etiquetas/);
  assert.match(html, /A página &quot;Início&quot; não pôde ser baixada\./);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /data-ag="ghl-view-setup" data-id="s1"/);
  const failed = ghlImportState(job('failed', { error: 'A conversão parou: x' }));
  assert.match(failed, /A conversão parou: x/);
  assert.match(failed, /data-ag="ghl-import"/);
  assert.match(failed, /Tentar de novo/);
});

test('the server serves the dialog module the agency panel imports', async t => {
  const { makeServer } = await import('../server.mjs');
  const { createSqliteStore } = await import('../storage.mjs');
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store: createSqliteStore(':memory:'), port: 0 });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://${host}:${server.address().port}/ghl-import-view.js`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /export function ghlImportBody/);
});
