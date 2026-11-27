// Relatórios → Ligações (2.4): the calls of the sub-account (Twilio and "Registrar ligação"), with totals and recordings.
import { tr } from './i18n.js';

const h = x => String(x ?? '').replace(/[&<>"']/g, v => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[v]);
const STATUS = { ringing: ['Tocando', 'blue'], 'in-progress': ['Em andamento', 'blue'], answered: ['Atendida', 'green'], missed: ['Não atendida', 'red'], voicemail: ['Caixa postal', ''], busy: ['Ocupado', 'red'], failed: ['Falhou', 'red'] };
const minutes = seconds => seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '—';

/** Totals and rows, newest first, for a direction filter ('' = all). */
export function callTotals(calls, direction = '') {
  const rows = (calls || []).filter(row => !direction || row.direction === direction).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  const answered = rows.filter(row => row.status === 'answered');
  return {
    rows, total: rows.length, answered: answered.length, missed: rows.filter(row => ['missed', 'busy', 'failed'].includes(row.status)).length,
    voicemail: rows.filter(row => row.status === 'voicemail').length, average: answered.length ? Math.round(answered.reduce((sum, row) => sum + (row.duration || 0), 0) / answered.length) : 0
  };
}

export function callReportView(c, { pageShell, tabs }) {
  const direction = ['inbound', 'outbound'].includes(c.callFilter) ? c.callFilter : '';
  const t = callTotals(c.s.calls, direction);
  const contacts = new Map(c.s.contacts.map(row => [row.id, row]));
  const numbers = new Map((c.s.phone?.numbers || []).map(row => [row.id, row]));
  const when = iso => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(c.lang === 'es' ? 'es' : 'pt-BR', { dateStyle: 'short', timeStyle: 'short' }); };
  const filter = [['', 'Todas'], ['inbound', 'Recebidas'], ['outbound', 'Feitas']].map(([key, label]) =>
    `<button class="seg-btn" data-call-filter="${key}" aria-pressed="${direction === key}">${h(tr(label))}</button>`).join('');
  const metric = (label, value) => `<div class="surface metric"><span>${h(tr(label))}</span><b>${h(value)}</b></div>`;
  const rows = t.rows.slice(0, 300).map(row => {
    const [label, tone] = STATUS[row.status] || [row.status, ''];
    const contact = contacts.get(row.contactId), number = numbers.get(row.numberId);
    const audio = row.voicemailUrl || row.recordingUrl ? `<audio controls preload="none" src="/api/phone/recording?workspace=${encodeURIComponent(c.workspace)}&amp;call=${encodeURIComponent(row.id)}" aria-label="${h(tr('Gravação da ligação'))}"></audio>` : '—';
    return `<tr><td>${h(when(row.created))}</td><td>${contact ? `<button class="link" data-thread="${h(contact.id)}">${h(contact.name)}</button>` : h(row.phone || '—')}</td>
      <td>${h(tr(row.direction === 'inbound' ? 'Recebida' : 'Feita'))}</td><td><span class="badge ${tone}">${h(tr(label))}</span></td><td>${h(minutes(row.duration || 0))}</td>
      <td>${h(number ? number.name || number.number : row.source === 'external' ? tr('Registrada') : '—')}</td><td>${audio}</td></tr>`;
  });
  return pageShell({
    title: tr('Relatórios'), desc: tr('Ligações feitas e recebidas pelos números da Graao e as registradas nos fluxos.'), tabs,
    content: `<div class="seg call-filter" role="group" aria-label="${h(tr('Direção'))}">${filter}</div>
      <div class="metrics four">${metric('Ligações', t.total)}${metric('Atendidas', t.answered)}${metric('Não atendidas', t.missed)}${metric('Duração média', minutes(t.average))}</div>
      <div class="surface table-shell"><table><thead><tr>${['Data e hora', 'Contato', 'Direção', 'Resultado', 'Duração', 'Número', 'Gravação'].map(col => `<th scope="col">${h(tr(col))}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('') || `<tr><td colspan="7" class="dim">${h(tr('Nenhuma ligação ainda. Compre um número em Configurações → Telefonia.'))}</td></tr>`}</tbody></table></div>`
  });
}
