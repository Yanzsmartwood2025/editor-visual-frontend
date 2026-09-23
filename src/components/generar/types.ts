export type GenerarEngine = 'api' | 'gpu';
export type GenerarModule = 'imagen' | 'video' | 'audio' | 'musica' | '3d';

export type GenerarRoute = {
  engine: GenerarEngine | null;
  module: GenerarModule | null;
};
