// Contadores (countdown timers), shared by the browser (editor and preview) and the server (validation,
// the e-mail GIF and the embeddable page). A timer ends at a fixed moment (date and time in the
// sub-account's time zone) or "evergreen": a duration counted from when the e-mail was sent or from the
// visitor's first visit to the page.

export const TEMPLATES = [['boxes', 'Caixas'], ['minimal', 'Minimalista']];
export const UNITS = [['days', 'DIAS'], ['hours', 'HORAS'], ['minutes', 'MIN'], ['seconds', 'SEG']];
export const DEFAULT_STYLE = { template: 'boxes', background: '#ffffff', box: '#18181b', digits: '#ffffff', labels: '#52525b' };
const MAX_DURATION_MIN = 365 * 1440;

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const str = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value.toLowerCase() : fallback;
const whole = (value, max) => { const n = Math.floor(Number(value)); return Number.isFinite(n) && n > 0 ? Math.min(max, n) : 0; };

/** "2026-12-24T18:00" in an IANA zone → epoch ms (two passes cover DST changes). */
export function zonedToEpoch(local, timeZone = 'America/Sao_Paulo') {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local || '');
  if (!m) return NaN;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess));
    const get = type => Number(parts.find(p => p.type === type).value);
    guess += wall - Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  }
  return guess;
}

/** Cleans what the editor sends. The fixed end moment is computed here from the local date and the zone. */
export function normalizeTimer(d = {}, timeZone = 'America/Sao_Paulo') {
  const name = str(d.name, 100) || fail('Dê um nome ao contador.');
  const mode = d.mode === 'evergreen' ? 'evergreen' : 'date';
  const s = d.style && typeof d.style === 'object' ? d.style : {};
  const style = { template: TEMPLATES.some(([k]) => k === s.template) ? s.template : DEFAULT_STYLE.template, background: color(s.background, DEFAULT_STYLE.background),
    box: color(s.box, DEFAULT_STYLE.box), digits: color(s.digits, DEFAULT_STYLE.digits), labels: color(s.labels, DEFAULT_STYLE.labels) };
  const expired = { mode: d.expired?.mode === 'text' ? 'text' : 'zero', text: str(d.expired?.text, 32) || 'Oferta encerrada' };
  if (mode === 'date') {
    const endLocal = str(d.endLocal, 16);
    const endAt = zonedToEpoch(endLocal, timeZone);
    if (!Number.isFinite(endAt)) fail('Escolha a data e a hora em que o contador termina.');
    return { name, mode, endLocal, timeZone, endAt: new Date(endAt).toISOString(), duration: { days: 0, hours: 0, minutes: 0 }, style, expired };
  }
  const duration = { days: whole(d.duration?.days, 365), hours: whole(d.duration?.hours, 23), minutes: whole(d.duration?.minutes, 59) };
  const total = durationMinutes(duration);
  if (!total) fail('Informe a duração: dias, horas ou minutos.');
  if (total > MAX_DURATION_MIN) fail('A duração vai até 365 dias.');
  return { name, mode, endLocal: '', timeZone, endAt: '', duration, style, expired };
}

export const durationMinutes = d => (d?.days || 0) * 1440 + (d?.hours || 0) * 60 + (d?.minutes || 0);

/** End moment (epoch ms): fixed, or start + duration for evergreen timers (start defaults to now). */
export function deadlineOf(timer, start = Date.now()) {
  return timer.mode === 'evergreen' ? start + durationMinutes(timer.duration) * 60000 : Date.parse(timer.endAt);
}

/** Remaining time split in units; days are capped at 999 for display. */
export function partsOf(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return { days: Math.min(999, Math.floor(total / 86400)), hours: Math.floor(total % 86400 / 3600), minutes: Math.floor(total % 3600 / 60), seconds: total % 60, total };
}

export const describeTimer = timer => timer.mode === 'evergreen'
  ? `${[[timer.duration.days, 'd'], [timer.duration.hours, 'h'], [timer.duration.minutes, 'min']].filter(([n]) => n).map(([n, u]) => `${n} ${u}`).join(' ')} a partir do envio ou da primeira visita`
  : new Date(timer.endAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: timer.timeZone || undefined });

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const two = n => String(n).padStart(2, '0');

/** Static HTML of the timer at one moment (editor preview and first paint of the embed page). */
export function countdownMarkup(timer, remainingMs) {
  const s = { ...DEFAULT_STYLE, ...timer.style }, p = partsOf(remainingMs), boxes = s.template === 'boxes';
  if (p.total === 0 && timer.expired?.mode === 'text') return `<div class="cd" style="background:${s.background};color:${s.labels};font:700 22px/1.3 system-ui,sans-serif;text-align:center;padding:24px 12px;border-radius:12px" data-cd-expired>${esc(timer.expired.text)}</div>`;
  const unit = ([key, label]) => `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0">
    <span data-cd-unit="${key}" style="display:block;min-width:2.6em;padding:${boxes ? '10px 8px' : '0'};border-radius:10px;background:${boxes ? s.box : 'transparent'};color:${boxes ? s.digits : s.box};font:800 clamp(24px,7vw,40px)/1 ui-monospace,Menlo,Consolas,monospace;text-align:center">${key === 'days' ? (p.days > 99 ? p.days : two(p.days)) : two(p[key])}</span>
    <span style="font:700 11px/1 system-ui,sans-serif;letter-spacing:.08em;color:${s.labels}">${label}</span></div>`;
  return `<div class="cd" style="display:flex;justify-content:center;gap:clamp(6px,2vw,14px);background:${s.background};padding:16px 12px;border-radius:12px">${UNITS.map(unit).join(boxes ? '' : `<span style="font:800 32px/1.2 system-ui;color:${s.box};align-self:flex-start">:</span>`)}</div>`;
}

/** The embeddable page (iframe): ticks every second; evergreen timers remember the first visit. */
export function embedPage(timer, { key }) {
  const config = JSON.stringify({ mode: timer.mode, endAt: timer.endAt, minutes: durationMinutes(timer.duration), key, expired: timer.expired }).replace(/</g, '\\u003c');
  const s = { ...DEFAULT_STYLE, ...timer.style };
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(timer.name)}</title>
<style>html,body{margin:0;background:${s.background}}</style></head><body><div id="cd">${countdownMarkup(timer, timer.mode === 'evergreen' ? durationMinutes(timer.duration) * 60000 : Date.parse(timer.endAt) - Date.now())}</div>
<script>(function(){var c=${config};var start=Date.now();if(c.mode==='evergreen'){try{var k='graao-cd-'+c.key,v=Number(localStorage.getItem(k));if(v&&v<=Date.now())start=v;else localStorage.setItem(k,String(start));}catch(e){}}
var end=c.mode==='evergreen'?start+c.minutes*60000:Date.parse(c.endAt);function pad(n){return n<10?'0'+n:String(n);}
function tick(){var t=Math.max(0,Math.floor((end-Date.now())/1000));if(t===0&&c.expired.mode==='text'){var box=document.querySelector('.cd');if(box&&!box.hasAttribute('data-cd-expired')){box.setAttribute('data-cd-expired','');box.style.display='block';box.style.textAlign='center';box.style.font='700 22px/1.3 system-ui,sans-serif';box.textContent=c.expired.text;}return;}
var v={days:Math.min(999,Math.floor(t/86400)),hours:Math.floor(t%86400/3600),minutes:Math.floor(t%3600/60),seconds:t%60};
for(var u in v){var el=document.querySelector('[data-cd-unit="'+u+'"]');if(el)el.textContent=u==='days'&&v[u]>99?v[u]:pad(v[u]);}if(t>0)setTimeout(tick,1000-Date.now()%1000);}tick();})();</script></body></html>`;
}

/** The iframe code to paste in a page or site builder. */
export const embedCode = (origin, workspace, id, name = 'Contagem regressiva') =>
  `<iframe src="${origin}/cd/${workspace}/${id}" title="${esc(name)}" style="border:0;width:100%;max-width:480px;height:130px" loading="lazy"></iframe>`;
