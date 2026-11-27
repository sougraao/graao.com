// Login com Google e as contas conectadas neste navegador (/api/auth/*): entrar, adicionar, listar, trocar, remover e sair.
// Extraído do server.mjs (plano de melhoria P2.1) junto com a troca rápida de conta. Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx). A proteção de origem dos POSTs é a do
// servidor, antes de qualquer rota.
import { AGENCY_ID } from '../agency-model.mjs';
import { NEXT_ROUTE } from './next-route.mjs';
import { isPlatformHost, requestHost, whiteLabelBrand } from '../white-label.mjs';

export function createAuthRoutes(deps) {
  const { auth, ready, error, payload, accessContext, store, platformOrigin = '' } = deps;
  // White Label: o domínio salvo por uma agência (app.suaagencia.com.br). O Supabase só devolve o login para a
  // graao.com, então ali o código do Google é repassado para o domínio da agência, que conclui a entrada.
  const platformHost = (() => { try { return new URL(platformOrigin).host; } catch { return ''; } })();
  const isAgencyHost = async host => Boolean(platformHost) && host !== platformHost && !isPlatformHost(host)
    && (await ready, (await whiteLabelBrand(store, host)).name !== undefined);
  // Para onde a conta abre e o nome da agência dela, com as regras de acesso da própria conta.
  async function place(req, profile, next) {
    await ready;
    // Cadastro fechado ou e-mail sem acesso à agência do domínio: a conta entra mesmo assim e o app mostra o aviso
    // (SIGNUP_CLOSED, NOT_INVITED) em vez de um erro solto.
    const context = await accessContext(req, profile, { gate: false }).catch(e => { if (['SIGNUP_CLOSED', 'NOT_INVITED'].includes(e.code)) return null; throw e; });
    if (!context) return { next: '/app', agency: '' };
    const { agency, who } = context;
    return {
      next: who.owner && who.agencyId !== AGENCY_ID && !/[?#]/.test(next) ? '/app#agency/dashboard' : next,
      agency: agency.company?.name || ''
    };
  }
  return async function authRoutes({ req, res, p, method, url, json, goTo }) {
    if (!p.startsWith('/api/auth/')) return NEXT_ROUTE;
    if (!auth) throw error('O login do Supabase ainda não foi configurado.',503);
    const operation = p.slice('/api/auth/'.length);
    const destination = (profile, next) => place(req, profile, next);
    if (method === 'GET' && operation === 'callback/google') {
      const relay = auth.relayTarget?.(req, res) || '';
      if (relay && requestHost(req) !== relay && await isAgencyHost(relay)) {
        const back = new URLSearchParams(url.searchParams); back.delete('__path');
        return goTo(`https://${relay}/api/auth/callback/google?${back}`);
      }
      return goTo(await auth.callback(req, res, url.searchParams, destination));
    }
    if (method === 'GET' && operation === 'relay') {
      const host = String(url.searchParams.get('host') || '').toLowerCase();
      if (!(await isAgencyHost(host))) throw error('Este domínio não é de nenhuma agência.',400);
      return goTo(auth.relayStart(req, res, host, url.searchParams.get('to') || ''));
    }
    if (method === 'GET' && operation === 'accounts') return json(await auth.accounts(req, res, async profile => (await place(req, profile, '/app')).agency));
    if (method !== 'POST') throw error('Page not found.',404);
    if (operation === 'google') {
      const input = await payload(req);
      const host = requestHost(req), options = { add: input.add === true, account: input.account };
      if (await isAgencyHost(host)) {
        const authorize = await auth.google(req, res, url.origin, input.next, { ...options, callbackOrigin: platformOrigin });
        return json({ url: `${platformOrigin}/api/auth/relay?${new URLSearchParams({ host, to: authorize })}` });
      }
      return json({ url: await auth.google(req, res, url.origin, input.next, options) });
    }
    if (operation === 'switch') {
      const input = await payload(req);
      return json({ ok: true, url: await auth.switchTo(req, res, input.id, destination) });
    }
    if (operation === 'remove') {
      const input = await payload(req);
      await auth.remove(req, res, input.id);
      return json({ ok: true });
    }
    if (operation === 'logout') {
      const input = await payload(req);
      const opened = await auth.logout(req, res, { all: input.all === true });
      return json(opened ? { ok: true, url: (await place(req, opened, '/app')).next, account: opened.id } : { ok: true, url: '/login' });
    }
    throw error('Page not found.',404);
  };
}
