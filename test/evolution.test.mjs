import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeServer } from '../server.mjs';
import { createSqliteStore } from '../storage.mjs';
import { createWhatsAppHandler } from '../whatsapp.mjs';
import { API_KEY, QR, fakeEvolution } from './helpers/fake-evolution.mjs';

async function boot(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'graao-evolution-'));
  const store = createSqliteStore(join(dir, 'go.sqlite'));
  const { server } = makeServer({
    store, auth: null, allowLocalAccess: true, port: 0,
    openAISecret: 'evolution-test-seal-secret-32-chars!',
    socialScheduler: false,
    ...options
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  async function call(path, body) {
    const init = body === undefined
      ? { method: 'GET' }
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    const res = await fetch(`${base}${path}`, init);
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  return { call, store };
}

let messageSeq = 0;
const upsert = (key, message, pushName = 'Cliente') => ({
  event: 'messages.upsert', instance: 'graao_demo',
  data: { key: { fromMe: false, id: `MSG${++messageSeq}`, ...key }, pushName, message, messageType: 'conversation' }
});

test('Evolution API gerenciada: QR, status ao vivo, webhooks de entrada e envio pelas Conversas', async t => {
  const evo = fakeEvolution();
  const local = await boot(t, { whatsappRequest: evo.request, evolutionBaseUrl: 'https://evo.graao.test/', evolutionApiKey: API_KEY });

  const agency = await local.call('/api/whatsapp/agency/status');
  assert.equal(agency.status, 200);
  assert.equal(agency.body.provider, 'evolution');
  assert.equal(agency.body.managed, true);
  assert.equal(JSON.stringify(agency.body).includes(API_KEY), false);

  const conn = await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  assert.equal(conn.status, 200, conn.body?.error);
  assert.equal(conn.body.provider, 'evolution');
  assert.equal(conn.body.status, 'connecting');
  assert.equal(conn.body.qrcode, QR);
  assert.ok(evo.instances.has('graao_demo'), 'cria a instância graao_<subconta>');
  const create = evo.calls.find(c => c.path === '/instance/create');
  assert.equal(create.body.integration, 'WHATSAPP-BAILEYS');
  assert.equal(create.body.groupsIgnore, true);
  assert.equal(JSON.stringify(conn.body).includes('hash-graao_demo'), false);
  const raw = local.store.load('whatsapp-agency');
  assert.equal(raw.profile.name, 'WhatsApp (Evolution API)');
  assert.equal(raw.subaccounts.demo.provider, 'evolution');
  assert.equal(JSON.stringify(raw).includes('hash-graao_demo'), false, 'token da instância fica selado');

  // Enquanto aguarda a leitura, o status continua trazendo o QR (sem novo create).
  const polling = await local.call('/api/whatsapp/workspace/status?workspace=demo');
  assert.equal(polling.body.status, 'connecting');
  assert.equal(polling.body.qrcode, QR);
  assert.equal(evo.calls.filter(c => c.path === '/instance/create').length, 1);

  evo.markOpen('graao_demo', '5531988887777', 'Atendimento Demo');
  const live = await local.call('/api/whatsapp/workspace/status?workspace=demo');
  assert.equal(live.body.status, 'connected');
  assert.equal(live.body.phone, '5531988887777');
  assert.equal(live.body.profileName, 'Atendimento Demo');
  const hookPath = new URL(live.body.webhookUrl).pathname;

  assert.equal((await local.call(`/api/whatsapp/webhook/agency/demo/${'0'.repeat(48)}`, upsert({ remoteJid: '1@s.whatsapp.net' }, { conversation: 'x' }))).status, 403);

  const inbound = await local.call(hookPath, upsert({ remoteJid: '5511977776666@s.whatsapp.net' }, { conversation: 'Oi! Quero agendar.' }, 'Carlos Mendes'));
  assert.equal(inbound.body.stored, true);
  // Contato identificado por LID: o número real vem em remoteJidAlt.
  await local.call(hookPath, upsert({ remoteJid: '123456789012345@lid', remoteJidAlt: '5521955554444@s.whatsapp.net' }, { extendedTextMessage: { text: 'Mensagem via LID' } }, 'Bia'));
  await local.call(hookPath, upsert({ remoteJid: '5521955554444@s.whatsapp.net' }, { imageMessage: { mimetype: 'image/jpeg' } }, 'Bia'));
  for (const ignored of [
    upsert({ remoteJid: '120363000000000000@g.us', participant: '5511@s.whatsapp.net' }, { conversation: 'grupo' }),
    upsert({ remoteJid: 'status@broadcast' }, { conversation: 'status' }),
    upsert({ remoteJid: '5511977776666@s.whatsapp.net', fromMe: true }, { conversation: 'eco' }),
    { event: 'qrcode.updated', data: { qrcode: { base64: QR } } }
  ]) {
    assert.equal((await local.call(hookPath, ignored)).body.ignored, true);
  }
  // LID sem número: a mensagem entra num contato sem telefone, em vez de se perder; o número completa o contato depois.
  assert.equal((await local.call(hookPath, upsert({ remoteJid: '999888777666@lid' }, { conversation: 'lid sem número' }, 'Duda'))).body.stored, true);
  let duda = (await local.call('/api/state?workspace=demo')).body.state.contacts.filter(c => c.waLid === '999888777666');
  assert.equal(duda.length, 1);
  assert.equal(duda[0].phone || '', '');
  await local.call(hookPath, upsert({ remoteJid: '999888777666@lid', remoteJidAlt: '5571944443333@s.whatsapp.net' }, { conversation: 'agora com número' }, 'Duda'));
  duda = (await local.call('/api/state?workspace=demo')).body.state.contacts.filter(c => c.waLid === '999888777666');
  assert.equal(duda.length, 1, 'o mesmo contato');
  assert.equal(duda[0].phone, '+5571944443333');
  const state = (await local.call('/api/state?workspace=demo')).body.state;
  const carlos = state.contacts.find(c => c.name === 'Carlos Mendes');
  assert.equal(carlos.phone, '+5511977776666');
  const bia = state.contacts.filter(c => c.phone === '+5521955554444');
  assert.equal(bia.length, 1, 'LID e número real caem no mesmo contato');
  const biaMsgs = state.messages.filter(m => m.contactId === bia[0].id).map(m => m.body);
  assert.deepEqual(biaMsgs.sort(), ['Mensagem via LID', '[Imagem]'].sort());
  assert.equal(state.messages.some(m => /grupo|status|eco/.test(m.body)), false);

  const reply = await local.call('/api/action?workspace=demo', {
    type: 'message', data: { contactId: carlos.id, channel: 'WhatsApp', direction: 'Outbound', body: 'Claro, qual horário?' }
  });
  assert.equal(reply.body.delivery?.sent, true);
  const sent = evo.calls.find(c => c.path === '/message/sendText/graao_demo');
  assert.deepEqual(sent.body, { number: '5511977776666', text: 'Claro, qual horário?' });
  assert.equal(sent.headers.apikey, API_KEY);

  const noWa = await local.call('/api/whatsapp/workspace/test?workspace=demo', { phone: '5511000000000', text: 'teste' });
  assert.equal(noWa.status, 502);
  assert.match(noWa.body.error, /não tem WhatsApp/);

  // Queda: connection.update chega pelo webhook e derruba o status salvo.
  const close = await local.call(hookPath, { event: 'connection.update', instance: 'graao_demo', data: { instance: 'graao_demo', state: 'close', statusReason: 428 } });
  assert.equal(close.body.status, 'disconnected');
  assert.equal(local.store.load('whatsapp-agency').subaccounts.demo.status, 'disconnected');
  // O servidor se reconectou sozinho mas o webhook de "open" se perdeu: o envio confere ao vivo e segue.
  const again = await local.call('/api/action?workspace=demo', {
    type: 'message', data: { contactId: carlos.id, channel: 'WhatsApp', direction: 'Outbound', body: 'Voltei' }
  });
  assert.equal(again.body.delivery?.sent, true);
  assert.equal(local.store.load('whatsapp-agency').subaccounts.demo.status, 'connected');

  const disc = await local.call('/api/whatsapp/workspace/disconnect?workspace=demo', {});
  assert.equal(disc.body.status, 'disconnected');
  assert.ok(evo.calls.some(c => c.path === '/instance/logout/graao_demo' && c.method === 'DELETE'));
});

test('Evolution API: código de pareamento, instância apagada no servidor e servidor próprio da agência', async t => {
  const evo = fakeEvolution();
  const local = await boot(t, { whatsappRequest: evo.request });

  const none = await local.call('/api/whatsapp/agency/status');
  assert.equal(none.body.configured, false);
  assert.equal(none.body.provider, 'evolution');

  const missingKey = await local.call('/api/whatsapp/agency/config', { provider: 'evolution', baseUrl: 'https://wa.agencia.test' });
  assert.equal(missingKey.status, 400);
  assert.match(missingKey.body.error, /API Key global/);
  const cfg = await local.call('/api/whatsapp/agency/config', { provider: 'evolution', baseUrl: 'https://wa.agencia.test/', adminToken: API_KEY });
  assert.equal(cfg.status, 200, cfg.body?.error);
  assert.equal(cfg.body.configured, true);
  assert.equal(cfg.body.adminTokenLast4, 'cret');

  const pair = await local.call('/api/whatsapp/workspace/connect?workspace=demo', { phone: '+55 (31) 99999-1111' });
  assert.equal(pair.status, 200, pair.body?.error);
  assert.equal(pair.body.paircode, 'WZYX-1234');
  assert.equal(evo.calls.find(c => c.path === '/instance/connect/graao_demo').search, '?number=5531999991111');

  // Já em andamento com QR: pedir código de pareamento reabre a sessão com o número.
  evo.instances.get('graao_demo').pairing = '';
  const pair2 = await local.call('/api/whatsapp/workspace/connect?workspace=demo', { phone: '5531999991111' });
  assert.equal(pair2.body.paircode, 'WZYX-1234');

  // Alguém apagou a instância no manager da Evolution: o status esquece e o próximo conectar recria.
  evo.instances.delete('graao_demo');
  const gone = await local.call('/api/whatsapp/workspace/status?workspace=demo');
  assert.equal(gone.body.status, 'disconnected');
  assert.equal(local.store.load('whatsapp-agency').subaccounts.demo.tokenSealed, '');
  const recreated = await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  assert.equal(recreated.status, 200, recreated.body?.error);
  assert.equal(recreated.body.qrcode, QR);
  assert.equal(evo.calls.filter(c => c.path === '/instance/create').length, 2);

  // Banco do graao perdeu o vínculo mas a instância ainda existe: reaproveita em vez de falhar.
  await local.store.change('whatsapp-agency', row => { row.subaccounts.demo.tokenSealed = ''; });
  const reused = await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  assert.equal(reused.status, 200, reused.body?.error);
  assert.equal(reused.body.status, 'connecting');

  const wrongKey = await local.call('/api/whatsapp/agency/config', { provider: 'evolution', baseUrl: 'https://wa.agencia.test', adminToken: 'chave-errada' });
  assert.equal(wrongKey.status, 200);
  await local.store.change('whatsapp-agency', row => { row.subaccounts.demo.tokenSealed = ''; });
  const refused = await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  assert.equal(refused.status, 422);
  assert.match(refused.body.error, /API Key global/);
});

test('Vínculo salvo antes da Evolution: servidor, instância e status antigos são descartados', async t => {
  const evo = fakeEvolution();
  const local = await boot(t, { whatsappRequest: evo.request, evolutionBaseUrl: 'https://evo.graao.test', evolutionApiKey: API_KEY });
  await local.store.insert('whatsapp-agency', {
    profile: { name: 'WhatsApp (antigo)' }, provider: 'antigo', baseUrl: 'https://servidor-antigo.test', adminTokenSealed: 'x.y.z', adminTokenLast4: 'oldk',
    subaccounts: { demo: { enabled: true, rebill: true, tokenSealed: 'a.b.c', tokenLast4: 'oldt', status: 'connected', phone: '5511911112222', webhookSecret: 'f'.repeat(48) } }
  });
  const view = await local.call('/api/whatsapp/agency/status');
  assert.equal(view.body.provider, 'evolution');
  assert.equal(view.body.managed, true, 'a URL antiga não vale mais: usa a Evolution da plataforma');
  assert.equal(view.body.hasCustomServer, false);
  assert.equal(view.body.baseUrl, '');
  assert.equal(view.body.subaccounts.demo.status, 'disconnected');
  assert.equal(view.body.subaccounts.demo.hasInstance, false);
  assert.equal(view.body.subaccounts.demo.rebill, true, 'o que a agência decidiu continua');

  const sent = await local.call('/api/whatsapp/workspace/test?workspace=demo', { phone: '5511977776666', text: 'oi' });
  assert.equal(sent.status, 409);

  // Um webhook atrasado no formato antigo não pode marcar a subconta como conectada.
  const late = await local.call(`/api/whatsapp/webhook/agency/demo/${'f'.repeat(48)}`, { EventType: 'connection', instance: { status: 'connected' } });
  assert.equal(late.body.ignored, true);
  assert.equal(evo.calls.some(c => c.path.includes('antigo')), false);

  const conn = await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  assert.equal(conn.status, 200, conn.body?.error);
  assert.equal(conn.body.qrcode, QR);
  const saved = local.store.load('whatsapp-agency');
  assert.equal(saved.provider, 'evolution');
  assert.equal(saved.adminTokenSealed, '');
  assert.equal(saved.subaccounts.demo.webhookSecret, 'f'.repeat(48), 'mantém a URL do webhook');
});

test('Teste do servidor: versão e números, chave recusada, endereço errado e servidor fora do ar', async t => {
  const evo = fakeEvolution();
  let answer = null;
  const request = (url, init) => answer ? answer(url, init) : evo.request(url, init);
  const local = await boot(t, { whatsappRequest: request });
  assert.deepEqual((await local.call('/api/whatsapp/agency/server')).body, { ok: false, error: 'Nenhum servidor de WhatsApp configurado.' });

  await local.call('/api/whatsapp/agency/config', { baseUrl: 'https://wa.agencia.test', adminToken: API_KEY });
  await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  evo.instances.set('graao_de_outra_agencia', { state: 'open' });
  let check = (await local.call('/api/whatsapp/agency/server')).body;
  assert.equal(check.ok, true);
  assert.equal(check.version, '2.3.8');
  assert.deepEqual([check.instances, check.connected], [1, 0], 'só conta as instâncias desta agência');
  evo.markOpen('graao_demo', '5531988887777', 'Demo');
  check = (await local.call('/api/whatsapp/agency/server')).body;
  assert.equal(check.connected, 1);

  answer = () => new Response('<html>outro site</html>', { status: 200 });
  assert.match((await local.call('/api/whatsapp/agency/server')).body.error, /não é uma Evolution API/);
  answer = () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); };
  const down = await local.call('/api/whatsapp/agency/server');
  assert.equal(down.status, 200);
  assert.equal(down.body.ok, false);
  assert.match(down.body.error, /alcançar a Evolution API/);
  answer = null;
  await local.call('/api/whatsapp/agency/config', { baseUrl: 'https://wa.agencia.test', adminToken: 'chave-errada' });
  const refused = (await local.call('/api/whatsapp/agency/server')).body;
  assert.equal(refused.ok, false);
  assert.match(refused.error, /recusou a API Key global/);
});

test('Excluir instância: sai do aparelho, apaga no servidor e o próximo conectar cria outra', async t => {
  const evo = fakeEvolution();
  const local = await boot(t, { whatsappRequest: evo.request, evolutionBaseUrl: 'https://evo.graao.test', evolutionApiKey: API_KEY });
  await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  evo.markOpen('graao_demo', '5531988887777', 'Demo');
  await local.call('/api/whatsapp/workspace/status?workspace=demo');

  assert.equal((await local.call('/api/whatsapp/agency/remove-instance', { workspace: 'nao-existe' })).status, 400);
  const removed = await local.call('/api/whatsapp/agency/remove-instance', { workspace: 'demo' });
  assert.equal(removed.status, 200, removed.body?.error);
  assert.equal(removed.body.subaccounts.demo.hasInstance, false);
  assert.equal(removed.body.subaccounts.demo.status, 'disconnected');
  assert.equal(evo.instances.size, 0);
  const order = evo.calls.filter(c => c.method === 'DELETE').map(c => c.path);
  assert.deepEqual(order, ['/instance/logout/graao_demo', '/instance/delete/graao_demo']);

  // Já não existe no servidor: continua dando certo.
  assert.equal((await local.call('/api/whatsapp/agency/remove-instance', { workspace: 'demo' })).status, 200);
  assert.equal((await local.call('/api/whatsapp/workspace/connect?workspace=demo', {})).body.qrcode, QR);
  assert.equal(evo.instances.size, 1);
});

test('Webhook repetido pela Evolution não duplica a mensagem', async t => {
  const evo = fakeEvolution();
  const local = await boot(t, { whatsappRequest: evo.request, evolutionBaseUrl: 'https://evo.graao.test', evolutionApiKey: API_KEY });
  const conn = await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  const hook = new URL(conn.body.webhookUrl).pathname;
  const message = upsert({ remoteJid: '5511977776666@s.whatsapp.net', id: 'REPETIDA' }, { conversation: 'Uma vez só' });
  assert.equal((await local.call(hook, message)).body.stored, true);
  const again = await local.call(hook, message);
  assert.equal(again.status, 200);
  assert.equal(again.body.reason, 'DUPLICATE');
  // Outra mensagem com o mesmo texto é outra mensagem.
  assert.equal((await local.call(hook, upsert({ remoteJid: '5511977776666@s.whatsapp.net', id: 'OUTRA' }, { conversation: 'Uma vez só' }))).body.stored, true);
  const state = (await local.call('/api/state?workspace=demo')).body.state;
  assert.equal(state.messages.filter(m => m.body === 'Uma vez só').length, 2);
});

test('Evolution API nos fluxos: "digitando…", arquivo por https público e endereço interno bloqueado', async t => {
  const evo = fakeEvolution();
  const local = await boot(t, { whatsappRequest: evo.request, evolutionBaseUrl: 'https://evo.graao.test/', evolutionApiKey: API_KEY });
  await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  evo.markOpen('graao_demo', '5531988887777', 'Atendimento Demo');
  await local.call('/api/whatsapp/workspace/status?workspace=demo');
  const saved = await local.call('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name: 'Catálogo', active: true, triggers: [{ type: 'contact_created' }], steps: [
    { type: 'whatsapp_typing', config: { seconds: 2 } },
    { type: 'whatsapp_media', config: { mediaType: 'document', url: 'https://93.184.216.34/{{contact.first_name}}.pdf', caption: 'Olá, {{contact.first_name}}!', fileName: 'catalogo.pdf' } },
    { type: 'whatsapp_media', config: { mediaType: 'image', url: 'https://10.0.0.5/interno.png' } }
  ] } });
  assert.equal(saved.status, 200, saved.body?.error);
  await local.call('/api/action?workspace=demo', { type: 'save', key: 'contacts', data: { name: 'Carla Souza', phone: '+55 11 97777-6666', tags: [], custom: {} } });
  let run;
  for (let i = 0; i < 50 && !(run?.results || []).some(line => /arquivo não enviado/.test(line)); i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    run = (await local.call('/api/state?workspace=demo')).body.state.runs.find(row => row.name === 'Catálogo');
  }
  const presence = evo.calls.find(c => c.path === '/chat/sendPresence/graao_demo');
  assert.deepEqual(presence.body, { number: '5511977776666', presence: 'composing', delay: 2000 });
  const media = evo.calls.filter(c => c.path === '/message/sendMedia/graao_demo');
  assert.equal(media.length, 1, 'the internal address never reaches the provider');
  assert.deepEqual(media[0].body, { number: '5511977776666', mediatype: 'document', media: 'https://93.184.216.34/Carla.pdf', caption: 'Olá, Carla!', fileName: 'catalogo.pdf' });
  assert.ok(evo.calls.indexOf(presence) < evo.calls.indexOf(media[0]), 'typing comes before the file');
  assert.ok(run.results.some(line => /"digitando…" por 2 s/.test(line)));
  assert.ok(run.results.some(line => /arquivo enviado/.test(line)));
  assert.ok(run.results.some(line => /arquivo não enviado: endereço de rede interna bloqueado/.test(line)));
  const state = (await local.call('/api/state?workspace=demo')).body.state;
  const blocked = state.messages.find(m => m.body.includes('interno.png'));
  assert.equal(blocked.failed, 'provider_error', 'the blocked file shows as not delivered');
  assert.ok(state.messages.some(m => m.body === '[Documento: catalogo.pdf] https://93.184.216.34/Carla.pdf\nOlá, Carla!'));
});

test('Evolution API nos fluxos: botões, lista e enquete; anúncio de clique para o WhatsApp e respostas que voltam como texto', async t => {
  const evo = fakeEvolution();
  const local = await boot(t, { whatsappRequest: evo.request, evolutionBaseUrl: 'https://evo.graao.test/', evolutionApiKey: API_KEY });
  await local.call('/api/whatsapp/workspace/connect?workspace=demo', {});
  evo.markOpen('graao_demo', '5531988887777', 'Atendimento Demo');
  const live = await local.call('/api/whatsapp/workspace/status?workspace=demo');
  const hookPath = new URL(live.body.webhookUrl).pathname;
  const flow = (name, trigger, steps) => local.call('/api/action?workspace=demo', { type: 'save', key: 'workflows', data: { name, active: true, triggers: [trigger], steps } });
  assert.equal((await flow('Menu', { type: 'contact_tag', config: { change: 'added', tag: 'menu' } }, [
    { type: 'whatsapp_interactive', config: { kind: 'buttons', body: 'Oi, {{contact.first_name}}!', options: 'Agendar\nPreços', footer: 'Clínica' } },
    { type: 'whatsapp_interactive', config: { kind: 'list', body: 'Escolha um serviço', options: 'Limpeza\nClareamento', buttonText: 'Serviços' } },
    { type: 'whatsapp_interactive', config: { kind: 'poll', body: 'Melhor horário?', options: 'Manhã\nTarde' } }
  ])).status, 200);
  await flow('Anúncio', { type: 'whatsapp_ad_click', config: {} }, [{ type: 'add_tag', config: { tag: 'menu' } }]);

  // The first message of a "Click to WhatsApp" ad: contact, message, ad trigger and attribution.
  const ad = { externalAdReply: { sourceId: '120210', sourceUrl: 'https://fb.me/anuncio', title: 'Clareamento em BH', sourceType: 'ad', ctwaClid: 'CTWA-9' } };
  await local.call(hookPath, upsert({ remoteJid: '5511977776666@s.whatsapp.net' }, { extendedTextMessage: { text: 'Olá! Quero saber mais', contextInfo: ad } }, 'Carla Souza'));
  let state, run;
  for (let i = 0; i < 60 && (run?.results || []).filter(line => /WhatsApp: /.test(line)).length < 3; i++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    state = (await local.call('/api/state?workspace=demo')).body.state;
    run = state.runs.find(row => row.name === 'Menu');
  }
  const carla = state.contacts.find(row => row.phone === '+5511977776666');
  assert.equal(carla.attribution.last.campaign, 'Clareamento em BH');
  assert.equal(state.runs.find(row => row.name === 'Anúncio').contactId, carla.id);
  const sent = path => evo.calls.find(c => c.path === `/message/${path}/graao_demo`)?.body;
  assert.deepEqual(sent('sendButtons'), { number: '5511977776666', title: '', description: 'Oi, Carla!', footer: 'Clínica',
    buttons: [{ type: 'reply', displayText: 'Agendar', id: 'opcao_1' }, { type: 'reply', displayText: 'Preços', id: 'opcao_2' }] });
  assert.deepEqual(sent('sendList'), { number: '5511977776666', title: '', description: 'Escolha um serviço', buttonText: 'Serviços', footerText: '',
    sections: [{ title: 'Opções', rows: [{ title: 'Limpeza', description: '', rowId: 'opcao_1' }, { title: 'Clareamento', description: '', rowId: 'opcao_2' }] }] });
  assert.deepEqual(sent('sendPoll'), { number: '5511977776666', name: 'Melhor horário?', selectableCount: 1, values: ['Manhã', 'Tarde'] });
  assert.equal(run.results.filter(line => line === 'WhatsApp: mensagem interativa enviada').length, 3);

  // The choices come back as messages: a button, a list row and a decrypted poll vote.
  await local.call(hookPath, upsert({ remoteJid: '5511977776666@s.whatsapp.net' }, { buttonsResponseMessage: { selectedDisplayText: 'Agendar', selectedButtonId: 'opcao_1' } }, 'Carla Souza'));
  await local.call(hookPath, upsert({ remoteJid: '5511977776666@s.whatsapp.net' }, { listResponseMessage: { title: 'Clareamento' } }, 'Carla Souza'));
  await local.call(hookPath, upsert({ remoteJid: '5511977776666@s.whatsapp.net' }, { pollUpdateMessage: { vote: { selectedOptions: [{ name: 'Tarde' }] } } }, 'Carla Souza'));
  state = (await local.call('/api/state?workspace=demo')).body.state;
  const inbound = state.messages.filter(row => row.contactId === carla.id && row.direction === 'Inbound').map(row => row.body);
  assert.deepEqual(inbound, ['Olá! Quero saber mais', 'Agendar', 'Clareamento', 'Escolheu: Tarde']);
});

test('Primeira conexão: o webhook registrado na Evolution é o que o graao aceita', async t => {
  const evo = fakeEvolution();
  const options = { evolutionBaseUrl: 'https://evo.graao.test', evolutionApiKey: API_KEY };
  const local = await boot(t, { whatsappRequest: evo.request, ...options });
  // Em produção a origem é https; só assim o webhook é registrado no servidor.
  const handler = createWhatsAppHandler({ store: local.store, secret: 'evolution-test-seal-secret-32-chars!', request: evo.request, ...options });
  const view = await handler.handleWorkspaceApi({
    req: {}, url: new URL('https://graao.test/api/whatsapp/workspace/connect'), method: 'POST', agencyId: 'agency', workspaceId: 'demo',
    payload: async () => ({}), publicOrigin: 'https://graao.test', requireActiveAccount: async () => {}, json: data => data
  });
  const registered = evo.instances.get('graao_demo').webhook.url;
  assert.equal(registered, view.webhookUrl);
  const created = evo.calls.find(c => c.path === '/instance/create');
  assert.equal(created.body.webhook.url, registered);
  const inbound = await local.call(new URL(registered).pathname, upsert({ remoteJid: '5511977776666@s.whatsapp.net' }, { conversation: 'Primeira mensagem' }));
  assert.equal(inbound.status, 200, inbound.body?.error);
  assert.equal(inbound.body.stored, true);
});
