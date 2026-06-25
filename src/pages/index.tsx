// @ts-nocheck
/* eslint-disable */
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';

const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? createClient(supabaseUrl, supabaseAnonKey)
  : {
      auth: {
        getSession: async () => ({ data: { session: { user: { email: 'dev@test.com' } } } }),
        signInWithOtp: async () => ({ error: null }),
        verifyOtp: async () => ({ error: null })
      }
    } as unknown as ReturnType<typeof createClient>;

type Rect = { id: string; x: number; y: number; width: number; height: number };
type MediaItem = { id: string; url: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; creado_en: string; esOverlay: boolean; etiqueta: string };
type TimelineItem = { id: string; mediaId: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; etiqueta: string; url: string };
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
  const [message, setMessage] = useState('');
  const [navActiva, setNavActiva] = useState<string | null>(null);
  const [codigoJsInput, setCodigoJsInput] = useState('// Inyecta comandos JS aquí\nNaylaEngine.unir("V1", "V2");');
  const [toolMessage, setToolMessage] = useState<string | null>(null);
  const [marcoConfig, setMarcoConfig] = useState<MarcoConfig>({ posicion: 'derecha+abajo', grosor: 80, color: '#ffffff' });
  const [marcoImagenes, setMarcoImagenes] = useState<{ original: string; procesada: string; nombre: string }[]>([]);
  const [marcoProcesando, setMarcoProcesando] = useState(false);
  const [galeriaMultimedia, setGaleriaMultimedia] = useState<MediaItem[]>([]);
  const [lineaDeTiempo, setLineaDeTiempo] = useState<TimelineItem[]>([]);
  const [clipSeleccionado, setClipSeleccionado] = useState<string | null>(null);
  const [canvasRatio, setCanvasRatio] = useState<'9/16' | '16/9' | '1/1' | '4/5'>('9/16');
  const [calidadExportacion, setCalidadExportacion] = useState('1080p');
  const [showIntro, setShowIntro] = useState(true);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoTerminado, setVideoTerminado] = useState<string | null>(null);
  const [videoResultadoUrl, setVideoResultadoUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState({ width: 1080, height: 1920 });
  const [isPlaying, setIsPlaying] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);
  const [resizingInfo, setResizingInfo] = useState<{ id: string, corner: string } | null>(null);
  const [draggingInfo, setDraggingInfo] = useState<{ id: string, offsetX: number, offsetY: number } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const timer = setTimeout(() => setShowIntro(false), 3000);
    return () => clearTimeout(timer);
  }, []);

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
      const { error } = await supabase.auth.verifyOtp({ email: emailInput, token: otpInput, type: 'email' });
      if (error) throw error;
    } catch (err) { setMessage('Código incorrecto.'); }
    finally { setAuthLoading(false); }
  };

  const handlePasteCode = async () => {
    try { const text = await navigator.clipboard.readText(); if (text) setOtpInput(text.trim()); } catch (err) {}
  };

  const handleSubirMultimedia = async (e: React.ChangeEvent<HTMLInputElement>, tipo: 'foto' | 'video' | 'audio') => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    const nuevosItems: MediaItem[] = files.map((file, index) => {
      const countTipo = galeriaMultimedia.filter(item => item.tipo === tipo).length + index + 1;
      const inicial = tipo === 'video' ? 'V' : tipo === 'foto' ? 'F' : 'A';
      return { id: (Date.now() + index).toString(), url: URL.createObjectURL(file), tipo, nombre: file.name, creado_en: new Date().toLocaleTimeString(), esOverlay: false, etiqueta: `${inicial}${countTipo}` };
    });
    setGaleriaMultimedia([...galeriaMultimedia, ...nuevosItems]);
    if (tipo === 'video' && !videoTerminado) { setVideoFile(files[0]); setVideoTerminado(nuevosItems[0].url); setVideoResultadoUrl(null); }
  };

  const eliminarDeGaleria = (id: string) => {
    setGaleriaMultimedia(galeriaMultimedia.filter(item => item.id !== id));
    setLineaDeTiempo(lineaDeTiempo.filter(item => item.mediaId !== id));
  };

  const agregarAlTimeline = (item: MediaItem) => {
    const nuevo: TimelineItem = { id: Date.now().toString(), mediaId: item.id, tipo: item.tipo, nombre: item.nombre, etiqueta: item.etiqueta, url: item.url };
    setLineaDeTiempo([...lineaDeTiempo, nuevo]);
    if (item.tipo === 'video' || item.tipo === 'foto') { setVideoTerminado(item.url); setVideoResultadoUrl(null); setRects([]); }
  };

  const quitarDelTimeline = (id: string) => { setLineaDeTiempo(lineaDeTiempo.filter(t => t.id !== id)); setClipSeleccionado(null); };

  const renombrarItem = (id: string, nuevoNombre: string) => {
    setGaleriaMultimedia(galeriaMultimedia.map(item => item.id === id ? { ...item, nombre: nuevoNombre } : item));
    setLineaDeTiempo(lineaDeTiempo.map(item => item.mediaId === id ? { ...item, nombre: nuevoNombre } : item));
  };

  const handleToolClick = (tool: any) => {
    if (navActiva === tool.id) { setNavActiva(null); setToolMessage(null); return; }
    setNavActiva(tool.id);
    if (['galeria', 'herramientas', 'script', 'ia', 'marco'].includes(tool.id)) setToolMessage(null);
    else setToolMessage('PRÓXIMAMENTE');
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) { videoRef.current.play(); setIsPlaying(true); }
      else { videoRef.current.pause(); setIsPlaying(false); }
    }
  };

  const handleDescargar = () => {
    const url = videoResultadoUrl || videoTerminado;
    if (!url) return alert('No hay ningún video cargado para descargar.');
    const a = document.createElement('a'); a.href = url; a.download = `Nayla_Export_${calidadExportacion}_${Date.now()}.mp4`; a.click();
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
    if (!videoTerminado || !containerRef.current || resizingInfo || draggingInfo) return;
    const c = containerRef.current.getBoundingClientRect();
    setStartPos({ x: e.clientX - c.left, y: e.clientY - c.top });
    setIsDrawing(true);
    setCurrentRect({ id: Date.now().toString(), x: e.clientX - c.left, y: e.clientY - c.top, width: 0, height: 0 });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!videoTerminado || !containerRef.current) return;
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
    .clip-block { height: 70px; min-width: 80px; width: 80px; position: relative; cursor: pointer; flex-shrink: 0; border-top: 2px solid transparent; border-bottom: 2px solid transparent; border-right: 1px solid #000; transition: 0.2s; }
    .clip-block:first-child { border-top-left-radius: 10px; border-bottom-left-radius: 10px; }
    .clip-block:last-child { border-top-right-radius: 10px; border-bottom-right-radius: 10px; border-right: none; }
    .clip-block.selected { border: 2px solid #ffffff; z-index: 10; box-shadow: 0 0 15px rgba(255,255,255,0.4); border-radius: 10px; }
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
        <div style={{ minHeight: '100vh', backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
          <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA" style={{ width: '150px', height: '150px', borderRadius: '24px', objectFit: 'cover', animation: 'fadeIn 1s ease-in-out' }} />
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
            {(videoResultadoUrl || videoTerminado) ? (
              <>
                {/* FIX AUDIO: removido muted */}
                <video ref={videoRef} src={videoResultadoUrl || videoTerminado} loop playsInline onLoadedMetadata={(e) => setVideoMetadata({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
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
          <div style={{ position: 'absolute', left: hayClips ? '56px' : '50%', top: 0, bottom: 0, width: '2px', backgroundColor: '#fff', zIndex: 50, pointerEvents: 'none', boxShadow: '0 0 10px rgba(255,255,255,0.8)', transition: 'left 0.3s ease' }} />
          <div className="timeline-track" ref={timelineRef}
            style={{ paddingLeft: hayClips ? '8px' : 'calc(50% - 20px)', paddingRight: '50%', transition: 'padding-left 0.3s ease' }}
            onClick={(e) => e.stopPropagation()}>
            {/* FIX BOTÓN +: agregado e.stopPropagation() */}
            <div className="neon-btn"
              onClick={(e) => { e.stopPropagation(); setNavActiva('galeria'); setToolMessage(null); }}
              style={{ width: '40px', height: '60px', minWidth: '40px', borderRadius: '10px', flexShrink: 0, marginRight: hayClips ? '6px' : '0', borderStyle: 'dashed', cursor: 'pointer', fontSize: '1.4rem', transition: 'margin 0.3s ease' }}>+</div>
            {pistaVideo.map((clip) => (
              <div key={clip.id}
                onClick={(e) => { e.stopPropagation(); setClipSeleccionado(clip.id); }}
                className={`clip-block ${clipSeleccionado === clip.id ? 'selected' : ''}`}>
                {clip.tipo === 'video'
                  ? <video src={clip.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline />
                  : <img src={clip.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                <span style={{ position: 'absolute', top: '4px', left: '6px', fontSize: '0.6rem', color: '#fff', fontWeight: 'bold', textShadow: '0 2px 4px #000', backgroundColor: 'rgba(0,0,0,0.5)', padding: '2px 4px', borderRadius: '4px' }}>{clip.etiqueta}</span>
                {clipSeleccionado === clip.id && (
                  <div onClick={(e) => { e.stopPropagation(); quitarDelTimeline(clip.id); }}
                    style={{ position: 'absolute', top: '-8px', right: '-8px', width: '18px', height: '18px', backgroundColor: '#ff4444', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', zIndex: 20, color: '#fff' }}>✕</div>
                )}
              </div>
            ))}
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
              <div style={{ maxHeight: '35vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem' }}>
                  <label className="neon-btn" style={{ flex: 1, padding: '1rem', borderStyle: 'dashed', borderRadius: '12px', fontSize: '0.75rem', cursor: 'pointer' }}>+ SUBIR VIDEO/FOTO<input type="file" multiple accept="video/*,image/*" onChange={(e) => handleSubirMultimedia(e, 'video')} style={{ display: 'none' }} /></label>
                  <label className="neon-btn" style={{ flex: 1, padding: '1rem', borderStyle: 'dashed', borderRadius: '12px', fontSize: '0.75rem', cursor: 'pointer' }}>+ SUBIR AUDIO<input type="file" multiple accept="audio/*" onChange={(e) => handleSubirMultimedia(e, 'audio')} style={{ display: 'none' }} /></label>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {galeriaMultimedia.map(item => (
                    <div key={item.id} className="neon-btn" style={{ justifyContent: 'space-between', padding: '1rem', borderRadius: '16px', borderStyle: 'solid' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                        <span style={{ fontSize: '0.8rem', backgroundColor: '#262626', padding: '4px 8px', borderRadius: '6px', color: '#fff', fontWeight: 'bold' }}>{item.etiqueta}</span>
                        <input type="text" value={item.nombre} onChange={(e) => renombrarItem(item.id, e.target.value)} style={{ background: 'transparent', border: 'none', color: '#fff', outline: 'none', width: '100%' }} />
                      </div>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="neon-btn nav-btn active" onClick={() => agregarAlTimeline(item)} style={{ padding: '6px 12px', fontSize: '0.65rem' }}>+ PISTA</button>
                        <button onClick={() => eliminarDeGaleria(item.id)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                      </div>
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
                <p style={{ fontSize: '0.75rem', color: '#fff', fontWeight: 'bold', marginBottom: '1rem', letterSpacing: '1px' }}>SCRIPT MANUAL</p>
                <textarea value={codigoJsInput} onChange={(e) => setCodigoJsInput(e.target.value)} style={{ width: '100%', height: '80px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', color: '#00ffcc', padding: '1rem', fontFamily: 'monospace', outline: 'none' }} />
              </div>
            )}

            {!toolMessage && navActiva === 'ia' && (
              <div style={{ maxHeight: '35vh', overflowY: 'auto' }}>
                <div style={{ textAlign: 'center', padding: '2rem', color: '#a3a3a3', fontSize: '1rem', letterSpacing: '2px' }}>SUPERVISOR IA (En desarrollo)</div>
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
