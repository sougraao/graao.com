// Mídia: imagens guardadas fora dos documentos (/a/...), o vídeo gerado com IA (/m/<subconta>/video/...), o Mídia Drive
// (importar por link e enviar arquivo grande direto ao R2: /api/media/...) e o vídeo de depoimento (/api/video).
// Extraído do server.mjs sem mudar comportamento (plano de melhoria P2.1). Recebe do servidor o que vive no fechamento
// de makeServer (deps) e, a cada requisição, o contexto da rota (ctx).
import { ASSET_PATH, assetBytes } from '../asset-store.mjs';
import { requireWorkspaceCommand, workspaceView } from '../authorization.mjs';
import { bytesMatch, importedFile, importedMeta, mediaLimitBytes, mediaTypes, SIGNATURE_BYTES } from '../media-model.mjs';
import { uid } from '../model.mjs';
import { R2_MAX_BYTES } from '../r2-storage.mjs';
import { NEXT_ROUTE } from './next-route.mjs';

export function createPublicMediaRoutes(deps) {
  const { store, error, ready, workspaceSegment, publicAccountPolicy, sendVideo } = deps;
  return async function publicMediaRoutes({ req, res, p, method }) {
    // "Gerar vídeo com IA": the finished video, public (it is made to be sent).
    // Imagens guardadas fora dos documentos (asset-store.mjs): públicas e imutáveis (o endereço é o hash do conteúdo).
    const assetMatch = p.match(ASSET_PATH);
    if (assetMatch && (method === 'GET' || method === 'HEAD')) {
      const image = await assetBytes(store, p);
      if (!image) throw error('Imagem não encontrada.', 404);
      res.writeHead(200, { 'Content-Type': image.mime, 'Content-Length': image.bytes.length, 'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'cross-origin' });
      return res.end(method === 'HEAD' ? undefined : image.bytes);
    }
    const aiVideo = p.match(new RegExp(`^/m/${workspaceSegment}/video/([0-9a-f-]{36})$`));
    if (aiVideo && (method === 'GET' || method === 'HEAD')) {
      await ready;
      const [, workspace, videoId] = aiVideo;
      await publicAccountPolicy(workspace);
      const row = ((await store.load(workspace)).aiVideos || []).find(item => item.id === videoId);
      if (!row) throw error('Vídeo indisponível.', 404);
      return await sendVideo(req, res, method, workspace, row, 'public, max-age=86400');
    }
    return NEXT_ROUTE;
  };
}

export function createDriveRoutes(deps) {
  const { store, error, spaceId, privateSpace, payload, workspaceAccess, r2, fetchMedia, change } = deps;
  return async function driveRoutes({ req, res, p, method, id, json }) {
    if (p==='/api/media/import' && method==='POST') {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
      const input = await payload(req);
      const who = await workspaceAccess(req, res, id);
      requireWorkspaceCommand(who, { type:'save', key:'files' });
      if (typeof input.url !== 'string' || !input.url.trim() || input.url.length > 2000) throw error('Cole o link do arquivo.',400);
      const address = input.url.trim();
      let response;
      const limit = r2 ? R2_MAX_BYTES : mediaLimitBytes;
      try { response = await fetchMedia(address, { maxBytes: limit + 1, timeout: r2 ? 30000 : 10000 }); }
      catch (e) { throw error(['EINVALID','EBLOCKED'].includes(e.code) ? 'Use um link público que comece com https://.' : 'Não foi possível baixar o arquivo desse link.', 422); }
      const folderId = typeof input.folderId === 'string' ? input.folderId : '';
      if (r2 && response.body?.length > mediaLimitBytes) {
        const { name, mime } = importedMeta(response, address, limit);
        const fileId = uid(), r2Key = `ws/${id}/files/${fileId}`;
        if ((await store.load(id)).files.length >= 60) throw error('The local drive holds up to 60 files.', 400);
        await r2.put(r2Key, response.body, mime);
        let result;
        try { result = await change(id, { type:'media-stored', data:{ id: fileId, r2Key, mime, size: response.body.length, name, folderId } }); }
        catch (e) { await r2.remove(r2Key).catch(() => {}); throw e; }
        return json({ id: result.id, ...workspaceView(who, result.state) });
      }
      const file = importedFile(response, address);
      const result = await change(id, { type:'save', key:'files', data:{ ...file, folderId } }, who);
      return json({ id: result.id, ...workspaceView(who, result.state) });
    }
    // Mídia Drive → files over 700 KB: the browser PUTs them straight into R2 with a signed link, then
    // asks for the record; the server checks the stored object (size and type) before writing it.
    if ((p==='/api/media/upload-url' || p==='/api/media/upload-done') && method==='POST') {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Workspace not found.',404);
      const input = await payload(req);
      const who = await workspaceAccess(req, res, id);
      requireWorkspaceCommand(who, { type:'save', key:'files' });
      if (!r2) throw error('O armazenamento de arquivos grandes (Cloudflare R2) ainda não foi configurado. Envie arquivos de até 700 KB.', 503);
      if (p==='/api/media/upload-url') {
        const mime = typeof input.mime === 'string' ? input.mime.trim().toLowerCase() : '';
        const size = Number(input.size);
        if (!mediaTypes[mime]) throw error('Escolha um arquivo de imagem, vídeo, áudio, PDF, TXT ou CSV.', 400);
        if (!Number.isInteger(size) || size < 1 || size > R2_MAX_BYTES) throw error('O arquivo pode ter até 50 MB.', 413);
        if ((await store.load(id)).files.length >= 60) throw error('The local drive holds up to 60 files.', 400);
        const fileId = uid(), key = `ws/${id}/files/${fileId}`;
        const token = r2.seal({ k: key, i: fileId, w: id, m: mime, s: size, n: typeof input.name === 'string' ? input.name.slice(0, 240) : '',
          f: typeof input.folderId === 'string' ? input.folderId.slice(0, 60) : '', exp: Date.now() + 15 * 60000 });
        return json({ uploadUrl: r2.uploadUrl(key, mime), headers: { 'Content-Type': mime }, token });
      }
      const ticket = r2.open(input.token);
      if (ticket.w !== id) throw error('Envio inválido. Comece de novo.', 400);
      const stored = await r2.head(ticket.k);
      if (!stored) throw error('O arquivo não chegou ao armazenamento. Tente de novo.', 409);
      if (stored.size !== ticket.s || stored.type !== ticket.m) {
        await r2.remove(ticket.k).catch(() => {});
        throw error('O arquivo enviado não confere com o que foi pedido. Tente de novo.', 422);
      }
      // O tipo veio do navegador: o começo do arquivo precisa bater com ele (um HTML como image/png é apagado).
      if (!bytesMatch(ticket.m, await r2.start(ticket.k, SIGNATURE_BYTES))) {
        await r2.remove(ticket.k).catch(() => {});
        throw error('O conteúdo do arquivo não confere com o tipo dele. Envie o arquivo original, sem trocar a extensão.', 422);
      }
      let result;
      try { result = await change(id, { type:'media-stored', data:{ id: ticket.i, r2Key: ticket.k, mime: ticket.m, size: ticket.s, name: ticket.n, folderId: ticket.f } }); }
      catch (e) { await r2.remove(ticket.k).catch(() => {}); throw e; }
      return json({ id: result.id, ...workspaceView(who, result.state) }, 201);
    }
    return NEXT_ROUTE;
  };
}

export function createVideoRoutes(deps) {
  const { store, error, spaceId, privateSpace, workspaceAccess, sendVideo } = deps;
  return async function videoRoutes({ req, res, p, method, url, id }) {
    if (p === '/api/video' && (method === 'GET' || method === 'HEAD')) {
      if (!spaceId.test(id) && !privateSpace.test(id)) throw error('Subconta não encontrada.',404);
      await workspaceAccess(req, res, id, { modules: ['reputation'] });
      const row = (await store.load(id)).videoTestimonials?.find(item => item.id === url.searchParams.get('id'));
      if (!row) throw error('Vídeo não encontrado.', 404);
      return await sendVideo(req, res, method, id, row, 'private, no-store');
    }
    return NEXT_ROUTE;
  };
}
