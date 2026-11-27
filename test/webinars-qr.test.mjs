import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { blank, execute } from '../model.mjs';
import { qrMatrix, qrSvg } from '../ui/qr.js';

async function start(t) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const send = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers, redirect: 'manual' } : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) });
    return { status: r.status, headers: r.headers, body: await r.json().catch(() => null) };
  };
  const save = (key, data, id) => send('/api/action?workspace=demo', { type: 'save', key, id, data });
  const state = async () => (await send('/api/state?workspace=demo')).body.state;
  return { base, send, save, state };
}
const inMinutes = minutes => new Date(Date.now() + minutes * 60000).toISOString();

test('Webinar registration creates the contact, opens the room at the right time and serves a calendar file', async t => {
  const { base, send, save, state } = await start(t);
  assert.equal((await save('webinars', { name: 'X', sessions: [{ start: 'amanhã', duration: 60 }] })).status, 400);
  const webinar = (await save('webinars', { name: 'Marca forte em 60 minutos', host: 'Luiza', active: true, joinUrl: 'https://meet.example.com/abc', replayUrl: 'https://video.example.com/r', addTags: 'webinar-marca', openBefore: 15,
    sessions: [{ start: inMinutes(3 * 24 * 60), duration: 60 }, { start: inMinutes(5), duration: 60 }, { start: inMinutes(-180), duration: 60 }],
    reminders: [{ minutes: 1440, channel: 'Email', body: 'Oi {{nome}}, amanhã: {{webinar}} {{link}}' }] })).body.state.webinars.at(-1);
  assert.equal(webinar.sessions.length, 3);

  const page = await (await fetch(`${base}/w/demo/${webinar.id}`)).text();
  assert.match(page, /Marca forte em 60 minutos/);
  assert.equal((page.match(/name="sessionId"/g) || []).length, 2, 'past sessions are not offered');

  const [soon, later] = webinar.sessions.filter(session => Date.parse(session.start) > Date.now()).sort((a, b) => a.start.localeCompare(b.start));
  const registered = await send(`/api/webinar/demo/${webinar.id}/register`, { name: 'Rita Lima', email: 'RITA@example.com', sessionId: later.id });
  assert.equal(registered.status, 201);
  const room = registered.body.room;
  assert.match(room, /\/sala\?t=[0-9a-f]{36}$/);
  const waiting = await (await fetch(base + room)).text();
  assert.match(waiting, /data-wb-count/, 'before the room opens there is a countdown');
  assert.doesNotMatch(waiting, /meet.example.com/);

  const again = await send(`/api/webinar/demo/${webinar.id}/register`, { name: 'Rita Lima', email: 'rita@example.com', sessionId: soon.id });
  assert.equal(again.body.room, room, 'registering again moves the same registration');
  const open = await (await fetch(base + room)).text();
  assert.match(open, /href="https:\/\/meet.example.com\/abc"/, 'inside the open window the join button shows');

  const ics = await fetch(`${base}/w/demo/${webinar.id}/agenda.ics?t=${room.split('t=')[1]}`);
  assert.match(ics.headers.get('content-type'), /text\/calendar/);
  assert.match(await ics.text(), /BEGIN:VEVENT[\s\S]*SUMMARY:Marca forte em 60 minutos/);
  assert.equal((await fetch(`${base}/w/demo/${webinar.id}/sala?t=errado`)).status, 404);

  const s = await state();
  const contact = s.contacts.find(row => row.email === 'rita@example.com');
  assert.deepEqual(contact.tags, ['webinar-marca']);
  const registration = s.webinarRegistrations.find(row => row.contactId === contact.id);
  assert.equal(registration.sessionId, soon.id);
  assert.ok(registration.attendedAt, 'opening the room while it is open marks attendance');
});

test('Reminders are written once, only when due, and never for sessions that already ended', () => {
  const s = blank();
  const webinar = execute(s, { type: 'save', key: 'webinars', data: { name: 'Aula', active: true, sessions: [{ start: '2030-05-10T15:00:00Z', duration: 60 }],
    reminders: [{ minutes: 1440, channel: 'Email', body: 'Oi {{nome}}! Amanhã tem {{webinar}}: {{link}}' }, { minutes: 60, channel: 'WhatsApp', body: 'Começa em 1h: {{link}}' }] } });
  const w = s.webinars.find(row => row.id === webinar);
  const reg = execute(s, { type: 'webinar-register', id: webinar, data: { name: 'Caio Prado', email: 'caio@example.com', sessionId: w.sessions[0].id } });
  s.webinarRegistrations.find(row => row.id === reg).created = '2030-05-01T00:00:00.000Z';
  const run = at => execute(s, { type: 'webinar-reminders', data: { at, base: 'https://graao.example', workspace: 'demo' } });
  assert.deepEqual(run('2030-05-09T14:00:00Z'), [], 'nothing is due 25 hours before');
  const first = run('2030-05-09T15:00:30Z');
  assert.deepEqual(first.map(row => row.channel), ['Email']);
  assert.match(first[0].body, /^Oi Caio! Amanhã tem Aula: https:\/\/graao.example\/w\/demo\//);
  assert.deepEqual(run('2030-05-09T15:05:00Z'), [], 'a reminder is written only once');
  assert.deepEqual(run('2030-05-10T14:00:10Z').map(row => row.channel), ['WhatsApp']);
  assert.deepEqual(run('2030-05-10T17:00:00Z'), []);
  const logged = s.messages.filter(row => row.webinarId === webinar);
  assert.deepEqual(logged.map(row => [row.channel, row.direction, row.subject]), [['Email', 'Outbound', 'Lembrete: Aula'], ['WhatsApp', 'Outbound', '']]);
});

test('QR codes encode, redirect through the dynamic link and count scans', async t => {
  const { base, send, save, state } = await start(t);
  assert.equal(qrMatrix('https://graao.app').length, 25);
  assert.match(qrSvg('oi', { fg: '#ff0000' }), /fill="#ff0000"/);
  assert.throws(() => qrMatrix('x'.repeat(300)), /longo demais/);

  assert.equal((await save('qrCodes', { name: 'Ruim', type: 'url', url: 'javascript:alert(1)' })).status, 400);
  const form = (await save('forms', { name: 'Contato', active: true, fields: [{ type: 'email', label: 'E-mail', required: true }] })).body.state.forms.at(-1);
  const site = (await save('qrCodes', { name: 'Cardápio', type: 'url', url: 'https://example.com/cardapio' })).body.state.qrCodes.at(-1);
  const toForm = (await save('qrCodes', { name: 'Balcão', type: 'form', targetId: form.id })).body.state.qrCodes.at(-1);
  const zap = (await save('qrCodes', { name: 'WhatsApp', type: 'whatsapp', phone: '+55 31 98888-1234', message: 'Olá!' })).body.state.qrCodes.at(-1);

  const first = await send(`/q/demo/${site.id}`, undefined, { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile' });
  assert.equal(first.status, 302);
  assert.equal(first.headers.get('location'), 'https://example.com/cardapio');
  await send(`/q/demo/${site.id}`, undefined, { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile' });
  await send(`/q/demo/${site.id}`, undefined, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)' });
  assert.match((await send(`/q/demo/${toForm.id}`)).headers.get('location'), new RegExp(`/form/demo/${form.id}$`));
  assert.equal((await send(`/q/demo/${zap.id}`)).headers.get('location'), 'https://wa.me/5531988881234?text=Ol%C3%A1!');

  let s = await state();
  const counted = s.qrCodes.find(row => row.id === site.id);
  assert.deepEqual([counted.scans, counted.unique], [3, 2], 'the same phone counts once a day as unique');
  assert.deepEqual(counted.devices, { Celular: 2, Computador: 1 });
  assert.ok(!JSON.stringify(counted).includes('iPhone'), 'visitors are stored only as hashes');

  await save('qrCodes', { ...counted, url: 'https://example.com/novo' }, site.id);
  assert.equal((await send(`/q/demo/${site.id}`)).headers.get('location'), 'https://example.com/novo', 'the destination changes after printing');
  await save('qrCodes', { ...counted, active: false }, site.id);
  assert.equal((await send(`/q/demo/${site.id}`)).status, 404);
  await save('forms', { ...form, active: false }, form.id);
  assert.equal((await send(`/q/demo/${toForm.id}`)).status, 404, 'a QR to an unpublished page does not redirect');
});
