// 5.4: Ad Manager (Meta Ads, Google Ads), the ads reports and attribution of leads, opportunities and revenue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { blank, execute } from '../model.mjs';
import { storeAdSync } from '../ads-model.mjs';
import { createMetaAd, setCampaignStatus, syncAds, useAdsFetch } from '../ads-providers.mjs';
import { attributionReport, campaignReport, classify, presetRange, touchFromVisit } from '../ui/ads-data.js';
import { newField } from '../ui/form-fields.js';

const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('Visits are classified into channels from UTM tags, click ids and the referrer', () => {
  assert.equal(classify({ gclid: 'abc' }), 'google_ads');
  assert.equal(classify({ source: 'google', medium: 'cpc' }), 'google_ads');
  assert.equal(classify({ source: 'facebook', medium: 'paid' }), 'meta_ads');
  assert.equal(classify({ fbclid: 'x' }), 'social', 'fbclid alone is also added to organic Facebook clicks');
  assert.equal(classify({ source: 'tiktok', medium: 'cpc' }), 'paid_other');
  assert.equal(classify({ source: 'newsletter', medium: 'email' }), 'email');
  assert.equal(classify({ referrer: 'google.com.br' }), 'organic_search');
  assert.equal(classify({ referrer: 'l.instagram.com' }), 'social');
  assert.equal(classify({ referrer: 'blog.parceiro.com' }), 'referral');
  assert.equal(classify({}), 'direct');
  assert.equal(touchFromVisit('/s/demo/x?ref=1', 'https://graao.app/p', 'graao.app'), null, 'an internal visit without tags is not a new source');
  const t = touchFromVisit('/form/demo/f?utm_source=google&utm_medium=cpc&utm_campaign=Inverno&gclid=G1', 'https://www.google.com/', 'graao.app', Date.parse('2026-11-20T10:00:00Z'));
  assert.deepEqual([t.channel, t.campaign, t.gclid, t.referrer, t.landing, t.at], ['google_ads', 'Inverno', 'G1', 'google.com', '/form/demo/f', '2026-11-20T10:00:00.000Z']);
});

test('Date presets follow the sub-account calendar', () => {
  const now = new Date('2026-11-21T02:00:00Z'); // still the 20th in São Paulo
  assert.deepEqual(presetRange('7d', 'America/Sao_Paulo', now), ['2026-11-14', '2026-11-20']);
  assert.deepEqual(presetRange('lastmonth', 'America/Sao_Paulo', now), ['2026-10-01', '2026-10-31']);
  assert.deepEqual(presetRange('week', 'America/Sao_Paulo', now), ['2026-11-16', '2026-11-20']);
  assert.deepEqual(presetRange('custom', 'UTC', now, { from: '2026-02-10', to: '2026-01-05' }), ['2026-01-05', '2026-02-10']);
});

async function start(t) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const action = async command => (await fetch(`${base}/api/action?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) })).json();
  const ads = async (op, body) => {
    const r = await fetch(`${base}/api/ads/workspace/${op}?workspace=demo`, body === undefined ? { redirect: 'manual' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, location: r.headers.get('location'), body: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text() };
  };
  return { base, action, ads };
}

test('Public forms keep the first and last touch of the visitor and fire the ad lead trigger', async t => {
  const { base, action } = await start(t);
  const saved = await action({ type: 'save', key: 'forms', data: { name: 'Orçamento', active: true, fields: [newField('name'), newField('email')] } });
  const form = saved.state.forms.find(f => f.name === 'Orçamento');
  await action({ type: 'save', key: 'workflows', data: { name: 'Lead pago', active: true, triggers: [{ type: 'ad_lead', config: { network: 'google_ads' } }], steps: [{ type: 'internal_notification', config: { body: 'Lead de {{trigger.campaign}}' } }] } });

  const visit = await fetch(`${base}/form/demo/${form.id}?utm_source=google&utm_medium=cpc&utm_campaign=Inverno&utm_id=111&gclid=G1`, { headers: { Referer: 'https://www.google.com/' } });
  const cookie = visit.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^graao_at_demo=/);
  const later = await fetch(`${base}/form/demo/${form.id}`, { headers: { Referer: 'https://www.bing.com/', Cookie: cookie } });
  const both = later.headers.get('set-cookie').split(';')[0];

  const post = (body, jar) => fetch(`${base}/form/demo/${form.id}`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base, ...(jar ? { Cookie: jar } : {}) }, body });
  await post('name=Ana&email=ana%40example.com', both);
  await post('name=Bia&email=bia%40example.com');
  const state = (await action({ type: 'ad-settings', data: { model: 'first' } })).state;
  const ana = state.contacts.find(c => c.email === 'ana@example.com'), bia = state.contacts.find(c => c.email === 'bia@example.com');
  assert.deepEqual([ana.attribution.first.channel, ana.attribution.first.campaign, ana.attribution.last.channel], ['google_ads', 'Inverno', 'organic_search']);
  assert.equal(bia.attribution.last.channel, 'direct', 'a visitor without a cookie is a direct lead');
  assert.deepEqual(state.attributionEvents.filter(e => e.contactId === ana.id).map(e => e.type), ['lead', 'form_submission']);
  assert.equal(state.teamMessages.filter(m => /Lead de/.test(m.body)).length, 0, 'the last touch was organic, not an ad');
  assert.equal(state.adSettings.model, 'first');

  // A visitor straight from the ad: the trigger runs once with the campaign.
  const ad = (await fetch(`${base}/form/demo/${form.id}?utm_source=google&utm_medium=cpc&utm_campaign=Inverno`)).headers.get('set-cookie').split(';')[0];
  await post('name=Caio&email=caio%40example.com', ad);
  const after = (await action({ type: 'ad-settings', data: {} })).state;
  assert.deepEqual(after.teamMessages.filter(m => /Lead de/.test(m.body)).map(m => m.body), ['Lead pago: Lead de Inverno']);
  // Members using the app never get a touch recorded.
  await action({ type: 'save', key: 'contacts', data: { name: 'Interno', email: 'i@example.com' } });
  assert.equal((await action({ type: 'ad-settings', data: {} })).state.contacts.find(c => c.name === 'Interno').attribution, undefined);
});

test('Attribution groups leads, opportunities and revenue by channel and campaign', () => {
  const s = blank();
  const touch = (channel, campaign = '', extra = {}) => ({ channel, campaign, source: '', medium: '', at: '2026-11-10T10:00:00Z', ...extra });
  s.contacts.push({ id: 'a', created: '2026-11-10T10:00:00Z', attribution: { first: touch('google_ads', 'Inverno', { utmId: '111' }), last: touch('organic_search') } },
    { id: 'b', created: '2026-11-11T10:00:00Z', attribution: { first: touch('meta_ads', 'Natal'), last: touch('meta_ads', 'Natal') } },
    { id: 'c', created: '2026-10-01T10:00:00Z' });
  s.opportunities.push({ id: 'o1', contactId: 'a', value: 1000, status: 'Won', created: '2026-11-12T10:00:00Z', statusChangedAt: '2026-11-15T10:00:00Z' },
    { id: 'o2', contactId: 'b', value: 400, status: 'Open', created: '2026-11-12T10:00:00Z' });
  s.invoices.push({ id: 'i1', contactId: 'a', value: 900, status: 'Paid', paidAt: '2026-11-16T10:00:00Z' }, { id: 'i2', contactId: 'c', value: 50, status: 'Paid', paidAt: '2026-11-16T10:00:00Z' },
    { id: 'i3', contactId: 'b', value: 70, status: 'Sent', created: '2026-11-16T10:00:00Z' });
  const range = ['2026-11-01', '2026-11-30'];
  const first = attributionReport(s, { model: 'first', range });
  assert.deepEqual(first.rows.map(r => [r.channel, r.campaign, r.leads, r.revenue]), [['google_ads', 'Inverno', 1, 900], ['direct', '', 0, 50], ['meta_ads', 'Natal', 1, 0]]);
  assert.deepEqual([first.total.leads, first.total.opportunities, first.total.wonValue, first.total.revenue], [2, 2, 1000, 950]);
  assert.equal(attributionReport(s, { model: 'last', range }).rows[0].channel, 'organic_search', 'the last touch moves the sale');
});

test('The ads report joins network spend with CRM leads and sales, plus the management fee', () => {
  const s = blank();
  storeAdSync(s, 'google', { account: { id: '999', currency: 'BRL' }, from: '2026-11-01', to: '2026-11-30',
    campaigns: [{ id: '111', name: 'Inverno', status: 'active', budget: 50 }, { id: '222', name: 'Marca', status: 'paused', budget: 20 }],
    stats: [{ campaignId: '111', date: '2026-11-10', spend: 100, clicks: 50, impressions: 1000, leads: 3 }, { campaignId: '111', date: '2026-11-11', spend: 100, clicks: 50, impressions: 1000 }, { campaignId: '222', date: '2026-11-11', spend: 20, clicks: 4, impressions: 200 }] });
  const g = (campaign, utmId = '') => ({ first: { channel: 'google_ads', campaign, utmId, at: '2026-11-10T00:00:00Z' }, last: { channel: 'google_ads', campaign, utmId, at: '2026-11-10T00:00:00Z' } });
  s.contacts.push({ id: 'a', created: '2026-11-10T12:00:00Z', attribution: g('111') }, { id: 'b', created: '2026-11-11T12:00:00Z', attribution: g('inverno') }, { id: 'c', created: '2026-11-12T12:00:00Z', attribution: g('outra') });
  s.invoices.push({ id: 'i', contactId: 'a', value: 600, status: 'Paid', paidAt: '2026-11-20T12:00:00Z' });
  const report = campaignReport(s, 'google', { range: ['2026-11-01', '2026-11-30'], fee: 10 });
  const [inverno, marca, rest] = report.rows;
  assert.deepEqual([inverno.cost, inverno.clicks, inverno.leads, inverno.sales, inverno.revenue], [220, 100, 2, 1, 600], 'matched by id or by name, case-insensitive');
  assert.equal(inverno.cpl, 110); assert.equal(inverno.ctr, 0.05); assert.ok(Math.abs(inverno.roi - (600 - 220) / 220) < 1e-9);
  assert.equal(marca.leads, 0);
  assert.deepEqual([rest.name, rest.leads], ['Sem campanha identificada', 1]);
  assert.equal(report.total.cost, 242);
  assert.equal(report.days.length, 30);

  storeAdSync(s, 'google', { account: { id: '999' }, from: '2026-11-11', to: '2026-11-11', campaigns: [{ id: '111', name: 'Inverno', status: 'active' }], stats: [{ campaignId: '111', date: '2026-11-11', spend: 5 }] });
  assert.deepEqual(s.adStats.filter(r => r.network === 'google').map(r => [r.date, r.spend]), [['2026-11-10', 100], ['2026-11-11', 5]], 're-synced days are replaced, others kept');
  assert.deepEqual(s.adCampaigns.map(c => c.id), ['111'], 'the campaign list is replaced');
  assert.throws(() => execute(s, { type: 'save', key: 'adCampaigns', data: { name: 'x' } }), 'synced data is not editable by members');
});

test('Meta and Google sync campaigns and daily numbers; changes go to the right endpoints', async t => {
  const calls = [];
  useAdsFetch(async (url, init = {}) => {
    const u = new URL(url), body = typeof init.body === 'string' ? (init.body.startsWith('{') ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body))) : init.body;
    calls.push({ host: u.host, path: u.pathname, query: Object.fromEntries(u.searchParams), body, headers: init.headers });
    if (u.pathname.endsWith('/act_1/campaigns') && init.method !== 'POST') return reply({ data: [{ id: '10', name: 'Natal', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '5000', objective: 'OUTCOME_TRAFFIC' }, { id: '11', name: 'Velha', status: 'PAUSED', effective_status: 'PAUSED', lifetime_budget: '90000' }] });
    if (u.pathname.endsWith('/act_1/insights')) return reply({ data: [{ campaign_id: '10', date_start: '2026-11-10', spend: '12.50', clicks: '30', impressions: '900', actions: [{ action_type: 'lead', value: '2' }, { action_type: 'link_click', value: '30' }] }] });
    if (u.pathname.endsWith('googleAds:searchStream')) return reply(/segments\.date/.test(body.query)
      ? [{ results: [{ campaign: { id: '7' }, segments: { date: '2026-11-10' }, metrics: { clicks: '8', impressions: '100', costMicros: '4500000', conversions: 1.6 } }] }]
      : [{ results: [{ campaign: { id: '7', name: 'Pesquisa', status: 'ENABLED', advertisingChannelType: 'SEARCH' }, campaignBudget: { amountMicros: '30000000', resourceName: 'customers/42/campaignBudgets/5' } }] }]);
    if (u.pathname.endsWith('campaigns:mutate')) return reply({ results: [{}] });
    if (u.pathname.endsWith('/act_1/campaigns')) return reply({ id: 'C1' });
    if (u.pathname.endsWith('/act_1/adsets')) return reply({ id: 'S1' });
    if (u.pathname.endsWith('/act_1/adimages')) return reply({ images: { bytes: { hash: 'H1' } } });
    if (u.pathname.endsWith('/act_1/adcreatives')) return reply({ id: 'CR1' });
    if (u.pathname.endsWith('/act_1/ads')) return reply({ id: 'A1' });
    return reply({ error: { message: `unexpected ${u.href}` } }, 500);
  });
  t.after(() => useAdsFetch((...a) => fetch(...a)));

  const meta = await syncAds('meta', { token: 'm' }, { id: 'act_1' }, '2026-11-01', '2026-11-30');
  assert.deepEqual(meta.campaigns.map(c => [c.id, c.status, c.budget, c.budgetType]), [['10', 'active', 50, 'daily'], ['11', 'paused', 900, 'lifetime']]);
  assert.deepEqual(meta.stats, [{ campaignId: '10', date: '2026-11-10', spend: 12.5, clicks: 30, impressions: 900, leads: 2 }]);
  assert.deepEqual(JSON.parse(calls.find(c => c.path.endsWith('/insights')).query.time_range), { since: '2026-11-01', until: '2026-11-30' });

  const google = await syncAds('google', { token: 'g' }, { id: '42' }, '2026-11-01', '2026-11-30');
  assert.deepEqual(google.campaigns[0], { id: '7', name: 'Pesquisa', status: 'active', rawStatus: 'ENABLED', objective: 'SEARCH', budget: 30, budgetType: 'daily', budgetResource: 'customers/42/campaignBudgets/5' });
  assert.deepEqual(google.stats[0], { campaignId: '7', date: '2026-11-10', spend: 4.5, clicks: 8, impressions: 100, leads: 2 });
  assert.equal(calls.find(c => c.path.endsWith('searchStream')).headers['developer-token'], undefined, 'developer tokens were retired');
  assert.match(calls.find(c => c.path.endsWith('searchStream')).path, /^\/v26\//);

  await setCampaignStatus('google', { token: 'g' }, { id: '42' }, '7', false);
  assert.deepEqual(calls.at(-1).body.operations[0], { update: { resourceName: 'customers/42/campaigns/7', status: 'PAUSED' }, updateMask: 'status' });
  await assert.rejects(setCampaignStatus('meta', { token: 'm' }, { id: 'act_1' }, '../me', true), /inválida/);

  calls.length = 0;
  const made = await createMetaAd({ token: 'm' }, { id: 'act_1' }, { id: 'P9' }, { name: 'Natal', objective: 'traffic', dailyBudget: 25, start: '2030-01-01T00:00:00.000Z', end: '', countries: ['BR'], ageMin: 25, ageMax: 45, genders: [2],
    message: 'Oi', headline: 'Promo', link: 'https://loja.example/', cta: 'SHOP_NOW' }, Buffer.from('img'));
  assert.deepEqual(made, { campaignId: 'C1', adsetId: 'S1', adId: 'A1' });
  const [camp, adset, , creative, ad] = calls.map(c => c.body);
  assert.deepEqual([camp.objective, camp.status, adset.daily_budget, adset.optimization_goal, adset.targeting.genders, adset.status, ad.status], ['OUTCOME_TRAFFIC', 'PAUSED', 2500, 'LINK_CLICKS', [2], 'PAUSED', 'PAUSED']);
  assert.equal(creative.object_story_spec.page_id, 'P9');
  assert.match(creative.url_tags, /utm_id=\{\{campaign\.id\}\}/);
});

test('Connecting Meta Ads by OAuth, choosing the account, syncing, pausing, creating and disconnecting', async t => {
  Object.assign(process.env, { META_APP_ID: 'app', META_APP_SECRET: 'secret' });
  t.after(() => { delete process.env.META_APP_ID; delete process.env.META_APP_SECRET; });
  const posted = [];
  useAdsFetch(async (url, init = {}) => {
    const u = new URL(url);
    if (init.method === 'POST') posted.push({ path: u.pathname, body: String(init.body || '') });
    if (u.pathname.endsWith('/oauth/access_token')) return reply({ access_token: u.searchParams.get('fb_exchange_token') ? 'long' : 'short', expires_in: 5_000_000 });
    if (u.pathname.endsWith('/me')) return reply({ name: 'Ana Ads' });
    if (u.pathname.endsWith('/me/adaccounts')) return reply({ data: [{ id: 'act_1', name: 'Loja', currency: 'BRL', account_status: 1 }, { id: 'act_2', name: 'Outra', currency: 'USD', account_status: 1 }] });
    if (u.pathname.endsWith('/me/accounts')) return reply({ data: [{ id: 'P9', name: 'Página da Loja' }] });
    if (u.pathname.endsWith('/act_1/campaigns') && init.method !== 'POST') return reply({ data: [{ id: '10', name: 'Natal', status: 'ACTIVE', effective_status: 'ACTIVE', daily_budget: '5000' }] });
    if (u.pathname.endsWith('/act_1/insights')) return reply({ data: [] });
    if (u.pathname.endsWith('/10')) return reply({ success: true });
    if (u.pathname.endsWith('/act_1/campaigns')) return reply({ id: 'C1' });
    if (u.pathname.endsWith('/act_1/adsets')) return reply({ id: 'S1' });
    if (u.pathname.endsWith('/act_1/adimages')) return reply({ images: { bytes: { hash: 'H1' } } });
    if (u.pathname.endsWith('/act_1/adcreatives')) return reply({ id: 'CR1' });
    if (u.pathname.endsWith('/act_1/ads')) return reply({ id: 'A1' });
    return reply({ error: { message: `unexpected ${u.href}` } }, 500);
  });
  t.after(() => useAdsFetch((...a) => fetch(...a)));
  const { base, action, ads } = await start(t);

  const before = await ads('status');
  assert.deepEqual([before.body.configured.meta, before.body.configured.google, before.body.meta.connected], [true, false, false]);
  assert.equal((await ads('connect')).status, 400, 'the network is required');
  assert.equal((await fetch(`${base}/api/ads/workspace/connect?workspace=demo&network=google`, { redirect: 'manual' })).status, 409, 'Google Ads needs the OAuth client');
  const go = await fetch(`${base}/api/ads/workspace/connect?workspace=demo&network=meta`, { redirect: 'manual' });
  const auth = new URL(go.headers.get('location'));
  assert.match(auth.searchParams.get('scope'), /ads_management/);
  const popup = await (await fetch(`${base}/api/ads/callback?state=${auth.searchParams.get('state')}&code=abc`)).text();
  assert.match(popup, /graao-ads/); assert.doesNotMatch(popup, /"error"/);
  assert.match(await (await fetch(`${base}/api/ads/callback?state=${auth.searchParams.get('state')}&code=abc`)).text(), /expirou/, 'a state works once');

  const status = (await ads('status')).body.meta;
  assert.deepEqual([status.connected, status.user, status.accounts.length, status.accountId, status.pageId], [true, 'Ana Ads', 2, '', 'P9']);
  assert.doesNotMatch(JSON.stringify(status), /long/, 'the token never reaches the browser');

  const chosen = await ads('select', { network: 'meta', accountId: 'act_1' });
  assert.equal(chosen.status, 200);
  assert.deepEqual(chosen.body.state.adCampaigns.map(c => [c.id, c.name, c.status, c.budget]), [['10', 'Natal', 'active', 50]]);
  assert.equal(chosen.body.state.adSettings.connected.meta, true);
  assert.equal((await ads('select', { network: 'meta', accountId: 'act_x' })).status, 400);

  const paused = await ads('campaign', { network: 'meta', id: '10', action: 'pause' });
  assert.equal(paused.body.state.adCampaigns[0].status, 'paused');
  assert.match(posted.at(-1).body, /status=PAUSED/);
  assert.equal((await ads('campaign', { network: 'meta', id: '10', action: 'budget', budget: 80 })).body.state.adCampaigns[0].budget, 80);

  const file = (await action({ type: 'save', key: 'files', data: { name: 'arte.png', data: PNG } })).state.files.find(f => f.name === 'arte.png');
  assert.equal((await ads('create', { network: 'meta', name: 'Natal', objective: 'traffic', dailyBudget: 2, message: 'Oi', link: 'https://loja.example/', fileId: file.id })).status, 400, 'the minimum budget');
  const created = await ads('create', { network: 'meta', name: 'Natal', objective: 'traffic', dailyBudget: 20, message: 'Oi', link: 'https://loja.example/', fileId: file.id, countries: 'BR, PT' });
  assert.deepEqual(created.body.created, { campaignId: 'C1', adsetId: 'S1', adId: 'A1' });

  const gone = await ads('disconnect', { network: 'meta' });
  assert.deepEqual([gone.body.ads.meta.connected, gone.body.state.adSettings.connected.meta, gone.body.state.adCampaigns.length], [false, false, 0]);
});
