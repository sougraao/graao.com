// Contrato dos módulos de rota (P2.1): o que não é do Pergunte à Graao, da IA de conteúdo, das notas de reunião,
// do SEO ou da Visibilidade na IA volta como NEXT_ROUTE sem tocar em nada.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAskRoutes } from '../routes/ask.mjs';
import { createBrandAIRoutes, createContentAIRoutes, createConversationAIRoutes } from '../routes/content-ai.mjs';
import { createSeoRoutes } from '../routes/seo.mjs';
import { NEXT_ROUTE } from '../routes/next-route.mjs';

const uuid = '11111111-2222-3333-4444-555555555555';
const ctx = (p, method = 'GET') => ({ req: { headers: {}, socket: {} }, res: {}, p, method, url: new URL(`http://x${p}`), id: 'demo',
  json: () => assert.fail(`json chamado em ${p}`) });
const spy = touched => new Proxy({}, { get: (_, name) => (...args) => { touched.push(name); return args; } });

test('IA, SEO e Pergunte à Graao devolvem NEXT_ROUTE para caminhos de outros domínios', async () => {
  const touched = [];
  const cases = [
    [createAskRoutes, [['/api/ask'], ['/api/asking/x', 'POST']]],
    [createBrandAIRoutes, [['/api/brand/import'], ['/api/brand/voice-ai'], ['/api/brand/outro', 'POST'], ['/api/content-ai/review-reply']]],
    [createConversationAIRoutes, [['/api/conversations/ai/reply'], ['/api/conversations/ai/outro', 'POST'], ['/api/meetings/transcribe'], ['/api/meetings/notes', 'POST']]],
    [createSeoRoutes, [['/api/seo/audit'], ['/api/seo/search', 'POST'], ['/api/visibility/run'], ['/api/seo/outro', 'POST']]],
    [createContentAIRoutes, [['/api/content-ai/transform'], ['/api/content-ai/email'], ['/api/content-ai/review-reply', 'POST']]],
  ];
  for (const [factory, paths] of cases) {
    const route = factory(spy(touched));
    for (const [p, method] of [...paths, [`/cd/demo/${uuid}`], ['/api/state'], ['/api/apps/install', 'POST'], ['/api/wallet/topup', 'POST']]) {
      assert.equal(await route(ctx(p, method)), NEXT_ROUTE, `${factory.name}: ${method || 'GET'} ${p}`);
    }
  }
  assert.deepEqual(touched, []);
});

test('a auditoria de SEO recusa endereço inválido e a IA exige a OpenAI conectada', async () => {
  const error = (message, status) => Object.assign(new Error(message), { status });
  const base = { error, spaceId: /^demo$/, privateSpace: /^user-/, workspaceAccess: async () => ({ session: null }), store: { load: async () => ({}) } };
  const seo = createSeoRoutes({ ...base, payload: async () => ({ url: 'http://127.0.0.1/' }) });
  await assert.rejects(seo(ctx('/api/seo/audit', 'POST')), { status: 400 });
  const empty = createSeoRoutes({ ...base, payload: async () => ({}) });
  await assert.rejects(empty(ctx('/api/seo/audit', 'POST')), { status: 400 });

  const content = createContentAIRoutes({ ...base, payload: async () => ({ brief: 'Convite para o evento' }), brandVoiceOf: async () => '', localAccess: false, contentAI: null });
  await assert.rejects(content(ctx('/api/content-ai/email', 'POST')), { status: 409 });
  await assert.rejects(content({ ...ctx('/api/content-ai/email', 'POST'), id: 'outra' }), { status: 404 });
});
