import test from 'node:test';
import assert from 'node:assert/strict';
import { makeServer } from '../server.mjs';
import { blank, execute } from '../model.mjs';
import { deliverWebhook, privateAddress } from '../workflow-delivery.mjs';
import { allActions, allTriggers, upgradeWorkflow } from '../ui/workflow-data.js';

const save = (s, key, data, id) => execute(s, { type: 'save', key, id, data });
const flow = (s, data) => save(s, 'workflows', { name: 'Fluxo', active: true, ...data });
const contact = (s, data = {}) => save(s, 'contacts', { name: 'Ana Souza', email: `ana${Math.random().toString(36).slice(2, 7)}@example.test`, phone: '+5511999990000', ...data });
const runsOf = (s, id) => s.runs.filter(row => row.workflowId === id);

test('The catalog covers native triggers and actions, and every action renders a label', () => {
  assert.ok(allTriggers.length >= 30 && allActions.length >= 30);
  for (const type of ['contact_tag', 'form_submitted', 'quiz_submitted', 'appointment_status', 'invoice_status', 'order_paid', 'webinar_registered', 'chat_started', 'review_received', 'inbound_webhook', 'birthday_reminder', 'stale_opportunity'])
    assert.ok(allTriggers.some(item => item.type === type), type);
  for (const type of ['wait', 'if_else', 'router', 'goal', 'goto', 'add_to_workflow', 'remove_from_workflow', 'math', 'text_format', 'webhook', 'manual_call'])
    assert.ok(allActions.some(item => item.type === type), type);
});

test('Several triggers with filters: only the matching tag enrolls, and actions use the expression engine', () => {
  const s = blank('W');
  const id = flow(s, { triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'vip' } }, { type: 'contact_created', config: {} }],
    steps: [{ type: 'add_note', config: { body: 'Olá {{upper(contact.first_name)}}' } }] });
  const c = contact(s, { tags: [] });
  assert.equal(runsOf(s, id).length, 1, 'contact created enrolls once');
  save(s, 'contacts', { ...s.contacts.find(row => row.id === c), tags: ['outra'] }, c);
  assert.equal(runsOf(s, id).length, 1, 'a different tag does not enroll');
  save(s, 'contacts', { ...s.contacts.find(row => row.id === c), tags: ['outra', 'VIP'] }, c);
  assert.equal(runsOf(s, id).length, 2, 'the filtered tag enrolls again (re-entry allowed)');
  assert.ok(s.messages.some(row => row.channel === 'Note' && row.body === 'Olá ANA'));
});

test('If/else and router branch on contact data; math and text formatter update fields', () => {
  const s = blank('W');
  const score = save(s, 'customFields', { name: 'Pontos', object: 'Contact', type: 'Number' });
  const id = flow(s, { triggers: [{ type: 'contact_created' }], steps: [
    { type: 'if_else', config: { match: 'all', conditions: [{ subject: 'tag', op: 'has', value: 'cliente' }] },
      yes: [{ type: 'add_tag', config: { tag: 'ramo-sim' } }], no: [{ type: 'add_tag', config: { tag: 'ramo-nao' } }] },
    { type: 'math', config: { field: `custom:${score}`, op: 'add', number: 5 } },
    { type: 'math', config: { field: `custom:${score}`, op: 'multiply', number: 3 } },
    { type: 'text_format', config: { field: 'name', op: 'upper' } },
    { type: 'router', routes: [{ label: 'Gmail', conditions: [{ subject: 'field', key: 'email', op: 'contains', value: 'gmail' }], steps: [{ type: 'add_tag', config: { tag: 'gmail' } }] }],
      otherwise: [{ type: 'add_tag', config: { tag: 'outro-email' } }] }
  ] });
  const a = contact(s, { tags: ['cliente'], email: 'a@gmail.com' }), b = contact(s, { tags: [] });
  const A = s.contacts.find(row => row.id === a), B = s.contacts.find(row => row.id === b);
  assert.deepEqual(A.tags, ['cliente', 'ramo-sim', 'gmail']);
  assert.deepEqual(B.tags, ['ramo-nao', 'outro-email']);
  assert.equal(A.custom[score], 15);
  assert.equal(A.name, 'ANA SOUZA');
  assert.equal(runsOf(s, id).every(row => row.status === 'Completed'), true);
});

test('Wait for a delay pauses the run until the tick; wait for an event resumes when it happens', () => {
  const s = blank('W');
  const id = flow(s, { triggers: [{ type: 'contact_created' }], steps: [
    { type: 'wait', config: { mode: 'delay', amount: 2, unit: 'hours' } }, { type: 'add_tag', config: { tag: 'depois' } },
    { type: 'wait', config: { mode: 'event', event: 'customer_replied', timeoutDays: 2 } }, { type: 'add_tag', config: { tag: 'respondeu' } }
  ] });
  const c = contact(s);
  const run = runsOf(s, id)[0];
  assert.equal(run.status, 'Waiting');
  assert.ok(!s.contacts.find(row => row.id === c).tags.includes('depois'));
  execute(s, { type: 'workflow-tick', data: { at: new Date(Date.now() + 30 * 60e3).toISOString() } });
  assert.equal(run.status, 'Waiting', 'not yet');
  execute(s, { type: 'workflow-tick', data: { at: new Date(Date.now() + 3 * 36e5).toISOString() } });
  assert.ok(s.contacts.find(row => row.id === c).tags.includes('depois'));
  assert.equal(run.status, 'Waiting');
  assert.ok(run.waitFor);
  execute(s, { type: 'message', data: { contactId: c, channel: 'SMS', direction: 'Inbound', body: 'oi' } });
  assert.equal(run.status, 'Completed');
  assert.ok(s.contacts.find(row => row.id === c).tags.includes('respondeu'));
});

test('A goal jumps the run forward when it is reached, cancelling the manual step it waited on', () => {
  const s = blank('W');
  const id = flow(s, { triggers: [{ type: 'contact_created' }], steps: [
    { type: 'manual_call', config: { body: 'Ligar para {{contact.first_name}}' } },
    { type: 'add_tag', config: { tag: 'ligado' } },
    { type: 'goal', config: { event: 'contact_tag', eventValue: 'comprou', otherwise: 'continue' } },
    { type: 'add_tag', config: { tag: 'pos-meta' } }
  ] });
  const c = contact(s);
  const run = runsOf(s, id)[0];
  assert.equal(run.status, 'Waiting');
  assert.equal(s.manualActions[0].instructions, 'Ligar para Ana');
  const row = s.contacts.find(item => item.id === c);
  save(s, 'contacts', { ...row, tags: ['comprou'] }, c);
  assert.equal(run.status, 'Completed');
  assert.equal(s.manualActions[0].status, 'Skipped');
  const tags = s.contacts.find(item => item.id === c).tags;
  assert.ok(tags.includes('pos-meta') && !tags.includes('ligado'), tags.join());
});

test('Manual actions resume the run; goto repeats a step and stops at the loop guard', () => {
  const s = blank('W');
  const id = flow(s, { triggers: [{ type: 'contact_created' }], steps: [
    { type: 'manual_sms', config: { body: 'Mandar SMS' } }, { type: 'add_tag', config: { tag: 'feito' } }] });
  contact(s);
  const run = runsOf(s, id)[0];
  execute(s, { type: 'manual-action', id: s.manualActions[0].id, data: { status: 'Completed', note: 'ok' } });
  assert.equal(run.status, 'Completed');

  const loop = flow(s, { name: 'Loop', triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'loop' } }], steps: [
    { id: 'first1', type: 'math', config: { field: 'none', op: 'add', number: 1 } }, { type: 'goto', config: { target: 'first1' } }] });
  const c = contact(s, { tags: ['loop'] });
  assert.ok(c);
  const looped = runsOf(s, loop)[0];
  assert.equal(looped.status, 'Failed');
  assert.match(looped.results.at(-1), /repetições|etapas demais/);
});

test('Add to and remove from workflow move the contact between flows', () => {
  const s = blank('W');
  const nurture = flow(s, { name: 'Nutrição', triggers: [], steps: [{ type: 'wait', config: { mode: 'delay', amount: 3, unit: 'days' } }, { type: 'add_tag', config: { tag: 'nutrido' } }] });
  const main = flow(s, { name: 'Principal', triggers: [{ type: 'contact_created' }], steps: [{ type: 'add_to_workflow', config: { workflowId: nurture } }] });
  const closer = flow(s, { name: 'Fechamento', triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'cliente' } }], steps: [{ type: 'remove_from_workflow', config: { workflowId: nurture } }] });
  const c = contact(s);
  assert.equal(runsOf(s, main)[0].status, 'Completed');
  assert.equal(runsOf(s, nurture)[0].status, 'Waiting');
  save(s, 'contacts', { ...s.contacts.find(row => row.id === c), tags: ['cliente'] }, c);
  assert.equal(runsOf(s, closer)[0].status, 'Completed');
  assert.equal(runsOf(s, nurture)[0].status, 'Removed');
});

test('Native events enroll: appointments, opportunities, invoices, surveys and quizzes by tier', () => {
  const s = blank('W');
  const c = contact(s);
  const ids = Object.fromEntries(['appointment_booked', 'opportunity_status_changed', 'invoice_status', 'note_added', 'task_completed'].map(type =>
    [type, flow(s, { name: type, triggers: [{ type, config: type === 'opportunity_status_changed' ? { status: 'Won' } : type === 'invoice_status' ? { status: 'Paid' } : {} }], steps: [{ type: 'add_tag', config: { tag: type } }] })]));
  save(s, 'appointments', { title: 'Reunião', contactId: c, start: '2030-01-01T10:00:00Z', end: '2030-01-01T11:00:00Z' });
  const deal = save(s, 'opportunities', { title: 'Negócio', contactId: c, stage: s.stages[0].id, value: 10 });
  save(s, 'opportunities', { ...s.opportunities.find(row => row.id === deal), status: 'Lost' }, deal);
  assert.equal(runsOf(s, ids.opportunity_status_changed).length, 0, 'filter on Won');
  save(s, 'opportunities', { ...s.opportunities.find(row => row.id === deal), status: 'Won' }, deal);
  const invoice = save(s, 'invoices', { title: 'Fatura', contactId: c, value: 10, due: '2030-01-01', status: 'Open' });
  save(s, 'invoices', { title: 'Fatura', contactId: c, value: 10, due: '2030-01-01', status: 'Paid' }, invoice);
  execute(s, { type: 'message', data: { contactId: c, channel: 'Note', direction: 'Outbound', body: 'nota' } });
  const task = save(s, 'tasks', { title: 'Ligar', contactId: c });
  save(s, 'tasks', { title: 'Ligar', contactId: c, done: true }, task);
  for (const [type, id] of Object.entries(ids)) assert.equal(runsOf(s, id).length, 1, type);
});

test('Scheduled triggers fire once a day: birthday reminders and the tag scheduler', () => {
  const s = blank('W');
  s.profile.timezone = 'UTC';
  const birthday = save(s, 'customFields', { name: 'Aniversário', object: 'Contact', type: 'Date' });
  const at = Date.parse('2031-05-20T12:00:00Z');
  const bday = flow(s, { triggers: [{ type: 'birthday_reminder', config: { field: birthday, days: 0, time: '09:00' } }], steps: [{ type: 'add_tag', config: { tag: 'parabens' } }] });
  const weekly = flow(s, { triggers: [{ type: 'scheduler', config: { frequency: 'daily', time: '10:00', tag: 'newsletter' } }], steps: [{ type: 'add_tag', config: { tag: 'enviado' } }] });
  const one = contact(s, { custom: { [birthday]: '1990-05-20' }, tags: ['newsletter'] });
  contact(s, { custom: { [birthday]: '1990-06-01' } });
  execute(s, { type: 'workflow-tick', data: { at: new Date(at).toISOString() } });
  execute(s, { type: 'workflow-tick', data: { at: new Date(at + 60e3).toISOString() } });
  assert.equal(runsOf(s, bday).length, 1);
  assert.equal(runsOf(s, bday)[0].contactId, one);
  assert.equal(runsOf(s, weekly).length, 1);
  assert.ok(s.contacts.find(row => row.id === one).tags.includes('parabens'));
});

test('Publishing validates the flow; legacy workflows are upgraded to the new shape', () => {
  const s = blank('W');
  assert.ok(flow(s, { triggers: [], steps: [{ type: 'end' }] }), 'a flow without triggers can be published: other flows add contacts to it');
  assert.throws(() => flow(s, { triggers: [{ type: 'contact_created' }], steps: [] }), /ação/);
  assert.throws(() => flow(s, { triggers: [{ type: 'contact_created' }], steps: [{ type: 'goto', config: { target: 'nope' } }] }), /destino/);
  const legacy = upgradeWorkflow({ name: 'Antigo', trigger: 'Form submitted', formId: 'f1', actions: [{ type: 'Add tag', value: 'lead' }, { type: 'Send WhatsApp', value: 'Oi' }] });
  assert.deepEqual(legacy.triggers.map(t => [t.type, t.config.formId]), [['form_submitted', 'f1']]);
  assert.deepEqual(legacy.steps.map(step => step.type), ['add_tag', 'send_whatsapp']);
  assert.equal(legacy.trigger, undefined);
});

test('Outbound webhooks are queued and never reach private networks', async () => {
  const s = blank('W');
  flow(s, { triggers: [{ type: 'contact_created' }], steps: [{ type: 'webhook', config: { url: 'https://hooks.example.test/x', method: 'POST' } }] });
  contact(s);
  assert.equal(s.workflowOutbox.length, 1);
  assert.equal(s.workflowOutbox[0].body.contact.name, 'Ana Souza');
  assert.ok(privateAddress('10.1.2.3') && privateAddress('127.0.0.1') && privateAddress('::1') && privateAddress('169.254.169.254') && !privateAddress('8.8.8.8'));
  assert.equal(await deliverWebhook({ url: 'http://example.test' }), 'apenas https:// é aceito');
  assert.equal(await deliverWebhook({ url: 'https://internal.test' }, { resolve: async () => [{ address: '192.168.0.10' }] }), 'endereço de rede interna bloqueado');
  let called = null;
  const text = await deliverWebhook({ url: 'https://ok.test/hook', body: { a: 1 } }, { resolve: async () => [{ address: '93.184.216.34' }], fetchImpl: async (url, init) => { called = [String(url), init.body]; return { ok: true, status: 200 }; } });
  assert.equal(text, 'enviado (200)');
  assert.deepEqual(called, ['https://ok.test/hook', '{"a":1}']);
});

test('Inbound webhook: the secret is required, the contact is found or created, and internal commands are not public', async t => {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = async (path, body) => { const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  const saved = await post('/api/action', { type: 'save', key: 'workflows', data: { name: 'Entrada', active: true, triggers: [{ type: 'inbound_webhook' }], steps: [{ type: 'add_tag', config: { tag: 'via-{{trigger.origem}}' } }] } });
  assert.equal(saved.status, 200, saved.body.error);
  const row = saved.body.state.workflows.find(item => item.id === saved.body.id);
  const trigger = row.triggers[0];
  assert.match(trigger.config.secret, /^[0-9a-f]{32}$/);
  assert.equal((await post(`/hooks/demo/${row.id}/${trigger.id}?key=wrong`, { email: 'x@example.test' })).status, 404);
  const ok = await post(`/hooks/demo/${row.id}/${trigger.id}?key=${trigger.config.secret}`, { email: 'Novo@Example.test', name: 'Novo Lead', origem: 'site' });
  assert.equal(ok.status, 202);
  const state = (await fetch(base + '/api/state').then(r => r.json())).state;
  const lead = state.contacts.find(item => item.email === 'novo@example.test');
  assert.ok(lead?.tags.includes('via-site'));
  for (const type of ['workflow-tick', 'workflow-hook', 'workflow-outbox-take', 'workflow-outbox-result'])
    assert.equal((await post('/api/action', { type, data: {} })).status, 400, type);
  const resaved = await post('/api/action', { type: 'save', key: 'workflows', id: row.id, data: { ...row, name: 'Entrada 2' } });
  assert.equal(resaved.body.state.workflows.find(item => item.id === row.id).triggers[0].config.secret, trigger.config.secret, 'the secret survives edits');
});

test('Filter ends the run when the condition fails; variables and step outputs feed later steps; errors can stop the flow', () => {
  const s = blank('W');
  const id = flow(s, { triggers: [{ type: 'contact_created' }], steps: [
    { type: 'filter', config: { match: 'all', conditions: [{ subject: 'tag', op: 'has', value: 'lead' }] } },
    { type: 'set_variable', config: { name: 'cupom', value: '{{upper(contact.first_name)}}10' } },
    { id: 'deal01', type: 'create_opportunity', config: { title: 'Negócio {{vars.cupom}}', value: 50 } },
    { type: 'add_note', config: { body: 'Criado {{steps.deal01.title}} de {{steps.deal01.value}}' } }
  ] });
  const blocked = contact(s, { tags: [] });
  assert.equal(runsOf(s, id).find(row => row.contactId === blocked).status, 'Completed');
  assert.ok(!s.opportunities.some(row => row.contactId === blocked), 'the filter stopped the flow');
  const passed = contact(s, { tags: ['lead'] });
  const run = runsOf(s, id).find(row => row.contactId === passed);
  assert.equal(run.vars.cupom, 'ANA10');
  assert.equal(s.opportunities.find(row => row.contactId === passed).title, 'Negócio ANA10');
  assert.ok(s.messages.some(row => row.contactId === passed && row.body === 'Criado Negócio ANA10 de 50'));

  const strict = flow(s, { name: 'Estrito', triggers: [{ type: 'contact_tag', config: { change: 'added', tag: 'estrito' } }], steps: [
    { type: 'math', config: { field: 'none', op: 'add', number: 1, stopOnError: true } }, { type: 'add_tag', config: { tag: 'nao-chega' } }] });
  const c = contact(s, { tags: ['estrito'] });
  const failed = runsOf(s, strict)[0];
  assert.equal(failed.status, 'Failed');
  assert.ok(!s.contacts.find(row => row.id === c).tags.includes('nao-chega'));
});

test('Testing a draft runs it on a copy: waits are skipped and nothing is saved', async t => {
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0 });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;
  const post = async (path, body) => { const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  const saved = await post('/api/action', { type: 'save', key: 'contacts', data: { name: 'Dora Lima', email: 'dora@example.test', tags: ['vip'] } });
  const contactId = saved.body.id;
  const draft = { name: 'Rascunho', triggers: [], steps: [
    { type: 'wait', config: { mode: 'delay', amount: 3, unit: 'days' } },
    { type: 'if_else', config: { match: 'all', conditions: [{ subject: 'tag', op: 'has', value: 'vip' }] }, yes: [{ type: 'add_tag', config: { tag: 'testado' } }], no: [] },
    { type: 'send_sms', config: { body: 'Oi {{contact.first_name}}' } }
  ] };
  const result = await post('/api/workflow-test', { workflow: draft, contactId });
  assert.equal(result.status, 200, result.body.error);
  const out = result.body.result;
  assert.equal(out.status, 'Completed');
  assert.deepEqual(out.changes.tagsAdded, ['testado']);
  assert.deepEqual(out.changes.messages, [{ channel: 'SMS', body: 'Oi Dora' }]);
  assert.ok(out.trace.some(item => item.result === 'pulada no teste'));
  const state = (await fetch(base + '/api/state').then(r => r.json())).state;
  assert.ok(!state.contacts.find(row => row.id === contactId).tags.includes('testado'), 'nothing was saved');
  assert.equal(state.runs.length, 0);
  assert.equal((await post('/api/action', { type: 'workflow-test', data: { workflow: draft, contactId } })).status, 400, 'not a public command');
});

test('Social engagement automation: comment trigger with keyword executes Instagram DM and comment reply', () => {
  const s = blank('W');
  const id = flow(s, {
    triggers: [{ type: 'social_comment_received', config: { network: 'instagram', keyword: 'QUERO' } }],
    steps: [
      { type: 'send_instagram_dm', config: { body: 'Oi {{contact.first_name}}! Link: https://graao.app/oferta' } },
      { type: 'reply_social_comment', config: { body: 'Enviamos o link no seu Direct!' } }
    ]
  });
  const c = contact(s, { name: 'Lucas Silva', tags: [] });
  // O comentário chega como o webhook da Meta manda (routes/meta.mjs): conta, comentário e quem comentou.
  execute(s, { type: 'social-interaction-trigger', data: { kind: 'comment', network: 'instagram', body: 'Eu QUERO saber mais!', comment: 'Eu QUERO saber mais!',
    senderId: '17841400000000001', accountId: '17841400000000002', commentId: '17900000000000003', contactId: c } });
  assert.equal(runsOf(s, id).length, 1, 'social comment with keyword enrolls contact');
  assert.ok(s.messages.some(m => m.channel === 'Instagram' && m.body.includes('https://graao.app/oferta')), 'sent DM');
  const reply = s.messages.find(m => m.channel === 'Instagram' && m.publicComment);
  assert.equal(reply?.body, 'Enviamos o link no seu Direct!', 'replied to comment');
  assert.equal(reply.commentId, '17900000000000003');
  assert.ok(s.workflowOutbox.some(item => item.kind === 'meta-comment-reply' && item.commentId === '17900000000000003' && item.accountId === '17841400000000002' && item.messageId === reply.id),
    'the public reply waits in the outbox to be sent to Meta');
});

test('Social engagement automation: replying to a comment needs a comment received from Meta', () => {
  const s = blank('W');
  const id = flow(s, {
    triggers: [{ type: 'social_comment_received', config: { network: 'instagram' } }],
    steps: [{ type: 'reply_social_comment', config: { body: 'Obrigado!' } }]
  });
  const c = contact(s, { name: 'Lucas Silva', tags: [] });
  execute(s, { type: 'social-interaction-trigger', data: { kind: 'comment', network: 'instagram', comment: 'Adorei', contactId: c } });
  const [run] = runsOf(s, id);
  assert.equal(run.trace.at(-1).result, 'erro: esta ação exige um comentário recebido pela Meta');
  assert.ok(!s.messages.some(m => m.publicComment || m.body.includes('Obrigado!')), 'nothing is answered without the Meta comment');
  assert.ok(!(s.workflowOutbox || []).some(item => item.kind === 'meta-comment-reply'));
});
