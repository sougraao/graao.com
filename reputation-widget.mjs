// Public pages of reputation part 2: the review widget (an iframe sites embed with one script tag)
// and the video testimonial collector (record with the camera or send a file, then upload in chunks).
import { widgetContent } from './reputation-media.mjs';

export const widgetCsp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; media-src 'self' https://*.r2.cloudflarestorage.com; base-uri 'none'; form-action 'none'; frame-ancestors *";
export const collectorCsp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src blob: mediastream:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const stars = score => `<span class="stars" aria-label="${score} de 5 estrelas">${'★'.repeat(score)}<span>${'★'.repeat(5 - score)}</span></span>`;
const date = iso => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : ''; };

export function renderWidget(state, widget, { workspace }) {
  const { reviews, videos, average, total } = widgetContent(state, widget);
  const business = state.profile?.name || '';
  const dark = '--bg:#14161b;--card:#1c1f26;--ink:#f2f4f7;--dim:#a6adbb;--line:#2a2f3a';
  const light = '--bg:transparent;--card:#fff;--ink:#101828;--dim:#475467;--line:#e4e7ec';
  const theme = widget.theme === 'dark' ? `:root{${dark}}` : widget.theme === 'light' ? `:root{${light}}` : `:root{${light}}@media (prefers-color-scheme:dark){:root{${dark}}}`;
  const summary = `<div class="summary"><b>${total ? average.toFixed(1).replace('.', ',') : '—'}</b>${stars(Math.round(average))}<span>${total} ${total === 1 ? 'avaliação' : 'avaliações'}${business ? ` · ${h(business)}` : ''}</span></div>`;
  const card = review => `<article class="card"><header><b>${h(review.author)}</b>${stars(review.score)}</header><p>${h(review.text)}</p>
    ${review.reply ? `<p class="reply"><b>Resposta${business ? ` de ${h(business)}` : ''}:</b> ${h(review.reply)}</p>` : ''}<small>${date(review.date)}</small></article>`;
  const video = item => `<figure class="card video"><video controls preload="metadata" playsinline src="/v/${h(workspace)}/${h(item.id)}"></video><figcaption>${h(item.name)}</figcaption></figure>`;
  const items = [...videos.map(video), ...reviews.map(card)].join('');
  const body = widget.layout === 'badge' ? '' : items ? `<div class="items ${widget.layout}">${items}</div>` : '<p class="empty">Ainda não há avaliações para mostrar.</p>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${h(widget.title || `Avaliações${business ? ` de ${business}` : ''}`)}</title>
<style>${theme}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{padding:4px}h1{margin:0 0 8px;font-size:18px}.summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px}.summary b{font-size:26px;line-height:1}.summary>span:last-child{color:var(--dim);font-size:14px}
.stars{color:#f5b301;letter-spacing:1px}.stars span{color:var(--line)}
.items{display:grid;gap:12px}.items.grid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.items.carousel{grid-auto-flow:column;grid-auto-columns:minmax(260px,320px);overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px}.items.carousel .card{scroll-snap-align:start}
.card{margin:0;padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--card);display:grid;gap:6px;align-content:start}
.card header{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.card p{margin:0;white-space:pre-wrap}.card small{color:var(--dim)}
.reply{padding:8px 10px;border-left:3px solid ${widget.accent};background:color-mix(in srgb,${widget.accent} 7%,transparent);border-radius:6px;font-size:14px}
.video video{width:100%;aspect-ratio:9/16;max-height:380px;border-radius:10px;background:#000;object-fit:cover}.video figcaption{color:var(--dim);font-size:14px}
.empty{color:var(--dim)}.credit{margin-top:10px;font-size:12px;color:var(--dim)}
</style></head><body><main>
${widget.title ? `<h1>${h(widget.title)}</h1>` : ''}${summary}${body}
</main>
<script>
const report = () => parent.postMessage({ graao: 'review-widget', id: ${JSON.stringify(widget.id)}, height: Math.ceil(document.documentElement.scrollHeight) }, '*');
addEventListener('load', report); new ResizeObserver(report).observe(document.body);
</script></body></html>`;
}

// <script src=".../widget.js" async></script> puts the iframe where the tag is and keeps its height in sync.
export function widgetLoader({ origin, workspace, widgetId }) {
  const src = `${origin}/rw/${workspace}/${widgetId}`;
  return `(function(){var s=document.currentScript;var f=document.createElement('iframe');f.src=${JSON.stringify(src)};f.title='Avaliações';f.loading='lazy';
f.style.cssText='width:100%;border:0;display:block;min-height:120px;color-scheme:normal';f.setAttribute('scrolling','no');
(s&&s.parentNode?s.parentNode.insertBefore(f,s.nextSibling):document.body.appendChild(f));
window.addEventListener('message',function(e){if(e.source===f.contentWindow&&e.data&&e.data.graao==='review-widget'&&e.data.id===${JSON.stringify(widgetId)}){f.style.height=Math.min(4000,Number(e.data.height)||0)+'px';}});})();`;
}

export function renderCollector(state, collector, { workspace }) {
  const business = state.profile?.name || 'a empresa';
  const api = `/api/depoimento/${workspace}/${collector.id}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Depoimento para ${h(business)}</title>
<style>
:root{--ink:#101828;--dim:#475467;--line:#e4e7ec;--bg:#f5f6f8;--card:#fff;--accent:#d6246e}
@media (prefers-color-scheme:dark){:root{--ink:#f2f4f7;--dim:#a6adbb;--line:#2a2f3a;--bg:#0f1115;--card:#171a21}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px 16px;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:var(--bg)}
main{width:100%;max-width:480px;padding:24px;border-radius:20px;background:var(--card);border:1px solid var(--line);display:grid;gap:14px}
.brand{margin:0;color:var(--dim);font-size:14px;font-weight:600}h1{margin:0;font-size:22px;line-height:1.3}p{margin:0;color:var(--dim)}
video{width:100%;aspect-ratio:3/4;max-height:60vh;border-radius:14px;background:#000;object-fit:cover}
.row{display:flex;gap:8px;flex-wrap:wrap}button,.file{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border-radius:12px;border:1px solid var(--line);background:transparent;color:var(--ink);font:600 15px system-ui,sans-serif;cursor:pointer}
.primary{background:var(--accent);border-color:var(--accent);color:#fff}button[disabled]{opacity:.55;cursor:not-allowed}.file input{position:absolute;width:1px;height:1px;opacity:0}
.timer{font-variant-numeric:tabular-nums;font-weight:700}.rec{color:#d92d20}
label{display:grid;gap:4px;font-size:14px;font-weight:600}input[type=text],input[type=email]{padding:10px 12px;border:1px solid var(--line);border-radius:10px;font:inherit;color:inherit;background:transparent}
.consent{display:flex;gap:8px;align-items:flex-start;font-weight:400;color:var(--dim)}.consent input{margin-top:4px}
progress{width:100%;height:8px}.status{min-height:1.5em;font-size:14px}.status.error{color:#d92d20}[hidden]{display:none!important}
</style></head><body><main>
<p class="brand">${h(business)}</p>
<h1>${h(collector.question)}</h1>
<p>Grave um vídeo de até ${collector.maxSeconds} segundos ou envie um vídeo do seu celular.</p>
<section data-step="record" class="row" style="display:grid;gap:10px">
  <video data-live muted playsinline hidden></video>
  <div class="row"><button type="button" class="primary" data-camera>Abrir câmera</button><button type="button" data-start hidden>Gravar</button><button type="button" data-stop hidden>Parar</button>
    <label class="file">Enviar arquivo<input type="file" accept="video/mp4,video/webm,video/quicktime" data-file></label></div>
  <p><span class="timer" data-timer></span></p>
</section>
<form data-step="send" hidden style="display:grid;gap:12px">
  <video data-preview controls playsinline></video>
  <button type="button" data-again>Gravar de novo</button>
  <label>Seu nome<input type="text" name="name" maxlength="80" required autocomplete="name"></label>
  <label>E-mail (opcional)<input type="email" name="email" maxlength="160" autocomplete="email"></label>
  <label class="consent"><input type="checkbox" name="consent" required> Autorizo ${h(business)} a publicar este vídeo, com meu primeiro nome, no site e nas redes da empresa.</label>
  <progress data-progress value="0" max="1" hidden></progress>
  <button class="primary" data-send>Enviar depoimento</button>
</form>
<section data-step="done" hidden><h1>${h(collector.thanks)}</h1><p>A empresa revisa o vídeo antes de publicar.</p></section>
<p class="status" role="status" data-status></p>
</main>
<script>
const max = ${collector.maxSeconds}, limit = 15 * 1024 * 1024, $ = s => document.querySelector(s);
let stream = null, recorder = null, parts = [], video = null, seconds = 0, tick = null;
const status = (text, error) => { const el = $('[data-status]'); el.textContent = text || ''; el.className = 'status' + (error ? ' error' : ''); };
const show = step => document.querySelectorAll('[data-step]').forEach(el => { el.hidden = el.dataset.step !== step; });
function ready(blob, length) {
  if (blob.size > limit) { status('O vídeo passa de 15 MB. Grave um depoimento mais curto.', true); return; }
  if (length > max + 5) { status('O vídeo pode ter até ' + max + ' segundos.', true); return; }
  video = blob; seconds = Math.round(length);
  $('[data-preview]').src = URL.createObjectURL(blob); stopCamera(); show('send'); status('');
}
function stopCamera() { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; $('[data-live]').hidden = true; }
$('[data-camera]').onclick = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 720 } }, audio: true });
    const live = $('[data-live]'); live.srcObject = stream; live.hidden = false; await live.play();
    $('[data-camera]').hidden = true; $('[data-start]').hidden = false; status('');
  } catch { status('Não foi possível abrir a câmera. Envie um arquivo de vídeo.', true); }
};
$('[data-start]').onclick = () => {
  parts = []; const type = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  recorder = new MediaRecorder(stream, { ...(type && { mimeType: type }), videoBitsPerSecond: 1200000 });
  recorder.ondataavailable = e => e.data.size && parts.push(e.data);
  const started = Date.now();
  recorder.onstop = () => { clearInterval(tick); ready(new Blob(parts, { type: (recorder.mimeType || 'video/webm').split(';')[0] }), (Date.now() - started) / 1000); };
  recorder.start(1000); $('[data-start]').hidden = true; $('[data-stop]').hidden = false;
  tick = setInterval(() => { const s = Math.floor((Date.now() - started) / 1000); $('[data-timer]').innerHTML = '<span class="rec">●</span> ' + s + ' / ' + max + ' s'; if (s >= max) $('[data-stop]').click(); }, 250);
};
$('[data-stop]').onclick = () => { if (recorder && recorder.state !== 'inactive') recorder.stop(); $('[data-stop]').hidden = true; $('[data-timer]').textContent = ''; };
$('[data-file]').onchange = e => {
  const file = e.target.files[0]; if (!file) return;
  const probe = document.createElement('video'); probe.preload = 'metadata';
  probe.onloadedmetadata = () => ready(file, probe.duration || 0); probe.onerror = () => status('Não foi possível ler este vídeo.', true);
  probe.src = URL.createObjectURL(file);
};
$('[data-again]').onclick = () => { video = null; show('record'); $('[data-camera]').hidden = false; $('[data-start]').hidden = true; };
const call = async (path, body) => {
  const response = await fetch(${JSON.stringify(api)} + '/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível enviar. Tente de novo.');
  return data;
};
const base64 = blob => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.onerror = reject; r.readAsDataURL(blob); });
$('[data-step="send"]').onsubmit = async e => {
  e.preventDefault(); const form = e.target; if (!video || !form.reportValidity()) return;
  const button = $('[data-send]'), bar = $('[data-progress]'); button.disabled = true; bar.hidden = false; status('Enviando…');
  try {
    const { uploadId, chunkBytes, total } = await call('start', { mime: video.type || 'video/mp4', size: video.size, seconds });
    bar.max = total;
    for (let i = 0; i < total; i++) { await call('chunk', { uploadId, index: i, data: await base64(video.slice(i * chunkBytes, (i + 1) * chunkBytes)) }); bar.value = i + 1; }
    await call('finish', { uploadId, name: form.elements.name.value, email: form.elements.email.value, consent: form.elements.consent.checked });
    show('done'); status('');
  } catch (error) { status(error.message, true); button.disabled = false; bar.hidden = true; }
};
</script></body></html>`;
}
