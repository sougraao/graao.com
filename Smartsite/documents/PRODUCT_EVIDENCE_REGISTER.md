# Registro de evidências do produto — graao

Fonte: leitura do código em `D:\meus documentos\graao.app` (branch main, 2026-11-23), complementando `RELATORIO-PLATAFORMA-GRAAO.txt` (18/11/2026). Caminhos relativos à raiz do repositório.

**A** = entrega real externa ou página pública real quando configurado. **B** = só registro/simulação interna. Condições de ambiente são da operação da plataforma, não do usuário final, salvo indicação.

| Funcionalidade | Nível | O que o site pode afirmar | Arquivos | Condição / limite (não afirmar) |
|---|---|---|---|---|
| crm | A | contatos, empresas, tags, campos personalizados; pipelines com etapas; ações em massa e lixeira; importação; API pública de contatos | `crm-model.mjs`, `pipeline-model.mjs`, `contact-trash.mjs`, `server.mjs` (`/api/v1/…/contacts`) | — |
| whatsapp-e-atendimento | A | WhatsApp por QR Code; texto, mídia e mensagens interativas; Instagram Direct e Messenger; caixa unificada com e-mail recebido e chat do site | `whatsapp.mjs`, `meta-messaging.mjs`, `email-inbound.mjs` | servidor Evolution/WAHA e app Meta configurados |
| redes-sociais | A | agendar e publicar em Facebook, Instagram, Threads, LinkedIn, TikTok, YouTube, Perfil da Empresa no Google, Pinterest e Bluesky; primeiro comentário; link de aprovação do cliente | `social-providers.mjs` | sem X/Twitter; LinkedIn sem vídeo; Pinterest só imagem |
| sites | A | gerar site com IA a partir de um briefing; editar páginas; sugestões de SEO; publicar; formulário de lead automático | `studio-ai.mjs`, `studio-site.mjs` | IA usa a chave OpenAI do usuário; **sem domínio próprio** (publicação em `graao.com/s/…`) |
| funis-e-landing-pages | A | funis com o mesmo construtor; página de oferta, loja, blog, webinar, QR codes | `model.mjs`, `offer-page.mjs`, `store-model.mjs`, `webinar-model.mjs`, `qr-model.mjs` | idem sites |
| formularios | A | formulários públicos e incorporáveis; leads do Google Ads e do Meta Lead Ads | `lead-forms.mjs`, `server.mjs` (`/form/`) | Meta Lead Ads exige página conectada |
| automacoes | A (exceto SMS) | 137 gatilhos e 170 ações; envios reais por e-mail, WhatsApp, Instagram/Messenger, push, webhooks e 27 apps conectados; ligações e Voice AI | `workflow-engine.mjs`, `workflow-delivery.mjs`, `ui/workflow-data.js` | **SMS é B** (só registra) |
| inteligencia-artificial | A | assistente "Pergunte ao Graao"; agentes de IA com base de conhecimento nos canais e no telefone; rascunho e resumo de conversas; IA de conteúdo; imagem e vídeo | `graao-chat.mjs`, `agent-ai.mjs`, `conversation-ai.mjs`, `content-ai.mjs`, `openai-media.mjs` | cada usuário conecta a própria chave OpenAI |
| prospeccao | A | buscar empresas por nicho e região no Google Maps; auditoria automática (velocidade, SEO, segurança, redes, Perfil Google); relatório público e widget | `prospecting-places.mjs`, `prospect-audit.mjs` | sem chave Places cai para OpenStreetMap |
| agendamentos | A (página) / B (Google Agenda) | página pública de agendamento com serviços, profissionais e recursos; links por contato; serviço em campo com rota; .ics | `scheduling-model.mjs`, `server.mjs` (`/agendar/`) | **sem sincronização com Google Agenda** |
| email-marketing | A | campanhas em lote com rastreio de abertura e clique, descadastro e central de preferências; domínio próprio verificado (SPF/DKIM); timer em GIF | `email-campaign-send.mjs`, `email-domain.mjs`, `countdown-gif.mjs` | via Resend |
| reputacao | A | página de avaliação; pedidos por WhatsApp ou e-mail; widget para o site; depoimento em vídeo; sincronizar e responder avaliações do Google | `reputation-*.mjs`, `google-integrations.mjs` | pedido por SMS é B |
| relatorios | A | painel com GA4, Perfil da Empresa e Search Console; relatório com link público que expira; envio agendado por e-mail | `report-model.mjs`, `report-share.mjs`, `dashboard-model.mjs` | Google OAuth |
| pagamentos-e-pix | A | Pix e cartão via checkout AbacatePay; faturas avulsas e recorrentes, orçamentos, loja e recuperação de carrinho, assinatura de documento, planos de comunidade, ingressos | `abacatepay.mjs`, `invoice-model.mjs`, `checkout-model.mjs`, `estimate-model.mjs`, `document-model.mjs` | duas conexões: a agência cobra as subcontas; cada subconta cobra os próprios clientes. **Não é a forma de pagamento da assinatura do graao** |
| cursos-e-area-de-membros | A | cursos com módulos e liberação gradual; vídeos do YouTube, Vimeo, Loom ou Drive; portal com acesso por link no e-mail; comunidade com planos pagos; certificados com verificação pública | `course-*.mjs`, `client-portal.mjs`, `certificate-model.mjs`, `community.mjs` | — |
| telefone-e-voz | A (exceto SMS) | números de telefone; ligar pelo sistema; gravações; menu de voz (URA); encaminhamento e caixa postal; Voice AI; discador em lote; validação de números | `twilio.mjs`, `phone-server.mjs`, `voice-ai.mjs`, `phone-model.mjs` | via Twilio da plataforma; **sem SMS** |
| gestao-de-agencias | A (comissões B) | subcontas com módulos escolhidos; usuários e permissões; modo SaaS com planos, margem e carteira; cobrar subcontas; snapshots/setups com marketplace; app com a marca da agência (PWA); afiliados com link, portal e comissões | `agency-model.mjs`, `setup-marketplace.mjs`, `agency-mobile.mjs`, `affiliate-model.mjs` | **pagamento de comissão só registrado**; publicação nas lojas não automatizada |

## Fatos transversais
| Fato | Nível | Fonte |
|---|---|---|
| Primeiro login com Google cria a agência ("Minha agência") automaticamente | A | `server.mjs` (`accessContext`), `auth.mjs` |
| Push no app/portal (Web Push) | A | `web-push.mjs`, `push-model.mjs` |
| Catálogo de 27 conectores | A | `connectors.mjs`, `ui/connectors-data.js` — não nomear no site apps que sejam concorrentes |
| Preço dos planos do graao | **PENDENTE** | `ui/agency-data.js` tem só valores de catálogo (Starter/Unlimited/Agency Pro) sem cobrança real — **não publicar** |
| Suporte brasileiro, calls todos os dias, comunidade ativa | PROVIDED (brief) | `BUSINESS_BRIEF.md` — horário pendente |
| SMS | B | `twilio.mjs` não tem API de mensagens |
