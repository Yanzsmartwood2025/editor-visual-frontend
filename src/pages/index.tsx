// @ts-nocheck
/* eslint-disable */
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Rect = { id: string; x: number; y: number; width: number; height: number };
type MediaItem = { id: string; url: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; creado_en: string; esOverlay: boolean; etiqueta: string };
type TimelineItem = { id: string; mediaId: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; etiqueta: string; url: string };

export default function NaylaCore() {
  const [session, setSession] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpEnviado, setOtpEnviado] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  // ESTADOS DE INTERFAZ
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const [fotoUsuarioUrl, setFotoUsuarioUrl] = useState('/assets/imagenes/Icono-intro.jpeg');
  const [navActiva, setNavActiva] = useState<string | null>('herramientas'); 
  const [codigoJsInput, setCodigoJsInput] = useState('// Inyecta comandos JS aquí\nNaylaEngine.unir("V1", "V2");');
  
  // MEMORIA DE EDICIÓN
  const [galeriaMultimedia, setGaleriaMultimedia] = useState<MediaItem[]>([]);
  const [lineaDeTiempo, setLineaDeTiempo] = useState<TimelineItem[]>([]);
  
  // ESTADOS DEL EDITOR VISUAL
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
  
  // ESTADOS DE DIBUJO DE MÁSCARAS
  const [rects, setRects] = useState<Rect[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);
  const [resizingInfo, setResizingInfo] = useState<{ id: string, corner: string } | null>(null);
  const [draggingInfo, setDraggingInfo] = useState<{ id: string, offsetX: number, offsetY: number } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    const timer = setTimeout(() => { setShowIntro(false); }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    setAuthLoading(true); setMessage('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: emailInput, options: { shouldCreateUser: true } });
      if (error) throw error;
      setOtpEnviado(true);
    } catch (err) { setMessage(`Error crítico de transmisión.`); } finally { setAuthLoading(false); }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpInput || !emailInput) return;
    setAuthLoading(true); setMessage('');
    try {
      const { error } = await supabase.auth.verifyOtp({ email: emailInput, token: otpInput, type: 'email' });
      if (error) throw error;
    } catch (err) { setMessage(`Código incorrecto.`); } finally { setAuthLoading(false); }
  };

  // SUBIDA MASIVA
  const handleSubirMultimedia = async (e: React.ChangeEvent<HTMLInputElement>, tipo: 'foto' | 'video' | 'audio') => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    
    const nuevosItems: MediaItem[] = files.map((file, index) => {
      const countTipo = galeriaMultimedia.filter(item => item.tipo === tipo).length + index + 1;
      const inicial = tipo === 'video' ? 'V' : tipo === 'foto' ? 'F' : 'A';
      return {
        id: (Date.now() + index).toString(),
        url: URL.createObjectURL(file),
        tipo: tipo,
        nombre: file.name,
        creado_en: new Date().toLocaleTimeString(),
        esOverlay: false,
        etiqueta: `${inicial}${countTipo}`
      };
    });
    
    setGaleriaMultimedia([...galeriaMultimedia, ...nuevosItems]);
    
    if (tipo === 'video' && !videoTerminado) {
      setVideoFile(files[0]);
      setVideoTerminado(nuevosItems[0].url);
      setVideoResultadoUrl(null);
    }
  };

  const eliminarDeGaleria = (id: string) => {
    setGaleriaMultimedia(galeriaMultimedia.filter(item => item.id !== id));
    setLineaDeTiempo(lineaDeTiempo.filter(item => item.mediaId !== id)); 
  };

  const agregarAlTimeline = (item: MediaItem) => {
    const nuevo: TimelineItem = { id: Date.now().toString(), mediaId: item.id, tipo: item.tipo, nombre: item.nombre, etiqueta: item.etiqueta, url: item.url };
    setLineaDeTiempo([...lineaDeTiempo, nuevo]);
    if (item.tipo === 'video' || item.tipo === 'foto') {
      setVideoTerminado(item.url);
      setVideoResultadoUrl(null);
      setRects([]); // Limpiamos máscaras al cambiar de video
    }
  };

  const quitarDelTimeline = (id: string) => {
    setLineaDeTiempo(lineaDeTiempo.filter(t => t.id !== id));
    setClipSeleccionado(null);
  };

  // CONTROL DEL REPRODUCTOR
  const togglePlay = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const handleDescargar = () => {
    const url = videoResultadoUrl || videoTerminado;
    if (!url) return alert("No hay ningún video cargado para descargar.");
    const a = document.createElement('a');
    a.href = url;
    a.download = `Nayla_Export_${calidadExportacion}_${Date.now()}.mp4`;
    a.click();
  };

  // ==========================================
  // MOTOR DE BORRADO DE MARCAS (CONEXIÓN API REAL)
  // ==========================================
  const processVideo = async (motorElegido: 'nube' | 'local') => {
    if (!videoFile) return alert("Por favor, sube un video primero.");
    if (rects.length === 0) return alert("Dibuja al menos un recuadro sobre la marca de agua.");
    
    setIsProcessing(true);
    try {
      // Preparamos los datos para enviarlos a tu API real (api/clean-video.ts)
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('coordenadas', JSON.stringify(rects));
      formData.append('motor', motorElegido);

      const res = await fetch('/api/clean-video', {
        method: 'POST',
        body: formData
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        setVideoResultadoUrl(data.url); // El video limpio regresado por el servidor
        setRects([]); // Limpiamos los recuadros de la pantalla
        alert(`Supresión completada usando motor: ${motorElegido.toUpperCase()}`);
      } else {
        throw new Error(data.error || "Fallo desconocido en el servidor");
      }
    } catch (err: any) {
      alert("Error procesando: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // MÁSCARAS LOGICA INTACTA
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!videoTerminado || !containerRef.current || resizingInfo || draggingInfo) return;
    const container = containerRef.current.getBoundingClientRect();
    const x = e.clientX - container.left;
    const y = e.clientY - container.top;
    setStartPos({ x, y }); setIsDrawing(true); setCurrentRect({ id: Date.now().toString(), x, y, width: 0, height: 0 });
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!videoTerminado || !containerRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(e.clientX - container.left, container.width));
    const currentY = Math.max(0, Math.min(e.clientY - container.top, container.height));
    if (isDrawing && currentRect) {
      setCurrentRect({ ...currentRect, x: Math.min(startPos.x, currentX), y: Math.min(startPos.y, currentY), width: Math.abs(currentX - startPos.x), height: Math.abs(currentY - startPos.y) });
    } else if (draggingInfo) {
      setRects(rects.map(r => r.id === draggingInfo.id ? { ...r, x: Math.max(0, Math.min(currentX - draggingInfo.offsetX, container.width - r.width)), y: Math.max(0, Math.min(currentY - draggingInfo.offsetY, container.height - r.height)) } : r));
    } else if (resizingInfo) {
      setRects(rects.map(r => {
        if (r.id === resizingInfo.id) {
          let newX = r.x; let newY = r.y; let newWidth = r.width; let newHeight = r.height;
          if (resizingInfo.corner.includes('e')) newWidth = Math.max(20, currentX - r.x);
          if (resizingInfo.corner.includes('s')) newHeight = Math.max(20, currentY - r.y);
          if (resizingInfo.corner.includes('w')) { const d = currentX - r.x; newWidth = Math.max(20, r.width - d); if (newWidth > 20) newX = currentX; }
          if (resizingInfo.corner.includes('n')) { const d = currentY - r.y; newHeight = Math.max(20, r.height - d); if (newHeight > 20) newY = currentY; }
          return { ...r, x: newX, y: newY, width: newWidth, height: newHeight };
        }
        return r;
      }));
    }
  };
  const handlePointerUp = () => {
    if (isDrawing && currentRect && currentRect.width > 10 && currentRect.height > 10) setRects([...rects, currentRect]);
    setIsDrawing(false); setCurrentRect(null); setResizingInfo(null); setDraggingInfo(null);
  };
  const removeRect = (id: string) => { setRects(rects.filter(r => r.id !== id)); };

  const globalStyles = `
    ::-webkit-scrollbar { height: 4px; width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #404040; border-radius: 10px; }
    
    /* BOTONES NEON BLANCO (MÁXIMO MINIMALISMO) */
    .neon-btn { 
      background: #0a0a0a; 
      border: 1px solid #262626; 
      color: #a3a3a3; 
      transition: all 0.2s ease;
      display: flex; justify-content: center; align-items: center; gap: 8px;
    }
    .neon-btn:active, .neon-btn.active { 
      background: #ffffff; 
      color: #000000; 
      border-color: #ffffff;
      box-shadow: 0 0 15px rgba(255, 255, 255, 0.7); 
    }

    .nav-btn { font-size: 0.7rem; font-weight: bold; padding: 0.8rem 1.2rem; border-radius: 100px; cursor: pointer; text-transform: uppercase; white-space: nowrap; }

    .tool-btn { background: transparent; border: none; color: #a3a3a3; display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 0.65rem; cursor: pointer; transition: 0.2s; min-width: 60px; }
    .tool-btn:hover { color: #ffffff; }
    .tool-icon { width: 45px; height: 45px; display: flex; justify-content: center; align-items: center; border-radius: 12px; }
    .tool-btn:active .tool-icon { background: #ffffff; color: #000000; box-shadow: 0 0 15px rgba(255, 255, 255, 0.7); }

    /* TIMELINE CONTINUO */
    .filmstrip-container { display: flex; height: 60px; overflow-x: auto; padding: 0 50%; gap: 0; align-items: center; }
    .clip-block { height: 100%; min-width: 70px; position: relative; cursor: pointer; flex-shrink: 0; border-top: 2px solid transparent; border-bottom: 2px solid transparent; border-right: 1px solid #000; transition: 0.2s; }
    .clip-block:first-child { border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
    .clip-block:last-child { border-top-right-radius: 8px; border-bottom-right-radius: 8px; border-right: none; }
    .clip-block.selected { border: 2px solid #ffffff; z-index: 10; box-shadow: 0 0 15px rgba(255,255,255,0.4); border-radius: 8px; }
    .audio-block { height: 35px; border-radius: 8px; flex-shrink: 0; min-width: 120px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 0.65rem; cursor: pointer; margin-right: 2px; border: 1px solid #404040; }
  `;

  if (!session) {
    if (showIntro) {
      return (
        <div style={{ minHeight: '100vh', backgroundColor: '#000000', display: 'flex', justifyContent: 'center', alignItems: 'center', animation: 'fadeOut 1s ease-in-out 2s forwards' }}>
          <style>{`
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
          `}</style>
          <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA" style={{ width: '150px', height: '150px', borderRadius: '24px', objectFit: 'cover', animation: 'fadeIn 1s ease-in-out' }} />
        </div>
      );
    }

    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#ffffff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' }}>
        <Head><title>NAYLA - AUTENTICACIÓN</title></Head>
        <style>{globalStyles}</style>

        {/* FORMULARIO DE CORREO (SIEMPRE EN EL CENTRO) */}
        <div style={{ width: '100%', maxWidth: '400px', border: '1px solid #262626', backgroundColor: '#050505', padding: '2.5rem', borderRadius: '24px', textAlign: 'center', transition: 'opacity 0.3s', opacity: otpEnviado ? 0.5 : 1 }}>
          <h1 style={{ fontSize: '1rem', letterSpacing: '4px', margin: '0 0 2rem 0', textTransform: 'uppercase' }}>NAYLA</h1>
          <form onSubmit={handleEmailAuth}>
            <input type="email" placeholder="CORREO MAESTRO" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} disabled={otpEnviado} style={{ width: '100%', padding: '1rem', backgroundColor: '#0a0a0a', border: '1px solid #404040', borderRadius: '16px', color: '#ffffff', fontSize: '0.8rem', marginBottom: '1rem', textAlign: 'center', outline: 'none' }} />
            <button type="submit" disabled={authLoading || otpEnviado} className="neon-btn nav-btn" style={{ width: '100%' }}>{authLoading && !otpEnviado ? 'PROCESANDO...' : 'SOLICITAR ACCESO'}</button>
          </form>
        </div>

        {/* BOTTOM SHEET PARA OTP */}
        <div style={{
          position: 'fixed',
          bottom: otpEnviado ? 0 : '-100%',
          left: 0,
          right: 0,
          backgroundColor: '#000000',
          borderTop: '1px solid #ffffff',
          borderLeft: '1px solid #ffffff',
          borderRight: '1px solid #ffffff',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          padding: '2.5rem',
          transition: 'bottom 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          zIndex: 100
        }}>
          <div style={{ width: '40px', height: '4px', backgroundColor: '#ffffff', borderRadius: '2px', marginBottom: '2rem', opacity: 0.5 }} />
          <h2 style={{ fontSize: '0.9rem', letterSpacing: '2px', margin: '0 0 1.5rem 0', textTransform: 'uppercase' }}>CÓDIGO DE ACCESO</h2>
          <form onSubmit={handleOtpVerify} style={{ width: '100%', maxWidth: '350px' }}>
            <input type="text" placeholder="CÓDIGO 000000" value={otpInput} onChange={(e) => setOtpInput(e.target.value)} style={{ width: '100%', padding: '1rem', backgroundColor: '#0a0a0a', border: '1px solid #ffffff', borderRadius: '16px', color: '#ffffff', fontSize: '1rem', marginBottom: '1rem', textAlign: 'center', outline: 'none', letterSpacing: '4px' }} />
            <button type="submit" disabled={authLoading} className="neon-btn nav-btn" style={{ width: '100%', backgroundColor: '#ffffff', color: '#000000', fontWeight: 'bold' }}>{authLoading ? 'VERIFICANDO...' : 'INGRESAR'}</button>
          </form>
        </div>
      </div>
    );
  }

  const pistaVideo = lineaDeTiempo.filter(t => t.tipo === 'video' || t.tipo === 'foto');
  const pistaAudio = lineaDeTiempo.filter(t => t.tipo === 'audio');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#ededed', fontFamily: 'system-ui, sans-serif' }}>
      <Head><title>NAYLA CORE</title></Head>
      <style>{globalStyles}</style>
      
      {/* HEADER LIMPIO (BLANCO Y NEGRO) */}
      <header style={{ borderBottom: '1px solid #1a1a1a', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#050505' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA" style={{ width: '35px', height: '35px', borderRadius: '8px', objectFit: 'cover' }} />
          <span style={{ fontSize: '0.7rem', padding: '4px 10px', border: '1px solid #ffffff', borderRadius: '100px', letterSpacing: '2px', fontWeight: 'bold' }}>LOGIC</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* SELECTOR DE CALIDAD Y DESCARGA */}
          <select value={calidadExportacion} onChange={(e) => setCalidadExportacion(e.target.value)} style={{ backgroundColor: '#000', color: '#fff', border: '1px solid #404040', borderRadius: '8px', padding: '6px 10px', fontSize: '0.7rem', outline: 'none' }}>
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p (FHD)</option>
            <option value="4k">4K (UHD)</option>
          </select>
          <button onClick={handleDescargar} className="neon-btn nav-btn" style={{ padding: '8px 16px' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '6px'}}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            DESCARGAR
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* MONITOR CENTRAL (SOPORTA DIBUJO Y VIDEO FINAL REPRODUCIBLE) */}
        <section style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px', backgroundColor: '#050505' }}>
          <div ref={containerRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} 
            style={{ 
              aspectRatio: canvasRatio, height: '100%', maxHeight: '40vh', 
              backgroundColor: '#0a0a0a', borderRadius: '16px', overflow: 'hidden', position: 'relative',
              border: '1px solid #1a1a1a', touchAction: 'none'
            }}>
            {/* EL VIDEO AHORA PRIORIZA EL RESULTADO LIMPIO SI EXISTE */}
            {(videoResultadoUrl || videoTerminado) ? (
              <>
                <video ref={videoRef} src={videoResultadoUrl || videoTerminado} loop muted playsInline onLoadedMetadata={(e) => { setVideoMetadata({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight }); }} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                
                {/* MÁSCARAS (Solo si no hay resultado limpio aún) */}
                {!videoResultadoUrl && rects.map((r) => (
                  <div key={r.id} onPointerDown={(e) => { e.stopPropagation(); if (!containerRef.current) return; const c = containerRef.current.getBoundingClientRect(); setDraggingInfo({ id: r.id, offsetX: (e.clientX - c.left) - r.x, offsetY: (e.clientY - c.top) - r.y }); }}
                    style={{ position: 'absolute', left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px`, border: '1px solid #ffffff', backgroundColor: 'rgba(255,255,255,0.1)', pointerEvents: 'auto', cursor: 'move', borderRadius: '8px' }}>
                    <div onPointerDown={(e) => { e.stopPropagation(); removeRect(r.id); }} style={{ position: 'absolute', top: '-10px', right: '-10px', width: '20px', height: '20px', backgroundColor: '#ffffff', color: '#000', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold', zIndex: 10 }}>✕</div>
                    <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'se' }); }} style={{ position: 'absolute', bottom: '-6px', right: '-6px', width: '12px', height: '12px', backgroundColor: '#ffffff', cursor: 'nwse-resize', zIndex: 10, borderRadius: '50%' }} />
                  </div>
                ))}
                {currentRect && isDrawing && <div style={{ position: 'absolute', left: `${currentRect.x}px`, top: `${currentRect.y}px`, width: `${currentRect.width}px`, height: `${currentRect.height}px`, border: '1px dashed #ffffff', backgroundColor: 'transparent', pointerEvents: 'none', borderRadius: '8px' }} />}
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
                <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA LOGO" style={{ width: '80px', height: '80px', borderRadius: '16px', opacity: 0.5, filter: 'grayscale(100%)' }} />
              </div>
            )}
          </div>
        </section>

        {/* CONTROLES DE REPRODUCCIÓN REALES */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', alignItems: 'center', backgroundColor: '#000', borderBottom: '1px solid #1a1a1a' }}>
          <span style={{ color: '#737373', fontSize: '0.75rem', fontFamily: 'monospace' }}>00:00:00</span>
          <button onClick={togglePlay} style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '1.5rem', cursor: 'pointer', outline: 'none' }}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <span style={{ color: '#737373', fontSize: '0.75rem', fontFamily: 'monospace' }}>00:00:00</span>
        </div>

        {/* TIMELINE HORIZONTAL */}
        <section style={{ height: '150px', backgroundColor: '#050505', position: 'relative', borderBottom: '1px solid #1a1a1a', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '10px 0' }} onClick={() => setClipSeleccionado(null)}>
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', backgroundColor: '#ffffff', zIndex: 50, pointerEvents: 'none', boxShadow: '0 0 10px rgba(255,255,255,0.8)' }} />
          
          <div ref={timelineRef} className="filmstrip-container" onClick={(e) => e.stopPropagation()}>
            <div className="neon-btn" style={{ width: '40px', height: '60px', borderRadius: '8px', flexShrink: 0, marginRight: '10px', borderStyle: 'dashed' }}>+</div>
            {pistaVideo.map((clip) => (
              <div key={clip.id} onClick={() => setClipSeleccionado(clip.id)} className={`clip-block ${clipSeleccionado === clip.id ? 'selected' : ''}`}>
                <img src={clip.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <span style={{ position: 'absolute', top: '4px', left: '6px', fontSize: '0.6rem', color: '#fff', fontWeight: 'bold', textShadow: '0 2px 4px #000' }}>{clip.etiqueta}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', height: '40px', overflowX: 'auto', padding: '0 50%', gap: '2px', marginTop: '10px' }} onClick={(e) => e.stopPropagation()}>
            {pistaAudio.map((clip) => (
              <div key={clip.id} onClick={() => setClipSeleccionado(clip.id)} className="audio-block neon-btn" style={{ borderColor: clipSeleccionado === clip.id ? '#ffffff' : '#404040' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:'5px'}}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                {clip.etiqueta}
              </div>
            ))}
          </div>
        </section>

        {/* MÓDULOS DE NAYLA (BOTONES DE MENÚ INFERIOR) */}
        <div style={{ padding: '15px', backgroundColor: '#050505', paddingBottom: '30px' }}>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '15px', borderBottom: '1px solid #1a1a1a', marginBottom: '15px' }}>
            <button className={`neon-btn nav-btn ${navActiva === 'galeria' ? 'active' : ''}`} onClick={() => setNavActiva('galeria')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> BODEGA MÚLTIPLE
            </button>
            <button className={`neon-btn nav-btn ${navActiva === 'herramientas' ? 'active' : ''}`} onClick={() => setNavActiva('herramientas')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> SCRIPT & SUPRESIÓN
            </button>
            <button className={`neon-btn nav-btn ${navActiva === 'ia' ? 'active' : ''}`} onClick={() => setNavActiva('ia')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg> SUPERVISOR IA
            </button>
          </div>

          {navActiva === 'galeria' && (
            <div style={{ padding: '0' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem' }}>
                <label className="neon-btn" style={{ flex: 1, padding: '1rem', borderStyle: 'dashed', borderRadius: '12px', fontSize: '0.75rem', cursor: 'pointer' }}>+ SUBIR VIDEO/FOTO <input type="file" multiple accept="video/*,image/*" onChange={(e) => handleSubirMultimedia(e, 'video')} style={{ display: 'none' }} /></label>
                <label className="neon-btn" style={{ flex: 1, padding: '1rem', borderStyle: 'dashed', borderRadius: '12px', fontSize: '0.75rem', cursor: 'pointer' }}>+ SUBIR AUDIO <input type="file" multiple accept="audio/*" onChange={(e) => handleSubirMultimedia(e, 'audio')} style={{ display: 'none' }} /></label>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {galeriaMultimedia.map(item => (
                  <div key={item.id} className="neon-btn" style={{ justifyContent: 'space-between', padding: '1rem', borderRadius: '16px', borderStyle: 'solid' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                      <span style={{ fontSize: '0.8rem', backgroundColor: '#262626', padding: '4px 8px', borderRadius: '6px', color: '#fff', fontWeight: 'bold' }}>{item.etiqueta}</span>
                      <input type="text" value={item.nombre} onChange={(e) => renombrarItem(item.id, e.target.value)} className="rename-input" />
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="neon-btn nav-btn active" onClick={() => agregarAlTimeline(item)} style={{ padding: '6px 12px', fontSize: '0.65rem' }}>+ PISTA</button>
                      <button onClick={() => eliminarDeGaleria(item.id)} style={{ background: 'none', border: 'none', color: '#ff4444', cursor: 'pointer' }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LAS HERRAMIENTAS DE MÁSCARA Y BORRAR LOGO RECUPERADAS */}
          {navActiva === 'herramientas' && (
            <div style={{ padding: '0' }}>
              <p style={{ fontSize: '0.75rem', color: '#ffffff', fontWeight: 'bold', marginBottom: '1rem', letterSpacing: '1px' }}>SUPRESIÓN DE MARCA DE AGUA (DELOGO)</p>
              <div style={{ backgroundColor: '#0a0a0a', padding: '1.5rem', borderRadius: '16px', border: '1px dashed #404040', marginBottom: '2rem' }}>
                <p style={{ fontSize: '0.7rem', color: '#a3a3a3', marginBottom: '1rem' }}>1. Selecciona un video en la pista.<br/>2. Dibuja un rectángulo blanco sobre el logo en el monitor.<br/>3. Elige el motor de procesamiento.</p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => processVideo('local')} disabled={isProcessing} className="neon-btn nav-btn" style={{ flex: 1 }}>
                    {isProcessing ? 'PROCESANDO...' : 'BORRAR LOGO (LOCAL)'}
                  </button>
                  <button onClick={() => processVideo('nube')} disabled={isProcessing} className="neon-btn nav-btn" style={{ flex: 1 }}>
                    {isProcessing ? 'PROCESANDO...' : 'BORRAR LOGO (APIS)'}
                  </button>
                </div>
              </div>

              <p style={{ fontSize: '0.75rem', color: '#ffffff', fontWeight: 'bold', marginBottom: '1rem', letterSpacing: '1px' }}>SCRIPT MANUAL</p>
              <textarea value={codigoJsInput} onChange={(e) => setCodigoJsInput(e.target.value)} style={{ width: '100%', height: '80px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '12px', color: '#00ffcc', padding: '1rem', fontFamily: 'monospace', outline: 'none' }} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}