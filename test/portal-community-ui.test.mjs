import test from 'node:test';
import assert from 'node:assert/strict';
import { communityPage } from '../ui/portal-community.js';
import { defaultLayout, defaultTabs } from '../ui/community-data.js';
import { feedTab, filterFeed, relativeTime } from '../ui/portal-community-feed.js';
import { academyTab } from '../ui/portal-community-academy.js';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const ago = ms => new Date(NOW - ms).toISOString();
const author = name => ({ name, staff: false, level: 2, badges: [] });
const post = (id, extra = {}) => ({ id, channelId: 'c1', channel: 'Avisos', title: `Post ${id}`, titleAuto: false, body: 'Texto', link: '', image: '', pinned: false,
  created: ago(3600e3), author: author('Ana'), mine: false, canDelete: false, commentsEnabled: true, held: '', reports: 0, reported: false,
  likes: 0, liked: false, poll: null, comments: [], ...extra });

export function makeView({ widgets, tabs, membership = { status: 'active', role: 'member', onboardingDone: [] }, posts, academy = [], layout } = {}) {
  return {
    group: { id: 'g1', name: 'Clube', description: 'Gente boa', cover: '', visibility: 'public', welcome: '', memberPosts: true,
      channels: [{ id: 'c1', name: 'Avisos' }, { id: 'c2', name: 'Dúvidas' }], access: 'free', plans: [], trialDays: 0, questions: [], onboarding: [],
      theme: null, layout: layout || { ...defaultLayout(), ...(widgets ? { widgets } : {}) }, tabs: tabs || defaultTabs(), memberCount: 3, postCount: 3 },
    membership, academy,
    posts: posts || [post('p1'), post('p2'), post('p3')],
    events: [{ id: 'e1', title: 'Live de terça', start: new Date(NOW + 86400e3).toISOString(), end: new Date(NOW + 90000e3).toISOString(), past: false, recordings: [],
      attendees: [], going: 0, capacity: 0, color: '#155eef', priceLabel: 'Gratuito', access: 'free', description: '', cover: '', recordingCount: 0 }],
    leaderboard: { period: '30', levels: [{ level: 1, name: 'Nível 1', min: 0, share: 100 }], top: [{ name: 'Ana', points: 9, level: 2 }, { name: 'Bia', points: 3, level: 1 }], me: null },
    members: [{ name: 'Ana', role: 'member', joinedAt: ago(5 * 86400e3), level: 2, badges: [] }, { name: 'Bia', role: 'member', joinedAt: ago(86400e3), level: 1, badges: [] }],
    live: null
  };
}
export { post, NOW, ago };

const order = html => [...html.matchAll(/data-widget="([a-z]+)"/g)].map(match => match[1]);
const ui = { tab: 'discussion', channel: '', period: '30' };

test('aside shows only visible widgets in the chosen order', () => {
  const widgets = [{ key: 'ranking', visible: true }, { key: 'about', visible: false }, { key: 'events', visible: true }, { key: 'members', visible: true }];
  assert.deepEqual(order(communityPage(makeView({ widgets }), ui)), ['ranking', 'events', 'members']);
});

test('aside disappears with no widgets and hidden tabs drop their widget', () => {
  const none = defaultLayout().widgets.map(row => ({ ...row, visible: false }));
  assert.equal(communityPage(makeView({ widgets: none }), ui).includes('cp-cm-aside'), false);
  const tabs = defaultTabs().map(tab => tab.key === 'ranking' ? { ...tab, visible: false } : tab);
  assert.deepEqual(order(communityPage(makeView({ tabs }), ui)), ['about', 'events', 'members']);
});

test('visitor sees the hero and the join button', () => {
  const html = communityPage(makeView({ membership: null }), ui);
  assert.match(html, /cp-cm-hero/);
  assert.match(html, /data-cm-public="join"/);
  assert.doesNotMatch(communityPage(makeView(), ui), /cp-cm-hero/);
});

test('academy tab hidden when not visible', () => {
  const hidden = defaultTabs().map(tab => tab.key === 'academy' ? { ...tab, visible: false } : tab);
  assert.doesNotMatch(communityPage(makeView({ tabs: hidden }), ui), /data-value="academy"/);
  assert.match(communityPage(makeView(), ui), /data-cm-public="tab" data-value="academy"/);
});

const DAY = 86400e3;
test('filterFeed orders recent, hot and mine', () => {
  const posts = [
    post('p1', { pinned: true, created: ago(10 * DAY) }),
    post('p2', { likes: 5, comments: [{}, {}], created: ago(2 * DAY) }),
    post('p3', { likes: 1, mine: true, created: ago(3600e3) }),
    post('p4', { likes: 50, created: ago(40 * DAY) })
  ];
  const ids = filter => filterFeed(posts, filter, NOW).map(row => row.id);
  assert.deepEqual(ids('recent'), ['p1', 'p3', 'p2', 'p4']);
  assert.deepEqual(ids('hot'), ['p2', 'p3', 'p1']);
  assert.deepEqual(ids('mine'), ['p3']);
});

test('relativeTime', () => {
  assert.equal(relativeTime(ago(30e3), NOW), 'agora');
  assert.equal(relativeTime(ago(5 * 60e3), NOW), '5 min');
  assert.equal(relativeTime(ago(3 * 3600e3), NOW), '3 h');
  assert.equal(relativeTime(ago(2 * DAY), NOW), '2 d');
  assert.match(relativeTime(ago(20 * DAY), NOW), /^\d{2} [a-zç]{3}/);
});

test('cards hide auto titles and collapse comments', () => {
  const comment = n => ({ id: `k${n}`, body: `Comentário ${n}`, created: ago(n * 60e3), author: author('Bia'), likes: 0, liked: false, mine: false, canDelete: false, held: '', reported: false });
  const posts = [post('p1', { titleAuto: true, title: 'Primeira linha' }), post('p2', { comments: [1, 2, 3, 4].map(comment) })];
  const card = (html, id) => html.split(`id="post-${id}"`)[1].split('</article>')[0];
  const html = feedTab(makeView({ posts }), { feed: 'recent' });
  assert.doesNotMatch(card(html, 'p1'), /<h3/);
  assert.equal((card(html, 'p2').match(/<li[ >]/g) || []).length, 2);
  assert.match(card(html, 'p2'), /Ver todos os 4 comentários/);
  const open = feedTab(makeView({ posts }), { feed: 'recent', openComments: new Set(['p2']) });
  assert.equal((card(open, 'p2').match(/<li[ >]/g) || []).length, 4);
});

test('academy cards show the action for each state', () => {
  const card = (id, state, extra = {}) => ({ id, name: `Curso ${id}`, description: 'Descrição', cover: '', progress: { done: 3, total: 10, percent: 30 }, mode: 'included', state, offerUrl: '', priceLabel: '', ...extra });
  const academy = [card('c1', 'open'), card('c2', 'join'), card('c3', 'buy', { mode: 'separate', offerUrl: '/oferta/demo/o1', priceLabel: 'R$ 97,00' }), card('c4', 'unavailable', { mode: 'separate' })];
  const html = academyTab(makeView({ academy }));
  assert.match(html, /data-cm-public="course" data-course="c1"/);
  assert.match(html, /Continuar/);
  assert.match(html, /Entre na comunidade para assistir/);
  assert.match(html, /href="\/oferta\/demo\/o1"/);
  assert.match(html, /R\$ 97,00/);
  assert.match(html, /Indisponível no momento/);
  assert.match(html, /Incluso/);
  assert.match(academyTab(makeView({ academy: [card('c5', 'open', { progress: { done: 0, total: 4, percent: 0 } })] })), /Começar/);
  assert.match(academyTab(makeView({ academy: [] })), /cp-cm-empty/);
  assert.match(communityPage(makeView({ academy }), { ...ui, tab: 'academy' }), /data-course="c1"/);
});

test('the channel filter runs on the page, without a new request', () => {
  const posts = [post('p1', { channelId: 'c1' }), post('p2', { channelId: 'c2', channel: 'Dúvidas' }), post('p3', { channelId: 'c2', channel: 'Dúvidas' })];
  const ids = html => [...html.matchAll(/id="post-([a-z0-9]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids(feedTab(makeView({ posts }), { channel: 'c2' })), ['p2', 'p3']);
  assert.deepEqual(ids(feedTab(makeView({ posts }), { channel: '' })).sort(), ['p1', 'p2', 'p3']);
  assert.match(feedTab(makeView({ posts }), { channel: 'c9' }), /Nada neste canal ainda/);
});

test('the member switches the community between light and dark', () => {
  const light = communityPage(makeView(), ui), dark = communityPage(makeView(), { ...ui, mode: 'dark' });
  assert.match(light, /data-cm-public="mode" data-value="dark"[^>]*aria-label="Ativar modo escuro"/);
  assert.match(dark, /data-cm-public="mode" data-value="light"[^>]*aria-label="Ativar modo claro"/);
  assert.match(dark, /--cm-background:#111111/);
  assert.doesNotMatch(light, /--cm-background:#111111/);
});

test('the ranking period switches on the page', () => {
  const board = (period, name) => ({ period, levels: [{ level: 1, name: 'Nível 1', min: 0, share: 100 }], top: [{ name, points: 4, level: 1 }], me: null });
  const view = { ...makeView(), leaderboards: { 7: board('7', 'Semana'), 30: board('30', 'Mes'), all: board('all', 'Sempre') } };
  const page = period => communityPage(view, { ...ui, tab: 'ranking', period });
  assert.match(page('7'), /<strong>Semana<\/strong>/);
  assert.match(page('all'), /<strong>Sempre<\/strong>/);
  assert.match(page('7'), /data-cm-public="period" data-value="7" aria-pressed="true"/);
});

test('composer uses the owner prompt', () => {
  const layout = { ...defaultLayout(), composerPrompt: 'Conte sua vitória' };
  assert.match(feedTab(makeView({ layout }), {}), /placeholder="Conte sua vitória"/);
  assert.match(feedTab(makeView(), {}), /placeholder="Compartilhe algo com a comunidade…"/);
  assert.doesNotMatch(feedTab(makeView({ membership: null }), {}), /data-cm-public-form="post"/);
});
