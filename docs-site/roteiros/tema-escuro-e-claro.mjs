// Roteiro de prints do artigo configuracoes/tema-escuro-e-claro. A graao abre no tema escuro; o botão do topo troca para o claro.
const botao = 'button[aria-label="Alternar entre tema claro e escuro"]';

export default {
  grupo: 'configuracoes',
  artigo: 'tema-escuro-e-claro',
  subconta: 'Clínica Sorriso Leve',
  rota: '#agency/dashboard',
  passos: [
    { nome: 'tema-escuro', espera: 1500, destacar: botao },
    { nome: 'tema-claro', acao: async page => {
      await page.locator(botao).first().click();
      await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') !== 'dark');
    }, espera: 1200, destacar: botao },
  ],
};
