import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { inboxChanges } from '../inbox-live.mjs';
import { applyChanges, createInboxFollower, patchPlan } from '../ui/inbox-live.js';
import { inboxPage } from '../ui/inbox.js';
import { blank, execute } from '../model.mjs';
import { API_KEY, fakeEvolution } from './helpers/fake-evolution.mjs';

async function boot(t) {
  const dir = mkdtempSync(join(tmpdir(), 'graao-inbox-live-'));
  const store = createSqliteStore(join(dir, 'go.sqlite'));
  const evo = fakeEvolution();
  const { server } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, openAISecret: 'inbox-live-seal-secret-of-32-chars!', socialScheduler: false,
    whatsappRequest: evo.request, evolutionBaseUrl: 'https://evo.graao.test', evolutionApiKey: API_KEY, r2: null });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, body) => {
    const res = await fetch(`${base}${path}`, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  await call('/api/whatsapp/workspace/connect?workspace=demo', {});
  evo.markOpen('graao_demo', '5531988887777', 'Demo');
  const hook = new URL((await call('/api/whatsapp/workspace/status?workspace=demo')).body.webhookUrl).pathname;
  let seq = 0;
  const receive = message => call(hook, { event: 'messages.upsert', instance: 'graao_demo', data: { key: { fromMe: false, id: `LIVE${++seq}`, remoteJid: '5531977776666@s.whatsapp.net' }, pushName: 'Carlos', message } });
  const ring = (id, status, extra = {}) => call(hook, { event: 'call', instance: 'graao_demo', data: { id, status, chatId: '5531977776666@s.whatsapp.net', from: '5531977776666@s.whatsapp.net', date: '2026-11-25T17:20:00.000Z', offline: false, ...extra } });
  const live = (mark = '') => call(`/api/conversations/live?workspace=demo&mark=${encodeURIComponent(mark)}`);
  return { store, evo, call, receive, ring, live };
}

// ---------- servidor ----------

test('a busca da caixa de entrada devolve só o que mudou desde a última', async t => {
  const { receive, live } = await boot(t);
  const first = (await live()).body;
  assert.ok(Array.isArray(first.state.messages) && Array.isArray(first.state.contacts) && first.metrics);
  assert.deepEqual((await live(first.mark)).body, { mark: first.mark }, 'nada mudou: só a marca, sem o documento');
  await receive({ conversation: 'Oiiii' });
  const second = (await live(first.mark)).body;
  assert.equal(second.state.messages.at(-1).body, 'Oiiii');
  assert.equal(second.state.threads, undefined, 'a parte que não mudou não viaja');
  assert.equal(second.metrics.unread, first.metrics.unread + 1);
  assert.deepEqual((await live(second.mark)).body, { mark: second.mark });
});

test('a busca só abre subconta que a pessoa pode abrir', async t => {
  const { call } = await boot(t);
  assert.ok([403, 404].includes((await call('/api/conversations/live?workspace=00000000-0000-4000-8000-000000000000')).status));
  assert.ok([403, 404].includes((await call('/api/conversations/live?workspace=..%2Fagency')).status));
  assert.equal((await call('/api/conversations/live?workspace=demo', {})).status, 404, 'só leitura');
});

test('quem vê menos do documento recebe só o que vê', () => {
  const { state } = inboxChanges({ state: { messages: [], contacts: [{ id: '1', name: 'Ana' }] }, metrics: { unread: 0 } }, '');
  assert.deepEqual(state, { messages: [], contacts: [{ id: '1', name: 'Ana' }], threads: [], teamMessages: [], whatsappHealth: null });
});

// ---------- ligações ----------

test('a ligação do WhatsApp vira uma linha na conversa e acompanha o resultado', async t => {
  const { ring, receive, store } = await boot(t);
  await receive({ conversation: 'Posso ligar?' });
  const calls = async () => (await store.load('demo')).messages.filter(m => m.waCall);
  await ring('CALL1', 'offer', { isVideo: false });
  assert.deepEqual((await calls()).map(m => [m.channel, m.body, m.direction, m.read]), [['Call', 'Ligação de voz do WhatsApp · recebida', 'Inbound', false]]);
  await ring('CALL1', 'ringing');
  await ring('CALL1', 'offer', { isVideo: false });
  assert.equal((await calls()).length, 1, 'a mesma ligação entra uma vez só');
  await ring('CALL1', 'timeout');
  assert.equal((await calls())[0].body, 'Ligação de voz do WhatsApp · não atendida');
  await ring('CALL2', 'offer', { isVideo: true });
  await ring('CALL2', 'accept');
  await ring('CALL2', 'terminate');
  assert.equal((await calls()).at(-1).body, 'Ligação de vídeo do WhatsApp · atendida');
  await ring('CALL3', 'offer');
  await ring('CALL3', 'reject');
  assert.equal((await calls()).at(-1).body, 'Ligação de voz do WhatsApp · recusada');
  assert.equal(new Set((await calls()).map(m => m.contactId)).size, 1);
  const carlos = (await store.load('demo')).contacts.filter(c => c.name === 'Carlos');
  assert.deepEqual([carlos.length, carlos[0].id], [1, (await calls())[0].contactId], 'a ligação entra no contato que já existe');
});

test('ligação de grupo, sem início ou sem id não vira contato; a de quem só tem LID entra no contato certo', async t => {
  const { ring, store } = await boot(t);
  const before = (await store.load('demo')).contacts.length;
  await ring('G1', 'offer', { isGroup: true });
  await ring('X1', 'timeout');
  await ring('', 'offer');
  assert.equal((await store.load('demo')).contacts.length, before);
  await store.change('demo', state => {
    const id = execute(state, { type: 'save', key: 'contacts', data: { name: 'Bia', phone: '+5531966665555' } });
    state.contacts.find(c => c.id === id).waLid = '998877';
  });
  await ring('L1', 'offer', { chatId: '998877@lid', from: '998877:4@lid' });
  const state = await store.load('demo');
  assert.equal(state.contacts.length, before + 1);
  assert.equal(state.messages.at(-1).contactId, state.contacts.find(c => c.waLid === '998877').id);
});

test('a ligação de um número novo cria o contato e não dispara automação de resposta', async t => {
  const { ring, store } = await boot(t);
  const runs = (await store.load('demo')).runs.length;
  await ring('N1', 'offer');
  const state = await store.load('demo');
  const call = state.messages.at(-1), contact = state.contacts.find(c => c.id === call.contactId);
  assert.equal(contact.phone.replace(/\D/g, ''), '5531977776666');
  assert.equal(state.runs.length, runs);
});

// ---------- mensagens que o servidor descartava ----------

test('mensagens de empresa, enquete, evento e pedido deixam de sumir; reação e aviso de sistema continuam de fora', async t => {
  const { receive, store } = await boot(t);
  const body = async message => (await receive(message)).body.stored ? (await store.load('demo')).messages.at(-1).body : null;
  assert.equal(await body({ templateMessage: { hydratedTemplate: { hydratedContentText: 'Seu pedido saiu' } } }), 'Seu pedido saiu');
  assert.equal(await body({ interactiveMessage: { body: { text: 'Escolha uma opção' } } }), 'Escolha uma opção');
  assert.equal(await body({ buttonsMessage: { contentText: 'Confirma?' } }), 'Confirma?');
  assert.equal(await body({ listMessage: { title: 'Menu', description: 'Veja o menu' } }), 'Veja o menu');
  assert.equal(await body({ pollCreationMessageV3: { name: 'Qual dia?' } }), '[Enquete] Qual dia?');
  assert.equal(await body({ eventMessage: { name: 'Reunião' } }), '[Evento] Reunião');
  assert.equal(await body({ productMessage: { product: { title: 'Camiseta' } } }), '[Produto] Camiseta');
  assert.equal(await body({ orderMessage: { itemCount: 2 } }), '[Pedido]');
  assert.equal(await body({ groupInviteMessage: { groupName: 'Turma' } }), '[Convite de grupo] Turma');
  assert.equal(await body({ stickerPackMessage: { name: 'Gatos' } }), '[Pacote de figurinhas] Gatos');
  assert.equal(await body({ reactionMessage: { text: 'x' } }), null);
  assert.equal(await body({ protocolMessage: { type: 0 } }), null);
});

// ---------- tela ----------

test('só o que mudou na lista é trocado na tela: o resto, como um áudio tocando, fica onde está', () => {
  const same = (a, b) => a === b;
  assert.deepEqual(patchPlan(['a', 'b'], ['a', 'b', 'c'], same), { replace: [], append: [2], remove: 0 });
  assert.deepEqual(patchPlan(['a', 'b', 'c'], ['a', 'x'], same), { replace: [1], append: [], remove: 1 });
  assert.deepEqual(patchPlan(['a'], ['a'], same), { replace: [], append: [], remove: 0 });
});

test('a mudança entra no estado da tela; resposta de antes de uma ação é descartada', () => {
  const c = { s: { messages: [], contacts: [], profile: { name: 'x' } }, m: { unread: 0 } };
  const before = c.s;
  assert.equal(applyChanges(c, before, { mark: '1', state: { messages: [{ id: 'm' }] }, metrics: { unread: 1 } }), true);
  assert.equal(c.s, before, 'o mesmo objeto: a marca continua valendo');
  assert.equal(c.s.messages.length, 1);
  assert.equal(c.m.unread, 1);
  assert.equal(c.s.profile.name, 'x');
  c.s = { messages: [] }; // uma ação trocou o estado enquanto a busca estava no ar
  assert.equal(applyChanges(c, before, { mark: '2', state: { messages: [{ id: 'velha' }] } }), false);
  assert.equal(c.s.messages.length, 0);
  assert.equal(applyChanges(c, c.s, { mark: '2' }), false);
});

test('a tela busca enquanto está à vista, para quando some e não empilha buscas', async () => {
  let at = 1000, visible = true, answer = { mark: 'm1' }, patched = 0;
  const asked = [];
  const c = { s: { messages: [] }, m: {}, workspace: 'demo' };
  const follower = createInboxFollower({ c, clock: () => at, watching: () => visible, changed: apply => { if (apply()) patched++; },
    request: async mark => { asked.push(mark); if (answer instanceof Error) throw answer; return answer; } });
  await follower.tick();
  assert.deepEqual(asked, [''], 'a primeira busca não tem marca');
  await follower.tick();
  assert.equal(asked.length, 1, 'antes do intervalo, nada');
  at += 5000;
  await follower.tick();
  assert.deepEqual(asked, ['', 'm1']);
  assert.equal(patched, 0);
  answer = { mark: 'm2', state: { messages: [{ id: 'nova' }] } };
  at += 5000;
  await Promise.all([follower.tick(), follower.tick()]);
  assert.equal(asked.length, 3, 'uma busca de cada vez');
  assert.equal(patched, 1);
  visible = false; at += 60000;
  await follower.tick();
  assert.equal(asked.length, 3, 'aba escondida ou outra tela: não busca');
  visible = true;
  answer = new Error('fora do ar');
  await follower.tick();
  assert.equal(asked.length, 4);
  at += 5000;
  await follower.tick();
  assert.equal(asked.length, 4, 'depois de uma falha, espera mais');
  at += 25000; answer = { mark: 'm3' };
  await follower.tick();
  assert.equal(asked.length, 5);
  await follower.tick({ now: true });
  assert.equal(asked.length, 6, 'voltar para a aba busca na hora');
  c.s = { messages: [] };
  at += 5000;
  await follower.tick();
  assert.equal(asked.at(-1), '', 'estado novo: pede tudo de novo em vez de confiar na marca antiga');
  at += 5000;
  await follower.tick();
  assert.equal(asked.at(-1), 'm3');
  c.workspace = 'outra';
  at += 5000;
  await follower.tick();
  assert.equal(asked.at(-1), '');
  follower.used(); at += 10 * 60000;
  await follower.tick();
  const idle = asked.length;
  at += 5000;
  await follower.tick();
  assert.equal(asked.length, idle, 'sem uso por minutos, busca mais devagar');
  at += 15000;
  await follower.tick();
  assert.equal(asked.length, idle + 1);
  follower.used();
  await follower.tick();
  assert.equal(asked.length, idle + 1);
  at += 5000;
  await follower.tick();
  assert.equal(asked.length, idle + 2, 'voltou a usar, volta ao ritmo normal');
});

test('trocar de subconta enquanto a busca está no ar descarta a resposta', async () => {
  const c = { s: { messages: [] }, m: {}, workspace: 'demo' };
  let answer, patched = 0;
  const follower = createInboxFollower({ c, clock: () => 1, watching: () => true, changed: apply => { if (apply()) patched++; }, request: () => new Promise(resolve => { answer = resolve; }) });
  const running = follower.tick();
  c.workspace = 'outra';
  answer({ mark: 'x', state: { messages: [{ id: 'da demo' }] } });
  await running;
  assert.equal(patched, 0);
  assert.equal(c.s.messages.length, 0);
});

test('a página da caixa de entrada marca as partes que a atualização troca', () => {
  const s = blank();
  const id = execute(s, { type: 'save', key: 'contacts', data: { name: 'Ana', phone: '+5531911112222' } });
  execute(s, { type: 'message', data: { contactId: id, channel: 'WhatsApp', direction: 'Inbound', body: 'Oi' } });
  const html = inboxPage({ s, m: {}, workspace: 'demo', thread: id, tab: 'all', query: '', agency: {} });
  for (const part of ['class="thread-messages"', 'class="thread-items"', 'class="inbox-nav"', 'class="contact-panel-body"']) assert.ok(html.includes(part), part);
});
