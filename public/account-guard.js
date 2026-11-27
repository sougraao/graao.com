// Cada aba pertence a uma conta. Os pedidos à API levam a conta da aba (X-Graao-Account); se a pessoa trocou de conta em
// outra aba, o servidor responde 409 sem ler nem gravar nada e a página recebe o evento graao:account-changed.
// Vale para qualquer fetch da página, inclusive os dos módulos que não passam por api() e o do editor da Prancheta,
// que abre num iframe com ?account=<id>.

let tabAccount = location.pathname === '/prancheta-editor.html' ? new URLSearchParams(location.search).get('account') || '' : '';
/** Define a conta desta aba. Só a primeira vale: mudar de conta recarrega a página. */
export function setTabAccount(id) { tabAccount ||= id || ''; }
/** Id da conta desta aba; vazio no acesso local, que não tem login. */
export function tabAccountId() { return tabAccount; }

const plainFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const target = new URL(input instanceof Request ? input.url : input, location.href);
  const guarded = tabAccount && target.origin === location.origin && target.pathname.startsWith('/api/') && !target.pathname.startsWith('/api/auth/');
  if (!guarded) return plainFetch(input, init);
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
  headers.set('X-Graao-Account', tabAccount);
  const response = await plainFetch(input, { ...init, headers });
  if (response.headers.get('X-Graao-Account-Changed')) {
    // O iframe é da mesma origem: quem avisa a pessoa é a página que o abriu.
    const page = window.parent === window ? window : window.parent;
    page.dispatchEvent(new Event('graao:account-changed'));
  }
  return response;
};
