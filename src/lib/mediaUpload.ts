import type { FirebaseSession } from './firebaseClient';
import { firebaseHeaders } from './apiClient';
import { probeMediaFile, type MediaMetadata } from './mediaMetadata';

export type MediaKind = 'foto' | 'video' | 'audio';

export type MediaItem = {
  id: string;
  url: string;
  tipo: MediaKind;
  nombre: string;
  creado_en: string;
  esOverlay: boolean;
  etiqueta: string;
  fuente?: string;
  metadata?: MediaMetadata;
  r2_key?: string | null;
  project_id?: string | null;
  thread_id?: string | null;
  privacy?: 'private' | 'public';
};

export type UploadableMediaFile = Pick<File, 'name' | 'type'> & Blob;

type UploadMediaToBodegaParams = {
  session: FirebaseSession;
  files: UploadableMediaFile[];
  existingItems?: MediaItem[];
  forcedTipo?: MediaKind;
  fuente?: string;
  metadataExtra?: Partial<MediaMetadata>;
  projectId?: string;
  threadId?: string;
};

export const SHARED_MEDIA_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export const resolveMediaKind = (file: Pick<File, 'name' | 'type'>, fallback?: MediaKind): MediaKind | null => {
  if (file.type.startsWith('image/')) return 'foto';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';

  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension) return fallback || null;

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif'].includes(extension)) return 'foto';
  if (['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'].includes(extension)) return 'video';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac'].includes(extension)) return 'audio';

  return fallback || null;
};

const defaultExtensionForKind = (tipo: MediaKind): string => {
  if (tipo === 'foto') return 'jpg';
  if (tipo === 'video') return 'mp4';
  return 'mp3';
};

const getExtension = (file: Pick<File, 'name' | 'type'>, tipo: MediaKind): string => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && extension !== file.name.toLowerCase()) {
    return extension.replace(/[^a-z0-9]/g, '') || defaultExtensionForKind(tipo);
  }
  if (file.type.includes('/')) {
    return file.type.split('/')[1].split(';')[0].replace(/[^a-z0-9]/g, '') || defaultExtensionForKind(tipo);
  }
  return defaultExtensionForKind(tipo);
};

const fallbackUuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });

export const createMediaId = (): string => globalThis.crypto?.randomUUID?.() || fallbackUuid();

type R2UploadResponse = {
  key: string;
  url: string;
  projectId?: string;
  threadId?: string | null;
};

type R2PresignResponse = R2UploadResponse & {
  uploadUrl: string;
  contentType: string;
  expiresIn: number;
  privacy?: 'private';
  error?: string;
};

const readApiJson = async <T extends Record<string, unknown>>(response: Response): Promise<T> => {
  const raw = await response.text();
  if (!raw) return {} as T;

  try {
    return JSON.parse(raw) as T;
  } catch {
    const preview = raw.replace(/\s+/g, ' ').trim().slice(0, 140);
    throw new Error(
      response.status === 413
        ? 'El archivo es demasiado grande para pasar por Vercel. La subida directa a R2 no pudo iniciarse.'
        : `El servidor respondió en un formato inesperado (${response.status}): ${preview || 'respuesta vacía'}`
    );
  }
};

export const uploadFileToR2 = async (
  file: UploadableMediaFile,
  session: FirebaseSession,
  mediaId: string,
  extension: string,
  scope?: {
    kind?: MediaKind | 'modelo3d';
    projectId?: string;
    threadId?: string;
  }
): Promise<R2UploadResponse> => {
  const contentType = (file.type || 'application/octet-stream').toLowerCase();

  const authorization = await fetch('/api/r2/presign-upload', {
    method: 'POST',
    headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      mediaId,
      extension,
      contentType,
      size: file.size,
      kind: scope?.kind || 'foto',
      projectId: scope?.projectId,
      threadId: scope?.threadId,
    }),
  });

  const signed = await readApiJson<R2PresignResponse>(authorization);
  if (!authorization.ok || !signed.uploadUrl || !signed.key || !signed.url) {
    throw new Error(signed.error || `No se pudo autorizar la subida de ${file.name} a R2.`);
  }

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(signed.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': signed.contentType || contentType,
      },
      body: file,
    });
  } catch {
    throw new Error(
      'No se pudo enviar el archivo directamente a Cloudflare R2. Revisa CORS del bucket para permitir PUT desde el dominio de Nayla.'
    );
  }

  if (!uploadResponse.ok) {
    const details = (await uploadResponse.text()).replace(/\s+/g, ' ').trim().slice(0, 180);
    throw new Error(
      `Cloudflare R2 rechazó la subida (${uploadResponse.status}). ${details || 'Verifica CORS y la autorización temporal.'}`
    );
  }

  return {
    key: signed.key,
    url: signed.url,
    projectId: signed.projectId,
    threadId: signed.threadId,
  };
};

export const deleteR2Files = async (keys: string[], session: FirebaseSession) => {
  await Promise.allSettled(keys.map(async (key) => {
    await fetch('/api/r2/delete', {
      method: 'DELETE',
      headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ key }),
    });
  }));
};

export const uploadMediaFilesToBodega = async ({
  session,
  files,
  existingItems = [],
  forcedTipo,
  fuente = 'manual',
  metadataExtra = {},
  projectId,
  threadId,
}: UploadMediaToBodegaParams): Promise<MediaItem[]> => {
  if (!session?.user?.id) throw new Error('Debes iniciar sesión para guardar archivos en la Bóveda.');

  const nuevosItems: MediaItem[] = [];
  const uploadedKeys: string[] = [];
  let resolvedProjectId = projectId;
  let resolvedThreadId = threadId;

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const tipo = resolveMediaKind(file, forcedTipo) || forcedTipo;
      if (!tipo) throw new Error(`Tipo de archivo no soportado: ${file.name}`);

      const countTipo =
        existingItems.filter((item) => item.tipo === tipo).length +
        nuevosItems.filter((item) => item.tipo === tipo).length +
        1;
      const inicial = tipo === 'video' ? 'V' : tipo === 'foto' ? 'F' : 'A';
      const id = createMediaId();
      const extension = getExtension(file, tipo);

      let metadata: MediaMetadata = {};
      try {
        metadata = await probeMediaFile(file, tipo);
      } catch (error) {
        console.warn(`No se pudo detectar metadata local de ${file.name}; la subida continuará.`, error);
      }

      const uploaded = await uploadFileToR2(file, session, id, extension, {
        kind: tipo,
        projectId: resolvedProjectId,
        threadId: resolvedThreadId,
      });
      uploadedKeys.push(uploaded.key);
      resolvedProjectId = uploaded.projectId || resolvedProjectId;
      resolvedThreadId = uploaded.threadId || resolvedThreadId;

      nuevosItems.push({
        id,
        url: uploaded.url,
        r2_key: uploaded.key,
        project_id: resolvedProjectId || null,
        thread_id: resolvedThreadId || null,
        privacy: 'private',
        tipo,
        nombre: file.name || `${inicial}${countTipo}.${extension}`,
        creado_en: new Date().toISOString(),
        esOverlay: false,
        etiqueta: `${inicial}${countTipo}`,
        fuente,
        metadata: { ...metadata, ...metadataExtra },
      });
    }
  } catch (error) {
    await deleteR2Files(uploadedKeys, session);
    throw error;
  }

  const response = await fetch('/api/galeria', {
    method: 'POST',
    headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      items: nuevosItems,
      projectId: resolvedProjectId,
      threadId: resolvedThreadId,
    }),
  });
  const payload = await response.json() as { error?: string; data?: MediaItem[] };

  if (!response.ok) {
    await deleteR2Files(uploadedKeys, session);
    throw new Error(`Error registrando archivos en la Bóveda: ${payload.error || 'Error desconocido.'}`);
  }

  return payload.data || nuevosItems;
};
