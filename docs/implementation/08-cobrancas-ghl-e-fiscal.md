# 08 · Momentos de cobrança no GoHighLevel, situação da Graao e cuidados fiscais

Análise de 24/11/2026, base da decisão. Entrega 1 (fundação) construída: ver `docs/superpowers/plans/2026-11-24-cobranca-fundacao.md`. Resolvidas as falhas F1 a F5; F6 a F8 ficam para as próximas entregas.

> **Decisão do usuário (24/11/2026): sem porcentagem. A cobrança funciona exatamente como no GHL.**
> A Graao cobra a agência; a agência cobra a subconta no gateway dela; a subconta cobra o consumidor no gateway dela.
Não é parecer jurídico nem contábil. Os itens marcados **[contador]** precisam de confirmação profissional.

## 1. Como foi levantado

| Fonte | O que cobre | Limite |
| --- | --- | --- |
| REA, navegador sem login em `app.gohighlevel.com` (evidência `ev_7e558eaa…`) | Carregamento do app e manifesto | Não entra em conta autenticada |
| REA, pacote `revex/saas` (evidência `ev_b4da36ea…`) | Pacote com as regras de suspensão | Análise do app inteiro estourou o tempo; 1 de 32 arquivos passou pelo grafo do REA |
| Leitura de textos e rotas de 198 pacotes públicos de 7 micro-apps (`saas`, `platform-billing`, `location-billing`, `reselling`, `ghl-payments`, `domain-reselling`, `payment-links`) | Telas, opções e rotas de API | Estático: mostra que a opção existe, não o comportamento no servidor |
| Central de ajuda do GHL (Pricing Guide de 29/10/2026 e outras 5 páginas) | Preços, carteira, inadimplência da agência | Artigos de teste grátis, taxa de adesão e inadimplência da subconta não abriram |
| Catálogo próprio (`04c`) | Rotas vistas com login em coletas anteriores | — |

## 2. Quem cobra quem no GHL

```
Camada 1  HighLevel ──cobra──► Agência         plano + carteira + adicionais   (cartão da agência)
Camada 2  Agência   ──cobra──► Subconta        plano SaaS + créditos + revenda (Stripe da agência)
Camada 3  Subconta  ──cobra──► Consumidor      fatura, loja, curso, evento…    (gateway da subconta)
Camada 4  Comissões: afiliado recebe, não paga
```

**Achado central:** não há taxa do HighLevel sobre as vendas da camada 3. Nenhum dos pacotes tem `application_fee`
ou `platformFee`, e nenhuma página oficial lida menciona percentual. O GHL ganha com assinatura e consumo.
É o modelo adotado: a Graao também não toca no dinheiro das camadas 2 e 3.

## 3. Momentos de cobrança

Situação na Graao: ✅ existe · 🟡 parcial · ❌ não existe.

### Camada 1 · Plataforma → agência

| # | Momento | Como o GHL configura | Graao hoje |
| --- | --- | --- | --- |
| 1.1 | Entrada com teste grátis | Cartão salvo; aviso de dias restantes; "pular teste e pagar"; extensão de 14 dias | ❌ |
| 1.2 | Fim do teste | Cobrança automática na data | ❌ |
| 1.3 | Renovação mensal ou anual | Plano pré-pago de US$ 97, 297 ou 497 | ❌ o plano é um rótulo: `billing-plan` só grava o nome |
| 1.4 | Upgrade | Imediato, com crédito proporcional | ❌ |
| 1.5 | Downgrade | Com data de efeito; não cancela adicionais | ❌ |
| 1.6 | Falha no pagamento | 21 dias de acesso, depois bloqueio; tentativas por até 30 dias; botão de repetir | ❌ |
| 1.7 | Pausa e cancelamento | Plano de pausa de US$ 27; oferta de retenção; dados apagados após 90 dias | ❌ |
| 1.8 | Adicionais mensais | Suporte, app próprio, HIPAA, IP dedicado | ❌ |
| 1.9 | Carteira: carga inicial | Na ativação do primeiro serviço medido | ❌ lançamento manual |
| 1.10 | Carteira: recarga automática | Valor e limite; não pode ser desligada; tenta os outros cartões | 🟡 só alerta, sem cobrança |
| 1.11 | Ajuste inteligente | Mais de 3 recargas em 7 dias sobe o valor | ❌ |
| 1.12 | Saldo zerado | Serviços medidos param | ❌ |
| 1.13 | Dados fiscais | Exige Tax ID ou declaração de que não tem | ❌ sem CPF/CNPJ nos modelos de cobrança |

### Camada 2 · Agência → subconta

| # | Momento | Como o GHL configura | Graao hoje |
| --- | --- | --- | --- |
| 2.1 | Contratação do plano | Link de venda direta; até 20 planos; categorias por moeda; mensal e anual; cupom | 🟡 só mensal |
| 2.2 | Taxa de adesão | Única, junto do plano | ❌ |
| 2.3 | Teste grátis | Dias por plano | ✅ 1 a 90 dias |
| 2.4 | Créditos de cortesia | Por plano, com opção de acumular para o mês seguinte | ❌ |
| 2.5 | Renovação | Automática | ✅ `subscription.renewed` |
| 2.6 | Falha no pagamento | `autoSuspendEnabled`: suspender a subconta quando a assinatura falha; tela de suspensas e reativação | ❌ ver falha F1 |
| 2.7 | Troca de plano | Dentro da categoria; downgrade no próximo ciclo | ❌ |
| 2.8 | Cancelamento | Pergunta o motivo, oferece desconto, vale no fim do ciclo | 🟡 imediato |
| 2.9 | Carteira da subconta | Cartão obrigatório; recarga automática; sem cartão fica "em espera" | 🟡 Pix ou cartão manual, sem recarga automática |
| 2.10 | Consumo com margem | Telefone, SMS, e-mail, validação, IA, WhatsApp, automação premium, domínios | 🟡 IA, e-mail, WhatsApp e ligação; `rebillProducts` mostra 8 |
| 2.11 | Revenda mensal | WhatsApp US$ 10, prospecção US$ 29, SEO US$ 79, WordPress, portal US$ 49 etc., por subconta | ❌ |
| 2.12 | Domínio | Carteira da agência se a subconta não tiver cartão; renovação | ❌ |

### Camada 3 · Subconta → consumidor

| # | Momento | Como o GHL configura | Graao hoje |
| --- | --- | --- | --- |
| 3.1 | Fatura avulsa | Envio, link de pagamento | ✅ |
| 3.2 | Lembretes de fatura | Até 5, antes e depois do vencimento | ❌ |
| 3.3 | Multa por atraso | Fixa ou por intervalo, com carência | ❌ |
| 3.4 | Pagamento parcial | Percentual mínimo por pagamento | ❌ (há parcelas em contratos) |
| 3.5 | Gorjeta | 3 opções | ❌ (baixa prioridade no Brasil) |
| 3.6 | Cartão salvo e débito automático | Avisos de falha, de valor alterado e de pulado | ❌ |
| 3.7 | Fatura recorrente | Agenda | ✅ emite; não debita sozinha |
| 3.8 | Orçamento e contrato | Viram fatura ou assinatura | ✅ |
| 3.9 | Pedido (1 ou 2 etapas), loja | Checkout, recuperação | ✅ loja e ofertas |
| 3.10 | Curso, comunidade, evento | Oferta paga | ✅ |
| 3.11 | Agendamento pago | Conhecido no GHL, não confirmado nesta coleta | ❌ preço é só informativo |
| 3.12 | Assinatura do consumidor | Teste, pausar, retomar, cancelar | 🟡 só por contrato, mensal |
| 3.13 | Reembolso total e parcial | Na transação | 🟡 recebe o aviso; não inicia |
| 3.14 | Contestação (chargeback) | Não apareceu nos pacotes lidos | ❌ evento não assinado |

## 4. Falhas encontradas na Graao (corrigir antes ou junto)

| ID | Problema | Onde |
| --- | --- | --- |
| F1 | Assinatura cancelada ou não paga não suspende a subconta: o gancho `onSubscription` existe e ninguém o passa | `abacatepay.mjs:332`, `server.mjs` (rota do webhook) |
| F2 | Webhook não assina `subscription.payment_failed`, `subscription.plan_changed`, `*.disputed` nem `*.lost`, que a API já oferece | `abacatepay.mjs:11` |
| F3 | Fatura é baixada sem conferir o valor pago | `abacatepay.mjs:216` |
| F4 | Reembolso muda a transação, mas a fatura continua "Paga"; não há tratamento de reembolso parcial | `abacatepay.mjs:231` |
| F5 | Não há livro contábil: extrato guarda 500 linhas, pagamentos 24 e eventos vistos 300; o resto some | `wallet-model.mjs:12`, `abacatepay.mjs:301` e `:358` |
| F6 | Plano da agência não cobra nem limita | `agency-model.mjs:655` |
| F7 | Serviços pagos pela Graao (Resend, Twilio, Evolution, Google Places) não são cobrados da agência: o crédito da subconta vai para a agência | `server.mjs` (rota `/api/wallet/topup`) |
| F8 | Custo padrão do WhatsApp é R$ 0, então a revenda cobra zero mesmo com margem | `ui/agency-data.js:237` |

## 5. Regras do GHL que completam as tabelas

| Tema | Regra lida na central de ajuda |
| --- | --- |
| Recarga da subconta que falha | Até 7 tentativas, uma por dia; avisa administradores da agência e da subconta |
| Recarga da agência que falha | Até 12 tentativas (3 dias, 4 por dia); avisa administradores da agência |
| Retomada | Uma recarga manual zera o contador |
| Créditos de cortesia | Mensais, por plano; opção de só começar após o teste; crédito avulso pelo agente |
| Upgrade da agência | Imediato, com crédito proporcional |
| Downgrade da subconta | No próximo ciclo, sem proporcional e sem reembolso; pode ser desfeito |
| Cancelamento pela subconta | Desligado por padrão; a conta fica bloqueada até reativar |
| Saldo ao cancelar | Fontes se contradizem (perdido × agência reembolsa). No Brasil: devolver o crédito pago **[contador]** |
| Margem sobre consumo | Só no plano mais alto; o intermediário repassa com 1,05 |
| Não encontrado | Duração do teste, taxa de adesão, tentativas da assinatura da subconta, valores da recarga |

## 6. Cuidados fiscais brasileiros no modelo do GHL

1. **A Graao emite NFS-e só do que ela cobra da agência:** plano, consumo e adicionais. Vendas das camadas 2 e 3 não são receita dela,
   porque são cobradas em outra conta, com outro vendedor e outra nota.
2. **Do que ela cobra, a receita é o valor cheio.** No consumo (WhatsApp, ligação, IA), o faturamento é o preço cobrado da agência,
   e não só a margem. O custo do fornecedor é despesa. **[contador]**
3. **O mesmo vale para a agência:** plano e créditos vendidos à subconta são receita cheia dela, com nota dela.
4. **Contas separadas de verdade.** A chave do gateway da Graao nunca pode cobrar por uma agência nem o contrário.
   Hoje a agência-raiz e a plataforma dividem a mesma identidade (`AGENCY_ID`) e precisam ser separadas.
5. **LC 214/2025, art. 22 (plataforma digital).** Sem percentual e com o gateway do próprio vendedor, a Graao fornece software, o que
   afasta bastante a figura do intermediário. O §1º fala em controlar cobrança **ou** pagamento, então convém confirmar. **[contador]**
6. **Recarga de carteira.** Definir se a nota sai na recarga ou no consumo e o que acontece com saldo não usado. **[contador]**
7. **Cadastro fiscal do tomador.** CPF/CNPJ, razão social, endereço e município antes da primeira cobrança (o GHL faz isso com o Tax ID).
8. **NFS-e nacional.** Obrigatória para ME e EPP do Simples desde 01/11/2026 (Resolução CGSN 191/2026, via Fenacon); IBS/CBS do Simples em 2027.
   Fontes divergem sobre outubro ou dezembro para os demais. **[contador]**
9. **Livro imutável.** Cada lançamento guardado por pelo menos 5 anos, sem corte, com vínculo a pagamento e nota.
10. **Recibo do consumidor.** Mostrar sempre o vendedor (subconta), com CPF/CNPJ, e nunca a Graao como recebedora.

## 6b. O que o AbacatePay permite (gateway atual)

| Necessidade do GHL | AbacatePay v2 | Observação |
| --- | --- | --- |
| Plano recorrente | Sim: semanal, mensal, trimestral, semestral, anual | Hoje só usamos mensal |
| Teste grátis com cartão | Sim, 1 a 90 dias, R$ 0,00 | Sem cupom junto |
| Tentativas | `retryPolicy`: até 10, a cada 1 a 30 dias | 10 × 3 dias = os 30 dias do GHL |
| Aviso de falha | `subscription.payment_failed` | Hoje não assinado |
| Trocar plano | No próximo ciclo, sem proporcional, mesmo ciclo | Upgrade imediato precisa de cobrança à parte |
| Cancelar no fim do ciclo | Só pelo portal; a API cancela na hora | Agendar do nosso lado |
| Recarga automática | Sim: cartão salvo (`cardToken`), valor livre a partir de R$ 1,00, sem o cliente presente | Token só nasce no checkout transparente; exige liberação na conta |
| Pix Automático | Sim, valor fixo, sem teste | Exige liberação; não serve à carteira |
| Contestação | `checkout.disputed` e `transparent.disputed`; cancela a assinatura na hora | Hoje não assinado |
| Reembolso parcial | Não existe | — |
| Repetição segura | Sem chave de idempotência no cartão | Após tempo esgotado, consultar antes de repetir |
| NFS-e | Não documentado | Precisa de emissor à parte |

Não é preciso trocar de gateway para reproduzir o GHL. Split deixa de ser necessário.

## 7. Fontes

- [HighLevel Pricing Guide](https://help.gohighlevel.com/support/solutions/articles/155000001156-highlevel-pricing-guide)
- [Rebilling, reselling e carteiras](https://gohighlevelassist.freshdesk.com/support/solutions/articles/155000002095-rebilling-reselling-and-wallets-explained)
- [Recarga automática](https://help.gohighlevel.com/support/solutions/articles/155000005620-wallet-auto-recharge-and-smart-adjustment-settings)
- [Cobrança de agências](https://help.gohighlevel.com/support/solutions/articles/48001208376-billing-related-questions-for-agencies)
- [LC 214/2025, Planalto](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm)
- [Comentário à Cosit 170/2021](https://tributodevido.com.br/portal/composicao-da-receita-bruta-em-operacoes-de-marketplace/)
- [Cosit 94/2025](https://www.normaslegais.com.br/legislacao/solucao-de-consulta-cosit-94-2025.htm)
- [EY: plataformas digitais, IBS e CBS](https://www.ey.com/pt_br/insights/tax/ibs-e-cbs-responsabilidades-das-plataformas-digitais)
- [Fenacon: NFS-e nacional no Simples](https://fenacon.org.br/noticias/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026/)
- [DIMP, leiaute 10](https://portalspedbrasil.com.br/?p=20116)
- AbacatePay: [cartão salvo](https://docs.abacatepay.com/pages/pagamentos/one-click-buy) · [assinaturas](https://docs.abacatepay.com/pages/cobrar/assinaturas) · [webhooks](https://docs.abacatepay.com/pages/notificacoes/webhooks)
- GHL: [créditos da subconta](https://help.gohighlevel.com/support/solutions/articles/48001207115) · [downgrade](https://help.gohighlevel.com/support/solutions/articles/155000006450) · [cancelamento](https://help.gohighlevel.com/support/solutions/articles/48001216453) · [FAQ SaaS](https://help.gohighlevel.com/support/solutions/articles/155000002129)
