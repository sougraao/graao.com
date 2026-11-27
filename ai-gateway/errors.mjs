// graao AI Gateway: erros normalizados. Todo adapter converte a falha do provedor numa destas classes;
// o roteador decide pela classe (e nunca pelo texto do provedor) se tenta de novo, troca de modelo ou para.

export const ERROR_KINDS = Object.freeze([
  'rate_limit',        // 429 com folga de tempo: espera ou troca de provedor
  'quota_exhausted',   // cota do dia/mês ou créditos do provedor acabaram
  'timeout',           // a tentativa passou do prazo
  'unavailable',       // 5xx, rede, provedor fora do ar
  'auth',              // chave recusada (401/403)
  'model_gone',        // modelo descontinuado ou inexistente (404 do modelo)
  'transient',         // erro temporário do provedor (ex.: 409, 425, overloaded)
  'context_exceeded',  // entrada maior que a janela do modelo
  'invalid_request',   // a requisição está errada: outro provedor não resolve
  'policy',            // bloqueio de conteúdo ou segurança: nunca contornar com fallback
  'budget',            // orçamento ou créditos do graao/organização insuficientes
  'structured_output', // a resposta não obedeceu ao schema pedido
  'cancelled',         // quem chamou cancelou
  'disabled',          // kill switch, provedor desligado ou nenhum modelo elegível
  'no_route'           // nenhum modelo passou nos filtros obrigatórios
]);

// Trocar de modelo/provedor ajuda nestes casos. 'policy', 'invalid_request', 'budget' e 'cancelled' nunca.
const FALLBACK_KINDS = new Set(['rate_limit', 'quota_exhausted', 'timeout', 'unavailable', 'auth', 'model_gone', 'transient', 'context_exceeded', 'structured_output']);
// Repetir no MESMO provedor só ajuda em falhas passageiras.
const RETRY_SAME_KINDS = new Set(['timeout', 'unavailable', 'transient']);
// Falhas que contam para abrir o circuito do provedor (não as do pedido em si).
const BREAKER_KINDS = new Set(['timeout', 'unavailable', 'transient', 'auth']);

export const canFallback = kind => FALLBACK_KINDS.has(kind);
export const canRetrySame = kind => RETRY_SAME_KINDS.has(kind);
export const countsForBreaker = kind => BREAKER_KINDS.has(kind);

// Mensagens para quem usa o graao. Nada de detalhe interno, nome de provedor ou stack.
const USER_MESSAGES = {
  quota_exhausted: 'O limite gratuito de inteligência artificial foi atingido. Você poderá continuar quando sua cota for renovada.',
  budget: 'Seus créditos de IA acabaram. Adicione novos créditos para continuar.',
  policy: 'O pedido não pôde ser atendido pelas regras de uso da inteligência artificial. Reformule e tente de novo.',
  invalid_request: 'O pedido para a inteligência artificial veio incompleto. Revise os campos e tente de novo.',
  context_exceeded: 'O texto enviado é grande demais para a inteligência artificial. Resuma e tente de novo.',
  cancelled: 'O pedido foi cancelado.',
  disabled: 'A inteligência artificial está temporariamente indisponível. Tente novamente em instantes.',
  no_route: 'A inteligência artificial está temporariamente indisponível. Tente novamente em instantes.',
  structured_output: 'A inteligência artificial devolveu uma resposta fora do formato. Tente de novo.'
};
const HTTP_STATUS = { quota_exhausted: 429, rate_limit: 429, budget: 402, policy: 422, invalid_request: 400, context_exceeded: 413,
  cancelled: 499, auth: 502, disabled: 503, no_route: 503, unavailable: 503, timeout: 504, structured_output: 502 };

export const userMessage = kind => USER_MESSAGES[kind] || 'A inteligência artificial está temporariamente indisponível. Tente novamente em instantes.';

export class GatewayError extends Error {
  /**
   * @param {string} kind uma de ERROR_KINDS
   * @param {any} [details] { provider, model, retryAfterMs, providerStatus, internal } — `internal` nunca vai ao cliente
   */
  constructor(kind, details = {}) {
    super(userMessage(kind));
    this.name = 'GatewayError';
    this.kind = ERROR_KINDS.includes(kind) ? kind : 'unavailable';
    this.status = HTTP_STATUS[this.kind] || 503;
    this.provider = details.provider || '';
    this.model = details.model || '';
    this.retryAfterMs = Number.isFinite(details.retryAfterMs) ? details.retryAfterMs : null;
    this.providerStatus = details.providerStatus || 0;
    // Texto curto e já sem segredos (redact antes de guardar): vai para o log de auditoria, nunca para a resposta.
    this.internal = String(details.internal || '').slice(0, 300);
    /** @type {object | null} limites lidos dos cabeçalhos da resposta que falhou */
    this.rateLimit = null;
  }
}

/** Retry-After em segundos ou data HTTP, em milissegundos (null quando ausente ou inválido). */
export function parseRetryAfter(value, now = Date.now()) {
  if (value === null || value === undefined || value === '') return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const at = Date.parse(String(value));
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

const has = (text, ...words) => words.some(word => text.includes(word));

/**
 * Classifica uma resposta HTTP de erro de provedor. `body` é o texto (já lido) da resposta.
 * Regras por status primeiro; o texto só desempata casos conhecidos (contexto, cota, política, modelo).
 */
export function classifyHttp(status, body = '', headers = null, { provider = '', model = '' } = {}) {
  const text = String(body || '').toLowerCase();
  const retryAfterMs = parseRetryAfter(headers?.get?.('retry-after'));
  const base = { provider, model, providerStatus: status, retryAfterMs, internal: `${status} ${String(body || '').slice(0, 200)}` };
  if (has(text, 'context_length', 'context length', 'maximum context', 'too many tokens', 'prompt is too long', 'reduce the length')) return new GatewayError('context_exceeded', base);
  if (has(text, 'content_policy', 'content policy', 'safety', 'flagged', 'moderation', 'content_filter')) return new GatewayError('policy', base);
  if (status === 401 || status === 403) return new GatewayError('auth', base);
  if (status === 402) return new GatewayError('quota_exhausted', base);
  if (status === 429) {
    // Cota diária/créditos esgotados não voltam em segundos: tratar como cota, não como rajada.
    if (has(text, 'quota', 'insufficient', 'credits', 'per day', 'daily', 'billing', 'exceeded your current')) return new GatewayError('quota_exhausted', base);
    return new GatewayError('rate_limit', base);
  }
  if (status === 404 || (status === 400 && has(text, 'model_not_found', 'does not exist', 'decommissioned', 'deprecated', 'not a valid model', 'no endpoints found'))) {
    return new GatewayError('model_gone', base);
  }
  if (status === 408) return new GatewayError('timeout', base);
  if (status === 409 || status === 425 || status === 529 || has(text, 'overloaded')) return new GatewayError('transient', base);
  if (status === 413) return new GatewayError('context_exceeded', base);
  if (status >= 500) return new GatewayError('unavailable', base);
  if (status >= 400) return new GatewayError('invalid_request', base);
  return new GatewayError('unavailable', base);
}

/** Erros de rede/abort viram classes; um GatewayError passa direto. */
export function classifyThrown(error, { provider = '', model = '', cancelled = false } = {}) {
  if (error instanceof GatewayError) return error;
  if (cancelled) return new GatewayError('cancelled', { provider, model });
  const name = error?.name || '';
  if (name === 'TimeoutError') return new GatewayError('timeout', { provider, model, internal: 'timeout' });
  if (name === 'AbortError') return new GatewayError('cancelled', { provider, model });
  return new GatewayError('unavailable', { provider, model, internal: String(error?.message || error).slice(0, 200) });
}
