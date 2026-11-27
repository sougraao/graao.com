// Roteiro de prints do artigo ia/servidor-mcp. A IA é simulada: o pedido de conexão é feito pela própria página
// e a volta para o endereço da IA fica bloqueada, então nada sai da Agência Demo local.
const RETORNO = 'https://claude.ai/api/mcp/auth_callback';

async function abrirTela(page) {
  await page.locator('[data-sp-view="mcp"]').first().click();
  await page.locator('[data-mcp-tools] li').first().waitFor();
  // O endereço do print é o do graao, não o do servidor local.
  await page.evaluate(() => {
    const trocar = texto => texto.replaceAll(location.origin, 'https://graao.com');
    for (const campo of document.querySelectorAll('.mcp-copy input')) campo.value = trocar(campo.value);
    for (const codigo of document.querySelectorAll('.mcp-code code')) codigo.textContent = trocar(codigo.textContent);
  });
}

export default {
  grupo: 'ia',
  artigo: 'servidor-mcp',
  subconta: 'Clínica Sorriso Leve',
  rota: '#marketing',
  passos: [
    { nome: 'endereco', acao: abrirTela, destacar: '.mcp-copy' },
    { nome: 'guia-do-claude', acao: page => page.locator('.mcp-guide summary').first().click(), destacar: '.mcp-guide[open]' },
    { nome: 'autorizar', acao: async page => {
      await page.route('https://claude.ai/**', rota => rota.abort());
      const pedido = await page.evaluate(async retorno => {
        const post = (caminho, corpo) => fetch(caminho, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
        const { client_id } = await (await post('/api/mcp/oauth/register', { client_name: 'Claude', redirect_uris: [retorno] })).json();
        const verificador = 'demo'.repeat(16);
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador)));
        const desafio = btoa(String.fromCharCode(...hash)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const resource = `${location.origin}/api/mcp/${new URLSearchParams(location.search).get('workspace')}`;
        sessionStorage.setItem('mcp-demo', JSON.stringify({ client_id, verificador, tela: location.href }));
        return `/mcp/autorizar?${new URLSearchParams({ response_type: 'code', client_id, redirect_uri: retorno, code_challenge: desafio, code_challenge_method: 'S256', state: 'demo', resource })}`;
      }, RETORNO);
      await page.goto(new URL(pedido, page.url()).href, { waitUntil: 'networkidle' });
      await page.locator('input[name="access"][value="write"]').check({ force: true });
    }, destacar: 'fieldset' },
    { nome: 'ia-conectada', acao: async page => {
      const { client_id, verificador, tela } = JSON.parse(await page.evaluate(() => sessionStorage.getItem('mcp-demo')));
      const volta = page.waitForRequest(pedido => pedido.url().startsWith(RETORNO));
      await page.locator('button:has-text("Autorizar")').click();
      const code = new URL((await volta).url()).searchParams.get('code');
      await page.goto(tela, { waitUntil: 'networkidle' });
      await page.evaluate(corpo => fetch('/api/mcp/oauth/token', { method: 'POST', body: new URLSearchParams(corpo) }),
        { grant_type: 'authorization_code', code, client_id, redirect_uri: RETORNO, code_verifier: verificador });
      await page.reload({ waitUntil: 'networkidle' });
      await abrirTela(page);
      await page.locator('[data-mcp-revoke]').scrollIntoViewIfNeeded();
      await page.evaluate(() => document.querySelector('[data-mcp-grants]').scrollIntoView({ block: 'center' }));
    }, destacar: '[data-mcp-grants] .line-item' },
    { nome: 'o-que-a-ia-pode-fazer', acao: page => page.evaluate(() => document.querySelector('[data-mcp-tools]').closest('section').scrollIntoView({ block: 'start' })) },
  ],
};
