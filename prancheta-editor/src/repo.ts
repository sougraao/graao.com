import type { DocumentData } from "./editor/model/types";

export interface PranchetaFileInfo {
  id: string;
  name: string;
  size_bytes: number;
  thumbnail?: string | null;
  created_at: string;
  updated_at: string;
}
export interface PranchetaFile extends PranchetaFileInfo { document: DocumentData }

export class PranchetaConflictError extends Error {
  constructor() {
    super("Este arquivo mudou em outra aba ou não está mais disponível. Reabra a versão salva ou salve seu trabalho como uma cópia.");
    this.name = "PranchetaConflictError";
  }
}

/** Mesmo limite do servidor (prancheta-model.mjs). */
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

export function documentPayload(document: DocumentData, thumbnail?: string | null) {
  const name = document.name.trim();
  if (!name || name.length > 150) throw new Error("Use um nome de 1 a 150 caracteres.");
  const doc = { ...document, name };
  const size_bytes = new TextEncoder().encode(JSON.stringify(doc)).byteLength;
  if (size_bytes > MAX_DOCUMENT_BYTES) throw new Error("Este arquivo passou de 25 MB. Reduza as imagens antes de salvar.");
  return { name, document: doc, size_bytes, ...(thumbnail !== undefined ? { thumbnail } : {}) };
}

async function problem(res: Response, fallback: string) {
  try {
    const data = await res.json();
    if (data?.error) return String(data.error);
  } catch { /* corpo sem JSON */ }
  return `${fallback} (${res.status})`;
}

/**
 * Arquivos da Prancheta guardados na graao: `workspace=agency` para a agência,
 * ou o id da subconta. As chamadas vão para a mesma origem, com o cookie da sessão.
 */
export function createGraaoRepo(workspace: string) {
  const ws = `workspace=${encodeURIComponent(workspace)}`;
  const post = (action: string, body: unknown) => fetch(`/api/prancheta/${action}?${ws}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const repo = {
    workspace,
    async getFile(id: string): Promise<PranchetaFile> {
      const res = await fetch(`/api/prancheta/file?${ws}&id=${encodeURIComponent(id)}`, { credentials: "same-origin" });
      if (res.status === 404) throw new Error("Arte não encontrada. Ela pode ter sido excluída.");
      if (!res.ok) throw new Error(await problem(res, "Não foi possível abrir a arte"));
      return await res.json() as PranchetaFile;
    },
    async createFile(document: DocumentData, thumbnail?: string | null): Promise<PranchetaFile> {
      const res = await post("save", documentPayload(document, thumbnail));
      if (!res.ok) throw new Error(await problem(res, "Não foi possível criar a arte"));
      const data = await res.json();
      return repo.getFile(data.id);
    },
    async saveFile(id: string, document: DocumentData, expectedUpdatedAt: string): Promise<PranchetaFileInfo> {
      const res = await post("save", { id, ...documentPayload(document), expectedUpdatedAt });
      if (res.status === 409) throw new PranchetaConflictError();
      if (!res.ok) throw new Error(await problem(res, "Não foi possível salvar"));
      const data = await res.json();
      if (!data.file) throw new PranchetaConflictError();
      return data.file as PranchetaFileInfo;
    },
    async saveThumbnail(id: string, thumbnail: string) {
      try {
        const res = await post("save", { id, thumbnail });
        return res.ok ? ((await res.json()).file as PranchetaFileInfo | null) : null;
      } catch {
        return null;
      }
    },
    async exportToMedia(id: string, name: string, dataUri: string) {
      const res = await post("export-media", { id, name, data: dataUri });
      if (!res.ok) throw new Error(await problem(res, "Não foi possível enviar ao Mídia Drive"));
      return await res.json() as { ok: boolean; fileId: string };
    },
    async sendToSocial(id: string, name: string, dataUri: string) {
      const res = await post("to-social", { id, name, body: name, data: dataUri });
      if (!res.ok) throw new Error(await problem(res, "Não foi possível criar o post"));
      return await res.json() as { ok: boolean; postId: string; fileId: string };
    },
  };
  return repo;
}

export type GraaoRepo = ReturnType<typeof createGraaoRepo>;
/** Interface usada pela sessão de salvamento. */
export type PranchetaRepo = Pick<GraaoRepo, "getFile" | "saveFile">;
