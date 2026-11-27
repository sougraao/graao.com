// Os 5 templates de setup convertidos das subcontas do GHL (scripts/ghl-template/build.mjs):
// galeria, instalação numa subconta nova, sites com até 50 páginas e valores personalizados nas páginas e mensagens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { workflowRecord } from '../workflow-engine.mjs';
import { eachStep } from '../ui/workflow-data.js';
import { setupTemplateSpecs, templateSites } from '../setup-templates.mjs';
import { newSiteDoc, savePage, publish, publicDoc, publishedPages, versionPages, restoreVersion, renderPublic, siteValues, SITE_LIMITS } from '../studio-site.mjs';
import { buildWorkflowContext } from '../expressions.mjs';
import { blank, execute } from '../model.mjs';
import { missing } from '../scripts/ghl-template/textos.mjs';

async function start() {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store: createSqliteStore(':memory:'), port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  return { call, get: path => fetch(base + path), close: () => new Promise(resolve => server.close(resolve)) };
}

const titles = [
  'Funil de Reuniões Qualificadas',
  'Agência de Marketing: Captação, Vendas e Onboarding',
  'Paisagismo e Serviços Externos: Sites, Avaliações e Indicações',
  'Site Inteligente para Serviços Locais: Páginas por Serviço e Região',
  'Imobiliária com Agente de IA: Qualificação e Visitas',
  'Cold Email com Teste A/B: 5 E-mails até a Reunião'
];

test('The gallery lists the meetings funnel and the 5 GHL templates, without their records', async t => {
  const local = await start(); t.after(local.close);
  const gallery = (await local.call('/api/agency/setup-templates', {})).body.result;
  assert.deepEqual(gallery.map(item => item.title), titles);
  assert.ok(gallery.every(item => item.template && item.segment && item.category && item.summary && item.assets === undefined));
});

const ghlLocations = ['gySKVnPk6FGwjrHYbzLe', 'TRimBcmTOcwNBhFnWghh', 'CMWMTj2jO4UwO0j3dEsW', 'dj65rS1ognaXvbJputQQ', 'yeQdZkg7Y8wHQyvfmU9V'];

test('No template carries data of the GHL accounts it came from', () => {
  const text = JSON.stringify(setupTemplateSpecs);
  for (const bad of [/digitalmoon/i, /coastline/i, /\[HTC\]|\[CLIENT\]|\[LEADS\]/, /F1 Cia/i, /CRECI\s*\d/i, /Demo Go High Level/i, /leadconnectorhq\.com\/hooks/i, ...ghlLocations])
    assert.doesNotMatch(text, typeof bad === 'string' ? new RegExp(bad) : bad);
  for (const spec of setupTemplateSpecs) for (const [project, pages] of Object.entries(templateSites(spec.id))) for (const page of pages.pages) {
    // As imagens ainda moram no CDN do GHL (<cdn>/<conta>/media/...); fora delas, nenhum id de conta.
    const outsideImages = page.html.replace(/(?:assets\.cdn\.filesafe\.space|storage\.googleapis\.com\/msgsndr)\/\w+\/media\//g, '');
    for (const id of ghlLocations) assert.ok(!outsideImages.includes(id), `${spec.id}/${project}/${page.slug}: GHL account id`);
    assert.doesNotMatch(page.html, /content\s*:\s*(['"])\\\1/, `${spec.id}/${page.slug}: an unterminated CSS string would swallow the rules after it`);
    assert.doesNotMatch(page.html, /\{\{\s*custom_values\.\w+\s*\}(?!\})/, `${spec.id}/${page.slug}: broken placeholder`);
  }
});

const linkTargets = { stageId: 'stages', formId: 'forms', linkId: 'triggerLinks', widgetId: 'chatWidgets', workflowId: 'workflows', folderId: 'workflowFolders', serviceId: 'services', agentId: 'agents' };

for (const spec of setupTemplateSpecs) {
  test(`Template "${spec.title}" installs a complete sub-account with re-linked workflows and sites`, async t => {
    const local = await start(); t.after(local.close);
    const account = await local.call('/api/agency/accounts', { name: `Cliente ${spec.id}`, templateId: spec.id });
    assert.equal(account.status, 200, JSON.stringify(account.body));
    const ws = account.body.result;
    const state = (await local.call(`/api/state?workspace=${ws}`)).body.state;
    for (const [key, rows] of Object.entries(spec.assets)) if (Array.isArray(rows)) assert.ok(state[key].length >= rows.length, `${key}: ${state[key].length} of ${rows.length}`);
    assert.equal(state.workflows.length, spec.assets.workflows.length);
    assert.equal(state.contacts.length, 0);

    const fieldIds = new Set(state.customFields.map(f => f.id));
    for (const workflow of state.workflows) {
      assert.equal(workflow.active, false, `${workflow.name} arrives as a draft`);
      assert.doesNotThrow(() => workflowRecord(state, { ...workflow, active: false }), `${workflow.name} is valid for the engine`);
      const check = (config, where) => {
        for (const [field, collection] of Object.entries(linkTargets)) {
          const value = config?.[field];
          if (value) assert.ok(state[collection].some(row => row.id === value), `${workflow.name} → ${where}.${field} points at this account`);
        }
      };
      check(workflow, 'workflow');
      for (const trigger of workflow.triggers) check(trigger.config, trigger.type);
      eachStep(workflow.steps, step => check(step.config, step.type));
      for (const [, id] of JSON.stringify(workflow).matchAll(/"custom:([^"]+)"/g)) assert.ok(fieldIds.has(id), `${workflow.name} → custom field ${id}`);
    }
    for (const agent of state.agents || []) assert.ok((agent.bases || []).every(base => state.knowledgeBases.some(kb => kb.id === base)), `${agent.name} keeps its knowledge base`);

    const sites = templateSites(spec.id);
    for (const project of spec.assets.studioProjects || []) {
      const installed = state.studioProjects.find(p => p.name === project.name);
      assert.ok(installed, `site ${project.name} installed`);
      const { doc } = (await local.call(`/api/studio/doc?workspace=${ws}&id=${installed.id}`)).body;
      const expected = sites[project.id]?.pages.length || 0;
      if (!expected) continue;
      assert.equal(doc.pages.length, expected, `${project.name}: pages`);
      assert.ok(expected <= SITE_LIMITS.pages);
      for (const page of doc.pages) {
        const html = page.html ?? (await local.call(`/api/studio/doc?workspace=${ws}&id=${installed.id}&page=${page.id}`)).body.doc.pages.find(p => p.id === page.id).html;
        assert.equal(typeof html, 'string', `${project.name}/${page.slug} has html`);
        for (const [, kind, id] of html.matchAll(/data-graao-embed="(form|booking)" data-id="([^"]*)"/g))
          assert.ok((kind === 'form' ? state.forms : state.services).some(row => row.id === id), `${project.name}/${page.slug}: ${kind} ${id} points at this account`);
        assert.doesNotMatch(html, /<script\b/i);
      }
      const published = await local.call(`/api/studio/publish?workspace=${ws}`, { id: installed.id, publish: true });
      assert.equal(published.status, 200, `${project.name} publishes: ${JSON.stringify(published.body).slice(0, 200)}`);
      const live = await local.get(`/s/${ws}/${installed.id}`);
      assert.equal(live.status, 200, `${project.name} is live`);
      assert.doesNotMatch(await live.text(), /\{\{\s*custom_values\./, `${project.name}: custom values are filled`);
    }
    for (const form of state.forms) {
      for (const to of [form.onSubmit, ...(form.routes || []).map(r => r.destination)].filter(Boolean)) {
        assert.notEqual(to.action, 'url', `${form.name}: no unknown destination`);
        if (to.action === 'page') assert.ok(state.studioProjects.some(p => p.id === to.siteId), `${form.name} → page of this account`);
        if (to.url) assert.match(to.url, /^https?:\/\/[^\s/]+\.[^\s]+$/, `${form.name}: redirect address`);
      }
    }
  });
}

test('A big site sends one page of html at a time and the others on demand', () => {
  const pages = Array.from({ length: 6 }, (_, i) => ({ name: `Página ${i}`, slug: i ? `p${i}` : 'index', html: `<!doctype html><html><body><p>${'x'.repeat(300_000)}</p><p>${i}</p></body></html>` }));
  const doc = newSiteDoc({ workspace: '', project: { id: 'big', name: 'Grande' }, pages });
  const first = publicDoc(doc);
  assert.equal(first.pages.filter(p => typeof p.html === 'string').length, 1);
  assert.ok(first.pages.slice(1).every(p => p.html === undefined && p.size > 300_000));
  const third = publicDoc(doc, doc.pages[3].id);
  assert.match(third.pages[3].html, /<p>3<\/p>/);
  assert.equal(third.pages[0].html, undefined);
  const small = newSiteDoc({ workspace: '', project: { id: 's', name: 'Pequeno' }, pages: pages.slice(0, 2).map(p => ({ ...p, html: '<p>oi</p>' })) });
  assert.ok(publicDoc(small).pages.every(p => typeof p.html === 'string'), 'a small site sends everything');
});

test('Versions keep only the pages that changed, and restore and publish bring the html back', () => {
  const doc = newSiteDoc({ workspace: '', project: { id: 'v', name: 'Versões' }, pages: [{ name: 'Início', slug: 'index', html: '<p>um</p>' }, { name: 'Sobre', slug: 'sobre', html: '<p>sobre</p>' }] });
  const original = doc.versions.at(-1).id;
  savePage(doc, doc.pages[0].id, '<p>dois</p>', 'Edição');
  const [before] = doc.versions.slice(-2);
  const texts = pages => pages.map(p => p.html.replace(/<!doctype html>\s*/i, ''));
  assert.deepEqual(texts(versionPages(doc, before)), ['<p>um</p>', '<p>sobre</p>']);
  publish(doc, true);
  assert.deepEqual(texts(publishedPages(doc)), ['<p>dois</p>', '<p>sobre</p>']);
  restoreVersion(doc, original);
  assert.match(doc.pages[0].html, /um/);
  assert.match(doc.pages[1].html, /sobre/);
});

test('Public pages fill the account custom values, escaped', () => {
  const values = siteValues({ customValues: [{ key: 'custom_values.company_name', value: 'Jardins & Cia' }, { key: 'custom_values.phone', value: '<b>11</b>' }, { key: 'outra', value: 'x' }] });
  assert.deepEqual(Object.keys(values), ['company_name', 'phone']);
  const html = renderPublic({ slug: 'index', html: '<h1>{{ custom_values.company_name }}</h1><p>{{custom_values.phone}}</p><i>{{ custom_values.missing }}</i><a href="page:contato">c</a>' }, { base: '/s/ws/site', values });
  assert.match(html, /<h1>Jardins &amp; Cia<\/h1>/);
  assert.match(html, /<p>&lt;b&gt;11&lt;\/b&gt;<\/p>/);
  assert.match(html, /<i><\/i>/);
  assert.match(html, /href="\/s\/ws\/site\/contato"/);
});

test('Renaming a custom value or field keeps its key, so pages and messages that use it keep working', () => {
  const s = blank();
  const value = { id: execute(s, { type: 'save', key: 'customValues', data: { name: 'Company Name', value: '' } }) };
  assert.equal(s.customValues.find(v => v.id === value.id).key, 'custom_values.company_name');
  execute(s, { type: 'save', key: 'customValues', id: value.id, data: { name: 'Nome da empresa', value: 'Jardins' } });
  assert.deepEqual(s.customValues.filter(v => v.id === value.id).map(v => [v.key, v.value]), [['custom_values.company_name', 'Jardins']]);
  const field = { id: execute(s, { type: 'save', key: 'customFields', data: { name: 'Garden size', object: 'Contact', type: 'Single line' } }) };
  execute(s, { type: 'save', key: 'customFields', id: field.id, data: { name: 'Tamanho do jardim', object: 'Contact', type: 'Single line' } });
  assert.equal(s.customFields.find(f => f.id === field.id).key, 'contact.garden_size');
});

test('Messages read custom values, the account and contact custom fields by key', () => {
  const state = {
    profile: { name: 'Jardins', email: 'oi@jardins.com', phone: '11 9999', address: 'Rua A, 1', website: 'https://jardins.com' },
    customValues: [{ key: 'custom_values.review_link', value: 'https://g.page/r' }],
    customFields: [{ id: 'cf1', key: 'tamanho_do_jardim', name: 'Tamanho do jardim' }]
  };
  const context = buildWorkflowContext(state, {}, { id: 'c1', name: 'Ana Souza', custom: { cf1: '200 m²' } });
  assert.equal(context.custom_values.review_link, 'https://g.page/r');
  assert.equal(context.location.name, 'Jardins');
  assert.equal(context.location.full_address, 'Rua A, 1');
  assert.equal(context.contact.first_name, 'Ana');
});

test('The templates come fully in Portuguese: no English text left in pages, page names, forms, tags or messages', () => {
  const left = [...missing().keys()];
  assert.deepEqual(left, [], `Textos em inglês sem tradução (scripts/ghl-template/traducao-pt.json): ${left.slice(0, 10).join(' | ')}`);
  for (const spec of setupTemplateSpecs.filter(row => row.id.startsWith('template-')))
    for (const field of [spec.title, spec.summary, spec.description]) assert.doesNotMatch(field, /em inglês/);
  const sites = templateSites('template-paisagismo-servicos-externos');
  const pages = Object.values(sites).flatMap(site => site.pages);
  assert.ok(pages.some(page => page.slug === 'fale-conosco' && page.name === 'Fale conosco'));
  assert.ok(pages.every(page => !/home-page-d/.test(page.slug)), 'endereços das páginas em português');
});
