# Catálogo técnico do GoHighLevel

Gerado em 20/11/2026 a partir de 142 telas visitadas (125 da subconta e 17 da agência) num Chrome com CDP. O código JS de cada tela foi capturado com `Debugger.getScriptSource`, e as chamadas de API foram registradas só como método e caminho, sem headers nem corpo. IDs foram trocados por `:id`/`:locationId`. Chamadas que aparecem em mais de 30% das telas (polling, sessão, sidebar) foram removidas. Evidências REA: `ev_ab5c348b…` (casca) e `ev_1ea708ee…` (construtor de workflows).

Uso: referência para desenhar os modelos de dados e as APIs do Graao. **Não** copiar código nem textos.

## 1. Workflows: catálogo de gatilhos e ações

### 1.1 Gatilhos com descrição (catálogo do micro-app `ai/superagents`)

| Categoria | Gatilho (`id`) | O que faz | Cadência |
|---|---|---|---|
| contacts | Contact created (`contact_created`) | Triggers when a new contact is created in the CRM. | realtime |
| contacts | Contact updated (`contact_updated`) | Triggers when any field on a contact changes. | realtime |
| contacts | Contact DND changed (`contact_dnd_changed`) | Triggers when a contact opts in or out of communications. | realtime |
| contacts | Birthday reminder (`birthday_reminder`) | Runs on a contact's birthday, at the time you choose. | scheduled |
| tags | Lead tag (`tag`) | Triggers when a lead tag is added or removed. | realtime |
| tags | Tag created (`tag_created`) | Triggers when a new tag is created in your account. | realtime |
| opportunities | Opportunity created (`opportunity_created`) | Triggers when a new opportunity is created. | realtime |
| opportunities | Opportunity status changed (`opportunity_status_changed`) | Triggers when an opportunity changes status or pipeline stage. | realtime |
| opportunities | Stale opportunity (`stale_opportunity`) | Runs when an opportunity has been inactive for a set number of days. | scheduled |
| appointments | Appointment booked (`appointment_booked`) | Triggers when a customer books an appointment. | realtime |
| appointments | Appointment status (`appointment_status`) | Triggers when an appointment status changes (confirmed, cancelled, no-show, …). | realtime |
| appointments | Appointment reminder (`appointment_reminder`) | Runs a set time before an upcoming appointment. | scheduled |
| payments | Payment received (`payment_received`) | Triggers when a one-time or subscription payment succeeds. | realtime |
| payments | Payment failed (`payment_failed`) | Triggers when a charge or renewal fails. | realtime |
| payments | Invoice paid (`invoice_paid`) | Triggers when an invoice is paid in full. | realtime |
| payments | Subscription cancelled (`subscription_cancelled`) | Triggers when a customer cancels a subscription. | realtime |
| forms | Form submitted (`form`) | Triggers when a form is submitted. | realtime |
| forms | Survey submitted (`survey_submission`) | Triggers when a survey response is received. | realtime |
| forms | Facebook lead form (`facebook_lead_gen`) | Triggers when a contact submits a Facebook lead form. | realtime |
| forms | Facebook comment (`facebook_comment`) | Triggers when someone comments on one of your Facebook posts. | realtime |
| forms | Quiz completed (`quiz_completed`) | Triggers when a contact completes a quiz. | realtime |
| communications | Meeting notes ready (`note_ready`) | Triggers when a meeting recorded with Meeting AI ends and its summary and transcript are ready. | realtime |
| communications | Chat message (`chat`) | Invoked via the Managed Agents chat interface. | realtime |
| communications | Customer replied (`customer_reply`) | Triggers when a contact sends an inbound message on any channel. | realtime |
| communications | Call completed (`call_completed`) | Triggers when an inbound or outbound call ends. | realtime |
| communications | Missed call (`missed_call`) | Triggers when an inbound call goes unanswered. | realtime |
| membership | Course completed (`course_completed`) | Triggers when a member finishes a course. | realtime |
| membership | Membership granted (`membership_granted`) | Triggers when a contact is granted access to a membership offer. | realtime |
| scheduled | Schedule (`schedule`) | Runs the agent on a one-time or recurring schedule. | scheduled |
| scheduled | Date reminder (`date_reminder`) | Runs relative to any date field on a contact. | scheduled |
| custom | Invoked from a workflow (`workflows`) | Runs when an automation workflow calls this agent. | webhook |
| custom | Inbound webhook (`inbound_webhook`) | Runs when an external system sends an HTTP request to this agent's URL. | webhook |
| custom | Custom event (`custom_event`) | Triggers on a custom event sent from your app via the API. | webhook |

### 1.2 Enum de tipos de gatilho da casca (`store.js`)

`facebook_lead_add`, `customer_reply`, `customer_appointment`, `customer_appointment_v3`, `pipeline_stage_updated`, `added_to_campaign`, `opportunity_decay`, `appointment`, `appointment_v3`, `trigger_link`, `form_submission`, `contact_tag`, `opportunity_status_changed`, `facebook_lead_gen`, `birthday_reminder`, `custom_date_reminder`, `mailgun_email_event`, `dnd_contact`, `task_due_date_reminder`, `two_step_form_submission`, `call_status`, `survey_submission`, `product_access_granted`, `product_access_removed`, `user_log_in`, `product_completed`, `product_progress_percentage`, `membership_contact_created`, `task_added`, `validation_error`, `offer_access_granted`, `offer_access_removed`

### 1.3 Catálogo completo do editor (capturado com o editor aberto)

Lido do painel do editor num workflow de rascunho criado para isso ("New Workflow : 1795194497468", em rascunho, não publicado). **116 gatilhos** em 20 grupos e **180 ações** em 24 grupos. As abas "Apps" (integrações do marketplace) não foram expandidas.

#### Gatilhos

| Grupo | Gatilhos |
|---|---|
| Contact | Birthday reminder · Contact changed · Contact created · Contact DND · Contact tag · Custom date reminder · Note added · Note changed · Task added · Task reminder · Contact engagement score · Task completed |
| Events | Inbound webhook · Scheduler · Call details · Email events · Customer replied · Inbound email · Conversation AI trigger · Custom trigger · Form submitted · Survey submitted · Trigger link clicked · Facebook lead form submitted · TikTok form submitted · Video tracking · Number validation · Messaging error - SMS · LinkedIn lead form submitted · Funnel/website pageview · Quiz submitted · External tracking event · Prospect generated · Click to WhatsApp ads · User replied · AI studio form submitted · New review received · Video testimonial received |
| Appointments | Appointment status · Customer booked appointment · Service booking · Rental booking |
| Opportunities | Opportunity status changed · Opportunity created · Opportunity changed · Pipeline stage changed · Stale opportunities |
| Affiliate | Affiliate created · New affiliate sales · Affiliate enrolled in campaign · Lead created |
| Courses | Category started · Category completed · Lesson started · Lesson completed · New signup · Offer access granted · Offer access removed · Product access granted · Product access removed · Product started · Product completed |
| Payments | Invoice · Payment received · Order form submission · Order submitted · Documents & contracts · Estimates · Subscription · Refund · Coupon code redeemed · Coupon code expired · Coupon code applied · Coupon redemption limit reached |
| Ecommerce stores | Shopify abandoned cart (deprecating soon) · Shopify order placed · Shopify order fulfilled (deprecating soon) · Order fulfilled · Product review submitted · Abandoned checkout · Add products to cart · Product viewed |
| IVR | Start IVR trigger |
| Facebook/Instagram events | Facebook - Comment(s) on a post · Instagram - Comment(s) on a post |
| Communities | Private channel access granted · Private channel access revoked · Group access granted · Community group member leaderboard level changed · Group access revoked · Group post created · Requested to join group · Group joining request rejected · Member registered for group event · Group comment created |
| Certificates | Certificates issued · Badges issued |
| Communication | TikTok - comment(s) on a video · Transcript generated · Conversations SLA |
| Social planner | Social planner posts |
| Client portal | User login (client portal / memberships) · Client portal file uploaded · User signup (client portal / memberships) |
| Associations | Association created (beta) |
| Events management | Event registration · Event checked in |
| Google ads | Google lead form submitted |
| Google sheets | New spreadsheet row (polling 5 mins) (beta) · New spreadsheet (polling 5 mins) (beta) · New worksheet (polling 5 mins) (beta) |
| Slack | New mention (instant) · User invited to channel (instant) · New direct message (instant) · New message posted to channel (instant) · New reaction added (instant) |

#### Ações

| Grupo | Ações |
|---|---|
| Contact | Create contact · Find contact · Update contact field · Add contact tag · Remove contact tag · Assign to user · Remove assigned user · Enable/disable DND · Add to notes · Copy contact · Delete contact · Remove contact followers · Edit conversation · Add task · Modify contact engagement score · Add contact followers · Merge contact · Email verification |
| Custom objects | Create Associated Record for Contact · Update Associated Record for Contact · Clear fields of Associated Record for Contact |
| Communication | Send email · Send SMS · Call · Voicemail · Messenger · Instagram DM · Manual action to SMS · Manual action to call · GMB messaging · Send internal notification · Send review request · Conversation AI · Facebook interactive messenger · Instagram interactive messenger · Reply in comments · Appointment booking conversation AI bot · Send live chat message · Log external call · WhatsApp · Whatsapp: customer service window check · Book appointment · Update conversation AI bot and status · Whatsapp: send flows · WhatsApp media · WhatsApp interactive messages · TikTok interactive messenger · Send opt-in message (beta) · Add internal comments · Send RCS · RCS interactive message · Live chat interactive messenger (beta) · Show WhatsApp typing indicator |
| Slack | Send Message · Invite user to channel (beta) · Find channel by name (beta) · Find user by email (beta) · Update message (beta) · Create channel (beta) |
| Send data | Webhook · Custom webhook |
| Google Sheets | Create spreadsheet row · Create multiple spreadsheet row(s) · Lookup spreadsheet row · Lookup multiple spreadsheet row(s) · Update specific spreadsheet row · Update multiple spreadsheet row(s) · Update spreadsheet row using lookup · Clear specific spreadsheet row · Clear spreadsheet row using lookup · Format spreadsheet row(s) · Remove spreadsheet row(s) |
| Internal | If / else · Router · Loop (beta) · Wait · Goal event · Split · Update custom value · Go to · Date/time formatter · Number formatter · Math operation · Set event start date · Add to workflow · Remove from workflow · Array formatter · Drip · Text formatter · Custom code |
| Workflow AI | AI Agent · External AI models · GPT powered by OpenAI · AI image generation · Eliza · Eliza AI appointment booking · Send to Eliza agent platform |
| Appointments | Update appointment status · Generate one time booking link · Create appointment / booking note |
| Opportunity | Create/update opportunity · Remove opportunity · Remove owner from opportunity · Find opportunity · Create opportunity · Update opportunity · Remove follower(s) from opportunity · Add follower(s) to opportunity · Add owner to opportunity · Associate record(s) to opportunity (beta) · Remove associated record(s) of an opportunity from workflow (beta) · Create associated records of an opportunity (beta) · Update associated records of an opportunity (beta) · Add associated record(s) of an opportunity to workflow (beta) |
| Payments | Stripe one time charge · Send estimate · Send documents & contracts · Send invoice · Send recurring invoice · Update inventory |
| Marketing | Add to Google Analytics · Add to Google Ads · Facebook - Add to custom audience · Facebook - Remove from custom audience · Meta conversion API · Generate marketing audit report |
| Affiliate | Add to affiliate manager · Update affiliate · Add to affiliate campaign · Remove from affiliate campaign · Add leads under an affiliate · Add manual sales for an affiliate |
| Membership | Course grant offer · Course revoke offer · Revoke course access · Grant course access |
| IVR | Gather input on call · SAY OR PLAY MESSAGE · Connect to call · End call · Record voicemail |
| Certificates | Issue certificate · Issue badge |
| Agent Studio | Invoke flow agents · Invoke managed agents |
| AI Actions | AI decision maker · AI summarize · AI intent detection · AI translate · AI extract data (beta) · AI email parser (beta) · AI analyze image · Claude action · AI video generation · AI analyze video · Gemini action |
| Associations | Add associated records to workflow · Remove associated records from workflow · Associate records with Contact (beta) |
| Communities | Grant private channel access · Revoke private channel access · Revoke group access · Smart push notification · Grant community group leaderboard points · Grant group access |
| Company | Clear associated company fields · Create and associate company · Update associated company |
| Conversation AI | Continue conversation · AI message · Transfer bot · AI splitter · Custom message · AI capture information · End conversation · Book appointment · Services booking |
| Events Management | Register for ticketed event (beta) · Register for rsvp event (beta) |
| Voice AI | Voice AI outbound call (beta) |

#### Aba "Apps" (integrações nativas com gatilhos e ações próprios)

As mesmas apps aparecem nos dois painéis, com uma única diferença: Mistral AI e OpenRouter só têm ações.

Airtable · Apify · Asana · Basecamp · Browse AI · Cal.com · Calendly · ClickUp · Fathom · Google Contacts · Google Forms · Housecall Pro · HubSpot · Jira · Jotform · Klaviyo · Linear · Manus AI · Mistral AI · Monday.com · Notion · OpenRouter · Todoist · Typeform, além de "Discover" (marketplace).

Para o Graao, o modelo equivalente é um **catálogo de conectores**, em que cada app declara os próprios gatilhos e ações. O Pergunte o Graao já tem conectores multi-tenant (`graao-chat.mjs`) que podem ser reaproveitados.

### 1.4 Tipos internos (snake_case) vistos no código do construtor (`client-app-automation-workflows`)

Tipos encontrados no código do construtor que têm rótulo de interface. Os genéricos de UI foram removidos.
| Grupo | Tipos |
|---|---|
| Contato | `add_contact_tag`, `remove_contact_tag`, `assign_user`, `remove_assigned_user`, `update_contact_field`, `add_notes`, `copy_contact_to_subaccount`, `update_custom_value`, `add_field_data`, `update_field_data`, `clear_field_data` |
| Comunicação | `sms`, `email`, `internal_notification`, `manual_call`, `voicemail`, `fb_interactive_messenger`, `ig_interactive_messenger`, `instagram_dm`, `respond_on_comment`, `facebook_comment_on_post`, `edit_conversation`, `drip` |
| Oportunidades / agenda | `create_opportunity`, `remove_opportunity`, `update_appointment_status`, `service_booking`, `rental_booking` |
| Fluxo | `if_else`, `wait`, `workflow_goal`, `workflow_split`, `workflow_ab_test`, `add_to_workflow`, `remove_from_workflow`, `remove_from_all_workflows`, `loop`, `find` |
| Afiliados | `add_to_affiliate_manager`, `update_affiliate`, `add_to_affiliate_campaign`, `remove_from_affiliate_campaign` |
| Integrações / dados | `webhook`, `custom_webhook`, `send_data`, `google_sheets`, `google_analytics`, `google_adword`, `facebook_add_to_custom_audience`, `facebook_remove_from_custom_audience`, `facebook_conversion_api`, `stripe_one_time_charge`, custom_code (javascript) |
| IA | `ai_agent`, `conversation_ai`, workflow_ai (modelos externos), `chatgpt`, `send_to_eliza`, `conv_ai_trigger` |
| Formatadores (dados) | `text_formatter`, `number_formatter`, `math_operation`, `date_calculator`, moment_* (formatação/aritmética/fuso de datas), lodash_* (array/objeto), `array_functions` |
| IVR / telefonia | `ivr`, `ivr_say`, `ivr_connect_call`, `ivr_hangup`, `ivr_collect_voicemail`, ivr_incoming_call (gatilho) |
| Gatilhos extras vistos no construtor | `contact_changed`, `note_changed`, `task_added`, `email_event`, inbound_trigger (e-mail recebido), `inbound_webhook`, `trigger_link`, `affiliate_created`, `payment_received`, `invoice`, product_*/lesson_*/category_* (cursos), `offer_access_*`, `opportunity_decay`, `task_due_date_reminder`, `scheduler_trigger`, `conv_ai_autonomous_trigger` |

> Os nomes de exibição completos estão na seção 1.3. Esta tabela traz os ids internos correspondentes, úteis para modelar o motor de workflows do Graao.

## 2. Telas → micro-apps → APIs

Para cada tela: os micro-frontends carregados e os endpoints específicos que ela chamou. É o mapa para modelar o back-end equivalente no Graao.

### Subconta · dashboard

- **`/dashboard`**: micro-apps: `automation-reporting/reporting`
  - APIs: `GET /appengine/google/get_views`, `GET /companies/:id`, `GET /email-isv/analytics/email/health-report-data`, `GET /internal-tools/billing/company/:id/plan`, `GET /locations/:locationId`, `GET /opportunities/pipelines/`, `GET /reporting/ads-manager/facebook-ads`, `GET /reporting/ads-manager/google-ads`, `GET /reporting/dashboards`, `GET /reporting/dashboards/:id`, `GET /reporting/dashboards/:id/permissions`, `GET /reporting/dashboards/:id/sticky-notes`, `GET /reporting/dashboards/:id/user/quick-filters`, `GET /reporting/dashboards/internal-ref/gmb-linked-pages`, `GET /reporting/dashboards/widgets-definitions`, `POST /reporting/dashboards/custom`, `POST /reporting/dashboards/custom/lead-source`, `POST /reporting/opportunities/sales-velocity`, `PUT /reporting/dashboards/:id/widget-preference`
### Subconta · launchpad

- **`/launchpad`**: micro-apps: `leadgen/Launchpad`, `leadgen/Onboarding`
  - APIs: `GET /internal-tools/billing/company/:id/plan`, `GET /launchpad/feedbacks/eligibility`, `GET /launchpad/segments/companies/:id`, `GET /launchpad/segments/location/details`, `GET /localization/da/`, `GET /localization/de/`, `GET /localization/es/`, `GET /onboarding/info/widget-info`, `GET /workflow/:locationId/list`, `POST /locations/:locationId/tasks/search`, `PUT /reporting/dashboards/:id/widget-preference`
### Subconta · ask-ai

- **`/ask-ai`**: micro-apps: `ai/ai-growth`, `ai/copilot`
  - APIs: `GET /ai-wrapper/plan/location/ask-ai/users-access`, `GET /ai-wrapper/usage/limits/location`, `GET /ai-wrapper/usage/limits/location/suggestion`, `GET /ai-wrapper/usage/v2/fup-status`, `GET /ai-wrapper/usage/v2/snapshots`, `GET /copilot/ask-ai/access/effective`, `GET /copilot/ask-ai/attachments/limits`, `GET /copilot/ask-ai/company/:id/users/:id/skills`, `GET /copilot/ask-ai/computer-session`, `GET /copilot/ask-ai/connector-config`, `GET /copilot/ask-ai/dictation/info`, `GET /copilot/ask-ai/dispatch/channels`, `GET /copilot/ask-ai/locations/:locationId/users/:id/sessions`, `GET /copilot/ask-ai/projects`, `GET /copilot/ask-ai/scheduled-tasks`, `GET /copilot/ask-ai/split-view-denylist`, `POST /ai-wrapper/plan/nudges/evaluate`
### Subconta · conversations

- **`/conversations/conversations`**: micro-apps: `crm/contacts-highrise`, `crm/conversations-new-ui`
  - APIs: `GET /contacts/views/current`, `GET /conversations/sla-settings/:locationId/inbox-sla-status`, `GET /locations/:locationId/tags/categories`, `GET /locations/:locationId/tags/search`, `GET /opportunities/pipelines`, `GET /opportunities/pipelines/permissions/location`, `GET /user-preferences/:id`, `GET /users/search`, `GET /workflow/:locationId/`, `POST /conversations/inbox-bootstrap`
- **`/conversations/manual_actions`**: micro-apps: `crm/conversations-utilities`
  - APIs: `GET /conversations/manual-actions/:locationId/search`, `GET /workflow/:locationId/list`
- **`/conversations/templates`**: micro-apps: `crm/conversations-utilities`
  - APIs: `GET /snippets/:locationId`
- **`/conversations/trigger-links`**: micro-apps: `crm/conversations-utilities`
  - APIs: `GET /links/search`
- **`/conversations/analytics`**: micro-apps: `crm/conversations-utilities`
  - APIs: `GET /conversations/sla-reporting/:locationId/overview`, `GET /conversations/sla-settings/:locationId`
- **`/conversations/settings`**: micro-apps: `crm/conversations-utilities`
  - APIs: `GET /conversations/providers/search`, `GET /conversations/sla-settings/:locationId`, `GET /workflow/:locationId/list`
### Subconta · calendars

- **`/calendars/view`**: micro-apps: `automation/appointment-modal`, `automation/calendar-components`, `automation/feature-discovery`
  - APIs: `GET /calendars/groups-category/rental`, `GET /calendars/groups-category/service`, `GET /calendars/location-records/:locationId`, `GET /calendars/location-settings/:locationId/:id`, `GET /calendars/service-locations`, `GET /calendars/services/all`, `GET /calendars/user-settings/:locationId/:id/features`, `GET /locations/:locationId`, `POST /calendars/ai/agent/mode`, `POST /calendars/events/get-calendar-events`
- **`/calendars/appointments`**: micro-apps: `automation/appointment-modal`
  - APIs: `GET /calendars/location-settings/:locationId/:id`, `GET /calendars/services/all`, `GET /calendars/user-settings/:locationId/:id/features`, `GET /lists/dynamic/:locationId`, `GET /user-preferences/:id`, `POST /calendars/ai/agent/mode`, `POST /calendars/events/:locationId/search/`
### Subconta · settings

- **`/settings/calendars`**: micro-apps: —
  - APIs: `GET /calendars/location-settings/:locationId/:id`, `GET /calendars/user-settings/:locationId/:id/features`, `POST /calendars/ai/agent/mode`
### Subconta · contacts

- **`/contacts/smart_list/All`**: micro-apps: `crm/contacts`, `crm/contacts-highrise`
  - APIs: `GET /associations/objectKey/contact`, `GET /communities/:locationId/groups`, `GET /contacts/`, `GET /contacts/smartlist/search`, `GET /locations/:locationId/tags/categories`, `GET /locations/:locationId/tags/search`, `GET /opportunities/pipelines`, `GET /opportunities/pipelines/permissions/location`, `GET /saas-api/location-metadata/:locationId`, `GET /saas-api/location-metadata/:locationId/usageLimit`, `GET /saas_service/subscription-plans/:id`, `GET /scoring/profile`, `GET /user-preferences/:id`, `GET /workflow/:locationId/`, `POST /contacts/search/2`, `POST /contacts/search/compare`, `POST /contacts/search/count`, `POST /contacts/search/opensearch`
- **`/contacts/bulk/actions`**: micro-apps: `crm/crm-objects-settings`
  - APIs: `POST /bulk-actions/request/fetch`
### Subconta · tasks

- **`/tasks`**: micro-apps: `crm/bulk-actions`, `crm/custom-objects`, `crm/snippets`, `revex/phone-integration`
  - APIs: `GET /associations/objectKey/task`, `GET /objects/task/`, `GET /user-preferences/:id`, `POST /objects/contact/records/ids`, `POST /objects/task/records/search`
### Subconta · businesses

- **`/businesses/list`**: micro-apps: —
  - APIs: `GET /associations/objectKey/business`, `GET /businesses/search`, `GET /custom-fields/object-key/business`, `GET /lists/dynamic/:locationId/`, `GET /objects/location-settings/:locationId`, `GET msgsndr-private.storage.googleapis.com/company-logos/businessmail.com/31547379-7351-4683-bfee-0fef14ada1c1.jpg`, `GET msgsndr-private.storage.googleapis.com/company-logos/corporate.net/a22f92c8-ed3d-4871-8a42-f3e4785fc6eb.jpg`, `GET msgsndr-private.storage.googleapis.com/company-logos/example.com/56e5b881-0cbc-4ac5-8ba9-e6f362f4ca2a.jpg`, `POST /objects/business/records/search`
### Subconta · opportunities

- **`/opportunities/list`**: micro-apps: `crm/opportunities`
  - APIs: `GET /associations/objectKey/opportunity`, `GET /conversations/search`, `GET /custom-fields/conditional-fields/list`, `GET /lists/dynamic/:locationId/`, `GET /opportunities/lost-reason`, `GET /opportunities/pipelines`, `GET /opportunities/pipelines/permissions/location`, `GET /opportunities/smart-filters`, `GET /user-preferences/:id`, `POST /logs/metric`, `POST /opportunities/search`
- **`/opportunities/forecast`**: micro-apps: `crm/opportunities`
  - APIs: `GET /associations/objectKey/opportunity`, `GET /calendars/services/all`, `GET /conversations/search`, `GET /custom-fields/conditional-fields/list`, `GET /opportunities/lost-reason`, `GET /opportunities/pipelines`, `GET /opportunities/pipelines/permissions/location`, `GET /user-preferences/:id`, `POST /logs/metric`, `POST /opportunities/forecast/column`, `POST /opportunities/search`
- **`/opportunities/pipeline`**: micro-apps: `crm/opportunities`
  - APIs: `GET /custom-fields/conditional-fields/list`, `GET /locations/search`, `GET /opportunities/pipelines`, `GET /opportunities/pipelines/permissions/location`
- **`/opportunities/bulk-actions`**: micro-apps: —
  - APIs: `POST /bulk-actions/request/fetch`
### Subconta · payments

- **`/payments/invoices`**: micro-apps: `leadgen/invoices`
  - APIs: `GET /invoices/`, `GET /invoices/dashboard`, `GET /locations/:locationId`, `GET /payments/currency`, `GET /payments/integrations/provider/connected`
- **`/payments/recurring-templates`**: micro-apps: `leadgen/invoices`
  - APIs: `GET /invoices/schedule`, `GET /payments/currency`, `GET /payments/integrations/provider/connected`
- **`/payments/invoice-templates`**: micro-apps: `leadgen/invoices`
  - APIs: `GET /invoices/template`, `GET /payments/currency`, `GET /payments/integrations/provider/connected`
- **`/payments/v2/estimates`**: micro-apps: `leadgen/estimates`
  - APIs: `GET /invoices/estimate/dashboard`, `GET /invoices/estimate/layout`, `GET /invoices/estimate/list`, `GET /payments/currency`, `GET /payments/integrations/provider/connected`
- **`/payments/integrations/dashboard`**: micro-apps: `leadgen/invoices`
  - APIs: `GET /data-bridge/quickbooks/connection`, `GET /data-bridge/wave/account`, `GET /data-bridge/xero/account`, `GET /locations/:locationId`, `GET /payments/currency`, `GET /payments/integrations/provider/connected`
- **`/payments/proposals-estimates`**: micro-apps: `leadgen/proposals`
  - APIs: `GET /payments/currency`, `GET /payments/integrations/provider/connected`, `GET /proposals/document`, `GET /proposals/document/stats`
- **`/payments/proposals-estimates/templates`**: micro-apps: —
  - APIs: `GET /payments/currency`, `GET /payments/integrations/provider/connected`, `GET /proposals/templates/bulk`
- **`/payments/v2/orders`**: micro-apps: `leadgen/ghl-payments`
  - APIs: `GET /payments/currency`, `GET /payments/integrations/provider/connected`, `GET /payments/orders/`, `GET /store/country/state`
- **`/payments/v2/abandoned-checkouts`**: micro-apps: `leadgen/store-widgets`
  - APIs: `GET /ecommerce/abandoned-cart`, `GET /payments/currency`, `GET /payments/integrations/provider/connected`
- **`/payments/v2/subscriptions`**: micro-apps: `leadgen/ghl-payments`
  - APIs: `GET /payments/coupon/list`, `GET /payments/currency`, `GET /payments/integrations/provider/connected`, `GET /payments/subscriptions/`, `GET /products/`, `GET /store/country/state`, `POST /contacts/search`
- **`/payments/v2/paymentlinks`**: micro-apps: `leadgen/payment-links`
  - APIs: `GET /payment-links/`, `GET /payments/currency`, `GET /payments/integrations/provider/connected`
- **`/payments/v2/transactions`**: micro-apps: `leadgen/ghl-payments`
  - APIs: `GET /payments/currency`, `GET /payments/integrations/provider/connected`, `GET /payments/transactions/`, `GET /store/country/state`
- **`/payments/products`**: micro-apps: `leadgen/products`
  - APIs: `GET /locations/:locationId`, `GET /payments/currency`, `GET /payments/integrations/provider/connected`, `GET /products/`, `GET /products/collections`
- **`/payments/products/collections`**: micro-apps: `leadgen/store-catalog`
  - APIs: `GET /payments/currency`, `GET /payments/integrations/provider/connected`, `GET /products/collections`
- **`/payments/products/inventory`**: micro-apps: `leadgen/products`
  - APIs: `GET /payments/currency`, `GET /payments/integrations/provider/connected`, `GET /products/collections`, `GET /products/inventory`
- **`/payments/products/reviews`**: micro-apps: `leadgen/store-catalog`
  - APIs: `GET /payments/currency`, `GET /payments/integrations/provider/connected`, `GET /products/`, `GET /products/reviews`, `GET /products/reviews/count`
- **`/payments/coupons`**: micro-apps: `leadgen/ghl-payments`
  - APIs: `GET /payments/coupon/list`, `GET /payments/currency`, `GET /payments/integrations/provider/connected`, `GET /store/country/state`
- **`/payments/gift-cards`**: micro-apps: `leadgen/gift-cards`
  - APIs: `GET /payments/currency`, `GET /payments/integrations/provider/connected`, `GET /products/gift-cards/list`, `GET /products/gift-cards/product/list`
- **`/payments/settings/receipts`**: micro-apps: `leadgen/payments-widgets`
  - APIs: `GET /custom-data/emails`, `GET /emails/builder/all`, `GET /payments/currency`, `GET /payments/integrations/provider/connected`, `GET /payments/payment-settings`
- **`/payments/integrations`**: micro-apps: `leadgen/ghl-payments`
  - APIs: `GET /payments/currency`, `GET /payments/integrations/provider/connected`, `GET /store/country/state`
### Subconta · vibe

- **`/vibe`**: micro-apps: —
### Subconta · ai-agents

- **`/ai-agents/getting-started`**: micro-apps: `ai/agent-logs`, `ai/performance-ai`, `crm/ai-employees`, `marketplace/marketplace`, `revex/reselling`
- **`/ai-agents/agent-studio`**: micro-apps: `ai/agent-logs`, `ai/agent-studio`, `ai/superagents`
  - APIs: `GET /agent-logs/feedback/states`, `GET /agent-studio/agents/agents-with-folders`, `GET /agent-studio/super-agent/routines/unseen`, `GET /ai-wrapper/usage/limits/location`, `GET /ai-wrapper/usage/v2/snapshots`, `POST /ai-wrapper/plan/nudges/evaluate`, `POST /localisation-v2/ai-growth`
- **`/ai-agents/voice-ai`**: micro-apps: `ai/ai-growth`, `ai/voice-ai`, `crm/ai-employees`, `revex/phone-integration`
  - APIs: `GET /agent-logs/feedback/states`, `GET /ai-wrapper/usage/limits/location`, `GET /ai-wrapper/usage/limits/location/suggestion`, `GET /ai-wrapper/usage/v2/snapshots`, `GET /chat-widget/list`, `GET /phone-system/whatsapp/location/:locationId/phone-numbers-meta`, `GET /reselling/configuration/location/:locationId/AI_EMPLOYEE`, `GET /reselling/subscription/location/:locationId`, `GET /voice-ai/agents/agents-with-folders`, `GET /voice-ai/agents/simple`, `GET /voice-ai/configurations/AGENT_PROMPT_LIMIT`, `GET /voice-ai/consent/outbound/:locationId`, `GET /voice-ai/dashboard/agents`, `GET /voice-ai/dashboard/agents/detailed`, `GET /voice-ai/dashboard/call-logs`, `GET /voice-ai/feature-flags/APPOINTMENT_BOOKING/is-enabled`, `GET /voice-ai/folders`, `POST /ai-wrapper/plan/nudges/evaluate`, `POST /contacts/search`, `POST /localisation-v2/ai-growth`
- **`/ai-agents/conversation-ai`**: micro-apps: `crm/ai-employees`, `marketplace/marketplace`
  - APIs: `GET /agent-logs/feedback/states`, `GET /ai-employees/beta/:locationId`, `GET /ai-employees/employees/:locationId/conversation-logs`, `GET /ai-employees/employees/dashboard/search`, `GET /ai-employees/employees/global/:locationId`, `GET /ai-employees/employees/models`, `GET /ai-wrapper/usage/limits/location`, `GET /ai-wrapper/usage/limits/location/suggestion`, `GET /ai-wrapper/usage/v2/snapshots`, `GET /knowledge-base/all`, `GET /saas-billing-v2/billing-config/LOCATION/:locationId/conversation_AI`, `POST /ai-employees/employees/:locationId/fetch-dashboard-data`, `POST /ai-wrapper/plan/nudges/evaluate`, `POST /contacts/search`, `POST /knowledge-base/default`, `POST /localisation-v2/ai-growth`
- **`/ai-agents/knowledge-base`**: micro-apps: `ai/knowledge-base`
  - APIs: `GET /knowledge-base/all`, `GET /knowledge-base/gaps/counts`, `GET /saas-billing-v2/billing-config/LOCATION/:locationId/conversation_AI`, `POST /knowledge-base/default`, `POST /localisation-v2/knowledge-base`
- **`/ai-agents/agent-templates`**: micro-apps: `marketplace/marketplace`
  - APIs: `GET /marketplace/app/businesses`, `GET /marketplace/apps/templates/ai/search`, `GET /marketplace/public/categories`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/ai-agents/icons/436aea39-8b7e-4599-b02b-d2899e0e222f.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/ai-agents/icons/4af99ba0-d2f0-4767-82db-a535ffe89a39.jpg`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/ai-agents/icons/d41e67d8-95e5-41d9-bcc6-1f836099aaee.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/ai-agents/icons/d717e86b-c2b1-442e-af79-4b07420711c1.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/ai-agents/icons/fbc37061-f595-4b6b-ad7b-a3a73994f832.jpeg`
- **`/ai-agents/content-ai`**: micro-apps: —
- **`/ai-agents/agent-logs`**: micro-apps: `ai/agent-logs`
  - APIs: `POST /agent-logs/filter-values`, `POST /agent-logs/logs`
- **`/ai-agents/ai-usage`**: micro-apps: `ai/ai-growth`
  - APIs: `GET /ai-wrapper/usage/breakdown`, `GET /ai-wrapper/usage/limits/location`, `GET /ai-wrapper/usage/limits/location/suggestion`, `GET /ai-wrapper/usage/limits/location/summary`, `GET /ai-wrapper/usage/summary`, `GET /ai-wrapper/usage/time-series`, `GET /ai-wrapper/usage/transactions`, `GET /ai-wrapper/usage/v2/saas-allowance`, `GET /ai-wrapper/usage/v2/snapshots`, `POST /ai-wrapper/plan/nudges/evaluate`
### Subconta · marketing

- **`/marketing/social-planner`**: micro-apps: `leadgen/SocialPlanner`
  - APIs: `GET /custom-data/social-media`, `GET /reputation/integrations/sources`, `GET /reselling/configuration/location/:locationId/Prospecting`, `GET /saas-billing-v2/billing-config/LOCATION/:locationId/contentAI`, `GET /social-media-posting/:locationId/accounts`, `GET /social-media-posting/global-settings`, `POST /social-media-posting/statsig-events/onboarding`
- **`/marketing/emails/statistics`**: micro-apps: `leadgen/email-home-v2`
  - APIs: `GET /custom-data/emails`, `GET /custom-fields/object-key/business`, `GET /emails/stats/location/:locationId`, `GET /links/`, `GET /locations/:locationId/customFields`, `GET /reselling/configuration/location/:locationId/Prospecting`, `GET /saas-billing-v2/billing-config/LOCATION/:locationId/contentAI`
- **`/marketing/templates`**: micro-apps: —
  - APIs: `GET /reselling/configuration/location/:locationId/Prospecting`, `GET /snippets/:locationId`
- **`/marketing/countdown-timer`**: micro-apps: `leadgen/countdown-timer`
  - APIs: `GET /countdown-timer/`, `GET /reselling/configuration/location/:locationId/Prospecting`
- **`/marketing/trigger-links`**: micro-apps: —
  - APIs: `GET /links/search`, `GET /reselling/configuration/location/:locationId/Prospecting`
- **`/marketing/affiliate-manager/dashboard`**: micro-apps: —
  - APIs: `GET /affiliate-manager/:locationId/init`, `GET /payments/integrations/:locationId`, `GET /reselling/configuration/location/:locationId/Prospecting`
- **`/marketing/affiliate-manager/campaigns`**: micro-apps: —
  - APIs: `GET /affiliate-manager/:locationId/init`, `GET /payments/integrations/:locationId`, `GET /reselling/configuration/location/:locationId/Prospecting`
- **`/marketing/affiliate-manager/affiliates`**: micro-apps: —
  - APIs: `GET /affiliate-manager/:locationId/init`, `GET /payments/integrations/:locationId`, `GET /reselling/configuration/location/:locationId/Prospecting`
- **`/marketing/affiliate-manager/payouts`**: micro-apps: —
  - APIs: `GET /affiliate-manager/:locationId/init`, `GET /payments/integrations/:locationId`, `GET /reselling/configuration/location/:locationId/Prospecting`
- **`/marketing/brand-boards`**: micro-apps: `leadgen/brand-boards`
  - APIs: `GET /brand-boards/:locationId`, `GET /reselling/configuration/location/:locationId/Prospecting`
- **`/marketing/ad-manager/home`**: micro-apps: `leadgen-ad-publishing/ad-publishing`
  - APIs: `GET /ad-publishing/reselling/subscription/location/:locationId`, `GET /reselling/configuration/location/:locationId/Prospecting`
- **`/marketing/prospecting`**: micro-apps: —
  - APIs: `GET /opportunities/pipelines`, `GET /reselling/configuration/location/:locationId/Prospecting`
### Subconta · automation

- **`/automation/workflows`**: micro-apps: —
  - APIs: `GET /scoring/profile`
- **`/automation/overview`**: micro-apps: —
  - APIs: `GET /scoring/profile`
- **`/automation/workflows/settings`**: micro-apps: —
  - APIs: `GET /scoring/profile`
### Subconta · funnels-websites

- **`/funnels-websites/funnels`**: micro-apps: `leadgen/funnel-website`, `leadgen/schema-markup`
  - APIs: `GET /funnels/funnel/folder/entities`, `GET /funnels/funnel/folder/list`, `GET /funnels/funnel/list`, `GET /reselling/configuration/location/:locationId/WORDPRESS_V1`, `GET /reselling/configuration/location/:locationId/seo_search_atlas`
- **`/funnels-websites/websites`**: micro-apps: `leadgen/funnel-website`
  - APIs: `GET /funnels/funnel/folder/entities`, `GET /funnels/funnel/folder/list`, `GET /funnels/funnel/list`, `GET /reselling/configuration/location/:locationId/WORDPRESS_V1`, `GET /reselling/configuration/location/:locationId/seo_search_atlas`
- **`/funnels-websites/stores`**: micro-apps: `leadgen/funnel-website`
  - APIs: `GET /copilot/ask-ai/allowed`, `GET /funnels/funnel/folder/entities`, `GET /funnels/funnel/folder/list`, `GET /funnels/funnel/list`, `GET /payments/transactions/`, `GET /reselling/configuration/location/:locationId/WORDPRESS_V1`, `GET /reselling/configuration/location/:locationId/seo_search_atlas`, `GET /store/setup/progress`
- **`/funnels-websites/webinars`**: micro-apps: `leadgen/funnel-website`
  - APIs: `GET /funnels/funnel/folder/entities`, `GET /funnels/funnel/folder/list`, `GET /funnels/funnel/list`, `GET /reselling/configuration/location/:locationId/WORDPRESS_V1`, `GET /reselling/configuration/location/:locationId/seo_search_atlas`
### Subconta · analytics

- **`/analytics`**: micro-apps: `leadgen/funnel-website-analytics`
  - APIs: `GET /funnels/funnel/list`, `GET /locations/:locationId`, `GET /reselling/configuration/location/:locationId/WORDPRESS_V1`, `GET /reselling/configuration/location/:locationId/seo_search_atlas`, `GET /stats/count`, `GET /stats/count/split`, `GET /stats/device/split`, `GET /stats/graph/data`, `GET /stats/optin/conversion-rate`, `GET /stats/top/user-data`, `GET /stats/video/stats`
### Subconta · blogs

- **`/blogs`**: micro-apps: `leadgen/blogs`
  - APIs: `GET /blogs/posts/metrics`, `GET /blogs/site/migration-status`, `GET /brand-boards/:locationId/default`, `GET /brand-boards/custom-colors/:locationId/all`, `GET /funnels/funnel/blog/list/`, `GET /reselling/configuration/location/:locationId/WORDPRESS_V1`, `GET /reselling/configuration/location/:locationId/seo_search_atlas`, `GET /saas-billing-v2/billing-config/LOCATION/:locationId/contentAI`
### Subconta · wordpress

- **`/wordpress`**: micro-apps: `leadgen/funnel-website-domain-connect`, `revex/wordpress`
  - APIs: `GET /reselling/configuration/location/:locationId/WORDPRESS_V1`, `GET /reselling/configuration/location/:locationId/seo_search_atlas`, `GET /reselling/product`, `GET /reselling/subscription/company/:id/product/WORDPRESS_V1/locations`, `GET /wordpress/:locationId`, `GET /wordpress/job-queue/:locationId/updates/job-in-progress`, `GET /wordpress/multisite/:locationId/:id/agency-locations-list/active-sites`, `GET /wordpress/multisite/:locationId/clone-in-progress`, `GET /wordpress/multisite/:locationId/get-location-sites`, `GET /wordpress/payments/location/:locationId/purchase/config`, `GET /wordpress/reselling/:locationId/seo/available`, `POST /wordpress/multisite/:locationId/get-all`
### Subconta · funnels-websites

- **`/funnels-websites/client-portal/dashboard`**: micro-apps: `revex/clientportal-builder`
  - APIs: `GET /clientclub/:locationId/users/search-users`, `GET /clientclub/branded-app/:locationId/details`, `GET /clientclub/portal-settings/:locationId`, `GET /reselling/configuration/location/:locationId/WORDPRESS_V1`, `GET /reselling/configuration/location/:locationId/seo_search_atlas`, `POST /contacts/search`
### Subconta · form-builder

- **`/form-builder/main`**: micro-apps: `leadgen/form-survey`
  - APIs: `GET /forms/`, `GET /forms/:id`, `GET /reselling/configuration/location/:locationId/WORDPRESS_V1`, `GET /reselling/configuration/location/:locationId/seo_search_atlas`
### Subconta · survey-builder

- **`/survey-builder/main`**: micro-apps: `leadgen/form-survey`
  - APIs: `GET /reselling/configuration/location/:locationId/WORDPRESS_V1`, `GET /reselling/configuration/location/:locationId/seo_search_atlas`, `GET /surveys/`, `POST /templates/list`
### Subconta · quiz-builder

- **`/quiz-builder/main`**: micro-apps: `leadgen/form-survey`
  - APIs: `GET /forms/`, `GET /reselling/configuration/location/:locationId/WORDPRESS_V1`, `GET /reselling/configuration/location/:locationId/seo_search_atlas`, `GET storage.googleapis.com/msgsndr/:id/media/68026538efa08f9786dd82e7.png`, `GET storage.googleapis.com/msgsndr/:id/media/68026538fe965c261b73caea.png`, `GET storage.googleapis.com/msgsndr/:id/media/68f8cbb8ad50b28a3b50735f.png`, `POST /templates/list`
### Subconta · funnels-websites

- **`/funnels-websites/chat-widget`**: micro-apps: `leadgen/chat-widget`
  - APIs: `GET /chat-widget/list`, `GET /integrations/facebook/:locationId/connection`, `GET /phone-system/whatsapp/location/:locationId/phone-numbers`, `GET /reselling/configuration/location/:locationId/WORDPRESS_V1`, `GET /reselling/configuration/location/:locationId/seo_search_atlas`, `GET /voice-ai/agents/chat-widget-agents`
### Subconta · qr-codes

- **`/qr-codes`**: micro-apps: `leadgen/qr-code-list`
  - APIs: `GET /qr-code/`, `GET /qr-code/bulk-upload/folders/jobs`, `GET /qr-code/folder/system`, `GET /reselling/configuration/location/:locationId/WORDPRESS_V1`, `GET /reselling/configuration/location/:locationId/seo_search_atlas`
### Subconta · memberships

- **`/memberships/client-portal/dashboard`**: micro-apps: —
  - APIs: `GET /clientclub/:locationId/users/search-users`, `GET /clientclub/branded-app/:locationId/details`, `GET /clientclub/portal-settings/:locationId`, `POST /contacts/search`
- **`/memberships/client-portal/branded-app`**: micro-apps: `revex/clientportal-builder`
  - APIs: `GET /clientclub/branded-app/:locationId/details`, `GET /clientclub/portal-settings/:locationId`, `GET /locations/:locationId`
- **`/memberships/courses/dashboard-v2`**: micro-apps: `revex/memberships`
  - APIs: `GET /clientclub/portal-settings/:locationId`, `GET /membership/locations/:locationId/settings/domain/`, `GET /payments/integrations/provider/default/public`, `GET /product-onboarding/product-areas/courses/state`
- **`/memberships/courses/products-v2`**: micro-apps: `revex/memberships`
  - APIs: `GET /clientclub/portal-settings/:locationId`, `GET /membership/locations/:locationId/products`, `GET /membership/locations/:locationId/settings/domain/`, `GET /payments/integrations/provider/default/public`, `GET /product-onboarding/product-areas/courses/state`
- **`/memberships/courses/offers-list-v2`**: micro-apps: `revex/memberships`
  - APIs: `GET /clientclub/portal-settings/:locationId`, `GET /membership/locations/:locationId/offers`, `GET /membership/locations/:locationId/products`, `GET /membership/locations/:locationId/settings/domain/`, `GET /payments/integrations/provider/default/public`, `GET /product-onboarding/product-areas/courses/state`
- **`/memberships/courses/analytics-v2`**: micro-apps: `revex/membership-analytics`
  - APIs: `GET /clientclub/portal-settings/:locationId`, `GET /courses/locations/:locationId/products`, `GET /membership/locations/:locationId/settings/domain/`, `POST /courses/analytics/locations/:locationId/course-progress/funnel`, `POST /courses/analytics/locations/:locationId/course-progress/members`, `POST /courses/analytics/locations/:locationId/course-progress/summary`
- **`/memberships/communities/community-groups`**: micro-apps: `revex/communities-builder`
  - APIs: `GET /clientclub/:locationId/users/agency-user-contacts`, `GET /clientclub/portal-settings/:locationId`, `GET /communities/:locationId/groups`, `GET /communities/locations/:locationId`, `GET /reselling/configuration/location/:locationId/CP_BRANDED_APP_49`, `GET /reselling/subscription/location/:locationId`
- **`/memberships/certificates/create-certificates`**: micro-apps: `revex/certificates-builder`
  - APIs: `GET /certificates/locations/:locationId/templates`, `GET /clientclub/portal-settings/:locationId`, `GET /locations/search`
- **`/memberships/gokollab/activation`**: micro-apps: `revex/gokollab-builder`
  - APIs: `GET /clientclub/:locationId/users/agency-user-contacts`, `GET /clientclub/portal-settings/:locationId`, `GET /communities/:locationId/groups`, `GET /gokollab/:id/listings/builder/:locationId`, `GET /membership/locations/:locationId/products`
### Subconta · media-storage

- **`/media-storage`**: micro-apps: —
### Subconta · reputation

- **`/reputation/overview`**: micro-apps: `crm/content-ai`, `leadgen/media-center`, `revex/reputation`, `revex/yext`
  - APIs: `GET /feature-permissions/rbac/locations/:locationId/permissions`, `GET /integrations/facebook/:locationId/connection`, `GET /integrations/google/connections`, `GET /reputation/aggregations/total`, `GET /reputation/aggregations/trend`, `GET /reputation/configs`, `GET /reputation/integrations/gmb/status`, `GET /reputation/integrations/linked-pages`, `GET /reputation/integrations/sources`, `GET /reputation/locations/:locationId/suggestions`, `GET /reputation/onboarding/:locationId`, `GET /reputation/settings/ai-reviews/:locationId`, `GET /yext/available/:locationId`, `GET /yext/lc-listings/:locationId/entities`
- **`/reputation/requests`**: micro-apps: `revex/reputation`
  - APIs: `GET /reputation/review-request`
- **`/reputation/reviews`**: micro-apps: `revex/reputation`
  - APIs: `GET /feature-permissions/rbac/locations/:locationId/permissions`, `GET /reputation/integrations/gmb/status`, `GET /reputation/integrations/linked-pages`, `GET /reputation/integrations/platforms-and-manual-integrations`, `GET /reputation/reviews`, `GET /reputation/reviews/distribution`, `GET /reputation/settings/ai-reviews/:locationId`, `GET /reputation/settings/reviews/:locationId`, `POST /reputation/ai-reviews/summary/default/generate`
- **`/reputation/video-testimonials`**: micro-apps: `revex/reputation`
  - APIs: `GET /reputation/onboarding/:locationId`, `GET /reputation/video-collectors`, `GET /reputation/video-reviews`
- **`/reputation/widget`**: micro-apps: `revex/reputation`
  - APIs: `GET /reputation/integrations/linked-pages`, `GET /reputation/settings/review-request/white-label-domain`, `GET /reputation/video-collectors`, `GET /reputation/widgets/configs/all`, `GET /reputation/widgets/configs/templates/all`, `POST /reputation/widgets/configs`
- **`/reputation/listing`**: micro-apps: `revex/yext`
  - APIs: `GET /yext/add-ons/:locationId/entities/upgradable-status`, `GET /yext/available/:locationId`, `GET /yext/lc-listings/:locationId/entities`, `GET /yext/lc-listings/:locationId/entities/conflicted`, `GET /yext/profile-completion/:locationId`, `GET /yext/reselling/location/:locationId/subscriptions`
- **`/reputation/gbp`**: micro-apps: `revex/yext`
  - APIs: `GET /yext/gbp/linked-pages`
- **`/reputation/settings`**: micro-apps: `revex/reputation`
  - APIs: `GET /feature-permissions/rbac/locations/:locationId/permissions`, `GET /integrations/facebook/:locationId/connection`, `GET /integrations/google/connections`, `GET /phone-system/whatsapp/location/:locationId/is-configured`, `GET /phone-system/whatsapp/location/:locationId/reselling/subscription`, `GET /reputation/ai-agents`, `GET /reputation/ai-agents/templates`, `GET /reputation/ai-reviews/drip-campaign`, `GET /reputation/ai-reviews/drip-campaign/connection-status`, `GET /reputation/integrations/linked-pages`, `GET /reputation/integrations/sources`, `GET /reputation/locations/:locationId/suggestions`, `GET /reputation/settings/ai-reviews/:locationId`, `GET /reselling/configuration/location/:locationId/AI_EMPLOYEE`, `GET /reselling/subscription/location/:locationId`, `POST /reputation/ai-agents/legacy`
### Subconta · reporting

- **`/reporting/reports`**: micro-apps: `automation-reporting/reporting`
  - APIs: `GET /reporting/reports/`
- **`/reporting/google-ads`**: micro-apps: —
  - APIs: `GET /cdp/reports/:locationId/revenue`, `PUT /locations/:locationId`
- **`/reporting/facebook-ads`**: micro-apps: —
  - APIs: `GET /cdp/reports/:locationId/revenue`, `GET /integrations/facebook/:locationId/connection`, `GET /reporting/integrations/facebook/ad-account`, `PUT /locations/:locationId`
- **`/reporting/attribution`**: micro-apps: `automation-reporting/reporting`
  - APIs: `GET /cdp/reports/:locationId/events`, `GET /cdp/reports/:locationId/total-events`, `GET /contacts/attribution/aggregate`, `GET /opportunities/attribution/revenueOpp`
- **`/reporting/call`**: micro-apps: `automation-reporting/reporting`
  - APIs: `GET /campaigns/`, `GET /phone-system/call-dispositions`, `GET /reporting/calls/filters-distinct-values/:locationId`, `GET /reporting/calls/phone-numbers-pools/:locationId`, `GET /workflow/:locationId/list`, `POST /reporting/calls/get-all-phone-calls-new`, `POST /reporting/calls/get-call-status-summary`, `POST /reporting/calls/get-inbound-call-sources`
- **`/reporting/agent`**: micro-apps: —
  - APIs: `GET /opportunities/pipelines`, `GET /opportunities/pipelines/permissions/location`, `POST /conversations-reporting/emails/aggregate/agent`, `POST /conversations-reporting/messages/aggregate/agent`, `POST /reporting/calls/get-call-metrics`, `POST /reporting/opportunities/conversion-stats`, `POST /reporting/opportunities/leaderboard-stats`, `POST /reporting/opportunities/opportunity-stats`, `POST /reporting/opportunities/sales-velocity`
- **`/reporting/appointment`**: micro-apps: `automation-reporting/reporting`
  - APIs: `GET /calendars/`, `POST /reporting/dashboards/automations/appointments`
- **`/reporting/local-marketing-audit`**: micro-apps: —
### Subconta · integration

- **`/integration`**: micro-apps: `marketplace/marketplace`, `revex/reselling`
  - APIs: `GET /marketplace/app/businesses`, `GET /marketplace/app/installation/check`, `GET /marketplace/public/categories`, `GET /marketplace/public/company/names`, `GET /marketplace/whitelabel/:id`, `GET /oauth/public/integration`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/074da08d-5b4d-41c8-957a-d0e2cd40dd03.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/116cf55f-de36-4815-9e30-f30ae61cbb1a.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/12ba95d1-712c-4039-a953-dae740648e3d.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/22696929-7aad-4d67-9e91-71a185b39522.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/2f0a981f-7165-4b95-a250-596af4d57984.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/39cb9c7b-f268-4fa5-bdb3-ffa25a1eca96.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/3c3ae311-1bdc-449b-9d3f-5076d18c60b5.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/4105560b-6943-44cd-b943-dea6f288c112.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/4628b9c9-1bf0-4e50-9163-6bf36ef1fb73.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/5c423d1b-2407-487a-a605-b98985ff63fd.jpg`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/5cdf0e7d-8b66-4ce8-bc63-4cbc30e7223f.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/6245c407-c80d-4fc0-aabb-81b7a16f3e34.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/72152f9a-ee38-4a0e-89d4-50a4daca9885.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/74dfbb76-024c-4d39-aa4c-5724b200d983.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/9346654d-99ab-4862-995c-9773539948af.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/addcd054-e7ce-40fe-a57d-35bb52e9cb27.jpg`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/af0c4c86-dc1d-42cc-a38e-8324752e28cd.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/aff729ce-f319-439e-b240-c4ed79e2e1cb.png`, `GET msgsndr-private.storage.googleapis.com/marketplace/apps/:id/bd81966e-13b6-40d5-8c0b-1707147f8435.jpg` … (+3)
### Subconta · settings

- **`/settings/company`**: micro-apps: —
- **`/settings/profile`**: micro-apps: `crm/users`
  - APIs: `GET /calendars/`, `GET /locations/:locationId/customValues`, `GET /users/:id`
- **`/settings/company-billing/billing`**: micro-apps: `revex/location-billing`
- **`/settings/users`**: micro-apps: `revex/location-billing`
### Subconta · crm-settings

- **`/crm-settings`**: micro-apps: `crm/opportunities`
### Subconta · settings

- **`/settings/smtp_service`**: micro-apps: —
- **`/settings/phone_system`**: micro-apps: `revex/phone-integration`
  - APIs: `GET /appengine/twilio/subaccount/:locationId`, `GET /locations/:locationId/:id/SMS`
- **`/settings/whatsapp`**: micro-apps: `revex/phone-integration`
  - APIs: `GET /phone-system/whatsapp/company/:id/reselling/product`, `GET /reselling/configuration/location/:locationId/WHATSAPP_V1`
- **`/settings/objects`**: micro-apps: `crm/custom-objects`
  - APIs: `GET /objects/`, `POST /templates/list`
- **`/settings/fields`**: micro-apps: `crm/crm-objects-settings`
- **`/settings/custom_values`**: micro-apps: `crm/crm-objects-settings`
  - APIs: `GET /locations/:locationId/customValues/search`
- **`/settings/import-data`**: micro-apps: `crm/bulk-actions`
  - APIs: `GET /integrations/public/:id`, `GET /oauth/installedLocations`, `GET /workflows-marketplace/integration-apps`, `POST /bulk-actions/import/external/fetch`
- **`/settings/scoring`**: micro-apps: `crm/conversations-utilities`
  - APIs: `GET /funnels/funnel/list`, `GET /links/`, `GET /locations/:locationId/tags`, `GET /scoring/profile`
- **`/settings/domain`**: micro-apps: `leadgen/domain-reselling`
  - APIs: `GET /domains/hub`, `GET /domains/hub/migration-required-domain`, `GET /saas-billing-v2/billing-config/COMPANY/:id/domainPurchase`, `GET /saas-billing-v2/billing-config/LOCATION/:locationId/domainPurchase`
- **`/settings/external-tracking`**: micro-apps: `leadgen/external-tracking`
  - APIs: `GET /external-tracking/location/:locationId`, `GET /forms/submissions`, `POST /external-tracking/`
- **`/settings/lc-integrations`**: micro-apps: `leadgen/store-widgets`, `marketplace/integrations`
  - APIs: `GET /ad-publishing/openai/marketplace-connection`, `GET /integrations/clio/connectionStatus`, `GET /integrations/facebook/:locationId/connection`, `GET /integrations/facebook/:locationId/pages`, `GET /integrations/gmb/linkedPages`, `GET /integrations/google/:locationId/marketplace-connections`, `GET /integrations/google/connections`, `GET /integrations/linkedIn/:locationId/adAccounts`, `GET /integrations/linkedIn/:locationId/connection`, `GET /integrations/linkedIn/:locationId/marketplace-connection`, `GET /integrations/tiktok`, `GET /integrations/tiktok/:locationId/marketplace-connection`, `GET /oauth/integration`, `GET /oauth/public/integration`, `GET /phone-system/whatsapp/location/:locationId/is-configured`, `GET /social-media-posting/:locationId/accounts`, `GET /store/meta-marketplace`, `GET /workflows-marketplace/integration-apps`, `GET /workflows-marketplace/integration/slack/integrations`, `GET /workflows-marketplace/integration/slack/marketplace-connection`, `POST /integrations/facebook/:locationId/sync-form-status`, `POST /marketplace/core/apps/connection-status/bulk`
- **`/settings/private-integrations`**: micro-apps: `marketplace/marketplace`
  - APIs: `GET /marketplace/private-integration/location/:locationId`, `GET /store/shopify/:locationId`, `GET /store/woocommerce/:locationId`
- **`/settings/tags`**: micro-apps: `crm/crm-objects-settings`
  - APIs: `GET /locations/:locationId/tags/categories`, `GET /locations/:locationId/tags/search`
- **`/settings/labs`**: micro-apps: `crm/labs`
  - APIs: `GET /labs/features/location/:locationId`
- **`/settings/audit/logs`**: micro-apps: `crm/users`
  - APIs: `GET /audit/search/v2`, `GET /users/search`
### Agência · ai-suite

- **`A:/ai-suite`**: micro-apps: `ai/ai-growth`
  - APIs: `GET /ai-wrapper/ai-opportunities/access`, `GET /ai-wrapper/plan/company/seats`, `GET /ai-wrapper/plan/company/soai2026-conversion-review/summary`, `GET /ai-wrapper/usage/limits/company/alerts`, `GET /ai-wrapper/usage/limits/company/defaults`, `GET /ai-wrapper/usage/limits/company/free-ai`, `GET /ai-wrapper/usage/limits/company/notifications`, `GET /ai-wrapper/usage/limits/company/plans-and-limits`, `GET /ai-wrapper/usage/limits/company/requests`, `GET /ai-wrapper/usage/limits/company/suggestions`, `GET /internal-tools/compliance/hipaa-outreach/:id/:id`, `GET /labs/feature-flags/company/:id`, `GET /saas-billing-v2/billing-config/COMPANY/:id`, `GET /saas-billing-v2/billing-config/COMPANY/:id/conversation_AI`, `GET cdn.msgsndr.com/sidebar-v2/agency-account-snapshot.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-dashboard.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-ideas.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-marketplace.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-partners.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-saas-edu.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-user.svg`, `GET cdn.msgsndr.com/sidebar-v2/icon-reselling.svg`, `GET cdn.msgsndr.com/sidebar-v2/phone.svg`, `GET cdn.msgsndr.com/sidebar-v2/store.svg`, `POST /ai-wrapper/plan/nudges/evaluate`
### Agência · agency_launchpad

- **`A:/agency_launchpad`**: micro-apps: `ai/ai-growth`
  - APIs: `GET /ai-wrapper/ai-opportunities/access`, `GET /internal-tools/billing/company/:id/plan`, `GET /internal-tools/compliance/hipaa-outreach/:id/:id`, `GET /labs/feature-flags/company/:id`, `GET /launchpad/feedbacks/eligibility`, `GET /launchpad/segments/agency/details`, `GET /launchpad/segments/companies/:id`, `GET /onboarding/info/widget-info`, `GET cdn.msgsndr.com/sidebar-v2/agency-account-snapshot.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-dashboard.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-ideas.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-marketplace.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-partners.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-saas-edu.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-user.svg`, `GET cdn.msgsndr.com/sidebar-v2/icon-reselling.svg`, `GET cdn.msgsndr.com/sidebar-v2/phone.svg`, `GET cdn.msgsndr.com/sidebar-v2/store.svg`, `GET storage.googleapis.com/msgsndr/:id/media/6788ec7fd067d6a84203da4a.png`
### Agência · agency_dashboard

- **`A:/agency_dashboard`**: micro-apps: `leadgen/Onboarding`, `revex/agency-dashboard`
  - APIs: `GET /ai-wrapper/ai-opportunities/access`, `GET /companies/:id`, `GET /internal-tools/billing/company/:id/plan`, `GET /internal-tools/compliance/hipaa-outreach/:id/:id`, `GET /labs/feature-flags/company/:id`, `GET /localization/da/`, `GET /localization/de/`, `GET /localization/es/`, `GET /localization/fi/`, `GET /localization/fr-CA/`, `GET /localization/fr-FR/`, `GET /localization/it/`, `GET /localization/nl/`, `GET /localization/no/`, `GET /localization/pt-BR/`, `GET /localization/pt-PT/`, `GET /localization/sv/`, `GET /onboarding/info/widget-info`, `GET cdn.msgsndr.com/sidebar-v2/agency-account-snapshot.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-dashboard.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-ideas.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-marketplace.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-partners.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-saas-edu.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-user.svg` … (+4)
### Agência · saas_dashboard

- **`A:/saas_dashboard`**: micro-apps: `revex/saas`
  - APIs: `DELETE /saas-api/plan-category/company/:id`, `GET /internal-tools/compliance/hipaa-outreach/:id/:id`, `GET /labs/feature-flags/company/:id`, `GET /saas-api/onboarding/:id`, `GET /saas-api/saas-config/call-experiment-banner/:id`, `GET /saas-api/subscription-plans/:id`, `GET cdn.msgsndr.com/sidebar-v2/agency-account-snapshot.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-dashboard.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-ideas.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-marketplace.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-partners.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-saas-edu.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-user.svg`, `GET cdn.msgsndr.com/sidebar-v2/icon-reselling.svg`, `GET cdn.msgsndr.com/sidebar-v2/phone.svg`, `GET cdn.msgsndr.com/sidebar-v2/store.svg`, `POST /locations/saas/v2/search`
### Agência · prospecting

- **`A:/prospecting`**: micro-apps: —
  - APIs: `GET /companies/:id`, `GET /internal-tools/billing/company/:id/plan`, `GET /internal-tools/compliance/hipaa-outreach/:id/:id`, `GET /labs/feature-flags/company/:id`, `GET /localization/da/`, `GET /localization/de/`, `GET /localization/es/`, `GET /localization/fi/`, `GET /localization/fr-CA/`, `GET /localization/fr-FR/`, `GET /localization/it/`, `GET /localization/nl/`, `GET /localization/no/`, `GET /localization/pt-BR/`, `GET /localization/pt-PT/`, `GET /localization/sv/`, `GET /onboarding/info/widget-info`, `GET cdn.msgsndr.com/sidebar-v2/agency-account-snapshot.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-dashboard.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-ideas.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-marketplace.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-partners.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-saas-edu.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-user.svg`, `GET cdn.msgsndr.com/sidebar-v2/icon-reselling.svg` … (+2)
### Agência · sub-accounts

- **`A:/sub-accounts`**: micro-apps: —
  - APIs: `GET /internal-tools/compliance/hipaa-outreach/:id/:id`, `GET /labs/feature-flags/company/:id`, `GET cdn.msgsndr.com/sidebar-v2/agency-account-snapshot.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-dashboard.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-ideas.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-marketplace.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-partners.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-saas-edu.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-user.svg`, `GET cdn.msgsndr.com/sidebar-v2/icon-reselling.svg`, `GET cdn.msgsndr.com/sidebar-v2/phone.svg`, `GET cdn.msgsndr.com/sidebar-v2/store.svg`
### Agência · snapshots

- **`A:/snapshots`**: micro-apps: `revex/snapshots`
  - APIs: `GET /companies/:id`, `GET /internal-tools/billing/company/:id/plan`, `GET /internal-tools/compliance/hipaa-outreach/:id/:id`, `GET /labs/feature-flags/company/:id`, `GET /localization/da/`, `GET /localization/de/`, `GET /localization/es/`, `GET /localization/fi/`, `GET /localization/fr-CA/`, `GET /localization/fr-FR/`, `GET /localization/it/`, `GET /localization/nl/`, `GET /localization/no/`, `GET /localization/pt-BR/`, `GET /localization/pt-PT/`, `GET /localization/sv/`, `GET /onboarding/info/widget-info`, `GET /snapshots/v2/:id`, `GET cdn.msgsndr.com/sidebar-v2/agency-account-snapshot.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-dashboard.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-ideas.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-marketplace.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-partners.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-saas-edu.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-user.svg` … (+3)
### Agência · reselling

- **`A:/reselling`**: micro-apps: `revex/reselling`
  - APIs: `GET /companies/:id`, `GET /internal-tools/billing/company/:id/plan`, `GET /internal-tools/compliance/hipaa-outreach/:id/:id`, `GET /labs/feature-flags/company/:id`, `GET /localization/da/`, `GET /localization/de/`, `GET /localization/es/`, `GET /localization/fi/`, `GET /localization/fr-CA/`, `GET /localization/fr-FR/`, `GET /localization/it/`, `GET /localization/nl/`, `GET /localization/no/`, `GET /localization/pt-BR/`, `GET /localization/pt-PT/`, `GET /localization/sv/`, `GET /locations/elasticsearch/rebilling-stats`, `GET /onboarding/info/widget-info`, `GET /reselling/subscription/company/:id`, `GET /saas-billing-v2/rebillingReselling/company/fetchProducts`, `GET /wordpress/payments/company/:id/config`, `GET /wordpress/payments/company/:id/plans/bundle`, `GET cdn.msgsndr.com/sidebar-v2/agency-account-snapshot.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-dashboard.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-ideas.svg` … (+8)
### Agência · marketplace

- **`A:/marketplace`**: micro-apps: `revex/internal-tools`
  - APIs: `GET /companies/:id`, `GET /internal-tools/billing/company/:id/addons`, `GET /internal-tools/billing/company/:id/plan`, `GET /internal-tools/compliance/hipaa-outreach/:id/:id`, `GET /labs/feature-flags/company/:id`, `GET /localization/da/`, `GET /localization/de/`, `GET /localization/es/`, `GET /localization/fi/`, `GET /localization/fr-CA/`, `GET /localization/fr-FR/`, `GET /localization/it/`, `GET /localization/nl/`, `GET /localization/no/`, `GET /localization/pt-BR/`, `GET /localization/pt-PT/`, `GET /localization/sv/`, `GET /onboarding/info/widget-info`, `GET cdn.msgsndr.com/sidebar-v2/agency-account-snapshot.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-dashboard.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-ideas.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-marketplace.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-partners.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-saas-edu.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-user.svg` … (+3)
### Agência · affiliate_portal

- **`A:/affiliate_portal/terms-and-conditions`**: micro-apps: `revex/affiliate-portal`
  - APIs: `GET /affiliate-portal/communications/:id`, `GET /affiliate-portal/configurable/affiliateBanners`, `GET /affiliate-portal/dashboard/:id`, `GET /companies/:id`, `GET /internal-tools/billing/company/:id/plan`, `GET /internal-tools/compliance/hipaa-outreach/:id/:id`, `GET /labs/feature-flags/company/:id`, `GET /localization/da/`, `GET /localization/de/`, `GET /localization/es/`, `GET /localization/fi/`, `GET /localization/fr-CA/`, `GET /localization/fr-FR/`, `GET /localization/it/`, `GET /localization/nl/`, `GET /localization/no/`, `GET /localization/pt-BR/`, `GET /localization/pt-PT/`, `GET /localization/sv/`, `GET /onboarding/info/widget-info`, `GET cdn.msgsndr.com/sidebar-v2/agency-account-snapshot.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-dashboard.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-ideas.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-marketplace.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-partners.svg` … (+5)
### Agência · template-library-admin

- **`A:/template-library-admin`**: micro-apps: `leadgen/template-library`
  - APIs: `GET /labs/feature-flags/company/:id`, `GET /templates/template-search/facets`, `GET /templates/template-search/recent`, `GET /templates/template-search/suggestions`, `GET /templates/template-search/trending`, `GET /templates/template-settings/:id`, `POST /templates/library/activity`, `POST /templates/list`
### Agência · partners

- **`A:/partners`**: micro-apps: —
  - APIs: `GET /companies/:id`, `GET /internal-tools/billing/company/:id/plan`, `GET /internal-tools/compliance/hipaa-outreach/:id/:id`, `GET /labs/feature-flags/company/:id`, `GET /localization/da/`, `GET /localization/de/`, `GET /localization/es/`, `GET /localization/fi/`, `GET /localization/fr-CA/`, `GET /localization/fr-FR/`, `GET /localization/it/`, `GET /localization/nl/`, `GET /localization/no/`, `GET /localization/pt-BR/`, `GET /localization/pt-PT/`, `GET /localization/sv/`, `GET /onboarding/info/widget-info`, `GET cdn.msgsndr.com/sidebar-v2/agency-account-snapshot.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-dashboard.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-ideas.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-marketplace.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-partners.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-saas-edu.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-user.svg`, `GET cdn.msgsndr.com/sidebar-v2/icon-reselling.svg` … (+2)
### Agência · university

- **`A:/university`**: micro-apps: `revex/communities-builder`
  - APIs: `GET /companies/:id`, `GET /internal-tools/billing/company/:id/plan`, `GET /internal-tools/compliance/hipaa-outreach/:id/:id`, `GET /labs/feature-flags/company/:id`, `GET /localization/da/`, `GET /localization/de/`, `GET /localization/es/`, `GET /localization/fi/`, `GET /localization/fr-CA/`, `GET /localization/fr-FR/`, `GET /localization/it/`, `GET /localization/nl/`, `GET /localization/no/`, `GET /localization/pt-BR/`, `GET /localization/pt-PT/`, `GET /localization/sv/`, `GET /onboarding/info/widget-info`, `GET cdn.msgsndr.com/sidebar-v2/agency-account-snapshot.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-dashboard.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-ideas.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-marketplace.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-partners.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-saas-edu.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-user.svg`, `GET cdn.msgsndr.com/sidebar-v2/icon-reselling.svg` … (+2)
### Agência · ideas

- **`A:/ideas`**: micro-apps: —
  - APIs: `GET /oauth/2/login/canny`
### Agência · mobile-app-customiser

- **`A:/mobile-app-customiser`**: micro-apps: —
  - APIs: `GET /internal-tools/compliance/hipaa-outreach/:id/:id`, `GET /labs/feature-flags/company/:id`, `GET cdn.msgsndr.com/sidebar-v2/agency-account-snapshot.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-dashboard.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-ideas.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-marketplace.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-partners.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-saas-edu.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-user.svg`, `GET cdn.msgsndr.com/sidebar-v2/icon-reselling.svg`, `GET cdn.msgsndr.com/sidebar-v2/phone.svg`, `GET cdn.msgsndr.com/sidebar-v2/store.svg`
### Agência · desktop-whitelabel-app

- **`A:/desktop-whitelabel-app`**: micro-apps: `revex/desktop-customizer`
  - APIs: `GET /desktop-app/branded-app/:id/details`, `GET /internal-tools/compliance/hipaa-outreach/:id/:id`, `GET /labs/feature-flags/company/:id`, `GET cdn.msgsndr.com/sidebar-v2/agency-account-snapshot.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-dashboard.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-ideas.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-marketplace.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-partners.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-saas-edu.svg`, `GET cdn.msgsndr.com/sidebar-v2/agency-user.svg`, `GET cdn.msgsndr.com/sidebar-v2/icon-reselling.svg`, `GET cdn.msgsndr.com/sidebar-v2/phone.svg`, `GET cdn.msgsndr.com/sidebar-v2/store.svg`
### Agência · settings

- **`A:/settings/profile`**: micro-apps: —
  - APIs: `GET /internal-tools/compliance/hipaa-outreach/:id/:id`, `GET /labs/feature-flags/company/:id`, `GET /users/:id`


## 3. Interface de cada tela

Capturado em 141 telas (o `/ideas` foi pulado porque redireciona para fora do app). 10 telas renderizam dentro de iframe de outra origem, e o conteúdo desses iframes também foi lido. Os controles comuns a quase todas as telas foram removidos (18 itens, como menu, busca e avatar). Isso serve de referência de escopo funcional por tela, não de texto para copiar.

### Subconta · dashboard

- **`/dashboard`**
  - ações: Join video call with success team, Dashboard, New, Last 30 days, Dashboard summary, Edit dashboard, Quick filters, Go to manual actions
  - campos: Workflow selection, Campaign selection, User selection, Search Numbers
### Subconta · launchpad

- **`/launchpad`**
  - abas: Foundational setup, Marketing & lead generation, Sales & conversations, Website & monetization, Ecommerce
  - títulos: Setup Guide, Fast-track your setup, Congratulations! Your Exclusive Implementation Call Awaits
  - ações: Join the success call, Import Existing Contacts, Join Video Call with Success Team
  - campos: Search Numbers
### Subconta · ask-ai

- **`/ask-ai`**
  - ações: New chat, Search, Templates, Scheduled, Customize, Computer, Projects NEW, Recents, Store Setup Progress and Next Steps, LM Account, Set spending limit
  - campos: Ask anything..., Search Numbers
### Subconta · conversations

- **`/conversations/conversations`**
  - títulos: Team inbox
  - ações: Unread, All, Recent, Starred, View All Team inbox Conversations
  - campos: Search Numbers
- **`/conversations/manual_actions`**
  - colunas: Contacts, Workflow, Assigned To, Type, Status, Date Added
  - ações: Let's Start
  - campos: Search Numbers
- **`/conversations/templates`**
  - abas: All Snippets, Folders
  - colunas: Name, Body, Folder, Type, Date Updated
  - ações: New Folder, New Snippet
  - campos: Search, Search Numbers
- **`/conversations/trigger-links`**
  - abas: Link, Analyze
  - colunas: Name, Link URL, Link Key, Date Added
  - ações: Add Link, Prev
  - campos: Search, Search Numbers
- **`/conversations/analytics`**
  - abas: SLA performance
  - títulos: SLA overview
  - ações: Turn on SLA settings
  - campos: Search Numbers
- **`/conversations/settings`**
  - abas: SLA Settings
  - ações: Set SLA
  - campos: Search Numbers
### Subconta · calendars

- **`/calendars/view`**
  - colunas: 15 Sun 16 Mon 17 Tue 18 Wed 19 Thu 20 Fri 21 Sat, 15 Sun, 16 Mon, 17 Tue, 18 Wed, 19 Thu, 20 Fri, 21 Sat
  - ações: Today, Nov 15 – 21, 2026, Manage view, New, Clear all, Users 1, Luiz Gustavo Oliveira Marques, Calendars, Groups
  - campos: All, Appointments, Blocked slots, Search users, calendars, or groups, Search Numbers
- **`/calendars/appointments`**
  - colunas: Title, Contact, Status, Appointment time, Calendar, Appointment owner
  - ações: New appointment, See all appointments
  - campos: Search by title
### Subconta · settings

- **`/settings/calendars`** (iframe: calendar-app.leadconnectorhq.com)
  - colunas: Calendar name, Group, Duration, Type, Status, Date updated, Actions
  - ações: Calendars, Service calendars (v1), Preferences, My availability, All calendars (01), Not grouped 01, Business Services 0, New group, New calendar, Id: rv9x1fD58WWheHFBqdvC
  - campos: Search Numbers, Calendar/group name
### Subconta · contacts

- **`/contacts/smart_list/All`**
  - abas: All
  - colunas: Contact name, Phone, Email, Business name, Created (-03), Last activity (-03), Tags
  - ações: What's new Contact updates, Add, Import, Filters, Export, Trigger automation, Send email, Add tags, Delete, More, First, Prev, Last
  - campos: Search contacts, Page Size, Search Numbers
- **`/contacts/bulk/actions`**
### Subconta · tasks

- **`/tasks`**
  - colunas: Status, Title, Description, Associated Contacts, Assignee, Due Date ( -03 ), Actions
  - ações: Add Task, Filters, Mark as done, Mark as pending, Delete, Manage fields, First, Prev, Last
  - campos: Search for task title, Page Size, Search Numbers
### Subconta · businesses

- **`/businesses/list`**
  - colunas: Company Name, Phone, Email, Website, Address, State, City, Description, Postal Code, Country, Domain name, Created At ( -03 ), Updated At ( -03 ), Created By
  - ações: Import, Add Company, Filters, Export, Trigger automation, Send email, Delete, Manage fields, First, Prev, Last
  - campos: Search, Page Size, Search Numbers
### Subconta · opportunities

- **`/opportunities/list`**
  - campos: Search Numbers
- **`/opportunities/forecast`**
  - ações: Summary, Forecast timeline, Add opportunity, Sort By, Opportunity, Advanced filters, Edit, Delete, Today
  - campos: Search , Search Numbers
- **`/opportunities/pipeline`**
  - colunas: Pipeline name, Total stages, Updated on, Actions
  - ações: Create pipeline
  - campos: Search, Search Numbers
- **`/opportunities/bulk-actions`**
### Subconta · payments

- **`/payments/invoices`**
  - colunas: Invoice Name, Invoice Number, Customer, Issue Date, Amount, Status
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Settings, New, Integrate Payment Gateway, Filters
  - campos: Start Date, End Date, Search, Search Numbers
- **`/payments/recurring-templates`**
  - colunas: Recurring Invoice Name, Customer, Last Issued On, Frequency, Amount, Status
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Settings, New, Integrate Payment Gateway, Filters
  - campos: Search, Search Numbers
- **`/payments/invoice-templates`**
  - abas: Invoices, Estimates
  - colunas: Template Name, Amount
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, New Template, Integrate Payment Gateway
  - campos: Search, Search Numbers
- **`/payments/v2/estimates`**
  - abas: All, Draft, Sent, Accepted, Declined, Invoiced
  - colunas: Quote Name, Estimate Number, Customer, Issue Date, Value, Status
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Settings, New Estimate
  - campos: Start Date, End Date, Search, Search Numbers
- **`/payments/integrations/dashboard`**
  - títulos: Accounting sync, QuickBooks, Xero, Wave
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Connect
  - campos: Search Numbers
- **`/payments/proposals-estimates`**
  - abas: Draft 0, Waiting for others 0, Completed 0, Payments 0, Archived 0
  - colunas: Title, Status, Customer, Date modified, Value
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Settings, New
  - campos: Start Date, End Date, Search..., Search Numbers
- **`/payments/proposals-estimates/templates`**
  - abas: Templates, Public Documents, Content Library
  - colunas: Title, Value, Date modified
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, New
  - campos: Start Date, End Date, Search..., Search Numbers
- **`/payments/v2/orders`**
  - colunas: Customer, Source, Items, Order Date, Amount, Status
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Import as CSV, Filters
  - campos: Start Date, End Date, Search, Search Numbers
- **`/payments/v2/abandoned-checkouts`**
  - colunas: Placed by, Date, Items, Amount, Status, Recovery status
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Configure notifications, Export
  - campos: Search Numbers
- **`/payments/v2/subscriptions`**
  - colunas: Provider, Customer, Source, Created, Amount, Status
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Add Subscription, Filters
  - campos: Start Date, End Date, Search, Search Numbers
- **`/payments/v2/paymentlinks`**
  - colunas: Name, Link Url, Status, Price, Created At
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Create New Payment Link, Filters, Create Link
  - campos: Start Date, End Date, Search, Search Numbers
- **`/payments/v2/transactions`**
  - colunas: Customer, Provider, Source, Transaction Date, Amount, Status
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Import as CSV, Filters
  - campos: Start Date, End Date, Search, Search Numbers
- **`/payments/products`**
  - colunas: Image, Product name, Product Type, Updated, Actions
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Learn more, Import as CSV, Import from Stripe, Create Product, Filters
  - campos: Search, Search Numbers
- **`/payments/products/collections`**
  - colunas: Collection Name, Product count, Actions
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Create Collection
  - campos: Search, Search Numbers
- **`/payments/products/inventory`**
  - colunas: Product name, SKU, Available Quantity, Track Inventory, Continue Selling when Out of Stock
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews
  - campos: Search, Search Numbers
- **`/payments/products/reviews`**
  - abas: Pending 0, Approved 0, Unapproved 0, Trash 0
  - colunas: Author, Review details, Rating, Date, Product & store name
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Import as CSV
  - campos: Search Numbers
- **`/payments/coupons`**
  - colunas: Coupon name, Coupon code, Discount, Start Date, Status, Redemption Count
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Create Coupon, All, Active, Scheduled, Expired
  - campos: Search, Search Numbers
- **`/payments/gift-cards`**
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Create Gift Card
  - campos: Search Numbers
- **`/payments/settings/receipts`**
  - títulos: Settings
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Shipping & delivery, Save
  - campos: Title *, Title, Receipt prefix *, Receipt prefix, Receipt start number *, Receipt start number, From Name, From Email, Subject *, Subject, Email Template, Search Numbers
- **`/payments/integrations`**
  - títulos: Stripe, PayPal, Authorize.net, NMI, Manual Payment Methods, Square, Adyen, Mercado Pago
  - ações: All Invoices, Recurring Invoices, Templates, Estimates, Accounting Sync, All Documents & Contracts, Orders, Abandoned Checkouts, Products, Collections, Inventory, Reviews, Configure providers, Connect, Search For More
  - campos: Search Numbers
### Subconta · vibe

- **`/vibe`** (iframe: leadgen-vibe-ai-builder.leadconnectorhq.com)
  - títulos: Let's build a landing page, Design Diagnóstico BH
  - ações: LE La Vaca Estudio, Home, All projects, Starred, Design Diagnóstico BH, New Sell products and accept payments, Recently viewed, My projects, Templates, Browse all
  - campos: Search Numbers
### Subconta · ai-agents

- **`/ai-agents/getting-started`**
  - títulos: Your Business is Losing Customers Every Day, Numbers don't lie, Never miss a call, ever again, Turn leads into revenue, on autopilot, Book more appointments, automatically, Build a 5-star reputation on autopilot, Ship AI, any way you want, Sales Agent
  - colunas: Human Agent, AI Agent, Revenue Impact, Estimate
  - ações: Get Started →, Start test call, Voice Agent Fastest setup, Get started →, Appointment Scheduler Drives more bookings, AI Reputation Manager Low effort win, Deploy now →
  - campos: Search Numbers
- **`/ai-agents/agent-studio`**
- **`/ai-agents/voice-ai`**
  - abas: Dashboard & Logs, Agent List
  - títulos: Voice AI Capacity Boost! 🚀
  - ações: Upgrade to unlimited AI Employee plan, Create Folder, Create Agent, Set spending limit, Go to Agent List, Got it!
  - campos: Search Numbers
- **`/ai-agents/conversation-ai`**
  - abas: Dashboard, Agents List
  - colunas: Contact Name, Channel Name, Agent Name, Last Message Date & Time, Actions
  - ações: Manage Knowledge Base, Create Agent, Set spending limit
  - campos: Start Date, End Date, Search Numbers
- **`/ai-agents/knowledge-base`**
  - colunas: Name, KB gaps, Last updated, Created at, Actions
  - ações: Create with AI Beta, Create knowledge base, Sort by
  - campos: Search knowledge base, Search Numbers
- **`/ai-agents/agent-templates`**
  - campos: Search for agents..., Voice AI, Conversation AI, Search Numbers
- **`/ai-agents/content-ai`**
  - abas: Text, Image
  - colunas: Content, Date, Variation Count, Transaction ID, Total Words Count, Type, Action
  - ações: Upgrade to unlimited AI Employee plan, All, Social Planner, Blog, Funnel, Website, Email, Conversation
  - campos: Search Numbers
- **`/ai-agents/agent-logs`**
  - abas: Sessions, Contacts, Metrics, Monitor
  - colunas: Agent name, Contact name, AI Product, Channel, Timestamp, Duration / Latency, Messages, Agent ID, Conversation ID, Tokens, Action
  - ações: 7/10 Columns
  - campos: Search logs, Search Numbers
- **`/ai-agents/ai-usage`**
  - colunas: DATE, PRODUCT, CHARGE, REBILLED, ACTION
  - ações: Set $50.00 limit, Choose an amount, Upgrade plan, Set a limit, 1d, 7d, 30d, 90d, Month, Custom, AI Studio, View details
  - campos: Cost, Tokens, Events, Bar, Line, None, Product, Model, Billing, Hourly, Daily, Weekly, Monthly
### Subconta · marketing

- **`/marketing/social-planner`**
  - títulos: Grow your audience by posting across platforms in minutes, Connect your social accounts, Everything you need to manage social, Bulk Scheduling with CSV, Evergreen Queue Post, Recurring Post, Generate Feed from RSS Post
  - ações: Dashboard, Campaign, Affiliate, Payout, Media, Settings, Facebook + Connect, Instagram + Connect, LinkedIn + Connect, TikTok + Connect, YouTube + Connect, Pinterest + Connect, Threads + Connect, Bluesky + Connect, GBP + Connect, Community + Connect, Send social connect invite, Send Message
  - campos:  from , Enter a subject, Type a message, Search Numbers
- **`/marketing/emails/statistics`**
  - abas: Statistics, Campaigns, Templates
  - títulos: Email marketing
  - colunas: Title, Execution date, Delivered, Open rate, Click rate, Type
  - ações: Dashboard, Campaign, Affiliate, Payout, Media, Settings, Clear sample data, Create with AI, Create campaign, Last 7 days
  - campos: %, Search Numbers
- **`/marketing/templates`**
  - abas: All Snippets, Folders
  - colunas: Name, Body, Folder, Type, Date Updated
  - ações: Dashboard, Campaign, Affiliate, Payout, Media, Settings, New Folder, New Snippet
  - campos: Search, Search Numbers
- **`/marketing/countdown-timer`**
  - colunas: Name, Type, End Date/Duration, Created on
  - ações: Dashboard, Campaign, Affiliate, Payout, Media, Settings, New, Filters
  - campos: Search timer, Search Numbers
- **`/marketing/trigger-links`**
  - abas: Link, Analyze
  - colunas: Name, Link URL, Link Key, Date Added
  - ações: Dashboard, Campaign, Affiliate, Payout, Media, Settings, Add Link, Prev
  - campos: Search, Search Numbers
- **`/marketing/affiliate-manager/dashboard`** (iframe: client-app-affiliate-manager.leadconnectorhq.com)
  - ações: Dashboard, Campaign, Affiliate, Payout, Media, Settings, Send Message, Start Your First Affiliate Campaign, Learn More, Import from First Promoter
  - campos:  from , Enter a subject, Type a message, Search Numbers
- **`/marketing/affiliate-manager/campaigns`** (iframe: client-app-affiliate-manager.leadconnectorhq.com)
  - ações: Dashboard, Campaign, Affiliate, Payout, Media, Settings, Send Message, Start Your First Affiliate Campaign, Learn More, Import from First Promoter
  - campos:  from , Enter a subject, Type a message, Search Numbers
- **`/marketing/affiliate-manager/affiliates`** (iframe: client-app-affiliate-manager.leadconnectorhq.com)
  - ações: Dashboard, Campaign, Affiliate, Payout, Media, Settings, Send Message, Start Your First Affiliate Campaign, Learn More, Import from First Promoter
  - campos:  from , Enter a subject, Type a message, Search Numbers
- **`/marketing/affiliate-manager/payouts`** (iframe: client-app-affiliate-manager.leadconnectorhq.com)
  - ações: Dashboard, Campaign, Affiliate, Payout, Media, Settings, Send Message, Start Your First Affiliate Campaign, Learn More, Import from First Promoter
  - campos:  from , Enter a subject, Type a message
- **`/marketing/brand-boards`**
  - abas: Design Kit, Brand Voice
  - colunas: Title, Updated on, Status
  - ações: Dashboard, Campaign, Affiliate, Payout, Media, Settings, Global settings, Add Design Kit
  - campos: Search Numbers
- **`/marketing/ad-manager/home`**
  - ações: Dashboard, Campaign, Affiliate, Payout, Media, Settings, Activate Ads Manager
- **`/marketing/prospecting`**
  - ações: Dashboard, Campaign, Affiliate, Payout, Media, Settings
### Subconta · automation

- **`/automation/workflows`** (iframe: client-app-automation-workflows.leadconnectorhq.com)
  - títulos: Workflows list
  - colunas: Name, Status, Total enrolled, Active enrolled, Last updated, Created on, Stats
  - ações: What's new Automation updates, Create folder, Build using AI, Create workflow, New smart list, Customize list, Home
  - campos: Search Numbers, Search
- **`/automation/overview`** (iframe: client-app-automation-workflows.leadconnectorhq.com)
  - títulos: Workflow enrollments - last 7 weeks
  - ações: What's new Automation updates
  - campos: Search Numbers, Start date, End date
- **`/automation/workflows/settings`** (iframe: client-app-automation-workflows.leadconnectorhq.com)
  - ações: What's new Automation updates, View plans, Save, Add date
  - campos: Start Date and Time, End Date and Time
### Subconta · funnels-websites

- **`/funnels-websites/funnels`**
  - colunas: Name, Last updated, Funnel steps
  - ações: Dashboard, Settings, Branded Mobile App, Build with AI, New funnel
  - campos: Search for funnels
- **`/funnels-websites/websites`**
  - colunas: Name, Last updated, Website pages
  - ações: Dashboard, Settings, Branded Mobile App, Build with AI, New website
  - campos: Search for websites, Search Numbers
- **`/funnels-websites/stores`**
  - colunas: Name, Last updated, Store pages
  - ações: Dashboard, Settings, Branded Mobile App, New store, Complete setup, Start Onboarding
  - campos: Search for stores, Search Numbers
- **`/funnels-websites/webinars`**
  - colunas: Name, Last updated, Webinar pages
  - ações: Dashboard, Settings, Branded Mobile App, New webinar funnel
  - campos: Search for webinars
### Subconta · analytics

- **`/analytics`**
  - abas: Traffic channel, Source/Medium
  - ações: Dashboard, Settings, Branded Mobile App, Advanced filter
  - campos: Start Date, End Date, Page views 0, Opt-ins 0, Sales R$ 0, Opt-in conversion rate 0%, Search Numbers
### Subconta · blogs

- **`/blogs`**
  - colunas: Blog site, Status, Description, Last updated
  - ações: Dashboard, Settings, Branded Mobile App, Create blog, New blog site, Send Message
  - campos: Search,  from , Enter a subject, Type a message, Search Numbers
### Subconta · wordpress

- **`/wordpress`**
  - ações: Dashboard, Settings, Branded Mobile App, Activate WordPress, Why Choose Us?
  - campos: Search Numbers
### Subconta · funnels-websites

- **`/funnels-websites/client-portal/dashboard`**
  - ações: Dashboard, Settings, Branded Mobile App, Generate, Invite, Send
  - campos: Search Numbers
### Subconta · form-builder

- **`/form-builder/main`**
  - abas: All forms, Analytics, Submissions, Settings
  - colunas: Name, Updated on, Updated by
  - ações: Dashboard, Settings, Branded Mobile App, Form features, Create form
  - campos: Search for forms, Search Numbers
### Subconta · survey-builder

- **`/survey-builder/main`**
  - abas: All surveys, Analytics, Submissions, Settings
  - ações: Dashboard, Settings, Branded Mobile App, Create survey, Try survey preview, Use template, Skip for Now, Submit
  - campos: Search Numbers, Share your experience or suggestions for improvement...
### Subconta · quiz-builder

- **`/quiz-builder/main`**
  - abas: All quizzes, Submissions, Settings
  - ações: Dashboard, Settings, Branded Mobile App, Create quiz, Try quiz preview, Use template
  - campos: Search Numbers
### Subconta · funnels-websites

- **`/funnels-websites/chat-widget`**
  - abas: Library, Insights
  - colunas: Name, Updated on, Chat type
  - ações: Dashboard, Settings, Branded Mobile App, New
  - campos: Search Numbers
### Subconta · qr-codes

- **`/qr-codes`**
  - ações: Dashboard, Settings, Branded Mobile App, Select, Filter
  - campos: Search QR codes, Search Numbers
### Subconta · memberships

- **`/memberships/client-portal/dashboard`**
  - ações: Dashboard, Settings, Branded Mobile App, Products, Offers, Analytics, Domain setup, Branding, Email notifications, Course Builder, Groups, Email Settings, Generate, Invite, Send
  - campos: Search Numbers
- **`/memberships/client-portal/branded-app`**
  - ações: Dashboard, Settings, Branded Mobile App, Products, Offers, Analytics, Domain setup, Branding, Email notifications, Course Builder, Groups, Email Settings
  - campos: Search Numbers
- **`/memberships/courses/dashboard-v2`**
  - títulos: Course Progress Funnel
  - ações: Dashboard, Settings, Branded Mobile App, Products, Offers, Analytics, Domain setup, Branding, Email notifications, Course Builder, Groups, Email Settings, Create Course, Clear Sample Data, Go to Revenue, Go to Funnel, 0% Getting started 0 of 10 complete, Skip for Now, Submit
  - campos: Search Numbers, Share your experience or suggestions for improvement...
- **`/memberships/courses/products-v2`**
  - ações: Dashboard, Settings, Branded Mobile App, Products, Offers, Analytics, Domain setup, Branding, Email notifications, Course Builder, Groups, Email Settings, Sort: Newest, Announcements, Create New, Create New Course, 0% Getting started 0 of 10 complete
  - campos: Search Courses, Search Numbers
- **`/memberships/courses/offers-list-v2`**
  - colunas: Title, Products, Type, Price, Visibility, Actions
  - ações: Dashboard, Settings, Branded Mobile App, Products, Offers, Analytics, Domain setup, Branding, Email notifications, Course Builder, Groups, Email Settings, + Create Offer, Published, Draft, All, 0% Getting started 0 of 10 complete
  - campos: Search, Search Numbers
- **`/memberships/courses/analytics-v2`**
  - títulos: Course progress, User conversion funnel
  - colunas: Members, Progress, Start date, Last accessed, Enrolment date, Session count
  - ações: Dashboard, Settings, Branded Mobile App, Products, Offers, Analytics, Domain setup, Branding, Email notifications, Course Builder, Groups, Email Settings, Course progress, Assessment, Member analytics, Revenue analytics, Create Course, Clear Sample Data, Started learning, Not started learning (360), Completed course, Haven't completed course (500)
  - campos: Search name or email, Search Numbers
- **`/memberships/communities/community-groups`**
  - ações: Dashboard, Settings, Branded Mobile App, Products, Offers, Analytics, Domain setup, Branding, Email notifications, Course Builder, Groups, Email Settings, Active, Create Group, Login
  - campos: Search Numbers
- **`/memberships/certificates/create-certificates`**
  - abas: Templates, Issued Certificates, Issued Badges
  - títulos: Design certificates that people want t
  - ações: Dashboard, Settings, Branded Mobile App, Products, Offers, Analytics, Domain setup, Branding, Email notifications, Course Builder, Groups, Email Settings, Course completion, Milestone achieved, Event participation, Training completed, Create
  - campos: e.g. Course completion certificate, navy and gold theme, Start date, End date, Search by title, Search Numbers
- **`/memberships/gokollab/activation`**
  - ações: Dashboard, Settings, Branded Mobile App, Products, Offers, Analytics, Domain setup, Branding, Email notifications, Course Builder, Groups, Email Settings, Play, Mute, Enter fullscreen, PIP, CaptionsDisabled, Qualityundefined, SpeedNormal, CaptionsGo back to previous menu, QualityGo back to previous menu, SpeedGo back to previous menu, 0.5×, 0.75×, Normal, 1.25×, 1.5×, 1.75×, 2×, 4×
  - campos: Search Numbers
### Subconta · media-storage

- **`/media-storage`**
  - títulos: Media Storage
  - ações: Connect Canva, Connect Drive, Upload, Folders
  - campos: Replace, Search the entire media library or explore stock images., Upload, Upload folder
### Subconta · reputation

- **`/reputation/overview`**
  - abas: My Stats, Competitor Analysis
  - ações: Send Review Request, Sections, Skip Onboarding, Connect Google Business Profile Go, Setup Review Link, Configure Reviews AI, Create a Review Widget, Send your 1st Review Request, Connect more platforms, Start Collecting Reviews, Send First Review Request, Create a Collector, Create Widget, Generate QR Code, Activate Listings
  - campos: DD / MM / YYYY, Search Numbers
- **`/reputation/requests`**
  - ações: Configure Review Link, Send Review Request
  - campos: Search by name, email, or phone, Search Numbers
- **`/reputation/reviews`**
  - ações: Add Reviews, Send Review Request, Start Collecting Reviews, here
  - campos: Start Date, End Date, Search, Search Numbers
- **`/reputation/video-testimonials`**
  - abas: Overview, Video Collectors, Responses
  - ações: Send Review Request, Create Collector, Skip Onboarding, Create a Video Collector Go, Send a Review Request, Collect a Video Testimonial, Create a Video Widget, Create a Collector
  - campos: Search Numbers
- **`/reputation/widget`**
  - abas: Saved Widgets, Templates
  - ações: Create new, Edit Widget
  - campos: Search Numbers
- **`/reputation/listing`**
  - ações: Scan my business for FREE!, Activate Listings
  - campos: Search Numbers
- **`/reputation/gbp`**
  - ações: Integrate GBP
  - campos: Search Numbers
- **`/reputation/settings`**
  - abas: Reviews AI, Review Link, SMS Requests, Email Requests, WhatsApp Requests, Reviews QR, Spam Reviews, Integrations
  - colunas: Agent Name, Date Updated, Review Type, Review Source, Tones, Responses
  - ações: Upgrade to unlimited AI Employee plan, Integrate Now, Create Starter Agents, Create Agent, All, ❌ No Tone
  - campos: Auto Responses Automatically sends review responses, Suggestive Helps you articulate review responses, Off Turn off Reviews AI to stop receiving suggestions., example: 2, Search Numbers
### Subconta · reporting

- **`/reporting/reports`**
  - ações: Create your first report, Explore dashboards
  - campos: Search Numbers
- **`/reporting/google-ads`**
  - títulos: Google Ads report
  - colunas: CAMPAIGN, STATUS, CLICKS, COST, REVENUE, ROI %, CPC, CTR, SALES, CPS, LEADS, CPL, IMPRESSIONS, AVERAGE REVENUE
  - ações: Submit Feedback, This week, Last week, Last 7 days, Last 30 days, This month, Last month, This year, Last year, November, 2026, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28
  - campos: Select date & time, Type to search, Management fee %, 0%,  from , Enter a subject, Type a message, Search Numbers
- **`/reporting/facebook-ads`**
  - títulos: Meta Ads (Facebook Ads) report
  - colunas: CAMPAIGN, STATUS, CLICKS, COST, REVENUE, ROI %, CPC, CTR, SALES, CPS, LEADS, CPL, IMPRESSIONS, AVERAGE REVENUE
  - ações: Submit Feedback, This week, Last week, Last 7 days, Last 30 days, This month, Last month, This year, Last year, November, 2026, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28
  - campos: Select date & time, Type to search, Management fee %, 0%,  from , Enter a subject, Type a message, Search Numbers
- **`/reporting/attribution`**
  - abas: Revenue, Leads, Opportunities
  - títulos: Session events
  - colunas: Event type, Source, Contact, Campaign, UTM medium, UTM content, UTM source, UTM term, Referrer, URL link, Created at
  - ações: Columns, Export, Filters
  - campos: Start Date, End Date, First attribution, Last attribution, Search Numbers
- **`/reporting/call`**
  - abas: Incoming, Outgoing
  - títulos: Call report
  - colunas: Source, Total calls, Won deals, Avg duration, Date & time, Contact name, Number name, Source type, Call status, Disposition, Keyword, Duration, Recording, First time, Device type, Marketing campaign, Call flow, Landing page, Qualified lead
  - ações: Filters, All calls, Incoming, Outgoing, Columns
  - campos: Start Date, End Date, Search Numbers
- **`/reporting/agent`**
  - títulos: Agent report, Opportunities, Conversions, SMS, Email, Call metrics, Efficiency
  - colunas: Rank, Agent name, Points
  - ações: Luiz Gustavo Oliveira Marques, Select All, Deselect All, This week, Last week, Last 7 days, Last 30 days, This month, Last month, This year, Last year, November, 2026, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26
  - campos: Select a user, Select a date range, Select date & time, Search Numbers
- **`/reporting/appointment`**
- **`/reporting/local-marketing-audit`**
  - campos: Search Numbers
### Subconta · integration

- **`/integration`**
  - abas: All Apps, Installed Apps, App Reselling, AI Agents, Earnings, Support Tickets, Templates
  - títulos: Build Marketplace apps with App Studio
  - ações: Try App Studio, Settings
  - campos: Search Apps, Search Numbers
### Subconta · settings

- **`/settings/company`**
  - campos: Search Numbers
- **`/settings/profile`**
  - títulos: Personal Details
  - ações: General, Security, Email and conversations, Calendar, Update profile, Update password, Sign Out Everywhere, Setup Two-factor Authentication (2FA) App
  - campos: First Name *, First name, Last Name *, Last name, Email *, Email, Phone, Phone number, Extension, Calendar, Platform Language, Current password *, Current password, New password *, New password, Confirm password *, Confirm password, Search Numbers
- **`/settings/company-billing/billing`**
  - ações: Add Payment Method
  - campos: Search Numbers
- **`/settings/users`**
  - títulos: Users
  - colunas: Name, Email, Phone number, User type, Actions
  - ações: User role All, Add user
  - campos: name, email, phone, ids, Search Numbers
### Subconta · crm-settings

- **`/crm-settings`**
  - ações: Save changes
  - campos: Search Numbers
### Subconta · settings

- **`/settings/smtp_service`** (iframe: ghl-isv-app-prod.leadconnectorhq.com)
  - abas: Email services, Reply & Forward Settings, Email Analytics, Risk Assessment, Bounce Classification, Postmaster Tools, Advanced Settings
  - ações: Dedicated Domain And IP, Add a dedicated domain
  - campos: Search Numbers
- **`/settings/phone_system`**
  - títulos: Phone System
  - colunas: Numbers, Friendly Name, Forwarding Number, Call Timeout
  - ações: Add Number, Phone Numbers, Number Pools, Verified Caller IDs, Port-In Numbers
  - campos: Search, Search Numbers
- **`/settings/whatsapp`**
  - ações: Quick Start, Learn more, Agency Purchase
  - campos: Search Numbers
- **`/settings/objects`**
  - ações: Add custom object
  - campos: Search Numbers
- **`/settings/fields`**
  - colunas: Field name, Field type, Folder name, Key, Created (-03), Actions
  - ações: Create folder, Create field, 6/7 columns
  - campos: Fields 38, Folders 5, Search fields, Search Numbers
- **`/settings/custom_values`**
  - abas: All values, Folders
  - colunas: Name, Folder, Key, Value
  - ações: Add folder, Add custom value
  - campos: Search values
- **`/settings/import-data`**
  - colunas: Source, Imported by, Status, Objects, Records found, Errors, Started (GMT -03), Completed (GMT -03), Actions
  - ações: Start CSV import, Connect HubSpot, Tell us which one
  - campos: Search Numbers
- **`/settings/scoring`**
  - colunas: Action, Calculation
  - ações: Add new rule, Engagement Score, Prev
  - campos: Search, Search Numbers
- **`/settings/domain`**
  - ações: Purchase domain, Transfer-In Domain, Connect a domain
  - campos: Search Numbers
- **`/settings/external-tracking`**
  - abas: Installation, Troubleshoot, Settings, HTML forms, iframe forms
  - títulos: External tracking
  - ações: Watch how it works, Learn more, Copy code, View analytics, Submissions
  - campos: Search Numbers
- **`/settings/lc-integrations`**
  - ações: Manage, Connect
  - campos: Search Integrations, Search Numbers
- **`/settings/private-integrations`**
  - ações: Learn More, Create new integration
  - campos: Search Numbers
- **`/settings/tags`**
  - abas: Tags, Categories
  - colunas: Tag name, Description, Category, Created (-03), Updated (-03), Actions
  - ações: Create category, Create tag
  - campos: Search, Search Numbers
- **`/settings/labs`**
  - títulos: Voice AI can now answer your WhatsApp calls, Handle duplicates: what this setting does, Prompt Optimizer for Conversations AI, 💡 What Is Prompt Optimizer?
  - ações: Show More, Submit Feedback, Changelog, Support Docs, Preview, View Gallery
  - campos: Search, Search Numbers
- **`/settings/audit/logs`**
  - colunas: Name, Module, Action, Done By, Date & Time
  - ações: Export, Refresh, Audit Logs, Exports
  - campos: Search by Document ID, Start date, End date, Search Numbers
### Agência · ai-suite

- **`A:/ai-suite`**
  - abas: Plans & Limits, Usage Dashboard, AI Setup
  - colunas: Sub-account, AI Agents, Plan, Charged to, Usage, Limit
  - ações: Set $50.00 default, Not now, Filters, Free AI, Edit defaults, Refresh, Prev
  - campos: Search by sub-account name or sub-account ID
### Agência · agency_launchpad

- **`A:/agency_launchpad`**
  - abas: Foundational setup, Lead generation, SaaS launch guide, Brand & billing
  - títulos: Setup Guide, Fast-track your setup, Congratulations! Your Exclusive Implementation Call Awaits
  - ações: Join the success call, How to add a brand logo, Join Video Call with Success Team
### Agência · agency_dashboard

- **`A:/agency_dashboard`**
  - títulos: Congratulations! Your Exclusive Implementation Call Awaits
  - ações: Connect Stripe, Join Video Call with Success Team, Join video call with success team
### Agência · saas_dashboard

- **`A:/saas_dashboard`**
  - ações: Get started
### Agência · prospecting

- **`A:/prospecting`**
  - ações: Join video call with success team
### Agência · sub-accounts

- **`A:/sub-accounts`**
  - títulos: Select Snapshot Template, Team Management, User Info, Personal Logo, User Permissions, User Roles, Call & Voicemail Settings
  - ações: User Info, Change, Remove, Select calendar, User Permissions, Use setting, User Roles, Select Account, Call & Voicemail Settings, Save
  - campos: First Name, Last Name, Email, Phone, Extension, Password, Forward calls to web app, Forward calls to mobile app
### Agência · snapshots

- **`A:/snapshots`**
  - abas: My snapshots, Imported snapshots, Shared snapshots, Snapshot templates
  - ações: Create snapshot, View documentation, Join video call with success team, ?
### Agência · reselling

- **`A:/reselling`**
  - abas: Subscription, Usage, Marketplace, Ad Manager, AI Employee, Branded Client Portal Mobile App, Dedicated IP, Listings, Prospecting, SEO (By Search Atlas), WhatsApp, WordPress, Workflow Pro
  - títulos: Reselling
  - ações: Manage, Save Changes, Change Engine, Addon, View Plan Details, Default Plan, Upgrade, Join video call with success team
  - campos: Your Price, Please Input, Your Customer's Price, Your Profit, Monthly, Yearly
### Agência · marketplace

- **`A:/marketplace`**
  - ações: Buy now, Talk to our team, Join video call with success team
### Agência · affiliate_portal

- **`A:/affiliate_portal/terms-and-conditions`**
  - títulos: Affiliate Portal, Welcome to the HighLevel Affiliate Program
  - ações: 1. Review the Affiliate Policy, 2. Watch the Compliance Video, 3. Download the Marketing Toolkit, 4. Download the Compliance Flowchart, Accept Terms & Join Now, Join video call with success team
### Agência · template-library-admin

- **`A:/template-library-admin`**
  - ações: Create template, Show more, Filters, See all, Preview
  - campos: Search by category
### Agência · partners

- **`A:/partners`**
  - ações: Join video call with success team
### Agência · university

- **`A:/university`**
  - ações: Go to HighLevel University →, Join video call with success team
### Agência · mobile-app-customiser

- **`A:/mobile-app-customiser`**
### Agência · desktop-whitelabel-app

- **`A:/desktop-whitelabel-app`**
  - abas: Live preview, Status
  - títulos: Whitelabel desktop app customizer, Desktop app configuration, Theme, All the sales & marketing tools you need, under one roof
  - ações: Save, GHL Blue, Ocean, Emerald, Slate, Rose, Amber, Violet, Minimal, Click to upload or drag and drop Cropped to 1024 x 1024, Click to upload or drag and drop Cropped to 3840 x 2160, Live preview, Status, Your app name, Your logo, All the sales & marketing tools you need, under one roof, Sign in to Your app name, Image placeholder
  - campos: App icon *, App name *, e.g. My Business App, Title *, Subtitle *, App full logo, Background image, Image placeholder
### Agência · settings

- **`A:/settings/profile`**
  - títulos: Personal Details
  - ações: General, Security, Update profile, Update password, Sign Out Everywhere, Setup Two-factor Authentication (2FA) App
  - campos: First Name *, First name, Last Name *, Last name, Email *, Email, Phone, Phone number, Extension, Platform Language, Current password *, Current password, New password *, New password, Confirm password *, Confirm password

## 4. Construtores (editores) do GHL

Cada construtor foi aberto na aba CDP e lido direto da interface. Onde o editor só abre com um item, foi criado um **rascunho** (lista no fim desta seção). As configurações de app mobile e desktop da agência foram **só lidas**, sem salvar.

| Construtor | Onde roda | O que tem |
|---|---|---|
| **Workflows** | iframe `client-app-automation-workflows` | 116 gatilhos e 180 ações (ver §1.3), canvas com nós, rascunho/publicar, testar, histórico de inscrições, logs de execução, construtor por IA |
| **Formulário** | iframe `leadgen-apps-form-survey-builder` | Abas Edit / Settings / Integrate / Submissions / Notifications / Analytics. Paleta: **Quick Add**, **Object Fields**, Personal Info (nome, sobrenome, nascimento, telefone, e-mail), **Payments** (vender produtos, cobrar), Address (endereço, cidade, estado, país, CEP, empresa, site), Text (linha única, multilinha, lista), Choice (dropdown simples/múltiplo, checkbox, radio, escolha por imagem), Rating (nota, personalizado), Customized (texto, HTML, anti-bot, origem, termos, score), Other (imagem, upload, monetário, número, data/hora, **assinatura**, URL). Settings: mensagem/redirect ao enviar, estilo, Pixel do Facebook e eventos, janela de visibilidade, salvar progresso, **PDF da submissão** anexado ao contato, recomendações por IA, sticky contact, criar conversa ao enviar, fuso, fonte GDPR |
| **Survey** | mesmo iframe | Mesma paleta do formulário, organizada em **slides** (multi-etapa, "Add Slide") |
| **Quiz** | mesmo iframe | **Páginas**, mais um **template de página de resultado**. Paleta própria de perguntas: escolha única/múltipla, sim/não, resposta curta/longa, número, dropdowns, escolha por imagem. Também tem dados pessoais, endereço, rating, score e outros |
| **Page builder** (funis, sites, lojas, webinars) | iframe `page-builder` | Painel "Ask AI" (nicho, objetivo, público, oferta → gerar página), seção em branco, inserir elemento. Abas: Quick Add · Sections · Rows · Elements · Prebuilt Sections · Saved Assets · **Widget Marketplace**. Linhas de 1 a 6 colunas. Elementos: **Texto** (headline, sub-headline, parágrafo, bullet, rich text) · **Form** (botão, form) · **Blog** (posts, navegação de categorias, compartilhar, inscrição) · **Mídia** (slider, vídeo, imagem, FAQ, galeria, logos, depoimentos) · **Custom** (código, survey, quiz, calendário, serviços, locações, mapa, SVG, reviews, contador numérico, QR, tabela de preços) · **Countdown** (countdown, minuto, dia) · **Blocos** (menu, divisor, barra de progresso, image feature) · **Social** (ícones, widgets, feed do Instagram) · **Pedido** (confirmação, formulário de pedido) · **Loja** (carrinho, busca, lista de coleção, produtos em destaque, upsell, produto em destaque). O funil em si tem as abas Steps / Stats / Sales / Security / Events / SEO & AEO / Settings, e cada etapa tem split test, variações, clonar e importar do ClickFunnels |
| **Blog** | app principal | Setup do site de blog: título, domínio e slug, meta descrição (exige domínio conectado) |
| **E-mail** | app principal | Começa em branco, por template, por template próprio ou como sequência. Criação por IA, com editor de design, de código ou texto simples. Blocos: texto, imagem, botão, logo, divisor, social, rodapé, código, vídeo, **carrinho**, **RSS** (header e itens), FAQ, **produtos**, slider de imagem, preview de URL, **countdown**, espaçador, **link de review**, formulários. Também tem layouts, itens salvos, anexos, **teste A/B**, versão desktop/mobile, histórico de versões, segmentação por tag, rastreio de cliques e UTM, reenvio para quem não abriu e checagem de spam |
| **Countdown timer** | app principal | 9 templates (minimalista, simples, progresso, anel, roda, mostrador, grade redonda, array, caixa quadrada) |
| **QR code** | app principal | 20 tipos: URL, review link, ligação, SMS, e-mail, pagamento, WhatsApp, funil, site, form, survey, quiz, cartão de perfil, vCard, cartão de visita, apps, calendário, serviço, locação. QR dinâmico, criação em massa por CSV, analytics de leituras, cor e forma |
| **Chat widget** | app principal | Tipos: tudo-em-um (WhatsApp, chat, e-mail/SMS, FB, IG, Voice AI), SMS/e-mail, chat ao vivo (equipe ou Conversation AI), Facebook, Instagram, WhatsApp, Voice AI |
| **Brand board** | app principal | Design Kit + **Brand Voice**. Importa a marca pela URL do site (cores, logo, fontes) ou parte de presets (Earth, Lagoon, Elements, Tender, Desert, Dusk, Coffee) |
| **Curso** | app principal (`course-creator-studio`) | Do zero, importar do Kajabi ou criar com IA. Wizard em 3 passos: Detalhes → Thumbnail → Preço. O construtor completo está no **§4.2** |
| **Comunidade (grupo)** | portal do cliente (`*.app.clientclub.net`) | Criação: nome, URL/slug, descrição (obrigatória), Discovery, favicon, capa, logo. O construtor completo está no **§4.1** |
| **Certificado / badge** | app principal | Certificate AI (por prompt), do zero ou por template. Templates de conclusão, marco, evento e treinamento. Lista de emitidos (certificados e badges) |
| **Documentos e contratos** | iframe `leadgen-apps-proposal-builder` | Começa em branco, por upload de PDF ou da biblioteca de templates. **Destinatários com ordem de assinatura**. Blocos: texto, imagem, vídeo, tabela, **lista de produtos**, quebra de página. **Campos preenchíveis**: assinatura, campo de texto, data, rubrica, checkbox, **dados de cartão**. Variáveis do documento, biblioteca de conteúdo (sobre nós, benefícios, planos, equipe, vídeo, duas colunas), tema. **Pagamento**: único ou recorrente, cobrança direta após assinar, enviar fatura, autopagamento, cronograma de pagamento |
| **Agent Studio** | app principal | "Managed Agents": descreva ou parta de um caso de uso (posts sociais, pesquisa e score de lead, pedido de review, briefing de deal, campanha de e-mail, estúdio criativo semanal, prospecção, monitor de concorrentes, relatório de marketing). Cada agente tem gatilho (form, tag, oportunidade, agenda semanal), ferramentas (web search, imagens, vídeo) e canais |
| **Voice AI** | app principal | Do marketplace, custom ou **Flow Builder** no-code. Config: voz, modelo, idioma, custo/min estimado, prompt (papel, regras, roteiro), mensagem de boas-vindas, quem fala primeiro. **Ações**: transferir ligação, disparar workflow, SMS, atualizar campo, agendar, WhatsApp, Custom Action 2.0, transferir para outro agente, **MCP**. Também: anti-spam, base de conhecimento, tradução, pós-ligação, relatórios, outbound, teste por web call ou telefone, histórico |
| **Conversation AI** | app principal | Por prompt (Q&A geral, agendamento, marketplace, do zero) ou **flow builder** visual. Config: modelo, nome do negócio, personalidade/prompt (até 8.000 palavras), ações, **gatilhos de base de conhecimento**, **servidores MCP**, modo (off, sugestivo, auto-pilot), e-mail, canais, tempo de espera, máximo de mensagens, pausa quando um humano envia, responder a imagens e áudios, resumo da conversa |
| **Vibe** (apps por IA) | iframe `leadgen-vibe-ai-builder` | Projetos, favoritos, templates, "Cloud with Database, Auth and Storage" |
| **Calendário** | iframe `calendar-app` | Tipos: pessoal, **round robin**, **turma** (1 host, vários participantes), **coletivo** (vários hosts), **evento** (sem host), **serviço**. Grupos, preferências, minha disponibilidade, calendários de serviço (v1) |
| **Relatório customizado** | app principal | Em branco, por template, clonar ou importar de um dashboard. Páginas com capa, **235 widgets** em 15 categorias (geral, contatos, agendamentos, oportunidades, visitantes, e-mails, SMS, ligações, conversas, pagamentos, Meta Ads, Google Ads, Social Planner, reputação, GA), temas, **métricas customizadas**, preview, download, envio agendado |
| **Desktop white-label** (agência, sem salvar) | app principal (`/desktop-whitelabel-app`) | Formulário único com indicador de progresso (33%) e **preview ao vivo** da tela de login. **Tema**: presets (GHL Blue, Ocean, Emerald, Slate, Rose, Amber, Violet, Minimal) ou Custom com 4 cores (fundo, texto, botão, texto do botão). **Ícone** 1024² (obrigatório), **nome** (50, aparece na barra de título e no botão de login), **título** (150) e **subtítulo** (200) da tela de login, logo completo 512×128, imagem de fundo 3840×2160 (opcional), ilustração ou mascote 600×800. Aba **Status**: depois de salvar, o app é enviado para build ("Submit your app to get started"). O login acontece no navegador e volta para o app |
| **Mobile white-label** (agência, sem salvar) | iframe `mobile-whitelabel-customizer` (app **Flutter Web**, desenhado em canvas e sem texto no DOM; lido por screenshot) | **3 opções de app** para as subcontas: **HighLevel App** (marca GHL, grátis), **Lead Connector App** (marca neutra, grátis, a selecionada nesta conta) e **Custom Agency App** (marca da agência, **a partir de US$ 497/mês**). O app próprio permite aplicar a paleta, **reordenar ou ocultar módulos nativos** e **criar módulos novos** nomeando e embutindo qualquer URL. Os clientes usam o app para mensagens, contatos, agendamentos, pagamentos e módulos custom. Para iniciar: nome do app, domínio da empresa e **nome do pacote** (`com.empresa.app`). **Mobile App Settings**: tipo de app e toggle "mostrar aos clientes uma forma fácil de baixar o app", que cria uma página na subconta com QR e links das lojas iOS e Android. **Não foi iniciado**, porque criaria um projeto de app pago na conta da agência |

### 4.1 Construtor de comunidades (percorrido por dentro)

Criado o grupo "RASCUNHO GRAAO comunidade" e percorrido como administrador no portal do cliente. A interface aparece em pt-BR, na língua do portal. Nada de layout ou tema foi salvo.

**Estrutura do portal do cliente** (barra lateral): Painel, Comunidades, Cursos, Eventos, Faturas, Estimativas, Contratos, Arquivos compartilhados, Compromissos, Afiliados e Fidelidade. A comunidade é uma área dentro do mesmo portal onde o cliente vê as faturas, os contratos etc. Há um seletor de grupos com busca e fixação, chat, avisos e notificações.

**Navegação do grupo:** barra lateral com "Todas as publicações" e **Canais**. O "+" cria um **canal** (nome, ícone/emoji, descrição, privado só para convidados, somente leitura em que só admins publicam) ou uma **seção** que agrupa canais. Já vem um canal padrão, "Announcements".

**Abas** (podem ser renomeadas, reordenadas por arrastar e mostradas ou ocultadas em Configurações → Abas da Comunidade):

| Aba | O que tem |
|---|---|
| Discussão | Compositor ("No que você está pensando"), **transmissão ao vivo**, ordenação. Post: canal de destino, título (200), descrição rica (10.000) com mídia e documentos por arrastar, ativar comentários. Card lateral do grupo (convidar, membros, publicações, admins), emblemas e ranking de 30 dias |
| Aprendizado | Cursos dentro da comunidade ("Adicione novo curso"), filtros e ordenação |
| Eventos | Calendário mensal, futuros e passados, fuso, **gravações**. Criar evento em 2 abas, **Evento** e **Detalhes do pagamento**: título, cor, descrição (1.000), início e fim, fuso, recorrência, localização (link ou endereço, visível só a participantes), miniatura 1280×720, quem pode participar, lembrete por e-mail 1 dia antes, ocultar participantes |
| Tabelas de classificação | Recompensas, nível do membro e pontos para o próximo, distribuição dos membros por **9 níveis**, ranking de 7 dias, 30 dias e todo o período, "como os pontos funcionam" |
| Membros | Filtros por função (administrador, colaborador) e status (ativo, solicitado, convidado, banido), perfil com @handle, e-mail, última atividade e data de entrada |
| Sobre | Dono, público ou privado, gratuito ou pago, número de membros, galeria de imagens e vídeos, texto "Sobre esta comunidade" |
| Configurações | 15 seções (abaixo) |

**Configurações (15 seções):**
1. **Detalhes**: nome (50), URL, descrição, **tipo público ou privado**, abrir a partir do seletor, membros podem convidar, modal de perfil obrigatório…
2. **Analytics**: ganhos totais, membros totais, novos e inativos (com exportação), convites pendentes, tráfego por origem, **horários de pico de atividade**. Períodos de hoje a 12 meses ou personalizado.
3. **Assinaturas**: planos de preço (acesso, preço, período de teste), prévia da visão do membro, "tornar gratuita".
4. **Identidade visual**: logo 500², favicon 128², capa 16:9, avançado.
5. **Aparência**: 9 temas prontos (Padrão, Royal Velvet, Prado Exuberante, Zesty Citrus, Sunny Delight, Azure Dreams, Bubblegum Bliss, Ivory Whisper, Midnight Deep) mais **Personalizar** com 8 tokens de cor (Principal, Plano de fundo, Terciário, Fonte, Barra lateral, Superfície, Borda, Erro) e **pré-visualização ao vivo** do layout.
6. **Perguntas de adesão**: até 5 perguntas antes de entrar (triagem e qualificação de lead).
7. **Boas-vindas**: **DM automático** para quem entra (editável) e até 5 **etapas de onboarding**.
8. **Gamificação e recompensas**: níveis renomeáveis com limite de pontos (padrão 0, 5, 20, 65, 155, 515, 2015, 8015, 33015), fontes de pontos, recompensas por nível.
9. **Emblemas**: únicos (administrador, novo membro, membro fundador) e de engajamento renovados a cada trimestre (sequência diária de 7 dias, comentários…), concedidos automaticamente.
10. **Links promocionais** exibidos na página da comunidade.
11. **Newsletter**: resumo periódico por e-mail, com frequência, hora e fuso.
12. **Abas da comunidade**: mostrar, ocultar, renomear e reordenar as 6 abas.
13. **Moderação de conteúdo**: palavras-chave que retêm posts e comentários para revisão, fila "precisa de avaliação", "relatado por membros", **pacote inicial anti-spam**.
14. **Importador do Skool**: membros e conteúdo, via credenciais.
15. **Descoberta**: aparecer na busca pública e no diretório (gokollab.com), com categoria.

**Para o Graao:** o Graao já tem comunidades com canais, publicações, enquetes e ranking por níveis (commit `feat(communities)`). As principais lacunas são:
- eventos com pagamento e gravações;
- transmissão ao vivo;
- assinaturas e planos por comunidade;
- tema com tokens e preview;
- perguntas de adesão;
- DM e onboarding de boas-vindas;
- emblemas automáticos;
- moderação por palavra-chave;
- newsletter;
- abas configuráveis;
- analytics de comunidade;
- importador do Skool.

### 4.2 Construtor de cursos (percorrido por dentro)

Criado o curso gratuito "RASCUNHO GRAAO curso" e percorrido no editor. Nenhuma alteração de tema foi salva.

**Criação:** wizard em 3 passos (Detalhes: título até 255 e descrição até 2.500 → Thumbnail 1280×720 → Preço: grátis, recorrente ou único). Também é possível importar do Kajabi ou criar com IA. O curso **já nasce com uma estrutura de exemplo**: o módulo "Course Contents" com 5 aulas modelo (boas-vindas, O quê, Por quê, Como, Próximos passos), um **Welcome Badge** e uma **Course Completion Credential**. Esses dois são criados automaticamente em Credentials.

**Abas do editor (coluna à esquerda):**

| Aba | O que tem |
|---|---|
| Outline | Busca, sessão ao vivo, "+ Add Content" (módulo, **submódulo**, aula, **quiz**, **tarefa**, badge de boas-vindas, credencial, **importar de outro curso**), recolher/expandir, status de cada item (publicado ou rascunho) |
| Live Sessions | Sessões e **gravações**, cancelar sessões. Criar sessão em 3 passos (detalhes: nome, descrição, apresentador, thumbnail → agenda → avançado) |
| Settings | **Detalhes básicos** (título, descrição, thumbnail, tags, idioma, dificuldade, tema). **Instrutor** (título, nome, cargo, bio, foto 300²). **Customização** (logo 640², favicon). **Experiência de aprendizado** (autoplay da próxima aula e da primeira, **autoconclusão de aulas**, **legendas geradas por IA**, aplicar a todos os cursos). **Avançado** (JS e CSS customizados, códigos de rastreio no header e no footer) |
| Customize | Tema atual ("Neo Classic"), galeria de templates, meus templates, **construtor de tema** (abaixo) |
| Pricing | Grátis, recorrente ou único, página de checkout com link gerado automaticamente, editar checkout, preview |
| Offers | Ofertas (publicadas, rascunho), com título, tipo, preço e visibilidade |
| Comments | Moderação de comentários das aulas |
| Credentials | Certificado de conclusão e badge de matrícula, com gatilho e status |
| Community Groups | Vincular o curso a grupos de comunidade |

**Editores de conteúdo** (modal com a árvore do curso à esquerda):
- **Aula:** mídia por upload (vídeo .mp4/.webm/.mov até 5 GB; áudio .aac/.mp3/.wav até 2 GB), biblioteca de mídia, link ou embed. Nome, descrição em editor rico (títulos, formatação, listas, link, tabela, código, imagem), thumbnail da aula ou da mídia, **materiais para download**, status publicado ou rascunho, preview.
- **Quiz:** nome, perguntas em editor rico de **escolha única ou múltipla**, opções, marcar resposta correta, **explicação**, importar perguntas, thumbnail, **nota mínima para aprovação**, mensagem de conclusão.
- **Tarefa:** nome, instruções em editor rico, **material de apoio** (PDF, Word, Excel, imagens), thumbnail, **tarefa sem nota** (opcional), mensagem de conclusão obrigatória.

**Construtor de tema do curso** (`themes-overview/.../edit/theme`): edição visual com preview ao vivo, "Salvar como template" e Preview. Tem **2 páginas**:
- **Produto** (página do curso): Layout (cores, tipografia, imagem de fundo), Header (cores, busca), Hero (aparência, informações do curso), Body (bloco de categorias + blocos de imagem, texto, vídeo ou custom), Sidebar (progresso, instrutor + blocos de imagem, CTA, **cross-sell** ou custom).
- **Aula:** Layout, Breadcrumb, Player, Body (texto, CTA, card da próxima aula), Comentários (texto, CTA), Sidebar (conteúdo do curso, instrutor, downloads + blocos).

Cada seção tem "reset".

**Para o Graao:** o Graao já tem cursos com módulos, aulas, liberação gradual e progresso (commit `feat(courses)`). As principais lacunas são:
- estrutura de exemplo ao criar;
- submódulos;
- quiz com nota mínima;
- tarefas com material;
- sessões ao vivo com gravações;
- legendas por IA e autoconclusão;
- tema por curso com blocos de produto e de aula, salvo como template;
- checkout por curso;
- certificado e badge gerados automaticamente;
- importar do Kajabi ou de outro curso.

### 4.3 Construtor do app mobile da agência (Agency App Manager, percorrido por dentro)

Iniciado o "Custom Agency App" de rascunho "RASCUNHO GRAAO app" (domínio fictício `exemplo-graao.com`, pacote `com.exemplo-graao.rascunhograaoapp`). É um app Flutter Web, lido por screenshots. **Nada foi pago, conectado às lojas ou publicado**, e os dados pessoais do perfil de distribuição não foram preenchidos.

**Visão geral do projeto:** 6 cards com progresso: 1 Branding · 2 Customização · 3 Perfil · 4 Canal de distribuição · 5 Assinatura · 6 Lançar app (build e envio para revisão da Apple e do Google). Aviso: "conclua Branding e Customização e clique em Publicar".

**Agency App Manager** (layout em 3 colunas):
- **Esquerda:** passos (App Customization → Branding, Customization · Distribution → Profile, Channels · Subscription), **presets de customização** (partir de um pronto ou criar o seu) e **gerador de screenshots**.
- **Centro:** **preview num celular** com alternância **claro/escuro** e stepper da etapa atual.
- **Direita:** console da etapa.
- **Topo:** seletor de **versão** ("Default version"), Save & Next / Save e **Publish**.

| Etapa | Console |
|---|---|
| Branding (Essential Branding) | Nome do app (editável), **logo do app** 1024² (obrigatório), **cor primária** (hex), **fonte do app** (ex.: Roboto). O preview mostra o ícone na tela inicial do celular |
| Customização 1: Login Screen | Logo do login (modo claro e modo escuro, 1000×310), título ("Hello Again"), subtítulo, texto do botão |
| Customização 2: Core Navigation | **Barra superior** (Notificações, Perfil + Adicionar) e **barra inferior** (Home, Conversas, Busca, Calendário, Apps; **máximo de 5**, arrastar para reordenar, remover). Preview da Home: "Today at a Glance" (tarefas, valor do pipeline, mensagens não lidas, agendamentos do dia), **apps fixados** (editáveis), **ações rápidas** (enviar e-mail, agendar, criar fatura, ligar) |
| Customização 3: Apps | Tela "Apps" com **categorias** (adicionar, editar, remover, **reordenar**) e módulos dentro de cada uma: *Insights & Productivity* (Dashboard, Calendar, Tasks, Ask AI), *Communication* (Conversations, Calls, Contacts, Notifications), *Sales & Operations* (POS, Estimates, Invoices, Products…) + "Add More", com busca de apps no preview |
| Adicionar módulo | **Predefinidos** (18): Notifications, Home, Conversations, Calendar, Apps, Calls, Contacts, **POS**, Estimates, Invoices, Products, Opportunities, Documents, Social Planner, Reputation, Media Library, Manual Actions, Tasks. **Custom**: título, **URL**, ícone, abrir **dentro do app** ou **no navegador**, **quais subcontas** veem, **visibilidade por papel** |
| Distribution: Profile | Dados do responsável enviados à Apple e ao Google (nome, sobrenome, telefone, e-mail), e-mail e URL de suporte (aparecem na loja), endereço… |
| Distribution: Channels | **Apple App Store** e **Google Play**: status (conectado ou não), "Set Up" e guia de primeiros passos. Conecta o Agency App Manager às contas de desenvolvedor da agência |
| Subscription | **Whitelabel App + Zap**: trimestral US$ 1.491 (setup de US$ 497 grátis, suporte prioritário) ou mensal US$ 497. Inclui iOS e Android, marca, cores, logos, reordenar menu, todos os módulos do CRM, faturas e atualizações grátis |
| Gerador de screenshots | Etapas: escolha de aparelho → telas → … Abas iPhone/iPad/Android, modelos (iPhone 17 Pro/Pro Max, iPad Pro, Samsung S25 Ultra, Pixel 10 Pro), **9 telas** com texto sobreposto, "Download Assets" para as lojas |

**Para o Graao:** hoje o Graao tem o "Aplicativo móvel" na agência. Para chegar a esse nível, faltam:
- um app nativo único e configurável por agência (white-label), com tema, logos e login;
- navegação superior e inferior configurável e uma Home com indicadores;
- categorias de apps;
- módulos custom por URL com visibilidade por subconta e papel;
- presets;
- versões;
- gerador de screenshots;
- pipeline de publicação nas lojas.

O modelo de cobrança (assinatura por agência) precisa de decisão de produto.

### Rascunhos criados na subconta "La Vaca Estudio" (para limpeza)

- **Workflow** "New Workflow : 1795194497468": já movido para "Deleted". Pode ser restaurado por 30 dias; depois disso é apagado de vez.
- **Formulário** "Form 1"
- **Survey** "Survey 0"
- **Quiz** "Quiz 0"
- **Funil** "RASCUNHO GRAAO - mapeamento", com a etapa "Pagina rascunho"
- **Campanha de e-mail** "Untitled campaign name"
- **Documento** "New Document"
- **Agente Voice AI** "My Agent 447"
- **Relatório** "My report - 2026 Nov 20"
- **Grupo de comunidade** "RASCUNHO GRAAO comunidade". Está como **grupo público** (padrão) e com Discovery ligado; só entra no diretório público com mais de 10 membros.

- **Curso** "RASCUNHO GRAAO curso" (gratuito), com as 5 aulas de exemplo, o quiz "Quiz rascunho" e a tarefa "Tarefa rascunho" em rascunho. Também gerou automaticamente o certificado "RASCUNHO GRAAO curso Completion Certificate" e o badge "Welcome Badge" em Credentials.

- **App mobile da agência** "RASCUNHO GRAAO app" (projeto de Custom Agency App, **no nível da agência**). A customização foi salva como rascunho com os valores padrão. Não está pago, não está conectado às lojas e não foi publicado.

Não foram salvos: agente de Conversation AI, certificado avulso, blog, countdown, QR, chat widget e brand board.
