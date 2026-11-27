// Como a marca aparece no topo do menu lateral: a agência escolhe isotipo e nome, só o nome ou só o isotipo
// para as subcontas dela; a marca do graao aparece só com o isotipo (o gato).
import test from 'node:test';
import assert from 'node:assert/strict';
import { agencyForWorkspace, blankAgency, executeAgency } from '../agency-model.mjs';
import { sidebar, sideBrand } from '../ui/sidebar.js';

const company = { name: 'Agência X', timezone: 'America/Sao_Paulo', primary: '#123456' };
const head = html => html.match(/<div class="side-head">([\s\S]*?)<\/div>/)[1];
const menu = (o = {}) => sidebar({ label: 'Menu', home: '#', brand: 'Agência X', mark: '<img class="ag-logo" src="/x.png" alt="">', account: { name: 'Conta', caption: '', attr: '', tip: '' }, toggle: '', open: true, groups: [], footer: [], ...o });

test('a agência guarda como a marca aparece no menu, com isotipo e nome por padrão', () => {
  const agency = blankAgency();
  executeAgency(agency, { type: 'company', data: company });
  assert.equal(agency.company.logoDisplay, 'mark-name');
  executeAgency(agency, { type: 'company', data: { ...company, logoDisplay: 'name' } });
  assert.equal(agency.company.logoDisplay, 'name');
  // Salvar sem o campo (outra tela, cliente antigo) mantém a escolha.
  executeAgency(agency, { type: 'company', data: company });
  assert.equal(agency.company.logoDisplay, 'name');
  executeAgency(agency, { type: 'company', data: { ...company, logoDisplay: 'mark' } });
  assert.equal(agencyForWorkspace(agency, 'w').logoDisplay, 'mark');
  assert.throws(() => executeAgency(agency, { type: 'company', data: { ...company, logoDisplay: 'tudo' } }), /marca/i);
});

test('o menu mostra isotipo e nome, só o nome ou só o isotipo', () => {
  const both = head(menu());
  assert.match(both, /ag-logo/);
  assert.match(both, /side-word">Agência X</);
  const name = head(menu({ show: 'name' }));
  assert.match(name, /side-word">Agência X</);
  // O isotipo só fica para o menu recolhido, onde o nome não cabe.
  assert.match(name, /<span class="side-rail-mark"><img class="ag-logo"/);
  const mark = head(menu({ show: 'mark' }));
  assert.match(mark, /ag-logo/);
  assert.doesNotMatch(mark, /side-word/);
  // Só o isotipo continua com o nome para leitores de tela.
  assert.match(mark, /aria-label="Agência X"/);
});

test('a marca do graao aparece só com o isotipo; a da agência segue a escolha dela', () => {
  assert.equal(sideBrand(null), 'mark');
  assert.equal(sideBrand({ logo: '/x.png', logoDisplay: 'name' }), 'name');
  assert.equal(sideBrand({ logo: '/x.png', logoDisplay: 'mark' }), 'mark');
  assert.equal(sideBrand({ logo: '/x.png' }), 'mark-name');
  // Sem logotipo não há isotipo da agência para mostrar sozinho: fica o nome.
  assert.equal(sideBrand({ logo: '', logoDisplay: 'mark' }), 'name');
});
