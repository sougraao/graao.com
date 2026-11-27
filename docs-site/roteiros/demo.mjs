// Sobe o app graao LOCAL para os prints da documentação: sem login e com banco próprio (docs-site/.midia/demo.sqlite).
// Uso: npm --prefix docs-site run demo [-- --limpo]   → http://127.0.0.1:4319/app  (--limpo apaga o banco antes)
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeServer } from '../../server.mjs';

export const PORTA_DEMO = 4319;
const dbPath = fileURLToPath(new URL('../.midia/demo.sqlite', import.meta.url));
mkdirSync(fileURLToPath(new URL('../.midia/', import.meta.url)), { recursive: true });
if (process.argv.includes('--limpo')) for (const sufixo of ['', '-wal', '-shm']) rmSync(dbPath + sufixo, { force: true });
const { server, host } = makeServer({ allowLocalAccess: true, auth: null, dbPath, port: PORTA_DEMO, socialScheduler: false });
server.listen(PORTA_DEMO, host, () => console.log(`Agência Demo: http://${host}:${PORTA_DEMO}/app`));
