import test from 'node:test';
import assert from 'node:assert/strict';
import { blankAgency, hydrateAgency } from '../agency-model.mjs';

const cores = company => [company.primary, company.secondary, company.accent];
const LARANJA = ['#ff6b1a', '#c2410c', '#1fe5f0'];

test('Uma agência nova já nasce com a paleta laranja do graao', () => {
  assert.deepEqual(cores(hydrateAgency(blankAgency()).company), LARANJA);
});

for (const [nome, antigas] of [['verde', ['#5dd62c', '#337418', '#5dd62c']], ['rosa', ['#ff4f9a', '#c4a7ff', '#6bc9ff']]]) {
  test(`Uma agência que nunca trocou o padrão ${nome} passa para a paleta laranja`, () => {
    const agencia = blankAgency();
    Object.assign(agencia.company, { primary: antigas[0], secondary: antigas[1], accent: antigas[2] });
    assert.deepEqual(cores(hydrateAgency(agencia).company), LARANJA);
  });
}

test('Cores escolhidas pela agência ficam como estão, mesmo que uma delas seja de um padrão antigo', () => {
  const propria = blankAgency();
  Object.assign(propria.company, { primary: '#5dd62c', secondary: '#00c49a', accent: '#123456' });
  assert.deepEqual(cores(hydrateAgency(propria).company), ['#5dd62c', '#00c49a', '#123456']);
});
