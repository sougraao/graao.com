// Reputação → SEO e Visibilidade na IA (6b.8). SEO: the site, the tracked keywords with their Google Search Console
// positions, "almost there" searches and the site audits with a tip for each problem. Visibility AI: whether ChatGPT
// (with web search) names the brand when customers ask, its position among the competitors and the cited pages.
import { icon } from './icons.js';
import { h } from './screens.js';

const search = { workspace: '', loading: false, data: null, error: '' };
const busy = { audit: false, run: false };
let env = null;
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const when = iso => (iso ? dateFormat.format(new Date(iso)) : '—');
const day = iso => iso ? iso.split('-').reverse().join('/') : '';
const num = n => new Intl.NumberFormat('pt-BR').format(n || 0);
const dec = n => n === null || n === undefined ? '—' : String(n).replace('.', ',');
const pill = (text, tone = '') => `<span class="badge ${tone}">${h(text)}</span>`;
const metric = (label, value, note = '') => `<div class="surface metric"><span>${label}</span><b>${value}</b>${note ? `<small class="dim">${note}</small>` : ''}</div>`;
const tone = score => score >= 80 ? 'green' : score >= 50 ? 'blue' : 'pink';
const lines = list => (list || []).join('\n');

async function loadSearch(c, fresh = false) {
  const workspace = c.workspace;
  Object.assign(search, { workspace, loading: true, error: '' });
  try {
    const data = await env.api(env.url('/api/seo/search') + (fresh ? '&fresh=1' : ''));
    if (search.workspace === workspace) search.data = data;
  } catch (error) {
    if (search.workspace === workspace) Object.assign(search, { data: null, error: error.message });
  } finally {
    if (search.workspace === workspace) { search.loading = false; if (c.view === 'reputation' && c.tab === 'seo') env.render(); }
  }
}

function change(k) {
  if (k.change === null || k.change === undefined) return k.position === null ? '' : pill('Nova', 'blue');
  if (Math.abs(k.change) < 0.1) return '<span class="dim">=</span>';
  return k.change > 0 ? `<span class="seo-up" title="Subiu ${dec(k.change)} posições">▲ ${dec(k.change)}</span>` : `<span class="seo-down" title="Caiu ${dec(-k.change)} posições">▼ ${dec(-k.change)}</span>`;
}

function searchCard(c) {
  const d = search.data;
  const head = `<div class="seo-head"><h2>Posições no Google</h2>${d?.report ? `<button type="button" class="secondary" data-seo="refresh"${search.loading ? ' disabled' : ''}>${icon('refresh', 15)} Atualizar</button>` : ''}</div>`;
  if (search.loading && !d) return `<section class="surface padded">${head}<p class="dim">Lendo o Search Console…</p></section>`;
  if (search.error) return `<section class="surface padded">${head}<p class="form-status">${h(search.error)}</p><button type="button" class="secondary" data-seo="refresh">Tentar de novo</button></section>`;
  if (!d) return `<section class="surface padded">${head}</section>`;
  const google = '<a class="secondary" href="#settings/google">Abrir Configurações → Google</a>';
  if (!d.connected) return `<section class="surface padded">${head}<p class="dim">${d.configured === false ? 'A conexão com o Google ainda não foi configurada nesta instalação.' : 'Conecte a conta Google que tem acesso ao Google Search Console deste site para ver cliques, impressões e a posição média de cada palavra-chave.'}</p>${d.configured === false ? '' : google}</section>`;
  if (!d.site) return `<section class="surface padded">${head}<p class="dim">${d.error ? h(d.error) + ' Conecte a conta de novo para liberar o Search Console.' : d.sites ? 'Escolha o site do Search Console desta subconta.' : 'Nenhum site do Search Console foi encontrado nesta conta Google. Adicione e verifique o site no Search Console, ou conecte outra conta.'}</p>${google}</section>`;
  if (d.error) return `<section class="surface padded">${head}<p class="form-status">${h(d.error)}</p>${google}</section>`;
  const r = d.report, tracked = c.s.seo?.keywords || [];
  const kwRows = r.keywords.map(k => `<tr><td><b>${h(k.keyword)}</b></td><td>${k.position === null ? '<span class="dim">Sem impressões</span>' : dec(k.position)}</td><td>${change(k)}</td><td>${num(k.clicks)}</td><td>${num(k.impressions)}</td></tr>`).join('');
  const table = (rows, empty) => rows.length ? `<div class="table-shell"><table><thead><tr><th scope="col">Pesquisa</th><th scope="col">Posição</th><th scope="col">Cliques</th><th scope="col">Impressões</th><th scope="col">CTR</th></tr></thead><tbody>
    ${rows.map(k => `<tr><td>${h(k.keyword)}</td><td>${dec(k.position)}</td><td>${num(k.clicks)}</td><td>${num(k.impressions)}</td><td>${dec(k.ctr)}%</td></tr>`).join('')}</tbody></table></div>` : `<p class="dim">${empty}</p>`;
  return `<section class="surface padded seo-search">${head}
    <p class="dim">${h(d.siteName || d.site)} · de ${day(r.range.start)} a ${day(r.range.end)} (o Google leva uns 3 dias para fechar os dados)</p>
    <div class="metrics seo-metrics">${metric('Cliques', num(r.totals.clicks))}${metric('Impressões', num(r.totals.impressions))}${metric('CTR médio', `${dec(r.totals.ctr)}%`)}${metric('Posição média', dec(r.totals.position))}</div>
    <h3>Palavras-chave acompanhadas</h3>
    ${tracked.length ? `<div class="table-shell"><table><thead><tr><th scope="col">Palavra-chave</th><th scope="col">Posição</th><th scope="col">Nos 28 dias anteriores</th><th scope="col">Cliques</th><th scope="col">Impressões</th></tr></thead><tbody>${kwRows}</tbody></table></div>` : '<p class="dim">Adicione palavras-chave acima para acompanhar a posição de cada uma.</p>'}
    <h3>Quase na primeira página</h3><p class="dim">Pesquisas em que o site aparece entre a 4ª e a 20ª posição. Melhorar a página certa para elas costuma trazer cliques rápido.</p>
    ${table(r.opportunities, 'Nenhuma pesquisa entre a 4ª e a 20ª posição no período.')}
    <details class="seo-more"><summary>Pesquisas que mais trazem cliques</summary>${table(r.top, 'Sem pesquisas no período.')}</details></section>`;
}

function auditCard(c) {
  const audits = c.s.seoAudits || [], a = audits[0];
  const head = `<div class="seo-head"><h2>Auditoria do site</h2><button type="button" class="${a ? 'secondary' : 'primary'}" data-seo="audit"${busy.audit ? ' disabled' : ''}>${icon('search', 15)} ${busy.audit ? 'Auditando…' : 'Auditar agora'}</button></div>`;
  if (!a) return `<section class="surface padded">${head}<p class="dim">A auditoria abre a página inicial do site e confere título, descrição, títulos, celular, indexação, sitemap, segurança, LGPD e velocidade. Leva até um minuto.</p></section>`;
  const parts = [['performance', 'Velocidade'], ['seo', 'SEO'], ['security', 'Segurança'], ['compliance', 'Conformidade']];
  return `<section class="surface padded seo-audit">${head}
    ${a.reachable ? `<div class="seo-score"><b class="seo-score-n ${tone(a.score)}">${a.score}</b><div><span>Saúde do site</span><small class="dim">${h(a.url)} · ${when(a.at)}${a.speed?.source === 'estimate' ? ' · velocidade estimada pelo tempo de resposta' : ''}</small></div></div>
    <div class="seo-parts">${parts.map(([key, label]) => `<div><span>${label}</span><span class="rp-bar"><span style="width:${a.parts[key] ?? 0}%"></span></span><b>${a.parts[key] ?? '—'}</b></div>`).join('')}</div>
    <h3>${a.issues.length ? `${a.issues.length} ${a.issues.length === 1 ? 'ponto para corrigir' : 'pontos para corrigir'}` : 'Nada para corrigir na página inicial'}</h3>
    <ul class="seo-issues">${a.issues.map(item => `<li><div><b>${h(item.label)}</b>${item.detail ? ` <span class="dim">· ${h(item.detail)}</span>` : ''} ${pill(item.group)}</div>${item.tip ? `<p>${h(item.tip)}</p>` : ''}</li>`).join('')}</ul>`
    : `<p class="form-status">O site não abriu na última auditoria (${h(a.url)}${a.status ? `, código ${a.status}` : ''}).</p>`}
    ${audits.length > 1 ? `<details class="seo-more"><summary>Auditorias anteriores</summary><ul class="seo-history">${audits.slice(1).map(row => `<li><span>${when(row.at)}</span>${pill(row.reachable ? String(row.score) : 'Fora do ar', row.reachable ? tone(row.score) : 'pink')}</li>`).join('')}</ul></details>` : ''}
  </section>`;
}

export function seoContent(c) {
  if (search.workspace !== c.workspace && !search.loading) queueMicrotask(() => loadSearch(c));
  const seo = c.s.seo || {};
  return `<form class="surface settings-form set-form" data-seo-form="settings"><section class="set-section"><header class="set-head"><h2>Site e palavras-chave</h2><p class="dim">O site que a auditoria abre e as pesquisas que você quer acompanhar.</p></header><div class="set-body"><label>Endereço do site<input name="siteUrl" value="${h(seo.siteUrl || '')}" placeholder="https://suaempresa.com.br" maxlength="300"></label>
      <label>Palavras-chave para acompanhar (uma por linha, até 50)<textarea name="keywords" rows="4" placeholder="dentista em curitiba&#10;clareamento dental">${h(lines(seo.keywords))}</textarea></label></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Salvar</button></footer></form>
    ${searchCard(c)}${auditCard(c)}`;
}

function visibilityForm(c, inline = false) {
  const v = c.s.visibility || {};
  const brand = v.brand || c.s.profile?.name || '';
  const domain = v.domain || (c.s.seo?.siteUrl || '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
  const intro = inline ? '<section class="set-section"><header class="set-head"><h2>Sua marca aparece quando perguntam à IA?</h2><p class="dim">Cada vez mais clientes perguntam ao ChatGPT “qual o melhor…” em vez de pesquisar no Google. Cadastre a marca, os concorrentes e as perguntas que seus clientes fazem: o graao pergunta ao ChatGPT com busca na web, mostra quem ele recomenda, em que posição a sua marca aparece e quais páginas ele usou como fonte.</p></header><div class="set-body">' : '';
  return `<form class="${inline ? 'surface settings-form set-form' : 'settings-form'}" data-seo-form="visibility">${intro}
    <div class="field-grid"><label>Nome da marca<input name="brand" required maxlength="120" value="${h(brand)}"></label><label>Site (domínio)<input name="domain" maxlength="200" value="${h(domain)}" placeholder="suaempresa.com.br"></label></div>
    <label>Outros nomes da marca (separe por vírgula)<input name="aliases" maxlength="600" value="${h((v.aliases || []).join(', '))}" placeholder="Ex.: apelido, nome antigo"></label>
    <label>Concorrentes (um por linha: nome | site)<textarea name="competitors" rows="4" placeholder="Dental Prime | dentalprime.com.br&#10;OdontoMais">${h((v.competitors || []).map(row => row.domain ? `${row.name} | ${row.domain}` : row.name).join('\n'))}</textarea></label>
    <label>Perguntas que os clientes fazem à IA (uma por linha, até 10)<textarea name="prompts" rows="6" placeholder="Qual o melhor dentista em Curitiba?&#10;Onde fazer clareamento dental em Curitiba?">${h(lines(v.prompts))}</textarea></label>
    <p class="dim">Escreva como um cliente perguntaria, com o serviço e a cidade. Cada pergunta usa uma busca na web da OpenAI, cobrada à parte do uso de tokens.</p>
    ${inline ? '</div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Salvar</button></footer>' : '<div class="tx-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary">Salvar</button></div><p class="form-status" role="alert"></p>'}</form>`;
}

export function visibilityContent(c) {
  const v = c.s.visibility || {}, runs = c.s.visibilityRuns || [], r = runs[0];
  if (!v.brand) return visibilityForm(c, true);
  const bar = `<div class="seo-head"><p class="dim">${h(v.brand)} · ${v.prompts.length} ${v.prompts.length === 1 ? 'pergunta' : 'perguntas'} · ${v.competitors.length} ${v.competitors.length === 1 ? 'concorrente' : 'concorrentes'}</p><div class="inline-gap"><button type="button" class="secondary" data-seo="visibility-edit">${icon('edit', 15)} Configurar</button><button type="button" class="primary" data-seo="run"${busy.run ? ' disabled' : ''}>${icon('spark', 15)} ${busy.run ? 'Perguntando à IA…' : 'Medir agora'}</button></div></div>`;
  if (!r) return `${bar}<section class="surface padded"><p class="dim">Nenhuma medição ainda. “Medir agora” faz as ${v.prompts.length} perguntas ao ChatGPT; leva de 30 segundos a 2 minutos.</p></section>`;
  const max = Math.max(1, ...r.share.map(row => row.mentions));
  return `${bar}
    <div class="metrics seo-metrics">${metric('Citada nas respostas', `${r.mentionRate}%`, `${r.mentioned} de ${r.prompts} ${r.prompts === 1 ? 'pergunta' : 'perguntas'}`)}${metric('Posição média', r.avgPosition === null ? '—' : `${dec(r.avgPosition)}º`, 'entre a marca e os concorrentes citados')}${metric('Site usado como fonte', r.cited, r.cited === 1 ? 'resposta' : 'respostas')}${metric('Última medição', when(r.at), r.failed ? `${r.failed} sem resposta` : 'ChatGPT com busca na web')}</div>
    <div class="rp-two"><section class="surface padded"><h2>Presença nas respostas</h2><p class="dim">Em quantas respostas cada nome aparece (no texto ou como fonte).</p><div class="seo-share">${r.share.map(row => `<div class="${row.brand ? 'is-brand' : ''}"><span>${h(row.name)}</span><span class="rp-bar"><span style="width:${Math.round(row.mentions / max * 100)}%"></span></span><b>${row.mentions}</b></div>`).join('')}</div></section>
      <section class="surface padded"><h2>Histórico</h2>${runs.length > 1 ? `<ul class="seo-history">${runs.slice(0, 12).map(row => `<li><span>${when(row.at)}</span><span>${row.mentionRate}% citada${row.avgPosition ? ` · ${dec(row.avgPosition)}º` : ''}</span></li>`).join('')}</ul>` : '<p class="dim">Meça de novo nas próximas semanas para ver a tendência. As respostas da IA variam um pouco a cada pergunta, então compare várias medições.</p>'}</section></div>
    <section class="surface padded"><h2>Respostas</h2><ul class="seo-answers">${r.results.map(row => `<li><details><summary><span class="seo-q">${h(row.prompt)}</span>${row.error ? pill('Sem resposta', 'pink') : row.mentioned ? pill(row.position ? `Citada · ${row.position}º` : 'Citada', 'green') : pill('Não citada')}${row.cited ? pill('Fonte', 'blue') : ''}${row.competitors.length ? `<small class="dim">Concorrentes: ${h(row.competitors.join(', '))}</small>` : ''}</summary>
      ${row.error ? `<p class="form-status">${h(row.error)}</p>` : `<p class="seo-answer">${h(row.answer).replace(/\n/g, '<br>')}</p>${row.sources.length ? `<p class="dim">Fontes:</p><ul class="seo-sources">${row.sources.map(s => `<li><a href="${h(s.url)}" target="_blank" rel="noopener noreferrer">${h(s.title || s.url)}</a></li>`).join('')}</ul>` : ''}`}</details></li>`).join('')}</ul></section>`;
}

export function installSeo({ c, api, url, mutate, flash, dialog, close, render }) {
  env = { api, url, render };
  const here = () => c.view === 'reputation' && ['seo', 'visibility'].includes(c.tab);
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-seo]');
    if (!el || !here()) return;
    const act = el.dataset.seo;
    try {
      if (act === 'refresh') await loadSearch(c, true);
      if (act === 'visibility-edit') dialog('Visibilidade na IA', visibilityForm(c));
      if (act === 'audit') {
        busy.audit = true; render();
        try { const result = await api(url('/api/seo/audit'), {}); if (result.ok) { const fresh = await api(url('/api/state')); c.s = fresh.state; flash('Auditoria pronta.'); } }
        finally { busy.audit = false; render(); }
      }
      if (act === 'run') {
        busy.run = true; render();
        try {
          const lang = document.documentElement.lang === 'es' ? '&lang=es' : '';
          const result = await api(url('/api/visibility/run') + lang, {});
          const fresh = await api(url('/api/state')); c.s = fresh.state;
          flash(result.failed ? `Medição pronta. ${result.failed} pergunta(s) ficaram sem resposta.` : 'Medição pronta.');
        } finally { busy.run = false; render(); }
      }
    } catch (error) { flash(error.message, true); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-seo-form]');
    if (!form || !here()) return;
    event.preventDefault();
    const f = new FormData(form), status = form.querySelector('.form-status');
    try {
      if (form.dataset.seoForm === 'settings') {
        await mutate({ type: 'seo-settings', data: { siteUrl: f.get('siteUrl'), keywords: String(f.get('keywords') || '').split('\n') } });
        render(); flash('SEO salvo.'); loadSearch(c);
      }
      if (form.dataset.seoForm === 'visibility') {
        const competitors = String(f.get('competitors') || '').split('\n').map(line => { const [name, domain = ''] = line.split('|'); return { name: name.trim(), domain: domain.trim() }; }).filter(row => row.name);
        await mutate({ type: 'visibility-settings', data: { brand: f.get('brand'), domain: f.get('domain'), aliases: String(f.get('aliases') || '').split(','), competitors, prompts: String(f.get('prompts') || '').split('\n') } });
        if (form.closest('dialog, .modal, [role="dialog"]')) close();
        render(); flash('Visibilidade na IA salva.');
      }
    } catch (error) { if (status) status.textContent = error.message; else flash(error.message, true); }
  });
}
