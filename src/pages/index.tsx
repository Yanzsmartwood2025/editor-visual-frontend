// @ts-nocheck
/* eslint-disable */
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { Player, PlayerRef } from '@remotion/player';
import { MainComposition } from '../components/MainComposition';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTimelineItem } from '../components/SortableTimelineItem';
import { getVideoMetadata } from '@remotion/media-utils';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('ERROR CRÍTICO: Variables de entorno de Supabase no configuradas.');
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Rect = { id: string; x: number; y: number; width: number; height: number };
type MediaItem = { id: string; url: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; creado_en: string; esOverlay: boolean; etiqueta: string };
type TimelineItem = { id: string; mediaId: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; etiqueta: string; url: string; durationInSeconds?: number; volume?: number; fadeIn?: number; fadeOut?: number };
type SubtitleItem = { id: string; texto: string; inicioSec: number; finSec: number; };
type MarcoConfig = {
  posicion: 'derecha' | 'izquierda' | 'abajo' | 'arriba' | 'derecha+abajo' | 'derecha+arriba' | 'izquierda+abajo' | 'izquierda+arriba';
  grosor: number;
  color: string;
};

const TOOLS = [
  { id: 'galeria', nombre: 'BODEGA', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> },
  { id: 'cortar', nombre: 'CORTAR', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg> },
  { id: 'dividir', nombre: 'DIVIDIR', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="2" x2="12" y2="22"/><line x1="4" y1="12" x2="8" y2="12"/><line x1="16" y1="12" x2="20" y2="12"/></svg> },
  { id: 'borrar', nombre: 'BORRAR', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> },
  { id: 'volumen', nombre: 'VOLUMEN', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg> },
  { id: 'velocidad', nombre: 'VELOCIDAD', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
  { id: 'girar', nombre: 'GIRAR', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg> },
  { id: 'duplicar', nombre: 'DUPLICAR', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> },
  { id: 'inverso', nombre: 'INVERSO', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><polyline points="21 3 21 8 16 8"/></svg> },
  { id: 'congelacion', nombre: 'CONGELACIÓN', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07"/></svg> },
  { id: 'mascara', nombre: 'MÁSCARA', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
  { id: 'opacidad', nombre: 'OPACIDAD', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="2" x2="12" y2="22"/><line x1="12" y1="12" x2="22" y2="12"/></svg> },
  { id: 'filtro', nombre: 'FILTRO', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg> },
  { id: 'efecto', nombre: 'EFECTO', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 3.2A1.2 1.2 0 0 0 8 4v16a1.2 1.2 0 0 0 2 1.2M14 3.2A1.2 1.2 0 0 1 16 4v16a1.2 1.2 0 0 1-2 1.2M6 8H4M6 16H4M20 8h-2M20 16h-2"/></svg> },
  { id: 'texto', nombre: 'TEXTO', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg> },
  { id: 'audio', nombre: 'AUDIO', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg> },
  { id: 'lona', nombre: 'LONA/RATIO', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg> },
  { id: 'marco', nombre: 'MARCO', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="2" width="20" height="20" rx="2"/><rect x="6" y="6" width="12" height="12" rx="1"/></svg> },
  { id: 'herramientas', nombre: 'DELOGO IA ⚡', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> },
  { id: 'script', nombre: 'SCRIPT 💻', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> },
  { id: 'ia', nombre: 'SUPERVISOR IA', icon: <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg> },
];

export default function NaylaCore() {
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

  const [message, setMessage] = useState('');
  const [navActiva, setNavActiva] = useState<string | null>(null);
  const [codigoJsInput, setCodigoJsInput] = useState('// Inyecta comandos JS aquí\n// Ej: NaylaEngine.agregar(["V1", "V2", "A1"]);\n// NaylaEngine.agregarSubtitulos([{ texto: "Hola", inicio: 0, fin: 5 }]);');
  const [moldesScripts, setMoldesScripts] = useState<{ nombre: string; codigo: string }[]>([]);
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
  const [mediaActivaUrl, setMediaActivaUrl] = useState<string | null>(null);
  const [videoResultadoUrl, setVideoResultadoUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState({ width: 1080, height: 1920 });
  const [isPlaying, setIsPlaying] = useState(false);

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
  const playerRef = useRef<PlayerRef>(null);
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
         const frame = playerRef.current.getCurrentFrame();
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
    try {
      const moldesGuardados = localStorage.getItem('nayla_moldes_scripts');
      if (moldesGuardados) {
        setMoldesScripts(JSON.parse(moldesGuardados));
      }
    } catch (e) { console.error('Error cargando moldes:', e); }

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
    if (fotos.length === 0) return alert('No hay fotos en la bodega. Sube fotos primero.');
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
      alert('Hubo un error al procesar los archivos.');
    } finally {
      setSubiendoArchivo(false);
    }
  };

  const eliminarDeGaleria = async (id: string) => {
    setGaleriaMultimedia(galeriaMultimedia.filter(item => item.id !== id));
    setLineaDeTiempo(lineaDeTiempo.filter(item => item.mediaId !== id));

    if (session) {
      const { error } = await supabase
        .from('galeria_multimedia')
        .delete()
        .eq('id', id)
        .eq('user_id', session.user.id);

      if (error) {
        console.error('Error eliminando de Supabase:', error);
      }

      // La línea de tiempo también debe actualizarse si se eliminó de ahí
      sincronizarLineaDeTiempo(lineaDeTiempo.filter(item => item.mediaId !== id));
    }
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
    let durationInSeconds = 5;
    if (item.tipo === 'video' || item.tipo === 'audio') {
      try {
        const metadata = await getVideoMetadata(item.url);
        durationInSeconds = metadata.durationInSeconds;
      } catch (e) {
        console.warn('Could not load metadata for', item.url);
      }
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
      if (playerRef.current.isPlaying()) { playerRef.current.pause(); setIsPlaying(false); }
      else { playerRef.current.play(); setIsPlaying(true); }
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
            playerRef.current.play();
            setIsPlaying(true);
          }
        }, 100);
      }
    }
  };

  const handleDescargar = () => {
    const url = videoResultadoUrl || mediaActivaUrl;
    if (!url) return alert('No hay ningún video cargado para descargar.');
    const a = document.createElement('a'); a.href = url; a.download = `Nayla_Export_${calidadExportacion}_${Date.now()}.mp4`; a.click();
  };

  const procesarEnlaceIndividual = async (url: string, index: number) => {
    try {
      const resApi = await fetch('/api/extract-meta-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const dataApi = await resApi.json();

      if (!resApi.ok || !dataApi.videoUrl) {
        throw new Error(dataApi.error || `No se pudo extraer: ${url}`);
      }

      const finalMediaUrl = dataApi.videoUrl;

      // 1. Calcular de forma síncrona usando el estado actual (fuera del updater)
      const countVideo = galeriaMultimedia.filter(item => item.tipo === 'video').length + 1;
      const id = Date.now().toString() + index;

      const nuevoItem: MediaItem = {
        id,
        url: finalMediaUrl,
        tipo: 'video',
        nombre: `Meta_Video_${countVideo}.mp4`,
        creado_en: new Date().toLocaleTimeString(),
        esOverlay: false,
        etiqueta: `V${countVideo}`
      };

      // 2. Comprobar si es el primer video usando el estado actual
      const esPrimerVideo = galeriaMultimedia.length === 0 || !galeriaMultimedia.find(i => i.tipo === 'video');

      // 3. Hacer el setState updater solo para la galeria
      setGaleriaMultimedia(prev => {
        // En caso de concurrencia aseguramos nombres/etiquetas únicas basadas en "prev" también
        const actualCount = prev.filter(item => item.tipo === 'video').length + 1;
        const itemActualizado = { ...nuevoItem, nombre: `Meta_Video_${actualCount}.mp4`, etiqueta: `V${actualCount}` };

        if (session) {
          supabase
            .from('galeria_multimedia')
            .insert([{ ...itemActualizado, user_id: session.user.id }])
            .then(({ error }) => {
              if (error) console.error('Error insertando en Supabase:', error);
            });
        }
        return [...prev, itemActualizado];
      });

      // 4. Si era el primer video, disparamos los otros setState de manera independiente y segura
      if (esPrimerVideo) {
        setMediaActivaUrl(nuevoItem.url);
        setClipSeleccionado(nuevoItem.id);
        setVideoResultadoUrl(null);
      }

    } catch (err: any) {
      console.error(err);
      alert(`Error extrayendo video: ${err.message}`);
    }
  };

  const guardarMolde = () => {
    const nombre = prompt('Nombre para este molde:', 'Molde Nuevo');
    if (!nombre) return;
    const nuevosMoldes = [...moldesScripts, { nombre, codigo: codigoJsInput }];
    setMoldesScripts(nuevosMoldes);
    localStorage.setItem('nayla_moldes_scripts', JSON.stringify(nuevosMoldes));
    setMoldeActivo(nombre);
  };

  const cargarMolde = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nombre = e.target.value;
    setMoldeActivo(nombre);
    const molde = moldesScripts.find(m => m.nombre === nombre);
    if (molde) {
      setCodigoJsInput(molde.codigo);
    }
  };

  const eliminarMoldeActivo = () => {
    if (!moldeActivo) return;
    const nuevosMoldes = moldesScripts.filter(m => m.nombre !== moldeActivo);
    setMoldesScripts(nuevosMoldes);
    localStorage.setItem('nayla_moldes_scripts', JSON.stringify(nuevosMoldes));
    setMoldeActivo('');
    setCodigoJsInput('// Inyecta comandos JS aquí\n// Ej: NaylaEngine.agregar(["V1", "V2", "A1"]);\n// NaylaEngine.agregarSubtitulos([{ texto: "Hola", inicio: 0, fin: 5 }]);');
  };


  const getEngineContext = () => ({
        agregar: (etiquetas: string[]) => {
          let agregados = 0;
          setLineaDeTiempo(prevLinea => {
             const nuevaLinea = [...prevLinea];
             etiquetas.forEach(etiqueta => {
                const media = galeriaMultimedia.find(m => m.etiqueta === etiqueta);
                if (media) {
                  nuevaLinea.push({
                    id: Date.now().toString() + Math.random().toString(),
                    mediaId: media.id,
                    tipo: media.tipo,
                    nombre: media.nombre,
                    etiqueta: media.etiqueta,
                    url: media.url,
                    durationInSeconds: 5
                  });
                  agregados++;
                }
             });
             if(agregados > 0) setTimeout(() => sincronizarLineaDeTiempo(nuevaLinea), 0);
             return nuevaLinea;
          });
        },
        modificar: (etiqueta: string, opciones: any) => {
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
          const subsAInsertar = nuevosSubtitulos.map(sub => ({ ...sub, id: Date.now().toString() + Math.random().toString() }));
          setSubtitulos(prev => [...prev, ...subsAInsertar]);
        },
        limpiarSubtitulos: () => setSubtitulos([]),
        limpiar: () => {
           setLineaDeTiempo([]);
           setSubtitulos([]);
           setTimeout(() => sincronizarLineaDeTiempo([]), 0);
        }
  });

  const ejecutarScript = () => {
    try {
      // Definir la API disponible en el script
      const NaylaEngine = getEngineContext();

      // Ejecutar el script ingresado en el contexto proporcionado usando Function (más seguro que eval)
      const execute = new Function('NaylaEngine', codigoJsInput);
      execute(NaylaEngine);

    } catch (e: any) {
      alert('Error en el script: ' + e.message);
      console.error('Script Error:', e);
    }
  };

  const handleExtraerDesdeEnlace = async () => {
    if (!enlaceInput) return;

    // Parsear los enlaces, separando por espacios, comas o saltos de línea
    const urlsBrutas = enlaceInput.split(/[\s,]+/).filter(u => u.trim() !== '');
    const urls = urlsBrutas.filter(u => u.includes('meta.ai'));

    if (urls.length === 0) {
      alert('No se encontraron enlaces válidos de Meta AI en el texto.');
      return;
    }

    setExtrayendoVideo(true);
    setQueueProgress(0);

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < urls.length; i++) {
      await procesarEnlaceIndividual(urls[i], i);
      setQueueProgress(Math.round(((i + 1) / urls.length) * 100));

      // Respiro de 5 segundos entre requests, excepto para el último
      if (i < urls.length - 1) {
        await delay(5000);
      }
    }

    setExtrayendoVideo(false);
    setEnlaceInput('');
    // Removemos setShowEnlaceInput(false) para no colapsar la vista al terminar y que el usuario vea los nuevos clips
    setTimeout(() => setQueueProgress(0), 1000); // Limpiar progreso despues de 1s
  };

  const processVideo = async (motorElegido: 'nube' | 'local') => {
    if (!videoFile) return alert('Por favor, sube un video primero.');
    if (rects.length === 0) return alert('Dibuja al menos un recuadro sobre la marca de agua.');
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('video', videoFile); formData.append('coordenadas', JSON.stringify(rects)); formData.append('motor', motorElegido);
      const res = await fetch('/api/clean-video', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok && data.success) { setVideoResultadoUrl(data.url); setRects([]); alert(`Supresión completada: ${motorElegido.toUpperCase()}`); }
      else throw new Error(data.error || 'Fallo en el servidor');
    } catch (err: any) { alert('Error: ' + err.message); }
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
    @keyframes spin { to { transform: rotate(360deg); } }
    ::-webkit-scrollbar { height: 4px; width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #404040; border-radius: 10px; }
    * { -webkit-tap-highlight-color: transparent; }
    button:focus, button:active { outline: none; background-color: inherit; }
    .neon-btn { background: #0a0a0a; border: 1px solid #262626; color: #a3a3a3; transition: all 0.2s ease; display: flex; justify-content: center; align-items: center; gap: 8px; }
    .neon-btn:active, .neon-btn.active { background: #ffffff; color: #000000; border-color: #ffffff; box-shadow: 0 0 15px rgba(255,255,255,0.7); }
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
      <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' }}>
        <Head><title>NAYLA - AUTENTICACIÓN</title></Head>
        <style>{globalStyles}</style>
        <div style={{ width: '100%', maxWidth: '400px', border: '1px solid #262626', backgroundColor: '#050505', padding: '2.5rem', borderRadius: '24px', textAlign: 'center', opacity: otpEnviado ? 0.5 : 1, transition: 'opacity 0.3s' }}>
          <h1 style={{ fontSize: '1rem', letterSpacing: '4px', margin: '0 0 2rem 0', textTransform: 'uppercase' }}>NAYLA</h1>
          <form onSubmit={handleEmailAuth}>
            <input type="email" placeholder="CORREO MAESTRO" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} disabled={otpEnviado} style={{ width: '100%', padding: '1rem', backgroundColor: '#0a0a0a', border: '1px solid #404040', borderRadius: '16px', color: '#fff', fontSize: '0.8rem', marginBottom: '1rem', textAlign: 'center', outline: 'none' }} />
            <button type="submit" disabled={authLoading || otpEnviado} className="neon-btn nav-btn" style={{ width: '100%', marginBottom: '1rem' }}>{authLoading && !otpEnviado ? 'PROCESANDO...' : 'SOLICITAR ACCESO'}</button>
            {message && !otpEnviado && <p style={{ color: '#ff4444', fontSize: '0.8rem', margin: 0 }}>{message}</p>}
          </form>
        </div>
        <div style={{ position: 'fixed', bottom: otpEnviado ? 0 : '-100%', left: 0, right: 0, backgroundColor: '#000', borderTop: '1px solid #fff', borderLeft: '1px solid #fff', borderRight: '1px solid #fff', borderTopLeftRadius: '24px', borderTopRightRadius: '24px', padding: '2.5rem', transition: 'bottom 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 100 }}>
          <div style={{ width: '40px', height: '4px', backgroundColor: '#fff', borderRadius: '2px', marginBottom: '2rem', opacity: 0.5 }} />
          {otpEnviado && <p style={{ color: '#00ffcc', fontSize: '0.8rem', marginBottom: '1rem', letterSpacing: '1px', fontWeight: 'bold' }}>CÓDIGO ENVIADO — REVISA TU CORREO</p>}
          <h2 style={{ fontSize: '0.9rem', letterSpacing: '2px', margin: '0 0 1.5rem 0', textTransform: 'uppercase' }}>CÓDIGO DE ACCESO</h2>
          <form onSubmit={handleOtpVerify} style={{ width: '100%', maxWidth: '350px' }}>
            <input type="text" inputMode="numeric" placeholder="CÓDIGO 000000" value={otpInput} onChange={(e) => setOtpInput(e.target.value)} style={{ width: '100%', padding: '1rem', backgroundColor: '#0a0a0a', border: '1px solid #fff', borderRadius: '16px', color: '#fff', fontSize: '1rem', marginBottom: '1rem', textAlign: 'center', outline: 'none', letterSpacing: '4px' }} />
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
    <div style={{ minHeight: '100vh', backgroundColor: '#000', color: '#ededed', fontFamily: 'system-ui, sans-serif' }}>
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
          <select value={calidadExportacion} onChange={(e) => setCalidadExportacion(e.target.value)} style={{ backgroundColor: '#000', color: '#fff', border: '1px solid #404040', borderRadius: '8px', padding: '6px 10px', fontSize: '0.7rem', outline: 'none' }}>
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

      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <section style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px', backgroundColor: '#050505' }}>
          <div ref={containerRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
            style={{ aspectRatio: canvasRatio, height: '42vh', maxHeight: '42vh', minHeight: '42vh', backgroundColor: '#0a0a0a', borderRadius: '16px', overflow: 'hidden', position: 'relative', border: '1px solid #1a1a1a', touchAction: 'none' }}>
            {(lineaDeTiempo.filter(t => t.tipo === 'video' || t.tipo === 'foto').length > 0 || videoResultadoUrl || mediaActivaUrl) ? (
              <>

                <Player
                  ref={playerRef}
                  component={MainComposition}
                  inputProps={{
                    subtitles: subtitulos,
                    timeline: (clipSeleccionado && !lineaDeTiempo.find(t => t.id === clipSeleccionado))
                      ? [{
                          id: 'preview',
                          mediaId: 'preview',
                          tipo: galeriaMultimedia.find(item => item.id === clipSeleccionado)?.tipo || (mediaActivaUrl?.includes('.mp4') || videoResultadoUrl ? 'video' : 'foto'),
                          nombre: 'Preview',
                          etiqueta: 'PREVIEW',
                          url: videoResultadoUrl || mediaActivaUrl,
                          durationInSeconds: 30
                        } as TimelineItem]
                      : lineaDeTiempo.length > 0
                        ? lineaDeTiempo
                        : (videoResultadoUrl || mediaActivaUrl) ? [{
                            id: 'preview',
                            mediaId: 'preview',
                            tipo: galeriaMultimedia.find(item => item.id === clipSeleccionado)?.tipo || (mediaActivaUrl?.includes('.mp4') || videoResultadoUrl ? 'video' : 'foto'),
                            nombre: 'Preview',
                            etiqueta: 'PREVIEW',
                            url: videoResultadoUrl || mediaActivaUrl,
                            durationInSeconds: 30
                          } as TimelineItem] : [],
                    canvasRatio
                  }}
                  durationInFrames={Math.max(300, Math.round(
                    ((clipSeleccionado && !lineaDeTiempo.find(t => t.id === clipSeleccionado))
                      ? [{ durationInSeconds: 30 } as TimelineItem]
                      : lineaDeTiempo.length > 0
                        ? lineaDeTiempo
                        : (videoResultadoUrl || mediaActivaUrl) ? [{ durationInSeconds: 30 } as TimelineItem] : []
                    ).filter(t => t.tipo === 'video' || t.tipo === 'foto' || t.id === 'preview').reduce((acc, t) => acc + (t.durationInSeconds || 5), 0) * 30
                  ))}
                  compositionWidth={canvasRatio === '16/9' ? 1920 : 1080}
                  compositionHeight={canvasRatio === '16/9' ? 1080 : (canvasRatio === '1/1' ? 1080 : (canvasRatio === '4/5' ? 1350 : 1920))}
                  fps={30}
                  style={{ width: '100%', height: '100%' }}
                  controls={false}
                  autoPlay={false}
                  loop
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
                <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA" style={{ width: '80px', height: '80px', borderRadius: '16px', opacity: 0.5, filter: 'grayscale(100%)' }} />
              </div>
            )}
          </div>
        </section>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 20px', alignItems: 'center', backgroundColor: '#000', borderBottom: '1px solid #1a1a1a' }}>
          <span style={{ color: '#737373', fontSize: '0.75rem', fontFamily: 'monospace' }}>00:00:00</span>
          <button onClick={togglePlay} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer', outline: 'none' }}>{isPlaying ? '⏸' : '▶'}</button>
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
              playerRef.current.seekTo(Math.max(0, frame));
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
                        playerRef.current.seekTo(frameCount);
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

        {/* PANELES */}
        {navActiva && (
          <div className="panel-container">
            {toolMessage && <div style={{ textAlign: 'center', padding: '2rem', color: '#a3a3a3', fontSize: '1rem', letterSpacing: '2px' }}>{toolMessage}</div>}

            {!toolMessage && navActiva === 'galeria' && (
              <div style={{ maxHeight: '35vh' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', letterSpacing: '1px' }}>TUS ARCHIVOS</p>
                </div>
                {showEnlaceInput && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1rem' }}>
                    <textarea
                      placeholder="Pega uno o varios enlaces de meta.ai/share aquí (separados por saltos de línea o comas)..."
                      value={enlaceInput}
                      onChange={(e) => setEnlaceInput(e.target.value)}
                      rows={3}
                      style={{ width: '100%', padding: '0.8rem', backgroundColor: '#0a0a0a', border: '1px solid #404040', borderRadius: '8px', color: '#fff', outline: 'none', resize: 'vertical' }}
                    />
                    <button
                      onClick={handleExtraerDesdeEnlace}
                      disabled={extrayendoVideo || !enlaceInput}
                      className="neon-btn nav-btn"
                      style={{ padding: '0.8rem 1.2rem', backgroundColor: extrayendoVideo ? '#404040' : '#fff', color: extrayendoVideo ? '#a3a3a3' : '#000', fontWeight: 'bold', width: '100%' }}
                    >
                      {extrayendoVideo ? 'PROCESANDO ENLACES EN COLA...' : 'PROCESAR ENLACES EN COLA'}
                    </button>
                    {(extrayendoVideo || queueProgress > 0) && (
                      <div style={{ width: '100%', backgroundColor: '#262626', height: '8px', borderRadius: '4px', overflow: 'hidden', marginTop: '4px' }}>
                        <div style={{ height: '100%', width: `${queueProgress}%`, backgroundColor: '#00ffcc', transition: 'width 0.3s ease' }} />
                      </div>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'row', gap: '10px', overflowX: 'auto', paddingBottom: '10px', alignItems: 'stretch' }}>
                  <label className="neon-btn" style={{ minWidth: '120px', width: '120px', height: '140px', padding: '1rem', borderStyle: 'dashed', borderRadius: '12px', fontSize: '0.75rem', cursor: 'pointer', flexDirection: 'column', textAlign: 'center' }}>
                    <span style={{ fontSize: '1.5rem', marginBottom: '8px' }}>+</span>
                    VIDEO / FOTO
                    <input type="file" multiple accept="video/*,image/*" onChange={(e) => handleSubirMultimedia(e, 'video')} style={{ display: 'none' }} />
                  </label>
                  <label className="neon-btn" style={{ minWidth: '120px', width: '120px', height: '140px', padding: '1rem', borderStyle: 'dashed', borderRadius: '12px', fontSize: '0.75rem', cursor: 'pointer', flexDirection: 'column', textAlign: 'center' }}>
                    <span style={{ fontSize: '1.5rem', marginBottom: '8px' }}>+</span>
                    AUDIO
                    <input type="file" multiple accept="audio/*" onChange={(e) => handleSubirMultimedia(e, 'audio')} style={{ display: 'none' }} />
                  </label>
                  <button className="neon-btn" onClick={() => setShowEnlaceInput(!showEnlaceInput)} style={{ minWidth: '120px', width: '120px', height: '140px', padding: '1rem', borderStyle: 'dashed', borderRadius: '12px', fontSize: '0.75rem', cursor: 'pointer', flexDirection: 'column', textAlign: 'center' }}>
                    <span style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🔗</span>
                    ENLACE
                  </button>
                  {galeriaMultimedia.map(item => (
                    <div key={item.id} className="neon-btn" style={{ minWidth: '140px', width: '140px', height: '140px', padding: '10px', borderRadius: '12px', borderStyle: 'solid', borderColor: 'transparent', flexDirection: 'column', position: 'relative', justifyContent: 'space-between' }}>
                      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.65rem', backgroundColor: '#262626', padding: '2px 6px', borderRadius: '4px', color: '#fff', fontWeight: 'bold' }}>{item.etiqueta}</span>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => descargarIndividual(item.url, item.nombre, item.tipo)} title="Descargar" style={{ background: 'none', border: 'none', color: '#00ffcc', cursor: 'pointer', fontSize: '0.8rem', padding: '0' }}>↓</button>
                          <button onClick={() => eliminarDeGaleria(item.id)} title="Eliminar" style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '0.8rem', padding: '0', lineHeight: '1' }}>✕</button>
                        </div>
                      </div>

                      <div
                        onClick={() => {
                          setMediaActivaUrl(item.url);
                          setClipSeleccionado(item.id);
                          setVideoResultadoUrl(null);
                          if (item.tipo === 'video' && playerRef.current) {
                            playerRef.current.play();
                            setIsPlaying(true);
                          }
                        }}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', width: '100%', overflow: 'hidden', cursor: 'pointer' }}>
                        {item.tipo === 'video' && <div style={{ fontSize: '2rem', color: '#a3a3a3' }}>▶️</div>}
                        {item.tipo === 'audio' && <div style={{ fontSize: '2rem', color: '#a3a3a3' }}>🎵</div>}
                        {item.tipo === 'foto' && <img src={item.url} style={{ width: '100%', height: '40px', objectFit: 'contain', borderRadius: '4px' }} alt={item.nombre} />}
                        <input type="text" value={item.nombre} onChange={(e) => renombrarItem(item.id, e.target.value)} style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', width: '100%', textAlign: 'center', fontSize: '0.65rem', marginTop: '8px', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }} title={item.nombre} />
                      </div>

                      <button className="neon-btn nav-btn active" onClick={() => agregarAlTimeline(item)} style={{ padding: '6px', fontSize: '0.6rem', width: '100%', marginTop: 'auto' }}>+ PISTA</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!toolMessage && navActiva === 'marco' && (
              <div style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                <p style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', marginBottom: '1rem', letterSpacing: '1px' }}>MARCO — CUBRIR MARCA DE AGUA</p>
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
                <div style={{ backgroundColor: '#0a0a0a', padding: '10px 14px', borderRadius: '10px', border: '1px solid #1a1a1a', marginBottom: '1.2rem' }}>
                  <span style={{ fontSize: '0.65rem', color: '#a3a3a3' }}>Ratio activo: <strong style={{ color: '#fff' }}>{canvasRatio}</strong> — {galeriaMultimedia.filter(i => i.tipo === 'foto').length} fotos en bodega</span>
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

            {!toolMessage && navActiva === 'herramientas' && (
              <div style={{ maxHeight: '35vh', overflowY: 'auto' }}>
                <p style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', marginBottom: '1rem', letterSpacing: '1px' }}>SUPRESIÓN DE MARCA DE AGUA (DELOGO)</p>
                <div style={{ backgroundColor: '#0a0a0a', padding: '1.5rem', borderRadius: '16px', border: '1px dashed #404040', marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.7rem', color: '#a3a3a3', marginBottom: '1rem' }}>1. Selecciona un video en la pista.<br />2. Dibuja un rectángulo blanco sobre el logo en el monitor.<br />3. Elige el motor de procesamiento.</p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => processVideo('local')} disabled={isProcessing} className="neon-btn nav-btn" style={{ flex: 1 }}>{isProcessing ? 'PROCESANDO...' : 'BORRAR LOGO (LOCAL)'}</button>
                    <button onClick={() => processVideo('nube')} disabled={isProcessing} className="neon-btn nav-btn" style={{ flex: 1 }}>{isProcessing ? 'PROCESANDO...' : 'BORRAR LOGO (APIS)'}</button>
                  </div>
                </div>
              </div>
            )}

            {!toolMessage && navActiva === 'script' && (
              <div style={{ maxHeight: '35vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', letterSpacing: '1px' }}>SCRIPT MANUAL / MOLDES</p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {moldesScripts.length > 0 && (
                      <select value={moldeActivo} onChange={cargarMolde} style={{ backgroundColor: '#0a0a0a', color: '#fff', border: '1px solid #404040', borderRadius: '8px', padding: '4px 8px', fontSize: '0.65rem' }}>
                        <option value="">-- Seleccionar Molde --</option>
                        {moldesScripts.map(m => (
                          <option key={m.nombre} value={m.nombre}>{m.nombre}</option>
                        ))}
                      </select>
                    )}
                    <button onClick={guardarMolde} className="neon-btn nav-btn" style={{ padding: '4px 10px', fontSize: '0.6rem' }}>GUARDAR MOLDE</button>
                    {moldeActivo && <button onClick={eliminarMoldeActivo} className="neon-btn nav-btn" style={{ padding: '4px 10px', fontSize: '0.6rem', color: '#ff4444' }}>X</button>}
                  </div>
                </div>
                <p style={{ fontSize: '0.65rem', color: '#737373', marginBottom: '10px' }}>
                  Comandos disponibles: <br />
                  <code style={{ color: '#00ffcc' }}>NaylaEngine.agregar(["V1", "V2"]);</code> - Agrega clips por etiqueta.<br />
                  <code style={{ color: '#00ffcc' }}>{"NaylaEngine.modificar('V1', { volume: 0.5 });"}</code> - Cambia volumen y efectos.<br />
                  { /* Escape in JSX */ }{ /* */ }<code style={{ color: '#00ffcc' }}>{"NaylaEngine.agregarSubtitulos([{ texto: \"Hola\", inicioSec: 0, finSec: 2 }]);"}</code> - Agrega subtítulos.<br />
                  <code style={{ color: '#00ffcc' }}>NaylaEngine.limpiarSubtitulos();</code> - Borra los subtítulos.<br />
                  <code style={{ color: '#00ffcc' }}>NaylaEngine.limpiar();</code> - Borra pista y subtítulos.
                </p>
                <textarea value={codigoJsInput} onChange={(e) => setCodigoJsInput(e.target.value)} style={{ width: '100%', height: '100px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', color: '#00ffcc', padding: '1rem', fontFamily: 'monospace', outline: 'none', marginBottom: '1rem', resize: 'vertical' }} />
                <button onClick={ejecutarScript} className="neon-btn nav-btn" style={{ width: '100%', backgroundColor: '#fff', color: '#000', fontWeight: 'bold' }}>EJECUTAR SCRIPT ▶</button>
              </div>
            )}

            {!toolMessage && navActiva === 'ia' && (
              <div style={{ maxHeight: '35vh', overflowY: 'auto', padding: '10px' }}>
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
                     style={{ width: '100%', backgroundColor: '#050505', border: '1px solid #262626', color: '#fff', padding: '8px', borderRadius: '5px', fontSize: '0.7rem' }}
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
                          // Ejecutar código usando el mismo contexto de NaylaEngine
                          const NaylaEngine = getEngineContext();
                          const execute = new Function('NaylaEngine', data.code);
                          execute(NaylaEngine);
                          alert('Ejecución IA finalizada');
                       } catch(err: any) {
                          alert("Error en IA: " + err.message);
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

                  <button
                    onClick={() => setIaBandejasAbiertas(!iaBandejasAbiertas)}
                    className="neon-btn nav-btn"
                    style={{ padding: '0 15px', backgroundColor: '#1a1a1a', color: '#fff', border: '1px solid #333' }}
                  >
                    {iaBandejasAbiertas ? 'CERRAR HERRAMIENTAS' : 'HERRAMIENTAS IA'}
                  </button>
                </div>

                {iaBandejasAbiertas && (
                  <div style={{ marginTop: '15px', border: '1px solid #262626', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', borderBottom: '1px solid #262626' }}>
                      <button
                        onClick={() => setIaBandejaActiva('audio')}
                        style={{ flex: 1, padding: '10px', backgroundColor: iaBandejaActiva === 'audio' ? '#262626' : '#0a0a0a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Audio
                      </button>
                      <button
                        onClick={() => setIaBandejaActiva('fotos')}
                        style={{ flex: 1, padding: '10px', backgroundColor: iaBandejaActiva === 'fotos' ? '#262626' : '#0a0a0a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem', borderLeft: '1px solid #262626', borderRight: '1px solid #262626' }}
                      >
                        Fotos
                      </button>
                      <button
                        onClick={() => setIaBandejaActiva('videos')}
                        style={{ flex: 1, padding: '10px', backgroundColor: iaBandejaActiva === 'videos' ? '#262626' : '#0a0a0a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}
                      >
                        Videos
                      </button>
                    </div>

                    <div style={{ padding: '15px', backgroundColor: '#0a0a0a' }}>
                      {iaBandejaActiva === 'audio' && (
                        <div>
                          <textarea
                            value={iaAudioTexto}
                            onChange={(e) => setIaAudioTexto(e.target.value)}
                            placeholder="Escribe el texto para generar voz..."
                            style={{ width: '100%', height: '60px', backgroundColor: '#050505', border: '1px solid #333', color: '#fff', padding: '10px', borderRadius: '5px', fontSize: '0.8rem', marginBottom: '10px', resize: 'none' }}
                          />
                          <button
                            className="neon-btn nav-btn"
                            style={{ width: '100%', backgroundColor: '#00cc66', color: '#000', fontWeight: 'bold' }}
                            onClick={async () => {
                              if (!iaAudioTexto) return alert('Ingresa texto primero');
                              try {
                                const res = await fetch('/api/ia-audio', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ texto: iaAudioTexto, email: session?.user?.email })
                                });
                                const data = await res.json();
                                if (data.error) throw new Error(data.error);

                                alert(`Audio generado (Simulado). URL: ${data.url}`);
                                // Mock agregarlo a la galería
                                setGaleriaMultimedia(prev => [...prev, { id: `ia-audio-${Date.now()}`, nombre: 'Audio Generado IA', tipo: 'audio', url: data.url, etiqueta: 'A_IA' }]);
                              } catch (err: any) {
                                alert("Error IA Audio: " + err.message);
                              }
                            }}
                          >
                            GENERAR AUDIO
                          </button>
                        </div>
                      )}

                      {iaBandejaActiva === 'fotos' && (
                        <div>
                          <div style={{ fontSize: '0.7rem', color: '#737373', marginBottom: '10px' }}>
                            Selecciona una imagen de referencia de la galería:
                          </div>
                          <select
                            value={iaFotosFotoBase}
                            onChange={(e) => setIaFotosFotoBase(e.target.value)}
                            style={{ width: '100%', backgroundColor: '#050505', border: '1px solid #333', color: '#fff', padding: '8px', borderRadius: '5px', fontSize: '0.8rem', marginBottom: '10px' }}
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
                            style={{ width: '100%', height: '60px', backgroundColor: '#050505', border: '1px solid #333', color: '#fff', padding: '10px', borderRadius: '5px', fontSize: '0.8rem', marginBottom: '10px', resize: 'none' }}
                          />
                          <button
                            className="neon-btn nav-btn"
                            style={{ width: '100%', backgroundColor: '#00cc66', color: '#000', fontWeight: 'bold' }}
                            onClick={async () => {
                              if (!iaFotosFotoBase || !iaFotosPrompt) return alert('Selecciona foto base y escribe el prompt');
                              try {
                                const res = await fetch('/api/ia-fotos', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ fotoBaseUrl: iaFotosFotoBase, prompt: iaFotosPrompt, email: session?.user?.email })
                                });
                                const data = await res.json();
                                if (data.error) throw new Error(data.error);

                                alert(`Foto generada (Simulada). URL: ${data.url}`);
                                // Mock agregarlo a la galería
                                setGaleriaMultimedia(prev => [...prev, { id: `ia-foto-${Date.now()}`, nombre: 'Foto Generada IA', tipo: 'foto', url: data.url, etiqueta: 'I_IA' }]);
                              } catch (err: any) {
                                alert("Error IA Fotos: " + err.message);
                              }
                            }}
                          >
                            GENERAR FOTO
                          </button>
                        </div>
                      )}

                      {iaBandejaActiva === 'videos' && (
                        <div style={{ textAlign: 'center', padding: '20px 0', color: '#737373', fontSize: '0.9rem' }}>
                          Próximamente / Manual
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="toolbar-container">
          {TOOLS.map((tool) => (
            <button key={tool.id} className={`tool-btn ${navActiva === tool.id ? 'active' : ''}`} onClick={() => handleToolClick(tool)}>
              <div className="tool-icon">{tool.icon}</div>
              <span>{tool.nombre}</span>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
    }
