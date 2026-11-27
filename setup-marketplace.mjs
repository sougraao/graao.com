// Marketplace de Setups de conta: catálogo oficial do Graao + publicações da comunidade.
import { randomUUID } from 'node:crypto';
import { agentTemplate } from './agent-model.mjs';
import { marketplaceCategories } from './ui/agency-data.js';
import { agenciaCompleta360Spec } from './setup-agencia-360.mjs';
import { funilReunioesSpec } from './setup-funil-reunioes.mjs';
import { setupTemplateSpecs, templateSites } from './setup-templates.mjs';

export const MARKETPLACE_DOC_ID = 'marketplace-setups';
export const MAX_MARKETPLACE_LISTINGS = 500;

const uid = () => randomUUID();
const now = () => new Date().toISOString();
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const req = (value, label, limit) => str(value, limit) || fail(`${label} é obrigatório.`);

export const emptyMarketplace = () => ({ profile: { name: 'Setup Marketplace' }, listings: [], officialInstalls: {} });

export function hydrateMarketplace(doc) {
  const target = doc && typeof doc === 'object' ? doc : emptyMarketplace();
  target.profile = { name: target.profile?.name || 'Setup Marketplace' };
  if (!Array.isArray(target.listings)) target.listings = [];
  if (!target.officialInstalls || typeof target.officialInstalls !== 'object') target.officialInstalls = {};
  return target;
}

export function normalizeTags(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(list.map(t => str(t, 28).toLowerCase()).filter(Boolean))].slice(0, 6);
}

export function buildSetupPreview(assets = {}) {
  const names = (key, field = 'name') => (assets[key] || [])
    .map(item => str(item?.[field] || item?.title || item?.name, 80))
    .filter(Boolean)
    .slice(0, 8);
  const preview = {
    pipelines: names('pipelines'),
    workflows: names('workflows'),
    forms: names('forms'),
    pages: names('pages'),
    snippets: names('snippets'),
    triggerLinks: names('triggerLinks'),
    courses: names('courses'),
    agents: names('agents'),
    studioProjects: names('studioProjects'),
    services: names('services'),
    knowledgeBases: names('knowledgeBases'),
    emailTemplates: names('emailTemplates'),
    documentTemplates: names('documentTemplates'),
    chatWidgets: names('chatWidgets'),
    tags: names('tags'),
    customValues: names('customValues'),
    customFields: names('customFields')
  };
  return Object.fromEntries(Object.entries(preview).filter(([, list]) => list.length));
}

function buildOfficial(spec) {
  const assets = structuredClone(spec.assets);
  for (const page of assets.pages || []) page.active = false;
  for (const workflow of assets.workflows || []) workflow.active = false;
  if (assets.agents) assets.agents = assets.agents.map(agentTemplate);
  const counts = Object.fromEntries(Object.entries(assets).map(([k, v]) => [k, v.length]).filter(([, n]) => n > 0));
  return {
    id: spec.id,
    title: spec.title,
    summary: spec.summary,
    description: spec.description,
    category: spec.category,
    tags: spec.tags,
    author: 'Graao Oficial',
    authorAgencyId: null,
    sourceSnapshotId: '',
    official: true,
    version: 1,
    counts,
    preview: buildSetupPreview(assets),
    assets,
    studioSites: spec.studioSites ? structuredClone(spec.studioSites) : {},
    installs: 0,
    publishedAt: spec.publishedAt || '2026-01-15T12:00:00.000Z',
    updatedAt: spec.publishedAt || '2026-01-15T12:00:00.000Z'
  };
}

const OFFICIAL_SETUPS = [
  buildOfficial(agenciaCompleta360Spec),
  buildOfficial({
    id: 'official-clinica-estetica',
    title: 'Clínica de Estética & Harmonização',
    summary: 'Funil completo de avaliação, agendamentos, mensagens prontas de WhatsApp e recepcionista de IA.',
    description: 'Estrutura completa para clínicas de estética, harmonização facial e dermatologia. Inclui funil comercial de avaliação até fechamento, formulários de captação, landing page de avaliação, fluxos de acompanhamento automático, respostas rápidas para recepção e agente de IA treinado para pré-qualificar pacientes.',
    category: 'Saúde e Estética',
    tags: ['estética', 'clínica', 'avaliação', 'whatsapp', 'ia'],
    assets: {
      pipelines: [{ id: 'p-est', name: 'Avaliação & Fechamento' }],
      stages: [
        { id: 's-est-1', pipelineId: 'p-est', name: 'Novo lead' },
        { id: 's-est-2', pipelineId: 'p-est', name: 'Qualificado' },
        { id: 's-est-3', pipelineId: 'p-est', name: 'Avaliação agendada' },
        { id: 's-est-4', pipelineId: 'p-est', name: 'Proposta enviada' },
        { id: 's-est-5', pipelineId: 'p-est', name: 'Paciente fechado' }
      ],
      forms: [
        { id: 'f-est-1', name: 'Agendamento de Avaliação', description: 'Captação de pacientes interessados em avaliação estética.', askPhone: true, active: true },
        { id: 'f-est-2', name: 'Interesse em Procedimento', description: 'Triagem rápida do procedimento desejado e melhor horário.', askPhone: true, active: true }
      ],
      pages: [
        { id: 'pg-est-1', name: 'LP Avaliação Estética', headline: 'Agende sua avaliação personalizada com nossa equipe', body: 'Preencha seus dados e escolha o melhor horário para entender o protocolo ideal para você.', button: 'Quero agendar avaliação', formId: 'f-est-1', kind: 'Funnel', active: false },
        { id: 'pg-est-2', name: 'Confirmação de Avaliação', headline: 'Recebemos seu pedido de avaliação', body: 'Nossa recepção entrará em contato pelo WhatsApp nos próximos minutos para confirmar seu horário.', button: 'Voltar ao início', formId: '', kind: 'Funnel', active: false }
      ],
      workflows: [
        {
          id: 'wf-est-1', name: 'Boas-vindas e triagem de avaliação', trigger: 'Form submitted', formId: 'f-est-1', active: false, allowReentry: true,
          actions: [
            { type: 'Add tag', value: 'lead-avaliacao' },
            { type: 'Create opportunity', value: 'Avaliação estética' },
            { type: 'Create task', value: 'Confirmar horário da avaliação pelo WhatsApp' }
          ]
        },
        {
          id: 'wf-est-2', name: 'Lembrete pré-avaliação', trigger: 'Appointment booked', active: false, allowReentry: true,
          actions: [
            { type: 'Add tag', value: 'avaliacao-confirmada' },
            { type: 'Log message', channel: 'WhatsApp', value: 'Olá! Sua avaliação está confirmada. Se precisar remarcar, é só responder por aqui.' }
          ]
        }
      ],
      snippetFolders: [{ id: 'sf-est-1', name: 'Recepção da Clínica' }],
      snippets: [
        { id: 'sn-est-1', folderId: 'sf-est-1', type: 'Text', name: 'Boas-vindas WhatsApp', subject: '', body: 'Olá! Tudo bem? Recebemos seu contato para avaliação estética. Qual procedimento você tem interesse em conhecer?' },
        { id: 'sn-est-2', folderId: 'sf-est-1', type: 'Text', name: 'Horários disponíveis', subject: '', body: 'Temos horários disponíveis amanhã pela manhã (10h) e à tarde (15h30). Qual fica melhor para você?' },
        { id: 'sn-est-3', folderId: 'sf-est-1', type: 'Text', name: 'Confirmação de consulta', subject: '', body: 'Passando para confirmar sua avaliação conosco. Nos vemos em breve!' }
      ],
      agents: [
        {
          id: 'ag-est-1', name: 'Recepcionista da Clínica', icon: 'spark',
          description: 'Atende novos leads, explica procedimentos de forma clara e conduz para agendamento de avaliação.',
          instructions: 'Você é a recepcionista virtual de uma clínica de estética. Cumprimente com cordialidade, entenda qual procedimento o paciente procura, responda dúvidas gerais sem dar diagnóstico médico e convide sempre para uma avaliação presencial.'
        }
      ]
    }
  }),
  buildOfficial({
    id: 'official-imobiliaria',
    title: 'Imobiliária & Corretores de Alto Padrão',
    summary: 'Pipeline de captação e visitas, formulários de perfil comprador, follow-up e consultor imobiliário de IA.',
    description: 'Montado para imobiliárias, incorporadoras e corretores autônomos. Organiza leads desde o primeiro interesse até a assinatura, automatiza o roteamento de visitas, inclui scripts prontos para envio de catálogo e um consultor virtual para qualificar região, tipologia e faixa de investimento.',
    category: 'Imobiliário',
    tags: ['imobiliária', 'corretores', 'visitas', 'alto padrão', 'crm'],
    assets: {
      pipelines: [{ id: 'p-imo', name: 'Captação & Visitas' }],
      stages: [
        { id: 's-imo-1', pipelineId: 'p-imo', name: 'Lead recebido' },
        { id: 's-imo-2', pipelineId: 'p-imo', name: 'Perfil mapeado' },
        { id: 's-imo-3', pipelineId: 'p-imo', name: 'Visita agendada' },
        { id: 's-imo-4', pipelineId: 'p-imo', name: 'Proposta na mesa' },
        { id: 's-imo-5', pipelineId: 'p-imo', name: 'Contrato assinado' }
      ],
      forms: [
        { id: 'f-imo-1', name: 'Cadastro de Comprador', description: 'Mapeamento de bairro, metragem, dormitórios e faixa de valor.', askPhone: true, active: true },
        { id: 'f-imo-2', name: 'Avaliação de Imóvel', description: 'Captação de proprietários interessados em anunciar imóvel.', askPhone: true, active: true }
      ],
      pages: [
        { id: 'pg-imo-1', name: 'LP Empreendimento Exclusivo', headline: 'Receba a tabela e plantas atualizadas', body: 'Informe seus dados para receber a apresentação completa e agendar uma visita privativa.', button: 'Receber apresentação', formId: 'f-imo-1', kind: 'Funnel', active: false }
      ],
      workflows: [
        {
          id: 'wf-imo-1', name: 'Roteamento de novo comprador', trigger: 'Form submitted', formId: 'f-imo-1', active: false, allowReentry: true,
          actions: [
            { type: 'Add tag', value: 'comprador-ativo' },
            { type: 'Create opportunity', value: 'Atendimento comprador' },
            { type: 'Create task', value: 'Enviar seleção de 3 imóveis aderentes ao perfil' }
          ]
        },
        {
          id: 'wf-imo-2', name: 'Follow-up pós-visita', trigger: 'Opportunity stage changed', stageId: 's-imo-3', active: false, allowReentry: true,
          actions: [
            { type: 'Create task', value: 'Coletar feedback após a visita e validar próximos passos' }
          ]
        }
      ],
      snippetFolders: [{ id: 'sf-imo-1', name: 'Atendimento Imobiliário' }],
      snippets: [
        { id: 'sn-imo-1', folderId: 'sf-imo-1', type: 'Text', name: 'Envio de catálogo', subject: '', body: 'Separei 3 opções alinhadas ao perfil que você comentou. Posso te enviar as plantas e valores por aqui?' },
        { id: 'sn-imo-2', folderId: 'sf-imo-1', type: 'Text', name: 'Confirmação de visita', subject: '', body: 'Nossa visita está confirmada! Segue o endereço e ponto de referência para facilitar sua chegada.' },
        { id: 'sn-imo-3', folderId: 'sf-imo-1', type: 'Text', name: 'Reengajamento de lead', subject: '', body: 'Entrou um imóvel novo esta semana na região que você buscava. Quer dar uma olhada antes de ir para os portais?' }
      ],
      agents: [
        {
          id: 'ag-imo-1', name: 'Consultor Imobiliário IA', icon: 'spark',
          description: 'Qualifica interessados coletando finalidade (moradia ou investimento), região, dormitórios e faixa de orçamento.',
          instructions: 'Você é um consultor imobiliário objetivo e consultivo. Descubra se o cliente busca imóvel para morar ou investir, qual região prefere, faixa de investimento e prazo. Ao concluir o perfil, sugira agendar uma conversa ou visita com um corretor.'
        }
      ]
    }
  }),
  buildOfficial({
    id: 'official-agencia-marketing',
    title: 'Agência de Marketing & Tráfego Pago',
    summary: 'Operação comercial completa de diagnóstico, proposta, onboarding de novos clientes e SDR de IA.',
    description: 'Ideal para agências de tráfego, social media e consultorias digitais. Traz pipeline comercial do diagnóstico até o contrato, formulários de aplicação e onboarding, páginas de captura, automações de qualificação, mensagens comerciais e um SDR de IA pronto para pré-qualificar empresas.',
    category: 'Agências e Serviços',
    tags: ['agência', 'tráfego', 'diagnóstico', 'onboarding', 'sdr'],
    assets: {
      pipelines: [{ id: 'p-ag', name: 'Comercial da Agência' }],
      stages: [
        { id: 's-ag-1', pipelineId: 'p-ag', name: 'Lead de diagnóstico' },
        { id: 's-ag-2', pipelineId: 'p-ag', name: 'Reunião marcada' },
        { id: 's-ag-3', pipelineId: 'p-ag', name: 'Diagnóstico feito' },
        { id: 's-ag-4', pipelineId: 'p-ag', name: 'Proposta enviada' },
        { id: 's-ag-5', pipelineId: 'p-ag', name: 'Cliente ativo' }
      ],
      forms: [
        { id: 'f-ag-1', name: 'Aplicação para Diagnóstico', description: 'Qualificação de nicho, faturamento atual e objetivo de crescimento.', askPhone: true, active: true },
        { id: 'f-ag-2', name: 'Onboarding de Novo Cliente', description: 'Coleta de acessos, marca, público-alvo e metas iniciais.', askPhone: true, active: true }
      ],
      pages: [
        { id: 'pg-ag-1', name: 'LP Diagnóstico Comercial', headline: 'Descubra onde sua empresa está perdendo vendas todos os meses', body: 'Preencha a aplicação em 2 minutos para agendar uma sessão estratégica gratuita com nosso time.', button: 'Solicitar diagnóstico', formId: 'f-ag-1', kind: 'Funnel', active: false },
        { id: 'pg-ag-2', name: 'Obrigado + Próximo Passo', headline: 'Aplicação recebida com sucesso', body: 'Nosso estrategista vai analisar suas respostas e entrar em contato pelo WhatsApp para confirmar a reunião.', button: 'Entendido', formId: '', kind: 'Funnel', active: false }
      ],
      workflows: [
        {
          id: 'wf-ag-1', name: 'Qualificação automática de lead', trigger: 'Form submitted', formId: 'f-ag-1', active: false, allowReentry: true,
          actions: [
            { type: 'Add tag', value: 'diagnostico-solicitado' },
            { type: 'Create opportunity', value: 'Diagnóstico comercial' },
            { type: 'Create task', value: 'Revisar aplicação e agendar call de diagnóstico' }
          ]
        },
        {
          id: 'wf-ag-2', name: 'Checklist de onboarding do cliente', trigger: 'Form submitted', formId: 'f-ag-2', active: false, allowReentry: true,
          actions: [
            { type: 'Add tag', value: 'onboarding-iniciado' },
            { type: 'Create task', value: 'Configurar contas de anúncio, pixel e reunião de kickoff' }
          ]
        }
      ],
      snippetFolders: [{ id: 'sf-ag-1', name: 'Comercial da Agência' }],
      snippets: [
        { id: 'sn-ag-1', folderId: 'sf-ag-1', type: 'Text', name: 'Convite para diagnóstico', subject: '', body: 'Vi sua aplicação para o diagnóstico! Já identifiquei dois pontos rápidos de melhoria. Qual horário funciona melhor para conversarmos 25 min?' },
        { id: 'sn-ag-2', folderId: 'sf-ag-1', type: 'Text', name: 'Envio de proposta', subject: '', body: 'Conforme alinhamos na reunião, segue o plano estruturado para os próximos 90 dias. Me avise se ficar qualquer dúvida.' },
        { id: 'sn-ag-3', folderId: 'sf-ag-1', type: 'Text', name: 'Check-in semanal', subject: '', body: 'Passando com o resumo da semana: principais números, o que performou melhor e os testes da próxima segunda.' }
      ],
      agents: [
        {
          id: 'ag-ag-1', name: 'SDR da Agência', icon: 'spark',
          description: 'Pré-qualifica empresas interessadas em marketing e tráfego pago antes da reunião comercial.',
          instructions: 'Você é o SDR da agência. Pergunte o segmento da empresa, se já investe em anúncios hoje e qual o principal gargalo (geração de leads ou conversão). Se houver aderência, encaminhe para agendar a sessão de diagnóstico.'
        }
      ]
    }
  }),
  buildOfficial({
    id: 'official-infoprodutos',
    title: 'Infoprodutores, Mentorias & Lançamentos',
    summary: 'Captura de evento, aplicação high-ticket, área de onboarding do aluno e concierge de matrículas com IA.',
    description: 'Projetado para experts, mentores e lançadores. Combina funil de inscrição e aplicação, automação de boas-vindas e recuperação comercial, curso inicial de boas-vindas no portal do aluno e um concierge de IA focado em tirar dúvidas e destravar matrículas.',
    category: 'Educação e Infoprodutos',
    tags: ['lançamento', 'mentoria', 'infoproduto', 'curso', 'high-ticket'],
    assets: {
      pipelines: [{ id: 'p-info', name: 'Recuperação & High-Ticket' }],
      stages: [
        { id: 's-info-1', pipelineId: 'p-info', name: 'Inscrito' },
        { id: 's-info-2', pipelineId: 'p-info', name: 'Engajado' },
        { id: 's-info-3', pipelineId: 'p-info', name: 'Aplicação / Carrinho' },
        { id: 's-info-4', pipelineId: 'p-info', name: 'Aluno matriculado' }
      ],
      forms: [
        { id: 'f-info-1', name: 'Inscrição no Evento Gratuito', description: 'Cadastro rápido para aulas ao vivo e materiais do evento.', askPhone: true, active: true },
        { id: 'f-info-2', name: 'Aplicação para Mentoria', description: 'Seleção de candidatos para mentoria em grupo ou individual.', askPhone: true, active: true }
      ],
      pages: [
        { id: 'pg-info-1', name: 'Captura do Evento', headline: 'Participe da imersão ao vivo e construa seu sistema de vendas', body: 'Garanta sua vaga gratuita e receba o link das aulas e o caderno de exercícios.', button: 'Garantir minha vaga', formId: 'f-info-1', kind: 'Funnel', active: false },
        { id: 'pg-info-2', name: 'Página de Aplicação', headline: 'Aplique para a próxima turma da Mentoria', body: 'Preencha suas respostas para que nossa equipe avalie seu momento atual e entre em contato.', button: 'Enviar aplicação', formId: 'f-info-2', kind: 'Funnel', active: false }
      ],
      workflows: [
        {
          id: 'wf-info-1', name: 'Boas-vindas do evento', trigger: 'Form submitted', formId: 'f-info-1', active: false, allowReentry: true,
          actions: [
            { type: 'Add tag', value: 'inscrito-evento' },
            { type: 'Log message', channel: 'WhatsApp', value: 'Inscrição confirmada! Salve este contato para receber o link da aula ao vivo.' }
          ]
        },
        {
          id: 'wf-info-2', name: 'Follow-up de aplicação', trigger: 'Form submitted', formId: 'f-info-2', active: false, allowReentry: true,
          actions: [
            { type: 'Add tag', value: 'aplicacao-mentoria' },
            { type: 'Create opportunity', value: 'Candidato à Mentoria' },
            { type: 'Create task', value: 'Entrar em contato com candidato à mentoria' }
          ]
        }
      ],
      snippetFolders: [{ id: 'sf-info-1', name: 'Lançamento e Matrículas' }],
      snippets: [
        { id: 'sn-info-1', folderId: 'sf-info-1', type: 'Text', name: 'Lembrete aula ao vivo', subject: '', body: 'Começamos em 15 minutos! Já prepara seu bloco de notas e entra pelo link exclusivo.' },
        { id: 'sn-info-2', folderId: 'sf-info-1', type: 'Text', name: 'Convite de mentoria', subject: '', body: 'Recebemos sua aplicação e achamos seu perfil super alinhado à turma. Podemos fazer uma ligação rápida hoje?' }
      ],
      courses: [
        { id: 'c-info-1', name: 'Onboarding do Aluno', description: 'Primeiros passos para aproveitar 100% do método desde o primeiro dia.', lesson: 'Aula 1 — Como extrair o máximo nas próximas 4 semanas', body: 'Assista ao mapa geral do programa, entre na comunidade e defina sua primeira meta prática.', active: true, portalOnly: true }
      ],
      agents: [
        {
          id: 'ag-info-1', name: 'Concierge de Matrículas', icon: 'spark',
          description: 'Responde dúvidas sobre módulos, bônus, garantia e formas de pagamento para aumentar conversão.',
          instructions: 'Você é o concierge de matrículas de um programa educacional. Seja direto, empático e seguro: esclareça o formato das aulas, suporte e garantia, e conduza quem estiver pronto para finalizar a inscrição ou aplicação.'
        }
      ]
    }
  }),
  buildOfficial({
    id: 'official-negocios-locais',
    title: 'Restaurantes, Delivery & Negócios Locais',
    summary: 'Reservas, fidelização de clientes recorrentes, pedido de avaliação pós-visita e atendente local de IA.',
    description: 'Pensado para restaurantes, cafeterias, barbearias e estabelecimentos locais que querem transformar atendimento em recorrência. Inclui funil de reservas e VIPs, página de reserva, automação de pós-visita para gerar avaliações e um atendente virtual para horários e cardápio.',
    category: 'Negócios Locais',
    tags: ['restaurante', 'negócio local', 'reservas', 'fidelização', 'avaliações'],
    assets: {
      pipelines: [{ id: 'p-loc', name: 'Reservas & Fidelização' }],
      stages: [
        { id: 's-loc-1', pipelineId: 'p-loc', name: 'Novo contato' },
        { id: 's-loc-2', pipelineId: 'p-loc', name: 'Reserva solicitada' },
        { id: 's-loc-3', pipelineId: 'p-loc', name: 'Cliente confirmado' },
        { id: 's-loc-4', pipelineId: 'p-loc', name: 'VIP recorrente' }
      ],
      forms: [
        { id: 'f-loc-1', name: 'Reserva de Mesa & Eventos', description: 'Solicitação de reserva com data, horário e número de pessoas.', askPhone: true, active: true }
      ],
      pages: [
        { id: 'pg-loc-1', name: 'LP Cardápio & Reservas', headline: 'Reserve sua mesa em segundos', body: 'Escolha o dia, informe quantas pessoas virão e garanta seu lugar sem fila de espera.', button: 'Solicitar reserva', formId: 'f-loc-1', kind: 'Funnel', active: false }
      ],
      workflows: [
        {
          id: 'wf-loc-1', name: 'Confirmação de reserva', trigger: 'Form submitted', formId: 'f-loc-1', active: false, allowReentry: true,
          actions: [
            { type: 'Add tag', value: 'reserva-solicitada' },
            { type: 'Create opportunity', value: 'Reserva de mesa' },
            { type: 'Create task', value: 'Confirmar disponibilidade da mesa via WhatsApp' }
          ]
        },
        {
          id: 'wf-loc-2', name: 'Pós-visita e avaliação', trigger: 'Opportunity stage changed', stageId: 's-loc-3', active: false, allowReentry: true,
          actions: [
            { type: 'Log message', channel: 'WhatsApp', value: 'Obrigado pela visita! Se curtiu a experiência, sua avaliação ajuda muito nossa equipe.' }
          ]
        }
      ],
      snippetFolders: [{ id: 'sf-loc-1', name: 'Atendimento Local' }],
      snippets: [
        { id: 'sn-loc-1', folderId: 'sf-loc-1', type: 'Text', name: 'Cardápio e horários', subject: '', body: 'Funcionamos de terça a domingo, das 18h às 23h30. Segue nosso cardápio atualizado para você conferir!' },
        { id: 'sn-loc-2', folderId: 'sf-loc-1', type: 'Text', name: 'Confirmação de mesa', subject: '', body: 'Mesa confirmada! Guardaremos sua reserva com 15 minutos de tolerância. Te esperamos!' },
        { id: 'sn-loc-3', folderId: 'sf-loc-1', type: 'Text', name: 'Cupom de retorno', subject: '', body: 'Preparamos um mimo especial para a sua próxima visita esta semana. É só mostrar esta mensagem!' }
      ],
      agents: [
        {
          id: 'ag-loc-1', name: 'Atendente Local IA', icon: 'spark',
          description: 'Responde horários de funcionamento, endereço, dúvidas de cardápio e encaminha reservas.',
          instructions: 'Você é o atendente virtual de um estabelecimento local acolhedor. Responda com simpatia sobre horários, localização e reservas, coletando data, horário e quantidade de pessoas sempre que alguém quiser reservar.'
        }
      ]
    }
  })
];
// Templates de setup (aba Templates de setup), usados para criar subcontas: o funil de reuniões e os convertidos do GHL.
// Os sites dos convertidos não ficam na memória: chegam por templateSites() quando o template é instalado.
const TEMPLATE_SETUPS = [funilReunioesSpec, ...setupTemplateSpecs].map(spec => ({ ...buildOfficial({ publishedAt: '2026-11-22T12:00:00.000Z', ...spec }), template: true, segment: spec.segment }));
export const setupTemplates = () => TEMPLATE_SETUPS;

export function officialSetups() {
  return OFFICIAL_SETUPS;
}

export function findMarketplaceSetup(doc, id) {
  const mkt = hydrateMarketplace(doc);
  const official = OFFICIAL_SETUPS.find(item => item.id === id) || TEMPLATE_SETUPS.find(item => item.id === id);
  if (official) {
    const sites = official.template && !Object.keys(official.studioSites || {}).length ? templateSites(official.id) : null;
    return { ...official, ...(sites && { studioSites: sites }), installs: mkt.officialInstalls[official.id] || 0 };
  }
  return mkt.listings.find(item => item.id === id) || null;
}

export function publicMarketplaceList(doc, myAgencyId = '') {
  const mkt = hydrateMarketplace(doc);
  const strip = item => ({
    id: item.id,
    title: item.title,
    summary: item.summary,
    description: item.description,
    category: item.category,
    tags: item.tags || [],
    author: item.author,
    sourceSnapshotId: item.authorAgencyId === myAgencyId ? item.sourceSnapshotId : '',
    official: Boolean(item.official),
    ...(item.template ? { template: true, segment: item.segment } : {}),
    mine: Boolean(myAgencyId && item.authorAgencyId === myAgencyId),
    version: item.version || 1,
    counts: item.counts || {},
    preview: item.preview || buildSetupPreview(item.assets),
    installs: item.official ? (mkt.officialInstalls[item.id] || 0) : (item.installs || 0),
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt
  });
  const community = [...mkt.listings]
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .map(strip);
  const officials = OFFICIAL_SETUPS.map(strip);
  return [...officials, ...community];
}

// The template gallery is static and large, so it is served on demand (op setup-templates) instead of with every agency response.
export function templateGallery(doc) {
  const mkt = hydrateMarketplace(doc);
  return TEMPLATE_SETUPS.map(({ assets: _assets, studioSites: _sites, ...item }) => ({ ...item, installs: mkt.officialInstalls[item.id] || 0 }));
}

export function publishToMarketplace(doc, { agencyId, author, snap, studioSites = {}, input = {} }) {
  const mkt = hydrateMarketplace(doc);
  const title = req(input.title ?? snap.name, 'Título no marketplace', 100);
  const summary = req(input.summary, 'Resumo curto', 180);
  const description = str(input.description, 1200) || summary;
  const category = marketplaceCategories.includes(input.category) ? input.category : 'Outro';
  const tags = normalizeTags(input.tags);
  const stamp = now();

  const existing = mkt.listings.find(item =>
    item.authorAgencyId === agencyId && (item.sourceSnapshotId === snap.id || (input.listingId && item.id === input.listingId))
  );

  const payload = {
    title,
    summary,
    description,
    category,
    tags,
    author: str(author, 80) || 'Agência da comunidade',
    authorAgencyId: agencyId,
    sourceSnapshotId: snap.id,
    official: false,
    version: snap.version || 1,
    counts: structuredClone(snap.counts || {}),
    preview: buildSetupPreview(snap.assets),
    assets: structuredClone(snap.assets || {}),
    studioSites: structuredClone(studioSites || {}),
    updatedAt: stamp
  };

  if (existing) {
    Object.assign(existing, payload);
    doc.listings = mkt.listings;
    doc.officialInstalls = mkt.officialInstalls;
    return { listing: existing, updated: true };
  }

  if (mkt.listings.length >= MAX_MARKETPLACE_LISTINGS) {
    fail('O marketplace atingiu o limite de publicações.', 400);
  }
  const listing = {
    id: `mkt-${uid()}`,
    ...payload,
    installs: 0,
    publishedAt: stamp
  };
  mkt.listings.push(listing);
  doc.listings = mkt.listings;
  doc.officialInstalls = mkt.officialInstalls;
  return { listing, updated: false };
}

export function unpublishFromMarketplace(doc, { agencyId, listingId }) {
  const mkt = hydrateMarketplace(doc);
  const index = mkt.listings.findIndex(item => item.id === listingId);
  if (index < 0) fail('Publicação não encontrada no marketplace.', 404);
  const listing = mkt.listings[index];
  if (listing.authorAgencyId !== agencyId) fail('Você só pode remover setups publicados pela sua agência.', 403);
  mkt.listings.splice(index, 1);
  doc.listings = mkt.listings;
  doc.officialInstalls = mkt.officialInstalls;
  return listing;
}

export function recordMarketplaceInstall(doc, id) {
  const mkt = hydrateMarketplace(doc);
  const official = OFFICIAL_SETUPS.find(item => item.id === id) || TEMPLATE_SETUPS.find(item => item.id === id);
  if (official) {
    mkt.officialInstalls[id] = (mkt.officialInstalls[id] || 0) + 1;
    doc.listings = mkt.listings;
    doc.officialInstalls = mkt.officialInstalls;
    return mkt.officialInstalls[id];
  }
  const listing = mkt.listings.find(item => item.id === id);
  if (!listing) fail('Setup não encontrado no marketplace.', 404);
  listing.installs = (listing.installs || 0) + 1;
  doc.listings = mkt.listings;
  doc.officialInstalls = mkt.officialInstalls;
  return listing.installs;
}
