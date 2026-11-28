// Segurança (auditoria P1, 27/11/2026): o Tag Manager que uma subconta configura rodava nas páginas públicas (loja, link
// de pagamento, oferta, agendamento, formulário) servidas na mesma origem do app. O GTM aceita tags de HTML
// personalizado, e essas páginas têm script-src 'unsafe-inline': o script do contêiner agia com a sessão de quem
// estivesse logado no graao e visitasse a página. Agora o GTM só carrega com GO_PUBLIC_GTM=1; GA4 e Pixel da Meta seguem.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { pixelsScript, widenCsp } from '../tracking.mjs';

const hours = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(w => [w, ['09:00', '18:00']]));

async function start(t, platformEnv = {}) {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false, platformEnv });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const act = async body => (await fetch(`${base}/api/action?workspace=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  await act({ type: 'scheduling-settings', data: { enabled: true, leadMinutes: 0, hours } });
  return { act, get: path => fetch(base + path, { redirect: 'manual' }) };
}

test('P1: a Tag Manager container never loads on the public pages by default', async t => {
  const { act, get } = await start(t);
  await act({ type: 'tracking-settings', data: { gtm: 'GTM-ABC123' } });
  const page = await get('/agendar/demo');
  assert.equal(page.status, 200);
  assert.doesNotMatch(await page.text(), /pixels\.js/, 'só com GTM, a página nem carrega o pixels.js');
  assert.doesNotMatch(page.headers.get('content-security-policy') || '', /frame-src[^;]*googletagmanager/);
  assert.doesNotMatch(await (await get('/t/demo/pixels.js')).text(), /GTM-ABC123/);

  // Com GA4 junto, o GA4 continua e o contêiner do GTM continua fora.
  await act({ type: 'tracking-settings', data: { ga4: 'G-ABC1234' } });
  const both = await get('/agendar/demo');
  assert.match(await both.text(), /pixels\.js/);
  const js = await (await get('/t/demo/pixels.js')).text();
  assert.match(js, /G-ABC1234/);
  assert.doesNotMatch(js, /GTM-ABC123/);
  assert.match(js, /"gtm":""/, 'o carregador do contêiner fica sem ID e não roda');
  assert.doesNotMatch(both.headers.get('content-security-policy') || '', /frame-src[^;]*googletagmanager/);
});

test('P1: GO_PUBLIC_GTM=1 brings the Tag Manager back (switch to undo the containment)', async t => {
  const { act, get } = await start(t, { GO_PUBLIC_GTM: '1' });
  await act({ type: 'tracking-settings', data: { gtm: 'GTM-ABC123' } });
  const page = await get('/agendar/demo');
  assert.match(await page.text(), /pixels\.js/);
  assert.match(page.headers.get('content-security-policy') || '', /frame-src[^;]*googletagmanager/);
  assert.match(await (await get('/t/demo/pixels.js')).text(), /GTM-ABC123/);
});

test('P1: the pixel helpers leave the Tag Manager out when asked', () => {
  const t = { ga4: 'G-ABC1234', gtm: 'GTM-ABC123', metaPixel: '' };
  assert.doesNotMatch(pixelsScript(t, { gtm: false }), /GTM-ABC123/);
  assert.match(pixelsScript(t, { gtm: false }), /"gtm":""/);
  assert.match(pixelsScript(t, { gtm: false }), /G-ABC1234/);
  assert.equal(pixelsScript({ gtm: 'GTM-ABC123' }, { gtm: false }), '/* Nenhum pixel configurado. */');
  assert.doesNotMatch(widenCsp("default-src 'none'; frame-src 'none'", { gtm: false }), /frame-src[^;]*googletagmanager/);
});
