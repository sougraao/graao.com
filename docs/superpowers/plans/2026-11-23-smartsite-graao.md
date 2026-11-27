# Smartsite graao Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Site institucional completo do graao (~37 páginas) em Astro estático, em `Smartsite/site/`, pronto para `www.graao.com`, sem publicar.

**Architecture:** Astro SSG com três layouts (Core, Funcionalidade, Solução) sobre um `Base`. Funcionalidades e soluções são content collections em Markdown com frontmatter tipado; páginas core são `.astro`. Um teste `node:test` lê `dist/` e garante as invariantes de SEO, links, copy e conversão em todas as páginas.

**Tech Stack:** Astro (última estável via `npm create astro@latest`, TypeScript strict), `@astrojs/sitemap`, CSS próprio com tokens (sem Tailwind), JS vanilla só nas ilhas de interação, `node:test` para os testes de saída, navegador embutido para QA visual.

**Spec:** `docs/superpowers/specs/2026-11-23-smartsite-graao-design.md`

## Global Constraints

- Tudo dentro de `Smartsite/`. Nunca editar `server.mjs`, `ui/`, `public/`, `api/`, `vercel.json` nem `ui/landing.html`.
- `SITE_URL = 'https://www.graao.com'`; `LOGIN_URL = 'https://graao.com/login'` — definidos só em `src/config.ts`.
- pt-BR (`<html lang="pt-BR">`); marca sempre "graao" minúsculo.
- H1 da home: "A plataforma brasileira para Marketing 360." Linha de campanha: "Tudo que seu marketing precisa. Inclusive bom gosto."
- CTA primário: texto "Começar com o graao", href `LOGIN_URL`, `data-cta="comecar"`.
- Proibido no HTML gerado: nomes de concorrentes (HighLevel, GoHighLevel, GHL, HubSpot, RD Station, Kommo, ActiveCampaign, Wix, Hotmart, Kajabi), "24h", "24/7", "grátis", "garantido", "teste gratuito", `chat.whatsapp.com`, `aggregateRating`.
- Informação ausente vira marcador visível `[[descrição]]`; página que contém `[[` recebe `<meta name="robots" content="noindex">` e fica fora do sitemap.
- Pink da marca `#ff00bb` nunca como cor de texto sobre fundo claro; texto/link de destaque `#a00070` ou mais escuro (AA ≥ 4.5:1).
- Sem degradês decorativos, glow, glassmorphism, emoji como ícone; `prefers-reduced-motion` respeitado; nenhum conteúdo de SEO escondido atrás de JS.
- Claims de produto só nível A do registro de evidências; nível B com redação honesta ("registro interno, sem integração externa por enquanto") ou omitido.
- Commits na branch `feat/smartsite`, sem push.

## Review Focus

1. Link interno para rota inexistente (ex.: funcionalidade citada em `related` sem arquivo) → build não pode passar; teste `links internos resolvem` (Task 1) cobre.
2. Página com marcador `[[...]]` indexável ou no sitemap → teste `páginas com marcador têm noindex e estão fora do sitemap` (Task 1).
3. Largura 320px com títulos longos ("cursos-e-area-de-membros", H1 da home) → sem overflow horizontal; checagem `scrollWidth <= innerWidth` em 320/390 (Task 9).
4. Navegação sem JS ou só teclado (menu mobile, filtro de funcionalidades, FAQ) → todo link existe no HTML; Escape fecha o menu; teste `menu e filtro funcionam sem JS` (Task 2 e Task 4).
5. Frontmatter inválido (nível de evidência fora de A/B, slug duplicado) → schema Zod rejeita no build (Task 3).

---

### Task 1: Projeto Astro, configuração e testes de saída

**Files:**
- Create: `Smartsite/site/` (scaffold Astro "minimal", TS strict), `Smartsite/site/astro.config.mjs`, `Smartsite/site/src/config.ts`, `Smartsite/site/src/layouts/Base.astro`, `Smartsite/site/src/pages/index.astro` (stub), `Smartsite/site/public/robots.txt`, `Smartsite/site/tests/output.test.mjs`
- Modify: `Smartsite/site/package.json` (scripts)

**Interfaces:**
- Produces: `src/config.ts` exporta `SITE_URL`, `LOGIN_URL`, `BRAND = 'graao'`. `Base.astro` props `{ title: string; description: string; noindex?: boolean; jsonLd?: object[] }`, gera `<title>`, description, canonical `SITE_URL + Astro.url.pathname`, OG básicos, `lang="pt-BR"`. Scripts: `npm run build`, `npm test` (= `node --test tests/`), `npm run check` (= build + test).

- [ ] **Step 1:** Criar branch `git switch -c feat/smartsite`; scaffold `npm create astro@latest Smartsite/site -- --template minimal --typescript strict --no-git --install`; `npx astro add sitemap --yes`. `astro.config.mjs`: `site: SITE_URL`, `trailingSlash: 'always'`, `build.format: 'directory'`, sitemap com `filter` que exclui páginas marcadas (lista gerada a partir de `[[` — ver Step 4).
- [ ] **Step 2: Escrever `tests/output.test.mjs`** (lê todos os `dist/**/*.html`). Testes:
  - `toda página tem lang pt-BR, um único h1, title, description e canonical em SITE_URL`
  - `links internos resolvem` (todo `href` começando com `/` aponta para arquivo existente em `dist/`)
  - `nenhum termo proibido` (lista de Global Constraints, case-insensitive, no texto e atributos)
  - `páginas com marcador têm noindex e estão fora do sitemap` (`[[` ⇒ meta robots noindex e URL ausente de `dist/sitemap-0.xml`)
  - `CTA comecar aponta para LOGIN_URL` (todo `[data-cta="comecar"]` tem `href="https://graao.com/login"`)
  - `JSON-LD é JSON válido`
  - `pink não é cor de texto` (nenhum `color:\s*#ff00bb` no CSS de `dist/`)
- [ ] **Step 3:** `npm test` sem build → FAIL (dist inexistente). Esperado: falha.
- [ ] **Step 4:** Implementar `config.ts`, `Base.astro`, stub da home com H1 oficial; integração de sitemap filtrando páginas cujo HTML contém `[[` (hook `astro:build:done` ou filtro por lista de rotas `noindex` exportada de `src/noindex.ts`). `robots.txt`: `Allow: /` + `Sitemap: https://www.graao.com/sitemap-index.xml`.
- [ ] **Step 5:** `npm run check` → build OK e todos os testes PASS.
- [ ] **Step 6:** Commit `feat(smartsite): scaffold Astro e testes de saída`.

### Task 2: Design system e componentes compartilhados

**Antes de começar:** carregar o skill `design-taste-frontend` e seguir sua direção dentro das restrições do spec §8.

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/global.css`, `src/components/Header.astro`, `Footer.astro`, `Cta.astro`, `Faq.astro`, `Breadcrumbs.astro`, `Section.astro`, `Mascot.astro`, `public/brand/` (copiar `graao-isotipo-1x1.png`, `ui/skull_flame.svg`, `ui/brand/flame/*.svg` da raiz do repo)
- Modify: `Base.astro` (inclui Header/Footer/estilos), `Smartsite/docs/07-design-system.md`

**Interfaces:**
- Produces: `Cta` props `{ kind: 'comecar' | 'planos' | 'link'; href?: string; label?: string; variant?: 'primary' | 'secondary' }` — `comecar` sempre usa `LOGIN_URL` e o texto oficial. `Faq` props `{ items: { q: string; a: string }[]; jsonLd?: boolean }` com `<details>/<summary>`. `Breadcrumbs` props `{ trail: { label: string; href: string }[] }` (emite JSON-LD BreadcrumbList). Header lista Funcionalidades, Soluções, Planos, Suporte + CTA; navegação de grupos via `src/data/nav.ts` exportando `NAV`.
- Tokens: `--pink: #ff00bb`, `--pink-ink: #a00070`, `--ink`, `--paper`, `--orange` (proposto, marcado PENDENTE no doc 07), fonte escolhida (Google Fonts, licença aberta), escala, espaçamento, raios, `--ease`, durações 120–220ms.

- [ ] **Step 1:** Adicionar teste `menu e filtro funcionam sem JS`: no HTML de `/`, todos os links de `NAV` existem como `<a href>` dentro do `<header>` sem depender de script.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar tokens, componentes e Header (menu mobile em `<details>` ou botão com `aria-expanded`, fecha com Escape, foco visível, alvos ≥ 44px). Preencher `docs/07-design-system.md` com tokens, escolhas e contraste medido.
- [ ] **Step 4:** `npm run check` → PASS. Abrir no navegador embutido em 390 e 1440 e conferir header/footer.
- [ ] **Step 5:** Commit `feat(smartsite): design system e componentes`.

### Task 3: Registro de evidências e content collections

**Files:**
- Modify: `Smartsite/documents/PRODUCT_EVIDENCE_REGISTER.md`
- Create: `src/content.config.ts`

**Interfaces:**
- Produces: collections `funcionalidades` e `solucoes`. Schema comum: `title` (≤ 60), `description` (≤ 160), `h1`, `pergunta` (a pergunta que a página responde), `ordem: number`, `faq: {q,a}[]` (opcional). `funcionalidades` adiciona `evidencia: 'A' | 'B'`, `fontes: string[]` (arquivos do repo), `objetivos: ('atrair'|'converter'|'atender'|'reter'|'gerir')[]`, `relacionadas: reference('solucoes')[]`. `solucoes` adiciona `funcionalidades: reference('funcionalidades')[]`.

- [ ] **Step 1:** Ler o código de `twilio.mjs`, `phone-model.mjs`, `voice-ai.mjs`, `web-push.mjs`, `abacatepay.mjs`, `email-campaign-send.mjs`, `email-domain.mjs`, `scheduling-model.mjs`, `reputation-*.mjs` e classificar cada recurso A/B no registro (arquivo de origem + o que é real + condição de env). Resultado: tabela no registro cobrindo as 17 funcionalidades do spec §6.
- [ ] **Step 2:** Escrever `content.config.ts` com o schema acima (Zod via `astro:content`, loader `glob`).
- [ ] **Step 3:** Criar um arquivo propositalmente inválido (`evidencia: 'C'`) e rodar `npm run build` → FAIL com erro de schema; remover o arquivo.
- [ ] **Step 4:** Commit `feat(smartsite): registro de evidências e schema de conteúdo`.

### Task 4: Funcionalidades (hub + 17 páginas)

**Files:**
- Create: `src/layouts/Funcionalidade.astro`, `src/pages/funcionalidades/index.astro`, `src/pages/funcionalidades/[slug].astro`, `src/content/funcionalidades/*.md` (17: crm, whatsapp-e-atendimento, redes-sociais, sites, funis-e-landing-pages, formularios, automacoes, inteligencia-artificial, prospeccao, agendamentos, email-marketing, reputacao, relatorios, pagamentos-e-pix, cursos-e-area-de-membros, telefone-e-voz, gestao-de-agencias)

**Interfaces:**
- Consumes: collections da Task 3, componentes da Task 2.
- Produces: rotas `/funcionalidades/<slug>/`. Estrutura da página: H1 → resposta direta à `pergunta` (1º parágrafo, AEO) → o que dá para fazer (só itens do registro) → screenshot (ou espaço PENDENTE, Task 7) → soluções relacionadas → FAQ → CTA.

- [ ] **Step 1:** Teste `hub de funcionalidades lista as 17 páginas` (17 links `/funcionalidades/<slug>/` no HTML do hub, presentes sem JS) e `filtro tem lista completa por padrão`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar layout, rotas e hub com filtro por objetivo (I05: botões com `aria-pressed`, contagem de resultados, botão "Ver todas"; sem JS a lista completa aparece).
- [ ] **Step 4:** Escrever os 17 `.md` seguindo `documents/BRAND_AND_COPY.md` (benefício → prova → ação; uma piada por bloco no máximo; nível B com redação honesta).
- [ ] **Step 5:** `npm run check` → PASS.
- [ ] **Step 6:** Commit `feat(smartsite): páginas de funcionalidades`.

### Task 5: Soluções (hub + 8 páginas)

**Files:**
- Create: `src/layouts/Solucao.astro`, `src/pages/solucoes/index.astro`, `src/pages/solucoes/[slug].astro`, `src/content/solucoes/*.md` (agencias, profissionais-de-marketing, pequenas-empresas, negocios-locais, captacao-de-leads, conversao-de-vendas, atendimento-ao-cliente, relacionamento-e-recompra)

**Interfaces:**
- Consumes: `funcionalidades` (via `reference`) para montar o bloco "como o graao resolve" com links.

- [ ] **Step 1:** Teste `cada solução liga a pelo menos 3 funcionalidades e cada funcionalidade é ligada por pelo menos 1 solução` (sem órfãs).
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar layout, rotas, hub e os 8 `.md` (problema do público → como resolve, com links → FAQ → CTA). Ajustar `relacionadas` das funcionalidades se o teste apontar órfãs.
- [ ] **Step 4:** `npm run check` → PASS.
- [ ] **Step 5:** Commit `feat(smartsite): páginas de soluções`.

### Task 6: Páginas core

**Files:**
- Create: `src/layouts/Core.astro`, `src/pages/{planos,sobre,suporte,comunidade,contato,perguntas-frequentes,privacidade,termos}/index.astro`

**Interfaces:**
- Consumes: `Faq`, `Cta`, `Base` (`noindex` quando houver `[[`).

- [ ] **Step 1:** Teste `planos e termos têm noindex enquanto houver marcador` e `privacidade contém o texto de ui/privacidade.html` (compara um trecho distintivo do original).
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar. Planos: estrutura sem preços inventados, `[[preços e condições dos planos]]`. Suporte: suporte brasileiro e calls todos os dias, `[[horário das calls]]`. Comunidade: benefício de cliente, sem link do grupo. Contato: `[[canais de contato oficiais]]` + CTA. Privacidade: conteúdo de `ui/privacidade.html` adaptado ao layout (texto inalterado). Termos: `[[texto dos termos de uso]]`. FAQ: perguntas do brief (facilidade, migração, sites mobile, integrações, preço, Pix, suporte, calls, comunidade, segurança, cancelamento) — respostas só com fatos; o que faltar vira marcador. Sobre: só fatos fornecidos + `[[história e equipe]]`.
- [ ] **Step 4:** `npm run check` → PASS.
- [ ] **Step 5:** Commit `feat(smartsite): páginas core`.

### Task 7: Screenshots reais da plataforma

**Files:**
- Create: `Smartsite/site/public/produto/*.webp`, `src/data/screens.ts`, `src/components/Screen.astro`

**Interfaces:**
- Produces: `screens.ts` exporta `SCREENS: Record<string, { src: string | null; alt: string; legenda: string }>`, chave = slug de funcionalidade ou `home-*`. `Screen` props `{ id: string }`; com `src: null` renderiza espaço identificado "Captura pendente: <legenda>" (sem mockup).

- [ ] **Step 1:** Verificar se a plataforma roda localmente sem credenciais (modo SQLite em `storage.mjs`/`migrate-sqlite.mjs`). Não ler nem usar `.env.local`.
- [ ] **Step 2:** Se rodar: criar workspace com dados fictícios, capturar pelo navegador embutido as telas de CRM, conversas, planejador social, AI Studio, automações, sites/funis, formulários, painel da agência, prospecção; salvar em WebP ≤ 200 KB. Se não rodar: todas as entradas `src: null` e registrar a pendência em `docs/13-pending-information.md`.
- [ ] **Step 3:** Ligar `Screen` nas páginas de funcionalidade; `npm run check` → PASS.
- [ ] **Step 4:** Commit `feat(smartsite): capturas do produto`.

### Task 8: Home

**Files:**
- Modify: `src/pages/index.astro`
- Create: `src/components/home/{Hero,ProductPreview,Jornada,Diferenciais,FuncionalidadesResumo}.astro`

**Interfaces:**
- Consumes: `SCREENS`, collections, `Cta`, `Faq`, `Mascot`.

- [ ] **Step 1:** Teste `home liga aos dois hubs e a todas as etapas da jornada` (links para `/funcionalidades/`, `/solucoes/` e para ao menos uma funcionalidade por etapa atrair/converter/atender/reter/gerir) e `H1 oficial`.
- [ ] **Step 2:** Rodar → FAIL.
- [ ] **Step 3:** Implementar: Hero (H1 oficial, linha de campanha, sub com recursos nível A, CTA primário + "Ver planos", microcopy "Suporte brasileiro. Calls todos os dias. Comunidade ativa."), I02 preview em abas acessíveis (`role="tablist"`, setas do teclado; sem JS mostra todas as telas empilhadas), I03 jornada 360, diferenciais (Pix via AbacatePay redigido como "seus clientes pagam via Pix", conforme registro), resumo de funcionalidades, FAQ curto, CTA final. Movimento: um reveal de entrada no hero e transições de estado; tudo desligado com reduced motion.
- [ ] **Step 4:** `npm run check` → PASS.
- [ ] **Step 5:** Commit `feat(smartsite): home`.

### Task 9: SEO estruturado, QA e relatório

**Files:**
- Create: `src/lib/jsonld.ts`
- Modify: `Base.astro`, layouts, `Smartsite/docs/00-project-status.md` … `14-final-report.md` (preencher com evidência)

**Interfaces:**
- Produces: `organization()`, `softwareApplication()` (sem `offers`/`aggregateRating`), `faqPage(items)`, `breadcrumb(trail)` → objetos JSON-LD.

- [ ] **Step 1:** Teste `home tem Organization e SoftwareApplication; páginas com FAQ têm FAQPage`.
- [ ] **Step 2:** Rodar → FAIL; implementar; `npm run check` → PASS.
- [ ] **Step 3:** QA no navegador embutido (`astro preview`): home e um exemplo de cada layout em 320, 390, 768, 1440 — `document.documentElement.scrollWidth <= innerWidth`, console sem erros, menu por teclado/Escape, abas por setas, filtro, FAQ, reduced motion (emulado). Screenshots 390/1440 da home e de cada layout.
- [ ] **Step 4:** Corrigir o que falhar e repetir Step 3.
- [ ] **Step 5:** Atualizar docs 00–14 (status PASS/PARTIAL/BLOCKED por fase com evidência; pendências reais em 13; relatório em 14).
- [ ] **Step 6:** Commit `feat(smartsite): SEO estruturado, QA e relatório`.
