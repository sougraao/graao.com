# Importar do GHL: extensão do Chrome que traz o snapshot da agência para o graao

Data: 2026-11-26 · Status: aguardando aprovação

## Por que

Agências que estão saindo do GoHighLevel precisam trazer o que construíram lá: automações, sites e funis, formulários, campos, valores, tags, pipelines, agendas, mensagens. Sem isso, a mudança para o graao significa refazer tudo à mão, o que trava a migração. O graao já sabe converter uma subconta do GHL num setup completo (foi assim que nasceram os 5 templates do PR 191, com `scripts/ghl-template`). Falta a agência conseguir fazer isso sozinha, de dentro do graao.

## O que a agência faz (fluxo)

1. No GHL, ela carrega o snapshot numa subconta (se ainda não estiver numa). O link de compartilhamento do snapshot sozinho não serve: sem login de agência no GHL, a página só mostra a tela de login (verificado com o REA em 26/11).
2. No graao, em **Setups de conta → Importados → Importar do GHL**, ela vê o passo a passo, o link para instalar a extensão e um **código de importação** (válido por 30 minutos, de uso único, ligado à agência dela).
3. No GHL, com a subconta aberta, ela clica na extensão **graao: Importar do GHL**, cola o código e confirma. A extensão mostra o progresso da leitura (campos, automações, formulários, páginas…).
4. A extensão envia os dados para o graao. A tela de importação no graao acompanha a conversão e, no fim, mostra o setup novo em **Importados**, com um relatório: o que veio, quantos de cada item e o que precisa de ajuste antes de usar.
5. A partir daí o setup é igual a qualquer outro: cria subcontas, pode ser editado, renomeado ou apagado. Ele é só dessa agência.

```
Importar do GHL
1. No GHL, abra a subconta com o snapshot carregado.
2. Instale a extensão  [Instalar no Chrome]
3. Clique na extensão e cole este código:   K7Q-4MZ-P2X   (vale 30 min)
   Aguardando a extensão…  ▓▓▓▓▓░░░  Automações 18/33
```

## Objetivos

- O setup importado sai **completo** como os templates do PR 191: automações com todos os passos e vínculos refeitos, sites e funis com as páginas, formulários e pesquisas com destinos, campos, valores, tags, pipelines, agendas, links, chats, modelos de e-mail e agentes de IA.
- A agência faz tudo sozinha, sem suporte, em poucos minutos.
- Funciona também em GHL com domínio próprio (white label, ex.: `app.minhaagencia.com`), que é o comum entre agências.

## Não objetivos (v1)

- Contatos, conversas, oportunidades, pagamentos e histórico (migração de dados é outro projeto).
- Cursos e áreas de membros, produtos e cobranças.
- Tradução automática: o snapshot é da agência e normalmente já está no idioma dela. O dicionário de tradução do PR 191 continua só para os templates do graao.
- Importar várias subcontas de uma vez (uma importação = uma subconta = um setup).
- Firefox e Safari.

## Antiobjetivos (seria falha mesmo funcionando)

- O graao receber senha, token ou cookie do GHL. A extensão lê com a sessão que já está no navegador da agência e manda só os dados.
- A extensão alterar qualquer coisa no GHL. Ela só lê.
- O setup importado de uma agência aparecer para outra.
- O site importado depender do GHL para continuar no ar (imagens no CDN do GHL somem quando a agência cancela).

## Restrições

- **Endereços internos do GHL**: a leitura completa usa os mesmos endereços internos que o app do GHL usa (os do script de extração usado no PR 191). Eles podem mudar sem aviso; a extensão precisa falhar com mensagem clara por item ("não consegui ler as pesquisas") em vez de quebrar a importação inteira, e o relatório lista o que faltou.
- **Vercel**: corpo de requisição limitado a cerca de 4,5 MB e tempo de função limitado. Um site como o do Paisagismo tem 71 páginas e 11 MB de HTML. O envio e a conversão precisam ser em partes (ativos num envio; páginas em lotes), com a tela do graao conduzindo os lotes.
- **Armazenamento**: os setups da agência moram no estado da agência (`agency.snapshots`, até 50). Páginas de site (MB) não podem entrar nesse estado; ficam guardadas à parte e são carregadas na instalação, como `templateSites()` faz com os templates.
- **Limites do graao**: 50 páginas por site e o tamanho máximo de página (`SITE_LIMITS`). Site maior entra com as primeiras 50 páginas e o relatório avisa.
- **Chrome Web Store**: publicar a extensão exige uma conta de desenvolvedor do Google (taxa única) e passa por revisão da loja. Até a aprovação, dá para testar com "carregar sem compactação".

## Abordagens consideradas

1. **Extensão do Chrome** (escolhida pelo dono em 26/11): lê tudo com a sessão do GHL no navegador e manda para o graao. Única que entrega o snapshot completo sem o graao tocar no login do GHL. Custo: publicar e manter a extensão; endereços internos podem mudar.
2. **Script para colar no console**: rápido de fazer, mas colar código no console assusta e parece golpe; não serve para cliente.
3. **API oficial do GHL (OAuth)**: oficial e estável, mas não entrega os passos das automações nem o conteúdo das páginas, então o setup sai incompleto; exige app aprovado no marketplace do GHL.

## Como funciona por dentro (decisões)

**Extensão (Manifest V3)**
- Permissões mínimas: `activeTab` e `scripting`, sem acesso fixo a domínios. Ao clicar, ela injeta a leitura só na aba aberta, o que cobre `app.gohighlevel.com` e qualquer domínio white label sem pedir acesso a todos os sites. Permissão de rede só para o domínio do graao.
- A leitura roda no contexto da página do GHL e usa o cliente HTTP do próprio app (como `extract.tpl.js`), então não toca em token nem cookie. Reconhece a subconta aberta pela URL (`/location/<id>/…`).
- Lê: subconta, campos e pastas, valores, tags, pipelines, motivos de perda, agendas e grupos, links de gatilho, snippets, chats, cores da marca, formulários e pesquisas (com o conteúdo), automações (com os passos e gatilhos), modelos de e-mail, agentes e bases de conhecimento, funis e sites (com a lista de páginas e o endereço público de pré-visualização de cada uma).
- Envia para o graao com o código de importação no cabeçalho, em partes que caibam no limite da Vercel.

**Graao (servidor)**
- Rotas novas: gerar o código de importação (agência logada), receber as partes (autenticadas pelo código), avançar a conversão em lotes e consultar o andamento.
- O conversor de `scripts/ghl-template` (`convert.mjs`, `page-html.mjs`) passa a ser um módulo do servidor, usado tanto pelo script dos templates quanto pela importação. A parte só dos templates (limpeza de dados de terceiros, tradução, nomes fixos) continua no `build.mjs`.
- O HTML das páginas é baixado pelo servidor dos endereços públicos de pré-visualização (como `fetch-pages.mjs`), em lotes.
- As imagens das páginas e dos e-mails são copiadas para o armazenamento de mídia do graao (R2), e os endereços trocados, para o site não depender do GHL.
- Widgets do GHL embutidos (avaliações, calendários do GHL em iframe) saem e entram no relatório, como no PR 191.
- O resultado vira um setup em **Importados**, com `origem: GHL`, a data e o nome da subconta, e o relatório de notas do conversor.

**Graao (tela)**
- Botão **Importar do GHL** em Setups de conta (ao lado de Importar setup), abrindo uma janela com o passo a passo, o código, o progresso e o relatório. Segue o padrão de página em seções e os diálogos de `ui/ask.js` (sem popups nativos).

**Documentação**
- Artigo novo em `docs-site/src/content/docs/agencia/` ("Importar do GHL") com prints da Agência Demo local, linha em novidades, `docs:secoes` e `cobertura.json`.

## O que fica para quem constrói

- Formato exato das partes enviadas e do estado do job de importação.
- Onde guardar as páginas fora do estado da agência (R2 ou tabela própria), desde que a instalação do setup as encontre.
- Ordem e tamanho dos lotes de páginas e imagens.
- Visual da janela de importação, dentro do design system.
- Testes: conversão a partir das extrações do PR 191 (`.gstack/tmp/ghl`) como fixture, rotas com código válido, expirado e usado, e um teste da extensão com uma página falsa do GHL.

## Decisões minhas (a conferir)

- Código de importação de 30 minutos e uso único, em vez de a extensão fazer login no graao: evita guardar sessão do graao na extensão e funciona em qualquer navegador logado.
- Sem tradução automática na v1.
- Copiar as imagens para o graao na importação, por causa das agências que vão cancelar o GHL.
- Site com mais de 50 páginas entra com as 50 primeiras.
