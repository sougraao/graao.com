// Funil de reuniões qualificadas: vídeo, formulário e agenda dentro das páginas, destino por resposta,
// regras de agenda por serviço e eventos de pixel só para quem é qualificado.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { blank, execute } from '../model.mjs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { availableSlots, bookingView, createBookingLink, upcomingSlots } from '../scheduling-model.mjs';
import { outcomeOf, resolveDestination } from '../destinations.mjs';
import { renderEmbeds, videoSource, withEmbeds } from '../site-embeds.mjs';
import { pixelsScript } from '../tracking.mjs';
import { newField, readAnswers } from '../ui/form-fields.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const find = (s, key, id) => s[key].find(row => row.id === id);
const at = Date.parse('2026-12-07T06:00:00Z'); // segunda, 03:00 em São Paulo
const hours = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(w => [w, ['09:00', '18:00']]));

function workspace() {
  const s = blank();
  s.profile.timezone = 'America/Sao_Paulo';
  execute(s, { type: 'scheduling-settings', data: { enabled: true, step: 60, leadMinutes: 0, horizonDays: 30, hours } });
  const service = save(s, 'services', { name: 'Reunião', duration: 60 });
  return { s, service };
}
const invest = { ...newField('radio'), id: 'invest', label: 'Pode investir?', options: ['Sim', 'Não'], required: true };
const role = { ...newField('select'), id: 'role', label: 'Cargo', options: ['Dono', 'Funcionário'] };
const fields = [{ ...newField('email'), id: 'mail' }, invest, role];
const formData = extra => ({ name: 'Qualificação', active: true, fields, ...extra });
const answer = (form, input) => outcomeOf(form, readAnswers(form, { email: 'ana@exemplo.com', ...input }));
const keyOf = (form, id) => form.fields.find(field => field.id === id).key;

/* ───────── Destinos do formulário ───────── */

test('A form sends each answer to its own destination and marks who is disqualified', () => {
  const { s, service } = workspace();
  const id = save(s, 'forms', formData({
    onSubmit: { action: 'booking', serviceId: service },
    routes: [
      { when: 'answer', fieldId: 'role', option: 'Dono', tag: 'decisor', dest: { action: 'default' } },
      { when: 'answer', fieldId: 'invest', option: 'Não', disqualify: true, tag: 'desqualificado', dest: { action: 'redirect', url: 'https://exemplo.com/curso' } }
    ]
  }));
  const form = find(s, 'forms', id), k = keyOf(form, 'invest'), r = keyOf(form, 'role');
  assert.deepEqual(answer(form, { [k]: 'Sim', [r]: 'Dono' }), { qualified: true, tags: ['decisor'], dest: { action: 'booking', message: '', url: '', siteId: '', page: '', serviceId: service } });
  const out = answer(form, { [k]: 'Não', [r]: 'Dono' });
  assert.equal(out.qualified, false);
  assert.equal(out.dest.url, 'https://exemplo.com/curso', 'a disqualifying rule wins over the order of the list');
  assert.deepEqual(out.tags, ['decisor', 'desqualificado']);
});

test('Quiz tiers can also decide the destination', () => {
  const { s, service } = workspace();
  const scored = { ...invest, scores: { Sim: 10, Não: 0 } };
  const id = save(s, 'forms', formData({ kind: 'quiz', fields: [fields[0], scored], onSubmit: { action: 'booking', serviceId: service },
    tiers: [{ name: 'Frio', min: 0, max: 50 }, { name: 'Quente', min: 51, max: 100 }],
    routes: [{ when: 'tier', tier: 'Frio', disqualify: true, dest: { action: 'message', message: 'Ainda não é a hora.' } }] }));
  const form = find(s, 'forms', id), k = keyOf(form, 'invest');
  assert.equal(answer(form, { [k]: 'Não' }).qualified, false);
  assert.equal(answer(form, { [k]: 'Não' }).dest.message, 'Ainda não é a hora.');
  assert.equal(answer(form, { [k]: 'Sim' }).qualified, true);
});

test('Destinations are validated when the form is saved', () => {
  const { s } = workspace();
  const bad = (extra, pattern) => assert.throws(() => save(s, 'forms', formData(extra)), pattern);
  bad({ onSubmit: { action: 'booking', serviceId: 'nada' } }, /serviço/i);
  bad({ onSubmit: { action: 'page', siteId: 'nada', page: 'index' } }, /página/i);
  bad({ onSubmit: { action: 'redirect', url: 'javascript:alert(1)' } }, /https/);
  bad({ routes: [{ when: 'answer', fieldId: 'invest', option: 'Não', disqualify: true, dest: { action: 'default' } }] }, /desqualificado/);
  const id = save(s, 'forms', formData({ routes: [
    { when: 'answer', fieldId: 'invest', option: 'Talvez', dest: { action: 'message', message: 'x' } },
    { when: 'answer', fieldId: 'sumiu', option: 'Sim', dest: { action: 'message', message: 'x' } }] }));
  assert.deepEqual(find(s, 'forms', id).routes, [], 'rules about questions or answers that no longer exist are dropped');
});

test('Submitting tags the contact, stores the qualification and tells the workflows', () => {
  const { s, service } = workspace();
  const id = save(s, 'forms', formData({ onSubmit: { action: 'booking', serviceId: service },
    routes: [{ when: 'answer', fieldId: 'invest', option: 'Não', disqualify: true, tag: 'desqualificado', dest: { action: 'message', message: 'Obrigado' } }] }));
  const form = find(s, 'forms', id), k = keyOf(form, 'invest');
  const flow = (name, qualified) => save(s, 'workflows', { name, active: true, triggers: [{ type: 'form_submitted', config: { formId: id, qualified } }], steps: [{ type: 'add_tag', config: { tag: name } }] });
  flow('fluxo-sim', 'yes'); flow('fluxo-nao', 'no');
  execute(s, { type: 'submit', id, data: { email: 'bia@exemplo.com', [k]: 'Não' } });
  execute(s, { type: 'submit', id, data: { email: 'caio@exemplo.com', [k]: 'Sim' } });
  const tags = mail => s.contacts.find(c => c.email === mail).tags;
  assert.deepEqual(s.submissions.slice(-2).map(row => row.qualified), [false, true]);
  assert.ok(tags('bia@exemplo.com').includes('desqualificado') && tags('bia@exemplo.com').includes('fluxo-nao'));
  assert.ok(!tags('bia@exemplo.com').includes('fluxo-sim'));
  assert.ok(tags('caio@exemplo.com').includes('fluxo-sim') && !tags('caio@exemplo.com').includes('fluxo-nao'));
});

test('A qualified lead takes to the calendar only what it typed; a disqualified one gets no link', () => {
  const { s, service } = workspace();
  save(s, 'contacts', { name: 'Nome Guardado', email: 'ana@exemplo.com', phone: '11999990000' });
  const id = save(s, 'forms', formData({ onSubmit: { action: 'booking', serviceId: service },
    routes: [{ when: 'answer', fieldId: 'invest', option: 'Não', disqualify: true, dest: { action: 'message', message: 'x' } }] }));
  const k = keyOf(find(s, 'forms', id), 'invest');
  const no = execute(s, { type: 'submit', id, data: { email: 'ana@exemplo.com', [k]: 'Não' } });
  assert.equal((s.bookingLinks || []).length, 0);
  const yes = execute(s, { type: 'submit', id, data: { email: 'ana@exemplo.com', [k]: 'Sim' } });
  const link = s.bookingLinks.find(row => row.submissionId === yes);
  assert.ok(link && no !== yes);
  const view = bookingView(s, { link: link.token });
  assert.deepEqual(view.person, { name: '', email: 'ana@exemplo.com', phone: '' }, 'the stored name and phone never reach whoever typed the e-mail');
  const stored = createBookingLink(s, 'w', s.contacts[0], {});
  assert.equal(bookingView(s, { link: stored.token }).person.name, s.contacts[0].name, 'links made by workflows keep using the contact');
});

test('Destinations resolve to addresses, and fall back to the message when the target is not available', () => {
  const { s, service } = workspace();
  s.studioProjects.push({ id: 'p1', name: 'Funil', publishedAt: '', pages: [{ id: 'a', slug: 'index' }, { id: 'b', slug: 'agenda' }] });
  const to = (dest, extra) => resolveDestination(s, 'demo', dest, extra);
  assert.equal(to({ action: 'message' }), null);
  assert.deepEqual(to({ action: 'redirect', url: 'https://x.com/a' }), { href: 'https://x.com/a', external: true });
  assert.equal(to({ action: 'page', siteId: 'p1', page: 'agenda' }), null, 'not published');
  s.studioProjects[0].publishedAt = '2026-01-01';
  assert.deepEqual(to({ action: 'page', siteId: 'p1', page: 'agenda' }, { link: 'abc' }), { href: '/s/demo/p1/agenda?link=abc', external: false });
  assert.deepEqual(to({ action: 'page', siteId: 'p1', page: 'index' }), { href: '/s/demo/p1', external: false });
  assert.equal(to({ action: 'page', siteId: 'p1', page: 'apagada' }), null);
  assert.deepEqual(to({ action: 'booking', serviceId: service }, { event: 'lead.1' }), { href: `/agendar/demo?servico=${service}&graao_ev=lead.1`, external: false });
  s.scheduling.enabled = false;
  assert.equal(to({ action: 'booking', serviceId: service }), null);
});

/* ───────── Agenda por serviço ───────── */

test('A service can have its own minimum notice and booking window', () => {
  const { s, service } = workspace();
  const strict = save(s, 'services', { name: 'Diagnóstico', duration: 60, leadMinutes: 1080, horizonDays: 4 });
  assert.equal(availableSlots(s, service, '2026-12-07', { at })[0].time, '09:00');
  assert.deepEqual(availableSlots(s, strict, '2026-12-07', { at }), [], '18 h of notice from 03:00 goes past closing time');
  assert.equal(availableSlots(s, strict, '2026-12-08', { at })[0].time, '09:00');
  assert.ok(availableSlots(s, strict, '2026-12-11', { at }).length);
  assert.deepEqual(availableSlots(s, strict, '2026-12-12', { at }), [], 'closed after 4 days');
  assert.equal(bookingView(s, { serviceId: strict, at }).days.length, 5);
  assert.ok(upcomingSlots(s, strict, { count: 50, at }).every(row => row.day <= '2026-12-11'));
  const kept = save(s, 'services', { name: 'Reunião', duration: 60, leadMinutes: '', horizonDays: '' }, service);
  assert.deepEqual([find(s, 'services', kept).leadMinutes, find(s, 'services', kept).horizonDays], [null, null], 'empty follows the account');
  assert.throws(() => save(s, 'services', { name: 'X', horizonDays: 0 }), /Agenda aberta/);
});

/* ───────── Vídeo, formulário e agenda nas páginas ───────── */

test('Only known players and https video files become a video', () => {
  assert.equal(videoSource('https://youtu.be/UV19exMToaY').src, 'https://www.youtube-nocookie.com/embed/UV19exMToaY');
  assert.equal(videoSource('https://vimeo.com/123456789').src, 'https://player.vimeo.com/video/123456789');
  assert.deepEqual(videoSource('https://cdn.exemplo.com/vsl.mp4?x=1'), { kind: 'file', src: 'https://cdn.exemplo.com/vsl.mp4?x=1' });
  assert.equal(videoSource('https://player-vz-1a2b3c4d-5e6.tv.pandavideo.com.br/embed/?v=0f8fad5b-d9cb-469f-a165-70867728950e').kind, 'frame');
  for (const bad of ['', 'javascript:alert(1)', 'http://youtu.be/UV19exMToaY', 'https://exemplo.com/pagina', 'https://tv.pandavideo.com.br.evil.com/embed/?v=0f8fad5b-d9cb-469f-a165-70867728950e'])
    assert.equal(videoSource(bad), null, bad);
});

test('Embed markers become frames only when the page is served, and the policy allows only what is used', () => {
  const formId = '11111111-1111-4111-8111-111111111111', serviceId = '22222222-2222-4222-8222-222222222222';
  const page = body => `<!doctype html><html><head></head><body>${body}</body></html>`;
  const raw = page(`<div data-graao-embed="video" data-src="https://youtu.be/UV19exMToaY"><span>Vídeo</span></div>
    <div data-graao-embed="form" data-id="${formId}"></div><div data-graao-embed="booking" data-id="${serviceId}"></div>`);
  const html = renderEmbeds(raw, { workspace: 'demo', link: 'a'.repeat(32) });
  assert.match(html, /<iframe[^>]+src="https:\/\/www\.youtube-nocookie\.com\/embed\/UV19exMToaY"[^>]+referrerpolicy="strict-origin-when-cross-origin"/);
  assert.match(html, new RegExp(`src="/form/demo/${formId}\\?embed=1"`));
  assert.match(html, new RegExp(`src="/agendar/demo\\?embed=1&amp;servico=${serviceId}&amp;link=${'a'.repeat(32)}"`));
  const [headers, served] = withEmbeds({ 'Content-Security-Policy': "default-src 'none'; media-src https:" }, html);
  assert.match(headers['Content-Security-Policy'], /frame-src 'self' https:\/\/www\.youtube-nocookie\.com(;|$)/);
  assert.match(headers['Content-Security-Policy'], /script-src 'sha256-[^']+'/);
  assert.doesNotMatch(headers['Content-Security-Policy'], /vimeo|unsafe-inline/);
  assert.match(served, /<script>[\s\S]+<\/script><\/body>/);

  const broken = renderEmbeds(page('<div data-graao-embed="video" data-src="javascript:alert(1)"></div><div data-graao-embed="form" data-id="&quot;><script>"></div>'), { workspace: 'demo' });
  assert.doesNotMatch(broken, /<iframe|<video/);
  assert.equal(broken.match(/data-graao-empty/g).length >= 2, true, 'what is not set up stays hidden');
  const plain = page('<p>Oi</p>');
  assert.equal(renderEmbeds(plain, { workspace: 'demo' }), plain);
  assert.deepEqual(withEmbeds({ a: 1 }, plain), [{ a: 1 }, plain]);
  assert.match(renderEmbeds(page('<div data-graao-embed="video" data-src="https://cdn.exemplo.com/a.mp4"></div>'), { workspace: 'demo' }), /<video[^>]+controls[^>]+src="https:\/\/cdn\.exemplo\.com\/a\.mp4"/);
});

/* ───────── Pixel ───────── */

function runPixels({ search = '', meta = '', embedded = false, seen = {} } = {}) {
  const calls = [], listeners = {}, replaced = [];
  const origin = 'https://app.test', store = { ...seen };
  const win = { calls, location: { search, pathname: '/x', hash: '', origin, href: `${origin}/x${search}` }, history: { replaceState: (_a, _b, url) => replaced.push(url) },
    sessionStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } } };
  win.parent = embedded ? { location: { origin } } : win;
  const document = { createElement: () => ({}), head: { appendChild() {} }, addEventListener: (name, fn) => { listeners[name] = fn; },
    querySelector: sel => sel.includes('graao-event') && meta ? { getAttribute: () => meta } : null };
  win.fbq = (...args) => calls.push(args);
  vm.runInNewContext(pixelsScript({ ga4: '', gtm: '', metaPixel: '123456789012' }), { window: win, document, location: win.location, URLSearchParams, Date, encodeURIComponent });
  return { calls, listeners, replaced, store };
}

test('Lead and Schedule fire once from the server marker, with an id, and the address is cleaned', () => {
  const lead = runPixels({ search: '?graao_ev=lead.abc&link=t' });
  assert.deepEqual(lead.calls.filter(c => c[1] === 'Lead').map(c => JSON.parse(JSON.stringify(c))), [['track', 'Lead', {}, { eventID: 'lead.abc' }]]);
  assert.deepEqual(lead.replaced, ['/x?link=t']);
  assert.equal(runPixels({ search: '?graao_ev=lead.abc', seen: lead.store }).calls.filter(c => c[1] === 'Lead').length, 0, 'reloading does not count twice');
  assert.equal(runPixels({ meta: 'schedule.9' }).calls.filter(c => c[1] === 'Schedule').length, 1);
  assert.equal(runPixels({ search: '?graao_ev=purchase.1' }).calls.filter(c => c[1] !== 'PageView' && c[0] === 'track').length, 0, 'unknown events are ignored');
});

test('Forms decided by the server do not fire Lead on the click, and an embedded form does not count another page view', () => {
  const page = runPixels();
  const submit = marked => page.listeners.submit({ target: { hasAttribute: name => marked && name === 'data-graao-lead' } });
  submit(true);
  assert.equal(page.calls.filter(c => c[1] === 'Lead').length, 0);
  submit(false);
  assert.equal(page.calls.filter(c => c[1] === 'Lead').length, 1, 'other public forms keep working as before');
  assert.equal(page.calls.filter(c => c[1] === 'PageView').length, 1);
  assert.equal(runPixels({ embedded: true }).calls.filter(c => c[1] === 'PageView').length, 0);
});

/* ───────── De ponta a ponta ───────── */

async function start(t) {
  const store = createSqliteStore(':memory:');
  const { server, host } = makeServer({ store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body) => (await fetch(base + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json();
  const act = body => call('/api/action?workspace=demo', body);
  const post = (path, body) => fetch(base + path, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base }, body: new URLSearchParams(body) });
  return { base, act, call, post, get: path => fetch(base + path, { redirect: 'manual' }) };
}

async function funnel(t) {
  const app = await start(t), { act, call } = app;
  await act({ type: 'tracking-settings', data: { metaPixel: '123456789012' } });
  await act({ type: 'scheduling-settings', data: { enabled: true, leadMinutes: 0, hours } });
  const site = (await call('/api/studio?workspace=demo', { mode: 'blank', kind: 'funnel', name: 'Funil' })).id;
  const { doc } = await call(`/api/studio/doc?workspace=demo&id=${site}`);
  await call('/api/studio/publish?workspace=demo', { id: site, publish: true });
  const service = (await act({ type: 'save', key: 'services', data: { name: 'Reunião', duration: 60, after: { action: 'page', siteId: site, page: 'obrigado' } } })).id;
  const saved = await act({ type: 'save', key: 'forms', data: formData({ onSubmit: { action: 'booking', serviceId: service },
    routes: [{ when: 'answer', fieldId: 'invest', option: 'Não', disqualify: true, dest: { action: 'page', siteId: site, page: 'obrigado' } }] }) });
  const form = saved.state.forms.find(row => row.id === saved.id);
  return { ...app, site, service, doc, form, k: keyOf(form, 'invest'), path: `/form/demo/${form.id}` };
}

test('Qualified leads go to the calendar with their data and Lead; disqualified ones go elsewhere without it', async t => {
  const { post, get, path, k, site, service } = await funnel(t);
  const yes = await post(path, { email: 'ana@exemplo.com', [k]: 'Sim' });
  assert.equal(yes.status, 303);
  const url = new URL(yes.headers.get('location'), 'http://x');
  assert.equal(url.pathname, '/agendar/demo');
  assert.equal(url.searchParams.get('servico'), service);
  assert.match(url.searchParams.get('graao_ev'), /^lead\./);
  const booking = await (await get(url.pathname + url.search)).text();
  assert.match(booking, /value="ana@exemplo\.com"/);
  assert.match(booking, /pixels\.js/);
  const no = await post(path, { email: 'bia@exemplo.com', [k]: 'Não' });
  assert.equal(no.headers.get('location'), `/s/demo/${site}/obrigado`);
  assert.match(await (await get(path)).text(), /<form[^>]+data-graao-lead/);
});

test('Booking ends on the confirmation page of the service with Schedule', async t => {
  const { post, get, service, site } = await funnel(t);
  const page = await (await get(`/agendar/demo?servico=${service}`)).text();
  const inicio = page.match(/name="inicio" value="([^"]+)"/)[1];
  const done = await post(`/agendar/demo?servico=${service}`, { servico: service, inicio, nome: 'Ana', email: 'ana@exemplo.com' });
  assert.equal(done.status, 303);
  assert.match(done.headers.get('location'), new RegExp(`^/s/demo/${site}/obrigado\\?graao_ev=schedule\\.`));
});

test('Inside a page, form and calendar open in frames and leave through the whole window', async t => {
  const { post, get, path, k, service } = await funnel(t);
  const framed = await get(`/agendar/demo?embed=1&servico=${service}`);
  assert.match(framed.headers.get('content-security-policy'), /frame-ancestors \*/);
  assert.match((await get(`/agendar/demo?servico=${service}`)).headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(await framed.text(), /embed=1/);
  const out = await post(`${path}?embed=1`, { email: 'ana@exemplo.com', [k]: 'Sim' });
  assert.equal(out.status, 200);
  const html = await out.text();
  assert.match(html, /<a[^>]+target="_top"[^>]+href="\/agendar\/demo\?/);
  assert.match(html, /graao_ev=lead\./);
  const bad = await post(`${path}?embed=1`, { email: '', [k]: 'Sim' });
  assert.equal(bad.status, 422, 'errors stay inside the frame');
  assert.doesNotMatch(await bad.text(), /target="_top"/);
});

test('An external destination fires Lead on a short page before leaving', async t => {
  const { act, post } = await funnel(t);
  const saved = await act({ type: 'save', key: 'forms', data: formData({ onSubmit: { action: 'redirect', url: 'https://exemplo.com/obrigado?a=1' } }) });
  const form = saved.state.forms.find(row => row.id === saved.id), k = keyOf(form, 'invest');
  const out = await post(`/form/demo/${form.id}`, { email: 'ana@exemplo.com', [k]: 'Sim' });
  assert.equal(out.status, 200);
  const html = await out.text();
  assert.match(html, /<meta name="graao-event" content="lead\.[^"]+">/);
  assert.match(html, /href="https:\/\/exemplo\.com\/obrigado\?a=1"/);
  await act({ type: 'tracking-settings', data: { metaPixel: '' } });
  assert.equal((await post(`/form/demo/${form.id}`, { email: 'ana@exemplo.com', [k]: 'Sim' })).status, 303, 'without a pixel it goes straight');
});

test('A quiz keeps the message of its tier, unless a rule of the tier has its own', async t => {
  const { act, post } = await funnel(t);
  const quiz = async routes => {
    const saved = await act({ type: 'save', key: 'forms', data: formData({ kind: 'quiz', fields: [fields[0], { ...invest, scores: { Sim: 10, Não: 0 } }], onSubmit: { action: 'message', message: 'Mensagem geral' },
      tiers: [{ name: 'Frio', min: 0, max: 50, message: 'Mensagem da faixa fria' }, { name: 'Quente', min: 51, max: 100, message: 'Mensagem da faixa quente' }], routes }) });
    const form = saved.state.forms.find(row => row.id === saved.id);
    return async value => (await post(`/form/demo/${form.id}`, { email: 'ana@exemplo.com', [keyOf(form, 'invest')]: value })).text();
  };
  const plain = await quiz([]);
  assert.match(await plain('Sim'), /Mensagem da faixa quente/);
  const ruled = await quiz([{ when: 'tier', tier: 'Frio', disqualify: true, dest: { action: 'message', message: 'Mensagem da regra' } }]);
  assert.match(await ruled('Não'), /Mensagem da regra/);
  assert.match(await ruled('Sim'), /Mensagem da faixa quente/);
});

test('A published funnel page shows the embeds and hands the visit link to the calendar', async t => {
  const { call, get, site, doc, form, service } = await funnel(t);
  const html = `<!doctype html><html lang="pt-BR"><head><title>x</title></head><body><main><div data-graao-embed="form" data-id="${form.id}"></div><div data-graao-embed="booking" data-id="${service}"></div></main></body></html>`;
  const { doc: after } = await call('/api/studio/save?workspace=demo', { id: site, pageId: doc.pages[0].id, html });
  assert.match(after.pages[0].html, /data-graao-embed="form"/, 'the marker survives the sanitizer');
  await call('/api/studio/publish?workspace=demo', { id: site, publish: true });
  const token = 'b'.repeat(32);
  const page = await get(`/s/demo/${site}?link=${token}`);
  const body = await page.text();
  assert.match(body, new RegExp(`src="/form/demo/${form.id}\\?embed=1"`));
  assert.match(body, new RegExp(`&amp;link=${token}"`));
  assert.match(page.headers.get('content-security-policy'), /frame-src 'self'/);
  assert.doesNotMatch(await (await get(`/s/demo/${site}?link=%22onload`)).text(), /onload/);
});
