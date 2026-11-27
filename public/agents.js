import { icon } from './icons.js';
import { approvalCard, loadingState, taskRows, thinkingState } from './beautiful-ui.js';
import { promptBar, streamingText } from './beautiful-ui-more.js';
import { h } from './screens.js';
import {
  agentDraft, agentFieldNames, agentIcons, agentLimits, agentResources, agentRevision, agentTemplates, changedAgentFields,
  memoryKinds, triggerGroups, triggerLabel, triggerType, triggerTypes
} from './agents-data.js';
import { agentHubScreen, hubTabs } from './agent-hub.js';
import { kbLimits } from './ai-data.js';

const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
const dayFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
const fullFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const agentLink = id => `#ai-agents/agent/${encodeURIComponent(id)}`;
const editLink = id => `#ai-agents/edit/${encodeURIComponent(id)}`;
const normalized = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// View state that survives re-renders of the screen.
const listState = { query: '', folder: '', sort: 'updated' };
const chats = new Map();
const builderLogs = new Map();
const view = { side: 'activity', memory: 'person', focusDescribe: false };
let workspaceBases = [];

function tone(text) {
  let sum = 0;
  for (const char of String(text)) sum = (sum * 31 + char.codePointAt(0)) % 997;
  return sum % 6;
}

function avatar(agent, size = 18) {
  const draft = agentDraft(agent);
  return `<span class="agent-avatar tone-${tone(agent.id || draft.name)}" aria-hidden="true">${icon(draft.icon, size)}</span>`;
}

function status(agent) {
  if (!agent.published) return ['draft', 'Rascunho'];
  return changedAgentFields(agent).length ? ['changed', `Versão ${agent.published.version} publicada · alterações no rascunho`] : ['live', `Publicado · versão ${agent.published.version}`];
}

const statusDot = agent => {
  const [state, label] = status(agent);
  return `<span class="status-dot ${state}" title="${h(label)}"><span class="sr-only">${h(label)}</span></span>`;
};

function when(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return dayFormat.format(date) === dayFormat.format(new Date()) ? timeFormat.format(date) : dayFormat.format(date);
}

function triggerChips(triggers, removable = false) {
  return triggers.map((trigger, index) => `<span class="agent-chip">${icon(triggerType(trigger.type)?.icon || 'bolt', 13)}${h(triggerLabel(trigger))}${
    removable ? `<button type="button" class="chip-remove" data-remove-trigger="${index}" aria-label="Remover gatilho ${h(triggerLabel(trigger))}">${icon('close', 12)}</button>` : ''}</span>`).join('');
}

function resourceChips(resources) {
  return agentResources.filter(([key]) => resources?.[key]).map(([, label, , ico]) => `<span class="agent-chip quiet">${icon(ico, 13)}${h(label)}</span>`).join('');
}

/* ───────────── Studio: list, home, chat and side panel ───────────── */

function visibleAgents(agents) {
  const query = normalized(listState.query.trim());
  const list = agents.filter(agent => {
    const draft = agentDraft(agent);
    return (!listState.folder || agent.folder === listState.folder) && normalized(`${draft.name} ${draft.description}`).includes(query);
  });
  return list.sort(listState.sort === 'name'
    ? (a, b) => a.name.localeCompare(b.name, 'pt-BR')
    : (a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
}

function listItems(agents, selectedId) {
  const list = visibleAgents(agents);
  if (!agents.length) return `<div class="ags-empty">${icon('spark', 20)}<b>Nenhum agente ainda</b><p>Crie o primeiro a partir de uma descrição ou de um modelo.</p></div>`;
  if (!list.length) return `<div class="ags-empty"><b>Nenhum agente encontrado</b><p>Mude a busca ou a pasta.</p></div>`;
  return list.map(agent => {
    const draft = agentDraft(agent);
    return `<a class="ags-item" href="${agentLink(agent.id)}" ${agent.id === selectedId ? 'aria-current="page"' : ''}>
      ${avatar(agent, 16)}
      <span class="ags-item-text"><span class="ags-item-top"><b>${h(draft.name)}</b><time datetime="${h(agent.updated || agent.created)}">${when(agent.updated || agent.created)}</time></span>
        <span class="ags-item-desc">${h(draft.description || draft.instructions)}</span></span>
      ${statusDot(agent)}</a>`;
  }).join('');
}

function listPane(agents, selectedId) {
  const folders = [...new Set(agents.map(agent => agent.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (listState.folder && !folders.includes(listState.folder)) listState.folder = '';
  return `<aside class="ags-list" aria-label="Agentes">
    <header class="ags-list-head"><h1>Agentes <span class="ags-count">${agents.length}</span></h1>
      <button class="ags-new" type="button" data-agent-new aria-label="Criar agente" title="Criar agente">${icon('plus', 17)}</button></header>
    <label class="search ags-search">${icon('search', 15)}<input type="search" data-agent-query value="${h(listState.query)}" placeholder="Buscar agentes" aria-label="Buscar agentes"></label>
    <div class="ags-filters">
      <select data-agent-folder aria-label="Filtrar por pasta"><option value="">Todas as pastas</option>${folders.map(folder => `<option ${folder === listState.folder ? 'selected' : ''}>${h(folder)}</option>`).join('')}</select>
      <select data-agent-sort aria-label="Ordenar agentes"><option value="updated">Atualizados recentemente</option><option value="name" ${listState.sort === 'name' ? 'selected' : ''}>Nome (A–Z)</option></select>
    </div>
    <nav class="ags-items" data-agent-items aria-label="Lista de agentes">${listItems(agents, selectedId)}</nav>
    <nav class="ags-hub-links" aria-label="Mais do estúdio">
      <a href="#ai-agents/knowledge">${icon('book', 15)} Bases de conhecimento</a>
      <a href="#ai-agents/templates">${icon('copy', 15)} Modelos</a>
      <a href="#ai-agents/logs">${icon('list', 15)} Logs</a>
      <a href="#ai-agents/usage">${icon('chart', 15)} Uso de IA</a>
    </nav>
  </aside>`;
}

function templateCard(template) {
  const triggers = template.triggers.slice(0, 1);
  const extra = template.triggers.length - triggers.length + agentResources.filter(([key]) => template.resources?.[key]).length;
  const first = agentResources.find(([key]) => template.resources?.[key]);
  return `<button type="button" class="ags-template" data-agent-template="${h(template.id)}">
    ${avatar(template, 18)}<b>${h(template.name)}</b><span class="dim">${h(template.description)}</span>
    <span class="ags-template-chips">${triggerChips(triggers)}${first ? resourceChips({ [first[0]]: true }) : ''}${extra - (first ? 1 : 0) > 0 ? `<span class="agent-chip quiet">+${extra - (first ? 1 : 0)}</span>` : ''}</span>
  </button>`;
}

function homeMain(model, custom = []) {
  return `<div class="ags-home">
    <div class="ags-hero">
      <span class="ags-hero-icon">${icon('spark', 22)}</span>
      <h2>Crie seu próprio agente</h2>
      <p class="dim">Descreva o que o agente deve fazer ou comece por um modelo.</p>
      <form class="ags-describe" data-agent-describe>
        <label class="sr-only" for="agent-describe">O que o agente deve fazer</label>
        <textarea id="agent-describe" name="description" rows="2" maxlength="${agentLimits.request}" required placeholder="Descreva o que o seu agente deve fazer…"></textarea>
        <button class="ags-send" aria-label="Criar agente com esta descrição">${icon('arrow', 17)}</button>
      </form>
      <button type="button" class="text-link ags-guide-link" data-agent-guide-open>${icon('spark', 14)} Prefere responder a algumas perguntas?</button>
      <div class="ags-guide" data-agent-guide hidden></div>
      <p class="form-status" role="status" data-describe-status></p>
      ${model ? '' : '<p class="ags-note">Sem uma chave da OpenAI conectada, a descrição vira o rascunho das instruções. <a class="text-link" href="#agency/settings/openai">Conectar a OpenAI</a></p>'}
    </div>
    <div class="ags-or"><span>ou</span></div>
    <h3 class="ags-section-title">Comece por um caso de uso</h3>
    <p class="dim ags-section-text">Gatilhos e recursos já configurados. Edite o que quiser depois de escolher.</p>
    ${custom.length ? `<h3 class="ags-section-title">Modelos da subconta</h3><div class="ags-templates">${custom.map(templateCard).join('')}</div>
    <h3 class="ags-section-title">Modelos do graao</h3>` : ''}
    <div class="ags-templates">${agentTemplates.map(templateCard).join('')}</div>
  </div>`;
}

const chatKey = (workspace, id) => `${workspace}:${id}`;

function chatMain(agent, model, chat) {
  const draft = agentDraft(agent);
  const bubbles = chat.log.map(entry => bubble(entry, draft.name)).join('');
  return `<div class="ags-chat">
    <div class="ags-chat-bar">
      ${agent.published ? `<div class="ags-version" role="group" aria-label="Versão em teste">
        <button type="button" data-chat-version="draft" aria-pressed="${chat.version === 'draft'}">Rascunho</button>
        <button type="button" data-chat-version="published" aria-pressed="${chat.version === 'published'}">Versão ${h(agent.published.version)}</button></div>` : '<span></span>'}
      <button class="secondary ags-small" type="button" data-agent-reset>${icon('plus', 14)} Nova conversa</button>
    </div>
    <div class="ags-transcript" role="log" aria-label="Conversa com o agente" data-agent-transcript>
      <div class="ags-intro">
        ${avatar(agent, 22)}
        <span class="ags-name-pill">${h(draft.name)} ${statusDot(agent)}</span>
        ${draft.description ? `<p>${h(draft.description)}</p>` : ''}
        <div class="ags-runs-when"><span class="ags-label">Executa quando</span>${triggerChips(draft.triggers)}
          <a class="agent-chip add" href="${editLink(agent.id)}">${icon('plus', 13)} Adicionar gatilho</a></div>
      </div>
      ${bubbles}
    </div>
    <div class="ags-composer has-prompt" data-agent-test>
      <span class="ags-test-chip">${chat.version === 'published' ? `Versão ${h(agent.published?.version)}` : 'Modo de teste'}</span>
    </div>
    <p class="form-status ags-chat-status${model ? '' : ' info'}" role="status" data-agent-test-status>${model ? '' : 'Conecte uma chave da OpenAI em Visão da agência → Configurações → OpenAI para conversar com o agente.'}</p>
  </div>`;
}

function bubble(entry, name) {
  return `<div class="agent-bubble ${entry.role}"><strong>${entry.role === 'user' ? 'Você' : h(name)}</strong><p>${h(entry.content)}</p></div>`;
}

// Mensagens prontas para testar o agente pelo “/” do PromptBar.
const TEST_COMMANDS = [
  { key: 'oi', name: '/oi', desc: 'Primeiro contato', text: 'Olá! Tudo bem? Queria saber mais sobre vocês.' },
  { key: 'preco', name: '/preco', desc: 'Pergunta de preço', text: 'Quanto custa o serviço de vocês?' },
  { key: 'horario', name: '/horario', desc: 'Horário de atendimento', text: 'Qual é o horário de atendimento?' },
  { key: 'agendar', name: '/agendar', desc: 'Pedido de horário', text: 'Quero agendar um horário para esta semana.' },
  { key: 'humano', name: '/humano', desc: 'Pedido de atendente', text: 'Prefiro falar com uma pessoa, pode me transferir?' },
  { key: 'reclamacao', name: '/reclamacao', desc: 'Cliente insatisfeito', text: 'Estou insatisfeito, meu pedido atrasou e ninguém me respondeu.' }
];

const runDetails = run => [
  run.model && { label: 'Modelo', meta: run.model },
  (run.inputTokens || run.outputTokens) && { label: 'Tokens', meta: `${run.inputTokens || 0} → ${run.outputTokens || 0}` },
  run.ms > 0 && { label: 'Duração', meta: `${(run.ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s` },
  run.sources?.length && { label: 'Fontes consultadas', meta: String(run.sources.length) },
  { label: run.error ? 'Erro' : 'Resposta', meta: (run.error || run.output || '').slice(0, 48) + ((run.error || run.output || '').length > 48 ? '…' : '') }
].filter(Boolean);

function activityPanel(agent, runs) {
  const list = runs.filter(run => run.agent === agent.id).slice(0, 30);
  if (!list.length) return '<div class="ags-side-empty"><b>Nenhuma atividade ainda</b><p>Cada conversa de teste fica registrada aqui.</p></div>';
  // TaskRows (Beautiful UI) é montado em mountStudio sobre este marcador.
  return `<div class="ags-runs-bui" data-agent-runs="${h(agent.id)}"></div>`;
}

function mountActivity(root, agent, runs) {
  const slot = root.querySelector('[data-agent-runs]');
  if (!slot) return;
  const list = runs.filter(run => run.agent === agent.id).slice(0, 30);
  slot.replaceChildren(taskRows({
    list: true,
    labels: { done: 'Concluída', failed: 'Erro' },
    rows: list.map((run, i) => ({
      key: `${run.at}-${i}`,
      label: run.input || '(sem mensagem)',
      amount: `${run.version === 'published' ? 'Publicada' : 'Rascunho'} · ${fullFormat.format(new Date(run.at))}`,
      status: run.error ? 'failed' : 'done',
      details: runDetails(run)
    }))
  }).el);
}

function approvalsPanel(agent) {
  const on = agentDraft(agent).resources.approval;
  return `<div class="ags-side-empty">${icon('check', 20)}<b>Nada aguardando você</b>
    <p>${on ? 'Com Pedir aprovação ligado, o agente mostra o rascunho na conversa e só segue depois do seu sim.'
      : 'Pedir aprovação está desligado. Ligue o recurso para o agente esperar o seu sim antes de enviar ou alterar algo.'}</p>
    ${on ? '' : `<a class="text-link" href="${editLink(agent.id)}">Abrir recursos</a>`}</div>`;
}

function memoryPanel(agent) {
  const on = agentDraft(agent).resources.memory;
  const memory = agent.memory || [];
  const list = memory.filter(item => item.kind === view.memory);
  return `<div class="ags-memory">
    <div class="ags-memory-head"><b>O que este agente lembra</b><span class="badge ${on ? 'green' : ''}">${on ? 'Ligada' : 'Desligada'}</span></div>
    ${on ? '' : `<p class="dim">O agente só usa estas memórias com o recurso Memória ligado. <a class="text-link" href="${editLink(agent.id)}">Ligar</a></p>`}
    <div class="ags-version" role="group" aria-label="Tipo de memória">${memoryKinds.map(([kind, label]) => `<button type="button" data-memory-kind="${kind}" aria-pressed="${view.memory === kind}">${label} <span>${memory.filter(item => item.kind === kind).length}</span></button>`).join('')}</div>
    ${list.length ? `<ul class="ags-memory-list">${list.map(item => `<li><p>${h(item.text)}</p><button type="button" class="icon-btn" data-memory-remove="${h(item.id)}" aria-label="Remover memória">${icon('trash', 15)}</button></li>`).join('')}</ul>`
      : `<div class="ags-side-empty">${icon('book', 20)}<b>Nenhuma memória ainda</b><p>${view.memory === 'person' ? 'Adicione fatos sobre quem conversa, como preferências e combinados.' : 'Adicione procedimentos que o agente deve seguir, como “confirmar o CEP antes do frete”.'}</p></div>`}
    <form class="ags-memory-add" data-memory-add>
      <label class="sr-only" for="agent-memory-text">Nova memória</label>
      <input id="agent-memory-text" name="text" maxlength="${agentLimits.memoryText}" required placeholder="${view.memory === 'person' ? 'Ex. A Ana prefere contato por e-mail' : 'Ex. Sempre confirmar o endereço'}">
      <button class="secondary ags-small" ${memory.length >= agentLimits.memory ? 'disabled' : ''}>Adicionar</button>
      <p class="form-status" role="alert"></p>
    </form>
  </div>`;
}

function sidePane(agent, runs) {
  const draft = agentDraft(agent);
  const changes = changedAgentFields(agent);
  const publishLabel = !agent.published ? 'Publicar' : changes.length ? 'Publicar alterações' : 'Publicado';
  const tabs = [['activity', 'Atividade', 'list'], ['approvals', 'Aprovações', 'check'], ['memory', 'Memória', 'book']];
  return `<aside class="ags-side" aria-label="Detalhes do agente">
    <div class="ags-side-head">
      ${avatar(agent, 26)}
      <h2>${h(draft.name)}</h2>
      <p class="ags-side-status">${statusDot(agent)} ${h(status(agent)[1])}</p>
      <div class="ags-side-actions">
        <button class="primary" type="button" data-agent-action="publish" ${agent.published && !changes.length ? 'disabled' : ''}>${publishLabel}</button>
        <div class="ags-menu">
          <button class="icon-btn" type="button" data-agent-menu aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações">${icon('dots', 18)}</button>
          <div class="ags-menu-list" role="menu" hidden>
            <a role="menuitem" href="${editLink(agent.id)}">${icon('edit', 15)} Editar agente</a>
            <button role="menuitem" type="button" data-agent-move>${icon('folder', 15)} Mover para pasta</button>
            ${agent.published ? `<button role="menuitem" type="button" data-agent-action="unpublish">${icon('close', 15)} Despublicar</button>` : ''}
            <button role="menuitem" type="button" class="danger-item" data-agent-confirm-delete>${icon('trash', 15)} Excluir agente</button>
          </div>
        </div>
      </div>
      <p class="form-status" role="alert" data-agent-side-status></p>
    </div>
    <div class="ags-side-block">
      <div class="ags-side-row"><span class="ags-label">Executa quando</span><a class="text-link" href="${editLink(agent.id)}">Editar agente</a></div>
      <div class="ags-chips">${triggerChips(draft.triggers)}</div>
      ${resourceChips(draft.resources) ? `<div class="ags-chips">${resourceChips(draft.resources)}</div>` : ''}
      ${agent.folder ? `<p class="dim ags-folder">${icon('folder', 14)} ${h(agent.folder)}</p>` : ''}
    </div>
    <div class="ags-tabs" role="tablist" aria-label="Painéis do agente">${tabs.map(([key, label, ico]) => `<button type="button" role="tab" id="agent-tab-${key}" aria-controls="agent-panel-${key}" aria-selected="${view.side === key}" data-side-tab="${key}">${icon(ico, 15)} ${label}</button>`).join('')}</div>
    <div class="ags-panel" role="tabpanel" id="agent-panel-activity" aria-labelledby="agent-tab-activity" ${view.side === 'activity' ? '' : 'hidden'}>${activityPanel(agent, runs)}</div>
    <div class="ags-panel" role="tabpanel" id="agent-panel-approvals" aria-labelledby="agent-tab-approvals" ${view.side === 'approvals' ? '' : 'hidden'}>${approvalsPanel(agent)}</div>
    <div class="ags-panel" role="tabpanel" id="agent-panel-memory" aria-labelledby="agent-tab-memory" data-memory-panel ${view.side === 'memory' ? '' : 'hidden'}>${memoryPanel(agent)}</div>
  </aside>
  <dialog class="agent-dialog" data-agent-delete-dialog aria-labelledby="agent-delete-title"><header><h2 id="agent-delete-title">Excluir agente?</h2></header>
    <div class="modal-body"><p>O rascunho, a versão publicada, a memória e a atividade de <b>${h(draft.name)}</b> serão removidos.</p></div>
    <footer><button class="secondary" type="button" data-dialog-close>Cancelar</button><button type="button" class="danger" data-agent-action="delete">Excluir agente</button></footer></dialog>
  <dialog class="agent-dialog" data-agent-move-dialog aria-labelledby="agent-move-title"><form data-agent-move-form><header><h2 id="agent-move-title">Mover para pasta</h2></header>
    <div class="modal-body"><label>Pasta<input name="folder" maxlength="${agentLimits.folder}" list="agent-folder-list" value="${h(agent.folder || '')}" placeholder="Ex. Atendimento"></label>
      <p class="dim">Deixe em branco para tirar o agente da pasta.</p><p class="form-status" role="alert"></p></div>
    <footer><button class="secondary" type="button" data-dialog-close>Cancelar</button><button class="primary">Mover</button></footer></form></dialog>`;
}

function studioView(c, selected) {
  const agents = c.s.agents;
  const model = c.features?.agentModel;
  const folders = [...new Set(agents.map(agent => agent.folder).filter(Boolean))];
  let main = homeMain(model, c.s.agentTemplatesCustom || []);
  if (selected) {
    const key = chatKey(c.workspace, selected.id);
    if (!chats.has(key)) chats.set(key, { version: 'draft', messages: [], log: [], config: '' });
    const chat = chats.get(key);
    if (chat.version === 'published' && !selected.published) Object.assign(chat, { version: 'draft', messages: [], log: [], config: '' });
    main = chatMain(selected, model, chat);
  } else if (c.tab === 'agent') {
    main = '<div class="ags-home"><div class="ags-side-empty"><b>Agente não encontrado nesta subconta</b><a class="text-link" href="#ai-agents">Voltar ao estúdio</a></div></div>';
  }
  return `<div class="agent-studio ${selected ? 'has-agent' : ''}" data-agent-screen="studio" data-studio-agent="${h(selected?.id || '')}">
    ${listPane(agents, selected?.id)}
    <section class="ags-main" aria-label="${selected ? 'Conversa com o agente' : 'Criar agente'}">${main}</section>
    ${selected ? sidePane(selected, c.s.agentRuns || []) : ''}
    <datalist id="agent-folder-list">${folders.map(folder => `<option value="${h(folder)}">`).join('')}</datalist>
  </div>`;
}

/* ───────────── Editor ───────────── */

function sourceFields(source = {}) {
  return `<fieldset class="agent-source">
    <legend>Fonte de conhecimento</legend>
    <label>Título<input name="sourceTitle" required maxlength="${agentLimits.sourceName}" value="${h(source.title)}"></label>
    <label>Conteúdo<textarea name="sourceText" required rows="4" maxlength="${agentLimits.sourceText}">${h(source.text)}</textarea></label>
    <button class="secondary ags-small" type="button" data-agent-remove-source>${icon('trash', 14)} Remover fonte</button>
  </fieldset>`;
}

function subagentFields(item = {}, open = false) {
  return `<details class="agent-subagent" ${open ? 'open' : ''}>
    <summary><span class="agent-subagent-dot" aria-hidden="true"></span><b data-subagent-title>${h(item.name || 'Novo subagente')}</b><span class="dim">Especialista</span>${icon('chevron', 15)}</summary>
    <div class="agent-subagent-body">
      <label>Nome<input name="subName" required maxlength="${agentLimits.subagentName}" value="${h(item.name)}" placeholder="Ex. Pesquisador de marca"></label>
      <label>Quando chamar<textarea name="subWhen" required rows="2" maxlength="${agentLimits.subagentWhen}" placeholder="Quando precisar de…">${h(item.when)}</textarea></label>
      <label>Instruções<textarea name="subInstructions" required rows="4" maxlength="${agentLimits.subagentInstructions}">${h(item.instructions)}</textarea></label>
      <button class="secondary ags-small" type="button" data-remove-subagent>${icon('trash', 14)} Remover subagente</button>
    </div>
  </details>`;
}

function configFields(agent) {
  const draft = agentDraft(agent);
  return `<div class="editor-identity">
      <details class="icon-picker">
        <summary aria-label="Escolher ícone do agente">${avatar(agent, 24)}<span class="icon-picker-edit">${icon('edit', 12)}</span></summary>
        <div class="icon-grid" role="radiogroup" aria-label="Ícone do agente">${agentIcons.map(name => `<label class="icon-choice"><input type="radio" name="icon" value="${name}" ${draft.icon === name ? 'checked' : ''}><span>${icon(name, 18)}</span><span class="sr-only">${name}</span></label>`).join('')}</div>
      </details>
      <div class="editor-identity-text">
        <label class="sr-only" for="agent-name">Nome do agente</label>
        <input id="agent-name" class="editor-name" name="name" required maxlength="${agentLimits.name}" value="${h(draft.name)}">
        <label class="sr-only" for="agent-description">Descrição</label>
        <textarea id="agent-description" class="editor-description" name="description" rows="3" maxlength="${agentLimits.description}" placeholder="Descreva em uma ou duas frases o que o agente faz.">${h(draft.description)}</textarea>
      </div>
    </div>
    <div class="editor-rows">
      <div class="editor-row"><span class="editor-label">Gatilhos</span><div class="editor-value">
        <div class="ags-chips" data-agent-triggers>${triggerChips(draft.triggers, true)}</div>
        <button type="button" class="editor-add" data-agent-add-trigger>${icon('plus', 14)} Adicionar gatilho</button>
        <small class="dim">Os gatilhos ficam registrados na configuração. Por enquanto, o agente conversa no chat do estúdio.</small></div></div>
      <div class="editor-row"><span class="editor-label">Subagentes</span><div class="editor-value">
        <div class="agent-subagents" data-agent-subagents>${draft.subagents.map(item => subagentFields(item)).join('')}</div>
        <button type="button" class="editor-add" data-agent-add-subagent>${icon('plus', 14)} Adicionar subagente</button></div></div>
      <div class="editor-row"><span class="editor-label">Recursos</span><div class="editor-value editor-resources">
        ${agentResources.map(([key, label, text, ico]) => `<label class="resource-toggle"><span class="resource-icon">${icon(ico, 15)}</span>
          <span class="resource-text"><b>${label}</b><small>${text}</small></span>
          <input type="checkbox" role="switch" name="res-${key}" ${draft.resources[key] ? 'checked' : ''}></label>`).join('')}</div></div>
      <div class="editor-row"><span class="editor-label">Fontes do agente</span><div class="editor-value">
        <div class="agent-sources" data-agent-sources>${draft.knowledge.map(sourceFields).join('')}</div>
        <button type="button" class="editor-add" data-agent-add-source>${icon('plus', 14)} Adicionar fonte</button>
        <small class="dim" data-agent-source-count></small></div></div>
      <div class="editor-row"><span class="editor-label">Bases da subconta</span><div class="editor-value editor-bases">
        ${workspaceBases.length ? workspaceBases.map(base => `<label class="resource-toggle"><span class="resource-icon">${icon('book', 15)}</span>
          <span class="resource-text"><b>${h(base.name)}</b><small>${base.sources.length} ${base.sources.length === 1 ? 'fonte' : 'fontes'}${base.description ? ` · ${h(base.description)}` : ''}</small></span>
          <input type="checkbox" name="kb" value="${h(base.id)}" ${draft.bases.includes(base.id) ? 'checked' : ''}></label>`).join('')
          : '<small class="dim">Nenhuma base criada nesta subconta.</small>'}
        <small class="dim">O agente recebe só os trechos ligados a cada pergunta, até ${kbLimits.agentBases} bases. <a class="text-link" href="#ai-agents/knowledge">Gerenciar bases</a></small></div></div>
      <div class="editor-row stacked"><label class="editor-label" for="agent-instructions">Instruções</label><div class="editor-value">
        <textarea id="agent-instructions" name="instructions" required rows="18" maxlength="${agentLimits.instructions}">${h(draft.instructions)}</textarea>
        <small class="dim" data-agent-count></small></div></div>
    </div>`;
}

function builderEntries(log) {
  if (!log.length) return `<div class="builder-empty">${icon('chat', 20)}<b>Edite este agente pelo chat</b>
    <p>Descreva o que quer mudar e o construtor atualiza a configuração ao lado.</p>
    <p class="dim">Experimente “Adicione um gatilho para formulários enviados” ou “Deixe o tom mais descontraído”.</p></div>`;
  // Fio no estilo do ChatComposer (Beautiful UI): pedido à direita, resposta do construtor em seção.
  return log.map(entry => entry.role === 'user'
    ? `<div class="bui-chat-user"><div class="bui-chat-bubble">${h(entry.content)}</div></div>`
    : `<div class="bui-chat-reply${entry.error ? ' is-error' : ''}"><div class="bui-chat-meta"><b>Construtor</b><span>${entry.error ? 'Não aplicado' : 'Configuração atualizada'}</span></div><p>${h(entry.content)}</p></div>`).join('');
}

function editorView(agent, model, workspace) {
  const log = builderLogs.get(chatKey(workspace, agent.id)) || [];
  return `<div class="agent-editor" data-agent-screen="editor" data-agent-id="${h(agent.id)}">
    <header class="editor-bar">
      <a class="editor-back" href="${agentLink(agent.id)}">${icon('left', 16)} Voltar</a>
      <div class="editor-bar-actions"><span role="status" data-agent-save-status>Rascunho salvo</span>
        <a class="secondary" href="${agentLink(agent.id)}">${icon('chat', 15)} Testar agente</a>
        <button class="primary" type="button" data-agent-action="publish">Publicar</button></div>
    </header>
    <div class="editor-grid">
      <section class="editor-builder" aria-label="Construtor por chat">
        <div class="builder-log" role="log" data-builder-log>${builderEntries(log)}</div>
        <form class="ags-composer builder-form" data-agent-build>
          <label class="sr-only" for="agent-build-request">O que mudar no agente</label>
          <textarea id="agent-build-request" name="request" rows="2" maxlength="${agentLimits.request}" placeholder="Descreva o que quer mudar no agente…" ${model ? '' : 'disabled'}></textarea>
          <button aria-label="Aplicar pedido" ${model ? '' : 'disabled'}>${icon('arrow', 16)}</button>
        </form>
        <p class="form-status builder-status${model ? '' : ' info'}" role="status" data-agent-build-status>${model ? '' : 'Conecte uma chave da OpenAI em Visão da agência → Configurações → OpenAI para editar pelo chat. A configuração ao lado continua editável.'}</p>
      </section>
      <form id="agent-draft" class="editor-config" novalidate>${configFields(agent)}</form>
    </div>
    <dialog class="agent-dialog trigger-picker" data-trigger-picker aria-labelledby="trigger-picker-title">
      <header><h2 id="trigger-picker-title">Adicionar gatilho</h2><button type="button" class="icon-btn" data-dialog-close aria-label="Fechar">${icon('close', 17)}</button></header>
      <div class="picker-body">
        <label class="search picker-search">${icon('search', 15)}<input type="search" data-trigger-query placeholder="Buscar gatilhos…" aria-label="Buscar gatilhos"></label>
        <div class="picker-groups" role="group" aria-label="Categorias"><button type="button" data-trigger-group="" aria-pressed="true">Todos</button>${triggerGroups.map(([key, label]) => `<button type="button" data-trigger-group="${key}" aria-pressed="false">${label}</button>`).join('')}</div>
        <div class="picker-list" data-trigger-list></div>
        <form class="picker-value" data-trigger-value hidden></form>
      </div>
    </dialog>
  </div>`;
}

export function agentsScreen(c) {
  const agents = c.s.agents;
  workspaceBases = c.s.knowledgeBases || [];
  if (hubTabs.includes(c.tab)) return agentHubScreen(c);
  if (c.tab === 'edit') {
    const agent = agents.find(item => item.id === c.agentId);
    return agent ? editorView(agent, c.features?.agentModel, c.workspace)
      : '<div class="page"><a class="text-link" href="#ai-agents">← Estúdio de agentes</a><div class="surface empty"><strong>Agente não encontrado nesta subconta</strong></div></div>';
  }
  return studioView(c, c.tab === 'agent' ? agents.find(item => item.id === c.agentId) : null);
}

/* ───────────── Behaviour ───────────── */

function dialogBackdropClose(dialog) {
  let down = null;
  dialog.addEventListener('mousedown', event => { down = event.target; });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog || down !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (event.clientY < r.top || event.clientY > r.bottom || event.clientX < r.left || event.clientX > r.right) dialog.close();
  });
}

function autoGrow(textarea, max = 180) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight + 2, max)}px`;
}

export function mountAgentScreen(options) {
  if (options.root.dataset.agentScreen === 'editor') return mountEditor({ ...options, agent: options.startAgent });
  return mountStudio(options);
}

function mountStudio({ root, workspace, model = '', startAgent, request, updateAgent, addRun, refresh, agents, runs = () => [] }) {
  const get = selector => root.querySelector(selector);
  let agent = startAgent && root.dataset.studioAgent === startAgent.id ? startAgent : null;
  let busy = false;
  if (agent) mountActivity(root, agent, runs());

  const items = get('[data-agent-items]');
  const refreshList = () => { items.innerHTML = listItems(agents(), agent?.id); };
  get('[data-agent-query]').addEventListener('input', event => { listState.query = event.target.value; refreshList(); });
  get('[data-agent-folder]').addEventListener('change', event => { listState.folder = event.target.value; refreshList(); });
  get('[data-agent-sort]').addEventListener('change', event => { listState.sort = event.target.value; refreshList(); });
  for (const dialog of root.querySelectorAll('dialog')) dialogBackdropClose(dialog);

  const describe = get('[data-agent-describe]');
  if (describe) {
    const field = describe.elements.description;
    field.addEventListener('input', () => autoGrow(field));
    field.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); describe.requestSubmit(); }
    });
    if (view.focusDescribe) { view.focusDescribe = false; field.focus(); }
    describe.addEventListener('submit', async event => {
      event.preventDefault();
      const text = field.value.trim();
      const note = get('[data-describe-status]');
      if (!text || busy) return;
      busy = true;
      describe.inert = true;
      note.classList.remove('confirmed');
      note.textContent = model ? 'Montando o agente…' : 'Criando o rascunho…';
      try {
        const name = model ? 'Novo agente' : text.split(/\s+/).slice(0, 6).join(' ').slice(0, agentLimits.name).replace(/[.,;:]$/, '');
        const { agent: created } = await request('create', model ? { name } : { name, description: text.slice(0, agentLimits.description), instructions: text });
        updateAgent(created.id, created, false);
        const log = [{ role: 'user', content: text }];
        builderLogs.set(chatKey(workspace, created.id), log);
        if (model) {
          try {
            const result = await request('build', { id: created.id, revision: created.revision, request: text });
            updateAgent(created.id, result.agent, false);
            log.push({ role: 'assistant', content: result.summary });
          } catch (error) {
            log.push({ role: 'assistant', content: `Criei o rascunho, mas o construtor falhou: ${error.message}`, error: true });
          }
        } else {
          log.push({ role: 'assistant', content: 'Criei um rascunho com a sua descrição nas instruções. Ajuste a configuração ao lado.' });
        }
        location.hash = editLink(created.id);
      } catch (error) {
        note.textContent = error.message;
      } finally {
        busy = false;
        describe.inert = false;
      }
    });
  }

  // Roteiro de perguntas (ApprovalCard) que monta a descrição do agente.
  const guideOpen = get('[data-agent-guide-open]');
  const guide = get('[data-agent-guide]');
  if (guideOpen && guide && describe) guideOpen.addEventListener('click', () => {
    guideOpen.hidden = true;
    guide.hidden = false;
    const card = approvalCard({
      labels: { send: 'Montar agente', skip: 'Pular' },
      questions: [
        { q: 'O que o agente vai fazer?', type: 'radio', options: ['Atender clientes e tirar dúvidas', 'Qualificar leads e passar para vendas', 'Agendar horários', 'Recuperar clientes inativos'] },
        { q: 'Por onde ele vai conversar?', type: 'check', options: ['WhatsApp', 'Instagram', 'Chat do site', 'E-mail'] },
        { q: 'Qual tom ele deve usar?', type: 'radio', options: ['Profissional', 'Descontraído', 'Empático'] },
        { q: 'Quando ele deve chamar uma pessoa?', type: 'radio', options: ['Quando o cliente pedir', 'Em reclamações', 'Antes de fechar uma venda'] }
      ],
      onSubmit: answers => {
        const [goal, channels, tone, handoff] = answers.map(item => item.answers);
        const text = [
          goal.length ? `Um agente para ${goal.join(' e ').toLowerCase()}.` : '',
          channels.length ? `Ele conversa por ${channels.join(', ')}.` : '',
          tone.length ? `Tom ${tone[0].toLowerCase()}.` : '',
          handoff.length ? `Passa a conversa para uma pessoa ${handoff[0].toLowerCase()}.` : ''
        ].filter(Boolean).join(' ');
        if (!text) return;
        describe.elements.description.value = text;
        autoGrow(describe.elements.description);
        describe.requestSubmit();
      },
      onDismiss: () => { guide.hidden = true; guideOpen.hidden = false; }
    });
    guide.replaceChildren(card.el);
  });

  root.addEventListener('click', async event => {
    const target = event.target.closest('button, a');
    if (!target || !root.contains(target)) return;
    const data = target.dataset;
    if (target.hasAttribute('data-agent-new')) {
      view.focusDescribe = true;
      if (location.hash !== '#ai-agents') location.hash = '#ai-agents';
      else { view.focusDescribe = false; get('#agent-describe')?.focus(); }
      return;
    }
    if (data.agentTemplate && !busy) {
      busy = true;
      target.disabled = true;
      try {
        const { agent: created } = await request('create', { template: data.agentTemplate });
        updateAgent(created.id, created, false);
        location.hash = agentLink(created.id);
      } catch (error) {
        get('[data-describe-status]').textContent = error.message;
      } finally { busy = false; target.disabled = false; }
      return;
    }
    if (!agent) return;
    if (target.hasAttribute('data-agent-menu')) {
      const list = target.nextElementSibling;
      list.hidden = !list.hidden;
      target.setAttribute('aria-expanded', String(!list.hidden));
      if (!list.hidden) list.querySelector('a, button')?.focus();
      return;
    }
    closeMenu();
    if (data.sideTab) {
      view.side = data.sideTab;
      for (const tab of root.querySelectorAll('[data-side-tab]')) tab.setAttribute('aria-selected', String(tab === target));
      for (const panel of root.querySelectorAll('.ags-panel')) panel.hidden = panel.id !== `agent-panel-${view.side}`;
      return;
    }
    if (data.memoryKind) {
      view.memory = data.memoryKind;
      get('[data-memory-panel]').innerHTML = memoryPanel(agent);
      return;
    }
    if (data.chatVersion) {
      const chat = chats.get(chatKey(workspace, agent.id));
      if (chat.version !== data.chatVersion && !chat.pending) Object.assign(chat, { version: data.chatVersion, messages: [], log: [], config: '' });
      refresh();
      return;
    }
    if (target.hasAttribute('data-agent-reset')) {
      const chat = chats.get(chatKey(workspace, agent.id));
      if (!chat.pending) Object.assign(chat, { messages: [], log: [], config: '' });
      refresh();
      return;
    }
    if (target.hasAttribute('data-dialog-close')) { target.closest('dialog').close(); return; }
    if (target.hasAttribute('data-agent-confirm-delete')) { get('[data-agent-delete-dialog]').showModal(); return; }
    if (target.hasAttribute('data-agent-move')) { get('[data-agent-move-dialog]').showModal(); return; }
    if (data.memoryRemove) {
      await act('memory', { action: 'remove', memoryId: data.memoryRemove }, target);
      return;
    }
    if (data.agentAction) {
      target.closest('dialog')?.close();
      const deleted = await act(data.agentAction, { revision: agentRevision(agent) }, target);
      if (deleted && data.agentAction === 'delete') location.hash = '#ai-agents';
    }
  });

  function closeMenu() {
    const list = get('.ags-menu-list');
    if (list && !list.hidden) {
      list.hidden = true;
      get('[data-agent-menu]').setAttribute('aria-expanded', 'false');
    }
  }
  root.addEventListener('keydown', event => { if (event.key === 'Escape' && !get('.ags-menu-list')?.hidden) { closeMenu(); get('[data-agent-menu]').focus(); } });
  document.addEventListener('click', function outside(event) {
    if (!root.isConnected) { document.removeEventListener('click', outside); return; }
    if (!event.target.closest('.ags-menu')) closeMenu();
  });

  async function act(operation, data, button) {
    if (busy) return false;
    busy = true;
    if (button) button.disabled = true;
    const note = get('[data-agent-side-status]');
    if (note) note.textContent = '';
    try {
      const result = await request(operation, { id: agent.id, ...data });
      updateAgent(agent.id, result.agent, operation !== 'delete');
      return true;
    } catch (error) {
      if (note) note.textContent = error.message;
      return false;
    } finally {
      busy = false;
      if (button?.isConnected) button.disabled = false;
    }
  }

  if (!agent) return { root, workspace, id: '', flush: async () => true, dirty: () => false };

  const moveForm = get('[data-agent-move-form]');
  moveForm.addEventListener('submit', async event => {
    event.preventDefault();
    const note = moveForm.querySelector('.form-status');
    try {
      const result = await request('move', { id: agent.id, revision: agentRevision(agent), folder: moveForm.elements.folder.value });
      moveForm.closest('dialog').close();
      updateAgent(agent.id, result.agent);
    } catch (error) { note.textContent = error.message; }
  });

  root.addEventListener('submit', async event => {
    const form = event.target.closest('[data-memory-add]');
    if (!form) return;
    event.preventDefault();
    const note = form.querySelector('.form-status');
    try {
      const result = await request('memory', { id: agent.id, action: 'add', kind: view.memory, text: form.elements.text.value });
      updateAgent(agent.id, result.agent);
    } catch (error) { note.textContent = error.message; }
  });

  const transcript = get('[data-agent-transcript]');
  const testForm = get('[data-agent-test]');
  const testStatus = get('[data-agent-test-status]');
  const chat = chats.get(chatKey(workspace, agent.id));
  // Compositor (PromptBar): “/” traz mensagens de teste prontas; o microfone dita quando o navegador permite.
  const prompt = promptBar({
    commands: TEST_COMMANDS,
    placeholder: `Mensagem para ${agent.name}… (/ para mensagens de teste)`,
    onSend: ({ text }) => send(text)
  });
  testForm.append(prompt.el);
  const input = prompt.input;
  input.maxLength = agentLimits.message;
  input.id = 'agent-test-message';
  if (!model) { input.disabled = true; prompt.el.querySelectorAll('button').forEach(b => { b.disabled = true; }); }
  // Resposta nova aparece com StreamingText, com as bases consultadas como fontes.
  const last = chat.log.at(-1);
  if (last?.role === 'assistant' && last.fresh) {
    last.fresh = false;
    const target = [...transcript.querySelectorAll('.agent-bubble.assistant p')].at(-1);
    if (target) {
      const stream = streamingText({
        text: last.content,
        wordMs: 28,
        actions: ['copy', 'retry'],
        sources: (last.sources || []).map(name => ({ name, domain: 'base de conhecimento', href: '#ai-agents/knowledge' })),
        labels: { sources: `${(last.sources || []).length} ${(last.sources || []).length === 1 ? 'base consultada' : 'bases consultadas'}` },
        onAction: key => {
          if (key !== 'retry') return;
          const question = [...chat.log].reverse().find(entry => entry.role === 'user');
          if (question) { input.value = question.content; input.dispatchEvent(new Event('input')); input.focus(); }
        }
      });
      target.replaceWith(stream.el);
    }
  }
  transcript.scrollTop = transcript.scrollHeight;
  let loader = null;
  const showLoader = () => {
    const wrap = document.createElement('div');
    wrap.className = 'agent-bubble assistant agent-bubble-loading';
    wrap.innerHTML = `<strong>${h(agent.name)}</strong>`;
    loader = loadingState({ label: 'Pensando', since: chat.pendingSince || Date.now() });
    wrap.append(loader.el);
    transcript.append(wrap);
    transcript.scrollTop = transcript.scrollHeight;
  };
  const hideLoader = () => {
    loader?.destroy();
    loader?.el.closest('.agent-bubble')?.remove();
    loader = null;
  };
  if (chat.pending) {
    testForm.inert = true;
    testStatus.textContent = 'Aguardando resposta…';
    showLoader();
  }
  async function send(text) {
    const message = String(text || '').trim();
    if (!model || !message || chat.pending) return;
    const config = chat.version === 'published' ? `published:${agent.published?.version}` : agentRevision(agent);
    if (chat.config && chat.config !== config) Object.assign(chat, { messages: [], log: [] });
    chat.config = config;
    const history = [...chat.messages.slice(-8), message];
    chat.log.push({ role: 'user', content: message });
    chat.pending = true;
    chat.pendingSince = Date.now();
    transcript.insertAdjacentHTML('beforeend', bubble({ role: 'user', content: message }, agent.name));
    showLoader();
    testForm.inert = true;
    testStatus.textContent = 'Aguardando resposta…';
    try {
      const { reply, run } = await request('test', { id: agent.id, revision: agentRevision(agent), version: chat.version, messages: history });
      chat.messages = [...history, reply];
      chat.log.push({ role: 'assistant', content: reply, sources: run?.sources || [], fresh: true });
      chat.pending = false;
      hideLoader();
      addRun(run);
    } catch (error) {
      chat.log.pop();
      chat.pending = false;
      hideLoader();
      if (!root.isConnected) refresh();
      else {
        transcript.lastElementChild?.remove();
        input.value = message;
        input.dispatchEvent(new Event('input'));
        testStatus.textContent = error.message;
        testForm.inert = false;
        input.focus();
      }
    }
  }
  if (!chat.pending && model && !matchMedia('(max-width: 760px)').matches) input.focus({ preventScroll: true });
  return { root, workspace, id: '', flush: async () => true, dirty: () => false };
}

function mountEditor({ root, workspace, model, agent, request, updateAgent }) {
  const get = selector => root.querySelector(selector);
  const form = get('#agent-draft');
  const saveStatus = get('[data-agent-save-status]');
  const publish = get('[data-agent-action="publish"]');
  const picker = get('[data-trigger-picker]');
  const builder = get('[data-agent-build]');
  const builderLog = get('[data-builder-log]');
  const buildStatus = get('[data-agent-build-status]');
  const logKey = chatKey(workspace, agent.id);
  dialogBackdropClose(picker);
  let timer, saving, actionPending = false, committing = false, conflict = false, building = false;
  let triggers = agentDraft(agent).triggers;
  let baseline = JSON.stringify(agentDraft(agent));
  let pickerGroup = '';

  const sources = () => get('[data-agent-sources]');
  function readDraft() {
    return {
      name: form.elements.name.value.trim(),
      icon: form.querySelector('[name=icon]:checked')?.value || 'spark',
      description: form.elements.description.value.trim(),
      instructions: form.elements.instructions.value.trim(),
      knowledge: [...sources().children].map(source => ({
        title: source.querySelector('input').value.trim(), text: source.querySelector('textarea').value.trim()
      })),
      bases: [...form.querySelectorAll('[name=kb]:checked')].map(input => input.value),
      triggers: triggers.map(({ type, value }) => (value ? { type, value } : { type })),
      subagents: [...form.querySelectorAll('.agent-subagent')].map(item => ({
        name: item.querySelector('[name=subName]').value.trim(),
        when: item.querySelector('[name=subWhen]').value.trim(),
        instructions: item.querySelector('[name=subInstructions]').value.trim()
      })),
      resources: Object.fromEntries(agentResources.map(([key]) => [key, form.elements[`res-${key}`].checked]))
    };
  }
  const dirty = () => JSON.stringify(readDraft()) !== baseline;
  function describe(message, isError = false) {
    saveStatus.textContent = message;
    saveStatus.toggleAttribute('data-error', isError);
  }
  function refreshCounters() {
    get('[data-agent-count]').textContent = `${form.elements.instructions.value.length.toLocaleString('pt-BR')} / ${agentLimits.instructions.toLocaleString('pt-BR')} caracteres`;
    get('[data-agent-source-count]').textContent = `${sources().childElementCount} de ${agentLimits.sources} fontes`;
    get('[data-agent-add-source]').disabled = sources().childElementCount >= agentLimits.sources;
    get('[data-agent-add-subagent]').disabled = form.querySelectorAll('.agent-subagent').length >= agentLimits.subagents;
    get('[data-agent-add-trigger]').disabled = triggers.length >= agentLimits.triggers;
    const summary = form.querySelector('.icon-picker summary .agent-avatar');
    const chosen = form.querySelector('[name=icon]:checked')?.value;
    if (summary && chosen) summary.innerHTML = icon(chosen, 24);
    for (const item of form.querySelectorAll('.agent-subagent')) {
      item.querySelector('[data-subagent-title]').textContent = item.querySelector('[name=subName]').value.trim() || 'Novo subagente';
    }
  }
  function refreshRelease() {
    const changes = changedAgentFields(agent).map(field => agentFieldNames[field]);
    if (agent.published && model && agent.published.model !== model) changes.push('Modelo');
    publish.textContent = !agent.published ? 'Publicar' : changes.length || dirty() ? 'Publicar alterações' : 'Publicado';
    publish.disabled = Boolean(agent.published && !changes.length && !dirty()) || conflict || actionPending;
    publish.title = agent.published ? `Versão ${agent.published.version} publicada em ${fullFormat.format(new Date(agent.published.at))}` : '';
  }
  function renderTriggers() {
    get('[data-agent-triggers]').innerHTML = triggerChips(triggers, true) || '<span class="dim">Nenhum gatilho. O agente só roda quando chamado no chat.</span>';
  }
  function validDraft(report) {
    const invalid = [...form.elements].find(field => field.validity && (!field.validity.valid || (field.required && !field.value.trim())));
    if (!invalid) return true;
    if (report) {
      invalid.closest('details')?.setAttribute('open', '');
      invalid.focus();
      invalid.reportValidity();
    }
    describe('Preencha os campos obrigatórios para salvar.', true);
    return false;
  }
  function save(report = false) {
    clearTimeout(timer);
    if (saving) return saving;
    if (conflict || committing) return Promise.resolve(false);
    if (!dirty()) return Promise.resolve(true);
    if (!validDraft(report)) return Promise.resolve(false);
    saving = (async () => {
      try {
        while (dirty()) {
          if (!validDraft(report)) return false;
          describe('Salvando rascunho…');
          const response = await request('save', { ...readDraft(), id: agent.id, revision: agentRevision(agent) });
          agent = response.agent;
          baseline = JSON.stringify(agentDraft(agent));
          updateAgent(agent.id, agent);
          refreshRelease();
        }
        describe('Rascunho salvo');
        return true;
      } catch (error) {
        conflict = error.status === 409;
        describe(error.message, true);
        refreshRelease();
        return false;
      } finally { saving = null; }
    })();
    return saving;
  }
  function scheduleSave() {
    refreshCounters();
    refreshRelease();
    clearTimeout(timer);
    if (conflict) return;
    describe(dirty() ? 'Alterações pendentes' : 'Rascunho salvo');
    timer = setTimeout(() => save(), 950);
  }

  function pickerItems() {
    const query = normalized(get('[data-trigger-query]').value.trim());
    const matches = type => (!pickerGroup || type.group === pickerGroup) && (!query || normalized(`${type.label} ${type.text}`).includes(query));
    const item = type => {
      const added = !type.field && triggers.some(trigger => trigger.type === type.id);
      return `<button type="button" class="picker-item" data-pick-trigger="${type.id}" ${added ? 'aria-disabled="true"' : ''}>
        <span class="resource-icon">${icon(type.icon, 15)}</span><span><span class="picker-title"><b>${h(type.label)}</b>${added ? '<span class="badge green">Adicionado</span>' : ''}</span><small>${h(type.text)}</small></span>${icon('right', 15)}</button>`;
    };
    if (query || pickerGroup) {
      const list = triggerTypes.filter(matches);
      return list.length ? list.map(item).join('') : '<p class="dim picker-empty">Nenhum gatilho encontrado.</p>';
    }
    const sections = [['Populares', triggerTypes.filter(type => type.popular)], ...triggerGroups.map(([key, label]) => [label, triggerTypes.filter(type => type.group === key)])];
    return sections.map(([label, list]) => `<h3 class="picker-heading">${h(label)}</h3>${list.map(item).join('')}`).join('');
  }
  function openPicker() {
    get('[data-trigger-query]').value = '';
    pickerGroup = '';
    for (const button of picker.querySelectorAll('[data-trigger-group]')) button.setAttribute('aria-pressed', String(button.dataset.triggerGroup === ''));
    get('[data-trigger-value]').hidden = true;
    get('[data-trigger-list]').hidden = false;
    get('[data-trigger-list]').innerHTML = pickerItems();
    picker.showModal();
    get('[data-trigger-query]').focus();
  }
  function addTrigger(trigger) {
    if (!triggers.some(item => item.type === trigger.type && (item.value || '').toLowerCase() === (trigger.value || '').toLowerCase())) triggers = [...triggers, trigger];
    picker.close();
    renderTriggers();
    scheduleSave();
    get('[data-agent-add-trigger]').focus();
  }
  function askValue(type) {
    const valueForm = get('[data-trigger-value]');
    valueForm.innerHTML = `<p class="picker-value-title">${icon(type.icon, 15)} <b>${h(type.label)}</b></p>
      <label>${h(type.field.label)}${type.field.options
        ? `<select name="value" required>${type.field.options.map(option => `<option>${h(option)}</option>`).join('')}</select>`
        : `<input name="value" required maxlength="${agentLimits.triggerValue}" placeholder="${h(type.field.placeholder || '')}">`}</label>
      <div class="picker-value-actions"><button type="button" class="secondary" data-picker-back>Voltar</button><button class="primary">Adicionar gatilho</button></div>`;
    valueForm.dataset.type = type.id;
    valueForm.hidden = false;
    get('[data-trigger-list]').hidden = true;
    valueForm.elements.value.focus();
  }
  picker.addEventListener('input', event => {
    if (event.target.matches('[data-trigger-query]')) get('[data-trigger-list]').innerHTML = pickerItems();
  });
  picker.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-dialog-close')) picker.close();
    if (button.dataset.triggerGroup !== undefined) {
      pickerGroup = button.dataset.triggerGroup;
      for (const other of picker.querySelectorAll('[data-trigger-group]')) other.setAttribute('aria-pressed', String(other === button));
      get('[data-trigger-list]').innerHTML = pickerItems();
    }
    if (button.hasAttribute('data-picker-back')) {
      get('[data-trigger-value]').hidden = true;
      get('[data-trigger-list]').hidden = false;
    }
    if (button.dataset.pickTrigger) {
      if (button.getAttribute('aria-disabled') === 'true') return;
      const type = triggerType(button.dataset.pickTrigger);
      if (type.field) askValue(type);
      else addTrigger({ type: type.id });
    }
  });
  get('[data-trigger-value]').addEventListener('submit', event => {
    event.preventDefault();
    const valueForm = event.target;
    const value = valueForm.elements.value.value.trim();
    if (!value) return valueForm.elements.value.reportValidity();
    addTrigger({ type: valueForm.dataset.type, value });
  });

  function renderConfig() {
    const open = [...form.querySelectorAll('details.agent-subagent')].map(item => item.open);
    form.innerHTML = configFields(agent);
    form.querySelectorAll('details.agent-subagent').forEach((item, index) => { item.open = Boolean(open[index]); });
    triggers = agentDraft(agent).triggers;
    baseline = JSON.stringify(agentDraft(agent));
    refreshCounters();
    refreshRelease();
  }
  function renderBuilder() {
    builderLog.innerHTML = builderEntries(builderLogs.get(logKey) || []);
    builderLog.scrollTop = builderLog.scrollHeight;
  }

  form.addEventListener('input', scheduleSave);
  form.addEventListener('change', event => { if (event.target.matches('[name=icon]')) form.querySelector('.icon-picker').open = false; });
  form.addEventListener('submit', event => { event.preventDefault(); void save(true); });
  root.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || picker.contains(button)) return;
    if (button.hasAttribute('data-agent-add-trigger')) { openPicker(); return; }
    if (button.dataset.removeTrigger) {
      triggers = triggers.filter((_, index) => index !== Number(button.dataset.removeTrigger));
      renderTriggers();
      scheduleSave();
      get('[data-agent-add-trigger]').focus();
      return;
    }
    if (button.hasAttribute('data-agent-add-source')) {
      sources().insertAdjacentHTML('beforeend', sourceFields());
      sources().lastElementChild.querySelector('input').focus();
      scheduleSave();
      return;
    }
    if (button.hasAttribute('data-agent-remove-source')) {
      button.closest('fieldset').remove();
      get('[data-agent-add-source]').focus();
      scheduleSave();
      return;
    }
    if (button.hasAttribute('data-agent-add-subagent')) {
      get('[data-agent-subagents]').insertAdjacentHTML('beforeend', subagentFields({}, true));
      get('[data-agent-subagents]').lastElementChild.querySelector('input').focus();
      scheduleSave();
      return;
    }
    if (button.hasAttribute('data-remove-subagent')) {
      button.closest('details').remove();
      get('[data-agent-add-subagent]').focus();
      scheduleSave();
      return;
    }
    if (button.dataset.agentAction !== 'publish' || actionPending) return;
    actionPending = true;
    publish.disabled = true;
    try {
      if (!await save(true)) return;
      clearTimeout(timer);
      committing = form.inert = true;
      const result = await request('publish', { id: agent.id, revision: agentRevision(agent) });
      agent = result.agent;
      updateAgent(agent.id, agent);
      describe(`Versão ${agent.published.version} publicada`);
    } catch (error) {
      conflict = error.status === 409;
      describe(error.message, true);
    } finally {
      actionPending = committing = form.inert = false;
      refreshRelease();
    }
  });

  const buildField = builder.elements.request;
  buildField.addEventListener('input', () => autoGrow(buildField, 160));
  buildField.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); builder.requestSubmit(); }
  });
  builder.addEventListener('submit', async event => {
    event.preventDefault();
    const text = buildField.value.trim();
    if (!model || !text || building) return;
    building = true;
    builder.inert = true;
    const log = builderLogs.get(logKey) || [];
    builderLogs.set(logKey, log);
    log.push({ role: 'user', content: text });
    renderBuilder();
    const trace = thinkingState({ active: 'Atualizando o agente', working: true, open: true, rows: [{ primary: 'Salvando o rascunho' }] });
    builderLog.append(trace.el);
    builderLog.scrollTop = builderLog.scrollHeight;
    buildField.value = '';
    autoGrow(buildField, 160);
    buildStatus.textContent = '';
    try {
      if (!await save(true)) throw new Error('Resolva as pendências do rascunho e tente de novo.');
      committing = form.inert = true;
      trace.setRows([{ primary: 'Salvando o rascunho' }, { primary: 'Lendo o pedido', secondary: text.length > 40 ? `${text.slice(0, 40)}…` : text }, { primary: 'Ajustando a configuração' }]);
      const result = await request('build', { id: agent.id, revision: agentRevision(agent), request: text });
      agent = result.agent;
      updateAgent(agent.id, agent);
      log.push({ role: 'assistant', content: result.summary });
      committing = form.inert = false;
      renderConfig();
      describe('Rascunho salvo');
      buildStatus.textContent = '';
    } catch (error) {
      conflict ||= error.status === 409;
      log.push({ role: 'assistant', content: error.message, error: true });
      buildStatus.textContent = '';
      if (!buildField.value) buildField.value = text;
    } finally {
      building = committing = form.inert = false;
      builder.inert = false;
      renderBuilder();
      refreshRelease();
    }
  });

  renderTriggers();
  refreshCounters();
  refreshRelease();
  builderLog.scrollTop = builderLog.scrollHeight;
  return { root, workspace, id: agent.id, flush: () => save(), dirty };
}
