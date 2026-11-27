import test from 'node:test';
import assert from 'node:assert/strict';
import { platformPage, platformBanner, formatAmount } from '../ui/platform.js';

const h = x => String(x ?? '').replace(/[&<>"']/g, v => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[v]);
const tr = x => x;
const MiB = 1024 * 1024;
const db = (pct, extra = {}) => ({ key: 'db', label: 'Banco', used: pct * 5 * MiB, limit: 500 * MiB, unit: 'bytes', cycle: 'total', pct, level: pct >= 95 ? 'critical' : pct >= 80 ? 'warn' : 'ok', projection: null, ...extra });
const view = (services, extra = {}) => ({
  checkedAt: Date.UTC(2026, 10, 25, 17, 2), services,
  settings: { alertEmail: 'dono@example.test', twilioMinUsd: 10, plans: {}, pushDevices: 0 },
  channels: { email: true, push: false },
  unmonitored: [{ name: 'OpenAI', url: 'https://platform.openai.com/usage' }],
  ...extra
});
const supabase = metrics => ({ service: 'supabase', name: 'Supabase', status: 'ok', plan: 'free', link: 'https://supabase.com/dashboard', metrics });

test('a métrica em 82% aparece com o nível de aviso e a previsão', () => {
  const html = platformPage(view([supabase([db(82, { projection: '2026-12-12' })])]), { h, tr });
  assert.match(html, /82%/);
  assert.match(html, /class="pf-level warn"/);
  assert.match(html, /no ritmo atual: cheio em 12\/12/);
  assert.match(html, /410,0 MB/);
});

test('previsão segura e sem previsão', () => {
  assert.match(platformPage(view([supabase([db(20, { projection: 'safe' })])]), { h, tr }), /não estoura neste ciclo/);
  assert.doesNotMatch(platformPage(view([supabase([db(20)])]), { h, tr }), /ritmo atual|não estoura/);
});

test('serviço não conectado mostra qual variável criar', () => {
  const html = platformPage(view([{ service: 'vercel', name: 'Vercel', status: 'not-configured', plan: '', link: '', metrics: [] }]), { h, tr });
  assert.match(html, /Não conectado/);
  assert.match(html, /VERCEL_API_TOKEN/);
});

test('sem e-mail nem push a página avisa que nenhum canal está ativo', () => {
  const html = platformPage(view([], { channels: { email: false, push: false } }), { h, tr });
  assert.match(html, /Nenhum canal de alerta ativo/);
});

test('e-mail salvo sem envio configurado no servidor explica o que falta', () => {
  const html = platformPage(view([], { channels: { email: false, push: false } }), { h, tr });
  assert.match(html, /RESEND_API_KEY/);
  const blank = view([], { channels: { email: false, push: false } });
  blank.settings.alertEmail = '';
  assert.doesNotMatch(platformPage(blank, { h, tr }), /RESEND_API_KEY/);
});

test('tudo que vem do servidor é escapado', () => {
  const html = platformPage(view([{ service: 'twilio', name: 'Twilio', status: 'error', error: '<script>x</script>', plan: '', link: '', metrics: [] }]), { h, tr });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('a métrica que a API não informa aparece sem barra nem número inventado', () => {
  const html = platformPage(view([supabase([{ key: 'egress', label: 'Tráfego (egress)', used: null, limit: null, unit: 'bytes', cycle: 'month', note: 'a API não informa', pct: null, level: 'ok', projection: null }])]), { h, tr });
  assert.match(html, /a API não informa/);
  assert.doesNotMatch(html, /data-w=/);
});

test('a faixa só aparece com alguma métrica em aviso ou urgente', () => {
  assert.equal(platformBanner(view([supabase([db(50)])]), { h, tr }), '');
  const banner = platformBanner(view([supabase([db(96)])]), { h, tr });
  assert.match(banner, /1 limite perto de estourar/);
  assert.match(banner, /#agency\/plataforma/);
  assert.match(banner, /Supabase · Banco/);
});

test('métrica sem dado não aparece como "Normal"', () => {
  const html = platformPage(view([supabase([{ key: 'mau', label: 'Ativos no mês', used: null, limit: 50000, unit: 'count', cycle: 'month', pct: null, level: 'ok', projection: null }])]), { h, tr });
  assert.doesNotMatch(html, /Normal/);
  assert.match(html, /sem dados/);
});

test('na própria página a faixa não repete o link para a Plataforma', () => {
  const html = platformPage(view([supabase([db(96)])]), { h, tr });
  assert.match(html, /1 limite perto de estourar/);
  assert.doesNotMatch(html, /Ver Plataforma/);
});

test('formatAmount é o mesmo do servidor', () => {
  assert.equal(formatAmount(432013312, 'bytes'), '412,0 MB');
  assert.equal(formatAmount(7.5, 'usd'), 'US$ 7,50');
});

test('verificação aparece como OK ou Pendente, com o motivo', () => {
  const check = (used, note) => ({ key: 'domain', label: 'Domínio do remetente', used, limit: null, unit: 'check', cycle: 'now', kind: 'check', note, pct: null, level: used ? 'ok' : 'warn', projection: null });
  const html = platformPage(view([{ service: 'resend', name: 'Resend', status: 'ok', plan: '', link: '', metrics: [check(1, 'graao.com verificado')] }, { service: 'openai', name: 'OpenAI', status: 'ok', plan: '', link: '', metrics: [check(0, 'chave recusada')] }]), { h, tr });
  assert.match(html, />OK</);
  assert.match(html, /graao\.com verificado/);
  assert.match(html, /pf-level warn">Pendente</);
});
