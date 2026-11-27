// i18n: Suporte completo a Português (Brasil) e Espanhol Latinoamericano (es-419).
// O idioma padrão é Português. O usuário escolhe o idioma via interface,
// e a seleção persiste no localStorage ('graao_lang').
// O catálogo de traduções fica em ui/locales/*.js (public/ é o espelho de ui/: scripts/sync-public.mjs).
// O catálogo espanhol (~440 KB) é baixado sob demanda no navegador: na abertura só se o idioma salvo for
// espanhol, ou quando a pessoa troca para espanhol. No servidor (sem window) ele carrega já na importação,
// para tr() e setLanguage() continuarem síncronos (relatórios compartilhados, testes).

let currentLang = 'pt';
try {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('graao_lang');
    if (saved === 'es' || saved === 'pt') currentLang = saved;
  }
} catch {}

export function getLanguage() {
  return currentLang;
}

export const languages = [
  { id: 'pt', label: 'Português', flag: 'PT' },
  { id: 'es', label: 'Español Latino', flag: 'ES' }
];

// Registro dinâmico de novos idiomas (ex: en, fr, de). O espanhol entra aqui quando carregado.
export const TRANSLATIONS = {};

// Referência canônica exportada para compatibilidade total (preenchida junto com o catálogo espanhol).
export let PT_TO_ES = {};

let spanishLoading = null;
function loadSpanish() {
  spanishLoading ??= import('./locales/es.js').then(module => {
    TRANSLATIONS.es = module.default;
    PT_TO_ES = module.default;
  }).catch(error => { spanishLoading = null; throw error; });
  return spanishLoading;
}
if (typeof window === 'undefined' || currentLang === 'es') await loadSpanish();

export function registerLanguage(id, { label, flag, translations = {} }) {
  if (!id) return;
  if (!languages.some(l => l.id === id)) {
    languages.push({ id, label: label || id, flag: flag || id.toUpperCase() });
  }
  TRANSLATIONS[id] = translations;
}

// Síncrono quando o catálogo já está carregado. Antes do primeiro uso do espanhol no navegador devolve uma
// promessa: o idioma só muda (e o aviso graao:languagechange só sai) depois que o catálogo chegou.
export function setLanguage(lang) {
  if (lang !== 'es' && lang !== 'pt' && !TRANSLATIONS[lang]) return;
  if (lang === 'es' && !TRANSLATIONS.es) return loadSpanish().then(() => setLanguage(lang));
  currentLang = lang;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('graao_lang', lang);
    }
  } catch {}
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'es' ? 'es-419' : lang === 'pt' ? 'pt-BR' : lang;
    document.querySelectorAll('[data-lang-choice]').forEach(btn => {
      const isThis = btn.dataset.langChoice === lang;
      btn.classList.toggle('active', isThis);
      btn.setAttribute('aria-pressed', String(isThis));
    });
    document.querySelectorAll('[data-lang-choice-select]').forEach(sel => {
      sel.value = lang;
    });
    if (lang === 'pt') {
      restoreDom(document.body);
    } else {
      translateDom(document.body);
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('graao:languagechange', { detail: { lang } }));
  }
}

export function langToggle() {
  const lang = getLanguage();
  return `<div class="lang-switcher" role="group" aria-label="${lang === 'es' ? 'Seleccionar idioma' : 'Selecionar idioma'}">
    <button type="button" class="lang-btn ${lang === 'pt' ? 'active' : ''}" data-lang-choice="pt" data-tip="Português" data-tip-pos="bottom" aria-label="Português" aria-pressed="${lang === 'pt'}">PT</button>
    <button type="button" class="lang-btn ${lang === 'es' ? 'active' : ''}" data-lang-choice="es" data-tip="Español Latino" data-tip-pos="bottom" aria-label="Español Latino" aria-pressed="${lang === 'es'}">ES</button>
  </div>`;
}

// Rótulos em português para valores salvos em inglês no banco de dados
export const PT = {
  // Oportunidades, faturas, agendamentos, campanhas
  Open: 'Em aberto', Won: 'Ganha', Lost: 'Perdida', Abandoned: 'Abandonada',
  Confirmed: 'Confirmado', Completed: 'Concluído', Canceled: 'Cancelado', Cancelled: 'Cancelado',
  Draft: 'Rascunho', Paid: 'Pago', Void: 'Anulada', Planned: 'Planejado', Archived: 'Arquivado', Published: 'Publicado',
  // Etapas e pipelines padrão
  'New Lead': 'Novo lead', 'New lead': 'Novo lead', Qualified: 'Qualificado', qualified: 'Qualificado',
  Proposal: 'Proposta', proposal: 'Proposta', 'Sales Pipeline': 'Pipeline de vendas',
  // Canais e mensagens
  Social: 'Social', Email: 'E-mail', SMS: 'SMS', Note: 'Nota', 'Live chat': 'Chat ao vivo', Instagram: 'Instagram', Facebook: 'Facebook', Outbound: 'Enviada', Inbound: 'Recebida', Text: 'Texto',
  // Páginas e agentes
  Funnel: 'Funil', Website: 'Site', Support: 'Suporte', Sales: 'Vendas', Scheduling: 'Agendamento',
  // Ações manuais e automações
  Pending: 'Pendente', Skipped: 'Ignorada', Running: 'Em execução', 'Manual Call': 'Ligação manual', 'Manual SMS': 'SMS manual',
  'Add tag': 'Adicionar tag', 'Create task': 'Criar tarefa', 'Create opportunity': 'Criar oportunidade', 'Log message': 'Registrar mensagem',
  'Contact created': 'Contato criado', 'Form submitted': 'Formulário enviado', 'Opportunity stage changed': 'Etapa da oportunidade alterada',
  'Appointment booked': 'Agendamento marcado', 'Trigger link clicked': 'Link de rastreamento clicado',
  Unassigned: 'Não atribuído', 'Contact removed': 'Contato removido', 'Good Work!': 'Bom trabalho!',
  // SLA
  Met: 'Cumprido', Breached: 'Estourado', Overdue: 'Atrasado', 'Due soon': 'Vence em breve', Waiting: 'Aguardando', Dismissed: 'Dispensado',
  All: 'Todos', 'Waiting for reply': 'Aguardando resposta', 'Average response': 'Tempo médio de resposta',
  // Filtros e opções comuns
  'All workflows': 'Todos os fluxos', 'All assignees': 'Todos os responsáveis', 'All statuses': 'Todos os status',
  'Any type': 'Qualquer tipo', 'All channels': 'Todos os canais', 'All pipelines': 'Todos os pipelines',
  'All folders': 'Todas as pastas', 'No folder': 'Nenhuma pasta',
  // Snippets e links
  Snippets: 'Respostas rápidas', Snippet: 'Resposta rápida', 'All Snippets': 'Todas as respostas',
  Folders: 'Pastas', 'Snippet folders': 'Pastas de respostas rápidas',
  'Trigger Links': 'Links de rastreamento', 'Trigger links': 'Links de rastreamento',
  // Painel
  Dashboard: 'Painel', 'Opportunity status': 'Status das oportunidades', 'Opportunity value': 'Valor das oportunidades',
  'Conversion rate': 'Taxa de conversão', 'Stages distribution': 'Distribuição por etapa', Tasks: 'Tarefas', 'Manual actions': 'Ações manuais',
  'Lead source report': 'Relatório de origem dos leads', 'Google Analytics count': 'Contagem do Google Analytics',
  'Google Analytics chart': 'Gráfico do Google Analytics', 'Meta Ads report': 'Relatório do Meta Ads', 'Google Ads report': 'Relatório do Google Ads',
  'Email health report': 'Saúde do e-mail', 'Sales efficiency': 'Eficiência de vendas', 'Contacts created': 'Contatos criados',
  Appointments: 'Agendamentos', 'Paid invoices': 'Faturas pagas', 'Sticky note': 'Nota adesiva',
  // Agência
  Active: 'Ativa', Paused: 'Pausada', Closed: 'Encerrada', New: 'Novo', Contacted: 'Contatado', 'Proposal sent': 'Proposta enviada',
  Trial: 'Teste', Requested: 'Solicitado', Withdrawn: 'Retirado', 'In progress': 'Em andamento', Declined: 'Recusado', 'Under review': 'Em análise',
  'Agency Owner': 'Dono da agência', 'Agency Admin': 'Admin da agência', 'Agency User': 'Usuário da agência',
  'Account Admin': 'Admin da conta', 'Account User': 'Usuário da conta',
  Design: 'Design', Development: 'Desenvolvimento', 'Paid ads': 'Anúncios pagos', Copywriting: 'Redação', Consulting: 'Consultoria', Other: 'Outro',
  Conversations: 'Conversas', Automation: 'Automação', Payments: 'Pagamentos', Reporting: 'Relatórios', Mobile: 'Celular',
  'New tab': 'Nova aba', 'Inside the app': 'Dentro do app', 'Sub-accounts': 'Subcontas', Agency: 'Agência', Both: 'Ambos',
  Information: 'Informação', Success: 'Sucesso', Warning: 'Aviso', Credit: 'Crédito', Charge: 'Cobrança', 'Bank transfer': 'Transferência bancária',
  Subscription: 'Assinatura', 'Subscription + usage': 'Assinatura + uso',
  Automotive: 'Automotivo', Beauty: 'Beleza', Creative: 'Criativo', Financial: 'Financeiro', Health: 'Saúde',
  'Home services': 'Serviços residenciais', Legal: 'Jurídico', 'Real estate': 'Imobiliário', Technology: 'Tecnologia',
  Calendars: 'Calendários', Phone: 'Telefone', Accounting: 'Contabilidade', Team: 'Equipe', Commerce: 'Comércio',
  // Configurador SaaS
  'Phone calls and SMS': 'Ligações e SMS', 'Email sending': 'Envio de e-mails', 'Premium workflow actions': 'Ações premium de workflow',
  'Conversation and content AI': 'IA de conversas e conteúdo', 'WhatsApp messages': 'Mensagens de WhatsApp', 'Voice AI minutes': 'Minutos de IA de voz',
  'Contact enrichment': 'Enriquecimento de contatos', Cash: 'Dinheiro', Pix: 'Pix', Card: 'Cartão', Manual: 'Manual', 'Domain purchases': 'Compra de domínios',
  'Workflow - Premium Features': 'Workflow: recursos premium', 'Workflow - External AI Models': 'Workflow: modelos de IA externos', 'Domain Purchase': 'Compra de domínios',
  'Look up the line type and carrier of phone numbers before sending SMS.': 'Consulta o tipo de linha e a operadora do número antes de enviar SMS.',
  'Premium triggers and actions in the workflow builder of each sub-account.': 'Gatilhos e ações premium no construtor de workflows de cada subconta.',
  'Workflow actions that call external AI models from a sub-account.': 'Ações de workflow que chamam modelos de IA externos a partir da subconta.',
  'Let sub-accounts buy domains from inside Sites settings.': 'Permite que as subcontas comprem domínios nas configurações de Sites.'
};

// Rótulos em Espanhol Latino (es-419) para valores do banco
export const ES = {
  // Oportunidades, facturas, citas, campañas
  Open: 'Abierta', Won: 'Ganada', Lost: 'Perdida', Abandoned: 'Abandonada',
  Confirmed: 'Confirmado', Completed: 'Completado', Canceled: 'Cancelado', Cancelled: 'Cancelado',
  Draft: 'Borrador', Paid: 'Pagado', Void: 'Anulada', Planned: 'Planificado', Archived: 'Archivado', Published: 'Publicado',
  // Etapas y pipelines estándar
  'New Lead': 'Nuevo lead', 'New lead': 'Nuevo lead', Qualified: 'Calificado', qualified: 'Calificado',
  Proposal: 'Propuesta', proposal: 'Propuesta', 'Sales Pipeline': 'Pipeline de ventas',
  // Canales y mensajes
  Social: 'Social', Email: 'Correo electrónico', SMS: 'SMS', Note: 'Nota', 'Live chat': 'Chat en vivo', Instagram: 'Instagram', Facebook: 'Facebook', Outbound: 'Enviada', Inbound: 'Recibida', Text: 'Texto',
  // Páginas y agentes
  Funnel: 'Embudo', Website: 'Sitio web', Support: 'Soporte', Sales: 'Ventas', Scheduling: 'Agendamiento',
  // Acciones manuales y automatizaciones
  Pending: 'Pendiente', Skipped: 'Omitida', Running: 'En ejecución', 'Manual Call': 'Llamada manual', 'Manual SMS': 'SMS manual',
  'Add tag': 'Agregar etiqueta', 'Create task': 'Crear tarea', 'Create opportunity': 'Crear oportunidad', 'Log message': 'Registrar mensaje',
  'Contact created': 'Contacto creado', 'Form submitted': 'Formulario enviado', 'Opportunity stage changed': 'Etapa de oportunidad cambiada',
  'Appointment booked': 'Cita agendada', 'Trigger link clicked': 'Enlace de rastreo clickeado',
  Unassigned: 'Sin asignar', 'Contact removed': 'Contacto eliminado', 'Good Work!': '¡Buen trabajo!',
  // SLA
  Met: 'Cumplido', Breached: 'Incumplido', Overdue: 'Vencido', 'Due soon': 'Por vencer', Waiting: 'En espera', Dismissed: 'Descartado',
  All: 'Todos', 'Waiting for reply': 'Esperando respuesta', 'Average response': 'Tiempo promedio de respuesta',
  // Filtros y opciones comunes
  'All workflows': 'Todos los flujos', 'All assignees': 'Todos los responsables', 'All statuses': 'Todos los estados',
  'Any type': 'Cualquier tipo', 'All channels': 'Todos los canales', 'All pipelines': 'Todos los pipelines',
  'All folders': 'Todas las carpetas', 'No folder': 'Sin carpeta',
  // Snippets y enlaces
  Snippets: 'Respuestas rápidas', Snippet: 'Respuesta rápida', 'All Snippets': 'Todas las respuestas',
  Folders: 'Carpetas', 'Snippet folders': 'Carpetas de respuestas rápidas',
  'Trigger Links': 'Enlaces de rastreo', 'Trigger links': 'Enlaces de rastreo',
  // Panel
  Dashboard: 'Panel de control', 'Opportunity status': 'Estado de las oportunidades', 'Opportunity value': 'Valor de las oportunidades',
  'Conversion rate': 'Tasa de conversión', 'Stages distribution': 'Distribución por etapa', Tasks: 'Tareas', 'Manual actions': 'Acciones manuales',
  'Lead source report': 'Informe de origen de leads', 'Google Analytics count': 'Conteo de Google Analytics',
  'Google Analytics chart': 'Gráfico de Google Analytics', 'Meta Ads report': 'Informe de Meta Ads', 'Google Ads report': 'Informe de Google Ads',
  'Email health report': 'Salud del correo electrónico', 'Sales efficiency': 'Eficiencia de ventas', 'Contacts created': 'Contactos creados',
  Appointments: 'Citas', 'Paid invoices': 'Facturas pagadas', 'Sticky note': 'Nota adhesiva',
  // Agencia
  Active: 'Activa', Paused: 'Pausada', Closed: 'Cerrada', New: 'Nuevo', Contacted: 'Contactado', 'Proposal sent': 'Propuesta enviada',
  Trial: 'Prueba', Requested: 'Solicitado', Withdrawn: 'Retirado', 'In progress': 'En progreso', Declined: 'Rechazado', 'Under review': 'En revisión',
  'Agency Owner': 'Dueño de la agencia', 'Agency Admin': 'Admin de la agencia', 'Agency User': 'Usuario de la agencia',
  'Account Admin': 'Admin de la cuenta', 'Account User': 'Usuario de la cuenta',
  Design: 'Diseño', Development: 'Desarrollo', 'Paid ads': 'Anuncios pagados', Copywriting: 'Redacción', Consulting: 'Consultoría', Other: 'Otro',
  Conversations: 'Conversaciones', Automation: 'Automatización', Payments: 'Pagos', Reporting: 'Informes', Mobile: 'Celular',
  'New tab': 'Nueva pestaña', 'Inside the app': 'Dentro de la app', 'Sub-accounts': 'Subcuentas', Agency: 'Agencia', Both: 'Ambos',
  Information: 'Información', Success: 'Éxito', Warning: 'Advertencia', Credit: 'Crédito', Charge: 'Cobro', 'Bank transfer': 'Transferencia bancaria',
  Subscription: 'Suscripción', 'Subscription + usage': 'Suscripción + uso',
  Automotive: 'Automotriz', Beauty: 'Belleza', Creative: 'Creativo', Financial: 'Financiero', Health: 'Salud',
  'Home services': 'Servicios para el hogar', Legal: 'Legal', 'Real estate': 'Bienes raíces', Technology: 'Tecnología',
  Calendars: 'Calendarios', Phone: 'Teléfono', Accounting: 'Contabilidad', Team: 'Equipo', Commerce: 'Comercio',
  // Configurador SaaS
  'Phone calls and SMS': 'Llamadas y SMS', 'Email sending': 'Envío de correos', 'Premium workflow actions': 'Acciones premium de workflow',
  'Conversation and content AI': 'IA de conversaciones y contenido', 'WhatsApp messages': 'Mensajes de WhatsApp', 'Voice AI minutes': 'Minutos de IA de voz',
  'Contact enrichment': 'Enriquecimiento de contactos', Cash: 'Efectivo', Pix: 'Pix', Card: 'Tarjeta', Manual: 'Manual', 'Domain purchases': 'Compra de dominios',
  'Workflow - Premium Features': 'Workflow: funciones premium', 'Workflow - External AI Models': 'Workflow: modelos de IA externos', 'Domain Purchase': 'Compra de dominios',
  'Look up the line type and carrier of phone numbers before sending SMS.': 'Consulta el tipo de línea y operadora del número antes de enviar SMS.',
  'Premium triggers and actions in the workflow builder of each sub-account.': 'Disparadores y acciones premium en el constructor de workflows de cada subcuenta.',
  'Workflow actions that call external AI models from a sub-account.': 'Acciones de workflow que invocan modelos de IA externos desde la subcuenta.',
  'Let sub-accounts buy domains from inside Sites settings.': 'Permite a las subcuentas comprar dominios desde la configuración de Sitios.'
};

export const tr = (value, lang = getLanguage()) => {
  if (typeof value !== 'string') return value;
  if (lang === 'pt') {
    return PT[value] ?? value;
  }
  // Lookup in active language dictionary
  const dict = TRANSLATIONS[lang] || TRANSLATIONS.es || {};
  if (dict[value]) return dict[value];
  if (ES[value]) return ES[value];

  // Try punctuation suffix
  const puncMatch = value.match(/^(.+?)([:…\.\?!]+)$/);
  if (puncMatch) {
    const base = puncMatch[1].trim();
    const punc = puncMatch[2];
    const trans = dict[base] || ES[base];
    if (trans) return trans + punc;
  }

  // Try dynamic patterns
  for (const [pattern, replacement] of DYNAMIC_PATTERNS) {
    if (pattern.test(value)) {
      return value.replace(pattern, replacement);
    }
  }

  const ptVal = PT[value];
  if (ptVal && dict[ptVal]) return dict[ptVal];
  return value;
};

// Regex de substituições dinâmicas para Espanhol Latino
export const DYNAMIC_PATTERNS = [
  [/^©\s*(\d{4})\s+(.+?)\.\s+Feito no Brasil com ☕, mordidas e muito MCP\.$/, '© $1 $2. Hecho en Brasil con ☕, mordiscos y mucho MCP.'],
  [/^abrindo\s+(.+)$/i, 'Abriendo $1'],
  [/^(\d+)\s+contatos?$/i, '$1 contactos'],
  [/^(\d+)\s+oportunidades?$/i, '$1 oportunidades'],
  [/^(\d+)\s+módulos?$/i, '$1 módulos'],
  [/^(\d+)\s+aulas?$/i, '$1 lecciones'],
  [/^(\d+)\s+cursos?$/i, '$1 cursos'],
  [/^(\d+)\s+formulários?$/i, '$1 formularios'],
  [/^(\d+)\s+pesquisas?$/i, '$1 encuestas'],
  [/^(\d+)\s+questionários?$/i, '$1 cuestionarios'],
  [/^atualizado em\s+(.+)$/i, 'actualizado el $1'],
  [/^criado em\s+(.+)$/i, 'creado el $1'],
  [/^agindo como\s+(.+)$/i, 'actuando como $1'],
  [/^subconta\s+(.+)$/i, 'subcuenta $1'],
  [/^(\d+)\s+de\s+(\d+)\s+aulas concluídas$/i, '$1 de $2 lecciones completadas'],
  [/^(\d+)\s+pausada(s)\s+·\s+(\d+)\s+encerrada(s)$/i, '$1 pausada(s) · $2 cerrada(s)'],
  [/^(\d+)\s+selecionada(s)$/i, '$1 seleccionada(s)'],
  [/^(\d+)\s+subconta(s)\s+cadastradas$/i, '$1 subcuenta(s) registradas'],
  [/^votar em\s+(.+)$/i, 'votar por $1'],
  [/^comentários\s+\((\d+)\)$/i, 'comentarios ($1)'],
  [/^boas-vindas,\s+(.+)\.\s+(.+)$/i, '¡Bienvenido(a), $1! $2']
];

export function translateText(text) {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed) return text;

  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.es || {};

  // 1. Direct dictionary match
  if (dict[trimmed]) {
    return text.replace(trimmed, dict[trimmed]);
  }
  if (ES[trimmed]) {
    return text.replace(trimmed, ES[trimmed]);
  }

  // 2. Trailing punctuation match (: … . ? !)
  const puncMatch = trimmed.match(/^(.+?)([:…\.\?!]+)$/);
  if (puncMatch) {
    const base = puncMatch[1].trim();
    const punc = puncMatch[2];
    const trans = dict[base] || ES[base];
    if (trans) {
      return text.replace(trimmed, trans + punc);
    }
  }

  // 3. Parentheses match
  const parenMatch = trimmed.match(/^\((.+?)\)$/);
  if (parenMatch) {
    const base = parenMatch[1].trim();
    const trans = dict[base] || ES[base];
    if (trans) {
      return text.replace(trimmed, `(${trans})`);
    }
  }

  // 4. Dynamic patterns
  for (const [pattern, replacement] of DYNAMIC_PATTERNS) {
    if (pattern.test(trimmed)) {
      return text.replace(trimmed, trimmed.replace(pattern, replacement));
    }
  }

  return text;
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'CODE', 'PRE', 'SVG', 'NOSCRIPT', 'TEXTAREA']);
const TRANSLATED_ATTRS = ['placeholder', 'title', 'aria-label', 'data-tip'];

function translateAttrs(el) {
  for (const attr of TRANSLATED_ATTRS) {
    const val = el.getAttribute(attr);
    if (!val || !val.trim()) continue;
    const translated = translateText(val);
    if (translated === val) continue;
    el.__graaoOrigAttrs ??= {};
    if (el.__graaoOrigAttrs[attr] === undefined) el.__graaoOrigAttrs[attr] = val;
    el.setAttribute(attr, translated);
  }
}

function translateTextNode(node) {
  const val = node.nodeValue;
  if (!val || !val.trim()) return;
  const translated = translateText(val);
  if (translated === val) return;
  if (node.__graaoOrig === undefined) node.__graaoOrig = val;
  node.nodeValue = translated;
}

export function translateDom(root = document.body) {
  if (!root || typeof document === 'undefined') return;
  if (getLanguage() === 'pt') return;
  // User content (slides, text being typed) opts out; the observer hands us nodes deep inside it too.
  if (root.closest?.('[data-no-translate]')) return;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.dataset?.noTranslate) return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS.has(node.tagName)) {
            // O conteúdo de um campo de texto é do usuário, mas o placeholder e o rótulo são da interface.
            if (node.tagName === 'TEXTAREA') translateAttrs(node);
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
        if (node.nodeType === Node.TEXT_NODE) {
          if (node.parentElement && (SKIP_TAGS.has(node.parentElement.tagName) || node.parentElement.dataset?.noTranslate)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    }
  );

  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      translateTextNode(current);
    } else if (current.nodeType === Node.ELEMENT_NODE) {
      translateAttrs(current);
    }
    current = walker.nextNode();
  }
}

export function restoreDom(root = document.body) {
  if (!root || typeof document === 'undefined') return;

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    null
  );

  let current = walker.nextNode();
  while (current) {
    if (current.nodeType === Node.TEXT_NODE && current.__graaoOrig !== undefined) {
      current.nodeValue = current.__graaoOrig;
      delete current.__graaoOrig;
    } else if (current.nodeType === Node.ELEMENT_NODE && current.__graaoOrigAttrs) {
      for (const [attr, val] of Object.entries(current.__graaoOrigAttrs)) {
        current.setAttribute(attr, val);
      }
      delete current.__graaoOrigAttrs;
    }
    current = walker.nextNode();
  }
}

let observer = null;
export function initI18n() {
  if (typeof document === 'undefined') return;

  document.documentElement.lang = currentLang === 'es' ? 'es-419' : 'pt-BR';

  if (!observer && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(mutations => {
      if (getLanguage() === 'pt') return;
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              translateDom(node);
            } else if (node.nodeType === Node.TEXT_NODE) {
              // el.textContent = '…' troca só o nó de texto: traduz também esse caso.
              const parent = node.parentElement;
              if (parent && !SKIP_TAGS.has(parent.tagName) && !parent.closest('[data-no-translate]')) {
                translateTextNode(node);
              }
            }
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  document.addEventListener('click', e => {
    const btn = e.target instanceof Element && e.target.closest('[data-lang-choice]');
    if (!btn) return;
    const choice = btn.dataset.langChoice;
    if (choice) setLanguage(choice);
  });

  document.addEventListener('change', e => {
    const sel = e.target instanceof Element && e.target.closest('[data-lang-choice-select]');
    if (!sel) return;
    if (sel.value) setLanguage(sel.value);
  });

  if (currentLang !== 'pt') {
    translateDom(document.body);
  }
}
