// Public page a client opens from the approval link (/aprovar/<workspace>#token): lists the posts in
// review and records "approve" or "request changes" with the reviewer's name. All text goes through
// textContent; the token stays in the fragment so it never reaches server logs or referrers.
try {
  const saved = localStorage.getItem('graao.theme');
  const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
} catch {}

const token = location.hash.slice(1);
const workspace = location.pathname.split('/')[2];
const get = id => document.getElementById(id);
const show = message => { get('notice').textContent = message; };
const el = (tag, props = {}, ...children) => { const node = Object.assign(document.createElement(tag), props); node.append(...children.filter(x => x !== null && x !== undefined && x !== '')); return node; };
const typeLabel = { post: 'Post', story: 'Story', reel: 'Reel / vídeo curto' };
let zone = 'America/Sao_Paulo';
const when = iso => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short', timeZone: zone }).format(new Date(iso));

const reviewer = get('reviewer');
try { reviewer.value = localStorage.getItem('graao.approver') || ''; } catch {}
reviewer.addEventListener('change', () => { try { localStorage.setItem('graao.approver', reviewer.value.trim()); } catch {} });

const api = async (action, data = {}) => {
  const r = await fetch(`/api/social/approval?workspace=${encodeURIComponent(workspace)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token, ...data })
  });
  const result = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(result.error || 'Não foi possível abrir o link de aprovação.');
  return result;
};

function card(post) {
  const media = post.media.length ? el('div', { className: `sp-pv-media n${Math.min(post.media.length, 4)}` }, ...post.media.slice(0, 4).map(m => m.type === 'video'
    ? (/^https:/.test(m.src) ? el('video', { src: m.src, controls: true, preload: 'metadata', className: 'sp-approve-video' }) : el('div', { className: 'sp-pv-vid', textContent: 'Vídeo' }))
    : el('img', { src: m.src, alt: '', loading: 'lazy', referrerPolicy: 'no-referrer' }))) : null;
  const accounts = el('p', { className: 'sp-approve-accounts' }, ...post.accounts.map(a => el('span', { className: 'badge', textContent: `${a.network} · ${a.name}` })));
  const variants = post.overrides.length ? el('details', {}, el('summary', { textContent: 'Texto adaptado por rede' }),
    ...post.overrides.map(o => el('div', { className: 'sp-approve-variant' }, el('b', { textContent: o.network }), el('p', { className: 'pre-wrap', textContent: o.text })))) : null;
  const note = el('textarea', { rows: 2, maxLength: 1000, placeholder: 'Comentário para a equipe (obrigatório para pedir ajustes)' });
  const status = el('p', { className: 'form-status' });
  status.setAttribute('role', 'alert');
  const decide = decision => async ev => {
    const button = ev.currentTarget;
    status.textContent = '';
    if (!reviewer.value.trim()) { reviewer.focus(); status.textContent = 'Informe seu nome no topo da página.'; return; }
    if (decision === 'rejected' && !note.value.trim()) { note.focus(); status.textContent = 'Conte o que precisa mudar neste post.'; return; }
    for (const b of article.querySelectorAll('button')) b.disabled = true;
    try {
      try { localStorage.setItem('graao.approver', reviewer.value.trim()); } catch {}
      render(await api('decide', { postId: post.id, decision, note: note.value, name: reviewer.value }));
      show(decision === 'approved' ? 'Post aprovado. Obrigado!' : 'Pedido de ajuste enviado para a equipe.');
    } catch (e) { status.textContent = e.message; for (const b of article.querySelectorAll('button')) b.disabled = false; button.focus(); }
  };
  const approve = el('button', { type: 'button', className: 'primary', textContent: 'Aprovar' });
  const reject = el('button', { type: 'button', className: 'secondary', textContent: 'Pedir ajustes' });
  approve.addEventListener('click', decide('approved'));
  reject.addEventListener('click', decide('rejected'));
  const article = el('article', { className: 'surface sp-approve-card' },
    el('header', {}, el('b', { textContent: typeLabel[post.type] || 'Post' }), el('span', { className: 'dim', textContent: post.scheduleDate ? `Publicação prevista: ${when(post.scheduleDate)}` : 'Sem data definida' })),
    accounts, media, el('p', { className: 'sp-pv-text pre-wrap', textContent: post.summary || '(sem texto)' }), variants,
    post.link ? el('p', { className: 'sp-pv-link', textContent: post.link }) : null,
    post.firstComment ? el('p', { className: 'dim' }, el('b', { textContent: 'Primeiro comentário: ' }), post.firstComment) : null,
    el('label', {}, 'Comentário', note), status, el('footer', { className: 'sp-foot' }, el('span', { className: 'spacer' }), reject, approve));
  return article;
}

function render({ brand, expires, posts, reviewed, zone: tz }) {
  zone = tz || zone;
  if (brand) get('brand').textContent = `${brand} / Aprovação de posts`;
  get('expiry').textContent = `Link válido até ${new Date(expires).toLocaleString('pt-BR')}`;
  get('posts').replaceChildren(...posts.map(card));
  if (!posts.length) show('Nenhum post aguardando aprovação agora. Quando a equipe enviar novos posts, eles aparecem aqui.');
  else show(posts.length === 1 ? '1 post aguardando aprovação.' : `${posts.length} posts aguardando aprovação.`);
  get('reviewed').hidden = !reviewed.length;
  get('reviewed').querySelector('ul').replaceChildren(...reviewed.map(r => el('li', {},
    el('span', { className: `badge ${r.approval === 'approved' ? 'green' : 'amber'}`, textContent: r.approval === 'approved' ? 'Aprovado' : 'Ajustes pedidos' }),
    ` ${r.summary || '(sem texto)'} — ${r.by}`, r.note ? el('small', { className: 'dim', textContent: ` · “${r.note}”` }) : null)));
}

try {
  if (!/^[a-f0-9]{64}$/.test(token)) throw Error('Link de aprovação incompleto. Abra o link exatamente como foi enviado.');
  render(await api('list'));
} catch (e) { show(e.message); }
