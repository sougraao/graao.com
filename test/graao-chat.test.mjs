import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { createSqliteStore, createSupabaseStore } from '../storage.mjs';

async function start(opts = {}) {
  const store = opts.store || createSqliteStore(':memory:');
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, store, port: 0, ...opts });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  const base = `http://${host}:${server.address().port}`;
  const call = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined
      ? { headers }
      : { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };
  const stream = async (path, body, headers = {}) => {
    const r = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    const raw = await r.text();
    const events = [];
    for (const block of raw.split('\n\n')) {
      if (!block.trim()) continue;
      let event = 'message';
      const data = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (data.length) events.push({ event, data: JSON.parse(data.join('\n')) });
    }
    return { status: r.status, contentType: r.headers.get('content-type') || '', events };
  };
  return { base, call, stream, close: () => new Promise(resolve => server.close(resolve)) };
}

test('Pergunte ao Graao streams live agency metrics, persists history, branches, feedback, search, rename, export/import', async t => {
  const local = await start(); t.after(local.close);

  // Verify Vercel __path rewrite routing works for /api/ask/*
  const viaRewrite = await local.call('/api/index.mjs?__path=/api/ask/state');
  assert.equal(viaRewrite.status, 200);
  assert.equal(viaRewrite.body.config.mode, 'local');

  // Initial state in local mode
  const initial = await local.call('/api/ask/state');
  assert.equal(initial.status, 200);
  assert.equal(initial.body.config.mode, 'local');
  assert.deepEqual(initial.body.items, []);

  // Create SaaS plan and assign to demo account so MRR is real
  const plan = (await local.call('/api/agency/action', { type: 'save', key: 'plans', data: { name: 'Pro', price: 297 } })).body.result;
  await local.call('/api/agency/action', { type: 'account-meta', id: 'demo', data: { status: 'Active', plan } });

  // Stream a real question via SSE
  const first = await local.stream('/api/ask/conversation', {
    action: 'next',
    messages: [{ content: { content_type: 'text', parts: ['Qual é a nossa receita recorrente mensal (MRR)?'] } }]
  });
  assert.equal(first.status, 200);
  assert.match(first.contentType, /text\/event-stream/);
  const meta = first.events.find(e => e.event === 'meta')?.data;
  const done = first.events.find(e => e.event === 'done')?.data;
  const titleEv = first.events.find(e => e.event === 'title')?.data;
  const text = first.events.filter(e => e.event === 'delta').map(e => e.data.v).join('');
  assert.ok(meta?.conversation?.id);
  assert.ok(done?.message?.id);
  assert.match(text, /297/);
  assert.ok(titleEv?.title);

  const convId = meta.conversation.id;
  const userMsgId = meta.user_message_id;
  const assistantMsgId = done.message.id;

  // Regenerate creates a sibling assistant branch
  const regen = await local.stream('/api/ask/conversation', {
    action: 'variant',
    conversation_id: convId,
    parent_message_id: userMsgId
  });
  const secondAssistant = regen.events.find(e => e.event === 'done')?.data?.message;
  assert.ok(secondAssistant?.id && secondAssistant.id !== assistantMsgId);

  const full = await local.call(`/api/ask/conversation?id=${convId}`);
  assert.equal(full.status, 200);
  assert.equal(full.body.mapping[userMsgId].children.length, 2);

  // Switch branch back to first assistant reply
  const switched = await local.call('/api/ask/branch', { id: convId, current_node: assistantMsgId });
  assert.equal(switched.status, 200);
  assert.equal(switched.body.current_node, assistantMsgId);

  // Feedback up and clear
  const fb = await local.call('/api/ask/feedback', { id: convId, messageId: assistantMsgId, rating: 'up' });
  assert.equal(fb.status, 200);
  assert.equal(fb.body.rating, 'up');

  // Rename and search
  const renamed = await local.call('/api/ask/rename', { id: convId, title: 'Análise de MRR' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.title, 'Análise de MRR');
  const found = await local.call('/api/ask/search?q=297');
  assert.equal(found.body.items.length, 1);
  assert.equal(found.body.items[0].id, convId);

  // Export and delete all then re-import
  const exported = await (await fetch(local.base + '/api/ask/export')).json();
  assert.equal(exported.length, 1);
  await local.call('/api/ask/delete-all', {});
  assert.deepEqual((await local.call('/api/ask/state')).body.items, []);
  const imported = await local.call('/api/ask/import', { conversations: exported });
  assert.equal(imported.status, 200);
  assert.equal(imported.body.imported, 1);
  assert.equal((await local.call('/api/ask/state')).body.items.length, 1);

  // Delete single conversation
  const deleted = await local.call('/api/ask/delete', { id: convId });
  assert.equal(deleted.status, 200);
  assert.deepEqual((await local.call('/api/ask/state')).body.items, []);
});

test('Temporary chats are never stored in history and sub-account users are denied access', async t => {
  const local = await start(); t.after(local.close);

  const temp = await local.stream('/api/ask/conversation', {
    action: 'next',
    temporary: true,
    messages: [{ content: { content_type: 'text', parts: ['Quais subcontas ainda não realizaram login?'] } }]
  });
  assert.equal(temp.status, 200);
  const meta = temp.events.find(e => e.event === 'meta')?.data;
  assert.equal(meta.conversation.temporary, true);
  assert.deepEqual((await local.call('/api/ask/state')).body.items, []);

  // Account user cannot access agency Ask Graao routes
  const userId = (await local.call('/api/agency/action', {
    type: 'save',
    key: 'users',
    data: { first: 'Carla', last: 'Dias', email: 'carla@example.test', role: 'Account User', accounts: ['demo'], permissions: ['contacts'] }
  })).body.result;
  const denied = await local.call('/api/ask/state', undefined, { 'X-Go-User': userId });
  assert.equal(denied.status, 403);
});

test('Pergunte ao Graao static assets are served cleanly', async t => {
  const local = await start(); t.after(local.close);
  for (const path of ['/graao-chat.js', '/graao-chat.css', '/highlight.js', '/vendor/marked.js', '/vendor/purify.js']) {
    const r = await fetch(local.base + path);
    assert.equal(r.status, 200, `${path} should be served`);
  }
});

test('Pergunte ao Graao persists conversations and custom instructions through Supabase store rules', async t => {
  const rows = new Map();
  const storageKey = 'a'.repeat(64);
  const supabaseStore = createSupabaseStore({
    projectUrl: 'https://test.supabase.co',
    publishableKey: 'sb_publishable_test',
    storageKey,
    async request(url, options = {}) {
      assert.equal(options.headers['X-Go-Storage-Key'], storageKey);
      const u = new URL(url);
      const method = options.method || 'GET';
      const idParam = u.searchParams.get('id')?.replace(/^eq\./, '');
      const revParam = u.searchParams.get('revision')?.replace(/^eq\./, '');
      if (method === 'POST') {
        const body = JSON.parse(options.body);
        assert.ok(body.state && typeof body.state === 'object' && !Array.isArray(body.state), 'state must be JSON object');
        assert.ok(typeof body.state.profile?.name === 'string' && body.state.profile.name.length > 0, `Row ${body.id} must have profile.name`);
        if (rows.has(body.id)) return new Response(JSON.stringify([]), { status: 200 });
        rows.set(body.id, { id: body.id, name: body.state.profile.name, state: structuredClone(body.state), revision: 'rev-0' });
        return new Response(JSON.stringify([{ id: body.id }]), { status: 201 });
      }
      if (method === 'PATCH') {
        const body = JSON.parse(options.body);
        assert.ok(typeof body.state?.profile?.name === 'string' && body.state.profile.name.length > 0, `PATCH ${idParam} must keep profile.name`);
        const cur = rows.get(idParam);
        if (!cur || (revParam && cur.revision !== revParam)) return new Response(JSON.stringify([]), { status: 200 });
        cur.state = structuredClone(body.state);
        cur.name = body.state.profile.name;
        cur.revision = body.revision;
        return new Response(JSON.stringify([{ id: idParam }]), { status: 200 });
      }
      if (idParam) {
        const cur = rows.get(idParam);
        return new Response(JSON.stringify(cur ? [structuredClone(cur)] : []), { status: 200 });
      }
      return new Response(JSON.stringify([...rows.values()].map(({ id, name }) => ({ id, name }))), { status: 200 });
    }
  });

  const local = await start({ store: supabaseStore }); t.after(local.close);

  // Save custom instructions and verify persistence in Supabase row
  const savedSettings = await local.call('/api/ask/settings', { instructions: 'Responda sempre em tópicos objetivos.' });
  assert.equal(savedSettings.status, 200);
  assert.equal(savedSettings.body.instructions, 'Responda sempre em tópicos objetivos.');

  const stateBefore = await local.call('/api/ask/state');
  assert.equal(stateBefore.status, 200);
  assert.equal(stateBefore.body.instructions, 'Responda sempre em tópicos objetivos.');

  // Stream a conversation and verify chat-agency row in Supabase
  const reply = await local.stream('/api/ask/conversation', {
    action: 'next',
    messages: [{ content: { content_type: 'text', parts: ['Quais são os próximos passos recomendados?'] } }]
  });
  assert.equal(reply.status, 200);
  const chatRow = rows.get('chat-agency');
  assert.ok(chatRow, 'chat-agency row should exist in Supabase go_workspaces');
  assert.equal(chatRow.name, 'Pergunte ao Graao');
  assert.equal(chatRow.state.instructions, 'Responda sempre em tópicos objetivos.');
  assert.equal(chatRow.state.conversations.length, 1);
});

test('Pergunte ao Graao manages custom skills (agentskills.io) and has no external connectors', async t => {
  const local = await start({ openAISecret: 'graao-chat-test-seal-secret-32ch!!' }); t.after(local.close);

  // 1. Initial state returns empty skills and no connectors
  const state0 = await local.call('/api/ask/state');
  assert.equal(state0.status, 200);
  assert.equal(state0.body.connectors, undefined);
  assert.deepEqual(state0.body.skills, []);

  // 2. The old connectors route is gone
  const getConn = await local.call('/api/ask/connectors');
  assert.notEqual(getConn.status, 200);

  // 4. Create a custom skill directly
  const skillRes1 = await local.call('/api/ask/skills', {
    name: 'Auditor de Copywriting',
    description: 'Especialista em tom de voz e conversão',
    instructions: 'Sempre avalie o contraste e o ritmo da copy.'
  });
  assert.equal(skillRes1.status, 200);
  assert.equal(skillRes1.body.skills.length, 1);
  assert.equal(skillRes1.body.skills[0].name, 'Auditor de Copywriting');
  assert.equal(skillRes1.body.skills[0].enabled, true);

  const skill1Id = skillRes1.body.skills[0].id;

  // 5. Import a skill via agentskills.io SKILL.md format
  const rawSkillMd = `---
name: Lead Signals Hunter
description: Identifica sinais de compra e dores em comentários
---
Você é um analista sênior de inteligência de vendas. Mapeie gatilhos imediatos de contratação.`;

  const skillRes2 = await local.call('/api/ask/skills', { rawMarkdown: rawSkillMd });
  assert.equal(skillRes2.status, 200);
  assert.equal(skillRes2.body.skills.length, 2);
  const imported = skillRes2.body.skills.find(s => s.name === 'Lead Signals Hunter');
  assert.ok(imported);
  assert.equal(imported.description, 'Identifica sinais de compra e dores em comentários');
  assert.match(imported.instructions, /gatilhos imediatos de contratação/);

  // 6. Toggle skill enabled
  const toggleRes = await local.call('/api/ask/skills', {
    id: skill1Id,
    name: 'Auditor de Copywriting',
    instructions: 'Sempre avalie o contraste e o ritmo da copy.',
    enabled: false
  });
  assert.equal(toggleRes.status, 200);
  const updatedSkill = toggleRes.body.skills.find(s => s.id === skill1Id);
  assert.equal(updatedSkill.enabled, false);

  // 7. Delete skill
  const deleteRes = await local.call('/api/ask/skills', { action: 'delete', id: skill1Id });
  assert.equal(deleteRes.status, 200);
  assert.equal(deleteRes.body.skills.length, 1);
  assert.equal(deleteRes.body.skills[0].name, 'Lead Signals Hunter');

  // 8. Test conversation streaming with connectors and active skills
  const convStream = await local.stream('/api/ask/conversation', {
    action: 'next',
    messages: [{ content: { content_type: 'text', parts: ['Como a agência deve prospectar leads hoje?'] } }]
  });
  assert.equal(convStream.status, 200);
  const done = convStream.events.find(e => e.event === 'done')?.data;
  assert.ok(done?.message?.id);
});
