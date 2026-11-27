# Cobrança, entrega 1: fundação

Estado: aguardando aprovação. Base: `docs/implementation/08-cobrancas-ghl-e-fiscal.md`.

## Intenção

O Graao vai cobrar como o GoHighLevel: o Graao cobra a agência, a agência cobra a subconta, a subconta cobra o consumidor, cada um no
próprio gateway. Sem porcentagem e sem split. Antes de ligar cobranças novas, o que já existe precisa registrar dinheiro
corretamente, reagir a quem não paga e identificar vendedor e comprador para a contabilidade brasileira.

Decisões do usuário: modelo igual ao GHL; sem porcentagem; o AbacatePay renova os planos; seis entregas, esta é a primeira.

## Metas

1. Todo dinheiro registrado uma única vez, em livro que não se altera nem se apaga.
2. Subconta que não paga o plano é suspensa e consegue pagar e voltar sozinha.
3. Fatura só é baixada com valor suficiente; reembolso e contestação aparecem em todo lugar.
4. Agência, subconta e contato têm CPF/CNPJ válido.
5. Agência e subconta exportam o livro para o contador.

## Fora desta entrega

Cobrança Graao → agência, carteira automática, taxa de adesão, anual, créditos, troca de plano, cancelamento no fim do ciclo,
revenda, multa, lembretes, pagamento parcial, cartão salvo, emissão de NFS-e, devolução iniciada pelo Graao.

## O que seria fracasso

- Cobrar alguém duas vezes, ou suspender quem pagou.
- Suspender subcontas já existentes sem a agência ter ligado a opção.
- Somar no livro do Graao vendas de agências ou subcontas.
- Perder um aviso de pagamento por conflito de gravação.

## Caminhos considerados

**Renovação dos planos** (escolhido pelo usuário: 1)
1. AbacatePay renova: teste, tentativas e renovação prontos; menos risco de cobrança dupla; cartão cadastrado duas vezes.
2. Motor próprio: um cartão só e proporcional exato; sem proteção documentada contra cobrança repetida.
3. Stripe: igual ao GHL; refaria cobranças e contas conectadas.

**Onde guardar o livro** (minha escolha: B)
- A. Dentro do JSON de cada subconta: sem migração, mas cresce sem limite e pode ser reescrito.
- B. Tabela própria, só de inclusão: auditável e consultável; precisa de uma migração no Supabase.
- C. Serviço externo: mais um contrato e mais um ponto de falha.

## Desenho

### 1. Livro

Tabela `go_billing_ledger`, nos dois armazenamentos (SQLite e Supabase):

| Campo | Conteúdo |
| --- | --- |
| `key` | Chave única do fato, por entidade do gateway e não por evento (o reenvio manual troca o id do evento) |
| `layer` | `platform` (Graao vende), `agency` (agência vende) ou `account` (subconta vende) |
| `agency_id`, `workspace_id` | De quem é; `workspace_id` vazio quando não se aplica |
| `kind` | `sale`, `manual_sale`, `refund`, `dispute_opened`, `dispute_won`, `dispute_lost`, `adjustment`, `plan_payment`, `wallet_topup`, `wallet_credit`, `wallet_debit`, `wallet_usage` |
| `amount_cents`, `fee_cents` | Centavos inteiros, com sinal do ponto de vista do vendedor; taxa vazia quando desconhecida |
| `usage_micros` | Valor exato do consumo (6 casas), só em `wallet_usage` |
| `method`, `provider`, `provider_ref` | Pix, cartão, boleto ou manual; gateway; id da cobrança |
| `source` | Tipo e id da fatura, plano ou carteira |
| `seller`, `payer` | Retrato do nome e CPF/CNPJ, preenchido no primeiro envio ao livro |
| `detail` | Observação, autor e marca de importação |
| `occurred_at`, `recorded_at` | Quando aconteceu e quando entrou |

- Alteração e exclusão são bloqueadas por gatilho no banco. Correção é um novo lançamento contrário.
- Supabase: RLS com a mesma chave de servidor de `go_workspaces`, só leitura e inclusão.
- `fee_cents` vem de `platformFee`. Líquido = pago − taxa; a documentação não garante a fórmula, então a tela diz "líquido estimado".
- `dispute_opened` tem valor zero. `dispute_lost` lança o negativo. `dispute_won` é zero. Recusas e novas tentativas não entram: não são dinheiro.
- Pagamento em modo de teste do gateway (`devMode`) não entra no livro.
- A camada `platform` fica pronta na tabela, sem uso nesta entrega.
- Contestação perdida que também chega como reembolso usa a mesma chave de devolução, para lançar o negativo uma vez só.
- A carteira separa receita e saldo: `wallet_topup` é dinheiro recebido; crédito, débito e consumo são movimento de saldo e saem em coluna própria do CSV.
- O consumo é lançado uma vez por dia e produto, após fechar o dia (fuso da subconta), antes de o extrato poder ser cortado.

**Caixa de saída.** O fato entra em `ledgerOutbox` na mesma gravação que muda a subconta ou a agência. Depois é enviado à tabela e só
então sai da caixa, conferindo pela `key`. Repetir não duplica. A caixa nunca é cortada, não vai ao navegador, a snapshots, a exportações
nem à duplicação de subcontas.

- Camada da subconta: o fato nasce quando uma `transaction` é criada ou muda para reembolsada. Há três lugares que criam transações
  (`crm-model.mjs`, `store-model.mjs`, `document-model.mjs`) e o lançamento manual; todos passam a usar uma função só.
- Transação editada gera `adjustment` com a diferença. Excluída, ou mudada de concluída para falha, gera `adjustment` negativo. O lançamento original fica.
- Transação importada por CSV não entra no livro: é histórico de outro sistema.
- Mensalidade de contrato passa a guardar o id do pagamento; hoje um reenvio cria a mensalidade duas vezes.
- Recarga da carteira e consumo nascem na subconta, mas são da camada `agency`; vendedor é a agência e comprador, a subconta.
- Envio: logo após a gravação e no relógio de cada minuto, para as subcontas. Na agência, dentro do webhook ou da ação, e de novo ao abrir o painel.

**Importação do passado.** Um script lança o que ainda existe (transações, pagamentos de plano, carteira), marcado como importado e com
chave fixa, para poder repetir. O que já foi cortado do extrato não volta; a tela diz desde quando o livro é completo.

### 2. Avisos do AbacatePay

- Passam a ser pedidos também: `subscription.payment_failed`, `subscription.plan_changed`, `checkout.disputed`, `checkout.lost`,
  `transparent.disputed` e `transparent.lost`.
- A documentação se contradiz: os dois primeiros aparecem nos eventos, mas não na lista aceita ao criar. Se a criação recusar, tenta sem eles e
  a tela mostra quais faltam. A suspensão não depende deles.
- `checkout.lost` não tem exemplo documentado: tratado como contestação perdida; se faltar o id da cobrança, só registra no log.
- `plan_changed` nesta entrega só é registrado no histórico da assinatura.
- Um webhook não pode ser editado. Contas já conectadas ganham "Atualizar avisos", que cria o novo com o mesmo segredo e depois apaga o antigo.
- Conflito de gravação (409) vira 503: o AbacatePay não repete 4xx, e hoje o aviso se perderia.
- Assinatura e segredo continuam verificados como hoje. A repetição passa a ser evitada pela entidade (cobrança, pagamento), além da lista `seen`.

### 3. Baixa, reembolso e contestação

| Situação | Efeito |
| --- | --- |
| Pago ≥ valor da fatura | Baixa normal |
| Pago < valor da fatura | Fatura continua aberta, marcada "Pagamento divergente"; o livro registra o valor real; a equipe pode dar baixa manual: a transação usa o valor recebido e o livro não lança de novo |
| Aviso sem valor | Consulta `GET /checkouts/get`; se ainda faltar, trata como divergente |
| Reembolsado | Fatura e transação mostram "Reembolsada"; não aceita nova cobrança; comissão de afiliado segue a regra atual |
| Contestação aberta | "Em contestação"; ganha volta a paga; perdida vira reembolsada |

- O estado da fatura continua `Paid` por dentro, com `payment.status` distinguindo, para não mudar regras que dependem de "paga". Uma função
  única calcula o rótulo exibido. Transações ganham o estado `Disputed`.
- A fatura é achada pelo `checkoutId`; o `metadata` só vale se `metadata.workspace` for a própria subconta.
- Reembolso não retira curso, comunidade ou ingresso automaticamente.
- Na conta da agência, hoje reembolso e contestação são ignorados. Passam a valer para plano e recarga. Recarga devolvida ou perdida em
  contestação debita a carteira uma vez, mesmo que o saldo fique negativo. Devolução de plano só suspende se vier o cancelamento por contestação.

### 4. Plano em atraso e suspensão

- Configuração da agência em SaaS: **Suspender quando a assinatura falhar**, tentativas (1 a 10, padrão 3) e intervalo em dias (1 a 30, padrão 1).
  Vale para assinaturas novas. Ligado em agência nova, **desligado nas existentes**.
- `payment_failed`: o plano fica "Em atraso"; a subconta e a agência veem o aviso; e-mail aos administradores da agência, um por tentativa.
  Uma renovação paga limpa o atraso. Plano em atraso também impede gerar outra assinatura, como o ativo.
- Suspende em `subscription.cancelled` por `max_payment_retries_exceeded`, `dispute_opened` ou `pix_automatic_authorization_refused`.
  Cancelamento feito pela agência ou pelo cliente no portal não suspende nesta entrega.
- A suspensão usa o estado `Paused` já existente, com motivo e `suspendedBy: billing`. Conta `Closed` nunca muda.
- A tela de subconta pausada mostra **Pagar e reativar** ao administrador da subconta, só se a pausa for por cobrança. Gera nova assinatura do
  mesmo plano, sem novo teste. O pagamento reativa. Se já houver uma pendente, reaproveita o link.
  Sem gateway da agência ou sem plano atribuído, mostra "Fale com a sua agência".
- Pausa manual da agência nunca é desfeita por pagamento. Reativação manual limpa a marca.
- Avisos de uma assinatura antiga não afetam a nova: o vínculo é pelo id da cobrança e da assinatura atuais.

### 5. Cadastro fiscal

- Validação de CPF e de CNPJ, inclusive o CNPJ alfanumérico, com dígito verificador. Guardado sem máscara.
- Agência e subconta: pessoa física ou jurídica, nome ou razão social, CPF/CNPJ, inscrição municipal opcional, regime
  (Simples, MEI, presumido, real), endereço com CEP, município e código IBGE, e-mail fiscal.
- Contato: CPF/CNPJ opcional, também na importação e na API.
- Exigido para conectar um gateway novo. Contas já conectadas continuam cobrando e veem um aviso para completar.
- Fatura, página de pagamento e recibo mostram "Vendido por" com nome e CPF/CNPJ da subconta, nunca o Graao. Sem cadastro, mostram o nome da subconta.
- CPF aparece mascarado em listas, e inteiro só na ficha e no CSV. Páginas públicas mostram o documento do vendedor, nunca o do comprador.

### 6. Telas e exportação

- Agência → Cobrança → **Livro**: período, tipo, subconta, totais e CSV. Mostra só a camada `agency`.
- Subconta → Pagamentos → **Livro**: só a camada `account` dela. Recarga e consumo da carteira pertencem à agência.
- Acesso: agência com permissão de configurações; subconta com o módulo de pagamentos. O servidor fixa agência, subconta e camada; nada vem do navegador.
- CSV em UTF-8 com separador `;`, até 366 dias por arquivo, protegido contra fórmulas em células.
- Textos em português e espanhol, sem popups nativos.

## Limites e regras

- Centavos inteiros e fuso da conta nas exibições; UTC no banco.
- Guarda mínima de 5 anos; o livro não é apagado ao excluir contato ou subconta (obrigação legal, a confirmar com o contador).
- Front-end só em `ui/`; `public/` é gerado.
- A migração no Supabase e a importação do passado só rodam em produção com autorização do usuário. O código aceita a tabela ainda
  inexistente: acumula na caixa de saída e tenta de novo, sem derrubar pagamentos.
- Cada item vira um PR, sem mesclar sem pedido.

## Testes que provam a entrega

1. O mesmo pagamento em três formatos (repetido, reenviado com outro id, `checkout` e `subscription`) gera um lançamento.
2. Queda entre gravar a subconta e o livro: a próxima passada completa, sem duplicar.
3. Atualizar ou apagar linha do livro falha nos dois bancos.
4. Pagamento menor não baixa; baixa manual depois não lança o valor de novo.
5. Contestação perdida seguida de reembolso lança um negativo só.
6. Três recusas suspendem com a opção ligada e não suspendem com ela desligada; pagar reativa; pausa manual permanece.
7. Aviso atrasado da assinatura antiga não suspende a nova.
8. Agência A não lê nem exporta livro da agência B; a subconta não vê a camada da agência.
9. Conflito de gravação no webhook responde 503 e a repetição conclui.
10. CNPJ numérico e alfanumérico válidos passam; dígito errado é recusado.
11. A caixa de saída não aparece em snapshot, exportação, duplicação nem na resposta ao navegador.
12. Recarga reembolsada debita a carteira uma vez; mensalidade de contrato reenviada não duplica.
13. Pagamento de teste não entra no livro; editar transação lança só a diferença.
14. A suíte existente continua passando, com os avisos simulados atualizados para trazer o valor pago.

## Escolhas minhas, para você conferir

1. Reembolso não corta o acesso do cliente automaticamente.
2. Suspensão desligada nas agências existentes; 3 tentativas, uma por dia.
3. Suspende quando o AbacatePay esgota as tentativas, não na primeira recusa. A ajuda do GHL não informa o momento exato.
4. Cadastro fiscal obrigatório só para conectar gateway novo.
5. Conta já conectada precisa de um clique em "Atualizar avisos".
6. Transações importadas por CSV e pagamentos de teste ficam fora do livro.
7. Recarga devolvida pode deixar a carteira negativa.

## Para quem constrói decidir

Nomes de arquivos e funções, divisão em PRs, índices, desenho exato das telas dentro do padrão atual, textos de e-mail.
