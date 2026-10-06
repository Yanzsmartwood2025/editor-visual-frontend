import React, { lazy, Suspense } from 'react';
import { firebaseHeaders } from '../../../lib/apiClient';
import { getGpuResumePresentation } from '../../../lib/gpu/gpuResumePresentation';
import GenerarIcon from '../GenerarIcon';
import type { GenerarModule, GenerarModuleContext, GenerarModuleProps } from '../types';

const modules: Record<GenerarModule, React.LazyExoticComponent<React.ComponentType<any>>> = {
  imagen: lazy(() => import('./imagen')),
  video: lazy(() => import('./video')),
  audio: lazy(() => import('./audio')),
  musica: lazy(() => import('./musica')),
  '3d': lazy(() => import('./3d')),
};

function GpuResumeCard({
  session,
  onReturn,
}: {
  session: GenerarModuleContext['session'];
  onReturn: () => void;
}) {
  const [job, setJob] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [canceling, setCanceling] = React.useState(false);
  const presentation = job ? getGpuResumePresentation(job) : null;

  React.useEffect(() => {
    if (!session?.user.id || !session.accessToken) { setLoading(false); return; }
    let disposed = false;
    const key = 'nayla:gpu:3d:active-job:' + session.user.id;
    const refresh = async () => {
      try {
        let savedId: string | null = null;
        try { savedId = window.localStorage.getItem(key); } catch { /* optional storage */ }
        let response = await fetch(
          savedId ? '/api/gpu/jobs?id=' + encodeURIComponent(savedId) : '/api/gpu/jobs?workload=3d',
          { headers: firebaseHeaders(session), cache: 'no-store' }
        );
        if (response.status === 404 && savedId) {
          try { window.localStorage.removeItem(key); } catch { /* optional storage */ }
          response = await fetch('/api/gpu/jobs?workload=3d', { headers: firebaseHeaders(session), cache: 'no-store' });
        }
        if (response.status === 204) { if (!disposed) setJob(null); return; }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.job) return;
        const next = payload.job;
        if (!disposed) setJob(next);
        if (!['completed', 'failed', 'expired', 'cancelled'].includes(next.status)) {
          try { window.localStorage.setItem(key, next.id); } catch { /* server lookup remains available */ }
        }
      } catch {
        // Keep the last known state through transient network failures.
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [session]);

  const cancel = async () => {
    if (!job || !session || canceling) return;
    if (!window.confirm('¿Cancelar el trabajo y destruir la GPU ahora? Se perderá el progreso que no se haya guardado.')) return;
    setCanceling(true);
    try {
      const response = await fetch('/api/gpu/jobs/cancel', {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ jobId: job.id, confirmDestroy: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload?.job) setJob(payload.job);
    } finally { setCanceling(false); }
  };

  return (
    <section style={{ display: 'grid', gap: 10, marginBottom: 14, padding: 16, border: '1px solid rgba(255,255,255,.2)', borderRadius: 18, background: 'linear-gradient(145deg,rgba(28,30,33,.96),rgba(12,13,15,.96))', color: '#f5f6f7' }}>
      <strong>{loading ? 'REVISANDO GPU…' : presentation?.badge || 'GPU DISPONIBLE'}</strong>
      {presentation && job ? (
        <>
          <div>{(job.gpuName || 'GPU 3D') + ' · ' + (job.progress?.percent ?? 0) + '% · ' + (job.status === 'cleanup_pending' ? 'Retirando la máquina' : (job.progress?.stage || job.status))}</div>
          {job.hourlyPrice != null && <small>{'Tarifa mostrada: ~
  id: GenerarModule;
  label: string;
  description: string;
  ready: boolean;
}> = [
  { id: 'imagen', label: 'IMAGEN', description: 'Modelos de imagen dedicados', ready: false },
  { id: 'video', label: 'VIDEO', description: 'Imagen en movimiento · GPU', ready: true },
  { id: 'audio', label: 'AUDIO', description: 'Voz y procesamiento', ready: false },
  { id: 'musica', label: 'MÚSICA', description: 'ACE-Step dedicado', ready: true },
  { id: '3d', label: '3D', description: 'Imagen → 3D · TripoSR', ready: true },
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
        {context.session?.accessToken && <GpuResumeCard session={context.session} onReturn={() => onModule('3d')} />}
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
              <em className={item.ready ? 'ready' : ''}>{item.ready ? 'ACTIVO' : 'PENDIENTE'}</em>
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
        <Active key={`${activeModule}:${context.projectId}:${context.threadId}`} context={context} />
      </Suspense>
    </div>
  );
}
 + Number(job.hourlyPrice).toFixed(3) + '/h'}</small>}
          {job.error && <small>{job.error}</small>}
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
            <button type="button" className="generar-secondary-action glass-glow-button" onClick={onReturn}>{presentation.action}</button>
            {presentation.canCancel && <button type="button" className="generar-secondary-action glass-glow-button" disabled={canceling} onClick={() => void cancel()}>{canceling ? 'CANCELANDO…' : 'CANCELAR Y DESTRUIR'}</button>}
          </div>
        </>
      ) : (
        <span style={{ color: '#aeb0b5' }}>{loading ? 'Comprobando si hay un trabajo 3D en curso…' : 'No hay un trabajo 3D activo ni una GPU alquilada.'}</span>
      )}
    </section>
  );
}

const moduleMeta: Array<{
  id: GenerarModule;
  label: string;
  description: string;
  ready: boolean;
}> = [
  { id: 'imagen', label: 'IMAGEN', description: 'Modelos de imagen dedicados', ready: false },
  { id: 'video', label: 'VIDEO', description: 'Imagen en movimiento · GPU', ready: true },
  { id: 'audio', label: 'AUDIO', description: 'Voz y procesamiento', ready: false },
  { id: 'musica', label: 'MÚSICA', description: 'ACE-Step dedicado', ready: true },
  { id: '3d', label: '3D', description: 'Imagen → 3D · TripoSR', ready: true },
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
              <em className={item.ready ? 'ready' : ''}>{item.ready ? 'ACTIVO' : 'PENDIENTE'}</em>
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
        <Active key={`${activeModule}:${context.projectId}:${context.threadId}`} context={context} />
      </Suspense>
    </div>
  );
}
