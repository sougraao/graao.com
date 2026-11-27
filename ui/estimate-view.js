// Public estimate page (/orcamento/<workspace>#token): the client sees the quote, picks optional items and
// approves (typing their name) or declines; once invoiced, pays through AbacatePay. The token stays in the
// fragment, out of logs, referrers and the payment gateway.
import { getLanguage, langToggle, setLanguage, translateDom } from './i18n.js';

const token = location.hash.slice(1);
const workspace = location.pathname.split('/')[2];
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const day = value => /^\d{4}-\d{2}-\d{2}/.test(value || '') ? value.slice(0, 10).split('-').reverse().join('/') : '';
const say = (pt, es) => getLanguage() === 'es' ? es : pt;
let view = null;

try { if (!localStorage.getItem('graao_lang') && /^es/i.test(navigator.language || '')) await setLanguage('es'); } catch {}

async function api(action, data = {}) {
  const response = await fetch(`/api/orcamento/${encodeURIComponent(workspace)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token, ...data })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(result.error || say('Não foi possível abrir este orçamento.', 'No fue posible abrir este presupuesto.'));
  return result;
}
const notice = (text, tone = '') => { const box = $('notice'); box.textContent = text; box.className = `ds-notice ${tone}`; box.hidden = !text; };

function recalc() {
  let total = 0, subtotal = 0;
  const taxes = new Map();
  for (const row of document.querySelectorAll('#doc [data-products] tbody tr')) {
    const box = row.querySelector('[data-item]'), counts = !box || box.checked;
    row.classList.toggle('off', !counts);
    if (!counts) continue;
    total += Number(row.dataset.line) || 0;
    subtotal += Number(row.dataset.net) || 0;
    const tax = Number(row.dataset.tax) || 0;
    if (tax) taxes.set(row.dataset.taxKey, (taxes.get(row.dataset.taxKey) || 0) + tax);
  }
  const cell = document.querySelector('#doc [data-total]');
  if (cell) cell.textContent = money(total);
  const sub = document.querySelector('#doc [data-subtotal]');
  if (sub) sub.textContent = money(subtotal);
  for (const line of document.querySelectorAll('#doc [data-tax-sum]')) line.textContent = money(taxes.get(line.dataset.taxSum) || 0);
  $('total').textContent = money(total);
}

function renderPay(v) {
  const box = $('pay');
  box.hidden = !v.invoice;
  if (!v.invoice) return;
  const el = (tag, props = {}) => Object.assign(document.createElement(tag), props);
  const paid = v.invoice.status === 'Paid';
  const kids = [el('h2', { textContent: say('Pagamento', 'Pago') }),
    el('p', { textContent: say(`Fatura de ${money(v.invoice.value)}, vence em ${day(v.invoice.due)}.`, `Factura de ${money(v.invoice.value)}, vence el ${day(v.invoice.due)}.`) })];
  const status = el('p', { className: 'form-status' });
  if (paid) kids.push(el('p', { className: 'ds-paid', textContent: say('Pagamento confirmado. Obrigado!', 'Pago confirmado. ¡Gracias!') }));
  else if (v.payable && v.online) {
    const button = el('button', { type: 'button', className: 'primary', textContent: say('Pagar agora', 'Pagar ahora') });
    button.addEventListener('click', async () => {
      button.disabled = true; status.textContent = '';
      try { location.href = (await api('pay')).url; } catch (error) { status.textContent = error.message; button.disabled = false; }
    });
    kids.push(el('p', { className: 'dim', textContent: say('Pix ou cartão, pelo AbacatePay.', 'Pix o tarjeta, por AbacatePay.') }), button);
  } else if (v.payable) kids.push(el('p', { className: 'dim', textContent: say(`${v.sender || 'Quem enviou'} vai combinar a cobrança com você.`, `${v.sender || 'Quien envió'} acordará el cobro contigo.`) }));
  kids.push(status);
  box.replaceChildren(...kids);
}

function render() {
  const v = view;
  document.title = `${v.number} · ${v.sender || 'Graao'}`;
  $('title').textContent = v.title;
  $('sender').textContent = say(`Orçamento ${v.number} de ${v.sender}`, `Presupuesto ${v.number} de ${v.sender}`);
  $('doc').innerHTML = v.html;
  $('print').hidden = false;
  const messages = {
    sent: say(`Confira o orçamento${v.expiresAt ? `, válido até ${day(v.expiresAt)}` : ''}. Marque os itens opcionais que quiser e aprove ou recuse.`, `Revisa el presupuesto${v.expiresAt ? `, válido hasta ${day(v.expiresAt)}` : ''}. Marca los ítems opcionales que quieras y apruébalo o recházalo.`),
    accepted: say(`Orçamento aprovado por ${v.acceptedBy}. Obrigado!`, `Presupuesto aprobado por ${v.acceptedBy}. ¡Gracias!`),
    invoiced: say(`Orçamento aprovado por ${v.acceptedBy}. A fatura está logo abaixo.`, `Presupuesto aprobado por ${v.acceptedBy}. La factura está abajo.`),
    declined: say(`Orçamento recusado${v.declinedReason ? `: “${v.declinedReason}”` : '.'}`, `Presupuesto rechazado${v.declinedReason ? `: “${v.declinedReason}”` : '.'}`),
    expired: say('A validade deste orçamento terminou. Fale com quem enviou para receber uma nova versão.', 'Este presupuesto venció. Habla con quien lo envió para recibir una nueva versión.')
  };
  notice(messages[v.status] || '', ['accepted', 'invoiced'].includes(v.status) ? 'ok' : ['declined', 'expired'].includes(v.status) ? 'warn' : '');
  $('bar').hidden = !v.canAnswer;
  if (v.canAnswer) {
    for (const box of document.querySelectorAll('#doc [data-item]')) box.addEventListener('change', recalc);
    recalc();
  }
  renderPay(v);
  if (getLanguage() !== 'pt') translateDom(document.body);
}

$('accept').addEventListener('click', async () => {
  $('error').textContent = '';
  const name = $('name').value.trim();
  if (!name) { $('error').textContent = say('Informe seu nome para aprovar.', 'Escribe tu nombre para aprobar.'); $('name').focus(); return; }
  $('accept').disabled = true;
  try {
    const items = [...document.querySelectorAll('#doc [data-item]')].filter(box => box.checked).map(box => box.dataset.item);
    view = await api('accept', { name, items });
    render();
    scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) { $('error').textContent = error.message; }
  $('accept').disabled = false;
});
$('decline').addEventListener('click', () => { $('refuse').showModal(); if (getLanguage() !== 'pt') translateDom($('refuse')); });
$('refuse-cancel').addEventListener('click', () => $('refuse').close());
$('refuse-ok').addEventListener('click', async () => {
  try { view = await api('decline', { reason: $('reason').value }); $('refuse').close(); render(); }
  catch (error) { $('refuse').close(); $('error').textContent = error.message; }
});
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
      : say('O pagamento não foi concluído. Abra de novo o link do orçamento que você recebeu por e-mail.', 'El pago no se completó. Abre de nuevo el enlace del presupuesto que recibiste por correo.'), paid === 'ok' ? 'ok' : 'warn');
    return;
  }
  if (!/^[0-9a-f]{48}$/.test(token)) { notice(say('Este link não é válido. Use o link completo que você recebeu.', 'Este enlace no es válido. Usa el enlace completo que recibiste.'), 'warn'); $('title').textContent = say('Link inválido', 'Enlace no válido'); return; }
  try { view = await api('open'); render(); }
  catch (error) { notice(error.message, 'warn'); $('title').textContent = say('Orçamento indisponível', 'Presupuesto no disponible'); }
  if (getLanguage() !== 'pt') translateDom(document.body);
})();
