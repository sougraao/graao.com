// Roteiro de prints do artigo agendas/pagina-de-agendamento. Cada captura parte da Agência Demo recém-semeada.
export default {
  grupo: 'agendas',
  artigo: 'pagina-de-agendamento',
  subconta: 'Clínica Sorriso Leve',
  rota: '#calendars/services',
  passos: [
    { nome: 'servicos', destacar: 'main >> text=Novo serviço' },
    { nome: 'novo-servico', acao: async page => {
      await page.locator('main').getByText('Novo serviço').first().click();
      const d = page.locator('#dialog');
      await d.getByLabel('Nome', { exact: true }).fill('Avaliação completa');
      await d.getByLabel('Duração (minutos)').fill('60');
      await d.getByLabel('Preço (R$)').fill('150');
    }, destacar: '#dialog' },
    { nome: 'configurar-pagina', acao: async page => {
      await page.locator('#dialog').getByRole('button', { name: 'Salvar' }).click();
      await page.locator('#dialog').waitFor({ state: 'hidden' }).catch(() => {});
      await page.locator('main').getByText('Página de agendamento', { exact: true }).click();
      const f = page.locator('form.sch-settings');
      await f.locator('input[name="enabled"]').check();
      await f.locator('input[name="title"]').fill('Agende sua avaliação');
      await f.locator('input[name="intro"]').fill('Escolha o serviço, o dia e o horário. Confirmamos pelo WhatsApp.');
    }, destacar: 'form.sch-settings' },
    { nome: 'link-da-pagina', acao: async page => {
      await page.locator('form.sch-settings').getByRole('button', { name: 'Salvar' }).click();
      await page.locator('.sch-link code').waitFor();
      // O app local mostra 127.0.0.1; no print vai o endereço que a agência vê na produção.
      await page.locator('.sch-link code').evaluate(no => { no.dataset.url = no.textContent; no.textContent = no.textContent.replace(/^https?:\/\/[^/]+/, 'https://graao.com'); });
    }, destacar: '.sch-link' },
    { nome: 'pagina-publica', acao: async page => {
      const url = await page.locator('.sch-link code').getAttribute('data-url');
      await page.goto(url.trim(), { waitUntil: 'networkidle' });
    } },
    { nome: 'escolher-horario', acao: page => page.getByText('Avaliação completa').first().click(), espera: 1200 },
  ],
};
