import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { activeAccountId } from './auth.mjs';
import { courseOutline, memberCourse, memberCourseCard } from './course-model.mjs';
import { withCommunityGrants } from './community-academy.mjs';
import { gradeQuiz } from './course-learning.mjs';
import { courseAnalytics, courseSummaries } from './course-analytics.mjs';

const fail = (message, status = 400) => { throw Object.assign(Error(message), { status }); };
const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const emailOf = value => text(value, 254).toLowerCase();
const secret = () => randomBytes(32).toString('base64url');
const digest = token => createHash('sha256').update(token).digest('hex');
const validToken = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const sessionSeconds = 8 * 60 * 60;
const linkSeconds = { magic: 15 * 60, login: 24 * 60 * 60, invite: 7 * 24 * 60 * 60 };
const linkLifetime = { magic: '15 minutos', login: '24 horas', invite: '7 dias' };
const portalId = workspace => `portal-${workspace}`;
const portalPath = workspace => `/portal/${workspace}`;
const blankPortal = () => ({
  profile: { name: 'Portal do cliente' },
  settings: { title: '', introduction: '', color: '#b71889', enabled: true },
  members: [], links: [], sessions: []
});

// `staff`: a equipe entrou pelo app. O cookie leva a conta graao que entrou e só vale enquanto ela está aberta: trocar de
// conta (ou sair) não deixa a próxima agir no portal como a anterior.
export function portalCookie(req, res, workspace, token, secure, { staff = false } = {}) {
  const name = secure ? '__Secure-graao_portal' : 'graao_portal';
  if (token !== undefined) {
    const owner = staff && token ? activeAccountId(req) : '';
    res.appendHeader('Set-Cookie', `${name}=${token}${owner && '~' + owner}; Path=/api/client-portal/${workspace}/; HttpOnly; SameSite=Lax; Max-Age=${token ? sessionSeconds : 0}${secure ? '; Secure' : ''}`);
    return;
  }
  const prefix = name + '=';
  const value = req.headers.cookie?.split(';').map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length) || '';
  const [session, owner] = value.split('~');
  return owner && owner !== activeAccountId(req) ? '' : session;
}

function courseIds(state, input) {
  if (!Array.isArray(input) || input.length > 500 || input.some(id => !state.courses.some(course => course.id === id))) {
    fail('Selecione cursos desta subconta.');
  }
  return [...new Set(input)];
}

// Remembers when each course was granted, so drip lessons count days from that moment.
function grant(member, ids) {
  const at = new Date().toISOString(), previous = new Set(member.courseIds || []);
  member.grantedAt = Object.fromEntries(ids.map(id => [id, previous.has(id) && member.grantedAt?.[id] || at]));
  member.courseIds = ids;
}

function recipient(state, input, action) {
  const contact = input.contactId && state.contacts.find(row => row.id === input.contactId);
  if (input.contactId && !contact) fail('Contato não encontrado nesta subconta.', 404);
  if (!contact && !input.email) fail('Selecione um contato para gerar o link.');
  const email = emailOf(contact ? contact.email : input.email);
  if (!/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email)) fail('Informe um e-mail válido.');
  return { email, name: contact?.name || input.name || '', contactId: contact?.id || '' };
}

function person(doc, address) {
  return (address.contactId && doc.members.find(member => address.contactId === member.contactId)) ||
    doc.members.find(member => member.email === address.email);
}

export function makeClientPortal({
  store, mailKey = process.env.RESEND_API_KEY, from = process.env.PORTAL_EMAIL_FROM,
  publicOrigin = process.env.PORTAL_PUBLIC_ORIGIN, request = fetch, onCourseActivity = null, loadState = null, onLogin = null, extraCourses = null
}) {
  // Courses a member opens beyond their own grants (the Academia of the communities they have access to).
  // { courseId: day access began }; drip lessons of those courses count from that day.
  const extraFor = async (workspace, state, member) => member && extraCourses ? extraCourses(workspace, state, member.id) : {};
  const opens = (member, extra, id) => member.courseIds.includes(id) || Object.hasOwn(extra, id);
  // The workspace again after a credential was issued (the server gives the loader; tests may not).
  const reload = async (workspace, state) => loadState ? loadState(workspace) : state;
  let mailOrigin;
  try {
    const url = new URL(publicOrigin);
    if (url.protocol === 'https:' && url.origin === url.href.slice(0, -1)) mailOrigin = url.origin;
  } catch { /* The dashboard exposes when delivery needs configuration. */ }
  const emailConfigured = Boolean(mailKey && from && mailOrigin);

  async function load(workspace) {
    try { return await store.load(portalId(workspace)); }
    catch (error) { if (error.status !== 404) throw error; return null; }
  }

  async function change(workspace, mutate) {
    const id = portalId(workspace);
    try { return await store.change(id, mutate); }
    catch (error) {
      if (error.status !== 404 || error.message !== 'Workspace not found.') throw error;
      await store.insert(id, blankPortal());
      return store.change(id, mutate);
    }
  }

  function view(workspace, doc, state) {
    return {
      title: doc.settings.title || state.profile.name,
      introduction: doc.settings.introduction,
      color: doc.settings.color,
      path: portalPath(workspace)
    };
  }

  function dashboard(workspace, doc, state) {
    return {
      ...view(workspace, doc, state), settings: doc.settings, emailConfigured, mailOrigin,
      stats: {
        invited: doc.members.filter(member => member.invitedAt).length,
        users: doc.members.filter(member => member.joinedAt && !member.revokedAt).length
      },
      members: doc.members
    };
  }

  function requireEnabled(doc) {
    if (!doc.settings.enabled) fail('O portal desta subconta está indisponível.', 404);
  }

  async function deliver(to, url, action, title, fingerprint) {
    const invite = action === 'invite';
    const subject = invite ? 'Convite para o portal do cliente' : 'Seu link de acesso ao portal do cliente';
    let response;
    try {
      response = await request('https://api.resend.com/emails', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { Authorization: `Bearer ${mailKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `portal-${fingerprint}` },
        body: JSON.stringify({ from, to: [to], subject,
          text: `${subject} de ${title}.\n\nAcesse: ${url}\n\nO link pode ser usado uma vez. Ele expira em ${linkLifetime[action]}.` })
      });
    } catch { fail('O serviço de e-mail não confirmou o envio. Você pode gerar um link para compartilhar.', 502); }
    if (!response.ok) fail('O serviço de e-mail recusou o envio. Verifique a configuração do remetente.', 502);
  }

  async function admin(workspace, state, input) {
    if (!input) return dashboard(workspace, await load(workspace) || blankPortal(), state);
    const { action } = input;
    if (['magic', 'invite', 'login'].includes(action)) {
      const sendEmail = action === 'login' || input.sendEmail === true;
      if (sendEmail && !emailConfigured) fail('O envio por e-mail ainda não foi configurado.', 503);
      const address = action === 'login' && input.memberId ? null : recipient(state, input, action);
      const grants = input.courseIds === undefined ? undefined : courseIds(state, input.courseIds);
      const token = secret(), fingerprint = digest(token);
      const issued = await change(workspace, doc => {
        requireEnabled(doc);
        const now = Date.now(), created = new Date(now).toISOString();
        let member = address ? person(doc, address) : doc.members.find(row => row.id === input.memberId);
        if (!address && !member) fail('Cliente não encontrado.', 404);
        if (member?.revokedAt) fail('Reative o acesso deste cliente antes de gerar um link.', 409);
        if (!member) {
          member = { id: randomUUID(), ...address, courseIds: [], created };
          doc.members.push(member);
        } else if (address?.contactId && !member.contactId) {
          member.contactId = address.contactId;
          member.name ||= address.name;
        }
        if (grants !== undefined) grant(member, grants);
        if (action === 'invite') member.invitedAt = created;
        doc.links = doc.links.filter(link => link.expires > now);
        if (doc.links.filter(link => link.memberId === member.id).length >= 20) {
          fail('Já há vários links ativos para este cliente. Aguarde a expiração de um deles.', 429);
        }
        const expires = now + linkSeconds[action] * 1000;
        doc.links.push({ memberId: member.id, fingerprint, expires });
        return { ...dashboard(workspace, doc, state), expires, email: member.email };
      });
      const accessPath = `${portalPath(workspace)}#access=${token}`;
      if (sendEmail) {
        await deliver(issued.email, mailOrigin + accessPath, action, issued.title, fingerprint);
        return { ...issued, sent: true };
      }
      return { ...issued, accessPath };
    }

    if (action === 'staff-enter') {
      const email = emailOf(input.email || state.profile?.email || 'admin@graao.com');
      const name = text(input.name || state.profile?.name || 'Administrador', 120);
      // The team account photo (Google sign-in), https only; a bad value never replaces a good one.
      const photo = typeof input.photo === 'string' && /^https:\/\/[^\s"'<>]+$/i.test(input.photo) ? input.photo.slice(0, 1024) : '';
      const token = secret(), fingerprint = digest(token);
      const allCourses = (state.courses || []).map(c => c.id);
      const memberId = await change(workspace, doc => {
        const now = Date.now(), created = new Date(now).toISOString();
        let member = doc.members.find(row => row.email === email);
        if (!member) {
          member = { id: randomUUID(), email, name, contactId: '', courseIds: [], created };
          doc.members.push(member);
        }
        member.name ||= name;
        if (photo) member.photo = photo;
        member.joinedAt ||= created;
        delete member.revokedAt;
        grant(member, [...new Set([...(member.courseIds || []), ...allCourses])]);
        doc.links = (doc.links || []).filter(link => link.expires > now);
        doc.links.push({ memberId: member.id, fingerprint, expires: now + 60 * 60 * 1000 });
        return member.id;
      });
      const accessPath = `${portalPath(workspace)}#access=${token}`;
      return { ok: true, memberId, accessPath, token };
    }

    if (action === 'course-analytics') {
      const doc = await load(workspace) || blankPortal(), courseId = text(input.courseId, 60);
      if (!courseId) return { summaries: courseSummaries(state, doc) };
      const course = state.courses.find(row => row.id === courseId) || fail('Curso não encontrado.', 404);
      const days = [7, 30, 90, 365].includes(Number(input.days)) ? Number(input.days) : 30;
      return { analytics: courseAnalytics(state, course, doc, { days }) };
    }
    if (action === 'submissions') {
      const doc = await load(workspace) || blankPortal();
      return { submissions: submissionsOf(state, doc, text(input.courseId, 60)) };
    }
    if (action === 'grade') {
      const status = input.status === 'approved' ? 'approved' : input.status === 'revise' ? 'revise' : fail('Escolha aprovar ou pedir ajustes.');
      const courseId = text(input.courseId, 60), lessonId = text(input.lessonId, 60);
      let graded = null;
      const result = await change(workspace, doc => {
        const member = doc.members.find(row => row.id === input.memberId) || fail('Cliente não encontrado.', 404);
        const row = member.assignments?.[courseId]?.[lessonId] || fail('Entrega não encontrada.', 404);
        Object.assign(row, { status, feedback: text(input.feedback, 2000), gradedAt: new Date().toISOString() });
        member.progress ||= {};
        const done = member.progress[courseId] ||= {};
        const before = Boolean(done[lessonId]);
        if (status === 'approved') done[lessonId] ||= new Date().toISOString(); else delete done[lessonId];
        graded = { member, lessonId, status, newlyDone: !before && Boolean(done[lessonId]) };
        return { submissions: submissionsOf(state, doc, courseId) };
      });
      const lesson = lessonOf(state, courseId, lessonId);
      const course = state.courses.find(row => row.id === courseId);
      if (course && status === 'approved' && memberCourse(state, course, graded.member).progress.percent === 100 && credentialDue(state, graded.member, course, 'certificate')) await issue(workspace, graded.member, course, 'completed');
      const who = { courseId, lessonId, lessonTitle: lesson?.title || '', email: graded.member.email, name: graded.member.name, contactId: graded.member.contactId || '' };
      await onCourseActivity?.(workspace, { ...who, event: 'graded', status });
      if (graded.newlyDone && lesson) await onCourseActivity?.(workspace, { ...who, event: 'lesson', done: Object.keys(graded.member.progress?.[courseId] || {}) });
      return result;
    }

    return change(workspace, doc => {
      if (action === 'settings') {
        const color = text(input.color, 8);
        if (!/^#[\da-f]{6}$/i.test(color)) fail('Escolha uma cor válida.');
        doc.settings = { title: text(input.title, 100), introduction: text(input.introduction, 400), color, enabled: input.enabled === true };
        if (!doc.settings.enabled) { doc.links = []; doc.sessions = []; }
      } else if (['permissions', 'revoke', 'reactivate'].includes(action)) {
        const member = doc.members.find(row => row.id === input.id);
        if (!member) fail('Cliente não encontrado.', 404);
        if (action === 'permissions') grant(member, courseIds(state, input.courseIds));
        if (action === 'reactivate') delete member.revokedAt;
        if (action === 'revoke') {
          member.revokedAt = new Date().toISOString();
          doc.links = doc.links.filter(link => link.memberId !== member.id);
          doc.sessions = doc.sessions.filter(session => session.memberId !== member.id);
        }
      } else fail('Ação do portal não encontrada.', 404);
      return dashboard(workspace, doc, state);
    });
  }

  // Staff previewing the portal (`staff: true`) signs in without firing "Login no portal do cliente".
  async function exchange(workspace, token, { staff = false } = {}) {
    if (!validToken(token)) fail('Este link é inválido, expirou ou já foi usado.', 401);
    const fingerprint = digest(token), sessionToken = secret();
    let login = null;
    try {
      const result = await store.change(portalId(workspace), doc => {
        requireEnabled(doc);
        const now = Date.now();
        const link = doc.links.find(row => row.fingerprint === fingerprint && row.expires > now);
        const member = link && doc.members.find(row => row.id === link.memberId && !row.revokedAt);
        if (!member) fail('Este link é inválido, expirou ou já foi usado.', 401);
        login = { email: member.email, name: member.name || '', contactId: member.contactId || '', first: !member.joinedAt };
        member.joinedAt ||= new Date(now).toISOString();
        doc.links = doc.links.filter(row => row !== link && row.expires > now);
        doc.sessions = doc.sessions.filter(row => row.expires > now);
        doc.sessions.push({ memberId: member.id, fingerprint: digest(sessionToken), expires: now + sessionSeconds * 1000, ...(staff ? { staff: true } : {}) });
        return sessionToken;
      });
      // A workflow problem never blocks the sign-in.
      if (login && !staff) await Promise.resolve(onLogin?.(workspace, login)).catch(problem => console.error(`Portal login trigger (${workspace}): ${problem.message}`));
      return result;
    } catch (error) {
      if (error.status === 404 && error.message === 'Workspace not found.') fail('Este link é inválido, expirou ou já foi usado.', 401);
      throw error;
    }
  }

  async function signOut(workspace, token) {
    if (!validToken(token)) return;
    const fingerprint = digest(token);
    try { await store.change(portalId(workspace), doc => { doc.sessions = doc.sessions.filter(row => row.fingerprint !== fingerprint); }); }
    catch (error) { if (error.status !== 404) throw error; }
  }

  function signedMember(doc, token) {
    const fingerprint = validToken(token) && digest(token);
    const session = fingerprint && doc.sessions.find(row => row.fingerprint === fingerprint && row.expires > Date.now());
    return session && doc.members.find(row => row.id === session.memberId && !row.revokedAt);
  }

  // Badge when the student first opens a course, certificate when it reaches 100% (only what is still missing).
  const credentialDue = (state, member, course, kind) => course.credentials?.[kind]?.enabled
    && !(state.credentialsIssued || []).some(row => row.kind === kind && row.courseId === course.id && row.memberId === member.id && !row.revokedAt);
  const issue = (workspace, member, course, event) => onCourseActivity?.(workspace, { event, courseId: course.id, memberId: member.id, email: member.email, name: member.name, contactId: member.contactId || '' });
  const lessonOf = (state, courseId, lessonId) => {
    const course = state.courses.find(row => row.id === courseId);
    return course && courseOutline(course).flatMap(module => module.lessons).find(lesson => lesson.id === lessonId);
  };
  // Assignment deliveries for the team: newest first, with the student and the lesson.
  function submissionsOf(state, doc, courseId = '') {
    const out = [];
    for (const member of doc.members || []) for (const [course, lessons] of Object.entries(member.assignments || {})) {
      if (courseId && course !== courseId) continue;
      for (const [lessonId, row] of Object.entries(lessons)) {
        const lesson = lessonOf(state, course, lessonId);
        if (!lesson) continue;
        out.push({ memberId: member.id, name: member.name || member.email, email: member.email, courseId: course, lessonId, lesson: lesson.title, graded: lesson.assignment?.graded !== false, ...row });
      }
    }
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 500);
  }

  function grantedCourse(state, member, courseId, extra = {}) {
    const course = state.courses.find(row => row.id === courseId && row.active && opens(member, extra, row.id));
    if (!course) fail('Curso indisponível para este cliente.', 404);
    return course;
  }

  // "Aula iniciada": the first time a student opens a lesson that is not done yet. Staff previews never count,
  // and a problem here never keeps the student from the lesson.
  async function lessonStarted(workspace, token, member, course, lesson) {
    if (member.started?.[course.id]?.[lesson.id]) return;
    let who = null;
    try {
      await store.change(portalId(workspace), current => {
        const fingerprint = validToken(token) && digest(token);
        const session = fingerprint && current.sessions.find(row => row.fingerprint === fingerprint && row.expires > Date.now());
        const row = session && current.members.find(item => item.id === session.memberId && !item.revokedAt);
        if (!row || session.staff) return;
        const started = ((row.started ||= {})[course.id] ||= {});
        if (started[lesson.id]) return;
        started[lesson.id] = new Date().toISOString();
        if (!row.progress?.[course.id]?.[lesson.id]) who = { event: 'lesson_started', courseId: course.id, lessonId: lesson.id, lessonTitle: lesson.title, email: row.email, name: row.name, contactId: row.contactId || '' };
      });
      if (who) await onCourseActivity?.(workspace, who);
    } catch (problem) { console.error(`Lesson started trigger (${workspace}): ${problem.message}`); }
  }

  // `track: false` (a paused sub-account) shows the lesson without recording or firing anything.
  async function content(workspace, state, token, courseId, lessonId = '', { track = true } = {}) {
    const doc = await load(workspace);
    if (!doc && !courseId) return { ...view(workspace, blankPortal(), { profile: { name: 'Portal do cliente' } }), signedIn: false };
    if (!doc) fail('Entre no portal para acessar sua aula.', 401);
    requireEnabled(doc);
    const member = signedMember(doc, token);
    const base = view(workspace, doc, state);
    if (!member) {
      if (courseId) fail('Entre no portal para acessar sua aula.', 401);
      return { ...base, signedIn: false };
    }
    const extra = await extraFor(workspace, state, member);
    if (courseId) {
      const course = grantedCourse(state, member, courseId, extra);
      if (credentialDue(state, member, course, 'badge')) {
        await issue(workspace, member, course, 'opened');
        state = await reload(workspace, state);
      }
      const page = memberCourse(state, course, withCommunityGrants(member, extra), { lessonId });
      // A lesson is opened when asked for by id; without one, only a course with no product page shows its lesson.
      if (page.lesson && track && (lessonId || course.page?.productPage === false)) await lessonStarted(workspace, token, member, course, page.lesson);
      return { ...base, signedIn: true, member: { name: member.name, ...(member.photo ? { photo: member.photo } : {}) }, course: page };
    }
    const courses = state.courses.filter(course => course.active && opens(member, extra, course.id));
    return { ...base, signedIn: true, member: { name: member.name, ...(member.photo ? { photo: member.photo } : {}) }, courses: courses.map(course => memberCourseCard(state, course, withCommunityGrants(member, extra))) };
  }

  // Marks one lesson as done (or not) for the signed-in member and returns the refreshed course.
  // Quizzes and assignments complete through their own submission, never by "mark as done".
  async function progress(workspace, state, token, courseId, input) {
    const action = ['quiz', 'assignment'].includes(input?.action) ? input.action : 'done';
    if (typeof input?.lessonId !== 'string' || (action === 'done' && typeof input.done !== 'boolean')) fail('Informe a aula.', 400);
    let activity = null, lessonDone = null;
    const finished = {};
    const current = await load(workspace);
    const extra = current ? await extraFor(workspace, state, signedMember(current, token)) : {};
    try {
      const result = await store.change(portalId(workspace), doc => {
        requireEnabled(doc);
        const member = signedMember(doc, token);
        if (!member) fail('Entre no portal para acessar sua aula.', 401);
        const course = grantedCourse(state, member, courseId, extra);
        memberCourse(state, course, withCommunityGrants(member, extra), { lessonId: input.lessonId });
        const lesson = lessonOf(state, courseId, input.lessonId);
        finished.member = structuredClone(member);
        member.progress ||= {};
        const done = member.progress[courseId] ||= {};
        const who = { email: member.email, name: member.name, contactId: member.contactId || '', courseId, lessonId: lesson.id, lessonTitle: lesson.title };
        if (action === 'done') {
          if (['quiz', 'assignment'].includes(lesson.kind)) fail(lesson.kind === 'quiz' ? 'Responda o quiz para concluir esta aula.' : 'Envie a tarefa para concluir esta aula.', 409);
          if (input.done) done[input.lessonId] ||= new Date().toISOString();
          else delete done[input.lessonId];
        } else if (action === 'quiz') {
          if (lesson.kind !== 'quiz') fail('Esta aula não é um quiz.');
          const graded = gradeQuiz(lesson, input.answers);
          const attempts = ((member.quizzes ||= {})[courseId] ||= {}), prior = attempts[lesson.id];
          attempts[lesson.id] = { ...graded, at: new Date().toISOString(), count: (prior?.count || 0) + 1, best: Math.max(prior?.best || 0, graded.score) };
          if (graded.passed) done[lesson.id] ||= new Date().toISOString();
          activity = { ...who, event: 'quiz', score: graded.score, passed: graded.passed };
        } else {
          if (lesson.kind !== 'assignment') fail('Esta aula não é uma tarefa.');
          const body = text(input.text, 5000), link = text(input.link, 600);
          if (!body && !link) fail('Escreva sua resposta ou envie um link.');
          if (link && !/^https:\/\/[^\s"'<>]+$/i.test(link)) fail('O link precisa começar com https://.');
          const deliveries = ((member.assignments ||= {})[courseId] ||= {}), prior = deliveries[lesson.id];
          if (prior?.status === 'approved') fail('Esta tarefa já foi aprovada.', 409);
          deliveries[lesson.id] = { text: body, link, at: new Date().toISOString(), status: lesson.assignment.graded ? 'submitted' : 'approved', feedback: '', count: (prior?.count || 0) + 1 };
          if (!lesson.assignment.graded) done[lesson.id] ||= new Date().toISOString();
          activity = { ...who, event: 'assignment' };
        }
        if (!finished.member.progress?.[courseId]?.[lesson.id] && done[lesson.id]) lessonDone = { ...who, event: 'lesson', done: Object.keys(done) };
        return { ...view(workspace, doc, state), signedIn: true, member: { name: member.name, ...(member.photo ? { photo: member.photo } : {}) },
          course: memberCourse(state, course, withCommunityGrants(member, extra), { lessonId: input.lessonId }) };
      });
      if (activity) await onCourseActivity?.(workspace, activity);
      if (lessonDone) await onCourseActivity?.(workspace, lessonDone);
      const course = state.courses.find(row => row.id === courseId);
      if (result.course?.progress.percent === 100 && credentialDue(state, finished.member, course, 'certificate')) {
        await issue(workspace, finished.member, course, 'completed');
        const fresh = await reload(workspace, state);
        result.course = { ...result.course, certificate: memberCourse(fresh, course, finished.member, { lessonId: input.lessonId }).certificate };
      }
      return result;
    } catch (error) {
      if (error.status === 404 && error.message === 'Workspace not found.') fail('Entre no portal para acessar sua aula.', 401);
      throw error;
    }
  }

  // Enrolls a buyer: finds or creates the portal member by e-mail and adds courses, keeping earlier grants.
  // Sends the login e-mail when delivery is configured.
  async function enroll(workspace, state, { email, name = '', contactId = '' }, courses = []) {
    const address = { email: emailOf(email), name: text(name, 120), contactId };
    let added = [];
    if (!/^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(address.email)) fail('Informe um e-mail válido.');
    const memberId = await change(workspace, doc => {
      const created = new Date().toISOString();
      let member = person(doc, address);
      if (!member) {
        member = { id: randomUUID(), ...address, courseIds: [], created };
        doc.members.push(member);
      }
      member.name ||= address.name;
      member.contactId ||= address.contactId;
      member.invitedAt ||= created;
      const valid = courses.filter(id => state.courses.some(course => course.id === id));
      const previous = new Set(member.courseIds || []);
      grant(member, [...new Set([...(member.courseIds || []), ...valid])]);
      added = valid.filter(id => !previous.has(id));
      return member.revokedAt ? '' : member.id;
    });
    if (!memberId) return { memberId: '', emailed: false, added: [] };
    let emailed = false;
    if (emailConfigured) {
      try { await admin(workspace, state, { action: 'login', memberId }); emailed = true; }
      catch { /* The access stays granted; staff can resend the login e-mail from the portal. */ }
    }
    return { memberId, emailed, added };
  }

  // Workflows (T.1): the portal member of a contact, and taking courses away from them.
  async function memberOf(workspace, { email = '', contactId = '' }) {
    const doc = await load(workspace);
    const member = doc && person(doc, { email: emailOf(email), contactId });
    return member && !member.revokedAt ? member.id : '';
  }
  async function revokeCourses(workspace, { email = '', contactId = '' }, courses = []) {
    if (!(await load(workspace))) return [];
    return change(workspace, doc => {
      const member = person(doc, { email: emailOf(email), contactId });
      if (!member) return [];
      const removed = (member.courseIds || []).filter(id => courses.includes(id));
      if (removed.length) grant(member, member.courseIds.filter(id => !courses.includes(id)));
      return removed;
    });
  }

  // The signed-in member and the portal document, for features that build on the portal session.
  async function session(workspace, token) {
    const doc = await load(workspace);
    if (!doc) fail('Entre no portal para acessar a comunidade.', 401);
    requireEnabled(doc);
    const member = signedMember(doc, token);
    if (!member) fail('Entre no portal para acessar a comunidade.', 401);
    return { doc, member };
  }

  // The portal document for staff screens (empty when the portal was never used).
  const directory = async workspace => await load(workspace) || blankPortal();

  return { admin, exchange, signOut, content, progress, session, directory, enroll, memberOf, revokeCourses };
}
