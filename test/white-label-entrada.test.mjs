// White Label: o que aparece depois da tela de entrada no domínio da agência. Produção, 26/11 (graao.com/app): a tela
// de carregamento mostrava a caveira e "Abrindo a graao…", e quem entrava com uma conta Google sem acesso à agência
// ganhava uma agência nova na graao e caía em "Confirme seu celular… 15 dias de teste grátis". Como no GoHighLevel,
// o domínio da agência só abre para quem ela liberou e nunca mostra a graao.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { brandedPage } from '../white-label.mjs';
import { gateView } from '../ui/verify.js';

const DOMAIN = 'app.agencia.test';
const people = {
  dona: { id: 'u1', email: 'dona@agencia.test', name: 'Dona' },
  cliente: { id: 'u2', email: 'cliente@agencia.test', name: 'Cliente' },
  estranho: { id: 'u3', email: 'estranho@gmail.test', name: 'Estranho' },
  outra: { id: 'u4', email: 'outra@outra.test', name: 'Outra' },
  deOutra: { id: 'u5', email: 'membro@outra.test', name: 'Membro' }
};

async function boot(t) {
  const store = createSqliteStore(':memory:');
  const auth = {
    user: async req => people[req.headers['x-test-user']] || null,
    hasSession: req => Boolean(people[req.headers['x-test-user']]),
    session: async req => people[req.headers['x-test-user']] || null
  };
  const { server, host, ready } = makeServer({ store, auth, agencyOwnerId: 'root-owner', allowLocalAccess: false, port: 0, socialScheduler: false });
  await ready;
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const get = async (path, who, domain) => {
    const r = await fetch(base + path, { headers: { 'x-test-user': who, ...(domain ? { 'x-forwarded-host': domain } : {}) } });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return { store, get };
}

const member = (id, email) => ({ id, first: 'Pessoa', last: 'Liberada', email, role: 'Agency User', loginEnabled: true });

test('No domínio da agência, um e-mail sem acesso recebe o aviso e nenhuma agência nova é criada', async t => {
  const { store, get } = await boot(t);
  assert.equal((await get('/api/agency', 'dona')).status, 200);
  await store.change('agency-u1', state => { state.company.name = 'Agência Um'; state.company.domain = DOMAIN; });

  const blocked = await get('/api/workspaces', 'estranho', DOMAIN);
  assert.equal(blocked.status, 403, JSON.stringify(blocked.body));
  assert.equal(blocked.body.code, 'NOT_INVITED');
  assert.match(blocked.body.error, /estranho@gmail\.test ainda não tem acesso a Agência Um/);
  assert.doesNotMatch(blocked.body.error, /graao/i);
  await assert.rejects(async () => store.load('agency-u3'), /Workspace not found/, 'o domínio da agência não vira cadastro na graao');

  const onGraao = await get('/api/workspaces', 'estranho');
  assert.equal(onGraao.status, 200, 'na graao.com o cadastro segue como antes');
});

test('No domínio da agência entra quem ela liberou e a dona; quem só foi liberado por outra agência não', async t => {
  const { store, get } = await boot(t);
  await get('/api/agency', 'dona');
  await get('/api/agency', 'outra');
  await store.change('agency-u1', state => { state.company.name = 'Agência Um'; state.company.domain = DOMAIN; state.users.push(member('m2', 'cliente@agencia.test')); });
  await store.change('agency-u4', state => { state.users.push(member('m5', 'membro@outra.test')); });

  assert.equal((await get('/api/workspaces', 'dona', DOMAIN)).status, 200);
  const client = await get('/api/workspaces', 'cliente', DOMAIN);
  assert.equal(client.status, 200, JSON.stringify(client.body));
  const foreign = await get('/api/workspaces', 'deOutra', DOMAIN);
  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.code, 'NOT_INVITED');
  assert.equal((await get('/api/workspaces', 'deOutra')).status, 200, 'na graao.com abre a agência que o liberou');
});

test('O app no domínio da agência carrega com o logotipo e o nome dela, sem a caveira nem "graao"', () => {
  const app = readFileSync(new URL('../ui/app.html', import.meta.url), 'utf8');
  const logo = `/asset/${'b'.repeat(64)}.png`;
  const page = brandedPage(app, { name: 'Agência Exemplo', logo, primary: '' });
  assert.match(page, /data-marca="agencia" data-marca-nome="Agência Exemplo" data-marca-logo="\/asset\/b{64}\.png"/);
  const bootScreen = page.match(/<div id="app">([\s\S]*?)<\/div><\/div>/)[1];
  assert.match(bootScreen, /<img class="boot-logo" src="\/asset\/b{64}\.png" alt="">/);
  assert.match(bootScreen, /Abrindo Agência Exemplo…/);
  assert.doesNotMatch(bootScreen, /graao/i);
  const css = readFileSync(new URL('../ui/graao.css', import.meta.url), 'utf8');
  assert.match(css, /:root\[data-marca=agencia\] \.boot::before\{display:none\}/, 'a caveira do .boot::before some no domínio da agência');
});

test('A confirmação de celular e o aviso de acesso mostram a agência, não a graao', () => {
  const marca = { name: 'Agência Exemplo', logo: `/asset/${'c'.repeat(64)}.png` };
  const visible = html => html.replace(/<[^>]+>/g, ' ');
  const phone = gateView({ code: 'PHONE_REQUIRED' }, { step: 'form' }, marca);
  assert.doesNotMatch(visible(phone), /graao|teste grátis/i);
  assert.match(phone, /<img class="vf-brand-logo" src="\/asset\/c{64}\.png" alt="Agência Exemplo">/);
  const denied = gateView({ code: 'NOT_INVITED', error: 'O e-mail x@y.test ainda não tem acesso a Agência Exemplo.' }, undefined, marca);
  assert.match(denied, /<h1>Acesso não liberado<\/h1>/);
  assert.match(denied, /Entrar com outra conta/);
  assert.doesNotMatch(visible(denied), /graao/i);
  assert.match(gateView({ code: 'PHONE_REQUIRED' }, { step: 'form' }, null), /<div class="vf-brand">graao<\/div>[\s\S]*15 dias de teste grátis/, 'na graao nada muda');
});
