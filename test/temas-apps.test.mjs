import test from 'node:test';
import assert from 'node:assert/strict';
import { blankAgency, hydrateAgency } from '../agency-model.mjs';
import { desktopPresets } from '../agency-desktop.mjs';
import { contrast, themePresets } from '../ui/community-data.js';

test('Os temas prontos do app móvel e das comunidades começam no laranja do graao e leem bem', () => {
  assert.equal(themePresets[0].tokens.primary, '#ff6b1a');
  assert.ok(themePresets.some(row => row.id === 'carvao'));
  for (const { id, tokens } of themePresets) {
    assert.ok(contrast(tokens.onPrimary, tokens.primary) >= 4.5, `${id}: texto do botão`);
    assert.ok(contrast(tokens.font, tokens.background) >= 7, `${id}: texto sobre o fundo`);
  }
});

test('Os temas prontos do app desktop leem bem e não repetem rosa', () => {
  assert.equal(desktopPresets[0].id, 'graao');
  assert.equal(desktopPresets.filter(row => /ros/i.test(row.name)).length, 1);
  assert.equal(new Set(desktopPresets.map(row => row.id)).size, desktopPresets.length);
  for (const row of desktopPresets) {
    assert.ok(contrast(row.buttonText, row.button) >= 4.5, `${row.id}: texto do botão`);
    assert.ok(contrast(row.text, row.background) >= 7, `${row.id}: texto sobre o fundo`);
  }
});

test('Rascunhos no padrão rosa antigo passam para o laranja; app publicado fica como está', () => {
  const rosaDesktop = { preset: 'rosa', background: '#fff5fa', text: '#1e1821', button: '#b71889', buttonText: '#ffffff' };
  const rosaMovel = { preset: 'default', tokens: { primary: '#b71889', onPrimary: '#ffffff', background: '#f7f5f8' } };
  const rascunho = blankAgency();
  rascunho.desktopApp = { ...rascunho.desktopApp, status: 'draft', theme: { ...rosaDesktop } };
  rascunho.mobileApp = { ...rascunho.mobileApp, status: 'draft', primary: '#b71889', theme: structuredClone(rosaMovel) };
  const migrado = hydrateAgency(rascunho);
  assert.equal(migrado.desktopApp.theme.preset, 'graao');
  assert.equal(migrado.desktopApp.theme.button, '#ff6b1a');
  assert.equal(migrado.mobileApp.theme.tokens.primary, '#ff6b1a');
  assert.equal(migrado.mobileApp.primary, '#ff6b1a');

  const publicado = blankAgency();
  publicado.desktopApp = { ...publicado.desktopApp, status: 'published', theme: { ...rosaDesktop } };
  publicado.mobileApp = { ...publicado.mobileApp, status: 'published', primary: '#b71889', theme: structuredClone(rosaMovel) };
  const mantido = hydrateAgency(publicado);
  assert.equal(mantido.desktopApp.theme.button, '#b71889');
  assert.equal(mantido.mobileApp.theme.tokens.primary, '#b71889');
});

test('Rascunhos no padrão laranja de fundo quente passam para os cinzas neutros; app publicado fica como está', () => {
  const quenteDesktop = { preset: 'graao', background: '#100d0a', text: '#faf7f3', button: '#ff6b1a', buttonText: '#100d0a' };
  const quenteMovel = { preset: 'default', tokens: { primary: '#ff6b1a', onPrimary: '#1a1410', background: '#faf7f3', font: '#1a1410', border: '#ece3d9' } };
  const rascunho = blankAgency();
  rascunho.desktopApp = { ...rascunho.desktopApp, status: 'draft', theme: { ...quenteDesktop } };
  rascunho.mobileApp = { ...rascunho.mobileApp, status: 'draft', primary: '#ff6b1a', theme: structuredClone(quenteMovel) };
  const migrado = hydrateAgency(rascunho);
  assert.equal(migrado.desktopApp.theme.background, '#111111');
  assert.equal(migrado.mobileApp.theme.tokens.background, '#fafafa');
  assert.equal(migrado.mobileApp.theme.tokens.border, '#e5e5e5');

  const publicado = blankAgency();
  publicado.desktopApp = { ...publicado.desktopApp, status: 'published', theme: { ...quenteDesktop } };
  publicado.mobileApp = { ...publicado.mobileApp, status: 'published', primary: '#ff6b1a', theme: structuredClone(quenteMovel) };
  const mantido = hydrateAgency(publicado);
  assert.equal(mantido.desktopApp.theme.background, '#100d0a');
  assert.equal(mantido.mobileApp.theme.tokens.background, '#faf7f3');
});
