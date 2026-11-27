// Menu do perfil: a conta aberta, as outras contas conectadas neste navegador, adicionar conta e sair.
// As sessões ficam em cookies HttpOnly (auth.mjs); aqui só chegam nome, e-mail, foto e agência.
import { setTabAccount } from './account-guard.js';
import { ask } from './ask.js';
import { tr } from './i18n.js';
import { icon as i } from './icons.js';
import { toast } from './toast.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const face = (account, size = '') => `<span class="acc-face ${size}" aria-hidden="true">${account.picture
  ? `<img src="${esc(account.picture)}" alt="" referrerpolicy="no-referrer">` : esc(initials(account.name))}</span>`;
const agencyLine = account => account.agency ? `<span class="acc-agency">${esc(account.agency)}</span>` : '';

/** Conteúdo do menu. `list` é a resposta de /api/auth/accounts; null enquanto carrega. */
export function accountsMenu(current, list, { failed = false } = {}) {
  const others = list?.others || [];
  const full = list && 1 + others.filter(account => account.connected).length >= list.max;
  const rows = others.map(account => `<li class="acc-row">
      <button type="button" class="acc-item" data-acc="switch" data-id="${esc(account.id)}">
        ${face(account)}<span class="acc-text"><b>${esc(account.name)}</b><span>${esc(account.email)}</span>${account.connected
          ? agencyLine(account) : `<span class="acc-off">${tr('Sessão encerrada · entrar de novo')}</span>`}</span>
      </button>
      <button type="button" class="icon-btn acc-remove" data-acc="remove" data-id="${esc(account.id)}" aria-label="${esc(`${tr('Remover deste navegador')}: ${account.email}`)}" title="${esc(tr('Remover deste navegador'))}">${i('close', 15)}</button>
    </li>`).join('');
  const body = failed ? `<p class="acc-note" role="alert">${tr('Não foi possível carregar as outras contas.')}</p>`
    : !list ? `<p class="acc-note" role="status">${tr('Carregando contas…')}</p>`
      : rows && `<ul class="acc-list" aria-label="${esc(tr('Outras contas'))}">${rows}</ul>`;
  return `<div class="acc-current">${face(current, 'acc-face-lg')}<span class="acc-text"><b>${esc(current.name)}</b><span>${esc(current.email)}</span>${agencyLine(list?.current || current)}</span><span class="acc-check" title="${esc(tr('Conta aberta'))}">${i('check', 16)}<span class="acc-sr">${tr('Conta aberta')}</span></span></div>
    <div class="acc-body">${body}</div>
    <div class="acc-actions">
      <button type="button" class="acc-item" data-acc="add" ${full ? 'disabled' : ''}><span class="acc-face acc-face-icon" aria-hidden="true">${i('plus', 16)}</span><span class="acc-text"><b>${tr('Adicionar conta')}</b>${full ? `<span>${tr('Limite de contas deste navegador atingido')}</span>` : ''}</span></button>
      <button type="button" class="acc-item" data-acc="sign-out"><span class="acc-face acc-face-icon" aria-hidden="true">${i('logout', 16)}</span><span class="acc-text"><b>${others.length ? tr('Sair desta conta') : tr('Sair')}</b></span></button>
      ${others.length ? `<button type="button" class="acc-item" data-acc="sign-out-all"><span class="acc-face acc-face-icon" aria-hidden="true">${i('logout', 16)}</span><span class="acc-text"><b>${tr('Sair de todas')}</b></span></button>` : ''}
    </div>`;
}

async function post(operation, body) {
  const response = await fetch(`/api/auth/${operation}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(Error(data.error || tr('Não foi possível concluir. Tente de novo.')), { status: response.status, code: data.code });
  return data;
}
async function loadAccounts() {
  const response = await fetch('/api/auth/accounts');
  if (!response.ok) throw Error('accounts');
  return response.json();
}

// Onde cada conta estava neste navegador (só conveniência: o servidor confere o acesso de novo).
const placeKey = id => `go.place:${id}`;
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* sem armazenamento */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* sem armazenamento */ } }
};
// O endereço da página sem o que era da conta anterior.
function cleanAddress(hash = '') {
  const search = new URLSearchParams(location.search);
  for (const key of ['workspace', 'conta', 'recarregar']) search.delete(key);
  return location.pathname + (search.size ? `?${search}` : '') + hash;
}

/**
 * @param {object} o
 * @param {() => {id:string,name:string,email:string,picture?:string}|undefined} o.session  conta desta aba
 * @param {() => Promise<unknown>} [o.beforeLeave]  grava o que estiver pendente antes de trocar
 */
export function installAccounts({ session, beforeLeave = async () => {} }) {
  let menu = null, list = null, closedAt = 0, seenId = '', notice = null, working = false;
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('graao-account') : null;
  const announce = account => channel?.postMessage({ id: account?.id || '', name: account?.name || '' });

  // ---- Trocar, adicionar, sair --------------------------------------------
  async function readyToLeave() {
    await beforeLeave();
    // Os editores avisam no beforeunload que têm algo sem salvar; a pergunta vem antes de a conta mudar.
    const check = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(check);
    if (check.defaultPrevented && !await ask(tr('Trocar sem salvar?'), { text: tr('Há alterações não salvas nesta tela. Se continuar, elas se perdem.'), ok: tr('Continuar sem salvar') })) return false;
    window.addEventListener('beforeunload', event => event.stopImmediatePropagation(), true);
    return true;
  }
  function rememberPlace() {
    const current = session();
    if (current) store.set(placeKey(current.id), JSON.stringify({ workspace: store.get('go.workspace') || '', hash: location.hash }));
  }
  function enter(id, url, name = '') {
    let place = null;
    try { place = JSON.parse(store.get(placeKey(id))); } catch { /* sem lugar guardado */ }
    if (place?.workspace) store.set('go.workspace', place.workspace); else store.remove('go.workspace');
    store.remove('go.user');
    announce({ id, name });
    history.replaceState(null, '', cleanAddress(/^#[\w/-]+$/.test(place?.hash || '') ? place.hash : new URL(url, location.href).hash));
    location.reload();
  }
  async function google(input) {
    const { url } = await post('google', { next: cleanAddress(), ...input });
    rememberPlace();
    location.assign(url);
  }
  async function switchTo(id) {
    const account = list?.others.find(row => row.id === id);
    if (!account || !await readyToLeave()) return;
    if (!account.connected) return google({ account: id });
    try {
      const { url } = await post('switch', { id });
      rememberPlace();
      enter(id, url, account.name);
    } catch (error) {
      if (error.code !== 'ACCOUNT_SIGNED_OUT') throw error;
      await google({ account: id });
    }
  }
  async function signOut(all = false) {
    if (!await readyToLeave()) return;
    const leaving = [session()?.id, ...(all ? (list?.others || []).map(row => row.id) : [])];
    let result;
    try { result = await post('logout', { all }); }
    catch (error) {
      if (!error.status) throw error;   // sem rede: nada mudou
      result = { url: '/app' };         // o navegador já esqueceu a conta; o servidor decide para onde ir
    }
    for (const id of leaving) store.remove(placeKey(id));
    if (result.account) { enter(result.account, result.url, list?.others.find(row => row.id === result.account)?.name); return; }
    store.remove('go.workspace');
    store.remove('go.user');
    announce(null);
    location.assign(result.url);
  }
  async function remove(id) {
    await post('remove', { id });
    store.remove(placeKey(id));
    list = await loadAccounts();
    draw();
    toast.success(tr('Conta removida deste navegador.'));
  }

  // ---- Menu ----------------------------------------------------------------
  function draw(state) {
    if (!menu || !session()) return;
    const focused = menu.contains(document.activeElement) && document.activeElement.dataset.acc;
    menu.innerHTML = accountsMenu(session(), list, state);
    if (focused) (menu.querySelector(`[data-acc="${focused}"]`) || menu.querySelector('button:not(:disabled)'))?.focus();
  }
  function place(button) {
    const box = button.getBoundingClientRect();
    menu.style.top = `${Math.round(box.bottom + 8)}px`;
    menu.style.right = `${Math.max(12, Math.round(innerWidth - box.right))}px`;
  }
  function build() {
    menu = document.createElement('div');
    menu.className = 'g-menu-surface acc-menu';
    menu.id = 'acc-menu';
    menu.popover = 'auto';
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-label', tr('Contas'));
    // beforetoggle é síncrono: o toggle chegaria depois do clique no avatar que fechou o menu.
    menu.addEventListener('beforetoggle', event => {
      const open = event.newState === 'open';
      if (open) menu.dataset.open = ''; else { delete menu.dataset.open; closedAt = performance.now(); }
      document.querySelector('[data-act="account"]')?.setAttribute('aria-expanded', String(open));
    });
    menu.addEventListener('click', async event => {
      const button = event.target.closest('[data-acc]');
      if (!button || working) return;
      event.stopPropagation();
      const { acc, id } = button.dataset;
      working = true;
      menu.setAttribute('aria-busy', 'true');
      try {
        if (acc === 'switch') await switchTo(id);
        else if (acc === 'remove') await remove(id);
        else if (acc === 'add') { if (await readyToLeave()) await google({ add: true }); }
        else if (acc === 'sign-out') await signOut();
        else if (acc === 'sign-out-all' && await ask(tr('Sair de todas as contas?'), { text: tr('Você vai precisar entrar com o Google de novo em cada uma neste navegador.'), ok: tr('Sair de todas') })) await signOut(true);
      } catch (error) {
        toast.error(error.status ? error.message : tr('Sem conexão. Tente de novo.'));
      } finally {
        working = false;
        menu.removeAttribute('aria-busy');
      }
    });
    document.body.append(menu);
    window.addEventListener('resize', () => { const button = document.querySelector('[data-act="account"]'); if (button && menu.matches(':popover-open')) place(button); });
  }
  async function toggle(button) {
    if (!session()) return;
    if (!menu) build();
    // O clique no próprio avatar fecha pelo popover antes de chegar aqui.
    if (menu.matches(':popover-open') || performance.now() - closedAt < 200) { if (menu.matches(':popover-open')) menu.hidePopover(); return; }
    draw();
    place(button);
    menu.showPopover();
    menu.dataset.open = '';   // o evento toggle chega depois; sem isto o menu ainda está invisível e não recebe foco
    menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    try { list = await loadAccounts(); draw(); }
    catch { if (!list) draw({ failed: true }); }
  }

  // ---- Outras abas ---------------------------------------------------------
  // Só avisa e espera: recarregar sozinho jogaria fora o que a pessoa estava escrevendo nesta aba.
  async function changedElsewhere(account) {
    const mine = session();
    if (!mine || notice || working) return;
    if (!account) {
      try { account = (await loadAccounts()).current; } catch { return; }
      if (!account) { location.assign('/login'); return; }
      if (account.id === mine.id || notice) return;
    }
    const el = document.createElement('dialog');
    el.className = 'ask';
    el.dataset.tone = 'question';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-labelledby', 'acc-changed');
    el.innerHTML = `<form class="ask-form" method="dialog"><span class="ask-icon" aria-hidden="true">${i('users', 20)}</span>
      <div class="ask-body"><h2 id="acc-changed">${tr('Você trocou de conta em outra aba')}</h2><p>${tr('Esta aba ainda mostra a conta')} <b data-mine></b>. ${tr('Nada é salvo nela até você escolher em qual conta continuar.')}</p></div>
      <div class="ask-actions"><button type="button" class="ask-button ask-cancel" data-back></button><button type="button" class="ask-button ask-ok" data-go></button></div></form>`;
    el.querySelector('[data-mine]').textContent = mine.email;
    el.querySelector('[data-back]').textContent = `${tr('Voltar para')} ${mine.name.split(' ')[0]}`;
    el.querySelector('[data-go]').textContent = `${tr('Continuar como')} ${(account.name || '').split(' ')[0]}`;
    el.addEventListener('cancel', event => event.preventDefault());
    // O navegador fecha no segundo Esc (ou no voltar do celular) mesmo com o cancel impedido: o aviso volta até haver escolha.
    el.addEventListener('close', () => { if (notice === el) el.showModal(); });
    for (const type of ['keydown', 'keyup', 'mousedown', 'click', 'input', 'change', 'submit']) el.addEventListener(type, event => event.stopPropagation());
    el.querySelector('[data-go]').addEventListener('click', () => {
      window.addEventListener('beforeunload', event => event.stopImmediatePropagation(), true);
      enter(account.id, '/app', account.name);
    });
    el.querySelector('[data-back]').addEventListener('click', async () => {
      try { await post('switch', { id: mine.id }); announce(mine); dismiss(); }
      catch (error) {
        if (error.code === 'ACCOUNT_SIGNED_OUT') { try { await google({ account: mine.id }); return; } catch { /* cai no aviso */ } }
        toast.error(error.status ? error.message : tr('Sem conexão. Tente de novo.'));
      }
    });
    notice = el;
    document.body.append(el);
    el.showModal();
  }
  function dismiss() {
    notice?.close();
    notice?.remove();
    notice = null;
  }
  channel?.addEventListener('message', ({ data }) => {
    const mine = session();
    if (!mine) return;
    if (data?.id === mine.id) { dismiss(); return; }
    dismiss();
    if (data?.id) void changedElsewhere(data); else location.assign('/login');
  });
  window.addEventListener('graao:account-changed', () => void changedElsewhere());
  window.addEventListener('graao:languagechange', () => draw());

  // ---- Voltas do Google ----------------------------------------------------
  const returned = /^\/(app|painel)\/?$/.test(location.pathname) && new URLSearchParams(location.search).get('conta');
  if (returned) {
    history.replaceState(null, '', cleanAddress(location.hash));
    if (returned === 'limite') toast.error(tr('Limite de contas deste navegador atingido. Remova uma para adicionar outra.'));
    else toast.error(tr('A conta não foi adicionada. Tente de novo.'));
  }

  return {
    toggle,
    /** Chamada quando a API diz quem é a conta desta aba: prende a aba a ela e avisa as outras. */
    seen(account) {
      if (!account || seenId === account.id) return;
      seenId = account.id;
      setTabAccount(account.id);
      announce(account);
    }
  };
}
