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
  const [navActiva, setNavActiva] = useState<string | null>('galeria'); 
  const [codigoJsInput, setCodigoJsInput] = useState('// Inyecta comandos JS aquí\n// Ej: NaylaEngine.unir(V1, V2);\nconsole.log("Nayla Engine Activado");');
  
  // MEMORIA DE EDICIÓN
  const [galeriaMultimedia, setGaleriaMultimedia] = useState<MediaItem[]>([]);
  const [lineaDeTiempo, setLineaDeTiempo] = useState<TimelineItem[]>([]);
  
  // ESTADOS DEL EDITOR VISUAL
  const [clipSeleccionado, setClipSeleccionado] = useState<string | null>(null);
  const [canvasRatio, setCanvasRatio] = useState<'9/16' | '16/9' | '1/1' | '4/5'>('9/16');

  const [showIntro, setShowIntro] = useState(true);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoTerminado, setVideoTerminado] = useState<string | null>(null);
  const [progresoCarga, setProgresoCarga] = useState(0);
  const [videoResultadoUrl, setVideoResultadoUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState({ width: 1080, height: 1920 });
  
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
    setLineaDeTiempo(lineaDeTiempo.filter(item => item.mediaId !== id)); 
  };

  // TIMELINE
  const agregarAlTimeline = (item: MediaItem) => {
    const nuevoElementoTrack: TimelineItem = {
      id: Date.now().toString(),
      mediaId: item.id,
      tipo: item.tipo,
      nombre: item.nombre,
      etiqueta: item.etiqueta,
      url: item.url
    };
    setLineaDeTiempo([...lineaDeTiempo, nuevoElementoTrack]);
  };

  const quitarDelTimeline = (id: string) => {
    setLineaDeTiempo(lineaDeTiempo.filter(t => t.id !== id));
    setClipSeleccionado(null);
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

  // MÁSCARAS
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

    ::-webkit-scrollbar { height: 4px; width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 10px; }
    
    /* EFECTO CRISTAL Y NEÓN (GLASSMORPHISM) */
    .glass-btn { 
      background: rgba(255, 255, 255, 0.05); 
      backdrop-filter: blur(10px); 
      border: 1px solid rgba(255, 255, 255, 0.1); 
      color: #ffffff; 
      transition: all 0.3s ease;
    }
    .glass-btn.active, .glass-btn:active { 
      background: rgba(255, 255, 255, 0.15); 
      border-color: rgba(255, 255, 255, 0.8);
      box-shadow: 0 0 15px rgba(255, 255, 255, 0.5); 
    }

    .nav-btn { font-size: 0.7rem; font-weight: bold; padding: 0.8rem 1.2rem; border-radius: 100px; cursor: pointer; text-transform: uppercase; white-space: nowrap; }

    .rename-input { background: transparent; border: none; color: #ffffff; font-size: 0.85rem; border-bottom: 1px dashed rgba(255,255,255,0.3); outline: none; width: 100%; transition: border-color 0.3s; }
    .rename-input:focus { border-bottom: 1px solid #ffffff; }
    
    .tool-btn { background: transparent; border: none; color: #a3a3a3; display: flex; flex-direction: column; align-items: center; gap: 6px; font-size: 0.65rem; cursor: pointer; transition: 0.2s; min-width: 60px; }
    .tool-btn:hover { color: #ffffff; }
    .tool-icon { 
      width: 45px; height: 45px; 
      display: flex; justify-content: center; align-items: center; 
      border-radius: 12px; 
    }
    .tool-btn:active .tool-icon {
      box-shadow: 0 0 15px rgba(255, 255, 255, 0.6);
      background: rgba(255, 255, 255, 0.2);
    }

    /* TIMELINE CONTINUO TIPO PELÍCULA */
    .filmstrip-container { display: flex; height: 60px; overflow-x: auto; padding: 0 50%; gap: 0; align-items: center; }
    .clip-block { 
      height: 100%; min-width: 70px; position: relative; cursor: pointer; flex-shrink: 0; 
      border-top: 2px solid transparent; border-bottom: 2px solid transparent; border-right: 1px solid rgba(0,0,0,0.8);
      transition: 0.2s; 
    }
    .clip-block:first-child { border-top-left-radius: 8px; border-bottom-left-radius: 8px; }
    .clip-block:last-child { border-top-right-radius: 8px; border-bottom-right-radius: 8px; border-right: none; }
    
    .clip-block.selected { 
      border: 2px solid #ffffff; 
      z-index: 10; 
      box-shadow: 0 0 15px rgba(255,255,255,0.4); 
      border-radius: 8px; /* Redondea todo cuando se selecciona */
    }
    
    .audio-block { height: 35px; border-radius: 8px; flex-shrink: 0; min-width: 120px; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 0.65rem; cursor: pointer; margin-right: 2px; }
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
        <style>{globalStyles}</style>
        <div className="glass-btn" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem', borderRadius: '24px', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
          <h1 style={{ fontSize: '1rem', letterSpacing: '4px', margin: '0 0 0.5rem 0', textTransform: 'uppercase' }}>NAYLA</h1>
          <p style={{ color: '#737373', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '2.5rem' }}>Core System Login</p>
          
          <button onClick={handleBiometricAuth} disabled={authLoading} className="glass-btn" style={{ width: '100%', padding: '1rem', borderRadius: '100px', fontWeight: 'bold', letterSpacing: '1px', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '1.5rem' }}>
            {authLoading ? 'VERIFICANDO...' : 'ACCESO BIOMÉTRICO'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#404040', fontSize: '0.7rem', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} /> O <div style={{ flex: 1, height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
          </div>

          {!otpEnviado ? (
            <form onSubmit={handleEmailAuth} style={{ textAlign: 'left' }}>
              <input type="email" placeholder="CORREO MAESTRO" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} style={{ width: '100%', padding: '1rem', backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '16px', color: '#ffffff', fontSize: '0.8rem', marginBottom: '1rem', textAlign: 'center', outline: 'none' }} />
              <button type="submit" disabled={authLoading} className="glass-btn" style={{ width: '100%', padding: '1rem', borderRadius: '100px', fontWeight: 'bold', fontSize: '0.75rem', letterSpacing: '1px', cursor: 'pointer' }}>
                SOLICITAR CÓDIGO
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpVerify} style={{ textAlign: 'left' }}>
              <input type="text" placeholder="000000" value={otpInput} onChange={(e) => setOtpInput(e.target.value)} maxLength={6} style={{ width: '100%', padding: '1.2rem', backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.8)', borderRadius: '16px', color: '#ffffff', fontSize: '1.5rem', marginBottom: '1rem', textAlign: 'center', letterSpacing: '1rem', outline: 'none' }} />
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

  // SEPARACIÓN DE PISTAS PARA EL NUEVO TIMELINE
  const pistaVideo = lineaDeTiempo.filter(t => t.tipo === 'video' || t.tipo === 'foto');
  const pistaAudio = lineaDeTiempo.filter(t => t.tipo === 'audio');

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#ededed', fontFamily: 'system-ui, sans-serif' }}>
      <Head><title>NAYLA CORE</title></Head>
      <style>{globalStyles}</style>
      
      {/* HEADER CRISTAL */}
      <header style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#050505' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA" style={{ width: '40px', height: '40px', borderRadius: '10px', objectFit: 'cover' }} />
          <span style={{ fontSize: '0.7rem', padding: '4px 10px', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '100px', letterSpacing: '2px', fontWeight: 'bold', color: '#ffffff' }}>LOGIC</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <p style={{ margin: 0, color: '#737373', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '1px', textAlign: 'right', display: ['none', 'block'] }}>
            ID: {session.user.email}
          </p>
          
          <div style={{ position: 'relative' }}>
            <div 
              onClick={() => setMenuUsuarioAbierto(!menuUsuarioAbierto)}
              style={{ width: '40px', height: '40px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', overflow: 'hidden', cursor: 'pointer', backgroundColor: '#0a0a0a', transition: 'transform 0.2s' }}
            >
              <img src={fotoUsuarioUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>

            {menuUsuarioAbierto && (
              <div className="glass-btn" style={{ position: 'absolute', top: '55px', right: '0', width: '300px', borderRadius: '20px', padding: '1.5rem', zIndex: 1000 }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.65rem', color: '#a3a3a3', cursor: 'pointer', textTransform: 'uppercase', borderBottom: '1px dashed #404040', paddingBottom: '2px' }}>
                    ACTUALIZAR AVATAR <input type="file" accept="image/*" onChange={handleCambiarFotoUsuario} style={{ display: 'none' }} />
                  </label>
                </div>
                <div style={{ marginBottom: '1.5rem', backgroundColor: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '0.8rem' }}>
                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#ffffff', letterSpacing: '1px', fontWeight: 'bold' }}>LOGIC STORAGE</p>
                    <p style={{ margin: 0, fontSize: '0.65rem', color: '#00ffcc' }}>MASTER</p>
                  </div>
                  <div style={{ width: '100%', height: '6px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden', marginBottom: '0.5rem' }}><div style={{ width: '100%', height: '100%', backgroundColor: '#ffffff', borderRadius: '10px' }} /></div>
                  <p style={{ margin: 0, fontSize: '0.65rem', color: '#737373', lineHeight: '1.4' }}>Capacidad de procesamiento ilimitada.</p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1.2rem' }}>
                  <button onClick={() => supabase.auth.signOut()} className="glass-btn nav-btn" style={{ padding: '0.6rem 1rem' }}>DESCONECTAR</button>
                  <button onClick={handleRegistrarBiometria} className="glass-btn" style={{ width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12v.01"/><path d="M17.5 17.5V16a6 6 0 0 0-11 0v1.5"/><path d="M22 12A10 10 0 0 0 2 12"/><path d="M19 19a8 8 0 0 0-14 0"/><path d="M12 21a5 5 0 0 0-5-5"/></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* MONITOR CENTRAL DINÁMICO */}
        <section style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px', backgroundColor: '#050505', position: 'relative' }}>
          <div ref={containerRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp} 
            style={{ 
              aspectRatio: canvasRatio, 
              height: '100%', 
              maxHeight: '40vh', 
              backgroundColor: '#0a0a0a', 
              borderRadius: '16px', 
              overflow: 'hidden', 
              position: 'relative',
              boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
              border: '1px solid rgba(255,255,255,0.05)',
              touchAction: 'none'
            }}>
            {videoTerminado ? (
              <>
                <video ref={videoRef} src={videoTerminado} autoPlay loop muted onLoadedMetadata={(e) => { setVideoMetadata({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight }); }} style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
                
                {/* LÓGICA ORIGINAL DE RECTÁNGULOS */}
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
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'center', alignItems: 'center', color: '#404040', pointerEvents: 'none' }}>
                <p style={{ margin: 0, fontSize: '0.85rem', letterSpacing: '4px', textTransform: 'uppercase', fontWeight: 'bold', color: 'rgba(255,255,255,0.5)' }}>VISTA PREVIA</p>
                <p style={{ margin: 0, fontSize: '0.65rem', color: '#404040', textTransform: 'uppercase', letterSpacing: '2px', marginTop: '8px' }}>ESPERANDO ORIGEN</p>
              </div>
            )}
          </div>
        </section>

        {/* CONTROLES DE REPRODUCCIÓN */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', alignItems: 'center', backgroundColor: '#000' }}>
          <span style={{ color: '#737373', fontSize: '0.75rem', fontFamily: 'monospace' }}>00:00:00</span>
          <button style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', textShadow: '0 0 10px rgba(255,255,255,0.5)' }}>▶</button>
          <span style={{ color: '#737373', fontSize: '0.75rem', fontFamily: 'monospace' }}>00:00:00</span>
        </div>

        {/* TIMELINE HORIZONTAL TIPO FILMSTRIP (CONTINUO SIN ESPACIOS) */}
        <section style={{ height: '160px', backgroundColor: '#050505', position: 'relative', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '10px 0' }} onClick={() => setClipSeleccionado(null)}>
          
          {/* Playhead Central (Línea Blanca resplandeciente) */}
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', backgroundColor: '#ffffff', zIndex: 50, pointerEvents: 'none', boxShadow: '0 0 15px rgba(255,255,255,0.8)' }}>
            <div style={{ position: 'absolute', top: 0, left: '-4px', width: '10px', height: '10px', backgroundColor: '#ffffff', borderRadius: '50%', boxShadow: '0 0 10px rgba(255,255,255,0.8)' }}></div>
          </div>

          {/* Carril de Videos Continuo */}
          <div ref={timelineRef} className="filmstrip-container" onClick={(e) => e.stopPropagation()}>
            <div className="glass-btn" style={{ width: '40px', height: '60px', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#fff', cursor: 'pointer', flexShrink: 0, marginRight: '10px', borderStyle: 'dashed' }}>+</div>
            
            {pistaVideo.map((clip) => (
              <div key={clip.id} onClick={() => setClipSeleccionado(clip.id)} className={`clip-block ${clipSeleccionado === clip.id ? 'selected' : ''}`}>
                <img src={clip.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <span style={{ position: 'absolute', top: '4px', left: '6px', fontSize: '0.6rem', color: '#fff', fontWeight: 'bold', textShadow: '0 2px 4px #000' }}>{clip.etiqueta}</span>
              </div>
            ))}
          </div>

          {/* Carril de Audios */}
          <div style={{ display: 'flex', alignItems: 'center', height: '40px', overflowX: 'auto', padding: '0 50%', gap: '2px', marginTop: '10px' }} onClick={(e) => e.stopPropagation()}>
            {pistaAudio.map((clip) => (
              <div key={clip.id} onClick={() => setClipSeleccionado(clip.id)} className="audio-block glass-btn" style={{ borderColor: clipSeleccionado === clip.id ? '#ffffff' : 'rgba(255,255,255,0.1)' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:'5px'}}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                {clip.etiqueta}
              </div>
            ))}
          </div>
        </section>

        {/* BARRA DE HERRAMIENTAS (ICONOS SVG BLANCOS CON EFECTO NEON/GLASS) */}
        <section style={{ display: 'flex', overflowX: 'auto', padding: '15px 10px', gap: '8px', backgroundColor: '#000000' }}>
          {clipSeleccionado ? (
            <>
              <button className="tool-btn"><div className="tool-icon glass-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg></div>Dividir</button>
              <button className="tool-btn" onClick={() => quitarDelTimeline(clipSeleccionado)}><div className="tool-icon glass-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></div>Borrar</button>
              <button className="tool-btn"><div className="tool-icon glass-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg></div>Volumen</button>
              <button className="tool-btn"><div className="tool-icon glass-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>Velocidad</button>
              <button className="tool-btn"><div className="tool-icon glass-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>Animación</button>
            </>
          ) : (
            <>
              <button className="tool-btn" onClick={() => setNavActiva('lona')}><div className="tool-icon glass-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M3 9h18M9 21V9"/></svg></div>Lona</button>
              <button className="tool-btn"><div className="tool-icon glass-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>Audio</button>
              <button className="tool-btn"><div className="tool-icon glass-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3M12 4v16M8 20h8"/></svg></div>Texto</button>
              <button className="tool-btn"><div className="tool-icon glass-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18M3 12h18M5.5 5.5l13 13M18.5 5.5l-13 13"/></svg></div>Efecto</button>
              <button className="tool-btn"><div className="tool-icon glass-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><rect x="12" y="12" width="7" height="5" rx="1"/></svg></div>PIP</button>
              <button className="tool-btn"><div className="tool-icon glass-btn"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/></svg></div>Filtro</button>
            </>
          )}
        </section>

        {/* MODULOS LÓGICOS DE NAYLA */}
        <div style={{ padding: '15px', borderTop: '1px solid rgba(255,255,255,0.05)', backgroundColor: '#050505', paddingBottom: '30px' }}>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '15px' }}>
            <button className={`glass-btn nav-btn ${navActiva === 'galeria' ? 'active' : ''}`} onClick={() => setNavActiva('galeria')}>📁 BODEGA MÚLTIPLE</button>
            <button className={`glass-btn nav-btn ${navActiva === 'herramientas' ? 'active' : ''}`} onClick={() => setNavActiva('herramientas')}>⚡ SCRIPT & MOTOR</button>
            <button className={`glass-btn nav-btn ${navActiva === 'ia' ? 'active' : ''}`} onClick={() => setNavActiva('ia')}>🤖 SUPERVISOR IA</button>
          </div>
          
          {navActiva === 'lona' && (
            <div style={{ padding: '1rem 0', display: 'flex', gap: '10px' }}>
              <button className={`glass-btn ${canvasRatio === '9/16' ? 'active' : ''}`} onClick={() => setCanvasRatio('9/16')} style={{ padding: '10px', borderRadius: '8px' }}>9:16 (TikTok)</button>
              <button className={`glass-btn ${canvasRatio === '16/9' ? 'active' : ''}`} onClick={() => setCanvasRatio('16/9')} style={{ padding: '10px', borderRadius: '8px' }}>16:9 (YouTube)</button>
              <button className={`glass-btn ${canvasRatio === '1/1' ? 'active' : ''}`} onClick={() => setCanvasRatio('1/1')} style={{ padding: '10px', borderRadius: '8px' }}>1:1 (Insta)</button>
            </div>
          )}

          {/* GALERÍA ORIGINAL INTACTA */}
          {navActiva === 'galeria' && (
            <div style={{ padding: '1rem 0' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem' }}>
                <label className="glass-btn" style={{ flex: 1, textAlign: 'center', padding: '1rem', borderStyle: 'dashed', borderRadius: '12px', fontSize: '0.7rem', color: '#a3a3a3', cursor: 'pointer' }}>+ SUBIR <input type="file" multiple accept="video/*,image/*" onChange={(e) => handleSubirMultimedia(e, 'video')} style={{ display: 'none' }} /></label>
                <label className="glass-btn" style={{ flex: 1, textAlign: 'center', padding: '1rem', borderStyle: 'dashed', borderRadius: '12px', fontSize: '0.7rem', color: '#a3a3a3', cursor: 'pointer' }}>+ AUDIO <input type="file" multiple accept="audio/*" onChange={(e) => handleSubirMultimedia(e, 'audio')} style={{ display: 'none' }} /></label>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {galeriaMultimedia.length === 0 ? <p style={{ textAlign: 'center', color: '#404040', fontSize: '0.75rem' }}>GALERÍA VACÍA</p> : 
                  galeriaMultimedia.map(item => (
                    <div key={item.id} className="glass-btn" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem', borderRadius: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                        <span style={{ fontSize: '0.8rem', backgroundColor: 'rgba(255,255,255,0.1)', padding: '6px 10px', borderRadius: '8px', color: '#ffffff', fontWeight: 'bold' }}>{item.etiqueta}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', width: '60%' }}>
                          <input type="text" value={item.nombre} onChange={(e) => renombrarItem(item.id, e.target.value)} className="rename-input" title="Clic para renombrar" />
                          <span style={{ fontSize: '0.6rem', color: '#737373', marginTop: '4px' }}>{item.creado_en}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        {item.tipo === 'foto' && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '0.7rem', color: item.esOverlay ? '#ffffff' : '#737373' }}>
                            <input type="checkbox" checked={item.esOverlay} onChange={() => toggleOverlay(item.id)} style={{ accentColor: '#ffffff' }} /> OVERLAY
                          </label>
                        )}
                        <button className="glass-btn" onClick={() => agregarAlTimeline(item)} style={{ padding: '6px 12px', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>+ PISTA</button>
                        <button onClick={() => eliminarDeGaleria(item.id)} style={{ background: 'transparent', border: 'none', color: '#ff4444', fontSize: '0.7rem', cursor: 'pointer', padding: '6px' }}>✕</button>
                      </div>
                    </div>
                ))}
              </div>
            </div>
          )}

          {/* HERRAMIENTAS ORIGINALES INTACTAS */}
          {navActiva === 'herramientas' && (
            <div style={{ padding: '1rem 0' }}>
              <p style={{ fontSize: '0.7rem', color: '#737373', textTransform: 'uppercase', marginBottom: '1rem' }}>Inyector de Código JavaScript</p>
              <textarea value={codigoJsInput} onChange={(e) => setCodigoJsInput(e.target.value)} style={{ width: '100%', height: '100px', backgroundColor: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', color: '#00ffcc', padding: '1rem', fontFamily: 'monospace', resize: 'none', outline: 'none' }} />
              <button className="glass-btn active" style={{ width: '100%', marginTop: '1rem', padding: '1rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', marginBottom: '2rem' }}>EJECUTAR SCRIPT</button>

              <p style={{ fontSize: '0.7rem', color: '#737373', textTransform: 'uppercase', marginBottom: '1rem' }}>Supresión Visual (Video Local)</p>
              <div className="glass-btn" style={{ padding: '1.5rem', borderRadius: '16px', borderStyle: 'dashed' }}>
                <button onClick={() => processVideo('local')} className="glass-btn" style={{ width: '100%', padding: '1rem', borderRadius: '100px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>PROCESAR MÁSCARAS</button>
              </div>
            </div>
          )}
          
          {navActiva === 'ia' && (
            <div style={{ padding: '2rem 0', textAlign: 'center' }}>
               <p style={{ color: '#ffffff', fontSize: '0.75rem', letterSpacing: '1px', textShadow: '0 0 10px rgba(255,255,255,0.5)' }}>ESPERANDO ENLACE CON AGENTES ORACLE...</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}