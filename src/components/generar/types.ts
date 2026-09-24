import type { FirebaseSession } from '../../lib/firebaseClient';
import type { Model3DAsset } from '../../lib/model3d';

export type GenerarEngine = 'api' | 'gpu';
export type GenerarModule = 'imagen' | 'video' | 'audio' | 'musica' | '3d';

export type GenerarRoute = {
  engine: GenerarEngine | null;
  module: GenerarModule | null;
};

export type GenerarMediaItem = {
  id: string;
  url: string;
  tipo: 'foto' | 'video' | 'audio';
  nombre: string;
  creado_en?: string;
  esOverlay?: boolean;
  etiqueta?: string;
  fuente?: string;
  metadata?: Record<string, unknown>;
  r2_key?: string | null;
  project_id?: string | null;
  thread_id?: string | null;
  privacy?: 'private' | 'public';
};

export type Generar3DStudioContext = {
  assets: Model3DAsset[];
  activeAssetId: string | null;
  uploading?: boolean;
  onSelect: (asset: Model3DAsset) => void;
  onUpload: (files: FileList) => void;
  onDelete: (asset: Model3DAsset) => void;
  onNaylaAction: (
    mode: 'text_to_3d' | 'image_to_3d' | 'multiview_to_3d' | 'texture' | 'optimize' | 'rig' | 'animate' | 'retarget',
    prompt?: string
  ) => void;
  onGenerated: (asset: Model3DAsset) => void;
};

export type GenerarModuleContext = {
  session: FirebaseSession | null;
  projectId: string | null;
  threadId: string | null;
  onUseMedia?: (item: GenerarMediaItem) => void | Promise<void>;
  threeDStudio?: Generar3DStudioContext;
};

export type GenerarModuleProps = {
  context: GenerarModuleContext;
};
