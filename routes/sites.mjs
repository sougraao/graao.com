// Rotas públicas dos sites e funis: a prévia dos modelos da galeria (/studio-template), a prévia de uma página
// do Studio (/studio-preview, só para quem edita), o rastreamento externo (/t/<subconta>.js, /pixels.js e o
// endpoint de eventos /e) e o site publicado (/s/<subconta>/<projeto>[/<página>], com o envio do formulário).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no
// fechamento de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { randomBytes } from 'node:crypto';
import { hasSiteTemplate, siteTemplatePreview } from '../site-templates/index.mjs';
import { countVisit, findPage, previewHeaders, publicHeaders, publishedPages, renderPublic, siteValues, withEmbeds, withMotion } from '../studio-site.mjs';
import { hasPixels, pixelsScript, trackerScript, trackingOf } from '../tracking.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

// Sites and funnels published on the Graao: a random visitor id, linked to the contact when the visitor sends
// the site's form, so later page views can fire "Página do site ou funil visitada".
const siteVisitorCookie = workspace => `graao_sv_${workspace.replace(/[^\w-]/g, '')}`;
function siteVisitorOf(req, workspace) {
  const name = siteVisitorCookie(workspace);
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [key, value = ''] = part.trim().split('=');
    if (key === name && /^[a-z0-9]{6,40}$/i.test(value)) return value;
  }
  return '';
}

export function createSiteRoutes(deps) {
  const {
    store, ready, error, workspaceSegment, trackingPath, allowTracking, change, changeSite, flushLater, formFields, publicAccountPolicy,
    publicBase, siteDoc, studioGuard, trackingLog, withPixels
  } = deps;
  const templatePreviewPath = /^\/studio-template\/([a-z0-9-]{1,40})\/([a-z0-9-]{1,40})$/;
  const previewPath = new RegExp(`^/studio-preview/${workspaceSegment}/([0-9a-f-]{36})/([0-9a-f-]{36})$`);
  const sitePath = new RegExp(`^/s/${workspaceSegment}/([0-9a-f-]{36})(?:/([a-z0-9-]{1,48}))?$`);
  return async function siteRoute({ req, res, p, method, url }) {
    // Prévia dos modelos de site da galeria: conteúdo fixo do catálogo, sem dados de cliente.
    const templatePreview = p.match(templatePreviewPath);
    if (templatePreview && method === 'GET') {
      const [, templateId, slug] = templatePreview;
      if (!hasSiteTemplate(templateId)) throw error('Modelo de site não encontrado.',404);
      const thumb = url.searchParams.has('thumb');
      const html = siteTemplatePreview(templateId, slug, { thumb });
      const [headers, body] = thumb ? [previewHeaders, html] : withMotion(previewHeaders, html);
      res.writeHead(200, { ...headers, 'Cache-Control': 'no-cache' });
      return res.end(body);
    }
    const preview = p.match(previewPath);
    if (preview && method === 'GET') {
      await ready;
      const [, workspace, projectId, pageId] = preview;
      await studioGuard(req,res,workspace);
      const doc = await siteDoc(workspace, projectId);
      const page = findPage(doc, pageId);
      const etag = `W/"${projectId}-${pageId}-${doc.rev || 0}"`;
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, { ...previewHeaders, 'ETag': etag, 'Cache-Control': 'private, no-cache' });
        return res.end();
      }
      res.writeHead(200, { ...previewHeaders, 'ETag': etag, 'Cache-Control': 'private, no-cache' });
      return res.end(page.html);
    }
    // Rastreamento externo: the script for the business's site, the pixels loader and the events endpoint.
    const tracker = p.match(trackingPath);
    if (tracker) {
      await ready;
      const [, workspace, part] = tracker;
      if (part === '/e') {
        if (method !== 'POST') throw error('Method not allowed.', 405);
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 64);
        const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
        if (!allowTracking(ip)) { res.writeHead(429, cors); return res.end(); }
        await publicAccountPolicy(workspace, true, 'sites');
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 64_000) throw error('Evento grande demais.', 413); chunks.push(chunk); }
        let data;
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw error('Evento inválido.', 400); }
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw error('Evento inválido.', 400);
        if (await trackingLog.record(workspace, data, req.headers.origin)) flushLater(workspace);
        res.writeHead(204, cors); return res.end();
      }
      if (method !== 'GET' && method !== 'HEAD') throw error('Method not allowed.', 405);
      await publicAccountPolicy(workspace, false, 'sites');
      const t = trackingOf(await store.load(workspace));
      const body = part === '/pixels.js' ? pixelsScript(t) : trackerScript(workspace, publicBase(req), t);
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' });
      return res.end(method === 'HEAD' ? undefined : body);
    }
    const site = p.match(sitePath);
    if (site) {
      await ready;
      const [, workspace, projectId, slug = 'index'] = site;
      const active = await publicAccountPolicy(workspace, method === 'POST', 'sites');
      const base = `/s/${workspace}/${projectId}`;
      const doc = await siteDoc(workspace, projectId, false).catch(() => null);
      if (!doc?.published) throw error('This site is not published.',404);
      if (method === 'POST') {
        const fields = await formFields(req);
        await publicAccountPolicy(workspace, true, 'sites');
        const back = fields._page && fields._page !== 'index' ? `${base}/${encodeURIComponent(fields._page)}` : base;
        const project = (await store.load(workspace)).studioProjects.find(item => item.id === projectId);
        try {
          if (!project?.formId) throw error('This site is not accepting submissions.',404);
          const vid = siteVisitorOf(req, workspace) || randomBytes(12).toString('hex');
          const sent = await change(workspace,{ type:'submit', id:project.formId, data:{ name:fields.name, email:fields.email, phone:fields.phone, _message:fields.message, _source:'Site', _vid:vid } });
          const order = publishedPages(doc);
          const from = order.findIndex(item => item.slug === (fields._page || 'index'));
          if (from >= 0) await Promise.resolve().then(() => changeSite(projectId, d => countVisit(d, order[from].id, 'optins'))).catch(() => {});
          const next = project.kind === 'funnel' && from >= 0 ? order[from + 1] : null;
          const secure = String(req.headers['x-forwarded-proto'] || '').includes('https') || publicBase(req).startsWith('https') ? '; Secure' : '';
          res.setHeader('Set-Cookie', [...[res.getHeader('Set-Cookie') || []].flat(), `${siteVisitorCookie(workspace)}=${vid}; Max-Age=${365 * 86400}; Path=/; HttpOnly; SameSite=Lax${secure}`]);
          const event = hasPixels((await store.load(workspace)).tracking) ? `graao_ev=lead.${sent.id}` : '';
          res.writeHead(303,{ Location:next ? `${base}/${encodeURIComponent(next.slug)}${event && `?${event}`}` : `${back}?sent=1${event && `&${event}`}` });
        } catch {
          res.writeHead(303,{ Location:`${back}?error=1` });
        }
        return res.end();
      }
      if (method !== 'GET') throw error('Method not allowed.',405);
      const page = publishedPages(doc).find(item => item.slug === slug);
      if (!page) throw error('Page not found.',404);
      if (active && !url.searchParams.has('sent') && !url.searchParams.has('error')) await Promise.resolve().then(() => changeSite(projectId, d => countVisit(d, page.id, 'views'))).catch(() => {});
      const visitor = active && method === 'GET' ? siteVisitorOf(req, workspace) : '';
      if (visitor) {
        // A browser that already sent this sub-account a site form: the view counts for its contact.
        try { if (await change(workspace, { type:'site-pageview', data:{ projectId, pageId:page.id, page:page.slug, vid:visitor } })) flushLater(workspace); }
        catch (failure) { console.error(`Site page view (${workspace}): ${failure.message}`); }
      }
      const pt = /<html\b[^>]*\blang\s*=\s*["']?pt/i.test(page.html), es = /<html\b[^>]*\blang\s*=\s*["']?es/i.test(page.html);
      const notice = url.searchParams.has('sent') ? { ok:true, text:pt ? 'Obrigado! Seus dados foram enviados.' : es ? '¡Gracias! Tus datos fueron enviados.' : 'Thank you! Your details were sent.' }
        : url.searchParams.has('error') ? { ok:false, text:pt ? 'Não foi possível enviar. Confira o nome e o e-mail e tente de novo.' : es ? 'No se pudo enviar. Revisa el nombre y el correo e inténtalo de nuevo.' : 'Your details could not be sent. Check the name and email and try again.' } : '';
      const state = await store.load(workspace);
      const [siteHeaders, siteBody] = withPixels(state, workspace, ...withEmbeds(...withMotion(publicHeaders, renderPublic(page,{ base, notice, workspace, link:url.searchParams.get('link') || '', values:siteValues(state) }))));
      res.writeHead(200, siteHeaders);
      return res.end(siteBody);
    }
    return NEXT_ROUTE;
  };
}
