// graao Prompt Registry: prompts internos versionados (rascunho → publicado → rollback), guardados no documento
// de configuração. O prompt de sistema fica separado das mensagens do usuário; variáveis só entram no template
// do usuário, escapadas como dado, e nunca podem trocar as instruções privilegiadas. Segredos nunca entram aqui.
import { MODE_IDS } from './contracts.mjs';
import { redact } from './privacy.mjs';

const ID = /^[a-z][a-z0-9_.-]{1,63}$/;
const VAR = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]{0,40})\s*\}\}/g;
const MAX_VERSIONS = 30;

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function variablesOf(template) {
  return [...new Set([...String(template || '').matchAll(VAR)].map(match => match[1]))];
}

/** Cria uma nova versão (rascunho). Não publica. */
export function saveVersion(config, id, input = {}, now = new Date().toISOString()) {
  if (!ID.test(id)) throw fail('Identificador inválido. Use letras minúsculas, números, ponto ou hífen.');
  const system = String(input.system || '').slice(0, 20_000);
  const template = String(input.template || '').slice(0, 20_000);
  if (!system && !template) throw fail('Escreva o prompt de sistema ou o modelo da mensagem.');
  if (redact(system, 20_000) !== system || redact(template, 20_000) !== template) {
    // Algo com cara de chave, e-mail, CPF ou telefone: prompt não guarda dado sensível nem segredo.
    throw fail('O prompt contém algo parecido com chave de API, e-mail, telefone ou documento. Tire antes de salvar.');
  }
  if (!config.prompts[id]) config.prompts[id] = { versions: [], published: 0 };
  const entry = config.prompts[id];
  const version = (entry.versions.at(-1)?.version || 0) + 1;
  entry.versions.push({
    version, system, template, variables: variablesOf(template),
    mode: MODE_IDS.includes(input.mode) ? input.mode : 'auto', language: String(input.language || 'pt-BR').slice(0, 10),
    maxOutputTokens: Math.max(1, Math.min(Number(input.maxOutputTokens) || 1024, 64_000)),
    temperature: Number.isFinite(Number(input.temperature)) && input.temperature !== '' && input.temperature !== null ? Math.max(0, Math.min(2, Number(input.temperature))) : null,
    schema: input.schema && typeof input.schema === 'object' ? input.schema : null,
    tools: Array.isArray(input.tools) ? input.tools.filter(name => typeof name === 'string').slice(0, 20) : [],
    note: String(input.note || '').slice(0, 200), createdAt: now
  });
  if (entry.versions.length > MAX_VERSIONS) entry.versions = entry.versions.filter(item => item.version === entry.published || item.version > entry.versions.at(-1).version - MAX_VERSIONS);
  return { id, version };
}

/** Publica uma versão (ou volta para uma anterior: rollback é publicar a versão antiga). */
export function publishVersion(config, id, version) {
  const entry = config.prompts[id];
  if (!entry?.versions.some(item => item.version === Number(version))) throw fail('Versão não encontrada.', 404);
  entry.published = Number(version);
  return { id, published: entry.published };
}

/**
 * Monta o pedido a partir da versão publicada (ou de `version`, no ambiente de teste do painel).
 * Variáveis entram dentro de marcadores como dado; a mensagem nunca vira instrução de sistema.
 */
export function renderPrompt(config, id, variables = {}, { version = undefined } = {}) {
  const entry = config.prompts[id];
  const chosen = entry?.versions.find(item => item.version === Number(version || entry.published));
  if (!chosen) throw fail('Prompt sem versão publicada.', 404);
  const missing = chosen.variables.filter(name => variables[name] === undefined || variables[name] === null);
  if (missing.length) throw fail(`Faltam variáveis: ${missing.join(', ')}.`);
  const user = chosen.template.replace(VAR, (_, name) => String(variables[name]).slice(0, 50_000));
  return {
    system: chosen.system, messages: user ? [{ role: 'user', content: user }] : [], mode: chosen.mode, maxOutputTokens: chosen.maxOutputTokens,
    ...(chosen.temperature !== null && { temperature: chosen.temperature }), ...(chosen.schema && { schema: chosen.schema }),
    promptVersion: `${id}@${chosen.version}`
  };
}

export function listPrompts(config) {
  return Object.entries(config.prompts).map(([id, entry]) => ({ id, published: entry.published, versions: entry.versions.map(({ version, note, createdAt, mode, variables }) => ({ version, note, createdAt, mode, variables })) }));
}
