// Pagamentos → Pedidos e Checkouts abandonados (GoHighLevel's /payments/v2/orders and abandoned-checkouts).
// Pedidos: store orders and offer sales in one list (status tabs, period, search, CSV), with the order
// details and the status form of store orders. Checkouts abandonados: carts left after the e-mail was filled,
// with recovery status, reminders, the notification settings and CSV.
import { icon } from './icons.js';
import { h, fmt, pageShell, search } from './screens.js';
import { crmTabs } from './crm.js';
import { checkoutStatuses, checkoutTabs, checkoutVariables, abandonedDefaults, orderRows, orderStatusNames, orderTabs } from './checkout-data.js';

const ov = { status: 'all', from: '', to: '', open: '', cstatus: 'all' };
const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
const badge = (label, tone = '') => `<span class="badge ${tone}">${h(label)}</span>`;
const tabsOf = current => ({ key: 'payments', items: crmTabs.payments, current, label: 'Seções de pagamentos' });
const lower = value => String(value || '').toLocaleLowerCase('pt-BR');
const day = (iso, zone) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: zone || 'UTC' }).format(new Date(iso)); } catch { return String(iso || '').slice(0, 10); } };
const inPeriod = (iso, zone) => (!ov.from || day(iso, zone) >= ov.from) && (!ov.to || day(iso, zone) <= ov.to);
const itemsText = items => items.map(line => `${line.qty} × ${line.name}`).join(', ');
const units = items => items.reduce((n, line) => n + (Number(line.qty) || 0), 0);

function download(name, rows) {
  const csv = rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })), download: name });
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/* ───────── Pedidos ───────── */

function visibleOrders(c) {
  const q = lower(c.query).trim(), zone = c.s.profile.timezone;
  return orderRows(c.s).filter(row => inPeriod(row.created, zone) && (!q || [row.number, row.name, row.email, row.source, itemsText(row.items)].some(value => lower(value).includes(q))));
}

function orderDetail(c, row) {
  const zone = c.s.profile.timezone, order = row.order;
  const items = `<ul>${row.items.map(line => `<li>${line.qty} × <span data-no-translate="1">${h(line.name)}</span> <span class="dim">${money(line.price)}</span> <b>${money(line.total)}</b></li>`).join('')}</ul>`;
  if (row.kind === 'offer') return `<div class="st-order"><div><h3>Itens</h3>${items}<p><b>Total: ${money(row.total)}</b></p></div>
    <div><h3>Pagamento</h3><p>Venda de oferta, cobrada pela fatura ${h(row.invoice.number || row.invoice.title)}.</p><p><a class="text-link" href="#payments/invoices">Ver em Faturas</a></p></div></div>`;
  return `<div class="st-order"><div><h3>Itens</h3>${items}
      <dl class="st-sums"><div><dt>Subtotal</dt><dd>${money(order.subtotal)}</dd></div>${order.discount ? `<div><dt>Desconto ${h(order.coupon)}</dt><dd>−${money(order.discount)}</dd></div>` : ''}
        <div><dt>${order.delivery === 'shipping' ? 'Frete' : 'Retirada'}</dt><dd>${order.delivery === 'shipping' ? (order.shipping ? money(order.shipping) : 'Grátis') : '—'}</dd></div>${order.tax ? `<div><dt>Impostos</dt><dd>${money(order.tax)}</dd></div>` : ''}<div><dt>Total</dt><dd><b>${money(order.total)}</b></dd></div></dl></div>
    <div><h3>Entrega</h3>${order.address ? `<p>${h(order.address.street)}, ${h(order.address.number)}${order.address.complement ? ` – ${h(order.address.complement)}` : ''}<br>${h(order.address.district)} · ${h(order.address.city)}/${h(order.address.state)} · CEP ${h(order.address.zip)}</p>` : '<p>Retirada na loja</p>'}
      ${order.phone ? `<p>Telefone: ${h(order.phone)}</p>` : ''}${order.note ? `<p><b>Observação:</b> <span data-no-translate="1">${h(order.note)}</span></p>` : ''}<p class="dim">Feito em ${h(fmt(order.created, zone, true))}.</p><p><a class="text-link" href="#payments/invoices">Ver fatura</a></p></div>
    <form class="st-order-form" data-or-form="${h(order.id)}"><h3>Andamento</h3><label>Status<select name="status"${order.status === 'Cancelled' ? ' disabled' : ''}>${Object.entries(orderStatusNames).map(([status, [label]]) => `<option value="${status}"${order.status === status ? ' selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Código de rastreio<input name="tracking" value="${h(order.tracking || '')}" maxlength="120"></label><button class="primary"${order.status === 'Cancelled' ? ' disabled' : ''}>Salvar andamento</button>
      <p class="dim">Pago fecha a fatura e registra a transação. Entregue dispara o gatilho “Pedido entregue”. Cancelado devolve o estoque e o cupom e anula a fatura.</p></form></div>`;
}

function ordersScreen(c) {
  const all = visibleOrders(c), zone = c.s.profile.timezone;
  const rows = all.filter(row => ov.status === 'all' || row.status === ov.status);
  const paid = all.filter(row => ['Paid', 'Fulfilled'].includes(row.status));
  const table = rows.length ? `<div class="surface table-shell"><table class="site-table fm-subs"><thead><tr><th scope="col">Pedido</th><th scope="col">Cliente</th><th scope="col">Origem</th><th scope="col">Itens</th>
      <th scope="col">Data</th><th scope="col" class="right">Valor</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Detalhes</span></th></tr></thead>
    <tbody>${rows.slice(0, 300).map(row => { const [label, tone] = orderStatusNames[row.status] || [row.status, '']; const open = ov.open === row.id;
      return `<tr class="${open ? 'open' : ''}"><td><b>${h(row.number)}</b></td><td>${h(row.name || '—')}<small class="dim">${h(row.email)}</small></td><td data-no-translate="1">${h(row.source)}</td>
        <td>${units(row.items)}<small class="dim" data-no-translate="1">${h(itemsText(row.items).slice(0, 60))}</small></td><td>${h(fmt(row.created, zone, true))}</td><td class="right"><b>${money(row.total)}</b></td><td>${badge(label, tone)}</td>
        <td><button class="text-link" data-or-open="${h(row.id)}" aria-expanded="${open}">${open ? 'Fechar' : 'Detalhes'}</button></td></tr>${open ? `<tr class="fm-answers"><td colspan="8">${orderDetail(c, row)}</td></tr>` : ''}`; }).join('')}</tbody></table></div>`
    : `<div class="surface empty">${icon('box', 26)}<strong>${orderRows(c.s).length ? 'Nenhum pedido aqui' : 'Nenhum pedido ainda'}</strong><p>${orderRows(c.s).length ? 'Tente outra situação, período ou busca.' : 'Os pedidos das lojas (Sites → Lojas) e as vendas de ofertas aparecem aqui.'}</p></div>`;
  return pageShell({ title: 'Pagamentos', desc: 'Pedidos das lojas e vendas de ofertas, num só lugar.',
    cta: `<button type="button" class="secondary" data-or-act="export"${rows.length ? '' : ' disabled'}>${icon('download', 15)} Exportar CSV</button>`,
    tabs: tabsOf('orders'),
    content: `<div class="metrics three"><div class="surface metric"><span>Pedidos no período</span><b>${all.length}</b></div><div class="surface metric"><span>Pagos</span><b>${money(paid.reduce((n, row) => n + row.total, 0))}</b></div>
      <div class="surface metric"><span>Pendentes</span><b>${all.filter(row => row.status === 'Pending').length}</b></div></div>
      <div class="dc-page"><div class="dc-segment" role="group" aria-label="Situação dos pedidos">${orderTabs.map(([value, text]) =>
        `<button type="button" data-or-status="${value}" aria-pressed="${ov.status === value}">${text} <span>${all.filter(row => value === 'all' || row.status === value).length}</span></button>`).join('')}</div>
      <div class="toolbar dc-toolbar">${search(c.query, 'Buscar por cliente, número, origem ou item…')}<label class="or-date">De<input type="date" data-or-period="from" value="${h(ov.from)}"></label><label class="or-date">Até<input type="date" data-or-period="to" value="${h(ov.to)}"></label></div>
      ${table}</div>` });
}

/* ───────── Checkouts abandonados ───────── */

function visibleCheckouts(c) {
  const q = lower(c.query).trim(), zone = c.s.profile.timezone;
  const stores = new Map((c.s.stores || []).map(row => [row.id, row.name]));
  return (c.s.abandonedCheckouts || []).filter(row => inPeriod(row.created, zone) && (!q || [row.name, row.email, stores.get(row.storeId), itemsText(row.items)].some(value => lower(value).includes(q))))
    .sort((a, b) => String(b.abandonedAt || b.updated).localeCompare(String(a.abandonedAt || a.updated)));
}
const recoveryText = (row, zone) => row.status === 'recovered' ? `Recuperado em ${fmt(row.recoveredAt, zone, true)}`
  : row.recovery?.sent ? `${row.recovery.sent} lembrete${row.recovery.sent === 1 ? '' : 's'} · último ${fmt(row.recovery.lastSentAt, zone, true)}` : row.status === 'abandoned' ? 'Sem lembrete' : '—';

function checkoutsScreen(c) {
  const all = visibleCheckouts(c), zone = c.s.profile.timezone, cfg = { ...abandonedDefaults(), ...(c.s.paymentSettings?.abandoned || {}) };
  const stores = new Map((c.s.stores || []).map(row => [row.id, row.name]));
  const rows = all.filter(row => ov.cstatus === 'all' || row.status === ov.cstatus);
  const lost = all.filter(row => ['abandoned', 'recovered'].includes(row.status)), recovered = all.filter(row => row.status === 'recovered');
  const table = rows.length ? `<div class="surface table-shell"><table><thead><tr><th scope="col">Feito por</th><th scope="col">Data</th><th scope="col">Itens</th><th scope="col" class="right">Valor</th>
      <th scope="col">Status</th><th scope="col">Recuperação</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
    <tbody>${rows.slice(0, 300).map(row => { const [, label, tone] = checkoutStatuses.find(([key]) => key === row.status) || checkoutStatuses[0];
      return `<tr><td>${h(row.name || '—')}<small class="dim">${h(row.email)}</small><small class="dim" data-no-translate="1">${h(stores.get(row.storeId) || '')}</small></td><td>${h(fmt(row.abandonedAt || row.created, zone, true))}</td>
        <td>${units(row.items)}<small class="dim" data-no-translate="1">${h(itemsText(row.items).slice(0, 60))}</small></td><td class="right"><b>${money(row.total)}</b></td><td>${badge(label, tone)}</td><td><small>${h(recoveryText(row, zone))}</small></td>
        <td class="right dc-actions">${row.status === 'abandoned' && (row.recovery?.sent || 0) < 3 ? `<button type="button" class="secondary" data-or-act="remind" data-id="${h(row.id)}">${icon('send', 14)} Lembrete</button>` : ''}
          ${row.contactId && c.s.contacts.some(item => item.id === row.contactId) ? `<button type="button" class="icon-btn" data-edit="contacts" data-id="${h(row.contactId)}" aria-label="Abrir contato" title="Abrir contato">${icon('users', 16)}</button>` : ''}
          <button type="button" class="icon-btn" data-or-act="delete" data-id="${h(row.id)}" aria-label="Excluir checkout de ${h(row.email)}" title="Excluir">${icon('trash', 16)}</button></td></tr>`; }).join('')}</tbody></table></div>`
    : `<div class="surface empty">${icon('box', 26)}<strong>${(c.s.abandonedCheckouts || []).length ? 'Nenhum checkout aqui' : 'Nenhum checkout registrado'}</strong>
      <p>${(c.s.abandonedCheckouts || []).length ? 'Tente outra situação, período ou busca.' : `Quando alguém preenche o e-mail no carrinho de uma loja e não finaliza em ${cfg.afterMinutes} minutos, o checkout aparece aqui.`}</p></div>`;
  return pageShell({ title: 'Pagamentos', desc: 'Carrinhos deixados depois de preencher o e-mail, com lembrete para recuperar a venda.',
    cta: `<button type="button" class="secondary" data-or-act="notify">${icon('settings', 15)} Configurar notificações</button><button type="button" class="secondary" data-or-act="export-checkouts"${rows.length ? '' : ' disabled'}>${icon('download', 15)} Exportar CSV</button>`,
    tabs: tabsOf('abandoned-checkouts'),
    content: `<div class="metrics three"><div class="surface metric"><span>Abandonados no período</span><b>${lost.length}</b></div><div class="surface metric"><span>Recuperados</span><b>${recovered.length}${lost.length ? ` <small>(${Math.round(recovered.length / lost.length * 100)}%)</small>` : ''}</b></div>
      <div class="surface metric"><span>Valor recuperado</span><b>${money(recovered.reduce((n, row) => n + row.total, 0))}</b></div></div>
      <p class="dim or-note">${cfg.enabled ? `Lembrete automático por e-mail ${cfg.afterMinutes} minutos depois da última mudança no carrinho.` : 'Lembrete automático desligado. Você pode mandar um lembrete por checkout.'} O gatilho “Checkout abandonado” também dispara nos fluxos de automação.</p>
      <div class="dc-page"><div class="dc-segment" role="group" aria-label="Situação dos checkouts">${checkoutTabs.map(([value, text]) =>
        `<button type="button" data-or-cstatus="${value}" aria-pressed="${ov.cstatus === value}">${text} <span>${all.filter(row => value === 'all' || row.status === value).length}</span></button>`).join('')}</div>
      <div class="toolbar dc-toolbar">${search(c.query, 'Buscar por cliente, loja ou item…')}<label class="or-date">De<input type="date" data-or-period="from" value="${h(ov.from)}"></label><label class="or-date">Até<input type="date" data-or-period="to" value="${h(ov.to)}"></label></div>
      ${table}</div>` });
}

export const orderTabsKeys = ['orders', 'abandoned-checkouts'];
export const ordersScreenFor = c => c.tab === 'orders' ? ordersScreen(c) : checkoutsScreen(c);

export function installOrders({ c, mutate, flash, dialog, close, render }) {
  const here = () => c.view === 'payments' && orderTabsKeys.includes(c.tab);
  document.addEventListener('change', event => {
    const el = event.target;
    if (here() && el.matches('[data-or-period]')) { ov[el.dataset.orPeriod] = el.value; render(); }
  });
  document.addEventListener('click', async event => {
    const el = event.target.closest('[data-or-act],[data-or-status],[data-or-cstatus],[data-or-open]');
    if (!el || !(here() || el.closest('#overlay'))) return;
    const ds = el.dataset;
    try {
      if (ds.orStatus) { ov.status = ds.orStatus; render(); return; }
      if (ds.orCstatus) { ov.cstatus = ds.orCstatus; render(); return; }
      if (ds.orOpen) { ov.open = ov.open === ds.orOpen ? '' : ds.orOpen; render(); return; }
      const zone = c.s.profile.timezone;
      switch (ds.orAct) {
        case 'export': {
          const rows = visibleOrders(c).filter(row => ov.status === 'all' || row.status === ov.status);
          download(`pedidos-${day(Date.now(), zone)}.csv`, [['Pedido', 'Cliente', 'E-mail', 'Origem', 'Itens', 'Data', 'Valor', 'Status'],
            ...rows.map(row => [row.number, row.name, row.email, row.source, itemsText(row.items), fmt(row.created, zone, true), String(row.total).replace('.', ','), (orderStatusNames[row.status] || [row.status])[0]])]);
          return;
        }
        case 'export-checkouts': {
          const stores = new Map((c.s.stores || []).map(row => [row.id, row.name]));
          const rows = visibleCheckouts(c).filter(row => ov.cstatus === 'all' || row.status === ov.cstatus);
          download(`checkouts-abandonados-${day(Date.now(), zone)}.csv`, [['Nome', 'E-mail', 'Telefone', 'Loja', 'Itens', 'Data', 'Valor', 'Status', 'Recuperação'],
            ...rows.map(row => [row.name, row.email, row.phone, stores.get(row.storeId) || '', itemsText(row.items), fmt(row.abandonedAt || row.created, zone, true), String(row.total).replace('.', ','),
              (checkoutStatuses.find(([key]) => key === row.status) || [])[1], recoveryText(row, zone)])]);
          return;
        }
        case 'remind': {
          el.disabled = true;
          const result = await mutate({ type: 'checkout-remind', id: ds.id });
          render(); flash('Lembrete enviado com o link do carrinho guardado.');
          return result;
        }
        case 'delete':
          dialog('Excluir checkout', `<form class="co-form" data-or-form-delete="${h(ds.id)}"><p>O registro deste carrinho será excluído. O contato, se foi criado, continua em Contatos.</p>
            <p class="form-status" role="alert" data-or-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="danger" type="submit">Excluir</button></div></form>`);
          return;
        case 'notify': {
          const cfg = { ...abandonedDefaults(), ...(c.s.paymentSettings?.abandoned || {}) };
          dialog('Notificações de checkout abandonado', `<form class="co-form" data-or-notify>
            <fieldset class="dc-channels"><label><input type="checkbox" name="enabled" ${cfg.enabled ? 'checked' : ''}><span><b>Enviar lembrete automático por e-mail</b><small>Com o link que devolve os itens ao carrinho.</small></span></label></fieldset>
            <label>Considerar abandonado depois de (minutos)<input type="number" name="afterMinutes" min="15" max="4320" value="${h(cfg.afterMinutes)}" required></label>
            <label>Assunto<input name="subject" maxlength="200" value="${h(cfg.subject)}" required></label>
            <label>Mensagem<textarea name="message" rows="5" maxlength="3000" required>${h(cfg.message)}</textarea></label>
            <p class="dim">Variáveis: ${checkoutVariables.map(([key, label]) => `<code title="${h(label)}">{{${key}}}</code>`).join(' ')}. O link do carrinho entra no fim.</p>
            <p class="form-status" role="alert" data-or-error></p><div class="co-form-actions"><button type="button" class="secondary" data-act="close">Cancelar</button><button class="primary" type="submit">Salvar</button></div></form>`);
          return;
        }
      }
    } catch (error) { el.disabled = false; flash(error.message, true); }
  });
  document.addEventListener('submit', async event => {
    const form = event.target.closest('[data-or-form],[data-or-form-delete],[data-or-notify]');
    if (!form) return;
    event.preventDefault();
    const fields = new FormData(form), submit = form.querySelector('button[type="submit"], button.primary'), error = form.querySelector('[data-or-error]');
    if (submit) submit.disabled = true;
    try {
      if (form.dataset.orForm) {
        const order = c.s.orders.find(row => row.id === form.dataset.orForm);
        await mutate({ type: 'save', key: 'orders', id: order.id, data: { id: order.id, status: fields.get('status') || order.status, note: order.note, tracking: fields.get('tracking') } });
        render(); flash('Andamento do pedido salvo.'); return;
      }
      if (form.dataset.orFormDelete) { await mutate({ type: 'delete', key: 'abandonedCheckouts', id: form.dataset.orFormDelete }); close(); render(); flash('Checkout excluído.'); return; }
      await mutate({ type: 'checkout-settings', data: { enabled: fields.has('enabled'), afterMinutes: Number(fields.get('afterMinutes')), subject: fields.get('subject'), message: fields.get('message') } });
      close(); render(); flash('Notificações salvas.');
    } catch (failure) { if (error) error.textContent = failure.message; else flash(failure.message, true); if (submit) submit.disabled = false; }
  });
}
