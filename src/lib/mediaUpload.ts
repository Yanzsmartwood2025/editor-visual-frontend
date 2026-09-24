import type { FirebaseSession } from './firebaseClient';
import { firebaseHeaders } from './apiClient';
import { probeMediaFile, type MediaMetadata } from './mediaMetadata';

export type MediaKind = 'foto' | 'video' | 'audio';
export type UploadKind = MediaKind | 'modelo3d' | 'documento';

export type DocumentItem = {
  id: string;
  url: string;
  tipo: 'documento';
  nombre: string;
  creado_en: string;
  etiqueta: string;
  fuente?: string;
  metadata?: Record<string, unknown>;
  r2_key?: string | null;
  project_id?: string | null;
  thread_id?: string | null;
  privacy?: 'private' | 'public';
};

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

export type UploadProgressSnapshot = {
  percent: number;
  loadedBytes: number;
  totalBytes: number;
  fileIndex: number;
  fileCount: number;
  fileName: string;
  phase: 'uploading' | 'registering' | 'done';
};

export type UploadProgressHandler = (progress: UploadProgressSnapshot) => void;

type UploadMediaToBodegaParams = {
  session: FirebaseSession;
  files: UploadableMediaFile[];
  existingItems?: MediaItem[];
  forcedTipo?: MediaKind;
  fuente?: string;
  metadataExtra?: Partial<MediaMetadata>;
  projectId?: string;
  threadId?: string;
  labelMode?: 'media' | 'result';
  onProgress?: UploadProgressHandler;
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

const nextLabelNumber = (
  items: Array<{ tipo: MediaKind; etiqueta?: string | null }>,
  tipo: MediaKind
) => {
  const prefix = tipo === 'video' ? 'V' : tipo === 'foto' ? 'F' : 'A';
  const max = items.reduce((current, item) => {
    if (item.tipo !== tipo || typeof item.etiqueta !== 'string') return current;
    const match = item.etiqueta.trim().toUpperCase().match(/^([FVA])(\d+)$/);
    if (!match || match[1] !== prefix) return current;
    return Math.max(current, Number(match[2]) || 0);
  }, 0);
  return max + 1;
};

const nextResultLabelNumber = (
  items: Array<{ etiqueta?: string | null }>
) => {
  const max = items.reduce((current, item) => {
    if (typeof item.etiqueta !== 'string') return current;
    const match = item.etiqueta.trim().toUpperCase().match(/^R(\d+)$/);
    return match ? Math.max(current, Number(match[1]) || 0) : current;
  }, 0);
  return max + 1;
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
        ? 'Este archivo necesita la ruta de subida directa de Nayla.'
        : `Nayla recibió una respuesta inesperada (${response.status}): ${preview || 'respuesta vacía'}`
    );
  }
};


const NAYLA_FALLBACK_UPLOAD_LIMIT = 4 * 1024 * 1024;

const uploadThroughNaylaFallback = async ({
  file,
  session,
  mediaId,
  extension,
  contentType,
  kind,
  projectId,
  threadId,
}: {
  file: UploadableMediaFile;
  session: FirebaseSession;
  mediaId: string;
  extension: string;
  contentType: string;
  kind: UploadKind;
  projectId?: string;
  threadId?: string;
}): Promise<R2UploadResponse> => {
  if (file.size > NAYLA_FALLBACK_UPLOAD_LIMIT) {
    throw new Error('Nayla no pudo completar la subida directa de este archivo. Intenta nuevamente en unos segundos.');
  }

  const form = new FormData();
  form.append('file', file, file.name);
  form.append('mediaId', mediaId);
  form.append('extension', extension);
  form.append('kind', kind);
  if (projectId) form.append('projectId', projectId);
  if (threadId) form.append('threadId', threadId);

  const response = await fetch('/api/r2/upload-proxy', {
    method: 'POST',
    headers: firebaseHeaders(session),
    body: form,
  });

  const payload = await readApiJson<R2UploadResponse & { error?: string }>(response);
  if (!response.ok || !payload.key || !payload.url) {
    throw new Error(payload.error || 'Nayla no pudo completar la subida en este intento.');
  }

  return {
    key: payload.key,
    url: payload.url,
    projectId: payload.projectId,
    threadId: payload.threadId,
  };
};

export const uploadFileToR2 = async (
  file: UploadableMediaFile,
  session: FirebaseSession,
  mediaId: string,
  extension: string,
  scope?: {
    kind?: UploadKind;
    projectId?: string;
    threadId?: string;
    onProgress?: (loadedBytes: number, totalBytes: number) => void;
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
    throw new Error(signed.error || `No se pudo autorizar la subida de ${file.name} a la Bóveda.`);
  }

  const uploadOk = await new Promise<boolean>((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', signed.uploadUrl);
      xhr.setRequestHeader('Content-Type', signed.contentType || contentType);
      xhr.upload.onprogress = (event) => {
        const total = event.lengthComputable && event.total > 0 ? event.total : file.size;
        scope?.onProgress?.(Math.min(event.loaded, total), total);
      };
      xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
      xhr.onerror = () => resolve(false);
      xhr.onabort = () => resolve(false);
      xhr.send(file);
    } catch {
      resolve(false);
    }
  });

  if (!uploadOk) {
    return uploadThroughNaylaFallback({
      file,
      session,
      mediaId,
      extension,
      contentType: signed.contentType || contentType,
      kind: scope?.kind || 'foto',
      projectId: signed.projectId || scope?.projectId,
      threadId: signed.threadId || scope?.threadId,
    }).then((result) => {
      scope?.onProgress?.(file.size, file.size);
      return result;
    });
  }

  scope?.onProgress?.(file.size, file.size);

  return {
    key: signed.key,
    url: signed.url,
    projectId: signed.projectId,
    threadId: signed.threadId,
  };
};

export const DOCUMENT_EXTENSIONS = [
  'pdf', 'txt', 'md', 'markdown', 'csv', 'json', 'rtf', 'doc', 'docx'
] as const;

export const isSupportedDocumentFile = (file: Pick<File, 'name' | 'type'>) => {
  const mime = String(file.type || '').toLowerCase();
  if (
    mime === 'application/pdf' ||
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/rtf' ||
    mime.startsWith('text/') ||
    mime === 'application/json'
  ) {
    return true;
  }

  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  return (DOCUMENT_EXTENSIONS as readonly string[]).includes(extension);
};

const nextDocumentLabelNumber = (
  items: Array<{ etiqueta?: string | null }>
) => {
  const max = items.reduce((current, item) => {
    if (typeof item.etiqueta !== 'string') return current;
    const match = item.etiqueta.trim().toUpperCase().match(/^D(\d+)$/);
    return match ? Math.max(current, Number(match[1]) || 0) : current;
  }, 0);
  return max + 1;
};

const getDocumentExtension = (file: Pick<File, 'name' | 'type'>) => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension && extension !== file.name.toLowerCase()) {
    return extension.replace(/[^a-z0-9]/g, '').slice(0, 10) || 'txt';
  }
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type === 'application/json') return 'json';
  if (file.type.startsWith('text/')) return 'txt';
  return 'bin';
};

const getDocumentTextPreview = async (file: UploadableMediaFile) => {
  const mime = String(file.type || '').toLowerCase();
  const extension = file.name.split('.').pop()?.toLowerCase() || '';
  const textLike =
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    ['txt', 'md', 'markdown', 'csv', 'json'].includes(extension);

  if (!textLike || file.size > 1024 * 1024) return undefined;

  try {
    const text = await file.text();
    return text.replace(/\0/g, '').slice(0, 12000);
  } catch {
    return undefined;
  }
};

export const uploadDocumentFilesToBodega = async ({
  session,
  files,
  existingItems = [],
  fuente = 'manual-documento',
  projectId,
  threadId,
  onProgress,
}: {
  session: FirebaseSession;
  files: UploadableMediaFile[];
  existingItems?: DocumentItem[];
  fuente?: string;
  projectId?: string;
  threadId?: string;
  onProgress?: UploadProgressHandler;
}): Promise<DocumentItem[]> => {
  if (!session?.user?.id) throw new Error('Debes iniciar sesión para guardar documentos.');
  if (!files.length) return [];

  const nuevosItems: DocumentItem[] = [];
  const uploadedKeys: string[] = [];
  let resolvedProjectId = projectId;
  let resolvedThreadId = threadId;
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  let completedBytes = 0;

  try {
    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex];
      if (!isSupportedDocumentFile(file)) {
        throw new Error(`Documento no soportado: ${file.name}`);
      }

      const id = createMediaId();
      const extension = getDocumentExtension(file);
      const uploaded = await uploadFileToR2(file, session, id, extension, {
        kind: 'documento',
        projectId: resolvedProjectId,
        threadId: resolvedThreadId,
        onProgress: (loadedBytes) => {
          const overallLoaded = completedBytes + Math.min(file.size, loadedBytes);
          const percent = totalBytes > 0 ? Math.min(98, Math.floor((overallLoaded / totalBytes) * 98)) : 0;
          onProgress?.({
            percent,
            loadedBytes: overallLoaded,
            totalBytes,
            fileIndex: fileIndex + 1,
            fileCount: files.length,
            fileName: file.name,
            phase: 'uploading',
          });
        },
      });
      completedBytes += file.size;
      uploadedKeys.push(uploaded.key);
      resolvedProjectId = uploaded.projectId || resolvedProjectId;
      resolvedThreadId = uploaded.threadId || resolvedThreadId;

      const labelNumber = nextDocumentLabelNumber([...existingItems, ...nuevosItems]);
      const textPreview = await getDocumentTextPreview(file);

      nuevosItems.push({
        id,
        url: uploaded.url,
        r2_key: uploaded.key,
        project_id: resolvedProjectId || null,
        thread_id: resolvedThreadId || null,
        privacy: 'private',
        tipo: 'documento',
        nombre: file.name || `D${labelNumber}.${extension}`,
        creado_en: new Date().toISOString(),
        etiqueta: `D${labelNumber}`,
        fuente,
        metadata: {
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          extension,
          ...(textPreview ? { textPreview } : {}),
        },
      });
    }
  } catch (error) {
    await deleteR2Files(uploadedKeys, session);
    throw error;
  }

  onProgress?.({
    percent: 99,
    loadedBytes: totalBytes,
    totalBytes,
    fileIndex: files.length,
    fileCount: files.length,
    fileName: files[files.length - 1]?.name || '',
    phase: 'registering',
  });
  const response = await fetch('/api/galeria', {
    method: 'POST',
    headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      items: nuevosItems,
      projectId: resolvedProjectId,
      threadId: resolvedThreadId,
    }),
  });
  const payload = await response.json() as { error?: string; data?: DocumentItem[] };

  if (!response.ok) {
    await deleteR2Files(uploadedKeys, session);
    throw new Error(`Error registrando documentos: ${payload.error || 'Error desconocido.'}`);
  }

  onProgress?.({
    percent: 100,
    loadedBytes: totalBytes,
    totalBytes,
    fileIndex: files.length,
    fileCount: files.length,
    fileName: files[files.length - 1]?.name || '',
    phase: 'done',
  });
  return payload.data || nuevosItems;
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
  labelMode = 'media',
  onProgress,
}: UploadMediaToBodegaParams): Promise<MediaItem[]> => {
  if (!session?.user?.id) throw new Error('Debes iniciar sesión para guardar archivos en la Bóveda.');

  const nuevosItems: MediaItem[] = [];
  const uploadedKeys: string[] = [];
  let resolvedProjectId = projectId;
  let resolvedThreadId = threadId;
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  let completedBytes = 0;

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const tipo = resolveMediaKind(file, forcedTipo) || forcedTipo;
      if (!tipo) throw new Error(`Tipo de archivo no soportado: ${file.name}`);

      const inicial = tipo === 'video' ? 'V' : tipo === 'foto' ? 'F' : 'A';
      const countTipo = labelMode === 'result'
        ? nextResultLabelNumber([...existingItems, ...nuevosItems])
        : nextLabelNumber([...existingItems, ...nuevosItems], tipo);
      const etiqueta = labelMode === 'result' ? `R${countTipo}` : `${inicial}${countTipo}`;
      const id = createMediaId();
      const extension = getExtension(file, tipo);

      const metadataPromise = probeMediaFile(file, tipo).catch((error) => {
        console.warn(`No se pudo detectar metadata local de ${file.name}; la subida continuará.`, error);
        return {} as MediaMetadata;
      });

      const uploadPromise = uploadFileToR2(file, session, id, extension, {
        kind: tipo,
        projectId: resolvedProjectId,
        threadId: resolvedThreadId,
        onProgress: (loadedBytes) => {
          const overallLoaded = completedBytes + Math.min(file.size, loadedBytes);
          const percent = totalBytes > 0 ? Math.min(98, Math.floor((overallLoaded / totalBytes) * 98)) : 0;
          onProgress?.({
            percent,
            loadedBytes: overallLoaded,
            totalBytes,
            fileIndex: i + 1,
            fileCount: files.length,
            fileName: file.name,
            phase: 'uploading',
          });
        },
      });

      const [metadata, uploaded] = await Promise.all([metadataPromise, uploadPromise]);
      completedBytes += file.size;
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
        etiqueta,
        fuente,
        metadata: { ...metadata, ...metadataExtra },
      });
    }
  } catch (error) {
    await deleteR2Files(uploadedKeys, session);
    throw error;
  }

  onProgress?.({
    percent: 99,
    loadedBytes: totalBytes,
    totalBytes,
    fileIndex: files.length,
    fileCount: files.length,
    fileName: files[files.length - 1]?.name || '',
    phase: 'registering',
  });
  const response = await fetch('/api/galeria', {
    method: 'POST',
    headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      items: nuevosItems,
      projectId: resolvedProjectId,
      threadId: resolvedThreadId,
      labelMode,
    }),
  });
  const payload = await response.json() as { error?: string; data?: MediaItem[] };

  if (!response.ok) {
    await deleteR2Files(uploadedKeys, session);
    throw new Error(`Error registrando archivos en la Bóveda: ${payload.error || 'Error desconocido.'}`);
  }

  onProgress?.({
    percent: 100,
    loadedBytes: totalBytes,
    totalBytes,
    fileIndex: files.length,
    fileCount: files.length,
    fileName: files[files.length - 1]?.name || '',
    phase: 'done',
  });
  return payload.data || nuevosItems;
};
