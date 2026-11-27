import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { deadlineOf, embedCode, normalizeTimer, partsOf, zonedToEpoch } from '../ui/countdown-data.js';
import { countdownGif, fontText, frame, HEIGHT, WIDTH } from '../countdown-gif.mjs';
import { renderEmail, normalizeDesign } from '../ui/email-blocks.js';
import { campaignMailer } from '../email-campaign-send.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

/** Decodes every frame of a GIF and composites the partial frames, to check the encoder byte by byte. */
function decodeGif(buf) {
  assert.equal(buf.subarray(0, 6).toString(), 'GIF89a');
  let p = 13 + 3 * (2 << (buf[10] & 7));
  const frames = [];
  while (buf[p] !== 0x3B) {
    if (buf[p] === 0x21) { p += 2; while (buf[p]) p += buf[p] + 1; p++; continue; }
    assert.equal(buf[p], 0x2C);
    const rx = buf[p + 1] | buf[p + 2] << 8, ry = buf[p + 3] | buf[p + 4] << 8, rw = buf[p + 5] | buf[p + 6] << 8;
    p += 10;
    const min = buf[p++], data = [];
    while (buf[p]) { data.push(...buf.subarray(p + 1, p + 1 + buf[p])); p += buf[p] + 1; }
    p++;
    const clear = 1 << min, eoi = clear + 1, out = [];
    let size = min + 1, dict = [], prev = null, bit = 0;
    const reset = () => { dict = Array.from({ length: clear }, (_, i) => [i]); dict.push([], null); size = min + 1; prev = null; };
    reset();
    for (;;) {
      let code = 0;
      for (let i = 0; i < size; i++) code |= ((data[(bit + i) >> 3] >> ((bit + i) & 7)) & 1) << i;
      bit += size;
      if (code === clear) { reset(); continue; }
      if (code === eoi) break;
      const entry = dict[code] ?? [...prev, prev[0]];
      out.push(...entry);
      if (prev) { dict.push([...prev, entry[0]]); if (dict.length === 1 << size && size < 12) size++; }
      prev = entry;
    }
    const base = frames.length ? Uint8Array.from(frames.at(-1)) : new Uint8Array(WIDTH * HEIGHT);
    out.forEach((v, k) => { base[(ry + Math.floor(k / rw)) * WIDTH + rx + k % rw] = v; });
    frames.push(base);
  }
  return frames;
}

test('Fixed timers end at the local time of the sub-account; evergreen ones count from the start', () => {
  assert.equal(new Date(zonedToEpoch('2026-11-27T23:59', 'America/Sao_Paulo')).toISOString(), '2026-11-28T02:59:00.000Z');
  assert.equal(new Date(zonedToEpoch('2026-07-01T12:00', 'Europe/Lisbon')).toISOString(), '2026-07-01T11:00:00.000Z', 'summer time');
  const fixed = normalizeTimer({ name: 'BF', mode: 'date', endLocal: '2026-11-27T23:59', style: { box: 'red', template: 'nope' } }, 'America/Sao_Paulo');
  assert.deepEqual([fixed.endAt, fixed.style.box, fixed.style.template], ['2026-11-28T02:59:00.000Z', '#18181b', 'boxes']);
  assert.throws(() => normalizeTimer({ name: 'x', mode: 'date' }), /data e a hora/);
  assert.throws(() => normalizeTimer({ mode: 'date', endLocal: '2026-11-27T23:59' }), /nome/);
  const ever = normalizeTimer({ name: 'Oferta', mode: 'evergreen', duration: { days: 1, hours: 30, minutes: -5 } });
  assert.deepEqual(ever.duration, { days: 1, hours: 23, minutes: 0 });
  assert.equal(deadlineOf(ever, 1000), 1000 + 47 * 3600e3);
  assert.throws(() => normalizeTimer({ name: 'x', mode: 'evergreen', duration: {} }), /duração/);
  assert.deepEqual(partsOf(90061000), { days: 1, hours: 1, minutes: 1, seconds: 1, total: 90061 });
  assert.equal(partsOf(-5).total, 0);
  assert.match(embedCode('https://app.test', 'demo', 'x"y'), /title="Contagem regressiva"/);
});

test('The GIF has one frame per second, stores only what changes and decodes back to the same pixels', () => {
  const timer = { mode: 'date', style: { template: 'boxes', background: '#ffffff', box: '#18181b', digits: '#ffffff', labels: '#52525b' }, expired: { mode: 'zero' } };
  const left = 3 * 86400e3 + 5 * 3600e3 + 7 * 60e3 + 9e3;
  const gif = countdownGif(timer, left);
  assert.ok(gif.length < 20000, `small enough for e-mail: ${gif.length} bytes`);
  const frames = decodeGif(gif);
  assert.equal(frames.length, 60);
  for (const i of [0, 1, 9, 10, 59]) assert.deepEqual(frames[i], frame(timer, left - i * 1000), `frame ${i}`);
  assert.equal(decodeGif(countdownGif(timer, 4500)).length, 5, 'stops at zero');
  const ended = decodeGif(countdownGif({ ...timer, expired: { mode: 'text', text: 'Promoção encerrada!' } }, -1000));
  assert.equal(ended.length, 1);
  assert.equal(fontText('Promoção encerrada!'), 'PROMOCAO ENCERRADA!');
  assert.ok(ended[0].some(v => v === 3) && !ended[0].some(v => v === 2), 'the text replaces the digits');
  assert.equal(decodeGif(countdownGif({ ...timer, style: { ...timer.style, template: 'minimal' } }, 125 * 86400e3)).length, 60);
});

test('The e-mail Contador block shows the GIF, and a campaign cannot go out with an empty one', () => {
  const s = blank('W');
  const timerId = execute(s, { type: 'save', key: 'countdownTimers', data: { name: 'BF', mode: 'evergreen', duration: { hours: 5 } } });
  const design = normalizeDesign({ blocks: [{ type: 'countdown', timerId, align: 'left' }, { type: 'countdown', timerId: 'bad' }] });
  assert.deepEqual(design.blocks.map(b => b.timerId), [timerId, '']);
  const { html } = renderEmail({ ...design, countdownSrc: id => `https://app.test/cd/demo/${id}.gif?s=1` });
  assert.match(html, new RegExp(`<img src="https://app.test/cd/demo/${timerId}.gif\\?s=1"`));
  assert.match(renderEmail({ ...design, keepUnknown: true }).html, /Escolha o contador/);
  execute(s, { type: 'save', key: 'contacts', data: { name: 'Ana', email: 'ana@exemplo.com' } });
  const id = execute(s, { type: 'save', key: 'emailCampaigns', data: { name: 'C', subject: 'Oi', blocks: [{ type: 'countdown', timerId: '' }] } });
  assert.throws(() => execute(s, { type: 'email-campaign-schedule', id, data: {} }), /Escolha o contador/);
  execute(s, { type: 'save', key: 'emailCampaigns', id, data: { name: 'C', subject: 'Oi', blocks: [{ type: 'countdown', timerId }] } });
  assert.ok(execute(s, { type: 'email-campaign-schedule', id, data: {} }).reach >= 1);
});

test('The GIF and embed routes serve the timer; unknown timers get a blank image', async t => {
  const sent = [];
  const campaignMail = campaignMailer({ key: 're_test', from: 'Graao <no-reply@graao.com>', request: async (input, options) => { sent.push(...JSON.parse(options.body)); return new Response('{"data":[]}', { status: 200 }); } });
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store: createSqliteStore(':memory:'), port: 0, campaignMail });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const action = async command => (await fetch(`${base}/api/action?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) })).json();
  const id = (await action({ type: 'save', key: 'countdownTimers', data: { name: 'Natal <b>', mode: 'evergreen', duration: { days: 2 }, expired: { mode: 'text', text: 'Acabou' } } })).id;

  const gif = await fetch(`${base}/cd/demo/${id}.gif`);
  assert.deepEqual([gif.status, gif.headers.get('content-type'), gif.headers.get('cache-control').includes('no-store')], [200, 'image/gif', true]);
  assert.equal(decodeGif(Buffer.from(await gif.arrayBuffer())).length, 60);
  const old = Math.floor(Date.now() / 1000) - 3 * 86400;
  const clamped = Buffer.from(await (await fetch(`${base}/cd/demo/${id}.gif?s=${old}`)).arrayBuffer());
  assert.equal(decodeGif(clamped).length, 60, 'a send time before the timer existed is clamped to its creation, so it is not expired');
  const blank = await fetch(`${base}/cd/demo/00000000-0000-0000-0000-000000000000.gif`);
  assert.deepEqual([blank.status, Number(blank.headers.get('content-length'))], [200, 42]);

  const page = await fetch(`${base}/cd/demo/${id}`);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors \*/);
  const html = await page.text();
  assert.match(html, /<title>Natal &lt;b&gt;<\/title>/);
  assert.match(html, /localStorage/);
  assert.equal((await fetch(`${base}/cd/demo/00000000-0000-0000-0000-000000000000`)).status, 404);

  const campaign = (await action({ type: 'save', key: 'emailCampaigns', data: { name: 'C', subject: 'Oi', blocks: [{ type: 'text', text: 'Corra!' }, { type: 'countdown', timerId: id }] } })).id;
  await action({ type: 'email-campaign-schedule', id: campaign });
  for (let k = 0; k < 50 && !sent.length; k++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.match(sent[0].html, new RegExp(`src="${base}/cd/demo/${id}\\.gif\\?s=\\d{10}"`), 'the campaign e-mail carries the send time');
});
