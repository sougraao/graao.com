// Telefonia (2.4): the HTTP side. The team's API (/api/phone/*) and Twilio's webhooks (/api/phone/twilio/*), whose
// answers are TwiML. Every webhook is checked against X-Twilio-Signature with the URL Twilio was given.
import { e164, twilioClient, twilioConfigured, twilioSignatureValid, twiml } from './twilio.mjs';
import { contactByPhone, dialerOf, numberByPhone, phoneOf } from './phone-model.mjs';
import { voicePrompt, voiceSettings } from './voice-ai.mjs';
import { botDecision } from './workflow-engine.mjs';
import { upcomingSlots } from './scheduling-model.mjs';
import { requireCredit } from './wallet-model.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const FINAL_STATUS = { completed: '', busy: 'busy', 'no-answer': 'missed', canceled: 'missed', failed: 'failed' };
const VOICEMAIL_GREETING = 'Não conseguimos atender agora. Deixe seu recado após o sinal.';

export function createPhoneHandler({ store, change, flushLater = () => {}, request = fetch, env = process.env, accountActive = async () => true, agentReply = null }) {
  const client = () => twilioClient({ sid: env.TWILIO_ACCOUNT_SID, token: env.TWILIO_AUTH_TOKEN, request });
  const originOf = req => String(env.PHONE_PUBLIC_ORIGIN || env.SOCIAL_PUBLIC_URL || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}`).replace(/\/+$/, '');
  const hook = (origin, kind, workspace, params = {}) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined)).toString();
    return `${origin}/api/phone/twilio/${kind}/${encodeURIComponent(workspace)}${query ? `?${query}` : ''}`;
  };
  const xmlReply = (res, body) => { res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' }); res.end(body); };

  async function formOf(req) {
    let size = 0; const chunks = [];
    for await (const part of req) { size += part.length; if (size > 100000) fail('Request is too large.', 413); chunks.push(part); }
    return Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')));
  }

  /** Places an outbound call: Twilio rings `agent` first; on answer, /bridge dials the contact from the Graao number. */
  async function placeCall(workspace, origin, { contactId, numberId, agent, to, workflowId = '', userId = '' }) {
    const state = await store.load(workspace);
    const number = phoneOf(state).numbers.find(row => row.id === numberId);
    if (!number) fail('Número da Graao não encontrado.', 404);
    requireCredit(state, 'phone');
    const callId = (await change(workspace, { type: 'phone-call-start', data: { direction: 'outbound', contactId, numberId, from: number.number, to, workflowId, userId } })).id;
    try {
      const made = await client().dial({ to: agent, from: number.number, url: hook(origin, 'bridge', workspace, { call: callId }), status: hook(origin, 'status', workspace, { call: callId }) });
      await change(workspace, { type: 'phone-call-update', data: { callId, callSid: made.sid } });
      return callId;
    } catch (problem) {
      await change(workspace, { type: 'phone-call-update', data: { callId, status: 'failed', final: true } });
      throw problem;
    }
  }

  async function dropVoicemail(workspace, origin, { contactId, numberId, to, message, url, workflowId = '' }) {
    const state = await store.load(workspace);
    const number = phoneOf(state).numbers.find(row => row.id === numberId);
    if (!number) fail('Número da Graao não encontrado.', 404);
    requireCredit(state, 'phone');
    const callId = (await change(workspace, { type: 'phone-call-start', data: { direction: 'outbound', kind: 'voicemail-drop', contactId, numberId, from: number.number, to, workflowId, notes: message, dropUrl: url } })).id;
    try {
      const made = await client().dial({ to, from: number.number, url: hook(origin, 'drop', workspace, { call: callId }), status: hook(origin, 'status', workspace, { call: callId }), machineDetection: 'DetectMessageEnd', timeout: 30 });
      await change(workspace, { type: 'phone-call-update', data: { callId, callSid: made.sid } });
    } catch (problem) {
      await change(workspace, { type: 'phone-call-update', data: { callId, status: 'failed', final: true } });
      throw problem;
    }
  }

  async function voiceCall(workspace, origin, { contactId, numberId, to, voice, workflowId = '' }) {
    const state = await store.load(workspace);
    const number = phoneOf(state).numbers.find(row => row.id === numberId);
    if (!number) fail('Número da Graao não encontrado.', 404);
    requireCredit(state, 'phone');
    const callId = (await change(workspace, { type: 'phone-call-start', data: { direction: 'outbound', kind: 'voice-ai', contactId, numberId, from: number.number, to, workflowId, voice: voiceSettings(voice) } })).id;
    try {
      const made = await client().dial({ to, from: number.number, url: hook(origin, 'agent', workspace, { call: callId, start: 1 }), status: hook(origin, 'status', workspace, { call: callId }), machineDetection: 'Enable', timeout: 30 });
      await change(workspace, { type: 'phone-call-update', data: { callId, callSid: made.sid } });
    } catch (problem) {
      await change(workspace, { type: 'phone-call-update', data: { callId, status: 'failed', final: true } });
      throw problem;
    }
  }

  /** The outbox of a workflow: calls, voicemail drops and lookups. Returns a result line, or the vars of a lookup. */
  async function workflowItem(workspace, item, origin) {
    if (item.kind === 'phone-call') return `ligação iniciada (${await placeCall(workspace, origin, item)})`;
    if (item.kind === 'voicemail-drop') { await dropVoicemail(workspace, origin, item); return 'recado em andamento'; }
    if (item.kind === 'voice-ai-call') { await voiceCall(workspace, origin, item); return 'ligação do Voice AI iniciada'; }
    if (item.kind === 'phone-lookup') {
      const found = await client().lookup(item.phone);
      return { vars: { telefone_status: found.valid ? 'valid' : 'invalid', telefone_tipo: found.lineType || '', telefone_operadora: found.carrier || '' } };
    }
    return '';
  }

  // ---- Voice AI (3.2) ----
  const agentHook = (origin, workspace, call, extra = {}) => hook(origin, 'agent', workspace, { call: call.id, ...extra });
  const speak = (voice, text) => twiml.say(text, { voice: voice.voice, language: voice.language });
  const listen = (origin, workspace, call, prompt, extra = {}) => twiml.listen({ action: agentHook(origin, workspace, call, extra), language: call.voice.language, prompt });
  async function agentTurn(workspace, call, speech) {
    if (!agentReply) fail('Voice AI indisponível.', 409);
    const state = await store.load(workspace);
    const contact = state.contacts.find(row => row.id === call.contactId) || null;
    const voice = call.voice, service = (state.services || []).find(row => row.id === voice.serviceId && row.active);
    const number = phoneOf(state).numbers.find(row => row.id === call.numberId);
    const input = voicePrompt({ business: state.profile?.name || '', contact, direction: call.direction, goal: voice.goal, zone: state.profile?.timezone || 'America/Sao_Paulo',
      transcript: [...voice.transcript, ...(speech ? [{ role: 'caller', text: speech }] : [])], slots: service ? upcomingSlots(state, service.id, { count: 6 }) : [], serviceName: service?.name || '', canTransfer: Boolean(voice.transfer) });
    return botDecision(await agentReply(workspace, { agentId: voice.agentId, input, workflowId: call.workflowId || '', voiceKey: call.direction === 'inbound' ? number?.voiceKey || null : null }));
  }
  // The agent's first words: the welcome message, or (outbound, without one) what the agent says first.
  async function agentStart(origin, workspace, call, form = {}) {
    const voice = call.voice;
    if (/^machine/.test(form.AnsweredBy || '')) {
      await change(workspace, { type: 'voice-turn', data: { callId: call.id, outcome: 'end' } });
      return twiml.response(twiml.hangup());
    }
    let opening = voice.welcome;
    if (!opening) {
      const state = await store.load(workspace);
      opening = call.direction === 'inbound' ? `Olá! Você ligou para ${state.profile?.name || 'nós'}. Como posso ajudar?` : (await agentTurn(workspace, call, '').catch(() => null))?.text || 'Olá! Tudo bem?';
    }
    await change(workspace, { type: 'voice-turn', data: { callId: call.id, agent: opening } });
    return twiml.response(listen(origin, workspace, call, speak(voice, opening)));
  }
  async function agentAnswer(origin, workspace, call, form, query) {
    const voice = call.voice, speech = String(form.SpeechResult || '').trim().slice(0, 600);
    const end = async (text, outcome) => { await change(workspace, { type: 'voice-turn', data: { callId: call.id, agent: text, outcome } }); return twiml.response(text ? speak(voice, text) : '', twiml.hangup()); };
    if (Date.now() - Date.parse(call.created) > voice.maxMinutes * 60000) return end('Nosso tempo acabou por aqui. A equipe vai continuar o atendimento. Obrigado!', 'timeout');
    if (!speech) {
      if (Number(query.get('miss')) >= 1) return end('Não consegui ouvir. A equipe vai retornar a ligação. Até logo!', 'timeout');
      return twiml.response(listen(origin, workspace, call, speak(voice, 'Desculpe, não ouvi. Pode repetir?'), { miss: 1 }));
    }
    let decision;
    try { decision = await agentTurn(workspace, call, speech); }
    catch { await change(workspace, { type: 'voice-turn', data: { callId: call.id, caller: speech } }); return end('Tive um problema agora. A equipe vai retornar a ligação. Até logo!', 'end'); }
    const text = decision.text;
    if (decision.action === 'book') {
      const booked = (await change(workspace, { type: 'voice-book', data: { callId: call.id, day: decision.day, time: decision.time } })).id;
      await change(workspace, { type: 'voice-turn', data: { callId: call.id, caller: speech, agent: booked?.error ? 'Esse horário acabou de ser ocupado. Podemos ver outro?' : text, outcome: booked?.error ? '' : 'book', appointmentId: booked?.id || '' } });
      return twiml.response(listen(origin, workspace, call, speak(voice, booked?.error ? 'Esse horário acabou de ser ocupado. Podemos ver outro?' : text || 'Combinado, está marcado!')));
    }
    if (decision.action === 'handoff' && voice.transfer) {
      await change(workspace, { type: 'voice-turn', data: { callId: call.id, caller: speech, agent: text, outcome: 'transfer' } });
      const state = await store.load(workspace), number = phoneOf(state).numbers.find(row => row.id === call.numberId);
      return twiml.response(text ? speak(voice, text) : '', twiml.dial(voice.transfer, { callerId: call.direction === 'inbound' ? undefined : number?.number, timeout: 25 }), twiml.hangup());
    }
    if (decision.action === 'handoff' || decision.action === 'end') {
      await change(workspace, { type: 'voice-turn', data: { callId: call.id, caller: speech } });
      return end(text || 'Obrigado pela ligação. Até logo!', decision.action === 'handoff' ? 'transfer' : 'end');
    }
    await change(workspace, { type: 'voice-turn', data: { callId: call.id, caller: speech, agent: text } });
    return twiml.response(listen(origin, workspace, call, text ? speak(voice, text) : ''));
  }

  // TwiML for what the IVR steps left (verbs) and what they wait for.
  function ivrResponse(origin, workspace, call, number, out) {
    const action = kind => hook(origin, 'ivr', workspace, { call: call.id, kind });
    const verbs = out.verbs.map(verb => {
      if (verb.verb === 'say') return twiml.say(verb.text);
      if (verb.verb === 'play') return twiml.play(verb.url);
      if (verb.verb === 'gather') return twiml.gather({ action: action('gather'), digits: verb.digits, timeout: verb.timeout, prompt: verb.prompt ? twiml.say(verb.prompt) : '' });
      if (verb.verb === 'dial') return twiml.dial(verb.to, { action: action('dial'), timeout: verb.timeout, record: verb.record, callerId: number?.number });
      if (verb.verb === 'record') return twiml.record({ action: action('record'), maxLength: verb.maxLength });
      if (verb.verb === 'hangup') return twiml.hangup();
      return '';
    });
    // Nothing more to wait for: the call ends here.
    if (!out.wait && !verbs.some(verb => verb === twiml.hangup())) verbs.push(twiml.hangup());
    return twiml.response(verbs);
  }

  // What an inbound call does without an IVR: ring the forwarding phones, then voicemail.
  function forwardResponse(origin, workspace, call, number) {
    if (number.forward?.length) return twiml.response(twiml.dial(number.forward, { action: hook(origin, 'dial', workspace, { call: call.id }), timeout: number.timeout, record: number.record }));
    return voicemailResponse(origin, workspace, call, number);
  }
  function voicemailResponse(origin, workspace, call, number) {
    if (number.voicemail === false) return twiml.response(twiml.hangup());
    return twiml.response(twiml.say(number.greeting || VOICEMAIL_GREETING), twiml.record({ action: hook(origin, 'voicemail', workspace, { call: call.id }), maxLength: 120 }), twiml.hangup());
  }

  async function twilioWebhook(req, res, url, path) {
    const [, kind, rawWorkspace] = path.match(/^\/api\/phone\/twilio\/([a-z]+)\/([^/]+)$/) || [];
    const workspace = decodeURIComponent(rawWorkspace || '');
    if (!kind || !/^(demo|[0-9a-f-]{36})$/.test(workspace)) fail('Not found.', 404);
    const form = await formOf(req);
    const origin = originOf(req);
    const query = new URLSearchParams(url.searchParams); query.delete('__path');
    const signed = `${origin}${path}${query.toString() ? `?${query}` : ''}`;
    if (!twilioSignatureValid(signed, form, req.headers['x-twilio-signature'], env.TWILIO_AUTH_TOKEN)) fail('Invalid signature.', 403);
    const state = await store.load(workspace);
    const call = (state.calls || []).find(row => row.id === query.get('call')) || (state.calls || []).find(row => form.CallSid && row.callSid === form.CallSid);
    const number = call ? phoneOf(state).numbers.find(row => row.id === call.numberId) : null;
    const done = () => { flushLater(workspace); };

    if (kind === 'voice') {
      // An inbound call to one of the sub-account's numbers.
      const owned = numberByPhone(state, form.To);
      if (!owned) return xmlReply(res, twiml.response(twiml.say('Este número não está configurado.'), twiml.hangup()));
      if (!await accountActive(workspace).catch(() => false)) return xmlReply(res, twiml.response(twiml.say('Este número está indisponível no momento.'), twiml.hangup()));
      const callId = (await change(workspace, { type: 'phone-call-start', data: { direction: 'inbound', callSid: form.CallSid, from: form.From, to: form.To, numberId: owned.id } })).id;
      const fresh = await store.load(workspace), started = fresh.calls.find(row => row.id === callId);
      done();
      if (started?.voice) return xmlReply(res, await agentStart(origin, workspace, started, form));
      if (owned.mode === 'ivr') {
        const out = (await change(workspace, { type: 'ivr-take', data: { callSid: form.CallSid } })).id;
        if (out.owner) return xmlReply(res, ivrResponse(origin, workspace, started, owned, out));
      }
      return xmlReply(res, forwardResponse(origin, workspace, started, owned));
    }
    if (kind === 'dialer') {
      // The member answered: they wait in the room while the dialer brings in one contact at a time.
      const session = dialerOf(state).sessions.find(row => row.id === query.get('session'));
      if (!session || session.status === 'ended') return xmlReply(res, twiml.response(twiml.say('O discador foi encerrado.'), twiml.hangup()));
      await change(workspace, { type: 'dialer-session-update', data: { id: session.id, status: 'active', agentCallSid: form.CallSid } });
      done();
      return xmlReply(res, twiml.response(twiml.say('Discador pronto. Chame o próximo contato pela Graao.'), twiml.conference(`graao-dialer-${session.id}`, { endOnExit: true, waitUrl: '' })));
    }
    if (kind === 'dialerend') {
      await change(workspace, { type: 'dialer-session-update', data: { id: query.get('session'), status: 'ended' } });
      done();
      return xmlReply(res, twiml.response());
    }
    if (!call) return xmlReply(res, twiml.response(twiml.hangup()));
    if (kind === 'agent') {
      if (!call.voice) return xmlReply(res, twiml.response(twiml.hangup()));
      const answer = query.get('start') ? await agentStart(origin, workspace, call, form) : await agentAnswer(origin, workspace, call, form, query);
      done();
      return xmlReply(res, answer);
    }
    if (kind === 'join') {
      // A dialer contact answered: into the member's room (leaving does not end it).
      const session = dialerOf(state).sessions.find(row => row.id === call.dialerId);
      if (!session || session.status === 'ended') return xmlReply(res, twiml.response(twiml.hangup()));
      await change(workspace, { type: 'phone-call-update', data: { callId: call.id, status: 'answered' } });
      done();
      return xmlReply(res, twiml.response(twiml.conference(`graao-dialer-${session.id}`, { endOnExit: false })));
    }
    if (kind === 'ivr') {
      const step = query.get('kind');
      await change(workspace, { type: 'ivr-input', data: { callSid: call.callSid, digits: form.Digits || '', dialStatus: form.DialCallStatus || '', recordingUrl: form.RecordingUrl || '' } });
      if (step === 'dial' && form.RecordingUrl) await change(workspace, { type: 'phone-call-update', data: { callId: call.id, recordingUrl: form.RecordingUrl } });
      const out = (await change(workspace, { type: 'ivr-take', data: { callSid: call.callSid } })).id;
      done();
      return xmlReply(res, ivrResponse(origin, workspace, call, number, out));
    }
    if (kind === 'dial') {
      // The forwarding (inbound) or the contact's leg (outbound) ended: answered, or missed → voicemail.
      const answered = form.DialCallStatus === 'completed' || form.DialCallStatus === 'answered';
      await change(workspace, { type: 'phone-call-update', data: { callId: call.id, status: answered ? 'answered' : form.DialCallStatus === 'busy' ? 'busy' : 'missed', duration: form.DialCallDuration || 0, recordingUrl: form.RecordingUrl || '' } });
      done();
      if (answered || call.direction === 'outbound' || !number) return xmlReply(res, twiml.response(twiml.hangup()));
      return xmlReply(res, voicemailResponse(origin, workspace, call, number));
    }
    if (kind === 'voicemail') {
      await change(workspace, { type: 'phone-call-update', data: { callId: call.id, status: 'voicemail', voicemailUrl: form.RecordingUrl || '' } });
      done();
      return xmlReply(res, twiml.response(twiml.say('Recado recebido. Obrigado!'), twiml.hangup()));
    }
    if (kind === 'bridge') {
      // The team answered an outbound call: now the contact's phone rings, showing the Graao number.
      const contact = state.contacts.find(row => row.id === call.contactId);
      return xmlReply(res, twiml.response(twiml.say(`Ligando para ${contact?.name || 'o contato'}.`), twiml.dial(call.phone, { action: hook(origin, 'dial', workspace, { call: call.id }), callerId: number?.number, timeout: 30, record: Boolean(number?.record) })));
    }
    if (kind === 'drop') {
      const machine = /^machine/.test(form.AnsweredBy || '');
      await change(workspace, { type: 'phone-call-update', data: { callId: call.id, status: machine ? 'voicemail' : 'answered' } });
      done();
      return xmlReply(res, twiml.response(call.dropUrl ? twiml.play(call.dropUrl) : twiml.say(call.notes || ''), twiml.hangup()));
    }
    if (kind === 'status') {
      const status = FINAL_STATUS[form.CallStatus];
      if (status === undefined) return xmlReply(res, twiml.response());
      await change(workspace, { type: 'phone-call-update', data: { callId: call.id, callSid: form.CallSid, final: true, duration: form.CallDuration || 0, ...(status ? { status } : {}) } });
      done();
      return xmlReply(res, twiml.response());
    }
    fail('Not found.', 404);
  }

  /** The team's API. `who` comes from workspaceAccess; `needs(module)` checks one more module. */
  async function api(req, res, { url, path, method, workspace, who, body, json, needs }) {
    const origin = originOf(req);
    if (path === '/api/phone/status' && method === 'GET') {
      const state = await store.load(workspace);
      return json({ configured: twilioConfigured(env), numbers: phoneOf(state).numbers, webhook: `${origin}/api/phone/twilio/voice/${workspace}` });
    }
    if (path === '/api/phone/search' && method === 'POST') {
      needs('settings');
      return json({ numbers: await client().search({ areaCode: String(body.areaCode || ''), contains: String(body.contains || '') }) });
    }
    if (path === '/api/phone/buy' && method === 'POST') {
      needs('settings');
      const number = e164(body.number);
      if (!number) fail('Escolha um número.');
      const bought = await client().buy(number, { voice: hook(origin, 'voice', workspace), status: hook(origin, 'status', workspace), name: String(body.name || '').slice(0, 60), bundle: env.TWILIO_BUNDLE_SID || '', address: env.TWILIO_ADDRESS_SID || '' });
      const id = (await change(workspace, { type: 'phone-number-add', data: { sid: bought.sid, number: bought.phone_number || number, name: body.name, forward: body.forward } })).id;
      return json({ id, numbers: phoneOf(await store.load(workspace)).numbers });
    }
    if (path === '/api/phone/release' && method === 'POST') {
      needs('settings');
      const number = phoneOf(await store.load(workspace)).numbers.find(row => row.id === body.id);
      if (!number) fail('Número não encontrado.', 404);
      await client().release(number.sid).catch(problem => { if (problem.status !== 404) throw problem; });
      await change(workspace, { type: 'phone-number-remove', data: { id: number.id } });
      return json({ numbers: phoneOf(await store.load(workspace)).numbers });
    }
    if (path === '/api/phone/call' && method === 'POST') {
      needs('conversations');
      const state = await store.load(workspace);
      const contact = state.contacts.find(row => row.id === body.contactId);
      if (!contact) fail('Contato não encontrado.', 404);
      const to = e164(contact.phone);
      if (!to) fail('O contato não tem um telefone válido.');
      const numbers = phoneOf(state).numbers, number = numbers.find(row => row.id === body.numberId) || numbers[0];
      if (!number) fail('Compre um número em Configurações → Telefonia.', 409);
      const agent = e164(body.agentPhone) || number.forward?.[0];
      if (!agent) fail('Informe o seu telefone: a Graao liga primeiro para você e depois para o contato.');
      const callId = await placeCall(workspace, origin, { contactId: contact.id, numberId: number.id, agent, to, userId: who?.userId || '' });
      flushLater(workspace);
      return json({ id: callId, agent, to });
    }
    if (path.startsWith('/api/phone/dialer/') && method === 'POST') {
      needs('conversations');
      const state = await store.load(workspace), dialer = dialerOf(state), userId = who?.userId || 'local';
      const mine = dialer.sessions.find(row => row.userId === userId && row.status !== 'ended');
      if (path === '/api/phone/dialer/start') {
        const numbers = phoneOf(state).numbers, number = numbers.find(row => row.id === body.numberId) || numbers[0];
        if (!number) fail('Compre um número em Configurações → Telefonia.', 409);
        const agent = e164(body.agentPhone) || number.forward?.[0];
        if (!agent) fail('Informe o seu telefone: o discador liga para você e mantém a linha aberta.');
        requireCredit(state, 'phone');
        if (mine?.agentCallSid) await client().hangup(mine.agentCallSid).catch(() => {});
        const id = (await change(workspace, { type: 'dialer-session-start', data: { userId, numberId: number.id, agent } })).id;
        try {
          const made = await client().dial({ to: agent, from: number.number, url: hook(origin, 'dialer', workspace, { session: id }), status: hook(origin, 'dialerend', workspace, { session: id }), timeout: 30 });
          await change(workspace, { type: 'dialer-session-update', data: { id, agentCallSid: made.sid } });
        } catch (problem) {
          await change(workspace, { type: 'dialer-session-update', data: { id, status: 'ended' } });
          throw problem;
        }
        flushLater(workspace);
        return json({ session: id, agent });
      }
      if (!mine) fail('Inicie o discador.', 409);
      if (path === '/api/phone/dialer/next') {
        // Skips contacts without a valid phone; places the next call into the member's room.
        let next;
        for (let i = 0; i < 20; i++) { next = (await change(workspace, { type: 'dialer-next', data: { id: mine.id, contactId: body.contactId || '' } })).id; if (!next?.skip) break; }
        if (!next || next.skip) return json({ done: true });
        const number = phoneOf(await store.load(workspace)).numbers.find(row => row.id === mine.numberId);
        if (!number) fail('Número da Graao não encontrado.', 404);
        const callId = (await change(workspace, { type: 'phone-call-start', data: { direction: 'outbound', kind: 'dialer', dialerId: mine.id, contactId: next.contactId, numberId: number.id, from: number.number, to: next.to, userId } })).id;
        try {
          const made = await client().dial({ to: next.to, from: number.number, url: hook(origin, 'join', workspace, { call: callId }), status: hook(origin, 'status', workspace, { call: callId }), timeout: 25 });
          await change(workspace, { type: 'phone-call-update', data: { callId, callSid: made.sid } });
          await change(workspace, { type: 'dialer-calling', data: { id: mine.id, contactId: next.contactId, callId } });
        } catch (problem) {
          await change(workspace, { type: 'phone-call-update', data: { callId, status: 'failed', final: true } });
          await change(workspace, { type: 'dialer-calling', data: { id: mine.id, contactId: next.contactId, callId, failed: true } });
          throw problem;
        }
        flushLater(workspace);
        return json({ callId, contactId: next.contactId });
      }
      if (path === '/api/phone/dialer/hangup') {
        const current = state.calls.find(row => row.id === mine.currentCallId);
        if (current?.callSid && !current.ended) await client().hangup(current.callSid).catch(() => {});
        return json({ ok: true });
      }
      if (path === '/api/phone/dialer/stop') {
        if (mine.agentCallSid) await client().hangup(mine.agentCallSid).catch(() => {});
        await change(workspace, { type: 'dialer-session-update', data: { id: mine.id, status: 'ended' } });
        return json({ ok: true });
      }
    }
    if (path === '/api/phone/recording' && method === 'GET') {
      needs('conversations');
      const state = await store.load(workspace);
      const call = (state.calls || []).find(row => row.id === url.searchParams.get('call'));
      const recording = call?.voicemailUrl || call?.recordingUrl;
      if (!recording) fail('Gravação não encontrada.', 404);
      const audio = await client().recording(recording);
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length, 'Cache-Control': 'private, max-age=300' });
      return res.end(audio);
    }
    fail('Not found.', 404);
  }

  return { twilioWebhook, api, workflowItem, placeCall, contactByPhone };
}
