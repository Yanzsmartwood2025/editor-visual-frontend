import { useEffect, useMemo, useRef, useState } from 'react';
import { Model3DWorkspace } from '../../../Model3DWorkspace';
import { firebaseHeaders } from '../../../../lib/apiClient';
import type { Model3DAsset } from '../../../../lib/model3d';
import { uploadMediaFilesToBodega } from '../../../../lib/mediaUpload';
import type { GenerarMediaItem, GenerarModuleProps } from '../../types';
import GpuQuotePanel, { type GenerarGpuQuote } from '../GpuQuotePanel';
import GpuAssemblyPanel from './GpuAssemblyPanel';
import { canOpen3DStudio } from '../../../../lib/gpu/gpu3dPresentation';

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

type Phase = 'idle' | 'quoting' | 'quote' | 'verifying' | 'starting' | 'running' | 'completed' | 'failed';
type View = 'convert' | 'studio';

const terminal = new Set(['completed', 'failed', 'expired', 'cancelled']);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const activeJobKey = (userId: string) => 'nayla:gpu:3d:active-job:' + userId;
const readActiveJobId = (userId: string) => {
  try { return window.localStorage.getItem(activeJobKey(userId)); } catch { return null; }
};
const writeActiveJobId = (userId: string, jobId: string) => {
  try { window.localStorage.setItem(activeJobKey(userId), jobId); } catch { /* server lookup remains available */ }
};
const clearActiveJobId = (userId: string) => {
  try { window.localStorage.removeItem(activeJobKey(userId)); } catch { /* ignore storage restrictions */ }
};

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
  const [previewOpen, setPreviewOpen] = useState(false);
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
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!previewOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [previewOpen]);

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

    if (terminal.has(next.status)) {
      if (session?.uid) clearActiveJobId(session.uid);
      if (next.status === 'completed') {
        setPhase('completed');
        setMessage('El modelo quedó guardado en la Bóveda. La GPU temporal se retiró automáticamente para detener el cobro. Abriendo el Estudio 3D…');
        if (next.galleryItem && threeDStudio) threeDStudio.onGenerated(next.galleryItem);
        setView('studio');
      } else {
        setPhase('failed');
        setMessage(next.error || 'El trabajo GPU 3D no pudo completarse.');
      }
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
    setPhase('verifying');
    setMessage('Verificando la tarjeta elegida y su precio actual…');
    let reservationStarted = false;

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

      setPhase('starting');
      setMessage('Tarjeta verificada. Solicitando la reserva…');
      reservationStarted = true;

      // Let the reservation response finish even if the user leaves this module. The server job
      // keeps running independently; its id is persisted before UI state is touched.
      const controller = new AbortController();
      abortRef.current?.abort();

      const response = await fetch('/api/gpu/jobs', {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          projectId: projectId || undefined,
          threadId: threadId || undefined,
          ...requestBody,
          computeSelectionId: selectedId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.job) {
        throw new Error(payload?.error || 'No se pudo iniciar Nayla Compute.');
      }

      const next = payload.job as GpuJobState;
      if (session?.uid && !terminal.has(next.status)) writeActiveJobId(session.uid, next.id);
      if (mountedRef.current) {
        abortRef.current = controller;
        applyJob(next);
        if (!terminal.has(next.status)) await poll(next.id, controller);
      }
    } catch (error: any) {
      if (!mountedRef.current || abortRef.current?.signal.aborted) return;
      setPhase(reservationStarted ? 'failed' : 'quote');
      setMessage(error?.message || (reservationStarted ? 'No se pudo iniciar Nayla Compute.' : 'No se pudo verificar la tarjeta. Puedes intentarlo otra vez.'));
    }
  };

  useEffect(() => {
    if (!session?.uid) return;
    let disposed = false;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    const restoreJob = async () => {
      try {
        const savedId = readActiveJobId(session.uid);
        let response = await fetch(
          savedId ? '/api/gpu/jobs?id=' + encodeURIComponent(savedId) : '/api/gpu/jobs?workload=3d',
          { headers: firebaseHeaders(session), cache: 'no-store', signal: controller.signal }
        );
        if (response.status === 404 && savedId) {
          clearActiveJobId(session.uid);
          response = await fetch('/api/gpu/jobs?workload=3d', {
            headers: firebaseHeaders(session), cache: 'no-store', signal: controller.signal,
          });
        }
        if (response.status === 204) {
          clearActiveJobId(session.uid);
          return;
        }
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.job) {
          throw new Error(payload?.error || 'No se pudo recuperar el trabajo GPU 3D.');
        }
        if (disposed || controller.signal.aborted) return;
        const next = payload.job as GpuJobState;
        if (!terminal.has(next.status)) writeActiveJobId(session.uid, next.id);
        applyJob(next);
        if (!terminal.has(next.status)) await poll(next.id, controller);
      } catch (error: any) {
        if (!disposed && !controller.signal.aborted) {
          setPhase('failed');
          setMessage(error?.message || 'No se pudo reconectar con el trabajo GPU 3D.');
        }
      }
    };

    void restoreJob();
    return () => {
      disposed = true;
      controller.abort();
    };
  // Reconnect once for the signed-in user; the GPU job is owned by the server.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.uid]);

  const result = job?.galleryItem || null;
  const canOpenStudio = canOpen3DStudio(job?.status || '', Boolean(result), Boolean(threeDStudio));
  const busy = uploadingImage || phase === 'quoting' || phase === 'starting' || phase === 'running';
  const elapsedSeconds = job?.startedAt
    ? Math.max(0, Math.floor((now - Date.parse(job.startedAt)) / 1000))
    : 0;
  const elapsedLabel =
    String(Math.floor(elapsedSeconds / 60)).padStart(2, '0') + ':' +
    String(elapsedSeconds % 60).padStart(2, '0');

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
          {phase === 'completed' && result && (
            <div className="generar-status-card">
              <strong>TRABAJO TERMINADO · GPU RETIRADA</strong>
              <p>{result.nombre || 'El modelo 3D'} ya está en la Bóveda. La máquina temporal se cerró automáticamente para detener el cobro.</p>
              <button type="button" className="generar-secondary-action glass-glow-button" onClick={() => { reset(); setView('convert'); }}>
                HACER OTRO MODELO
              </button>
            </div>
          )}
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
            <p>Sube tu referencia, define nombre, color y animación; revisa el precio antes de arrancar la GPU.</p>
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
                ANIMACIÓN GLOBAL (SIN ESQUELETO)
                <select
                  value={motionPreset}
                  onChange={(event) => setMotionPreset(event.target.value as typeof motionPreset)}
                  disabled={busy}
                  style={{ minWidth: 0, background: '#0d0d0d', border: '1px solid #292929', color: '#fff', borderRadius: 10, padding: '11px 12px', fontSize: '.82rem' }}
                >
                  <option value="none">Sin animación</option>
                  <option value="idle_sway">Balanceo del modelo completo</option>
                  <option value="turntable">Giro del modelo completo</option>
                </select>
                <small style={{ color: '#81818a', lineHeight: 1.45 }}>
                  Estos presets mueven el personaje completo; no articulan brazos ni piernas. El autorigging con huesos todavía no está conectado.
                </small>
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
                    <button
                      type="button"
                      className="generar-source-preview-button"
                      onClick={() => setPreviewOpen(true)}
                      aria-label="Ampliar imagen seleccionada"
                    >
                      <img src={source.url} alt={source.nombre || 'Imagen seleccionada'} />
                      <span aria-hidden="true">⤢</span>
                    </button>
                    <div>
                      <span className="generar-eyebrow">SELECCIONADA</span>
                      <strong>{source.nombre}</strong>
                      <small>{source.etiqueta || 'FOTO'} · BÓVEDA PRIVADA</small>
                    </div>
                  </div>
                )}

                {previewOpen && source && (
                  <div
                    className="generar-source-preview-backdrop"
                    role="presentation"
                    onClick={() => setPreviewOpen(false)}
                  >
                    <div
                      className="generar-source-preview-dialog"
                      role="dialog"
                      aria-modal="true"
                      aria-label={'Vista previa: ' + (source.nombre || 'imagen seleccionada')}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="generar-source-preview-head">
                        <strong>{source.nombre || 'Imagen de referencia'}</strong>
                        <button type="button" onClick={() => setPreviewOpen(false)} aria-label="Cerrar vista previa">✕</button>
                      </div>
                      <img className="generar-source-preview-image" src={source.url} alt={source.nombre || 'Imagen de referencia ampliada'} />
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

            {quote && ['quote', 'verifying'].includes(phase) && (
              <GpuQuotePanel
                quote={quote}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onCancel={reset}
                onConfirm={() => void confirmGpu()}
                confirming={phase === 'verifying'}
                message={phase === 'quote' ? message : ''}
              />
            )}

            {job && phase === 'running' ? (
              <GpuAssemblyPanel job={job} message={message} elapsedLabel={elapsedLabel} />
            ) : message && phase !== 'quote' ? (
              <div className={'generar-status-card ' + (phase === 'failed' ? 'error' : '')}>
                <strong>
                  {phase === 'completed' ? 'LISTO' : phase === 'failed' ? 'ESTADO' : 'GPU'}
                </strong>
                <p>{message}</p>
                {phase === 'starting' && (
                  <progress aria-label="Verificando y reservando la GPU" style={{ width: '100%', height: 7, marginTop: 10 }} />
                )}
              </div>
            ) : null}

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
                {threeDStudio && canOpenStudio && (
                  <button
                    type="button"
                    className="generar-primary-action glass-glow-button"
                    onClick={() => setView('studio')}
                  >
                    TERMINADO · ABRIR EN ESTUDIO
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