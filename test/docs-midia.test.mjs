import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { slug, chaveDe, tipoDe, criarCliente, enviarPasta, chavesNoMdx, chavesAusentes, MIDIA_BASE } from '../docs-site/scripts/midia.mjs';

const ACCOUNT = '0123456789abcdef0123456789abcdef';

// Um bucket em memória que responde como a API S3 do R2 (PUT e HEAD).
function bucketFalso() {
  const objetos = new Map();
  const pedidos = [];
  const request = async (url, { method, headers, body }) => {
    pedidos.push({ url, method, headers });
    const chave = new URL(url).pathname;
    if (method === 'PUT') { objetos.set(chave, { body, headers }); return new Response(null, { status: 200 }); }
    if (method === 'HEAD') return new Response(null, { status: objetos.has(chave) ? 200 : 404 });
    return new Response(null, { status: 405 });
  };
  return { objetos, pedidos, request };
}

const cliente = request => criarCliente({ accountId: ACCOUNT, accessKeyId: 'AKID', secretAccessKey: 'SECRET', bucket: 'graao-docs-midia', request });

test('slug tira acento, espaço e maiúscula', () => {
  assert.equal(slug('02 Novo Contato.PNG'), '02-novo-contato.png');
  assert.equal(slug('Ação rápida'), 'acao-rapida');
});

test('chave leva grupo, artigo, nome em slug e hash do conteúdo', () => {
  const chave = chaveDe({ grupo: 'crm', artigo: 'criar-pipeline', arquivo: '03 Nova etapa.webp', conteudo: Buffer.from('x') });
  assert.match(chave, /^docs\/crm\/criar-pipeline\/03-nova-etapa\.[0-9a-f]{8}\.webp$/);
  const hash = createHash('sha256').update('x').digest('hex').slice(0, 8);
  assert.ok(chave.endsWith(`.${hash}.webp`));
});

test('tipoDe conhece as extensões da documentação e recusa as outras', () => {
  assert.equal(tipoDe('webp'), 'image/webp');
  assert.equal(tipoDe('.PNG'), 'image/png');
  assert.equal(tipoDe('mp4'), 'video/mp4');
  assert.equal(tipoDe('vtt'), 'text/vtt');
  assert.throws(() => tipoDe('gif'));
});

test('enviar assina e manda o cache imutável para o bucket certo', async () => {
  const b = bucketFalso();
  await cliente(b.request).enviar('docs/a/b/1.abcdef12.webp', Buffer.from('img'), 'image/webp');
  const [pedido] = b.pedidos;
  assert.equal(pedido.method, 'PUT');
  assert.equal(pedido.url, `https://${ACCOUNT}.r2.cloudflarestorage.com/graao-docs-midia/docs/a/b/1.abcdef12.webp`);
  assert.equal(pedido.headers['cache-control'], 'public, max-age=31536000, immutable');
  assert.equal(pedido.headers['content-type'], 'image/webp');
  assert.match(pedido.headers.Authorization, /^AWS4-HMAC-SHA256 /);
});

test('enviar a mesma pasta duas vezes não duplica nada', async () => {
  const pasta = await mkdtemp(join(tmpdir(), 'midia-'));
  await writeFile(join(pasta, '01 Menu.webp'), 'a');
  await writeFile(join(pasta, '02-tela.webp'), 'b');
  const b = bucketFalso();
  const c = cliente(b.request);
  const primeira = await enviarPasta({ pasta, grupo: 'crm', artigo: 'contatos', cliente: c });
  assert.equal(primeira.length, 2);
  assert.ok(primeira.every(item => item.enviado));
  assert.equal(primeira[0].url, `${MIDIA_BASE}/${primeira[0].chave}`);
  const segunda = await enviarPasta({ pasta, grupo: 'crm', artigo: 'contatos', cliente: c });
  assert.ok(segunda.every(item => !item.enviado));
  assert.deepEqual(segunda.map(i => i.chave), primeira.map(i => i.chave));
  assert.equal(b.objetos.size, 2);
});

test('chavesNoMdx acha src e poster de Print e Video', () => {
  const texto = '<Print src="docs/a/b/1.abcdef12.webp" alt="x" />\n<Video src="docs/a/b/v.12345678.mp4" poster="docs/a/b/v.12345678.webp" />';
  assert.deepEqual(chavesNoMdx(texto), ['docs/a/b/1.abcdef12.webp', 'docs/a/b/v.12345678.mp4', 'docs/a/b/v.12345678.webp']);
});

test('chavesAusentes lista o que o MDX cita e o bucket não tem', async () => {
  const b = bucketFalso();
  const c = cliente(b.request);
  await c.enviar('docs/a/b/1.abcdef12.webp', Buffer.from('img'), 'image/webp');
  assert.deepEqual(await chavesAusentes(['docs/a/b/1.abcdef12.webp', 'docs/a/b/2.00000000.webp'], c), ['docs/a/b/2.00000000.webp']);
});

test('midiaBase usa DOCS_MIDIA_BASE quando definida (prévia local) e o R2 nos outros casos', async () => {
  const { midiaBase } = await import('../docs-site/scripts/midia.mjs');
  assert.equal(midiaBase({}), 'https://midia.graao.com');
  assert.equal(midiaBase({ DOCS_MIDIA_BASE: '/midia-local/' }), '/midia-local');
});

test('copiarLocal põe a mídia na pasta pública com a mesma chave do R2', async () => {
  const { copiarLocal } = await import('../docs-site/scripts/midia.mjs');
  const { readFile: ler } = await import('node:fs/promises');
  const pasta = await mkdtemp(join(tmpdir(), 'midia-'));
  const destino = await mkdtemp(join(tmpdir(), 'publico-'));
  await writeFile(join(pasta, '01 Menu.webp'), 'a');
  const [item] = await copiarLocal({ pasta, grupo: 'crm', artigo: 'contatos', destino });
  assert.match(item.chave, /^docs\/crm\/contatos\/01-menu\.[0-9a-f]{8}\.webp$/);
  assert.equal(await ler(join(destino, item.chave), 'utf8'), 'a');
});

test('trocarChaves põe no MDX o hash novo de cada print refeito e mantém o resto', async () => {
  const { trocarChaves } = await import('../docs-site/scripts/midia.mjs');
  const texto = '<Print src="docs/crm/x/01-menu.aaaaaaaa.webp" alt="a" />\n<Print src="docs/crm/x/02-tela.bbbbbbbb.webp" alt="b" />';
  const novo = trocarChaves(texto, ['docs/crm/x/01-menu.12345678.webp']);
  assert.equal(novo, '<Print src="docs/crm/x/01-menu.12345678.webp" alt="a" />\n<Print src="docs/crm/x/02-tela.bbbbbbbb.webp" alt="b" />');
});

test('trocarChaves não reescreve outra chave parecida (ponto é ponto, não qualquer caractere)', async () => {
  const { trocarChaves } = await import('../docs-site/scripts/midia.mjs');
  const texto = '<Print src="docs/crm/x/01-menuX12345678.webp" alt="a" />';
  assert.equal(trocarChaves(texto, ['docs/crm/x/01-menu.abcdef12.webp']), texto);
});

test('os componentes de mídia não dependem de código fora de docs-site/', async () => {
  const { readFile: ler } = await import('node:fs/promises');
  const base = await ler(new URL('../docs-site/scripts/midia-base.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(base, /^\s*import\s/m, 'midia-base.mjs não importa nada');
  for (const nome of ['Print', 'Video']) {
    const comp = await ler(new URL(`../docs-site/src/components/${nome}.astro`, import.meta.url), 'utf8');
    assert.match(comp, /from '\.\.\/\.\.\/scripts\/midia-base\.mjs'/, `${nome}.astro importa de midia-base.mjs`);
  }
});

test('o verificar ignora rascunhos e a vitrine interna, que usam chaves de exemplo', async () => {
  const { deveVerificar } = await import('../docs-site/scripts/midia.mjs');
  assert.equal(deveVerificar('crm/contatos.mdx'), true);
  assert.equal(deveVerificar('_modelo.mdx'), false);
  assert.equal(deveVerificar('interno/componentes.mdx'), false);
  assert.equal(deveVerificar('interno\\componentes.mdx'), false);
});
