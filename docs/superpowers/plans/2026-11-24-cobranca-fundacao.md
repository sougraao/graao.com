# Cobrança, entrega 1 (fundação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar todo dinheiro uma vez em livro imutável, reagir a plano não pago, tratar baixa, reembolso e contestação corretamente e identificar vendedor e comprador.

**Architecture:** O fato nasce em `ledgerOutbox` na mesma gravação do estado e um envio idempotente o leva à tabela `go_billing_ledger`, só de inclusão. O webhook do AbacatePay passa a conferir valor, reembolso, contestação e falha de plano. Rotas novas ficam em `routes/billing.mjs`, porque outras sessões estão esvaziando `server.mjs`.

**Tech Stack:** Node (ESM, sem framework), `node:sqlite`, PostgREST do Supabase, `node:test`, front-end em módulos puros.

**Spec:** `docs/superpowers/specs/2026-11-24-cobranca-fundacao-design.md`

## Global Constraints

- Partir de `origin/main` em worktree nova; `npm ci` antes; nunca `npx`.
- Teste de um arquivo: `node --test --test-isolation=none test/<arquivo>.test.mjs`. Suíte: `npm test`. Lint: `npm run lint`.
- Dinheiro no livro em centavos inteiros (`amount_cents`, `fee_cents`); consumo em `usage_micros`.
- `ui/` é a fonte; ao fim de tarefa de tela, rodar `node scripts/sync-public.mjs`; arquivo novo de `ui/` entra em `staticFiles` (`server.mjs`).
- Sem `alert/confirm/prompt`: usar `ask/askText/tell` de `ui/ask.js`. Textos em pt com tradução em `ui/locales/es.js`. Sem emojis.
- Agência, subconta e camada vêm da sessão, nunca do navegador.
- Pagamento com `devMode` não entra no livro.
- O Graao não tem importação de transações por CSV hoje; a regra do projeto sobre isso não pede código.
- Nada roda em produção (migração, importação) sem autorização do usuário. Nenhum PR é mesclado sem pedido.
- PRs: A = tarefas 1 a 4; B = 5 a 7; C = 8 e 9; D = 10 e 11; E = 12. Empilhados nessa ordem.

## Review Focus

1. Pagamento chega para fatura já excluída: o dinheiro entra no livro e o webhook responde 200 (tarefa 5).
2. Tabela do livro ausente ou fora do ar: a fatura é baixada assim mesmo e o fato vai depois (tarefa 4).
3. Cartão com taxa repassada (`paidAmount` maior que a fatura): baixa normal e livro com o valor recebido (tarefa 5).
4. Venda às 23h30 do último dia do mês em São Paulo aparece no CSV daquele mês (tarefa 11).
5. Plano pago de subconta encerrada: entra no livro e a conta continua encerrada (tarefa 8).

## File Structure

| Arquivo | Responsabilidade |
| --- | --- |
| Create `tax-id.mjs` | Validar e formatar CPF e CNPJ (inclusive alfanumérico); `sanitizeFiscal` |
| Create `ledger-model.mjs` | Montar fatos e chaves; caixa de saída. Puro, sem rede |
| Create `ledger-flush.mjs` | Enviar a caixa de saída à tabela, com retrato de vendedor e comprador |
| Create `routes/billing.mjs` | Livro (JSON e CSV) e reativação |
| Create `ui/ledger.js`, `ui/fiscal.js` | Tela do livro; formulário fiscal compartilhado |
| Create `scripts/ledger-backfill.mjs` | Importação do passado, repetível |
| Create `supabase/migrations/20261124120000_go_billing_ledger.sql` | Tabela, índices e gatilho |
| Modify | `storage.mjs`, `supabase/provision-storage.sql`, `abacatepay.mjs`, `wallet-model.mjs`, `crm-model.mjs`, `store-model.mjs`, `document-model.mjs`, `model.mjs`, `agency-model.mjs`, `authorization.mjs`, `invoice-model.mjs`, `server.mjs` (só ligação), telas em `ui/` |

---

### Task 1: CPF, CNPJ e cadastro fiscal

**Files:** Create `tax-id.mjs`; Modify `model.mjs` (comando `fiscal`, campo `taxId` do contato e da importação, hidratação), `agency-model.mjs` (comando `fiscal`, `blankAgency`), `authorization.mjs` (comando `fiscal` exige `settings`); Test `test/tax-id.test.mjs`

**Interfaces — Produces:**
- `cleanTaxId(value: unknown): string` remove máscara, maiúsculas
- `taxIdKind(value: string): 'cpf' | 'cnpj' | ''` (vazio = inválido)
- `formatTaxId(value: string): string`
- `maskTaxId(value: string): string` (CPF vira `***.456.789-**`; CNPJ inteiro)
- `sanitizeFiscal(d: object): Fiscal` lança erro 400
- `Fiscal = { person: 'pf'|'pj', name, taxId, cityRegistration, regime: ''|'simples'|'mei'|'presumido'|'real', email, address: { zip, street, number, complement, district, city, ibge, state } }`
- Estado: `state.fiscal` e `agency.fiscal` (`null` quando vazio), no nível de cima (o comando `profile` reescreve `s.profile`)
- `contact.taxId: string`

- [ ] **Step 1: Teste que falha**

```js
test('CPF e CNPJ, com dígito verificador', () => {
  assert.equal(taxIdKind('529.982.247-25'), 'cpf');
  assert.equal(taxIdKind('529.982.247-24'), '');
  assert.equal(taxIdKind('111.111.111-11'), '');
  assert.equal(taxIdKind('11.222.333/0001-81'), 'cnpj');
  assert.equal(taxIdKind('11.222.333/0001-80'), '');
  assert.equal(taxIdKind('12.ABC.345/01DE-35'), 'cnpj', 'CNPJ alfanumérico');
  assert.equal(taxIdKind('12.abc.345/01de-35'), 'cnpj');
  assert.equal(formatTaxId('12ABC34501DE35'), '12.ABC.345/01DE-35');
  assert.equal(maskTaxId('52998224725'), '***.982.247-**');
});
test('Cadastro fiscal', () => {
  const base = { person: 'pj', name: 'Loja Ltda', taxId: '11222333000181', regime: 'simples', email: 'f@x.com',
    address: { zip: '30110-000', street: 'Rua A', number: '1', district: 'Centro', city: 'Belo Horizonte', ibge: '3106200', state: 'MG' } };
  assert.equal(sanitizeFiscal(base).taxId, '11222333000181');
  assert.throws(() => sanitizeFiscal({ ...base, taxId: '52998224725' }), /CNPJ/);   // pj exige CNPJ
  assert.throws(() => sanitizeFiscal({ ...base, address: { ...base.address, ibge: '31' } }), /município/i);
});
test('Contato: inválido é recusado; na importação o contato entra sem o documento', () => { /* execute(save contacts) lança /CPF ou CNPJ inválido/; execute(import) grava taxId '' */ });
```

- [ ] **Step 2: Rodar e ver falhar** (`Cannot find module '../tax-id.mjs'`)
- [ ] **Step 3: Implementar.** Dígito do CNPJ: valor de cada caractere = código ASCII − 48, pesos 5,4,3,2,9,8,7,6,5,4,3,2 e 6,5,4,…; os dois últimos são sempre numéricos. Mensagem única: `CPF ou CNPJ inválido.`; pj com CPF: `Informe um CNPJ válido.`. Comando `{ type: 'fiscal', data }` nos dois modelos. API v1 de contatos aceita e devolve `taxId`.
- [ ] **Step 4: Rodar e ver passar; `npm test`**
- [ ] **Step 5: Commit** `feat(cobranca): CPF, CNPJ e cadastro fiscal`

### Task 2: Tabela do livro

**Files:** Create `supabase/migrations/20261124120000_go_billing_ledger.sql`; Modify `storage.mjs`, `supabase/provision-storage.sql`; Test `test/ledger-store.test.mjs`

**Interfaces — Produces:**
- `LedgerRow = { key, layer, agency_id, workspace_id|null, kind, amount_cents, fee_cents|null, usage_micros|null, method, provider, provider_ref, source: {type,id}, seller: {name,taxId}, payer: {name,taxId}, detail: object, occurred_at }`; o banco preenche `recorded_at`
- `store.ledgerAppend(rows: LedgerRow[]): Promise<void>` ignora `key` repetida
- `store.ledgerList({ layer, agencyId, workspaceId?, kind?, from, to, limit = 200, after? }): Promise<{ rows, next }>`; `from` inclusivo e `to` exclusivo, em ISO UTC; ordem `occurred_at desc, key desc`; `after`/`next` = `"<occurred_at>|<key>"`

- [ ] **Step 1: Teste que falha**

```js
test('Só inclui, sem repetir', async () => {
  const store = createSqliteStore(':memory:');
  await store.ledgerAppend([row('a', 100), row('a', 999), row('b', 200)]);
  const { rows } = await store.ledgerList({ layer: 'account', agencyId: 'agency', from: '2026-01-01T00:00:00Z', to: '2027-01-01T00:00:00Z' });
  assert.deepEqual(rows.map(r => [r.key, r.amount_cents]).sort(), [['a', 100], ['b', 200]]);
});
test('Alterar ou apagar falha', () => {
  // abrir o mesmo arquivo com DatabaseSync
  assert.throws(() => db.exec("UPDATE go_billing_ledger SET amount_cents = 1"), /imutável/);
  assert.throws(() => db.exec("DELETE FROM go_billing_ledger"), /imutável/);
});
test('Agência, subconta e camada isolam a leitura', async () => { /* 2 agências, 2 subcontas, 2 camadas: cada consulta devolve só a sua */ });
test('Paginação por cursor não pula nem repete com horários iguais', async () => { /* 5 linhas no mesmo occurred_at, limit 2 → 5 chaves distintas */ });
test('Supabase usa ignore-duplicates e a chave de servidor', async () => {
  // request falso: POST /rest/v1/go_billing_ledger?on_conflict=key, Prefer contém resolution=ignore-duplicates, X-Go-Storage-Key presente
});
```

- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** SQLite: `CREATE TABLE IF NOT EXISTS` com gatilhos `RAISE(ABORT,'livro imutável')`. Postgres: `check` de `layer` e `kind`, índice `(agency_id, layer, occurred_at desc, key desc)` e `(workspace_id, layer, occurred_at desc)`, gatilho `before update or delete` e gatilho de instrução `before truncate`, ambos com `raise exception 'livro imutável'`; RLS ligada, `revoke all`, `grant select, insert to anon`. Políticas de leitura e inclusão em `provision-storage.sql`, com a mesma expressão de hash. `kind` aceito: `sale, manual_sale, refund, dispute_opened, dispute_won, dispute_lost, adjustment, plan_payment, wallet_topup, wallet_credit, wallet_debit, wallet_usage`.
- [ ] **Step 4: Rodar e ver passar**
- [ ] **Step 5: Commit** `feat(cobranca): tabela imutável do livro`

### Task 3: Fatos e caixa de saída

**Files:** Create `ledger-model.mjs`; Modify `crm-model.mjs`, `store-model.mjs:67`, `document-model.mjs:440-452`, `model.mjs` (salvar e excluir `transactions`, hidratação), `ui/crm-data.js` (`Disputed`), `authorization.mjs:172` e a projeção da agência em `server.mjs` (remover `ledgerOutbox`); Test `test/ledger-model.test.mjs`

**Interfaces — Consumes:** `LedgerRow`. **Produces:**
- `Fact = { key, layer, kind, amountCents, feeCents?, usageMicros?, method?, provider?, ref?, source?, contactId?, detail?, at }`
- `postFact(state, fact: Fact): boolean` (falso se a `key` já está na caixa; o primeiro fato grava `state.ledgerSince`)
- `cents(value: number): number`
- `saleKey(workspace, payment, txId): string` → `sale:abacatepay:<ws>:<checkoutId>` se `payment?.checkoutId` está `PAID` ou `MISMATCH`, senão `sale:tx:<ws>:<txId>`
- `refundKey(workspace, payment, txId): string` → mesma regra com prefixo `refund:`
- `transactionFact(state, prior, row, { workspace }): void` decide o fato ao criar ou mudar
- `transactionDeleted(state, row, { workspace }): void`
- `bookTransaction(state, data, { workspace }): row` única porta para criar transação no servidor

Regras: criada `Succeeded` → `sale` (ou `manual_sale` sem gateway); criada com outro estado → nada. `Succeeded→Refunded` → `refund` negativo; `Refunded→Succeeded` → `adjustment` positivo; `Succeeded→Failed` ou excluída → `adjustment` negativo; valor mudou → `adjustment` da diferença, chave `adj:<ws>:<tx>:<n>` com `row.ledgerRev` crescente; excluída: `adj:<ws>:<tx>:deleted`. `Disputed` não gera fato aqui (a tarefa 5 gera). `payment.devMode` → nenhum fato, e a transação guarda `test: true`, para ajustes também ficarem fora. Transação anterior a esta entrega, editada, gera antes o `sale` com `detail.imported = true`, usando a chave da importação.

- [ ] **Step 1: Teste que falha**

```js
test('Fatura paga à mão lança uma venda; editar lança a diferença; excluir estorna', () => {
  // execute(save invoices Paid 150) → outbox: 1 fato manual_sale 15000
  // editar transação para 120 → adjustment -3000; excluir → adjustment -12000; soma 0
});
test('Pedido da loja e fatura lançam uma vez só', () => { /* pedido Paid → 1 fato */ });
test('Mensalidade de contrato reenviada não duplica', () => {
  // document-subscription duas vezes com paymentId 'p1' → 1 pagamento, 1 transação, 1 fato
});
test('Pagamento de teste não gera fato, nem ao editar', () => {});
test('Caixa de saída não vaza', () => {
  assert.equal('ledgerOutbox' in workspaceView(ownerAccess, state), false);
  // também ausente em: projeção da agência, captura de snapshot, clonagem de subconta
});
test('A caixa nunca é cortada', () => { /* 2000 fatos continuam 2000 */ });
```

- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** `workspaceView` com `modules === null` devolve hoje o próprio estado: passar a devolver cópia rasa sem `ledgerOutbox`. `state.fiscal` só vai a quem tem `settings`. `document-subscription` passa a receber `paymentId`; sem id, usar `subscriptionId + data do período` não é seguro: lança sem deduplicar e registra em log.
- [ ] **Step 4: Rodar e ver passar; `npm test`**
- [ ] **Step 5: Commit** `feat(cobranca): fatos do livro na mesma gravação`

### Task 4: Envio ao livro

**Files:** Create `ledger-flush.mjs`; Modify `server.mjs` (`flushLater`, `runAllSocial`, carga do painel da agência, fim do webhook); Test `test/ledger-flush.test.mjs`

**Interfaces — Consumes:** `Fact`, `ledgerAppend`, `state.fiscal`, `agency.fiscal`. **Produces:**
- `createLedgerFlush({ store, log = console.warn }): { workspace(id): Promise<number>, agency(id): Promise<number> }`
- Camada `account`: vendedor = `state.fiscal` ou nome da subconta; comprador = contato. Camada `agency`: vendedor = `agency.fiscal` ou nome da agência; comprador = fiscal ou nome da subconta. `agency_id = state.agencyId || 'agency'`.

- [ ] **Step 1: Teste que falha**

```js
test('Envia, limpa só o que enviou e mantém o que chegou no meio', async () => { /* ledgerAppend falso posta outro fato durante o envio → ele fica */ });
test('Queda depois de gravar o livro e antes de limpar: a próxima passada não duplica', async () => {});
test('Livro fora do ar não impede a baixa', async () => {
  // ledgerAppend rejeita → webhook de fatura responde 200, fatura Paid, caixa com 1; depois volta e envia
});
test('Retrato fica congelado', async () => { /* muda o fiscal depois → linha antiga mantém o nome antigo */ });
```

- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** Lotes de 200. Nunca dois envios da mesma conta ao mesmo tempo no processo (Set, como `emailRuns`). Erro vai ao log sem dados pessoais.
- [ ] **Step 4: Rodar e ver passar; `npm test`**
- [ ] **Step 5: Commit** `feat(cobranca): envio do livro com repetição segura`

### Task 5: Baixa, reembolso e contestação da subconta

**Files:** Modify `abacatepay.mjs:216-237,309-360`, `crm-model.mjs:160`, `workflow-engine.mjs:1787`, `invoice-model.mjs` (`invoiceView`), `ui/invoice-data.js` (`invoicePaymentState`), `ui/screens.js`, `ui/invoices.js`, `ui/crm.js`, `ui/invoice-view.js`, `ui/offers.js`; Test `test/abacatepay.test.mjs`, `test/billing-webhook.test.mjs`

**Interfaces — Consumes:** `postFact`, `saleKey`, `refundKey`. **Produces:**
- `invoicePaymentState(invoice): 'paid'|'mismatch'|'refunded'|'disputed'|'open'|'void'|'draft'` em `ui/invoice-data.js`
- `invoice.payment.status` ganha `MISMATCH` e `DISPUTED`; `invoice.payment.received` (reais) e `invoice.payment.feeCents`
- Teste: `fakeAbacate({ devMode = true })` passa a responder `GET /v2/checkouts/get`

- [ ] **Step 1: Teste que falha**

```js
test('Valor menor não baixa e a baixa manual depois não lança de novo', async t => {
  // fatura 150, paidAmount 10000 → status Open, payment.status MISMATCH, livro sale 10000
  // salvar Paid → transação de 100, livro continua com 1 linha
});
test('Valor igual ou maior baixa', async t => { /* 15000 e 15800 (taxa repassada): Paid; livro 15000 e 15800; feeCents = platformFee */ });
test('Sem valor no aviso, consulta o gateway; sem resposta, diverge', async t => {});
test('metadata de outra subconta não baixa fatura', async t => {});
test('Fatura excluída: 200, handled false, livro com a venda', async t => {});
test('Reembolso e contestação perdida lançam um negativo só', async t => {
  // disputed UNDER_DISPUTE → payment DISPUTED, transação Disputed, dispute_opened 0
  // disputed REFUNDED + refunded → soma do livro 0; invoicePaymentState 'refunded'
});
test('Contestação ganha volta a paga', async t => { /* disputed PAID → Succeeded, dispute_won 0 */ });
test('Conflito de gravação responde 503 e a repetição conclui', async t => {});
test('Mesmo pagamento reenviado com outro id lança uma vez', async t => {});
test('Reembolsada não aceita nova cobrança', async t => { /* charge → 409 */ });
```

- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** Pago = `paidAmount ?? amount` do aviso; ausente → `GET /checkouts/get?id=` e `data.paidAmount`. Compara com `cents(invoice.value)`. `checkout.lost`/`transparent.lost` = contestação perdida; sem id, só log. Qualquer 409 dentro do webhook vira 503. Gatilho `payment_received` só para transação que nasce `Succeeded`. Rótulos: `Pagamento divergente`, `Reembolsada`, `Em contestação`.
- [ ] **Step 4: Atualizar os avisos simulados existentes com `paidAmount`; `npm test`; `node scripts/sync-public.mjs`**
- [ ] **Step 5: Commit** `fix(cobranca): baixa confere valor; reembolso e contestação`

### Task 6: Plano, recarga e carteira no livro

**Files:** Modify `abacatepay.mjs:288-340`, `wallet-model.mjs`, `server.mjs` (`onWalletTopup`, relógio); Test `test/wallet.test.mjs`, `test/billing-webhook.test.mjs`

**Interfaces — Produces:**
- `closeUsage(state, today: string, { workspace }): number` lança e marca `posted` as linhas de dias anteriores
- `reverseTopup(state, { checkoutId, reason, workspace, at }): boolean`
- `subscriptionEvent(agency, event, data, { devMode }): { accountId, effect }` com `effect: ''|'paid'|'trial'|'past_due'|'ended'|'changed'`
- Chaves: `plan:abacatepay:<agency>:<paymentId>`, `topup:<ws>:<checkoutId>`, `topup-refund:<ws>:<checkoutId>`, `wallet:<ws>:<entryId>`, `usage:<ws>:<entryId>`, `refund:abacatepay:<agency>:<checkoutId>`

- [ ] **Step 1: Teste que falha**

```js
test('Plano pago lança uma vez mesmo com subscription e checkout', async t => { /* completed + checkout.completed SUBSCRIPTION + reenvio → 1 plan_payment 29700; billing.payments 1 */ });
test('Consumo entra uma vez por dia e produto, no fuso da subconta', () => {
  // 23:30 BRT fica no dia local; closeUsage duas vezes → 1 fato por linha, usage_micros exato
  // consumo atrasado em dia já fechado abre linha nova
});
test('Cortar o extrato antes lança o que falta', () => { /* 600 linhas → nenhuma perdida no livro */ });
test('Recarga reembolsada debita uma vez e pode ficar negativa', async t => {});
test('Crédito e débito manuais entram como movimento de saldo', () => {});
test('Reembolso de plano lança negativo e não suspende', async t => {});
test('Contestação de plano e de recarga: aberta 0, perdida negativa uma vez, ganha 0', async t => {});
```

- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** Recarga não gera também `wallet_credit`. `walletCharge` usa o dia local de `state.profile.timezone` e ignora linha `posted`. Agência com `payment.id` vazio: chave por `checkoutId + período`; sem período, log e sem lançamento automático.
- [ ] **Step 4: Rodar e ver passar; `npm test`**
- [ ] **Step 5: Commit** `feat(cobranca): plano, recarga e consumo no livro`

### Task 7: Atualizar avisos do AbacatePay

**Files:** Modify `abacatepay.mjs`, `server.mjs` (op `refresh-webhook` nas duas áreas), `ui/agency.js:782-797`, `ui/screens.js:244-252`, `ui/app.js`; Test `test/abacatepay.test.mjs`

**Interfaces — Produces:** `abacate.refreshWebhook(agencyId, scope, origin): Promise<View>`; `View.missingEvents: string[]`; `View.webhookOutdated: boolean`; `conn.webhookEvents: string[]`

- [ ] **Step 1: Teste que falha**

```js
test('Conexão nova pede os 14 avisos', async t => {});
test('Se o gateway recusar, cria sem payment_failed e plan_changed e informa quais faltam', async t => { assert.deepEqual(view.missingEvents, ['subscription.payment_failed', 'subscription.plan_changed']); });
test('Atualizar cria o novo com o mesmo segredo e só depois apaga os antigos da mesma URL', async t => { /* ordem das chamadas: list, create, delete */ });
test('Se criar falhar, o antigo permanece', async t => {});
test('Webhook de outra URL da mesma loja não é apagado', async t => {});
```

- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** Avisos: os 8 atuais mais `subscription.payment_failed`, `subscription.plan_changed`, `checkout.disputed`, `checkout.lost`, `transparent.disputed`, `transparent.lost`. Botão `Atualizar avisos` aparece com `webhookOutdated`.
- [ ] **Step 4: Rodar e ver passar; sincronizar `public/`**
- [ ] **Step 5: Commit** `feat(cobranca): atualizar avisos do AbacatePay`

### Task 8: Plano em atraso e suspensão

**Files:** Modify `agency-model.mjs`, `abacatepay.mjs`, `server.mjs` (passa `onSubscription`), `document-mail.mjs` (só uso), `ui/agency.js` (Configurador SaaS e `billingCell`), `ui/app.js` (faixa na subconta); Test `test/billing-suspension.test.mjs`

**Interfaces — Consumes:** `subscriptionEvent`. **Produces:**
- `agency.saas.autoSuspend = { enabled, maxRetry, retryEvery }`; `blankAgency` → `{ true, 3, 1 }`; hidratação de existente → `{ false, 3, 1 }`
- `suspendForBilling(agency, id, reason): boolean`; `restoreFromBilling(agency, id): boolean`; `meta.suspendedBy: ''|'billing'`
- `accountLifecycle().suspendedBy`; `billing.status` ganha `PastDue`; `billing.failures: [{ at, retryNumber }]`; `billing.history: [{ at, event, detail }]` (últimos 100)
- `abacate.subscribe(agencyId, workspaceId, plan, origin, { trial = true, retryPolicy })`

- [ ] **Step 1: Teste que falha**

```js
test('Agência nova liga; agência existente continua desligada', () => {});
test('Recusa deixa em atraso, avisa uma vez por tentativa e a renovação limpa', async t => { /* mesmo retryNumber duas vezes → 1 e-mail */ });
test('Tentativas esgotadas suspendem só com a opção ligada', async t => {
  for (const reason of ['max_payment_retries_exceeded', 'dispute_opened', 'pix_automatic_authorization_refused']) { /* Paused, suspendedBy billing */ }
});
test('Cancelamento pela agência ou pelo portal não suspende', async t => {});
test('Aviso da assinatura antiga não suspende a nova', async t => {});
test('Pagamento não desfaz pausa manual nem conta encerrada, mas entra no livro', async t => {});
test('Assinatura leva retryPolicy e em atraso não gera outra', async t => { assert.deepEqual(body.retryPolicy, { maxRetry: 3, retryEvery: 1 }); /* subscribe → 409 */ });
test('Limites 1 a 10 e 1 a 30', () => {});
test('plan_changed só entra em billing.history e não muda o status', async t => {});
```

- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** Suspensão na mesma gravação do evento. Motivo: `Pagamento do plano não confirmado.` E-mail aos administradores com chave `plan-failed-<subscriptionId>-<retryNumber>`. Reativação ou pausa manual limpa `suspendedBy`. Rótulo `Em atraso`.
- [ ] **Step 4: Rodar e ver passar; `npm test`; sincronizar `public/`**
- [ ] **Step 5: Commit** `feat(cobranca): suspensão por plano não pago`

### Task 9: Pagar e reativar

**Files:** Create `routes/billing.mjs`; Modify `server.mjs`, `ui/app.js:322-340`; Test `test/billing-suspension.test.mjs`

**Interfaces — Produces:** `createBillingRoutes({ store, abacate, accessContext, verifiedUser, canOpen, loadAgency, changeAgency, recordAudit, error, publicBase, spaceId, flush }): (ctx) => Promise<Response|NEXT_ROUTE>`; `POST /api/billing/reactivate?workspace=<id>` → `{ url }`; `account.canReactivate: boolean` no erro `ACCOUNT_SUSPENDED`

- [ ] **Step 1: Teste que falha**

```js
test('Administrador da subconta pausada por cobrança recebe o link, sem novo teste', async t => {});
test('Duas chamadas reaproveitam o link pendente', async t => {});
test('Usuário sem configurações, pausa manual e conta encerrada: 403', async t => {});
test('Sem gateway ou sem plano: 409 "Fale com a sua agência"', async t => {});
test('Pagar reativa', async t => { /* subscription.completed → Active, suspendedBy '' */ });
```

- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** Botão `Pagar e reativar` só com `canReactivate`.
- [ ] **Step 4: Rodar e ver passar; sincronizar `public/`**
- [ ] **Step 5: Commit** `feat(cobranca): pagar e reativar`

### Task 10: Cadastro fiscal nas telas e "Vendido por"

**Files:** Create `ui/fiscal.js`; Modify `server.mjs` (op `connect`), `ui/agency.js` (Empresa), `ui/screens.js` (Configurações), `ui/app.js` (contato), `invoice-model.mjs` (`invoiceView`, recibo), `ui/document-render.js`, `ui/invoice-view.js`, `ui/locales/es.js`; Test `test/fiscal.test.mjs`

**Interfaces — Consumes:** `sanitizeFiscal`, `formatTaxId`. **Produces:** `fiscalForm(fiscal, { attr }): string`, `readFiscal(form): object`; erro 409 com `code: 'FISCAL_REQUIRED'`; `invoiceView().seller = { name, taxId }`; teste: `test/helpers/fiscal.mjs` exporta `demoFiscal`

- [ ] **Step 1: Teste que falha**

```js
test('Conectar gateway sem cadastro: 409 FISCAL_REQUIRED; com cadastro conecta', async t => {});
test('Conta já conectada continua cobrando e reconecta sem cadastro', async t => {});
test('Página pública mostra o vendedor e nunca o documento do comprador', async t => { assert.doesNotMatch(JSON.stringify(view), /52998224725|529\.982/); });
test('Sem cadastro, mostra o nome da subconta, nunca o Graao', async t => {});
```

- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** Testes existentes que conectam gateway usam `demoFiscal` antes.
- [ ] **Step 4: Rodar e ver passar; `npm test`; sincronizar `public/`; conferir no navegador, em pt e es, claro e escuro, 375 px**
- [ ] **Step 5: Commit** `feat(cobranca): cadastro fiscal e vendedor no recibo`

### Task 11: Telas do livro e CSV

**Files:** Create `ui/ledger.js`; Modify `routes/billing.mjs`, `ui/agency.js` (Faturamento), `ui/crm.js` (Pagamentos), `ui/locales/es.js`; Test `test/ledger-routes.test.mjs`

**Interfaces — Consumes:** `ledgerList`. **Produces:**
- `GET /api/billing/ledger?workspace=` (camada `account`) e `GET /api/billing/agency-ledger` (camada `agency`), com `from`, `to` (`AAAA-MM-DD`, `to` inclusivo), `kind`, `account`, `after` → `{ rows, next, totals: { gross, fees, net, refunds, walletMovement }, completeSince }`; `completeSince` = `ledgerSince` da conta
- `…/ledger.csv` com os mesmos filtros
- `ledgerCsv(rows): string`

- [ ] **Step 1: Teste que falha**

```js
test('Agência A não lê a B; subconta não lê a camada da agência; módulo e permissão exigidos', async t => {});
test('workspace e account de outra agência são recusados', async t => { /* 403 ou 404 */ });
test('Mês no fuso da conta', async t => { /* venda 2026-12-01T02:30:00Z entra em novembro em America/Sao_Paulo */ });
test('CSV', () => {
  // BOM, separador ';', decimal com vírgula, 366 dias no máximo (400 acima), célula iniciada por = + - @ recebe apóstrofo (menos valores numéricos)
  // colunas: Data;Tipo;Subconta;Bruto;Taxa do gateway;Líquido estimado;Movimento de saldo;Vendedor;CPF/CNPJ do vendedor;Comprador;CPF/CNPJ do comprador;Método;Gateway;Cobrança;Origem;Importado
});
test('Recarga conta como recebida; consumo e crédito só em movimento de saldo', async t => {});
test('Taxa desconhecida não vira zero no líquido', () => { /* célula vazia */ });
```

- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** Totais percorrem até 20.000 linhas; acima, 400 `Reduza o período.` CPF do comprador mascarado na tela e inteiro no CSV.
- [ ] **Step 4: Rodar e ver passar; `npm test`; sincronizar `public/`; conferir no navegador como na tarefa 10**
- [ ] **Step 5: Commit** `feat(cobranca): livro com exportação para o contador`

### Task 12: Importação do passado e documentação

**Files:** Create `scripts/ledger-backfill.mjs`, `test/ledger-backfill.test.mjs`; Modify `README.md`, `docs/implementation/08-cobrancas-ghl-e-fiscal.md`, `docs/implementation/painel-melhoria/progresso.js`

**Interfaces — Produces:** `backfill({ store, dryRun = true, log }): Promise<{ accounts, facts, skipped }>`; uso `node scripts/ledger-backfill.mjs [--apply]`

- [ ] **Step 1: Teste que falha**

```js
test('Sem --apply não grava', async () => {});
test('Importa transações, planos e carteira com detail.imported e data original', async () => {});
test('Rodar duas vezes, ou depois de uma edição, não duplica', async () => {});
test('Pagamento de teste fica fora e uma conta com erro não para as outras', async () => {});
```

- [ ] **Step 2: Rodar e ver falhar**
- [ ] **Step 3: Implementar.** Mesmas chaves das tarefas 3 e 6. README: ordem em produção (migração, `provision-storage.sql`, deploy, importação), cada passo com autorização.
- [ ] **Step 4: `npm test` e `npm run lint` passando**
- [ ] **Step 5: Commit** `feat(cobranca): importação do passado e documentação`
