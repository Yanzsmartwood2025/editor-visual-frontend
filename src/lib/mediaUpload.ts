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
};

export type UploadableMediaFile = Pick<File, 'name' | 'type'> & Blob;

type UploadMediaToBodegaParams = {
  session: FirebaseSession;
  files: UploadableMediaFile[];
  existingItems?: MediaItem[];
  forcedTipo?: MediaKind;
  fuente?: string;
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
  if (extension && extension !== file.name.toLowerCase()) return extension.replace(/[^a-z0-9]/g, '') || defaultExtensionForKind(tipo);
  if (file.type.includes('/')) return file.type.split('/')[1].split(';')[0].replace(/[^a-z0-9]/g, '') || defaultExtensionForKind(tipo);
  return defaultExtensionForKind(tipo);
};

const fallbackUuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });

export const createMediaId = (): string => globalThis.crypto?.randomUUID?.() || fallbackUuid();

type R2UploadResponse = { key: string; url: string };

const uploadFileToR2 = async (file: UploadableMediaFile, session: FirebaseSession, mediaId: string, extension: string): Promise<R2UploadResponse> => {
  const formData = new FormData();
  formData.append('file', file, file.name);
  formData.append('mediaId', mediaId);
  formData.append('extension', extension);

  const response = await fetch('/api/r2/upload', {
    method: 'POST',
    headers: firebaseHeaders(session),
    body: formData,
  });
  const data = await response.json() as R2UploadResponse & { error?: string };
  if (!response.ok) throw new Error(data.error || `Error subiendo ${file.name} a R2.`);
  return data;
};

const deleteR2Files = async (keys: string[], session: FirebaseSession) => {
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
  fuente = 'manual'
}: UploadMediaToBodegaParams): Promise<MediaItem[]> => {
  if (!session?.user?.id) throw new Error('Debes iniciar sesión para guardar archivos en la Bóveda.');

  const nuevosItems: MediaItem[] = [];
  const uploadedKeys: string[] = [];

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const tipo = resolveMediaKind(file, forcedTipo) || forcedTipo;
      if (!tipo) throw new Error(`Tipo de archivo no soportado: ${file.name}`);

      const countTipo = existingItems.filter(item => item.tipo === tipo).length + nuevosItems.filter(item => item.tipo === tipo).length + 1;
      const inicial = tipo === 'video' ? 'V' : tipo === 'foto' ? 'F' : 'A';
      const id = createMediaId();
      const extension = getExtension(file, tipo);

      let metadata: MediaMetadata = {};
      try {
        metadata = await probeMediaFile(file, tipo);
      } catch (error) {
        console.warn(`No se pudo detectar metadata local de ${file.name}; la subida continuará.`, error);
      }

      const { key, url } = await uploadFileToR2(file, session, id, extension);
      uploadedKeys.push(key);

      nuevosItems.push({
        id,
        url,
        tipo,
        nombre: file.name || `${inicial}${countTipo}.${extension}`,
        creado_en: new Date().toISOString(),
        esOverlay: false,
        etiqueta: `${inicial}${countTipo}`,
        fuente,
        metadata,
      });
    }
  } catch (error) {
    await deleteR2Files(uploadedKeys, session);
    throw error;
  }

  const response = await fetch('/api/galeria', {
    method: 'POST',
    headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ items: nuevosItems }),
  });
  const data = await response.json() as { error?: string };

  if (!response.ok) {
    await deleteR2Files(uploadedKeys, session);
    throw new Error(`Error registrando archivos en la Bóveda: ${data.error || 'Error desconocido.'}`);
  }

  return nuevosItems;
};
