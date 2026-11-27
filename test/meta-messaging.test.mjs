import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { blank, execute } from '../model.mjs';
import { seal } from '../social-providers.mjs';
import { metaComments, metaFailure, metaInbound, metaSignatureValid, quickReplies, sendMetaCommentReply, sendMetaMessage, subscribeMetaPage } from '../meta-messaging.mjs';
import { actionSpec, triggerSpec } from '../ui/workflow-data.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const dm = (overrides = {}) => ({ kind: 'dm', network: 'facebook', body: 'Oi, quero o preço', senderId: '9001', accountId: '111', mid: 'm_1', authorName: 'Ana Lima', ...overrides });

test('Webhook bodies: the signature, the messages of a page and of an Instagram account, and Meta errors', () => {
  const raw = Buffer.from('{"object":"page"}');
  const signature = `sha256=${createHmac('sha256', 'segredo').update(raw).digest('hex')}`;
  assert.equal(metaSignatureValid(raw, signature, 'segredo'), true);
  assert.equal(metaSignatureValid(raw, signature, 'outro'), false);
  assert.equal(metaSignatureValid(raw, signature, ''), false, 'no app secret, no webhook');
  assert.equal(metaSignatureValid(raw, undefined, 'segredo'), false);

  const page = metaInbound({ object: 'page', entry: [{ id: '111', messaging: [
    { sender: { id: '9001' }, recipient: { id: '111' }, message: { mid: 'm_1', text: 'Oi', quick_reply: { payload: 'Preço' } } },
    { sender: { id: '111' }, recipient: { id: '9001' }, message: { mid: 'm_2', text: 'eco', is_echo: true } },
    { sender: { id: '9001' }, recipient: { id: '111' }, read: { watermark: 1 } },
    { sender: { id: '9001' }, recipient: { id: '111' }, message: { mid: 'm_3', attachments: [{ type: 'image', payload: { url: 'https://cdn.example/x.jpg' } }] } }
  ] }] });
  assert.deepEqual(page.map(row => [row.network, row.accountId, row.senderId, row.body, row.quickReply]), [
    ['facebook', '111', '9001', 'Oi', 'Preço'], ['facebook', '111', '9001', '[image] https://cdn.example/x.jpg', '']]);
  const ig = metaInbound({ object: 'instagram', entry: [{ id: '222', messaging: [{ sender: { id: '7007' }, recipient: { id: '222' }, message: { mid: 'i_1', text: 'Olá' } }] }] });
  assert.deepEqual(ig.map(row => [row.network, row.accountId, row.senderId]), [['instagram', '222', '7007']]);
  assert.deepEqual(metaInbound({ object: 'user' }), []);
  const comments = metaComments({ object: 'instagram', entry: [{ id: '222', changes: [{ field: 'comments', value: { id: '3003', text: 'Quero saber', from: { id: '7007', username: 'ana' }, media: { id: '444' } } }] }] });
  assert.deepEqual(comments, [{ network: 'instagram', accountId: '222', commentId: '3003', senderId: '7007', body: 'Quero saber', authorName: 'ana', handle: 'ana', mediaId: '444', parentId: '' }]);
  const fbComments = metaComments({ object: 'page', entry: [{ id: '111', changes: [{ field: 'feed', value: { item: 'comment', verb: 'add', comment_id: '111_3003', message: 'Oi', from: { id: '9001', name: 'Ana' } } }] }] });
  assert.deepEqual(fbComments.map(row => [row.network, row.accountId, row.commentId, row.senderId, row.body]), [['facebook', '111', '111_3003', '9001', 'Oi']]);

  assert.deepEqual(quickReplies('Sim\n\nNão\nSim\nUm título com mais de vinte letras'), [
    { content_type: 'text', title: 'Sim', payload: 'Sim' }, { content_type: 'text', title: 'Não', payload: 'Não' },
    { content_type: 'text', title: 'Um título com mais d', payload: 'Um título com mais d' }]);
  assert.equal(quickReplies(Array.from({ length: 20 }, (_, n) => `B${n}`).join('\n')).length, 13);
  assert.equal(metaFailure({ code: 10, error_subcode: 2018278 }), 'window_closed');
  assert.equal(metaFailure({ code: 190 }), 'not_connected');
  assert.equal(metaFailure({ code: 551 }), 'no_recipient');
  assert.equal(metaFailure({ code: 1 }), 'provider_error');
});

test('Sending goes to the page with the recipient, the text and the quick replies', async () => {
  const calls = [];
  const request = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ message_id: 'mid.1' })); };
  assert.deepEqual(await sendMetaMessage({ token: 'T', pageId: '111', recipientId: '9001', text: 'Oi', buttons: quickReplies('Sim\nNão') }, request), { sent: true, id: 'mid.1' });
  assert.match(calls[0].url, /\/111\/messages\?access_token=T$/);
  assert.deepEqual(calls[0].body, { recipient: { id: '9001' }, messaging_type: 'RESPONSE', message: { text: 'Oi', quick_replies: quickReplies('Sim\nNão') } });
  const closed = async () => new Response(JSON.stringify({ error: { code: 10, error_subcode: 2018278, message: 'outside window' } }), { status: 400 });
  assert.equal((await sendMetaMessage({ token: 'T', pageId: '111', recipientId: '9001', text: 'Oi' }, closed)).reason, 'window_closed');
  assert.equal((await sendMetaMessage({ token: '', pageId: '111', recipientId: '9001', text: 'Oi' }, request)).reason, 'not_connected');
  assert.equal((await sendMetaMessage({ token: 'T', pageId: '111', recipientId: '', text: 'Oi' }, request)).reason, 'no_recipient');
  const commentCalls = [];
  const commentRequest = async (url, init) => { commentCalls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ id: 'reply.1' })); };
  assert.deepEqual(await sendMetaCommentReply({ token: 'T', commentId: '111_3003', network: 'facebook', text: 'Obrigada!' }, commentRequest), { sent: true, id: 'reply.1' });
  assert.match(commentCalls[0].url, /\/111_3003\/comments\?access_token=T$/);
  assert.deepEqual(commentCalls[0].body, { message: 'Obrigada!' });
  await sendMetaCommentReply({ token: 'T', commentId: '3003', network: 'instagram', text: 'Oi' }, commentRequest);
  assert.match(commentCalls[1].url, /\/3003\/replies\?access_token=T$/);
  const subscription = [];
  assert.equal(await subscribeMetaPage({ token: 'T', pageId: '111' }, async url => { subscription.push(url); return new Response('{}'); }), true);
  assert.match(subscription[0], /subscribed_fields=messages,leadgen,feed/);
});

test('A direct message finds the contact by the id Meta gives, never twice for the same message', () => {
  const s = blank('W');
  const homonym = save(s, 'contacts', { name: 'Ana Lima', email: 'outra.ana@example.test' });
  let result = execute(s, { type: 'social-interaction-trigger', data: dm() });
  assert.notEqual(result.contactId, homonym, 'a Messenger sender is never matched by name');
  const ana = s.contacts.find(row => row.id === result.contactId);
  assert.deepEqual(ana.metaIds, { 'facebook:111': '9001' });
  assert.equal(s.messages.filter(row => row.contactId === ana.id && row.channel === 'Facebook').length, 1);
  assert.equal(execute(s, { type: 'social-interaction-trigger', data: dm() }).duplicate, true, 'Meta resending the same message changes nothing');
  result = execute(s, { type: 'social-interaction-trigger', data: dm({ mid: 'm_2', authorName: 'Outro nome', body: 'De novo' }) });
  assert.equal(result.contactId, ana.id);
  assert.equal(s.messages.filter(row => row.contactId === ana.id).length, 2);
});

test('The Messenger and Direct actions need a contact who wrote on that channel and queue the delivery', () => {
  assert.deepEqual(actionSpec('send_messenger').fields.map(field => field.key), ['body', 'buttons']);
  assert.deepEqual(actionSpec('send_instagram_dm').fields.map(field => field.key), ['body', 'buttons']);
  assert.ok(triggerSpec('message_failed').fields.find(field => field.key === 'reason').options.some(([key]) => key === 'window_closed'));
  const s = blank('W');
  const failed = save(s, 'workflows', { name: 'Falhou', active: true, triggers: [{ type: 'message_failed', config: { channel: 'Facebook', reason: 'no_recipient' } }], steps: [{ type: 'add_tag', config: { tag: 'sem-messenger' } }] });
  const flow = save(s, 'workflows', { name: 'Responder', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'responder' } }],
    steps: [{ type: 'send_messenger', config: { body: 'Olá, {{contact.first_name}}!', buttons: 'Ver preços\nFalar com atendente' } }] });
  const bia = save(s, 'contacts', { name: 'Bia Souza', email: 'bia@example.test', tags: [] });
  save(s, 'contacts', { ...s.contacts.find(row => row.id === bia).valueOf(), tags: ['responder'] }, bia);
  assert.match(runsOf(s, flow)[0].results.join(' '), /ainda não escreveu pelo Messenger/);
  assert.equal(runsOf(s, failed).length, 1);

  const { contactId } = execute(s, { type: 'social-interaction-trigger', data: dm({ senderId: '4242', mid: 'm_9' }) });
  s.workflowOutbox = [];
  const contact = s.contacts.find(row => row.id === contactId);
  save(s, 'contacts', { ...contact, tags: [...contact.tags, 'responder'] }, contactId);
  const [item] = execute(s, { type: 'workflow-outbox-take' });
  assert.deepEqual({ kind: item.kind, network: item.network, recipients: item.recipients, body: item.body, buttons: item.buttons },
    { kind: 'meta-message', network: 'facebook', recipients: { 'facebook:111': '4242' }, body: 'Olá, Ana!', buttons: ['Ver preços', 'Falar com atendente'] });
  assert.equal(s.messages.find(row => row.id === item.messageId).channel, 'Facebook');
});

test('The webhook routes a page message to its sub-account; workflows and team replies go out through the page', async t => {
  const env = { secret: process.env.META_APP_SECRET, verify: process.env.META_WEBHOOK_VERIFY_TOKEN };
  process.env.META_APP_SECRET = 'segredo-app'; process.env.META_WEBHOOK_VERIFY_TOKEN = 'verifica';
  t.after(() => { process.env.META_APP_SECRET = env.secret || ''; process.env.META_WEBHOOK_VERIFY_TOKEN = env.verify || ''; });
  const sent = [];
  let reply = () => ({ message_id: 'mid.ok' });
  const metaFetch = async (url, init = {}) => {
    if (url.includes('/9001?fields=')) return new Response(JSON.stringify({ first_name: 'Ana', last_name: 'Lima' }));
    if (url.includes('/messages?')) { sent.push({ url, body: JSON.parse(init.body) }); const data = reply(); return new Response(JSON.stringify(data), { status: data.error ? 400 : 200 }); }
    if (url.includes('/comments?') || url.includes('/replies?')) { sent.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ id: 'comment.ok' })); }
    return new Response('{}');
  };
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false, metaFetch });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
    return { status: r.status, text: await r.text() };
  };
  const state = async () => JSON.parse((await call('/api/state?workspace=demo')).text).state;
  await state();
  store.change('demo', s => { s.socialAccounts.push({ id: 'acc-fb', provider: 'facebook', externalId: '111', name: 'Página da Clínica', handle: '', status: 'connected' }); });
  store.insert('social-demo', { profile: { name: 'Social Planner' }, tokens: { 'acc-fb': seal({ token: 'PAGE-TOKEN' }) }, pending: {}, states: {} });
  store.insert('social-meta-routes', { profile: { name: 'Meta routes' }, routes: { 111: { workspace: 'demo', accountId: 'acc-fb', network: 'facebook' } } });
  const flow = JSON.parse((await call('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Auto', active: true,
    triggers: [{ type: 'social_dm_received', config: { network: 'facebook' } }], steps: [{ type: 'send_messenger', config: { body: 'Recebemos, {{contact.first_name}}!', buttons: 'Preços' } }] } })).text).id;

  assert.equal((await call('/api/meta/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42')).status, 403);
  const verified = await call('/api/meta/webhook?hub.mode=subscribe&hub.verify_token=verifica&hub.challenge=42');
  assert.deepEqual([verified.status, verified.text], [200, '42']);

  const body = JSON.stringify({ object: 'page', entry: [{ id: '111', messaging: [{ sender: { id: '9001' }, recipient: { id: '111' }, message: { mid: 'm_web_1', text: 'Qual o preço?' } }] }] });
  const post = signature => fetch(`${base}/api/meta/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(signature ? { 'X-Hub-Signature-256': signature } : {}) }, body });
  assert.equal((await post('')).status, 401);
  assert.equal((await post('sha256=00')).status, 401);
  const accepted = await post(`sha256=${createHmac('sha256', 'segredo-app').update(body).digest('hex')}`);
  assert.equal(accepted.status, 200, await accepted.clone().text());

  let s;
  for (let i = 0; i < 100; i++) { s = await state(); if (s.runs.find(run => run.workflowId === flow)?.results.some(line => /Messenger: /.test(line))) break; await new Promise(resolve => setTimeout(resolve, 20)); }
  const ana = s.contacts.find(row => row.metaIds?.['facebook:111'] === '9001');
  assert.equal(ana.name, 'Ana Lima', 'the name comes from the sender profile');
  assert.ok(s.messages.some(row => row.contactId === ana.id && row.direction === 'Inbound' && row.body === 'Qual o preço?'));
  assert.ok(s.runs.find(run => run.workflowId === flow).results.includes('Meta: Messenger: enviada'));
  assert.deepEqual(sent[0].body, { recipient: { id: '9001' }, messaging_type: 'RESPONSE', message: { text: 'Recebemos, Ana!', quick_replies: [{ content_type: 'text', title: 'Preços', payload: 'Preços' }] } });
  assert.match(sent[0].url, /\/111\/messages\?access_token=PAGE-TOKEN$/);

  // A team reply in Conversas goes out too; outside Meta's 24-hour window it is marked as not delivered.
  const replied = JSON.parse((await call('/api/action?workspace=demo', { type: 'message', data: { contactId: ana.id, channel: 'Facebook', direction: 'Outbound', body: 'Pode me chamar no WhatsApp?' } })).text);
  assert.equal(replied.delivery.sent, true);
  assert.equal(sent.at(-1).body.message.text, 'Pode me chamar no WhatsApp?');
  reply = () => ({ error: { code: 10, error_subcode: 2018278, message: 'outside window' } });
  const late = JSON.parse((await call('/api/action?workspace=demo', { type: 'message', data: { contactId: ana.id, channel: 'Facebook', direction: 'Outbound', body: 'Ainda está aí?' } })).text);
  assert.deepEqual(late.delivery, { sent: false, reason: 'window_closed' });
  s = await state();
  assert.equal(s.messages.find(row => row.body === 'Ainda está aí?').failed, 'window_closed');
});
