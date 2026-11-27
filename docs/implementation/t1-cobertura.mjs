// T.1 — mapa de cobertura do motor de workflows: cada gatilho e ação do editor do GoHighLevel (04c §1.3)
// ligado ao que a Graao tem em ui/workflow-data.js.
//
// status:
//   'coberto'  — `graao` lista os tipos da Graao que fazem o mesmo (test/t1-cobertura.test.mjs confere que existem);
//   'falta'    — ainda não existe; `plano` diz o tipo previsto e em que item do roadmap entra;
//   'conector' — vem pelo catálogo de conectores (T.2: Google Sheets, Slack, Shopify, LinkedIn, TikTok);
//   'fora'     — fora do escopo, com o motivo em `nota`.
// O T.1 termina quando não sobrar nenhum 'falta'.

const c = (ghl, graao, nota = '') => ({ ghl, status: 'coberto', graao: [].concat(graao), nota });
const falta = (ghl, plano, nota = '') => ({ ghl, status: 'falta', plano, nota });
const conector = (ghl, nota = '') => ({ ghl, status: 'conector', nota });
const fora = (ghl, nota) => ({ ghl, status: 'fora', nota });

const objetos = 'A Graao não tem objetos personalizados com registros próprios: Configurações → Objetos cobre campos em Contato, Oportunidade e Empresa, e a Empresa tem as ações company_*.';
const eliza = 'Produto proprietário do GHL (Eliza); o equivalente na Graao é o agente de IA da subconta (ai_agent).';

export const gatilhos = [
  // Contact (12)
  c('Birthday reminder', 'birthday_reminder'), c('Contact changed', 'contact_changed'), c('Contact created', 'contact_created'),
  c('Contact DND', 'contact_dnd'), c('Contact tag', 'contact_tag'), c('Custom date reminder', 'custom_date_reminder'),
  c('Note added', 'note_added'), c('Note changed', 'note_changed'), c('Task added', 'task_added'), c('Task reminder', 'task_reminder'),
  c('Contact engagement score', 'score_changed'), c('Task completed', 'task_completed'),
  // Events (26)
  c('Inbound webhook', 'inbound_webhook'), c('Scheduler', 'scheduler'),
  c('Call details', 'call_details', 'Ligação terminou: direção, resultado e número (Twilio).'),
  c('Email events', 'email_event'), c('Customer replied', 'customer_replied'),
  c('Inbound email', 'email_received', 'Endereço conversas+<subconta> pela Resend; as respostas aos e-mails voltam para Conversas.'),
  c('Conversation AI trigger', 'conversation_ai_event', 'Respondeu, sugeriu, marcou, passou para a equipe ou encerrou.'),
  c('Custom trigger', 'custom_event'), c('Form submitted', 'form_submitted'), c('Survey submitted', 'survey_submitted'),
  c('Trigger link clicked', 'trigger_link_clicked'),
  c('Facebook lead form submitted', 'meta_lead_form'),
  c('TikTok form submitted', 'conn_tiktok_leads__form_submitted', 'Catálogo de conectores (T.2).'),
  c('Video tracking', 'video_watched', 'Vídeos HTML5 do site com o script de rastreamento (25, 50, 75 e 100%).'),
  c('Number validation', 'phone_validated', 'Depois da ação Validar telefone (Twilio Lookup).'),
  c('Messaging error - SMS', 'message_failed'),
  c('LinkedIn lead form submitted', 'conn_linkedin_leads__form_submitted', 'Catálogo de conectores (T.2).'),
  c('Funnel/website pageview', 'site_page_viewed'), c('Quiz submitted', 'quiz_submitted'),
  c('External tracking event', 'external_tracking_event'), c('Prospect generated', 'prospect_received'),
  c('Click to WhatsApp ads', 'whatsapp_ad_click'),
  c('User replied', 'user_replied'),
  c('AI studio form submitted', 'form_submitted', 'Os sites do Studio da Graao mandam os formulários como Formulário enviado.'),
  c('New review received', 'review_received'), c('Video testimonial received', 'video_testimonial'),
  // Appointments (4)
  c('Appointment status', 'appointment_status'), c('Customer booked appointment', 'appointment_booked'),
  c('Service booking', 'service_booked'), c('Rental booking', 'service_booked', 'Reserva de serviço cobre atendimento, campo e locação.'),
  // Opportunities (5)
  c('Opportunity status changed', 'opportunity_status_changed'), c('Opportunity created', 'opportunity_created'),
  c('Opportunity changed', 'opportunity_changed'), c('Pipeline stage changed', 'pipeline_stage_changed'), c('Stale opportunities', 'stale_opportunity'),
  // Affiliate (4)
  c('Affiliate created', 'affiliate_created'), c('New affiliate sales', 'affiliate_sale'),
  c('Affiliate enrolled in campaign', 'affiliate_campaign_enrolled'), c('Lead created', 'affiliate_lead'),
  // Courses (11)
  c('Category started', 'course_module_started'), c('Category completed', 'course_module_completed'),
  c('Lesson started', 'lesson_started'), c('Lesson completed', 'lesson_completed'),
  c('New signup', 'portal_login', 'O primeiro acesso ao portal conta como cadastro (filtro Primeiro acesso).'),
  c('Offer access granted', 'offer_access_granted'), c('Offer access removed', 'offer_access_revoked'),
  c('Product access granted', 'course_access_granted'), c('Product access removed', 'course_access_revoked'),
  c('Product started', 'course_started'), c('Product completed', 'course_completed'),
  // Payments (12)
  c('Invoice', 'invoice_status'), c('Payment received', 'payment_received'), c('Order form submission', 'order_submitted'),
  c('Order submitted', 'order_submitted'), c('Documents & contracts', 'document_status'), c('Estimates', 'estimate_status'),
  c('Subscription', 'subscription_status'), c('Refund', 'refund'), c('Coupon code redeemed', 'coupon_redeemed'),
  c('Coupon code expired', 'coupon_expired'), c('Coupon code applied', 'coupon_applied'), c('Coupon redemption limit reached', 'coupon_limit_reached'),
  // Ecommerce stores (8)
  fora('Shopify abandoned cart (deprecating soon)', 'Sendo descontinuado no próprio GHL; o Shopify entra pelo conector (T.2).'),
  c('Shopify order placed', 'conn_shopify__order_placed', 'Catálogo de conectores (T.2).'),
  fora('Shopify order fulfilled (deprecating soon)', 'Sendo descontinuado no próprio GHL; o Shopify entra pelo conector (T.2).'),
  c('Order fulfilled', 'order_fulfilled'), c('Product review submitted', 'product_review'), c('Abandoned checkout', 'abandoned_checkout'),
  c('Add products to cart', 'cart_updated'), c('Product viewed', 'product_viewed'),
  // IVR (1)
  c('Start IVR trigger', 'ivr_call'),
  // Facebook/Instagram events (2)
  c('Facebook - Comment(s) on a post', 'social_comment_received'), c('Instagram - Comment(s) on a post', 'social_comment_received'),
  // Communities (10)
  c('Private channel access granted', 'community_channel_granted'), c('Private channel access revoked', 'community_channel_revoked'),
  c('Group access granted', 'community_member_joined'), c('Community group member leaderboard level changed', 'community_level_changed'),
  c('Group access revoked', 'community_access_revoked'), c('Group post created', 'community_post_created'),
  c('Requested to join group', 'community_join_requested'), c('Group joining request rejected', 'community_join_rejected'),
  c('Member registered for group event', 'community_event_registered'), c('Group comment created', 'community_comment_created'),
  // Certificates (2)
  c('Certificates issued', 'certificate_issued'), c('Badges issued', 'badge_issued'),
  // Communication (3)
  c('TikTok - comment(s) on a video', 'social_comment_received'), c('Transcript generated', 'transcript_generated'), c('Conversations SLA', 'conversation_sla'),
  // Social planner (1)
  c('Social planner posts', 'social_post_published'),
  // Client portal (3)
  c('User login (client portal / memberships)', 'portal_login'),
  c('Client portal file uploaded', 'portal_file_uploaded'),
  c('User signup (client portal / memberships)', 'portal_login', 'O primeiro acesso conta como cadastro.'),
  // Associations (1)
  c('Association created (beta)', 'association_created', 'Contato ligado a uma empresa ou oportunidade ligada a um contato.'),
  // Events management (2)
  c('Event registration', 'community_event_registered'), c('Event checked in', 'community_event_checked_in'),
  // Google ads (1)
  c('Google lead form submitted', 'google_lead_form'),
  // Google sheets (3) e Slack (5)
  c('New spreadsheet row (polling 5 mins) (beta)', 'conn_google_sheets__new_row', 'Catálogo de conectores (T.2).'), c('New spreadsheet (polling 5 mins) (beta)', 'conn_google_sheets__new_spreadsheet', 'Catálogo de conectores (T.2).'), c('New worksheet (polling 5 mins) (beta)', 'conn_google_sheets__new_worksheet', 'Catálogo de conectores (T.2).'),
  c('New mention (instant)', 'conn_slack__mention', 'Catálogo de conectores (T.2).'), c('User invited to channel (instant)', 'conn_slack__member_joined', 'Catálogo de conectores (T.2).'), c('New direct message (instant)', 'conn_slack__direct_message', 'Catálogo de conectores (T.2).'),
  c('New message posted to channel (instant)', 'conn_slack__message', 'Catálogo de conectores (T.2).'), c('New reaction added (instant)', 'conn_slack__reaction', 'Catálogo de conectores (T.2).')
];

export const acoes = [
  // Contact (18)
  c('Create contact', 'create_contact'), c('Find contact', 'find_contact'), c('Update contact field', 'update_field'),
  c('Add contact tag', 'add_tag'), c('Remove contact tag', 'remove_tag'), c('Assign to user', 'assign_user'),
  c('Remove assigned user', 'remove_user'), c('Enable/disable DND', 'set_dnd'), c('Add to notes', 'add_note'),
  c('Copy contact', 'copy_contact'), c('Delete contact', 'delete_contact'), c('Remove contact followers', 'conversation_followers'),
  c('Edit conversation', 'edit_conversation'), c('Add task', 'create_task'), c('Modify contact engagement score', 'adjust_score'),
  c('Add contact followers', 'conversation_followers'), c('Merge contact', 'merge_contact'), c('Email verification', 'email_verify'),
  // Custom objects (3)
  fora('Create Associated Record for Contact', objetos), fora('Update Associated Record for Contact', objetos), fora('Clear fields of Associated Record for Contact', objetos),
  // Communication (32)
  c('Send email', 'send_email'), c('Send SMS', 'send_sms'),
  c('Call', 'call', 'Liga para a equipe e conecta o contato.'), c('Voicemail', 'voicemail_drop'),
  c('Messenger', 'send_messenger'),
  c('Instagram DM', 'send_instagram_dm'), c('Manual action to SMS', 'manual_sms'), c('Manual action to call', 'manual_call'),
  fora('GMB messaging', 'O Google encerrou o Business Messages (mensagens do Perfil da Empresa) em julho de 2024.'),
  c('Send internal notification', 'internal_notification'), c('Send review request', 'review_request'),
  c('Conversation AI', ['conversation_ai', 'conversation_ai_status'], 'Agente de IA publicado responde na conversa; ligado na conversa, responde a cada mensagem nova.'),
  c('Facebook interactive messenger', 'send_messenger', 'Respostas rápidas (botões) no Messenger.'),
  c('Instagram interactive messenger', 'send_instagram_dm', 'Respostas rápidas (botões) no Direct.'),
  c('Reply in comments', 'reply_social_comment'),
  c('Appointment booking conversation AI bot', 'conversation_ai', 'Com um serviço escolhido, oferece horários livres e marca o escolhido.'),
  c('Send live chat message', 'send_live_chat'),
  c('Log external call', 'log_call'),
  c('WhatsApp', 'send_whatsapp'), c('Whatsapp: customer service window check', 'whatsapp_window'), c('Book appointment', 'book_appointment'),
  c('Update conversation AI bot and status', 'conversation_ai_status'),
  fora('Whatsapp: send flows', 'WhatsApp Flows existe só na API oficial da Meta (Cloud API); a Graao usa a Evolution API.'),
  c('WhatsApp media', 'whatsapp_media'),
  c('WhatsApp interactive messages', 'whatsapp_interactive', 'Botões, lista ou enquete pela Evolution API.'),
  fora('TikTok interactive messenger', 'O TikTok não abre a API de mensagens diretas para contas comerciais em geral.'),
  c('Send opt-in message (beta)', 'send_optin'),
  c('Add internal comments', 'add_note', 'Nota interna na conversa.'),
  fora('Send RCS', 'RCS Business Messaging exige marca aprovada pelo Google e um provedor RCS; nenhum dos canais da Graao oferece.'),
  fora('RCS interactive message', 'RCS Business Messaging exige marca aprovada pelo Google e um provedor RCS; nenhum dos canais da Graao oferece.'),
  c('Live chat interactive messenger (beta)', 'send_live_chat', 'Botões de resposta no chat do site.'),
  c('Show WhatsApp typing indicator', 'whatsapp_typing'),
  // Slack (6)
  c('Send Message', 'conn_slack__send_message', 'Catálogo de conectores (T.2).'), c('Invite user to channel (beta)', 'conn_slack__invite_user', 'Catálogo de conectores (T.2).'), c('Find channel by name (beta)', 'conn_slack__find_channel', 'Catálogo de conectores (T.2).'),
  c('Find user by email (beta)', 'conn_slack__find_user', 'Catálogo de conectores (T.2).'), c('Update message (beta)', 'conn_slack__update_message', 'Catálogo de conectores (T.2).'), c('Create channel (beta)', 'conn_slack__create_channel', 'Catálogo de conectores (T.2).'),
  // Send data (2)
  c('Webhook', 'webhook'), c('Custom webhook', 'custom_webhook'),
  // Google Sheets (11)
  c('Create spreadsheet row', 'conn_google_sheets__add_row', 'Catálogo de conectores (T.2).'), c('Create multiple spreadsheet row(s)', 'conn_google_sheets__add_rows', 'Catálogo de conectores (T.2).'), c('Lookup spreadsheet row', 'conn_google_sheets__lookup_row', 'Catálogo de conectores (T.2).'),
  c('Lookup multiple spreadsheet row(s)', 'conn_google_sheets__lookup_rows', 'Catálogo de conectores (T.2).'), c('Update specific spreadsheet row', 'conn_google_sheets__update_row', 'Catálogo de conectores (T.2).'), c('Update multiple spreadsheet row(s)', 'conn_google_sheets__update_rows', 'Catálogo de conectores (T.2).'),
  c('Update spreadsheet row using lookup', 'conn_google_sheets__update_by_lookup', 'Catálogo de conectores (T.2).'), c('Clear specific spreadsheet row', 'conn_google_sheets__clear_row', 'Catálogo de conectores (T.2).'), c('Clear spreadsheet row using lookup', 'conn_google_sheets__clear_by_lookup', 'Catálogo de conectores (T.2).'),
  c('Format spreadsheet row(s)', 'conn_google_sheets__format_rows', 'Catálogo de conectores (T.2).'), c('Remove spreadsheet row(s)', 'conn_google_sheets__remove_rows', 'Catálogo de conectores (T.2).'),
  // Internal (18)
  c('If / else', 'if_else'), c('Router', 'router'), c('Loop (beta)', 'loop'), c('Wait', 'wait'), c('Goal event', 'goal'), c('Split', 'split'),
  c('Update custom value', 'update_custom_value'), c('Go to', 'goto'), c('Date/time formatter', 'date_format'), c('Number formatter', 'number_format'),
  c('Math operation', 'math'),
  c('Set event start date', 'set_event_date', 'Com o modo Aguardar “em relação à data do evento”.'),
  c('Add to workflow', 'add_to_workflow'), c('Remove from workflow', 'remove_from_workflow'), c('Array formatter', 'list_format'), c('Drip', 'drip'),
  c('Text formatter', 'text_format'),
  c('Custom code', 'custom_code', 'Linguagem de expressões da Graao (nome = expressão por linha), sem rede nem disco.'),
  // Workflow AI (7)
  c('AI Agent', 'ai_agent'), c('External AI models', 'ai_prompt'), c('GPT powered by OpenAI', 'ai_prompt'),
  c('AI image generation', 'ai_image_generate'),
  fora('Eliza', eliza), fora('Eliza AI appointment booking', eliza), fora('Send to Eliza agent platform', eliza),
  // Appointments (3)
  c('Update appointment status', 'appointment_status_update'), c('Generate one time booking link', 'booking_link'), c('Create appointment / booking note', 'appointment_note'),
  // Opportunity (14)
  c('Create/update opportunity', 'create_opportunity'), c('Remove opportunity', 'remove_opportunity'), c('Remove owner from opportunity', 'opportunity_owner'),
  c('Find opportunity', 'find_opportunity'), c('Create opportunity', 'create_opportunity'),
  c('Update opportunity', ['create_opportunity', 'opportunity_status'], 'Criar ou atualizar muda etapa e valor; Mudar status fecha como ganha ou perdida.'),
  c('Remove follower(s) from opportunity', 'opportunity_followers'), c('Add follower(s) to opportunity', 'opportunity_followers'), c('Add owner to opportunity', 'opportunity_owner'),
  fora('Associate record(s) to opportunity (beta)', objetos), fora('Remove associated record(s) of an opportunity from workflow (beta)', objetos),
  fora('Create associated records of an opportunity (beta)', objetos), fora('Update associated records of an opportunity (beta)', objetos),
  fora('Add associated record(s) of an opportunity to workflow (beta)', objetos),
  // Payments (6)
  c('Stripe one time charge', ['create_invoice', 'send_invoice'], 'A AbacatePay não guarda cartão para cobrar direto: a cobrança avulsa vira fatura com link de pagamento (Pix ou cartão) enviada ao contato.'),
  c('Send estimate', 'send_estimate'), c('Send documents & contracts', 'send_document'), c('Send invoice', 'send_invoice'),
  c('Send recurring invoice', 'start_recurring_invoice'), c('Update inventory', 'update_inventory'),
  // Marketing (6)
  c('Add to Google Analytics', 'ga4_event'), c('Add to Google Ads', 'google_ads_conversion'), c('Facebook - Add to custom audience', 'meta_audience'),
  c('Facebook - Remove from custom audience', 'meta_audience'), c('Meta conversion API', 'meta_conversion'), c('Generate marketing audit report', 'marketing_audit'),
  // Affiliate (6)
  c('Add to affiliate manager', 'make_affiliate'), c('Update affiliate', 'update_affiliate'), c('Add to affiliate campaign', 'add_affiliate_campaign'),
  c('Remove from affiliate campaign', 'remove_affiliate_campaign'), c('Add leads under an affiliate', 'assign_affiliate_lead'), c('Add manual sales for an affiliate', 'affiliate_manual_sale'),
  // Membership (4)
  c('Course grant offer', 'grant_offer'), c('Course revoke offer', 'revoke_offer'), c('Revoke course access', 'revoke_course_access'), c('Grant course access', 'grant_course_access'),
  // IVR (5)
  c('Gather input on call', 'ivr_gather'), c('SAY OR PLAY MESSAGE', 'ivr_say'),
  c('Connect to call', 'ivr_connect'), c('End call', 'ivr_hangup'), c('Record voicemail', 'ivr_record'),
  // Certificates (2)
  c('Issue certificate', 'issue_certificate'), c('Issue badge', 'issue_badge'),
  // Agent Studio (2)
  c('Invoke flow agents', 'ai_agent'), c('Invoke managed agents', 'ai_agent'),
  // AI Actions (11)
  c('AI decision maker', 'ai_decision'), c('AI summarize', 'ai_summarize'), c('AI intent detection', 'ai_intent'), c('AI translate', 'ai_translate'),
  c('AI extract data (beta)', 'ai_extract'), c('AI email parser (beta)', 'ai_extract', 'O e-mail entra como texto de onde extrair.'),
  c('AI analyze image', 'ai_image'), c('Claude action', 'ai_prompt'),
  c('AI video generation', 'ai_video_generate'),
  fora('AI analyze video', 'A conexão de IA da Graao é a OpenAI, cuja API não recebe vídeo como entrada.'),
  c('Gemini action', 'ai_prompt'),
  // Associations (3)
  fora('Add associated records to workflow', objetos), fora('Remove associated records from workflow', objetos), fora('Associate records with Contact (beta)', objetos),
  // Communities (6)
  c('Grant private channel access', 'grant_channel_access'), c('Revoke private channel access', 'revoke_channel_access'),
  c('Revoke group access', 'revoke_community_access'),
  c('Smart push notification', 'push_notification', 'Para a equipe (app mobile) ou para o contato (portal do cliente), por Web Push.'),
  c('Grant community group leaderboard points', 'community_points'), c('Grant group access', 'grant_community_access'),
  // Company (3)
  c('Clear associated company fields', 'company_clear'), c('Create and associate company', 'company_create'), c('Update associated company', 'company_update'),
  // Conversation AI (9)
  // As etapas do construtor de bots do GHL viram etapas comuns do fluxo, em volta do "Bot de IA na conversa".
  c('Continue conversation', 'conversation_ai'), c('AI message', 'conversation_ai'),
  c('Transfer bot', 'conversation_ai_status', 'Liga outro agente na conversa (ou desliga o bot e a equipe assume).'),
  c('AI splitter', 'ai_intent'), c('Custom message', ['send_whatsapp', 'send_live_chat'], 'Mensagem fixa no canal da conversa.'),
  c('AI capture information', 'ai_extract'), c('End conversation', 'conversation_ai_status'),
  c('Book appointment', 'conversation_ai', 'Com um serviço escolhido.'), c('Services booking', 'conversation_ai', 'Com um serviço escolhido.'),
  // Events Management (2)
  c('Register for ticketed event (beta)', 'register_event', 'Evento pago inscrito como cortesia, sem cobrar.'),
  c('Register for rsvp event (beta)', 'register_event'),
  // Voice AI (1)
  c('Voice AI outbound call (beta)', 'voice_ai_call', 'Agente de IA liga e conversa por voz (Twilio).')
];
