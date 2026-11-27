// Fluxos sem chave da OpenAI: as ações de texto (bot de IA na conversa, Rodar agente, ações de IA) usam a IA
// gratuita da graao quando o dono da plataforma a liberou. O gateway aqui é simulado: só diz se a IA grátis está livre.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAI } from '../openai.mjs';

const emptyStore = { async load() { throw Object.assign(new Error('not found'), { status: 404 }); } };
const openAIWith = free => createOpenAI({ store: emptyStore, model: 'gpt-4.1-mini', secret: 'segredo-de-teste',
  gateway: { platformFreeAvailable: async () => { if (free instanceof Error) throw free; return free; } } });

test('sem chave e com a IA gratuita liberada, a conexão do fluxo vai para o gateway sem chave', async () => {
  const openAI = openAIWith(true);
  const connection = await openAI.optionalConnection({ id: 'u1' }, { org: 'sub-1', feature: 'agent.reply', allowPlatform: true });
  assert.equal(connection.apiKey, null);
  assert.equal(connection.platform, true);
  assert.deepEqual(connection.gatewayContext, { org: 'sub-1', user: 'u1', feature: 'agent.reply' });
  assert.equal(await openAI.platformAvailable(), true);
});

test('sem chave: imagem e vídeo (sem allowPlatform), IA grátis desligada ou gateway com erro continuam sem conexão', async () => {
  assert.equal(await openAIWith(true).optionalConnection({ id: 'u1' }, { org: 'sub-1' }), null);
  assert.equal(await openAIWith(true).optionalConnection({ id: 'u1' }), null);
  assert.equal(await openAIWith(false).optionalConnection({ id: 'u1' }, { org: 'sub-1', allowPlatform: true }), null);
  assert.equal(await openAIWith(new Error('fora do ar')).optionalConnection({ id: 'u1' }, { org: 'sub-1', allowPlatform: true }), null);
  assert.equal(await openAIWith(false).platformAvailable(), false);
  const noGateway = createOpenAI({ store: emptyStore, model: 'gpt-4.1-mini', secret: 'segredo-de-teste' });
  assert.equal(await noGateway.optionalConnection({ id: 'u1' }, { allowPlatform: true }), null);
  assert.equal(await noGateway.platformAvailable(), false);
});

test('requireConnection segue igual: sem chave e sem IA grátis, pede a chave', async () => {
  await assert.rejects(openAIWith(false).requireConnection({ id: 'u1' }, { allowPlatform: true }), error => error.status === 503 && /Conecte sua chave da OpenAI/.test(error.message));
  assert.equal((await openAIWith(true).requireConnection({ id: 'u1' }, { org: 'sub-1', allowPlatform: true })).platform, true);
});
