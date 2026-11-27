import test from 'node:test';
import assert from 'node:assert/strict';
import { blankAgency, hydrateAgency } from '../agency-model.mjs';

test('Uma agência que nunca trocou as cores sai do rosa antigo para a paleta verde oficial', () => {
  const antiga = blankAgency();
  Object.assign(antiga.company, { primary: '#ff4f9a', secondary: '#c4a7ff', accent: '#6bc9ff' });
  const { company } = hydrateAgency(antiga);
  assert.deepEqual([company.primary, company.secondary, company.accent], ['#5dd62c', '#337418', '#5dd62c']);
});

test('Cores escolhidas pela agência ficam como estão, mesmo que uma delas seja o rosa antigo', () => {
  const propria = blankAgency();
  Object.assign(propria.company, { primary: '#ff4f9a', secondary: '#00c49a', accent: '#123456' });
  const { company } = hydrateAgency(propria);
  assert.deepEqual([company.primary, company.secondary, company.accent], ['#ff4f9a', '#00c49a', '#123456']);
});
