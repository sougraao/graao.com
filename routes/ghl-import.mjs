// Importar do GHL (/api/ghl-import/* e /api/agency/ghl-import*): a agência gera um código, a extensão do Chrome manda a
// extração em partes autenticadas por ele (sem sessão: vem de chrome-extension://) e a janela do graao avança a conversão
// em passos (ghl-import-run.mjs). O graao nunca recebe senha, token ou cookie do GHL.
import { lookup } from 'node:dns/promises';
import { requireCapability } from '../authorization.mjs';
import { acceptPart, finishUpload, jobByCode, jobView, codeHash, newImportCode, PART_MAX } from '../ghl-import-model.mjs';
import { runStep } from '../ghl-import-run.mjs';
import { saveAssets } from '../asset-store.mjs';
import { putRow, readRow, removeSetupSites, saveSetupSites } from '../setup-sites-store.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

const BODY_MAX = PART_MAX + 1024 * 1024;
export const GHL_IMPORT_PUBLIC = /^\/api\/ghl-import\/(part|done)$/;
const rowPrefix = jobId => `ghl-import-${jobId}`;

/** Cabeçalhos CORS para a extensão (só origens chrome-extension://). */
export function ghlImportCors(req) {
  const origin = String(req.headers.origin || '');
  return /^chrome-extension:\/\/[a-p]{32}$/.test(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, X-Graao-Import-Code', 'Access-Control-Max-Age': '600', Vary: 'Origin' }
    : {};
}

export function createGhlImportRoutes(deps) {
  const { store, error, access, loadAgency, changeAgency, logTo, ghlFetch, publicOrigin } = deps;
  const ghlResolve = deps.ghlResolve || (host => lookup(host, { all: true, verbatim: true }));

  async function body(req) {
    const chunks = [];
    let size = 0;
    for await (const part of req) { size += part.length; if (size > BODY_MAX) throw error('Cada pedaço da importação pode ter até 3 MB.', 413); chunks.push(part); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw error('Pedaço inválido da importação.', 400); }
  }

  // Códigos inválidos por conexão a cada 10 minutos. Cada pedido procura o código em todas as agências: passado o limite,
  // a conexão recebe 429 antes da busca. Código válido não conta, porque uma importação de verdade manda muitas partes.
  const failures = new Map(), FAILURES_MAX = 30;
  const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
  const blocked = ip => { const hit = failures.get(ip); return Boolean(hit && hit.reset > Date.now() && hit.count >= FAILURES_MAX); };
  const failed = ip => {
    const at = Date.now(), hit = failures.get(ip);
    if (!hit || hit.reset < at) { if (failures.size > 5000) failures.clear(); failures.set(ip, { count: 1, reset: at + 600000 }); } else hit.count += 1;
  };

  /** A agência dona do código (o código vem no cabeçalho, nunca na URL). */
  async function agencyOfCode(req) {
    const ip = clientIp(req);
    if (blocked(ip)) throw error('Muitas tentativas com código inválido a partir desta conexão. Aguarde alguns minutos.', 429);
    const code = String(req.headers['x-graao-import-code'] || '');
    const found = code ? await store.findAgency({ ghlImports: [{ codeHash: codeHash(code) }] }) : null;
    if (!found) { failed(ip); throw error('Código inválido ou expirado. Gere outro no graao.', 401); }
    return { code, agencyId: found.id };
  }

  /** O que um passo da conversão lê e grava. As linhas temporárias ficam listadas em job.rows para apagar no fim. */
  function stepIo(job, who) {
    const rows = new Set(job.rows || []);
    const remember = id => { rows.add(id); job.rows = [...rows]; };
    const tempId = key => `${rowPrefix(job.id)}-tmp-${key}`;
    return {
      origin: publicOrigin,
      fetch: ghlFetch,
      resolve: ghlResolve,
      async readPart(name) {
        let text = '';
        for (let index = 0; index < (job.parts[name] || 0); index++) {
          const row = await readRow(store, `${rowPrefix(job.id)}-${name}-${index}`);
          if (typeof row?.data !== 'string') throw error('Faltam partes da importação. Tente enviar de novo pela extensão.', 400);
          text += row.data;
        }
        return text;
      },
      // O valor vai dentro de { value }: a linha ganha profile.name (setup-sites-store.mjs) sem misturar com os dados.
      readTemp: async key => (await readRow(store, tempId(key)))?.value ?? null,
      async writeTemp(key, value) { remember(tempId(key)); await putRow(store, tempId(key), { value }); },
      async clearTemp() {
        for (const id of rows) await store.remove(id);
        job.rows = [];
      },
      saveImages: found => saveAssets(store, found),
      saveSites: (snapshotId, sites) => saveSetupSites(store, snapshotId, sites),
      async addSetup(snap) {
        try {
          return await changeAgency(who.agencyId, a => {
            if (a.snapshots.length >= 50) throw error('Você já tem 50 setups. Apague um antes de importar.', 400);
            a.snapshots.push(snap);
            logTo(a, who, 'Setup importado do GHL', snap.name, `${Object.values(snap.counts || {}).reduce((n, c) => n + c, 0)} itens`);
            return snap.id;
          });
        } catch (problem) {
          await removeSetupSites(store, snap.id);
          throw problem;
        }
      }
    };
  }

  async function agencyJob(who, jobId) {
    const job = (await loadAgency(who.agencyId)).ghlImports?.find(row => row.id === jobId);
    if (!job) throw error('Importação não encontrada.', 404);
    return job;
  }

  return async function ghlImportRoutes({ req, res, p, method, json }) {
    if (GHL_IMPORT_PUBLIC.test(p)) {
      for (const [name, value] of Object.entries(ghlImportCors(req))) res.setHeader(name, value);
      if (method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      if (method !== 'POST') throw error('Method not allowed.', 405);
      const { code, agencyId } = await agencyOfCode(req);
      const input = await body(req);
      if (p.endsWith('/done')) {
        const jobId = await changeAgency(agencyId, a => { const job = jobByCode(a, code); finishUpload(job); return job.id; });
        return json({ ok: true, jobId });
      }
      const name = String(input.name || ''), index = Number(input.index), total = Number(input.total);
      if (typeof input.data !== 'string') throw error('Pedaço inválido da importação.', 400);
      const bytes = Buffer.byteLength(input.data);
      const rowId = await changeAgency(agencyId, a => {
        const job = jobByCode(a, code);
        acceptPart(job, { name, index, total, bytes });
        const id = `${rowPrefix(job.id)}-${name}-${index}`;
        job.rows = [...new Set([...(job.rows || []), id])];
        return id;
      });
      await putRow(store, rowId, { data: input.data });
      return json({ ok: true });
    }
    if (p === '/api/agency/ghl-import-code' && method === 'POST') {
      const who = await access(req, res);
      requireCapability(who, 'agency', 'Seu usuário não pode abrir a visualização da agência.');
      if (!who.settings) throw error('Seu usuário não tem acesso às configurações da agência.', 403);
      const { code, job, released } = await changeAgency(who.agencyId, a => newImportCode(a));
      for (const id of released) { try { await store.remove(id); } catch { /* uma linha que não saiu não impede o código novo */ } }
      return json({ code, jobId: job.id, expiresAt: job.expiresAt });
    }
    const match = p.match(/^\/api\/agency\/ghl-import\/([\w-]{1,64})(\/step)?$/);
    if (match) {
      const who = await access(req, res);
      requireCapability(who, 'agency', 'Seu usuário não pode abrir a visualização da agência.');
      if (!who.settings) throw error('Seu usuário não tem acesso às configurações da agência.', 403);
      const job = await agencyJob(who, match[1]);
      if (!match[2]) return json(jobView(job));
      if (method !== 'POST') throw error('Method not allowed.', 405);
      if (!['received', 'pages', 'converting', 'images', 'saving'].includes(job.status)) return json(jobView(job));
      await runStep(job, stepIo(job, who));
      await changeAgency(who.agencyId, a => {
        const i = (a.ghlImports || []).findIndex(row => row.id === job.id);
        if (i >= 0) a.ghlImports[i] = job;
      });
      return json(jobView(job));
    }
    return NEXT_ROUTE;
  };
}
