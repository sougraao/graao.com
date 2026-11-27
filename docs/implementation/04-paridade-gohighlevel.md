# Plano de paridade: Graao × GoHighLevel

Levantamento feito em 20/11/2026 na conta GHL logada no navegador interno (agência "La Vaca Estudio", subconta `iJA1defi4GNScV59Dust`), percorrendo o menu lateral e as abas internas de cada módulo. O status da Graao vem das abas e rotas declaradas no código (`ui/screens.js`, `ui/crm.js`, `ui/app.js`) e de buscas por nome. Ele não vem de testes funcionais, então 🟡 quer dizer "existe algo, conferir profundidade".

Legenda: ✅ existe · 🟡 parcial / conferir · ❌ não encontrado · ⏭ não recriar

## Como foi feito e limites

- **Menus:** mapeados pelo DOM do app (ids `sb_*` do menu e links `/v2/location/<id>/...`).
- **Código:** num Chrome com `--remote-debugging-port=9222` (perfil `%LOCALAPPDATA%\graao-ghl-cdp`), o código já carregado na aba foi extraído via CDP: 401 arquivos, 34 MB, build `static.leadconnectorhq.com/2246`.
- **REA:** fez o inventário do código (evidência `ev_ab5c348b52c2…`, 398 arquivos). O `analyze_web_bundle` sobre o bundle inteiro estourou o tempo, então as rotas e o registro de micro-apps foram extraídos por busca estática no código salvo. Ver a seção 2.5 e [04b-ghl-microapps.txt](04b-ghl-microapps.txt).
- **Não foi aberto:** nada que criaria dados na conta, como construtores de workflow, formulários, e-mails e funis. Por isso o catálogo completo de **gatilhos e ações de workflow**, os **elementos do construtor de funis** e os **campos de cada configuração** ainda não foram levantados (ver Fase 0).

---

## 1. Inventário: subconta

### Conversas — `/conversations`
| GHL | Graao |
|---|---|
| Conversations (Unread / All / Recent / Starred, caixa da equipe) | ✅ inbox |
| Manual Actions | ✅ ligação, SMS e WhatsApp manual |
| Snippets | ✅ |
| Trigger Links | ✅ com taxa de clique |
| Analytics | ✅ visão geral + SLA |
| Settings | 🟡 |
| Compra / porte de número de telefone | ❌ (WhatsApp/WAHA no lugar) |

### Calendários — `/calendars`
| GHL | Graao |
|---|---|
| Calendar view (semana, usuários, calendários, grupos, "Manage view") | ✅ |
| Appointment list view | ✅ |
| Calendar settings (tipos: round robin, classe, serviço, widget de agendamento) | 🟡 round robin e widget público quase não aparecem |

### Contatos — `/contacts`
Smart Lists ✅ · Bulk Actions ✅ · Custom Fields ✅ · Tasks ✅ · Companies ✅ · Import/Export ✅

### Oportunidades — `/opportunities`
Opportunities (kanban/lista) ✅ · Forecast ✅ · Pipelines ✅ · Bulk Actions ✅ · Import ✅

### Pagamentos — `/payments` (maior lacuna)
| GHL | Graao |
|---|---|
| All Invoices | ✅ |
| Recurring Invoices | ❌ |
| Invoice Templates | ❌ |
| Estimates | ❌ |
| Accounting Sync | ❌ |
| Documents & Contracts + Templates (propostas com assinatura) | ❌ |
| Orders | 🟡 (dentro de Lojas) |
| Abandoned Checkouts | 🟡 |
| Subscriptions | ✅ |
| Payment Links | ✅ |
| Transactions | ✅ |
| Products | ✅ |
| Collections · Inventory · Product Reviews | ❌ |
| Coupons | ✅ |
| Gift Cards | ❌ |
| Settings (recibos, impostos) | ❌ |
| Integrations (gateways) | ✅ AbacatePay |

### Agentes de IA — `/ai-agents`
Getting Started · Agent Studio · Voice AI · Conversation AI · Knowledge Base · Agent Templates · Content AI · Agent Logs · AI Usage.
Graao: 🟡 `agents.js` / `agent-ai.mjs` existem. Conferir **Voice AI** (atendimento por ligação), **Knowledge Base** (RAG por subconta), **Logs** e **Uso/custo de IA**.

### Vibe — `/vibe` (construtor de apps por IA)
✅ equivalente no Studio/Sites com construtor estilo vibe.

### Marketing — `/marketing`
| GHL | Graao |
|---|---|
| Social Planner (FB, IG, LinkedIn, TikTok, YouTube, Pinterest, Threads, Bluesky, GBP, Community; CSV, fila evergreen, post recorrente, RSS) | ✅ (5.3: fila evergreen, recorrente por dias/contagem, RSS com filtros e imagem, Threads/Bluesky completos) |
| Emails (construtor, campanhas, estatísticas) | ✅ blocos, campanhas, A/B do assunto (sem blocos avançados) |
| Snippets | ✅ |
| Countdown Timers | ✅ GIF para e-mail e iframe para páginas |
| Trigger Links | ✅ com taxa de clique |
| Affiliate Manager (dashboard, campanhas, afiliados, pagamentos, mídia, config.) | ❌ (só existe o portal de afiliados da agência) |
| Brand Boards | ❌ |
| Ad Manager | ✅ (5.4: Meta Ads e Google Ads; criação de anúncio no Meta) |
| Prospecting | ✅ |
| (extra Graao) Prancheta | ✅ |

### Automação — `/automation`
Workflows ✅ · Overview 🟡 · Global Workflow Settings 🟡

**Catálogo:** o GHL tem **116 gatilhos e 180 ações**. A Graao (`ui/workflow-data.js`) tem **32 gatilhos e 34 ações**.

As maiores diferenças estão em:
- **Ações de IA:** decisão, resumo, intenção, tradução, extração, análise de imagem e vídeo, Claude/Gemini.
- **Lógica e dados:** router, loop, goal, split A/B, go to, formatadores de data, número, texto e array, custom code.
- **Oportunidades:** 14 ações, incluindo donos, seguidores e associações.
- **Google Sheets:** 11 ações.
- **Comunicação:** 32 ações, incluindo RCS, WhatsApp flows e interativos.
- **Gatilhos de e-commerce, cupons, comunidades, eventos e certificados.**

A lista completa está em [04c](04c-ghl-catalogo-tecnico.md) §1.3, e completar esse catálogo entra em cada fase junto com o módulo correspondente.

### Sites — `/funnels-websites`
| GHL | Graao |
|---|---|
| Funnels · Websites · Stores · Webinars · Analytics · Blogs | ✅ |
| WordPress (hospedagem) | ⏭ / ❌ |
| Client Portal (dashboard, settings) | ✅ |
| Branded Mobile App | ❌ |
| Forms | ✅ |
| Surveys · Quizzes | 🟡 |
| Chat Widget | ✅ |
| QR Codes | ✅ |
| Domínios | 🟡 |
| "Build with AI" | ✅ |

### Memberships — `/memberships`
| GHL | Graao |
|---|---|
| Client Portal | ✅ |
| Courses (dashboard, produtos, ofertas, analytics, course builder) | ✅ 🟡 analytics |
| Communities (grupos, domínio, app) | ✅ (6.1 eventos, ao vivo e gravações; 6.2 planos, tema, adesão, moderação, emblemas, newsletter e analytics) |
| Certificates (emissão, analytics, e-mail) | ❌ |
| Branded Mobile App | ❌ |
| Gokollab Marketplace | ⏭ |

### Mídia — `/media-storage`
Upload ✅ · Pastas 🟡 · Conectar Canva ❌ · Conectar Google Drive 🟡 (`google-integrations.mjs` em andamento)

### Reputação — `/reputation`
| GHL | Graao |
|---|---|
| Overview | ✅ |
| Requests (pedido de avaliação por SMS/e-mail/QR) | 🟡 |
| Reviews (responder, inclusive com IA) | 🟡 |
| Video Testimonials | ❌ |
| Widgets (embed de avaliações) | ❌ |
| Listings (diretórios) | ❌ |
| GBP Optimization | 🟡 |
| Settings | 🟡 |

### Relatórios — `/reporting`
Custom reports ✅ · Google Ads report ✅ · Meta Ads report ✅ · Attribution report ✅ (5.4) · Call report ❌ · Agent report ❌ · Appointment report 🟡 · Local Marketing Audit ✅ (`prospect-audit.mjs`)

### App Marketplace — `/integration`
Marketplace de apps + App Studio. Graao: ✅ App Studio da agência e Configurações → Apps nas subcontas (7.3); `setup-marketplace.mjs` cuida dos setups de conta.

### Configurações — `/settings`
| GHL | Graao |
|---|---|
| Business Profile | ✅ |
| My Profile | 🟡 |
| Billing | 🟡 |
| Users (papéis/permissões) | ✅ |
| Opportunities & Pipelines | ✅ |
| Calendars | 🟡 |
| Email Services (SMTP/domínio de envio) | 🟡 domínio próprio (SPF/DKIM) |
| Phone System | ❌ |
| WhatsApp | ✅ |
| Objects (objetos personalizados) | ✅ |
| Custom Fields · Custom Values | ✅ |
| Import Data | ✅ |
| Manage Scoring (lead scoring) | ✅ regras com gatilhos dos workflows |
| Domains & URL Redirects | 🟡 |
| External Tracking (pixels, GA, GTM) | ✅ script do site + GA4, GTM e Pixel da Meta |
| Integrations · Private Integrations (tokens de API) | ✅ Google / 🟡 |
| Tags | ✅ |
| Labs (feature flags por conta) | ✅ Configurações → Labs, com o que a agência libera (7.2) |
| Audit Logs | ✅ aba |
| Brand Boards | ❌ |

### Topo
Ask AI ✅ (Pergunte a Graao) · Launchpad ✅ · Dashboard ✅

## 2. Inventário: agência

| GHL | Graao |
|---|---|
| AI Suite / uso de IA da agência | ✅ Central de IA: limites, liga/desliga, painel de uso e padrões (7.2) |
| Ask AI | ✅ |
| Launchpad · Dashboard | ✅ |
| SaaS Configurator (planos, revenda de assinaturas para clientes) | 🟡 (`03-agencia-saas-snapshot.md`) |
| Prospecting · Sub-accounts · Snapshots | ✅ |
| Reselling (revenda de telefonia, e-mail, IA com margem) | 🟡 IA, e-mails e WhatsApp com carteira de créditos (7.1); telefonia depende da D1 |
| Marketplace | ✅ Marketplace de apps com App Studio (7.3) |
| Affiliate Portal · Partners · University · Ideas | ✅ |
| Template Library | Removida a pedido em 2026-11-23; modelos de site ficam em Sites e os de subconta em Setups |
| SaaS Education | ⏭ (conteúdo) |
| Swag | ⏭ |
| Mobile App Customiser | ✅ |
| Desktop White-label App | ❌ |
| Settings | ✅ |

## 2.5 Arquitetura real: 122 micro-frontends

O GHL é uma casca Vue (`static.leadconnectorhq.com/<build>/app.js`, com 119 rotas próprias, a maioria de agência, login e status de conta). Ela carrega cada módulo como micro-frontend via Module Federation (`appcdn.leadconnectorhq.com/<domínio>/<app>/remoteEntry.js`). O registro completo está em [04b-ghl-microapps.txt](04b-ghl-microapps.txt).

O registro revela módulos que **não aparecem no menu desta conta**, porque dependem de plano, flag ou nicho. Os marcados com ★ são lacunas novas para a Graao:

| Domínio | Micro-apps (★ = não visto no menu) |
|---|---|
| `ai/` | agent-studio, agent-builder, voice-ai, knowledge-base, agent-logs, copilot, ★ai-memory, ★insights-ai, ★notes-ai (notas de reunião/ligação), ★performance-ai, ★agent-health, ★industry-agents, ★actions-platform, ai-growth |
| `crm/` | contacts, opportunities, conversations-new-ui, custom-objects, custom-fields, bulk-actions, users, labs, content-ai, ai-employees, ★**ticketing** (helpdesk), ★**documents**, ★**events-management**, ★preference-management (central de preferências/opt-out), ★contacts-restore (lixeira), ★restaurants |
| `automation/` | calendar-settings, calendar-components, appointment-modal, ★**calendar-services** (agenda de serviços), ★**calendar-rentals** (aluguel/recursos), ★**field-services** (serviço em campo), feature-discovery |
| `automation-reporting/` | reporting, notification (central de notificações) |
| `leadgen/` | SocialPlanner, Blogs, chat-widget, countdown-timer, brand-boards, email-builder-mfa, email-marketing, ★**email-sequence** (sequências/drip), email-home-v2, form-survey, funnel-website (+analytics, domain-connect, redirect), ecommerce, store-catalog, ★store-widgets, ★payments-widgets, products, invoices (+integrations), estimates, proposals, payment-links, gift-cards, ★**loyalty** (programa de fidelidade), ★**seoApp**, external-tracking, qr-code, template-library, vibe-editor, MediaStudio/MediaEditor, ★domain-reselling |
| `leadgen-ad-publishing/` | ad-publishing (Ad Manager) |
| `commerce/` | ★layout-builder / layout-list (vitrines) |
| `revex/` | locations, snapshots, saas, reselling, agency-dashboard, affiliate-portal, memberships, membership-analytics/settings, communities-builder, clientportal-builder, certificates-builder, reputation, ★**yext** (listagens), ★**visibility-ai** (visibilidade em buscadores/IA), ★**meetings**, ★**power-dialer** (discador), phone-integration, ★wallet-kit (carteira/créditos), location-billing, platform-billing, wordpress, gokollab-builder, ai-app-builder, desktop-customizer, internal-tools |
| `marketplace/` | marketplace, integrations |

**Consequências para o roadmap:**
- Entram no backlog: Ticketing/helpdesk, Email Sequences, Loyalty, SEO, Visibility AI, Meetings + Notes AI, Power Dialer, Calendar Services/Rentals, Field Services, central de preferências, lixeira de contatos e carteira de créditos (wallet).
- Para levantar as telas internas de cada micro-app, basta visitar a rota dele na aba CDP. O `remoteEntry` carrega as rotas e componentes do módulo, e o mesmo script de extração (`Debugger.getScriptSource`) captura o código.
- Alguns módulos não são micro-frontends, e sim **apps separadas em iframe** com alvo CDP próprio. O construtor de workflows, por exemplo, roda em `client-app-automation-workflows.leadconnectorhq.com`.
- **Back-end:** as 142 telas chamam cerca de 875 endpoints específicos em cerca de 80 serviços (`services.leadconnectorhq.com/<serviço>/…`). Os maiores são reputation, reporting, marketplace, ai-wrapper, locations, integrations, calendars, copilot, reselling, contacts, opportunities, payments e voice-ai. O detalhe por tela está no [04c](04c-ghl-catalogo-tecnico.md).
- **Uso de IA com limites por subconta** (`ai-wrapper/usage/limits/location`) e **revenda configurável por produto** (`reselling/configuration/location/:id/AI_EMPLOYEE`) aparecem em quase toda tela de IA. Confirma que a Fase 7 (reselling com margem) e o painel de uso de IA da Fase 3 são estruturais no GHL.

---

## 3. Roadmap

A ordem segue impacto para o cliente da Graao (agências e PMEs no Brasil) e dependências técnicas.

> **Status vivo:** o andamento item a item fica no painel [painel/index.html](painel/index.html), que lê os dados de [painel/progresso.js](painel/progresso.js). Quem implementar deve atualizar `progresso.js` a cada item iniciado ou concluído. As instruções estão no topo desse arquivo.

### Fase 0: completar o levantamento (1–2 dias)
1. ~~Abrir o Chrome com CDP e extrair o registro de micro-apps~~ (feito, seção 2.5).
2. ~~Visitar as 142 telas e mapear tela → micro-app → endpoints de API~~ (feito: [04c-ghl-catalogo-tecnico.md](04c-ghl-catalogo-tecnico.md)).
3. ~~Catálogo de gatilhos e ações de workflow~~ (feito: **116 gatilhos em 20 grupos e 180 ações em 24 grupos**, lidos do editor aberto num rascunho; ver 04c §1.3). A aba "Apps", com 24 integrações nativas, também foi capturada.
4. ~~Interface de cada tela~~ (feito: abas, colunas de tabela, ações e campos de 141 telas, incluindo as que rodam em iframe; ver 04c §3).
5. ~~Construtores~~ (feito: 23 editores catalogados no 04c §4).
   - Workflows, formulário, survey, quiz, page builder (funis, sites, lojas, webinars), blog, e-mail, countdown, QR, chat widget, brand board, curso, comunidade, certificado, documentos e contratos, Agent Studio, Voice AI, Conversation AI, Vibe, calendário, relatório customizado e apps white-label desktop e mobile.
   - A comunidade foi percorrida por dentro, num grupo de rascunho: abas, canais, eventos, gamificação, 15 seções de configuração e tema (04c §4.1).
   - O curso também foi percorrido por dentro: outline, aula, quiz, tarefa, sessão ao vivo, configurações e construtor de tema (04c §4.2).
   - Apps white-label: o desktop foi lido por completo. O mobile (Flutter, lido por screenshot) foi percorrido por dentro num projeto de rascunho: branding, login, navegação, apps, módulos, distribuição, assinatura e gerador de screenshots (04c §4.3).
   - **Limite:** as telas de configuração das lojas (Apple e Google) e o build não foram acionados, porque exigem contas de desenvolvedor e pagamento.
   - Os rascunhos criados estão listados no fim do §4, para limpeza.

### Fase 1: dinheiro e documentos (maior lacuna de receita)
- Pagamentos: faturas recorrentes, modelos de fatura, orçamentos (estimates), configurações de recibo e impostos.
- **Documents & Contracts:** propostas e contratos com assinatura eletrônica, modelos e conversão em fatura.
- Pedidos e checkouts abandonados como telas próprias, ligados ao gatilho de workflow.
- Gift cards, coleções, estoque e avaliações de produto.
- Dependências: AbacatePay (já existe) e o motor de workflow (gatilhos "fatura paga", "contrato assinado").

### Fase 2: comunicação
- Email Services: domínio de envio próprio (SPF/DKIM), construtor de e-mail e campanhas com estatísticas.
- Analytics de Conversas; completar Snippets, Trigger Links e Manual Actions.
- Phone System / Voice: decidir o provedor (Twilio, Zenvia ou outro) antes de recriar ligações, chamadas perdidas e relatório de chamadas.
- Countdown timers para e-mails e páginas.

### Fase 3: IA
- Agent Studio completo: Knowledge Base por subconta, templates, logs de conversa e painel de **uso/custo de IA** (subconta e agência).
- Voice AI, depois do provedor de telefonia da Fase 2.
- Content AI dentro de Social, E-mail e Blogs.

### Fase 4: reputação e presença local
- Pedidos de avaliação (link, QR, SMS/WhatsApp), resposta com IA, widgets de avaliações, depoimentos em vídeo.
- Otimização de GBP (aproveitar `google-integrations.mjs`) e listagens.

### Fase 5: marketing avançado
- Affiliate Manager para o cliente final (campanhas, afiliados, comissões, payouts via AbacatePay).
- Brand Boards (logo, cores e fontes da marca, reaproveitando os tokens da Prancheta).
- Social Planner: fila evergreen, posts recorrentes, RSS, Threads e Bluesky.
- Ad Manager (Meta/Google), junto com os relatórios de Google Ads, Meta Ads e Atribuição.
- External Tracking (pixels, GA4, GTM) e lead scoring.

### Fase 6: memberships e apps
- Certificados de curso, analytics de cursos.
- Branded mobile app (cliente final) e desktop white-label (agência).

### Fase 6.5: módulos ocultos (vindos do registro de micro-apps)
- Ticketing/helpdesk ligado a Conversas. Feito em 2026-11-21.
- Sequências de e-mail (drip). Feito em 2026-11-21.
- Programa de fidelidade (loyalty), junto com gift cards. Fidelidade feita em 2026-11-21; gift cards ainda não.
- Central de preferências de comunicação (opt-in/opt-out por canal). Feito em 2026-11-21.
- Lixeira de contatos. Feito em 2026-11-21.
- Agenda de serviços, locação de recursos e serviço em campo (nichos). Feito em 2026-11-21.
- Meetings + Notes AI (resumo de reuniões e ligações). Feito em 2026-11-21.
- SEO e Visibility AI (presença em buscadores e respostas de IA). Feito em 2026-11-21 (posições pelo Search Console; Visibility AI mede o ChatGPT).
- Power dialer, depois da Fase 2.

### Fase 7: plataforma de agência
- Reselling com margem (IA, mensagens, telefonia). Feito em 2026-11-22 para IA, e-mails e WhatsApp, com carteira de créditos por subconta e recarga por Pix; telefonia depende da D1.
- AI Suite da agência e Labs (flags por conta). Feito em 2026-11-21: Central de IA com limites, uso e padrões; Labs com sugestão e resumo de conversa por IA e bloqueio de contatos duplicados.
- App Marketplace / App Studio aberto. Feito em 2026-11-21: apps da agência com webhook assinado, token por subconta, API de contatos, ações e gatilhos de workflow e link no menu.

### Fora do escopo (⏭)
WordPress hospedado, Swag, Gokollab, conteúdo de educação SaaS do GHL.

## 4. Regras para cada item recriado
- Front-end sempre em `ui/` (nunca copiar `public/` por cima).
- Toda funcionalidade nova:
  - nasce com gatilho e ação no motor de workflow quando fizer sentido;
  - tem tradução pt-BR/es;
  - respeita o modelo de permissões (`authorization.mjs`).
- Recriar o comportamento e a organização, não a marca: nomes, textos e visual são da Graao.
