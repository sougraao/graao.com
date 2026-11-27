// graao AI Gateway: proteção contra SSRF para URLs de provedores configuráveis (OpenAI-compatível, Ollama, vLLM).
// Regras: só HTTPS (HTTP apenas para localhost em desenvolvimento, quando permitido), sem usuário/senha na URL,
// e nenhum endereço resolvido pode cair em rede privada, loopback, link-local ou metadados de nuvem.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function ipv4Private(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}
function ipv6Private(ip) {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (value === '::' || value === '::1') return true;
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(value);
}
export const isPrivateAddress = ip => isIP(ip) === 4 ? ipv4Private(ip) : isIP(ip) === 6 ? ipv6Private(ip) : true;

/**
 * Valida a URL base de um provedor. Lança um Error com mensagem para o painel quando recusa.
 * @param {string} raw
 * @param {{ allowLocal?: boolean, resolve?: (host: string) => Promise<Array<{address: string}>> }} [options]
 */
export async function validateProviderUrl(raw, { allowLocal = false, resolve = host => lookup(host, { all: true, verbatim: true }) } = {}) {
  let url;
  try { url = new URL(String(raw || '').trim()); } catch { throw new Error('Informe uma URL válida, começando com https://.'); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const local = host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '::1';
  if (url.username || url.password) throw new Error('A URL não pode ter usuário ou senha. Use o campo da chave.');
  if (url.search || url.hash) throw new Error('A URL base não pode ter parâmetros (?) nem âncora (#).');
  if (local) {
    if (!allowLocal) throw new Error('Endereços locais só são aceitos no servidor de desenvolvimento.');
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use http:// ou https://.');
    return url.toString().replace(/\/+$/, '');
  }
  if (url.protocol !== 'https:') throw new Error('Use uma URL com https://.');
  if (url.port && !['443', '8443'].includes(url.port)) throw new Error('Use a porta padrão do HTTPS (443) ou 8443.');
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('Endereços de rede privada não são aceitos.');
  } else {
    let records = [];
    try { records = await resolve(host); } catch { throw new Error('Não encontrei esse endereço (DNS).'); }
    if (!records.length || records.some(record => isPrivateAddress(record.address))) throw new Error('O endereço aponta para uma rede privada e não é aceito.');
  }
  return url.toString().replace(/\/+$/, '');
}
