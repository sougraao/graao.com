// Media Storage: folders, grid/list views, filters, uploads (files, folders, URL), trash and storage usage.
import { icon } from './icons.js';
import { h, fmt, search } from './screens.js';

const LIMIT_BYTES = 700_000, R2_LIMIT_BYTES = 50 * 1024 * 1024, LIMIT_FILES = 60;
const kinds = {
  'image/png': 'photo', 'image/jpeg': 'photo', 'image/gif': 'photo', 'image/webp': 'photo',
  'video/mp4': 'video', 'video/webm': 'video', 'audio/mpeg': 'audio', 'audio/wav': 'audio', 'audio/ogg': 'audio',
  'application/pdf': 'doc', 'text/plain': 'doc', 'text/csv': 'doc'
};
const kindLabels = [['all','Todos'],['photo','Fotos'],['video','Vídeos'],['audio','Áudio'],['doc','Documentos'],['other','Outros']];
const sorts = [['name-asc','Nome: A a Z'],['name-desc','Nome: Z a A'],['size-asc','Tamanho: menor primeiro'],['size-desc','Tamanho: maior primeiro'],
  ['modified-desc','Modificado: mais recente'],['modified-asc','Modificado: mais antigo']];
const kindIcon = { photo: 'upload', video: 'play', audio: 'mic', doc: 'note', other: 'paperclip' };
const accept = Object.keys(kinds).join(',');

let layout = 'grid';
try { layout = localStorage.getItem('graao.media.layout') === 'list' ? 'list' : 'grid'; } catch { /* default grid */ }
const mv = { sort: 'modified-desc', kind: 'all', selected: new Set() };

// A file kept in Cloudflare R2 has no inline data: its type and size are stored, and `src` serves it.
const mimeOf = file => file.mime || file.data.slice(5, file.data.indexOf(';'));
const srcOf = file => file.data || file.src || '';
const kindOf = file => kinds[mimeOf(file)] || 'other';
const sizeOf = file => {
  if (file.r2Key) return file.size || 0;
  const body = file.data.length - file.data.indexOf(',') - 1; return Math.floor(body * 3 / 4) - (file.data.endsWith('==') ? 2 : file.data.endsWith('=') ? 1 : 0); };
export const bytes = n => n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1).replace('.', ',')} KB` : `${(n / 1024 ** 2).toFixed(2).replace('.', ',')} MB`;
const touched = file => file.updated || file.created || '';
const folderId = () => location.hash.split('/')[1] === 'folder' ? decodeURIComponent(location.hash.split('/')[2] || '') : '';
const live = c => c.s.files.filter(file => !file.trashedAt);
const trail = (c, id) => {
  const path = [];
  for (let folder = c.s.mediaFolders.find(row => row.id === id); folder && path.length < 50; folder = c.s.mediaFolders.find(row => row.id === folder.parentId)) path.unshift(folder);
  return path;
};
const folderPath = (c, id) => trail(c, id).map(folder => folder.name).join(' / ');

function ordered(rows, key) {
  const [field, way] = mv.sort.split('-'), dir = way === 'asc' ? 1 : -1;
  const value = row => field === 'name' ? row.name.toLocaleLowerCase('pt-BR') : field === 'size' && key === 'files' ? sizeOf(row) : touched(row);
  return [...rows].sort((a, b) => value(a) < value(b) ? -dir : value(a) > value(b) ? dir : 0);
}

const menu = (label, items, cls = '') => `<details class="md-menu ${cls}"><summary class="icon-btn" aria-label="${label}" title="${label}">${icon('dots',17)}</summary>
  <div class="md-menu-list" role="menu">${items.join('')}</div></details>`;
const item = (action, label, glyph, id = '', danger = false) =>
  `<button type="button" role="menuitem" class="${danger ? 'danger-text' : ''}" data-md="${action}" data-id="${h(id)}">${icon(glyph,15)} ${label}</button>`;

function preview(file, size = 'card') {
  const kind = kindOf(file);
  if (kind === 'photo') return `<img src="${h(srcOf(file))}" alt="" loading="lazy">`;
  if (kind === 'video' && size === 'card') return `<video src="${h(srcOf(file))}" muted preload="metadata" aria-hidden="true"></video><span class="md-badge">${icon('play',14)}</span>`;
  return `<span class="md-glyph md-${kind}">${icon(kindIcon[kind],size === 'card' ? 30 : 17)}<b>${h((file.name.split('.').pop() || kind).slice(0,4).toUpperCase())}</b></span>`;
}

function fileCard(c, file) {
  const checked = mv.selected.has(file.id);
  return `<article class="md-file ${checked ? 'selected' : ''}">
    <label class="md-check"><input type="checkbox" data-md-select="${h(file.id)}" ${checked ? 'checked' : ''} aria-label="Selecionar ${h(file.name)}"></label>
    <button type="button" class="md-thumb" data-md="open" data-id="${h(file.id)}" aria-label="Visualizar ${h(file.name)}">${preview(file)}</button>
    <div class="md-file-info"><div><strong title="${h(file.name)}">${h(file.name)}</strong><small>${bytes(sizeOf(file))} · ${h(fmt(touched(file),c.s.profile.timezone))}</small></div>
      ${fileMenu(file)}</div></article>`;
}
const fileMenu = file => menu(`Ações de ${file.name}`, [item('open','Visualizar','external',file.id), item('download','Baixar','download',file.id),
  item('rename','Renomear','edit',file.id), item('move','Mover','folder',file.id), item('trash','Mover para a lixeira','trash',file.id,true)]);

function fileTable(c, files) {
  return `<div class="md-table surface"><table><thead><tr><th scope="col"><span class="sr-only">Selecionar</span></th><th scope="col">Nome</th>
    <th scope="col">Tipo</th><th scope="col">Tamanho</th><th scope="col">Modificado</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
    <tbody>${files.map(file => `<tr class="${mv.selected.has(file.id) ? 'selected' : ''}">
      <td><input type="checkbox" data-md-select="${h(file.id)}" ${mv.selected.has(file.id) ? 'checked' : ''} aria-label="Selecionar ${h(file.name)}"></td>
      <td><button type="button" class="md-row-name" data-md="open" data-id="${h(file.id)}"><span class="md-mini">${preview(file,'row')}</span><span>${h(file.name)}</span></button></td>
      <td>${kindLabels.find(([k]) => k === kindOf(file))[1]}</td><td>${bytes(sizeOf(file))}</td><td>${h(fmt(touched(file),c.s.profile.timezone))}</td>
      <td>${fileMenu(file)}</td></tr>`).join('')}</tbody></table></div>`;
}

function emptyState(title, text) {
  return `<div class="md-empty"><svg viewBox="0 0 160 110" aria-hidden="true"><rect x="22" y="30" width="116" height="72" rx="10" class="md-e1"/>
    <path d="M22 40a10 10 0 0 1 10-10h30l10 10h56a10 10 0 0 1 10 10" class="md-e2"/><rect x="48" y="12" width="44" height="54" rx="6" class="md-e3" transform="rotate(-8 70 39)"/>
    <rect x="70" y="18" width="44" height="54" rx="6" class="md-e3" transform="rotate(9 92 45)"/><circle cx="92" cy="40" r="7" class="md-e4"/></svg>
    <strong>${title}</strong><p>${text}</p></div>`;
}

function trashScreen(c) {
  const files = ordered(c.s.files.filter(file => file.trashedAt), 'files');
  return `<div class="page md-page" data-media-root>
    <a class="text-link md-back" href="#media">${icon('left',15)} Voltar para a mídia</a>
    <header class="md-head"><h1>Lixeira</h1>${files.length ? `<button type="button" class="secondary" data-md="empty-trash">${icon('trash',15)} Esvaziar lixeira</button>` : ''}</header>
    ${files.length ? `<p class="md-hint">Arquivos na lixeira continuam ocupando espaço até serem excluídos definitivamente.</p>
    <div class="md-table surface"><table><thead><tr><th scope="col">Nome</th><th scope="col">Tamanho</th><th scope="col">Na lixeira desde</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
    <tbody>${files.map(file => `<tr><td><span class="md-row-name"><span class="md-mini">${preview(file,'row')}</span><span>${h(file.name)}</span></span></td>
      <td>${bytes(sizeOf(file))}</td><td>${h(fmt(file.trashedAt,c.s.profile.timezone,true))}</td>
      <td class="md-row-actions"><button type="button" class="secondary" data-md="restore" data-id="${h(file.id)}">${icon('refresh',15)} Restaurar</button>
      <button type="button" class="danger plain" data-md="destroy" data-id="${h(file.id)}">${icon('trash',15)} Excluir</button></td></tr>`).join('')}</tbody></table></div>`
      : emptyState('A lixeira está vazia','Arquivos movidos para a lixeira aparecem aqui e podem ser restaurados.')}
  </div>`;
}

export function mediaScreen(c) {
  if (c.tab === 'trash') return trashScreen(c);
  const current = folderId(), here = c.s.mediaFolders.find(folder => folder.id === current);
  const inFolder = here ? current : '';
  const query = (c.query || '').trim().toLocaleLowerCase('pt-BR');
  const visible = live(c).filter(file => mv.kind === 'all' || kindOf(file) === mv.kind);
  const files = ordered(query ? visible.filter(file => file.name.toLocaleLowerCase('pt-BR').includes(query))
    : visible.filter(file => (file.folderId || '') === inFolder), 'files');
  const folders = query ? [] : ordered(c.s.mediaFolders.filter(folder => (folder.parentId || '') === inFolder), 'folders');
  const count = id => live(c).filter(file => file.folderId === id).length + c.s.mediaFolders.filter(folder => folder.parentId === id).length;
  const used = c.s.files.reduce((sum, file) => sum + sizeOf(file), 0);
  mv.selected = new Set([...mv.selected].filter(id => files.some(file => file.id === id)));
  const select = (name, options, value, label) => `<label class="md-select"><span class="sr-only">${label}</span><select data-md-filter="${name}" aria-label="${label}">
    ${options.map(([v, text]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label>`;
  return `<div class="page md-page" data-media-root>
    <header class="md-head"><h1>Mídia Drive</h1><div class="md-actions">
      <button type="button" class="secondary md-square" data-md="new-folder" aria-label="Nova pasta" title="Nova pasta">${icon('folder',17)}<span class="md-plus">${icon('plus',11)}</span></button>
      <details class="md-menu md-upload"><summary class="primary">${icon('upload',16)} Enviar ${icon('chevron',14)}</summary>
        <div class="md-menu-list" role="menu">${item('pick-files','Enviar arquivos','upload')}${item('pick-folder','Enviar pasta','folder')}${item('url','Enviar por URL','link')}</div></details>
      <details class="md-menu md-more"><summary class="secondary md-square" aria-label="Mais opções" title="Mais opções">${icon('dots',17)}</summary>
        <div class="md-menu-list" role="menu"><a role="menuitem" href="#media/trash">${icon('trash',15)} Lixeira</a>
        <div class="md-storage" role="presentation">${icon('box',15)}<span>Armazenamento<small>${c.s.files.length} de ${LIMIT_FILES} arquivos</small></span><b>${bytes(used)} usados</b></div></div></details>
      <input type="file" multiple accept="${accept}" data-md-input hidden><input type="file" webkitdirectory multiple data-md-dir hidden>
    </div></header>
    <div class="md-toolbar">${search(c.query,'Buscar em toda a mídia')}
      ${select('sort',sorts,mv.sort,'Ordenar por')}${select('kind',kindLabels,mv.kind,'Tipo de arquivo')}
      <div class="md-layout" role="group" aria-label="Visualização">
        <button type="button" data-md="layout" data-id="grid" aria-pressed="${layout === 'grid'}" aria-label="Grade" title="Grade">${icon('grid',16)}</button>
        <button type="button" data-md="layout" data-id="list" aria-pressed="${layout === 'list'}" aria-label="Lista" title="Lista">${icon('list',16)}</button></div></div>
    <nav class="md-crumbs" aria-label="Pastas"><a href="#media" ${inFolder ? '' : 'aria-current="page"'}>Mídia Drive</a>${trail(c, inFolder).map((folder, index, all) =>
      `${icon('right',13)}<a href="#media/folder/${encodeURIComponent(folder.id)}" ${index === all.length - 1 ? 'aria-current="page"' : ''}>${h(folder.name)}</a>`).join('')}
      ${query ? `<span class="md-crumb-note">Resultados em toda a mídia</span>` : ''}</nav>
    ${mv.selected.size ? `<div class="md-bulk" role="region" aria-label="Seleção"><strong>${mv.selected.size} selecionado${mv.selected.size > 1 ? 's' : ''}</strong>
      <button type="button" class="secondary" data-md="move-selected">${icon('folder',15)} Mover</button>
      <button type="button" class="secondary" data-md="trash-selected">${icon('trash',15)} Mover para a lixeira</button>
      <button type="button" class="text-link" data-md="clear-selection">Limpar seleção</button></div>` : ''}
    ${folders.length ? `<section class="md-folders" aria-labelledby="md-folders-title"><h2 id="md-folders-title">Pastas ${icon('right',14)}</h2>
      <div class="md-folder-grid">${folders.map(folder => `<div class="md-folder"><a href="#media/folder/${encodeURIComponent(folder.id)}">
        <span class="md-folder-icon">${icon('folder',20)}</span><span><strong>${h(folder.name)}</strong><small>${count(folder.id)} ${count(folder.id) === 1 ? 'item' : 'itens'}</small></span></a>
        ${menu(`Ações da pasta ${folder.name}`,[item('rename-folder','Renomear','edit',folder.id), item('move-folder','Mover','folder',folder.id), item('delete-folder','Excluir pasta','trash',folder.id,true)])}</div>`).join('')}</div></section>` : ''}
    <section class="md-files" aria-label="Arquivos" data-md-drop>
      ${files.length ? (layout === 'list' ? fileTable(c, files) : `<div class="md-grid">${files.map(file => fileCard(c, file)).join('')}</div>`)
        : emptyState(query || mv.kind !== 'all' ? 'Nenhum arquivo encontrado' : 'Nenhum arquivo de mídia',
          query || mv.kind !== 'all' ? 'Tente outra busca ou outro tipo de arquivo.' : 'Arraste arquivos para cá ou use Enviar. Imagens, vídeos, áudios, PDF, TXT e CSV de até 700 KB (até 50 MB com o armazenamento em nuvem ativo).')}
      <div class="md-dropzone" aria-hidden="true">${icon('upload',28)}<strong>Solte para enviar${here ? ` em ${h(here.name)}` : ''}</strong></div>
    </section>
  </div>`;
}

export function installMedia({ c, api, url, mutate, flash, dialog, close, render }) {
  const inMedia = () => c.view === 'media';
  const fileOf = id => c.s.files.find(file => file.id === id);
  const folderOf = id => c.s.mediaFolders.find(folder => folder.id === id);
  const closeMenus = except => document.querySelectorAll('.md-menu[open]').forEach(menu => { if (menu !== except) menu.open = false; });

  const form = (title, action, fields, label, id = '', danger = false) => dialog(title, `<form class="md-form" data-md-form="${action}" data-id="${h(id)}">
    ${fields}<p class="form-status" role="alert" data-md-error></p>
    <div class="md-form-actions"><button type="button" class="secondary" data-close-dialog data-act="close">Cancelar</button>
    <button class="${danger ? 'danger' : 'primary'}" type="submit">${label}</button></div></form>`);
  const folderChoices = (selected, exclude = '') => {
    const blocked = new Set();
    if (exclude) for (const folder of c.s.mediaFolders) if (trail(c, folder.id).some(step => step.id === exclude)) blocked.add(folder.id);
    return `<label>Destino<select name="folderId"><option value="">Mídia (raiz)</option>${[...c.s.mediaFolders].filter(folder => !blocked.has(folder.id))
      .map(folder => [folderPath(c, folder.id), folder]).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      .map(([path, folder]) => `<option value="${h(folder.id)}" ${folder.id === selected ? 'selected' : ''}>${h(path)}</option>`).join('')}</select></label>`;
  };
  const save = async (key, data, id) => mutate({ type: 'save', key, id, data });
  const readAs = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });

  // Files over 700 KB go straight from the browser to Cloudflare R2 with a signed link; the server then
  // checks the stored object and records it.
  async function sendToR2(file, destination) {
    const ticket = await api(url('/api/media/upload-url'), { name: file.name, mime: file.type, size: file.size, folderId: destination });
    let response;
    try { response = await fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: file }); }
    catch { throw Error('não foi possível enviar ao armazenamento'); }
    if (!response.ok) throw Error(`o armazenamento recusou (${response.status})`);
    const result = await api(url('/api/media/upload-done'), { token: ticket.token });
    c.s = result.state; c.m = result.metrics;
  }

  async function upload(list, target = folderId()) {
    const files = [...list].filter(file => file.size);
    if (!files.length) return;
    const folders = new Map();
    let sent = 0;
    const skipped = [];
    flash(`Enviando ${files.length} arquivo${files.length > 1 ? 's' : ''}…`);
    for (const file of files) {
      if (!kinds[file.type] || file.size > R2_LIMIT_BYTES) { skipped.push(file.name); continue; }
      let destination = target;
      const parts = (file.webkitRelativePath || '').split('/').slice(0, -1);
      for (let depth = 0; depth < parts.length; depth++) {
        const key = parts.slice(0, depth + 1).join('/');
        if (!folders.has(key)) folders.set(key, await save('mediaFolders', { name: parts[depth], parentId: destination }));
        destination = folders.get(key);
      }
      try {
        if (file.size > LIMIT_BYTES) await sendToR2(file, destination);
        else await save('files', { name: file.name, data: await readAs(file), folderId: destination });
        sent++;
      }
      catch (error) { skipped.push(`${file.name} (${error.message})`); if (/60/.test(error.message)) break; }
    }
    render();
    flash(skipped.length ? `${sent} enviado${sent === 1 ? '' : 's'}. Não enviados: ${skipped.slice(0, 3).join(', ')}${skipped.length > 3 ? '…' : ''}` : `${sent} arquivo${sent === 1 ? '' : 's'} enviado${sent === 1 ? '' : 's'}.`, Boolean(skipped.length));
  }

  function open(file) {
    const kind = kindOf(file), mime = mimeOf(file);
    let body = '';
    if (kind === 'photo') body = `<img class="md-view" src="${h(srcOf(file))}" alt="${h(file.name)}">`;
    else if (kind === 'video') body = `<video class="md-view" src="${h(srcOf(file))}" controls></video>`;
    else if (kind === 'audio') body = `<audio class="md-view-audio" src="${h(srcOf(file))}" controls></audio>`;
    else if (mime.startsWith('text/') && file.data) {
      const text = new TextDecoder().decode(Uint8Array.from(atob(file.data.split(',')[1]), ch => ch.charCodeAt(0)));
      body = `<pre class="md-view-text">${h(text.slice(0, 20000))}</pre>`;
    } else body = `<div class="md-view-doc">${preview(file,'card')}<p>A pré-visualização deste tipo de arquivo não está disponível.</p></div>`;
    dialog(file.name, `<div class="md-viewer">${body}<dl class="md-meta"><div><dt>Tipo</dt><dd>${h(mime)}</dd></div><div><dt>Tamanho</dt><dd>${bytes(sizeOf(file))}</dd></div>
      <div><dt>Pasta</dt><dd>${h(folderPath(c, file.folderId) || 'Mídia (raiz)')}</dd></div><div><dt>Modificado</dt><dd>${h(fmt(touched(file),c.s.profile.timezone,true))}</dd></div></dl>
      <div class="md-form-actions"><button type="button" class="secondary" data-md="rename" data-id="${h(file.id)}">${icon('edit',15)} Renomear</button>
      <button type="button" class="primary" data-md="download" data-id="${h(file.id)}">${icon('download',15)} Baixar</button></div></div>`);
    document.querySelector('#dialog')?.classList.add('md-wide');
  }

  function download(file) {
    if (file.r2Key) { window.location.href = `${file.src}?download=1`; return; }
    const [header, body] = file.data.split(',');
    const blob = new Blob([Uint8Array.from(atob(body), ch => ch.charCodeAt(0))], { type: header.slice(5).split(';')[0] });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: file.name });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  document.addEventListener('click', async event => {
    if (!inMedia()) return;
    const summary = event.target.closest('.md-menu > summary');
    closeMenus(summary?.parentElement);
    const control = event.target.closest('[data-md]');
    if (!control) return;
    const { md: action, id } = control.dataset;
    if (control.closest('.md-menu')) control.closest('.md-menu').open = false;
    try {
      if (action === 'layout') { layout = id; try { localStorage.setItem('graao.media.layout', id); } catch { /* per-viewer only */ } render(); }
      if (action === 'pick-files') document.querySelector('[data-md-input]')?.click();
      if (action === 'pick-folder') document.querySelector('[data-md-dir]')?.click();
      if (action === 'new-folder') form('Criar pasta','folder','<label>Nome da pasta<input name="name" maxlength="100" required placeholder="Digite o nome da pasta" autocomplete="off"></label>','Salvar');
      if (action === 'url') form('Enviar por URL','url',`<p class="md-hint">Cole o link direto de uma imagem, vídeo, áudio ou documento (como .mp4, .mp3, .pdf ou .jpg) de até 700 KB, ou até 50 MB com o armazenamento em nuvem ativo. Links de páginas do YouTube, Vimeo ou Loom não são aceitos.</p>
        <label>URL<input name="url" type="url" required placeholder="Cole um link" autocomplete="off"></label>`,'Importar');
      if (action === 'open') open(fileOf(id));
      if (action === 'download') download(fileOf(id));
      if (action === 'rename') { close(); form('Renomear arquivo','rename',`<label>Nome<input name="name" maxlength="240" required value="${h(fileOf(id).name)}"></label>`,'Salvar',id); }
      if (action === 'move') form('Mover arquivo','move',folderChoices(fileOf(id).folderId),'Mover',id);
      if (action === 'move-selected') form(`Mover ${mv.selected.size} arquivo${mv.selected.size > 1 ? 's' : ''}`,'move-selected',folderChoices(folderId()),'Mover');
      if (action === 'rename-folder') form('Renomear pasta','rename-folder',`<label>Nome da pasta<input name="name" maxlength="100" required value="${h(folderOf(id).name)}"></label>`,'Salvar',id);
      if (action === 'move-folder') form('Mover pasta','move-folder',folderChoices(folderOf(id).parentId,id).replace('name="folderId"','name="parentId"'),'Mover',id);
      if (action === 'delete-folder') form('Excluir pasta','delete-folder',`<p>A pasta “${h(folderOf(id).name)}” será excluída. Os arquivos e subpastas dela vão para ${h(folderPath(c, folderOf(id).parentId) || 'Mídia (raiz)')}.</p>`,'Excluir pasta',id,true);
      if (action === 'trash' || action === 'trash-selected') {
        const ids = action === 'trash' ? [id] : [...mv.selected];
        await mutate({ type: 'media-trash', data: { ids } });
        mv.selected.clear(); render();
        flash(`${ids.length > 1 ? `${ids.length} arquivos movidos` : 'Arquivo movido'} para a lixeira.`);
      }
      if (action === 'clear-selection') { mv.selected.clear(); render(); }
      if (action === 'restore') { await mutate({ type: 'media-restore', data: { ids: [id] } }); render(); flash('Arquivo restaurado.'); }
      if (action === 'destroy') form('Excluir definitivamente','destroy',`<p>“${h(fileOf(id).name)}” será excluído para sempre. Esta ação não pode ser desfeita.</p>`,'Excluir',id,true);
      if (action === 'empty-trash') {
        const total = c.s.files.filter(file => file.trashedAt).length;
        form('Esvaziar lixeira','empty-trash',`<p>${total} arquivo${total > 1 ? 's serão excluídos' : ' será excluído'} para sempre. Esta ação não pode ser desfeita.</p>`,'Esvaziar lixeira','',true);
      }
    } catch (error) { flash(error.message, true); }
  });

  document.addEventListener('submit', async event => {
    const target = event.target.closest('[data-md-form]');
    if (!target) return;
    event.preventDefault();
    const action = target.dataset.mdForm, id = target.dataset.id, data = Object.fromEntries(new FormData(target));
    const submit = target.querySelector('button[type="submit"]'), status = target.querySelector('[data-md-error]');
    submit.disabled = true;
    status.textContent = '';
    try {
      let message = '';
      if (action === 'folder') { await save('mediaFolders', { name: data.name, parentId: folderId() }); message = 'Pasta criada.'; }
      if (action === 'url') {
        const result = await api(url('/api/media/import'), { url: data.url, folderId: folderId() });
        c.s = result.state; c.m = result.metrics; message = 'Arquivo importado.';
      }
      if (action === 'rename') { await save('files', { name: data.name }, id); message = 'Arquivo renomeado.'; }
      if (action === 'move') { await save('files', { folderId: data.folderId }, id); message = 'Arquivo movido.'; }
      if (action === 'move-selected') {
        for (const fileId of mv.selected) await save('files', { folderId: data.folderId }, fileId);
        message = `${mv.selected.size} arquivo${mv.selected.size > 1 ? 's movidos' : ' movido'}.`; mv.selected.clear();
      }
      if (action === 'rename-folder') { await save('mediaFolders', { name: data.name, parentId: folderOf(id).parentId }, id); message = 'Pasta renomeada.'; }
      if (action === 'move-folder') { await save('mediaFolders', { name: folderOf(id).name, parentId: data.parentId }, id); message = 'Pasta movida.'; }
      if (action === 'delete-folder') {
        const parent = folderOf(id).parentId || '';
        await mutate({ type: 'delete', key: 'mediaFolders', id });
        if (folderId() === id) location.hash = parent ? `#media/folder/${encodeURIComponent(parent)}` : '#media';
        message = 'Pasta excluída.';
      }
      if (action === 'destroy') { await mutate({ type: 'delete', key: 'files', id }); message = 'Arquivo excluído definitivamente.'; }
      if (action === 'empty-trash') { await mutate({ type: 'media-empty-trash' }); message = 'Lixeira esvaziada.'; }
      close(); render(); flash(message);
    } catch (error) {
      status.textContent = error.message;
      submit.disabled = false;
    }
  });

  document.addEventListener('change', event => {
    if (!inMedia()) return;
    const el = event.target;
    if (el.matches('[data-md-input],[data-md-dir]')) { const list = [...el.files]; el.value = ''; void upload(list); }
    if (el.dataset.mdFilter) { mv[el.dataset.mdFilter] = el.value; render(); }
    if (el.dataset.mdSelect) {
      if (el.checked) mv.selected.add(el.dataset.mdSelect); else mv.selected.delete(el.dataset.mdSelect);
      render();
      document.querySelector(`[data-md-select="${CSS.escape(el.dataset.mdSelect)}"]`)?.focus();
    }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && document.querySelector('.md-menu[open]')) closeMenus(); });

  let depth = 0;
  const zone = () => document.querySelector('[data-media-root]');
  const carriesFiles = event => inMedia() && c.tab !== 'trash' && [...(event.dataTransfer?.types || [])].includes('Files');
  document.addEventListener('dragenter', event => { if (!carriesFiles(event)) return; depth++; zone()?.classList.add('md-dragging'); });
  document.addEventListener('dragover', event => { if (carriesFiles(event)) event.preventDefault(); });
  document.addEventListener('dragleave', event => { if (!carriesFiles(event)) return; if (--depth <= 0) { depth = 0; zone()?.classList.remove('md-dragging'); } });
  document.addEventListener('drop', event => {
    if (!carriesFiles(event)) return;
    event.preventDefault();
    depth = 0;
    zone()?.classList.remove('md-dragging');
    void upload(event.dataTransfer.files);
  });
}
