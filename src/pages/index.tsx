// @ts-nocheck
/* eslint-disable */
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTimelineItem } from '../components/SortableTimelineItem';
import { getVideoMetadata, getAudioDurationInSeconds } from '@remotion/media-utils';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('ERROR CRÍTICO: Variables de entorno de Supabase no configuradas.');
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Rect = { id: string; x: number; y: number; width: number; height: number };
type MediaItem = { id: string; url: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; creado_en: string; esOverlay: boolean; etiqueta: string; fuente?: string };
type TimelineItem = { id: string; mediaId: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; etiqueta: string; url: string; durationInSeconds?: number; volume?: number; fadeIn?: number; fadeOut?: number; scale?: number; delay?: number; startFrom?: number; loop?: boolean; };
type SubtitleItem = { id: string; texto: string; inicioSec: number; finSec: number; };
type MarcoConfig = {
  posicion: 'derecha' | 'izquierda' | 'abajo' | 'arriba' | 'derecha+abajo' | 'derecha+arriba' | 'izquierda+abajo' | 'izquierda+arriba';
  grosor: number;
  color: string;
};


const MAIN_TOOLS = [
  { id: 'editor', nombre: 'EDITOR', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg> },
  { id: 'boveda', nombre: 'BÓVEDA', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> },
  { id: 'buscar', nombre: 'BUSCAR', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> },
  { id: 'ia', nombre: 'IA', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg> },
  { id: 'nube', nombre: 'NUBE', icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg> }
];

const SUB_TOOLS: Record<string, any[]> = {
  editor: [
    { id: 'cortar', nombre: 'Cortar', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg> },
    { id: 'dividir', nombre: 'Dividir', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"/><line x1="4" y1="12" x2="8" y2="12"/><line x1="16" y1="12" x2="20" y2="12"/></svg> },
    { id: 'borrar', nombre: 'Borrar', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> },
    { id: 'volumen', nombre: 'Volumen', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> },
    { id: 'velocidad', nombre: 'Velocidad', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
    { id: 'girar', nombre: 'Girar', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg> },
    { id: 'duplicar', nombre: 'Duplicar', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> },
    { id: 'texto', nombre: 'Texto', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg> },
    { id: 'marco', nombre: 'Marco', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="6" y="6" width="12" height="12" rx="1"/></svg> },
    { id: 'filtro', nombre: 'Filtro', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg> },
  ],
  boveda: [
    { id: 'subir-vf', nombre: 'Subir (V/F)', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> },
    { id: 'subir-a', nombre: 'Subir Audio', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> },
    { id: 'enlace', nombre: 'Enlace', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> },
    { id: 'filtro-todo', nombre: 'Todo', isFilter: true, filterValue: 'todo' },
    { id: 'filtro-videos', nombre: 'Videos', isFilter: true, filterValue: 'videos' },
    { id: 'filtro-fotos', nombre: 'Fotos', isFilter: true, filterValue: 'fotos' },
    { id: 'filtro-audios', nombre: 'Audios', isFilter: true, filterValue: 'audios' },
  ],
  buscar: [
    { id: 'youtube', nombre: 'YouTube', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33 2.78 2.78 0 0 0 1.94 2c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg> },
    { id: 'pixabay', nombre: 'Pixabay', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg> },
    { id: 'musicastock', nombre: 'Música Stock', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> },
    { id: 'noticias', nombre: 'Noticias', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> },
    { id: 'artistas', nombre: 'Artistas', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="5"/><line x1="12" y1="13" x2="12" y2="22"/><line x1="12" y1="17" x2="19" y2="14"/><line x1="12" y1="17" x2="5" y2="14"/></svg> },
    { id: 'stockvideo', nombre: 'Stock Video', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/></svg> },
  ],
  ia: [
    { id: 'supervisor', nombre: 'Supervisor', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg> },
    { id: 'delogo', nombre: 'Delogo', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> },
    { id: 'sonidos', nombre: 'Sonidos (TTS)', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg> },
    { id: 'iafoto', nombre: 'IA Foto', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> },
    { id: 'script', nombre: 'Script', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> },
    { id: 'render', nombre: 'Render', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> },
  ]
};


export default function NaylaCore() {
  const [darkMode, setDarkMode] = useState(true);
  const [session, setSession] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpEnviado, setOtpEnviado] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [iaApiKey, setIaApiKey] = useState('');
  const [iaPrompt, setIaPrompt] = useState('Haz un video con 3 clips y ponles subtítulos');
  const [iaLoading, setIaLoading] = useState(false);
  const [iaBandejasAbiertas, setIaBandejasAbiertas] = useState(false);
  const [iaBandejaActiva, setIaBandejaActiva] = useState('audio'); // 'audio', 'fotos', 'videos'
  const [iaAudioTexto, setIaAudioTexto] = useState('');
  const [iaFotosFotoBase, setIaFotosFotoBase] = useState('');
  const [iaFotosPrompt, setIaFotosPrompt] = useState('');

  const [customAlertMsg, setCustomAlertMsg] = useState<string | null>(null);

  const showAlert = (msg: string) => {
    setCustomAlertMsg(msg);
  };

  const [message, setMessage] = useState('');
  const [mainNav, setMainNav] = useState<string>('boveda');
  const [subTool, setSubTool] = useState<string | null>(null);
  const [filtroGaleria, setFiltroGaleria] = useState<string>('todo'); // todo, videos, fotos, audios
  const [searchQuery, setSearchQuery] = useState('');

  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
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
  const [clipSeleccionado, setClipSeleccionado] = useState<string | null>(null);
  const [canvasRatio, setCanvasRatio] = useState<'9/16' | '16/9' | '1/1' | '4/5'>('9/16');
  const [calidadExportacion, setCalidadExportacion] = useState('1080p');
  const [showIntro, setShowIntro] = useState(true);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [renderLogs, setRenderLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const [mediaActivaUrl, setMediaActivaUrl] = useState<string | null>(null);
  const [videoResultadoUrl, setVideoResultadoUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState({ width: 1080, height: 1920 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScriptRunning, setIsScriptRunning] = useState(false);

  // Storage Viewer States
  const [storageFiles, setStorageFiles] = useState<any[]>([]);
  const [isLoadingStorage, setIsLoadingStorage] = useState<boolean>(false);

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

  const [isUserScrolling, setIsUserScrolling] = useState(false);

  useEffect(() => {
    const handleUp = () => setIsUserScrolling(false);
    window.addEventListener('pointerup', handleUp);
    return () => window.removeEventListener('pointerup', handleUp);
  }, []);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
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
  const [chatModel, setChatModel] = useState<'flash' | 'pro'>('flash');

  const sendNaylaMessage = async () => {
    if (!chatInput.trim()) return;
    const newMessages = [...chatMessages, { role: 'user', text: chatInput }];
    setChatMessages(newMessages as any);
    setChatInput('');
    setChatProcessing(true);

    try {
      const res = await fetch('/api/chat-nayla', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: chatInput, model: chatModel === 'flash' ? 'manus-flash' : 'manus-pro' })
      });
      const data = await res.json();

      setChatMessages(prev => [...prev, { role: 'ai', text: data.text }]);

      if (data.action === 'CLIP_VIDEO' && data.payload) {
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
    } catch (error) {
      console.error(error);
      setChatMessages(prev => [...prev, { role: 'ai', text: 'Lo siento, ocurrió un error procesando tu solicitud.' }]);
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) cargarDatosUsuario(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) cargarDatosUsuario(session.user.id);
    });

    const timer = setTimeout(() => setShowIntro(false), 3000);
    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

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

  const cargarDatosUsuario = async (userId: string) => {
    try {
      // Cargar Bodega
      const { data: galeriaData, error: galeriaError } = await supabase
        .from('galeria_multimedia')
        .select('*')
        .eq('user_id', userId)
        .order('creado_en', { ascending: true });

      if (!galeriaError && galeriaData) {
        // Adaptar si es necesario, o setear directo si coinciden los campos
        const galeria = galeriaData.map(item => ({
          id: item.id,
          url: item.url,
          tipo: item.tipo,
          nombre: item.nombre,
          creado_en: item.creado_en,
          esOverlay: item.esOverlay,
          etiqueta: item.etiqueta
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
      const { data: proyectoData, error: proyectoError } = await supabase
        .from('proyectos_usuario')
        .select('linea_de_tiempo')
        .eq('user_id', userId)
        .single();

      if (!proyectoError && proyectoData && proyectoData.linea_de_tiempo) {
        setLineaDeTiempo(proyectoData.linea_de_tiempo);
        // Si hay clips, establecer el primero que sea video/foto como mediaActivaUrl
        const clipsVisuales = proyectoData.linea_de_tiempo.filter((c: any) => c.tipo === 'video' || c.tipo === 'foto');
        if (clipsVisuales.length > 0 && !mediaActivaUrl) {
          setMediaActivaUrl(clipsVisuales[0].url);
          setClipSeleccionado(clipsVisuales[0].id);
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
        let targetW = 1080, targetH = 1920;
        if (canvasRatio === '16/9') { targetW = 1920; targetH = 1080; }
        if (canvasRatio === '1/1') { targetW = 1080; targetH = 1080; }
        if (canvasRatio === '4/5') { targetW = 1080; targetH = 1350; }
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

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    setAuthLoading(true); setMessage('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: emailInput, options: { shouldCreateUser: true } });
      if (error) throw error;
      setOtpEnviado(true);
    } catch (err) { setMessage('Error crítico de transmisión.'); }
    finally { setAuthLoading(false); }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpInput || !emailInput) return;
    setAuthLoading(true); setMessage('');
    try {
      const { data, error } = await supabase.auth.verifyOtp({ email: emailInput, token: otpInput, type: 'email' });
      if (error) throw error;
      if (data?.session) setSession(data.session);
      setShowIntro(true);
      setTimeout(() => setShowIntro(false), 3000);
    } catch (err) { setMessage('Código incorrecto.'); }
    finally { setAuthLoading(false); }
  };

  const handlePasteCode = async () => {
    try { const text = await navigator.clipboard.readText(); if (text) setOtpInput(text.trim()); } catch (err) {}
  };

  const [subiendoArchivo, setSubiendoArchivo] = useState(false);

  const handleSubirMultimedia = async (e: React.ChangeEvent<HTMLInputElement>, tipo: 'foto' | 'video' | 'audio') => {
    if (!e.target.files || e.target.files.length === 0) return;

    // Esperar sesión si no está lista
    let currentSession = session;
    if (!currentSession) {
      const { data } = await supabase.auth.getSession();
      currentSession = data.session;
    }

    const files = Array.from(e.target.files);
    setSubiendoArchivo(true);

    try {
      const nuevosItems: MediaItem[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const countTipo = galeriaMultimedia.filter(item => item.tipo === tipo).length + i + 1;
        const inicial = tipo === 'video' ? 'V' : tipo === 'foto' ? 'F' : 'A';
        const id = (Date.now() + i).toString();

        let finalUrl = URL.createObjectURL(file); // Fallback local

        if (currentSession) {
          // Subir a Supabase Storage
          const fileExt = file.name.split('.').pop();
          const fileName = `${currentSession.user.id}/${id}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('media_bodega')
            .upload(fileName, file);

          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage
              .from('media_bodega')
              .getPublicUrl(fileName);
            finalUrl = publicUrl;
          } else {
            console.error('Error subiendo al storage:', uploadError);
          }
        }

        const nuevoItem: MediaItem = {
          id,
          url: finalUrl,
          tipo,
          nombre: file.name,
          creado_en: new Date().toLocaleTimeString(),
          esOverlay: false,
          etiqueta: `${inicial}${countTipo}`
        };

        nuevosItems.push(nuevoItem);
      }

      setGaleriaMultimedia(prev => [...prev, ...nuevosItems]);

      if (session) {
        // Sincronizar con Supabase (fuera del state updater para evitar doble ejecución en StrictMode)
        const { error } = await supabase.from('galeria_multimedia')
          .insert(nuevosItems.map(item => ({ ...item, user_id: session.user.id })));

        if (error) console.error('Error insertando en base de datos:', error);
      }

      if (tipo === 'video' && !mediaActivaUrl) {
        setVideoFile(files[0]);
        setMediaActivaUrl(nuevosItems[0].url);
        setClipSeleccionado(nuevosItems[0].id); // Marcar como seleccionado
        setVideoResultadoUrl(null);
      }
    } catch (err) {
      console.error('Error procesando subida:', err);
      showAlert('Hubo un error al procesar los archivos.');
    } finally {
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

    // 2. Borrar archivos físicos del Storage si están hospedados en Supabase
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
      }
    }

    // 3. Borrar registros de la base de datos
    const { error } = await supabase
      .from('galeria_multimedia')
      .delete()
      .in('id', ids)
      .eq('user_id', session.user.id);

    if (error) {
      console.error('Error eliminando de Supabase BD:', error);
      showAlert('Error al eliminar de la base de datos: ' + error.message);
    }
  };

  const eliminarDeGaleria = async (id: string) => {
    await eliminarItemsGaleria([id]);
  };

  const sincronizarLineaDeTiempo = async (nuevaLinea: TimelineItem[]) => {
    if (session) {
      const { error } = await supabase
        .from('proyectos_usuario')
        .upsert(
          {
            user_id: session.user.id,
            linea_de_tiempo: nuevaLinea,
            actualizado_en: new Date().toISOString()
          },
          { onConflict: 'user_id' }
        );
      if (error) {
        console.error('Error sincronizando línea de tiempo:', error);
      }
    }
  };

  const agregarAlTimeline = async (item: MediaItem) => {
    let durationInSeconds: number | undefined = undefined;
    if (item.tipo === 'audio') {
      try {
        durationInSeconds = await getAudioDurationInSeconds(item.url);
      } catch (e) {
        console.warn('Could not load audio duration for', item.url);
      }
    } else if (item.tipo === 'video') {
      try {
        const metadata = await getVideoMetadata(item.url);
        durationInSeconds = metadata.durationInSeconds;
      } catch (e) {
        console.warn('Could not load metadata for', item.url);
      }
    } else if (item.tipo === 'foto') {
      durationInSeconds = 5;
    }

    const nuevo: TimelineItem = { id: Date.now().toString(), mediaId: item.id, tipo: item.tipo, nombre: item.nombre, etiqueta: item.etiqueta, url: item.url, durationInSeconds };
    const nuevaLinea = [...lineaDeTiempo, nuevo];
    setLineaDeTiempo(nuevaLinea);

    setClipSeleccionado(nuevo.id);
    setMediaActivaUrl(nuevo.url);
    setVideoResultadoUrl(null);
    setRects([]);

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
      const { error } = await supabase
        .from('galeria_multimedia')
        .update({ nombre: nuevoNombre })
        .eq('id', id)
        .eq('user_id', session.user.id);

      if (error) {
        console.error('Error renombrando en Supabase:', error);
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

  const handleDescargar = () => {
    const url = videoResultadoUrl || mediaActivaUrl;
    if (!url) return showAlert('No hay ningún video cargado para descargar.');
    const a = document.createElement('a'); a.href = url; a.download = `Nayla_Export_${calidadExportacion}_${Date.now()}.mp4`; a.click();
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

      let durationInSeconds: number | undefined = undefined;
      try {
        if (resolvedTipo === 'audio') {
          durationInSeconds = await getAudioDurationInSeconds(finalMediaUrl);
        } else if (resolvedTipo === 'video') {
          const metadata = await getVideoMetadata(finalMediaUrl);
          durationInSeconds = metadata.durationInSeconds;
        } else if (resolvedTipo === 'foto') {
          durationInSeconds = 5;
        }
      } catch (e) {
        console.warn('No se pudo cargar la metadata para', finalMediaUrl);
      }

      // Calcular id base
      const id = Date.now().toString() + index + Math.random().toString().slice(2, 6);

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
        etiqueta: etiquetaBase
      };

      const esPrimerVideo = galeriaMultimedia.length === 0 || !galeriaMultimedia.find(i => i.tipo === 'video');

      // Update state functionally without side-effects inside
      setGaleriaMultimedia(prev => {
         // Verificación de seguridad: si ya se agregó, no duplicarlo
         if (prev.find(i => i.id === nuevoItem.id)) return prev;
         return [...prev, nuevoItem];
      });

      if (esPrimerVideo && index === 0) {
         setMediaActivaUrl(nuevoItem.url);
         setClipSeleccionado(nuevoItem.id);
         setVideoResultadoUrl(null);
      }

      if (session) {
         supabase
             .from('galeria_multimedia')
             .insert([{ ...nuevoItem, user_id: session.user.id }])
             .then(({ error }) => {
                 if (error) console.error('Error insertando en Supabase:', error);
             });
      }

      // Actualizar estado de descarga a listo
      setDescargasActivas(prev => prev.map(d => d.id === descargaId ? { ...d, status: 'listo' } : d));

      return { ...nuevoItem, durationInSeconds };

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
                 return { ...media, durationInSeconds };
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
                    durationInSeconds: (item as any).durationInSeconds !== undefined ? (item as any).durationInSeconds : (item.tipo === 'foto' ? 5 : undefined)
                  });
                  agregados++;
                }
             });
             if(agregados > 0) setTimeout(() => sincronizarLineaDeTiempo(nuevaLinea), 0);
             return nuevaLinea;
          });
        },
        modificar: (etiqueta: string, opciones: any) => {
          const opcionesPermitidas = ['volume', 'fadeIn', 'fadeOut', 'scale', 'delay', 'startFrom', 'loop', 'url', 'nombre', 'durationInSeconds', 'playbackRate', 'transitionDuration', 'transitionType', 'efecto', 'brightness', 'contrast', 'saturation', 'blur'];
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
        limpiar: async () => {
           return new Promise<void>((resolve) => {
               setLineaDeTiempo([]);
               setSubtitulos([]);
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
    if (!mediaActivaUrl || !containerRef.current || resizingInfo || draggingInfo) return;
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

  const pistaVideo = lineaDeTiempo.filter(t => t.tipo === 'video' || t.tipo === 'foto');
  const pistaAudio = lineaDeTiempo.filter(t => t.tipo === 'audio');
  const hayClips = pistaVideo.length > 0;

  const POSICIONES: MarcoConfig['posicion'][] = ['derecha', 'izquierda', 'abajo', 'arriba', 'derecha+abajo', 'derecha+arriba', 'izquierda+abajo', 'izquierda+arriba'];
  const ICONOS_POS: Record<string, string> = { derecha: '→', izquierda: '←', abajo: '↓', arriba: '↑', 'derecha+abajo': '↘', 'derecha+arriba': '↗', 'izquierda+abajo': '↙', 'izquierda+arriba': '↖' };

  const globalStyles = `
    .main-btn { flex: 1; border: 1px solid transparent; color: #a3a3a3; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; font-size: 10px; font-weight: bold; cursor: pointer; transition: all 0.2s ease; border-radius: 12px; height: 70px; }
    .main-btn.active { box-shadow: 0 0 15px rgba(0,0,0,0.2); }
    ${darkMode ? '.main-btn { background: #0a0a0a; border-color: #262626; } .main-btn:hover { color: #ffffff; border-color: #404040; } .main-btn.active { background: #ffffff; color: #000000; border-color: #ffffff; box-shadow: 0 0 15px rgba(255,255,255,0.5); }' : '.main-btn { background: #f3f4f6; border-color: #e5e7eb; color: #4b5563; } .main-btn:hover { color: #000000; border-color: #d1d5db; } .main-btn.active { background: #000000; color: #ffffff; border-color: #000000; }'}

    .sub-btn { background: transparent; border: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; font-size: 7px; cursor: pointer; transition: 0.2s; min-width: 48px; min-height: 48px; padding: 4px; }
    ${darkMode ? '.sub-btn { color: #a3a3a3; } .sub-btn:hover { color: #ffffff; } .sub-btn.active { color: #ffffff; font-weight: bold; }' : '.sub-btn { color: #4b5563; } .sub-btn:hover { color: #000000; } .sub-btn.active { color: #000000; font-weight: bold; }'}

    .sub-btn .icon-container { width: 36px; height: 36px; display: flex; justify-content: center; align-items: center; border-radius: 10px; transition: all 0.2s ease; border: 1px solid transparent; }
    ${darkMode ? '.sub-btn .icon-container { background: #111; } .sub-btn:hover .icon-container { background: #222; } .sub-btn.active .icon-container { background: #ffffff; color: #000000; border-color: #ffffff; box-shadow: 0 0 10px rgba(255,255,255,0.4); }' : '.sub-btn .icon-container { background: #e5e7eb; border-color: #d1d5db; } .sub-btn:hover .icon-container { background: #d1d5db; } .sub-btn.active .icon-container { background: #000000; color: #ffffff; border-color: #000000; box-shadow: 0 0 10px rgba(0,0,0,0.2); }'}

    .sub-row { display: flex; gap: 4px; overflow-x: auto; padding: 12px 16px; align-items: center; min-height: 70px; }
    .sub-row::-webkit-scrollbar { height: 0; }
    .main-row { display: flex; gap: 12px; overflow-x: auto; padding: 16px; width: 100%; }
    .main-row::-webkit-scrollbar { height: 0; }
    .source-badge { position: absolute; top: 6px; right: 6px; font-size: 0.55rem; font-weight: bold; padding: 2px 4px; border-radius: 4px; color: #fff; z-index: 10; letter-spacing: 0.5px; }
    .source-badge.yt { background-color: #cc0000; }
    .source-badge.px { background-color: #009900; }
    .source-badge.ia { background-color: #6600cc; }
    .source-badge.mio { background-color: #404040; }

    @keyframes spin { to { transform: rotate(360deg); } }
    ::-webkit-scrollbar { height: 4px; width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #404040; border-radius: 10px; }
    * { -webkit-tap-highlight-color: transparent; }
    button:focus, button:active { outline: none; background-color: inherit; }
    .neon-btn { background: #0a0a0a; border: 1px solid #262626; color: #a3a3a3; transition: all 0.2s ease; display: flex; justify-content: center; align-items: center; gap: 8px; }
    .neon-btn:active, .neon-btn.active { background: #ffffff; color: #000000; border-color: #ffffff; box-shadow: 0 0 15px rgba(255,255,255,0.5); }
    .nav-btn { font-size: 0.7rem; font-weight: bold; padding: 0.8rem 1.2rem; border-radius: 100px; cursor: pointer; text-transform: uppercase; white-space: nowrap; }
    .tool-btn { background: transparent; border: none; color: #a3a3a3; display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 0.7rem; cursor: pointer; transition: 0.2s; min-width: 70px; }
    .tool-btn:hover { color: #ffffff; }
    .tool-icon { width: 54px; height: 54px; display: flex; justify-content: center; align-items: center; border-radius: 14px; transition: all 0.2s ease; border: 1px solid transparent; }
    .tool-btn.active .tool-icon, .tool-btn:active .tool-icon { background: #ffffff !important; color: #000000 !important; box-shadow: 0 0 15px rgba(255,255,255,0.7) !important; border-color: #ffffff !important; }
    .tool-btn.active span, .tool-btn:active span { color: #ffffff; font-weight: bold; }
    .timeline-track { display: flex; height: 70px; overflow-x: auto; align-items: center; gap: 0; -webkit-overflow-scrolling: touch; }
    .timeline-track::-webkit-scrollbar { height: 0; }
    .clip-block { height: 70px; position: relative; cursor: pointer; flex-shrink: 0; border-top: 2px solid transparent; border-bottom: 2px solid transparent; border-right: 1px solid #000; transition: 0.2s; }
    .clip-block:first-child { border-top-left-radius: 10px; border-bottom-left-radius: 10px; }
    .clip-block:last-child { border-top-right-radius: 10px; border-bottom-right-radius: 10px; border-right: none; }
    .clip-block.selected { border: 2px solid #ffffff; box-sizing: border-box; z-index: 10; box-shadow: 0 0 15px rgba(255,255,255,0.4); border-radius: 10px; }
    .audio-block { height: 35px; border-radius: 8px; flex-shrink: 0; min-width: 120px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 0.65rem; cursor: pointer; margin-right: 2px; border: 1px solid #404040; }
    .toolbar-container { display: flex; gap: 8px; overflow-x: auto; padding: 12px 16px; background-color: #050505; border-top: 1px solid #1a1a1a; min-height: 95px; position: relative; z-index: 100; align-items: center; }
    .toolbar-container::-webkit-scrollbar { height: 0; }
    .panel-container { background-color: #050505; border-top: 1px solid #1a1a1a; padding: 15px; position: absolute; bottom: 95px; left: 0; right: 0; z-index: 90; box-shadow: 0 -5px 20px rgba(0,0,0,0.8); }
    .marco-pos-btn { background: #0a0a0a; border: 1px solid #262626; color: #a3a3a3; border-radius: 10px; padding: 8px 6px; font-size: 0.7rem; cursor: pointer; transition: 0.2s; text-align: center; font-weight: bold; }
    .marco-pos-btn.selected { background: #ffffff; color: #000000; border-color: #ffffff; box-shadow: 0 0 10px rgba(255,255,255,0.5); }
  `;

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
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#000', color: darkMode ? '#fff' : '#000', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' }}>
        <Head><title>NAYLA - AUTENTICACIÓN</title></Head>
        <style>{globalStyles}</style>
        <div style={{ width: '100%', maxWidth: '400px', border: '1px solid #262626', backgroundColor: '#050505', padding: '2.5rem', borderRadius: '24px', textAlign: 'center', opacity: otpEnviado ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                    <h1 style={{ fontSize: '1rem', letterSpacing: '4px', margin: '0 0 2rem 0', textTransform: 'uppercase' }}>NAYLA</h1>
          {process.env.NODE_ENV === 'development' && (
            <button
              id="dev-login-bypass"
              type="button"
              onClick={() => {
                setSession({ user: { id: 'test-user-id', email: 'test@example.com' } });
                setShowIntro(true);
                setTimeout(() => setShowIntro(false), 100);
              }}
              style={{ padding: '10px', backgroundColor: '#333', color: 'white', marginBottom: '10px', width: '100%' }}
            >
              DEV LOGIN
            </button>
          )}
          <form onSubmit={handleEmailAuth}>
            <input type="email" placeholder="CORREO MAESTRO" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} disabled={otpEnviado} style={{ width: '100%', padding: '1rem', backgroundColor: '#0a0a0a', border: '1px solid #404040', borderRadius: '16px', color: darkMode ? '#fff' : '#000', fontSize: '0.8rem', marginBottom: '1rem', textAlign: 'center', outline: 'none' }} />
            <button type="submit" disabled={authLoading || otpEnviado} className="neon-btn nav-btn" style={{ width: '100%', marginBottom: '1rem' }}>{authLoading && !otpEnviado ? 'PROCESANDO...' : 'SOLICITAR ACCESO'}</button>
            {message && !otpEnviado && <p style={{ color: '#ff4444', fontSize: '0.8rem', margin: 0 }}>{message}</p>}
          </form>
        </div>
        <div style={{ position: 'fixed', bottom: otpEnviado ? 0 : '-100%', left: 0, right: 0, backgroundColor: '#000', borderTop: '1px solid #fff', borderLeft: '1px solid #fff', borderRight: '1px solid #fff', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '2.5rem', transition: 'bottom 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 100 }}>
          <div style={{ width: '40px', height: '4px', backgroundColor: '#fff', borderRadius: '2px', marginBottom: '2rem', opacity: 0.5 }} />
          {otpEnviado && <p style={{ color: '#00ffcc', fontSize: '0.8rem', marginBottom: '1rem', letterSpacing: '1px', fontWeight: 'bold' }}>CÓDIGO ENVIADO — REVISA TU CORREO</p>}
          <h2 style={{ fontSize: '0.9rem', letterSpacing: '2px', margin: '0 0 1.5rem 0', textTransform: 'uppercase' }}>CÓDIGO DE ACCESO</h2>
          <form onSubmit={handleOtpVerify} style={{ width: '100%', maxWidth: '350px' }}>
            <input type="text" inputMode="numeric" placeholder="CÓDIGO 000000" value={otpInput} onChange={(e) => setOtpInput(e.target.value)} style={{ width: '100%', padding: '1rem', backgroundColor: '#0a0a0a', border: '1px solid #fff', borderRadius: '16px', color: darkMode ? '#fff' : '#000', fontSize: '1rem', marginBottom: '1rem', textAlign: 'center', outline: 'none', letterSpacing: '4px' }} />
            <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
              <button type="button" onClick={handlePasteCode} className="neon-btn nav-btn" style={{ flex: 1, padding: '0.8rem' }}>PEGAR CÓDIGO</button>
              <button type="submit" disabled={authLoading} className="neon-btn nav-btn" style={{ flex: 1, backgroundColor: '#fff', color: '#000', fontWeight: 'bold', padding: '0.8rem' }}>{authLoading ? 'VERIFICANDO...' : 'INGRESAR'}</button>
            </div>
            {message && otpEnviado && <p style={{ color: '#ff4444', fontSize: '0.8rem', margin: 0, textAlign: 'center' }}>{message}</p>}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen w-full flex flex-col overflow-x-hidden select-none ${darkMode ? 'bg-black text-gray-200' : 'bg-white text-gray-800'}`} style={{ fontFamily: 'system-ui, sans-serif' }}>

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
      <style>{globalStyles}</style>

      <header style={{ borderBottom: '1px solid #1a1a1a', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#050505' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA" style={{ width: '35px', height: '35px', borderRadius: '8px', objectFit: 'cover' }} />
          <span style={{ fontSize: '0.7rem', padding: '4px 10px', border: '1px solid #fff', borderRadius: '100px', letterSpacing: '2px', fontWeight: 'bold' }}>LOGIC</span>
          {session && (
            <span style={{
              fontSize: '0.6rem',
              color: '#00ffcc',
              letterSpacing: '1px'
            }}>
              ● {session.user.email}
            </span>
          )}
          {session && (
            <button
              onClick={() => supabase.auth.signOut().then(() => setSession(null))}
              className="neon-btn nav-btn"
              style={{ padding: '4px 10px', fontSize: '0.6rem', color: '#ff4444' }}
            >
              SALIR
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={() => setDarkMode(!darkMode)} className="neon-btn nav-btn" style={{ padding: '6px', color: darkMode ? '#fff' : '#000' }} title={darkMode ? 'Modo Claro' : 'Modo Oscuro'}>
            {darkMode ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            )}
          </button>
          <select value={calidadExportacion} onChange={(e) => setCalidadExportacion(e.target.value)} style={{ backgroundColor: '#000', color: darkMode ? '#fff' : '#000', border: '1px solid #404040', borderRadius: '8px', padding: '6px 10px', fontSize: '0.7rem', outline: 'none' }}>
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p (FHD)</option>
            <option value="4k">4K (UHD)</option>
          </select>
          <button onClick={handleDescargar} className="neon-btn nav-btn" style={{ padding: '8px 16px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            DESCARGAR
          </button>
        </div>
      </header>

      <div className="flex flex-col md:flex-row md:max-w-6xl md:mx-auto w-full gap-4 flex-1 overflow-hidden">

        {/* COLUMNA IZQUIERDA: Monitor de Video y Línea de Tiempo */}
        <div className="flex flex-col w-full md:w-1/2">

        <section style={{ width: '100%', padding: '0', backgroundColor: '#050505' }}>
          <div ref={containerRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
            className="w-full max-w-[430px] mx-auto aspect-[9/16] relative flex items-center justify-center overflow-hidden touch-none" style={{ aspectRatio: canvasRatio, backgroundColor: darkMode ? '#0a0a0a' : '#f0f0f0', border: darkMode ? '1px solid #1a1a1a' : '1px solid #ddd' }}>
            {(lineaDeTiempo.filter(t => t.tipo === 'video' || t.tipo === 'foto').length > 0 || videoResultadoUrl || mediaActivaUrl) ? (
              <>

                <video
                  key={lineaDeTiempo[0]?.url || mediaActivaUrl}
                  src={lineaDeTiempo.filter(t => t.tipo === 'video').at(clipSeleccionado ? lineaDeTiempo.findIndex(t => t.id === clipSeleccionado) : 0)?.url || mediaActivaUrl || ''}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '0' }}
                  controls={false}
                  playsInline
                  muted={false}
                  ref={playerRef as any}
                  onEnded={handleVideoEnded}
                />

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
              <div style={{ display: 'flex', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
                <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA" style={{ width: '80px', height: '80px', borderRadius: '0', opacity: 0.5, filter: 'grayscale(100%)' }} />
              </div>
            )}
          </div>
        </section>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 20px', alignItems: 'center', backgroundColor: '#000', borderBottom: '1px solid #1a1a1a' }}>
          <span style={{ color: '#737373', fontSize: '0.75rem', fontFamily: 'monospace' }}>00:00:00</span>
          <button onClick={togglePlay} style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '1.5rem', cursor: 'pointer', outline: 'none' }}>{isPlaying ? '⏸' : '▶'}</button>
          <span style={{ color: '#737373', fontSize: '0.75rem', fontFamily: 'monospace' }}>00:00:00</span>
        </div>

        {/* TIMELINE HORIZONTAL */}
        <section style={{ height: '140px', backgroundColor: '#050505', position: 'relative', borderBottom: '1px solid #1a1a1a', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '10px 0' }} onClick={() => setClipSeleccionado(null)}>
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', backgroundColor: '#fff', zIndex: 50, pointerEvents: 'none', boxShadow: '0 0 10px rgba(255,255,255,0.8)', transition: 'left 0.3s ease' }} />
          <div className="timeline-track" ref={timelineRef}
            onScroll={(e) => {
              if (!isUserScrolling) return; // Only sync back if user is manually scrolling
              if (!playerRef.current) return;
              const scrollPos = e.currentTarget.scrollLeft;
              const seconds = scrollPos / 20;
              const frame = Math.round(seconds * 30);
              playerRef.current.currentTime = (Math.max(0, frame)) / 30;
            }}
            onPointerDown={() => setIsUserScrolling(true)}
            onPointerUp={() => { setTimeout(() => setIsUserScrolling(false), 50); }}
            onPointerLeave={() => { setTimeout(() => setIsUserScrolling(false), 50); }}
            style={{ paddingLeft: '50%', paddingRight: '50%', transition: 'padding-left 0.3s ease' }}
            onClick={(e) => e.stopPropagation()}>
            {/* FIX BOTÓN +: agregado e.stopPropagation() */}
            <div className="neon-btn"
              onClick={(e) => { e.stopPropagation(); setNavActiva('galeria'); setToolMessage(null); }}
              style={{ width: '40px', height: '60px', minWidth: '40px', borderRadius: '10px', flexShrink: 0, marginRight: hayClips ? '6px' : '0', borderStyle: 'dashed', cursor: 'pointer', fontSize: '1.4rem', transition: 'margin 0.3s ease' }}>+</div>

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
                      // Move player to the start of this clip
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
          <div style={{ display: 'flex', alignItems: 'center', height: '35px', overflowX: 'auto', padding: '0 50%', gap: '2px', marginTop: '8px' }} onClick={(e) => e.stopPropagation()}>
            {pistaAudio.map((clip) => (
              <div key={clip.id} onClick={() => setClipSeleccionado(clip.id)} className="audio-block neon-btn" style={{ borderColor: clipSeleccionado === clip.id ? '#fff' : '#404040' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '5px' }}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                {clip.etiqueta}
              </div>
            ))}
          </div>
        </section>

        </div>

        {/* COLUMNA DERECHA: Herramientas, Galería y Controles */}
        <div className="flex flex-col w-full md:w-1/2 flex-1 overflow-hidden">


        {/* NUEVA ESTRUCTURA DE HERRAMIENTAS */}

        {/* AREA DE PANELES COMPLEJOS (Reemplaza a la galería si están activos) */}
        {toolMessage ? (
          <div className="panel-container" style={{ position: 'relative', bottom: 'auto', flex: 1, minHeight: '35vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', padding: '2rem', color: '#a3a3a3', fontSize: '1rem', letterSpacing: '2px' }}>{toolMessage}</div>
          </div>
        ) : mainNav === 'nube' ? (
          <div className="panel-container" style={{ position: 'relative', bottom: 'auto', flex: 1, minHeight: '35vh', overflowY: 'auto', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.75rem', color: darkMode ? '#fff' : '#000', fontWeight: 'bold', letterSpacing: '1px' }}>EXPLORADOR DE STORAGE (media_bodega)</p>
              <button className="neon-btn nav-btn" onClick={fetchStorageFiles} style={{ padding: '6px 12px', fontSize: '0.7rem' }}>
                {isLoadingStorage ? 'Cargando...' : 'Actualizar'}
              </button>
            </div>

            {isLoadingStorage ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#737373', fontSize: '0.8rem' }}>Cargando archivos...</div>
            ) : storageFiles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#737373', fontSize: '0.8rem' }}>No hay archivos en la bodega.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {storageFiles.map((file, i) => {
                  const isFolder = file.id === null && !file.name.includes('.');
                  if (isFolder || file.name === '.emptyFolderPlaceholder') return null; // Saltar carpetas o placeholders

                  const size = file.metadata?.size;
                  const sizeFormatted = size ? (size / 1024 / 1024).toFixed(2) + ' MB' : 'Desconocido';
                  const dateFormatted = file.created_at ? new Date(file.created_at).toLocaleString() : '';

                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: darkMode ? '#111' : '#f9f9f9', border: `1px solid ${darkMode ? '#222' : '#e5e5e5'}`, padding: '10px 12px', borderRadius: '8px' }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '10px' }}>
                        <p style={{ fontSize: '0.8rem', color: darkMode ? '#fff' : '#000', margin: 0, fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</p>
                        <p style={{ fontSize: '0.65rem', color: '#737373', margin: '4px 0 0 0' }}>{sizeFormatted} • {dateFormatted}</p>
                      </div>
                      <button
                        onClick={() => deleteStorageFile(file.name)}
                        style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', padding: '4px' }}
                        title="Eliminar archivo"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : subTool && ['marco', 'delogo', 'script', 'supervisor', 'render'].includes(subTool) ? (
          <div className="panel-container" style={{ position: 'relative', bottom: 'auto', flex: 1, minHeight: '35vh', overflowY: 'auto' }}>
            {/* COMPONENTES DE PANELES COMPLEJOS */}
            {subTool === 'marco' && (
              <div>
                <p style={{ fontSize: '0.75rem', color: darkMode ? '#fff' : '#000', fontWeight: 'bold', marginBottom: '1rem', letterSpacing: '1px' }}>MARCO — CUBRIR MARCA DE AGUA</p>
                <p style={{ fontSize: '0.65rem', color: '#737373', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Posición del marco</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '1.2rem' }}>
                  {POSICIONES.map(pos => (
                    <button key={pos} className={`marco-pos-btn ${marcoConfig.posicion === pos ? 'selected' : ''}`} onClick={() => setMarcoConfig({ ...marcoConfig, posicion: pos })}>
                      {ICONOS_POS[pos]}<br /><span style={{ fontSize: '0.5rem', opacity: 0.7 }}>{pos}</span>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: '0.65rem', color: '#737373', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>Grosor: {marcoConfig.grosor}px</p>
                <input type="range" min="20" max="200" value={marcoConfig.grosor} onChange={(e) => setMarcoConfig({ ...marcoConfig, grosor: parseInt(e.target.value) })} style={{ width: '100%', marginBottom: '1.2rem', accentColor: '#fff' }} />
                <p style={{ fontSize: '0.65rem', color: '#737373', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>Color</p>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '1.2rem', alignItems: 'center' }}>
                  {['#ffffff', '#000000', '#1a1a1a', '#f5f5f5', '#e0e0e0'].map(color => (
                    <div key={color} onClick={() => setMarcoConfig({ ...marcoConfig, color })} style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: color, cursor: 'pointer', border: marcoConfig.color === color ? '3px solid #00ffcc' : '2px solid #333', flexShrink: 0 }} />
                  ))}
                  <input type="color" value={marcoConfig.color} onChange={(e) => setMarcoConfig({ ...marcoConfig, color: e.target.value })} style={{ width: '36px', height: '36px', borderRadius: '50%', border: 'none', cursor: 'pointer' }} />
                </div>
                <button onClick={procesarImagenesConMarco} disabled={marcoProcesando} className="neon-btn nav-btn"
                  style={{ width: '100%', backgroundColor: marcoProcesando ? '#0a0a0a' : '#fff', color: marcoProcesando ? '#a3a3a3' : '#000', borderColor: marcoProcesando ? '#262626' : '#fff' }}>
                  {marcoProcesando ? 'PROCESANDO...' : '⚡ APLICAR A TODAS LAS FOTOS'}
                </button>
                {marcoImagenes.length > 0 && (
                  <div style={{ marginTop: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <p style={{ fontSize: '0.75rem', color: '#00ffcc', fontWeight: 'bold', margin: 0 }}>✓ {marcoImagenes.length} imágenes procesadas</p>
                      <button onClick={descargarTodasConMarco} className="neon-btn nav-btn" style={{ padding: '6px 14px', fontSize: '0.65rem' }}>DESCARGAR TODAS</button>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px' }}>
                      {marcoImagenes.map((img, i) => (
                        <div key={i} style={{ flexShrink: 0, textAlign: 'center' }}>
                          <img src={img.procesada} style={{ width: '70px', height: '120px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #333', display: 'block', marginBottom: '6px' }} />
                          <button onClick={() => descargarImagenConMarco(img.procesada, img.nombre)} style={{ background: 'none', border: '1px solid #333', color: '#a3a3a3', borderRadius: '6px', padding: '3px 6px', fontSize: '0.55rem', cursor: 'pointer' }}>↓ DL</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {subTool === 'delogo' && (
              <div>
                <p style={{ fontSize: '0.75rem', color: darkMode ? '#fff' : '#000', fontWeight: 'bold', marginBottom: '1rem', letterSpacing: '1px' }}>SUPRESIÓN DE MARCA DE AGUA (DELOGO)</p>
                <div style={{ backgroundColor: '#0a0a0a', padding: '1.5rem', borderRadius: '16px', border: '1px dashed #404040', marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.7rem', color: '#a3a3a3', marginBottom: '1rem' }}>1. Selecciona un video en la pista.<br />2. Dibuja un rectángulo blanco sobre el logo en el monitor.<br />3. Elige el motor de procesamiento.</p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => processVideo('local')} disabled={isProcessing} className="neon-btn nav-btn" style={{ flex: 1 }}>{isProcessing ? 'PROCESANDO...' : 'BORRAR LOGO (LOCAL)'}</button>
                    <button onClick={() => processVideo('nube')} disabled={isProcessing} className="neon-btn nav-btn" style={{ flex: 1 }}>{isProcessing ? 'PROCESANDO...' : 'BORRAR LOGO (APIS)'}</button>
                  </div>
                </div>
              </div>
            )}

            {subTool === 'script' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.75rem', color: darkMode ? '#fff' : '#000', fontWeight: 'bold', letterSpacing: '1px' }}>SCRIPT MANUAL / PLANTILLAS</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {moldesScripts.length > 0 && (
                      <select value={moldeActivo} onChange={cargarMolde} style={{ backgroundColor: '#0a0a0a', color: darkMode ? '#fff' : '#000', border: '1px solid #404040', borderRadius: '8px', padding: '4px 8px', fontSize: '0.65rem' }}>
                        <option value="">-- Seleccionar Plantilla --</option>
                        {moldesScripts.map(m => (
                          <option key={m.nombre} value={m.nombre}>{m.nombre}</option>
                        ))}
                      </select>
                    )}
                    <button onClick={guardarMolde} className="neon-btn nav-btn" style={{ padding: '4px 10px', fontSize: '0.6rem' }}>GUARDAR PLANTILLA</button>
                    {moldeActivo && <button onClick={eliminarMoldeActivo} className="neon-btn nav-btn" style={{ padding: '4px 10px', fontSize: '0.6rem', color: '#ff4444' }}>X</button>}
                  </div>
                </div>
                <p style={{ fontSize: '0.65rem', color: '#737373', marginBottom: '10px' }}>
                  Comandos disponibles: <br />
                  <code style={{ color: '#00ffcc' }}>NaylaEngine.agregar(["V1", "V2"]);</code> - Agrega clips por etiqueta.<br />
                  <code style={{ color: '#00ffcc' }}>{"NaylaEngine.modificar('V1', { volume: 0.5 });"}</code> - Cambia volumen y efectos.<br />
                  <code style={{ color: '#00ffcc' }}>{"NaylaEngine.agregarSubtitulos([{ texto: \"Hola\", inicioSec: 0, finSec: 2 }]);"}</code> - Agrega subtítulos.<br />
                  <code style={{ color: '#00ffcc' }}>NaylaEngine.limpiarSubtitulos();</code> - Borra los subtítulos.<br />
                  <code style={{ color: '#00ffcc' }}>NaylaEngine.limpiar();</code> - Borra pista y subtítulos.
                </p>
                <textarea value={codigoJsInput} onChange={(e) => setCodigoJsInput(e.target.value)} style={{ width: '100%', height: '100px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', color: '#00ffcc', padding: '1rem', fontFamily: 'monospace', outline: 'none', marginBottom: '1rem', resize: 'vertical' }} />
                <button onClick={ejecutarScript} disabled={isScriptRunning} className="neon-btn nav-btn" style={{ width: '100%', backgroundColor: isScriptRunning ? '#404040' : '#fff', color: isScriptRunning ? '#a3a3a3' : '#000', fontWeight: 'bold' }}>
                  {isScriptRunning ? 'EJECUTANDO SCRIPT...' : 'EJECUTAR SCRIPT ▶'}
                </button>
              </div>
            )}


            {subTool === 'render' && (
              <div style={{ padding: '10px' }}>
                <div style={{ fontWeight: 'bold', letterSpacing: '2px', color: '#a3a3a3', marginBottom: '15px' }}>RENDERIZAR VIDEO</div>
                <div style={{ marginBottom: '15px', backgroundColor: '#0a0a0a', border: '1px solid #262626', padding: '15px', borderRadius: '8px' }}>
                  <p style={{ fontSize: '0.8rem', color: '#737373', marginBottom: '10px' }}>
                    Se enviará el estado actual del timeline para ser procesado por Remotion.
                  </p>
                  <ul style={{ fontSize: '0.8rem', color: '#00ffcc', listStyle: 'none', padding: 0 }}>
                    <li>Clips en timeline: {lineaDeTiempo.length}</li>
                    <li>Subtítulos: {subtitulos.length}</li>
                    <li>Formato (Canvas Ratio): {canvasRatio}</li>
                  </ul>
                </div>
                <button
                  onClick={async () => {
                    if (lineaDeTiempo.length === 0) {
                      showAlert('La línea de tiempo está vacía. Añade al menos un clip.');
                      return;
                    }

                    setIsProcessing(true);
                    try {
                      // Validar duraciones antes de enviar a render
                      const lineaValidada = [...lineaDeTiempo];
                      for (let i = 0; i < lineaValidada.length; i++) {
                        const item = lineaValidada[i];
                        if (item.tipo === 'audio' && item.durationInSeconds === undefined) {
                           try {
                             const duration = await getAudioDurationInSeconds(item.url);
                             if (duration !== undefined) {
                               lineaValidada[i] = { ...item, durationInSeconds: duration };
                             } else {
                               throw new Error("No duration returned");
                             }
                           } catch (e) {
                             throw new Error(`El archivo ${item.nombre || item.etiqueta} (${item.url}) no tiene una duración de audio válida y no se pudo obtener. Verifica que el archivo sea accesible y esté en un formato soportado.`);
                           }
                        } else if (item.tipo === 'video' && item.durationInSeconds === undefined) {
                           try {
                             const metadata = await getVideoMetadata(item.url);
                             if (metadata && metadata.durationInSeconds !== undefined) {
                               lineaValidada[i] = { ...item, durationInSeconds: metadata.durationInSeconds };
                             } else {
                               throw new Error("No duration returned");
                             }
                           } catch (e) {
                             throw new Error(`El archivo ${item.nombre || item.etiqueta} (${item.url}) no tiene una duración válida y no se pudo obtener. Verifica que el archivo sea accesible y esté en un formato soportado.`);
                           }
                        }
                      }

                      const inputProps = {
                        timeline: lineaValidada,
                        subtitles: subtitulos,
                        canvasRatio
                      };
                      const res = await fetch('/api/render', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ inputProps })
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.error || 'Error al solicitar renderizado');

                      const jobId = data.jobId;
                      if (jobId) {
                        const pollInterval = setInterval(async () => {
                          try {
                            const statusRes = await fetch(`/api/render-status?jobId=${jobId}`);
                            const statusData = await statusRes.json();

                            if (statusData.logs) {
                              setRenderLogs(statusData.logs);
                            }

                            if (statusData.status === 'completed') {
                              clearInterval(pollInterval);
                              setVideoResultadoUrl(statusData.url);
                              setIsProcessing(false);

                              // Add the rendered video to the gallery
                              setGaleriaMultimedia(prev => {
                                const renderCount = prev.filter(item => item.etiqueta.startsWith('R')).length + 1;
                                const renderItem: MediaItem = {
                                  id: `render-${Date.now()}`,
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
                            } else if (statusData.status === 'error') {
                              clearInterval(pollInterval);
                              setIsProcessing(false);
                              showAlert('Fallo en la nube: ' + (statusData.error || 'Desconocido'));
                            }
                          } catch (err: any) {
                             clearInterval(pollInterval);
                             setIsProcessing(false);
                             showAlert('Error chequeando estado: ' + err.message);
                          }
                        }, 3000);
                      } else {
                        setIsProcessing(false);
                      }
                    } catch (err: any) {
                      setIsProcessing(false);
                      showAlert('Error: ' + err.message);
                    }
                  }}
                  disabled={isProcessing || isScriptRunning}
                  className="neon-btn nav-btn"
                  style={{ width: '100%', backgroundColor: isProcessing || isScriptRunning ? '#404040' : '#fff', color: isProcessing || isScriptRunning ? '#a3a3a3' : '#000', fontWeight: 'bold', padding: '12px' }}
                >
                  {isProcessing ? 'RENDERIZANDO EN LA NUBE... (ESPERE)' : (isScriptRunning ? 'ESPERANDO SCRIPT...' : 'INICIAR RENDER (REMOTION) ▶')}
                </button>
              </div>
            )}

            {subTool === 'supervisor' && (
              <div style={{ padding: '10px' }}>
                <div style={{ fontWeight: 'bold', letterSpacing: '2px', color: '#a3a3a3', marginBottom: '15px' }}>SUPERVISOR IA</div>

                <div style={{ marginBottom: '15px', backgroundColor: '#0a0a0a', border: '1px solid #262626', padding: '10px', borderRadius: '8px' }}>
                   <div style={{ fontSize: '0.7rem', color: '#737373', marginBottom: '5px' }}>Si no tienes API Key, usa el servicio premium (5$ PayPal/Bitcoin)</div>
                   <button className="neon-btn nav-btn" style={{ padding: '6px 15px', fontSize: '0.7rem', width: '100%', marginBottom: '10px', backgroundColor: '#d4af37', color: '#000', fontWeight: 'bold' }}>CONTRATAR PLAN IA ($5)</button>

                   <div style={{ fontSize: '0.7rem', color: '#737373', marginBottom: '5px' }}>O ingresa tu propia API Key de OpenAI:</div>
                   <input
                     type="password"
                     placeholder="sk-proj-..."
                     value={iaApiKey}
                     onChange={(e) => setIaApiKey(e.target.value)}
                     style={{ width: '100%', backgroundColor: '#050505', border: '1px solid #262626', color: darkMode ? '#fff' : '#000', padding: '8px', borderRadius: '5px', fontSize: '0.7rem' }}
                   />
                </div>

                <textarea
                  value={iaPrompt}
                  onChange={(e) => setIaPrompt(e.target.value)}
                  placeholder="Describe lo que quieres que haga la IA (ej: Agrega todos los videos, baja el volumen y pon el subtítulo 'Inicio')"
                  style={{ width: '100%', height: '80px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '8px', color: '#00ffcc', padding: '1rem', fontFamily: 'monospace', outline: 'none', marginBottom: '1rem', resize: 'vertical' }}
                />

                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={async () => {
                       if(!iaPrompt) return;
                       setIaLoading(true);
                       try {
                          const res = await fetch('/api/supervisor', {
                             method: 'POST',
                             headers: { 'Content-Type': 'application/json' },
                             body: JSON.stringify({ prompt: iaPrompt, apiKey: iaApiKey, galeria: galeriaMultimedia })
                          });
                          const data = await res.json();
                          if(data.error) throw new Error(data.error);

                          console.log("Código IA:", data.code);
                          const NaylaEngine = getEngineContext();
                          const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
                          const execute = new AsyncFunction('NaylaEngine', data.code);
                          await execute(NaylaEngine);
                          showAlert('Ejecución IA finalizada');
                       } catch(err: any) {
                          showAlert("Error en IA: " + err.message);
                       } finally {
                          setIaLoading(false);
                       }
                    }}
                    disabled={iaLoading}
                    className="neon-btn nav-btn"
                    style={{ flex: 1, backgroundColor: '#fff', color: '#000', fontWeight: 'bold' }}
                  >
                    {iaLoading ? 'PROCESANDO...' : 'GENERAR Y EJECUTAR 🤖'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#000' }}>

            {/* AREA DE BÚSQUEDA (Si hay sub-herramienta de búsqueda activa) */}
            {subTool && ['youtube', 'pixabay', 'musicastock', 'noticias', 'artistas', 'stockvideo'].includes(subTool) && (
              <div style={{ padding: '10px 16px', backgroundColor: '#050505', borderBottom: '1px solid #1a1a1a', display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder={`Buscar en ${SUB_TOOLS['buscar'].find(t => t.id === subTool)?.nombre || ''}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', color: darkMode ? '#fff' : '#000', fontSize: '0.8rem', outline: 'none' }}
                />
                <button className="neon-btn nav-btn" style={{ padding: '8px 16px' }} onClick={async () => {
                  if (!searchQuery) return;
                  const btnNombre = SUB_TOOLS.buscar.find(t => t.id === subTool)?.nombre;
                  const newMockId = `mock-${Date.now()}`;
                  const count = galeriaMultimedia.length + 1;

                  let tipo: 'video' | 'foto' | 'audio' = 'video';
                  let fuente = subTool;

                  if (subTool === 'pixabay') tipo = 'foto';
                  if (subTool === 'musicastock') tipo = 'audio';
                  if (subTool === 'noticias') tipo = 'foto';
                  if (subTool === 'artistas') tipo = 'foto';

                  const inicial = tipo === 'video' ? 'V' : tipo === 'foto' ? 'F' : 'A';

                  const mockItem: MediaItem = {
                    id: newMockId,
                    url: 'https://www.w3schools.com/html/mov_bbb.mp4',
                    tipo,
                    nombre: `${btnNombre} Resultado ${count}`,
                    creado_en: new Date().toLocaleTimeString(),
                    esOverlay: false,
                    etiqueta: `${inicial}${count}`,
                    fuente
                  };

                  setGaleriaMultimedia(prev => [...prev, mockItem]);
                  setSearchQuery('');
                }}>BUSCAR</button>
              </div>
            )}

            {/* AREA DE INPUT PARA ENLACES O IA (Si sub-herramienta lo requiere y no es panel complejo) */}
            {subTool === 'enlace' && (
              <div style={{ padding: '10px 16px', backgroundColor: '#050505', borderBottom: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  placeholder="Pega uno o varios enlaces web aquí (separados por saltos de línea o comas)..."
                  value={enlaceInput}
                  onChange={(e) => setEnlaceInput(e.target.value)}
                  rows={2}
                  style={{ width: '100%', padding: '0.8rem', backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', color: darkMode ? '#fff' : '#000', outline: 'none', resize: 'vertical' }}
                />
                <button
                  onClick={handleExtraerDesdeEnlace}
                  disabled={descargasActivas.some(d => d.status === 'procesando') || !enlaceInput}
                  className="neon-btn nav-btn"
                  style={{ padding: '0.8rem', backgroundColor: descargasActivas.some(d => d.status === 'procesando') ? '#404040' : '#fff', color: descargasActivas.some(d => d.status === 'procesando') ? '#a3a3a3' : '#000', fontWeight: 'bold' }}
                >
                  {descargasActivas.some(d => d.status === 'procesando') ? 'PROCESANDO ENLACES EN COLA...' : 'PROCESAR ENLACES EN COLA'}
                </button>
                {descargasActivas.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                    {descargasActivas.map(d => (
                      <div key={d.id} style={{ display: 'flex', alignItems: 'center', fontSize: '0.8rem', color: darkMode ? '#ccc' : '#666', backgroundColor: darkMode ? '#1a1a1a' : '#f0f0f0', padding: '4px 8px', borderRadius: '4px' }}>
                        <span style={{ marginRight: '8px', fontSize: '1rem' }}>
                          {d.status === 'procesando' ? '🔄' : d.status === 'listo' ? '✅' : '❌'}
                        </span>
                        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {d.url}
                        </span>
                        <span>
                          {d.status === 'procesando' ? 'Descargando...' : d.status === 'listo' ? 'Listo' : 'Error'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {subTool === 'sonidos' && (
              <div style={{ padding: '10px 16px', backgroundColor: '#050505', borderBottom: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  value={iaAudioTexto}
                  onChange={(e) => setIaAudioTexto(e.target.value)}
                  placeholder="Escribe el texto para generar voz..."
                  style={{ width: '100%', height: '60px', backgroundColor: '#111', border: '1px solid #333', color: darkMode ? '#fff' : '#000', padding: '10px', borderRadius: '8px', fontSize: '0.8rem', resize: 'none' }}
                />
                <button
                  className="neon-btn nav-btn"
                  style={{ backgroundColor: '#00cc66', color: '#000', fontWeight: 'bold' }}
                  onClick={async () => {
                    if (!iaAudioTexto) return showAlert('Ingresa texto primero');
                    try {
                      const res = await fetch('/api/ia-audio', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ texto: iaAudioTexto, email: session?.user?.email })
                      });
                      const data = await res.json();
                      if (data.error) throw new Error(data.error);

                      showAlert(`Audio generado (Simulado). URL: ${data.url}`);
                      setGaleriaMultimedia(prev => [...prev, { id: `ia-audio-${Date.now()}`, nombre: 'Audio Generado IA', tipo: 'audio', url: data.url, etiqueta: 'A_IA', fuente: 'ia' }]);
                    } catch (err: any) {
                      showAlert("Error IA Audio: " + err.message);
                    }
                  }}
                >
                  GENERAR AUDIO
                </button>
              </div>
            )}

            {subTool === 'iafoto' && (
              <div style={{ padding: '10px 16px', backgroundColor: '#050505', borderBottom: '1px solid #1a1a1a', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <select
                  value={iaFotosFotoBase}
                  onChange={(e) => setIaFotosFotoBase(e.target.value)}
                  style={{ width: '100%', backgroundColor: '#111', border: '1px solid #333', color: darkMode ? '#fff' : '#000', padding: '8px', borderRadius: '8px', fontSize: '0.8rem' }}
                >
                  <option value="">-- Seleccionar Foto Base --</option>
                  {galeriaMultimedia.filter(m => m.tipo === 'foto').map(m => (
                    <option key={m.id} value={m.url}>{m.nombre || m.etiqueta}</option>
                  ))}
                </select>
                <textarea
                  value={iaFotosPrompt}
                  onChange={(e) => setIaFotosPrompt(e.target.value)}
                  placeholder="Describe la nueva escena manteniendo la consistencia..."
                  style={{ width: '100%', height: '60px', backgroundColor: '#111', border: '1px solid #333', color: darkMode ? '#fff' : '#000', padding: '10px', borderRadius: '8px', fontSize: '0.8rem', resize: 'none' }}
                />
                <button
                  className="neon-btn nav-btn"
                  style={{ backgroundColor: '#00cc66', color: '#000', fontWeight: 'bold' }}
                  onClick={async () => {
                    if (!iaFotosFotoBase || !iaFotosPrompt) return showAlert('Selecciona foto base y escribe el prompt');
                    try {
                      const res = await fetch('/api/ia-fotos', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fotoBaseUrl: iaFotosFotoBase, prompt: iaFotosPrompt, email: session?.user?.email })
                      });
                      const data = await res.json();
                      if (data.error) throw new Error(data.error);

                      showAlert(`Foto generada (Simulada). URL: ${data.url}`);
                      setGaleriaMultimedia(prev => [...prev, { id: `ia-foto-${Date.now()}`, nombre: 'Foto Generada IA', tipo: 'foto', url: data.url, etiqueta: 'I_IA', fuente: 'ia' }]);
                    } catch (err: any) {
                      showAlert("Error IA Fotos: " + err.message);
                    }
                  }}
                >
                  GENERAR FOTO
                </button>
              </div>
            )}

            {/* GALERÍA SIEMPRE VISIBLE */}
            <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <button
                  onClick={() => {
                    setIsMultiSelectMode(!isMultiSelectMode);
                    if (isMultiSelectMode) setSelectedMediaIds([]);
                  }}
                  style={{
                    backgroundColor: isMultiSelectMode ? '#333' : 'transparent',
                    border: '1px solid #555',
                    color: '#fff',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                  {isMultiSelectMode ? 'Cancelar Selección' : 'Selección Múltiple'}
                </button>

                {isMultiSelectMode && selectedMediaIds.length > 0 && (
                  <button
                    onClick={async () => {
                      if (!confirm(`¿Eliminar ${selectedMediaIds.length} elemento(s)?`)) return;
                      await eliminarItemsGaleria(selectedMediaIds);
                      setSelectedMediaIds([]);
                      setIsMultiSelectMode(false);
                    }}
                    style={{
                      backgroundColor: '#ff4444',
                      border: 'none',
                      color: '#fff',
                      padding: '6px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 'bold',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Eliminar ({selectedMediaIds.length})
                  </button>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '10px' }}>
                {galeriaMultimedia
                  .filter(item => {
                    if (filtroGaleria === 'videos') return item.tipo === 'video';
                    if (filtroGaleria === 'fotos') return item.tipo === 'foto';
                    if (filtroGaleria === 'audios') return item.tipo === 'audio';
                    return true;
                  })
                  .map(item => {
                    const srcFuente = item.fuente || 'propio';
                    let bgBadge = 'mio';
                    let txtBadge = 'MIO';
                    if (srcFuente === 'youtube') { bgBadge = 'yt'; txtBadge = 'YT'; }
                    else if (srcFuente === 'pixabay' || srcFuente === 'noticias' || srcFuente === 'artistas' || srcFuente === 'musicastock' || srcFuente === 'stockvideo') { bgBadge = 'px'; txtBadge = 'PX'; }
                    else if (srcFuente === 'ia' || srcFuente === 'sonidos' || srcFuente === 'iafoto') { bgBadge = 'ia'; txtBadge = 'IA'; }
                    else if (srcFuente === 'render') { bgBadge = 'render'; txtBadge = 'RENDER'; }

                    const isSelected = isMultiSelectMode && selectedMediaIds.includes(item.id);

                    let computedBorderColor = 'transparent';
                    let computedBorderWidth = '1px';
                    if (isSelected) {
                      computedBorderColor = '#ff4444';
                      computedBorderWidth = '3px';
                    } else if (srcFuente === 'render') {
                      computedBorderColor = '#00ffcc';
                      computedBorderWidth = '1px';
                    }

                    return (
                      <div key={item.id} className="neon-btn" style={{ minHeight: '120px', padding: '10px', borderRadius: '12px', borderStyle: 'solid', borderColor: computedBorderColor, borderWidth: computedBorderWidth, flexDirection: 'column', position: 'relative', justifyContent: 'space-between', width: '100%' }}>
                        <div className={`source-badge ${bgBadge}`} style={srcFuente === 'render' ? { backgroundColor: '#00ffcc', color: '#000' } : {}}>{txtBadge}</div>
                        <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.65rem', backgroundColor: '#262626', padding: '2px 6px', borderRadius: '4px', color: darkMode ? '#fff' : '#000', fontWeight: 'bold' }}>{item.etiqueta}</span>
                          <div style={{ display: 'flex', gap: '4px', zIndex: 10 }}>
                            <button onClick={() => descargarIndividual(item.url, item.nombre, item.tipo)} title="Descargar" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid #fff', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                            </button>
                            <button onClick={() => eliminarDeGaleria(item.id)} title="Eliminar" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid #fff', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>
                        </div>

                        <div
                          onClick={() => {
                            if (isMultiSelectMode) {
                              if (selectedMediaIds.includes(item.id)) {
                                setSelectedMediaIds(selectedMediaIds.filter(id => id !== item.id));
                              } else {
                                setSelectedMediaIds([...selectedMediaIds, item.id]);
                              }
                              return;
                            }
                            setMediaActivaUrl(item.url);
                            setClipSeleccionado(item.id);
                            setVideoResultadoUrl(null);
                            if (item.tipo === 'video' && playerRef.current) {
                              const playPromise = playerRef.current.play(); if (playPromise !== undefined) { playPromise.catch(error => console.log('Autoplay prevented:', error)); }
                              setIsPlaying(true);
                            }
                          }}
                          style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: '100%', overflow: 'hidden', cursor: 'pointer', marginTop: '15px' }}>
                          {item.tipo === 'video' && <svg width="24" height="24" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>}
                          {item.tipo === 'audio' && <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>}
                          {item.tipo === 'foto' && <img src={item.url} style={{ width: '100%', height: '40px', objectFit: 'contain', borderRadius: '4px' }} alt={item.nombre} />}
                          <input type="text" value={item.nombre} onChange={(e) => renombrarItem(item.id, e.target.value)} style={{ background: 'transparent', border: 'none', color: darkMode ? '#fff' : '#000', outline: 'none', width: '100%', textAlign: 'center', fontSize: '0.55rem', marginTop: '8px', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }} title={item.nombre} />
                        </div>

                        {srcFuente === 'render' ? (
                          <div style={{ display: 'flex', gap: '8px', width: '100%', marginTop: 'auto' }}>
                             <button onClick={() => {
                                setMediaActivaUrl(item.url);
                                setClipSeleccionado(item.id);
                                setVideoResultadoUrl(item.url);
                                if (playerRef.current) {
                                  const playPromise = playerRef.current.play(); if (playPromise !== undefined) { playPromise.catch(error => console.log('Autoplay prevented:', error)); }
                                  setIsPlaying(true);
                                }
                             }} style={{ padding: '6px', fontSize: '0.5rem', flex: 1, backgroundColor: '#00ffcc', color: '#000', border: 'none', borderRadius: '100px', fontWeight: 'bold', cursor: 'pointer' }}>▶ REPRODUCIR</button>
                             <button onClick={() => descargarIndividual(item.url, item.nombre, item.tipo)} style={{ padding: '6px', fontSize: '0.5rem', flex: 1, backgroundColor: 'transparent', color: '#00ffcc', border: '1px solid #00ffcc', borderRadius: '100px', fontWeight: 'bold', cursor: 'pointer' }}>⬇ DESCARGAR</button>
                          </div>
                        ) : (
                          <button onClick={() => agregarAlTimeline(item)} style={{ padding: '6px', fontSize: '0.5rem', width: '100%', marginTop: 'auto', backgroundColor: '#fff', color: '#000', border: 'none', borderRadius: '100px', fontWeight: 'bold', cursor: 'pointer' }}>+ PISTA</button>
                        )}
                      </div>
                    );
                })}
              </div>
            </div>
          </div>
        )}

        {/* FILA DE SUB-HERRAMIENTAS */}
        <div className={`grid grid-cols-5 gap-2 w-full p-3 border-t ${darkMode ? 'bg-neutral-950 border-neutral-900' : 'bg-gray-50 border-gray-200'}`}>
          {SUB_TOOLS[mainNav]?.map((tool) => {
            if (tool.id === 'subir-vf') {
              return (
                <label key={tool.id} className={`sub-btn w-full ${!darkMode ? 'text-black' : ''}`}>
                  <div className={`icon-container ${!darkMode ? 'bg-gray-200 border-gray-300' : ''}`}>{tool.icon}</div>
                  <span className={!darkMode ? 'text-black font-medium' : ''}>{tool.nombre}</span>
                  <input type="file" multiple accept="video/*,image/*" onChange={(e) => handleSubirMultimedia(e, 'video')} style={{ display: 'none' }} />
                </label>
              );
            }
            if (tool.id === 'subir-a') {
              return (
                <label key={tool.id} className={`sub-btn w-full ${!darkMode ? 'text-black' : ''}`}>
                  <div className={`icon-container ${!darkMode ? 'bg-gray-200 border-gray-300' : ''}`}>{tool.icon}</div>
                  <span className={!darkMode ? 'text-black font-medium' : ''}>{tool.nombre}</span>
                  <input type="file" multiple accept="audio/*" onChange={(e) => handleSubirMultimedia(e, 'audio')} style={{ display: 'none' }} />
                </label>
              );
            }
            if (tool.isFilter) {
              return (
                <button key={tool.id} className={`sub-btn w-full ${filtroGaleria === tool.filterValue ? 'active' : ''} ${!darkMode ? 'text-black' : ''}`} onClick={() => setFiltroGaleria(tool.filterValue)}>
                  <div className={`icon-container ${!darkMode ? 'bg-gray-200 border-gray-300' : ''}`} style={{ border: filtroGaleria === tool.filterValue ? (darkMode ? '1px solid #fff' : '1px solid #000') : (darkMode ? '1px solid #333' : '1px solid #d1d5db') }}>
                    <span style={{ fontSize: '10px' }} className={!darkMode ? 'text-black' : ''}>{tool.nombre.substring(0,2).toUpperCase()}</span>
                  </div>
                  <span className={!darkMode ? 'text-black font-medium' : ''}>{tool.nombre}</span>
                </button>
              );
            }
            return (
              <button key={tool.id} className={`sub-btn w-full ${subTool === tool.id ? 'active' : ''} ${!darkMode ? 'text-black' : ''}`} onClick={() => {
                // Toggle
                if (subTool === tool.id) {
                  setSubTool(null);
                  setToolMessage(null);
                } else {
                  setSubTool(tool.id);
                  if (['marco', 'delogo', 'script', 'supervisor', 'youtube', 'pixabay', 'musicastock', 'noticias', 'artistas', 'stockvideo', 'sonidos', 'iafoto', 'enlace', 'render'].includes(tool.id)) {
                    setToolMessage(null);
                  } else {
                    setToolMessage('PRÓXIMAMENTE');
                  }
                }
              }}>
                <div className={`icon-container ${!darkMode ? 'bg-gray-200 border-gray-300' : ''}`}>{tool.icon}</div>
                <span className={!darkMode ? 'text-black font-medium' : ''}>{tool.nombre}</span>
              </button>
            );
          })}
        </div>

        {/* FILA DE BOTONES PRINCIPALES */}
        <div className={`grid grid-cols-5 gap-2 w-full p-3 ${darkMode ? 'bg-black' : 'bg-white'}`}>
          {MAIN_TOOLS.map((tool) => (
            <button key={tool.id} className={`main-btn w-full ${mainNav === tool.id ? 'active' : ''} ${!darkMode ? 'bg-gray-100 border-gray-300 text-black' : ''}`} style={{ backgroundColor: !darkMode ? (mainNav === tool.id ? '#000' : '#f3f4f6') : undefined, color: !darkMode ? (mainNav === tool.id ? '#fff' : '#000') : undefined }} onClick={() => {
              if (tool.id === 'ia') {
                setIsChatOpen(!isChatOpen);
              }
              setMainNav(tool.id);
              setSubTool(null);
            }}>
              <div>{tool.icon}</div>
              <span className={!darkMode && mainNav !== tool.id ? 'text-black font-bold' : ''}>{tool.nombre}</span>
            </button>
          ))}

        </div>

        {/* NAYLA CHAT SIDEBAR */}
        {isChatOpen && (
          <div style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '350px',
            height: '100%',
            backgroundColor: darkMode ? '#050505' : '#fff',
            borderLeft: `1px solid ${darkMode ? '#1a1a1a' : '#e5e7eb'}`,
            display: 'flex',
            flexDirection: 'column',
            zIndex: 100,
            boxShadow: '-4px 0 15px rgba(0,0,0,0.5)',
            transform: isChatOpen ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.3s ease-in-out'
          }}>
            {/* Header Sidebar */}
            <div style={{ padding: '16px', borderBottom: `1px solid ${darkMode ? '#1a1a1a' : '#e5e7eb'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', backgroundColor: '#00cc66', borderRadius: '50%', boxShadow: '0 0 10px #00cc66' }}></div>
                <h3 style={{ margin: 0, color: darkMode ? '#fff' : '#000', fontSize: '1rem', fontWeight: 'bold' }}>Nayla</h3>
                <select
                  value={chatModel}
                  onChange={(e) => setChatModel(e.target.value as 'flash' | 'pro')}
                  style={{
                    marginLeft: '10px',
                    backgroundColor: darkMode ? '#333' : '#f3f4f6',
                    color: darkMode ? '#fff' : '#000',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '2px 6px',
                    fontSize: '0.8rem',
                    outline: 'none'
                  }}
                >
                  <option value="flash">Nayla Flash</option>
                  <option value="pro">Nayla Pro</option>
                </select>
              </div>
              <button onClick={() => setIsChatOpen(false)} style={{ background: 'none', border: 'none', color: darkMode ? '#fff' : '#000', cursor: 'pointer' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Mensajes */}
            <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {chatMessages.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#666', marginTop: '20px', fontSize: '0.9rem' }}>
                  ¡Hola! Soy Nayla, tu curador de contenido inteligente. Pega un enlace o dime qué necesitas.
                </div>
              ) : (
                chatMessages.map((msg, i) => (
                  <div key={i} style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    backgroundColor: msg.role === 'user' ? (darkMode ? '#1a1a1a' : '#f3f4f6') : (darkMode ? '#0a0a0a' : '#e5e7eb'),
                    color: darkMode ? '#fff' : '#000',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    maxWidth: '85%',
                    border: msg.role === 'ai' ? `1px solid ${darkMode ? '#262626' : '#d1d5db'}` : 'none',
                    fontSize: '0.9rem'
                  }}>
                    {msg.text}
                  </div>
                ))
              )}
              {chatProcessing && (
                <div style={{ alignSelf: 'flex-start', color: '#666', padding: '10px 14px', fontSize: '0.9rem', fontStyle: 'italic' }}>
                  Nayla está pensando...
                </div>
              )}
              {extrayendoVideo && (
                <div style={{ alignSelf: 'center', width: '100%', marginTop: '10px' }}>
                  <div style={{ fontSize: '0.8rem', color: '#00cc66', marginBottom: '4px', textAlign: 'center' }}>Procesando video...</div>
                  <div style={{ width: '100%', backgroundColor: '#262626', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: '100%', backgroundColor: '#00cc66', animation: 'progress-bar 2s infinite ease-in-out' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Input Área */}
            <div style={{ padding: '16px', borderTop: `1px solid ${darkMode ? '#1a1a1a' : '#e5e7eb'}` }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendNaylaMessage()}
                  placeholder="Escribe aquí..."
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    backgroundColor: darkMode ? '#111' : '#f9fafb',
                    border: `1px solid ${darkMode ? '#333' : '#d1d5db'}`,
                    borderRadius: '8px',
                    color: darkMode ? '#fff' : '#000',
                    outline: 'none',
                    fontSize: '0.9rem'
                  }}
                />
                <button
                  onClick={sendNaylaMessage}
                  disabled={chatProcessing || extrayendoVideo}
                  style={{
                    padding: '10px',
                    backgroundColor: chatProcessing || extrayendoVideo ? '#333' : '#00cc66',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: chatProcessing || extrayendoVideo ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </div>
            <style>{`
              @keyframes progress-bar {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
              }
            `}</style>
          </div>
        )}

        </div>
      </div>

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
