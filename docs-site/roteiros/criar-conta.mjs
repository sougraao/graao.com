// Roteiro de prints do artigo comece-aqui/criar-conta. A Agência Demo é a agência do graao (isenta da
// confirmação), então a tela "Confirme seu celular" é montada por cima dela com o código de ui/verify.js
// e uma API simulada: número de exemplo, nunca o número real do graao.
const LINK = 'https://wa.me/5500000000000?text=Confirmar%20graao%20K7M2QD';
const montar = page => page.evaluate(async link => {
  const { mountGate } = await import('/verify.js');
  const api = async path => path === '/api/verify/start'
    ? { link, code: 'K7M2QD', expiresAt: new Date(Date.now() + 900000).toISOString(), number: '' }
    : { status: 'waiting', reason: '' };
  mountGate(document.body, { code: 'PHONE_REQUIRED', error: '', api, onDone: () => {}, open: () => {} });
}, LINK);
export default {
  grupo: 'comece-aqui',
  artigo: 'criar-conta',
  subconta: 'Clínica Sorriso Leve',
  rota: '#agency/dashboard',
  passos: [
    { nome: 'confirme-o-celular', acao: async page => {
      await montar(page);
      await page.locator('.vf-gate input[name="phone"]').fill('(11) 91234-5678');
    }, destacar: '.vf-gate form' },
    { nome: 'mande-a-mensagem', acao: async page => {
      await page.locator('.vf-gate button[type="submit"]').click();
      await page.locator('.vf-gate .vf-code').waitFor();
    }, destacar: '.vf-gate .vf-card' },
  ],
};
