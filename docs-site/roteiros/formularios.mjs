// Roteiro de prints do artigo sites/formularios. Cada captura parte da Agência Demo recém-semeada.
export default {
  grupo: 'sites',
  artigo: 'formularios',
  subconta: 'Clínica Sorriso Leve',
  rota: '#sites/forms',
  passos: [
    { nome: 'formularios', destacar: 'main >> text=Novo formulário' },
    { nome: 'escolher-modelo', acao: async page => {
      await page.locator('main').getByText('Novo formulário', { exact: true }).last().click();
      const d = page.locator('dialog[open]');
      await d.locator('input:not([type=radio])').first().fill('Pedido de orçamento - site');
      await d.locator('input[type=radio][value="orcamento"]').check({ force: true });
    }, destacar: 'dialog[open] label:has(input[value="orcamento"])' },
    { nome: 'editor', acao: async page => {
      await page.locator('dialog[open]').getByRole('button', { name: 'Criar formulário' }).click();
      await page.waitForURL(/#sites\/form\//);
    }, espera: 1500, destacar: 'main >> text="Adicionar"' },
    { nome: 'publicar', destacar: 'main >> text="Publicar"' },
    { nome: 'integrar', acao: async page => {
      await page.locator('main').getByText('Publicar', { exact: true }).click();
      await page.waitForTimeout(1000);
      await page.locator('main').getByText('Integrar', { exact: true }).click();
      await page.waitForTimeout(800);
      // O app local mostra 127.0.0.1; no print vai o endereço que o cliente vê na produção.
      await page.locator('main input, main textarea').evaluateAll(campos => { for (const c of campos) c.value = c.value.replaceAll(/https?:\/\/127\.0\.0\.1:\d+/g, 'https://graao.com'); });
    }, espera: 600 },
  ],
};
