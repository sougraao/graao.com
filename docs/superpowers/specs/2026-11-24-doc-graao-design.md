# Design: central de documentação e suporte da graao (doc.graao.com)

Data: 2026-11-24 · Status: aguardando aprovação

## 1. Intenção

A graao já tem quase tudo o que a GoHighLevel oferece: 10 das 11 fases do painel de paridade estão concluídas (`docs/implementation/painel/progresso.js`). Falta uma central onde a agência aprenda a usar cada ferramenta sozinha, como o portal de suporte da GHL (cerca de 2.700 artigos em 51 categorias) e a documentação da Zaia (zaiadocs.gitbook.io/recursos).

O site fica em `https://doc.graao.com`. Tem a estrutura e o modelo da Zaia: menu lateral por assunto, páginas de seção com cartões, tutoriais passo a passo com print em cada passo e vídeos curtos. A cobertura segue o mapa da GHL. Prints e vídeos ficam no Cloudflare R2.

Regra permanente pedida pelo usuário: **toda ferramenta nova e toda melhoria entram na documentação.**

## 2. Público

Só as agências: dono, equipe e quem opera as subcontas pela agência. Por isso:
- a marca é a **graao** em todo lugar (textos, prints, logo);
- os temas da agência entram: subcontas, setups, SaaS e planos, revenda, white label, carteira e cobrança;
- os clientes finais das agências não são público. Nada precisa ficar neutro de marca.

## 3. Objetivos, não objetivos e antiobjetivos

**Objetivos**
- Uma agência nova monta a primeira subconta, conecta o WhatsApp, cria um pipeline e liga uma automação usando só a documentação.
- Todo módulo da graao tem pelo menos uma página "para que serve + passo a passo".
- Cada entrega nova chega com a sua página no mesmo PR.
- Busca que acha o artigo pelo nome da tela ou da ação.

**Não objetivos (por enquanto)**
- Versão em espanhol. A estrutura já nasce preparada para i18n, mas o conteúdo v1 é só pt-BR.
- Central de chamados dentro do site. A página Suporte aponta para os canais que já existem.
- Documentação da API pública para desenvolvedores. Pode virar uma aba própria depois.
- Comunidade e fórum.

**Antiobjetivos (falha mesmo que funcione)**
- Prints ou vídeos com dados reais de clientes. Todo print sai de uma conta de demonstração com dados fictícios.
- Copiar textos, prints ou a marca da GHL ou da Zaia. A graao recria a organização, não o conteúdo.
- Artigo desatualizado, que mostra uma tela que já não existe. Toda mudança de tela que afeta um artigo atualiza o artigo.
- Publicar o link do grupo de WhatsApp da comunidade. Ele é só para clientes; ver a memória do site institucional.
- Documentação que só um desenvolvedor consegue ler. A linguagem é a do dono da agência.

## 4. Restrições do projeto

- O app (`server.mjs`, `ui/`) não tem dependências npm. O site de documentação tem `package.json` próprio dentro de `docs-site/`, como já acontece com `prancheta-editor/`. Nenhuma dependência entra na raiz.
- `ui/` é a fonte do front-end do app. O site de documentação não toca em `ui/`, exceto na fase 4 (links de ajuda).
- Publicação, DNS e deploy só com OK explícito do usuário, como já combinado para o site institucional.
- A Vercel tem limite de deploys (memória `vercel-deploy-rate-limit`). Cada projeto só faz build quando os seus arquivos mudam (ver §6.6).
- A Cloudflare segura arquivos no navegador por 4h (memória `cloudflare-browser-cache`). Os arquivos de mídia usam nome com hash, para que a troca de um print nunca dependa de limpar o cache.
- O R2 do app (PR #94, ainda aberto) é **privado** e serve aos arquivos das subcontas. A documentação usa um bucket **separado e público**. Ela não depende do PR #94.

## 5. Abordagens consideradas

| | Site próprio com Starlight | GitBook (como a Zaia) | Rota dentro do app graao |
|---|---|---|---|
| Mídia no R2 | Sim, por padrão | Não: o editor guarda no GitBook | Sim |
| Regra "doc no mesmo PR" | Cobrada pelo CI | Depende de disciplina | Cobrada pelo CI |
| Busca, menu, sumário | Prontos | Prontos, com IA | Construir do zero |
| Editor visual | Não (Markdown no Git) | Sim | Não |
| Custo | Zero | Plano pago para domínio próprio | Zero |
| Acoplamento | Projeto separado | Externo | Preso ao deploy e ao cache do app |

**Escolhida pelo usuário: site próprio com Starlight.** É o único caminho que guarda toda a mídia no R2 sem trabalho manual e que deixa a regra de documentar cada entrega ser cobrada automaticamente no PR. A falta de editor visual é aceitável porque quem escreve hoje é o próprio fluxo de desenvolvimento.

## 6. Arquitetura

### 6.1 Projeto
- Pasta `docs-site/` no repositório `minhasoci-bot/graao.com`, com Astro e Starlight (versões estáveis atuais), `package.json` e `package-lock.json` próprios.
- Conteúdo em `docs-site/src/content/docs/**.mdx`. Uma pasta por grupo do menu (§7) e um arquivo por artigo.
- Scripts na raiz: `docs:dev` e `docs:build` (`npm --prefix docs-site run ...`).
- Saída estática. Não há servidor.

### 6.2 Recursos do Starlight usados
- Menu lateral em grupos, gerado pelas pastas e ordenado por `sidebar.order`.
- Busca local (Pagefind), sumário "Nesta página", anterior/próximo e "Atualizado em" (data do último commit do arquivo).
- Componentes nativos: `Steps` (passo a passo), `CardGrid`/`LinkCard` (páginas de seção como "Integrações e Canais" da Zaia), `Aside` (dica, atenção, perigo), `Tabs`, `Badge` (Novo, Beta).
- Tema com as cores, a fonte e o logo da graao, nos modos claro e escuro.
- `llms.txt` (plugin `starlight-llms-txt`), para que o Graao Chat e IAs externas leiam a documentação.

### 6.3 Componentes próprios (`docs-site/src/components/`)
- `<Print src alt legenda />`: imagem do R2 com largura máxima, borda, zoom ao clicar e `loading="lazy"`. O `src` é a chave no bucket; o componente monta a URL com o domínio de mídia.
- `<Video src poster legenda />`: `<video controls preload="none" playsinline>` com MP4 do R2 e capa em WebP. Sem autoplay.
- `<Automacao gatilhos acoes />`: bloco padrão que lista os gatilhos e as ações de workflow ligados ao módulo, com link para o catálogo de automações.
- `<Requisitos plano permissao />`: bloco "Antes de começar" (plano necessário, papel do usuário, integrações).

### 6.4 Mídia no Cloudflare R2
- Bucket próprio, `graao-docs-midia`, com acesso público só por um domínio personalizado: `midia.graao.com`. A zona `graao.com` já está na Cloudflare. A URL `r2.dev` fica desligada.
- Chaves: `docs/<grupo>/<artigo>/<nn>-<descricao>.<hash8>.<ext>`, por exemplo `docs/crm/criar-pipeline/03-nova-etapa.a1b2c3d4.webp`.
- Formatos: prints em WebP 1440 px de largura (fonte 1440×900, escala 1); vídeos em MP4 H.264 1080p, de 30 s a 3 min, sem áudio obrigatório, com capa WebP.
- Cache: `Cache-Control: public, max-age=31536000, immutable`, seguro porque o hash muda quando o arquivo muda.
- Envio: script `docs-site/scripts/midia.mjs` sem dependências. Ele assina SigV4 reaproveitando a lógica de `r2-storage.mjs` (copiada se o PR #94 ainda não estiver na main). Comandos `enviar <pasta-local>` (calcula o hash, envia e imprime as chaves) e `listar <prefixo>`. Variáveis: `R2_DOCS_ACCOUNT_ID`, `R2_DOCS_ACCESS_KEY_ID`, `R2_DOCS_SECRET_ACCESS_KEY` e `R2_DOCS_BUCKET`, no `.env.local`, nunca no repositório.
- Os arquivos originais dos prints ficam fora do Git, em `docs-site/.midia/`, que é ignorado. O R2 é a cópia oficial.

### 6.5 Produção de prints e vídeos
- Conta de demonstração: o app roda **localmente**, sem login (`GO_DEV_NO_AUTH=1`) e com um banco próprio (`GO_DB_PATH=docs-site/.midia/demo.sqlite`), preenchido por um script de semente com uma "Agência Demo" e 3 subcontas fictícias (nomes, contatos, conversas e cobranças inventados). Os prints nunca saem da produção.
- Prints: capturados com navegador automatizado em 1440×900, por um roteiro por artigo em `docs-site/roteiros/<artigo>.mjs`. Assim os prints de um artigo podem ser refeitos de uma vez quando a tela mudar. Destaques (caixa ou seta no elemento) são desenhados pelo roteiro no próprio DOM antes da captura.
- Vídeos curtos: gravação de tela do mesmo roteiro, sem narração, com legendas no texto do artigo. Vídeos narrados pela equipe podem substituir os curtos depois. O componente `<Video>` é o mesmo.

### 6.6 Publicação
- Novo projeto na Vercel (`graao-docs`) com raiz em `docs-site/`, saída estática, domínio `doc.graao.com` (CNAME na Cloudflare).
- Build só quando necessário: o projeto `graao-docs` ignora commits que não tocam em `docs-site/`, e o projeto do app ignora commits que só tocam em `docs-site/` (Ignored Build Step nos dois). Isso protege o limite de deploys.
- O site é **público**, como os da GHL e da Zaia: ajuda quem está avaliando a graao e o SEO. Nada sensível entra nele.

## 7. Estrutura de conteúdo (menu lateral)

Os grupos seguem o mapa de categorias da GHL, reorganizado pelos módulos da graao. Os nomes de tela e de menu nos artigos devem ser exatamente os de `ui/` (em pt-BR).

1. **Comece aqui**: Bem-vindo à graao · Conceitos (agência, subconta, usuários e papéis) · Primeiros passos da agência (checklist do Launchpad) · Novidades · Suporte
2. **Agência**: Painel da agência · Subcontas · Setups de conta (snapshots) · Planos SaaS e cobrança das subcontas · Revenda com margem · White label (marca, domínio, app) · Carteira · Labs e AI Suite · Prospecção · Relatórios consolidados
3. **Configurações**: Dados da empresa · Usuários e permissões · Domínios · Mídia Drive · Notificações · Registro de auditoria · Preferências de comunicação
4. **CRM**: Contatos · Listas inteligentes · Empresas · Objetos personalizados · Oportunidades e pipelines · Tarefas e projetos · Campos e variáveis · Importar e exportar · Lixeira de contatos
5. **Conversas e canais**: Caixa unificada · WhatsApp · E-mail (domínio de envio, SPF/DKIM) · Telefonia e discador · Instagram e Messenger · Chat do site · Tickets · Snippets e ações manuais
6. **Agendas**: Calendários · Serviços · Locação de recursos · Serviço em campo · Integrações de agenda · Reuniões e Notes AI
7. **Automações**: Como funciona um workflow · Gatilhos (por módulo) · Ações (por módulo) · Trigger links · Sequências de e-mail · Conectores
8. **Sites e conteúdo**: Sites e funis · Formulários · Pesquisas e quizzes · Blog · Widget de chat · QR codes · SEO e Visibility AI · Studio (sites com IA) · Webinars
9. **Marketing**: Planejador social · Campanhas de e-mail · Anúncios · Brand board · Contadores regressivos · Eventos · Afiliados · Fidelidade · Rastreamento e atribuição
10. **Reputação**: Pedidos de avaliação · Widgets de avaliações · Depoimentos em vídeo · Perfil da empresa no Google e listagens
11. **Pagamentos e documentos**: Gateways · Produtos · Faturas e orçamentos · Assinaturas · Links de pagamento · Pedidos e checkouts · Gift cards · Loja · Documentos e contratos · Recibos e impostos
12. **Cursos e comunidades**: Cursos · Comunidades · Certificados · Portal do cliente
13. **Inteligência artificial**: Agent Studio · Base de conhecimento · Voice AI · Content AI · IA nas automações · Graao Chat · Servidor MCP
14. **Relatórios**: Dashboards · Relatórios · Atribuição
15. **Apps e integrações**: Marketplace · App mobile e desktop · Google · Meta · Webhooks
16. **Suporte e conformidade**: Como pedir ajuda · Privacidade e LGPD · Migrar da GoHighLevel e de outras ferramentas · Perguntas frequentes

Cada grupo abre com uma **página de seção**: duas ou três linhas sobre o módulo e uma grade de cartões para os artigos, como "Integrações e Canais" na Zaia.

## 8. Modelo de artigo

Arquivo `docs-site/src/content/docs/_modelo.mdx`, que não é publicado. Todo artigo segue esta ordem; uma seção só sai quando não se aplica:

```mdx
---
title: Criar um pipeline de vendas
description: Monte as etapas do seu funil e acompanhe cada oportunidade.
sidebar: { order: 2, badge: { text: Novo, variant: tip } }   # badge só nos primeiros 30 dias
modulo: crm                 # usado pelo CI e pela página Novidades
---

Para que serve (2 ou 3 frases, na língua do dono da agência).

<Requisitos plano="..." permissao="..." />

<Video src="docs/crm/criar-pipeline/video.<hash>.mp4" poster="..." legenda="..." />   (opcional)

## Passo a passo
<Steps>
1. **Abra Oportunidades** no menu da subconta.
   <Print src="docs/crm/criar-pipeline/01-menu.<hash>.webp" alt="..." />
2. ...
</Steps>

<Aside type="tip">Dica prática.</Aside>

## Automações ligadas
<Automacao gatilhos={[...]} acoes={[...]} />

## Perguntas frequentes
(pergunta em negrito, resposta curta)

## Veja também
<CardGrid> links para 2 a 4 artigos </CardGrid>
```

Regras de escrita: frases curtas, voz ativa e "você"; nomes de botões em **negrito**, exatamente como na tela; um print por passo que muda a tela; texto alternativo em todo print.

## 9. Regra: toda entrega é documentada

1. **Regra escrita** num `CLAUDE.md` na raiz do repositório (hoje não existe) e nas `regras` dos painéis `docs/implementation/painel/progresso.js` e `painel-melhoria/progresso.js`: "Toda ferramenta nova ou melhoria visível ao usuário cria ou atualiza o artigo em `docs-site/` no mesmo PR e acrescenta uma linha em Novidades."
2. **Modelo de PR** (`.github/pull_request_template.md`) com o campo `Documentação: <caminho do artigo>` ou `Documentação: não se aplica — <motivo>`.
3. **Checagem no CI** (`scripts/docs-check.mjs`, sem dependências, como passo novo em `.github/workflows/ci.yml`, lendo o corpo do PR pelo evento `pull_request`): se o PR altera `ui/**`, `routes/**` ou `*-model.mjs` e não altera `docs-site/src/content/docs/**`, o check falha, a não ser que o corpo do PR tenha `Documentação: não se aplica`. Refatorações e testes passam com essa linha.
4. **Página Novidades** (`comece-aqui/novidades.mdx`): uma entrada por entrega, com data, título, uma frase e link para o artigo. É o "registro de mudanças da plataforma" que a GHL também tem.
5. **Memória** do assistente com a regra, para que toda sessão futura a aplique.

## 10. Fases de entrega

| Fase | Entrega | Pronto quando |
|---|---|---|
| F0 Infra | `docs-site/` com Starlight e o tema da graao, bucket R2 público em `midia.graao.com`, `scripts/midia.mjs`, projeto Vercel com preview | O preview abre com tema da graao e um print vindo do R2 |
| F1 Esqueleto e regra | Os 16 grupos com páginas de seção, modelo de artigo, componentes, Comece aqui, Suporte, Novidades; regra §9 ligada no CI | O menu completo navega; um PR de teste sem doc falha no check |
| F2 Essenciais | ~25 artigos da jornada da agência nova: conceitos, primeira subconta, setups, white label e domínio, usuários, WhatsApp, e-mail, contatos, pipeline, primeiro workflow, calendário, gateway e fatura, Agent Studio, Planejador social, pedidos de avaliação | Uma pessoa de fora monta uma subconta funcionando só com a doc |
| F3 Cobertura | Os demais módulos, acompanhados por uma lista de cobertura (módulo → artigos → status) no painel de melhoria | Todo item "feito" do painel de paridade tem artigo |
| F4 Integração | Botão "Ajuda" em cada tela de `ui/` com link para o artigo, `llms.txt` lido pelo Graao Chat, preparação do espanhol | Cada tela principal tem ajuda contextual |

`doc.graao.com` só é ligado (DNS e domínio na Vercel) depois de o usuário aprovar a F2. Até lá, o site vive no endereço de preview da Vercel.

## 11. Riscos

- **Prints envelhecem rápido**: mitigado pelos roteiros de captura por artigo (§6.5) e pela regra do §9.
- **Volume grande para um time pequeno**: a F2 limita o começo ao que a agência nova precisa; o resto entra por módulo, e as entregas novas já chegam documentadas.
- **Check do CI irritante**: a linha "não se aplica" existe para refatorações. Se virar hábito, revisar os caminhos vigiados.

## 12. Decisões tomadas pelo assistente (o usuário pode corrigir)

- Site público, não atrás de login.
- Domínio de mídia `midia.graao.com` e bucket `graao-docs-midia`, separados do R2 privado do app.
- Vídeos curtos sem narração, gerados pelos roteiros. Vídeos narrados ficam opcionais.
- Conteúdo só em pt-BR na v1.
- Os 16 grupos do §7 e a lista de 25 artigos da F2.
- O CI cobra a documentação pelos caminhos `ui/`, `routes/` e `*-model.mjs`.

## 13. O que fica com o construtor

Versões exatas do Astro e do Starlight; o desenho fino dos componentes; o texto de cada artigo; a ordem dos artigos dentro de cada grupo; o formato da lista de cobertura no painel; os nomes finais dos menus, conferidos em `ui/`.

## 14. Pendências com o usuário

1. **Canais de suporte** que a página Suporte deve mostrar (WhatsApp de suporte, e-mail, horário de atendimento, chamados?).
2. ~~Conta de demonstração~~: resolvida. Os prints saem do app local com banco de demonstração (§6.5).
3. **Acesso à Cloudflare**: o usuário cria o bucket, o domínio `midia.graao.com` e o token R2 (ou autoriza o assistente a criar o bucket pela integração da Cloudflare; o token fica sempre com o usuário).
