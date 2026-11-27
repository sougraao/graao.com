# Entrega 2 da cobrança: graao → agência

Data: 25/11/2026. Base: `docs/implementation/08-cobrancas-ghl-e-fiscal.md` (camada 1) e a entrega 1 (livro, baixa, suspensão, cadastro fiscal), mesclada nos PRs #152 a #156.

## 1. Para que serve

Hoje qualquer pessoa entra com o Google e ganha uma agência completa, de graça e sem limite. O plano é só um nome (`billing-plan`). O graao não recebe nada e não sabe quem é quem.

Esta entrega faz o graao cobrar a agência como o GHL cobra: teste grátis, plano mensal pago no cartão, bloqueio de quem não paga e limites por plano. Também liga o programa de afiliados do graao, que hoje só existe na tela.

Decisões do usuário (25/11/2026):

- Teste de **15 dias**. No fim, a agência pode **estender por mais 15**, uma vez.
- O cartão só é pedido **na extensão** (ou no pagamento). Os primeiros 15 dias não pedem cartão.
- **Uma conta por celular**, confirmado pelo WhatsApp na criação da conta.
- Planos de **R$ 97, R$ 297 e R$ 497** por mês, com as mesmas limitações do GHL.
- **Sem cupom.**
- Link de afiliado do graao funcionando.
- Número que recebe as confirmações: o celular do usuário, por enquanto, até o graao ter o dela. Fica numa variável de ambiente, nunca no código.
- Aprovadas as recomendações: só o dono confirma o celular; as agências atuais confirmam no próximo acesso e ganham 15 dias a partir daí; bloqueio não apaga dados; afiliado recebe 40% de cada mensalidade paga, pago por fora.

## 2. Objetivos, não objetivos e o que seria fracasso

Objetivos:

1. Ninguém usa o graao sem celular confirmado.
2. Um celular, uma agência, um teste.
3. Quem não paga perde o acesso no dia certo; quem paga não percebe nada.
4. Cada plano libera o mesmo que o plano do GHL de mesmo preço.
5. Indicação feita pelo link vira comissão sem ninguém digitar nada.

Não objetivos: plano anual, cupom, upgrade com cobrança proporcional, nota fiscal do graao (NFS-e), recarga automática da carteira, adicionais mensais (camada 1.8), pagamento automático da comissão.

Seria fracasso, mesmo funcionando:

- Cobrar duas vezes, ou cobrar quem cancelou.
- Bloquear agência que pagou (atraso do webhook não pode virar bloqueio).
- O WhatsApp pessoal do usuário ser banido ou ter as conversas dele guardadas no graao.
- Clientes finais das agências (sites, formulários, lojas) pararem por causa do bloqueio da agência.
- Uma agência atual perder dados ou acesso sem aviso.

## 3. Restrições

- Gateway: AbacatePay v2, conta da própria graao, ligada como a conexão de agência da agência raiz (`AGENCY_ID = 'agency'`, escopo `agency`). Sem split, sem porcentagem (memória `cobranca-igual-ghl`).
- AbacatePay: teste grátis de 1 a 90 dias só no cartão e definido no produto (`trialDays`); não existe rota para estender um teste já iniciado; troca de plano vale no próximo ciclo, sem proporcional; cancelamento pela API vale na hora; `retryPolicy` até 10 tentativas, de 1 a 30 dias. Assinatura em produção exige "assinaturas liberadas" na conta.
- WhatsApp: só Evolution API (memória `whatsapp-evolution`), não oficial. Mandar códigos para números desconhecidos aumenta o risco de banimento.
- O WhatsApp pode identificar o remetente por LID; a Evolution manda o número real em `remoteJidAlt`/`senderPn` (já tratado em `whatsapp.mjs:141`).
- `store.insert` usa `on_conflict=id` com `ignore-duplicates`: devolve vazio quando o id já existe. Serve como trava atômica.
- Toda tela nova usa o padrão `.set-form`, tokens de `ui/tokens.css`, sem `confirm/alert/prompt` (usar `ui/ask.js`). Textos em pt e es.
- Documentação na doc.graao.com no mesmo PR.

## 4. Abordagens consideradas

| Abordagem | Como fica | Por que não (ou sim) |
|---|---|---|
| **A. Cartão só na extensão ou no pagamento** (escolhida) | 15 dias sem cartão. Estender = assinatura com `trialDays: 15`, R$ 0,00 hoje, primeira cobrança no 30º dia. Pagar = assinatura sem teste. | Um só cadastro de cartão, sem malabarismo no gateway. O celular confirmado segura o abuso que o cartão seguraria. |
| B. Cartão no cadastro (igual ao GHL) | Assinatura com 15 dias de teste logo no cadastro. Estender = cancelar e criar outra com 15 dias, a agência digita o cartão de novo. | Dois cadastros de cartão e uma assinatura cancelada no meio. Recusada. |
| C. Cartão salvo e cobrança feita pelo graao | Checkout transparente guarda o `cardToken`; o graao cobra quando quiser. | Contradiz "o AbacatePay renova" (decisão da entrega 1) e põe tentativas e renovação do nosso lado. Recusada. |

Verificação do celular:

| Abordagem | Por que |
|---|---|
| **Código enviado pela pessoa** (escolhida) | A tela mostra um código e um botão que abre o WhatsApp com a mensagem pronta para o número do graao. Quem manda é a pessoa: o graao só responde. Menor risco de banimento e confirma o número de quem enviou. |
| Código enviado pelo graao | Exige mandar mensagem a desconhecidos pela Evolution, que não é oficial. Recusada. |

## 5. O desenho

### 5.1 Linha do tempo da agência

```
Google ─► confirmar celular ─► Teste (15 dias) ─┬─► Pagar agora ─────────────► Ativa
                                                ├─► Estender (cartão, +15) ──► Teste estendido ─► 30º dia cobra ─► Ativa
                                                └─► nada ─► Bloqueada ─► Pagar ─► Ativa
Ativa ─► cobrança recusada ─► Em atraso (acesso normal, tentativas a cada 3 dias) ─► tentativas esgotadas ─► Bloqueada
Ativa ─► Cancelar ─► vale até o fim do mês pago ─► Bloqueada
```

Estado novo em `agency.billing` (o `plan` atual continua como o plano escolhido):

```js
billing: {
  plan: 'Starter' | 'Unlimited' | 'Agency Pro',
  status: 'Unverified' | 'Trial' | 'Active' | 'PastDue' | 'Blocked' | 'Exempt',
  trialEndsAt: ISO,            // fim do teste (15 ou 30 dias)
  extended: boolean,           // já usou a extensão
  subscription: { provider: 'abacatepay', checkoutId, subscriptionId, status, planId, amount, nextChargeAt, cancelAt } | null,
  failures: [...],             // como na entrega 1
  blockedAt, blockedReason: 'trial_ended' | 'payment_failed' | 'cancelled',
  phone: '+55…', phoneVerifiedAt: ISO,
  referredBy: { agencyId, code, at } | null
}
```

`Exempt` vale só para a agência raiz (o graao). Quem decide o acesso é uma função pura `agencyAccess(agency, now)` em `agency-billing-model.mjs`, testada à parte, que devolve `{ status, daysLeft, canUse, plan, limits }`.

**Atraso do webhook nunca bloqueia.** O bloqueio por fim de teste só acontece se não houver assinatura em `PENDING` com checkout pago ou em teste; antes de bloquear, o cron consulta o AbacatePay (`/subscriptions/get`).

### 5.2 Criar a conta e confirmar o celular

1. Pessoa entra com o Google. `accessContext` (server.mjs:593) continua criando a agência, agora com `billing.status = 'Unverified'`.
2. Enquanto `Unverified`, toda rota da agência e das subcontas devolve 402 com `code: 'PHONE_REQUIRED'` e o app abre a tela **Confirme seu celular**:
   - campo do celular (com DDI, Brasil por padrão);
   - botão **Confirmar pelo WhatsApp**, que abre `https://wa.me/<número do graao>?text=Confirmar%20graao%20<código>`;
   - QR do mesmo link para quem está no computador;
   - a tela espera a confirmação sozinha (consulta a cada 3 s, por até 15 min).
3. Código: 6 caracteres sem ambiguidade (sem 0/O/1/I), válido por 15 min, guardado como hash na agência com o celular digitado. No máximo 5 códigos por hora por agência e 20 por IP.
4. A Evolution entrega a mensagem num webhook próprio, `/api/verify/whatsapp/<segredo>`, separado do webhook das subcontas. Ele:
   - ignora tudo que não for texto no formato `Confirmar graao XXXXXX`;
   - **nunca guarda** mensagens, contatos ou mídia (é o WhatsApp pessoal do usuário);
   - acha o código, confere que o número real do remetente (normalizado) é o mesmo digitado; LID sem número real = recusa com resposta "abra pelo celular deste número";
   - tenta `store.insert('phone-' + sha256(e164), { agencyId, at })`. Vazio = número já usado: responde "este número já tem uma conta no graao" e marca o código como recusado;
   - sucesso: grava `phone`, `phoneVerifiedAt`, `status = 'Trial'`, `trialEndsAt = agora + 15 dias`, e responde "Pronto, sua conta do graao está confirmada".
5. Normalização: só dígitos; Brasil (55) com celular de 10 dígitos ganha o 9 depois do DDD. A trava usa o número normalizado.
6. Convidados para a equipe da agência (`store.findAgency({ users: … })`) não confirmam celular.
7. Agências atuais: na migração, todas menos a raiz ficam `Unverified`; ao confirmar, ganham 15 dias a partir da confirmação. Nenhum dado muda.
8. Trocar de número ou número perdido: só pelo suporte (admin da raiz libera a trava). Excluir a agência **não** libera o número (impede repetir o teste); isso entra na política de privacidade.

A instância de confirmação é criada pelo admin da raiz em **Configurações → WhatsApp de confirmação**: a tela cria a instância na Evolution com o nome de `GRAAO_VERIFY_INSTANCE`, aponta o webhook dela para o caminho acima (reaproveita `connectOnce` e `/webhook/set` de `whatsapp.mjs`) e mostra o QR para ler com o celular. Mostra também se ela está conectada.

Variáveis novas: `GRAAO_VERIFY_WHATSAPP` (número em dígitos), `GRAAO_VERIFY_INSTANCE` (nome da instância na Evolution), `GRAAO_VERIFY_SECRET` (segredo do caminho do webhook). Sem elas, o cadastro mostra "cadastro temporariamente fechado" e não cria agência nova; as existentes continuam como estão.

Se a instância cair, a tela diz "a confirmação está fora do ar, tente em alguns minutos" (o painel Plataforma do PR #166 pode alertar).

### 5.3 Teste, extensão e pagamento

Na conta do graao no AbacatePay, um produto por plano e variação: `graao-agency-<plano>` (mensal, sem teste) e `graao-agency-<plano>-t15` (mensal, `trialDays: 15`). Reaproveita `ensureProduct`.

- **Aviso:** faixa no topo do app nos dias 12, 13, 14 e 15 ("Seu teste acaba em N dias") e e-mail no dia 12. Botão **Escolher plano**.
- **Tela de planos** (Configurações → Plano e cobrança): três cartões com preço e limites, botão **Assinar** e, se ainda não estendeu e o teste está no fim (a partir do dia 12 ou já bloqueada por fim de teste), **Ganhar mais 15 dias**.
- **Assinar:** `subscriptions/create` sem teste, `methods: ['CARD', 'PIX']`, `retryPolicy: { maxRetry: 8, retryEvery: 3 }` (≈ 21 dias, como o GHL), metadata `{ agency: agencyId, plan }`. `subscription.completed` → `Active`.
- **Ganhar mais 15 dias:** mesma chamada com o produto `-t15` e só `CARD`. `subscription.trial_started` → `Trial`, `extended = true`, `trialEndsAt = agora + 15 dias`. A primeira cobrança no 30º dia chega como `subscription.renewed` → `Active`.
- **Webhook:** o webhook de agência da raiz já existe (`/api/abacatepay/webhook/agency/agency`). Eventos com `metadata.agency` vão para `agency.billing` da agência indicada; os demais seguem como hoje. Cada pagamento entra no livro do graao (camada `platform`, nova) com a mesma chave idempotente da entrega 1.
- **Falha:** `subscription.payment_failed` → `PastDue`, acesso normal, faixa vermelha e e-mail aos administradores. `subscription.cancelled` com `max_payment_retries_exceeded` → `Blocked`.
- **Troca de plano:** subir libera os limites na hora e o preço novo vale no próximo ciclo (`change-plan`). Descer só se a agência já cabe no plano menor (ex.: até 3 subcontas no Starter), e também vale no próximo ciclo.
- **Cancelar:** a agência pede; o graao guarda `cancelAt = nextChargeAt` e cancela na API nesse dia. Até lá, tudo normal.
- **Bloqueada:** a agência e os usuários das subcontas só veem a tela de pagamento. Sites, formulários, lojas, webhooks e automações das subcontas **continuam funcionando** (os clientes finais não pagam pelo atraso da agência). Nada é apagado.
- **Cron:** o cron que já chama `/api/social/cron` a cada minuto roda também `agencyBillingSweep`, no máximo uma vez por hora (marca da última execução na agência raiz): fim de teste, cancelamentos agendados e e-mails de aviso. Antes de bloquear, consulta o gateway.

### 5.4 Limites dos planos (iguais ao GHL)

Fonte: gohighlevel.com/pricing e central de ajuda do GHL, consultadas em 25/11/2026. O GHL renomeou o plano de US$ 497 de "Agency Pro" para "Founder"; no graao fica **Agency Pro**.

| | Starter R$ 97 | Unlimited R$ 297 | Agency Pro R$ 497 |
|---|---|---|---|
| Subcontas | até 3 | ilimitadas | ilimitadas |
| Contatos e usuários | ilimitados | ilimitados | ilimitados |
| Todas as ferramentas da subconta | sim | sim | sim |
| API e MCP (chaves e integrações privadas) | sim | sim | sim |
| App desktop com a marca da agência | não | sim | sim |
| Repasse de consumo às subcontas (`saas-rebilling`) | não | sim | sim |
| Modo SaaS: planos, assinatura e suspensão de subcontas | não | não | sim |
| Criar subconta pela API/MCP | não | não | sim |

Durante o teste vale tudo do Agency Pro, como o GHL faz no teste. Ao escolher o Starter com mais de 3 subcontas, a tela pede para pausar ou excluir as excedentes antes.

Onde trava (sempre no servidor, nunca só na tela): `createAccount` (server.mjs:755) e a criação pela API/MCP; os comandos `desktop-app*`, `saas-rebilling`, `saas-mode`, `saas-suspension`, `saas-account` de `agency-model.mjs`; o `subscribe` de subconta (`routes/billing.mjs`). A tela mostra o recurso com um selo "Unlimited" ou "Agency Pro" e o botão **Mudar de plano**, em vez de esconder.

A constante `agencyPlans` (ui/agency-data.js:120) passa a ser `[['Starter', 97], ['Unlimited', 297], ['Agency Pro', 497]]` em reais, junto com um `planLimits` único usado pelo servidor e pela tela.

### 5.5 Afiliados do graao

- Link: `https://graao.com/?ref=<código>`. Hoje nada lê o `ref`. A página inicial (login) grava o cookie `graao_ref` por 90 dias; o primeiro link vale (igual aos cookies de afiliado das subcontas).
- Na confirmação do celular, se houver `graao_ref` válido e não for a própria agência (mesmo código ou mesmo celular), grava `billing.referredBy` e cria a indicação na agência que indicou (`referrals`, já existe) com status **Em teste**.
- Cada pagamento da assinatura da agência indicada (`completed` e `renewed`) gera uma comissão de 40% do valor pago, com 30 dias de carência (reembolso e contestação estornam, como no programa das subcontas). Indicação muda para **Ativa**; cancelada ou bloqueada vira **Inativa**.
- A agência que indica vê as indicações e as comissões, e cadastra a chave Pix (no lugar de PayPal/Wise). Ela **não** digita indicação nem registra pagamento (hoje a tela deixa; isso sai).
- O admin da raiz vê o que deve a cada afiliado e marca **Pago** depois de pagar por Pix por fora. Cada pagamento entra no livro do graao.

### 5.6 O que muda para quem já usa

- 5 agências em produção (além da raiz), criadas nos últimos 14 dias. No próximo acesso: tela de confirmação do celular, depois 15 dias de teste.
- A agência raiz fica `Exempt` e nunca é bloqueada.
- Um e-mail avisa as agências atuais antes do deploy (texto na tela de lançamento; envio manual pelo usuário).

## 6. Partes e ordem

Quatro PRs, cada um com testes, artigo e linha nas novidades:

1. **Celular confirmado** (5.2): verificação, trava por número, migração das agências atuais para `Unverified`. Artigo `comece-aqui/criar-conta`.
2. **Teste e plano** (5.1 e 5.3): estados, tela de planos, assinatura, webhook, cron, bloqueio. Artigo `agencia/plano-da-graao`.
3. **Limites por plano** (5.4). Atualiza os artigos das telas que ganham selo.
4. **Afiliados do graao** (5.5). Artigo `agencia/afiliados-da-graao`.

O 1 entra em produção sozinho (sem ele, ninguém chega ao teste). O 2 só vai para produção com a conta do graao no AbacatePay ligada na raiz e com assinaturas liberadas.

## 7. Antes de ir para produção (do usuário)

- Conectar o AbacatePay do graao (CNPJ do graao) na agência raiz e pedir a liberação de assinaturas.
- Ligar o celular de confirmação na Evolution como instância própria (QR) e definir as três variáveis na Vercel.
- Saber que o WhatsApp pessoal fica conectado à Evolution como aparelho: o graao não guarda as conversas, mas a Evolution recebe todas, e há risco de banimento por ser API não oficial. Trocar pelo número do graao assim que existir.
- Revisar com o contador a nota da mensalidade (fora desta entrega).

## 8. Escolhas deixadas ao construtor

- Nome dos arquivos novos (sugestão: `agency-billing-model.mjs`, `phone-verify.mjs`, `routes/verify.mjs`).
- Texto exato das mensagens, seguindo o tom do graao.
- Forma do QR (o graao já gera QR em `qr-model.mjs`).
- Testes: modelo puro com relógio injetado; webhook com payloads gravados do AbacatePay em modo de teste; trava do celular com duas confirmações simultâneas.

## 9. Escolhas feitas por mim (o usuário pode mudar)

- Durante o teste vale tudo do Agency Pro.
- Subir de plano libera na hora e cobra o novo preço no próximo ciclo (o GHL cobra a diferença na hora).
- Bloqueio não para sites, formulários, lojas e automações das subcontas.
- Pix aceito no pagamento direto; a extensão exige cartão (o teste do AbacatePay é só no cartão).
- Atraso: 8 tentativas a cada 3 dias (≈ 21 dias com acesso), depois bloqueio.
- Cookie de afiliado de 90 dias, vale o primeiro link; comissão com 30 dias de carência.
- Excluir a agência não libera o celular.
- Os recursos que o GHL reserva ao plano de US$ 497 além do modo SaaS (salas de reunião, eventos, gestão de projetos) **não** ficam travados no graao: aqui eles já existem para todos, e tirar de quem usa seria perda. Só o modo SaaS e a criação de subconta pela API ficam no Agency Pro.
