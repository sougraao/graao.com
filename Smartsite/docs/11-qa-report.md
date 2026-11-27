# QA Report — 2026-11-23

| Verificação | Resultado | Como |
|---|---|---|
| Build | PASS | `npx astro build` — 36 páginas |
| Testes de saída (20) | PASS 20/20 | `npm run check` (`tests/output.test.mjs`): lang, H1 único, title/description/canonical, links internos, termos proibidos, marcador ⇒ noindex e fora do sitemap, CTA → `graao.com/login`, JSON-LD válido, um FAQPage por página, og:image existente, pink fora do texto, hubs e órfãs, H1 da home |
| Gate de design (kit) na home | OPEN — 1 exceção registrada | `gate.mjs` 3 rodadas: 44 → 6 → 1 FAIL; exceção `copy-headings` (título de card com verbo em pt-BR) em `.taste-skill/waivers.json` |
| Rolagem lateral 320/390/768 | PASS | checagem por elemento nas 36 páginas em 320 e 390 feita na revisão final (o kit usa overflow-x: clip, então scrollWidth sozinho não prova nada) |
| Menu mobile | PASS | abre (`aria-expanded=true`) e fecha com Escape |
| Abas da jornada | PASS | seta → muda aba, painel e tela juntos, foco acompanha |
| Filtro de funcionalidades | PASS | "Atender" mostra 4 de 17; "Todas" volta a 17; sem JS a lista é completa |
| Console | PASS | sem erros na home e páginas internas |
| Reduced motion | NÃO VERIFICADO por emulação | o kit trata `prefers-reduced-motion`; o navegador embutido não emula essa preferência |
| Contraste | PASS (tokens) | ação `#b8008a` com texto claro ≈ 5,6:1; pink `#ff00bb` só em superfícies (teste) |
| Revisão final independente | sem críticos; 3 importantes corrigidos com teste (slug duplicado, capturas fracas, FAQ prometendo preços) | revisor em contexto novo |
