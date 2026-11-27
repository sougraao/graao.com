// T.2 — Catálogo de conectores (como a aba "Apps" do editor de fluxos do GHL): cada app declara os próprios gatilhos e
// ações. Este arquivo só descreve (nomes, campos, como conecta); as chamadas ficam no servidor (connectors.mjs). Cada
// gatilho vira o tipo conn_<app>__<chave> e cada ação também, no grupo "Apps · <nome>" do editor de fluxos.
const f = (key, label, kind = 'text', extra = {}) => ({ key, label, kind, ...extra });
const lines = 'Uma linha por campo: Coluna = valor (aceita variáveis)';

// How each app connects. webhook: the app calls the Graao URL shown after connecting (with a secret when it signs).
export const connectors = [
  { id: 'slack', name: 'Slack', category: 'Comunicação', auth: [f('botToken', 'Bot token (xoxb-…)', 'password', { required: true }), f('signingSecret', 'Signing secret (para os gatilhos)', 'password')],
    help: 'Crie um app em api.slack.com, adicione os escopos chat:write, channels:manage, channels:read, groups:read, users:read.email e instale no workspace. Para os gatilhos, ative Event Subscriptions com a URL abaixo.',
    triggers: [
      { key: 'message', label: 'Nova mensagem no canal (instantâneo)', fields: [f('channel', 'ID do canal (opcional)'), f('keyword', 'Contém a palavra')] },
      { key: 'direct_message', label: 'Nova mensagem direta (instantâneo)', fields: [f('keyword', 'Contém a palavra')] },
      { key: 'mention', label: 'Nova menção (instantâneo)', fields: [] },
      { key: 'reaction', label: 'Nova reação (instantâneo)', fields: [f('reaction', 'Emoji (sem dois-pontos)')] },
      { key: 'member_joined', label: 'Usuário convidado para o canal (instantâneo)', fields: [f('channel', 'ID do canal (opcional)')] }
    ],
    actions: [
      { key: 'send_message', label: 'Enviar mensagem', fields: [f('channel', 'Canal (ID ou #nome)', 'text', { required: true }), f('text', 'Mensagem', 'textarea', { required: true })], outputs: ['ts', 'channel'] },
      { key: 'update_message', label: 'Atualizar mensagem', fields: [f('channel', 'Canal (ID)', 'text', { required: true }), f('ts', 'ID da mensagem (ts)', 'text', { required: true }), f('text', 'Novo texto', 'textarea', { required: true })], outputs: ['ts'] },
      { key: 'create_channel', label: 'Criar canal', fields: [f('name', 'Nome do canal', 'text', { required: true }), f('private', 'Privado', 'select', { options: [['no', 'Não'], ['yes', 'Sim']] })], outputs: ['channel'] },
      { key: 'invite_user', label: 'Convidar usuário para o canal', fields: [f('channel', 'Canal (ID)', 'text', { required: true }), f('user', 'Usuário (ID)', 'text', { required: true })], outputs: ['channel'] },
      { key: 'find_channel', label: 'Encontrar canal pelo nome', fields: [f('name', 'Nome do canal', 'text', { required: true })], outputs: ['channel'] },
      { key: 'find_user', label: 'Encontrar usuário pelo e-mail', fields: [f('email', 'E-mail', 'text', { required: true, value: '{{contact.email}}' })], outputs: ['user', 'name'] }
    ] },
  { id: 'google_sheets', name: 'Google Sheets', category: 'Produtividade', auth: [f('serviceAccount', 'Chave JSON da conta de serviço', 'textarea', { required: true })],
    help: 'No Google Cloud, crie uma conta de serviço com as APIs Google Sheets e Google Drive ativas, gere a chave JSON e compartilhe cada planilha com o e-mail da conta de serviço. A primeira linha da aba é o cabeçalho.',
    triggers: [
      { key: 'new_row', label: 'Nova linha na planilha (a cada 5 min)', poll: true, fields: [f('spreadsheetId', 'ID da planilha', 'text', { required: true }), f('sheet', 'Aba', 'text', { value: 'Página1' })] },
      { key: 'new_spreadsheet', label: 'Nova planilha (a cada 5 min)', poll: true, fields: [] },
      { key: 'new_worksheet', label: 'Nova aba (a cada 5 min)', poll: true, fields: [f('spreadsheetId', 'ID da planilha', 'text', { required: true })] }
    ],
    actions: [
      { key: 'add_row', label: 'Criar linha', fields: [f('spreadsheetId', 'ID da planilha', 'text', { required: true }), f('sheet', 'Aba', 'text', { value: 'Página1' }), f('values', lines, 'textarea', { required: true, placeholder: 'Nome = {{contact.name}}\nE-mail = {{contact.email}}' })], outputs: ['row'] },
      { key: 'add_rows', label: 'Criar várias linhas', fields: [f('spreadsheetId', 'ID da planilha', 'text', { required: true }), f('sheet', 'Aba', 'text', { value: 'Página1' }), f('rows', 'Linhas (uma por linha, colunas separadas por ;)', 'textarea', { required: true })], outputs: ['rows'] },
      { key: 'lookup_row', label: 'Procurar linha', fields: [f('spreadsheetId', 'ID da planilha', 'text', { required: true }), f('sheet', 'Aba', 'text', { value: 'Página1' }), f('column', 'Coluna', 'text', { required: true }), f('value', 'Valor', 'text', { required: true })], outputs: ['row', 'json'] },
      { key: 'lookup_rows', label: 'Procurar várias linhas', fields: [f('spreadsheetId', 'ID da planilha', 'text', { required: true }), f('sheet', 'Aba', 'text', { value: 'Página1' }), f('column', 'Coluna', 'text', { required: true }), f('value', 'Valor', 'text', { required: true })], outputs: ['count', 'rows', 'json'] },
      { key: 'update_row', label: 'Atualizar linha específica', fields: [f('spreadsheetId', 'ID da planilha', 'text', { required: true }), f('sheet', 'Aba', 'text', { value: 'Página1' }), f('row', 'Número da linha', 'text', { required: true }), f('values', lines, 'textarea', { required: true })], outputs: ['row'] },
      { key: 'update_rows', label: 'Atualizar várias linhas', fields: [f('spreadsheetId', 'ID da planilha', 'text', { required: true }), f('sheet', 'Aba', 'text', { value: 'Página1' }), f('rows', 'Números das linhas (ex.: 2, 5, 9)', 'text', { required: true }), f('values', lines, 'textarea', { required: true })], outputs: ['count'] },
      { key: 'update_by_lookup', label: 'Atualizar linha procurando um valor', fields: [f('spreadsheetId', 'ID da planilha', 'text', { required: true }), f('sheet', 'Aba', 'text', { value: 'Página1' }), f('column', 'Coluna para procurar', 'text', { required: true }), f('value', 'Valor procurado', 'text', { required: true }), f('values', lines, 'textarea', { required: true })], outputs: ['row'] },
      { key: 'clear_row', label: 'Limpar linha específica', fields: [f('spreadsheetId', 'ID da planilha', 'text', { required: true }), f('sheet', 'Aba', 'text', { value: 'Página1' }), f('row', 'Número da linha', 'text', { required: true })], outputs: ['row'] },
      { key: 'clear_by_lookup', label: 'Limpar linha procurando um valor', fields: [f('spreadsheetId', 'ID da planilha', 'text', { required: true }), f('sheet', 'Aba', 'text', { value: 'Página1' }), f('column', 'Coluna', 'text', { required: true }), f('value', 'Valor', 'text', { required: true })], outputs: ['row'] },
      { key: 'format_rows', label: 'Formatar linhas', fields: [f('spreadsheetId', 'ID da planilha', 'text', { required: true }), f('sheetId', 'ID da aba (número no fim do link, gid)', 'text', { value: '0' }), f('start', 'Da linha', 'text', { required: true }), f('end', 'Até a linha', 'text', { required: true }), f('color', 'Cor de fundo', 'text', { value: '#fff3bf' }), f('bold', 'Negrito', 'select', { options: [['no', 'Não'], ['yes', 'Sim']] })], outputs: [] },
      { key: 'remove_rows', label: 'Remover linhas', fields: [f('spreadsheetId', 'ID da planilha', 'text', { required: true }), f('sheetId', 'ID da aba (gid)', 'text', { value: '0' }), f('start', 'Da linha', 'text', { required: true }), f('end', 'Até a linha', 'text', { required: true })], outputs: [] }
    ] },
  { id: 'shopify', name: 'Shopify', category: 'Lojas', auth: [f('shop', 'Loja (minhaloja.myshopify.com)', 'text', { required: true }), f('accessToken', 'Token de acesso do app (Admin API)', 'password', { required: true }), f('apiSecret', 'Chave secreta do app (webhooks)', 'password', { required: true })],
    help: 'Crie um app personalizado na Shopify com acesso a pedidos e clientes. Em Notificações → Webhooks, crie "Criação de pedido" (JSON) apontando para a URL abaixo.',
    triggers: [{ key: 'order_placed', label: 'Pedido feito', contact: true, fields: [f('minTotal', 'Valor mínimo do pedido', 'text')] }],
    actions: [{ key: 'find_customer', label: 'Encontrar cliente pelo e-mail', fields: [f('email', 'E-mail', 'text', { required: true, value: '{{contact.email}}' })], outputs: ['customer', 'orders', 'spent'] }] },
  { id: 'tiktok_leads', name: 'TikTok Lead Generation', category: 'Anúncios', auth: [], help: 'No TikTok Ads Manager (Formulários instantâneos → Integrações → Webhook), cole a URL abaixo.',
    triggers: [{ key: 'form_submitted', label: 'Formulário do TikTok enviado', contact: true, fields: [f('form', 'Formulário contém (nome ou ID)')] }], actions: [] },
  { id: 'linkedin_leads', name: 'LinkedIn Lead Gen Forms', category: 'Anúncios', auth: [], help: 'Envie os leads dos formulários do LinkedIn para a URL abaixo (Lead Sync por webhook ou um integrador como o Make).',
    triggers: [{ key: 'form_submitted', label: 'Formulário do LinkedIn enviado', contact: true, fields: [f('form', 'Formulário contém (nome ou ID)')] }], actions: [] },
  { id: 'airtable', name: 'Airtable', category: 'Produtividade', auth: [f('token', 'Token pessoal (pat…)', 'password', { required: true })], help: 'Em airtable.com/create/tokens, crie um token com data.records:read e data.records:write e acesso às bases.',
    triggers: [{ key: 'new_record', label: 'Novo registro (a cada 5 min)', poll: true, fields: [f('baseId', 'ID da base (app…)', 'text', { required: true }), f('table', 'Tabela', 'text', { required: true })] }],
    actions: [
      { key: 'create_record', label: 'Criar registro', fields: [f('baseId', 'ID da base (app…)', 'text', { required: true }), f('table', 'Tabela', 'text', { required: true }), f('fields', lines, 'textarea', { required: true })], outputs: ['record'] },
      { key: 'find_record', label: 'Encontrar registro', fields: [f('baseId', 'ID da base (app…)', 'text', { required: true }), f('table', 'Tabela', 'text', { required: true }), f('formula', 'Fórmula (ex.: {E-mail} = "{{contact.email}}")', 'text', { required: true })], outputs: ['record', 'json'] },
      { key: 'update_record', label: 'Atualizar registro', fields: [f('baseId', 'ID da base (app…)', 'text', { required: true }), f('table', 'Tabela', 'text', { required: true }), f('record', 'ID do registro (rec…)', 'text', { required: true }), f('fields', lines, 'textarea', { required: true })], outputs: ['record'] }
    ] },
  { id: 'hubspot', name: 'HubSpot', category: 'CRM', auth: [f('token', 'Token do app privado', 'password', { required: true })], help: 'Em Configurações → Integrações → Apps privados, crie um app com crm.objects.contacts e crm.objects.deals (leitura e escrita).',
    triggers: [],
    actions: [
      { key: 'upsert_contact', label: 'Criar ou atualizar contato', fields: [f('email', 'E-mail', 'text', { required: true, value: '{{contact.email}}' }), f('firstname', 'Nome', 'text', { value: '{{contact.first_name}}' }), f('lastname', 'Sobrenome', 'text', { value: '{{contact.last_name}}' }), f('phone', 'Telefone', 'text', { value: '{{contact.phone}}' })], outputs: ['id'] },
      { key: 'create_deal', label: 'Criar negócio', fields: [f('name', 'Nome do negócio', 'text', { required: true }), f('amount', 'Valor', 'text'), f('stage', 'Etapa (ID)', 'text', { value: 'appointmentscheduled' })], outputs: ['id'] }
    ] },
  { id: 'notion', name: 'Notion', category: 'Produtividade', auth: [f('token', 'Token da integração (secret_… ou ntn_…)', 'password', { required: true })], help: 'Crie uma integração interna em notion.so/my-integrations e conecte o banco de dados a ela (… → Conexões).',
    triggers: [], actions: [{ key: 'create_page', label: 'Criar página no banco de dados', fields: [f('database', 'ID do banco de dados', 'text', { required: true }), f('titleProperty', 'Propriedade do título', 'text', { value: 'Name' }), f('title', 'Título', 'text', { required: true, value: '{{contact.name}}' }), f('content', 'Conteúdo', 'textarea')], outputs: ['id', 'url'] }] },
  { id: 'asana', name: 'Asana', category: 'Projetos', auth: [f('token', 'Token de acesso pessoal', 'password', { required: true })], help: 'Em Asana → Console de desenvolvedor, crie um token de acesso pessoal.',
    triggers: [], actions: [{ key: 'create_task', label: 'Criar tarefa', fields: [f('project', 'ID do projeto', 'text', { required: true }), f('name', 'Tarefa', 'text', { required: true }), f('notes', 'Descrição', 'textarea'), f('due', 'Prazo (AAAA-MM-DD)', 'text')], outputs: ['id', 'url'] }] },
  { id: 'clickup', name: 'ClickUp', category: 'Projetos', auth: [f('token', 'Token pessoal (pk_…)', 'password', { required: true })], help: 'Em ClickUp → Configurações → Apps, gere o token pessoal.',
    triggers: [], actions: [{ key: 'create_task', label: 'Criar tarefa', fields: [f('list', 'ID da lista', 'text', { required: true }), f('name', 'Tarefa', 'text', { required: true }), f('description', 'Descrição', 'textarea')], outputs: ['id', 'url'] }] },
  { id: 'todoist', name: 'Todoist', category: 'Projetos', auth: [f('token', 'Token da API', 'password', { required: true })], help: 'Em Todoist → Configurações → Integrações → Desenvolvedor, copie o token.',
    triggers: [], actions: [{ key: 'create_task', label: 'Criar tarefa', fields: [f('content', 'Tarefa', 'text', { required: true }), f('description', 'Descrição', 'textarea'), f('due', 'Prazo (ex.: amanhã 10h)', 'text'), f('project', 'ID do projeto (opcional)', 'text')], outputs: ['id', 'url'] }] },
  { id: 'linear', name: 'Linear', category: 'Projetos', auth: [f('apiKey', 'Chave da API (lin_api_…)', 'password', { required: true })], help: 'Em Linear → Settings → API, crie uma chave pessoal.',
    triggers: [], actions: [{ key: 'create_issue', label: 'Criar issue', fields: [f('team', 'ID do time', 'text', { required: true }), f('title', 'Título', 'text', { required: true }), f('description', 'Descrição', 'textarea')], outputs: ['id', 'url'] }] },
  { id: 'jira', name: 'Jira', category: 'Projetos', auth: [f('site', 'Site (suaempresa.atlassian.net)', 'text', { required: true }), f('email', 'E-mail da conta', 'text', { required: true }), f('token', 'Token da API', 'password', { required: true })], help: 'Gere o token em id.atlassian.com/manage-profile/security/api-tokens.',
    triggers: [], actions: [{ key: 'create_issue', label: 'Criar issue', fields: [f('project', 'Chave do projeto', 'text', { required: true }), f('summary', 'Resumo', 'text', { required: true }), f('description', 'Descrição', 'textarea'), f('type', 'Tipo', 'text', { value: 'Task' })], outputs: ['key', 'url'] }] },
  { id: 'monday', name: 'Monday.com', category: 'Projetos', auth: [f('token', 'Token da API', 'password', { required: true })], help: 'No Monday, abra seu avatar → Desenvolvedores → Meus tokens.',
    triggers: [], actions: [{ key: 'create_item', label: 'Criar item', fields: [f('board', 'ID do quadro', 'text', { required: true }), f('name', 'Nome do item', 'text', { required: true })], outputs: ['id'] }] },
  { id: 'basecamp', name: 'Basecamp', category: 'Projetos', auth: [f('account', 'ID da conta', 'text', { required: true }), f('token', 'Token de acesso (OAuth)', 'password', { required: true })], help: 'Use um token OAuth do Basecamp 4 (launchpad.37signals.com) e o número da conta que aparece no endereço.',
    triggers: [], actions: [{ key: 'create_todo', label: 'Criar tarefa (to-do)', fields: [f('project', 'ID do projeto', 'text', { required: true }), f('list', 'ID da lista de tarefas', 'text', { required: true }), f('content', 'Tarefa', 'text', { required: true }), f('description', 'Descrição', 'textarea')], outputs: ['id', 'url'] }] },
  { id: 'klaviyo', name: 'Klaviyo', category: 'Marketing', auth: [f('apiKey', 'Chave privada da API (pk_…)', 'password', { required: true })], help: 'Em Klaviyo → Configurações → Chaves de API, crie uma chave privada com acesso a perfis, listas e eventos.',
    triggers: [],
    actions: [
      { key: 'add_to_list', label: 'Adicionar perfil à lista', fields: [f('list', 'ID da lista', 'text', { required: true }), f('email', 'E-mail', 'text', { required: true, value: '{{contact.email}}' }), f('phone', 'Telefone', 'text', { value: '{{contact.phone}}' })], outputs: [] },
      { key: 'track_event', label: 'Registrar evento', fields: [f('metric', 'Nome do evento', 'text', { required: true }), f('email', 'E-mail', 'text', { required: true, value: '{{contact.email}}' }), f('properties', lines, 'textarea')], outputs: [] }
    ] },
  { id: 'housecall_pro', name: 'Housecall Pro', category: 'Serviços', auth: [f('apiKey', 'Chave da API', 'password', { required: true })], help: 'Em Housecall Pro → App Store → API, gere a chave.',
    triggers: [], actions: [{ key: 'create_customer', label: 'Criar cliente', fields: [f('first_name', 'Nome', 'text', { value: '{{contact.first_name}}' }), f('last_name', 'Sobrenome', 'text', { value: '{{contact.last_name}}' }), f('email', 'E-mail', 'text', { value: '{{contact.email}}' }), f('phone', 'Celular', 'text', { value: '{{contact.phone}}' })], outputs: ['id'] }] },
  { id: 'calendly', name: 'Calendly', category: 'Agendamento', auth: [f('signingKey', 'Chave de assinatura do webhook (opcional)', 'password')], help: 'Crie a inscrição de webhook (invitee.created e invitee.canceled) apontando para a URL abaixo.',
    triggers: [{ key: 'invitee_created', label: 'Evento agendado', contact: true, fields: [f('event', 'Tipo de evento contém')] }, { key: 'invitee_canceled', label: 'Evento cancelado', contact: true, fields: [f('event', 'Tipo de evento contém')] }], actions: [] },
  { id: 'calcom', name: 'Cal.com', category: 'Agendamento', auth: [f('secret', 'Segredo do webhook (opcional)', 'password')], help: 'Em Cal.com → Configurações → Desenvolvedor → Webhooks, crie um webhook com a URL abaixo.',
    triggers: [{ key: 'booking_created', label: 'Reserva criada', contact: true, fields: [f('event', 'Tipo de evento contém')] }, { key: 'booking_cancelled', label: 'Reserva cancelada', contact: true, fields: [f('event', 'Tipo de evento contém')] }], actions: [] },
  { id: 'typeform', name: 'Typeform', category: 'Formulários', auth: [f('secret', 'Segredo do webhook (opcional)', 'password')], help: 'No formulário → Connect → Webhooks, adicione a URL abaixo (e o segredo, se quiser assinatura).',
    triggers: [{ key: 'form_response', label: 'Resposta enviada', contact: true, fields: [f('form', 'Formulário contém (título ou ID)')] }], actions: [] },
  { id: 'jotform', name: 'Jotform', category: 'Formulários', auth: [], help: 'No formulário → Configurações → Integrações → WebHooks, cole a URL abaixo.',
    triggers: [{ key: 'submission', label: 'Envio do formulário', contact: true, fields: [f('form', 'Formulário contém (título ou ID)')] }], actions: [] },
  { id: 'google_forms', name: 'Google Forms', category: 'Formulários', auth: [], help: 'No formulário, abra Extensões → Apps Script e cole o script mostrado depois de conectar: cada resposta vai para a URL abaixo.',
    triggers: [{ key: 'response', label: 'Resposta enviada', contact: true, fields: [f('form', 'Formulário contém (título)')] }], actions: [] },
  { id: 'fathom', name: 'Fathom', category: 'Reuniões', auth: [], help: 'Em Fathom → Configurações → Integrações → Webhooks, cole a URL abaixo.',
    triggers: [{ key: 'meeting_ready', label: 'Resumo da reunião pronto', contact: true, fields: [] }], actions: [] },
  { id: 'apify', name: 'Apify', category: 'Dados', auth: [f('token', 'Token da API', 'password', { required: true })], help: 'Em console.apify.com → Settings → Integrations, copie o token.',
    triggers: [], actions: [{ key: 'run_actor', label: 'Rodar ator', fields: [f('actor', 'Ator (usuario~nome)', 'text', { required: true }), f('input', 'Entrada (JSON)', 'textarea', { value: '{}' })], outputs: ['run', 'dataset', 'status'] }] },
  { id: 'browse_ai', name: 'Browse AI', category: 'Dados', auth: [f('apiKey', 'Chave da API', 'password', { required: true })], help: 'Em dashboard.browse.ai → API, copie a chave.',
    triggers: [], actions: [{ key: 'run_robot', label: 'Rodar robô', fields: [f('robot', 'ID do robô', 'text', { required: true }), f('input', 'Parâmetros (JSON)', 'textarea', { value: '{}' })], outputs: ['task', 'status'] }] },
  { id: 'mistral', name: 'Mistral AI', category: 'IA', auth: [f('apiKey', 'Chave da API', 'password', { required: true })], help: 'Em console.mistral.ai → API Keys, crie a chave.',
    triggers: [], actions: [{ key: 'chat', label: 'Perguntar ao modelo', fields: [f('model', 'Modelo', 'text', { value: 'mistral-small-latest' }), f('prompt', 'Pedido (aceita variáveis)', 'textarea', { required: true })], outputs: ['answer'] }] },
  { id: 'openrouter', name: 'OpenRouter', category: 'IA', auth: [f('apiKey', 'Chave da API', 'password', { required: true })], help: 'Em openrouter.ai/keys, crie a chave.',
    triggers: [], actions: [{ key: 'chat', label: 'Perguntar ao modelo', fields: [f('model', 'Modelo', 'text', { value: 'openai/gpt-4o-mini' }), f('prompt', 'Pedido (aceita variáveis)', 'textarea', { required: true })], outputs: ['answer'] }] }
];

export const connectorById = id => connectors.find(row => row.id === id);
export const connectorType = (id, key) => `conn_${id}__${key}`;
/** conn_<app>__<key> → { connector, key, spec, kind } (kind: 'trigger' or 'action'). */
export function connectorStep(type) {
  const match = String(type || '').match(/^conn_([a-z_]+?)__([a-z_]+)$/);
  const connector = match && connectorById(match[1]);
  if (!connector) return null;
  const trigger = connector.triggers.find(row => row.key === match[2]), action = connector.actions.find(row => row.key === match[2]);
  return trigger || action ? { connector, key: match[2], spec: trigger || action, kind: trigger ? 'trigger' : 'action' } : null;
}
const usesWebhook = c => c.triggers.some(t => !t.poll);

/** The editor groups ("Apps · <nome>"): every trigger and action of every connector. */
export const connectorTriggerGroups = () => connectors.filter(c => c.triggers.length).map(c => ({ group: `Apps · ${c.name}`, items: c.triggers.map(t => ({
  type: connectorType(c.id, t.key), label: t.label, icon: 'apps', connector: c.id,
  description: `${t.poll ? 'Consultado a cada 5 minutos' : usesWebhook(c) ? 'Chega pelo webhook do app' : ''}${t.contact ? ', com o contato achado (ou criado) pelo e-mail ou telefone' : ''}. Conecte o ${c.name} em Configurações → Conectores. Os dados ficam em {{trigger.*}}.`,
  fields: t.fields })) }));
export const connectorActionGroups = () => connectors.filter(c => c.actions.length).map(c => ({ group: `Apps · ${c.name}`, items: c.actions.map(a => ({
  type: connectorType(c.id, a.key), label: a.label, icon: 'apps', connector: c.id,
  description: `Usa a conexão do ${c.name} (Configurações → Conectores).${a.outputs.length ? ` O resultado fica em ${a.outputs.map(o => `{{vars.${c.id}_${o}}}`).join(', ')}.` : ''}`,
  fields: a.fields })) }));
