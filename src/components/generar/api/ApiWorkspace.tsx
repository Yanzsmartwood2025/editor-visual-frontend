import React, { lazy, Suspense, useEffect, useState } from 'react';
import { firebaseHeaders } from '../../../lib/apiClient';
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
  { id: 'imagen', label: 'IMAGEN', description: 'Texto → imagen' },
  { id: 'video', label: 'VIDEO', description: 'Texto → video · 5 s' },
  { id: 'audio', label: 'AUDIO', description: 'Texto → voz' },
  { id: 'musica', label: 'MÚSICA', description: 'Texto → música' },
  { id: '3d', label: '3D', description: 'Texto → 3D · Estudio' },
];

type RuntimeCheck = 'idle' | 'checking' | 'ready' | 'error';

export default function ApiWorkspace({
  activeModule,
  onModule,
  context,
}: {
  activeModule: GenerarModule | null;
  onModule: (module: GenerarModule | null) => void;
  context: GenerarModuleContext;
}) {
  const [runtimeCheck, setRuntimeCheck] = useState<RuntimeCheck>('idle');
  const [routeAvailability, setRouteAvailability] = useState<Partial<Record<GenerarModule, boolean>>>({});

  useEffect(() => {
    const controller = new AbortController();

    if (!context.session) {
      setRuntimeCheck('idle');
      setRouteAvailability({});
      return () => controller.abort();
    }

    setRuntimeCheck('checking');

    void fetch('/api/media/providers', {
      method: 'GET',
      headers: firebaseHeaders(context.session),
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload?.error || 'No se pudo comprobar Nayla Cloud.');
        }

        const routes = payload?.generarRoutes;
        if (!routes || typeof routes !== 'object') {
          throw new Error('El servidor no devolvió el estado de las rutas.');
        }

        if (controller.signal.aborted) return;
        setRouteAvailability({
          imagen: Boolean(routes.imagen),
          video: Boolean(routes.video),
          audio: Boolean(routes.audio),
          musica: Boolean(routes.musica),
          '3d': Boolean(routes['3d']),
        });
        setRuntimeCheck('ready');
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.warn('[Generar/API] No se pudo comprobar el estado real de las rutas.', error);
        setRouteAvailability({});
        setRuntimeCheck('error');
      });

    return () => controller.abort();
  }, [context.session]);

  if (!activeModule) {
    return (
      <div className="generar-module-grid">
        {moduleMeta.map((item) => {
          const ready = runtimeCheck === 'ready' && routeAvailability[item.id] === true;
          const status =
            !context.session
              ? 'INICIA SESIÓN'
              : runtimeCheck === 'checking' || runtimeCheck === 'idle'
                ? 'COMPROBANDO'
                : runtimeCheck === 'error'
                  ? 'SIN VERIFICAR'
                  : ready
                    ? 'ACTIVO'
                    : 'PENDIENTE';

          return (
            <button
              key={item.id}
              type="button"
              className="generar-module-button glass-glow-button"
              onClick={() => onModule(item.id)}
              title={ready ? 'Ruta disponible ahora' : 'Abre el módulo para revisar su disponibilidad'}
            >
              <span className="generar-choice-icon"><GenerarIcon name={item.id} /></span>
              <span className="generar-module-copy">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
                <em className={ready ? 'ready' : ''}>{status}</em>
              </span>
            </button>
          );
        })}
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
          aria-label="Volver a API"
          onClick={() => onModule(null)}
        >
          ← API
        </button>
      </div>
      <Suspense fallback={<div className="generar-loading">Cargando…</div>}>
        <Active context={context} />
      </Suspense>
    </div>
  );
}
