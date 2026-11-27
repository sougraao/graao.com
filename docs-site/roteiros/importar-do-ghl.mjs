// Roteiro de prints do artigo agencia/importar-do-ghl. A extensão do Chrome e o GHL são simulados: a leitura vem da
// extração de teste (test/fixtures/ghl-location.json) com nomes de exemplo, enviada pela própria página como a extensão
// faria, e o servidor da demo baixa as páginas de um GHL falso (ghlFetch). Nenhum dado real de cliente.
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync(new URL('../../test/fixtures/ghl-location.json', import.meta.url), 'utf8'));

/** A leitura de exemplo: a mesma extração, com nomes que fazem sentido no print. */
function leitura() {
  const dump = structuredClone(fixture.dump);
  dump.location.location.name = 'Clínica Bem Viver';
  dump.funnels[0].name = 'Site da clínica';
  const paginas = ['Início', 'Agende sua consulta'];
  dump.funnels[0].pages.forEach((page, i) => { page.name = paginas[i] || page.name; });
  const fluxos = ['Boas-vindas ao novo contato', 'Lembrete da consulta'];
  dump.workflows.forEach((w, i) => { w.name = fluxos[i] || w.name; });
  for (const form of dump.forms || []) {
    form.name = 'Fale com a clínica';
    // Um formulário que levava a uma página que o snapshot não tem: aparece no relatório, como numa importação real.
    if (form.formData?.form?.formAction) form.formData.form.formAction.redirectUrl = '/obrigado';
  }
  const surveys = structuredClone(fixture.surveys).map(s => ({ ...s, name: 'Pesquisa de satisfação' }));
  return { ...dump, triggers: structuredClone(fixture.triggers), surveys };
}

/** Divide como a extensão (extensions/ghl-import/reader.js → parts). */
function partes(dump) {
  const { triggers, surveys, ...rest } = dump;
  return [['dump', rest], ['triggers', triggers], ['surveys', surveys]].map(([name, value]) => ({ name, index: 0, total: 1, data: JSON.stringify(value) }));
}

// O GHL falso: a pré-visualização de cada página é uma página simples da clínica.
const ghlSimulado = async url => {
  const id = String(url).match(/\/preview\/([^/?#]+)/)?.[1];
  if (!id) return new Response('', { status: 404 });
  return new Response(`<!doctype html><html><head><title>Clínica Bem Viver</title></head><body><h1>Clínica Bem Viver</h1><p>Cuidado completo para a sua saúde.</p></body></html>`, { headers: { 'Content-Type': 'text/html' } });
};

const abrir = async page => {
  await page.locator('.head-actions [data-ag="ghl-import"]').click();
  await page.locator('dialog[open] .ag-ghl-code').waitFor();
};

export default {
  grupo: 'agencia',
  artigo: 'importar-do-ghl',
  subconta: 'Clínica Sorriso Leve',
  rota: '#agency/snapshots/imported',
  servidor: { ghlFetch: ghlSimulado },
  passos: [
    { nome: 'botao', acao: async page => { await page.locator('.head-actions [data-ag="ghl-import"]').waitFor(); }, destacar: '.head-actions [data-ag="ghl-import"]' },
    { nome: 'codigo', acao: abrir, destacar: 'dialog[open] .ag-ghl-code' },
    { nome: 'andamento', acao: async page => {
      // Andamento simulado: a consulta devolve "baixando páginas" e o passo seguinte fica esperando.
      await page.route('**/api/agency/ghl-import/*', route => route.fulfill({ json: { id: 'simulado', status: 'pages', pagesDone: 12, pagesTotal: 41, imagesDone: 0, imagesTotal: 0, notes: [], expiresAt: Date.now() + 1800000 } }));
      await page.route('**/api/agency/ghl-import/*/step', () => {});
      await page.locator('dialog[open] [data-ghl-state] .ag-progress').getByText('Baixando páginas 12/41').waitFor({ timeout: 10000 });
    }, espera: 600, destacar: 'dialog[open] [data-ghl-state]' },
    { nome: 'relatorio', acao: async page => {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.locator('dialog[open] [data-close-dialog]').first().click();
      await abrir(page);
      const code = await page.locator('dialog[open] .ag-ghl-value').textContent();
      await page.evaluate(async ({ code, parts }) => {
        const headers = { 'Content-Type': 'application/json', 'X-Graao-Import-Code': code };
        for (const part of parts) await fetch('/api/ghl-import/part', { method: 'POST', headers, body: JSON.stringify(part) });
        await fetch('/api/ghl-import/done', { method: 'POST', headers, body: '{}' });
      }, { code, parts: partes(leitura()) });
      await page.locator('dialog[open] .ag-ghl-report').waitFor({ timeout: 60000 });
    }, espera: 800, destacar: 'dialog[open] .ag-ghl-report' },
    { nome: 'importados', acao: async page => {
      await page.locator('dialog[open] [data-ag="ghl-view-setup"]').click();
      await page.getByText('Clínica Bem Viver (GHL)').first().waitFor();
    }, espera: 800 },
  ],
};
