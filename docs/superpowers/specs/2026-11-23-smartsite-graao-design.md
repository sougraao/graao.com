# Smartsite graao — design

Data: 2026-11-23 · Status: rascunho para aprovação

## 1. Intenção

Construir o site institucional completo da graao (graao.com) a partir do kit em `Smartsite/`
(`BUSINESS_BRIEF.md`, `SMARTSITE_MASTER_PROMPT.md`, `documents/`, `docs/04-sitemap.md`).
O site responde a uma pergunta comercial — *qual plataforma brasileira reúne tudo o que um
negócio precisa para fazer Marketing 360?* — para agências, profissionais de marketing e
pequenas empresas do Brasil, e leva a uma conversão real: criar a conta na graao.

O próprio site é prova do que a graao vende: bonito, fácil, mobile-first, brasileiro.

## 2. Objetivos, não-objetivos, anti-objetivos

**Objetivos**
- Site inteiro (core + funcionalidades + soluções) em hub-and-spoke, cada página com intenção
  própria, evidência registrada, links internos e um próximo passo real.
- H1 da home: "A plataforma brasileira para Marketing 360." Linha de campanha: "Tudo que seu
  marketing precisa. Inclusive bom gosto."
- Tom inteligente e ácido (no máximo uma piada por bloco; humor contra burocracia, nunca contra
  o usuário; sem humor em cobrança, cancelamento, segurança e privacidade).
- HTML rastreável, SEO/GEO/AEO (title, description, canonical, JSON-LD, sitemap, robots, FAQ em
  HTML), acessível (AA), mobile-first a partir de 320px.

**Não-objetivos**
- Não alterar a plataforma SaaS (`server.mjs`, `ui/`, `public/`, `api/`).
- Não publicar, não configurar DNS, não criar projeto na Vercel, não usar credenciais.
- Sem blog, sem páginas por cidade, sem cases/depoimentos (não há evidência ainda).

**Anti-objetivos (falha mesmo que "funcione")**
- Cara de template SaaS genérico: degradês decorativos, glow, glassmorphism, card para tudo,
  grids repetitivos, emoji como ícone.
- Qualquer afirmação sem prova: preço, nota, número de clientes, "24h", "grátis", resultado.
- Botões decorativos, demos simuladas, formulários que fingem sucesso.
- Citar concorrentes ou inventar assinatura de marca.

## 3. Restrições

- Mercado Brasil, pt-BR. Marca escrita "graao" em minúsculas.
- Publicação **não autorizada**. Entrega = código + build + preview local + relatório.
- Prompts visuais (se houver geração de imagem) em inglês; nenhuma foto stock genérica.
- Respeitar `prefers-reduced-motion`; nenhum conteúdo SEO escondido atrás de interação.

## 4. Abordagens consideradas

| Abordagem | Trade-off | Decisão |
|---|---|---|
| **Astro (SSG) em `Smartsite/site/`** | Modelos por tipo de página, conteúdo por arquivo, HTML estático, sitemap/JSON-LD fáceis, quase zero JS. Custo: passo de build e dependências (isoladas na pasta). | **Escolhida pelo usuário** |
| HTML puro gerado por script Node sem dependências | Segue o estilo vanilla do repo; templating/SEO feitos à mão, frágil para ~40 páginas. | Descartada |
| Servir pelo `server.mjs` da plataforma | Caminho mais curto até o domínio, mas altera o SaaS (proibido pelo kit). | Descartada |

Escopo: usuário escolheu **site inteiro** (não só a home).

## 5. Fatos verificados que sustentam o conteúdo

Fonte: `RELATORIO-PLATAFORMA-GRAAO.txt` (auditoria de código de 18/11/2026) + PRs mesclados
depois (#59 telefone Twilio, #60 voz com IA, #61 discador, #62 push no app, #63 catálogo de
conectores; checkout AbacatePay com Pix e cartão em `abacatepay.mjs`).

**Nível A — funciona de ponta a ponta (pode ser prometido):**
WhatsApp bidirecional (instância por subconta, QR/pareamento, entrada vira contato/conversa);
Planejador Social com publicação/agendamento em Facebook, Instagram, LinkedIn, TikTok, YouTube,
Pinterest, Threads, Google Business e Bluesky; IA (Pergunte à Graao, AI Studio que gera e revisa
sites, Estúdio de Agentes); páginas e funis publicados, formulários públicos/incorporáveis,
trigger links; motor de automações; prospecção com Google Places e relatórios compartilháveis;
portal do cliente/área de membros com login por link; API pública v1; agência → subcontas,
white label, configurador SaaS, setups (snapshots); login Google que cria a agência própria no
primeiro acesso.

**Nível B — funciona como registro interno, sem integração externa (descrever com honestidade
ou omitir):** cobranças da subconta via Stripe (Pix via AbacatePay é real — verificar escopo
exato antes de publicar a página de pagamentos), envio externo de e-mail marketing/SMS,
sincronização de avaliações, sincronização de agenda com Google/Zoom, publicação do app nas lojas,
domínio próprio/DNS.

Telefone/voz/discador/push: entraram após a auditoria; o builder confirma no código o que é
real antes de escrever a página (`twilio.mjs`, `voice-ai.mjs`, `phone-model.mjs`, `web-push.mjs`).

Cada claim usado no site vai para `Smartsite/documents/PRODUCT_EVIDENCE_REGISTER.md` com arquivo
de origem e nível (A/B/PENDENTE).

## 6. Mapa do site (consolidado a partir das 39 rotas candidatas)

Consolidações: WhatsApp + atendimento → uma página; calls dentro de Suporte; landing pages +
funis → uma página; fidelização + reativação → "relacionamento e recompra". Saem até haver
evidência: Demonstração, Histórias de clientes.

**Core**
| URL | Página | Observação |
|---|---|---|
| `/` | Home | hub; responde a pergunta central |
| `/planos/` | Planos | preços PENDENTES → página construída com marcador, `noindex` até preenchida |
| `/sobre/` | Sobre | história/equipe PENDENTES → só o que for fornecido |
| `/suporte/` | Suporte e calls | suporte brasileiro, calls todos os dias (horário PENDENTE: não inventar) |
| `/comunidade/` | Comunidade | acesso só para clientes; sem link público do grupo |
| `/contato/` | Contato | só canais confirmados |
| `/perguntas-frequentes/` | FAQ | `<details>` nativo; FAQPage JSON-LD |
| `/privacidade/` | Privacidade | reaproveita texto de `ui/privacidade.html` (já publicado) |
| `/termos/` | Termos | texto PENDENTE (jurídico) → `noindex` até existir |

**Funcionalidades** (hub `/funcionalidades/`)
crm · whatsapp-e-atendimento · redes-sociais · sites (AI Studio) · funis-e-landing-pages ·
formularios · automacoes · inteligencia-artificial · prospeccao · agendamentos ·
email-marketing · reputacao · relatorios · pagamentos-e-pix · cursos-e-area-de-membros ·
telefone-e-voz · gestao-de-agencias

**Soluções** (hub `/solucoes/`)
agencias · profissionais-de-marketing · pequenas-empresas · negocios-locais ·
captacao-de-leads · conversao-de-vendas · atendimento-ao-cliente · relacionamento-e-recompra

Total ≈ 37 páginas. Páginas de nível B ficam no ar com texto honesto; nenhuma página vazia.

## 7. Conversão

- **Domínio (decisão do usuário):** o site mora em `https://www.graao.com`; `graao.com`
  continua sendo a plataforma como hoje. Canonicals, sitemap e `site` do Astro usam o `www`.
  O domínio fica numa única constante de configuração.
- **Primária:** "Começar com a graao" → `https://graao.com/login` (login Google cria a agência
  automaticamente — fluxo real; página da plataforma, fora do escopo deste site).
- **Secundárias:** "Ver planos" → `/planos/`. Comunidade **só para clientes** (decisão do
  usuário): a página explica a comunidade e diz que o acesso vem com a conta; o link do grupo
  WhatsApp **não** é publicado.
- Sem formulário de lead próprio nesta entrega (não há destino homologado).
- Atributos `data-cta` nos links para rastreamento futuro; nenhum script de analytics instalado.

## 8. Identidade visual

- Mascote/isotipo oficial: caveira-chama (`graao-isotipo-1x1.png`, `ui/skull_flame.svg`,
  quadros animados em `ui/brand/flame/`). Pink da marca `#ff00bb`, preto, branco.
- Pink `#ff00bb` não passa AA como texto sobre branco → uso em superfícies, ícones, marca,
  destaques grandes; texto/link em tom escuro derivado (ponto de partida: `#a00070`, já usado na
  landing atual).
- **Laranja secundário:** HEX oficial não existe no repositório → proposta do builder, marcada
  como PENDENTE de aprovação no design system.
- Tipografia: não definida oficialmente → escolha do builder (Google Fonts, licença aberta),
  registrada em `Smartsite/docs/07-design-system.md`.
- Imagens: screenshots reais da plataforma capturados de um workspace de demonstração local
  (sem dados de clientes reais) + mascote. *Decisão do builder:* tentar rodar a plataforma
  localmente em modo SQLite com dados fictícios, sem credenciais. Se não for possível sem
  credenciais, cada screenshot vira um espaço identificado como PENDENTE e o usuário fornece
  as capturas; nada de mockup fingindo ser a interface. Sem ilustrações inventadas fingindo ser "proprietárias".
- Direção: editorial contemporânea, espaço negativo, tipografia expressiva, sólidos sem degradê.

## 9. Interações (contrato I01–I10 de `EXPERIENCE_AND_MOTION.md`)

Implementar: I01 navegação (disclosure acessível), I02 preview do produto com screenshots reais
em abas, I03 jornada 360 (atrair → converter → atender → reter, cada etapa liga às páginas),
I05 filtro de funcionalidades por objetivo (lista completa sem JS), I08 FAQ, I09 CTAs reais,
I10 motion editorial curto com reduced-motion.
Não aplicável agora (registrar motivo): I04 showcase de sites de clientes (sem sites autorizados),
I06 agenda de calls (sem horário real), I07 alternância de preço (sem preços).

## 10. Estrutura técnica

- `Smartsite/site/` — projeto Astro (TypeScript), saída estática (`output: 'static'`),
  `site: 'https://www.graao.com'`, trailing slash.
- Fora do escopo: `ui/landing.html` (alteração não commitada não relacionada, ignorar) e a
  landing servida em `graao.com/` pela plataforma.
- Conteúdo em content collections (`funcionalidades`, `solucoes`) com frontmatter tipado:
  título, description, H1, pergunta que a página responde, nível de evidência, links
  relacionados, CTA.
- Layouts: `Base`, `Core`, `Funcionalidade`, `Solucao`; componentes compartilhados (header,
  footer, CTA, FAQ, breadcrumbs, JSON-LD).
- `@astrojs/sitemap`; `robots.txt`; JSON-LD `Organization`, `SoftwareApplication` (sem
  `aggregateRating`/`offers` inventados), `BreadcrumbList`, `FAQPage`.
- JS mínimo (ilhas/vanilla só onde houver interação).
- Docs `Smartsite/docs/00–14` atualizados com evidência ao longo do trabalho.

## 11. Pendências do responsável (não bloqueiam o build; viram marcadores visíveis `[[...]]`)

Preços e condições dos planos · horário das calls de suporte · telefone/WhatsApp/e-mail de
contato · razão social/CNPJ para rodapé e termos · texto dos termos de uso · HEX laranja
oficial · tipografia oficial (se houver) · história/equipe para "Sobre" · nota e permissão de
uso das avaliações do Google.

## 12. Deixado ao builder

Tipografia (proposta), escala e grid, laranja proposto, ordem e redação final das seções de
cada página dentro das regras de copy, quais screenshots capturar, microinterações, estrutura
interna de componentes, testes de QA (Playwright ou navegador embutido) nas larguras do
contrato (320–1920px).
