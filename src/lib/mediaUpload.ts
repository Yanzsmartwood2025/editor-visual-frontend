import type { SupabaseClient, Session } from '@supabase/supabase-js';

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
};

export type UploadableMediaFile = Pick<File, 'name' | 'type'> & Blob;

type UploadMediaToBodegaParams = {
  supabase: SupabaseClient;
  session: Session;
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

const buildMediaId = (index: number): string => `${Date.now()}-${index}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;

export const uploadMediaFilesToBodega = async ({
  supabase,
  session,
  files,
  existingItems = [],
  forcedTipo,
  fuente = 'manual'
}: UploadMediaToBodegaParams): Promise<MediaItem[]> => {
  if (!session?.user?.id) throw new Error('Debes iniciar sesión para guardar archivos en la Bóveda.');

  const nuevosItems: MediaItem[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const tipo = forcedTipo || resolveMediaKind(file);
    if (!tipo) throw new Error(`Tipo de archivo no soportado: ${file.name}`);

    const countTipo = existingItems.filter(item => item.tipo === tipo).length + nuevosItems.filter(item => item.tipo === tipo).length + 1;
    const inicial = tipo === 'video' ? 'V' : tipo === 'foto' ? 'F' : 'A';
    const id = buildMediaId(i);
    const fileName = `${session.user.id}/${id}.${getExtension(file, tipo)}`;

    const { error: uploadError } = await supabase.storage.from('media_bodega').upload(fileName, file, {
      contentType: file.type || undefined,
      upsert: false
    });

    if (uploadError) throw new Error(`Error subiendo ${file.name}: ${uploadError.message}`);

    const { data: { publicUrl } } = supabase.storage.from('media_bodega').getPublicUrl(fileName);

    nuevosItems.push({
      id,
      url: publicUrl,
      tipo,
      nombre: file.name || `${inicial}${countTipo}.${getExtension(file, tipo)}`,
      creado_en: new Date().toISOString(),
      esOverlay: false,
      etiqueta: `${inicial}${countTipo}`,
      fuente
    });
  }

  const { error: insertError } = await supabase
    .from('galeria_multimedia')
    .insert(nuevosItems.map(item => ({ ...item, user_id: session.user.id })));

  if (insertError) {
    const uploadedPaths = nuevosItems.map(item => decodeURIComponent(item.url.split('/storage/v1/object/public/media_bodega/')[1] || '')).filter(Boolean);
    if (uploadedPaths.length > 0) await supabase.storage.from('media_bodega').remove(uploadedPaths);
    throw new Error(`Error registrando archivos en la Bóveda: ${insertError.message}`);
  }

  return nuevosItems;
};
