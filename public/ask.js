// Perguntas da graao: substituem confirm(), prompt() e alert() do navegador (estilos em ask.css).
//
//   if (!await ask('Excluir esta marca?', { text: 'A IA deixa de usar a voz dela.', ok: 'Excluir' })) return;
//   const url = await askText('Endereço do link', { type: 'url', ok: 'Inserir' });   // null se cancelar
//   await tell('Não foi possível ativar', error.message);
//
// `danger` (padrão em ask) deixa o botão vermelho e o foco inicial em Cancelar; use danger: false quando
// a ação não apaga nem interrompe nada. O texto é escrito em português e o observador do i18n traduz os
// elementos assim que entram na página. Nunca use os diálogos nativos (test/ask.test.mjs barra).

const ICONS = {
  danger: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  question: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  edit: '<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'
};
const EXIT_MS = 220;

let current = null;   // só uma pergunta por vez: uma nova cancela a anterior
let serial = 0;

function open({ title, text = '', ok, cancel = 'Cancelar', tone, field = null }) {
  current?.(null);
  const id = `ask-${++serial}`;
  const el = document.createElement('dialog');
  el.className = 'ask';
  el.dataset.tone = tone;
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-labelledby', `${id}-title`);
  if (text) el.setAttribute('aria-describedby', `${id}-text`);
  el.innerHTML = `<form class="ask-form" novalidate><span class="ask-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[tone]}</svg></span>
    <div class="ask-body"><h2 id="${id}-title"></h2>${text ? `<p id="${id}-text"></p>` : ''}</div>
    <div class="ask-actions">${cancel ? '<button type="button" class="ask-button ask-cancel"></button>' : ''}<button type="submit" class="ask-button ask-ok"></button></div></form>`;
  // Tudo que vem de fora entra como texto: nomes de registros nunca viram HTML.
  el.querySelector('h2').textContent = title;
  if (text) el.querySelector('p').textContent = text;
  el.querySelector('.ask-ok').textContent = ok;
  const cancelButton = el.querySelector('.ask-cancel');
  if (cancelButton) cancelButton.textContent = cancel;

  let input = null;
  if (field) {
    input = document.createElement(field.multiline ? 'textarea' : 'input');
    if (!field.multiline) input.type = field.type || 'text';
    input.className = 'ask-field';
    input.value = field.value || '';
    input.placeholder = field.placeholder || '';
    input.readOnly = !!field.readonly;
    input.setAttribute('aria-labelledby', `${id}-title`);
    el.querySelector('.ask-body').append(input);
  }

  return new Promise(resolve => {
    const finish = value => {
      if (current !== finish) return;
      current = null;
      el.close();   // devolve o foco para onde estava
      setTimeout(() => el.remove(), EXIT_MS);
      resolve(value);
    };
    current = finish;
    let pressed = null;
    el.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
    el.addEventListener('close', () => finish(null));
    el.addEventListener('mousedown', event => { pressed = event.target; });
    el.addEventListener('click', event => { if (event.target === el && pressed === el) finish(null); });
    el.addEventListener('submit', event => { event.preventDefault(); finish(input ? input.value : true); });
    cancelButton?.addEventListener('click', () => finish(null));
    // Os atalhos e formulários da página ouvem no document; o que acontece aqui dentro não é deles.
    for (const type of ['keydown', 'keyup', 'mousedown', 'click', 'input', 'change', 'submit']) el.addEventListener(type, event => event.stopPropagation());
    document.body.append(el);
    el.showModal();
    if (input) { input.focus(); input.select(); }
    else (tone === 'danger' && cancelButton || el.querySelector('.ask-ok')).focus();
  });
}

/** Pergunta de sim ou não. Resolve true só quando a pessoa confirma. */
export async function ask(title, { text = '', ok = 'Confirmar', cancel = 'Cancelar', danger = true } = {}) {
  return await open({ title, text, ok, cancel, tone: danger ? 'danger' : 'question' }) === true;
}

/** Pede um texto. Resolve a resposta, ou null se a pessoa cancelar. */
export function askText(title, { text = '', ok = 'Continuar', cancel = 'Cancelar', ...field } = {}) {
  return open({ title, text, ok, cancel, tone: 'edit', field });
}

/** Aviso que precisa ser lido antes de seguir. Para avisos comuns, use toast/flash. */
export async function tell(title, text = '') {
  await open({ title, text, ok: 'Entendi', cancel: '', tone: 'info' });
}

/** Texto para copiar à mão, quando o navegador não deixa usar a área de transferência. */
export async function showCopy(title, value) {
  await open({ title, ok: 'Fechar', cancel: '', tone: 'info', field: { value, readonly: true } });
}
