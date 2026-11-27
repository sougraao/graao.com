// Smoke test pós-deploy: confere que o app publicado serve o login e todos os arquivos estáticos
// de ui/ que o servidor conhece (a lista vem de staticFiles em server.mjs, nunca de uma cópia).
// Pega pacotes de função incompletos, como o deploy de 21/11/2026 que subiu sem 40 arquivos de
// ui/ e respondia 500 (ENOENT) até o deploy seguinte.
//
// Uso:   node scripts/smoke-deploy.mjs https://graao.com
// Deploy protegido da Vercel: defina VERCEL_AUTOMATION_BYPASS_SECRET.
import { pathToFileURL } from 'node:url';
import { sessionOnlyFiles, staticFiles } from '../server.mjs';

/** '/' (e '/index.html') servem a página inicial e '/login' o login, ambos públicos; '/' basta para a página inicial. */
export function smokePaths(files = staticFiles) {
  return ['/', '/login', ...[...files.keys()].filter(path => path !== '/index.html')];
}

/** Sem sessão, um estático comum responde 200 e um que exige sessão manda para o login (303 para /login). */
function answered(path, response, sessionOnly) {
  if (!sessionOnly.has(path)) return response.status === 200;
  return response.status === 303 && /^\/login(\?|$)/.test(response.headers.get('location') || '');
}

export async function smoke(base, { request = fetch, paths = smokePaths(), sessionOnly = sessionOnlyFiles, headers = {}, concurrency = 8, timeoutMs = 15000 } = {}) {
  const origin = new URL(base).origin;
  const queue = [...paths];
  const failures = [];
  async function worker() {
    while (queue.length) {
      const path = queue.shift();
      try {
        const response = await request(origin + path, { headers, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
        await response.arrayBuffer();
        if (!answered(path, response, sessionOnly)) failures.push({ path, status: response.status });
      } catch (error) {
        failures.push({ path, status: 0, error: error.message });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return { checked: paths.length, failures: failures.sort((a, b) => a.path.localeCompare(b.path)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2] || '';
  if (!/^https?:\/\/[^/]+/.test(base)) {
    console.error('Uso: node scripts/smoke-deploy.mjs https://endereco-do-deploy');
    process.exit(2);
  }
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  const { checked, failures } = await smoke(base, { headers: bypass ? { 'x-vercel-protection-bypass': bypass } : {} });
  if (failures.length) {
    console.error(`Smoke falhou em ${new URL(base).origin}: ${failures.length} de ${checked} endereços.`);
    for (const { path, status, error } of failures) console.error(`  ${status || 'ERRO'}  ${path}${error ? `  (${error})` : ''}`);
    process.exit(1);
  }
  console.log(`Smoke ok em ${new URL(base).origin}: ${checked} endereços responderam como esperado (200, ou 303 para o login nas páginas que exigem sessão).`);
}
