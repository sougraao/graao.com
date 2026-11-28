import { createHash, randomBytes } from 'node:crypto';

const failure = (message, status) => Object.assign(new Error(message), { status });
const ACCESS = 'go_access';
const REFRESH = 'go_refresh';
const GOOGLE_FLOW = 'go_google_flow';
// White Label: o domínio da agência para onde o graao.com devolve o código do Google (o Supabase só volta para ela).
const RELAY = 'go_google_relay';
const RELAY_HOST = /^(?=.{4,200}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ACCOUNT = 'go_account_';
const ACTIVE = 'go_active';
const DAY = 86400;
const SESSION_AGE = 30 * DAY;   // parada por mais tempo, a conta pede o Google de novo
const ENTRY_AGE = 90 * DAY;     // ...mas segue na lista, com o e-mail para sugerir
const USER_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
export const MAX_ACCOUNTS = 5;

export function afterLogin(next) {
  if (typeof next !== 'string' || next.length > 2048 || /[\r\n]/.test(next)) return '/app';
  return ['/app','/app/','/painel','/painel/','/mcp/autorizar'].includes(next.split(/[?#]/,1)[0]) ? next : '/app';
}

export function accountProfile(user) {
  const { full_name, avatar_url } = user.user_metadata || {};
  const name = typeof full_name === 'string' && full_name.trim() ? full_name.trim().slice(0,100) : user.email;
  const picture = typeof avatar_url === 'string' && /^https:\/\//i.test(avatar_url) ? avatar_url.slice(0,1024) : '';
  return { id: user.id, email: user.email, name, picture };
}

function cookieName(req, name) {
  return process.env.VERCEL || req.socket?.encrypted ? '__Host-' + name : name;
}

// Os cookies da requisição, já com o que ela mesma gravou: quem renova e depois troca de conta lê o token novo.
const jars = new WeakMap();
function cookieJar(req) {
  if (!jars.has(req)) {
    const pairs = String(req.headers.cookie || '').split(';').map(part => {
      const at = part.indexOf('=');
      return at < 0 ? ['', ''] : [part.slice(0, at).trim(), part.slice(at + 1).trim()];
    });
    jars.set(req, new Map(pairs.reverse()));   // com nomes repetidos vale o primeiro do cabeçalho
  }
  return jars.get(req);
}
const readCookie = (req, name) => cookieJar(req).get(cookieName(req, name)) || '';

function writeCookie(req, res, name, value, age) {
  const key = cookieName(req, name);
  const secure = key.startsWith('__Host-') ? '; Secure' : '';
  cookieJar(req).set(key, value);
  const others = [res.getHeader('Set-Cookie') || []].flat().filter(line => !line.startsWith(key + '='));
  res.setHeader('Set-Cookie', [...others, `${key}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure}`]);
}

function dropCookie(req, res, name) {
  if (readCookie(req, name)) writeCookie(req, res, name, '', 0);
}

// Contas conectadas neste navegador. Cada conta tem um cookie próprio (token de renovação e o que o menu mostra);
// go_active diz qual está aberta e go_access_<id> guarda o token de acesso só dela. Como uma renovação grava apenas
// nos cookies da própria conta, uma resposta atrasada nunca devolve o navegador para a conta anterior.
const clip = (value, size) => typeof value === 'string' ? value.slice(0, size) : '';

function readEntry(req, id) {
  if (typeof id !== 'string' || !USER_ID.test(id)) return null;
  try {
    const { r, e, n, p, a, t, u } = JSON.parse(Buffer.from(readCookie(req, ACCOUNT + id), 'base64url').toString('utf8'));
    const email = clip(e, 254), picture = clip(p, 1024);
    if (!email) return null;
    return { id, email, name: clip(n, 100) || email, picture: /^https:\/\//i.test(picture) ? picture : '', agency: clip(a, 80),
      refresh: clip(r, 2048), renewed: Number(t) || 0, used: Number(u) || 0 };
  } catch {
    return null;
  }
}

function writeEntry(req, res, { id, email, name, picture, agency, refresh, renewed, used }) {
  const value = { r: refresh, e: email, n: name, p: picture.length > 512 ? '' : picture, a: clip(agency, 80), t: renewed, u: used };
  writeCookie(req, res, ACCOUNT + id, Buffer.from(JSON.stringify(value)).toString('base64url'), ENTRY_AGE);
}

function listEntries(req) {
  const prefix = cookieName(req, ACCOUNT);
  return [...cookieJar(req).keys()].filter(key => key.startsWith(prefix)).map(key => readEntry(req, key.slice(prefix.length))).filter(Boolean);
}

/** Conta aberta neste navegador segundo os cookies, sem conferir a sessão; '' quando não há. */
export function activeAccountId(req) {
  const id = readCookie(req, ACTIVE);
  return USER_ID.test(id) ? id : '';
}

function buildFlow(next) {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, next: afterLogin(next), challenge: createHash('sha256').update(verifier).digest('base64url') };
}

function googleUser(user, verifiedToken) {
  if (!user?.email || !user.email_confirmed_at || user.is_anonymous ||
      !USER_ID.test(user.id || '') ||
      !user.identities?.some(identity => identity.provider === 'google')) return null;
  // Only read AMR after Supabase validates or issues this access token.
  try {
    const claims = JSON.parse(Buffer.from(verifiedToken.split('.')[1], 'base64url').toString('utf8'));
    return claims.amr?.some(entry => entry.method === 'oauth') ? user : null;
  } catch {
    return null;
  }
}

const googleSession = session => session?.access_token && session.refresh_token && googleUser(session.user, session.access_token) ? session : null;
const ended = error => [400,401,403].includes(error.status);

export function createSupabaseAuth({ projectUrl, publishableKey, request = fetch, now = Date.now, checkEvery = 60_000 }) {
  const base = new URL(projectUrl);
  if (base.origin !== base.href.slice(0,-1) || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base.origin) || !publishableKey) {
    throw new Error('Set SUPABASE_URL to the HTTPS project origin and SUPABASE_PUBLISHABLE_KEY to its public key.');
  }

  function endpoint(path, query) {
    const target = new URL(`/auth/v1/${path}`, base);
    target.search = new URLSearchParams(query);
    return target;
  }

  async function call(path, { query, body, token } = {}) {
    let response;
    try {
      response = await request(endpoint(path, query), {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          apikey: publishableKey,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error',
        signal: AbortSignal.timeout(10000)
      });
    } catch {
      throw failure('Não foi possível conectar ao Supabase. Tente de novo.',503);
    }
    if (response.status === 204) return null;
    const data = await response.json().catch(() => null);
    if (response.ok && data) return data;
    const message = response.status === 429 ? 'Muitas tentativas. Aguarde e tente de novo.' : response.status >= 500
      ? 'O Supabase não conseguiu concluir a solicitação. Tente de novo.'
      : 'Não foi possível autenticar. Tente de novo.';
    throw failure(message, response.ok ? 502 : response.status);
  }

  const grant = (type, body) => call('token', { query: { grant_type: type }, body });
  const signOutToken = token => call('logout', { query: { scope: 'local' }, body: {}, token });
  const expired = entry => now() - entry.renewed > SESSION_AGE * 1000;
  const usable = entry => Boolean(entry?.refresh) && !expired(entry);
  const accessName = id => `${ACCESS}_${id}`;

  function saveAccess(req, res, session) {
    writeCookie(req, res, accessName(session.user.id), session.access_token, Math.max(1, Math.floor(Number(session.expires_in) || 3600)));
  }
  function saveAccount(req, res, session, agency) {
    const profile = accountProfile(session.user), before = readEntry(req, profile.id);
    writeEntry(req, res, { ...profile, agency: agency ?? before?.agency ?? '', refresh: session.refresh_token, renewed: now(), used: before?.used || 0 });
  }
  function activate(req, res, session) {
    const id = session.user.id, before = activeAccountId(req);
    if (before && before !== id) dropCookie(req, res, accessName(before));
    saveAccess(req, res, session);
    writeCookie(req, res, ACTIVE, id, ENTRY_AGE);
    writeEntry(req, res, { ...readEntry(req, id), used: now() });
  }
  // A sessão da conta acabou: some o token e fica só o que o menu precisa para pedir o Google de novo.
  function disconnect(req, res, id) {
    const entry = readEntry(req, id);
    dropCookie(req, res, accessName(id));
    if (entry?.refresh) writeEntry(req, res, { ...entry, refresh: '' });
  }
  function forget(req, res, id) {
    dropCookie(req, res, accessName(id));
    dropCookie(req, res, ACCOUNT + id);
    if (activeAccountId(req) === id) dropCookie(req, res, ACTIVE);
  }
  function clearLegacy(req, res) {
    dropCookie(req, res, ACCESS);
    dropCookie(req, res, REFRESH);
  }

  // Renova a sessão de uma conta da lista. null quando ela acabou; falha de rede ou do provedor sobe sem apagar nada.
  async function renew(req, res, id) {
    const entry = readEntry(req, id);
    if (!usable(entry)) { disconnect(req, res, id); return null; }
    try {
      const session = googleSession(await grant('refresh_token', { refresh_token: entry.refresh }));
      // O cookie é do navegador: o dono do token tem de ser a conta da entrada.
      if (session?.user.id === id) { saveAccount(req, res, session); return session; }
    } catch (error) {
      if (!ended(error)) throw error;
    }
    disconnect(req, res, id);
    return null;
  }

  async function signedIn(req, res, id) {
    const token = readCookie(req, accessName(id));
    if (token) {
      try {
        const found = googleUser(await call('user',{ token }), token);
        return found?.id === id ? found : null;
      } catch (error) { if (![401,403].includes(error.status)) throw error; }
    }
    const session = await renew(req, res, id);
    if (session) saveAccess(req, res, session);
    return session?.user || null;
  }

  // Sessões de antes da troca rápida (um par de cookies por navegador): na primeira visita viram uma conta da lista.
  const hasLegacy = req => !activeAccountId(req) && Boolean(readCookie(req, ACCESS) || readCookie(req, REFRESH));
  async function adoptLegacy(req, res) {
    const token = readCookie(req, ACCESS), refreshToken = readCookie(req, REFRESH);
    let session = null;
    if (token) {
      try {
        const found = googleUser(await call('user',{ token }), token);
        if (!found) return null;
        const { exp } = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        session = { user: found, access_token: token, refresh_token: refreshToken, expires_in: exp ? exp - Math.floor(now() / 1000) : 3600 };
      } catch (error) { if (![401,403].includes(error.status)) throw error; }
    }
    if (!session && refreshToken) {
      try { session = googleSession(await grant('refresh_token', { refresh_token: refreshToken })); }
      catch (error) { if (!ended(error)) throw error; }
    }
    clearLegacy(req, res);
    if (!session) return null;
    saveAccount(req, res, session);
    activate(req, res, session);
    return session.user;
  }

  async function user(req, res) {
    if (hasLegacy(req)) return adoptLegacy(req, res);
    const id = activeAccountId(req);
    return id ? signedIn(req, res, id) : null;
  }
  function hasSession(req) {
    const id = activeAccountId(req);
    return id ? Boolean(readCookie(req, accessName(id))) || usable(readEntry(req, id)) : hasLegacy(req);
  }

  async function revoke(req, res, id) {
    const token = activeAccountId(req) === id && readCookie(req, accessName(id)) || (await renew(req, res, id))?.access_token;
    if (token) await signOutToken(token);
  }
  // Lugar para uma conta: quem já está na lista não conta de novo, e as encerradas há mais tempo cedem a vez.
  function makeRoom(req, res, id) {
    const others = listEntries(req).filter(entry => entry.id !== id);
    const idle = others.filter(entry => !usable(entry)).sort((a, b) => a.used - b.used);
    const extra = others.length - (MAX_ACCOUNTS - 1);
    for (const entry of idle.slice(0, Math.max(0, extra))) forget(req, res, entry.id);
    return extra <= idle.length;
  }
  function requireEntry(req, id) {
    if (!readEntry(req, id)) throw failure('Esta conta não está conectada neste navegador.',404);
  }
  const byRecent = (a, b) => b.used - a.used;

  return {
    hasSession,
    user,
    /**
     * `callbackOrigin` é para onde o Supabase devolve o código. No domínio de uma agência é o graao.com, a única
     * origem na lista do Supabase; ela repassa o código (relayStart/relayTarget) e a troca acontece aqui, onde está o
     * verificador PKCE. O código sozinho não abre conta nenhuma.
     */
    async google(req,res,origin,next,{ add = false, account = '', callbackOrigin = origin } = {}) {
      // Entrar na própria graao.com desfaz um repasse que ficou pela metade.
      if (callbackOrigin === origin) dropCookie(req, res, RELAY);
      const entry = readEntry(req, account);
      if (add && !entry && listEntries(req).filter(usable).length >= MAX_ACCOUNTS) {
        throw failure(`Este navegador já tem ${MAX_ACCOUNTS} contas conectadas. Remova uma para adicionar outra.`,409);
      }
      const settings = await call('settings');
      if (!settings.external?.google) throw failure('O login com Google ainda não está habilitado no Supabase.',503);
      const { verifier, challenge, next: destination } = buildFlow(next);
      const flow = Buffer.from(JSON.stringify({ verifier, next: destination })).toString('base64url');
      writeCookie(req,res,GOOGLE_FLOW,flow,600);
      return endpoint('authorize', {
        provider: 'google',
        redirect_to: `${callbackOrigin}/api/auth/callback/google`,
        code_challenge: challenge,
        code_challenge_method: 's256',
        // Entrar de novo numa conta da lista sugere o e-mail dela; nos outros casos a pessoa escolhe a conta.
        ...(entry ? { login_hint: entry.email } : { prompt: 'select_account' })
      }).href;
    },
    /** No graao.com: guarda para qual domínio de agência o código vai e segue para o Google. Só aceita o Supabase. */
    relayStart(req,res,host,to,callbackOrigin) {
      let target;
      try { target = new URL(to); } catch { target = null; }
      const challenge = target?.searchParams.get('code_challenge') || '';
      const hint = target?.searchParams.get('login_hint') || '';
      if (!RELAY_HOST.test(String(host || '')) || !target || target.origin !== base.origin || target.pathname !== '/auth/v1/authorize'
          || !/^[a-zA-Z0-9_-]{43}$/.test(challenge) || hint.length > 254 || /[\r\n]/.test(hint) || !/^https:\/\/[^/]+$/.test(String(callbackOrigin || ''))) {
        throw failure('Este endereço de entrada não é válido.',400);
      }
      writeCookie(req,res,RELAY,host,600);
      // O endereço do Supabase é montado aqui, igual ao de google(): de quem fez o link só vem o desafio PKCE (e o e-mail
      // sugerido). Assim a volta é sempre para o graao.com e nenhum outro parâmetro vem de fora.
      return endpoint('authorize', {
        provider: 'google',
        redirect_to: `${callbackOrigin}/api/auth/callback/google`,
        code_challenge: challenge,
        code_challenge_method: 's256',
        ...(hint ? { login_hint: hint } : { prompt: 'select_account' })
      }).href;
    },
    /** Na volta do Google ao graao.com: o domínio da agência que espera o código, uma vez só; '' sem repasse. */
    relayTarget(req,res) {
      const host = readCookie(req,RELAY);
      if (host) writeCookie(req,res,RELAY,'',0);
      return RELAY_HOST.test(host) ? host : '';
    },
    /** `destination(perfil, next)` devolve { next, agency }: para onde ir e o nome da agência que o menu mostra. */
    async callback(req,res,params,destination = (_profile,next) => ({ next })) {
      const stored = readCookie(req,GOOGLE_FLOW);
      writeCookie(req,res,GOOGLE_FLOW,'',0);
      const code = params.get('code');
      // Quem desistiu no Google com uma conta já aberta volta para ela.
      const stop = reason => hasSession(req) ? `/app?conta=${reason}` : `/login?error=${reason === 'limite' ? 'limite' : 'google'}`;
      if (!stored || !code || code.length > 512 || params.has('error')) return stop('erro');
      try {
        const flow = JSON.parse(Buffer.from(stored,'base64url').toString('utf8'));
        if (!/^[a-zA-Z0-9_-]{43}$/.test(flow.verifier)) return stop('erro');
        const session = googleSession(await grant('pkce',{ auth_code: code, code_verifier: flow.verifier }));
        if (!session) return stop('erro');
        if (hasLegacy(req)) await adoptLegacy(req,res).catch(() => null);
        if (!makeRoom(req,res,session.user.id)) {
          await signOutToken(session.access_token).catch(() => null);
          return stop('limite');
        }
        const { next, agency } = await destination(accountProfile(session.user), afterLogin(flow.next));
        saveAccount(req,res,session,agency);
        activate(req,res,session);
        return afterLogin(next);
      } catch {
        return stop('erro');
      }
    },
    /** A conta aberta e as outras deste navegador, sem nenhum token. `label(perfil)` dá o nome da agência da conta aberta. */
    async accounts(req,res,label = async () => '') {
      const current = await user(req,res);
      const profile = current && { ...accountProfile(current), agency: await label(accountProfile(current)) };
      const mine = profile && readEntry(req, profile.id);
      if (mine && mine.agency !== profile.agency) writeEntry(req, res, { ...mine, agency: profile.agency });
      const others = listEntries(req).filter(entry => entry.id !== profile?.id);
      // Uma conta revogada em outro lugar cai aqui; a conferência tem um intervalo para não girar o token a cada abertura.
      await Promise.all(others.filter(entry => entry.refresh && (expired(entry) || now() - entry.renewed >= checkEvery))
        .map(entry => renew(req,res,entry.id).catch(() => null)));
      return {
        current: profile,
        others: others.map(entry => readEntry(req, entry.id)).sort(byRecent)
          .map(entry => ({ id: entry.id, email: entry.email, name: entry.name, picture: entry.picture, agency: entry.agency, connected: usable(entry) })),
        max: MAX_ACCOUNTS
      };
    },
    /** Abre outra conta da lista. Só vale sessão deste navegador; se ela acabou, a conta aberta fica como está. */
    async switchTo(req,res,id,destination) {
      if (hasLegacy(req)) await adoptLegacy(req,res);
      requireEntry(req, id);
      const session = await renew(req,res,id);
      if (!session) throw Object.assign(failure('A sessão desta conta terminou. Entre de novo com o Google.',401), { code: 'ACCOUNT_SIGNED_OUT' });
      const { next, agency } = await destination(accountProfile(session.user), '/app');
      saveAccount(req,res,session,agency);
      activate(req,res,session);
      return afterLogin(next);
    },
    async remove(req,res,id) {
      if (hasLegacy(req)) await adoptLegacy(req,res);
      requireEntry(req, id);
      if (activeAccountId(req) === id && hasSession(req)) throw failure('Para sair da conta aberta, use Sair.',400);
      try { await revoke(req,res,id); }
      finally { forget(req,res,id); }
    },
    /** Sai da conta aberta e abre a usada por último que ainda vale; `all` sai de todas. Devolve o perfil aberto, ou null. */
    async logout(req,res,{ all = false } = {}) {
      if (hasLegacy(req)) await adoptLegacy(req,res).catch(() => null);
      const id = activeAccountId(req);
      const leaving = all ? listEntries(req).map(entry => entry.id) : [];
      if (id && !leaving.includes(id)) leaving.push(id);
      const results = await Promise.allSettled(leaving.map(account => revoke(req,res,account)));
      for (const account of leaving) forget(req,res,account);
      clearLegacy(req,res);
      dropCookie(req,res,GOOGLE_FLOW);
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      for (const entry of listEntries(req).filter(usable).sort(byRecent)) {
        const session = await renew(req,res,entry.id).catch(() => null);
        if (session) { activate(req,res,session); return accountProfile(session.user); }
      }
      return null;
    }
  };
}

export function authFromEnv(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  return createSupabaseAuth({ projectUrl: env.SUPABASE_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY });
}
