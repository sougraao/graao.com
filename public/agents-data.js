export const agentLimits = {
  name: 50, description: 400, instructions: 15000,
  sources: 5, sourceName: 80, sourceText: 6000, message: 2000,
  triggers: 8, triggerValue: 60, subagents: 4, subagentName: 60, subagentWhen: 300, subagentInstructions: 3000,
  memory: 30, memoryText: 300, folder: 40, request: 1500
};

export const agentIcons = ['spark', 'chat', 'users', 'search', 'star', 'leads', 'cal', 'send', 'chart', 'bulb', 'mail', 'tag'];

export const triggerGroups = [
  ['contacts', 'Contatos'], ['tags', 'Tags'], ['opportunities', 'Oportunidades'], ['appointments', 'Agendamentos'],
  ['forms', 'Formulários e pesquisas'], ['messages', 'Comunicação'], ['scheduled', 'Programados'], ['custom', 'Personalizados']
];

export const scheduleOptions = ['Diariamente', 'Semanalmente', 'A cada 2 semanas', 'Mensalmente'];

// Each trigger: id, group, label, description, icon, popular, optional value field.
export const triggerTypes = [
  { id: 'chat', group: 'messages', label: 'Mensagem no chat', text: 'Executa quando alguém conversa com o agente no Estúdio de agentes.', icon: 'chat', popular: true },
  { id: 'customer-replied', group: 'messages', label: 'Cliente respondeu', text: 'Executa quando um contato envia uma mensagem por qualquer canal.', icon: 'inbox', popular: true },
  { id: 'contact-created', group: 'contacts', label: 'Contato criado', text: 'Executa quando um novo contato entra no CRM.', icon: 'contacts' },
  { id: 'tag', group: 'tags', label: 'Tag do contato', text: 'Executa quando uma tag é adicionada a um contato.', icon: 'tag', popular: true,
    field: { label: 'Tag', placeholder: 'Ex. atendimento-concluido' } },
  { id: 'opportunity-created', group: 'opportunities', label: 'Oportunidade criada', text: 'Executa quando uma nova oportunidade é criada.', icon: 'leads' },
  { id: 'opportunity-stage', group: 'opportunities', label: 'Etapa da oportunidade alterada', text: 'Executa quando uma oportunidade muda de etapa ou de status.', icon: 'leads' },
  { id: 'appointment-booked', group: 'appointments', label: 'Compromisso agendado', text: 'Executa quando um cliente agenda um horário.', icon: 'cal', popular: true },
  { id: 'appointment-status', group: 'appointments', label: 'Status do compromisso alterado', text: 'Executa quando um compromisso é confirmado, cancelado ou marcado como falta.', icon: 'cal' },
  { id: 'form-submitted', group: 'forms', label: 'Formulário enviado', text: 'Executa quando alguém envia um formulário.', icon: 'note', popular: true },
  { id: 'survey-submitted', group: 'forms', label: 'Pesquisa respondida', text: 'Executa quando chega uma resposta de pesquisa.', icon: 'list' },
  { id: 'schedule', group: 'scheduled', label: 'Programação', text: 'Executa o agente numa frequência fixa.', icon: 'clock', popular: true,
    field: { label: 'Frequência', options: scheduleOptions } },
  { id: 'workflow', group: 'custom', label: 'Chamado por uma automação', text: 'Executa quando um workflow aciona este agente.', icon: 'flow', popular: true },
  { id: 'api', group: 'custom', label: 'Chamado pela API', text: 'Executa quando o seu sistema chama este agente pela API do graao.', icon: 'key' },
  { id: 'webhook', group: 'custom', label: 'Webhook de entrada', text: 'Executa quando um sistema externo envia uma requisição para a URL do agente.', icon: 'link' }
];

export const triggerType = id => triggerTypes.find(type => type.id === id);
export const triggerLabel = trigger => {
  const type = triggerType(trigger.type);
  return type ? `${type.label}${trigger.value ? `: ${trigger.value}` : ''}` : trigger.type;
};

export const agentResources = [
  ['webSearch', 'Pesquisa na web', 'Consulta a internet quando precisa de fatos atuais e informa as fontes.', 'search'],
  ['memory', 'Memória', 'Usa os fatos guardados sobre as pessoas e os procedimentos aprendidos em cada conversa.', 'book'],
  ['approval', 'Pedir aprovação', 'Mostra o rascunho e espera o seu sim antes de enviar, publicar ou alterar qualquer coisa.', 'check']
];

export const memoryKinds = [['person', 'Sobre as pessoas'], ['procedure', 'Procedimentos']];

const roles = { Support: 'Atendimento', Sales: 'Vendas', Scheduling: 'Agendamento' };

function resources(value = {}) {
  return Object.fromEntries(agentResources.map(([key]) => [key, Boolean(value[key])]));
}

// The editable configuration of an agent, with keys in a fixed order so drafts compare as JSON.
export function agentDraft(agent) {
  const legacy = Object.hasOwn(roles, agent.role) ? roles[agent.role] : agent.role;
  return {
    name: agent.name,
    icon: agentIcons.includes(agent.icon) ? agent.icon : 'spark',
    description: agent.description ?? legacy ?? '',
    instructions: agent.instructions || '',
    knowledge: agent.knowledge || [],
    bases: (agent.bases || []).filter(id => typeof id === 'string'),
    triggers: (agent.triggers || [{ type: 'chat' }]).map(({ type, value }) => (value ? { type, value } : { type })),
    subagents: (agent.subagents || []).map(({ name, when, instructions }) => ({ name, when, instructions })),
    resources: resources(agent.resources)
  };
}

export const agentRevision = agent => agent.revision || agent.updated || agent.created || '';

export function changedAgentFields(agent) {
  if (!agent.published) return [];
  const draft = agentDraft(agent);
  const release = agentDraft(agent.published);
  return Object.keys(draft).filter(field => JSON.stringify(draft[field]) !== JSON.stringify(release[field]));
}

export const agentFieldNames = {
  name: 'Nome', icon: 'Ícone', description: 'Descrição', instructions: 'Instruções', knowledge: 'Conhecimento', bases: 'Bases de conhecimento',
  triggers: 'Gatilhos', subagents: 'Subagentes', resources: 'Recursos'
};

const lines = list => list.join('\n');

// Starting points written for graao. Every template is editable after it is chosen.
export const agentTemplates = [
  {
    id: 'support', name: 'Atendimento ao cliente', icon: 'chat',
    description: 'Responde dúvidas de clientes com base no conhecimento da empresa e passa para a equipe o que não souber resolver.',
    triggers: [{ type: 'customer-replied' }, { type: 'chat' }], resources: { memory: true },
    instructions: lines([
      'Você atende clientes desta empresa por mensagem.',
      '',
      'Como responder',
      '- Leia a mensagem inteira e responda primeiro o que foi perguntado, em até 4 frases.',
      '- Use apenas as fontes de conhecimento para preços, prazos, políticas e horários. Se a informação não estiver nelas, diga que vai confirmar com a equipe.',
      '- Faça no máximo uma pergunta por vez quando precisar de mais contexto.',
      '- Se o cliente pedir reembolso, cancelamento ou falar com uma pessoa, diga que a equipe vai assumir a conversa e resuma o caso em uma linha.',
      '',
      'Tom: cordial, direto, sem jargão. Trate o cliente pelo primeiro nome quando souber.'
    ])
  },
  {
    id: 'lead-score', name: 'Qualificação de leads', icon: 'search',
    description: 'Pesquisa a empresa de cada novo lead, avalia o encaixe com o cliente ideal e registra uma nota com o motivo.',
    triggers: [{ type: 'form-submitted' }], resources: { webSearch: true },
    instructions: lines([
      'Você qualifica leads que acabaram de chegar por formulário.',
      '',
      'Configurações (edite para o seu negócio)',
      '- Cliente ideal: [[segmento, porte e região]]',
      '- Sinais de desencaixe: [[por exemplo, pessoa física ou fora da região]]',
      '',
      'Passos',
      '1. Identifique a empresa pelo domínio do e-mail ou pelo nome informado. Ignore domínios de e-mail gratuitos.',
      '2. Pesquise o site e notícias recentes da empresa. Anote segmento, porte aproximado e região, com a fonte.',
      '3. Dê uma nota de 1 a 5 para o encaixe com o cliente ideal e explique em até 3 linhas.',
      '4. Sugira o próximo passo: contato imediato, nutrição ou descarte.',
      '',
      'Nunca invente dados da empresa. Quando não achar uma informação, escreva "não encontrado".'
    ])
  },
  {
    id: 'review', name: 'Pedido de avaliação', icon: 'star',
    description: 'Escreve o pedido de avaliação quando um atendimento é marcado como concluído, no tom da sua marca.',
    triggers: [{ type: 'tag', value: 'atendimento-concluido' }], resources: { approval: true },
    instructions: lines([
      'Você pede avaliações a clientes que acabaram de ser atendidos.',
      '',
      'Configurações (edite para o seu negócio)',
      '- Link de avaliação: [[cole aqui o link]]',
      '- Canal preferido: SMS (ou e-mail quando não houver telefone)',
      '',
      'Escreva uma mensagem curta: agradeça pelo atendimento citando o serviço quando ele for conhecido, peça a avaliação em uma frase e inclua o link.',
      'SMS com até 300 caracteres. E-mail com assunto de até 8 palavras e corpo de até 80 palavras.',
      'Não ofereça descontos nem brindes em troca de avaliação.'
    ])
  },
  {
    id: 'deal-brief', name: 'Resumo de nova oportunidade', icon: 'leads',
    description: 'Prepara para o responsável um resumo de cada nova oportunidade, com o histórico do contato e o próximo passo.',
    triggers: [{ type: 'opportunity-created' }],
    instructions: lines([
      'Você prepara um resumo para quem vai cuidar de uma nova oportunidade.',
      '',
      'O resumo tem quatro partes curtas:',
      '1. Quem é: nome, empresa e como chegou.',
      '2. O que precisa: o pedido ou a dor principal, nas palavras do contato quando possível.',
      '3. Histórico: mensagens, compromissos e compras anteriores relevantes.',
      '4. Próximo passo sugerido, com prazo.',
      '',
      'Use no máximo 120 palavras. Marque com "(a confirmar)" tudo o que for suposição.'
    ])
  },
  {
    id: 'appointment', name: 'Confirmação de agendamento', icon: 'cal',
    description: 'Confirma cada compromisso agendado, lembra o que levar e responde dúvidas sobre o horário.',
    triggers: [{ type: 'appointment-booked' }, { type: 'customer-replied' }],
    instructions: lines([
      'Você confirma compromissos recém-agendados e tira dúvidas sobre eles.',
      '',
      '- Confirme data, horário e local (ou link) em uma mensagem curta.',
      '- Informe o que levar ou preparar, se estiver nas fontes de conhecimento.',
      '- Para remarcar ou cancelar, explique como fazer e avise que a equipe será notificada.',
      '- Nunca confirme um horário diferente do agendado.'
    ])
  },
  {
    id: 'social', name: 'Posts para redes sociais', icon: 'send',
    description: 'Transforma uma ideia, oferta ou novidade em posts adaptados a cada rede e espera a sua aprovação.',
    triggers: [{ type: 'chat' }], resources: { approval: true, webSearch: true },
    subagents: [{
      name: 'Pesquisador de marca',
      when: 'Quando precisar do tom da marca, do público ou de datas e tendências relevantes antes de escrever.',
      instructions: 'Reúna em tópicos o tom de voz, o público e até 3 ganchos atuais ligados ao tema, sempre com a fonte. Não escreva os posts.'
    }],
    instructions: lines([
      'Você cria posts para as redes sociais da empresa a pedido da equipe.',
      '',
      'Configurações (edite para o seu negócio)',
      '- Redes: Instagram, Facebook e LinkedIn',
      '- Hashtags fixas: [[opcional]]',
      '- Assuntos a evitar: [[opcional]]',
      '',
      'Para cada pedido:',
      '1. Peça ao Pesquisador de marca o tom e os ganchos, se ainda não tiver.',
      '2. Escreva um post por rede: gancho de até 12 palavras, 1 a 3 frases e uma chamada para ação.',
      '3. Hashtags: Instagram 5 a 10, LinkedIn 1 a 3, Facebook 0 a 2.',
      '4. Sugira a imagem em uma frase.',
      '5. Mostre todos os rascunhos juntos e espere a aprovação antes de qualquer agendamento.'
    ])
  },
  {
    id: 'competitors', name: 'Monitor de concorrentes', icon: 'chart',
    description: 'Verifica toda semana o que mudou nos sites e nas notícias dos concorrentes e resume com as fontes.',
    triggers: [{ type: 'schedule', value: 'Semanalmente' }], resources: { webSearch: true },
    instructions: lines([
      'Você acompanha concorrentes e relata o que mudou.',
      '',
      'Concorrentes: [[nome e site de cada um]]',
      '',
      'Para cada concorrente, procure novidades dos últimos 7 dias: preços, produtos, promoções, contratações e notícias.',
      'Relate só o que mudou, em tópicos, com o link da fonte. Termine com até 3 sugestões de reação para a equipe.',
      'Se não houver novidade, diga isso em uma linha.'
    ])
  },
  {
    id: 'weekly-report', name: 'Relatório semanal de marketing', icon: 'bulb',
    description: 'Resume os resultados da semana — leads, oportunidades e campanhas — e sugere os próximos passos.',
    triggers: [{ type: 'schedule', value: 'Semanalmente' }],
    instructions: lines([
      'Você escreve o relatório semanal de marketing para a equipe.',
      '',
      'Estrutura:',
      '1. Números da semana comparados com a semana anterior: leads novos, oportunidades criadas e ganhas, e-mails e posts publicados.',
      '2. O que funcionou e o que não funcionou, em até 3 tópicos cada.',
      '3. Três próximos passos concretos, com responsável sugerido.',
      '',
      'Use só os números que receber. Quando faltar um dado, escreva "sem dados".'
    ])
  }
];

export const agentTemplate = id => agentTemplates.find(template => template.id === id);
