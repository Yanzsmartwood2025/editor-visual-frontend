// @ts-nocheck
import dynamic from 'next/dynamic';
import { NaylaEditorReview } from '../components/NaylaEditorReview';
import type { EditorReview } from '../lib/naylaEditorReview';
/* eslint-disable */
import React, { useState, useEffect, useRef } from 'react';
import { cleanNaylaChatText } from '../lib/naylaText';
import Head from 'next/head';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTimelineItem } from '../components/SortableTimelineItem';
import { MAIN_TOOLS, SUB_TOOLS } from '../config/editorTools';
import { editorGlobalStyles } from '../styles/editorGlobalStyles';
import { getVideoMetadata, getAudioDurationInSeconds } from '@remotion/media-utils';
import { createClient } from '@supabase/supabase-js';
import {
  createMediaId,
  isSupportedDocumentFile,
  resolveMediaKind,
  uploadDocumentFilesToBodega,
  uploadMediaFilesToBodega,
  type DocumentItem,
  type UploadProgressSnapshot,
} from '../lib/mediaUpload';
import { groupSpeechWordsIntoCaptions } from '../lib/autoCaptions';
import { buildMediaMetadata, getCanvasDimensionsFromRatio, probeMediaUrl, type MediaMetadata } from '../lib/mediaMetadata';
import { getCompositionDurationInFrames } from '../lib/timelineMetrics';
import {
  formatPlaybackClock,
  getVisualClipStartSeconds,
  getVisualTimelineDurationSeconds,
  resolveVisualTimelineTime,
} from '../lib/playerTimeline';
import { getFirebaseSession, observeFirebaseSession, signOutFirebase, signInWithCustomTokenValue, type FirebaseSession } from '../lib/firebaseClient';
import { firebaseHeaders } from '../lib/apiClient';
import { Model3DWorkspace } from '../components/Model3DWorkspace';
import GenerarWorkspace from '../components/generar/GenerarWorkspace';
import DiagnosticsWorkspace from '../components/diagnostics/DiagnosticsWorkspace';
import DiagnosticsClientReporter from '../components/diagnostics/DiagnosticsClientReporter';
import { isDiagnosticsAdmin } from '../lib/diagnostics';
import { GpuQuoteModal, type GpuQuoteView } from '../components/GpuQuoteModal';
import { NaylaEngineBar, type NaylaCodeTrace } from '../components/NaylaEngineBar';
import SocialHub from '../components/SocialHub';
import NaylaPlay from '../components/NaylaPlay';
import NaylaPc from '../components/NaylaPc';
import type { NaylaEngineMode } from '../lib/naylaSystemCatalog';
import {
  NaylaProjectMenu,
  type NaylaProject,
  type NaylaChannelAsset,
  type NaylaChannelKind,
} from '../components/NaylaProjectMenu';
import {
  deleteModel3DFromBoveda,
  uploadModel3DToBoveda,
  type Model3DAsset,
} from '../lib/model3d';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('Supabase no está configurado. Auth/storage quedan limitados y el render CPU usa Vercel Sandbox cuando la sesión y R2 están disponibles.');
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Rect = { id: string; x: number; y: number; width: number; height: number };
type MediaItem = { id: string; url: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; creado_en: string; esOverlay: boolean; etiqueta: string; fuente?: string; metadata?: MediaMetadata; r2_key?: string | null; project_id?: string | null; thread_id?: string | null; privacy?: 'private' | 'public' };
type TimelineProfessionalEffect = {
  type: 'chromatic-aberration' | 'color-correction' | 'glow' | 'pixelate' | 'zoom-blur' | 'vignette' | 'light-leak';
  intensity?: number;
  color?: string;
  angle?: number;
  seed?: number;
};
type TimelineGsapPreset = 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom-in' | 'zoom-out' | 'bounce' | 'elastic' | 'spin' | 'swing';
type TimelineGsapMotion = { enter?: TimelineGsapPreset; exit?: TimelineGsapPreset; enterDuration?: number; exitDuration?: number; intensity?: number; };
type TimelineItem = { id: string; mediaId: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; etiqueta: string; url: string; durationInSeconds?: number; originalDurationInSeconds?: number; volume?: number; volumeKeyframes?: { time: number; gain: number }[]; fadeIn?: number; fadeOut?: number; scale?: number; delay?: number; startFrom?: number; trimBefore?: number; trimAfter?: number; loop?: boolean; playbackRate?: number; transitionDuration?: number; transitionType?: 'fade' | 'none' | 'wipe' | 'slide' | 'zoom' | 'film-burn' | 'blur-slide' | 'cross-zoom' | 'dreamy-zoom' | 'linear-blur' | 'push-cut'; visualTemplate?: 'fragment-reveal' | 'carousel-card' | 'depth-stack' | 'split-panels' | 'poster-pop'; efecto?: string; brightness?: number; contrast?: number; saturation?: number; overlay?: string; overlayIntensity?: number; professionalEffects?: TimelineProfessionalEffect[]; motionBlur?: { shutterAngle?: number; samples?: number }; gsapMotion?: TimelineGsapMotion; proceduralMotion?: { preset: 'particles' | 'orbit' | 'pulse-grid' | 'starfield'; intensity?: number; speed?: number; seed?: number; color?: string; accentColor?: string; }; metadata?: MediaMetadata; };
type SubtitleItem = { id: string; texto: string; inicioSec: number; finSec: number; style?: 'clean' | 'cinematic' | 'tiktok' | 'karaoke'; position?: 'top' | 'center' | 'bottom'; fontSize?: number; generated?: boolean; sourceLabel?: string; };
type MotionTitleItem = {
  id: string;
  text: string;
  start: number;
  end: number;
  style?: 'clean' | 'cinematic' | 'neon' | 'minimal';
  animation?: 'fade-up' | 'slide-left' | 'slide-right' | 'pop' | 'zoom-in' | 'word-rise' | 'lower-third';
  position?: 'top' | 'center' | 'bottom';
  fontSize?: number;
  color?: string;
  accentColor?: string;
};
type ThreeRenderScene = {
  id: string;
  mediaId: string;
  label?: string;
  url: string;
  start: number;
  end: number;
  modelScale?: number;
  position?: { x?: number; y?: number; z?: number };
  rotation?: { x?: number; y?: number; z?: number };
  autoRotate?: boolean;
  rotationSpeed?: number;
  cameraDistance?: number;
  cameraFov?: number;
  lighting?: 'studio' | 'soft' | 'dramatic';
  backgroundColor?: string;
  animationName?: string;
};
type VectorAnimationItem = {
  id: string;
  kind: 'lottie' | 'rive';
  url: string;
  start: number;
  end: number;
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
  fit?: 'contain' | 'cover' | 'fill' | 'fit-height' | 'none' | 'scale-down' | 'fit-width';
  alignment?: 'center' | 'bottom-center' | 'bottom-left' | 'bottom-right' | 'center-left' | 'center-right' | 'top-center' | 'top-left' | 'top-right';
  artboard?: string;
  animation?: string;
  loop?: boolean;
  playbackRate?: number;
  direction?: 'forward' | 'backward';
};
type SkiaGraphicItem = {
  id: string;
  preset: 'glow-orb' | 'rings' | 'energy-pulse' | 'spotlights';
  start: number;
  end: number;
  x?: number;
  y?: number;
  scale?: number;
  opacity?: number;
  color?: string;
  accentColor?: string;
  intensity?: number;
  speed?: number;
};
type LogoItem = { id: string; url: string; x: number; y: number; scale: number; opacity: number; inicioSec?: number; finSec?: number; fadeIn?: number; fadeOut?: number; };
type ExpandedSurface = 'tools' | 'chat' | null;
type NaylaProjectDialog =
  | { type: 'new' }
  | { type: 'delete'; projectId: string; projectName: string }
  | null;

type NaylaStockCard = {
  id: string;
  provider: 'pexels' | 'pixabay' | 'openverse';
  kind: 'image' | 'video' | 'audio';
  title: string;
  sourceUrl: string;
  previewUrl?: string;
  mediaUrl?: string;
  creator?: string;
  creatorUrl?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  licenseName?: string;
  licenseUrl?: string;
  attribution?: string;
};

type NaylaChatMessage = {
  editorReview?: EditorReview;
  role: 'user' | 'ai';
  text: string;
  cards?: NaylaStockCard[];
  attachments?: NaylaChannelAsset[];
  renderTask?: {
    requestId?: string;
    status: 'preparing' | 'rendering' | 'saving' | 'completed' | 'failed' | 'cancelled';
    phase: string;
    progress: number;
    framesDone?: number;
    framesTotal?: number;
    outputUrl?: string | null;
    galleryItem?: MediaItem | null;
    error?: string | null;
  };
  actionPlan?: {
    action: string;
    status?: string;
    engine?: 'nayla-cloud' | 'nayla-compute';
    gpuJobId?: string;
    mediaJobId?: string;
    gpuName?: string | null;
    hourlyPrice?: number | null;
    estimatedMaxCost?: number | null;
    runtimeCostEstimate?: number | null;
    outputUrl?: string | null;
    textOutput?: string | null;
  };
};

type MarcoConfig = {
  posicion: 'derecha' | 'izquierda' | 'abajo' | 'arriba' | 'derecha+abajo' | 'derecha+arriba' | 'izquierda+abajo' | 'izquierda+arriba';
  grosor: number;
  color: string;
};

const POSICIONES: MarcoConfig['posicion'][] = ['derecha', 'izquierda', 'abajo', 'arriba', 'derecha+abajo', 'derecha+arriba', 'izquierda+abajo', 'izquierda+arriba'];
const ICONOS_POS: Record<string, string> = { derecha: '→', izquierda: '←', abajo: '↓', arriba: '↑', 'derecha+abajo': '↘', 'derecha+arriba': '↗', 'izquierda+abajo': '↙', 'izquierda+arriba': '↖' };





const SelectableChatText: React.FC<{ text: string; clean?: boolean }> = ({ text, clean = false }) => (
  <div
    data-no-edge-swipe
    style={{
      width: '100%',
      minWidth: 0,
      maxWidth: '100%',
      userSelect: 'text',
      WebkitUserSelect: 'text',
      whiteSpace: 'pre-wrap',
      overflowWrap: 'anywhere',
      wordBreak: 'normal',
      touchAction: 'pan-y',
      lineHeight: 1.55,
    }}
  >
    {clean ? cleanNaylaChatText(text) : text}
  </div>
);

const CHAT_ATTACHMENT_LIMIT = 200;

const isNaylaResultMedia = (item: MediaItem) => {
  const source = String(item.fuente || '').trim().toLowerCase();
  const label = String(item.etiqueta || '').trim().toUpperCase();

  if (/^R\d+$/.test(label)) return true;
  return /^(render:|nayla-cloud|nayla-compute|gpu:|generated:|ai:|output:)/.test(source);
};

const createRenderRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const next = char === 'x' ? value : (value & 0x3) | 0x8;
    return next.toString(16);
  });
};

export default function NaylaCore() {

  const [darkMode, setDarkMode] = useState(true);
  const [session, setSession] = useState<FirebaseSession | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState('');
  const [iaApiKey, setIaApiKey] = useState('');
  const [iaPrompt, setIaPrompt] = useState('Haz un video con 3 clips y ponles subtítulos');
  const [iaLoading, setIaLoading] = useState(false);
  const [selectedAiProvider, setSelectedAiProvider] = useState<'groq' | 'mistral'>('groq');
  const [naylaEngineMode, setNaylaEngineMode] = useState<NaylaEngineMode>('cloud');
  const [naylaCodeTrace, setNaylaCodeTrace] = useState<NaylaCodeTrace | null>(null);
  // Configuración de Cristal y Luz (Glassmorphism & Border Glow)
  const [glowColor, setGlowColor] = useState('#ffffff');
  const [glowSpread, setGlowSpread] = useState(12);
  const [glowIntensity, setGlowIntensity] = useState(0.4);
  const [glassBlur, setGlassBlur] = useState(16);
  const [glassOpacity, setGlassOpacity] = useState(0.65);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.style.setProperty('--glow-color', glowColor);
      let hex = glowColor.replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      const r = parseInt(hex.substring(0, 2) || 'ff', 16);
      const g = parseInt(hex.substring(2, 4) || 'ff', 16);
      const b = parseInt(hex.substring(4, 6) || 'ff', 16);
      root.style.setProperty('--glow-color-rgb', `${r}, ${g}, ${b}`);
      root.style.setProperty('--glow-spread', `${glowSpread}px`);
      root.style.setProperty('--glow-intensity', `${glowIntensity}`);
      root.style.setProperty('--glass-blur', `${glassBlur}px`);
      root.style.setProperty('--glass-bg', `rgba(15, 15, 18, ${glassOpacity})`);
    }
  }, [glowColor, glowSpread, glowIntensity, glassBlur, glassOpacity]);

  const [iaBandejasAbiertas, setIaBandejasAbiertas] = useState(false);
  const [iaBandejaActiva, setIaBandejaActiva] = useState('audio'); // 'audio', 'fotos', 'videos'
  const [iaAudioTexto, setIaAudioTexto] = useState('');
  const [iaFotosFotoBase, setIaFotosFotoBase] = useState('');
  const [iaFotosPrompt, setIaFotosPrompt] = useState('');

  const [customAlertMsg, setCustomAlertMsg] = useState<string | null>(null);
  const [directConfirm, setDirectConfirm] = useState<{ message: string } | null>(null);
  const [projectDialog, setProjectDialog] = useState<NaylaProjectDialog>(null);
  const [projectDialogBusy, setProjectDialogBusy] = useState(false);
  const [newProjectName, setNewProjectName] = useState('Nuevo proyecto');

  const sanitizePublicUiMessage = (value: unknown) => {
    const raw = String(value || '').trim();
    if (!raw) return 'Nayla no pudo completar la operación.';

    return raw
      .replace(/https?:\/\/[^\s)]+/gi, 'Nayla')
      .replace(/\b(?:vercel|github|supabase|remotion|cloudflare|r2|groq|mistral|runpod|vast(?:\.ai)?)\b/gi, 'Nayla')
      .replace(/\beditor-visual-frontend(?:-[a-z0-9-]+)?(?:\.vercel\.app)?\b/gi, 'Nayla')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  const showAlert = (msg: string) => {
    setCustomAlertMsg(sanitizePublicUiMessage(msg));
  };

  const [mainNav, setMainNav] = useState<string>('boveda');
  const [subTool, setSubTool] = useState<string | null>(null);
  const [isVideoExpanded, setIsVideoExpanded] = useState<boolean>(false);
  const diagnosticsAdmin = isDiagnosticsAdmin(session?.user?.email);
  const visibleMainTools = MAIN_TOOLS.filter((tool: any) => !tool.adminOnly || diagnosticsAdmin);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('social_callback') !== '1') return;

    setMainNav('redes');
    setIsSubPanelOpen(true);
    setSubTool('social-hub');
  }, []);
  const [mobileOverlaysVisible, setMobileOverlaysVisible] = useState<boolean>(false);
  const [viewportOverride, setViewportOverride] = useState<'auto' | 'pc' | 'phone'>('auto');
  const [isPhoneViewport, setIsPhoneViewport] = useState<boolean>(false);
  const [deviceOrientation, setDeviceOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [sourceVideoRatio, setSourceVideoRatio] = useState<number | null>(null);
  const [centeredMainToolId, setCenteredMainToolId] = useState<string>('boveda');
  const [centeredSubToolId, setCenteredSubToolId] = useState<string | null>(null);
  const [expandedSurface, setExpandedSurface] = useState<ExpandedSurface>(null);
  const [filtroGaleria, setFiltroGaleria] = useState<string>('todo'); // todo, videos, fotos, audios
  const [searchQuery, setSearchQuery] = useState('');

  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [mediaActionItem, setMediaActionItem] = useState<MediaItem | null>(null);
  const [mediaActionMode, setMediaActionMode] = useState<'menu' | 'delete'>('menu');
  const [mediaActionBusy, setMediaActionBusy] = useState(false);
  const [codigoJsInput, setCodigoJsInput] = useState('// Inyecta comandos JS aquí\n// Ej: NaylaEngine.agregar(["V1", "V2", "A1"]);\n// NaylaEngine.agregarSubtitulos([{ texto: "Hola", inicioSec: 0, finSec: 5 }]);');
  const [moldesScripts, setMoldesScripts] = useState<{ id?: string, nombre: string; codigo: string }[]>([]);
  const [moldeActivo, setMoldeActivo] = useState<string>('');
  const [toolMessage, setToolMessage] = useState<string | null>(null);
  const [marcoConfig, setMarcoConfig] = useState<MarcoConfig>({ posicion: 'derecha+abajo', grosor: 80, color: '#ffffff' });
  const [marcoImagenes, setMarcoImagenes] = useState<{ original: string; procesada: string; nombre: string }[]>([]);
  const [marcoProcesando, setMarcoProcesando] = useState(false);
  const [galeriaMultimedia, setGaleriaMultimedia] = useState<MediaItem[]>([]);
  const [chatDocuments, setChatDocuments] = useState<DocumentItem[]>([]);
  const [modelos3d, setModelos3d] = useState<Model3DAsset[]>([]);
  const [modelo3dActivoId, setModelo3dActivoId] = useState<string | null>(null);
  const [subiendo3d, setSubiendo3d] = useState(false);
  const [gpuQuote, setGpuQuote] = useState<GpuQuoteView | null>(null);
  const [gpuQuoteSource, setGpuQuoteSource] = useState<MediaItem | null>(null);
  const [gpuQuoteRequest, setGpuQuoteRequest] = useState<any | null>(null);
  const [gpuQuoteUi, setGpuQuoteUi] = useState<{
    title: string;
    description?: string;
    confirmLabel: string;
    fromChat?: boolean;
    userText?: string;
  } | null>(null);
  const [gpuQuoteLoading, setGpuQuoteLoading] = useState(false);
  const [gpuQuoteConfirming, setGpuQuoteConfirming] = useState(false);
  const [lineaDeTiempo, setLineaDeTiempo] = useState<TimelineItem[]>([]);
  const lineaDeTiempoRef = useRef<TimelineItem[]>([]);
  useEffect(() => {
    lineaDeTiempoRef.current = lineaDeTiempo;
  }, [lineaDeTiempo]);
  const [subtitulos, setSubtitulos] = useState<SubtitleItem[]>([]);
  const [motionTitles, setMotionTitles] = useState<MotionTitleItem[]>([]);
  const [threeRenderScenes, setThreeRenderScenes] = useState<ThreeRenderScene[]>([]);
  const [vectorAnimations, setVectorAnimations] = useState<VectorAnimationItem[]>([]);
  const [skiaGraphics, setSkiaGraphics] = useState<SkiaGraphicItem[]>([]);
  const [logos, setLogos] = useState<LogoItem[]>([]);
  const [globalSettings, setGlobalSettings] = useState<{ fadeOutFinal?: number; decorations?: any[] }>({});
  const [clipSeleccionado, setClipSeleccionado] = useState<string | null>(null);
  const [canvasRatio, setCanvasRatio] = useState<string>('9/16');
  const [calidadExportacion, setCalidadExportacion] = useState('720p');
  const [pendingRenderQualityChoice, setPendingRenderQualityChoice] = useState<{
    timeline: TimelineItem[];
    suggestedQuality?: string;
    ratioOverride?: string;
    scopeOverride?: { projectId?: string | null; threadId?: string | null };
    subtitlesOverride?: SubtitleItem[];
    titlesOverride?: MotionTitleItem[];
    threeScenesOverride?: ThreeRenderScene[];
    vectorAnimationsOverride?: VectorAnimationItem[];
    skiaGraphicsOverride?: SkiaGraphicItem[];
    renderContext?: { logos?: LogoItem[]; settings?: { fadeOutFinal?: number; decorations?: any[] } };
  } | null>(null);
  const pendingRenderQualityResolverRef = useRef<{
    resolve: (value: any) => void;
    reject: (reason?: any) => void;
  } | null>(null);
  const [renderQualitySelection, setRenderQualitySelection] = useState<string | null>(null);
  const canvasPreviewDimensions = getCanvasDimensionsFromRatio(canvasRatio, '1080p');
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [selectedDownloadMediaId, setSelectedDownloadMediaId] = useState<string | null>(null);
  const [downloadRenameValue, setDownloadRenameValue] = useState('');
  const [downloadRenameBusy, setDownloadRenameBusy] = useState(false);
  const [downloadTrayStep, setDownloadTrayStep] = useState<'list' | 'detail'>('list');
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackPositionSeconds, setPlaybackPositionSeconds] = useState(0);
  const [nativePlaybackDurationSeconds, setNativePlaybackDurationSeconds] = useState(0);
  const [mediaActivaUrl, setMediaActivaUrl] = useState<string | null>(null);
  const [videoResultadoUrl, setVideoResultadoUrl] = useState<string | null>(null);
  const [videoResultadoNombre, setVideoResultadoNombre] = useState<string | null>(null);
  const [videoResultadoEtiqueta, setVideoResultadoEtiqueta] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState({ width: 1080, height: 1920 });
  const [isScriptRunning, setIsScriptRunning] = useState(false);

  // Floating & overlay UI states
  const [isSubPanelOpen, setIsSubPanelOpen] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [isCleanMode, setIsCleanMode] = useState(false);
  const [showPlaybackControls, setShowPlaybackControls] = useState(true);
  const playbackControlsTimerRef = useRef<NodeJS.Timeout | null>(null);

  const pistaVideo = lineaDeTiempo.filter(t => t.tipo === 'video' || t.tipo === 'foto');
  const pistaAudio = lineaDeTiempo.filter(t => t.tipo === 'audio');
  const hayClips = pistaVideo.length > 0;

  const visualActivo =
    lineaDeTiempo.find(item => item.id === clipSeleccionado && (item.tipo === 'video' || item.tipo === 'foto')) ||
    galeriaMultimedia.find(item => item.id === clipSeleccionado && (item.tipo === 'video' || item.tipo === 'foto')) ||
    lineaDeTiempo.find(item => item.url === mediaActivaUrl && (item.tipo === 'video' || item.tipo === 'foto')) ||
    galeriaMultimedia.find(item => item.url === mediaActivaUrl && (item.tipo === 'video' || item.tipo === 'foto')) ||
    pistaVideo[0] ||
    null;


  const activeTimelineClip = visualActivo
    ? pistaVideo.find((item) => item.id === visualActivo.id || item.url === visualActivo.url) || null
    : null;
  const visualTimelineDurationSeconds = getVisualTimelineDurationSeconds(pistaVideo);
  const playbackTotalSeconds =
    videoResultadoUrl || !activeTimelineClip
      ? nativePlaybackDurationSeconds
      : (visualTimelineDurationSeconds || nativePlaybackDurationSeconds);

  const adoptarFormatoVisual = (metadata?: MediaMetadata) => {
    if (metadata?.aspectRatioLabel) {
      setCanvasRatio(metadata.aspectRatioLabel);
      if (metadata.width && metadata.height) {
        setVideoMetadata({ width: metadata.width, height: metadata.height });
        setSourceVideoRatio(metadata.width / metadata.height);
      }
    }
  };

  const resetPlaybackControlsTimer = () => {
    setShowPlaybackControls(true);
    if (playbackControlsTimerRef.current) {
      clearTimeout(playbackControlsTimerRef.current);
    }
    playbackControlsTimerRef.current = setTimeout(() => {
      setShowPlaybackControls(false);
    }, 5000);
  };

  useEffect(() => {
    if (isCleanMode) {
      resetPlaybackControlsTimer();
      return;
    }

    if (isPlaying) {
      resetPlaybackControlsTimer();
    } else {
      setShowPlaybackControls(true);
      if (playbackControlsTimerRef.current) {
        clearTimeout(playbackControlsTimerRef.current);
        playbackControlsTimerRef.current = null;
      }
    }
  }, [isPlaying, isCleanMode]);


  // Render Jobs State


  // Storage Viewer States

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLineaDeTiempo((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        const newArray = arrayMove(items, oldIndex, newIndex);

        // F1/V1/A1 identifican al archivo, no su posición en el timeline.
        // Reordenar clips nunca debe cambiar la identidad del medio.
        sincronizarLineaDeTiempo(newArray);
        return newArray;
      });
    }
  };


  const [isUserScrolling, setIsUserScrolling] = useState(false);

  useEffect(() => {
    const handleUp = () => setIsUserScrolling(false);
    window.addEventListener('pointerup', handleUp);
    return () => window.removeEventListener('pointerup', handleUp);
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewFullscreenRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLVideoElement>(null);
  const pendingPlaybackSeekRef = useRef<number | null>(null);
  const resumePlaybackAfterSourceChangeRef = useRef(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const mainToolsCarouselRef = useRef<HTMLDivElement>(null);
  const subToolsCarouselRef = useRef<HTMLDivElement>(null);
  const lastVideoSurfaceTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);
  const [resizingInfo, setResizingInfo] = useState<{ id: string, corner: string } | null>(null);
  const [draggingInfo, setDraggingInfo] = useState<{ id: string, offsetX: number, offsetY: number } | null>(null);
  const [showEnlaceInput, setShowEnlaceInput] = useState(false);
  const [enlaceInput, setEnlaceInput] = useState('');
  const [extrayendoVideo, setExtrayendoVideo] = useState(false);
  const [queueProgress, setQueueProgress] = useState(0);

  // Estado para seguimiento individual de descargas
  const [descargasActivas, setDescargasActivas] = useState<{ id: string; url: string; status: 'procesando' | 'listo' | 'error' }[]>([]);

  // Nayla Chat States
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const chatAutoFollowRef = useRef(true);
  const [chatMessages, setChatMessages] = useState<NaylaChatMessage[]>([]);
  const [chatProcessing, setChatProcessing] = useState(false);
  const [cloudExecutingIds, setCloudExecutingIds] = useState<string[]>([]);
  const [stockImportingId, setStockImportingId] = useState<string | null>(null);
  const [projects, setProjects] = useState<NaylaProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [chatThreads, setChatThreads] = useState<any[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [chatAttachMenuOpen, setChatAttachMenuOpen] = useState(false);
  const chatDirectUploadRef = useRef<HTMLInputElement | null>(null);
  const [chatAttachmentIds, setChatAttachmentIds] = useState<string[]>([]);
  const [chatUploadProgress, setChatUploadProgress] = useState<{
    total: number;
    done: number;
    failed: number;
    percent: number;
    currentFile?: string;
    phase?: 'uploading' | 'registering' | 'finalizing';
  } | null>(null);
  const [channelUploadingKind, setChannelUploadingKind] = useState<NaylaChannelKind | null>(null);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const getChatComposerMinHeight = () => isPhoneViewport ? 66 : 46;

  const resetChatComposerHeight = () => {
    const textarea = chatInputRef.current;
    if (!textarea) return;
    textarea.style.height = `${getChatComposerMinHeight()}px`;
    textarea.style.overflowY = 'hidden';
    textarea.scrollTop = 0;
  };

  const scrollChatToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const container = chatMessagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  };

  useEffect(() => {
    const textarea = chatInputRef.current;
    if (!textarea) return;

    const minHeight = getChatComposerMinHeight();
    const maxHeight = 190;
    if (!chatInput) {
      resetChatComposerHeight();
      return;
    }

    textarea.style.height = '0px';
    const nextHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [chatInput, isAiModalOpen, isChatOpen, isPhoneViewport]);

  useEffect(() => {
    if (!isAiModalOpen || !chatAutoFollowRef.current) return;
    const frame = window.requestAnimationFrame(() => scrollChatToBottom(chatProcessing ? 'smooth' : 'auto'));
    return () => window.cancelAnimationFrame(frame);
  }, [chatMessages, chatProcessing, toolMessage, isAiModalOpen]);

  const updateRenderTask = (
    requestId: string | undefined,
    patch: Partial<NonNullable<NaylaChatMessage['renderTask']>>
  ) => {
    setChatMessages((prev) => {
      let targetIndex = -1;

      for (let index = prev.length - 1; index >= 0; index -= 1) {
        const task = prev[index].renderTask;
        if (!task) continue;
        if (requestId && task.requestId === requestId) {
          targetIndex = index;
          break;
        }
        if (!requestId && !['completed', 'failed', 'cancelled'].includes(task.status)) {
          targetIndex = index;
          break;
        }
      }

      if (targetIndex === -1) {
        if (requestId) return prev;

        return [
          ...prev,
          {
            role: 'ai' as const,
            text: 'Estoy preparando tu resultado.',
            renderTask: {
              status: 'preparing' as const,
              phase: 'Preparando edición',
              progress: 0,
              ...patch,
            },
          },
        ];
      }

      return prev.map((message, index) =>
        index === targetIndex
          ? {
              ...message,
              renderTask: {
                ...message.renderTask!,
                ...patch,
              },
            }
          : message
      );
    });
  };

  const activeProject = projects.find((project) => project.id === activeProjectId) || null;
  const chatChannelAssets: NaylaChannelAsset[] = [
    ...galeriaMultimedia.map((item) => ({
      id: item.id,
      tipo: item.tipo as NaylaChannelKind,
      nombre: item.nombre,
      url: item.url,
      etiqueta: item.etiqueta,
    })),
    ...chatDocuments.map((item) => ({
      id: item.id,
      tipo: 'documento' as NaylaChannelKind,
      nombre: item.nombre,
      url: item.url,
      etiqueta: item.etiqueta,
    })),
    ...modelos3d.map((item) => ({
      id: item.id,
      tipo: 'modelo3d' as NaylaChannelKind,
      nombre: item.nombre,
      url: item.url,
      etiqueta: item.etiqueta,
    })),
  ];
  const chatAssetById = new Map(chatChannelAssets.map((asset) => [asset.id, asset]));
  const chatAttachedAssets = chatAttachmentIds
    .map((id) => chatAssetById.get(id))
    .filter((asset): asset is NaylaChannelAsset => Boolean(asset));
  const naylaIsWorking =
    chatProcessing ||
    cloudExecutingIds.length > 0 ||
    gpuQuoteLoading ||
    gpuQuoteConfirming ||
    channelUploadingKind !== null ||
    chatUploadProgress !== null ||
    chatMessages.some((message) => {
      const renderActive = message.renderTask && !['completed', 'failed', 'cancelled'].includes(message.renderTask.status);
      const actionStatus = message.actionPlan?.status || '';
      const actionActive = Boolean(
        message.actionPlan &&
        !['completed', 'failed', 'cancelled', 'expired', 'awaiting_confirmation', 'planned'].includes(actionStatus)
      );
      return Boolean(renderActive || actionActive);
    });

  const activeRenderPollKey = chatMessages
    .map((message) => {
      const task = message.renderTask;
      if (!task?.requestId || ['completed', 'failed', 'cancelled'].includes(task.status)) return '';
      return task.requestId + ':' + task.status;
    })
    .filter(Boolean)
    .join('|');

  useEffect(() => {
    const requestIds = Array.from(new Set(
      chatMessages
        .map((message) => message.renderTask)
        .filter((task): task is NonNullable<NaylaChatMessage['renderTask']> =>
          Boolean(task?.requestId) && !['completed', 'failed', 'cancelled'].includes(task!.status)
        )
        .map((task) => task.requestId!)
    ));

    if (!requestIds.length || !session || !activeThreadId) return;

    let cancelled = false;
    let running = false;

    const refresh = async () => {
      if (cancelled || running) return;
      running = true;
      try {
        const currentSession = session || await getFirebaseSession();
        if (!currentSession) return;

        for (const requestId of requestIds) {
          const response = await fetch('/api/render?id=' + encodeURIComponent(requestId), {
            headers: firebaseHeaders(currentSession),
            cache: 'no-store',
          });
          if (!response.ok) continue;
          const payload = await response.json().catch(() => ({}));
          if (cancelled || activeThreadIdRef.current !== activeThreadId) return;

          const usage = payload?.usage || {};
          const serverStatus = String(payload?.status || 'started');
          const stage = String(usage.stage || 'preparing');
          const status: NonNullable<NaylaChatMessage['renderTask']>['status'] =
            serverStatus === 'completed'
              ? 'completed'
              : serverStatus === 'failed'
                ? 'failed'
                : serverStatus === 'cancelled'
                  ? 'cancelled'
                  : stage === 'saving'
                    ? 'saving'
                    : stage === 'rendering'
                      ? 'rendering'
                      : 'preparing';

          const galleryItem = payload?.galleryItem as MediaItem | undefined;
          if (galleryItem) {
            setGaleriaMultimedia((prev) =>
              prev.some((item) => item.id === galleryItem.id)
                ? prev
                : [...prev, galleryItem]
            );

            if (status === 'completed') {
              setVideoResultadoUrl(galleryItem.url);
              setVideoResultadoNombre(galleryItem.nombre || 'Nayla_Render.mp4');
              setVideoResultadoEtiqueta(galleryItem.etiqueta || 'R');
              setMediaActivaUrl(galleryItem.url);
              setClipSeleccionado(null);
              setIsPlaying(false);
            }
          }

          updateRenderTask(requestId, {
            requestId,
            status,
            phase: String(usage.phase || (status === 'completed' ? 'Resultado listo' : 'Procesando')),
            progress: status === 'completed'
              ? 1
              : Math.max(0, Math.min(1, Number(usage.progress) || 0)),
            framesDone: Number.isFinite(Number(usage.framesDone)) ? Number(usage.framesDone) : undefined,
            framesTotal: Number.isFinite(Number(usage.framesTotal)) ? Number(usage.framesTotal) : undefined,
            outputUrl: galleryItem?.url || undefined,
            galleryItem: galleryItem || undefined,
            error: payload?.error || null,
          });
        }
      } finally {
        running = false;
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [activeRenderPollKey, session, activeThreadId]);

  const cancelRenderTask = async (task: NonNullable<NaylaChatMessage['renderTask']>) => {
    if (!task.requestId || ['completed', 'failed', 'cancelled'].includes(task.status)) return;

    const currentSession = session || await getFirebaseSession();
    if (!currentSession) return showAlert('Debes iniciar sesión para cancelar el render.');

    try {
      const response = await fetch('/api/render?id=' + encodeURIComponent(task.requestId), {
        method: 'DELETE',
        headers: firebaseHeaders(currentSession),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'No se pudo cancelar el render.');

      updateRenderTask(task.requestId, {
        status: 'cancelled',
        phase: 'Cancelado por el usuario',
        error: null,
      });
    } catch (error: any) {
      showAlert(error?.message || 'No se pudo cancelar el render.');
    }
  };

  const openRenderResult = (task: NonNullable<NaylaChatMessage['renderTask']>) => {
    if (!task.outputUrl) return;
    setVideoResultadoUrl(task.outputUrl);
    setVideoResultadoNombre(task.galleryItem?.nombre || 'Nayla_Render.mp4');
    setVideoResultadoEtiqueta(task.galleryItem?.etiqueta || 'R');
    setMediaActivaUrl(task.outputUrl);
    setClipSeleccionado(null);
    setIsPlaying(false);
    setProjectMenuOpen(false);
    setIsAiModalOpen(false);
    setIsChatOpen(false);
    setExpandedSurface(null);
  };

  const absorbCloudJob = (job: any) => {
    if (!job) return;

    if (job.galleryItem) {
      if (job.galleryItem.tipo === 'modelo3d') {
        setModelos3d((prev) =>
          prev.some((item) => item.id === job.galleryItem.id)
            ? prev
            : [...prev, job.galleryItem]
        );
        setModelo3dActivoId((current) => current || job.galleryItem.id);
      } else if (['foto', 'video', 'audio'].includes(job.galleryItem.tipo)) {
        setGaleriaMultimedia((prev) =>
          prev.some((item) => item.id === job.galleryItem.id)
            ? prev
            : [...prev, job.galleryItem]
        );
      }
    }

    setChatMessages((prev) => prev.map((message) => {
      if (message.actionPlan?.mediaJobId !== job.id) return message;

      let text = message.text;
      if (job.status === 'completed') {
        text = job.textOutput
          ? job.textOutput
          : 'Nayla Cloud terminó la generación y guardó el resultado en la Bóveda.';
      } else if (job.status === 'failed') {
        text = 'Nayla Cloud no pudo completar la tarea. ' + (job.error || '');
      } else if (job.status === 'running') {
        text = 'Nayla Cloud está procesando la tarea.';
      } else if (job.status === 'queued') {
        text = 'Nayla Cloud puso la tarea en ejecución.';
      }

      return {
        ...message,
        text,
        actionPlan: {
          ...message.actionPlan,
          status: job.status,
          outputUrl: job.outputUrl ?? message.actionPlan.outputUrl,
          textOutput: job.textOutput ?? message.actionPlan.textOutput,
        },
      };
    }));
  };

  const confirmCloudJob = async (jobId: string) => {
    if (!jobId || cloudExecutingIds.includes(jobId)) return;
    const currentSession = session || await getFirebaseSession();
    if (!currentSession) return showAlert('Debes iniciar sesión para usar Nayla Cloud.');

    setCloudExecutingIds((prev) => [...prev, jobId]);
    try {
      const response = await fetch('/api/media/jobs', {
        method: 'POST',
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: jobId }),
      });
      const payload = await response.json().catch(() => ({}));
      if ((!response.ok && response.status !== 422) || payload.error) {
        throw new Error(payload.error || 'No se pudo iniciar Nayla Cloud.');
      }
      if (payload.job) absorbCloudJob(payload.job);
    } catch (error: any) {
      showAlert(error?.message || 'No se pudo iniciar Nayla Cloud.');
    } finally {
      setCloudExecutingIds((prev) => prev.filter((id) => id !== jobId));
    }
  };

  const mediaPollKey = chatMessages
    .map((message) =>
      message.actionPlan?.mediaJobId
        ? message.actionPlan.mediaJobId + ':' + (message.actionPlan.status || 'awaiting_confirmation')
        : ''
    )
    .filter(Boolean)
    .join('|');

  useEffect(() => {
    const terminal = new Set(['completed', 'failed', 'cancelled']);
    const pendingIds = Array.from(new Set(
      chatMessages
        .filter((message) =>
          message.actionPlan?.mediaJobId &&
          !terminal.has(message.actionPlan.status || '') &&
          message.actionPlan.status !== 'awaiting_confirmation' &&
          message.actionPlan.status !== 'planned'
        )
        .map((message) => message.actionPlan!.mediaJobId as string)
    ));
    if (!pendingIds.length || !session) return;

    let cancelled = false;
    let running = false;
    const refresh = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        const currentSession = session || await getFirebaseSession();
        if (!currentSession) return;

        for (const jobId of pendingIds) {
          const response = await fetch('/api/media/jobs?id=' + encodeURIComponent(jobId), {
            headers: firebaseHeaders(currentSession),
          });
          if (!response.ok) continue;
          const payload = await response.json().catch(() => ({}));
          if (!cancelled && payload.job) absorbCloudJob(payload.job);
        }
      } catch (error) {
        console.warn('No se pudo actualizar Nayla Cloud:', error);
      } finally {
        running = false;
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, 4500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [mediaPollKey, session]);

  const gpuPollKey = chatMessages
    .map((message) =>
      message.actionPlan?.gpuJobId
        ? message.actionPlan.gpuJobId + ':' + (message.actionPlan.status || 'queued')
        : ''
    )
    .filter(Boolean)
    .join('|');

  useEffect(() => {
    const activeJobIds = Array.from(new Set(
      chatMessages
        .map((message) => message.actionPlan?.gpuJobId)
        .filter((id): id is string => Boolean(id))
    ));
    if (!activeJobIds.length || !session) return;

    const terminal = new Set(['completed', 'failed', 'expired']);
    const pendingIds = activeJobIds.filter((id) => {
      const message = [...chatMessages].reverse().find((item) => item.actionPlan?.gpuJobId === id);
      return !terminal.has(message?.actionPlan?.status || '');
    });
    if (!pendingIds.length) return;

    let cancelled = false;
    let running = false;

    const refresh = async () => {
      if (running || cancelled) return;
      running = true;
      try {
        const currentSession = session || await getFirebaseSession();
        if (!currentSession) return;

        for (const jobId of pendingIds) {
          const response = await fetch('/api/gpu/jobs?id=' + encodeURIComponent(jobId), {
            headers: firebaseHeaders(currentSession),
          });
          if (!response.ok) continue;
          const payload = await response.json();
          const job = payload?.job;
          if (!job || cancelled) continue;

          if (job.galleryItem) {
            if (job.galleryItem.tipo === 'modelo3d') {
              setModelos3d((prev) =>
                prev.some((item) => item.id === job.galleryItem.id)
                  ? prev
                  : [...prev, job.galleryItem]
              );
              setModelo3dActivoId((current) => current || job.galleryItem.id);
            } else if (['foto', 'video', 'audio'].includes(job.galleryItem.tipo)) {
              setGaleriaMultimedia((prev) =>
                prev.some((item) => item.id === job.galleryItem.id)
                  ? prev
                  : [...prev, job.galleryItem]
              );
            }
          }

          setChatMessages((prev) => prev.map((message) => {
            if (message.actionPlan?.gpuJobId !== jobId) return message;

            let text = message.text;
            if (job.status === 'completed') {
              text = job.galleryItem
                ? 'Trabajo GPU completado. El resultado ya está guardado en la Bóveda.'
                : 'Prueba GPU completada. La instancia fue cerrada correctamente.';
            } else if (job.status === 'failed') {
              text = 'El trabajo GPU falló y Nayla cerró la máquina. ' + (job.error || '');
            } else if (job.status === 'expired') {
              text = 'El tiempo máximo de la GPU venció. Nayla destruyó la instancia para proteger el saldo.';
            } else if (job.status === 'cleanup_pending') {
              text = job.galleryItem
                ? 'El resultado está listo. Nayla está terminando de destruir la instancia GPU.'
                : 'El trabajo terminó, pero la GPU sigue en limpieza automática.';
            } else if (job.status === 'processing') {
              text = 'La GPU está procesando el trabajo.';
            } else if (job.status === 'booting' || job.status === 'renting') {
              text = 'Nayla Compute está preparando la GPU.';
            }

            return {
              ...message,
              text,
              actionPlan: {
                ...message.actionPlan,
                status: job.status,
                gpuName: job.gpuName ?? message.actionPlan.gpuName,
                hourlyPrice: job.hourlyPrice ?? message.actionPlan.hourlyPrice,
                estimatedMaxCost: job.estimatedMaxCost ?? message.actionPlan.estimatedMaxCost,
                runtimeCostEstimate: job.runtimeCostEstimate ?? message.actionPlan.runtimeCostEstimate,
              },
            };
          }));
        }
      } catch (error) {
        console.warn('No se pudo actualizar el estado GPU:', error);
      } finally {
        running = false;
      }
    };

    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [gpuPollKey, session]);

  const toolsOverlayRef = useRef<HTMLDivElement>(null);
  const chatOverlayRef = useRef<HTMLDivElement>(null);
  const lastFocusedElementRef = useRef<HTMLElement | null>(null);

  const openExpandedSurface = (surface: Exclude<ExpandedSurface, null>) => {
    lastFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (surface === 'chat') {
      setIsChatOpen(true);
      setMobileOverlaysVisible(true);
    }
    setExpandedSurface(surface);
  };

  const closeExpandedSurface = () => {
    setExpandedSurface(null);
    requestAnimationFrame(() => lastFocusedElementRef.current?.focus());
  };


  useEffect(() => {
    const updateViewportMode = () => {
      const width = window.visualViewport?.width || window.innerWidth;
      const height = window.visualViewport?.height || window.innerHeight;
      if (viewportOverride === 'pc') {
        setIsPhoneViewport(false);
      } else if (viewportOverride === 'phone') {
        setIsPhoneViewport(true);
      } else {
        setIsPhoneViewport(width < 1024);
      }
      setDeviceOrientation(width > height ? 'landscape' : 'portrait');
    };

    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);
    window.visualViewport?.addEventListener('resize', updateViewportMode);
    return () => {
      window.removeEventListener('resize', updateViewportMode);
      window.visualViewport?.removeEventListener('resize', updateViewportMode);
    };
  }, [viewportOverride]);

  useEffect(() => {
    if (!expandedSurface) return;

    const overlay = expandedSurface === 'tools' ? toolsOverlayRef.current : chatOverlayRef.current;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusable = () => Array.from(overlay?.querySelectorAll<HTMLElement>(focusableSelector) || []);
    const firstFocusable = focusable()[0];
    firstFocusable?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeExpandedSurface();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedSurface]);

  useEffect(() => {
    let swipeStart: { x: number; y: number; surface: Exclude<ExpandedSurface, null> } | null = null;
    const ignoredSelector = 'input, textarea, select, button, a, .editor-preview-canvas, .editor-timeline-panel, .timeline-track, [data-no-edge-swipe]';

    const handlePointerDown = (event: PointerEvent) => {
      if (expandedSurface || event.pointerType === 'mouse') return;
      const target = event.target as Element | null;
      if (target?.closest(ignoredSelector)) return;
      const edge = 24;
      if (event.clientX <= edge) swipeStart = { x: event.clientX, y: event.clientY, surface: 'tools' };
      else if (event.clientX >= window.innerWidth - edge) swipeStart = { x: event.clientX, y: event.clientY, surface: 'chat' };
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (!swipeStart) return;
      const start = swipeStart;
      swipeStart = null;
      const deltaX = event.clientX - start.x;
      const deltaY = event.clientY - start.y;
      const isInwardSwipe = start.surface === 'tools' ? deltaX >= 72 : deltaX <= -72;
      if (isInwardSwipe && Math.abs(deltaX) > Math.abs(deltaY)) openExpandedSurface(start.surface);
    };
    const clearSwipe = () => { swipeStart = null; };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', clearSwipe);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', clearSwipe);
    };
  }, [expandedSurface]);

  useEffect(() => {
    if (mainNav === 'boveda' || mainNav === 'resultados') {
      setFiltroGaleria('todo');
    }
    setCenteredMainToolId(mainNav);
    setCenteredSubToolId(SUB_TOOLS[mainNav]?.[0]?.id || null);
  }, [mainNav]);

  const updateCenteredToolFromScroll = (container: HTMLDivElement | null, setter: (id: string) => void) => {
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const phoneColumn = isPhoneViewport;
    const containerCenter = phoneColumn
      ? containerRect.top + containerRect.height / 2
      : containerRect.left + containerRect.width / 2;
    let closestId = '';
    let closestDistance = Number.POSITIVE_INFINITY;

    Array.from(container.querySelectorAll<HTMLElement>('[data-tool-id]')).forEach((item) => {
      const rect = item.getBoundingClientRect();
      const itemCenter = phoneColumn
        ? rect.top + rect.height / 2
        : rect.left + rect.width / 2;
      const distance = Math.abs(containerCenter - itemCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestId = item.dataset.toolId || '';
      }
    });

    if (closestId) setter(closestId);
  };

  const centerCarouselItem = (container: HTMLDivElement | null, toolId: string) => {
    const target = container?.querySelector<HTMLElement>(`[data-tool-id="${toolId}"]`);
    target?.scrollIntoView({
      behavior: 'smooth',
      inline: isPhoneViewport ? 'nearest' : 'center',
      block: isPhoneViewport ? 'center' : 'nearest'
    });
  };

  const setPreviewFullscreen = async (next: boolean) => {
    const preview = previewFullscreenRef.current;
    const fullscreenDocument = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const fullscreenPreview = preview as (HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    }) | null;

    setIsCleanMode(next);
    setIsSubPanelOpen(false);
    setExpandedSurface(null);
    setIsAiModalOpen(false);

    if (next) {
      setShowPlaybackControls(true);
      resetPlaybackControlsTimer();

      try {
        const activeFullscreen = document.fullscreenElement || fullscreenDocument.webkitFullscreenElement;
        if (!activeFullscreen && fullscreenPreview) {
          const request = fullscreenPreview.requestFullscreen?.bind(fullscreenPreview) ||
            fullscreenPreview.webkitRequestFullscreen?.bind(fullscreenPreview);
          if (request) await request();
        }

        if (isPhoneViewport && sourceVideoRatio !== null) {
          const orientation = screen.orientation as any;
          const preferredOrientation = sourceVideoRatio > 1.15 ? 'landscape' : 'portrait';
          if (orientation?.lock) {
            await orientation.lock(preferredOrientation);
          }
        }
      } catch {
        // Some mobile browsers reject native fullscreen/orientation lock; CSS immersive mode remains active.
      }

      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      });
    } else {
      setShowPlaybackControls(true);
      if (playbackControlsTimerRef.current) {
        clearTimeout(playbackControlsTimerRef.current);
        playbackControlsTimerRef.current = null;
      }

      try {
        const activeFullscreen = document.fullscreenElement || fullscreenDocument.webkitFullscreenElement;
        if (activeFullscreen) {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if (fullscreenDocument.webkitExitFullscreen) await fullscreenDocument.webkitExitFullscreen();
        }
      } catch {
        // Native fullscreen exit is best-effort; CSS mode is already disabled.
      }

      try {
        const orientation = screen.orientation as any;
        if (orientation?.unlock) orientation.unlock();
      } catch {
        // Orientation unlock is best-effort and must never block leaving immersive mode.
      }
    }
  };

  const togglePreviewFullscreen = () => {
    void setPreviewFullscreen(!isCleanMode);
  };

  const handleVideoSurfaceTap = (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    resetPlaybackControlsTimer();
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, textarea, select, a')) return;
    if (subTool === 'delogo') return;

    // Use one detector for mouse, touch and pen. Previously touch could trigger
    // this detector and then a synthetic dblclick, immediately toggling
    // fullscreen back off on some Android browsers.
    const now = Date.now();
    const previous = lastVideoSurfaceTapRef.current;
    const closeEnough =
      previous &&
      now - previous.time <= 560 &&
      Math.hypot(e.clientX - previous.x, e.clientY - previous.y) <= 72;

    if (closeEnough) {
      e.preventDefault();
      lastVideoSurfaceTapRef.current = null;
      togglePreviewFullscreen();
      return;
    }

    lastVideoSurfaceTapRef.current = { time: now, x: e.clientX, y: e.clientY };
  };

  useEffect(() => {
    const syncFullscreenState = () => {
      const fullscreenDocument = document as Document & { webkitFullscreenElement?: Element | null };
      const active = document.fullscreenElement || fullscreenDocument.webkitFullscreenElement;
      if (!active && isCleanMode) setIsCleanMode(false);
    };

    document.addEventListener('fullscreenchange', syncFullscreenState);
    document.addEventListener('webkitfullscreenchange', syncFullscreenState as EventListener);
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreenState);
      document.removeEventListener('webkitfullscreenchange', syncFullscreenState as EventListener);
    };
  }, [isCleanMode]);

  useEffect(() => {
    if (!isCleanMode || !isPhoneViewport || sourceVideoRatio === null) return;

    const horizontalSource = sourceVideoRatio > 1.15;
    const preferredOrientation = horizontalSource ? 'landscape' : 'portrait';

    const lockOrientation = async () => {
      try {
        const orientation = screen.orientation as any;
        if (orientation?.lock) {
          await orientation.lock(preferredOrientation);
        }
      } catch {
        // Mobile browsers may reject orientation locking outside native fullscreen.
        // The player still stays correct with object-fit: contain and responds
        // automatically if the user rotates the device.
      }
    };

    void lockOrientation();

    return () => {
      try {
        const orientation = screen.orientation as any;
        if (orientation?.unlock) orientation.unlock();
      } catch {
        // Best-effort cleanup only.
      }
    };
  }, [isCleanMode, isPhoneViewport, sourceVideoRatio]);

  useEffect(() => {
    if (!isCleanMode || typeof document === 'undefined') return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
    };
  }, [isCleanMode]);

  const handleMainCarouselToolPress = (tool: any) => {
    if (isPhoneViewport && centeredMainToolId !== tool.id) {
      setCenteredMainToolId(tool.id);
      centerCarouselItem(mainToolsCarouselRef.current, tool.id);
      return;
    }

    setMainNav(tool.id);
    setIsChatOpen(false);
    setSubTool(null);
    if (tool.id === 'generar' || tool.id === 'diagnostico') {
      setIsSubPanelOpen(false);
    }
  };

  const handleSubCarouselToolPress = (tool: any) => {
    if (isPhoneViewport && centeredSubToolId !== tool.id) {
      setCenteredSubToolId(tool.id);
      centerCarouselItem(subToolsCarouselRef.current, tool.id);
      return;
    }

    if (tool.isFilter) {
      setFiltroGaleria(tool.filterValue);
      return;
    }

    if (subTool === tool.id) {
      setSubTool(null);
      setToolMessage(null);
      return;
    }

    setSubTool(tool.id);
    if (['groq', 'mistral'].includes(tool.id)) {
      setSelectedAiProvider(tool.id);
      setIsChatOpen(true);
      setMobileOverlaysVisible(true);
      openExpandedSurface('chat');
    } else if (tool.id === 'texto-3d') {
      setMainNav('3d');
      setToolMessage('Describe el modelo en el campo CREAR del Estudio 3D.');
    } else if (tool.id === 'imagen-3d') {
      setToolMessage(null);
      void handle3DNaylaAction('image_to_3d');
    } else if (tool.id === 'multivista-3d') {
      setToolMessage(null);
      void handle3DNaylaAction('multiview_to_3d');
    } else if (tool.id === 'textura-3d') {
      setToolMessage(null);
      void handle3DNaylaAction('texture');
    } else if (tool.id === 'optimizar-3d') {
      setToolMessage(null);
      void handle3DNaylaAction('optimize');
    } else if (tool.id === 'rig-3d') {
      setToolMessage(null);
      void handle3DNaylaAction('rig');
    } else if (tool.id === 'animar-3d') {
      setToolMessage(null);
      void handle3DNaylaAction('animate');
    } else if (['marco', 'delogo', 'script', 'supervisor', 'youtube', 'pixabay', 'musicastock', 'noticias', 'artistas', 'stockvideo', 'sonidos', 'iafoto', 'enlace', 'render'].includes(tool.id)) {
      setToolMessage(null);
    } else {
      setToolMessage('PRÓXIMAMENTE');
    }
  };

  useEffect(() => {
    if (mainNav !== '3d') return;
    if (playerRef.current && !playerRef.current.paused) playerRef.current.pause();
    setIsPlaying(false);
  }, [mainNav]);

  const seekPlaybackToSeconds = (seconds: number) => {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;

    if (videoResultadoUrl || !pistaVideo.length) {
      const duration =
        nativePlaybackDurationSeconds ||
        (playerRef.current && Number.isFinite(playerRef.current.duration) ? playerRef.current.duration : safeSeconds);
      const target = Math.min(Math.max(0, duration || safeSeconds), safeSeconds);
      if (playerRef.current) playerRef.current.currentTime = target;
      setPlaybackPositionSeconds(target);
      return;
    }

    const resolved = resolveVisualTimelineTime(pistaVideo, safeSeconds);
    if (!resolved) return;

    setPlaybackPositionSeconds(resolved.absoluteTime);

    if (resolved.clip.tipo === 'foto') {
      setClipSeleccionado(resolved.clip.id);
      setMediaActivaUrl(resolved.clip.url);
      setVideoResultadoUrl(null);
      setVideoResultadoNombre(null);
      setVideoResultadoEtiqueta(null);
      setIsPlaying(false);
      return;
    }

    const sameClip = activeTimelineClip?.id === resolved.clip.id;
    if (sameClip && playerRef.current) {
      playerRef.current.currentTime = resolved.localTime;
      return;
    }

    pendingPlaybackSeekRef.current = resolved.localTime;
    resumePlaybackAfterSourceChangeRef.current = isPlaying;
    setClipSeleccionado(resolved.clip.id);
    setMediaActivaUrl(resolved.clip.url);
    setVideoResultadoUrl(null);
    setVideoResultadoNombre(null);
    setVideoResultadoEtiqueta(null);
  };

  const seekBy = (seconds: number) => {
    seekPlaybackToSeconds(playbackPositionSeconds + seconds);
  };

  const syncPlaybackClockFromVideo = (video: HTMLVideoElement) => {
    const localTime = Number.isFinite(video.currentTime) ? Math.max(0, video.currentTime) : 0;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
    if (duration) setNativePlaybackDurationSeconds(duration);

    if (videoResultadoUrl || !activeTimelineClip) {
      setPlaybackPositionSeconds(localTime);
      return;
    }

    const offset = getVisualClipStartSeconds(pistaVideo, activeTimelineClip.id);
    setPlaybackPositionSeconds(Math.min(visualTimelineDurationSeconds || Number.POSITIVE_INFINITY, offset + localTime));
  };

  const isPortraitSourceVideo = sourceVideoRatio !== null && sourceVideoRatio < 1;
  const isLandscapeSourceVideo = sourceVideoRatio !== null && sourceVideoRatio > 1.15;
  const phoneVideoObjectFit = isPhoneViewport && isPortraitSourceVideo ? 'cover' : 'contain';
  const forceCssLandscapeFullscreen =
    isCleanMode &&
    isPhoneViewport &&
    isLandscapeSourceVideo &&
    deviceOrientation === 'portrait';

  const validarTimelineParaRender = async (timeline: TimelineItem[]) => {
    const lineaValidada: TimelineItem[] = [];

    for (const item of timeline) {
      let metadata: MediaMetadata = { ...(item.metadata || {}) };

      const needsProbe =
        (item.tipo === 'video' && (!metadata.width || !metadata.height || !metadata.durationInSeconds)) ||
        (item.tipo === 'foto' && (!metadata.width || !metadata.height)) ||
        (item.tipo === 'audio' && !metadata.durationInSeconds);

      if (needsProbe) {
        try {
          metadata = { ...metadata, ...(await probeMediaUrl(item.url, item.tipo)) };
        } catch (error) {
          console.warn('No se pudo detectar toda la metadata de', item.url, error);
        }
      }

      let durationInSeconds = item.durationInSeconds ?? metadata.durationInSeconds;

      if (durationInSeconds === undefined && item.tipo === 'audio') {
        durationInSeconds = await getAudioDurationInSeconds(item.url);
      } else if (durationInSeconds === undefined && item.tipo === 'video') {
        const remotionMetadata = await getVideoMetadata(item.url);
        durationInSeconds = remotionMetadata.durationInSeconds;
      } else if (durationInSeconds === undefined && item.tipo === 'foto') {
        durationInSeconds = 5;
      }

      if ((item.tipo === 'video' || item.tipo === 'audio') && (!durationInSeconds || durationInSeconds <= 0)) {
        throw new Error(`No se pudo determinar la duración de ${item.nombre || item.etiqueta}.`);
      }

      if (durationInSeconds) {
        metadata.durationInSeconds = metadata.durationInSeconds || durationInSeconds;
      }

      lineaValidada.push({
        ...item,
        metadata,
        durationInSeconds,
        originalDurationInSeconds: item.originalDurationInSeconds || durationInSeconds
      });
    }

    return lineaValidada;
  };

  const ejecutarRenderTimeline = async (
    timeline: TimelineItem[],
    qualityOverride?: string,
    ratioOverride?: string,
    scopeOverride?: { projectId?: string | null; threadId?: string | null },
    subtitlesOverride?: SubtitleItem[],
    titlesOverride?: MotionTitleItem[],
    threeScenesOverride?: ThreeRenderScene[],
    vectorAnimationsOverride?: VectorAnimationItem[],
    skiaGraphicsOverride?: SkiaGraphicItem[],
    renderContext?: { logos?: LogoItem[]; settings?: { fadeOutFinal?: number; decorations?: any[] } }
  ) => {
    const renderProjectId = scopeOverride?.projectId ?? activeProjectId;
    const renderThreadId = scopeOverride?.threadId ?? activeThreadId;
    const currentSession = session || await getFirebaseSession();
    if (!currentSession) throw new Error('Debes iniciar sesión para renderizar.');

    const lineaValidada = await validarTimelineParaRender(timeline);
    const exportQuality = qualityOverride || calidadExportacion;
    const renderRatio = ratioOverride || canvasRatio;
    const canvas = getCanvasDimensionsFromRatio(renderRatio, exportQuality);
    const renderSubtitles = subtitlesOverride ?? subtitulos;
    const renderTitles = titlesOverride ?? motionTitles;
    const renderThreeScenes = threeScenesOverride ?? threeRenderScenes;
    const renderVectorAnimations = vectorAnimationsOverride ?? vectorAnimations;
    const renderSkiaGraphics = skiaGraphicsOverride ?? skiaGraphics;
    const renderLogos = renderContext?.logos ?? logos;
    const renderSettings = renderContext?.settings ?? globalSettings;
    const durationInFrames = getCompositionDurationInFrames(
      lineaValidada,
      30,
      renderSubtitles,
      renderLogos,
      renderTitles,
      renderThreeScenes,
      renderVectorAnimations,
      renderSkiaGraphics,
      renderSettings.decorations || []
    );
    const requestId = createRenderRequestId();

    if (!renderThreadId || activeThreadIdRef.current === renderThreadId) {
      updateRenderTask(undefined, {
        requestId,
        status: 'preparing',
        phase: 'Preparando edición',
        progress: 0.01,
        framesDone: 0,
        framesTotal: durationInFrames,
        error: null,
      });
    }

    const inputProps = {
      timeline: lineaValidada,
      subtitles: renderSubtitles,
      titles: renderTitles,
      threeScenes: renderThreeScenes,
      vectorAnimations: renderVectorAnimations,
      skiaGraphics: renderSkiaGraphics,
      logos: renderLogos,
      canvasRatio: renderRatio,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      exportQuality,
      settings: renderSettings
    };

    // Progress is tracked by the single activeRenderPollKey effect above.
    // Avoid duplicate status polling while the POST render request is running.

    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          requestId,
          inputProps,
          projectId: renderProjectId || undefined,
          threadId: renderThreadId || undefined,
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.cancelled) {
          updateRenderTask(requestId, {
            status: 'cancelled',
            phase: 'Cancelado por el usuario',
            error: null,
          });
          return data;
        }

        const publicMessage = data.error || 'No se pudo completar el procesamiento en este intento.';
        updateRenderTask(requestId, {
          status: 'failed',
          phase: 'Procesamiento interrumpido',
          progress: 0,
          framesTotal: durationInFrames,
          error: publicMessage,
        });
        const renderError: any = new Error(publicMessage);
        renderError.naylaRenderHandled = true;
        throw renderError;
      }

      if (data.status === 'completed' && data.output?.url) {
        const outputUrl = data.output.url as string;
        const renderItem = data.galleryItem as MediaItem | undefined;
        const stillInOriginChat = !renderThreadId || activeThreadIdRef.current === renderThreadId;

        if (stillInOriginChat) {
          setVideoResultadoUrl(outputUrl);
          setVideoResultadoNombre(renderItem?.nombre || 'Nayla_Render.mp4');
          setVideoResultadoEtiqueta(renderItem?.etiqueta || 'R');
          if (renderItem) {
            setGaleriaMultimedia(prev =>
              prev.some(item => item.id === renderItem.id)
                ? prev
                : [...prev, renderItem]
            );
          }

          updateRenderTask(requestId, {
            status: 'completed',
            phase: 'Resultado listo',
            progress: 1,
            framesDone: durationInFrames,
            framesTotal: durationInFrames,
            outputUrl,
            galleryItem: renderItem || null,
            error: null,
          });
        }

        return data;
      }

      return data;
    } catch (error: any) {
      if (!error?.naylaRenderHandled) {
        const publicMessage = 'No se pudo completar el procesamiento en este intento.';
        updateRenderTask(requestId, {
          status: 'failed',
          phase: 'Procesamiento interrumpido',
          progress: 0,
          framesTotal: durationInFrames,
          error: publicMessage,
        });
        error.naylaRenderHandled = true;
      }
      throw error;
    } finally {
      // The render poll effect stops automatically once the task becomes terminal.
    }
  };

  const solicitarRenderTimeline = (
    timeline: TimelineItem[],
    qualityOverride?: string,
    ratioOverride?: string,
    scopeOverride?: { projectId?: string | null; threadId?: string | null },
    subtitlesOverride?: SubtitleItem[],
    titlesOverride?: MotionTitleItem[],
    threeScenesOverride?: ThreeRenderScene[],
    vectorAnimationsOverride?: VectorAnimationItem[],
    skiaGraphicsOverride?: SkiaGraphicItem[],
    renderContext?: { logos?: LogoItem[]; settings?: { fadeOutFinal?: number; decorations?: any[] } }
  ) => new Promise<any>((resolve, reject) => {
    const suggestedQuality = qualityOverride || calidadExportacion || '720p';
    setCalidadExportacion(suggestedQuality);
    setRenderQualitySelection(null);
    setCustomAlertMsg(null);
    pendingRenderQualityResolverRef.current = { resolve, reject };
    setPendingRenderQualityChoice({
      timeline,
      suggestedQuality,
      ratioOverride,
      scopeOverride,
      subtitlesOverride,
      titlesOverride,
      threeScenesOverride,
      vectorAnimationsOverride,
      skiaGraphicsOverride,
      renderContext,
    });
  });

  const cancelarSeleccionCalidadRender = () => {
    const waiter = pendingRenderQualityResolverRef.current;
    pendingRenderQualityResolverRef.current = null;
    setPendingRenderQualityChoice(null);
    setRenderQualitySelection(null);
    waiter?.resolve({ cancelled: true });
  };

  const confirmarCalidadRender = async (quality: string) => {
    const pending = pendingRenderQualityChoice;
    const waiter = pendingRenderQualityResolverRef.current;
    if (!pending || !waiter) return;

    setCalidadExportacion(quality);
    setPendingRenderQualityChoice(null);
    setRenderQualitySelection(null);
    pendingRenderQualityResolverRef.current = null;

    try {
      const result = await ejecutarRenderTimeline(
        pending.timeline,
        quality,
        pending.ratioOverride,
        pending.scopeOverride,
        pending.subtitlesOverride,
        pending.titlesOverride,
        pending.threeScenesOverride,
        pending.vectorAnimationsOverride,
        pending.skiaGraphicsOverride,
        pending.renderContext
      );
      waiter.resolve(result);
    } catch (error) {
      waiter.reject(error);
    }
  };

  const ejecutarBuildTimeline = async (
    actionData: any,
    scopeOverride?: { projectId?: string | null; threadId?: string | null }
  ) => {
    const assets = Array.isArray(actionData.assets) ? actionData.assets : [];
    const requestedThreeScenes = Array.isArray(actionData.threeScenes) ? actionData.threeScenes : [];
    const requestedVectorAnimations = Array.isArray(actionData.vectorAnimations) ? actionData.vectorAnimations : [];
    const requestedSkiaGraphics = Array.isArray(actionData.skiaGraphics) ? actionData.skiaGraphics : [];
    if (assets.length === 0 && requestedThreeScenes.length === 0 && requestedVectorAnimations.length === 0 && requestedSkiaGraphics.length === 0 && !(actionData.decorations?.length || actionData.renderContext?.settings?.decorations?.length)) {
      throw new Error('Nayla no devolvió clips, escenas 3D, animaciones vectoriales ni gráficos Skia para armar el render.');
    }

    const nextTimeline: TimelineItem[] = [];
    assets.forEach((asset: any, index: number) => {
      const url = typeof asset.url === 'string' ? asset.url.trim() : '';
      const tipo = asset.type === 'image' ? 'foto' : asset.type;
      if (!url || !['foto', 'video', 'audio'].includes(tipo) || asset.source !== 'url') return;

      const mediaExistente = galeriaMultimedia.find((item) => {
        if (item.tipo !== tipo) return false;
        if (item.url === url) return true;

        try {
          const current = new URL(item.url);
          const incoming = new URL(url);
          return current.origin + current.pathname === incoming.origin + incoming.pathname;
        } catch {
          return false;
        }
      });
      const mediaId = mediaExistente?.id || `nayla-url-${Date.now()}-${index}`;
      const etiqueta = mediaExistente?.etiqueta || `${tipo === 'foto' ? 'F' : tipo === 'audio' ? 'A' : 'V'}_IA_${index + 1}`;
      const nombre = mediaExistente?.nombre || `Nayla ${tipo} ${index + 1}`;

      const requestedDuration = Number(asset.durationInSeconds);
      const baseDuration =
        Number.isFinite(requestedDuration) && requestedDuration > 0
          ? requestedDuration
          : tipo === 'foto'
            ? 5
            : mediaExistente?.durationInSeconds;

      nextTimeline.push({
        id: `nayla-timeline-${Date.now()}-${index}`,
        mediaId,
        tipo,
        nombre,
        etiqueta,
        url,
        durationInSeconds: baseDuration,
        originalDurationInSeconds:
          asset.originalDurationInSeconds ||
          mediaExistente?.originalDurationInSeconds ||
          mediaExistente?.durationInSeconds ||
          baseDuration,
        metadata: mediaExistente?.metadata,
        ...(typeof asset.efecto === 'string' ? { efecto: asset.efecto } : {}),
        ...(typeof asset.visualTemplate === 'string' ? { visualTemplate: asset.visualTemplate } : {}),
        ...(typeof asset.transitionType === 'string' ? { transitionType: asset.transitionType } : {}),
        ...(Number.isFinite(Number(asset.transitionDuration)) ? { transitionDuration: Number(asset.transitionDuration) } : {}),
        ...(Number.isFinite(Number(asset.fadeIn)) ? { fadeIn: Number(asset.fadeIn) } : {}),
        ...(Number.isFinite(Number(asset.fadeOut)) ? { fadeOut: Number(asset.fadeOut) } : {}),
        ...(Number.isFinite(Number(asset.volume)) ? { volume: Number(asset.volume) } : {}),
        ...(Array.isArray(asset.volumeKeyframes) ? { volumeKeyframes: asset.volumeKeyframes } : {}),
        ...(Number.isFinite(Number(asset.scale)) ? { scale: Number(asset.scale) } : {}),
        ...(Number.isFinite(Number(asset.delay)) ? { delay: Number(asset.delay) } : {}),
        ...(Number.isFinite(Number(asset.startFrom)) ? { startFrom: Number(asset.startFrom) } : {}),
        ...(Number.isFinite(Number(asset.trimBefore)) ? { trimBefore: Number(asset.trimBefore) } : {}),
        ...(Number.isFinite(Number(asset.trimAfter)) ? { trimAfter: Number(asset.trimAfter) } : {}),
        ...(typeof asset.loop === 'boolean' ? { loop: asset.loop } : {}),
        ...(Number.isFinite(Number(asset.playbackRate)) ? { playbackRate: Number(asset.playbackRate) } : {}),
        ...(Number.isFinite(Number(asset.brightness)) ? { brightness: Number(asset.brightness) } : {}),
        ...(Number.isFinite(Number(asset.contrast)) ? { contrast: Number(asset.contrast) } : {}),
        ...(Number.isFinite(Number(asset.saturation)) ? { saturation: Number(asset.saturation) } : {}),
        ...(typeof asset.overlay === 'string' ? { overlay: asset.overlay } : {}),
        ...(Number.isFinite(Number(asset.overlayIntensity)) ? { overlayIntensity: Number(asset.overlayIntensity) } : {}),
        ...(Array.isArray(asset.professionalEffects) && asset.professionalEffects.length
          ? { professionalEffects: asset.professionalEffects }
          : {}),
        ...(asset.motionBlur && typeof asset.motionBlur === 'object'
          ? { motionBlur: asset.motionBlur }
          : {}),
        ...(asset.gsapMotion && typeof asset.gsapMotion === 'object'
          ? { gsapMotion: asset.gsapMotion }
          : {}),
        ...(asset.proceduralMotion && typeof asset.proceduralMotion === 'object'
          ? { proceduralMotion: asset.proceduralMotion }
          : {})
      });
    });

    if (nextTimeline.length === 0 && requestedThreeScenes.length === 0 && requestedVectorAnimations.length === 0 && requestedSkiaGraphics.length === 0 && !(actionData.decorations?.length || actionData.renderContext?.settings?.decorations?.length)) {
      throw new Error('Nayla no devolvió medios válidos para armar el render.');
    }

    const timelineValidado = await validarTimelineParaRender(nextTimeline);
    const hasSubtitleDirective = Array.isArray(actionData.subtitles);
    const actionSubtitles: SubtitleItem[] = hasSubtitleDirective
      ? actionData.subtitles
          .filter((sub: any) =>
            sub &&
            typeof sub.text === 'string' &&
            Number.isFinite(Number(sub.start)) &&
            Number.isFinite(Number(sub.end)) &&
            Number(sub.end) > Number(sub.start)
          )
          .slice(0, 300)
          .map((sub: any, index: number) => ({
            id: `nayla-sub-${Date.now()}-${index}`,
            texto: sub.text.trim(),
            fontFamily: sub.fontFamily, fontUrl: sub.fontUrl,
            inicioSec: Math.max(0, Number(sub.start)),
            finSec: Math.max(0, Number(sub.end)),
            style: ['clean', 'cinematic', 'tiktok', 'karaoke'].includes(sub.style)
              ? sub.style
              : 'clean',
            position: ['top', 'center', 'bottom'].includes(sub.position)
              ? sub.position
              : 'bottom',
            ...(Number.isFinite(Number(sub.fontSize))
              ? { fontSize: Math.max(20, Math.min(120, Number(sub.fontSize))) }
              : {}),
          }))
      : subtitulos;

    const hasTitleDirective = Array.isArray(actionData.titles);
    const actionTitles: MotionTitleItem[] = hasTitleDirective
      ? actionData.titles
          .filter((title: any) =>
            title &&
            typeof title.text === 'string' &&
            Number.isFinite(Number(title.start)) &&
            Number.isFinite(Number(title.end)) &&
            Number(title.end) > Number(title.start)
          )
          .slice(0, 80)
          .map((title: any, index: number) => ({
            id: `nayla-title-${Date.now()}-${index}`,
            text: title.text.trim(),
            fontFamily: title.fontFamily, fontUrl: title.fontUrl,
            start: Math.max(0, Number(title.start)),
            end: Math.max(0, Number(title.end)),
            style: ['clean', 'cinematic', 'neon', 'minimal'].includes(title.style)
              ? title.style
              : 'clean',
            animation: [
              'fade-up',
              'slide-left',
              'slide-right',
              'pop',
              'zoom-in',
              'word-rise',
              'lower-third',
            ].includes(title.animation)
              ? title.animation
              : 'fade-up',
            position: ['top', 'center', 'bottom'].includes(title.position)
              ? title.position
              : 'center',
            ...(Number.isFinite(Number(title.fontSize))
              ? { fontSize: Math.max(24, Math.min(180, Number(title.fontSize))) }
              : {}),
            ...(typeof title.color === 'string' && title.color.trim()
              ? { color: title.color.trim().slice(0, 64) }
              : {}),
            ...(typeof title.accentColor === 'string' && title.accentColor.trim()
              ? { accentColor: title.accentColor.trim().slice(0, 64) }
              : {}),
          }))
      : motionTitles;

    const hasThreeSceneDirective = Array.isArray(actionData.threeScenes);
    const actionThreeScenes: ThreeRenderScene[] = hasThreeSceneDirective
      ? requestedThreeScenes.slice(0, 24).map((scene: any, index: number) => {
          const requestedLabel = String(scene.label || '').trim().toUpperCase();
          const model = modelos3d.find(
            (item) => String(item.etiqueta || '').trim().toUpperCase() === requestedLabel
          );

          if (!model) {
            throw new Error(`No encuentro ${requestedLabel || 'ese modelo 3D'} en este proyecto.`);
          }

          return {
            id: `nayla-3d-${Date.now()}-${index}`,
            mediaId: model.id,
            label: model.etiqueta,
            url: model.url,
            start: Math.max(0, Number(scene.start) || 0),
            end: Math.max(0.1, Number(scene.end) || 5),
            modelScale: Math.max(0.02, Math.min(30, Number(scene.modelScale) || 1)),
            position: scene.position && typeof scene.position === 'object' ? scene.position : undefined,
            rotation: scene.rotation && typeof scene.rotation === 'object' ? scene.rotation : undefined,
            autoRotate: scene.autoRotate !== false,
            rotationSpeed: Number.isFinite(Number(scene.rotationSpeed)) ? Number(scene.rotationSpeed) : 24,
            cameraDistance: Math.max(0.8, Math.min(40, Number(scene.cameraDistance) || 5)),
            cameraFov: Math.max(15, Math.min(100, Number(scene.cameraFov) || 42)),
            lighting: ['studio', 'soft', 'dramatic'].includes(scene.lighting)
              ? scene.lighting
              : 'studio',
            backgroundColor:
              typeof scene.backgroundColor === 'string' && scene.backgroundColor.trim()
                ? scene.backgroundColor.trim().slice(0, 64)
                : 'transparent',
            ...(typeof scene.animationName === 'string' && scene.animationName.trim()
              ? { animationName: scene.animationName.trim().slice(0, 160) }
              : {}),
          };
        })
      : threeRenderScenes;

    const hasVectorAnimationDirective = Array.isArray(actionData.vectorAnimations);
    const actionVectorAnimations: VectorAnimationItem[] = hasVectorAnimationDirective
      ? requestedVectorAnimations
          .filter((item: any) =>
            item &&
            ['lottie', 'rive'].includes(item.kind) &&
            typeof item.url === 'string' &&
            /^https?:\/\//i.test(item.url.trim()) &&
            Number.isFinite(Number(item.start)) &&
            Number.isFinite(Number(item.end)) &&
            Number(item.end) > Number(item.start)
          )
          .slice(0, 40)
          .map((item: any, index: number) => ({
            id: `nayla-vector-${Date.now()}-${index}`,
            kind: item.kind,
            url: item.url.trim(),
            start: Math.max(0, Number(item.start)),
            end: Math.max(0.1, Number(item.end)),
            x: Math.max(-50, Math.min(50, Number(item.x) || 0)),
            y: Math.max(-50, Math.min(50, Number(item.y) || 0)),
            scale: Math.max(0.05, Math.min(4, Number(item.scale) || 1)),
            opacity: Math.max(0, Math.min(1, Number.isFinite(Number(item.opacity)) ? Number(item.opacity) : 1)),
            fit: ['contain', 'cover', 'fill', 'fit-height', 'none', 'scale-down', 'fit-width'].includes(item.fit)
              ? item.fit
              : 'contain',
            alignment: [
              'center',
              'bottom-center',
              'bottom-left',
              'bottom-right',
              'center-left',
              'center-right',
              'top-center',
              'top-left',
              'top-right',
            ].includes(item.alignment)
              ? item.alignment
              : 'center',
            ...(typeof item.artboard === 'string' && item.artboard.trim()
              ? { artboard: item.artboard.trim().slice(0, 160) }
              : {}),
            ...(typeof item.animation === 'string' && item.animation.trim()
              ? { animation: item.animation.trim().slice(0, 160) }
              : {}),
            loop: item.loop !== false,
            playbackRate: Math.max(0.1, Math.min(4, Number(item.playbackRate) || 1)),
            direction: item.direction === 'backward' ? 'backward' : 'forward',
          }))
      : vectorAnimations;

    const hasSkiaGraphicDirective = Array.isArray(actionData.skiaGraphics);
    const actionSkiaGraphics: SkiaGraphicItem[] = hasSkiaGraphicDirective
      ? requestedSkiaGraphics
          .filter((item: any) =>
            item &&
            ['glow-orb', 'rings', 'energy-pulse', 'spotlights'].includes(item.preset) &&
            Number.isFinite(Number(item.start)) &&
            Number.isFinite(Number(item.end)) &&
            Number(item.end) > Number(item.start)
          )
          .slice(0, 40)
          .map((item: any, index: number) => ({
            id: `nayla-skia-${Date.now()}-${index}`,
            preset: item.preset,
            start: Math.max(0, Number(item.start)),
            end: Math.max(0.1, Number(item.end)),
            x: Math.max(-50, Math.min(50, Number(item.x) || 0)),
            y: Math.max(-50, Math.min(50, Number(item.y) || 0)),
            scale: Math.max(0.05, Math.min(4, Number(item.scale) || 1)),
            opacity: Math.max(0, Math.min(1, Number.isFinite(Number(item.opacity)) ? Number(item.opacity) : 1)),
            color:
              typeof item.color === 'string' && item.color.trim()
                ? item.color.trim().slice(0, 64)
                : '#ffffff',
            accentColor:
              typeof item.accentColor === 'string' && item.accentColor.trim()
                ? item.accentColor.trim().slice(0, 64)
                : '#7dd3fc',
            intensity: Math.max(0, Math.min(1, Number.isFinite(Number(item.intensity)) ? Number(item.intensity) : 0.6)),
            speed: Math.max(0.1, Math.min(4, Number(item.speed) || 1)),
          }))
      : skiaGraphics;

    const targetThreadId = scopeOverride?.threadId ?? activeThreadId;
    const stillInOriginChat = !targetThreadId || activeThreadIdRef.current === targetThreadId;

    if (stillInOriginChat) {
      if (actionData.renderContext?.settings) setGlobalSettings(actionData.renderContext.settings);
      setLineaDeTiempo(timelineValidado);
      sincronizarLineaDeTiempo(timelineValidado);
      const firstTimelineItem = timelineValidado[0];
      setClipSeleccionado(firstTimelineItem?.id || null);
      setMediaActivaUrl(firstTimelineItem?.url || null);
      setVideoResultadoUrl(null);
      setVideoResultadoNombre(null);
      setVideoResultadoEtiqueta(null);
      setRects([]);
      if (hasSubtitleDirective) {
        setSubtitulos(actionSubtitles);
      }
      if (hasTitleDirective) {
        setMotionTitles(actionTitles);
      }
      if (hasThreeSceneDirective) {
        setThreeRenderScenes(actionThreeScenes);
      }
      if (hasVectorAnimationDirective) {
        setVectorAnimations(actionVectorAnimations);
      }
      if (hasSkiaGraphicDirective) {
        setSkiaGraphics(actionSkiaGraphics);
      }
    }

    const primerVisual = timelineValidado.find(item => item.tipo === 'video' || item.tipo === 'foto');
    const formatoDetectado = primerVisual?.metadata?.aspectRatioLabel;

    if (stillInOriginChat && primerVisual?.metadata) {
      adoptarFormatoVisual(primerVisual.metadata);
    }

    if (actionData.render === true) {
      await solicitarRenderTimeline(
        timelineValidado,
        actionData.renderContext?.exportQuality,
        actionData.renderContext?.canvasRatio || formatoDetectado,
        scopeOverride,
        hasSubtitleDirective ? actionSubtitles : undefined,
        hasTitleDirective ? actionTitles : undefined,
        hasThreeSceneDirective ? actionThreeScenes : undefined,
        hasVectorAnimationDirective ? actionVectorAnimations : undefined,
        hasSkiaGraphicDirective ? actionSkiaGraphics : undefined,
        actionData.renderContext
      );
    } else {
      showAlert('Nayla armó el timeline con los medios existentes.');
    }
  };

  const stockKindToMediaKind = (kind: NaylaStockCard['kind']): MediaItem['tipo'] =>
    kind === 'image' ? 'foto' : kind === 'video' ? 'video' : 'audio';

  const stockFileExtension = (contentType: string, card: NaylaStockCard) => {
    const normalized = (contentType || '').toLowerCase();
    if (normalized.includes('jpeg')) return 'jpg';
    if (normalized.includes('png')) return 'png';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('mp4')) return 'mp4';
    if (normalized.includes('webm')) return 'webm';
    if (normalized.includes('wav')) return 'wav';
    if (normalized.includes('ogg')) return 'ogg';
    if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
    const urlExtension = card.mediaUrl?.split('?')[0].split('.').pop()?.toLowerCase();
    if (urlExtension && /^[a-z0-9]{2,5}$/.test(urlExtension)) return urlExtension;
    return card.kind === 'image' ? 'jpg' : card.kind === 'video' ? 'mp4' : 'mp3';
  };

  const importStockCard = async (card: NaylaStockCard, addToTimeline: boolean) => {
    if (!card.mediaUrl) throw new Error('Este resultado no tiene un archivo importable.');
    const currentSession = session || await getFirebaseSession();
    if (!currentSession) throw new Error('Debes iniciar sesión para guardar medios.');

    setStockImportingId(card.id);
    try {
      const existing = galeriaMultimedia.find(item =>
        item.metadata?.sourceUrl === card.sourceUrl &&
        item.metadata?.sourceProvider === card.provider
      );

      let savedItem = existing;
      if (!savedItem) {
        let sourceResponse: Response;
        try {
          sourceResponse = await fetch(card.mediaUrl);
        } catch {
          throw new Error('El proveedor bloqueó la descarga directa desde el navegador. Prueba otro resultado.');
        }
        if (!sourceResponse.ok) {
          throw new Error(`No se pudo descargar el medio del proveedor (HTTP ${sourceResponse.status}).`);
        }

        const blob = await sourceResponse.blob();
        const tipo = stockKindToMediaKind(card.kind);
        const fallbackContentType = tipo === 'foto' ? 'image/jpeg' : tipo === 'video' ? 'video/mp4' : 'audio/mpeg';
        const contentType = blob.type || fallbackContentType;
        const extension = stockFileExtension(contentType, card);
        const safeProvider = card.provider.replace(/[^a-z0-9_-]/gi, '');
        const safeId = card.id.replace(/[^a-z0-9_-]/gi, '-').slice(-80);
        const file = new File([blob], `${safeProvider}-${safeId}.${extension}`, { type: contentType });

        const saved = await uploadMediaFilesToBodega({
          session: currentSession,
          files: [file],
          existingItems: galeriaMultimedia,
          forcedTipo: tipo,
          fuente: `stock:${card.provider}`,
          projectId: activeProjectId || undefined,
          threadId: activeThreadId || undefined,
          metadataExtra: {
            sourceProvider: card.provider,
            sourceUrl: card.sourceUrl,
            creator: card.creator,
            creatorUrl: card.creatorUrl,
            licenseName: card.licenseName,
            licenseUrl: card.licenseUrl,
            attribution: card.attribution,
          },
        });

        savedItem = saved[0];
        if (!savedItem) throw new Error('La Bóveda no devolvió el medio importado.');
        setGaleriaMultimedia(prev => prev.some(item => item.id === savedItem!.id) ? prev : [...prev, savedItem!]);
      }

      if (addToTimeline && savedItem) {
        await agregarAlTimeline(savedItem, { preventDuplicate: true });
        showAlert('Medio guardado en la Bóveda y añadido al timeline.');
      } else {
        showAlert(existing ? 'Ese medio ya estaba guardado en la Bóveda.' : 'Medio guardado en la Bóveda.');
      }
    } finally {
      setStockImportingId(null);
    }
  };

  const seleccionarProyectoDesdeChat = async (projectId: string) => {
    try {
      const currentSession = session || await getFirebaseSession();
      if (!currentSession) throw new Error('Debes iniciar sesión para cambiar de proyecto.');
      await cargarProyectoActivo(projectId, currentSession);
      setProjectMenuOpen(false);
    } catch (error: any) {
      showAlert(error?.message || 'No se pudo abrir el proyecto.');
    }
  };

  const seleccionarChatDesdeHistorial = async (threadId: string) => {
    if (!threadId || threadId === activeThreadId) {
      setProjectMenuOpen(false);
      return;
    }

    try {
      const currentSession = session || await getFirebaseSession();
      if (!currentSession) throw new Error('Debes iniciar sesión para abrir el chat.');

      setActiveThreadId(threadId);
      setChatAttachmentIds([]);
      setVideoResultadoUrl(null);
      setVideoResultadoNombre(null);
      setVideoResultadoEtiqueta(null);
      setIsPlaying(false);
      await cargarMensajesDelChat(currentSession, threadId);
      setProjectMenuOpen(false);
    } catch (error: any) {
      showAlert(error?.message || 'No se pudo abrir el chat.');
    }
  };

  const renombrarChat = async (threadId: string, title: string) => {
    const cleanTitle = title.trim();
    if (!threadId || !cleanTitle) return;

    try {
      const currentSession = session || await getFirebaseSession();
      if (!currentSession) throw new Error('Debes iniciar sesión para renombrar el chat.');

      const response = await fetch('/api/chat/threads', {
        method: 'PATCH',
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: threadId, title: cleanTitle }),
      });
      const payload = await response.json().catch(() => ({})) as { thread?: any; error?: string };
      if (!response.ok || !payload.thread) {
        throw new Error(payload.error || 'No se pudo cambiar el nombre del chat.');
      }

      setChatThreads((prev) =>
        prev.map((thread) => thread.id === threadId ? payload.thread : thread)
      );
    } catch (error: any) {
      showAlert(error?.message || 'No se pudo cambiar el nombre del chat.');
    }
  };

  const renombrarProyecto = async (projectId: string, name: string) => {
    const cleanName = name.trim();
    if (!projectId || !cleanName) return;

    try {
      const currentSession = session || await getFirebaseSession();
      if (!currentSession) throw new Error('Debes iniciar sesión para renombrar el proyecto.');

      const response = await fetch('/api/projects', {
        method: 'PATCH',
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: projectId, name: cleanName }),
      });
      const payload = await response.json().catch(() => ({})) as { project?: NaylaProject; error?: string };
      if (!response.ok || !payload.project) {
        throw new Error(payload.error || 'No se pudo cambiar el nombre del proyecto.');
      }

      setProjects((prev) =>
        prev.map((project) => project.id === projectId ? payload.project! : project)
      );
    } catch (error: any) {
      showAlert(error?.message || 'No se pudo cambiar el nombre del proyecto.');
    }
  };

  const crearNuevoChat = async () => {
    if (!activeProjectId) return showAlert('Primero selecciona un proyecto.');

    try {
      const currentSession = session || await getFirebaseSession();
      if (!currentSession) throw new Error('Debes iniciar sesión para crear un chat.');

      const response = await fetch('/api/chat/threads', {
        method: 'POST',
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          projectId: activeProjectId,
          title: `Chat ${chatThreads.length + 1}`,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { thread?: any; error?: string };
      if (!response.ok || !payload.thread) {
        throw new Error(payload.error || 'No se pudo crear el nuevo chat.');
      }

      setChatThreads((prev) => [payload.thread, ...prev]);
      setActiveThreadId(payload.thread.id);
      setChatMessages([]);
      setChatAttachmentIds([]);
      setVideoResultadoUrl(null);
      setVideoResultadoNombre(null);
      setVideoResultadoEtiqueta(null);
      setIsPlaying(false);
      setProjectMenuOpen(false);
    } catch (error: any) {
      showAlert(error?.message || 'No se pudo crear el chat.');
    }
  };

  const crearNuevoProyecto = () => {
    setNewProjectName('Nuevo proyecto');
    setProjectDialog({ type: 'new' });
    setProjectMenuOpen(false);
  };

  const confirmarNuevoProyecto = async () => {
    const name = newProjectName.trim() || 'Nuevo proyecto';
    setProjectDialogBusy(true);

    try {
      const currentSession = session || await getFirebaseSession();
      if (!currentSession) throw new Error('Debes iniciar sesión para crear un proyecto.');

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name }),
      });
      const payload = await response.json().catch(() => ({})) as { project?: NaylaProject; error?: string };
      if (!response.ok || !payload.project) {
        throw new Error(payload.error || 'No se pudo crear el proyecto.');
      }

      setProjects((prev) => [payload.project!, ...prev.filter((project) => project.id !== payload.project!.id)]);
      await cargarProyectoActivo(payload.project.id, currentSession);
      setProjectDialog(null);
    } catch (error: any) {
      showAlert(error?.message || 'No se pudo crear el proyecto.');
    } finally {
      setProjectDialogBusy(false);
    }
  };

  const eliminarProyectoActivo = () => {
    if (!activeProject) return;
    setProjectDialog({
      type: 'delete',
      projectId: activeProject.id,
      projectName: activeProject.name,
    });
    setProjectMenuOpen(false);
  };

  const confirmarEliminarProyectoActivo = async () => {
    if (!projectDialog || projectDialog.type !== 'delete') return;
    const target = projectDialog;
    setProjectDialogBusy(true);

    try {
      const currentSession = session || await getFirebaseSession();
      if (!currentSession) throw new Error('Debes iniciar sesión para eliminar un proyecto.');

      const response = await fetch('/api/projects', {
        method: 'DELETE',
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: target.projectId }),
      });
      const payload = await response.json().catch(() => ({})) as {
        deleted?: { name?: string; r2DeleteFailures?: number };
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || 'No se pudo eliminar el proyecto.');

      setProjectDialog(null);
      setChatMessages([]);
      setChatAttachmentIds([]);
      await cargarDatosUsuario(currentSession.user.id);

      if (payload.deleted?.r2DeleteFailures) {
        showAlert('El proyecto fue eliminado, pero algunos archivos necesitarán limpieza posterior.');
      }
    } catch (error: any) {
      showAlert(error?.message || 'No se pudo eliminar el proyecto.');
    } finally {
      setProjectDialogBusy(false);
    }
  };

  const toggleChatAttachment = (asset: NaylaChannelAsset) => {
    const alreadyAttached = chatAttachmentIds.includes(asset.id);

    if (!alreadyAttached && (asset.tipo === 'foto' || asset.tipo === 'video' || asset.tipo === 'audio')) {
      const media = galeriaMultimedia.find((item) => item.id === asset.id);
      if (media) void agregarAlTimeline(media, { preventDuplicate: true });
    }

    setChatAttachmentIds((prev) => {
      if (prev.includes(asset.id)) {
        return prev.filter((id) => id !== asset.id);
      }
      if (prev.length >= CHAT_ATTACHMENT_LIMIT) {
        showAlert(`Puedes adjuntar hasta ${CHAT_ATTACHMENT_LIMIT} archivos en un mismo mensaje.`);
        return prev;
      }
      return [...prev, asset.id];
    });
  };

  const uploadFilesIntoChat = async (
    incomingFiles: File[] | FileList,
    forcedKind?: NaylaChannelKind
  ) => {
    if (!activeProjectId) return showAlert('Primero selecciona un proyecto.');

    const currentSession = session || await getFirebaseSession();
    if (!currentSession) return showAlert('Debes iniciar sesión para subir archivos.');
    if (!activeThreadId) return showAlert('Abre un chat antes de subir archivos.');

    const remainingSlots = Math.max(0, CHAT_ATTACHMENT_LIMIT - chatAttachmentIds.length);
    if (!remainingSlots) {
      return showAlert(`Ya tienes ${CHAT_ATTACHMENT_LIMIT} archivos anclados a este mensaje.`);
    }

    const selectedFiles = Array.from(incomingFiles).slice(0, remainingSlots);
    if (selectedFiles.length < Array.from(incomingFiles).length) {
      showAlert(`Se tomarán los primeros ${remainingSlots} archivos. El máximo por mensaje es ${CHAT_ATTACHMENT_LIMIT}.`);
    }

    if (!selectedFiles.length) return;

    setChatAttachMenuOpen(false);
    setProjectMenuOpen(false);
    if (forcedKind) setChannelUploadingKind(forcedKind);
    setChatUploadProgress({
      total: selectedFiles.length,
      done: 0,
      failed: 0,
      percent: 0,
      phase: 'uploading',
    });

    let workingMedia = [...galeriaMultimedia];
    let workingDocuments = [...chatDocuments];
    let workingModels = [...modelos3d];
    let successCount = 0;
    let failedCount = 0;
    let timelineChanged = false;
    const totalUploadBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    let completedUploadBytes = 0;

    for (const file of selectedFiles) {
      setChatUploadProgress((progress) => progress ? { ...progress, currentFile: file.name } : progress);

      const updateCurrentFileProgress = (progress: UploadProgressSnapshot) => {
        const loaded = completedUploadBytes + Math.min(file.size, progress.loadedBytes);
        const percent = totalUploadBytes > 0
          ? Math.min(99, Math.floor((loaded / totalUploadBytes) * 100))
          : 0;
        setChatUploadProgress((current) => current
          ? {
              ...current,
              percent,
              currentFile: file.name,
              phase: progress.phase === 'registering' ? 'registering' : 'uploading',
            }
          : current
        );
      };

      try {
        let asset: NaylaChannelAsset | null = null;
        let kind = forcedKind;

        if (!kind) {
          const mediaKind = resolveMediaKind(file);
          kind = mediaKind || (isSupportedDocumentFile(file) ? 'documento' : undefined);
        }

        if (!kind) {
          throw new Error(`Tipo de archivo no soportado: ${file.name}`);
        }

        if (kind === 'modelo3d') {
          const saved = await uploadModel3DToBoveda({
            session: currentSession,
            file,
            existingItems: workingModels,
            fuente: 'chat:canal-3d',
            projectId: activeProjectId,
            threadId: activeThreadId,
          });
          workingModels = [...workingModels, saved];
          setModelos3d((prev) => prev.some((item) => item.id === saved.id) ? prev : [...prev, saved]);
          setModelo3dActivoId((current) => current || saved.id);
          asset = {
            id: saved.id,
            tipo: 'modelo3d',
            nombre: saved.nombre,
            url: saved.url,
            etiqueta: saved.etiqueta,
          };
        } else if (kind === 'documento') {
          const savedItems = await uploadDocumentFilesToBodega({
            session: currentSession,
            files: [file],
            existingItems: workingDocuments,
            fuente: 'chat:documento',
            projectId: activeProjectId,
            threadId: activeThreadId,
            onProgress: updateCurrentFileProgress,
          });
          const saved = savedItems[0];
          if (!saved) throw new Error(`No se pudo guardar ${file.name}.`);
          workingDocuments = [...workingDocuments, saved];
          setChatDocuments((prev) => prev.some((item) => item.id === saved.id) ? prev : [...prev, saved]);
          asset = {
            id: saved.id,
            tipo: 'documento',
            nombre: saved.nombre,
            url: saved.url,
            etiqueta: saved.etiqueta,
          };
        } else {
          const savedItems = await uploadMediaFilesToBodega({
            session: currentSession,
            files: [file],
            existingItems: workingMedia,
            forcedTipo: kind,
            fuente: `chat:canal-${kind}`,
            projectId: activeProjectId,
            threadId: activeThreadId,
            onProgress: updateCurrentFileProgress,
          });
          const saved = savedItems[0];
          if (!saved) throw new Error(`No se pudo guardar ${file.name}.`);
          workingMedia = [...workingMedia, saved];
          setGaleriaMultimedia((prev) => prev.some((item) => item.id === saved.id) ? prev : [...prev, saved]);
          await agregarAlTimeline(saved, {
            preventDuplicate: true,
            useExistingMetadata: true,
            deferSync: true,
          });
          timelineChanged = true;
          asset = {
            id: saved.id,
            tipo: saved.tipo as NaylaChannelKind,
            nombre: saved.nombre,
            url: saved.url,
            etiqueta: saved.etiqueta,
          };
        }

        if (asset) {
          successCount += 1;
          setChatAttachmentIds((prev) =>
            prev.includes(asset!.id)
              ? prev
              : prev.length < CHAT_ATTACHMENT_LIMIT
                ? [...prev, asset!.id]
                : prev
          );
        }
      } catch (error: any) {
        failedCount += 1;
        console.error('Error subiendo archivo al chat:', file.name, error);
      } finally {
        completedUploadBytes += file.size;
        const overallPercent = totalUploadBytes > 0
          ? Math.min(100, Math.floor((completedUploadBytes / totalUploadBytes) * 100))
          : 100;
        setChatUploadProgress((progress) => progress
          ? {
              ...progress,
              done: Math.min(progress.total, progress.done + 1),
              failed: failedCount,
              percent: overallPercent,
              currentFile: file.name,
            }
          : progress
        );
      }
    }

    if (timelineChanged) {
      setChatUploadProgress((current) => current
        ? { ...current, phase: 'finalizing', percent: Math.max(99, current.percent) }
        : current
      );
      await sincronizarLineaDeTiempo(lineaDeTiempoRef.current);
    }

    setChannelUploadingKind(null);
    setChatUploadProgress(null);

    if (successCount) {
      requestAnimationFrame(() => chatInputRef.current?.focus());
    }

    if (failedCount) {
      showAlert(
        successCount
          ? `${successCount} archivo${successCount === 1 ? '' : 's'} listo${successCount === 1 ? '' : 's'}; ${failedCount} no se pudo${failedCount === 1 ? '' : 'ieron'} subir.`
          : 'No se pudo subir ninguno de los archivos seleccionados.'
      );
    }
  };
  const subirArchivosDesdeCanal = async (kind: NaylaChannelKind, files: FileList) => {
    await uploadFilesIntoChat(files, kind);
  };

  const ejecutarRemoveVideoBackground = async (
    actionData: any,
    scope: { projectId: string; threadId: string }
  ) => {
    const currentSession = session || await getFirebaseSession();
    if (!currentSession) throw new Error('Debes iniciar sesión para quitar el fondo.');

    const label = String(actionData?.label || '').trim().toUpperCase();
    const source = galeriaMultimedia.find(
      (item) => item.tipo === 'video' && item.etiqueta?.trim().toUpperCase() === label
    );
    if (!source) {
      throw new Error(`No encontré el video ${label || 'solicitado'} en la Bóveda de este proyecto.`);
    }

    const sourceUrl = typeof actionData?.url === 'string' && actionData.url
      ? actionData.url
      : source.url;
    const model = actionData?.model === 'ben2-base' ? 'ben2-base' : 'modnet';
    const quality = ['medium', 'high', 'very-high'].includes(actionData?.quality)
      ? actionData.quality
      : 'high';
    const keepAudio = actionData?.keepAudio !== false;

    setToolMessage('PREPARANDO SEPARACIÓN DE FONDO…');

    const {
      canUseVideoMatting,
      separateVideoLayers,
    } = await import('@remotion/video-matting');

    const support = await canUseVideoMatting({ model });
    if (!support.supported) {
      throw new Error(
        model === 'ben2-base'
          ? 'Este dispositivo no tiene el soporte WebGPU avanzado necesario para el recorte general. Prueba el modo ligero para personas.'
          : 'Este dispositivo o navegador no tiene WebGPU disponible para quitar el fondo localmente.'
      );
    }

    let lastShownProgress = -10;
    let result: any = null;

    try {
      result = await separateVideoLayers({
        src: sourceUrl,
        model,
        audio: keepAudio ? 'foreground' : 'none',
        videoBitrate: quality,
        onProgress: (progress: any) => {
          if (progress?.stage === 'finalizing') {
            setToolMessage('FINALIZANDO VIDEO TRANSPARENTE…');
            return;
          }
          const value = Number(progress?.progress);
          if (!Number.isFinite(value)) return;
          const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
          if (percent >= lastShownProgress + 5 || percent === 100) {
            lastShownProgress = percent;
            setToolMessage(`QUITANDO FONDO… ${percent}%`);
          }
        },
      });

      const foregroundBlob = await result.foreground.getBlob();
      const baseName = String(source.nombre || label || 'video')
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80) || 'video';

      const transparentFile = new File(
        [foregroundBlob],
        `${baseName}_sin_fondo.webm`,
        { type: foregroundBlob.type || 'video/webm' }
      );

      setToolMessage('GUARDANDO RESULTADO EN LA BÓVEDA…');
      const saved = await uploadMediaFilesToBodega({
        session: currentSession,
        files: [transparentFile],
        existingItems: galeriaMultimedia,
        forcedTipo: 'video',
        fuente: 'background-removal',
        metadataExtra: {
          backgroundRemoved: true,
          backgroundRemovalModel: model,
          sourceMediaId: source.id,
          sourceLabel: source.etiqueta,
        },
        projectId: scope.projectId,
        threadId: scope.threadId,
      });

      const output = saved[0];
      if (!output) throw new Error('Nayla terminó el recorte pero no pudo guardar el resultado.');

      setGaleriaMultimedia((prev) => {
        const ids = new Set(prev.map((item) => item.id));
        return [...prev, ...saved.filter((item) => !ids.has(item.id))];
      });
      setMediaActivaUrl(output.url);
      setClipSeleccionado(output.id);
      setMainNav('boveda');
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text: `Listo. Quité el fondo de ${label} y guardé el resultado transparente como ${output.etiqueta} en la Bóveda.`,
        },
      ]);

      return output;
    } finally {
      setToolMessage(null);
      if (result) {
        await Promise.allSettled([
          result.base?.dispose?.(),
          result.foreground?.dispose?.(),
        ]);
      }
    }
  };

  const ejecutarAutoCaptions = async (
    actionData: any,
    scope: { projectId: string; threadId: string }
  ) => {
    const currentSession = session || await getFirebaseSession();
    if (!currentSession) throw new Error('Debes iniciar sesión para crear subtítulos automáticos.');

    const label = String(actionData?.label || '').trim().toUpperCase();
    const source = galeriaMultimedia.find(
      (item) =>
        (item.tipo === 'video' || item.tipo === 'audio') &&
        item.etiqueta?.trim().toUpperCase() === label
    );
    if (!source) {
      throw new Error(`No encontré ${label || 'el medio solicitado'} en la Bóveda de este proyecto.`);
    }

    const sourceUrl = typeof actionData?.url === 'string' && actionData.url
      ? actionData.url
      : source.url;
    const model = actionData?.model === 'tiny' ? 'tiny' : 'base';
    const language = String(actionData?.language || 'es').trim().toLowerCase() || 'es';
    const style = ['clean', 'cinematic', 'tiktok', 'karaoke'].includes(actionData?.style)
      ? actionData.style
      : 'clean';
    const position = ['top', 'center', 'bottom'].includes(actionData?.position)
      ? actionData.position
      : 'bottom';
    const fontSize = Number.isFinite(Number(actionData?.fontSize))
      ? Math.max(20, Math.min(120, Number(actionData.fontSize)))
      : undefined;

    setToolMessage('COMPROBANDO MOTOR DE TRANSCRIPCIÓN…');

    const {
      canUseWhisperWebGpu,
      resampleTo16Khz,
      transcribe,
    } = await import('@remotion/whisper-webgpu');

    const support = await canUseWhisperWebGpu();
    if (!support.supported) {
      throw new Error('Este dispositivo o navegador no tiene WebGPU disponible para transcribir localmente.');
    }

    setToolMessage(`CARGANDO ${label}…`);
    const mediaResponse = await fetch(sourceUrl);
    if (!mediaResponse.ok) {
      throw new Error(`No pude abrir ${label} para transcribirlo.`);
    }
    const mediaBlob = await mediaResponse.blob();

    const channelWaveform = await resampleTo16Khz({
      file: mediaBlob,
      onProgress: (progress: number) => {
        const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
        setToolMessage(`PREPARANDO AUDIO… ${percent}%`);
      },
    });

    setToolMessage('PREPARANDO MODELO DE VOZ…');
    const transcription = await transcribe({
      channelWaveform,
      model,
      language,
      onModelLoadProgress: (progress: any) => {
        const value = Number(progress?.progress);
        if (!Number.isFinite(value)) return;
        const percent = Math.max(0, Math.min(100, Math.round(value * 100)));
        setToolMessage(percent >= 100 ? 'TRANSCRIBIENDO…' : `CARGANDO MODELO… ${percent}%`);
      },
    });

    setToolMessage('CREANDO SUBTÍTULOS…');
    const segments = groupSpeechWordsIntoCaptions(transcription.words, {
      maxWords: style === 'karaoke' || style === 'tiktok' ? 5 : 7,
      maxDurationInSeconds: style === 'karaoke' || style === 'tiktok' ? 2.2 : 3,
      maxCharacters: style === 'karaoke' || style === 'tiktok' ? 38 : 52,
    });

    if (!segments.length) {
      throw new Error(`No encontré voz transcribible en ${label}.`);
    }

    const nextSubtitles: SubtitleItem[] = segments.map((segment, index) => ({
      id: `auto-${label.toLowerCase()}-${index}-${Math.round(segment.start * 1000)}`,
      texto: segment.text,
      inicioSec: segment.start,
      finSec: segment.end,
      style,
      position,
      fontSize,
      generated: true,
      sourceLabel: label,
    }));

    setSubtitulos((prev) => [
      ...prev.filter((subtitle) => !(subtitle.generated && subtitle.sourceLabel === label)),
      ...nextSubtitles,
    ].sort((a, b) => a.inicioSec - b.inicioSec));

    setChatMessages((prev) => [
      ...prev,
      {
        role: 'ai',
        text: `Listo. Transcribí ${label} y agregué ${nextSubtitles.length} bloque${nextSubtitles.length === 1 ? '' : 's'} de subtítulos sincronizados al timeline.`,
      },
    ]);
    setToolMessage(null);

    return {
      label,
      language,
      model,
      transcript: transcription.text,
      subtitles: nextSubtitles.length,
      projectId: scope.projectId,
      threadId: scope.threadId,
    };
  };

  const [editorPlanBusy, setEditorPlanBusy] = useState(false);
  const editorPlanBusyRef = useRef(false);
  const decideEditorPlan = async (planId: string, decision: 'accept' | 'cancel') => {
    if (editorPlanBusyRef.current || chatProcessing) return;
    editorPlanBusyRef.current = true;
    setEditorPlanBusy(true);
    const projectId = activeProjectId;
    const threadId = activeThreadId;
    try {
      const currentSession = session || await getFirebaseSession();
      if (!currentSession || !projectId || !threadId) throw new Error('Abre el proyecto y el chat del plan.');
      const response = await fetch('/api/chat/editor-plan', { method: 'POST', headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }), body: JSON.stringify({ projectId, threadId, planId, decision }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo aceptar el plan.');
      if (activeThreadIdRef.current === threadId) setChatMessages(prev => prev.map(msg => msg.editorReview?.id === planId ? { ...msg, editorReview: { ...msg.editorReview, status: data.status } } : msg));
      if (decision === 'accept') await ejecutarBuildTimeline(data, { projectId, threadId });
    } catch (error: any) {
      if (activeThreadIdRef.current === threadId) setChatMessages(prev => [...prev, { role: 'ai', text: error.message || 'No se pudo completar el plan.' }]);
    } finally {
      editorPlanBusyRef.current = false;
      setEditorPlanBusy(false);
    }
  };

  const sendNaylaMessage = async (
    messageOverride?: string,
    options?: { directMode?: boolean; bypassDirectConfirm?: boolean }
  ) => {
    const message = (messageOverride ?? chatInput).trim();
    if (!message || chatUploadProgress) return;

    const looksDirect = /^\s*@direct\b/i.test(message);
    if (looksDirect && !options?.bypassDirectConfirm) {
      setDirectConfirm({ message });
      return;
    }

    const outgoingAttachments = [...chatAttachedAssets];
    const newMessages: NaylaChatMessage[] = [
      ...chatMessages,
      {
        role: 'user',
        text: message,
        attachments: outgoingAttachments.length ? outgoingAttachments : undefined,
      },
    ];
    chatAutoFollowRef.current = true;
    setChatMessages(newMessages);
    if (!messageOverride) {
      setChatInput('');
      resetChatComposerHeight();
    }
    setChatProcessing(true);
    setNaylaCodeTrace({
      active: true,
      stage: options?.directMode ? 'direct' : 'sending',
      label: options?.directMode ? 'Validando indicaciones directas…' : 'Enviando el pedido…',
      request: message,
      history: [{
        stage: options?.directMode ? 'direct' : 'sending',
        label: options?.directMode ? 'Directo' : 'Enviando',
      }],
    });
    window.requestAnimationFrame(() => scrollChatToBottom('smooth'));

    try {
      const currentSession = session || await getFirebaseSession();
      if (!currentSession) throw new Error('Debes iniciar sesión para hablar con Nayla.');
      if (!activeProjectId) throw new Error('Selecciona un proyecto antes de escribir a Nayla.');
      if (!activeThreadId) throw new Error('Crea o selecciona un chat antes de escribir a Nayla.');
      const messageProjectId = activeProjectId;
      const messageThreadId = activeThreadId;
      const attachmentIdsForMessage = [...chatAttachmentIds];

      const res = await fetch('/api/chat', {
        method: 'POST',
        signal: AbortSignal.timeout(240_000),
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
           message,
           projectId: messageProjectId,
           threadId: messageThreadId,
           attachmentIds: attachmentIdsForMessage,
           history: chatMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
           provider: selectedAiProvider,
           engineMode: naylaEngineMode,
           streamProgress: true,
           directMode: Boolean(options?.directMode),
           mediaLibrary: [
             ...galeriaMultimedia.map(item => ({
               id: item.id,
               tipo: item.tipo,
               url: item.url,
               nombre: item.nombre,
               etiqueta: item.etiqueta,
               fuente: item.fuente,
               metadata: item.metadata
             })),
             ...chatDocuments.map(item => ({
               id: item.id,
               tipo: 'documento',
               url: item.url,
               nombre: item.nombre,
               etiqueta: item.etiqueta,
               fuente: item.fuente,
               metadata: item.metadata
             })),
             ...modelos3d.map(item => ({
               id: item.id,
               tipo: 'modelo3d',
               url: item.url,
               nombre: item.nombre,
               etiqueta: item.etiqueta,
               fuente: item.fuente,
               metadata: item.metadata
             }))
           ],
           currentEditorState: { subtitles: subtitulos, titles: motionTitles, threeScenes: threeRenderScenes, vectorAnimations, skiaGraphics, logos, settings: globalSettings, canvasRatio, exportQuality: calidadExportacion },
           currentTimeline: lineaDeTiempo.map(item => ({
             ...item,
             id: item.id,
             tipo: item.tipo,
             url: item.url,
             nombre: item.nombre,
             etiqueta: item.etiqueta
           }))
        })
      });

      let data: any = {};
      let finalStatus = res.status;
      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('application/x-ndjson') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const applyProgress = (event: any) => {
          if (event?.type !== 'progress') return;
          setNaylaCodeTrace((current) => {
            const nextHistory = [...(current?.history || [])];
            const stage = String(event.stage || 'working');
            const label = String(event.label || 'Nayla está trabajando…');
            if (!nextHistory.length || nextHistory[nextHistory.length - 1]?.stage !== stage) {
              nextHistory.push({ stage, label });
            }
            return {
              ...(current || {}),
              active: stage !== 'ready' && stage !== 'failed',
              stage,
              label,
              request: String(event.request || current?.request || message),
              blueprint: typeof event.blueprint === 'string' ? event.blueprint : current?.blueprint,
              payload: event.payload ?? current?.payload,
              failedPayload: typeof event.failedPayload === 'string' ? event.failedPayload : current?.failedPayload,
              validationIssues: Array.isArray(event.validationIssues) ? event.validationIssues.map(String) : current?.validationIssues,
              chapters: Array.isArray(event.chapters) ? event.chapters.map(String) : current?.chapters,
              history: nextHistory,
            };
          });
        };

        while (true) {
          const { value, done } = await reader.read();
          buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line);
            if (event?.type === 'progress') {
              applyProgress(event);
            } else if (event?.type === 'result') {
              finalStatus = Number(event.status || 200);
              data = event.data || {};
            }
          }

          if (done) break;
        }

        if (buffer.trim()) {
          const event = JSON.parse(buffer);
          if (event?.type === 'progress') {
            applyProgress(event);
          } else if (event?.type === 'result') {
            finalStatus = Number(event.status || 200);
            data = event.data || {};
          }
        }
      } else {
        const raw = await res.text();
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error(`El servidor devolvió una respuesta inválida (HTTP ${res.status}).`);
        }
      }

      if (data?.debug) {
        setNaylaCodeTrace((current) => ({
          ...(current || {}),
          active: false,
          stage: data.debug.stage || current?.stage || (data.error ? 'failed' : 'ready'),
          label: data.error ? 'La tarea se detuvo.' : (current?.label || 'Código listo.'),
          request: data.debug.request || current?.request || message,
          blueprint: data.debug.blueprint || current?.blueprint,
          payload: data.debug.payload ?? current?.payload,
          failedPayload: data.debug.failedPayload || current?.failedPayload,
          validationIssues: Array.isArray(data.debug.validationIssues)
            ? data.debug.validationIssues.map(String)
            : current?.validationIssues,
        }));
      }

      if (finalStatus >= 400 || data.error) {
        throw new Error(data.error || 'Error en la respuesta del servidor');
      }

      const aiText = data.action === 'BUILD_TIMELINE'
        ? (data.render === true ? 'Estoy preparando tu video.' : 'Edición preparada en el timeline.')
        : (data.text || 'Acción preparada.');

      const isGpuAction = data.action === 'RUN_GPU_JOB';
      const actionPlan = (data.status === 'planned' || data.status === 'awaiting_confirmation' || data.gpuJobId || data.mediaJobId)
        ? {
            action: data.action,
            status: data.status,
            engine: data.engine === 'nayla-compute' || isGpuAction ? 'nayla-compute' : 'nayla-cloud',
            gpuJobId: data.gpuJobId,
            mediaJobId: data.mediaJobId,
            gpuName: data.job?.gpuName ?? data.quote?.gpuName ?? null,
            hourlyPrice: data.job?.hourlyPrice ?? data.quote?.hourlyPrice ?? null,
            estimatedMaxCost: data.job?.estimatedMaxCost ?? data.quote?.estimatedMaxCost ?? null,
            runtimeCostEstimate: data.job?.runtimeCostEstimate ?? null,
          }
        : undefined;

      if (
        data.status === 'awaiting_confirmation' &&
        data.quote &&
        data.pendingGpuRequest
      ) {
        const isMusic = data.pendingGpuRequest.recipe === 'ace-step-music';
        setGpuQuoteSource(null);
        setGpuQuoteRequest(data.pendingGpuRequest);
        setGpuQuoteUi({
          title: isMusic ? 'Música · Nayla Compute' : 'Nayla Compute',
          description: isMusic
            ? 'Generación musical bajo demanda; el resultado se guardará en la Bóveda privada.'
            : 'Proceso GPU bajo demanda de Nayla Compute.',
          confirmLabel: isMusic ? 'CONFIRMAR Y GENERAR MÚSICA' : 'CONFIRMAR GPU',
          fromChat: true,
          userText: message,
        });
        setGpuQuote(data.quote);
      }

      setChatMessages(prev => [...prev.map(msg => data.editorReview && msg.editorReview?.status === 'pending' ? { ...msg, editorReview: { ...msg.editorReview, status: 'cancelled' as const } } : msg), {
        role: 'ai',
        text: aiText,
        cards: data.action === 'SEARCH_MEDIA' && Array.isArray(data.results) ? data.results : undefined,
        actionPlan,
        editorReview: data.editorReview,
        renderTask: data.action === 'BUILD_TIMELINE' && data.render === true
          ? {
              status: 'preparing',
              phase: 'Preparando edición',
              progress: 0,
            }
          : undefined,
      }]);

      setChatAttachmentIds([]);

      if (data.action === 'BUILD_TIMELINE') {
        const executionScope = {
          projectId: messageProjectId,
          threadId: messageThreadId,
        };

        if (data.render === true) {
          void ejecutarBuildTimeline(data, executionScope).catch((error: any) => {
            console.error(error);
            if (
              !error?.naylaRenderHandled &&
              activeThreadIdRef.current === messageThreadId
            ) {
              setChatMessages(prev => [
                ...prev,
                { role: 'ai', text: error?.message || 'No se pudo completar el render.' },
              ]);
            }
          });
        } else {
          await ejecutarBuildTimeline(data, executionScope);
        }
      } else if (data.action === 'REMOVE_VIDEO_BACKGROUND') {
        await ejecutarRemoveVideoBackground(data, {
          projectId: messageProjectId,
          threadId: messageThreadId,
        });
      } else if (data.action === 'CREATE_AUTO_CAPTIONS') {
        try {
          await ejecutarAutoCaptions(data, {
            projectId: messageProjectId,
            threadId: messageThreadId,
          });
        } finally {
          setToolMessage(null);
        }
      }
    } catch (error: any) {
      console.error(error);
      setNaylaCodeTrace((current) => ({
        ...(current || {}),
        active: false,
        stage: current?.stage === 'ready' ? 'ready' : (current?.stage || 'failed'),
        label: current?.stage && current.stage !== 'sending'
          ? (current.label || 'La tarea se detuvo.')
          : 'La tarea se detuvo.',
      }));
      if (!error?.naylaRenderHandled) {
        setChatMessages(prev => [...prev, { role: 'ai', text: error?.name === 'TimeoutError' ? 'Nayla tardó demasiado en responder. Revisa el chat antes de reintentar para evitar repetir una tarea.' : error.message || 'No se pudo completar la solicitud.' }]);
      }
    } finally {
      setChatProcessing(false);
    }
  };

  const handleSubir3D = async (files: FileList) => {
    const currentSession = session || await getFirebaseSession();
    if (!currentSession) return showAlert('Debes iniciar sesión para subir modelos 3D.');

    setSubiendo3d(true);
    try {
      const nextAssets = [...modelos3d];
      let firstNew: Model3DAsset | null = null;

      for (const file of Array.from(files)) {
        const saved = await uploadModel3DToBoveda({
          session: currentSession,
          file,
          existingItems: nextAssets,
          fuente: 'manual-3d',
          projectId: activeProjectId || undefined,
          threadId: activeThreadId || undefined,
        });
        nextAssets.push(saved);
        if (!firstNew) firstNew = saved;
      }

      setModelos3d(nextAssets);
      if (firstNew) setModelo3dActivoId(firstNew.id);
      setMainNav('3d');
      showAlert(`Modelo${files.length > 1 ? 's' : ''} 3D guardado${files.length > 1 ? 's' : ''} en la Bóveda 3D.`);
    } catch (error: any) {
      console.error('Error subiendo modelo 3D:', error);
      showAlert(error?.message || 'No se pudo guardar el modelo 3D.');
    } finally {
      setSubiendo3d(false);
    }
  };

  const handleEliminar3D = async (asset: Model3DAsset) => {
    const currentSession = session || await getFirebaseSession();
    if (!currentSession) return showAlert('Debes iniciar sesión para eliminar modelos 3D.');

    try {
      await deleteModel3DFromBoveda({ session: currentSession, item: asset });
      const next = modelos3d.filter((item) => item.id !== asset.id);
      setModelos3d(next);
      if (modelo3dActivoId === asset.id) setModelo3dActivoId(next[0]?.id || null);
      showAlert('Modelo 3D eliminado de la Bóveda.');
    } catch (error: any) {
      console.error('Error eliminando modelo 3D:', error);
      showAlert(error?.message || 'No se pudo eliminar el modelo 3D.');
    }
  };

  const getImageTo3DSource = () => {
    const selectedPhoto = galeriaMultimedia.find(
      (item) => item.tipo === 'foto' && selectedMediaIds.includes(item.id)
    );
    if (selectedPhoto) return selectedPhoto;

    const clipPhoto = galeriaMultimedia.find(
      (item) => item.id === clipSeleccionado && item.tipo === 'foto'
    );
    if (clipPhoto) return clipPhoto;

    if (visualActivo?.tipo === 'foto') {
      const activePhoto = galeriaMultimedia.find(
        (item) => item.tipo === 'foto' && item.url === visualActivo.url
      );
      if (activePhoto) return activePhoto;
    }

    return [...galeriaMultimedia].reverse().find((item) => item.tipo === 'foto') || null;
  };

  const quoteImageTo3D = async () => {
    const selectedPhoto = getImageTo3DSource();
    if (!selectedPhoto) {
      showAlert('Necesito una imagen en la Bóveda para crear el modelo 3D.');
      return;
    }

    const currentSession = session || await getFirebaseSession();
    if (!currentSession) {
      showAlert('Debes iniciar sesión para cotizar una GPU.');
      return;
    }

    setGpuQuoteLoading(true);
    setToolMessage('COTIZANDO GPU…');
    try {
      const response = await fetch('/api/gpu/quote', {
        method: 'POST',
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          workload: '3d',
          recipe: 'triposr-image-to-3d',
          inputUrls: [selectedPhoto.url],
        }),
      });

      const raw = await response.text();
      let payload: any = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error('Nayla Compute devolvió una cotización inválida.');
      }

      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'No se pudo cotizar la GPU.');
      }

      setGpuQuoteSource(selectedPhoto);
      setGpuQuoteRequest({
        projectId: activeProjectId || undefined,
        threadId: activeThreadId || undefined,
        workload: '3d',
        recipe: 'triposr-image-to-3d',
        inputUrls: [selectedPhoto.url],
      });
      setGpuQuoteUi({
        title: 'Imagen → 3D',
        description: 'Conversión 3D bajo demanda con Nayla Compute.',
        confirmLabel: 'CONFIRMAR Y CREAR 3D',
        fromChat: false,
        userText: 'Crear 3D desde ' + (selectedPhoto.nombre || 'la imagen seleccionada') + ' con Nayla Compute.',
      });
      setGpuQuote(payload.quote || null);
    } catch (error: any) {
      console.error('Error cotizando GPU 3D:', error);
      showAlert(error?.message || 'No se pudo cotizar la GPU.');
    } finally {
      setGpuQuoteLoading(false);
      setToolMessage(null);
    }
  };

  const confirmGpuQuote = async (computeSelectionId: string) => {
    if (!gpuQuoteRequest || !computeSelectionId) return;

    const currentSession = session || await getFirebaseSession();
    if (!currentSession) {
      showAlert('Debes iniciar sesión para usar la GPU.');
      return;
    }

    setGpuQuoteConfirming(true);
    try {
      // Re-cotizamos la MISMA tarjeta justo antes de reservar. El token de
      // selección también incluye el precio, así que una oferta modificada no
      // puede sustituirse silenciosamente por otra.
      const verifyResponse = await fetch('/api/gpu/quote', {
        method: 'POST',
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...gpuQuoteRequest,
          computeSelectionId,
        }),
      });
      const verifyPayload = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok || verifyPayload.error) {
        throw new Error(verifyPayload.error || 'No se pudo verificar la GPU seleccionada.');
      }

      const verifiedQuote = verifyPayload.quote as GpuQuoteView | null;
      if (!verifiedQuote?.available) {
        setGpuQuote(verifiedQuote || null);
        return;
      }
      setGpuQuote(verifiedQuote);

      const response = await fetch('/api/gpu/jobs', {
        method: 'POST',
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          ...gpuQuoteRequest,
          computeSelectionId,
        }),
      });

      const raw = await response.text();
      let payload: any = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error('La respuesta de la GPU no es válida.');
      }

      if (!response.ok || payload.error) {
        throw new Error(payload.error || 'No se pudo iniciar la GPU.');
      }

      const job = payload.job || {};
      const selectedCard = verifiedQuote.cards?.find(
        (card) => card.selectionId === computeSelectionId
      );
      const gpuJobId = payload.gpuJobId || job.id;
      if (!gpuJobId) throw new Error('Nayla Compute no devolvió un identificador de trabajo.');

      const is3d = gpuQuoteRequest.workload === '3d';
      const isMusic = gpuQuoteRequest.recipe === 'ace-step-music';
      const userText = gpuQuoteUi?.userText ||
        (isMusic ? 'Generar música con Nayla Compute.' : 'Ejecutar trabajo con Nayla Compute.');

      setChatMessages((prev) => [
        ...prev,
        ...(gpuQuoteUi?.fromChat ? [] : [{ role: 'user' as const, text: userText }]),
        {
          role: 'ai' as const,
          text: payload.text || 'Nayla Compute está preparando la GPU.',
          actionPlan: {
            action: 'RUN_GPU_JOB',
            status: job.status || 'booting',
            engine: 'nayla-compute',
            gpuJobId,
            gpuName: job.gpuName ?? selectedCard?.gpuName ?? verifiedQuote.gpuName ?? null,
            hourlyPrice: job.hourlyPrice ?? selectedCard?.hourlyPrice ?? verifiedQuote.hourlyPrice ?? null,
            estimatedMaxCost:
              job.estimatedMaxCost ?? selectedCard?.estimatedMaxCost ?? verifiedQuote.estimatedMaxCost ?? null,
            runtimeCostEstimate: job.runtimeCostEstimate ?? null,
          },
        },
      ]);

      setGpuQuote(null);
      setGpuQuoteSource(null);
      setGpuQuoteRequest(null);
      setGpuQuoteUi(null);
      if (is3d) setMainNav('3d');
      if (isMusic) setMainNav('boveda');
      setIsChatOpen(true);
      setMobileOverlaysVisible(true);
      openExpandedSurface('chat');
    } catch (error: any) {
      console.error('Error iniciando trabajo GPU:', error);
      showAlert(error?.message || 'No se pudo iniciar el trabajo GPU.');
    } finally {
      setGpuQuoteConfirming(false);
    }
  };

  const handle3DNaylaAction = async (
    mode: 'text_to_3d' | 'image_to_3d' | 'multiview_to_3d' | 'texture' | 'optimize' | 'rig' | 'animate' | 'retarget',
    prompt?: string
  ) => {
    let instruction = '';
    const active3d = modelos3d.find((item) => item.id === modelo3dActivoId) || modelos3d[0];

    if (mode === 'text_to_3d') {
      if (!prompt?.trim()) return showAlert('Describe primero el modelo que quieres crear.');
      instruction = `Crea un modelo 3D desde texto con esta descripción: ${prompt.trim()}`;
    } else if (mode === 'image_to_3d') {
      await quoteImageTo3D();
      return;
    } else if (mode === 'multiview_to_3d') {
      const selectedPhotos = galeriaMultimedia.filter(
        (item) => item.tipo === 'foto' && selectedMediaIds.includes(item.id)
      );
      if (selectedPhotos.length < 2) {
        return showAlert('Selecciona al menos 2 fotos en la Bóveda para una reconstrucción multivista.');
      }
      instruction = `Crea un modelo 3D multivista usando estas imágenes: ${selectedPhotos.map((item) => item.url).join(' , ')}`;
    } else {
      if (!active3d) return showAlert('Primero selecciona o sube un modelo 3D.');
      const actionLabel: Record<string, string> = {
        texture: 'texturiza',
        optimize: 'optimiza para web',
        rig: 'haz rigging',
        animate: 'prepara una animación',
        retarget: 'haz retargeting de animación',
      };
      instruction = `${actionLabel[mode] || mode} este modelo 3D: ${active3d.url}`;
      if (prompt?.trim()) instruction += `. Instrucción adicional: ${prompt.trim()}`;
    }

    setMainNav('3d');
    setIsChatOpen(true);
    setMobileOverlaysVisible(true);
    openExpandedSurface('chat');
    await sendNaylaMessage(instruction);
  };

  const descargarIndividual = async (url: string, nombre: string, tipo: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const ext = tipo === 'foto' ? 'jpg' : tipo === 'audio' ? 'mp3' : 'mp4';

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = nombre || `Nayla_Clip.${ext}`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      console.error(e);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.target = "_blank";
      a.click();
    }
  };


  const eliminarMediaIndividual = async (item: MediaItem) => {
    const currentSession = session || await getFirebaseSession();
    if (!currentSession) return showAlert('Debes iniciar sesión para eliminar archivos.');

    setMediaActionBusy(true);
    try {
      const response = await fetch('/api/galeria', {
        method: 'DELETE',
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ids: [item.id] }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'No se pudo eliminar el archivo.');

      const nextTimeline = lineaDeTiempo.filter((clip) => clip.mediaId !== item.id);
      if (nextTimeline.length !== lineaDeTiempo.length) {
        setLineaDeTiempo(nextTimeline);
        sincronizarLineaDeTiempo(nextTimeline);
      }

      setGaleriaMultimedia((prev) => prev.filter((media) => media.id !== item.id));
      setSelectedMediaIds((prev) => prev.filter((id) => id !== item.id));
      setChatAttachmentIds((prev) => prev.filter((id) => id !== item.id));

      if (clipSeleccionado === item.id || mediaActivaUrl === item.url) {
        setClipSeleccionado(null);
        setMediaActivaUrl(null);
        setIsPlaying(false);
      }

      if (videoResultadoUrl === item.url) {
        setVideoResultadoUrl(null);
        setVideoResultadoNombre(null);
        setVideoResultadoEtiqueta(null);
        setIsPlaying(false);
      }

      setMediaActionItem(null);
      setMediaActionMode('menu');
      showAlert('Archivo eliminado de tu espacio.');
    } catch (error: any) {
      showAlert(error?.message || 'No se pudo eliminar el archivo.');
    } finally {
      setMediaActionBusy(false);
    }
  };



  useEffect(() => {
    if (!timelineRef.current || isUserScrolling || videoResultadoUrl) return;
    // Left/right padding place time 0 exactly under the centered playhead.
    timelineRef.current.scrollLeft = Math.max(0, playbackPositionSeconds * 20);
  }, [playbackPositionSeconds, isUserScrolling, videoResultadoUrl]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;

    // Este editor ya no tiene login propio. La sesión llega de dos formas:
    // 1) Un Custom Token de Firebase en el fragmento de la URL (#authToken=...),
    //    generado por el Home cuando el usuario hace click en "Nayla Editor".
    // 2) Una sesión de Firebase ya activa en este navegador (visita repetida).
    // Si no hay ninguna de las dos, se redirige de vuelta al Home.
    const consumeTokenFromUrl = async () => {
      if (typeof window === 'undefined') return false;
      const hash = window.location.hash || '';
      const match = hash.match(/authToken=([^&]+)/);
      if (!match) return false;
      const token = decodeURIComponent(match[1]);
      // Limpiar el token de la URL de inmediato, nunca debe quedar visible
      // ni en el historial del navegador.
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      try {
        const result = await signInWithCustomTokenValue(token);
        if (cancelled) return true;
        if (result) {
          setSession(result);
          cargarDatosUsuario(result.user.id);
        }
        return true;
      } catch (error: any) {
        console.error('Error al validar la sesión recibida del Home:', error);
        if (cancelled) return true;
        const code = error?.code ? ` (${error.code})` : '';
        const detail = error?.message ? `\n${error.message}` : '';
        setAuthError(`No se pudo validar tu acceso${code}. Volviendo al inicio...${detail}`);
        return true;
      }
    };

    (async () => {
      const tokenHandled = await consumeTokenFromUrl();

      if (!tokenHandled) {
        try {
          const current = await getFirebaseSession();
          if (!cancelled && current) {
            setSession(current);
            cargarDatosUsuario(current.user.id);
          } else if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && window.location.search.includes('dev=1')) {
            const devSession = { user: { id: 'dev-user', email: 'dev@nayla.app' }, accessToken: 'dev-token' };
            setSession(devSession as any);
          }
        } catch (error) {
          console.warn('Firebase no configurado:', error);
          if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined' && window.location.search.includes('dev=1')) {
            const devSession = { user: { id: 'dev-user', email: 'dev@nayla.app' }, accessToken: 'dev-token' };
            setSession(devSession as any);
          }
        }
      }

      if (!cancelled) setAuthChecked(true);
    })();

    observeFirebaseSession((current) => {
      if (cancelled) return;
      setSession(current);
      if (current) cargarDatosUsuario(current.user.id);
    }).then((listener) => { unsubscribe = listener; }).catch(() => undefined);

    const timer = setTimeout(() => setShowIntro(false), 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, []);

  // Sin sesión y ya terminamos de revisar token/sesión local: no hay forma de
  // entrar aquí directamente, hay que volver al Home a iniciar sesión.
  useEffect(() => {
    if (showIntro || session || !authChecked) return;
    const mainSiteUrl = process.env.NEXT_PUBLIC_MAIN_SITE_URL;
    if (!mainSiteUrl) {
      console.error('NEXT_PUBLIC_MAIN_SITE_URL no está configurada; no se puede redirigir al Home.');
      setAuthError('Configuración incompleta: falta la URL del sitio principal.');
      return;
    }
    const timer = setTimeout(() => {
      window.location.href = mainSiteUrl;
    }, authError ? 8000 : 300);
    return () => clearTimeout(timer);
  }, [showIntro, session, authChecked, authError]);

  const cargarMensajesDelChat = async (
    currentSession: FirebaseSession,
    threadId: string
  ) => {
    const [response, rendersResponse] = await Promise.all([
      fetch('/api/chat/messages?threadId=' + encodeURIComponent(threadId) + '&limit=100', {
        headers: firebaseHeaders(currentSession),
      }),
      fetch('/api/render?threadId=' + encodeURIComponent(threadId), {
        headers: firebaseHeaders(currentSession),
        cache: 'no-store',
      }),
    ]);

    const payload = await response.json().catch(() => ({})) as { messages?: any[]; error?: string };
    const rendersPayload = await rendersResponse.json().catch(() => ({})) as { renders?: any[]; error?: string };

    if (!response.ok) {
      throw new Error(payload.error || 'No se pudo cargar el historial del chat.');
    }

    const loaded: NaylaChatMessage[] = (payload.messages || [])
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({
        role: message.role === 'user' ? 'user' as const : 'ai' as const,
        text: String(message.content || ''),
        editorReview: message.metadata?.editorReview,
        attachments: Array.isArray(message.attachments)
          ? message.attachments.map((item: any) => ({
              id: String(item.id),
              tipo: item.tipo as NaylaChannelKind,
              nombre: String(item.nombre || item.etiqueta || 'Archivo'),
              url: typeof item.url === 'string' ? item.url : undefined,
              etiqueta: typeof item.etiqueta === 'string' ? item.etiqueta : undefined,
            }))
          : undefined,
        actionPlan: message.action && typeof message.action === 'object'
          ? {
              action: String(message.action.action || 'ACTION'),
              status: message.action.status,
              engine: message.action.engine === 'nayla-compute' || message.action.action === 'RUN_GPU_JOB'
                ? 'nayla-compute'
                : 'nayla-cloud',
              gpuJobId: message.action.gpuJobId,
              mediaJobId: message.action.mediaJobId,
              gpuName: message.action.job?.gpuName ?? message.action.quote?.gpuName ?? null,
              hourlyPrice: message.action.job?.hourlyPrice ?? message.action.quote?.hourlyPrice ?? null,
              estimatedMaxCost: message.action.job?.estimatedMaxCost ?? message.action.quote?.estimatedMaxCost ?? null,
              runtimeCostEstimate: message.action.job?.runtimeCostEstimate ?? message.action.runtimeCostEstimate ?? null,
              outputUrl: message.action.outputUrl ?? null,
              textOutput: message.action.textOutput ?? null,
            }
          : undefined,
      }));

    if (rendersResponse.ok) {
      for (const render of rendersPayload.renders || []) {
        const usage = render?.usage || {};
        const serverStatus = String(render?.status || 'started');
        const stage = String(usage.stage || 'preparing');
        const renderStatus: NonNullable<NaylaChatMessage['renderTask']>['status'] =
          serverStatus === 'completed'
            ? 'completed'
            : serverStatus === 'failed'
              ? 'failed'
              : serverStatus === 'cancelled'
                ? 'cancelled'
                : stage === 'saving'
                  ? 'saving'
                  : stage === 'rendering'
                    ? 'rendering'
                    : 'preparing';

        loaded.push({
          role: 'ai',
          text: '',
          renderTask: {
            requestId: String(render.requestId || ''),
            status: renderStatus,
            phase: String(
              usage.phase ||
              (renderStatus === 'completed'
                ? 'Resultado listo'
                : renderStatus === 'failed'
                  ? 'Procesamiento interrumpido'
                  : renderStatus === 'cancelled'
                    ? 'Cancelado por el usuario'
                    : 'Preparando edición')
            ),
            progress: renderStatus === 'completed'
              ? 1
              : Math.max(0, Math.min(1, Number(usage.progress) || 0)),
            framesDone: Number.isFinite(Number(usage.framesDone)) ? Number(usage.framesDone) : undefined,
            framesTotal: Number.isFinite(Number(usage.framesTotal)) ? Number(usage.framesTotal) : undefined,
            outputUrl: render?.galleryItem?.url || null,
            galleryItem: render?.galleryItem || null,
            error: render?.error || null,
          },
        });
      }
    }

    setChatMessages(loaded);
  };

  const cargarProyectoActivo = async (
    projectId: string,
    currentSession: FirebaseSession
  ) => {
    setActiveProjectId(projectId);
    setChatAttachmentIds([]);
    setVideoResultadoUrl(null);

    const [galeriaResponse, proyectoResponse, threadsResponse] = await Promise.all([
      fetch('/api/galeria?projectId=' + encodeURIComponent(projectId), {
        headers: firebaseHeaders(currentSession),
      }),
      fetch('/api/proyectos?projectId=' + encodeURIComponent(projectId), {
        headers: firebaseHeaders(currentSession),
      }),
      fetch('/api/chat/threads?projectId=' + encodeURIComponent(projectId), {
        headers: firebaseHeaders(currentSession),
      }),
    ]);

    const galeriaPayload = await galeriaResponse.json().catch(() => ({})) as { data?: any[]; error?: string };
    if (!galeriaResponse.ok) throw new Error(galeriaPayload.error || 'No se pudo cargar la Bóveda del proyecto.');
    const galeriaData = galeriaPayload.data || [];

    const modelos = galeriaData
      .filter((item) => item.tipo === 'modelo3d')
      .map((item) => ({
        id: item.id,
        url: item.url,
        tipo: 'modelo3d' as const,
        nombre: item.nombre,
        creado_en: item.creado_en,
        esOverlay: false as const,
        etiqueta: item.etiqueta || 'M',
        fuente: item.fuente,
        metadata: item.metadata || {},
        r2_key: item.r2_key || null,
        project_id: item.project_id || null,
        thread_id: item.thread_id || null,
        privacy: item.privacy || 'private'
      }));

    const galeria = galeriaData
      .filter((item) => ['foto', 'video', 'audio'].includes(item.tipo))
      .map((item) => ({
        id: item.id,
        url: item.url,
        tipo: item.tipo,
        nombre: item.nombre,
        creado_en: item.creado_en,
        esOverlay: item.esOverlay,
        etiqueta: item.etiqueta,
        fuente: item.fuente,
        metadata: item.metadata || {},
        r2_key: item.r2_key || null,
        project_id: item.project_id || null,
        thread_id: item.thread_id || null,
        privacy: item.privacy || 'private'
      }));

    const documents = galeriaData
      .filter((item) => item.tipo === 'documento')
      .map((item) => ({
        id: item.id,
        url: item.url,
        tipo: 'documento' as const,
        nombre: item.nombre,
        creado_en: item.creado_en,
        etiqueta: item.etiqueta || 'D',
        fuente: item.fuente,
        metadata: item.metadata || {},
        r2_key: item.r2_key || null,
        project_id: item.project_id || null,
        thread_id: item.thread_id || null,
        privacy: item.privacy || 'private',
      }));

    setModelos3d(modelos);
    setModelo3dActivoId(modelos[0]?.id || null);
    setGaleriaMultimedia(galeria);
    setChatDocuments(documents);

    const proyectoPayload = await proyectoResponse.json().catch(() => ({})) as {
      data?: { linea_de_tiempo?: any[] };
      error?: string;
    };
    if (!proyectoResponse.ok) throw new Error(proyectoPayload.error || 'No se pudo cargar el timeline del proyecto.');

    const timeline = Array.isArray(proyectoPayload.data?.linea_de_tiempo)
      ? proyectoPayload.data!.linea_de_tiempo!
      : [];
    setLineaDeTiempo(timeline);
    setSubtitulos([]);
    setMotionTitles([]);
    setThreeRenderScenes([]);

    const firstVisual = timeline.find((item: any) => item.tipo === 'video' || item.tipo === 'foto');
    if (firstVisual) {
      setMediaActivaUrl(firstVisual.url);
      setClipSeleccionado(firstVisual.id);
      let persistedMetadata = firstVisual.metadata ||
        galeriaData.find((item: any) => item.id === firstVisual.mediaId)?.metadata;

      if (!persistedMetadata?.aspectRatioLabel) {
        try {
          persistedMetadata = await probeMediaUrl(firstVisual.url, firstVisual.tipo);
        } catch (error) {
          console.warn('No se pudo recuperar el formato del primer clip del proyecto.', error);
        }
      }
      adoptarFormatoVisual(persistedMetadata);
    } else {
      setMediaActivaUrl(null);
      setClipSeleccionado(null);
    }

    const threadsPayload = await threadsResponse.json().catch(() => ({})) as { threads?: any[]; error?: string };
    if (!threadsResponse.ok) throw new Error(threadsPayload.error || 'No se pudieron cargar los chats del proyecto.');

    let threadList = (threadsPayload.threads || []).filter((thread) => thread.status !== 'archived');
    let selectedThread = threadList[0] || null;

    if (!selectedThread) {
      const createResponse = await fetch('/api/chat/threads', {
        method: 'POST',
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ projectId, title: 'Nuevo chat' }),
      });
      const createPayload = await createResponse.json().catch(() => ({})) as { thread?: any; error?: string };
      if (!createResponse.ok || !createPayload.thread) {
        throw new Error(createPayload.error || 'No se pudo crear el chat inicial del proyecto.');
      }
      selectedThread = createPayload.thread;
      threadList = [selectedThread];
    }

    setChatThreads(threadList);
    setActiveThreadId(selectedThread.id);
    await cargarMensajesDelChat(currentSession, selectedThread.id);
  };

  const cargarDatosUsuario = async (userId: string, preferredProjectId?: string) => {
    try {
      const currentSession = session || await getFirebaseSession();
      if (!currentSession) return;

      const projectsResponse = await fetch('/api/projects', {
        headers: firebaseHeaders(currentSession),
      });
      const projectsPayload = await projectsResponse.json().catch(() => ({})) as { projects?: NaylaProject[]; error?: string };
      if (!projectsResponse.ok) throw new Error(projectsPayload.error || 'No se pudieron cargar los proyectos.');

      let activeProjects = (projectsPayload.projects || []).filter((project) => project.status !== 'archived');

      if (!activeProjects.length) {
        const createResponse = await fetch('/api/projects', {
          method: 'POST',
          headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
          body: JSON.stringify({ name: 'Proyecto principal' }),
        });
        const createPayload = await createResponse.json().catch(() => ({})) as { project?: NaylaProject; error?: string };
        if (!createResponse.ok || !createPayload.project) {
          throw new Error(createPayload.error || 'No se pudo crear el proyecto principal.');
        }
        activeProjects = [createPayload.project];
      }

      setProjects(activeProjects);

      const requestedProject =
        activeProjects.find((project) => project.id === preferredProjectId) ||
        activeProjects.find((project) => project.id === activeProjectId) ||
        activeProjects[0];

      if (requestedProject) {
        await cargarProyectoActivo(requestedProject.id, currentSession);
      }

      const { data: plantillasData, error: plantillasError } = await supabase
        .from('plantillas_usuario')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (!plantillasError && plantillasData) {
        setMoldesScripts(plantillasData.map((projectTemplate) => ({
          id: projectTemplate.id,
          nombre: projectTemplate.nombre,
          codigo: projectTemplate.codigo_script
        })));
      }
    } catch (err) {
      console.error('Error al cargar los datos del usuario:', err);
    }
  };

  const aplicarMarcoAImagen = (imagenUrl: string, config: MarcoConfig): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(imagenUrl);
        const { width: targetW, height: targetH } = getCanvasDimensionsFromRatio(canvasRatio, '1080p');
        canvas.width = targetW; canvas.height = targetH;
        ctx.fillStyle = config.color;
        ctx.fillRect(0, 0, targetW, targetH);
        const g = config.grosor;
        let imgX = 0, imgY = 0, imgW = targetW, imgH = targetH;
        const pos = config.posicion;
        if (pos.includes('derecha')) imgW -= g;
        if (pos.includes('izquierda')) { imgX += g; imgW -= g; }
        if (pos.includes('abajo')) imgH -= g;
        if (pos.includes('arriba')) { imgY += g; imgH -= g; }
        const scale = Math.min(imgW / img.width, imgH / img.height);
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        ctx.drawImage(img, imgX + (imgW - drawW) / 2, imgY + (imgH - drawH) / 2, drawW, drawH);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      };
      img.src = imagenUrl;
    });
  };

  const procesarImagenesConMarco = async () => {
    const fotos = galeriaMultimedia.filter(item => item.tipo === 'foto');
    if (fotos.length === 0) return showAlert('No hay fotos en la bodega. Sube fotos primero.');
    setMarcoProcesando(true);
    const resultados = [];
    for (const foto of fotos) {
      const procesada = await aplicarMarcoAImagen(foto.url, marcoConfig);
      resultados.push({ original: foto.url, procesada, nombre: foto.nombre });
    }
    setMarcoImagenes(resultados);
    setMarcoProcesando(false);
  };

  const descargarImagenConMarco = (url: string, nombre: string) => {
    const a = document.createElement('a');
    a.href = url; a.download = `MARCO_${nombre.replace(/\.[^/.]+$/, '')}.jpg`; a.click();
  };

  const descargarTodasConMarco = () => {
    marcoImagenes.forEach((img, i) => setTimeout(() => descargarImagenConMarco(img.procesada, img.nombre), i * 300));
  };

  const [subiendoArchivo, setSubiendoArchivo] = useState(false);
  const [vaultUploadProgress, setVaultUploadProgress] = useState<UploadProgressSnapshot | null>(null);

  const handleSubirMultimedia = async (e: React.ChangeEvent<HTMLInputElement>, tipo: 'foto' | 'video' | 'audio') => {
    if (!e.target.files || e.target.files.length === 0) return;

    const currentSession = session || await getFirebaseSession();

    if (!currentSession) {
      showAlert('Debes iniciar sesión para subir archivos a la Bóveda.');
      e.target.value = '';
      return;
    }

    const files = Array.from(e.target.files);
    setSubiendoArchivo(true);
    setVaultUploadProgress({
      percent: 0,
      loadedBytes: 0,
      totalBytes: files.reduce((sum, file) => sum + file.size, 0),
      fileIndex: 1,
      fileCount: files.length,
      fileName: files[0]?.name || '',
      phase: 'uploading',
    });

    try {
      const nuevosItems = await uploadMediaFilesToBodega({
        session: currentSession,
        files,
        existingItems: galeriaMultimedia,
        forcedTipo: tipo,
        fuente: 'manual',
        projectId: activeProjectId || undefined,
        threadId: activeThreadId || undefined,
        onProgress: setVaultUploadProgress,
      });

      setGaleriaMultimedia(prev => [...prev, ...nuevosItems]);

      for (const item of nuevosItems) {
        await agregarAlTimeline(item, { preventDuplicate: true });
      }

      showAlert(
        nuevosItems.length === 1
          ? `${nuevosItems[0]?.nombre || 'Archivo'} se guardó en la Bóveda y se añadió a la línea de tiempo.`
          : `${nuevosItems.length} archivos se guardaron en la Bóveda y se añadieron a la línea de tiempo.`
      );
    } catch (err: any) {
      console.error('Error procesando subida:', err);
      showAlert(err?.message || 'Hubo un error al procesar los archivos.');
    } finally {
      e.target.value = '';
      setSubiendoArchivo(false);
      setVaultUploadProgress(null);
    }
  };
  const eliminarItemsGaleria = async (ids: string[]) => {
    if (!session || ids.length === 0) return;

    const itemsToDelete = galeriaMultimedia.filter(item => ids.includes(item.id));
    const timelineItemsToDelete = lineaDeTiempo.filter(item => ids.includes(item.mediaId));

    // /api/galeria is authoritative: it first deletes the physical R2 objects
    // using their canonical r2_key and only then removes the database rows.
    // Keep the UI untouched until that operation succeeds.
    const response = await fetch('/api/galeria', {
      method: 'DELETE',
      headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ids }),
    });
    const payload = await response.json().catch(() => ({})) as { error?: string; deletedIds?: string[] };

    if (!response.ok) {
      console.error('Error eliminando de Bóveda/R2:', payload.error);
      showAlert('No se pudo eliminar completamente el archivo: ' + (payload.error || 'Error desconocido.'));
      return;
    }

    const deletedIds = new Set(payload.deletedIds?.length ? payload.deletedIds : ids);
    const nuevaGaleria = galeriaMultimedia.filter(item => !deletedIds.has(item.id));
    const nuevaLinea = lineaDeTiempo.filter(item => !deletedIds.has(item.mediaId));

    setGaleriaMultimedia(nuevaGaleria);
    setLineaDeTiempo(nuevaLinea);
    await sincronizarLineaDeTiempo(nuevaLinea);

    const deletedTimelineIds = new Set(timelineItemsToDelete.map(item => item.id));
    if (clipSeleccionado && deletedTimelineIds.has(clipSeleccionado)) {
      setClipSeleccionado(null);
    }

    if (itemsToDelete.some(item => item.url === mediaActivaUrl)) {
      setMediaActivaUrl(null);
    }

    if (itemsToDelete.some(item => item.url === videoResultadoUrl)) {
      setVideoResultadoUrl(null);
      setVideoResultadoNombre(null);
      setVideoResultadoEtiqueta(null);
    }

    showAlert(itemsToDelete.length === 1
      ? 'Archivo eliminado completamente de la Bóveda y de R2.'
      : `${itemsToDelete.length} archivos eliminados completamente de la Bóveda y de R2.`);
  };

  const eliminarDeGaleria = async (id: string) => {
    await eliminarItemsGaleria([id]);
  };

  const sincronizarLineaDeTiempo = async (nuevaLinea: TimelineItem[]) => {
    if (session) {
      const response = await fetch('/api/proyectos', {
        method: 'PUT',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          projectId: activeProjectId || undefined,
          linea_de_tiempo: nuevaLinea,
          actualizado_en: new Date().toISOString()
        }),
      });
      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        console.error('Error sincronizando línea de tiempo:', payload.error);
      }
    }
  };

  const agregarAlTimeline = async (
    item: MediaItem,
    options: {
      preventDuplicate?: boolean;
      useExistingMetadata?: boolean;
      deferSync?: boolean;
    } = {}
  ) => {
    let metadata: MediaMetadata = { ...(item.metadata || {}) };
    const existingMetadataIsEnough =
      item.tipo === 'foto'
        ? Boolean(metadata.width && metadata.height)
        : item.tipo === 'video'
          ? Boolean(metadata.width && metadata.height && metadata.durationInSeconds)
          : Boolean(metadata.durationInSeconds);

    if (!options.useExistingMetadata || !existingMetadataIsEnough) {
      try {
        const probed = await probeMediaUrl(item.url, item.tipo);
        metadata = { ...metadata, ...probed };
      } catch (error) {
        console.warn('Could not load complete media metadata for', item.url, error);
      }
    }

    let durationInSeconds = metadata.durationInSeconds;
    if (item.tipo === 'audio' && durationInSeconds === undefined) {
      try {
        durationInSeconds = await getAudioDurationInSeconds(item.url);
      } catch (e) {
        console.warn('Could not load audio duration for', item.url);
      }
    } else if (item.tipo === 'video' && durationInSeconds === undefined) {
      try {
        const remotionMetadata = await getVideoMetadata(item.url);
        durationInSeconds = remotionMetadata.durationInSeconds;
      } catch (e) {
        console.warn('Could not load metadata for', item.url);
      }
    } else if (item.tipo === 'foto') {
      durationInSeconds = 5;
    }

    if (durationInSeconds) metadata.durationInSeconds = metadata.durationInSeconds || durationInSeconds;

    const currentTimeline = lineaDeTiempoRef.current;
    const existingClip = options.preventDuplicate
      ? currentTimeline.find((clip) => clip.mediaId === item.id)
      : undefined;

    if (existingClip) {
      setClipSeleccionado(existingClip.id);
      if (item.tipo !== 'audio') {
        setMediaActivaUrl(existingClip.url);
        setVideoResultadoUrl(null);
      }
      return existingClip;
    }

    const nuevo: TimelineItem = {
      id: createMediaId(),
      mediaId: item.id,
      tipo: item.tipo,
      nombre: item.nombre,
      etiqueta: item.etiqueta,
      url: item.url,
      durationInSeconds,
      originalDurationInSeconds: durationInSeconds,
      metadata
    };

    const hadVisual = currentTimeline.some((clip) => clip.tipo === 'foto' || clip.tipo === 'video');
    const nuevaLinea = [...currentTimeline, nuevo];
    lineaDeTiempoRef.current = nuevaLinea;
    setLineaDeTiempo(nuevaLinea);

    setClipSeleccionado(nuevo.id);
    if (nuevo.tipo !== 'audio') {
      setMediaActivaUrl(nuevo.url);
      setVideoResultadoUrl(null);
      setRects([]);
    }

    if ((nuevo.tipo === 'foto' || nuevo.tipo === 'video') && !hadVisual) {
      adoptarFormatoVisual(metadata);
    }

    if (!options.deferSync) {
      await sincronizarLineaDeTiempo(nuevaLinea);
    }
    return nuevo;
  };

  const quitarDelTimeline = (id: string) => {
    const nuevaLinea = lineaDeTiempo.filter(t => t.id !== id);
    setLineaDeTiempo(nuevaLinea);
    setClipSeleccionado(null);
    sincronizarLineaDeTiempo(nuevaLinea);
  };

  const renombrarItem = async (id: string, nuevoNombre: string) => {
    setGaleriaMultimedia(galeriaMultimedia.map(item => item.id === id ? { ...item, nombre: nuevoNombre } : item));
    const nuevaLinea = lineaDeTiempo.map(item => item.mediaId === id ? { ...item, nombre: nuevoNombre } : item);
    setLineaDeTiempo(nuevaLinea);

    if (session) {
      const response = await fetch('/api/galeria', {
        method: 'PATCH',
        headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id, nombre: nuevoNombre }),
      });

      if (!response.ok) {
        const payload = await response.json() as { error?: string };
        console.error('Error renombrando en Supabase:', payload.error);
      }

      sincronizarLineaDeTiempo(nuevaLinea);
    }
  };

  const handleToolClick = (tool: any) => {
    if (navActiva === tool.id) { setNavActiva(null); setToolMessage(null); return; }
    setNavActiva(tool.id);
    if (['galeria', 'herramientas', 'script', 'ia', 'marco'].includes(tool.id)) setToolMessage(null);
    else setToolMessage('PRÓXIMAMENTE');
  };

  const togglePlay = async () => {
    const player = playerRef.current;
    if (!player) return;
    if (!player.paused) player.pause();
    else {
      try { await player.play(); }
      catch { setIsPlaying(false); showAlert('No se pudo iniciar la reproducción. Intenta nuevamente.'); }
    }
  };

  const handleVideoEnded = () => {
    if (videoResultadoUrl || !activeTimelineClip) {
      setIsPlaying(false);
      setPlaybackPositionSeconds(playbackTotalSeconds || nativePlaybackDurationSeconds);
      return;
    }

    const currentIndex = pistaVideo.findIndex((clip) => clip.id === activeTimelineClip.id);
    const nextClip = currentIndex >= 0 ? pistaVideo[currentIndex + 1] : null;

    if (!nextClip) {
      setIsPlaying(false);
      setPlaybackPositionSeconds(visualTimelineDurationSeconds);
      return;
    }

    if (nextClip.tipo === 'foto') {
      setClipSeleccionado(nextClip.id);
      setMediaActivaUrl(nextClip.url);
      setIsPlaying(false);
      setPlaybackPositionSeconds(getVisualClipStartSeconds(pistaVideo, nextClip.id));
      return;
    }

    pendingPlaybackSeekRef.current = 0;
    resumePlaybackAfterSourceChangeRef.current = true;
    setClipSeleccionado(nextClip.id);
    setMediaActivaUrl(nextClip.url);
    setVideoResultadoUrl(null);
    setVideoResultadoNombre(null);
    setVideoResultadoEtiqueta(null);
    setPlaybackPositionSeconds(getVisualClipStartSeconds(pistaVideo, nextClip.id));
  };

  const formatDownloadBytes = (value: unknown) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return '—';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDownloadDuration = (value: unknown) => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return '—';
    const rounded = Math.round(seconds);
    const minutes = Math.floor(rounded / 60);
    const remainder = rounded % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  };

  const handleDescargar = async () => {
    const selectedItem = galeriaMultimedia.find((item) => item.id === selectedDownloadMediaId && item.tipo === 'video');
    if (!selectedItem) return showAlert('Selecciona un video para descargar.');

    const preferredName = selectedItem.nombre || 'Nayla_Export.mp4';
    const cleanName = preferredName.toLowerCase().endsWith('.mp4')
      ? preferredName
      : `${preferredName.replace(/\.[a-z0-9]+$/i, '')}.mp4`;

    setDownloadBusy(true);
    setDownloadStatus('Preparando archivo…');

    try {
      const response = await fetch(selectedItem.url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`No se pudo descargar el archivo (${response.status}).`);

      setDownloadStatus('Generando descarga segura…');
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = cleanName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
      setDownloadStatus('Descarga iniciada');
      window.setTimeout(() => setDownloadStatus(null), 1800);
    } catch (error) {
      console.error(error);
      setDownloadStatus(null);
      showAlert(error instanceof Error ? error.message : 'No se pudo preparar la descarga.');
    } finally {
      setDownloadBusy(false);
    }
  };

  const renombrarVideoDescarga = async () => {
    const selectedItem = galeriaMultimedia.find((item) => item.id === selectedDownloadMediaId && item.tipo === 'video');
    if (!selectedItem) return;

    const rawName = downloadRenameValue.trim();
    if (!rawName) return showAlert('Escribe un nombre para el video.');

    const cleanBase = rawName.replace(/\.mp4$/i, '').trim();
    if (!cleanBase) return showAlert('Escribe un nombre válido.');
    const nextName = `${cleanBase}.mp4`;

    const currentSession = session || await getFirebaseSession();
    if (!currentSession) return showAlert('Debes iniciar sesión para renombrar.');

    setDownloadRenameBusy(true);
    try {
      const response = await fetch('/api/galeria', {
        method: 'PATCH',
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ id: selectedItem.id, nombre: nextName }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error || 'No se pudo renombrar el video.');

      setGaleriaMultimedia((prev) => prev.map((item) =>
        item.id === selectedItem.id ? { ...item, nombre: nextName } : item
      ));
      if (videoResultadoUrl === selectedItem.url) setVideoResultadoNombre(nextName);
      setDownloadRenameValue(nextName);
      setDownloadStatus('Nombre actualizado');
      window.setTimeout(() => setDownloadStatus(null), 1600);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : 'No se pudo renombrar el video.');
    } finally {
      setDownloadRenameBusy(false);
    }
  };

  const editarVideoSeleccionadoDesdeDescargas = async () => {
    const selectedItem = galeriaMultimedia.find((item) => item.id === selectedDownloadMediaId && item.tipo === 'video');
    if (!selectedItem) return;

    setIsDownloadMenuOpen(false);
    setDownloadTrayStep('list');
    setMediaActivaUrl(selectedItem.url);
    setVideoResultadoUrl(String(selectedItem.fuente || '').startsWith('render:') ? selectedItem.url : null);
    setVideoResultadoNombre(selectedItem.nombre || 'Nayla_Export.mp4');
    setVideoResultadoEtiqueta(selectedItem.etiqueta || 'R');
    setClipSeleccionado(null);
    setIsPlaying(false);

    try {
      await agregarAlTimeline(selectedItem, { preventDuplicate: true });
    } catch (error) {
      console.error(error);
    }
  };


  const procesarEnlaceIndividual = async (url: string, index: number, descargaId: string): Promise<(MediaItem & { durationInSeconds?: number }) | null> => {
    try {
      const resApi = await fetch('/api/extract-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const dataApi = await resApi.json();

      if (!resApi.ok || !dataApi.videoUrl) {
        const errorMsg = dataApi.error || `No se pudo extraer: ${url}`;
        showAlert(`Error descargando ${url}: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      const finalMediaUrl = dataApi.videoUrl;

      let resolvedTipo: 'video' | 'audio' | 'foto' = 'video';
      try {
        const parsed = new URL(finalMediaUrl);
        const path = parsed.pathname.toLowerCase();
        if (path.endsWith('.mp3') || path.endsWith('.wav') || path.endsWith('.m4a') || path.endsWith('.ogg')) {
          resolvedTipo = 'audio';
        } else if (path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.png') || path.endsWith('.webp')) {
          resolvedTipo = 'foto';
        }
      } catch (e) {
        // fallback a video
      }

      let mediaMetadata: MediaMetadata = {};
      let durationInSeconds: number | undefined = undefined;
      try {
        mediaMetadata = await probeMediaUrl(finalMediaUrl, resolvedTipo);
        durationInSeconds = resolvedTipo === 'foto' ? 5 : mediaMetadata.durationInSeconds;
        if (durationInSeconds) mediaMetadata.durationInSeconds = mediaMetadata.durationInSeconds || durationInSeconds;
      } catch (e) {
        console.warn('No se pudo cargar la metadata completa para', finalMediaUrl);
        try {
          if (resolvedTipo === 'audio') {
            durationInSeconds = await getAudioDurationInSeconds(finalMediaUrl);
          } else if (resolvedTipo === 'video') {
            const remotionMetadata = await getVideoMetadata(finalMediaUrl);
            durationInSeconds = remotionMetadata.durationInSeconds;
          } else if (resolvedTipo === 'foto') {
            durationInSeconds = 5;
          }
        } catch (fallbackError) {
          console.warn('Tampoco se pudo determinar la duración para', finalMediaUrl, fallbackError);
        }
      }

      // La tabla usa UUID; el ID debe ser compatible con Supabase.
      const id = createMediaId();

      // Para resolver el race condition en el que `galeriaMultimedia` está obsoleto
      // cuando se añaden varios enlaces o después de un limpiar(), no podemos depender
      // de la variable externa. En su lugar, usaremos setState pasándole una función.
      // Para poder devolver el item creado de forma síncrona sin romper React,
      // usamos una Promise local que se resuelve dentro del updater.

      // Para resolver el race condition limpiamente:
      // Usaremos el contador local actual que viene de galeriaMultimedia que React mantiene durante este closure
      // sumado con el `index` de la llamada Promise.all(), garantizando no colisionar IDs.
      const labelPrefix = resolvedTipo === 'video' ? 'V' : resolvedTipo === 'audio' ? 'A' : 'F';
      const maxExistingLabel = galeriaMultimedia.reduce((max, item) => {
        if (item.tipo !== resolvedTipo || typeof item.etiqueta !== 'string') return max;
        const match = item.etiqueta.trim().toUpperCase().match(
          new RegExp('^' + labelPrefix + '(\\d+)$')
        );
        return match ? Math.max(max, Number(match[1]) || 0) : max;
      }, 0);
      const actualCount = maxExistingLabel + index + 1;

      let nombreBase = `Meta_Video_${actualCount}.mp4`;
      let etiquetaBase = `V${actualCount}`;

      if (resolvedTipo === 'audio') {
        nombreBase = `Meta_Audio_${actualCount}.mp3`;
        etiquetaBase = `A${actualCount}`;
      } else if (resolvedTipo === 'foto') {
        nombreBase = `Meta_Foto_${actualCount}.jpg`;
        etiquetaBase = `F${actualCount}`;
      }

      const nuevoItem: MediaItem = {
        id,
        url: finalMediaUrl,
        tipo: resolvedTipo,
        nombre: nombreBase,
        creado_en: new Date().toLocaleTimeString(),
        esOverlay: false,
        etiqueta: etiquetaBase,
        metadata: mediaMetadata
      };

      const esPrimerVideo = galeriaMultimedia.length === 0 || !galeriaMultimedia.find(i => i.tipo === 'video');

      // Update state functionally without side-effects inside
      setGaleriaMultimedia(prev => {
         // Verificación de seguridad: si ya se agregó, no duplicarlo
         if (prev.find(i => i.id === nuevoItem.id)) return prev;
         return [...prev, nuevoItem];
      });

      if (esPrimerVideo && index === 0 && (nuevoItem.tipo === 'video' || nuevoItem.tipo === 'foto')) {
         setMediaActivaUrl(nuevoItem.url);
         setClipSeleccionado(nuevoItem.id);
         setVideoResultadoUrl(null);
         adoptarFormatoVisual(nuevoItem.metadata);
      }

      if (session) {
         fetch('/api/galeria', {
           method: 'POST',
           headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
           body: JSON.stringify({
             items: [nuevoItem],
             projectId: activeProjectId || undefined,
             threadId: activeThreadId || undefined,
           }),
         }).then(async (response) => {
           if (!response.ok) {
             const payload = await response.json() as { error?: string };
             console.error('Error insertando en Supabase:', payload.error);
           }
         });
      }

      // Actualizar estado de descarga a listo
      setDescargasActivas(prev => prev.map(d => d.id === descargaId ? { ...d, status: 'listo' } : d));

      return { ...nuevoItem, durationInSeconds, originalDurationInSeconds: durationInSeconds };

    } catch (err: any) {
      console.error(err);
      // Actualizar estado de descarga a error
      setDescargasActivas(prev => prev.map(d => d.id === descargaId ? { ...d, status: 'error' } : d));
      // No usar alert para no bloquear el paralelismo
      return null;
    }
  };

  const guardarMolde = async () => {
    if (!session) return showAlert("Debes iniciar sesión para guardar plantillas.");
    const nombre = prompt('Nombre para esta plantilla:', 'Plantilla Nueva');
    if (!nombre) return;

    try {
      const { data, error } = await supabase
        .from('plantillas_usuario')
        .insert([{
          user_id: session.user.id,
          nombre: nombre,
          codigo_script: codigoJsInput
        }])
        .select()
        .single();

      if (error) throw error;

      const nuevosMoldes = [...moldesScripts, { id: data.id, nombre: data.nombre, codigo: data.codigo_script }];
      setMoldesScripts(nuevosMoldes);
      setMoldeActivo(data.nombre);
    } catch (e) {
      console.error("Error guardando plantilla:", e);
      showAlert("Hubo un error al guardar la plantilla.");
    }
  };

  const cargarMolde = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nombre = e.target.value;
    setMoldeActivo(nombre);
    const molde = moldesScripts.find(m => m.nombre === nombre);
    if (molde) {
      setCodigoJsInput(molde.codigo);
    }
  };

  const eliminarMoldeActivo = async () => {
    if (!moldeActivo || !session) return;

    const molde = moldesScripts.find(m => m.nombre === moldeActivo);
    if (!molde || !molde.id) return;

    try {
      const { error } = await supabase
        .from('plantillas_usuario')
        .delete()
        .eq('id', molde.id)
        .eq('user_id', session.user.id);

      if (error) throw error;

      const nuevosMoldes = moldesScripts.filter(m => m.nombre !== moldeActivo);
      setMoldesScripts(nuevosMoldes);
      setMoldeActivo('');
      setCodigoJsInput('// Inyecta comandos JS aquí\n// Ej: NaylaEngine.agregar(["V1", "V2", "A1"]);\n// NaylaEngine.agregarSubtitulos([{ texto: "Hola", inicioSec: 0, finSec: 5 }]);');
    } catch (e) {
      console.error("Error eliminando plantilla:", e);
      showAlert("Hubo un error al eliminar la plantilla.");
    }
  };


  const getEngineContext = () => ({
        agregar: async (items: string[]) => {
          const nuevasDescargas = items
            .filter(item => item.startsWith('http://') || item.startsWith('https://'))
            .map((url, i) => ({ id: `engine-descarga-${Date.now()}-${i}`, url, status: 'procesando' as const }));

          if (nuevasDescargas.length > 0) {
            setDescargasActivas(prev => [...prev, ...nuevasDescargas]);
          }

          // Procesar las descargas en paralelo para obtener los objetos MediaItem
          const promesas = items.map(async (item, i) => {
            if (item.startsWith('http://') || item.startsWith('https://')) {
              const descargaId = nuevasDescargas.find(d => d.url === item)?.id || '';
              return await procesarEnlaceIndividual(item, i, descargaId);
            }
            return item; // Retorna la etiqueta original (string) si no es URL
          });

          const itemsProcesados = await Promise.all(promesas);

          if (nuevasDescargas.length > 0) {
             setTimeout(() => {
                setDescargasActivas(prev => prev.filter(d => nuevasDescargas.every(nd => nd.id !== d.id)));
             }, 3000);
          }

          // We need to fetch metadata for pre-existing labels too to avoid setting 5s default
          const itemsWithMetadata = await Promise.all(itemsProcesados.map(async (item) => {
             if (typeof item === 'string') {
               const media = galeriaMultimedia.find(m => m.etiqueta === item);
               if (media) {
                 let durationInSeconds: number | undefined = undefined;
                 if (media.tipo === 'audio') {
                   try {
                     durationInSeconds = await getAudioDurationInSeconds(media.url);
                   } catch (e) {
                     console.warn('Could not load audio duration for', media.url);
                   }
                 } else if (media.tipo === 'video') {
                   try {
                     const metadata = await getVideoMetadata(media.url);
                     durationInSeconds = metadata.durationInSeconds;
                   } catch (e) {
                     console.warn('Could not load metadata for', media.url);
                   }
                 } else if (media.tipo === 'foto') {
                   durationInSeconds = 5;
                 }
                 return { ...media, durationInSeconds, originalDurationInSeconds: durationInSeconds };
               }
               return null;
             }
             return item;
          }));

          // Ahora obtenemos una instantánea de la galería actualizda para buscar las etiquetas
          setLineaDeTiempo(prevLinea => {
             const nuevaLinea = [...prevLinea];
             let agregados = 0;

             itemsWithMetadata.forEach(item => {
                if (item && typeof item === 'object') {
                  nuevaLinea.push({
                    id: Date.now().toString() + Math.random().toString(),
                    mediaId: item.id,
                    tipo: item.tipo as any,
                    nombre: item.nombre,
                    etiqueta: item.etiqueta,
                    url: item.url,
                    durationInSeconds: (item as any).durationInSeconds !== undefined ? (item as any).durationInSeconds : (item.tipo === 'foto' ? 5 : undefined),
                    originalDurationInSeconds: (item as any).originalDurationInSeconds !== undefined ? (item as any).originalDurationInSeconds : ((item as any).durationInSeconds !== undefined ? (item as any).durationInSeconds : (item.tipo === 'foto' ? 5 : undefined)),
                    metadata: (item as any).metadata
                  });
                  agregados++;
                }
             });
             if(agregados > 0) setTimeout(() => sincronizarLineaDeTiempo(nuevaLinea), 0);
             return nuevaLinea;
          });
        },
        modificar: (etiqueta: string, opciones: any) => {
          if (etiqueta === 'global') {
            const opcionesGlobalesPermitidas = ['fadeOutFinal'];
            const opcionesDesconocidas = Object.keys(opciones).filter(k => !opcionesGlobalesPermitidas.includes(k));
            if (opcionesDesconocidas.length > 0) {
              const msj = `Advertencia: Las siguientes opciones en NaylaEngine.modificar('global') no son reconocidas y serán ignoradas: ${opcionesDesconocidas.join(', ')}`;
              console.warn(msj);
              showAlert(msj);
            }
            setGlobalSettings(prev => ({ ...prev, ...opciones }));
            return;
          }

          const opcionesPermitidas = ['volume', 'fadeIn', 'fadeOut', 'scale', 'delay', 'startFrom', 'trimBefore', 'trimAfter', 'loop', 'url', 'nombre', 'durationInSeconds', 'playbackRate', 'transitionDuration', 'transitionType', 'efecto', 'brightness', 'contrast', 'saturation', 'blur', 'overlay', 'overlayIntensity'];
          const opcionesDesconocidas = Object.keys(opciones).filter(k => !opcionesPermitidas.includes(k));

          if (opcionesDesconocidas.length > 0) {
            const msj = `Advertencia: Las siguientes opciones en NaylaEngine.modificar('${etiqueta}') no son reconocidas y serán ignoradas: ${opcionesDesconocidas.join(', ')}`;
            console.warn(msj);
            showAlert(msj);
          }

          setLineaDeTiempo(prev => {
            let modificado = false;
            const arr = prev.map(clip => {
              if (clip.etiqueta === etiqueta) { modificado = true; return { ...clip, ...opciones }; }
              return clip;
            });
            if(modificado) setTimeout(() => sincronizarLineaDeTiempo(arr), 0);
            return arr;
          });
        },
        agregarSubtitulos: (nuevosSubtitulos: any[]) => {
          const subsAInsertar = nuevosSubtitulos.map(sub => {
            const inicioSec = sub.inicioSec !== undefined ? sub.inicioSec : (sub.inicio !== undefined ? sub.inicio : 0);
            const finSec = sub.finSec !== undefined ? sub.finSec : (sub.fin !== undefined ? sub.fin : 0);
            return { ...sub, inicioSec, finSec, id: Date.now().toString() + Math.random().toString() };
          });
          setSubtitulos(prev => [...prev, ...subsAInsertar]);
        },
        limpiarSubtitulos: () => setSubtitulos([]),
        agregarLogo: (url: string, opciones?: { x?: number, y?: number, scale?: number, opacity?: number, inicioSec?: number, finSec?: number, fadeIn?: number, fadeOut?: number }) => {
          const nuevoLogo: LogoItem = {
             id: Date.now().toString() + Math.random().toString(),
             url,
             x: opciones?.x !== undefined ? opciones.x : 50,
             y: opciones?.y !== undefined ? opciones.y : 50,
             scale: opciones?.scale !== undefined ? opciones.scale : 1,
             opacity: opciones?.opacity !== undefined ? opciones.opacity : 1,
             inicioSec: opciones?.inicioSec,
             finSec: opciones?.finSec,
             fadeIn: opciones?.fadeIn,
             fadeOut: opciones?.fadeOut
          };
          setLogos(prev => [...prev, nuevoLogo]);
        },
        limpiar: async () => {
           return new Promise<void>((resolve) => {
               setLineaDeTiempo([]);
               setSubtitulos([]);
               setMotionTitles([]);
               setThreeRenderScenes([]);
               setLogos([]);
               setGlobalSettings({});
               setTimeout(() => {
                 sincronizarLineaDeTiempo([]);
                 resolve();
               }, 100);
           });
        }
  });

  const ejecutarScript = async () => {
    setIsScriptRunning(true);
    try {
      // Definir la API disponible en el script
      const NaylaEngine = getEngineContext();

      // Ejecutar el script ingresado de forma asíncrona usando el constructor AsyncFunction
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const execute = new AsyncFunction('NaylaEngine', codigoJsInput);
      await execute(NaylaEngine);

    } catch (e: any) {
      showAlert('Error en el script: ' + e.message);
      console.error('Script Error:', e);
    } finally {
      setIsScriptRunning(false);
    }
  };

  const handleExtraerDesdeEnlace = async () => {
    if (!enlaceInput) return;

    // Parsear los enlaces, separando por espacios, comas o saltos de línea
    const urlsBrutas = enlaceInput.split(/[\s,]+/).filter(u => u.trim() !== '');
    // Aceptar cualquier enlace HTTP o HTTPS
    const urls = urlsBrutas.filter(u => u.startsWith('http://') || u.startsWith('https://'));

    if (urls.length === 0) {
      showAlert('No se encontraron enlaces válidos (http:// o https://) en el texto.');
      return;
    }

    setExtrayendoVideo(true);

    // Inicializar estado de descargas
    const nuevasDescargas = urls.map((url, i) => ({
      id: `descarga-${Date.now()}-${i}`,
      url,
      status: 'procesando' as const
    }));

    setDescargasActivas(prev => [...prev, ...nuevasDescargas]);
    setEnlaceInput('');

    // Procesar en paralelo
    const promesas = urls.map((url, index) =>
      procesarEnlaceIndividual(url, index, nuevasDescargas[index].id)
    );

    await Promise.all(promesas);

    setExtrayendoVideo(false);

    // Limpiar descargas después de 3 segundos para que el usuario pueda ver el resultado final
    setTimeout(() => {
      setDescargasActivas(prev => prev.filter(d => nuevasDescargas.every(nd => nd.id !== d.id)));
    }, 3000);
  };

  const processVideo = async () => {
    const videoUrl = visualActivo?.tipo === 'video' ? visualActivo.url : mediaActivaUrl;
    if (!videoUrl) return showAlert('Selecciona un video de la Bóveda primero.');
    if (rects.length === 0) return showAlert('Dibuja al menos un recuadro sobre la marca de agua.');
    const currentSession = session || await getFirebaseSession();
    if (!currentSession) return showAlert('Debes iniciar sesión para procesar el video.');

    setIsProcessing(true);
    try {
      const res = await fetch('/api/clean-video', {
        method: 'POST',
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ videoUrl, coordenadas: rects })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setVideoResultadoUrl(data.url);
        setRects([]);
        showAlert('Supresión enviada al motor de nube.');
      } else {
        throw new Error(data.error || 'Fallo en el servidor');
      }
    } catch (err: any) {
      showAlert('Error: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (subTool !== 'delogo' || !mediaActivaUrl || !containerRef.current || resizingInfo || draggingInfo) return;
    const c = containerRef.current.getBoundingClientRect();
    setStartPos({ x: e.clientX - c.left, y: e.clientY - c.top });
    setIsDrawing(true);
    setCurrentRect({ id: Date.now().toString(), x: e.clientX - c.left, y: e.clientY - c.top, width: 0, height: 0 });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!mediaActivaUrl || !containerRef.current) return;
    const c = containerRef.current.getBoundingClientRect();
    const cx = Math.max(0, Math.min(e.clientX - c.left, c.width));
    const cy = Math.max(0, Math.min(e.clientY - c.top, c.height));
    if (isDrawing && currentRect) {
      setCurrentRect({ ...currentRect, x: Math.min(startPos.x, cx), y: Math.min(startPos.y, cy), width: Math.abs(cx - startPos.x), height: Math.abs(cy - startPos.y) });
    } else if (draggingInfo) {
      setRects(rects.map(r => r.id === draggingInfo.id ? { ...r, x: Math.max(0, Math.min(cx - draggingInfo.offsetX, c.width - r.width)), y: Math.max(0, Math.min(cy - draggingInfo.offsetY, c.height - r.height)) } : r));
    } else if (resizingInfo) {
      setRects(rects.map(r => {
        if (r.id !== resizingInfo.id) return r;
        let nx = r.x, ny = r.y, nw = r.width, nh = r.height;
        if (resizingInfo.corner.includes('e')) nw = Math.max(20, cx - r.x);
        if (resizingInfo.corner.includes('s')) nh = Math.max(20, cy - r.y);
        if (resizingInfo.corner.includes('w')) { const d = cx - r.x; nw = Math.max(20, r.width - d); if (nw > 20) nx = cx; }
        if (resizingInfo.corner.includes('n')) { const d = cy - r.y; nh = Math.max(20, r.height - d); if (nh > 20) ny = cy; }
        return { ...r, x: nx, y: ny, width: nw, height: nh };
      }));
    }
  };

  const handlePointerUp = () => {
    if (isDrawing && currentRect && currentRect.width > 10 && currentRect.height > 10) setRects([...rects, currentRect]);
    setIsDrawing(false); setCurrentRect(null); setResizingInfo(null); setDraggingInfo(null);
  };

  const removeRect = (id: string) => setRects(rects.filter(r => r.id !== id));




if (!session) {
    if (showIntro) {
      return (
        <div style={{ minHeight: '100vh', backgroundColor: '#000', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
          <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA" style={{ width: '150px', height: '150px', borderRadius: '24px', objectFit: 'cover', animation: 'fadeIn 1s ease-in-out' }} />
          <div style={{
            width: '30px',
            height: '30px',
            border: '3px solid #333',
            borderTop: '3px solid #fff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginTop: '20px'
          }} />
        </div>
      );
    }
    // Este editor no tiene login propio: si llegamos aquí es porque todavía
    // no se validó ningún token/sesión, o porque no había ninguno y estamos
    // a punto de mandar de vuelta al usuario al Home a iniciar sesión.
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' }}>
        <Head><title>NAYLA EDITOR</title></Head>
        <style>{editorGlobalStyles}</style>
        <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
        <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA" style={{ width: '120px', height: '120px', borderRadius: '24px', objectFit: 'cover', animation: 'fadeIn 0.6s ease-in-out' }} />
        <div style={{
          width: '30px',
          height: '30px',
          border: '3px solid #333',
          borderTop: '3px solid #fff',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginTop: '24px'
        }} />
        <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', letterSpacing: '1px', textTransform: authError ? 'none' : 'uppercase', color: authError ? '#ff4444' : '#888', whiteSpace: 'pre-line', textAlign: 'center', maxWidth: '90%', wordBreak: 'break-word' }}>
          {authError || 'Verificando acceso...'}
        </p>
      </div>
    );
  }

  return (
    <div className={`editor-shell h-full min-h-screen w-full flex flex-col overflow-x-hidden select-none ${darkMode ? 'bg-black text-gray-200' : 'bg-white text-gray-800'}`} style={{ fontFamily: 'system-ui, sans-serif' }}>



      <Head><title>NAYLA CORE</title></Head>
      <style>{editorGlobalStyles}</style>

      <header style={{
        display: isCleanMode ? 'none' : 'flex',
        borderBottom: '1px solid rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * 0.35))',
        padding: '0.5rem 0.75rem',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'var(--glass-bg)',
        backdropFilter: 'blur(var(--glass-blur))',
        WebkitBackdropFilter: 'blur(var(--glass-blur))',
        width: '100%',
        maxWidth: '100vw',
        boxSizing: 'border-box',
        zIndex: 100,
        position: 'relative'
      }}>
        {/* LADO IZQUIERDO: LOGO NAYLA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA" style={{ width: '36px', height: '36px', borderRadius: '10px', objectFit: 'cover' }} />
        </div>

        {/* LADO DERECHO: DESCARGAR Y PERFIL DE USUARIO */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', position: 'relative' }}>
          {/* BOTÓN Y TRAY DE DESCARGA */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setIsUserMenuOpen(false);
                const videos = galeriaMultimedia
                  .filter((item) => item.tipo === 'video')
                  .slice()
                  .sort((a, b) => new Date(b.creado_en || 0).getTime() - new Date(a.creado_en || 0).getTime());
                if (!videos.length) {
                  showAlert('Todavía no hay videos disponibles para descargar.');
                  return;
                }
                const currentUrl = videoResultadoUrl || mediaActivaUrl;
                const initial = videos.find((item) => item.url === currentUrl) || videos[0];
                setSelectedDownloadMediaId(initial.id);
                setDownloadRenameValue(initial.nombre || 'Nayla_Export.mp4');
                setDownloadTrayStep('list');
                setDownloadStatus(null);
                setIsDownloadMenuOpen(true);
              }}
              className="neon-btn nav-btn"
              style={{ padding: '6px 12px', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#111' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              DESCARGAR
            </button>


          </div>

          {/* BOTÓN Y PANEL DE PERFIL DE USUARIO / LOGIN */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => {
                setIsUserMenuOpen(!isUserMenuOpen);
                setIsDownloadMenuOpen(false);
              }}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: '1px solid #333',
                backgroundColor: '#111',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                overflow: 'hidden',
                padding: 0
              }}
              title={session?.user?.email || 'Usuario'}
            >
              {session?.user?.photoURL ? (
                <img src={session.user.photoURL} alt="Usuario" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              )}
            </button>

            {/* BANDEJA DESPLEGABLE DE PERFIL */}
            {isUserMenuOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                backgroundColor: 'var(--glass-bg)',
                backdropFilter: 'blur(var(--glass-blur))',
                WebkitBackdropFilter: 'blur(var(--glass-blur))',
                border: '1px solid rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * 0.6))',
                borderRadius: '12px',
                padding: '12px',
                minWidth: '200px',
                zIndex: 200,
                boxShadow: '0 10px 30px rgba(0,0,0,0.8), 0 0 var(--glow-spread) rgba(var(--glow-color-rgb), var(--glow-intensity))',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                {session?.user?.email && (
                  <div style={{
                    fontSize: '0.65rem',
                    color: '#00ffcc',
                    padding: '4px 6px',
                    backgroundColor: '#111',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    ● {session.user.email}
                  </div>
                )}
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    if (process.env.NEXT_PUBLIC_MAIN_SITE_URL) {
                      window.location.href = process.env.NEXT_PUBLIC_MAIN_SITE_URL;
                    }
                  }}
                  className="neon-btn nav-btn"
                  style={{ width: '100%', padding: '8px', fontSize: '0.7rem', fontWeight: 'bold' }}
                >
                  FUEGO 🔥
                </button>
                {session && (
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      signOutFirebase().then(() => setSession(null));
                    }}
                    className="neon-btn nav-btn"
                    style={{ width: '100%', padding: '8px', fontSize: '0.7rem', color: '#ff4444', borderColor: '#331111' }}
                  >
                    SALIR
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

            {/* BANDEJA NAYLA DE DESCARGA */}
            {isDownloadMenuOpen && (() => {
              const downloadVideos = galeriaMultimedia
                .filter((media) => media.tipo === 'video')
                .slice()
                .sort((a, b) => new Date(b.creado_en || 0).getTime() - new Date(a.creado_en || 0).getTime());
              const selectedItem = downloadVideos.find((media) => media.id === selectedDownloadMediaId) || downloadVideos[0] || null;
              const metadata = (selectedItem?.metadata || {}) as Record<string, any>;
              const width = Number(metadata.width) || null;
              const height = Number(metadata.height) || null;
              const duration = Number(metadata.durationInSeconds) || null;
              const bytes = Number(metadata.outputBytes) || null;
              const qualityLabel = height
                ? height >= 2160 ? '4K' : height >= 1920 ? '1080p' : height >= 1280 ? '720p' : height >= 854 ? '480p' : `${height}p`
                : 'VIDEO';

              return (
                <div
                  onClick={() => setIsDownloadMenuOpen(false)}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 320000,
                    background: 'rgba(0,0,0,.76)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    display: 'flex',
                    alignItems: isPhoneViewport ? 'flex-end' : 'center',
                    justifyContent: 'center',
                    padding: isPhoneViewport ? 0 : 18,
                  }}
                >
                  <div
                    onClick={(event) => event.stopPropagation()}
                    style={{
                      width: isPhoneViewport ? '100%' : 'min(520px, 94vw)',
                      maxHeight: isPhoneViewport ? '88dvh' : '86vh',
                      overflowY: 'auto',
                      borderRadius: isPhoneViewport ? '24px 24px 0 0' : 22,
                      border: '1px solid #2b2b2b',
                      background: 'linear-gradient(180deg, rgba(20,20,20,.98), rgba(6,6,6,.99))',
                      boxShadow: '0 -12px 55px rgba(0,0,0,.65)',
                      padding: '18px 18px calc(18px + env(safe-area-inset-bottom))',
                      color: '#fff',
                    }}
                  >
                    <div style={{ width: 42, height: 4, borderRadius: 999, background: '#3a3a3a', margin: '0 auto 16px' }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '0.64rem', letterSpacing: '1.2px', color: '#8d8d8d', fontWeight: 900 }}>NAYLA · DESCARGAS</div>
                        <div style={{ marginTop: 5, fontSize: '1rem', fontWeight: 900 }}>
                          {downloadTrayStep === 'list' ? 'Elige qué video quieres descargar' : 'Preparar video'}
                        </div>
                        <div style={{ marginTop: 4, color: '#737373', fontSize: '0.59rem' }}>
                          {downloadTrayStep === 'list'
                            ? `${downloadVideos.length} ${downloadVideos.length === 1 ? 'video disponible' : 'videos disponibles'}`
                            : 'Puedes renombrarlo, abrirlo en el editor o descargarlo ahora.'}
                        </div>
                      </div>
                      {downloadTrayStep === 'detail' && (
                        <button
                          type="button"
                          onClick={() => {
                            setDownloadTrayStep('list');
                            setDownloadStatus(null);
                          }}
                          style={{
                            marginLeft: 'auto',
                            marginRight: 6,
                            height: 36,
                            borderRadius: 10,
                            border: '1px solid #333',
                            background: '#111',
                            color: '#fff',
                            padding: '0 10px',
                            fontWeight: 800,
                            fontSize: '0.6rem',
                            cursor: 'pointer',
                          }}
                        >
                          ← VIDEOS
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label="Cerrar bandeja de descarga"
                        onClick={() => setIsDownloadMenuOpen(false)}
                        style={{ width: 36, height: 36, borderRadius: 11, border: '1px solid #333', background: '#111', color: '#fff', fontSize: 22, cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </div>

                    {downloadTrayStep === 'list' && (
                    <div style={{ marginTop: 15, display: 'grid', gap: 7, maxHeight: 360, overflowY: 'auto', paddingRight: 2 }}>
                      {downloadVideos.map((video) => {
                        const videoMetadata = (video.metadata || {}) as Record<string, any>;
                        const selected = video.id === selectedItem?.id;
                        const videoHeight = Number(videoMetadata.height) || 0;
                        const videoQuality = videoHeight >= 2160 ? '4K' : videoHeight >= 1920 ? '1080p' : videoHeight >= 1280 ? '720p' : videoHeight >= 854 ? '480p' : 'VIDEO';
                        const created = video.creado_en ? new Date(video.creado_en) : null;
                        return (
                          <button
                            key={video.id}
                            type="button"
                            onClick={() => {
                              setSelectedDownloadMediaId(video.id);
                              setDownloadRenameValue(video.nombre || 'Nayla_Export.mp4');
                              setDownloadTrayStep('detail');
                              setDownloadStatus(null);
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 11px',
                              borderRadius: 12,
                              border: selected ? '1px solid #fff' : '1px solid #292929',
                              background: selected ? '#181818' : '#0d0d0d',
                              color: '#fff',
                              cursor: 'pointer',
                              textAlign: 'left',
                              display: 'grid',
                              gridTemplateColumns: '42px 1fr auto',
                              gap: 10,
                              alignItems: 'center',
                            }}
                          >
                            <div style={{ width: 42, height: 54, borderRadius: 9, background: '#090909', border: '1px solid #303030', display: 'grid', placeItems: 'center' }}>
                              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="23 7 16 12 23 17 23 7" />
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                              </svg>
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '0.69rem', fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{video.nombre || 'Video sin nombre'}</div>
                              <div style={{ marginTop: 4, color: '#737373', fontSize: '0.55rem' }}>
                                {video.etiqueta || 'VIDEO'} · {videoQuality}
                                {created && !Number.isNaN(created.getTime()) ? ` · ${created.toLocaleDateString()}` : ''}
                              </div>
                            </div>
                            <div style={{
                              width: 18,
                              height: 18,
                              borderRadius: '50%',
                              border: selected ? '5px solid #fff' : '1px solid #555',
                              background: '#050505',
                              boxSizing: 'border-box',
                            }} />
                          </button>
                        );
                      })}
                    </div>
                    )}

                    {downloadTrayStep === 'detail' && selectedItem && (
                      <>
                        <div style={{ marginTop: 14, border: '1px solid #2a2a2a', borderRadius: 16, padding: 13, background: '#0d0d0d' }}>
                          <div style={{
                            width: '100%',
                            aspectRatio: width && height ? `${width} / ${height}` : '16 / 9',
                            maxHeight: 240,
                            borderRadius: 12,
                            overflow: 'hidden',
                            background: '#000',
                            border: '1px solid #222',
                            marginBottom: 12,
                          }}>
                            <video
                              src={selectedItem.url}
                              controls
                              playsInline
                              preload="metadata"
                              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                            />
                          </div>
                          <div style={{ fontSize: '0.55rem', color: '#777', letterSpacing: '.7px', fontWeight: 900 }}>NOMBRE DEL ARCHIVO</div>
                          <div style={{ display: 'flex', gap: 7, marginTop: 7 }}>
                            <input
                              value={downloadRenameValue}
                              onChange={(event) => setDownloadRenameValue(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') void renombrarVideoDescarga();
                              }}
                              maxLength={120}
                              style={{
                                minWidth: 0,
                                flex: 1,
                                height: 42,
                                borderRadius: 10,
                                border: '1px solid #303030',
                                background: '#080808',
                                color: '#fff',
                                padding: '0 11px',
                                outline: 'none',
                                fontSize: '0.68rem',
                              }}
                            />
                            <button
                              type="button"
                              disabled={downloadRenameBusy || !downloadRenameValue.trim()}
                              onClick={() => void renombrarVideoDescarga()}
                              style={{
                                minWidth: 82,
                                borderRadius: 10,
                                border: '1px solid #3a3a3a',
                                background: '#151515',
                                color: '#fff',
                                fontWeight: 850,
                                fontSize: '0.62rem',
                                cursor: downloadRenameBusy ? 'wait' : 'pointer',
                              }}
                            >
                              {downloadRenameBusy ? 'GUARDANDO…' : 'RENOMBRAR'}
                            </button>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginTop: 12 }}>
                            {[
                              ['CALIDAD', qualityLabel],
                              ['DURACIÓN', formatDownloadDuration(duration)],
                              ['TAMAÑO', formatDownloadBytes(bytes)],
                            ].map(([label, value]) => (
                              <div key={label} style={{ padding: '9px 7px', borderRadius: 10, background: '#141414', border: '1px solid #262626', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.5rem', color: '#666', fontWeight: 900, letterSpacing: '.7px' }}>{label}</div>
                                <div style={{ marginTop: 4, fontSize: '0.68rem', fontWeight: 850 }}>{value}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: 8, marginTop: 14 }}>
                          <button
                            type="button"
                            disabled={downloadBusy}
                            onClick={() => void editarVideoSeleccionadoDesdeDescargas()}
                            style={{
                              minHeight: 52,
                              borderRadius: 14,
                              border: '1px solid #343434',
                              background: '#111',
                              color: '#fff',
                              fontWeight: 900,
                              fontSize: '0.65rem',
                              cursor: downloadBusy ? 'not-allowed' : 'pointer',
                            }}
                          >
                            EDITAR EN EL EDITOR
                          </button>
                          <button
                            type="button"
                            disabled={downloadBusy}
                            onClick={() => void handleDescargar()}
                            style={{
                              minHeight: 52,
                              borderRadius: 14,
                              border: '1px solid #fff',
                              background: downloadBusy ? '#bdbdbd' : '#fff',
                              color: '#050505',
                              fontWeight: 950,
                              letterSpacing: '.35px',
                              cursor: downloadBusy ? 'wait' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 7,
                              fontSize: '0.64rem',
                            }}
                          >
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="7 10 12 15 17 10"/>
                              <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            {downloadBusy ? 'PREPARANDO…' : 'ACEPTAR Y DESCARGAR'}
                          </button>
                        </div>
                      </>
                    )}

                    {downloadStatus && (
                      <div style={{ marginTop: 9, textAlign: 'center', fontSize: '0.62rem', color: downloadStatus === 'Descarga iniciada' || downloadStatus === 'Nombre actualizado' ? '#fff' : '#8d8d8d' }}>
                        {downloadStatus}
                      </div>
                    )}

                    <div style={{ marginTop: 11, color: '#707070', fontSize: '0.57rem', lineHeight: 1.45, textAlign: 'center' }}>
                      Los videos solo se descargan desde esta bandeja. Elegir un video abre primero su ficha; nada se descarga por tocar el reproductor o una miniatura.
                    </div>
                  </div>
                </div>
              );
            })()}

      {/* CONTENEDOR PRINCIPAL DEL EDITOR */}
      <div
        className="flex-1 flex flex-col min-h-0 w-full relative overflow-hidden bg-black text-gray-200"
        style={isCleanMode ? { minHeight: '100dvh', height: '100dvh' } : undefined}
      >

        {/* SECCIÓN SUPERIOR: BARRA IZQUIERDA + PANEL FLOTANTE + PREVIEW DE VIDEO */}
        <div className="flex-1 min-h-0 flex w-full relative overflow-hidden">

          {/* 1. BARRA DE HERRAMIENTAS IZQUIERDA */}
          {!isCleanMode && (
            <div style={{
              width: '56px',
              flexShrink: 0,
              backgroundColor: '#050505',
              borderRight: '1px solid #1a1a1a',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '8px 3px',
              gap: '6px',
              zIndex: 40,
              overflowY: 'auto'
            }}>
              {visibleMainTools.map((tool) => {
                const isActive = mainNav === tool.id && isSubPanelOpen;
                return (
                  <button
                    key={tool.id}
                    className={`main-btn ${isActive ? 'active' : ''}`}
                    title={tool.nombre}
                    onClick={() => {
                      if (tool.id === 'generar' || tool.id === 'diagnostico') {
                        setMainNav(tool.id);
                        setIsSubPanelOpen(false);
                        setSubTool(null);
                        setToolMessage(null);
                        return;
                      }
                      if (mainNav === tool.id && isSubPanelOpen) {
                        setIsSubPanelOpen(false);
                      } else {
                        setMainNav(tool.id);
                        setIsSubPanelOpen(true);
                        setSubTool(SUB_TOOLS[tool.id]?.[0]?.id || null);
                        setToolMessage(null);
                      }
                    }}
                  >
                    <div>{tool.icon}</div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Tocar fuera del panel lateral cancela la selección del icono Home */}
          {isSubPanelOpen && !isCleanMode && (
            <button
              type="button"
              aria-label="Cerrar panel lateral"
              onClick={() => {
                setIsSubPanelOpen(false);
                setSubTool(null);
                setToolMessage(null);
              }}
              style={{
                position: 'absolute',
                left: '56px',
                top: 0,
                right: 0,
                bottom: 0,
                zIndex: 45,
                border: 'none',
                padding: 0,
                background: 'transparent',
                cursor: 'default',
              }}
            />
          )}

          {/* 2. PANEL FLOTANTE SOBREPUESTO DE OPCIONES / SUBHERRAMIENTAS */}
          {isSubPanelOpen && !isCleanMode && (
            <div style={{
              position: 'absolute',
              left: isCleanMode ? '12px' : '64px',
              top: '12px',
              bottom: '12px',
              width: 'min(360px, calc(100vw - 100px))',
              backgroundColor: 'var(--glass-bg)',
              backdropFilter: 'blur(var(--glass-blur))',
              WebkitBackdropFilter: 'blur(var(--glass-blur))',
              border: '1px solid rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * 0.6))',
              borderRadius: '16px',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              boxShadow: '0 12px 40px rgba(0,0,0,0.8), 0 0 var(--glow-spread) rgba(var(--glow-color-rgb), var(--glow-intensity))'
            }}>
              {/* Header del Panel Flotante */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                padding: '12px 16px',
                borderBottom: '1px solid #262626',
                backgroundColor: '#050505'
              }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#fff', letterSpacing: '1px' }}>
                  {mainNav.toUpperCase()}
                </span>
              </div>

              {/* Sub-herramientas (Cuadrícula Tipo App) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '12px 8px',
                padding: '16px 12px',
                borderBottom: '1px solid #1a1a1a',
                backgroundColor: '#0a0a0a',
                maxHeight: '280px',
                overflowY: 'auto'
              }}>
                {SUB_TOOLS[mainNav]?.map((tool) => {
                  if (tool.id === 'subir-vf') {
                    return (
                      <label key={tool.id} className="sub-btn">
                        <div className="icon-container">{tool.icon}</div>
                        <span>{subiendoArchivo ? `Subiendo ${vaultUploadProgress?.percent ?? 0}%` : tool.nombre}</span>
                        <input type="file" multiple accept="video/*,image/*" disabled={subiendoArchivo} onChange={(e) => handleSubirMultimedia(e, 'video')} style={{ display: 'none' }} />
                      </label>
                    );
                  }
                  if (tool.id === 'subir-a') {
                    return (
                      <label key={tool.id} className="sub-btn">
                        <div className="icon-container">{tool.icon}</div>
                        <span>{subiendoArchivo ? `Subiendo ${vaultUploadProgress?.percent ?? 0}%` : tool.nombre}</span>
                        <input type="file" multiple accept="audio/*" disabled={subiendoArchivo} onChange={(e) => handleSubirMultimedia(e, 'audio')} style={{ display: 'none' }} />
                      </label>
                    );
                  }
                  if (tool.id === 'subir-3d') {
                    return (
                      <label key={tool.id} className="sub-btn">
                        <div className="icon-container">{tool.icon}</div>
                        <span>{subiendo3d ? 'Subiendo…' : tool.nombre}</span>
                        <input
                          type="file"
                          accept=".glb,model/gltf-binary"
                          disabled={subiendo3d}
                          onChange={(e) => {
                            if (e.target.files?.length) void handleSubir3D(e.target.files);
                            e.currentTarget.value = '';
                          }}
                          style={{ display: 'none' }}
                        />
                      </label>
                    );
                  }
                  if (tool.isFilter) {
                    return (
                      <button key={tool.id} className={`sub-btn ${filtroGaleria === tool.filterValue ? 'active' : ''}`} onClick={() => setFiltroGaleria(tool.filterValue)}>
                        <div className="icon-container">
                          <span style={{ fontSize: '10px' }}>{tool.nombre.substring(0,2).toUpperCase()}</span>
                        </div>
                        <span>{tool.nombre}</span>
                      </button>
                    );
                  }
                  return (
                    <button key={tool.id} className={`sub-btn ${subTool === tool.id ? 'active' : ''}`} onClick={() => handleSubCarouselToolPress(tool)}>
                      <div className="icon-container">{tool.icon}</div>
                      <span>{tool.nombre}</span>
                    </button>
                  );
                })}
              </div>

              {/* Contenido Dinámico del Panel Flotante */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                {toolMessage ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#a3a3a3', fontSize: '0.9rem', letterSpacing: '1px' }}>{toolMessage}</div>
                ) : subTool && ['cristal', 'marco', 'delogo', 'script', 'supervisor', 'render', 'tema', 'vista'].includes(subTool) ? (
                  <div>
                    {subTool === 'cristal' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <p style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', margin: 0, letterSpacing: '0.5px' }}>
                          CRISTAL & LUZ (BORDER GLOW)
                        </p>

                        <div>
                          <label style={{ fontSize: '0.65rem', color: '#a3a3a3', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
                            COLOR DE LA LUZ DE BORDES
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                            {[
                              { name: 'Blanco Puro', hex: '#ffffff' },
                              { name: 'Cian Neón', hex: '#00f0ff' },
                              { name: 'Verde Esmeralda', hex: '#00ff66' },
                              { name: 'Púrpura Eléctrico', hex: '#b026ff' },
                              { name: 'Dorado Ámbar', hex: '#ffaa00' },
                              { name: 'Magenta Fuego', hex: '#ff007f' },
                              { name: 'Azul Real', hex: '#3b82f6' },
                            ].map((c) => (
                              <button
                                key={c.hex}
                                onClick={() => setGlowColor(c.hex)}
                                title={c.name}
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '50%',
                                  backgroundColor: c.hex,
                                  border: glowColor.toLowerCase() === c.hex.toLowerCase() ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                                  boxShadow: glowColor.toLowerCase() === c.hex.toLowerCase() ? `0 0 10px ${c.hex}` : 'none',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease'
                                }}
                              />
                            ))}
                            <div style={{ position: 'relative', width: '28px', height: '28px', borderRadius: '50%', overflow: 'hidden', border: '1px solid #555', cursor: 'pointer' }}>
                              <input
                                type="color"
                                value={glowColor}
                                onChange={(e) => setGlowColor(e.target.value)}
                                style={{
                                  position: 'absolute',
                                  top: '-50%',
                                  left: '-50%',
                                  width: '200%',
                                  height: '200%',
                                  cursor: 'pointer',
                                  border: 'none',
                                  padding: 0
                                }}
                                title="Seleccionar color personalizado"
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.65rem', color: '#a3a3a3', fontWeight: 'bold' }}>AMPLITUD DE LUZ</span>
                            <span style={{ fontSize: '0.65rem', color: '#fff', fontFamily: 'monospace' }}>{glowSpread}px</span>
                          </div>
                          <input
                            type="range"
                            min="4"
                            max="35"
                            value={glowSpread}
                            onChange={(e) => setGlowSpread(parseInt(e.target.value))}
                            style={{ width: '100%', accentColor: '#ffffff' }}
                          />
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.65rem', color: '#a3a3a3', fontWeight: 'bold' }}>INTENSIDAD DE LUZ</span>
                            <span style={{ fontSize: '0.65rem', color: '#fff', fontFamily: 'monospace' }}>{Math.round(glowIntensity * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="1.0"
                            step="0.05"
                            value={glowIntensity}
                            onChange={(e) => setGlowIntensity(parseFloat(e.target.value))}
                            style={{ width: '100%', accentColor: '#ffffff' }}
                          />
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.65rem', color: '#a3a3a3', fontWeight: 'bold' }}>DESENFOQUE DE CRISTAL</span>
                            <span style={{ fontSize: '0.65rem', color: '#fff', fontFamily: 'monospace' }}>{glassBlur}px</span>
                          </div>
                          <input
                            type="range"
                            min="4"
                            max="30"
                            value={glassBlur}
                            onChange={(e) => setGlassBlur(parseInt(e.target.value))}
                            style={{ width: '100%', accentColor: '#ffffff' }}
                          />
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span style={{ fontSize: '0.65rem', color: '#a3a3a3', fontWeight: 'bold' }}>OPACIDAD DE CRISTAL</span>
                            <span style={{ fontSize: '0.65rem', color: '#fff', fontFamily: 'monospace' }}>{Math.round(glassOpacity * 100)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0.2"
                            max="0.95"
                            step="0.05"
                            value={glassOpacity}
                            onChange={(e) => setGlassOpacity(parseFloat(e.target.value))}
                            style={{ width: '100%', accentColor: '#ffffff' }}
                          />
                        </div>

                        <button
                          onClick={() => {
                            setGlowColor('#ffffff');
                            setGlowSpread(12);
                            setGlowIntensity(0.4);
                            setGlassBlur(16);
                            setGlassOpacity(0.65);
                          }}
                          className="neon-btn nav-btn"
                          style={{ padding: '8px', fontSize: '0.65rem', marginTop: '4px' }}
                        >
                          Restablecer Cristal Predeterminado
                        </button>
                      </div>
                    )}
                    {subTool === 'tema' && (
                      <div>
                        <p style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', marginBottom: '1rem' }}>TEMA Y APARIENCIA</p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => setDarkMode(true)}
                            className="neon-btn nav-btn"
                            style={{ flex: 1, padding: '10px', backgroundColor: darkMode ? '#ffffff' : '#111', color: darkMode ? '#000' : '#fff' }}
                          >
                            Modo Oscuro
                          </button>
                          <button
                            onClick={() => setDarkMode(false)}
                            className="neon-btn nav-btn"
                            style={{ flex: 1, padding: '10px', backgroundColor: !darkMode ? '#ffffff' : '#111', color: !darkMode ? '#000' : '#fff' }}
                          >
                            Modo Claro
                          </button>
                        </div>
                      </div>
                    )}
                    {subTool === 'vista' && (
                      <div>
                        <p style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', marginBottom: '1rem' }}>MODO DE VISTA / DISPOSITIVO</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <button
                            onClick={() => setViewportOverride('auto')}
                            className="neon-btn nav-btn"
                            style={{ padding: '10px', backgroundColor: viewportOverride === 'auto' ? '#ffffff' : '#111', color: viewportOverride === 'auto' ? '#000' : '#fff' }}
                          >
                            Automático (Detectar pantalla)
                          </button>
                          <button
                            onClick={() => setViewportOverride('phone')}
                            className="neon-btn nav-btn"
                            style={{ padding: '10px', backgroundColor: viewportOverride === 'phone' ? '#ffffff' : '#111', color: viewportOverride === 'phone' ? '#000' : '#fff' }}
                          >
                            Modo Celular Forzado
                          </button>
                          <button
                            onClick={() => setViewportOverride('pc')}
                            className="neon-btn nav-btn"
                            style={{ padding: '10px', backgroundColor: viewportOverride === 'pc' ? '#ffffff' : '#111', color: viewportOverride === 'pc' ? '#000' : '#fff' }}
                          >
                            Modo Computadora Forzado
                          </button>
                        </div>
                      </div>
                    )}
                    {subTool === 'marco' && (
                      <div>
                        <p style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', marginBottom: '1rem' }}>MARCO — CUBRIR MARCA DE AGUA</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '1rem' }}>
                          {POSICIONES.map(pos => (
                            <button key={pos} className={`marco-pos-btn ${marcoConfig.posicion === pos ? 'selected' : ''}`} onClick={() => setMarcoConfig({ ...marcoConfig, posicion: pos })}>
                              {ICONOS_POS[pos]}<br /><span style={{ fontSize: '0.5rem', opacity: 0.7 }}>{pos}</span>
                            </button>
                          ))}
                        </div>
                        <p style={{ fontSize: '0.65rem', color: '#737373', marginBottom: '6px' }}>Grosor: {marcoConfig.grosor}px</p>
                        <input type="range" min="20" max="200" value={marcoConfig.grosor} onChange={(e) => setMarcoConfig({ ...marcoConfig, grosor: parseInt(e.target.value) })} style={{ width: '100%', marginBottom: '1rem', accentColor: '#fff' }} />
                        <button onClick={procesarImagenesConMarco} disabled={marcoProcesando} className="neon-btn nav-btn" style={{ width: '100%', backgroundColor: '#fff', color: '#000', fontWeight: 'bold' }}>
                          {marcoProcesando ? 'PROCESANDO...' : 'APLICAR A TODAS LAS FOTOS'}
                        </button>
                      </div>
                    )}
                    {subTool === 'delogo' && (
                      <div>
                        <p style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', marginBottom: '1rem' }}>SUPRESIÓN DE MARCA DE AGUA (DELOGO)</p>
                        <p style={{ fontSize: '0.7rem', color: '#a3a3a3', marginBottom: '1rem' }}>1. Selecciona un video de la Bóveda (R2).<br />2. Dibuja un rectángulo blanco sobre el logo.<br />3. Procesa en la nube.</p>
                        <button onClick={processVideo} disabled={isProcessing} className="neon-btn nav-btn" style={{ width: '100%' }}>
                          {isProcessing ? 'PROCESANDO...' : 'PROCESAR EN NUBE'}
                        </button>
                      </div>
                    )}
                    {subTool === 'script' && (
                      <div>
                        <p style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', marginBottom: '0.5rem' }}>SCRIPT MANUAL / PLANTILLAS</p>
                        <textarea value={codigoJsInput} onChange={(e) => setCodigoJsInput(e.target.value)} style={{ width: '100%', height: '100px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '8px', color: '#00ffcc', padding: '8px', fontFamily: 'monospace', outline: 'none', marginBottom: '0.8rem', resize: 'vertical', fontSize: '0.75rem' }} />
                        <button onClick={ejecutarScript} disabled={isScriptRunning} className="neon-btn nav-btn" style={{ width: '100%', backgroundColor: '#fff', color: '#000', fontWeight: 'bold' }}>
                          {isScriptRunning ? 'EJECUTANDO...' : 'EJECUTAR SCRIPT ▶'}
                        </button>
                      </div>
                    )}
                    {subTool === 'render' && (
                      <div>
                        <p style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', marginBottom: '0.5rem' }}>RENDERIZAR VIDEO</p>
                        <p style={{ fontSize: '0.7rem', color: '#737373', marginBottom: '0.75rem' }}>Clips en timeline: {lineaDeTiempo.length}</p>
                        <div style={{ marginBottom: '0.9rem' }}>
                          <p style={{ fontSize: '0.62rem', color: '#a3a3a3', fontWeight: 'bold', marginBottom: '6px', letterSpacing: '0.7px' }}>
                            CALIDAD DEL RENDER
                          </p>
                          <div style={{ display: 'grid', gap: '6px' }}>
                            {[
                              { value: '480p', label: 'Borrador · 480p', detail: 'Máxima velocidad · transiciones CPU ligeras' },
                              { value: '720p', label: 'Rápido · 720p', detail: 'Recomendado · transiciones optimizadas para CPU' },
                              { value: '1080p', label: 'Final · 1080p', detail: 'Efectos completos · tarda más' },
                            ].map((profile) => {
                              const selected = calidadExportacion === profile.value;
                              const dims = getCanvasDimensionsFromRatio(canvasRatio, profile.value);
                              return (
                                <button
                                  key={profile.value}
                                  type="button"
                                  onClick={() => setCalidadExportacion(profile.value)}
                                  disabled={isProcessing}
                                  style={{
                                    width: '100%',
                                    padding: '9px 10px',
                                    borderRadius: '9px',
                                    border: selected ? '1px solid #fff' : '1px solid #262626',
                                    backgroundColor: selected ? '#fff' : '#0b0b0b',
                                    color: selected ? '#000' : '#fff',
                                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                                    textAlign: 'left',
                                    opacity: isProcessing ? 0.65 : 1,
                                  }}
                                >
                                  <span style={{ display: 'block', fontSize: '0.68rem', fontWeight: 850 }}>{profile.label}</span>
                                  <span style={{ display: 'block', marginTop: '2px', fontSize: '0.58rem', opacity: 0.72 }}>
                                    {profile.detail} · {dims.width}×{dims.height}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <button onClick={async () => {
                          if (lineaDeTiempo.length === 0) return showAlert('Añade al menos un clip.');
                          setIsProcessing(true);
                          try {
                            const lineaValidada = await validarTimelineParaRender(lineaDeTiempo);
                            await solicitarRenderTimeline(lineaValidada);
                            setIsProcessing(false);
                          } catch (err: any) {
                            setIsProcessing(false);
                            showAlert('Error: ' + err.message);
                          }
                        }} disabled={isProcessing} className="neon-btn nav-btn" style={{ width: '100%', backgroundColor: '#fff', color: '#000', fontWeight: 'bold', padding: '10px' }}>
                          {isProcessing ? 'INICIANDO...' : 'INICIAR RENDER ▶'}
                        </button>
                      </div>
                    )}
                    {subTool === 'supervisor' && (
                      <div>
                        <p style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', marginBottom: '0.5rem' }}>SUPERVISOR IA</p>
                        <textarea value={iaPrompt} onChange={(e) => setIaPrompt(e.target.value)} placeholder="Describe la edición..." style={{ width: '100%', height: '70px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '8px', color: '#00ffcc', padding: '8px', fontFamily: 'monospace', outline: 'none', marginBottom: '0.8rem', resize: 'vertical', fontSize: '0.75rem' }} />
                        <button onClick={async () => {
                          if (!iaPrompt) return;
                          setIaLoading(true);
                          try {
                            const res = await fetch('/api/supervisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: iaPrompt, apiKey: iaApiKey, galeria: galeriaMultimedia }) });
                            const data = await res.json();
                            if (data.error) throw new Error(data.error);
                            const NaylaEngine = getEngineContext();
                            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                            const execute = new AsyncFunction('NaylaEngine', data.code);
                            await execute(NaylaEngine);
                            showAlert('Ejecución IA finalizada');
                          } catch (err: any) { showAlert("Error: " + err.message); }
                          finally { setIaLoading(false); }
                        }} disabled={iaLoading} className="neon-btn nav-btn" style={{ width: '100%', backgroundColor: '#fff', color: '#000', fontWeight: 'bold' }}>
                          {iaLoading ? 'PROCESANDO...' : 'GENERAR Y EJECUTAR 🤖'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : mainNav === 'redes' ? (
                  <div style={{ padding: 12, color: '#777', fontSize: '0.7rem' }}>
                    REDES abierto a pantalla completa.
                  </div>
                ) : mainNav === 'play' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 4px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 850, letterSpacing: '0.8px', color: '#fff' }}>
                      NAYLA PLAY
                    </div>
                    <div style={{ fontSize: '0.72rem', lineHeight: 1.6, color: '#a3a3a3' }}>
                      Mercado GPU de videojuegos abierto a pantalla completa.
                    </div>
                    <div style={{ border: '1px solid #2a2a2a', borderRadius: 12, padding: 12, background: '#080808', color: '#aaa', fontSize: '0.68rem' }}>
                      Consulta disponibilidad y precio Nayla sin alquilar ninguna máquina.
                    </div>
                  </div>
                ) : mainNav === 'pc' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '10px 4px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 850, letterSpacing: '0.8px', color: '#fff' }}>
                      NAYLA PC
                    </div>
                    <div style={{ fontSize: '0.72rem', lineHeight: 1.6, color: '#a3a3a3' }}>
                      Computadora en la nube abierta a pantalla completa.
                    </div>
                    <div style={{ border: '1px solid #2a2a2a', borderRadius: 12, padding: 12, background: '#080808', color: '#aaa', fontSize: '0.68rem' }}>
                      Configura sistema, CPU, RAM, disco, GPU y forma de uso antes de crear la máquina.
                    </div>
                  </div>
                ) : (
                  /* GALERÍA DE MEDIOS (BÓVEDA / BUSCAR) */
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                    {galeriaMultimedia
                      .filter(item => {
                        const isResult = isNaylaResultMedia(item);
                        if (mainNav === 'resultados' && !isResult) return false;
                        if (filtroGaleria === 'videos') return item.tipo === 'video';
                        if (filtroGaleria === 'fotos') return item.tipo === 'foto';
                        if (filtroGaleria === 'audios') return item.tipo === 'audio';
                        return true;
                      })
                      .map(item => (
                        <div key={item.id} className="neon-btn" style={{ padding: '8px', borderRadius: '10px', flexDirection: 'column', position: 'relative', justifyContent: 'space-between', width: '100%', minHeight: '110px' }}>
                          <span style={{ fontSize: '0.6rem', backgroundColor: '#262626', padding: '2px 4px', borderRadius: '4px', color: '#fff', fontWeight: 'bold' }}>{item.etiqueta}</span>
                          <button
                            type="button"
                            aria-label={`Opciones de ${item.nombre}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setMediaActionItem(item);
                              setMediaActionMode('menu');
                            }}
                            style={{
                              position: 'absolute',
                              top: 5,
                              right: 5,
                              width: 26,
                              height: 26,
                              borderRadius: '50%',
                              border: '1px solid #3b3b3b',
                              background: '#0b0b0b',
                              color: '#fff',
                              display: 'grid',
                              placeItems: 'center',
                              padding: 0,
                              cursor: 'pointer',
                              fontSize: 14,
                              lineHeight: 1,
                              zIndex: 2,
                              letterSpacing: 1,
                            }}
                          >
                            •••
                          </button>
                          <div
                            onClick={() => {
                              void agregarAlTimeline(item, { preventDuplicate: true });
                              if (item.tipo !== 'audio') setMediaActivaUrl(item.url);
                              if (item.tipo === 'video' && String(item.fuente || '').startsWith('render:')) {
                                setVideoResultadoUrl(item.url);
                                setVideoResultadoNombre(item.nombre);
                                setVideoResultadoEtiqueta(item.etiqueta || 'R');
                              } else {
                                setVideoResultadoUrl(null);
                                setVideoResultadoNombre(null);
                              }
                              if (item.tipo === 'video' && playerRef.current) {
                                const playPromise = playerRef.current.play();
                                if (playPromise !== undefined) playPromise.catch(() => {});
                                setIsPlaying(true);
                              }
                            }}
                            style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: '100%', cursor: 'pointer', margin: '8px 0' }}>
                            {item.tipo === 'video' && <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>}
                            {item.tipo === 'audio' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>}
                            {item.tipo === 'foto' && <img src={item.url} style={{ width: '100%', height: '36px', objectFit: 'contain', borderRadius: '4px' }} alt={item.nombre} />}
                            <span style={{ fontSize: '0.55rem', color: '#fff', textAlign: 'center', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{item.nombre}</span>
                          </div>
                          <button onClick={() => agregarAlTimeline(item)} style={{ padding: '4px', fontSize: '0.5rem', width: '100%', backgroundColor: '#fff', color: '#000', border: 'none', borderRadius: '100px', fontWeight: 'bold', cursor: 'pointer' }}>+ PISTA</button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. VISOR DE VIDEO PRINCIPAL (OCUPA TODO EL ESPACIO RESTANTE PEUADO A LOS ICONOS) */}
          <div
            ref={previewFullscreenRef}
            onPointerMove={resetPlaybackControlsTimer}
            data-testid="video-preview-container"
            style={{
              flex: isCleanMode ? 'none' : 1,
              width: isCleanMode
                ? (forceCssLandscapeFullscreen ? '100dvh' : '100dvw')
                : undefined,
              height: isCleanMode
                ? (forceCssLandscapeFullscreen ? '100dvw' : '100dvh')
                : '100%',
              position: isCleanMode ? 'fixed' : 'relative',
              inset: isCleanMode && !forceCssLandscapeFullscreen ? 0 : undefined,
              top: forceCssLandscapeFullscreen ? '50%' : undefined,
              left: forceCssLandscapeFullscreen ? '50%' : undefined,
              transform: forceCssLandscapeFullscreen
                ? 'translate(-50%, -50%) rotate(90deg)'
                : undefined,
              transformOrigin: 'center center',
              zIndex: isCleanMode ? 100000 : undefined,
              backgroundColor: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              cursor: 'pointer',
              touchAction: 'manipulation'
            }}
          >
            {mainNav === '3d' && (
              <div
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 60,
                  backgroundColor: '#000',
                  cursor: 'default'
                }}
              >
                <Model3DWorkspace
                  assets={modelos3d}
                  activeAssetId={modelo3dActivoId}
                  uploading={subiendo3d}
                  onSelect={(asset) => setModelo3dActivoId(asset.id)}
                  onUpload={(files) => void handleSubir3D(files)}
                  onDelete={(asset) => void handleEliminar3D(asset)}
                  onNaylaAction={(mode, prompt) => void handle3DNaylaAction(mode, prompt)}
                />
              </div>
            )}
            {mainNav === 'generar' && (
              <GenerarWorkspace
                session={session}
                projectId={activeProjectId}
                threadId={activeThreadId}
                onUseMedia={async (item) => {
                  const media = item as MediaItem;
                  setGaleriaMultimedia((prev) =>
                    prev.some((existing) => existing.id === media.id)
                      ? prev
                      : [...prev, media]
                  );
                  await agregarAlTimeline(media, { preventDuplicate: true });
                  showAlert('Resultado añadido a la Bóveda y a la línea de tiempo.');
                  setMainNav('boveda');
                  setIsSubPanelOpen(false);
                  setSubTool(null);
                }}
                mediaLibrary={galeriaMultimedia}
                selectedMediaIds={selectedMediaIds}
                threeDStudio={{
                  assets: modelos3d,
                  activeAssetId: modelo3dActivoId,
                  uploading: subiendo3d,
                  onSelect: (asset) => setModelo3dActivoId(asset.id),
                  onUpload: (files) => void handleSubir3D(files),
                  onDelete: (asset) => void handleEliminar3D(asset),
                  onNaylaAction: (mode, prompt) => void handle3DNaylaAction(mode, prompt),
                  onGenerated: (asset) => {
                    setModelos3d((prev) =>
                      prev.some((existing) => existing.id === asset.id)
                        ? prev
                        : [...prev, asset]
                    );
                    setModelo3dActivoId(asset.id);
                  },
                }}
                onClose={() => { setMainNav('boveda'); setIsSubPanelOpen(false); setSubTool(null); }}
              />
            )}
            <DiagnosticsClientReporter session={session} />
            {mainNav === 'diagnostico' && diagnosticsAdmin && session && (
              <DiagnosticsWorkspace
                session={session}
                onClose={() => { setMainNav('boveda'); setIsSubPanelOpen(false); setSubTool(null); }}
              />
            )}
            {/* BOTÓN FLOTANTE DE NAYLA */}
            {!isCleanMode && (
              <button
                aria-label="Abrir Nayla"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAiModalOpen(true);
                }}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  zIndex: 35,
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  border: '2px solid #f4f4f4',
                  backgroundColor: '#050505',
                  padding: 0,
                  display: 'grid',
                  placeItems: 'center',
                  cursor: 'pointer',
                  color: '#fff',
                  boxShadow: '0 4px 18px rgba(0,0,0,0.65)',
                }}
              >
                <img
                  src="/assets/imagenes/Icono-intro.jpeg"
                  alt="Nayla"
                  style={{ width: '34px', height: '34px', borderRadius: '50%', objectFit: 'cover', filter: 'grayscale(1)' }}
                />
              </button>
            )}

            {/* VIDEO O CANVAS PRINCIPAL */}
            <div
              ref={containerRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={(event) => {
                handlePointerUp();
                handleVideoSurfaceTap(event);
              }}
              onPointerLeave={handlePointerUp}
              style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', touchAction: 'manipulation' }}
            >
              {(visualActivo || videoResultadoUrl || mediaActivaUrl) ? (
                <>
                  {visualActivo?.tipo === 'foto' && !videoResultadoUrl ? (
                    <img
                      key={visualActivo.url}
                      src={visualActivo.url}
                      alt={visualActivo.nombre || 'Imagen activa'}
                      style={{ width: '100%', height: '100%', objectFit: phoneVideoObjectFit, backgroundColor: '#000', maxWidth: '100%', maxHeight: '100%', touchAction: 'manipulation' }}
                      onLoad={(e) => {
                        const image = e.currentTarget;
                        if (image.naturalWidth && image.naturalHeight) {
                          const detected = buildMediaMetadata(image.naturalWidth, image.naturalHeight);
                          setSourceVideoRatio(image.naturalWidth / image.naturalHeight);
                          setVideoMetadata({ width: image.naturalWidth, height: image.naturalHeight });
                          if (!visualActivo.metadata?.aspectRatioLabel && pistaVideo.length <= 1) {
                            adoptarFormatoVisual(detected);
                          }
                        }
                      }}
                    />
                  ) : (
                    <video
                      key={videoResultadoUrl || visualActivo?.url || mediaActivaUrl || 'video-preview'}
                      src={videoResultadoUrl || visualActivo?.url || mediaActivaUrl || ''}
                      style={{ width: '100%', height: '100%', objectFit: phoneVideoObjectFit, backgroundColor: '#000', maxWidth: '100%', maxHeight: '100%', touchAction: 'manipulation' }}
                      controls={false}
                      playsInline
                      muted={false}
                      ref={playerRef as any}
                      onEnded={handleVideoEnded}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onTimeUpdate={(e) => syncPlaybackClockFromVideo(e.currentTarget)}
                      onDurationChange={(e) => {
                        const duration = e.currentTarget.duration;
                        if (Number.isFinite(duration) && duration > 0) {
                          setNativePlaybackDurationSeconds(duration);
                        }
                      }}
                      onLoadedMetadata={(e) => {
                        const video = e.currentTarget;
                        if (Number.isFinite(video.duration) && video.duration > 0) {
                          setNativePlaybackDurationSeconds(video.duration);
                        }
                        if (video.videoWidth && video.videoHeight) {
                          const detected = buildMediaMetadata(video.videoWidth, video.videoHeight, Number.isFinite(video.duration) ? video.duration : undefined);
                          setSourceVideoRatio(video.videoWidth / video.videoHeight);
                          setVideoMetadata({ width: video.videoWidth, height: video.videoHeight });
                          if (!visualActivo?.metadata?.aspectRatioLabel && pistaVideo.length <= 1 && !videoResultadoUrl) {
                            adoptarFormatoVisual(detected);
                          }
                        }

                        if (pendingPlaybackSeekRef.current !== null) {
                          const target = Math.min(
                            Number.isFinite(video.duration) ? video.duration : pendingPlaybackSeekRef.current,
                            Math.max(0, pendingPlaybackSeekRef.current)
                          );
                          video.currentTime = target;
                          pendingPlaybackSeekRef.current = null;
                        }

                        syncPlaybackClockFromVideo(video);

                        if (resumePlaybackAfterSourceChangeRef.current) {
                          resumePlaybackAfterSourceChangeRef.current = false;
                          const playPromise = video.play();
                          if (playPromise !== undefined) {
                            playPromise.catch(error => console.log('Autoplay prevented:', error));
                          }
                        }
                      }}
                    />
                  )}

                  {!videoResultadoUrl && rects.map((r) => (
                    <div key={r.id} onPointerDown={(e) => { e.stopPropagation(); if (!containerRef.current) return; const c = containerRef.current.getBoundingClientRect(); setDraggingInfo({ id: r.id, offsetX: (e.clientX - c.left) - r.x, offsetY: (e.clientY - c.top) - r.y }); }}
                      style={{ position: 'absolute', left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px`, border: '1px solid #fff', backgroundColor: 'rgba(255,255,255,0.1)', pointerEvents: 'auto', cursor: 'move', borderRadius: '8px' }}>
                      <div onPointerDown={(e) => { e.stopPropagation(); removeRect(r.id); }} style={{ position: 'absolute', top: '-10px', right: '-10px', width: '20px', height: '20px', backgroundColor: '#fff', color: '#000', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold', zIndex: 10 }}>✕</div>
                      <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'se' }); }} style={{ position: 'absolute', bottom: '-6px', right: '-6px', width: '12px', height: '12px', backgroundColor: '#fff', cursor: 'nwse-resize', zIndex: 10, borderRadius: '50%' }} />
                    </div>
                  ))}
                  {currentRect && isDrawing && <div style={{ position: 'absolute', left: `${currentRect.x}px`, top: `${currentRect.y}px`, width: `${currentRect.width}px`, height: `${currentRect.height}px`, border: '1px dashed #fff', pointerEvents: 'none', borderRadius: '8px' }} />}
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
                  {!isCleanMode && (
                    <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA" style={{ width: '80px', height: '80px', borderRadius: '16px', opacity: 0.4, filter: 'grayscale(100%)' }} />
                  )}
                </div>
              )}
            </div>

            {/* REPRODUCTOR FLOTANTE. En pantalla completa queda solo el control básico abajo. */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                bottom: isCleanMode ? 'max(12px, env(safe-area-inset-bottom))' : '12px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 30,
                border: '1px solid rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * 0.6))',
                borderRadius: '999px',
                backgroundColor: 'var(--glass-bg)',
                backdropFilter: 'blur(var(--glass-blur))',
                WebkitBackdropFilter: 'blur(var(--glass-blur))',
                padding: '5px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5), 0 0 var(--glow-spread) rgba(var(--glow-color-rgb), var(--glow-intensity))',
                transition: 'opacity 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease',
                opacity: isCleanMode
                  ? (showPlaybackControls ? 1 : 0)
                  : ((showPlaybackControls || !isPlaying) ? 1 : 0),
                pointerEvents: isCleanMode
                  ? (showPlaybackControls ? 'auto' : 'none')
                  : ((showPlaybackControls || !isPlaying) ? 'auto' : 'none')
              }}
            >
              <span style={{ color: '#c4c4c4', fontSize: '0.68rem', fontFamily: 'monospace', minWidth: '54px', textAlign: 'right' }}>
                {formatPlaybackClock(playbackPositionSeconds)}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: isCleanMode ? '18px' : '12px' }}>
                <button onClick={(e) => { e.stopPropagation(); seekBy(-10); }} style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '0.9rem', cursor: 'pointer', outline: 'none' }}>↺10</button>
                <button
                  aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                  onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    border: '1px solid #fff',
                    background: '#fff',
                    color: '#050505',
                    cursor: 'pointer',
                    outline: 'none',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 0,
                    flex: '0 0 34px',
                  }}
                >
                  {isPlaying ? (
                    <svg width="13" height="15" viewBox="0 0 13 15" aria-hidden="true">
                      <rect x="1" y="1" width="4" height="13" rx="1" fill="currentColor" />
                      <rect x="8" y="1" width="4" height="13" rx="1" fill="currentColor" />
                    </svg>
                  ) : (
                    <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
                      <path d="M2 1.6 12.5 8 2 14.4Z" fill="currentColor" />
                    </svg>
                  )}
                </button>
                <button onClick={(e) => { e.stopPropagation(); seekBy(10); }} style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '0.9rem', cursor: 'pointer', outline: 'none' }}>10↻</button>
              </div>
              <span style={{ color: '#c4c4c4', fontSize: '0.68rem', fontFamily: 'monospace', minWidth: '54px' }}>
                {formatPlaybackClock(playbackTotalSeconds)}
              </span>
            </div>
          </div>
        </div>

        {/* SECCIÓN INFERIOR: LÍNEA DE TIEMPO Y TRACKS */}
        <div style={{
          display: (isCleanMode || mainNav === '3d') ? 'none' : 'flex',
          height: '76px',
          flexShrink: 0,
          backgroundColor: '#050505',
          borderTop: '1px solid #1a1a1a',
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
          padding: '4px 0',
          overflow: 'hidden'
        }} onClick={() => setClipSeleccionado(null)}>
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', backgroundColor: '#fff', zIndex: 50, pointerEvents: 'none', boxShadow: '0 0 10px rgba(255,255,255,0.8)' }} />
          {!videoResultadoUrl && (
            <div
              className="neon-btn"
              onClick={(e) => { e.stopPropagation(); setMainNav('boveda'); setIsSubPanelOpen(true); }}
              style={{ position: 'absolute', left: 8, top: 8, width: '36px', height: '44px', borderRadius: '8px', zIndex: 60, borderStyle: 'dashed', cursor: 'pointer', fontSize: '1.2rem' }}
            >
              +
            </div>
          )}
          <div className="timeline-track" ref={timelineRef}
            onScroll={(e) => {
              if (!isUserScrolling) return;
              const scrollPos = e.currentTarget.scrollLeft;
              seekPlaybackToSeconds(scrollPos / 20);
            }}
            onPointerDown={() => setIsUserScrolling(true)}
            onPointerUp={() => { setTimeout(() => setIsUserScrolling(false), 50); }}
            onPointerLeave={() => { setTimeout(() => setIsUserScrolling(false), 50); }}
            style={{ paddingLeft: '50%', paddingRight: '50%' }}
            onClick={(e) => e.stopPropagation()}>
            {videoResultadoUrl ? (
              <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setClipSeleccionado(null);
                  setMediaActivaUrl(videoResultadoUrl);
                }}
                style={{
                  minWidth: 180,
                  height: 48,
                  borderRadius: 10,
                  border: '1px solid #3d3d3d',
                  background: '#101010',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '0 12px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <span style={{
                  flex: '0 0 auto',
                  border: '1px solid #fff',
                  borderRadius: 7,
                  padding: '3px 7px',
                  fontSize: '0.72rem',
                  fontWeight: 850,
                }}>
                  {videoResultadoEtiqueta || 'R'}
                </span>
                <span style={{
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}>
                  {videoResultadoNombre || 'Resultado Nayla'}
                </span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setVideoResultadoUrl(null);
                  setVideoResultadoNombre(null);
                  setVideoResultadoEtiqueta(null);
                  setIsPlaying(false);
                  setMediaActivaUrl(pistaVideo[0]?.url || null);
                }}
                style={{
                  height: 38,
                  padding: '0 12px',
                  borderRadius: 999,
                  border: '1px solid #303030',
                  background: '#0a0a0a',
                  color: '#aaa',
                  fontSize: '0.67rem',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                EDITAR
              </button>
              </>
            ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={pistaVideo.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                {pistaVideo.map((clip) => (
                  <SortableTimelineItem
                    key={clip.id}
                    id={clip.id}
                    clip={clip}
                    isSelected={clipSeleccionado === clip.id}
                    onSelect={() => {
                      setClipSeleccionado(clip.id);
                      setMediaActivaUrl(clip.url);
                      setVideoResultadoUrl(null);
                      setVideoResultadoNombre(null);
                      setVideoResultadoEtiqueta(null);
                      pendingPlaybackSeekRef.current = 0;
                      resumePlaybackAfterSourceChangeRef.current = false;
                      setPlaybackPositionSeconds(getVisualClipStartSeconds(pistaVideo, clip.id));
                    }}
                    onRemove={() => quitarDelTimeline(clip.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
            )}
          </div>

          {!videoResultadoUrl && (
          <div style={{ display: 'flex', alignItems: 'center', height: '22px', overflowX: 'auto', padding: '0 50%', gap: '2px', marginTop: '4px' }} onClick={(e) => e.stopPropagation()}>
            {pistaAudio.map((clip) => (
              <div key={clip.id} onClick={() => setClipSeleccionado(clip.id)} className="audio-block neon-btn" style={{ borderColor: clipSeleccionado === clip.id ? '#fff' : '#404040' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                {clip.etiqueta}
              </div>
            ))}
          </div>
          )}
        </div>

      </div>

      {isSubPanelOpen && mainNav === 'redes' && !isCleanMode && (
        <SocialHub
          session={session}
          projectId={activeProjectId}
          results={galeriaMultimedia.filter((item) => (item.tipo === 'video' || item.tipo === 'foto') && isNaylaResultMedia(item))}
          onResultsUploaded={(items) => {
            setGaleriaMultimedia((previous) => {
              const map = new Map(previous.map((item) => [item.id, item]));
              items.forEach((item: any) => map.set(item.id, item));
              return Array.from(map.values());
            });
          }}
          onClose={() => {
            setIsSubPanelOpen(false);
            setSubTool(null);
          }}
        />
      )}

      {isSubPanelOpen && mainNav === 'play' && !isCleanMode && (
        <NaylaPlay
          session={session}
          onClose={() => {
            setIsSubPanelOpen(false);
            setSubTool(null);
          }}
        />
      )}

      {isSubPanelOpen && mainNav === 'pc' && !isCleanMode && (
        <NaylaPc
          session={session}
          onClose={() => {
            setIsSubPanelOpen(false);
            setSubTool(null);
          }}
        />
      )}

      {pendingRenderQualityChoice && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 300000,
          background: 'rgba(0,0,0,0.82)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          display: 'grid',
          placeItems: 'center',
          padding: 16,
        }}>
          <div style={{
            width: 'min(560px, 100%)',
            maxHeight: 'calc(100dvh - 32px)',
            overflowY: 'auto',
            borderRadius: 18,
            border: '1px solid #303030',
            background: '#080808',
            boxShadow: '0 24px 80px rgba(0,0,0,.72)',
            padding: 16,
            color: '#fff',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: '0.78rem', letterSpacing: '1px', fontWeight: 900 }}>CALIDAD DEL RENDER</div>
                <div style={{ marginTop: 5, fontSize: '0.68rem', color: '#a3a3a3', lineHeight: 1.5 }}>
                  Elige antes de iniciar. Más resolución significa más detalle, pero también más tiempo y cómputo.
                </div>
              </div>
              <button
                type="button"
                onClick={cancelarSeleccionCalidadRender}
                aria-label="Cancelar render"
                style={{ border: '1px solid #333', background: '#111', color: '#fff', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', flex: '0 0 auto' }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              {[
                { value: '480p', title: 'Borrador · 480p', use: 'Revisar cortes, tiempos y subtítulos', compute: 'Consumo bajo', detail: 'Transiciones CPU ligeras · máxima velocidad', enabled: true },
                { value: '720p', title: 'Rápido · 720p', use: 'Pruebas y publicación rápida en redes', compute: 'Consumo medio', detail: 'Transiciones optimizadas para CPU · recomendado', enabled: true },
                { value: '1080p', title: 'Final · 1080p', use: 'Exportación final con mayor detalle', compute: 'Consumo alto', detail: 'Efectos completos · usa el Sandbox CPU actual y tarda más', enabled: true },
                { value: '4k', title: 'Ultra · 4K', use: 'Máxima resolución', compute: 'Consumo muy alto', detail: 'Requiere cómputo superior/GPU y tarifa propia', enabled: false },
              ].map((profile) => {
                const ratio = pendingRenderQualityChoice.ratioOverride || canvasRatio;
                const dims = getCanvasDimensionsFromRatio(ratio, profile.value);
                const suggested = (pendingRenderQualityChoice.suggestedQuality || '720p').toLowerCase() === profile.value;
                const selected = renderQualitySelection === profile.value;
                return (
                  <button
                    key={profile.value}
                    type="button"
                    disabled={!profile.enabled}
                    onClick={() => profile.enabled && setRenderQualitySelection(profile.value)}
                    style={{
                      width: '100%',
                      padding: '12px 13px',
                      borderRadius: 12,
                      border: selected ? '2px solid #fff' : suggested ? '1px solid #666' : '1px solid #2b2b2b',
                      background: selected ? '#f2f2f2' : suggested ? '#151515' : '#0d0d0d',
                      color: selected ? '#050505' : '#fff',
                      textAlign: 'left',
                      cursor: profile.enabled ? 'pointer' : 'not-allowed',
                      opacity: profile.enabled ? 1 : 0.5,
                    }}
                  >
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.76rem' }}>{profile.title}</strong>
                      <span style={{ fontSize: '0.58rem', border: '1px solid #333', borderRadius: 999, padding: '3px 7px', color: '#bdbdbd' }}>
                        {profile.enabled ? profile.compute : 'PRÓXIMAMENTE'}
                      </span>
                    </span>
                    <span style={{ display: 'block', marginTop: 5, fontSize: '0.64rem', color: '#c8c8c8' }}>
                      {dims.width}×{dims.height} · {profile.use}
                    </span>
                    <span style={{ display: 'block', marginTop: 3, fontSize: '0.6rem', color: '#777' }}>{profile.detail}</span>
                    {selected && profile.enabled ? (
                      <span style={{ display: 'inline-block', marginTop: 7, fontSize: '0.56rem', fontWeight: 900, letterSpacing: '0.6px' }}>
                        SELECCIONADA
                      </span>
                    ) : suggested && profile.enabled ? (
                      <span style={{ display: 'inline-block', marginTop: 7, fontSize: '0.56rem', fontWeight: 850, letterSpacing: '0.6px' }}>
                        RECOMENDADA · TOCA PARA ELEGIR
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={!renderQualitySelection}
              onClick={() => renderQualitySelection && void confirmarCalidadRender(renderQualitySelection)}
              style={{
                width: '100%',
                minHeight: 48,
                marginTop: 12,
                borderRadius: 12,
                border: renderQualitySelection ? '1px solid #fff' : '1px solid #292929',
                background: renderQualitySelection ? '#fff' : '#141414',
                color: renderQualitySelection ? '#050505' : '#666',
                fontWeight: 900,
                letterSpacing: '0.5px',
                cursor: renderQualitySelection ? 'pointer' : 'not-allowed',
              }}
            >
              {renderQualitySelection
                ? `INICIAR RENDER · ${renderQualitySelection.toUpperCase()}`
                : 'ELIGE UNA CALIDAD PARA CONTINUAR'}
            </button>

            <div style={{ marginTop: 12, padding: '10px 11px', borderRadius: 10, background: '#0d0d0d', border: '1px solid #252525', color: '#8d8d8d', fontSize: '0.6rem', lineHeight: 1.5 }}>
              1080p todavía no alquila una máquina mayor: usa el motor CPU actual y consume más tiempo. 4K se habilitará cuando el editor tenga conectado un perfil de cómputo superior con su coste real.
            </div>
          </div>
        </div>
      )}

      {/* 4. MODAL / OVERLAY PANTALLA COMPLETA DE NAYLA IA */}
      {isAiModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9900,
          backgroundColor: 'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
          border: '1px solid rgba(255,255,255,0.18)',
          boxShadow: '0 0 18px rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: 'column',
          width: '100dvw',
          height: '100dvh',
          maxHeight: '100dvh',
          boxSizing: 'border-box',
          overflow: 'hidden'
        }}>
          {/* Header Modal IA */}
          <style>{`
            @keyframes naylaWorkSpin {
              to { transform: rotate(360deg); }
            }
            @keyframes naylaJobSweep {
              0% { transform: translateX(-120%); }
              100% { transform: translateX(320%); }
            }
          `}</style>
          <div style={{
            minHeight: '66px',
            padding: '10px 12px',
            borderBottom: '1px solid #1f1f1f',
            backgroundColor: '#070707',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            position: 'relative',
            zIndex: 45,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
              <div
                aria-label={naylaIsWorking ? 'Nayla está trabajando' : 'Nayla lista'}
                style={{
                  width: 46,
                  height: 46,
                  flex: '0 0 46px',
                  borderRadius: '50%',
                  position: 'relative',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <span style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  border: '2px solid rgba(255,255,255,0.24)',
                  borderTopColor: naylaIsWorking ? '#fff' : 'rgba(255,255,255,0.82)',
                  borderRightColor: naylaIsWorking ? '#fff' : 'rgba(255,255,255,0.82)',
                  animation: naylaIsWorking ? 'naylaWorkSpin 0.85s linear infinite' : 'none',
                }} />
                <img
                  src="/assets/imagenes/Icono-intro.jpeg"
                  alt="Nayla"
                  style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', filter: 'grayscale(1)' }}
                />
              </div>

              <NaylaEngineBar
                session={session}
                mode={naylaEngineMode}
                onModeChange={setNaylaEngineMode}
                codeTrace={naylaCodeTrace}
                compact
              />
            </div>

            <button
              type="button"
              aria-label="Cerrar Nayla"
              onClick={() => {
                setProjectMenuOpen(false);
                setChatAttachMenuOpen(false);
                setIsAiModalOpen(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                width: '30px',
                height: '30px',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                fontSize: '25px',
                fontWeight: 300,
                lineHeight: 1,
                padding: 0,
                flex: '0 0 30px',
              }}
            >
              ×
            </button>
          </div>

          <NaylaProjectMenu
            open={projectMenuOpen}
            projects={projects}
            activeProjectId={activeProjectId}
            threads={chatThreads}
            activeThreadId={activeThreadId}
            assets={chatChannelAssets}
            attachedIds={chatAttachmentIds}
            uploadingKind={channelUploadingKind}
            onSelectProject={(projectId) => void seleccionarProyectoDesdeChat(projectId)}
            onSelectThread={(threadId) => void seleccionarChatDesdeHistorial(threadId)}
            onRenameThread={(threadId, title) => void renombrarChat(threadId, title)}
            onRenameProject={(projectId, name) => void renombrarProyecto(projectId, name)}
            onNewChat={() => void crearNuevoChat()}
            onNewProject={() => void crearNuevoProyecto()}
            onUpload={(kind, files) => void subirArchivosDesdeCanal(kind, files)}
            onToggleAttachment={toggleChatAttachment}
            onViewProject={() => {
              setProjectMenuOpen(false);
              setIsAiModalOpen(false);
            }}
            onDeleteProject={() => void eliminarProyectoActivo()}
          />

          {/* Toggle Fast / Pro */}
          <div style={{ padding: '10px 20px', backgroundColor: '#050505', borderBottom: '1px solid #1a1a1a', display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setSelectedAiProvider('groq')}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '8px',
                border: '1px solid #333',
                backgroundColor: selectedAiProvider === 'groq' ? '#222' : 'transparent',
                color: selectedAiProvider === 'groq' ? '#fff' : '#888',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Nayla Fast
            </button>
            <button
              onClick={() => setSelectedAiProvider('mistral')}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '8px',
                border: '1px solid #333',
                backgroundColor: selectedAiProvider === 'mistral' ? '#222' : 'transparent',
                color: selectedAiProvider === 'mistral' ? '#fff' : '#888',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Nayla Pro
            </button>
          </div>

          {/* Chat Messages Body */}
          <div
            ref={chatMessagesRef}
            data-no-edge-swipe
            onScroll={(event) => {
              const element = event.currentTarget;
              const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
              chatAutoFollowRef.current = distanceFromBottom < 120;
            }}
            style={{ flex: 1, minWidth: 0, minHeight: 0, padding: '16px 14px', overflowX: 'hidden', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px', overscrollBehavior: 'contain' }}
          >
            {chatMessages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#666', marginTop: '40px', fontSize: '0.95rem' }}>
                Hola, soy Nayla. ¿En qué puedo ayudarte hoy?
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'stretch',
                  backgroundColor: msg.role === 'user' ? '#202020' : 'transparent',
                  color: '#fff',
                  padding: msg.role === 'user' ? '10px 13px' : '2px 2px',
                  borderRadius: msg.role === 'user' ? '18px' : 0,
                  maxWidth: msg.role === 'user' ? '88%' : '100%',
                  width: msg.role === 'user' ? 'auto' : '100%',
                  minWidth: 0,
                  overflow: 'visible',
                  border: msg.role === 'user' ? '1px solid #303030' : 'none',
                  fontSize: '0.95rem',
                  lineHeight: '1.55'
                }}>
                  {msg.text ? <SelectableChatText text={msg.text} clean={msg.role === 'ai'} /> : null}
                  {msg.editorReview && <NaylaEditorReview plan={msg.editorReview} busy={editorPlanBusy || chatProcessing} onDecision={(decision) => void decideEditorPlan(msg.editorReview!.id, decision)} />}
                  {msg.attachments?.length ? (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: msg.attachments.length > 1 ? 'repeat(2, minmax(0, 1fr))' : '1fr',
                      gap: 8,
                      marginTop: msg.text ? 9 : 0,
                    }}>
                      {msg.attachments.map((asset) => (
                        <div
                          key={asset.id}
                          style={{
                            minWidth: 0,
                            border: '1px solid #343434',
                            borderRadius: 11,
                            overflow: 'hidden',
                            background: '#090909',
                          }}
                        >
                          {asset.tipo === 'foto' && asset.url ? (
                            <img
                              src={asset.url}
                              alt={asset.nombre}
                              style={{ width: '100%', height: 92, objectFit: 'cover', display: 'block', background: '#000' }}
                            />
                          ) : asset.tipo === 'video' && asset.url ? (
                            <video
                              src={asset.url}
                              muted
                              playsInline
                              preload="metadata"
                              style={{ width: '100%', height: 92, objectFit: 'cover', display: 'block', background: '#000' }}
                            />
                          ) : (
                            <div style={{
                              height: 72,
                              display: 'grid',
                              placeItems: 'center',
                              background: '#070707',
                              color: '#d8d8d8',
                              fontSize: 22,
                            }}>
                              {asset.tipo === 'audio' ? '♪' : asset.tipo === 'documento' ? 'DOC' : '◇'}
                            </div>
                          )}
                          <div style={{ padding: '7px 8px', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{
                                flex: '0 0 auto',
                                border: '1px solid #555',
                                borderRadius: 6,
                                padding: '1px 5px',
                                fontSize: '0.62rem',
                                fontWeight: 850,
                                color: '#fff',
                              }}>
                                {asset.etiqueta || '—'}
                              </span>
                              <span style={{
                                minWidth: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: '#aaa',
                                fontSize: '0.66rem',
                              }}>
                                {asset.nombre}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {msg.renderTask && (
                    <div style={{
                      marginTop: 10,
                      padding: 11,
                      border: '1px solid #303030',
                      borderRadius: 12,
                      background: '#080808',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                        <div style={{ fontSize: '0.73rem', fontWeight: 800, letterSpacing: '0.06em', color: '#f4f4f4' }}>
                          NAYLA RENDER
                        </div>
                        <div style={{ fontSize: '0.65rem', color: '#8b8b8b', whiteSpace: 'nowrap' }}>
                          {msg.renderTask.status === 'completed'
                            ? 'LISTO'
                            : msg.renderTask.status === 'failed'
                              ? 'INTERRUMPIDO'
                              : msg.renderTask.status === 'cancelled'
                                ? 'CANCELADO'
                                : `${Math.round((msg.renderTask.progress || 0) * 100)}%`}
                        </div>
                      </div>

                      <div style={{ color: '#bdbdbd', fontSize: '0.75rem', marginTop: 7 }}>
                        {msg.renderTask.phase}
                      </div>

                      {!['failed', 'cancelled'].includes(msg.renderTask.status) && (
                        <div style={{
                          height: 6,
                          borderRadius: 999,
                          background: '#171717',
                          border: '1px solid #292929',
                          overflow: 'hidden',
                          marginTop: 9,
                        }}>
                          <div style={{
                            height: '100%',
                            width: `${Math.max(2, Math.round((msg.renderTask.progress || 0) * 100))}%`,
                            background: '#f1f1f1',
                            borderRadius: 999,
                            transition: 'width 260ms ease',
                          }} />
                        </div>
                      )}

                      {msg.renderTask.framesTotal && !['failed', 'cancelled'].includes(msg.renderTask.status) && (
                        <div style={{ color: '#777', fontSize: '0.67rem', marginTop: 7 }}>
                          Fotogramas: {Math.min(msg.renderTask.framesDone || 0, msg.renderTask.framesTotal)} / {msg.renderTask.framesTotal}
                        </div>
                      )}

                      {msg.renderTask.status === 'failed' && (
                        <div style={{
                          marginTop: 9,
                          padding: '8px 9px',
                          borderRadius: 9,
                          border: '1px solid #333',
                          color: '#aaa',
                          fontSize: '0.72rem',
                          lineHeight: 1.4,
                        }}>
                          {msg.renderTask.error || 'No se pudo completar el procesamiento en este intento.'}
                        </div>
                      )}

                      {!['completed', 'failed', 'cancelled'].includes(msg.renderTask.status) && msg.renderTask.requestId && (
                        <button
                          type="button"
                          onClick={() => void cancelRenderTask(msg.renderTask!)}
                          style={{
                            marginTop: 10,
                            border: '1px solid #3b3b3b',
                            borderRadius: 9,
                            background: 'transparent',
                            color: '#c8c8c8',
                            padding: '7px 10px',
                            fontSize: '0.7rem',
                            fontWeight: 750,
                            cursor: 'pointer',
                          }}
                        >
                          CANCELAR
                        </button>
                      )}

                      {msg.renderTask.status === 'completed' && msg.renderTask.outputUrl && (
                        <button
                          type="button"
                          onClick={() => openRenderResult(msg.renderTask!)}
                          style={{
                            marginTop: 10,
                            width: '100%',
                            padding: 0,
                            border: '1px solid #383838',
                            borderRadius: 11,
                            overflow: 'hidden',
                            background: '#050505',
                            color: '#fff',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <video
                            src={msg.renderTask.outputUrl}
                            muted
                            playsInline
                            preload="metadata"
                            style={{
                              width: '100%',
                              maxHeight: 190,
                              display: 'block',
                              objectFit: 'contain',
                              background: '#000',
                              pointerEvents: 'none',
                            }}
                          />
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 8,
                            padding: '9px 10px',
                          }}>
                            <span style={{ minWidth: 0, fontSize: '0.73rem', fontWeight: 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {msg.renderTask.galleryItem?.nombre || 'Nayla_Render.mp4'}
                            </span>
                            <span style={{ flex: '0 0 auto', color: '#888', fontSize: '0.67rem' }}>Bóveda · Abrir</span>
                          </div>
                        </button>
                      )}
                    </div>
                  )}
                  {msg.actionPlan && (
                    <div style={{ marginTop: '10px', padding: '10px', border: '1px solid #2b2b2b', borderRadius: '10px', backgroundColor: '#080808' }}>
                      <div style={{ color: '#f2f2f2', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                        {msg.actionPlan.action.replaceAll('_', ' ')}
                      </div>
                      <div style={{ color: '#999', marginTop: '4px', fontSize: '0.78rem' }}>
                        Motor: {msg.actionPlan.engine === 'nayla-compute' ? 'Nayla Compute' : 'Nayla Cloud'}
                      </div>
                      {!['completed', 'failed', 'cancelled', 'expired', 'awaiting_confirmation', 'planned'].includes(String(msg.actionPlan.status || '')) && (
                        <div style={{
                          height: 5,
                          borderRadius: 999,
                          background: '#171717',
                          border: '1px solid #292929',
                          overflow: 'hidden',
                          marginTop: 9,
                        }}>
                          <div style={{
                            width: '32%',
                            height: '100%',
                            background: '#eee',
                            borderRadius: 999,
                            animation: 'naylaJobSweep 1.15s ease-in-out infinite',
                          }} />
                        </div>
                      )}
                      {msg.actionPlan.mediaJobId && (
                        <div style={{ marginTop: '7px', display: 'grid', gap: '7px', color: '#777', fontSize: '0.7rem' }}>
                          <span>Estado: {String(msg.actionPlan.status || 'awaiting_confirmation').toUpperCase()}</span>
                          {msg.actionPlan.status === 'awaiting_confirmation' && (
                            <button
                              type="button"
                              onClick={() => void confirmCloudJob(msg.actionPlan!.mediaJobId!)}
                              disabled={cloudExecutingIds.includes(msg.actionPlan.mediaJobId)}
                              style={{
                                border: '1px solid #ddd',
                                borderRadius: 8,
                                background: cloudExecutingIds.includes(msg.actionPlan.mediaJobId) ? '#333' : '#f1f1f1',
                                color: cloudExecutingIds.includes(msg.actionPlan.mediaJobId) ? '#aaa' : '#050505',
                                padding: '7px 10px',
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                cursor: cloudExecutingIds.includes(msg.actionPlan.mediaJobId) ? 'wait' : 'pointer',
                              }}
                            >
                              {cloudExecutingIds.includes(msg.actionPlan.mediaJobId)
                                ? 'INICIANDO…'
                                : 'GENERAR CON NAYLA CLOUD'}
                            </button>
                          )}
                          {msg.actionPlan.status === 'completed' && msg.actionPlan.outputUrl && (
                            <span style={{ color: '#aaa' }}>Resultado guardado en Bóveda.</span>
                          )}
                        </div>
                      )}
                      {msg.actionPlan.gpuJobId && (
                        <div style={{ marginTop: '7px', display: 'grid', gap: '3px', color: '#777', fontSize: '0.7rem' }}>
                          <span>Estado: {String(msg.actionPlan.status || 'queued').toUpperCase()}</span>
                          {msg.actionPlan.gpuName && <span>GPU: {msg.actionPlan.gpuName}</span>}
                          {Number.isFinite(msg.actionPlan.hourlyPrice) && (
                            <span>Tarifa: ~${Number(msg.actionPlan.hourlyPrice).toFixed(3)}/h</span>
                          )}
                          {Number.isFinite(msg.actionPlan.estimatedMaxCost) && (
                            <span>Tope estimado del trabajo: ~${Number(msg.actionPlan.estimatedMaxCost).toFixed(3)}</span>
                          )}
                          {Number.isFinite(msg.actionPlan.runtimeCostEstimate) && (
                            <span>Uso estimado: ~${Number(msg.actionPlan.runtimeCostEstimate).toFixed(4)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {msg.cards?.length ? (
                    <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {msg.cards.map((card) => (
                        <div key={card.id} style={{ border: '1px solid #2b2b2b', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#080808' }}>
                          {card.previewUrl && (
                            <img
                              src={card.previewUrl}
                              alt={card.title || 'Resultado de Nayla'}
                              loading="lazy"
                              style={{ width: '100%', maxHeight: '190px', objectFit: 'cover', display: 'block' }}
                            />
                          )}
                          <div style={{ padding: '10px' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {card.title || `${card.provider} ${card.kind}`}
                            </div>
                            <div style={{ color: '#888', fontSize: '0.72rem', marginTop: '3px' }}>
                              {card.provider.toUpperCase()}{card.creator ? ` · ${card.creator}` : ''}{card.durationSeconds ? ` · ${Math.round(card.durationSeconds)}s` : ''}
                            </div>
                            {card.licenseName && (
                              <div style={{ color: '#666', fontSize: '0.68rem', marginTop: '3px' }}>
                                {card.licenseName}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: '6px', marginTop: '9px', flexWrap: 'wrap' }}>
                              <button
                                onClick={() => window.open(card.sourceUrl, '_blank', 'noopener,noreferrer')}
                                style={{ padding: '6px 9px', borderRadius: '7px', border: '1px solid #333', background: '#111', color: '#ddd', fontSize: '0.7rem', cursor: 'pointer' }}
                              >
                                VER
                              </button>
                              <button
                                onClick={() => importStockCard(card, false).catch((error) => showAlert(error.message || 'No se pudo guardar.'))}
                                disabled={stockImportingId === card.id || !card.mediaUrl}
                                style={{ padding: '6px 9px', borderRadius: '7px', border: '1px solid #333', background: '#151515', color: '#fff', fontSize: '0.7rem', cursor: stockImportingId === card.id ? 'wait' : 'pointer', opacity: !card.mediaUrl ? 0.45 : 1 }}
                              >
                                {stockImportingId === card.id ? 'GUARDANDO…' : 'GUARDAR'}
                              </button>
                              <button
                                onClick={() => importStockCard(card, true).catch((error) => showAlert(error.message || 'No se pudo usar.'))}
                                disabled={stockImportingId === card.id || !card.mediaUrl}
                                style={{ padding: '6px 9px', borderRadius: '7px', border: 'none', background: '#f2f2f2', color: '#050505', fontWeight: 700, fontSize: '0.7rem', cursor: stockImportingId === card.id ? 'wait' : 'pointer', opacity: !card.mediaUrl ? 0.45 : 1 }}
                              >
                                USAR
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
            {(chatProcessing || toolMessage) && (
              <div style={{
                alignSelf: 'stretch',
                color: '#f2f2f2',
                padding: '10px 2px 2px',
                fontSize: '0.82rem',
                fontStyle: 'italic',
              }}>
                <div>{toolMessage || naylaCodeTrace?.label || 'Nayla está pensando…'}</div>
                <div style={{
                  height: 5,
                  borderRadius: 999,
                  background: '#171717',
                  border: '1px solid #292929',
                  overflow: 'hidden',
                  marginTop: 8,
                }}>
                  <div style={{
                    width: '32%',
                    height: '100%',
                    background: '#eee',
                    borderRadius: 999,
                    animation: 'naylaJobSweep 1.15s ease-in-out infinite',
                  }} />
                </div>
              </div>
            )}
          </div>

          {chatUploadProgress && (
            <div style={{
              padding: '7px 12px',
              borderTop: '1px solid #1f1f1f',
              background: '#080808',
              color: '#aaa',
              fontSize: 11,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
            }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {chatUploadProgress.phase === 'registering'
                  ? 'Guardando en Bóveda'
                  : chatUploadProgress.phase === 'finalizing'
                    ? 'Preparando timeline'
                    : 'Subiendo'} {chatUploadProgress.currentFile || 'archivos'}… {chatUploadProgress.percent}%
              </span>
              <span>{chatUploadProgress.done}/{chatUploadProgress.total}{chatUploadProgress.failed ? ` · ${chatUploadProgress.failed} error${chatUploadProgress.failed === 1 ? '' : 'es'}` : ''}</span>
            </div>
          )}

          {chatAttachedAssets.length > 0 && (
            <div style={{
              borderTop: '1px solid #1f1f1f',
              backgroundColor: '#080808',
            }}>
              <div style={{
                padding: '6px 12px 0',
                color: '#777',
                fontSize: 10,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
              }}>
                <span>Adjuntos del próximo mensaje</span>
                <span>{chatAttachedAssets.length}/{CHAT_ATTACHMENT_LIMIT}</span>
              </div>
              <div style={{
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                padding: '9px 12px 7px',
              }}>
              {chatAttachedAssets.map((asset) => (
                <div
                  key={asset.id}
                  style={{
                    position: 'relative',
                    flex: '0 0 auto',
                    width: 66,
                    height: 66,
                    border: '1px solid #3a3a3a',
                    borderRadius: 12,
                    overflow: 'visible',
                    background: '#111',
                  }}
                >
                  {asset.tipo === 'foto' && asset.url ? (
                    <img
                      src={asset.url}
                      alt={asset.nombre}
                      style={{ width: '100%', height: '100%', borderRadius: 11, objectFit: 'cover', display: 'block' }}
                    />
                  ) : asset.tipo === 'video' && asset.url ? (
                    <video
                      src={asset.url}
                      muted
                      playsInline
                      preload="metadata"
                      style={{ width: '100%', height: '100%', borderRadius: 11, objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', borderRadius: 11, display: 'grid', placeItems: 'center', color: '#ddd', fontSize: 12 }}>
                      {asset.tipo === 'audio' ? 'AUDIO' : asset.tipo === 'documento' ? 'DOC' : '3D'}
                    </div>
                  )}

                  <span style={{
                    position: 'absolute',
                    left: 5,
                    bottom: 5,
                    padding: '1px 5px',
                    borderRadius: 6,
                    background: 'rgba(0,0,0,0.78)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 800,
                  }}>
                    {asset.etiqueta || '—'}
                  </span>

                  <button
                    type="button"
                    aria-label={`Quitar ${asset.nombre}`}
                    onClick={() => toggleChatAttachment(asset)}
                    style={{
                      position: 'absolute',
                      top: -7,
                      right: -7,
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: '1px solid #555',
                      background: '#1c1c1c',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: 17,
                      lineHeight: '20px',
                      padding: 0,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
              </div>
            </div>
          )}

          {/* Chat Input */}
          <input
            ref={chatDirectUploadRef}
            type="file"
            accept="image/*,video/*,audio/*,.pdf,.txt,.md,.markdown,.csv,.json,.rtf,.doc,.docx,application/pdf,text/*,application/json,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            hidden
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              event.currentTarget.value = '';
              if (files.length) void uploadFilesIntoChat(files);
            }}
          />
          <div style={{
            padding: '12px 12px max(12px, env(safe-area-inset-bottom))',
            borderTop: '1px solid #1a1a1a',
            backgroundColor: '#0a0a0a',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
            boxSizing: 'border-box',
            width: '100%',
            maxWidth: '100vw',
            flexShrink: 0,
            position: 'relative',
            zIndex: 20
          }}>
            <textarea
              ref={chatInputRef}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (chatInput.trim() && !chatProcessing && !chatUploadProgress) {
                    void sendNaylaMessage();
                  }
                }
              }}
              rows={isPhoneViewport ? 2 : 1}
              placeholder="Escribe tu mensaje…"
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: isPhoneViewport ? 66 : 46,
                maxHeight: 190,
                padding: '11px 13px',
                backgroundColor: '#111',
                border: '1px solid #333',
                borderRadius: '18px',
                color: '#fff',
                outline: 'none',
                fontSize: '16px',
                lineHeight: 1.42,
                boxSizing: 'border-box',
                resize: 'none',
                overflowY: 'hidden',
                fontFamily: 'inherit',
                userSelect: 'text',
                WebkitUserSelect: 'text',
                transition: 'height 90ms ease-out',
              }}
            />
            {chatAttachMenuOpen && (
              <>
                <button
                  type="button"
                  aria-label="Cerrar menú de adjuntos"
                  onClick={() => setChatAttachMenuOpen(false)}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 19,
                    border: 0,
                    background: 'transparent',
                    padding: 0,
                  }}
                />
                <div style={{
                  position: 'absolute',
                  left: 12,
                  bottom: 'calc(100% + 6px)',
                  zIndex: 21,
                  width: 'min(300px, calc(100vw - 24px))',
                  padding: 7,
                  borderRadius: 14,
                  border: '1px solid #343434',
                  background: '#0a0a0a',
                  boxShadow: '0 16px 42px rgba(0,0,0,.72)',
                  display: 'grid',
                  gap: 6,
                }}>
                  <button
                    type="button"
                    disabled={Boolean(chatUploadProgress)}
                    onClick={() => {
                      setChatAttachMenuOpen(false);
                      chatDirectUploadRef.current?.click();
                    }}
                    style={{
                      minHeight: 44,
                      border: '1px solid #343434',
                      borderRadius: 10,
                      background: '#f1f1f1',
                      color: '#050505',
                      textAlign: 'left',
                      padding: '9px 11px',
                      fontWeight: 800,
                      cursor: chatUploadProgress ? 'wait' : 'pointer',
                    }}
                  >
                    Subir fotos, videos, audios o documentos
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setChatAttachMenuOpen(false);
                      setProjectMenuOpen(true);
                    }}
                    style={{
                      minHeight: 42,
                      border: '1px solid #303030',
                      borderRadius: 10,
                      background: '#111',
                      color: '#eee',
                      textAlign: 'left',
                      padding: '9px 11px',
                      cursor: 'pointer',
                    }}
                  >
                    Elegir archivos del proyecto
                  </button>
                </div>
              </>
            )}
            <button
              type="button"
              aria-label="Adjuntar archivos"
              onClick={() => {
                setProjectMenuOpen(false);
                setChatAttachMenuOpen((value) => !value);
              }}
              style={{
                width: 42,
                height: 42,
                flex: '0 0 42px',
                alignSelf: 'flex-end',
                borderRadius: '50%',
                border: chatAttachMenuOpen ? '1px solid #f1f1f1' : '1px solid #3a3a3a',
                background: chatAttachMenuOpen ? '#f1f1f1' : '#111',
                color: chatAttachMenuOpen ? '#050505' : '#f1f1f1',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                fontSize: 25,
                fontWeight: 300,
                lineHeight: 1,
                padding: 0,
              }}
            >
              +
            </button>
            <button
              onClick={() => void sendNaylaMessage()}
              disabled={chatProcessing || Boolean(chatUploadProgress) || !chatInput.trim()}
              style={{
                height: 46,
                padding: '0 16px',
                alignSelf: 'flex-end',
                backgroundColor: (chatProcessing || chatUploadProgress || !chatInput.trim()) ? '#333' : '#f2f2f2',
                color: (chatProcessing || chatUploadProgress || !chatInput.trim()) ? '#888' : '#000',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 'bold',
                cursor: (chatProcessing || chatUploadProgress || !chatInput.trim()) ? 'not-allowed' : 'pointer',
                flexShrink: 0,
                fontSize: '0.85rem'
              }}
            >
              ENVIAR
            </button>
          </div>
        </div>
      )}

<GpuQuoteModal
        quote={gpuQuote}
        sourceName={gpuQuoteSource?.nombre}
        title={gpuQuoteUi?.title}
        description={gpuQuoteUi?.description}
        confirmLabel={gpuQuoteUi?.confirmLabel}
        confirming={gpuQuoteConfirming}
        onCancel={() => {
          if (gpuQuoteConfirming) return;
          setGpuQuote(null);
          setGpuQuoteSource(null);
          setGpuQuoteRequest(null);
          setGpuQuoteUi(null);
        }}
        onConfirm={(selectionId) => void confirmGpuQuote(selectionId)}
      />

{mediaActionItem && (
        <div
          data-no-edge-swipe
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100120,
            background: 'rgba(0,0,0,0.78)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: 14,
            boxSizing: 'border-box',
          }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && !mediaActionBusy) {
              setMediaActionItem(null);
              setMediaActionMode('menu');
            }
          }}
        >
          <div style={{
            width: 'min(460px, 100%)',
            background: '#090909',
            border: '1px solid #383838',
            borderRadius: 20,
            padding: 16,
            color: '#fff',
            boxShadow: '0 24px 70px rgba(0,0,0,0.75)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 42,
                height: 42,
                borderRadius: 11,
                border: '1px solid #303030',
                background: '#111',
                display: 'grid',
                placeItems: 'center',
                overflow: 'hidden',
                flex: '0 0 auto',
              }}>
                {mediaActionItem.tipo === 'foto' ? (
                  <img src={mediaActionItem.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : mediaActionItem.tipo === 'video' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><polygon points="5,3 19,12 5,21"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                )}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, color: '#888', letterSpacing: '0.14em', fontWeight: 800 }}>
                  {isNaylaResultMedia(mediaActionItem) ? 'RESULTADO NAYLA' : 'ARCHIVO DEL PROYECTO'}
                </div>
                <div style={{ marginTop: 3, fontSize: 15, fontWeight: 750, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {mediaActionItem.nombre}
                </div>
                <div style={{ marginTop: 2, fontSize: 11, color: '#777' }}>
                  {mediaActionItem.etiqueta || '—'}
                </div>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={mediaActionBusy}
                onClick={() => {
                  setMediaActionItem(null);
                  setMediaActionMode('menu');
                }}
                style={{ border: 'none', background: 'transparent', color: '#fff', fontSize: 26, cursor: 'pointer', padding: 2 }}
              >
                ×
              </button>
            </div>

            {mediaActionMode === 'menu' ? (
              <div style={{ display: 'grid', gap: 9, marginTop: 16 }}>
                <button
                  type="button"
                  disabled={mediaActionBusy}
                  onClick={() => {
                    if (mediaActionItem.tipo === 'video') {
                      setSelectedDownloadMediaId(mediaActionItem.id);
                      setDownloadRenameValue(mediaActionItem.nombre || 'Nayla_Export.mp4');
                      setDownloadTrayStep('detail');
                      setDownloadStatus(null);
                      setMediaActionItem(null);
                      setIsDownloadMenuOpen(true);
                      return;
                    }
                    void descargarIndividual(mediaActionItem.url, mediaActionItem.nombre, mediaActionItem.tipo);
                    setMediaActionItem(null);
                  }}
                  style={{
                    width: '100%',
                    minHeight: 48,
                    borderRadius: 13,
                    border: '1px solid #efefef',
                    background: '#f4f4f4',
                    color: '#050505',
                    fontWeight: 850,
                    cursor: 'pointer',
                  }}
                >
                  {mediaActionItem.tipo === 'video' ? 'ABRIR EN DESCARGAS' : 'DESCARGAR'}
                </button>
                <button
                  type="button"
                  disabled={mediaActionBusy}
                  onClick={() => setMediaActionMode('delete')}
                  style={{
                    width: '100%',
                    minHeight: 48,
                    borderRadius: 13,
                    border: '1px solid #3a3a3a',
                    background: '#111',
                    color: '#fff',
                    fontWeight: 800,
                    cursor: 'pointer',
                  }}
                >
                  ELIMINAR
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 17 }}>
                <div style={{ fontSize: 15, lineHeight: 1.45, fontWeight: 700 }}>
                  ¿Eliminar este archivo?
                </div>
                <div style={{ marginTop: 6, color: '#929292', fontSize: 12, lineHeight: 1.45 }}>
                  Se quitará de tu proyecto y de tu almacenamiento privado. Esta acción no se puede deshacer.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 16 }}>
                  <button
                    type="button"
                    disabled={mediaActionBusy}
                    onClick={() => setMediaActionMode('menu')}
                    style={{
                      minHeight: 46,
                      borderRadius: 12,
                      border: '1px solid #333',
                      background: '#101010',
                      color: '#ddd',
                      fontWeight: 750,
                      cursor: mediaActionBusy ? 'wait' : 'pointer',
                    }}
                  >
                    VOLVER
                  </button>
                  <button
                    type="button"
                    disabled={mediaActionBusy}
                    onClick={() => void eliminarMediaIndividual(mediaActionItem)}
                    style={{
                      minHeight: 46,
                      borderRadius: 12,
                      border: '1px solid #f0f0f0',
                      background: '#f4f4f4',
                      color: '#050505',
                      fontWeight: 900,
                      cursor: mediaActionBusy ? 'wait' : 'pointer',
                      opacity: mediaActionBusy ? 0.55 : 1,
                    }}
                  >
                    {mediaActionBusy ? 'ELIMINANDO…' : 'SÍ, ELIMINAR'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

{directConfirm && (
        <div
          data-no-edge-swipe
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.84)',
            zIndex: 100200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 18,
            boxSizing: 'border-box',
          }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setDirectConfirm(null);
          }}
        >
          <div style={{
            width: 'min(430px, 100%)',
            background: '#090909',
            border: '1px solid #3a3a3a',
            borderRadius: 18,
            padding: '20px 18px 18px',
            color: '#fff',
            boxShadow: '0 24px 70px rgba(0,0,0,0.76)',
          }}>
            <div style={{ fontSize: '0.98rem', fontWeight: 850, letterSpacing: '0.03em' }}>
              INDICACIONES DIRECTAS DETECTADAS
            </div>
            <div style={{ color: '#9a9a9a', fontSize: '0.78rem', lineHeight: 1.5, marginTop: 9 }}>
              Este bloque puede saltarse la planificación por IA y pasar directamente a validación del timeline.
            </div>

            <div style={{
              marginTop: 13,
              padding: '10px 11px',
              border: '1px solid #262626',
              borderRadius: 12,
              background: '#050505',
              color: '#d8d8d8',
              fontSize: '0.72rem',
              lineHeight: 1.45,
            }}>
              <div style={{ color: '#777', fontSize: '0.62rem', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Archivos anclados
              </div>
              {chatAttachedAssets.length
                ? chatAttachedAssets.map((asset) => asset.etiqueta || asset.nombre).join(' · ')
                : 'Ninguno'}
            </div>

            <div style={{ color: '#bdbdbd', fontSize: '0.82rem', marginTop: 14, lineHeight: 1.5 }}>
              ¿Quieres utilizar estas indicaciones directamente?
            </div>

            <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => {
                  const pending = directConfirm.message;
                  setDirectConfirm(null);
                  setChatInput('');
                  resetChatComposerHeight();
                  void sendNaylaMessage(pending, { directMode: true, bypassDirectConfirm: true });
                }}
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 11,
                  background: '#f1f1f1',
                  color: '#050505',
                  padding: '10px 12px',
                  fontSize: '0.78rem',
                  fontWeight: 850,
                  cursor: 'pointer',
                }}
              >
                SÍ · USAR DIRECTO
              </button>
              <button
                type="button"
                onClick={() => {
                  const normalMessage = directConfirm.message.replace(/^\s*@direct\b\s*/i, '').trim();
                  setDirectConfirm(null);
                  setChatInput('');
                  resetChatComposerHeight();
                  if (normalMessage) void sendNaylaMessage(normalMessage, { directMode: false, bypassDirectConfirm: true });
                }}
                style={{
                  border: '1px solid #333',
                  borderRadius: 11,
                  background: '#111',
                  color: '#ddd',
                  padding: '10px 12px',
                  fontSize: '0.76rem',
                  fontWeight: 750,
                  cursor: 'pointer',
                }}
              >
                NO · ENVIAR COMO CHAT NORMAL
              </button>
              <button
                type="button"
                onClick={() => setDirectConfirm(null)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#777',
                  padding: '7px 10px',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

{projectDialog && (
        <div
          data-no-edge-swipe
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.82)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 18,
            boxSizing: 'border-box',
          }}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && !projectDialogBusy) setProjectDialog(null);
          }}
        >
          <div style={{
            width: 'min(420px, 100%)',
            background: '#0b0b0b',
            border: '1px solid #3a3a3a',
            borderRadius: 18,
            padding: '20px 18px 18px',
            color: '#fff',
            boxShadow: '0 24px 70px rgba(0,0,0,0.72)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, letterSpacing: '0.04em' }}>
                {projectDialog.type === 'new' ? 'NUEVO PROYECTO' : 'ELIMINAR PROYECTO'}
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                disabled={projectDialogBusy}
                onClick={() => setProjectDialog(null)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#fff',
                  fontSize: 24,
                  width: 28,
                  height: 28,
                  padding: 0,
                  display: 'grid',
                  placeItems: 'center',
                  cursor: projectDialogBusy ? 'wait' : 'pointer',
                  opacity: projectDialogBusy ? 0.4 : 1,
                }}
              >
                ×
              </button>
            </div>

            {projectDialog.type === 'new' ? (
              <>
                <div style={{ color: '#8d8d8d', fontSize: '0.78rem', marginTop: 10 }}>
                  Ponle un nombre para organizar chats, medios y resultados.
                </div>
                <input
                  autoFocus
                  value={newProjectName}
                  disabled={projectDialogBusy}
                  onChange={(event) => setNewProjectName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !projectDialogBusy) void confirmarNuevoProyecto();
                  }}
                  style={{
                    width: '100%',
                    marginTop: 14,
                    padding: '12px 13px',
                    boxSizing: 'border-box',
                    borderRadius: 10,
                    border: '1px solid #353535',
                    background: '#111',
                    color: '#fff',
                    outline: 'none',
                    fontSize: '0.92rem',
                  }}
                />
              </>
            ) : (
              <>
                <div style={{ marginTop: 14, fontSize: '0.92rem', lineHeight: 1.45 }}>
                  ¿Eliminar <strong>{projectDialog.projectName}</strong>?
                </div>
                <div style={{ color: '#8d8d8d', fontSize: '0.76rem', lineHeight: 1.45, marginTop: 8 }}>
                  También se eliminarán sus chats y archivos privados guardados para este proyecto.
                </div>
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button
                type="button"
                disabled={projectDialogBusy}
                onClick={() => setProjectDialog(null)}
                style={{
                  border: '1px solid #333',
                  borderRadius: 10,
                  background: '#111',
                  color: '#ddd',
                  padding: '9px 13px',
                  fontWeight: 700,
                  cursor: projectDialogBusy ? 'wait' : 'pointer',
                }}
              >
                CANCELAR
              </button>
              <button
                type="button"
                disabled={projectDialogBusy}
                onClick={() => void (projectDialog.type === 'new'
                  ? confirmarNuevoProyecto()
                  : confirmarEliminarProyectoActivo())}
                style={{
                  border: '1px solid #eee',
                  borderRadius: 10,
                  background: '#f2f2f2',
                  color: '#050505',
                  padding: '9px 14px',
                  fontWeight: 850,
                  cursor: projectDialogBusy ? 'wait' : 'pointer',
                  opacity: projectDialogBusy ? 0.6 : 1,
                }}
              >
                {projectDialogBusy
                  ? 'PROCESANDO…'
                  : projectDialog.type === 'new'
                    ? 'CREAR'
                    : 'ELIMINAR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {vaultUploadProgress && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: '24px',
            transform: 'translateX(-50%)',
            width: 'min(420px, calc(100vw - 28px))',
            zIndex: 99998,
            background: 'rgba(8,8,8,.96)',
            border: '1px solid rgba(255,255,255,.24)',
            borderRadius: 14,
            padding: '12px 14px',
            boxShadow: '0 12px 40px rgba(0,0,0,.55)',
            color: '#fff',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, marginBottom: 8 }}>
            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {vaultUploadProgress.phase === 'registering' ? 'Guardando en la Bóveda…' : `Subiendo ${vaultUploadProgress.fileName}`}
            </span>
            <strong>{vaultUploadProgress.percent}%</strong>
          </div>
          <div style={{ height: 5, borderRadius: 999, background: '#262626', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${vaultUploadProgress.percent}%`, background: '#eee', transition: 'width .15s linear' }} />
          </div>
          <div style={{ marginTop: 6, color: '#888', fontSize: 9.5 }}>
            Archivo {vaultUploadProgress.fileIndex} de {vaultUploadProgress.fileCount}
          </div>
        </div>
      )}

{customAlertMsg && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.8)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: '#1a1a1a',
            border: '1px solid #444',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%',
            textAlign: 'center',
            position: 'relative',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
          }}>
            <button
              onClick={() => setCustomAlertMsg(null)}
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                background: 'none',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                padding: '4px'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '16px', fontSize: '1.2rem' }}>Aviso</h3>
            <p style={{ color: '#ccc', margin: 0, fontSize: '1rem', lineHeight: '1.5' }}>{customAlertMsg}</p>
            <button
              onClick={() => setCustomAlertMsg(null)}
              style={{
                marginTop: '24px',
                backgroundColor: '#333',
                color: '#fff',
                border: '1px solid #555',
                borderRadius: '8px',
                padding: '8px 24px',
                cursor: 'pointer',
                fontSize: '1rem'
              }}
            >
              Aceptar
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
