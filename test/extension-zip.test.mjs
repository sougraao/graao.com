// O botão "Instalar no Chrome" da janela Importar do GHL baixa a pasta da extensão (extensions/ghl-import) em .zip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { makeServer } from '../server.mjs';
import { EXTENSION_ZIP_PATH, requestOrigin } from '../extension-zip.mjs';
import { GHL_EXTENSION_ZIP } from '../ui/ghl-import-view.js';

/** Lê um .zip pelo diretório central: { nome: conteúdo }. */
function unzip(zip) {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'fim do diretório central');
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    assert.equal(zip.readUInt32LE(at), 0x02014b50);
    const method = zip.readUInt16LE(at + 10), size = zip.readUInt32LE(at + 20), nameLength = zip.readUInt16LE(at + 28);
    const extra = zip.readUInt16LE(at + 30), comment = zip.readUInt16LE(at + 32), offset = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    const start = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
    const body = zip.subarray(start, start + size);
    out[name] = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    at += 46 + nameLength + extra + comment;
  }
  return out;
}

test('the Instalar no Chrome button downloads the extension folder as a zip', async t => {
  assert.equal(GHL_EXTENSION_ZIP, EXTENSION_ZIP_PATH, 'the button and the route use the same address');
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: false, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const response = await fetch(`${base}${EXTENSION_ZIP_PATH}`, { redirect: 'manual' });
  assert.equal(response.status, 200, 'opens without signing in');
  assert.equal(response.headers.get('content-type'), 'application/zip');
  assert.match(response.headers.get('content-disposition'), /attachment; filename="graao-importar-do-ghl\.zip"/);
  const files = unzip(Buffer.from(await response.arrayBuffer()));
  const dir = new URL('../extensions/ghl-import/', import.meta.url);
  const expected = readdirSync(dir).sort();
  assert.deepEqual(Object.keys(files).sort(), [...expected, 'graao.json'].sort().map(name => `graao-importar-do-ghl/${name}`), 'one folder with every file');
  assert.deepEqual(JSON.parse(files['graao-importar-do-ghl/graao.json'].toString('utf8')), { origin: base }, 'the extension sends to the graao it came from');
  for (const name of expected) assert.ok(files[`graao-importar-do-ghl/${name}`].equals(readFileSync(new URL(name, dir))), `${name} unchanged`);
  assert.equal(JSON.parse(files['graao-importar-do-ghl/manifest.json'].toString('utf8')).manifest_version, 3);
});

test('the zip remembers the graao address it was downloaded from', () => {
  const req = headers => ({ headers, socket: {} });
  assert.equal(requestOrigin(req({ host: 'localhost:4319' })), 'http://localhost:4319');
  assert.equal(requestOrigin(req({ host: 'x', 'x-forwarded-host': 'www.graao.com', 'x-forwarded-proto': 'https' })), 'https://www.graao.com');
  assert.equal(requestOrigin(req({ host: 'app.agencia.com.br', 'x-forwarded-proto': 'https,http' })), 'https://app.agencia.com.br');
  assert.equal(requestOrigin(req({ host: 'evil.com/"<x>' })), '', 'a strange Host gives no address');
  assert.equal(requestOrigin(req({ host: 'a.com', 'x-forwarded-proto': 'javascript' })), '');
});
