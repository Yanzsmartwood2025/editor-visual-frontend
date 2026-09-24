import { useEffect, useMemo, useRef, useState } from 'react';
import { Model3DWorkspace } from '../../../Model3DWorkspace';
import { firebaseHeaders } from '../../../../lib/apiClient';
import type { Model3DAsset } from '../../../../lib/model3d';
import type { GenerarModuleProps } from '../../types';
import GpuQuotePanel, { type GenerarGpuQuote } from '../GpuQuotePanel';

type GpuJobState = {
  id: string;
  status: string;
  galleryItem?: Model3DAsset | null;
  outputUrl?: string | null;
  error?: string | null;
  gpuName?: string | null;
  hourlyPrice?: number | null;
  estimatedMaxCost?: number | null;
  runtimeCostEstimate?: number | null;
};

type Phase = 'idle' | 'quoting' | 'quote' | 'starting' | 'running' | 'completed' | 'failed';
type View = 'convert' | 'studio';

const terminal = new Set(['completed', 'failed', 'expired', 'cancelled']);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function GpuThreeDModule({ context }: GenerarModuleProps) {
  const {
    session,
    projectId,
    threadId,
    mediaLibrary = [],
    selectedMediaIds = [],
    threeDStudio,
  } = context;

  const photos = useMemo(
    () => mediaLibrary.filter((item) => item.tipo === 'foto').slice().reverse(),
    [mediaLibrary]
  );
  const preferred = useMemo(
    () => photos.find((item) => selectedMediaIds.includes(item.id)) || photos[0] || null,
    [photos, selectedMediaIds]
  );

  const [sourceId, setSourceId] = useState('');
  const [view, setView] = useState<View>('convert');
  const [phase, setPhase] = useState<Phase>('idle');
  const [quote, setQuote] = useState<GenerarGpuQuote | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [job, setJob] = useState<GpuJobState | null>(null);
  const [message, setMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (!sourceId && preferred) setSourceId(preferred.id);
  }, [sourceId, preferred]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const source = photos.find((item) => item.id === sourceId) || preferred;

  const requestBody = source
    ? {
        workload: '3d' as const,
        recipe: 'triposr-image-to-3d',
        inputUrls: [source.url],
      }
    : null;

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setQuote(null);
    setSelectedId('');
    setJob(null);
    setMessage('');
    setPhase('idle');
  };

  const chooseSource = (id: string) => {
    setSourceId(id);
    reset();
  };

  const quoteGpu = async () => {
    if (!session || !requestBody) return;
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
      setMessage('Modelo GLB terminado, guardado en la Bóveda y GPU cerrada.');
      if (next.galleryItem && threeDStudio) threeDStudio.onGenerated(next.galleryItem);
      return;
    }

    if (next.status === 'failed' || next.status === 'expired' || next.status === 'cancelled') {
      setPhase('failed');
      setMessage(next.error || 'El trabajo GPU 3D no pudo completarse.');
      return;
    }

    setPhase('running');
    if (next.status === 'renting') setMessage('Reservando GPU…');
    else if (next.status === 'booting') setMessage('Encendiendo Nayla Compute…');
    else if (next.status === 'cleanup_pending' && next.galleryItem) setMessage('Modelo listo. Cerrando la GPU…');
    else setMessage('TripoSR está reconstruyendo el modelo 3D…');
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
        throw new Error(payload?.error || 'No se pudo consultar el trabajo GPU 3D.');
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
    if (!session || !selectedId || !requestBody) return;
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
    <section data-generar-module="3d" className="generar-module-stage generar-3d-stage">
      <div className="generar-3d-modebar">
        <div className="generar-segmented" role="group" aria-label="Modo GPU 3D">
          <button
            type="button"
            className={'generar-segment-button glass-glow-button ' + (view === 'convert' ? 'active' : '')}
            onClick={() => setView('convert')}
          >
            IMAGEN → 3D
          </button>
          <button
            type="button"
            className={'generar-segment-button glass-glow-button ' + (view === 'studio' ? 'active' : '')}
            onClick={() => setView('studio')}
          >
            ESTUDIO 3D
          </button>
        </div>
        <span className="generar-3d-count">TRIPOSR · GPU</span>
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
            <span className="generar-eyebrow">GPU · 3D</span>
            <h2>Imagen a 3D</h2>
            <p>Selecciona una foto de la Bóveda. Nayla cotiza una GPU y TripoSR reconstruye un GLB ligero.</p>
          </div>

          <div className="generar-glass-panel">
            {photos.length ? (
              <>
                <div className="generar-form-label">IMAGEN DE ENTRADA</div>
                <div className="generar-photo-picker">
                  {photos.slice(0, 12).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={'generar-photo-card glass-glow-button ' + (source?.id === item.id ? 'active' : '')}
                      onClick={() => chooseSource(item.id)}
                      disabled={busy}
                    >
                      <img src={item.url} alt={item.nombre || item.etiqueta || 'Foto'} />
                      <span>{item.etiqueta || item.nombre || 'FOTO'}</span>
                    </button>
                  ))}
                </div>

                {source && (
                  <div className="generar-selected-source">
                    <img src={source.url} alt={source.nombre || 'Imagen seleccionada'} />
                    <div>
                      <span className="generar-eyebrow">SELECCIONADA</span>
                      <strong>{source.nombre}</strong>
                      <small>{source.etiqueta || 'FOTO'} · BÓVEDA PRIVADA</small>
                    </div>
                  </div>
                )}

                {phase !== 'quote' && (
                  <div className="generar-action-row">
                    <button
                      type="button"
                      className="generar-primary-action glass-glow-button"
                      onClick={() => void quoteGpu()}
                      disabled={!session || !source || busy}
                    >
                      {phase === 'quoting' ? 'COTIZANDO…' : 'COTIZAR GPU'}
                    </button>
                    {(phase === 'failed' || phase === 'completed') && (
                      <button type="button" className="generar-secondary-action glass-glow-button" onClick={reset}>
                        NUEVA CONVERSIÓN
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="generar-status-card">
                <strong>NECESITO UNA FOTO</strong>
                <p>Sube o guarda una imagen en la Bóveda. Cuando exista una foto, aparecerá aquí para convertirla a 3D.</p>
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
                  <strong>{result.nombre || 'Modelo 3D GPU'}</strong>
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
          </div>
        </div>
      )}
    </section>
  );
}
