# Plano de ação de melhoria: graao.app

Data: 23/11/2026 · Branch analisada: `feat/smartsite-awwwards` · Ferramentas: gstack `/health`, Supabase (somente leitura), Vercel (erros de produção), leitura do código.

## 1. Retrato do projeto

| Item | Valor |
| --- | --- |
| Arquivos versionados | 1.053 (343 em `ui/`, 224 em `public/`, 140 no `Smartsite/`, 127 testes) |
| Back-end | 112 módulos `.mjs` na raiz, ~30 mil linhas. `server.mjs` sozinho tem 4.902 linhas |
| Front-end | 148 módulos ES em `ui/` (~42 mil linhas, 3,4 MB de JS, 860 KB de CSS), sem bundler |
| Dependências do app | Zero (`package.json` sem `dependencies`). Só o Smartsite usa Astro |
| Banco | Supabase `graao.com` (us-east-2, Postgres 17): 1 tabela de app, `go_workspaces`, 51 linhas, 1,2 MB, 6 usuários |
| Hospedagem | Vercel, região `gru1` (São Paulo), uma função `api/index.mjs` atende tudo |
| Agendador | `pg_cron` chama `/api/social/cron` a cada minuto via `pg_net`: 1.440 execuções nas últimas 24 h, 358 respostas 200 guardadas, 2 timeouts de DNS |
| Integrações | Supabase Auth (Google), OpenAI, Gemini, AbacatePay, Resend, Twilio, Meta, LinkedIn, Evolution/WAHA (WhatsApp), Google (Places, Ads, GBP, PageSpeed), Web Push, Treg |

## 2. Nota de saúde (gstack /health)

```
Categoria     Ferramenta                  Nota   Status    Detalhe
Testes        node --test                 7/10   WARNING   538/541 passando (27 s)
Tipagem       (nenhuma)                   -      SKIPPED   sem tsconfig / checkJs
Lint          (nenhuma)                   -      SKIPPED   sem ESLint ou Biome
Código morto  (nenhuma)                   -      SKIPPED   sem knip
Shell         (nenhuma)                   -      SKIPPED   sem shellcheck (há 5 .sh em deploy/evolution)

NOTA COMPOSTA: 7.0 / 10 (cobertura parcial: 1 de 6 categorias)
```

Os 3 testes que falham hoje vêm do trabalho não commitado, não da `main`:

1. `test/landing.test.mjs`: `ui/landing.html` foi trocado por um modelo em inglês chamado "Tidewell — Tides in Motion" (+1.863 linhas). A landing do graao virou `ui/landing.graao.bak.html`.
2. `test/public-mirror.test.mjs`: `ui/i18n.js` mudou e `public/` não foi sincronizado (`node scripts/sync-public.mjs`).
3. `Smartsite/site/tests/output.test.mjs`: a pasta `dist/.taste-skill/` (sobra de uma skill de design) entra na varredura de páginas e quebra o teste de canonical.

## 3. O que já está bom

- Webhooks assinados e comparados em tempo constante (Meta, Resend/Svix, AbacatePay, Calendly, formulários de lead).
- Chaves de terceiros cifradas com AES-256-GCM (`GO_STORAGE_KEY`), nunca voltam ao navegador.
- Limites de corpo de requisição em todas as rotas que leem o body (413).
- CSP, `nosniff` e `Referrer-Policy` nas páginas públicas.
- Controle de concorrência por revisão no Supabase (`change()` com até 6 tentativas).
- Modo sem login (`GO_DEV_NO_AUTH`) travado fora da Vercel e só sem auth configurado.
- Nenhum segredo encontrado no código versionado; `.env*` ignorado.
- 541 testes e zero dependências de runtime: superfície pequena de supply chain.

## 4. Achados e ações

Prioridade: **P0** = risco ativo ou bloqueia entrega. **P1** = próximo mês. **P2** = trimestre.

### P0. Fazer agora (esta semana)

**P0.1 Não commitar a landing "Tidewell" por acidente.**
Evidência: `git diff --stat` mostra `ui/landing.html` e `public/landing.html` com +1.863 linhas, `<title>Tidewell — Tides in Motion</title>`, `lang="en"`.
Ação: decidir se é experimento. Se for, mover para outro arquivo (ex.: `ui/landing-tidewell.html`) e restaurar `ui/landing.html` da `main`. Apagar `ui/landing.graao.bak.html`.
Esforço: 10 min.

**P0.2 Deixar a suíte verde de novo.**
Ação: rodar `node scripts/sync-public.mjs`; apagar `Smartsite/site/dist/.taste-skill` e fazer o teste de saída ignorar pastas que começam com ponto.
Esforço: 15 min.

**P0.3 Criar CI no GitHub.**
Evidência: não existe `.github/`. Os 3 testes quebrados acima só aparecem rodando na máquina.
Ação: workflow `.github/workflows/test.yml` com Node 24 rodando `npm test` e `cd Smartsite/site && npm ci && npm run check` em todo PR. Exigir o check antes do merge.
Esforço: 30 min.

**P0.4 Smoke test depois de cada deploy.**
Evidência: em 21/11/2026, das 21:33 às 21:45 UTC, o deploy `dpl_5mkv74tf7AJWvhAZempWa4sGR6HQ` subiu sem 40 arquivos de `ui/` (`ENOENT /var/task/ui/invoices.js`, `ads.js`, `orders.js`...). São 41 grupos de erro na semana, quase todos desse deploy. Os arquivos estão versionados; o pacote da função saiu incompleto.
Ação: script que, após o deploy, baixa `/app` e cada `ui/*.js` referenciado e falha se algum der 404/500. Dá para rodar como Deployment Check da Vercel.
Esforço: 1 h.

### P1. Próximas 2 a 4 semanas

**P1.1 Aproximar banco e servidor.**
Evidência: Vercel em `gru1` (São Paulo) e Supabase em `us-east-2` (Ohio). Cada `change()` faz 2 idas e voltas (GET do documento inteiro + PATCH do documento inteiro), cerca de 120 ms cada só de rede.
Ação: escolher uma região para os dois. Opção mais barata: mudar a função para `iad1`/`cle1` (perto de us-east-2). Opção melhor para o usuário brasileiro: novo projeto Supabase em `sa-east-1` e migrar (51 linhas, 1,2 MB, cabe numa tarde com `migrate-sqlite.mjs` adaptado).
Esforço: 1 h (mudar região da função) ou 1 dia (migrar banco).

**P1.2 Documentos de agência estão crescendo rápido.**
Evidência: `agency-d58ac2e4…` já tem 333 KB e `agency` 200 KB, com 6 usuários. Toda alteração na agência lê e regrava o documento inteiro.
Medição (23/11/2026, só leitura): o peso vem de imagens em base64, não de listas. `agency` → `company.logo` 136 KB; `agency-d58a…` → `desktopApp.icon/icon512/icon192` 157 KB e `company.logo` 100 KB. `snapshots` pesa 42 a 50 KB. Prospects (10 KB) e auditoria (6 KB, 34 itens) ainda são pequenos.
Ação: guardar logo e ícones no armazenamento de mídia que já existe (`media-model.mjs`, servido em `/m/...`) e deixar no documento só o endereço; migrar os 3 campos existentes. Alerta no log quando um documento passar de 1 MB.
Esforço: 1 dia.

**P1.3 Trabalho em segundo plano sem `waitUntil` na Vercel.**
Evidência: 48 chamadas "fire-and-forget" em `server.mjs` (`flushLater`, `emailLater`...) e nenhum uso de `waitUntil`. Na Vercel a função pode ser congelada quando a resposta termina. Hoje o cron de 1 minuto serve de rede de segurança, então o efeito provável é atraso, não perda. Não verificado em produção.
Ação: passar essas promessas para `waitUntil` (pacote `@vercel/functions` ou `globalThis[Symbol.for('@vercel/request-context')]`) e manter o cron como reforço. Na prática são 3 helpers (`flushLater`, `auditLater`, `emailLater`) chamados em 48 lugares.
Esforço: 2 h.

**P1.4 Cron aponta para um alias de deploy.**
Evidência: o job `graao-social-cron` chama `graao-app-br-soci3.vercel.app`, não o domínio de produção. Houve 2 timeouts de DNS de 30 s.
Ação: apontar para o domínio de produção, guardar o `CRON_SECRET` no Supabase Vault (confirmar se já está) e trocar a comparação em `server.mjs:2443` por `timingSafeEqual`.
Esforço: 30 min.

**P1.5 Cron único percorre todos os workspaces em série.**
Evidência: `runAllSocial` (server.mjs:1886) roda 10 rotinas por workspace, um workspace depois do outro, numa invocação só. Com 51 linhas está ok; com algumas centenas de subcontas passa do tempo máximo da função. Um timeout já apareceu ("Social planner (demo): The operation was aborted due to timeout").
Ação: o cron só enfileira (lista os workspaces com trabalho pendente) e dispara uma chamada por workspace, ou processa em lotes com cursor. Definir `maxDuration` no `vercel.json`.
Esforço: 1 dia.

**P1.6 Ajustes do Supabase (advisors).**
- Ativar a proteção de senha vazada (Auth). [doc](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- Mover a extensão `pg_net` para fora do schema `public`. [doc](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public)
- Políticas RLS de `go_workspaces` reavaliam `current_setting()` por linha. [doc](https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan)
Esforço: 30 min.

**P1.7 Lint e checagem de tipos sem adicionar build.**
Ação: `tsconfig.json` com `checkJs` + `noEmit` (só JSDoc, nada muda no runtime) e Biome para lint. Começar em modo aviso e entrar no CI quando zerar. Adicionar `shellcheck` para `deploy/evolution/*.sh`.
Esforço: meio dia para configurar; a limpeza pode ser gradual.

**P1.8 Token do Treg cifrado e fora do navegador.** (achado em 23/11/2026, ao testar o chat)
Evidência: `graao-chat.mjs` guarda `connectors.treg.token` em texto puro no armazenamento do chat e o devolve inteiro em `GET/POST /api/ask/connectors`; `ui/graao-chat.js` preenche o campo da tela com ele. O token pode gastar crédito no Treg.
Ação: cifrar com `GO_STORAGE_KEY` (AES-256-GCM, como OpenAI e AbacatePay), devolver só "configurado" e os últimos 4 caracteres, e ajustar a tela para não reexibir o token.
Esforço: 2 h.

**P1.9 Tokens das redes sociais sem chave fixa em produção.** (achado em 24/11/2026)
Evidência: `social-providers.mjs:13` deriva a chave de `SOCIAL_TOKEN_KEY || GO_STORAGE_KEY || 'graao-local-social-key'`. Sem as duas variáveis, os tokens das redes são cifrados com uma chave que está no código. Em produção o `GO_STORAGE_KEY` existe; o risco é um deploy novo sem ela.
Ação: na Vercel (ou fora do modo local), falhar ao iniciar em vez de usar a chave fixa.
Esforço: 30 min.

### P2. Trimestre

**P2.1 Quebrar `server.mjs` (4.902 linhas).**
Hoje o roteamento são dezenas de `if (p === '/api/...')` dentro de uma função. Separar por domínio (`routes/payments.mjs`, `routes/social.mjs`, `routes/public-pages.mjs`...) com uma tabela de rotas. Fazer por fatias, uma por PR, com os testes atuais como rede.

**P2.2 Testes dedicados para os módulos grandes sem arquivo de teste próprio.**
`graao-chat.mjs` (1.344 linhas), `whatsapp.mjs` (991), `setup-agencia-360.mjs` (473), `expressions.mjs` (432), `waha.mjs` (397), `phone-server.mjs` (383), `mcp-server.mjs` (323). Podem estar cobertos indiretamente pelos testes do servidor; vale medir com `node --test --experimental-test-coverage` antes de escrever testes novos.
Medição (23/11/2026): cobertura geral de 67% das linhas, `server.mjs` 91%. `whatsapp.mjs` 89%, `waha.mjs` 86% e `mcp-server.mjs` 84% já são bem cobertos pela integração. As lacunas reais são `treg.mjs` 23%, `prospecting-osm.mjs` 52%, `content-ai.mjs` 64%, `graao-chat.mjs` 67% (~450 linhas), `connectors.mjs` 68% e `social-providers.mjs` 69%.

**P2.3 Acabar com a cópia `ui/` → `public/`.** (testado em 23/11/2026, ver PR #85)
Resultado: não compensa. O preset de Node da Vercel só publica o `public/` versionado, e sem ele cada `.js`/`.css` vira chamada à função, sem CDN. `public/` continua versionado. Os previews acharam a causa do incidente de 21/11: o `includeFiles: "ui/**"` estava em `api/index.mjs`, mas o entrypoint real é `server.mjs`; com `ui/**` também em `server.mjs`, um arquivo faltando em `public/` é servido pela função em vez de dar 500.
Texto original:
São 224 arquivos duplicados mantidos por script e por teste. Se `public/` existe só para servir estático, servir `ui/` direto (como a função da Vercel já faz) ou gerar `public/` no build e tirá-lo do git.

**P2.4 Peso do repositório e do front.**
- `ui/` tem 16 MB (`setup-art/` tem 123 arquivos). Converter imagens para WebP/AVIF e servir por CDN.
- Cada idioma existe duas vezes (`locales/es.json` e `locales/es.js`, 440 KB cada, e de novo em `public/`). Manter um formato.
- PNGs de marca soltos na raiz (`caramelo-isotipo-*.png`, `isotipo*.png`): mover para `ui/brand/`.
- 148 módulos JS carregados sem bundler: medir com `/benchmark` o tempo de carga de `/app` antes de decidir por um bundle.

**P2.5 Modelo de dados de longo prazo.**
Um documento JSONB por workspace foi a escolha certa para andar rápido, mas não permite relatórios entre subcontas, busca por contato ou histórico paginado sem carregar tudo. Plano: extrair as coleções que crescem sem limite (mensagens de conversa, contatos, eventos de tracking, log de auditoria) para tabelas com índice, mantendo o resto no documento.

**P2.6 Higiene do git.**
77 branches locais, 66 já mescladas na `main`: `git branch --merged main` e apagar. Limpar `scratch/`, `assets-geradas/` e `.agents/` ou colocar no `.gitignore`.

## 5. Ordem sugerida

| Semana | Itens |
| --- | --- |
| 1 | P0.1, P0.2, P0.3, P0.4, P1.4, P1.6 |
| 2 | P1.1 (decidir região), P1.3, P1.7 (configurar em modo aviso) |
| 3 a 4 | P1.2, P1.5 |
| Trimestre | P2.1 a P2.6, uma fatia por PR |

## 6. Próximas auditorias do gstack

- `/cso`: auditoria de segurança completa (OWASP, autorização por subconta, SSRF nos conectores e no `fetchMedia`).
- `/qa`: testar os fluxos principais no app publicado.
- `/benchmark`: medir a carga de `/app` e das páginas públicas.
- Rodar `/health` de novo depois do P0 para ter a primeira linha de tendência.
