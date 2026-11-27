import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blank, execute } from '../model.mjs';
import { pageShell, utabs } from '../ui/screens.js';
import { icon } from '../ui/icons.js';
import { briefDialogBody, checkItem, eventView, itemDialogBody, itemFromValues } from '../ui/event-planner.js';
import { launchEventPlan } from '../ui/event-planner-data.js';

const helpers = { pageShell, utabs, marketingTabs: [['social', 'Planejador social'], ['events', 'Eventos']] };
const users = [{ id: 'u1', name: 'Bia' }, { id: 'u2', name: 'Caio' }];
const sections = ['strategy', 'tasks', 'messages', 'agenda', 'links', 'timeline', 'integrations'];
function context(data) {
  const s = blank();
  execute(s, { type: 'save', key: 'eventPlans', id: '', data });
  return { s, agency: { users: [...users] }, workspace: 'ep-view' };
}
const launched = () => context({ title: 'Aula', eventDate: '2026-12-10', plan: launchEventPlan('2026-12-10') });
const view = (c, section) => eventView(c, c.s.eventPlans[0], helpers, section);

test('Event view uses the standard head, metrics and nested tabs', () => {
  const html = view(launched(), 'messages');
  assert.match(html, /class="page-head"><div><button type="button" class="page-back" data-ep-back/);
  assert.match(html, /<h1>Aula<\/h1><p>10 de dez\. de 2026 · Planejado<\/p>/);
  assert.equal((html.match(/class="surface metric"/g) || []).length, 4);
  assert.match(html, /<span>Duração do roteiro<\/span><b>1h10<\/b>/);
  assert.match(html, /g-utabs is-nested/);
  for (const key of sections) assert.match(html, new RegExp(`data-ep-section="${key}"`));
  assert.doesNotMatch(html, /ep-hero|ep-kpis|ep-subtabs|ep-pill/);
});

test('Event title is escaped in the page head', () => {
  const c = context({ title: '<img src=x>', eventDate: '', plan: { brief: {}, items: [] } });
  assert.match(view(c, 'strategy'), /<h1>&lt;img src=x&gt;<\/h1><p>Data a definir · Planejado<\/p>/);
});

test('Strategy renders three blocks edited one at a time', () => {
  const c = context({ title: 'Vazio', eventDate: '', plan: { brief: { goal: 'Vender <1>' }, items: [] } });
  const html = view(c, 'strategy');
  assert.deepEqual([...html.matchAll(/data-ep-brief-group="([a-z]+)"/g)].map(m => m[1]), ['direction', 'communication', 'operation']);
  assert.equal((html.match(/class="ep-missing">A definir</g) || []).length, 6);
  assert.match(html, /Vender &lt;1&gt;/);
  const dialog = briefDialogBody(c.s.eventPlans[0], 'communication');
  assert.match(dialog, /name="narrative"/);
  assert.match(dialog, /name="offer"/);
  assert.doesNotMatch(dialog, /name="goal"/);
  assert.match(dialog, /data-revision="1"/);
});

test('Owner select lists sub-account users and keeps owners who left or were typed by hand', () => {
  const c = launched(), event = c.s.eventPlans[0], task = event.plan.items[0];
  const plain = itemDialogBody(c, event, 'task', task);
  assert.match(plain, /<option value="" selected>Sem responsável<\/option>/);
  assert.match(plain, /<option value="u1"\s*>Bia<\/option>/);
  assert.match(itemDialogBody(c, event, 'task', { ...task, ownerId: 'gone', owner: 'Ana' }), /<option value="gone" selected>Usuário removido \(Ana\)<\/option>/);
  assert.match(itemDialogBody(c, event, 'task', { ...task, ownerId: '', owner: 'Dani' }), /<option value="@Dani" selected>Dani<\/option>/);

  const values = { title: 'T', phase: 'captura', status: 'pendente', team: 'dev', date: '', notes: '' };
  const owner = (value, previous) => { const row = itemFromValues('task', { ...values, owner: value }, previous, users); return [row.ownerId, row.owner]; };
  assert.deepEqual(owner('u2', task), ['u2', 'Caio']);
  assert.deepEqual(owner('gone', { ...task, ownerId: 'gone', owner: 'Ana' }), ['gone', 'Ana']);
  assert.deepEqual(owner('@Dani', { ...task, ownerId: '', owner: 'Dani' }), ['', 'Dani']);
  assert.deepEqual(owner('', { ...task, ownerId: 'u1', owner: 'Bia' }), ['', '']);
});

test('Removed owners stay readable in the lists', () => {
  const c = launched();
  Object.assign(c.s.eventPlans[0].plan.items[0], { ownerId: 'gone', owner: 'Ana' });
  assert.match(view(c, 'tasks'), /Usuário removido \(Ana\)/);
  c.agency.users = [];
  assert.doesNotMatch(view(c, 'tasks'), /Usuário removido/, 'sem a lista de usuários não dá para dizer que alguém saiu');
  assert.match(view(c, 'tasks'), /· Ana/);
});

test('Messages are grouped by day, show code and rendered copy and filter by channel', () => {
  const c = launched();
  c.s.eventPlans[0].plan.items.find(row => row.code === 'MCWF001').notes = 'Oi *gente* <b>';
  const html = view(c, 'messages');
  assert.match(html, /data-ep-filter="channel"/);
  assert.match(html, /class="ep-code">MCWF001</);
  assert.match(html, /Oi <strong>gente<\/strong> &lt;b&gt;/);
  assert.match(html, /class="ep-day">1 de dez\. de 2026</);
  assert.match(html, /data-ep-copy=/);
  assert.match(html, /WhatsApp · privado/);
  assert.doesNotMatch(view(c, 'tasks'), /data-ep-filter="channel"/);
});

test('Message dialog mounts the copy editor and offers the original structure only for template codes', () => {
  const c = launched(), event = c.s.eventPlans[0], message = event.plan.items.find(row => row.code === 'MCWF1X1-001');
  const html = itemDialogBody(c, event, 'message', message);
  assert.match(html, /data-ec/);
  assert.match(html, /name="code"[^>]*value="MCWF1X1-001"/);
  assert.match(html, /<option value="\{\{contact\.first_name\}\}">/);
  assert.match(html, /data-ep-apply-template="MCWF1X1-001"/);
  assert.doesNotMatch(itemDialogBody(c, event, 'message', { ...message, code: 'MEU-01' }), /data-ep-apply-template/);
  assert.doesNotMatch(itemDialogBody(c, event, 'message'), /data-ep-apply-template/);
});

test('Items follow the planning rules of the original tool', () => {
  const link = { kind: 'link', status: 'pronto', url: '' };
  const message = { kind: 'message', status: 'agendado', channel: 'privado', date: '2026-12-01', time: '', notes: '' };
  assert.throws(() => checkItem(link), /Preencha o endereço para validar o link\./);
  assert.throws(() => checkItem({ ...link, url: 'ftp://x' }), /http:\/\/ ou https:\/\//);
  assert.doesNotThrow(() => checkItem({ ...link, url: 'https://graao.com' }));
  assert.throws(() => checkItem(message), /Preencha data e horário para marcar a mensagem como agendada\./);
  assert.doesNotThrow(() => checkItem({ ...message, time: '10:00' }));
  assert.throws(() => checkItem({ ...message, time: '10:00', channel: 'grupos', notes: 'Oi {{contact.first_name}}' }), /grupo não pode usar variáveis de contato/);
  assert.throws(() => itemFromValues('task', { title: '  ', owner: '' }, null, users), /Preencha o título\./);
});

test('New agenda blocks continue the script order', () => {
  const c = launched();
  assert.match(itemDialogBody(c, c.s.eventPlans[0], 'agenda'), /name="order"[^>]*value="8"/);
});

test('The event timeline shows tasks and messages with zoom and today', () => {
  const html = view(launched(), 'timeline');
  assert.equal((html.match(/data-ep-tl-bar=/g) || []).length, 46);
  assert.match(html, /data-ep-tl-zoom="day" aria-pressed="true"/);
  assert.match(html, /data-ep-tl-zoom="week" aria-pressed="false"/);
  assert.match(html, /data-ep-tl-today/);
  assert.match(html, /Captação[\s\S]*Vendas/);
  const empty = context({ title: 'Vazio', eventDate: '', plan: { brief: {}, items: [] } });
  assert.match(view(empty, 'timeline'), /class="empty"/);
});

test('Every icon used by the planner exists', () => {
  const source = readFileSync(new URL('../ui/event-planner.js', import.meta.url), 'utf8');
  const fallback = icon('icone-que-nao-existe', 15).replaceAll('icone-que-nao-existe', '');
  const names = new Set([...source.matchAll(/\bi\('([a-z-]+)'/g), ...source.matchAll(/icon: '([a-z-]+)'/g)].map(m => m[1]));
  assert.ok(names.size > 5);
  assert.deepEqual([...names].filter(name => name !== 'calendar' && icon(name, 15).replaceAll(name, '') === fallback), []);
});

test('Old events without the new fields still open in every section', () => {
  const c = launched(), event = c.s.eventPlans[0];
  delete event.revision;
  delete event.orchestration;
  for (const item of event.plan.items) { delete item.ownerId; delete item.code; }
  for (const key of sections) assert.match(view(c, key), /g-utabs is-nested/);
});

test('Group messages show and edit which groups receive them', () => {
  const c = launched(), event = c.s.eventPlans[0], message = code => event.plan.items.find(row => row.code === code);
  const html = view(c, 'messages');
  assert.match(html, /Grupos antigos e ativos/);
  assert.match(html, /Grupo do evento ·/);
  const dialog = itemDialogBody(c, event, 'message', message('MDWF001'));
  assert.match(dialog, /<div data-ep-audience><label>Grupos de destino<select name="audience">[\s\S]*<option value="evento" selected>/);
  assert.match(itemDialogBody(c, event, 'message', message('MCWF1X1-001')), /<div data-ep-audience hidden>/);
  const values = { title: 'x', channel: 'privado', audience: 'base', notes: '' };
  assert.equal(itemFromValues('message', values, null, users).audience, '');
  assert.equal(itemFromValues('message', { ...values, channel: 'grupos' }, null, users).audience, 'base');
});
