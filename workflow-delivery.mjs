// Outbound webhooks from workflows: https only, never to private or local networks, short timeout.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { aiVariableName } from './ui/workflow-data.js';

function privateAddress(address) {
  const ip = address.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip);
}

// A public https address, or the reason it is refused (a string).
async function publicTarget(url, resolve = lookup) {
  let target;
  try { target = new URL(url); } catch { return 'endereço inválido'; }
  if (target.protocol !== 'https:' || target.username || target.password) return 'apenas https:// é aceito';
  const host = target.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await resolve(host, { all: true }).catch(() => []);
  if (!addresses.length) return 'domínio não encontrado';
  if (addresses.some(entry => privateAddress(entry.address))) return 'endereço de rede interna bloqueado';
  return target;
}

export async function deliverWebhook(item, { fetchImpl = fetch, resolve = lookup, timeout = 8000 } = {}) {
  const target = await publicTarget(item.url, resolve);
  if (typeof target === 'string') return target;
  const method = ['POST', 'PUT', 'GET'].includes(item.method) ? item.method : 'POST';
  try {
    const response = await fetchImpl(target, {
      method, redirect: 'manual', signal: AbortSignal.timeout(timeout),
      headers: { 'content-type': 'application/json', 'user-agent': 'graao-workflows/1.0' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(item.body ?? {}) })
    });
    return response.ok ? `enviado (${response.status})` : `falhou (${response.status})`;
  } catch (error) {
    return error?.name === 'TimeoutError' ? 'sem resposta em 8 s' : 'falha de conexão';
  }
}

const blockedHeaders = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'keep-alive', 'upgrade', 'te', 'trailer', 'proxy-authorization', 'expect']);
const variableName = aiVariableName;

/**
 * "Webhook personalizado": any method, the step's own headers and body, and the answer for the workflow:
 * {{vars.<name>}} (the body, up to 4,000 characters), {{vars.<name>_status}} and, for a JSON object, its
 * first ten plain fields as {{vars.<name>_<field>}}. Same network rules as the plain webhook.
 * Returns { vars } or { error, vars }.
 */
export async function deliverCustomWebhook(item, { fetchImpl = fetch, resolve = lookup, timeout = 10000 } = {}) {
  const name = variableName(item.variable) || 'resposta';
  const target = await publicTarget(item.url, resolve);
  if (typeof target === 'string') return { error: target };
  const method = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(item.method) ? item.method : 'POST';
  const headers = { 'user-agent': 'graao-workflows/1.0' };
  for (const [key, value] of Object.entries(item.headers || {}).slice(0, 20)) {
    const header = String(key).trim().toLowerCase();
    if (/^[a-z0-9-]{1,60}$/.test(header) && !blockedHeaders.has(header)) headers[header] = String(value ?? '').replace(/[\r\n]+/g, ' ').slice(0, 2000);
  }
  const sendsBody = !['GET', 'DELETE'].includes(method) && typeof item.body === 'string' && item.body !== '';
  if (sendsBody && !headers['content-type']) headers['content-type'] = item.contentType === 'form' ? 'application/x-www-form-urlencoded' : 'application/json';
  let response;
  try {
    response = await fetchImpl(target, { method, redirect: 'manual', signal: AbortSignal.timeout(timeout), headers, ...(sendsBody ? { body: item.body.slice(0, 100000) } : {}) });
  } catch (error) {
    return { error: error?.name === 'TimeoutError' ? `sem resposta em ${Math.round(timeout / 1000)} s` : 'falha de conexão' };
  }
  const text = (await response.text().catch(() => '')).slice(0, 64000);
  const vars = { [name]: text.slice(0, 4000), [`${name}_status`]: String(response.status) };
  try {
    const data = JSON.parse(text);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const [key, value] of Object.entries(data).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v)).slice(0, 10)) {
        const field = variableName(`${name}_${key}`);
        if (field && !(field in vars)) vars[field] = String(value ?? '');
      }
    }
  } catch { /* not JSON: the raw body is enough */ }
  return response.ok ? { vars } : { error: `falhou (${response.status})`, vars };
}

export { privateAddress, publicTarget };
