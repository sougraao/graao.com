import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));

export async function lerPagina(rota) {
  const limpa = rota.replace(/^\/+|\/+$/g, '');
  return readFile(`${dist}${limpa ? `${limpa}/` : ''}index.html`, 'utf8');
}

test('home publicada com tema do graao', async () => {
  const html = await lerPagina('');
  assert.match(html, /lang="pt-BR"/);
  assert.match(html, /Graao/);
});

test('título da aba sem repetição: home só com o nome do site, artigo com artigo e site', async () => {
  const titulo = html => html.match(/<title>([^<]*)<\/title>/)[1];
  assert.equal(titulo(await lerPagina('')), 'Central de ajuda do Graao');
  assert.equal(titulo(await lerPagina('conversas/caixa-unificada')), 'Atender na caixa unificada | Central de ajuda do Graao');
});

test('página de suporte leva ao grupo de suporte no WhatsApp', async () => {
  const html = await lerPagina('suporte/como-pedir-ajuda');
  assert.match(html, /href="https:\/\/chat\.whatsapp\.com\/IuU6twK8qf606ye5wvP638"/);
  assert.match(await lerPagina('suporte'), /href="\/suporte\/como-pedir-ajuda\/"/);
});

test('busca e llms.txt gerados', async () => {
  await access(`${dist}pagefind/pagefind.js`);
  await access(`${dist}llms.txt`);
});

test('componentes renderizam mídia do R2', async () => {
  const html = await lerPagina('interno/componentes');
  assert.match(html, /src="https:\/\/midia\.graao\.com\/docs\/exemplo\/x\/01-a\.0000abcd\.webp"/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /<video[^>]*preload="none"/);
  assert.doesNotMatch(html, /<video[^>]*autoplay/);
  assert.match(html, /<source src="https:\/\/midia\.graao\.com\/docs\/exemplo\/x\/video\.0000abcd\.mp4" type="video\/mp4"/);
  assert.match(html, /noindex/);
  assert.match(html, /Antes de começar/);
  assert.match(html, /Gatilhos/);
  assert.match(html, /Ações/);
});

test('vitrine fora da busca e do menu', async () => {
  const home = await lerPagina('');
  assert.doesNotMatch(home, /interno\/componentes/);
  const html = await lerPagina('interno/componentes');
  assert.doesNotMatch(html, /data-pagefind-body/);
});

const GRUPOS = [
  ['comece-aqui', 'Comece aqui'], ['agencia', 'Agência'], ['configuracoes', 'Configurações'], ['crm', 'CRM'],
  ['conversas', 'Conversas e canais'], ['agendas', 'Agendas'], ['automacoes', 'Automações'], ['sites', 'Sites e conteúdo'],
  ['marketing', 'Marketing'], ['reputacao', 'Reputação'], ['pagamentos', 'Pagamentos e documentos'], ['cursos', 'Cursos e comunidades'],
  ['ia', 'Inteligência artificial'], ['relatorios', 'Relatórios'], ['apps', 'Apps e integrações'], ['suporte', 'Suporte e conformidade'],
];

test('16 grupos no menu na ordem do design', async () => {
  const html = await lerPagina('comece-aqui');
  const menu = html.slice(html.indexOf('<nav'), html.indexOf('</nav>', html.indexOf('sidebar')) + 6);
  let ultimo = -1;
  for (const [, rotulo] of GRUPOS) {
    const pos = menu.indexOf(`>${rotulo}<`);
    assert.ok(pos > ultimo, `"${rotulo}" fora de ordem ou ausente no menu`);
    ultimo = pos;
  }
});

test('cada grupo tem página de seção', async () => {
  for (const [pasta, rotulo] of GRUPOS) assert.match(await lerPagina(pasta), new RegExp(`<h1[^>]*>${rotulo}</h1>`), pasta);
});

test('catálogo de automações não está vazio', async () => {
  const linhas = (await lerPagina('automacoes/gatilhos')).match(/<tr>/g) || [];
  assert.ok(linhas.length > 50, `só ${linhas.length} linhas`);
  const acoes = (await lerPagina('automacoes/acoes')).match(/<tr>/g) || [];
  assert.ok(acoes.length > 50, `só ${acoes.length} linhas`);
});

test('toda página de seção lista os artigos do grupo', async () => {
  const { readdir, readFile: ler } = await import('node:fs/promises');
  const docs = new URL('../src/content/docs/', import.meta.url);
  for (const [pasta] of GRUPOS) {
    const artigos = (await readdir(new URL(`${pasta}/`, docs))).filter(a => a.endsWith('.mdx') && a !== 'index.mdx' && !a.startsWith('_'));
    const indice = await ler(new URL(`${pasta}/index.mdx`, docs), 'utf8');
    for (const artigo of artigos) assert.ok(indice.includes(`href="/${pasta}/${artigo.replace(/\.mdx$/, '')}/"`), `${pasta}/index.mdx não lista ${artigo}`);
  }
});
