# App móvel no estilo da comunidade — design

Data: 2026-11-25 · Status: aprovada em 2026-11-25 e construída
Proposta visual aprovada em conceito (abordagem B): https://claude.ai/artifact/9wZA5xSB2wXBXA1kF3z8tD

## Intenção

O dono do graao pediu para melhorar o **criador de aplicativo móvel** e o **aplicativo móvel** "com a mesma estética das
novas comunidades". A referência é a comunidade do portal (estilo graao, PRs 70 a 75, `ui/portal-community.css`).

O app é um PWA com a marca da agência, que a **equipe do cliente** instala para usar a plataforma em "modo app"
(`/app?shell=mobile&agency=<id>`). Hoje ele está quebrado no celular e não parece da agência:

- o conteúdo fica espremido em 60 px, porque `liquid-glass.css` (`:root:root .shell`) vence a regra do modo app;
- a barra de abas é branca também no escuro; os botões saem na cor do graao, não na da agência;
- a troca de subconta fica na barra lateral, que o app esconde;
- a barra mostra módulos sem checar a permissão de quem está usando;
- no criador, a prévia mostra uma lista que não existe no app, e há rótulos em inglês.

## Objetivos

1. O app abre em tela inteira, legível e utilizável em 320 a 430 px, em claro e escuro, com as cores da agência.
2. App e tela de entrada com a linguagem da comunidade: cartões de 18 px com borda sutil, pílulas, abas com fundo suave
   no item ativo, ladrilho de identidade, avatares coloridos, estados vazios com hachura, mesma fonte.
3. Nova tela **Início**, em blocos, como primeira aba.
4. Conversas no celular abre na lista, não nas pastas.
5. Criador em três colunas (identidade e seções · conteúdo · prévia fiel), com estados vazios e checklist de publicação.
6. Nada do que existe hoje se perde, e apps já publicados continuam funcionando sem ação da agência.

## Fora do escopo

Comunidades, cursos e login de consumidor dentro do app (abordagem C); reescrever as telas internas dos módulos;
app nativo; mudar o envio de push ou o pacote das lojas; versão de rascunho separada da publicada.

## O que seria um fracasso mesmo funcionando

- A prévia do criador divergir do app de verdade.
- Mudar a cor principal, a ordem salva dos módulos, os ocultos ou os links de um app já publicado (a aba Início entra antes deles).
- Quebrar `/mobile/<id>/`, `manifest.webmanifest`, `sw.js`, `config.json`, ícones, `assetlinks.json` ou o pacote das lojas.
- Alterar o visual da plataforma fora do modo app.

## Abordagens consideradas

- **A. Só visual.** Mais rápida; o app continuaria abrindo no painel de desktop.
- **B. Visual + Início + Conversas na lista.** **Escolhida pelo usuário.**
- **C. B + comunidade dentro do app.** Exige login de consumidor; fica para depois.

## Partes

### 1. Tema do app

- Novo campo `mobileApp.theme = { preset, tokens }`, com os mesmos temas prontos, tokens e validação da comunidade
  (`themePresets`, `themeTokens`, `themeStyle`, `themeMode` em `ui/community-data.js`). A validação hoje embutida em
  `community-config.mjs` vira uma função compartilhada; o comportamento da comunidade não muda.
- **Apps antigos** (sem `theme`): o tema é derivado da `primary` salva, sobre o tema "Padrão", com texto sobre o principal
  e destaque calculados (contraste 4,5:1). No criador aparece como "Suas cores".
- `primary` e `accent` continuam salvos e aceitos na ação `mobile-app`. Ao escolher um tema, `primary` recebe a cor
  principal dele (usada no `theme_color` e no pacote das lojas); `accent` fica guardado, mas deixa de ser usado no visual (hoje só
  colore o degradê da entrada).
- **Claro e escuro:** vale a escolha da pessoa (a mesma da plataforma); sem escolha, o modo do tema da agência, como na
  comunidade. A troca usa a cortina diagonal que já existe.
- **Dentro dos módulos:** no modo app, os tokens `--g-*` de cor (fundo, superfície, texto, borda, marca) passam a vir dos
  `--cm-*` do tema. O mapa fica em `ui/tokens.css`, limitado a `:root[data-app-mode]`. No modo app,
  a cor da agência da plataforma (`applyBrandColor`) não é aplicada. Cores de significado (erro, sucesso) não mudam.

### 2. Peças compartilhadas (a prévia é o app)

- `ui/mobile-app-view.js`: funções puras que devolvem HTML: entrada, cabeçalho, barra de abas, folha "Mais" e Início.
  Usadas pelo app (`ui/mobile-shell.js`), pela página de entrada (`agency-mobile.mjs`) e pela prévia do criador.
- `ui/mobile-app.css`: todo o CSS dessas peças, só com `--cm-*`. Sai o CSS embutido em `mobile-shell.js` e na entrada.
  A CSP da entrada passa a aceitar o CSS do próprio site (`style-src 'self' 'unsafe-inline'`).
- Arquivos novos entram na lista de estáticos do `server.mjs` e no fluxo de `public/` (`scripts/sync-public.mjs`).

### 3. Entrada (`/mobile/<id>/`)

Faixa com a cor do tema ou **imagem de capa opcional** (nova), ladrilho do ícone sobreposto, nome, frase, "Entrar" e
"Instalar o app" (quando o navegador permite). Um cartão mostra os passos de instalação do sistema do aparelho (iPhone ou
Android). Aberto pela tela inicial, continua indo direto para o app. Segue o modo do tema da agência.

### 4. Moldura do app

- **Largura:** a regra do modo app passa a vencer a do Liquid Glass, sem barra lateral.
- **Cabeçalho:** ícone e nome do app, nome da subconta embaixo, busca e notificações (com ponto quando há não lidas).
- **Abas:** Início + três primeiros módulos visíveis + Mais. Com a Início desligada, quatro módulos + Mais.
  Só aparecem módulos que a pessoa pode abrir. Alvos de toque de 44 px, área segura do aparelho respeitada.
- **Mais (folha):** subconta atual com "Trocar de subconta" (só com mais de uma ou acesso à agência), grade dos demais
  módulos, links próprios, notificações neste celular (ligar **e desligar**; a rota de desligar já existe), modo escuro,
  conta/sair. Fecha no fundo, no Esc e ao escolher; foco volta ao botão.
- **Visão da agência:** quem tem acesso de agência e vai para ela vê a plataforma normal, com a barra lateral, e volta
  ao app ao abrir uma subconta.

### 5. Início (`#home`, só no modo app)

- Saudação por horário no fuso da subconta, com o primeiro nome (sem nome: só a saudação).
- Atalhos em pílula: Nova conversa, Contato, Agendar (conforme permissão), abrindo os diálogos que já existem.
- Blocos, cada um só com permissão para o módulo:
  **Precisa de resposta** (até 5 conversas com mensagem recebida não lida, mais recentes primeiro),
  **Hoje na agenda** (até 5 agendamentos de hoje não cancelados),
  **Tarefas** (até 5 abertas, vencidas ou para hoje, com a permissão de Contatos; marcar como feita ali mesmo),
  **Oportunidades abertas** (quantidade e valor).
- Bloco sem itens mostra uma frase curta; sem nenhum item em todos, um estado vazio único com as ações.
- Usa o estado que a plataforma já carrega; nenhuma rota nova. Fora do modo app, `#home` cai na tela padrão.
- O app instalado passa a abrir em `#home`. Links de push continuam abrindo o endereço deles.

### 6. Conversas

Até 760 px, Conversas abre na lista, com as pastas no botão que já existe. O painel salvo do desktop não muda.

### 7. Criador (`#agency/mobile-app`)

- **Coluna esquerda:** ícone, nome e estado ("Rascunho" ou "Publicado · versão N"); seções Identidade, Entrada, Módulos,
  Links próprios e Publicação, cada uma com ✓ ou o que falta.
- **Centro:** uma seção por vez, num formulário único `.set-form` (as outras continuam no DOM, nada se perde ao trocar).
  - *Identidade:* nome, ícone (trocar e remover), tema (prontos ou "Suas cores": cor principal e, sob "Ajustar todas as
    cores", os demais tokens).
  - *Entrada:* frase e imagem de capa (trocar e remover).
  - *Módulos:* chave da Início, ordem por arrastar e por botões (teclado), visibilidade, e "na barra / em Mais / oculto".
    Rótulos em português.
  - *Links próprios:* lista que cresce até cinco, com adicionar, remover e estado vazio.
  - *Publicação:* link de instalação com copiar e abrir, checklist das lojas que leva ao campo, dados das lojas, baixar
    pacote, "Como publicar nas lojas".
- **Direita:** prévia fiel, com Entrada / Início / Mais e claro/escuro, atualizada enquanto se edita, com dados de exemplo.
- **Salvar:** barra "Alterações não salvas" com Descartar e Salvar, em qualquer seção. "Publicar" salva antes. Sem ícone,
  "Publicar" leva à Identidade e explica. Como hoje, o que é salvo já vale no app publicado; a tela diz isso.
- Sair com alterações pede confirmação com `ask` (nunca diálogo nativo).
- **Cores:** as do graao (`--g-*`), com a forma da comunidade; vidro só onde o design system permite.
- **Largura:** abaixo de 1280 px a prévia desce; abaixo de 760 px as seções viram uma faixa rolável.

### 8. Dados

| Campo novo | Padrão | Observação |
|---|---|---|
| `mobileApp.theme` | ausente | derivado de `primary` |
| `mobileApp.home` | `true` | liga a aba Início |
| `mobileApp.cover` | `''` | PNG, JPEG ou WebP, guardado fora do documento como as imagens do desktop, até 500 KB |

Agências novas começam com português ("Minha Agência", "Bem-vindo de volta"), o tema "Padrão" e a ordem Conversas,
Contatos, Calendários, Oportunidades, Pagamentos, Avaliações, Painel. Ordens já salvas não mudam.
`config.json` ganha `theme` e `home`, e mantém os campos atuais.

## Restrições

- JS puro, módulos ES, sem framework. Fonte em `ui/`; `public/` só pelo script de sincronização.
- Tokens só em `ui/tokens.css`. Textos novos em português e espanhol. Nada de popups nativos.
- Branch `feat/app-movel-comunidade`. Commit, push e PR só quando o usuário pedir.
- Documentação no mesmo PR: artigo `docs-site/src/content/docs/apps/aplicativo-movel.mdx`, linha em `novidades.mdx`,
  `npm run docs:secoes`, `docs-site/cobertura.json`, prints da Agência Demo local.

## Verificação

- Testes (`node --test`): tema derivado, validação do tema, capa, `home`, compatibilidade com app salvo sem os campos,
  `config.json`, entrada, permissões nas abas, montagem dos blocos da Início (fuso, limites, permissões, vazio).
- `npm test`, `npm run lint`, `npm run typecheck`, `npm run docs:test`, `npm run docs:build`.
- Navegador: criador em 1360, 1024 e 375 px; entrada, Início, Conversas, Contatos, Calendários, Oportunidades, Pagamentos,
  Avaliações, Painel e Mais em 320 e 375 px; claro e escuro; tema claro e tema escuro; capturas lado a lado com a
  comunidade; sem erros de console e sem rolagem horizontal da página.
- Fora do modo app: comparar uma tela antes e depois.
- Não dá para verificar aqui: instalação num iPhone/Android real, push real e publicação nas lojas.

## Decisões tomadas por mim (o usuário pode corrigir)

- Início fixa na primeira posição, com chave para desligar; nos apps já publicados ela entra ligada e o quarto módulo da
  barra passa para "Mais".
- Bloco de Tarefas somado aos três da proposta.
- Sem rascunho separado: salvar continua valendo no app publicado.
- Capa até 500 KB; links próprios continuam até cinco.
- Conversas na lista vale para qualquer tela de até 760 px, não só no app.
- Cores de significado e o CSS interno dos módulos ficam como estão, além das cores do tema.

## Deixado para quem for construir

Espaçamentos e animações dentro da linguagem; divisão interna dos arquivos novos; lista exata dos `--g-*` mapeados;
como guardar a capa reaproveitando o fluxo de imagens do app desktop.
