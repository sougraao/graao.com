// Adapter da OpenAI pela Responses API: é o formato que as funcionalidades atuais da graao já usam (chave própria
// da agência, BYOK). `passthrough` envia o corpo da funcionalidade sem tradução, preservando web_search, imagens e schemas.
import { GatewayError } from '../errors.mjs';
import { blankUsage } from '../contracts.mjs';
import { json, parseJsonEvent, readRateLimit, send, sseData } from './http.mjs';

export function normalizeResponsesUsage(usage) {
  const result = blankUsage();
  if (!usage) return result;
  result.inputTokens = Math.max(0, Number(usage.input_tokens ?? usage.inputTokens) || 0);
  result.outputTokens = Math.max(0, Number(usage.output_tokens ?? usage.outputTokens) || 0);
  result.cachedTokens = Math.max(0, Number(usage.input_tokens_details?.cached_tokens) || 0);
  result.reasoningTokens = Math.max(0, Number(usage.output_tokens_details?.reasoning_tokens) || 0);
  result.source = 'reported';
  return result;
}

function responsesInput(messages) {
  const input = [];
  for (const message of messages) {
    if (message.role === 'system') continue;
    if (message.role === 'tool') { input.push({ type: 'function_call_output', call_id: message.toolCallId, output: typeof message.content === 'string' ? message.content : JSON.stringify(message.content) }); continue; }
    const textType = message.role === 'assistant' ? 'output_text' : 'input_text';
    const content = typeof message.content === 'string' ? [{ type: textType, text: message.content }]
      : message.content.map(part => part.type === 'image' ? { type: 'input_image', image_url: part.url } : { type: textType, text: part.text });
    if (content.some(part => part.text) || content.some(part => part.type === 'input_image')) input.push({ role: message.role, content });
    for (const call of message.toolCalls || []) input.push({ type: 'function_call', call_id: call.id, name: call.name, arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}) });
  }
  return input;
}

export function parseResponsesOutput(data) {
  const parts = (data.output || []).flatMap(item => item.type === 'message' ? item.content || [] : []);
  const text = parts.filter(part => part.type === 'output_text').map(part => part.text || '').join('');
  const refusal = parts.find(part => part.type === 'refusal');
  const toolCalls = (data.output || []).filter(item => item.type === 'function_call').map(item => ({ id: item.call_id, name: item.name, arguments: item.arguments || '{}' }));
  return { text, refusal: refusal?.refusal || '', toolCalls, finishReason: toolCalls.length ? 'tool_calls' : data.status === 'incomplete' ? 'length' : 'stop' };
}

export function createOpenAIResponsesAdapter({ provider, baseUrl, apiKey, request = fetch }) {
  const id = provider.id;
  const headers = { Authorization: `Bearer ${apiKey}` };

  function body(req, model, stream) {
    const out = { model, input: responsesInput(req.messages), max_output_tokens: req.maxOutputTokens, store: false };
    const instructions = req.messages.filter(message => message.role === 'system').map(message => typeof message.content === 'string' ? message.content : message.content.map(part => part.text || '').join('')).join('\n\n');
    if (instructions) out.instructions = instructions;
    if (req.temperature !== undefined) out.temperature = req.temperature;
    const tools = req.tools.map(tool => ({ type: 'function', name: tool.name, description: tool.description, parameters: tool.parameters }));
    if (req.webSearch) tools.push({ type: 'web_search' });
    if (tools.length) out.tools = tools;
    if (req.schema) out.text = { format: { type: 'json_schema', name: req.schema.name, schema: req.schema.schema, strict: req.schema.strict } };
    if (stream) out.stream = true;
    return out;
  }

  async function passthrough(raw, { signal, timeoutMs, model }) {
    const response = await send(request, `${baseUrl}/responses`, { headers, body: { ...raw, store: false }, signal, timeoutMs, provider: id, model: model || raw.model });
    const data = await json(response, { provider: id, model: raw.model });
    return { data, usage: normalizeResponsesUsage(data.usage), model: data.model || raw.model, rateLimit: readRateLimit(response.headers) };
  }

  async function generateText(req, { model, signal, timeoutMs }) {
    const { data, usage, rateLimit } = await passthrough(body(req, model, false), { signal, timeoutMs, model });
    const parsed = parseResponsesOutput(data);
    if (parsed.refusal && !parsed.text) throw new GatewayError('policy', { provider: id, model, internal: 'refusal' });
    return { ...parsed, usage, model: data.model || model, rateLimit };
  }

  async function* streamText(req, { model, signal, timeoutMs }) {
    const response = await send(request, `${baseUrl}/responses`, { headers: { ...headers, Accept: 'text/event-stream' }, body: body(req, model, true), signal, timeoutMs, provider: id, model });
    const rateLimit = readRateLimit(response.headers);
    let final = null;
    for await (const data of sseData(response, { provider: id, model, signal })) {
      const event = parseJsonEvent(data, { provider: id, model });
      if (event.type === 'response.output_text.delta' && event.delta) yield { type: 'delta', text: event.delta };
      else if (event.type === 'response.completed' || event.type === 'response.incomplete') final = event.response;
      else if (event.type === 'response.failed' || event.type === 'error') throw new GatewayError('unavailable', { provider: id, model, internal: String(event.response?.error?.message || event.message || 'falha no stream').slice(0, 200) });
    }
    const parsed = final ? parseResponsesOutput(final) : { toolCalls: [], finishReason: 'stop' };
    yield { type: 'done', finishReason: parsed.finishReason, toolCalls: parsed.toolCalls, usage: normalizeResponsesUsage(final?.usage), model: final?.model || model, rateLimit };
  }

  async function generateEmbeddings(inputs, { model, signal, timeoutMs }) {
    const response = await send(request, `${baseUrl}/embeddings`, { headers, body: { model, input: inputs }, signal, timeoutMs, provider: id, model });
    const data = await json(response, { provider: id, model });
    const usage = blankUsage();
    usage.inputTokens = Math.max(0, Number(data.usage?.prompt_tokens) || 0);
    usage.source = data.usage ? 'reported' : 'unknown';
    return { vectors: (data.data || []).sort((a, b) => a.index - b.index).map(item => item.embedding), usage, model: data.model || model };
  }

  async function listModels({ signal = undefined } = {}) {
    const response = await send(request, `${baseUrl}/models`, { method: 'GET', headers, signal, timeoutMs: 10_000, provider: id });
    const data = await json(response, { provider: id });
    return (data.data || []).filter(row => typeof row?.id === 'string').map(row => ({ providerModelId: row.id, name: row.id, contextWindow: null, maxOutput: null,
      caps: { text: true, stream: true }, pricing: null, status: 'active', description: '' }));
  }

  return {
    id, kind: 'openai-responses', capabilities: new Set(['text', 'stream', 'structured', 'tools', 'vision', 'embeddings', 'webSearch', 'reasoning']),
    passthrough, generateText, streamText, generateEmbeddings, listModels,
    generateStructuredOutput: generateText, executeToolCalling: generateText, processImage: generateText,
    checkHealth: async options => { const started = Date.now(); await listModels(options); return { ok: true, latencyMs: Date.now() - started }; },
    validateCredentials: async options => { await listModels(options); return true; },
    accountQuota: async () => null, normalizeUsage: normalizeResponsesUsage
  };
}
