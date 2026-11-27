# Página Plataforma: limites dos serviços e alertas

Documento interno. Não publicar na doc.graao.com: ele descreve a infraestrutura (VPS, variáveis e permissões dos tokens).

## O que é

Na visão da agência, o menu **Visão geral → Plataforma** (`/app#agency/plataforma`) mostra o plano, o uso e os limites de cada serviço que mantém o graao no ar:

| Serviço | O que aparece |
|---|---|
| Supabase | Banco (500 MB no Free), Storage (1 GB), usuários ativos no mês (50 mil). O egress a API não informa |
| Vercel | Deploys nas últimas 24 h (Hobby: 100 por dia) |
| Cloudflare R2 | Armazenamento (10 GB grátis), operações classe A (1 mi por mês) e classe B (10 mi por mês) |
| Hostinger | Disco, memória e CPU da VPS da Evolution, e o vencimento quando a renovação automática está desligada |
| Evolution API | Se responde e quantas instâncias existem |
| Twilio | Saldo da conta contra o mínimo definido na página (padrão US$ 10) |
| OpenAI | Com `OPENAI_ADMIN_KEY`, o gasto do mês em dólares da conta da graao (sem limite: a OpenAI não expõe o saldo pela API). Com `OPENAI_API_KEY`, se ela é aceita |
| Resend | Se o domínio do remetente (`PORTAL_EMAIL_FROM`) está verificado. Pendente gera aviso. Com chave só de envio (a de produção), o cartão diz isso e não confere o domínio |
| Meta | Quanto do limite de chamadas por hora do app já foi usado (cabeçalho `X-App-Usage`) |

AbacatePay e Google aparecem só como atalhos para o painel de cada um: no AbacatePay cada agência usa a própria chave (não há conta da plataforma para ler), e o Google não tem API de uso para as chaves que o app guarda.

Quando a leitura falha, o cartão diz em qual chamada: "HTTP 500 em métricas", "HTTP 401 em chave".

Para as métricas que zeram por ciclo e para as acumuladas, a página mostra a previsão no ritmo dos últimos 7 dias: "no ritmo atual: cheio em 12/12" ou "não estoura neste ciclo".

**Quem vê:** só o dono da plataforma, que é a sessão cujo id é `GO_AGENCY_OWNER_ID`. Para qualquer outra pessoa, o menu não aparece e as rotas `/api/platform/*` respondem 404.

## Como os alertas funcionam

- **Quando confere:** de hora em hora, de carona no cron `/api/social/cron`, depois das publicações. O botão **Conferir agora** força uma conferência, no máximo a cada 2 minutos.
- **Aviso a 80%** e **urgente a 95%**. A métrica só volta a "normal" abaixo de 75%, para não repetir o aviso quando oscila em volta de 80%.
- O alerta sai quando o nível sobe. Enquanto estiver urgente, ele se repete a cada 24 h. Uma métrica que oscila em volta de 95% não avisa de novo antes de 24 h, e uma leitura sem valor não muda o nível.
- **Falha de leitura:** avisa uma vez após 3 conferências seguidas com erro, ou 2 no caso da Evolution. Um token vencido aparece assim.
- **Vencimento da Hostinger:** avisa com 15 dias e com 3 dias.
- **Canais:**
  - e-mail para o endereço de **Alertas e planos** (preenchido com o seu login na primeira visita), enviado pelo Resend (`RESEND_API_KEY` e `PORTAL_EMAIL_FROM`);
  - notificação nos aparelhos onde você clicou em **Ativar notificações neste aparelho** (`WEB_PUSH_PUBLIC_KEY` e `WEB_PUSH_PRIVATE_KEY`);
  - faixa no topo do painel da agência.
- O estado do alerta é gravado antes do envio. Se o banco não aceitar a gravação, nada é enviado, para evitar e-mail repetido a cada hora.

## Configuração (uma vez)

### 1. Supabase: a função `go_platform_usage`

Não usa token de administração: o token da Management API não tem modo só leitura. A leitura passa por uma função SQL, chamada pela conexão que o app já tem.

1. Abra o SQL Editor do projeto `zlkhoucdqfxgiorujifj`.
2. Copie o bloco `go_platform_usage` do fim de `supabase/provision-storage.sql`, ou o arquivo `supabase/migrations/20261125120000_go_platform_usage.sql`.
3. Troque `GO_STORAGE_KEY_SHA256` pelo SHA-256, em hexadecimal, da `GO_STORAGE_KEY` (o mesmo valor usado nas policies).
4. Rode o bloco.

Sem esse passo, o cartão do Supabase mostra "Não consegui ler os dados".

**Situação:** criada em produção em 26/11/2026, com a chave copiada das policies existentes. Ela recusa chamadas sem a chave do servidor.

### 2. Variáveis na Vercel (Production)

Situação em 26/11/2026: em produção já estão `VERCEL_TEAM_ID`, `VERCEL_API_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `HOSTINGER_API_TOKEN`, `RESEND_API_KEY`, `PORTAL_EMAIL_FROM`, `WEB_PUSH_*`, `EVOLUTION_*`, `META_APP_ID`/`META_APP_SECRET`, `CRON_SECRET` e `GO_AGENCY_OWNER_ID`. Faltam só `TWILIO_*` (se a telefonia for usada) e, opcional, `OPENAI_ADMIN_KEY`.

**Leitura dos serviços**

| Variável | Onde criar | Permissão mínima |
|---|---|---|
| `VERCEL_API_TOKEN` | vercel.com → Account Settings → Tokens | Escopo só no time `soci3`, com validade definida |
| `VERCEL_TEAM_ID` | Settings do time `soci3` → Team ID (`team_…`) | — |
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com → My Profile → API Tokens → Custom token | Account → **Account Analytics: Read** e **Workers R2 Storage: Read**, só na conta do R2 |
| `CLOUDFLARE_ACCOUNT_ID` | dash.cloudflare.com → R2 → Account ID (a mesma conta do R2 da doc) | Sem ela, a conta sai do próprio token, mas só se o token tiver permissão de listar contas; o token de produção não tem ("o token não vê nenhuma conta"). **Não use `R2_ACCOUNT_ID` para isso:** sozinha ela liga o armazenamento R2 do app, que exige bucket e chaves, e derruba o servidor |
| `HOSTINGER_API_TOKEN` | hPanel → Perfil → API → Novo token | Token da conta, com validade definida |
| `TWILIO_ACCOUNT_SID` e `TWILIO_AUTH_TOKEN` | console.twilio.com → Account Info | Só se a graao usar a telefonia; as mesmas variáveis ligam a compra de números |
| `OPENAI_ADMIN_KEY` (opcional) | platform.openai.com → Organization → Admin keys | Só leitura de uso. Mostra o gasto do mês da conta da graao. As agências usam chaves próprias da OpenAI, que não entram aqui |
| `OPENAI_API_KEY` (opcional) | A chave do "Pergunte à Graao", se for usada | O cartão confere se a chave é aceita. `STUDIO_OPENAI_API_KEY` não é lida pelo app e não entra |
| `RESEND_API_KEY` | Já usada pelo app | Só de envio basta (é a de produção). Para o cartão conferir o domínio, ela precisaria de **Full access** |
| `META_APP_ID` e `META_APP_SECRET` | Já usadas pelo app | — |

**Canais de alerta.** Sem pelo menos um deles, a página mostra os números mas não avisa ninguém.

| Variável | Onde criar |
|---|---|
| `RESEND_API_KEY` e `PORTAL_EMAIL_FROM` | resend.com → API Keys. O remetente precisa ser de um domínio verificado no Resend |
| `WEB_PUSH_PUBLIC_KEY` e `WEB_PUSH_PRIVATE_KEY` | Gere uma vez com `node scripts/vapid-keys.mjs` e cole as duas linhas |

Já existentes e reaproveitadas: `EVOLUTION_BASE_URL`, `EVOLUTION_API_KEY`, `CRON_SECRET` e `GO_AGENCY_OWNER_ID`. Variáveis novas só valem a partir do próximo deploy.

Um serviço sem as suas variáveis aparece como **Não conectado**, com o nome do que falta, e nunca gera alerta.

## Ponto cego aceito

O monitor roda dentro do próprio app: depende da Vercel para executar e do Supabase para o cron e para gravar o estado. Se um dos dois cair, o monitor para junto e não avisa.

Os avisos de 80% e 95% chegam antes de o banco travar por tamanho. Um vigia externo que avise quando o monitor sumir (por exemplo, um Worker com cron na Cloudflare) fica para uma próxima versão.

## Onde está no código

| Arquivo | Papel |
|---|---|
| `platform-limits.mjs` | Limites por plano, níveis, previsão e decisão de alertas (puro) |
| `platform-collectors.mjs` | Um coletor por serviço, com tempo máximo de 8 s |
| `platform-monitor.mjs` | Conferência, histórico (7 dias por hora e 90 dias por dia), envio e configurações. Grava na linha `platform-usage` do store |
| `routes/platform.mjs` | `GET /api/platform/usage`, `POST /api/platform/check`, `POST /api/platform/settings` e `POST /api/platform/push` |
| `ui/platform.js` e `ui/platform-format.js` | A página e os números no formato brasileiro |
| Design e plano | `docs/superpowers/specs/2026-11-25-admin-plataforma-limites-design.md` e `docs/superpowers/plans/2026-11-25-admin-plataforma-limites.md` |
