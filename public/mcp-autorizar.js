// Consentimento do servidor MCP (/mcp/autorizar): mostra quem pede acesso, em qual subconta e com qual alcance, e
// devolve a pessoa para a IA com a resposta. Todo texto que vem do pedido entra por textContent.
try {
  const saved = localStorage.getItem('graao.theme');
  const dark = saved !== 'light';
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
} catch {}

const get = id => document.getElementById(id);
const form = get('consent');
const request = Object.fromEntries(new URLSearchParams(location.search));
const show = message => { get('notice').textContent = message; };

async function call(path, body) {
  const response = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await response.json();
  if (response.status === 401) {
    location.replace(`/login?${new URLSearchParams({ next: location.pathname + location.search })}`);
    return new Promise(() => {});
  }
  if (!response.ok) throw Error(data.error || 'Não foi possível conferir o pedido.');
  return data;
}

async function answer(allow) {
  const buttons = form.querySelectorAll('button');
  for (const button of buttons) button.disabled = true;
  show('');
  try {
    const { redirect } = await call('/api/mcp/consent', { request, allow, workspace: form.elements.workspace.value, access: form.elements.access.value });
    form.hidden = true;
    get('title').textContent = allow ? 'Conexão autorizada' : 'Conexão recusada';
    show('Voltando para a IA. Se nada acontecer, pode fechar esta página.');
    location.assign(redirect);
  } catch (problem) {
    show(problem.message);
    for (const button of buttons) button.disabled = false;
  }
}

try {
  const { client, person, workspaces, selected } = await call(`/api/mcp/consent${location.search}`);
  const options = selected ? workspaces.filter(row => row.id === selected) : workspaces;
  get('title').textContent = `Conectar ${client.name} ao graao?`;
  if (!options.length) throw Error('Seu usuário não abre nenhuma subconta para esta conexão.');
  get('who').textContent = `Pedido por ${client.host}. Você entrou como ${person}.`;
  form.elements.workspace.replaceChildren(...(options.length > 1 ? [new Option('Escolha a subconta', '')] : []), ...options.map(row => new Option(row.name, row.id)));
  form.hidden = false;
} catch (problem) {
  get('title').textContent = 'Não deu para conectar';
  show(problem.message);
}

form.addEventListener('submit', event => { event.preventDefault(); answer(true); });
get('deny').addEventListener('click', () => answer(false));
