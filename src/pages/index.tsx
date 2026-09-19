// @ts-nocheck
/* eslint-disable */
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTimelineItem } from '../components/SortableTimelineItem';
import { RenderQueuePanel, type RenderJob } from '../components/RenderQueuePanel';
import { MAIN_TOOLS, SUB_TOOLS } from '../config/editorTools';
import { editorGlobalStyles } from '../styles/editorGlobalStyles';
import { getVideoMetadata, getAudioDurationInSeconds } from '@remotion/media-utils';
import { createClient } from '@supabase/supabase-js';
import { createMediaId, uploadMediaFilesToBodega } from '../lib/mediaUpload';
import { buildMediaMetadata, getCanvasDimensionsFromRatio, probeMediaUrl, type MediaMetadata } from '../lib/mediaMetadata';
import { getCompositionDurationInFrames } from '../lib/timelineMetrics';
import { getFirebaseSession, observeFirebaseSession, signOutFirebase, signInWithCustomTokenValue, type FirebaseSession } from '../lib/firebaseClient';
import { firebaseHeaders } from '../lib/apiClient';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.warn('Supabase no está configurado. Auth/storage siguen en compatibilidad temporal; la IA usa llaves de Vercel/Coolify y el render va por Oracle Cloud PC.');
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Rect = { id: string; x: number; y: number; width: number; height: number };
type MediaItem = { id: string; url: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; creado_en: string; esOverlay: boolean; etiqueta: string; fuente?: string; metadata?: MediaMetadata };
type TimelineItem = { id: string; mediaId: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; etiqueta: string; url: string; durationInSeconds?: number; originalDurationInSeconds?: number; volume?: number; fadeIn?: number; fadeOut?: number; scale?: number; delay?: number; startFrom?: number; trimBefore?: number; trimAfter?: number; loop?: boolean; playbackRate?: number; transitionDuration?: number; transitionType?: 'fade' | 'none' | 'wipe' | 'slide' | 'zoom'; efecto?: string; overlay?: string; overlayIntensity?: number; metadata?: MediaMetadata; };
type SubtitleItem = { id: string; texto: string; inicioSec: number; finSec: number; };
type LogoItem = { id: string; url: string; x: number; y: number; scale: number; opacity: number; inicioSec?: number; finSec?: number; fadeIn?: number; fadeOut?: number; };
type ExpandedSurface = 'tools' | 'chat' | null;

type MarcoConfig = {
  posicion: 'derecha' | 'izquierda' | 'abajo' | 'arriba' | 'derecha+abajo' | 'derecha+arriba' | 'izquierda+abajo' | 'izquierda+arriba';
  grosor: number;
  color: string;
};

const POSICIONES: MarcoConfig['posicion'][] = ['derecha', 'izquierda', 'abajo', 'arriba', 'derecha+abajo', 'derecha+arriba', 'izquierda+abajo', 'izquierda+arriba'];
const ICONOS_POS: Record<string, string> = { derecha: '→', izquierda: '←', abajo: '↓', arriba: '↑', 'derecha+abajo': '↘', 'derecha+arriba': '↗', 'izquierda+abajo': '↙', 'izquierda+arriba': '↖' };





export default function NaylaCore() {

  const [darkMode, setDarkMode] = useState(true);
  const [session, setSession] = useState<FirebaseSession | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState('');
  const [iaApiKey, setIaApiKey] = useState('');
  const [iaPrompt, setIaPrompt] = useState('Haz un video con 3 clips y ponles subtítulos');
  const [iaLoading, setIaLoading] = useState(false);
  const [selectedAiProvider, setSelectedAiProvider] = useState<'groq' | 'mistral'>('groq');
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

  const showAlert = (msg: string) => {
    setCustomAlertMsg(msg);
  };

  const [mainNav, setMainNav] = useState<string>('boveda');
  const [subTool, setSubTool] = useState<string | null>(null);
  const [isVideoExpanded, setIsVideoExpanded] = useState<boolean>(false);
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
  const [isMultiSelectStorageMode, setIsMultiSelectStorageMode] = useState(false);
  const [selectedStorageFiles, setSelectedStorageFiles] = useState<string[]>([]);
  const [codigoJsInput, setCodigoJsInput] = useState('// Inyecta comandos JS aquí\n// Ej: NaylaEngine.agregar(["V1", "V2", "A1"]);\n// NaylaEngine.agregarSubtitulos([{ texto: "Hola", inicioSec: 0, finSec: 5 }]);');
  const [moldesScripts, setMoldesScripts] = useState<{ id?: string, nombre: string; codigo: string }[]>([]);
  const [moldeActivo, setMoldeActivo] = useState<string>('');
  const [toolMessage, setToolMessage] = useState<string | null>(null);
  const [marcoConfig, setMarcoConfig] = useState<MarcoConfig>({ posicion: 'derecha+abajo', grosor: 80, color: '#ffffff' });
  const [marcoImagenes, setMarcoImagenes] = useState<{ original: string; procesada: string; nombre: string }[]>([]);
  const [marcoProcesando, setMarcoProcesando] = useState(false);
  const [galeriaMultimedia, setGaleriaMultimedia] = useState<MediaItem[]>([]);
  const [lineaDeTiempo, setLineaDeTiempo] = useState<TimelineItem[]>([]);
  const [subtitulos, setSubtitulos] = useState<SubtitleItem[]>([]);
  const [logos, setLogos] = useState<LogoItem[]>([]);
  const [globalSettings, setGlobalSettings] = useState<{ fadeOutFinal?: number }>({});
  const [clipSeleccionado, setClipSeleccionado] = useState<string | null>(null);
  const [canvasRatio, setCanvasRatio] = useState<string>('9/16');
  const [calidadExportacion, setCalidadExportacion] = useState('1080p');
  const canvasPreviewDimensions = getCanvasDimensionsFromRatio(canvasRatio, '1080p');
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [videoFile, setVideoFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mediaActivaUrl, setMediaActivaUrl] = useState<string | null>(null);
  const [videoResultadoUrl, setVideoResultadoUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState({ width: 1080, height: 1920 });
  const [isScriptRunning, setIsScriptRunning] = useState(false);
  const [activeRenderJobs, setActiveRenderJobs] = useState<Record<string, RenderJob>>({});
  const [isRenderQueueVisible, setIsRenderQueueVisible] = useState(false);
  const [renderLogs, setRenderLogs] = useState<string[]>([]);
  const [storageFiles, setStorageFiles] = useState<any[]>([]);
  const [isLoadingStorage, setIsLoadingStorage] = useState<boolean>(false);

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
    if (isPlaying) {
      resetPlaybackControlsTimer();
    } else {
      setShowPlaybackControls(true);
      if (playbackControlsTimerRef.current) clearTimeout(playbackControlsTimerRef.current);
    }
  }, [isPlaying]);


  // Render Jobs State

    const logsEndRef = useRef<HTMLDivElement | null>(null);

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

        const contadores: Record<string, number> = { V: 0, F: 0, A: 0 };
        const renumerado = newArray.map((clip) => {
          const inicial = clip.tipo === 'video' ? 'V' : clip.tipo === 'foto' ? 'F' : 'A';
          contadores[inicial]++;
          return { ...clip, etiqueta: `${inicial}${contadores[inicial]}` };
        });

        sincronizarLineaDeTiempo(renumerado);
        return renumerado;
      });
    }
  };


  // Load active jobs from localStorage on mount
  useEffect(() => {
    try {
      const storedJobs = localStorage.getItem('activeRenderJobs');
      if (storedJobs) {
        setActiveRenderJobs(JSON.parse(storedJobs));
      }
    } catch (e) {
      console.error('Error loading jobs from localStorage', e);
    }
  }, []);

  // Poll for job updates
  useEffect(() => {
    const jobIds = Object.keys(activeRenderJobs).filter(id => {
      const status = activeRenderJobs[id].status;
      return status === 'queued' || status === 'processing';
    });

    if (jobIds.length === 0) return;

    const interval = setInterval(async () => {
      let updatedJobs = { ...activeRenderJobs };
      let hasChanges = false;

      for (const jobId of jobIds) {
        try {
          const res = await fetch(`/api/render-status?jobId=${jobId}`);
          if (res.ok) {
            const statusData = await res.json();

            if (
              updatedJobs[jobId].status !== statusData.status ||
              (updatedJobs[jobId].logs?.length || 0) !== (statusData.logs?.length || 0)
            ) {
               updatedJobs[jobId] = { ...updatedJobs[jobId], ...statusData };
               hasChanges = true;

               if (statusData.status === 'completed' && statusData.url) {
                  setGaleriaMultimedia(prev => {
                    if (prev.some(item => item.url === statusData.url)) return prev;

                    const renderCount = prev.filter(item => item.etiqueta.startsWith('R')).length + 1;
                    const renderItem: MediaItem = {
                      id: createMediaId(),
                      url: statusData.url,
                      tipo: 'video',
                      nombre: `Render ${renderCount}`,
                      creado_en: new Date().toLocaleTimeString(),
                      esOverlay: false,
                      etiqueta: `R${renderCount}`,
                      fuente: 'render'
                    };
                    return [...prev, renderItem];
                  });
                  showAlert('Renderizado completado exitosamente.');
               } else if (statusData.status === 'error' || statusData.status === 'failed') {
                  showAlert('Fallo en la nube: ' + (statusData.error || 'Desconocido'));
               }
            }
          }
        } catch (e) {
          console.error(`Error polling job ${jobId}`, e);
        }
      }

      if (hasChanges) {
        setActiveRenderJobs(updatedJobs);
        localStorage.setItem('activeRenderJobs', JSON.stringify(updatedJobs));
      }

    }, 3000);

    return () => clearInterval(interval);
  }, [activeRenderJobs]);

  const cancelRenderJob = async (jobId: string) => {
    try {
      // Force clear polling locally immediately
      let updatedJobs = { ...activeRenderJobs, [jobId]: { ...activeRenderJobs[jobId], status: 'cancelled' as any } };
      setActiveRenderJobs(updatedJobs as any);
      localStorage.setItem('activeRenderJobs', JSON.stringify(updatedJobs));

      const res = await fetch(`/api/render-cancel?jobId=${jobId}`, { method: 'DELETE' });
      if (res.ok) {
         showAlert('Render cancelado correctamente.');
      } else {
         const data = await res.json();
         showAlert('Render cancelado localmente. Error en la nube: ' + (data.error || 'Desconocido'));
      }
    } catch (e: any) {
      showAlert('Render cancelado localmente. Error de red: ' + e.message);
    }
  };

  const removeRenderJob = (jobId: string) => {
      const updatedJobs = { ...activeRenderJobs };
      delete updatedJobs[jobId];
      setActiveRenderJobs(updatedJobs);
      localStorage.setItem('activeRenderJobs', JSON.stringify(updatedJobs));
  };


  const [isUserScrolling, setIsUserScrolling] = useState(false);

  useEffect(() => {
    const handleUp = () => setIsUserScrolling(false);
    window.addEventListener('pointerup', handleUp);
    return () => window.removeEventListener('pointerup', handleUp);
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const mainToolsCarouselRef = useRef<HTMLDivElement>(null);
  const subToolsCarouselRef = useRef<HTMLDivElement>(null);
  const lastVideoSurfaceTapRef = useRef<number>(0);
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
  const [chatMessages, setChatMessages] = useState<{role: 'user' | 'ai', text: string}[]>([]);
  const [chatProcessing, setChatProcessing] = useState(false);
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

  const handleVideoSurfaceTap = (e: React.PointerEvent<HTMLElement>) => {
    e.stopPropagation();
    if (!isPhoneViewport || subTool === 'delogo') return;

    const now = Date.now();
    if (now - lastVideoSurfaceTapRef.current <= 320) {
      setMobileOverlaysVisible(prev => !prev);
      lastVideoSurfaceTapRef.current = 0;
      return;
    }
    lastVideoSurfaceTapRef.current = now;
  };

  const handleMainCarouselToolPress = (tool: any) => {
    if (isPhoneViewport && centeredMainToolId !== tool.id) {
      setCenteredMainToolId(tool.id);
      centerCarouselItem(mainToolsCarouselRef.current, tool.id);
      return;
    }

    setMainNav(tool.id);
    setIsChatOpen(false);
    setSubTool(null);
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
    } else if (['marco', 'delogo', 'script', 'supervisor', 'youtube', 'pixabay', 'musicastock', 'noticias', 'artistas', 'stockvideo', 'sonidos', 'iafoto', 'enlace', 'render'].includes(tool.id)) {
      setToolMessage(null);
    } else {
      setToolMessage('PRÓXIMAMENTE');
    }
  };

  const seekBy = (seconds: number) => {
    if (!playerRef.current) return;
    const duration = Number.isFinite(playerRef.current.duration) ? playerRef.current.duration : Number.POSITIVE_INFINITY;
    playerRef.current.currentTime = Math.min(duration, Math.max(0, playerRef.current.currentTime + seconds));
  };

  const isPortraitSourceVideo = sourceVideoRatio !== null && sourceVideoRatio < 1;
  const phoneVideoObjectFit = isPortraitSourceVideo && deviceOrientation === 'portrait' ? 'cover' : 'contain';

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

  const solicitarRenderTimeline = async (timeline: TimelineItem[], qualityOverride?: string, ratioOverride?: string) => {
    const currentSession = session || await getFirebaseSession();
    if (!currentSession) throw new Error('Debes iniciar sesión para renderizar.');

    const lineaValidada = await validarTimelineParaRender(timeline);
    const exportQuality = qualityOverride || calidadExportacion;
    const renderRatio = ratioOverride || canvasRatio;
    const canvas = getCanvasDimensionsFromRatio(renderRatio, exportQuality);
    const durationInFrames = getCompositionDurationInFrames(lineaValidada, 30, subtitulos, logos);

    const inputProps = {
      timeline: lineaValidada,
      subtitles: subtitulos,
      logos: logos,
      canvasRatio: renderRatio,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      exportQuality,
      settings: globalSettings
    };

    const res = await fetch('/api/render', {
      method: 'POST',
      headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ inputProps })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al solicitar renderizado');

    if (data.status === 'completed' && data.output?.url) {
      const outputUrl = data.output.url as string;
      setVideoResultadoUrl(outputUrl);

      const renderCount = galeriaMultimedia.filter(item => item.fuente === 'render').length + 1;
      const renderItem: MediaItem = {
        id: createMediaId(),
        url: outputUrl,
        tipo: 'video',
        nombre: `Render ${renderCount}`,
        creado_en: new Date().toISOString(),
        esOverlay: false,
        etiqueta: `R${renderCount}`,
        fuente: 'render',
        metadata: buildMediaMetadata(canvas.width, canvas.height, durationInFrames / 30)
      };

      setGaleriaMultimedia(prev => prev.some(item => item.url === outputUrl) ? prev : [...prev, renderItem]);

      const galleryResponse = await fetch('/api/galeria', {
        method: 'POST',
        headers: firebaseHeaders(currentSession, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ items: [renderItem] })
      });

      if (!galleryResponse.ok) {
        const payload = await galleryResponse.json().catch(() => ({}));
        console.warn('El render terminó, pero no se pudo registrar en la Bóveda:', payload);
      }

      showAlert(`Render completado: ${canvas.width}×${canvas.height} (${renderRatio}).`);
      return data;
    }

    if (data.jobId) {
      const newJob = { jobId: data.jobId, status: 'queued', url: null, error: null, logs: ['Job añadido a la cola desde Nayla...'] };
      const updatedJobs = { ...activeRenderJobs, [data.jobId]: newJob };
      setActiveRenderJobs(updatedJobs as any);
      localStorage.setItem('activeRenderJobs', JSON.stringify(updatedJobs));
      setIsRenderQueueVisible(true);
    }

    return data;
  };

  const ejecutarBuildTimeline = async (actionData: any) => {
    const assets = Array.isArray(actionData.assets) ? actionData.assets : [];
    if (assets.length === 0) throw new Error('BUILD_TIMELINE llegó sin assets.');

    const nextTimeline: TimelineItem[] = [];
    assets.forEach((asset: any, index: number) => {
      const url = typeof asset.url === 'string' ? asset.url.trim() : '';
      const tipo = asset.type === 'image' ? 'foto' : asset.type;
      if (!url || !['foto', 'video', 'audio'].includes(tipo) || asset.source !== 'url') return;

      const mediaExistente = galeriaMultimedia.find(item => item.url === url && item.tipo === tipo);
      const mediaId = mediaExistente?.id || `nayla-url-${Date.now()}-${index}`;
      const etiqueta = mediaExistente?.etiqueta || `${tipo === 'foto' ? 'F' : tipo === 'audio' ? 'A' : 'V'}_IA_${index + 1}`;
      const nombre = mediaExistente?.nombre || `Nayla ${tipo} ${index + 1}`;

      nextTimeline.push({
        id: `nayla-timeline-${Date.now()}-${index}`,
        mediaId,
        tipo,
        nombre,
        etiqueta,
        url,
        durationInSeconds: tipo === 'foto' ? 5 : mediaExistente?.durationInSeconds,
        originalDurationInSeconds: tipo === 'foto' ? 5 : mediaExistente?.originalDurationInSeconds,
        metadata: mediaExistente?.metadata,
        ...(typeof asset.efecto === 'string' ? { efecto: asset.efecto } : {}),
        ...(typeof asset.transitionType === 'string' ? { transitionType: asset.transitionType } : {}),
        ...(Number.isFinite(Number(asset.transitionDuration)) ? { transitionDuration: Number(asset.transitionDuration) } : {}),
        ...(Number.isFinite(Number(asset.fadeIn)) ? { fadeIn: Number(asset.fadeIn) } : {}),
        ...(Number.isFinite(Number(asset.fadeOut)) ? { fadeOut: Number(asset.fadeOut) } : {}),
        ...(typeof asset.overlay === 'string' ? { overlay: asset.overlay } : {}),
        ...(Number.isFinite(Number(asset.overlayIntensity)) ? { overlayIntensity: Number(asset.overlayIntensity) } : {})
      });
    });

    if (nextTimeline.length === 0) throw new Error('Nayla no devolvió URLs válidas para armar el timeline.');

    const timelineValidado = await validarTimelineParaRender(nextTimeline);
    setLineaDeTiempo(timelineValidado);
    sincronizarLineaDeTiempo(timelineValidado);
    setClipSeleccionado(timelineValidado[0].id);
    setMediaActivaUrl(timelineValidado[0].url);
    setVideoResultadoUrl(null);
    setRects([]);

    const primerVisual = timelineValidado.find(item => item.tipo === 'video' || item.tipo === 'foto');
    const formatoDetectado = primerVisual?.metadata?.aspectRatioLabel;

    if (primerVisual?.metadata) {
      adoptarFormatoVisual(primerVisual.metadata);
    }

    if (actionData.render === true) {
      await solicitarRenderTimeline(timelineValidado, undefined, formatoDetectado);
      showAlert('Nayla armó el timeline y envió el render con el formato detectado.');
    } else {
      showAlert('Nayla armó el timeline con los medios existentes.');
    }
  };

  const sendNaylaMessage = async () => {
    if (!chatInput.trim()) return;
    const newMessages = [...chatMessages, { role: 'user', text: chatInput }];
    setChatMessages(newMessages as any);
    setChatInput('');
    setChatProcessing(true);

    try {
      // Usamos el nuevo endpoint universal de chat
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           message: chatInput,
           history: chatMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
           provider: selectedAiProvider,
           mediaLibrary: galeriaMultimedia.map(item => ({
             id: item.id,
             tipo: item.tipo,
             url: item.url,
             nombre: item.nombre,
             etiqueta: item.etiqueta,
             fuente: item.fuente,
             metadata: item.metadata
           })),
           currentTimeline: lineaDeTiempo.map(item => ({
             id: item.id,
             tipo: item.tipo,
             url: item.url,
             nombre: item.nombre,
             etiqueta: item.etiqueta
           }))
        })
      });
      let data;
      try {
        data = await res.json();
      } catch (err) {
        throw new Error('Error de conexión o respuesta inválida del servidor (Probablemente faltan variables de entorno para DB).');
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Error en la respuesta del servidor');
      }

      const aiText = data.text || (data.action === 'BUILD_TIMELINE' ? 'Voy a armar el timeline con los medios existentes.' : 'Sin respuesta de texto.');
      setChatMessages(prev => [...prev, { role: 'ai', text: aiText }]);

      if (data.action === 'BUILD_TIMELINE') {
        await ejecutarBuildTimeline(data);
      } else if (data.action === 'CLIP_VIDEO' && data.payload) {
        // Enviar a procesar el clip con el Oráculo
        setExtrayendoVideo(true);

        try {
          const resApi = await fetch('/api/process-clip', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
               videoUrl: data.payload.url,
               startTime: data.payload.start,
               endTime: data.payload.end,
               clipName: data.payload.title
             })
          });

          if(resApi.status === 202) {
             console.log("Nayla clip curado enviado a cola exitosamente");
          } else {
             console.error("Error al enviar clip a procesar:", await resApi.json());
          }
          // No seteamos extrayendoVideo a false inmediatamente porque el proceso es en background
          // Podemos dejar la barra por unos segundos para indicar feedback.
          setTimeout(() => {
            setExtrayendoVideo(false);
          }, 3000);

        } catch (e) {
          console.error("Error procesando clip de Nayla:", e);
          setExtrayendoVideo(false);
        }
      }
    } catch (error: any) {
      console.error(error);
      setChatMessages(prev => [...prev, { role: 'ai', text: error.message || 'Lo siento, ocurrió un error procesando tu solicitud.' }]);
    } finally {
      setChatProcessing(false);
    }
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



  useEffect(() => {
    if (!playerRef.current || !timelineRef.current || isUserScrolling) return;

    // We poll the player's current frame because Remotion player doesn't have an onFrameChange callback right now.
    // However, it does have `getCurrentFrame()`. Let's use requestAnimationFrame.
    let animationFrameId: number;
    const syncScroll = () => {
      if (playerRef.current && timelineRef.current && !isUserScrolling) {
         const frame = Math.round(playerRef.current.currentTime * 30);
         const fps = 30;
         const seconds = frame / fps;
         // Our scale is 20px per second.
         const containerWidth = timelineRef.current.clientWidth;
         const scrollPos = (seconds * 20) - (containerWidth / 2);
         timelineRef.current.scrollLeft = Math.max(0, scrollPos);
      }
      animationFrameId = requestAnimationFrame(syncScroll);
    };

    if (isPlaying) {
      animationFrameId = requestAnimationFrame(syncScroll);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, isUserScrolling]);

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

  useEffect(() => {
    if (mainNav === 'nube') {
      fetchStorageFiles();
    }
  }, [mainNav]);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [renderLogs]);






  const fetchStorageFiles = async () => {
    setIsLoadingStorage(true);
    try {
      const { data, error } = await supabase.storage.from('media_bodega').list();
      if (error) {
        console.error('Error fetching storage files:', error);
        showAlert('Error cargando archivos de la nube: ' + error.message);
      } else {
        setStorageFiles(data || []);
      }
    } catch (err: any) {
      console.error('Exception fetching storage files:', err);
      showAlert('Error: ' + err.message);
    } finally {
      setIsLoadingStorage(false);
    }
  };

  const deleteStorageFile = async (filename: string) => {
    if (!confirm(`¿Estás seguro de que quieres borrar el archivo ${filename}?`)) return;
    try {
      const { error } = await supabase.storage.from('media_bodega').remove([filename]);
      if (error) throw error;
      await fetchStorageFiles();
    } catch (err: any) {
      console.error('Error deleting file:', err);
      showAlert('Error al borrar: ' + err.message);
    }
  };

  const deleteStorageFiles = async (filenames: string[]) => {
    if (!confirm(`¿Estás seguro de que quieres borrar ${filenames.length} archivo(s)?`)) return;
    try {
      const { error } = await supabase.storage.from('media_bodega').remove(filenames);
      if (error) throw error;
      await fetchStorageFiles();
      setSelectedStorageFiles([]);
      setIsMultiSelectStorageMode(false);
    } catch (err: any) {
      console.error('Error deleting files:', err);
      showAlert('Error al borrar múltiples archivos: ' + err.message);
    }
  };

  const cargarDatosUsuario = async (userId: string) => {
    try {
      // Cargar Bodega
      const currentSession = session || await getFirebaseSession();
      const galeriaResponse = currentSession ? await fetch('/api/galeria', {
        headers: firebaseHeaders(currentSession),
      }) : null;
      const galeriaPayload = galeriaResponse ? await galeriaResponse.json() as { data?: any[]; error?: string } : null;
      const galeriaData = galeriaPayload?.data;

      if (galeriaResponse?.ok && galeriaData) {
        // Adaptar si es necesario, o setear directo si coinciden los campos
        const galeria = galeriaData.map(item => ({
          id: item.id,
          url: item.url,
          tipo: item.tipo,
          nombre: item.nombre,
          creado_en: item.creado_en,
          esOverlay: item.esOverlay,
          etiqueta: item.etiqueta,
          fuente: item.fuente,
          metadata: item.metadata || {}
        }));
        setGaleriaMultimedia(galeria);
      }

      // Cargar Plantillas (Moldes)
      const { data: plantillasData, error: plantillasError } = await supabase
        .from('plantillas_usuario')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (!plantillasError && plantillasData) {
        setMoldesScripts(plantillasData.map(p => ({
          id: p.id,
          nombre: p.nombre,
          codigo: p.codigo_script
        })));
      }

      // Cargar Línea de Tiempo
      const proyectoResponse = currentSession ? await fetch('/api/proyectos', {
        headers: firebaseHeaders(currentSession),
      }) : null;
      const proyectoPayload = proyectoResponse ? await proyectoResponse.json() as { data?: { linea_de_tiempo?: any[] } | null; error?: string } : null;
      const proyectoData = proyectoPayload?.data;

      if (proyectoResponse?.ok && proyectoData && proyectoData.linea_de_tiempo) {
        setLineaDeTiempo(proyectoData.linea_de_tiempo);
        // Si hay clips, establecer el primero que sea video/foto como mediaActivaUrl
        const clipsVisuales = proyectoData.linea_de_tiempo.filter((c: any) => c.tipo === 'video' || c.tipo === 'foto');
        if (clipsVisuales.length > 0 && !mediaActivaUrl) {
          setMediaActivaUrl(clipsVisuales[0].url);
          setClipSeleccionado(clipsVisuales[0].id);
          let persistedMetadata = clipsVisuales[0].metadata ||
            galeriaMultimedia.find(item => item.url === clipsVisuales[0].url)?.metadata;

          if (!persistedMetadata?.aspectRatioLabel) {
            try {
              persistedMetadata = await probeMediaUrl(clipsVisuales[0].url, clipsVisuales[0].tipo);
            } catch (error) {
              console.warn('No se pudo recuperar el formato del primer clip del proyecto.', error);
            }
          }

          adoptarFormatoVisual(persistedMetadata);
        }
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

    try {
      const nuevosItems = await uploadMediaFilesToBodega({
        session: currentSession,
        files,
        existingItems: galeriaMultimedia,
        forcedTipo: tipo,
        fuente: 'manual'
      });

      setGaleriaMultimedia(prev => [...prev, ...nuevosItems]);

      const primerVisualIndex = nuevosItems.findIndex(item => item.tipo === 'video' || item.tipo === 'foto');
      const primerVisual = primerVisualIndex >= 0 ? nuevosItems[primerVisualIndex] : null;

      if (primerVisual && pistaVideo.length === 0 && !mediaActivaUrl) {
        if (primerVisual.tipo === 'video') {
          setVideoFile(files[primerVisualIndex] || files[0]);
        }
        setMediaActivaUrl(primerVisual.url);
        setClipSeleccionado(primerVisual.id);
        setVideoResultadoUrl(null);
        adoptarFormatoVisual(primerVisual.metadata);
      }
    } catch (err: any) {
      console.error('Error procesando subida:', err);
      showAlert(err?.message || 'Hubo un error al procesar los archivos.');
    } finally {
      e.target.value = '';
      setSubiendoArchivo(false);
    }
  };

  const eliminarItemsGaleria = async (ids: string[]) => {
    if (!session || ids.length === 0) return;

    // Identificar los items a borrar para extraer las URLs antes de quitarlos del estado
    const itemsToDelete = galeriaMultimedia.filter(item => ids.includes(item.id));

    // 1. Borrar de la UI
    const nuevaGaleria = galeriaMultimedia.filter(item => !ids.includes(item.id));
    const nuevaLinea = lineaDeTiempo.filter(item => !ids.includes(item.mediaId));

    setGaleriaMultimedia(nuevaGaleria);
    setLineaDeTiempo(nuevaLinea);
    sincronizarLineaDeTiempo(nuevaLinea);

    // Si el clip seleccionado está entre los borrados, limpiarlo
    if (clipSeleccionado && ids.includes(clipSeleccionado)) {
      setClipSeleccionado(null);
      setMediaActivaUrl(null);
    }

    // 2. Borrar archivos físicos. Los objetos nuevos viven en R2; los enlaces
    // antiguos de Supabase se conservan para que la migración no deje residuos.
    for (const item of itemsToDelete) {
      if (item.url && item.url.includes('.supabase.co/storage/v1/object/public/')) {
        try {
          const parts = item.url.split('.supabase.co/storage/v1/object/public/');
          if (parts.length === 2) {
            const pathParts = parts[1].split('/');
            const bucketName = pathParts[0];
            const fileName = pathParts.slice(1).join('/');

            if (bucketName && fileName) {
              const { error: storageError } = await supabase.storage.from(bucketName).remove([fileName]);
              if (storageError) {
                console.error(`Error borrando ${fileName} del bucket ${bucketName}:`, storageError);
              }
            }
          }
        } catch (e) {
          console.error("Error parseando URL para borrar de Storage", e);
        }
      } else if (item.url) {
        try {
          const key = decodeURIComponent(new URL(item.url).pathname.replace(/^\/+/, ''));
          if (key.startsWith(`${session.user.id}/`)) {
            const response = await fetch('/api/r2/delete', {
              method: 'DELETE',
              headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
              body: JSON.stringify({ key })
            });
            if (!response.ok) throw new Error((await response.json()).error || 'No se pudo borrar el objeto de R2.');
          }
        } catch (e) {
          console.error('Error borrando archivo de R2', e);
        }
      }
    }

    // 3. Borrar registros de la base de datos
    const response = await fetch('/api/galeria', {
      method: 'DELETE',
      headers: firebaseHeaders(session, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ids }),
    });
    const payload = await response.json() as { error?: string };

    if (!response.ok) {
      console.error('Error eliminando de Supabase BD:', payload.error);
      showAlert('Error al eliminar de la base de datos: ' + (payload.error || 'Error desconocido.'));
    }
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

  const agregarAlTimeline = async (item: MediaItem) => {
    let metadata: MediaMetadata = { ...(item.metadata || {}) };

    try {
      const probed = await probeMediaUrl(item.url, item.tipo);
      metadata = { ...metadata, ...probed };
    } catch (error) {
      console.warn('Could not load complete media metadata for', item.url, error);
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
    const nuevaLinea = [...lineaDeTiempo, nuevo];
    setLineaDeTiempo(nuevaLinea);

    setClipSeleccionado(nuevo.id);
    setMediaActivaUrl(nuevo.url);
    setVideoResultadoUrl(null);
    setRects([]);

    if ((nuevo.tipo === 'foto' || nuevo.tipo === 'video') && pistaVideo.length === 0) {
      adoptarFormatoVisual(metadata);
    }

    sincronizarLineaDeTiempo(nuevaLinea);
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

  const togglePlay = () => {
    if (playerRef.current) {
      if (!playerRef.current.paused) { playerRef.current.pause(); setIsPlaying(false); }
      else { const playPromise = playerRef.current.play(); if (playPromise !== undefined) { playPromise.catch(error => console.log('Autoplay prevented:', error)); } setIsPlaying(true); }
    }
  };

  const handleVideoEnded = () => {
    if (!clipSeleccionado) return;
    const currentIndex = lineaDeTiempo.findIndex(t => t.id === clipSeleccionado);
    if (currentIndex !== -1 && currentIndex < lineaDeTiempo.length - 1) {
      // Es un clip de la línea de tiempo y hay uno siguiente
      const nextClip = lineaDeTiempo[currentIndex + 1];
      if (nextClip.tipo === 'video' || nextClip.tipo === 'foto') {
        setClipSeleccionado(nextClip.id);
        setMediaActivaUrl(nextClip.url);
        setVideoResultadoUrl(null);
        // Play is handled automatically in a useEffect or by the user hitting play again if we don't want autoplay
        // But for "reproducción de corrido" we should autoplay:
        setTimeout(() => {
          if (playerRef.current) {
            const playPromise = playerRef.current.play(); if (playPromise !== undefined) { playPromise.catch(error => console.log('Autoplay prevented:', error)); }
            setIsPlaying(true);
          }
        }, 100);
      }
    }
  };

  const handleDescargar = (calidad?: string) => {
    const exportQuality = calidad || calidadExportacion;
    if (calidad) setCalidadExportacion(calidad);
    const url = videoResultadoUrl || mediaActivaUrl;
    if (!url) return showAlert('No hay ningún video cargado para descargar.');
    const a = document.createElement('a'); a.href = url; a.download = `Nayla_Export_${exportQuality}_${Date.now()}.mp4`; a.click();
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
      const actualCount = galeriaMultimedia.filter(item => item.tipo === resolvedTipo).length + index + 1;

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
           body: JSON.stringify({ items: [nuevoItem] }),
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

  const processVideo = async (motorElegido: 'nube' | 'local') => {
    if (!videoFile) return showAlert('Por favor, sube un video primero.');
    if (rects.length === 0) return showAlert('Dibuja al menos un recuadro sobre la marca de agua.');
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('video', videoFile); formData.append('coordenadas', JSON.stringify(rects)); formData.append('motor', motorElegido);
      const res = await fetch('/api/clean-video', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.success) { setVideoResultadoUrl(data.url); setRects([]); showAlert(`Supresión completada: ${motorElegido.toUpperCase()}`); }
      else throw new Error(data.error || 'Fallo en el servidor');
    } catch (err: any) { showAlert('Error: ' + err.message); }
    finally { setIsProcessing(false); }
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

  <RenderQueuePanel
    jobs={activeRenderJobs}
    visible={isRenderQueueVisible}
    onOpen={() => setIsRenderQueueVisible(true)}
    onClose={() => setIsRenderQueueVisible(false)}
    onCancel={cancelRenderJob}
    onRemove={removeRenderJob}
  />

      {/* Modal para Consola Visual */}
      {isProcessing && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          zIndex: 9999,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#0a0a0a',
            border: '1px solid #333',
            borderRadius: '12px',
            width: '100%',
            maxWidth: '600px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 0 20px rgba(0,0,0,0.5)',
            overflow: 'hidden'
          }}>
            <div style={{
              backgroundColor: '#1a1a1a',
              padding: '10px 15px',
              borderBottom: '1px solid #333',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 'bold', fontFamily: 'monospace' }}>
                Terminal Remotion Render
              </span>
              <div style={{ display: 'flex', gap: '5px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ff5f56' }}></div>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ffbd2e' }}></div>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#27c93f' }}></div>
              </div>
            </div>

            <div style={{
              flex: 1,
              padding: '15px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              color: '#00ffcc',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              {renderLogs.length === 0 ? (
                <div style={{ color: '#888' }}>Esperando logs del servidor...</div>
              ) : (
                renderLogs.map((log, index) => (
                  <div key={index} style={{ wordBreak: 'break-all' }}>{log}</div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      )}

      <Head><title>NAYLA CORE</title></Head>
      <style>{editorGlobalStyles}</style>

      <header style={{
        borderBottom: '1px solid rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * 0.35))',
        padding: '0.5rem 0.75rem',
        display: 'flex',
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
                setIsDownloadMenuOpen(!isDownloadMenuOpen);
                setIsUserMenuOpen(false);
              }}
              className="neon-btn nav-btn"
              style={{ padding: '6px 12px', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#111' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              DESCARGAR
            </button>

            {/* BANDEJA DESPLEGABLE DE DESCARGA */}
            {isDownloadMenuOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                backgroundColor: 'var(--glass-bg)',
                backdropFilter: 'blur(var(--glass-blur))',
                WebkitBackdropFilter: 'blur(var(--glass-blur))',
                border: '1px solid rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * 0.6))',
                borderRadius: '12px',
                padding: '8px',
                minWidth: '160px',
                zIndex: 200,
                boxShadow: '0 10px 30px rgba(0,0,0,0.8), 0 0 var(--glow-spread) rgba(var(--glow-color-rgb), var(--glow-intensity))',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px'
              }}>
                <span style={{ fontSize: '0.6rem', color: '#737373', fontWeight: 'bold', padding: '4px 8px', letterSpacing: '1px' }}>
                  CALIDAD DE EXPORTACIÓN
                </span>
                {['480p', '720p', '1080p', '4K'].map((res) => (
                  <button
                    key={res}
                    onClick={() => {
                      setIsDownloadMenuOpen(false);
                      handleDescargar(res.toLowerCase());
                    }}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: calidadExportacion === res.toLowerCase() ? '#ffffff' : '#111111',
                      color: calidadExportacion === res.toLowerCase() ? '#000000' : '#ffffff',
                      border: '1px solid #262626',
                      borderRadius: '8px',
                      fontSize: '0.7rem',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {res}
                  </button>
                ))}
              </div>
            )}
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

      {/* CONTENEDOR PRINCIPAL DEL EDITOR */}
      <div className="flex-1 flex flex-col min-h-0 w-full relative overflow-hidden bg-black text-gray-200">

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
              {MAIN_TOOLS.map((tool) => {
                const isActive = mainNav === tool.id && isSubPanelOpen;
                return (
                  <button
                    key={tool.id}
                    className={`main-btn ${isActive ? 'active' : ''}`}
                    title={tool.nombre}
                    onClick={() => {
                      if (mainNav === tool.id && isSubPanelOpen) {
                        setIsSubPanelOpen(false);
                      } else {
                        setMainNav(tool.id);
                        setIsSubPanelOpen(true);
                        setSubTool(SUB_TOOLS[tool.id]?.[0]?.id || null);
                      }
                    }}
                  >
                    <div>{tool.icon}</div>
                  </button>
                );
              })}
            </div>
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
                        <span>{tool.nombre}</span>
                        <input type="file" multiple accept="video/*,image/*" onChange={(e) => handleSubirMultimedia(e, 'video')} style={{ display: 'none' }} />
                      </label>
                    );
                  }
                  if (tool.id === 'subir-a') {
                    return (
                      <label key={tool.id} className="sub-btn">
                        <div className="icon-container">{tool.icon}</div>
                        <span>{tool.nombre}</span>
                        <input type="file" multiple accept="audio/*" onChange={(e) => handleSubirMultimedia(e, 'audio')} style={{ display: 'none' }} />
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
                ) : mainNav === 'nube' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', margin: 0 }}>EXPLORADOR DE STORAGE</p>
                      <button className="neon-btn nav-btn" onClick={fetchStorageFiles} style={{ padding: '4px 8px', fontSize: '0.65rem' }}>
                        {isLoadingStorage ? '...' : 'Actualizar'}
                      </button>
                    </div>
                    {isLoadingStorage ? (
                      <div style={{ textAlign: 'center', padding: '1rem', color: '#737373', fontSize: '0.8rem' }}>Cargando archivos...</div>
                    ) : storageFiles.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '1rem', color: '#737373', fontSize: '0.8rem' }}>No hay archivos en la bodega.</div>
                    ) : (
                      storageFiles.map((file, i) => {
                        if (file.id === null && !file.name.includes('.')) return null;
                        if (file.name === '.emptyFolderPlaceholder') return null;
                        return (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111', border: '1px solid #222', padding: '8px 10px', borderRadius: '8px' }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                              <p style={{ fontSize: '0.75rem', color: '#fff', margin: 0, fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</p>
                            </div>
                            <button onClick={() => deleteStorageFile(file.name)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', padding: '4px' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
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
                        <p style={{ fontSize: '0.7rem', color: '#a3a3a3', marginBottom: '1rem' }}>1. Selecciona un video.<br />2. Dibuja un rectángulo blanco sobre el logo.<br />3. Elige el motor.</p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => processVideo('local')} disabled={isProcessing} className="neon-btn nav-btn" style={{ flex: 1 }}>LOCAL</button>
                          <button onClick={() => processVideo('nube')} disabled={isProcessing} className="neon-btn nav-btn" style={{ flex: 1 }}>NUBE</button>
                        </div>
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
                        <p style={{ fontSize: '0.7rem', color: '#737373', marginBottom: '1rem' }}>Clips en timeline: {lineaDeTiempo.length}</p>
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
                ) : (
                  /* GALERÍA DE MEDIOS (BÓVEDA / BUSCAR) */
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '8px' }}>
                    {galeriaMultimedia
                      .filter(item => {
                        if (filtroGaleria === 'videos') return item.tipo === 'video';
                        if (filtroGaleria === 'fotos') return item.tipo === 'foto';
                        if (filtroGaleria === 'audios') return item.tipo === 'audio';
                        return true;
                      })
                      .map(item => (
                        <div key={item.id} className="neon-btn" style={{ padding: '8px', borderRadius: '10px', flexDirection: 'column', position: 'relative', justifyContent: 'space-between', width: '100%', minHeight: '110px' }}>
                          <span style={{ fontSize: '0.6rem', backgroundColor: '#262626', padding: '2px 4px', borderRadius: '4px', color: '#fff', fontWeight: 'bold' }}>{item.etiqueta}</span>
                          <div
                            onClick={() => {
                              setMediaActivaUrl(item.url);
                              setClipSeleccionado(item.id);
                              setVideoResultadoUrl(null);
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
            onPointerMove={resetPlaybackControlsTimer}
            onPointerUp={(e) => {
              resetPlaybackControlsTimer();
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setIsCleanMode(prev => !prev);
            }}
            data-testid="video-preview-container"
            style={{
              flex: 1,
              height: '100%',
              position: 'relative',
              backgroundColor: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              cursor: 'pointer'
            }}
          >
            {!isCleanMode && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '12px',
                  zIndex: 35,
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.18)',
                  backgroundColor: 'rgba(0,0,0,0.62)',
                  backdropFilter: 'blur(8px)',
                  padding: '5px 9px',
                  color: '#e5e5e5',
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  pointerEvents: 'none'
                }}
              >
                FORMATO {canvasRatio.replace('/', ':')} · {canvasPreviewDimensions.width}×{canvasPreviewDimensions.height}
              </div>
            )}

            {/* CUADRO / BOTÓN FLOTANTE SUPERIOR DERECHO DE NAYLA IA */}
            {!isCleanMode && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsAiModalOpen(true);
                }}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  zIndex: 35,
                  borderRadius: '12px',
                  border: '1px solid rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * 0.6))',
                  backgroundColor: 'var(--glass-bg)',
                  backdropFilter: 'blur(var(--glass-blur))',
                  WebkitBackdropFilter: 'blur(var(--glass-blur))',
                  padding: '5px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  color: '#fff',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.6), 0 0 var(--glow-spread) rgba(var(--glow-color-rgb), var(--glow-intensity))',
                  transition: 'all 0.2s ease'
                }}
              >
                <img
                  src="/assets/imagenes/Icono-intro.jpeg"
                  alt="Nayla"
                  style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #00cc66' }}
                />
                <span style={{ fontSize: '0.7rem', fontWeight: 'bold', letterSpacing: '1px', color: '#00ffcc' }}>NAYLA IA</span>
                <div style={{ width: '6px', height: '6px', backgroundColor: '#00cc66', borderRadius: '50%', boxShadow: '0 0 6px #00cc66' }} />
              </button>
            )}

            {/* VIDEO O CANVAS PRINCIPAL */}
            <div ref={containerRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
              style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {(visualActivo || videoResultadoUrl || mediaActivaUrl) ? (
                <>
                  {visualActivo?.tipo === 'foto' && !videoResultadoUrl ? (
                    <img
                      key={visualActivo.url}
                      src={visualActivo.url}
                      alt={visualActivo.nombre || 'Imagen activa'}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' }}
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
                      style={{ width: '100%', height: '100%', objectFit: 'contain', backgroundColor: '#000' }}
                      controls={false}
                      playsInline
                      muted={false}
                      ref={playerRef as any}
                      onEnded={handleVideoEnded}
                      onLoadedMetadata={(e) => {
                        const video = e.currentTarget;
                        if (video.videoWidth && video.videoHeight) {
                          const detected = buildMediaMetadata(video.videoWidth, video.videoHeight, Number.isFinite(video.duration) ? video.duration : undefined);
                          setSourceVideoRatio(video.videoWidth / video.videoHeight);
                          setVideoMetadata({ width: video.videoWidth, height: video.videoHeight });
                          if (!visualActivo?.metadata?.aspectRatioLabel && pistaVideo.length <= 1 && !videoResultadoUrl) {
                            adoptarFormatoVisual(detected);
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
                  <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA" style={{ width: '80px', height: '80px', borderRadius: '16px', opacity: 0.4, filter: 'grayscale(100%)' }} />
                  <span style={{ fontSize: '0.8rem', color: '#555', letterSpacing: '1px' }}>NAYLA EDITOR</span>
                </div>
              )}
            </div>

            {/* REPRODUCTOR FLOTANTE AUTO-OCULTABLE (5 SEGUNDOS) */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                bottom: '12px',
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
                opacity: (showPlaybackControls || !isPlaying) ? 1 : 0,
                pointerEvents: (showPlaybackControls || !isPlaying) ? 'auto' : 'none'
              }}
            >
              <span style={{ color: '#888', fontSize: '0.65rem', fontFamily: 'monospace' }}>00:00:00</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={(e) => { e.stopPropagation(); seekBy(-10); }} style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '0.9rem', cursor: 'pointer', outline: 'none' }}>↺10</button>
                <button onClick={(e) => { e.stopPropagation(); togglePlay(); }} style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '1.2rem', cursor: 'pointer', outline: 'none' }}>{isPlaying ? '⏸' : '▶'}</button>
                <button onClick={(e) => { e.stopPropagation(); seekBy(10); }} style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '0.9rem', cursor: 'pointer', outline: 'none' }}>10↻</button>
              </div>
              <span style={{ color: '#888', fontSize: '0.65rem', fontFamily: 'monospace' }}>00:00:00</span>
            </div>
          </div>
        </div>

        {/* SECCIÓN INFERIOR: LÍNEA DE TIEMPO Y TRACKS */}
        <div style={{
          height: '76px',
          flexShrink: 0,
          backgroundColor: '#050505',
          borderTop: '1px solid #1a1a1a',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
          padding: '4px 0',
          overflow: 'hidden'
        }} onClick={() => setClipSeleccionado(null)}>
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', backgroundColor: '#fff', zIndex: 50, pointerEvents: 'none', boxShadow: '0 0 10px rgba(255,255,255,0.8)' }} />
          <div className="timeline-track" ref={timelineRef}
            onScroll={(e) => {
              if (!isUserScrolling) return;
              if (!playerRef.current) return;
              const scrollPos = e.currentTarget.scrollLeft;
              const seconds = scrollPos / 20;
              const frame = Math.round(seconds * 30);
              playerRef.current.currentTime = (Math.max(0, frame)) / 30;
            }}
            onPointerDown={() => setIsUserScrolling(true)}
            onPointerUp={() => { setTimeout(() => setIsUserScrolling(false), 50); }}
            onPointerLeave={() => { setTimeout(() => setIsUserScrolling(false), 50); }}
            style={{ paddingLeft: '50%', paddingRight: '50%' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="neon-btn"
              onClick={(e) => { e.stopPropagation(); setMainNav('boveda'); setIsSubPanelOpen(true); }}
              style={{ width: '36px', height: '44px', minWidth: '36px', borderRadius: '8px', flexShrink: 0, marginRight: hayClips ? '6px' : '0', borderStyle: 'dashed', cursor: 'pointer', fontSize: '1.2rem' }}>+</div>

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
                      if (playerRef.current) {
                        let frameCount = 0;
                        for (let i = 0; i < lineaDeTiempo.length; i++) {
                          if (lineaDeTiempo[i].id === clip.id) break;
                          frameCount += Math.round((lineaDeTiempo[i].durationInSeconds || 5) * 30);
                        }
                        playerRef.current.currentTime = (frameCount) / 30;
                      }
                    }}
                    onRemove={() => quitarDelTimeline(clip.id)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', height: '22px', overflowX: 'auto', padding: '0 50%', gap: '2px', marginTop: '4px' }} onClick={(e) => e.stopPropagation()}>
            {pistaAudio.map((clip) => (
              <div key={clip.id} onClick={() => setClipSeleccionado(clip.id)} className="audio-block neon-btn" style={{ borderColor: clipSeleccionado === clip.id ? '#fff' : '#404040' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '4px' }}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                {clip.etiqueta}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* 4. MODAL / OVERLAY PANTALLA COMPLETA DE NAYLA IA */}
      {isAiModalOpen && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9900,
          backgroundColor: 'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur))',
          WebkitBackdropFilter: 'blur(var(--glass-blur))',
          border: '1px solid rgba(var(--glow-color-rgb), calc(var(--glow-intensity) * 0.5))',
          boxShadow: '0 0 var(--glow-spread) rgba(var(--glow-color-rgb), var(--glow-intensity))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Header Modal IA */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1a1a1a',
            backgroundColor: '#0a0a0a',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <img
                src="/assets/imagenes/Icono-intro.jpeg"
                alt="Nayla"
                style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #00cc66' }}
              />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, color: '#fff', fontSize: '1.1rem', fontWeight: 'bold' }}>Nayla IA</h3>
                  <span style={{ backgroundColor: '#1a1a1a', color: '#00ffcc', fontSize: '0.75rem', fontWeight: 'bold', padding: '2px 8px', borderRadius: '12px' }}>
                    {chatMessages.length}
                  </span>
                </div>
                <p style={{ margin: '2px 0 0 0', color: '#888', fontSize: '0.75rem' }}>Asistente Curador de Contenido Inteligente</p>
              </div>
            </div>

            {/* Botón de Cerrar X */}
            <button
              onClick={() => setIsAiModalOpen(false)}
              style={{
                background: '#1a1a1a',
                border: '1px solid #333',
                color: '#fff',
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                fontWeight: 'bold'
              }}
            >
              ✕
            </button>
          </div>

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
                color: selectedAiProvider === 'groq' ? '#00ffcc' : '#888',
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
                color: selectedAiProvider === 'mistral' ? '#00ffcc' : '#888',
                fontWeight: 'bold',
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Nayla Pro
            </button>
          </div>

          {/* Chat Messages Body */}
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {chatMessages.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#666', marginTop: '40px', fontSize: '0.95rem' }}>
                ¡Hola! Soy Nayla. Dime qué necesitas o pega un enlace para asistirte en la edición.
              </div>
            ) : (
              chatMessages.map((msg, i) => (
                <div key={i} style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  backgroundColor: msg.role === 'user' ? '#1a1a1a' : '#0d0d0d',
                  color: '#fff',
                  padding: '12px 16px',
                  borderRadius: '14px',
                  maxWidth: '80%',
                  border: msg.role === 'ai' ? '1px solid #262626' : '1px solid #333',
                  fontSize: '0.95rem',
                  lineHeight: '1.5'
                }}>
                  {msg.text}
                </div>
              ))
            )}
            {chatProcessing && (
              <div style={{ alignSelf: 'flex-start', color: '#00ffcc', padding: '10px', fontSize: '0.9rem', fontStyle: 'italic' }}>
                Nayla está pensando...
              </div>
            )}
          </div>

          {/* Chat Input */}
          <div style={{
            padding: '12px 12px',
            borderTop: '1px solid #1a1a1a',
            backgroundColor: '#0a0a0a',
            display: 'flex',
            gap: '8px',
            boxSizing: 'border-box',
            width: '100%',
            maxWidth: '100vw'
          }}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendNaylaMessage()}
              placeholder="Escribe aquí tu mensaje..."
              style={{
                flex: 1,
                minWidth: 0,
                padding: '10px 12px',
                backgroundColor: '#111',
                border: '1px solid #333',
                borderRadius: '10px',
                color: '#fff',
                outline: 'none',
                fontSize: '0.9rem',
                boxSizing: 'border-box'
              }}
            />
            <button
              onClick={sendNaylaMessage}
              disabled={chatProcessing}
              style={{
                padding: '10px 16px',
                backgroundColor: chatProcessing ? '#333' : '#00cc66',
                color: '#000',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 'bold',
                cursor: chatProcessing ? 'not-allowed' : 'pointer',
                flexShrink: 0,
                fontSize: '0.85rem'
              }}
            >
              ENVIAR
            </button>
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
