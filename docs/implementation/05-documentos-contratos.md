# 05 · Documentos e Contratos

Especificação do item **1.1** do plano de paridade ([04](04-paridade-gohighlevel.md), Fase 1). Ela cobre os itens que vêm depois: **1.2** (editor), **1.3** (assinatura eletrônica), **1.4** (cobrança após assinar) e a parte de documentos do **1.10** (gatilhos e ações de workflow). Orçamentos (1.5) ficam fora: no GHL eles são uma tela à parte, ligada às faturas (veja §10).

Referência do GHL: catálogo técnico [04c](04c-ghl-catalogo-tecnico.md) §3 (`/payments/proposals-estimates` e `/templates`), §4 (construtor "Documentos e contratos") e §1.3 (gatilho *Documents & contracts* e ação *Send documents & contracts*).

---

## 1. O que o GHL faz (resumo do levantamento)

| Parte | No GHL |
|---|---|
| Lista | Em Pagamentos → *All Documents & Contracts*. Abas: Rascunho, Aguardando outros, Concluídos, Pagamentos e Arquivados, cada uma com contador. Colunas: título, status, cliente, data de alteração e valor. Filtro por período e busca. |
| Modelos | Abas: Modelos, Documentos públicos e Biblioteca de conteúdo. Colunas: título, valor e data de alteração. |
| Começar | Documento em branco, upload de PDF ou modelo da biblioteca. |
| Blocos | Texto, imagem, vídeo, tabela, lista de produtos e quebra de página. |
| Campos preenchíveis | Assinatura, texto, data, rubrica, checkbox e dados de cartão. |
| Destinatários | Vários destinatários, com **ordem de assinatura**. |
| Extras | Variáveis do documento, biblioteca de conteúdo (sobre nós, benefícios, planos, equipe, vídeo, duas colunas) e tema. |
| Pagamento | Único ou recorrente. Cobrança direta após assinar, envio de fatura, pagamento automático e cronograma de pagamento. |
| Workflow | Gatilho *Documents & contracts* (mudança de status) e ação *Send documents & contracts*. |

---

## 2. O que o Graao já tem e vamos aproveitar

| Peça | Onde está | Uso aqui |
|---|---|---|
| Faturas (`invoices`), produtos, assinaturas, links, transações e cupons | `model.mjs`, `crm-model.mjs` | A lista de produtos do documento usa `products`; a cobrança gera uma `invoice` ou uma `subscription`. |
| Cobrança AbacatePay por subconta | `abacatepay.mjs` (`chargeInvoice`, webhook `checkout.completed`) | Cobrança única após assinar = `chargeInvoice` da fatura criada pelo documento. |
| Assinaturas AbacatePay | `abacatepay.mjs` (`/subscriptions/create`, hoje só no escopo da agência) | Base para a cobrança recorrente (1.4). É preciso abrir para o escopo da subconta. |
| Motor de workflows | `workflow-engine.mjs` (`emit`, `afterSave`) e `ui/workflow-data.js` | Novos gatilhos e ações (§8). |
| Variáveis `{{contact.first_name}}` | `expressions.mjs` (`resolveTemplate`, `buildWorkflowContext`) | Variáveis no texto do documento. |
| Página pública renderizada no servidor | `report-share.mjs` (relatório por link) e `/aprovar/...` (aprovação de posts com `hash` e `expires`) | Modelo para a página de assinatura: o navegador recebe só o documento, nunca o estado do workspace. |
| E-mail transacional | Resend (`client-portal.mjs`, `report-share.mjs`) | Envio do link de assinatura e da cópia final. |
| Permissões | `authorization.mjs` (comando → módulo) e `ui/agency-data.js` (coleção → módulo) | Tudo fica no módulo **`payments`**. |
| Tradução | `ui/i18n.js`, `ui/locales/` | Textos em pt-BR e es. |

---

## 3. Escopo

**Entra (itens 1.2 a 1.4):**
- Lista de documentos com as abas do GHL, modelos e biblioteca de conteúdo.
- Editor em blocos com campos preenchíveis, variáveis e tema.
- Envio a um ou mais destinatários, com ou sem ordem de assinatura.
- Página pública de assinatura, recusa, trilha de auditoria e certificado de conclusão.
- Cobrança única ou recorrente pelo AbacatePay depois da assinatura.
- Gatilho e ação de workflow.

**Fica para depois (registrado no painel):**
- **Upload de PDF com campos sobrepostos** (decisão D4, §11). No começo, o PDF entra como bloco "anexo" e os campos vão abaixo dele.
- **Documentos públicos**: um modelo com link aberto, que qualquer pessoa preenche e que gera o próprio documento. Entra depois do 1.4, reaproveitando o fluxo de assinatura.
- **Seção "Contratos" no portal do cliente**: entra com a Fase 6 (o portal do GHL tem Faturas, Estimativas e Contratos).
- **Campo "dados de cartão"**: não será recriado. O Graao não guarda dados de cartão; o pagamento acontece no checkout do AbacatePay logo depois da assinatura, o que cobre o mesmo caso de uso.

---

## 4. Modelo de dados

Três coleções novas no workspace, todas no módulo `payments` (adicionar a `crmCollections` ou a um `document-model.mjs` próprio, seguindo o padrão de `store-model.mjs`):

### 4.1 `documents`

```js
{
  id, created, updated,
  title,                       // até 160 caracteres
  kind: 'proposal' | 'contract' | 'document',
  status: 'draft' | 'sent' | 'completed' | 'declined' | 'expired' | 'void',
  archived: false,             // a aba "Arquivados" filtra por isto, sem mudar o status
  contactId,                   // cliente principal (obrigatório para enviar)
  opportunityId: '',           // opcional: liga a proposta a uma oportunidade
  templateId: '',              // modelo de origem, se houver
  theme: { accent, font, logo }, // tokens visuais (§6.4)
  blocks: [Block],             // conteúdo (§5)
  variables: [{ key, label, value }], // variáveis do documento: {{doc.prazo}}
  recipients: [Recipient],     // §7.1
  ordered: false,              // true = assinam em sequência pela ordem de `order`
  payment: Payment | null,     // §9
  expiresAt: '',               // opcional; depois disso o link para de funcionar
  sentAt: '', completedAt: '', declinedAt: '', voidedAt: '',
  total: 0,                    // soma da lista de produtos (calculada no servidor)
  invoiceId: '', subscriptionId: '', // ligações criadas pela cobrança
  sentBlocks: [Block],         // cópia congelada no envio, com as variáveis resolvidas (§7.2)
  values: {},                  // valores dos campos preenchidos: { [fieldId]: { value, at, by } }
  hash: '',                    // SHA-256 do corpo do documento na conclusão (§7.4)
  audit: [{ at, event, recipientId, ip, userAgent, detail }] // trilha (§7.3)
}
```

### 4.2 `documentTemplates`

Mesmo formato de `documents`, mas sem `status`, `contactId`, datas de envio, cobrança executada nem `audit`. Os destinatários viram **papéis** (`{ role: 'Cliente', order: 1 }`), que recebem um contato ao criar o documento a partir do modelo.

### 4.3 `contentBlocks` (biblioteca de conteúdo)

```js
{ id, created, name, category: 'about' | 'benefits' | 'pricing' | 'team' | 'video' | 'columns' | 'other', blocks: [Block] }
```

O Graao entrega 6 itens prontos, equivalentes aos do GHL e com textos próprios: Sobre nós, Benefícios, Planos, Equipe, Vídeo e Duas colunas.

### 4.4 Validação

As regras ficam no servidor, no mesmo estilo de `fields` em `model.mjs`:
- `req`, `str` e `one` para os campos simples.
- Limite de **200 blocos** por documento e de **10 destinatários**.
- Imagens como data URL com o limite que já existe (700 KB) ou referência à Mídia Drive (`files`).
- O documento só pode ser editado em `draft`. Depois de enviado, a única mudança permitida é anular (`void`).

---

## 5. Blocos

| Tipo | Campos | Observação |
|---|---|---|
| `text` | `html` (rich text com allowlist: p, h1–h3, b, i, u, a, ul, ol, li, br) | Aceita variáveis `{{...}}`. O HTML é sanitizado no servidor. |
| `image` | `src`, `alt`, `width` (25/50/75/100%) | |
| `video` | `url` (YouTube, Vimeo ou Loom) | Vira embed na página pública e link na cópia final. |
| `table` | `rows: string[][]` (até 20 × 8), `header: bool` | |
| `products` | `items: [{ productId?, name, description, qty, price, discount, optional, selected }]`, `currency` | Itens `optional` podem ser marcados ou desmarcados pelo cliente antes de assinar. O total é recalculado no servidor. |
| `page_break` | — | Quebra de página na impressão e na cópia final. |
| `columns` | `left: [Block]`, `right: [Block]` (só blocos simples) | Para o item "Duas colunas" da biblioteca. |
| `attachment` | `fileId` (PDF da Mídia Drive) | Substituto do upload de PDF no começo (D4). |
| `field` | §5.1 | Campo preenchível. |

### 5.1 Campos preenchíveis (`field`)

```js
{ type: 'field', id, kind: 'signature' | 'initials' | 'text' | 'date' | 'checkbox',
  label, required: true, recipientId,   // quem preenche
  placeholder: '', dateMode: 'signed_at' | 'pick' }
```

- `signature` e `initials`: desenhar no celular ou mouse, ou digitar o nome (renderizado numa fonte cursiva). Guardado como PNG.
- `date` com `signed_at` é preenchido automaticamente com a data da assinatura.
- Cada campo pertence a um destinatário. O editor mostra a cor do destinatário no campo.
- Para assinar, todos os campos `required` do destinatário precisam estar preenchidos.

---

## 6. Editor (item 1.2)

### 6.1 Onde fica

- **Pagamentos** ganha a aba **Documentos e contratos** (ao lado de Faturas, em `crmTabs.payments`).
- A aba tem as subabas **Rascunhos · Aguardando · Concluídos · Pagamentos · Arquivados**, com contador, colunas *Título, Status, Cliente, Alterado em, Valor*, filtro de período e busca.
- Botão **Novo**, com três opções: Em branco, A partir de um modelo e Duplicar documento.
- Aba **Modelos**, com as subabas **Modelos · Biblioteca de conteúdo**.

### 6.2 Tela do editor

Tela cheia em `#payments/document/<id>`, seguindo o padrão dos construtores existentes (formulários e Prancheta):

- **Esquerda: paleta.** Três grupos:
  - Blocos;
  - Campos (com seletor de destinatário);
  - Biblioteca (arrastar um item insere os blocos dele).
- **Centro: página.** Largura A4, blocos reordenáveis por arrastar e edição direta do texto.
- **Direita: painel.** Abas Destinatários, Variáveis, Pagamento e Documento (título, tipo, contato, oportunidade, validade, tema).
- **Topo:** título, status, "Salvo há X", Pré-visualizar (como o cliente verá), Salvar como modelo e **Enviar**.

### 6.3 Variáveis

- Do contato e do workspace: as mesmas de `buildWorkflowContext` (`{{contact.first_name}}`, `{{contact.company}}`, `{{workspace.name}}`…).
- Do documento: `{{doc.<chave>}}`, definidas no painel (ex.: prazo, escopo, data de início).
- Do próprio documento: `{{document.title}}`, `{{document.total}}` e `{{document.expires_at}}`.
- Na edição, aparecem como "pílulas". No envio, são resolvidas com `resolveTemplate` e o texto final fica gravado na cópia (§7.4).

### 6.4 Tema

Cor de destaque, fonte (3 opções das já carregadas no app) e logo (da Mídia Drive ou do perfil). Fica em `theme` e vale para o editor, a página pública e a cópia final.

### 6.5 Critérios de aceite do 1.2

- Criar em branco, a partir de um modelo e duplicando.
- Adicionar, editar, reordenar e excluir os 9 tipos de bloco.
- Usar variáveis e ver a pré-visualização resolvida para o contato escolhido.
- Salvar como modelo e inserir itens da biblioteca.
- A lista de produtos recalcula o total. O servidor rejeita um total enviado pelo cliente.
- As abas da lista funcionam, com contadores.
- O usuário sem o módulo `payments` não vê nem altera nada (teste em `test/isolation.test.mjs`).
- Textos em pt-BR e es.

---

## 7. Assinatura eletrônica (item 1.3)

### 7.1 Destinatários

```js
{ id, contactId: '', name, email, phone: '',
  role: 'signer' | 'approver' | 'cc',   // cc só recebe a cópia final
  order: 1,                              // usado quando documents.ordered = true
  status: 'pending' | 'sent' | 'viewed' | 'signed' | 'declined',
  tokens: [sha256…],          // até 3 hashes ativos; “novo link” substitui todos
  sentAt, viewedAt, signedAt, declinedAt,
  ip, userAgent }
```

- Sem ordem: todos recebem o link no envio.
- Com ordem: só os do menor `order` pendente recebem o link. Quando todos desse nível assinam, o próximo nível recebe o dele.
- **Remetente que assina**: o usuário do Graao pode se incluir como destinatário e assinar pelo próprio app, sem link.

### 7.2 Envio e página pública

- **Envio:**
  1. O documento passa a `sent` e as variáveis são resolvidas e congeladas no conteúdo.
  2. Cada destinatário recebe um token aleatório (24 bytes, 48 caracteres hex). Só o `sha256` do token é guardado, como no `approval.hash` da aprovação de posts.
  3. O link é `/assinar/<workspace>#<token>`. O token fica no fragmento (depois do `#`), então não chega aos logs do servidor nem a outros sites como referência. Ele vai por e-mail (Resend) e, se o workspace tiver WhatsApp conectado, também por WhatsApp. O usuário escolhe os canais no diálogo de envio, que tem assunto e mensagem editáveis.
- **Página pública:** a página é estática; o documento vem renderizado pelo servidor (`ui/document-render.js`), já só com o que aquele destinatário pode ver. Ela mostra o documento, os campos do destinatário destacados e um passo a passo:
  1. Preencher os campos.
  2. Revisar.
  3. Aceitar o termo de assinatura eletrônica.
  4. Assinar.

  A página tem botão **Recusar**, com motivo opcional, e funciona bem no celular.
- **Rotas públicas** (sem sessão; a autorização é o token, enviado no corpo da requisição):
  - `GET /assinar/:ws`: a página, com CSP restrita (sem script nem estilo inline).
  - `POST /api/assinar/:ws` com `action`:
    - `open`: abre e registra a visualização uma vez;
    - `sign`: valores dos campos, itens opcionais escolhidos e aceite do termo;
    - `decline`: recusa, com motivo opcional.

  Limite de 120 requisições a cada 10 minutos por IP. Token inválido ou substituído responde 404. Documento anulado, recusado ou vencido abre só para leitura, com o aviso correspondente.

### 7.3 Trilha de auditoria

Cada evento entra em `documents.audit`: criado, enviado (para quem e por qual canal), visualizado, campo preenchido, assinado, recusado, anulado, concluído e pago. Os eventos públicos guardam IP, user-agent e data/hora (UTC).

### 7.4 Conclusão e cópia final

Quando o último signatário assina:
1. O status vira `completed`.
2. A **cópia final** é o corpo do documento renderizado a partir do conteúdo congelado no envio (`sentBlocks`) e dos valores dos campos (`values`), com as assinaturas embutidas.
3. Calcula-se o **SHA-256** desse corpo, gravado em `hash` e mostrado no certificado. Ao abrir a cópia, o hash é recalculado: se não bater (por exemplo, uma imagem da Mídia Drive foi excluída), a página avisa.

   *Mudança em relação ao plano original:* a cópia não é gravada numa linha separada do banco (`signed-<ws>-<docId>`). Essas linhas apareceriam nas listagens de subcontas do SQLite e do Supabase; gerar a cópia a partir do estado e conferir o hash dá a mesma garantia sem esse risco.
4. Gera-se o **certificado de conclusão**, anexado ao fim da cópia: destinatários, e-mails, datas, IPs, hash e a trilha resumida.
5. Todos (signatários e `cc`) recebem por e-mail o link da cópia. No navegador, a cópia vira PDF por "Imprimir → Salvar como PDF", com CSS de impressão. Gerar PDF no servidor não é necessário agora, porque o projeto não tem dependências e o certificado com hash garante a integridade.

### 7.5 Validade jurídica (Brasil)

- O formato equivale a uma **assinatura eletrônica simples/avançada** (MP 2.200-2/2001, art. 10 §2º; Lei 14.063/2020), válida entre particulares quando as partes aceitam o meio. Isso cobre propostas e contratos de prestação de serviço, que são o caso das agências.
- Não é assinatura qualificada ICP-Brasil e o produto não deve prometer isso.
- O termo aceito antes de assinar diz exatamente isso.
- Reforço opcional por documento: **código de verificação** enviado ao e-mail do destinatário antes de assinar (decisão D5, §11).
- LGPD: IP e user-agent são guardados só na trilha do documento e saem junto com ele quando o documento é excluído.

### 7.6 Critérios de aceite do 1.3

- Envio com e sem ordem, com destinatários `signer`, `approver` e `cc`.
- A página pública funciona sem login, no celular, em pt-BR e es (pelo idioma do workspace).
- Token errado, documento anulado ou expirado → 404, sem vazar dados.
- A página não recebe nada do workspace além do próprio documento (teste como o de `report-share.test.mjs`).
- Assinatura, recusa e conclusão registram a trilha. A cópia final tem hash e certificado.
- Depois de enviado, o documento não muda. Para alterar, é preciso anular e duplicar.
- O remetente pode reenviar o link a um destinatário (gera um token novo e invalida o anterior).

---

## 8. Workflow (parte do item 1.10)

| Tipo | Nome no Graao | Filtros / campos |
|---|---|---|
| Gatilho `document_status` | Documento ou contrato | Status: enviado, visualizado, assinado por um destinatário, concluído, recusado, expirado. Modelo (opcional). |
| Gatilho `document_paid` | Documento pago | Modelo (opcional). |
| Ação `send_document` | Enviar documento ou contrato | Modelo (obrigatório), canais (e-mail/WhatsApp) e validade em dias. O contato do workflow vira o destinatário do papel principal. |

O `emit` acontece em `afterSave` (como `invoice_status`) e nas rotas públicas de assinatura. O contexto inclui `documentId`, `templateId`, `status` e `total`. As variáveis `{{trigger.document_title}}` e `{{trigger.document_url}}` ficam disponíveis nas ações seguintes.

---

## 9. Cobrança após assinar (item 1.4)

```js
payment: {
  mode: 'one_time' | 'recurring',
  timing: 'on_sign' | 'invoice',   // on_sign: checkout logo após assinar · invoice: envia fatura
  interval: 'Monthly' | 'Yearly' | ..., // só para recurring (mesmos valores de crm-model `intervals`)
  schedule: [{ percent, dueDays }],     // opcional: parcelas (ex.: 50% na assinatura, 50% em 30 dias)
  autoCharge: false,                    // recurring: cobrança automática pelo AbacatePay
  status: 'pending' | 'paid' | 'partial' | 'failed'
}
```

- **Único + `on_sign`:**
  1. Ao concluir, o servidor cria uma `invoice` ligada ao documento (`documentId`), com o total.
  2. Chama `chargeInvoice` e redireciona o último signatário para o checkout do AbacatePay.
  3. O webhook existente marca a fatura como paga. A fatura paga atualiza `documents.payment.status` e dispara `document_paid`.
- **Único + `invoice`:** cria a fatura e envia o link de pagamento junto com a cópia final.
- **Cronograma:** cria uma fatura por parcela, com vencimento em `dueDays`. A primeira segue a regra de `timing`.
- **Recorrente:**
  1. Cria uma `subscription` ligada ao produto recorrente da lista.
  2. Abre `subscriptions/create` do AbacatePay no **escopo da subconta**. Hoje só existe no escopo da agência, então é preciso generalizar `subscribe` em `abacatepay.mjs`.
  3. Os eventos `subscription.*` atualizam a assinatura da subconta.
- **Sem AbacatePay conectado:** o envio avisa e oferece só a opção `invoice` com baixa manual.
- A aba **Pagamentos** da lista mostra documentos com cobrança, com status pendente, parcial, pago ou falhou.

**Como ficou na implementação:**
- A configuração fica em `payment = { mode, timing, dueDays, schedule, interval }` no documento e no modelo (aba **Pagamento** do editor). `autoCharge` não foi criado: no AbacatePay, a recorrência já cobra sozinha.
- **Recorrente só mensal.** O único ciclo confirmado da API v2 do AbacatePay é `MONTHLY`, já usado nos planos da agência; a referência oficial dos outros ciclos não foi encontrada. Semanal e anual ficam para quando isso for confirmado.
- **Sem redirecionamento automático.** Depois de assinar, a página pública mostra as faturas e o botão **Pagar agora** (ou **Ativar assinatura**). Isso evita tirar a pessoa da página sem aviso e funciona igual para "logo depois de assinar" e "fatura com prazo".
- O link pessoal nunca vai para o AbacatePay: a volta do pagamento cai em `/assinar/<ws>?pagamento=ok`, uma página de agradecimento sem o token.
- Pagamento sem AbacatePay conectado: as faturas ficam em Pagamentos → Faturas; marcar como paga dá baixa no documento do mesmo jeito.
- Assinaturas da subconta são registradas no próprio documento (`payment.subscription`) e cada mensalidade paga vira uma transação. Elas não entram na lista de Assinaturas de Pagamentos, que exige um produto do catálogo.

### 9.1 Critérios de aceite do 1.4

- Fluxo completo em modo teste do AbacatePay: assinar → checkout → webhook → fatura paga → documento pago → gatilho `document_paid`.
- Cronograma gera N faturas com os vencimentos certos.
- Recorrente cria a assinatura na subconta. Cancelar a assinatura não muda o documento.
- Pagamento sem conta conectada cai na fatura manual sem erro.

---

## 10. Relação com orçamentos e faturas

- **Orçamento** (1.5) é um registro parecido com fatura (número, itens, status rascunho/enviado/aceito/recusado/faturado), não um documento com blocos.
- O documento e o orçamento compartilham o componente de **lista de produtos** e o cálculo de total. Esse componente deve nascer no 1.2 de forma reutilizável (`ui/line-items.js`).
- Documento concluído com cobrança → fatura com `documentId`. Na tela da fatura, o link "Ver contrato" abre a cópia final.

**Como os orçamentos ficaram (item 1.5):**
- Coleção `estimates` (`estimate-model.mjs`). Cada orçamento tem número sequencial (`ORC-0001`), cliente, oportunidade, emissão, validade, itens, observações e condições, além de "criar a fatura automaticamente ao aprovar" com o prazo da fatura.
- Pagamentos ganhou a aba **Orçamentos**, com as subabas do GHL e contadores: Todos, Rascunho, Enviado, Aceito, Recusado e Faturado. O status "Vencido" aparece só no orçamento.
- **Editor** com prévia ao vivo. Os itens usam `ui/line-items.js`, com a mesma matemática da lista de produtos dos documentos. A interface de itens dos documentos continua a dela, e unificar fica para quando as faturas ganharem itens (1.6).
- **Envio por link pessoal** em `/orcamento/<ws>#<token>`, como nos documentos. O cliente escolhe os itens opcionais e aprova digitando o nome, ou recusa com motivo. Ao aprovar, a fatura nasce com `estimateId` e o botão **Pagar agora** usa o AbacatePay.
- **No app:** novo link, reenviar, marcar como aceito ou recusado, **Revisar** (volta a rascunho e invalida o link) e **Faturar**, para quem não quer a fatura automática.
- **Workflow:** gatilho **Orçamento** (enviado, visualizado, aceito, recusado, faturado, pago, vencido) e ação **Enviar orçamento**, que manda uma cópia de um orçamento modelo para o contato.
- Ainda não existe o modelo de orçamento como item separado (aba Templates → Estimates do GHL). Por enquanto, qualquer orçamento serve de modelo para a automação, ou pode ser duplicado.

---

## 11. Decisões (registradas no painel)

| Id | Pergunta | Recomendação | Bloqueia |
|---|---|---|---|
| D4 | Upload de PDF com campos sobrepostos entra já no 1.2? | **Não.** No 1.2, PDF vira bloco `attachment`; a sobreposição (exige pdf.js e posicionamento absoluto) vira item próprio depois do 1.4. | — (o 1.2 segue com a recomendação) |
| D5 | Código de verificação por e-mail antes de assinar | **Opcional por documento**, desligado por padrão. | — (o 1.3 segue com a recomendação) |

Se o usuário escolher diferente, o item afetado ganha a tarefa correspondente.

---

## 12. Arquivos previstos

| Arquivo | Conteúdo |
|---|---|
| `document-model.mjs` (novo) | Coleções, validação de blocos, cálculo de total, envio, assinatura, conclusão e cobrança. |
| `document-page.mjs` (novo) | Página pública de assinatura e cópia final renderizadas no servidor (padrão `report-share.mjs`). |
| `model.mjs` | Registrar coleções, `fields` e `beforeDelete`. |
| `server.mjs` | Rotas públicas `/assinar/...`, comandos `document-*` e entrega por e-mail/WhatsApp pela fila de workflows. |
| `document-mail.mjs` (novo) | Textos dos e-mails e envio pelo Resend. |
| `ui/document-render.js` (novo) | HTML do documento enviado e do certificado, compartilhado entre servidor e app. |
| `ui/document-sign.html`, `.js`, `.css` (novos) | Página pública de assinatura. |
| `authorization.mjs`, `ui/agency-data.js` | Comandos `document-*` e coleções → módulo `payments`. |
| `abacatepay.mjs` | Assinatura no escopo da subconta e ligação fatura → documento. |
| `workflow-engine.mjs`, `ui/workflow-data.js` | Gatilhos `document_status` e `document_paid` e ação `send_document`. |
| `ui/documents.js`, `ui/documents.css` (novos) | Lista, modelos, biblioteca e editor. |
| `ui/line-items.js` (novo) | Lista de produtos reutilizável (documentos e orçamentos). |
| `ui/crm.js`, `ui/screens.js`, `ui/app.js` | Aba nova em Pagamentos e rota do editor. |
| `ui/locales/` | Textos pt-BR e es. |
| `test/documents.test.mjs` (novo) | Validação, permissões, fluxo de assinatura, isolamento da página pública, cobrança e workflow. |

## 13. Ordem de entrega

1. **1.2:** modelo de dados, lista, editor, modelos e biblioteca. Sem envio.
2. **1.3:** envio, página pública, assinatura, trilha, cópia final, gatilho `document_status` e ação `send_document`.
3. **1.4:** cobrança única, cronograma e recorrente, gatilho `document_paid`.

Cada etapa termina com testes passando (`npm test`), verificação no navegador e atualização do [painel](painel/progresso.js).
