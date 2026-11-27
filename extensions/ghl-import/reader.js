// graao: Importar do GHL — o leitor. Roda na aba do GHL (mundo MAIN), com o cliente HTTP do próprio app do GHL
// (__vue_app__.config.globalProperties.$http), que já vai com o login de quem está usando. Só faz GET: nada é criado,
// salvo ou apagado no GHL, e nenhuma senha, token ou cookie sai daqui. Lê o mesmo que a extração usada nos templates
// da graao, mais os gatilhos de cada workflow e as pesquisas. Um endereço que falha vira um item em `errors`.
(function () {
  const B = 'https://backend.leadconnectorhq.com';
  const S = 'https://services.leadconnectorhq.com';
  const id = item => item && (item._id || item.id);
  const STEPS = 12;

  async function readLocation(http, L, onProgress) {
    const report = typeof onProgress === 'function' ? onProgress : () => {};
    const errors = [];
    const failed = new Set();
    const miss = (label, problem) => {
      const status = (problem && problem.response && problem.response.status) || (problem && problem.status) || 'sem resposta';
      if (!failed.has(label)) { failed.add(label); errors.push(`${label} (erro ${status})`); }
      return null;
    };
    const g = async (url, label) => { try { return (await http.get(url)).data; } catch (problem) { return miss(label, problem); } };
    const raw = async (url, label) => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw { status: response.status };
        return await response.text();
      } catch (problem) { return miss(label, problem); }
    };
    let done = 0;
    const step = text => report({ step: text, done: Math.min(done++, STEPS), total: STEPS });

    const D = { locationId: L, extractedAt: new Date().toISOString() };
    step('Subconta');
    D.location = await g(`${B}/locations/${L}`, 'a subconta');
    const companyId = (D.location && (D.location.location || D.location).companyId) || '';

    step('Campos e valores personalizados');
    D.customFieldFolders = await g(`${B}/locations/${L}/customFields/search?parentId=&skip=0&limit=10000&documentType=folder&model=all&query=&includeStandards=true`, 'as pastas de campos');
    D.customFields = await g(`${B}/locations/${L}/customFields/search?parentId=&skip=0&limit=10000&documentType=field&model=all&query=&includeStandards=false`, 'os campos personalizados');
    D.customValueFolders = await g(`${S}/locations/${L}/customValues/search?skip=0&limit=1000&getCount=false&documentType=folder`, 'as pastas de valores');
    D.customValues = await g(`${B}/locations/${L}/customValues/`, 'os valores personalizados');

    step('Etiquetas, pipelines e calendários');
    D.tags = await g(`${B}/locations/${L}/tags`, 'as etiquetas');
    D.tagCategories = await g(`${B}/locations/${L}/tags/categories`, 'as categorias de etiquetas');
    D.pipelines = await g(`${B}/opportunities/pipelines?locationId=${L}`, 'os pipelines');
    D.lostReasons = await g(`${S}/opportunities/lost-reason?locationId=${L}&getCount=true&skip=0&limit=2000`, 'os motivos de perda');
    D.calendars = await g(`${B}/calendars/?locationId=${L}`, 'os calendários');
    D.calendarGroups = await g(`${B}/calendars/groups/?locationId=${L}`, 'os grupos de calendários');

    step('Links, respostas rápidas e chat');
    D.links = await g(`${B}/links/?locationId=${L}`, 'os links de rastreio');
    D.snippets = await g(`${S}/snippets/${L}?skip=0&limit=500`, 'as respostas rápidas');
    D.chatWidgets = await g(`${S}/chat-widget/list?locationId=${L}&offset=0&limit=100`, 'os chats do site');
    D.brandColors = await g(`${B}/brand-boards/custom-colors/${L}/all`, 'as cores da marca');
    D.objects = await g(`${B}/objects/?locationId=${L}&type=USER_DEFINED`, 'os objetos personalizados');
    D.membershipProducts = await g(`${B}/membership/locations/${L}/products`, 'os produtos de membros');

    step('Formulários');
    const formList = await g(`${S}/forms/?locationId=${L}&limit=100`, 'os formulários');
    D.forms = [];
    for (const form of (formList && formList.forms) || []) {
      const detail = await g(`${B}/forms/${id(form)}`, 'os formulários');
      D.forms.push((detail && detail.form) || form);
    }

    step('Pesquisas');
    const surveyList = await g(`${S}/surveys/?locationId=${L}&limit=100`, 'as pesquisas');
    D.surveys = [];
    for (const survey of (surveyList && surveyList.surveys) || []) {
      const detail = await g(`${B}/surveys/${id(survey)}`, 'as pesquisas');
      D.surveys.push((detail && detail.survey) || survey);
    }

    step('Modelos de e-mail');
    const emailList = await g(`${B}/emails/builder?locationId=${L}&limit=200&offset=0`, 'os modelos de e-mail');
    D.emailTemplates = [];
    for (const email of (emailList && emailList.builders) || []) {
      D.emailTemplates.push({ ...email, html: email.previewUrl ? await raw(email.previewUrl, 'o HTML dos e-mails') : null });
    }

    step('Workflows e gatilhos');
    D.workflowFolders = [];
    D.workflows = [];
    D.triggers = {};
    const walk = async (parentId, depth) => {
      const list = await g(`${B}/workflow/${L}/list?${parentId ? `parentId=${parentId}&` : ''}limit=500`, 'os workflows');
      for (const row of (list && list.rows) || []) {
        if (row.type === 'directory') {
          D.workflowFolders.push({ id: id(row), name: row.name, parentId });
          if (depth < 5) await walk(id(row), depth + 1);
          continue;
        }
        const detail = await g(`${B}/workflow/${L}/${id(row)}`, 'os workflows');
        D.workflows.push({ ...(detail || row), folderId: parentId });
        const triggers = await g(`${B}/workflow/${L}/trigger?workflowId=${id(row)}`, 'os gatilhos dos workflows');
        D.triggers[id(row)] = Array.isArray(triggers) ? triggers : (triggers && triggers.triggers) || [];
      }
    };
    await walk(null, 0);

    step('Funis e sites');
    D.funnels = [];
    for (const kind of ['funnel', 'website']) {
      const list = await g(`${B}/funnels/funnel/list?locationId=${L}&type=${kind}&category=all&offset=0&limit=100`, 'os funis e sites');
      for (const funnel of (list && list.funnels) || []) {
        const pages = (await g(`${B}/funnels/page/list?locationId=${L}&funnelId=${id(funnel)}&limit=100&offset=0`, 'as páginas dos funis')) || [];
        for (const page of pages) page.pageData = page.pageDataDownloadUrl ? await raw(page.pageDataDownloadUrl, 'o conteúdo das páginas') : null;
        D.funnels.push({ ...funnel, kind, pages });
      }
    }

    step('Funcionários de IA');
    const employees = await g(`${S}/ai-employees/employees/dashboard/search?locationId=${L}&limit=100`, 'os funcionários de IA');
    D.aiEmployees = [];
    for (const employee of (employees && employees.employees) || []) {
      D.aiEmployees.push((await g(`${S}/ai-employees/employees/${employee.id}?locationId=${L}`, 'os funcionários de IA')) || employee);
    }
    step('Agentes');
    D.agentStudio = await g(`${S}/agent-studio/agents?locationId=${L}&agencyId=${companyId}&productId=agent_studio&limit=100&offset=0`, 'os agentes');
    D.superAgents = await g(`${S}/agent-studio/agents?locationId=${L}&productId=superagent&agencyId=${companyId}&page=1&pageSize=100&sortBy=updatedAt&sortOrder=desc`, 'os agentes');
    D.voiceAgents = await g(`${S}/voice-ai/agents/agents-with-folders?page=1&pageSize=100&query=&locationId=${L}&groupBy=foldersFirst&sortBy=lastUpdated`, 'os agentes de voz');

    step('Bases de conhecimento');
    const bases = await g(`${S}/knowledge-base/all?locationId=${L}`, 'as bases de conhecimento');
    D.knowledgeBases = [];
    for (const base of (bases && bases.data && bases.data.knowledgeBases) || []) {
      const faqs = await g(`${S}/knowledge-base/faqs?locationId=${L}&knowledgeBaseId=${base.id}&limit=500`, 'as bases de conhecimento');
      const crawler = await g(`${S}/knowledge-base/crawler?locationId=${L}&knowledgeBaseId=${base.id}`, 'as bases de conhecimento');
      const sources = [];
      for (const source of ((crawler && crawler.urls) || []).slice(0, 30)) {
        sources.push({ ...source, text: /^https:\/\/storage\.googleapis\.com\//.test(source.content || '') ? await raw(source.content, 'o texto das bases de conhecimento') : null });
      }
      D.knowledgeBases.push({ ...base, faqs: faqs && faqs.faqs, sources });
    }

    D.errors = errors;
    report({ step: 'Pronto', done: STEPS, total: STEPS });
    return D;
  }

  /** Divide a leitura nas partes que a graao recebe (dump, triggers, surveys), em pedaços de até `size` caracteres. */
  function parts(dump, size) {
    const limit = Math.max(1, Number(size) || 1000000);
    const { triggers = {}, surveys = [], ...rest } = dump;
    const out = [];
    for (const [name, value] of [['dump', rest], ['triggers', triggers], ['surveys', surveys]]) {
      const text = JSON.stringify(value);
      // Nunca corta um emoji (par de surrogates) no meio: o banco recusa um pedaço com meio emoji.
      const pieces = [];
      for (let start = 0; start < text.length || !pieces.length;) {
        let end = Math.min(text.length, start + limit);
        const code = text.charCodeAt(end - 1);
        if (end < text.length && end - start > 1 && code >= 0xD800 && code <= 0xDBFF) end--;
        pieces.push(text.slice(start, end));
        start = end;
      }
      pieces.forEach((data, index) => out.push({ name, index, total: pieces.length, data }));
    }
    return out;
  }

  globalThis.graaoGhlReader = { readLocation, parts };
})();
