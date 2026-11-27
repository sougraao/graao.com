// Roteiro de prints do artigo reputacao/pedidos-de-avaliacao. Nada é enviado: o pedido só é preparado.
export default {
  grupo: 'reputacao',
  artigo: 'pedidos-de-avaliacao',
  subconta: 'Clínica Sorriso Leve',
  rota: '#reputation',
  passos: [
    { nome: 'visao-geral', destacar: 'main >> text=Pedir avaliações' },
    { nome: 'escolher-contatos', acao: async page => {
      await page.locator('main').getByText('Pedir avaliações', { exact: true }).first().click();
      const d = page.locator('dialog[open]');
      await d.locator('select[name="channel"]').selectOption('WhatsApp');
      for (const nome of ['Ana Beatriz Souza', 'Camila Ribeiro']) await d.locator('label').filter({ hasText: nome }).locator('input[name="contact"]').check();
    }, destacar: 'dialog[open]' },
    { nome: 'link-e-mensagens', acao: async page => {
      await page.keyboard.press('Escape');
      await page.locator('main').getByText('Link e mensagens', { exact: true }).click();
      // O app local mostra 127.0.0.1; no print vai o endereço que o cliente vê na produção.
      await page.locator('main input[value*="/avaliar/"]').first().evaluate(no => { no.value = no.value.replace(/^https?:\/\/[^/]+/, 'https://graao.com'); });
    }, espera: 1200, destacar: 'main input[value*="/avaliar/"]' },
  ],
};
