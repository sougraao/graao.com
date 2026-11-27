import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { blank, execute } from '../model.mjs';
import { triggerSpec, refSources } from '../ui/workflow-data.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);
const viewFlow = config => ({ name: 'Visitou', active: true, triggers: [{ type: 'site_page_viewed', config }], steps: [{ type: 'add_tag', config: { tag: 'visitou-{{trigger.page}}' } }] });

test('"Página do site ou funil visitada" is a trigger with site and page filters', () => {
  const spec = triggerSpec('site_page_viewed');
  assert.deepEqual(spec.fields.map(field => field.key), ['projectId', 'page']);
  assert.equal(spec.fields[0].source, 'sites');
  const s = blank('W');
  s.studioProjects = [{ id: 'p1', name: 'Aula gratuita', kind: 'funnel' }, { id: 'p2', name: 'Institucional', kind: 'website' }];
  assert.deepEqual(refSources.sites(s), [['p1', 'Aula gratuita · Funil'], ['p2', 'Institucional · Site']]);
});

test('A known visitor viewing a page fires the trigger once per page every 30 minutes; unknown visitors do nothing', () => {
  const s = blank('W');
  s.studioProjects = [{ id: 'p1', name: 'Aula gratuita', kind: 'funnel' }];
  const any = save(s, 'workflows', viewFlow({}));
  const thanks = save(s, 'workflows', viewFlow({ projectId: 'p1', page: 'Obrigado' }));
  const other = save(s, 'workflows', viewFlow({ projectId: 'outro' }));
  const contactId = save(s, 'contacts', { name: 'Ana', email: 'ana@example.test' });
  s.tracking = { ...(s.tracking || {}), visitors: { abc123def: contactId } };

  assert.equal(execute(s, { type: 'site-pageview', data: { projectId: 'p1', pageId: 'pg1', page: 'index', vid: 'naoexiste1' } }), '');
  assert.equal(runsOf(s, any).length, 0);

  execute(s, { type: 'site-pageview', data: { projectId: 'p1', pageId: 'pg1', page: 'index', vid: 'abc123def' } });
  assert.equal(runsOf(s, any).length, 1);
  assert.equal(runsOf(s, thanks).length, 0, 'the page filter is the slug');
  assert.deepEqual(s.contacts[0].tags, ['visitou-index']);

  execute(s, { type: 'site-pageview', data: { projectId: 'p1', pageId: 'pg1', page: 'index', vid: 'abc123def' } });
  assert.equal(runsOf(s, any).length, 1, 'a reload within 30 minutes does not fire again');

  execute(s, { type: 'site-pageview', data: { projectId: 'p1', pageId: 'pg2', page: 'obrigado', vid: 'abc123def' } });
  assert.equal(runsOf(s, thanks).length, 1);
  assert.equal(runsOf(s, other).length, 0);
  assert.equal(runsOf(s, thanks)[0].contactId, contactId);

  const key = Object.keys(s.tracking.siteViews).find(k => k.endsWith(':pg1'));
  s.tracking.siteViews[key] = new Date(Date.now() - 31 * 60000).toISOString();
  execute(s, { type: 'site-pageview', data: { projectId: 'p1', pageId: 'pg1', page: 'index', vid: 'abc123def' } });
  assert.equal(runsOf(s, any).length, 3, 'after 30 minutes the same page counts again');
});

test('A form sent with a visitor id links that browser to the contact', () => {
  const s = blank('W');
  const formId = save(s, 'forms', { name: 'Captura', active: true, fields: [{ key: 'name', label: 'Nome', type: 'text' }, { key: 'email', label: 'E-mail', type: 'email' }] });
  execute(s, { type: 'submit', id: formId, data: { name: 'Bia', email: 'bia@example.test', _vid: 'f00dfeed42' } });
  const contact = s.contacts.find(row => row.email === 'bia@example.test');
  assert.equal(s.tracking.visitors.f00dfeed42, contact.id);
  execute(s, { type: 'submit', id: formId, data: { name: 'Caio', email: 'caio@example.test', _vid: 'x' } });
  assert.equal(s.tracking.visitors.x, undefined, 'an invalid visitor id is ignored');
});

test('On a published funnel, the opt-in sets the visitor cookie and the next page views fire the trigger', async t => {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => (await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  const id = (await call('/api/studio?workspace=demo', { mode: 'starter', kind: 'funnel', template: 'landing', brief: 'Clínica Sorriso' })).id;
  await call('/api/studio/publish?workspace=demo', { id, publish: true });
  await call('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: viewFlow({ projectId: id, page: 'obrigado' }) });
  const site = `${base}/s/demo/${id}`;
  const state = async () => (await (await fetch(`${base}/api/state?workspace=demo`)).json()).state;

  await fetch(`${site}/obrigado`);
  assert.equal((await state()).runs.length, 0, 'an anonymous visit fires nothing');

  const sent = await fetch(site, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=Ana&email=ana.funil%40example.test&_page=index' });
  const cookie = sent.headers.getSetCookie().find(row => row.startsWith('graao_sv_demo='));
  assert.ok(cookie, 'the opt-in sets the visitor cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  const pair = cookie.split(';')[0];

  await fetch(`${site}/obrigado`, { headers: { cookie: pair } });
  let s = await state();
  const ana = s.contacts.find(row => row.email === 'ana.funil@example.test');
  assert.equal(s.runs.length, 1);
  assert.equal(s.runs[0].contactId, ana.id);
  assert.ok(ana.tags.includes('visitou-obrigado'));

  await fetch(`${site}/obrigado`, { headers: { cookie: `${pair}; outro=1` } });
  await fetch(`${site}/obrigado`, { headers: { cookie: 'graao_sv_demo=forjado123' } });
  s = await state();
  assert.equal(s.runs.length, 1, 'a reload and an unknown visitor id fire nothing');
});
