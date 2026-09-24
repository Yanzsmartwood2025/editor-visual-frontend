import { useEffect, useRef, useState } from 'react';
import { firebaseHeaders } from '../../../../lib/apiClient';
import type { GenerarMediaItem, GenerarModuleProps } from '../../types';

type JobState = {
  id: string;
  status: string;
  galleryItem?: GenerarMediaItem | null;
  outputUrl?: string | null;
  error?: string | null;
};

type Phase = 'idle' | 'planning' | 'awaiting' | 'running' | 'completed' | 'failed';

const terminal = new Set(['completed', 'failed', 'cancelled']);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ApiVideoModule({ context }: GenerarModuleProps) {
  const { session, projectId, threadId, onUseMedia } = context;
  const [prompt, setPrompt] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [message, setMessage] = useState('');
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
    setMessage('');
    setPhase('idle');
  };

  const prepare = async () => {
    if (!session || !prompt.trim()) return;
    setPhase('planning');
    setMessage('');
    setJob(null);

    try {
      const response = await fetch('/api/generar/video-plan', {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          prompt: prompt.trim(),
          projectId,
          threadId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'No se pudo preparar el video.');

      if (!payload?.ready || !payload?.jobId) {
        setJobId(null);
        setPhase('failed');
        setMessage(payload?.message || 'La generación de video todavía no está disponible.');
        return;
      }

      setJobId(payload.jobId);
      setPhase('awaiting');
      setMessage(payload.message || 'Listo para generar.');
    } catch (error: any) {
      setPhase('failed');
      setMessage(error?.message || 'No se pudo preparar la generación.');
    }
  };

  const applyJob = (next: JobState) => {
    if (!mountedRef.current) return;
    setJob(next);

    if (next.status === 'completed') {
      setPhase('completed');
      setMessage('Resultado listo y guardado en la Bóveda.');
    } else if (next.status === 'failed' || next.status === 'cancelled') {
      setPhase('failed');
      setMessage(next.error || 'La generación no pudo completarse.');
    } else {
      setPhase('running');
      setMessage(next.status === 'queued' ? 'Trabajo en cola…' : 'Nayla Cloud está generando el video…');
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
      if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar el trabajo.');

      const next = payload?.job as JobState | undefined;
      if (!next) throw new Error('Nayla no devolvió el estado del trabajo.');
      applyJob(next);
      if (terminal.has(next.status)) return;
    }

    if (!controller.signal.aborted) {
      setPhase('failed');
      setMessage('El video sigue tardando más de lo esperado. El trabajo puede continuar en segundo plano.');
    }
  };

  const generate = async () => {
    if (!session || !jobId) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('running');
    setMessage('Iniciando Nayla Cloud…');

    try {
      const response = await fetch('/api/media/jobs', {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: jobId }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 422) {
        throw new Error(payload?.error || 'No se pudo iniciar la generación.');
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
      setMessage(error?.message || 'La generación se interrumpió.');
    }
  };

  const result = job?.galleryItem || null;
  const busy = phase === 'planning' || phase === 'running';

  return (
    <section data-generar-module="video" className="generar-module-stage">
      <div className="generar-stage-inner">
        <div className="generar-stage-heading">
          <span className="generar-eyebrow">API · VIDEO</span>
          <h2>Generar video</h2>
          <p>Describe la escena y el movimiento. Nayla prepara el trabajo antes de consumir el motor.</p>
        </div>

        <div className="generar-glass-panel">
          <label className="generar-form-label" htmlFor="generar-video-prompt">DESCRIPCIÓN</label>
          <textarea
            id="generar-video-prompt"
            className="generar-textarea"
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              if (phase !== 'running' && phase !== 'planning' && phase !== 'completed') {
                setMessage('');
                setJobId(null);
                setPhase('idle');
              }
            }}
            disabled={busy}
            placeholder="Ejemplo: cámara avanza lentamente, luz cinematográfica, movimiento natural, 5 segundos…"
          />

          <div className="generar-action-row">
            {phase !== 'awaiting' && phase !== 'completed' ? (
              <button
                type="button"
                className="generar-primary-action glass-glow-button"
                disabled={!session || !prompt.trim() || busy}
                onClick={() => void prepare()}
              >
                {phase === 'planning' ? 'PREPARANDO…' : 'PREPARAR VIDEO'}
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
                <button type="button" className="generar-secondary-action glass-glow-button" onClick={reset}>
                  CAMBIAR
                </button>
              </>
            )}

            {(phase === 'failed' || phase === 'completed') && (
              <button type="button" className="generar-secondary-action glass-glow-button" onClick={reset}>
                NUEVO VIDEO
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

          {result?.url && (
            <div className="generar-result">
              <video src={result.url} controls playsInline preload="metadata" />
              <div className="generar-result-meta">
                <span>{result.etiqueta || 'RESULTADO'}</span>
                <span>BÓVEDA PRIVADA</span>
              </div>
              <div className="generar-action-row">
                <button
                  type="button"
                  className="generar-primary-action glass-glow-button"
                  onClick={() => void onUseMedia?.(result)}
                >
                  USAR EN EDITOR
                </button>
              </div>
            </div>
          )}

          {!projectId && (
            <div className="generar-status-card">
              <strong>PROYECTO</strong>
              <p>Nayla usará el proyecto activo de tu sesión. Si no hay uno disponible, te pedirá seleccionar o crear uno antes de generar.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
