# Admin da plataforma: planos, limites e alertas

Data: 25/11/2026 · Status: rascunho para aprovação

## Por que

O graao.app roda em serviços externos com planos e cotas (Supabase no plano gratuito, Vercel, Cloudflare R2, VPS da Hostinger com a Evolution API, Twilio). Hoje ninguém olha esses limites até algo quebrar. Já aconteceu na Vercel: o limite de deploys deixou a main à frente da produção sem ninguém perceber.

O objetivo é **não estourar limites**: ser avisado **antes**, com tempo de agir (limpar dados, subir de plano, renovar a VPS).

## Para quem

Só para o dono da plataforma. No código, é a sessão cujo `session.id === GO_AGENCY_OWNER_ID` (a agência principal, `AGENCY_ID`, ver `server.mjs:647`). Nenhuma outra agência, usuário ou subconta vê a página, o menu ou os endpoints.

## Objetivos

1. Uma página **Plataforma** dentro da visão da agência (`#agency/plataforma`), visível só para o dono da plataforma.
2. Um cartão por serviço com: plano atual, cada métrica como "usado / limite" com porcentagem e cor (verde < 80%, amarelo ≥ 80%, vermelho ≥ 95%), horário da última coleta e um link para o painel do serviço.
3. **Previsão** para as métricas que zeram por ciclo (mensais ou diárias). O ritmo dos últimos 7 dias vira uma frase: "no ritmo atual, estoura em 18/12" ou "não estoura neste ciclo".
4. **Conferência automática de hora em hora**, mesmo com a página fechada.
5. **Alertas** por e-mail (Resend) e por notificação no navegador para o dono:
   - ao cruzar 80% (aviso) e 95% (urgente);
   - lembrete a cada 24 h enquanto estiver ≥ 95%;
   - quando a coleta de um serviço falha 3 vezes seguidas (token vencido ou serviço fora do ar);
   - quando a VPS da Hostinger vence em 15 dias e em 3 dias;
   - quando a Evolution API não responde em 2 conferências seguidas.
6. Uma faixa de aviso no topo do painel da agência (só para o dono) enquanto houver métrica ≥ 80%, com link para a página.

## Fora do escopo (v1)

- Custo em reais, faturas e cobrança.
- Mudar de plano ou mexer em configuração dos serviços pela página. Ela só lê.
- Alertas para as agências clientes sobre os limites delas.
- Monitoramento de uptime completo. Só a checagem simples da Evolution.
- OpenAI, Resend, Meta, AbacatePay e Google Places. Aparecem na página como "sem acompanhamento automático", com link para o painel de cada um.

## O que seria um fracasso

- Algum token de administração chegar ao navegador ou aparecer em log.
- Excesso de alertas: o mesmo aviso repetido a cada hora faz o dono parar de ler.
- A página ou o cron quebrar porque um serviço caiu. Cada serviço é independente: falha vira "sem dados" naquele cartão, e os outros seguem.
- A conferência atrasar publicações, automações e campanhas, que dividem o mesmo cron.
- Mostrar um número inventado. Se a API não dá o dado, a página diz "a API não informa", e não estima.

## Abordagens consideradas

| | Abordagem | Troca |
|---|---|---|
| **A (escolhida)** | Página + conferência de hora em hora + alertas + histórico | É a maior das três e precisa de tokens de administração. É a única que avisa antes sem depender de abrir a página. |
| B | Só a página, com cores na hora em que abre | É simples, mas não avisa nada se ninguém abrir. |
| C | Ativar os alertas nativos de cada serviço e a página só agrega | É pouco código, mas os planos gratuitos quase não têm alertas, e os avisos ficam espalhados. |

O dono escolheu a **A**.

## Serviços e métricas (v1)

Limites de cada plano numa tabela no código (`platform-limits.mjs`), por serviço e plano. Onde a API informa o plano, ele é detectado. Onde não informa, o dono escolhe o plano na página, e a escolha fica salva.

| Serviço | Métricas | Fonte | Ciclo |
|---|---|---|---|
| **Supabase** (projeto `zlkhoucdqfxgiorujifj`, org no plano **free**) | Tamanho do banco (500 MB); Storage (1 GB); usuários ativos no mês (50 mil); egress (5 GB): a API não informa | Função SQL nova `go_platform_usage()` (migration em `supabase/migrations/`), chamada por RPC com a conexão que já existe (chave de serviço). Ela devolve `pg_database_size`, a soma de `storage.objects` e a contagem de `auth.users` com login no mês. **Sem token novo.** Plano escolhido na página (padrão Free). Se a consulta não responder, o serviço conta como fora do ar | banco e storage: acumulado; MAU: mensal |
| **Vercel** (time `soci3`) | Deploys nas últimas 24 h (limite do plano: Hobby 100 por dia); uso de banda e de funções, se a API de uso responder | REST (`VERCEL_API_TOKEN`, `VERCEL_TEAM_ID`): `/v2/teams/{id}` para o plano; `/v6/deployments` para a contagem | deploys: janela móvel de 24 h; uso: mensal |
| **Cloudflare** | R2: armazenamento (10 GB grátis), operações classe A (1 mi por mês) e classe B (10 mi por mês); plano da zona `graao.com` | GraphQL Analytics + REST (`CLOUDFLARE_API_TOKEN` só leitura, `R2_ACCOUNT_ID` já existe) | armazenamento: acumulado; operações: mensal |
| **Hostinger** (VPS da Evolution) | Plano; disco, RAM e CPU (média das últimas horas); data de vencimento ou renovação | API Hostinger (`HOSTINGER_API_TOKEN`): máquinas virtuais, métricas e assinaturas | disco: acumulado; CPU e RAM: média recente; vencimento: data |
| **Evolution API** | Responde ou não; quantidade de instâncias | `EVOLUTION_BASE_URL` e `EVOLUTION_API_KEY` (já existem) | a cada conferência |
| **Twilio** | Saldo da conta (alerta abaixo de um valor mínimo; padrão US$ 10, editável na página) | `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN` (já existem): `Balance.json` | a cada conferência |

Um serviço sem token aparece como "não conectado", com o passo a passo para criar o token (link para a página de tokens do serviço e quais permissões marcar, sempre as mínimas e só de leitura).

## Como funciona

- **Coleta:** um coletor por serviço, cada um com uma função pura que recebe `fetch` injetado e devolve `{ plan, metrics: [{ key, label, used, limit, unit, cycle }], error? }`. Cada um tem tempo máximo de 8 s, e todos rodam em paralelo.
- **Quando roda:** junto do cron que já existe (`/api/social/cron`, chamado a cada minuto pelo Supabase), mas só se a última conferência tiver mais de 55 min. O cron já está agendado e protegido pelo `CRON_SECRET`, então pegar carona nele dispensa criar outro agendamento manual no Supabase. A conferência roda isolada em try/catch e não atrasa as publicações: dispara depois do `runAllSocial`, e seu tempo é limitado.
- **Botão "Conferir agora"** na página, para o dono (no máximo uma vez a cada 2 min).
- **Onde guarda:** uma linha própria no store (id `platform-usage`), no mesmo esquema das linhas `social-*` e `ads-*` (com `profile.name`, por causa da coluna gerada no Supabase). Guarda a última coleta de cada serviço, o histórico por métrica (pontos de hora em hora por 7 dias e o máximo diário por 90 dias), o estado dos alertas já enviados (para não repetir) e as escolhas do dono (plano manual, saldo mínimo do Twilio, e-mail de alerta). O histórico tem limite de tamanho para a linha não crescer sem parar.
- **Alertas:**
  - Antes de enviar, o alerta é gravado como "enviado". Se a gravação falhar, nada é enviado. Assim, um Supabase fora do ar ou só leitura não gera o mesmo e-mail toda hora.
  - O envio acontece na **mudança de nível** (ok → 80, 80 → 95, falha) e não a cada coleta.
  - Quem recebe: o e-mail do perfil da agência principal, que o dono pode trocar na página.
  - Notificação no navegador: vai para os dispositivos do dono, se existirem inscrições. Se não houver jeito simples de alcançar só o dono, fica só o e-mail e a faixa no painel.
- **Endpoints** (todos exigem sessão do dono da plataforma e devolvem 404 para qualquer outro, sem revelar que existem):
  - `GET /api/platform/usage`: dados da página;
  - `POST /api/platform/check`: conferir agora;
  - `POST /api/platform/settings`: plano manual, saldo mínimo e e-mail.
  - O payload de `/api/agency` ganha `access.platform: true` só para o dono, para o menu aparecer.

## Interface

Segue o design system Liquid Glass (tokens só em `ui/tokens.css`, vidro só em navegação e controles) e nunca usa `confirm`, `alert` ou `prompt` (usa `ui/ask.js`).

```
Plataforma                                   Última conferência: 14:02  [Conferir agora]
┌ ⚠ 2 limites perto de estourar ─────────────────────────────────────────────┐
│ Supabase · Banco 412/500 MB (82%)  ·  Vercel · Deploys 24h 97/100 (97%)    │
└────────────────────────────────────────────────────────────────────────────┘
┌ Supabase · Free ────────────── ↗ painel ┐ ┌ Vercel · Hobby ───────── ↗ painel ┐
│ Banco      ████████░░ 412/500 MB  82%   │ │ Deploys 24h ██████████ 97/100 97% │
│            no ritmo atual: cheio em 12/12│ │ Banda       ███░░░░░░░ 31/100 GB  │
│ Storage    █░░░░░░░░░ 0,1/1 GB    10%   │ │             não estoura no ciclo  │
│ Ativos/mês ░░░░░░░░░░ 214/50 mil  0%    │ └───────────────────────────────────┘
│ Egress     a API não informa             │ ┌ Hostinger · KVM 2 ─────── ↗ painel ┐
└─────────────────────────────────────────┘ │ Disco 61% · RAM 48% · vence 03/01  │
                                             └───────────────────────────────────┘
Sem acompanhamento automático: OpenAI ↗ · Resend ↗ · Meta ↗ · AbacatePay ↗ · Google ↗
Alertas para: dono@… [trocar]
```

No celular, os cartões ficam em uma coluna.

## Restrições

- Os tokens de administração ficam só em variáveis de ambiente da Vercel, nunca no store nem no navegador. Erros das APIs são resumidos antes de salvar ou mostrar, sem cabeçalhos nem URLs com segredo.
- Testes com `node --test` em `test/` e `fetch` falso: tabela de limites, cálculo de porcentagem e cor, previsão, decisão de alerta (mudança de nível, lembrete de 24 h, 3 falhas) e o bloqueio de acesso para quem não é o dono.
- Documentação **interna**, só no repositório (`docs/plataforma-limites.md`), no mesmo PR: o que a página mostra e como criar cada token com as permissões mínimas. Esta entrega é exceção à regra de publicar na doc.graao.com, porque o artigo exporia a infraestrutura.
- Trabalho numa branch nova a partir da `origin/main` atualizada.

## Decidido pelo dono

- Objetivo: evitar estourar limites, com alerta antes.
- Abordagem A.
- Documentação interna no repositório, não na doc pública.

## Escolhas minhas (podem ser corrigidas)

- Só o dono da plataforma (`GO_AGENCY_OWNER_ID`) vê a página.
- Limites de 80% e 95%, fixos na v1.
- O envio acontece na mudança de nível, com lembrete a cada 24 h acima de 95%.
- Canais: e-mail mais notificação no navegador. WhatsApp fica fora como canal principal porque depende da própria VPS monitorada.
- A conferência pega carona no cron de `/api/social/cron` em vez de criar um agendamento novo.
- Supabase sem token da Management API, porque esse token não tem modo só leitura e daria poder de apagar ou pausar projetos. As métricas vêm de uma função SQL pela conexão atual. A migration precisa ser aplicada pelo dono no SQL Editor.
- Ponto cego aceito na v1: se o próprio Supabase ou a Vercel cair, o monitor para junto. Os avisos de 80% e 95% chegam antes do banco travar por tamanho. Um aviso externo de "o monitor sumiu" (Worker com cron na Cloudflare) fica para a v2.
- Os avisos repetidos quando a métrica oscila em torno de 80% são evitados com margem: só volta a "ok" abaixo de 75%.
- Os serviços da tabela acima entram na v1, e os outros ficam como links.

## Fica a cargo de quem implementa

- Nomes de arquivos e funções, além do formato exato do histórico (respeitando os limites de tamanho).
- Quais endpoints exatos de uso cada API oferece hoje (egress do Supabase, banda e funções da Vercel, métricas da Hostinger). Se não existir, a métrica mostra "a API não informa".
- O texto dos e-mails e das notificações.
