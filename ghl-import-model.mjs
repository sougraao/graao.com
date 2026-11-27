// Importar do GHL: o código que liga a extensão do Chrome à agência e o estado de cada importação (agency.ghlImports).
// O código vale 30 minutos, serve uma vez e só o SHA-256 dele fica guardado. A extensão manda a extração em partes
// (dump, triggers, surveys), cada uma em pedaços de até 3 MB; depois a janela da graao conduz a conversão (ghl-import-run.mjs).
import { createHash, randomBytes } from 'node:crypto';
import { uid } from './model.mjs';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };

export const IMPORT_TTL = 30 * 60 * 1000;
export const PART_MAX = 3 * 1024 * 1024;
export const UPLOAD_MAX = 60 * 1024 * 1024;
export const PART_NAMES = ['dump', 'triggers', 'surveys'];
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const KEEP = 10;

const plain = code => String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
export const codeHash = code => createHash('sha256').update(plain(code)).digest('hex');

/** Uma importação que não terminou em 2 horas foi abandonada (janela fechada, código vencido no meio do envio). */
export const IMPORT_STALE = 2 * 60 * 60 * 1000;

/**
 * Gera o código e o job de uma importação nova (guarda só os 10 mais recentes). As importações abandonadas viram
 * "failed" e `released` lista as linhas temporárias delas e das que saíram da lista, para a rota apagar.
 */
export function newImportCode(agency, { now = Date.now(), random = randomBytes } = {}) {
  if ((agency.snapshots || []).length >= 50) fail('Você já tem 50 setups. Apague um antes de importar.');
  const bytes = random(9);
  const raw = Array.from(bytes, byte => ALPHABET[byte % ALPHABET.length]).join('');
  const code = `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6, 9)}`;
  const job = { id: uid(), codeHash: codeHash(code), created: now, expiresAt: now + IMPORT_TTL, status: 'waiting', parts: {}, received: {}, bytes: 0,
    pagesDone: 0, pagesTotal: 0, imagesDone: 0, imagesTotal: 0, location: '', notes: [], errors: [], snapshotId: '', error: '' };
  const released = [];
  const all = [...(agency.ghlImports || []), job];
  for (const row of all) {
    if (row === job || ['done', 'failed'].includes(row.status) || now - (row.created || 0) < IMPORT_STALE) continue;
    row.status = 'failed';
    row.error = 'A importação ficou parada e foi cancelada. Gere outro código para importar de novo.';
  }
  const kept = all.slice(-KEEP);
  for (const row of all) {
    if (row === job || (kept.includes(row) && row.status !== 'failed')) continue;
    released.push(...(row.rows || []));
    row.rows = [];
  }
  agency.ghlImports = kept;
  return { code, job, released };
}

/** O job de um código válido: existe, não expirou e ainda está recebendo partes. */
export function jobByCode(agency, code, { now = Date.now() } = {}) {
  const hash = codeHash(code);
  const job = (agency.ghlImports || []).find(row => row.codeHash === hash);
  if (!job || now > job.expiresAt || !['waiting', 'receiving'].includes(job.status)) fail('Código inválido ou expirado. Gere outro na graao.', 401);
  return job;
}

/** Registra um pedaço recebido de uma parte. */
export function acceptPart(job, { name, index, total, bytes }) {
  if (!PART_NAMES.includes(name)) fail('Parte desconhecida da importação.');
  if (!Number.isInteger(total) || total < 1 || total > 100 || !Number.isInteger(index) || index < 0 || index >= total) fail('Pedaço inválido da importação.');
  if (bytes > PART_MAX) fail('Cada pedaço da importação pode ter até 3 MB.', 413);
  if ((job.bytes || 0) + bytes > UPLOAD_MAX) fail('A importação passou de 60 MB.', 413);
  job.bytes = (job.bytes || 0) + bytes;
  job.status = 'receiving';
  job.parts[name] = total;
  job.received[name] = [...new Set([...(job.received[name] || []), index])].sort((a, b) => a - b);
}

/** Fecha o envio: todas as partes, com todos os pedaços, precisam ter chegado. */
export function finishUpload(job) {
  const complete = PART_NAMES.every(name => job.parts[name] && (job.received[name] || []).length === job.parts[name]);
  if (!complete) fail('Faltam partes da importação. Tente enviar de novo pela extensão.');
  job.status = 'received';
}

/** O job como a janela da graao vê (sem o hash do código). */
export const jobView = ({ codeHash: _hash, ...job }) => job;
