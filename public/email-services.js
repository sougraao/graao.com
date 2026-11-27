// Configurações → Serviços de e-mail: the sub-account's own sending domain (SPF/DKIM via Resend).
import { icon as i, shcLayers } from './icons.js';

const h = x => String(x ?? '').replace(/[&<>"']/g, v => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[v]);
const badge = (label, tone = '') => `<span class="badge ${tone}">${h(label)}</span>`;
const TONE = { verified: 'green', failed: 'red', temporary_failure: 'red', pending: 'blue', not_started: '' };
const RECORD_STATUS = { verified: ['Verificado', 'green'], pending: ['Verificando', 'blue'], failed: ['Falhou', 'red'], temporary_failure: ['Falha temporária', 'red'], not_started: ['Aguardando', ''] };
const when = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); };

const card = (body, on = false) => `<div class="surface padded shc-card shc-panel email-services${on ? ' is-connected' : ''}">${shcLayers()}${body}</div>`;
const tile = `<span class="shc-icon-tile" aria-hidden="true"><span class="shc-icon">${i('mail', 22)}</span></span>`;
const copyBtn = (value, label) => `<button type="button" class="icon-btn" data-act="email-copy" data-value="${h(value)}" title="Copiar ${h(label)}" aria-label="Copiar ${h(label)}">${i('copy', 15)}</button>`;
const cell = (value, label) => `<span class="email-dns-value"><code>${h(value)}</code>${copyBtn(value, label)}</span>`;

function recordsTable(d) {
  const rows = d.records.map(r => {
    const [label, tone] = RECORD_STATUS[r.status] || RECORD_STATUS.not_started;
    return `<tr><td><b>${h(r.record)}</b></td><td>${h(r.type)}</td><td>${cell(r.name, 'nome')}</td><td>${cell(r.value, 'valor')}</td><td>${r.priority ?? '—'}</td><td>${badge(label, tone)}</td></tr>`;
  });
  rows.push(`<tr><td><b>DMARC</b></td><td>${h(d.dmarc.type)}</td><td>${cell(d.dmarc.name, 'nome')}</td><td>${cell(d.dmarc.value, 'valor')}</td><td>—</td><td>${badge('Recomendado')}</td></tr>`);
  return `<div class="surface table-shell email-dns"><table><thead><tr><th scope="col">Registro</th><th scope="col">Tipo</th><th scope="col">Nome</th><th scope="col">Valor</th><th scope="col">Prioridade</th><th scope="col">Status</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

export function emailServicesView(c) {
  const e = c.emailDomain, name = c.s?.profile?.name || 'Sua empresa';
  if (!e) return card(`${tile}<h2>Serviços de e-mail</h2><p class="dim">Carregando o domínio de envio…</p>`);
  if (e.error) return card(`${tile}<h2>Serviços de e-mail</h2><p class="form-status">${h(e.error)}</p><button class="secondary" data-act="email-refresh">Tentar novamente</button>`);
  if (!e.configured) return card(`${tile}<h2>Serviços de e-mail</h2><p class="dim">O envio de e-mail ainda não foi configurado nesta instalação do graao. Peça ao administrador da agência para definir <code>RESEND_API_KEY</code> e <code>PORTAL_EMAIL_FROM</code>.</p>`);
  const platform = e.agencyAddress ? `<b>${h(e.agencyAddress)}</b>, o domínio de envio da agência` : e.platformAddress ? `<b>${h(e.platformAddress)}</b>` : 'o endereço da plataforma';
  if (!e.domain) return `<form class="surface settings-form set-form" data-form="email-domain-add"><section class="set-section"><header class="set-head">${tile}<h2>Domínio de envio próprio</h2>
    <p class="dim">Hoje os e-mails desta subconta (faturas, recibos, orçamentos, documentos para assinar, carrinhos abandonados e relatórios) saem de ${platform}. Com um domínio próprio eles saem do endereço da empresa, com SPF e DKIM, e chegam com menos chance de cair no spam.</p></header><div class="set-body">
      <div class="field-grid"><label>Domínio<input name="domain" required maxlength="253" placeholder="mail.suaempresa.com.br" autocomplete="off" spellcheck="false"></label>
      <label>Endereço do remetente<span class="email-local"><input name="localPart" required maxlength="64" value="contato" autocomplete="off" spellcheck="false" aria-label="Parte antes do @"><span class="dim">@ domínio</span></span></label></div>
      <p class="dim"><small>Use um subdomínio (como <code>mail.</code> ou <code>envio.</code>) para não mexer no e-mail que a empresa já usa no domínio principal.</small></p></div></section>
      <footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Adicionar domínio</button></footer>
    </form>`;
  const d = e.domain, verified = d.status === 'verified';
  const head = `${tile}<div class="inline-gap"><h2>${h(d.name)}</h2>${badge(d.statusLabel, TONE[d.status] || '')}</div>`;
  const lead = verified
    ? `<p class="dim">Os e-mails desta subconta saem de <b>${h(`${name} <${d.address}>`)}</b>. O nome do remetente e o endereço de resposta de faturas, recibos e orçamentos vêm de <a class="text-link" href="#payments/payment-settings">Pagamentos → Configurações</a>.</p>`
    : `<p class="dim">Publique os registros abaixo no DNS do domínio (no painel de onde ele foi registrado, como Registro.br, Cloudflare ou GoDaddy) e clique em <b>Verificar agora</b>. A propagação pode levar de alguns minutos a algumas horas. Até lá, os e-mails continuam saindo de ${platform}.</p>`;
  const problem = e.problem ? `<p class="ag-warn surface padded">${h(e.problem)}</p>` : '';
  const checked = d.checkedAt ? `<p class="dim"><small>Última verificação: ${h(when(d.checkedAt))}${d.verifiedAt ? ` · verificado em ${h(when(d.verifiedAt))}` : ''}</small></p>` : '';
  return card(`${head}${lead}${problem}${recordsTable(d)}${checked}
    <div class="inline-gap">${verified ? '' : `<button class="primary" data-act="email-verify">${i('refresh', 16)} Verificar agora</button>`}<button class="secondary" data-act="email-remove">${i('trash', 16)} Remover domínio</button></div>`, verified)
    + `<form class="surface settings-form set-form" data-form="email-domain-save"><section class="set-section"><header class="set-head"><h2>Remetente</h2></header><div class="set-body"><label>Endereço do remetente<span class="email-local"><input name="localPart" required maxlength="64" value="${h(d.localPart)}" autocomplete="off" spellcheck="false" aria-label="Parte antes do @"><span class="dim">@${h(d.name)}</span></span></label>
      <p class="dim"><small>As respostas vão para o endereço de “Responder para” de cada envio; sem ele, para este endereço.</small></p></div></section><footer class="set-foot"><p class="form-status" role="alert"></p><button class="primary">Salvar remetente</button></footer></form>`;
}
