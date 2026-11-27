import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { botDecision } from '../workflow-engine.mjs';
import { upcomingSlots } from '../scheduling-model.mjs';
import { actionSpec, triggerSpec } from '../ui/workflow-data.js';

// T.1, Conversation AI: the bot of Conversas (a published AI agent) answers the client, suggests, books, hands off or ends.
const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const flow = (s, name, trigger, steps) => save(s, 'workflows', { name, active: true, triggers: [trigger], steps });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const everyDay = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(w => [w, ['08:00', '20:00']]));
const inbound = (s, contactId, body, channel = 'WhatsApp') => execute(s, { type: 'message', data: { contactId, channel, direction: 'Inbound', body } });
const aiItem = s => s.workflowOutbox.filter(item => item.kind === 'ai').at(-1);
const answer = (s, item, reply) => execute(s, { type: 'workflow-ai-result', data: { results: [item.bot ? { runId: '', stepId: '', bot: true, contactId: item.contactId, vars: { resposta_bot: reply } } : { runId: item.runId, stepId: item.stepId, vars: { [item.variable]: reply } }] } });

function setup() {
  const s = blank();
  s.profile.timezone = 'America/Sao_Paulo';
  s.workflowOutbox ??= [];
  s.agents = [{ id: 'ag1', name: 'Atendente', published: { version: 1 } }, { id: 'ag2', name: 'Rascunho' }];
  const contactId = save(s, 'contacts', { name: 'Bia Lima', phone: '+5511999990000', email: 'bia@x.test', tags: [], custom: {} });
  return { s, contactId };
}

test('botDecision reads the markers and keeps only the text for the client', () => {
  assert.deepEqual(botDecision('Claro! Abrimos sábado.'), { action: 'reply', text: 'Claro! Abrimos sábado.', day: '', time: '' });
  assert.deepEqual(botDecision('[[TRANSFERIR]] Vou chamar alguém da equipe.'), { action: 'handoff', text: 'Vou chamar alguém da equipe.', day: '', time: '' });
  assert.deepEqual(botDecision('Combinado, até lá! [[AGENDAR 2026-12-01 09:00]]'), { action: 'book', text: 'Combinado, até lá!', day: '2026-12-01', time: '09:00' });
  assert.equal(botDecision('Obrigado, até mais! [[encerrar]]').action, 'end');
  assert.equal(botDecision('[[TRANSFERIR]]').text, '');
});

test('"Bot de IA na conversa": the agent reads the conversation and its reply goes out on the client\'s channel', () => {
  assert.deepEqual(actionSpec('conversation_ai').fields.map(field => field.key), ['agentId', 'mode', 'channel', 'serviceId', 'variable']);
  assert.deepEqual(triggerSpec('conversation_ai_event').fields.map(field => field.key), ['event', 'agentId']);
  const { s, contactId } = setup();
  const bot = flow(s, 'bot', { type: 'customer_replied', config: {} }, [{ id: 'b', type: 'conversation_ai', config: { agentId: 'ag1', mode: 'auto', channel: 'last', variable: 'resposta_bot' } }]);
  const replied = flow(s, 'respondeu', { type: 'conversation_ai_event', config: { event: 'replied' } }, [{ type: 'add_tag', config: { tag: 'bot-respondeu' } }]);
  const handoff = flow(s, 'equipe', { type: 'conversation_ai_event', config: { event: 'handoff', agentId: 'ag1' } }, [{ type: 'add_tag', config: { tag: 'falar-com-humano' } }]);

  inbound(s, contactId, 'Vocês abrem sábado?');
  const item = aiItem(s);
  assert.deepEqual([item.action, item.agentId, item.variable], ['conversation_ai', 'ag1', 'resposta_bot']);
  assert.match(item.input, /Cliente: Vocês abrem sábado\?/);
  assert.match(item.input, /\[\[TRANSFERIR\]\]/);
  assert.doesNotMatch(item.input, /AGENDAR/, 'no service, no booking');

  answer(s, item, 'Abrimos sim, das 9h às 13h. {{contact.email}}');
  const run = runsOf(s, bot)[0];
  assert.equal(run.status, 'Completed');
  assert.deepEqual([run.vars.resposta_bot, run.vars.bot_acao], ['Abrimos sim, das 9h às 13h. {{contact.email}}', 'responder']);
  const sent = s.messages.filter(row => row.contactId === contactId && row.direction === 'Outbound' && row.channel === 'WhatsApp').at(-1);
  assert.equal(sent.body, 'Abrimos sim, das 9h às 13h. { {contact.email} }', 'the agent text is sent as written, never filled as variables');
  assert.ok(s.workflowOutbox.some(row => row.kind === 'whatsapp' && row.messageId === sent.id));
  assert.equal(runsOf(s, replied).length, 1);

  inbound(s, contactId, 'Quero falar com uma pessoa.');
  answer(s, aiItem(s), '[[TRANSFERIR]] Claro, alguém da equipe já continua com você.');
  assert.ok(s.messages.some(row => row.contactId === contactId && row.channel === 'Note' && row.body === 'O bot de IA passou esta conversa para a equipe.'));
  assert.equal(runsOf(s, handoff).length, 1);
  assert.ok(s.contacts.find(row => row.id === contactId).tags.includes('falar-com-humano'));
  assert.equal(runsOf(s, bot).at(-1).vars.bot_acao, 'transferir');

  // Suggest mode: a note for the team, nothing is sent. An unpublished agent stops the step.
  const suggest = flow(s, 'sugere', { type: 'contact_tag', config: { change: 'added', tag: 'sugerir' } }, [{ type: 'conversation_ai', config: { agentId: 'ag1', mode: 'suggest', channel: 'Email', variable: 'sugestao' } }]);
  save(s, 'contacts', { ...s.contacts.find(row => row.id === contactId), tags: ['sugerir'] }, contactId);
  const before = s.messages.filter(row => row.direction === 'Outbound' && row.channel !== 'Note').length;
  answer(s, aiItem(s), 'Podemos enviar o orçamento hoje.');
  assert.ok(s.messages.some(row => row.channel === 'Note' && row.body === 'Sugestão do bot de IA (Email): Podemos enviar o orçamento hoje.'));
  assert.equal(s.messages.filter(row => row.direction === 'Outbound' && row.channel !== 'Note').length, before);
  assert.equal(runsOf(s, suggest)[0].status, 'Completed');
  const draft = flow(s, 'rascunho', { type: 'contact_tag', config: { change: 'added', tag: 'rascunho' } }, [{ type: 'conversation_ai', config: { agentId: 'ag2', variable: 'x' } }]);
  save(s, 'contacts', { ...s.contacts.find(row => row.id === contactId), tags: ['sugerir', 'rascunho'] }, contactId);
  assert.match(runsOf(s, draft)[0].results.join(' '), /não está publicado/);
});

test('The bot switched on in the conversation answers each new message until it hands off, with a daily limit', () => {
  const { s, contactId } = setup();
  const on = flow(s, 'liga', { type: 'contact_tag', config: { change: 'added', tag: 'bot' } }, [{ type: 'conversation_ai_status', config: { state: 'on', agentId: 'ag1', mode: 'auto', channel: 'WhatsApp' } }]);
  const ended = flow(s, 'fim', { type: 'conversation_ai_event', config: { event: 'ended' } }, [{ type: 'add_tag', config: { tag: 'atendido' } }]);
  save(s, 'contacts', { ...s.contacts.find(row => row.id === contactId), tags: ['bot'] }, contactId);
  assert.match(runsOf(s, on)[0].results.join(' '), /bot ligado com Atendente/);
  const contact = () => s.contacts.find(row => row.id === contactId);
  assert.deepEqual([contact().aiBot.status, contact().aiBot.workflowId], ['on', on]);

  inbound(s, contactId, 'Olá, qual o preço?', 'Email');
  assert.equal(s.workflowOutbox.filter(item => item.bot).length, 0, 'other channels are left to the team');
  inbound(s, contactId, 'Olá, qual o preço?');
  inbound(s, contactId, 'Alô?');
  const queued = s.workflowOutbox.filter(item => item.bot);
  assert.equal(queued.length, 1, 'one pending answer per contact');
  assert.deepEqual([queued[0].workflowId, queued[0].contactId, queued[0].agentId], [on, contactId, 'ag1']);
  s.workflowOutbox = s.workflowOutbox.filter(item => !item.bot);
  answer(s, queued[0], 'A consulta custa R$ 150.');
  assert.equal(s.messages.filter(row => row.contactId === contactId && row.direction === 'Outbound' && row.channel === 'WhatsApp').at(-1).body, 'A consulta custa R$ 150.');

  inbound(s, contactId, 'Obrigada, tchau!');
  const last = s.workflowOutbox.filter(item => item.bot).at(-1);
  s.workflowOutbox = s.workflowOutbox.filter(item => !item.bot);
  answer(s, last, 'Imagina, até mais! [[ENCERRAR]]');
  assert.equal(contact().aiBot, undefined, 'ending turns the bot off');
  assert.ok(contact().tags.includes('atendido'));
  inbound(s, contactId, 'Mais uma coisa');
  assert.equal(s.workflowOutbox.filter(item => item.bot).length, 0);

  // A provider error leaves a note; the daily limit stops the bot.
  save(s, 'contacts', { ...contact(), tags: [] }, contactId);
  save(s, 'contacts', { ...contact(), tags: ['bot'] }, contactId);
  inbound(s, contactId, 'Oi de novo');
  const failing = s.workflowOutbox.filter(item => item.bot).at(-1);
  s.workflowOutbox = s.workflowOutbox.filter(item => !item.bot);
  execute(s, { type: 'workflow-ai-result', data: { results: [{ runId: '', stepId: '', bot: true, contactId, error: 'limite mensal de IA da subconta atingido' }] } });
  assert.ok(s.messages.some(row => row.channel === 'Note' && row.body === 'O bot de IA não respondeu: limite mensal de IA da subconta atingido'));
  assert.ok(failing);
  contact().aiBot.replies = 30;
  inbound(s, contactId, 'Oi?');
  assert.equal(s.workflowOutbox.filter(item => item.bot).length, 0, '30 answers a day at most');

  const off = flow(s, 'desliga', { type: 'contact_tag', config: { change: 'added', tag: 'humano' } }, [{ type: 'conversation_ai_status', config: { state: 'off' } }]);
  save(s, 'contacts', { ...contact(), tags: ['bot', 'humano'] }, contactId);
  assert.match(runsOf(s, off)[0].results.join(' '), /bot desligado/);
  assert.equal(contact().aiBot, undefined);
});

test('With a service, the bot offers free times and books the one the client chose', () => {
  const { s, contactId } = setup();
  execute(s, { type: 'scheduling-settings', data: { enabled: true, step: 60, leadMinutes: 0, horizonDays: 30, staff: [{ name: 'Ana' }], hours: everyDay, origin: 'https://app.graao.test' } });
  const service = save(s, 'services', { name: 'Avaliação', duration: 60, price: 0, staffIds: [s.scheduling.staff[0].id] });
  const slots = upcomingSlots(s, service, { count: 8 });
  assert.equal(slots.length, 8);
  assert.ok(new Set(slots.map(slot => slot.day)).size >= 3, 'three times a day at most, over several days');
  const bot = flow(s, 'agenda', { type: 'customer_replied', config: {} }, [{ type: 'conversation_ai', config: { agentId: 'ag1', mode: 'auto', channel: 'last', serviceId: service, variable: 'resposta_bot' } }]);
  const booked = flow(s, 'marcou', { type: 'conversation_ai_event', config: { event: 'booked' } }, [{ type: 'add_tag', config: { tag: 'agendado-pelo-bot' } }]);
  inbound(s, contactId, 'Quero marcar uma avaliação');
  const item = aiItem(s);
  assert.match(item.input, /Horários livres para Avaliação/);
  assert.ok(item.input.includes(`${slots[1].day} ${slots[1].time}`));
  answer(s, item, `Perfeito, ficou marcado! [[AGENDAR ${slots[1].day} ${slots[1].time}]]`);
  const appointment = s.appointments.find(row => row.contactId === contactId);
  assert.equal(appointment.start, slots[1].start);
  assert.equal(runsOf(s, booked).length, 1);
  assert.equal(runsOf(s, bot)[0].vars.bot_acao, 'agendar');

  inbound(s, contactId, 'E o mesmo horário para minha irmã?');
  answer(s, aiItem(s), `Vou ver! [[AGENDAR ${slots[1].day} ${slots[1].time}]]`);
  assert.equal(s.appointments.filter(row => row.contactId === contactId).length, 1, 'a taken time is not booked twice');
  assert.match(runsOf(s, bot).at(-1).results.join(' '), /não marcou: o horário escolhido não está mais livre/);
});

test('Server: the bot switched on answers through the published agent with the OpenAI of who saved the flow', async t => {
  const asked = [];
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false, agentModel: 'gpt-4.1-mini',
    workflowAI: async () => ({ vars: {} }),
    generateAgentReply: async request => { asked.push(request.messages.at(-1).content); return 'Bom dia! Funcionamos de segunda a sábado.'; } });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const action = async body => { const r = await call('/api/action?workspace=demo', body); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.id; };
  const state = async () => (await call('/api/state?workspace=demo')).body.state;
  const created = (await call('/api/agents/create?workspace=demo', { name: 'Atendente', instructions: 'Responda com cordialidade.' })).body.agent;
  assert.equal((await call('/api/agents/publish?workspace=demo', { id: created.id, revision: created.revision })).status, 200);
  await action({ type: 'save', key: 'workflows', data: { name: 'Liga o bot', active: true, triggers: [{ type: 'contact_created' }], steps: [{ type: 'conversation_ai_status', config: { state: 'on', agentId: created.id, mode: 'auto', channel: 'last' } }] } });
  const caio = await action({ type: 'save', key: 'contacts', data: { name: 'Caio', tags: [], custom: {} } });
  await action({ type: 'message', data: { contactId: caio, channel: 'Live chat', direction: 'Inbound', body: 'Vocês abrem amanhã?' } });
  let s;
  for (let i = 0; i < 150; i++) {
    s = await state();
    if (s.messages.some(row => row.contactId === caio && row.direction === 'Outbound' && row.channel === 'Live chat')) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.ok(s.messages.some(row => row.contactId === caio && row.direction === 'Outbound' && row.channel === 'Live chat' && row.body === 'Bom dia! Funcionamos de segunda a sábado.'));
  assert.match(asked[0], /Cliente: Vocês abrem amanhã\?/);
  assert.ok(s.agentRuns.some(run => run.agent === created.id && run.kind === 'workflow'), 'the answer is in the agent history');
});
