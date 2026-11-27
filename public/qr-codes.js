// Sites → QR Codes: dynamic codes (the printed code points to graao, so the destination can change later),
// design, downloads and scan analytics.
import { icon } from './icons.js';
import { h, pageShell } from './screens.js';
import { siteTabs } from './forms.js';
import { qrSvg } from './qr.js';
import { ask } from './ask.js';
import { tr } from './i18n.js';

export const qrTabs = ['qr-codes', 'qr'];
const qv = { id: '', rev: '', draft: null, dirty: false };
let env = null;
const badge = (label, tone = '') => `<span class="badge ${tone}">${h(label)}</span>`;
const when = iso => iso ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';
const types = [['url', 'Site ou link', 'site'], ['form', 'Formulário', 'list'], ['store', 'Loja', 'box'], ['blog', 'Blog', 'note'], ['webinar', 'Webinar', 'play'], ['review', 'Link de avaliação', 'star'], ['whatsapp', 'WhatsApp', 'chat'], ['phone', 'Ligação', 'phone'], ['sms', 'SMS', 'send'], ['email', 'E-mail', 'mail']];
const typeName = type => types.find(([id]) => id === type)?.[1] || type;
const dynamic = (c, qr) => `${location.origin}/q/${c.workspace}/${qr.id}`;
const targets = (c, type) => ({ form: c.s.forms.map(row => [row.id, row.name, row.active]), store: c.s.stores.map(row => [row.id, row.name, row.active]), blog: c.s.blogs.map(row => [row.id, row.name, row.active]), webinar: c.s.webinars.map(row => [row.id, row.name, row.active]) })[type] || [];

function listView(c) {
  const button = `<button class="primary" data-qr-new>${icon('plus', 16)} Novo QR Code</button>`;
  const total = c.s.qrCodes.reduce((sum, qr) => sum + (qr.scans || 0), 0), unique = c.s.qrCodes.reduce((sum, qr) => sum + (qr.unique || 0), 0);
  const cards = [...c.s.qrCodes].sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created))).map(qr => `<a class="surface qr-card" href="#sites/qr/${qr.id}">
      <span class="qr-thumb">${qrSvg(dynamic(c, qr), { fg: qr.fg, bg: qr.bg, size: 96, margin: 2, label: `QR Code ${qr.name}` })}</span>
      <span class="qr-card-body"><b>${h(qr.name)}</b><small class="dim">${h(typeName(qr.type))}</small><span>${qr.scans || 0} leituras · ${qr.unique || 0} únicas</span>${qr.active ? '' : badge('Pausado')}</span></a>`).join('');
  return pageShell({ title: 'Sites', desc: 'Crie funis, sites e formulários com IA, publique e acompanhe visitas e conversões.', cta: button, className: 'sites-page',
    tabs: { key: 'sites', label: 'Seções de sites', current: 'qr-codes', items: siteTabs },
    content: `<div class="metrics three"><div class="surface metric"><span>QR Codes</span><b>${c.s.qrCodes.length}</b></div><div class="surface metric"><span>Leituras</span><b>${total}</b></div><div class="surface metric"><span>Leituras únicas</span><b>${unique}</b></div></div>
      ${cards ? `<div class="qr-grid">${cards}</div>` : `<div class="surface empty site-empty">${icon('grid', 26)}<strong>Nenhum QR Code ainda</strong><p>Códigos para site, formulário, loja, blog, webinar, WhatsApp, ligação, SMS ou e-mail. Você pode trocar o destino depois de imprimir e ver quantas pessoas leram.</p>${button}</div>`}` });
}

function loadDraft(c) {
  const qr = c.s.qrCodes.find(row => row.id === c.studio.project);
  if (!qr) return null;
  if (qv.id !== qr.id || (!qv.dirty && qv.rev !== (qr.updated || qr.created))) Object.assign(qv, { id: qr.id, rev: qr.updated || qr.created, dirty: false, draft: structuredClone(qr) });
  return qr;
}

function fieldsFor(c, d) {
  const set = (key, label, value, extra = '') => `<label>${label}<input data-qr-set="${key}" value="${h(value)}"${extra}></label>`;
  if (d.type === 'url') return set('url', 'Endereço', d.url, ' type="url" maxlength="1000" placeholder="https://"');
  if (d.type === 'review') return '<p class="dim">Leva à página de avaliação da empresa. Configure a página e os sites de avaliação em <a class="text-link" href="#reputation/settings">Reputação → Configurações</a>.</p>';
  if (['form', 'store', 'blog', 'webinar'].includes(d.type)) {
    const list = targets(c, d.type);
    return list.length ? `<label>${typeName(d.type)}<select data-qr-set="targetId"><option value="">Escolha…</option>${list.map(([id, name, active]) => `<option value="${id}"${d.targetId === id ? ' selected' : ''}>${h(name)}${active ? '' : ' (não publicado)'}</option>`).join('')}</select></label>`
      : `<p class="dim">Nenhum ${typeName(d.type).toLowerCase()} criado ainda.</p>`;
  }
  const phone = ['whatsapp', 'phone', 'sms'].includes(d.type) ? set('phone', d.type === 'whatsapp' ? 'WhatsApp com DDI e DDD' : 'Telefone com DDD', d.phone, ' type="tel" maxlength="30" placeholder="+55 31 98888-1234"') : '';
  const mail = d.type === 'email' ? `${set('email', 'E-mail', d.email, ' type="email" maxlength="160"')}${set('subject', 'Assunto', d.subject, ' maxlength="120"')}` : '';
  const message = ['whatsapp', 'sms', 'email'].includes(d.type) ? `<label>Mensagem pronta<textarea data-qr-set="message" rows="3" maxlength="500">${h(d.message)}</textarea></label>` : '';
  return phone + mail + message;
}

function chart(qr) {
  const days = [];
  for (let i = 29; i >= 0; i--) { const day = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); days.push([day, qr.byDay?.[day]?.scans || 0, qr.byDay?.[day]?.unique || 0]); }
  const max = Math.max(1, ...days.map(row => row[1]));
  const label = day => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${day}T12:00:00`));
  return `<figure class="surface fm-chart"><figcaption><b>Leituras por dia</b><span class="dim">Últimos 30 dias</span></figcaption><div class="fm-bars" role="img" aria-label="Leituras por dia nos últimos 30 dias, máximo de ${max}"><span class="fm-axis" aria-hidden="true"><i>${max}</i><i>0</i></span>
    ${days.map(([day, scans, unique]) => `<span class="fm-bar" data-tip="${label(day)}: ${scans} leituras · ${unique} únicas"><i style="height:${scans ? Math.max(4, scans / max * 100) : 0}%"></i></span>`).join('')}</div><div class="fm-chart-foot dim"><span>${label(days[0][0])}</span><span>${label(days.at(-1)[0])}</span></div></figure>`;
}

function editorView(c) {
  const qr = loadDraft(c);
  if (!qr) return `<div class="page sites-page"><div class="surface empty"><strong>QR Code não encontrado</strong><a class="primary" href="#sites/qr-codes">Voltar</a></div></div>`;
  const d = qv.draft, devices = Object.entries(qr.devices || {}).sort((a, b) => b[1] - a[1]);
  return `<div class="fb dw-workspace qr-editor"><header class="fb-top dw-header"><a class="secondary fb-back" href="#sites/qr-codes">${icon('left', 15)} QR Codes</a>
      <div class="fb-title"><h1>${h(d.name)}</h1>${qr.active ? badge('Ativo', 'green') : badge('Pausado')}${qv.dirty ? badge('Alterações não salvas', 'blue') : ''}</div>
      <div class="fb-top-actions"><button class="secondary" data-qr-toggle="${qr.active ? 'off' : 'on'}">${qr.active ? 'Pausar' : 'Ativar'}</button><button class="primary" data-qr-save${qv.dirty ? '' : ' disabled'}>Salvar</button><button class="icon-btn" data-qr-delete aria-label="Excluir QR Code" title="Excluir">${icon('trash', 16)}</button></div></header>
    <div class="qr-edit"><div class="fb-settings qr-settings">
      <section class="surface padded"><h2>Destino</h2><label>Nome<input data-qr-set="name" value="${h(d.name)}" maxlength="80"></label>
        <fieldset class="qr-types"><legend>Tipo</legend>${types.map(([id, label, ico]) => `<label class="qr-type"><input type="radio" name="qr-type" data-qr-set="type" value="${id}"${d.type === id ? ' checked' : ''}><span>${icon(ico, 16)} ${label}</span></label>`).join('')}</fieldset>
        ${fieldsFor(c, d)}<p class="dim">O código impresso aponta para a graao, que redireciona. Trocar o destino aqui não exige reimprimir.</p></section>
      <section class="surface padded"><h2>Aparência</h2><div class="fb-two"><label>Cor do código<span class="fb-color"><input type="color" data-qr-set="fg" value="${h(d.fg)}"><code>${h(d.fg)}</code></span></label><label>Fundo<span class="fb-color"><input type="color" data-qr-set="bg" value="${h(d.bg)}"><code>${h(d.bg)}</code></span></label></div>
        <p class="dim">Prefira código escuro sobre fundo claro, com bom contraste, para leitura em qualquer celular.</p></section>
      <section class="surface padded"><h2>Leituras</h2><div class="metrics three"><div class="surface metric"><span>Total</span><b>${qr.scans || 0}</b></div><div class="surface metric"><span>Únicas</span><b>${qr.unique || 0}</b></div><div class="surface metric"><span>Última</span><b class="qr-last">${qr.lastScan ? when(qr.lastScan) : '—'}</b></div></div>
        ${chart(qr)}${devices.length ? `<p class="dim">Dispositivos: ${devices.map(([name, n]) => `${h(name)} ${n}`).join(' · ')}</p>` : ''}</section></div>
    <aside class="surface qr-preview" aria-label="Prévia do QR Code"><div class="qr-big" data-qr-preview>${qrSvg(dynamic(c, qr), { fg: d.fg, bg: d.bg, size: 260, label: `QR Code ${d.name}` })}</div>
      <code class="qr-link">${h(dynamic(c, qr))}</code><div class="inline-gap"><button class="primary" data-qr-png>${icon('download', 15)} Baixar PNG</button><button class="secondary" data-qr-svg>SVG</button></div>
      <a class="text-link" href="${h(dynamic(c, qr))}" target="_blank" rel="noopener">Testar o link</a></aside></div></div>`;
}

export function qrScreen(c) { return c.tab === 'qr' ? editorView(c) : listView(c); }

export function installQr(environment) {
  env = environment;
  const { c, mutate, flash, render } = env;
  const inEditor = () => c.view === 'sites' && c.tab === 'qr';
  const current = () => c.s.qrCodes.find(row => row.id === qv.id);
  const touch = () => { if (qv.dirty) return; qv.dirty = true; const save = document.querySelector('[data-qr-save]'); if (save) save.disabled = false; document.querySelector('.qr-editor .fb-title')?.insertAdjacentHTML('beforeend', badge('Alterações não salvas', 'blue')); };
  const repaint = () => { const box = document.querySelector('[data-qr-preview]'); if (box) box.innerHTML = qrSvg(dynamic(c, qv.draft), { fg: qv.draft.fg, bg: qv.draft.bg, size: 260, label: `QR Code ${qv.draft.name}` }); };
  const fileName = ext => `qr-${(qv.draft.name || 'codigo').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.${ext}`;
  const download = (href, name) => { const a = Object.assign(document.createElement('a'), { href, download: name }); a.click(); };

  document.addEventListener('click', async event => {
    const target = event.target.closest('[data-qr-new],[data-qr-save],[data-qr-toggle],[data-qr-delete],[data-qr-png],[data-qr-svg]');
    if (!target || c.view !== 'sites') return;
    const d = target.dataset;
    try {
      if ('qrNew' in d) {
        const id = await mutate({ type: 'save', key: 'qrCodes', data: { name: 'Novo QR Code', type: 'url', url: `${location.origin}/`, fg: '#101828', bg: '#ffffff', active: true } });
        qv.id = ''; location.hash = `#sites/qr/${id}`; flash('QR Code criado. Escolha o destino.'); return;
      }
      if (!inEditor()) return;
      if ('qrSave' in d) { target.disabled = true; await mutate({ type: 'save', key: 'qrCodes', id: qv.id, data: qv.draft }); qv.dirty = false; qv.rev = ''; render(); flash('QR Code salvo.'); return; }
      if (d.qrToggle) { await mutate({ type: 'save', key: 'qrCodes', id: qv.id, data: { ...qv.draft, active: d.qrToggle === 'on' } }); qv.dirty = false; qv.rev = ''; render(); flash(d.qrToggle === 'on' ? 'QR Code ativo.' : 'QR Code pausado: quem ler vê uma página de aviso.'); return; }
      if ('qrSvg' in d) { const svg = qrSvg(dynamic(c, qv.draft), { fg: qv.draft.fg, bg: qv.draft.bg, size: 1024 }); download(URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })), fileName('svg')); return; }
      if ('qrPng' in d) {
        const svg = qrSvg(dynamic(c, qv.draft), { fg: qv.draft.fg, bg: qv.draft.bg, size: 1024 });
        const img = new Image();
        img.onload = () => { const canvas = Object.assign(document.createElement('canvas'), { width: 1024, height: 1024 }); canvas.getContext('2d').drawImage(img, 0, 0, 1024, 1024); download(canvas.toDataURL('image/png'), fileName('png')); };
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; return;
      }
      if ('qrDelete' in d) {
        if (!await ask(`${tr('Excluir')} “${current().name}”?`, { text: 'Códigos já impressos deixam de funcionar.', ok: 'Excluir' })) return;
        await mutate({ type: 'delete', key: 'qrCodes', id: qv.id }); qv.id = ''; location.hash = '#sites/qr-codes'; flash('QR Code excluído.');
      }
    } catch (error) { flash(error.message, true); }
  });

  const onEdit = event => {
    const el = event.target;
    if (!inEditor() || !qv.draft || !el.dataset.qrSet) return;
    const key = el.dataset.qrSet;
    qv.draft[key] = el.value;
    if (['fg', 'bg'].includes(key)) { el.nextElementSibling.textContent = el.value; repaint(); }
    if (key === 'name') document.querySelector('.qr-editor .fb-title h1').textContent = el.value;
    touch();
    if (key === 'type') { render(); document.querySelector(`[data-qr-set="type"][value="${el.value}"]`)?.focus(); }
  };
  document.addEventListener('input', onEdit);
  document.addEventListener('change', event => { if (event.target.tagName === 'SELECT') onEdit(event); });
}
