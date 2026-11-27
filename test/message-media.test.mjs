import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { createR2 } from '../r2-storage.mjs';
import { createMessageMedia } from '../message-media.mjs';
import { messageMedia, messageParts, textPieces } from '../ui/message-media.js';
import { inboxPage } from '../ui/inbox.js';
import { blank, execute } from '../model.mjs';
import { API_KEY, fakeEvolution } from './helpers/fake-evolution.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const account = 'b'.repeat(32);

function fakeBucket() {
  const objects = new Map();
  const request = async (url, init) => {
    const key = decodeURIComponent(new URL(url).pathname.replace('/graao-arquivos/', ''));
    if (init.method === 'PUT') { objects.set(key, { body: Buffer.from(init.body), type: init.headers['content-type'] }); return new Response('', { status: 200 }); }
    if (init.method === 'DELETE') { objects.delete(key); return new Response(null, { status: 204 }); }
    const found = objects.get(key);
    if (!found) return new Response(null, { status: 404 });
    return new Response(null, { status: 200, headers: { 'content-length': String(found.body.length), 'content-type': found.type } });
  };
  return { objects, r2: createR2({ accountId: account, accessKeyId: 'key', secretAccessKey: 'secret', bucket: 'graao-arquivos', request }) };
}

async function boot(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'graao-message-media-'));
  const store = createSqliteStore(join(dir, 'go.sqlite'));
  const evo = fakeEvolution();
  const { server } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, openAISecret: 'message-media-seal-secret-32-chars!', socialScheduler: false,
    whatsappRequest: evo.request, evolutionBaseUrl: 'https://evo.graao.test', evolutionApiKey: API_KEY, r2: null, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body) => {
    const res = await fetch(`${base}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  await call('/api/whatsapp/workspace/connect?workspace=demo', {});
  evo.markOpen('graao_demo', '5531988887777', 'Demo');
  const live = await call('/api/whatsapp/workspace/status?workspace=demo');
  const hook = new URL(live.body.webhookUrl).pathname;
  let seq = 0;
  const receive = async (message, file) => {
    const id = `MEDIA${++seq}`;
    if (file) evo.media.set(id, file);
    await call(hook, { event: 'messages.upsert', instance: 'graao_demo', data: { key: { fromMe: false, id, remoteJid: '5511977776666@s.whatsapp.net' }, pushName: 'Carlos', message } });
    return store.load('demo').messages.find(m => m.waId === id);
  };
  const open = (message, extra = '') => fetch(`${base}/api/whatsapp/workspace/media?workspace=demo&message=${message.id}${extra}`, { redirect: 'manual' });
  return { store, evo, call, receive, open };
}

test('a mídia recebida guarda tipo, nome e legenda, sem os bytes', async t => {
  const { receive } = await boot(t);
  const photo = await receive({ imageMessage: { mimetype: 'image/jpeg', caption: 'Olha isso', fileLength: '2048', width: 900, height: 600 } });
  assert.equal(photo.body, 'Olha isso');
  assert.deepEqual(photo.media, { kind: 'image', mime: 'image/jpeg', name: '', size: 2048, width: 900, height: 600 });
  const gif = await receive({ videoMessage: { mimetype: 'video/mp4', gifPlayback: true } });
  assert.equal(gif.body, '[GIF]');
  assert.equal(gif.media.kind, 'gif');
  assert.equal((await receive({ stickerMessage: { mimetype: 'image/webp' } })).media.kind, 'sticker');
  const voice = await receive({ audioMessage: { mimetype: 'audio/ogg; codecs=opus', ptt: true, fileLength: { low: 900, high: 0 } } });
  assert.deepEqual(voice.media, { kind: 'audio', mime: 'audio/ogg', name: '', size: 900 });
  const doc = await receive({ documentWithCaptionMessage: { message: { documentMessage: { mimetype: 'application/pdf', fileName: 'proposta.pdf', caption: 'Segue' } } } });
  assert.deepEqual([doc.body, doc.media.kind, doc.media.name], ['Segue', 'document', 'proposta.pdf']);
  assert.equal((await receive({ ptvMessage: { mimetype: 'video/mp4' } })).media.kind, 'video');
  // Foto de um álbum chega dentro de outro envelope.
  assert.equal((await receive({ associatedChildMessage: { message: { imageMessage: { mimetype: 'image/jpeg' } } } })).media.kind, 'image');
  // Visualização única não fica guardada, e acima de 50 MB também não.
  const once = await receive({ viewOnceMessageV2: { message: { imageMessage: { mimetype: 'image/jpeg' } } } });
  assert.deepEqual([once.body, once.media], ['[Imagem de visualização única]', undefined]);
  assert.equal(messageMedia(once), null);
  const big = await receive({ videoMessage: { mimetype: 'video/mp4', fileLength: 60 * 1024 * 1024 } });
  assert.deepEqual([big.body, big.media], ['[Vídeo acima de 50 MB]', undefined]);
  assert.equal((await receive({ conversation: 'só texto' })).media, undefined);
});

test('sem R2, a mídia vem da Evolution a cada abertura, com cabeçalhos seguros', async t => {
  const { receive, open, evo, store } = await boot(t);
  const photo = await receive({ imageMessage: { mimetype: 'image/png' } }, { mimetype: 'image/png', base64: PNG.toString('base64') });
  const res = await open(photo);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /default-src 'none'/);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG);
  const asked = evo.calls.find(c => c.path === '/chat/getBase64FromMediaMessage/graao_demo');
  assert.deepEqual(asked.body, { message: { key: { id: photo.waId } }, convertToMp4: false });

  // Um HTML mandado como documento nunca abre na página: só baixa.
  const html = await receive({ documentMessage: { mimetype: 'text/html', fileName: 'x.html' } }, { mimetype: 'text/html', base64: Buffer.from('<script>1</script>').toString('base64') });
  const page = await open(html);
  assert.equal(page.headers.get('content-type'), 'application/octet-stream');
  assert.match(page.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''x\.html$/);

  // Mensagem de antes desta entrega: só o texto [Figurinha] e o id do WhatsApp.
  const old = await receive({ conversation: '[Figurinha]' }, { mimetype: 'image/webp', base64: PNG.toString('base64') });
  assert.equal((await open(old)).headers.get('content-type'), 'image/webp');

  const gone = await receive({ imageMessage: { mimetype: 'image/png' } });
  assert.equal((await open(gone)).status, 404, 'a Evolution não tem mais a mensagem');
  const text = await receive({ conversation: 'oi' });
  assert.equal((await open(text)).status, 404);
  assert.equal((await open({ id: 'nao-existe' })).status, 404);
  assert.equal(JSON.stringify(store.load('demo')).includes(PNG.toString('base64')), false, 'os bytes não entram no documento');
});

test('com R2, a mídia é guardada ao chegar, abre por link assinado e some com a exclusão definitiva', async t => {
  const { objects, r2 } = fakeBucket();
  const { receive, open, evo, call } = await boot(t, { r2 });
  const photo = await receive({ imageMessage: { mimetype: 'image/png' } }, { mimetype: 'image/png', base64: PNG.toString('base64') });
  const key = `ws/demo/messages/${photo.id}`;
  for (let n = 0; n < 100 && !objects.has(key); n++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(objects.get(key)?.body, PNG, 'guardada logo depois do webhook');
  const before = evo.calls.filter(c => c.path.includes('getBase64')).length;
  const res = await open(photo);
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location'), new RegExp(`/graao-arquivos/${key}\\?`));
  assert.match((await open(photo, '&download=1')).headers.get('location'), /response-content-disposition=attachment/);
  assert.equal(evo.calls.filter(c => c.path.includes('getBase64')).length, before, 'não baixa de novo');

  // A cópia que faltou (Evolution fora do ar na hora) é feita na primeira abertura.
  objects.clear();
  assert.equal((await open(photo)).status, 302);
  assert.ok(objects.has(key));

  // Na lixeira o arquivo fica, porque o contato pode voltar.
  await call('/api/action?workspace=demo', { type: 'delete', key: 'contacts', id: photo.contactId });
  assert.ok(objects.has(key));
  await call('/api/action?workspace=demo', { type: 'contact-trash-purge', id: photo.contactId });
  assert.equal(objects.has(key), false);
});

test('abrir várias mídias da mesma conversa lê o documento da subconta uma vez', async () => {
  const s = { messages: Array.from({ length: 20 }, (_, n) => ({ id: `m${n}`, waId: `W${n}`, channel: 'WhatsApp', direction: 'Inbound', body: '[Imagem]' })) };
  let loads = 0, now = 1;
  const media = createMessageMedia({ r2: null, load: async () => { loads++; return s; }, fetchMedia: async () => ({}), redirect: () => {}, clock: () => now });
  const found = await Promise.all(s.messages.map(m => media.find('demo', m.id)));
  assert.deepEqual(found.map(m => m.waId), s.messages.map(m => m.waId));
  assert.equal(loads, 1);
  s.messages.push({ id: 'nova', waId: 'WN', channel: 'WhatsApp', direction: 'Inbound', body: 'legenda', media: { kind: 'image' } });
  assert.equal((await media.find('demo', 'nova')).waId, 'WN', 'a que acabou de chegar é achada');
  assert.equal(loads, 2);
  now = 61_000;
  await media.find('demo', 'nova');
  assert.equal(loads, 3, 'vale por um minuto');
});

test('buscar mídia lenta não derruba o envio de mensagens', async t => {
  const { receive, open, evo, call, store } = await boot(t);
  const photo = await receive({ imageMessage: { mimetype: 'image/png' } }, { timeout: true });
  for (let n = 0; n < 4; n++) assert.equal((await open(photo)).status, 504);
  const sent = await call('/api/action?workspace=demo', { type: 'message', data: { contactId: photo.contactId, channel: 'WhatsApp', direction: 'Outbound', body: 'oi' } });
  assert.equal(sent.body.delivery?.sent, true);
  assert.ok(store && evo);
});

test('links do texto: http, www, domínio solto e link de rastreamento; pontuação e e-mail ficam de fora', () => {
  const links = text => textPieces(text).filter(piece => piece.href).map(piece => piece.href);
  assert.deepEqual(links('veja https://exemplo.com/a?b=1&c=2, ok'), ['https://exemplo.com/a?b=1&c=2']);
  assert.deepEqual(links('(https://pt.wikipedia.org/wiki/Graao_(app)).'), ['https://pt.wikipedia.org/wiki/Graao_(app)']);
  assert.deepEqual(links('www.graao.com e instagram.com/p/abc'), ['https://www.graao.com', 'https://instagram.com/p/abc']);
  assert.deepEqual(links('fale com ana@gmail.com ou 1.5/2 e fim.Começo javascript:alert(1)'), []);
  const track = `/r/demo/${'a'.repeat(8)}-1111-1111-1111-${'b'.repeat(12)}`;
  assert.deepEqual(links(`clique ${track}`), [track]);
  assert.deepEqual(links(`https://graao.com${track}`), [`https://graao.com${track}`], 'o link completo aparece uma vez só');
  assert.equal(textPieces('a https://x.com/y b').map(piece => piece.text).join(''), 'a https://x.com/y b');
});

test('anexos de workflow, Instagram e Facebook viram mídia; endereço de fora só vira link', () => {
  const out = messageParts({ id: '1', channel: 'WhatsApp', direction: 'Outbound', origin: 'workflow', body: '[Imagem: foto.png] https://cdn.test/foto.png\nLegenda' });
  assert.deepEqual(out, { text: 'Legenda', attachments: [{ kind: 'image', url: 'https://cdn.test/foto.png', name: 'foto.png' }] });
  assert.equal(messageParts({ channel: 'WhatsApp', direction: 'Outbound', body: '[Áudio] https://cdn.test/a.ogg' }).attachments[0].kind, 'audio');
  const ig = messageParts({ channel: 'Instagram', direction: 'Inbound', body: 'oi\n[image] https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1' });
  assert.deepEqual([ig.text, ig.attachments[0].kind], ['oi', 'image']);
  // O contato não escolhe um endereço que o navegador da equipe abriria sozinho.
  for (const body of ['[image] https://rastreador.test/p.png', '[image] https://fbsbx.com.mal.test/p.png', '[image] http://x.fbcdn.net/p.png']) {
    assert.deepEqual(messageParts({ channel: 'Instagram', direction: 'Inbound', body }), { text: body, attachments: [] });
  }
  assert.equal(messageParts({ channel: 'WhatsApp', direction: 'Inbound', body: '[Imagem] https://lookaside.fbsbx.com/x' }).attachments.length, 0);
});

test('a conversa mostra imagem, GIF, figurinha, áudio, vídeo, arquivo e links', () => {
  const s = blank('Inbox');
  const contactId = execute(s, { type: 'save', key: 'contacts', data: { name: 'Ana <b>' } });
  const add = (body, media) => {
    const id = execute(s, { type: 'message', data: { contactId, channel: 'WhatsApp', direction: 'Inbound', body } });
    Object.assign(s.messages.find(m => m.id === id), { waId: `W${s.messages.length}`, ...(media && { media }) });
    return id;
  };
  const photo = add('[Imagem]', { kind: 'image', mime: 'image/jpeg', name: '', size: 1 });
  add('Legenda <i>', { kind: 'video', mime: 'video/mp4', name: '', size: 1 });
  add('[GIF]', { kind: 'gif', mime: 'video/mp4', name: '', size: 1 });
  add('[Figurinha]');
  add('[Áudio]');
  add('[Documento: a"b.pdf]', { kind: 'document', mime: 'application/pdf', name: 'a"b.pdf', size: 2048 });
  add('https://exemplo.com/x');
  const c = { s, workspace: 'demo', view: 'conversations', tab: 'all', query: '', thread: contactId, agency: { users: [] }, access: { name: 'Ana' } };
  const page = inboxPage(c);
  assert.ok(page.includes(`<img src="/api/whatsapp/workspace/media?workspace=demo&amp;message=${photo}"`));
  assert.match(page, /<video[^>]*autoplay[^>]*loop/);
  assert.match(page, /message-media sticker/);
  assert.match(page, /<audio[^>]*controls/);
  assert.match(page, /&amp;download=1/);
  assert.match(page, /a&quot;b\.pdf/);
  assert.match(page, /<a class="text-link" href="https:\/\/exemplo\.com\/x" target="_blank" rel="noopener noreferrer/);
  assert.match(page, /Legenda &lt;i&gt;/);
  assert.equal(/<p>\[(Imagem|GIF|Figurinha|Áudio)\]<\/p>/.test(page), false, 'o marcador some quando a mídia aparece');
});
