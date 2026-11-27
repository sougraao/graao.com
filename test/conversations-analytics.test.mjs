import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { conversationStats, duration, volumeChart } from '../ui/conversation-analytics.js';
import { slaRecords } from '../ui/conversations.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const at = (base, minutes) => new Date(base + minutes * 60000).toISOString();
const msg = (s, contactId, created, direction, channel = 'WhatsApp', extra = {}) =>
  s.messages.push({ id: `m${s.messages.length}-${Math.random().toString(36).slice(2, 6)}`, contactId, created, direction, channel, body: 'oi', read: true, starred: false, origin: 'human', ...extra });

test('Durations read naturally', () => {
  assert.deepEqual([duration(0.5), duration(12.4), duration(185), duration(60), duration(3000), duration(null)], ['30 s', '12 min', '3 h 05', '1 h', '2 d 2 h', '—']);
});

test('The overview counts volume, first responses, who is waiting and who answered, leaving notes out', () => {
  const s = blank('W');
  s.messages = [];
  const now = Date.parse('2026-11-20T15:00:00Z'), base = now - 2 * 864e5;
  const ana = save(s, 'contacts', { name: 'Ana' }), bia = save(s, 'contacts', { name: 'Bia' }), caio = save(s, 'contacts', { name: 'Caio' });
  msg(s, ana, at(base, 0), 'Inbound');
  msg(s, ana, at(base, 1), 'Inbound');
  msg(s, ana, at(base, 10), 'Outbound');                      // 10 min from the first waiting message
  msg(s, ana, at(base, 11), 'Outbound', 'Note', { origin: 'internal' });
  msg(s, bia, at(base, 0), 'Inbound', 'Email');
  msg(s, bia, at(base, 120), 'Outbound', 'Email', { origin: 'workflow' }); // 2 h
  msg(s, bia, at(base, 200), 'Outbound', 'WhatsApp');            // unprompted, not a response
  msg(s, caio, at(now - 864e5 * 10, 0), 'Inbound');              // before the period: an old contact
  msg(s, caio, at(now, -30), 'Inbound', 'WhatsApp', { body: 'alguém aí?' }); // still unanswered: waiting since 10 days ago
  const st = conversationStats(s, { days: 7, now });
  assert.deepEqual([st.conversations, st.newConversations, st.received, st.sent, st.responses], [3, 2, 4, 3, 2]);
  assert.equal(st.medianResponse, 65);
  assert.equal(st.withinHour, 0.5);
  assert.deepEqual(st.waiting.map(w => [w.contactId, Math.round(w.minutes / 1440), w.body]), [[caio, 10, 'alguém aí?']]);
  assert.deepEqual(st.channels.map(c => [c.channel, c.received, c.sent, c.median]), [['WhatsApp', 3, 2, 10], ['Email', 1, 1, 120]]);
  assert.deepEqual(st.origins, [{ origin: 'Equipe', count: 2 }, { origin: 'Automações', count: 1 }]);
  assert.equal(st.series.length, 7);
  assert.equal(st.series.reduce((n, d) => n + d.received + d.sent, 0), 7);
  const email = conversationStats(s, { days: 7, now, channel: 'Email' });
  assert.deepEqual([email.received, email.sent, email.medianResponse], [1, 1, 120]);
  assert.match(volumeChart(st.series), /<svg[^>]+viewBox="0 0 720 180"/);
});

test('SLA covers WhatsApp and the other chat channels', () => {
  const s = blank('W');
  execute(s, { type: 'conversation-sla', data: { enabled: true, mode: 'channel', automation: 'all', common: { soon: 3, overdue: 5 },
    channels: { WhatsApp: { soon: 10, overdue: 20 }, Email: { soon: 60, overdue: 120 } } } });
  assert.deepEqual(s.conversationSla.channels.WhatsApp, { soon: 10, overdue: 20 });
  assert.deepEqual(s.conversationSla.channels.Instagram, { soon: 3, overdue: 5 }, 'channels without their own targets use the common ones');
  const ana = save(s, 'contacts', { name: 'Ana' });
  const start = Date.parse(s.conversationSla.startedAt) + 1000;
  msg(s, ana, at(start, 0), 'Inbound', 'WhatsApp');
  msg(s, ana, at(start, 0), 'Inbound', 'Live chat');
  const records = slaRecords(s, start + 15 * 60000);
  assert.deepEqual(records.map(r => [r.channel, r.state]).sort(), [['Live chat', 'Overdue'], ['WhatsApp', 'Due soon']]);
  const id = s.messages.find(m => m.channel === 'WhatsApp').id;
  execute(s, { type: 'dismiss-sla', id });
});

test('Trigger links in a sent message become absolute, per-contact URLs', () => {
  const s = blank('W');
  const contactId = save(s, 'contacts', { name: 'Ana', phone: '+5511999990000' });
  const linkId = save(s, 'triggerLinks', { name: 'Promo', url: 'https://loja.exemplo.com/promo' });
  const id = execute(s, { type: 'message', data: { contactId, channel: 'WhatsApp', direction: 'Outbound', body: `Veja {{trigger_link.${linkId}}}`, origin: 'https://app.graao.test/x' } }, { workspace: 'demo' });
  const ticket = s.linkTickets.at(-1);
  assert.equal(s.messages.find(m => m.id === id).body, `Veja https://app.graao.test/r/demo/${ticket.id}`);
  assert.deepEqual([ticket.linkId, ticket.contactId, ticket.channel], [linkId, contactId, 'WhatsApp']);
  const relative = execute(s, { type: 'message', data: { contactId, channel: 'Email', direction: 'Outbound', body: `{{trigger_link.${linkId}}}`, origin: 'javascript:alert(1)' } }, { workspace: 'demo' });
  assert.match(s.messages.find(m => m.id === relative).body, /^\/r\/demo\//, 'a bad origin keeps the path relative');
  assert.equal(execute(s, { type: 'link-click', id: ticket.id }), 'https://loja.exemplo.com/promo');
  assert.ok(s.linkTickets.find(t => t.id === ticket.id).clickedAt);
});

test('A WhatsApp manual action waits with the suggested message and resumes the run', () => {
  const s = blank('W');
  const wf = save(s, 'workflows', { name: 'Follow-up', active: true, triggers: [{ type: 'contact_created' }], steps: [
    { type: 'manual_whatsapp', config: { body: 'Oi {{contact.first_name}}, tudo certo com o pedido?' } }, { type: 'add_tag', config: { tag: 'acompanhado' } }] });
  const contactId = save(s, 'contacts', { name: 'Ana Souza', phone: '+5511999990000' });
  const item = s.manualActions.at(-1);
  assert.deepEqual([item.type, item.instructions, item.status], ['Manual WhatsApp', 'Oi Ana, tudo certo com o pedido?', 'Pending']);
  assert.equal(s.runs.find(r => r.workflowId === wf).status, 'Waiting');
  execute(s, { type: 'manual-action', id: item.id, data: { status: 'Completed', note: 'Mensagem enviada pelo WhatsApp.' } });
  assert.ok(s.contacts.find(c => c.id === contactId).tags.includes('acompanhado'));
});
