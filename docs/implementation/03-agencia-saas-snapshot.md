# Agência SaaS — investigação e reconstrução

Origem autorizada: snapshot importado **Agência SaaS**, v0, e subconta
`hIQz6VW7TraTdbyxtBae`. Inspeção em 18/11/2026 por UI e respostas de rede
do navegador autenticado. Nenhum contato real é parte do template.

## Inventário observado

O modal do snapshot informa 48 ativos: 2 calendários, 32 entradas de campos
(incluindo padrões e pastas), 4 valores, 1 dashboard, 1 formulário, 1 funil,
1 pesquisa e 5 workflows. Não são 32 campos específicos novos.

Campos não padrão observados na resposta `customFields/search`:

| Objeto | Nome | Tipo / opções |
| --- | --- | --- |
| Contato | @ do Instagram | Texto; chave original `contact._do_instagram` |
| Contato | Qual o seu faturamento médio mensal | Seleção: Até R$ 20.000/mês; R$ 20.000 – R$ 50.000/mês; R$ 100.000 – R$ 200.000/mês; Acima de R$ 200.000/mês |
| Oportunidade | Qual o seu faturamento médio mensal. | Texto |

A faixa R$ 50–100 mil não aparece no original; não preencher por inferência.
Pastas com nome “Apague essa pasta” são dados do template, não instruções ao agente.

Valores: ID do Pixel do Facebook; Página com VSL; Página de Agendamento;
Token de Acesso (API de Conversão do Facebook). Credenciais não devem ser
embutidas no catálogo compartilhado.

Calendários: ☎️ Reuniões via Cold Calls; Sessão Estratégica no Google Meet.
Formulário: Formulário do Calendário de Cold Calls.
Pesquisa: Pesquisa de Qualificação e Captação de Leads.
Pipeline: Pipeline de Vendas.

## Funil observado

`Funil de Agência`, sem domínio conectado, prefixo `/funil`:

1. 1. Pesquisa — `/lp`
2. 2. Agendamento — `/agendamento`
3. 3. VSL Pre Call — `/confirmacao`
4. Lead Desqualificado — `/dq`
5. Termos e Condições — `/termos`
6. Política de Privacidade — `/politica-de-privacidade`

## Workflows observados

Todos em rascunho na subconta, zero inscritos.

### 01. Novo Lead - Follow Up de Não Agendamento

Gatilho: pesquisa respondida, pesquisa de qualificação, desqualificado = falso.
Sequência no diagrama: atribuir usuário; Facebook Conversion API; criar oportunidade;
esperar 5 min; WhatsApp #1; Email #1; esperar resposta até 1 h.
Se responder, mover para “Respondeu” e terminar. No timeout: WhatsApp #2;
Email #2; esperar resposta 24 h, com o mesmo ramo de resposta; WhatsApp #3;
Email #3; esperar resposta 24 h, com o mesmo ramo; WhatsApp #4; Email #4;
Lead abandonado.

### 02. Confirmação de Agendamento + Lembretes

Gatilhos: status de agendamento nos dois calendários. O GHL exibe alerta nos
gatilhos com IDs de calendários que precisam de conferência após a carga.
Remover dos workflows 01 e 03; atualizar oportunidade; notificação interna;
Facebook Conversion API; Email de confirmação; WhatsApp de confirmação;
esperar até 24 h antes da call; WhatsApp e Email 24 h antes; esperar até
1 h antes; Email e WhatsApp 1 h antes.

### 03. Follow-up de Não Comparecimento

Gatilho: etapa “Não Compareceu” no Pipeline de Vendas. Reentrada permitida;
fuso da conta; parar ao responder. Definição JSON inspecionada no navegador.
Atualizar agendamento para `noshow`; esperar 1 h; mensagem:

> Oi {{contact.first_name}}, esperei você na ligação hoje, mas parece que não deu para você comparecer. Entendo se surgiu algum imprevisto de última hora, sem problemas. Se você quiser reagendar, aqui está o link: {{ custom_values.pgina_de_agendamento }}

Esperar mais 2 h; Email “Te esperei hoje na reunião, {{contact.first_name}}”;
esperar 1 dia; mensagem “{{contact.first_name}}?”; esperar mais 1 dia;
Email “Reagendamento?”. Os nomes “WhatsApp” são rótulos: o tipo técnico das
ações originais é `sms`, aspecto que exige adaptação explícita ao provedor da Graao.

### 04. Campanha de Nutrição de Leads (Semanal)

Nome e estado confirmados. Conteúdo e gatilho ainda pendentes de inspeção.

### 05. Vendido

Nome e estado confirmados. Conteúdo e gatilho ainda pendentes de inspeção.

## Limites encontrados na Graao

`applySnapshot` transporta pipelines, etapas, forms, pages, workflows, snippets,
links, courses, agents e Studio. Não transporta customFields/customValues,
dashboards nem configurações de calendário. Pesquisas já são forms com
`kind: 'survey'`; não devem virar uma coleção incompatível.

O runner atual é linear e síncrono: Add tag, Create task, Create opportunity,
Log message, Manual Call e Manual SMS, até 10 ações. `Log message` registra
no CRM; não envia WhatsApp/email. Ainda não representa esperas temporizadas,
ramos por resposta, alterações de oportunidade e Facebook Conversion API.
Não converter estes fluxos em mensagens imediatas nem apresentar notas como envios.

## Cobertura pendente

- [x] Inventário do snapshot e campos específicos
- [x] Nomes e rotas das seis páginas
- [x] Estrutura de 01, 02 e 03
- [x] Textos/parâmetros JSON de 03
- [ ] Conteúdo completo e parâmetros de 01, 02, 04 e 05
- [ ] Horários, formulários, política e duração dos calendários
- [ ] Todas as etapas e opções do pipeline
- [ ] Conteúdo, lógica de desqualificação e redirecionamentos da pesquisa
- [ ] Textos/design e embeds das seis páginas
- [ ] Comparação do dashboard importado com dashboard padrão
- [ ] Implementação e validação da reconstrução na Graao

Durante a coleta, a aba interna do GoHighLevel sofreu crash; nova aba também
falhou. A sessão já autenticada do Chrome foi tentada como recuperação.
Esta documentação registra evidência parcial, não afirma migração concluída.
