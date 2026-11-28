// Cloudflare R2 (S3-compatible API) without dependencies: AWS Signature V4 for server-side calls and
// presigned URLs, so browsers upload and download straight from the bucket (the app never relays the
// bytes, which keeps large files clear of the 4.5 MB request limit of the hosting functions).
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const R2_MAX_BYTES = 50 * 1024 * 1024;

const sha256 = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const rfc3986 = value => encodeURIComponent(value).replace(/[!'()*]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
export const encodeKey = key => String(key).split('/').map(rfc3986).join('/');
const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const canonicalQuery = query => Object.entries(query).map(([k, v]) => [rfc3986(k), rfc3986(String(v))])
  .sort(([a, x], [b, y]) => a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0).map(([k, v]) => `${k}=${v}`).join('&');

function signature({ secretAccessKey, region, service, date, method, path, query, headers, payloadHash }) {
  const amzDate = stamp(date), day = amzDate.slice(0, 8), scope = `${day}/${region}/${service}/aws4_request`;
  const names = Object.keys(headers).map(name => name.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const signedHeaders = names.join(';');
  const request = [method, path, canonicalQuery(query), names.map(name => `${name}:${lower[name]}\n`).join(''), signedHeaders, payloadHash].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(request)].join('\n');
  const key = [day, region, service, 'aws4_request'].reduce((k, part) => hmac(k, part), `AWS4${secretAccessKey}`);
  return { amzDate, scope, signedHeaders, signature: createHmac('sha256', key).update(toSign).digest('hex') };
}

// Headers for a request signed in the Authorization header (server-side calls).
export function signHeaders({ accessKeyId, secretAccessKey, region = 'auto', service = 's3', date = new Date(), method, host, path, query = {}, headers = {}, payloadHash }) {
  const all = { ...headers, host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': stamp(date) };
  const signed = signature({ secretAccessKey, region, service, date, method, path, query, headers: all, payloadHash });
  const { host: _host, ...sent } = all;
  return { ...sent, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${signed.scope}, SignedHeaders=${signed.signedHeaders}, Signature=${signed.signature}` };
}

// A presigned URL: the signature travels in the query string, so a browser can use it as is.
export function presignUrl({ accessKeyId, secretAccessKey, region = 'auto', service = 's3', date = new Date(), method, host, path, query = {}, headers = {}, expires = 900 }) {
  const amzDate = stamp(date), scope = `${amzDate.slice(0, 8)}/${region}/${service}/aws4_request`;
  const all = { host, ...headers };
  const signedHeaders = Object.keys(all).map(name => name.toLowerCase()).sort().join(';');
  const params = { ...query, 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${accessKeyId}/${scope}`, 'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires), 'X-Amz-SignedHeaders': signedHeaders };
  const signed = signature({ secretAccessKey, region, service, date, method, path, query: params, headers: all, payloadHash: 'UNSIGNED-PAYLOAD' });
  return `https://${host}${path}?${canonicalQuery({ ...params, 'X-Amz-Signature': signed.signature })}`;
}

const fail = (message, status = 500) => Object.assign(new Error(message), { status });

export function createR2({ accountId, accessKeyId, secretAccessKey, bucket, jurisdiction = '', request = fetch, clock = () => new Date() }) {
  if (!/^[a-f0-9]{32}$/.test(accountId || '')) throw new Error('R2_ACCOUNT_ID must be the 32-character Cloudflare account id.');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket || '')) throw new Error('R2_BUCKET must be a valid bucket name.');
  if (!accessKeyId || !secretAccessKey) throw new Error('Set R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.');
  if (jurisdiction && !/^(eu|fedramp)$/.test(jurisdiction)) throw new Error('R2_JURISDICTION must be eu or fedramp.');
  const host = `${accountId}${jurisdiction ? `.${jurisdiction}` : ''}.r2.cloudflarestorage.com`;
  const credentials = { accessKeyId, secretAccessKey, host };
  const pathOf = key => `/${bucket}/${encodeKey(key)}`;

  async function call(method, path, { query = {}, headers = {}, body } = {}) {
    const payloadHash = body ? sha256(body) : sha256('');
    const signed = signHeaders({ ...credentials, date: clock(), method, path, query, headers, payloadHash });
    const search = Object.keys(query).length ? `?${canonicalQuery(query)}` : '';
    try {
      return await request(`https://${host}${path}${search}`, { method, headers: signed, body, redirect: 'error', signal: AbortSignal.timeout(60000) });
    } catch {
      throw fail('Não foi possível falar com o armazenamento R2.', 502);
    }
  }

  return {
    bucket,
    async put(key, body, contentType) {
      const response = await call('PUT', pathOf(key), { body, headers: { 'content-type': contentType } });
      if (!response.ok) throw fail(`O R2 recusou o arquivo (${response.status}).`, 502);
    },
    async head(key) {
      const response = await call('HEAD', pathOf(key));
      if (response.status === 404) return null;
      if (!response.ok) throw fail(`O R2 não respondeu sobre o arquivo (${response.status}).`, 502);
      return { size: Number(response.headers.get('content-length')), type: String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() };
    },
    /** Os primeiros `bytes` do objeto (para conferir o tipo pelo conteúdo); null quando não existe. */
    async start(key, bytes = 16) {
      const response = await call('GET', pathOf(key), { headers: { range: `bytes=0-${bytes - 1}` } });
      if (response.status === 404) return null;
      if (!response.ok) throw fail(`O R2 não respondeu sobre o arquivo (${response.status}).`, 502);
      return Buffer.from(await response.arrayBuffer()).subarray(0, bytes);
    },
    async remove(key) {
      const response = await call('DELETE', pathOf(key));
      if (!response.ok && response.status !== 404) throw fail(`O R2 não apagou o arquivo (${response.status}).`, 502);
    },
    // Uma página das chaves que começam com `prefix` (ListObjectsV2); `next` continua a listagem.
    async list(prefix, next = '') {
      const response = await call('GET', `/${bucket}`, { query: { 'list-type': '2', prefix, ...(next && { 'continuation-token': next }) } });
      if (!response.ok) throw fail(`O R2 não listou os arquivos (${response.status}).`, 502);
      const xml = await response.text();
      const text = value => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
      const keys = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/g)].map(match => text(match[1]));
      const more = /<IsTruncated>true<\/IsTruncated>/.test(xml) && xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/);
      return { keys, next: more ? text(more[1]) : '' };
    },
    // Apaga tudo o que está numa pasta (`ws/<subconta>/`). Só aceita pasta com barra no fim, nunca o bucket inteiro.
    async removePrefix(prefix) {
      if (!/^[^/].*\/$/.test(String(prefix))) throw fail('Pasta do R2 inválida.', 400);
      // Lista de novo do começo a cada página apagada (a continuação de uma listagem não vale depois de apagar).
      let removed = 0, last = '';
      for (;;) {
        const { keys } = await this.list(prefix);
        if (!keys.length) return removed;
        if (keys[0] === last) throw fail('O R2 não apagou os arquivos da pasta.', 502);
        last = keys[0];
        for (const key of keys) { await this.remove(key); removed++; }
      }
    },
    // Lets the app's pages PUT straight into the bucket and read the files back.
    async setCors(origins) {
      const xml = `<CORSConfiguration>${origins.map(origin => `<CORSRule><AllowedOrigin>${origin}</AllowedOrigin><AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod><AllowedMethod>HEAD</AllowedMethod><AllowedHeader>content-type</AllowedHeader><ExposeHeader>etag</ExposeHeader><MaxAgeSeconds>3600</MaxAgeSeconds></CORSRule>`).join('')}</CORSConfiguration>`;
      const md5 = createHash('md5').update(xml).digest('base64');
      const response = await call('PUT', `/${bucket}`, { query: { cors: '' }, body: xml, headers: { 'content-type': 'application/xml', 'content-md5': md5 } });
      if (!response.ok) throw fail(`O R2 recusou a configuração de CORS (${response.status}): ${(await response.text()).slice(0, 300)}`, 502);
    },
    uploadUrl: (key, contentType, expires = 900) => presignUrl({ ...credentials, date: clock(), method: 'PUT', path: pathOf(key), headers: { 'content-type': contentType }, expires }),
    downloadUrl: (key, { expires = 3600, filename = '', type = '', attachment = false } = {}) => presignUrl({ ...credentials, date: clock(), method: 'GET', path: pathOf(key), expires,
      query: { ...(filename && { 'response-content-disposition': `${attachment ? 'attachment' : 'inline'}; filename*=UTF-8''${rfc3986(filename)}` }), ...(type && { 'response-content-type': type }) } }),
    // A pending upload travels to the browser and back as a signed ticket, so the server keeps no state.
    seal(ticket) {
      const body = Buffer.from(JSON.stringify(ticket)).toString('base64url');
      return `${body}.${createHmac('sha256', secretAccessKey).update(`r2-upload:${body}`).digest('base64url')}`;
    },
    open(token, now = Date.now()) {
      const [body, mac] = String(token || '').split('.');
      const expected = body ? createHmac('sha256', secretAccessKey).update(`r2-upload:${body}`).digest() : null;
      const given = Buffer.from(mac || '', 'base64url');
      if (!expected || given.length !== expected.length || !timingSafeEqual(given, expected)) throw fail('Envio inválido. Comece de novo.', 400);
      const ticket = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      if (!(ticket.exp > now)) throw fail('O envio expirou. Comece de novo.', 410);
      return ticket;
    }
  };
}

export function r2FromEnv(env = process.env, request = fetch) {
  const { R2_ACCOUNT_ID: accountId, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey, R2_BUCKET: bucket, R2_JURISDICTION: jurisdiction } = env;
  if (!accountId && !accessKeyId && !secretAccessKey && !bucket) return null;
  return createR2({ accountId, accessKeyId, secretAccessKey, bucket, jurisdiction, request });
}
