// Para onde vai quem envia um formulário ou agenda um horário: mensagem, endereço, página de um funil ou agenda.
// Também decide se a resposta é de um lead qualificado (só esse conta como Lead no pixel).
import { createHash } from 'node:crypto';

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit = 240) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const actions = ['message', 'redirect', 'page', 'booking', 'default'];
const choiceTypes = ['select', 'radio', 'multiselect', 'checkbox', 'custom'];

/** A destination coming from the screen. `message` and `default` need nothing else. */
export function validDestination(s, raw, label = 'Destino') {
  const action = actions.includes(raw?.action) ? raw.action : 'message';
  const url = str(raw?.url, 600);
  if (url && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(url)) fail('Use um endereço que comece com https://');
  const dest = { action, message: str(raw?.message, 600), url, siteId: '', page: '', serviceId: '' };
  if (action === 'redirect' && !url) fail(`${label}: informe o endereço.`);
  if (action === 'page') {
    const project = (s.studioProjects || []).find(p => p.id === raw.siteId);
    if (!project) fail(`${label}: escolha uma página de um funil ou site.`);
    Object.assign(dest, { siteId: project.id, page: str(raw.page, 60) || 'index' });
  }
  if (action === 'booking') {
    const service = (s.services || []).find(x => x.id === raw.serviceId);
    if (!service) fail(`${label}: escolha o serviço da agenda.`);
    dest.serviceId = service.id;
  }
  return dest;
}

/** The rules of a form. Rules about questions, answers or tiers that no longer exist are dropped. */
export function validRoutes(s, input, { fields = [], kind = 'form', tiers = [] }) {
  if (!Array.isArray(input)) fail('Regras de destino inválidas.');
  if (input.length > 30) fail('Use até 30 regras de destino.');
  return input.flatMap(raw => {
    const when = raw?.when === 'tier' ? 'tier' : 'answer';
    const row = { when, disqualify: Boolean(raw?.disqualify), tag: str(raw?.tag, 48) };
    if (when === 'tier') {
      if (kind !== 'quiz' || !tiers.some(tier => tier.name === raw.tier)) return [];
      row.tier = raw.tier;
    } else {
      const field = fields.find(item => item.id === raw?.fieldId && choiceTypes.includes(item.type));
      if (!field?.options?.includes(raw.option)) return [];
      Object.assign(row, { fieldId: field.id, option: raw.option });
    }
    row.dest = validDestination(s, raw.dest, 'Regra de destino');
    if (row.disqualify && row.dest.action === 'default') fail('Escolha para onde vai o lead desqualificado: ele não pode seguir o destino padrão.');
    return [row];
  });
}

const defaultDest = form => ({ action: 'message', message: '', url: '', siteId: '', page: '', serviceId: '', ...(form.onSubmit || {}) });

/** What happens with one set of answers: qualified or not, the tags of every matching rule and the destination. */
export function outcomeOf(form, read) {
  const matched = (form.routes || []).filter(rule => {
    if (rule.when === 'tier') return Boolean(read.result) && read.result.tier === rule.tier;
    const value = read.values[form.fields?.find(field => field.id === rule.fieldId)?.key];
    return Array.isArray(value) ? value.includes(rule.option) : value === rule.option;
  });
  const out = matched.find(rule => rule.disqualify);
  // A disqualified lead follows the rule that disqualified it, whatever the order of the list.
  const chosen = out || matched.find(rule => rule.dest.action !== 'default');
  return { qualified: !out, tags: [...new Set(matched.map(rule => rule.tag).filter(Boolean))], dest: chosen ? chosen.dest : defaultDest(form) };
}

/** The address of a destination; null when the visitor should see the message (also when the target is off or not published). */
export function resolveDestination(s, workspace, dest, { link = '', event = '' } = {}) {
  if (dest?.action === 'redirect' && dest.url) return { href: dest.url, external: true };
  const go = (path, params) => {
    const query = new URLSearchParams(Object.entries({ ...params, link, graao_ev: event }).filter(([, v]) => v)).toString();
    return { href: query ? `${path}?${query}` : path, external: false };
  };
  if (dest?.action === 'page') {
    const project = (s.studioProjects || []).find(p => p.id === dest.siteId);
    if (!project?.publishedAt || !(project.pages || []).some(p => p.slug === dest.page)) return null;
    return go(`/s/${workspace}/${project.id}${dest.page === 'index' ? '' : `/${dest.page}`}`, {});
  }
  if (dest?.action === 'booking') {
    if (!s.scheduling?.enabled || !(s.services || []).some(x => x.id === dest.serviceId && x.active)) return null;
    return go(`/agendar/${workspace}`, { servico: dest.serviceId });
  }
  return null;
}

const hashOf = text => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

// ---- A short page that leaves to another address ---------------------------------------------------
// Used inside frames (the whole window must change) and before an external address, so the pixel has time to fire.
const leaveScript = `(()=>{const a=document.getElementById('go');setTimeout(()=>{try{window.top.location.href=a.href}catch(e){}},Number(a.dataset.wait)||0)})()`;
export const leaveCsp = ancestors => `default-src 'none'; style-src 'unsafe-inline'; script-src ${hashOf(leaveScript)}; base-uri 'none'; frame-ancestors ${ancestors}`;
export function leavePage({ href, event = '', wait = 0 }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Redirecionando</title>${event ? `<meta name="graao-event" content="${esc(event)}">` : ''}
<style>body{margin:0;min-height:160px;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;color:#475467}a{color:inherit}</style></head><body><p>Redirecionando… <a id="go" target="_top" data-wait="${Number(wait) || 0}" href="${esc(href)}">Continuar</a></p><script>${leaveScript}</script></body></html>`;
}

// ---- Height of a framed page -----------------------------------------------------------------------
export const heightScript = `(()=>{const send=()=>parent!==window&&parent.postMessage({graaoHeight:document.documentElement.offsetHeight},'*');send();addEventListener('load',send);new ResizeObserver(send).observe(document.body)})()`;
export const heightHash = hashOf(heightScript);
