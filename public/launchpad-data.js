// Graao's setup milestones. Completion is derived from the current workspace,
// never from opening a link or watching a tutorial.
export const setupCategories = [
  ['initial', 'Configuração inicial', 'sun'],
  ['marketing', 'Marketing e geração de leads', 'send'],
  ['sales', 'Vendas e conversas', 'chat'],
  ['website', 'Website e monetização', 'site'],
  ['commerce', 'Comércio eletrônico', 'pay']
];

export const canSetup = (access, module) => !access?.modules || access.modules.includes(module);
const step = (label, done, href) => ({ label, done: Boolean(done), href });

export function setupTasks(state, access, whatsapp) {
  const s = state || {};
  const rows = key => Array.isArray(s[key]) ? s[key] : [];
  const has = key => rows(key).length > 0;
  const active = key => rows(key).some(row => row.active === true);
  const task = (id, categories, title, description, icon, modules, steps, instructions) =>
    ({ id, categories, title, description, icon, modules, steps, instructions });
  const tasks = [
    task('contact', ['initial'], 'Criar um novo contato', 'Comece sua base de clientes com as informações de quem já conversa com você.', 'contacts', ['contacts'], [
      step('Adicionar o primeiro contato', has('contacts'), '#contacts')
    ], ['Abra Contatos e clique em Adicionar contato.', 'Preencha o nome e, se possível, o e-mail ou telefone. Salve o contato.', 'Volte ao Launchpad para conferir a conclusão desta tarefa.']),
    task('import', ['initial'], 'Importar seus contatos', 'Traga sua base existente para a Graao com uma planilha CSV.', 'contacts', ['contacts', 'settings'], [
      step('Concluir uma importação de contatos', rows('imports').some(row => row.object !== 'opportunities' && row.status === 'Completed' && row.added > 0), '#settings/import')
    ], ['Prepare um CSV com a coluna name. Você também pode incluir email, phone, company, tags e notes.', 'Em Configurações → Importar dados, selecione o arquivo e confirme a importação de até 500 contatos.', 'Contatos com e-mail já cadastrado são ignorados. A tarefa é concluída quando a importação adiciona pelo menos um contato.']),
    task('funnel', ['initial', 'marketing'], 'Capturar leads com um funil e formulário', 'Crie uma página de captação e um formulário para receber novos interessados.', 'flow', ['sites'], [
      step('Publicar um formulário', active('forms'), '#sites/forms'),
      step('Publicar um funil', rows('studioProjects').some(row => row.kind === 'funnel' && row.publishedAt), '#sites/funnels')
    ], ['Em Sites → Formulários, crie seu formulário, configure os campos e ative a publicação.', 'Em Sites → Funis, crie um funil e inclua o formulário na página de captação.', 'Publique o funil e teste o endereço público. As duas publicações aparecem no progresso do guia.']),
    task('communication', ['initial', 'sales'], 'Preparar o atendimento pelo WhatsApp', 'Conecte o número da subconta para conversar com seus clientes.', 'whatsapp', ['settings'], [
      step('Conectar o WhatsApp da subconta', whatsapp?.status === 'connected', '#settings/whatsapp')
    ], ['Em Configurações → WhatsApp, clique em Conectar WhatsApp.', 'No celular, abra Aparelhos conectados e leia o QR Code. Você também pode usar o pareamento por número.', 'Espere a confirmação de conexão. Volte ao guia para verificar o estado atual. A agência precisa ter configurado o provedor.']),
    task('campaign', ['initial', 'marketing'], 'Enviar sua primeira campanha de e-mail', 'Monte o e-mail no construtor e envie para os seus contatos.', 'send', ['marketing'], [
      step('Criar uma campanha de e-mail', rows('emailCampaigns').length > 0, '#marketing/email-campaigns'),
      step('Enviar ou agendar a campanha', rows('emailCampaigns').some(row => row.status !== 'draft'), '#marketing/email-campaigns')
    ], ['Em Marketing → E-mails → Campanhas, clique em Nova campanha.', 'Monte o e-mail com os blocos, escolha o público e envie um teste para você.', 'Clique em Enviar ou agendar. Aberturas, cliques e cancelamentos aparecem no relatório da campanha.']),
    task('workflow', ['initial', 'marketing'], 'Automatizar o acompanhamento dos leads', 'Ative um fluxo para executar ações quando algo acontecer na sua base.', 'flow', ['automation'], [
      step('Criar um fluxo de automação', has('workflows'), '#automation/workflows'),
      step('Publicar um fluxo', active('workflows'), '#automation/workflows')
    ], ['Abra Automações e crie um fluxo.', 'Escolha o gatilho e adicione as ações de acompanhamento.', 'Revise as ações e publique o fluxo. O guia reconhece a publicação automaticamente.']),
    task('appointment', ['initial'], 'Organizar seu primeiro agendamento', 'Reserve um horário e vincule o compromisso ao contato.', 'cal', ['calendars'], [
      step('Salvar um agendamento', rows('appointments').some(row => row.status !== 'Canceled'), '#calendars')
    ], ['Abra Calendários e clique em Novo agendamento ou em um dia do calendário.', 'Escolha o contato, informe o título e os horários de início e fim.', 'Salve o compromisso e confira a reserva no calendário.']),
    task('pipeline', ['initial', 'sales'], 'Acompanhar negócios no pipeline', 'Registre sua primeira oportunidade e acompanhe o avanço da venda.', 'leads', ['opportunities'], [
      step('Criar uma oportunidade', has('opportunities'), '#opportunities')
    ], ['Abra Oportunidades. Use o pipeline inicial ou organize as etapas na aba Pipelines.', 'Clique em Nova oportunidade e informe o nome, contato, valor e etapa.', 'Salve e mova o cartão conforme a negociação avança.']),
    task('social', ['marketing'], 'Gerenciar suas redes sociais em um só lugar', 'Conecte uma rede e prepare sua primeira publicação no Planejador Social.', 'send', ['marketing'], [
      step('Conectar uma conta social', rows('socialAccounts').some(row => row.status === 'connected'), '#marketing/social'),
      step('Agendar ou publicar um post', rows('socialPosts').some(row => ['scheduled', 'published'].includes(row.status)), '#marketing/social')
    ], ['Em Marketing → Planejador Social, conecte uma conta por um dos provedores disponíveis.', 'Crie uma publicação, escolha a conta e prepare o texto e a mídia.', 'Agende ou publique o post. A conclusão depende do status salvo, não de abrir o planejador.']),
    task('live-chat', ['sales'], 'Atender visitantes com chat ao vivo', 'Crie um widget para receber conversas diretamente do seu site.', 'chat', ['sites'], [
      step('Criar um widget de chat', has('chatWidgets'), '#sites/chat-widget'),
      step('Ativar um widget', active('chatWidgets'), '#sites/chat-widget')
    ], ['Em Sites → Chat, crie um widget e personalize as mensagens e os campos.', 'Ative o widget e copie o código de instalação para seu site.', 'Abra a prévia para testar o atendimento. O guia verifica a ativação; a instalação no seu site deve ser conferida por você.']),
    task('website', ['website'], 'Publicar seu primeiro site', 'Construa sua presença online e coloque uma página no ar.', 'site', ['sites'], [
      step('Criar um site', rows('studioProjects').some(row => row.kind !== 'funnel'), '#sites/websites'),
      step('Publicar um site', rows('studioProjects').some(row => row.kind !== 'funnel' && row.publishedAt), '#sites/websites')
    ], ['Em Sites → Websites, crie um site com um modelo ou com o construtor.', 'Edite as páginas, revise o conteúdo e confira a prévia.', 'Publique o site e abra o endereço público para testar.']),
    task('blog', ['website'], 'Publicar conteúdo no seu blog', 'Organize seus artigos e compartilhe o que seu negócio sabe fazer.', 'edit', ['sites'], [
      step('Criar um blog', has('blogs'), '#sites/blogs'),
      step('Publicar um artigo', rows('blogPosts').some(row => row.status === 'published'), '#sites/blogs')
    ], ['Em Sites → Blogs, crie o blog e defina suas informações.', 'Adicione um artigo, escreva o conteúdo e revise o endereço e os dados de SEO.', 'Publique o artigo e confira sua página pública.']),
    task('product', ['commerce'], 'Cadastrar seu primeiro produto', 'Organize seu catálogo com nome, descrição e preço.', 'pay', ['payments'], [
      step('Cadastrar um produto', has('products'), '#payments/products'),
      step('Ativar um produto', active('products'), '#payments/products')
    ], ['Em Pagamentos → Produtos, clique em Novo produto.', 'Preencha nome, descrição e preço. Escolha pagamento único ou recorrente.', 'Ative e salve o produto para disponibilizá-lo no catálogo.']),
    task('store', ['commerce'], 'Abrir sua loja virtual', 'Monte uma vitrine com seus produtos e configure o checkout.', 'site', ['sites', 'payments'], [
      step('Criar uma loja com produtos', rows('stores').some(row => row.items?.length), '#sites/stores'),
      step('Ativar uma loja com produtos', rows('stores').some(row => row.active && row.items?.length), '#sites/stores')
    ], ['Cadastre produtos de pagamento único em Pagamentos → Produtos.', 'Em Sites → Lojas, crie a loja e adicione os produtos. Configure entrega e instruções de pagamento.', 'Ative a loja e teste o catálogo público. O pagamento segue o método e as instruções definidos na loja.']),
    task('course', ['commerce'], 'Publicar seu primeiro curso', 'Transforme seu conhecimento em conteúdo para seus alunos.', 'play', ['memberships'], [
      step('Criar um curso', has('courses'), '#memberships/courses'),
      step('Ativar um curso', active('courses'), '#memberships/courses')
    ], ['Em Assinaturas → Cursos, crie um curso com nome, descrição e aula.', 'Prepare o conteúdo e escolha a disponibilidade no Portal do Cliente.', 'Ative o curso e confira o acesso dos membros.']),
    task('payment-link', ['commerce'], 'Criar um link de pagamento', 'Disponibilize um produto em um link que pode ser compartilhado.', 'link', ['payments'], [
      step('Ativar um link de pagamento', rows('paymentLinks').some(row => row.active && rows('products').some(product => product.id === row.productId && product.active)), '#payments/links')
    ], ['Cadastre e ative o produto em Pagamentos → Produtos.', 'Em Pagamentos → Links de pagamento, crie um link e selecione o produto.', 'Ative o link. Confira as condições de cobrança antes de compartilhá-lo.']),
    task('invoice', ['commerce'], 'Organizar sua primeira fatura', 'Registre uma cobrança com cliente, valor e vencimento.', 'pay', ['payments'], [
      step('Criar uma fatura', has('invoices'), '#payments/invoices'),
      step('Abrir ou quitar uma fatura', rows('invoices').some(row => ['Open', 'Paid'].includes(row.status)), '#payments/invoices')
    ], ['Em Pagamentos → Faturas, clique em Nova fatura.', 'Informe o cliente, o título, o valor e o vencimento.', 'Salve como Aberta para acompanhar a cobrança. Atualize para Paga quando confirmar o recebimento.'])
  ];
  return tasks.filter(task => task.modules.every(module => canSetup(access, module))).map(task => {
    const completed = task.steps.filter(step => step.done).length;
    return { ...task, completed, percent: Math.round(completed / task.steps.length * 100),
      href: (task.steps.find(step => !step.done) || task.steps.at(-1)).href };
  });
}

export function setupProgress(tasks) {
  const total = tasks.reduce((sum, task) => sum + task.steps.length, 0);
  const completed = tasks.reduce((sum, task) => sum + task.completed, 0);
  return { total, completed, percent: total ? Math.round(completed / total * 100) : 0,
    done: tasks.filter(task => task.percent === 100).length };
}
