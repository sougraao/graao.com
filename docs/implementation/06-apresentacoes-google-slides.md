# 06 · Apresentações — engenharia reversa do Google Slides e plano para o graao

Data: 2026-11-23 · Ferramenta: REA (MCP) via Chrome DevTools, perfil temporário e anônimo.
Alvo: apresentação pública de exemplo da API do Slides (`1EAYk18WDjIG-zp_0vLm3CsfQh_i8eXc67Jo2O9C6Vuc`, "Baby album"), aberta em `/edit`.

Legenda de confiança: **[obs]** observado nos artefatos capturados · **[inf]** inferência a partir do que foi observado · **[?]** em aberto.

Evidências REA (sessão local, exportadas em `scratchpad/rea/bundle1.json`):

| Evidência | O que contém |
|---|---|
| `ev_48cad505…` | lista de alvos CDP (Chrome 157, aba "Baby album - Google Slides") |
| `ev_7cfcb2ff…` | inspeção passiva: DOM (1.761 nós), 58 scripts, recursos, armazenamento |
| `ev_851c7af8…` | mesma página com código-fonte dos scripts (≈15 MB), exportado com `export_web_scripts` |
| screenshot `sha256 5abf7e4f…` | editor em modo "Somente ver" |

Complemento: documento de descoberta público da Slides API v1 (155 schemas, 49 tipos de request), que é a forma pública do mesmo modelo.

---

## 1. O que o Google Slides é por dentro

### 1.1 O documento é um log de comandos, não um JSON de estado [obs]

A página não recebe "a apresentação" pronta. Ela recebe 5 scripts inline `var modelChunk = {"parts":[{"commands":[...]}],"revision":4}` com **365 comandos** que o editor reexecuta para montar o modelo em memória. Os mesmos comandos são o que o editor envia ao salvar (ver 1.5). Cada comando é um array posicional `[opcode, ...args]`; as propriedades vêm como listas esparsas `[chave, valor, chave, valor…]` com chaves numéricas.

| Opcode | Uso observado | Exemplo (encurtado) |
|---|---|---|
| `1` | tamanho da página | `[1,[365760,274320],…]` |
| `45` | idioma do documento | `[45,[],[0,"en"],[]]` |
| `13` | registra os tipos de página (p, m, l…) | `[13,0,1,"m","l"]` |
| `12` | cria página: mestre, layout ou slide | `[12,"p3",1,1,[1,"simple-light",2,"TITLE_AND_BODY"]]` |
| `9` | propriedades de página (fundo, tema) | `[9,[],[8,800,9,600,49,"<blobId>"],"ge63…_0",[]]` |
| `3` | cria elemento na página | `[3,id,tipo,[a,b,c,d,tx,ty],props,pageId]` |
| `15` | insere texto num elemento | `[15,"ge63…_7",null,0,"Baby Album"]` |
| `41` | cria entidade de lista (níveis de marcador) | `[41,id,null,"bodyPlaceholderListEntity",[nível,[estilo]…]]` |
| `17` | aplica estilo de parágrafo num intervalo | `[17,id,null,5,6,[],[30,0,12,1,15,3.6],[],1]` |
| `43` | transição do slide | `[43,[],[1,1000,0,0],"ge63…_0",[]]` (1000 ms) |

Frequência no deck: `17`×244, `3`×64, `15`×21, `12`×12, `41`×12, `9`×6, `13`×3, outros ×1.

### 1.2 Hierarquia mestre → layout → slide (com herança) [obs]

- 1 **mestre** `simple-light` com um **esquema de 12 cores de tema** (`Custom 347`: texto escuro, fundo claro, 2 neutros, 6 destaques, link, link visitado).
- 6 **layouts** filhos do mestre: `TITLE`, `TITLE_AND_BODY`, `TITLE_AND_TWO_COLUMNS`, `TITLE_ONLY`, `CAPTION_ONLY`, `BLANK`. O bundle também traz `SECTION_HEADER`, `SECTION_TITLE_AND_DESCRIPTION`, `ONE_COLUMN_TEXT`, `MAIN_POINT`, `BIG_NUMBER`.
- 5 **slides**, cada um apontando para mestre + layout (`[1,"simple-light",2,"BLANK"]`).
- 1 **página de notas** (`n`) com `n:slide` (miniatura do slide) e `n:text` (anotações do apresentador).
- Os placeholders do layout (`p1_i2`, `p3_i2`…) só carregam **estilos por nível de lista** (fonte, tamanho, recuo); o texto fica vazio (`"\n\n\n…"`). O slide herda esses estilos. [inf] É o mesmo mecanismo do `Placeholder.parentObjectId` da API.

### 1.3 Geometria [obs + inf]

- Página 4:3 = `365760 × 274320` unidades. Na API, 4:3 = `9144000 × 6858000` EMU, então **1 unidade interna = 25 EMU = 1/508 pt** [inf]. Confirma: espessura de linha `22: 508` = 1 pt.
- Todo elemento tem uma **matriz afim** `[scaleX, shearY, shearX, scaleY, translateX, translateY]` sobre um tamanho base. Imagens guardam o tamanho intrínseco em px (`8: 524, 9: 383`) e a matriz escala (`457.2` ≈ unidades por px) [inf]. Rotação e espelhamento cabem na mesma matriz.
- Tipos de elemento vistos: `3` imagem (`49` = id do blob), `6` linha (`15` cor, `22` espessura), `108` caixa de texto/placeholder, `158` miniatura do slide na página de notas. A API documenta **143 tipos de forma** e os tipos imagem, vídeo, tabela, linha, grupo, gráfico do Sheets e Word Art.

### 1.4 Renderização: SVG no DOM, não canvas [obs]

DOM com 563 `<g>`, 95 `<text>`, 66 `<path>`, 42 `<clipPath>`, 40 `<image>`, 14 `<svg>`. Cada slide (palco e cada miniatura da tira lateral) é um `<svg>` próprio; imagens são recortadas com `clipPath`. Não há `<canvas>` entre os nós mais frequentes.

### 1.5 Salvamento, colaboração e serviços [obs no código + inf]

- **`POST …/save`** monta `rev`, `bundles` (lotes de comandos serializados), `blobIdMap` (mapa de imagens enviadas) e `syncReason`. Ou seja: o cliente aplica o comando localmente na hora e envia o lote com a revisão de base. [inf] O servidor transforma lotes concorrentes (OT) e devolve a nova revisão.
- **`/test` + `/bind`**: canal WebChannel (long-polling com `sid`, `AID=`, `X-Same-Domain`) que entrega os comandos dos outros colaboradores e a presença (cursores).
- **`/renderdata`**: lote de `renderOps` pedido ao servidor para o que o navegador não renderiza sozinho (ex.: gráficos vinculados).
- **`/theme`** devolve `cmds`: **temas também são logs de comandos** aplicados ao documento.
- **`/revisions/load`, `/revisions/tiles`, `/revisions/revert`, `/revisions/revertelement`, `/getheadrevisionname`**: histórico de versões com nomes e reversão por elemento.
- **`/export/<formato>?id&pageid`**: PDF, PPTX, PNG etc. gerados no servidor.
- Offline: IndexedDB, Service Worker, SharedWorker e BroadcastChannel aparecem no bundle (sincronização entre abas e modo offline).

### 1.6 Recursos do editor (strings pt_BR do bundle `presentations.editor_js_prod`) [obs]

- **Slides**: novo, duplicar, pular slide, importar slides, aplicar layout, plano de fundo, editar tema, transição (Dissolver, Esmaecer, Deslizar da direita/esquerda, Virar, Cubo, Galeria).
- **Animações por objeto**: Aparecer, Desaparecer, Esmaecer, Voar, Deslizar para dentro/fora, Aumentar/Diminuir zoom, Girar; gatilho "Ao clicar" (e encadeamento).
- **Organizar**: agrupar, alinhar (acima/meio/abaixo, à grade, a guias), distribuir na horizontal/vertical, trazer para frente, girar 90°, guias, exibição em grade.
- **Inserir**: imagem (cortar, sombra projetada, reflexo, texto alternativo), tabela (distribuir linhas/colunas, tabela vinculada), Word Art, diagramas, linhas (conector reto/curvado/angulado, polilinha, rabisco), 29 formas de fluxograma, gravação de vídeo com webcam.
- **Apresentar**: visualização do apresentador, anotações (ditar, falar), legendas.
- **Outros**: localizar e substituir, publicar na Web, configuração da página, Gemini ("Criar imagem de slide", "Peça ao Gemini").

---

## 2. O que o graao já tem

| | Apresentações (`ui/presentations.js`, `ui/presentation-data.js`, `presentation-model.mjs`) | Prancheta (`ui/prancheta.js`, `prancheta-model.mjs`) |
|---|---|---|
| Modelo | slide = **formulário** com 8 layouts fixos (`cover`, `pain`, `solution`, `services`, `sales`, `bundle`, `process`, `blank`) e campos (eyebrow, headline, pills, items, cards, steps) | página = lista de **nós livres** (`RECTANGLE`, `TEXT`…) com `x, y, width, height, fills`, estilo Figma |
| Edição | inspetor lateral edita campos; o slide é HTML gerado | arrastar, inspetor de nó, formas e texto |
| Tema | 2 cores (primária, destaque) + logo | por nó |
| Entrega | link público `/apresentacao/<token>`, PDF por impressão, modo apresentação | download de imagem |
| Limites | máx. 50 lâminas, sem posicionamento livre, sem mestre/layout editável, sem undo, sem colaboração | sem mestre/layout, sem modo apresentação |

A distância para o Slides não está no visual: está no **modelo**. O construtor atual é um gerador de propostas por formulário. Para chegar perto do Slides é preciso o modelo de elementos livres (que a Prancheta já tem) somado à hierarquia tema → layout → slide e a um log de operações.

---

## 3. Arquitetura proposta para o graao

Decisões tiradas do que foi observado; os itens marcados **(escolha)** são de design nosso, não do Google.

1. **Documento = estado + log de operações.** Guardar o estado materializado (`presentations[].doc`) para leitura rápida e aplicar edições como operações pequenas (`createElement`, `updateTransform`, `insertText`, `updateTextStyle`, `createSlide`, `moveSlides`, `deleteObject`…), no mesmo formato dos 49 requests da API. Isso dá desfazer/refazer, autosave em lote (`/save` com `rev` + lote) e abre caminho para colaboração. **(escolha)** Operações em JSON nomeado, não arrays posicionais.
2. **Hierarquia tema → layout → slide.** Tema = 12 cores + par de fontes + mestre; layout = placeholders tipados (`TITLE`, `SUBTITLE`, `BODY`, `PICTURE`, `SLIDE_NUMBER`…); elementos do slide guardam só o que sobrescrevem. Trocar o tema reestiliza o deck inteiro. Os 8 layouts atuais viram layouts do tema "Proposta graao", então as apresentações existentes continuam abrindo.
3. **Geometria em pontos com matriz afim** `{a,b,c,d,tx,ty}` + `size`. **(escolha)** Pontos em vez de EMU/25: mais simples, e a exportação PPTX converte (1 pt = 12.700 EMU).
4. **Render em SVG**, um `<svg viewBox>` por slide, reaproveitado no palco, na tira de miniaturas, no modo apresentação, no link público e no PDF. Texto com `<foreignObject>` para edição rica, ou `<text>` com quebra calculada.
5. **Reaproveitar a Prancheta**: seleção, arraste, alças de redimensionar e girar, inspetor de nó e formas já existem; extrair esse núcleo para um módulo comum de canvas.
6. **Colaboração em fases**: v1 com trava otimista (`rev` + rejeição em conflito); v2 com servidor transformando lotes concorrentes e um canal SSE/WebSocket para presença.

### Fases sugeridas

| Fase | Entrega | Base no Slides |
|---|---|---|
| **F1 · Núcleo** | modelo novo (tema/layout/slide/elementos), migração dos 8 layouts, render SVG, caixa de texto, forma, imagem, linha; mover, redimensionar, girar; desfazer/refazer; autosave por operações | 1.1–1.4 |
| **F2 · Editor completo** | tabela, agrupar, alinhar e distribuir, guias e grade, ordem z, cortar imagem, listas e estilos por nível, editar tema e layouts, tira com arrastar para reordenar | 1.2, 1.6 |
| **F3 · Apresentar** | transições e animações por objeto, visualização do apresentador com notas e cronômetro, link público e PDF no novo render, exportação PPTX | 1.5, 1.6 |
| **F4 · Colaboração e IA** | histórico de versões, comentários, edição simultânea com presença, "gerar slide/imagem" com a IA do graao | 1.5 |

## 4. Em aberto

- **[?] Interface de edição real**: sem login o documento abre em "Somente ver", então a barra de ferramentas de edição, os painéis de formatação e o editor de tema não foram observados ao vivo, só pelas strings do bundle. Para observar, é preciso abrir uma cópia editável com uma conta Google sua.
- **[?] Tráfego de `/save` e `/bind`**: o formato foi lido no código, mas nenhuma requisição foi capturada (modo leitura não salva).
- **[?] Semântica exata** das chaves numéricas de propriedade (`44`, `54`, `55`, `14`, `18`…) e do tamanho base das caixas de texto; não é necessário para recriar, já que a API pública documenta os campos equivalentes.
