// Convite para a equipe de uma agência (/api/invite/...). No graao.com, quem foi convidado e ainda não tem agência
// escolhe antes de entrar (accessContext responde INVITE_PENDING): aceitar tira a marca do convite; criar a própria
// agência abre uma agência nova, que passa a ser a dela nos próximos logins. O convite só some quando ela aceita.
import { hydrateAgency } from '../agency-model.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createInviteRoutes(deps) {
  const { store, accessContext, verifiedUser, changeAgency, error } = deps;
  return async function inviteRoutes({ req, res, p, method, json }) {
    if (p !== '/api/invite/accept' && p !== '/api/invite/decline') return NEXT_ROUTE;
    if (method !== 'POST') throw error('Method not allowed.', 405);
    const session = await verifiedUser(req, res);
    if (!session) throw error('Entre na sua conta para continuar.', 401);
    if (p === '/api/invite/decline') {
      await accessContext(req, session, { gate: false, own: true });
      return json({ ok: true });
    }
    const email = session.email.toLowerCase();
    const invite = await store.findAgency({ users: [{ email, loginEnabled: true }] });
    const member = invite && hydrateAgency(invite.state, invite.id).users.find(user => user.loginEnabled && user.email === email);
    if (!member) throw error('Este convite não está mais disponível. Peça um convite novo para quem administra a agência.', 404);
    if (member.invitePending) {
      await changeAgency(invite.id, agency => { const row = agency.users.find(user => user.id === member.id); if (row) delete row.invitePending; });
    }
    return json({ ok: true });
  };
}
