import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute } from '../model.mjs';
import { briefFields, briefGroups, channels, launchEventPlan, messageTemplates } from '../ui/event-planner-data.js';

test('Launch template mirrors the Parceiras structure', () => {
  const p = launchEventPlan('2026-12-10');
  const count = kind => p.items.filter(row => row.kind === kind).length;
  assert.equal(count('task'), 12);
  assert.equal(count('agenda'), 7);
  assert.equal(count('link'), 13);
  const messages = messageTemplates('2026-12-10');
  assert.equal(messages.filter(m => m.channel === 'grupos').length, 27);
  assert.equal(messages.filter(m => m.channel === 'privado').length, 7);
  assert.equal(count('message'), 34);
  assert.equal(new Set(messages.map(m => m.code)).size, 34);
  const codes = (prefix, total) => Array.from({ length: total }, (_, n) => prefix + String(n + 1).padStart(3, '0'));
  assert.deepEqual(messages.map(m => m.code), [...codes('MCWF', 10), ...codes('MDWF', 9), ...codes('MVWF', 8), ...codes('MCWF1X1-', 3), ...codes('MVWF1X1-', 4)]);
  assert.equal(p.items.find(r => r.title === 'Definir objetivo, metas, narrativa e oferta').date, '2026-11-28');
  assert.ok(Object.values(p.brief).every(Boolean), 'brief inteiro preenchido com marcadores');
});

test('Launch template copy is niche-neutral and uses Graao variables', () => {
  const messages = messageTemplates('2026-12-10');
  const all = messages.map(m => m.notes).join('\n');
  assert.doesNotMatch(all, /\[nome\]|social media|\bposts?\b|cliente pede/i);
  assert.match(messages.filter(m => m.channel === 'privado').map(m => m.notes).join(''), /\{\{contact\.first_name\}\}/);
  assert.doesNotMatch(messages.filter(m => m.channel === 'grupos').map(m => m.notes).join(''), /\{\{contact\./);
  assert.match(all, /10 de dez\. de 2026/);
  assert.doesNotMatch(all, /\[data do evento\]/);
  assert.doesNotMatch(all, /R\$|https?:|\bjess|black|conselho|\bhead\b|high ticket/i, 'sem nomes, preços, links ou marcas da campanha de origem');
  assert.doesNotMatch(all, /\bsegunda\b|segundou|ter[cç]a|\bquarta\b|\bquinta\b|sext(a|ou)|s[aá]bad|domingo/i, 'a data é relativa: nada de dia da semana');
});

test('Launch template passes server-side validation', () => {
  const state = blank();
  execute(state, { type: 'save', key: 'eventPlans', id: '', data: { title: 'Lançamento', eventDate: '2026-12-10', plan: launchEventPlan('2026-12-10') } });
  const saved = state.eventPlans[0].plan.items;
  assert.equal(saved.length, 66);
  assert.equal(saved.find(r => r.code === 'MCWF001').time, '18:00');
  assert.ok(saved.filter(r => r.kind === 'agenda').every(r => r.time && r.duration > 0), 'roteiro com horário para a agenda');
});

test('Brief groups cover every brief field once', () => {
  assert.deepEqual(briefGroups.map(([key]) => key), ['direction', 'communication', 'operation']);
  assert.deepEqual(briefGroups.flatMap(([, , fields]) => fields.map(([k]) => k)).sort(), ['audience', 'followup', 'goal', 'identity', 'logistics', 'narrative', 'offer']);
  assert.deepEqual(briefFields.map(([k]) => k), briefGroups.flatMap(([, , fields]) => fields.map(([k]) => k)));
  assert.equal(channels.find(([id]) => id === 'grupos')[1], 'WhatsApp · grupos');
});

test('Launch messages say which groups they go to and follow the sheet schedule', () => {
  const messages = messageTemplates('2026-11-12');
  const of = prefix => messages.filter(m => m.code.startsWith(prefix) && m.channel === 'grupos');
  assert.ok(of('MCWF').every(m => m.audience === 'base') && of('MCWF').length === 10);
  assert.ok([...of('MDWF'), ...of('MVWF')].every(m => m.audience === 'evento'));
  assert.ok(messages.filter(m => m.channel === 'privado').every(m => m.audience === ''));
  const slot = code => { const m = messages.find(row => row.code === code); return [m.offset, m.time]; };
  assert.deepEqual(['MCWF001', 'MDWF006', 'MVWF002', 'MVWF007', 'MVWF008', 'MVWF1X1-004'].map(slot), [[-9, '18:00'], [0, '19:30'], [0, '22:30'], [4, '12:00'], [5, '12:00'], [11, '12:00']]);
  const state = blank();
  execute(state, { type: 'save', key: 'eventPlans', id: '', data: { title: 'L', eventDate: '2026-11-12', plan: launchEventPlan('2026-11-12') } });
  assert.equal(state.eventPlans[0].plan.items.find(r => r.code === 'MCWF003').audience, 'base');
  assert.throws(() => execute(state, { type: 'save', key: 'eventPlans', id: '', data: { title: 'M', plan: { brief: {}, items: [{ kind: 'message', title: 'x', audience: 'todos' }] } } }), /grupo de destino/);
});
