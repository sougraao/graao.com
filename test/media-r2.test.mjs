import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createR2 } from '../r2-storage.mjs';
import { CHUNK_BYTES } from '../reputation-media.mjs';

const account = 'b'.repeat(32);
const endpoint = `https://${account}.r2.cloudflarestorage.com/graao-arquivos/`;

// An in-memory bucket behind the real R2 client, so signing and URLs run as in production.
function fakeBucket() {
  const objects = new Map();
  const request = async (url, init) => {
    const key = decodeURIComponent(new URL(url).pathname.replace('/graao-arquivos/', ''));
    if (init.method === 'PUT') { objects.set(key, { body: Buffer.from(init.body), type: init.headers['content-type'] }); return new Response('', { status: 200 }); }
    if (init.method === 'DELETE') { objects.delete(key); return new Response(null, { status: 204 }); }
    const found = objects.get(key);
    if (!found) return new Response(null, { status: 404 });
    // GET com Range: os primeiros bytes, para conferir o tipo pelo conteúdo.
    const range = /bytes=0-(\d+)/.exec(Object.entries(init.headers || {}).find(([name]) => name.toLowerCase() === 'range')?.[1] || '');
    if (init.method === 'GET') return new Response(range ? found.body.subarray(0, Number(range[1]) + 1) : found.body, { status: range ? 206 : 200, headers: { 'content-type': found.type } });
    return new Response(null, { status: 200, headers: { 'content-length': String(found.body.length), 'content-type': found.type } });
  };
  return { objects, r2: createR2({ accountId: account, accessKeyId: 'key', secretAccessKey: 'secret', bucket: 'graao-arquivos', request }) };
}

async function start(t, options) {
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false, ...options });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async r => ({ status: r.status, body: await r.json() }));
  const state = async () => (await fetch(`${base}/api/state`).then(r => r.json())).state;
  return { base, post, state };
}

test('Large Mídia Drive files go straight to R2 and come back through a signed link', async t => {
  const { objects, r2 } = fakeBucket();
  const { base, post, state } = await start(t, { r2 });

  const asked = await post('/api/media/upload-url?workspace=demo', { name: 'Apresentação.mp4', mime: 'video/mp4', size: 2_000_000 });
  assert.equal(asked.status, 200);
  const upload = new URL(asked.body.uploadUrl);
  assert.match(upload.href, new RegExp(`^${endpoint}ws/demo/files/[0-9a-f-]{36}\\?`));
  assert.equal(upload.searchParams.get('X-Amz-SignedHeaders'), 'content-type;host');
  assert.deepEqual(asked.body.headers, { 'Content-Type': 'video/mp4' });
  assert.equal((await post('/api/media/upload-url?workspace=demo', { name: 'x.exe', mime: 'application/x-msdownload', size: 10 })).status, 400);
  assert.equal((await post('/api/media/upload-url?workspace=demo', { name: 'big.mp4', mime: 'video/mp4', size: 60 * 1024 * 1024 })).status, 413);

  assert.equal((await post('/api/media/upload-done?workspace=demo', { token: asked.body.token })).status, 409, 'nothing in the bucket yet');
  const key = decodeURIComponent(upload.pathname.replace('/graao-arquivos/', ''));
  objects.set(key, { body: Buffer.concat([Buffer.from('\0\0\0\x18ftypisom', 'latin1'), Buffer.alloc(2_000_000 - 12)]), type: 'video/mp4' }); // the browser's PUT
  const done = await post('/api/media/upload-done?workspace=demo', { token: asked.body.token });
  assert.equal(done.status, 201);
  const file = done.body.state.files.find(row => row.id === done.body.id);
  assert.deepEqual({ ...file, created: undefined }, { id: key.split('/').pop(), created: undefined, name: 'Apresentação.mp4', data: '', r2Key: key,
    mime: 'video/mp4', size: 2_000_000, src: `/m/demo/${file.id}`, folderId: '', trashedAt: '' });

  const served = await fetch(base + file.src, { redirect: 'manual' });
  assert.equal(served.status, 302);
  const signed = new URL(served.headers.get('location'));
  assert.equal(signed.origin + signed.pathname, endpoint + key);
  assert.match(signed.searchParams.get('response-content-disposition'), /^inline; filename\*=UTF-8''Apresenta%C3%A7%C3%A3o\.mp4$/);
  const download = new URL((await fetch(`${base}${file.src}?download=1`, { redirect: 'manual' })).headers.get('location'));
  assert.match(download.searchParams.get('response-content-disposition'), /^attachment;/);

  // Renaming keeps the object; clients can neither forge an R2 record nor call the server-only command.
  await post('/api/action?workspace=demo', { type: 'save', key: 'files', id: file.id, data: { name: 'Pitch.mp4', data: 'data:text/plain;base64,aGk=' } });
  let s = await state();
  assert.deepEqual(['name', 'data', 'r2Key'].map(field => s.files[0][field]), ['Pitch.mp4', '', key]);
  const forged = await post('/api/action?workspace=demo', { type: 'save', key: 'files', data: { name: 'f.txt', data: 'data:text/plain;base64,aGk=', r2Key: 'ws/other/files/x' } });
  assert.equal((await state()).files.find(row => row.id === forged.body.id).r2Key, undefined);
  assert.equal((await post('/api/action?workspace=demo', { type: 'media-stored', data: { id: 'x', r2Key: 'ws/demo/files/x', mime: 'video/mp4', size: 1 } })).status, 400);

  // A ticket for another workspace, a tampered one, or an object that does not match is refused.
  assert.equal((await post('/api/media/upload-done?workspace=demo', { token: `${asked.body.token}x` })).status, 400);
  const liar = await post('/api/media/upload-url?workspace=demo', { name: 'a.pdf', mime: 'application/pdf', size: 10 });
  const liarKey = decodeURIComponent(new URL(liar.body.uploadUrl).pathname.replace('/graao-arquivos/', ''));
  objects.set(liarKey, { body: Buffer.alloc(11), type: 'application/pdf' });
  assert.equal((await post('/api/media/upload-done?workspace=demo', { token: liar.body.token })).status, 422);
  assert.equal(objects.has(liarKey), false, 'the mismatched object is removed');

  // Emptying the trash deletes the object too.
  await post('/api/action?workspace=demo', { type: 'media-trash', data: { ids: [file.id] } });
  assert.equal(objects.has(key), true, 'the trash keeps the object');
  await post('/api/action?workspace=demo', { type: 'media-empty-trash', data: {} });
  s = await state();
  assert.equal(s.files.some(row => row.id === file.id), false);
  assert.equal(objects.has(key), false);
});

test('Links over 700 KB are imported into R2 when it is configured', async t => {
  const { objects, r2 } = fakeBucket();
  const requested = [];
  const { post } = await start(t, { r2, fetchMedia: async (address, options) => {
    requested.push(options.maxBytes);
    return { status: 200, headers: { 'content-type': 'audio/mpeg' }, body: Buffer.concat([Buffer.from('ID3'), Buffer.alloc(900_000 - 3, 1)]), truncated: false };
  } });
  const imported = await post('/api/media/import?workspace=demo', { url: 'https://cdn.example/podcast.mp3' });
  assert.equal(imported.status, 200);
  const file = imported.body.state.files.find(row => row.id === imported.body.id);
  assert.deepEqual([file.name, file.mime, file.size, file.data], ['podcast.mp3', 'audio/mpeg', 900_000, '']);
  assert.equal(objects.get(file.r2Key).body.length, 900_000);
  assert.deepEqual(requested, [50 * 1024 * 1024 + 1]);
});

test('Without R2 the large-file routes say it is not configured', async t => {
  const { post } = await start(t, { r2: null });
  const asked = await post('/api/media/upload-url?workspace=demo', { name: 'a.mp4', mime: 'video/mp4', size: 2_000_000 });
  assert.equal(asked.status, 503);
  assert.match(asked.body.error, /R2/);
});

test('Finished video testimonials move from chunk rows into R2 and are served from there', async t => {
  const { objects, r2 } = fakeBucket();
  const { base, post, state } = await start(t, { r2 });
  const collectorId = (await post('/api/action', { type: 'save', key: 'videoCollectors', data: { name: 'Clientes', question: 'Como foi?', maxSeconds: 30 } })).body.id;
  const video = Buffer.alloc(CHUNK_BYTES + 99, 3);
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(video);
  const api = step => `/api/depoimento/demo/${collectorId}/${step}`;
  const { uploadId, chunkBytes, total } = (await post(api('start'), { mime: 'video/webm', size: video.length, seconds: 9 })).body;
  for (let i = 0; i < total; i++) await post(api('chunk'), { uploadId, index: i, data: video.subarray(i * chunkBytes, (i + 1) * chunkBytes).toString('base64') });
  assert.equal((await post(api('finish'), { uploadId, name: 'Rita', consent: true })).status, 201);

  const [row] = (await state()).videoTestimonials;
  assert.deepEqual([row.r2Key, row.chunks], [`ws/demo/videos/${row.id}`, 0]);
  assert.deepEqual(objects.get(row.r2Key).body, video);
  const admin = await fetch(`${base}/api/video?id=${row.id}`, { redirect: 'manual' });
  assert.equal(admin.status, 302);
  assert.equal(new URL(admin.headers.get('location')).pathname, `/graao-arquivos/ws/demo/videos/${row.id}`);

  await post('/api/action', { type: 'delete', key: 'videoTestimonials', id: row.id });
  assert.equal(objects.has(row.r2Key), false, 'deleting the testimonial deletes the object');
});

test('AI-generated videos are written to R2 instead of chunk rows', async t => {
  const cron = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'cron-test';
  t.after(() => { process.env.CRON_SECRET = cron || ''; });
  const { objects, r2 } = fakeBucket();
  const mediaAI = { start: async () => 'video_abc', status: async () => ({ status: 'completed', progress: 100, error: '' }), content: async () => Buffer.alloc(800 * 1024, 7) };
  const documentMail = { linkOf: item => item.path ? `https://app.graao.test${item.path}` : '', email: async () => ({ id: 'x' }) };
  const { base, post, state } = await start(t, { r2, mediaAI, documentMail, agentModel: 'gpt-4.1-mini', workflowAI: async () => ({ vars: {} }) });
  await post('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Vídeo', active: true, triggers: [{ type: 'contact_created' }],
    steps: [{ type: 'ai_video_generate', config: { prompt: 'Boas-vindas', seconds: '4', variable: 'video' } }] } });
  await post('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Ana Lima', email: 'ana@example.test', tags: [], custom: {} } });
  let s;
  for (let i = 0; i < 80 && !(s = await state()).aiVideos?.length; i++) {
    await fetch(`${base}/api/social/cron`, { headers: { Authorization: 'Bearer cron-test' } });
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const [video] = s.aiVideos;
  assert.deepEqual([video.r2Key, video.chunks, video.bytes], [`ws/demo/videos/${video.id}`, 0, 800 * 1024]);
  assert.equal(objects.get(video.r2Key).type, 'video/mp4');
  const served = await fetch(`${base}/m/demo/video/${video.id}`, { redirect: 'manual' });
  assert.equal(served.status, 302);
});

// Segurança (auditoria, item 12): no envio grande o navegador escolhe o tipo; o servidor lê o começo do objeto no R2.
test('A large upload whose content does not match its type is refused and removed from R2', async t => {
  const { objects, r2 } = fakeBucket();
  const { post, state } = await start(t, { r2 });
  const body = Buffer.concat([Buffer.from('<html><script>fetch("/api/state")</script>'), Buffer.alloc(1_000_000)]);
  const asked = await post('/api/media/upload-url?workspace=demo', { name: 'foto.png', mime: 'image/png', size: body.length });
  const key = decodeURIComponent(new URL(asked.body.uploadUrl).pathname.replace('/graao-arquivos/', ''));
  objects.set(key, { body, type: 'image/png' });
  const done = await post('/api/media/upload-done?workspace=demo', { token: asked.body.token });
  assert.equal(done.status, 422);
  assert.match(done.body.error, /não confere com o tipo/);
  assert.equal(objects.has(key), false, 'o objeto sai do R2');
  assert.equal((await state()).files.some(file => file.r2Key === key), false);
});
