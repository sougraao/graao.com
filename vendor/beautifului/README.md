# Beautiful UI (registry original)

Cópia do registry shadcn de https://www.beautifului.dev (licença MIT, Shane Levine), baixada em 2026-11-21.

- `r/` guarda o JSON de cada item (27 no total) como o site serve em `/r/<nome>.json`.
- `src/` guarda os fontes extraídos desses JSON (React/TSX + `foundation.css` com Tailwind v4).

O graao.app não usa React nem Tailwind, então nada daqui é servido. A versão em uso foi portada para JS puro:

- `ui/beautiful-ui.js`: `loadingState`, `thinkingState`, `shimmer`, `streamText`, `streamCaret`, `toolChips`,
  `approvalCard`, `taskRows`, `recommendationCard`, `contextCards`, e os átomos `button`, `monogram`,
  `entityChip`, `valuePill`, `glideMenu`
- `ui/beautiful-ui.css`: tokens `--bui-*` apontando para os tokens `--g-*` do app (tema claro/escuro e marca)

- `ui/beautiful-ui-more.js`: `searchList`, `filterTable`, `codeBlock`, `diffTable`, `streamingText`,
  `chatComposer`, `promptBar`, `sidebarNav`, `flowchart`, `insightCards` (+ `lineChart`, `mention`, `monoValue`),
  `fineTuneCard` (+ `scrubField`), `selectionActions`, `recordsTable`

Todos os 27 itens estão portados. Vitrine com todos em `/beautiful-ui.html` (dados de exemplo).

## Onde cada componente está em uso

`ui/bui-mounts.js` monta os componentes depois de cada render: as telas deixam marcadores `data-bui="…"`
e as ações reaproveitam os handlers do app (`data-edit`, `data-go`, `data-task`…).

| Componente | Onde |
| --- | --- |
| LoadingState, ThinkingState, StreamText (cursor) | Pergunte à Graao; teste e construtor de agentes |
| PromptBar | Compositor do teste de agentes (`/` traz mensagens de teste prontas, ditado por voz) |
| StreamingText | Resposta do agente no teste, com as bases consultadas como fontes |
| ChatComposer (visual do fio) | Construtor de agentes por chat |
| ApprovalCard | "Prefere responder a algumas perguntas?" na criação de agente |
| TaskRows | Painel Atividade do agente |
| ToolChips | Logs dos agentes (fontes consultadas) |
| ContextCards | Bases de conhecimento → Testar a busca |
| SelectionActions | IA de conteúdo nos editores (prévia antes de aplicar) |
| RecordsTable | Contatos → Listas inteligentes |
| FilterTable | Contatos → Tarefas |
| DiffTable | Prévia da importação de contatos (CSV) |
| Search | Busca global (Ctrl K), na subconta e na agência |
| InsightCards, RecommendationCard | Topo do Painel (dados reais de oportunidades, contatos e tarefas) |
| Flowchart | "Ver fluxo" na lista de workflows |
| CodeBlock | Código de rastreamento; documentação de API e apps da agência |
| FineTuneCard | Editor de e-mail: blocos de imagem (largura, alinhamento) e espaçador (altura) |
| SidebarNav | Só na vitrine. Os lugares que ela caberia (barra lateral do app, histórico da Graao) perderiam recursos que já existem. |

Diferenças em relação ao original:
- InsightCards usa um gráfico SVG próprio (`lineChart`) no lugar da lib `liveline`.
- O brilho arco-íris do PromptBar ao trocar de modelo é um gradiente CSS no lugar do shader `glimm`.
- Os ícones `iconoir-react` e `@central-icons-react` viraram SVGs inline.
- Sem as demos automáticas: os componentes reagem a dados e callbacks reais (`onSend`, `onRun`, `compute`…).
- RecordsTable traz ordenação, seleção, redimensionamento, etiquetas com “+N” e a coluna de IA calculada linha a
  linha; o painel de configuração de propriedade do original (tipo, ferramenta, grounding) não foi portado.
