// White Label: o domínio das subcontas é validado, é de uma agência só, entra na hospedagem e faz o login
// mostrar a marca da agência. Antes ele era salvo como texto livre e o servidor nunca olhava para ele.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hostingDomains, requestHost, requireFreeDomain, whiteLabelBrand, whiteLabelHost } from '../white-label.mjs';
import { blankAgency, executeAgency } from '../agency-model.mjs';

const agencies = list => ({ findAgency: async filter => list.find(row => row.state.company.domain === filter.company.domain) || null });

test('The domain is cleaned up and checked', () => {
  assert.equal(whiteLabelHost(' https://App.Agencia.com.br/login?x=1 '), 'app.agencia.com.br');
  assert.equal(whiteLabelHost('app.agencia.com.br:443'), 'app.agencia.com.br');
  assert.equal(whiteLabelHost(''), '');
  assert.throws(() => whiteLabelHost('agencia'), /app\.suaagencia/);
  assert.throws(() => whiteLabelHost('app.graao.com'), /plataforma/);
  assert.throws(() => whiteLabelHost('x.vercel.app'), /plataforma/);
});

test('The agency settings keep the clean domain', () => {
  const agency = blankAgency();
  executeAgency(agency, { type: 'company', data: { name: 'Agência X', domain: 'HTTPS://app.agenciax.com.br/', timezone: 'America/Sao_Paulo', primary: '#123456' } });
  assert.equal(agency.company.domain, 'app.agenciax.com.br');
  assert.throws(() => executeAgency(agency, { type: 'company', data: { name: 'Agência X', domain: 'nada', timezone: 'America/Sao_Paulo' } }), /domínio/);
});

test('A domain belongs to one agency', async () => {
  const store = agencies([{ id: 'agency-a', state: { company: { domain: 'app.a.com.br', name: 'A' } } }]);
  await requireFreeDomain(store, 'app.a.com.br', 'agency-a');
  await requireFreeDomain(store, 'app.b.com.br', 'agency-b');
  await assert.rejects(requireFreeDomain(store, 'app.a.com.br', 'agency-b'), { status: 409 });
});

test('The login on the agency domain gets its name, logo and color; the platform address gets nothing', async () => {
  const store = agencies([{ id: 'agency-a', state: { company: { domain: 'app.a.com.br', name: 'Agência A', logo: 'data:image/png;base64,AAA', primary: '#FF0000' } } }]);
  assert.deepEqual(await whiteLabelBrand(store, 'app.a.com.br'), { name: 'Agência A', logo: 'data:image/png;base64,AAA', primary: '#FF0000' });
  assert.deepEqual(await whiteLabelBrand(store, 'graao.com'), {});
  assert.deepEqual(await whiteLabelBrand(store, 'outro.com.br'), {});
  assert.equal(requestHost({ headers: { 'x-forwarded-host': 'App.A.com.br:443', host: 'interno' } }), 'app.a.com.br');
});

test('With a hosting token the domain is added to the project and its DNS is read back', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push([init.method || 'GET', url.pathname, url.searchParams.get('teamId'), init.body || '']);
    if (url.pathname.endsWith('/config')) return { ok: true, status: 200, json: async () => ({ misconfigured: false }) };
    return { ok: true, status: 200, json: async () => ({ verified: true }) };
  };
  const hosting = hostingDomains({ token: 't', project: 'prj_1', team: 'team_1', fetch });
  assert.equal(await hosting.add('app.a.com.br'), true);
  assert.deepEqual(calls[0], ['POST', '/v10/projects/prj_1/domains', 'team_1', '{"name":"app.a.com.br"}']);
  const read = await hosting.status('app.a.com.br');
  assert.deepEqual({ ...read, records: undefined }, { domain: 'app.a.com.br', apex: 'a.com.br', cname: 'cname.vercel-dns.com', hosting: true, added: true, verified: true, pointing: true, verification: [], records: undefined, proxied: false });
  assert.deepEqual(read.records, [{ type: 'CNAME', name: 'app', value: 'cname.vercel-dns.com' }], 'sem apexName, a.com.br sai do próprio endereço');
  const off = hostingDomains({ token: '', project: '', fetch });
  assert.equal(await off.add('app.a.com.br'), false);
  assert.equal((await off.status('app.a.com.br')).hosting, false);
});

// Produção, 26/11: app.umcaracaramelo.com.br ficou em pending_domain_verification porque o domínio já estava em
// outra conta da Vercel. A Vercel pedia um TXT em _vercel que a tela nunca mostrava, e o endereço dava erro 525.
test('A domain waiting for ownership proof comes back with the TXT record, after asking the hosting to check again', async () => {
  const calls = [];
  const proof = { type: 'TXT', domain: '_vercel.umcaracaramelo.com.br', value: 'vc-domain-verify=app.umcaracaramelo.com.br,5cb1', reason: 'pending_domain_verification' };
  const fetch = async (url, init) => {
    calls.push([init.method || 'GET', url.pathname]);
    if (url.pathname.endsWith('/verify')) return { ok: false, status: 400, json: async () => ({ error: { code: 'missing_txt_record' } }) };
    if (url.pathname.endsWith('/config')) return { ok: true, status: 200, json: async () => ({ misconfigured: false, nameservers: ['seth.ns.cloudflare.com'], cnames: [], aValues: ['172.67.173.76'], recommendedIPv4: [{ rank: 1, value: ['216.198.79.1'] }], recommendedCNAME: [{ rank: 1, value: '6ccad80b.vercel-dns-017.com.' }] }) };
    return { ok: true, status: 200, json: async () => ({ verified: false, verification: [proof] }) };
  };
  const status = await hostingDomains({ token: 't', project: 'prj_1', fetch }).status('app.umcaracaramelo.com.br');
  assert.deepEqual(calls.find(([method]) => method === 'POST'), ['POST', '/v9/projects/prj_1/domains/app.umcaracaramelo.com.br/verify']);
  assert.equal(status.verified, false);
  assert.deepEqual(status.verification, [{ type: 'TXT', name: '_vercel.umcaracaramelo.com.br', value: 'vc-domain-verify=app.umcaracaramelo.com.br,5cb1' }]);
  assert.equal(status.cname, '6ccad80b.vercel-dns-017.com');
  assert.equal(status.proxied, true, 'Cloudflare em modo proxy (nuvem laranja) na frente da Vercel');
});

test('A verified domain asks nothing more, and a replaced domain leaves the project', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push([init.method || 'GET', url.pathname]);
    if (url.pathname.endsWith('/config')) return { ok: true, status: 200, json: async () => ({ misconfigured: false, cnames: ['cname.vercel-dns.com'], aValues: [] }) };
    if ((init.method || 'GET') === 'DELETE') return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ verified: true }) };
  };
  const hosting = hostingDomains({ token: 't', project: 'prj_1', fetch });
  const status = await hosting.status('app.a.com.br');
  assert.deepEqual(status.verification, []);
  assert.equal(status.proxied, false);
  assert.equal(calls.some(([method]) => method === 'POST'), false);
  assert.equal(await hosting.remove('umcaracaramelo.com.br'), true, 'já fora do projeto conta como removido');
  assert.deepEqual(calls.at(-1), ['DELETE', '/v9/projects/prj_1/domains/umcaracaramelo.com.br']);
  assert.equal(await hostingDomains({ token: '', project: '', fetch }).remove('x.com.br'), false);
});

test('The login page asks for the brand and the agency screen explains the CNAME', async () => {
  const { readFile } = await import('node:fs/promises');
  assert.match(await readFile(new URL('../ui/login.js', import.meta.url), 'utf8'), /fetch\('\/api\/marca'\)/);
  const agency = await readFile(new URL('../ui/agency.js', import.meta.url), 'utf8');
  assert.match(agency, /cname\.vercel-dns\.com/);
  assert.match(agency, /\/api\/agency\/domain-status/);
});

// Produção, 26/11: a agência salvou umcaracaramelo.com.br, depois app.umcaracaramelo.com.br, e os dois ficaram no projeto.
test('Saving another domain adds the new one and takes the old one off the hosting; clearing it takes it off too', async t => {
  const { makeServer } = await import('../server.mjs');
  const { createSqliteStore } = await import('../storage.mjs');
  const log = [];
  const hosting = { configured: true, add: async host => { log.push(['add', host]); return true; }, remove: async host => { log.push(['remove', host]); return true; }, status: async () => ({}) };
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store: createSqliteStore(':memory:'), port: 0, hosting });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const save = domain => fetch(`http://${host}:${server.address().port}/api/agency/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'company', data: { name: 'Um Cara Caramelo', timezone: 'America/Sao_Paulo', primary: '#ff4f9a', secondary: '#c4a7ff', domain } }) }).then(r => r.status);
  assert.equal(await save('umcaracaramelo.com.br'), 200);
  assert.equal(await save('app.umcaracaramelo.com.br'), 200);
  assert.equal(await save('app.umcaracaramelo.com.br'), 200);
  assert.equal(await save(''), 200);
  assert.deepEqual(log, [['add', 'umcaracaramelo.com.br'], ['add', 'app.umcaracaramelo.com.br'], ['remove', 'umcaracaramelo.com.br'], ['remove', 'app.umcaracaramelo.com.br']]);
});

// Desde o PR 188 a raiz é a página inicial do graao; no domínio da agência ela abria a marca da plataforma.
test('The root of an agency domain opens its branded login; graao.com keeps the home page', async t => {
  const http = await import('node:http');
  const { makeServer } = await import('../server.mjs');
  const { createSqliteStore } = await import('../storage.mjs');
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store: createSqliteStore(':memory:'), port: 0, hosting: { add: async () => true, remove: async () => true, status: async () => ({}) } });
  await new Promise(resolve => server.listen(0, host, resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const get = (path, hostHeader) => new Promise((resolve, reject) => http.get({ host, port, path, headers: { 'x-forwarded-host': hostHeader } }, res => { res.resume(); resolve([res.statusCode, res.headers.location || '']); }).on('error', reject));
  const saved = await fetch(`http://${host}:${port}/api/agency/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'company', data: { name: 'Agência Um', timezone: 'America/Sao_Paulo', primary: '#ff4f9a', secondary: '#c4a7ff', domain: 'app.agencia.com.br' } }) });
  assert.equal(saved.status, 200);
  assert.deepEqual(await get('/?utm_source=x', 'app.agencia.com.br'), [303, '/login?utm_source=x']);
  assert.deepEqual(await get('/', 'graao.com'), [200, '']);
  assert.deepEqual(await get('/', 'outro.com.br'), [200, ''], 'um domínio que não é de agência segue com a página do graao');
});

// Produção, 26/11: graao.com (sem subdomínio, DNS na Squarespace). A tela pedia um CNAME em "graao.com" e um TXT
// em "_vercel.graao.com"; a Squarespace completa o nome sozinha e criou graao.com.graao.com e
// _vercel.graao.com.graao.com. Domínio sem subdomínio também não aceita CNAME: a Vercel pede um registro A.
test('The records come with the short name the DNS panel expects, and a domain without subdomain gets an A record', async () => {
  const proof = [{ type: 'TXT', domain: '_vercel.graao.com', value: 'vc-domain-verify=graao.com,7800', reason: 'pending_domain_verification' }];
  const hosting = apexName => hostingDomains({ token: 't', project: 'prj_1', fetch: async (url, init) => {
    if (url.pathname.endsWith('/verify')) return { ok: false, status: 400, json: async () => ({}) };
    if (url.pathname.endsWith('/config')) return { ok: true, status: 200, json: async () => ({ misconfigured: true, recommendedIPv4: [{ rank: 2, value: ['76.76.21.21'] }, { rank: 1, value: ['216.198.79.1', '64.29.17.1'] }], recommendedCNAME: [{ rank: 1, value: '6ccad80b.vercel-dns-017.com.' }] }) };
    return { ok: true, status: 200, json: async () => ({ apexName, verified: false, verification: proof }) };
  } });
  const apex = await hosting('graao.com').status('graao.com');
  assert.deepEqual(apex.records, [
    { type: 'A', name: '@', value: '216.198.79.1' },
    { type: 'TXT', name: '_vercel', value: 'vc-domain-verify=graao.com,7800' }
  ]);
  assert.equal(apex.apex, 'graao.com');
  const sub = await hosting('graao.com').status('app.graao.com');
  assert.deepEqual(sub.records, [
    { type: 'CNAME', name: 'app', value: '6ccad80b.vercel-dns-017.com' },
    { type: 'TXT', name: '_vercel', value: 'vc-domain-verify=graao.com,7800' }
  ]);
});
