// Public invoice page (/fatura/<workspace>#token): the client sees the invoice and pays through AbacatePay.
// The token stays in the fragment, out of logs, referrers and the payment gateway.
import { getLanguage, langToggle, setLanguage, translateDom } from './i18n.js';

const token = location.hash.slice(1);
const workspace = location.pathname.split('/')[2];
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const day = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0, 10).split('-').reverse().join('/') : '';
const say = (pt, es) => getLanguage() === 'es' ? es : pt;
let view = null;

try { if (!localStorage.getItem('graao_lang') && /^es/i.test(navigator.language || '')) await setLanguage('es'); } catch {}

async function api(action) {
  const response = await fetch(`/api/fatura/${encodeURIComponent(workspace)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(result.error || say('Não foi possível abrir esta fatura.', 'No fue posible abrir esta factura.'));
  return result;
}
const notice = (text, tone = '') => { const box = $('notice'); box.textContent = text; box.className = `ds-notice ${tone}`; box.hidden = !text; };

function renderPay(v) {
  const box = $('pay');
  const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  box.hidden = false;
  const kids = [el('h2', { textContent: say('Pagamento', 'Pago') }),
    el('p', { textContent: say(`Total de ${money(v.value)}${v.due ? `, vence em ${day(v.due)}` : ''}.`, `Total de ${money(v.value)}${v.due ? `, vence el ${day(v.due)}` : ''}.`) })];
  const status = el('p', { className: 'form-status' });
  if (v.state === 'refunded') kids.push(el('p', { className: 'dim', textContent: say('O pagamento desta fatura foi devolvido.', 'El pago de esta factura fue devuelto.') }));
  else if (v.state === 'mismatch') kids.push(el('p', { className: 'dim', textContent: say('Recebemos um pagamento com valor diferente. Fale com quem enviou a fatura.', 'Recibimos un pago con un valor diferente. Hable con quien envió la factura.') }));
  else if (v.status === 'Paid') kids.push(el('p', { className: 'ds-paid', textContent: v.receipt ? say(`Pagamento confirmado. ${v.receipt.title} ${v.receipt.number}. Obrigado!`, `Pago confirmado. ${v.receipt.title} ${v.receipt.number}. ¡Gracias!`)
    : say('Pagamento confirmado. Obrigado!', 'Pago confirmado. ¡Gracias!') }));
  else if (v.status === 'Void') kids.push(el('p', { className: 'dim', textContent: say('Esta fatura foi cancelada.', 'Esta factura fue cancelada.') }));
  else if (v.payable && v.online) {
    const button = el('button', { type: 'button', className: 'primary', textContent: say('Pagar agora', 'Pagar ahora') });
    button.addEventListener('click', async () => {
      button.disabled = true; status.textContent = '';
      try { location.href = (await api('pay')).url; } catch (error) { status.textContent = error.message; button.disabled = false; }
    });
    kids.push(el('p', { className: 'dim', textContent: say('Pix ou cartão, pelo AbacatePay.', 'Pix o tarjeta, por AbacatePay.') }), button);
  } else if (v.payable) kids.push(el('p', { className: 'dim', textContent: say(`${v.sender || 'Quem enviou'} vai combinar a forma de pagamento com você.`, `${v.sender || 'Quien envió'} acordará la forma de pago contigo.`) }));
  kids.push(status);
  box.replaceChildren(...kids);
}

function render() {
  const v = view;
  document.title = `${v.number || say('Fatura', 'Factura')} · ${v.sender || 'Graao'}`;
  $('title').textContent = v.title;
  $('sender').textContent = v.receipt ? `${v.receipt.title} ${v.receipt.number} · ${v.sender}` : v.number ? say(`Fatura ${v.number} de ${v.sender}`, `Factura ${v.number} de ${v.sender}`) : say(`Fatura de ${v.sender}`, `Factura de ${v.sender}`);
  $('doc').innerHTML = v.html;
  $('print').hidden = false;
  const overdue = v.status === 'Open' && v.due && v.due.slice(0, 10) < new Date().toISOString().slice(0, 10);
  notice(v.state === 'refunded' ? say('O pagamento desta fatura foi devolvido.', 'El pago de esta factura fue devuelto.') : v.status === 'Paid' ? say('Esta fatura está paga.', 'Esta factura está pagada.') : v.status === 'Void' ? say('Esta fatura foi cancelada.', 'Esta factura fue cancelada.')
    : overdue ? say(`O vencimento foi em ${day(v.due)}. Você ainda pode pagar por aqui.`, `El vencimiento fue el ${day(v.due)}. Aún puedes pagar aquí.`) : '', v.status === 'Paid' ? 'ok' : overdue || v.status === 'Void' ? 'warn' : '');
  renderPay(v);
  if (getLanguage() !== 'pt') translateDom(document.body);
}

$('print').addEventListener('click', () => print());
$('lang').innerHTML = langToggle();
$('lang').addEventListener('click', async event => {
  const button = event.target.closest('[data-lang-choice]');
  if (!button) return;
  await setLanguage(button.dataset.langChoice);
  if (view) render();
});

(async () => {
  const paid = new URLSearchParams(location.search).get('pagamento');
  if (!token && paid) {
    $('title').textContent = paid === 'ok' ? say('Pagamento recebido', 'Pago recibido') : say('Pagamento não concluído', 'Pago no completado');
    notice(paid === 'ok' ? say('Obrigado! Assim que o AbacatePay confirmar, a fatura é marcada como paga. Você pode fechar esta página.', '¡Gracias! Cuando AbacatePay lo confirme, la factura se marcará como pagada. Puedes cerrar esta página.')
      : say('O pagamento não foi concluído. Abra de novo o link da fatura que você recebeu por e-mail.', 'El pago no se completó. Abre de nuevo el enlace de la factura que recibiste por correo.'), paid === 'ok' ? 'ok' : 'warn');
    return;
  }
  if (!/^[0-9a-f]{48}$/.test(token)) { notice(say('Este link não é válido. Use o link completo que você recebeu.', 'Este enlace no es válido. Usa el enlace completo que recibiste.'), 'warn'); $('title').textContent = say('Link inválido', 'Enlace no válido'); return; }
  try { view = await api('open'); render(); }
  catch (error) { notice(error.message, 'warn'); $('title').textContent = say('Fatura indisponível', 'Factura no disponible'); }
  if (getLanguage() !== 'pt') translateDom(document.body);
})();
