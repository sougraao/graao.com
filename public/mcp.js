// Marketing → Planejador social → IA & MCP: como conectar uma IA à subconta, quais já estão conectadas e o que podem fazer.
import { ask } from './ask.js';
import { icon as i } from './icons.js';
import { badge, fmt, h } from './screens.js';
import { subAccountModules } from './agency-data.js';
import { tr } from './i18n.js';

const cache = { workspace: '', grants: null, catalog: null, failed: '' };
const address = c => `${location.origin}/api/mcp/${encodeURIComponent(c.workspace)}`;
const accessBadge = { read: ['Só lê', ''], write: ['Grava', 'blue'], send: ['Envia ou publica', 'pink'] };

const copyField = (label, value) => `<label>${label}<span class="mcp-copy"><input readonly value="${h(value)}"><button type="button" class="secondary" data-mcp-copy="${h(value)}">${i('copy', 15)} Copiar</button></span></label>`;
const section = (title, note, body, kind = '') => `<section class="set-section"><header class="set-head"><h2>${title}</h2><p class="dim">${note}</p></header><div class="set-body ${kind}">${body}</div></section>`;
const guide = (title, steps, extra = '') => `<details class="mcp-guide"><summary>${title}</summary><ol>${steps.map(step => `<li>${step}</li>`).join('')}</ol>${extra}</details>`;

function connect(c) {
  const url = address(c);
  const cursor = JSON.stringify({ mcpServers: { graao: { url } } }, null, 2);
  return section('Conectar uma IA', 'Use o endereço desta subconta no Claude, no ChatGPT, no Cursor ou em outro programa com MCP. A pessoa entra com o login do graao e escolhe o que a IA pode fazer.',
    copyField('Endereço MCP desta subconta', url) +
    guide('Claude (site, celular e Desktop)', ['Abra <b>Configurações</b> › <b>Conectores</b> e clique em <b>Adicionar conector personalizado</b>.', 'Cole o endereço MCP e confirme.', 'Clique em <b>Conectar</b>, entre no graao e escolha o acesso.']) +
    guide('ChatGPT', ['Nas configurações, ative o <b>modo de desenvolvedor</b> dos conectores. Depende do plano do ChatGPT.', 'Crie um conector, cole o endereço MCP e escolha <b>OAuth</b>.', 'Entre no graao e escolha o acesso.']) +
    guide('Claude Code', ['No terminal, rode o comando abaixo.', 'Dentro do Claude Code, digite <code>/mcp</code> e faça o login.'], copyField('Comando', `claude mcp add --transport http graao ${url}`)) +
    guide('Cursor e outros', ['Cole a configuração abaixo no arquivo de MCP do programa.', 'Faça o login quando ele pedir.'], `<pre class="mcp-code"><code>${h(cursor)}</code></pre><button type="button" class="secondary" data-mcp-copy="${h(cursor)}">${i('copy', 15)} Copiar configuração</button>`) +
    guide('Com chave, sem login (n8n, scripts)', ['Em <b>Agência</b> › <b>Configurações</b> › <b>Integrações privadas</b>, crie um token só com os escopos necessários.', 'Envie o token no cabeçalho abaixo. Token no endereço não é aceito.'], copyField('Cabeçalho', 'Authorization: Bearer SEU_TOKEN')));
}

function grantRows(c) {
  if (cache.failed) return `<p class="form-status" role="alert">${h(cache.failed)}</p>`;
  if (!cache.grants) return '<p class="dim">Carregando…</p>';
  if (!cache.grants.length) return '<p class="dim">Nenhuma IA conectada por login. Tokens e chaves ficam em Agência › Configurações.</p>';
  return cache.grants.map(row => `<div class="line-item"><span><b>${h(row.client)}</b> ${row.access === 'write' ? badge('Lê e age', 'blue') : badge('Só lê')}<br>
    <small class="dim">${h(row.host)} · ${h(row.userName)} · ${row.lastUsed ? `último uso em ${fmt(row.lastUsed, c.s.profile.timezone, true)}` : `conectada em ${fmt(row.created, c.s.profile.timezone, true)}`}</small></span>
    <button type="button" class="secondary" data-mcp-revoke="${h(row.id)}" data-name="${h(row.client)}">Desconectar</button></div>`).join('');
}

function toolRows() {
  if (!cache.catalog) return '<p class="dim">Carregando…</p>';
  return subAccountModules.map(([module, label]) => {
    const tools = cache.catalog.filter(tool => tool.module === module);
    return tools.length ? `<div><h3>${h(tr(label))}</h3><ul class="mcp-tools">${tools.map(tool => `<li><span><b>${h(tool.title)}</b> ${badge(...accessBadge[tool.access])}</span><small class="dim">${h(tool.description)}</small></li>`).join('')}</ul></div>` : '';
  }).join('');
}

function paint(c) {
  const grants = document.querySelector('[data-mcp-grants]'), tools = document.querySelector('[data-mcp-tools]');
  if (grants) grants.innerHTML = grantRows(c);
  if (tools) tools.innerHTML = toolRows();
}

async function fetchJson(path, body) {
  const response = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Não foi possível carregar.');
  return data;
}
const grantsPath = workspace => `/api/mcp/grants?workspace=${encodeURIComponent(workspace)}`;

async function refresh(c) {
  const workspace = c.workspace;
  try {
    const [{ grants }, { catalog }] = await Promise.all([fetchJson(grantsPath(workspace)), cache.catalog ? cache : fetchJson('/api/mcp')]);
    if (cache.workspace === workspace) Object.assign(cache, { grants, catalog, failed: '' });
  } catch (problem) { cache.failed = problem.message; }
  paint(c);
}

export function mcpView(c) {
  if (cache.workspace !== c.workspace) Object.assign(cache, { workspace: c.workspace, grants: null, failed: '' });
  queueMicrotask(() => refresh(c));
  return `<div class="surface set-card mcp-card">${connect(c)}
    ${section('IAs conectadas', 'Quem conectou vê as próprias conexões; quem administra a agência vê todas. Desconectar vale na hora.', `<div data-mcp-grants>${grantRows(c)}</div>`)}
    ${section('O que a IA pode fazer', 'A IA nunca passa do que a pessoa pode fazer nesta subconta. No acesso só de leitura, as ações que gravam, enviam ou publicam não aparecem para ela.', `<div class="mcp-catalog" data-mcp-tools>${toolRows()}</div>`)}
  </div>`;
}

/** Click handling; returns true when the click was for this screen. */
export function mcpClick(c, target, flash) {
  const copy = target.closest('[data-mcp-copy]'), revoke = target.closest('[data-mcp-revoke]');
  if (copy) {
    navigator.clipboard.writeText(copy.dataset.mcpCopy).then(() => flash('Copiado.'), () => flash('Selecione o texto e copie.', true));
    return true;
  }
  if (!revoke) return false;
  (async () => {
    if (!await ask(`Desconectar ${revoke.dataset.name}?`, { text: 'A IA perde o acesso na hora. Para voltar, será preciso conectar de novo.', ok: 'Desconectar' })) return;
    try {
      cache.grants = (await fetchJson(grantsPath(c.workspace), { id: revoke.dataset.mcpRevoke })).grants;
      paint(c); flash('IA desconectada.');
    } catch (problem) { flash(problem.message, true); }
  })();
  return true;
}
