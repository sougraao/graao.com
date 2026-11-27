import { icon } from './icons.js';
import { communityCards, communityPage } from './portal-community.js';
import { themeMode, themeStyle } from './community-data.js';
import { smoothScroll } from './portal-smooth-scroll.js';
import { loyaltyCard } from './portal-loyalty.js';
import { assignmentBlock, certificateLink, coursePage, instructorCard, liveBlock, nextLessonCard, quizAnswers, quizBlock, themed } from './portal-course-extra.js';
import { askText, showCopy, tell } from './ask.js';

const root = document.querySelector('#portal');
const workspace = location.pathname.split('/')[2];
const endpoint = `/api/client-portal/${encodeURIComponent(workspace)}`;
const h = value => String(value ?? '').replace(/[&<>"']/g,char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
const day = value => new Intl.DateTimeFormat('pt-BR',{ day:'2-digit', month:'short', year:'numeric' }).format(new Date(value));

let access = null;
function readAccessLink() {
  const token = new URLSearchParams(location.hash.slice(1)).get('access');
  if (token === null) return false;
  access = token;
  history.replaceState(null,'',location.pathname);
  return true;
}
readAccessLink();

async function api(route, body) {
  const response = await fetch(`${endpoint}/${route}`, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(Error(result.error || 'Não foi possível abrir o portal.'),{status:response.status});
  return result;
}

const bar = ({ percent }) => `<span class="cp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" aria-label="Progresso"><span style="width:${percent}%"></span></span>`;
const startLabel = ({ done, total }) => !done ? 'Começar' : done >= total ? 'Rever curso' : 'Continuar';

function library(courses) {
  return `<section class="cp-library" id="cursos"><h2>Meus cursos</h2>
    ${courses?.length ? `<div class="cp-course-grid">${courses.map(item => `<article class="cp-public-card cp-course-card">
      <div class="cp-cover">${item.cover ? `<img src="${h(item.cover)}" alt="">` : `<span class="cp-course-icon">${icon('book',26)}</span>`}</div>
      <div class="cp-course-text"><h3>${h(item.name)}</h3>${item.description ? `<p>${h(item.description)}</p>` : ''}
        <div class="cp-course-progress">${bar(item.progress)}<small>${item.progress.done} de ${item.progress.total} aulas · ${item.progress.percent}%</small></div>
        ${item.badge || item.certificate ? `<div class="cp-card-credentials">${item.badge ? `<span class="cp-tag">★ ${h(item.badge.title)}</span>` : ''}${item.certificate ? `<a class="cp-tag cp-tag-ok" href="${h(certificateLink(item.certificate))}" target="_blank" rel="noopener">${icon('award',12)} Certificado</a>` : ''}</div>` : ''}
        <button type="button" class="cp-public-primary" data-course="${h(item.id)}">${startLabel(item.progress)} ${icon('right',16)}</button></div>
    </article>`).join('')}</div>` : '<p class="cp-public-card">Você ainda não tem cursos liberados.</p>'}</section>`;
}

function lessonBody(lesson) {
  if (!lesson) return '<p>Este curso ainda não tem aulas liberadas.</p>';
  let media = '';
  if (lesson.kind === 'video') media = lesson.embed
    ? `<div class="cp-video"><iframe src="${h(lesson.embed)}" title="${h(lesson.title)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
    : `<div class="cp-video"><video src="${h(lesson.videoUrl)}" controls preload="metadata"></video></div>`;
  if (lesson.kind === 'file') media = lesson.file ? `<div class="cp-file">${lesson.file.data.startsWith('data:image/') ? `<img src="${h(lesson.file.data)}" alt="">` : `<span class="cp-course-icon">${icon('paperclip',22)}</span>`}
      <div><strong>${h(lesson.file.name)}</strong><small>Material da aula</small></div>
      <a class="cp-public-primary" href="${h(lesson.file.data)}" download="${h(lesson.file.name)}">${icon('download',16)} Baixar</a></div>`
    : '<p class="cp-public-error">O material desta aula não está mais disponível.</p>';
  return `${media}${lesson.body ? `<div class="cp-lesson-body">${h(lesson.body)}</div>` : ''}${lesson.kind === 'quiz' ? quizBlock(lesson, retake === lesson.id) : ''}${lesson.kind === 'assignment' ? assignmentBlock(lesson) : ''}`;
}
let retake = '';
const kindGlyph = { video: 'play', file: 'paperclip', quiz: 'check', assignment: 'edit' };

function player(course) {
  const flat = course.modules.flatMap(module => module.lessons);
  const index = flat.findIndex(lesson => lesson.id === course.lesson?.id);
  const current = flat[index], next = flat.slice(index + 1).find(lesson => !lesson.locked);
  return `<div class="cp-player${themed(course)}">
    <div class="cp-player-top"><button type="button" class="cp-public-link" data-portal-public="${course.page?.productPage === false ? 'back' : 'course-page'}">${icon('left',16)} ${course.page?.productPage === false ? (cmReturn ? 'Academia' : 'Meus cursos') : 'Página do curso'}</button>
      <div class="cp-player-title"><h1>${h(course.name)}</h1><div class="cp-course-progress">${bar(course.progress)}<small>${course.progress.percent}% concluído</small></div></div></div>
    <div class="cp-player-grid">
      <div class="cp-player-side"><nav class="cp-public-card cp-outline" aria-label="Aulas do curso">${course.modules.map(module => {
        const item = lesson => `<li><button type="button" data-lesson="${h(lesson.id)}" ${lesson.id === current?.id ? 'aria-current="true"' : ''} ${lesson.locked ? 'disabled' : ''}>
          <span class="cp-state-icon ${lesson.done ? 'done' : ''}">${icon(lesson.locked ? 'lock' : lesson.done ? 'check' : kindGlyph[lesson.kind] || 'note',14)}</span>
          <span>${h(lesson.title)}${lesson.locked ? `<small>${lesson.waiting ? 'Conclua a aula anterior' : `Disponível em ${h(day(lesson.availableAt))}`}</small>` : ''}</span></button></li>`;
        const subs = module.submodules || [], known = new Set(subs.map(sub => sub.id));
        return `<section><h2>${h(module.title)}</h2><ol>${module.lessons.filter(lesson => !known.has(lesson.submoduleId)).map(item).join('')}</ol>
          ${subs.filter(sub => module.lessons.some(lesson => lesson.submoduleId === sub.id)).map(sub => `<h3 class="cp-submodule">${h(sub.title)}</h3><ol>${module.lessons.filter(lesson => lesson.submoduleId === sub.id).map(item).join('')}</ol>`).join('')}</section>`;
      }).join('')}</nav>${instructorCard(course)}${liveBlock(course.live)}</div>
      <article class="cp-public-card cp-lesson">${course.lesson ? `<p class="cp-lesson-kicker">Aula ${index + 1} de ${flat.length}</p><h2 class="cp-lesson-title">${h(course.lesson.title)}</h2>` : ''}
        ${lessonBody(course.lesson)}
        ${current ? `<footer class="cp-lesson-actions">
          ${['quiz', 'assignment'].includes(current.kind) ? (current.done ? `<span class="cp-tag cp-tag-ok">${icon('check',14)} Concluída</span>` : '')
            : `<button type="button" class="${current.done ? 'cp-public-ghost' : 'cp-public-primary'}" data-portal-public="toggle" aria-pressed="${current.done}">${icon('check',16)} ${current.done ? 'Concluída' : 'Marcar como concluída'}</button>`}
          ${next && course.page?.nextCard === false ? `<button type="button" class="cp-public-link" data-lesson="${h(next.id)}" data-auto="${!current.done && !['quiz', 'assignment'].includes(current.kind) ? '1' : ''}">Próxima aula ${icon('right',16)}</button>` : ''}</footer>
          ${course.page?.nextCard !== false ? nextLessonCard(next, current) : ''}
          ${course.certificate && course.progress.percent === 100 ? `<a class="cp-certificate-banner" href="${h(certificateLink(course.certificate))}" target="_blank" rel="noopener">${icon('award',20)}<span><b>Curso concluído!</b><small>Ver e imprimir o certificado</small></span></a>` : ''}` : ''}
      </article></div></div>`;
}

let portal, course, community = null, courseView = 'lesson', redeemed = null;
// A course opened from a community's Academia goes back there, not to the portal home.
let cmReturn = '';
// The member's light/dark choice for communities lives in this browser only.
const savedMode = () => { try { const value = localStorage.getItem('graao:cm-mode'); return value === 'light' || value === 'dark' ? value : ''; } catch { return ''; } };
const cmUi = { tab: 'discussion', channel: '', period: '30', feed: 'recent', openComments: new Set(), mode: savedMode() };
const uploadCard = files => `<section class="cp-public-card cp-upload"><h2>${icon('upload', 18)} Enviar um arquivo para a equipe</h2>
  <p>Imagem, vídeo, áudio, PDF, TXT ou CSV de até 700 KB.</p>
  <form data-portal-upload><label class="cp-sr" for="cp-upload-file">Arquivo</label><input id="cp-upload-file" type="file" name="file" required accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,audio/mpeg,audio/wav,audio/ogg,application/pdf,text/plain,text/csv">
    <button type="submit" class="cp-public-primary">Enviar</button></form>
  ${(files || []).length ? `<ul class="cp-upload-list">${files.map(file => `<li>${icon('file', 14)} ${h(file.name)} <small>${h(new Date(file.created).toLocaleDateString('pt-BR'))}</small></li>`).join('')}</ul>` : ''}</section>`;

// Notificações push (6.6 / "Notificação push" dos fluxos): the client turns them on for this device.
const pushCard = () => 'serviceWorker' in navigator && 'PushManager' in window ? `<section class="cp-public-card cp-push"><h2>${icon('bell', 18)} Notificações</h2>
  <p>Receba neste aparelho os avisos da equipe.</p><button type="button" class="cp-public-primary" data-portal-push>Ativar notificações</button></section>` : '';
async function enablePush() {
  const { key } = await fetch('/api/push/key').then(r => r.json());
  if (!key) throw Error('As notificações ainda não foram configuradas.');
  if (await Notification.requestPermission() !== 'granted') throw Error('Permita as notificações nas configurações do navegador.');
  const reg = await navigator.serviceWorker.register('/push/sw.js', { scope: '/push/' });
  const raw = atob((key + '='.repeat((4 - key.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, ch => ch.charCodeAt(0)) });
  await api('push', { subscription: sub.toJSON() });
}

// Light/dark switch with the same diagonal wipe as the graao app (View Transitions); instant without support or
// when the system asks for reduced motion.
async function switchMode(mode) {
  const swap = () => { draw(); root.querySelector('[data-cm-public="mode"]')?.focus(); };
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches || document.visibilityState !== 'visible') return swap();
  document.documentElement.dataset.cmModeTo = mode;
  const transition = document.startViewTransition(swap);
  try { await transition.finished; } catch { /* skipped: the page is already in the new mode */ }
  delete document.documentElement.dataset.cmModeTo;
}

// The open community paints the whole page with its theme (the portal header and the page scrollbar included,
// so the tokens live on <html>) and turns on the smooth wheel scrolling.
function paintCommunity(group) {
  const page = document.documentElement;
  for (const rule of themeStyle(themeMode(group?.theme, cmUi.mode)).split(';')) {
    const [name, value] = rule.split(':');
    if (group) page.style.setProperty(name, value); else page.style.removeProperty(name);
  }
  page.classList.toggle('cp-cm-on', Boolean(group));
  document.body.classList.toggle('cp-cm-on', Boolean(group));
  smoothScroll(Boolean(group));
}

function draw(message = '') {
  const { title, introduction, color, signedIn, courses, member } = portal || { title: 'Portal do cliente' };
  document.title = community ? `${community.group.name} · ${title}` : course ? `${course.name} · ${title}` : title;
  if (/^#[\da-f]{6}$/i.test(color)) document.body.style.setProperty('--portal-color',color);
  paintCommunity(community?.group);
  cmUi.me = member?.name || '';
  cmUi.mePhoto = member?.photo || '';
  root.innerHTML = `<div class="cp-public-shell ${course || community ? 'cp-wide' : ''}"><header class="cp-public-header">
      <div class="cp-public-brand">${icon('lock',20)}<span>${h(title)}</span></div>
      ${signedIn ? '<button type="button" class="cp-public-link" data-portal-public="logout">Sair</button>' : ''}
    </header>
    ${message ? `<p class="cp-public-error" role="alert">${h(message)}</p>` : ''}
    ${signedIn ? (community ? communityPage(community, cmUi) : course ? (courseView === 'page' ? coursePage(course, bar).replace('Meus cursos</button>', `${cmReturn ? 'Academia' : 'Meus cursos'}</button>`) : player(course)) : `<section class="cp-public-welcome">
      <h1>${member?.name ? `Olá, ${h(member.name)}` : 'Bem-vindo ao portal'}</h1>
      ${introduction ? `<p>${h(introduction)}</p>` : ''}</section>${library(courses)}${communityCards(portal?.communities)}${loyaltyCard(portal?.loyalty, redeemed)}${uploadCard(portal?.files)}${pushCard()}`) :
      `<section class="cp-public-card cp-signin"><div class="cp-course-icon">${icon('key',24)}</div>
        <h1>Acesse seu portal</h1>
        ${access ? '<p>Confirme para entrar com o seu link de acesso.</p><button type="button" class="cp-public-primary" data-portal-public="enter">Entrar no portal</button>' :
          `<p>Peça um link de acesso à equipe responsável por seus cursos.</p><button type="button" class="cp-public-ghost" data-portal-public="admin-enter">${icon('user',16)} Entrar como equipe / administrador</button>`}</section>`}
  </div>`;
}

const loadCommunity = async id => {
  const query = new URLSearchParams({ channel: '', period: cmUi.period });
  community = (await api(`community/${encodeURIComponent(id)}?${query}`)).community;
};
const communityAction = async body => {
  community = (await api(`community/${encodeURIComponent(community.group.id)}`, { ...body, channelFilter: '' })).community;
};

const openCourse = async (id, lesson = '') => {
  course = (await api(`course/${encodeURIComponent(id)}${lesson ? `?lesson=${encodeURIComponent(lesson)}` : ''}`)).course;
};

root.addEventListener('click', async event => {
  const button = event.target.closest('button');
  if (!button || button.type === 'submit') return;
  if (button.dataset.portalPush !== undefined) {
    button.disabled = true;
    try { await enablePush(); button.textContent = 'Notificações ativadas'; }
    catch (error) { button.disabled = false; await tell('Não foi possível ativar as notificações', error.message); }
    return;
  }
  const action = button.dataset.portalPublic;
  button.disabled = true;
  let focus = '';
  try {
    if (action === 'enter') {
      await api('exchange',{ token:access });
      access = null;
      portal = await api('home');
    } else if (action === 'admin-enter') {
      await api('admin-enter', {});
      portal = await api('home');
      const hash = new URLSearchParams(location.hash.slice(1));
      const targetCommunity = new URLSearchParams(location.search).get('comunidade') || hash.get('comunidade');
      if (targetCommunity) {
        Object.assign(cmUi, { tab: 'discussion', channel: '', period: '30', feed: 'recent', openComments: new Set() });
        await loadCommunity(targetCommunity);
        cmUi.tab = (community?.group?.tabs || []).find(tab => tab.visible !== false)?.key || 'discussion';
      }
    } else if (action === 'logout') {
      await api('logout',{});
      course = null;
      cmReturn = '';
      portal = await api('home');
    } else if (action === 'back' && cmReturn) {
      course = null;
      const id = cmReturn;
      cmReturn = '';
      await loadCommunity(id);
      cmUi.tab = 'academy';
      focus = '.cp-cm h1';
    } else if (action === 'back') {
      course = null;
      community = null;
      portal = await api('home');
    } else if (action === 'toggle') {
      const lessonId = course.lesson.id, done = !course.modules.flatMap(module => module.lessons).find(lesson => lesson.id === lessonId).done;
      course = (await api(`progress/${encodeURIComponent(course.id)}`,{ lessonId, done })).course;
      focus = '[data-portal-public="toggle"]';
    } else if (button.dataset.courseRetake) {
      retake = button.dataset.courseRetake;
      focus = '.cp-quiz-form input';
    } else if (button.dataset.loyaltyRedeem) {
      const result = await api('loyalty', { rewardId: button.dataset.loyaltyRedeem });
      portal.loyalty = result.loyalty; redeemed = result.redeemed;
      focus = '.cp-loyalty-code';
    } else if (action === 'course-page') {
      courseView = 'page';
      focus = '.cp-course-hero h1';
    } else if (button.dataset.lesson) {
      retake = '';
      // "Conclude when moving on": a plain lesson is marked done before the next one opens.
      if (button.dataset.auto === '1' && course.page?.autoComplete && course.lesson) await api(`progress/${encodeURIComponent(course.id)}`, { lessonId: course.lesson.id, done: true });
      courseView = 'lesson';
      await openCourse(course.id, button.dataset.lesson);
      focus = '.cp-lesson-title';
    } else if (button.dataset.community) {
      Object.assign(cmUi, { tab: 'discussion', channel: '', period: '30', feed: 'recent', openComments: new Set() });
      await loadCommunity(button.dataset.community);
      cmUi.tab = (community.group.tabs || []).find(tab => tab.visible !== false)?.key || 'discussion';
      focus = '.cp-cm h1';
    } else if (button.dataset.cmPublic) {
      const { cmPublic: verb, value, post, comment, option } = button.dataset;
      if (verb === 'tab') { cmUi.tab = value; focus = `[data-cm-public="tab"][data-value="${value}"]`; }
      else if (verb === 'channel') { cmUi.channel = value; cmUi.tab = 'discussion'; focus = `[data-cm-public="channel"][data-value="${value}"]`; }
      else if (verb === 'events') { cmUi.events = value; focus = `[data-cm-public="events"][data-value="${value}"]`; }
      else if (verb === 'mode') { cmUi.mode = value; try { localStorage.setItem('graao:cm-mode', value); } catch { /* private window: the choice lasts this visit */ } await switchMode(value); return; }
      else if (verb === 'feed') { cmUi.feed = value; focus = `[data-cm-public="feed"][data-value="${value}"]`; }
      else if (verb === 'comments-all') { cmUi.openComments.add(post); focus = `#post-${post} .cp-comments`; }
      else if (verb === 'comment-focus') { root.querySelector(`#post-${CSS.escape(post)} .cp-comment-form input`)?.focus(); return; }
      else if (verb === 'share') { await sharePost(button, post); return; }
      else if (verb === 'course') {
        cmReturn = community.group.id;
        await openCourse(button.dataset.course);
        community = null;
        courseView = course.page?.productPage === false ? 'lesson' : 'page';
        focus = '.cp-lesson-title';
      }
      else if (verb === 'ticket') {
        const result = await api(`community/${encodeURIComponent(community.group.id)}`, { action: 'ticket', eventId: button.dataset.event });
        community = result.community;
        if (result.payUrl) { location.href = result.payUrl; return; }
      }
      else if (verb === 'rsvp' || verb === 'rsvp-cancel') await communityAction({ action: verb, eventId: button.dataset.event });
      else if (verb === 'onboarding') { await communityAction({ action: 'onboarding', stepId: button.dataset.step, done: button.dataset.done === 'yes' }); focus = `[data-cm-public="onboarding"][data-step="${button.dataset.step}"]`; }
      else if (verb === 'report') {
        const reason = await askText('Por que você está denunciando?', { text: 'O motivo é opcional.', multiline: true, ok: 'Denunciar' });
        if (reason === null) return;
        await communityAction({ action: 'report', postId: post, commentId: comment, reason });
      }
      else if (verb === 'period') { cmUi.period = value; focus = `[data-cm-public="period"][data-value="${value}"]`; }
      else if (verb === 'delete' && !confirmDelete(button)) return;
      else if (['join','leave','like','vote','delete'].includes(verb)) {
        await communityAction({ action: verb, postId: post, commentId: comment, optionId: option });
        if (verb === 'join' || verb === 'leave') { portal = await api('home'); focus = '.cp-cm h1'; }
      }
    } else if (button.dataset.course) {
      await openCourse(button.dataset.course);
      courseView = course.page?.productPage === false ? 'lesson' : 'page';
      focus = '.cp-lesson-title';
    }
    draw();
    if (focus) { const target = root.querySelector(focus); if (target && !target.matches('button')) target.setAttribute('tabindex','-1'); target?.focus(); }
  } catch (error) {
    if (error.status === 401) {
      access = null;
      course = null;
      community = null;
      if (portal) portal.signedIn = false;
    }
    draw(error.message);
  } finally {
    button.disabled = false;
  }
});

// "Compartilhar": copies the link that opens the community on this post.
async function sharePost(button, postId) {
  const link = `${location.origin}${location.pathname}?comunidade=${encodeURIComponent(community.group.id)}#post-${encodeURIComponent(postId)}`;
  const label = button.querySelector('span');
  try { await navigator.clipboard.writeText(link); label.textContent = 'Link copiado'; }
  catch { await showCopy('Copie o link da publicação', link); }
  setTimeout(() => { if (label.isConnected) label.textContent = 'Compartilhar'; }, 2000);
}

// The composer opens its extra fields once there is text, and counts characters.
root.addEventListener('input', event => {
  const area = event.target.closest('.cp-cm-composer textarea[name="body"]');
  if (!area) return;
  const form = area.form;
  form.toggleAttribute('data-open', Boolean(area.value));
  const count = form.querySelector('[data-cm-count]');
  if (count) count.textContent = `${area.value.length}/10000`;
});
// A click outside closes an open "⋯" menu.
// A member photo that fails to load (an expired link) leaves the initials underneath.
root.addEventListener('error', event => { if (event.target.matches?.('.cp-avatar img')) event.target.remove(); }, true);
document.addEventListener('click', event => {
  for (const open of root.querySelectorAll('.cp-cm-menu[open]')) if (!open.contains(event.target)) open.open = false;
});

// Deleting asks twice: the first click turns the button into a confirmation.
function confirmDelete(button) {
  if (button.dataset.armed) return true;
  button.dataset.armed = 'yes';
  button.textContent = 'Confirmar exclusão';
  button.classList.add('cp-danger');
  setTimeout(() => { if (button.isConnected) { delete button.dataset.armed; draw(); } }, 4000);
  return false;
}

root.addEventListener('submit', async event => {
  const upload = event.target.closest('[data-portal-upload]');
  if (upload) {
    event.preventDefault();
    const file = upload.elements.file.files?.[0];
    const fail = text => { upload.querySelector('.cp-public-error')?.remove(); upload.insertAdjacentHTML('afterbegin', `<p class="cp-public-error" role="alert">${h(text)}</p>`); };
    if (!file) return fail('Escolha um arquivo.');
    if (file.size > 700_000) return fail('O arquivo passa de 700 KB.');
    const button = upload.querySelector('button'); button.disabled = true;
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
      portal.files = (await api('files', { name: file.name, data })).files;
      draw();
      root.querySelector('.cp-upload')?.insertAdjacentHTML('beforeend', '<p class="cp-public-ok" role="status">Arquivo enviado. A equipe já recebeu.</p>');
    } catch (error) { button.disabled = false; fail(error.message); }
    return;
  }
  const courseForm = event.target.closest('[data-course-form]');
  if (courseForm && course?.lesson) {
    event.preventDefault();
    const submit = courseForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const body = courseForm.dataset.courseForm === 'quiz' ? { action: 'quiz', lessonId: course.lesson.id, answers: quizAnswers(courseForm) }
        : { action: 'assignment', lessonId: course.lesson.id, text: courseForm.elements.text.value, link: courseForm.elements.link.value };
      course = (await api(`progress/${encodeURIComponent(course.id)}`, body)).course;
      retake = '';
      draw();
      root.querySelector('.cp-quiz-result, .cp-assignment-status')?.scrollIntoView({ block: 'start' });
    } catch (error) {
      if (error.status === 401) { course = null; if (portal) portal.signedIn = false; draw(error.message); return; }
      submit.disabled = false;
      courseForm.querySelector('.cp-public-error')?.remove();
      courseForm.insertAdjacentHTML('afterbegin', `<p class="cp-public-error" role="alert">${h(error.message)}</p>`);
    }
    return;
  }
  const form = event.target.closest('[data-cm-public-form]');
  if (!form || !community) return;
  event.preventDefault();
  const fields = new FormData(form), submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const answers = [...form.querySelectorAll('textarea[name^="answer."]')].map(area => ({ id: area.name.slice(7), answer: area.value }));
    if (form.dataset.cmPublicForm === 'join' || (form.dataset.cmPublicForm === 'subscribe' && event.submitter?.name === 'trial')) {
      await communityAction({ action: 'join', answers });
      portal = await api('home');
    } else if (form.dataset.cmPublicForm === 'subscribe') {
      const result = await api(`community/${encodeURIComponent(community.group.id)}`, { action: 'subscribe', planId: event.submitter?.value, answers });
      community = result.community;
      if (result.payUrl) { location.href = result.payUrl; return; }
    } else if (form.dataset.cmPublicForm === 'post') {
      await communityAction({ action: 'post', channelId: fields.get('channelId'), title: fields.get('title'), body: fields.get('body'), link: fields.get('link'),
        poll: String(fields.get('poll') || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean) });
    } else {
      await communityAction({ action: 'comment', postId: form.dataset.post, body: fields.get('body') });
    }
    draw();
  } catch (error) {
    if (error.status === 401) { community = null; if (portal) portal.signedIn = false; draw(error.message); return; }
    submit.disabled = false;
    form.querySelector('.cp-public-error')?.remove();
    form.insertAdjacentHTML('afterbegin', `<p class="cp-public-error" role="alert">${h(error.message)}</p>`);
  }
});

window.addEventListener('hashchange', () => {
  if (!readAccessLink()) return;
  course = null;
  if (portal) portal.signedIn = false;
  draw();
});

try {
  if (access !== null) {
    try {
      await api('exchange', { token: access });
      access = null;
    } catch {}
  }
  portal = await api('home');
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  const targetCommunity = query.get('comunidade') || hash.get('comunidade');
  if (targetCommunity && portal?.signedIn) {
    Object.assign(cmUi, { tab: 'discussion', channel: '', period: '30', feed: 'recent', openComments: new Set() });
    await loadCommunity(targetCommunity);
    cmUi.tab = (community?.group?.tabs || []).find(tab => tab.visible !== false)?.key || 'discussion';
  }
  const ticket = query.get('evento'), plan = query.get('plano');
  if (ticket || plan) history.replaceState(null, '', location.pathname + location.hash);
  draw(ticket === 'pago' ? 'Pagamento recebido. Seu ingresso aparece na aba Eventos da comunidade assim que o pagamento for confirmado.' : ticket === 'voltou' ? 'O pagamento do ingresso não foi concluído. Você pode tentar de novo na aba Eventos.'
    : plan === 'pago' ? 'Pagamento recebido. O acesso à comunidade é liberado assim que o pagamento for confirmado.' : plan === 'voltou' ? 'A assinatura não foi concluída. Você pode tentar de novo na página da comunidade.' : '');
  if (location.hash === '#cursos') root.querySelector('#cursos')?.scrollIntoView();
  if (location.hash.startsWith('#post-')) root.querySelector(`#${CSS.escape(location.hash.slice(1))}`)?.scrollIntoView({ block: 'center' });
} catch (error) {
  access = null;
  draw(error.message);
}
