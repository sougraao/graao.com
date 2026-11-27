// Public signing page (/assinar/<workspace>#token): shows the document the server rendered for this
// person, fills their fields (text, date, checkbox, drawn or typed signature), optional items, the
// e-signature consent, and signs or declines. The token stays in the fragment, out of logs and referrers.
import { getLanguage, langToggle, setLanguage, translateDom } from './i18n.js';
import { toast } from './toast.js';

const token = location.hash.slice(1);
const workspace = location.pathname.split('/')[2];
const $ = id => document.getElementById(id);
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const values = {};
let view = null, padField = null, mode = 'draw', drawn = false;

// Static text is written in Portuguese and translated by translateDom after each render.
try { if (!localStorage.getItem('graao_lang') && /^es/i.test(navigator.language || '')) await setLanguage('es'); } catch {}

async function api(action, data = {}) {
  const response = await fetch(`/api/assinar/${encodeURIComponent(workspace)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token, ...data })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(result.error || 'Não foi possível abrir este documento.');
  return result;
}

// Messages built at run time (with names and dates) have their own Spanish version.
const say = (pt, es) => getLanguage() === 'es' ? es : pt;
const notice = (text, tone = '') => { const box = $('notice'); box.textContent = text; box.className = `ds-notice ${tone}`; box.hidden = !text; };
const roleVerb = role => role === 'approver' ? 'aprovar' : 'assinar';
const stateText = { waiting: 'Na fila', sent: 'Aguardando', viewed: 'Abriu', signed: 'Assinou', declined: 'Recusou' };

function render() {
  const v = view;
  document.title = `${v.title} · ${v.sender || 'Graao'}`;
  $('title').textContent = v.title;
  $('sender').textContent = v.sender ? say(`Enviado por ${v.sender}`, `Enviado por ${v.sender}`) : say('Documento para assinatura', 'Documento para firmar');
  $('doc').innerHTML = v.html;
  const sheet = document.querySelector('#doc .dc-sheet');
  if (sheet && /^#[0-9a-f]{6}$/i.test(v.accent)) sheet.style.setProperty('--dc-accent', v.accent);
  $('certificate').innerHTML = v.certificate || '';
  $('certificate').hidden = !v.certificate;
  $('print').hidden = v.status !== 'completed';
  const people = $('people');
  people.hidden = v.recipients.length < 2 && v.status !== 'completed';
  people.replaceChildren(...v.recipients.map(row => {
    const item = document.createElement('li');
    item.className = `ds-person ${row.status}`;
    const name = document.createElement('b'); name.textContent = row.name; name.dataset.noTranslate = '1';
    const status = document.createElement('span'); status.textContent = stateText[row.status] || row.status;
    item.append(name, status);
    return item;
  }));

  const deadline = v.expiresAt ? v.expiresAt.split('-').reverse().join('/') : '';
  const approver = v.me.role === 'approver';
  if (v.status === 'completed') notice(v.intact === false
    ? say('Documento assinado por todos. Atenção: o conteúdo mudou desde a conclusão (um arquivo pode ter sido removido).', 'Documento firmado por todos. Atención: el contenido cambió desde la finalización (puede que se haya eliminado un archivo).')
    : say('Documento assinado por todos. Abaixo está a cópia final com o certificado de conclusão.', 'Documento firmado por todos. Abajo está la copia final con el certificado de finalización.'), v.intact === false ? 'warn' : 'ok');
  else if (v.status === 'void') notice(say('Este documento foi anulado pelo remetente e não aceita mais assinaturas.', 'El remitente anuló este documento y ya no acepta firmas.'), 'warn');
  else if (v.status === 'declined') notice(say(`Este documento foi recusado${v.declinedReason ? `: “${v.declinedReason}”` : '.'}`, `Este documento fue rechazado${v.declinedReason ? `: “${v.declinedReason}”` : '.'}`), 'warn');
  else if (v.status === 'expired') notice(say('O prazo para assinar este documento terminou. Fale com o remetente para receber uma nova versão.', 'Terminó el plazo para firmar este documento. Habla con el remitente para recibir una nueva versión.'), 'warn');
  else if (v.me.status === 'signed') notice(v.waitingFor.length
    ? say(`Você já ${approver ? 'aprovou' : 'assinou'}. Falta: ${v.waitingFor.join(', ')}. A cópia final chega por e-mail quando todos assinarem.`, `Ya ${approver ? 'aprobaste' : 'firmaste'}. Falta: ${v.waitingFor.join(', ')}. La copia final llega por correo cuando todos firmen.`)
    : say('Você já assinou.', 'Ya firmaste.'), 'ok');
  else if (v.canSign) notice(say(`${v.me.name}, confira o documento e preencha os campos marcados como seus para ${roleVerb(v.me.role)}.${deadline ? ` Prazo: ${deadline}.` : ''}`,
    `${v.me.name}, revisa el documento y completa los campos marcados como tuyos para ${approver ? 'aprobar' : 'firmar'}.${deadline ? ` Plazo: ${deadline}.` : ''}`));
  else notice('');

  renderPayment(v);
  $('bar').hidden = !v.canSign;
  $('sign').textContent = v.me.role === 'approver' ? 'Aprovar documento' : 'Assinar documento';
  if (v.canSign) hydrate();
  if (getLanguage() !== 'pt') translateDom(document.body);
}

function renderPayment(v) {
  const box = $('pay'), pay = v.payment;
  box.hidden = !pay || ['void', 'declined', 'expired'].includes(v.status) || pay.status === 'none';
  if (box.hidden) return;
  const el = (tag, props = {}, ...kids) => { const node = Object.assign(document.createElement(tag), props); node.append(...kids.filter(Boolean)); return node; };
  const head = el('h2', { textContent: say('Pagamento', 'Pago') });
  if (v.status !== 'completed') {
    const when = pay.timing === 'invoice' ? say('com fatura enviada junto com a cópia final', 'con factura enviada junto con la copia final') : say('logo depois que todos assinarem', 'justo después de que todos firmen');
    box.replaceChildren(head, el('p', { textContent: pay.mode === 'recurring'
      ? say(`Este documento cria uma assinatura mensal de ${money(v.total)}, ${when}.`, `Este documento crea una suscripción mensual de ${money(v.total)}, ${when}.`)
      : pay.installments > 1 ? say(`Valor total: ${money(v.total)}, em ${pay.installments} parcelas; a primeira é cobrada ${when}.`, `Valor total: ${money(v.total)}, en ${pay.installments} cuotas; la primera se cobra ${when}.`)
      : say(`Valor total: ${money(v.total)}, cobrado ${when}.`, `Valor total: ${money(v.total)}, cobrado ${when}.`) }));
    return;
  }
  const list = el('ul', { className: 'ds-pay-list' }, ...pay.parts.map(part => el('li', {},
    el('span', { textContent: part.title }), el('small', { textContent: `${say('vence', 'vence')} ${new Date(part.due).toLocaleDateString('pt-BR')}` }),
    el('b', { textContent: money(part.value) }), el('em', { className: part.status === 'Paid' ? 'paid' : '', textContent: part.status === 'Paid' ? say('Paga', 'Pagada') : say('Em aberto', 'Pendiente') }))));
  const sub = pay.subscription ? el('p', { textContent: say(`Assinatura mensal de ${money(pay.subscription.amount)}: ${{ pending: 'aguardando a primeira mensalidade', active: 'ativa', cancelled: 'cancelada' }[pay.subscription.status] || ''}.`,
    `Suscripción mensual de ${money(pay.subscription.amount)}: ${{ pending: 'esperando la primera cuota', active: 'activa', cancelled: 'cancelada' }[pay.subscription.status] || ''}.`) }) : null;
  const status = el('p', { className: 'form-status' });
  let action = null;
  if (pay.status === 'paid') action = el('p', { className: 'ds-paid', textContent: say('Pagamento confirmado. Obrigado!', 'Pago confirmado. ¡Gracias!') });
  else if (pay.payable && pay.online) {
    action = el('button', { type: 'button', className: 'primary', textContent: pay.subscription ? say('Ativar assinatura', 'Activar suscripción') : say('Pagar agora', 'Pagar ahora') });
    action.addEventListener('click', async () => {
      action.disabled = true; status.textContent = '';
      try { const { url } = await api('pay'); location.href = url; }
      catch (error) { status.textContent = error.message; action.disabled = false; }
    });
  } else if (pay.payable) action = el('p', { className: 'dim', textContent: say(`O pagamento online ainda não está disponível. ${v.sender || 'Quem enviou'} vai combinar a cobrança com você.`, `El pago en línea aún no está disponible. ${v.sender || 'Quien envió'} acordará el cobro contigo.`) });
  box.replaceChildren(...[head, pay.parts.length ? list : null, sub, el('p', { className: 'dim', textContent: say('Pix ou cartão, pelo AbacatePay.', 'Pix o tarjeta, por AbacatePay.') }), action, status].filter(Boolean));
}

function hydrate() {
  for (const box of document.querySelectorAll('#doc [data-field]')) {
    const slot = box.querySelector('[data-slot]'), id = box.dataset.field, kind = box.dataset.kind, label = box.dataset.label;
    slot.replaceChildren();
    if (kind === 'text') {
      const input = Object.assign(document.createElement('input'), { value: values[id] || '', maxLength: 500, ariaLabel: label });
      input.addEventListener('input', () => { values[id] = input.value; progress(); });
      slot.append(input);
    } else if (kind === 'date') {
      if (box.dataset.mode === 'pick') {
        const input = Object.assign(document.createElement('input'), { type: 'date', value: values[id] || '', ariaLabel: label });
        input.addEventListener('input', () => { values[id] = input.value; progress(); });
        slot.append(input);
      } else slot.textContent = `${say('Hoje', 'Hoy')}, ${new Date().toLocaleDateString('pt-BR')}`;
    } else if (kind === 'checkbox') {
      const wrap = document.createElement('label'), input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: values[id] === true });
      input.addEventListener('change', () => { values[id] = input.checked; progress(); });
      wrap.append(input, document.createTextNode(` ${label}`));
      slot.append(wrap);
    } else {
      if (values[id]) {
        const img = Object.assign(document.createElement('img'), { src: values[id], alt: label, className: 'dc-sig' });
        slot.append(img);
      }
      const button = Object.assign(document.createElement('button'), { type: 'button', className: values[id] ? 'secondary ds-sign-btn small' : 'primary ds-sign-btn', textContent: values[id] ? 'Assinar de novo' : kind === 'initials' ? 'Rubricar' : 'Clique para assinar' });
      button.addEventListener('click', () => openPad(id, kind));
      slot.append(button);
    }
  }
  for (const box of document.querySelectorAll('#doc [data-item]')) box.addEventListener('change', recalc);
  progress();
}

function recalc() {
  for (const table of document.querySelectorAll('#doc [data-products]')) {
    let total = 0;
    for (const row of table.querySelectorAll('tbody tr')) {
      const box = row.querySelector('[data-item]');
      const counts = !box || box.checked;
      row.classList.toggle('off', !counts);
      if (counts) total += Number(row.dataset.line) || 0;
    }
    table.querySelector('[data-total]').textContent = money(total);
  }
}

function missing() {
  return view.fields.filter(field => field.required && !(field.kind === 'date' && field.mode !== 'pick'))
    .filter(field => field.kind === 'checkbox' ? values[field.id] !== true : !values[field.id]);
}
function progress() {
  const need = view.fields.filter(field => field.required && !(field.kind === 'date' && field.mode !== 'pick')).length;
  const left = missing().length;
  $('progress').textContent = need ? say(`${need - left} de ${need} campos obrigatórios preenchidos`, `${need - left} de ${need} campos obligatorios completados`)
    : say('Nenhum campo obrigatório para você.', 'No hay campos obligatorios para ti.');
}

/* Assinatura: desenhar ou digitar, sempre exportada como PNG. */
const canvas = $('canvas'), pen = canvas.getContext('2d');
function resetCanvas(target) { const ctx = target.getContext('2d'); ctx.clearRect(0, 0, target.width, target.height); }
function openPad(id, kind) {
  padField = { id, kind };
  $('pad-title').textContent = kind === 'initials' ? 'Sua rubrica' : 'Sua assinatura';
  resetCanvas(canvas); drawn = false;
  $('typed').value = kind === 'initials' ? view.me.name.split(/\s+/).map(part => part[0] || '').join('').toUpperCase().slice(0, 4) : view.me.name;
  drawTyped();
  setMode('draw');
  $('pad').showModal();
  if (getLanguage() !== 'pt') translateDom($('pad'));
}
function setMode(next) {
  mode = next;
  for (const tab of document.querySelectorAll('#pad [data-mode]')) tab.setAttribute('aria-selected', String(tab.dataset.mode === next));
  for (const panel of document.querySelectorAll('#pad [data-panel]')) panel.hidden = panel.dataset.panel !== next;
}
function drawTyped() {
  const target = $('preview'), ctx = target.getContext('2d');
  resetCanvas(target);
  ctx.fillStyle = '#101828';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = 84;
  const text = $('typed').value.trim();
  do { ctx.font = `${size}px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive`; size -= 4; } while (ctx.measureText(text).width > target.width - 40 && size > 24);
  ctx.fillText(text, target.width / 2, target.height / 2);
}
let last = null;
const point = event => { const box = canvas.getBoundingClientRect(); return [(event.clientX - box.left) * canvas.width / box.width, (event.clientY - box.top) * canvas.height / box.height]; };
canvas.addEventListener('pointerdown', event => { canvas.setPointerCapture(event.pointerId); last = point(event); });
canvas.addEventListener('pointermove', event => {
  if (!last) return;
  const next = point(event);
  pen.strokeStyle = '#101828'; pen.lineWidth = 4; pen.lineCap = 'round'; pen.lineJoin = 'round';
  pen.beginPath(); pen.moveTo(...last); pen.lineTo(...next); pen.stroke();
  last = next; drawn = true;
});
for (const name of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(name, () => { last = null; });
$('typed').addEventListener('input', drawTyped);
document.querySelectorAll('#pad [data-mode]').forEach(tab => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
$('clear').addEventListener('click', () => { if (mode === 'draw') { resetCanvas(canvas); drawn = false; } else { $('typed').value = ''; drawTyped(); } });
$('pad-cancel').addEventListener('click', () => $('pad').close());
$('pad-ok').addEventListener('click', () => {
  if (mode === 'draw' && !drawn) { toast.error(say('Desenhe sua assinatura ou use a aba Digitar.', 'Dibuja tu firma o usa la pestaña Escribir.')); return; }
  if (mode === 'type' && !$('typed').value.trim()) { toast.error(say('Digite seu nome.', 'Escribe tu nombre.')); return; }
  values[padField.id] = (mode === 'draw' ? canvas : $('preview')).toDataURL('image/png');
  $('pad').close();
  hydrate();
});

$('sign').addEventListener('click', async () => {
  $('error').textContent = '';
  const left = missing();
  if (left.length) {
    $('error').textContent = `${say('Falta preencher', 'Falta completar')}: ${left.map(field => field.label).join(', ')}.`;
    document.querySelector(`#doc [data-field="${CSS.escape(left[0].id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  if (!$('accept').checked) { $('error').textContent = 'Marque a caixa de concordância para assinar.'; return; }
  const button = $('sign');
  button.disabled = true;
  try {
    const items = [...document.querySelectorAll('#doc [data-item]')].filter(box => box.checked).map(box => box.dataset.item);
    view = await api('sign', { values, items, accept: true });
    render();
    scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) { $('error').textContent = error.message; }
  button.disabled = false;
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
    notice(paid === 'ok' ? say('Obrigado! Assim que o AbacatePay confirmar, o documento é marcado como pago. Você pode fechar esta página.', '¡Gracias! Cuando AbacatePay lo confirme, el documento se marcará como pagado. Puedes cerrar esta página.')
      : say('O pagamento não foi concluído. Abra de novo o link do documento que você recebeu por e-mail para tentar outra vez.', 'El pago no se completó. Abre de nuevo el enlace del documento que recibiste por correo para intentarlo otra vez.'), paid === 'ok' ? 'ok' : 'warn');
    return;
  }
  if (!/^[0-9a-f]{48}$/.test(token)) { notice('Este link não é válido. Use o link completo que você recebeu.', 'warn'); $('title').textContent = 'Link inválido'; return; }
  try { view = await api('open'); render(); }
  catch (error) { notice(error.message, 'warn'); $('title').textContent = 'Documento indisponível'; }
  if (getLanguage() !== 'pt') translateDom(document.body);
})();
