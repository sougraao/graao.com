# Planejador de eventos · Fase 1 (visual e paridade) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refazer a tela Marketing › Eventos no padrão visual do Graao e trazer tudo o que o planejador do Parceiras Conselho tem.

**Architecture:** O evento continua em `eventPlans` com `plan = { brief, items }`. O modelo (`event-planner-model.mjs`) ganha controle de revisão e campos novos; os dados do modelo de lançamento vão para `ui/event-planner-data.js`; um editor de copy no formato do WhatsApp vira módulo próprio (`ui/event-copy-editor.js`); `ui/event-planner.js` passa a usar `pageShell`, `utabs`, `.metrics/.metric`, `.badge`, `dialog` e tokens `--g-*`. Funções de renderização retornam HTML e são testáveis em Node.

**Tech Stack:** Node 26 ESM, `node:test`, front-end em JS puro (template strings), CSS com tokens de `ui/graao.css`.

**Spec:** `docs/superpowers/specs/2026-11-23-planejador-eventos-paridade-design.md`

**Fonte da paridade:** `D:\meus documentos\Parceiras Conselho\mutirao-mentoria\events.js` (modelo nas linhas 84–303, regras de formulário 617–669).

## Global Constraints

- `ui/` é a fonte; ao fim de cada tarefa que mexe em `ui/`, rodar `node scripts/sync-public.mjs` (o teste `test/public-mirror.test.mjs` exige o espelho). Nunca copiar `public/` para `ui/`.
- Todo comando/coleção nova passa por `authorization.mjs` e tem teste que chama `requireWorkspaceCommand`.
- Nenhuma cor hexadecimal, `rgb()` ou `hsl()` fixa em `ui/event-planner.css`; só `var(--g-…)` e as variáveis já usadas no app (`--line`, `--dim`, `--ink`, `--blue`).
- Textos da interface em português do Brasil.
- Eventos já salvos precisam continuar abrindo e salvando sem erro (sem `revision`, sem `code`, sem `ownerId`).
- Variável de personalização: `{{contact.first_name}}`.
- Comandos de teste: `node --test test/event-planner.test.mjs` (rápido) e `npm test` (completo, 640+ testes).

## Review Focus

1. Evento antigo (sem `revision`) salvo pela tela nova: deve gravar e passar a ter `revision: 1`, sem erro de conflito. → teste na Tarefa 1.
2. Duas abas editando o mesmo evento: a segunda a salvar recebe 409 com a mensagem de conflito e nada é sobrescrito. → teste na Tarefa 1.
3. Usuário removido da agência que era responsável por itens: o item continua mostrando o nome antigo como “Usuário removido (Nome)”, sem quebrar o select. → teste na Tarefa 6.
4. Texto de copy com `<script>` ou `*` sem par: a prévia escapa o HTML e não aplica negrito pela metade. → teste na Tarefa 3.
5. Tema escuro: nenhuma superfície clara fixa na tela. → teste na Tarefa 4 (sem cores fixas) e verificação visual na Tarefa 7.

---

### Task 1: Modelo — revisão, código, responsável por id

**Files:**
- Modify: `event-planner-model.mjs` (função `item` e `eventPlanFields.eventPlans`)
- Test: `test/event-planner.test.mjs`

**Interfaces:**
- Produces: registro `eventPlans` com `revision: number` (0 inexistente → 1 na primeira gravação; +1 a cada gravação). Comando `save` aceita `data.revision`; quando informado e diferente do atual → erro 409 `O evento foi atualizado em outra sessão. Recarregue para ver a versão mais nova antes de salvar.` Itens ganham `ownerId: string(≤64)` (todos os tipos) e `code: string(≤40)` (só `message`). `owner` continua como rótulo (≤120).

- [ ] **Step 1: Write the failing tests** (em `test/event-planner.test.mjs`)

```js
test('Event plan revision rejects stale saves and upgrades older records', () => {
  const state = blank();
  const id = save(state, 'eventPlans', { title: 'Aula', eventDate: '2026-12-05', plan: plan() });
  assert.equal(state.eventPlans[0].revision, 1);
  save(state, 'eventPlans', { title: 'Aula 2', revision: 1 }, id);
  assert.equal(state.eventPlans[0].revision, 2);
  assert.throws(() => save(state, 'eventPlans', { title: 'Aula 3', revision: 1 }, id), err => err.status === 409 && /outra sessão/.test(err.message));
  delete state.eventPlans[0].revision;                       // registro antigo
  save(state, 'eventPlans', { title: 'Aula 4' }, id);
  assert.equal(state.eventPlans[0].revision, 1);
});

test('Event plan items keep message code and owner id', () => {
  const state = blank();
  const items = plan().items.map(row => row.kind === 'message' ? { ...row, code: 'GRUPO-01', ownerId: 'u1' } : row);
  save(state, 'eventPlans', { title: 'Com código', eventDate: '2026-12-05', plan: { ...plan(), items } });
  const message = state.eventPlans[0].plan.items.find(row => row.kind === 'message');
  assert.equal(message.code, 'GRUPO-01');
  assert.equal(message.ownerId, 'u1');
  assert.equal(state.eventPlans[0].plan.items.find(row => row.kind === 'task').code, undefined);
});
```

- [ ] **Step 2: Run** `node --test test/event-planner.test.mjs` — Expected: FAIL (`revision` undefined).

- [ ] **Step 3: Implement** em `event-planner-model.mjs`: `ownerId: str(value.ownerId, 64)` no `base` de `item`; `code: str(value.code, 40)` no retorno de `message`; em `eventPlanFields.eventPlans`, comparar `d.revision` (quando `!== undefined` e `prior`) com `prior.revision || 0` e falhar com status 409; retornar `revision: prior ? (prior.revision || 0) + 1 : 1`. A duplicação (`event-plan-duplicate`) deve gravar a cópia com `revision: 1`.

- [ ] **Step 4: Run** `node --test test/event-planner.test.mjs` — Expected: PASS (todos).

- [ ] **Step 5: Commit** `git add event-planner-model.mjs test/event-planner.test.mjs && git commit -m "feat(eventos): revisão do evento, código e responsável por id"`

---

### Task 2: Modelo de lançamento completo e estratégia em blocos

**Files:**
- Modify: `ui/event-planner-data.js`
- Test: `test/event-planner-data.test.mjs` (novo)

**Interfaces:**
- Produces:
  - `briefGroups: Array<[groupKey, title, Array<[fieldKey, label, hint]>]>` com exatamente
    `direction` “Objetivo e público” → `goal` “Objetivo e indicadores de sucesso”, `audience` “Público e lista VIP”;
    `communication` “Mensagem e oferta” → `narrative` “Narrativa, tese e mensagens aprovadas”, `offer` “Oferta, entregáveis e bônus”;
    `operation` “Operação e pós-evento” → `logistics` “Formato, local ou plataforma”, `identity` “Identidade visual e materiais”, `followup` “Regras de venda e pós-evento”.
    `briefFields` continua exportado (lista achatada, mesma ordem) para quem já usa.
  - `channels` com rótulos `grupos` “WhatsApp · grupos”, `privado` “WhatsApp · privado”, `instagram` “Instagram · privado”, `email` “E-mail”, `outro` “Outro”.
  - `messageTemplates(eventDate: string) → Array<{ code, channel, title, phase, offset, time, notes }>`.
  - `launchEventPlan(eventDate: string) → { brief, items }` (assinatura atual mantida).

- [ ] **Step 1: Write the failing tests**

```js
import { briefGroups, launchEventPlan, messageTemplates } from '../ui/event-planner-data.js';
test('Launch template mirrors the Parceiras structure', () => {
  const p = launchEventPlan('2026-12-10');
  const count = kind => p.items.filter(row => row.kind === kind).length;
  assert.equal(count('task'), 12); assert.equal(count('agenda'), 7); assert.equal(count('link'), 13);
  const messages = messageTemplates('2026-12-10');
  assert.equal(messages.filter(m => m.channel === 'grupos').length, 27);
  assert.equal(messages.filter(m => m.channel === 'privado').length, 7);
  assert.equal(count('message'), 34);
  assert.equal(new Set(messages.map(m => m.code)).size, 34);
  assert.ok(messages.some(m => m.code === 'GRUPO-01') && messages.some(m => m.code === 'PRIVADO-07'));
  assert.equal(p.items.find(r => r.title === 'Definir objetivo, metas, narrativa e oferta').date, '2026-11-28'); // -12 dias
  assert.ok(Object.values(p.brief).every(Boolean), 'brief inteiro preenchido com marcadores');
});
test('Launch template copy is niche-neutral and uses Graao variables', () => {
  const all = messageTemplates('2026-12-10').map(m => m.notes).join('\n');
  assert.doesNotMatch(all, /\[nome\]|social media|\bposts?\b|cliente pede/i);
  assert.match(messageTemplates('2026-12-10').filter(m => m.channel === 'privado').map(m => m.notes).join(''), /\{\{contact\.first_name\}\}/);
  assert.doesNotMatch(messageTemplates('2026-12-10').filter(m => m.channel === 'grupos').map(m => m.notes).join(''), /\{\{contact\./);
  assert.match(all, /10 de dez\. de 2026|10\/12\/2026/);   // [data do evento] substituída
});
test('Brief groups cover every brief field once', () => {
  assert.deepEqual(briefGroups.map(([key]) => key), ['direction', 'communication', 'operation']);
  assert.deepEqual(briefGroups.flatMap(([, , fields]) => fields.map(([k]) => k)).sort(), ['audience', 'followup', 'goal', 'identity', 'logistics', 'narrative', 'offer']);
});
```

- [ ] **Step 2: Run** `node --test test/event-planner-data.test.mjs` — Expected: FAIL.

- [ ] **Step 3: Implement** portando `templatePlan` e `messageTemplates` do Parceiras (linhas 84–303): mesmas tarefas, offsets, horários, roteiro, links e brief. Regras de adaptação da copy: `[nome]` → `{{contact.first_name}}`; trechos sobre “post”, “social media” e “cliente pede” viram marcadores genéricos (`[pedido típico do seu público]`, `[resultado]`), mantendo a estrutura das mensagens (títulos `## Mensagem N · …`); `[data do evento]` substituída pela data formatada como hoje faz `dateLabel` (pt-BR, `dateStyle: 'medium'`). Itens de mensagem recebem `code`, `channel`, `time`, `team: 'copy'`, `status: 'rascunho'`. Mensagens no formato WhatsApp: `**x**` não existe; usar `*x*` onde o original tinha ênfase.

- [ ] **Step 4: Run** `node --test test/event-planner-data.test.mjs test/event-planner.test.mjs` — Expected: PASS (o modelo novo também precisa passar na validação do servidor; acrescentar ao teste da Tarefa 1 um `save` com `launchEventPlan('2026-12-10')` que não lança erro).

- [ ] **Step 5: Commit** `git add ui/event-planner-data.js test/event-planner-data.test.mjs test/event-planner.test.mjs && node scripts/sync-public.mjs && git add public/event-planner-data.js && git commit -m "feat(eventos): modelo de lançamento completo e estratégia em blocos"`

---

### Task 3: Editor de copy no formato do WhatsApp

**Files:**
- Create: `ui/event-copy-editor.js`
- Modify: `server.mjs` (registrar `/event-copy-editor.js` em `staticFiles`, como `/event-planner-data.js`)
- Test: `test/event-copy-editor.test.mjs` (novo)

**Interfaces:**
- Produces:
  - `applyMark(text: string, start: number, end: number, mark: 'bold'|'italic'|'strike'|'bullet'|'number') → { text, start, end }` — inline envolve a seleção com `*`, `_`, `~` (se já envolvida, remove); `bullet`/`number` prefixam cada linha selecionada com `- ` / `1. `, `2. `…
  - `insertAt(text, start, end, snippet) → { text, start, end }` (variáveis).
  - `whatsappHtml(text: string) → string` — escapa HTML, depois `*a*`→`<strong>`, `_a_`→`<em>`, `~a~`→`<s>` só quando o marcador fecha na mesma linha e não há espaço junto ao marcador interno; linhas `- `/`1. ` viram `<ul>/<ol>`; `## Título` vira `<h4>`; quebras de linha preservadas.
  - `copyEditorField({ name, value, variables = [] }) → string` — HTML com barra (Negrito, Itálico, Tachado, Lista, Lista numerada, Desfazer via `document.execCommand('undo')` não é usado: só os marcadores), select “Inserir variável”, `<textarea name>` e `<div class="ec-preview">`.
  - `bindCopyEditor(root: Element) → void` — liga os botões (`data-ec-mark`, `data-ec-var`) à textarea e atualiza a prévia a cada `input`.

- [ ] **Step 1: Write the failing tests**

```js
import { applyMark, whatsappHtml } from '../ui/event-copy-editor.js';
test('applyMark wraps and unwraps inline marks', () => {
  assert.deepEqual(applyMark('olá mundo', 4, 9, 'bold'), { text: 'olá *mundo*', start: 5, end: 10 });
  assert.equal(applyMark('olá *mundo*', 5, 10, 'bold').text, 'olá mundo');
  assert.equal(applyMark('a\nb', 0, 3, 'number').text, '1. a\n2. b');
});
test('whatsappHtml escapes and renders WhatsApp marks', () => {
  assert.equal(whatsappHtml('<script>x</script>'), '<p>&lt;script&gt;x&lt;/script&gt;</p>');
  assert.match(whatsappHtml('é *muito* bom'), /é <strong>muito<\/strong> bom/);
  assert.doesNotMatch(whatsappHtml('5 * 3 = 15 e 2 * 2'), /<strong>/);
  assert.match(whatsappHtml('- um\n- dois'), /<ul><li>um<\/li><li>dois<\/li><\/ul>/);
  assert.match(whatsappHtml('## Mensagem 1 · Convite'), /<h4>Mensagem 1 · Convite<\/h4>/);
});
```

- [ ] **Step 2: Run** `node --test test/event-copy-editor.test.mjs` — Expected: FAIL (módulo não existe).
- [ ] **Step 3: Implement** as funções acima em `ui/event-copy-editor.js` (sem dependências; `bindCopyEditor` é o único trecho com DOM) e registrar o arquivo em `staticFiles` de `server.mjs`.
- [ ] **Step 4: Run** `node --test test/event-copy-editor.test.mjs test/public-mirror.test.mjs` (depois de `node scripts/sync-public.mjs`) — Expected: PASS.
- [ ] **Step 5: Commit** `git add ui/event-copy-editor.js public/event-copy-editor.js server.mjs test/event-copy-editor.test.mjs && git commit -m "feat(eventos): editor de copy no formato do WhatsApp"`

---

### Task 4: CSS do planejador só com tokens

**Files:**
- Modify (reescrever): `ui/event-planner.css`
- Test: `test/event-planner-ui.test.mjs` (novo; as Tarefas 5–6 acrescentam casos)

**Interfaces:**
- Produces: classes com prefixo `ep-` usadas pelas Tarefas 5–6: `ep-gallery`, `ep-card`, `ep-card-actions`, `ep-progress`, `ep-head-meta`, `ep-blocks`, `ep-block`, `ep-list`, `ep-item`, `ep-item-side`, `ep-agenda`, `ep-link-grid`, `ep-link`, `ep-filter`, `ep-copy`, `ec-toolbar`, `ec-preview`, `ep-integrations`. Remover `ep-hero`, `ep-kpis`, `ep-intro`, `ep-subtabs` (substituídos por `page-head`, `.metrics`, `utabs`).

- [ ] **Step 1: Write the failing test**

```js
import { readFileSync } from 'node:fs';
test('Event planner stylesheet uses only theme tokens', () => {
  const css = readFileSync(new URL('../ui/event-planner.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
  assert.doesNotMatch(css, /\.ep-hero|\.ep-kpis|\.ep-intro|\.ep-subtabs/);
});
```

- [ ] **Step 2: Run** `node --test test/event-planner-ui.test.mjs` — Expected: FAIL (87 cores fixas).
- [ ] **Step 3: Implement** a folha nova seguindo as superfícies e espaçamentos de `ui/social.css` (bordas `var(--g-line)`, fundo `var(--g-surface)`/`var(--g-surface-2)`, texto `var(--g-ink)`/`var(--g-dim)`, destaque `var(--g-brand-*)`); status via `.badge` (`blue`, `green`, `red`, padrão) em vez de `.ep-pill` coloridas; responsivo até 360 px (grades viram 1 coluna < 760 px).
- [ ] **Step 4: Run** `node --test test/event-planner-ui.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `node scripts/sync-public.mjs && git add ui/event-planner.css public/event-planner.css test/event-planner-ui.test.mjs && git commit -m "style(eventos): planejador só com tokens do tema"`

---

### Task 5: Galeria e criação de evento

**Files:**
- Modify: `ui/event-planner.js` (`gallery`, diálogo de novo evento, handlers de galeria em `installEventPlanner`)
- Test: `test/event-planner-ui.test.mjs`

**Interfaces:**
- Consumes: `pageShell`, `marketingTabs` (já recebidos por `eventPlanner(c, { pageShell, marketingTabs })`); `launchEventPlan`, `blankEventPlan`; comando `event-plan-duplicate`.
- Produces: `eventPlanner(c, helpers) → string` continua a entrada. Atributos: `data-ep-open="<id>"` (abrir), `data-ep-manage="rename|duplicate|delete"` + `data-id` (ações do cartão), `data-ep-status-filter` (select), `data-ep-new`.

- [ ] **Step 1: Write the failing tests** (montar `c` mínimo: `{ s: blank() com 2 eventos, agency: { users: [] }, workspace: 'w' }` e `helpers` reais de `ui/screens.js`)

```js
test('Gallery shows cards with manage actions and no legacy hero', () => {
  const html = eventPlanner(c, { pageShell, marketingTabs });
  assert.match(html, /data-ep-manage="rename"/); assert.match(html, /data-ep-manage="duplicate"/); assert.match(html, /data-ep-manage="delete"/);
  assert.match(html, /data-ep-status-filter/);
  assert.doesNotMatch(html, /ep-hero|ep-intro/);
});
```

- [ ] **Step 2: Run** `node --test test/event-planner-ui.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement**: cartões `surface ep-card` com título, data, `.badge` de status, barra de progresso e contagens; ações Renomear (diálogo com nome), Duplicar (`event-plan-duplicate`), Apagar (confirmação “Apagar <nome> e todo o seu planejamento? Essa ação é definitiva.”). Filtro de status (Todos, Planejado, Em andamento, Concluído, Arquivado; padrão esconde Arquivado). Diálogo Novo evento: Nome, Data do evento, Status, select “Começar com” (Modelo de lançamento | Evento em branco); com modelo, data obrigatória e dica “O modelo usa essa data para montar o cronograma de tarefas, mensagens, roteiro e validação de links.”; erro “Informe uma data válida para montar o cronograma.”.
- [ ] **Step 4: Run** `node --test test/event-planner-ui.test.mjs test/event-planner.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `node scripts/sync-public.mjs && git add ui/event-planner.js public/event-planner.js test/event-planner-ui.test.mjs && git commit -m "feat(eventos): galeria com ações e criação pelo modelo"`

---

### Task 6: Tela do evento, seções e edição de itens

**Files:**
- Modify: `ui/event-planner.js` (cabeçalho, métricas, seções, diálogos de item, handlers)
- Test: `test/event-planner-ui.test.mjs`

**Interfaces:**
- Consumes: `briefGroups`, `channels`, `messageTemplates` (Tarefa 2); `copyEditorField`, `bindCopyEditor`, `whatsappHtml` (Tarefa 3); `revision` (Tarefa 1); `c.agency.users: Array<{ id, name, email }>`; `utabs` de `ui/screens.js` com `nested: true` e `attrs` `data-ep-section="<key>"`.
- Produces: seções `strategy | tasks | messages | agenda | links | integrations` (a Fase 3 acrescentará `timeline`). Todo salvamento de item envia `revision` do evento lido; resposta 409 mostra a mensagem do servidor no diálogo e mantém o formulário aberto.

- [ ] **Step 1: Write the failing tests**

```js
test('Event view uses standard head, metrics and nested tabs', () => {
  const html = eventPlanner({ ...c, /* selecionado */ }, { pageShell, marketingTabs });
  assert.match(html, /class="page-head"/); assert.match(html, /class="metrics/); assert.match(html, /g-utabs is-nested/);
  assert.match(html, /data-ep-section="messages"/);
});
test('Strategy renders three editable blocks with "A definir" fallback', () => {
  // evento com brief vazio
  assert.equal((html.match(/data-ep-brief-group=/g) || []).length, 3);
  assert.match(html, /A definir/);
});
test('Owner select lists sub-account users and keeps removed owners', () => {
  // item com ownerId 'gone' e owner 'Ana'; c.agency.users = [{ id: 'u1', name: 'Bia' }]
  assert.match(itemDialogHtml, /<option value="u1"[^>]*>Bia</);
  assert.match(itemDialogHtml, /<option value="gone" selected>Usuário removido \(Ana\)</);
});
test('Messages section filters by channel and shows code and rendered copy', () => {
  assert.match(html, /data-ep-filter="channel"/);
  assert.match(html, /GRUPO-01/);
  assert.match(html, /<strong>/);           // copy renderizada por whatsappHtml
});
```

(Exportar de `ui/event-planner.js` as funções puras necessárias aos testes: `eventView(c, event)` e `itemDialogBody(c, event, kind, item)`.)

- [ ] **Step 2: Run** `node --test test/event-planner-ui.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement**:
  - Cabeçalho via `pageShell` com `back` (“Todos os eventos”), título, descrição “<data> · <status>”, `cta` com Orquestrar, Editar evento, Duplicar, Excluir.
  - `.metrics` com 4 `.metric`: Tarefas concluídas `x/y`, Mensagens enviadas `x/y`, Duração do roteiro `Hh MM`, Links validados `x/y`.
  - `utabs({ key: 'ep-sections', nested: true, … })` com Estratégia, Tarefas, Comunicação, Roteiro do dia, Links, Integrações.
  - Estratégia: 3 blocos (`briefGroups`), cada um com botão Editar abrindo diálogo só com os campos do bloco; vazio → “A definir”.
  - Itens: filtros Fase, Status e (só Comunicação) Canal; ordenação por data+hora (roteiro por ordem); responsável = select de `c.agency.users` gravando `ownerId` e `owner` (nome); quem não está mais na lista aparece como “Usuário removido (Nome)”; Comunicação mostra canal, código, horário e a copy renderizada (recolhível); botão Copiar texto.
  - Diálogo de mensagem: Assunto, Fase, Status, Data, Horário, Canal, Código, Responsável, `copyEditorField` com variáveis `{{contact.first_name}}` e `{{contact.name}}`; se `code` corresponde a `messageTemplates(event.eventDate)`, botão “Aplicar estrutura do modelo” (confirma antes de substituir texto não vazio).
  - Validações no formulário (iguais ao Parceiras): link “Validado” exige endereço (“Preencha o endereço para validar o link.”); mensagem “Agendada” exige data e horário (“Preencha data e horário para marcar a mensagem como agendada.”); endereço precisa começar com http(s).
  - Integrações: manter o conteúdo atual do orquestrador, só com o visual novo.
- [ ] **Step 4: Run** `node --test test/event-planner-ui.test.mjs test/event-planner.test.mjs` — Expected: PASS.
- [ ] **Step 5: Commit** `node scripts/sync-public.mjs && git add ui/event-planner.js public/event-planner.js test/event-planner-ui.test.mjs && git commit -m "feat(eventos): tela do evento no padrão do Graao com paridade do Parceiras"`

---

### Task 7: Verificação completa e PR

**Files:** nenhum novo (correções que a verificação apontar).

- [ ] **Step 1:** `npm ci` (a worktree não tem `node_modules`), depois `npm test` — Expected: todos passam (0 fail).
- [ ] **Step 2:** `./node_modules/.bin/biome lint ui/event-planner.js ui/event-copy-editor.js ui/event-planner-data.js event-planner-model.mjs` — Expected: sem erros. (Não usar `npx`.)
- [ ] **Step 3:** subir o app desta worktree pelo `preview_start` (criar entrada em `.claude/launch.json` com `server.mjs` numa porta livre), abrir Marketing › Eventos, criar evento com o modelo, editar uma mensagem com negrito e lista, trocar responsável, aplicar estrutura do modelo, renomear, duplicar, apagar. Conferir console sem erros.
- [ ] **Step 4:** repetir a navegação nos temas claro e escuro e em 375 px; capturar tela de cada.
- [ ] **Step 5:** push de `feat/planejador-eventos` e PR para `main` com resumo, prints e “Fase 1 de 3”.
