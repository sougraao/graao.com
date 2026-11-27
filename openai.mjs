import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const endpoint = 'https://api.openai.com/v1';
export const openAIModel = process.env.STUDIO_OPENAI_MODEL || 'gpt-4.1-mini';
const fail = (message, status) => Object.assign(new Error(message), { status });
const connectMessage = 'Conecte sua chave da OpenAI em Visão da agência → Configurações → OpenAI.';
const rowId = session => `openai-${session.id}`;

// `gateway` (graao AI Gateway, ai-gateway/gateway.mjs): quando presente, toda chamada à Responses API passa por ele
// (kill switch, circuit breaker, log de requisições). Sem ele (testes antigos), a chamada vai direto como antes.
export function createOpenAI({ store, model, secret, request = fetch, gateway = null }) {
  const key = secret && createHmac('sha256', secret).update('graao:openai:v1').digest();

  async function connection(session) {
    if (!session || !key) return null;
    const id = rowId(session);
    let state;
    try { state = await store.load(id); }
    catch (error) { if (error.status === 404) return null; throw error; }
    if (!state.token) return null;
    try {
      const [iv, tag, ciphertext] = state.token.split('.').map(part => Buffer.from(part, 'base64url'));
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(Buffer.from(id));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch { return null; }
  }

  function gatewayScope(session, scope) {
    if (!gateway) return {};
    return { gateway, gatewayContext: { org: String(scope.org || `user:${session?.id || 'local'}`), user: String(session?.id || ''), feature: scope.feature || 'legacy.openai' } };
  }

  const status = apiKey => ({ configured: Boolean(apiKey), last4: apiKey?.slice(-4) || '', model });
  // A IA gratuita do graao está liberada para quem não tem chave (o dono ligou a opção e há modelo grátis ativo).
  const platformFree = async () => Boolean(gateway && await gateway.platformFreeAvailable().catch(() => false));
  const platformConnection = (session, scope) => ({ apiKey: null, model, request, platform: true, ...gatewayScope(session, scope) });
  return {
    async status(session) { return status(await connection(session)); },
    platformAvailable: platformFree,
    /**
     * A chave de quem salvou (fluxos, Voice AI). Sem chave: null, ou, com `scope.allowPlatform` e a IA gratuita da
     * graao liberada, uma conexão sem chave que o gateway atende com modelos gratuitos (só texto).
     */
    async optionalConnection(session, scope = {}) {
      const apiKey = await connection(session);
      if (apiKey) return { apiKey, model, request, ...gatewayScope(session, scope) };
      return scope.allowPlatform && await platformFree() ? platformConnection(session, scope) : null;
    },
    /**
     * A chave da agência (BYOK). `scope`: { org, feature, allowPlatform }. Sem chave, e só quando o dono da plataforma
     * liberou "Agências sem chave usam a IA gratuita do graao" e a funcionalidade usa apenas texto (allowPlatform),
     * devolve uma conexão sem chave que o gateway atende com modelos gratuitos.
     */
    async requireConnection(session, scope = {}) {
      const apiKey = await connection(session);
      if (apiKey) return { apiKey, model, request, ...gatewayScope(session, scope) };
      if (scope.allowPlatform && await platformFree()) return platformConnection(session, scope);
      throw fail(connectMessage, 503);
    },
    async connect(session, input) {
      if (!key) throw fail('O armazenamento seguro de chaves está indisponível.', 503);
      const apiKey = typeof input === 'string' ? input.trim() : '';
      if (!/^sk-[!-~]{12,509}$/.test(apiKey)) throw fail('Informe uma chave de API válida da OpenAI.', 400);
      await openAIRequest(`/models/${encodeURIComponent(model)}`, { apiKey, request, timeout: 10000,
        problem: 'Não foi possível verificar a chave na OpenAI. Tente novamente.' });
      const id = rowId(session);
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(id));
      const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
      const token = [iv, cipher.getAuthTag(), ciphertext].map(part => part.toString('base64url')).join('.');
      if (!await store.insert(id, { profile: { name: 'Conexão OpenAI' }, token })) {
        await store.change(id, state => { state.token = token; });
      }
      return status(apiKey);
    },
    async disconnect(session) {
      try { await store.change(rowId(session), state => { delete state.token; }); }
      catch (error) { if (error.status !== 404) throw error; }
      return status(null);
    }
  };
}

async function openAIRequest(path, { apiKey, request, body, timeout, problem }) {
  const response = await request(endpoint + path, {
    method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(timeout), redirect: 'error',
    headers: { Authorization: `Bearer ${apiKey}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body)
  }).catch(() => null);
  if (response?.status === 401) throw fail('A OpenAI recusou a chave. Verifique a chave ou conecte uma nova.', 422);
  if ([403, 404].includes(response?.status)) throw fail('O projeto da chave não tem acesso ao modelo ou à operação solicitada na OpenAI.', 422);
  if (response?.status === 429) throw fail('Verifique o saldo e os limites de uso do seu projeto na OpenAI.', 429);
  if (!response?.ok) throw fail(problem, 502);
  const result = await response.json().catch(() => null);
  if (!result) throw fail(problem, 502);
  return result;
}

// Erros do gateway na chamada com a chave da agência mantêm as mensagens de antes (a tela e os testes dependem delas).
function legacyError(error, problem, byok) {
  if (!byok || error?.name !== 'GatewayError') return error;
  if (error.providerStatus === 401) return fail('A OpenAI recusou a chave. Verifique a chave ou conecte uma nova.', 422);
  if ([403, 404].includes(error.providerStatus)) return fail('O projeto da chave não tem acesso ao modelo ou à operação solicitada na OpenAI.', 422);
  if (error.providerStatus === 429) return fail('Verifique o saldo e os limites de uso do seu projeto na OpenAI.', 429);
  if (['disabled', 'cancelled', 'policy'].includes(error.kind)) return error;
  return fail(problem, 502);
}

// `onUsage`, when the caller meters AI spend, receives the model and token counts of every call,
// including failed ones (with zero tokens and the error message).
// Com `gateway` na conexão (o normal no servidor), a chamada passa pelo graao AI Gateway: o corpo segue igual para a
// OpenAI com a chave da agência, ou, sem chave e com a IA gratuita do graao liberada, vai a um modelo gratuito.
export async function openAIResponse(body, { apiKey, request, timeout, problem, onUsage, gateway, gatewayContext }) {
  const started = Date.now();
  try {
    const result = gateway
      ? await gateway.responses(body, { ...gatewayContext, byok: apiKey ? { openai: apiKey } : {} }, { timeoutMs: timeout }).catch(error => { throw legacyError(error, problem, Boolean(apiKey)); })
      : await openAIRequest('/responses', { apiKey, request, timeout, problem, body: { ...body, store: false } });
    await onUsage?.({ model: result.model || body.model, usage: result.usage || {}, ms: Date.now() - started });
    return result;
  } catch (error) {
    await onUsage?.({ model: body.model, usage: {}, ms: Date.now() - started, error: error.message });
    throw error;
  }
}
