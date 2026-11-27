import test from 'node:test';
import assert from 'node:assert/strict';
import { gatilhos, acoes } from '../docs/implementation/t1-cobertura.mjs';
import { allTriggers, allActions } from '../ui/workflow-data.js';

// O mapa do T.1 lista os 116 gatilhos e as 180 ações do editor do GHL, e o que ele diz estar coberto existe de fato.
test('O mapa de cobertura do T.1 tem os 116 gatilhos e as 180 ações do GHL', () => {
  assert.equal(gatilhos.length, 116);
  assert.equal(acoes.length, 180);
  for (const row of [...gatilhos, ...acoes]) {
    assert.ok(['coberto', 'falta', 'conector', 'fora'].includes(row.status), row.ghl);
    if (row.status === 'fora') assert.ok(row.nota, `${row.ghl}: fora do escopo precisa de motivo`);
    if (row.status === 'falta') assert.ok(row.plano, `${row.ghl}: falta precisa do tipo previsto`);
  }
});

test('Todo gatilho e ação marcado como coberto existe no catálogo da Graao, e o que está no catálogo sai de "falta"', () => {
  const triggers = new Set(allTriggers.map(item => item.type)), actions = new Set(allActions.map(item => item.type));
  for (const row of gatilhos.filter(row => row.status === 'coberto')) for (const type of row.graao) assert.ok(triggers.has(type), `gatilho ${type} (${row.ghl})`);
  for (const row of acoes.filter(row => row.status === 'coberto')) for (const type of row.graao) assert.ok(actions.has(type), `ação ${type} (${row.ghl})`);
  // A planned type that already exists only counts as done when the row says so: extending an existing action keeps it here.
  const extending = new Set(['send_messenger', 'send_instagram_dm', 'send_live_chat', 'register_event', 'conversation_ai']);
  for (const row of gatilhos.filter(row => row.status === 'falta')) assert.ok(!triggers.has(row.plano), `gatilho ${row.plano} já existe: marque ${row.ghl} como coberto`);
  for (const row of acoes.filter(row => row.status === 'falta' && !extending.has(row.plano))) assert.ok(!actions.has(row.plano), `ação ${row.plano} já existe: marque ${row.ghl} como coberto`);
});
