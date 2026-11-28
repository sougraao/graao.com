import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute, hydrateWorkspace } from '../model.mjs';
import { importedFile, mediaKind } from '../media-model.mjs';
import { requireRecordEffects, requireWorkspaceCommand } from '../authorization.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

const png = 'data:image/png;base64,iVBORw0KGgo=';
const mp3 = 'data:audio/mpeg;base64,SUQz';
const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });

test('Media folders nest, refuse cycles and hand their contents to the parent when deleted', () => {
  const s = blank();
  const top = save(s, 'mediaFolders', { name: 'Campanhas' });
  const child = save(s, 'mediaFolders', { name: 'Black Friday', parentId: top });
  assert.throws(() => save(s, 'mediaFolders', { name: 'Campanhas', parentId: child }, top), /dentro dela mesma/);
  assert.throws(() => save(s, 'mediaFolders', { name: 'X', parentId: 'nao-existe' }), /Pasta não encontrada/);
  const photo = save(s, 'files', { name: 'banner.png', data: png, folderId: child });
  execute(s, { type: 'delete', key: 'mediaFolders', id: child });
  assert.equal(s.files.find(f => f.id === photo).folderId, top);
  execute(s, { type: 'delete', key: 'mediaFolders', id: top });
  assert.equal(s.files.find(f => f.id === photo).folderId, '');
});

test('Files rename and move without resending data, go to trash, restore and empty the trash', () => {
  const s = blank();
  const folder = save(s, 'mediaFolders', { name: 'Áudios' });
  const song = save(s, 'files', { name: 'vinheta.mp3', data: mp3 });
  const photo = save(s, 'files', { name: 'foto.png', data: png });
  save(s, 'files', { name: 'vinheta-final.mp3', folderId: folder }, song);
  const moved = s.files.find(f => f.id === song);
  assert.deepEqual([moved.name, moved.folderId, moved.data], ['vinheta-final.mp3', folder, mp3]);
  assert.equal(mediaKind(moved.data), 'audio');

  execute(s, { type: 'media-trash', data: { ids: [song, photo] } });
  assert.ok(s.files.every(f => f.trashedAt));
  execute(s, { type: 'delete', key: 'mediaFolders', id: folder });
  execute(s, { type: 'media-restore', data: { ids: [song] } });
  assert.deepEqual([s.files.find(f => f.id === song).trashedAt, s.files.find(f => f.id === song).folderId], ['', '']);
  execute(s, { type: 'media-empty-trash' });
  assert.deepEqual(s.files.map(f => f.id), [song]);
});

test('Only supported media types are stored', () => {
  const s = blank();
  assert.throws(() => save(s, 'files', { name: 'x.svg', data: 'data:image/svg+xml;base64,PHN2Zz4=' }), /arquivo/);
  for (const data of ['data:video/mp4;base64,AAAAGGZ0eXBpc29t', 'data:text/csv;base64,YSxi', 'data:application/pdf;base64,JVBERi0=']) save(s, 'files', { name: 'ok', data });
  assert.deepEqual(s.files.map(f => mediaKind(f.data)), ['video', 'doc', 'doc']);
});

test('Older workspaces gain media folders and trash commands need the media module', () => {
  const legacy = blank();
  delete legacy.mediaFolders;
  assert.deepEqual(hydrateWorkspace(legacy).mediaFolders, []);
  const marketingOnly = { modules: ['marketing'] };
  assert.throws(() => requireWorkspaceCommand(marketingOnly, { type: 'media-trash', data: { ids: [] } }));
  assert.throws(() => requireWorkspaceCommand(marketingOnly, { type: 'save', key: 'mediaFolders', data: {} }));
  requireWorkspaceCommand({ modules: ['media'] }, { type: 'media-empty-trash' });

  const s = blank();
  const used = save(s, 'files', { name: 'post.png', data: png });
  s.socialPosts.push({ id: 'p1', status: 'draft', media: [{ fileId: used }] });
  execute(s, { type: 'media-trash', data: { ids: [used] } });
  assert.throws(() => requireRecordEffects({ modules: ['media'] }, s, { type: 'media-empty-trash' }));
});

test('URL imports keep the remote type and name, and refuse pages and oversized files', () => {
  const ok = importedFile({ status: 200, headers: { 'content-type': 'image/png; charset=binary' }, body: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), truncated: false },
    'https://cdn.example/fotos/Logo%20Final.png?v=2');
  assert.deepEqual(ok, { name: 'Logo Final.png', data: 'data:image/png;base64,iVBORw0KGgo=' });
  assert.throws(() => importedFile({ status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<html>') }, 'https://youtube.com/watch'), /link direto/);
  assert.throws(() => importedFile({ status: 200, headers: { 'content-type': 'image/png' }, body: Buffer.alloc(10), truncated: true }, 'https://a.example/x.png'), /700 KB/);
  assert.throws(() => importedFile({ status: 404, headers: {}, body: Buffer.alloc(0) }, 'https://a.example/x.png'), /404/);
});

test('Upload URL imports a remote file into the chosen folder through the media route', async t => {
  const requested = [];
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false,
    fetchMedia: async (address, options) => {
      requested.push([address, options.maxBytes]);
      return { status: 200, headers: { 'content-type': 'image/gif' }, body: Buffer.from('GIF89a'), truncated: false };
    } });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = async (path, body) => {
    const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const folder = await post('/api/action?workspace=demo', { type: 'save', key: 'mediaFolders', data: { name: 'Importados' } });
  const imported = await post('/api/media/import?workspace=demo', { url: 'https://cdn.example/a/anim.gif', folderId: folder.body.id });
  assert.equal(imported.status, 200);
  const file = imported.body.state.files.find(row => row.id === imported.body.id);
  assert.deepEqual([file.name, file.folderId, file.data], ['anim.gif', folder.body.id, 'data:image/gif;base64,R0lGODlh']);
  assert.deepEqual(requested, [['https://cdn.example/a/anim.gif', 700_001]]);
  assert.equal((await post('/api/media/import?workspace=demo', { url: 42 })).status, 400);
});

// Segurança (auditoria, item 12, 27/11/2026): o tipo do arquivo vinha só do navegador. Agora o começo do arquivo precisa
// bater com ele, no envio direto, na importação por link e no envio grande para o R2 (test/media-r2.test.mjs).
const html = `data:image/png;base64,${Buffer.from('<html><script>alert(1)</script>').toString('base64')}`;

test('A file whose content does not match its type is refused, inline and by link', () => {
  const s = blank('Bytes');
  assert.throws(() => save(s, 'files', { name: 'foto.png', data: html }), /não confere com o tipo/);
  assert.throws(() => execute(s, { type: 'portal-file', data: { name: 'foto.png', data: html, email: 'ana@exemplo.com' } }), /não confere com o tipo/);
  assert.throws(() => importedFile({ status: 200, headers: { 'content-type': 'image/png' }, body: Buffer.from('<html>oi</html>'), truncated: false }, 'https://a.example/x.png'), /não confere com o tipo/);
  for (const data of [png, mp3, 'data:image/jpeg;base64,/9j/4AAQ', 'data:image/gif;base64,R0lGODlh', 'data:image/webp;base64,UklGRiQAAABXRUJQ', 'data:audio/ogg;base64,T2dnUw==',
    'data:audio/wav;base64,UklGRiQAAABXQVZF', 'data:video/webm;base64,GkXfow==', 'data:text/plain;base64,b2k='])
    save(s, 'files', { name: 'ok', data });
});

test('Files saved before the check can still be renamed and moved', () => {
  const s = blank('Antigo');
  const id = save(s, 'files', { name: 'foto.png', data: png });
  const row = s.files.find(file => file.id === id);
  row.data = html;   // gravado antes desta conferência
  save(s, 'files', { ...row, name: 'foto antiga.png' }, id);
  save(s, 'files', { name: 'só o nome.png' }, id);
  assert.equal(s.files.find(file => file.id === id).name, 'só o nome.png');
  assert.throws(() => save(s, 'files', { name: 'novo.png', data: `data:image/png;base64,${Buffer.from('<svg/>').toString('base64')}` }, id), /não confere com o tipo/);
});
