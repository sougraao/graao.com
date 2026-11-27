# Cobrança graao → agência: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o graao passa a exigir celular confirmado pelo WhatsApp, dar 15 + 15 dias de teste, cobrar os planos de R$ 97/297/497 pelo AbacatePay do graao, aplicar os limites do GHL e pagar afiliados pelo link.

**Architecture:** um modelo puro (`agency-billing-model.mjs`) decide estado, acesso e limites a partir de `agency.billing` e de um relógio injetado; o servidor só lê o veredito. A confirmação do celular é um webhook próprio da Evolution que nunca guarda mensagens. A cobrança usa a conexão de agência da agência raiz (`AGENCY_ID`) no AbacatePay e o webhook que já existe.

**Tech Stack:** Node ESM sem framework, `node:test`, SQLite local e Supabase/PostgREST, front em `ui/` espelhado em `public/` por `node scripts/sync-public.mjs`, AbacatePay v2, Evolution API.

**Spec:** `docs/superpowers/specs/2026-11-25-cobranca-agencia-design.md`

## Global Constraints

- Teste: 15 dias; extensão: +15, uma vez, só com cartão (`trialDays: 15` no produto `-t15`).
- Planos: `Starter` R$ 97, `Unlimited` R$ 297, `Agency Pro` R$ 497, mensais. Sem cupom, sem anual.
- `retryPolicy` da assinatura da agência: `{ maxRetry: 8, retryEvery: 3 }`.
- Um celular por agência; trava atômica `store.insert('phone-' + sha256(e164), …)`.
- Código de confirmação: 6 caracteres do alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, válido 15 min, guardado como hash; mensagem `Confirmar graao XXXXXX`.
- Limites de envio de código: 5 por hora por agência, 20 por hora por IP.
- Variáveis: `GRAAO_VERIFY_WHATSAPP`, `GRAAO_VERIFY_INSTANCE`, `GRAAO_VERIFY_SECRET`. O número nunca entra no código, nos testes nem na documentação.
- A agência raiz (`AGENCY_ID = 'agency'`) é `Exempt`: nunca é bloqueada nem cobrada.
- Bloqueio fecha só o painel (agência e subcontas). Páginas públicas, webhooks, cron e automações continuam.
- Webhook de confirmação nunca grava mensagem, contato ou mídia.
- Textos em pt e es (`ui/locales`), sem `confirm/alert/prompt` (usar `ui/ask.js`), telas com `.set-form` e tokens de `ui/tokens.css`.
- Cada PR leva artigo na doc (`docs-site/`), linha em `novidades.mdx`, `cobertura.json`, prints só da Agência Demo local.
- Comissão de afiliado: 40% (`affiliateRate`), 30 dias de carência, cookie `graao_ref` de 90 dias, vale o primeiro link.

## Review Focus

1. **Webhook atrasado no fim do teste:** a agência pagou ou estendeu, mas o evento ainda não chegou quando a varredura roda. Esperado: não bloquear; consultar o gateway antes. Teste na Task 9.
2. **Duas agências confirmando o mesmo número ao mesmo tempo:** só uma ganha. Teste na Task 4.
3. **Número sem o nono dígito ou remetente por LID:** `31 8xxx-xxxx` e `31 98xxx-xxxx` são o mesmo número; LID sem número real é recusado com resposta clara. Testes nas Tasks 1 e 4.
4. **Convidado da equipe entrando antes do dono confirmar:** o convidado não vê a tela de celular; vê "a agência ainda não foi ativada pelo responsável". Teste na Task 3.
5. **Descer para o Starter com 5 subcontas:** recusado com a lista do que precisa pausar. Teste na Task 12.

---

## PR 1 · Celular confirmado (branch `feat/cobranca-agencia-celular`, base `main`)

### Task 1: regras puras do celular e do código

**Files:**
- Create: `phone-verify.mjs`
- Test: `test/phone-verify.test.mjs`

**Interfaces:**
- Produces: `normalizePhone(raw: string): string` (só dígitos com DDI; `''` se inválido) · `phoneKey(e164: string): string` (`'phone-' + sha256 hex`) · `newCode(random?: () => number): { code: string, hash: string }` · `hashCode(code: string): string` · `codeFromText(text: string): string` · `verifyLink(number: string, code: string): string`

- [ ] **Step 1: testes que falham**

```js
test('Brasil sem o nono dígito vira o mesmo número', () => {
  assert.equal(normalizePhone('(31) 8123-4567'), '5531981234567');
  assert.equal(normalizePhone('+55 31 98123-4567'), '5531981234567');
  assert.equal(normalizePhone('5531981234567'), '5531981234567');
});
test('Fixo, curto ou estrangeiro curto é inválido; estrangeiro válido fica como veio', () => {
  assert.equal(normalizePhone('31 3333-4444'), '');   // fixo (começa com 2-5 depois do DDD)
  assert.equal(normalizePhone('123'), '');
  assert.equal(normalizePhone('+351 912 345 678'), '351912345678');
});
test('O código sai do texto em qualquer caixa e com espaços', () => {
  assert.equal(codeFromText('confirmar GRAAO  ab3k9z'), 'AB3K9Z');
  assert.equal(codeFromText('oi'), '');
});
test('Código usa só o alfabeto sem ambiguidade e o hash não é o código', () => {
  const { code, hash } = newCode();
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.equal(hash, hashCode(code));
  assert.notEqual(hash, code);
});
test('O link abre o WhatsApp com a mensagem pronta', () => {
  assert.equal(verifyLink('5500000000000', 'AB3K9Z'), 'https://wa.me/5500000000000?text=Confirmar%20graao%20AB3K9Z');
});
```

- [ ] **Step 2:** `node --test test/phone-verify.test.mjs` → FAIL (módulo inexistente).
- [ ] **Step 3:** implementar em `phone-verify.mjs`. Brasil: número com DDI 55 (ou 10–11 dígitos sem DDI) é celular se o primeiro dígito depois do DDD for 6–9; com 8 dígitos locais ganha o 9. Outros países: 10–15 dígitos aceitos como vieram.
- [ ] **Step 4:** teste passa.
- [ ] **Step 5:** commit `feat(conta): regras do celular e do código de confirmação`.

### Task 2: estado da cobrança da agência (modelo puro)

**Files:**
- Create: `agency-billing-model.mjs`
- Modify: `agency-model.mjs` (`blankAgency` e `hydrateAgency`: chamar `hydrateBilling`)
- Test: `test/agency-billing-model.test.mjs`

**Interfaces:**
- Consumes: `AGENCY_ID` de `agency-model.mjs` (passado como argumento para evitar import circular).
- Produces:
  - `TRIAL_DAYS = 15`
  - `hydrateBilling(billing: object, { root: boolean }): object` — preenche `status` (`'Exempt'` para a raiz; agência sem `status` vira `'Unverified'`), `trialEndsAt: ''`, `extended: false`, `subscription: null`, `failures: []`, `phone: ''`, `phoneVerifiedAt: ''`, `referredBy: null`, `blockedAt: ''`, `blockedReason: ''`, `verify: null`. Mantém `plan`, `wallet`, `autoRecharge`.
  - `startTrial(billing, now: Date): void` — `status = 'Trial'`, `trialEndsAt = now + 15 dias`.
  - `agencyAccess(billing, now: Date): { status, canUse: boolean, daysLeft: number|null, gate: ''|'PHONE_REQUIRED'|'AGENCY_BLOCKED', plan }` — `canUse` é falso em `Unverified` e `Blocked`; `Trial` com `trialEndsAt` vencido continua `canUse = true` até a varredura bloquear (o bloqueio é sempre explícito).

- [ ] **Step 1: testes**

```js
test('Agência nova nasce sem celular confirmado; a raiz é isenta', () => {
  assert.equal(hydrateBilling({}, { root: false }).status, 'Unverified');
  assert.equal(hydrateBilling({ status: 'Trial' }, { root: true }).status, 'Exempt');
});
test('Confirmar começa 15 dias de teste', () => {
  const b = hydrateBilling({}, { root: false }); startTrial(b, new Date('2026-12-01T12:00:00Z'));
  assert.deepEqual([b.status, b.trialEndsAt], ['Trial', '2026-12-16T12:00:00.000Z']);
  assert.equal(agencyAccess(b, new Date('2026-12-13T12:00:00Z')).daysLeft, 3);
});
test('Sem celular ou bloqueada não usa; teste vencido ainda usa até a varredura', () => {
  assert.deepEqual(pick(agencyAccess(hydrateBilling({}, { root: false }), now)), { canUse: false, gate: 'PHONE_REQUIRED' });
  assert.deepEqual(pick(agencyAccess({ ...base, status: 'Blocked' }, now)), { canUse: false, gate: 'AGENCY_BLOCKED' });
  assert.equal(agencyAccess({ ...base, status: 'Trial', trialEndsAt: '2026-01-01T00:00:00.000Z' }, now).canUse, true);
});
```

- [ ] **Step 2–4:** falha, implementa, passa. `hydrateAgency` chama `hydrateBilling(state.billing, { root: id === AGENCY_ID })`; conferir em `test/agency.test.mjs` que nada quebra (a raiz do teste fica `Exempt`).
- [ ] **Step 5:** commit `feat(cobranca): estado da cobrança da agência`.

### Task 3: portão no servidor

**Files:**
- Modify: `server.mjs` (`accessContext`, ~593; `/api/agency` GET devolve `billing` público; rotas liberadas)
- Test: `test/agency-gate.test.mjs`

**Interfaces:**
- Consumes: `agencyAccess` (Task 2).
- Produces: `accessContext(req, session, { gate = true } = {})` lança `402` com `code` igual a `access.gate` quando `gate` e `!canUse`. Corpo: `{ error, code, billing: publicBilling }`. `publicBilling(billing, now)` (em `agency-billing-model.mjs`) devolve só `{ status, trialEndsAt, extended, daysLeft, plan, phone (mascarado: últimos 4), subscription: { status, planId, nextChargeAt, cancelAt } | null }`.
- Rotas que chamam `accessContext(..., { gate: false })`: `/api/agency` GET, `/api/verify/*`, `/api/billing/agency/*` (PR 2), `/api/auth/*`.
- Usuário convidado (não dono) com a agência `Unverified`: `code: 'AGENCY_NOT_ACTIVE'`, mensagem "A agência ainda não foi ativada pelo responsável."

- [ ] **Step 1: testes** (servidor em memória, como `test/agency.test.mjs`): agência nova recebe 402 `PHONE_REQUIRED` em `/api/workspaces` e 200 em `/api/agency`; a raiz recebe 200; convidado recebe `AGENCY_NOT_ACTIVE`; página pública de uma subconta de agência `Unverified` continua 200.
- [ ] **Step 2–4.**
- [ ] **Step 5:** commit `feat(cobranca): painel fechado sem celular confirmado`.

### Task 4: confirmação pelo WhatsApp

**Files:**
- Create: `routes/verify.mjs`
- Modify: `whatsapp.mjs` (exportar `inboundTexts(payload): { phone, lid, text }[]` reaproveitando `evolutionInbound`; no handler, `verifyLine: { provision(webhookUrl), status(), sendText(number, text) }` usando `GRAAO_VERIFY_INSTANCE` e as credenciais globais)
- Modify: `server.mjs` (montar a rota, passar `store`, `whatsapp`, `changeAgency`, `allowSign`)
- Test: `test/verify-route.test.mjs` (usa `test/helpers/fake-evolution.mjs`)

**Interfaces:**
- Consumes: Task 1 inteira, `startTrial` (Task 2), `accessContext(..., { gate: false })` (Task 3).
- Produces:
  - `POST /api/verify/start` `{ phone }` → `{ link, code, expiresAt, number }`; grava `billing.verify = { phone, hash, expiresAt, refused: '' }`; 429 acima dos limites; 503 `VERIFY_OFF` sem as variáveis; 409 `PHONE_TAKEN` se `phoneKey` já existe.
  - `GET /api/verify/status` → `{ status: 'waiting'|'verified'|'refused'|'expired', reason }`.
  - `POST /api/verify/whatsapp/<GRAAO_VERIFY_SECRET>` — webhook da Evolution. Para cada texto com código: acha a agência por `store.findAgency({ billing: { verify: { hash } } })` (ou índice `verify-<hash>` gravado no start; o construtor escolhe o que `findAgency` suporta), confere que `normalizePhone(remetente) === verify.phone`, faz a trava, `startTrial`, grava `phone`/`phoneVerifiedAt`, responde pelo `verifyLine.sendText`. Sempre devolve 200.
  - Respostas fixas: "Pronto, sua conta do graao está confirmada.", "Este número já tem uma conta no graao.", "Abra o WhatsApp no celular deste número e envie a mensagem de novo.", "Este código venceu. Gere outro no graao."

- [ ] **Step 1: testes**

```js
test('Confirmar libera o teste e responde no WhatsApp', …)            // status verified, billing.status Trial, fake recebeu a resposta
test('Mensagem de outro número não confirma', …)                       // refused, reason 'other-phone'
test('Duas agências, mesmo número, ao mesmo tempo: uma só confirma', async () => {
  const [a, b] = await Promise.all([deliver(codeA), deliver(codeB)]);   // mesmo remetente
  assert.equal([statusA, statusB].filter(s => s === 'verified').length, 1);
});
test('Remetente só com LID é recusado com a resposta de abrir pelo celular', …)
test('Mensagem comum não é guardada em lugar nenhum', …)               // nenhum workspace/conversa novo no store
test('Segredo errado no caminho: 404', …)
test('Sexto código na mesma hora: 429', …)
```

- [ ] **Step 2–4.**
- [ ] **Step 5:** commit `feat(conta): confirmação do celular pelo WhatsApp`.

### Task 5: migração das agências atuais e tela de confirmação

**Files:**
- Create: `ui/verify.js`, `ui/verify.css`
- Modify: `ui/app.js` (`api()`: em 402 `PHONE_REQUIRED` ou `AGENCY_NOT_ACTIVE`, montar a tela; em `AGENCY_BLOCKED`, a tela do PR 2), `ui/app.html` (CSS), `ui/locales/pt.js`, `ui/locales/es.js`
- Modify: `ui/agency.js` (Configurações da raiz → **WhatsApp de confirmação**: status, QR via `verifyLine.status`, botão **Conectar**) e `server.mjs` (`POST /api/agency/verify-line` só para a raiz)
- Test: `test/verify-ui.test.mjs` (render da tela com `jsdom` ou o padrão de `test/platform-ui.test.mjs`)

**Interfaces:**
- Consumes: rotas da Task 4.
- Produces: `mountVerify(root: HTMLElement, { api, onDone })` · `POST /api/agency/verify-release { phone }` (só a raiz): apaga a trava `phoneKey(phone)` para o suporte trocar o número de uma agência.

Comportamento: campo do celular (Brasil por padrão), botão **Confirmar pelo WhatsApp** (abre o link em nova aba), QR do link, consulta `/api/verify/status` a cada 3 s até 15 min, estados de erro com o texto da rota. A migração é só o `hydrateBilling` (Task 2): agências atuais sem `status` viram `Unverified`.

- [ ] **Step 1–4:** teste de render (campo, botão, QR, mensagem de `VERIFY_OFF`), implementa, `node scripts/sync-public.mjs`, `node scripts/sync-public.mjs --check`.
- [ ] **Step 5:** verificar no navegador local (`preview_start`) o fluxo com o fake da Evolution; print para a doc.
- [ ] **Step 6:** commit `feat(conta): tela de confirmação do celular`.

### Task 6: documentação do PR 1

**Files:** `docs-site/src/content/docs/comece-aqui/criar-conta.mdx`, `docs-site/roteiros/criar-conta.mjs`, `novidades.mdx`, `cobertura.json`, `npm run docs:secoes`, prints no R2 (`npm run docs:midia -- enviar …`).

- [ ] Artigo pelo `_modelo.mdx`; `npm run docs:test` passa; suíte inteira passa; commit e PR.

---

## PR 2 · Teste e plano (branch `feat/cobranca-agencia-plano`, base PR 1)

### Task 7: planos e transições (modelo puro)

**Files:**
- Modify: `agency-billing-model.mjs`, `ui/agency-data.js:120` (`agencyPlans` em reais: `[['Starter', 97], ['Unlimited', 297], ['Agency Pro', 497]]`)
- Test: `test/agency-billing-model.test.mjs`

**Interfaces:**
- Produces:
  - `canExtend(billing, now): boolean` — `!extended` e (`status === 'Trial'` com no máximo 3 dias restantes, ou `Blocked` com `blockedReason === 'trial_ended'`).
  - `platformEvent(billing, event: string, data: object, now): { effect: ''|'active'|'trial'|'past_due'|'blocked'|'paid', payment?: { id, cents } }` — `subscription.completed`/`renewed` → `Active` (e `payment`); `trial_started` → `Trial`, `extended = true`, `trialEndsAt = now + 15 dias`; `payment_failed` → `PastDue`; `cancelled` com `max_payment_retries_exceeded` → `Blocked`/`payment_failed`; `cancelled` por pedido → `Blocked`/`cancelled`. Eventos de outra assinatura (checkoutId diferente) são ignorados.
  - `sweepDue(billing, now): ''|'block_trial'|'cancel_now'|'warn'` — `block_trial` só se teste vencido **e** `subscription` nula ou `PENDING` sem pagamento; `cancel_now` se `subscription.cancelAt <= now`; `warn` nos dias 12 (uma vez, marcado em `billing.warnedAt`).

- [ ] Testes para cada evento, eventos fora de ordem (`renewed` depois de `cancelled` não reativa), `canExtend` nos dias 11, 12 e 16, e `sweepDue` com assinatura em teste (não bloqueia).
- [ ] Commit `feat(cobranca): planos e transições da agência`.

### Task 8: AbacatePay do graao

**Files:**
- Modify: `abacatepay.mjs`
- Test: `test/abacatepay-platform.test.mjs` (usa `test/helpers/abacate.mjs`)

**Interfaces:**
- Produces:
  - `subscribeAgency(targetAgencyId, plan: 'Starter'|'Unlimited'|'Agency Pro', { extend: boolean, publicOrigin }): Promise<{ checkoutId, url, planId, amount, status: 'Pending' }>` — chave da conexão `AGENCY_SCOPE` de `AGENCY_ID`; produto `graao-agency-<plano-slug>` ou `-t15`; `methods` `['CARD','PIX']` sem teste e `['CARD']` com teste; `retryPolicy { maxRetry: 8, retryEvery: 3 }`; `metadata: { agency: targetAgencyId, plan }`.
  - `getSubscription(subscriptionId)`, `cancelAgencySubscription(subscriptionId)`, `changeAgencyPlan(subscriptionId, plan)`.
  - No `receive`: quando `agencyId === AGENCY_ID`, `scope === AGENCY_SCOPE` e `data.checkout?.metadata?.agency` existe, chama `onPlatformSubscription(targetAgencyId, event, data, devMode)` em vez de `subscriptionEvent`.

- [ ] Testes: produto criado uma vez; extensão usa `-t15` e só cartão; evento com `metadata.agency` chega ao callback e não mexe em `accounts`; sem conexão na raiz → erro "O graao ainda não ligou o AbacatePay".
- [ ] Commit `feat(cobranca): assinatura da agência no AbacatePay do graao`.

### Task 9: rotas, webhook, livro e varredura

**Files:**
- Create: `routes/agency-plan.mjs`
- Modify: `server.mjs` (montar; `onPlatformSubscription` aplica `platformEvent` em `changeAgency(target)` e lança no livro da raiz `layer: 'platform'`, `kind: 'agency_plan_payment'`, chave `platform:abacatepay:<paymentId>`), `routes/social.mjs` (no cron: `agencyBillingSweep` no máximo 1×/hora, marca em `agency.billing.sweptAt` da raiz)
- Test: `test/agency-plan-route.test.mjs`

**Interfaces:**
- Produces: `POST /api/billing/agency/subscribe { plan, extend }` → `{ url }` · `POST /api/billing/agency/cancel` · `POST /api/billing/agency/change { plan }` · `agencyBillingSweep(now)`.
- A varredura, antes de `block_trial`, chama `getSubscription` quando houver `subscriptionId` e aplica o status do gateway.
- E-mail do dia 12 e do bloqueio por `documentMail.email` com chave idempotente `agency-trial-<agencyId>-<tipo>`.

- [ ] Testes: assinar devolve URL; estender duas vezes → 409; webhook `trial_started` estende; varredura bloqueia teste vencido sem assinatura e **não** bloqueia quando o gateway diz ACTIVE (Review Focus 1); pagamento entra no livro uma vez; cancelar agenda e a varredura cancela no dia.
- [ ] Commit `feat(cobranca): rotas, webhook e varredura do plano da agência`.

### Task 10: telas do plano

**Files:**
- Modify: `ui/agency.js` (`settingsPages.billing` vira **Plano e cobrança**: três cartões com preço e limites, Assinar, Ganhar mais 15 dias, Mudar de plano, Cancelar com `ask`), `ui/app.js` (faixa de dias restantes e de atraso; tela **Agência bloqueada** em `AGENCY_BLOCKED` com os mesmos botões), `ui/agency.css`, locales
- Test: `test/agency-plan-ui.test.mjs`

- [ ] Render nos estados Trial (dia 5 e dia 13), PastDue, Blocked (trial_ended e payment_failed), Active; sync-public; verificação no navegador; prints.
- [ ] Commit `feat(cobranca): telas do plano da agência`.

### Task 11: documentação do PR 2

`docs-site/src/content/docs/agencia/plano-da-graao.mdx` + roteiro + novidades + cobertura + secoes + prints. Commit e PR.

---

## PR 3 · Limites por plano (branch `feat/cobranca-agencia-limites`, base PR 2)

### Task 12: tabela de limites e travas

**Files:**
- Modify: `ui/agency-data.js` (`planLimits`), `agency-billing-model.mjs`, `server.mjs` (`createAccount` ~755, criação por API/MCP), `agency-model.mjs` (`desktop-app`, `desktop-app-publish`, `saas-rebilling`, `saas-mode`, `saas-suspension`, `saas-account`), `routes/billing.mjs` (`subscribe` de subconta), `mcp` (criar subconta), `ui/agency.js` (selo do plano e botão **Mudar de plano**)
- Test: `test/agency-limits.test.mjs`

**Interfaces:**
- Produces:
  - `planLimits = { Starter: { subaccounts: 3, desktop: false, rebilling: false, saas: false, apiCreate: false }, Unlimited: { subaccounts: Infinity, desktop: true, rebilling: true, saas: false, apiCreate: false }, 'Agency Pro': { subaccounts: Infinity, desktop: true, rebilling: true, saas: true, apiCreate: true } }`
  - `effectivePlan(billing): plan` — `Trial` e `Exempt` valem `Agency Pro`.
  - `requirePlan(billing, feature, { count }): void` — lança `403` `code: 'PLAN_LIMIT'` com `{ feature, needs: 'Unlimited'|'Agency Pro' }`.
  - `canDowngrade(billing, plan, { subaccounts }): { ok, over: number }`.

- [ ] Testes: Starter cria a 3ª subconta e recusa a 4ª; Starter recusa `desktop-app`, `saas-rebilling`, `saas-mode`; Unlimited recusa `saas-mode`; Agency Pro e teste liberam tudo; descer para o Starter com 5 subcontas → `over: 2` (Review Focus 5); a raiz nunca é travada.
- [ ] Commit `feat(cobranca): limites dos planos iguais ao GHL`.

### Task 13: documentação do PR 3

Atualizar os artigos das telas com selo (white-label/app desktop, configurador SaaS) e o `plano-da-graao.mdx` com a tabela. Commit e PR.

---

## PR 4 · Afiliados do graao (branch `feat/cobranca-agencia-afiliados`, base PR 3)

### Task 14: link, indicação e comissão

**Files:**
- Modify: `server.mjs` (GET `/` e `/login`: `?ref=` válido grava `graao_ref=<código>.<timestamp>` por 90 dias se não houver), `routes/verify.mjs` (na confirmação: `referredBy` e indicação automática na agência que indicou), `agency-billing-model.mjs` (`referralFor`, `commissionFor`), `agency-model.mjs` (remover `referrals` da criação manual e `affiliate-pay`; `affiliate-payout` passa a aceitar só Pix: `{ method: 'Pix', key }`; novo `affiliate-commission-paid` só para a raiz), `ui/agency.js` (indicações e comissões só leitura; Pix), `routes/agency-plan.mjs` (no pagamento: comissão)
- Test: `test/graao-affiliates.test.mjs`

**Interfaces:**
- Produces: `referralFor(cookieValue, { selfCode, selfPhoneKey, referrerPhoneKey }): string|''` · `commissionFor(paymentCents): number` (40%) · indicação `{ id, agencyId, name, plan, status: 'Trial'|'Active'|'Inactive', since }` · comissão `{ id, referralId, paymentId, cents, availableAt (pagamento + 30 dias), status: 'pending'|'available'|'paid'|'reversed', paidAt }`.

- [ ] Testes: cookie só no primeiro link; autoindicação (mesmo código ou mesmo celular) ignorada; confirmação cria a indicação Em teste; pagamento gera comissão de 40% disponível em 30 dias; reembolso antes disso estorna; agência não consegue mais criar indicação nem marcar pagamento; a raiz marca **Pago** e o livro registra.
- [ ] Commit `feat(afiliados): link do graao, indicação e comissão automáticas`.

### Task 15: documentação do PR 4 e revisão final

`docs-site/src/content/docs/agencia/afiliados-da-graao.mdx` + roteiro + novidades + cobertura + prints. Atualizar `docs/implementation/08-cobrancas-ghl-e-fiscal.md` (camada 1) e o painel `docs/implementation/painel/progresso.js`. Revisão do branch inteiro por um revisor novo. Commit e PR.
