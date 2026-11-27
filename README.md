# graao

Recriação local e independente do espaço de trabalho do HighLevel. A tela inicial, a barra lateral e a organização geral seguem a interface observada no navegador interno. Todos os registros de exemplo são fictícios. O projeto não se conecta à conta original.

## Executar

No PowerShell, na pasta deste projeto, com Node.js 24 ou superior:

```powershell
npm.cmd start
```

Abra <http://127.0.0.1:4317/> para ver a tela de login e clique em **Continuar com Google** para acessar a plataforma. Para outra porta, defina `$env:GO_PORT` antes de iniciar e cadastre a URL de retorno dessa porta no Supabase. Nesta instalação, o servidor usa o projeto Supabase `graao-club`. O arquivo local `.env.local` guarda a configuração usada pelo servidor.

O banco usa uma linha JSONB por workspace em `public.go_workspaces`. O servidor grava sob controle de revisão para evitar sobrescrever mutações concorrentes. Uma leitura pergunta pela `revision`: se o documento não mudou, o Supabase não o envia de novo. Ao editar `state` por SQL, troque também a `revision` (`gen_random_uuid()`); sem isso, um servidor que já leu o documento só vê a mudança em até 30 minutos. A política de segurança por linha exige a credencial do servidor, além da chave pública do projeto. Em outra instalação, aplique a migração SQL. Gere uma chave aleatória de 32 bytes em formato hexadecimal, calcule o SHA-256 desse texto e aplique `supabase/provision-storage.sql` com o marcador substituído pelo hash. Guarde a chave original em `.env.local`, nas variáveis indicadas em `.env.example`. Sem as variáveis do Supabase, o servidor usa SQLite local para desenvolvimento. Os eventos do rastreamento externo ficam em `public.go_tracking_events` (por 365 dias). Enquanto essa migração e o `provision-storage.sql` não são aplicados, eles continuam no documento da subconta. O log de auditoria da agência fica em `public.go_agency_audit` (por 730 dias), com a mesma regra: sem a tabela, segue no documento da agência.

Ao iniciar, o console mostra o banco em uso e se o agendador de um minuto (automações, publicações e campanhas) está ligado. Com SQLite ele fica ligado. Com Supabase ele fica desligado, porque o cron oficial já chama `/api/social/cron` a cada minuto e um segundo agendador executaria tudo em paralelo sobre o mesmo banco. Para ligá-lo de propósito, por exemplo numa instalação própria sem esse cron, use `GO_LOCAL_SCHEDULER=1`. Na Vercel a variável não tem efeito.

`npm.cmd run migrate:sqlite` copia os workspaces de `.data/go.sqlite` para o Supabase configurado e compara o conteúdo gravado com a origem. Um workspace que já tenha mudado no destino é preservado.

## Livro da cobrança

Cada pagamento, devolução, contestação e movimento de carteira vira uma linha em `go_billing_ledger`, que não aceita mudança nem exclusão. O fato nasce na mesma gravação do estado (`ledgerOutbox`) e segue para a tabela logo depois. Sem a tabela, os fatos esperam no estado e os pagamentos funcionam normalmente.

Ordem em produção, cada passo com autorização:

1. Aplicar `supabase/migrations/20261124120000_go_billing_ledger.sql`.
2. Aplicar a parte do livro de `supabase/provision-storage.sql`, com o hash da chave do servidor.
3. Publicar o app.
4. No dia seguinte, simular a importação do passado com `node --env-file=.env.local scripts/ledger-backfill.mjs` e, conferidos os números, repetir com `--apply`. Pode rodar de novo sem duplicar.
5. Cada agência e subconta já conectada ao AbacatePay clica em **Atualizar avisos**.

## Login com Supabase Auth

1. Crie um cliente OAuth do tipo **Aplicativo da Web** no Google Cloud. Cadastre `https://<project-ref>.supabase.co/auth/v1/callback` como URI autorizada no cliente e informe o ID e o segredo em **Authentication → Sign In / Providers → Google**. [Login com Google no Supabase](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
2. Em **Authentication → URL Configuration**, inclua `/api/auth/callback/google` na lista de redirecionamentos permitidos para cada origem do app. Para desenvolvimento, use `http://127.0.0.1:4317` ou `http://localhost:4317`. [URLs de redirecionamento](https://supabase.com/docs/guides/auth/redirect-urls)

No primeiro login com Google, uma conta sem vínculo de equipe recebe sua própria agência e abre o painel com zero subcontas. Para acessar a agência original e suas subcontas existentes, configure `GO_AGENCY_OWNER_ID` com o UUID da conta confirmada do proprietário em **Authentication → Users** e reinicie o servidor. Para vincular um novo membro a uma agência, cadastre seu e-mail confirmado em **Configurações → Membros da equipe** antes do primeiro login no graao. O membro recebe as permissões e subcontas definidas nesse cadastro.

Para desenvolver apenas com SQLite, é possível iniciar em loopback com `GO_DEV_NO_AUTH=1` e sem as variáveis Supabase. Esse modo local não é usado na Vercel.

## Identidade visual e movimento

A plataforma se chama **graao**. A camada visual fica em dois arquivos carregados depois de todos os outros, sem alterar a estrutura das telas:

- `ui/graao.css` define o pink `#FF00BB` como cor principal do graao, com superfícies neutras e tons de pink para estados e destaques. Também define as curvas de animação do microkit e carrega a fonte Plus Jakarta Sans de `ui/fonts/`.
- `ui/graao.js`: versões em JavaScript puro dos componentes do [microkit.co](https://microkit.co) (MIT). Inclui a pílula que desliza entre as abas, o destaque de hover que desliza entre itens do menu, cartões e opções, a barra de destaque no item ativo do menu, o contador animado nas métricas, a linha deslizante nas subabas de Conversas e a luz que acompanha o cursor nos botões. O campo com halo de foco e a caixa de seleção com mola são só CSS.

O menu lateral vem de `ui/sidebar.js` e é o mesmo na subconta e na agência. Recolhido, vira uma coluna de 64px só com ícones e mostra o nome de cada item num balão ao passar o mouse. Aberto, ocupa 248px e mostra o cartão do workspace, a busca (Ctrl K), as ações rápidas e os módulos em grupos com título. A largura muda com animação. No celular, o menu aberto fica sobre a página.

As telas são redesenhadas com `innerHTML`, então os indicadores guardam a última posição e deslizam a partir dela a cada nova renderização. A entrada escalonada da página só acontece quando a tela muda, e não ao trocar de aba. Com `prefers-reduced-motion`, as animações são desativadas. Workspaces criados antes da mudança de nome ainda guardam "GO Workspace" e `#1570ef`; a interface exibe esses valores como graao e rosa `#ff00bb`.

## Visão da agência

Com um login de agência, abra a **Visão da agência** no seletor de workspaces ou no rodapé da barra lateral. O endereço local é <http://127.0.0.1:4317/app#agency/dashboard>. Se o proprietário já tiver um workspace pessoal, ele continua disponível no seletor. O painel da agência lista as subcontas compartilhadas.

| Área | O que funciona localmente |
| --- | --- |
| Agency Dashboard | Receita mensal pelos planos SaaS, subcontas ativas, pausadas e encerradas, novas no mês, tabela de preços de revenda, contatos, oportunidades, execuções, carteira, crescimento em 6 meses e checklist de configuração |
| Sub-Accounts | Criação com snapshot e plano, busca, filtro por status, seleção em massa (status e snapshot), edição de endereço, telefone e site, troca para a subconta com registro do último acesso |
| Account Snapshots | Criar a partir de uma subconta escolhendo os tipos de recurso, atualizar a partir da origem (com versão), carregar em várias subcontas mantendo ou sobrescrevendo itens de mesmo nome, compartilhar por código, importar, renomear, excluir e histórico de cargas. Contatos, conversas e pagamentos nunca são copiados. Páginas e workflows chegam como rascunho |
| Reselling | Preço ao cliente por produto (não pode ficar abaixo do custo), lucro, liberação por subconta, planos SaaS e resumo por subconta |
| Prospecção | Lista de prospects em cartões, busca e cadastro, categorias, auditoria, compartilhamento, widgets, Analytics e envio para o CRM das subcontas |
| Add-Ons, Affiliate Portal | Pedidos de add-on (sem cobrança). Aceite dos termos em quatro passos, link de indicação, indicações, comissão de 40%, dados e histórico de pagamento |
| Partners, Ideas, University, SaaS Education | Diretório de parceiros. Quadro de ideias com votos, status e comentários. Trilhas de aulas com progresso |
| Mobile App, Desktop App | Nome, cores, título de login, ordem e visibilidade dos módulos e módulos por URL, com prévia ao vivo |
| SaaS Configurator | Tela de apresentação até ativar o modo SaaS. Depois: visão geral com MRR das subcontas SaaS e checklist, markup da carteira por produto (de 1× a 10×) e modo SaaS por subconta |
| App Marketplace | Todos os apps (disponibilidade por subconta e instalação), apps instalados na agência ou nas subcontas, revenda com custo, preço e lucro por app e ganhos (receita − custo = lucro) por app e por subconta |
| Settings | 21 abas, como no original: perfil, dados da empresa, cor primária compartilhada entre a agência e as subcontas e logotipo White Label para as subcontas, usuários com papéis, acesso por subconta e permissões por módulo, plano e carteira, construtor de workflow padrão e por subconta, integração de telefone (Number Intelligence), serviços de e-mail (domínio dedicado e subcontas que o usam), e-mails do sistema, avisos para subcontas, recursos premium de workflow, modelos de IA externos e compra de domínios (cada um com recurso e rebilling por subconta), integrações privadas, afiliados (link e Pixel do Facebook), links de menu, AbacatePay, chaves de API, compliance, Labs, log de auditoria com CSV e uso de mídia |

**Usuários e permissões.** Em **Settings → Users**, **Act as** faz a aplicação passar a agir como aquele usuário (cabeçalho `X-Go-User`). O servidor bloqueia subcontas fora do acesso, módulos sem permissão, a visão da agência para usuários de conta e as configurações da agência para o papel Agency User. Isso não é autenticação: qualquer pessoa com acesso ao endereço local pode escolher o usuário. O log de auditoria registra ações da agência e gravações feitas nas subcontas.

**API pública.** Crie uma chave em **Settings → API Keys**. Ela aparece uma única vez e é guardada só como hash SHA-256. As integrações privadas aceitam apenas os escopos escolhidos.

```
GET  /api/v1/subaccounts
GET  /api/v1/subaccounts/{id}/contacts
POST /api/v1/subaccounts/{id}/contacts
Authorization: Bearer <chave>
```

**Fica de fora ou só registrado:** carteira, markups, revenda de apps e add-ons (registros manuais; a cobrança real dos planos, faturas e pedidos passa pelo AbacatePay), verificação de DNS do domínio de e-mail dedicado, as abas AI Agents, Support Tickets e Templates do App Marketplace (conteúdo de terceiros), 2FA, envio dos e-mails configuráveis da agência, publicação dos apps mobile e desktop, a auditoria remota do Prospecting (as notas são digitadas) e a loja de produtos da marca. Links de menu com "Inside the app" abrem dentro de um iframe. Sites que proíbem incorporação mostram o link para nova aba.

## Pagamentos (AbacatePay)

O AbacatePay é o meio de pagamento da plataforma, e o Stripe foi removido. O módulo `abacatepay.mjs` usa a API v2 (`https://api.abacatepay.com/v2`) e existe em dois níveis:

- **Agência** (*Configurações → AbacatePay*): a agência conecta a sua conta e, em *Configurador SaaS → Subcontas SaaS*, gera para cada subconta uma assinatura mensal do plano atribuído, por Pix ou cartão. O produto é criado com `cycle: MONTHLY` e com os dias de teste do plano. O link de pagamento vai para o cliente, e os eventos `subscription.*` atualizam o status da assinatura (aguardando, em teste, ativa ou cancelada) e o histórico de pagamentos. O botão *Cancelar* chama `/subscriptions/cancel`.
- **Subconta** (*Configurações → AbacatePay*): cada subconta conecta a própria conta, para que o dinheiro dos seus clientes caia nela. Em *Pagamentos → Faturas*, o botão **Cobrar** cria um checkout hospedado (Pix ou cartão) e copia o link. O `checkout.completed` marca a fatura como paga e registra a transação uma única vez, com a forma de pagamento real. O `checkout.refunded` marca a transação como reembolsada. Uma loja com a forma de pagamento *Pix ou cartão online* manda o comprador para essa página logo após o pedido, e o pagamento muda o pedido para *Pago*.

As chaves de API são guardadas criptografadas com `GO_STORAGE_KEY` (AES-256-GCM) na linha `abacatepay-<agência>` e nunca voltam para o navegador. Ao conectar, o servidor valida a chave em `GET /stores/get`. Se o app estiver num endereço HTTPS público, ele também cadastra o webhook `/api/abacatepay/webhook/<agência>/<agency|subconta>`. Fora disso, a tela mostra a URL e o secret para o cadastro manual em app.abacatepay.com/webhooks. Cada entrega precisa trazer o secret da conexão (`?webhookSecret=` ou `X-Webhook-Secret`) e a assinatura HMAC-SHA256 do corpo bruto (`X-Webhook-Signature`). Entregas repetidas são ignoradas pelo `id`. Para testar sem dinheiro real, use uma chave do modo teste. O teste `test/abacatepay.test.mjs` cobre o fluxo inteiro com um AbacatePay simulado.

## Prospecção

Acesse `/prospecting` para abrir a aba da agência. Cadastros, categorias, agentes de busca, relatórios e widgets usam o armazenamento da agência no Supabase. A migração para uma subconta cria ou reutiliza o contato e pode criar uma oportunidade. Relatórios compartilhados omitem notas e dados do ponto de contato.

Com a variável de servidor `PROSPECTING_GOOGLE_PLACES_KEY` e as APIs Places (New) e Geocoding habilitadas, a busca traz resultados do Google Maps. O cadastro guarda o ID do local e permite adicionar dados comerciais próprios. Sem a chave, a busca usa o OpenStreetMap, sem custo e sem chave (prospecting-osm.mjs): o Nominatim localiza a região e busca por categoria, o Photon busca pelo nome com sinônimos do nicho (ex.: dentista, odonto, odontologia) e os resultados aparecem num mapa dentro da aba. Ao salvar, o servidor relê os dados no OpenStreetMap (licença ODbL, que permite guardar com atribuição) e grava nome, endereço, telefone e site no prospect. A cobertura de telefone e site no OpenStreetMap é menor que a do Google. As instâncias públicas atendem uso moderado; para volume alto, defina `PROSPECTING_NOMINATIM_URL` e `PROSPECTING_PHOTON_URL` com servidores próprios. O Prospect AI guarda os critérios e executa a busca sob demanda. A auditoria é automática (prospect-audit.mjs): analisa a saúde do site com os pesos do relatório do HighLevel — velocidade 40% (Google PageSpeed, celular 70% e computador 30%), SEO on-page 20%, segurança 20% (HTTPS, certificado, redirecionamento e HSTS) e LGPD/consentimento 20% —, detecta ferramentas de marketing (Analytics, Tag Manager, Meta Pixel, Google Ads, chat, WhatsApp, CMS) e redes sociais linkadas no site, e confere o perfil no Google (telefone, site, horário, fotos, avaliações). Os dados do Google são lidos na hora e só os resultados das verificações ficam salvos. Notas manuais de 0 a 10 substituem a nota automática do pilar. Defina `PROSPECTING_PAGESPEED_KEY` para a nota de velocidade; sem ela o graao estima pelo tempo de resposta. O acesso aos sites bloqueia endereços privados e portas diferentes de 80/443.

Para abrir o mapa dentro da aba, habilite a Maps Embed API e defina `PROSPECTING_GOOGLE_MAPS_EMBED_KEY`. Use outra chave, restrita à Maps Embed API e às origens em que o graao é acessado. A chave Places permanece no servidor.

## Fluxo integrado

1. Em **Automações**, crie um workflow com o gatilho **Form submitted**. Adicione, por exemplo, **Add tag**, **Create opportunity** e **Create task**. Marque **Publish workflow**.
2. Em **Sites → Forms**, crie um formulário, marque **Publish locally** e abra o link mostrado no cartão. Preencha o formulário com dados de teste.
3. O resultado aparece em **Contatos**, **Leads** e **Sites → Submissions**. Veja o detalhe da execução em **Automações → Execution Logs**.

Os outros gatilhos disponíveis são criação de contato, mudança de etapa da oportunidade e novo agendamento. As ações rodam na mesma transação do evento. **Log message** grava uma nota local na conversa.

## Cobertura

| Área | O que funciona localmente |
| --- | --- |
| Pergunte à IA / Launchpad | Escolha do tipo de negócio e objetivo, recomendação de módulo e respostas baseadas nas métricas do workspace |
| Dashboard e Relatórios | Grade com os widgets da referência, seleção de período e pipeline, comparação para status, valores e conversão, filtros de tarefas e ações manuais, notas, editor de layout, painéis adicionais, histórico de versões e relatórios independentes com CSV |
| Contatos e tarefas | Cadastro, edição, busca, filtros por etiqueta, notas, importação CSV com histórico e conclusão de tarefas. Ações em massa (adicionar ou remover tag, excluir) com registro de andamento, campos personalizados nos formulários e empresas vinculadas pelo campo Empresa |
| Conversas | Inbox com histórico, leitura e favoritos. Fila de ligações e SMS manuais com filtros e registro de resultado. Snippets de texto e e-mail em pastas, campos de personalização e inserção no compositor. Links rastreáveis, análise de cliques e workflow por clique identificado. Metas de SLA por canal, alertas e análise do tempo de resposta |
| Calendários | Visão mensal, cadastro e edição, cancelamento, fuso horário e prevenção de conflitos |
| Oportunidades | Vários pipelines em colunas ou lista, cadastro e edição de etapas, origem e responsável, movimentação por arraste ou seletor e data da última alteração de status. Data prevista de fechamento, probabilidade por oportunidade ou etapa, previsão (receita potencial, esperada e ganha, linha do tempo, risco por adiamento ou atraso, dados faltantes) e ações em massa (mover etapa, mudar status, excluir). Filtros avançados com grupos E/OU e operadores por tipo (texto, número, lista, datas relativas no fuso do workspace), listas salvas, cartões com ordem de campos, smart tags e ações rápidas com contagem. Pipelines em tabela (reordenar, duplicar, excluir vazios), etapas com cor, probabilidade decimal e ordem, probabilidade só por etapa opcional, smart tags por regra (prontas ou próprias, por pipeline ou em todos). Previsão com resumo (risco configurável, dados faltantes, vencidas, agrupamento por status, responsável ou mês) e linha do tempo por mês ou trimestre com arrastar para mudar a data |
| Pagamentos | Faturas, produtos de pagamento único ou recorrente, assinaturas, links de pagamento, transações (a fatura marcada como paga gera a transação uma vez) e cupons percentuais ou de valor fixo com período e limite. Tudo como registro manual, sem gateway |
| Marketing | Rascunhos e planejamento de conteúdo para redes sociais e e-mail |
| Automações | Construtor visual em árvore com vários gatilhos (cada um com filtros), Se / Senão, Roteador, Aguardar (tempo, data ou evento), Evento de meta, Ir para etapa, Adicionar/Remover de fluxo, matemática, formatação de texto e webhooks de entrada e saída. Cerca de 30 gatilhos nativos (contato, tags, DND, aniversários, datas, formulários, pesquisas, quizzes, chat, webinar, agendamentos, oportunidades, faturas, pedidos, avaliações, agendador) e 30 ações. Execução pelo agendador a cada minuto, histórico por etapa e pausa em ações manuais |
| Sites | Funis e sites de várias páginas (em branco, com IA ou por modelo), com o editor visual, de código e por IA do antigo AI Studio, etapas com caminho e ordem, edição com IA, SEO, estatísticas de visitas e envios, formulários e submissões |
| Assinaturas | Cadastro de cursos com uma aula publicada por curso e visualização local |
| Mídia | Upload e download de imagens e PDFs |
| Reputação | Registro de avaliações, respostas locais e cálculo da nota média |
| Editor de páginas (em Sites) | Geração de páginas HTML, edição visual e de código, revisão por IA, histórico de versões, publicação com formulário ligado ao CRM e exportação HTML. Antes era o menu AI Studio; agora fica em Sites |
| Agentes de IA | Estúdio de agentes por subconta: criação por descrição ou por modelo, editor com gatilhos, subagentes, recursos, conhecimento e instruções, construtor por chat, conversa de teste, atividade, memória, pastas e publicação de versões |
| Marketplace e Configurações | Catálogo indicativo de provedores, perfil, moeda, fuso e workspaces locais. Configurações com usuários com acesso, campos personalizados (contato, oportunidade, empresa; chave `{{contact.x}}`), valores personalizados (`{{custom_values.x}}`), tags (renomear atualiza os contatos), objetos, histórico de importação e log de auditoria do workspace |

O catálogo ainda é informativo. Cobrança, mensageria e telefonia externas, publicação social, sincronização de calendários, hospedagem pública e permissões de equipe continuam pendentes. Os widgets de Google Analytics, Google Business Profile, Google Ads, Meta Ads e entregabilidade de e-mail exibem o estado da integração. O Studio exporta protótipos HTML editáveis. Os modelos de loja, chat e agenda representam a estrutura visual desses produtos, com os serviços de checkout, mensagens em tempo real e agendamento ainda pendentes.

## Dashboard e AI Studio

- O Dashboard usa a última mudança de status como data padrão dos widgets de oportunidades. O menu de cada widget permite usar criação ou atualização. Mover uma oportunidade entre etapas preserva a data do status. A taxa de conversão divide as oportunidades ganhas pelo total filtrado. [Datas dos widgets](https://help.gohighlevel.com/support/solutions/articles/155000008109-opportunities-widgets-in-dashboards-reports) · [Funnel e distribuição](https://help.gohighlevel.com/support/solutions/articles/155000001455-how-funnels-and-stage-distribution-widgets-work)
- Em **Editar painel**, a biblioteca à esquerda reúne 88 widgets prontos em 12 categorias (contatos, agendamentos, oportunidades, conversas, pagamentos, campanhas, Social Planner, reputação, formulários, tarefas, integrações e geral), com busca e recomendados. Há widgets de número, de distribuição por grupo e de evolução no tempo (por dia, semana ou mês, conforme o período), todos calculados com os dados do workspace. A aba **Elementos** adiciona nota adesiva, título, caixa de texto, imagem e conteúdo incorporado (só endereços https). A aba **Temas** troca a cor dos gráficos do painel entre 9 opções. Cada widget pode ser movido, duplicado, removido e redimensionado. **Send as report** guarda uma cópia das métricas filtradas em **Reporting → Dashboard reports**. Os períodos e o painel selecionado ficam no navegador. As versões, notas e relatórios ficam no workspace.
- O período tem 21 opções (de hoje e amanhã até trimestres, ano que vem e "até hoje") e compara com o período anterior ou com o mesmo período do ano anterior. Em **Mais ações** ficam duplicar, definir como padrão, fuso horário do painel, exportar e importar modelo (JSON), histórico de versões e excluir. Ficam de fora em relação ao HighLevel: métricas personalizadas, duplicar para outra subconta, controle de acesso por painel e insights de IA por widget.
- Em **Visão da agência → Configurações → OpenAI**, conecte a chave de API do seu projeto. Cada usuário usa sua própria chave, criptografada no servidor com uma chave derivada de `GO_STORAGE_KEY`. A configuração permite substituir ou desconectar a chave. Sem uma conexão, o AI Studio continua criando páginas com modelos locais.
- Em **Sites → Funis** ou **Sites → Sites**, use **Construir com IA** e descreva o site para criar as páginas com IA e formulário de leads. Ao informar um site de referência, o servidor usa os títulos e a ordem das seções públicas como referência de layout. Endereços locais e de rede privada são recusados.
- O **editor** tem páginas à esquerda, a prévia no centro e um painel com **AI**, **Versions** e **Publish**:
  - **Visual edit:** clique num elemento para selecioná-lo e dê duplo clique num texto para editá-lo. **Save changes** grava a página.
  - **Code:** edita o HTML da página. Scripts, `<iframe>`, eventos `on…` e links `javascript:` são removidos ao salvar.
  - **AI:** descreva uma mudança; com um elemento selecionado, a IA altera só ele. O pedido e o HTML da página vão para a API da OpenAI. Uma geração ou revisão leva de 1 a 3 minutos.
  - **Add page:** cria outra página, escrita pela IA no estilo da Home ou a partir do modelo local. Os links entre páginas usam `page:slug` no editor e viram endereços reais na publicação.
  - **Versions:** guarda as 12 últimas versões (criação, edições, revisões, páginas) e permite restaurar qualquer uma.
  - **Publish:** publica em `http://127.0.0.1:4317/s/{workspace}/{projeto}` e cria em **Sites → Forms** um formulário que recebe os leads. Cada envio vira contato e dispara workflows com o gatilho **Form submitted**. O painel avisa quando há mudanças não publicadas.
- As páginas são servidas, na prévia e publicadas, com uma política de segurança que bloqueia qualquer script. Cada site fica numa linha própria do armazenamento (`studio-{projeto}`), fora do estado do workspace. Projetos antigos, feitos por seções, abrem como uma página montada a partir delas.
- **Fora do escopo local:** domínio próprio (exige um servidor público) e sincronização com o GitHub.

## Construtor com IA (estilo vibe)

Ao escolher **Construir com IA** em **Sites**, o graao abre o construtor (`#sites/build`), com a conversa à esquerda e a prévia à direita:

1. **Direção visual.** Antes de construir, três perguntas: paleta (4 opções com as cores), par de fontes do Google Fonts e estrutura da página (tela dividida, seções empilhadas, centralizado ou conteúdo com coluna). Cada pergunta aceita uma resposta escrita. Há revisão das respostas e **Pular todas**. Com a OpenAI conectada, a IA propõe paletas e fontes para o negócio descrito.
2. **Plano.** A IA (ou o gerador local) define as páginas em ordem. Um funil sempre termina numa página de obrigado.
3. **Construção.** Uma lista de tarefas acompanha cada página, que é criada na ordem do plano e aparece na prévia. No fim, um resumo lista as rotas criadas, com links para o editor e para as etapas em Sites.

Sem a chave da OpenAI, o construtor funciona com o gerador local: as páginas seguem a paleta, as fontes e a estrutura escolhidas e trazem marcadores `[[...]]` para os textos reais.

No editor, a aba **IA** guarda a conversa do projeto. Cada alteração feita pela IA tem **Desfazer**, que volta o site para a versão anterior a ela (as mudanças posteriores também saem).

## Funis e sites

Em **Sites → Funis** e **Sites → Sites**, cada item é um projeto com várias páginas. **Abrir editor** leva ao editor (`#sites/editor/<id>`), com a edição visual, de código e por IA, as versões e a publicação.

O antigo menu **AI Studio** foi unificado em Sites: ele saiu do menu lateral, links antigos `#studio/...` redirecionam para Sites, e a permissão “AI Studio” virou parte de “Sites e Funis” (usuários e planos que tinham AI Studio continuam com acesso, agora por Sites).

- **Criar.** **Novo funil** e **Construir com IA** abrem três caminhos: em branco (só o nome), com IA (descrição e site de referência opcional, usando a chave da OpenAI conectada) ou a partir de um dos modelos do AI Studio. Um funil novo já nasce com uma página de captura e uma página de obrigado.
- **Etapas** (`#sites/funnel/<id>`). Lista as etapas em ordem, com prévia, nome e caminho de cada uma. Dá para reordenar (a primeira etapa fica sempre no endereço principal), mudar o caminho (os links `page:` das outras páginas acompanham), duplicar, excluir, adicionar uma etapa em branco ou criada pela IA no estilo da primeira e pedir mudanças à IA. **Editar página** abre a etapa no editor do AI Studio.
- **Comportamento de funil.** No funil publicado, quem envia o formulário de uma etapa vai para a etapa seguinte. Na última etapa, e em sites, o visitante vê a confirmação na própria página. Cada envio cria ou atualiza o contato e dispara os workflows de **Form submitted**.
- **Estatísticas.** Visitas e envios de formulário por etapa, taxa de conversão e total, com botão para zerar. A contagem acontece nas páginas publicadas e não separa visitantes únicos.
- **SEO.** Título e descrição por página, com geração por IA. Valem no site publicado depois de publicar de novo.
- **Configurações.** Nome, tipo (funil ou site), endereço publicado, formulário que recebe os leads e exclusão.

**Fica de fora em relação ao HighLevel:** domínio próprio, abas de vendas, segurança e eventos, importação de ClickFunnels, pastas e visitantes únicos. As páginas simples criadas antes deste construtor continuam listadas em **Páginas simples**.

## Formulários

Em **Sites → Formulários** há três abas: **Todos os formulários**, **Análises** e **Envios**. Um formulário novo começa em branco ou de um modelo (contato, pedido de orçamento, agendar consultoria, pesquisa de satisfação, newsletter) e abre no construtor (`#sites/form/<id>`):

- **Editar.** Paleta à esquerda com dados pessoais, endereço, texto, escolhas (lista, seleção múltipla, caixas, opção única), avaliação de 1 a 5, data, número, valor em R$, bloco de texto, termos e um campo oculto de origem. A aba **Campos do contato** traz os campos personalizados de contato, e a resposta vai para o campo do contato. Clique para adicionar ou arraste para a posição; arraste os campos para reordenar. À direita ficam as propriedades do campo: rótulo, placeholder, opções, chave de consulta, texto de ajuda, largura inteira ou metade, obrigatório e oculto. Sem campo selecionado, o painel edita nome, descrição, texto do botão e cor.
- **Configurações.** Ao enviar, mostrar uma mensagem ou redirecionar para um endereço; tags para adicionar ao contato; período de respostas com mensagem para quando estiver fechado.
- **Integrar.** Link direto (`/form/<workspace>/<id>`) e código para incorporar em qualquer site, com altura automática. Parâmetros no link preenchem campos pela chave, por exemplo `?email=ana@exemplo.com`.
- **Envios e Análises.** Respostas completas de cada envio, busca e exportação em CSV; visitas, envios e conversão em 7, 30 ou 90 dias.

Cada envio cria o contato ou atualiza o existente (pelo e-mail ou telefone) e dispara os fluxos com o gatilho **Formulário enviado**. O servidor valida cada resposta pelo tipo do campo e devolve a página com os erros. Ainda não existem upload de arquivo, assinatura, pagamento no formulário nem notificação por e-mail.

## Pesquisas e questionários

**Sites → Pesquisas** e **Sites → Questionários** usam o mesmo construtor dos formulários, com as abas de lista, análises e envios de cada um.

- **Etapas.** O elemento **Nova etapa** divide a pesquisa em telas, com barra de progresso e os botões Voltar e Próximo. Com **Uma pergunta por tela**, cada pergunta vira uma tela. Os campos obrigatórios são conferidos antes de avançar.
- **Desvios.** Em perguntas de opção única ou lista, cada resposta pode levar à próxima etapa, a uma etapa mais à frente ou direto ao envio. O servidor refaz o mesmo caminho: etapas puladas não são obrigatórias e as respostas delas não ficam guardadas.
- **Pontuação (questionários).** Cada resposta de escolha vale pontos e a pergunta pode ter uma categoria. O resultado é a soma sobre o máximo possível, em porcentagem. Na aba **Pontuação** ficam as faixas (por padrão Baixo, Médio e Alto), cada uma com mensagem, botão com link e tag para o contato.
- **Resultado.** Ao enviar um questionário, o visitante vê a porcentagem, a faixa, a mensagem e as barras por categoria. O envio guarda o resultado, o contato recebe a tag da faixa e a aba Análises mostra quantas pessoas caíram em cada faixa.

Modelos: pesquisa de satisfação com desvio e onboarding de cliente; diagnóstico de marketing e qualificação de lead. Sem JavaScript, todas as etapas aparecem juntas e o envio continua funcionando.

## Chat do site

Em **Sites → Chat** você cria bolhas de chat para colocar em qualquer site. O editor tem prévia ao vivo e três abas: **Configurar** (tipo, cor, posição, título, nome de quem responde, convite da bolha com atraso, boas-vindas, aviso legal, campos de nome, e-mail e telefone, tags), **Instalar** (código e página de teste) e **Insights** (conversas iniciadas, mensagens recebidas, conversas respondidas e a página de origem).

- **Chat ao vivo.** O visitante preenche os dados e escreve. O graao cria ou encontra o contato pelo e-mail ou telefone, e a mensagem chega em **Conversas** no canal **Chat ao vivo**. Responder nesse canal entrega a mensagem no chat do visitante (o painel consulta novas mensagens a cada 4 segundos com a aba visível).
- **SMS e e-mail.** Coleta os dados e a primeira mensagem, mostra o agradecimento e registra a conversa como SMS (com telefone) ou e-mail.

Instalação: `<script src="https://<seu-graao>/chat/<workspace>/<id>/widget.js" async></script>`. O script cria a bolha num shadow root e abre o painel num iframe servido pelo graao, então o CSS do site não interfere. O visitante guarda só um token aleatório; o servidor guarda apenas o hash dele e devolve somente as mensagens do chat daquela sessão. Facebook, Instagram, WhatsApp e IA de voz dentro do widget dependem de integrações externas e não foram incluídos.

## Blogs

Em **Sites → Blogs** ficam os blogs do workspace, com o total de artigos, os blogs publicados e as visitas da semana. **Autores e categorias** são compartilhados por todos os blogs, como no HighLevel.

- **Blog.** Lista de artigos com busca e filtro por status (Publicado, Agendado, Rascunho) e visitas de cada um. Em **Configurações**: nome, descrição, cor, artigos por página, feed RSS e SEO da página inicial.
- **Artigo.** Editor em Markdown com barra de formatação (títulos, negrito, itálico, link, lista, citação, imagem) e aba de pré-visualização. Ao lado: publicar agora ou agendar por data, caminho do endereço, resumo, imagem de capa, autor, categorias e SEO com contador de caracteres e prévia do resultado no Google.
- **IA.** **Escrever com IA** recebe tema, título, palavras-chave, tom e tamanho e cria o rascunho completo (título, resumo, texto e SEO) com a OpenAI conectada. Sem a chave, cria um roteiro com marcadores `[[...]]`. **Gerar com IA** no painel de SEO escreve o título e a descrição a partir do texto.
- **Páginas públicas.** `/b/<workspace>/<blog>` mostra os artigos em cartões, com filtro por categoria (`?categoria=`) e páginas; `/b/<workspace>/<blog>/<caminho>` mostra o artigo com título e descrição de SEO, Open Graph, link canônico, autor e “Leia também”; `/b/<workspace>/<blog>/rss.xml` é o feed. Rascunhos e agendados ficam fora do ar até a data, e a equipe vê a prévia com `?preview=1`. O texto é convertido de Markdown com todo HTML escapado e só links `http(s)`.

## Lojas

Em **Sites → Lojas** você monta lojas com os produtos de pagamento único de **Pagamentos → Produtos**. Cada loja tem uma lista de configuração em seis passos (produtos, pagamento, frete, impostos, personalizar, publicar) e três abas:

- **Produtos.** Adiciona produtos de Pagamentos ou cria um novo ali mesmo. Para cada item: categoria, estoque (vazio = sem controle), foto `https://` e opção de ocultar da vitrine. Nome, preço e descrição continuam vindo de Pagamentos.
- **Pedidos.** Pedidos com filtro por status, itens, endereço ou retirada, totais e andamento. **Pago** fecha a fatura do pedido e registra a transação; **Enviado / entregue** guarda o código de rastreio; **Cancelado** devolve o estoque e anula a fatura (um pedido cancelado não reabre).
- **Configurações.** Frete (sem entrega, valor fixo ou fixo com frete grátis acima de um valor), retirada na loja, imposto em %, forma de pagamento com instruções (Pix, transferência, dinheiro na retirada), telefone obrigatório, tags do contato e mensagem depois do pedido.

A vitrine pública fica em `/loja/<workspace>/<loja>`, com filtro por categoria, página de produto (`/p/<caminho>`) e carrinho (`/carrinho`). O carrinho fica no navegador do cliente, mas preço, estoque, cupom (os mesmos cupons de Pagamentos), frete, imposto e total são sempre recalculados no servidor. Ao finalizar, o graao cria ou encontra o contato, cria o pedido e uma **fatura em aberto** em Pagamentos, baixa o estoque e conta o uso do cupom. A cobrança acontece fora do graao: o cliente vê as instruções de pagamento e a equipe marca o pedido como pago. Ainda não existem cobrança por cartão, cálculo de frete por CEP nem lembrete de carrinho abandonado.

## Webinars

Em **Sites → Webinars** cada webinar tem sessões (data, hora e duração), link da transmissão (Meet, Zoom, YouTube…), link da gravação, tags para o contato e lembretes.

- **Inscrição** em `/w/<workspace>/<webinar>`: escolha da sessão (só as futuras), nome, e-mail e WhatsApp. Cria ou encontra o contato e leva à **sala** (`/sala?t=…`), um link pessoal com contagem regressiva, botão **Adicionar à agenda** (arquivo `.ics` com alarme) e, a partir do horário de abertura (por padrão 15 minutos antes), o botão **Entrar no webinar**. Abrir a sala nesse horário marca presença. Depois do fim, a sala mostra a gravação.
- **Lembretes.** Até seis, por exemplo 1 dia, 1 hora e 10 minutos antes, por e-mail, SMS ou WhatsApp, com `{{nome}}`, `{{webinar}}`, `{{data}}` e `{{link}}`. O agendador do graao (o mesmo que publica as redes sociais, a cada minuto) registra cada lembrete na conversa do inscrito em **Conversas** no horário certo, uma vez só. Lembretes de WhatsApp também são enviados quando o WhatsApp da subconta está conectado; e-mail e SMS ficam registrados para envio pelo seu provedor.
- **Inscritos.** Sessão, data de inscrição, lembretes registrados, presença e exportação em CSV.

## QR Codes

Em **Sites → QR Codes** você cria QR Codes para site, formulário, loja, blog, webinar, WhatsApp (com mensagem pronta), ligação, SMS ou e-mail, com cor do código e do fundo e download em PNG ou SVG. Todo código é dinâmico: aponta para `/q/<workspace>/<id>`, que conta a leitura e redireciona, então o destino pode mudar depois de impresso. O painel mostra leituras totais, únicas por dia, leituras por dia e dispositivo; quem lê é guardado só como hash, nunca o endereço ou o navegador. Um código pausado (ou que aponta para algo não publicado) mostra um aviso no lugar do destino. O QR é gerado pela própria graao (`ui/qr.js`, modo byte, correção M, versões 1 a 10), sem biblioteca externa.

## Análises de Sites

**Sites → Análises** junta, em 7, 30 ou 90 dias: visitas (formulários, artigos de blog e leituras de QR Code), opt-ins (envios de formulários, pesquisas e questionários, inscrições em webinars e chats iniciados), vendas pagas das lojas e a conversão dos formulários, com visitas por dia, um quadro por origem e os itens mais acessados. Funis e sites do AI Studio mantêm as estatísticas próprias em cada funil. Navegador, país e origem do tráfego ainda não são coletados.

## Estúdio de agentes

Em **Agentes de IA** (`#ai-agents`), o estúdio tem três áreas: a lista de agentes com busca, filtro por pasta e ordenação, a área central e o painel do agente selecionado.

- **Criar.** Descreva o que o agente deve fazer ou escolha um dos 8 modelos próprios (atendimento, qualificação de leads, pedido de avaliação, resumo de oportunidade, confirmação de agendamento, posts para redes sociais, monitor de concorrentes e relatório semanal). Com a OpenAI conectada, o construtor monta a configuração a partir da descrição. Sem ela, a descrição vira o rascunho das instruções.
- **Editar** (`#ai-agents/edit/<id>`). À direita ficam o ícone, o nome, a descrição, os gatilhos (14 tipos em 8 categorias, com busca), até 4 subagentes, os recursos (pesquisa na web, memória e pedir aprovação), até 5 fontes de conhecimento e as instruções. O rascunho é salvo automaticamente. À esquerda, o chat do construtor aplica pedidos como "adicione um gatilho para formulários enviados" e reescreve a configuração sem tocar nas fontes de conhecimento.
- **Testar e acompanhar** (`#ai-agents/agent/<id>`). A conversa de teste usa o rascunho ou a versão publicada. O painel mostra o status, o botão Publicar, o menu (editar, mover para pasta, despublicar, excluir) e três abas: Atividade (as últimas 100 conversas de teste da subconta), Aprovações e Memória (fatos sobre as pessoas e procedimentos, usados quando o recurso Memória está ligado).

**Limites desta versão.** Os gatilhos ficam registrados na configuração, mas o agente só roda no chat do estúdio: eventos do CRM, programações, workflows, API e webhooks ainda não disparam execuções. Os subagentes entram nas instruções do agente principal, e não como chamadas separadas. Pedir aprovação é uma regra das instruções; a aba Aprovações não tem fila própria. Snapshots copiam a configuração dos agentes, sem versões publicadas, memória e atividade.

O chat de teste e o construtor usam a chave da OpenAI conectada pelo usuário que os executa. Mensagens, instruções, memória e fontes são enviadas à API da OpenAI. Com Pesquisa na web ligada, a resposta pode usar a ferramenta de busca da OpenAI. Use dados de exemplo no chat.

## Conversas

- Em **Automações**, adicione **Manual Call** ou **Manual SMS** a um workflow publicado. Quando o gatilho rodar, o contato espera em **Conversas → Manual Actions** até a conclusão ou o salto da etapa.
- Crie um snippet em **Conversas → Snippets** e insira-o no compositor de uma conversa. Os campos como `{{contact.first_name}}` são preenchidos para o contato ativo. Os e-mails usam assunto e corpo em texto simples.
- **Webhook de entrada.** Adicione o gatilho **Webhook de entrada**, salve e copie o endereço exibido no painel (`POST /hooks/<subconta>/<fluxo>/<gatilho>?key=<segredo>`, corpo JSON). Com `email` ou `phone`, o contato é encontrado ou criado; os outros campos ficam disponíveis como `{{trigger.campo}}`.
- **Esperas e gatilhos agendados.** O agendador verifica a cada minuto as execuções em **Aguardar** e os gatilhos de aniversário, data personalizada, agendador e oportunidade parada. Com Supabase, chame `/api/social/cron` a cada minuto: o agendador do processo fica desligado, a menos que `GO_LOCAL_SCHEDULER=1` esteja definido.
- **Editor da etapa (inspirado no construtor do FiqOn).** Ao abrir uma etapa, o painel **Entrada** lista o que pode ser usado nos campos: dados do contato e campos personalizados, dados do gatilho, variáveis criadas com **Definir variável** (`{{vars.nome}}`), saídas de etapas anteriores (`{{steps.<id>.title}}`, por exemplo o id e o título da oportunidade criada) e as funções do motor de expressões. Um clique insere no campo. Cada etapa pode ter **Erro interrompe o fluxo**. A ação **Filtro** encerra a execução quando a condição não bate.
- **Testar.** O botão **Testar** do construtor roda o rascunho com um contato escolhido sobre uma cópia dos dados (`POST /api/workflow-test`): esperas e ações manuais são puladas, nada é salvo nem enviado. O resultado mostra o caminho seguido, o que aconteceria no CRM, e a **Saída do teste** aparece no painel de cada etapa; os nós percorridos ficam destacados.
- Fluxos criados antes do novo motor (um gatilho e ações em sequência) abrem e rodam no formato novo sem migração manual.
- Crie um link em **Conversas → Trigger Links** e insira-o em uma mensagem de saída. O primeiro clique no link daquela mensagem aciona os workflows correspondentes. A aba **Analyze** conta os cliques, incluindo repetições. Os links da prévia usam a URL local do servidor.
- Ative o acompanhamento em **Conversas → Settings**. Registre um e-mail ou SMS de entrada e uma resposta para verificar o resultado em **Analytics**. As regras de SLA podem considerar apenas respostas manuais, todas as respostas de workflow ou uma lista de workflows.

## Planejador social

Marketing → Planejador social recria o Social Planner do GoHighLevel: conectar redes, escrever uma vez com prévia e limite de caracteres por rede, publicar agora/agendar/rascunho, recorrência, aprovação, calendário (mês/semana, arrastar para reagendar), lista com filtros, categorias com fila evergreen, grupos de hashtags, feeds RSS e agendamento em massa por CSV. Arquivos: `social-model.mjs` (registros e agendador), `social-providers.mjs` (OAuth e publicação), `ui/social.js`, `ui/social-data.js`, `ui/social.css`.

- **Publicações em lote:** carregue o CSV, escolha as contas e revise o resultado de cada linha antes de importar. O Graao oferece modelos básico e avançado com campos de data, texto, mídia, tipo, tags, categoria e primeiro comentário. Linhas sem data entram como rascunhos. O importador aceita CSV de até 1 MB e 300 linhas.
- **Convite para conectar:** em Contas, gere e copie um link válido de 1 hora a 7 dias. O cliente autoriza as novas contas na página do convite sem acessar o workspace. Gerar outro link ou revogar o atual invalida o anterior; o convite não permite editar ou desconectar contas existentes. Para compartilhá-lo, use uma instância do Graao acessível ao cliente.
- **Referência:** o navegador interno mostrou o onboarding sem redes conectadas, o formulário de convite e a etapa inicial da importação do HighLevel. O REA capturou a [referência pública de campos CSV](https://help.gohighlevel.com/support/solutions/articles/155000005411) sob a evidência `ev_caa6f36a970902259cc68c38c287c588a47efcf20ed65ef7c0da7e54c7678042`. No navegador local, um lote com uma linha válida e outra inválida gravou apenas o rascunho válido.

Os tokens das contas ficam cifrados (AES-256-GCM) na linha `social-<subconta>` e nunca vão ao navegador. Chaves por rede (variáveis de ambiente) e URL de retorno a cadastrar em cada app (`<origem>/api/social/callback/<rede>`):

| Rede | Variáveis | Callback |
| --- | --- | --- |
| Facebook + Instagram | `META_APP_ID`, `META_APP_SECRET` (opcional `META_LOGIN_CONFIG_ID`) | `/api/social/callback/facebook` |
| Threads | `THREADS_APP_ID`, `THREADS_APP_SECRET` | `/api/social/callback/threads` |
| LinkedIn | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | `/api/social/callback/linkedin` |
| TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` | `/api/social/callback/tiktok` |
| YouTube e Google Business | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `/api/social/callback/youtube`, `/api/social/callback/gbp` |
| Pinterest | `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET` | `/api/social/callback/pinterest` |
| Bluesky | nenhuma (senha de app do usuário) | — |

Outras: `SOCIAL_TOKEN_KEY` (chave de cifra dos tokens; padrão derivado de `GO_STORAGE_KEY`), `SOCIAL_PUBLIC_URL` (origem pública para mídia e callbacks), `CRON_SECRET`. Com SQLite o servidor publica os posts vencidos a cada minuto; com Supabase (na Vercel ou numa máquina local sem `GO_LOCAL_SCHEDULER=1`), chame `GET /api/social/cron` (com `Authorization: Bearer $CRON_SECRET`) a cada minuto. Imagens do Mídia Drive são servidas em `/m/<subconta>/<arquivo>` para as redes buscarem.

## Evidência e validação

- **Observação direta:** navegador interno, em modo de leitura, para os 18 itens do menu, o primeiro passo do onboarding, a caixa de entrada e a lista de contatos. O segundo passo foi implementado com base na [documentação oficial de onboarding](https://help.gohighlevel.com/support/solutions/articles/155000009084-how-to-select-your-first-action-during-highlevel-onboarding), que descreve a escolha de objetivo e o encaminhamento ao módulo recomendado.
- **REA MCP 6.7.0:** captura da [documentação pública do Launchpad](https://help.gohighlevel.com/support/solutions/articles/155000005436-subaccount-launchpad), evidência `ev_c5a0730befd895fa65d9dd24e0f269e288f8139a6ce0323dab78d8243cca461a`. A aba autenticada do navegador interno não expunha um endpoint CDP de loopback para o REA.
- **REA MCP, app local:** onboarding → contatos → pipeline, evidência `ev_624dab118fd87824917cd4e185fbd3a3b237c99614e31118ff935b708df2193e`. Em uma instância de teste em memória, onboarding → publicar workflow → cadastrar contato → tarefa gerada → registro de execução, evidência `ev_ec236fcb4b55dcb9577e2878fef79105d8142f7d3f73629656911a5a920c7844`.
- **Testes do servidor:** `npm.cmd test` verifica o caminho formulário → contato → oportunidade/tarefa/registro de execução, a separação de workspaces, persistência após reiniciar, rejeição de conflitos de agenda e atomicidade da importação.
- **Dashboard e AI Studio:** o navegador interno mostrou 18 áreas no menu original, 15 widgets padrão no Dashboard e a biblioteca de modelos e projetos do iframe do AI Studio. Todas as 18 rotas principais locais foram abertas para verificar renderização. Os testes no navegador também cobriram o editor, as notas, o relatório salvo e a reabertura de um projeto favorito.
- **Análise estática pelo REA:** os scripts JavaScript locais que implementam as 18 rotas foram analisados sob `ev_9f0f7196a489ec827e175662691ae9f30bb59d50d39fcf2e8ad72e028c579138`. O carregador público da interface original foi analisado sob `ev_b5a3302e36319f9b2e2ab69707682934c84514c7d0b73253888c7ae87b957639`. A análise do bundle público do AI Studio atingiu o limite de execução e reteve módulos sob `ev_5ae62d9d15bc0408e0ad2f53bfd85a0ec338e6185df84615fd3e835691f7ff8b`. O navegador interno oferece inspeção por aba, enquanto o REA exige um endpoint CDP de loopback para inspeção em execução. As evidências acima cobrem o frontend selecionado e os fluxos verificados.

- **Agência, observação direta:** navegador interno, só leitura, no menu da agência original (17 áreas e 21 abas de Settings), em Sub-Accounts, Account Snapshots, Reselling, Add-Ons, Template Library e Affiliate Portal.
- **Agência, segunda passada (navegador interno, só leitura):** os 20 itens do menu original, incluindo SaaS Configurator (`/saas_dashboard`) e App Marketplace (`/integration`), as abas All Apps, Installed Apps, App Reselling e Earnings, e as 21 abas de Settings. O REA não pôde ser usado nesta passada porque nenhum navegador expunha um endpoint CDP de loopback. A passada também corrigiu a função de busca `match`, removida por engano em `b6f2c20`, que impedia Subcontas, Parceiros, Ideias, Templates, Marketplace e Logs de auditoria de abrir.
- **Subconta, fase 1 (navegador interno, só leitura):** os 18 itens do menu da subconta e as abas de Contatos (Bulk Actions, Custom Fields, Companies), Opportunities (Forecast, Bulk Actions), Payments (Subscriptions, Payment Links, Transactions, Coupons) e Settings (Custom Fields, Custom Values, Tags, Objects, Import Data, Audit Logs). O REA não foi usado porque nenhum navegador com a sessão expunha um endpoint CDP de loopback. `test/crm.test.mjs` cobre as regras novas.
- **Agência, REA MCP no app local:** Chrome controlado pelo REA percorreu painel → subcontas → snapshots → revenda → troca para subconta, com 10 de 10 passos concluídos, evidência `ev_b71592eece92893ebbd5486d2a014761b7295ecdd0312dfbd93c44997b59ad3b`. As 36 telas e abas da agência foram abertas no navegador interno sem erro.

### Arquivos principais

- `server.mjs`: servidor local, API, armazenamento e páginas publicadas.
- `model.mjs`: validação, regras de domínio e execução de workflows.
- `workflow-engine.mjs`: motor de automações. Valida o fluxo, compila a árvore de etapas em um grafo quando o contato entra (assim **Ir para etapa** funciona e edições não afetam execuções em andamento), escuta os eventos do CRM, retoma esperas e metas e dispara os gatilhos agendados uma vez por dia. `ui/workflow-data.js` é o catálogo compartilhado com o construtor (`ui/workflow-builder.js`).
- `workflow-delivery.mjs`: envio dos webhooks de saída (apenas `https://`, bloqueia redes internas, limite de 8 s). WhatsApp sai pela conexão da subconta, quando houver.
- `ui/`: telas, navegação e estilos.
- `test/platform.test.mjs`: testes de integração HTTP e SQLite.
- `agency-model.mjs`, `ui/agency-data.js`: regras, catálogos e validação da agência.
- `ui/agency.js`, `ui/agency.css`: telas da agência.
- `test/agency.test.mjs`: snapshots, chaves de API, permissões, revenda, afiliados, avisos e modelos.
- `studio-site.mjs`, `studio-ai.mjs`: páginas, versões, publicação, limpeza do HTML, site de referência e chamadas de IA do AI Studio.
- `test/studio.test.mjs`: HTML limpo, versões, páginas, publicação, leads e site de referência.
