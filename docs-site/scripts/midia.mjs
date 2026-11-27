// Envia prints e vídeos da documentação para o bucket público do R2 (midia.graao.com).
// Uso:
//   npm run docs:midia -- enviar <pasta> <grupo> <artigo>   envia a pasta e imprime as chaves
//   npm run docs:midia -- local <pasta> <grupo> <artigo>    copia para a prévia local (DOCS_MIDIA_BASE=/midia-local)
//   npm run docs:midia -- verificar                         confere se toda mídia citada nos .mdx existe no bucket
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeKey, sha256, signHeaders } from './sigv4.mjs';

import { MIDIA_BASE, midiaBase } from './midia-base.mjs';

export { MIDIA_BASE, midiaBase };
const CACHE = 'public, max-age=31536000, immutable';
const TIPOS = { webp: 'image/webp', png: 'image/png', mp4: 'video/mp4', vtt: 'text/vtt' };

export const slug = nome => String(nome).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9.]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

export function tipoDe(ext) {
  const tipo = TIPOS[String(ext).replace(/^\./, '').toLowerCase()];
  if (!tipo) throw new Error(`Extensão sem suporte na documentação: ${ext}. Use ${Object.keys(TIPOS).join(', ')}.`);
  return tipo;
}

export function chaveDe({ grupo, artigo, arquivo, conteudo }) {
  const ext = extname(arquivo).slice(1).toLowerCase();
  const base = slug(arquivo.slice(0, -(ext.length + 1)));
  return `docs/${slug(grupo)}/${slug(artigo)}/${base}.${sha256(conteudo).slice(0, 8)}.${ext}`;
}

export function criarCliente({ accountId, accessKeyId, secretAccessKey, bucket, request = fetch }) {
  if (!/^[a-f0-9]{32}$/.test(accountId || '')) throw new Error('R2_DOCS_ACCOUNT_ID precisa ser o id de 32 caracteres da conta Cloudflare.');
  if (!accessKeyId || !secretAccessKey || !bucket) throw new Error('Defina R2_DOCS_ACCESS_KEY_ID, R2_DOCS_SECRET_ACCESS_KEY e R2_DOCS_BUCKET no .env.local.');
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const chamar = (method, chave, { body, headers = {} } = {}) => {
    const path = `/${bucket}/${encodeKey(chave)}`;
    const assinados = signHeaders({ accessKeyId, secretAccessKey, method, host, path, headers, payloadHash: sha256(body ?? '') });
    return request(`https://${host}${path}`, { method, headers: assinados, body, redirect: 'error' });
  };
  return {
    async existe(chave) {
      const resposta = await chamar('HEAD', chave);
      if (resposta.status === 404) return false;
      if (!resposta.ok) throw new Error(`O R2 não respondeu sobre ${chave} (${resposta.status}).`);
      return true;
    },
    async enviar(chave, corpo, tipo) {
      const resposta = await chamar('PUT', chave, { body: corpo, headers: { 'cache-control': CACHE, 'content-type': tipo } });
      if (!resposta.ok) throw new Error(`O R2 recusou ${chave} (${resposta.status}).`);
    }
  };
}

export async function enviarPasta({ pasta, grupo, artigo, cliente }) {
  const nomes = (await readdir(pasta, { withFileTypes: true })).filter(e => e.isFile()).map(e => e.name).sort();
  const resultado = [];
  for (const arquivo of nomes) {
    const tipo = tipoDe(extname(arquivo));
    const conteudo = await readFile(join(pasta, arquivo));
    const chave = chaveDe({ grupo, artigo, arquivo, conteudo });
    const enviado = !(await cliente.existe(chave));
    if (enviado) await cliente.enviar(chave, conteudo, tipo);
    resultado.push({ arquivo, chave, url: `${MIDIA_BASE}/${chave}`, enviado });
  }
  return resultado;
}

// Copia a mídia para docs-site/public/midia-local/<chave>, para ver o artigo antes de enviar ao R2.
export async function copiarLocal({ pasta, grupo, artigo, destino }) {
  const nomes = (await readdir(pasta, { withFileTypes: true })).filter(e => e.isFile()).map(e => e.name).sort();
  const resultado = [];
  for (const arquivo of nomes) {
    tipoDe(extname(arquivo));
    const conteudo = await readFile(join(pasta, arquivo));
    const chave = chaveDe({ grupo, artigo, arquivo, conteudo });
    await mkdir(dirname(join(destino, chave)), { recursive: true });
    await writeFile(join(destino, chave), conteudo);
    resultado.push({ arquivo, chave });
  }
  return resultado;
}

export const chavesNoMdx = texto => [...String(texto).matchAll(/<(?:Print|Video)\b[^>]*>/g)]
  .flatMap(([tag]) => [...tag.matchAll(/\b(?:src|poster)="([^"]+)"/g)].map(m => m[1]));

export async function chavesAusentes(chaves, cliente) {
  const ausentes = [];
  for (const chave of [...new Set(chaves)]) if (!(await cliente.existe(chave))) ausentes.push(chave);
  return ausentes;
}

// Troca, no texto do artigo, cada chave antiga pela chave nova do mesmo arquivo (mesmo nome, hash diferente).
export function trocarChaves(texto, chaves) {
  let saida = String(texto);
  for (const chave of chaves) {
    const semHash = chave.replace(/\.[0-9a-f]{8}(\.[a-z0-9]+)$/, '');
    const ext = chave.slice(chave.lastIndexOf('.'));
    const escapar = valor => valor.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    saida = saida.replace(new RegExp(`${escapar(semHash)}\\.[0-9a-f]{8}${escapar(ext)}`, 'g'), chave);
  }
  return saida;
}

// Depois de enviar ou copiar, o artigo <grupo>/<artigo>.mdx passa a citar os hashes novos.
async function atualizarArtigo(grupo, artigo, chaves) {
  const arquivo = fileURLToPath(new URL(`../src/content/docs/${grupo}/${artigo}.mdx`, import.meta.url));
  const texto = await readFile(arquivo, 'utf8').catch(() => null);
  if (texto === null) return;
  const novo = trocarChaves(texto, chaves);
  if (novo !== texto) { await writeFile(arquivo, novo); console.log(`artigo atualizado: ${grupo}/${artigo}.mdx`); }
}

async function* arquivosMdx(pasta) {
  for (const entrada of await readdir(pasta, { withFileTypes: true })) {
    const caminho = join(pasta, entrada.name);
    if (entrada.isDirectory()) yield* arquivosMdx(caminho);
    else if (entrada.name.endsWith('.mdx')) yield caminho;
  }
}

// Rascunhos (_*.mdx) e a vitrine interna usam chaves de exemplo, que nunca vão para o bucket.
export function deveVerificar(caminho) {
  const partes = String(caminho).split(/[\\/]/);
  return partes[0] !== 'interno' && !partes.some(parte => parte.startsWith('_'));
}

async function cli([comando, ...args]) {
  const env = process.env;
  if (comando === 'local' && args.length === 3) {
    const [pasta, grupo, artigo] = args;
    const destino = fileURLToPath(new URL('../public/midia-local/', import.meta.url));
    const itens = await copiarLocal({ pasta, grupo, artigo, destino });
    for (const item of itens) console.log(item.chave);
    await atualizarArtigo(grupo, artigo, itens.map(i => i.chave));
    return 0;
  }
  const cliente = criarCliente({ accountId: env.R2_DOCS_ACCOUNT_ID, accessKeyId: env.R2_DOCS_ACCESS_KEY_ID, secretAccessKey: env.R2_DOCS_SECRET_ACCESS_KEY, bucket: env.R2_DOCS_BUCKET });
  if (comando === 'enviar' && args.length === 3) {
    const [pasta, grupo, artigo] = args;
    const itens = await enviarPasta({ pasta, grupo, artigo, cliente });
    for (const item of itens) console.log(`${item.enviado ? 'enviado ' : 'já existe'} ${item.chave}`);
    await atualizarArtigo(grupo, artigo, itens.map(i => i.chave));
    return 0;
  }
  if (comando === 'verificar') {
    const docs = fileURLToPath(new URL('../src/content/docs/', import.meta.url));
    const chaves = [];
    for await (const arquivo of arquivosMdx(docs)) {
      if (!deveVerificar(relative(docs, arquivo))) continue;
      chaves.push(...chavesNoMdx(await readFile(arquivo, 'utf8')));
    }
    const ausentes = await chavesAusentes(chaves, cliente);
    for (const chave of ausentes) console.log(`ausente ${chave}`);
    console.log(`${chaves.length - ausentes.length} de ${chaves.length} arquivos de mídia no bucket.`);
    return ausentes.length ? 1 : 0;
  }
  console.log('Uso: midia.mjs enviar|local <pasta> <grupo> <artigo> | midia.mjs verificar');
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = await cli(process.argv.slice(2));
