import { useEffect, useRef, useState } from 'react';
import { firebaseHeaders } from '../../../../lib/apiClient';
import type { GenerarMediaItem, GenerarModuleProps } from '../../types';
import GpuQuotePanel, { type GenerarGpuQuote } from '../GpuQuotePanel';

type Duration = 15 | 30 | 60;

type GpuJobState = {
  id: string;
  status: string;
  galleryItem?: GenerarMediaItem | null;
  outputUrl?: string | null;
  error?: string | null;
  gpuName?: string | null;
  hourlyPrice?: number | null;
  estimatedMaxCost?: number | null;
  runtimeCostEstimate?: number | null;
};

type Phase = 'idle' | 'quoting' | 'quote' | 'starting' | 'running' | 'completed' | 'failed';

const terminal = new Set(['completed', 'failed', 'expired', 'cancelled']);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function GpuMusicaModule({ context }: GenerarModuleProps) {
  const { session, projectId, threadId, onUseMedia } = context;
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<Duration>(30);
  const [phase, setPhase] = useState<Phase>('idle');
  const [quote, setQuote] = useState<GenerarGpuQuote | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [job, setJob] = useState<GpuJobState | null>(null);
  const [message, setMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const requestBody = {
    workload: 'audio' as const,
    recipe: 'ace-step-music',
    prompt: prompt.trim(),
    inputUrls: [] as string[],
    options: {
      duration,
      instrumental: true,
    },
  };

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setQuote(null);
    setSelectedId('');
    setJob(null);
    setMessage('');
    setPhase('idle');
  };

  const quoteGpu = async () => {
    if (!session || !prompt.trim()) return;
    setPhase('quoting');
    setMessage('');
    setJob(null);

    try {
      const response = await fetch('/api/gpu/quote', {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(requestBody),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.quote) {
        throw new Error(payload?.error || 'No se pudo cotizar Nayla Compute.');
      }

      const nextQuote = payload.quote as GenerarGpuQuote;
      setQuote(nextQuote);
      setSelectedId(
        nextQuote.selectedSelectionId ||
        nextQuote.cards?.find((card) => card.recommended)?.selectionId ||
        nextQuote.cards?.[0]?.selectionId ||
        ''
      );
      setPhase('quote');
      if (!nextQuote.available) {
        setMessage(nextQuote.reason || 'No hay una GPU disponible dentro de los límites actuales.');
      }
    } catch (error: any) {
      setPhase('failed');
      setMessage(error?.message || 'No se pudo cotizar Nayla Compute.');
    }
  };

  const applyJob = (next: GpuJobState) => {
    if (!mountedRef.current) return;
    setJob(next);

    if (next.status === 'completed') {
      setPhase('completed');
      setMessage('Música terminada, guardada en la Bóveda y GPU cerrada.');
      return;
    }

    if (next.status === 'failed' || next.status === 'expired' || next.status === 'cancelled') {
      setPhase('failed');
      setMessage(next.error || 'El trabajo GPU no pudo completarse.');
      return;
    }

    setPhase('running');
    if (next.status === 'renting') setMessage('Reservando GPU…');
    else if (next.status === 'booting') setMessage('Encendiendo Nayla Compute…');
    else if (next.status === 'cleanup_pending' && next.galleryItem) setMessage('Resultado listo. Cerrando la GPU…');
    else setMessage('ACE-Step está generando la música…');
  };

  const poll = async (id: string, controller: AbortController) => {
    const startedAt = Date.now();
    const maxMs = 35 * 60 * 1000;

    while (!controller.signal.aborted && Date.now() - startedAt < maxMs) {
      await wait(3000);
      if (controller.signal.aborted) return;

      const response = await fetch('/api/gpu/jobs?id=' + encodeURIComponent(id), {
        headers: firebaseHeaders(session!),
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.job) {
        throw new Error(payload?.error || 'No se pudo consultar el trabajo GPU.');
      }

      const next = payload.job as GpuJobState;
      applyJob(next);
      if (terminal.has(next.status)) return;
    }

    if (!controller.signal.aborted) {
      setPhase('failed');
      setMessage('La GPU sigue trabajando más de lo esperado. Nayla mantiene activo el vencimiento automático.');
    }
  };

  const confirmGpu = async () => {
    if (!session || !selectedId) return;
    setPhase('starting');
    setMessage('Verificando la misma tarjeta antes de reservar…');

    try {
      const verifyResponse = await fetch('/api/gpu/quote', {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ...requestBody, computeSelectionId: selectedId }),
      });
      const verifyPayload = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok || !verifyPayload?.quote) {
        throw new Error(verifyPayload?.error || 'No se pudo verificar la GPU.');
      }

      const verified = verifyPayload.quote as GenerarGpuQuote;
      setQuote(verified);
      if (!verified.available) {
        setSelectedId(
          verified.selectedSelectionId ||
          verified.cards?.find((card) => card.recommended)?.selectionId ||
          ''
        );
        setPhase('quote');
        setMessage(verified.reason || 'La tarjeta cambió. Elige otra disponible.');
        return;
      }

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      const response = await fetch('/api/gpu/jobs', {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          projectId: projectId || undefined,
          threadId: threadId || undefined,
          ...requestBody,
          computeSelectionId: selectedId,
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.job) {
        throw new Error(payload?.error || 'No se pudo iniciar Nayla Compute.');
      }

      const next = payload.job as GpuJobState;
      applyJob(next);
      if (!terminal.has(next.status)) {
        await poll(next.id, controller);
      }
    } catch (error: any) {
      if (abortRef.current?.signal.aborted) return;
      setPhase('failed');
      setMessage(error?.message || 'Nayla Compute se interrumpió.');
    }
  };

  const result = job?.galleryItem || null;
  const busy = phase === 'quoting' || phase === 'starting' || phase === 'running';

  return (
    <section data-generar-module="musica" className="generar-module-stage">
      <div className="generar-stage-inner">
        <div className="generar-stage-heading">
          <span className="generar-eyebrow">GPU · MÚSICA</span>
          <h2>ACE-Step dedicado</h2>
          <p>Nayla cotiza una GPU compatible antes de reservarla. No se alquila ninguna máquina hasta tu confirmación.</p>
        </div>

        <div className="generar-glass-panel">
          <label className="generar-form-label" htmlFor="gpu-music-prompt">DESCRIPCIÓN</label>
          <textarea
            id="gpu-music-prompt"
            className="generar-textarea"
            value={prompt}
            disabled={busy}
            onChange={(event) => {
              setPrompt(event.target.value);
              if (!busy) {
                setQuote(null);
                setSelectedId('');
                setMessage('');
                setPhase('idle');
              }
            }}
            placeholder="Ejemplo: rock alternativo oscuro, instrumental, guitarras amplias, batería firme, final ascendente…"
          />

          <div className="generar-form-label generar-spaced-label">DURACIÓN</div>
          <div className="generar-segmented">
            {[15, 30, 60].map((seconds) => (
              <button
                key={seconds}
                type="button"
                className={'generar-segment-button glass-glow-button ' + (duration === seconds ? 'active' : '')}
                onClick={() => {
                  setDuration(seconds as Duration);
                  if (!busy) {
                    setQuote(null);
                    setSelectedId('');
                    setMessage('');
                    setPhase('idle');
                  }
                }}
                disabled={busy}
              >
                {seconds} S
              </button>
            ))}
          </div>

          {phase !== 'quote' && (
            <div className="generar-action-row">
              <button
                type="button"
                className="generar-primary-action glass-glow-button"
                onClick={() => void quoteGpu()}
                disabled={!session || !prompt.trim() || busy}
              >
                {phase === 'quoting' ? 'COTIZANDO…' : 'COTIZAR GPU'}
              </button>
              {(phase === 'failed' || phase === 'completed') && (
                <button type="button" className="generar-secondary-action glass-glow-button" onClick={reset}>
                  NUEVO TRABAJO
                </button>
              )}
            </div>
          )}

          {quote && phase === 'quote' && (
            <GpuQuotePanel
              quote={quote}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onCancel={reset}
              onConfirm={() => void confirmGpu()}
              confirming={false}
            />
          )}

          {message && phase !== 'quote' && (
            <div className={'generar-status-card ' + (phase === 'failed' ? 'error' : '')}>
              <strong>
                {phase === 'running'
                  ? 'NAYLA COMPUTE'
                  : phase === 'completed'
                    ? 'LISTO'
                    : phase === 'failed'
                      ? 'ESTADO'
                      : 'GPU'}
              </strong>
              <p>{message}</p>
            </div>
          )}

          {job && phase === 'running' && (
            <div className="generar-gpu-runtime">
              <span>{job.gpuName || 'GPU'}</span>
              <span>{job.status.toUpperCase()}</span>
              {Number.isFinite(Number(job.hourlyPrice)) && <span>{'~$' + Number(job.hourlyPrice).toFixed(3) + '/h'}</span>}
            </div>
          )}

          {result?.url && (
            <div className="generar-result generar-audio-result">
              <div className="generar-audio-orb generar-music-orb" aria-hidden="true">
                <span /><span /><span /><span /><span /><span /><span />
              </div>
              <audio src={result.url} controls preload="metadata" />
              <div className="generar-result-meta">
                <span>{result.etiqueta || 'GPU MÚSICA'}</span>
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
        </div>
      </div>
    </section>
  );
}
