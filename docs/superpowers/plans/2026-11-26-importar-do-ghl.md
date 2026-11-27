# Importar do GHL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A agência que sai do GHL clica numa extensão do Chrome dentro da subconta do GHL e o snapshot vira um setup completo em Setups de conta → Importados.

**Architecture:** A extensão (MV3) injeta um leitor na aba do GHL que usa o cliente HTTP do próprio app (sem tocar em token) e envia o resultado em partes para a graao, autenticada por um código de importação de uso único. A graao guarda as partes em linhas do store, e a janela de importação conduz a conversão em passos curtos (baixar páginas, converter com o conversor do PR 191, copiar imagens, salvar o setup). As páginas dos sites ficam em linhas próprias, fora do estado da agência.

**Tech Stack:** Node (ESM, sem framework), store (`storage.mjs`, SQLite nos testes, Supabase em produção), `node:test`, Chrome Extension Manifest V3, front-end em `ui/` espelhado em `public/`.

**Spec:** `docs/superpowers/specs/2026-11-26-importar-do-ghl-design.md`

## Global Constraints

- A graao nunca recebe senha, token ou cookie do GHL; a extensão nunca escreve no GHL (só `GET`).
- Código de importação: 30 minutos, uso único, ligado a uma agência; guardado só como SHA-256.
- Cada parte enviada pela extensão: no máximo 3 MB (limite da Vercel ~4,5 MB). Total por importação: no máximo 60 MB.
- Cada passo de conversão termina em menos de 20 s (até 10 páginas ou 20 imagens por passo).
- 50 setups por agência (regra existente em `agency-model.mjs`); site com mais de `SITE_LIMITS.pages` (50) páginas entra com as 50 primeiras e uma nota.
- Imagens copiadas: só png, jpg, webp e gif, até 5 MB cada; viram `/asset/<sha256>.<ext>` (`asset-store.mjs`) com a origem pública na frente.
- Sem tradução automática; sem contatos, conversas, oportunidades, pagamentos ou cursos.
- Sem `confirm`/`alert`/`prompt` nativos (usar `ui/ask.js`); textos da interface em português; `ui/` é a fonte e `public/` é gerado por `node scripts/sync-public.mjs`.
- Documentação no mesmo PR (artigo, novidades, `docs:secoes`, `cobertura.json`), prints só da Agência Demo local.

## Review Focus

1. Código expirado, já usado ou digitado errado: a extensão mostra "Código inválido ou expirado. Gere outro na graao." e não envia nada (Task 4, teste `rejects expired, used and unknown codes`).
2. Um endereço do GHL falha (ex.: pesquisas 404): o leitor segue, guarda o erro em `errors`, e o relatório lista "Não consegui ler: …" (Task 5 `keeps reading when one endpoint fails`; Task 4 `report lists reader errors`).
3. Imagem que não baixa, não é imagem ou passa de 5 MB: fica o endereço original e entra uma nota; a importação termina (Task 4 `keeps the original url when an image cannot be copied`).
4. Agência já com 50 setups: gerar o código já falha com "Você já tem 50 setups…" (Task 2 `refuses a code when the agency has 50 setups`).
5. Pré-visualização de página que responde 404: a página entra vazia com nota e o site é salvo mesmo assim (Task 4 `saves the site when a page preview fails`).

---

### Task 1: Conversor do GHL como módulo do servidor

**Files:**
- Create: `ghl-convert/convert.mjs` (conteúdo de `scripts/ghl-template/convert.mjs` sem `loadSource` e sem `node:fs`)
- Create: `ghl-convert/page-html.mjs` (movido de `scripts/ghl-template/page-html.mjs`)
- Modify: `scripts/ghl-template/build.mjs`, `scripts/ghl-template/convert.mjs` (vira só `loadSource` + reexport), `scripts/ghl-template/textos.mjs`
- Test: `test/ghl-convert.test.mjs`, `test/fixtures/ghl-location.json`

**Interfaces:**
- Produces: `convert(source: { dump, triggers, surveys, page: (pageId) => string }, meta: { prefix: string, skipKnowledgeBases?: RegExp[] }) => { assets, sites: { [projectId]: Array<{ name, slug, html }> }, notes: string[] }` em `ghl-convert/convert.mjs` (mesma saída de hoje).
- Produces: `pagesOf(dump) => Array<{ pageId: string, funnelId: string }>` em `ghl-convert/convert.mjs` (as páginas que o conversor vai pedir a `page()`, na ordem, pulando funis cujo nome termina em "copy", como `fetch-pages.mjs`).
- Produces: `imageUrls(value) => string[]` em `ghl-convert/page-html.mjs` (endereços http(s) de imagens em `src`, `srcset`, `url(...)` e `background`), e `replaceUrls(value, map: Map<string,string>) => value` (troca em string ou objeto profundo).

- [ ] **Step 1:** Criar `test/fixtures/ghl-location.json`: um dump sintético (sem dados reais) no formato do extrator, com `location { _id: 'LocFixture000000000a', companyId: 'CoFixture', name: 'Jardim Teste' }`, 2 campos de contato (um dropdown), 2 valores, 3 tags, 1 pipeline com 3 etapas, 1 agenda, 1 formulário com redirecionamento para `{{ custom_values.site }}/obrigado`, 1 pesquisa sem e-mail, 2 workflows (um com gatilho de formulário e passos de SMS, espera e tag), 1 site com 2 páginas (`home`, `obrigado`) e `triggers` / `surveys` no mesmo arquivo sob as chaves `triggers` e `surveys`.
- [ ] **Step 2: Testes que falham** em `test/ghl-convert.test.mjs`:
  - `converts a synthetic GHL location into a complete setup`: `convert({ dump, triggers, surveys, page: id => '<html><body><h1>Oi</h1><img src="https://assets.cdn.filesafe.space/x/a.png"></body></html>' }, { prefix: 'gi' })` dá `assets.customFields.length === 2`, `assets.tags.length === 3`, `assets.workflows.length === 2`, `Object.keys(sites).length === 1`, cada página com `html` não vazio.
  - `lists the pages the converter will read`: `pagesOf(dump).map(p => p.pageId)` igual aos ids das 2 páginas da fixture.
  - `finds and replaces image urls`: `imageUrls('<img src="https://a/x.png"><div style="background:url(https://a/y.jpg)">')` dá `['https://a/x.png','https://a/y.jpg']`; `replaceUrls({ html: '<img src="https://a/x.png">' }, new Map([['https://a/x.png','https://graao.com/asset/h.png']])).html` contém o novo endereço.
- [ ] **Step 3:** Rodar `node --test test/ghl-convert.test.mjs`; esperado: FAIL (módulo não existe).
- [ ] **Step 4:** Mover o conversor para `ghl-convert/`, ajustar o import de `ui/form-fields.js`, implementar `pagesOf`, `imageUrls`, `replaceUrls`. `scripts/ghl-template/convert.mjs` passa a exportar `loadSource` e reexportar `convert` de `../../ghl-convert/convert.mjs`.
- [ ] **Step 5:** Rodar `node --test test/ghl-convert.test.mjs test/setup-templates-ghl.test.mjs`; esperado: PASS.
- [ ] **Step 6:** Regerar os templates com `node scripts/ghl-template/build.mjs "D:/meus documentos/graao.app/.gstack/tmp/ghl"` e rodar `git diff --stat setup-templates/`; esperado: nenhuma mudança (a saída é a mesma).
- [ ] **Step 7:** Commit `refactor(ghl): conversor do GHL como módulo do servidor`.

### Task 2: Código de importação e estado do job

**Files:**
- Create: `ghl-import-model.mjs`
- Modify: `agency-model.mjs` (`ghlImports: []` nos padrões do estado da agência, linha ~68)
- Test: `test/ghl-import-model.test.mjs`

**Interfaces:**
- Produces, em `ghl-import-model.mjs`:
  - `newImportCode(agency, { now = Date.now(), random = randomBytes }) => { code: string, job }` — `code` com 9 caracteres de `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, exibido como `XXX-XXX-XXX`; `job = { id, codeHash, expiresAt (now + 30 min), status: 'waiting', parts: {}, received: {}, pagesDone: 0, pagesTotal: 0, imagesDone: 0, imagesTotal: 0, location: '', notes: [], errors: [], snapshotId: '', created }`. Lança `'Você já tem 50 setups. Apague um antes de importar.'` quando `agency.snapshots.length >= 50`. Empurra o job em `agency.ghlImports`, guardando só os 10 mais recentes.
  - `codeHash(code: string) => string` (SHA-256 hex do código sem hífens, em maiúsculas).
  - `jobByCode(agency, code, { now }) => job` — lança erro 401 `'Código inválido ou expirado. Gere outro na graao.'` se não existe, expirou ou `status` não é `'waiting'` nem `'receiving'`.
  - `acceptPart(job, { name: 'dump'|'triggers'|'surveys', index: number, total: number, bytes: number }) => void` — marca `status = 'receiving'`, guarda `parts[name] = total` e `received[name] = [...índices]`; lança se `bytes > 3 MB` ou se a soma passar de 60 MB.
  - `finishUpload(job) => void` — exige todas as partes recebidas; `status = 'received'`.
- [ ] **Step 1: Testes que falham:** `issues a 9-character code that expires in 30 minutes` (formato `/^[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/`, `expiresAt - created === 1800000`, `job.codeHash !== code`); `refuses a code when the agency has 50 setups`; `rejects expired, used and unknown codes` (31 min depois → 401; após `status = 'done'` → 401; código errado → 401); `refuses a part over 3 MB and an upload over 60 MB`; `finishUpload needs every part` (falta `triggers` → erro `'Faltam partes da importação.'`).
- [ ] **Step 2:** Rodar `node --test test/ghl-import-model.test.mjs`; esperado: FAIL.
- [ ] **Step 3:** Implementar as funções acima.
- [ ] **Step 4:** Rodar o teste; esperado: PASS.
- [ ] **Step 5:** Commit `feat(ghl): código de importação e estado do job`.

### Task 3: Páginas do setup fora do estado da agência

**Files:**
- Create: `setup-sites-store.mjs`
- Modify: `server.mjs` (criar subconta com setup, ~linha 838; carregar setup numa subconta, ~linha 1266; `snapshot-delete` apaga as linhas)
- Test: `test/setup-sites-store.test.mjs`

**Interfaces:**
- Produces: `saveSetupSites(store, snapshotId, sites: { [projectId]: siteDoc }) => Promise<void>` (uma linha por projeto: `setup-sites-<snapshotId>-<projectId>`, e uma linha índice `setup-sites-<snapshotId>` com a lista de projetos), `loadSetupSites(store, snapshotId) => Promise<{ [projectId]: siteDoc }>`, `removeSetupSites(store, snapshotId) => Promise<void>`.
- Contrato: um setup com `sitesStored: true` não tem `studioSites` no estado da agência; o servidor chama `loadSetupSites` antes de `applyStudioSites`.
- [ ] **Step 1: Testes que falham:** `round-trips the sites of a setup` (salva 2 projetos, carrega iguais); `an account created from a stored setup gets its sites` (agência com setup `{ sitesStored: true }` e linhas salvas; `POST /api/agency/accounts { name, snapshotId }` → a subconta nova tem os 2 sites em `state.studioProjects` e o HTML das páginas); `deleting the setup removes its site rows`.
- [ ] **Step 2:** Rodar `node --test test/setup-sites-store.test.mjs`; esperado: FAIL.
- [ ] **Step 3:** Implementar o módulo e as três chamadas no `server.mjs`.
- [ ] **Step 4:** Rodar o teste e `node --test test/agency*.test.mjs`; esperado: PASS.
- [ ] **Step 5:** Commit `feat(setup): páginas de setup guardadas fora do estado da agência`.

### Task 4: Rotas da importação e conversão em passos

**Files:**
- Create: `ghl-import-run.mjs` (passos da conversão), `routes/ghl-import.mjs` (rotas)
- Modify: `server.mjs` (registrar as rotas; `op === 'ghl-import-code'` no bloco das operações da agência)
- Test: `test/ghl-import.test.mjs`

**Interfaces:**
- Consumes: Task 1 (`convert`, `pagesOf`, `imageUrls`, `replaceUrls`), Task 2 (todas), Task 3 (`saveSetupSites`), `saveAssets` de `asset-store.mjs`, `newSiteDoc` de `studio-site.mjs`.
- Produces (HTTP):
  - `POST /api/agency/ghl-import-code` (agência logada, capacidade `settings`) → `{ code, jobId, expiresAt }`.
  - `POST /api/ghl-import/part` (sem sessão; cabeçalho `X-Graao-Import-Code`; corpo JSON `{ name, index, total, data: string }`) → `{ ok: true }`. Guarda `data` na linha `ghl-import-<jobId>-<name>-<index>`. Responde a `OPTIONS` com CORS para `chrome-extension://*`.
  - `POST /api/ghl-import/done` (mesmo cabeçalho) → `{ ok: true, jobId }`.
  - `GET /api/agency/ghl-import/<jobId>` → o job sem `codeHash`.
  - `POST /api/agency/ghl-import/<jobId>/step` → roda um passo e devolve o job.
- Produces: `runStep(job, io) => Promise<void>` em `ghl-import-run.mjs`, com `io = { readPart(name) => Promise<string>, readPage(pageId), writePage(pageId, html), fetch, saveImages(found: Map), saveSites(snapshotId, sites), addSetup(snap) => Promise<string>, origin }`. Fases de `job.status`: `received` → `pages` (até 10 pré-visualizações de `https://sites.leadconnectorhq.com/preview/<pageId>` por passo) → `converting` (roda `convert` com `prefix: 'gi'`, cria os `siteDoc` com `newSiteDoc`, limita a 50 páginas por site) → `images` (até 20 imagens por passo) → `done` (setup salvo em Importados com `kind: 'imported'`, `origin: 'ghl'`, `name: '<nome da subconta> (GHL)'`, `sitesStored: true`, `notes`). Erro inesperado: `status = 'failed'`, `error` com a mensagem.
- [ ] **Step 1: Testes que falham** (servidor `makeServer` em memória, `fetch` falso que serve a pré-visualização e as imagens da fixture):
  - `imports a GHL location end to end`: gera código, envia `dump`/`triggers`/`surveys` da fixture em partes, `done`, chama `step` até `status === 'done'`; o setup aparece em `GET /api/agency` com `kind: 'imported'` e `origin: 'ghl'`; criar subconta com ele dá 2 workflows, 3 tags e o site com 2 páginas.
  - `rejects expired, used and unknown codes` (no `part`: 401 com a mensagem da Task 2).
  - `report lists reader errors` (dump com `errors: ['404 surveys']` → `job.notes` contém `'Não consegui ler: 404 surveys'`).
  - `keeps the original url when an image cannot be copied` (fetch da imagem responde 404 → HTML mantém o endereço original e há nota).
  - `saves the site when a page preview fails` (pré-visualização 404 → site salvo, página com nota `'A página <nome> não pôde ser baixada.'`).
  - `replaces copied images with graao asset urls` (imagem copiada → `https://graao.com/asset/<sha256>.png` no HTML).
- [ ] **Step 2:** Rodar `node --test test/ghl-import.test.mjs`; esperado: FAIL.
- [ ] **Step 3:** Implementar `ghl-import-run.mjs`, `routes/ghl-import.mjs` e o registro no `server.mjs`. A origem pública vem de `PORTAL_PUBLIC_ORIGIN` (padrão `https://graao.com`). As linhas temporárias `ghl-import-<jobId>-*` são apagadas ao terminar.
- [ ] **Step 4:** Rodar o teste e `npm test`; esperado: PASS.
- [ ] **Step 5:** Commit `feat(ghl): importação do GHL em partes e conversão em passos`.

### Task 5: Extensão do Chrome

**Files:**
- Create: `extensions/ghl-import/manifest.json`, `extensions/ghl-import/popup.html`, `extensions/ghl-import/popup.js`, `extensions/ghl-import/reader.js`, `extensions/ghl-import/icon-128.png`, `extensions/ghl-import/README.md`
- Test: `test/ghl-extension.test.mjs`

**Interfaces:**
- Consumes: as rotas `part` e `done` da Task 4.
- Produces: `reader.js` é um script clássico que define `globalThis.graaoGhlReader = { readLocation(http, locationId, onProgress) => Promise<dump> }`, onde `http.get(url) => Promise<{ data }>` é o cliente do app do GHL (`__vue_app__.config.globalProperties.$http`). Lê o mesmo que `extract.tpl.js` do PR 191, mais os gatilhos (`/workflow/<L>/trigger?workflowId=<W>`) e as pesquisas, e usa `location.companyId` no lugar do id de agência fixo. `onProgress({ step: string, done: number, total: number })`.
- `manifest.json`: `manifest_version: 3`, nome `graao: Importar do GHL`, `permissions: ['activeTab', 'scripting', 'storage']`, `host_permissions: ['https://graao.com/*', 'http://localhost/*', 'http://127.0.0.1/*']`, `action.default_popup: 'popup.html'`.
- `popup.js`: lê o id da subconta da URL da aba (`/location/<id>/`; sem ele, mostra "Abra uma subconta no GHL"), pede o código, injeta `reader.js` e roda `readLocation` com `world: 'MAIN'`, mostra o progresso e envia em partes de até 3 MB. Endereço da graao configurável num campo "Avançado" (padrão `https://graao.com`), guardado em `chrome.storage.local`.
- [ ] **Step 1: Testes que falham** (carregam `reader.js` com `node:vm` e um `http` falso):
  - `reads a location with every item the converter needs`: o dump tem `customFields`, `tags`, `pipelines`, `forms` (com o conteúdo), `surveys`, `workflows` (com passos), `triggers` (por workflow), `funnels` (com `pages`) e `errors: []`; nenhuma chamada é diferente de `GET`.
  - `keeps reading when one endpoint fails`: o `http` falso lança 404 nas pesquisas → `errors` tem um item com `surveys` e o resto vem.
  - `the manifest asks only for activeTab, scripting and storage`.
- [ ] **Step 2:** Rodar `node --test test/ghl-extension.test.mjs`; esperado: FAIL.
- [ ] **Step 3:** Implementar a extensão.
- [ ] **Step 4:** Rodar o teste; esperado: PASS. Teste manual: carregar a pasta em `chrome://extensions` (modo desenvolvedor), abrir uma subconta do GHL, importar para a graao local (`npm start`) e conferir o setup em Importados.
- [ ] **Step 5:** Commit `feat(ghl): extensão do Chrome para importar do GHL`.

### Task 6: Janela "Importar do GHL" na graao

**Files:**
- Modify: `ui/agency.js` (botão ao lado de "Importar setup", linha ~564; caso `ghl-import` no `switch` de diálogos, ~linha 1610), `ui/agency.css` se precisar
- Generated: `public/agency.js` (via `node scripts/sync-public.mjs`)
- Test: `test/agency-ghl-import-ui.test.mjs`

**Interfaces:**
- Consumes: rotas da Task 4.
- Comportamento: o botão **Importar do GHL** (ícone `download`) abre um diálogo com os 3 passos do spec, o link **Instalar no Chrome** (constante `GHL_EXTENSION_URL`, por enquanto o artigo da central de ajuda), o código grande e "vale 30 min". Consulta `GET …/ghl-import/<jobId>` a cada 2 s; ao ver `received`, chama `step` em sequência e mostra a fase ("Baixando páginas 12/41", "Convertendo", "Copiando imagens 8/30"); em `done`, mostra o relatório (contagens e `notes`) e o botão **Ver setup**; em `failed`, a mensagem e **Tentar de novo** (gera outro código).
- [ ] **Step 1: Teste que falha:** `the Importados tab shows the GHL import button and dialog` (renderiza a aba com o DOM falso usado nos testes de `ui/agency.js` e confere o botão e o código formatado `XXX-XXX-XXX` no diálogo).
- [ ] **Step 2:** Rodar; esperado: FAIL.
- [ ] **Step 3:** Implementar no `ui/agency.js` com os diálogos de `ui/ask.js`; rodar `node scripts/sync-public.mjs`.
- [ ] **Step 4:** Rodar o teste e `test/public-mirror.test.mjs`; esperado: PASS. Conferir no navegador (Agência Demo local) o diálogo, o progresso com um job simulado e o relatório.
- [ ] **Step 5:** Commit `feat(ghl): janela Importar do GHL em Setups de conta`.

### Task 7: Central de ajuda e painéis

**Files:**
- Create: `docs-site/src/content/docs/agencia/importar-do-ghl.mdx` (modelo `_modelo.mdx`), `docs-site/roteiros/importar-do-ghl.mjs`
- Modify: `docs-site/src/content/docs/comece-aqui/novidades.mdx`, `docs-site/cobertura.json`, `docs/implementation/painel/progresso.js`
- [ ] **Step 1:** Escrever o artigo: para que serve, requisitos (Chrome, login de agência no GHL, snapshot carregado numa subconta), instalar a extensão (loja e, até a aprovação, "carregar sem compactação"), passo a passo com um print por passo, o que vem e o que não vem, perguntas frequentes (código expirou, GHL com domínio próprio, imagens, mais de 50 páginas, a graao vê minha senha do GHL? não).
- [ ] **Step 2:** Roteiro de prints na Agência Demo: aba Importados com o botão, diálogo com o código, progresso (job simulado), relatório. Rodar `node roteiros/capturar.mjs roteiros/importar-do-ghl.mjs` em `docs-site/` e `node docs-site/scripts/midia.mjs local docs-site/.midia/agencia/importar-do-ghl agencia importar-do-ghl`.
- [ ] **Step 3:** Linha `### 2026-11-26 · Importar do GHL` em novidades; `npm run docs:secoes`; marcar em `cobertura.json`; linha no histórico de `progresso.js`.
- [ ] **Step 4:** Rodar `npm run docs:build` e `npm run docs:test`; esperado: build completo e testes passando.
- [ ] **Step 5:** Commit `docs(ghl): artigo Importar do GHL`.
