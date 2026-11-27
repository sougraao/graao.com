// Agent Studio sections around the agents themselves: knowledge bases, workspace templates,
// run logs and AI usage/cost with the monthly spending limit.
import { icon } from './icons.js';
import { h, pageShell } from './screens.js';
import { agentLimits } from './agents-data.js';
import { ask } from './ask.js';
import { tr } from './i18n.js';
import {
  formatTokens, formatUsd, kbLimits, modelPrice, retrieveKnowledge, sourceKinds, usageKinds, usageMonths, usageSummary
} from './ai-data.js';
import { contextCards, toolChips } from './beautiful-ui.js';

const sourceBadges = {
  text: { badge: 'TXT', tone: 'var(--bui-ink-3)' },
  faq: { badge: 'FAQ', tone: 'var(--bui-accent)' },
  url: { badge: 'URL', tone: 'var(--bui-green)' }
};
let probeCards = null;

export const hubTabs = ['knowledge', 'base', 'templates', 'logs', 'usage'];

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const when = iso => (iso ? dateTime.format(new Date(iso)) : '—');
const monthLabel = month => { const text = monthName.format(new Date(`${month}-01T12:00:00Z`)); return text[0].toUpperCase() + text.slice(1); };
const kindLabel = Object.fromEntries(usageKinds);
const runKinds = { test: 'Conversa de teste', build: 'Construtor' };
const filters = { agent: '', kind: '', status: '', query: '' };
const view = { month: '' };

const nav = active => ({
  key: 'ai-hub', label: 'Seções do estúdio de agentes', current: active === 'base' ? 'knowledge' : active,
  items: [
    { value: 'agents', label: 'Agentes', icon: 'spark', href: '#ai-agents' },
    { value: 'knowledge', label: 'Bases de conhecimento', icon: 'book', href: '#ai-agents/knowledge' },
    { value: 'templates', label: 'Modelos', icon: 'copy', href: '#ai-agents/templates' },
    { value: 'logs', label: 'Logs', icon: 'list', href: '#ai-agents/logs' },
    { value: 'usage', label: 'Uso de IA', icon: 'chart', href: '#ai-agents/usage' }
  ]
});

const shell = (active, title, desc, content, cta = '') => pageShell({
  title, desc, cta, className: 'ai-hub', attrs: `data-ai-hub="${active}"`, tabs: nav(active), content
});

const agentName = (agents, id) => agents.find(agent => agent.id === id)?.name || 'Agente excluído';
const empty = (ico, title, text, cta = '') => `<div class="surface empty">${icon(ico, 26)}<strong>${h(title)}</strong><p>${h(text)}</p>${cta}</div>`;

/* ───────────── Knowledge bases ───────────── */

function knowledgeList(s) {
  const bases = s.knowledgeBases || [];
  const cta = `<button class="primary" type="button" data-kb-create ${bases.length >= kbLimits.bases ? 'disabled' : ''}>${icon('plus', 15)} Nova base</button>`;
  const cards = bases.map(base => {
    const users = s.agents.filter(agent => agent.bases?.includes(base.id));
    const chars = base.sources.reduce((sum, source) => sum + source.text.length, 0);
    return `<a class="surface kb-card" href="#ai-agents/base/${encodeURIComponent(base.id)}">
      <span class="kb-card-icon">${icon('book', 18)}</span>
      <b>${h(base.name)}</b>
      <span class="dim">${h(base.description || 'Sem descrição')}</span>
      <span class="kb-card-meta"><span>${base.sources.length} ${base.sources.length === 1 ? 'fonte' : 'fontes'}</span><span>${chars.toLocaleString('pt-BR')} caracteres</span>
        <span>${users.length ? `Usada por ${users.length} ${users.length === 1 ? 'agente' : 'agentes'}` : 'Nenhum agente usa'}</span></span>
      <small class="dim">Atualizada em ${when(base.updated)}</small>
    </a>`;
  }).join('');
  return shell('knowledge', 'Bases de conhecimento',
    'O conteúdo da empresa que os agentes consultam para responder. Cada base pode servir a vários agentes desta subconta.',
    bases.length ? `<div class="kb-grid">${cards}</div>` : empty('book', 'Nenhuma base de conhecimento ainda',
      'Crie uma base com políticas, perguntas frequentes e textos do seu site. Depois conecte a base aos agentes no editor.', cta),
    cta);
}

function sourceRow(source = {}) {
  const kind = source.kind || 'text';
  return `<fieldset class="surface kb-source" data-kb-source data-id="${h(source.id || '')}">
    <div class="kb-source-head">
      <label>Tipo<select name="kind" data-kb-kind>${sourceKinds.map(([id, label]) => `<option value="${id}" ${id === kind ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label class="grow">Título<input name="title" required maxlength="${kbLimits.sourceTitle}" value="${h(source.title)}" placeholder="Ex. Política de trocas"></label>
      <button class="icon-btn" type="button" data-kb-remove-source aria-label="Remover fonte" title="Remover fonte">${icon('trash', 15)}</button>
    </div>
    <label data-kb-only="url" ${kind === 'url' ? '' : 'hidden'}>Endereço da página<input name="url" type="url" maxlength="500" value="${h(source.url)}" placeholder="https://"></label>
    <label data-kb-only="faq" ${kind === 'faq' ? '' : 'hidden'}>Pergunta<input name="question" maxlength="${kbLimits.sourceTitle * 2}" value="${h(source.question)}" placeholder="Ex. Vocês entregam no fim de semana?"></label>
    <label><span data-kb-text-label>${kind === 'faq' ? 'Resposta' : kind === 'url' ? 'Conteúdo da página' : 'Conteúdo'}</span>
      <textarea name="text" required rows="5" maxlength="${kbLimits.sourceText}">${h(source.text)}</textarea></label>
    <small class="dim" data-kb-only="url" ${kind === 'url' ? '' : 'hidden'}>Cole o texto da página. O endereço fica registrado como referência; a página não é lida automaticamente.</small>
  </fieldset>`;
}

function baseEditor(s, id) {
  const base = (s.knowledgeBases || []).find(item => item.id === id);
  if (!base) return shell('base', 'Base não encontrada', '', empty('book', 'Base de conhecimento não encontrada nesta subconta', 'Ela pode ter sido excluída.', '<a class="text-link" href="#ai-agents/knowledge">Voltar às bases</a>'));
  const users = s.agents.filter(agent => agent.bases?.includes(base.id));
  return shell('base', h(base.name), `<a class="text-link" href="#ai-agents/knowledge">${icon('left', 14)} Bases de conhecimento</a>`, `
    <form class="kb-editor" data-kb-form data-id="${h(base.id)}" novalidate>
      <section class="surface kb-meta">
        <label>Nome<input name="name" required maxlength="${kbLimits.name}" value="${h(base.name)}"></label>
        <label>Descrição<textarea name="description" rows="2" maxlength="${kbLimits.description}" placeholder="O que esta base cobre">${h(base.description)}</textarea></label>
        <p class="dim">${users.length ? `Conectada a: ${users.map(agent => h(agent.name)).join(', ')}.` : 'Nenhum agente usa esta base. Conecte-a no editor do agente, em “Bases da subconta”.'}</p>
      </section>
      <div class="kb-sources" data-kb-sources>${base.sources.map(sourceRow).join('')}</div>
      <div class="kb-actions">
        <button class="secondary" type="button" data-kb-add-source>${icon('plus', 15)} Adicionar fonte</button>
        <small class="dim" data-kb-count></small>
      </div>
      <footer class="kb-footer">
        <button class="secondary danger" type="button" data-kb-delete>${icon('trash', 15)} Excluir base</button>
        <span class="form-status" role="status" data-kb-status></span>
        <button class="primary">Salvar base</button>
      </footer>
    </form>
    <section class="surface kb-probe">
      <h2>Testar a busca</h2>
      <p class="dim">Escreva uma pergunta de cliente e veja os trechos que o agente recebe. A busca usa o que está salvo e não chama a IA.</p>
      <form class="kb-probe-form" data-kb-probe><input name="q" maxlength="${agentLimits.message}" placeholder="Ex. Qual o prazo para trocar um produto?" aria-label="Pergunta de teste"><button class="secondary">Buscar</button></form>
      <div data-kb-probe-result></div>
    </section>`);
}

/* ───────────── Templates ───────────── */

function templatesView(s) {
  const templates = s.agentTemplatesCustom || [];
  const agents = s.agents;
  const save = agents.length ? `<form class="surface tpl-save" data-tpl-save>
      <h2>Salvar um agente como modelo</h2>
      <p class="dim">O modelo guarda a configuração e as bases conectadas. Nunca guarda versões publicadas nem a memória sobre pessoas.</p>
      <div class="tpl-save-fields">
        <label>Agente<select name="agent" required>${agents.map(agent => `<option value="${h(agent.id)}">${h(agent.name)}</option>`).join('')}</select></label>
        <label class="grow">Nome do modelo<input name="name" maxlength="${agentLimits.name}" placeholder="Igual ao nome do agente"></label>
        <button class="primary">Salvar modelo</button>
      </div>
      <p class="form-status" role="status" data-tpl-status></p>
    </form>` : '';
  const list = templates.length ? `<div class="kb-grid">${templates.map(template => `<article class="surface kb-card">
      <span class="kb-card-icon">${icon(template.icon || 'spark', 18)}</span>
      <b>${h(template.name)}</b><span class="dim">${h(template.description || 'Sem descrição')}</span>
      <span class="kb-card-meta"><span>${template.triggers.length} ${template.triggers.length === 1 ? 'gatilho' : 'gatilhos'}</span><span>${template.subagents.length} subagentes</span><span>${(template.bases || []).length} bases</span></span>
      <small class="dim">Salvo em ${when(template.created)}</small>
      <div class="tpl-actions"><button class="secondary" type="button" data-tpl-use="${h(template.id)}">${icon('plus', 14)} Criar agente</button>
        <button class="icon-btn" type="button" data-tpl-delete="${h(template.id)}" aria-label="Excluir modelo ${h(template.name)}" title="Excluir modelo">${icon('trash', 15)}</button></div>
    </article>`).join('')}</div>` : empty('copy', 'Nenhum modelo da subconta', 'Salve um agente pronto como modelo para criar outros parecidos. Os modelos prontos da graao continuam na tela inicial do estúdio.');
  return shell('templates', 'Modelos de agente', 'Modelos criados pela sua equipe nesta subconta.', `${save}${list}`);
}

/* ───────────── Logs ───────────── */

function logsView(s) {
  const runs = s.agentRuns || [];
  const query = filters.query.trim().toLowerCase();
  const shown = runs.filter(run => (!filters.agent || run.agent === filters.agent)
    && (!filters.kind || (run.kind || 'test') === filters.kind)
    && (!filters.status || (filters.status === 'error' ? run.error : !run.error))
    && (!query || `${run.input} ${run.output} ${run.error || ''}`.toLowerCase().includes(query)));
  const agentIds = [...new Set(runs.map(run => run.agent))];
  const rows = shown.map(run => `<tr>
      <td>${when(run.at)}</td>
      <td><a class="text-link" href="#ai-agents/agent/${encodeURIComponent(run.agent)}">${h(agentName(s.agents, run.agent))}</a></td>
      <td>${runKinds[run.kind || 'test']}${run.version === 'published' ? ' <span class="badge blue">Publicado</span>' : ''}</td>
      <td><details class="log-detail"><summary>${h(run.input)}</summary>
        ${run.error ? `<p class="log-error">${h(run.error)}</p>` : `<p>${h(run.output)}</p>`}
        ${run.sources?.length ? `<div class="log-tools" data-log-tools="${h(JSON.stringify({ sources: run.sources, model: run.model || '' }))}"><p class="dim">Fontes consultadas: ${run.sources.map(h).join(', ')}</p></div>` : ''}</details></td>
      <td class="log-usage">${run.cost !== undefined ? `<b>${formatUsd(run.cost)}</b>` : '—'}
        <small class="dim">${[run.model, run.inputTokens !== undefined && `${formatTokens(run.inputTokens)} → ${formatTokens(run.outputTokens)} tokens`,
          run.ms !== undefined && `${(run.ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`].filter(Boolean).map(h).join(' · ')}</small></td>
      <td>${run.error ? '<span class="badge pink">Erro</span>' : '<span class="badge green">Concluído</span>'}</td>
    </tr>`).join('');
  const select = (name, label, options) => `<label class="sr-only" for="log-${name}">${label}</label><select id="log-${name}" data-log-filter="${name}">${options}</select>`;
  const toolbar = `<div class="toolbar log-toolbar">
    <label class="search">${icon('search', 15)}<input type="search" data-log-filter="query" value="${h(filters.query)}" placeholder="Buscar nas mensagens" aria-label="Buscar nas mensagens"></label>
    ${select('agent', 'Agente', `<option value="">Todos os agentes</option>${agentIds.map(id => `<option value="${h(id)}" ${filters.agent === id ? 'selected' : ''}>${h(agentName(s.agents, id))}</option>`).join('')}`)}
    ${select('kind', 'Tipo', `<option value="">Todos os tipos</option>${Object.entries(runKinds).map(([id, label]) => `<option value="${id}" ${filters.kind === id ? 'selected' : ''}>${label}</option>`).join('')}`)}
    ${select('status', 'Situação', `<option value="">Todas as situações</option><option value="ok" ${filters.status === 'ok' ? 'selected' : ''}>Concluídas</option><option value="error" ${filters.status === 'error' ? 'selected' : ''}>Com erro</option>`)}
  </div>`;
  const table = runs.length ? `<div class="surface table-shell"><table class="log-table"><thead><tr>${['Data', 'Agente', 'Tipo', 'Mensagem', 'Consumo', 'Situação'].map(col => `<th scope="col">${col}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody></table>${shown.length ? '' : '<p class="empty-row dim">Nenhuma execução com esses filtros.</p>'}</div>`
    : empty('list', 'Nenhuma execução registrada', 'As conversas de teste e os pedidos ao construtor aparecem aqui com modelo, tokens, custo e duração.');
  return shell('logs', 'Logs dos agentes', 'As últimas 100 execuções desta subconta, com modelo, custo, erros e fontes consultadas.', `${runs.length ? toolbar : ''}${table}`);
}

/* ───────────── Usage ───────────── */

function breakdown(title, entries, label) {
  if (!entries.length) return '';
  const max = Math.max(...entries.map(([, totals]) => totals.cost), 0.000001);
  return `<section class="surface usage-block"><h2>${title}</h2><table><thead><tr><th scope="col">${label}</th><th scope="col" class="num">Chamadas</th><th scope="col" class="num">Tokens</th><th scope="col" class="num">Custo</th><th scope="col"><span class="sr-only">Participação</span></th></tr></thead><tbody>
    ${entries.sort((a, b) => b[1].cost - a[1].cost).map(([name, totals]) => `<tr><td>${name}</td><td class="num">${totals.calls}${totals.errors ? ` <small class="dim">(${totals.errors} com erro)</small>` : ''}</td>
      <td class="num">${formatTokens(totals.inputTokens + totals.outputTokens)}</td><td class="num">${formatUsd(totals.cost)}</td>
      <td><span class="usage-bar"><span style="width:${Math.round(totals.cost / max * 100)}%"></span></span></td></tr>`).join('')}
  </tbody></table></section>`;
}

function usageView(s, canLimit) {
  const ai = s.ai || {};
  const months = usageMonths(ai);
  if (!months.includes(view.month)) view.month = months[0];
  const summary = usageSummary(ai, view.month);
  const pct = summary.limit ? Math.min(100, Math.round(summary.cost / summary.limit * 100)) : 0;
  const days = Object.entries(summary.byDay).sort();
  const dayMax = Math.max(...days.map(([, totals]) => totals.cost), 0.000001);
  const unknown = Object.keys(summary.byModel).filter(model => model !== '—' && !modelPrice(model).known);
  const limitForm = canLimit ? `<form class="usage-limit-form" data-usage-limit>
      <label>Limite mensal (US$)<input name="limit" type="number" min="0" max="100000" step="0.01" value="${summary.limit || ''}" placeholder="Sem limite"></label>
      <label>Avisar ao atingir<select name="alertAt">${[0.5, 0.75, 0.8, 0.9, 0.95].map(value => `<option value="${value}" ${Math.abs((ai.alertAt ?? 0.8) - value) < 0.001 ? 'selected' : ''}>${Math.round(value * 100)}%</option>`).join('')}</select></label>
      <button class="secondary">Salvar limite</button><span class="form-status" role="status" data-usage-status></span>
    </form>` : '<p class="dim">Só a agência altera o limite de gastos desta subconta.</p>';
  const notice = summary.blocked ? '<p class="usage-alert blocked" role="alert">O limite mensal foi atingido. Os agentes desta subconta não fazem novas chamadas de IA até o próximo mês ou até o limite aumentar.</p>'
    : summary.warning ? `<p class="usage-alert" role="status">O uso passou de ${Math.round((ai.alertAt ?? 0.8) * 100)}% do limite mensal.</p>` : '';
  const content = `
    <div class="usage-head">
      <label>Mês<select data-usage-month>${months.map(month => `<option value="${month}" ${month === view.month ? 'selected' : ''}>${monthLabel(month)}</option>`).join('')}</select></label>
    </div>
    ${notice}
    <div class="metrics usage-metrics">
      <div class="surface metric"><span>Custo estimado</span><b>${formatUsd(summary.cost)}</b><small class="dim">${summary.limit ? `de ${formatUsd(summary.limit)} no mês` : 'Sem limite mensal'}</small></div>
      <div class="surface metric"><span>Chamadas de IA</span><b>${summary.calls}</b><small class="dim">${summary.errors ? `${summary.errors} com erro` : 'Nenhuma com erro'}</small></div>
      <div class="surface metric"><span>Tokens de entrada</span><b>${formatTokens(summary.inputTokens)}</b></div>
      <div class="surface metric"><span>Tokens de saída</span><b>${formatTokens(summary.outputTokens)}</b></div>
    </div>
    <section class="surface usage-block">
      <h2>Limite de gastos</h2>
      ${summary.limit ? `<div class="usage-meter${summary.blocked ? ' blocked' : summary.warning ? ' warning' : ''}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Uso do limite mensal"><span style="width:${pct}%"></span></div>
        <p class="dim">${pct}% do limite usado · restam ${formatUsd(summary.remaining)}</p>` : '<p class="dim">Sem limite, as chamadas seguem até o saldo do projeto na OpenAI acabar.</p>'}
      ${limitForm}
    </section>
    ${days.length ? `<section class="surface usage-block"><h2>Custo por dia</h2><div class="usage-days" role="img" aria-label="Custo por dia no mês">${days.map(([day, totals]) => `<span class="usage-day" title="${day.slice(8)}/${day.slice(5, 7)}: ${formatUsd(totals.cost)} em ${totals.calls} chamadas"><span style="height:${Math.max(4, Math.round(totals.cost / dayMax * 100))}%"></span><small>${day.slice(8)}</small></span>`).join('')}</div></section>` : ''}
    ${breakdown('Por uso', Object.entries(summary.byKind).map(([kind, totals]) => [h(kindLabel[kind] || kind), totals]), 'Uso')}
    ${breakdown('Por agente', Object.entries(summary.byAgent).map(([id, totals]) => [`<a class="text-link" href="#ai-agents/agent/${encodeURIComponent(id)}">${h(agentName(s.agents, id))}</a>`, totals]), 'Agente')}
    ${breakdown('Por modelo', Object.entries(summary.byModel).map(([model, totals]) => [h(model), totals]), 'Modelo')}
    ${summary.calls ? '' : empty('chart', 'Nenhuma chamada de IA neste mês', 'Conversas de teste e pedidos ao construtor de agentes passam a contar aqui.')}
    <p class="dim usage-note">Custo estimado pelos preços públicos de cada modelo, por milhão de tokens. A fatura da OpenAI é a referência e cobra à parte ferramentas como a pesquisa na web.${unknown.length ? ` Sem preço cadastrado: ${unknown.map(h).join(', ')}.` : ''}</p>`;
  return shell('usage', 'Uso de IA', 'Quanto os agentes desta subconta consomem e quanto custa.', content);
}

export function agentHubScreen(c) {
  const canLimit = !c.access || Boolean(c.access.agency);
  switch (c.tab) {
    case 'base': return baseEditor(c.s, c.agentId);
    case 'templates': return templatesView(c.s);
    case 'logs': return logsView(c.s);
    case 'usage': return usageView(c.s, canLimit);
    default: return knowledgeList(c.s);
  }
}

/* ───────────── Behaviour ───────────── */

export function mountAgentHub({ root, state, request, rerender, createAgent, flash }) {
  const screen = root.dataset.aiHub;
  const fail = (target, error) => { if (target) { target.textContent = error.message; target.dataset.error = ''; } else flash(error.message, true); };

  for (const button of root.querySelectorAll('[data-kb-create]')) {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const { base } = await request('kb-create', { name: tr('Nova base de conhecimento') });
        state().knowledgeBases = [...(state().knowledgeBases || []), base];
        location.hash = `#ai-agents/base/${encodeURIComponent(base.id)}`;
      } catch (error) { fail(null, error); button.disabled = false; }
    });
  }

  if (screen === 'base') {
    const form = root.querySelector('[data-kb-form]');
    if (!form) return;
    const list = form.querySelector('[data-kb-sources]');
    const status = form.querySelector('[data-kb-status]');
    const count = () => {
      const n = list.childElementCount;
      form.querySelector('[data-kb-count]').textContent = `${n} de ${kbLimits.sources} fontes`;
      form.querySelector('[data-kb-add-source]').disabled = n >= kbLimits.sources;
    };
    const read = () => ({
      id: form.dataset.id, name: form.elements.name.value.trim(), description: form.elements.description.value.trim(),
      sources: [...list.children].map(row => {
        const field = name => row.querySelector(`[name=${name}]`).value.trim();
        const kind = field('kind');
        return { id: row.dataset.id || undefined, kind, title: field('title'), text: field('text'),
          ...(kind === 'faq' && { question: field('question') }), ...(kind === 'url' && { url: field('url') }) };
      })
    });
    form.addEventListener('change', event => {
      const select = event.target.closest('[data-kb-kind]');
      if (!select) return;
      const row = select.closest('[data-kb-source]');
      for (const item of row.querySelectorAll('[data-kb-only]')) item.hidden = item.dataset.kbOnly !== select.value;
      row.querySelector('[data-kb-text-label]').textContent = select.value === 'faq' ? 'Resposta' : select.value === 'url' ? 'Conteúdo da página' : 'Conteúdo';
    });
    form.addEventListener('click', event => {
      if (event.target.closest('[data-kb-add-source]')) {
        list.insertAdjacentHTML('beforeend', sourceRow());
        list.lastElementChild.querySelector('[name=title]').focus();
        count();
      }
      const remove = event.target.closest('[data-kb-remove-source]');
      if (remove) { remove.closest('[data-kb-source]').remove(); count(); }
    });
    form.querySelector('[data-kb-delete]').addEventListener('click', async () => {
      const users = state().agents.filter(agent => agent.bases?.includes(form.dataset.id)).length;
      const text = !users ? 'Não dá para desfazer.' : `${users} ${tr(users === 1 ? 'agente deixa de usá-la.' : 'agentes deixam de usá-la.')} ${tr('Não dá para desfazer.')}`;
      if (!await ask(`${tr('Excluir')} “${form.elements.name.value}”?`, { text, ok: 'Excluir' })) return;
      try {
        await request('kb-delete', { id: form.dataset.id });
        const s = state();
        s.knowledgeBases = s.knowledgeBases.filter(base => base.id !== form.dataset.id);
        for (const agent of s.agents) if (agent.bases) agent.bases = agent.bases.filter(id => id !== form.dataset.id);
        location.hash = '#ai-agents/knowledge';
      } catch (error) { fail(status, error); }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      status.textContent = 'Salvando…';
      delete status.dataset.error;
      form.inert = true;
      try {
        const { base } = await request('kb-save', read());
        const s = state();
        s.knowledgeBases = s.knowledgeBases.map(item => (item.id === base.id ? base : item));
        rerender();
        flash('Base de conhecimento salva');
      } catch (error) { fail(status, error); }
      finally { form.inert = false; }
    });
    root.querySelector('[data-kb-probe]')?.addEventListener('submit', event => {
      event.preventDefault();
      const out = root.querySelector('[data-kb-probe-result]');
      const question = event.currentTarget.elements.q.value.trim();
      const draft = read();
      const passages = retrieveKnowledge([{ name: draft.name, sources: draft.sources.filter(source => source.text) }], question);
      probeCards?.destroy();
      probeCards = null;
      if (!passages.length) {
        out.innerHTML = '<p class="dim">Nenhum trecho encontrado. Adicione conteúdo à base.</p>';
        return;
      }
      const kindOf = title => draft.sources.find(source => source.title === title)?.kind || 'text';
      probeCards = contextCards({
        header: 'Trechos que o agente recebe',
        chunks: passages.map(item => ({
          title: item.title || 'Sem título',
          chars: `${item.text.length.toLocaleString('pt-BR')} caracteres`,
          body: item.text,
          source: item.base || draft.name || 'Base de conhecimento',
          ...sourceBadges[kindOf(item.title)]
        }))
      });
      out.replaceChildren(probeCards.el);
    });
    count();
  }

  if (screen === 'templates') {
    const save = root.querySelector('[data-tpl-save]');
    save?.addEventListener('submit', async event => {
      event.preventDefault();
      const out = save.querySelector('[data-tpl-status]');
      try {
        const { template } = await request('template-save', { agent: save.elements.agent.value, name: save.elements.name.value.trim() || undefined });
        state().agentTemplatesCustom = [template, ...(state().agentTemplatesCustom || [])];
        rerender();
        flash('Modelo salvo');
      } catch (error) { fail(out, error); }
    });
    root.addEventListener('click', async event => {
      const use = event.target.closest('[data-tpl-use]');
      const remove = event.target.closest('[data-tpl-delete]');
      if (use) {
        use.disabled = true;
        try { await createAgent(use.dataset.tplUse); } catch (error) { fail(null, error); use.disabled = false; }
      }
      if (remove && await ask('Excluir este modelo?', { text: 'Os agentes criados a partir dele continuam como estão.', ok: 'Excluir' })) {
        try {
          await request('template-delete', { id: remove.dataset.tplDelete });
          state().agentTemplatesCustom = state().agentTemplatesCustom.filter(item => item.id !== remove.dataset.tplDelete);
          rerender();
        } catch (error) { fail(null, error); }
      }
    });
  }

  if (screen === 'logs') {
    // Fontes consultadas viram ToolChips (Beautiful UI): uma linha por base, abre para ver o modelo.
    for (const slot of root.querySelectorAll('[data-log-tools]')) {
      let data;
      try { data = JSON.parse(slot.dataset.logTools); } catch { continue; }
      const steps = data.sources.map(name => ({ icon: 'read', label: 'Consultou', chip: name }));
      if (data.model) steps.push({ icon: 'write', label: 'Respondeu', chip: data.model, mono: true });
      slot.replaceChildren(toolChips({ header: `${data.sources.length} ${data.sources.length === 1 ? 'fonte consultada' : 'fontes consultadas'}`, steps, open: false }).el);
    }
    for (const control of root.querySelectorAll('[data-log-filter]')) {
      control.addEventListener(control.type === 'search' ? 'input' : 'change', () => {
        filters[control.dataset.logFilter] = control.value;
        const focused = control.type === 'search';
        const caret = control.selectionStart;
        rerender();
        if (focused) {
          const next = document.querySelector('[data-log-filter="query"]');
          next?.focus();
          next?.setSelectionRange(caret, caret);
        }
      });
    }
  }

  if (screen === 'usage') {
    root.querySelector('[data-usage-month]')?.addEventListener('change', event => { view.month = event.target.value; rerender(); });
    const limit = root.querySelector('[data-usage-limit]');
    limit?.addEventListener('submit', async event => {
      event.preventDefault();
      const out = limit.querySelector('[data-usage-status]');
      try {
        const alertAt = Number(limit.elements.alertAt.value);
        await request('limit', { limit: Number(limit.elements.limit.value || 0), alertAt });
        const s = state();
        s.ai = { ...(s.ai || { ledger: [] }), limit: Number(limit.elements.limit.value || 0), alertAt };
        rerender();
        flash('Limite de gastos salvo');
      } catch (error) { fail(out, error); }
    });
  }
}
