// Importar do GHL: quanto cada passo lê e grava. Uma subconta grande (dezenas de páginas, centenas de imagens) precisa
// caber no tempo de cada chamada, então os passos não podem reler a extração inteira nem regravar o resultado todo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runStep } from '../ghl-import-run.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ghl-location.json', import.meta.url), 'utf8'));
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

/** A mesma extração com `count` páginas no primeiro funil. */
function bigSource(count) {
  const dump = structuredClone(fixture.dump);
  const [first] = dump.funnels[0].pages;
  dump.funnels[0].pages = Array.from({ length: count }, (_, i) => ({ ...structuredClone(first), _id: `Pg${String(i).padStart(18, '0')}`, name: `Página ${i}` }));
  return { dump, triggers: fixture.triggers, surveys: fixture.surveys };
}

/** Um io em memória que conta o que cada passo pede. */
function memoryIo(source, imagesPerPage) {
  const temp = new Map();
  const log = { parts: 0, reads: [], writes: [], inflight: 0, maxInflight: 0, step: '' };
  const page = id => `<!doctype html><html><body><h1>${id}</h1>${Array.from({ length: imagesPerPage }, (_, i) => `<img src="https://assets.cdn.filesafe.space/${id}/${i}.png">`).join('')}</body></html>`;
  const io = {
    origin: 'https://graao.com',
    resolve: async () => [{ address: '93.184.216.34' }],
    fetch: async url => {
      const id = String(url).match(/\/preview\/([^/?#]+)/)?.[1];
      if (id) return new Response(page(id), { headers: { 'Content-Type': 'text/html' } });
      return new Response(PNG, { headers: { 'Content-Type': 'image/png' } });
    },
    async readPart(name) { log.parts++; return JSON.stringify(source[name]); },
    async readTemp(key) {
      log.reads.push(`${log.step}:${key}`);
      log.maxInflight = Math.max(log.maxInflight, ++log.inflight);
      await new Promise(resolve => setImmediate(resolve));
      log.inflight--;
      return temp.has(key) ? structuredClone(temp.get(key)) : null;
    },
    async writeTemp(key, value) { log.writes.push(`${log.step}:${key}`); temp.set(key, structuredClone(value)); },
    async clearTemp() { temp.clear(); },
    async saveImages() {},
    async saveSites() {},
    async addSetup(snap) { return snap.id; },
  };
  return { io, log };
}

async function runAll(source, imagesPerPage) {
  const { io, log } = memoryIo(source, imagesPerPage);
  const job = { id: 'j1', status: 'received', notes: [], pagesDone: 0, pagesTotal: 0, imagesDone: 0, imagesTotal: 0 };
  for (let i = 0; i < 60 && !['done', 'failed'].includes(job.status); i++) {
    log.step = job.status === 'received' ? 'pages' : job.status;
    await runStep(job, io);
  }
  assert.equal(job.status, 'done', job.error);
  return { job, log };
}

test('reads the upload once for the pages, not once per step', async () => {
  const { log } = await runAll(bigSource(25), 0);
  // 3 partes no primeiro passo de páginas + 3 na conversão; os outros passos de páginas leem só a lista.
  assert.equal(log.parts, 6);
});

test('reads the downloaded pages in parallel when converting', async () => {
  const { log } = await runAll(bigSource(25), 0);
  assert.ok(log.maxInflight > 1, 'a conversão leu as páginas uma de cada vez');
});

test('image steps never read or rewrite the whole converted result', async () => {
  const { job, log } = await runAll(bigSource(3), 25);
  assert.ok(job.imagesTotal > 40, `só ${job.imagesTotal} imagens`);
  const heavy = [...log.reads, ...log.writes].filter(entry => entry === 'images:converted');
  assert.deepEqual(heavy, []);
});
