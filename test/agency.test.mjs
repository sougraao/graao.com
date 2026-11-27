import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { blank } from '../model.mjs';
import { agencyNav, agencyNavGroups, helpCenterUrl } from '../ui/agency-data.js';

async function start(store = createSqliteStore(':memory:')) {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return { base, call, close: () => new Promise(resolve => server.close(resolve)) };
}
const action = (local, body, headers) => local.call('/api/agency/action', body, headers);
const prospectAction = (local, op, id, data) => local.call('/api/agency/prospecting-action', { op, id, data });

test('Company name is editable while the platform brand stays graao', async t => {
  const local = await start(); t.after(local.close);
  const { body: initial } = await local.call('/api/agency');
  assert.equal(initial.agency.company.primary, '#5dd62c');
  assert.equal(initial.agency.company.secondary, '#337418');
  const logo = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const data = { name: 'Empresa Teste', timezone: 'America/Sao_Paulo', currency: 'BRL',
    primary: '#7c5cf0', secondary: '#00c49a', logo, domain: 'app.empresa.example' };
  for (const requestedBrand of [{}, { brand: 'Outra marca' }]) {
    const saved = await action(local, { type: 'company', data: { ...data, ...requestedBrand } });
    assert.equal(saved.status, 200);
    assert.equal(saved.body.agency.company.name, data.name);
    assert.equal(saved.body.agency.company.brand, 'graao');
    assert.equal(saved.body.agency.company.primary, data.primary);
    assert.equal(saved.body.agency.company.secondary, data.secondary);
  }
  const invalidSecondary = await action(local, { type: 'company', data: { ...data, secondary: 'not-a-color' } });
  assert.equal(invalidSecondary.status, 400);
  const { body } = await local.call('/api/state?workspace=demo');
  assert.equal(body.agency.brand, 'graao');
  assert.equal(body.agency.name, data.name);
  assert.equal(body.agency.primary, data.primary);
  assert.equal(body.agency.secondary, data.secondary);
  assert.equal(body.agency.logo, logo);
});

test('Agency and sub-account currency is always BRL, including older records', async t => {
  const store = createSqliteStore(':memory:');
  const legacyId = '0d1c5227-63a5-48e7-abd0-6f6c91c4b67e';
  const legacy = blank('Conta antiga');
  legacy.profile.currency = 'USD';
  await store.insert(legacyId, legacy);
  const local = await start(store); t.after(local.close);
  const { body: initial } = await local.call('/api/agency');
  assert.equal(initial.agency.company.currency, 'BRL');
  assert.equal(initial.overview.accounts.find(account => account.id === legacyId).currency, 'BRL');
  const company = await action(local, { type: 'company', data: { name: 'Agência teste', timezone: 'America/Sao_Paulo', primary: '#FF00BB', currency: 'USD' } });
  assert.equal(company.status, 200);
  assert.equal(company.body.agency.company.currency, 'BRL');
  const { body: created } = await local.call('/api/workspaces', { name: 'Conta nova', currency: 'USD' });
  assert.equal((await local.call('/api/state?workspace=' + created.id)).body.state.profile.currency, 'BRL');
  const profile = await local.call('/api/action?workspace=' + legacyId, { type: 'profile', data: { name: 'Conta antiga', timezone: 'America/Sao_Paulo', currency: 'EUR' } });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.state.profile.currency, 'BRL');
});

test('Saving Google Maps leads persists only the place references, and duplicate references reuse the existing lead', async t => {
  const local = await start(); t.after(local.close);
  const payload = { placeIds: ['ChIJ-fixture'], rows: [{ placeId: 'ChIJ-fixture', name: 'Provider name', address: 'Provider address' }], audit: true };
  const saved = await prospectAction(local, 'save-maps', '', payload);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.result.length, 1);
  const [lead] = saved.body.agency.prospects;
  assert.equal(lead.placeId, 'ChIJ-fixture');
  assert.equal(lead.name, 'Prospect do Maps');
  assert.equal(lead.address, '');
  assert.equal(lead.report, undefined);
  assert.deepEqual((await prospectAction(local, 'save-maps', '', payload)).body.result, []);
  assert.equal((await prospectAction(local, 'save-maps', '', { placeIds: ['invalid/id'] })).status, 400);
  // The screen reads the business details live; without a Places key there is nothing to read and nothing is stored.
  const live = await local.call('/api/agency/prospecting-places', { ids: [lead.id, 'unknown'] });
  assert.equal(live.status, 200);
  assert.deepEqual(live.body.result, {});
  assert.equal(live.body.agency.prospects[0].name, 'Prospect do Maps');
});

test('Prospecting keeps legacy records, shares reports without private details, and imports to the CRM idempotently', async t => {
  const local = await start(); t.after(local.close);
  const old = await action(local, { type: 'save', key: 'prospects', data: {
    name: 'Legacy bakery', status: 'Contacted', score_website: 6, notes: 'Legacy note'
  } });
  const legacy = old.body.agency.prospects[0];
  assert.equal(legacy.source, 'Manual');
  assert.equal(legacy.report.signals.website, 6);
  assert.equal(legacy.entries[0].text, 'Legacy note');

  const category = (await prospectAction(local, 'category', '', { name: 'Services' })).body.result;
  const result = await prospectAction(local, 'save', '', {
    name: 'New business', website: 'example.net', owner: 'Private Person', email: 'private-person@example.net',
    category: 'Dentist', city: 'Recife', categories: [category], audit: true
  });
  assert.equal(result.status, 200);
  const id = result.body.result;
  assert.deepEqual(result.body.agency.prospects.find(row => row.id === id).categories, [category]);
  await prospectAction(local, 'note', id, { text: 'Keep this note private' });
  const audit = await prospectAction(local, 'audit', id, { score_website: '3.5' });
  assert.equal(audit.body.agency.prospects.find(row => row.id === id).report.signals.website, 3.5);
  const token = (await prospectAction(local, 'share', id)).body.result;
  const report = await fetch(local.base + '/prospecting/report/' + token);
  assert.equal(report.status, 200);
  const html = await report.text();
  assert.match(html, /New business/);
  assert.doesNotMatch(html, /Private Person|private-person@example\.net|Keep this note private/);
  const agency = (await local.call('/api/agency')).body.agency;
  const viewed = agency.prospects.find(row => row.id === id);
  assert.equal(Object.values(viewed.views).reduce((a,b) => a+b,0), 1);

  const transfer = () => local.call('/api/agency/prospecting-transfer', { workspace: 'demo', ids: [id], opportunity: true });
  const initial = await transfer();
  assert.equal(initial.status, 200);
  assert.deepEqual((await transfer()).body.result, initial.body.result);
  const state = (await local.call('/api/state?workspace=demo')).body.state;
  assert.equal(state.contacts.filter(row => row.email === 'private-person@example.net').length, 1);
  assert.equal(state.opportunities.filter(row => row.source === 'Prospecting').length, 1);
  await prospectAction(local, 'unshare', id);
  assert.equal((await fetch(local.base + '/prospecting/report/' + token)).status, 404);
});

test('An active Prospecting widget captures a lead once and can be disabled', async t => {
  const local = await start(); t.after(local.close);
  const saved = await prospectAction(local, 'widget', '', { name: 'Lead capture', headline: 'Request an audit', active: true, audit: true });
  assert.equal(saved.status, 200);
  const id = saved.body.result;
  const url = local.base + '/prospecting/widget/' + id;
  const widget = await fetch(url);
  assert.equal(widget.status, 200);
  assert.match(widget.headers.get('content-security-policy'), /frame-ancestors \*/);
  assert.match(await widget.text(), /Request an audit/);
  const capture = () => fetch(url, { method: 'POST', body: new URLSearchParams({
    name: 'Widget lead', email: 'widget@example.net', website: 'example.net'
  }) });
  assert.match(await (await capture()).text(), /Recebemos seus dados/);
  assert.equal((await capture()).status, 200);
  const prospects = (await local.call('/api/agency')).body.agency.prospects;
  assert.equal(prospects.length, 1);
  assert.equal(prospects[0].source, 'Widget');
  assert.ok(prospects[0].report);
  await prospectAction(local, 'widget', id, { name: 'Lead capture', headline: 'Request an audit', active: false });
  assert.equal((await fetch(url)).status, 404);
});

test('A snapshot copies assets into a new sub-account as drafts and keeps existing ones on reload', async t => {
  const local = await start(); t.after(local.close);
  const save = (key, data) => local.call('/api/action?workspace=demo', { type: 'save', key, data });
  const form = (await save('forms', { name: 'Quote request', active: true })).body.id;
  await save('pages', { name: 'Home', headline: 'Welcome', kind: 'Funnel', formId: form, active: true });
  await save('workflows', { name: 'Follow up', trigger: 'Form submitted', active: true, actions: [{ type: 'Create task', value: 'Call back' }] });

  const created = await local.call('/api/agency/snapshot-create', { workspace: 'demo', name: 'Starter', include: ['pipelines', 'stages', 'forms', 'pages', 'workflows'] });
  assert.equal(created.status, 200);
  const snap = created.body.agency.snapshots[0];
  assert.deepEqual([snap.counts.forms, snap.counts.pages, snap.counts.workflows], [1, 1, 1]);

  const account = await local.call('/api/agency/accounts', { name: 'Client One', email: 'one@example.test', snapshotId: snap.id });
  const id = account.body.result;
  const state = (await local.call(`/api/state?workspace=${id}`)).body.state;
  assert.equal(state.contacts.length, 0, 'contacts are never copied');
  assert.equal(state.pages[0].formId, state.forms[0].id, 'page keeps its form link with the new id');
  assert.notEqual(state.forms[0].id, form);
  assert.equal(state.pages[0].active, false);
  assert.equal(state.workflows[0].active, false);
  assert.equal(state.pipelines.length, 1, 'the existing pipeline with the same name is reused');

  const again = await local.call('/api/agency/snapshot-load', { id: snap.id, workspaces: [id], mode: 'skip' });
  assert.equal(again.body.result[0].added, 0);
  assert.equal((await local.call(`/api/state?workspace=${id}`)).body.state.pages.length, 1);
  const overview = again.body.overview;
  assert.equal(overview.totals.accounts, 2);
  assert.ok((await local.call('/api/agency/audit')).body.entries.some(entry => entry.action === 'Snapshot loaded'));

  assert.equal((await action(local, { type: 'account-meta', id, data: { status: 'Paused' } })).status, 200);
  const denied = await local.call('/api/agency/snapshot-load', { id: snap.id, workspaces: ['demo', id], mode: 'overwrite' });
  assert.equal(denied.body.code, 'ACCOUNT_SUSPENDED');
  assert.equal((await local.call('/api/state?workspace=demo')).body.state.forms[0].active, true, 'the entire batch is checked before the first change');
  assert.deepEqual((await local.call(`/api/state?workspace=${id}`)).body.state, state);
});

test('Snapshots carry account data (fields, values, tags, calendars, templates), load picked records with a conflict preview, and share with asset protection', async t => {
  const local = await start(); t.after(local.close);
  const save = async (key, data) => {
    const r = await local.call('/api/action?workspace=demo', { type: 'save', key, data });
    assert.equal(r.status, 200, `${key}: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  await save('customFields', { name: 'Bairro de interesse', object: 'Contact', type: 'Single line', folder: 'Imóvel' });
  await save('customValues', { name: 'Company Name', value: 'F1 Imobiliária', folder: 'Branding' });
  await save('tags', { name: 'Lead-Instagram' });
  await save('services', { name: 'Visita ao imóvel', duration: 60 });
  await save('emailTemplates', { name: 'Boas-vindas' });
  await save('chatWidgets', { name: 'Chat do site', active: true, askEmail: 'required' });
  const form = await save('forms', { name: 'Quero visitar', active: true });
  const folder = await save('workflowFolders', { name: 'Leads' });
  const flow = await save('workflows', { name: 'Nova visita', trigger: 'Form submitted', formId: form, folderId: folder, active: true, actions: [{ type: 'Add tag', value: 'visita' }] });
  await save('workflows', { name: 'Outro fluxo', trigger: 'Contact created', active: true, actions: [{ type: 'Add tag', value: 'x' }] });

  const created = await local.call('/api/agency/snapshot-create', { workspace: 'demo', name: 'Imob' });
  assert.equal(created.status, 200);
  const snap = created.body.agency.snapshots[0];
  for (const key of ['customFields', 'customValues', 'tags', 'services', 'emailTemplates', 'chatWidgets']) assert.ok(snap.counts[key] >= 1, `${key} is packed`);
  assert.ok(snap.assets.chatWidgets.every(w => w.active === false), 'chat widgets arrive switched off');

  const account = (await local.call('/api/agency/accounts', { name: 'Imob Cliente' })).body.result;
  await local.call(`/api/action?workspace=${account}`, { type: 'save', key: 'tags', data: { name: 'Lead-Instagram' } });

  // Picking one workflow brings its form and folder along; the preview names what already exists and writes nothing.
  const items = { workflows: [flow], tags: '*', customValues: '*' };
  const preview = await local.call('/api/agency/snapshot-preview', { id: snap.id, workspaces: [account], items });
  assert.equal(preview.status, 200);
  const cats = Object.fromEntries(preview.body.result[0].categories.map(c => [c.key, c]));
  assert.deepEqual(cats.tags.conflicts, ['Lead-Instagram']);
  assert.equal(cats.workflows.total, 1);
  assert.equal(cats.forms.total, 1, 'the form the workflow listens to is included');
  assert.equal((await local.call(`/api/state?workspace=${account}`)).body.state.workflows.length, 0, 'preview does not write');

  const loaded = await local.call('/api/agency/snapshot-load', { id: snap.id, workspaces: [account], mode: 'skip', items, modes: { tags: 'overwrite' } });
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.result[0].partial, true);
  assert.equal(loaded.body.result[0].overwritten, 1);
  const state = (await local.call(`/api/state?workspace=${account}`)).body.state;
  assert.deepEqual(state.workflows.map(w => w.name), ['Nova visita']);
  assert.equal(state.workflows[0].triggers[0].config.formId, state.forms[0].id, 'the trigger points at the form copied into this account');
  assert.ok(!JSON.stringify(state.workflows[0]).includes(form), 'no link to the source account survives');
  assert.equal(state.workflows[0].folderId, state.workflowFolders[0].id);
  assert.equal(state.customValues[0].value, 'F1 Imobiliária');
  assert.equal(state.services.length, 0, 'types that were not picked stay out');

  // Share with asset protection: the importer can load it but sees no records and cannot pass it on.
  const code = (await action(local, { type: 'snapshot-share', id: snap.id, data: { protect: true } })).body.result;
  assert.match(code, /^[0-9a-f]{12}$/);
  const imported = await action(local, { type: 'snapshot-import', data: { code } });
  assert.equal(imported.status, 200);
  const copy = imported.body.agency.snapshots.find(s => s.id === imported.body.result);
  assert.equal(copy.kind, 'imported');
  assert.equal(copy.protected, true);
  assert.equal(copy.assets, undefined, 'protected setups never expose their records');
  assert.ok(copy.counts.workflows >= 2, 'but still show how much they bring');
  assert.equal((await action(local, { type: 'snapshot-share', id: copy.id })).status, 403);
  const other = (await local.call('/api/agency/accounts', { name: 'Imob Dois' })).body.result;
  const whole = await local.call('/api/agency/snapshot-load', { id: copy.id, workspaces: [other], mode: 'skip', items: { workflows: '*', services: '*' } });
  assert.equal(whole.status, 200);
  const otherState = (await local.call(`/api/state?workspace=${other}`)).body.state;
  assert.equal(otherState.workflows.length, 2);
  assert.equal(otherState.services[0].name, 'Visita ao imóvel');
  assert.equal((await action(local, { type: 'snapshot-unshare', id: snap.id })).status, 200);
  assert.equal((await action(local, { type: 'snapshot-import', data: { code } })).status, 404, 'a revoked link stops working');
});

test('API keys are shown once, stored as hashes, and private integrations respect scopes', async t => {
  const local = await start(); t.after(local.close);
  const key = await action(local, { type: 'api-key', data: { name: 'Script' } });
  const secret = key.body.result.secret;
  assert.match(secret, /^go_[0-9a-f]{48}$/);
  assert.equal(JSON.stringify(key.body.agency).includes(secret), false);
  assert.equal(key.body.agency.apiKeys[0].hash, undefined);

  assert.equal((await local.call('/api/v1/subaccounts')).status, 401);
  const list = await local.call('/api/v1/subaccounts', undefined, { Authorization: `Bearer ${secret}` });
  assert.deepEqual(list.body.subaccounts.map(w => w.id), ['demo']);

  const pit = await action(local, { type: 'private-integration', data: { name: 'Reader', scopes: ['contacts.read'] } });
  const token = pit.body.result.secret;
  assert.equal((await local.call('/api/v1/subaccounts/demo/contacts', undefined, { Authorization: `Bearer ${token}` })).body.contacts.length, 3);
  const denied = await local.call('/api/v1/subaccounts/demo/contacts', { name: 'Blocked' }, { Authorization: `Bearer ${token}` });
  assert.equal(denied.status, 401);
  const added = await local.call('/api/v1/subaccounts/demo/contacts', { name: 'From API' }, { Authorization: `Bearer ${secret}` });
  assert.equal(added.status, 201);
});

test('Account users only reach their sub-accounts and permitted modules; agency users cannot change settings', async t => {
  const local = await start(); t.after(local.close);
  const other = (await local.call('/api/agency/accounts', { name: 'Other client' })).body.result;
  const user = await action(local, { type: 'save', key: 'users', data: { first: 'Ana', last: 'Lima', email: 'ana@example.test', role: 'Account User', accounts: ['demo'], permissions: ['contacts'] } });
  const userId = user.body.result;
  const as = { 'X-Go-User': userId };
  assert.equal((await local.call(`/api/state?workspace=${other}`, undefined, as)).status, 403);
  const own = await local.call('/api/state?workspace=demo', undefined, as);
  assert.deepEqual(own.body.workspaces.map(w => w.id), ['demo']);
  assert.equal((await local.call('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Allowed' } }, as)).status, 200);
  assert.equal((await local.call('/api/action?workspace=demo', { type: 'save', key: 'invoices', data: {} }, as)).status, 403);
  assert.equal((await local.call('/api/agency', undefined, as)).status, 403);

  const staff = (await action(local, { type: 'save', key: 'users', data: { first: 'Bia', last: 'Reis', email: 'bia@example.test', role: 'Agency User' } })).body.result;
  assert.equal((await local.call('/api/agency', undefined, { 'X-Go-User': staff })).status, 200);
  assert.equal((await action(local, { type: 'api-key', data: { name: 'x' } }, { 'X-Go-User': staff })).status, 403);
  const log = (await local.call('/api/agency/audit')).body.entries;
  assert.ok(log.some(entry => entry.actor === 'Ana Lima' && entry.action === 'Saved contacts'));
});

test('Reselling, plans, affiliate payouts and announcements feed the dashboard and sub-accounts', async t => {
  const local = await start(); t.after(local.close);
  const plan = (await action(local, { type: 'save', key: 'plans', data: { name: 'Growth', price: 199 } })).body.result;
  await action(local, { type: 'account-meta', id: 'demo', data: { status: 'Active', plan } });
  assert.equal((await action(local, { type: 'resell', id: 'listings', data: { price: 10, enabled: ['demo'] } })).status, 400);
  const resold = await action(local, { type: 'resell', id: 'listings', data: { price: 45, enabled: [] } });
  assert.deepEqual(resold.body.agency.reselling.listings.disabled, ['demo']);
  assert.equal(resold.body.overview.totals.mrr, 199);

  assert.equal((await action(local, { type: 'affiliate-accept', data: { agree: true } })).status, 400);
  for (const step of ['policy', 'video', 'toolkit', 'flowchart']) await action(local, { type: 'affiliate-step', data: { step } });
  assert.equal((await action(local, { type: 'affiliate-accept', data: { agree: true } })).status, 200);
  await action(local, { type: 'save', key: 'referrals', data: { name: 'Shop', plan: 'Starter', amount: 100, status: 'Active' } });
  const paid = await action(local, { type: 'affiliate-pay' });
  assert.equal(paid.body.result, 40);
  assert.equal((await action(local, { type: 'affiliate-pay' })).status, 400);

  await action(local, { type: 'save', key: 'announcements', data: { title: 'Maintenance', body: 'Tonight', tone: 'Warning', published: true } });
  await action(local, { type: 'save', key: 'menuLinks', data: { title: 'Help desk', url: 'https://help.example.test/', icon: 'help', openIn: 'New tab', showOn: 'Sub-accounts' } });
  const seen = (await local.call('/api/state?workspace=demo')).body.agency;
  assert.equal(seen.announcements[0].title, 'Maintenance');
  assert.equal(seen.menuLinks[0].url, 'https://help.example.test/');

  // A biblioteca de modelos da agência saiu do produto: nem o menu nem o comando existem mais.
  assert.ok(!agencyNav.some(([key]) => key === 'templates'));
  // A Universidade saiu: o menu leva para a central de ajuda.
  assert.ok(!agencyNav.some(([key]) => key === 'university'));
  assert.equal(helpCenterUrl, 'https://doc.graao.com/');
  // Cada item do menu pertence a uma seção conhecida (ou ao rodapé), e nenhuma seção fica vazia.
  const sections = agencyNavGroups.map(([key]) => key);
  for (const [key, , , group] of agencyNav) assert.ok([...sections, 'rodape'].includes(group), `${key} sem seção`);
  for (const section of sections) assert.ok(agencyNav.some(n => n[3] === section), `seção ${section} vazia`);
  assert.equal(new Set(agencyNav.map(n => n[2])).size, agencyNav.length, 'ícones repetidos no menu da agência');
  assert.equal((await local.call('/api/agency/template-install', { template: 'tpl-dental', workspace: 'demo' })).status, 404);
  assert.equal((await action(local, { type: 'save', key: 'templates', data: { name: 'X' } })).status, 400);
});

test('SaaS Configurator, sub-account feature switches, email domain and app reselling follow their rules', async t => {
  const local = await start(); t.after(local.close);
  const ws = (await local.call('/api/agency')).body.overview.accounts[0].id;

  assert.equal((await action(local, { type: 'saas-mode', data: { enabled: true } })).body.agency.saas.enabled, true);
  assert.equal((await action(local, { type: 'saas-rebilling', data: { phone: 11 } })).status, 400);
  const rebill = Object.fromEntries(['phone', 'email', 'automations', 'ai', 'whatsapp', 'voice-ai', 'enrichment', 'domains'].map(k => [k, 1]));
  assert.equal((await action(local, { type: 'saas-rebilling', data: { ...rebill, phone: 1.5 } })).body.agency.saas.rebilling.phone, 1.5);
  assert.deepEqual((await action(local, { type: 'saas-account', id: ws, data: { enabled: true } })).body.agency.saas.accounts, [ws]);

  // Number Intelligence starts off: rebilling it is refused until it is enabled; disabling clears rebilling.
  assert.equal((await action(local, { type: 'sub-feature', id: 'number-intelligence', data: { account: ws, field: 'rebill', value: true } })).status, 400);
  await action(local, { type: 'sub-feature', id: 'number-intelligence', data: { account: ws, field: 'on', value: true } });
  let agency = (await action(local, { type: 'sub-feature', id: 'number-intelligence', data: { account: ws, field: 'rebill', value: true } })).body.agency;
  assert.deepEqual(agency.subFeatures['number-intelligence'].rebill, [ws]);
  agency = (await action(local, { type: 'sub-feature', id: 'number-intelligence', data: { account: ws, field: 'on', value: false } })).body.agency;
  assert.deepEqual(agency.subFeatures['number-intelligence'].rebill, []);
  // Premium features start on, so rebilling is allowed right away.
  assert.equal((await action(local, { type: 'sub-feature', id: 'workflow-premium', data: { account: ws, field: 'rebill', value: true } })).status, 200);

  assert.equal((await action(local, { type: 'workflow-builder', data: { builder: 'Advanced', [`o_${ws}`]: 'Standard' } })).body.agency.workflowSettings.overrides[ws], 'Standard');
  assert.equal((await action(local, { type: 'email-domain', data: { domain: 'not a domain' } })).status, 400);
  // Sem RESEND_API_KEY o domínio dedicado não é guardado: antes ele ficava salvo sem existir no serviço de e-mail.
  assert.equal((await action(local, { type: 'email-domain', data: { domain: 'https://Mail.Example.com/' } })).status, 503);
  assert.equal((await action(local, { type: 'affiliate-pixel', data: { pixelId: 'abc' } })).status, 400);

  assert.equal((await action(local, { type: 'app-resell', id: 'slack', data: { cost: 10, price: 5 } })).status, 400);
  await action(local, { type: 'app-resell', id: 'slack', data: { cost: 10, price: 25 } });
  assert.equal((await action(local, { type: 'app-install', id: 'slack', data: { scope: 'Sub-account', account: ws } })).status, 400);
  await action(local, { type: 'integration', id: 'slack', data: { accounts: [ws] } });
  agency = (await action(local, { type: 'app-install', id: 'slack', data: { scope: 'Sub-account', account: ws } })).body.agency;
  assert.equal(agency.apps.installs.length, 1);
  assert.equal((await action(local, { type: 'app-install', id: 'slack', data: { scope: 'Sub-account', account: ws } })).status, 400);
  agency = (await action(local, { type: 'app-uninstall', id: agency.apps.installs[0].id })).body.agency;
  assert.equal(agency.apps.installs.length, 0);
});

test('Setup marketplace serves official Graao setups, supports install into sub-accounts, and community publish/unpublish across agencies', async t => {
  const local = await start(); t.after(local.close);

  // 1. Official Graao setups are available out of the box
  const initial = await local.call('/api/agency');
  assert.equal(initial.status, 200);
  const officials = initial.body.marketplace.filter(item => item.official);
  assert.equal(officials.length, 6);
  const full360 = officials.find(item => item.id === 'official-agencia-completa-360');
  assert.ok(full360);
  assert.equal(full360.counts.pipelines, 3);
  assert.equal(full360.counts.workflows, 22);
  assert.equal(full360.counts.snippets, 41);
  assert.equal(full360.counts.agents, 5);
  const installed360 = await local.call('/api/agency/marketplace-install', { id: full360.id });
  assert.equal(installed360.status, 200);
  const sub360 = await local.call('/api/agency/accounts', { name: 'Agência Piloto 360', snapshotId: installed360.body.result.snapshotId });
  assert.equal(sub360.status, 200);
  const state360 = (await local.call(`/api/state?workspace=${sub360.body.result}`)).body.state;
  assert.ok(state360.pipelines.some(p => p.name === 'Prospecção'));
  assert.ok(state360.pipelines.some(p => p.name === 'Onboarding de Clientes'));
  assert.ok(state360.pipelines.some(p => p.name === 'Clientes Ativos & Retenção'));
  assert.equal(state360.workflows.length, 22);
  assert.equal(state360.workflowFolders.length, 7);
  assert.equal(state360.snippets.length, 41);
  assert.equal(state360.snippetFolders.length, 7);
  assert.equal(state360.forms.length, 7);
  assert.equal(state360.pages.length, 5);
  assert.equal(state360.agents.length, 5);
  assert.equal(state360.studioProjects.length, 2);
  assert.ok(state360.workflows.every(w => w.active === false && Boolean(w.folderId)));
  const clinic = officials.find(item => item.id === 'official-clinica-estetica');
  assert.ok(clinic);
  assert.equal(clinic.installs, 0);
  assert.ok(clinic.preview.pipelines?.includes('Avaliação & Fechamento'));
  assert.equal(clinic.assets, undefined, 'marketplace list payload strips heavy assets');

  // 2. Installing an official setup saves it to agency library, bumps installs, and loads cleanly into a new sub-account
  const installed = await local.call('/api/agency/marketplace-install', { id: clinic.id });
  assert.equal(installed.status, 200);
  const copyId = installed.body.result.snapshotId;
  assert.equal(installed.body.marketplace.find(x => x.id === clinic.id).installs, 1);
  const savedSnap = installed.body.agency.snapshots.find(s => s.id === copyId);
  assert.equal(savedSnap.kind, 'marketplace');
  assert.equal(savedSnap.official, true);

  const subRes = await local.call('/api/agency/accounts', { name: 'Clínica Bela', snapshotId: copyId });
  assert.equal(subRes.status, 200);
  const subState = (await local.call(`/api/state?workspace=${subRes.body.result}`)).body.state;
  assert.ok(subState.pipelines.some(p => p.name === 'Avaliação & Fechamento'));
  assert.ok(subState.forms.some(f => f.name === 'Agendamento de Avaliação'));
  assert.ok(subState.pages.every(p => p.active === false), 'pages always arrive as drafts');
  assert.ok(subState.workflows.every(w => w.active === false), 'workflows always arrive as drafts');
  assert.ok(subState.agents.some(a => a.name === 'Recepcionista da Clínica'));

  // 3. Create a custom setup with a Studio site (including HTML) and publish it to the marketplace
  const studioRes = await local.call('/api/studio?workspace=demo', {
    mode: 'starter',
    template: 'landing',
    brief: 'Página de vendas para clínica odontológica'
  });
  assert.equal(studioRes.status, 201);
  const createdProjId = studioRes.body.id;
  const createdSnap = await local.call('/api/agency/snapshot-create', {
    workspace: 'demo',
    name: 'Setup Odonto VIP',
    include: ['pipelines', 'stages', 'studioProjects']
  });
  assert.equal(createdSnap.status, 200);
  const ownSnapId = createdSnap.body.result;

  const published = await local.call('/api/agency/marketplace-publish', {
    snapshotId: ownSnapId,
    title: 'Odonto VIP Completo',
    category: 'Saúde e Estética',
    summary: 'Funil odontológico com site de alta conversão no Studio.',
    description: 'Estrutura testada para clínicas odontológicas.',
    tags: 'odonto, clínica, studio'
  });
  assert.equal(published.status, 200);
  const listingId = published.body.result.listingId;
  assert.equal(published.body.result.updated, false);
  const listing = published.body.marketplace.find(x => x.id === listingId);
  assert.ok(listing);
  assert.equal(listing.mine, true);
  assert.equal(listing.official, false);
  assert.deepEqual(listing.tags, ['odonto', 'clínica', 'studio']);

  // Updating the same snapshot's publication updates in place rather than duplicating
  const updatedPub = await local.call('/api/agency/marketplace-publish', {
    snapshotId: ownSnapId,
    title: 'Odonto VIP v2',
    category: 'Saúde e Estética',
    summary: 'Versão revisada do funil odontológico.',
    tags: 'odonto, premium'
  });
  assert.equal(updatedPub.status, 200);
  assert.equal(updatedPub.body.result.updated, true);
  assert.equal(updatedPub.body.result.listingId, listingId);
  assert.equal(updatedPub.body.marketplace.filter(x => x.id === listingId).length, 1);

  // Install the community setup and verify the Studio HTML row is cloned into the new sub-account
  const commInstall = await local.call('/api/agency/marketplace-install', { id: listingId });
  assert.equal(commInstall.status, 200);
  const sub2 = await local.call('/api/agency/accounts', { name: 'Clínica Sorriso', snapshotId: commInstall.body.result.snapshotId });
  assert.equal(sub2.status, 200);
  const sub2State = (await local.call(`/api/state?workspace=${sub2.body.result}`)).body.state;
  const clonedProj = sub2State.studioProjects.find(p => p.id !== createdProjId);
  assert.ok(clonedProj);
  const siteCheck = await local.call(`/api/studio/doc?workspace=${sub2.body.result}&id=${clonedProj.id}`);
  assert.equal(siteCheck.status, 200);
  assert.ok(siteCheck.body.doc.pages.length >= 1, 'Studio HTML pages are cloned with the setup');
  assert.match(siteCheck.body.doc.pages[0].html, /^<!doctype html>/i);

  // Unpublish removes from marketplace while existing local copy remains intact
  const unpub = await local.call('/api/agency/marketplace-unpublish', { id: listingId });
  assert.equal(unpub.status, 200);
  assert.equal(unpub.body.marketplace.some(x => x.id === listingId), false);
  assert.ok(unpub.body.agency.snapshots.some(s => s.id === commInstall.body.result.snapshotId));
});
