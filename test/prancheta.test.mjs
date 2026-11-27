import test from 'node:test';
import assert from 'node:assert/strict';
import { blank, execute, hydrateWorkspace } from '../model.mjs';
import { blankAgency, executeAgency, hydrateAgency } from '../agency-model.mjs';
import { createCanonicalTemplates, pranchetaPresets } from '../prancheta-model.mjs';
import { nav as subaccountNav } from '../ui/screens.js';
import { agencyNav } from '../ui/agency-data.js';

test('Prancheta: Workspace initializes with empty pranchetaFiles array and hydrates cleanly', () => {
  const ws = blank('Subconta Teste');
  assert.ok(Array.isArray(ws.pranchetaFiles), 'pranchetaFiles should be an array');
  assert.equal(ws.pranchetaFiles.length, 0);

  const raw = blank('Teste');
  delete raw.pranchetaFiles;
  const hydrated = hydrateWorkspace(raw);
  assert.ok(Array.isArray(hydrated.pranchetaFiles));
});

test('Prancheta: Creates, updates, duplicates, and deletes designs in a subaccount', () => {
  const ws = blank('Subconta Marketing');

  // 1. Create design
  const designId = execute(ws, {
    type: 'prancheta-save',
    data: {
      name: 'Carrossel Lançamento',
      format: 'instagram-carousel',
      width: 1080,
      height: 1350,
      pages: [
        {
          id: 'slide-1',
          name: 'Capa',
          background: '#101014',
          nodes: [
            { id: 'title-1', type: 'TEXT', text: 'Chegou o Novo Produto', x: 80, y: 300, fontSize: 64 }
          ]
        }
      ]
    }
  });

  assert.ok(designId);
  assert.equal(ws.pranchetaFiles.length, 1);
  const created = ws.pranchetaFiles[0];
  assert.equal(created.id, designId);
  assert.equal(created.name, 'Carrossel Lançamento');
  assert.equal(created.format, 'instagram-carousel');
  assert.equal(created.width, 1080);
  assert.equal(created.height, 1350);
  assert.equal(created.pages.length, 1);

  // 2. Update design
  const updatedId = execute(ws, {
    type: 'prancheta-save',
    id: designId,
    data: {
      name: 'Carrossel Lançamento - Versão 2',
      format: 'instagram-carousel',
      width: 1080,
      height: 1350,
      pages: [
        ...created.pages,
        { id: 'slide-2', name: 'Benefícios', background: '#17171E', nodes: [] }
      ]
    }
  });

  assert.equal(updatedId, designId);
  assert.equal(ws.pranchetaFiles.length, 1);
  assert.equal(ws.pranchetaFiles[0].name, 'Carrossel Lançamento - Versão 2');
  assert.equal(ws.pranchetaFiles[0].pages.length, 2);

  // 3. Duplicate design
  const copyId = execute(ws, {
    type: 'prancheta-duplicate',
    id: designId
  });

  assert.ok(copyId);
  assert.notEqual(copyId, designId);
  assert.equal(ws.pranchetaFiles.length, 2);
  const duplicated = ws.pranchetaFiles.find(f => f.id === copyId);
  assert.ok(duplicated);
  assert.equal(duplicated.name, 'Carrossel Lançamento - Versão 2 (Cópia)');
  assert.equal(duplicated.pages.length, 2);

  // 4. Delete original design
  const deletedId = execute(ws, {
    type: 'prancheta-delete',
    id: designId
  });

  assert.equal(deletedId, designId);
  assert.equal(ws.pranchetaFiles.length, 1);
  assert.equal(ws.pranchetaFiles[0].id, copyId);
});

test('Prancheta: Subaccounts maintain strictly isolated design files', () => {
  const subcontaA = blank('Subconta Restaurante');
  const subcontaB = blank('Subconta Imobiliária');

  const idA = execute(subcontaA, {
    type: 'prancheta-save',
    data: { name: 'Cardápio Semanal', format: 'story-reels', width: 1080, height: 1920 }
  });

  const idB = execute(subcontaB, {
    type: 'prancheta-save',
    data: { name: 'Imóvel em Destaque', format: 'instagram-feed', width: 1080, height: 1080 }
  });

  assert.equal(subcontaA.pranchetaFiles.length, 1);
  assert.equal(subcontaA.pranchetaFiles[0].id, idA);
  assert.equal(subcontaA.pranchetaFiles[0].name, 'Cardápio Semanal');

  assert.equal(subcontaB.pranchetaFiles.length, 1);
  assert.equal(subcontaB.pranchetaFiles[0].id, idB);
  assert.equal(subcontaB.pranchetaFiles[0].name, 'Imóvel em Destaque');

  // Verify subconta A cannot access or delete subconta B's design
  assert.throws(() => {
    execute(subcontaA, { type: 'prancheta-delete', id: idB });
  }, /Design não encontrado/);
});

test('Prancheta: Export to Mídia Drive creates file in subaccount files gallery', () => {
  const ws = blank('Subconta Vendas');
  const mockPngUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const designId = execute(ws, {
    type: 'prancheta-save',
    data: {
      name: 'Banner Black Friday',
      format: 'banner-web',
      width: 1920,
      height: 1080,
      thumbnail: mockPngUri
    }
  });

  assert.equal(ws.files.length, 0);

  const fileId = execute(ws, {
    type: 'prancheta-export-media',
    id: designId,
    data: {
      name: 'Banner Black Friday Export'
    }
  });

  assert.ok(fileId);
  assert.equal(ws.files.length, 1);
  const mediaFile = ws.files[0];
  assert.equal(mediaFile.id, fileId);
  assert.equal(mediaFile.name, 'Banner Black Friday Export.png');
  assert.equal(mediaFile.data, mockPngUri);
  assert.equal(mediaFile.type, 'image/png');
});

test('Prancheta: Send to Social Planner creates draft post with exported media', () => {
  const ws = blank('Subconta Social');
  const mockPngUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const designId = execute(ws, {
    type: 'prancheta-save',
    data: {
      name: 'Post Dica do Dia',
      format: 'instagram-feed',
      thumbnail: mockPngUri
    }
  });

  assert.equal(ws.socialPosts.length, 0);

  const result = execute(ws, {
    type: 'prancheta-to-social',
    id: designId,
    data: {
      body: 'Confira a dica de hoje para acelerar seu negócio digital.'
    }
  });

  assert.ok(result.fileId);
  assert.ok(result.postId);
  assert.equal(ws.socialPosts.length, 1);
  const post = ws.socialPosts[0];
  assert.equal(post.id, result.postId);
  assert.equal(post.status, 'draft', 'a Social Planner draft');
  assert.deepEqual(post.accountIds, []);
  assert.equal(post.summary, 'Confira a dica de hoje para acelerar seu negócio digital.');
  assert.equal(post.media.length, 1);
  assert.equal(post.media[0].fileId, result.fileId);
});

test('Prancheta: Creates design from Canonical Templates (Método HEAD)', () => {
  const ws = blank('Subconta Agência');

  const designId = execute(ws, {
    type: 'prancheta-template',
    data: {
      templateId: 'template-head-carousel'
    }
  });

  assert.ok(designId);
  assert.equal(ws.pranchetaFiles.length, 1);
  const design = ws.pranchetaFiles[0];
  assert.equal(design.name, 'Carrossel Método HEAD');
  assert.equal(design.format, 'instagram-carousel');
  assert.equal(design.width, 1080);
  assert.equal(design.height, 1350);
  assert.equal(design.pages.length, 3);
  assert.equal(design.pages[0].name, 'Lâmina 1 · Gancho');
  assert.equal(design.pages[1].name, 'Lâmina 2 · Tensão');
  assert.equal(design.pages[2].name, 'Lâmina 3 · CTA Final');
});

test('Prancheta: HTTP API routes (/api/prancheta/*) work with subaccount isolation', async (t) => {
  const { makeServer } = await import('../server.mjs');
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));

  const base = `http://${host}:${server.address().port}`;
  const send = async (path, body, headers = {}) => {
    const r = await fetch(base + path, body === undefined ? { headers } : { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json() };
  };

  // 1. Get canonical templates
  const tplRes = await send('/api/prancheta/templates?workspace=demo');
  assert.equal(tplRes.status, 200);
  assert.ok(Array.isArray(tplRes.body.templates));
  assert.ok(tplRes.body.templates.some(tpl => tpl.id === 'template-head-carousel'));
  assert.ok(Array.isArray(tplRes.body.presets));

  // 2. Create a new design via API in demo subaccount
  const createRes = await send('/api/prancheta/files?workspace=demo', {
    name: 'Post Promocional API',
    format: 'instagram-feed',
    width: 1080,
    height: 1080,
    thumbnail: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  });
  assert.equal(createRes.status, 200);
  assert.ok(createRes.body.id);
  const designId = createRes.body.id;

  // 3. Get single file with full DocumentData representation
  const fileRes = await send(`/api/prancheta/file?workspace=demo&id=${designId}`);
  assert.equal(fileRes.status, 200);
  assert.equal(fileRes.body.id, designId);
  assert.equal(fileRes.body.name, 'Post Promocional API');
  assert.ok(fileRes.body.document);
  assert.equal(fileRes.body.document.version, 1);

  // 3b. Save full vector DocumentData (as sent by Steam LAB editor)
  const steamDoc = {
    version: 1,
    name: 'Steam Vector Art',
    pages: [{ id: 'p1', name: 'Page 1', children: ['n1'], background: '#101014' }],
    nodes: {
      n1: { id: 'n1', type: 'FRAME', name: 'Root Frame', x: 0, y: 0, width: 1080, height: 1080 }
    },
    images: {}
  };
  const saveSteamRes = await send('/api/prancheta/save?workspace=demo', {
    name: 'Steam Vector Art',
    document: steamDoc
  });
  assert.equal(saveSteamRes.status, 200);
  assert.ok(saveSteamRes.body.id);
  const steamFileRes = await send(`/api/prancheta/file?workspace=demo&id=${saveSteamRes.body.id}`);
  assert.equal(steamFileRes.body.name, 'Steam Vector Art');
  assert.equal(steamFileRes.body.document.nodes.n1.name, 'Root Frame');

  // 3c. List designs
  const listRes = await send('/api/prancheta/files?workspace=demo');
  assert.equal(listRes.status, 200);
  assert.ok(listRes.body.files.some(f => f.id === designId));

  // 4. Duplicate design
  const dupRes = await send('/api/prancheta/duplicate?workspace=demo', { id: designId });
  assert.equal(dupRes.status, 201);
  assert.ok(dupRes.body.id);

  // 5. Export to Mídia Drive
  const exportRes = await send('/api/prancheta/export-media?workspace=demo', {
    id: designId,
    name: 'Arte Exportada API'
  });
  assert.equal(exportRes.status, 200);
  assert.ok(exportRes.body.fileId);

  // 6. Delete design
  const delRes = await send('/api/prancheta/delete?workspace=demo', { id: designId });
  assert.equal(delRes.status, 200);
  assert.ok(!delRes.body.files.some(f => f.id === designId));
});

test('Prancheta: Located in Agency navigation and NOT in Subaccount navigation', () => {
  // Subaccount nav must NOT contain prancheta
  assert.equal(subaccountNav.some(item => item[0] === 'prancheta'), false, 'Subaccount nav must not contain prancheta');

  // Agency nav MUST contain prancheta
  const agencyPrancheta = agencyNav.find(item => item[0] === 'prancheta');
  assert.ok(agencyPrancheta, 'Agency nav must contain prancheta');
  assert.equal(agencyPrancheta[1], 'Prancheta');
  assert.equal(agencyPrancheta[2], 'palette');
});

test('Prancheta: Agency initializes, hydrates and executes prancheta CRUD actions', () => {
  const agency = blankAgency();
  assert.ok(Array.isArray(agency.pranchetaFiles), 'Agency should have pranchetaFiles array');
  assert.equal(agency.pranchetaFiles.length, 0);

  const raw = { ...blankAgency() };
  delete raw.pranchetaFiles;
  const hydrated = hydrateAgency(raw);
  assert.ok(Array.isArray(hydrated.pranchetaFiles));

  // 1. Create artwork in agency
  const fileId = executeAgency(agency, {
    type: 'prancheta-save',
    data: {
      name: 'Carrossel Branding Agência',
      format: 'instagram-carousel',
      width: 1080,
      height: 1350,
      pages: [
        {
          id: 'slide-1',
          name: 'Capa',
          background: '#101014',
          nodes: [
            { id: 't1', type: 'TEXT', text: 'Identidade da Agência', x: 80, y: 200, fontSize: 50 }
          ]
        }
      ]
    }
  });

  assert.ok(fileId);
  assert.equal(agency.pranchetaFiles.length, 1);
  assert.equal(agency.pranchetaFiles[0].name, 'Carrossel Branding Agência');

  // 2. Duplicate artwork
  const copyId = executeAgency(agency, {
    type: 'prancheta-duplicate',
    id: fileId
  });
  assert.ok(copyId);
  assert.equal(agency.pranchetaFiles.length, 2);
  assert.equal(agency.pranchetaFiles[0].name, 'Carrossel Branding Agência (Cópia)');

  // 3. Create from template
  const tplId = executeAgency(agency, {
    type: 'prancheta-template',
    data: { templateId: 'template-head-carousel' }
  });
  assert.ok(tplId);
  assert.equal(agency.pranchetaFiles.length, 3);
  assert.equal(agency.pranchetaFiles[0].name, 'Carrossel Método HEAD');

  // 4. Delete artwork
  executeAgency(agency, {
    type: 'prancheta-delete',
    id: copyId
  });
  assert.equal(agency.pranchetaFiles.length, 2);
  assert.ok(!agency.pranchetaFiles.some(f => f.id === copyId));
});


const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const editorDoc = (name = 'Arte do editor') => ({
  version: 1,
  name,
  pages: [{ id: 'p1', name: 'Página 1', background: null, children: ['f1', 'f2'] }],
  nodes: {
    f1: { id: 'f1', type: 'FRAME', name: 'Capa', parentId: 'p1', x: 0, y: 0, width: 1080, height: 1350, fills: [{ type: 'SOLID', color: '#22222D', opacity: 1, visible: true }], children: [] },
    f2: { id: 'f2', type: 'FRAME', name: 'Lâmina 2', parentId: 'p1', x: 1160, y: 0, width: 1080, height: 1350, fills: [], children: [] }
  },
  images: {}
});

test('Prancheta: salvar do editor resume as lâminas sem duplicar os nós e guarda o tamanho do frame', () => {
  const ws = blank('Subconta');
  const id = execute(ws, { type: 'prancheta-save', data: { name: 'Arte do editor', document: editorDoc() } });
  const file = ws.pranchetaFiles.find(f => f.id === id);
  assert.equal(file.width, 1080);
  assert.equal(file.height, 1350);
  assert.deepEqual(file.pages.map(p => p.name), ['Capa', 'Lâmina 2']);
  assert.ok(file.pages.every(p => p.nodes.length === 0));
  assert.equal(file.pages[0].background, '#22222D');
  assert.equal(file.document.nodes.f1.name, 'Capa');
});

test('Prancheta: gravação só de miniatura não apaga a arte nem muda a data de alteração', () => {
  for (const [state, run] of [
    [blank('Subconta'), (s, cmd) => execute(s, cmd)],
    [blankAgency('Agência'), (s, cmd) => executeAgency(s, cmd, { actor: 'Teste' })]
  ]) {
    const id = run(state, { type: 'prancheta-save', data: { name: 'Carrossel', format: 'instagram-carousel', tags: ['Template'], document: editorDoc('Carrossel') } });
    const file = state.pranchetaFiles.find(f => f.id === id);
    const before = file.updated;
    run(state, { type: 'prancheta-save', id, data: { thumbnail: PNG } });
    assert.equal(file.thumbnail, PNG);
    assert.equal(file.name, 'Carrossel');
    assert.equal(file.format, 'instagram-carousel');
    assert.deepEqual(file.tags, ['Template']);
    assert.ok(file.document?.nodes?.f1);
    assert.equal(file.updated, before);

    // O salvamento automático do editor (sem miniatura) mantém a miniatura, o formato e as etiquetas.
    run(state, { type: 'prancheta-save', id, data: { name: 'Carrossel v2', document: editorDoc('Carrossel v2'), expectedUpdatedAt: before } });
    assert.equal(file.name, 'Carrossel v2');
    assert.equal(file.thumbnail, PNG);
    assert.equal(file.format, 'instagram-carousel');
    assert.deepEqual(file.tags, ['Template']);

    assert.throws(() => run(state, { type: 'prancheta-save', id: 'nao-existe', data: { thumbnail: PNG } }), e => e.status === 404);
    assert.throws(() => run(state, { type: 'prancheta-save', id, data: { thumbnail: 'javascript:alert(1)' } }), /Miniatura inválida/);
  }
});

test('Prancheta: gravação com versão antiga é recusada com 409', () => {
  const ws = blank('Subconta');
  const id = execute(ws, { type: 'prancheta-save', data: { name: 'Arte', document: editorDoc('Arte') } });
  assert.throws(
    () => execute(ws, { type: 'prancheta-save', id, data: { name: 'Outra aba', document: editorDoc('Outra aba'), expectedUpdatedAt: '2000-01-01T00:00:00.000Z' } }),
    e => e.status === 409
  );
  assert.equal(ws.pranchetaFiles.find(f => f.id === id).name, 'Arte');
});

test('Prancheta: arquivos antigos e modelos abrem no editor com um frame por lâmina', async () => {
  const { graaoToDocument } = await import('../prancheta-model.mjs');
  const tpl = createCanonicalTemplates().find(t => t.id === 'template-head-carousel');
  const doc = graaoToDocument({ name: tpl.name, width: tpl.width, height: tpl.height, pages: tpl.pages });
  assert.equal(doc.pages.length, 1);
  const frames = doc.pages[0].children.map(id => doc.nodes[id]);
  assert.equal(frames.length, tpl.pages.length);
  assert.ok(frames.every(f => f.type === 'FRAME' && f.width === 1080 && f.height === 1350 && f.clipsContent));
  assert.equal(frames[1].x, 1080 + 80);
  assert.equal(frames[0].fills[0].color, '#101014');
  const title = doc.nodes['title-1'];
  assert.equal(title.parentId, frames[0].id);
  assert.equal(title.lineHeight, Math.round(1.15 * 68), 'altura de linha vira px');
  assert.equal(title.textAutoResize, 'HEIGHT');
  assert.ok(title.width > 0);
  assert.ok(Object.values(doc.nodes).every(n => n.fills.every(p => p.visible === true && p.opacity === 1)));
});

test('Prancheta: página do editor e pacote são servidos, com iframe só da própria graao', async (t) => {
  const { makeServer } = await import('../server.mjs');
  const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath: ':memory:', port: 0, socialScheduler: false });
  await new Promise((resolve, reject) => { server.on('error', reject); server.listen(0, host, resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://${host}:${server.address().port}`;

  const page = await fetch(`${base}/prancheta-editor.html`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /\/vendor\/prancheta-editor\.js/);
  const pageCsp = page.headers.get('content-security-policy');
  assert.match(pageCsp, /frame-ancestors 'self'/);
  assert.match(pageCsp, /'wasm-unsafe-eval'/);

  const app = await fetch(`${base}/app`);
  assert.match(app.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.doesNotMatch(app.headers.get('content-security-policy'), /wasm-unsafe-eval/);

  for (const path of ['/vendor/prancheta-editor.js', '/vendor/prancheta-editor.css']) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path);
    assert.ok((await r.text()).length > 1000, path);
  }

  // Conflito pela API: o editor recebe 409 e mostra "Reabrir / salvar cópia".
  const post = (path, body) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(body) });
  const created = await (await post('/api/prancheta/save?workspace=demo', { name: 'Arte', document: editorDoc('Arte') })).json();
  const opened = await (await fetch(`${base}/api/prancheta/file?workspace=demo&id=${created.id}`)).json();
  const ok = await post('/api/prancheta/save?workspace=demo', { id: created.id, name: 'Arte', document: editorDoc('Arte'), expectedUpdatedAt: opened.updated_at });
  assert.equal(ok.status, 200);
  const saved = (await ok.json()).file;
  assert.ok(saved.updated_at);
  const stale = await post('/api/prancheta/save?workspace=demo', { id: created.id, name: 'Arte', document: editorDoc('Arte'), expectedUpdatedAt: '2000-01-01T00:00:00.000Z' });
  assert.equal(stale.status, 409);
});
