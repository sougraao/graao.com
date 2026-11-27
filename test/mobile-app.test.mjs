import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from 'node:crypto';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { encryptPayload, pushSubscription, vapidHeader, vapidKeys } from '../web-push.mjs';
import { blankAgency, hydrateAgency } from '../agency-model.mjs';
import { mobileConfig, mobileOf, storePackage } from '../agency-mobile.mjs';
import { defaultTheme } from '../ui/community-data.js';
import { actionSpec } from '../ui/workflow-data.js';

// App mobile white-label (6.6) and push notifications: the installable app, its app mode, the store package and
// Web Push (RFC 8291 encryption, RFC 8292 VAPID), checked by decrypting and verifying as a browser would.
const b64u = buffer => Buffer.from(buffer).toString('base64url');
const PNG = `data:image/png;base64,${Buffer.from('\x89PNG\r\n\x1a\nicone').toString('base64')}`;

function device() {
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  const auth = randomBytes(16);
  return { ecdh, auth, subscription: { endpoint: 'https://push.example.test/send/abc123', keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) } } };
}
/** The browser side of RFC 8291. */
function decrypt(body, { ecdh, auth }) {
  const salt = body.subarray(0, 16), idlen = body[20], server = body.subarray(21, 21 + idlen), data = body.subarray(21 + idlen);
  const shared = ecdh.computeSecret(server);
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), server]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
  decipher.setAuthTag(data.subarray(-16));
  const plain = Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]);
  assert.equal(plain.at(-1), 2, 'last record delimiter');
  return plain.subarray(0, -1).toString('utf8');
}

test('Web Push: the payload decrypts on the device and the VAPID token verifies with the public key', () => {
  const phone = device(), keys = vapidKeys();
  const sub = pushSubscription(phone.subscription);
  assert.ok(sub);
  assert.equal(pushSubscription({ endpoint: 'http://inseguro.test/x', keys: phone.subscription.keys }), null);
  const message = JSON.stringify({ title: 'Nova mensagem', body: 'Ana: oi!' });
  assert.equal(decrypt(encryptPayload(message, sub), phone), message);

  const header = vapidHeader(sub.endpoint, { ...keys, subject: 'mailto:teste@graao.test', now: Date.UTC(2026, 10, 22) });
  const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, keys.publicKey);
  const [head, claims, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(claims, 'base64url')), { aud: 'https://push.example.test', exp: Date.UTC(2026, 10, 22) / 1000 + 12 * 3600, sub: 'mailto:teste@graao.test' });
  const pub = Buffer.from(keys.publicKey, 'base64url');
  const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' });
  assert.equal(verify('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true);
});

test('Push in the sub-account: subscriptions, new-message alerts for the team and the "Notificação push" action', () => {
  assert.deepEqual(actionSpec('push_notification').fields.map(field => field.key), ['target', 'title', 'body', 'url']);
  const s = blank(), phone = device();
  const sub = pushSubscription(phone.subscription);
  execute(s, { type: 'push-subscribe', data: { ...sub, kind: 'team', userId: 'u1' } });
  execute(s, { type: 'push-subscribe', data: { ...sub, kind: 'team', userId: 'u1' } });
  assert.equal(s.pushSubscriptions.length, 1, 'one row per device');
  const contactId = execute(s, { type: 'save', key: 'contacts', data: { name: 'Ana Souza', tags: [], custom: {} } });
  execute(s, { type: 'message', data: { contactId, channel: 'WhatsApp', direction: 'Inbound', body: 'Oi, tudo bem?' } });
  const alert = s.workflowOutbox.find(item => item.kind === 'push' && item.messagesOnly);
  assert.deepEqual([alert.target, alert.body, alert.url], ['team', 'Oi, tudo bem?', '/app#conversations']);

  const flow = execute(s, { type: 'save', key: 'workflows', data: { name: 'Avisar', active: true, triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'vip' } }],
    steps: [{ type: 'push_notification', config: { target: 'contact', title: 'Olá, {{contact.first_name}}', body: 'Sua proposta está pronta.', url: 'javascript:alert(1)' } }] } });
  execute(s, { type: 'save', key: 'contacts', id: contactId, data: { ...s.contacts.find(row => row.id === contactId), tags: ['vip'] } });
  const queued = s.workflowOutbox.find(item => item.kind === 'push' && item.runId);
  assert.deepEqual([queued.target, queued.contactId, queued.title.startsWith('Olá, '), queued.url], ['contact', contactId, true, ''], 'unsafe links are dropped');
  assert.ok(s.runs.find(run => run.workflowId === flow).results.join(' ').includes('notificação para o contato na fila'));
  execute(s, { type: 'push-gone', data: { endpoints: [sub.endpoint] } });
  assert.equal(s.pushSubscriptions.length, 0);
});

test('Store package: what is missing, the Bubblewrap manifest and the Digital Asset Links', () => {
  const agency = { mobileApp: { appName: 'Agência Sol', primary: '#ff6600', accent: '#222222', loginTitle: 'Bem-vindo', hidden: [], order: ['conversations'], custom: [] } };
  const draft = storePackage(mobileOf(agency), 'agency', 'https://app.graao.test');
  assert.equal(draft.ready, false);
  assert.ok(draft.missing.includes('publicar o app'));
  Object.assign(agency.mobileApp, { icon: PNG, status: 'published', version: 3, store: { developer: 'Sol Ltda', supportEmail: 'oi@sol.test', supportUrl: '', privacyUrl: 'https://sol.test/privacidade',
    androidPackage: 'br.com.sol.app', iosBundle: 'br.com.sol.app', fingerprints: ['AA:'.repeat(31) + 'AA'], domain: 'app.sol.test' } });
  const pack = storePackage(mobileOf(agency), 'agency', 'https://app.graao.test');
  assert.deepEqual([pack.ready, pack.host, pack.twaManifest.packageId, pack.twaManifest.appVersionCode, pack.twaManifest.startUrl], [true, 'app.sol.test', 'br.com.sol.app', 3, '/mobile/agency/?source=app']);
  assert.deepEqual(pack.assetlinks[0].target.sha256_cert_fingerprints, ['AA:'.repeat(31) + 'AA']);
});

test('An app saved before themes, Início and cover keeps its color, order, hidden modules and links', () => {
  const old = { appName: 'Agência Sol', primary: '#ff6600', accent: '#222222', loginTitle: 'Welcome back', hidden: ['reputation'], order: ['dashboard', 'contacts', 'conversations'], custom: [{ label: 'Ajuda', url: 'https://ajuda.sol.test/' }], status: 'published', version: 4 };
  const state = hydrateAgency({ ...blankAgency(), mobileApp: structuredClone(old) });
  const config = mobileConfig(mobileOf(state), 'agency');
  assert.deepEqual([config.primary, config.theme.tokens.primary, config.home, config.version], ['#ff6600', '#ff6600', true, 4]);
  assert.deepEqual([state.mobileApp.hidden, state.mobileApp.custom, state.mobileApp.loginTitle], [old.hidden, old.custom, 'Welcome back'], 'a published app keeps its own words');
  assert.deepEqual(config.modules.slice(0, 3).map(row => row.key ?? row.route), ['dashboard', 'contacts', 'conversations']);
  const draft = mobileOf(hydrateAgency({ ...blankAgency(), mobileApp: { ...structuredClone(old), appName: 'My Agency', status: 'draft' } }));
  assert.deepEqual([draft.appName, draft.loginTitle], ['Minha Agência', 'Bem-vindo de volta']);
  assert.equal(mobileOf(hydrateAgency(blankAgency())).theme.preset, defaultTheme().preset, 'a new agency starts with the default theme');
});

test('Server: the agency publishes the app; install page, manifest, worker and app-mode config; push to the team', async t => {
  const pushed = [];
  const keys = vapidKeys();
  const pushRequest = async (endpoint, options) => { pushed.push({ endpoint, headers: options.headers, body: options.body }); return { ok: !endpoint.endsWith('/gone'), status: endpoint.endsWith('/gone') ? 410 : 201 }; };
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: true, socialScheduler: false, pushRequest, pushEnv: { WEB_PUSH_PUBLIC_KEY: keys.publicKey, WEB_PUSH_PRIVATE_KEY: keys.privateKey } });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null), type: r.headers.get('content-type') };
  };
  const agencyAct = body => call('/api/agency/action', body);

  assert.equal((await fetch(`${base}/mobile/agency/`)).status, 404, 'not before publishing');
  await agencyAct({ type: 'mobile-app', data: { appName: 'Agência Sol', loginTitle: 'Bem-vindo', primary: '#ff6600', accent: '#222222', order: ['conversations', 'contacts', 'calendars', 'payments', 'dashboard', 'opportunities', 'reputation'], hidden: ['reputation'], custom: [{ label: 'Ajuda', url: 'https://ajuda.sol.test' }] } });
  assert.match((await agencyAct({ type: 'mobile-app-publish' })).body.error, /ícone/);
  assert.match((await agencyAct({ type: 'mobile-app-store', data: { androidPackage: 'pacote inválido' } })).body.error, /br\.com\.agencia\.app/);
  assert.equal((await agencyAct({ type: 'mobile-app-store', data: { icon: PNG, icon192: PNG, icon512: PNG, developer: 'Sol', androidPackage: 'br.com.sol.app', fingerprints: `${'BB:'.repeat(31)}BB`, domain: 'https://app.sol.test/' } })).status, 200);
  assert.equal((await agencyAct({ type: 'mobile-app-publish' })).status, 200);

  const page = await fetch(`${base}/mobile/agency/`);
  const html = await page.text();
  assert.match(html, /href="\/app\?shell=mobile&amp;agency=agency#home"/);
  assert.match(html, /rel="manifest" href="\/mobile\/agency\/manifest\.webmanifest"/);
  assert.match(html, /serviceWorker\.register\('\/mobile\/agency\/sw\.js'/);
  assert.match(html, /<h1>Agência Sol<\/h1><p>Bem-vindo<\/p>/);
  assert.match(page.headers.get('content-security-policy'), /style-src 'self' 'unsafe-inline'/);
  for (const file of ['/mobile-app.css', '/mobile-app-view.js', '/mobile-home-data.js']) assert.equal((await fetch(base + file)).status, 200, file);
  const manifest = await call('/mobile/agency/manifest.webmanifest');
  assert.deepEqual([manifest.body.name, manifest.body.theme_color, manifest.body.display, manifest.body.icons.length], ['Agência Sol', '#ff6600', 'standalone', 3]);
  const config = (await call('/mobile/agency/config.json')).body;
  assert.deepEqual(config.modules.map(m => m.route), ['conversations', 'contacts', 'calendars', 'payments', 'dashboard', 'opportunities']);
  assert.deepEqual(config.custom, [{ label: 'Ajuda', url: 'https://ajuda.sol.test/' }]);
  assert.deepEqual([config.primary, config.theme.tokens.primary, config.home], ['#ff6600', '#ff6600', true], 'only a color: the theme comes from it');

  // Theme, Início and cover; what a save leaves out stays as it was.
  const look = data => agencyAct({ type: 'mobile-app', data: { appName: 'Agência Sol', ...data } });
  assert.equal((await look({ theme: { preset: 'floresta', tokens: {} }, home: false, cover: PNG })).status, 200);
  assert.equal((await call('/mobile/agency/manifest.webmanifest')).body.theme_color, '#1f7a4d');
  const cover = await fetch(base + '/mobile/agency/cover');
  assert.deepEqual([cover.status, cover.headers.get('content-type')], [200, 'image/png']);
  assert.match(await (await fetch(base + '/mobile/agency/')).text(), /\/mobile\/agency\/cover\?v=[\s\S]*href="\/app\?shell=mobile&amp;agency=agency"/, 'without Início the app opens on its first module');
  assert.equal((await look({})).status, 200);
  const kept = (await call('/mobile/agency/config.json')).body;
  assert.deepEqual([kept.theme.preset, kept.home, kept.modules.length, kept.custom.length, kept.modules[0].route], ['floresta', false, 6, 1, 'conversations']);
  assert.equal((await fetch(base + '/mobile/agency/cover')).status, 200);
  assert.equal((await look({ cover: 'remove', home: true })).status, 200);
  assert.equal((await fetch(base + '/mobile/agency/cover')).status, 404);
  assert.match((await look({ theme: { preset: 'custom', tokens: { primary: 'vermelho' } } })).body.error, /#RRGGBB/);
  assert.match((await look({ primary: 'vermelho' })).body.error, /cor/);
  assert.match((await look({ cover: 'data:text/html;base64,AAAA' })).body.error, /imagem/);
  assert.match((await look({ cover: 'data:image/png;base64,' + 'A'.repeat(700001) })).body.error, /grande/);
  assert.match((await look({ appName: '' })).body.error, /nome/i);
  assert.match((await look({ custom: [{ label: 'x', url: 'javascript:alert(1)' }] })).body.error, /http/);
  const worker = await fetch(`${base}/mobile/agency/sw.js`);
  assert.equal(worker.headers.get('service-worker-allowed'), '/mobile/agency/');
  assert.match(await worker.text(), /showNotification/);
  assert.equal((await fetch(`${base}/mobile/agency/icon-192.png`)).headers.get('content-type'), 'image/png');
  const pack = (await call('/api/mobile-app/package')).body;
  assert.deepEqual([pack.host, pack.twaManifest.packageId], ['app.sol.test', 'br.com.sol.app']);
  const links = await fetch(`${base}/.well-known/assetlinks.json`, { headers: { 'X-Forwarded-Host': 'app.sol.test' } });
  assert.equal((await links.json())[0].target.package_name, 'br.com.sol.app');

  // The member turns notifications on in app mode; a workflow notifies the team; a dead device is removed.
  assert.equal((await call('/api/push/key')).body.key, keys.publicKey);
  const phone = device(), gone = device();
  gone.subscription.endpoint = 'https://push.example.test/send/gone';
  assert.equal((await call('/api/push/subscribe?workspace=demo', { subscription: phone.subscription, app: 'agency' })).status, 200);
  assert.equal((await call('/api/push/subscribe?workspace=demo', { subscription: gone.subscription })).status, 200);
  assert.equal((await call('/api/push/subscribe?workspace=demo', { subscription: { endpoint: 'x' } })).status, 400);
  await call('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Lead novo', active: true, triggers: [{ type: 'contact_created' }], steps: [{ type: 'push_notification', config: { target: 'team', title: 'Novo lead', body: '{{contact.name}} entrou.' } }] } });
  await call('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Bia Lima', tags: [], custom: {} } });
  for (let i = 0; i < 100 && pushed.length < 2; i++) await new Promise(resolve => setTimeout(resolve, 20));
  const delivered = pushed.find(row => row.endpoint === phone.subscription.endpoint);
  assert.ok(delivered, 'the team device got the notification');
  assert.equal(delivered.headers['Content-Encoding'], 'aes128gcm');
  assert.match(delivered.headers.Authorization, new RegExp(`^vapid t=.+, k=${keys.publicKey}$`));
  assert.deepEqual(JSON.parse(decrypt(delivered.body, phone)), { title: 'Novo lead', body: 'Bia Lima entrou.', url: '/app#conversations', tag: delivered && JSON.parse(decrypt(delivered.body, phone)).tag });
  let state;
  for (let i = 0; i < 100; i++) { state = (await call('/api/state?workspace=demo')).body.state; if (state.pushSubscriptions.length === 1) break; await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.deepEqual(state.pushSubscriptions.map(row => row.endpoint), [phone.subscription.endpoint], 'the 410 device was removed');
});
