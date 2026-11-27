// Catálogo de provedores do graao AI Gateway. Só fatos estáveis de integração (endpoint, formato, variável da chave,
// documentação oficial). Modelos, preços e limites NÃO ficam aqui: vêm da sincronização com a API do provedor
// e da revisão do administrador (registry.mjs). Endpoints conferidos na documentação oficial em 26/11/2026.
//
// group: A = prioritários (camada gratuita possível), B = pagos, C = modelos próprios / compatíveis, D = BYOK da organização.
// adapter: 'openai-compatible' (Chat Completions), 'openai-responses' (Responses API) ou 'anthropic' (Messages API).

export const PROVIDERS = Object.freeze([
  { id: 'groq', name: 'Groq', group: 'A', adapter: 'openai-compatible', baseUrl: 'https://api.groq.com/openai/v1', keyEnv: 'GROQ_API_KEY',
    sync: 'openai-list', rateLimitHeaders: 'groq', docs: 'https://console.groq.com/docs/rate-limits', pricing: 'https://groq.com/pricing',
    note: 'Plano gratuito com limites por modelo (RPM, RPD, TPM, TPD). Cabeçalhos x-ratelimit-* em toda resposta.' },
  { id: 'openrouter', name: 'OpenRouter', group: 'A', adapter: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1', keyEnv: 'OPENROUTER_API_KEY',
    sync: 'openrouter', headers: { 'X-Title': 'graao' }, docs: 'https://openrouter.ai/docs/api/reference/limits', pricing: 'https://openrouter.ai/models',
    note: 'Preço por token vem da API (/models). Modelos gratuitos têm cota diária de requisições por conta (GET /key).' },
  { id: 'cloudflare', name: 'Cloudflare Workers AI', group: 'A', adapter: 'openai-compatible',
    baseUrl: env => env.CLOUDFLARE_ACCOUNT_ID ? `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID)}/ai/v1` : '',
    keyEnv: 'CLOUDFLARE_AI_API_TOKEN', extraEnv: ['CLOUDFLARE_ACCOUNT_ID'], sync: 'none', unit: 'neurons',
    docs: 'https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/', pricing: 'https://developers.cloudflare.com/workers-ai/platform/pricing/',
    note: '10.000 Neurons por dia sem custo; acima disso só no plano pago. Neurons não são tokens: o gateway conta requisições de forma conservadora.' },
  { id: 'gemini', name: 'Google Gemini', group: 'A', adapter: 'openai-compatible', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyEnv: 'GEMINI_API_KEY',
    sync: 'openai-list', docs: 'https://ai.google.dev/gemini-api/docs/openai', pricing: 'https://ai.google.dev/gemini-api/docs/pricing',
    note: 'Na camada gratuita os dados podem ser usados pelo Google para melhorar produtos: revise antes de liberar dado pessoal.' },
  { id: 'mistral', name: 'Mistral AI', group: 'A', adapter: 'openai-compatible', baseUrl: 'https://api.mistral.ai/v1', keyEnv: 'MISTRAL_API_KEY',
    sync: 'mistral', docs: 'https://docs.mistral.ai/', pricing: 'https://mistral.ai/pricing', note: 'Confira na conta se o plano é o gratuito (experimental) e seus limites.' },

  { id: 'openai', name: 'OpenAI', group: 'B', adapter: 'openai-responses', baseUrl: 'https://api.openai.com/v1', keyEnv: 'OPENAI_API_KEY', sync: 'openai-list',
    byok: true, docs: 'https://platform.openai.com/docs', pricing: 'https://openai.com/api/pricing', note: 'As agências usam chave própria (BYOK) nas funcionalidades atuais.' },
  { id: 'anthropic', name: 'Anthropic', group: 'B', adapter: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', keyEnv: 'ANTHROPIC_API_KEY', sync: 'anthropic',
    docs: 'https://docs.anthropic.com/', pricing: 'https://www.anthropic.com/pricing' },
  { id: 'deepseek', name: 'DeepSeek', group: 'B', adapter: 'openai-compatible', baseUrl: 'https://api.deepseek.com/v1', keyEnv: 'DEEPSEEK_API_KEY', sync: 'openai-list',
    docs: 'https://api-docs.deepseek.com/', pricing: 'https://api-docs.deepseek.com/quick_start/pricing' },
  { id: 'xai', name: 'xAI', group: 'B', adapter: 'openai-compatible', baseUrl: 'https://api.x.ai/v1', keyEnv: 'XAI_API_KEY', sync: 'openai-list',
    docs: 'https://docs.x.ai/', pricing: 'https://docs.x.ai/docs/models' },
  { id: 'together', name: 'Together AI', group: 'B', adapter: 'openai-compatible', baseUrl: 'https://api.together.xyz/v1', keyEnv: 'TOGETHER_API_KEY', sync: 'openai-list',
    docs: 'https://docs.together.ai/', pricing: 'https://www.together.ai/pricing' },
  { id: 'fireworks', name: 'Fireworks AI', group: 'B', adapter: 'openai-compatible', baseUrl: 'https://api.fireworks.ai/inference/v1', keyEnv: 'FIREWORKS_API_KEY', sync: 'openai-list',
    docs: 'https://docs.fireworks.ai/', pricing: 'https://fireworks.ai/pricing' },
  { id: 'cerebras', name: 'Cerebras', group: 'B', adapter: 'openai-compatible', baseUrl: 'https://api.cerebras.ai/v1', keyEnv: 'CEREBRAS_API_KEY', sync: 'openai-list',
    docs: 'https://inference-docs.cerebras.ai/', pricing: 'https://www.cerebras.ai/pricing' },

  // Ollama, vLLM ou qualquer servidor compatível com a OpenAI. A URL passa pela validação contra SSRF a cada uso.
  { id: 'compat', name: 'Servidor próprio (OpenAI-compatível)', group: 'C', adapter: 'openai-compatible', baseUrl: env => env.GRAAO_AI_COMPAT_BASE_URL || '',
    keyEnv: 'GRAAO_AI_COMPAT_API_KEY', keyOptional: true, customUrl: true, sync: 'openai-list',
    docs: 'https://github.com/ollama/ollama/blob/main/docs/openai.md', note: 'Ollama, vLLM ou servidor próprio. Custo por token definido pelo administrador.' }
]);

export const providerById = id => PROVIDERS.find(provider => provider.id === id) || null;

/** Base URL e chave global (das variáveis de ambiente) de um provedor. A chave nunca sai do servidor. */
export function globalCredential(provider, env) {
  const baseUrl = typeof provider.baseUrl === 'function' ? provider.baseUrl(env) : provider.baseUrl;
  const apiKey = String(env[provider.keyEnv] || '').trim();
  const missing = [];
  if (!baseUrl) missing.push(...(provider.extraEnv || ['GRAAO_AI_COMPAT_BASE_URL']));
  if (!apiKey && !provider.keyOptional) missing.push(provider.keyEnv);
  return { baseUrl: baseUrl ? baseUrl.replace(/\/+$/, '') : '', apiKey, configured: missing.length === 0, missing, last4: apiKey ? apiKey.slice(-4) : '' };
}
