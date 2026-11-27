// A extensão do Chrome "graao: Importar do GHL" (extensions/ghl-import) como um .zip para baixar.
// O botão "Instalar no Chrome" da janela Importar do GHL aponta para EXTENSION_ZIP_PATH. O zip sai sempre da pasta
// atual (nada pré-gerado para ficar velho) e traz uma pasta só, que o Chrome carrega em "Carregar sem compactação".
// Junto vai graao.json com o endereço do graao de onde o zip foi baixado: a extensão envia a leitura para lá sem que
// ninguém precise preencher o campo "Avançado" (o código de importação só vale no graao que o gerou).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

export const EXTENSION_ZIP_PATH = '/downloads/graao-importar-do-ghl.zip';
export const EXTENSION_FOLDER = 'graao-importar-do-ghl';

function walk(dir) {
  return readdirSync(dir).sort().flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// Data fixa (1/1/2026) nos arquivos: o mesmo conteúdo sempre gera o mesmo zip.
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** Monta um .zip (deflate) com `files` = [{ name, data }]. */
export function zipFiles(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBytes = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data, { level: 9 });
    const useDeflate = packed.length < data.length;
    const body = useDeflate ? packed : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(useDeflate ? 8 : 0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, body);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

/** O endereço (origin) do graao que atendeu `req`, ou '' se o Host não for um endereço válido. */
export function requestOrigin(req) {
  const first = value => String(value || '').split(',')[0].trim();
  const proto = first(req.headers['x-forwarded-proto']) || (req.socket?.encrypted ? 'https' : 'http');
  const host = first(req.headers['x-forwarded-host']) || first(req.headers.host);
  if (!/^https?$/.test(proto) || !/^([a-z0-9.-]+|\[[0-9a-f:]+\])(:\d{1,5})?$/i.test(host)) return '';
  try { return new URL(`${proto}://${host}`).origin; } catch { return ''; }
}

/** O .zip da extensão, com tudo dentro da pasta `graao-importar-do-ghl/` e, se houver `origin`, o graao.json. */
export function extensionZip(root, { origin = '' } = {}) {
  const dir = resolve(root, 'extensions', 'ghl-import');
  const files = walk(dir).map(full => ({
    name: `${EXTENSION_FOLDER}/${relative(dir, full).replaceAll('\\', '/')}`,
    data: readFileSync(full),
  }));
  if (origin) files.push({ name: `${EXTENSION_FOLDER}/graao.json`, data: Buffer.from(`${JSON.stringify({ origin }, null, 2)}\n`) });
  return zipFiles(files);
}
