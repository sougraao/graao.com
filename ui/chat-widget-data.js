// Chat widget: defaults, the visitor's panel (served inside an iframe), the loader script a site embeds,
// and the demo host page. Shared by the server and by the editor's live preview.

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const hex = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#155eef';

export const chatTypes = [
  ['live', 'Chat ao vivo', 'O visitante conversa em tempo real. As respostas enviadas em Conversas aparecem no chat.'],
  ['sms', 'SMS e e-mail', 'Coleta os dados e a primeira mensagem; a equipe responde depois por SMS ou e-mail.']
];
export const fieldModes = [['off', 'Não pedir'], ['optional', 'Opcional'], ['required', 'Obrigatório']];

export function chatDefaults(name = 'Chat do site / Chat del sitio') {
  return { name, type: 'live', active: false, color: '#155eef', position: 'right', agentName: 'Equipe / Equipo', heading: 'Fale com a gente / Contáctenos',
    subheading: 'Respondemos em poucos minutos no horário comercial. / Respondemos en pocos minutos en horario laboral.', prompt: 'Olá! Posso ajudar? / ¡Hola! ¿Puedo ayudarte?', promptDelay: 5,
    welcome: 'Oi! Conte o que você precisa e já te respondemos por aqui. / ¡Hola! Cuéntanos lo que necesitas y te responderemos por aquí.', thanks: 'Recebemos sua mensagem. Vamos responder pelo contato informado. / Recibimos tu mensaje. Responderemos por el contacto informado.',
    legal: 'Ao enviar, você concorda em ser contatado sobre este assunto. / Al enviar, aceptas ser contactado sobre este tema.', askName: 'required', askEmail: 'required', askPhone: 'optional', tags: [] };
}

/* ───────── Painel do visitante ───────── */

export const chatCss = color => `
*{box-sizing:border-box}[hidden]{display:none!important}html,body{height:100%}body{margin:0;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#101828;background:#fff}
.cw{--cw:${hex(color)};display:flex;flex-direction:column;height:100%;background:#fff}
.cw-head{display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--cw);color:#fff}
.cw-avatar{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.22);font-weight:700}
.cw-head h1{margin:0;font-size:15px;line-height:1.25}.cw-head p{margin:2px 0 0;font-size:12.5px;opacity:.88}
.cw-close{margin-left:auto;display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:8px;background:transparent;color:#fff;font-size:20px;cursor:pointer}
.cw-close:hover{background:rgba(255,255,255,.16)}.cw-close:focus-visible{outline:2px solid #fff}
.cw-body{flex:1;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:16px;background:#f9fafb}
.cw-msg{max-width:82%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;overflow-wrap:anywhere}
.cw-msg.them{align-self:flex-start;background:#fff;border:1px solid #eaecf0;border-bottom-left-radius:4px}
.cw-msg.me{align-self:flex-end;background:var(--cw);color:#fff;border-bottom-right-radius:4px}
.cw-msg small{display:block;margin-top:3px;font-size:11px;opacity:.7}
.cw-quick{align-self:flex-start;display:flex;flex-wrap:wrap;gap:6px;max-width:82%}
.cw-quick button{min-height:34px;padding:6px 12px;border:1px solid var(--cw);border-radius:999px;background:#fff;color:var(--cw);font:inherit;font-weight:600;cursor:pointer}
.cw-quick button:hover{background:var(--cw);color:#fff}.cw-quick button:focus-visible{outline:2px solid var(--cw);outline-offset:2px}
.cw-form{display:grid;gap:10px;padding:14px 16px;border-top:1px solid #eaecf0;background:#fff}
.cw-form label{display:grid;gap:4px;font-size:12.5px;font-weight:600}
.cw-form input,.cw-form textarea{width:100%;min-height:40px;padding:9px 11px;border:1px solid #d0d5dd;border-radius:10px;font:inherit;color:inherit;background:#fff}
.cw-form textarea{resize:none}.cw-form input:focus-visible,.cw-form textarea:focus-visible{outline:2px solid var(--cw);outline-offset:1px}
.cw-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cw-send{min-height:42px;border:0;border-radius:10px;background:var(--cw);color:#fff;font:inherit;font-weight:700;cursor:pointer}
.cw-send:disabled{opacity:.6;cursor:default}.cw-send:focus-visible{outline:2px solid var(--cw);outline-offset:2px}
.cw-legal{margin:0;color:#667085;font-size:11.5px}.cw-error{margin:0;color:#b42318;font-size:12.5px;font-weight:600}
.cw-compose{display:flex;gap:8px;align-items:flex-end;padding:10px 12px;border-top:1px solid #eaecf0;background:#fff}
.cw-compose textarea{flex:1;min-height:40px;max-height:120px;padding:9px 11px;border:1px solid #d0d5dd;border-radius:10px;font:inherit;resize:none}
.cw-compose .cw-send{padding:0 16px}
.cw-done{margin:auto;display:grid;justify-items:center;gap:8px;max-width:280px;text-align:center;color:#475467}
.cw-done span{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--cw);color:#fff;font-size:22px}
.cw-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
`;

const initial = name => String(name || '?').trim().charAt(0).toUpperCase() || '?';
const field = (mode, name, label, type, auto) => mode === 'off' ? '' : `<label>${label}${mode === 'required' ? ' *' : ''}<input name="${name}" type="${type}" autocomplete="${auto}" maxlength="${type === 'email' ? 160 : 120}"${mode === 'required' ? ' required' : ''}></label>`;

// The panel: header, conversation, and either the intro form or the composer.
export function chatPanel(widget, { preview = false } = {}) {
  const w = { ...chatDefaults(), ...widget };
  const fields = [field(w.askName, 'name', 'Nome', 'text', 'name'), field(w.askEmail, 'email', 'E-mail', 'email', 'email'), field(w.askPhone, 'phone', 'Telefone', 'tel', 'tel')].filter(Boolean);
  return `<div class="cw" data-cw>
    <header class="cw-head"><span class="cw-avatar" aria-hidden="true">${esc(initial(w.agentName))}</span><div><h1>${esc(w.heading)}</h1>${w.subheading ? `<p>${esc(w.subheading)}</p>` : ''}</div>
      <button class="cw-close" type="button" data-cw-close aria-label="Fechar chat"${preview ? ' tabindex="-1"' : ''}>×</button></header>
    <div class="cw-body" data-cw-log aria-live="polite">${w.welcome ? `<p class="cw-msg them">${esc(w.welcome)}<small>${esc(w.agentName)}</small></p>` : ''}</div>
    <form class="cw-form" data-cw-start novalidate>${fields.length > 1 && w.askName !== 'off' ? fields[0] + `<div class="cw-two">${fields.slice(1).join('')}</div>` : fields.join('')}
      <label>Mensagem *<textarea name="body" rows="2" maxlength="2000" required placeholder="Escreva sua dúvida"></textarea></label>
      ${w.legal ? `<p class="cw-legal">${esc(w.legal)}</p>` : ''}<p class="cw-error" data-cw-error role="alert" hidden></p>
      <button class="cw-send" type="submit"${preview ? ' tabindex="-1"' : ''}>Iniciar conversa</button></form>
    <form class="cw-compose" data-cw-compose hidden><label class="cw-sr" for="cw-text">Mensagem</label><textarea id="cw-text" name="body" rows="1" maxlength="2000" placeholder="Escreva uma mensagem" required></textarea><button class="cw-send" type="submit">Enviar</button></form>
  </div>`;
}

// Runs in the iframe: starts the conversation, keeps the visitor's token, sends and polls messages.
const panelScript = (api, widgetId, live, thanks, agentName) => `(()=>{const api=${JSON.stringify(api)},key='graao-chat:'+${JSON.stringify(widgetId)},live=${live ? 'true' : 'false'};
const log=document.querySelector('[data-cw-log]'),start=document.querySelector('[data-cw-start]'),compose=document.querySelector('[data-cw-compose]'),error=document.querySelector('[data-cw-error]');
let token='';try{token=localStorage.getItem(key)||''}catch{}
let seen=new Set(),timer=0;
const fmt=iso=>new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
const add=m=>{if(seen.has(m.id))return;seen.add(m.id);const p=document.createElement('p');p.className='cw-msg '+(m.direction==='Inbound'?'me':'them');p.textContent=m.body;const s=document.createElement('small');s.textContent=(m.direction==='Inbound'?'Você':${JSON.stringify(agentName)})+' · '+fmt(m.created);p.append(s);log.append(p);
if(m.direction!=='Inbound'&&Array.isArray(m.buttons)&&m.buttons.length){const q=document.createElement('div');q.className='cw-quick';for(const label of m.buttons){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',async()=>{q.remove();try{(await call('/send',{body:label})).messages.forEach(add)}catch(err){error.textContent=err.message;error.hidden=false}});q.append(b)}log.append(q)}
log.scrollTop=log.scrollHeight};
const done=()=>{start.hidden=true;compose.hidden=true;const d=document.createElement('div');d.className='cw-done';d.innerHTML='<span aria-hidden="true">✓</span><p></p>';d.querySelector('p').textContent=${JSON.stringify(thanks)};log.append(d)};
const call=async(path,body)=>{const r=await fetch(api+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Chat-Token':token},body:body?JSON.stringify(body):undefined});const data=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error(data.error||'Não foi possível enviar.'),{status:r.status});return data};
const poll=async()=>{if(!token||document.hidden)return;try{(await call('/messages')).messages.forEach(add)}catch(e){if(e.status===401){token='';try{localStorage.removeItem(key)}catch{}compose.hidden=true;start.hidden=false}}};
const open=()=>{start.hidden=true;compose.hidden=false;clearInterval(timer);timer=setInterval(poll,4000);poll()};
start.addEventListener('submit',async e=>{e.preventDefault();error.hidden=true;for(const el of start.elements){if(el.willValidate&&!el.checkValidity()){el.reportValidity();return}}
const b=start.querySelector('button');b.disabled=true;try{const data=await call('/start',Object.fromEntries(new FormData(start)));token=data.token;try{localStorage.setItem(key,token)}catch{}data.messages.forEach(add);if(live)open();else done()}catch(err){error.textContent=err.message;error.hidden=false}finally{b.disabled=false}});
compose.addEventListener('submit',async e=>{e.preventDefault();const t=compose.elements.body,body=t.value.trim();if(!body)return;t.value='';try{(await call('/send',{body})).messages.forEach(add)}catch(err){t.value=body;error.textContent=err.message;error.hidden=false;start.hidden=true}});
compose.elements.body.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();compose.requestSubmit()}});
document.querySelector('[data-cw-close]').addEventListener('click',()=>parent.postMessage({graaoChat:${JSON.stringify(widgetId)},close:true},'*'));
document.addEventListener('visibilitychange',poll);
if(token&&live)open();})()`;

export function chatPage(widget, { workspace }) {
  const w = { ...chatDefaults(), ...widget };
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(w.heading)}</title><style>${chatCss(w.color)}</style></head><body>${chatPanel(w)}
<script>${panelScript(`/api/chat/${workspace}/${w.id}`, w.id, w.type === 'live', w.thanks, w.agentName)}</script></body></html>`;
}

/* ───────── Script de instalação ───────── */

// The script a site embeds: a bubble, an optional greeting, and the panel in an iframe.
export function loaderScript(widget, { workspace }) {
  const w = { ...chatDefaults(), ...widget };
  const cfg = { id: w.id, path: `/chat/${workspace}/${w.id}`, color: hex(w.color), side: w.position === 'left' ? 'left' : 'right', prompt: w.prompt || '', delay: Math.max(0, Number(w.promptDelay) || 0), label: w.heading };
  return `(()=>{const cfg=${JSON.stringify(cfg).replace(/</g, '\\u003c')};if(window['__graaoChat'+cfg.id])return;window['__graaoChat'+cfg.id]=1;
const me=document.currentScript,origin=me?new URL(me.src).origin:location.origin;
const host=document.createElement('div');host.setAttribute('data-graao-chat',cfg.id);const root=host.attachShadow({mode:'open'});
root.innerHTML='<style>:host{all:initial}.b{position:fixed;bottom:20px;'+cfg.side+':20px;z-index:2147483646;width:60px;height:60px;border:0;border-radius:50%;background:'+cfg.color+';color:#fff;box-shadow:0 8px 24px rgba(16,24,40,.24);cursor:pointer;display:grid;place-items:center}.b:focus-visible{outline:3px solid #fff;outline-offset:2px}.b svg{width:28px;height:28px}.p{position:fixed;bottom:92px;'+cfg.side+':20px;z-index:2147483646;max-width:260px;padding:12px 14px;border-radius:14px;background:#fff;color:#101828;font:14px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(16,24,40,.18);cursor:pointer}.p[hidden],.f[hidden]{display:none}.x{float:right;margin:-4px -6px 0 6px;border:0;background:none;color:#667085;font-size:16px;cursor:pointer}.f{position:fixed;bottom:92px;'+cfg.side+':20px;z-index:2147483647;width:380px;height:min(600px,calc(100vh - 112px));border:0;border-radius:16px;box-shadow:0 16px 48px rgba(16,24,40,.28);background:#fff}@media (max-width:480px){.f{inset:0;width:100%;height:100%;border-radius:0}}@media (prefers-reduced-motion:no-preference){.p,.f{animation:in .18s ease-out}@keyframes in{from{opacity:0;transform:translateY(8px)}}}</style>'
+'<div class="p" part="prompt" hidden role="status"><button class="x" aria-label="Fechar aviso">×</button><span></span></div><iframe class="f" hidden title="'+cfg.label.replace(/"/g,'')+'"></iframe>'
+'<button class="b" aria-label="Abrir chat" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg></button>';
const b=root.querySelector('.b'),p=root.querySelector('.p'),f=root.querySelector('.f');p.querySelector('span').textContent=cfg.prompt;
const toggle=show=>{if(show&&!f.src)f.src=origin+cfg.path;f.hidden=!show;p.hidden=true;b.setAttribute('aria-expanded',String(show));b.setAttribute('aria-label',show?'Fechar chat':'Abrir chat')};
b.addEventListener('click',()=>toggle(f.hidden));p.addEventListener('click',e=>{if(e.target.closest('.x')){p.hidden=true;return}toggle(true)});
addEventListener('message',e=>{if(e.origin===origin&&e.data&&e.data.graaoChat===cfg.id&&e.data.close){toggle(false);b.focus()}});
addEventListener('keydown',e=>{if(e.key==='Escape'&&!f.hidden)toggle(false)});
if(cfg.prompt&&cfg.delay)setTimeout(()=>{if(f.hidden)p.hidden=false},cfg.delay*1000);
(document.body||document.documentElement).append(host)})();`;
}

export function demoPage(widget, { workspace, brand = '' }) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Teste do chat · ${esc(widget.name)}</title>
<style>body{margin:0;font:16px/1.6 system-ui,sans-serif;color:#101828;background:#f2f4f7}main{max-width:720px;margin:0 auto;padding:64px 20px}h1{font-size:30px;line-height:1.2;margin:0 0 12px}p{color:#475467}.box{margin-top:28px;padding:20px;border:1px dashed #98a2b3;border-radius:14px;background:#fff}</style></head>
<body><main><p>${esc(brand)}</p><h1>Página de teste do chat</h1><p>Esta página simula o seu site com o chat “${esc(widget.name)}” instalado. Clique na bolha no canto da tela para conversar. As mensagens chegam em Conversas.</p>
<div class="box"><b>Como instalar no seu site</b><p>Cole o código da aba Instalar antes do fechamento de <code>&lt;/body&gt;</code>.</p></div></main>
<script src="/chat/${esc(workspace)}/${esc(widget.id)}/widget.js" async></script></body></html>`;
}
