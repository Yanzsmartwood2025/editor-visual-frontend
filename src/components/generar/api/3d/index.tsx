import { useEffect, useRef, useState } from 'react';
import { Model3DWorkspace } from '../../../Model3DWorkspace';
import { firebaseHeaders } from '../../../../lib/apiClient';
import type { Model3DAsset } from '../../../../lib/model3d';
import type { GenerarModuleProps } from '../../types';

type JobState = {
  id: string;
  status: string;
  galleryItem?: Model3DAsset | null;
  outputUrl?: string | null;
  error?: string | null;
};

type Phase = 'idle' | 'planning' | 'awaiting' | 'running' | 'completed' | 'failed';
type View = 'create' | 'studio';

const terminal = new Set(['completed', 'failed', 'cancelled']);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ApiThreeDModule({ context }: GenerarModuleProps) {
  const { session, projectId, threadId, threeDStudio } = context;
  const [view, setView] = useState<View>('create');
  const [prompt, setPrompt] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [message, setMessage] = useState('');
  const [provider, setProvider] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setJobId(null);
    setJob(null);
    setProvider(null);
    setMessage('');
    setPhase('idle');
  };

  const prepare = async () => {
    if (!session || !prompt.trim()) return;
    setPhase('planning');
    setMessage('');
    setJob(null);
    setProvider(null);

    try {
      const response = await fetch('/api/generar/3d-plan', {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          prompt: prompt.trim(),
          projectId,
          threadId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'No se pudo preparar el modelo 3D.');

      if (!payload?.ready || !payload?.jobId) {
        setJobId(null);
        setPhase('failed');
        setMessage(payload?.message || 'La generación 3D todavía no está disponible.');
        return;
      }

      setJobId(payload.jobId);
      setProvider(typeof payload.provider === 'string' ? payload.provider : null);
      setPhase('awaiting');
      setMessage(payload.message || 'Listo para generar.');
    } catch (error: any) {
      setPhase('failed');
      setMessage(error?.message || 'No se pudo preparar el modelo 3D.');
    }
  };

  const applyJob = (next: JobState) => {
    if (!mountedRef.current) return;
    setJob(next);

    if (next.status === 'completed') {
      setPhase('completed');
      setMessage('Modelo listo y guardado en la Bóveda 3D.');
      if (next.galleryItem && threeDStudio) {
        threeDStudio.onGenerated(next.galleryItem);
      }
    } else if (next.status === 'failed' || next.status === 'cancelled') {
      setPhase('failed');
      setMessage(next.error || 'El modelo 3D no pudo generarse.');
    } else {
      setPhase('running');
      setMessage(next.status === 'queued' ? 'Trabajo en cola…' : 'Nayla Cloud está generando el modelo 3D…');
    }
  };

  const poll = async (id: string, controller: AbortController) => {
    const startedAt = Date.now();
    const maxMs = 15 * 60 * 1000;

    while (!controller.signal.aborted && Date.now() - startedAt < maxMs) {
      await wait(2200);
      if (controller.signal.aborted) return;

      const response = await fetch('/api/media/jobs?id=' + encodeURIComponent(id), {
        headers: firebaseHeaders(session!),
        signal: controller.signal,
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar el trabajo 3D.');

      const next = payload?.job as JobState | undefined;
      if (!next) throw new Error('Nayla no devolvió el estado del modelo.');
      applyJob(next);
      if (terminal.has(next.status)) return;
    }

    if (!controller.signal.aborted) {
      setPhase('failed');
      setMessage('El modelo sigue tardando más de lo esperado. El trabajo puede continuar en segundo plano.');
    }
  };

  const generate = async () => {
    if (!session || !jobId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('running');
    setMessage('Iniciando Nayla Cloud 3D…');

    try {
      const response = await fetch('/api/media/jobs', {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: jobId }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 422) {
        throw new Error(payload?.error || 'No se pudo iniciar el modelo 3D.');
      }

      const next = payload?.job as JobState | undefined;
      if (!next) throw new Error('Nayla no devolvió el estado inicial.');
      applyJob(next);

      if (!terminal.has(next.status)) {
        await poll(jobId, controller);
      }
    } catch (error: any) {
      if (controller.signal.aborted) return;
      setPhase('failed');
      setMessage(error?.message || 'La generación 3D se interrumpió.');
    }
  };

  const result = job?.galleryItem || null;
  const busy = phase === 'planning' || phase === 'running';

  return (
    <section data-generar-module="3d" className="generar-module-stage generar-3d-stage">
      <div className="generar-3d-modebar">
        <div className="generar-segmented" role="group" aria-label="Modo 3D">
          <button
            type="button"
            className={`generar-segment-button glass-glow-button ${view === 'create' ? 'active' : ''}`}
            onClick={() => setView('create')}
          >
            CREAR
          </button>
          <button
            type="button"
            className={`generar-segment-button glass-glow-button ${view === 'studio' ? 'active' : ''}`}
            onClick={() => setView('studio')}
          >
            ESTUDIO 3D
          </button>
        </div>
        {threeDStudio && (
          <span className="generar-3d-count">
            {threeDStudio.assets.length} {threeDStudio.assets.length === 1 ? 'MODELO' : 'MODELOS'}
          </span>
        )}
      </div>

      {view === 'studio' ? (
        <div className="generar-3d-studio-shell">
          {threeDStudio ? (
            <Model3DWorkspace
              assets={threeDStudio.assets}
              activeAssetId={threeDStudio.activeAssetId}
              uploading={threeDStudio.uploading}
              onSelect={threeDStudio.onSelect}
              onUpload={threeDStudio.onUpload}
              onDelete={threeDStudio.onDelete}
              onNaylaAction={threeDStudio.onNaylaAction}
              embedded
              showCreatePrompt={false}
            />
          ) : (
            <div className="generar-status-card">
              <strong>ESTUDIO 3D</strong>
              <p>El estudio compartido todavía no está disponible en esta sesión.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="generar-stage-inner">
          <div className="generar-stage-heading">
            <span className="generar-eyebrow">API · 3D</span>
            <h2>Texto a 3D</h2>
            <p>Describe el objeto o personaje. Nayla prepara el motor y guarda el resultado como GLB en la Bóveda 3D.</p>
          </div>

          <div className="generar-glass-panel">
            <label className="generar-form-label" htmlFor="generar-3d-prompt">DESCRIPCIÓN</label>
            <textarea
              id="generar-3d-prompt"
              className="generar-textarea"
              value={prompt}
              onChange={(event) => {
                setPrompt(event.target.value);
                if (phase !== 'running' && phase !== 'planning' && phase !== 'completed') {
                  setMessage('');
                  setJobId(null);
                  setProvider(null);
                  setPhase('idle');
                }
              }}
              disabled={busy}
              maxLength={3000}
              placeholder="Ejemplo: silla moderna de nogal, formas suaves, patas ligeras, lista para visualizar en web…"
            />

            <div className="generar-input-meta">
              <span>{prompt.length.toLocaleString('es-EC')} / 3.000</span>
              {provider && <span>RUTA · {provider.toUpperCase()}</span>}
            </div>

            <div className="generar-action-row">
              {phase !== 'awaiting' && phase !== 'completed' ? (
                <button
                  type="button"
                  className="generar-primary-action glass-glow-button"
                  disabled={!session || !prompt.trim() || busy}
                  onClick={() => void prepare()}
                >
                  {phase === 'planning' ? 'PREPARANDO…' : 'PREPARAR 3D'}
                </button>
              ) : null}

              {phase === 'awaiting' && (
                <>
                  <button
                    type="button"
                    className="generar-primary-action glass-glow-button"
                    onClick={() => void generate()}
                  >
                    CONFIRMAR Y GENERAR
                  </button>
                  <button
                    type="button"
                    className="generar-secondary-action glass-glow-button"
                    onClick={reset}
                  >
                    CAMBIAR
                  </button>
                </>
              )}

              {(phase === 'failed' || phase === 'completed') && (
                <button
                  type="button"
                  className="generar-secondary-action glass-glow-button"
                  onClick={reset}
                >
                  NUEVO MODELO
                </button>
              )}
            </div>

            {message && (
              <div className={`generar-status-card ${phase === 'failed' ? 'error' : ''}`}>
                <strong>
                  {phase === 'awaiting'
                    ? 'CONFIRMACIÓN'
                    : phase === 'running'
                      ? 'PROCESANDO'
                      : phase === 'completed'
                        ? 'LISTO'
                        : phase === 'failed'
                          ? 'ESTADO'
                          : 'NAYLA CLOUD'}
                </strong>
                <p>{message}</p>
              </div>
            )}

            {result && (
              <div className="generar-3d-result">
                <div className="generar-3d-result-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4">
                    <path d="M12 2 21 7 12 12 3 7 12 2Z" />
                    <path d="M3 7v10l9 5 9-5V7" />
                    <path d="M12 12v10" />
                  </svg>
                </div>
                <div className="generar-3d-result-copy">
                  <strong>{result.nombre || 'Modelo 3D generado'}</strong>
                  <span>{result.etiqueta || '3D'} · BÓVEDA PRIVADA</span>
                </div>
                {threeDStudio && (
                  <button
                    type="button"
                    className="generar-primary-action glass-glow-button"
                    onClick={() => {
                      threeDStudio.onGenerated(result);
                      setView('studio');
                    }}
                  >
                    ABRIR EN ESTUDIO
                  </button>
                )}
              </div>
            )}

            {!projectId && (
              <div className="generar-status-card">
                <strong>PROYECTO</strong>
                <p>Nayla usará el proyecto activo de tu sesión. Si no hay uno disponible, la preparación te pedirá seleccionar o crear un proyecto.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
