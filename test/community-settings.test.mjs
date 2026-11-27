import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { makeCommunity } from '../community.mjs';
import { badgesOf, communityAnalytics, extendAccess, hasAccess, heldReason, newsletterDue } from '../community-config.mjs';
import { createSqliteStore } from '../storage.mjs';
import { withAcademyTab } from '../ui/community-data.js';
import { signBody } from '../abacatepay.mjs';
import { saveFiscal } from './helpers/fiscal.mjs';

const KEY = 'abc_dev_shopkey_0000dddd';
const DAY = 86400000;
const save = (s, data, id) => execute(s, { type: 'save', key: 'communities', id, data });

test('Group settings: plans, theme tokens, join questions, onboarding, tabs, moderation and newsletter are validated', () => {
  const s = blank();
  const id = save(s, { name: 'Clube' });
  const group = () => s.communities.find(row => row.id === id);
  assert.deepEqual([group().access, group().theme.preset, group().tabs.map(row => row.key), group().newsletter.enabled], ['free', 'default', ['discussion', 'academy', 'events', 'members', 'ranking', 'about'], false]);
  assert.throws(() => save(s, { access: 'paid' }, id), /pelo menos um plano/);
  assert.throws(() => save(s, { access: 'paid', plans: [{ name: 'Mensal', price: 0.5 }] }, id), /R\$ 1/);
  assert.throws(() => save(s, { theme: { preset: 'custom', tokens: { primary: 'red' } } }, id), /Principal/);
  assert.throws(() => save(s, { questions: Array.from({ length: 6 }, () => ({ text: 'P?' })) }, id), /até 5/);
  assert.throws(() => save(s, { tabs: [{ key: 'discussion', visible: false }, { key: 'academy', visible: false }, { key: 'events', visible: false }, { key: 'members', visible: false }, { key: 'ranking', visible: false }, { key: 'about', visible: false }] }, id), /aba visível/);
  assert.throws(() => save(s, { onboarding: [{ title: 'Leia', link: 'http://x.com' }] }, id), /https/);
  save(s, { access: 'paid', trialDays: 7, plans: [{ name: 'Mensal', price: 49.9, interval: 'month' }, { name: 'Vitalício', price: 497, interval: 'once' }],
    theme: { preset: 'oceano' }, tabs: [{ key: 'about', label: 'Comece aqui' }, { key: 'events', visible: false }, { key: 'nada' }],
    moderation: { keywords: 'Golpe, pirâmide\nGolpe', spamPack: true }, newsletter: { enabled: true, frequency: 'weekly', weekday: 1, hour: 9 },
    questions: [{ text: 'Qual seu objetivo?' }], onboarding: [{ title: 'Apresente-se', link: 'https://exemplo.com' }], welcomeDm: 'Oi {{nome}}!' }, id);
  const g = group();
  assert.equal(g.name, 'Clube', 'settings saved alone keep the name');
  assert.deepEqual(g.plans.map(row => [row.name, row.price, row.interval]), [['Mensal', 49.9, 'month'], ['Vitalício', 497, 'once']]);
  assert.deepEqual([g.theme.preset, g.theme.tokens.primary], ['oceano', '#0e7490']);
  assert.deepEqual(g.tabs.map(row => [row.key, row.label, row.visible]), [['about', 'Comece aqui', true], ['events', 'Eventos', false], ['discussion', 'Discussão', true], ['academy', 'Academia', true], ['members', 'Membros', true], ['ranking', 'Ranking', true]]);
  assert.deepEqual(g.moderation, { keywords: ['golpe', 'pirâmide'], spamPack: true });
  assert.equal(heldReason(g, 'Entre nessa PIRÂMIDE'), 'Palavra-chave: pirâmide');
  assert.equal(heldReason(g, 'Me chama: wa.me/5511'), 'Anti-spam: wa.me/');
  assert.equal(heldReason(g, 'https://a https://b https://c'), 'Anti-spam: muitos links');
  assert.equal(heldReason(g, 'Bom dia, pessoal'), '');
});

test('Layout: widgets keep known keys in order, composer prompt is trimmed, old groups get defaults', () => {
  const s = blank();
  const id = save(s, { name: 'Clube' });
  const g = () => s.communities.find(row => row.id === id);
  assert.deepEqual(g().layout, { widgets: [['about', true], ['events', true], ['ranking', true], ['members', true]].map(([key, visible]) => ({ key, visible })), composerPrompt: '' });
  save(s, { layout: { widgets: [{ key: 'ranking', visible: false }, { key: 'x' }, { key: 'about' }], composerPrompt: '  Conte sua vitória da semana  ' } }, id);
  assert.deepEqual(g().layout.widgets.map(row => [row.key, row.visible]), [['ranking', false], ['about', true], ['events', true], ['members', true]]);
  assert.equal(g().layout.composerPrompt, 'Conte sua vitória da semana');
  assert.throws(() => save(s, { layout: { composerPrompt: 'x'.repeat(81) } }, id), /80/);
  assert.equal(g().name, 'Clube');
});

test('Themes: onPrimary token, dark presets and withAcademyTab', () => {
  const s = blank();
  const id = save(s, { name: 'Clube', theme: { preset: 'noite-neon' } });
  assert.equal(s.communities.find(row => row.id === id).theme.tokens.onPrimary, '#062a2d');
  save(s, { theme: { preset: 'custom', tokens: { primary: '#123456', background: '#ffffff', tertiary: '#eeeeee', font: '#111111', sidebar: '#ffffff', surface: '#ffffff', border: '#dddddd', error: '#cc0000' } } }, id);
  assert.equal(s.communities.find(row => row.id === id).theme.tokens.onPrimary, '#ffffff', 'a custom theme saved before onPrimary existed still validates');
  assert.deepEqual(withAcademyTab([{ key: 'about', label: 'Sobre' }, { key: 'discussion', label: 'Feed' }]).map(row => row.key), ['about', 'discussion', 'academy']);
  assert.deepEqual(withAcademyTab([{ key: 'academy', label: 'Trilhas', visible: false }, { key: 'discussion' }]).map(row => row.label), ['Trilhas', undefined]);
});

test('Paid access lasts the plan period, stacks on renewal and lifetime plans never expire', () => {
  const at = Date.parse('2026-01-31T12:00:00Z');
  assert.equal(extendAccess({}, { interval: 'month' }, at), '2026-03-03T12:00:00.000Z');
  assert.equal(extendAccess({ paidUntil: '2026-02-10T00:00:00Z' }, { interval: 'year' }, at), '2027-02-10T00:00:00.000Z');
  assert.equal(extendAccess({}, { interval: 'once' }, at), null);
  const group = { access: 'paid' };
  assert.equal(hasAccess(group, { status: 'active', paidUntil: '2026-01-01T00:00:00Z' }, at), false);
  assert.equal(hasAccess(group, { status: 'active', paidUntil: '2026-01-01T00:00:00Z', role: 'moderator' }, at), true);
  assert.equal(hasAccess(group, { status: 'active' }, at), true, 'members added by the team keep access');
  assert.equal(hasAccess({ access: 'free' }, { status: 'active', paidUntil: '2020-01-01T00:00:00Z' }, at), true);
});

test('Badges, newsletter schedule and analytics come from the activity', () => {
  const now = Date.parse('2026-05-20T15:00:00Z');
  const iso = days => new Date(now - days * DAY).toISOString();
  const members = { a: { status: 'active', role: 'moderator', joinedAt: iso(200) }, b: { status: 'active', role: 'member', joinedAt: iso(3), lastActive: iso(1) }, c: { status: 'requested', role: 'member', joinedAt: iso(1) } };
  const posts = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, authorId: 'a', created: iso(i), title: `Post ${i}`, likes: [{ memberId: 'b', at: iso(i) }], comments: [] }));
  posts.push({ id: 'h', authorId: 'b', created: iso(0), title: 'Retido', held: 'x', likes: [], comments: [] });
  const data = { members, posts };
  const group = { id: 'g', badgesOff: ['founder'] };
  const badges = badgesOf(group, data, now);
  assert.deepEqual(badges.get('a'), ['moderator', 'streak']);
  assert.deepEqual(badges.get('b'), ['newcomer'], 'held posts earn nothing');
  const stats = communityAnalytics({ invoices: [{ status: 'Paid', value: 97, paidAt: iso(2), communityPlan: { communityId: 'g' } }, { status: 'Paid', value: 50, paidAt: iso(2), communityPlan: { communityId: 'x' } }] }, group, data, { days: 30, at: now, zone: 'UTC' });
  assert.deepEqual([stats.members, stats.newMembers, stats.requested, stats.posts, stats.likes, stats.earnings, stats.sales, stats.inactive], [2, 1, 1, 8, 7, 97, 1, 0]);
  assert.equal(stats.heat[new Date(now).getUTCDay()][15] >= 1, true, 'peak hours by weekday and hour');
  const weekly = { newsletter: { enabled: true, frequency: 'weekly', weekday: 3, hour: 12 } };
  assert.equal(newsletterDue(weekly, {}, now, 'America/Sao_Paulo'), true, 'Wednesday 12:00 in São Paulo');
  assert.equal(newsletterDue(weekly, {}, now, 'UTC'), false);
  assert.equal(newsletterDue(weekly, { newsletterAt: new Date(now - 3600000).toISOString() }, now, 'America/Sao_Paulo'), false, 'once per period');
});

test('Moderation holds flagged posts, members report, the team approves or rejects; join questions and onboarding', async () => {
  const store = createSqliteStore(':memory:');
  const welcomed = [];
  const community = makeCommunity({ store, onMemberJoin: async (workspace, row) => welcomed.push(row.memberId) });
  const s = blank();
  const id = save(s, { name: 'Clube', visibility: 'public', moderation: { keywords: ['golpe'] }, questions: [{ text: 'Objetivo?' }], onboarding: [{ title: 'Apresente-se' }] });
  const portal = { members: [{ id: 'ana', name: 'Ana', email: 'ana@x.test' }, { id: 'bia', name: 'Bia', email: 'bia@x.test' }] };
  const ana = { id: 'ana' }, bia = { id: 'bia' };
  const questionId = s.communities[0].questions[0].id, stepId = s.communities[0].onboarding[0].id;
  await assert.rejects(community.act('w', s, portal, ana, id, { action: 'join' }), /Responda: Objetivo/);
  await community.act('w', s, portal, ana, id, { action: 'join', answers: [{ id: questionId, answer: 'Vender mais' }] });
  await community.act('w', s, portal, bia, id, { action: 'join', answers: [{ id: questionId, answer: 'Aprender' }] });
  assert.deepEqual(welcomed, ['ana', 'bia']);
  const done = await community.act('w', s, portal, ana, id, { action: 'onboarding', stepId });
  assert.deepEqual(done.membership.onboardingDone, [stepId]);

  const mine = await community.act('w', s, portal, ana, id, { action: 'post', title: 'Oportunidade', body: 'Não é golpe!' });
  assert.equal(mine.posts[0].held, 'Em análise', 'the author sees it is under review');
  const others = await community.read('w', s, portal, bia, id, {});
  assert.equal(others.posts.length, 0, 'held posts are hidden from other members');
  await community.act('w', s, portal, bia, id, { action: 'post', title: 'Dica', body: 'Use o CRM' });
  const ok = (await community.read('w', s, portal, ana, id, {})).posts.find(row => row.title === 'Dica');
  await community.act('w', s, portal, ana, id, { action: 'report', postId: ok.id, reason: 'Fora do tema' });
  await assert.rejects(community.act('w', s, portal, bia, id, { action: 'report', postId: ok.id }), /você mesmo/);

  let view = await community.admin('w', s, portal, id);
  assert.deepEqual(view.queue.map(row => [row.title, Boolean(row.held), row.reports.length]).sort(), [['Dica', false, 1], ['Oportunidade', true, 0]]);
  assert.deepEqual(view.members.find(row => row.id === 'ana').answers, [{ question: 'Objetivo?', answer: 'Vender mais' }]);
  assert.equal(view.members.find(row => row.id === 'ana').onboarding, 1);
  const held = view.queue.find(row => row.held);
  view = await community.admin('w', s, portal, id, { action: 'approve', postId: held.postId });
  view = await community.admin('w', s, portal, id, { action: 'dismiss', postId: ok.id });
  assert.equal(view.queue.length, 0);
  assert.equal((await community.read('w', s, portal, bia, id, {})).posts.length, 2, 'approved posts reach everyone');
});

function fakeAbacate() {
  let seq = 0;
  const ok = data => Response.json({ data, error: null, success: true });
  return { async request(url, init = {}) {
    const u = new URL(url), body = init.body ? JSON.parse(init.body) : null;
    if (init.headers?.Authorization !== `Bearer ${KEY}`) return Response.json({ data: null, error: 'Invalid key', success: false }, { status: 401 });
    if (u.pathname === '/v2/stores/get') return ok({ id: 'store_1', name: 'Loja', balance: 0 });
    if (u.pathname === '/v2/products/create') return ok({ id: `prod_${++seq}`, ...body });
    if (u.pathname === '/v2/checkouts/create') { const id = `bill_${++seq}`; return ok({ id, url: `https://app.abacatepay.com/pay/${id}`, status: 'PENDING', devMode: true }); }
    return Response.json({ data: null, error: 'Not found', success: false }, { status: 404 });
  } };
}

test('Paid community: trial, plan purchase through AbacatePay, welcome e-mail and the joined trigger', async t => {
  const gateway = fakeAbacate();
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false,
    openAISecret: 'abacate-test-seal-secret-32-chars!!', abacatePayRequest: gateway.request });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) });
    return { status: r.status, cookie: r.headers.get('set-cookie'), body: await r.json() };
  };
  const portal = '/api/client-portal/demo';
  const signIn = async email => {
    const { body } = await call(`${portal}/admin`, { action: 'invite', email });
    return (await call(`${portal}/exchange`, { token: body.accessPath.split('#access=')[1] })).cookie.split(';')[0];
  };
  const saveRemote = async (key, data) => { const r = await call('/api/action?workspace=demo', { type: 'save', key, data }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body.id; };
  const state = async () => (await call('/api/state?workspace=demo')).body.state;
  const group = await saveRemote('communities', { name: 'Clube VIP', visibility: 'public', access: 'paid', trialDays: 0, plans: [{ name: 'Mensal', price: 39, interval: 'month' }], welcomeDm: 'Oi {{nome}}, que bom ter você na {{comunidade}}!' });
  const flow = await saveRemote('workflows', { name: 'Boas-vindas', active: true, triggers: [{ type: 'community_member_joined', config: { communityId: group } }], steps: [{ type: 'internal_notification', config: { body: 'Novo membro' } }] });
  const plan = (await state()).communities.find(row => row.id === group).plans[0].id;
  const ana = await signIn('ana.vip@example.test');
  const act = body => call(`${portal}/community/${group}`, body, { Cookie: ana });
  assert.equal((await act({ action: 'join' })).status, 402, 'paid, no trial');
  const locked = (await call(`${portal}/community/${group}`, undefined, { Cookie: ana })).body.community;
  assert.equal(locked.posts, undefined);
  assert.deepEqual(locked.group.plans.map(row => row.name), ['Mensal']);
  assert.equal((await act({ action: 'subscribe', planId: plan })).status, 409, 'AbacatePay not connected');
  await call('/api/action?workspace=demo', saveFiscal);
  const connected = (await call('/api/abacatepay/workspace/connect?workspace=demo', { apiKey: KEY })).body;
  const bought = await act({ action: 'subscribe', planId: plan });
  assert.equal(bought.status, 200, JSON.stringify(bought.body));
  assert.match(bought.body.payUrl, /^https:\/\/app\.abacatepay\.com\/pay\//);
  assert.equal(bought.body.community.membership.status, 'pending');
  const invoice = (await state()).invoices.find(row => row.communityPlan?.communityId === group);
  assert.deepEqual([invoice.title, invoice.value], ['Clube VIP: Mensal', 39]);
  const raw = JSON.stringify({ id: 'log_plan_1', event: 'checkout.completed', data: { checkout: { id: invoice.payment.checkoutId, frequency: 'ONE_TIME', status: 'PAID', paidAmount: Math.round(invoice.value * 100) }, payerInformation: { method: 'PIX' } } });
  assert.equal((await fetch(`${connected.webhookUrl}?webhookSecret=${connected.webhookSecret}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signBody(raw) }, body: raw })).status, 200);
  const open = (await call(`${portal}/community/${group}`, undefined, { Cookie: ana })).body.community;
  assert.equal(open.membership.status, 'active');
  assert.ok(Date.parse(open.membership.paidUntil) > Date.now() + 27 * DAY);
  assert.ok(Array.isArray(open.posts));
  const s = await state();
  const contact = s.contacts.find(row => row.email === 'ana.vip@example.test');
  assert.match(s.messages.find(row => row.contactId === contact.id && row.subject === 'Boas-vindas à Clube VIP').body, /Oi ana\.vip, que bom ter você na Clube VIP!/);
  assert.equal(s.runs.filter(row => row.workflowId === flow).length, 1);
  const admin = (await call(`${portal}/community-admin/${group}?days=90`)).body;
  assert.deepEqual([admin.analytics.days, admin.analytics.earnings, admin.analytics.paying], [90, 39, 1]);
});
