import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSqliteStore } from '../storage.mjs';
import { makeServer } from '../server.mjs';
import { createWhatsAppHandler } from '../whatsapp.mjs';
import { createWhatsAppGuard, guardTimes } from '../whatsapp-guard.mjs';
import { API_KEY, fakeEvolution } from './helpers/fake-evolution.mjs';

const SECRET = 'guard-test-seal-secret-32-characters!';
const ORIGIN = 'https://graao.test';
const MIN = 60_000;
const START = Date.parse('2026-11-25T12:00:00.000Z');

// Uma subconta conectada (demo), a vigia com relógio controlado e uma Evolution falsa que pode quebrar.
async function setup(t, { connected = true } = {}) {
  const evo = fakeEvolution();
  const world = { now: START, fault: null, incidents: [], delivered: [] };
  const request = (url, init) => (world.fault ? world.fault(url, init) : null) || evo.request(url, init);
  const dir = mkdtempSync(join(tmpdir(), 'graao-guard-'));
  const store = createSqliteStore(join(dir, 'go.sqlite'));
  const server = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, openAISecret: SECRET, socialScheduler: false, whatsappRequest: request, evolutionBaseUrl: 'https://evo.graao.test', evolutionApiKey: API_KEY });
  await new Promise(done => server.server.listen(0, '127.0.0.1', done));
  t.after(async () => { await new Promise(done => server.server.close(done)); rmSync(dir, { recursive: true, force: true }); });
  const wa = createWhatsAppHandler({ store, secret: SECRET, request, evolutionBaseUrl: 'https://evo.graao.test', evolutionApiKey: API_KEY, qrPause: 1 });
  const api = (op, method = 'POST', body = {}) => wa.handleWorkspaceApi({ req: {}, url: new URL(`http://x/api/whatsapp/workspace/${op}`), method, agencyId: 'agency', workspaceId: 'demo',
    payload: async () => body, publicOrigin: ORIGIN, requireActiveAccount: async () => {}, json: data => data });
  if (connected) {
    await api('connect');
    evo.markOpen('graao_demo', '5531988887777', 'Demo');
    await api('status', 'GET');
  }
  const guard = createWhatsAppGuard({ wa: wa.guardOps, store, now: () => world.now, onIncident: async event => { world.incidents.push(event); }, onStored: id => world.delivered.push(id), log: () => {} });
  const round = async (minutes = 2) => { world.now += minutes * MIN; return guard.run('agency', ['demo'], ORIGIN); };
  const state = () => store.load('demo');
  const saved = () => store.load('whatsapp-agency').subaccounts.demo;
  const received = (id, text, at, extra = {}) => evo.store.push({ instance: 'graao_demo', key: { id, remoteJid: '5511977776666@s.whatsapp.net', fromMe: false, ...extra }, pushName: 'Carla', message: { conversation: text }, messageTimestamp: Math.floor(at / 1000) });
  const addOutbound = async (id, failed, createdAt, more = {}) => store.change('demo', s => {
    let contact = s.contacts.find(c => c.phone === '+5511977776666');
    if (!contact) { contact = { id: 'c-carla', name: 'Carla', phone: '+5511977776666', tags: [], custom: {}, created: new Date(START).toISOString() }; s.contacts.push(contact); }
    s.messages.push({ id, contactId: contact.id, body: `corpo ${id}`, channel: 'WhatsApp', direction: 'Outbound', read: true, starred: false, origin: 'human', subject: '', created: new Date(createdAt).toISOString(), failed, ...more });
  });
  const sends = () => evo.calls.filter(c => c.path.startsWith('/message/sendText/'));
  const base = () => `http://127.0.0.1:${server.server.address().port}`;
  return { evo, world, store, wa, api, base, round, state, saved, received, addOutbound, sends };
}
const down = () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); };

test('Mensagem que o webhook perdeu é recuperada uma vez só, na hora em que foi escrita', async t => {
  const w = await setup(t);
  await w.round();
  w.received('PERDIDA', 'Você recebeu?', w.world.now + 30_000);
  w.received('ECO', 'resposta minha', w.world.now + 31_000, { fromMe: true });
  w.received('GRUPO', 'grupo', w.world.now + 32_000, { remoteJid: '120363000000000000@g.us' });
  const written = w.world.now + 30_000;
  await w.round();
  let found = w.state().messages.filter(m => m.body === 'Você recebeu?');
  assert.equal(found.length, 1);
  assert.equal(found[0].waId, 'PERDIDA');
  assert.equal(Date.parse(found[0].created), Math.floor(written / 1000) * 1000);
  assert.equal(found[0].recovered, true);
  assert.equal(w.state().messages.some(m => /resposta minha|grupo/.test(m.body)), false);
  assert.deepEqual(w.world.delivered, ['demo'], 'os fluxos (Cliente respondeu) rodam');
  for (let i = 0; i < 8; i++) await w.round();
  found = w.state().messages.filter(m => m.body === 'Você recebeu?');
  assert.equal(found.length, 1, 'as próximas rodadas não repetem');
  assert.equal(w.saved().guard.recovered, 1);
});

test('A busca não traz o histórico de antes da conexão nem mensagem que o webhook ainda está entregando', async t => {
  const w = await setup(t);
  // Dentro da sobreposição da busca, mas antes da conexão.
  w.received('ANTIGA', 'de ontem', START - 3 * MIN);
  await w.round();
  w.received('AGORA', 'acabou de chegar', w.world.now + 2 * MIN - 5_000);
  await w.round();
  assert.equal(w.state().messages.some(m => ['de ontem', 'acabou de chegar'].includes(m.body)), false);
  await w.round();
  assert.equal(w.state().messages.filter(m => m.body === 'acabou de chegar').length, 1);
  assert.equal(w.state().messages.some(m => m.body === 'de ontem'), false);
});

test('Busca que falha não avança o marcador: a próxima rodada ainda encontra a mensagem, mesmo horas depois', async t => {
  const w = await setup(t);
  await w.round();
  w.received('HORAS', 'durante a queda', w.world.now + 10_000);
  w.world.fault = url => String(url).includes('/chat/findMessages/') ? new Response('{}', { status: 500 }) : null;
  for (let i = 0; i < 20; i++) await w.round(10);
  assert.equal(w.state().messages.some(m => m.body === 'durante a queda'), false);
  w.world.fault = null;
  await w.round();
  assert.equal(w.state().messages.filter(m => m.body === 'durante a queda').length, 1);
});

test('Muitas mensagens perdidas de uma vez: todas entram, da mais antiga para a mais nova', async t => {
  const w = await setup(t);
  await w.round();
  for (let i = 0; i < 250; i++) w.received(`LOTE${i}`, `mensagem ${i}`, w.world.now + 10_000 + i * 1000);
  await w.round(10);
  const bodies = w.state().messages.filter(m => m.body.startsWith('mensagem ')).map(m => m.body);
  assert.equal(bodies.length, 250);
  assert.equal(new Set(bodies).size, 250);
  const order = w.state().messages.filter(m => m.recovered).sort((a, b) => Date.parse(a.created) - Date.parse(b.created)).map(m => m.body);
  assert.equal(order[0], 'mensagem 0');
  assert.equal(order.at(-1), 'mensagem 249');
  assert.deepEqual(bodies, [...bodies].sort((a, b) => Number(a.slice(9)) - Number(b.slice(9))), 'guardadas na ordem em que foram escritas');
});

test('Busca que não leu tudo entra com o que leu, mas não avança o marcador', async t => {
  const w = await setup(t);
  await w.round();
  const before = w.saved().guard.sweptUntil;
  // Uma caixa sem fim: toda página vem cheia e sempre há mais uma.
  let pages = 0;
  w.world.fault = url => {
    if (!String(url).includes('/chat/findMessages/')) return null;
    pages++;
    const records = Array.from({ length: 100 }, (_, i) => ({ key: { id: `P${pages}-${i}`, remoteJid: '5511977776666@s.whatsapp.net', fromMe: false }, pushName: 'Carla', message: { conversation: `cheia ${pages}-${i}` }, messageTimestamp: Math.floor(w.world.now / 1000) - 60 }));
    return new Response(JSON.stringify({ messages: { total: 1e6, pages: 1e4, currentPage: pages, records } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await w.round(30);
  assert.ok(pages > 1 && pages <= 50, 'para no limite de páginas');
  assert.ok(w.state().messages.some(m => m.body.startsWith('cheia ')));
  assert.equal(w.saved().guard.sweptUntil, before, 'a próxima rodada volta ao mesmo ponto');
});

test('Webhook apagado ou com outro segredo no servidor é registrado de novo, sem trocar o domínio', async t => {
  const w = await setup(t);
  await w.round();
  const good = w.evo.instances.get('graao_demo').webhook.url;
  w.evo.instances.get('graao_demo').webhook = null;
  await w.round(12);
  assert.equal(w.evo.instances.get('graao_demo').webhook.url, good);
  w.evo.instances.get('graao_demo').webhook = { enabled: true, url: good.replace(/[a-f0-9]{48}$/, '0'.repeat(48)), events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] };
  await w.round(12);
  assert.equal(w.evo.instances.get('graao_demo').webhook.url, good);
  assert.equal(w.saved().guard.webhookFixes, 2);
  // O cron pode ser chamado por outro endereço da Vercel: um webhook certo em outro domínio fica onde está.
  w.evo.instances.get('graao_demo').webhook.url = good.replace('graao.test', 'app.graao.test');
  await w.round(12);
  assert.equal(new URL(w.evo.instances.get('graao_demo').webhook.url).host, 'app.graao.test');
  assert.equal(w.saved().guard.webhookFixes, 2);
});

test('Webhook registrado antes das ligações passa a receber CALL sem reconectar o número', async t => {
  const w = await setup(t);
  await w.round();
  const webhook = w.evo.instances.get('graao_demo').webhook;
  w.evo.instances.get('graao_demo').webhook = { ...webhook, events: ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'] };
  await w.round(12);
  assert.deepEqual(w.evo.instances.get('graao_demo').webhook.events, ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'CALL']);
});

test('Queda avisa uma vez depois de 5 minutos, marca a subconta e avisa a volta', async t => {
  const w = await setup(t);
  await w.round();
  w.evo.instances.get('graao_demo').state = 'close';
  await w.round();
  assert.equal(w.world.incidents.length, 0, 'queda curta não vira alerta');
  assert.equal(w.state().whatsappHealth, undefined);
  for (let i = 0; i < 6; i++) await w.round();
  assert.deepEqual(w.world.incidents.map(e => [e.kind, e.reason]), [['down', 'disconnected']]);
  assert.equal(w.state().whatsappHealth.status, 'down');
  w.evo.instances.get('graao_demo').state = 'open';
  await w.round();
  assert.deepEqual(w.world.incidents.map(e => e.kind), ['down', 'up']);
  assert.equal(w.state().whatsappHealth, undefined);
});

test('Servidor inteiro fora do ar também avisa, com o motivo certo', async t => {
  const w = await setup(t);
  await w.round();
  w.world.fault = () => down();
  for (let i = 0; i < 4; i++) await w.round();
  assert.deepEqual(w.world.incidents.map(e => [e.kind, e.reason]), [['down', 'server']]);
});

test('Desconectar de propósito e nunca ter conectado não são incidente', async t => {
  const w = await setup(t);
  await w.round();
  await w.api('disconnect');
  for (let i = 0; i < 6; i++) await w.round();
  assert.equal(w.world.incidents.length, 0);
  const fresh = await setup(t, { connected: false });
  await fresh.api('connect');
  for (let i = 0; i < 6; i++) await fresh.round();
  assert.equal(fresh.world.incidents.length, 0);
});

test('Número "conectado" que não responde é reiniciado depois de 3 falhas, no máximo uma vez por hora', async t => {
  const w = await setup(t);
  await w.round();
  let hang = true;
  w.world.fault = url => hang && String(url).includes('/chat/fetchBusinessProfile/') ? new Response(JSON.stringify({ message: 'Timed Out' }), { status: 500 }) : null;
  const restarts = () => w.evo.calls.filter(c => c.path.startsWith('/instance/restart/')).length;
  await w.round(11); await w.round(11);
  assert.equal(restarts(), 0, 'uma ou duas falhas não bastam');
  await w.round(11);
  assert.equal(restarts(), 1);
  for (let i = 0; i < 4; i++) await w.round(11);
  assert.equal(restarts(), 1, 'ainda dentro da mesma hora');
  hang = false;
  for (let i = 0; i < 8; i++) await w.round(11);
  assert.equal(restarts(), 1, 'voltou a responder: não reinicia mais');
  assert.equal(w.saved().guard.probeFails, 0);
});

test('Número em que essa pergunta nunca funcionou não é reiniciado; travado de vez, no máximo 3 vezes', async t => {
  const broken = url => String(url).includes('/chat/fetchBusinessProfile/') ? new Response('{}', { status: 500 }) : null;
  const restarts = w => w.evo.calls.filter(c => c.path.startsWith('/instance/restart/')).length;
  const never = await setup(t);
  never.world.fault = broken;
  for (let i = 0; i < 30; i++) await never.round(11);
  assert.equal(restarts(never), 0);
  const stuck = await setup(t);
  await stuck.round();
  stuck.world.fault = broken;
  for (let i = 0; i < 60; i++) await stuck.round(11);
  assert.equal(restarts(stuck), 3);
  stuck.world.fault = null;
  await stuck.round(11);
  stuck.world.fault = broken;
  for (let i = 0; i < 4; i++) await stuck.round(11);
  assert.equal(restarts(stuck), 4, 'voltou a responder: a conta recomeça');
});

test('Resposta que com certeza não saiu é reenviada uma vez quando o número volta', async t => {
  const w = await setup(t);
  await w.round();
  await w.addOutbound('m1', 'not_connected', w.world.now);
  await w.round();
  assert.equal(w.sends().length, 1);
  assert.deepEqual(w.sends()[0].body, { number: '5511977776666', text: 'corpo m1' });
  assert.equal(w.state().messages.find(m => m.id === 'm1').failed, undefined);
  for (let i = 0; i < 4; i++) await w.round();
  assert.equal(w.sends().length, 1, 'não repete');
});

test('O que pode ter saído, o que é velho e o contato em não perturbe nunca são reenviados', async t => {
  const w = await setup(t);
  await w.round();
  await w.addOutbound('velha', 'not_connected', w.world.now - guardTimes.resend - MIN);
  await w.addOutbound('duvida', 'unconfirmed', w.world.now);
  await w.addOutbound('recusada', 'provider_error', w.world.now);
  for (let i = 0; i < 4; i++) await w.round();
  assert.equal(w.sends().length, 0);
  await w.store.change('demo', s => { s.contacts.find(c => c.id === 'c-carla').dnd = true; });
  await w.addOutbound('dnd', 'not_connected', w.world.now);
  await w.round();
  assert.equal(w.sends().length, 0);
});

test('Com um fluxo de "Falha no envio" ativo, o reenvio automático não age', async t => {
  const w = await setup(t);
  await w.round();
  await w.store.change('demo', s => { s.workflows.push({ id: 'wf', name: 'Avisar por e-mail', active: true, triggers: [{ type: 'message_failed' }], steps: [] }); });
  await w.addOutbound('m1', 'not_connected', w.world.now);
  await w.round();
  assert.equal(w.sends().length, 0);
});

test('Reenvio que fica sem resposta vira "não confirmada" e não repete; servidor caído tenta de novo, até 3 vezes', async t => {
  const w = await setup(t);
  await w.round();
  await w.addOutbound('m1', 'server_down', w.world.now);
  let tries = 0;
  w.world.fault = url => String(url).includes('/message/sendText/') ? (tries++, new Response('{}', { status: 500 })) : null;
  for (let i = 0; i < 4; i++) await w.round();
  assert.equal(tries, 1);
  assert.equal(w.state().messages.find(m => m.id === 'm1').failed, 'unconfirmed');
  await w.addOutbound('m2', 'server_down', w.world.now);
  tries = 0;
  w.world.fault = url => { if (String(url).includes('/message/sendText/')) { tries++; down(); } return null; };
  for (let i = 0; i < 6; i++) await w.round();
  assert.equal(tries, 3);
  assert.equal(w.state().messages.find(m => m.id === 'm2').failed, 'server_down');
});

test('Processo que cai no meio do reenvio deixa a mensagem como não confirmada, nunca para repetir', async t => {
  const w = await setup(t);
  await w.round();
  await w.addOutbound('m1', 'not_connected', w.world.now);
  const change = w.store.change;
  let claims = 0;
  // O resultado nunca é gravado: só a reserva.
  w.store.change = (id, fn) => { if (id === 'demo' && ++claims > 1) throw new Error('banco fora'); return change.call(w.store, id, fn); };
  await w.round();
  w.store.change = change;
  assert.equal(w.state().messages.find(m => m.id === 'm1').failed, 'unconfirmed');
  for (let i = 0; i < 4; i++) await w.round();
  assert.equal(w.sends().length, 1);
});

test('Envio: 502 e conexão cortada nunca repetem na hora; conexão recusada repete uma vez', async t => {
  const w = await setup(t);
  let tries = 0, answer = null;
  w.world.fault = url => String(url).includes('/message/sendText/') ? (tries++, answer()) : null;
  const send = () => w.wa.sendWorkspaceText('agency', 'demo', '5511977776666', 'Oi', async () => true);
  answer = () => new Response('{}', { status: 502 });
  assert.deepEqual(await send(), { sent: false, reason: 'unconfirmed' });
  assert.equal(tries, 1);
  tries = 0; answer = () => { throw Object.assign(new TypeError('x'), { cause: { code: 'ECONNRESET' } }); };
  assert.deepEqual(await send(), { sent: false, reason: 'unconfirmed' });
  assert.equal(tries, 1);
  tries = 0; answer = down;
  assert.deepEqual(await send(), { sent: false, reason: 'server-down' });
  assert.equal(tries, 2);
});

test('Servidor que não responde 3 vezes seguidas para de segurar os envios', async t => {
  const w = await setup(t);
  let tries = 0;
  w.world.fault = url => { if (String(url).includes('/message/sendText/')) { tries++; throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); } return null; };
  const send = () => w.wa.sendWorkspaceText('agency', 'demo', '5511977776666', 'Oi', async () => true);
  for (let i = 0; i < 3; i++) assert.equal((await send()).reason, 'unconfirmed');
  assert.equal((await send()).reason, 'server-down', 'nem tenta: com certeza não saiu');
  assert.equal(tries, 3);
});

test('A Evolution que entrega no próprio número em vez do contato não conta como enviada', async t => {
  const w = await setup(t);
  const reply = jid => { w.world.fault = url => String(url).includes('/message/sendText/') ? new Response(JSON.stringify({ key: { id: 'X', remoteJid: jid } }), { status: 201 }) : null; };
  const send = () => w.wa.sendWorkspaceText('agency', 'demo', '5531977776666', 'Oi', async () => true);
  reply('5531988887777@s.whatsapp.net');
  assert.deepEqual(await send(), { sent: false, reason: 'wrong-recipient' });
  // Nono dígito ausente e endereço por LID são o mesmo contato.
  reply('553177776666@s.whatsapp.net');
  assert.equal((await send()).sent, true);
  reply('99887766554433@lid');
  assert.equal((await send()).sent, true);
});

test('QR que não vem: insiste e recria a instância que nunca pareou; a que já pareou nunca é apagada sozinha', async t => {
  const w = await setup(t, { connected: false });
  let empty = true;
  w.world.fault = (url, init) => {
    if (empty && String(url).includes('/instance/delete/')) empty = false;
    return empty && String(url).includes('/instance/connect/') ? new Response(JSON.stringify({ count: 0 }), { status: 200 }) : null;
  };
  const view = await w.api('connect');
  assert.ok(view.qrcode, 'a instância nova gerou o QR');
  assert.equal(w.evo.calls.filter(c => c.path === '/instance/create').length, 2);

  const paired = await setup(t);
  await paired.round();
  paired.evo.instances.get('graao_demo').state = 'close';
  paired.world.fault = url => String(url).includes('/instance/connect/') ? new Response(JSON.stringify({ count: 0 }), { status: 200 }) : null;
  await paired.api('connect');
  assert.equal(paired.evo.calls.some(c => c.path.startsWith('/instance/delete/')), false);
});

test('A vigia não cria registro nem chama o servidor para quem nunca usou o WhatsApp', async t => {
  const w = await setup(t, { connected: false });
  w.evo.calls.length = 0;
  assert.deepEqual(await w.round(), { checked: 0 });
  assert.equal(w.evo.calls.length, 0);
  assert.throws(() => w.store.load('whatsapp-agency'));
});

test('Pelo cron de verdade: o servidor roda a vigia, recupera a mensagem e reenvia o que ficou para trás', async t => {
  const before = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'segredo-da-vigia';
  t.after(() => { if (before === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = before; });
  const w = await setup(t);
  const ago = minutes => new Date(Date.now() - minutes * MIN).toISOString();
  await w.store.change('whatsapp-agency', s => { s.subaccounts.demo.guard = { openSince: ago(60), sweptUntil: ago(20), downSince: ago(9), alerted: true, reason: 'disconnected' }; });
  await w.store.change('demo', s => { s.whatsappHealth = { status: 'down', reason: 'disconnected', since: ago(9) }; });
  w.received('CRON', 'cheguei na queda', Date.now() - 5 * MIN);
  await w.addOutbound('presa', 'not_connected', Date.now() - 4 * MIN);
  const cron = headers => fetch(`${w.base()}/api/social/cron`, { headers });
  assert.equal((await cron({})).status, 401);
  assert.equal(w.state().messages.some(m => m.body === 'cheguei na queda'), false);
  assert.equal((await cron({ Authorization: 'Bearer segredo-da-vigia' })).status, 200);
  for (let n = 0; n < 100 && w.saved().guard.downSince; n++) await new Promise(done => setTimeout(done, 30));
  assert.equal(w.state().messages.filter(m => m.body === 'cheguei na queda').length, 1);
  assert.equal(w.state().messages.find(m => m.id === 'presa').failed, undefined);
  assert.equal(w.sends().length, 1);
  assert.equal(w.state().whatsappHealth, undefined, 'o aviso some');
  assert.equal(w.saved().guard.downSince, '');
});
