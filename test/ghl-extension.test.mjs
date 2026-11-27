// Extensão do Chrome "graao: Importar do GHL": o leitor (reader.js) roda na aba do GHL com o cliente HTTP do próprio app
// e só faz GET. Aqui ele roda num contexto do node:vm, com um GHL falso.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const dir = new URL('../extensions/ghl-import/', import.meta.url);
const L = 'LocFake0000000000001';

/** O app do GHL falso: responde por padrão de URL; `fail` lista trechos de URL que respondem 404. */
function fakeGhl(fail = []) {
  const calls = [], other = [];
  const routes = [
    [/\/locations\/[^/]+$/, { location: { id: L, name: 'Jardim', companyId: 'CompanyFake' } }],
    [/customFields\/search.*documentType=field/, { customFields: [{ id: 'cf1', name: 'Campo' }] }],
    [/\/tags$/, { tags: [{ id: 't1', name: 'cliente' }] }],
    [/opportunities\/pipelines/, { pipelines: [{ id: 'p1', name: 'Vendas', stages: [] }] }],
    [/services\.leadconnectorhq\.com\/forms\//, { forms: [{ _id: 'f1', name: 'Contato' }] }],
    [/backend\.leadconnectorhq\.com\/forms\/f1$/, { form: { _id: 'f1', name: 'Contato', formData: { form: { fields: [] } } } }],
    [/services\.leadconnectorhq\.com\/surveys\//, { surveys: [{ _id: 's1', name: 'Pesquisa' }] }],
    [/backend\.leadconnectorhq\.com\/surveys\/s1$/, { survey: { _id: 's1', name: 'Pesquisa', formData: { form: { fields: [] } } } }],
    [/\/workflow\/[^/]+\/list/, { rows: [{ id: 'w1', type: 'workflow', name: 'Boas-vindas' }] }],
    [/\/workflow\/[^/]+\/trigger\?workflowId=w1/, [{ id: 'tr1', type: 'form_submission' }]],
    [/\/workflow\/[^/]+\/w1$/, { _id: 'w1', name: 'Boas-vindas', workflowData: { templates: [{ id: 'a1', type: 'sms' }] } }],
    [/funnel\/list.*type=funnel/, { funnels: [{ _id: 'fu1', name: 'Funil' }] }],
    [/funnel\/list.*type=website/, { funnels: [] }],
    [/funnels\/page\/list/, [{ _id: 'pg1', name: 'Início', pageDataDownloadUrl: 'https://storage.example/pg1.json' }]],
  ];
  const get = async url => {
    calls.push(url);
    if (fail.some(part => url.includes(part))) throw Object.assign(new Error('404'), { response: { status: 404 } });
    const hit = routes.find(([pattern]) => pattern.test(url));
    return { data: hit ? structuredClone(hit[1]) : {} };
  };
  // Qualquer método além de get (post, put, delete…) fica registrado: a extensão nunca escreve no GHL.
  const http = new Proxy({ get }, { get: (target, prop) => prop === 'get' ? get : (...args) => { other.push([prop, args]); return Promise.resolve({ data: {} }); } });
  return { http, calls, other };
}

function loadReader() {
  const fetched = [];
  const context = vm.createContext({
    console, URL, JSON, Promise, setTimeout,
    fetch: async url => { fetched.push(String(url)); return { ok: true, status: 200, text: async () => '{"sections":[]}' }; }
  });
  vm.runInContext(readFileSync(new URL('reader.js', dir), 'utf8'), context, { filename: 'reader.js' });
  return { reader: context.graaoGhlReader, fetched };
}

test('reads a location with every item the converter needs', async () => {
  const { reader } = loadReader();
  const ghl = fakeGhl();
  const progress = [];
  // O Chrome devolve o resultado do script clonado; aqui a ida e volta em JSON faz o mesmo (e tira os objetos do contexto do vm).
  const dump = JSON.parse(JSON.stringify(await reader.readLocation(ghl.http, L, step => progress.push(step))));
  assert.equal(dump.locationId, L);
  assert.equal(dump.customFields.customFields.length, 1);
  assert.equal(dump.tags.tags.length, 1);
  assert.equal(dump.pipelines.pipelines.length, 1);
  assert.deepEqual(dump.forms[0].formData, { form: { fields: [] } });
  assert.equal(dump.surveys[0]._id, 's1');
  assert.equal(dump.workflows[0].workflowData.templates.length, 1);
  assert.deepEqual(dump.triggers.w1, [{ id: 'tr1', type: 'form_submission' }]);
  assert.equal(dump.funnels[0].pages[0].pageData, '{"sections":[]}');
  assert.deepEqual(dump.errors, []);
  assert.deepEqual(ghl.other, [], 'only GET requests');
  // The agency id comes from the location, never a fixed one.
  const studio = ghl.calls.filter(url => url.includes('agent-studio'));
  assert.ok(studio.length && studio.every(url => url.includes('agencyId=CompanyFake')));
  assert.ok(progress.length > 3 && progress.every(p => typeof p.step === 'string' && p.done <= p.total));
});

test('keeps reading when one endpoint fails', async () => {
  const { reader } = loadReader();
  const dump = await reader.readLocation(fakeGhl(['/surveys/']).http, L, () => {});
  assert.equal(dump.errors.length, 1);
  assert.equal(dump.errors[0], 'as pesquisas (erro 404)');
  assert.equal(dump.tags.tags.length, 1);
  assert.equal(dump.workflows.length, 1);
});

test('splits a read into parts of up to the size limit', async () => {
  const { reader } = loadReader();
  const dump = JSON.parse(JSON.stringify(await reader.readLocation(fakeGhl().http, L, () => {})));
  const parts = JSON.parse(JSON.stringify(reader.parts(dump, 100)));
  assert.deepEqual([...new Set(parts.map(p => p.name))], ['dump', 'triggers', 'surveys']);
  for (const name of ['dump', 'triggers', 'surveys']) {
    const mine = parts.filter(p => p.name === name);
    assert.ok(mine.every((p, i) => p.index === i && p.total === mine.length && p.data.length <= 100));
    const value = JSON.parse(mine.map(p => p.data).join(''));
    if (name === 'triggers') assert.deepEqual(value, dump.triggers);
    if (name === 'surveys') assert.deepEqual(value, dump.surveys);
    if (name === 'dump') assert.ok(!('triggers' in value) && !('surveys' in value) && value.locationId === L);
  }
});

test('never cuts an emoji in half between two pieces', () => {
  const { reader } = loadReader();
  // '["' tem 2 caracteres: com pedaços de 3, o corte cai no meio do primeiro emoji.
  const surveys = ['😀😀😀😀😀'];
  const parts = JSON.parse(JSON.stringify(reader.parts({ surveys }, 3))).filter(p => p.name === 'surveys');
  const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  assert.ok(parts.every(p => !lone.test(p.data)), 'um pedaço terminou ou começou com meio emoji');
  assert.ok(parts.every((p, i) => p.index === i && p.total === parts.length));
  assert.deepEqual(JSON.parse(parts.map(p => p.data).join('')), surveys);
});

test('the manifest asks only for activeTab, scripting and storage', () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, 'graao: Importar do GHL');
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
  assert.deepEqual(manifest.host_permissions, ['https://www.graao.com/*', 'https://graao.com/*', 'http://localhost/*', 'http://127.0.0.1/*']);
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.equal(manifest.content_scripts, undefined);
});

test('the extension wears the graao identity: orange cat icons, brand font and palette', () => {
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', dir), 'utf8'));
  for (const size of ['16', '32', '48', '128']) {
    assert.equal(manifest.icons[size], `icon-${size}.png`);
    assert.equal(manifest.action.default_icon[size], `icon-${size}.png`);
    const png = readFileSync(new URL(`icon-${size}.png`, dir));
    assert.equal(png.readUInt32BE(16), Number(size), `icon-${size}.png has ${size}px`);
  }
  const popup = readFileSync(new URL('popup.html', dir), 'utf8');
  assert.match(popup, /--brand-fill: #ff6b1a/i, 'orange on the main action');
  assert.match(popup, /--canvas: #111111/i, 'neutral dark gray as the default');
  assert.match(popup, /src: url\("plus-jakarta-sans\.woff2"\)/, 'the app font, shipped inside the extension');
  assert.match(popup, /src="logo-gato\.svg"/);
  assert.doesNotMatch(popup, /#ff4f9a/i, 'no more pink');
  assert.match(readFileSync(new URL('logo-gato.svg', dir), 'utf8'), /#ff6b1a/);
});
