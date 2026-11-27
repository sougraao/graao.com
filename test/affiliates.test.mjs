import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { blank, execute } from '../model.mjs';
import { chatDefaults } from '../ui/chat-widget-data.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const ref = (affiliateId, campaignId, at = Date.now()) => ({ affiliateId, campaignId, at });

function program(extra = {}) {
  const s = blank('Loja');
  const campaign = save(s, 'affiliateCampaigns', { name: 'Parceiros', destination: '/loja/demo/x', commissionType: 'percent', commissionValue: 10, holdDays: 7, ...extra });
  const affiliate = save(s, 'affiliates', { name: 'Paula Souza', email: 'paula@example.test', campaignIds: [campaign] });
  return { s, campaign, affiliate };
}

test('Campaign and affiliate records validate rules, codes and e-mails', () => {
  const { s, affiliate } = program();
  assert.throws(() => save(s, 'affiliateCampaigns', { name: 'X', destination: 'javascript:alert(1)', commissionValue: 10 }), /destino/);
  assert.throws(() => save(s, 'affiliateCampaigns', { name: 'X', destination: '/x', commissionValue: 95 }), /90%/);
  assert.equal(s.affiliates[0].code, 'paulasouza');
  assert.throws(() => save(s, 'affiliates', { name: 'Outra', email: 'PAULA@example.test' }), /e-mail/);
  const twin = save(s, 'affiliates', { name: 'Paula Souza', email: 'paula2@example.test' });
  assert.equal(s.affiliates.find(row => row.id === twin).code, 'paulasouza2');
  assert.throws(() => save(s, 'affiliates', { name: 'Y', email: 'y@example.test', code: 'paulasouza' }), /já está em uso/);
  assert.ok(affiliate);
});

test('Referred contacts earn commission on paid invoices after the hold period; voided invoices reverse it', () => {
  const { s, campaign, affiliate } = program();
  const salesFlow = save(s, 'workflows', { name: 'Venda', active: true, triggers: [{ type: 'affiliate_sale', config: {} }], steps: [{ type: 'internal_notification', config: { body: 'Venda de afiliado' } }] });
  execute(s, { type: 'save', key: 'contacts', data: { name: 'Cliente Indicado', email: 'c1@example.test' } }, { affiliate: ref(affiliate, campaign) });
  const referred = s.contacts.at(-1);
  assert.equal(referred.affiliate.affiliateId, affiliate);
  execute(s, { type: 'save', key: 'contacts', data: { name: 'Expirado', email: 'c2@example.test' } }, { affiliate: ref(affiliate, campaign, Date.now() - 61 * 864e5) });
  assert.equal(s.contacts.at(-1).affiliate, undefined, 'cookies older than the window do not count');
  const organic = save(s, 'contacts', { name: 'Orgânico', email: 'c3@example.test' });

  const invoice = save(s, 'invoices', { title: 'Pedido', contactId: referred.id, value: 300, due: '2026-12-01', status: 'Open' });
  assert.equal(s.affiliateCommissions.length, 0);
  save(s, 'invoices', { title: 'Pedido', contactId: referred.id, value: 300, due: '2026-12-01', status: 'Paid' }, invoice);
  save(s, 'invoices', { title: 'Outro', contactId: organic, value: 500, due: '2026-12-01', status: 'Paid' });
  assert.equal(s.affiliateCommissions.length, 1);
  const [commission] = s.affiliateCommissions;
  assert.deepEqual([commission.value, commission.base, commission.status], [30, 300, 'pending']);
  assert.equal(s.runs.filter(row => row.workflowId === salesFlow).length, 1);

  save(s, 'invoices', { title: 'Segundo', contactId: referred.id, value: 200, due: '2026-12-01', status: 'Paid' });
  assert.equal(s.affiliateCommissions.length, 1, '"first purchase" campaigns pay once per customer');

  commission.approveAfter = new Date(Date.now() - 1000).toISOString();
  execute(s, { type: 'affiliate-settings', data: { signup: false } });
  assert.equal(commission.status, 'approved');

  save(s, 'invoices', { title: 'Pedido', contactId: referred.id, value: 300, due: '2026-12-01', status: 'Void' }, invoice);
  assert.equal(commission.status, 'reversed');
});

test('Payouts pay all approved commissions of an affiliate and recurring campaigns pay every invoice', () => {
  const { s, campaign, affiliate } = program({ recurring: 'all', commissionType: 'fixed', commissionValue: 25, holdDays: 0 });
  execute(s, { type: 'save', key: 'contacts', data: { name: 'Assinante', email: 'a@example.test' } }, { affiliate: ref(affiliate, campaign) });
  const contactId = s.contacts.at(-1).id;
  save(s, 'invoices', { title: 'Mês 1', contactId, value: 100, due: '2026-12-01', status: 'Paid' });
  save(s, 'invoices', { title: 'Mês 2', contactId, value: 10, due: '2027-01-01', status: 'Paid' });
  assert.deepEqual(s.affiliateCommissions.map(row => [row.value, row.status]), [[10, 'approved'], [25, 'approved']], 'fixed commissions never exceed the sale');
  const commission = s.affiliateCommissions[0];
  execute(s, { type: 'commission-review', id: commission.id, data: { status: 'pending' } });
  assert.equal(commission.status, 'pending', 'held by hand, it stays pending');
  const payout = execute(s, { type: 'affiliate-payout', data: { affiliateId: affiliate, method: 'pix', reference: 'E2E123' } });
  assert.equal(s.affiliatePayouts[0].amount, 25);
  assert.equal(s.affiliateCommissions[1].payoutId, payout.id ?? s.affiliatePayouts[0].id);
  assert.throws(() => execute(s, { type: 'affiliate-payout', data: { affiliateId: affiliate } }), /aprovadas/);
});

test('The workflow action turns a contact into an affiliate', () => {
  const { s, campaign } = program();
  save(s, 'workflows', { name: 'Clientes viram parceiros', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'embaixador' } }], steps: [{ type: 'make_affiliate', config: { campaignId: campaign } }] });
  save(s, 'contacts', { name: 'Rita Lima', email: 'rita@example.test', tags: ['embaixador'] });
  assert.equal(s.affiliates.at(-1).email, 'rita@example.test');
  assert.equal(s.affiliates.at(-1).source, 'Automação');
});

test('Referral link, cookie attribution on public sign-ups, sign-up and private portal over HTTP', async t => {
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }).then(async r => ({ status: r.status, ...await r.json() }));
  const state = async () => (await fetch(`${base}/api/state`).then(r => r.json())).state;

  const campaign = (await post('/api/action', { type: 'save', key: 'affiliateCampaigns', data: { name: 'Indique', destination: '/avaliar/demo', commissionValue: 15 } })).id;
  await post('/api/action', { type: 'save', key: 'affiliates', data: { name: 'Leo Prado', email: 'leo@example.test', campaignIds: [campaign] } });
  const click = await fetch(`${base}/r/demo/leoprado`, { redirect: 'manual' });
  assert.equal(click.status, 302);
  assert.match(click.headers.get('location'), /\/avaliar\/demo$/);
  const cookie = click.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^graao_af_demo=/);
  assert.equal((await fetch(`${base}/r/demo/ninguem`, { redirect: 'manual' })).status, 404);

  // A public review page sign-up creates no contact; the store/form flows do. Use the chat widget, which creates a contact.
  const widget = (await post('/api/action', { type: 'save', key: 'chatWidgets', data: { ...chatDefaults('Site'), active: true } })).id;
  const chat = await post(`/api/chat/demo/${widget}/start`, { name: 'Visitante', email: 'visitante@example.test', body: 'Olá' }, { Cookie: cookie });
  assert.ok(chat.status < 300, JSON.stringify(chat));
  let s = await state();
  assert.equal(s.contacts.find(row => row.email === 'visitante@example.test').affiliate.campaignId, campaign);
  assert.equal(s.affiliates[0].clicks, 1);
  await post('/api/action', { type: 'save', key: 'contacts', data: { name: 'Pela equipe', email: 'equipe@example.test' } }, { Cookie: cookie });
  s = await state();
  assert.equal(s.contacts.find(row => row.email === 'equipe@example.test').affiliate, undefined, 'contacts created in the app are never attributed');

  assert.equal((await post('/api/afiliados/demo/signup', { name: 'Nina', email: 'nina@example.test' })).status, 403);
  await post('/api/action', { type: 'affiliate-settings', data: { signup: true, autoApprove: false, terms: 'Regras' } });
  assert.equal((await post('/api/afiliados/demo/signup', { name: 'Nina', email: 'nina@example.test' })).status, 400, 'terms must be accepted');
  const joined = await post('/api/afiliados/demo/signup', { name: 'Nina Reis', email: 'nina@example.test', pix: 'nina@example.test', terms: true });
  assert.equal(joined.status, 201);
  assert.equal(joined.status === 201 && (await state()).affiliates.find(row => row.email === 'nina@example.test').status, 'pending');
  assert.equal((await post('/api/afiliados/demo/signup', { name: 'Nina', email: 'nina@example.test', terms: true })).status, 409);
  const portal = await fetch(base + joined.portal);
  assert.equal(portal.status, 200);
  const html = await portal.text();
  assert.match(html, /Olá, Nina!/);
  assert.match(html, /em análise/);
  assert.doesNotMatch(html, /visitante@example\.test/);
  assert.equal((await fetch(`${base}/afiliados/demo/${'0'.repeat(48)}`)).status, 404);
});
