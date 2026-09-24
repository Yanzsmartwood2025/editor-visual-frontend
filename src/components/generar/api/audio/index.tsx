import { useEffect, useMemo, useRef, useState } from 'react';
import { firebaseHeaders } from '../../../../lib/apiClient';
import { uploadMediaFilesToBodega } from '../../../../lib/mediaUpload';
import type { GenerarMediaItem, GenerarModuleProps } from '../../types';

type AudioTool =
  | 'tts'
  | 'clone'
  | 'voice_change'
  | 'voice_isolation'
  | 'speech_to_text'
  | 'sound_effects'
  | 'dialogue'
  | 'voice_design'
  | 'dubbing';

type ExecutableMode =
  | 'tts'
  | 'voice_change'
  | 'voice_isolation'
  | 'speech_to_text'
  | 'sound_effects'
  | 'text_to_dialogue';

type JobState = {
  id: string;
  status: string;
  galleryItem?: GenerarMediaItem | null;
  outputUrl?: string | null;
  textOutput?: string | null;
  error?: string | null;
};

type VoiceItem = {
  id: string;
  name: string;
  category?: 'catalog' | 'cloned' | 'system' | null;
  description?: string | null;
  language?: string | null;
  previewUrl?: string | null;
  labels?: Record<string, string>;
  isOwner?: boolean;
  redundancy?: number;
  requiresVerification?: boolean;
};

type Phase = 'idle' | 'planning' | 'awaiting' | 'running' | 'completed' | 'failed';
type AudioToolAvailability = Partial<Record<AudioTool, boolean>>;

const terminal = new Set(['completed', 'failed', 'cancelled']);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const tools: Array<{
  id: AudioTool;
  label: string;
  description: string;
  glyph: string;
  ready: boolean;
}> = [
  { id: 'tts', label: 'VOZ', description: 'Texto → voz', glyph: 'VO', ready: true },
  { id: 'clone', label: 'CLONAR', description: 'Muestras → voz', glyph: 'CL', ready: true },
  { id: 'voice_change', label: 'CAMBIAR', description: 'Audio → otra voz', glyph: 'CV', ready: true },
  { id: 'voice_isolation', label: 'AISLAR', description: 'Limpiar voz', glyph: 'AI', ready: true },
  { id: 'speech_to_text', label: 'TEXTO', description: 'Audio → texto', glyph: 'TX', ready: true },
  { id: 'sound_effects', label: 'EFECTOS', description: 'Texto → sonido', glyph: 'FX', ready: true },
  { id: 'dialogue', label: 'DIÁLOGO', description: 'Texto → diálogo', glyph: 'DG', ready: true },
  { id: 'voice_design', label: 'DISEÑAR', description: 'Crear una voz', glyph: 'DV', ready: false },
  { id: 'dubbing', label: 'DOBLAJE', description: 'Audio/video → idioma', glyph: 'DB', ready: false },
];

const executableModeFor = (tool: AudioTool): ExecutableMode | null => {
  if (tool === 'tts') return 'tts';
  if (tool === 'voice_change') return 'voice_change';
  if (tool === 'voice_isolation') return 'voice_isolation';
  if (tool === 'speech_to_text') return 'speech_to_text';
  if (tool === 'sound_effects') return 'sound_effects';
  if (tool === 'dialogue') return 'text_to_dialogue';
  return null;
};

const toolNeedsVoice = (tool: AudioTool) =>
  tool === 'tts' || tool === 'voice_change' || tool === 'dialogue';

const toolNeedsInput = (tool: AudioTool) =>
  tool === 'voice_change' || tool === 'voice_isolation' || tool === 'speech_to_text';

const toolUsesText = (tool: AudioTool) => tool === 'tts' || tool === 'dialogue';

const uniqueMedia = (items: GenerarMediaItem[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

export default function ApiAudioModule({ context }: GenerarModuleProps) {
  const { session, projectId, threadId, onUseMedia, mediaLibrary = [] } = context;
  const [activeTool, setActiveTool] = useState<AudioTool>('tts');
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<'es' | 'en'>('es');
  const [phase, setPhase] = useState<Phase>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobState | null>(null);
  const [message, setMessage] = useState('');
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [voicesConfigured, setVoicesConfigured] = useState<boolean | null>(null);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [toolAvailability, setToolAvailability] = useState<AudioToolAvailability>({});
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [localAudioItems, setLocalAudioItems] = useState<GenerarMediaItem[]>([]);
  const [selectedInputId, setSelectedInputId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloneDescription, setCloneDescription] = useState('');
  const [cloneSampleIds, setCloneSampleIds] = useState<string[]>([]);
  const [removeNoise, setRemoveNoise] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [cloneReady, setCloneReady] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const audioItems = useMemo(
    () =>
      uniqueMedia([
        ...mediaLibrary.filter((item) => item.tipo === 'audio'),
        ...localAudioItems.filter((item) => item.tipo === 'audio'),
      ]),
    [mediaLibrary, localAudioItems]
  );

  const voiceGroups = useMemo(() => {
    const automaticas = voices.filter((voice) => voice.category === 'system');
    const propias = voices.filter((voice) => voice.category === 'cloned' || voice.isOwner);
    const catalogo = voices.filter(
      (voice) => voice.category !== 'system' && voice.category !== 'cloned' && !voice.isOwner
    );
    return [
      { id: 'auto', label: 'NAYLA AUTOMÁTICAS', voices: automaticas },
      { id: 'mine', label: 'MIS VOCES', voices: propias },
      { id: 'catalog', label: 'CATÁLOGO', voices: catalogo },
    ].filter((group) => group.voices.length > 0);
  }, [voices]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const resetExecution = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setJobId(null);
    setJob(null);
    setMessage('');
    setCloneReady(false);
    setPhase('idle');
  };

  const refreshVoices = async (preferredVoiceId?: string) => {
    if (!session) return;
    setVoicesLoading(true);
    try {
      const response = await fetch('/api/generar/audio-voices', {
        method: 'GET',
        headers: firebaseHeaders(session),
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'No se pudo leer la biblioteca de voces.');

      const nextVoices = Array.isArray(payload?.voices) ? payload.voices : [];
      setVoicesConfigured(Boolean(payload?.configured));
      setToolAvailability(
        payload?.tools && typeof payload.tools === 'object'
          ? {
              tts: Boolean(payload.tools.tts),
              clone: Boolean(payload.tools.clone),
              voice_change: Boolean(payload.tools.voice_change),
              voice_isolation: Boolean(payload.tools.voice_isolation),
              speech_to_text: Boolean(payload.tools.speech_to_text),
              sound_effects: Boolean(payload.tools.sound_effects),
              dialogue: Boolean(payload.tools.dialogue),
              voice_design: false,
              dubbing: false,
            }
          : {}
      );
      setVoices(nextVoices);
      setSelectedVoiceId((current) => {
        if (preferredVoiceId && nextVoices.some((voice: VoiceItem) => voice.id === preferredVoiceId)) {
          return preferredVoiceId;
        }
        if (current && nextVoices.some((voice: VoiceItem) => voice.id === current)) return current;
        return nextVoices[0]?.id || '';
      });
    } catch (error) {
      if (!mountedRef.current) return;
      setVoicesConfigured(false);
      setToolAvailability({});
      setMessage(error instanceof Error ? error.message : 'No se pudo leer la biblioteca de voces.');
    } finally {
      if (mountedRef.current) setVoicesLoading(false);
    }
  };

  useEffect(() => {
    void refreshVoices();
  }, [session]);

  const chooseTool = (tool: AudioTool) => {
    if (phase === 'running' || phase === 'planning') return;
    setActiveTool(tool);
    setText('');
    setSelectedInputId('');
    setCloneReady(false);
    setMessage('');
    setJobId(null);
    setJob(null);
    setPhase('idle');
  };

  const handleUpload = async (files: FileList | null) => {
    if (!session || !files?.length) return;
    const selected = Array.from(files)
      .filter((file) => file.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|opus|flac)$/i.test(file.name))
      .slice(0, 10);
    if (!selected.length) {
      setMessage('Selecciona archivos de audio compatibles.');
      setPhase('failed');
      return;
    }

    setUploading(true);
    setMessage('Subiendo audio a tu Bóveda privada…');
    try {
      const saved = await uploadMediaFilesToBodega({
        session,
        files: selected,
        existingItems: audioItems as any,
        forcedTipo: 'audio',
        fuente: 'generar-audio',
        projectId: projectId || undefined,
        threadId: threadId || undefined,
      });
      const normalized = saved as unknown as GenerarMediaItem[];
      setLocalAudioItems((current) => uniqueMedia([...current, ...normalized]));
      if (!selectedInputId && normalized[0]?.id) setSelectedInputId(normalized[0].id);
      setMessage(`${normalized.length} audio${normalized.length === 1 ? '' : 's'} guardado${normalized.length === 1 ? '' : 's'} en la Bóveda.`);
      setPhase('idle');
    } catch (error) {
      setPhase('failed');
      setMessage(error instanceof Error ? error.message : 'No se pudo subir el audio.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const applyJob = (next: JobState) => {
    if (!mountedRef.current) return;
    setJob(next);
    if (next.status === 'completed') {
      setPhase('completed');
      setMessage(
        next.textOutput
          ? 'Transcripción terminada.'
          : 'Resultado listo y guardado en la Bóveda.'
      );
    } else if (next.status === 'failed' || next.status === 'cancelled') {
      setPhase('failed');
      setMessage(next.error || 'La herramienta de audio no pudo completarse.');
    } else {
      setPhase('running');
      setMessage(next.status === 'queued' ? 'Trabajo en cola…' : 'Nayla Cloud está procesando el audio…');
    }
  };

  const poll = async (id: string, controller: AbortController) => {
    const startedAt = Date.now();
    const maxMs = 12 * 60 * 1000;

    while (!controller.signal.aborted && Date.now() - startedAt < maxMs) {
      await wait(1900);
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
      setMessage('El proceso sigue tardando más de lo esperado. El trabajo puede continuar en segundo plano.');
    }
  };

  const prepareTool = async () => {
    if (!session) return;
    const mode = executableModeFor(activeTool);
    if (!mode) {
      setPhase('failed');
      setMessage('Esta herramienta todavía está en preparación.');
      return;
    }

    if (toolUsesText(activeTool) && !text.trim()) {
      setPhase('failed');
      setMessage('Escribe el texto que quieres trabajar.');
      return;
    }
    if (activeTool === 'sound_effects' && !text.trim()) {
      setPhase('failed');
      setMessage('Describe el sonido que quieres crear.');
      return;
    }
    if (toolNeedsInput(activeTool) && !selectedInputId) {
      setPhase('failed');
      setMessage('Selecciona o sube un audio de entrada.');
      return;
    }

    setPhase('planning');
    setJob(null);
    setMessage('Preparando herramienta…');

    try {
      const response = await fetch('/api/generar/audio-tool-plan', {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          mode,
          ...(toolUsesText(activeTool) ? { text: text.trim() } : {}),
          ...(activeTool === 'sound_effects' ? { prompt: text.trim() } : {}),
          inputMediaId: toolNeedsInput(activeTool) ? selectedInputId : null,
          voiceId: toolNeedsVoice(activeTool) ? selectedVoiceId || null : null,
          language,
          projectId,
          threadId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'No se pudo preparar la herramienta.');

      if (!payload?.ready || !payload?.jobId) {
        setJobId(null);
        setPhase('failed');
        setMessage(payload?.message || 'Esta herramienta todavía no está disponible.');
        return;
      }

      setJobId(payload.jobId);
      setPhase('awaiting');
      setMessage(payload.message || 'Lista para ejecutar.');
    } catch (error) {
      setPhase('failed');
      setMessage(error instanceof Error ? error.message : 'No se pudo preparar la herramienta.');
    }
  };

  const executePrepared = async () => {
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
        throw new Error(payload?.error || 'No se pudo iniciar la herramienta.');
      }

      const next = payload?.job as JobState | undefined;
      if (!next) throw new Error('Nayla no devolvió el estado inicial.');
      applyJob(next);
      if (!terminal.has(next.status)) await poll(jobId, controller);
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase('failed');
      setMessage(error instanceof Error ? error.message : 'El proceso de audio se interrumpió.');
    }
  };

  const prepareClone = () => {
    if (!cloneName.trim()) {
      setPhase('failed');
      setMessage('Ponle un nombre a la voz.');
      return;
    }
    if (!cloneSampleIds.length) {
      setPhase('failed');
      setMessage('Selecciona al menos una muestra de audio.');
      return;
    }
    if (!rightsConfirmed) {
      setPhase('failed');
      setMessage('Confirma que tienes permiso para usar esas grabaciones.');
      return;
    }
    setCloneReady(true);
    setPhase('awaiting');
    setMessage(`Clon preparado con ${cloneSampleIds.length} muestra${cloneSampleIds.length === 1 ? '' : 's'}. Confirma para crear la voz.`);
  };

  const executeClone = async () => {
    if (!session || !cloneReady) return;
    setPhase('running');
    setMessage('Creando la voz privada…');
    try {
      const response = await fetch('/api/generar/audio-voices', {
        method: 'POST',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: cloneName.trim(),
          description: cloneDescription.trim(),
          sampleIds: cloneSampleIds,
          removeBackgroundNoise: removeNoise,
          rightsConfirmed: true,
          language,
          projectId,
          threadId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'No se pudo crear la voz.');

      const created = payload?.voice as VoiceItem | undefined;
      setPhase('completed');
      setCloneReady(false);
      setMessage(payload?.message || 'Voz clonada y añadida a tu biblioteca.');
      if (created?.id) {
        setVoices((current) => [created, ...current.filter((voice) => voice.id !== created.id)]);
        setSelectedVoiceId(created.id);
        await refreshVoices(created.id);
      }
    } catch (error) {
      setPhase('failed');
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la voz clonada.');
    }
  };

  const toggleCloneSample = (id: string) => {
    if (phase === 'running' || phase === 'planning') return;
    setCloneSampleIds((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id].slice(0, 10)
    );
    setCloneReady(false);
    if (phase !== 'completed') setPhase('idle');
  };

  const result = job?.galleryItem || null;
  const busy = phase === 'planning' || phase === 'running';
  const currentMeta = tools.find((item) => item.id === activeTool)!;
  const currentReady = currentMeta.ready && toolAvailability[activeTool] === true;
  const showVoiceLibrary = (toolNeedsVoice(activeTool) || activeTool === 'clone') && currentReady;
  const showAudioTray = (toolNeedsInput(activeTool) || activeTool === 'clone') && currentReady;

  return (
    <section data-generar-module="audio" className="generar-module-stage generar-audio-studio">
      <div className="generar-stage-inner generar-audio-wide">
        <div className="generar-stage-heading">
          <span className="generar-eyebrow">API · AUDIO</span>
          <h2>Estudio de audio</h2>
          <p>Voz, clonación, transformación, limpieza, transcripción y efectos en bandejas independientes.</p>
        </div>

        <div className="generar-audio-tool-grid" role="tablist" aria-label="Herramientas de audio">
          {tools.map((tool) => {
            const ready = tool.ready && toolAvailability[tool.id] === true;
            const checking = tool.ready && voicesLoading && toolAvailability[tool.id] === undefined;
            return (
              <button
                key={tool.id}
                type="button"
                className={`generar-audio-tool glass-glow-button ${activeTool === tool.id ? 'active' : ''}`}
                onClick={() => chooseTool(tool.id)}
                aria-selected={activeTool === tool.id}
              >
                <span className="generar-audio-tool-icon">{tool.glyph}</span>
                <span className="generar-audio-tool-copy">
                  <strong>{tool.label}</strong>
                  <small>{tool.description}</small>
                  <em className={ready ? 'ready' : ''}>
                    {checking ? 'COMPROBANDO' : ready ? 'ACTIVO' : tool.ready ? 'PENDIENTE' : 'SIGUIENTE'}
                  </em>
                </span>
              </button>
            );
          })}
        </div>

        <div className="generar-glass-panel generar-audio-workbench">
          <div className="generar-audio-workbench-head">
            <div>
              <span className="generar-eyebrow">HERRAMIENTA</span>
              <h3>{currentMeta.label}</h3>
            </div>
            <span className={currentReady ? 'generar-audio-live' : 'generar-audio-pending'}>
              {currentReady ? 'RUTA DISPONIBLE' : currentMeta.ready ? 'RUTA PENDIENTE' : 'EN PREPARACIÓN'}
            </span>
          </div>

          {!currentReady ? (
            <div className="generar-status-card">
              <strong>{currentMeta.ready ? 'RUTA NO DISPONIBLE' : 'PRÓXIMA ACTIVACIÓN'}</strong>
              <p>
                {currentMeta.ready
                  ? 'La herramienta está implementada, pero ahora mismo no hay una API compatible configurada para ejecutarla.'
                  : 'La bandeja ya está reservada dentro del Estudio de audio. Se activará cuando el adaptador completo esté conectado y probado.'}
              </p>
            </div>
          ) : null}

          {activeTool === 'clone' && currentReady ? (
            <>
              <div className="generar-audio-section-title">
                <strong>1 · IDENTIDAD DE LA VOZ</strong>
                <span>La voz creada quedará disponible en tu biblioteca.</span>
              </div>
              <div className="generar-audio-two-col">
                <label className="generar-field">
                  <span>NOMBRE</span>
                  <input
                    value={cloneName}
                    onChange={(event) => {
                      setCloneName(event.target.value);
                      setCloneReady(false);
                    }}
                    placeholder="Ejemplo: Narradora Aria"
                    maxLength={80}
                    disabled={busy}
                  />
                </label>
                <label className="generar-field">
                  <span>DESCRIPCIÓN</span>
                  <input
                    value={cloneDescription}
                    onChange={(event) => setCloneDescription(event.target.value)}
                    placeholder="Cálida, clara, español neutro…"
                    maxLength={500}
                    disabled={busy}
                  />
                </label>
              </div>
              <div className="generar-input-meta">
                <span>IDIOMA DE LA VOZ</span>
                <div className="generar-segmented">
                  <button
                    type="button"
                    className={`generar-segment-button glass-glow-button ${language === 'es' ? 'active' : ''}`}
                    onClick={() => {
                      setLanguage('es');
                      setCloneReady(false);
                    }}
                    disabled={busy}
                  >
                    ES
                  </button>
                  <button
                    type="button"
                    className={`generar-segment-button glass-glow-button ${language === 'en' ? 'active' : ''}`}
                    onClick={() => {
                      setLanguage('en');
                      setCloneReady(false);
                    }}
                    disabled={busy}
                  >
                    EN
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {showAudioTray && currentReady ? (
            <>
              <div className="generar-audio-section-title">
                <strong>{activeTool === 'clone' ? '2 · MUESTRAS DE AUDIO' : 'AUDIO DE ENTRADA'}</strong>
                <span>
                  {activeTool === 'clone'
                    ? 'Puedes elegir varias muestras limpias y variadas.'
                    : 'Selecciona un audio existente o sube uno nuevo.'}
                </span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac"
                multiple={activeTool === 'clone'}
                hidden
                onChange={(event) => void handleUpload(event.target.files)}
              />

              <div className="generar-audio-tray-actions">
                <button
                  type="button"
                  className="generar-secondary-action glass-glow-button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!session || uploading || busy}
                >
                  {uploading ? 'SUBIENDO…' : '+ SUBIR AUDIO'}
                </button>
                <span>{audioItems.length} en Bóveda</span>
              </div>

              <div className="generar-audio-source-list">
                {audioItems.length ? (
                  audioItems.map((item) => {
                    const selected =
                      activeTool === 'clone'
                        ? cloneSampleIds.includes(item.id)
                        : selectedInputId === item.id;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={`generar-audio-source-card ${selected ? 'active' : ''}`}
                        onClick={() => {
                          if (activeTool === 'clone') toggleCloneSample(item.id);
                          else setSelectedInputId(item.id);
                        }}
                        disabled={busy}
                      >
                        <span className="generar-audio-source-wave" aria-hidden="true">
                          <i /><i /><i /><i />
                        </span>
                        <span className="generar-audio-source-copy">
                          <strong>{item.nombre || item.etiqueta || 'Audio'}</strong>
                          <small>{item.etiqueta || 'AUDIO PRIVADO'}</small>
                        </span>
                        <span className="generar-audio-check">{selected ? '✓' : '+'}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="generar-audio-empty">
                    <strong>Sin muestras todavía</strong>
                    <span>Sube un MP3, WAV, M4A, AAC, OGG, OPUS o FLAC.</span>
                  </div>
                )}
              </div>
            </>
          ) : null}

          {showVoiceLibrary && currentReady ? (
            <>
              <div className="generar-audio-section-title">
                <strong>{activeTool === 'clone' ? 'VOCES DE TU BIBLIOTECA' : 'VOZ DE SALIDA'}</strong>
                <span>
                  {voicesLoading
                    ? 'Actualizando biblioteca…'
                    : voicesConfigured === false
                      ? 'Biblioteca avanzada no configurada.'
                      : `${voices.length} voz${voices.length === 1 ? '' : 'es'} disponible${voices.length === 1 ? '' : 's'}`}
                </span>
              </div>

              <div className="generar-voice-groups">
                {voiceGroups.map((group) => (
                  <section key={group.id} className="generar-voice-group">
                    <div className="generar-voice-group-title">{group.label}</div>
                    <div className="generar-voice-library">
                      {group.voices.map((voice) => (
                        <button
                          type="button"
                          key={voice.id}
                          className={`generar-voice-card ${selectedVoiceId === voice.id ? 'active' : ''}`}
                          onClick={() => setSelectedVoiceId(voice.id)}
                          disabled={busy}
                        >
                          <span className="generar-voice-avatar">{voice.name.slice(0, 2).toUpperCase()}</span>
                          <span className="generar-voice-copy">
                            <strong>{voice.name}</strong>
                            <small>
                              {voice.language ? voice.language.toUpperCase() : 'VOZ NAYLA'}
                              {voice.redundancy && voice.redundancy > 1 ? ' · RESPALDO AUTO' : ''}
                            </small>
                          </span>
                          {voice.previewUrl ? (
                            <audio
                              src={voice.previewUrl}
                              controls
                              preload="none"
                              onClick={(event) => event.stopPropagation()}
                            />
                          ) : (
                            <span className="generar-audio-check">{selectedVoiceId === voice.id ? '✓' : '○'}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
                {!voicesLoading && !voices.length ? (
                  <div className="generar-audio-empty">
                    <strong>Sin voces cargadas</strong>
                    <span>Puedes crear una desde CLONAR cuando haya una ruta activa.</span>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {activeTool === 'clone' && currentReady ? (
            <>
              <div className="generar-audio-clone-options">
                <label>
                  <input
                    type="checkbox"
                    checked={removeNoise}
                    onChange={(event) => setRemoveNoise(event.target.checked)}
                    disabled={busy}
                  />
                  <span>Limpiar ruido de las muestras</span>
                </label>
                <label className="generar-rights-confirm">
                  <input
                    type="checkbox"
                    checked={rightsConfirmed}
                    onChange={(event) => {
                      setRightsConfirmed(event.target.checked);
                      setCloneReady(false);
                    }}
                    disabled={busy}
                  />
                  <span>Confirmo que tengo permiso para usar estas grabaciones y crear esta voz.</span>
                </label>
              </div>

              <div className="generar-action-row">
                {phase !== 'awaiting' ? (
                  <button
                    type="button"
                    className="generar-primary-action glass-glow-button"
                    onClick={prepareClone}
                    disabled={busy || !session}
                  >
                    PREPARAR CLON
                  </button>
                ) : null}
                {phase === 'awaiting' && cloneReady ? (
                  <>
                    <button
                      type="button"
                      className="generar-primary-action glass-glow-button"
                      onClick={() => void executeClone()}
                    >
                      CONFIRMAR Y CLONAR
                    </button>
                    <button
                      type="button"
                      className="generar-secondary-action glass-glow-button"
                      onClick={resetExecution}
                    >
                      CAMBIAR
                    </button>
                  </>
                ) : null}
              </div>
            </>
          ) : null}

          {currentReady && activeTool !== 'clone' ? (
            <>
              {toolUsesText(activeTool) || activeTool === 'sound_effects' ? (
                <>
                  <div className="generar-audio-section-title">
                    <strong>{activeTool === 'sound_effects' ? 'DESCRIPCIÓN DEL SONIDO' : 'TEXTO'}</strong>
                    <span>
                      {activeTool === 'sound_effects'
                        ? 'Describe ambiente, intensidad, material, duración o acción.'
                        : 'Escribe el contenido que debe interpretar la voz.'}
                    </span>
                  </div>
                  <textarea
                    className="generar-textarea"
                    value={text}
                    onChange={(event) => {
                      setText(event.target.value);
                      if (phase !== 'running' && phase !== 'planning') resetExecution();
                    }}
                    disabled={busy}
                    maxLength={activeTool === 'sound_effects' ? 3000 : 10000}
                    placeholder={
                      activeTool === 'sound_effects'
                        ? 'Ejemplo: puerta metálica pesada cerrándose en un hangar amplio, golpe seco y reverberación corta…'
                        : activeTool === 'dialogue'
                          ? 'Escribe la línea o diálogo que quieres convertir en voz…'
                          : 'Escribe lo que debe decir la voz…'
                    }
                  />
                  <div className="generar-input-meta">
                    <span>{text.length.toLocaleString('es-EC')} caracteres</span>
                    {activeTool !== 'sound_effects' ? (
                      <div className="generar-segmented">
                        <button
                          type="button"
                          className={`generar-segment-button glass-glow-button ${language === 'es' ? 'active' : ''}`}
                          onClick={() => setLanguage('es')}
                          disabled={busy}
                        >
                          ES
                        </button>
                        <button
                          type="button"
                          className={`generar-segment-button glass-glow-button ${language === 'en' ? 'active' : ''}`}
                          onClick={() => setLanguage('en')}
                          disabled={busy}
                        >
                          EN
                        </button>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}

              <div className="generar-action-row">
                {phase !== 'awaiting' && phase !== 'completed' ? (
                  <button
                    type="button"
                    className="generar-primary-action glass-glow-button"
                    disabled={!session || busy}
                    onClick={() => void prepareTool()}
                  >
                    {phase === 'planning' ? 'PREPARANDO…' : 'PREPARAR'}
                  </button>
                ) : null}
                {phase === 'awaiting' ? (
                  <>
                    <button
                      type="button"
                      className="generar-primary-action glass-glow-button"
                      onClick={() => void executePrepared()}
                    >
                      CONFIRMAR Y EJECUTAR
                    </button>
                    <button
                      type="button"
                      className="generar-secondary-action glass-glow-button"
                      onClick={resetExecution}
                    >
                      CAMBIAR
                    </button>
                  </>
                ) : null}
                {(phase === 'completed' || phase === 'failed') ? (
                  <button
                    type="button"
                    className="generar-secondary-action glass-glow-button"
                    onClick={resetExecution}
                  >
                    NUEVO PROCESO
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          {message ? (
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
          ) : null}

          {job?.textOutput ? (
            <div className="generar-audio-transcript">
              <div>
                <strong>TRANSCRIPCIÓN</strong>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(job.textOutput || '')}
                >
                  COPIAR
                </button>
              </div>
              <p>{job.textOutput}</p>
            </div>
          ) : null}

          {result?.url ? (
            <div className="generar-result generar-audio-result">
              <div className="generar-audio-orb" aria-hidden="true">
                <span /><span /><span /><span /><span />
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
          ) : null}
        </div>
      </div>
    </section>
  );
}
