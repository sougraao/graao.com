import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore, createSupabaseStore } from '../storage.mjs';
import { makeClientPortal } from '../client-portal.mjs';
import { blank } from '../model.mjs';

test('Client portal invites, single-use login and course permissions persist in separate Supabase documents', async t => {
  const rows = new Map(), deliveries = [];
  const store = createSupabaseStore({
    projectUrl: 'https://test.supabase.co', publishableKey: 'test', storageKey: 'a'.repeat(64),
    async request(url, options) {
      assert.equal(url.pathname, '/rest/v1/go_workspaces');
      const id = url.searchParams.get('id')?.slice(3);
      if (options.method === 'POST') {
        const record = JSON.parse(options.body);
        assert.ok(record.state.profile.name);
        if (rows.has(record.id)) return Response.json([]);
        rows.set(record.id, { ...record, name: record.state.profile.name, revision: 'initial' });
        return Response.json([{ id: record.id }]);
      }
      const row = rows.get(id);
      if (options.method === 'PATCH') {
        if (!row || url.searchParams.get('revision') !== `eq.${row.revision}`) return Response.json([]);
        rows.set(id, { ...row, ...JSON.parse(options.body) });
        return Response.json([{ id }]);
      }
      if (id) return Response.json(row ? [row] : []);
      return Response.json([...rows.values()]);
    }
  });
  const { server, host } = makeServer({
    store, auth: null, allowLocalAccess: true, port: 0, socialScheduler: false,
    portalOptions: { publicOrigin: 'https://graao.example', from: 'portal@graao.example', mailKey: 'example-key', async request(url, options) {
      assert.equal(url, 'https://api.resend.com/emails');
      assert.match(options.headers['Idempotency-Key'], /^portal-[a-f\d]{64}$/);
      deliveries.push(JSON.parse(options.body));
      return Response.json({ id: 'mail-id' });
    } }
  });
  await new Promise(resolve => server.listen(0,host,resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers) => {
    const response = await fetch(base + path, body === undefined ? { headers } :
      { method:'POST', headers:{ 'Content-Type':'application/json', ...headers }, body:JSON.stringify(body) });
    return { status:response.status, cookie:response.headers.get('set-cookie'), body:await response.json() };
  };
  const api = '/api/client-portal/demo';
  const admin = input => call(`${api}/admin`,input);
  const course = async (name, overrides = {}) => {
    const result = await call('/api/action',{ type:'save', key:'courses', data:{
      name, lesson:'Primeira aula', body:'Conteúdo privado', active:true, ...overrides } });
    assert.equal(result.status,200);
    return result.body.id;
  };
  const assigned = await course('Curso liberado');
  const other = await course('Outro curso');
  const legacyPublic = await course('Aula pública',{ portalOnly:false });
  assert.equal((await call(`/api/view/course/demo/${legacyPublic}`)).status,200);
  assert.equal((await call(`/api/view/course/demo/${assigned}`)).status,404);
  assert.equal((await call(`${api}/course/${assigned}`)).status,401);
  assert.equal((await call(`${api}/home`)).body.courses,undefined);
  assert.equal(rows.has('portal-demo'),false);

  const { body:invitation } = await admin({ action:'invite', email:'Aluno@example.test', courseIds:[assigned], sendEmail:true });
  assert.equal(invitation.sent,true);
  assert.deepEqual(invitation.stats,{ invited:1, users:0 });
  assert.deepEqual(deliveries[0].to,['aluno@example.test']);
  const token = deliveries[0].text.match(/#access=([\w-]+)/)[1];
  assert.ok(!JSON.stringify(rows.get('portal-demo')).includes(token));
  assert.ok(!JSON.stringify(invitation).includes('fingerprint'));
  assert.ok(!JSON.stringify((await call('/api/state')).body.state).includes('aluno@example.test'));

  const issued = await Promise.all([call(`${api}/exchange`,{token}),call(`${api}/exchange`,{token})]);
  assert.deepEqual(issued.map(result => result.status).sort(),[200,401]);
  const session = issued.find(result => result.status === 200);
  assert.match(session.cookie,/Path=\/api\/client-portal\/demo\/; HttpOnly; SameSite=Lax/);
  const cookie = session.cookie.split(';')[0];
  const read = path => call(api + path,undefined,{ Cookie:cookie });
  const home = await read('/home');
  assert.deepEqual(home.body.courses.map(row => row.id),[assigned]);
  assert.equal(home.body.courses[0].body,undefined);
  const opened = (await read(`/course/${assigned}`)).body.course;
  assert.equal(opened.lesson.body,'Conteúdo privado');
  assert.equal((await read(`/course/${other}`)).status,404);
  assert.equal((await admin()).body.stats.users,1);
  assert.equal(typeof invitation.members[0].grantedAt[assigned],'string');

  const lessonId = opened.modules[0].lessons[0].id;
  assert.equal((await read(`/course/${assigned}?lesson=${lessonId}`)).body.course.lesson.id,lessonId);
  const progress = (body, headers = { Cookie:cookie }) => call(`${api}/progress/${assigned}`,body,headers);
  const marked = await progress({ lessonId, done:true });
  assert.equal(marked.status,200);
  assert.deepEqual(marked.body.course.progress,{ done:1, total:1, percent:100 });
  assert.equal((await read('/home')).body.courses[0].progress.percent,100);
  assert.equal((await progress({ lessonId:'nao-existe', done:true })).status,404);
  assert.equal((await progress({ lessonId, done:true },{})).status,401);
  assert.equal(typeof (await admin()).body.members[0].progress[assigned][lessonId],'string');
  assert.equal((await progress({ lessonId, done:false })).body.course.progress.done,0);

  const foreign = await call('/api/workspaces',{ name:'Outra subconta' });
  const foreignApi = `/api/client-portal/${foreign.body.id}`;
  assert.equal((await call(foreignApi+'/home',undefined,{Cookie:cookie})).body.signedIn,false);
  assert.equal((await call(foreignApi+'/admin',{ action:'invite', email:'aluno@example.test', courseIds:[assigned] })).status,400);
  const member = invitation.members[0];
  assert.equal((await admin({ action:'login',memberId:member.id })).body.sent,true);
  const renewed = deliveries[1].text.match(/#access=([\w-]+)/)[1];
  assert.match(deliveries[1].text,/expira em 24 horas/);

  const contact = await call('/api/action',{ type:'save', key:'contacts', data:{ name:'Aluna Magia', email:'magia@example.test' } });
  const magic = await admin({ action:'magic', contactId:contact.body.id, sendEmail:true });
  assert.equal(magic.body.sent,true);
  assert.equal(magic.body.accessPath,undefined);
  assert.deepEqual(deliveries[2].to,['magia@example.test']);
  assert.match(deliveries[2].text,/expira em 15 minutos/);
  assert.equal(typeof (await admin({ action:'magic', contactId:contact.body.id })).body.accessPath,'string');
  assert.equal(deliveries.length,3);
  await admin({ action:'revoke', id:member.id });
  assert.equal((await read('/home')).body.signedIn,false);
  assert.equal((await call(`${api}/exchange`,{token:renewed})).status,401);
});

test('Copyable portal invitations work with the synchronous local store', async t => {
  const store = createSqliteStore(':memory:');
  t.after(store.close);
  const portal = makeClientPortal({ store });
  const state = blank();
  const { accessPath } = await portal.admin('demo', state, { action:'invite', email:'cliente@example.test' });
  const token = accessPath.split('#access=')[1];
  const session = await portal.exchange('demo',token);
  assert.equal((await portal.content('demo',state,session)).signedIn,true);
  await assert.rejects(portal.exchange('demo',token), { status:401 });
  await portal.signOut('demo',session);
  assert.equal((await portal.content('demo',state,session)).signedIn,false);
});
