import React, { lazy, Suspense } from 'react';
import GenerarIcon from '../GenerarIcon';
import type { GenerarModule, GenerarModuleContext, GenerarModuleProps } from '../types';

const modules: Record<GenerarModule, React.LazyExoticComponent<React.ComponentType<any>>> = {
  imagen: lazy(() => import('./imagen')),
  video: lazy(() => import('./video')),
  audio: lazy(() => import('./audio')),
  musica: lazy(() => import('./musica')),
  '3d': lazy(() => import('./3d')),
};

const moduleMeta: Array<{
  id: GenerarModule;
  label: string;
  description: string;
}> = [
  { id: 'imagen', label: 'IMAGEN', description: 'Modelos de imagen dedicados' },
  { id: 'video', label: 'VIDEO', description: 'Procesamiento de video' },
  { id: 'audio', label: 'AUDIO', description: 'Voz y procesamiento' },
  { id: 'musica', label: 'MÚSICA', description: 'Motor musical dedicado' },
  { id: '3d', label: '3D', description: 'Reconstrucción y malla' },
];

export default function GpuWorkspace({
  activeModule,
  onModule,
  context,
}: {
  activeModule: GenerarModule | null;
  onModule: (module: GenerarModule | null) => void;
  context: GenerarModuleContext;
}) {
  if (!activeModule) {
    return (
      <div className="generar-module-grid">
        {moduleMeta.map((item) => (
          <button
            key={item.id}
            type="button"
            className="generar-module-button glass-glow-button"
            onClick={() => onModule(item.id)}
          >
            <span className="generar-choice-icon"><GenerarIcon name={item.id} /></span>
            <span className="generar-module-copy">
              <strong>{item.label}</strong>
              <span>{item.description}</span>
              <em>SIGUIENTE</em>
            </span>
          </button>
        ))}
      </div>
    );
  }

  const Active = modules[activeModule] as React.LazyExoticComponent<React.ComponentType<GenerarModuleProps>>;

  return (
    <div className="generar-module-shell">
      <div className="generar-module-toolbar">
        <button
          type="button"
          className="generar-back-button glass-glow-button"
          aria-label="Volver a GPU"
          onClick={() => onModule(null)}
        >
          ← GPU
        </button>
      </div>
      <Suspense fallback={<div className="generar-loading">Cargando…</div>}>
        <Active context={context} />
      </Suspense>
    </div>
  );
}
