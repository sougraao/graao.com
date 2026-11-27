// Pergunte ao Graao — componente de chat completo inspirado na referência do ChatGPT,
// integrado ao design system, autenticação e contexto vivo da agência no Graao.
import { Marked } from '/vendor/marked.js';
import DOMPurify from '/vendor/purify.js';
import { highlight } from '/highlight.js';
import { icon as baseIcon, logo as graaoLogo } from './icons.js';
import { loadingState, thinkingState } from './beautiful-ui.js';

const MAX_ATTACHMENTS = 10;
const MAX_TEXT_FILE = 512 * 1024;
const MAX_IMAGE_SIDE = 2048;
const DEFAULT_TITLE = 'Novo chat';
const STORAGE_KEY = 'graao.ask.settings';
const COLLAPSED_KEY = 'graao.ask.sidebarCollapsed';
const MODEL_KEY = 'graao.ask.model';
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

const QUICK_PROMPTS = [
  'Qual é a nossa receita recorrente mensal (MRR)?',
  'Qual subconta tem mais contatos cadastrados?',
  'Quais subcontas ainda não realizaram login?',
  'Quais são os próximos passos recomendados para a agência?'
];

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|h|cc|cpp|hpp|cs|php|html?|css|scss|less|sql|sh|bash|ps1|bat|ya?ml|toml|ini|cfg|conf|xml|log|env|vue|svelte|swift|dart|lua|r|tex)$/i;

function icon(name, size = 18) {
  return baseIcon(name, size, `sc-icon sc-icon-${name}`);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function iconButton(name, label, action, extra = '', size = 18) {
  const b = el('button', `sc-icon-btn ${extra}`.trim());
  b.type = 'button';
  b.dataset.scAction = action;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.innerHTML = icon(name, size);
  return b;
}

function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

function messageText(msg) {
  const parts = msg?.content?.parts;
  return Array.isArray(parts) ? parts.filter(p => typeof p === 'string').join('\n') : '';
}

function modelLabel(id) {
  if (!id || id === 'local') return 'Assistente local';
  return id;
}

function isTouch() {
  return matchMedia('(pointer: coarse)').matches;
}

const marked = new Marked({ gfm: true, breaks: false });
marked.use({
  renderer: {
    code({ text, lang }) {
      const cleanLang = (lang || '').trim().split(/\s+/)[0].toLowerCase();
      const body = highlight(text, cleanLang);
      return `<div class="sc-code-block"><div class="sc-code-head"><span>${escapeHtml(cleanLang || 'código')}</span><button type="button" data-sc-action="copy-code">${icon('copy', 14)}<span>Copiar código</span></button></div><pre><code class="hljs">${body}</code></pre></div>`;
    },
    html({ text }) {
      return escapeHtml(text);
    }
  }
});

function renderMarkdownInto(target, text) {
  const frag = DOMPurify.sanitize(marked.parse(text || ''), { RETURN_DOM_FRAGMENT: true });
  for (const table of frag.querySelectorAll('table')) {
    const wrap = document.createElement('div');
    wrap.className = 'sc-table-wrap';
    table.replaceWith(wrap);
    wrap.append(table);
  }
  for (const a of frag.querySelectorAll('a[href]')) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  target.replaceChildren(frag);
}

async function* readEvents(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = 'message';
      const data = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (!data.length) continue;
      try { yield { event, data: JSON.parse(data.join('\n')) }; } catch {}
    }
  }
}

export function createGraaoChat({ api, flash, onOpenOpenAISettings, getHeaders }) {
  const settings = { instructions: '', ...readStorage(STORAGE_KEY, {}) };
  const state = {
    loaded: false,
    config: { mode: 'local', source: 'local', defaultModel: 'local', models: ['local'] },
    models: ['local'],
    model: readStorage(MODEL_KEY, null),
    list: [],
    conv: null,
    temporary: false,
    stream: null,
    error: null,
    attachments: [],
    editing: null,
    renaming: null,
    menuConvId: null,
    speakingId: null,
    skills: [],
    activeTab: 'general'
  };

  let pinned = true;
  let dictation = null;
  let searchTimer = 0;
  let searchSelected = 0;
  let dragDepth = 0;
  let mounted = false;
  const voice = { active: false, rec: null };

  const root = el('div', 'sc-app');
  if (readStorage(COLLAPSED_KEY, false)) root.classList.add('is-collapsed');

  root.innerHTML = `
    <aside class="sc-sidebar" aria-label="Histórico de conversas">
      <div class="sc-rail">
        <button type="button" class="sc-icon-btn" data-sc-action="toggle-sidebar" aria-label="Abrir histórico" title="Abrir histórico">${icon('sidebar', 18)}</button>
        <button type="button" class="sc-icon-btn" data-sc-action="new-chat" aria-label="Novo chat" title="Novo chat">${icon('newChat', 18)}</button>
        <button type="button" class="sc-icon-btn" data-sc-action="open-search" aria-label="Buscar chats" title="Buscar chats">${icon('search', 18)}</button>
        <div class="sc-rail-spacer"></div>
        <button type="button" class="sc-icon-btn" data-sc-action="open-settings" aria-label="Configurações do chat" title="Configurações do chat">${icon('settings', 18)}</button>
      </div>
      <div class="sc-panel">
        <div class="sc-side-head">
          <button type="button" class="sc-icon-btn" data-sc-action="toggle-sidebar" aria-label="Recolher histórico" title="Recolher histórico">${icon('sidebar', 18)}</button>
        </div>
        <nav class="sc-side-nav" aria-label="Ações do chat">
          <button type="button" class="sc-nav-item" data-sc-action="new-chat">${icon('newChat', 17)}<span>Novo chat</span><kbd>Ctrl Shift O</kbd></button>
          <button type="button" class="sc-nav-item" data-sc-action="open-search">${icon('search', 17)}<span>Buscar chats</span></button>
        </nav>
        <div class="sc-history">
          <h2 class="sc-history-title">Recentes</h2>
          <ol class="sc-history-list" data-sc="history-list"></ol>
          <p class="sc-history-empty" data-sc="history-empty" hidden>Suas conversas com o Graao aparecem aqui.</p>
        </div>
        <div class="sc-side-foot">
          <button type="button" class="sc-nav-item" data-sc-action="open-settings">${icon('settings', 17)}<span>Configurações do chat</span></button>
        </div>
      </div>
    </aside>
    <div class="sc-backdrop" data-sc-action="toggle-sidebar" hidden></div>

    <div class="sc-main is-home" data-sc="main">
      <header class="sc-topbar">
        <div class="sc-topbar-left">
          <button type="button" class="sc-icon-btn sc-mobile-only" data-sc-action="toggle-sidebar" aria-label="Abrir histórico">${icon('menu', 19)}</button>
          <div class="sc-model-picker">
            <button type="button" class="sc-model-btn" data-sc="model-btn" aria-haspopup="dialog" aria-expanded="false">
              <span>Graao</span>
              <span class="sc-model-badge" data-sc="model-name">Assistente local</span>
              ${icon('chevronDown', 15)}
            </button>
            <div class="sc-menu sc-model-menu" data-sc="model-menu" role="dialog" aria-label="Modelo de IA" hidden>
              <div class="sc-menu-label">Modelo</div>
              <div data-sc="model-list"></div>
            </div>
          </div>
        </div>
        <div class="sc-topbar-right">
          <button type="button" class="sc-icon-btn sc-mobile-only" data-sc-action="new-chat" aria-label="Novo chat" title="Novo chat">${icon('newChat', 18)}</button>
          <button type="button" class="sc-icon-btn sc-temp-btn" data-sc="temp-btn" data-sc-action="toggle-temporary" aria-pressed="false" aria-label="Chat temporário" title="Ativar chat temporário">${icon('temporary', 18)}</button>
        </div>
      </header>

      <div class="sc-content" data-sc="content">
        <div class="sc-scroller" data-sc="scroller">
          <div class="sc-thread" data-sc="thread" role="region" aria-label="Conversa com o Graao"></div>
        </div>
        <button type="button" class="sc-scroll-down" data-sc="scroll-down" aria-label="Rolar até o fim" hidden>${icon('arrowDown', 17)}</button>

        <section class="sc-home">
          <div class="sc-home-badge" aria-hidden="true">${graaoLogo}</div>
          <h1 data-sc="home-title">Por onde começamos?</h1>
          <p class="sc-home-sub" data-sc="home-sub" hidden>Este chat não vai aparecer no histórico nem ser salvo.</p>
        </section>

        <div class="sc-dock" data-sc="dock">
          <form class="sc-composer" data-sc="composer" autocomplete="off">
            <div class="sc-attachments" data-sc="attachments" aria-label="Anexos"></div>
            <div class="sc-composer-row">
              <div class="sc-plus-wrap">
                <button type="button" class="sc-icon-btn sc-plus" data-sc="plus-btn" aria-label="Adicionar arquivos" aria-expanded="false" title="Adicionar arquivos">${icon('plus', 19)}</button>
                <div class="sc-menu sc-plus-menu" data-sc="plus-menu" hidden>
                  <button type="button" class="sc-menu-item" data-sc-action="attach">${icon('paperclip', 17)}<span>Adicionar fotos e arquivos</span></button>
                </div>
              </div>
              <label class="sr-only" for="sc-prompt">Pergunte ao Graao</label>
              <textarea id="sc-prompt" class="sc-text" data-sc="prompt" rows="1" placeholder="Pergunte ao Graao sobre subcontas, receita, setups, equipe…" aria-label="Pergunte ao Graao"></textarea>
              <button type="button" class="sc-icon-btn sc-mic" data-sc="dictate-btn" aria-label="Iniciar ditado" title="Ditar">${icon('mic', 18)}</button>
              <button type="submit" class="sc-send" data-sc="send-btn" aria-label="Enviar mensagem"></button>
            </div>
            <input type="file" data-sc="file-input" multiple hidden>
          </form>
          <div class="sc-suggestions" data-sc="suggestions">
            ${QUICK_PROMPTS.map(p => `<button type="button" class="sc-suggestion" data-sc-action="quick-prompt" data-q="${escapeHtml(p)}">${escapeHtml(p)}</button>`).join('')}
          </div>
          <p class="sc-disclaimer">O Graao pode cometer erros. Confira informações importantes nos relatórios da agência.</p>
        </div>

        <div class="sc-drop-overlay" data-sc="drop-overlay" hidden><div>Solte os arquivos aqui para anexar à conversa</div></div>
      </div>

      <div class="sc-voice-banner" data-sc="voice-banner" hidden>
        <span class="sc-voice-dot"></span>
        <span data-sc="voice-status">Ouvindo…</span>
        <button type="button" class="secondary" data-sc-action="stop-voice">Encerrar</button>
      </div>
    </div>

    <div class="sc-menu sc-chat-menu" data-sc="chat-menu" hidden>
      <button type="button" class="sc-menu-item" data-sc-action="rename-chat">${icon('edit', 16)}<span>Renomear</span></button>
      <button type="button" class="sc-menu-item is-danger" data-sc-action="delete-chat">${icon('trash', 16)}<span>Excluir</span></button>
    </div>

    <dialog class="sc-modal" data-sc="search-modal" aria-label="Buscar chats">
      <div class="sc-search-head">
        ${icon('search', 18)}
        <input type="search" data-sc="search-input" placeholder="Buscar chats…" aria-label="Buscar chats">
        <button type="button" class="sc-icon-btn" data-sc-action="close-modal" aria-label="Fechar">${icon('close', 17)}</button>
      </div>
      <div class="sc-search-results" data-sc="search-results"></div>
    </dialog>

    <dialog class="sc-modal sc-modal-settings" data-sc="settings-modal" aria-labelledby="sc-settings-title">
      <header>
        <h2 id="sc-settings-title">Personalização do Chat</h2>
        <button type="button" class="sc-icon-btn" data-sc-action="close-modal" aria-label="Fechar">${icon('close', 17)}</button>
      </header>
      <div class="sc-modal-tabs" role="tablist">
        <button type="button" class="sc-tab-btn active" data-sc-tab="general" role="tab">Geral</button>
        <button type="button" class="sc-tab-btn" data-sc-tab="skills" role="tab">Habilidades</button>
      </div>
      <div class="sc-settings-body">
        <!-- Aba Geral -->
        <div class="sc-tab-pane active" data-sc-pane="general">
          <div class="sc-setting-block">
            <label class="sc-setting-label" for="sc-instructions">Instruções personalizadas</label>
            <p class="sc-setting-hint">Como o Graao deve responder ou o que deve considerar sobre a sua agência?</p>
            <textarea id="sc-instructions" data-sc="instructions" rows="4" placeholder="Ex.: Responda de forma objetiva, sempre destacando oportunidades de aumento de MRR."></textarea>
            <div class="sc-setting-actions">
              <button type="button" class="primary" data-sc-action="save-instructions">Salvar instruções</button>
            </div>
          </div>
          <div class="sc-setting-row">
            <div>
              <div class="sc-setting-label">Provedor de IA</div>
              <p class="sc-setting-hint" data-sc="provider-info"></p>
            </div>
            <button type="button" class="secondary" data-sc-action="open-openai">Configurar OpenAI</button>
          </div>
          <div class="sc-setting-row">
            <div>
              <div class="sc-setting-label">Importar histórico</div>
              <p class="sc-setting-hint">Arquivo JSON no formato conversations.json.</p>
            </div>
            <button type="button" class="secondary" data-sc-action="import">Importar</button>
            <input type="file" data-sc="import-input" accept=".json,application/json" hidden>
          </div>
          <div class="sc-setting-row">
            <div class="sc-setting-label">Exportar conversas</div>
            <a class="secondary" href="/api/ask/export" download="graao-conversas.json">Exportar JSON</a>
          </div>
          <div class="sc-setting-row">
            <div class="sc-setting-label">Excluir todos os chats</div>
            <button type="button" class="danger" data-sc-action="delete-all">Excluir tudo</button>
          </div>
        </div>

        <!-- Aba Habilidades -->
        <div class="sc-tab-pane" data-sc-pane="skills">
          <div class="sc-skills-toolbar">
            <p class="sc-setting-hint" style="margin:0;">Habilidades customizadas injetadas no agente seguindo o padrão <code>agentskills.io</code> (SKILL.md).</p>
            <div class="sc-skills-actions">
              <button type="button" class="secondary" data-sc-action="import-skill-file">Importar SKILL.md</button>
              <input type="file" data-sc="skill-file-input" accept=".md,text/markdown,text/plain" hidden>
              <button type="button" class="primary" data-sc-action="open-skill-form">+ Nova Habilidade</button>
            </div>
          </div>

          <div class="sc-skills-list" data-sc="skills-list"></div>

          <!-- Formulário de Criação e Edição de Habilidade -->
          <div class="sc-skill-form-box" data-sc="skill-form" hidden>
            <div class="sc-skill-form-head">
              <h3 data-sc="skill-form-title">Nova Habilidade</h3>
              <button type="button" class="sc-icon-btn" data-sc-action="cancel-skill-form">${icon('close', 15)}</button>
            </div>
            <input type="hidden" data-sc="skill-edit-id">
            <div class="sc-field-group">
              <label class="sc-setting-label">Nome da Habilidade</label>
              <input type="text" data-sc="skill-name" placeholder="Ex: Auditor de Prospecção & Copywriting">
            </div>
            <div class="sc-field-group">
              <label class="sc-setting-label">Descrição curta</label>
              <input type="text" data-sc="skill-desc" placeholder="Ex: Analisa perfis e cria abordagens comerciais">
            </div>
            <div class="sc-field-group">
              <label class="sc-setting-label">Instruções da Habilidade (Markdown / Prompts)</label>
              <textarea data-sc="skill-instructions" rows="6" placeholder="Você é um especialista em... Sempre que o usuário pedir..."></textarea>
            </div>
            <div class="sc-setting-actions" style="gap:8px;">
              <button type="button" class="secondary" data-sc-action="cancel-skill-form">Cancelar</button>
              <button type="button" class="primary" data-sc-action="save-skill">Salvar Habilidade</button>
            </div>
          </div>
        </div>
      </div>
    </dialog>

    <dialog class="sc-modal" data-sc="confirm-modal">
      <header>
        <h2 data-sc="confirm-title"></h2>
        <button type="button" class="sc-icon-btn" data-sc-action="close-modal" aria-label="Fechar">${icon('close', 17)}</button>
      </header>
      <div class="modal-body">
        <p data-sc="confirm-text" class="dim"></p>
      </div>
      <footer>
        <button type="button" class="secondary" data-sc-action="close-modal">Cancelar</button>
        <button type="button" class="danger" data-sc="confirm-ok">Excluir</button>
      </footer>
    </dialog>
  `;

  const Q = name => root.querySelector(`[data-sc="${name}"]`);
  const els = {
    main: Q('main'),
    content: Q('content'),
    backdrop: root.querySelector('.sc-backdrop'),
    historyList: Q('history-list'),
    historyEmpty: Q('history-empty'),
    scroller: Q('scroller'),
    thread: Q('thread'),
    scrollDown: Q('scroll-down'),
    homeTitle: Q('home-title'),
    homeSub: Q('home-sub'),
    dock: Q('dock'),
    composer: Q('composer'),
    prompt: Q('prompt'),
    sendBtn: Q('send-btn'),
    dictateBtn: Q('dictate-btn'),
    plusBtn: Q('plus-btn'),
    plusMenu: Q('plus-menu'),
    fileInput: Q('file-input'),
    attachments: Q('attachments'),
    dropOverlay: Q('drop-overlay'),
    modelBtn: Q('model-btn'),
    modelMenu: Q('model-menu'),
    modelList: Q('model-list'),
    modelName: Q('model-name'),
    tempBtn: Q('temp-btn'),
    chatMenu: Q('chat-menu'),
    searchModal: Q('search-modal'),
    searchInput: Q('search-input'),
    searchResults: Q('search-results'),
    settingsModal: Q('settings-modal'),
    instructions: Q('instructions'),
    providerInfo: Q('provider-info'),
    importInput: Q('import-input'),
    skillsList: Q('skills-list'),
    skillFileInput: Q('skill-file-input'),
    skillForm: Q('skill-form'),
    skillFormTitle: Q('skill-form-title'),
    skillEditId: Q('skill-edit-id'),
    skillName: Q('skill-name'),
    skillDesc: Q('skill-desc'),
    skillInstructions: Q('skill-instructions'),
    confirmModal: Q('confirm-modal'),
    confirmTitle: Q('confirm-title'),
    confirmText: Q('confirm-text'),
    confirmOk: Q('confirm-ok'),
    voiceBanner: Q('voice-banner'),
    voiceStatus: Q('voice-status')
  };

  if (!SpeechRec) els.dictateBtn.hidden = true;

  function syncHash(convId) {
    const target = convId ? `#agency/ask/${convId}` : '#agency/ask';
    if (location.hash !== target) history.replaceState(null, '', target);
  }

  function closeMenus() {
    els.modelMenu.hidden = true;
    els.modelBtn.setAttribute('aria-expanded', 'false');
    els.plusMenu.hidden = true;
    els.plusBtn.setAttribute('aria-expanded', 'false');
    els.chatMenu.hidden = true;
    state.menuConvId = null;
    for (const li of root.querySelectorAll('.sc-history-item.menu-open')) li.classList.remove('menu-open');
  }

  function closeSidebarOnMobile() {
    root.classList.remove('sidebar-open');
    els.backdrop.hidden = true;
  }

  function toggleSidebar() {
    if (matchMedia('(max-width: 860px)').matches) {
      const open = !root.classList.contains('sidebar-open');
      root.classList.toggle('sidebar-open', open);
      els.backdrop.hidden = !open;
    } else {
      const collapsed = !root.classList.contains('is-collapsed');
      root.classList.toggle('is-collapsed', collapsed);
      writeStorage(COLLAPSED_KEY, collapsed);
    }
  }

  function leaveCurrent() {
    if (state.stream) state.stream.controller.abort();
    stopSpeaking();
    state.error = null;
    state.editing = null;
  }

  function showHome({ updateHash = true } = {}) {
    leaveCurrent();
    state.conv = null;
    if (updateHash) syncHash('');
    render();
    requestAnimationFrame(() => els.prompt.focus());
  }

  async function openConversation(id, { updateHash = true } = {}) {
    leaveCurrent();
    closeSidebarOnMobile();
    try {
      const conv = await api(`/api/ask/conversation?id=${encodeURIComponent(id)}`);
      state.conv = conv;
      state.temporary = Boolean(conv.temporary);
      if (updateHash && !conv.temporary) syncHash(id);
      render();
      scrollToBottom();
    } catch (err) {
      flash(err.message || 'Conversa não encontrada.', true);
      state.conv = null;
      syncHash('');
      render();
    }
  }

  function newChat() {
    closeSidebarOnMobile();
    showHome({ updateHash: true });
  }

  // ---------- Renderização ----------
  function render() {
    const home = !state.conv;
    els.main.classList.toggle('is-home', home);
    els.homeTitle.textContent = state.temporary ? 'Chat temporário' : 'Por onde começamos?';
    els.homeSub.hidden = !state.temporary;
    els.tempBtn.setAttribute('aria-pressed', String(state.temporary));
    els.tempBtn.title = state.temporary ? 'Desativar chat temporário' : 'Ativar chat temporário';
    renderModels();
    renderHistory();
    renderThread();
    updateComposer();
  }

  function renderModels() {
    els.modelList.textContent = '';
    for (const id of state.models) {
      const item = el('button', 'sc-menu-item');
      item.type = 'button';
      item.dataset.scAction = 'pick-model';
      item.dataset.model = id;
      item.append(el('span', null, modelLabel(id)));
      if (id === state.model) item.insertAdjacentHTML('beforeend', `<span class="sc-check">${icon('check', 16)}</span>`);
      els.modelList.append(item);
    }
    if (state.config.mode === 'local') {
      els.modelList.append(el('div', 'sc-menu-sep'));
      const connect = el('button', 'sc-menu-item');
      connect.type = 'button';
      connect.dataset.scAction = 'open-openai';
      connect.innerHTML = `${icon('key', 16)}<span>Conectar OpenAI…</span>`;
      els.modelList.append(connect);
    }
    els.modelName.textContent = modelLabel(state.model);
  }

  function renderHistory() {
    els.historyList.textContent = '';
    for (const item of state.list) {
      const li = el('li', 'sc-history-item');
      li.dataset.id = item.id;
      if (state.conv?.id === item.id) li.classList.add('active');
      if (state.renaming === item.id) {
        const input = el('input');
        input.value = item.title || DEFAULT_TITLE;
        input.setAttribute('aria-label', 'Novo nome do chat');
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') input.blur();
          if (e.key === 'Escape') {
            input.dataset.cancel = '1';
            input.blur();
          }
        });
        input.addEventListener('blur', () => finishRename(item, input.dataset.cancel ? null : input.value));
        li.append(input);
        requestAnimationFrame(() => { input.focus(); input.select(); });
      } else {
        const a = el('a', null, item.title || DEFAULT_TITLE);
        a.href = `#agency/ask/${item.id}`;
        a.dataset.scAction = 'open-conv';
        a.title = item.title || DEFAULT_TITLE;
        li.append(a, iconButton('more', 'Opções da conversa', 'chat-more', 'sc-item-more', 16));
      }
      els.historyList.append(li);
    }
    els.historyEmpty.hidden = state.list.length > 0;
  }

  function visibleNodes(conv) {
    const out = [];
    let node = conv.mapping[conv.current_node];
    while (node) {
      const msg = node.message;
      const role = msg?.author?.role;
      const type = msg?.content?.content_type;
      const hidden = msg?.metadata?.is_visually_hidden_from_conversation;
      if (!hidden && (role === 'user' || role === 'assistant') && (!type || type === 'text' || type === 'multimodal_text')) {
        if (role === 'user' || messageText(msg).trim() || msg.metadata?.reasoning) out.push(node);
      }
      node = node.parent ? conv.mapping[node.parent] : null;
    }
    return out.reverse();
  }

  function renderThread() {
    const conv = state.conv;
    els.thread.textContent = '';
    if (!conv) {
      updateScrollButton();
      return;
    }
    const nodes = visibleNodes(conv);
    const streaming = state.stream?.conv === conv;
    const lastAssistant = streaming ? null : [...nodes].reverse().find(n => n.message.author.role === 'assistant');
    for (const node of nodes) {
      els.thread.append(node.message.author.role === 'user' ? userTurn(node) : assistantTurn(node, node === lastAssistant));
    }
    if (streaming) els.thread.append(state.stream.el);
    if (state.error?.conv === conv) els.thread.append(errorTurn(state.error));
    updateScrollButton();
  }

  function userTurn(node) {
    const msg = node.message;
    const turn = el('div', 'sc-turn user');
    turn.dataset.id = node.id;
    if (state.editing === node.id) {
      turn.append(editBox(node));
      return turn;
    }
    const atts = msg.metadata?.attachments || [];
    if (atts.length) {
      const wrap = el('div', 'sc-user-attachments');
      for (const a of atts) wrap.append(attachmentView(a, false));
      turn.append(wrap);
    }
    const text = messageText(msg);
    if (text) turn.append(el('div', 'sc-bubble', text));
    const actions = el('div', 'sc-actions');
    const nav = branchNav(node);
    actions.append(iconButton('copy', 'Copiar', 'copy-msg', '', 16));
    if (!state.stream) actions.append(iconButton('edit', 'Editar mensagem', 'edit-msg', '', 16));
    if (nav) actions.append(nav);
    turn.append(actions);
    return turn;
  }

  function editBox(node) {
    const box = el('div', 'sc-edit-box');
    const ta = el('textarea');
    ta.value = messageText(node.message);
    ta.setAttribute('aria-label', 'Editar mensagem');
    const fit = () => {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    };
    ta.addEventListener('input', fit);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        state.editing = null;
        renderThread();
      } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isTouch()) {
        e.preventDefault();
        submitEdit(node.id, ta.value);
      }
    });
    const actions = el('div', 'sc-edit-actions');
    const cancel = el('button', 'secondary', 'Cancelar');
    cancel.type = 'button';
    cancel.dataset.scAction = 'edit-cancel';
    const send = el('button', 'primary', 'Enviar');
    send.type = 'button';
    send.dataset.scAction = 'edit-send';
    actions.append(cancel, send);
    box.append(ta, actions);
    requestAnimationFrame(() => {
      fit();
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    return box;
  }

  function assistantTurn(node, latest) {
    const msg = node.message;
    const meta = msg.metadata || {};
    const turn = el('div', `sc-turn assistant${latest ? ' latest' : ''}`);
    turn.dataset.id = node.id;

    const row = el('div', 'sc-assistant-row');
    const av = el('div', 'sc-avatar');
    av.setAttribute('aria-hidden', 'true');
    av.innerHTML = graaoLogo;
    const body = el('div', 'sc-assistant-body');
    if (meta.reasoning) body.append(reasoningBlock(meta.reasoning, meta.reasoning_ms));
    const md = el('div', 'sc-markdown');
    renderMarkdownInto(md, messageText(msg));
    body.append(md);
    if (meta.finish_details?.type === 'interrupted') body.append(el('div', 'sc-interrupted', 'Resposta interrompida'));
    row.append(av, body);
    turn.append(row);

    const actions = el('div', 'sc-actions');
    const nav = branchNav(node);
    if (nav) actions.append(nav);
    actions.append(iconButton('copy', 'Copiar resposta', 'copy-msg', '', 16));
    const up = iconButton('thumbUp', 'Boa resposta', 'feedback-up', meta.feedback === 'up' ? 'on' : '', 16);
    const down = iconButton('thumbDown', 'Resposta ruim', 'feedback-down', meta.feedback === 'down' ? 'on' : '', 16);
    if (meta.feedback !== 'down') actions.append(up);
    if (meta.feedback !== 'up') actions.append(down);
    if ('speechSynthesis' in window) {
      const speaking = state.speakingId === node.id;
      actions.append(iconButton(speaking ? 'stop' : 'speaker', speaking ? 'Parar leitura' : 'Ler em voz alta', 'read-aloud', speaking ? 'on' : '', 16));
    }
    if (!state.stream) actions.append(iconButton('retry', 'Tentar novamente', 'regenerate', '', 16));
    turn.append(actions);
    return turn;
  }

  const thoughtFor = ms => (ms ? `Pensou por ${Math.max(1, Math.round(ms / 1000))}s` : 'Raciocínio');

  function reasoningBlock(text, ms) {
    return thinkingState({ working: false, done: thoughtFor(ms), text }).el;
  }

  function errorTurn(error) {
    const turn = el('div', 'sc-turn assistant');
    const box = el('div', 'sc-error-box');
    box.append(el('span', null, error.message || 'Não foi possível concluir a resposta.'));
    const retry = el('button', 'secondary', 'Tentar novamente');
    retry.type = 'button';
    retry.dataset.scAction = 'retry-error';
    box.append(retry);
    turn.append(box);
    return turn;
  }

  function branchNav(node) {
    const conv = state.conv;
    const role = node.message.author.role;
    const parent = conv.mapping[node.parent];
    const siblings = (parent?.children || []).filter(id => conv.mapping[id]?.message?.author?.role === role);
    if (siblings.length < 2) return null;
    const idx = siblings.indexOf(node.id);
    const nav = el('div', 'sc-branch-nav');
    const prev = iconButton('chevronLeft', 'Versão anterior', 'branch-prev', '', 15);
    const next = iconButton('chevronRight', 'Próxima versão', 'branch-next', '', 15);
    prev.disabled = idx <= 0 || Boolean(state.stream);
    next.disabled = idx >= siblings.length - 1 || Boolean(state.stream);
    nav.append(prev, el('span', null, `${idx + 1}/${siblings.length}`), next);
    return nav;
  }

  function attachmentView(a, removable) {
    if (a.kind === 'image') {
      if (removable) {
        const chip = el('div', 'sc-chip image');
        const img = el('img');
        img.src = a.dataUrl;
        img.alt = a.name;
        chip.append(img, removeButton(a.id));
        return chip;
      }
      const img = el('img');
      img.src = a.dataUrl;
      img.alt = a.name;
      img.dataset.scAction = 'open-image';
      return img;
    }
    const chip = el('div', 'sc-chip');
    const badge = el('span', 'sc-file-badge');
    badge.innerHTML = icon('file', 17);
    chip.append(badge, el('span', 'sc-file-name', a.name));
    if (removable) chip.append(removeButton(a.id));
    return chip;
  }

  function removeButton(id) {
    const b = el('button', 'sc-chip-remove');
    b.type = 'button';
    b.dataset.scAction = 'remove-attachment';
    b.dataset.id = id;
    b.setAttribute('aria-label', 'Remover arquivo');
    b.innerHTML = icon('close', 11);
    return b;
  }

  function upsertListItem(conv) {
    if (!conv.id || conv.temporary) return;
    const existing = state.list.find(c => c.id === conv.id);
    const item = existing || { id: conv.id, title: conv.title, create_time: conv.create_time };
    item.title = conv.title;
    item.update_time = Date.now() / 1000;
    state.list = [item, ...state.list.filter(c => c.id !== conv.id)];
  }

  // ---------- Rolagem ----------
  function nearBottom() {
    const s = els.scroller;
    return s.scrollHeight - s.scrollTop - s.clientHeight < 80;
  }

  function scrollToBottom(smooth = false) {
    requestAnimationFrame(() => {
      els.scroller.scrollTo({ top: els.scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
      pinned = true;
      updateScrollButton();
    });
  }

  function updateScrollButton() {
    const show = Boolean(state.conv) && !nearBottom();
    els.scrollDown.hidden = !show;
    if (show) els.scrollDown.style.bottom = `${els.dock.offsetHeight + 12}px`;
  }

  // ---------- Envio e streaming ----------
  async function submitPrompt(overrideText) {
    if (state.stream) return;
    const text = overrideText !== undefined ? overrideText : els.prompt.value;
    if (!text.trim() && !state.attachments.length) return;
    const attachments = overrideText !== undefined ? [] : state.attachments;
    if (overrideText === undefined) {
      state.attachments = [];
      els.prompt.value = '';
      renderAttachments();
      autosize();
    }
    await sendMessage({ text: text.trim() ? text : '', attachments, parentId: state.conv?.current_node ?? null });
  }

  function submitEdit(nodeId, text) {
    const node = state.conv.mapping[nodeId];
    const attachments = node.message.metadata?.attachments || [];
    if (!text.trim() && !attachments.length) return;
    state.editing = null;
    sendMessage({ text, attachments, parentId: node.parent });
  }

  async function sendMessage({ text, attachments, parentId }) {
    const msg = {
      id: uuid(),
      author: { role: 'user' },
      content: { content_type: 'text', parts: [text] },
      create_time: Date.now() / 1000,
      metadata: attachments.length ? { attachments } : {}
    };
    if (!state.conv) {
      const rootId = 'local-root';
      state.conv = {
        id: null,
        title: DEFAULT_TITLE,
        temporary: state.temporary,
        current_node: msg.id,
        mapping: {
          [rootId]: { id: rootId, message: null, parent: null, children: [msg.id] },
          [msg.id]: { id: msg.id, message: msg, parent: rootId, children: [] }
        }
      };
      parentId = null;
    } else {
      const parent = state.conv.mapping[parentId];
      state.conv.mapping[msg.id] = { id: msg.id, message: msg, parent: parentId, children: [] };
      parent.children.push(msg.id);
      state.conv.current_node = msg.id;
    }
    await runStream({ action: 'next', parentId, message: msg });
  }

  function regenerate(userMessageId) {
    if (state.stream) return;
    state.conv.current_node = userMessageId;
    runStream({ action: 'variant', parentId: userMessageId });
  }

  function createStreamView() {
    const turn = el('div', 'sc-turn assistant');
    const row = el('div', 'sc-assistant-row');
    const av = el('div', 'sc-avatar');
    av.setAttribute('aria-hidden', 'true');
    av.innerHTML = graaoLogo;
    const body = el('div', 'sc-assistant-body');
    const loader = loadingState({ label: 'Pensando' });
    loader.el.classList.add('sc-loading');
    const md = el('div', 'sc-markdown streaming');
    body.append(loader.el, md);
    row.append(av, body);
    turn.append(row);
    return { el: turn, body, thinking: loader.el, loader, md, trace: null, reasoningEl: null };
  }

  async function runStream({ action, parentId, message }) {
    const conv = state.conv;
    state.error = null;
    const stream = {
      conv,
      controller: new AbortController(),
      parentId: message ? message.id : parentId,
      assistantId: null,
      text: '',
      reasoning: '',
      started: Date.now(),
      reasoningMs: null,
      frame: 0,
      ...createStreamView()
    };
    state.stream = stream;
    render();
    scrollToBottom();

    const body = {
      action,
      conversation_id: conv.id,
      parent_message_id: parentId,
      model: state.model,
      temporary: state.temporary,
      system_prompt: settings.instructions || undefined,
      messages: message ? [message] : []
    };

    try {
      const res = await fetch('/api/ask/conversation', {
        method: 'POST',
        headers: { ...(getHeaders?.() || {}), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: stream.controller.signal
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }
      for await (const { event, data } of readEvents(res.body)) {
        if (event === 'meta') onMeta(stream, data);
        else if (event === 'reasoning') onReasoning(stream, data.v);
        else if (event === 'delta') onDelta(stream, data.v);
        else if (event === 'done') finishStream(stream, data.message);
        else if (event === 'error') finishStream(stream, data.assistant_message, data.message);
        else if (event === 'title') onTitle(data);
      }
      if (state.stream === stream) finishStream(stream, null, 'A conexão com o servidor foi interrompida.');
    } catch (err) {
      if (err.name === 'AbortError') finishStream(stream, partialMessage(stream));
      else finishStream(stream, null, err.message);
    }
  }

  function onMeta(stream, data) {
    const server = data.conversation;
    const isNew = !stream.conv.id;
    Object.assign(stream.conv, server);
    stream.assistantId = data.assistant_message_id;
    if (isNew && !server.temporary && state.conv === stream.conv) syncHash(server.id);
    upsertListItem(stream.conv);
    renderHistory();
  }

  function onReasoning(stream, v) {
    stream.reasoning += v;
    if (!stream.reasoningEl) {
      stream.trace = thinkingState({ active: 'Pensando', working: true, open: true });
      stream.reasoningEl = stream.trace.el;
      stream.thinking.hidden = true;
      stream.loader.destroy();
      stream.body.prepend(stream.reasoningEl);
    }
    stream.trace.setText(stream.reasoning);
    followBottom();
  }

  function onDelta(stream, v) {
    if (!stream.text) {
      stream.thinking.hidden = true;
      stream.loader.destroy();
      if (stream.trace) {
        stream.reasoningMs = Date.now() - stream.started;
        stream.trace.setDone(thoughtFor(stream.reasoningMs));
        stream.trace.setWorking(false);
      }
    }
    stream.text += v;
    if (!stream.frame) {
      stream.frame = requestAnimationFrame(() => {
        stream.frame = 0;
        renderMarkdownInto(stream.md, stream.text);
        followBottom();
      });
    }
  }

  function followBottom() {
    if (pinned) els.scroller.scrollTop = els.scroller.scrollHeight;
    updateScrollButton();
  }

  function partialMessage(stream) {
    if (!stream.text && !stream.reasoning) return null;
    return {
      id: stream.assistantId || uuid(),
      author: { role: 'assistant' },
      content: { content_type: 'text', parts: [stream.text] },
      create_time: Date.now() / 1000,
      metadata: {
        model_slug: state.model,
        finish_details: { type: 'interrupted' },
        ...(stream.reasoning ? { reasoning: stream.reasoning, reasoning_ms: stream.reasoningMs || Date.now() - stream.started } : {})
      }
    };
  }

  function finishStream(stream, assistant, errorMessage) {
    if (state.stream !== stream) return;
    cancelAnimationFrame(stream.frame);
    stream.loader.destroy();
    state.stream = null;
    const conv = stream.conv;
    if (assistant && !conv.mapping[assistant.id]) {
      conv.mapping[assistant.id] = { id: assistant.id, message: assistant, parent: stream.parentId, children: [] };
      conv.mapping[stream.parentId]?.children.push(assistant.id);
      conv.current_node = assistant.id;
    }
    if (errorMessage) state.error = { conv, parentId: stream.parentId, message: errorMessage };
    upsertListItem(conv);
    if (state.conv === conv) {
      render();
      if (pinned) scrollToBottom();
    } else {
      renderHistory();
    }
    if (voice.active) {
      if (assistant && !errorMessage) speak(assistant.id, messageText(assistant), () => listenForVoice());
      else listenForVoice();
    }
  }

  function onTitle({ conversation_id, title }) {
    const item = state.list.find(c => c.id === conversation_id);
    if (item) item.title = title;
    if (state.conv?.id === conversation_id) state.conv.title = title;
    renderHistory();
  }

  function stopStream() {
    state.stream?.controller.abort();
  }

  // ---------- Ações nas mensagens ----------
  function switchBranch(nodeId, dir) {
    const conv = state.conv;
    const node = conv.mapping[nodeId];
    const role = node.message.author.role;
    const siblings = conv.mapping[node.parent].children.filter(id => conv.mapping[id]?.message?.author?.role === role);
    const target = siblings[siblings.indexOf(nodeId) + dir];
    if (!target) return;
    let leaf = conv.mapping[target];
    while (leaf.children.length && conv.mapping[leaf.children[leaf.children.length - 1]]) {
      leaf = conv.mapping[leaf.children[leaf.children.length - 1]];
    }
    conv.current_node = leaf.id;
    state.error = null;
    renderThread();
    if (conv.id) api('/api/ask/branch', { id: conv.id, current_node: leaf.id }).catch(() => {});
  }

  async function setFeedback(nodeId, rating) {
    const conv = state.conv;
    const msg = conv.mapping[nodeId].message;
    const next = msg.metadata?.feedback === rating ? null : rating;
    msg.metadata = { ...msg.metadata, feedback: next || undefined };
    renderThread();
    flash(next ? 'Obrigado pelo seu feedback.' : 'Feedback removido.');
    if (!conv.id) return;
    try {
      await api('/api/ask/feedback', { id: conv.id, messageId: nodeId, rating: next });
    } catch {
      flash('Não foi possível salvar seu feedback.', true);
    }
  }

  function speak(id, text, onEnd) {
    stopSpeaking();
    const plain = el('div');
    renderMarkdownInto(plain, text);
    for (const head of plain.querySelectorAll('.sc-code-head')) head.remove();
    const utter = new SpeechSynthesisUtterance(plain.textContent.replace(/\s+/g, ' ').trim());
    utter.lang = 'pt-BR';
    const done = () => {
      if (state.speakingId !== id) return;
      state.speakingId = null;
      if (state.conv) renderThread();
      onEnd?.();
    };
    utter.onend = done;
    utter.onerror = done;
    state.speakingId = id;
    speechSynthesis.speak(utter);
    if (state.conv) renderThread();
  }

  function stopSpeaking() {
    if (!('speechSynthesis' in window)) return;
    const was = state.speakingId;
    state.speakingId = null;
    speechSynthesis.cancel();
    if (was && state.conv) renderThread();
  }

  // ---------- Compositor & anexos ----------
  function autosize() {
    const ta = els.prompt;
    ta.style.height = 'auto';
    let expanded = els.composer.classList.contains('expanded');
    if (!ta.value) expanded = false;
    else if (!expanded && (ta.value.includes('\n') || ta.scrollHeight > 40)) expanded = true;
    els.composer.classList.toggle('expanded', expanded);
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, window.innerHeight * 0.36)}px`;
    updateScrollButton();
  }

  function updateComposer() {
    const hasContent = Boolean(els.prompt.value.trim() || state.attachments.length);
    let mode;
    if (state.stream) mode = 'stop';
    else if (hasContent) mode = 'send';
    else if (SpeechRec) mode = 'voice';
    else mode = 'empty';
    const btn = els.sendBtn;
    btn.classList.toggle('active', mode === 'voice' && voice.active);
    if (btn.dataset.state === mode) return;
    btn.dataset.state = mode;
    btn.disabled = mode === 'empty';
    const cfg = {
      stop: ['stop', 'Parar geração'],
      send: ['arrowUp', 'Enviar mensagem'],
      voice: ['wave', 'Iniciar modo de voz'],
      empty: ['arrowUp', 'Enviar mensagem']
    }[mode];
    btn.innerHTML = icon(cfg[0], 18);
    btn.setAttribute('aria-label', cfg[1]);
    btn.title = cfg[1];
  }

  function renderAttachments() {
    els.attachments.textContent = '';
    for (const a of state.attachments) els.attachments.append(attachmentView(a, true));
    updateComposer();
    updateScrollButton();
  }

  async function imageToDataUrl(file) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return file.type === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9);
  }

  async function addFiles(files) {
    for (const file of files) {
      if (state.attachments.length >= MAX_ATTACHMENTS) {
        flash(`Você pode anexar até ${MAX_ATTACHMENTS} arquivos.`, true);
        break;
      }
      try {
        if (file.type.startsWith('image/')) {
          state.attachments.push({ id: uuid(), kind: 'image', name: file.name || 'imagem', size: file.size, dataUrl: await imageToDataUrl(file) });
        } else if ((file.type.startsWith('text/') || /json|xml|javascript|csv|yaml|sql/.test(file.type) || TEXT_EXT.test(file.name)) && file.size <= MAX_TEXT_FILE) {
          const text = await file.text();
          if (text.includes('\u0000')) throw new Error('binário');
          state.attachments.push({ id: uuid(), kind: 'file', name: file.name, size: file.size, text });
        } else {
          flash('Esse tipo ou tamanho de arquivo não é aceito aqui.', true);
        }
      } catch {
        flash(file.type.startsWith('image/') ? 'A imagem selecionada é inválida.' : 'Falha ao carregar arquivo.', true);
      }
    }
    renderAttachments();
    els.prompt.focus();
  }

  // ---------- Ditado e modo voz ----------
  function toggleDictation() {
    if (!SpeechRec) return;
    if (dictation) {
      dictation.stop();
      return;
    }
    const rec = new SpeechRec();
    rec.lang = navigator.language || 'pt-BR';
    rec.interimResults = true;
    rec.continuous = true;
    const base = els.prompt.value ? `${els.prompt.value.replace(/\s*$/, '')} ` : '';
    let finalText = '';
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      els.prompt.value = base + finalText + interim;
      autosize();
      updateComposer();
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed') flash('Permita o acesso ao microfone para ditar.', true);
      else if (e.error !== 'aborted' && e.error !== 'no-speech') flash('Não foi possível iniciar o ditado.', true);
    };
    rec.onend = () => {
      dictation = null;
      els.dictateBtn.classList.remove('listening');
      els.dictateBtn.setAttribute('aria-label', 'Iniciar ditado');
      els.dictateBtn.title = 'Ditar';
    };
    rec.start();
    dictation = rec;
    els.dictateBtn.classList.add('listening');
    els.dictateBtn.setAttribute('aria-label', 'Concluir ditado');
    els.dictateBtn.title = 'Concluir ditado';
  }

  function startVoice() {
    if (!SpeechRec || voice.active) return;
    voice.active = true;
    els.voiceBanner.hidden = false;
    updateComposer();
    listenForVoice();
  }

  function stopVoice() {
    voice.active = false;
    voice.rec?.abort();
    voice.rec = null;
    stopSpeaking();
    els.voiceBanner.hidden = true;
    updateComposer();
  }

  function listenForVoice() {
    if (!voice.active || state.stream) return;
    const rec = new SpeechRec();
    rec.lang = navigator.language || 'pt-BR';
    rec.interimResults = false;
    rec.continuous = false;
    let heard = false;
    els.voiceStatus.textContent = 'Ouvindo…';
    rec.onresult = e => {
      const text = e.results[0]?.[0]?.transcript?.trim();
      if (!text) return;
      heard = true;
      els.voiceStatus.textContent = 'Respondendo…';
      sendMessage({ text, attachments: [], parentId: state.conv?.current_node ?? null });
    };
    rec.onerror = e => {
      if (e.error === 'not-allowed') {
        flash('Permita o acesso ao microfone para usar o modo de voz.', true);
        stopVoice();
      }
    };
    rec.onend = () => {
      if (voice.rec === rec) voice.rec = null;
      if (voice.active && !heard && !state.stream) setTimeout(listenForVoice, 200);
    };
    voice.rec = rec;
    rec.start();
  }

  // ---------- Menus, modais e histórico ----------
  function openChatMenu(button, id) {
    closeMenus();
    const menu = els.chatMenu;
    menu.hidden = false;
    const r = button.getBoundingClientRect();
    const zoom = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    const top = (r.bottom / zoom) + 4 + menu.offsetHeight > (innerHeight / zoom)
      ? (r.top / zoom) - menu.offsetHeight - 4
      : (r.bottom / zoom) + 4;
    menu.style.top = `${Math.max(8, top)}px`;
    menu.style.left = `${Math.min(r.left / zoom, (innerWidth / zoom) - menu.offsetWidth - 10)}px`;
    state.menuConvId = id;
    button.closest('.sc-history-item')?.classList.add('menu-open');
  }

  async function finishRename(item, value) {
    if (state.renaming !== item.id) return;
    state.renaming = null;
    const title = value?.trim();
    if (title && title !== item.title) {
      item.title = title;
      if (state.conv?.id === item.id) state.conv.title = title;
      try {
        await api('/api/ask/rename', { id: item.id, title });
      } catch (err) {
        flash(err.message || 'Não foi possível renomear.', true);
      }
    }
    renderHistory();
  }

  function confirmDialog(title, text, okLabel = 'Excluir') {
    return new Promise(resolve => {
      els.confirmTitle.textContent = title;
      els.confirmText.textContent = text;
      els.confirmOk.textContent = okLabel;
      els.confirmOk.onclick = () => {
        resolve(true);
        els.confirmModal.close();
      };
      els.confirmModal.onclose = () => resolve(false);
      els.confirmModal.showModal();
    });
  }

  async function deleteConversation(id) {
    const item = state.list.find(c => c.id === id);
    const ok = await confirmDialog('Excluir chat?', `Isso vai excluir “${item?.title || DEFAULT_TITLE}”.`);
    if (!ok) return;
    try {
      await api('/api/ask/delete', { id });
      state.list = state.list.filter(c => c.id !== id);
      if (state.conv?.id === id) showHome();
      else renderHistory();
      flash('Conversa excluída.');
    } catch (err) {
      flash(err.message || 'Não foi possível excluir.', true);
    }
  }

  function openSearch() {
    closeMenus();
    closeSidebarOnMobile();
    els.searchInput.value = '';
    els.searchModal.showModal();
    runSearch();
    els.searchInput.focus();
  }

  async function runSearch() {
    const q = els.searchInput.value;
    let items = [];
    try {
      items = (await api(`/api/ask/search?q=${encodeURIComponent(q)}`)).items || [];
    } catch {}
    if (q !== els.searchInput.value) return;
    els.searchResults.textContent = '';
    searchSelected = 0;
    if (!q.trim()) els.searchResults.append(searchResult({ newChat: true }));
    if (items.length) els.searchResults.append(el('div', 'sc-search-section', q.trim() ? 'Resultados' : 'Recentes'));
    for (const item of items) els.searchResults.append(searchResult(item));
    if (!items.length && q.trim()) els.searchResults.append(el('div', 'sc-search-section', 'Nenhum resultado encontrado'));
    highlightSearch();
  }

  function searchResult(item) {
    const b = el('button', 'sc-search-result');
    b.type = 'button';
    b.dataset.scAction = item.newChat ? 'search-new' : 'search-open';
    if (!item.newChat) b.dataset.id = item.id;
    b.innerHTML = icon(item.newChat ? 'newChat' : 'temporary', 17);
    const text = el('span');
    text.append(document.createTextNode(item.newChat ? 'Novo chat' : (item.title || DEFAULT_TITLE)));
    if (item.snippet) text.append(el('small', null, item.snippet));
    b.append(text);
    return b;
  }

  function highlightSearch() {
    const items = [...els.searchResults.querySelectorAll('.sc-search-result')];
    items.forEach((node, idx) => node.classList.toggle('selected', idx === searchSelected));
    items[searchSelected]?.scrollIntoView({ block: 'nearest' });
  }

  function switchSettingsTab(tabName) {
    state.activeTab = tabName;
    root.querySelectorAll('[data-sc-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.scTab === tabName);
    });
    root.querySelectorAll('[data-sc-pane]').forEach(pane => {
      pane.classList.toggle('active', pane.dataset.scPane === tabName);
    });
  }

  function renderSkillsUI() {
    if (!els.skillsList) return;
    els.skillsList.textContent = '';
    const skills = state.skills || [];

    if (!skills.length) {
      const empty = el('div', 'sc-skills-empty');
      empty.innerHTML = `
        <div class="sc-empty-icon">🎯</div>
        <h4>Nenhuma habilidade adicionada</h4>
        <p>Habilidades permitem que o Graao execute tarefas avançadas sob demanda com prompts especializados ou arquivos <code>SKILL.md</code>.</p>
        <button type="button" class="primary" data-sc-action="open-skill-form">+ Adicionar primeira habilidade</button>
      `;
      els.skillsList.append(empty);
      return;
    }

    for (const skill of skills) {
      const item = el('div', `sc-skill-card ${skill.enabled === false ? 'is-disabled' : ''}`);
      item.dataset.id = skill.id;

      const mainCol = el('div', 'sc-skill-main');
      const head = el('div', 'sc-skill-head');
      const title = el('strong', 'sc-skill-title', skill.name);
      head.append(title);
      if (skill.description) {
        head.append(el('p', 'sc-skill-desc', skill.description));
      }

      const preview = el('div', 'sc-skill-preview', (skill.instructions || '').slice(0, 160) + (skill.instructions?.length > 160 ? '…' : ''));
      mainCol.append(head, preview);

      const actionsCol = el('div', 'sc-skill-actions');

      const switchLabel = el('label', 'sc-switch');
      const switchInput = el('input');
      switchInput.type = 'checkbox';
      switchInput.checked = skill.enabled !== false;
      switchInput.dataset.scAction = 'toggle-skill';
      switchInput.dataset.id = skill.id;
      const slider = el('span', 'sc-slider');
      switchLabel.append(switchInput, slider);

      const editBtn = el('button', 'sc-icon-btn');
      editBtn.type = 'button';
      editBtn.dataset.scAction = 'edit-skill';
      editBtn.dataset.id = skill.id;
      editBtn.title = 'Editar habilidade';
      editBtn.innerHTML = icon('edit', 16);

      const delBtn = el('button', 'sc-icon-btn sc-btn-danger');
      delBtn.type = 'button';
      delBtn.dataset.scAction = 'delete-skill';
      delBtn.dataset.id = skill.id;
      delBtn.title = 'Excluir habilidade';
      delBtn.innerHTML = icon('trash', 16);

      actionsCol.append(switchLabel, editBtn, delBtn);
      item.append(mainCol, actionsCol);
      els.skillsList.append(item);
    }
  }

  function openSkillForm(skill = null) {
    els.skillForm.hidden = false;
    els.skillEditId.value = skill?.id || '';
    els.skillFormTitle.textContent = skill ? 'Editar Habilidade' : 'Nova Habilidade';
    els.skillName.value = skill?.name || '';
    els.skillDesc.value = skill?.description || '';
    els.skillInstructions.value = skill?.instructions || '';
    els.skillName.focus();
    els.skillsList.style.display = 'none';
  }

  function closeSkillForm() {
    els.skillForm.hidden = true;
    els.skillsList.style.display = '';
  }

  async function saveSkill() {
    const id = els.skillEditId.value.trim() || undefined;
    const name = els.skillName.value.trim();
    const description = els.skillDesc.value.trim();
    const instructions = els.skillInstructions.value.trim();

    if (!name) {
      flash('Informe o nome da habilidade.', true);
      els.skillName.focus();
      return;
    }
    if (!instructions) {
      flash('Informe as instruções da habilidade.', true);
      els.skillInstructions.focus();
      return;
    }

    try {
      const res = await api('/api/ask/skills', { id, name, description, instructions });
      state.skills = res.skills;
      closeSkillForm();
      renderSkillsUI();
      flash('Habilidade salva com sucesso.');
    } catch (err) {
      flash(err.message || 'Erro ao salvar habilidade.', true);
    }
  }

  async function deleteSkill(id) {
    const sk = (state.skills || []).find(s => s.id === id);
    const ok = await confirmDialog('Excluir habilidade?', `Deseja realmente remover "${sk?.name || 'esta habilidade'}"?`, 'Excluir');
    if (!ok) return;
    try {
      const res = await api('/api/ask/skills', { action: 'delete', id });
      state.skills = res.skills;
      renderSkillsUI();
      flash('Habilidade removida.');
    } catch (err) {
      flash(err.message || 'Erro ao excluir habilidade.', true);
    }
  }

  async function toggleSkill(id, enabled) {
    const sk = (state.skills || []).find(s => s.id === id);
    if (!sk) return;
    try {
      const res = await api('/api/ask/skills', { ...sk, enabled });
      state.skills = res.skills;
      renderSkillsUI();
      flash(enabled ? `Habilidade "${sk.name}" ativada.` : `Habilidade "${sk.name}" desativada.`);
    } catch (err) {
      flash(err.message || 'Erro ao atualizar habilidade.', true);
    }
  }

  async function importSkillFile(file) {
    if (!file) return;
    try {
      const rawMarkdown = await file.text();
      const res = await api('/api/ask/skills', { rawMarkdown });
      state.skills = res.skills;
      renderSkillsUI();
      flash(`Habilidade importada de "${file.name}".`);
    } catch (err) {
      flash(err.message || 'Erro ao importar arquivo de habilidade.', true);
    }
  }

  function openSettings(tab = 'general') {
    closeMenus();
    closeSidebarOnMobile();
    switchSettingsTab(tab);
    els.instructions.value = settings.instructions;
    els.providerInfo.textContent = state.config.mode === 'live'
      ? `Conectado à IA generativa · modelo atual: ${modelLabel(state.model)}.`
      : 'Usando o Assistente local com os dados da agência. Conecte sua chave da OpenAI para liberar modelos generativos completos.';
    renderSkillsUI();
    closeSkillForm();
    els.settingsModal.showModal();
  }

  // ---------- Eventos internos ----------
  root.addEventListener('click', async e => {
    const tabBtn = e.target.closest('[data-sc-tab]');
    if (tabBtn) {
      switchSettingsTab(tabBtn.dataset.scTab);
      return;
    }

    const target = e.target.closest('[data-sc-action]');
    if (!target) {
      if (!e.target.closest('.sc-menu') && !e.target.closest('[data-sc="model-btn"]') && !e.target.closest('[data-sc="plus-btn"]')) closeMenus();
      if (e.target === els.composer || e.target.classList?.contains('sc-composer-row')) els.prompt.focus();
      return;
    }
    const action = target.dataset.scAction;
    const turnId = target.closest('.sc-turn')?.dataset.id;
    const menuConvId = state.menuConvId;
    if (action !== 'chat-more') closeMenus();

    switch (action) {
      case 'toggle-sidebar': toggleSidebar(); break;
      case 'new-chat': e.preventDefault(); newChat(); break;
      case 'open-search': openSearch(); break;
      case 'open-settings': openSettings(); break;
      case 'open-openai':
        if (els.settingsModal.open) els.settingsModal.close();
        onOpenOpenAISettings?.();
        break;
      case 'toggle-temporary':
        state.temporary = !state.temporary;
        if (state.conv) showHome();
        else render();
        break;
      case 'quick-prompt':
        submitPrompt(target.dataset.q || '');
        break;
      case 'open-conv':
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        openConversation(target.closest('.sc-history-item').dataset.id);
        break;
      case 'chat-more': {
        const id = target.closest('.sc-history-item').dataset.id;
        if (state.menuConvId === id) closeMenus();
        else openChatMenu(target, id);
        break;
      }
      case 'rename-chat':
        state.renaming = menuConvId;
        renderHistory();
        break;
      case 'delete-chat':
        if (menuConvId) deleteConversation(menuConvId);
        break;
      case 'pick-model':
        state.model = target.dataset.model;
        writeStorage(MODEL_KEY, state.model);
        renderModels();
        break;
      case 'attach':
        els.fileInput.click();
        break;
      case 'remove-attachment':
        state.attachments = state.attachments.filter(a => a.id !== target.dataset.id);
        renderAttachments();
        break;
      case 'copy-code': {
        const code = target.closest('.sc-code-block').querySelector('code').textContent;
        try {
          await navigator.clipboard.writeText(code);
          const label = target.querySelector('span');
          target.querySelector('svg').outerHTML = icon('check', 14);
          label.textContent = 'Copiado';
          setTimeout(() => {
            if (!target.isConnected) return;
            target.querySelector('svg').outerHTML = icon('copy', 14);
            label.textContent = 'Copiar código';
          }, 2000);
        } catch {
          flash('Não foi possível copiar o código.', true);
        }
        break;
      }
      case 'copy-msg': {
        const msg = state.conv.mapping[turnId].message;
        try {
          await navigator.clipboard.writeText(messageText(msg));
          flash(msg.author.role === 'user' ? 'Mensagem copiada.' : 'Resposta copiada.');
        } catch {
          flash('Não foi possível copiar.', true);
        }
        break;
      }
      case 'edit-msg':
        state.editing = turnId;
        renderThread();
        break;
      case 'edit-cancel':
        state.editing = null;
        renderThread();
        break;
      case 'edit-send':
        submitEdit(turnId, target.closest('.sc-edit-box').querySelector('textarea').value);
        break;
      case 'branch-prev':
      case 'branch-next':
        switchBranch(turnId, action === 'branch-prev' ? -1 : 1);
        break;
      case 'feedback-up':
      case 'feedback-down':
        setFeedback(turnId, action === 'feedback-up' ? 'up' : 'down');
        break;
      case 'read-aloud':
        if (state.speakingId === turnId) stopSpeaking();
        else speak(turnId, messageText(state.conv.mapping[turnId].message));
        break;
      case 'regenerate':
        regenerate(state.conv.mapping[turnId].parent);
        break;
      case 'retry-error':
        if (state.error) regenerate(state.error.parentId);
        break;
      case 'toggle-reasoning':
        target.closest('.sc-reasoning')?.classList.toggle('open');
        break;
      case 'open-image': {
        const blob = await (await fetch(target.src)).blob();
        window.open(URL.createObjectURL(blob), '_blank', 'noopener');
        break;
      }
      case 'close-modal':
        target.closest('dialog')?.close();
        break;
      case 'search-new':
        els.searchModal.close();
        newChat();
        break;
      case 'search-open':
        els.searchModal.close();
        openConversation(target.dataset.id);
        break;
      case 'save-instructions': {
        const nextInstructions = els.instructions.value.trim();
        try {
          const saved = await api('/api/ask/settings', { instructions: nextInstructions });
          settings.instructions = saved.instructions ?? nextInstructions;
          writeStorage(STORAGE_KEY, settings);
          flash('Instruções personalizadas salvas.');
        } catch (err) {
          flash(err.message || 'Não foi possível salvar as instruções.', true);
        }
        break;
      }
      case 'import':
        els.importInput.click();
        break;
      case 'delete-all': {
        els.settingsModal.close();
        const ok = await confirmDialog('Excluir todos os chats?', 'Isso vai remover todas as conversas salvas desta agência.', 'Excluir tudo');
        if (!ok) break;
        try {
          await api('/api/ask/delete-all', {});
          state.list = [];
          showHome();
          flash('Todas as conversas foram excluídas.');
        } catch (err) {
          flash(err.message || 'Não foi possível excluir.', true);
        }
        break;
      }
      case 'import-skill-file':
        els.skillFileInput.click();
        break;
      case 'open-skill-form':
        openSkillForm();
        break;
      case 'cancel-skill-form':
        closeSkillForm();
        break;
      case 'save-skill':
        await saveSkill();
        break;
      case 'edit-skill':
        openSkillForm((state.skills || []).find(s => s.id === target.dataset.id));
        break;
      case 'delete-skill':
        await deleteSkill(target.dataset.id);
        break;
      case 'stop-voice':
        stopVoice();
        break;
    }
  });

  root.addEventListener('change', async e => {
    const target = e.target;
    if (target.dataset.scAction === 'toggle-skill') {
      await toggleSkill(target.dataset.id, target.checked);
      return;
    }
    if (target === els.skillFileInput) {
      if (target.files?.[0]) {
        await importSkillFile(target.files[0]);
        target.value = '';
      }
      return;
    }
  });

  els.modelBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = els.modelMenu.hidden;
    closeMenus();
    els.modelMenu.hidden = !open;
    els.modelBtn.setAttribute('aria-expanded', String(open));
  });

  els.plusBtn.addEventListener('click', e => {
    e.stopPropagation();
    const open = els.plusMenu.hidden;
    closeMenus();
    els.plusMenu.hidden = !open;
    els.plusBtn.setAttribute('aria-expanded', String(open));
  });

  els.dictateBtn.addEventListener('click', toggleDictation);

  els.composer.addEventListener('submit', e => {
    e.preventDefault();
    const mode = els.sendBtn.dataset.state;
    if (mode === 'stop') stopStream();
    else if (mode === 'send') submitPrompt();
    else if (mode === 'voice') (voice.active ? stopVoice() : startVoice());
  });

  els.prompt.addEventListener('input', () => {
    autosize();
    updateComposer();
  });

  els.prompt.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !isTouch()) {
      e.preventDefault();
      if (!state.stream) submitPrompt();
    }
  });

  els.prompt.addEventListener('paste', e => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  });

  els.fileInput.addEventListener('change', () => {
    addFiles([...els.fileInput.files]);
    els.fileInput.value = '';
  });

  els.content.addEventListener('dragenter', e => {
    if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
    dragDepth += 1;
    els.dropOverlay.hidden = false;
  });
  els.content.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) els.dropOverlay.hidden = true;
  });
  els.content.addEventListener('dragover', e => {
    if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
  });
  els.content.addEventListener('drop', e => {
    e.preventDefault();
    dragDepth = 0;
    els.dropOverlay.hidden = true;
    if (e.dataTransfer?.files?.length) addFiles([...e.dataTransfer.files]);
  });

  els.scroller.addEventListener('scroll', () => {
    pinned = nearBottom();
    updateScrollButton();
  });
  els.scrollDown.addEventListener('click', () => scrollToBottom(true));

  els.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 150);
  });
  els.searchInput.addEventListener('keydown', e => {
    const items = els.searchResults.querySelectorAll('.sc-search-result');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      searchSelected = (searchSelected + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % Math.max(items.length, 1);
      highlightSearch();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[searchSelected]?.click();
    }
  });

  els.importInput.addEventListener('change', async () => {
    const file = els.importInput.files[0];
    els.importInput.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const { imported } = await api('/api/ask/import', Array.isArray(data) ? { conversations: data } : data);
      const refreshed = await api('/api/ask/state');
      state.list = refreshed.items || [];
      renderHistory();
      flash(imported === 1 ? '1 conversa importada.' : `${imported} conversas importadas.`);
    } catch (err) {
      flash(`Não foi possível importar: ${err.message}`, true);
    }
  });

  for (const dialog of root.querySelectorAll('dialog')) {
    dialog.addEventListener('click', e => {
      if (e.target === dialog) dialog.close();
    });
  }

  function onGlobalKeydown(e) {
    if (!mounted || !root.isConnected) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && e.shiftKey && key === 'o') {
      e.preventDefault();
      newChat();
    } else if (mod && e.shiftKey && key === 's') {
      e.preventDefault();
      toggleSidebar();
    } else if (e.shiftKey && e.key === 'Escape') {
      e.preventDefault();
      els.prompt.focus();
    } else if (e.key === 'Escape') {
      closeMenus();
      if (voice.active) stopVoice();
    }
  }

  function onResize() {
    if (!mounted || !root.isConnected) return;
    autosize();
    updateScrollButton();
  }

  document.addEventListener('keydown', onGlobalKeydown);
  window.addEventListener('resize', onResize);

  async function refreshState(targetConvId = '') {
    try {
      const data = await api('/api/ask/state');
      state.config = data.config || state.config;
      state.models = data.config?.models?.length ? data.config.models : ['local'];
      if (!state.model || !state.models.includes(state.model)) {
        state.model = data.config?.defaultModel || state.models[0] || 'local';
      }
      state.list = data.items || [];
      if (typeof data.instructions === 'string') {
        settings.instructions = data.instructions;
        writeStorage(STORAGE_KEY, settings);
      }
      if (Array.isArray(data.skills)) {
        state.skills = data.skills;
      }
      state.loaded = true;
      render();
      if (targetConvId && state.conv?.id !== targetConvId) {
        await openConversation(targetConvId, { updateHash: false });
      }
    } catch (err) {
      flash(err.message || 'Não foi possível carregar o chat do Graao.', true);
    }
  }

  function mount(host, { conversationId = '' } = {}) {
    if (!host) return;
    mounted = true;
    if (root.parentElement !== host) {
      host.textContent = '';
      host.append(root);
    }
    updateComposer();
    if (!state.loaded) {
      render();
      void refreshState(conversationId);
    } else if (conversationId && state.conv?.id !== conversationId) {
      void openConversation(conversationId, { updateHash: false });
    } else {
      render();
    }
    requestAnimationFrame(() => {
      autosize();
      if (!state.conv) els.prompt.focus();
    });
  }

  function unmount() {
    mounted = false;
    closeMenus();
    stopVoice();
    stopSpeaking();
    if (dictation) {
      try { dictation.stop(); } catch {}
      dictation = null;
    }
  }

  function reset() {
    unmount();
    if (state.stream) state.stream.controller.abort();
    state.loaded = false;
    state.conv = null;
    state.list = [];
    state.error = null;
    state.editing = null;
  }

  return { mount, unmount, reset, refreshState };
}
