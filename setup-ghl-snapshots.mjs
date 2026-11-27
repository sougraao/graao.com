// Setups convertidos dos snapshots GHL da agência (agente IA IMOB, cold email, site inteligente e crewsystems pt-br).
// Cada snapshot foi lido na subconta de origem (pipelines, workflows, agentes, campos, valores e tags) e reescrito em ativos nativos:
// workflows no formato v2 do motor do Graao, campos/valores com as mesmas chaves usadas nas mensagens e dados de empresas reais trocados por campos a preencher.
import { randomUUID } from 'node:crypto';
import { agentTemplate } from './agent-model.mjs';
import { slug } from './ui/crm-data.js';

// ---- Construtores ----------------------------------------------------------------
const steps = prefix => { let n = 0; return (type, config = {}, extra = {}) => ({ id: `${prefix}${String(++n).padStart(4, '0')}`, type, config, ...extra }); };
const trigger = (id, type, config = {}) => ({ id, type, config });
const field = (name, type = 'Single line', { folder = '', object = 'Contact', options = [] } = {}) =>
  ({ id: `cf-${slug(`${object}-${name}`)}`, name, object, type, options, folder, placeholder: '', key: `${object === 'Company' ? 'business' : object.toLowerCase()}.${slug(name)}` });
const value = (name, folder, val = '') => ({ id: `cv-${slug(name)}`, name, folder, value: val, key: `custom_values.${slug(name)}` });
const tag = (name, category = '') => ({ id: `tg-${slug(name)}`, name, description: '', category });
const service = (id, name, duration, description, color = '#b71889') => ({ id, name, description, kind: 'appointment', duration, buffer: 0, price: 0, staffIds: [], resourceIds: [], rentalUnit: '', maxUnits: 1, active: true, color });
const cv = name => `{{custom_values.${slug(name)}}}`;
const chat = (id, name, extra = {}) => ({ id, name, type: 'live', active: false, color: '#155eef', position: 'right', agentName: 'Equipe', heading: 'Fale com a gente', subheading: 'Respondemos em poucos minutos.',
  prompt: 'Quer um orçamento? Fale com a gente por aqui.', promptDelay: 8, welcome: 'Oi! Como podemos ajudar?', thanks: 'Recebemos sua mensagem. Já vamos te responder!', legal: '',
  askName: 'required', askEmail: 'optional', askPhone: 'required', tags: [], ...extra });
const faq = (id, question, text) => ({ id, kind: 'faq', title: question.slice(0, 80), question, text });

// ================================================================================
// 1. Agente IA Imobiliário (snapshot "agente IA IMOB (exemplo)")
// ================================================================================
const im = steps('imw');
const imobPrompt = `## Personalidade
Você é a Sofia, consultora virtual da ${cv('Imobiliária - Nome')}, imobiliária de ${cv('Imobiliária - Cidade')} especializada em imóveis de médio e alto padrão.
Seu tom é sofisticado, mas acessível; acolhedor e empático (comprar ou alugar imóvel é uma decisão importante); consultivo (você orienta, não empurra) e confiante na experiência da imobiliária, sem ser vendedora agressiva.
Use linguagem elegante, clara e direta. Mostre conhecimento dos bairros da cidade e ofereça informações úteis que o cliente ainda não perguntou. Trate cada lead como único.
Evite parecer um robô ou script decorado, respostas genéricas, pressão ou urgência artificial e linguagem burocrática.

## Meta
Qualificar o lead e agendar uma visita ou uma call com o corretor especialista da região.
Fluxo de qualificação:
1. Entender a necessidade (compra, venda, aluguel ou investimento).
2. Identificar o perfil do imóvel (tipo, tamanho, região, faixa de valor).
3. Captar nome, telefone e e-mail.
4. Agendar o próximo passo concreto (visita presencial ou call com corretor).
Regras de ouro: nunca encerre sem propor um próximo passo; se o cliente não estiver pronto, ofereça enviar opções por WhatsApp ou e-mail; confirme os dados antes de encerrar; encaminhe leads quentes imediatamente ao corretor da região.

## Informações da imobiliária
Use a base de conhecimento "Imobiliária — Base de Atendimento" para unidades, CRECI, contatos, diferenciais, serviços, regiões atendidas e empreendimentos em destaque. Nunca invente preços, metragens ou disponibilidade: se não souber, diga que o corretor confirma.

## Formato de resposta
Mensagens curtas, ideais para WhatsApp: no máximo 3 ou 4 parágrafos, com quebras de linha. Liste opções de forma simples. Termine sempre com uma pergunta ou chamada clara.`;

export const imobIaSpec = {
  id: 'ghl-imobiliaria-agente-ia',
  title: 'Imobiliária com Agente de IA — Sofia, Consultora Virtual',
  summary: 'Agente de IA que qualifica compradores, locatários e investidores e agenda visitas com o corretor: pipeline, 3 workflows, base de conhecimento, 2 calendários e campos de qualificação.',
  description: 'A Sofia atende 24h no WhatsApp e no chat, entende a necessidade (compra, venda, aluguel ou investimento), o perfil do imóvel e a faixa de valor, capta os dados de contato e agenda visita ou call com o corretor. Workflows: Nova visita (confirmação + aviso ao corretor), Lead quente → corretor da região e Follow-up automático quando o contato para de responder. Preencha os valores personalizados e a base de conhecimento com os dados da sua imobiliária antes de ativar.',
  category: 'Imobiliário',
  tags: ['imobiliária', 'agente de ia', 'qualificação', 'visitas', 'whatsapp'],
  assets: {
    customValues: [
      value('Imobiliária - Nome', 'Imobiliária', 'Sua Imobiliária'), value('Imobiliária - Cidade', 'Imobiliária', 'Sua cidade'),
      value('Imobiliária - CRECI', 'Imobiliária'), value('Imobiliária - Telefone', 'Imobiliária'), value('Imobiliária - WhatsApp', 'Imobiliária'),
      value('Imobiliária - Site', 'Imobiliária', 'https://')
    ],
    customFields: [
      field('Finalidade', 'Dropdown (single)', { folder: 'Qualificação do imóvel', options: ['Compra', 'Venda', 'Aluguel', 'Investimento'] }),
      field('Tipo de imóvel', 'Dropdown (single)', { folder: 'Qualificação do imóvel', options: ['Apartamento', 'Casa', 'Cobertura', 'Terreno', 'Sala comercial', 'Lançamento'] }),
      field('Região de interesse', 'Single line', { folder: 'Qualificação do imóvel' }),
      field('Quartos', 'Number', { folder: 'Qualificação do imóvel' }),
      field('Faixa de valor', 'Monetary', { folder: 'Qualificação do imóvel' }),
      field('Prazo para decidir', 'Dropdown (single)', { folder: 'Qualificação do imóvel', options: ['Imediato', 'Até 3 meses', 'Até 6 meses', 'Só pesquisando'] }),
      field('Corretor responsável', 'Single line', { folder: 'Atendimento' })
    ],
    tags: ['lead-ia', 'lead-quente', 'visita-agendada', 'ia-sem-resposta', 'compra', 'venda', 'aluguel', 'investimento'].map(name => tag(name, 'Imobiliária')),
    pipelines: [{ id: 'pim-atend', name: 'Atendimento Imobiliário' }],
    stages: [
      { id: 'stim-novo', pipelineId: 'pim-atend', name: 'Novo Lead (IA)' },
      { id: 'stim-qualif', pipelineId: 'pim-atend', name: 'Qualificado' },
      { id: 'stim-visita', pipelineId: 'pim-atend', name: 'Visita Agendada' },
      { id: 'stim-proposta', pipelineId: 'pim-atend', name: 'Proposta' },
      { id: 'stim-fechado', pipelineId: 'pim-atend', name: 'Negócio Fechado' }
    ],
    services: [
      service('svim-visita', 'Visita ao imóvel', 60, 'Visita presencial acompanhada pelo corretor da região.'),
      service('svim-call', 'Call com corretor', 30, 'Conversa por vídeo ou telefone para apresentar opções e tirar dúvidas.', '#155eef')
    ],
    knowledgeBases: [{
      id: 'kbim-base', name: 'Imobiliária — Base de Atendimento', description: 'Dados da imobiliária que a Sofia usa nas respostas. Substitua cada resposta pelos dados reais antes de ativar o agente.',
      sources: [
        faq('kbim-q1', 'Quais são as unidades e endereços da imobiliária?', 'Preencha: unidade, endereço e região que cada uma atende.'),
        faq('kbim-q2', 'Qual o CRECI e os contatos oficiais?', 'Preencha: CRECI, telefone fixo, WhatsApp e e-mail.'),
        faq('kbim-q3', 'Quais serviços vocês oferecem?', 'Venda de imóveis novos e usados, aluguel residencial e comercial, assessoria para investidores, financiamento bancário e pós-venda (jurídico, financeiro e decoração). Ajuste à sua operação.'),
        faq('kbim-q4', 'Em quais regiões e bairros vocês atuam?', 'Preencha os bairros e regiões atendidos, agrupados por região da cidade.'),
        faq('kbim-q5', 'Quais empreendimentos estão em destaque?', 'Preencha: nome do empreendimento, construtora, bairro e diferencial de cada lançamento.'),
        faq('kbim-q6', 'Quais são os diferenciais da imobiliária?', 'Preencha: tempo de mercado, parcerias com incorporadoras, especialidade em lançamentos e assessoria completa.')
      ]
    }],
    agents: [{
      id: 'agim-sofia', name: 'Sofia — Consultora Imobiliária (IA)', icon: 'spark', baseRefs: ['kbim-base'],
      description: 'Qualifica compradores, locatários e investidores e agenda visitas ou calls com o corretor. Convertida do agente "IA Imobi".',
      instructions: imobPrompt
    }],
    workflowFolders: [{ id: 'wfim-f1', name: 'Agente IA Imobiliário' }],
    workflows: [
      {
        id: 'wim-visita', folderId: 'wfim-f1', name: 'Nova visita — Confirmação + aviso ao corretor', active: false,
        triggers: [trigger('imt0001', 'appointment_booked')],
        steps: [
          im('add_tag', { tag: 'visita-agendada' }),
          im('create_opportunity', { title: '{{contact.name}} — Visita', stageId: 'stim-visita', value: 0 }),
          im('send_whatsapp', { body: `Perfeito, {{contact.first_name}}! Sua visita está confirmada. 🏡\n\nNo dia, o corretor da região vai te encontrar no endereço combinado. Se precisar remarcar, é só responder aqui.\n\n${cv('Imobiliária - Nome')}` }),
          im('internal_notification', { body: 'Nova visita agendada pela Sofia (IA) com {{contact.name}} — {{contact.phone}}. Confira finalidade, região e faixa de valor no contato.' }),
          im('wait', { mode: 'delay', amount: 1, unit: 'days' }),
          im('send_whatsapp', { body: 'Oi, {{contact.first_name}}! Passando para lembrar da sua visita. Qualquer dúvida sobre o imóvel ou o bairro, estou por aqui. 😊' })
        ]
      },
      {
        id: 'wim-quente', folderId: 'wfim-f1', name: 'Lead quente → corretor da região', active: false,
        triggers: [trigger('imt0002', 'contact_tag', { change: 'added', tag: 'lead-quente' })],
        steps: [
          im('create_opportunity', { title: '{{contact.name}} — Lead quente', stageId: 'stim-qualif', value: 0 }),
          im('internal_notification', { body: '🔥 Lead quente qualificado pela IA: {{contact.name}} ({{contact.phone}}). Assuma o atendimento agora e proponha visita ou call.' }),
          im('create_task', { title: 'Ligar para {{contact.name}} (lead quente da Sofia)', dueDays: 0, owner: '' })
        ]
      },
      {
        id: 'wim-followup', folderId: 'wfim-f1', name: 'Follow-up automático — contato parou de responder', active: false,
        triggers: [trigger('imt0003', 'contact_tag', { change: 'added', tag: 'ia-sem-resposta' })],
        steps: [
          im('wait', { mode: 'event', event: 'customer_replied', eventValue: '', timeoutDays: 1 }),
          im('send_whatsapp', { body: 'Oi, {{contact.first_name}}! Separei algumas opções que combinam com o que você procura. Quer que eu te envie por aqui ou prefere conversar com o corretor?' }),
          im('wait', { mode: 'event', event: 'customer_replied', eventValue: '', timeoutDays: 3 }),
          im('send_whatsapp', { body: '{{contact.first_name}}, sigo à disposição para te ajudar a encontrar o imóvel certo. Quando for um bom momento, é só me chamar. 🏡' }),
          im('remove_tag', { tag: 'ia-sem-resposta' })
        ]
      }
    ]
  }
};

// ================================================================================
// 2. Cold Email com Teste A/B (snapshot "snapshot cold email")
// ================================================================================
const ce = steps('cew');
const coldEmails = [
  ['Pergunta rápida, {{contact.first_name}}', 'Oi, {{contact.first_name}}!\n\nVi o trabalho da {{contact.company}} e fiquei com uma dúvida: hoje vocês têm uma rotina previsível para gerar novos clientes ou depende muito de indicação?\n\nNa ' + cv('Empresa remetente') + ' ajudamos empresas como a sua a ' + cv('Oferta principal') + '.\n\nFaz sentido uma conversa de 15 minutos?\n\n' + cv('Nome do remetente'),
    '{{contact.company}} + ' + cv('Empresa remetente') + '?', 'Olá, {{contact.first_name}}.\n\nSerei direto: acredito que a {{contact.company}} pode ' + cv('Oferta principal') + ' nos próximos 90 dias.\n\nSe eu te mostrar como, em 15 minutos, topa?\n\nAgende aqui: ' + cv('Link de agendamento') + '\n\n' + cv('Nome do remetente')],
  ['Como a gente fez isso em 90 dias', 'Oi, {{contact.first_name}}.\n\nUm cliente parecido com a {{contact.company}} chegou a este resultado com a gente: ' + cv('Case de resultado') + '.\n\nPosso te mostrar o passo a passo numa call rápida?\n\n' + cv('Link de agendamento') + '\n\n' + cv('Nome do remetente'),
    'Ideia para a {{contact.company}}', '{{contact.first_name}}, uma ideia rápida: o mesmo processo que gerou ' + cv('Case de resultado') + ' pode funcionar aí.\n\nVale 15 minutos para eu te explicar?\n\n' + cv('Nome do remetente')],
  ['Ainda faz sentido?', 'Oi, {{contact.first_name}}, voltando ao meu último e-mail.\n\nSe crescer com previsibilidade é prioridade para a {{contact.company}} neste trimestre, tenho horários esta semana: ' + cv('Link de agendamento') + '\n\n' + cv('Nome do remetente'),
    'Posso ajudar, {{contact.first_name}}?', '{{contact.first_name}}, sei que a agenda é corrida.\n\nSe preferir, me responda só com "sim" e eu te mando dois horários.\n\n' + cv('Nome do remetente')],
  ['O que está travando?', 'Oi, {{contact.first_name}}.\n\nNormalmente quando não recebo resposta é por um destes motivos:\n1. Não é prioridade agora\n2. Não é com você (me indica a pessoa certa?)\n3. Faltou contexto\n\nQual deles?\n\n' + cv('Nome do remetente'),
    'Pessoa certa?', '{{contact.first_name}}, talvez eu esteja falando com a pessoa errada. Quem cuida do crescimento comercial na {{contact.company}}?\n\nObrigado!\n' + cv('Nome do remetente')],
  ['Encerrando por aqui', 'Oi, {{contact.first_name}}.\n\nComo não tive retorno, vou parar de te escrever. Se em algum momento fizer sentido ' + cv('Oferta principal') + ', é só responder este e-mail.\n\nSucesso para a {{contact.company}}!\n' + cv('Nome do remetente'),
    'Último e-mail', '{{contact.first_name}}, este é meu último contato. Deixo o link caso queira conversar no futuro: ' + cv('Link de agendamento') + '\n\nAbraço,\n' + cv('Nome do remetente')]
];
const coldSequence = coldEmails.flatMap(([subjectA, bodyA, subjectB, bodyB], index) => [
  ce('split', {}, { routes: [
    { id: `cer${index + 1}a00`, label: `Email ${index + 1}.1 — Headline A`, percent: 50, steps: [ce('send_email', { subject: subjectA, body: bodyA })] },
    { id: `cer${index + 1}b00`, label: `Email ${index + 1}.2 — Headline B`, percent: 50, steps: [ce('send_email', { subject: subjectB, body: bodyB })] }
  ] }),
  ...(index < coldEmails.length - 1 ? [ce('wait', { mode: 'delay', amount: 1, unit: 'days' })] : [])
]);

export const coldEmailSpec = {
  id: 'ghl-cold-email-ab',
  title: 'Prospecção por Cold Email com Teste A/B',
  summary: 'Sequência de 5 e-mails frios com teste A/B de headline em cada envio, parada automática quando o lead responde ou agenda, pipeline de 5 etapas e notificações para o time.',
  description: 'O workflow principal cria a oportunidade, marca a tag cold-email e dispara 5 rodadas de e-mail, cada uma dividida 50/50 entre duas headlines, com 1 dia de intervalo. Quando o lead responde, ele sai da sequência, avança para "Lead Respondeu" e o time é avisado; quando agenda a reunião, vai para "Reunião agendada". Inscreva os contatos no workflow em massa pela lista de contatos. Preencha os valores personalizados (remetente, oferta, case e link de agendamento) antes de ativar.',
  category: 'B2B e SaaS',
  tags: ['cold email', 'prospecção', 'teste a/b', 'outbound', 'b2b'],
  assets: {
    customValues: [
      value('Nome do remetente', 'Cold Email'), value('Empresa remetente', 'Cold Email'),
      value('Oferta principal', 'Cold Email', 'gerar mais reuniões qualificadas todo mês'),
      value('Case de resultado', 'Cold Email', '+40% de reuniões em 90 dias'), value('Link de agendamento', 'Cold Email', 'https://')
    ],
    tags: [tag('cold-email', 'Prospecção'), tag('cold-email-respondeu', 'Prospecção')],
    pipelines: [{ id: 'pce-pipe', name: 'Pipeline Cold Email' }],
    stages: [
      { id: 'stce-contatada', pipelineId: 'pce-pipe', name: 'Leads Contatadas' },
      { id: 'stce-respondeu', pipelineId: 'pce-pipe', name: 'Lead Respondeu' },
      { id: 'stce-followup', pipelineId: 'pce-pipe', name: 'Follow Up' },
      { id: 'stce-reuniao', pipelineId: 'pce-pipe', name: 'Reunião agendada' },
      { id: 'stce-fechado', pipelineId: 'pce-pipe', name: 'Cliente Fechado' }
    ],
    services: [service('svce-diag', 'Reunião de diagnóstico (Cold Email)', 15, 'Conversa rápida com leads que responderam à sequência de cold email.', '#155eef')],
    workflowFolders: [{ id: 'wfce-f1', name: 'Cold Email' }],
    workflows: [
      {
        id: 'wce-seq', folderId: 'wfce-f1', name: 'Cold Email Workflow — Sequência A/B (5 e-mails)', active: false,
        triggers: [],
        steps: [
          ce('create_opportunity', { title: '{{contact.company}} — Cold Email', stageId: 'stce-contatada', value: 0 }),
          ce('add_tag', { tag: 'cold-email' }),
          ...coldSequence
        ]
      },
      {
        id: 'wce-resp', folderId: 'wfce-f1', name: 'Lead Respondeu → Notificar + Pipeline', active: false,
        triggers: [trigger('cet0001', 'customer_replied', { channel: 'Email', keyword: '' })],
        steps: [
          ce('remove_from_workflow', { workflowId: 'wce-seq' }),
          ce('add_tag', { tag: 'cold-email-respondeu' }),
          ce('create_opportunity', { title: '{{contact.company}} — Cold Email', stageId: 'stce-respondeu', value: 0 }),
          ce('internal_notification', { body: '📩 {{contact.name}} ({{contact.company}}) respondeu ao cold email. Responda em até 1 hora!' })
        ]
      },
      {
        id: 'wce-reuniao', folderId: 'wfce-f1', name: 'Reunião agendada: Cold E-mail', active: false,
        triggers: [trigger('cet0002', 'appointment_booked')],
        steps: [
          ce('remove_from_workflow', { workflowId: 'wce-seq' }),
          ce('create_opportunity', { title: '{{contact.company}} — Cold Email', stageId: 'stce-reuniao', value: 0 }),
          ce('internal_notification', { body: '📅 Reunião agendada via cold email com {{contact.name}} ({{contact.company}}).' })
        ]
      }
    ]
  }
};

// ================================================================================
// 3 e 4. Site Inteligente / CrewSystems (serviços locais: leads, avaliações e indicações)
// ================================================================================
const localValues = () => [
  ...['Nome da Empresa', 'Nome do Proprietário', 'E-mail da Empresa', 'Telefone da Empresa (exibição)', 'Telefone da Empresa (ligação)'].map(n => value(n, 'Dados da empresa')),
  ...['Site da Empresa', 'Facebook da Empresa', 'Instagram da Empresa', 'Perfil no Google (GMB)', 'Link de Avaliação no Google', 'Página de Termos do Site', 'Mapa do Google (embed)'].map(n => value(n, 'Contato e links', n.startsWith('Mapa') ? '' : 'https://')),
  value('Cor Principal', 'Marca', '#155eef'), value('Cor Secundária', 'Marca', '#0b1220'), value('Imagem Principal (URL)', 'Marca', 'https://'),
  value('Nome Amplo do Serviço', 'Conteúdo do site', 'Serviços residenciais'), value('Subtítulo do Site', 'Conteúdo do site'), value('Desconto por Indicação (%)', 'Ofertas', '10'),
  value('Serviços', 'Serviços'), ...Array.from({ length: 12 }, (_, i) => value(`Serviço ${i + 1}`, 'Serviços')),
  value('Áreas Atendidas', 'Áreas atendidas'), ...Array.from({ length: 14 }, (_, i) => value(`Área ${i + 1}`, 'Áreas atendidas'))
];
const localFields = () => [
  field('Nota da avaliação', 'Number', { folder: 'Avaliação' }), field('Seu feedback', 'Multi line', { folder: 'Avaliação' }),
  field('Sua mensagem', 'Multi line', { folder: 'Informações adicionais' }), field('Pesquisa', 'Single line', { folder: 'Avaliação' }),
  field('Valor do lead', 'Monetary', { folder: 'Oportunidade', object: 'Opportunity' }), field('Motivo da perda', 'Single line', { folder: 'Oportunidade', object: 'Opportunity' })
];
const localTags = () => ['avaliacao-5-estrelas-solicitada', 'lead-chat-site', 'cliente', 'lead-facebook', 'feedback-negativo', 'lead-formulario', 'lead-instagram',
  'ligacao-perdida', 'indicacao-cliente-recorrente', 'lead-indicacao', 'formulario-desconto', 'reativacao-base', 'avaliacao-respondida'].map(name => tag(name, 'Serviços locais'));
const owner = `- ${cv('Nome do Proprietário')} da ${cv('Nome da Empresa')}`;

function localWorkflows(prefix) {
  const w = steps(`${prefix}w`);
  const t = (n, type, config) => trigger(`${prefix}t${String(n).padStart(4, '0')}`, type, config);
  const confirm = (canal, tagName) => [
    w('add_tag', { tag: tagName }),
    w('create_opportunity', { title: '{{contact.name}}', stageId: `${prefix}-st-nova`, value: 0 }),
    w('wait', { mode: 'delay', amount: 1, unit: 'minutes' }),
    w('send_whatsapp', { body: `Oi, {{contact.first_name}}! Recebemos sua mensagem pelo ${canal}. 😊\n\nPara agilizar seu orçamento, pode me contar qual serviço você precisa e o endereço?\n\n${owner}` }),
    w('internal_notification', { body: `Novo lead pelo ${canal}: {{contact.name}} — {{contact.phone}}.` })
  ];
  return [
    // Pasta: Novas leads
    { id: `${prefix}-wf-10dias`, folderId: `${prefix}-f-leads`, name: '10 dias se passaram → Lembrete do formulário de marketing para o cliente', active: false,
      triggers: [t(1, 'contact_tag', { change: 'added', tag: 'cliente' })],
      steps: [w('wait', { mode: 'delay', amount: 10, unit: 'days' }), w('send_whatsapp', { body: `Oi, {{contact.first_name}}! Já faz 10 dias do nosso serviço. Conta pra gente como ficou? Se puder, responda nosso formulário rápido: ${cv('Site da Empresa')}\n\n${owner}` })] },
    { id: `${prefix}-wf-ligacao`, folderId: `${prefix}-f-leads`, name: 'Automação de ligação perdida', active: false,
      triggers: [t(2, 'call_details', { direction: 'inbound', status: 'missed' }), t(3, 'call_details', { direction: 'inbound', status: 'busy' })],
      steps: [
        w('add_tag', { tag: 'ligacao-perdida' }),
        w('wait', { mode: 'delay', amount: 1, unit: 'minutes' }),
        w('send_whatsapp', { body: `Oi, desculpa ter perdido seu contato! Vou te retornar o mais rápido possível!\n\nSe quiser me passar alguns detalhes sobre o serviço, vai ser ótimo. Você pode clicar neste link para solicitar um orçamento gratuito:\n\n${cv('Site da Empresa')}\n\n${owner}` }),
        w('create_opportunity', { title: '{{contact.name}} — Ligação perdida', stageId: `${prefix}-st-nova`, value: 0 }),
        w('create_task', { title: 'Retornar ligação perdida de {{contact.name}}', dueDays: 0, owner: '' })
      ] },
    { id: `${prefix}-wf-chat`, folderId: `${prefix}-f-leads`, name: 'Entrada de lead pelo chat do site → Confirmação', active: false,
      triggers: [t(4, 'chat_started', { widgetId: `${prefix}-chat` })], steps: confirm('chat do site', 'lead-chat-site') },
    { id: `${prefix}-wf-form`, folderId: `${prefix}-f-leads`, name: 'Envio de formulário → Confirmação', active: false,
      triggers: [t(5, 'form_submitted', { formId: `${prefix}-form-site` })], steps: confirm('formulário do site', 'lead-formulario') },
    { id: `${prefix}-wf-fb`, folderId: `${prefix}-f-leads`, name: 'Mensagem do Facebook recebida → Confirmação', active: false,
      triggers: [t(6, 'social_dm_received', { network: 'facebook', keyword: '' })], steps: confirm('Facebook', 'lead-facebook') },
    { id: `${prefix}-wf-ig`, folderId: `${prefix}-f-leads`, name: 'Mensagem do Instagram recebida → Confirmação', active: false,
      triggers: [t(7, 'social_dm_received', { network: 'instagram', keyword: '' })], steps: confirm('Instagram', 'lead-instagram') },
    // Pasta: Avaliação / indicação
    { id: `${prefix}-wf-negativo`, folderId: `${prefix}-f-review`, name: 'Feedback negativo recebido', active: false,
      triggers: [t(8, 'review_received', { maxScore: 3 })],
      steps: [w('add_tag', { tag: 'feedback-negativo' }), w('internal_notification', { body: '⚠️ Feedback negativo de {{contact.name}} ({{contact.phone}}). Entre em contato hoje para resolver.' }),
        w('send_whatsapp', { body: `{{contact.first_name}}, sentimos muito que sua experiência não foi perfeita. Vou te ligar pessoalmente para entender e resolver.\n\n${owner}` })] },
    { id: `${prefix}-wf-desconto`, folderId: `${prefix}-f-review`, name: 'Formulário de desconto preenchido → Notificar lead e contratante', active: false,
      triggers: [t(9, 'form_submitted', { formId: `${prefix}-form-desconto` })],
      steps: [w('add_tag', { tag: 'formulario-desconto' }), w('add_tag', { tag: 'lead-indicacao' }),
        w('send_whatsapp', { body: `Oi, {{contact.first_name}}! Você ganhou ${cv('Desconto por Indicação (%)')}% de desconto no seu primeiro serviço com a ${cv('Nome da Empresa')}. 🎉 Quando quer agendar?` }),
        w('internal_notification', { body: 'Nova indicação com desconto: {{contact.name}} — {{contact.phone}}. Avise o cliente que indicou e agende o serviço.' })] },
    { id: `${prefix}-wf-indique`, folderId: `${prefix}-f-review`, name: 'Indique um Amigo + Cliente Recorrente + Solicitação de Avaliação → Acompanhamento de 1 Ano', active: false,
      triggers: [t(10, 'opportunity_status_changed', { status: 'Won' })],
      steps: [
        w('add_tag', { tag: 'cliente' }), w('add_tag', { tag: 'avaliacao-5-estrelas-solicitada' }),
        w('wait', { mode: 'delay', amount: 1, unit: 'days' }), w('review_request', { channel: 'WhatsApp' }),
        w('wait', { mode: 'delay', amount: 30, unit: 'days' }),
        w('send_whatsapp', { body: `Oi, {{contact.first_name}}! Gostou do nosso serviço? Indique um amigo: ele ganha ${cv('Desconto por Indicação (%)')}% de desconto e você também. 🎁` }),
        w('add_tag', { tag: 'indicacao-cliente-recorrente' }),
        w('wait', { mode: 'delay', amount: 90, unit: 'days' }),
        w('send_whatsapp', { body: `{{contact.first_name}}, já está na hora da próxima manutenção? Responda aqui que agendamos para você.\n\n${owner}` }),
        w('wait', { mode: 'delay', amount: 180, unit: 'days' }),
        w('send_whatsapp', { body: `Oi, {{contact.first_name}}! Faz quase 1 ano do seu primeiro serviço com a ${cv('Nome da Empresa')}. Obrigado pela confiança! Quer aproveitar a agenda deste mês?` })
      ] },
    { id: `${prefix}-wf-link-review`, folderId: `${prefix}-f-review`, name: 'Link de avaliação atualizado → Solicitar avaliações', active: false,
      triggers: [t(11, 'contact_tag', { change: 'added', tag: 'avaliacao-5-estrelas-solicitada' })],
      steps: [w('send_whatsapp', { body: `{{contact.first_name}}, sua opinião ajuda muito outros clientes! Pode deixar sua avaliação aqui? Leva 30 segundos: ${cv('Link de Avaliação no Google')}\n\n${owner}` })] },
    { id: `${prefix}-wf-clicou`, folderId: `${prefix}-f-review`, name: 'Link de disparo clicado → Remover do follow-up de avaliação', active: false,
      triggers: [t(12, 'trigger_link_clicked', { linkId: `${prefix}-link-5` })],
      steps: [w('add_tag', { tag: 'avaliacao-respondida' }), w('remove_tag', { tag: 'avaliacao-5-estrelas-solicitada' }), w('remove_from_workflow', { workflowId: `${prefix}-wf-followup-review` })] },
    { id: `${prefix}-wf-followup-review`, folderId: `${prefix}-f-review`, name: 'Solicitação de avaliação enviada → Follow-up de avaliação após 1 mês', active: false,
      triggers: [t(13, 'contact_tag', { change: 'added', tag: 'avaliacao-5-estrelas-solicitada' })],
      steps: [w('wait', { mode: 'delay', amount: 30, unit: 'days' }),
        w('send_whatsapp', { body: `Oi, {{contact.first_name}}! Lembra da avaliação? Se puder, deixe sua opinião sobre a ${cv('Nome da Empresa')}: ${cv('Link de Avaliação no Google')} ⭐⭐⭐⭐⭐` })] },
    // Raiz
    { id: `${prefix}-wf-reativacao`, folderId: '', name: 'Automação de reativação de base', active: false,
      triggers: [t(14, 'contact_tag', { change: 'added', tag: 'reativacao-base' })],
      steps: [
        w('create_opportunity', { title: '{{contact.name}} — Reativação', stageId: `${prefix}-st-oferta`, value: 0 }),
        w('send_whatsapp', { body: `Oi, {{contact.first_name}}! Faz tempo que não nos falamos. Este mês estamos com uma condição especial para clientes da ${cv('Nome da Empresa')}. Quer saber mais?` }),
        w('wait', { mode: 'event', event: 'customer_replied', eventValue: '', timeoutDays: 3 }),
        w('send_whatsapp', { body: '{{contact.first_name}}, a condição especial vale só até o fim do mês. Posso reservar um horário para você?' })
      ] }
  ];
}

function localSetup({ prefix, id, title, summary, description, tags, extra = {} }) {
  return {
    id, title, summary, description, category: 'Negócios Locais', tags,
    assets: {
      customValues: localValues(), customFields: localFields(), tags: localTags(),
      pipelines: [{ id: `${prefix}-p-com`, name: 'Pipeline Comercial' }, { id: `${prefix}-p-reat`, name: 'Reativação de Base' }],
      stages: [
        ['nova', 'Nova Lead', 'com'], ['contatada', 'Lead Contatada', 'com'], ['proposta', 'Proposta Enviada', 'com'], ['fechado', 'Cliente Fechado', 'com'],
        ['oferta', 'Oferta Enviada', 'reat'], ['reengajado', 'Cliente Reengajado', 'reat'], ['rproposta', 'Proposta Enviada', 'reat'], ['rfechado', 'Fechado', 'reat']
      ].map(([key, name, pipe]) => ({ id: `${prefix}-st-${key}`, pipelineId: `${prefix}-p-${pipe}`, name })),
      forms: [
        { id: `${prefix}-form-site`, name: 'Formulário do Website', description: 'Pedido de orçamento gratuito do site: nome, telefone, serviço desejado e endereço.', askPhone: true, active: false, kind: 'form' },
        { id: `${prefix}-form-desconto`, name: 'Formulário de Desconto (Indique um Amigo)', description: 'O amigo indicado deixa os dados e recebe o desconto de indicação.', askPhone: true, active: false, kind: 'form' },
        { id: `${prefix}-form-review`, name: 'Pesquisa de Avaliação', description: 'Nota de 1 a 5 e comentário. Notas 4 e 5 seguem para o Google; notas baixas viram atendimento.', askPhone: true, active: false, kind: 'survey' },
        ...(extra.forms || [])
      ],
      triggerLinks: [{ id: `${prefix}-link-5`, name: 'Link 5 Estrelas (Avaliação no Google)', url: 'https://g.page/r/SEU-CODIGO/review' }],
      pages: [
        { id: `${prefix}-pg-site`, name: 'Site do Cliente', headline: 'Serviços profissionais com orçamento gratuito', body: 'Site institucional pronto: serviços, áreas atendidas, avaliações e formulário de orçamento, tudo alimentado pelos valores personalizados.', button: 'Quero meu orçamento grátis', formId: `${prefix}-form-site`, kind: 'Website', active: false },
        { id: `${prefix}-pg-review`, name: 'Página de Avaliação', headline: 'Como foi sua experiência?', body: 'Sua opinião nos ajuda a melhorar e ajuda outros clientes a nos encontrar.', button: 'Enviar avaliação', formId: `${prefix}-form-review`, kind: 'Funnel', active: false },
        ...(extra.pages || [])
      ],
      chatWidgets: [chat(`${prefix}-chat`, 'Chat do Site'), ...(extra.chatWidgets || [])],
      knowledgeBases: [{ id: `${prefix}-kb`, name: 'Base do Negócio', description: 'Perguntas frequentes que o chat e os agentes usam nas respostas. Ajuste ao negócio do cliente.',
        sources: [
          faq(`${prefix}-kb1`, 'Quais serviços vocês fazem?', 'Liste aqui os serviços oferecidos (os mesmos dos valores Serviço 1 a 12).'),
          faq(`${prefix}-kb2`, 'Quais regiões vocês atendem?', 'Liste aqui as áreas atendidas (as mesmas dos valores Área 1 a 14).'),
          faq(`${prefix}-kb3`, 'O orçamento é gratuito?', 'Sim. Envie o serviço desejado e o endereço que retornamos com o orçamento.'),
          faq(`${prefix}-kb4`, 'Como funciona o desconto por indicação?', 'Quem indica e quem é indicado ganham o desconto definido no valor "Desconto por Indicação (%)".')
        ] }],
      studioProjects: [{
        id: `${prefix}-studio-site`, name: 'Site do Cliente — Serviços Locais', headline: 'Serviços com qualidade, pontualidade e orçamento gratuito',
        summary: 'Site de serviços locais alimentado pelos valores personalizados: serviços, áreas atendidas, avaliações e formulário de orçamento.',
        brief: 'Site institucional para empresa de serviços locais com foco em orçamento gratuito, prova social e áreas atendidas.',
        theme: 'emerald', template: 'landing', kind: 'website',
        blocks: [
          { title: 'Hero — Orçamento grátis', body: `${cv('Nome Amplo do Serviço')} com ${cv('Nome da Empresa')}. ${cv('Subtítulo do Site')}` },
          { title: 'Serviços', body: `${cv('Serviços')}: ${cv('Serviço 1')}, ${cv('Serviço 2')}, ${cv('Serviço 3')}, ${cv('Serviço 4')}…` },
          { title: 'Áreas atendidas', body: `${cv('Áreas Atendidas')}: ${cv('Área 1')}, ${cv('Área 2')}, ${cv('Área 3')}…` },
          { title: 'Avaliações', body: 'Depoimentos e nota no Google para gerar confiança.' },
          { title: 'Indique um amigo', body: `Ganhe ${cv('Desconto por Indicação (%)')}% de desconto indicando amigos.` },
          { title: 'Contato e orçamento', body: `Formulário de orçamento, ${cv('Telefone da Empresa (exibição)')} e mapa.` }
        ]
      }, ...(extra.studioProjects || [])],
      workflowFolders: [{ id: `${prefix}-f-leads`, name: 'Workflow de Novas Leads' }, { id: `${prefix}-f-review`, name: 'Workflow de Avaliação / Indicação' }],
      workflows: [...localWorkflows(prefix), ...(extra.workflows || [])],
      ...(extra.agents ? { agents: extra.agents } : {})
    }
  };
}

export const siteInteligenteSpec = localSetup({
  prefix: 'si',
  id: 'ghl-site-inteligente',
  title: 'Site Inteligente para Negócios Locais — Leads, Avaliações e Indicações',
  summary: 'Site de serviços locais com chat, ligação perdida que vira WhatsApp, confirmação multicanal, pedidos de avaliação, indique um amigo e reativação de base: 2 pipelines e 13 workflows.',
  description: 'Todo lead que chega pelo site, chat, formulário, Facebook, Instagram ou ligação perdida recebe resposta em 1 minuto e entra no Pipeline Comercial. Cliente fechado recebe pedido de avaliação, convite para indicar amigos com desconto e acompanhamento de 1 ano. Feedback negativo alerta a equipe na hora e a base antiga é reativada com oferta. O site e as mensagens usam 46 valores personalizados (empresa, links, serviços e áreas atendidas): preencha-os e o setup fica pronto para o cliente.',
  tags: ['serviços locais', 'site', 'avaliações', 'indicação', 'ligação perdida']
});

const cs = steps('csw');
export const crewSystemsSpec = localSetup({
  prefix: 'cs',
  id: 'ghl-crewsystems-paisagismo',
  title: 'CrewSystems — Paisagismo e Serviços Externos (PT/EN)',
  summary: 'Setup completo para paisagismo, jardinagem e serviços externos: tudo do Site Inteligente + gerador de orçamento, página de manutenção, assistente de IA, chat e pesquisa bilíngues.',
  description: 'Inclui toda a operação do Site Inteligente (13 workflows de leads, avaliações, indicações e reativação) e acrescenta o funil de Manutenção de Jardim, o formulário Gerador de Orçamento de Paisagismo, o formulário de avaliação com sequência de 1 ano, chat e pesquisa de avaliação também em inglês, o assistente de IA "Luxury Landscaping" e o lembrete sazonal de manutenção.',
  tags: ['paisagismo', 'jardinagem', 'serviços locais', 'bilíngue', 'agente de ia'],
  extra: {
    forms: [
      { id: 'cs-form-lead-gen', name: 'Gerador de Orçamento — Paisagismo', description: 'Tamanho da área, tipo de serviço (projeto, manutenção, poda, irrigação) e fotos do local.', askPhone: true, active: false, kind: 'form' },
      { id: 'cs-form-1ano', name: 'Formulário de Avaliação do Cliente + Sequência de Acompanhamento de 1 Ano', description: 'Avaliação pós-serviço que inicia o acompanhamento de 12 meses.', askPhone: true, active: false, kind: 'survey' },
      { id: 'cs-form-review-en', name: 'Review Survey (EN)', description: 'Rating 1–5 and comments for English-speaking clients.', askPhone: true, active: false, kind: 'survey' }
    ],
    pages: [{ id: 'cs-pg-lawn', name: 'Manutenção de Jardim (Lawn Maintenance)', headline: 'Seu jardim impecável o ano todo', body: 'Planos de manutenção semanal, quinzenal ou mensal com equipe uniformizada e orçamento gratuito.', button: 'Quero um plano de manutenção', formId: 'cs-form-lead-gen', kind: 'Funnel', active: false }],
    chatWidgets: [chat('cs-chat-en', 'Chat Widget - EN', { heading: 'Chat with us', subheading: 'We reply in minutes.', prompt: 'Need a free quote? Chat with us.', welcome: 'Hi! How can we help?', thanks: 'Got it! We will reply shortly.', agentName: 'Team' })],
    agents: [{ id: 'cs-ag-landscaping', name: 'Luxury Landscaping — Assistente de Orçamentos (IA)', icon: 'spark', baseRefs: ['cs-kb'],
      description: 'Atende no chat e WhatsApp, entende o projeto de paisagismo ou manutenção e agenda a visita técnica para orçamento.',
      instructions: `Você é o assistente de atendimento da ${cv('Nome da Empresa')}, empresa de paisagismo e manutenção de jardins de alto padrão. Seja cordial, objetivo e consultivo. Descubra: tipo de serviço (projeto paisagístico, manutenção recorrente, poda, irrigação ou limpeza), tamanho aproximado da área, endereço/bairro e urgência. Peça fotos do local quando ajudar. Ofereça a visita técnica gratuita para orçamento e confirme nome e telefone. Responda em português ou inglês, no idioma do cliente. Nunca informe preço fechado: diga que o orçamento é feito após a visita. Use a "Base do Negócio" para serviços e áreas atendidas.` }],
    workflows: [{
      id: 'cs-wf-sazonal', folderId: 'cs-f-review', name: 'Lembrete sazonal de manutenção (a cada 90 dias)', active: false,
      triggers: [trigger('cst0001', 'contact_tag', { change: 'added', tag: 'cliente' })],
      steps: [
        cs('wait', { mode: 'delay', amount: 90, unit: 'days' }),
        cs('send_whatsapp', { body: `Oi, {{contact.first_name}}! A nova estação chegou e é a melhor hora para cuidar do jardim (poda, adubação e revisão da irrigação). Quer que a equipe da ${cv('Nome da Empresa')} passe aí?` }),
        cs('create_opportunity', { title: '{{contact.name}} — Manutenção sazonal', stageId: 'cs-st-oferta', value: 0 })
      ]
    }]
  }
});

export const ghlSnapshotSpecs = [imobIaSpec, coldEmailSpec, siteInteligenteSpec, crewSystemsSpec];

// ---- Importação para a biblioteca de uma agência --------------------------------
// Os 4 setups não são oficiais: entram em "Meus setups" da agência do usuário que os criou (scripts/seed-setups.mjs).
// Idempotente: um setup já importado (mesmo seedId) não é duplicado.
export function seedSetups(agency, specs = ghlSnapshotSpecs, { at = new Date().toISOString(), newId = () => randomUUID() } = {}) {
  agency.snapshots ??= [];
  const added = [], skipped = [];
  for (const spec of specs) {
    if (agency.snapshots.some(snap => snap.seedId === spec.id)) { skipped.push(spec.title); continue; }
    if (agency.snapshots.length >= 50) throw new Error('A agência já tem 50 setups salvos; libere espaço antes de importar.');
    const assets = structuredClone(spec.assets);
    for (const page of assets.pages || []) page.active = false;
    for (const workflow of assets.workflows || []) workflow.active = false;
    for (const widget of assets.chatWidgets || []) widget.active = false;
    if (assets.agents) assets.agents = assets.agents.map(agent => ({ ...agentTemplate(agent), baseRefs: agent.baseRefs || [] }));
    const counts = Object.fromEntries(Object.entries(assets).map(([key, list]) => [key, list.length]).filter(([, count]) => count > 0));
    agency.snapshots.push({
      id: newId(), name: spec.title, kind: 'mine', workspace: '', include: Object.keys(assets), assets, studioSites: {}, counts, version: 1,
      created: at, updated: at, shareCode: '', shared: false, seedId: spec.id,
      marketplaceSummary: spec.summary, marketplaceDescription: spec.description, marketplaceTags: spec.tags, marketplaceCategory: spec.category
    });
    added.push(spec.title);
  }
  return { added, skipped };
}
