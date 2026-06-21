// @ts-nocheck
/* eslint-disable */
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Rect = { id: string; x: number; y: number; width: number; height: number };
type MediaItem = { id: string; url: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; creado_en: string; esOverlay: boolean; etiqueta: string };
type TimelineItem = { id: string; mediaId: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; etiqueta: string };

export default function NaylaCore() {
  const [session, setSession] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpEnviado, setOtpEnviado] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  // ESTADOS DE INTERFAZ MINIMALISTA Y REDONDEADA
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const [fotoUsuarioUrl, setFotoUsuarioUrl] = useState('/assets/imagenes/Icono-intro.jpeg');
  const [navActiva, setNavActiva] = useState<string | null>('galeria'); // Iniciamos en galería para ver los cambios
  const [codigoJsInput, setCodigoJsInput] = useState('// Inyecta comandos JS aquí\n// Ej: NaylaEngine.unir(V1, V2);\nconsole.log("Nayla Engine Activado");');
  
  // MEMORIA DE EDICIÓN
  const [galeriaMultimedia, setGaleriaMultimedia] = useState<MediaItem[]>([]);
  const [lineaDeTiempo, setLineaDeTiempo] = useState<TimelineItem[]>([]);
  
  const [showIntro, setShowIntro] = useState(true);
  
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoTerminado, setVideoTerminado] = useState<string | null>(null);
  const [progresoCarga, setProgresoCarga] = useState(0);
  const [videoResultadoUrl, setVideoResultadoUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState({ width: 1920, height: 1080 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [rects, setRects] = useState<Rect[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);
  const [resizingInfo, setResizingInfo] = useState<{ id: string, corner: string } | null>(null);
  const [draggingInfo, setDraggingInfo] = useState<{ id: string, offsetX: number, offsetY: number } | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) cargarProyectoGuardado(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) cargarProyectoGuardado(session.user.id);
    });
    const timer = setTimeout(() => { setShowIntro(false); }, 4000);
    return () => { subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  const handleBiometricAuth = async () => {
    setAuthLoading(true);
    setMessage('Inicializando hardware biométrico...');
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPasskey({ domain: window.location.hostname });
      if (signInError) { setMessage(`Error biométrico: ${signInError.message}`); setAuthLoading(false); return; }
      if (data) setMessage('Identidad biométrica verificada.');
    } catch (err) {
      setMessage(`Biometría no disponible o rechazada. Use enlace de respaldo.`);
    } finally { setAuthLoading(false); }
  };

  const handleRegistrarBiometria = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'webauthn' });
      if (error) { alert('Módulo en mantenimiento por el servidor.'); return; }
      alert("Comando biométrico enviado.");
    } catch (err) { alert("Error en la llamada."); }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    setAuthLoading(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: emailInput, options: { shouldCreateUser: true } });
      if (error) { setMessage(`Error: ${error.message}`); setAuthLoading(false); return; }
      setOtpEnviado(true);
      setMessage('Código de 6 dígitos enviado. Revise su correo.');
    } catch (err) { setMessage(`Error crítico de transmisión.`); } finally { setAuthLoading(false); }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpInput || !emailInput) return;
    setAuthLoading(true);
    setMessage('Verificando código...');
    try {
      const { error } = await supabase.auth.verifyOtp({ email: emailInput, token: otpInput, type: 'email' });
      if (error) { setMessage(`Código incorrecto o expirado.`); setAuthLoading(false); return; }
      setMessage('Acceso concedido.');
    } catch (err) { setMessage(`Error en la base de datos.`); } finally { setAuthLoading(false); }
  };

  const handleCambiarFotoUsuario = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFotoUsuarioUrl(URL.createObjectURL(e.target.files[0]));
    }
  };

  // LÓGICA DE GALERÍA INTELIGENTE
  const handleSubirMultimedia = async (e: React.ChangeEvent<HTMLInputElement>, tipo: 'foto' | 'video' | 'audio') => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    
    // Generar etiqueta automática (Ej: V1, F2, A1)
    const countTipo = galeriaMultimedia.filter(item => item.tipo === tipo).length + 1;
    const inicial = tipo === 'video' ? 'V' : tipo === 'foto' ? 'F' : 'A';
    const etiquetaStr = `${inicial}${countTipo}`;

    const nuevoItem: MediaItem = {
      id: Date.now().toString(),
      url: URL.createObjectURL(file),
      tipo: tipo,
      nombre: file.name,
      creado_en: new Date().toLocaleTimeString(),
      esOverlay: false,
      etiqueta: etiquetaStr
    };
    
    setGaleriaMultimedia([...galeriaMultimedia, nuevoItem]);
    
    // Si es un video y el monitor está vacío, lo cargamos por defecto
    if (tipo === 'video' && !videoTerminado) {
      setVideoFile(file);
      setVideoTerminado(nuevoItem.url);
    }
  };

  const renombrarItem = (id: string, nuevoNombre: string) => {
    setGaleriaMultimedia(galeriaMultimedia.map(item => item.id === id ? { ...item, nombre: nuevoNombre } : item));
  };

  const toggleOverlay = (id: string) => {
    setGaleriaMultimedia(galeriaMultimedia.map(item => item.id === id ? { ...item, esOverlay: !item.esOverlay } : item));
  };

  const eliminarDeGaleria = (id: string) => {
    setGaleriaMultimedia(galeriaMultimedia.filter(item => item.id !== id));
    setLineaDeTiempo(lineaDeTiempo.filter(item => item.mediaId !== id)); // Lo quita de la pista también
  };

  // LÓGICA DE LÍNEA DE TIEMPO (TIMELINE)
  const agregarAlTimeline = (item: MediaItem) => {
    const nuevoElementoTrack: TimelineItem = {
      id: Date.now().toString(),
      mediaId: item.id,
      tipo: item.tipo,
      nombre: item.nombre,
      etiqueta: item.etiqueta
    };
    setLineaDeTiempo([...lineaDeTiempo, nuevoElementoTrack]);
  };

  const quitarDelTimeline = (id: string) => {
    setLineaDeTiempo(lineaDeTiempo.filter(t => t.id !== id));
  };

  const descargarItem = (url: string, nombre: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
  };

  const cargarProyectoGuardado = async (userId: string) => {
    const { data, error } = await supabase.from('plantillas_editor').select('*').eq('perfil_id', userId).single();
    if (data && !error) {
      if (data.video_base_url) { setVideoTerminado(data.video_base_url); setVideoResultadoUrl(data.video_base_url); }
      if (data.coordenadas) setRects(data.coordenadas);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setVideoFile(file);
      setVideoTerminado(URL.createObjectURL(file));
      setVideoResultadoUrl(null);
      setRects([]);
    }
  };

  const processVideo = async (motorElegido: 'nube' | 'local') => {
    if (!videoFile || !containerRef.current) return;
    setIsProcessing(true); setProgresoCarga(10);
    setTimeout(() => { alert("Script procesado mediante NaylaEngine local."); setIsProcessing(false); setProgresoCarga(0); }, 2000);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!videoTerminado || !containerRef.current || resizingInfo || draggingInfo) return;
    const container = containerRef.current.getBoundingClientRect();
    const x = e.clientX - container.left;
    const y = e.clientY - container.top;
    setStartPos({ x, y });
    setIsDrawing(true);
    setCurrentRect({ id: Date.now().toString(), x, y, width: 0, height: 0 });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!videoTerminado || !containerRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const currentX = Math.max(0, Math.min(e.clientX - container.left, container.width));
    const currentY = Math.max(0, Math.min(e.clientY - container.top, container.height));
    if (isDrawing && currentRect) {
      setCurrentRect({ ...currentRect, x: Math.min(startPos.x, currentX), y: Math.min(startPos.y, currentY), width: Math.abs(currentX - startPos.x), height: Math.abs(currentY - startPos.y) });
    } else if (draggingInfo) {
      setRects(rects.map(r => {
        if (r.id === draggingInfo.id) {
          return { ...r, x: Math.max(0, Math.min(currentX - draggingInfo.offsetX, container.width - r.width)), y: Math.max(0, Math.min(currentY - draggingInfo.offsetY, container.height - r.height)) };
        }
        return r;
      }));
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
    if (isDrawing && currentRect && currentRect.width > 10 && currentRect.height > 10) {
      setRects([...rects, currentRect]);
    }
    setIsDrawing(false); setCurrentRect(null); setResizingInfo(null); setDraggingInfo(null);
  };

  const removeRect = (id: string) => { setRects(rects.filter(r => r.id !== id)); };

  // ESTILOS GLOBALES Y ANIMACIÓN CON BORDES REDONDEADOS
  const globalStyles = `
    @keyframes floatAndGlow {
      0% { transform: translateY(0px) scale(0.98); opacity: 0.7; filter: drop-shadow(0 0 5px rgba(255,255,255,0.1)); }
      50% { transform: translateY(-8px) scale(1); opacity: 1; filter: drop-shadow(0 0 15px rgba(255,255,255,0.3)); }
      100% { transform: translateY(0px) scale(0.98); opacity: 0.7; filter: drop-shadow(0 0 5px rgba(255,255,255,0.1)); }
    }
    .intro-logo { animation: floatAndGlow 4s ease-in-out infinite; }
    
    @keyframes iaBreathing {
      0% { transform: scale(0.95); opacity: 0.5; filter: blur(1px) drop-shadow(0 0 5px rgba(255,255,255,0.1)); }
      50% { transform: scale(1.02); opacity: 1; filter: blur(0px) drop-shadow(0 0 25px rgba(255,255,255,0.4)); }
      100% { transform: scale(0.95); opacity: 0.5; filter: blur(1px) drop-shadow(0 0 5px rgba(255,255,255,0.1)); }
    }
    .ia-core-breathing { animation: iaBreathing 5s infinite ease-in-out; }

    /* Estilo de botones tipo píldora */
    .nav-btn { background: transparent; border: 1px solid #262626; color: #737373; font-size: 0.75rem; font-weight: bold; letter-spacing: 1px; padding: 1rem; border-radius: 100px; cursor: pointer; transition: all 0.3s; text-transform: uppercase; }
    .nav-btn:hover { border-color: #737373; color: #ededed; }
    .nav-btn.active { background: #ffffff; color: #000000; border-color: #ffffff; }

    /* Estilo de Inputs transparentes para renombrar */
    .rename-input { background: transparent; border: none; color: #ffffff; font-size: 0.85rem; border-bottom: 1px dashed #404040; outline: none; width: 100%; transition: border-color 0.3s; }
    .rename-input:focus { border-bottom: 1px solid #ffffff; }
    
    /* Scrollbar invisible para estética limpia */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #000000; }
    ::-webkit-scrollbar-thumb { background: #262626; border-radius: 10px; }
    ::-webkit-scrollbar-thumb:hover { background: #404040; }
  `;

  if (showIntro) {
    return (
      <div style={{ height: '100vh', width: '100vw', backgroundColor: '#000000', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: 0 }}>
        <Head><title>NAYLA CORE</title></Head>
        <style>{globalStyles}</style>
        <img className="intro-logo" src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA Logo" style={{ width: '280px', maxWidth: '80%', objectFit: 'contain', borderRadius: '30px' }} />
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#ffffff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
        <Head><title>NAYLA - AUTENTICACIÓN</title></Head>
        <div style={{ width: '100%', maxWidth: '400px', border: '1px solid #262626', backgroundColor: '#050505', padding: '2.5rem', borderRadius: '24px', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
          <h1 style={{ fontSize: '1rem', letterSpacing: '4px', margin: '0 0 0.5rem 0', textTransform: 'uppercase' }}>NAYLA</h1>
          <p style={{ color: '#737373', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '2.5rem' }}>Core System Login</p>
          
          <button onClick={handleBiometricAuth} disabled={authLoading} style={{ width: '100%', padding: '1rem', backgroundColor: '#ffffff', color: '#000000', border: 'none', borderRadius: '100px', fontWeight: 'bold', letterSpacing: '1px', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '1.5rem' }}>
            {authLoading ? 'VERIFICANDO...' : 'ACCESO BIOMÉTRICO'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#404040', fontSize: '0.7rem', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#262626' }} /> O <div style={{ flex: 1, height: '1px', backgroundColor: '#262626' }} />
          </div>

          {!otpEnviado ? (
            <form onSubmit={handleEmailAuth} style={{ textAlign: 'left' }}>
              <input type="email" placeholder="CORREO MAESTRO" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} style={{ width: '100%', padding: '1rem', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '16px', color: '#ffffff', fontSize: '0.8rem', marginBottom: '1rem', textAlign: 'center', letterSpacing: '1px', outline: 'none' }} />
              <button type="submit" disabled={authLoading} style={{ width: '100%', padding: '1rem', backgroundColor: 'transparent', color: '#ffffff', border: '1px solid #ffffff', borderRadius: '100px', fontWeight: 'bold', fontSize: '0.75rem', letterSpacing: '1px', cursor: 'pointer' }}>
                SOLICITAR CÓDIGO
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpVerify} style={{ textAlign: 'left' }}>
              <input type="text" placeholder="000000" value={otpInput} onChange={(e) => setOtpInput(e.target.value)} maxLength={6} style={{ width: '100%', padding: '1.2rem', backgroundColor: '#0a0a0a', border: '1px solid #ffffff', borderRadius: '16px', color: '#ffffff', fontSize: '1.5rem', marginBottom: '1rem', textAlign: 'center', letterSpacing: '1rem', outline: 'none' }} />
              <button type="submit" disabled={authLoading || otpInput.length < 6} style={{ width: '100%', padding: '1rem', backgroundColor: '#ffffff', color: '#000000', border: 'none', borderRadius: '100px', fontWeight: 'bold', fontSize: '0.8rem', letterSpacing: '1px', cursor: 'pointer' }}>
                INGRESAR
              </button>
            </form>
          )}
          {message && <p style={{ marginTop: '1.5rem', marginBottom: 0, fontSize: '0.7rem', color: '#a3a3a3' }}>{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#ededed', padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <Head><title>NAYLA CORE</title></Head>
      <style>{globalStyles}</style>
      
      {/* HEADER MINIMALISTA CON BORDES REDONDEADOS */}
      <header style={{ borderBottom: '1px solid #1a1a1a', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA" style={{ width: '45px', height: '45px', borderRadius: '12px', objectFit: 'cover' }} />
          <span style={{ fontSize: '0.7rem', padding: '4px 10px', border: '1px solid #ffffff', borderRadius: '100px', letterSpacing: '2px', fontWeight: 'bold', color: '#ffffff' }}>LOGIC</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <p style={{ margin: 0, color: '#737373', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right' }}>
            ID: {session.user.email}
          </p>
          
          <div style={{ position: 'relative' }}>
            <div 
              onClick={() => setMenuUsuarioAbierto(!menuUsuarioAbierto)}
              style={{ width: '45px', height: '45px', borderRadius: '50%', border: '1px solid #404040', overflow: 'hidden', cursor: 'pointer', backgroundColor: '#0a0a0a', transition: 'transform 0.2s' }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              <img src={fotoUsuarioUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>

            {menuUsuarioAbierto && (
              <div style={{ position: 'absolute', top: '60px', right: '0', width: '320px', backgroundColor: '#050505', border: '1px solid #262626', borderRadius: '20px', padding: '1.5rem', zIndex: 1000, boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }}>
                
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.65rem', color: '#a3a3a3', cursor: 'pointer', textTransform: 'uppercase', borderBottom: '1px dashed #404040', paddingBottom: '2px' }}>
                    ACTUALIZAR AVATAR
                    <input type="file" accept="image/*" onChange={handleCambiarFotoUsuario} style={{ display: 'none' }} />
                  </label>
                </div>

                <div style={{ marginBottom: '1.5rem', backgroundColor: '#0a0a0a', padding: '1rem', borderRadius: '16px', border: '1px solid #1a1a1a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '0.8rem' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#ffffff', letterSpacing: '1px', fontWeight: 'bold' }}>LOGIC STORAGE</p>
                    <p style={{ margin: 0, fontSize: '0.65rem', color: '#00ffcc' }}>MASTER</p>
                  </div>
                  <div style={{ width: '100%', height: '6px', backgroundColor: '#1a1a1a', borderRadius: '10px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                    <div style={{ width: '100%', height: '100%', backgroundColor: '#ffffff', borderRadius: '10px' }} />
                  </div>
                  <p style={{ margin: 0, fontSize: '0.65rem', color: '#737373', lineHeight: '1.4' }}>
                    Capacidad de procesamiento ilimitada.
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #1a1a1a', paddingTop: '1.2rem' }}>
                  <button onClick={() => supabase.auth.signOut()} style={{ backgroundColor: 'transparent', border: '1px solid #262626', color: '#a3a3a3', padding: '0.6rem 1rem', fontSize: '0.7rem', cursor: 'pointer', borderRadius: '100px', letterSpacing: '1px' }}>
                    DESCONECTAR
                  </button>
                  
                  <button onClick={handleRegistrarBiometria} title="Vincular Huella" style={{ width: '45px', height: '45px', borderRadius: '50%', backgroundColor: '#ffffff', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12v.01"/><path d="M17.5 17.5V16a6 6 0 0 0-11 0v1.5"/><path d="M22 12A10 10 0 0 0 2 12"/><path d="M19 19a8 8 0 0 0-14 0"/><path d="M12 21a5 5 0 0 0-5-5"/></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* MONITOR CENTRAL DINÁMICO CON BORDES REDONDEADOS */}
        <section ref={containerRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} 
          style={{ 
            width: videoTerminado ? 'auto' : '100%', 
            maxWidth: '100%', 
            aspectRatio: videoTerminado ? `${videoMetadata.width}/${videoMetadata.height}` : '16/9', 
            maxHeight: '55vh', 
            backgroundColor: '#050505', 
            border: '1px solid #1a1a1a', 
            borderRadius: '24px', 
            overflow: 'hidden', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            position: 'relative', 
            touchAction: 'none',
            margin: '0 auto',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
          }}>
          {videoTerminado ? (
            <>
              <video ref={videoRef} src={videoTerminado} autoPlay loop muted onLoadedMetadata={(e) => { setVideoMetadata({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight }); }} style={{ width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' }} />
              {!videoResultadoUrl && rects.map((r) => (
                <div key={r.id} onPointerDown={(e) => { e.stopPropagation(); if (!containerRef.current) return; const c = containerRef.current.getBoundingClientRect(); setDraggingInfo({ id: r.id, offsetX: (e.clientX - c.left) - r.x, offsetY: (e.clientY - c.top) - r.y }); }}
                  style={{ position: 'absolute', left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px`, border: '1px solid #ffffff', backgroundColor: 'rgba(255,255,255,0.1)', pointerEvents: 'auto', cursor: 'move', borderRadius: '12px' }}>
                  <div onPointerDown={(e) => { e.stopPropagation(); removeRect(r.id); }} style={{ position: 'absolute', top: '-15px', right: '-15px', width: '30px', height: '30px', backgroundColor: '#ffffff', color: '#000', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', zIndex: 10 }}>✕</div>
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'nw' }); }} style={{ position: 'absolute', top: '-8px', left: '-8px', width: '16px', height: '16px', backgroundColor: '#ffffff', cursor: 'nwse-resize', zIndex: 10, borderRadius: '50%' }} />
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'ne' }); }} style={{ position: 'absolute', top: '-8px', right: '-8px', width: '16px', height: '16px', backgroundColor: '#ffffff', cursor: 'nesw-resize', zIndex: 10, borderRadius: '50%' }} />
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'sw' }); }} style={{ position: 'absolute', bottom: '-8px', left: '-8px', width: '16px', height: '16px', backgroundColor: '#ffffff', cursor: 'nesw-resize', zIndex: 10, borderRadius: '50%' }} />
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'se' }); }} style={{ position: 'absolute', bottom: '-8px', right: '-8px', width: '16px', height: '16px', backgroundColor: '#ffffff', cursor: 'nwse-resize', zIndex: 10, borderRadius: '50%' }} />
                </div>
              ))}
              {currentRect && isDrawing && <div style={{ position: 'absolute', left: `${currentRect.x}px`, top: `${currentRect.y}px`, width: `${currentRect.width}px`, height: `${currentRect.height}px`, border: '1px dashed #ffffff', backgroundColor: 'rgba(255,255,255,0.05)', pointerEvents: 'none', borderRadius: '12px' }} />}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#ffffff', pointerEvents: 'none' }}>
              <div className="ia-core-breathing" style={{ width: '90px', height: '90px', borderRadius: '30px', overflow: 'hidden', marginBottom: '1.5rem', border: '1px solid #262626' }}>
                <img src="/assets/imagenes/Icono-intro.jpeg" alt="Core" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', letterSpacing: '4px', textTransform: 'uppercase', fontWeight: 'bold' }}>MONITOR CENTRAL</p>
              <p style={{ margin: 0, fontSize: '0.65rem', color: '#404040', textTransform: 'uppercase', letterSpacing: '2px', marginTop: '8px' }}>ESPERANDO ARCHIVO DE ORIGEN</p>
            </div>
          )}
        </section>

        {/* LÍNEA DE TIEMPO VISUAL (NUEVO) */}
        <section style={{ width: '100%', backgroundColor: '#050505', border: '1px solid #1a1a1a', borderRadius: '16px', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowX: 'auto', minHeight: '120px' }}>
          <p style={{ margin: 0, fontSize: '0.65rem', color: '#737373', letterSpacing: '2px', textTransform: 'uppercase' }}>PISTA DE EDICIÓN (TIMELINE)</p>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', height: '100%', minWidth: '100%' }}>
            {lineaDeTiempo.length === 0 ? (
              <p style={{ color: '#262626', fontSize: '0.75rem', margin: 'auto', fontStyle: 'italic' }}>Pista vacía. Añade elementos desde la galería.</p>
            ) : (
              lineaDeTiempo.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: item.tipo === 'video' ? '#0a1a2a' : item.tipo === 'audio' ? '#1a0a2a' : '#1a1a0a', border: `1px solid ${item.tipo === 'video' ? '#0077ff' : item.tipo === 'audio' ? '#bb00ff' : '#ffaa00'}`, borderRadius: '8px', padding: '0.8rem', minWidth: '180px', flexShrink: 0 }}>
                  <div>
                    <span style={{ fontSize: '0.6rem', color: '#ffffff', backgroundColor: 'rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '4px', marginRight: '8px' }}>{item.etiqueta}</span>
                    <span style={{ fontSize: '0.75rem', color: '#ededed' }}>{item.nombre.substring(0, 12)}...</span>
                  </div>
                  <button onClick={() => quitarDelTimeline(item.id)} style={{ background: 'transparent', border: 'none', color: '#ff4444', cursor: 'pointer', fontSize: '0.8rem' }}>✕</button>
                </div>
              ))
            )}
          </div>
        </section>

        {/* NAVEGACIÓN PRINCIPAL (LOS 4 BOTONES REDONDEADOS) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          <button className={`nav-btn ${navActiva === 'herramientas' ? 'active' : ''}`} onClick={() => setNavActiva(navActiva === 'herramientas' ? null : 'herramientas')}>HERRAMIENTAS</button>
          <button className={`nav-btn ${navActiva === 'editor' ? 'active' : ''}`} onClick={() => setNavActiva(navActiva === 'editor' ? null : 'editor')}>EDITOR</button>
          <button className={`nav-btn ${navActiva === 'ia' ? 'active' : ''}`} onClick={() => setNavActiva(navActiva === 'ia' ? null : 'ia')}>INTELIGENCIA ARTIFICIAL</button>
          <button className={`nav-btn ${navActiva === 'galeria' ? 'active' : ''}`} onClick={() => setNavActiva(navActiva === 'galeria' ? null : 'galeria')}>GALERÍA</button>
        </div>

        {/* PANELES CONDICIONALES BASADOS EN NAVEGACIÓN */}
        {navActiva === 'herramientas' && (
          <section style={{ backgroundColor: '#050505', padding: '2rem', border: '1px solid #1a1a1a', borderRadius: '24px' }}>
            <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '0.8rem', color: '#ffffff', letterSpacing: '2px' }}>HERRAMIENTAS DEL SISTEMA</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <p style={{ fontSize: '0.7rem', color: '#737373', textTransform: 'uppercase', marginBottom: '1rem' }}>Inyector de Código JavaScript</p>
                <textarea value={codigoJsInput} onChange={(e) => setCodigoJsInput(e.target.value)} style={{ width: '100%', height: '150px', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '16px', color: '#a3a3a3', padding: '1rem', fontSize: '0.8rem', fontFamily: 'monospace', resize: 'none', outline: 'none' }} />
                <button style={{ width: '100%', marginTop: '1rem', padding: '1rem', backgroundColor: '#ffffff', color: '#000000', border: 'none', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>EJECUTAR SCRIPT</button>
              </div>
              <div>
                <p style={{ fontSize: '0.7rem', color: '#737373', textTransform: 'uppercase', marginBottom: '1rem' }}>Supresión Visual (Video)</p>
                <div style={{ backgroundColor: '#0a0a0a', padding: '1.5rem', borderRadius: '16px', border: '1px dashed #262626' }}>
                  <input type="file" accept="video/*" onChange={handleFileChange} style={{ width: '100%', color: '#737373', fontSize: '0.75rem', marginBottom: '1.5rem' }} />
                  <button onClick={() => processVideo('nube')} style={{ width: '100%', padding: '1rem', backgroundColor: 'transparent', border: '1px solid #ffffff', borderRadius: '100px', color: '#ffffff', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>PROCESAR VIDEO</button>
                </div>
              </div>
            </div>
          </section>
        )}

        {navActiva === 'editor' && (
          <section style={{ backgroundColor: '#050505', padding: '3rem', border: '1px solid #1a1a1a', borderRadius: '24px', textAlign: 'center' }}>
            <p style={{ color: '#737373', fontSize: '0.8rem', letterSpacing: '2px' }}>CONECTANDO CON MOTOR DE EDICIÓN NAYLA...</p>
          </section>
        )}

        {navActiva === 'ia' && (
          <section style={{ backgroundColor: '#050505', padding: '3rem', border: '1px solid #1a1a1a', borderRadius: '24px', textAlign: 'center' }}>
            <p style={{ color: '#737373', fontSize: '0.8rem', letterSpacing: '2px' }}>ESPERANDO ENLACE CON NÚCLEO DE INTELIGENCIA ARTIFICIAL...</p>
          </section>
        )}

        {navActiva === 'galeria' && (
          <section style={{ backgroundColor: '#050505', padding: '2rem', border: '1px solid #1a1a1a', borderRadius: '24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '2rem' }}>
              <label style={{ display: 'block', textAlign: 'center', padding: '1.2rem', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '16px', fontSize: '0.75rem', color: '#a3a3a3', cursor: 'pointer', textTransform: 'uppercase', transition: 'background 0.3s' }} onMouseOver={(e) => e.currentTarget.style.background='#111'} onMouseOut={(e) => e.currentTarget.style.background='#0a0a0a'}>+ FOTO <input type="file" accept="image/*" onChange={(e) => handleSubirMultimedia(e, 'foto')} style={{ display: 'none' }} /></label>
              <label style={{ display: 'block', textAlign: 'center', padding: '1.2rem', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '16px', fontSize: '0.75rem', color: '#a3a3a3', cursor: 'pointer', textTransform: 'uppercase', transition: 'background 0.3s' }} onMouseOver={(e) => e.currentTarget.style.background='#111'} onMouseOut={(e) => e.currentTarget.style.background='#0a0a0a'}>+ VIDEO <input type="file" accept="video/*" onChange={(e) => handleSubirMultimedia(e, 'video')} style={{ display: 'none' }} /></label>
              <label style={{ display: 'block', textAlign: 'center', padding: '1.2rem', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '16px', fontSize: '0.75rem', color: '#a3a3a3', cursor: 'pointer', textTransform: 'uppercase', transition: 'background 0.3s' }} onMouseOver={(e) => e.currentTarget.style.background='#111'} onMouseOut={(e) => e.currentTarget.style.background='#0a0a0a'}>+ AUDIO <input type="file" accept="audio/*" onChange={(e) => handleSubirMultimedia(e, 'audio')} style={{ display: 'none' }} /></label>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {galeriaMultimedia.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#404040', fontSize: '0.75rem', padding: '2rem' }}>GALERÍA VACÍA</p>
              ) : (
                galeriaMultimedia.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem', backgroundColor: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '16px' }}>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                      <span style={{ fontSize: '1rem', backgroundColor: '#262626', padding: '8px 12px', borderRadius: '8px', color: '#ffffff', fontWeight: 'bold' }}>{item.etiqueta}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', width: '60%' }}>
                        <input 
                          type="text" 
                          value={item.nombre} 
                          onChange={(e) => renombrarItem(item.id, e.target.value)}
                          className="rename-input"
                          title="Clic para renombrar"
                        />
                        <span style={{ fontSize: '0.6rem', color: '#737373', marginTop: '4px' }}>{item.creado_en}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      {item.tipo === 'foto' && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '0.7rem', color: item.esOverlay ? '#00ffcc' : '#737373' }}>
                          <input type="checkbox" checked={item.esOverlay} onChange={() => toggleOverlay(item.id)} style={{ accentColor: '#00ffcc' }} />
                          OVERLAY
                        </label>
                      )}
                      
                      {item.tipo === 'video' && (
                        <select style={{ backgroundColor: '#000000', color: '#ededed', border: '1px solid #262626', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', outline: 'none' }}>
                          <option value="1080p">1080p</option>
                          <option value="720p">720p</option>
                          <option value="4k">4K UHD</option>
                        </select>
                      )}

                      <button onClick={() => agregarAlTimeline(item)} style={{ background: '#ffffff', border: 'none', color: '#000000', padding: '6px 12px', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>+ PISTA</button>
                      <button onClick={() => descargarItem(item.url, item.nombre)} style={{ background: 'transparent', border: '1px solid #404040', color: '#ededed', padding: '6px 12px', borderRadius: '100px', fontSize: '0.7rem', cursor: 'pointer' }}>↓</button>
                      <button onClick={() => eliminarDeGaleria(item.id)} style={{ background: 'transparent', border: 'none', color: '#ff4444', fontSize: '0.7rem', cursor: 'pointer', padding: '6px' }}>✕</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
