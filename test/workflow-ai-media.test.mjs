import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { generateImage, startVideo, videoContent, videoStatus } from '../openai-media.mjs';
import { actionSpec } from '../ui/workflow-data.js';

const PNG = Buffer.from('fake-webp-image').toString('base64');

test('The OpenAI calls: an image as WebP data, a video job, its status and its MP4', async () => {
  const calls = [];
  const request = async (url, init = {}) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : null, auth: init.headers?.Authorization });
    if (url.endsWith('/images/generations')) return new Response(JSON.stringify({ data: [{ b64_json: PNG }], usage: { input_tokens: 20, output_tokens: 100 } }));
    if (url.endsWith('/videos')) return new Response(JSON.stringify({ id: 'video_123', status: 'queued' }));
    if (url.endsWith('/videos/video_123')) return new Response(JSON.stringify({ id: 'video_123', status: 'completed', progress: 100 }));
    if (url.endsWith('/videos/video_123/content')) return new Response(Buffer.from('mp4-bytes'));
    return new Response('{}', { status: 404 });
  };
  const usage = [];
  const connection = { apiKey: 'sk-test', request, onUsage: row => usage.push(row) };
  assert.equal(await generateImage(connection, { prompt: 'Um bolo', size: '1536x1024', quality: 'low' }), `data:image/webp;base64,${PNG}`);
  assert.deepEqual(calls[0].body, { model: 'gpt-image-1', prompt: 'Um bolo', n: 1, size: '1536x1024', quality: 'low', output_format: 'webp', output_compression: 70 });
  assert.equal(calls[0].auth, 'Bearer sk-test');
  assert.equal(usage[0].model, 'gpt-image-1');
  assert.equal(await startVideo(connection, { prompt: 'Café', seconds: '8', size: '720x1280' }), 'video_123');
  assert.deepEqual(calls[1].body, { model: 'sora-2', prompt: 'Café', seconds: '8', size: '720x1280' });
  assert.deepEqual(await videoStatus(connection, 'video_123'), { status: 'completed', progress: 100, error: '' });
  assert.equal(String(await videoContent(connection, 'video_123')), 'mp4-bytes');
  const big = async () => new Response(JSON.stringify({ data: [{ b64_json: 'A'.repeat(1_000_000) }] }));
  await assert.rejects(generateImage({ apiKey: 'k', request: big }, { prompt: 'x' }), /700 KB/);
  assert.deepEqual(actionSpec('ai_image_generate').fields.map(field => field.key), ['prompt', 'size', 'quality', 'variable']);
  assert.deepEqual(actionSpec('ai_video_generate').fields.map(field => field.key), ['prompt', 'seconds', 'size', 'variable']);
});

test('Workflows generate an image (public file and link) and a video (job checked every cycle, stored in chunks)', async t => {
  const cron = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'cron-test';
  t.after(() => { process.env.CRON_SECRET = cron || ''; });
  let videoState = 'in_progress';
  const seen = [];
  const mediaAI = {
    image: async (connection, item) => { seen.push(['image', item.prompt, item.size]); return `data:image/webp;base64,${PNG}`; },
    start: async (connection, item) => { seen.push(['video', item.prompt, item.seconds]); return 'video_abc'; },
    status: async () => ({ status: videoState, progress: videoState === 'completed' ? 100 : 40, error: '' }),
    content: async () => Buffer.alloc(800 * 1024, 7)
  };
  const documentMail = { linkOf: item => item.path ? `https://app.graao.test${item.path}` : '', email: async () => ({ id: 'x' }) };
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false, agentModel: 'gpt-4.1-mini',
    workflowAI: async () => ({ vars: {} }), mediaAI, documentMail });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => (await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) })).json();
  const state = async () => (await call('/api/state?workspace=demo')).state;
  const until = async check => { for (let i = 0; i < 80; i++) { const s = await state(); if (check(s)) return s; await new Promise(resolve => setTimeout(resolve, 20)); } assert.fail('timed out'); };
  await call('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Mídia', active: true, triggers: [{ type: 'contact_created' }], steps: [
    { type: 'ai_image_generate', config: { prompt: 'Cartão de boas-vindas para {{contact.first_name}}', size: '1024x1024', variable: 'cartao' } },
    { type: 'ai_video_generate', config: { prompt: 'Vídeo de boas-vindas', seconds: '4', variable: 'video' } },
    { type: 'add_note', config: { body: 'Imagem {{vars.cartao}} e vídeo {{vars.video}}' } }
  ] } });
  await call('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Ana Lima', email: 'ana@example.test', tags: [], custom: {} } });

  let s = await until(s => s.aiVideoJobs?.length === 1);
  const file = s.files.find(row => row.source === 'ai');
  assert.equal(file.public, true);
  assert.deepEqual(seen[0], ['image', 'Cartão de boas-vindas para Ana', '1024x1024']);
  const run = s.runs.find(row => row.name === 'Mídia');
  assert.equal(run.vars.cartao, `https://app.graao.test/m/demo/${file.id}`);
  assert.equal(run.status, 'Waiting', 'the run waits for the video');
  assert.equal((await fetch(`${base}/m/demo/${file.id}`)).headers.get('content-type'), 'image/webp');

  const tick = () => fetch(`${base}/api/social/cron`, { headers: { Authorization: 'Bearer cron-test' } });
  await tick();
  assert.equal((await state()).aiVideoJobs.length, 1, 'still rendering');
  videoState = 'completed';
  await tick();
  s = await until(s => s.runs.find(row => row.name === 'Mídia').status === 'Completed');
  assert.equal(s.aiVideoJobs.length, 0);
  const [video] = s.aiVideos;
  assert.deepEqual([video.chunks, video.bytes, video.mime], [2, 800 * 1024, 'video/mp4']);
  const done = s.runs.find(row => row.name === 'Mídia');
  assert.equal(done.vars.video, `https://app.graao.test/m/demo/video/${video.id}`);
  assert.ok(s.messages.some(row => row.channel === 'Note' && row.body === `Imagem https://app.graao.test/m/demo/${file.id} e vídeo https://app.graao.test/m/demo/video/${video.id}`));
  const mp4 = await fetch(`${base}/m/demo/video/${video.id}`);
  assert.equal(mp4.headers.get('content-type'), 'video/mp4');
  assert.equal((await mp4.arrayBuffer()).byteLength, 800 * 1024);
});
