// Tela "Confirme seu celular": aparece quando a API responde 402 (agência sem celular confirmado,
// convidado de agência ainda não ativada ou agência bloqueada). A confirmação é a pessoa mandando
// "Confirmar graao XXXXXX" pelo WhatsApp; a tela consulta /api/verify/status até a mensagem chegar.
import { qrSvg } from './qr.js';
import { domainBrand } from './icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const POLL_MS = 3000;
const LIMIT_MS = 15 * 60000;

/** A frase para cada resposta da espera; vazia quando é só continuar esperando. */
export function statusMessage({ status, reason } = {}) {
  if (status === 'waiting' && reason === 'lid') return 'A mensagem chegou sem o número. Abra o WhatsApp no celular deste número e envie de novo.';
  if (status === 'refused' && reason === 'other-phone') return 'A mensagem veio de outro número. Gere um novo código e envie do celular que você digitou.';
  if (status === 'refused' && reason === 'phone-taken') return 'Este número já tem uma conta no graao. Use outro número ou fale com o suporte.';
  if (status === 'expired') return 'Este código venceu. Gere outro e envie em até 15 minutos.';
  return '';
}

const errorLine = error => `<p class="vf-error" role="alert">${esc(error || '')}</p>`;

export function verifyView(state = {}, marca = domainBrand()) {
  if (state.step === 'waiting') {
    return `<section class="vf-card">
      <h1>Mande a mensagem no WhatsApp</h1>
      <p>Envie a mensagem pronta pelo WhatsApp do celular <strong>${esc(state.phone)}</strong>. Esta tela continua sozinha quando ela chegar.</p>
      <a class="primary vf-open" href="${esc(state.link)}" target="_blank" rel="noopener">Abrir o WhatsApp</a>
      <figure class="vf-qr">${qrSvg(state.link, { size: 184, label: 'QR para abrir o WhatsApp no celular' })}
        <figcaption>No computador? Leia este QR com a câmera do celular.</figcaption></figure>
      <p class="vf-code">Código: <strong>${esc(state.code)}</strong></p>
      <p class="vf-wait" aria-live="polite">Esperando a sua mensagem…</p>
      ${errorLine(state.error)}
      <button type="button" class="secondary" data-vf-reset>Usar outro número</button>
    </section>`;
  }
  return `<section class="vf-card">
    <h1>Confirme seu celular</h1>
    <p>${marca ? 'Para continuar, confirme o celular com WhatsApp do responsável pela conta.' : 'Cada conta do graao fica ligada a um celular com WhatsApp. Depois da confirmação você tem 15 dias de teste grátis, sem cartão.'}</p>
    <form data-vf-form>
      <label>Celular com WhatsApp
        <input type="tel" name="phone" autocomplete="tel" inputmode="tel" required placeholder="(11) 91234-5678" value="${esc(state.phone || '')}">
      </label>
      <p class="vf-hint">Fora do Brasil? Comece com + e o código do país.</p>
      ${errorLine(state.error)}
      <button type="submit" class="primary" ${state.busy ? 'disabled' : ''}>Confirmar pelo WhatsApp</button>
    </form>
  </section>`;
}

const titles = { AGENCY_BLOCKED: 'Agência bloqueada', SIGNUP_CLOSED: 'Cadastro fechado', NOT_INVITED: 'Acesso não liberado' };

/** O que cobre o app enquanto a agência não pode usar: formulário para o dono, aviso para os outros casos. */
export function gateView({ code, error } = {}, state = { step: 'form' }, marca = domainBrand()) {
  const inner = code === 'PHONE_REQUIRED' ? verifyView(state, marca)
    : `<section class="vf-card"><h1>${titles[code] || 'Quase lá'}</h1><p>${esc(error)}</p></section>`;
  // White Label: no domínio da agência, o topo mostra o logotipo ou o nome dela no lugar do graao.
  const brand = !marca ? 'graao' : marca.logo ? `<img class="vf-brand-logo" src="${esc(marca.logo)}" alt="${esc(marca.name)}">` : esc(marca.name);
  const leave = code === 'NOT_INVITED' ? 'Entrar com outra conta' : 'Sair';
  return `<div class="vf-brand">${brand}</div>${inner}<button type="button" class="vf-logout" data-vf-logout>${leave}</button>`;
}

export function mountGate(root, { code, error, api, onDone, open = link => window.open(link, '_blank', 'noopener') }) {
  const box = document.createElement('div');
  box.className = 'vf-gate';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  root.append(box);
  let state = { step: 'form' }, timer = 0, started = 0;
  const paint = () => { box.innerHTML = gateView({ code, error }, state); box.querySelector('input,a.vf-open')?.focus(); };
  const stop = () => { clearInterval(timer); timer = 0; };
  async function poll() {
    if (Date.now() - started > LIMIT_MS) { stop(); state = { step: 'form', phone: state.phone, error: statusMessage({ status: 'expired' }) }; return paint(); }
    try {
      const result = await api('/api/verify/status');
      if (result.status === 'verified') { stop(); box.remove(); return onDone(); }
      const message = statusMessage(result);
      if (result.status === 'waiting') { if (message !== (state.error || '')) { state.error = message; paint(); } return; }
      stop();
      state = { step: 'form', phone: state.phone, error: message || 'Gere um novo código.' };
      paint();
    } catch { /* a rede volta; a próxima consulta tenta de novo */ }
  }
  box.addEventListener('submit', async event => {
    if (!event.target.matches('[data-vf-form]')) return;
    event.preventDefault();
    const phone = new FormData(event.target).get('phone');
    state = { step: 'form', phone, busy: true };
    paint();
    try {
      const started_ = await api('/api/verify/start', { phone });
      state = { step: 'waiting', phone, link: started_.link, code: started_.code };
      paint();
      open(started_.link);
      started = Date.now();
      stop();
      timer = setInterval(poll, POLL_MS);
    } catch (e) {
      state = { step: 'form', phone, error: e.message };
      paint();
    }
  });
  box.addEventListener('click', async event => {
    if (event.target.closest('[data-vf-reset]')) { stop(); state = { step: 'form', phone: state.phone }; paint(); }
    if (event.target.closest('[data-vf-logout]')) {
      await fetch('/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
      location.replace('/login');
    }
  });
  paint();
  return { close: () => { stop(); box.remove(); } };
}
