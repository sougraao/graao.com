import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { collectLinks, normalizeDesign, renderEmail, mergeValues, safeUrl } from '../ui/email-blocks.js';
import { campaignMailer } from '../email-campaign-send.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const act = (s, type, id, data = {}) => execute(s, { type, id, data }, { workspace: 'demo' });
const blocks = [
  { type: 'heading', text: 'Olá, {{contact.first_name}}' },
  { type: 'text', text: 'Veja [a loja](https://loja.exemplo.com/a?x=1&y=2) e [isto](javascript:alert(1)).\n\n**Até** *já*' },
  { type: 'button', label: 'Comprar', url: 'https://loja.exemplo.com/b' },
  { type: 'image', src: 'http://inseguro.exemplo.com/i.png', url: 'https://loja.exemplo.com/c' },
  { type: 'image', src: 'https://cdn.exemplo.com/i.png', alt: 'Promo', url: 'https://loja.exemplo.com/c' },
  { type: 'script', text: 'nope' }
];

function people(s, n, extra = () => ({})) {
  for (let i = 0; i < n; i++) save(s, 'contacts', { name: `Pessoa ${i} Silva`, email: `p${i}@exemplo.com`, ...extra(i) });
}

test('The renderer escapes contact data, drops unsafe links and numbers the tracked links in order', () => {
  const design = normalizeDesign({ blocks, style: { accent: 'red', background: '#ABCDEF' } });
  assert.deepEqual(design.blocks.map(b => b.type), ['heading', 'text', 'button', 'image', 'image']);
  assert.equal(design.blocks[3].src, '', 'images must be https');
  assert.deepEqual([design.style.accent, design.style.background], ['#ff4f9a', '#abcdef']);
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.deepEqual(collectLinks(design.blocks), ['https://loja.exemplo.com/a?x=1&y=2', 'https://loja.exemplo.com/b', 'https://loja.exemplo.com/c']);

  const values = mergeValues({ name: '<b>Zé</b> Lima', email: 'ze@x.com' }, { name: 'Loja & Cia' });
  const seen = [];
  const { html, text } = renderEmail({ ...design, business: 'Loja & Cia', values, link: (url, i) => { seen.push(url); return `https://t.test/c/${i}`; }, pixel: 'https://t.test/o', unsubscribe: 'https://t.test/u' });
  assert.match(html, /Olá, &lt;b&gt;Zé&lt;\/b&gt;/, 'merge values are escaped');
  assert.ok(!html.includes('javascript:'));
  assert.deepEqual([...html.matchAll(/href="https:\/\/t\.test\/c\/(\d)"/g)].map(m => m[1]), ['0', '1', '2']);
  assert.equal(seen.length, 3);
  assert.match(html, /<strong>Até<\/strong> <em>já<\/em>/);
  assert.match(html, /src="https:\/\/t\.test\/o"/);
  assert.match(html, /Loja &amp; Cia/);
  assert.match(text, /Cancelar inscrição: https:\/\/t\.test\/u/);
  assert.match(text, /a loja \(https:\/\/loja\.exemplo\.com/);
});

test('Scheduling checks the campaign, and the audience skips DND, unsubscribed and duplicate addresses', () => {
  const s = blank();
  people(s, 5, i => ({ tags: i < 3 ? 'vip' : 'lead' }));
  save(s, 'contacts', { name: 'Repetida', email: 'P0@exemplo.com', tags: 'vip' });
  const dnd = save(s, 'contacts', { name: 'Quieta', email: 'q@exemplo.com', tags: 'vip' });
  s.contacts.find(row => row.id === dnd).dnd = true;
  const id = save(s, 'emailCampaigns', { name: 'Promo', blocks, audience: { mode: 'tags', tags: ['VIP'] } });
  assert.throws(() => act(s, 'email-campaign-schedule', id), /assunto/);
  save(s, 'emailCampaigns', { name: 'Promo', subject: 'Oi', blocks: [], audience: { mode: 'tags', tags: ['VIP'] } }, id);
  assert.throws(() => act(s, 'email-campaign-schedule', id), /vazio/);
  save(s, 'emailCampaigns', { name: 'Promo', subject: 'Oi', blocks, audience: { mode: 'tags', tags: ['VIP'] } }, id);
  const scheduled = act(s, 'email-campaign-schedule', id, { at: new Date(Date.now() + 3600e3).toISOString(), origin: 'https://app.graao.test' });
  assert.equal(scheduled.reach, 3, 'vip contacts, one per address, without DND');
  assert.throws(() => save(s, 'emailCampaigns', { name: 'Outra' }, id), /Só rascunhos/);
  assert.equal(act(s, 'email-tick', '', { at: new Date().toISOString() }), 0, 'not due yet');
  assert.equal(act(s, 'email-campaign-cancel', id), 'draft');
  act(s, 'email-campaign-schedule', id);
  assert.equal(act(s, 'email-tick'), 3);
  assert.equal(s.emailCampaigns[0].status, 'sending');
  assert.throws(() => execute(s, { type: 'delete', key: 'emailCampaigns', id }), /sendo enviada/);
  assert.equal(act(s, 'email-campaign-cancel', id), 'cancelled');
  assert.deepEqual([s.emailCampaigns[0].stats.recipients, s.emailCampaigns[0].stats.pending], [3, 0]);
});

test('An A/B test sends A and B to a test group, then the winner to the rest', () => {
  const s = blank();
  people(s, 20);
  save(s, 'workflows', { name: 'Clicou', active: true, triggers: [{ type: 'email_event', config: { event: 'clicked' } }], steps: [{ type: 'add_tag', config: { tag: 'clicou' } }] });
  const id = save(s, 'emailCampaigns', { name: 'Teste', subject: 'Assunto A', blocks, ab: { enabled: true, subjectB: 'Assunto B', testPercent: 20, metric: 'clicks', waitHours: 2 } });
  act(s, 'email-campaign-schedule', id);
  assert.equal(act(s, 'email-tick'), 4, '20% of 20');
  const c = s.emailCampaigns[0];
  assert.equal(c.status, 'testing');
  const batch = act(s, 'email-take');
  assert.deepEqual(batch.items.map(item => item.variant).sort(), ['A', 'A', 'B', 'B']);
  assert.equal(batch.campaigns[id].B.subject, 'Assunto B');
  act(s, 'email-result', '', { results: batch.items.map(item => ({ campaignId: id, token: item.token, ok: true })) });
  const b = batch.items.find(item => item.variant === 'B');
  assert.equal(act(s, 'email-track', '', { token: b.token, event: 'click', index: 1 }).url, 'https://loja.exemplo.com/b');
  assert.equal(act(s, 'email-track', '', { token: b.token, event: 'click', index: 9 }).url, '', 'only the links of the e-mail redirect');
  assert.ok(s.contacts.find(row => row.email === b.email).tags.includes('clicou'), 'the email_event trigger ran');
  assert.equal(act(s, 'email-tick', '', { at: new Date(Date.now() + 3600e3).toISOString() }), 0, 'the test is still running');
  assert.equal(act(s, 'email-tick', '', { at: new Date(Date.now() + 3 * 3600e3).toISOString() }), 16);
  assert.deepEqual([c.ab.winner, c.status], ['B', 'sending']);
  const rest = act(s, 'email-take');
  assert.ok(rest.items.every(item => item.variant === 'B'));
  act(s, 'email-result', '', { results: rest.items.map((item, i) => ({ campaignId: id, token: item.token, ok: i > 0, error: 'caixa cheia' })) });
  assert.equal(c.status, 'sent');
  assert.deepEqual([c.stats.sent, c.stats.failed, c.stats.clicked, c.stats.opened], [19, 1, 1, 1]);
  assert.deepEqual(c.stats.variants, { A: { sent: 2, opened: 0, clicked: 0 }, B: { sent: 2, opened: 1, clicked: 1 } }, 'variant numbers come from the test group only');
  const copy = act(s, 'email-campaign-duplicate', id);
  assert.deepEqual([s.emailCampaigns.find(row => row.id === copy).status, s.emailCampaigns.find(row => row.id === copy).recipients.length], ['draft', 0]);
});

test('Campaigns go out in Resend batches with tracking links; opens, clicks and unsubscribes are recorded', async t => {
  const batches = [];
  const request = async (input, options) => { batches.push({ url: String(input), body: JSON.parse(options.body), idem: options.headers['Idempotency-Key'] }); return new Response(JSON.stringify({ data: [] }), { status: 200 }); };
  const campaignMail = campaignMailer({ key: 're_test', from: 'Graao <no-reply@graao.com>', publicOrigin: '', request });
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store: createSqliteStore(':memory:'), port: 0, campaignMail });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const action = async command => (await fetch(`${base}/api/action?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) })).json();

  for (const [name, email] of [['Ana Souza', 'ana@exemplo.com'], ['Bruno Lima', 'bruno@exemplo.com'], ['Sem e-mail', '']]) await action({ type: 'save', key: 'contacts', data: { name, email } });
  const id = (await action({ type: 'save', key: 'emailCampaigns', data: { name: 'Novidades', subject: 'Oi, {{contact.first_name}}', fromName: 'Loja Demo', replyTo: 'contato@loja.com', blocks } })).id;
  assert.match((await action({ type: 'email-tick', data: {} })).error, /Unknown operation/, 'internal commands are not accepted from the browser');
  await action({ type: 'email-campaign-schedule', id });
  for (let k = 0; k < 50 && !batches.length; k++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(batches.length, 1);
  const [batch] = batches;
  assert.equal(batch.url, 'https://api.resend.com/emails/batch');
  const total = batch.body.length;
  assert.ok(total >= 2 && batch.body.every(m => m.to.length === 1 && m.to[0].includes('@')), 'one message per contact with e-mail (the demo workspace has seeded contacts too)');
  assert.ok(batch.body.some(m => m.to[0] === 'bruno@exemplo.com'));
  const ana = batch.body.find(m => m.to[0] === 'ana@exemplo.com');
  assert.deepEqual([ana.from, ana.subject, ana.reply_to], ['Loja Demo <no-reply@graao.com>', 'Oi, Ana', 'contato@loja.com']);
  const unsubscribe = /<(.+)>/.exec(ana.headers['List-Unsubscribe'])[1];
  assert.equal(ana.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.ok(unsubscribe.startsWith(`${base}/e/u/demo/`), 'links use the origin of the request that scheduled the campaign');
  const pixel = /<img src="([^"]+\/e\/o\/[^"]+)"/.exec(ana.html)[1];
  const click = /href="([^"]+\/e\/c\/[^"]+\/1)"/.exec(ana.html)[1];

  const state = async () => (await (await fetch(`${base}/api/state?workspace=demo`)).json());
  for (let k = 0; k < 50 && (await state()).state.emailCampaigns[0].status !== 'sent'; k++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await fetch(pixel)).headers.get('content-type'), 'image/gif');
  const redirect = await fetch(click, { redirect: 'manual' });
  assert.deepEqual([redirect.status, redirect.headers.get('location')], [302, 'https://loja.exemplo.com/b']);
  assert.equal((await fetch(click.replace(/\/1$/, '/7'), { redirect: 'manual' })).status, 404);
  assert.match(await (await fetch(unsubscribe)).text(), /Deixar de receber os e-mails de marketing/);
  assert.match(await (await fetch(unsubscribe, { method: 'POST', body: 'List-Unsubscribe=One-Click' })).text(), /Inscrição cancelada/);

  const after = (await state()).state;
  const campaign = after.emailCampaigns[0];
  assert.deepEqual([campaign.status, campaign.stats.sent, campaign.stats.opened, campaign.stats.clicked, campaign.stats.unsubscribed], ['sent', total, 1, 1, 1]);
  assert.equal(after.contacts.find(row => row.email === 'ana@exemplo.com').emailUnsubscribed, true);
  const next = (await action({ type: 'save', key: 'emailCampaigns', data: { name: 'Segunda', subject: 'Oi', blocks } })).id;
  assert.equal((await action({ type: 'email-campaign-schedule', id: next })).id.reach, total - 1, 'whoever unsubscribed is left out of the next campaign');
});

test('A test e-mail goes to the given address without tracking, and the endpoint checks its input', async t => {
  const sent = [];
  const campaignMail = campaignMailer({ key: 're_test', from: 'Graao <no-reply@graao.com>', request: async (input, options) => { sent.push(JSON.parse(options.body)[0]); return new Response('{}', { status: 200 }); } });
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store: createSqliteStore(':memory:'), port: 0, campaignMail });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = async body => (await fetch(`http://${host}:${server.address().port}/api/email/campaign/test?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  assert.match((await post({ to: 'não', blocks })).error, /e-mail válido/);
  assert.match((await post({ to: 'eu@exemplo.com', blocks: [] })).error, /vazio/);
  assert.deepEqual(await post({ to: 'eu@exemplo.com', subject: 'Promo {{workspace.name}}', blocks }), { ok: true, to: 'eu@exemplo.com' });
  assert.equal(sent[0].subject, '[Teste] Promo Demo Workspace');
  assert.ok(!sent[0].html.includes('/e/c/') && sent[0].html.includes('https://loja.exemplo.com/b'), 'links point straight to their targets');
});
