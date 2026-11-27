import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_LIMITS, levelOf, projectFull, decideAlerts } from '../platform-limits.mjs';
import { formatAmount } from '../ui/platform-format.js';

const DAY = 86_400_000, HOUR = 3_600_000;
const m = (used, extra = {}) => ({ key: 'db', label: 'Banco', used, limit: 100, unit: 'count', cycle: 'total', ...extra });
const S = (used, extra) => [{ service: 'supabase', name: 'Supabase', status: 'ok', plan: 'free', link: '', metrics: [m(used, extra)] }];
const fail = (service, error = 'HTTP 401') => [{ service, name: service, status: 'error', error, plan: '', link: '', metrics: [] }];
const empty = () => ({ metrics: {}, failures: {} });

test('PLAN_LIMITS traz os limites do Supabase Free e da Vercel Hobby', () => {
  assert.equal(PLAN_LIMITS.supabase.free.db, 524288000);
  assert.equal(PLAN_LIMITS.supabase.free.mau, 50000);
  assert.equal(PLAN_LIMITS.vercel.hobby.deploys24h, 100);
  assert.equal(PLAN_LIMITS.cloudflare.free.r2ClassA, 1000000);
});

test('levelOf: 80% avisa, 95% é urgente e só volta ao normal abaixo de 75%', () => {
  assert.equal(levelOf(m(79)), 'ok');
  assert.equal(levelOf(m(80)), 'warn');
  assert.equal(levelOf(m(95)), 'critical');
  assert.equal(levelOf(m(77), 'warn'), 'warn');
  assert.equal(levelOf(m(77), 'critical'), 'warn');
  assert.equal(levelOf(m(74), 'warn'), 'ok');
  assert.equal(levelOf(m(null)), 'ok');
  assert.equal(levelOf(m(50, { limit: null })), 'ok');
});

test('levelOf: saldo mínimo (floor) e vencimento (deadline)', () => {
  assert.equal(levelOf(m(9, { kind: 'floor', limit: 10 })), 'warn');
  assert.equal(levelOf(m(4, { kind: 'floor', limit: 10 })), 'critical');
  assert.equal(levelOf(m(12, { kind: 'floor', limit: 10 })), 'ok');
  assert.equal(levelOf(m(15, { kind: 'deadline', limit: 0 })), 'warn');
  assert.equal(levelOf(m(3, { kind: 'deadline', limit: 0 })), 'critical');
  assert.equal(levelOf(m(30, { kind: 'deadline', limit: 0 })), 'ok');
});

test('projectFull: acumulado crescendo 1 por dia enche 44 dias depois', () => {
  const last = Date.UTC(2026, 10, 20, 12);
  const points = [0, 1, 2, 3, 4, 5, 6].map(d => [last - (6 - d) * DAY, 50 + d]);
  assert.equal(projectFull(points, m(56), last), new Date(last + 44 * DAY).toISOString().slice(0, 10));
});

test('projectFull: constante é seguro e poucos pontos não preveem', () => {
  const now = Date.UTC(2026, 10, 20, 12);
  assert.equal(projectFull([0, 1, 2, 3].map(d => [now - d * DAY, 50]), m(50), now), 'safe');
  assert.equal(projectFull([[now - DAY, 40], [now, 50]], m(50), now), null);
  assert.equal(projectFull([0, 1, 2].map(d => [now - d * DAY, 50]), m(50, { cycle: 'day24h' }), now), null);
});

test('projectFull: pontos com mais de 7 dias ficam de fora', () => {
  const now = Date.UTC(2026, 10, 20, 12);
  const old = [20, 19, 18].map(d => [now - d * DAY, d * 5]);
  const recent = [2, 1, 0].map(d => [now - d * DAY, 50]);
  assert.equal(projectFull([...old, ...recent], m(50), now), 'safe');
});

test('projectFull: métrica mensal estoura dentro do mês ou é segura até o fim dele', () => {
  const now = Date.UTC(2026, 10, 28, 12);
  const fast = [22, 23, 24, 25, 26, 27, 28].map((d, i) => [Date.UTC(2026, 10, d, 12), 30 + i * 10]);
  assert.match(projectFull(fast, m(90, { cycle: 'month' }), now), /^2026-11-/);
  const start = Date.UTC(2026, 11, 1, 12);
  const slow = [0, 6, 12].map(h => [Date.UTC(2026, 11, 1, h), 49.5 + h / 24]);
  assert.equal(projectFull(slow, m(50, { cycle: 'month' }), start), 'safe');
});

test('projectFull: pontos do mês anterior não entram na previsão mensal', () => {
  const now = Date.UTC(2026, 11, 1, 12);
  const points = [[Date.UTC(2026, 10, 29), 10], [Date.UTC(2026, 10, 30), 99], [Date.UTC(2026, 11, 1, 0), 1], [Date.UTC(2026, 11, 1, 12), 1]];
  assert.equal(projectFull(points, m(1, { cycle: 'month' }), now), null);
});

test('decideAlerts: métrica oscilando em volta de 80% gera um único aviso', () => {
  let state = empty(), total = [];
  const start = Date.UTC(2026, 10, 20);
  [79, 81, 79, 81].forEach((used, i) => {
    const { next, alerts } = decideAlerts(state, S(used), start + i * HOUR);
    state = next; total = total.concat(alerts);
  });
  assert.equal(total.length, 1);
  assert.equal(total[0].level, 'warn');
  assert.equal(total[0].service, 'supabase');
  assert.match(total[0].title, /Supabase: Banco em 81%/);
});

test('decideAlerts: subir de aviso para urgente avisa de novo', () => {
  const at = Date.UTC(2026, 10, 20);
  const first = decideAlerts(empty(), S(81), at);
  const second = decideAlerts(first.next, S(96), at + HOUR);
  assert.deepEqual(second.alerts.map(a => a.level), ['critical']);
});

test('decideAlerts: urgente repete só depois de 24 horas', () => {
  const at = Date.UTC(2026, 10, 20);
  const first = decideAlerts(empty(), S(96), at);
  assert.equal(first.alerts.length, 1);
  const later = decideAlerts(first.next, S(96), at + 23 * HOUR);
  assert.equal(later.alerts.length, 0);
  const reminder = decideAlerts(later.next, S(96), at + 24 * HOUR);
  assert.deepEqual(reminder.alerts.map(a => a.level), ['critical']);
});

test('decideAlerts: urgente oscilando entre 96% e 94% avisa uma vez em 24 horas', () => {
  let state = empty(), sent = 0;
  for (let hour = 0; hour < 24; hour++) {
    const { next, alerts } = decideAlerts(state, S(hour % 2 ? 94 : 96), hour * HOUR);
    sent += alerts.length;
    state = next;
  }
  assert.equal(sent, 1);
  const { alerts } = decideAlerts(state, S(96), 24 * HOUR);
  assert.equal(alerts.length, 1);
});

test('decideAlerts: leitura sem valor mantém o nível e não gera aviso repetido', () => {
  let state = empty(), sent = 0;
  for (let hour = 0; hour < 24; hour++) {
    const { next, alerts } = decideAlerts(state, S(hour % 2 ? null : 85), hour * HOUR);
    sent += alerts.length;
    state = next;
  }
  assert.equal(sent, 1);
  assert.equal(state.metrics['supabase.db'].level, 'warn');
});

test('decideAlerts: o texto traz a previsão quando a métrica tem uma', () => {
  const { alerts } = decideAlerts(empty(), S(82, { projection: '2026-12-12' }), Date.UTC(2026, 10, 20));
  assert.match(alerts[0].body, /No ritmo atual, enche em 12\/12/);
  assert.match(alerts[0].body, /\/app#agency\/plataforma/);
});

test('decideAlerts: 3 falhas seguidas avisam uma vez; Evolution avisa na 2ª', () => {
  let state = empty(); const sent = [];
  for (let i = 0; i < 4; i++) {
    const { next, alerts } = decideAlerts(state, fail('vercel'), i * HOUR);
    state = next; sent.push(alerts.length);
  }
  assert.deepEqual(sent, [0, 0, 1, 0]);
  assert.match(decideAlerts(empty(), fail('vercel'), 0).next.failures.vercel === 1 ? 'ok' : '', /ok/);
  let evo = empty(); const evoSent = [];
  for (let i = 0; i < 2; i++) {
    const { next, alerts } = decideAlerts(evo, fail('evolution', 'tempo esgotado'), i * HOUR);
    evo = next; evoSent.push(alerts);
  }
  assert.equal(evoSent[1].length, 1);
  assert.equal(evoSent[1][0].level, 'failure');
  assert.match(evoSent[1][0].body, /tempo esgotado/);
});

test('decideAlerts: leitura ok zera as falhas e "não configurado" nunca avisa', () => {
  let state = empty();
  state = decideAlerts(state, fail('vercel'), 0).next;
  state = decideAlerts(state, fail('vercel'), HOUR).next;
  const ok = [{ service: 'vercel', name: 'Vercel', status: 'ok', plan: 'hobby', link: '', metrics: [] }];
  assert.equal(decideAlerts(state, ok, 2 * HOUR).next.failures.vercel, 0);
  let off = empty(); let count = 0;
  for (let i = 0; i < 5; i++) {
    const r = decideAlerts(off, [{ service: 'hostinger', name: 'Hostinger', status: 'not-configured', plan: '', link: '', metrics: [] }], i * HOUR);
    off = r.next; count += r.alerts.length;
  }
  assert.equal(count, 0);
});

test('formatAmount: bytes, dólares, contagens e dias em português', () => {
  assert.equal(formatAmount(432013312, 'bytes'), '412,0 MB');
  assert.equal(formatAmount(10737418240, 'bytes'), '10,0 GB');
  assert.equal(formatAmount(7.5, 'usd'), 'US$ 7,50');
  assert.equal(formatAmount(50000, 'count'), '50.000');
  assert.equal(formatAmount(12, 'days'), '12 dias');
  assert.equal(formatAmount(61, 'percent'), '61%');
  assert.equal(formatAmount(null, 'bytes'), '—');
});

test('verificação: OK não avisa; pendente pede atenção e o alerta traz o motivo', () => {
  assert.equal(levelOf({ kind: 'check', used: 1, limit: null }), 'ok');
  assert.equal(levelOf({ kind: 'check', used: 0, limit: null }), 'warn');
  const reading = { service: 'resend', name: 'Resend', status: 'ok', metrics: [{ key: 'domain', label: 'Domínio do remetente', used: 0, limit: null, unit: 'check', cycle: 'now', kind: 'check', note: 'graao.com: pending' }] };
  const { alerts } = decideAlerts({}, [reading], Date.UTC(2026, 10, 26));
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].title, 'Resend: Domínio do remetente (graao.com: pending)');
  assert.doesNotMatch(alerts[0].body, /NaN|undefined/);
});
