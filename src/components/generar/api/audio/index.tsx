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
type Language = 'es' | 'en';

const terminal = new Set(['completed', 'failed', 'cancelled']);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ApiAudioModule({ context }: GenerarModuleProps) {
  const { session, projectId, threadId, onUseMedia } = context;
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<Language>('es');
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

  const resetPlan = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setJobId(null);
    setJob(null);
    setProvider(null);
    setMessage('');
    setPhase('idle');
  };

  const prepare = async () => {
    if (!session || !text.trim()) return;
    setPhase('planning');
    setMessage('');
    setJob(null);
    setProvider(null);

    try {
      const response = await fetch('/api/generar/audio-plan', {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          text: text.trim(),
          language,
          projectId,
          threadId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'No se pudo preparar la voz.');

      if (!payload?.ready || !payload?.jobId) {
        setJobId(null);
        setPhase('failed');
        setMessage(payload?.message || 'La generación de voz todavía no está disponible.');
        return;
      }

      setJobId(payload.jobId);
      setProvider(typeof payload.provider === 'string' ? payload.provider : null);
      setPhase('awaiting');
      setMessage(payload.message || 'Lista para generar.');
    } catch (error: any) {
      setPhase('failed');
      setMessage(error?.message || 'No se pudo preparar la voz.');
    }
  };

  const applyJob = (next: JobState) => {
    if (!mountedRef.current) return;
    setJob(next);

    if (next.status === 'completed') {
      setPhase('completed');
      setMessage('Audio listo y guardado en la Bóveda.');
    } else if (next.status === 'failed' || next.status === 'cancelled') {
      setPhase('failed');
      setMessage(next.error || 'La voz no pudo generarse.');
    } else {
      setPhase('running');
      setMessage(next.status === 'queued' ? 'Trabajo en cola…' : 'Nayla Cloud está generando la voz…');
    }
  };

  const poll = async (id: string, controller: AbortController) => {
    const startedAt = Date.now();
    const maxMs = 8 * 60 * 1000;

    while (!controller.signal.aborted && Date.now() - startedAt < maxMs) {
      await wait(1800);
      if (controller.signal.aborted) return;

      const response = await fetch('/api/media/jobs?id=' + encodeURIComponent(id), {
        headers: firebaseHeaders(session!),
        signal: controller.signal,
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar el trabajo.');

      const next = payload?.job as JobState | undefined;
      if (!next) throw new Error('Nayla no devolvió el estado del audio.');
      applyJob(next);
      if (terminal.has(next.status)) return;
    }

    if (!controller.signal.aborted) {
      setPhase('failed');
      setMessage('La voz sigue tardando más de lo esperado. El trabajo puede continuar en segundo plano.');
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
        throw new Error(payload?.error || 'No se pudo iniciar la voz.');
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
      setMessage(error?.message || 'La generación de voz se interrumpió.');
    }
  };

  const result = job?.galleryItem || null;
  const busy = phase === 'planning' || phase === 'running';

  return (
    <section data-generar-module="audio" className="generar-module-stage">
      <div className="generar-stage-inner">
        <div className="generar-stage-heading">
          <span className="generar-eyebrow">API · AUDIO</span>
          <h2>Texto a voz</h2>
          <p>Escribe lo que debe decir la voz. Nayla elige una ruta disponible y solo consume el motor después de tu confirmación.</p>
        </div>

        <div className="generar-glass-panel">
          <div className="generar-form-label">IDIOMA</div>
          <div className="generar-segmented" role="group" aria-label="Idioma de la voz">
            <button
              type="button"
              className={`generar-segment-button glass-glow-button ${language === 'es' ? 'active' : ''}`}
              onClick={() => {
                if (busy) return;
                setLanguage('es');
                if (phase !== 'completed') resetPlan();
              }}
              disabled={busy}
            >
              ESPAÑOL
            </button>
            <button
              type="button"
              className={`generar-segment-button glass-glow-button ${language === 'en' ? 'active' : ''}`}
              onClick={() => {
                if (busy) return;
                setLanguage('en');
                if (phase !== 'completed') resetPlan();
              }}
              disabled={busy}
            >
              ENGLISH
            </button>
          </div>

          <label className="generar-form-label generar-spaced-label" htmlFor="generar-audio-text">
            TEXTO
          </label>
          <textarea
            id="generar-audio-text"
            className="generar-textarea"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (phase !== 'running' && phase !== 'planning' && phase !== 'completed') {
                setMessage('');
                setJobId(null);
                setProvider(null);
                setPhase('idle');
              }
            }}
            disabled={busy}
            maxLength={10000}
            placeholder="Ejemplo: Bienvenidos. Hoy vamos a recordar una canción que todavía se siente como la primera vez…"
          />

          <div className="generar-input-meta">
            <span>{text.length.toLocaleString('es-EC')} / 10.000</span>
            {provider && <span>RUTA · {provider.toUpperCase()}</span>}
          </div>

          <div className="generar-action-row">
            {phase !== 'awaiting' && phase !== 'completed' ? (
              <button
                type="button"
                className="generar-primary-action glass-glow-button"
                disabled={!session || !text.trim() || busy}
                onClick={() => void prepare()}
              >
                {phase === 'planning' ? 'PREPARANDO…' : 'PREPARAR VOZ'}
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
                  onClick={resetPlan}
                >
                  CAMBIAR
                </button>
              </>
            )}

            {(phase === 'failed' || phase === 'completed') && (
              <button
                type="button"
                className="generar-secondary-action glass-glow-button"
                onClick={resetPlan}
              >
                NUEVO AUDIO
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
            <div className="generar-result generar-audio-result">
              <div className="generar-audio-orb" aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
              <audio src={result.url} controls preload="metadata" />
              <div className="generar-result-meta">
                <span>{result.etiqueta || 'AUDIO'}</span>
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
              <p>Nayla usará el proyecto activo de tu sesión. Si no hay uno disponible, la preparación te pedirá seleccionar o crear un proyecto.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
