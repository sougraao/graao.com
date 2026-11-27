import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { blank, execute } from '../model.mjs';
import { qrTarget } from '../qr-model.mjs';
import { reviewTokenHash } from '../reputation-model.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data }, { workspace: 'demo' });
const run = (s, type, data) => execute(s, { type, data }, { workspace: 'demo' });
const tokenOf = body => body.match(/\/avaliar\/demo\/([0-9a-f]{48})/)?.[1];

test('Settings require https links and the personal link variable in every message', () => {
  const s = blank('Loja');
  const base = { ...s.reputation };
  assert.throws(() => run(s, 'reputation-settings', { ...base, googleUrl: 'http://g.page/x' }), /https/);
  assert.throws(() => run(s, 'reputation-settings', { ...base, whatsapp: 'Avalie a gente!' }), /review\.link/);
  assert.throws(() => run(s, 'reputation-settings', { ...base, otherUrl: 'https://trip.example' }), /Dê um nome/);
  run(s, 'reputation-settings', { ...base, googleUrl: 'https://g.page/r/abc/review', origin: 'https://app.graao.test/qualquer' });
  assert.equal(s.reputation.googleUrl, 'https://g.page/r/abc/review');
  assert.equal(s.reputation.origin, 'https://app.graao.test');
});

test('Requests send a personal link per contact and skip who cannot or should not receive one', () => {
  const s = blank('Loja');
  s.reputation.origin = 'https://app.graao.test';
  const ana = save(s, 'contacts', { name: 'Ana Lima', email: 'ana@example.test', phone: '+5511999990000' });
  const bia = save(s, 'contacts', { name: 'Bia', email: 'bia@example.test' });
  const caio = save(s, 'contacts', { name: 'Caio', phone: '+5511999990001', dnd: true });
  const result = run(s, 'review-request', { channel: 'WhatsApp', contactIds: [ana, bia, caio] });
  assert.equal(result.sent, 1);
  assert.deepEqual(result.skipped, ['Bia: sem telefone', 'Caio: não perturbe']);
  const message = s.messages.find(row => row.contactId === ana && row.channel === 'WhatsApp');
  assert.match(message.body, /^Oi, Ana! .*https:\/\/app\.graao\.test\/avaliar\/demo\/[0-9a-f]{48}$/);
  const item = s.workflowOutbox.find(row => row.kind === 'whatsapp');
  assert.equal(item.body, message.body);
  const [request] = s.reviewRequests;
  assert.equal(request.tokenHash, reviewTokenHash(tokenOf(message.body)));
  assert.equal(JSON.stringify(s.reviewRequests).includes(tokenOf(message.body)), false, 'only the hash is stored');
  assert.equal(run(s, 'review-request', { channel: 'WhatsApp', contactIds: [ana] }).skipped[0], 'Ana Lima: já recebeu um pedido nos últimos 7 dias');
  assert.equal(run(s, 'review-request', { channel: 'Email', contactIds: [ana, bia], force: true }).sent, 2);
  assert.equal(s.workflowOutbox.filter(row => row.kind === 'review-email').length, 2);
});

test('A personal link opens, becomes a review tied to the contact and fires the review trigger once', () => {
  const s = blank('Loja');
  const ana = save(s, 'contacts', { name: 'Ana Lima', phone: '+5511999990000' });
  const flow = save(s, 'workflows', { name: 'Nota baixa', active: true, triggers: [{ type: 'review_received', config: { maxScore: '3' } }], steps: [{ type: 'add_tag', config: { tag: 'detrator' } }] });
  run(s, 'review-request', { channel: 'WhatsApp', contactIds: [ana] });
  const token = tokenOf(s.messages.at(-1).body);
  assert.equal(run(s, 'review-open', { tokenHash: reviewTokenHash(token) }), true);
  assert.equal(s.reviewRequests[0].status, 'opened');
  assert.throws(() => run(s, 'review-submit', { tokenHash: reviewTokenHash(token), score: 7 }), /1 a 5/);
  run(s, 'review-submit', { tokenHash: reviewTokenHash(token), score: 2, text: 'Demorou demais.' });
  const review = s.reviews.at(-1);
  assert.equal(review.contactId, ana);
  assert.equal(review.author, 'Ana Lima');
  assert.equal(s.reviewRequests[0].status, 'reviewed');
  assert.ok(s.contacts.find(row => row.id === ana).tags.includes('detrator'));
  assert.equal(s.runs.filter(row => row.workflowId === flow).length, 1);
  assert.throws(() => run(s, 'review-submit', { tokenHash: reviewTokenHash(token), score: 5 }), /já enviou/);
  const before = s.reviews.length;
  run(s, 'review-submit', { score: 5, website: 'spam.example' });
  assert.equal(s.reviews.length, before, 'the honeypot drops bots silently');
  run(s, 'review-submit', { score: 5, name: 'Visitante', text: 'Ótimo' });
  assert.equal(s.reviews.at(-1).contactId, '');
});

test('The workflow action sends the personal link with the channel message', () => {
  const s = blank('Loja');
  s.reputation.origin = 'https://app.graao.test';
  const flow = save(s, 'workflows', { name: 'Pós-venda', active: true, triggers: [{ type: 'contact_created', config: {} }], steps: [{ type: 'review_request', config: { channel: 'Email' } }] });
  save(s, 'contacts', { name: 'Dani', email: 'dani@example.test' });
  const [runRow] = s.runs.filter(row => row.workflowId === flow);
  assert.ok(runRow.results.some(line => /link de avaliação na fila/.test(line)));
  assert.equal(s.reviewRequests[0].source, 'workflow');
  const email = s.workflowOutbox.find(row => row.kind === 'review-email');
  assert.match(email.subject, /Loja/);
  assert.match(email.body, /https:\/\/app\.graao\.test\/avaliar\/demo\/[0-9a-f]{48}/);
  save(s, 'contacts', { name: 'Sem email' });
  assert.ok(s.runs.at(-1).results.some(line => /sem e-mail/.test(line)));
});

test('A QR code can point to the review page', () => {
  const s = blank('Loja');
  assert.equal(qrTarget(s, { type: 'review' }, { base: 'https://app.graao.test', workspace: 'demo' }), 'https://app.graao.test/avaliar/demo');
});

test('Public page, review submission and AI reply suggestion over HTTP', async t => {
  const asked = [];
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false, agentModel: 'gpt-4.1-mini',
    contentAI: { async writeReviewReply(connection, request) { asked.push(request); await connection.onUsage({ model: 'gpt-4.1-mini', usage: { input_tokens: 80, output_tokens: 40 } }); return { text: `Obrigado, ${request.author}!` }; } } });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, ...await r.json() }));
  const page = await fetch(`${base}/avaliar/demo`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(await page.text(), /Enviar avaliação/);
  assert.equal((await fetch(`${base}/avaliar/demo/${'a'.repeat(48)}`)).status, 404);
  const contactId = (await post('/api/action', { type: 'save', key: 'contacts', data: { name: 'Fábio Reis', phone: '+5511988887777' } })).id;
  await post('/api/action', { type: 'review-request', data: { channel: 'WhatsApp', contactIds: [contactId] } });
  const sentState = (await fetch(`${base}/api/state`).then(r => r.json())).state;
  const token = tokenOf(sentState.messages.find(row => row.contactId === contactId && row.channel === 'WhatsApp').body);
  const personal = await fetch(`${base}/avaliar/demo/${token}`);
  assert.equal(personal.status, 200);
  assert.match(await personal.text(), /Fábio, como foi/);
  assert.equal((await fetch(`${base}/api/state`).then(r => r.json())).state.reviewRequests[0].status, 'opened');
  assert.equal((await post('/api/avaliar/demo', { token, score: 5, text: 'Excelente' })).status, 201);
  assert.match(await fetch(`${base}/avaliar/demo/${token}`).then(r => r.text()), /Obrigado pela avaliação/);
  assert.equal((await post('/api/avaliar/demo', { score: 0 })).status, 400);
  assert.equal((await post('/api/avaliar/demo', { score: 4, name: 'Eva', text: 'Muito bom' })).status, 201);
  const { state } = await fetch(`${base}/api/state`).then(r => r.json());
  const review = state.reviews.find(row => row.author === 'Eva');
  assert.equal(review.source, 'Link de avaliação');
  const reply = await post('/api/content-ai/review-reply', { reviewId: review.id });
  assert.equal(reply.text, 'Obrigado, Eva!');
  assert.equal(asked[0].score, 4);
  assert.equal((await post('/api/content-ai/review-reply', { reviewId: 'x' })).status, 404);
});
