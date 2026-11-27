// graao AI Gateway: o contrato único entre as funcionalidades do graao e os provedores.
// Uma funcionalidade nunca fala com um provedor: monta um pedido normalizado e recebe uma resposta normalizada.
import { GatewayError } from './errors.mjs';
import { DATA_CLASSES } from './privacy.mjs';

// Capacidades que um adapter/modelo declara. Nada é simulado: sem a capacidade, o modelo sai da rota.
export const CAPABILITIES = Object.freeze(['text', 'stream', 'structured', 'tools', 'vision', 'embeddings', 'webSearch', 'reasoning']);

// Modos de inteligência: perfis de roteamento, não modelos próprios.
export const MODES = Object.freeze({
  auto: { label: 'graao Auto', needs: [], weights: null },
  free: { label: 'graao Free', needs: [], freeOnly: true, weights: null },
  fast: { label: 'graao Fast', needs: [], weights: { speed: 0.45, availability: 0.2, cost: 0.2, quality: 0.1, capacity: 0.05 } },
  pro: { label: 'graao Pro', needs: [], weights: { quality: 0.5, availability: 0.2, cost: 0.15, speed: 0.1, capacity: 0.05 } },
  reason: { label: 'graao Reason', needs: ['reasoning'], weights: { quality: 0.55, availability: 0.2, cost: 0.15, speed: 0.05, capacity: 0.05 } },
  vision: { label: 'graao Vision', needs: ['vision'], weights: null },
  agent: { label: 'graao Agent', needs: ['tools'], weights: null },
  embeddings: { label: 'graao Embeddings', needs: ['embeddings'], weights: null }
});
export const MODE_IDS = Object.freeze(Object.keys(MODES));

export const TASKS = Object.freeze(['chat', 'copy', 'classify', 'extract', 'summarize', 'code', 'reason', 'vision', 'agent', 'embed']);

const ROLES = new Set(['system', 'user', 'assistant', 'tool']);
const MAX_MESSAGES = 400;
const MAX_TEXT = 400_000;

function text(value, limit = MAX_TEXT) {
  return String(value ?? '').slice(0, limit);
}

/** Conteúdo de uma mensagem: texto, ou partes { type: 'text' | 'image', ... }. */
function content(value) {
  if (typeof value === 'string') return text(value);
  if (!Array.isArray(value)) return text(value);
  return value.slice(0, 50).map(part => {
    if (part?.type === 'image' || part?.type === 'input_image' || part?.type === 'image_url') {
      const url = part.url || part.image_url?.url || part.image_url || '';
      if (typeof url !== 'string' || !/^(https:|data:image\/(png|jpe?g|webp|gif);base64,)/.test(url)) throw new GatewayError('invalid_request', { internal: 'imagem inválida' });
      return { type: 'image', url: url.slice(0, 12_000_000) };
    }
    return { type: 'text', text: text(part?.text ?? part?.content ?? '') };
  });
}

export const hasImages = messages => messages.some(message => Array.isArray(message.content) && message.content.some(part => part.type === 'image'));

/**
 * Valida e normaliza o pedido que vem de uma funcionalidade. Identidade (organização, usuário) NUNCA vem daqui:
 * o gateway recebe `context` separado, montado pelo servidor a partir da sessão.
 * @param {any} [input]
 */
export function normalizeRequest(input = {}) {
  if (!input || typeof input !== 'object') throw new GatewayError('invalid_request', { internal: 'pedido vazio' });
  const feature = String(input.feature || '').trim();
  if (!/^[a-z][a-z0-9_.-]{1,63}$/.test(feature)) throw new GatewayError('invalid_request', { internal: 'feature inválida' });
  const mode = MODE_IDS.includes(input.mode) ? input.mode : 'auto';
  const messages = [];
  if (input.system) messages.push({ role: 'system', content: text(input.system) });
  for (const message of Array.isArray(input.messages) ? input.messages.slice(0, MAX_MESSAGES) : []) {
    const role = ROLES.has(message?.role) ? message.role : 'user';
    const entry = { role, content: content(message?.content) };
    if (role === 'tool') entry.toolCallId = String(message.toolCallId || message.tool_call_id || '').slice(0, 120);
    if (role === 'assistant' && Array.isArray(message.toolCalls)) entry.toolCalls = message.toolCalls.slice(0, 20);
    messages.push(entry);
  }
  if (mode !== 'embeddings' && !messages.some(message => message.role === 'user' || message.role === 'tool')) {
    throw new GatewayError('invalid_request', { internal: 'sem mensagem do usuário' });
  }
  const tools = Array.isArray(input.tools) ? input.tools.slice(0, 64).map(tool => {
    const name = String(tool?.name || '');
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new GatewayError('invalid_request', { internal: 'ferramenta inválida' });
    return { name, description: text(tool.description, 2000), parameters: tool.parameters && typeof tool.parameters === 'object' ? tool.parameters : { type: 'object', properties: {} } };
  }) : [];
  const schema = input.schema && typeof input.schema === 'object' ? {
    name: String(input.schema.name || 'resposta').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'resposta',
    schema: input.schema.schema || input.schema, strict: input.schema.strict !== false
  } : null;
  const maxOutputTokens = Math.max(1, Math.min(Number(input.maxOutputTokens) || 1024, 64_000));
  const dataClass = DATA_CLASSES.includes(input.dataClass) ? input.dataClass : '';
  const needs = new Set(MODES[mode].needs);
  if (tools.length) needs.add('tools');
  if (schema) needs.add('structured');
  if (hasImages(messages)) needs.add('vision');
  if (input.webSearch) needs.add('webSearch');
  if (input.stream) needs.add('stream');
  return {
    feature, mode, task: TASKS.includes(input.task) ? input.task : 'chat', messages, tools, schema, maxOutputTokens,
    temperature: Number.isFinite(input.temperature) ? Math.max(0, Math.min(2, input.temperature)) : undefined,
    dataClass, needs: [...needs], model: typeof input.model === 'string' ? input.model.slice(0, 160) : '',
    stream: Boolean(input.stream), webSearch: Boolean(input.webSearch),
    cache: input.cache === true, cacheTtlMs: Math.max(0, Math.min(Number(input.cacheTtlMs) || 10 * 60_000, 24 * 3600_000)),
    promptVersion: typeof input.promptVersion === 'string' ? input.promptVersion.slice(0, 80) : '',
    idempotencyKey: typeof input.idempotencyKey === 'string' ? input.idempotencyKey.slice(0, 120) : '',
    input: Array.isArray(input.input) ? input.input.slice(0, 2048).map(item => text(item, 32_000)) : undefined,
    speed: ['low', 'normal', 'high'].includes(input.speed) ? input.speed : 'normal',
    quality: ['low', 'normal', 'high'].includes(input.quality) ? input.quality : 'normal'
  };
}

// ---------- Compatibilidade com o formato da OpenAI Responses API (o que as funcionalidades atuais usam) ----------

/** Corpo da Responses API → pedido normalizado do gateway (para rotear a provedores que não são a OpenAI). */
export function fromResponsesBody(body, { feature = 'legacy.openai', dataClass = 'confidential' } = {}) {
  const messages = [];
  const input = typeof body.input === 'string' ? [{ role: 'user', content: body.input }] : Array.isArray(body.input) ? body.input : [];
  for (const item of input) {
    if (!item || typeof item !== 'object') continue;
    if (item.type && item.type !== 'message' && !item.role) continue;
    const parts = typeof item.content === 'string' ? item.content : (item.content || []).map(part => {
      if (part.type === 'input_image') return { type: 'image', url: part.image_url };
      return { type: 'text', text: part.text ?? '' };
    });
    messages.push({ role: item.role === 'developer' ? 'system' : item.role || 'user', content: parts });
  }
  const format = body.text?.format;
  return normalizeRequest({
    feature, dataClass, system: body.instructions || '', messages,
    maxOutputTokens: body.max_output_tokens, temperature: body.temperature,
    schema: format?.type === 'json_schema' ? { name: format.name, schema: format.schema, strict: format.strict } : null,
    webSearch: Array.isArray(body.tools) && body.tools.some(tool => tool?.type === 'web_search' || tool?.type === 'web_search_preview')
  });
}

/** Resposta normalizada → o formato que os módulos atuais leem (output[].content[].output_text, status, usage). */
export function toResponsesResult(result) {
  return {
    id: result.requestId, object: 'response', model: result.model, status: result.finishReason === 'length' ? 'incomplete' : 'completed',
    output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: result.text || '' }] }],
    output_text: result.text || '',
    usage: { input_tokens: result.usage.inputTokens, output_tokens: result.usage.outputTokens, total_tokens: result.usage.inputTokens + result.usage.outputTokens },
    graao: { provider: result.provider, mode: result.mode, fallback: result.attempts > 1 }
  };
}

/** Uso normalizado: tokens com origem ('reported' do provedor, 'estimated' pelo gateway, 'unknown'). */
export function blankUsage() {
  return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, source: 'unknown', providerCostMicros: null };
}
