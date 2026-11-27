# graao — Experience, Interaction & Visual Quality Contract

## Arte e composição
Mobile first a partir de 390px. Paleta institucional pink/laranja/preto/branco; extrair HEX e fontes oficiais. Sem degradês decorativos, glassmorphism, glow, stock corporativo genérico, card para tudo ou grid repetitivo. Use composição editorial, contraste, espaço negativo, tipografia expressiva, ilustrações flat outline proprietárias e interface real. Referência obrigatória https://pro.magicui.design/ (3–6 componentes com URL, aprendizado e adaptação, sem ativos licenciados não autorizados). A home é demonstração da marca, não uma coleção de efeitos.

## Interações propostas (implementar apenas com utilidade e insumos)
| ID | Componente | Comportamento | Mobile / fallback | Critério de aceite |
|---|---|---|---|---|
| I01 | Navegação | menu acessível, grupos de funcionalidades/soluções, CTA real | menu em disclosure com foco e Escape; links HTML | todas as rotas, teclado e toque |
| I02 | Product preview | tabs de cenários reais, imagem/vídeo com estado identificado | controles de toque, conteúdo HTML e imagem estática | sem botões falsos; não simular conta real |
| I03 | Jornada 360 | seleção de etapa revela benefício, recursos e link | lista vertical ou tabs acessíveis | todas as etapas e links funcionam |
| I04 | Sites showcase | alternar preview desktop/mobile dos sites reais autorizados | layout em coluna e alternância acessível | sem iframe externo inseguro ou viewport ilegível |
| I05 | Exploração de funcionalidades | filtros por objetivo, resultado com contagem | filtros em botões, lista inicial completa | estado vazio, reset, links rastreáveis |
| I06 | Suporte/calls | agenda apenas com fonte e data reais; CTA de acesso real | lista de sessões; sem inventar horário | timezone correto, informação atualizada |
| I07 | Pricing | alternância mensal/anual apenas se ambos reais | comparação legível sem scroll de página | preços, limites, taxas e links consistentes |
| I08 | FAQ | accordion acessível, perguntas e respostas no HTML | native details/summary ou equivalente | teclado, leitor de tela, sem conteúdo perdido |
| I09 | CTA/contato | link real ou formulário integrado com validação | alvos 44px, teclado e feedback | sem sucesso simulado; teste autorizado |
| I10 | Motion editorial | reveal curto, transições de estado, feedback visual | reduced motion, nenhuma dependência do hover | sem scroll hijack, sem bloqueio do conteúdo |

## Regras de motion
Movimento só para hierarquia e feedback. Transições de estado ~120–220ms, reveals ~200–400ms como ponto de partida; testar. Transform/opacity quando possível. Evite autoplay, parallax pesado, scroll hijacking, deslocamentos de layout, texto aguardar animação, animações infinitas. Respeitar prefers-reduced-motion, foco, Pause quando necessário e fallback sem JS. Não ocultar conteúdo SEO atrás de interação. Não carregar vídeos grandes no LCP.

## Gates bloqueantes
Visual Quality Gate do Master Prompt (16/16). Interaction Gate adicional: registre para cada I01–I10 IMPLEMENTED / NOT APPLICABLE com motivo / BLOCKED, URL, teste desktop/mobile, teclado, touch, reduced motion, estados de loading/erro/vazio, link/destino e evidência. PASS apenas quando todos os componentes implementados passarem e nenhum requisito obrigatório estiver bloqueado. Testar 320, 375, 390, 430, 768, 1024, 1440, 1920px; screenshots home e cada template a 390/1440; sem overflow, CTA visível e contraste AA. Verificar build, console e performance. Não anunciar que um componente é funcional sem teste real.
