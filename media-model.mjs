// Media Storage: files kept inline as data URLs, organized in nested folders, with a trash that can be
// restored or emptied. Upload by URL is fetched server-side and parsed here.
export const mediaCollections = ['mediaFolders'];
export const mediaLimitBytes = 700_000;

// Accepted MIME types and the filter group each one belongs to.
export const mediaTypes = {
  'image/png': 'photo', 'image/jpeg': 'photo', 'image/gif': 'photo', 'image/webp': 'photo',
  'video/mp4': 'video', 'video/webm': 'video',
  'audio/mpeg': 'audio', 'audio/wav': 'audio', 'audio/ogg': 'audio',
  'application/pdf': 'doc', 'text/plain': 'doc', 'text/csv': 'doc'
};

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const now = () => new Date().toISOString();
const dataPattern = /^data:([a-z]+\/[a-z0-9.+-]+);base64,[A-Za-z0-9+/]+=*$/;

export const mediaMime = data => String(data || '').slice(5, String(data || '').indexOf(';'));
// Object keys a list of files holds in R2 (to delete them once the records are gone).
export const r2KeysOf = files => new Set((files || []).map(file => file.r2Key).filter(Boolean));
export const mediaKind = data => mediaTypes[mediaMime(data)] || 'other';

// Segurança (auditoria, item 12): o tipo vem do navegador, então o começo do arquivo precisa bater com ele. Um HTML
// enviado como image/png é recusado. TXT e CSV não têm assinatura e seguem como antes.
const startsWith = (bytes, ...values) => values.every((value, at) => value === null || bytes[at] === value);
const ascii = (bytes, at, text) => bytes.subarray(at, at + text.length).toString('latin1') === text;
const signatures = {
  'image/png': b => startsWith(b, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
  'image/jpeg': b => startsWith(b, 0xff, 0xd8, 0xff),
  'image/gif': b => ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a'),
  'image/webp': b => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP'),
  'video/mp4': b => ascii(b, 4, 'ftyp'),
  'video/webm': b => startsWith(b, 0x1a, 0x45, 0xdf, 0xa3),
  'audio/mpeg': b => ascii(b, 0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  'audio/wav': b => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE'),
  'audio/ogg': b => ascii(b, 0, 'OggS'),
  'application/pdf': b => ascii(b, 0, '%PDF-')
};
/** Quantos bytes do começo do arquivo bastam para conferir o tipo. */
export const SIGNATURE_BYTES = 16;
/** O começo do arquivo (Buffer) confere com o tipo declarado? */
export const bytesMatch = (mime, head) => signatures[mime] ? signatures[mime](Buffer.from(head || [])) : Boolean(mediaTypes[mime]);
const wrongBytes = 'O conteúdo do arquivo não confere com o tipo dele. Envie o arquivo original, sem trocar a extensão.';

export function mediaFile(value) {
  const type = typeof value === 'string' && value.length <= 1_000_000 && value.match(dataPattern)?.[1];
  if (!type || !mediaTypes[type]) fail('Escolha um arquivo de imagem, vídeo, áudio, PDF, TXT ou CSV de até 700 KB.');
  const start = value.indexOf(',') + 1;
  if (!bytesMatch(type, Buffer.from(value.slice(start, start + 24), 'base64'))) fail(wrongBytes, 422);
  return value;
}

const folderParent = (s, value, self) => {
  const id = str(value, 60);
  if (!id) return '';
  const folders = new Map(s.mediaFolders.map(folder => [folder.id, folder]));
  if (!folders.has(id)) fail('Pasta não encontrada.', 404);
  for (let cursor = id; cursor; cursor = folders.get(cursor)?.parentId) {
    if (self && cursor === self) fail('Uma pasta não pode ficar dentro dela mesma.');
  }
  return id;
};

export const mediaFields = {
  files: (s, d) => {
    const prior = d.id ? s.files.find(row => row.id === d.id) : null;
    return {
      name: str(d.name ?? prior?.name, 240) || fail('Dê um nome ao arquivo.'),
      // A file kept in R2 has no inline data; its object key, type and size never change after upload.
      // Só um conteúdo novo é conferido: renomear ou mover um arquivo salvo antes continua funcionando.
      data: prior?.r2Key ? '' : prior && (d.data === undefined || d.data === prior.data) ? prior.data : mediaFile(d.data),
      folderId: d.folderId === undefined ? prior?.folderId || '' : folderParent(s, d.folderId),
      trashedAt: prior?.trashedAt || ''
    };
  },
  mediaFolders: (s, d) => {
    if (!d.id && s.mediaFolders.length >= 200) fail('O limite é de 200 pastas por subconta.');
    return { name: str(d.name, 100) || fail('Informe o nome da pasta.'), parentId: folderParent(s, d.parentId, d.id) };
  }
};

// A deleted folder hands its files and subfolders to its own parent, so nothing is lost by accident.
export function mediaBeforeDelete(s, key, id) {
  if (key !== 'mediaFolders') return;
  const parent = s.mediaFolders.find(folder => folder.id === id)?.parentId || '';
  for (const file of s.files) if (file.folderId === id) file.folderId = parent;
  for (const folder of s.mediaFolders) if (folder.parentId === id) folder.parentId = parent;
}

const chosen = (s, d) => {
  const ids = Array.isArray(d?.ids) ? new Set(d.ids.slice(0, 200)) : new Set();
  return s.files.filter(file => ids.has(file.id));
};

export const mediaCommandTypes = ['media-trash', 'media-restore', 'media-empty-trash'];

export function mediaCommand(s, type, d, remove) {
  if (type === 'media-trash') {
    const stamp = now();
    for (const file of chosen(s, d)) file.trashedAt ||= stamp;
  } else if (type === 'media-restore') {
    for (const file of chosen(s, d)) {
      file.trashedAt = '';
      if (file.folderId && !s.mediaFolders.some(folder => folder.id === file.folderId)) file.folderId = '';
    }
  } else if (type === 'media-empty-trash') {
    for (const file of s.files.filter(row => row.trashedAt)) remove(s, 'files', file.id);
  }
  return '';
}

// A file the browser sent straight to R2, recorded by the server after it checked the stored object.
// Server-only: it is not in the command list clients may send, and the key must belong to this workspace.
export function storedFile(s, d, workspace) {
  const prefix = `ws/${workspace}/files/`;
  if (typeof d.r2Key !== 'string' || !d.r2Key.startsWith(prefix) || d.r2Key.slice(prefix.length) !== d.id) fail('Arquivo inválido.');
  if (!mediaTypes[d.mime]) fail('Tipo de arquivo não aceito.');
  if (!Number.isInteger(d.size) || d.size < 1) fail('O arquivo está vazio.');
  if (s.files.length >= 60) fail('The local drive holds up to 60 files.');
  if (s.files.some(file => file.id === d.id)) return d.id;
  s.files.push({ id: d.id, created: now(), name: str(d.name, 240) || 'arquivo', data: '', r2Key: d.r2Key, mime: d.mime, size: d.size,
    src: `/m/${workspace}/${d.id}`, folderId: folderParent(s, d.folderId), trashedAt: '' });
  return d.id;
}

// Checks a fetched response (status, type, size) and names the file, or explains why the link cannot be imported.
export function importedMeta(response, address, limit = mediaLimitBytes) {
  if (response.status !== 200) fail(`O endereço respondeu com o status ${response.status}.`, 422);
  const type = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!mediaTypes[type]) fail('Use um link direto para o arquivo (imagem, vídeo, áudio ou documento). Páginas como YouTube, Vimeo ou Loom não são aceitas.', 422);
  const declared = Number(response.headers['content-length']);
  if (response.truncated || response.body.length > limit || declared > limit) fail(`O arquivo tem mais de ${limit === mediaLimitBytes ? '700 KB' : `${Math.round(limit / 1024 / 1024)} MB`}.`, 413);
  if (!response.body.length) fail('O arquivo está vazio.', 422);
  if (!bytesMatch(type, response.body.subarray(0, SIGNATURE_BYTES))) fail(wrongBytes, 422);
  let name = '';
  try { name = decodeURIComponent(new URL(address).pathname.split('/').filter(Boolean).pop() || ''); } catch { /* keep fallback */ }
  return { name: str(name, 240) || 'arquivo-importado', mime: type };
}

// Turns a fetched response into an inline file record.
export function importedFile(response, address) {
  const { name, mime } = importedMeta(response, address);
  return { name, data: `data:${mime};base64,${response.body.toString('base64')}` };
}
