import { useEffect, useMemo, useRef, useState } from 'react';
import { Model3DWorkspace } from '../../../Model3DWorkspace';
import { firebaseHeaders } from '../../../../lib/apiClient';
import type { Model3DAsset } from '../../../../lib/model3d';
import { uploadMediaFilesToBodega } from '../../../../lib/mediaUpload';
import type { GenerarMediaItem, GenerarModuleProps } from '../../types';
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
  startedAt?: string | null;
  progress?: { percent?: number; stage?: string } | null;
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

  const [uploadedPhoto, setUploadedPhoto] = useState<GenerarMediaItem | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [modelName, setModelName] = useState('Mi personaje 3D');
  const [baseColor, setBaseColor] = useState('#ffffff');
  const [motionPreset, setMotionPreset] = useState<'none' | 'idle_sway' | 'turntable'>('idle_sway');
  const [now, setNow] = useState(Date.now());
  const [sourceId, setSourceId] = useState('');
  const [view, setView] = useState<View>('convert');
  const [phase, setPhase] = useState<Phase>('idle');
  const [quote, setQuote] = useState<GenerarGpuQuote | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [job, setJob] = useState<GpuJobState | null>(null);
  const [message, setMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const photos = useMemo(
    () => [
      ...mediaLibrary.filter((item) => item.tipo === 'foto').slice().reverse(),
      ...(uploadedPhoto ? [uploadedPhoto] : []),
    ],
    [mediaLibrary, uploadedPhoto]
  );
  const preferred = useMemo(
    () => photos.find((item) => selectedMediaIds.includes(item.id)) || photos[0] || null,
    [photos, selectedMediaIds]
  );

  useEffect(() => {
    if (!sourceId && preferred) setSourceId(preferred.id);
  }, [sourceId, preferred]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!['starting', 'running'].includes(phase)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const source = photos.find((item) => item.id === sourceId) || preferred;

  const requestBody = source
    ? {
        workload: '3d' as const,
        recipe: 'triposr-image-to-3d',
        inputUrls: [source.url],
        options: {
          modelName: modelName.trim(),
          baseColor,
          motionPreset,
        },
      }
    : null;

  const uploadReferenceImage = async (file?: File) => {
    if (!file || !session) return;
    if (!file.type.startsWith('image/')) {
      setMessage('Elige un archivo de imagen JPG, PNG o WebP.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setMessage('La imagen supera 20 MB. Elige una versión más ligera.');
      return;
    }

    setUploadingImage(true);
    setMessage('');
    try {
      const [uploaded] = await uploadMediaFilesToBodega({
        session,
        files: [file],
        existingItems: mediaLibrary.filter((item) => item.tipo !== 'audio') as any,
        forcedTipo: 'foto',
        fuente: 'gpu-3d-input',
        projectId: projectId || undefined,
        threadId: threadId || undefined,
      });
      const photo: GenerarMediaItem = { ...uploaded, tipo: 'foto' };
      setUploadedPhoto(photo);
      setSourceId(photo.id);
      reset();
    } catch (error: any) {
      setMessage(error?.message || 'No se pudo guardar la imagen en Cloudflare.');
    } finally {
      setUploadingImage(false);
    }
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

  const chooseSource = (id: string) => {
    setSourceId(id);
    reset();
  };

  const quoteGpu = async () => {
    if (!session || !requestBody) return;
    if (!modelName.trim()) {
      setMessage('Escribe el nombre del personaje.');
      return;
    }
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
      setMessage('El GLB quedó en la Bóveda. La GPU y su disco temporal fueron destruidos. ¿Crear otro modelo o terminar?');
      if (next.galleryItem && threeDStudio) threeDStudio.onGenerated(next.galleryItem);
      return;
    }

    if (next.status === 'failed' || next.status === 'expired' || next.status === 'cancelled') {
      setPhase('failed');
      setMessage(next.error || 'El trabajo GPU 3D no pudo completarse.');
      return;
    }

    setPhase('running');
    if (next.status === 'renting') setMessage('Buscando y reservando GPU disponible…');
    else if (next.status === 'booting') setMessage('GPU reservada; preparando el equipo temporal…');
    else if (next.status === 'cleanup_pending' && next.galleryItem) setMessage('GLB guardado. Eliminando la GPU y su disco temporal…');
    else setMessage(next.progress?.stage || 'TripoSR está reconstruyendo el modelo 3D…');
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
  const busy = uploadingImage || phase === 'quoting' || phase === 'starting' || phase === 'running';
  const elapsedSeconds = job?.startedAt
    ? Math.max(0, Math.floor((now - Date.parse(job.startedAt)) / 1000))
    : 0;
  const elapsedLabel =
    String(Math.floor(elapsedSeconds / 60)).padStart(2, '0') + ':' +
    String(elapsedSeconds % 60).padStart(2, '0');
  const stagePercent = job?.progress?.percent ??
    (job?.status === 'renting' ? 3 : job?.status === 'booting' ? 6 : 8);

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
            <p>Sube tu referencia, define nombre, color y movimiento; revisa el precio antes de arrancar la GPU.</p>
          </div>

          <div className="generar-glass-panel">
            <div className="generar-form-label">DISEÑA TU PERSONAJE</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, marginBottom: 16 }}>
              <label style={{ display: 'grid', gap: 7, color: '#aaa', fontSize: '0.68rem', letterSpacing: '.08em' }}>
                NOMBRE DEL MODELO
                <input
                  value={modelName}
                  onChange={(event) => setModelName(event.target.value.slice(0, 80))}
                  maxLength={80}
                  placeholder="Ej.: Aria guardiana"
                  disabled={busy}
                  style={{ minWidth: 0, background: '#0d0d0d', border: '1px solid #292929', color: '#fff', borderRadius: 10, padding: '11px 12px', fontSize: '.84rem' }}
                />
              </label>
              <label style={{ display: 'grid', gap: 7, color: '#aaa', fontSize: '0.68rem', letterSpacing: '.08em' }}>
                COLOR PRINCIPAL
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #292929', borderRadius: 10, background: '#0d0d0d', padding: '5px 10px' }}>
                  <input
                    type="color"
                    value={baseColor}
                    onChange={(event) => setBaseColor(event.target.value)}
                    disabled={busy}
                    aria-label="Color principal del muñeco"
                    style={{ width: 42, height: 34, border: 0, padding: 0, background: 'transparent' }}
                  />
                  <span style={{ color: '#eee', fontSize: '.78rem' }}>{baseColor.toUpperCase()}</span>
                </span>
              </label>
              <label style={{ display: 'grid', gap: 7, color: '#aaa', fontSize: '0.68rem', letterSpacing: '.08em' }}>
                MOVIMIENTO INCLUIDO EN EL GLB
                <select
                  value={motionPreset}
                  onChange={(event) => setMotionPreset(event.target.value as typeof motionPreset)}
                  disabled={busy}
                  style={{ minWidth: 0, background: '#0d0d0d', border: '1px solid #292929', color: '#fff', borderRadius: 10, padding: '11px 12px', fontSize: '.82rem' }}
                >
                  <option value="none">Sin animación</option>
                  <option value="idle_sway">Balanceo suave</option>
                  <option value="turntable">Giro continuo</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
              <div>
                <div className="generar-form-label" style={{ marginBottom: 4 }}>IMAGEN DE REFERENCIA</div>
                <small style={{ color: '#888' }}>JPG, PNG o WebP · hasta 20 MB. Se guarda en Cloudflare.</small>
              </div>
              <label className="generar-secondary-action glass-glow-button" style={{ cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8, opacity: busy ? .6 : 1 }}>
                {uploadingImage ? 'SUBIENDO A CLOUDFLARE…' : '＋ SUBIR IMAGEN'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!session || busy}
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    void uploadReferenceImage(file);
                  }}
                />
              </label>
            </div>

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
                      disabled={!session || !source || !modelName.trim() || busy}
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
                <strong>SUBE UNA REFERENCIA</strong>
                <p>Elige “Subir imagen” para guardarla en Cloudflare o selecciona una foto que ya esté en la Bóveda.</p>
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
              <div className="generar-gpu-runtime" style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span>{job.gpuName || 'GPU temporal'}</span>
                  <span>{job.progress?.stage || job.status.toUpperCase()}</span>
                  <span>TIEMPO {elapsedLabel}</span>
                  {Number.isFinite(Number(job.hourlyPrice)) && <span>{'~

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
                <button
                  type="button"
                  className="generar-secondary-action glass-glow-button"
                  onClick={reset}
                >
                  CREAR OTRO MODELO
                </button>
                <button
                  type="button"
                  className="generar-secondary-action glass-glow-button"
                  onClick={() => context.onReturnToNayla?.()}
                >
                  TERMINAR
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
 + Number(job.hourlyPrice).toFixed(3) + '/h'}</span>}
                </div>
                <div
                  role="progressbar"
                  aria-label="Avance del trabajo 3D"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={stagePercent}
                  style={{ height: 7, borderRadius: 99, overflow: 'hidden', background: 'rgba(255,255,255,.12)' }}
                >
                  <div style={{ width: stagePercent + '%', height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#45f3c0,#a1ffe5)', transition: 'width .5s ease' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 5, color: '#999', fontSize: '.58rem', textAlign: 'center' }}>
                  {[
                    ['GPU', 3],
                    ['MALLA', 36],
                    ['COLOR + MOVIMIENTO', 78],
                    ['CLOUDFLARE', 90],
                    ['LIMPIEZA', 96],
                  ].map(([label, threshold]) => (
                    <span key={label} style={{ color: stagePercent >= Number(threshold) ? '#52f3c1' : '#777' }}>{label}</span>
                  ))}
                </div>
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
