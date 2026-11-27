// Gera as páginas Gatilhos e Ações da documentação a partir do catálogo do editor de workflows
// (ui/workflow-data.js), para que a doc mostre exatamente os nomes que aparecem na tela.
// Uso: node docs-site/scripts/catalogo-automacoes.mjs   (rodar de novo sempre que o catálogo mudar)
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// MDX lê { } como código e < como tag: variáveis {{...}} viram código em linha; o resto é escapado.
export const textoMdx = valor => String(valor ?? '')
  .replace(/\s+/g, ' ').trim()
  .split(/(\{\{[^}]*\}\})/)
  .map(parte => parte.startsWith('{{') ? `\`${parte}\`` : parte.replace(/[{}<>]/g, ch => `\\${ch}`).replace(/\|/g, '\\|'))
  .join('');

export function paginaCatalogo({ titulo, descricao, intro, coluna, grupos }) {
  const linhas = [
    '---', `title: ${JSON.stringify(titulo)}`, `description: ${JSON.stringify(descricao)}`, 'sidebar:', `  order: ${titulo === 'Gatilhos' ? 2 : 3}`, '---', '',
    '{/* Gerado por docs-site/scripts/catalogo-automacoes.mjs a partir de ui/workflow-data.js. Não edite à mão. */}', '',
    intro, '',
  ];
  for (const grupo of grupos) {
    if (!grupo.items.length) continue;
    linhas.push(`## ${textoMdx(grupo.group)}`, '', `| ${coluna} | Para que serve |`, '| --- | --- |');
    for (const item of grupo.items) linhas.push(`| **${textoMdx(item.label)}** | ${textoMdx(item.description || item.help || '')} |`);
    linhas.push('');
  }
  return linhas.join('\n');
}

async function gerar() {
  const { triggerCatalog, actionCatalog } = await import('../../ui/workflow-data.js');
  const docs = new URL('../src/content/docs/automacoes/', import.meta.url);
  await writeFile(new URL('gatilhos.mdx', docs), paginaCatalogo({
    titulo: 'Gatilhos', coluna: 'Gatilho',
    descricao: 'Todos os eventos que podem iniciar um workflow no graao, agrupados como no editor.',
    intro: 'O gatilho é o evento que inicia o workflow. A lista abaixo segue os grupos do editor de workflows. Os grupos que começam com "Apps" vêm dos conectores e só aparecem depois que o app é conectado.',
    grupos: triggerCatalog,
  }));
  await writeFile(new URL('acoes.mdx', docs), paginaCatalogo({
    titulo: 'Ações', coluna: 'Ação',
    descricao: 'Todas as ações que um workflow do graao pode executar, agrupadas como no editor.',
    intro: 'A ação é o que o workflow faz depois do gatilho: enviar uma mensagem, mudar um contato, chamar a IA, esperar. A lista abaixo segue os grupos do editor de workflows.',
    grupos: actionCatalog,
  }));
  console.log(`Catálogo gerado: ${triggerCatalog.reduce((n, g) => n + g.items.length, 0)} gatilhos e ${actionCatalog.reduce((n, g) => n + g.items.length, 0)} ações.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await gerar();
