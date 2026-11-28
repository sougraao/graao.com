// Importar do GHL: o código, o envio em partes pela extensão e a conversão em passos até virar um setup em Importados.
// O GHL é falso: um fetch que serve a pré-visualização das páginas e as imagens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { loadSetupSites } from '../setup-sites-store.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ghl-location.json', import.meta.url), 'utf8'));
const IMAGE = 'https://assets.cdn.filesafe.space/fx/foto.png';
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const preview = (name, extra = []) => `<!doctype html><html><head><title>${name}</title></head><body><h1>${name}</h1><img src="${IMAGE}">${extra.map(src => `<img src="${src}">`).join('')}</body></html>`;

/** O GHL falso: pré-visualizações em sites.leadconnectorhq.com/preview/<id> e a imagem; `broken` lista o que responde 404. */
function fakeGhl(broken = [], { extra = [], routes = {}, seen = [] } = {}) {
  return async url => {
    url = String(url);
    seen.push(url);
    if (routes[url]) return routes[url]();
    if (broken.some(part => url.includes(part))) return new Response('não encontrado', { status: 404 });
    const page = url.match(/^https:\/\/sites\.leadconnectorhq\.com\/preview\/([^/?#]+)/);
    if (page) return new Response(preview(`Página ${page[1]}`, extra), { headers: { 'Content-Type': 'text/html' } });
    if (url === IMAGE) return new Response(PNG, { headers: { 'Content-Type': 'image/png' } });
    return new Response('', { status: 404 });
  };
}

// DNS falso: todo host é público, menos os de `privados`.
const publicDns = (privados = {}) => async host => [{ address: privados[host] || '93.184.216.34' }];

/**
 * Um banco que recusa linha sem profile.name, como o Supabase: a coluna name de go_workspaces é gerada de
 * state.profile.name e é not null (supabase/migrations/20261116193826_go_workspace_storage.sql).
 */
function supabaseLike(store) {
  const check = (id, state) => {
    if (typeof state?.profile?.name !== 'string') throw Object.assign(new Error(`Supabase Data API request failed (400): ${id} sem profile.name`), { status: undefined });
  };
  return new Proxy(store, { get(target, key) {
    if (key === 'insert') return async (id, state) => { check(id, state); return target.insert(id, state); };
    if (key === 'change') return (id, mutate) => target.change(id, state => { const out = mutate(state); check(id, state); return out; });
    const value = target[key];
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}

async function start({ ghlFetch = fakeGhl(), ghlResolve = publicDns() } = {}) {
  const store = supabaseLike(createSqliteStore(':memory:'));
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, port: 0, ghlFetch, ghlResolve });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, headers: r.headers, body: await r.json() };
  };
  return { store, call, close: () => new Promise(resolve => server.close(resolve)) };
}

// A extensão roda em chrome-extension://, então o envio chega de outra origem.
const fromExtension = code => ({ 'X-Graao-Import-Code': code, Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' });

async function upload(local, code, source) {
  for (const name of ['dump', 'triggers', 'surveys']) {
    const text = JSON.stringify(source[name]);
    const half = Math.ceil(text.length / 2);
    const chunks = name === 'dump' ? [text.slice(0, half), text.slice(half)] : [text];
    for (const [index, data] of chunks.entries()) {
      const sent = await local.call('/api/ghl-import/part', { name, index, total: chunks.length, data }, fromExtension(code));
      assert.equal(sent.status, 200, JSON.stringify(sent.body));
    }
  }
  const done = await local.call('/api/ghl-import/done', {}, fromExtension(code));
  assert.equal(done.status, 200, JSON.stringify(done.body));
  return done.body.jobId;
}

/** Gera o código, envia a extração e avança os passos até o fim. */
async function runImport(t, { ghlFetch, ghlResolve, source = fixture } = {}) {
  const local = await start({ ghlFetch, ghlResolve }); t.after(local.close);
  const issued = await local.call('/api/agency/ghl-import-code', {});
  assert.equal(issued.status, 200, JSON.stringify(issued.body));
  const jobId = await upload(local, issued.body.code, source);
  assert.equal(jobId, issued.body.jobId);
  let job = null;
  for (let i = 0; i < 40; i++) {
    const step = await local.call(`/api/agency/ghl-import/${jobId}/step`, {});
    assert.equal(step.status, 200, JSON.stringify(step.body));
    job = step.body;
    if (['done', 'failed'].includes(job.status)) break;
  }
  assert.equal(job.status, 'done', job.error);
  const sites = await loadSetupSites(local.store, job.snapshotId);
  const html = Object.values(sites).flatMap(doc => doc.pages.map(page => page.html)).join('\n');
  return { local, job, sites, html };
}

test('imports a GHL location end to end', async t => {
  const { local, job, sites } = await runImport(t);
  const { body } = await local.call('/api/agency');
  const setup = body.agency.snapshots.find(s => s.id === job.snapshotId);
  assert.equal(setup.kind, 'imported');
  assert.equal(setup.origin, 'ghl');
  assert.equal(setup.name, 'Jardim Teste (GHL)');
  assert.equal(setup.sitesStored, true);
  assert.equal(setup.studioSites, undefined);
  assert.ok(body.agency.ghlImports.every(row => !('codeHash' in row)), 'the code hash never leaves the server');
  assert.equal((await local.call(`/api/agency/ghl-import/${job.id}`)).body.status, 'done');
  assert.equal(Object.keys(sites).length, 1);
  // The temporary rows of the upload are gone.
  assert.equal((await local.store.list()).filter(row => row.id.startsWith(`ghl-import-${job.id}`)).length, 0);
  const account = await local.call('/api/agency/accounts', { name: 'Jardim Cliente', snapshotId: job.snapshotId });
  assert.equal(account.status, 200, JSON.stringify(account.body));
  const state = (await local.call(`/api/state?workspace=${account.body.result}`)).body.state;
  assert.equal(state.workflows.length, 2);
  assert.ok(['Item 14', 'Item 15', 'cliente'].every(tag => state.tags.some(row => (row.name || row) === tag)));
  assert.equal(state.studioProjects.length, 1);
  const doc = await local.call(`/api/studio/doc?workspace=${account.body.result}&id=${state.studioProjects[0].id}`);
  assert.equal(doc.body.doc.pages.length, 2);
});

test('rejects expired, used and unknown codes', async t => {
  const local = await start(); t.after(local.close);
  const unknown = await local.call('/api/ghl-import/part', { name: 'dump', index: 0, total: 1, data: '{}' }, fromExtension('AAA-BBB-CCC'));
  assert.equal(unknown.status, 401);
  assert.match(unknown.body.error, /Código inválido ou expirado/);
  const issued = await local.call('/api/agency/ghl-import-code', {});
  await upload(local, issued.body.code, fixture);
  const used = await local.call('/api/ghl-import/part', { name: 'dump', index: 0, total: 1, data: '{}' }, fromExtension(issued.body.code));
  assert.equal(used.status, 401);
});

test('report lists reader errors', async t => {
  const { job } = await runImport(t, { source: { ...fixture, dump: { ...fixture.dump, errors: ['404 surveys'] } } });
  assert.ok(job.notes.includes('Não consegui ler: 404 surveys'), job.notes.join(' | '));
});

test('keeps the original url when an image cannot be copied', async t => {
  const { job, html } = await runImport(t, { ghlFetch: fakeGhl([IMAGE]) });
  assert.ok(html.includes(IMAGE));
  assert.ok(job.notes.some(text => /imagem/.test(text) && /GHL/.test(text)), job.notes.join(' | '));
});

test('saves the site when a page preview fails', async t => {
  const { job, sites } = await runImport(t, { ghlFetch: fakeGhl(['/preview/Fx000000000000000055']) });
  assert.equal(Object.values(sites)[0].pages.length, 2);
  assert.ok(job.notes.includes('A página "Item 266" não pôde ser baixada.'), job.notes.join(' | '));
});

test('replaces copied images with graao asset urls', async t => {
  const { html } = await runImport(t);
  const hash = createHash('sha256').update(PNG).digest('hex');
  assert.ok(html.includes(`https://graao.com/asset/${hash}.png`));
  assert.ok(!html.includes(IMAGE));
});

test('never fetches images on internal networks, not even through a redirect', async t => {
  const seen = [];
  const META = 'http://169.254.169.254/latest/meta-data/foto.png';
  const INTERNAL = 'https://interno.exemplo/foto.png';
  const HOP = 'https://assets.cdn.filesafe.space/fx/salto.png';
  const LOOP = 'http://127.0.0.1:8080/foto.png';
  const ghlFetch = fakeGhl([], { extra: [META, INTERNAL, HOP], seen, routes: {
    [HOP]: () => new Response(null, { status: 302, headers: { Location: LOOP } }),
    [LOOP]: () => new Response(PNG, { headers: { 'Content-Type': 'image/png' } }),
  } });
  const { job, html } = await runImport(t, { ghlFetch, ghlResolve: publicDns({ 'interno.exemplo': '10.0.0.5' }) });
  for (const url of [META, INTERNAL, LOOP]) assert.ok(!seen.includes(url), `o graao pediu ${url}`);
  assert.ok(seen.includes(HOP));
  assert.ok(html.includes(META) && html.includes(INTERNAL) && html.includes(HOP));
  assert.ok(job.notes.some(text => /3 imagens/.test(text)), job.notes.join(' | '));
});

test('a new code cleans up imports that were abandoned halfway', async t => {
  const local = await start(); t.after(local.close);
  const first = await local.call('/api/agency/ghl-import-code', {});
  // A extensão mandou só a primeira parte e a janela foi fechada: o job ficou recebendo, com uma linha temporária.
  const sent = await local.call('/api/ghl-import/part', { name: 'dump', index: 0, total: 2, data: '{"a":' }, fromExtension(first.body.code));
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const temp = async () => (await local.store.list()).filter(row => row.id.startsWith(`ghl-import-${first.body.jobId}`)).length;
  assert.equal(await temp(), 1);
  const owner = await local.store.findAgency({ ghlImports: [{ id: first.body.jobId }] });
  await local.store.change(owner.id, state => { state.ghlImports.find(row => row.id === first.body.jobId).created -= 3 * 60 * 60 * 1000; });
  const second = await local.call('/api/agency/ghl-import-code', {});
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.equal(await temp(), 0, 'as linhas da importação abandonada continuam no banco');
  const old = await local.call(`/api/agency/ghl-import/${first.body.jobId}`);
  assert.equal(old.body.status, 'failed');
});

test('a recent import still in progress keeps its rows when a new code is made', async t => {
  const local = await start(); t.after(local.close);
  const first = await local.call('/api/agency/ghl-import-code', {});
  await local.call('/api/ghl-import/part', { name: 'dump', index: 0, total: 2, data: '{"a":' }, fromExtension(first.body.code));
  await local.call('/api/agency/ghl-import-code', {});
  assert.equal((await local.store.list()).filter(row => row.id.startsWith(`ghl-import-${first.body.jobId}`)).length, 1);
  assert.equal((await local.call(`/api/agency/ghl-import/${first.body.jobId}`)).body.status, 'receiving');
});

test('report says when email templates lost their images', async t => {
  const emailTemplates = [{ id: 'em1', name: 'Boas-vindas', html: `<html><body><p>Olá</p><img src="${IMAGE}"></body></html>` }];
  const { job } = await runImport(t, { source: { ...fixture, dump: { ...fixture.dump, emailTemplates } } });
  assert.ok(job.notes.some(text => /e-mail/.test(text) && /imagens/.test(text)), job.notes.join(' | '));
});

// Segurança (auditoria, item 9, 27/11/2026): /api/ghl-import/part e /done não tinham limite, e cada pedido procura o
// código em todas as agências. Agora, depois de 30 códigos inválidos de uma conexão em 10 minutos, ela recebe 429 antes
// da busca. Quem manda um código válido não é contado: uma importação de verdade tem muitas partes.
test('the 31st invalid import code from one connection gets 429, and a valid import with many parts goes through', async t => {
  const local = await start(); t.after(local.close);
  for (let i = 0; i < 30; i++) {
    const wrong = await local.call('/api/ghl-import/part', { name: 'dump', index: 0, total: 1, data: '{}' }, fromExtension(`ERR-${String(i).padStart(3, '0')}-XYZ`));
    assert.equal(wrong.status, 401, `tentativa ${i + 1}`);
  }
  const blocked = await local.call('/api/ghl-import/done', {}, fromExtension('ERR-999-XYZ'));
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.error, /Muitas tentativas/);

  const other = await start(); t.after(other.close);
  const issued = await other.call('/api/agency/ghl-import-code', {});
  const data = JSON.stringify(fixture.dump);
  const parts = Array.from({ length: 50 }, (_, index) => data.slice(Math.floor(index * data.length / 50), Math.floor((index + 1) * data.length / 50)));
  for (const [index, piece] of parts.entries()) {
    const sent = await other.call('/api/ghl-import/part', { name: 'dump', index, total: parts.length, data: piece }, fromExtension(issued.body.code));
    assert.equal(sent.status, 200, `parte ${index + 1}: ${JSON.stringify(sent.body)}`);
  }
});
