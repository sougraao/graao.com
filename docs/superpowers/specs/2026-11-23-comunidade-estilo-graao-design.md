# Comunidade do portal no estilo graao + Academia — design

Data: 2026-11-23 · Status: aguardando aprovação

## Intenção

Na graao, cada subconta pode criar comunidades que os clientes acessam em `/portal/<workspace>`. A comunidade
funciona (canais, enquetes, eventos ao vivo, ranking com níveis, emblemas, planos pagos, perguntas de adesão,
primeiros passos, moderação), mas é **feia e pouco intuitiva**: botão "Entrar" esticado na largura toda, abas
soltas, páginas vazias sem identidade. O dono quer que ela fique **bonita, intuitiva e fluida como a plataforma
graao** (`D:\meus documentos\graao_club`), continue **personalizável pelo dono da comunidade** e ganhe uma área
de cursos chamada **Academia**.

## Objetivos

1. Reorganizar a página da comunidade como um app, no padrão do graao: barra lateral à esquerda, coluna central,
   coluna de blocos à direita.
2. Deixar o feed fácil de usar: campo de publicar sempre aberto, filtros do feed, cartões limpos, estados vazios
   com próximo passo.
3. Nova aba **Academia**: o dono escolhe cursos e, **por curso**, se é **incluso para membros** ou **vendido à parte**.
4. Novas personalizações para o dono: blocos da lateral, texto do convite para publicar, Academia, temas escuros.
5. Manter tudo que existe hoje funcionando, inclusive as configurações já salvas pelos donos.

## Fora do escopo (etapa seguinte, "C")

Seguir pessoas e filtro "Seguindo", enviar imagem ao publicar, perfil público do membro, mensagens diretas,
alternância claro/escuro feita pelo próprio visitante.

## O que seria um fracasso mesmo funcionando

- Perder qualquer recurso atual (enquetes, eventos/ao vivo/gravações, planos e teste grátis, perguntas,
  primeiros passos, moderação/denúncia, emblemas, níveis, canais restritos).
- Quebrar o tema, a ordem/nomes das abas ou outras configurações já salvas por donos de comunidades.
- Copiar a marca graao (logo, nome, o verde-limão como identidade). Levamos o **estilo**, não a marca.
- Liberar um curso "à parte" para quem não comprou, ou manter um curso "incluso" aberto para quem saiu da
  comunidade ou está com o plano vencido.

## Abordagens consideradas

- **A) Só repaginar o CSS.** Rápido, mas mantém a organização confusa. Descartada.
- **B) Reorganizar como app no padrão graao + personalização de layout.** **Escolhida pelo usuário**, com a
  Academia somada.
- **C) B + recursos sociais (seguir, imagem, perfil).** Fica para depois: exige servidor e dados novos.

Para a Academia, o usuário escolheu a opção "o dono decide por curso" (incluso para membros ou vendido à parte),
em vez de "entrar libera tudo" ou "só mostrar".

## Como fica a tela

```
┌──────────────┬───────────────────────────────────┬──────────────────┐
│ [capa] Nome  │  ( L ) Compartilhe algo…           │ Sobre            │
│ 128 membros  │  [canal ▾]  [🔗] [📊]   [Publicar] │  descrição       │
│ [Sair]       ├───────────────────────────────────┤  12 posts · 128  │
│              │ (Recentes)(Em alta)(Minhas)        ├──────────────────┤
│ ● Feed       ├───────────────────────────────────┤ Próximos eventos │
│   Academia   │ (MD) Marina · #avisos · 2 h    ⋯   │  ter 19h Live …  │
│   Eventos    │ Título (se houver)                 ├──────────────────┤
│   Membros    │ Texto do post…                     │ Top do ranking   │
│   Ranking    │ [♥ 12] [💬 3] [↗ Compartilhar]      │ 1 Marina 96 pts  │
│   Sobre      │ comentários (2 últimos · ver todos)│ 2 Rafael 54 pts  │
│ CANAIS       │                                    ├──────────────────┤
│ # Todas      │                                    │ Membros recentes │
│ # Avisos     │                                    │ (●)(●)(●)(●) +12 │
└──────────────┴───────────────────────────────────┴──────────────────┘
```

**Visitante (ainda não é membro):** no topo da coluna central, um cabeçalho de boas-vindas com a capa em
destaque, a descrição, avatares de alguns membros e o botão "Entrar na comunidade" / "Pedir para entrar" / planos
pagos, em tamanho normal (nunca esticado). A lateral e as abas continuam visíveis. O conteúdo fechado mostra um
estado bloqueado bonito com o motivo e a ação.

**Celular (375 px):** a lateral vira uma faixa de navegação horizontal rolável no topo. Os canais viram "chips".
Os blocos da direita descem para depois do feed. Nada de rolagem horizontal da página.

## Partes

### 1. Layout e visual (tela do portal)

- Arquivos: `ui/portal-community.js` (renderização) e a seção da comunidade em `ui/client-portal.css`.
- Estrutura em três colunas, como acima. A navegação da lateral usa as abas configuradas pelo dono (ordem, nome,
  visibilidade). "Feed" é o rótulo da aba `discussion`, a menos que o dono tenha renomeado.
- Linguagem visual do graao: cartões com raio grande (~18px) e borda sutil, botões em pílula, filtros em
  "segmented control" de pílula, avatares redondos com iniciais coloridas, hierarquia de texto clara, espaçamento
  generoso, transições curtas em hover/abrir (respeitando `prefers-reduced-motion`).
- **Sempre tematizado:** a página da comunidade passa a usar sempre os tokens `--cm-*` (o tema padrão quando o
  dono não escolheu outro). Assim tudo que for novo nasce já seguindo as cores do dono.
- Estados vazios no estilo graao: ícone num círculo, título, frase curta e uma ação ("Publicar a primeira
  ideia", "Ver eventos passados" etc.).

### 2. Feed

- **Campo de publicar sempre aberto:** avatar + textarea com o convite (texto configurável pelo dono; padrão
  "Compartilhe algo com a comunidade…") + contador. Ao focar, aparecem: título (opcional), canal, link, enquete.
  Botão "Publicar".
- **Título opcional:** o servidor aceita publicação sem título. Para não quebrar o que usa `post.title`
  (moderação, automações, newsletter, painel), o servidor grava como título a primeira linha do texto
  (até 80 caracteres) e marca `titleAuto: true`. No cartão, título automático não é exibido como título.
- **Filtros:** Recentes (padrão) · Em alta (curtidas + comentários, últimos 30 dias) · Minhas. Feito na tela com
  os dados que o servidor já envia. Fixadas ficam no topo em "Recentes".
- **Cartão:** cabeçalho (avatar, nome, emblema, canal, tempo relativo), título se houver, texto, imagem/link/
  enquete, rodapé com botões Curtir (com número), Comentar (abre/foca o campo) e Compartilhar (copia o link da
  comunidade com `#post-<id>`). Excluir/Denunciar vão para o menu "⋯". Comentários: mostra os 2 últimos e
  "Ver todos os N comentários".
- Primeiros passos e mensagem de boas-vindas continuam acima do feed, no novo visual.

### 3. Academia (nova aba `academy`)

**Configuração do dono** (nova seção "Academia" nas configurações da comunidade, em `ui/community-admin.js`):
- Lista de cursos da subconta para adicionar; até 30 cursos; reordenar.
- Por curso: **Incluso para membros** ou **Vendido à parte**. Para "à parte", escolher uma oferta (lista das
  ofertas que contêm o curso); se o dono não escolher, usa a primeira oferta ativa que contém o curso.
- Salvo em `group.academy = { courses: [{ courseId, mode: 'included' | 'separate', offerId }] }`, validado em
  `community-config.mjs` (curso precisa existir; oferta precisa existir e conter o curso).
- A aba entra em `communityTabKeys` como `['academy', 'Academia']`, logo depois de Discussão. Comunidades já
  salvas recebem a aba visível somente quando tiverem pelo menos um curso na Academia (sem cursos, a aba fica
  oculta no portal mesmo se marcada como visível).
- Ao apagar um curso ou uma oferta, removê-los da Academia de todas as comunidades (como já é feito nas ofertas).

**Regra de acesso:**
- **Incluso:** membro com acesso à comunidade (`hasAccess`: ativo e, se paga, com plano em dia) pode abrir o curso.
  Saiu, foi banido ou o plano venceu: perde o acesso; o progresso fica guardado e volta se ele voltar.
- **À parte:** só quem já tem o curso liberado no portal (`member.courseIds`) abre. Os demais veem o cadeado e
  "Quero acesso", que abre `/oferta/<workspace>/<offerId>` em nova aba. Sem oferta: "Indisponível no momento".
- No servidor, `grantedCourse` (em `client-portal.mjs`) passa a aceitar também os cursos inclusos liberados por
  comunidade, por meio de uma função injetada pelo `server.mjs` (o portal não lê o documento da comunidade
  diretamente). Vale para abrir aula e marcar progresso/quiz/tarefa.
- "Meus cursos" na página inicial do portal também lista os cursos inclusos que o membro pode abrir.

**Tela:** grade de cartões (capa, nome, descrição curta, barra de progresso, selo "Incluso" ou preço/"À parte",
botão Começar/Continuar/Rever ou Quero acesso). O curso abre no player de curso que já existe no portal; o botão
voltar do player retorna para a Academia da comunidade. Visitante não membro vê os cartões com
"Entre na comunidade para assistir" nos inclusos.

### 4. Blocos da lateral direita

- Blocos: **Sobre** (descrição e números), **Próximos eventos** (até 3), **Top do ranking** (5, últimos 30 dias,
  "Ver tudo" leva à aba Ranking), **Membros recentes** (avatares dos últimos que entraram, "+N").
- O dono liga/desliga e ordena os blocos. Salvo em `group.layout.widgets = [{ key, visible }]`.
- Um bloco só aparece se a aba correspondente estiver visível e houver conteúdo (sem eventos, sem bloco de
  eventos). Sem nenhum bloco visível, a coluna direita some e o feed ocupa o espaço.
- Dados: o servidor já envia eventos, ranking e membros na visão do membro; incluir `joinedAt` já existe.

### 5. Personalização do dono (novas opções)

Nas configurações da comunidade, seção "Aparência" e novas seções:
- **Convite para publicar** (texto do campo do feed, até 80 caracteres).
- **Blocos da lateral** (ligar/desligar, ordenar).
- **Academia** (parte 3).
- **Temas escuros** novos nos temas prontos, além de "Meia-noite": "Grafite" (fundo quase preto, destaque claro)
  e "Noite neon" (fundo quase preto, destaque verde-limão, inspirado no graao). A prévia do tema no admin passa a
  mostrar o novo layout em miniatura.
- Tudo que já existe continua: cores, capa, abas, boas-vindas, perguntas, planos, moderação, newsletter, emblemas.

## Restrições

- Front-end em JS puro com módulos ES e templates de string; sem framework nem build. Fonte do front-end é `ui/`
  (nunca copiar `public/` por cima de `ui/`); conferir como `public/` é atualizado antes de entregar.
- Configuração nova entra em `communityConfig` com o mesmo padrão de merge sobre o que já existe (`pick`), para
  não apagar campos antigos.
- Testes com `node --test` em `test/` (há `communities.test.mjs`, `community-settings.test.mjs`,
  `client-portal.test.mjs`): cobrir a validação da Academia e dos blocos, o título automático e a regra de acesso
  (incluso com acesso, incluso sem acesso/vencido, à parte com e sem compra).
- Trabalhar num branch novo a partir de `origin/main` (o branch atual tem mudanças de outro trabalho). Conferir a
  `main` antes, porque outras sessões entregam itens em paralelo.
- Verificar no navegador (desktop e 375 px, tema claro e escuro) antes de dar como pronto.

## Decisões tomadas por mim (o usuário pode corrigir)

- Título da publicação opcional, com título automático gravado no servidor.
- Filtros do feed: Recentes / Em alta / Minhas ("Seguindo" fica para a etapa C).
- Comentários recolhidos: 2 últimos + "ver todos".
- Limite de 30 cursos na Academia; oferta padrão = primeira oferta ativa que contém o curso.
- Aba Academia oculta enquanto não houver curso nela.
- Cursos inclusos aparecem também em "Meus cursos".
- Dois temas escuros novos ("Grafite" e "Noite neon").

## Deixado para quem for construir

- Detalhes de espaçamento, ícones e animações, dentro da linguagem descrita.
- Como passar a função de acesso da comunidade ao portal no `server.mjs`.
- Como o player de curso sabe voltar para a Academia (estado de navegação do portal).
