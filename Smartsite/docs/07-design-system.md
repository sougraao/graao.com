# Design System

Status: IMPLEMENTED (Task 2, 2026-11-23). Código: `Smartsite/site/src/layouts/Base.astro`, `src/styles/site.css`, kit em `site/public/assets/`.

## Direção visual
- Marca e posicionamento: graao — "A plataforma brasileira para Marketing 360". Editorial contemporâneo, neutro (90–95% da interface), a cor vem do mascote, do produto e de um único acento.
- Público: agências, profissionais de marketing, pequenas empresas brasileiras.
- Base: kit "tasteskill 2.5" (system.css/system.js/motion), tipo de página `software`, acordo sorteado: hero `collage`, nav `nav-mega`, rodapé `footer-statement` + `close-type`, ritmo `dark-band`, botões `solid`, momentos `word-highlight` e `cursor-spotlight`.
- Logo: mascote oficial caveira-chama (`ui/skull_flame.svg` → `public/brand/graao.svg`) + "graao" em minúsculas.

## Tokens
| Token | Valor | Uso |
|---|---|---|
| `--p-bg` | `#faf8f7` | fundo da página |
| `--p-surface` | `#f3eef0` | superfícies, painéis |
| `--p-ink` | `#1c1519` | texto (≥ 7:1) |
| `--p-muted` | `#655b61` | rótulos e metadados (≥ 4.5:1) |
| `--p-action` / `--p-accent` | `#b8008a` | botão primário, links, foco — texto branco sobre ele 5,6:1 |
| `--pink` | `#ff00bb` | marca: mascote, superfícies e destaques grandes. **Nunca** cor de texto sobre claro (≈ 3,3:1) |
| `--pink-ink` | `#a00070` | texto de destaque sobre claro |
| `--orange` | `#ff7a1a` | **PROPOSTO — HEX oficial pendente.** Só superfícies e o filete do aviso de recurso nível B |
| `--p-inv-*` | `#1c1519` / `#faf8f7` | faixa escura |
| font-display / font-text | Familjen Grotesk 400–700 (Google Fonts, OFL) | títulos 400, texto 400, botões/rótulos 500 |
| font-mono | IBM Plex Mono | números e trechos técnicos |
| escala, espaçamento, grid, raios, motion | do kit (`--s-1…--s-10`, grid de 12 colunas, `data-radius="soft"` 8/12/20, durações 120–220 ms) | |

Tipografia oficial: **pendente** — Familjen Grotesk é proposta do builder.

## Componentes
| Componente | Função | Caminho |
|---|---|---|
| Header | nav fixa; mega menu de Funcionalidades (Atrair, Converter, Atender e gerir); "Entrar" + CTA primário; menu mobile com `aria-expanded` (system.js) | `src/components/Header.astro`, `src/data/nav.json` |
| Footer | fechamento com CTA "Começar com a graao" + colunas + legal + Instagram/YouTube | `src/components/Footer.astro` |
| Cta | `comecar` (sempre `LOGIN_URL`), `planos`, `link` | `src/components/Cta.astro` |
| Faq | perguntas abertas por inteiro (sem acordeão), JSON-LD FAQPage quando não há marcador | `src/components/Faq.astro` |
| Breadcrumbs | trilha + JSON-LD BreadcrumbList | `src/components/Breadcrumbs.astro` |

## Responsividade e acessibilidade
- Mobile-first; testes em 320, 390, 768, 1024, 1440.
- Navegação mobile: folha em tela cheia do kit; Escape fecha; foco visível 2px em `--action`.
- Alvos de toque ≥ 44px (botões do kit). `prefers-reduced-motion` respeitado pelo kit.
- Skip link "Pular para o conteúdo".

## Decisões
- FAQ aberto por inteiro (regra do kit) em vez de acordeão: atende I08 sem esconder conteúdo de buscadores.
- Pink da marca vira `--p-action` escurecido (`#b8008a`) para passar AA com texto branco.
