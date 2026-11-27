// Páginas: o favicon, os dados de página, formulário e curso publicados (/api/view/...), os endereços antigos /p, /f e
// /course, a política de privacidade, o login, o app e os arquivos estáticos de ui/ (alguns só abrem com sessão).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no fechamento
// de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterLogin } from '../auth.mjs';
import { find } from '../model.mjs';
import { NEXT_ROUTE } from './next-route.mjs';
import { brandedPage, isPlatformHost, requestHost, whiteLabelBrand } from '../white-label.mjs';

export function createFaviconRoutes() {
  return async function faviconRoutes({ res, p }) {
    if (p === '/favicon.ico') { res.writeHead(302, { Location: '/favicon.svg' }); return res.end(); }
    return NEXT_ROUTE;
  };
}

export function createPageRoutes(deps) {
  const { store, ready, error, workspaceSegment, payload, change, publicAccountPolicy, staticFiles, sessionOnlyFiles, localAccess, auth, pranchetaEditorCsp, root } = deps;
  const paths = new RegExp(`^/(p|f|course)/${workspaceSegment}/([0-9a-f-]{36})$`);
  return async function pageRoutes({ req, res, p, method, url, json, send, goTo }) {
    // A página, o formulário ou o curso publicado; null quando não existe ou não está publicado.
    const published = async (kind, w, item) => {
      const state=await store.load(w), map={p:'pages',f:'forms',course:'courses'}, row=find(state,map[kind],item);
      return !row?.active || (kind==='course' && row.portalOnly) ? null : { state, row };
    };
    const match=p.replace(/^\/api\/view/,'').match(paths);
    if (p.startsWith('/api/view/') && match) {
      const [,kind,w,item]=match;
      if (method==='POST') {
        if (kind!=='f') throw error('Method not allowed.',405);
        const input = await payload(req);
        await publicAccountPolicy(w, true, 'sites');
        // _vid links a site visitor to the contact; only the site route (which sets the cookie) may send it.
        const submission = await change(w,{type:'submit',id:item,data:{ ...(input && typeof input === 'object' ? input : {}), _vid:'' }});
        return json({id:submission.id},201);
      }
      await publicAccountPolicy(w, false, kind === 'course' ? 'memberships' : 'sites');
      const found=await published(kind,w,item);
      if(!found) throw error('This item is not published.',404);
      const {state,row}=found, form=kind==='p' && row.formId ? find(state,'forms',row.formId) : null;
      return json({kind,row,form:form?.active?form:null,brand:state.profile.name});
    }
    const legacyPage = method !== 'POST' && p.match(paths);
    if (legacyPage) {
      await ready;
      await publicAccountPolicy(legacyPage[2], false, legacyPage[1] === 'course' ? 'memberships' : 'sites');
    }
    if (method === 'GET' && legacyPage?.[1] === 'f') { res.writeHead(302, { Location:`/form/${legacyPage[2]}/${legacyPage[3]}` }); return res.end(); }
    // /p (botão "Ver" da página) e /course (botão "Aula pública" do curso) abrem o app, que lê /api/view e mostra o item.
    // Desde que a raiz virou o login (e915b7c), o app mora em app.html; antes disso o servidor procurava ui/p/... e dava 500.
    if (legacyPage && (method === 'GET' || method === 'HEAD') && !(await published(...legacyPage.slice(1, 4)))) {
      return send(404, 'text/html; charset=utf-8', method === 'HEAD' ? undefined :
        '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página indisponível</title><main><h1>Esta página não está publicada.</h1><p>Ela pode ter sido removida ou despublicada. Entre em contato com o responsável pela publicação para saber mais.</p></main></html>');
    }
    // Política de privacidade pública (LGPD e o link exigido pelo login com Google).
    if (p === '/privacidade' || p === '/privacidade/') p = '/privacidade.html';
    const platformPaths = ['/app','/app/','/painel','/painel/'];
    // A raiz é a página inicial pública (ui/index.html); o login com Google mora em /login (ui/login.html).
    const homePaths = ['/','/index.html'];
    const loginPaths = ['/login','/login.html'];
    // White Label: no domínio de uma agência a raiz é a entrada com a marca dela, nunca a página inicial do graao.
    if ((method==='GET'||method==='HEAD') && homePaths.includes(p) && !isPlatformHost(requestHost(req))) {
      await ready;
      if ((await whiteLabelBrand(store, requestHost(req))).name !== undefined) {
        const search = new URLSearchParams(url.search); search.delete('__path');
        return goTo('/login' + (search.size ? '?' + search : ''));
      }
    }
    if ((method==='GET'||method==='HEAD') && (homePaths.includes(p) || loginPaths.includes(p) || platformPaths.includes(p) || paths.test(p) || staticFiles.has(p))) {
      const isLogin = loginPaths.includes(p) || homePaths.includes(p);
      // Páginas estáticas que só abrem com sessão (como o app), por exemplo o editor da Prancheta.
      if (!isLogin && !paths.test(p) && (!staticFiles.has(p) || sessionOnlyFiles.has(p)) && !localAccess && !auth?.hasSession(req)) {
        const search = new URLSearchParams(url.search); search.delete('__path');
        const next = afterLogin(p + (search.size ? '?' + search : ''));
        return goTo('/login?' + new URLSearchParams({ next }));
      }
      const f = homePaths.includes(p) ? '/index.html' : loginPaths.includes(p) ? '/login.html' : (platformPaths.includes(p) || legacyPage ? '/app.html' : p);
      // Setup illustrations are not mirrored in public/: without this every card refetched them from the
      // function. The browser keeps them a day; the Vercel CDN until the next deploy purges it.
      if (f.startsWith('/setup-art/')) res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=31536000, stale-while-revalidate=86400');
      if (f === '/prancheta-editor.html') res.setHeader('Content-Security-Policy', pranchetaEditorCsp());
      // White Label: no domínio da agência, a entrada e o app já saem com o nome, o logotipo e a cor dela.
      if ((f === '/login.html' || f === '/app.html') && !isPlatformHost(requestHost(req))) {
        await ready;
        const brand = await whiteLabelBrand(store, requestHost(req));
        if (brand.name !== undefined) return send(200, 'text/html; charset=utf-8', method === 'HEAD' ? undefined : brandedPage(readFileSync(resolve(root,'ui',f.slice(1)),'utf8'), brand));
      }
      return send(200,staticFiles.get(f)||'text/html; charset=utf-8',method==='HEAD'?undefined:readFileSync(resolve(root,'ui',f.slice(1))));
    }
    return NEXT_ROUTE;
  };
}
