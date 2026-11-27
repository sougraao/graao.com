// Login OAuth e publicação de cada rede do Social Planner, com o fetch das redes simulado (nenhum acesso real).
import test from 'node:test';
import assert from 'node:assert/strict';
import { authUrl, availability, blueskyLogin, exchange, publish, useFetch } from '../social-providers.mjs';

const KEYS = {
  META_APP_ID: 'meta-id', META_APP_SECRET: 'meta-secret', THREADS_APP_ID: 'th-id', THREADS_APP_SECRET: 'th-secret',
  LINKEDIN_CLIENT_ID: 'li-id', LINKEDIN_CLIENT_SECRET: 'li-secret', TIKTOK_CLIENT_KEY: 'tt-id', TIKTOK_CLIENT_SECRET: 'tt-secret',
  PINTEREST_APP_ID: 'pin-id', PINTEREST_APP_SECRET: 'pin-secret', GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret',
  SOCIAL_POLL_MS: '0', SOCIAL_POLL_TRIES: '', META_LOGIN_CONFIG_ID: '', TIKTOK_PRIVACY: '', YOUTUBE_PRIVACY: ''
};
function withKeys(t, values = KEYS) {
  const saved = Object.fromEntries(Object.keys(KEYS).map(k => [k, process.env[k]]));
  for (const [k, v] of Object.entries(values)) { if (v) process.env[k] = v; else delete process.env[k]; }
  t.after(() => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
}

const reply = (body, status = 200, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
// Rotas: lista de [regex sobre "MÉTODO host/caminho", resposta ou função]. A primeira que casa responde.
function network(t, routes) {
  const calls = [];
  useFetch(async (url, init = {}) => {
    const u = new URL(url), method = init.method || 'GET';
    const body = typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body)
      : init.body instanceof URLSearchParams ? Object.fromEntries(init.body) : init.body;
    const call = { method, url: u, key: `${method} ${u.host}${u.pathname}`, body, headers: init.headers || {} };
    calls.push(call);
    const hit = routes.find(([pattern]) => pattern.test(call.key));
    if (!hit) return reply({ error: { message: `rota inesperada ${call.key}` } }, 500);
    return typeof hit[1] === 'function' ? hit[1](call, calls) : reply(hit[1]);
  });
  t.after(() => useFetch((...a) => fetch(...a)));
  return calls;
}
const find = (calls, pattern) => calls.filter(c => pattern.test(c.key));
const image = (url = 'https://cdn.example/i.jpg') => ({ type: 'image', url, mime: 'image/jpeg', bytes: async () => Buffer.from('jpg') });
const video = (url = 'https://cdn.example/v.mp4') => ({ type: 'video', url, mime: 'video/mp4', bytes: async () => Buffer.from('mp4') });

// ---- OAuth ------------------------------------------------------------------------------------

test('availability e authUrl: só redes com as duas chaves; Bluesky sempre', t => {
  withKeys(t, { ...KEYS, PINTEREST_APP_SECRET: '' });
  const on = availability();
  assert.equal(on.facebook, true);
  assert.equal(on.pinterest, false);
  assert.equal(on.bluesky, true);
  assert.throws(() => authUrl('pinterest', { redirectUri: 'https://x/cb', state: 's' }), err => err.status === 409);
  assert.throws(() => authUrl('bluesky', { redirectUri: 'https://x/cb', state: 's' }), err => err.status === 400);

  const urls = Object.fromEntries(['facebook', 'threads', 'linkedin', 'tiktok', 'youtube', 'gbp'].map(p => [p, new URL(authUrl(p, { redirectUri: 'https://graao.com/cb', state: 'st' }))]));
  assert.equal(urls.facebook.searchParams.get('client_id'), 'meta-id');
  assert.match(urls.facebook.searchParams.get('scope'), /instagram_content_publish/);
  assert.equal(urls.threads.searchParams.get('client_id'), 'th-id');
  assert.equal(urls.linkedin.searchParams.get('scope'), 'openid profile w_member_social');
  assert.equal(urls.tiktok.searchParams.get('client_key'), 'tt-id');
  assert.equal(urls.youtube.searchParams.get('access_type'), 'offline');
  assert.match(urls.gbp.searchParams.get('scope'), /business\.manage/);
  for (const u of Object.values(urls)) assert.equal(u.searchParams.get('state'), 'st');

  process.env.META_LOGIN_CONFIG_ID = 'cfg-1';
  const configured = new URL(authUrl('instagram', { redirectUri: 'https://x/cb', state: 's' }));
  assert.equal(configured.searchParams.get('config_id'), 'cfg-1');
  assert.equal(configured.searchParams.get('scope'), null, 'com config_id o escopo vem da configuração do app');
});

test('Facebook: troca o código, estende o token e lista páginas com o Instagram vinculado', async t => {
  withKeys(t);
  const calls = network(t, [
    [/oauth\/access_token$/, call => reply({ access_token: call.url.searchParams.get('grant_type') ? 'long' : 'short' })],
    [/me\/accounts$/, { data: [
      { id: 'p1', name: 'Padaria', access_token: 'page-token', picture: { data: { url: 'https://img/p1' } }, instagram_business_account: { id: 'ig1', username: 'padaria' } },
      { id: 'p2', name: 'Sem Insta', access_token: 'page2' }
    ] }]
  ]);
  const found = await exchange('facebook', { code: 'c0de', redirectUri: 'https://x/cb' });
  assert.deepEqual(found.map(a => [a.provider, a.externalId, a.name]), [['facebook', 'p1', 'Padaria'], ['instagram', 'ig1', 'padaria'], ['facebook', 'p2', 'Sem Insta']]);
  assert.equal(found[1].handle, '@padaria');
  assert.deepEqual(found[1].secret, { token: 'page-token', pageId: 'p1' });
  assert.equal(find(calls, /me\/accounts/)[0].headers.Authorization, 'Bearer long');
  assert.equal(find(calls, /access_token/)[1].url.searchParams.get('fb_exchange_token'), 'short');
});

test('exchange sem contas encontradas responde 404; rede desconhecida responde 400', async t => {
  withKeys(t);
  network(t, [[/oauth\/access_token$/, { access_token: 'x' }], [/me\/accounts$/, { data: [] }]]);
  await assert.rejects(exchange('facebook', { code: 'c', redirectUri: 'r' }), err => err.status === 404);
  await assert.rejects(exchange('orkut', {}), err => err.status === 400);
});

test('Threads, LinkedIn e TikTok: troca de código e dados do perfil', async t => {
  withKeys(t);
  const calls = network(t, [
    [/POST graph\.threads\.net\/oauth\/access_token/, { access_token: 'th-short' }],
    [/GET graph\.threads\.net\/access_token/, { access_token: 'th-long', expires_in: 100 }],
    [/graph\.threads\.net\/v1\.0\/me/, { id: 'th-1', username: 'loja' }],
    [/linkedin\.com\/oauth\/v2\/accessToken/, { access_token: 'li-token', refresh_token: 'li-refresh', expires_in: 60 }],
    [/api\.linkedin\.com\/v2\/userinfo/, { sub: 'li-sub', name: 'Ana Lima', picture: 'https://img/ana' }],
    [/open\.tiktokapis\.com\/v2\/oauth\/token/, { access_token: 'tt-token', refresh_token: 'tt-refresh', open_id: 'tt-open', expires_in: 86400 }],
    [/open\.tiktokapis\.com\/v2\/user\/info/, { data: { user: { display_name: 'Loja no TikTok', avatar_url: 'https://img/tt' } } }]
  ]);
  const [threads] = await exchange('threads', { code: 'c', redirectUri: 'https://x/cb' });
  assert.deepEqual([threads.externalId, threads.name, threads.handle, threads.secret.token], ['th-1', 'loja', '@loja', 'th-long']);
  assert.ok(threads.secret.expiresAt > Date.now() && threads.secret.expiresAt <= Date.now() + 100_000);
  assert.equal(find(calls, /POST graph\.threads\.net\/oauth/)[0].body.client_secret, 'th-secret');

  const [li] = await exchange('linkedin', { code: 'c', redirectUri: 'https://x/cb' });
  assert.deepEqual([li.externalId, li.name, li.secret.refresh], ['li-sub', 'Ana Lima', 'li-refresh']);

  const [tt] = await exchange('tiktok', { code: 'c', redirectUri: 'https://x/cb' });
  assert.deepEqual([tt.externalId, tt.name, tt.secret.refresh], ['tt-open', 'Loja no TikTok', 'tt-refresh']);
});

test('Pinterest, YouTube e Perfil da Empresa: cada pasta, canal ou local vira uma conta', async t => {
  withKeys(t);
  const calls = network(t, [
    [/api\.pinterest\.com\/v5\/oauth\/token/, { access_token: 'pin-token', refresh_token: 'pin-refresh' }],
    [/api\.pinterest\.com\/v5\/user_account/, { username: 'lojapins', profile_image: 'https://img/pin' }],
    [/api\.pinterest\.com\/v5\/boards/, { items: [{ id: 'b1', name: 'Bolos' }, { id: 'b2', name: 'Pães' }] }],
    [/oauth2\.googleapis\.com\/token/, { access_token: 'g-token', refresh_token: 'g-refresh', expires_in: 3600 }],
    [/youtube\/v3\/channels/, { items: [{ id: 'yt1', snippet: { title: 'Canal da Loja', customUrl: '@canal', thumbnails: { default: { url: 'https://img/yt' } } } }] }],
    [/mybusinessaccountmanagement.*accounts$/, { accounts: [{ name: 'accounts/1', accountName: 'Loja SA' }] }],
    [/mybusinessbusinessinformation.*locations/, { locations: [{ name: 'locations/9', title: 'Loja Centro' }] }]
  ]);
  const boards = await exchange('pinterest', { code: 'c', redirectUri: 'r' });
  assert.deepEqual(boards.map(b => [b.externalId, b.name, b.handle]), [['b1', 'Bolos', '@lojapins'], ['b2', 'Pães', '@lojapins']]);
  const basic = find(calls, /pinterest\.com\/v5\/oauth\/token/)[0].headers.Authorization;
  assert.equal(basic, `Basic ${Buffer.from('pin-id:pin-secret').toString('base64')}`);

  const [yt] = await exchange('youtube', { code: 'c', redirectUri: 'r' });
  assert.deepEqual([yt.externalId, yt.name, yt.handle, yt.secret.refresh], ['yt1', 'Canal da Loja', '@canal', 'g-refresh']);

  const [gbp] = await exchange('gbp', { code: 'c', redirectUri: 'r' });
  assert.deepEqual([gbp.externalId, gbp.name, gbp.handle], ['accounts/1/locations/9', 'Loja Centro', 'Loja SA']);
});

test('Bluesky: valida a senha de app, entra e tolera falta do perfil', async t => {
  network(t, [
    [/createSession$/, { did: 'did:plc:me', handle: 'loja.bsky.social', accessJwt: 'a', refreshJwt: 'r' }],
    [/getProfile/, () => reply({ error: 'x', message: 'sem perfil' }, 500)]
  ]);
  await assert.rejects(blueskyLogin('loja', 'senha-comum'), err => err.status === 400);
  await assert.rejects(blueskyLogin('', 'abcd-efgh-ijkl-mnop'), err => err.status === 400);
  const [acc] = await blueskyLogin('@loja.bsky.social', 'abcd-efgh-ijkl-mnop');
  assert.deepEqual([acc.externalId, acc.name, acc.handle, acc.secret.identifier], ['did:plc:me', 'loja.bsky.social', '@loja.bsky.social', 'loja.bsky.social']);
});

// ---- Renovação do acesso antes de publicar ----------------------------------------------------

test('publish renova o token que vence em 5 minutos e devolve o segredo novo', async t => {
  withKeys(t);
  network(t, [
    [/linkedin\.com\/oauth\/v2\/accessToken/, call => reply({ access_token: 'li-new', expires_in: 3600, ...(call.body.refresh_token === 'r-old' ? {} : { refresh_token: 'x' }) })],
    [/rest\/posts$/, () => reply({}, 201, { 'x-restli-id': 'urn:li:share:1' })],
    [/graph\.threads\.net\/refresh_access_token/, { access_token: 'th-new' }],
    [/POST graph\.threads\.net\/v1\.0\/me\/threads$/, { id: 'c1' }],
    [/graph\.threads\.net\/v1\.0\/c1/, { status: 'FINISHED' }],
    [/threads_publish$/, { id: 'post1' }],
    [/graph\.threads\.net\/v1\.0\/post1/, () => reply({ error: { message: 'sem permalink' } }, 400)],
    [/open\.tiktokapis\.com\/v2\/oauth\/token/, { access_token: 'tt-new', refresh_token: 'tt-r2', expires_in: 60 }],
    [/creator_info/, { data: { privacy_level_options: ['SELF_ONLY'] } }],
    [/content\/init/, { data: { publish_id: 'pub-1' } }],
    [/pinterest\.com\/v5\/oauth\/token/, { access_token: 'pin-new' }],
    [/v5\/pins$/, { id: 'pin1' }],
    [/oauth2\.googleapis\.com\/token/, { access_token: 'g-new', expires_in: 3600 }],
    [/localPosts$/, { name: 'accounts/1/locations/9/localPosts/7', searchUrl: 'https://g.page/post' }]
  ]);
  const soon = Date.now() + 60_000;

  const li = await publish({ provider: 'linkedin', externalId: 'sub' }, { token: 'old', refresh: 'r-old', expiresAt: soon }, { summary: 'Oi' }, []);
  assert.equal(li.secret.token, 'li-new');
  assert.equal(li.secret.refresh, 'r-old', 'mantém o refresh token quando a rede não manda outro');
  await assert.rejects(publish({ provider: 'linkedin', externalId: 'sub' }, { token: 'old', expiresAt: soon }, { summary: 'Oi' }, []), err => err.status === 401);

  const th = await publish({ provider: 'threads', externalId: 'me' }, { token: 'old', expiresAt: soon }, { summary: 'Oi' }, []);
  assert.deepEqual([th.secret.token, th.url], ['th-new', ''], 'sem permalink o link fica vazio');

  const tt = await publish({ provider: 'tiktok', externalId: 'x' }, { token: 'old', refresh: 'r', expiresAt: soon }, { summary: 'Foto' }, [image()]);
  assert.deepEqual([tt.secret.token, tt.secret.refresh, tt.externalId], ['tt-new', 'tt-r2', 'pub-1']);

  const pin = await publish({ provider: 'pinterest', externalId: 'b1' }, { token: 'old', refresh: 'pr', expiresAt: soon }, { summary: 'Bolo' }, [image()]);
  assert.deepEqual([pin.secret.token, pin.secret.refresh], ['pin-new', 'pr']);

  const gbp = await publish({ provider: 'gbp', externalId: 'accounts/1/locations/9' }, { token: 'old', refresh: 'gr', expiresAt: soon }, { summary: 'Novidade' }, []);
  assert.equal(gbp.secret.token, 'g-new');
  await assert.rejects(publish({ provider: 'gbp', externalId: 'x' }, { token: 'old', expiresAt: soon }, { summary: 'x' }, []), err => err.status === 401 && /Google/.test(err.message));
  await assert.rejects(publish({ provider: 'gbp', externalId: 'x' }, null, { summary: 'x' }, []), err => err.status === 401);
});

// ---- Publicação por rede ----------------------------------------------------------------------

test('Facebook publica texto, foto, álbum, vídeo, reel e stories pelos caminhos certos', async t => {
  withKeys(t);
  let n = 0;
  const calls = network(t, [
    [/\/(video_reels|video_stories)$/, call => reply(call.body.upload_phase === 'start' ? { video_id: 'v9' } : { success: true, post_id: 'story-v' })],
    [/rupload\.facebook\.com/, { success: true }],
    [/\/photo_stories$/, { post_id: 'story-p' }],
    [/\/photos$/, () => reply({ id: `ph${++n}`, post_id: `post-ph${n}` })],
    [/\/videos$/, { id: 'vid1' }],
    [/\/feed$/, { id: 'feed1' }],
    [/\/comments$/, () => reply({ error: { message: 'comentário bloqueado' } }, 400)]
  ]);
  const page = { provider: 'facebook', externalId: 'p1' }, s = { token: 'pt' };

  const text = await publish(page, s, { summary: 'Oi', link: 'https://loja.example', firstComment: 'Cupom', type: 'post' }, []);
  assert.deepEqual([text.externalId, text.url], ['feed1', 'https://www.facebook.com/feed1']);
  assert.equal(find(calls, /\/feed$/)[0].body.link, 'https://loja.example');
  assert.equal(find(calls, /comments$/).length, 1, 'o primeiro comentário é tentado e a falha não derruba o post');

  assert.equal((await publish(page, s, { summary: 'Foto' }, [image()])).externalId, 'post-ph1');
  calls.length = 0;
  await publish(page, s, { summary: 'Álbum' }, [image('https://cdn/a.jpg'), image('https://cdn/b.jpg')]);
  assert.deepEqual(find(calls, /\/feed$/)[0].body.attached_media, [{ media_fbid: 'ph2' }, { media_fbid: 'ph3' }]);
  assert.ok(find(calls, /\/photos$/).every(c => c.body.published === false));

  assert.equal((await publish(page, s, { summary: 'Vídeo' }, [video()])).externalId, 'vid1');
  calls.length = 0;
  assert.equal((await publish(page, s, { summary: 'Reel', type: 'reel' }, [video()])).externalId, 'v9');
  assert.equal(find(calls, /rupload/)[0].headers.Authorization, 'OAuth pt');
  assert.equal(find(calls, /rupload/)[0].headers.file_url, 'https://cdn.example/v.mp4');
  await assert.rejects(publish(page, s, { summary: 'Reel', type: 'reel' }, [image()]), /Reels do Facebook precisam de um vídeo/);

  assert.equal((await publish(page, s, { summary: '', type: 'story' }, [video()])).externalId, 'story-v');
  assert.equal((await publish(page, s, { summary: '', type: 'story' }, [image()])).externalId, 'story-p');
  await assert.rejects(publish(page, s, { summary: '', type: 'story' }, []), /Stories precisam de mídia/);
});

test('Instagram: imagem, vídeo com espera, carrossel, story e mídia que falha no processamento', async t => {
  withKeys(t);
  let container = 0, polls = 0;
  const calls = network(t, [
    [/POST .*\/ig1\/media$/, () => reply({ id: `ct${++container}` })],
    [/GET .*\/ct\d+$/, call => reply({ status_code: call.url.pathname.endsWith('ct-bad') ? 'ERROR' : (++polls % 2 ? 'IN_PROGRESS' : 'FINISHED') })],
    [/media_publish$/, call => reply({ id: `m-${call.body.creation_id}` })],
    [/\/comments$/, { id: 'cm' }],
    [/GET .*\/m-ct\d+$/, call => reply({ permalink: `https://instagram.com/p/${call.url.pathname.split('/').pop()}` })]
  ]);
  const ig = { provider: 'instagram', externalId: 'ig1' }, s = { token: 'pt', pageId: 'p1' };

  await assert.rejects(publish(ig, s, { summary: 'Sem mídia' }, []), /precisa de uma imagem ou vídeo/);

  const one = await publish(ig, s, { summary: 'Legenda', firstComment: '#tags' }, [image()]);
  assert.deepEqual([one.externalId, one.url], ['m-ct1', 'https://instagram.com/p/m-ct1']);
  assert.equal(find(calls, /ig1\/media$/)[0].body.caption, 'Legenda');
  assert.equal(find(calls, /comments$/)[0].body.message, '#tags');

  calls.length = 0;
  await publish(ig, s, { summary: 'Reel' }, [video()]);
  assert.deepEqual([find(calls, /ig1\/media$/)[0].body.media_type, find(calls, /GET .*\/ct2$/).length], ['REELS', 2], 'espera o vídeo ficar pronto');

  calls.length = 0;
  await publish(ig, s, { summary: 'Carrossel' }, [image('https://cdn/1.jpg'), video('https://cdn/2.mp4')]);
  const posts = find(calls, /ig1\/media$/).map(c => c.body);
  assert.deepEqual(posts.slice(0, 2).map(b => [b.is_carousel_item, b.media_type || 'IMAGE']), [[true, 'IMAGE'], [true, 'VIDEO']]);
  assert.deepEqual([posts[2].media_type, posts[2].children, posts[2].caption], ['CAROUSEL', 'ct3,ct4', 'Carrossel']);

  calls.length = 0;
  await publish(ig, s, { summary: 'Story', type: 'story', firstComment: 'não vai' }, [image(), image()]);
  assert.deepEqual(find(calls, /ig1\/media$/).map(c => [c.body.media_type, c.body.caption]), [['STORIES', undefined]], 'story usa só a primeira mídia e não leva legenda');
  assert.equal(find(calls, /comments$/).length, 0);
});

test('Instagram: vídeo com erro de processamento e demora além do limite', async t => {
  withKeys(t, { ...KEYS, SOCIAL_POLL_TRIES: '2' });
  let status = 'ERROR';
  network(t, [
    [/POST .*\/ig1\/media$/, { id: 'ct1' }],
    [/GET .*\/ct1$/, () => reply({ status_code: status })]
  ]);
  const ig = { provider: 'instagram', externalId: 'ig1' };
  await assert.rejects(publish(ig, { token: 't' }, { summary: 'x' }, [video()]), err => err.status === 502 && /processar a mídia/.test(err.message));
  status = 'IN_PROGRESS';
  await assert.rejects(publish(ig, { token: 't' }, { summary: 'x' }, [video()]), err => err.status === 504);
});

test('Threads: post com imagem e carrossel com filhos processados', async t => {
  withKeys(t);
  let n = 0;
  const calls = network(t, [
    [/POST .*\/me\/threads$/, () => reply({ id: `c${++n}` })],
    [/GET .*\/c\d+$/, { status: 'FINISHED' }],
    [/threads_publish$/, { id: 'post1' }],
    [/GET .*\/post1$/, { permalink: 'https://threads.net/p/1' }]
  ]);
  const acc = { provider: 'threads', externalId: 'me' };
  await publish(acc, { token: 't' }, { summary: 'Link', link: 'https://loja.example' }, []);
  assert.equal(find(calls, /me\/threads$/)[0].body.link_attachment, 'https://loja.example');
  calls.length = 0;
  await publish(acc, { token: 't' }, { summary: 'Uma foto' }, [image()]);
  assert.deepEqual(find(calls, /me\/threads$/)[0].body, { media_type: 'IMAGE', image_url: 'https://cdn.example/i.jpg', text: 'Uma foto' });
  calls.length = 0;
  const out = await publish(acc, { token: 't' }, { summary: 'Várias' }, [image(), video()]);
  const bodies = find(calls, /me\/threads$/).map(c => c.body);
  assert.deepEqual(bodies.map(b => b.media_type), ['IMAGE', 'VIDEO', 'CAROUSEL']);
  assert.equal(bodies[2].children, 'c3,c4', 'c1 e c2 foram os posts anteriores');
  assert.equal(out.url, 'https://threads.net/p/1');
});

test('LinkedIn: sobe as imagens, publica artigo de link e recusa vídeo', async t => {
  withKeys(t);
  let n = 0;
  const calls = network(t, [
    [/POST api\.linkedin\.com\/rest\/images$/, () => { n++; return reply({ value: { uploadUrl: `https://upload.linkedin.example/${n}`, image: `urn:li:image:${n}` } }); }],
    [/PUT upload\.linkedin\.example/, call => reply('', call.url.pathname === '/99' ? 500 : 201)],
    [/rest\/posts$/, () => reply({ id: 'urn:li:share:9' }, 201)]
  ]);
  const acc = { provider: 'linkedin', externalId: 'sub' };
  const single = await publish(acc, { token: 't' }, { summary: 'Texto (com) [símbolos] @e_mais' }, [image()]);
  assert.deepEqual([single.externalId, single.url], ['urn:li:share:9', 'https://www.linkedin.com/feed/update/urn:li:share:9']);
  const first = find(calls, /rest\/posts$/)[0].body;
  assert.deepEqual(first.content, { media: { id: 'urn:li:image:1' } });
  assert.equal(first.commentary, 'Texto \\(com\\) \\[símbolos\\] \\@e\\_mais', 'caracteres reservados do LinkedIn escapados');
  assert.equal(first.author, 'urn:li:person:sub');
  assert.equal(find(calls, /rest\/posts$/)[0].headers['LinkedIn-Version'], '202510');

  await publish(acc, { token: 't' }, { summary: 'Duas' }, [image(), image()]);
  assert.deepEqual(find(calls, /rest\/posts$/)[1].body.content, { multiImage: { images: [{ id: 'urn:li:image:2' }, { id: 'urn:li:image:3' }] } });

  await publish(acc, { token: 't' }, { summary: 'Título do artigo\nresto', link: 'https://loja.example/a' }, []);
  assert.deepEqual(find(calls, /rest\/posts$/)[2].body.content, { article: { source: 'https://loja.example/a', title: 'Título do artigo' } });

  await publish(acc, { token: 't' }, { summary: 'Só texto' }, []);
  assert.equal(find(calls, /rest\/posts$/)[3].body.content, undefined);

  await assert.rejects(publish(acc, { token: 't' }, { summary: 'Vídeo' }, [video()]), /Vídeos no LinkedIn/);
  n = 98;
  await assert.rejects(publish(acc, { token: 't' }, { summary: 'Falha' }, [image()]), err => err.status === 502 && /recusou o envio \(500\)/.test(err.message));
});

test('TikTok escolhe a privacidade permitida e publica vídeo ou fotos', async t => {
  withKeys(t, { ...KEYS, TIKTOK_PRIVACY: 'FOLLOWER_OF_CREATOR' });
  let options = ['SELF_ONLY', 'FOLLOWER_OF_CREATOR', 'PUBLIC_TO_EVERYONE'];
  const calls = network(t, [
    [/creator_info/, () => reply({ data: { privacy_level_options: options } })],
    [/video\/init/, { data: { publish_id: 'vid-pub' } }],
    [/content\/init/, { data: { publish_id: 'photo-pub' } }]
  ]);
  const acc = { provider: 'tiktok', externalId: 'x' };
  assert.equal((await publish(acc, { token: 't' }, { summary: 'Vídeo' }, [video()])).externalId, 'vid-pub');
  assert.equal(find(calls, /video\/init/)[0].body.post_info.privacy_level, 'FOLLOWER_OF_CREATOR');
  options = ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'];
  await publish(acc, { token: 't' }, { summary: 'Título\nDescrição longa' }, [image('https://cdn/1.jpg'), image('https://cdn/2.jpg')]);
  const photo = find(calls, /content\/init/)[0].body;
  assert.deepEqual([photo.post_info.privacy_level, photo.post_info.title, photo.source_info.photo_images], ['PUBLIC_TO_EVERYONE', 'Título', ['https://cdn/1.jpg', 'https://cdn/2.jpg']]);
  options = ['MUTUAL_FOLLOW_FRIENDS'];
  await publish(acc, { token: 't' }, { summary: 'x' }, [video()]);
  assert.equal(find(calls, /video\/init/)[1].body.post_info.privacy_level, 'MUTUAL_FOLLOW_FRIENDS');
});

test('YouTube faz o envio retomável; Perfil da Empresa e Pinterest validam a mídia', async t => {
  withKeys(t);
  const calls = network(t, [
    [/POST www\.googleapis\.com\/upload\/youtube/, () => reply('', 200, { location: 'https://upload.googleapis.example/session/1' })],
    [/PUT upload\.googleapis\.example/, { id: 'yt-video' }],
    [/localPosts$/, { name: 'lp/1' }],
    [/v5\/pins$/, { id: 'pin9' }]
  ]);
  const yt = await publish({ provider: 'youtube', externalId: 'yt1' }, { token: 't' }, { summary: 'Título do vídeo\nDescrição', tags: ['bolo'] }, [video()]);
  assert.deepEqual([yt.externalId, yt.url], ['yt-video', 'https://youtu.be/yt-video']);
  const start = find(calls, /upload\/youtube/)[0];
  assert.equal(start.headers['X-Upload-Content-Length'], '3');
  assert.deepEqual([start.body.snippet.title, start.body.snippet.tags, start.body.status.privacyStatus], ['Título do vídeo', ['bolo'], 'public']);
  await assert.rejects(publish({ provider: 'youtube', externalId: 'yt1' }, { token: 't' }, { summary: 'x' }, [image()]), /YouTube precisa de um vídeo/);

  const gbp = await publish({ provider: 'gbp', externalId: 'accounts/1/locations/9' }, { token: 't' }, { summary: 'Novidade', link: 'https://loja.example' }, [image()]);
  assert.deepEqual([gbp.externalId, gbp.url], ['lp/1', '']);
  const local = find(calls, /localPosts$/)[0];
  assert.match(local.url.pathname, /\/v4\/accounts\/1\/locations\/9\/localPosts$/);
  assert.deepEqual([local.body.media[0].sourceUrl, local.body.callToAction.url], ['https://cdn.example/i.jpg', 'https://loja.example']);

  const pin = await publish({ provider: 'pinterest', externalId: 'b1' }, { token: 't' }, { summary: 'Bolo de cenoura\ncom cobertura', link: 'https://loja.example' }, [image()]);
  assert.equal(pin.url, 'https://www.pinterest.com/pin/pin9/');
  assert.deepEqual([find(calls, /pins$/)[0].body.board_id, find(calls, /pins$/)[0].body.title], ['b1', 'Bolo de cenoura']);
  await assert.rejects(publish({ provider: 'pinterest', externalId: 'b1' }, { token: 't' }, { summary: 'x' }, [video()]), /Vídeos no Pinterest/);
  await assert.rejects(publish({ provider: 'pinterest', externalId: 'b1' }, { token: 't' }, { summary: 'x' }, []), /precisa de uma imagem/);
});

test('Bluesky: imagens com limite de tamanho e novo login quando a sessão expirou', async t => {
  withKeys(t);
  const calls = network(t, [
    [/refreshSession$/, () => reply({ error: 'ExpiredToken', message: 'expirada' }, 400)],
    [/createSession$/, { did: 'did:plc:me', handle: 'loja.bsky.social', accessJwt: 'novo', refreshJwt: 'r2' }],
    [/getProfile/, { displayName: 'Loja' }],
    [/uploadBlob$/, call => reply({ blob: { mime: call.headers['Content-Type'] } })],
    [/createRecord$/, { uri: 'at://did:plc:me/app.bsky.feed.post/abc', cid: 'c' }]
  ]);
  const acc = { provider: 'bluesky', externalId: 'did:plc:me' }, s = { token: 'velho', refresh: 'r1', identifier: 'loja.bsky.social', password: 'abcd-efgh-ijkl-mnop' };
  const out = await publish(acc, s, { summary: 'Fotos' }, [{ ...image(), alt: 'Bolo' }, { ...image(), mime: '' }]);
  assert.equal(out.secret.token, 'novo', 'refaz o login com a senha de app');
  assert.equal(out.url, 'https://bsky.app/profile/did:plc:me/post/abc');
  const embed = find(calls, /createRecord$/)[0].body.record.embed;
  assert.deepEqual(embed.images.map(i => [i.alt, i.image.mime]), [['Bolo', 'image/jpeg'], ['', 'image/jpeg']]);

  const big = { type: 'image', url: 'https://cdn/big.jpg', bytes: async () => Buffer.alloc(1_000_001) };
  await assert.rejects(publish(acc, s, { summary: 'x' }, [big]), /imagens de até 1 MB/);
  const huge = { type: 'video', url: 'https://cdn/big.mp4', bytes: async () => ({ length: 100_000_001 }) };
  await assert.rejects(publish(acc, s, { summary: 'x' }, [huge]), /vídeos de até 100 MB/);
});

test('Bluesky: cartão de link sem página HTML fica só com o endereço', async t => {
  const calls = network(t, [
    [/refreshSession$/, { accessJwt: 'a2', refreshJwt: 'r2' }],
    [/GET loja\.example\/arquivo\.pdf/, () => reply('%PDF', 200, { 'Content-Type': 'application/pdf' })],
    [/createRecord$/, { uri: 'at://did/app.bsky.feed.post/1', cid: 'c' }]
  ]);
  await publish({ provider: 'bluesky', externalId: 'did' }, { token: 'a', refresh: 'r' }, { summary: 'PDF', link: 'https://loja.example/arquivo.pdf' }, []);
  assert.deepEqual(find(calls, /createRecord$/)[0].body.record.embed.external, { uri: 'https://loja.example/arquivo.pdf', title: 'https://loja.example/arquivo.pdf', description: '' });
});

test('Erros das redes viram 502 com a mensagem da rede', async t => {
  withKeys(t);
  network(t, [
    [/me\/threads$/, () => reply({ error: { message: 'Token inválido', error_user_msg: 'Reconecte o Threads' } }, 400)],
    [/v5\/pins$/, () => reply('Serviço indisponível', 503)],
    [/localPosts$/, () => reply({ error: { code: 'PERMISSION_DENIED', message: '' } })]
  ]);
  await assert.rejects(publish({ provider: 'threads', externalId: 'me' }, { token: 't' }, { summary: 'x' }, []), err => err.status === 502 && err.message === 'Reconecte o Threads');
  await assert.rejects(publish({ provider: 'pinterest', externalId: 'b' }, { token: 't' }, { summary: 'x' }, [image()]), err => err.status === 502 && err.message === 'Serviço indisponível');
  await assert.rejects(publish({ provider: 'gbp', externalId: 'l' }, { token: 't' }, { summary: 'x' }, []), err => err.status === 502 && err.message === 'PERMISSION_DENIED');
});
