import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// account-guard.js troca o window.fetch da página: aqui a página é falsa e guarda o que sairia para a rede.
const sent = [];
const changed = [];
let reply = () => new Response('{}');
const page = Object.assign(new EventTarget(), {
  fetch: async (input, init) => { sent.push({ url: String(input instanceof Request ? input.url : input), headers: new Headers(init?.headers) }); return reply(); },
});
page.parent = page;
page.addEventListener('graao:account-changed', () => changed.push(true));
Object.defineProperty(globalThis, 'window', { value: page, configurable: true });
Object.defineProperty(globalThis, 'location', { value: new URL('https://graao.com/app?account=conta-de-fora#agency/dashboard'), configurable: true });

const guard = await import('../ui/account-guard.js');
const { accountsMenu } = await import('../ui/accounts.js');
const sentAccount = async (input, init) => { sent.length = 0; await page.fetch(input, init); return sent[0].headers.get('x-graao-account'); };

test('a conta da aba não vem do endereço e só a primeira vale', async () => {
  assert.equal(guard.tabAccountId(), '');
  assert.equal(await sentAccount('/api/state'), null);
  guard.setTabAccount('conta-1');
  guard.setTabAccount('conta-2');
  assert.equal(guard.tabAccountId(), 'conta-1');
});

test('só a API da própria origem recebe a conta da aba', async () => {
  assert.equal(await sentAccount('/api/state?workspace=demo'), 'conta-1');
  assert.equal(await sentAccount(new Request('https://graao.com/api/action', { method: 'POST', headers: { 'X-Outro': '1' } })), 'conta-1');
  assert.equal(sent[0].headers.get('x-outro'), '1');
  assert.equal(await sentAccount('/api/action', { method: 'POST', headers: { 'X-Graao-Account': 'forjada' } }), 'conta-1');
  assert.equal(await sentAccount('/api/auth/switch', { method: 'POST' }), null);
  assert.equal(await sentAccount('/tokens.css'), null);
  assert.equal(await sentAccount('https://storage.example/api/upload'), null);
});

test('a resposta de conta trocada avisa a página uma vez por pedido', async () => {
  await page.fetch('/api/state');
  assert.equal(changed.length, 0);
  reply = () => Response.json({ code: 'ACCOUNT_CHANGED' }, { status: 409, headers: { 'X-Graao-Account-Changed': '1' } });
  const response = await page.fetch('/api/action', { method: 'POST' });
  assert.equal(response.status, 409);
  assert.equal(changed.length, 1);
  reply = () => new Response('{}');
});

const marina = { id: 'conta-1', name: 'Marina Prado', email: 'marina@demo.com.br', agency: 'Agência Demo' };
const rafael = { id: 'conta-2', name: 'Rafael Dias', email: 'rafael@demo.com.br', agency: 'Estúdio Norte', connected: true };
const actions = html => [...html.matchAll(/data-acc="([\w-]+)"/g)].map(match => match[1]);

test('o menu mostra a conta aberta, as outras e o que dá para fazer', () => {
  const html = accountsMenu(marina, { current: marina, others: [rafael], max: 5 });
  for (const text of ['Marina Prado', 'marina@demo.com.br', 'Rafael Dias', 'rafael@demo.com.br', 'Estúdio Norte', 'Adicionar conta']) assert.ok(html.includes(text), text);
  assert.deepEqual(actions(html), ['switch', 'remove', 'add', 'sign-out', 'sign-out-all']);
  assert.deepEqual(actions(accountsMenu(marina, { current: marina, others: [], max: 5 })), ['add', 'sign-out']);
});

test('sessão encerrada, falha ao carregar e limite aparecem no menu', () => {
  assert.match(accountsMenu(marina, { current: marina, others: [{ ...rafael, connected: false }], max: 5 }), /Sessão encerrada · entrar de novo/);
  assert.match(accountsMenu(marina, null, { failed: true }), /Não foi possível carregar as outras contas/);
  assert.match(accountsMenu(marina, { current: marina, others: [rafael], max: 2 }), /data-acc="add" disabled/);
  // Uma sessão encerrada cede o lugar, então ainda cabe outra conta.
  assert.doesNotMatch(accountsMenu(marina, { current: marina, others: [{ ...rafael, connected: false }], max: 2 }), /data-acc="add" disabled/);
});

test('nome, e-mail, agência e foto vindos do Google não viram HTML', () => {
  const evil = '"><img src=x onerror=alert(1)>';
  const html = accountsMenu({ ...marina, name: evil }, { current: marina, others: [{ ...rafael, id: evil, name: evil, email: evil, agency: evil, picture: evil }], max: 5 });
  assert.ok(!html.includes('<img src=x'));
});

test('nenhum arquivo do front guarda token de sessão', async () => {
  for (const file of ['accounts.js', 'account-guard.js', 'login.js']) {
    const source = await readFile(new URL(`../ui/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /refresh_token|access_token|document\.cookie/, file);
  }
});
