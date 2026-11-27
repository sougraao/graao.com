// Confirmação do celular da agência pelo WhatsApp (/api/verify/...).
// A pessoa manda "Confirmar graao XXXXXX" para o número da graao; o webhook próprio desta linha confere o código,
// trava o número (uma conta por celular) e começa o teste. Nada do que chega por esta linha é guardado.
import { timingSafeEqual } from 'node:crypto';
import { startTrial } from '../agency-billing-model.mjs';
import { codeFromText, hashCode, newCode, normalizePhone, phoneKey, verifyLink } from '../phone-verify.mjs';
import { inboundTexts } from '../whatsapp.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

const CODE_MS = 15 * 60000;
const HOUR = 3600000;
const PER_AGENCY = 5;
const PER_IP = 20;

export const VERIFY_REPLIES = {
  done: 'Pronto, sua conta da graao está confirmada.',
  taken: 'Este número já tem uma conta na graao.',
  phone: 'Abra o WhatsApp no celular deste número e envie a mensagem de novo.',
  expired: 'Este código venceu. Gere outro na graao.'
};

const sameSecret = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Onde a confirmação está, para a tela que espera: none · waiting · verified · refused · expired. */
export function verifyStatus(billing, now) {
  if (billing?.phoneVerifiedAt) return { status: 'verified', reason: '' };
  const v = billing?.verify;
  if (!v) return { status: 'none', reason: '' };
  if (v.refused) return { status: 'refused', reason: v.refused };
  if (Date.parse(v.expiresAt) <= now.getTime()) return { status: 'expired', reason: '' };
  return { status: 'waiting', reason: v.problem || '' };
}

export function createVerifyRoutes(deps) {
  const { store, accessContext, verifiedUser, changeAgency, loadFresh, whatsapp, phoneVerify, payload, error, publicBase, now = () => new Date() } = deps;
  const ipHits = new Map();
  const configured = Boolean(phoneVerify?.number && phoneVerify?.instance && phoneVerify?.secret);
  const line = () => configured ? whatsapp.verifyLine(phoneVerify.instance) : null;
  const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);

  const allowIp = ip => {
    const at = Date.now();
    const hits = (ipHits.get(ip) || []).filter(t => t > at - HOUR);
    if (hits.length >= PER_IP) { ipHits.set(ip, hits); return false; }
    if (ipHits.size > 5000) ipHits.clear();
    ipHits.set(ip, [...hits, at]);
    return true;
  };

  async function reply(number, text) {
    try { await line()?.sendText(number, text); }
    catch (err) { console.error('Confirmação do celular: a resposta não saiu.', err?.message || ''); }
  }

  async function lockOwner(phone) {
    try { const lock = await store.load(phoneKey(phone)); return lock.released ? '' : lock.owner; }
    catch (err) { if (err.status !== 404) throw err; return ''; }
  }

  // A trava é a linha `phone-<hash>`: o insert é atômico, então só uma agência fica com o número.
  async function claim(phone, agencyId, at) {
    const key = phoneKey(phone);
    if (await store.insert(key, { profile: { name: 'Celular confirmado' }, owner: agencyId, at })) return true;
    let mine = false;
    await store.change(key, lock => {
      if (lock.owner === agencyId && !lock.released) mine = true;
      else if (lock.released) { Object.assign(lock, { owner: agencyId, at, released: false }); mine = true; }
    });
    return mine;
  }

  const mark = (agencyId, hash, fields) => changeAgency(agencyId, agency => {
    if (agency.billing.verify?.hash === hash) Object.assign(agency.billing.verify, fields);
  });

  async function confirm({ phone, lid, text }) {
    const code = codeFromText(text);
    if (!code) return;
    const match = await store.findAgency({ billing: { verify: { hash: hashCode(code) } } });
    if (!match) return;
    const agencyId = match.id, billing = match.state.billing, v = billing.verify;
    if (billing.phoneVerifiedAt || v.refused) return;
    const at = now();
    const to = phone || `${lid}@lid`;
    if (Date.parse(v.expiresAt) <= at.getTime()) return reply(to, VERIFY_REPLIES.expired);
    if (!phone) { await mark(agencyId, v.hash, { problem: 'lid' }); return reply(to, VERIFY_REPLIES.phone); }
    if (normalizePhone(phone) !== v.phone) { await mark(agencyId, v.hash, { refused: 'other-phone' }); return reply(to, VERIFY_REPLIES.phone); }
    if (!await claim(v.phone, agencyId, at.toISOString())) { await mark(agencyId, v.hash, { refused: 'phone-taken' }); return reply(to, VERIFY_REPLIES.taken); }
    await changeAgency(agencyId, agency => {
      const b = agency.billing;
      if (b.status === 'Unverified') startTrial(b, at);
      Object.assign(b, { phone: v.phone, phoneVerifiedAt: at.toISOString(), verify: { ...b.verify, problem: '' } });
    });
    return reply(to, VERIFY_REPLIES.done);
  }

  return async function verifyRoutes({ req, res, p, method, json }) {
    if (!p.startsWith('/api/verify/')) return NEXT_ROUTE;

    if (p.startsWith('/api/verify/whatsapp/') && method === 'POST') {
      if (!configured || !sameSecret(p.slice('/api/verify/whatsapp/'.length), phoneVerify.secret)) throw error('Page not found.', 404);
      const body = await payload(req);
      for (const item of inboundTexts(body)) {
        try { await confirm(item); }
        catch (err) { console.error('Confirmação do celular: mensagem não processada.', err?.message || ''); }
      }
      return json({ ok: true });
    }

    if (p === '/api/verify/start' && method === 'POST') {
      const { agency, who } = await accessContext(req, await verifiedUser(req, res), { gate: false });
      if (agency.billing.status !== 'Unverified') throw Object.assign(error('Esta agência já está confirmada.', 409), { code: 'ALREADY_VERIFIED' });
      if (!who.session || who.userId) throw error('Só o responsável pela agência confirma o celular.', 403);
      if (!configured || !line()) throw Object.assign(error('A confirmação pelo WhatsApp está temporariamente fechada. Tente de novo mais tarde.', 503), { code: 'VERIFY_OFF' });
      const input = await payload(req);
      const phone = normalizePhone(input.phone);
      if (!phone) throw error('Digite um celular com DDD (ou com o código do país, se for de fora do Brasil).', 400);
      if (!allowIp(clientIp(req))) throw error('Muitas tentativas a partir desta conexão. Aguarde alguns minutos.', 429);
      const owner = await lockOwner(phone);
      if (owner && owner !== who.agencyId) throw Object.assign(error('Este número já tem uma conta na graao.', 409), { code: 'PHONE_TAKEN' });
      const at = now();
      const { code, hash } = newCode();
      const expiresAt = new Date(at.getTime() + CODE_MS).toISOString();
      await changeAgency(who.agencyId, current => {
        const starts = (current.billing.verify?.starts || []).filter(t => Date.parse(t) > at.getTime() - HOUR);
        if (starts.length >= PER_AGENCY) throw error('Você já pediu 5 códigos nesta hora. Aguarde um pouco e tente de novo.', 429);
        current.billing.verify = { phone, hash, expiresAt, refused: '', problem: '', starts: [...starts, at.toISOString()] };
      });
      return json({ link: verifyLink(phoneVerify.number, code), code, expiresAt, number: phoneVerify.number });
    }

    // Linha de confirmação (só o dono da plataforma): ver, conectar pelo QR e liberar um número travado.
    if (p === '/api/verify/line' || p === '/api/verify/release') {
      const { who } = await accessContext(req, await verifiedUser(req, res), { gate: false });
      if (!who.platform) throw error('Só o dono da plataforma mexe na linha de confirmação.', 403);
      if (p === '/api/verify/release') {
        if (method !== 'POST') throw error('Method not allowed.', 405);
        const phone = normalizePhone((await payload(req)).phone);
        if (!phone) throw error('Digite o celular com DDD.', 400);
        if (!await lockOwner(phone)) return json({ released: false });
        await store.change(phoneKey(phone), lock => { lock.released = now().toISOString(); });
        return json({ released: true });
      }
      const missing = [['GRAAO_VERIFY_WHATSAPP', phoneVerify?.number], ['GRAAO_VERIFY_INSTANCE', phoneVerify?.instance], ['GRAAO_VERIFY_SECRET', phoneVerify?.secret]]
        .filter(([, value]) => !value).map(([name]) => name);
      if (missing.length) return json({ configured: false, missing });
      const evo = line();
      if (!evo) return json({ configured: true, server: false, number: phoneVerify.number, instance: phoneVerify.instance });
      const base = { configured: true, server: true, number: phoneVerify.number, instance: phoneVerify.instance };
      if (method === 'POST') {
        const { action } = await payload(req);
        if (action !== 'connect') throw error('Ação desconhecida.', 400);
        await evo.provision(`${publicBase(req)}/api/verify/whatsapp/${phoneVerify.secret}`);
        const started = await evo.connect();
        const live = await evo.status();
        return json({ ...base, ...live, qrcode: live.qrcode || started.qrcode || '', paircode: live.paircode || started.paircode || '' });
      }
      if (method !== 'GET') throw error('Method not allowed.', 405);
      return json({ ...base, ...await evo.status() });
    }

    if (p === '/api/verify/status' && method === 'GET') {
      const { who } = await accessContext(req, await verifiedUser(req, res), { gate: false });
      const agency = await loadFresh(who.agencyId);
      return json(verifyStatus(agency.billing, now()));
    }

    throw error('Page not found.', 404);
  };
}
