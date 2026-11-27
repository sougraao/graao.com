import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { twilioSignature } from '../twilio.mjs';
import { transcriptText, voicePrompt, voiceSettings } from '../voice-ai.mjs';
import { actionSpec, triggerSpec } from '../ui/workflow-data.js';

// Voice AI (3.2): a published agent talks on the phone, turn by turn (Twilio speech ↔ agent ↔ Twilio voice).
const TOKEN = 'token-de-teste';
const everyDay = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(w => [w, ['08:00', '20:00']]));

test('voicePrompt: phone rules, the goal, the free times and the transcript', () => {
  assert.deepEqual(voiceSettings({ voice: 'x', maxMinutes: 99 }), { agentId: '', voice: 'Polly.Camila', language: 'pt-BR', welcome: '', transfer: '', goal: '', serviceId: '', maxMinutes: 15 });
  const prompt = voicePrompt({ business: 'Clínica Sol', contact: { name: 'Ana' }, direction: 'outbound', goal: 'Confirmar a consulta', canTransfer: true,
    transcript: [{ role: 'agent', text: 'Oi, Ana!' }, { role: 'caller', text: 'Oi, quem fala?' }], slots: [{ day: '2026-12-01', time: '09:00' }], serviceName: 'Consulta' });
  assert.match(prompt, /ligação telefônica feita por Clínica Sol, falando com Ana/);
  assert.match(prompt, /Objetivo desta ligação: Confirmar a consulta/);
  assert.match(prompt, /\[\[TRANSFERIR\]\]/);
  assert.match(prompt, /Horários livres para Consulta .*2026-12-01 09:00/);
  assert.match(prompt, /Você: Oi, Ana!\nCliente: Oi, quem fala\?$/);
  assert.doesNotMatch(voicePrompt({ canTransfer: false }), /TRANSFERIR/);
  assert.equal(transcriptText([{ role: 'caller', text: 'Oi' }, { role: 'agent', text: 'Olá!' }]), 'Cliente: Oi\nAgente: Olá!');
  assert.deepEqual(actionSpec('voice_ai_call').fields.map(field => field.key), ['numberId', 'agentId', 'goal', 'welcome', 'voice', 'transfer', 'serviceId', 'maxMinutes']);
  assert.deepEqual(triggerSpec('voice_ai_ended').fields.map(field => field.key), ['outcome', 'direction', 'agentId']);
});

test('Server: the Voice AI answers a number, books a free time, transfers, and calls out from a workflow', async t => {
  const replies = [], asked = [], twilioCalls = [];
  const generateAgentReply = async request => { asked.push(request.messages.at(-1).content); return replies.shift() ?? 'Certo.'; };
  const twilioRequest = async (url, options = {}) => {
    const form = options.body ? Object.fromEntries(new URLSearchParams(options.body)) : {};
    twilioCalls.push({ url, form });
    const ok = body => ({ ok: true, status: 200, json: async () => body });
    if (url.endsWith('/IncomingPhoneNumbers.json')) return ok({ sid: 'PN1', phone_number: form.PhoneNumber });
    if (url.endsWith('/Calls.json')) return ok({ sid: `CAout${twilioCalls.length}` });
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const phoneEnv = { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: TOKEN, PHONE_PUBLIC_ORIGIN: 'https://graao.test' };
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false, twilioRequest, phoneEnv, generateAgentReply, workflowAI: async () => ({ vars: {} }) });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const action = async body => { const r = await call('/api/action?workspace=demo', body); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.id; };
  const twilio = async (path, params) => {
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Twilio-Signature': twilioSignature(`https://graao.test${path}`, params, TOKEN) }, body: new URLSearchParams(params).toString() });
    assert.equal(r.status, 200);
    return r.text();
  };
  const state = async () => (await call('/api/state?workspace=demo')).body.state;

  const agent = (await call('/api/agents/create?workspace=demo', { name: 'Recepcionista', instructions: 'Atenda com cordialidade.' })).body.agent;
  assert.equal((await call('/api/agents/publish?workspace=demo', { id: agent.id, revision: agent.revision })).status, 200);
  await action({ type: 'scheduling-settings', data: { enabled: true, step: 60, leadMinutes: 0, horizonDays: 30, staff: [{ name: 'Ana' }], hours: everyDay, origin: 'https://app.graao.test' } });
  const staff = (await state()).scheduling.staff[0].id;
  const service = await action({ type: 'save', key: 'services', data: { name: 'Avaliação', duration: 60, price: 0, staffIds: [staff] } });
  const numberId = (await call('/api/phone/buy?workspace=demo', { number: '+551140001000' })).body.id;
  await action({ type: 'phone-number-save', data: { id: numberId, mode: 'voice_ai', voiceAgentId: agent.id, voiceTransfer: '11 97777-0000', voiceServiceId: service, voice: 'Polly.Vitoria' } });
  const ended = await action({ type: 'save', key: 'workflows', data: { name: 'Depois do Voice AI', active: true, triggers: [{ type: 'voice_ai_ended', config: { outcome: 'transfer' } }], steps: [{ type: 'add_tag', config: { tag: 'falou-com-ia' } }] } });

  // Inbound: welcome, a question, a booking and a transfer.
  let xml = await twilio('/api/phone/twilio/voice/demo', { CallSid: 'CAin1', From: '+5511955554444', To: '+551140001000' });
  assert.match(xml, /<Gather input="speech" action="https:\/\/graao.test\/api\/phone\/twilio\/agent\/demo\?call=([^"]+)" method="POST" language="pt-BR" speechTimeout="auto"/);
  assert.match(xml, /<Say voice="Polly.Vitoria" language="pt-BR">Olá! Você ligou para/);
  const callId = xml.match(/agent\/demo\?call=([^"&]+)/)[1];
  const slot = (await state()) && (await import('../scheduling-model.mjs')).upcomingSlots((await state()), service, { count: 6 })[1];

  replies.push(`Temos ${slot.day} às ${slot.time}. Serve?`);
  xml = await twilio(`/api/phone/twilio/agent/demo?call=${callId}`, { CallSid: 'CAin1', SpeechResult: 'Quero marcar uma avaliação' });
  assert.match(xml, new RegExp(`<Say[^>]*>Temos ${slot.day} às ${slot.time}. Serve\\?</Say>`));
  assert.match(asked.at(-1), /Cliente: Quero marcar uma avaliação$/);
  assert.match(asked.at(-1), /Horários livres para Avaliação/);
  assert.match(asked.at(-1), /\[\[TRANSFERIR\]\]/, 'a transfer phone lets the agent transfer');

  replies.push(`Perfeito, marcado! [[AGENDAR ${slot.day} ${slot.time}]]`);
  xml = await twilio(`/api/phone/twilio/agent/demo?call=${callId}`, { CallSid: 'CAin1', SpeechResult: 'Serve sim' });
  assert.match(xml, /<Say[^>]*>Perfeito, marcado!<\/Say>/);
  let s = await state();
  const contactId = s.calls.find(row => row.id === callId).contactId;
  assert.equal(s.appointments.find(row => row.contactId === contactId).start, slot.start);

  xml = await twilio(`/api/phone/twilio/agent/demo?call=${callId}`, { CallSid: 'CAin1', SpeechResult: '' });
  assert.match(xml, /miss=1.*Desculpe, não ouvi/);
  replies.push('[[TRANSFERIR]] Vou te passar para a equipe.');
  xml = await twilio(`/api/phone/twilio/agent/demo?call=${callId}&miss=1`, { CallSid: 'CAin1', SpeechResult: 'Quero falar com uma pessoa' });
  assert.match(xml, /<Say[^>]*>Vou te passar para a equipe.<\/Say><Dial method="POST" timeout="25"><Number>\+5511977770000<\/Number><\/Dial><Hangup\/>/);
  await twilio('/api/phone/twilio/status/demo', { CallSid: 'CAin1', CallStatus: 'completed', CallDuration: '95' });
  s = await state();
  const logged = s.calls.find(row => row.id === callId);
  assert.equal(logged.voice.outcome, 'transfer');
  assert.deepEqual(logged.voice.transcript.map(turn => turn.role), ['agent', 'caller', 'agent', 'caller', 'agent', 'caller', 'agent']);
  assert.ok(s.messages.some(row => row.contactId === contactId && row.channel === 'Note' && /^Transcrição da ligação com o Voice AI\nAgente: Olá!/.test(row.body)));
  assert.ok(s.contacts.find(row => row.id === contactId).tags.includes('falou-com-ia'));
  assert.ok(s.runs.some(run => run.workflowId === ended && run.contactId === contactId));
  assert.ok(s.agentRuns.some(run => run.agent === agent.id && run.kind === 'voice'));

  // Outbound: the workflow step dials the contact; once answered the agent opens with the goal.
  await action({ type: 'save', key: 'workflows', data: { name: 'Confirmar', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'confirmar' } }],
    steps: [{ type: 'voice_ai_call', config: { numberId, agentId: agent.id, goal: 'Confirmar a avaliação de {{contact.first_name}}', maxMinutes: 5 } }] } });
  const bia = await action({ type: 'save', key: 'contacts', data: { name: 'Bia Lima', phone: '11 93333-2222', tags: ['confirmar'], custom: {} } });
  let dialed;
  for (let i = 0; i < 100 && !dialed; i++) { dialed = twilioCalls.find(row => row.url.endsWith('/Calls.json') && row.form.To === '+5511933332222'); if (!dialed) await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.ok(dialed, 'the workflow placed the call');
  assert.equal(dialed.form.MachineDetection, 'Enable');
  const outId = new URL(dialed.form.Url).searchParams.get('call');
  replies.push('Oi, Bia! Aqui é da clínica, posso confirmar sua avaliação?');
  xml = await twilio(`/api/phone/twilio/agent/demo?call=${outId}&start=1`, { CallSid: 'CAout9', AnsweredBy: 'human' });
  assert.match(xml, /Oi, Bia! Aqui é da clínica/);
  assert.match(asked.at(-1), /Objetivo desta ligação: Confirmar a avaliação de Bia/);
  xml = await twilio(`/api/phone/twilio/agent/demo?call=${outId}&start=1`, { CallSid: 'CAout9', AnsweredBy: 'machine_start' });
  assert.equal(xml, '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>', 'a voicemail answering is not a conversation');
  assert.equal((await state()).calls.find(row => row.id === outId).contactId, bia);
});
