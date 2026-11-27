// Busca no OpenStreetMap (Nominatim + Photon) com o fetch global simulado: nenhum acesso à rede.
import test from 'node:test';
import assert from 'node:assert/strict';
import { geocode, osmLookup, osmSearch } from '../prospecting-osm.mjs';

const CENTER = { lat:'-19.9227', lon:'-43.9451', display_name:'Belo Horizonte, Minas Gerais, Brasil' };
const json = (body, status = 200) => ({ ok:status >= 200 && status < 300, status, json:async () => body });

function mockFetch(t, handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { const u = new URL(String(url)); calls.push({ url:u, init }); return handler(u, init); };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

const nominatimPlace = (over = {}) => ({
  osm_type:'node', osm_id:101, category:'amenity', type:'dentist', name:'Alivare Odontologia', lat:'-19.9230', lon:'-43.9450',
  address:{ road:'Rua dos Guajajaras', house_number:'2003', suburb:'Centro', city:'Belo Horizonte', state:'Minas Gerais', postcode:'30180-101' },
  extratags:{ phone:'+55 31 3333-3333; +55 31 4444-4444', website:'https://alivare.com.br' }, ...over
});
const photonFeature = (over = {}, coords = [-43.9452, -19.9228]) => ({
  geometry:{ coordinates:coords },
  properties:{ osm_type:'N', osm_id:202, osm_key:'amenity', osm_value:'dentist', name:'Sorriso Centro', street:'Av. Afonso Pena', housenumber:'100',
    locality:'Funcionários', city:'Belo Horizonte', state:'Minas Gerais', postcode:'30130-000', ...over }
});

test('geocode devolve o centro numérico ou null quando não acha a região', async t => {
  let answer = [CENTER];
  const calls = mockFetch(t, () => json(answer));
  assert.deepEqual(await geocode('Belo Horizonte'), { lat:-19.9227, lon:-43.9451, label:CENTER.display_name });
  const { url, init } = calls[0];
  assert.equal(url.pathname, '/search');
  assert.equal(url.searchParams.get('q'), 'Belo Horizonte');
  assert.match(init.headers['User-Agent'], /graao\.com/);
  assert.equal(init.redirect, 'error');
  answer = [];
  assert.equal(await geocode('Lugar nenhum'), null);
});

test('limite de buscas (429) e falha de rede viram mensagens claras', async t => {
  mockFetch(t, () => json({}, 429));
  await assert.rejects(geocode('BH'), err => err.status === 429 && /muitas buscas/.test(err.message));
  globalThis.fetch = async () => { throw new Error('offline'); };
  await assert.rejects(geocode('BH'), err => err.status === 502 && /não respondeu/.test(err.message));
  globalThis.fetch = async () => json({}, 500);
  await assert.rejects(geocode('BH'), err => err.status === 502);
});

test('osmSearch sem região encontrada não consulta mais nada', async t => {
  const calls = mockFetch(t, () => json([]));
  assert.deepEqual(await osmSearch(['dentista'], 'Lugar nenhum', 5), { center:null, rows:[] });
  assert.equal(calls.length, 1);
});

test('osmSearch junta Nominatim e Photon, tira duplicados, filtra o raio e completa contatos', async t => {
  const far = photonFeature({ osm_id:303, name:'Longe Demais' }, [-43.5, -19.5]);
  const shop = photonFeature({ osm_id:404, osm_key:'highway', name:'Rua sem negócio' });
  const dupFromPhoton = photonFeature({ osm_type:'N', osm_id:101, name:'Alivare Odontologia', street:'' }, [-43.9450, -19.9230]);
  const calls = mockFetch(t, url => {
    if (url.pathname === '/search' && url.searchParams.get('limit') === '1') return json([CENTER]);
    if (url.pathname === '/search') return json([nominatimPlace(), nominatimPlace({ category:'highway', osm_id:9 })]);
    if (url.pathname === '/api/') return json({ features:[photonFeature(), far, shop, dupFromPhoton] });
    if (url.pathname === '/lookup') return json([nominatimPlace({ osm_id:202, name:'Sorriso Centro', extratags:{ 'contact:phone':'+55 31 5555-5555', 'contact:email':'oi@sorriso.com' } })]);
    throw new Error('rota inesperada ' + url);
  });

  const { center, rows } = await osmSearch(['dentista'], 'Belo Horizonte', 5);
  assert.equal(center.label, CENTER.display_name);
  assert.deepEqual(rows.map(r => r.placeId).sort(), ['osm-N101', 'osm-N202']);

  const alivare = rows.find(r => r.placeId === 'osm-N101');
  assert.equal(alivare.phone, '+55 31 3333-3333', 'só o primeiro telefone da lista');
  assert.equal(alivare.address, 'Rua dos Guajajaras, 2003 - Centro', 'o endereço do Nominatim não é apagado pelo vazio do Photon');
  assert.equal(alivare.category, 'Dentista');

  const sorriso = rows.find(r => r.placeId === 'osm-N202');
  assert.equal(sorriso.phone, '+55 31 5555-5555', 'telefone vindo do lookup');
  assert.equal(sorriso.email, 'oi@sorriso.com');
  assert.equal(sorriso.address, 'Av. Afonso Pena, 100 - Funcionários');

  const lookup = calls.find(c => c.url.pathname === '/lookup');
  assert.equal(lookup.url.searchParams.get('osm_ids'), 'N202', 'só busca detalhes de quem ficou sem telefone e site');
  const photon = calls.filter(c => c.url.pathname === '/api/').map(c => c.url.searchParams.get('q'));
  assert.deepEqual(photon, ['dentista', 'odonto', 'odontologia']);
  assert.equal(rows[0].placeId, 'osm-N202', 'mais perto primeiro (15 m contra 35 m do centro)');
});

test('osmSearch: se todas as fontes falham é erro; se só o lookup falha, devolve o que achou', async t => {
  mockFetch(t, url => url.searchParams.get('limit') === '1' ? json([CENTER]) : json({}, 500));
  await assert.rejects(osmSearch(['pizza'], 'BH', 3), err => err.status === 502);

  globalThis.fetch = async url => {
    const u = new URL(String(url));
    if (u.searchParams.get('limit') === '1') return json([CENTER]);
    if (u.pathname === '/api/') return json({ features:[photonFeature({ osm_value:'pizza_place_x', name:'Pizza Boa' })] });
    if (u.pathname === '/search') return json({}, 500);
    return json({}, 500);
  };
  const { rows } = await osmSearch(['pizza'], 'BH', 3);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, 'pizza place x', 'tipo desconhecido vira texto legível');
  assert.equal(rows[0].phone, '');
});

test('osmLookup ignora ids inválidos e não chama a rede sem nenhum válido', async t => {
  const calls = mockFetch(t, () => json([nominatimPlace(), nominatimPlace({ osm_id:7, name:'' })]));
  assert.deepEqual(await osmLookup(['google-abc', 'osm-X1', 'osm-N']), []);
  assert.equal(calls.length, 0);
  const rows = await osmLookup(['osm-N101', 'osm-W7', 'lixo']);
  assert.equal(calls[0].url.searchParams.get('osm_ids'), 'N101,W7');
  assert.deepEqual(rows.map(r => r.placeId), ['osm-N101'], 'sem nome fica de fora');
});
