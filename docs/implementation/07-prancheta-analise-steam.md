# 07 · Prancheta da Steam: como funciona (análise para o graao)

Fonte analisada: `D:\meus documentos\Steam\src\tools\prancheta` (LAB Um Cara Caramelo).
Data: 2026-11-23.

## 1. Resumo

A Prancheta da Steam é um editor de design no estilo Figma, desenhado em
`<canvas>` 2D, escrito em React 19 + TypeScript e empacotado pelo Vite. São
cerca de 14,9 mil linhas de código próprio (sem contar a lista de 1.582 fontes
do Google, em `googleFontsList.ts`). A única dependência de execução fora do
React é o MediaPipe, carregado por CDN só quando alguém remove o fundo de uma
imagem.

A Prancheta atual do graao (`ui/prancheta.js`, 1.254 linhas) é outra coisa: um
editor em DOM, com lâminas, formas simples (retângulo, círculo, texto, linha,
seta) e um inspetor básico.

As duas já conversam em parte:

- `Steam/src/tools/prancheta/graaoRepo.ts` fala com `/api/prancheta/*` do
  `server.mjs` do graao (porta padrão 4317), com `?workspace=<subconta>`.
- `prancheta-model.mjs` do graao guarda o documento da Steam (`DocumentData`)
  no campo `document` de cada arquivo, e `graaoToDocument`/`documentToGraao`
  convertem entre os dois formatos.
- `PranchetaApp.tsx` troca de repositório sozinho: com `workspace` usa o graao,
  sem ele usa o Supabase do LAB.

## 2. Arquitetura em camadas

| Camada | Arquivos | Linhas | O que faz |
|---|---|---|---|
| Casca / galeria | `PranchetaApp.tsx`, `prancheta.css` | 385 | "Meus arquivos": busca, criar, usar exemplo, renomear, excluir, abrir editor por `?file=` |
| Persistência remota | `repo.ts`, `graaoRepo.ts`, `session.ts` | 440 | Repositório (Supabase ou graao) e sessão de salvamento |
| Modelo | `model/types.ts`, `document.ts`, `defaults.ts`, `sample.ts` | 925 | Árvore de nós, matrizes, operações de árvore |
| Estado | `store/store.ts` | 342 | Store único com histórico, seleção, câmera, ferramenta |
| Ações | `actions.ts` | 1.247 | Toda mutação do documento (agrupar, alinhar, componentes…) |
| Comandos | `commands.ts` | 573 | ~80 comandos com atalhos, menu principal e de contexto |
| Canvas | `canvas/*` (10 arquivos) | 2.986 | Render, interação, hit test, snapping, overlay, formas, remoção de fundo |
| Entrada/saída | `io/export.ts`, `persist.ts`, `clipboard.ts` | 916 | PNG/JPG/SVG, ZIP de carrossel, JSON local, área de transferência |
| Interface | `ui/*` (12 componentes + CSS) | 5.081 | Barra de ferramentas, camadas, inspetor, seletor de cor/fonte/efeito |
| Fontes | `fonts.ts`, `googleFontsList.ts` | 14.306 | Fontes em destaque, carregamento sob demanda |

## 3. Modelo de documento

```ts
DocumentData {
  version: 1; name: string;
  pages: Page[];                       // { id, name, children[], background|null }
  nodes: Record<string, SceneNode>;    // mapa plano, árvore por parentId/children
  images: Record<string, string>;      // id -> data URL
}
```

- **Tipos de nó:** FRAME, GROUP, COMPONENT, INSTANCE, BOOLEAN_OPERATION,
  RECTANGLE, ELLIPSE, POLYGON, STAR, LINE, TEXT, VECTOR.
- **Geometria:** `x/y` é o canto da caixa sem rotação, no espaço do pai;
  rotação (graus, anti-horária) e espelhamento em torno do centro. Tudo passa
  por matrizes 2D (`localMatrix`, `worldMatrix`, `applyLocalMatrix`).
- **Pintura:** `fills[]` e `strokes[]` com SOLID, IMAGE (FILL/FIT/STRETCH),
  GRADIENT_LINEAR e GRADIENT_RADIAL (paradas + ângulo).
- **Efeitos:** sombra interna, sombra projetada, desfoque de camada, desfoque
  de fundo, ruído, textura, vidro (ângulo e intensidade da luz, refração,
  profundidade, dispersão, fosco, splay) e shader (beta).
- **Auto layout:** `layoutMode` NONE/HORIZONTAL/VERTICAL, espaçamento,
  preenchimentos, alinhamento nos dois eixos, `layoutGrow`, tamanho
  FIXED/HUG/FILL.
- **Texto:** família, peso, tamanho, altura de linha, espaçamento, alinhamento,
  auto-redimensionamento (largura+altura, altura, fixo).
- **Vetor:** pontos normalizados ou caminho exato (M/L/A), ponta e junção.
- **Carrossel:** frame com `isCarousel` e `carouselPages`, fatias de 1080×1440,
  e `guides[]` por nó.
- **Componentes:** COMPONENT mestre; INSTANCE aponta `componentId`, com
  separar e redefinir alterações; proteção contra ciclos.

## 4. Estado, histórico e comandos

- `EditorStore` (classe única): `doc`, seleção, hover, ferramenta, página,
  câmera (`x, y, zoom` de 2% a 25.600%), tema, edição de texto, menu de
  contexto, toasts. Componentes React assinam com `useEditor()`.
- **Histórico:** `checkpoint()` guarda um instantâneo antes de cada mudança;
  `undo`/`redo` trocam instantâneos. Toda mutação passa por
  `actions.commit(fn, checkpoint)`.
- **Comandos:** registro único (`commands.ts`) com id, rótulo, atalhos e
  `run`. O mesmo registro alimenta o teclado (`installKeyboard`, por posição
  física da tecla), o menu principal, o menu de contexto, a janela de atalhos
  e a paleta "Ações rápidas" (Ctrl+/).

Grupos de comandos: arquivo, editar (desfazer, copiar/colar, colar
propriedades, selecionar pai/filhos/irmãos), ver (zoom, páginas, ocultar
interface), objeto (agrupar, frame, auto layout, ordem, espelhar, girar,
ocultar, bloquear, booleanas, achatar), componentes, vetor, texto, alinhar e
distribuir, imagem (inserir, conta-gotas, remover fundo, "efeito revista").

## 5. Canvas

- **Renderização (`renderer.ts`):** percorre a árvore na ordem de pintura e
  desenha cada nó num `Path2D` (`shapes.ts`). Booleanas são feitas num canvas
  fora da tela com `globalCompositeOperation` (destination-out, source-in,
  xor). Efeitos de vidro e desfoque de fundo capturam e desfocam o que está
  atrás da geometria; ruído e textura usam padrões em overlay/soft-light.
- **Interação (`controller.ts`):** máquina de estados de arraste: `pending`,
  `move`, `resize`, `rotate`, `endpoint` (linhas), `marquee`, `pan`,
  `create`, `pencil`. Mede distâncias entre camadas com Alt.
- **Hit test:** acerto por forma real (`isPointInPath`/`isPointInStroke` com
  tolerância), seleção do frame mais profundo, rótulos de frame clicáveis.
- **Snapping:** bordas e centros dos vizinhos, com guias desenhadas no
  overlay.
- **Overlay:** alças de redimensionar/girar, pílula de dimensões, guias.
- **Texto:** quebra de linha própria medida no canvas (`layoutText`,
  `fitTextBox`); edição num campo sobreposto.

## 6. Interface

- **Barra de ferramentas:** mover, mão, frame, formas (retângulo, elipse,
  linha, seta, polígono, estrela), texto, lápis, imagem, conta-gotas, criar
  componente, booleanas.
- **Painel esquerdo:** páginas (criar, renomear, duplicar, excluir) e árvore
  de camadas com busca, renomear, ocultar e bloquear.
- **Painel direito:** sem seleção mostra página (cor de fundo) e presets de
  frame (iPhone, Android, iPad, MacBook, Desktop, Slides 16:9 e 4:3,
  Carrossel de 2 a 5 slides). Com seleção: instância, booleana, posição
  (alinhar, distribuir, rotação, espelhar), dimensões, auto layout, aparência,
  tipografia, preenchimento, traço, efeitos, ações de IA de imagem e
  exportar.
- **Controles próprios:** seletor de cor (858 linhas, com gradiente e
  conta-gotas), campo numérico com arraste, seletor de fonte com Google
  Fonts, seletor de efeitos, popover de vidro.

## 7. Entrada e saída

- **Exportar:** PNG, JPG e SVG, escalas 1x/2x/…, margem automática para
  sombras e desfoques, um arquivo por camada, copiar como PNG, miniatura do
  documento para a galeria, carrossel fatiado em ZIP montado no navegador.
- **Área de transferência:** prefixo `PRANCHETA/1:` + JSON dos nós; cópia em
  memória quando o navegador bloqueia a leitura; colar imagens de fora.
- **Arquivo local:** `.prancheta.json` (salvar cópia e abrir).
- **`normalizeDocument`:** valida e completa documentos vindos de fora;
  `compactDocument` descarta imagens não usadas.

## 8. Salvamento remoto

- `PranchetaSession`: um escritor por documento, salvamento 700 ms depois da
  última mudança, salvamento ao esconder a aba e aviso no `beforeunload`.
- **Concorrência otimista:** cada gravação envia `expectedUpdatedAt`; o graao
  devolve 409 e o editor mostra "salvar cópia / recarregar".
- Limite de 25 MB por documento (imagens ficam embutidas como data URL).
- No LAB, tabela `prancheta_files` (id, user_id, name, document jsonb,
  size_bytes, thumbnail, timestamps).

## 9. O que o graao já tem para recebê-la

| Rota | Faz |
|---|---|
| `GET /api/prancheta/files` | lista metadados |
| `GET /api/prancheta/file?id=` | devolve o arquivo já convertido com `graaoToDocument` |
| `POST /api/prancheta/save` | cria ou atualiza (documento, miniatura) |
| `POST /api/prancheta/delete`, `/duplicate` | exclui, duplica |
| `GET /api/prancheta/templates`, `POST /template-use` | modelos canônicos e presets |
| `POST /api/prancheta/export-media` | manda a arte para o Mídia Drive |
| `POST /api/prancheta/to-social` | cria post no Social Planner |

Acesso: `workspace=agency` exige capacidade de agência; subconta exige o
módulo `marketing`. Limite de 200 arquivos por agência.

Lacunas encontradas (corrigidas, ver §11):

- `save` não confere `expectedUpdatedAt`, então o 409 da sessão nunca chega.
- A miniatura e as imagens vão inteiras no estado (`state.pranchetaFiles`),
  sem limite de tamanho no servidor.
- `graaoRepo.ts` aponta para `http://127.0.0.1:4317` por padrão.

## 10. Diferença que decide o caminho

O graao não tem etapa de build nem dependências no `package.json`: o front é
JavaScript puro em `ui/`, servido como está. A Prancheta da Steam depende de
React, TypeScript e Vite. Trazer o editor para dentro do graao passa por uma
destas portas:

1. **Pacote pronto:** compilar o editor da Steam num único módulo JS e servir
   em `ui/`, montado na rota `#agency/prancheta` com o `graaoRepo`.
2. **Reescrita em JS puro:** portar o modelo, o canvas e os painéis para
   módulos de `ui/`, no mesmo estilo do resto do graao.
3. **Iframe:** abrir a Prancheta hospedada na Steam dentro do graao.

O plano das Apresentações (`06-apresentacoes-google-slides.md`, item 5) já
prevê extrair o núcleo da Prancheta (seleção, arraste, alças, inspetor) para
reaproveitar nos slides, o que pesa a favor de um núcleo que viva no graao.

## 11. Como ficou no graao (2026-11-23)

Caminho escolhido: **pacote pronto, com o código-fonte dentro do graao**.

| Parte | Onde |
|---|---|
| Código do editor (cópia da Steam, adaptada) | `prancheta-editor/src/editor/` |
| Entrada do graao: abrir, salvar, voltar, Mídia Drive, Social Planner | `prancheta-editor/src/main.tsx`, `repo.ts`, `session.ts`, `graao.css` |
| Build (esbuild, dependências só nesta pasta) | `prancheta-editor/package.json`, `build.mjs` → `npm run build:prancheta` |
| Pacote servido (vai para o git) | `ui/vendor/prancheta-editor.js` e `.css`, espelhados em `public/vendor/` |
| Página do editor | `ui/prancheta-editor.html` (`/prancheta-editor.html?workspace=&file=`) |
| Galeria e abertura do editor | `ui/prancheta.js` (iframe em tela cheia sobre a galeria) |

Decisões:

- **Iframe da própria graao.** O editor tem CSS e atalhos globais (Ctrl+Z,
  Delete, Ctrl+D…). Dentro de um iframe ele não briga com o app e funciona
  igual ao da Steam. A página tem CSP própria: `frame-ancestors 'self'`,
  `'wasm-unsafe-eval'` e `connect-src` para o MediaPipe (jsDelivr, unpkg,
  storage.googleapis.com). O resto do app continua com `frame-ancestors 'none'`.
- **Sem dependências no app.** React e esbuild ficam em
  `prancheta-editor/package.json`; a raiz continua sem `node_modules` e a
  Vercel não instala nada. A pasta `prancheta-editor` fica fora do deploy
  (`.vercelignore`).
- **Arquivos antigos abrem.** `graaoToDocument` converte cada lâmina antiga
  (e os modelos e presets da galeria) num frame do tamanho da arte, lado a
  lado, com a altura de linha convertida de multiplicador para px.
- **Gravação segura.** `checkPranchetaSave` recusa versão antiga com 409 (o
  editor mostra "Reabrir versão salva / Salvar como cópia"), recusa documento
  acima de 25 MB e miniatura que não seja `data:image/`. Gravação só de
  miniatura não apaga a arte nem muda a data de alteração.
  `applyPranchetaSave` mantém miniatura, formato e etiquetas quando a gravação
  não os traz.
- **Galeria leve.** Ao salvar do editor, `pages` guarda só nome e fundo de
  cada frame (para a contagem de slides), sem copiar os nós.
- **Visual da plataforma.** O editor não tem tema próprio: `main.tsx` copia
  do app os tokens `--g-*` já calculados (superfícies, linhas, textos, cor da
  marca da agência, raios, sombras) e o `data-theme`, e acompanha
  `graao:theme-change`. Os tokens do editor (`--surface`, `--blue`…) apontam
  para eles em `graao.css`; seleção, alças e rótulos do canvas usam a cor da
  marca; a fonte é a Plus Jakarta Sans. A galeria (`ui/prancheta.css`) usa só
  tokens `--g-*`; as prévias de arte continuam escuras porque mostram a arte.
- **Mídia Drive e post.** Na subconta, o cabeçalho do editor ganha "Mídia
  Drive" e "Criar post": exporta a seleção (ou o primeiro frame) em PNG e
  manda. Os botões da galeria abrem o editor com `?action=drive|social`.

Para mudar o editor: edite `prancheta-editor/src`, rode
`npm --prefix prancheta-editor install` (uma vez), `npm run build:prancheta`
e `node scripts/sync-public.mjs`, e faça commit do pacote gerado.

Não verificado no navegador: remoção de fundo com IA (depende do CDN do
MediaPipe) e o fluxo dentro de uma subconta pela interface, porque a tela da
subconta mostra a Prancheta como "Ferramenta da Agência".
