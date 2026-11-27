# Planejador de eventos: paridade com o Parceiras Conselho e envio pelo WhatsApp

Data: 2026-11-23 · Branch: `feat/planejador-eventos` (a partir de `origin/main` 000b4f8)

## Intenção

O Planejador de eventos (Marketing › Eventos) foi portado de forma parcial da ferramenta de eventos do projeto
`D:\meus documentos\Parceiras Conselho\mutirao-mentoria` (`events.js`, `event-copy-editor.js`, `timeline.js`).
O usuário apontou dois problemas:

1. a tela não segue o padrão visual do Graao (no tema escuro aparecem caixas brancas e títulos ilegíveis);
2. faltam muitas funcionalidades que a ferramenta original tem.

O objetivo é que o Graao tenha tudo o que o Parceiras tem para planejar um evento de lançamento e vá além, ligando o
planejamento ao que só o Graao oferece: tarefas, agenda, automações, Social, e-mail e, principalmente, **envio real das
mensagens de WhatsApp** (grupos e privado) pela conexão Evolution da subconta.

## Metas

- Visual idêntico ao resto do app: tokens `--g-*`, componentes já usados no Planejador social e em E-mails, tema
  escuro correto, responsivo até 360 px.
- Paridade funcional com o Parceiras (lista completa na seção “Paridade”).
- Mensagens de WhatsApp de grupo e privado **agendadas e enviadas** pelo Graao, com fila, ritmo, teto diário,
  personalização, reenvio em falha e status por destinatário.
- Linha do tempo (Gantt) das tarefas e mensagens, com arrastar para remarcar.
- Integração com automações por eventos personalizados, para que conectores (Slack, Google Sheets etc.) possam reagir.

## Não metas

- Envio de mensagem privada pelo Instagram (não há API para isso fora da janela de 24 h): fica assistido, com copy
  pronta para copiar.
- Anexar mídia às mensagens do evento (imagem, vídeo, áudio). Pode vir depois; a função `sendWorkspaceMedia` já existe.
- Criar ou administrar grupos de WhatsApp pelo Graao (convidar, remover participantes, mudar descrição).
- Trazer a “Máquina de Infoprodutos” do Parceiras para a timeline.
- Migrar dados do Supabase do Parceiras para o Graao.

## Anti-metas (seria falha mesmo funcionando)

- Disparar mensagens privadas em rajada e levar ao bloqueio do número da subconta.
- Enviar para contato marcado como “não perturbe” (`contact.dnd`).
- Enviar duas vezes a mesma mensagem para o mesmo destino (reprocessamento do cron, duplo clique, duas abas).
- Quebrar eventos que já existem: todo evento salvo hoje precisa abrir e funcionar depois da mudança.
- Cores fixas de tema claro na tela.

## Restrições

- `ui/` é a fonte do front-end; `public/` é cópia (regra do projeto). Toda mudança em `ui/*` vai também para `public/*`.
- O estado de cada subconta é um documento único (SQLite local / Supabase em produção) manipulado por comandos em
  `model.mjs` → `execute`. Coleções novas precisam entrar em `blank()` e na hidratação de estados antigos.
- Todo comando novo precisa estar em `authorization.mjs` (`commandModules` / `moduleOfRecord`), senão o servidor
  responde “Unknown operation.” (bug corrigido no PR #101). Testes devem passar pela autorização.
- WhatsApp: Evolution API v2.3.7. `sendWorkspaceText` hoje reduz o destino a dígitos de telefone (10–15) e limita o
  texto a 4.000 caracteres, então **não envia para grupo**. O envio para grupo precisa de um caminho novo.
- O cron roda a cada minuto (`runAllSocial`), com orçamento de 45 s por rodada e concorrência 4 entre subcontas.
  No servidor local ele é um `setInterval`; na Vercel (`socialScheduler = !process.env.VERCEL`) a rodada é disparada por
  outro caminho. Quem construir deve confirmar qual e ligar o envio do evento nele, como fazem as campanhas de e-mail.
- Fuso: datas e horários do evento são da subconta (`profile.timezone`, padrão `America/Sao_Paulo`); já existe
  `zonedInstant(day, time, tz)` usado pelo orquestrador.

## Abordagens consideradas

1. **Plano em bloco + fila de envios separada** (escolhida pelo usuário). O evento continua guardando `plan` (brief +
   itens) num único registro, como hoje. Os envios de WhatsApp ganham a coleção `eventSends`, uma linha por destino.
   Mantém duplicação, modelo e orquestrador simples; não exige migração; segue o padrão das campanhas de e-mail
   (`email-tick` / `email-take` / `email-result`). Limite: ~500 KB e 300 itens por evento.
2. **Itens normalizados em coleção própria.** Facilita cruzar itens entre eventos, mas exige migrar dados e reescrever
   duplicação, modelo e orquestrador, com mais risco de inconsistência. Descartada.
3. **Copiar o código do Parceiras quase como está.** Rápido, mas traz o visual próprio que é justamente o problema.
   Descartada.

## Decisões do usuário

- O WhatsApp é **enviado pelo Graao**, não só planejado.
- Mensagens no **privado** são enviadas **automaticamente com ritmo**: intervalo aleatório entre envios, teto diário
  configurável e exclusão de quem pediu para não receber.
- Mensagem que não sai no horário (teto diário, desconexão, fila longa) é **enviada atrasada**, não descartada.
- Arquitetura: abordagem 1.

## Decisões minhas (o usuário pode corrigir)

- Referência visual: abas Planejador social e E-mails. Some o cabeçalho com gradiente azul (`.ep-hero`).
- Edição de itens em diálogo (padrão `dialog()` de `ui/app.js`); na timeline, clicar num item abre o mesmo diálogo.
- O texto das mensagens é guardado **já no formato do WhatsApp** (`*negrito*`, `_itálico_`, `~tachado~`, listas com
  `- ` e `1. `). O editor mostra botões para essas marcações e uma prévia renderizada. Assim o que se vê é o que sai, sem
  conversão de HTML no envio. Mensagens antigas (texto puro) continuam válidas.
- Variáveis de personalização seguem a sintaxe do Graao: `{{contact.first_name}}`, `{{contact.name}}`. No modelo,
  `[nome]` do Parceiras vira `{{contact.first_name}}`. Em mensagens de grupo, variáveis de contato são proibidas
  (validação).
- Ordem de entrega em três PRs (cada um mesclável sozinho): **Fase 1** visual + paridade; **Fase 2** envio pelo
  WhatsApp; **Fase 3** timeline.

## Paridade com o Parceiras (Fase 1)

| No Parceiras | No Graao hoje | O que fazer |
| --- | --- | --- |
| Galeria de eventos com progresso, renomear, duplicar, apagar | Galeria sem renomear; apagar só dentro do evento | Ações nos cartões; filtro por status |
| Novo evento: “Começar com” modelo ou em branco; data obrigatória para o modelo | Checkbox; data opcional | Seleção explícita; exigir data quando for o modelo |
| Estratégia em 3 blocos (Objetivo e público; Mensagem e oferta; Operação e pós-evento), editáveis por bloco, “A definir” quando vazio | 7 campos num formulário só | Blocos com edição separada |
| Modelo: 12 tarefas, ~27 mensagens de grupo + 7 privadas com códigos (`GRUPO-01`, `PRIVADO-01`) e horários, 7 blocos de roteiro, 13 links, brief preenchido com marcadores | 11 tarefas, 8 mensagens, poucos links | Portar a estrutura completa; trocar trechos específicos de social media por marcadores genéricos (`[mudança do mercado]`, `[resultado]`) |
| Editor de copy com formatação, desfazer/refazer e “Aplicar estrutura do modelo” | Textarea | Editor no formato WhatsApp + prévia + aplicar modelo pelo código |
| Responsável escolhido entre membros | Texto livre | Seleção entre `c.agency.users` com acesso à subconta; manter rótulo de quem saiu (“Usuário removido”) |
| Filtros por fase, status e **canal** | Fase e status | Acrescentar canal na Comunicação |
| Código da mensagem visível e editável | Não tem | Campo `code` (até 40) |
| Regras: link “Validado” exige URL; mensagem “Agendada” exige data e hora | Parcial | Validar no modelo (`event-planner-model.mjs`) |
| Controle de revisão: salvar sobre versão antiga é recusado | Não tem | `revision` no evento; comando de salvar envia a revisão lida; divergiu → erro “O evento foi atualizado em outra sessão…” |
| Métricas: tarefas concluídas, mensagens enviadas, duração do roteiro, links validados | Tem (no cabeçalho azul) | Linha de métricas no padrão `.metric` |

## Modelo de lançamento: atualização de 2026-11-24

O usuário enviou a planilha de planejamento que deu origem ao modelo e escolheu usá-la no modelo padrão **adaptada**: códigos,
ordem, horários e estilo da planilha, com texto próprio e sem nomes, preços, links ou trechos da campanha de origem
(o repositório é público e o modelo aparece para todos os clientes).

- Códigos: `MCWF001–010` (captação), `MDWF001–009` (aquecimento e evento), `MVWF001–008` (vendas), `MCWF1X1-001–003` e
  `MVWF1X1-001–004` (privado). Substituem `GRUPO-NN`/`PRIVADO-NN`.
- Mensagens de grupo ganham `audience`: `base` (grupos antigos e ativos) ou `evento` (grupo do evento). A Fase 2 usa esse campo
  para saber a quais grupos enviar.
- `MVWF008` (Últimas horas) fica um dia depois de `MVWF007` (Falta um dia): na planilha as duas tinham a mesma data e hora, o que
  contradiz o texto.
- As copies não citam dia da semana, porque as datas são relativas ao dia do evento.

## Envio pelo WhatsApp (Fase 2)

### Destinos por mensagem

- Canal `grupos`: `targets.groups = [{ jid, name }]` (um ou mais grupos). JID no formato `<id>@g.us`.
- Canal `privado`: `targets.audience = { tags: [...], excludeTags: [...] }`. Destinatários = contatos da subconta com
  telefone válido, que têm alguma das `tags`, não têm nenhuma das `excludeTags` e não estão com `dnd`. Duplicados pelo
  telefone normalizado são enviados uma vez. A lista é calculada **no momento de agendar** e congelada na fila; a
  interface mostra a contagem antes de confirmar.
- Formatos: `format: 'texto' | 'enquete'`. Enquete usa `pollOptions` (2–12) e só vale para grupos (o modelo
  “Enquete sobre matrícula” usa isso). Enviada pela função `interactive` (kind `poll`) que já existe.

### Escolher grupo

Endpoint novo `GET /api/whatsapp/workspace/groups` que chama a Evolution
`/group/fetchAllGroups/{instance}?getParticipants=false` com a instância da subconta e devolve `{ jid, name, size }`.
Exige os módulos `conversations` e `marketing`. Se a subconta não tiver WhatsApp conectado, a interface mostra o aviso
com link para Configurações › Telefone/WhatsApp.

### Fila (`eventSends`)

Uma linha por destino:
`{ id, eventId, itemId, target: 'group'|'contact', to, contactId, name, dueAt, status, attempts, error, sentAt, providerId, created }`
com `status ∈ queued | sending | sent | failed | canceled | skipped`.

- **Agendar** (`event-message-schedule`): valida data, hora, destino e texto; muda o item para `agendado`; cria as
  linhas `queued` com `dueAt = zonedInstant(date, time, tz)`. Idempotente: se já há linhas não canceladas para o item,
  recusa (é preciso cancelar antes).
- **Cancelar** (`event-message-cancel`): linhas `queued` viram `canceled`; o item volta para `pronto`.
- **Mudar data, hora ou texto** de um item agendado: data/hora → atualiza `dueAt` das linhas ainda `queued`; texto →
  o texto é lido do item no momento do envio, então a fila usa sempre a versão mais nova. Mudar destinos exige cancelar
  e agendar de novo.
- **Apagar** item ou evento com linhas `queued`: cancela essas linhas antes.
- **Envio** (cron, por subconta, uma execução por vez, como `emailRuns`):
  - `event-send-take` devolve as linhas vencidas respeitando o ritmo e marca como `sending` (para não enviar duas
    vezes se o cron sobrepuser); `event-send-result` grava `sent`/`failed`, `providerId`, erro.
  - Grupo: sem intervalo artificial além de 3 s entre grupos.
  - Privado: intervalo aleatório entre `minGapSeconds` e `maxGapSeconds` (padrão 20–60) entre envios da subconta,
    guardado como `nextPrivateAt`; teto `dailyCap` (padrão 150) contado por dia no fuso da subconta. Dentro de uma
    rodada o envio pode esperar o intervalo enquanto couber no orçamento de 45 s; o que não couber fica para o minuto
    seguinte. Teto atingido → as linhas continuam `queued` e saem no dia seguinte; a interface avisa.
  - Texto renderizado no envio: variáveis do contato, limite de 4.000 caracteres.
  - **Mensagens atrasadas são enviadas** (decisão do usuário): nada expira. O que passou do teto diário, ficou parado
    por desconexão ou demorou pelo ritmo sai assim que possível, na ordem de `dueAt`. A interface mostra, por item,
    quantos envios saíram com mais de 1 hora de atraso e avisa na Comunicação quando há fila acumulada
    (“40 mensagens aguardando · previsão de término 21:30”), para a equipe poder cancelar se perder o sentido.
  - WhatsApp desconectado (`not-connected`): as linhas continuam `queued` sem gastar tentativas; a Comunicação mostra o
    aviso com link para reconectar. Ao reconectar, a fila retoma.
  - Falha transitória (rede, 5xx): até 3 tentativas com espera crescente (1, 5, 15 min). Falha definitiva
    (número inexistente, 4xx): `failed` sem nova tentativa.
  - Quando todas as linhas de um item terminam, o item vira `enviado` (mesmo com falhas parciais; a contagem de falhas
    fica visível e pode ser reenviada com “Reenviar falhas”, que recoloca só as `failed` na fila).
- **Configurações** por subconta, em Comunicação › Configurações de envio: `minGapSeconds` (≥10), `maxGapSeconds`
  (≥ min, ≤ 300), `dailyCap` (1–1000). Guardadas em `eventSendSettings` (registro único no estado).
- Envio para grupo: nova função `sendWorkspaceGroupText(agencyId, workspaceId, jid, text, accountIsActive)` em
  `whatsapp.mjs`, igual a `sendWorkspaceText` mas validando `^[0-9-]+@g\.us$` em vez de dígitos. A enquete para grupo
  usa o mesmo princípio sobre `interactive`.

### Automação e conectores

Novos eventos personalizados (mesmo mecanismo de `event_plan_created`): `event_message_scheduled`,
`event_message_sent` (por item, quando conclui, com contagens), `event_message_failed` (por destino, após a última
tentativa), `event_item_status_changed` (tarefa, mensagem, bloco ou link mudou de status). Assim um fluxo pode, por
exemplo, avisar no Slack ou gravar no Google Sheets pelos conectores que já existem. A aba Integrações lista esses
eventos com link para criar a automação, como já faz com os atuais.

O orquestrador atual (tarefas, compromisso na agenda, rascunhos de Social e e-mail) continua; acrescenta o resumo do
WhatsApp (agendadas, enviadas, falhas).

### Permissões

Agendar, cancelar e reenviar exigem `marketing` + `conversations` (o envio usa o WhatsApp da subconta). Listar grupos
idem. Tudo registrado em `authorization.mjs` com teste.

## Linha do tempo (Fase 3)

- Dentro do evento: aba **Linha do tempo** com tarefas (barras de um dia) e mensagens (marcos), agrupadas por fase.
- Na galeria: visão **Linha do tempo** com todos os eventos não arquivados, um grupo por evento.
- Zoom (dia/semana), botão “Hoje”, rolagem horizontal sincronizada com a coluna de nomes.
- Arrastar uma barra muda a data do item (salva com controle de revisão). Mensagem agendada arrastada → atualiza `dueAt`
  da fila (regra acima). Clique abre o diálogo de edição.
- Teclado: setas movem o item selecionado um dia; Enter abre.

## Interface (todas as fases)

- Estrutura: `pageShell` com as abas de Marketing; dentro do evento, cabeçalho do padrão (voltar, título, status,
  data, ações), linha de métricas, abas internas no estilo das abas do Graao, conteúdo da seção.
- Seções do evento: Estratégia · Tarefas · Comunicação · Roteiro do dia · Links · Linha do tempo · Integrações.
- Comunicação: lista agrupada por dia; cada mensagem mostra canal, código, horário, destino (grupo ou público com
  contagem), status e, se agendada, o andamento (“32 de 40 enviadas · 2 falhas”). Ações: editar, copiar texto,
  agendar/cancelar, reenviar falhas.
- CSS: reescrever `ui/event-planner.css` só com tokens (`--g-ink`, `--g-dim`, `--g-line`, `--g-surface`,
  `--g-surface-2`, `--g-brand-*`), sem cor hexadecimal fixa; conferir nos dois temas.
- Textos em português; se as outras abas de Marketing já têm versão em espanhol (`ui/locales/es.js`), seguir o mesmo.

## Dados e compatibilidade

- `eventPlans`: novos campos `revision` (inteiro, começa em 0 para eventos antigos); itens de mensagem ganham `code`,
  `format`, `pollOptions`, `targets`; itens ganham `ownerId` (id do usuário) mantendo `owner` como rótulo.
- Coleções novas: `eventSends` (lista), `eventSendSettings` (registro único). Entram em `blank()` e na hidratação.
- Duplicar evento não copia a fila nem os destinos congelados; mantém `targets`.

## Testes

`node:test`, no padrão de `test/event-planner.test.mjs`: validação dos itens novos; modelo completo (contagens por
tipo, datas pelo dia do evento); revisão; agendar → linhas certas (dnd e sem telefone fora, duplicados unidos);
idempotência; cancelar; take respeitando intervalo e teto diário (relógio injetado); resultado e reenvio; item vira
`enviado`; eventos de automação emitidos; autorização dos comandos e do endpoint de grupos; `sendWorkspaceGroupText`
com Evolution simulada (como `test/evolution.test.mjs`). Verificação no navegador nos dois temas e em 375 px.

## Deixado para quem construir

- Nomes exatos de classes CSS e organização dos arquivos de UI (pode dividir `ui/event-planner.js` em módulos).
- Algoritmo de espera dentro da rodada do cron, desde que respeite intervalo, teto e orçamento.
- Texto final dos trechos neutralizados do modelo.
- Layout fino da timeline.
