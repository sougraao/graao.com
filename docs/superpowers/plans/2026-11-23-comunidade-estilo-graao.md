# Comunidade estilo graao + Academia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the portal community page as a three-column app in the graao style, add an owner-curated "Academia" tab (courses included for members or sold separately), and give the owner layout settings.

**Architecture:** Server modules (`community.mjs`, `community-config.mjs`, new `community-academy.mjs`) compute the view the portal receives; `client-portal.mjs` learns, through an injected `extraCourses` function, which courses a member opens through a community. The portal UI is split into focused template modules (`ui/portal-community*.js`) and its own stylesheet driven entirely by the owner's `--cm-*` theme tokens. Admin settings gain "Academia" and "Layout" sections.

**Tech Stack:** Node ESM server, vanilla JS template-string UI (no build), `node --test`, SQLite store in tests.

**Spec:** `docs/superpowers/specs/2026-11-23-comunidade-estilo-graao-design.md`

## Global Constraints

- UI source is `ui/`; `public/` is a mirror updated only with `node scripts/sync-public.mjs` (never copy `public/` → `ui/`).
- Every new top-level `ui/*.js` / `ui/*.css` served to the portal must be added to the static whitelist array in `server.mjs` (the `['/portal-community.js','text/javascript; charset=utf-8']` list, ~line 173).
- New settings merge over what a group already has (`pick` pattern in `communityConfig`); saving one section never erases another.
- Copy in pt-BR. No graao brand names, logos or "graao" text in the product.
- Keep every existing feature: polls, events/live/recordings, paid plans/trial, join questions, onboarding, moderation/report, badges, levels, private channels.
- Motion respects `prefers-reduced-motion`. Layout works at 375 px with no horizontal page scroll.
- Run the full suite with `npm test` before each commit; it must stay green.

## Review Focus

1. Old groups saved before this change (no `academy`, no `layout`, `tabs` without `academy`, theme without `onPrimary`) must render and save without errors — Task 1 and Task 3 tests cover a group object without these fields.
2. A member whose paid plan expired, who left, or was banned must lose access to "included" courses immediately (course and progress endpoints answer 404) — Task 3 test.
3. A course or offer deleted from the subaccount must disappear from every Academia without breaking the community page — Task 2 test.
4. A post submitted with an empty title must still feed moderation, workflows and newsletter with a non-empty `title` — Task 3 test.
5. Opening a course from the Academia and pressing back must return to the community's Academia tab, not to the portal home — Task 6 manual check in the browser.

---

### Task 1: Shared community data — tabs, theme token, presets, widgets

**Files:**
- Modify: `ui/community-data.js`
- Modify: `community-config.mjs:15-65` (`communityConfig`)
- Modify: `community.mjs:52` (call site passes `s`)
- Test: `test/community-settings.test.mjs`

**Interfaces:**
- Produces (in `ui/community-data.js`):
  - `communityTabKeys` now `[['discussion','Discussão'],['academy','Academia'],['events','Eventos'],['members','Membros'],['ranking','Ranking'],['about','Sobre']]`.
  - `withAcademyTab(tabs) -> tabs`: returns a copy with `{ key:'academy', label:'Academia', visible:true }` inserted right after `discussion` when missing.
  - `themeTokens` gains `['onPrimary','Texto sobre o principal']` (9 tokens). Every preset gets `onPrimary` (`#ffffff` for light presets; `#0f1220` for `meia-noite`).
  - Two new presets appended: `{ id:'grafite', name:'Grafite', tokens:{ primary:'#f4f4f5', onPrimary:'#111113', background:'#0e0f11', tertiary:'#1c1e22', font:'#ececee', sidebar:'#131417', surface:'#16181b', border:'#26292e', error:'#ff6b6b' } }` and `{ id:'noite-neon', name:'Noite neon', tokens:{ primary:'#c6f432', onPrimary:'#0b0d10', background:'#0b0d10', tertiary:'#1a1f14', font:'#eef1ea', sidebar:'#111418', surface:'#14171b', border:'#252a30', error:'#ff6b6b' } }`.
  - `widgetKeys = [['about','Sobre'],['events','Próximos eventos'],['ranking','Top do ranking'],['members','Membros recentes']]`; `defaultLayout() -> { widgets:[{key,visible:true}...], composerPrompt:'' }`.
  - `composerPromptDefault = 'Compartilhe algo com a comunidade…'`.
- Produces (in `community-config.mjs`): `communityConfig(d, prior = {}, s = null)` returns, in addition to today's fields, `layout: { widgets, composerPrompt }`. (Task 2 adds `academy`.)

- [ ] **Step 1: Write the failing tests** in `test/community-settings.test.mjs`
  - Update the first test's expectation of a fresh group's tab keys to `['discussion','academy','events','members','ranking','about']`.
  - New test `'Layout: widgets keep known keys in order, composer prompt is trimmed, old groups get defaults'`:
    ```js
    const s = blank(); const id = save(s, { name: 'Clube' });
    const g = () => s.communities.find(row => row.id === id);
    assert.deepEqual(g().layout, { widgets: [['about',true],['events',true],['ranking',true],['members',true]].map(([key, visible]) => ({ key, visible })), composerPrompt: '' });
    save(s, { layout: { widgets: [{ key: 'ranking', visible: false }, { key: 'x' }, { key: 'about' }], composerPrompt: '  Conte sua vitória da semana  ' } }, id);
    assert.deepEqual(g().layout.widgets.map(row => [row.key, row.visible]), [['ranking', false], ['about', true], ['events', true], ['members', true]]);
    assert.equal(g().layout.composerPrompt, 'Conte sua vitória da semana');
    assert.throws(() => save(s, { layout: { composerPrompt: 'x'.repeat(81) } }, id), /80/);
    assert.equal(g().name, 'Clube');
    ```
  - New test `'Themes: onPrimary token, dark presets and withAcademyTab'`:
    ```js
    const s = blank(); const id = save(s, { name: 'Clube', theme: { preset: 'noite-neon' } });
    assert.equal(s.communities.find(r => r.id === id).theme.tokens.onPrimary, '#0b0d10');
    // a custom theme saved before onPrimary existed still validates
    save(s, { theme: { preset: 'custom', tokens: { primary: '#123456', background: '#ffffff', tertiary: '#eeeeee', font: '#111111', sidebar: '#ffffff', surface: '#ffffff', border: '#dddddd', error: '#cc0000' } } }, id);
    assert.equal(s.communities.find(r => r.id === id).theme.tokens.onPrimary, '#ffffff');
    assert.deepEqual(withAcademyTab([{ key: 'about', label: 'Sobre' }, { key: 'discussion', label: 'Feed' }]).map(r => r.key), ['about', 'discussion', 'academy']);
    ```
  - Import `withAcademyTab` from `../ui/community-data.js`.

- [ ] **Step 2: Run to see them fail**
  Run: `node --test test/community-settings.test.mjs`
  Expected: FAIL (`layout` undefined, tab list mismatch, `withAcademyTab` not exported).

- [ ] **Step 3: Implement** the Interfaces above. In `communityConfig`, validate `layout` like `tabs`: keep known widget keys in the given order, append missing ones visible, drop unknown; `composerPrompt` via `str(..., 80)` but fail with `'O convite para publicar tem até 80 caracteres.'` when the trimmed input is longer than 80. Change the call in `community.mjs` to `communityConfig(d, prior || {}, s)`.

- [ ] **Step 4: Run tests**
  Run: `node --test test/community-settings.test.mjs` → PASS; then `npm test` → all PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add ui/community-data.js community-config.mjs community.mjs test/community-settings.test.mjs docs/superpowers
  git commit -m "feat(comunidade): layout, aba Academia e temas escuros nos dados da comunidade"
  ```

### Task 2: Academia model — validation, view, included courses, cascade delete

**Files:**
- Create: `community-academy.mjs`
- Modify: `community-config.mjs` (`communityConfig` returns `academy`)
- Modify: `model.mjs:~877` (call `academyBeforeDelete(s, key, id)` next to `offerBeforeDelete`)
- Test: `test/community-academy.test.mjs` (new)

**Interfaces:**
- Consumes: `hasAccess(group, row)` from `community-config.mjs`; `memberCourseCard(s, course, member)` from `course-model.mjs`.
- Produces (all exported from `community-academy.mjs`):
  - `academyConfig(s, input, prior) -> { courses: [{ courseId, mode: 'included'|'separate', offerId }] }` — input `undefined` keeps `prior` (or `{ courses: [] }`); max 30 courses (`'A Academia tem até 30 cursos.'`); unknown course → `'Curso da Academia não encontrado.'`; duplicates dropped; `mode` defaults to `'included'`; `offerId` only kept for `separate`, must exist in `s.offers` and contain the course (`'A oferta escolhida não inclui o curso.'`); `''` allowed. When `s` is null (no state), returns `prior` unchanged.
  - `academyOfferFor(s, entry) -> offer|null` — the chosen offer when `status === 'published'`, else the first published offer whose `courseIds` include the course.
  - `academyView(s, group, member, { workspace, allowed }) -> Array<{ id, name, description, cover, progress, mode, state: 'open'|'join'|'buy'|'unavailable', offerUrl, priceLabel }>` — only active courses; `state` is `'open'` when (`included` and `allowed`) or `member.courseIds` includes it; `'join'` for included without access; `'buy'` for separate with an offer (`offerUrl = /oferta/${workspace}/${offer.id}`, `priceLabel = offer.priceLabel || ('Gratuito' | BRL price)`); otherwise `'unavailable'`. `progress` comes from `memberCourseCard`.
  - `includedCourseIds(s, doc, memberId) -> string[]` — for every active group with an academy where `hasAccess(group, doc.groups[group.id]?.members[memberId])`, the active included course ids (deduplicated).
  - `academyBeforeDelete(s, key, id)` — on `courses` removes entries with that course from every group's academy; on `offers` clears matching `offerId`.
- `communityConfig(d, prior, s)` adds `academy: academyConfig(s, d.academy, prior.academy)`.

- [ ] **Step 1: Write the failing tests** in `test/community-academy.test.mjs` using `blank()`/`execute()` (create two courses with `execute(s, { type:'save', key:'courses', data:{ name:'Curso A', ... } })` following `test/courses.test.mjs`, one published offer containing course B via `key:'offers'` following `test/offers.test.mjs`):
  - `'Academy settings validate courses, modes and offers'`: saving `academy: { courses: [{ courseId:A }, { courseId:B, mode:'separate', offerId:offer }, { courseId:A }] }` stores 2 entries, A `included` with `offerId:''`; unknown course throws `/não encontrado/`; 31 entries throw `/30/`; an offer without the course throws `/não inclui/`; saving `{ name:'Outro' }` later keeps the academy.
  - `'Academy view gives open, join, buy and unavailable states'`: with a member `{ id:'m1', courseIds:[] }` → A `join` when `allowed:false`, `open` when `allowed:true`; B `buy` with `offerUrl === '/oferta/demo/<offer>'`; after unpublishing the offer, B `unavailable`; with `courseIds:[B]`, B `open`.
  - `'includedCourseIds respects access and deletes cascade'`: doc `{ groups: { [g]: { members: { m1: { status:'active', joinedAt:'2026-01-01T00:00:00Z' } }, posts: [] } } }` → `[A]`; status `'banned'` → `[]`; paid group with `paidUntil` in the past → `[]`; `execute(s,{type:'delete',key:'courses',id:A})` removes A from the academy; deleting the offer clears B's `offerId`.

- [ ] **Step 2: Run to see them fail**
  Run: `node --test test/community-academy.test.mjs` → FAIL (module missing).

- [ ] **Step 3: Implement** `community-academy.mjs` per Interfaces; wire `communityConfig` and `model.mjs`.

- [ ] **Step 4: Run tests**
  Run: `node --test test/community-academy.test.mjs` → PASS; `npm test` → all PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add community-academy.mjs community-config.mjs model.mjs test/community-academy.test.mjs
  git commit -m "feat(comunidade): modelo da Academia com cursos inclusos ou vendidos à parte"
  ```

### Task 3: Server — community view, optional title, course access through communities

**Files:**
- Modify: `community.mjs` (`groupHeader`, `memberView`, `read`, `writePost`, post view ~line 136, new `includedCourses`)
- Modify: `client-portal.mjs` (`makeClientPortal` option, `grantedCourse`, `content`, `progress`)
- Modify: `server.mjs:386` (pass `extraCourses`)
- Test: `test/communities.test.mjs`

**Interfaces:**
- Consumes: Task 1 `withAcademyTab`, `defaultLayout`; Task 2 `academyView`, `includedCourseIds`.
- Produces:
  - Community view (`/api/client-portal/:ws/community/:id`): `group.tabs` = `withAcademyTab(group.tabs || defaultTabs())` with the academy entry forced `visible:false` when the academy has no courses; `group.layout` = stored layout or `defaultLayout()`; `view.academy` = `academyView(...)` (present for visitors too, with `allowed:false`); each post gains `titleAuto: boolean`.
  - `community.includedCourses(workspace, state, memberId) -> Promise<string[]>`.
  - `makeClientPortal({ ..., extraCourses = null })` where `extraCourses(workspace, state, memberId) -> Promise<string[]>`; `grantedCourse(state, member, courseId, extra = [])` accepts a course in `member.courseIds` or `extra`.
  - `content()` "Meus cursos" lists `member.courseIds ∪ extra` (active courses, deduplicated).
- `writePost`: when the trimmed title is empty, `title` = first non-empty line of the body, cut to 80 chars, and `titleAuto: true` stored on the post. Body still required.

- [ ] **Step 1: Write the failing test** in `test/communities.test.mjs`, new test `'Academy courses open for members with access; posts may omit the title'` (same server harness as the existing test): create course A (included) and B (separate) and a group with `academy`; member ana joins:
  - `GET ${portal}/course/${A}` → 200 for ana after joining; before joining → 404.
  - `GET ${portal}/course/${B}` → 404 for ana.
  - `GET ${portal}/home` lists A in `courses`.
  - community view: `academy.map(r => [r.id, r.state])` deep-equals `[[A,'open'],[B,'buy' or 'unavailable']]`; `group.tabs.find(t => t.key === 'academy').visible === true`; a group without academy courses has it `false`.
  - `act(open, { action:'post', body:'Primeira linha\nresto' })` → 200, post `title === 'Primeira linha'`, `titleAuto === true`.
  - after `act(..., { action:'leave' })`, `GET course/A` → 404 and `POST progress/A` → 404.

- [ ] **Step 2: Run to see it fail**
  Run: `node --test test/communities.test.mjs` → FAIL.

- [ ] **Step 3: Implement** per Interfaces. In `progress()`, resolve the member from the token before `store.change` to compute `extra`, then pass it into `grantedCourse` inside the change. In `server.mjs`, pass `extraCourses: (ws, st, id) => community.includedCourses(ws, st, id)` (closure — `community` is created later in the same function).

- [ ] **Step 4: Run tests** — `node --test test/communities.test.mjs test/client-portal.test.mjs` → PASS; `npm test` → all PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add community.mjs client-portal.mjs server.mjs test/communities.test.mjs
  git commit -m "feat(comunidade): Academia libera cursos inclusos e publicação sem título"
  ```

### Task 4: Portal UI shell — three columns, visitor hero, widgets, restyled tabs

**Files:**
- Modify: `ui/portal-community.js` (page shell, sidebar, hero, widgets, events/members/ranking/about, empty states)
- Create: `ui/portal-community.css` (all community styles; delete the community rules from `ui/client-portal.css` lines ~173-325 except course/player rules that the community does not own)
- Modify: `ui/client-portal.html` (add `<link rel="stylesheet" href="/portal-community.css">`), `server.mjs` whitelist (`/portal-community.css`)
- Test: `test/portal-community-ui.test.mjs` (new)

**Interfaces:**
- Consumes: Task 3 view shape (`group.tabs`, `group.layout`, `academy`, `events`, `leaderboard`, `members`).
- Produces: `communityPage(view, ui) -> string` (same signature); `sideWidgets(view, tabs) -> string`; markup contract used by Tasks 5-6: sidebar `nav.cp-cm-nav` with `button[data-cm-public="tab"]` and channel buttons `[data-cm-public="channel"]`; main column `.cp-cm-main`; aside `.cp-cm-aside`. Tab body renderers for `discussion` and `academy` are imported from Tasks 5/6 modules (`feedTab(view, ui)`, `academyTab(view)`); until those exist, keep the current discussion body.
- Layout rules: grid `260px minmax(0,1fr) 300px` on ≥1100px; `220px 1fr` with aside below main on 760-1099px; one column ≤759px with the sidebar turned into a horizontal scrolling nav and channels as chips. The page always carries `cm-themed` with `themeStyle(group.theme)` (default preset when absent). Primary buttons: `background:var(--cm-primary); color:var(--cm-onPrimary)`; join button never stretches (`justify-self:start`, auto width).
- Visual language (from graao): cards radius 18px, 1px `--cm-border`, surface `--cm-surface`; pill buttons and pill segmented filters; avatar circles with initials and a hue from the name; 150-200ms transitions on hover/focus; empty state = icon in a 44px circle, title, one line, one action.
- Widgets: render only keys in `group.layout.widgets` with `visible`, in that order, and only when their tab is visible and data exists (events: next 3 upcoming; ranking: `leaderboard.top` first 5 with "Ver tudo" → `data-cm-public="tab" data-value="ranking"`; members: 8 most recent by `joinedAt` + "+N"; about: description + member/post counts). No widget → no aside column.
- Visitor (no active membership): hero card at the top of the main column with cover (or a theme-colored band), description, up to 5 member avatars and the join control (existing `joinButton`/`joinPanel` logic).

- [ ] **Step 1: Write the failing tests** `test/portal-community-ui.test.mjs` importing `communityPage` from `../ui/portal-community.js` with a hand-built view (group with 2 channels, layout, tabs, 3 posts, 1 upcoming event, leaderboard top, members, membership active):
  - `'aside shows only visible widgets in the chosen order'`: layout `[ranking, about(visible:false), events, members]` → the order of `data-widget="..."` attributes in the HTML is `ranking, events, members`.
  - `'aside disappears with no widgets and hidden tabs drop their widget'`: all widgets hidden → no `cp-cm-aside`; ranking tab `visible:false` → no `data-widget="ranking"`.
  - `'visitor sees the hero and a non-stretched join button'`: `membership:null` → HTML contains `cp-cm-hero` and `data-cm-public="join"`.
  - `'academy tab hidden when not visible'`: tabs with academy `visible:false` → no `data-value="academy"`.

- [ ] **Step 2: Run to see them fail** — `node --test test/portal-community-ui.test.mjs` → FAIL.

- [ ] **Step 3: Implement** the shell, CSS file, html link and whitelist entry.

- [ ] **Step 4: Run tests** — the new file → PASS; `npm test` → all PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add ui/portal-community.js ui/portal-community.css ui/client-portal.css ui/client-portal.html server.mjs test/portal-community-ui.test.mjs
  git commit -m "feat(portal): comunidade em três colunas no estilo graao"
  ```

### Task 5: Feed — open composer, filters, post cards

**Files:**
- Create: `ui/portal-community-feed.js`
- Modify: `ui/portal-community.js` (use `feedTab`), `ui/portal-page.js` (handlers), `ui/portal-community.css`, `server.mjs` whitelist (`/portal-community-feed.js`)
- Test: `test/portal-community-ui.test.mjs`

**Interfaces:**
- Produces (from `ui/portal-community-feed.js`):
  - `filterFeed(posts, filter: 'recent'|'hot'|'mine', now = Date.now()) -> posts` — `recent`: pinned first, then by `created` desc (server order otherwise kept); `hot`: posts created in the last 30 days, sorted by `likes + comments.length` desc, ties by `created` desc, pinned not forced; `mine`: `post.mine`.
  - `relativeTime(iso, now = Date.now()) -> string` — `'agora'` (<1 min), `'5 min'`, `'3 h'`, `'2 d'`, then `dd mmm` via `Intl` pt-BR.
  - `feedTab(view, ui) -> string` — onboarding card, welcome note, composer, filter pills (`data-cm-public="feed" data-value="recent|hot|mine"`, `aria-pressed`), cards or empty state.
- Composer: always-visible card (avatar + `textarea name="body"` with placeholder `group.layout.composerPrompt || composerPromptDefault`, counter `0/10000`); a `.cp-cm-composer-more` block (title optional, channel select, link, poll) hidden until the textarea gets focus or has text (CSS `:focus-within` plus a `data-open` attribute set by `portal-page.js` on input). Shown only when today's rule allows posting.
- Post card: header (avatar, name, badge/staff tag, `#canal · relativeTime`), `h3` only when `!post.titleAuto`, body, image, link, poll, footer buttons `Curtir N` (`data-cm-public="like"`), `Comentar` (`data-cm-public="comment-focus"`), `Compartilhar` (`data-cm-public="share"`), and a `⋯` menu (`<details class="cp-cm-menu">`) holding Excluir/Denunciar with the existing data attributes. Comments: last 2 shown; `Ver todos os N comentários` (`data-cm-public="comments-all" data-post`) when more; `ui.openComments` (a Set of post ids) shows all. Each card has `id="post-<id>"`.
- `portal-page.js`: `cmUi.feed` (default `'recent'`), `cmUi.openComments = new Set()`; handlers: `feed` (set filter), `comments-all` (add id, redraw), `comment-focus` (focus that post's comment input), `share` (copy `location.origin + location.pathname + '?comunidade=<groupId>#post-<id>'` with `navigator.clipboard.writeText`, then show "Link copiado" status text in the button for 2 s); post form sends the optional title; after load, scroll to `location.hash` `#post-…` when present.

- [ ] **Step 1: Write the failing tests** (append to `test/portal-community-ui.test.mjs`):
  - `'filterFeed orders recent, hot and mine'`: posts p1 (pinned, old), p2 (5 likes, 2 comments, 2 days ago), p3 (1 like, today, mine), p4 (50 likes, 40 days ago) → `recent` ids `[p1,p3,p2,p4]`; `hot` `[p2,p3,p1]` (p4 excluded; p1 only if within 30 days — build p1 at 10 days); `mine` `[p3]`.
  - `'relativeTime'`: now-30s → `'agora'`; now-5min → `'5 min'`; now-3h → `'3 h'`; now-2d → `'2 d'`.
  - `'cards hide auto titles and collapse comments'`: post `titleAuto:true` → no `<h3>`; post with 4 comments → 2 `<li>` in `.cp-comments` and text `Ver todos os 4 comentários`; with `ui.openComments` containing it → 4 `<li>`.
  - `'composer uses the owner prompt'`: layout `composerPrompt:'Conte sua vitória'` → `placeholder="Conte sua vitória"`.

- [ ] **Step 2: Run to see them fail** — FAIL.
- [ ] **Step 3: Implement** module, handlers, CSS, whitelist.
- [ ] **Step 4: Run tests** — PASS; `npm test` → all PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add ui/portal-community-feed.js ui/portal-community.js ui/portal-page.js ui/portal-community.css server.mjs test/portal-community-ui.test.mjs
  git commit -m "feat(portal): feed da comunidade com publicar aberto, filtros e cartões novos"
  ```

### Task 6: Academia tab in the portal

**Files:**
- Create: `ui/portal-community-academy.js`
- Modify: `ui/portal-community.js` (route `academy` tab), `ui/portal-page.js` (open course / back), `ui/portal-community.css`, `server.mjs` whitelist (`/portal-community-academy.js`)
- Test: `test/portal-community-ui.test.mjs`

**Interfaces:**
- Consumes: `view.academy` (Task 2/3 shape).
- Produces: `academyTab(view) -> string` — grid of cards (cover or theme band with book icon, name, description clamped to 2 lines, progress bar + `done de total aulas` when `state==='open'`, tag `Incluso` for included / `priceLabel` for separate). Action per state: `open` → `button data-cm-public="course" data-course="<id>"` with `Começar`/`Continuar`/`Rever curso` (same rule as `startLabel` in `portal-page.js`); `join` → text `Entre na comunidade para assistir` + lock icon; `buy` → `<a href="offerUrl" target="_blank" rel="noopener">Quero acesso</a>`; `unavailable` → `Indisponível no momento`. Empty academy → empty state.
- `portal-page.js`: module variable `cmReturn = ''`. Handler `course` (cmPublic): `cmReturn = community.group.id; await openCourse(id); community = null; courseView = course.page?.productPage === false ? 'lesson' : 'page'`. In the `back` action: when `cmReturn`, `course = null; await loadCommunity(cmReturn); cmUi.tab = 'academy'; cmReturn = ''` instead of going home. The player/course-page back label reads `Academia` when `cmReturn` is set. `logout` clears `cmReturn`.

- [ ] **Step 1: Write the failing test** `'academy cards show the action for each state'`: academy rows `open` (progress 3/10), `join`, `buy` (offerUrl `/oferta/demo/o1`, priceLabel `R$ 97,00`), `unavailable` → HTML contains `data-cm-public="course" data-course="c1"`, `Continuar`, `Entre na comunidade para assistir`, `href="/oferta/demo/o1"`, `R$ 97,00`, `Indisponível no momento`.
- [ ] **Step 2: Run to see it fail** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests** — PASS; `npm test` → all PASS.
- [ ] **Step 5: Commit**
  ```bash
  git add ui/portal-community-academy.js ui/portal-community.js ui/portal-page.js ui/portal-community.css server.mjs test/portal-community-ui.test.mjs
  git commit -m "feat(portal): aba Academia na comunidade"
  ```

### Task 7: Admin settings — Academia and Layout sections

**Files:**
- Modify: `ui/community-admin.js` (`settingsSections(group, { courses, offers })`, `readSettings`, preview, tab list via `withAcademyTab`)
- Modify: `ui/communities.js:71` (pass `{ courses: c.s.courses, offers: c.s.offers }`) and its `data-cm` click handler for academy rows (add/remove/up/down reuse `row-add`/`row-remove`/`row-up`/`row-down`)
- Modify: `ui/communities.css` (rows)

**Interfaces:**
- Consumes: Task 1 `widgetKeys`, `withAcademyTab`, new presets/token; Task 2 academy shape.
- Produces:
  - Nav gains `['ca-academy','Academia']` and `['ca-layout','Layout']`.
  - "Academia" section: `ol[data-ca-list="academy"]` rows with `select name="academy.courseId"` (active courses), `select name="academy.mode"` (`included` → "Incluso para membros", `separate` → "Vendido à parte"), `select name="academy.offerId"` (`''` → "Oferta automática", then offers whose `courseIds` include the selected course; enabled only for `separate`), move up/down and remove; "Adicionar curso" button; hint: "Inclusos abrem para quem é membro com acesso em dia. À parte mostram o botão Quero acesso, que leva à oferta."
  - "Layout" section: `input name="layout.composerPrompt" maxlength="80"` with placeholder `composerPromptDefault`; `ol[data-ca-list="widgets"]` rows (`widget.key` hidden, label, `widget.visible` checkbox, up/down).
  - `readSettings(form)` adds `academy: { courses: [{ courseId, mode, offerId }] }` and `layout: { composerPrompt, widgets: [{ key, visible }] }`.
  - Preview (`.ca-preview`) redrawn as a miniature three-column layout (side nav, a post card with a primary pill button using `--cm-onPrimary`, an aside block).

- [ ] **Step 1: Implement** the sections, read and preview; keep `rowTemplates` style for the new rows.
- [ ] **Step 2: Verify in the browser** (dev server, Task 8 Step 1): open Comunidades → a group → Configurações; add 2 courses (one each mode), pick an offer, hide "Top do ranking", set a composer prompt, choose "Noite neon"; save; reload the page; every value is still there and the portal reflects it.
- [ ] **Step 3: Run** `npm test` → all PASS.
- [ ] **Step 4: Commit**
  ```bash
  git add ui/community-admin.js ui/communities.js ui/communities.css
  git commit -m "feat(comunidades): configurações de Academia e layout para o dono"
  ```

### Task 8: Mirror, browser verification, finish

**Files:**
- Create (if missing): `.claude/launch.json` with `{ "name": "graao", "runtimeExecutable": "npm", "runtimeArgs": ["start"], "port": 4317 }`
- Modify: `public/*` via `node scripts/sync-public.mjs`

- [ ] **Step 1: Start the dev server** with the preview tool (`preview_start {name:'graao'}`) and open the community of a test subaccount at `/portal/<workspace>?comunidade=<id>` (sign in as staff with "Entrar como equipe / administrador").
- [ ] **Step 2: Check, desktop 1440 px:** visitor hero and join; after joining: feed with composer (expand on focus, publish without title), filters, like/comment/share, "⋯" menu, comments collapse; Academia (open course → back returns to Academia; locked/buy states); Events/Members/Ranking/About in the new style; widgets order follows settings; no console errors.
- [ ] **Step 3: Check 375 px** (`resize_window` mobile) and a dark preset ("Noite neon"): nav scrolls horizontally, channels as chips, aside below feed, no horizontal page scroll, button text readable.
- [ ] **Step 4: Mirror** — `node scripts/sync-public.mjs` then `node scripts/sync-public.mjs --check` → exit 0.
- [ ] **Step 5: Full suite** — `npm test` → all PASS.
- [ ] **Step 6: Commit**
  ```bash
  git add public .claude/launch.json
  git commit -m "chore(portal): espelha a nova comunidade em public/"
  ```
