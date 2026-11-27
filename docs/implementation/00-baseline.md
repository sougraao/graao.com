# Fase 0 — Diagnóstico, baseline e proteção

**Status** — PARTIAL. O inventário do código, os testes locais de isolamento, o histórico de migrations do projeto configurado e o ensaio de recuperação SQLite foram concluídos. A homologação Supabase, a reconciliação das migrations e o ensaio de restauração PostgreSQL continuam pendentes.

**Referência inicial** — 18/11/2026, branch `main`, commit `6b72c89`. O relatório `RELATORIO-PLATAFORMA-GRAAO.txt` foi confrontado com os handlers, os modelos, a configuração de deploy e os testes. A execução desta fase adicionou este documento e `test/isolation.test.mjs` e ampliou `test/landing.test.mjs`. A branch avançou com alterações de interface feitas em paralelo.

## Arquitetura e dependências

| Componente | Responsabilidade e dependências |
| --- | --- |
| `server.mjs`, `api/index.mjs`, `vercel.json` | Servidor HTTP e composição dos módulos. A entrada Vercel encaminha requisições para `makeServer()` e empacota `ui/**`. O servidor lê os estáticos em `ui/`. `public/` também está versionado, com arquivos de mesmo nome. O conteúdo servido pelo domínio Vercel para URLs duplicadas precisa ser conferido em preview. |
| `auth.mjs`, `agency-model.mjs`, `ui/agency-data.js` | OAuth, sessão, vínculo de equipe, plano e permissões. O servidor usa `userAccess()`, o mapa de módulos do frontend e listas próprias de comandos. |
| `storage.mjs`, `supabase/`, `migrate-sqlite.mjs` | Adaptação de SQLite e Data API. O script SQLite → Supabase insere documentos ausentes e verifica o conteúdo. Pode progredir parcialmente antes de detectar uma divergência. Serve para migração entre backends. |
| `model.mjs`, `crm-model.mjs` | Estado e comandos do workspace. Contatos, oportunidades, agendamentos, formulários e cliques disparam workflows locais. Execuções e pausas manuais persistem no workspace. |
| `openai.mjs`, `studio-ai.mjs`, `studio-site.mjs`, `agent-model.mjs`, `agent-ai.mjs`, `graao-chat.mjs` | Conexão e chamadas de IA, Studio, versões e publicação de agentes, conversa de teste e chat de agência. Studio separa documento de página e metadados no workspace. |
| `whatsapp.mjs`, `waha.mjs`, `social-model.mjs`, `social-providers.mjs` | Integrações externas, credenciais, publicação, webhooks, OAuth e persistência de resultados. |
| `client-portal.mjs`, `prospecting-model.mjs`, `prospecting-places.mjs`, `setup-marketplace.mjs` | Portal, prospecção, captura pública e distribuição de configurações. Operam em documentos ligados ao workspace ou à agência. O Marketplace de Setups tem documento compartilhado e projeção pública própria. |
| `ui/app.js`, `ui/agency.js`, `ui/crm.js`, `ui/screens.js`, `ui/reports.js`, `ui/report-data.js`, `report-model.mjs` | Shell e telas. Relatórios de dashboard estão ligados à navegação. O editor de relatórios customizados existe, com modelo de persistência e comandos, sem rota ativa no shell. |

## Rotas HTTP e proteção atual

O despacho está em `server.mjs:768–1378`. Os grupos abaixo usam `workspace` na query ou um identificador no caminho. Rotas delegadas aplicam seus próprios métodos. O servidor rejeita POST com origem explícita divergente ou `Sec-Fetch-Site: cross-site`.

| Rotas e métodos | Sujeito e regra atual |
| --- | --- |
| `GET /api/auth/callback/google`; `POST /api/auth/google`, `/api/auth/logout` | PKCE com cookies de fluxo. Callback usa sessão validada pelo Supabase. Logout encerra sessão local. |
| `GET/HEAD /api/workspaces`, `/api/state`; `POST /api/action`, `/api/workspaces` | Sessão ou operador local. Listagem usa tenant e atribuições. `/api/state` e `/api/action` verificam pertencimento. Escrita usa tabelas de módulos e comandos. Criação de subconta exige `who.agency`. |
| `GET/HEAD /api/agency`; `POST /api/agency/{action,accounts,snapshot-create,snapshot-refresh,snapshot-load,marketplace-publish,marketplace-unpublish,marketplace-install,template-install,prospecting-search,prospecting-action,prospecting-transfer,prospect-convert}` | `who.agency` e verificações por operação. `/action` aplica `who.settings` às listas de comandos e coleções sensíveis. Códigos compartilhados de Setup e publicação no Marketplace têm fluxos próprios. |
| `GET/HEAD/POST /api/openai`; `GET/POST /api/ask/*` | OpenAI usa a própria identidade autenticada. Pergunte ao Graao exige agência e opera no documento de chat da agência. Subrotas GET de estado, conversa, busca e exportação. POST para conversa, configurações, branch, feedback, renomear, excluir e importar. |
| `POST /api/studio`, `/api/studio/{discover,plan,save,revise,page,restore,note,chat-undo,seo,seo-ai,stats-reset,publish}`; `GET/HEAD /api/studio/doc`; `GET /studio-preview/:workspace/:project/:page` | `studioGuard()` verifica tenant e módulo `studio`. A busca do projeto valida associação ao workspace. |
| `POST /api/agents/{create,save,publish,unpublish,move,delete,memory,test,build}` | Tenant e módulo `ai-agents`. Teste e construção com IA usam conexão do usuário conforme a operação. |
| `GET /api/social/connect/:provider`; `POST /api/social/{csv-preview,invite,candidates,attach,bluesky,run,disconnect}` | Sessão, tenant e módulo `marketing`. A operação `invite` cria, consulta ou revoga pelo campo `action`. |
| `GET /api/social/callback/:provider`, `/social-connect/:workspace`; `POST /api/social/invited` | Callback usa nonce descartável e janela de 15 min. Convite usa token com hash, escopo por workspace, expiração e revogação. Pode anexar conexões. |
| `GET/POST /api/social/cron`; `GET /m/:workspace/:file` | Cron exige Bearer igual a `CRON_SECRET`. Mídia social é pública por ID, limitada a imagens em data URL, com uso por provedores de publicação. |
| `GET /api/whatsapp/agency/status`; `POST /api/whatsapp/agency/{config,disconnect-server,subaccount}` | Agência. Operações administrativas no handler de WhatsApp exigem permissões adicionais conforme a operação. |
| `GET /api/whatsapp/workspace/status`; `POST /api/whatsapp/workspace/{connect,disconnect,test}` | Sessão e tenant. O guard atual exige `settings` de membro de subconta com lista de módulos e admite usuários de agência. |
| `GET /api/waha/{status,qr}`; `POST /api/waha/{config,disconnect,session,pair-code,test,subaccount}` | Agência, com verificações adicionais no handler. Rotas legadas registradas. |
| `POST /api/whatsapp/webhook/:agency/:workspace/:token`, `/api/waha/webhook/:agency/:token` | Segredo no caminho e verificação do destino. `whatsapp.mjs` confere pertencimento da subconta. WAHA resolve sessão em configuração legada, com fallback de roteamento. |
| `GET/HEAD/POST /api/client-portal/:workspace/admin`; `GET/HEAD /api/client-portal/:workspace/{home,course/:id}`; `POST /api/client-portal/:workspace/{exchange,logout}` | Admin usa sessão interna, tenant e módulo `memberships`. Cliente usa cookie de sessão no escopo do workspace, vínculo de curso e token temporário de uso único no exchange. |
| `GET /api/v1/subaccounts`; `GET/HEAD/POST /api/v1/subaccounts/:workspace/contacts` | Bearer com hash `go_…` ou `pit_…`. Agência deriva da credencial. Private Integration verifica `subaccounts.read`, `contacts.read` ou `contacts.write`. API limita operações a workspaces da agência emissora. |
| `GET/POST /s/:workspace/:project[/:page]`; `GET/HEAD/POST /form/:workspace/:form`; `GET/HEAD /api/view/{p,f,course}/:workspace/:id`; `POST /api/view/f/…`; `GET /r/:workspace/:link` | Publicação ou registro ativo, conforme a rota. A prévia de formulário aplica guarda de cookie distinta. Cursos marcados `portalOnly` exigem Portal. Formulários podem gravar lead e acionar workflow. Links públicos de rastreio podem gravar clique e acionar workflow. |
| `GET/HEAD /prospecting/report/:token`, `/prospecting/widget/:token`; `POST /prospecting/widget/:token` | Token compartilhado resolve agência, relatório ou widget habilitado. Relatório público usa projeção limitada. Widget recebe lead. |
| `GET/HEAD /portal/:workspace`, `/p/…`, `/f/…`, `/course/…`, `/prospecting[/add-prospect]`, `/`, `/login`, `/app`, `/painel`, `/privacidade` e estáticos permitidos | Páginas, shell ou redirecionamentos. O shell interno verifica presença de cookie antes da verificação de identidade pelos endpoints protegidos. Portal e conteúdo público têm regras próprias de acesso aos dados. |

## Autenticação, escopo e permissões

1. `auth.mjs` valida o access token em `/auth/v1/user`, exige e-mail confirmado, identidade Google e AMR OAuth para o token validado. Se o Supabase recusar o token de acesso, tenta renová-lo quando há refresh token. O ID Supabase identifica o usuário. Metadados de perfil servem para exibição.
2. O proprietário configurado resolve para `agency`. Demais sessões resolvem para `agency-<id>` existente, para a primeira agência com convite habilitado para o e-mail confirmado, ou para uma agência própria criada no primeiro acesso. Uma associação pode indicar várias subcontas. O fluxo escolhe uma agência por sessão, sem seletor multiagência.
3. `canOpen()` cruza a lista de contas permitidas com `belongsToAgency()`. A agência legada usa registros sem `state.agencyId`. Workspace pessoal `user-<id>` exige a sessão proprietária correspondente nas rotas protegidas. Rotas intencionalmente públicas seguem suas próprias regras de publicação e token.
4. `GO_DEV_NO_AUTH=1` só habilita operador local quando o login Supabase está ausente e a aplicação está fora da Vercel. `X-Go-User` é uma troca de ator desse modo. O teste novo passa por `createSupabaseAuth()` com transporte simulado e modo local desativado.

| Papel atual | Visão de agência | `who.settings` | Workspace |
| --- | --- | --- | --- |
| Agency Owner | Sim | Sim | Todos da agência, respeitando a lista de módulos quando preenchida no cadastro de equipe. A identidade proprietária implícita tem acesso integral. |
| Agency Admin | Sim | Sim | Todos da agência, com módulos do cadastro. |
| Agency User | Sim | Não | Todos da agência, com módulos do cadastro. Ainda pode chamar operações fora das listas administrativas específicas. |
| Account Admin | Não | Não | Contas atribuídas, com módulos do cadastro. |
| Account User | Não | Não | Mesma decisão de `Account Admin` em `userAccess()`. |

Em `agency-model.mjs:609–619`, lista `permissions` vazia ou ausente resulta em `modules: null` e herda todos os módulos. O controle de módulos é específico de cada caminho. Há guardas de escrita em `/api/action` e em módulos especializados. `/api/state` só retira agentes e suas execuções conforme a permissão. As métricas ainda usam o estado completo. Não há controle geral por registro atribuído.

## Inventário de documentos

| ID | Conteúdo / escopo |
| --- | --- |
| `agency`, `agency-<uuid>` | Perfil, equipe, metadados de contas, status, planos, features, carteira, rebilling, integrações por hash, Setups e auditoria. `hydrateAgency()` normaliza versões anteriores. |
| `demo`, `<uuid>`, `user-<uuid>` | Operação do workspace, incluindo CRM, conversas, automações, mídia, calendário, formulários, cursos, agentes, relatórios e registros financeiros. `hydrateWorkspace()` normaliza versões anteriores. |
| `studio-<project-id>` | Workspace e projeto associados, HTML, páginas, versões, publicação e estatísticas. |
| `social-<workspace>`, `social-oauth` | Tokens cifrados, convites, conexões pendentes e nonces OAuth. Metadados das redes, publicações e filas no documento do workspace. |
| `openai-<user-id>`, `chat-<agency-id>` | Chave OpenAI cifrada do usuário e histórico/instruções do Pergunte ao Graao, respectivamente. |
| `portal-<workspace>` | Membros e vínculos de curso, fingerprints de links e sessões, expiração e revogação. |
| `whatsapp-<agency-id>`, `waha-<agency-id>` | Credenciais e roteamento dos provedores, segredos de webhook e configurações por subconta. |
| `marketplace-setups` | Catálogo compartilhado de Setups, autoria, versões e registros de instalação. |

O SQLite guarda `id` e `state` numa tabela `workspaces`, em WAL, e grava com `BEGIN IMMEDIATE`. O Supabase mantém `state JSONB`, `revision UUID`, `name` gerado de `state.profile.name` e `created_at`. O adaptador atualiza sob filtro de revisão, com até seis tentativas. A RLS versionada protege o acesso à tabela com uma credencial de servidor para toda a tabela. A separação por agência e workspace depende dos guards da aplicação.

## Integrações, agendamentos e cobrança

| Área | Evidência e estado |
| --- | --- |
| Supabase Auth/Data API e Google | O projeto configurado localmente respondeu HTTP 200 em Auth Settings, com Google habilitado. O adaptador da aplicação encontrou a linha `demo` na Data API. Login OAuth completo e gravações em homologação continuam pendentes. |
| WhatsApp (`whatsapp.mjs`) e WAHA | Provisionamento, gestão e recebimento de mensagens implementados, com testes simulados. WAHA ainda registra rotas e verifica segredo. Uso ativo de WAHA precisa ser confirmado antes de desabilitar. |
| Publicação social | Adaptadores para Facebook, Instagram, Threads, LinkedIn, TikTok, YouTube, Google Business Profile, Pinterest e Bluesky. Testes simulam fluxos de Facebook/Instagram e Bluesky. O timer local chama o runner a cada 60 s. A rota de cron existe separadamente, sem agenda declarada em `vercel.json`. O runner lista workspaces operacionais e pessoais, verifica RSS, reivindica posts e registra resultado. |
| Prospecção e portais | Google Places/Geocoding/Maps Embed implementados. Portal usa Resend para convites quando configurado. Sites e formulários públicos têm testes HTTP locais. |
| IA | OpenAI no Studio e agentes. Pergunte ao Graao aceita chave individual, provedor via ambiente e respostas locais conforme o caminho. Há referências HTTP externas no Studio. Conectividade e consumo reais variam com o ambiente. |
| Cobrança | `agency-model.mjs` persiste carteira, configuração de recarga, multiplicadores e seleção de subcontas SaaS. O workspace registra faturas, produtos, cupons, assinaturas e transações locais, incluindo geração idempotente de uma transação ao marcar fatura paga. Sem fluxo comprovado de gateway, conciliação, cobrança externa ou ledger de consumo. |
| Outras integrações | Conversas/campanhas registram e-mail e SMS localmente. Calendários e reputação operam sobre dados internos. Customização White Label é local. Domínios e catálogo de apps exibem configuração ou requisitos. A conexão real requer projeto próprio e validação com cada provedor. |

## Achados confirmados e limites da evidência

| Classificação | Evidência e impacto | Fase |
| --- | --- | --- |
| `SECURITY_GAP` | `canOpen()` verifica associação e pertencimento, sem consultar `agency.accounts[id].status`. Sondagem HTTP confirmou leitura e criação de contatos por `Account User` em `Paused` e `Closed`. Cron, webhooks e rotas públicas transacionais têm caminhos separados que também exigem política de status. | 1 |
| `SECURITY_GAP` | Sondagem HTTP confirmou que usuário com módulo `contacts` lê fatura de seu workspace por `/api/state`, embora receba 403 ao tentar excluí-la. `visibleState()`, em `server.mjs:220`, só filtra agentes. Respostas de escrita também usam essa projeção. | 2 |
| `SECURITY_GAP` | Sondagem HTTP confirmou que `GET /form/:workspace/:form?preview=1` devolve o conteúdo de um formulário não publicado quando quem conhece os IDs envia um cookie `go_access` fabricado ou uma sessão de outra agência. `server.mjs:1305–1313` usa `auth.hasSession()`, que verifica presença de cookie. No teste, sem cookie o endpoint retornou 404 e com cada um dos cookies retornou 200. | 2 |
| `SECURITY_GAP` | A lista `settingsCommands` deixa `account-meta` de fora. `agencyRequest('action')` permite que `Agency User` alcance o comando de alteração de status/plano da própria agência. A política de transição e o papel de suporte precisam de regressão específica. | 1–2 |
| `SECURITY_GAP` | Sondagem HTTP confirmou que um usuário sem `reporting` consegue executar `report-create`. `model.mjs:322` despacha os três comandos de relatórios customizados, ausentes de `commandModule` em `server.mjs:79–84`. | 2 e 6 |
| `SECURITY_GAP` | Account Admin e Account User têm a mesma decisão em `userAccess()`. Sem `onlyAssigned` ou identificador imutável como controle geral de acesso. A projeção `agencyForWorkspace()` devolve todos os membros da agência com seus papéis, listas de contas e permissões, inclusive para usuários de subconta. | 3 |
| `PARTIAL_IMPLEMENTATION` | Planos e `subFeatures` são gravados e exibidos por `agency-model.mjs`. Os guards operacionais observados usam tenant e permissões pontuais, sem interseção geral com plano, recurso e quota. | 4 |
| `PRODUCT_DECISION` | O plano define chave central da agência e BYOK opcional. O código atual guarda chave por usuário e `graao-chat.mjs` alterna entre conexão, ambiente e resposta local. Migração da política de pagador exige limites, trilha de consumo e compatibilidade. | 5 |
| `PARTIAL_IMPLEMENTATION` | `report-model.mjs`, `ui/reports.js` e `ui/report-data.js` existem. `ui/screens.js` e `ui/app.js` expõem visão geral e relatórios originados de dashboard. Editor customizado sem integração com a navegação ativa. | 6 |
| `LEGACY_CODE` | `waha.mjs` e rotas WAHA seguem ativos no código, ao lado de `whatsapp.mjs`. Existência de workspace dependente em ambiente real ainda indeterminada. Páginas de Revenda, Add-ons, Desktop, educação SaaS, Marketplace de Apps e Workflow Builder têm níveis variados de implementação. `number-intelligence` é uma configuração de Labs. O redirecionamento do slug legado `ask-ai` convive com Pergunte ao Graao funcional na agência. | 7 |
| `CONFIRMED_BUG` | Há estáticos divergentes em caminhos comuns de `ui/` e `public/`, incluindo `dashboard.js`. `automation.js` e `automation.css` divergiram durante alterações paralelas na árvore de trabalho. A cópia efetivamente servida no domínio precisa de verificação em preview. | 7 |
| `PARTIAL_IMPLEMENTATION` | Agentes têm rascunho, publicação, versão e execução de teste. O fluxo de eventos operacionais observado despacha workflows no `model.mjs`; gatilhos do agente não estão ligados a um despachante de eventos. | 8 |
| `MISSING_INTEGRATION` | Pagamentos, campanhas de e-mail/SMS, calendários externos, reputação e provisionamento de domínios têm registros ou configurações locais. Não há evidência de operação externa de ponta a ponta nesses módulos. Resend no Portal é um caminho separado. | 9 |
| `ALREADY_CORRECT` | Testes HTTP bloquearam leitura e escrita cruzadas nos endpoints exercitados, inclusive com IDs conhecidos e tentativas de trocar `workspaceId`/`agencyId`. Bearer derivou agência da chave, o token privado respeitou escopo e revogação e convites do Portal ficaram limitados ao workspace e ao uso único. | Regressão |
| `ALREADY_CORRECT` | Marketplace de Setups tem rotas de publicação e instalação testadas. É funcional no código atual e distinto do catálogo de apps, que permanece indicativo. | Regressão |

## Resultados e cobertura dos testes

- Baseline antes das alterações da Fase 0 em Node.js 24.14.0 e npm 11.9.0, com `npm.cmd test` — **75 aprovados, 0 falhas, 0 ignorados**.
- Após `test/isolation.test.mjs`, com `npm.cmd test` — **78 aprovados, 0 falhas, 0 ignorados**. Os três casos novos cobrem duas agências, usuário com múltiplas contas, tentativa de trocar o tenant pelo payload, ID de registro cruzado, workspace pessoal, API pública, Private Integration, access token expirado ou inválido e link do Portal expirado, cruzado ou reutilizado.
- O cenário existente em `test/landing.test.mjs` também passou a verificar o callback Google com transporte simulado para um usuário atribuído a duas subcontas, incluindo listagem e abertura após o login.
- Sondagens de diagnóstico confirmaram os comportamentos HTTP de suspensão, leitura de fatura, criação de relatório e prévia de formulário descritos na tabela. Asserções para o bloqueio de suspensão e autorização devem entrar nas fases que corrigirem esses comportamentos.
- `node --check` passou nos 130 arquivos JavaScript versionados no início do trabalho. `git diff --check` sem erros. O `package.json` oferece `build:dark` para gerar CSS após mudanças de estilo, sem tarefas de lint ou build geral. A Fase 0 não modificou estilos.
- Execução direcionada usa `node --test --test-isolation=none test/isolation.test.mjs`. O modo padrão de subprocessos retornou `spawn EPERM` no ambiente gerenciado. O Node emite aviso de SQLite experimental nas execuções.
- Cobertura preexistente em `test/` inclui agência/Setups, agentes, Studio e construtor, dashboard/relatórios de dashboard, CRM, inbox, workflows, sites/formulários, Portal, chat, social, WhatsApp e WAHA. O adaptador Supabase tem testes com Data API simulada e conflito de revisão, sem validação do PostgreSQL real.

## Migrations e homologação

| Registro | Estado comprovado |
| --- | --- |
| `supabase/migrations/20261116193826_go_workspace_storage.sql` | Versionada. Cria a tabela, habilita RLS, revoga privilégios dos papéis públicos e concede leitura/inserção/atualização ao `service_role`. |
| `supabase/provision-storage.sql` | Provisionamento separado do histórico. Concede leitura/inserção/atualização a `anon` com políticas que comparam o hash do cabeçalho servidor `X-Go-Storage-Key`. A execução precisa ser verificada separadamente da migration. |
| Histórico aplicado | O painel de produção de `graao.com` lista `20261117154823 go_workspace_storage`, `20261117154851 go_storage_key_policies`, `20261117163746 social_cron_setup` e `20261117163823 social_cron_schedule`. A migration de storage versionada no repositório tem outro número. É preciso comparar o SQL e reconciliar o histórico antes de aplicar mudanças. As entradas de cron no painel registram a instalação, sem confirmação do estado atual ou das últimas execuções do job. |
| Acesso administrativo e políticas efetivas | A sessão web da organização `minhasoci-bot` abriu o projeto `graao.com`. O conector original retornou falta de permissão. A conexão Codex `supabase-graao`, restrita ao projeto e a operações de leitura, autenticou por OAuth e carregou a ferramenta `list_migrations`. O histórico acima foi conferido no painel. Nenhuma migration criada ou aplicada nesta fase. |

[Histórico no painel Supabase](https://supabase.com/dashboard/project/zlkhoucdqfxgiorujifj/database/migrations)

Na rechecagem direta da Data API, a mesma consulta à linha `demo` retornou HTTP 200 com lista vazia usando apenas a chave pública ou uma chave de storage incorreta. Isso confirma o bloqueio de leitura nesse cenário. O inventário das policies e as permissões de escrita do ambiente continuam pendentes.

Quando houver um projeto Supabase de homologação identificado e credenciais de acesso correspondentes, preparar um ambiente isolado com redirecionamentos OAuth do próprio domínio, usuários sintéticos para os cinco papéis, duas agências, um workspace pessoal e pelo menos dois workspaces atribuídos ao mesmo usuário. Desabilitar execução externa automática até configurar provedores sandbox. Registrar o histórico aplicado e verificar RLS, grants e presença das policies por nome, sem exportar expressões com o hash. Testar a Data API com chave pública, sessão cliente e segredo válido ou inválido do servidor. Verificar seleção, inserção e atualização bloqueadas sem credencial apropriada e ausência de DELETE para o papel do app. Repetir testes HTTP de isolamento, fluxo real de Google, renovação e expiração, conflitos de revisão e os caminhos mínimos de Portal, WhatsApp e publicação social usando recursos de teste. [Segurança da Data API](https://supabase.com/docs/guides/api/securing-your-api)

## Backup, restauração e rollback

1. **Antes de liberar** — Registrar versão do código, artefato implantado, histórico de migrations, janelas de retenção e recuperação, configuração por ambiente e referência aos segredos no cofre. Identificar a janela em que houver necessidade de pausar gravações, cron e consumidores. Dimensionar RPO e RTO com o responsável pelo ambiente, a partir do ensaio.
2. **SQLite** — Resolver o arquivo efetivo de `GO_DB_PATH` ou o caminho padrão. Fazer snapshot com a API `node:sqlite.backup()` para um destino novo e protegido, usando a conexão de origem. Em modo WAL, copiar apenas o arquivo principal com o app gravando pode perder transações. Reabrir a cópia em outro caminho, verificar `PRAGMA integrity_check`, comparar IDs e conteúdos em amostra autorizada e subir o servidor apontando para a cópia. O ensaio desta fase usou SQLite temporário, gravou dois documentos sintéticos, criou o backup, alterou a origem e confirmou que a cópia integrou apenas o estado do momento do backup. Limpeza final concluída.
3. **Supabase/PostgreSQL** — Confirmar disponibilidade de backup gerenciado e PITR no plano ou preparar dump lógico criptografado por ambiente. Preservar documentos, revisões, schema, grants e RLS. Catalogar separadamente histórico de migrations, configuração de Auth/OAuth, arquivos externos e material de chave necessário para recuperar credenciais cifradas. Verificar quais schemas e papéis são excluídos pelo método de backup escolhido. Guardar dumps e segredos em acessos restritos e separados do repositório. [Backup e restauração com a CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)
4. **Ensaio de Supabase** — Restaurar em projeto descartável aprovado, com dados sintéticos ou amostra autorizada e anonimizada. Reprovisionar políticas com a credencial do ambiente. Comparar contagens, documentos e revisões, validar a autorização via Data API e repetir smoke tests com SQLite e Supabase. Registrar tempos, perdas esperadas e evidências de integridade. Ensaio pendente.
5. **Implantação gradual** — Executar testes locais, validar em homologação e liberar a um grupo controlado quando autorizado. Observar 401/403/409 por rota, erros de autenticação, jobs, webhooks, latência e efeitos externos. Confirmar que os logs seguem sem segredos ou dados desnecessários.
6. **Reversão** — Interromper a expansão e desativar a função afetada quando houver flag apropriada. Voltar ao artefato anterior se continuar compatível com a versão dos dados. Para SQLite, pausar escritores antes de apontar para uma cópia validada e guardar o arquivo pós-incidente para recuperar gravações posteriores. Para PostgreSQL, preferir correção de schema compatível e restauração para alvo separado, com reconciliação dos eventos posteriores ao ponto recuperado. Operações de restauração em produção exigem autorização explícita.

## Pendências e próxima fase

A comparação do SQL aplicado com o repositório, o inventário das políticas do banco, as credenciais e redirecionamentos de homologação e a operação dos provedores seguem pendentes. Alterações em produção, migrations e ativações externas ficaram fora desta execução. Os próximos testes de segurança devem incluir status e reativação, suporte de agência restrito, tarefas em execução, webhooks, rotas transacionais públicas e alterações de privilégio durante sessão ativa.

A Fase 1 deve introduzir a verificação de ciclo de vida nos caminhos de acesso e execução, com testes para preservar dados existentes e impedir operações indevidas. O status de homologação continuará pendente até ser possível executar o roteiro no projeto correto.
