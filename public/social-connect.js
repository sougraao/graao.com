import { brandHighlight, brandIcon, shcLayers } from './icons.js';
import { network, networks } from './social-data.js';

try {
  const saved = localStorage.getItem('graao.theme');
  const dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
} catch {}

const token = location.hash.slice(1);
const workspace = location.pathname.split('/')[2];
const get = id => document.getElementById(id);
const show = message => { get('notice').textContent = message; };
const api = async (action, data = {}) => {
  const r = await fetch(`/api/social/invited?workspace=${encodeURIComponent(workspace)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, token, ...data })
  });
  const result = await r.json();
  if (!r.ok) throw Error(result.error || 'Não foi possível validar o convite.');
  return result;
};
let popup, requestId;
const connected = ({ connected }) => show(connected === 1 ? 'Conta conectada.' : `${connected} contas conectadas.`);

get('networks').addEventListener('click', async ev => {
  const id = ev.target.closest('[data-provider]')?.dataset.provider;
  if (!id) return;
  get('accounts').hidden = true;
  get('bluesky').hidden = id !== 'bluesky';
  if (id === 'bluesky') { get('bluesky').elements.identifier.focus(); return; }
  popup = window.open('about:blank', '_blank', 'width=620,height=760');
  try {
    if (!popup) throw Error('Permita pop-ups para conectar esta rede.');
    const { url } = await api('start', { provider: id });
    popup.location.replace(url);
  } catch (e) { popup?.close(); show(e.message); }
});

window.addEventListener('message', async ev => {
  if (ev.origin !== location.origin || ev.source !== popup || ev.data?.type !== 'graao-social') return;
  try {
    if (ev.data.error) throw Error(ev.data.error);
    requestId = ev.data.requestId;
    const { candidates } = await api('candidates', { requestId });
    get('accounts').querySelector('.sp-picks').replaceChildren(...candidates.map(c => {
      const label = document.createElement('label'), input = document.createElement('input');
      label.className = 'sp-pick';
      input.type = 'checkbox'; input.name = 'picked'; input.value = c.index;
      input.checked = candidates.length === 1;
      label.append(input, `${c.name} · ${network(c.provider)?.name || ''}`);
      return label;
    }));
    get('accounts').hidden = !candidates.length;
    show(candidates.length ? 'Selecione quais contas deseja autorizar.' : 'As contas autorizadas já estão conectadas.');
  } catch (e) { show(e.message); }
});

for (const id of ['bluesky', 'accounts']) {
  get(id).addEventListener('submit', async ev => {
    ev.preventDefault();
    const form = ev.currentTarget, submit = form.querySelector('button');
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      const result = id === 'bluesky'
        ? await api('bluesky', { identifier: form.elements.identifier.value, password: form.elements.password.value })
        : await api('attach', { requestId, picks: new FormData(form).getAll('picked').map(Number) });
      connected(result); form.reset(); form.hidden = true;
    } catch (e) { show(e.message); }
    finally { if (form.elements.password) form.elements.password.value = ''; submit.disabled = false; }
  });
}

try {
  const { expires, providers } = await api('info');
  get('expiry').textContent = `Válido até ${new Date(expires).toLocaleString('pt-BR')}`;
  const available = networks.filter(n => providers[n.id]);
  get('networks').replaceChildren(...available.map(n => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sp-net shc-card';
    button.dataset.provider = n.id;
    button.style.setProperty('--shc-highlight', brandHighlight(n.id));
    button.innerHTML = `${shcLayers()}<span class="shc-icon" aria-hidden="true">${brandIcon(n.id, 34)}</span><b></b><span class="sp-net-foot"><span class="sp-net-cta">+ Conectar</span></span>`;
    button.querySelector('b').textContent = n.name;
    return button;
  }));
  show(available.length ? 'Escolha uma rede para começar.' : 'Nenhuma rede está disponível neste momento.');
} catch (e) { show(e.message); }
