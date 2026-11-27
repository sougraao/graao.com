// Shared by the server (validation) and the browser (forms and catalogs).
// Every catalog entry below is written for this local project; no record is copied from the original service.

export const agencyRoles = ['Agency Owner', 'Agency Admin', 'Agency User', 'Account Admin', 'Account User'];
export const agencyLevel = role => role.startsWith('Agency');

// Menu lateral da agência: [chave, rótulo, ícone, grupo]. O grupo decide a seção do menu (agencyNavGroups);
// a ordem dentro da seção é a desta lista. 'rodape' fica embaixo, fora das seções.
export const agencyNav = [
  ['dashboard', 'Painel da agência', 'grid', 'inicio'], ['ask', 'Pergunte à Graao', 'spark', 'inicio'], ['ai-suite', 'Central de IA', 'studio', 'inicio'],
  ['accounts', 'Subcontas', 'users', 'clientes'], ['brand-groups', 'Grupos de marcas', 'tag', 'clientes'], ['snapshots', 'Setups de conta', 'box', 'clientes'], ['saas', 'Configurador SaaS', 'sliders', 'clientes'],
  ['prospecting', 'Prospecção', 'search', 'vendas'], ['presentations', 'Apresentações', 'play', 'vendas'], ['prancheta', 'Prancheta', 'palette', 'vendas'], ['affiliate', 'Portal de afiliados', 'link', 'vendas'], ['partners', 'Parceiros', 'award', 'vendas'],
  ['mobile-app', 'Aplicativo móvel', 'mobile', 'apps'], ['desktop-app', 'Aplicativo desktop', 'monitor', 'apps'],
  ['ideas', 'Ideias e sugestões', 'bulb', 'ajuda'],
  ['settings', 'Configurações', 'gear', 'rodape']
];

export const agencyNavGroups = [['inicio', 'Início'], ['clientes', 'Clientes'], ['vendas', 'Vendas'], ['apps', 'Apps'], ['ajuda', 'Ajuda']];

// Central de ajuda (docs-site/): o menu da agência leva para cá no lugar da antiga Universidade.
export const helpCenterUrl = 'https://doc.graao.com/';

export const subAccountModules = [
  ['dashboard', 'Painel'], ['conversations', 'Conversas'], ['calendars', 'Calendários'], ['contacts', 'Contatos'],
  ['opportunities', 'Oportunidades'], ['payments', 'Pagamentos'], ['ai-agents', 'Agentes de IA'],
  ['marketing', 'Marketing'], ['automation', 'Automação'], ['sites', 'Sites e Funis'], ['memberships', 'Área de Membros'],
  ['media', 'Arquivos e Mídia'], ['reputation', 'Reputação'], ['reporting', 'Relatórios'],
  ['settings', 'Configurações']
];

// [scope, label]: what a private integration may do, in the public API (contacts and sub-accounts) and in the MCP server.
export const apiScopes = [
  ['subaccounts.read', 'Listar subcontas'], ['contacts.read', 'Ver contatos e tarefas'], ['contacts.write', 'Criar e mudar contatos e tarefas'],
  ['opportunities.read', 'Ver funis e oportunidades'], ['opportunities.write', 'Criar e mover oportunidades'],
  ['conversations.read', 'Ler conversas'], ['conversations.write', 'Enviar mensagens e anotar'],
  ['calendars.read', 'Ver compromissos'], ['calendars.write', 'Marcar e cancelar compromissos'],
  ['marketing.read', 'Ver redes e posts'], ['marketing.write', 'Criar, aprovar e agendar posts'],
  ['automation.read', 'Ver fluxos'], ['automation.write', 'Inscrever contatos em fluxos'],
  ['payments.read', 'Ver faturas'], ['sites.read', 'Ver sites']
];

// Record key of a sub-account mutation → module that must be permitted for the acting user.
export const moduleOfRecord = {
  contacts: 'contacts', tasks: 'contacts', opportunities: 'opportunities', appointments: 'calendars', services: 'calendars', resources: 'calendars', meetings: 'calendars', workflows: 'automation',
  workflowFolders: 'automation', workflowLists: 'automation',
  invoices: 'payments', campaigns: 'marketing', emailTemplates: 'marketing', emailCampaigns: 'marketing', emailSequences: 'marketing', loyaltyRewards: 'marketing', loyaltyLedger: 'marketing', loyalty: 'marketing', preferences: 'settings', countdownTimers: 'marketing', pages: 'sites', forms: 'sites', chatWidgets: 'sites', chatSessions: 'sites', blogs: 'sites', blogPosts: 'sites', blogAuthors: 'sites', blogCategories: 'sites', stores: 'sites', orders: 'payments', webinars: 'sites', webinarRegistrations: 'sites', qrCodes: 'sites', courses: 'memberships', communities: 'memberships', communityEvents: 'memberships', credentialsIssued: 'memberships', certificateTemplates: 'memberships', offers: 'memberships', reviews: 'reputation',
  agents: 'ai-agents', agentRuns: 'ai-agents', knowledgeBases: 'ai-agents', agentTemplatesCustom: 'ai-agents', ai: 'ai-agents', brandBoards: 'marketing', affiliateSettings: 'marketing', affiliateCampaigns: 'marketing', affiliates: 'marketing', affiliateCommissions: 'marketing', affiliatePayouts: 'marketing',
  reputation: 'reputation', listings: 'reputation', reviewRequests: 'reputation', reviewWidgets: 'reputation', videoCollectors: 'reputation', videoTestimonials: 'reputation', videoUploads: 'reputation', files: 'media', mediaFolders: 'media', snippetFolders: 'conversations', tickets: 'conversations', contactTrash: 'contacts', snippets: 'conversations', triggerLinks: 'conversations',
  studioProjects: 'sites', pipelines: 'opportunities', stages: 'opportunities',
  customFields: 'settings', customValues: 'settings', tags: 'contacts', companies: 'contacts',
  scoringRules: 'settings', tracking: 'settings', trackingEvents: 'settings',
  adSettings: 'marketing', adCampaigns: 'marketing', adStats: 'marketing', attributionEvents: 'reporting',
  products: 'payments', paymentLinks: 'payments', subscriptions: 'payments', transactions: 'payments', coupons: 'payments',
  documents: 'payments', documentTemplates: 'payments', contentBlocks: 'payments', estimates: 'payments', invoiceTemplates: 'payments', recurringInvoices: 'payments', abandonedCheckouts: 'payments', productCollections: 'payments', productReviews: 'payments', giftCards: 'payments', inventoryLog: 'payments',
  socialCategories: 'marketing', socialHashtags: 'marketing', socialFeeds: 'marketing', socialWebhooks: 'marketing', socialCompetitors: 'marketing',
  pranchetaFiles: 'marketing', eventPlans: 'marketing'
};

export const accountStatuses = ['Active', 'Paused', 'Closed'];
export const prospectStatuses = ['New', 'Contacted', 'Proposal sent', 'Won', 'Lost'];
export const auditAreas = [['website', 'Site'], ['reviews', 'Avaliações'], ['listings', 'Listagens'], ['social', 'Redes sociais'], ['ads', 'Anúncios pagos']];

// [key, label, type, required, options]
// Option tokens: '@accounts' (sub-accounts), '@modules' (sub-account modules).
export const collections = {
  prospects: { label: 'Prospect', max: 500, fields: [
    ['name', 'Nome da empresa', 'text', true], ['website', 'Site', 'url'], ['category', 'Categoria', 'text'], ['city', 'Cidade', 'text'],
    ['email', 'E-mail', 'email'], ['phone', 'Telefone', 'tel'], ['status', 'Status', 'select', true, prospectStatuses],
    ...auditAreas.map(([key, label]) => [`score_${key}`, `Pontuação em ${label} (0–10)`, 'score']),
    ['notes', 'Observações', 'textarea']
  ] },
  partners: { label: 'Parceiro', max: 200, fields: [
    ['name', 'Nome do parceiro', 'text', true], ['service', 'Serviço', 'select', true, ['Design', 'Development', 'Paid ads', 'Copywriting', 'Consulting', 'Other']],
    ['contact', 'Pessoa de contato', 'text'], ['email', 'E-mail', 'email'], ['website', 'Site', 'url'], ['notes', 'Observações', 'textarea']
  ] },
  ideas: { label: 'Ideia', max: 300, fields: [
    ['title', 'Título', 'text', true], ['category', 'Área', 'select', true, ['CRM', 'Conversations', 'Automation', 'Sites', 'Payments', 'Reporting', 'Mobile', 'Other']],
    ['body', 'Descrição', 'textarea', true]
  ] },
  menuLinks: { label: 'Link de menu personalizado', max: 30, fields: [
    ['title', 'Título do link', 'text', true], ['url', 'URL', 'url', true], ['icon', 'Ícone', 'select', true, ['external', 'grid', 'chart', 'folder', 'help', 'star']],
    ['openIn', 'Abrir em', 'select', true, ['New tab', 'Inside the app']], ['showOn', 'Exibir em', 'select', true, ['Sub-accounts', 'Agency', 'Both']],
    ['accounts', 'Subcontas (nenhuma selecionada = todas)', 'multi', false, '@accounts']
  ] },
  announcements: { label: 'Comunicado', max: 100, fields: [
    ['title', 'Título', 'text', true], ['body', 'Mensagem', 'textarea', true], ['tone', 'Estilo', 'select', true, ['Information', 'Success', 'Warning']],
    ['accounts', 'Subcontas (nenhuma selecionada = todas)', 'multi', false, '@accounts'], ['published', 'Publicado', 'check']
  ] },
  users: { label: 'Usuário', max: 100, fields: [
    ['first', 'Nome', 'text', true], ['last', 'Sobrenome', 'text', true], ['email', 'E-mail', 'email', true], ['phone', 'Telefone', 'tel'],
    ['role', 'Função', 'select', true, agencyRoles], ['accounts', 'Acesso a subcontas (funções de conta)', 'multi', false, '@accounts'],
    ['permissions', 'Permissões de módulos', 'multi', false, '@modules']
  ] },
  plans: { label: 'Plano SaaS', max: 20, fields: [
    ['name', 'Nome do plano', 'text', true], ['price', 'Preço mensal (R$)', 'number', true], ['trialDays', 'Dias de teste', 'number'],
    ['features', 'Recursos inclusos (um por linha)', 'textarea']
  ] },
  referrals: { label: 'Indicação', max: 500, fields: [
    ['name', 'Empresa indicada', 'text', true], ['email', 'E-mail', 'email'], ['plan', 'Plano', 'select', true, ['Starter', 'Unlimited', 'Pro']],
    ['amount', 'Assinatura mensal (R$)', 'number', true], ['status', 'Status', 'select', true, ['Trial', 'Active', 'Cancelled']]
  ] }
};

export const affiliateRate = 0.4;

// Reselling products. `base` is the agency cost per month (0 when the cost depends on usage).
export const resellProducts = [
  { key: 'ad-manager', name: 'Ad Manager', base: 0, kind: 'Subscription', text: 'Manage paid ad campaigns from inside a sub-account.' },
  { key: 'ai-employee', name: 'AI Employee', base: 97, kind: 'Subscription + usage', text: 'Unlimited AI features for the subscribed sub-account.' },
  { key: 'client-portal-app', name: 'Branded Client Portal App', base: 0, kind: 'Subscription', text: 'Client portal app published under your brand.' },
  { key: 'dedicated-ip', name: 'Dedicated IP', base: 0, kind: 'Subscription', text: 'Dedicated sending IP for email reputation.' },
  { key: 'listings', name: 'Listings', base: 30, kind: 'Subscription', text: 'Business listing distribution to directories.' },
  { key: 'prospecting', name: 'Prospecting', base: 0, kind: 'Subscription', text: 'Prospect audit reports inside the sub-account.' },
  { key: 'seo', name: 'SEO', base: 0, kind: 'Subscription', text: 'Search ranking reports and site audits.' },
  { key: 'whatsapp', name: 'WhatsApp', base: 0, kind: 'Subscription + usage', text: 'WhatsApp messaging in Conversations.' },
  { key: 'wordpress', name: 'WordPress', base: 0, kind: 'Subscription', text: 'Managed WordPress hosting.' },
  { key: 'workflow-pro', name: 'Workflow Pro', base: 0, kind: 'Subscription + usage', text: 'Premium workflow actions and triggers.' }
];

export const addOns = [
  { key: 'zapier', group: 'Custom branding', name: 'White-label automation connector', price: 50, period: '/mo', points: ['Your brand on the connector listing', 'Branded automations for clients'] },
  { key: 'mobile', group: 'Custom branding', name: 'White-label mobile app', price: 497, period: '/mo', points: ['Custom login screen and layout', 'Color palette and module order', 'Custom modules from your URLs'] },
  { key: 'hipaa', group: 'Compliance', name: 'Health data compliance', price: 297, period: '/mo', points: ['Business associate agreement', 'Stricter data controls for health clients'] },
  { key: 'premium-support', group: 'Setup & support', name: 'Premium support', price: 500, period: '/mo', points: ['Dedicated account manager', 'Private support channel', 'Quarterly business reviews'] },
  { key: 'advanced-setup', group: 'Setup & support', name: 'Advanced account setup', price: 1000, period: ' one-time', points: ['Five consulting sessions', 'Done-with-you CRM and dashboard setup', 'Team onboarding'] }
];

export const agencyPlans = [['Starter', 97], ['Unlimited', 297], ['Agency Pro', 497]];

export const integrationCatalog = [
  ['abacatepay', 'AbacatePay', 'pay', 'Payments', 'Collect invoices, store orders and SaaS subscriptions by Pix or card.'],
  ['google', 'Google Workspace', 'cal', 'Calendars', 'Calendar sync and Business Profile reviews.'],
  ['meta', 'Meta', 'send', 'Social', 'Facebook and Instagram messages, leads and posts.'],
  ['twilio', 'Twilio', 'chat', 'Phone', 'SMS and voice through your own carrier account.'],
  ['mailgun', 'Mailgun', 'mail', 'Email', 'Transactional and campaign email delivery.'],
  ['quickbooks', 'QuickBooks', 'chart', 'Accounting', 'Sync invoices and payments to accounting.'],
  ['slack', 'Slack', 'chat', 'Team', 'Send workflow notifications to channels.'],
  ['zoom', 'Zoom', 'cal', 'Calendars', 'Video meeting links for appointments.'],
  ['shopify', 'Shopify', 'pay', 'Commerce', 'Import orders and customers.'],
  ['wordpress', 'WordPress', 'site', 'Sites', 'Embed forms and calendars on WordPress.']
];

export const systemEmailKeys = [
  ['welcome', 'Welcome email', 'Welcome to {{agency.name}}', 'Hi {{user.first_name}}, your account is ready. Sign in at {{agency.domain}}.'],
  ['password', 'Password reset', 'Reset your password', 'Hi {{user.first_name}}, use the link below to choose a new password.'],
  ['invite', 'User invitation', 'You were invited to {{agency.name}}', '{{inviter.name}} invited you to join {{account.name}}.'],
  ['appointment', 'Appointment reminder', 'Reminder: {{appointment.title}}', 'Your appointment starts at {{appointment.start}}.']
];

export const mobileModules = [['dashboard', 'Dashboard'], ['conversations', 'Conversations'], ['contacts', 'Contacts'], ['opportunities', 'Opportunities'], ['calendars', 'Calendars'], ['payments', 'Payments'], ['reputation', 'Reviews']];

export const snapshotAssets = [
  ['pipelines', 'Pipelines'], ['stages', 'Pipeline stages'], ['workflows', 'Workflows'], ['forms', 'Forms'], ['pages', 'Pages'],
  ['snippetFolders', 'Snippet folders'], ['snippets', 'Snippets'], ['triggerLinks', 'Trigger links'], ['courses', 'Courses'],
  ['agents', 'AI agents'], ['studioProjects', 'Studio projects'],
  // GHL parity: the account configuration that travels with a snapshot besides the funnels and automations.
  ['customFields', 'Custom fields'], ['customValues', 'Custom values'], ['tags', 'Tags'], ['services', 'Calendars'],
  ['knowledgeBases', 'Knowledge bases'], ['emailTemplates', 'Email templates'], ['documentTemplates', 'Documents & contracts'],
  ['chatWidgets', 'Chat widgets'], ['brandBoards', 'Brand boards']
];
// Asset types picked by default when a setup is created; the rest are opt-in.
export const snapshotAssetGroups = [
  ['Funis e automações', ['pipelines', 'stages', 'workflows', 'triggerLinks']],
  ['Sites e formulários', ['forms', 'pages', 'studioProjects', 'chatWidgets']],
  ['Conversas e marketing', ['snippetFolders', 'snippets', 'emailTemplates', 'brandBoards']],
  ['Dados da conta', ['customFields', 'customValues', 'tags']],
  ['Calendários e pagamentos', ['services', 'documentTemplates']],
  ['IA e cursos', ['agents', 'knowledgeBases', 'courses']]
];

export const marketplaceCategories = [
  'Saúde e Estética',
  'Imobiliário',
  'Agências e Serviços',
  'Educação e Infoprodutos',
  'Negócios Locais',
  'E-commerce',
  'B2B e SaaS',
  'Outro'
];

// SaaS Configurator: wallet products whose usage the agency can rebill with a markup (1× = at cost, up to 10×).
export const rebillProducts = [
  ['phone', 'Phone calls and SMS'], ['email', 'Email sending'], ['automations', 'Premium workflow actions'], ['ai', 'Conversation and content AI'],
  ['whatsapp', 'WhatsApp messages'], ['voice-ai', 'Voice AI minutes'], ['enrichment', 'Contact enrichment'], ['domains', 'Domain purchases']
];
export const maxMarkup = 10;
// Products whose usage is metered and charged to the sub-account wallets (7.1):
// [key, label, unit of the agency's cost, default cost, unit charged].
export const walletProducts = [
  ['ai', 'IA (agentes, conteúdo, resumos)', 'R$ por US$ 1 de consumo da OpenAI', 5.8, 'US$ de consumo'],
  ['email', 'E-mails enviados', 'R$ por 1.000 e-mails', 0.6, 'e-mail'],
  ['whatsapp', 'Mensagens de WhatsApp enviadas', 'R$ por mensagem', 0, 'mensagem'],
  ['phone', 'Ligações (Twilio)', 'R$ por minuto de ligação', 0.12, 'minuto']
];

// Per-sub-account switches shown on Settings tabs: [key, title, description, enabled by default].
export const subFeatures = [
  ['number-intelligence', 'Number Intelligence', 'Look up the line type and carrier of phone numbers before sending SMS.', false],
  ['workflow-premium', 'Workflow - Premium Features', 'Premium triggers and actions in the workflow builder of each sub-account.', true],
  ['external-ai', 'Workflow - External AI Models', 'Workflow actions that call external AI models from a sub-account.', true],
  ['domain-purchase', 'Domain Purchase', 'Let sub-accounts buy domains from inside Sites settings.', true]
];
export const workflowBuilders = ['Standard', 'Advanced'];
export const appScopes = ['Agency', 'Sub-account'];
