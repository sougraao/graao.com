// Compila o editor da Prancheta (prancheta-editor/src, React + TypeScript) num
// pacote único servido pela graao: ui/vendor/prancheta-editor.js e .css.
// O pacote gerado vai para o git, então o servidor não precisa de etapa de build.
// Uso (na raiz): npm run build:prancheta
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const result = await build({
  entryPoints: [resolve(here, 'src/main.tsx')],
  outfile: resolve(root, 'ui/vendor/prancheta-editor.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022', 'chrome115', 'firefox128', 'safari17'],
  jsx: 'automatic',
  minify: true,
  legalComments: 'none',
  // A fonte da plataforma já é servida pela graao em /fonts/.
  external: ['/fonts/*'],
  define: { 'process.env.NODE_ENV': '"production"' },
  metafile: true,
  logLevel: 'warning',
});

for (const [file, info] of Object.entries(result.metafile.outputs)) {
  console.log(`${file.replace(/^.*?ui\//, 'ui/')}  ${(info.bytes / 1024).toFixed(0)} KB`);
}
