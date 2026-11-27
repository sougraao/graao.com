import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeServer } from '../server.mjs';
import { blank, execute, hydrateWorkspace } from '../model.mjs';
import { createSupabaseStore } from '../storage.mjs';
import { conversionTotals, scopedDeals, stageTotals } from '../ui/dashboard-data.js';

async function start(dbPath=':memory:', options = {}) {
  const {server,host}=makeServer({ allowLocalAccess: true, auth: null,dbPath,port:0, ...options });
  await new Promise((resolve,reject)=>{server.on('error',reject);server.listen(0,host,resolve);});
  const base=`http://${host}:${server.address().port}`;
  const call=async(path,body,headers={})=>{
    const r=await fetch(base+path,body===undefined?{headers}:{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};
  };
  return {call,base,close:()=>new Promise(resolve=>server.close(resolve))};
}

test('Automation definitions and executions persist together through the Supabase workspace adapter', async t => {
  const rows = new Map();
  const storageKey = 'a'.repeat(64);
  let conflict = false;
  const store = createSupabaseStore({
    projectUrl: 'https://test.supabase.co',
    publishableKey: 'sb_publishable_test',
    storageKey,
    async request(url, options) {
      assert.equal(url.pathname, '/rest/v1/go_workspaces');
      assert.equal(options.headers['X-Go-Storage-Key'], storageKey);
      const id = url.searchParams.get('id')?.slice(3);
      if (options.method === 'POST') {
        const record = JSON.parse(options.body);
        if (rows.has(record.id)) return Response.json([]);
        rows.set(record.id, { ...record, name: record.state.profile.name, revision: 'initial' });
        return Response.json([{ id: record.id }]);
      }
      const row = rows.get(id);
      if (options.method === 'PATCH') {
        if (conflict && id === 'demo') {
          conflict = false;
          row.revision = 'concurrent';
        }
        if (!row || url.searchParams.get('revision') !== `eq.${row.revision}`) return Response.json([]);
        rows.set(id, { ...row, ...JSON.parse(options.body) });
        return Response.json([{ id }]);
      }
      if (id) return Response.json(row ? [row] : []);
      return Response.json([...rows.values()]);
    }
  });
  const local = await start(':memory:', { store });
  t.after(local.close);
  const action = async (type, data = {}, id, key) => {
    const response = await local.call('/api/action', { type, key, id, data });
    assert.equal(response.status, 200, response.body.error);
    return response.body.id;
  };
  const save = (key, data, id) => action('save', data, id, key);
  const folderId = await save('workflowFolders', { name: 'Atendimento' });
  await save('workflowLists', { name: 'Publicados', folderId, status: 'published' });
  const workflowId = await save('workflows', { name: 'Retorno', folderId, actions: [] });
  const invalid = await local.call('/api/action', { type: 'save', key: 'workflows', id: workflowId, data: { active: true } });
  assert.equal(invalid.status, 400);
  await save('workflows', { trigger: 'Contact created', active: true, allowReentry: false,
    actions: [{ type: 'Create task', value: 'Revisar cadastro' }] }, workflowId);
  conflict = true;
  const contactId = await save('contacts', { name: 'Contato de teste', email: 'workflow@example.test' });
  const repeated = await local.call('/api/action', { type: 'workflow-enroll', id: workflowId, data: { contactId } });
  assert.equal(repeated.status, 409);

  const saved = rows.get('demo').state;
  assert.equal(saved.workflowFolders[0].id, folderId);
  assert.equal(saved.workflowLists[0].folderId, folderId);
  assert.equal(saved.workflows.find(row => row.id === workflowId).active, true);
  assert.equal(saved.runs.filter(run => run.workflowId === workflowId && run.contactId === contactId).length, 1);
  assert.equal(saved.tasks.filter(task => task.contactId === contactId && task.title === 'Revisar cadastro').length, 1);

  await action('delete', {}, workflowId, 'workflows');
  assert.equal(rows.get('demo').state.deletedWorkflows[0].id, workflowId);
  await action('workflow-restore', {}, workflowId);
  const reloaded = (await local.call('/api/state')).body.state;
  assert.equal(reloaded.deletedWorkflows.length, 0);
  assert.equal(reloaded.workflows.find(row => row.id === workflowId).active, false);
  assert.equal(reloaded.runs.filter(run => run.workflowId === workflowId).length, 1);

  const setStatus = await local.call('/api/agency/action', { type: 'account-meta', id: 'demo', data: { status: 'Paused' } });
  assert.equal(setStatus.status, 200, setStatus.body.error);
  assert.equal(rows.get('agency').state.accounts.demo.status, 'Paused');
  assert.equal((await local.call('/api/state')).body.account.support, true);
  const stopped = await local.call('/api/action', { type: 'save', key: 'contacts', data: { name: 'Denied by lifecycle' } });
  assert.equal(stopped.status, 403);
  assert.equal(stopped.body.code, 'ACCOUNT_SUSPENDED');
  assert.deepEqual(rows.get('demo').state.contacts, reloaded.contacts);
  assert.equal((await local.call('/api/agency/action', { type: 'account-reactivate', id: 'demo' })).status, 200);
  assert.equal(rows.get('agency').state.accounts.demo.status, 'Active');
  assert.equal((await local.call('/api/state')).body.account, undefined);
});

test('Published lead form creates a contact, tags it and creates a deal in the same workspace', async t=>{
  const local=await start();t.after(local.close);
  const workspace=(await local.call('/api/workspaces',{name:'Lead test'})).body.id;
  const action=`/api/action?workspace=${workspace}`;
  const save=(key,data,id='')=>local.call(action,{type:'save',key,id,data});
  assert.equal((await save('workflows',{name:'New leads',trigger:'Form submitted',active:true,actions:[{type:'Add tag',value:'Website'},{type:'Create opportunity',value:'New website lead'},{type:'Create task',value:'Book discovery call'}]})).status,200);
  const form=(await save('forms',{name:'Request a call',active:false,askPhone:true})).body.id;
  const path=`/api/view/f/${workspace}/${form}`;
  assert.equal((await local.call(path,{name:'Customer',email:'test@example.test'})).status,404);
  assert.equal((await save('forms',{name:'Request a call',active:true,askPhone:true},form)).status,200);
  assert.equal((await local.call(path,{name:'Customer',email:'TEST@example.test',phone:'123'})).status,201);
  const {state,metrics}= (await local.call(`/api/state?workspace=${workspace}`)).body;
  assert.equal(state.contacts[0].email,'test@example.test');
  assert.deepEqual(state.contacts[0].tags,['Website']);
  assert.equal(state.opportunities[0].contactId,state.contacts[0].id);
  assert.equal(state.tasks[0].contactId,state.contacts[0].id);
  assert.equal(state.runs[0].event,'Formulário enviado');
  assert.equal(state.submissions[0].formId,form);
  assert.equal(metrics.open,1);
  assert.equal((await local.call('/api/state')).body.state.runs.length,0);
});

test('Records survive a restart, and a conflicting appointment or foreign origin cannot change them',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'go-platform-test-')), db=join(dir,'storage.sqlite');
  t.after(()=>{for(const suffix of ['','-wal','-shm'])rmSync(db+suffix,{force:true});rmdirSync(dir);});
  const first=await start(db);
  try {
    const row={type:'save',key:'appointments',data:{title:'Consultation',start:'2026-11-16T15:00:00Z',end:'2026-11-16T16:00:00Z'}};
    assert.equal((await first.call('/api/action',row,{Origin:'https://foreign.example'})).status,403);
    assert.equal((await first.call('/api/action',row)).status,200);
    assert.equal((await first.call('/api/action',{...row,data:{...row.data,title:'Overlapping',start:'2026-11-16T15:30:00Z'}})).status,400);
    const profile={type:'onboarding',data:{kind:'agency',goal:'calendars',done:true}};
    assert.equal((await first.call('/api/action',profile)).status,200);
  } finally {await first.close();}
  const second=await start(db);
  try {
    const {state,metrics}= (await second.call('/api/state')).body;
    assert.equal(state.onboarding.goal,'calendars');
    assert.equal(state.appointments[0].title,'Consultation');
    assert.equal(metrics.appointments,1);
  } finally {await second.close();}
});

test('Bulk import is atomic and preserves records when input is invalid',async t=>{
  const local=await start();t.after(local.close);
  const status=await local.call('/api/action',{type:'import',data:{rows:[{name:'Imported',email:'new@example.test'},{name:'Bad email',email:'invalid'}]}});
  assert.equal(status.status,400);
  const {state}= (await local.call('/api/state')).body;
  assert.equal(state.contacts.some(r=>r.email==='new@example.test'),false);
});

test('Manual actions pause a workflow and completing or skipping one resumes each step once', async t => {
  const local = await start();
  t.after(local.close);
  const execute = body => local.call('/api/action', body);
  const workflow = await execute({ type:'save', key:'workflows', data:{
    name:'Follow up', trigger:'Contact created', active:true, actions:[
      {type:'Manual Call', value:'Call the lead', assignee:'Sales'},
      {type:'Add tag', value:'Called'},
      {type:'Manual SMS', value:'Send follow-up'},
      {type:'Create task', value:'Check response'}
    ]
  }});
  assert.equal(workflow.status,200);
  const created = await execute({type:'save',key:'contacts',data:{name:'New lead'}});
  let {state} = created.body;
  const pending = state.manualActions[0];
  assert.equal(pending.assignee,'Sales');
  assert.equal(state.runs[0].status,'Waiting');
  assert.deepEqual(state.contacts.find(item => item.id === created.body.id).tags,[]);

  const complete = id => execute({type:'manual-action', id, data:{status:'Completed', note:'Left a voicemail.'}});
  ({state} = (await complete(pending.id)).body);
  assert.equal(state.manualActions[0].status,'Completed');
  assert.equal(state.manualActions[1].type,'Manual SMS');
  assert.equal(state.runs[0].status,'Waiting');
  assert.deepEqual(state.contacts.find(item => item.id === created.body.id).tags,['Called']);
  ({state} = (await complete(pending.id)).body);
  assert.equal(state.manualActions.length,2);
  assert.equal(state.messages.filter(item => item.body.includes('Left a voicemail.')).length,1);

  const skipped = await execute({type:'manual-action', id:state.manualActions[1].id, data:{status:'Skipped'}});
  assert.equal(skipped.body.state.runs[0].status,'Completed');
  assert.equal(skipped.body.state.tasks.filter(item => item.title === 'Check response').length,1);
});

test('Trigger links count each click and automate once for the contact who received the link', async t => {
  const local = await start();
  t.after(local.close);
  const execute = body => local.call('/api/action',body);
  const destination = 'https://example.test/offer';
  const invalid = await execute({type:'save',key:'triggerLinks',data:{name:'Invalid',url:'javascript:alert(1)'}});
  assert.equal(invalid.status,400);
  const link = await execute({type:'save',key:'triggerLinks',data:{name:'Offer',url:destination}});
  const linkId = link.body.id;
  await execute({type:'save',key:'workflows',data:{name:'Viewed offer',trigger:'Trigger link clicked',linkId,active:true,actions:[{type:'Add tag',value:'Viewed offer'}]}});
  const contactId = link.body.state.contacts[0].id;
  const message = await execute({type:'message',data:{contactId,channel:'Email',subject:'Offer',direction:'Outbound',body:`See {{trigger_link.${linkId}}}`}});
  assert.equal(message.status,200);
  const sent = message.body.state.messages.find(item => item.id === message.body.id).body.split(' ')[1];
  assert.ok(sent.startsWith(`${local.base}/r/demo/`), 'the link in the message is absolute, so it works outside the app');
  const path = new URL(sent).pathname;
  for (const route of [`/r/demo/${linkId}`,path,path]) {
    const response = await fetch(local.base + route,{redirect:'manual'});
    assert.equal(response.status,302);
    assert.equal(response.headers.get('Location'),destination);
  }
  const {state} = (await local.call('/api/state')).body;
  assert.equal(state.linkClicks.length,3);
  assert.equal(state.linkClicks.filter(item => item.contactId === contactId).length,2);
  assert.equal(state.runs.filter(item => item.event === 'Link de rastreamento clicado').length,1);
  assert.ok(state.contacts.find(item => item.id === contactId).tags.includes('Viewed offer'));
});

test('Dashboard status dates survive stage changes and metrics stay scoped to the selected pipeline', () => {
  const state = blank('Metrics');
  const contact = execute(state,{type:'save',key:'contacts',data:{name:'Example lead'}});
  const metricsPipeline = execute(state,{type:'pipeline',data:{name:'Inbound'}});
  const first = state.stages.find(stage => stage.pipelineId === metricsPipeline);
  const next = state.stages.find(stage => stage.pipelineId === metricsPipeline && stage.id !== first.id);
  function deal(status,value,stage) {
    const dealId = execute(state,{type:'save',key:'opportunities',data:{title:status,contactId:contact,status,value,stage}});
    const item = state.opportunities.find(row => row.id === dealId);
    item.created = item.statusChangedAt = '2025-01-10T16:00:00Z';
    return item;
  }
  const early = deal('Open',100,first.id);
  deal('Open',200,next.id);
  deal('Won',300,next.id);
  deal('Lost',400,next.id);
  deal('Won',700,'won');
  const settings = {pipeline:metricsPipeline,dateField:'status'};
  const range = {start:'2025-01-10',end:'2025-01-10'};
  const visible = scopedDeals(state,settings,range);
  assert.equal(visible.length,4);
  assert.deepEqual(conversionTotals(visible),{rate:25,revenue:300,count:1});
  assert.deepEqual(stageTotals(state,metricsPipeline,visible).funnel.map(row => row.count),[3,2,1,1]);

  execute(state,{type:'save',key:'opportunities',id:early.id,data:{...early,stage:next.id}});
  const moved = state.opportunities.find(row => row.id === early.id);
  assert.equal(moved.statusChangedAt,early.statusChangedAt);
  execute(state,{type:'save',key:'opportunities',id:early.id,data:{...moved,status:'Won'}});
  assert.equal(scopedDeals(state,settings,range).length,3);
  assert.equal(scopedDeals(state,{...settings,dateField:'created'},range).length,4);
  delete state.opportunities.find(row => row.id === early.id).statusChangedAt;
  assert.ok(hydrateWorkspace(state).opportunities.every(row => row.statusChangedAt));
});

test('Dashboard reports are independent of subsequent edits and Studio projects can be reopened', async t => {
  const app = await start();
  t.after(app.close);
  const action = command => app.call('/api/action',command);
  const created = await action({type:'dashboard-create',data:{name:'Sales review',copyFrom:'dashboard'}});
  const id = created.body.id;
  const original = created.body.state.dashboards.find(board => board.id === id);
  const report = await action({type:'dashboard-report',id,data:{name:'Initial report',period:'all'}});
  assert.ok(report.body.state.dashboardReports[0].rows.length);
  const changed = await action({type:'dashboard-save',id,data:{...original,widgets:[],name:'Renamed'}});
  assert.equal(changed.body.state.dashboardReports[0].dashboard,'Sales review');
  assert.equal((await action({type:'dashboard-save',id,data:original})).status,409);
  const restored = await action({type:'dashboard-restore',id,data:{version:2,restoreVersion:1}});
  assert.equal(restored.body.state.dashboards.find(board => board.id === id).widgets.length,15);

  const studio = await app.call('/api/studio',{mode:'starter',template:'portfolio',brief:'Portfolio for Estúdio Cinco'});
  assert.equal(studio.status,201);
  await action({type:'studio-star',id:studio.body.id,data:{starred:true}});
  const {state} = (await app.call('/api/state')).body;
  const project = state.studioProjects.find(item => item.id === studio.body.id);
  assert.equal(project.starred,true);
  assert.equal(project.template,'portfolio');
  assert.deepEqual(project.blocks.map(section => section.title),['Trabalhos selecionados','Sobre','Contato']);
});

test('ManyChat workflow triggers on inbound message keywords and executes WhatsApp replies and tagging', async t => {
  const local = await start();
  t.after(local.close);
  const action = async (type, data = {}, id, key) => {
    const response = await local.call('/api/action', { type, key, id, data });
    assert.equal(response.status, 200, response.body.error);
    return response.body.id;
  };
  const save = (key, data, id) => action('save', data, id, key);
  const contactId = await save('contacts', { name: 'Lead ManyChat', phone: '+5511999998888' });
  const wfId = await save('workflows', {
    name: 'Auto-resposta QUERO',
    trigger: 'Customer replied',
    channel: 'WhatsApp',
    keyword: 'QUERO',
    active: true,
    actions: [
      { type: 'Add tag', value: 'Interesse WhatsApp' },
      { type: 'Send WhatsApp', value: 'Olá! Segue o link com a sua proposta: https://graao.app' },
      { type: 'Create opportunity', value: 'Oportunidade WhatsApp' }
    ]
  });

  // Sending an unrelated message does NOT trigger the workflow
  await action('message', { contactId, channel: 'WhatsApp', direction: 'Inbound', body: 'Bom dia, tudo bem?' });
  let state = (await local.call('/api/state')).body.state;
  assert.equal(state.runs.filter(r => r.workflowId === wfId).length, 0);

  // Sending a message containing the keyword 'QUERO' triggers the workflow
  await action('message', { contactId, channel: 'WhatsApp', direction: 'Inbound', body: 'Olá, EU QUERO receber a proposta!' });
  state = (await local.call('/api/state')).body.state;
  const runs = state.runs.filter(r => r.workflowId === wfId);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'Completed');

  const contact = state.contacts.find(c => c.id === contactId);
  assert.ok(contact.tags.includes('Interesse WhatsApp'));
  const opp = state.opportunities.find(o => o.contactId === contactId);
  assert.ok(opp);
  assert.equal(opp.title, 'Oportunidade WhatsApp');

  const outbound = state.messages.find(m => m.contactId === contactId && m.direction === 'Outbound' && m.origin === 'workflow');
  assert.ok(outbound);
  assert.equal(outbound.channel, 'WhatsApp');
  assert.equal(outbound.body, 'Olá! Segue o link com a sua proposta: https://graao.app');
});

test('Workflow resolves dynamic expressions and template variables like Trama (contact.first_name, account.name, functions)', async t => {
  const local = await start();
  t.after(local.close);
  const action = async (type, data = {}, id, key) => {
    const response = await local.call('/api/action', { type, key, id, data });
    assert.equal(response.status, 200, response.body.error);
    return response.body.id;
  };
  const save = (key, data, id) => action('save', data, id, key);
  const contactId = await save('contacts', { name: 'Lucas Gabriel da Silva', email: 'lucas@example.test', phone: '+5511999997777', company: 'Acme Brasil' });
  const wfId = await save('workflows', {
    name: 'Boas-vindas com variáveis',
    trigger: 'Contact created',
    active: true,
    actions: [
      { type: 'Add tag', value: 'cliente-{{contact.first_name}}' },
      { type: 'Send WhatsApp', value: 'Oi, {{contact.first_name}}! Tudo bem? Vi seu interesse na {{account.name}}.' },
      { type: 'Send SMS', value: 'Olá {{upper(contact.first_name)}}, seu e-mail cadastrado é {{contact.email}}' },
      { type: 'Create task', value: 'Follow-up para {{contact.name}} da empresa {{contact.company}}' },
      { type: 'Create opportunity', value: 'Oportunidade - {{contact.first_name}} ({{contact.company}})' }
    ]
  });

  await action('workflow-enroll', { contactId }, wfId);
  const state = (await local.call('/api/state')).body.state;
  const runs = state.runs.filter(r => r.workflowId === wfId && r.contactId === contactId);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].status, 'Completed');

  const contact = state.contacts.find(c => c.id === contactId);
  assert.ok(contact.tags.includes('cliente-Lucas'));

  const waMessage = state.messages.find(m => m.contactId === contactId && m.channel === 'WhatsApp' && m.origin === 'workflow');
  assert.ok(waMessage);
  assert.equal(waMessage.body, 'Oi, Lucas! Tudo bem? Vi seu interesse na Demo Workspace.');

  const smsMessage = state.messages.find(m => m.contactId === contactId && m.channel === 'SMS' && m.origin === 'workflow');
  assert.ok(smsMessage);
  assert.equal(smsMessage.body, 'Olá LUCAS, seu e-mail cadastrado é lucas@example.test');

  const task = state.tasks.find(t => t.contactId === contactId);
  assert.ok(task);
  assert.equal(task.title, 'Follow-up para Lucas Gabriel da Silva da empresa Acme Brasil');

  const opp = state.opportunities.find(o => o.contactId === contactId);
  assert.ok(opp);
  assert.equal(opp.title, 'Oportunidade - Lucas (Acme Brasil)');
});
