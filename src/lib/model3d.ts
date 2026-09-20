import type { FirebaseSession } from './firebaseClient';
import { firebaseHeaders } from './apiClient';
import {
  createMediaId,
  deleteR2Files,
  uploadFileToR2,
  type UploadableMediaFile,
} from './mediaUpload';

export type Model3DAsset = {
  id: string;
  url: string;
  tipo: 'modelo3d';
  nombre: string;
  creado_en: string;
  esOverlay: false;
  etiqueta: string;
  fuente?: string;
  metadata?: {
    format?: 'glb';
    sourceProvider?: string;
    sourceTaskId?: string;
    sourceUrl?: string;
    rigged?: boolean;
    animated?: boolean;
    [key: string]: unknown;
  };
};

export const isSupportedModel3DFile = (file: Pick<File, 'name' | 'type'>) => {
  const extension = file.name.split('.').pop()?.toLowerCase();
  return extension === 'glb' || file.type === 'model/gltf-binary';
};

export const uploadModel3DToBoveda = async ({
  session,
  file,
  existingItems = [],
  fuente = 'manual-3d',
  metadata = {},
}: {
  session: FirebaseSession;
  file: UploadableMediaFile;
  existingItems?: Model3DAsset[];
  fuente?: string;
  metadata?: NonNullable<Model3DAsset['metadata']>;
}): Promise<Model3DAsset> => {
  if (!session?.user?.id) throw new Error('Debes iniciar sesión para guardar modelos 3D.');
  if (!isSupportedModel3DFile(file)) throw new Error('Por ahora la Bóveda 3D acepta archivos GLB.');
  if (file.size > 150 * 1024 * 1024) {
    throw new Error('El modelo supera 150 MB. Optimízalo antes de subirlo a la Bóveda web.');
  }

  const id = createMediaId();
  const labelNumber = existingItems.length + 1;
  const uploadable =
    file.type === 'model/gltf-binary'
      ? file
      : new File([file], file.name, { type: 'model/gltf-binary' });

  const uploaded = await uploadFileToR2(uploadable, session, id, 'glb');

  const item: Model3DAsset = {
    id,
    url: uploaded.url,
    tipo: 'modelo3d',
    nombre: file.name || `Modelo 3D ${labelNumber}.glb`,
    creado_en: new Date().toISOString(),
    esOverlay: false,
    etiqueta: `M${labelNumber}`,
    fuente,
    metadata: {
      format: 'glb',
      ...metadata,
    },
  };

  const response = await fetch('/api/galeria', {
    method: 'POST',
    headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ items: [item] }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };

  if (!response.ok) {
    await deleteR2Files([uploaded.key], session);
    throw new Error(`No se pudo registrar el modelo 3D en la Bóveda: ${payload.error || 'Error desconocido.'}`);
  }

  return item;
};

export const deleteModel3DFromBoveda = async ({
  session,
  item,
}: {
  session: FirebaseSession;
  item: Model3DAsset;
}) => {
  if (!session?.user?.id) throw new Error('Debes iniciar sesión para eliminar modelos 3D.');

  try {
    const key = decodeURIComponent(new URL(item.url).pathname.replace(/^\/+/, ''));
    if (key.startsWith(`${session.user.id}/`)) {
      await deleteR2Files([key], session);
    }
  } catch (error) {
    console.warn('No se pudo eliminar el objeto 3D físico; se quitará el registro.', error);
  }

  const response = await fetch('/api/galeria', {
    method: 'DELETE',
    headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ids: [item.id] }),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || 'No se pudo eliminar el modelo 3D de la Bóveda.');
  }
};
