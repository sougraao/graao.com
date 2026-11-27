import test from 'node:test';
import assert from 'node:assert/strict';
import { createR2, encodeKey, presignUrl, r2FromEnv, signHeaders } from '../r2-storage.mjs';

// The published AWS Signature V4 examples (Amazon S3 API reference, "Signature calculations").
const aws = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1',
  date: new Date('2013-05-24T00:00:00Z'), host: 'examplebucket.s3.amazonaws.com' };

test('signs a header-authenticated request like the AWS example', () => {
  const headers = signHeaders({ ...aws, method: 'GET', path: '/test.txt', headers: { range: 'bytes=0-9' },
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' });
  assert.match(headers.Authorization, /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
});

test('presigns a URL like the AWS example', () => {
  const url = new URL(presignUrl({ ...aws, method: 'GET', path: '/test.txt', expires: 86400 }));
  assert.equal(url.searchParams.get('X-Amz-Signature'), 'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  assert.equal(url.searchParams.get('X-Amz-Credential'), 'AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request');
});

test('encodes object keys segment by segment', () => {
  assert.equal(encodeKey("ws/a b/foto (1)!.png"), 'ws/a%20b/foto%20%281%29%21.png');
});

const account = 'a'.repeat(32);
const fake = () => {
  const calls = [];
  const request = async (url, init) => {
    calls.push({ url, ...init });
    if (init.method === 'HEAD') return new Response(null, { status: url.includes('missing') ? 404 : 200, headers: { 'content-length': '1234', 'content-type': 'image/png' } });
    return new Response('', { status: 200 });
  };
  return { calls, r2: createR2({ accountId: account, accessKeyId: 'key', secretAccessKey: 'secret', bucket: 'graao-arquivos', request }) };
};

test('talks to the bucket on the account endpoint', async () => {
  const { calls, r2 } = fake();
  await r2.put('ws/one/files/x', Buffer.from('hello'), 'text/plain');
  assert.deepEqual(await r2.head('ws/one/files/x'), { size: 1234, type: 'image/png' });
  assert.equal(await r2.head('ws/one/files/missing'), null);
  await r2.remove('ws/one/files/x');
  assert.deepEqual(calls.map(call => `${call.method} ${call.url}`), [
    `PUT https://${account}.r2.cloudflarestorage.com/graao-arquivos/ws/one/files/x`,
    `HEAD https://${account}.r2.cloudflarestorage.com/graao-arquivos/ws/one/files/x`,
    `HEAD https://${account}.r2.cloudflarestorage.com/graao-arquivos/ws/one/files/missing`,
    `DELETE https://${account}.r2.cloudflarestorage.com/graao-arquivos/ws/one/files/x`]);
  assert.match(calls[0].headers.Authorization, /SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date/);
});

test('upload URLs bind the content type and download URLs can name the file', () => {
  const { r2 } = fake();
  const up = new URL(r2.uploadUrl('ws/one/files/x', 'video/mp4'));
  assert.equal(up.searchParams.get('X-Amz-SignedHeaders'), 'content-type;host');
  assert.equal(up.searchParams.get('X-Amz-Expires'), '900');
  const down = new URL(r2.downloadUrl('ws/one/files/x', { filename: 'Relatório final.pdf' }));
  assert.equal(down.searchParams.get('response-content-disposition'), "inline; filename*=UTF-8''Relat%C3%B3rio%20final.pdf");
});

test('upload tickets are tamper-proof and expire', () => {
  const { r2 } = fake();
  const token = r2.seal({ k: 'ws/one/files/x', w: 'one', exp: Date.now() + 1000 });
  assert.equal(r2.open(token).k, 'ws/one/files/x');
  const [body, mac] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ k: 'ws/two/files/x', w: 'two', exp: Date.now() + 1000 })).toString('base64url');
  assert.throws(() => r2.open(`${forged}.${mac}`), /inválido/);
  assert.throws(() => r2.open(`${body}.`), /inválido/);
  assert.throws(() => r2.open(token, Date.now() + 5000), /expirou/);
});

test('configuration comes from the environment and fails loudly when partial', () => {
  assert.equal(r2FromEnv({}), null);
  assert.throws(() => r2FromEnv({ R2_BUCKET: 'graao-arquivos' }), /R2_ACCOUNT_ID/);
  assert.equal(r2FromEnv({ R2_ACCOUNT_ID: account, R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_BUCKET: 'graao-arquivos' }).bucket, 'graao-arquivos');
});

test('lista uma pasta, decodifica as chaves e nunca apaga o bucket inteiro', async () => {
  const seen = [];
  const request = async (url, init) => {
    const address = new URL(url);
    seen.push(`${init.method} ${address.pathname}${address.search}`);
    return new Response('<ListBucketResult><Contents><Key>ws/a/files/x&amp;y</Key></Contents><IsTruncated>true</IsTruncated><NextContinuationToken>t&amp;1</NextContinuationToken></ListBucketResult>');
  };
  const r2 = createR2({ accountId: 'd'.repeat(32), accessKeyId: 'key', secretAccessKey: 'secret', bucket: 'graao-arquivos', request });
  assert.deepEqual(await r2.list('ws/a/'), { keys: ['ws/a/files/x&y'], next: 't&1' });
  assert.match(seen[0], /^GET \/graao-arquivos\?list-type=2&prefix=ws%2Fa%2F$/);
  for (const prefix of ['', 'ws', '/ws/a/', 'ws/a']) await assert.rejects(r2.removePrefix(prefix), { status: 400 }, prefix);
  assert.equal(seen.length, 1);
});
