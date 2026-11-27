import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { contactFromFields, injectPixels, originAllowed, pixelsScript, trackerScript, trackingOf, widenCsp } from '../tracking.mjs';
import { scoreBand } from '../ui/scoring-data.js';

const settings = (s, data) => execute(s, { type: 'tracking-settings', data });
const event = (s, data) => execute(s, { type: 'tracking-event', data: { vid: 'visitor0001', url: 'https://www.loja.com.br/', ...data } });
const rule = (s, data) => execute(s, { type: 'save', key: 'scoringRules', data });

test('Tracking settings validate the pixel ids and normalize the allowed domains', () => {
  const s = blank('Loja');
  assert.throws(() => settings(s, { ga4: 'UA-12345-1' }), /GA4/);
  assert.throws(() => settings(s, { gtm: 'GTM_1' }), /Tag Manager/);
  assert.throws(() => settings(s, { metaPixel: 'abc' }), /Pixel da Meta/);
  assert.throws(() => settings(s, { domains: 'nao é domínio' }), /Domínio inválido/);
  settings(s, { ga4: 'g-abc1234', gtm: 'gtm-xyz123', metaPixel: '123456789012', domains: 'https://www.Loja.com.br/contato\n*.loja.com.br, loja.com.br', pageviews: false });
  const t = trackingOf(s);
  assert.equal(t.ga4, 'G-ABC1234');
  assert.equal(t.gtm, 'GTM-XYZ123');
  assert.deepEqual(t.domains, ['loja.com.br', '*.loja.com.br'], 'scheme, www and path are dropped; duplicates removed');
  assert.equal(t.pageviews, false);
  assert.equal(t.forms, true, 'untouched options keep their value');
  assert.equal(originAllowed(t, 'https://www.loja.com.br'), true);
  assert.equal(originAllowed(t, 'https://blog.loja.com.br'), true);
  assert.equal(originAllowed(t, 'https://outraloja.com.br'), false);
  assert.equal(originAllowed({ domains: [] }, 'https://qualquer.com'), true, 'no list accepts any site');
});

test('Pixels: the loader goes in the head and the CSP allows only the vendors', () => {
  assert.equal(injectPixels('<html><head><title>x</title></head></html>', 'demo'), '<html><head><title>x</title><script src="/t/demo/pixels.js" async></script></head></html>');
  const csp = widenCsp("default-src 'self'; script-src 'self'; frame-src 'none'");
  assert.match(csp, /script-src 'self' https:\/\/www\.googletagmanager\.com https:\/\/connect\.facebook\.net/);
  assert.doesNotMatch(csp, /'none'/);
  assert.doesNotMatch(csp, /unsafe-inline/);
  const js = pixelsScript({ ga4: 'G-ABC1234', gtm: '', metaPixel: '123456789012' });
  assert.match(js, /G-ABC1234/);
  assert.match(js, /123456789012/);
  const tracker = trackerScript('demo', 'https://app.graao.com', { pageviews: true, forms: false });
  assert.match(tracker, /"endpoint":"https:\/\/app\.graao\.com\/t\/demo\/e"/);
  assert.match(tracker, /"forms":false/);
  assert.match(tracker, /pass\|senha\|card/, 'sensitive field names are never sent');
});

test('External form fields become contact details', () => {
  assert.deepEqual(contactFromFields({ nome: 'Ana', sobrenome: 'Souza', 'e-mail': 'ANA@Exemplo.com', whatsapp: '(11) 98888-7777', empresa: 'Café', mensagem: 'Oi' }),
    { name: 'Ana Souza', email: 'ana@exemplo.com', phone: '(11) 98888-7777', company: 'Café' });
  assert.equal(contactFromFields({ campo1: 'joao@x.com.br' }).email, 'joao@x.com.br', 'an e-mail value is found even with an unknown field name');
  assert.equal(contactFromFields({ telefone: '123' }).phone, '', 'too short to be a phone');
});

test('Site events: anonymous visits, a form that creates the contact, and later visits linked to it', () => {
  const s = blank('Loja');
  const contacts = s.contacts.length;
  assert.throws(() => event(s, { vid: 'x' }), /Visitante inválido/);
  event(s, { type: 'pageview', url: 'https://www.loja.com.br/precos?utm_source=google', title: 'Preços' });
  assert.equal(s.trackingEvents.at(-1).contactId, '', 'unknown visitor stays anonymous');
  assert.equal(s.trackingEvents.at(-1).url, 'https://www.loja.com.br/precos?utm_source=google');
  event(s, { type: 'form', form: 'contato', fields: { nome: 'Bia', email: 'bia@exemplo.com', mensagem: 'Quero um orçamento' } });
  assert.equal(s.contacts.length, contacts + 1);
  const bia = s.contacts.find(c => c.email === 'bia@exemplo.com');
  assert.deepEqual(bia.tags, ['Site externo']);
  assert.match(s.messages.find(m => m.contactId === bia.id && m.origin === 'tracking').body, /mensagem: Quero um orçamento/);
  event(s, { type: 'pageview', url: 'https://www.loja.com.br/obrigado' });
  assert.equal(s.trackingEvents.at(-1).contactId, bia.id, 'the visitor is now known');
  event(s, { vid: 'visitor0002', type: 'form', fields: { email: 'BIA@exemplo.com', telefone: '11 97777-6666' } });
  assert.equal(s.contacts.length, contacts + 1, 'the same e-mail does not create a second contact');
  assert.equal(bia.phone, '11 97777-6666', 'missing details are filled in');
  settings(s, { pageviews: false });
  assert.equal(event(s, { type: 'pageview' }), null, 'page views can be turned off');
  assert.equal(event(s, { url: 'javascript:alert(1)', type: 'form', fields: {} }) !== null, true);
  assert.equal(s.trackingEvents.at(-1).url, '', 'only http(s) addresses are kept');
});

test('A form with only a phone finds the contact by its digits, or creates one', () => {
  const s = blank('Loja');
  event(s, { type: 'form', fields: { nome: 'Dani', telefone: '(11) 96666-5555' } });
  const dani = s.contacts.find(c => c.phone === '(11) 96666-5555');
  assert.equal(dani.name, 'Dani');
  const contacts = s.contacts.length;
  event(s, { vid: 'visitor0003', type: 'form', fields: { telefone: '11 96666 5555', email: 'dani@exemplo.com' } });
  assert.equal(s.contacts.length, contacts, 'same digits, same contact');
  assert.equal(dani.email, 'dani@exemplo.com');
});

test('Lead scoring: rules add points, "once" counts a single time and workflows see the threshold', () => {
  const s = blank('Loja');
  assert.throws(() => rule(s, { name: 'x', trigger: { type: 'invented' }, points: 5 }), /ação do contato/);
  assert.throws(() => rule(s, { name: 'x', trigger: { type: 'contact_created' }, points: 0 }), /pontos/);
  assert.throws(() => rule(s, { name: 'x', trigger: { type: 'contact_created' }, points: 5000 }), /pontos/);
  rule(s, { name: 'Novo contato', trigger: { type: 'contact_created', config: {} }, points: 5 });
  rule(s, { name: 'Página de preços', trigger: { type: 'external_tracking_event', config: { event: 'pageview', url: '/precos' } }, points: 50, once: true });
  rule(s, { name: 'Qualquer visita', trigger: { type: 'external_tracking_event', config: { event: 'pageview' } }, points: 1 });
  rule(s, { name: 'Pausada', trigger: { type: 'external_tracking_event', config: {} }, points: 100, active: false });
  const hot = execute(s, { type: 'save', key: 'workflows', data: { name: 'Lead quente', active: true, triggers: [{ type: 'score_changed', config: { min: '50' } }], steps: [{ type: 'internal_notification', config: { body: 'Lead quente' } }] } });

  event(s, { type: 'form', fields: { email: 'caio@exemplo.com' } });
  const caio = s.contacts.find(c => c.email === 'caio@exemplo.com');
  assert.equal(caio.score, 5, 'contact created: +5 (the form event matches no pageview rule)');
  event(s, { type: 'pageview', url: 'https://www.loja.com.br/precos' });
  assert.equal(caio.score, 56, '+50 once and +1 for the visit');
  event(s, { type: 'pageview', url: 'https://www.loja.com.br/precos' });
  assert.equal(caio.score, 57, 'the once rule does not count again');
  assert.equal(caio.scoreHistory[0].points, 1);
  assert.match(caio.scoreHistory[1].reason, /Página de preços/);
  assert.equal(s.runs.filter(r => r.workflowId === hot && r.contactId === caio.id).length, 1, '"Pontuação mudou" with a minimum fires once, when the score crosses it');
  assert.deepEqual(scoreBand(caio.score), [50, 'Morno', 'gold']);
  assert.equal(scoreBand(0), null);
  assert.equal(scoreBand(150)[1], 'Quente');
});
