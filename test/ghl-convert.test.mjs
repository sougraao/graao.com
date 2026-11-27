// Conversor do GHL como módulo do servidor (ghl-convert/): o mesmo usado pelos templates e pela importação do GHL.
// A fixture é um recorte sintético de uma extração (textos, ids e endereços trocados).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convert, pagesOf } from '../ghl-convert/convert.mjs';
import { imageUrls, replaceUrls } from '../ghl-convert/page-html.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/ghl-location.json', import.meta.url), 'utf8'));
const pageHtml = '<html><head><title>Página</title></head><body><h1>Oi</h1><img src="https://assets.cdn.filesafe.space/x/a.png"></body></html>';

test('converts a synthetic GHL location into a complete setup', () => {
  const { assets, sites, notes } = convert({ ...fixture, page: () => pageHtml }, { prefix: 'gi' });
  assert.equal(assets.customFields.length, 2);
  assert.ok(assets.tags.length >= 3);
  assert.equal(assets.workflows.length, 2);
  assert.ok(assets.workflows.every(w => w.graph || w.steps || w.nodes), 'workflows keep their steps');
  assert.equal(Object.keys(sites).length, 1);
  const pages = Object.values(sites)[0];
  assert.equal(pages.length, 2);
  assert.ok(pages.every(page => page.html.includes('<h1>')));
  assert.ok(Array.isArray(notes));
});

test('lists the pages the converter will read', () => {
  assert.deepEqual(pagesOf(fixture.dump).map(p => p.pageId), fixture.dump.funnels[0].pages.map(p => p._id || p.id));
});

test('finds and replaces image urls', () => {
  assert.deepEqual(imageUrls('<img src="https://a/x.png"><div style="background:url(https://a/y.jpg)"></div>'), ['https://a/x.png', 'https://a/y.jpg']);
  const swapped = replaceUrls({ html: '<img src="https://a/x.png">', nested: ['https://a/x.png'] }, new Map([['https://a/x.png', 'https://graao.com/asset/h.png']]));
  assert.match(swapped.html, /graao\.com\/asset\/h\.png/);
  assert.equal(swapped.nested[0], 'https://graao.com/asset/h.png');
});
