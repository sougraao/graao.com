// Setup Oficial Graao: Agência Completa 360° (Prospecção → Onboarding → Retenção)
// Converte toda a operação end-to-end de agência em ativos nativos da Graao.

export const agenciaCompleta360Spec = {
  id: 'official-agencia-completa-360',
  title: 'Agência Completa 360° — Da Prospecção à Retenção',
  summary: 'Operação completa de agência: 3 pipelines, 22 workflows, 40 snippets (WhatsApp e E-mail), 7 formulários, 5 páginas/funis, 2 sites Studio e 5 agentes de IA.',
  description: 'Sistema completo end-to-end para agências de marketing, automação e CRM. Cobre toda a jornada do lead até a retenção: entrada multicanal (WhatsApp, Instagram, Meta Ads, ligação perdida), funil de consultoria gratuita com follow-up, confirmação e lembretes de agendamento + recuperação de no-show, acompanhamento de proposta, onboarding automatizado com calls de alinhamento e kickoff, gestão de cliente ativo (NPS 14 dias, reviews, aniversário, indicação, renovação), reativação de leads frios e 5 agentes de IA prontos para ativar.',
  category: 'Agências e Serviços',
  tags: ['agência 360', 'prospecção', 'onboarding', 'retenção', 'nps', 'ia'],
  assets: {
    pipelines: [
      { id: 'p360-prosp', name: 'Prospecção' },
      { id: 'p360-onb', name: 'Onboarding de Clientes' },
      { id: 'p360-ret', name: 'Clientes Ativos & Retenção' }
    ],
    stages: [
      // Pipeline 1: Prospecção
      { id: 'st360-novo', pipelineId: 'p360-prosp', name: 'Novo Lead' },
      { id: 'st360-contato', pipelineId: 'p360-prosp', name: 'Contato Realizado' },
      { id: 'st360-agendada', pipelineId: 'p360-prosp', name: 'Reunião Agendada' },
      { id: 'st360-noshow', pipelineId: 'p360-prosp', name: 'No-Show' },
      { id: 'st360-realizada', pipelineId: 'p360-prosp', name: 'Reunião Realizada' },
      { id: 'st360-proposta', pipelineId: 'p360-prosp', name: 'Proposta Enviada' },
      { id: 'st360-negociacao', pipelineId: 'p360-prosp', name: 'Em Negociação' },
      { id: 'st360-ganho', pipelineId: 'p360-prosp', name: 'Fechado Ganho' },
      { id: 'st360-perdido', pipelineId: 'p360-prosp', name: 'Fechado Perdido' },
      // Pipeline 2: Onboarding de Clientes
      { id: 'st360-onb-enviar', pipelineId: 'p360-onb', name: 'Enviar Formulário de Onboarding' },
      { id: 'st360-onb-recebido', pipelineId: 'p360-onb', name: 'Formulário Recebido' },
      { id: 'st360-onb-contrato', pipelineId: 'p360-onb', name: 'Contrato Assinado' },
      { id: 'st360-onb-call', pipelineId: 'p360-onb', name: 'Onboarding Call' },
      { id: 'st360-onb-kickoff', pipelineId: 'p360-onb', name: 'KickOff Call' },
      { id: 'st360-onb-done', pipelineId: 'p360-onb', name: 'Onboarding Concluído' },
      // Pipeline 3: Clientes Ativos & Retenção
      { id: 'st360-ativo', pipelineId: 'p360-ret', name: 'Cliente Ativo' },
      { id: 'st360-checkin', pipelineId: 'p360-ret', name: 'Check-in de Performance' },
      { id: 'st360-nps', pipelineId: 'p360-ret', name: 'NPS & Indicação' },
      { id: 'st360-renovacao', pipelineId: 'p360-ret', name: 'Renovação Próxima' },
      { id: 'st360-churn', pipelineId: 'p360-ret', name: 'Risco / Churn' }
    ],
    triggerLinks: [
      { id: 'tl360-agenda', name: 'Link de Agendamento — Consultoria', url: 'https://graao.com/agendar' },
      { id: 'tl360-onb', name: 'Link do Formulário de Onboarding', url: 'https://graao.com/onboarding' }
    ],
    forms: [
      { id: 'fm360-optin', name: 'Opt-in | Consultoria Gratuita', description: 'Formulário público de captura para consultoria estratégica gratuita. Dispara a sequência de qualificação e follow-up.', askPhone: true, active: true },
      { id: 'fm360-surv-onb', name: '[SURVEY] Onboarding', description: 'Questionário completo de onboarding para coletar dados do negócio, acessos, marca e metas do novo cliente.', askPhone: true, active: true },
      { id: 'fm360-surv-qual', name: '[SURVEY] Qualificação de Leads', description: 'Pesquisa de qualificação para mapear tamanho do negócio, orçamento, canal atual e prioridade do lead.', askPhone: true, active: true },
      { id: 'fm360-int-captar', name: 'Form Interno | Captar Lead', description: 'Formulário interno para o time registrar manualmente leads vindos de canais offline ou indicações.', askPhone: true, active: true },
      { id: 'fm360-int-ganho', name: 'Form Interno | Cliente Ganho', description: 'Registro interno de negócio fechado para disparar a entrada no pipeline de onboarding.', askPhone: true, active: true },
      { id: 'fm360-int-criar', name: 'Form Interno | Criar Lead', description: 'Formulário simplificado para cadastro rápido de novos leads pela equipe comercial.', askPhone: true, active: true },
      { id: 'fm360-int-fech', name: 'Form Interno | Fechamento', description: 'Registro de fechamento com detalhes de valor contratado, escopo, data e informações de contrato.', askPhone: true, active: true }
    ],
    pages: [
      {
        id: 'pg360-consultoria',
        name: '[LEADS] Consultoria Gratuita',
        headline: 'Agende sua Consultoria Comercial Gratuita e organize sua máquina de vendas',
        body: 'Em 15 minutos vamos mapear os gargalos de captação, follow-up e conversão da sua empresa e desenhar um plano prático com CRM e automação.',
        button: 'Quero minha consultoria gratuita',
        formId: 'fm360-optin',
        kind: 'Funnel',
        active: false
      },
      {
        id: 'pg360-cold',
        name: '[LEADS] Agendamento via Cold Email',
        headline: 'Escolha o melhor horário para nossa conversa rápida de 15 minutos',
        body: 'Sem apresentação genérica: vamos direto aos números e oportunidades rápidas de escala no seu comercial.',
        button: 'Confirmar horário',
        formId: 'fm360-surv-qual',
        kind: 'Funnel',
        active: false
      },
      {
        id: 'pg360-onb',
        name: '[CLIENT] Onboarding de Clientes',
        headline: 'Bem-vindo(a)! Vamos dar o pontapé inicial no seu projeto',
        body: 'Preencha as etapas abaixo com os dados da sua empresa, acessos e objetivos para nossa equipe iniciar a implementação ainda esta semana.',
        button: 'Enviar informações de onboarding',
        formId: 'fm360-surv-onb',
        kind: 'Funnel',
        active: false
      },
      {
        id: 'pg360-site1',
        name: 'Site Agência — One Page',
        headline: 'Transformamos leads em clientes recorrentes com tráfego, CRM e automação',
        body: 'Página única moderna para posicionamento rápido da agência: proposta de valor, metodologia em 3 pilares, cases e chamada direta para consultoria gratuita.',
        button: 'Solicitar diagnóstico',
        formId: 'fm360-optin',
        kind: 'Website',
        active: false
      },
      {
        id: 'pg360-site2',
        name: 'Site Agência — Institucional Completo',
        headline: 'Estrutura completa de crescimento previsível para empresas ambiciosas',
        body: 'Estrutura institucional completa (Home, Sobre, Serviços, Método, Portfólio, Conteúdo e Contato) pronta para personalizar com a identidade da sua agência.',
        button: 'Falar com um especialista',
        formId: 'fm360-optin',
        kind: 'Website',
        active: false
      }
    ],
    studioProjects: [
      {
        id: 'stproj360-onepage',
        name: 'Site Agência — One Page',
        headline: 'Sua máquina de aquisição, CRM e automação em um só lugar',
        summary: 'Template one-page direto ao ponto para agências que precisam de presença profissional rápida com foco em agendamento de consultoria.',
        brief: 'Site one-page moderno para agência de marketing, CRM e automação com foco em conversão para consultoria gratuita.',
        theme: 'indigo',
        template: 'landing',
        kind: 'website',
        blocks: [
          { title: 'Hero — Promessa e CTA', body: 'Ajudamos empresas a vender mais e crescer de forma organizada combinando aquisição, CRM e automação.' },
          { title: 'O Problema', body: 'Leads chegam, demoram para ser respondidos, propostas esfriam e ninguém sabe onde o dinheiro está ficando na mesa.' },
          { title: 'Nossa Metodologia', body: '1. Captação multicanal · 2. Atendimento em segundos com IA + CRM · 3. Retenção e escala previsível.' },
          { title: 'Resultados e Provas', body: 'Espaço pronto para depoimentos, métricas de clientes e estudos de caso da agência.' },
          { title: 'Consultoria Gratuita', body: 'Convite final com formulário de opt-in para agendamento de diagnóstico em 15 minutos.' }
        ]
      },
      {
        id: 'stproj360-institucional',
        name: 'Site Agência — Institucional Completo',
        headline: 'Crescimento previsível com estratégia, dados e automação comercial',
        summary: 'Estrutura institucional completa (7 seções/páginas: Home, Sobre, Serviços, Método, Portfólio, Blog e Contato) para agências estruturadas.',
        brief: 'Site institucional completo para agência full-service com apresentação de serviços, portfólio, método proprietário e captação de leads.',
        theme: 'amber',
        template: 'portfolio',
        kind: 'website',
        blocks: [
          { title: 'Home', body: 'Posicionamento principal da agência, diferenciais competitivos e botão direto para consultoria.' },
          { title: 'Sobre a Agência', body: 'História, liderança, valores e cultura orientada a resultado mensurável.' },
          { title: 'Serviços', body: 'Tráfego Pago, Implantação de CRM, Automações de WhatsApp/IA, Funis de Conversão e Retenção.' },
          { title: 'Nosso Método', body: 'Da prospecção ao cliente promotor: visão clara das etapas de implementação e acompanhamento.' },
          { title: 'Portfólio & Cases', body: 'Galeria de projetos entregues com contexto, ação e resultado alcançado.' },
          { title: 'Blog & Conteúdos', body: 'Área editorial para artigos de autoridade, playbooks e bastidores.' },
          { title: 'Contato & Agendamento', body: 'Formulário de qualificação e canais diretos de atendimento comercial.' }
        ]
      }
    ],
    workflowFolders: [
      { id: 'wf360-f1', name: '01. Prospecção' },
      { id: 'wf360-f2', name: '02. Follow-Up & Qualificação' },
      { id: 'wf360-f3', name: '03. Agendamento & No-Show' },
      { id: 'wf360-f4', name: '04. Proposta & Negociação' },
      { id: 'wf360-f5', name: '05. Onboarding & Calls' },
      { id: 'wf360-f6', name: '06. Cliente Ativo & Retenção' },
      { id: 'wf360-f7', name: '07. Operacional & Reativação' }
    ],
    workflows: [
      // Bloco 1: Prospecção
      {
        id: 'w360-01', folderId: 'wf360-f1', name: '01. WhatsApp — Entrada e Primeiro Contato', trigger: 'Contact created', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'novo-lead-whatsapp' },
          { type: 'Create opportunity', value: 'Prospecção — Novo Lead (WhatsApp)' },
          { type: 'Log message', channel: 'WhatsApp', value: 'Oi, {{contact.first_name}}! Tudo bem? Vi sua mensagem aqui! Me conta, como posso te ajudar? 😊' },
          { type: 'Create task', value: 'Assumir primeiro atendimento do novo lead de WhatsApp' }
        ]
      },
      {
        id: 'w360-02', folderId: 'wf360-f1', name: '02. Instagram — Entrada e Primeiro Contato', trigger: 'Contact created', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'novo-lead-instagram' },
          { type: 'Create opportunity', value: 'Prospecção — Novo Lead (Instagram)' },
          { type: 'Log message', channel: 'Note', value: 'DM automática Instagram: Oi, {{contact.first_name}}! Tudo bem? Me conta, como posso te ajudar? 😊' },
          { type: 'Create task', value: 'Acompanhar conversa iniciada via Instagram DM/Comentário' }
        ]
      },
      {
        id: 'w360-03', folderId: 'wf360-f1', name: '03. Meta Ads — Entrada e Primeiro Contato', trigger: 'Form submitted', formId: 'fm360-int-captar', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'lead-anuncio-meta' },
          { type: 'Create opportunity', value: 'Prospecção — Lead Meta Ads' },
          { type: 'Log message', channel: 'Email', value: 'Oi, {{contact.first_name}}! Fico feliz que demonstrou interesse. Que tal uma conversa rápida de 15 minutos? Escolha o melhor horário no link de agendamento.' },
          { type: 'Create task', value: 'Notificar time comercial sobre novo lead do Meta Ads' }
        ]
      },
      {
        id: 'w360-04', folderId: 'wf360-f1', name: '04. Ligação Perdida — Primeiro Contato', trigger: 'Contact created', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'lead-organico' },
          { type: 'Create opportunity', value: 'Prospecção — Ligação Perdida' },
          { type: 'Log message', channel: 'WhatsApp', value: 'Oi, {{contact.first_name}}! Vi que você tentou ligar pra gente agora. Desculpa não ter conseguido atender! Me conta aqui por mensagem o que você precisa que já te ajudo 😊' },
          { type: 'Create task', value: 'Retornar ligação perdida o mais rápido possível' }
        ]
      },
      // Bloco 2: Follow-Up & Qualificação
      {
        id: 'w360-05', folderId: 'wf360-f2', name: '01. Funil Consultoria Gratuita — Sequência de Follow-Up', trigger: 'Form submitted', formId: 'fm360-optin', active: false, allowReentry: true,
        actions: [
          { type: 'Create opportunity', value: 'Consultoria Gratuita — Novo Lead' },
          { type: 'Add tag', value: 'followup-pendente' },
          { type: 'Log message', channel: 'WhatsApp', value: 'Follow-Up 01: Oi, {{contact.first_name}}! Vi que você preencheu nosso formulário mas não chegou a responder. Como posso te ajudar? 😊' },
          { type: 'Log message', channel: 'WhatsApp', value: 'Follow-Up 02 (4h): {{contact.first_name}}, vi seu cadastro aqui! Ainda quer saber mais sobre a consultoria? Me responde aqui que te ajudo 😉' },
          { type: 'Log message', channel: 'Email', value: 'Follow-Up 03 (24h): Oi, {{contact.first_name}}! Sua consultoria gratuita ainda está disponível. Escolha um horário pelo nosso link de agendamento.' },
          { type: 'Add tag', value: 'lead-nao-responde' }
        ]
      },
      {
        id: 'w360-06', folderId: 'wf360-f2', name: '02. Lead Respondeu — Qualificação e Encaminhamento', trigger: 'Opportunity stage changed', stageId: 'st360-contato', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'lead-morno' },
          { type: 'Log message', channel: 'Note', value: 'Lead respondeu e foi encaminhado para atendimento humano (temperatura: Morno).' },
          { type: 'Create task', value: 'Dar continuidade ao atendimento — lead respondeu ao follow-up' }
        ]
      },
      // Bloco 3: Agendamento & No-Show
      {
        id: 'w360-07', folderId: 'wf360-f3', name: '01. Agendamento Consultoria — Confirmação + Lembretes (24h e 1h)', trigger: 'Appointment booked', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'reuniao-agendada' },
          { type: 'Log message', channel: 'WhatsApp', value: '{{contact.first_name}}, sua consultoria gratuita tá confirmada! 🎉 Te vejo no dia {{appointment.start_date}} às {{appointment.start_time}}.' },
          { type: 'Log message', channel: 'Email', value: 'Consultoria confirmada para {{appointment.start_date}} às {{appointment.start_time}}. Já pense no que está funcionando e no que pode melhorar no seu comercial.' },
          { type: 'Create task', value: 'Preparar diagnóstico pré-reunião da consultoria gratuita' },
          { type: 'Log message', channel: 'WhatsApp', value: 'Lembrete 24h: Oi, {{contact.first_name}}! Só passando pra lembrar que amanhã tem nossa consultoria. Tá confirmado? 😊' },
          { type: 'Log message', channel: 'WhatsApp', value: 'Lembrete 1h: {{contact.first_name}}, daqui 1 hora começa nossa consultoria! Te espero lá 😉' }
        ]
      },
      {
        id: 'w360-08', folderId: 'wf360-f3', name: '02. No-Show — Recuperação Automática', trigger: 'Opportunity stage changed', stageId: 'st360-noshow', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'no-show' },
          { type: 'Log message', channel: 'WhatsApp', value: 'Oi, {{contact.first_name}}! Não consegui te encontrar na nossa reunião de hoje. Tá tudo bem? Se quiser reagendar, me avisa aqui!' },
          { type: 'Manual SMS', value: 'Enviar link de reagendamento caso o lead responda ao follow-up de no-show' },
          { type: 'Create task', value: 'Verificar no-show caso não responda em 2 horas' }
        ]
      },
      // Bloco 4: Proposta & Negociação
      {
        id: 'w360-09', folderId: 'wf360-f4', name: '01. Reunião Realizada — Próximos Passos', trigger: 'Opportunity stage changed', stageId: 'st360-realizada', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'reuniao-realizada' },
          { type: 'Log message', channel: 'WhatsApp', value: '{{contact.first_name}}, foi ótimo conversar com você! Vou te mandar um e-mail com o resumo do que falamos e os próximos passos. Qualquer dúvida, me chama aqui 😊' },
          { type: 'Log message', channel: 'Email', value: 'Foi muito bom conversar com você hoje! Conforme combinamos, vou preparar uma proposta personalizada e enviar nas próximas 24 horas.' },
          { type: 'Create task', value: 'Preparar e enviar proposta personalizada em até 24h' }
        ]
      },
      {
        id: 'w360-10', folderId: 'wf360-f4', name: '02. Proposta — Envio e Início do Acompanhamento', trigger: 'Opportunity stage changed', stageId: 'st360-proposta', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'proposta-enviada' },
          { type: 'Log message', channel: 'WhatsApp', value: '{{contact.first_name}}, acabei de te enviar a proposta! Dá uma olhada com calma e me chama aqui se tiver qualquer dúvida 😊' },
          { type: 'Create task', value: 'Acompanhar leitura da proposta em 48h' }
        ]
      },
      {
        id: 'w360-11', folderId: 'wf360-f4', name: '03. Proposta — Follow-Up (Dia 1, Reforço e Final)', trigger: 'Opportunity stage changed', stageId: 'st360-negociacao', active: false, allowReentry: true,
        actions: [
          { type: 'Log message', channel: 'WhatsApp', value: 'Dia 1: {{contact.first_name}}, conseguiu dar uma olhada na proposta? Se tiver alguma dúvida, me chama aqui!' },
          { type: 'Log message', channel: 'WhatsApp', value: 'Reforço: {{contact.first_name}}, só passando pra saber se ficou alguma dúvida sobre a proposta. Tô por aqui! 😊' },
          { type: 'Log message', channel: 'WhatsApp', value: 'Final: {{contact.first_name}}, a proposta ainda tá válida, mas não quero te pressionar. Se fizer sentido pra você, me responde aqui que a gente avança.' },
          { type: 'Add tag', value: 'lead-nao-responde' }
        ]
      },
      // Bloco 5 e 6: Onboarding & Calls
      {
        id: 'w360-12', folderId: 'wf360-f5', name: '01. Fechado Ganho → Iniciar Pipeline de Onboarding', trigger: 'Opportunity stage changed', stageId: 'st360-ganho', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'cliente-novo' },
          { type: 'Create opportunity', value: 'Onboarding — Novo Cliente' },
          { type: 'Create task', value: 'Mover cliente para Enviar Formulário de Onboarding e atribuir CSM' }
        ]
      },
      {
        id: 'w360-13', folderId: 'wf360-f5', name: '02. Enviar Onboarding Form + Lembretes (24h e 72h)', trigger: 'Opportunity stage changed', stageId: 'st360-onb-enviar', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'onboarding-aguardando' },
          { type: 'Log message', channel: 'Email', value: 'Bem-vindo(a)! Para darmos início ao seu projeto, preencha o formulário de onboarding pelo link enviado.' },
          { type: 'Log message', channel: 'WhatsApp', value: '{{contact.first_name}}, bem-vindo(a)! 🎉 Te enviei um e-mail com o formulário de onboarding. Preciso que preencha pra gente começar!' },
          { type: 'Log message', channel: 'Email', value: 'Lembrete 24h/72h: Ainda aguardamos seu formulário de onboarding para dar andamento ao projeto.' },
          { type: 'Create task', value: 'Contato manual caso cliente não preencha o formulário após 72h' }
        ]
      },
      {
        id: 'w360-14', folderId: 'wf360-f5', name: '03. Formulário de Onboarding Enviado', trigger: 'Form submitted', formId: 'fm360-surv-onb', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'onboarding-concluido' },
          { type: 'Log message', channel: 'Email', value: 'Recebemos seu formulário de onboarding com sucesso! 🎉 Nosso time já vai começar a trabalhar no seu projeto.' },
          { type: 'Create task', value: 'Revisar respostas do formulário de onboarding e agendar Onboarding Call' }
        ]
      },
      {
        id: 'w360-15', folderId: 'wf360-f5', name: '04. [CLIENTE] Contrato Assinado', trigger: 'Opportunity stage changed', stageId: 'st360-onb-contrato', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'contrato-assinado' },
          { type: 'Log message', channel: 'Note', value: 'Contrato assinado! ✅ Registrar data de início e liberar acesso ao time de entrega.' },
          { type: 'Create task', value: 'Confirmar Onboarding Call e KickOff Call com o cliente' }
        ]
      },
      {
        id: 'w360-16', folderId: 'wf360-f5', name: '05. Onboarding Call & KickOff Call — Confirmação + Lembretes', trigger: 'Opportunity stage changed', stageId: 'st360-onb-call', active: false, allowReentry: true,
        actions: [
          { type: 'Log message', channel: 'Email', value: 'Sua call de alinhamento está confirmada! Nessa reunião vamos alinhar o plano de ação e dar início ao projeto.' },
          { type: 'Log message', channel: 'WhatsApp', value: '{{contact.first_name}}, daqui 2 horas tem nossa call de onboarding/kickoff! Te espero lá 😊' },
          { type: 'Create task', value: 'Preparar pauta e plano de ação da Onboarding/KickOff Call' }
        ]
      },
      // Bloco 7: Cliente Ativo & Retenção
      {
        id: 'w360-17', folderId: 'wf360-f6', name: '01. Cliente Ativo — Estamos no Ar + Check-in 3 dias + Review', trigger: 'Opportunity stage changed', stageId: 'st360-ativo', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'cliente-ativo' },
          { type: 'Log message', channel: 'Email', value: 'Estamos no Ar! 🚀 Tudo está funcionando e nosso time já está acompanhando de perto os resultados.' },
          { type: 'Create task', value: 'Check In (3 dias): Verificar desempenho (CTR, CPC, conversões) e enviar resumo ao cliente' },
          { type: 'Create task', value: 'Enviar solicitação de Review no Google 7 dias após ativação' }
        ]
      },
      {
        id: 'w360-18', folderId: 'wf360-f6', name: '02. NPS (14 dias) + Pedido de Indicação & Upsell', trigger: 'Opportunity stage changed', stageId: 'st360-nps', active: false, allowReentry: true,
        actions: [
          { type: 'Log message', channel: 'WhatsApp', value: '{{contact.first_name}}, faz 2 semanas que estamos trabalhando juntos! 🎉 De 0 a 10, o quanto você indicaria nosso trabalho?' },
          { type: 'Log message', channel: 'Email', value: 'Como está sendo sua experiência? De 0 a 10, o quanto indicaria nossa agência para um amigo ou colega?' },
          { type: 'Add tag', value: 'upsell-potencial' },
          { type: 'Create task', value: 'Se NPS 9-10 ou Review 5 estrelas: agradecer, pedir indicação e explorar upsell' }
        ]
      },
      {
        id: 'w360-19', folderId: 'wf360-f6', name: '03. Renovação — Aviso Automático (7 dias antes)', trigger: 'Opportunity stage changed', stageId: 'st360-renovacao', active: false, allowReentry: true,
        actions: [
          { type: 'Log message', channel: 'Email', value: 'Sua renovação está chegando! Seu contrato renova em 7 dias — se quiser revisar os resultados antes, é só responder.' },
          { type: 'Log message', channel: 'WhatsApp', value: '{{contact.first_name}}, seu contrato renova em 7 dias! Se quiser conversar sobre os resultados ou tiver alguma dúvida, me chama aqui 😊' },
          { type: 'Create task', value: 'Confirmar renovação do contrato e verificar pendências' }
        ]
      },
      {
        id: 'w360-20', folderId: 'wf360-f6', name: '04. Review Negativo / Risco de Churn — Alerta Urgente', trigger: 'Opportunity stage changed', stageId: 'st360-churn', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'risco-churn' },
          { type: 'Log message', channel: 'Note', value: '🚨 Alerta urgente: Review negativo (≤ 3 estrelas) ou sinal de churn detectado. Contato imediato necessário.' },
          { type: 'Create task', value: 'URGENTE: Responder review e ligar para o cliente para reverter insatisfação' }
        ]
      },
      // Bloco 8 e 9: Operacional & Reativação
      {
        id: 'w360-21', folderId: 'wf360-f7', name: '01. Lead Frio & Oportunidade Ociosa — Sequência de Reativação', trigger: 'Opportunity stage changed', stageId: 'st360-perdido', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'reativacao-pendente' },
          { type: 'Log message', channel: 'WhatsApp', value: 'Reativação 01: Oi, {{contact.first_name}}! Faz um tempinho que a gente não se fala. Ainda posso te ajudar com alguma coisa? 😊' },
          { type: 'Log message', channel: 'WhatsApp', value: 'Reativação 02 (7 dias): {{contact.first_name}}, passando aqui de novo! Se ainda tiver interesse, tô à disposição 😉' },
          { type: 'Log message', channel: 'Email', value: 'Última tentativa de contato: sem problema se o momento não for ideal. Se no futuro precisar, estarei por aqui!' }
        ]
      },
      {
        id: 'w360-22', folderId: 'wf360-f7', name: '02. Operacional — Fechamento, Valor, Dono & Tracking Ads', trigger: 'Form submitted', formId: 'fm360-int-fech', active: false, allowReentry: true,
        actions: [
          { type: 'Add tag', value: 'deal-fechado' },
          { type: 'Log message', channel: 'Note', value: 'Fechamento registrado via formulário interno — atualizar valor contratado, dono (Round Robin) e evento de conversão (Meta/Google Ads).' },
          { type: 'Create task', value: 'Validar valor contratado e disparar onboarding do cliente' }
        ]
      }
    ],
    snippetFolders: [
      { id: 'snf360-1', name: '01. Primeiro Contato' },
      { id: 'snf360-2', name: '02. Follow-Up & Qualificação' },
      { id: 'snf360-3', name: '03. Agendamento & No-Show' },
      { id: 'snf360-4', name: '04. Proposta & Pós-Reunião' },
      { id: 'snf360-5', name: '05. Onboarding & Calls' },
      { id: 'snf360-6', name: '06. Cliente Ativo & Retenção' },
      { id: 'snf360-7', name: '07. Reativação & Alertas' }
    ],
    snippets: [
      // 01. Primeiro Contato
      { id: 'sn360-01', folderId: 'snf360-1', type: 'Text', name: 'Primeiro Contato — WhatsApp', subject: '', body: 'Oi, {{contact.first_name}}! Tudo bem? Vi sua mensagem aqui! Me conta, como posso te ajudar? 😊' },
      { id: 'sn360-02', folderId: 'snf360-1', type: 'Text', name: 'Primeiro Contato — Instagram DM', subject: '', body: 'Oi, {{contact.first_name}}! Tudo bem? Me conta, como posso te ajudar? 😊' },
      { id: 'sn360-03', folderId: 'snf360-1', type: 'Email', name: 'Boas-Vindas — Lead Form Meta Ads', subject: 'Oi, {{contact.first_name}}! Que bom ter você aqui', body: 'Oi, {{contact.first_name}}!\n\nFico feliz que você demonstrou interesse na {{custom_values.nome_agencia}}.\n\nNos próximos dias vou te mostrar como estamos ajudando empresas a vender mais e crescer de forma organizada usando automação e CRM.\n\nPra gente dar o primeiro passo, que tal uma conversa rápida de 15 minutos? Escolhe o melhor horário aqui:\n{{custom_values.link_agendamento}}\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{custom_values.nome_agencia}}' },
      { id: 'sn360-04', folderId: 'snf360-1', type: 'Text', name: 'Retorno de Ligação Perdida', subject: '', body: 'Oi, {{contact.first_name}}! Vi que você tentou ligar pra gente agora. Desculpa não ter conseguido atender! Me conta aqui por mensagem o que você precisa que já te ajudo 😊' },
      // 02. Follow-Up & Qualificação
      { id: 'sn360-05', folderId: 'snf360-2', type: 'Text', name: 'Follow-Up Sem Resposta 01 (WA)', subject: '', body: 'Oi, {{contact.first_name}}! Vi que você preencheu nosso formulário mas não chegou a responder. Como posso te ajudar? 😊' },
      { id: 'sn360-06', folderId: 'snf360-2', type: 'Text', name: 'Follow-Up Sem Resposta 02 (WA)', subject: '', body: '{{contact.first_name}}, vi seu cadastro aqui! Ainda quer saber mais sobre a consultoria? Me responde aqui que te ajudo 😉' },
      { id: 'sn360-07', folderId: 'snf360-2', type: 'Email', name: 'Follow-Up Sem Resposta 03 (E-mail)', subject: '{{contact.first_name}}, sua consultoria gratuita ainda tá disponível', body: 'Oi, {{contact.first_name}}!\n\nVi que você se cadastrou pra uma consultoria gratuita, mas a gente ainda não conseguiu conversar.\n\nSe ainda tiver interesse, é só escolher um horário aqui:\n{{custom_values.link_agendamento}}\n\nQualquer dúvida, me responde esse e-mail que te ajudo!\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{custom_values.nome_agencia}}' },
      // 03. Agendamento & No-Show
      { id: 'sn360-08', folderId: 'snf360-3', type: 'Text', name: 'Confirmação de Consultoria (WA)', subject: '', body: '{{contact.first_name}}, sua consultoria gratuita tá confirmada! 🎉 Te vejo no dia {{appointment.start_date}} às {{appointment.start_time}}. Qualquer coisa me chama aqui!' },
      { id: 'sn360-09', folderId: 'snf360-3', type: 'Email', name: 'Confirmação de Consultoria (E-mail)', subject: 'Consultoria confirmada, {{contact.first_name}}!', body: 'Oi, {{contact.first_name}}!\n\nSua consultoria gratuita tá confirmada pra {{appointment.start_date}} às {{appointment.start_time}}.\n\nPra gente aproveitar melhor o nosso tempo, já pensa no que tá funcionando e no que pode melhorar no seu comercial hoje.\n\nQualquer dúvida, me responde aqui!\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{custom_values.nome_agencia}}' },
      { id: 'sn360-10', folderId: 'snf360-3', type: 'Text', name: 'Lembrete 24h Consultoria (WA)', subject: '', body: 'Oi, {{contact.first_name}}! Só passando pra lembrar que amanhã tem nossa consultoria. Tá confirmado? 😊' },
      { id: 'sn360-11', folderId: 'snf360-3', type: 'Email', name: 'Lembrete 24h Consultoria (E-mail)', subject: 'Amanhã tem sua consultoria, {{contact.first_name}}!', body: 'Oi, {{contact.first_name}}!\n\nSó passando pra lembrar que amanhã é o dia da nossa conversa, às {{appointment.start_time}}.\n\nSe precisar reagendar, sem problema, é só me avisar!\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{custom_values.nome_agencia}}' },
      { id: 'sn360-12', folderId: 'snf360-3', type: 'Text', name: 'Lembrete 1h Consultoria (WA)', subject: '', body: '{{contact.first_name}}, daqui 1 hora começa nossa consultoria! Te espero lá 😉' },
      { id: 'sn360-13', folderId: 'snf360-3', type: 'Email', name: 'Lembrete 1h Consultoria (E-mail)', subject: 'Falta 1 hora pra sua consultoria!', body: 'Oi, {{contact.first_name}}!\n\nNossa conversa começa daqui a pouquinho, às {{appointment.start_time}}.\n\nTe espero lá!\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{custom_values.nome_agencia}}' },
      { id: 'sn360-14', folderId: 'snf360-3', type: 'Text', name: 'Follow-Up No-Show (WA)', subject: '', body: 'Oi, {{contact.first_name}}! Não consegui te encontrar na nossa reunião de hoje. Tá tudo bem? Se quiser reagendar, me avisa aqui!' },
      { id: 'sn360-15', folderId: 'snf360-3', type: 'Text', name: 'Link de Reagendamento No-Show (WA)', subject: '', body: 'Sem problema, {{contact.first_name}}! Escolhe um novo horário aqui que a gente remarca:\n{{custom_values.link_agendamento}}' },
      // 04. Proposta & Pós-Reunião
      { id: 'sn360-16', folderId: 'snf360-4', type: 'Text', name: 'Follow-Up Pós-Reunião (WA)', subject: '', body: '{{contact.first_name}}, foi ótimo conversar com você! Vou te mandar um e-mail com o resumo do que falamos e os próximos passos. Qualquer dúvida, me chama aqui 😊' },
      { id: 'sn360-17', folderId: 'snf360-4', type: 'Email', name: 'Follow-Up Pós-Reunião (E-mail)', subject: 'Próximos passos da nossa conversa, {{contact.first_name}}', body: 'Oi, {{contact.first_name}}!\n\nFoi muito bom conversar com você hoje!\n\nConforme combinamos, vou preparar uma proposta personalizada e te envio nas próximas 24 horas.\n\nEnquanto isso, qualquer dúvida é só me responder aqui.\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{custom_values.nome_agencia}}' },
      { id: 'sn360-18', folderId: 'snf360-4', type: 'Text', name: 'Proposta Enviada (WA)', subject: '', body: '{{contact.first_name}}, acabei de te enviar a proposta! Dá uma olhada com calma e me chama aqui se tiver qualquer dúvida 😊' },
      { id: 'sn360-19', folderId: 'snf360-4', type: 'Text', name: 'Follow-Up Proposta Dia 1', subject: '', body: '{{contact.first_name}}, conseguiu dar uma olhada na proposta? Se tiver alguma dúvida, me chama aqui!' },
      { id: 'sn360-20', folderId: 'snf360-4', type: 'Text', name: 'Follow-Up Proposta Reforço', subject: '', body: '{{contact.first_name}}, só passando pra saber se ficou alguma dúvida sobre a proposta. Tô por aqui! 😊' },
      { id: 'sn360-21', folderId: 'snf360-4', type: 'Text', name: 'Follow-Up Proposta Dia Final', subject: '', body: '{{contact.first_name}}, a proposta que te enviei ainda tá válida, mas não quero te pressionar. Se fizer sentido pra você, me responde aqui que a gente avança. Se não, sem problema nenhum!' },
      // 05. Onboarding & Calls
      { id: 'sn360-22', folderId: 'snf360-5', type: 'Email', name: 'E-mail Formulário de Onboarding', subject: 'Por favor, preencha o formulário de onboarding - {{location.name}}', body: 'Oi, {{contact.first_name}}!\n\nBem-vindo(a) à {{location.name}}! Estamos muito felizes em ter você com a gente 🎉\n\nPra gente dar início ao seu projeto, preciso que você preencha o formulário de onboarding. É bem rápido:\n{{custom_values.link_onboarding}}\n\nQualquer dúvida, me chama!\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{location.name}}' },
      { id: 'sn360-23', folderId: 'snf360-5', type: 'Text', name: 'WhatsApp Formulário de Onboarding', subject: '', body: '{{contact.first_name}}, bem-vindo(a)! 🎉 Te enviei um e-mail com o formulário de onboarding. Preciso que preencha pra gente começar. Qualquer dúvida, me chama aqui!' },
      { id: 'sn360-24', folderId: 'snf360-5', type: 'Email', name: 'Lembrete Onboarding 24h (E-mail)', subject: 'Lembrete: formulário de onboarding - {{location.name}}', body: 'Oi, {{contact.first_name}}!\n\nSó passando pra lembrar do formulário de onboarding. Preciso dele preenchido pra dar andamento no seu projeto:\n{{custom_values.link_onboarding}}\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{location.name}}' },
      { id: 'sn360-25', folderId: 'snf360-5', type: 'Email', name: 'Lembrete Onboarding 72h (E-mail)', subject: '{{contact.first_name}}, ainda falta o formulário de onboarding', body: 'Oi, {{contact.first_name}}!\n\nVi que o formulário de onboarding ainda não foi preenchido. Sem ele, não consigo avançar com o seu projeto.\n\nLeva só alguns minutinhos:\n{{custom_values.link_onboarding}}\n\nSe tiver alguma dificuldade, me responde aqui que te ajudo!\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{location.name}}' },
      { id: 'sn360-26', folderId: 'snf360-5', type: 'Text', name: 'Lembrete Onboarding (WA)', subject: '', body: '{{contact.first_name}}, vi que o formulário de onboarding ainda não foi preenchido. Preciso dele pra começar o seu projeto! Consegue preencher hoje? 😊' },
      { id: 'sn360-27', folderId: 'snf360-5', type: 'Email', name: 'Confirmação Formulário Recebido (E-mail)', subject: 'Recebemos seu formulário, {{contact.first_name}}!', body: 'Oi, {{contact.first_name}}!\n\nRecebemos seu formulário de onboarding com sucesso! 🎉\n\nNosso time já vai começar a trabalhar no seu projeto. Em breve entraremos em contato com as próximas etapas.\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{location.name}}' },
      { id: 'sn360-28', folderId: 'snf360-5', type: 'Email', name: 'Confirmação — Onboarding Call', subject: 'Sua call de onboarding está confirmada!', body: 'Oi, {{contact.first_name}}!\n\nSua call de onboarding tá confirmada pra {{appointment.start_date}} às {{appointment.start_time}}.\n\nNessa reunião vamos alinhar tudo pra dar início ao seu projeto. Se precisar reagendar, me avisa!\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{location.name}}' },
      { id: 'sn360-29', folderId: 'snf360-5', type: 'Email', name: 'Confirmação — KickOff Call', subject: 'Sua KickOff Call está marcada!', body: 'Oi, {{contact.first_name}}!\n\nSua KickOff Call tá marcada pra {{appointment.start_date}} às {{appointment.start_time}}.\n\nNessa reunião vamos alinhar o plano de ação e dar início ao trabalho. Vai ser bem produtivo!\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{location.name}}' },
      { id: 'sn360-30', folderId: 'snf360-5', type: 'Text', name: 'Lembrete 2h — Onboarding / KickOff Call', subject: '', body: '{{contact.first_name}}, daqui 2 horas tem nossa call de alinhamento! Te espero lá 😊' },
      { id: 'sn360-31', folderId: 'snf360-5', type: 'Text', name: 'Lembrete 5 min — Call Começando', subject: '', body: '{{contact.first_name}}, nossa reunião começa em alguns minutos! Você conseguiu o link? 😊' },
      // 06. Cliente Ativo & Retenção
      { id: 'sn360-32', folderId: 'snf360-6', type: 'Email', name: 'Estamos no Ar! — Cliente Ativo', subject: 'Estamos no Ar! - {{location.name}}', body: 'Oi, {{contact.first_name}}!\n\nTenho uma boa notícia: tudo tá no ar e funcionando! 🚀\n\nA partir de agora, nosso time vai acompanhar de perto os resultados e te manter atualizado sobre o desempenho.\n\nSe tiver qualquer dúvida ou precisar de algo, é só me chamar.\n\nBora pra cima!\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{location.name}}' },
      { id: 'sn360-33', folderId: 'snf360-6', type: 'Text', name: 'Feliz Aniversário — Cliente Ativo', subject: '', body: 'Feliz aniversário, {{contact.first_name}}! 🎂🎉 Pra comemorar, preparamos uma condição especial pra você. Me chama aqui pra saber mais! 😊' },
      { id: 'sn360-34', folderId: 'snf360-6', type: 'Text', name: 'Pedido de Indicação (NPS 9-10 / Review 5★)', subject: '', body: '{{contact.first_name}}, fico muito feliz que você tá curtindo o nosso trabalho! 😊 Conhece alguém que também poderia se beneficiar? Indicações são a melhor forma de a gente crescer, e ficaria muito grato!' },
      { id: 'sn360-35', folderId: 'snf360-6', type: 'Email', name: 'Aviso de Renovação — 7 dias antes (E-mail)', subject: 'Sua renovação tá chegando, {{contact.first_name}}!', body: 'Oi, {{contact.first_name}}!\n\nPassando pra avisar que seu contrato com a {{custom_values.nome_agencia}} renova em 7 dias.\n\nSe tiver qualquer dúvida ou quiser conversar sobre os resultados antes da renovação, me responde aqui!\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{custom_values.nome_agencia}}' },
      { id: 'sn360-36', folderId: 'snf360-6', type: 'Text', name: 'Aviso de Renovação — 7 dias antes (WA)', subject: '', body: '{{contact.first_name}}, seu contrato renova em 7 dias! Se quiser conversar sobre os resultados ou tiver alguma dúvida, me chama aqui 😊' },
      { id: 'sn360-37', folderId: 'snf360-6', type: 'Text', name: 'Pesquisa NPS 14 dias (WA)', subject: '', body: '{{contact.first_name}}, faz 2 semanas que estamos trabalhando juntos! 🎉 Queria saber: de 0 a 10, o quanto você indicaria nosso trabalho pra alguém? Me responde aqui, sua opinião é super importante pra gente!' },
      { id: 'sn360-38', folderId: 'snf360-6', type: 'Email', name: 'Pesquisa NPS 14 dias (E-mail)', subject: '{{contact.first_name}}, como está sendo sua experiência?', body: 'Oi, {{contact.first_name}}!\n\nJá faz 2 semanas que começamos a trabalhar juntos e queria ouvir você.\n\nDe 0 a 10, o quanto você indicaria a {{custom_values.nome_agencia}} para um amigo ou colega?\n\nSua resposta nos ajuda a melhorar cada vez mais. É só responder esse e-mail com sua nota!\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{custom_values.nome_agencia}}' },
      // 07. Reativação
      { id: 'sn360-39', folderId: 'snf360-7', type: 'Text', name: 'Reativação Lead Frio 01 (WA)', subject: '', body: 'Oi, {{contact.first_name}}! Faz um tempinho que a gente não se fala. Ainda posso te ajudar com alguma coisa? Me responde aqui! 😊' },
      { id: 'sn360-40', folderId: 'snf360-7', type: 'Text', name: 'Reativação Lead Frio 02 (WA)', subject: '', body: '{{contact.first_name}}, passando aqui de novo! Se ainda tiver interesse, tô à disposição. É só me chamar 😉' },
      { id: 'sn360-41', folderId: 'snf360-7', type: 'Email', name: 'Reativação Final — Despedida (E-mail)', subject: '{{contact.first_name}}, última tentativa de contato', body: 'Oi, {{contact.first_name}}!\n\nTentei te contatar algumas vezes mas não consegui retorno. Sem problema nenhum, entendo que o momento pode não ser ideal.\n\nSe no futuro precisar de algo, estarei por aqui. É só responder esse e-mail!\n\nAbraço,\n{{contact.assigned_user.first_name}}\n{{custom_values.nome_agencia}}' }
    ],
    agents: [
      {
        id: 'ag360-wa',
        name: 'IA — Conversação WhatsApp',
        icon: 'spark',
        description: 'Agente principal de atendimento em WhatsApp/SMS: acolhe o lead em segundos, qualifica necessidade e agenda a consultoria gratuita.',
        instructions: 'Você é o assistente comercial principal da agência no WhatsApp. Responda com cordialidade, frases curtas e linguagem natural brasileira. Seu objetivo é entender o segmento da empresa, qual o principal gargalo comercial (geração de leads, atendimento ou conversão) e convidar o contato para agendar uma consultoria gratuita de 15 minutos. Nunca invente preços ou prazos que não estejam na base; se o lead pedir atendimento humano, avise que um especialista já vai assumir.'
      },
      {
        id: 'ag360-ig',
        name: 'IA — Qualificação Instagram',
        icon: 'spark',
        description: 'Agente focado em DMs e comentários do Instagram: converte seguidores interessados em leads qualificados e agendamentos.',
        instructions: 'Você responde mensagens diretas (DMs) e interações vindas do Instagram. Seja leve, direto e consultivo — estilo conversa de DM, sem textões. Pergunte como pode ajudar, entenda o momento do negócio da pessoa e direcione para o link da consultoria gratuita ou peça o WhatsApp para enviar detalhes.'
      },
      {
        id: 'ag360-standby',
        name: 'IA — Standby (Backup)',
        icon: 'spark',
        description: 'Agente de contingência/fallback multicanal para manter o primeiro atendimento ativo caso os agentes especializados sejam pausados.',
        instructions: 'Você atua como agente de backup da agência. Cumprimente o contato, registre nome, telefone/e-mail e qual assunto deseja tratar (comercial, suporte ou financeiro), e informe que a equipe responsável retornará em breve.'
      },
      {
        id: 'ag360-voice',
        name: 'IA — SDR de Voz & Pré-Qualificação',
        icon: 'spark',
        description: 'Template de SDR para qualificação rápida de leads recebidos e confirmação de consultorias estratégicas.',
        instructions: 'Você atua como SDR de pré-qualificação comercial. Conduza perguntas curtas e objetivas em até 3 minutos: 1) segmento e momento da empresa; 2) se já roda anúncios ou usa CRM; 3) principal meta para os próximos 90 dias. Ao confirmar fit, conduza diretamente para o agendamento da consultoria gratuita.'
      },
      {
        id: 'ag360-reviews',
        name: 'IA — Gestão de Reviews (Google)',
        icon: 'spark',
        description: 'Responde automaticamente avaliações do Google: tom grato e conciso para 3+ estrelas; tom empático, otimista e profissional para ≤ 2 estrelas.',
        instructions: 'Você responde avaliações públicas recebidas no Google. REGRA DE TOM: 1) Para avaliações de 3 a 5 estrelas, responda de forma concisa, calorosa e genuinamente grata, mencionando o nome do cliente se disponível. 2) Para avaliações de 1 a 2 estrelas, mantenha tom otimista, calmo e profissional: agradeça o feedback, lamente o ocorrido sem entrar em discussão pública e convide o cliente a falar diretamente com o time pelo canal privado para resolvermos imediatamente.'
      }
    ],
    // Dados da conta que o snapshot "Agência" da GHL leva junto (tags, calendários e valores personalizados).
    tags: ['Blacklist', 'Churn', 'Cliente-Ativo', 'Cliente-Em-Risco', 'Contrato-Assinado', 'Contrato-Enviado', 'Disparo-Wpp', 'Followup-Pendente',
      'Funil-Consultoria-Gratuita', 'Ia-Call', 'Lead-Anuncio-Google', 'Lead-Anuncio-Meta', 'Lead-Desqualificado', 'Lead-Em-Negociacao', 'Lead-Evento',
      'Lead-Fb-Messenger', 'Lead-Ganho', 'Lead-Indicacao', 'Lead-Instagram', 'Lead-Nao-Responde', 'Lead-Organico', 'Lead-Perdido', 'Lead-Qualificado',
      'Lead-Whatsapp', 'No-Show', 'Novo-Lead', 'Onboarding-Concluido', 'Onboarding-Iniciado', 'Proposta-Aprovada', 'Proposta-Enviada', 'Proposta-Recusada',
      'Reativacao', 'Reuniao-Agendada', 'Reuniao-Cancelada', 'Reuniao-Realizada', 'Upsell-Potencial'
    ].map(name => ({ id: `tg360-${name.toLowerCase()}`, name: name.toLowerCase(), description: '', category: 'Agência 360' })),
    services: [
      ['diag', 'Diagnóstico Gratuito', 30, 'Consultoria comercial gratuita de 15 a 30 minutos com o lead.'],
      ['proposta', 'Reunião de Proposta', 45, 'Apresentação da proposta comercial e próximos passos.'],
      ['onb', 'Reunião de Onboarding', 60, 'Alinhamento de acessos, metas e cronograma com o novo cliente.'],
      ['kickoff', 'Reunião de Kickoff', 60, 'Início oficial do projeto com toda a equipe.'],
      ['demo', 'Demonstração da Plataforma', 30, 'Apresentação guiada do CRM e das automações.']
    ].map(([key, name, duration, description]) => ({ id: `sv360-${key}`, name, description, kind: 'appointment', duration, buffer: 0, price: 0, staffIds: [], resourceIds: [], rentalUnit: '', maxUnits: 1, active: true, color: '#b71889' })),
    customValues: [
      ['Nome Agência', 'Agência', 'Sua Agência'], ['Link de Agendamento', 'Agência', 'https://'], ['Link do Formulário de Onboarding', 'Agência', 'https://'],
      ['UTM Source', '[HTC] Tracking Ads', ''], ['UTM Campaign', '[HTC] Tracking Ads', ''], ['Valor do Contrato', '[HTC] Campos Adicionais', ''], ['Dono do Negócio', '[HTC] Campos Adicionais', '']
    ].map(([name, folder, value]) => ({ id: `cv360-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, folder, value,
      key: `custom_values.${name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}` }))
  }
};
