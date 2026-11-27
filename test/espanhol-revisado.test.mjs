// O catálogo em espanhol (ui/locales/es.js) não pode voltar a ter frases meio em português,
// como "Por onde começamos?" virando "¿Por dónde começamos?".
import test from 'node:test';
import assert from 'node:assert/strict';
import es from '../ui/locales/es.js';
import { setLanguage, translateText } from '../ui/i18n.js';

// Letras que o espanhol não usa.
const LETRAS_PT = /[çãõâêôà]/i;
// Palavras que só existem em português (fora de e-mails, endereços e variáveis).
const PALAVRAS_PT = /(^|[^\p{L}.@/{_-])(você|não|são|também|então|isso|essa|esse|pelo|pela|nenhum|nenhuma|agora|ainda|aqui|até|já|obrigad[oa]|rascunho|agendamentos?|fatura|faturas|arquivos?|salvo|salva|equipe|vazio|senha|trabalho|qualquer|sucesso|caminho|selecionad[oa]s?|criad[oa]s?|recebid[oa]s?|cadastr\p{L}*)(?=$|[^\p{L}])/iu;

const valores = Object.entries(es).filter(([pt, valor]) => valor !== pt);

test('nenhuma tradução em espanhol usa letras do português', () => {
  const ruins = valores.filter(([, v]) => LETRAS_PT.test(v)).map(([, v]) => v);
  assert.deepEqual(ruins, []);
});

test('nenhuma tradução em espanhol mantém palavras que só existem em português', () => {
  const ruins = valores.filter(([, v]) => PALAVRAS_PT.test(v)).map(([, v]) => v);
  assert.deepEqual(ruins, []);
});

test('a tela inicial do Pergunte ao Graao sai inteira em espanhol', () => {
  const esperado = {
    'Por onde começamos?': '¿Por dónde empezamos?',
    'Pergunte ao Graao sobre subcontas, receita, setups, equipe…': 'Pregunte al Graao sobre subcuentas, ingresos, setups, equipo…',
    'O Graao pode cometer erros. Confira informações importantes nos relatórios da agência.': 'El Graao puede cometer errores. Verifique la información importante en los informes de la agencia.',
    'Agência · ir para subconta': 'Agencia · ir a subcuenta',
    'Aplicativo desktop': 'Aplicación de escritorio',
  };
  for (const [pt, valor] of Object.entries(esperado)) assert.equal(es[pt], valor, pt);
});

test('o rodapé com ano e marca é traduzido inteiro', () => {
  setLanguage('es');
  try {
    assert.equal(
      translateText('© 2026 graao. Feito no Brasil com ☕, mordidas e muito MCP.'),
      '© 2026 graao. Hecho en Brasil con ☕, mordiscos y mucho MCP.',
    );
    assert.equal(
      translateText('© 2027 Agência Demo. Feito no Brasil com ☕, mordidas e muito MCP.'),
      '© 2027 Agência Demo. Hecho en Brasil con ☕, mordiscos y mucho MCP.',
    );
  } finally {
    setLanguage('pt');
  }
});
