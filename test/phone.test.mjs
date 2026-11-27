import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { e164, twilioSignature, twilioSignatureValid, twiml } from '../twilio.mjs';
import { callReport, contactByPhone } from '../phone-model.mjs';
import { actionSpec, triggerSpec } from '../ui/workflow-data.js';

// Telefonia (2.4): Twilio numbers, calls, voicemail, IVR, number validation and the call report.
const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const flow = (s, name, trigger, steps) => save(s, 'workflows', { name, active: true, triggers: [trigger], steps });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const TOKEN = 'token-de-teste';

test('Twilio helpers: E.164, the request signature and escaped TwiML', () => {
  assert.equal(e164('(11) 99999-0000'), '+5511999990000');
  assert.equal(e164('+1 415 555 0100'), '+14155550100');
  assert.equal(e164('0055 11 3333-4444'), '+551133334444');
  assert.equal(e164('123'), '');
  const params = { CallSid: 'CA1', From: '+5511999990000', To: '+551140001000' };
  const url = 'https://graao.test/api/phone/twilio/voice/demo';
  const signature = twilioSignature(url, params, TOKEN);
  assert.equal(twilioSignatureValid(url, params, signature, TOKEN), true);
  assert.equal(twilioSignatureValid(url, { ...params, From: '+5511000000000' }, signature, TOKEN), false);
  assert.equal(twilioSignatureValid(url, params, signature, ''), false);
  assert.equal(twiml.response(twiml.say('Olá <Ana> & cia')), '<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Camila" language="pt-BR">Olá &lt;Ana&gt; &amp; cia</Say></Response>');
  assert.match(twiml.dial(['+5511999990000'], { action: 'https://x.test/d?a=1&b=2', timeout: 15, record: true }), /action="https:\/\/x.test\/d\?a=1&amp;b=2".*record="record-from-answer-dual".*<Number>\+5511999990000<\/Number>/);
});

test('Calls: an inbound call creates the contact, the final status fires "Ligação terminou" once and charges the minutes', () => {
  assert.deepEqual(triggerSpec('call_details').fields.map(field => field.key), ['direction', 'status', 'numberId']);
  const s = blank();
  s.wallet = { balance: 50, pricing: { phone: { unit: 0.1, markup: 2 } }, lowAt: 0, entries: [], topups: [] };
  const numberId = execute(s, { type: 'phone-number-add', data: { sid: 'PN1', number: '+551140001000', name: 'Recepção', forward: '(11) 98888-7777' } });
  assert.deepEqual(s.phone.numbers[0].forward, ['+5511988887777']);
  execute(s, { type: 'phone-number-save', data: { id: numberId, name: 'Recepção', forward: '11988887777\n11977776666', timeout: 99, record: true } });
  assert.deepEqual([s.phone.numbers[0].forward.length, s.phone.numbers[0].timeout, s.phone.numbers[0].record], [2, 60, true]);
  assert.throws(() => execute(s, { type: 'phone-number-add', data: { sid: 'PN2', number: '+551140001000' } }), /já está/);

  const missed = flow(s, 'perdida', { type: 'call_details', config: { direction: 'inbound', status: 'missed' } }, [{ type: 'add_tag', config: { tag: 'ligou-e-nao-atendemos' } }]);
  const any = flow(s, 'qualquer', { type: 'call_details', config: { numberId } }, [{ type: 'add_note', config: { body: 'Ligação {{trigger.status}} ({{trigger.duration}}s)' } }]);
  const callId = execute(s, { type: 'phone-call-start', data: { direction: 'inbound', callSid: 'CA1', from: '+5511955554444', to: '+551140001000' } });
  const caller = contactByPhone(s, '(11) 95555-4444');
  assert.ok(caller, 'the caller becomes a contact');
  assert.equal(execute(s, { type: 'phone-call-start', data: { direction: 'inbound', callSid: 'CA1', from: '+5511955554444', to: '+551140001000' } }), callId, 'the same call is not logged twice');
  execute(s, { type: 'phone-call-update', data: { callId, status: 'missed' } });
  execute(s, { type: 'phone-call-update', data: { callSid: 'CA1', final: true, duration: 0 } });
  execute(s, { type: 'phone-call-update', data: { callSid: 'CA1', final: true, duration: 0 } });
  assert.equal(runsOf(s, missed).length, 1);
  assert.ok(s.contacts.find(row => row.id === caller.id).tags.includes('ligou-e-nao-atendemos'));
  assert.ok(s.messages.some(row => row.contactId === caller.id && row.channel === 'Call' && row.body === 'Ligação recebida · não atendida'));

  const answered = execute(s, { type: 'phone-call-start', data: { direction: 'outbound', contactId: caller.id, numberId, from: '+551140001000', to: '+5511955554444' } });
  execute(s, { type: 'phone-call-update', data: { callId: answered, status: 'answered', duration: 125, recordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC/Recordings/RE1' } });
  execute(s, { type: 'phone-call-update', data: { callId: answered, final: true, duration: 130 } });
  const row = s.calls.find(call => call.id === answered);
  assert.deepEqual([row.status, row.duration, row.recordingUrl.endsWith('RE1')], ['answered', 130, true]);
  assert.equal(s.wallet.balance, 50 - 3 * 0.1 * 2, '3 minutes rebilled');
  assert.equal(runsOf(s, any).length, 2);
  assert.ok(s.messages.some(row => row.body === 'Ligação answered (130s)'));
  const report = callReport(s);
  assert.deepEqual([report.total, report.inbound, report.outbound, report.answered, report.missed, report.average], [2, 1, 1, 1, 1, 130]);
  assert.throws(() => execute(s, { type: 'phone-call-start', data: { direction: 'inbound', callSid: 'CA9', from: 'anonimo', to: '+551140001000' } }), /inválido/);
});

test('IVR: the steps answer the call, the digits choose the branch and the recording goes to Conversas', () => {
  const s = blank();
  const numberId = execute(s, { type: 'phone-number-add', data: { sid: 'PN1', number: '+551140001000', forward: '11988887777' } });
  execute(s, { type: 'phone-number-save', data: { id: numberId, ivr: true, forward: '11988887777' } });
  const ivr = flow(s, 'ura', { type: 'ivr_call', config: { numberId } }, [
    { type: 'ivr_say', config: { kind: 'say', message: 'Olá! Você ligou para a {{workspace.name}}.' } },
    { type: 'ivr_gather', config: { message: 'Digite 1 para vendas ou 2 para deixar recado.', digits: 1, timeout: 5, variable: 'menu' } },
    { type: 'if_else', config: { conditions: [{ subject: 'var', op: 'equals', key: 'menu', value: '1' }] },
      yes: [{ type: 'ivr_connect', config: { to: '(11) 97777-6666\n11 95555-0000', timeout: 15, record: 'yes' } }],
      no: [{ type: 'ivr_record', config: { message: 'Deixe seu recado.', maxLength: 60 } }] },
    { type: 'ivr_hangup', config: { message: 'Obrigado!' } },
    { type: 'add_tag', config: { tag: 'passou-pela-ura' } }
  ]);
  const take = sid => execute(s, { type: 'ivr-take', data: { callSid: sid } });

  execute(s, { type: 'phone-call-start', data: { direction: 'inbound', callSid: 'CA1', from: '+5511955554444', to: '+551140001000' } });
  let out = take('CA1');
  assert.deepEqual(out.verbs.map(verb => verb.verb), ['say', 'gather']);
  assert.match(out.verbs[0].text, /Você ligou para a/);
  assert.deepEqual([out.wait, out.verbs[1].digits, out.verbs[1].timeout], ['gather', 1, 5]);
  assert.deepEqual(take('CA1').verbs, [], 'verbs go out once');
  execute(s, { type: 'ivr-input', data: { callSid: 'CA1', digits: '1' } });
  out = take('CA1');
  assert.deepEqual(out.verbs, [{ verb: 'dial', to: ['+5511977776666', '+5511955550000'], timeout: 15, record: true }]);
  execute(s, { type: 'ivr-input', data: { callSid: 'CA1', dialStatus: 'completed' } });
  out = take('CA1');
  assert.deepEqual(out.verbs.map(verb => verb.verb), ['say', 'hangup']);
  assert.equal(out.done, true);
  const first = runsOf(s, ivr)[0];
  assert.equal(first.status, 'Completed');
  assert.deepEqual([first.vars.menu, first.vars.ivr_transferencia], ['1', 'completed']);
  assert.ok(s.contacts.find(row => row.id === first.contactId).tags.includes('passou-pela-ura'));

  execute(s, { type: 'phone-call-start', data: { direction: 'inbound', callSid: 'CA2', from: '+5511933332222', to: '+551140001000' } });
  take('CA2');
  execute(s, { type: 'ivr-input', data: { callSid: 'CA2', digits: '2' } });
  assert.deepEqual(take('CA2').verbs, [{ verb: 'say', text: 'Deixe seu recado.' }, { verb: 'record', maxLength: 60 }]);
  execute(s, { type: 'ivr-input', data: { callSid: 'CA2', recordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC/Recordings/RE2' } });
  const second = runsOf(s, ivr)[1];
  assert.equal(second.vars.ivr_gravacao, 'https://api.twilio.com/2010-04-01/Accounts/AC/Recordings/RE2');
  assert.ok(s.messages.some(row => row.contactId === second.contactId && row.body === 'Recado gravado na URA' && row.recordingUrl.endsWith('RE2')));
  assert.equal(s.calls.find(row => row.callSid === 'CA2').status, 'voicemail');

  // The caller hangs up while the menu waits: the run goes on, later IVR steps report the call is over.
  execute(s, { type: 'phone-call-start', data: { direction: 'inbound', callSid: 'CA3', from: '+5511911112222', to: '+551140001000' } });
  take('CA3');
  execute(s, { type: 'phone-call-update', data: { callSid: 'CA3', final: true, duration: 4 } });
  const third = runsOf(s, ivr)[2];
  assert.equal(third.status, 'Completed');
  assert.match(third.results.join(' | '), /a ligação já terminou/);

  // Steps of a flow that did not start with a call only report it.
  const wrong = flow(s, 'errado', { type: 'contact_tag', config: { change: 'added', tag: 'x' } }, [{ type: 'ivr_say', config: { kind: 'say', message: 'Oi' } }]);
  save(s, 'contacts', { ...s.contacts[0], tags: ['x'] }, s.contacts[0].id);
  assert.match(runsOf(s, wrong)[0].results.join(' '), /não começou por Início da URA/);
});

test('Workflow actions queue the call, the voicemail drop and the lookup; the lookup answer fires "Telefone validado"', () => {
  assert.deepEqual(actionSpec('call').fields.map(field => field.key), ['numberId', 'agentPhone']);
  const s = blank();
  const numberId = execute(s, { type: 'phone-number-add', data: { sid: 'PN1', number: '+551140001000', forward: '11988887777' } });
  const valid = flow(s, 'validou', { type: 'phone_validated', config: { result: 'invalid' } }, [{ type: 'add_note', config: { body: 'Número inválido ({{trigger.lineType}})' } }]);
  const id = flow(s, 'ligar', { type: 'contact_tag', config: { change: 'added', tag: 'ligar' } }, [
    { type: 'call', config: { numberId } },
    { type: 'voicemail_drop', config: { numberId, kind: 'say', message: 'Oi {{contact.first_name}}, retorne quando puder.' } },
    { type: 'phone_validate', config: { invalidTag: 'telefone-invalido' } }
  ]);
  const contactId = save(s, 'contacts', { name: 'Dani Rocha', phone: '11 94444-3333', tags: [], custom: {} });
  save(s, 'contacts', { ...s.contacts.find(row => row.id === contactId), tags: ['ligar'] }, contactId);
  const kinds = s.workflowOutbox.map(item => item.kind);
  assert.deepEqual(kinds.filter(kind => kind.startsWith('phone') || kind === 'voicemail-drop'), ['phone-call', 'voicemail-drop', 'phone-lookup']);
  const call = s.workflowOutbox.find(item => item.kind === 'phone-call');
  assert.deepEqual([call.agent, call.to, call.numberId], ['+5511988887777', '+5511944443333', numberId]);
  assert.equal(s.workflowOutbox.find(item => item.kind === 'voicemail-drop').message, 'Oi Dani, retorne quando puder.');
  const lookup = s.workflowOutbox.find(item => item.kind === 'phone-lookup');
  execute(s, { type: 'workflow-ai-result', data: { results: [{ runId: lookup.runId, stepId: lookup.stepId, vars: { telefone_status: 'invalid', telefone_tipo: 'landline', telefone_operadora: '' } }] } });
  const contact = s.contacts.find(row => row.id === contactId);
  assert.deepEqual([contact.phoneStatus, contact.phoneLineType], ['invalid', 'landline']);
  assert.ok(contact.tags.includes('telefone-invalido'));
  assert.equal(runsOf(s, valid).length, 1);
  assert.equal(runsOf(s, id)[0].status, 'Completed');

  const noPhone = save(s, 'contacts', { name: 'Sem telefone', tags: [], custom: {} });
  save(s, 'contacts', { ...s.contacts.find(row => row.id === noPhone), tags: ['ligar'] }, noPhone);
  assert.match(runsOf(s, id).at(-1).results.join(' | '), /contato sem telefone válido/);
});

test('Server: buys a number, answers an inbound call (forward, then voicemail) and places a click-to-call, all signed', async t => {
  const twilioCalls = [];
  const twilioRequest = async (url, options = {}) => {
    const form = options.body ? Object.fromEntries(new URLSearchParams(options.body)) : {};
    twilioCalls.push({ url, method: options.method, form });
    const ok = body => ({ ok: true, status: 200, json: async () => body });
    if (url.includes('/AvailablePhoneNumbers/BR/Local.json')) return ok({ available_phone_numbers: [{ phone_number: '+551140001000', friendly_name: '(11) 4000-1000', locality: 'São Paulo' }] });
    if (url.endsWith('/IncomingPhoneNumbers.json')) return ok({ sid: 'PN1', phone_number: form.PhoneNumber });
    if (url.endsWith('/Calls.json')) return ok({ sid: 'CAout1' });
    return { ok: false, status: 404, json: async () => ({ message: 'not found' }) };
  };
  const phoneEnv = { TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: TOKEN, PHONE_PUBLIC_ORIGIN: 'https://graao.test' };
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false, twilioRequest, phoneEnv });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const twilio = async (path, params, { sign = true } = {}) => {
    const signature = twilioSignature(`https://graao.test${path}`, params, TOKEN);
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(sign ? { 'X-Twilio-Signature': signature } : {}) }, body: new URLSearchParams(params).toString() });
    return { status: r.status, text: await r.text() };
  };
  const state = async () => (await call('/api/state?workspace=demo')).body.state;

  assert.deepEqual((await call('/api/phone/status?workspace=demo')).body.configured, true);
  assert.equal((await call('/api/phone/search?workspace=demo', { areaCode: '11' })).body.numbers[0].number, '+551140001000');
  assert.match(twilioCalls.at(-1).url, /Contains=%2B5511\*/);
  const bought = (await call('/api/phone/buy?workspace=demo', { number: '+551140001000', name: 'Recepção', forward: '11988887777' })).body;
  assert.equal(bought.numbers[0].number, '+551140001000');
  assert.deepEqual([twilioCalls.at(-1).form.VoiceUrl, twilioCalls.at(-1).form.StatusCallback], ['https://graao.test/api/phone/twilio/voice/demo', 'https://graao.test/api/phone/twilio/status/demo']);

  const inbound = { CallSid: 'CAin1', From: '+5511955554444', To: '+551140001000' };
  assert.equal((await twilio('/api/phone/twilio/voice/demo', inbound, { sign: false })).status, 403, 'unsigned webhooks are refused');
  let answer = await twilio('/api/phone/twilio/voice/demo', inbound);
  assert.match(answer.text, /<Dial action="https:\/\/graao.test\/api\/phone\/twilio\/dial\/demo\?call=[^"]+" method="POST" timeout="20"><Number>\+5511988887777<\/Number><\/Dial>/);
  const callId = (await state()).calls.find(row => row.callSid === 'CAin1').id;
  answer = await twilio(`/api/phone/twilio/dial/demo?call=${callId}`, { CallSid: 'CAin1', DialCallStatus: 'no-answer' });
  assert.match(answer.text, /<Say[^>]*>Não conseguimos atender agora.*<Record action="https:\/\/graao.test\/api\/phone\/twilio\/voicemail\/demo\?call=/);
  await twilio(`/api/phone/twilio/voicemail/demo?call=${callId}`, { CallSid: 'CAin1', RecordingUrl: 'https://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE9' });
  await twilio('/api/phone/twilio/status/demo', { CallSid: 'CAin1', CallStatus: 'completed', CallDuration: '35' });
  let s = await state();
  const logged = s.calls.find(row => row.id === callId);
  assert.deepEqual([logged.status, logged.voicemailUrl.endsWith('RE9'), Boolean(logged.ended)], ['voicemail', true, true]);
  assert.ok(s.messages.some(row => row.callId === callId && row.body === 'Ligação recebida · caixa postal · 1 min'));

  const contactId = s.calls.find(row => row.id === callId).contactId;
  const placed = await call('/api/phone/call?workspace=demo', { contactId, agentPhone: '11 97777-0000' });
  assert.equal(placed.status, 200, JSON.stringify(placed.body));
  const dialed = twilioCalls.at(-1).form;
  assert.deepEqual([dialed.To, dialed.From], ['+5511977770000', '+551140001000'], 'the team phone rings first, from the Graao number');
  const outId = placed.body.id;
  answer = await twilio(`/api/phone/twilio/bridge/demo?call=${outId}`, { CallSid: 'CAout1' });
  assert.match(answer.text, /<Dial action="https:\/\/graao.test\/api\/phone\/twilio\/dial\/demo\?call=[^"]+" method="POST" callerId="\+551140001000" timeout="30"><Number>\+5511955554444<\/Number>/);
  await twilio(`/api/phone/twilio/dial/demo?call=${outId}`, { CallSid: 'CAout1', DialCallStatus: 'completed', DialCallDuration: '61' });
  await twilio(`/api/phone/twilio/status/demo?call=${outId}`, { CallSid: 'CAout1', CallStatus: 'completed', CallDuration: '70' });
  s = await state();
  assert.deepEqual([s.calls.find(row => row.id === outId).status, s.calls.find(row => row.id === outId).duration], ['answered', 70]);
  assert.equal((await call('/api/phone/call?workspace=demo', { contactId: 'nao-existe' })).status, 404);
});
