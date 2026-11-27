// Espelha o front-end de ui/ em public/.
//
// Na Vercel, public/ é servido pela CDN antes do rewrite para a função; sem ele, cada .js e .css vira uma
// chamada à função, sem cache. O preset de Node da Vercel só publica o public/ que está no repositório
// (um public/ gerado no build é ignorado), por isso ele é versionado. Se faltar um arquivo aqui, a função
// ainda o serve de ui/ (includeFiles "ui/**" em server.mjs no vercel.json); antes dessa correção, o
// arquivo faltando respondia 500 e o app ficava em "Abrindo a graao…" (21/11/2026).
// ui/ é a fonte; este script só copia de ui/ para public/, nunca o contrário.
//
//   node scripts/sync-public.mjs             copia o que falta ou mudou em public/
//   node scripts/sync-public.mjs --out <dir> gera o espelho em outra pasta
//   node scripts/sync-public.mjs --check     lista o que está fora de sincronia e sai com 1 se houver algo
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ui = join(root, 'ui');
export const PUBLIC_DIR = join(root, 'public');

// .js, .css e .svg da raiz de ui/ sempre vão. Páginas HTML são servidas pelo servidor com cabeçalhos próprios
// (CSP); só estas também saem como estáticas. As pastas de recursos vão inteiras.
export const PUBLIC_HTML = ['app.html', 'client-portal.html', 'index.html', 'login.html', 'privacidade.html', 'social-approve.html', 'social-connect.html'];
const assetDirs = ['brand', 'fonts', 'locales', 'vendor'];

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Tudo o que public/ deve ter, com o destino em `out`. */
export function publicFiles(out = PUBLIC_DIR) {
  const files = readdirSync(ui).filter(name => statSync(join(ui, name)).isFile())
    .filter(name => /\.(js|css|svg)$/.test(name) || PUBLIC_HTML.includes(name))
    .map(name => join(ui, name));
  for (const dir of assetDirs) if (existsSync(join(ui, dir))) files.push(...walk(join(ui, dir)));
  return files.map(source => ({ source, target: join(out, relative(ui, source)), path: relative(ui, source).replaceAll('\\', '/') }));
}

/** O que falta ou está diferente em `out`. */
export function publicMirrorPlan(out = PUBLIC_DIR) {
  return publicFiles(out).filter(({ source, target }) => !existsSync(target) || !readFileSync(source).equals(readFileSync(target)));
}

/** Copia para `out` o que falta ou mudou; devolve o que foi copiado. */
export function syncPublic(out = PUBLIC_DIR) {
  const pending = publicMirrorPlan(out);
  for (const { source, target } of pending) {
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
  return pending;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--out');
  const out = at > 0 && process.argv[at + 1] ? resolve(process.argv[at + 1]) : PUBLIC_DIR;
  const label = relative(root, out) || out;
  if (process.argv.includes('--check')) {
    const pending = publicMirrorPlan(out);
    for (const { path, target } of pending) console.log(`${existsSync(target) ? 'diferente' : 'faltando'}: ${path}`);
    if (pending.length) { console.log(`\n${pending.length} arquivo(s) fora de sincronia. Rode: node scripts/sync-public.mjs`); process.exit(1); }
    console.log(`${label} está em dia com ui/.`);
  } else {
    const copied = syncPublic(out);
    console.log(copied.length ? `${copied.length} arquivo(s) copiado(s) de ui/ para ${label}.` : `${label} já estava em dia com ui/.`);
  }
}
