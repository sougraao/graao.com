// Regra do graao: toda ferramenta nova ou melhoria visível chega com o artigo da central de ajuda
// (docs-site/, doc.graao.com) no mesmo PR. Roda no CI em todo pull request.
// Uso no CI: BASE=<branch base> PR_BODY=<corpo do PR> node scripts/docs-check.mjs
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const VIGIADOS = [/^ui\//, /^routes\//, /-model\.mjs$/];
const DOCS = 'docs-site/src/content/docs/';

const semAcento = texto => String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// "Documentação: não se aplica — motivo" (aceita hífen ou travessão, com ou sem acento). O motivo é obrigatório.
const naoSeAplica = corpo => /documentacao:\s*nao se aplica\s*[-—–:]\s*\S/.test(semAcento(corpo));

export function precisaDeDoc(arquivos, corpo) {
  const produto = arquivos.filter(arquivo => VIGIADOS.some(regra => regra.test(arquivo)));
  if (!produto.length) return { ok: true, motivo: 'O PR não muda telas, rotas nem modelos.' };
  if (arquivos.some(arquivo => arquivo.startsWith(DOCS))) return { ok: true, motivo: 'O PR traz a documentação junto.' };
  if (naoSeAplica(corpo)) return { ok: true, motivo: 'O PR declara que a documentação não se aplica.' };
  return {
    ok: false,
    motivo: [
      `Este PR muda o produto (${produto.slice(0, 5).join(', ')}${produto.length > 5 ? ', ...' : ''}) sem criar nem atualizar um artigo em ${DOCS}.`,
      'Escreva ou atualize o artigo (modelo em docs-site/src/content/docs/_modelo.mdx) e acrescente uma linha em comece-aqui/novidades.mdx.',
      'Se a mudança não aparece para quem usa o graao, escreva no corpo do PR: "Documentação: não se aplica — <motivo>".',
    ].join('\n'),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const base = process.env.BASE || 'main';
  const arquivos = execFileSync('git', ['diff', '--name-only', `origin/${base}...HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const { ok, motivo } = precisaDeDoc(arquivos, process.env.PR_BODY || '');
  console.log(motivo);
  process.exitCode = ok ? 0 : 1;
}
