import type { FirebaseSession } from '../../lib/firebaseClient';

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

export type GenerarModuleContext = {
  session: FirebaseSession | null;
  projectId: string | null;
  threadId: string | null;
  onUseMedia?: (item: GenerarMediaItem) => void | Promise<void>;
};

export type GenerarModuleProps = {
  context: GenerarModuleContext;
};
