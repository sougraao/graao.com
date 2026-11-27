import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildId, makeServer } from '../server.mjs';
import { carregarBuild, rodapeHtml } from '../ui/rodape.js';

test('versão do rodapé: commit da Vercel, depois o git, e "local" sem nenhum', () => {
  assert.equal(buildId({ VERCEL_GIT_COMMIT_SHA: '60C160ACE92717477AFA5CF7B64622748BB90872' }, () => 'abcdef0'), '60c160a');
  assert.equal(buildId({}, () => 'abcdef0\n'), 'abcdef0');
  assert.equal(buildId({}, () => { throw new Error('sem git'); }), 'local');
  assert.equal(buildId({}, () => '<script>'), 'local', 'só aceita um hash de commit');
});

test('GET /api/versao responde a versão sem login e pode ficar em cache', async t => {
  const { server, host } = makeServer({ dbPath: ':memory:', port: 0, auth: null, allowLocalAccess: false, socialScheduler: false });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const res = await fetch(`http://${host}:${server.address().port}/api/versao`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /public, max-age=300/);
  assert.match((await res.json()).build, /^([0-9a-f]{7}|local)$/);
  for (const [path, type] of [['/rodape.js', /javascript/], ['/rodape.css', /text\/css/]]) {
    const file = await fetch(`http://${host}:${server.address().port}${path}`);
    assert.equal(file.status, 200, path);
    assert.match(file.headers.get('content-type'), type, path);
  }
});

test('linha do rodapé: direitos com a marca exibida, protegida, e a versão quando já foi lida', async () => {
  const html = rodapeHtml('Agência <Teste>');
  assert.match(html, /© \d{4} Agência &lt;Teste&gt;\. Feita no Brasil com ☕, carinho e muita API\./);
  assert.match(rodapeHtml(''), /© \d{4} graao\./);
  await carregarBuild(async () => ({ ok: true, json: async () => ({ build: '60c160a' }) }));
  assert.match(rodapeHtml(), /<span class="rodape-build" data-rodape-build>build 60c160a<\/span>/);
});

test('páginas do graao e painel carregam a linha do rodapé', () => {
  for (const page of ['index.html', 'login.html', 'privacidade.html', 'mcp-autorizar.html']) {
    const html = readFileSync(new URL(`../ui/${page}`, import.meta.url), 'utf8');
    assert.match(html, /Feita no Brasil com ☕, carinho e muita API\./, page);
    assert.match(html, /data-rodape-build/, page);
    assert.match(html, /src="\/rodape\.js"/, page);
    assert.match(html, /href="\/rodape\.css"/, page);
  }
  assert.match(readFileSync(new URL('../ui/app.html', import.meta.url), 'utf8'), /href="\/rodape\.css"/);
  assert.match(readFileSync(new URL('../ui/app.js', import.meta.url), 'utf8'), /rodapeHtml\(brand\)/);
  assert.match(readFileSync(new URL('../ui/agency.js', import.meta.url), 'utf8'), /rodapeHtml\(brandName\(\)\)/);
});
