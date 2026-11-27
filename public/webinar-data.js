// Webinars: the public registration page, the watch room and the calendar file.

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const hex = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#155eef';
export const sessionEnd = session => Date.parse(session.start) + session.duration * 60000;
export const whenLong = (iso, zone = 'America/Sao_Paulo') => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: zone, timeZoneName: 'short' }).format(new Date(iso));

const css = color => `
*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#101828;background:#0b1020}
.wb{min-height:100vh;display:grid;place-items:center;padding:40px 16px;background:radial-gradient(1200px 600px at 10% -10%,${hex(color)}55,transparent),radial-gradient(900px 500px at 110% 110%,${hex(color)}33,transparent)}
.wb-card{width:min(980px,100%);display:grid;grid-template-columns:minmax(0,1.2fr) minmax(300px,1fr);gap:0;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 30px 80px rgba(0,0,0,.35)}
.wb-info{padding:40px;background:#0f172a;color:#e2e8f0;display:grid;gap:14px;align-content:start}.wb-info h1{margin:0;color:#fff;font-size:clamp(28px,4vw,40px);line-height:1.15}
.wb-kicker{margin:0;color:${hex(color)};font-weight:800;font-size:13px;letter-spacing:.08em;text-transform:uppercase;filter:brightness(1.4)}.wb-desc{margin:0;white-space:pre-line;color:#cbd5e1}
.wb-host{display:flex;align-items:center;gap:10px;color:#cbd5e1}.wb-host span{display:grid;place-items:center;width:38px;height:38px;border-radius:50%;background:${hex(color)};color:#fff;font-weight:800}
.wb-form{padding:34px;display:grid;gap:12px;align-content:start}.wb-form h2{margin:0;font-size:20px}.wb-form label{display:grid;gap:4px;font-size:13.5px;font-weight:600}
.wb-form input{width:100%;min-height:44px;padding:10px 12px;border:1px solid #d0d5dd;border-radius:10px;font:inherit}.wb-form input:focus-visible{outline:2px solid ${hex(color)};outline-offset:1px}
.wb-sessions{display:grid;gap:8px;margin:0;padding:0;border:0}.wb-sessions legend{margin-bottom:6px;font-size:13.5px;font-weight:700}
.wb-session{display:flex !important;align-items:center;gap:10px;padding:10px 12px;border:1px solid #d0d5dd;border-radius:12px;cursor:pointer;font-weight:500 !important}.wb-session:has(input:checked){border-color:${hex(color)};box-shadow:0 0 0 1px ${hex(color)}}
.wb-session input{width:auto;min-height:0;accent-color:${hex(color)}}
.wb-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 22px;border:0;border-radius:12px;background:${hex(color)};color:#fff;font:inherit;font-weight:800;text-decoration:none;cursor:pointer}
.wb-btn:disabled{opacity:.6}.wb-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}.wb-ghost{background:#fff;color:#101828;border:1px solid #d0d5dd}
.wb-error{margin:0;color:#b42318;font-weight:600}.wb-note{margin:0;color:#667085;font-size:13px}
.wb-room{width:min(720px,100%);padding:40px;border-radius:22px;background:#fff;text-align:center;display:grid;gap:14px;justify-items:center;box-shadow:0 30px 80px rgba(0,0,0,.35)}
.wb-room h1{margin:0;font-size:clamp(26px,4vw,36px);line-height:1.2}.wb-count{display:flex;gap:12px}.wb-count div{min-width:76px;padding:12px;border-radius:14px;background:#f2f4f7}.wb-count b{display:block;font-size:30px;font-variant-numeric:tabular-nums}.wb-count small{color:#667085}
.wb-actions{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}
@media (max-width:820px){.wb-card{grid-template-columns:minmax(0,1fr)}.wb-info,.wb-form{padding:26px}}
`;

const page = (title, color, body, script = '') => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${css(color)}</style></head><body><main class="wb">${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;

export function registrationPage(webinar, { workspace, zone, at = Date.now() }) {
  const sessions = webinar.sessions.filter(session => sessionEnd(session) > at);
  const info = `<section class="wb-info"><p class="wb-kicker">Webinar gratuito</p><h1>${esc(webinar.name)}</h1>${webinar.description ? `<p class="wb-desc">${esc(webinar.description)}</p>` : ''}
    ${webinar.host ? `<div class="wb-host"><span aria-hidden="true">${esc(webinar.host.charAt(0).toUpperCase())}</span><div>Com <b>${esc(webinar.host)}</b></div></div>` : ''}
    ${sessions[0] ? `<p class="wb-note" style="color:#94a3b8">Próxima sessão: ${esc(whenLong(sessions[0].start, zone))}</p>` : ''}</section>`;
  const form = sessions.length ? `<form class="wb-form" data-wb-form novalidate><h2>Garanta sua vaga</h2>
      ${sessions.length > 1 ? `<fieldset class="wb-sessions"><legend>Escolha a sessão</legend>${sessions.map((session, index) => `<label class="wb-session"><input type="radio" name="sessionId" value="${session.id}"${index ? '' : ' checked'}> ${esc(whenLong(session.start, zone))}</label>`).join('')}</fieldset>` : `<input type="hidden" name="sessionId" value="${sessions[0].id}"><p class="wb-note">${esc(whenLong(sessions[0].start, zone))} · ${sessions[0].duration} min</p>`}
      <label>Nome *<input name="name" required maxlength="120" autocomplete="name"></label><label>E-mail *<input name="email" type="email" required maxlength="160" autocomplete="email"></label>
      <label>WhatsApp${webinar.requirePhone ? ' *' : ''}<input name="phone" type="tel" maxlength="48" autocomplete="tel"${webinar.requirePhone ? ' required' : ''}></label>
      <p class="wb-error" data-wb-error role="alert" hidden></p><button class="wb-btn" type="submit">Quero participar</button><p class="wb-note">Você recebe o link de acesso e lembretes antes de começar.</p></form>`
    : '<div class="wb-form"><h2>Inscrições encerradas</h2><p class="wb-note">Não há sessões abertas no momento.</p></div>';
  const script = `const f=document.querySelector('[data-wb-form]');if(f){const e=f.querySelector('[data-wb-error]');f.addEventListener('submit',async ev=>{ev.preventDefault();for(const el of f.elements){if(el.willValidate&&!el.checkValidity()){el.reportValidity();return}}
const b=f.querySelector('button');b.disabled=true;e.hidden=true;try{const r=await fetch(${JSON.stringify(`/api/webinar/${workspace}/${webinar.id}/register`)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(f)))});const d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível concluir.');location.href=d.room}catch(x){e.textContent=x.message;e.hidden=false;b.disabled=false}})}`;
  return page(webinar.name, webinar.color, `<div class="wb-card">${info}${form}</div>`, script);
}

export function roomPage(webinar, registration, { workspace, zone, at = Date.now() }) {
  const session = webinar.sessions.find(row => row.id === registration.sessionId);
  if (!session) return page(webinar.name, webinar.color, '<div class="wb-room"><h1>Sessão não encontrada</h1><p class="wb-note">Esta sessão foi removida. Fale com quem organiza o webinar.</p></div>');
  const start = Date.parse(session.start), end = sessionEnd(session), opens = start - webinar.openBefore * 60000;
  const ics = `/w/${workspace}/${webinar.id}/agenda.ics?t=${registration.token}`;
  let state = '';
  if (at >= end) state = webinar.replayUrl ? `<p>Esta sessão já aconteceu. A gravação está disponível.</p><a class="wb-btn" href="${esc(webinar.replayUrl)}" rel="noopener">Assistir à gravação</a>` : '<p>Esta sessão já aconteceu. Obrigado por participar!</p>';
  else if (at >= opens) state = webinar.joinUrl ? `<p>A sala está aberta.</p><a class="wb-btn" href="${esc(webinar.joinUrl)}" rel="noopener">Entrar no webinar</a>` : '<p>A sala está aberta. O link de acesso será enviado por quem organiza.</p>';
  else state = `<div class="wb-count" data-wb-count data-start="${start}" data-open="${opens}" aria-live="polite"><div><b data-d>0</b><small>dias</small></div><div><b data-h>0</b><small>horas</small></div><div><b data-m>0</b><small>min</small></div><div><b data-s>0</b><small>seg</small></div></div>
    <p class="wb-note">O botão para entrar aparece ${webinar.openBefore ? `${webinar.openBefore} minutos antes do início` : 'no horário de início'}.</p>`;
  const body = `<div class="wb-room"><p class="wb-kicker" style="filter:none">Inscrição confirmada</p><h1>${esc(webinar.name)}</h1><p><b>${esc(whenLong(session.start, zone))}</b> · ${session.duration} min</p>
    ${webinar.thanks ? `<p class="wb-note">${esc(webinar.thanks)}</p>` : ''}${state}<div class="wb-actions"><a class="wb-btn wb-ghost" href="${esc(ics)}">Adicionar à agenda</a></div>
    <p class="wb-note">Guarde este link: é por ele que você entra na sessão.</p></div>`;
  const script = at < opens ? `const c=document.querySelector('[data-wb-count]');const open=Number(c.dataset.open),start=Number(c.dataset.start);const tick=()=>{const left=Math.max(0,start-Date.now());if(Date.now()>=open){location.reload();return}
c.querySelector('[data-d]').textContent=Math.floor(left/864e5);c.querySelector('[data-h]').textContent=Math.floor(left/36e5)%24;c.querySelector('[data-m]').textContent=Math.floor(left/6e4)%60;c.querySelector('[data-s]').textContent=Math.floor(left/1e3)%60};tick();setInterval(tick,1000);` : '';
  return page(webinar.name, webinar.color, body, script);
}

const icsDate = iso => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = value => String(value ?? '').replace(/[\\;,]/g, ch => `\\${ch}`).replace(/\r?\n/g, '\\n');
export function calendarFile(webinar, session, link) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//graao//webinar//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${session.id}-${webinar.id}@graao`, `DTSTAMP:${icsDate(new Date().toISOString())}`, `DTSTART:${icsDate(session.start)}`, `DTEND:${icsDate(new Date(sessionEnd(session)).toISOString())}`,
    `SUMMARY:${icsText(webinar.name)}`, `DESCRIPTION:${icsText(`${webinar.description ? `${webinar.description}\n\n` : ''}Entre por: ${link}`)}`, `URL:${link}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(webinar.name)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}
