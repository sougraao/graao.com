// Linha de direitos e versão no pé das páginas da graao.
// Páginas estáticas trazem a linha no HTML (`.rodape-graao`) e carregam este módulo só para preencher a versão.
// O painel monta a linha com `rodapeHtml(nome)`, que já traz a versão quando ela foi lida.
const ano = new Date().getFullYear();
let build = '';
let pedido = null;

const esc = text => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const textoBuild = () => (build ? `build ${build}` : '');

function preencher() {
  for (const el of document.querySelectorAll('[data-rodape-build]')) el.textContent = textoBuild();
}

/** Lê a versão uma vez por carregamento da página e preenche todas as linhas na tela. */
export function carregarBuild(buscar = globalThis.fetch) {
  if (!pedido) {
    pedido = Promise.resolve()
      .then(() => buscar('/api/versao', { headers: { Accept: 'application/json' } }))
      .then(res => (res.ok ? res.json() : {}))
      .then(data => { build = typeof data?.build === 'string' ? data.build.slice(0, 40) : ''; })
      .catch(() => {})
      .then(() => { if (typeof document !== 'undefined') preencher(); });
  }
  return pedido;
}

/** A linha do rodapé. `nome` é a marca exibida: a graao, ou a da agência no painel da subconta. */
export function rodapeHtml(nome = 'graao') {
  if (typeof document !== 'undefined') carregarBuild();
  return `<footer class="rodape-graao"><span>© ${ano} ${esc(nome || 'graao')}. Feita no Brasil com ☕, carinho e muita API.</span><span class="rodape-build" data-rodape-build>${esc(textoBuild())}</span></footer>`;
}

if (typeof document !== 'undefined' && document.querySelector('[data-rodape-build]')) carregarBuild();
