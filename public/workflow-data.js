// Workflows: the catalog shared by the engine (server) and the builder (browser) — triggers with their
// filters, actions with their fields, condition subjects and operators, and template variables.
import { tr } from './i18n.js';
import { connectorActionGroups, connectorTriggerGroups } from './connectors-data.js';

// Field kinds: text, textarea, number, select (static options), ref (options from workspace records), tags, time, datetime, conditions.
const f = (key, label, kind = 'text', extra = {}) => ({ key, label, kind, ...extra });

export const refSources = {
  phoneNumbers: s => (s.phone?.numbers || []).map(row => [row.id, row.name ? `${row.name} (${row.number})` : row.number]),
  forms: s => s.forms.filter(row => (row.kind || 'form') === 'form').map(row => [row.id, row.name]),
  surveys: s => s.forms.filter(row => row.kind === 'survey').map(row => [row.id, row.name]),
  quizzes: s => s.forms.filter(row => row.kind === 'quiz').map(row => [row.id, row.name]),
  links: s => s.triggerLinks.map(row => [row.id, row.name]),
  stages: s => s.stages.map(stage => [stage.id, [s.pipelines.find(p => p.id === stage.pipelineId)?.name, stage.name].filter(Boolean).map(tr).join(' / ')]),
  pipelines: s => s.pipelines.map(row => [row.id, tr(row.name)]),
  workflows: s => s.workflows.map(row => [row.id, row.name]),
  chats: s => (s.chatWidgets || []).map(row => [row.id, row.name]),
  webinars: s => (s.webinars || []).map(row => [row.id, row.name]),
  communities: s => (s.communities || []).map(row => [row.id, row.name]),
  privateChannels: s => (s.communities || []).flatMap(group => (group.channels || []).filter(channel => channel.private).map(channel => [`${group.id}:${channel.id}`, `${group.name} · #${channel.name}`])),
  courses: s => (s.courses || []).map(row => [row.id, row.name]),
  agents: s => (s.agents || []).filter(row => row.published).map(row => [row.id, row.name]),
  offers: s => (s.offers || []).map(row => [row.id, row.title]),
  sequences: s => (s.emailSequences || []).map(row => [row.id, row.name]),
  rewards: s => (s.loyaltyRewards || []).map(row => [row.id, row.name]),
  topics: s => (s.preferences?.topics || [{ id: 'novidades', name: 'Novidades' }, { id: 'promocoes', name: 'Promoções' }]).map(row => [row.id, row.name]),
  certificateTemplates: s => (s.certificateTemplates || []).filter(row => row.kind === 'certificate').map(row => [row.id, row.name]),
  badgeTemplates: s => (s.certificateTemplates || []).filter(row => row.kind === 'badge').map(row => [row.id, row.name]),
  communityEvents: s => (s.communityEvents || []).map(row => [row.id, `${row.title} · ${(s.communities || []).find(group => group.id === row.communityId)?.name || 'Comunidade'}`]),
  stores: s => (s.stores || []).map(row => [row.id, row.name]),
  sites: s => (s.studioProjects || []).map(row => [row.id, `${row.name} · ${row.kind === 'funnel' ? 'Funil' : 'Site'}`]),
  services: s => (s.services || []).map(row => [row.id, row.name]),
  coupons: s => (s.coupons || []).map(row => [row.id, `${row.code} · ${row.name}`]),
  customValues: s => (s.customValues || []).map(row => [row.id, row.name]),
  products: s => (s.products || []).filter(row => row.kind !== 'Recurring').map(row => [row.id, row.name]),
  documentTemplates: s => (s.documentTemplates || []).map(row => [row.id, row.title]),
  estimates: s => (s.estimates || []).map(row => [row.id, `${row.number} · ${row.title}`]),
  invoiceTemplates: s => (s.invoiceTemplates || []).map(row => [row.id, row.name]),
  emailCampaigns: s => (s.emailCampaigns || []).map(row => [row.id, row.name]),
  videoCollectors: s => (s.videoCollectors || []).map(row => [row.id, row.name]),
  affiliates: s => (s.affiliates || []).map(row => [row.id, `${row.name} (${row.code})`]),
  affiliateCampaigns: s => (s.affiliateCampaigns || []).map(row => [row.id, row.name]),
  socialCategories: s => (s.socialCategories || []).map(row => [row.id, row.name]),
  socialAccounts: s => (s.socialAccounts || []).map(row => [row.id, `${row.name}${row.handle ? ` (${row.handle})` : ''} · ${socialNetworks.find(([id]) => id === row.provider)?.[1] || row.provider}`]),
  dateFields: s => (s.customFields || []).filter(row => row.object === 'Contact' && row.type === 'Date').map(row => [row.id, row.name]),
  // The other sub-accounts this user can open (the app keeps them in c.workspaces).
  accounts: (s, c) => (c?.workspaces || []).filter(row => row.id !== c.workspace && !/^user-/.test(row.id)).map(row => [row.id, row.name]),
  contactFields: s => [['name', 'Nome'], ['email', 'E-mail'], ['phone', 'Telefone'], ['company', 'Empresa'], ...(s.customFields || []).filter(row => row.object === 'Contact').map(row => [`custom:${row.id}`, row.name])],
  numberFields: s => [['score', 'Pontuação do lead'], ...(s.customFields || []).filter(row => row.object === 'Contact' && ['Number', 'Monetary'].includes(row.type)).map(row => [`custom:${row.id}`, row.name])],
  textFields: s => [['name', 'Nome'], ['company', 'Empresa'], ...(s.customFields || []).filter(row => row.object === 'Contact' && ['Single line', 'Multi line'].includes(row.type)).map(row => [`custom:${row.id}`, row.name])]
};

const any = label => ['', label];
// Destino por resposta: o lead que caiu numa regra de desqualificação ou não.
const qualifiedField = f('qualified', 'Qualificação do lead', 'select', { options: [any('Qualificado ou não'), ['yes', 'Qualificado'], ['no', 'Desqualificado']] });
const socialNetworks = [['facebook', 'Facebook'], ['instagram', 'Instagram'], ['linkedin', 'LinkedIn'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['pinterest', 'Pinterest'], ['threads', 'Threads'], ['bluesky', 'Bluesky'], ['gbp', 'Google Business']];
export const channels = [['', 'Qualquer canal'], ['WhatsApp', 'WhatsApp'], ['SMS', 'SMS'], ['Email', 'E-mail'], ['Live chat', 'Chat ao vivo']];
const weekdays = [['1', 'Segunda'], ['2', 'Terça'], ['3', 'Quarta'], ['4', 'Quinta'], ['5', 'Sexta'], ['6', 'Sábado'], ['0', 'Domingo']];

export const triggerCatalog = [
  { group: 'Contato', items: [
    { type: 'contact_created', label: 'Contato criado', icon: 'contacts' },
    { type: 'contact_changed', label: 'Contato alterado', icon: 'edit', fields: [f('field', 'Campo alterado', 'ref', { source: 'contactFields', empty: 'Qualquer campo' })] },
    { type: 'contact_tag', label: 'Tag do contato', icon: 'tag', fields: [f('change', 'Quando a tag for', 'select', { options: [['added', 'Adicionada'], ['removed', 'Removida']] }), f('tag', 'Tag', 'text', { placeholder: 'Qualquer tag' })] },
    { type: 'contact_dnd', label: 'Não perturbe (DND)', icon: 'lock', fields: [f('state', 'Quando', 'select', { options: [['on', 'Ativado'], ['off', 'Desativado']] })] },
    { type: 'association_created', label: 'Associação criada', icon: 'link', description: 'Quando um contato é ligado a uma empresa do cadastro (no cadastro do contato, na importação ou pela ação Criar e associar empresa) ou quando uma oportunidade é ligada a um contato. Use {{trigger.title}} para o nome da empresa ou da oportunidade.', fields: [
      f('object', 'Associação', 'select', { options: [any('Empresa ou oportunidade'), ['company', 'Contato ligado a uma empresa'], ['opportunity', 'Oportunidade ligada a um contato']] })
    ] },
    { type: 'birthday_reminder', label: 'Lembrete de aniversário', icon: 'gift', scheduled: true, fields: [f('field', 'Campo de data de nascimento', 'ref', { source: 'dateFields', required: true }), f('days', 'Dias antes', 'number', { min: 0, max: 60, value: 0 }), f('time', 'Horário', 'time', { value: '09:00' })] },
    { type: 'custom_date_reminder', label: 'Lembrete de data personalizada', icon: 'cal', scheduled: true, fields: [f('field', 'Campo de data', 'ref', { source: 'dateFields', required: true }), f('offset', 'Dias em relação à data (negativo = antes)', 'number', { min: -365, max: 365, value: 0 }), f('time', 'Horário', 'time', { value: '09:00' })] },
    { type: 'note_added', label: 'Nota adicionada', icon: 'note' },
    { type: 'note_changed', label: 'Nota alterada', icon: 'note', description: 'Quando as notas do contato são editadas. Use {{trigger.body}} para o texto novo.', fields: [] },
    { type: 'task_added', label: 'Tarefa adicionada', icon: 'check' },
    { type: 'task_completed', label: 'Tarefa concluída', icon: 'check' },
    { type: 'task_reminder', label: 'Lembrete de tarefa', icon: 'clock', scheduled: true, description: 'Uma vez por dia, para as tarefas em aberto que vencem no dia escolhido.', fields: [f('days', 'Quantos dias antes do prazo', 'number', { value: 0, min: 0, max: 30 }), f('time', 'Horário', 'time', { value: '09:00' })] }
  ] },
  { group: 'Eventos', items: [
    { type: 'conversation_ai_event', label: 'Evento do bot de IA', icon: 'spark', description: 'Quando o bot de IA das conversas responde, sugere uma resposta, marca um horário, passa a conversa para a equipe ou encerra o atendimento. Use {{trigger.event}}, {{trigger.body}} e {{trigger.channel}}.', fields: [
      f('event', 'Evento', 'select', { options: [any('Qualquer evento'), ['replied', 'Respondeu'], ['suggested', 'Sugeriu uma resposta'], ['booked', 'Marcou um horário'], ['handoff', 'Passou para a equipe'], ['ended', 'Encerrou o atendimento']] }),
      f('agentId', 'Agente', 'ref', { source: 'agents', empty: 'Qualquer agente' })
    ] },
    { type: 'inbound_webhook', label: 'Webhook de entrada', icon: 'link', fields: [] },
    { type: 'ai_usage_alert', label: 'Uso de IA chegou ao alerta', icon: 'spark', description: 'Quando o gasto do mês com IA passa da faixa de alerta ou atinge o limite definido pela agência. Não tem contato: use ações internas. {{trigger.cost}} e {{trigger.limit}} trazem os valores em US$.', fields: [f('level', 'Quando', 'select', { options: [any('Alerta ou limite'), ['alert', 'Passar da faixa de alerta'], ['blocked', 'Atingir o limite']] })] },
    { type: 'scheduler', label: 'Agendador', icon: 'clock', scheduled: true, fields: [f('frequency', 'Frequência', 'select', { options: [['daily', 'Todo dia'], ['weekly', 'Toda semana']] }), f('weekday', 'Dia da semana', 'select', { options: weekdays, when: { frequency: 'weekly' } }), f('time', 'Horário', 'time', { value: '09:00' }), f('tag', 'Somente contatos com a tag', 'text', { placeholder: 'Obrigatório: limita quem entra', required: true })] },
    { type: 'customer_replied', label: 'Cliente respondeu', icon: 'chat', fields: [f('channel', 'Canal', 'select', { options: channels }), f('keyword', 'Contém a palavra', 'text', { placeholder: 'Ex.: QUERO' })] },
    { type: 'email_received', label: 'E-mail recebido', icon: 'mail', description: 'Quando chega um e-mail no endereço de Conversas da subconta (as respostas aos e-mails da equipe e dos fluxos vêm para cá). O contato é achado pelo e-mail ou criado. Use {{trigger.subject}}, {{trigger.from}} e {{trigger.body}}.', fields: [
      f('subject', 'Assunto contém', 'text', { placeholder: 'Ex.: orçamento' }),
      f('from', 'Remetente contém', 'text', { placeholder: 'Ex.: @empresa.com.br' })
    ] },
    { type: 'conversation_sla', label: 'SLA da conversa', icon: 'clock', description: 'Quando uma mensagem do cliente fica sem resposta até o prazo de SLA (perto de vencer ou vencido). Precisa do SLA ligado em Conversas → Configurações. Use {{trigger.minutes}} para os minutos sem resposta.', fields: [
      f('state', 'Quando', 'select', { options: [any('Perto de vencer ou vencido'), ['soon', 'Perto de vencer'], ['overdue', 'Vencido']] }),
      f('channel', 'Canal', 'select', { options: [any('Qualquer canal'), ['WhatsApp', 'WhatsApp'], ['Email', 'E-mail'], ['SMS', 'SMS'], ['Live chat', 'Chat ao vivo'], ['Instagram', 'Instagram'], ['Facebook', 'Facebook']] })
    ] },
    { type: 'custom_event', label: 'Evento personalizado', icon: 'flow', description: 'Quando outro fluxo usa a ação Disparar evento personalizado com este nome. Os dados enviados ficam em {{trigger.campo}} e o nome em {{trigger.event}}. Pode vir sem contato: aí use ações internas.', fields: [
      f('event', 'Nome do evento', 'text', { placeholder: 'Qualquer evento (ex.: pedido_aprovado)' })
    ] },
    { type: 'user_replied', label: 'Equipe respondeu', icon: 'chat', description: 'Quando alguém da equipe manda uma mensagem ao contato pela caixa de entrada (notas internas não contam). Use {{trigger.body}} para a mensagem e {{trigger.user}} para quem respondeu.', fields: [
      f('channel', 'Canal', 'select', { options: channels }), f('user', 'Usuário', 'text', { placeholder: 'Qualquer usuário (nome exato)' }), f('keyword', 'Contém a palavra', 'text', { placeholder: 'Ex.: proposta' })
    ] },
    { type: 'message_failed', label: 'Falha no envio de mensagem', icon: 'close', description: 'Quando uma mensagem de WhatsApp, e-mail, Messenger ou Direct da equipe ou de um fluxo não é entregue. Use {{trigger.reason}} para o motivo, {{trigger.channel}} para o canal e {{trigger.body}} para a mensagem. Fluxos com este gatilho não disparam de novo com as falhas das próprias mensagens.', fields: [
      f('channel', 'Canal', 'select', { options: [any('Qualquer canal'), ['WhatsApp', 'WhatsApp'], ['Email', 'E-mail'], ['Facebook', 'Messenger'], ['Instagram', 'Direct do Instagram']] }),
      f('reason', 'Motivo', 'select', { options: [any('Qualquer motivo'), ['not_connected', 'Canal desconectado'], ['no_phone', 'Contato sem telefone'], ['invalid_phone', 'Telefone inválido'], ['suspended', 'Conta suspensa'], ['no_email', 'Contato sem e-mail'], ['no_recipient', 'Contato ainda não escreveu nesse canal'], ['window_closed', 'Fora da janela de 24 horas'], ['provider_error', 'Erro do provedor']] })
    ] },
    { type: 'prospect_received', label: 'Prospect recebido da agência', icon: 'leads', description: 'Quando a agência envia um prospect da Prospecção para esta subconta (uma vez por prospect; reenviar não dispara de novo). O contato chega com a tag New Prospect Received. Use {{trigger.company}}, {{trigger.website}}, {{trigger.city}} e {{trigger.category}}.', fields: [
      f('isNew', 'Contato', 'select', { options: [any('Novo ou já existente'), ['yes', 'Contato novo'], ['no', 'Contato que já existia']] }),
      f('withOpportunity', 'Oportunidade', 'select', { options: [any('Com ou sem oportunidade'), ['yes', 'Com oportunidade criada'], ['no', 'Sem oportunidade']] }),
      f('category', 'Categoria do negócio contém', 'text', { placeholder: 'Qualquer categoria' })
    ] },
    { type: 'form_submitted', label: 'Formulário enviado', icon: 'list', fields: [f('formId', 'Formulário', 'ref', { source: 'forms', empty: 'Qualquer formulário' }), qualifiedField] },
    { type: 'survey_submitted', label: 'Pesquisa enviada', icon: 'chart', fields: [f('formId', 'Pesquisa', 'ref', { source: 'surveys', empty: 'Qualquer pesquisa' }), qualifiedField] },
    { type: 'quiz_submitted', label: 'Questionário enviado', icon: 'award', fields: [f('formId', 'Questionário', 'ref', { source: 'quizzes', empty: 'Qualquer questionário' }), f('tier', 'Faixa do resultado', 'text', { placeholder: 'Qualquer faixa' }), qualifiedField] },
    { type: 'email_event', label: 'Evento de e-mail', icon: 'mail', fields: [f('event', 'Quando o contato', 'select', { options: [any('Abrir, clicar ou sair da lista'), ['opened', 'Abrir o e-mail'], ['clicked', 'Clicar em um link'], ['unsubscribed', 'Cancelar a inscrição']] }),
      f('campaignId', 'Campanha', 'ref', { source: 'emailCampaigns', empty: 'Qualquer campanha' })] },
    { type: 'trigger_link_clicked', label: 'Link de rastreamento clicado', icon: 'link', fields: [f('linkId', 'Link', 'ref', { source: 'links', empty: 'Qualquer link' })] },
    { type: 'site_page_viewed', label: 'Página do site ou funil visitada', icon: 'site', description: 'Quando um contato conhecido abre uma página de um site ou funil publicado no Graao. O navegador passa a ser reconhecido depois que a pessoa envia um formulário do site ou funil; visitas anônimas não disparam. Recarregar a mesma página em 30 minutos não conta de novo. Use {{trigger.page}} e {{trigger.site}}.', fields: [
      f('projectId', 'Site ou funil', 'ref', { source: 'sites', empty: 'Qualquer site ou funil' }),
      f('page', 'Página (endereço depois do site)', 'text', { placeholder: 'Ex.: obrigado (vazio = qualquer página; a inicial é index)' })
    ] },
    { type: 'chat_started', label: 'Chat do site iniciado', icon: 'chat', fields: [f('widgetId', 'Chat', 'ref', { source: 'chats', empty: 'Qualquer chat' })] },
    { type: 'webinar_registered', label: 'Inscrição em webinar', icon: 'play', fields: [f('webinarId', 'Webinar', 'ref', { source: 'webinars', empty: 'Qualquer webinar' })] },
    { type: 'preferences_changed', label: 'Preferências de comunicação mudaram', icon: 'lock', description: 'Quando o contato muda canais ou assuntos na central de preferências.', fields: [f('all', 'Saiu de tudo?', 'select', { options: [any('Qualquer mudança'), ['yes', 'Saiu de todas as comunicações'], ['no', 'Ajustou canais ou assuntos']] })] },
    { type: 'loyalty_reward_redeemed', label: 'Recompensa de fidelidade resgatada', icon: 'gift', description: 'Quando um contato troca pontos por uma recompensa. Use {{trigger.code}} para o código.', fields: [f('rewardId', 'Recompensa', 'ref', { source: 'rewards', empty: 'Qualquer recompensa' })] },
    { type: 'loyalty_tier_changed', label: 'Nível de fidelidade mudou', icon: 'gift', description: 'Quando o contato sobe de nível no programa de fidelidade. Use {{trigger.tier}}.', fields: [f('tier', 'Novo nível', 'text', { placeholder: 'Qualquer nível' })] },
    { type: 'email_sequence_completed', label: 'Sequência de e-mail concluída', icon: 'mail', description: 'Quando um contato recebe o último e-mail de uma sequência.', fields: [f('sequenceId', 'Sequência', 'ref', { source: 'sequences', empty: 'Qualquer sequência' })] },
    { type: 'ticket_created', label: 'Ticket criado', icon: 'inbox', description: 'Quando um ticket de atendimento é aberto (pela equipe, pelo portal, por automação ou por uma conversa nova). Use {{trigger.number}} e {{trigger.title}}.', fields: [
      f('priority', 'Prioridade', 'select', { options: [any('Qualquer prioridade'), ...[['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta'], ['urgent', 'Urgente']]] }), f('category', 'Categoria', 'text', { placeholder: 'Qualquer categoria' })
    ] },
    { type: 'ticket_status_changed', label: 'Situação do ticket mudou', icon: 'inbox', description: 'Quando um ticket muda de situação, como resolvido ou aguardando cliente.', fields: [
      f('status', 'Nova situação', 'select', { options: [any('Qualquer situação'), ...[['open', 'Aberto'], ['pending', 'Em andamento'], ['waiting', 'Aguardando cliente'], ['resolved', 'Resolvido'], ['closed', 'Fechado']]] }), f('priority', 'Prioridade', 'select', { options: [any('Qualquer prioridade'), ...[['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta'], ['urgent', 'Urgente']]] })
    ] },
    { type: 'course_completed', label: 'Curso concluído', icon: 'award', description: 'Quando um aluno chega a 100% de um curso com certificado ligado. Use {{trigger.course}} para o nome do curso.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'lesson_completed', label: 'Aula concluída', icon: 'book', description: 'Quando o aluno marca uma aula como concluída no portal. Use {{trigger.title}} para o nome da aula.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'lesson_started', label: 'Aula iniciada', icon: 'book', description: 'Quando o aluno abre uma aula no portal pela primeira vez (abrir de novo e aulas já concluídas não contam). Use {{trigger.title}} para o nome da aula e {{trigger.course}} para o curso.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'course_started', label: 'Curso iniciado', icon: 'book', description: 'Quando o aluno conclui a primeira aula de um curso. Use {{trigger.course}} para o nome do curso.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'course_module_started', label: 'Módulo do curso iniciado', icon: 'book', description: 'Quando o aluno conclui a primeira aula de um módulo. Use {{trigger.module}} para o nome do módulo.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'course_module_completed', label: 'Módulo do curso concluído', icon: 'award', description: 'Quando o aluno conclui todas as aulas publicadas de um módulo. Use {{trigger.module}} para o nome do módulo.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'course_access_granted', label: 'Acesso a curso liberado', icon: 'book', description: 'Quando o contato ganha acesso a um curso, por oferta ou por automação.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'offer_access_granted', label: 'Acesso à oferta liberado', icon: 'book', description: 'Quando o contato recebe os cursos e comunidades de uma oferta: na compra, na inscrição gratuita ou por uma automação. Use {{trigger.offer}} para o nome da oferta.', fields: [f('offerId', 'Oferta', 'ref', { source: 'offers', empty: 'Qualquer oferta' })] },
    { type: 'offer_access_revoked', label: 'Acesso à oferta removido', icon: 'book', description: 'Quando uma automação tira do contato os cursos e comunidades de uma oferta.', fields: [f('offerId', 'Oferta', 'ref', { source: 'offers', empty: 'Qualquer oferta' })] },
    { type: 'course_access_revoked', label: 'Acesso a curso removido', icon: 'book', description: 'Quando uma automação tira o acesso do contato a um curso.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'certificate_issued', label: 'Certificado emitido', icon: 'award', description: 'Quando um certificado de conclusão é emitido. Use {{trigger.code}} para o código de verificação.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'badge_issued', label: 'Badge emitido', icon: 'star', description: 'Quando um aluno recebe o badge de matrícula de um curso.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'course_quiz_submitted', label: 'Quiz do curso respondido', icon: 'check', description: 'Quando um aluno envia um quiz no portal. Use {{trigger.score}} para a nota (0 a 100) e {{trigger.title}} para a aula.', fields: [
      f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' }),
      f('passed', 'Resultado', 'select', { options: [any('Aprovado ou não'), ['yes', 'Atingiu a nota mínima'], ['no', 'Não atingiu a nota mínima']] })
    ] },
    { type: 'course_assignment_submitted', label: 'Tarefa do curso entregue', icon: 'edit', description: 'Quando um aluno entrega uma tarefa no portal.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' })] },
    { type: 'course_assignment_graded', label: 'Tarefa do curso corrigida', icon: 'check', description: 'Quando a equipe aprova ou pede ajustes numa tarefa.', fields: [
      f('courseId', 'Curso', 'ref', { source: 'courses', empty: 'Qualquer curso' }),
      f('status', 'Correção', 'select', { options: [any('Qualquer correção'), ['approved', 'Aprovada'], ['revise', 'Pediu ajustes']] })
    ] },
    { type: 'community_member_joined', label: 'Membro entrou na comunidade', icon: 'users', description: 'Quando um membro entra numa comunidade (gratuita, aprovada, paga ou no teste grátis). Use {{trigger.title}} para o nome da comunidade.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' })
    ] },
    { type: 'community_post_created', label: 'Post criado na comunidade', icon: 'edit', description: 'Quando um membro publica numa comunidade (posts retidos pela moderação contam quando são aprovados). Use {{trigger.title}} e {{trigger.body}}.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' })
    ] },
    { type: 'community_comment_created', label: 'Comentário na comunidade', icon: 'chat', description: 'Quando um membro comenta um post. Use {{trigger.body}} para o comentário e {{trigger.title}} para o post.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' })
    ] },
    { type: 'community_join_requested', label: 'Pedido para entrar na comunidade', icon: 'users', description: 'Quando alguém pede para entrar numa comunidade privada. Use {{trigger.answers}} para as respostas das perguntas de entrada.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' })
    ] },
    { type: 'community_join_rejected', label: 'Pedido para entrar recusado', icon: 'close', description: 'Quando a equipe recusa (remove ou bane) um pedido para entrar.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' })
    ] },
    { type: 'community_event_checked_in', label: 'Check-in em evento da comunidade', icon: 'check', description: 'Quando a equipe marca a presença de um participante no evento. Use {{trigger.title}} para o nome do evento.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' }),
      f('eventId', 'Evento', 'ref', { source: 'communityEvents', empty: 'Qualquer evento' })
    ] },
    { type: 'community_channel_granted', label: 'Acesso a canal privado liberado', icon: 'lock', description: 'Quando um membro recebe acesso a um canal privado da comunidade (pela equipe ou por uma automação). Use {{trigger.channel}} para o nome do canal.', fields: [
      f('channel', 'Canal privado', 'ref', { source: 'privateChannels', empty: 'Qualquer canal privado' })
    ] },
    { type: 'community_channel_revoked', label: 'Acesso a canal privado removido', icon: 'lock', description: 'Quando um membro perde o acesso a um canal privado da comunidade.', fields: [
      f('channel', 'Canal privado', 'ref', { source: 'privateChannels', empty: 'Qualquer canal privado' })
    ] },
    { type: 'community_level_changed', label: 'Nível no ranking da comunidade mudou', icon: 'award', description: 'Quando um membro sobe ou desce de nível no ranking da comunidade (posts, comentários, curtidas recebidas e pontos dados por automações). Use {{trigger.level}} e {{trigger.levelName}}.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' }),
      f('direction', 'Quando', 'select', { options: [['', 'Subir ou descer'], ['up', 'Subir de nível'], ['down', 'Descer de nível']] }),
      f('level', 'Novo nível', 'select', { options: [['', 'Qualquer nível'], ...Array.from({ length: 9 }, (_, i) => [String(i + 1), `Nível ${i + 1}`])] })
    ] },
    { type: 'community_access_revoked', label: 'Acesso à comunidade removido', icon: 'close', description: 'Quando um membro ativo sai, é removido ou banido, ou uma automação tira o acesso dele. Use {{trigger.reason}} para o motivo.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' }),
      f('reason', 'Motivo', 'select', { options: [any('Qualquer motivo'), ['left', 'Saiu por conta própria'], ['removed', 'Removido pela equipe'], ['banned', 'Banido'], ['workflow', 'Removido por automação']] })
    ] },
    { type: 'portal_file_uploaded', label: 'Arquivo enviado no portal do cliente', icon: 'upload', description: 'Quando o cliente envia um arquivo pela área "Enviar um arquivo para a equipe" do portal. O arquivo fica em Arquivos, ligado ao contato, e aparece em Conversas. Use {{trigger.name}} para o nome do arquivo.', fields: [
      f('kind', 'Tipo de arquivo', 'select', { options: [any('Qualquer tipo'), ['photo', 'Imagem'], ['video', 'Vídeo'], ['audio', 'Áudio'], ['doc', 'Documento (PDF, TXT, CSV)']] })
    ] },
    { type: 'portal_login', label: 'Login no portal do cliente', icon: 'lock', description: 'Quando o cliente entra no portal (área de membros) pelo link de acesso. O primeiro acesso conta como cadastro. Entradas da equipe para ver o portal não contam.', fields: [
      f('first', 'Acesso', 'select', { options: [any('Qualquer acesso'), ['yes', 'Só o primeiro acesso (cadastro)'], ['no', 'Só os acessos seguintes']] })
    ] },
    { type: 'community_event_registered', label: 'Inscrição em evento da comunidade', icon: 'cal', description: 'Quando um membro confirma presença ou paga o ingresso de um evento da comunidade. Use {{trigger.title}} para o nome do evento.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', empty: 'Qualquer comunidade' }),
      f('eventId', 'Evento', 'ref', { source: 'communityEvents', empty: 'Qualquer evento' }),
      f('paid', 'Ingresso', 'select', { options: [any('Gratuito ou pago'), ['no', 'Gratuito'], ['yes', 'Pago']] })
    ] },
    { type: 'review_received', label: 'Nova avaliação recebida', icon: 'star', fields: [f('maxScore', 'Nota de no máximo', 'select', { options: [['', 'Qualquer nota'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']] })] },
    { type: 'affiliate_created', label: 'Afiliado cadastrado', icon: 'users', fields: [] },
    { type: 'affiliate_lead', label: 'Lead de afiliado', icon: 'users', fields: [f('affiliateId', 'Afiliado', 'ref', { source: 'affiliates', empty: 'Qualquer afiliado' })] },
    { type: 'affiliate_sale', label: 'Nova venda de afiliado', icon: 'pay', fields: [f('affiliateId', 'Afiliado', 'ref', { source: 'affiliates', empty: 'Qualquer afiliado' })] },
    { type: 'affiliate_campaign_enrolled', label: 'Afiliado entrou em campanha', icon: 'users', description: 'Quando um afiliado passa a participar de uma campanha (na tela de afiliados ou por automação). Dispara no contato do afiliado; use {{trigger.campaign}} para o nome da campanha.', fields: [f('campaignId', 'Campanha', 'ref', { source: 'affiliateCampaigns', empty: 'Qualquer campanha' })] },
    { type: 'video_testimonial', label: 'Depoimento em vídeo recebido', icon: 'play', fields: [f('collectorId', 'Coletor', 'ref', { source: 'videoCollectors', empty: 'Qualquer coletor' })] }
  ] },
  { group: 'Telefonia', items: [
    { type: 'call_details', label: 'Ligação terminou', icon: 'phone', description: 'Quando termina uma ligação feita ou recebida por um número do Graao (Configurações → Telefonia). Use {{trigger.status}}, {{trigger.direction}}, {{trigger.duration}} (segundos) e {{trigger.recording}}.', fields: [
      f('direction', 'Direção', 'select', { options: [any('Recebida ou feita'), ['inbound', 'Recebida'], ['outbound', 'Feita']] }),
      f('status', 'Resultado', 'select', { options: [any('Qualquer resultado'), ['answered', 'Atendida'], ['missed', 'Não atendida'], ['voicemail', 'Caixa postal (recado)'], ['busy', 'Ocupado'], ['failed', 'Falhou']] }),
      f('numberId', 'Número', 'ref', { source: 'phoneNumbers', empty: 'Qualquer número' })
    ] },
    { type: 'dialer_disposition', label: 'Resultado do discador', icon: 'phone', description: 'Quando a equipe marca o resultado de uma ligação do discador (Conversas → Discador). Use {{trigger.disposition}} e {{trigger.note}}.', fields: [
      f('disposition', 'Resultado', 'select', { options: [any('Qualquer resultado'), ['interested', 'Interessado'], ['callback', 'Retornar depois'], ['not_interested', 'Sem interesse'], ['no_answer', 'Não atendeu'], ['voicemail', 'Caixa postal'], ['wrong_number', 'Número errado']] })
    ] },
    { type: 'voice_ai_ended', label: 'Ligação do Voice AI terminou', icon: 'spark', description: 'Quando termina uma ligação atendida ou feita pelo Voice AI. Use {{trigger.transcript}} (a conversa inteira), {{trigger.outcome}} (end, transfer, book, timeout) e {{trigger.duration}}: por exemplo, resuma com IA, extraia dados para o contato ou avise a equipe.', fields: [
      f('outcome', 'Como terminou', 'select', { options: [any('De qualquer jeito'), ['end', 'Encerrou a conversa'], ['transfer', 'Transferiu para a equipe'], ['book', 'Marcou um horário'], ['timeout', 'Tempo ou silêncio']] }),
      f('direction', 'Direção', 'select', { options: [any('Recebida ou feita'), ['inbound', 'Recebida'], ['outbound', 'Feita']] }),
      f('agentId', 'Agente', 'ref', { source: 'agents', empty: 'Qualquer agente' })
    ] },
    { type: 'phone_validated', label: 'Telefone validado', icon: 'phone', description: 'Quando a ação Validar telefone consulta o número do contato. Use {{trigger.valid}} (sim ou não), {{trigger.lineType}} e {{trigger.carrier}}.', fields: [
      f('result', 'Resultado', 'select', { options: [any('Válido ou inválido'), ['valid', 'Válido'], ['invalid', 'Inválido']] }),
      f('lineType', 'Tipo de linha', 'select', { options: [any('Qualquer tipo'), ['mobile', 'Celular'], ['landline', 'Fixo'], ['voip', 'VoIP']] })
    ] },
    { type: 'ivr_call', label: 'Início da URA', icon: 'phone', description: 'Quando chega uma ligação num número com a URA ligada (Configurações → Telefonia). O fluxo atende com as etapas URA: falar ou tocar, coletar dígitos, transferir, gravar recado e desligar. Se nenhum fluxo atender, a ligação segue o encaminhamento do número.', fields: [
      f('numberId', 'Número', 'ref', { source: 'phoneNumbers', empty: 'Qualquer número com URA' })
    ] }
  ] },
  { group: 'Redes Sociais', items: [
    { type: 'social_comment_received', label: 'Comentário em post social (ManyChat)', icon: 'chat', fields: [
      f('network', 'Rede', 'select', { options: [['', 'Qualquer rede'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok']] }),
      f('keyword', 'Palavra-chave no comentário', 'text', { placeholder: 'Ex.: QUERO, PREÇO, LINK' })
    ] },
    { type: 'social_dm_received', label: 'Mensagem direta / DM recebida', icon: 'send', fields: [
      f('network', 'Rede', 'select', { options: [['', 'Qualquer rede'], ['instagram', 'Instagram Direct'], ['facebook', 'Messenger']] }),
      f('keyword', 'Contém a palavra', 'text', { placeholder: 'Ex.: INFO, QUERO' })
    ] },
    { type: 'whatsapp_ad_click', label: 'Mensagem de anúncio no WhatsApp', icon: 'meg', description: 'Quando alguém manda mensagem pelo botão de um anúncio "Clique para o WhatsApp" do Facebook ou do Instagram. O anúncio vai para a atribuição do contato. Use {{trigger.title}} (título do anúncio), {{trigger.adId}} e {{trigger.body}}.', fields: [
      f('adId', 'ID do anúncio', 'text', { placeholder: 'Vazio = qualquer anúncio' }),
      f('keyword', 'Mensagem contém', 'text', { placeholder: 'Ex.: quero saber mais' })
    ] },
    { type: 'meta_lead_form', label: 'Formulário de cadastro do Facebook', icon: 'meg', description: 'Quando alguém envia um formulário de cadastro (Lead Ads) no Facebook ou no Instagram, de uma página conectada no Social Planner. O contato é criado ou atualizado e as respostas viram nota. Use {{trigger.form}} e {{trigger.campaign}}.', fields: [
      f('formId', 'Formulário (ID ou parte do nome)', 'text', { placeholder: 'Vazio = qualquer formulário' }),
      f('campaign', 'Campanha contém', 'text', { placeholder: 'Ex.: black-friday' }),
      f('test', 'Leads de teste', 'select', { options: [any('Reais e de teste'), ['no', 'Só leads reais'], ['yes', 'Só leads de teste']] })
    ] },
    { type: 'google_lead_form', label: 'Formulário de lead do Google Ads', icon: 'meg', description: 'Quando alguém envia o formulário de lead de um anúncio do Google Ads com o webhook do Graao (URL e chave em Marketing → Rastreamento → Formulários). O contato é criado ou atualizado, o clique (gclid) fica na atribuição e as respostas viram nota. Use {{trigger.form}} e {{trigger.campaign}}.', fields: [
      f('formId', 'ID do formulário', 'text', { placeholder: 'Vazio = qualquer formulário' }),
      f('campaign', 'ID da campanha', 'text', { placeholder: 'Vazio = qualquer campanha' }),
      f('test', 'Leads de teste', 'select', { options: [any('Reais e de teste'), ['no', 'Só leads reais'], ['yes', 'Só leads de teste']] })
    ] },
    { type: 'ad_lead', label: 'Lead de anúncio', icon: 'meg', description: 'Quando um contato chega de um anúncio (Google Ads, Meta Ads ou outra mídia paga), por um formulário, site, loja ou webinar. Use {{trigger.campaign}} e {{trigger.source}}.', fields: [
      f('network', 'Origem', 'select', { options: [any('Qualquer anúncio'), ['google_ads', 'Google Ads'], ['meta_ads', 'Meta Ads'], ['paid_other', 'Outros anúncios']] }),
      f('campaign', 'Campanha contém', 'text', { placeholder: 'Ex.: black-friday' })
    ] },
    { type: 'video_watched', label: 'Vídeo assistido', icon: 'site', description: 'Quando um contato conhecido assiste a um vídeo HTML5 do seu site (com o script de rastreamento) até 25, 50, 75 ou 100%. Vídeos do YouTube e de outros players em iframe não são lidos. Use {{trigger.percent}}, {{trigger.video}} e {{trigger.url}}.', fields: [
      f('percent', 'Quando chegar a', 'select', { options: [any('Começou a assistir (25%)'), ['50', 'Metade (50%)'], ['75', '75%'], ['100', 'Até o fim (100%)']] }),
      f('video', 'Vídeo (nome ou endereço contém)', 'text', { placeholder: 'Ex.: apresentacao.mp4' }),
      f('url', 'Página contém', 'text', { placeholder: 'Ex.: /curso' })
    ] },
    { type: 'external_tracking_event', label: 'Evento do rastreamento externo', icon: 'site', description: 'Quando um contato conhecido visita uma página ou envia um formulário no seu site com o script de rastreamento instalado.', fields: [
      f('event', 'Evento', 'select', { options: [any('Visita ou formulário'), ['pageview', 'Visita de página'], ['form', 'Formulário enviado']] }),
      f('url', 'Endereço contém', 'text', { placeholder: 'Ex.: /precos' })
    ] },
    { type: 'score_changed', label: 'Pontuação do lead mudou', icon: 'star', description: 'Quando a pontuação do contato muda. Com um mínimo, dispara só quando a pontuação chega a esse valor.', fields: [
      f('min', 'Chegou a pelo menos', 'number', { placeholder: 'Qualquer mudança' })
    ] },
    { type: 'social_post_published', label: 'Post social publicado', icon: 'send', description: 'Quando o Social Planner termina de publicar um post (agendado, recorrente, da fila evergreen ou do RSS). Use {{trigger.url}}, {{trigger.summary}} e {{trigger.networks}}.', fields: [
      f('status', 'Resultado', 'select', { options: [['published', 'Publicado'], ['failed', 'Falhou'], any('Publicado ou falhou')] }),
      f('network', 'Rede', 'select', { options: [any('Qualquer rede'), ...socialNetworks] }),
      f('categoryId', 'Categoria', 'ref', { source: 'socialCategories', empty: 'Qualquer categoria' })
    ] }
  ] },
  { group: 'Agendamentos', items: [
    { type: 'appointment_booked', label: 'Agendamento criado', icon: 'cal' },
    { type: 'appointment_status', label: 'Status do agendamento', icon: 'cal', fields: [f('status', 'Novo status', 'select', { options: [any('Qualquer status'), ['Confirmed', 'Confirmado'], ['Completed', 'Concluído'], ['Canceled', 'Cancelado']] })] },
    { type: 'meeting_summarized', label: 'Resumo de reunião gerado', icon: 'note', fields: [f('sentiment', 'Clima do cliente', 'select', { options: [any('Qualquer clima'), ['positive', 'Positivo'], ['neutral', 'Neutro'], ['negative', 'Negativo']] })] },
    { type: 'transcript_generated', label: 'Transcrição de reunião gerada', icon: 'note', description: 'Quando a transcrição de uma reunião ligada ao contato fica pronta (colada, de arquivo ou de áudio).', fields: [] },
    { type: 'service_booked', label: 'Reserva de serviço', icon: 'cal', description: 'Quando o cliente reserva um serviço ou uma locação na página de agendamento.', fields: [f('serviceId', 'Serviço', 'ref', { source: 'services', empty: 'Qualquer serviço' }), f('kind', 'Tipo', 'select', { options: [any('Qualquer tipo'), ['appointment', 'Atendimento no local'], ['field', 'Serviço em campo'], ['rental', 'Locação']] })] },
    { type: 'field_status_changed', label: 'Serviço em campo: situação mudou', icon: 'cal', fields: [f('status', 'Nova situação', 'select', { options: [any('Qualquer situação'), ['en_route', 'A caminho'], ['on_site', 'No local'], ['done', 'Concluído']] })] }
  ] },
  { group: 'Oportunidades', items: [
    { type: 'opportunity_created', label: 'Oportunidade criada', icon: 'leads', fields: [f('pipelineId', 'Pipeline', 'ref', { source: 'pipelines', empty: 'Qualquer pipeline' })] },
    { type: 'opportunity_status_changed', label: 'Status da oportunidade alterado', icon: 'leads', fields: [f('status', 'Novo status', 'select', { options: [any('Qualquer status'), ['Open', 'Aberta'], ['Won', 'Ganha'], ['Lost', 'Perdida'], ['Abandoned', 'Abandonada']] })] },
    { type: 'pipeline_stage_changed', label: 'Etapa do pipeline alterada', icon: 'flow', fields: [f('stageId', 'Etapa de destino', 'ref', { source: 'stages', empty: 'Qualquer etapa' })] },
    { type: 'opportunity_changed', label: 'Oportunidade alterada', icon: 'edit' },
    { type: 'stale_opportunity', label: 'Oportunidade parada', icon: 'clock', scheduled: true, fields: [f('days', 'Sem alteração há (dias)', 'number', { min: 1, max: 365, value: 7 }), f('stageId', 'Somente na etapa', 'ref', { source: 'stages', empty: 'Qualquer etapa' })] }
  ] },
  { group: 'Pagamentos e lojas', items: [
    { type: 'invoice_status', label: 'Fatura', icon: 'pay', fields: [f('status', 'Quando a fatura ficar', 'select', { options: [any('Qualquer status'), ['Open', 'Em aberto'], ['Paid', 'Paga'], ['Void', 'Anulada']] })] },
    { type: 'payment_received', label: 'Pagamento recebido', icon: 'pay' },
    { type: 'order_submitted', label: 'Pedido feito na loja', icon: 'box', fields: [f('storeId', 'Loja', 'ref', { source: 'stores', empty: 'Qualquer loja' })] },
    { type: 'order_paid', label: 'Pedido pago', icon: 'box', fields: [f('storeId', 'Loja', 'ref', { source: 'stores', empty: 'Qualquer loja' })] },
    { type: 'order_fulfilled', label: 'Pedido entregue', icon: 'box', fields: [f('storeId', 'Loja', 'ref', { source: 'stores', empty: 'Qualquer loja' })] },
    { type: 'order_paid_late', label: 'Pedido pago depois de expirar', icon: 'box', fields: [f('storeId', 'Loja', 'ref', { source: 'stores', empty: 'Qualquer loja' })] },
    { type: 'product_review', label: 'Avaliação de produto enviada', icon: 'star', fields: [f('storeId', 'Loja', 'ref', { source: 'stores', empty: 'Qualquer loja' }),
      f('rating', 'Quando a nota for', 'select', { options: [any('Qualquer nota'), ['2', '2 estrelas ou menos'], ['3', '3 estrelas ou menos']] })] },
    { type: 'abandoned_checkout', label: 'Checkout abandonado', icon: 'box', fields: [f('storeId', 'Loja', 'ref', { source: 'stores', empty: 'Qualquer loja' }),
      f('status', 'Quando o checkout for', 'select', { options: [['abandoned', 'Abandonado'], ['recovered', 'Recuperado']] })] },
    { type: 'document_status', label: 'Documento ou contrato', icon: 'file', fields: [f('status', 'Quando o documento for', 'select', { options: [any('Qualquer mudança'), ['sent', 'Enviado'], ['viewed', 'Visualizado'],
      ['signed', 'Assinado por um destinatário'], ['completed', 'Assinado por todos'], ['declined', 'Recusado'], ['expired', 'Vencido'], ['void', 'Anulado']] }),
      f('templateId', 'Modelo', 'ref', { source: 'documentTemplates', empty: 'Qualquer modelo' })] },
    { type: 'document_paid', label: 'Documento pago', icon: 'pay', fields: [f('templateId', 'Modelo', 'ref', { source: 'documentTemplates', empty: 'Qualquer modelo' })] },
    { type: 'estimate_status', label: 'Orçamento', icon: 'pay', fields: [f('status', 'Quando o orçamento for', 'select', { options: [any('Qualquer mudança'), ['sent', 'Enviado'], ['viewed', 'Visualizado'],
      ['accepted', 'Aceito'], ['declined', 'Recusado'], ['invoiced', 'Faturado'], ['paid', 'Pago'], ['expired', 'Vencido']] })] },
    { type: 'recurring_invoice_status', label: 'Fatura recorrente', icon: 'pay', fields: [f('status', 'Quando a fatura recorrente for', 'select', { options: [any('Qualquer mudança'),
      ['started', 'Ativada'], ['issued', 'Fatura emitida'], ['paused', 'Pausada'], ['resumed', 'Retomada'], ['completed', 'Concluída'], ['cancelled', 'Cancelada']] })] },
    { type: 'subscription_status', label: 'Assinatura', icon: 'pay', description: 'Quando uma assinatura é criada ou muda de status.', fields: [f('status', 'Status', 'select', { options: [any('Qualquer status'), ['Active', 'Ativa'], ['Paused', 'Pausada'], ['Canceled', 'Cancelada']] })] },
    { type: 'refund', label: 'Reembolso', icon: 'pay', description: 'Quando um pagamento do contato é marcado como reembolsado. Use {{trigger.total}}.', fields: [] },
    { type: 'coupon_redeemed', label: 'Cupom usado', icon: 'tag', description: 'Quando um pedido da loja usa um cupom. Use {{trigger.code}}.', fields: [f('couponId', 'Cupom', 'ref', { source: 'coupons', empty: 'Qualquer cupom' })] },
    { type: 'coupon_limit_reached', label: 'Cupom atingiu o limite de usos', icon: 'tag', description: 'Quando um cupom chega ao número máximo de usos. Dispara para o contato do último pedido.', fields: [f('couponId', 'Cupom', 'ref', { source: 'coupons', empty: 'Qualquer cupom' })] },
    { type: 'coupon_expired', label: 'Cupom expirou', icon: 'tag', description: 'No dia seguinte ao fim da validade de um cupom. Não tem contato: use para avisar a equipe, criar tarefa ou chamar um webhook. Use {{trigger.code}}.', fields: [f('couponId', 'Cupom', 'ref', { source: 'coupons', empty: 'Qualquer cupom' })] },
    { type: 'coupon_applied', label: 'Cupom aplicado no carrinho', icon: 'tag', description: 'Quando um contato já cadastrado coloca um cupom válido no carrinho da loja, antes de fechar o pedido. Use {{trigger.code}}, {{trigger.discount}} e {{trigger.total}}.', fields: [
      f('couponId', 'Cupom', 'ref', { source: 'coupons', empty: 'Qualquer cupom' }), f('storeId', 'Loja', 'ref', { source: 'stores', empty: 'Qualquer loja' })
    ] },
    { type: 'product_viewed', label: 'Produto visualizado', icon: 'box', description: 'Quando um contato já identificado na loja (pelo e-mail que preencheu no carrinho) abre a página de um produto. No máximo uma vez por dia para cada produto. Use {{trigger.title}} e {{trigger.price}}.', fields: [
      f('storeId', 'Loja', 'ref', { source: 'stores', empty: 'Qualquer loja' }), f('productId', 'Produto', 'ref', { source: 'products', empty: 'Qualquer produto' })
    ] },
    { type: 'cart_updated', label: 'Produtos adicionados ao carrinho', icon: 'pay', description: 'Quando um contato já cadastrado coloca ou muda produtos no carrinho da loja. Use {{trigger.total}}.', fields: [f('storeId', 'Loja', 'ref', { source: 'stores', empty: 'Qualquer loja' })] }
  ] }
];

export const conditionSubjects = [
  ['tag', 'Tag do contato', [['has', 'tem'], ['not_has', 'não tem']], 'text'],
  ['field', 'Campo do contato', [['equals', 'é igual a'], ['not_equals', 'é diferente de'], ['contains', 'contém'], ['not_contains', 'não contém'], ['empty', 'está vazio'], ['not_empty', 'está preenchido'], ['gt', 'é maior que'], ['lt', 'é menor que']], 'field'],
  ['dnd', 'Não perturbe', [['on', 'está ativado'], ['off', 'está desativado']], 'none'],
  ['stage', 'Oportunidade na etapa', [['in', 'está em'], ['not_in', 'não está em']], 'stage'],
  ['opportunity_status', 'Status da oportunidade', [['is', 'é'], ['is_not', 'não é']], 'status'],
  ['replied', 'Respondeu desde a inscrição', [['yes', 'sim'], ['no', 'não']], 'none'],
  ['submitted', 'Já enviou o formulário', [['yes', 'sim'], ['no', 'não']], 'form'],
  ['trigger', 'Dado do gatilho', [['equals', 'é igual a'], ['contains', 'contém'], ['gt', 'é maior que'], ['lt', 'é menor que'], ['not_empty', 'está preenchido']], 'key'],
  ['var', 'Variável do fluxo', [['equals', 'é igual a'], ['not_equals', 'é diferente de'], ['contains', 'contém'], ['empty', 'está vazia'], ['not_empty', 'está preenchida'], ['gt', 'é maior que'], ['lt', 'é menor que']], 'key']
];

const conditions = f('conditions', 'Condições', 'conditions');
export const actionCatalog = [
  { group: 'Contato', items: [
    { type: 'add_tag', label: 'Adicionar tag', icon: 'tag', fields: [f('tag', 'Tag', 'text', { required: true })] },
    { type: 'remove_tag', label: 'Remover tag', icon: 'tag', fields: [f('tag', 'Tag', 'text', { required: true })] },
    { type: 'update_field', label: 'Atualizar campo do contato', icon: 'edit', fields: [f('field', 'Campo', 'ref', { source: 'contactFields', required: true }), f('value', 'Novo valor (aceita variáveis)', 'text', { required: true })] },
    { type: 'assign_user', label: 'Atribuir a um usuário', icon: 'contacts', fields: [f('user', 'Usuário', 'text', { required: true, placeholder: 'Nome do usuário da equipe' })] },
    { type: 'remove_user', label: 'Remover usuário atribuído', icon: 'contacts' },
    { type: 'edit_conversation', label: 'Editar conversa', icon: 'chat', fields: [f('op', 'O que fazer', 'select', { options: [['read', 'Marcar como lida'], ['unread', 'Marcar como não lida'], ['star', 'Marcar com estrela'], ['unstar', 'Tirar a estrela']] })] },
    { type: 'conversation_followers', label: 'Seguidores da conversa', icon: 'contacts', fields: [f('op', 'O que fazer', 'select', { options: [['add', 'Adicionar seguidores'], ['remove', 'Remover seguidores']] }), f('users', 'Pessoas da equipe (separadas por vírgula)', 'text', { required: true, placeholder: 'Ana, Bruno' })] },
    { type: 'set_dnd', label: 'Ativar ou desativar DND', icon: 'lock', fields: [f('state', 'Não perturbe', 'select', { options: [['on', 'Ativar'], ['off', 'Desativar']] })] },
    { type: 'add_note', label: 'Adicionar nota', icon: 'note', fields: [f('body', 'Nota', 'textarea', { required: true })] },
    { type: 'create_contact', label: 'Criar contato', icon: 'contacts', description: 'Cria outro contato (ex.: a pessoa indicada num formulário). Se já existir um com o mesmo e-mail ou telefone, usa esse. O fluxo segue com o contato atual; o novo fica em {{steps.ID.id}}.', fields: [
      f('name', 'Nome', 'text', { required: true, placeholder: '{{trigger.indicado}}' }), f('email', 'E-mail', 'text', { placeholder: '{{trigger.email_indicado}}' }), f('phone', 'Telefone', 'text'),
      f('tags', 'Tags (separadas por vírgula)', 'text', { placeholder: 'indicação' })] },
    { type: 'find_contact', label: 'Buscar contato', icon: 'search', description: 'Procura um contato pelo e-mail, telefone ou um campo. O resultado fica em {{steps.ID.found}} (yes ou no), {{steps.ID.name}} e {{steps.ID.email}}; dá para seguir o fluxo com o contato encontrado.', fields: [
      f('by', 'Procurar por', 'select', { options: [['email', 'E-mail'], ['phone', 'Telefone'], ['field', 'Campo personalizado']] }),
      f('field', 'Campo', 'ref', { source: 'textFields', when: { by: 'field' } }),
      f('value', 'Valor procurado', 'text', { required: true, placeholder: '{{trigger.email}}' }),
      f('then', 'Depois de achar', 'select', { options: [['keep', 'Seguir com o contato atual'], ['switch', 'Seguir com o contato encontrado']] })] },
    { type: 'delete_contact', label: 'Excluir contato', icon: 'trash', description: 'Manda o contato para a lixeira (60 dias para restaurar). As etapas seguintes ficam sem contato.', fields: [] },
    { type: 'company_create', label: 'Criar e associar empresa', icon: 'grid', description: 'Liga o contato à empresa com este nome; se ela não estiver no cadastro, cria. Use {{steps.ID.name}} depois.', fields: [
      f('name', 'Nome da empresa (aceita variáveis)', 'text', { required: true, placeholder: '{{contact.company}} ou {{trigger.empresa}}' }),
      f('phone', 'Telefone (só para empresa nova)', 'text'), f('email', 'E-mail (só para empresa nova)', 'text'),
      f('website', 'Site (só para empresa nova)', 'text', { placeholder: 'https://' }), f('city', 'Cidade (só para empresa nova)', 'text')
    ] },
    { type: 'company_update', label: 'Atualizar empresa associada', icon: 'grid', description: 'Muda um campo da empresa do contato (a empresa com o nome que está no contato).', fields: [
      f('field', 'Campo', 'select', { options: [['name', 'Nome'], ['phone', 'Telefone'], ['email', 'E-mail'], ['website', 'Site'], ['address', 'Endereço'], ['city', 'Cidade'], ['state', 'Estado'], ['postal', 'CEP'], ['country', 'País'], ['description', 'Descrição']] }),
      f('value', 'Novo valor (aceita variáveis)', 'text', { required: true })
    ] },
    { type: 'company_clear', label: 'Limpar campos da empresa associada', icon: 'grid', description: 'Apaga campos da empresa do contato. O nome nunca é apagado.', fields: [
      f('field', 'O que limpar', 'select', { options: [['all', 'Todos os campos (menos o nome)'], ['contact', 'Telefone, e-mail e site'], ['address', 'Endereço completo'], ...[['name', 'Nome'], ['phone', 'Telefone'], ['email', 'E-mail'], ['website', 'Site'], ['address', 'Endereço'], ['city', 'Cidade'], ['state', 'Estado'], ['postal', 'CEP'], ['country', 'País'], ['description', 'Descrição']].filter(([key]) => key !== 'name')] })
    ] },
    { type: 'email_verify', label: 'Verificar e-mail', icon: 'mail', description: 'Confere o formato do e-mail do contato e se o domínio recebe e-mail (sem enviar nada). O fluxo espera a resposta: use {{vars.email_status}} (valid, invalid ou unknown) e {{vars.email_motivo}} num Se / Senão.', fields: [
      f('invalidTag', 'Tag para e-mail inválido (opcional)', 'text', { value: 'email-invalido', placeholder: 'email-invalido' })
    ] },
    { type: 'marketing_audit', label: 'Gerar auditoria de marketing', icon: 'chart', description: 'Audita o site da empresa do contato (velocidade, SEO, segurança e LGPD) e, com o Google Maps configurado, o perfil no Google e a reputação. O fluxo espera o resultado (até um minuto): nota do site (0 a 100) em {{vars.nome}}, as partes em {{vars.nome_seo}}, {{vars.nome_seguranca}}…, e um resumo com o que melhorar em {{vars.nome_resumo}}.', fields: [
      f('website', 'Site (aceita variáveis)', 'text', { placeholder: 'https://empresa.com.br (ou um campo pelo painel de variáveis)' }),
      f('business', 'Nome da empresa (para achar no Google)', 'text', { value: '{{contact.company}}' }),
      f('city', 'Cidade (opcional, ajuda a achar no Google)', 'text', { placeholder: 'Recife' }),
      f('variable', 'Guardar na variável', 'text', { required: true, value: 'auditoria' }),
      f('note', 'Registrar o resumo como nota na conversa', 'select', { options: [['yes', 'Sim'], ['no', 'Não']] })
    ] },
    { type: 'copy_contact', label: 'Copiar contato para outra subconta', icon: 'users', description: 'Cria o contato (nome, e-mail, telefone e empresa) noutra subconta da agência. Se ele já existir lá (mesmo e-mail ou telefone), só completa os campos vazios e soma as tags. Campos personalizados não vão. Quem salva o fluxo precisa ter acesso aos contatos da subconta de destino.', fields: [
      f('workspace', 'Subconta de destino', 'ref', { source: 'accounts', required: true, empty: 'Escolha a subconta' }),
      f('copyTags', 'Levar as tags do contato', 'select', { options: [['no', 'Não'], ['yes', 'Sim']] }),
      f('tags', 'Tags a adicionar na cópia (separadas por vírgula)', 'text', { placeholder: 'ex.: veio da matriz' })
    ] },
    { type: 'merge_contact', label: 'Mesclar contato', icon: 'users', description: 'Junta os contatos duplicados (mesmo e-mail ou telefone) num só: tags, campos vazios, notas, conversas, tarefas, oportunidades, agendamentos e faturas passam para o contato mantido, e os duplicados vão para a lixeira.', fields: [
      f('by', 'Duplicado quando tiver o mesmo', 'select', { options: [['any', 'E-mail ou telefone'], ['email', 'E-mail'], ['phone', 'Telefone']] }),
      f('keep', 'Contato mantido', 'select', { options: [['this', 'Este contato'], ['oldest', 'O mais antigo (o fluxo segue com ele)']] })
    ] },
    { type: 'make_affiliate', label: 'Tornar afiliado', icon: 'users', description: 'Cadastra o contato como afiliado na campanha (precisa de e-mail).', fields: [f('campaignId', 'Campanha de afiliados', 'ref', { source: 'affiliateCampaigns', required: true })] },
    { type: 'update_affiliate', label: 'Atualizar afiliado', icon: 'users', description: 'Muda a situação do afiliado ligado ao contato (pelo e-mail ou por ter sido criado a partir dele).', fields: [
      f('status', 'Situação', 'select', { options: [['active', 'Ativo'], ['paused', 'Pausado'], ['pending', 'Aguardando aprovação']] })
    ] },
    { type: 'add_affiliate_campaign', label: 'Adicionar afiliado a campanha', icon: 'users', description: 'Coloca o afiliado ligado ao contato numa campanha, com o link e a comissão dela.', fields: [f('campaignId', 'Campanha de afiliados', 'ref', { source: 'affiliateCampaigns', required: true, empty: 'Escolha a campanha' })] },
    { type: 'remove_affiliate_campaign', label: 'Tirar afiliado de campanha', icon: 'users', description: 'Tira o afiliado ligado ao contato de uma campanha. Comissões já geradas continuam.', fields: [f('campaignId', 'Campanha de afiliados', 'ref', { source: 'affiliateCampaigns', required: true, empty: 'Escolha a campanha' })] },
    { type: 'assign_affiliate_lead', label: 'Atribuir lead a afiliado', icon: 'users', description: 'Registra que o contato foi indicado pelo afiliado: as próximas faturas pagas dele geram comissão.', fields: [
      f('affiliateId', 'Afiliado', 'ref', { source: 'affiliates', required: true, empty: 'Escolha o afiliado' }),
      f('campaignId', 'Campanha', 'ref', { source: 'affiliateCampaigns', empty: 'Primeira campanha ativa do afiliado' }),
      f('replace', 'Se o contato já tiver afiliado', 'select', { options: [['no', 'Manter o afiliado atual'], ['yes', 'Trocar por este']] })
    ] },
    { type: 'affiliate_manual_sale', label: 'Registrar venda de afiliado', icon: 'pay', description: 'Lança uma venda feita fora das faturas (no balcão, por exemplo) para o afiliado que indicou o contato. A comissão segue a regra da campanha e o prazo de carência.', fields: [
      f('amount', 'Valor da venda (R$)', 'number', { min: 0.01, max: 1000000, required: true }),
      f('note', 'Observação', 'text', { placeholder: 'Ex.: Pedido {{trigger.total}}' })
    ] }
  ] },
  { group: 'Comunicação', items: [
    { type: 'send_email', label: 'Enviar e-mail', icon: 'mail', description: 'Envia pelo domínio de envio da subconta (Serviços de e-mail), ou pelo endereço da plataforma se não houver. O rodapé leva o link para o contato escolher o que recebe.', fields: [f('subject', 'Assunto', 'text', { required: true }), f('body', 'Mensagem', 'textarea', { required: true }), f('topicId', 'Assunto (preferências)', 'ref', { source: 'topics', empty: 'Mensagem de serviço' })] },
    { type: 'send_sms', label: 'Enviar SMS', icon: 'phone', fields: [f('body', 'Mensagem', 'textarea', { required: true }), f('topicId', 'Assunto (preferências)', 'ref', { source: 'topics', empty: 'Mensagem de serviço' })] },
    { type: 'send_whatsapp', label: 'Enviar WhatsApp', icon: 'chat', fields: [f('body', 'Mensagem', 'textarea', { required: true }), f('topicId', 'Assunto (preferências)', 'ref', { source: 'topics', empty: 'Mensagem de serviço' })] },
    { type: 'whatsapp_media', label: 'Enviar arquivo no WhatsApp', icon: 'whatsapp', description: 'Manda uma imagem, vídeo, documento (PDF) ou áudio por um endereço https público. O arquivo fica registrado em Conversas. Disponível com a Evolution API.', fields: [
      f('mediaType', 'Tipo', 'select', { options: [['image', 'Imagem'], ['document', 'Documento (PDF etc.)'], ['video', 'Vídeo'], ['audio', 'Áudio']] }),
      f('url', 'Endereço do arquivo (https://, aceita variáveis)', 'text', { required: true, placeholder: 'https://…/catalogo.pdf' }),
      f('caption', 'Legenda (aceita variáveis; áudio não leva legenda)', 'textarea', {}),
      f('fileName', 'Nome do arquivo (documentos)', 'text', { placeholder: 'catalogo.pdf' }),
      f('topicId', 'Assunto (preferências)', 'ref', { source: 'topics', empty: 'Mensagem de serviço' })
    ] },
    { type: 'whatsapp_interactive', label: 'Enviar mensagem interativa no WhatsApp', icon: 'whatsapp', description: 'Manda botões de resposta (até 3), uma lista (até 10 opções) ou uma enquete (até 12), pela Evolution API. A escolha do contato chega como mensagem em Conversas e serve para o gatilho Cliente respondeu ou um Se / Senão.', fields: [
      f('kind', 'Formato', 'select', { options: [['buttons', 'Botões (até 3)'], ['list', 'Lista (até 10)'], ['poll', 'Enquete (até 12)']], value: 'buttons' }),
      f('body', 'Mensagem ou pergunta', 'textarea', { required: true }),
      f('options', 'Opções (uma por linha)', 'textarea', { required: true, placeholder: 'Quero agendar\nVer preços\nFalar com atendente' }),
      f('buttonText', 'Texto do botão que abre a lista', 'text', { value: 'Ver opções', when: { kind: 'list' } }),
      f('footer', 'Rodapé (botões e lista; opcional)', 'text'),
      f('topicId', 'Assunto (preferências do contato)', 'ref', { source: 'topics', empty: 'Sem assunto' })
    ] },
    { type: 'whatsapp_typing', label: 'Mostrar "digitando…" no WhatsApp', icon: 'whatsapp', description: 'Mostra "digitando…" para o contato por alguns segundos, antes da próxima mensagem do fluxo, para a conversa parecer natural. Disponível com a Evolution API.', fields: [
      f('seconds', 'Segundos', 'number', { min: 1, max: 25, value: 3 })
    ] },
    { type: 'send_instagram_dm', label: 'Enviar Direct no Instagram', icon: 'send', description: 'Manda uma mensagem privada pela conta profissional do Instagram conectada no Social Planner, para quem já escreveu no Direct. A Meta só aceita a resposta até 24 horas depois da última mensagem do contato. Os botões viram respostas rápidas.', fields: [
      f('body', 'Mensagem privada', 'textarea', { required: true }),
      f('buttons', 'Botões de resposta rápida (um por linha, até 13; opcional)', 'textarea', { placeholder: 'Quero saber o preço\nFalar com atendente' })
    ] },
    { type: 'send_messenger', label: 'Enviar mensagem no Messenger', icon: 'send', description: 'Manda uma mensagem pelo Messenger da página do Facebook conectada no Social Planner, para quem já escreveu para a página. A Meta só aceita a resposta até 24 horas depois da última mensagem do contato. Os botões viram respostas rápidas.', fields: [
      f('body', 'Mensagem', 'textarea', { required: true }),
      f('buttons', 'Botões de resposta rápida (um por linha, até 13; opcional)', 'textarea', { placeholder: 'Quero saber o preço\nFalar com atendente' })
    ] },
    { type: 'loyalty_points', label: 'Dar ou tirar pontos de fidelidade', icon: 'gift', description: 'Soma (ou subtrai, com número negativo) pontos no programa de fidelidade.', fields: [f('points', 'Pontos', 'number', { required: true, value: 50 }), f('reason', 'Motivo', 'text', { placeholder: 'Ex.: Indicação de amigo' })] },
    { type: 'add_to_sequence', label: 'Inscrever em sequência de e-mail', icon: 'mail', description: 'Coloca o contato numa sequência ativa (uma vez enquanto estiver nela).', fields: [f('sequenceId', 'Sequência', 'ref', { source: 'sequences', required: true, empty: 'Escolha a sequência' })] },
    { type: 'remove_from_sequence', label: 'Tirar de sequência de e-mail', icon: 'mail', description: 'Para os próximos e-mails da sequência para este contato.', fields: [f('sequenceId', 'Sequência', 'ref', { source: 'sequences', required: true, empty: 'Escolha a sequência' })] },
    { type: 'create_ticket', label: 'Criar ticket', icon: 'inbox', description: 'Abre um ticket de atendimento para o contato. Use {{action.<etapa>.number}} para o número.', fields: [
      f('subject', 'Assunto', 'text', { required: true, placeholder: 'Ex.: Retorno sobre o pedido {{trigger.total}}' }), f('description', 'Descrição', 'textarea'),
      f('priority', 'Prioridade', 'select', { options: [['low', 'Baixa'], ['medium', 'Média'], ['high', 'Alta'], ['urgent', 'Urgente']], value: 'medium' }), f('category', 'Categoria', 'text')
    ] },
    { type: 'update_ticket', label: 'Mudar situação do ticket', icon: 'inbox', description: 'Muda a situação do ticket aberto mais recente do contato.', fields: [f('status', 'Nova situação', 'select', { options: [['open', 'Aberto'], ['pending', 'Em andamento'], ['waiting', 'Aguardando cliente'], ['resolved', 'Resolvido'], ['closed', 'Fechado']], required: true, value: 'resolved' })] },
    { type: 'issue_certificate', label: 'Emitir certificado', icon: 'award', description: 'Emite um certificado de um modelo para o contato, com página pública e código de verificação. Use {{action.<etapa>.code}} para o código.', fields: [
      f('templateId', 'Modelo', 'ref', { source: 'certificateTemplates', required: true, empty: 'Escolha o modelo' }),
      f('subject', 'Sobre o quê (curso, evento, conquista)', 'text', { required: true, placeholder: 'Ex.: Workshop de Vendas 2026' })
    ] },
    { type: 'issue_badge', label: 'Emitir badge', icon: 'star', description: 'Concede um badge de um modelo ao contato.', fields: [
      f('templateId', 'Modelo', 'ref', { source: 'badgeTemplates', required: true, empty: 'Escolha o modelo' }),
      f('subject', 'Pelo quê', 'text', { required: true, placeholder: 'Ex.: 10 indicações' })
    ] },
    { type: 'grant_course_access', label: 'Liberar acesso a curso', icon: 'book', description: 'Dá ao contato acesso ao curso no portal do cliente (e envia o link de entrada, se o e-mail do portal estiver configurado). O contato precisa ter e-mail.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', required: true, empty: 'Escolha o curso' })] },
    { type: 'revoke_course_access', label: 'Remover acesso a curso', icon: 'book', description: 'Tira o acesso do contato ao curso no portal. O progresso fica guardado se o acesso voltar.', fields: [f('courseId', 'Curso', 'ref', { source: 'courses', required: true, empty: 'Escolha o curso' })] },
    { type: 'grant_community_access', label: 'Liberar acesso a comunidade', icon: 'users', description: 'Coloca o contato como membro da comunidade (criando o acesso dele ao portal, se preciso). O contato precisa ter e-mail.', fields: [f('communityId', 'Comunidade', 'ref', { source: 'communities', required: true, empty: 'Escolha a comunidade' })] },
    { type: 'grant_offer', label: 'Liberar oferta', icon: 'book', description: 'Dá ao contato todos os cursos e comunidades de uma oferta, sem cobrança (e envia o link do portal, se o e-mail do portal estiver configurado). O contato precisa ter e-mail.', fields: [f('offerId', 'Oferta', 'ref', { source: 'offers', required: true, empty: 'Escolha a oferta' })] },
    { type: 'revoke_offer', label: 'Remover oferta', icon: 'close', description: 'Tira do contato os cursos e comunidades da oferta.', fields: [f('offerId', 'Oferta', 'ref', { source: 'offers', required: true, empty: 'Escolha a oferta' })] },
    { type: 'register_event', label: 'Inscrever em evento da comunidade', icon: 'cal', description: 'Confirma a presença do contato num evento da comunidade, se houver vaga. Ele precisa ser membro ativo da comunidade do evento. Num evento pago, só inscreve se você escolher cortesia (sem cobrar).', fields: [
      f('eventId', 'Evento', 'ref', { source: 'communityEvents', required: true, empty: 'Escolha o evento' }),
      f('ticket', 'Evento pago', 'select', { options: [['', 'Não inscrever (o contato compra o ingresso)'], ['comp', 'Inscrever como cortesia, sem cobrar']] })
    ] },
    { type: 'push_notification', label: 'Notificação push', icon: 'bell', description: 'Manda uma notificação no celular: para a equipe (app mobile da agência, com as notificações ativadas) ou para o contato (aparelhos em que ele ativou as notificações no portal do cliente). Tocar na notificação abre o link.', fields: [
      f('target', 'Para quem', 'select', { options: [['team', 'Equipe (app mobile)'], ['contact', 'O contato (portal do cliente)']] }),
      f('title', 'Título', 'text', { required: true, placeholder: 'Novo lead: {{contact.name}}' }),
      f('body', 'Texto (aceita variáveis)', 'textarea', { required: true, placeholder: 'Veio pelo formulário {{trigger.form}}.' }),
      f('url', 'Abrir ao tocar (opcional: /app#contacts ou https://…)', 'text')
    ] },
    { type: 'grant_channel_access', label: 'Liberar canal privado', icon: 'lock', description: 'Dá ao contato acesso a um canal privado da comunidade. Ele precisa ser membro ativo da comunidade.', fields: [
      f('channel', 'Canal privado', 'ref', { source: 'privateChannels', required: true, empty: 'Escolha o canal' })
    ] },
    { type: 'revoke_channel_access', label: 'Remover canal privado', icon: 'lock', description: 'Tira do contato o acesso a um canal privado da comunidade. Ele continua na comunidade.', fields: [
      f('channel', 'Canal privado', 'ref', { source: 'privateChannels', required: true, empty: 'Escolha o canal' })
    ] },
    { type: 'community_points', label: 'Dar pontos no ranking da comunidade', icon: 'award', description: 'Soma (ou tira, com número negativo) pontos do contato no ranking da comunidade. Só vale para membros ativos.', fields: [
      f('communityId', 'Comunidade', 'ref', { source: 'communities', required: true, empty: 'Escolha a comunidade' }),
      f('points', 'Pontos (negativo tira)', 'number', { required: true, value: 10, min: -1000, max: 1000 }),
      f('note', 'Motivo (opcional)', 'text', { placeholder: 'Ex.: Concluiu o desafio da semana' })
    ] },
    { type: 'revoke_community_access', label: 'Remover acesso a comunidade', icon: 'users', description: 'Tira o contato da comunidade. Membros banidos continuam banidos.', fields: [f('communityId', 'Comunidade', 'ref', { source: 'communities', required: true, empty: 'Escolha a comunidade' })] },
    { type: 'adjust_score', label: 'Ajustar pontuação do lead', icon: 'star', description: 'Soma ou subtrai pontos da pontuação do contato (use negativo para tirar).', fields: [f('points', 'Pontos', 'number', { required: true, min: -1000, max: 1000, value: 10 })] },
    { type: 'create_social_post', label: 'Criar post social', icon: 'send', description: 'Cria um post no Social Planner como rascunho ou agendado. Sem conta escolhida, usa as contas da fila da categoria ou todas as conectadas.', fields: [
      f('body', 'Texto do post', 'textarea', { required: true, placeholder: 'Ex.: Obrigado pela avaliação, {{contact.first_name}}!' }),
      f('mode', 'Como criar', 'select', { options: [['draft', 'Rascunho para revisar'], ['schedule', 'Agendar']] }),
      f('delay', 'Publicar daqui a (minutos)', 'number', { min: 0, max: 43200, value: 0 }),
      f('accountId', 'Conta', 'ref', { source: 'socialAccounts', empty: 'Contas da categoria ou todas' }),
      f('categoryId', 'Categoria', 'ref', { source: 'socialCategories', empty: 'Sem categoria' }),
      f('link', 'Link (opcional)', 'text'),
      f('image', 'URL da imagem (opcional)', 'text'),
      f('approval', 'Aprovação', 'select', { options: [['', 'Sem aprovação'], ['yes', 'Pedir aprovação antes de publicar']] })
    ] },
    { type: 'reply_social_comment', label: 'Responder comentário público', icon: 'chat', fields: [f('body', 'Resposta pública no post', 'textarea', { required: true })] },
    { type: 'send_live_chat', label: 'Enviar mensagem no chat do site', icon: 'chat', description: 'Responde no chat do site em que o contato está conversando. Os botões aparecem embaixo da mensagem e, quando o visitante toca num, ele vai como resposta dele.', fields: [
      f('body', 'Mensagem', 'textarea', { required: true }),
      f('buttons', 'Botões de resposta (um por linha, até 6; opcional)', 'textarea', { placeholder: 'Quero um orçamento\nFalar com atendente' })
    ] },
    { type: 'log_call', label: 'Registrar ligação', icon: 'phone', description: 'Registra uma ligação feita ou recebida fora do Graao (no celular, por exemplo) no histórico de ligações e em Conversas.', fields: [
      f('direction', 'Ligação', 'select', { options: [['outbound', 'Feita para o contato'], ['inbound', 'Recebida do contato']] }),
      f('status', 'Resultado', 'select', { options: [['answered', 'Atendida'], ['missed', 'Não atendida'], ['voicemail', 'Caixa postal'], ['busy', 'Ocupado']] }),
      f('duration', 'Duração (minutos)', 'number', { min: 0, max: 600, value: 0 }),
      f('notes', 'Notas (aceita variáveis)', 'textarea'),
      f('phone', 'Telefone (vazio = o do contato)', 'text')
    ] },
    { type: 'internal_notification', label: 'Notificação interna', icon: 'bell', fields: [f('body', 'Mensagem para a equipe', 'textarea', { required: true })] },
    { type: 'send_optin', label: 'Pedir consentimento (opt-in)', icon: 'check', description: 'Manda o link da página de preferências do contato, onde ele escolhe os canais e os assuntos que quer receber. Quando ele salva, dispara Preferências de comunicação mudaram. Use {{link_preferencias}} para pôr o link no meio do texto (sem ele, o link vai no fim).', fields: [
      f('channel', 'Canal', 'select', { options: [['WhatsApp', 'WhatsApp'], ['Email', 'E-mail']] }),
      f('subject', 'Assunto do e-mail', 'text', { value: 'Suas preferências de comunicação', when: { channel: 'Email' } }),
      f('body', 'Mensagem', 'textarea', { required: true, value: 'Oi, {{contact.first_name}}! Quer continuar recebendo nossas mensagens? Escolha aqui o que você prefere receber: {{link_preferencias}}' })
    ] },
    { type: 'review_request', label: 'Pedir avaliação', icon: 'star', description: 'Envia o link de avaliação pessoal do contato com a mensagem do canal definida em Reputação → Configurações.', fields: [f('channel', 'Canal', 'select', { options: [['WhatsApp', 'WhatsApp'], ['Email', 'E-mail'], ['SMS', 'SMS']] })] },
    { type: 'manual_sms', label: 'Ação manual: SMS', icon: 'phone', fields: [f('body', 'Instruções', 'textarea', { required: true }), f('assignee', 'Responsável', 'text')] },
    { type: 'manual_whatsapp', label: 'Ação manual: WhatsApp', icon: 'whatsapp', fields: [f('body', 'Mensagem sugerida', 'textarea', { required: true, placeholder: 'Oi {{contact.first_name}}, …' }), f('assignee', 'Responsável', 'text')] },
    { type: 'manual_call', label: 'Ação manual: ligação', icon: 'phone', fields: [f('body', 'Instruções', 'textarea', { required: true }), f('assignee', 'Responsável', 'text')] }
  ] },
  { group: 'Telefonia', items: [
    { type: 'call', label: 'Ligar para o contato', icon: 'phone', description: 'Liga primeiro para o telefone da equipe e, quando alguém atende, completa a ligação com o contato, mostrando o número do Graao. A ligação aparece em Conversas e no relatório de ligações e dispara Ligação terminou.', fields: [
      f('numberId', 'Ligar pelo número', 'ref', { source: 'phoneNumbers', required: true, empty: 'Escolha o número' }),
      f('agentPhone', 'Telefone da equipe (vazio: o encaminhamento do número)', 'text', { placeholder: '(11) 99999-0000' })
    ] },
    { type: 'voicemail_drop', label: 'Deixar recado por ligação', icon: 'phone', description: 'Liga para o contato e, quando cai na caixa postal (ou alguém atende), fala o texto ou toca o áudio e desliga.', fields: [
      f('numberId', 'Ligar pelo número', 'ref', { source: 'phoneNumbers', required: true, empty: 'Escolha o número' }),
      f('kind', 'Recado', 'select', { options: [['say', 'Texto falado'], ['play', 'Arquivo de áudio (MP3)']] }),
      f('message', 'Texto do recado (aceita variáveis)', 'textarea', { when: { kind: 'say' }, placeholder: 'Oi, {{contact.first_name}}! Aqui é da {{workspace.name}}…' }),
      f('url', 'Endereço do áudio (https)', 'text', { when: { kind: 'play' }, placeholder: 'https://…/recado.mp3' })
    ] },
    { type: 'dialer_add', label: 'Adicionar ao discador', icon: 'phone', description: 'Coloca o contato na fila do discador (Conversas → Discador), para a equipe ligar em sequência. Contatos sem telefone ou em não perturbe ficam de fora.', fields: [] },
    { type: 'voice_ai_call', label: 'Ligação do Voice AI', icon: 'spark', description: 'Um agente de IA publicado liga para o contato e conversa por voz, com a base de conhecimento dele e o objetivo desta etapa. Pode transferir para a equipe, encerrar ou marcar um horário do serviço escolhido. A transcrição vai para Conversas e dispara Ligação do Voice AI terminou. Usa a OpenAI de quem salvou o fluxo.', fields: [
      f('numberId', 'Ligar pelo número', 'ref', { source: 'phoneNumbers', required: true, empty: 'Escolha o número' }),
      f('agentId', 'Agente (publicado)', 'ref', { source: 'agents', required: true, empty: 'Escolha o agente' }),
      f('goal', 'Objetivo da ligação (aceita variáveis)', 'textarea', { placeholder: 'Confirme a consulta de {{contact.first_name}} amanhã e ofereça remarcar se precisar.' }),
      f('welcome', 'Primeira fala (vazio: o agente começa sozinho)', 'text', { placeholder: 'Oi, {{contact.first_name}}! Aqui é da {{workspace.name}}.' }),
      f('voice', 'Voz', 'select', { options: [['Polly.Camila', 'Camila (pt-BR)'], ['Polly.Vitoria', 'Vitória (pt-BR)'], ['Polly.Thiago', 'Thiago (pt-BR)'], ['Polly.Lupe', 'Lupe (es)'], ['Polly.Joanna', 'Joanna (en)']] }),
      f('transfer', 'Transferir para (telefone da equipe, opcional)', 'text', { placeholder: '(11) 99999-0000' }),
      f('serviceId', 'Marcar horários do serviço (opcional)', 'ref', { source: 'services', empty: 'Não marcar horários' }),
      f('maxMinutes', 'Duração máxima (minutos)', 'number', { value: 10, min: 1, max: 15 })
    ] },
    { type: 'phone_validate', label: 'Validar telefone', icon: 'check', description: 'Consulta o telefone do contato (Twilio Lookup): se o número existe e o tipo de linha. Guarda em {{vars.telefone_status}} (valid ou invalid) e {{vars.telefone_tipo}} e dispara Telefone validado.', fields: [
      f('invalidTag', 'Etiqueta para número inválido (opcional)', 'text', { placeholder: 'Telefone inválido' })
    ] },
    { type: 'ivr_say', label: 'URA: falar ou tocar', icon: 'phone', description: `Fala um texto ou toca um áudio para quem ligou e segue para a próxima etapa. Só funciona em fluxos que começam por Início da URA, durante a ligação.`, fields: [
      f('kind', 'O quê', 'select', { options: [['say', 'Texto falado'], ['play', 'Arquivo de áudio (MP3)']] }),
      f('message', 'Texto (aceita variáveis)', 'textarea', { when: { kind: 'say' }, placeholder: 'Olá! Você ligou para a {{workspace.name}}.' }),
      f('url', 'Endereço do áudio (https)', 'text', { when: { kind: 'play' } })
    ] },
    { type: 'ivr_gather', label: 'URA: coletar dígitos', icon: 'phone', description: `Fala o menu e espera a pessoa digitar no teclado. Os dígitos ficam em {{vars.nome}}: use Se / Senão para cada opção. Sem resposta, a variável fica vazia. Só funciona em fluxos que começam por Início da URA, durante a ligação.`, fields: [
      f('message', 'Menu falado', 'textarea', { required: true, placeholder: 'Digite 1 para vendas, 2 para suporte.' }),
      f('digits', 'Quantos dígitos', 'number', { value: 1, min: 1, max: 10 }),
      f('timeout', 'Esperar até (segundos)', 'number', { value: 6, min: 3, max: 30 }),
      f('variable', 'Guardar os dígitos na variável', 'text', { required: true, value: 'ivr_digitos' })
    ] },
    { type: 'ivr_connect', label: 'URA: transferir ligação', icon: 'phone', description: `Toca nos telefones da equipe (um por linha, todos ao mesmo tempo) e conecta quem atender. O resultado fica em {{vars.ivr_transferencia}} (completed, no-answer, busy). Só funciona em fluxos que começam por Início da URA, durante a ligação.`, fields: [
      f('to', 'Telefones (um por linha)', 'textarea', { required: true, placeholder: '(11) 99999-0000' }),
      f('timeout', 'Tocar por (segundos)', 'number', { value: 20, min: 5, max: 60 }),
      f('record', 'Gravar a conversa', 'select', { options: [['no', 'Não'], ['yes', 'Sim']] })
    ] },
    { type: 'ivr_record', label: 'URA: gravar recado', icon: 'phone', description: `Fala o aviso e grava o recado depois do bipe. O recado vai para Conversas e o link fica em {{vars.ivr_gravacao}}. Só funciona em fluxos que começam por Início da URA, durante a ligação.`, fields: [
      f('message', 'Aviso antes do bipe', 'textarea', { placeholder: 'Deixe seu recado após o sinal.' }),
      f('maxLength', 'Duração máxima (segundos)', 'number', { value: 120, min: 10, max: 600 })
    ] },
    { type: 'ivr_hangup', label: 'URA: desligar', icon: 'phone', description: `Fala uma despedida (opcional) e encerra a ligação. As etapas seguintes que não são de URA continuam. Só funciona em fluxos que começam por Início da URA, durante a ligação.`, fields: [
      f('message', 'Despedida (opcional)', 'textarea', { placeholder: 'Obrigado pela ligação!' })
    ] }
  ] },
  { group: 'CRM e pagamentos', items: [
    { type: 'create_task', label: 'Criar tarefa', icon: 'check', fields: [f('title', 'Título', 'text', { required: true }), f('dueDays', 'Prazo em dias', 'number', { min: 0, max: 365, value: 1 }), f('owner', 'Responsável', 'text')] },
    { type: 'create_opportunity', label: 'Criar ou atualizar oportunidade', icon: 'leads', fields: [f('title', 'Nome', 'text', { required: true, value: '{{contact.name}}' }), f('stageId', 'Etapa', 'ref', { source: 'stages', required: true }), f('value', 'Valor (R$)', 'number', { min: 0, value: 0 })] },
    { type: 'opportunity_status', label: 'Mudar status da oportunidade', icon: 'leads', fields: [f('status', 'Status', 'select', { options: [['Won', 'Ganha'], ['Lost', 'Perdida'], ['Open', 'Aberta'], ['Abandoned', 'Abandonada']] })] },
    { type: 'opportunity_owner', label: 'Dono da oportunidade', icon: 'leads', description: 'Define ou tira o dono da oportunidade aberta mais recente do contato.', fields: [
      f('op', 'O que fazer', 'select', { options: [['set', 'Definir dono'], ['clear', 'Tirar o dono']] }), f('owner', 'Pessoa da equipe', 'text', { placeholder: 'Ana', when: { op: 'set' } }),
      f('pipelineId', 'Pipeline', 'ref', { source: 'pipelines', empty: 'Qualquer pipeline' })] },
    { type: 'opportunity_followers', label: 'Seguidores da oportunidade', icon: 'leads', description: 'Adiciona ou remove seguidores da oportunidade aberta mais recente do contato.', fields: [
      f('op', 'O que fazer', 'select', { options: [['add', 'Adicionar seguidores'], ['remove', 'Remover seguidores']] }), f('users', 'Pessoas da equipe (separadas por vírgula)', 'text', { required: true, placeholder: 'Ana, Bruno' }),
      f('pipelineId', 'Pipeline', 'ref', { source: 'pipelines', empty: 'Qualquer pipeline' })] },
    { type: 'find_opportunity', label: 'Buscar oportunidade', icon: 'search', description: 'Acha a oportunidade mais recente do contato. O resultado fica em {{steps.ID.found}}, {{steps.ID.title}}, {{steps.ID.value}}, {{steps.ID.stage}}, {{steps.ID.status}} e {{steps.ID.owner}}.', fields: [
      f('pipelineId', 'Pipeline', 'ref', { source: 'pipelines', empty: 'Qualquer pipeline' }),
      f('status', 'Status', 'select', { options: [['', 'Qualquer status'], ['Open', 'Aberta'], ['Won', 'Ganha'], ['Lost', 'Perdida'], ['Abandoned', 'Abandonada']] })] },
    { type: 'remove_opportunity', label: 'Remover oportunidade', icon: 'leads', description: 'Exclui a oportunidade mais recente do contato (do pipeline escolhido, se houver).', fields: [f('pipelineId', 'Pipeline', 'ref', { source: 'pipelines', empty: 'Qualquer pipeline' })] },
    { type: 'book_appointment', label: 'Agendar horário', icon: 'cal', description: 'Marca o contato no primeiro horário livre do serviço, a partir de alguns dias. Use {{steps.ID.start}} para a data e hora.', fields: [
      f('serviceId', 'Serviço', 'ref', { source: 'services', required: true, empty: 'Escolha o serviço' }),
      f('afterDays', 'A partir de quantos dias', 'number', { value: 1, min: 0, max: 365 }),
      f('address', 'Endereço (serviço em campo, aceita variáveis)', 'text', { placeholder: '{{contact.address}}' })
    ] },
    { type: 'booking_link', label: 'Gerar link de agendamento de uso único', icon: 'cal', description: 'Cria um link pessoal da página de agendamento, já com os dados do contato. Ele vale para um agendamento e vence depois dos dias escolhidos. Use {{vars.link_agendamento}} na mensagem.', fields: [
      f('serviceId', 'Serviço', 'ref', { source: 'services', empty: 'O cliente escolhe o serviço' }),
      f('days', 'Vale por quantos dias', 'number', { value: 7, min: 1, max: 90 }),
      f('variable', 'Guardar o link na variável', 'text', { value: 'link_agendamento', placeholder: 'link_agendamento' })
    ] },
    { type: 'appointment_note', label: 'Nota no agendamento', icon: 'note', description: 'Escreve nas observações do próximo agendamento do contato (ou do último criado).', fields: [
      f('which', 'Agendamento', 'select', { options: [['next', 'O próximo'], ['last', 'O último criado']] }),
      f('body', 'Nota (aceita variáveis)', 'textarea', { required: true }),
      f('mode', 'Como escrever', 'select', { options: [['append', 'Somar às observações'], ['replace', 'Substituir as observações']] })
    ] },
    { type: 'appointment_status_update', label: 'Mudar status do agendamento', icon: 'cal', description: 'Muda o próximo agendamento do contato (ou o último, se não houver próximo).', fields: [f('status', 'Novo status', 'select', { options: [['Confirmed', 'Confirmado'], ['Completed', 'Concluído'], ['Canceled', 'Cancelado']] })] },
    { type: 'send_document', label: 'Enviar documento ou contrato', icon: 'file', fields: [f('templateId', 'Modelo', 'ref', { source: 'documentTemplates', required: true }),
      f('title', 'Título do documento', 'text', { value: '' }), f('channel', 'Enviar por', 'select', { options: [['email', 'E-mail'], ['email_whatsapp', 'E-mail e WhatsApp']] }),
      f('expiresDays', 'Validade em dias (0 = sem prazo)', 'number', { min: 0, max: 365, value: 15 })] },
    { type: 'send_estimate', label: 'Enviar orçamento', icon: 'pay', fields: [f('estimateId', 'Orçamento modelo (é enviada uma cópia)', 'ref', { source: 'estimates', required: true }),
      f('channel', 'Enviar por', 'select', { options: [['email', 'E-mail'], ['email_whatsapp', 'E-mail e WhatsApp']] }), f('expiresDays', 'Validade em dias (0 = sem prazo)', 'number', { min: 0, max: 365, value: 15 })] },
    { type: 'send_invoice', label: 'Enviar fatura', icon: 'pay', fields: [f('templateId', 'Modelo de fatura', 'ref', { source: 'invoiceTemplates', required: true }),
      f('channel', 'Enviar por', 'select', { options: [['email', 'E-mail'], ['email_whatsapp', 'E-mail e WhatsApp']] })] },
    { type: 'update_inventory', label: 'Atualizar estoque', icon: 'box', fields: [f('productId', 'Produto', 'ref', { source: 'products', required: true }),
      f('mode', 'Operação', 'select', { options: [['add', 'Somar'], ['subtract', 'Subtrair'], ['set', 'Definir em']] }), f('quantity', 'Quantidade', 'number', { min: 0, max: 1000000, value: 1 })] },
    { type: 'start_recurring_invoice', label: 'Iniciar fatura recorrente', icon: 'pay', fields: [f('templateId', 'Modelo de fatura', 'ref', { source: 'invoiceTemplates', required: true }),
      f('frequency', 'Frequência', 'select', { options: [['monthly', 'Mensal'], ['weekly', 'Semanal'], ['daily', 'Diária'], ['yearly', 'Anual']] }),
      f('interval', 'A cada (períodos)', 'number', { min: 1, max: 30, value: 1 }), f('count', 'Número de faturas (0 = sem fim)', 'number', { min: 0, max: 240, value: 0 }),
      f('channel', 'Enviar por', 'select', { options: [['email', 'E-mail'], ['email_whatsapp', 'E-mail e WhatsApp']] })] },
    { type: 'create_invoice', label: 'Criar fatura', icon: 'pay', fields: [f('title', 'Descrição', 'text', { required: true }), f('value', 'Valor (R$)', 'number', { min: 0, required: true }), f('dueDays', 'Vence em (dias)', 'number', { min: 0, max: 365, value: 7 })] },
    { type: 'update_custom_value', label: 'Atualizar valor personalizado', icon: 'key', description: 'Muda um valor personalizado da conta, usado como {{custom_values.nome}} em todo lugar.', fields: [f('valueId', 'Valor personalizado', 'ref', { source: 'customValues', required: true, empty: 'Escolha um valor' }), f('value', 'Novo valor', 'text', { required: true })] }
  ] },
  { group: 'Marketing', items: [
    { type: 'meta_conversion', label: 'Enviar conversão para a Meta', icon: 'chart', description: 'Manda um evento do contato para o seu Pixel da Meta pela API de Conversões (como Lead ou Compra), para os anúncios otimizarem com dados do CRM. E-mail, telefone e nome vão com hash (SHA-256). Precisa do Pixel em Marketing → Rastreamento e do Meta Ads conectado em Marketing → Anúncios.', fields: [
      f('event', 'Evento', 'select', { options: [['Lead', 'Lead'], ['Purchase', 'Compra (Purchase)'], ['CompleteRegistration', 'Cadastro concluído'], ['Schedule', 'Agendamento'], ['Contact', 'Contato'], ['SubmitApplication', 'Inscrição enviada'], ['Subscribe', 'Assinatura'], ['InitiateCheckout', 'Início do checkout'], ['custom', 'Personalizado']] }),
      f('customEvent', 'Nome do evento personalizado', 'text', { placeholder: 'ex.: lead_qualificado', when: { event: 'custom' } }),
      f('value', 'Valor (opcional, aceita variáveis)', 'text', { placeholder: 'ex.: 150,00 ou {{vars.total}}' }),
      f('currency', 'Moeda', 'select', { options: [['BRL', 'Real (BRL)'], ['USD', 'Dólar (USD)'], ['EUR', 'Euro (EUR)']] }),
      f('testCode', 'Código de teste do Gerenciador de Eventos (opcional)', 'text', { placeholder: 'TEST12345' })
    ] },
    { type: 'ga4_event', label: 'Enviar evento para o Google Analytics', icon: 'chart', description: 'Manda um evento do contato para a sua propriedade do GA4 (Measurement Protocol), como lead gerado ou compra, com valor opcional. O contato vai só com um identificador do Graao (nada de e-mail ou telefone). Precisa do ID de medição e do segredo da API em Marketing → Rastreamento.', fields: [
      f('event', 'Evento', 'select', { options: [['generate_lead', 'Lead gerado (generate_lead)'], ['qualify_lead', 'Lead qualificado (qualify_lead)'], ['close_convert_lead', 'Lead convertido (close_convert_lead)'], ['purchase', 'Compra (purchase)'], ['sign_up', 'Cadastro (sign_up)'], ['custom', 'Personalizado']] }),
      f('customEvent', 'Nome do evento personalizado', 'text', { placeholder: 'ex.: proposta_enviada', when: { event: 'custom' } }),
      f('value', 'Valor (opcional, aceita variáveis)', 'text', { placeholder: 'ex.: 150,00 ou {{vars.total}}' }),
      f('currency', 'Moeda', 'select', { options: [['BRL', 'Real (BRL)'], ['USD', 'Dólar (USD)'], ['EUR', 'Euro (EUR)']] })
    ] },
    { type: 'google_ads_conversion', label: 'Enviar conversão para o Google Ads', icon: 'chart', description: 'Registra uma conversão offline do contato numa ação de conversão da conta conectada em Marketing → Anúncios, pelo clique que trouxe o lead (gclid guardado na atribuição). Opcionalmente manda e-mail e telefone com hash (conversões otimizadas para leads), o que vale também para quem não veio de um clique.', fields: [
      f('actionId', 'ID da ação de conversão', 'text', { required: true, placeholder: 'ex.: 6543210987 (Metas → Conversões no Google Ads)' }),
      f('value', 'Valor (opcional, aceita variáveis)', 'text', { placeholder: 'ex.: 150,00 ou {{vars.total}}' }),
      f('currency', 'Moeda', 'select', { options: [['BRL', 'Real (BRL)'], ['USD', 'Dólar (USD)'], ['EUR', 'Euro (EUR)']] }),
      f('identifiers', 'Mandar e-mail e telefone com hash', 'select', { options: [['no', 'Não, só o clique (gclid)'], ['yes', 'Sim (conversões otimizadas para leads)']] })
    ] },
    { type: 'meta_audience', label: 'Público personalizado da Meta', icon: 'users', description: 'Inclui ou tira o contato (e-mail e telefone com hash SHA-256) de um público personalizado da Meta, para anunciar para ele ou excluí-lo dos anúncios. O ID do público fica no Gerenciador de Públicos. Precisa do Meta Ads conectado em Marketing → Anúncios.', fields: [
      f('op', 'O que fazer', 'select', { options: [['add', 'Incluir no público'], ['remove', 'Tirar do público']] }),
      f('audienceId', 'ID do público personalizado', 'text', { required: true, placeholder: 'ex.: 23851234567890123' })
    ] }
  ] },
  { group: 'IA', items: [
    { type: 'conversation_ai', label: 'Bot de IA na conversa', icon: 'chat', ai: true, description: 'Um agente de IA publicado lê a conversa com o contato e responde à última mensagem dele, com a base de conhecimento do agente. Ele passa a conversa para a equipe quando o cliente pede uma pessoa ou quando não sabe responder, encerra quando o cliente se despede e, com um serviço escolhido, oferece horários livres e marca o escolhido. A resposta fica em {{vars.nome}}.', fields: [
      f('agentId', 'Agente (publicado)', 'ref', { source: 'agents', required: true, empty: 'Escolha o agente' }),
      f('mode', 'Modo', 'select', { options: [['auto', 'Responder sozinho'], ['suggest', 'Sugerir à equipe (nota em Conversas)']] }),
      f('channel', 'Canal', 'select', { options: [['last', 'Canal da última mensagem do cliente'], ['WhatsApp', 'WhatsApp'], ['Email', 'E-mail'], ['Live chat', 'Chat ao vivo'], ['Instagram', 'Instagram'], ['Facebook', 'Messenger'], ['SMS', 'SMS']] }),
      f('serviceId', 'Marcar horários do serviço (opcional)', 'ref', { source: 'services', empty: 'Não marcar horários' }),
      f('variable', 'Guardar a resposta na variável', 'text', { required: true, value: 'resposta_bot' })
    ] },
    { type: 'conversation_ai_status', label: 'Ligar ou desligar o bot de IA', icon: 'spark', description: 'Liga o bot de IA na conversa do contato: cada mensagem nova do cliente recebe a resposta do agente, até ele passar a conversa para a equipe, encerrar o atendimento ou ser desligado. As respostas usam a OpenAI de quem salvou este fluxo ou, sem a chave, a IA gratuita do graao, quando liberada. Desligar também tira o bot da conversa.', fields: [
      f('state', 'Bot', 'select', { options: [['on', 'Ligar'], ['off', 'Desligar']] }),
      f('agentId', 'Agente (publicado)', 'ref', { source: 'agents', empty: 'Escolha o agente', when: { state: 'on' } }),
      f('mode', 'Modo', 'select', { options: [['auto', 'Responder sozinho'], ['suggest', 'Sugerir à equipe (nota em Conversas)']], when: { state: 'on' } }),
      f('channel', 'Canal', 'select', { options: [['last', 'Canal da última mensagem do cliente'], ['WhatsApp', 'WhatsApp'], ['Email', 'E-mail'], ['Live chat', 'Chat ao vivo'], ['Instagram', 'Instagram'], ['Facebook', 'Messenger'], ['SMS', 'SMS']], when: { state: 'on' } }),
      f('serviceId', 'Marcar horários do serviço (opcional)', 'ref', { source: 'services', empty: 'Não marcar horários', when: { state: 'on' } })
    ] },
    { type: 'ai_agent', label: 'Rodar agente de IA', icon: 'spark', ai: true, description: 'Manda uma mensagem para a versão publicada de um agente de IA desta subconta (com a base de conhecimento e a memória dele) e guarda a resposta em {{vars.nome}}. A execução aparece no histórico do agente.', fields: [
      f('agentId', 'Agente (publicado)', 'ref', { source: 'agents', required: true, empty: 'Escolha o agente' }),
      f('input', 'Mensagem para o agente (aceita variáveis)', 'textarea', { required: true, value: '{{trigger.body}}' }),
      f('variable', 'Guardar a resposta na variável', 'text', { required: true, value: 'resposta_agente' })
    ] },
    { type: 'ai_prompt', label: 'Perguntar à IA', icon: 'spark', ai: true, description: 'Pede qualquer tarefa à IA com as suas palavras (escrever, reescrever, classificar, responder) e guarda o resultado em {{vars.nome}}. O texto de apoio vai como dado para a IA analisar, nunca como instrução.', fields: [
      f('prompt', 'O que a IA deve fazer (aceita variáveis)', 'textarea', { required: true, placeholder: 'Ex.: Escreva uma mensagem curta e simpática convidando {{contact.first_name}} para conhecer o plano anual.' }),
      f('input', 'Texto de apoio (aceita variáveis)', 'textarea', { value: '{{trigger.body}}' }),
      f('length', 'Tamanho da resposta', 'select', { options: [['short', 'Curta'], ['medium', 'Média'], ['long', 'Longa']] }),
      f('variable', 'Guardar a resposta na variável', 'text', { required: true, value: 'resposta_ia' })
    ] },
    { type: 'ai_image_generate', label: 'Gerar imagem com IA', icon: 'spark', ai: true, description: 'Cria uma imagem a partir de uma descrição (OpenAI gpt-image-1) e guarda em Arquivos, com um link público em {{vars.nome}} para mandar por WhatsApp, e-mail ou post. Usa a OpenAI de quem salvou o fluxo.', fields: [
      f('prompt', 'Descrição da imagem (aceita variáveis)', 'textarea', { required: true, placeholder: 'Ex.: foto de um bolo de aniversário com o nome {{contact.first_name}} escrito na cobertura, luz natural' }),
      f('size', 'Formato', 'select', { options: [['1024x1024', 'Quadrado'], ['1536x1024', 'Paisagem'], ['1024x1536', 'Retrato']] }),
      f('quality', 'Qualidade', 'select', { options: [['medium', 'Média'], ['low', 'Baixa (mais rápida)'], ['high', 'Alta']] }),
      f('variable', 'Guardar o link na variável', 'text', { required: true, value: 'imagem_ia' })
    ] },
    { type: 'ai_video_generate', label: 'Gerar vídeo com IA', icon: 'spark', ai: true, description: 'Cria um vídeo curto a partir de uma descrição (OpenAI sora-2). Leva alguns minutos: o fluxo espera o vídeo ficar pronto e guarda o link público em {{vars.nome}}. Usa a OpenAI de quem salvou o fluxo.', fields: [
      f('prompt', 'Descrição do vídeo (aceita variáveis)', 'textarea', { required: true, placeholder: 'Ex.: câmera lenta de um café sendo servido numa xícara branca, manhã, luz suave' }),
      f('seconds', 'Duração', 'select', { options: [['4', '4 segundos'], ['8', '8 segundos'], ['12', '12 segundos']] }),
      f('size', 'Formato', 'select', { options: [['1280x720', 'Paisagem (16:9)'], ['720x1280', 'Vertical (9:16)']] }),
      f('variable', 'Guardar o link na variável', 'text', { required: true, value: 'video_ia' })
    ] },
    { type: 'ai_decision', label: 'Decidir com IA', icon: 'spark', ai: true, description: 'A IA escolhe uma das opções. Use a variável num Se / Senão ou Roteador.',
      fields: [f('question', 'O que a IA deve decidir', 'textarea', { required: true, placeholder: 'Ex.: Este lead está pronto para comprar?' }),
        f('options', 'Opções (separadas por vírgula)', 'text', { required: true, placeholder: 'quente, morno, frio' }),
        f('input', 'Informação para analisar (aceita variáveis)', 'textarea', { value: '{{trigger.body}}' }),
        f('variable', 'Guardar a resposta na variável', 'text', { value: 'decisao', required: true })] },
    { type: 'ai_summarize', label: 'Resumir com IA', icon: 'spark', ai: true, description: 'Resume uma conversa ou um texto em poucas linhas.',
      fields: [f('source', 'O que resumir', 'select', { options: [['conversation', 'Últimas mensagens do contato'], ['text', 'Um texto']] }),
        f('input', 'Texto (aceita variáveis)', 'textarea', { value: '{{trigger.body}}', when: { source: 'text' } }),
        f('length', 'Tamanho', 'select', { options: [['short', 'Uma frase'], ['medium', 'Um parágrafo'], ['bullets', 'Tópicos']] }),
        f('variable', 'Guardar o resumo na variável', 'text', { value: 'resumo', required: true }),
        f('note', 'Também salvar como nota do contato', 'select', { options: [['no', 'Não'], ['yes', 'Sim']] })] },
    { type: 'ai_intent', label: 'Detectar intenção com IA', icon: 'spark', ai: true, description: 'Classifica a mensagem numa das intenções. Sem encaixe, a variável fica “outra”.',
      fields: [f('intents', 'Intenções (separadas por vírgula)', 'text', { required: true, placeholder: 'comprar, agendar, suporte, cancelar' }),
        f('input', 'Mensagem (aceita variáveis)', 'textarea', { value: '{{trigger.body}}' }),
        f('variable', 'Guardar a intenção na variável', 'text', { value: 'intencao', required: true })] },
    { type: 'ai_translate', label: 'Traduzir com IA', icon: 'spark', ai: true,
      fields: [f('input', 'Texto (aceita variáveis)', 'textarea', { required: true, value: '{{trigger.body}}' }),
        f('language', 'Traduzir para', 'select', { options: [['pt', 'Português'], ['es', 'Espanhol'], ['en', 'Inglês']] }),
        f('variable', 'Guardar a tradução na variável', 'text', { value: 'traducao', required: true })] },
    { type: 'ai_extract', label: 'Extrair dados com IA', icon: 'spark', ai: true, description: 'Cada dado vira {{vars.nome}}. Use “Atualizar campo do contato” depois para gravar.',
      fields: [f('fields', 'Dados a extrair (um por linha: nome = descrição)', 'textarea', { required: true, placeholder: 'empresa = nome da empresa\norcamento = valor em reais\nprazo = quando quer começar' }),
        f('input', 'Texto de onde extrair (aceita variáveis)', 'textarea', { value: '{{trigger.body}}' })] },
    { type: 'ai_image', label: 'Analisar imagem com IA', icon: 'spark', ai: true, description: 'Descreve ou responde uma pergunta sobre uma imagem pública (https).',
      fields: [f('image', 'Endereço da imagem (aceita variáveis)', 'text', { required: true, placeholder: 'https://… ou {{trigger.attachment}}' }),
        f('question', 'Pergunta', 'textarea', { value: 'Descreva a imagem em poucas palavras.' }),
        f('variable', 'Guardar a resposta na variável', 'text', { value: 'analise_imagem', required: true })] }
  ] },
  { group: 'Fluxo', items: [
    { type: 'wait', label: 'Aguardar', icon: 'clock', fields: [f('mode', 'Aguardar', 'select', { options: [['delay', 'Um tempo'], ['until', 'Até uma data e hora'], ['event', 'Até um evento acontecer'], ['event_date', 'Em relação à data do evento']] }),
      f('amount', 'Quanto', 'number', { min: 1, max: 1000, value: 1, when: { mode: 'delay' } }), f('unit', 'Unidade', 'select', { options: [['minutes', 'minutos'], ['hours', 'horas'], ['days', 'dias']], value: 'days', when: { mode: 'delay' } }),
      f('until', 'Data e hora', 'datetime', { when: { mode: 'until' } }),
      f('event', 'Evento', 'select', { when: { mode: 'event' }, options: [['customer_replied', 'Cliente responder'], ['contact_tag', 'Receber uma tag'], ['form_submitted', 'Enviar um formulário'], ['appointment_booked', 'Fazer um agendamento'], ['order_paid', 'Pagar um pedido']] }),
      f('eventValue', 'Tag ou formulário (opcional)', 'text', { when: { mode: 'event' } }),
      f('timeoutDays', 'Desistir de esperar após (dias)', 'number', { min: 1, max: 365, value: 3, when: { mode: 'event' } }),
      f('offset', 'Quanto', 'number', { min: 0, max: 1000, value: 1, when: { mode: 'event_date' } }),
      f('offsetUnit', 'Unidade', 'select', { options: [['minutes', 'minutos'], ['hours', 'horas'], ['days', 'dias']], value: 'days', when: { mode: 'event_date' } }),
      f('direction', 'Quando', 'select', { options: [['before', 'antes da data do evento'], ['after', 'depois da data do evento']], when: { mode: 'event_date' } })] },
    { type: 'set_event_date', label: 'Definir data do evento', icon: 'cal', description: 'Guarda a data (e a hora) de um evento do contato, como uma consulta, um webinar ou uma entrega. As etapas Aguardar "em relação à data do evento" contam a partir dela. Aceita variáveis e datas como 2026-12-01 19:30 ou 01/12/2026 19:30, no fuso da subconta. Fica em {{vars.data_evento}}.', fields: [
      f('date', 'Data e hora do evento (aceita variáveis)', 'text', { required: true, placeholder: 'Ex.: {{contact.data_da_consulta}} ou 01/12/2026 19:30' })
    ] },
    { type: 'if_else', label: 'Se / Senão', icon: 'flow', branch: true, fields: [conditions] },
    { type: 'filter', label: 'Filtro', icon: 'filter', description: 'Só continua se a condição for verdadeira', fields: [conditions] },
    { type: 'set_variable', label: 'Definir variável', icon: 'key', description: 'Guarda um valor para usar depois como {{vars.nome}}', fields: [f('name', 'Nome da variável', 'text', { required: true, placeholder: 'ex.: cupom' }), f('value', 'Valor (texto ou expressão)', 'text', { required: true, placeholder: '{{upper(contact.first_name)}}' })] },
    { type: 'router', label: 'Roteador', icon: 'flow', branch: true, fields: [] },
    { type: 'split', label: 'Teste A/B', icon: 'flow', branch: true, description: 'Divide os contatos entre caminhos por percentual, para comparar mensagens, ofertas ou tempos de espera. Cada contato cai em um caminho por sorteio.', fields: [] },
    { type: 'loop', label: 'Repetir (loop)', icon: 'updown', branch: true, description: 'Roda as etapas de dentro uma vez para cada item de uma lista (ou um número de vezes) e depois segue o fluxo. Dentro, use {{vars.item}}, {{vars.item_numero}} e {{vars.item_total}}. Até 50 repetições.', fields: [
      f('mode', 'Repetir', 'select', { options: [['list', 'Para cada item de uma lista'], ['count', 'Um número de vezes']] }),
      f('items', 'Lista (aceita variáveis)', 'textarea', { placeholder: '{{contact.tags}} ou maçã, pera, uva' }),
      f('separator', 'Separador dos itens', 'text', { value: ',', placeholder: ', ou \\n para um item por linha' }),
      f('times', 'Quantas vezes', 'number', { value: 3, min: 1, max: 50 }),
      f('variable', 'Nome da variável do item', 'text', { value: 'item', placeholder: 'item' })
    ] },
    { type: 'drip', label: 'Liberar em lotes', icon: 'clock', description: 'Deixa passar só um lote de contatos a cada intervalo; os outros esperam a vez nesta etapa. Útil para não disparar tudo de uma vez.', fields: [
      f('batch', 'Contatos por lote', 'number', { min: 1, max: 1000, value: 50, required: true }),
      f('amount', 'A cada', 'number', { min: 1, max: 1000, value: 1, required: true }),
      f('unit', 'Unidade', 'select', { options: [['minutes', 'minutos'], ['hours', 'horas'], ['days', 'dias']], value: 'hours' })
    ] },
    { type: 'goal', label: 'Evento de meta', icon: 'award', fields: [f('event', 'Meta alcançada quando', 'select', { options: [['contact_tag', 'Receber uma tag'], ['customer_replied', 'Cliente responder'], ['form_submitted', 'Enviar um formulário'], ['appointment_booked', 'Fazer um agendamento'], ['order_paid', 'Pagar um pedido'], ['opportunity_status_changed', 'Oportunidade ganha']] }), f('eventValue', 'Tag ou formulário (opcional)', 'text'),
      f('otherwise', 'Ao chegar aqui sem a meta', 'select', { options: [['continue', 'Seguir o fluxo'], ['wait', 'Esperar a meta'], ['end', 'Encerrar o fluxo']] })] },
    { type: 'goto', label: 'Ir para outra etapa', icon: 'updown', fields: [f('target', 'Etapa de destino', 'step', { required: true })] },
    { type: 'custom_event', label: 'Disparar evento personalizado', icon: 'flow', description: 'Dispara um evento com nome e dados. Os fluxos com o gatilho Evento personalizado de mesmo nome começam na hora, com este contato (se houver) e os dados em {{trigger.campo}}. Limites: o fluxo não dispara a si mesmo, até 5 eventos por execução, até 3 fluxos em sequência e até 50 fluxos por cascata.', fields: [
      f('event', 'Nome do evento', 'text', { required: true, placeholder: 'ex.: pedido_aprovado' }),
      f('data', 'Dados (um por linha, campo=valor, aceita variáveis)', 'textarea', { placeholder: 'valor={{vars.total}}\norigem=site' })
    ] },
    { type: 'add_to_workflow', label: 'Adicionar a outro fluxo', icon: 'flow', fields: [f('workflowId', 'Fluxo', 'ref', { source: 'workflows', required: true })] },
    { type: 'remove_from_workflow', label: 'Remover de um fluxo', icon: 'close', fields: [f('workflowId', 'Fluxo', 'ref', { source: 'workflows', empty: 'Este fluxo' })] },
    { type: 'remove_from_all_workflows', label: 'Remover de todos os fluxos', icon: 'close', description: 'Tira o contato de todos os fluxos em que ele está rodando ou esperando.', fields: [
      f('scope', 'Incluindo este fluxo?', 'select', { options: [['others', 'Não: este fluxo continua'], ['all', 'Sim: este fluxo também termina aqui']] })
    ] },
    { type: 'custom_code', label: 'Código personalizado', icon: 'code', description: 'Calcula valores com a linguagem de expressões do Graao, uma linha por variável: nome = expressão. Cada linha pode usar as anteriores pelo nome, o contato (contact), o gatilho (trigger), as variáveis (vars) e as etapas (steps); as próximas etapas leem o resultado em {{vars.nome}}. Roda isolado, sem rede e sem disco. Ex.: total = number(trigger.total) * 0.9', fields: [
      f('code', 'Código (uma linha por variável: nome = expressão; // para comentar)', 'textarea', { required: true, placeholder: '// Desconto de 10% e primeiro nome em maiúsculas\ntotal = number(trigger.total) * 0.9\nnome = upper(contact.first_name)\nvip = total > 1000 ? "sim" : "não"' })
    ] },
    { type: 'math', label: 'Operação matemática', icon: 'sort', fields: [f('field', 'Campo numérico', 'ref', { source: 'numberFields', required: true }), f('op', 'Operação', 'select', { options: [['add', 'Somar'], ['subtract', 'Subtrair'], ['multiply', 'Multiplicar'], ['divide', 'Dividir'], ['set', 'Definir como']] }), f('number', 'Valor', 'number', { required: true, value: 1 })] },
    { type: 'text_format', label: 'Formatar texto', icon: 'edit', fields: [f('field', 'Campo', 'ref', { source: 'textFields', required: true }), f('op', 'Formato', 'select', { options: [['upper', 'MAIÚSCULAS'], ['lower', 'minúsculas'], ['title', 'Primeira Letra Maiúscula'], ['trim', 'Sem espaços nas pontas']] })] },
    { type: 'date_format', label: 'Formatar data', icon: 'clock', description: 'Guarda uma data formatada em {{vars.nome}}. Aceita AAAA-MM-DD, data com hora ou a palavra hoje.', fields: [f('value', 'Data', 'text', { required: true, placeholder: '2026-12-01, {{vars.data}} ou hoje' }), f('days', 'Somar dias', 'number', { value: 0, min: -3650, max: 3650 }), f('format', 'Formato', 'select', { options: [['br', 'DD/MM/AAAA'], ['iso', 'AAAA-MM-DD'], ['long', 'Por extenso (21 de novembro de 2026)'], ['weekday', 'Dia da semana'], ['time', 'Hora (HH:MM)']] }), f('variable', 'Nome da variável', 'text', { required: true, placeholder: 'data' })] },
    { type: 'number_format', label: 'Formatar número', icon: 'sort', description: 'Guarda um número formatado em {{vars.nome}}.', fields: [f('value', 'Número', 'text', { required: true, placeholder: '{{trigger.total}}' }), f('format', 'Formato', 'select', { options: [['brl', 'Moeda (R$ 1.234,56)'], ['decimal', 'Duas casas (1.234,56)'], ['integer', 'Inteiro (1.235)'], ['percent', 'Percentual (12,5%)']] }), f('variable', 'Nome da variável', 'text', { required: true, placeholder: 'valor' })] },
    { type: 'whatsapp_window', label: 'Janela de atendimento do WhatsApp', icon: 'whatsapp', description: 'Confere se o contato mandou WhatsApp nas últimas 24 horas (a janela de atendimento). Guarda aberta ou fechada em {{vars.nome}} e os minutos que restam em {{vars.nome_minutos}}, para usar num Se / Senão.', fields: [
      f('variable', 'Guardar na variável', 'text', { required: true, value: 'janela_whatsapp' })
    ] },
    { type: 'list_format', label: 'Formatar lista', icon: 'list', description: 'Trata um texto como lista (itens separados por vírgula ou outro separador) e guarda o resultado em {{vars.nome}}.', fields: [
      f('value', 'Lista (aceita variáveis)', 'textarea', { required: true, placeholder: '{{contact.tags}} ou maçã, pera, uva' }),
      f('separator', 'Separador dos itens', 'text', { value: ',', placeholder: ', ou \\n para um item por linha' }),
      f('op', 'O que fazer', 'select', { options: [['count', 'Contar os itens'], ['first', 'Primeiro item'], ['last', 'Último item'], ['item', 'Item na posição'], ['contains', 'Contém o valor (yes ou no)'], ['unique', 'Tirar repetidos'], ['sort', 'Ordenar de A a Z'], ['reverse', 'Inverter a ordem'], ['join', 'Juntar de novo']] }),
      f('position', 'Posição (1 = primeiro, -1 = último)', 'number', { value: 1, min: -1000, max: 1000 }),
      f('search', 'Valor procurado', 'text', { placeholder: 'Só para “Contém o valor”' }),
      f('joiner', 'Juntar o resultado com', 'select', { options: [['comma', 'Vírgula (a, b)'], ['semicolon', 'Ponto e vírgula (a; b)'], ['pipe', 'Barra (a | b)'], ['and', 'A palavra e (a e b)'], ['line', 'Um por linha'], ['space', 'Espaço (a b)'], ['none', 'Nada (ab)']] }),
      f('variable', 'Nome da variável', 'text', { required: true, placeholder: 'lista' })
    ] },
    { type: 'webhook', label: 'Webhook de saída', icon: 'send', fields: [f('url', 'Endereço (https://)', 'text', { required: true, placeholder: 'https://' }), f('method', 'Método', 'select', { options: [['POST', 'POST'], ['PUT', 'PUT'], ['GET', 'GET']] })] },
    { type: 'custom_webhook', label: 'Webhook personalizado', icon: 'send', description: 'Chama uma API com o método, os cabeçalhos e o corpo que você escrever (todos aceitam variáveis) e espera a resposta: o corpo fica em {{vars.nome}}, o código HTTP em {{vars.nome_status}} e, numa resposta JSON, cada campo simples em {{vars.nome_campo}}. Só endereços https públicos.', fields: [
      f('method', 'Método', 'select', { options: [['POST', 'POST'], ['GET', 'GET'], ['PUT', 'PUT'], ['PATCH', 'PATCH'], ['DELETE', 'DELETE']] }),
      f('url', 'Endereço (https://, aceita variáveis)', 'text', { required: true, placeholder: 'https://api.exemplo.com/clientes?email={{contact.email}}' }),
      f('headers', 'Cabeçalhos (um por linha, Nome: valor)', 'textarea', { placeholder: 'Authorization: Bearer {{custom_values.chave_api}}' }),
      f('contentType', 'Formato do corpo (GET e DELETE não levam corpo)', 'select', { options: [['json', 'JSON'], ['form', 'Formulário (campo=valor por linha)'], ['none', 'Sem corpo']] }),
      f('body', 'Corpo (JSON vazio = dados do contato e do gatilho)', 'textarea', { placeholder: '{"nome": "{{contact.name}}", "email": "{{contact.email}}"}' }),
      f('variable', 'Guardar a resposta na variável', 'text', { required: true, value: 'resposta' })
    ] },
    { type: 'end', label: 'Encerrar fluxo', icon: 'close' }
  ] }
];

// T.2: the triggers and actions of the connector catalog (Configurações → Conectores), one group per app.
triggerCatalog.push(...connectorTriggerGroups());
actionCatalog.push(...connectorActionGroups());
export const allTriggers = triggerCatalog.flatMap(group => group.items.map(item => ({ ...item, group: group.group })));
export const allActions = actionCatalog.flatMap(group => group.items.map(item => ({ ...item, group: group.group })));
export const triggerSpec = type => allTriggers.find(item => item.type === type);
export const actionSpec = type => allActions.find(item => item.type === type);

// "nome = descrição" lines of the extract action, as variable names the engine can store.
export const aiVariableName = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
export function aiExtractFields(text) {
  const seen = new Set();
  return String(text || '').split('\n').map(line => {
    const [name, ...rest] = line.split('=');
    return { name: aiVariableName(name), description: rest.join('=').trim().slice(0, 200) };
  }).filter(item => item.name && !seen.has(item.name) && seen.add(item.name)).slice(0, 12);
}
export const aiOptions = text => [...new Set(String(text || '').split(',').map(item => item.trim()).filter(Boolean))].slice(0, 12);

export const variables = [['{{contact.first_name}}', 'Primeiro nome'], ['{{contact.name}}', 'Nome completo'], ['{{contact.email}}', 'E-mail'], ['{{contact.phone}}', 'Telefone'], ['{{contact.company}}', 'Empresa'], ['{{workspace.name}}', 'Nome do workspace'], ['{{trigger.body}}', 'Mensagem recebida'], ['{{trigger.form}}', 'Formulário'], ['{{trigger.total}}', 'Total do pedido']];

// Old one-trigger, linear workflows in the new shape.
const legacyTrigger = { 'Contact created': 'contact_created', 'Form submitted': 'form_submitted', 'Opportunity stage changed': 'pipeline_stage_changed', 'Appointment booked': 'appointment_booked', 'Trigger link clicked': 'trigger_link_clicked', 'Customer replied': 'customer_replied' };
const legacyAction = { 'Add tag': ['add_tag', a => ({ tag: a.value })], 'Remove tag': ['remove_tag', a => ({ tag: a.value })], 'Create task': ['create_task', a => ({ title: a.value, dueDays: 1 })],
  'Create opportunity': ['create_opportunity', a => ({ title: a.value, stageId: '', value: 0 })], 'Log message': ['add_note', a => ({ body: a.value })], 'Send WhatsApp': ['send_whatsapp', a => ({ body: a.value })], 'Send SMS': ['send_sms', a => ({ body: a.value })],
  'Manual Call': ['manual_call', a => ({ body: a.value, assignee: a.assignee || '' })], 'Manual SMS': ['manual_sms', a => ({ body: a.value, assignee: a.assignee || '' })] };
export const legacyTriggerType = name => legacyTrigger[name] || '';

let seq = 0;
export const stepId = () => `n${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function upgradeWorkflow(row) {
  // A row in the new shape, unless an old client sent the legacy trigger/actions fields on top of it.
  if (Array.isArray(row?.triggers) && Array.isArray(row?.steps) && !row.trigger && !Array.isArray(row.actions)) return row;
  const type = legacyTrigger[row?.trigger];
  const config = type === 'form_submitted' ? { formId: row.formId || '' } : type === 'pipeline_stage_changed' ? { stageId: row.stageId || '' }
    : type === 'trigger_link_clicked' ? { linkId: row.linkId || '' } : type === 'customer_replied' ? { channel: row.channel || '', keyword: row.keyword || '' } : {};
  const steps = (row?.actions || []).map(action => {
    const [kind, map] = legacyAction[action.type] || ['add_note', a => ({ body: a.value })];
    return { id: stepId(), type: kind, config: map(action) };
  });
  const { trigger, actions, linkId, formId, stageId, channel, keyword, ...rest } = row || {};
  return { ...rest, triggers: type ? [{ id: stepId(), type, config }] : [], steps };
}

// The steps of a workflow as a flat list (with branches), for goto targets and validation.
export function eachStep(steps, visit, path = []) {
  for (const step of steps || []) {
    visit(step, path);
    if (step.type === 'if_else') { eachStep(step.yes, visit, [...path, step.id, 'yes']); eachStep(step.no, visit, [...path, step.id, 'no']); }
    if (step.type === 'router' || step.type === 'split') (step.routes || []).forEach(route => eachStep(route.steps, visit, [...path, step.id, route.id]));
    if (step.type === 'router') eachStep(step.otherwise, visit, [...path, step.id, 'otherwise']);
    if (step.type === 'loop') eachStep(step.body, visit, [...path, step.id, 'body']);
  }
}

// Teste A/B: the paths' shares as whole percents, 0 to 100 each.
export const splitPercent = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

export function stepSummary(step, s) {
  const c = step.config || {};
  const ref = (source, id) => (refSources[source]?.(s) || []).find(([key]) => key === id)?.[1] || '';
  switch (step.type) {
    case 'add_tag': case 'remove_tag': return c.tag;
    case 'update_field': return `${ref('contactFields', c.field) || 'Campo'} = ${c.value || ''}`;
    case 'send_email': return c.subject;
    case 'wait': return c.mode === 'until' ? (c.until ? new Date(c.until).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Data a definir') : c.mode === 'event' ? `Até: ${(actionSpec('wait').fields.find(x => x.key === 'event').options.find(([k]) => k === c.event) || [])[1] || 'evento'}${c.timeoutDays ? ` (até ${c.timeoutDays} d)` : ''}` : `${c.amount || 1} ${({ minutes: 'min', hours: 'h', days: 'dia(s)' })[c.unit || 'days']}`;
    case 'if_else': case 'filter': return `${(step.config?.conditions || []).length || 0} condição(ões)`;
    case 'set_variable': return c.name ? `vars.${c.name}` : '';
    case 'ai_decision': return `${String(c.options || '').slice(0, 50)} → vars.${c.variable || 'decisao'}`;
    case 'ai_intent': return `${String(c.intents || '').slice(0, 50)} → vars.${c.variable || 'intencao'}`;
    case 'ai_agent': return [ref('agents', c.agentId), c.variable ? `→ vars.${c.variable}` : ''].filter(Boolean).join(' ');
    case 'conversation_ai': return [ref('agents', c.agentId), c.mode === 'suggest' ? 'sugere' : 'responde', c.variable ? `→ vars.${c.variable}` : ''].filter(Boolean).join(' ');
    case 'conversation_ai_status': return c.state === 'off' ? 'desligar' : ['ligar', ref('agents', c.agentId)].filter(Boolean).join(' ');
    case 'ai_prompt': case 'ai_summarize': case 'ai_translate': case 'ai_image': case 'ai_image_generate': case 'ai_video_generate': return c.variable ? `→ vars.${c.variable}` : '';
    case 'ai_extract': return aiExtractFields(c.fields).map(item => `vars.${item.name}`).join(', ').slice(0, 80);
    case 'router': return `${(step.routes || []).length} caminho(s)`;
    case 'split': return (step.routes || []).map(route => `${route.label} ${splitPercent(route.percent)}%`).join(' · ').slice(0, 80);
    case 'loop': return c.mode === 'count' ? `${c.times || 0} vez(es)` : `Cada item de ${String(c.items || '').slice(0, 40) || '…'}`;
    case 'drip': return `${c.batch || 0} a cada ${c.amount || 1} ${({ minutes: 'min', hours: 'h', days: 'dia(s)' })[c.unit || 'hours']}`;
    case 'register_event': return ref('communityEvents', c.eventId);
    case 'grant_channel_access': case 'revoke_channel_access': return ref('privateChannels', c.channel);
    case 'grant_offer': case 'revoke_offer': return ref('offers', c.offerId);
    case 'community_points': return [ref('communities', c.communityId), c.points ? `${c.points > 0 ? '+' : ''}${c.points} pts` : ''].filter(Boolean).join(' · ');
    case 'book_appointment': return ref('services', c.serviceId) + (Number(c.afterDays) ? ` · em ${c.afterDays} dia(s)` : '');
    case 'booking_link': return [ref('services', c.serviceId) || 'Qualquer serviço', `${c.days || 7} dia(s)`].join(' · ');
    case 'appointment_note': return String(c.body || '').slice(0, 60);
    case 'company_create': return c.name || '';
    case 'company_update': return c.field ? `${c.field} = ${String(c.value || '').slice(0, 50)}` : '';
    case 'company_clear': return ({ all: 'Todos os campos', contact: 'Telefone, e-mail e site', address: 'Endereço completo' })[c.field] || c.field || '';
    case 'email_verify': return c.invalidTag ? `Inválido → tag ${c.invalidTag}` : '→ vars.email_status';
    case 'marketing_audit': return `→ vars.${c.variable || 'auditoria'}`;
    case 'merge_contact': return `${({ email: 'Mesmo e-mail', phone: 'Mesmo telefone' })[c.by] || 'Mesmo e-mail ou telefone'} · ${c.keep === 'oldest' ? 'mantém o mais antigo' : 'mantém este'}`;
    case 'list_format': return c.variable ? `→ vars.${c.variable}` : '';
    case 'whatsapp_window': return `→ vars.${c.variable || 'janela_whatsapp'}`;
    case 'custom_event': return c.event ? `evento ${c.event}` : '';
    case 'copy_contact': return c.workspace ? 'para outra subconta' : '';
    case 'whatsapp_media': return c.fileName || c.url || '';
    case 'whatsapp_typing': return `${c.seconds || 3} s`;
    case 'whatsapp_interactive': return { buttons: 'Botões', list: 'Lista', poll: 'Enquete' }[c.kind || 'buttons'] || '';
    case 'meta_conversion': return c.event === 'custom' ? c.customEvent || '' : c.event || 'Lead';
    case 'google_ads_conversion': return c.actionId ? `ação ${c.actionId}` : '';
    case 'ga4_event': return c.event === 'custom' ? c.customEvent || '' : c.event || 'generate_lead';
    case 'meta_audience': return `${c.op === 'remove' ? 'tirar de' : 'incluir em'} ${c.audienceId || '…'}`;
    case 'remove_from_all_workflows': return c.scope === 'all' ? 'Inclusive este' : 'Menos este';
    case 'update_affiliate': return ({ active: 'Ativo', paused: 'Pausado', pending: 'Aguardando aprovação' })[c.status] || '';
    case 'add_affiliate_campaign': case 'remove_affiliate_campaign': return ref('affiliateCampaigns', c.campaignId);
    case 'assign_affiliate_lead': return ref('affiliates', c.affiliateId);
    case 'affiliate_manual_sale': return c.amount ? `R$ ${c.amount}` : '';
    case 'create_task': case 'create_opportunity': case 'create_invoice': return c.title;
    case 'add_to_workflow': case 'remove_from_workflow': return ref('workflows', c.workflowId) || (step.type === 'remove_from_workflow' ? 'Este fluxo' : '');
    case 'webhook': return c.url;
    case 'custom_webhook': return [`${c.method || 'POST'} ${c.url || ''}`.trim(), `→ vars.${c.variable || 'resposta'}`].join(' ');
    case 'math': return `${ref('numberFields', c.field)} ${({ add: '+', subtract: '−', multiply: '×', divide: '÷', set: '=' })[c.op] || ''} ${c.number ?? ''}`;
    case 'voice_ai_call': return [ref('agents', c.agentId), ref('phoneNumbers', c.numberId)].filter(Boolean).join(' · ');
    case 'call': case 'voicemail_drop': return ref('phoneNumbers', c.numberId);
    case 'ivr_say': return String(c.kind === 'play' ? c.url : c.message || '').slice(0, 80);
    case 'ivr_gather': return `${String(c.message || '').slice(0, 50)} → vars.${c.variable || 'ivr_digitos'}`;
    case 'ivr_connect': return String(c.to || '').split('\n').filter(Boolean).join(', ').slice(0, 80);
    default: return String(c.body || c.user || c.status || '').slice(0, 80);
  }
}

export function triggerSummary(trigger, s) {
  const spec = triggerSpec(trigger.type), c = trigger.config || {};
  const parts = (spec?.fields || []).map(field => {
    const value = c[field.key];
    if (value === undefined || value === '') return '';
    if (field.kind === 'ref') return (refSources[field.source]?.(s) || []).find(([key]) => key === value)?.[1] || '';
    if (field.kind === 'select') return (field.options.find(([key]) => key === String(value)) || [])[1] || '';
    return String(value);
  }).filter(Boolean);
  return parts.join(' · ');
}
