// @ts-nocheck
/* eslint-disable */
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Rect = { id: string; x: number; y: number; width: number; height: number };
type MediaItem = { id: string; url: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; creado_en: string };

export default function NaylaCore() {
  const [session, setSession] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpEnviado, setOtpEnviado] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  // ESTADOS DE INTERFAZ MINIMALISTA
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const [fotoUsuarioUrl, setFotoUsuarioUrl] = useState('/assets/imagenes/Icono-intro.jpeg');
  const [navActiva, setNavActiva] = useState<string | null>(null); // Controla los 4 botones
  const [codigoJsInput, setCodigoJsInput] = useState('// Inyecta comandos JS aquí\nconsole.log("Nayla Engine Activado");');
  const [galeriaMultimedia, setGaleriaMultimedia] = useState<MediaItem[]>([]);
  
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

  const handleSubirMultimedia = async (e: React.ChangeEvent<HTMLInputElement>, tipo: 'foto' | 'video' | 'audio') => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const nuevoItem: MediaItem = {
      id: Date.now().toString(),
      url: URL.createObjectURL(file),
      tipo: tipo,
      nombre: file.name,
      creado_en: new Date().toLocaleTimeString()
    };
    setGaleriaMultimedia([nuevoItem, ...galeriaMultimedia]);
  };

  const cargarProyectoGuardado = async (userId: string) => {
    const { data, error } = await supabase.from('plantillas_editor').select('*').eq('perfil_id', userId).single();
    if (data && !error) {
      if (data.video_base_url) { setVideoTerminado(data.video_base_url); setVideoResultadoUrl(data.video_base_url); }
      if (data.coordenadas) setRects(data.coordenadas);
    }
  };

  const processVideo = async (motorElegido: 'nube' | 'local') => {
    if (!videoFile || !containerRef.current) return;
    setIsProcessing(true); setProgresoCarga(10);
    setTimeout(() => { alert("Procesamiento simulado en esta interfaz."); setIsProcessing(false); setProgresoCarga(0); }, 2000);
  };

  // ESTILOS GLOBALES Y ANIMACIÓN
  const globalStyles = `
    @keyframes floatAndGlow {
      0% { transform: translateY(0px) scale(0.98); opacity: 0.7; filter: drop-shadow(0 0 5px rgba(255,255,255,0.1)); }
      50% { transform: translateY(-8px) scale(1); opacity: 1; filter: drop-shadow(0 0 15px rgba(255,255,255,0.3)); }
      100% { transform: translateY(0px) scale(0.98); opacity: 0.7; filter: drop-shadow(0 0 5px rgba(255,255,255,0.1)); }
    }
    .intro-logo { animation: floatAndGlow 4s ease-in-out infinite; }
    
    .nav-btn { background: transparent; border: 1px solid #262626; color: #737373; font-size: 0.7rem; font-weight: bold; letter-spacing: 1px; padding: 1rem; border-radius: 2px; cursor: pointer; transition: all 0.3s; text-transform: uppercase; }
    .nav-btn:hover { border-color: #737373; color: #ededed; }
    .nav-btn.active { background: #ffffff; color: #000000; border-color: #ffffff; }
  `;

  if (showIntro) {
    return (
      <div style={{ height: '100vh', width: '100vw', backgroundColor: '#000000', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: 0 }}>
        <Head><title>NAYLA CORE</title></Head>
        <style>{globalStyles}</style>
        <img className="intro-logo" src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA Logo" style={{ width: '280px', maxWidth: '80%', objectFit: 'contain' }} />
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#ffffff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
        <Head><title>NAYLA - AUTENTICACIÓN</title></Head>
        <div style={{ width: '100%', maxWidth: '400px', border: '1px solid #262626', backgroundColor: '#050505', padding: '2.5rem', borderRadius: '2px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1rem', letterSpacing: '4px', margin: '0 0 0.5rem 0', textTransform: 'uppercase' }}>NAYLA</h1>
          <p style={{ color: '#737373', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '2.5rem' }}>Core System Login</p>
          
          <button onClick={handleBiometricAuth} disabled={authLoading} style={{ width: '100%', padding: '1rem', backgroundColor: '#ffffff', color: '#000000', border: 'none', borderRadius: '2px', fontWeight: 'bold', letterSpacing: '1px', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '1.5rem' }}>
            {authLoading ? 'VERIFICANDO...' : 'ACCESO BIOMÉTRICO'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#404040', fontSize: '0.7rem', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#262626' }} /> O <div style={{ flex: 1, height: '1px', backgroundColor: '#262626' }} />
          </div>

          {!otpEnviado ? (
            <form onSubmit={handleEmailAuth} style={{ textAlign: 'left' }}>
              <input type="email" placeholder="CORREO MAESTRO" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} style={{ width: '100%', padding: '0.8rem', backgroundColor: '#000000', border: '1px solid #262626', borderRadius: '2px', color: '#ffffff', fontSize: '0.8rem', marginBottom: '1rem', textAlign: 'center', letterSpacing: '1px' }} />
              <button type="submit" disabled={authLoading} style={{ width: '100%', padding: '0.8rem', backgroundColor: 'transparent', color: '#ffffff', border: '1px solid #ffffff', borderRadius: '2px', fontWeight: 'bold', fontSize: '0.75rem', letterSpacing: '1px', cursor: 'pointer' }}>
                SOLICITAR CÓDIGO
              </button>
            </form>
          ) : (
            <form onSubmit={handleOtpVerify} style={{ textAlign: 'left' }}>
              <input type="text" placeholder="000000" value={otpInput} onChange={(e) => setOtpInput(e.target.value)} maxLength={6} style={{ width: '100%', padding: '1.2rem', backgroundColor: '#000000', border: '1px solid #ffffff', borderRadius: '2px', color: '#ffffff', fontSize: '1.5rem', marginBottom: '1rem', textAlign: 'center', letterSpacing: '1rem' }} />
              <button type="submit" disabled={authLoading || otpInput.length < 6} style={{ width: '100%', padding: '1rem', backgroundColor: '#ffffff', color: '#000000', border: 'none', borderRadius: '2px', fontWeight: 'bold', fontSize: '0.8rem', letterSpacing: '1px', cursor: 'pointer' }}>
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
      
      {/* HEADER MINIMALISTA */}
      <header style={{ borderBottom: '1px solid #1a1a1a', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA" style={{ width: '45px', height: '45px', borderRadius: '4px', objectFit: 'cover' }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ margin: 0, color: '#ffffff', letterSpacing: '3px', fontSize: '1.1rem', textTransform: 'uppercase' }}>NAYLA</h1>
              <span style={{ fontSize: '0.7rem', padding: '2px 6px', border: '1px solid #ffffff', borderRadius: '2px', letterSpacing: '1px', fontWeight: 'bold' }}>LOGIC</span>
            </div>
            <p style={{ margin: '4px 0 0 0', color: '#737373', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '1px' }}>{session.user.email}</p>
          </div>
        </div>

        {/* MENÚ CIRCULAR DE USUARIO */}
        <div style={{ position: 'relative' }}>
          <div 
            onClick={() => setMenuUsuarioAbierto(!menuUsuarioAbierto)}
            style={{ width: '45px', height: '45px', borderRadius: '50%', border: '1px solid #404040', overflow: 'hidden', cursor: 'pointer', backgroundColor: '#0a0a0a' }}
          >
            <img src={fotoUsuarioUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>

          {menuUsuarioAbierto && (
            <div style={{ position: 'absolute', top: '55px', right: '0', width: '320px', backgroundColor: '#050505', border: '1px solid #262626', borderRadius: '2px', padding: '1.5rem', zIndex: 1000, boxShadow: '0 10px 30px rgba(0,0,0,0.8)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.65rem', color: '#a3a3a3', cursor: 'pointer', textTransform: 'uppercase', borderBottom: '1px dashed #404040', paddingBottom: '2px' }}>
                  ACTUALIZAR AVATAR
                  <input type="file" accept="image/*" onChange={handleCambiarFotoUsuario} style={{ display: 'none' }} />
                </label>
              </div>

              {/* BARRA LOGIC */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginBottom: '0.5rem' }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#ffffff', letterSpacing: '1px', fontWeight: 'bold' }}>LOGIC STORAGE</p>
                  <p style={{ margin: 0, fontSize: '0.65rem', color: '#00ffcc' }}>MASTER (100%)</p>
                </div>
                <div style={{ width: '100%', height: '4px', backgroundColor: '#1a1a1a', borderRadius: '2px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                  <div style={{ width: '100%', height: '100%', backgroundColor: '#ffffff' }} />
                </div>
                <p style={{ margin: 0, fontSize: '0.65rem', color: '#737373', lineHeight: '1.4' }}>
                  Capacidad de procesamiento asignada.<br/>
                  Archivos soportados: <span style={{color:'#a3a3a3'}}>Fotos, Videos y Audios.</span>
                </p>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #1a1a1a', paddingTop: '1.2rem' }}>
                <button 
                  onClick={() => supabase.auth.signOut()} 
                  style={{ backgroundColor: 'transparent', border: '1px solid #262626', color: '#a3a3a3', padding: '0.6rem 1rem', fontSize: '0.7rem', cursor: 'pointer', borderRadius: '2px', letterSpacing: '1px' }}
                >
                  DESCONECTAR
                </button>
                
                {/* BOTÓN CÍRCULO HUELLA */}
                <button 
                  onClick={handleRegistrarBiometria}
                  title="Vincular Huella"
                  style={{ width: '45px', height: '45px', borderRadius: '50%', backgroundColor: '#ffffff', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 12v.01"/><path d="M17.5 17.5V16a6 6 0 0 0-11 0v1.5"/><path d="M22 12A10 10 0 0 0 2 12"/><path d="M19 19a8 8 0 0 0-14 0"/><path d="M12 21a5 5 0 0 0-5-5"/>
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* MONITOR CENTRAL */}
        <section ref={containerRef} style={{ width: '100%', aspectRatio: '16/9', maxHeight: '55vh', backgroundColor: '#050505', border: '1px solid #1a1a1a', borderRadius: '2px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          {videoTerminado ? (
            <video ref={videoRef} src={videoTerminado} autoPlay loop muted style={{ width: '100%', height: '100%', objectFit: 'fill' }} />
          ) : (
            <div style={{ textAlign: 'center', color: '#ffffff' }}>
              <p style={{ margin: 0, fontSize: '0.8rem', letterSpacing: '4px', textTransform: 'uppercase' }}>MONITOR CENTRAL</p>
              <p style={{ margin: 0, fontSize: '0.65rem', color: '#404040', textTransform: 'uppercase', letterSpacing: '2px', marginTop: '8px' }}>SEÑAL DE VIDEO AUSENTE</p>
            </div>
          )}
        </section>

        {/* NAVEGACIÓN PRINCIPAL (LOS 4 BOTONES) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
          <button className={`nav-btn ${navActiva === 'herramientas' ? 'active' : ''}`} onClick={() => setNavActiva(navActiva === 'herramientas' ? null : 'herramientas')}>HERRAMIENTAS</button>
          <button className={`nav-btn ${navActiva === 'editor' ? 'active' : ''}`} onClick={() => setNavActiva(navActiva === 'editor' ? null : 'editor')}>EDITOR</button>
          <button className={`nav-btn ${navActiva === 'ia' ? 'active' : ''}`} onClick={() => setNavActiva(navActiva === 'ia' ? null : 'ia')}>INTELIGENCIA ARTIFICIAL</button>
          <button className={`nav-btn ${navActiva === 'galeria' ? 'active' : ''}`} onClick={() => setNavActiva(navActiva === 'galeria' ? null : 'galeria')}>GALERÍA</button>
        </div>

        {/* PANELES CONDICIONALES BASADOS EN NAVEGACIÓN */}
        {navActiva === 'herramientas' && (
          <section style={{ backgroundColor: '#050505', padding: '1.5rem', border: '1px solid #1a1a1a', borderRadius: '2px' }}>
            <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '0.8rem', color: '#ffffff', letterSpacing: '2px' }}>HERRAMIENTAS DEL SISTEMA</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              <div>
                <p style={{ fontSize: '0.7rem', color: '#737373', textTransform: 'uppercase', marginBottom: '1rem' }}>Inyector de Código JavaScript</p>
                <textarea value={codigoJsInput} onChange={(e) => setCodigoJsInput(e.target.value)} style={{ width: '100%', height: '150px', backgroundColor: '#000000', border: '1px solid #262626', color: '#a3a3a3', padding: '1rem', fontSize: '0.75rem', fontFamily: 'monospace', resize: 'none' }} />
                <button style={{ width: '100%', marginTop: '0.5rem', padding: '0.8rem', backgroundColor: '#ffffff', color: '#000000', border: 'none', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>EJECUTAR SCRIPT</button>
              </div>
              <div>
                <p style={{ fontSize: '0.7rem', color: '#737373', textTransform: 'uppercase', marginBottom: '1rem' }}>Supresión Visual (Video)</p>
                <input type="file" accept="video/*" onChange={handleFileChange} style={{ width: '100%', padding: '0.8rem', backgroundColor: '#000000', border: '1px dashed #262626', color: '#737373', fontSize: '0.7rem', marginBottom: '1rem' }} />
                <button onClick={() => processVideo('nube')} style={{ width: '100%', padding: '0.8rem', backgroundColor: 'transparent', border: '1px solid #ffffff', color: '#ffffff', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>PROCESAR VIDEO</button>
              </div>
            </div>
          </section>
        )}

        {navActiva === 'editor' && (
          <section style={{ backgroundColor: '#050505', padding: '3rem', border: '1px solid #1a1a1a', borderRadius: '2px', textAlign: 'center' }}>
            <p style={{ color: '#737373', fontSize: '0.8rem', letterSpacing: '2px' }}>CONECTANDO CON MOTOR DE EDICIÓN NAYLA...</p>
          </section>
        )}

        {navActiva === 'ia' && (
          <section style={{ backgroundColor: '#050505', padding: '3rem', border: '1px solid #1a1a1a', borderRadius: '2px', textAlign: 'center' }}>
            <p style={{ color: '#737373', fontSize: '0.8rem', letterSpacing: '2px' }}>ESPERANDO ENLACE CON NÚCLEO DE INTELIGENCIA ARTIFICIAL...</p>
          </section>
        )}

        {navActiva === 'galeria' && (
          <section style={{ backgroundColor: '#050505', padding: '1.5rem', border: '1px solid #1a1a1a', borderRadius: '2px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '2rem' }}>
              <label style={{ display: 'block', textAlign: 'center', padding: '1rem', backgroundColor: '#000000', border: '1px solid #262626', fontSize: '0.7rem', color: '#a3a3a3', cursor: 'pointer', textTransform: 'uppercase' }}>+ FOTO <input type="file" accept="image/*" onChange={(e) => handleSubirMultimedia(e, 'foto')} style={{ display: 'none' }} /></label>
              <label style={{ display: 'block', textAlign: 'center', padding: '1rem', backgroundColor: '#000000', border: '1px solid #262626', fontSize: '0.7rem', color: '#a3a3a3', cursor: 'pointer', textTransform: 'uppercase' }}>+ VIDEO <input type="file" accept="video/*" onChange={(e) => handleSubirMultimedia(e, 'video')} style={{ display: 'none' }} /></label>
              <label style={{ display: 'block', textAlign: 'center', padding: '1rem', backgroundColor: '#000000', border: '1px solid #262626', fontSize: '0.7rem', color: '#a3a3a3', cursor: 'pointer', textTransform: 'uppercase' }}>+ AUDIO <input type="file" accept="audio/*" onChange={(e) => handleSubirMultimedia(e, 'audio')} style={{ display: 'none' }} /></label>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {galeriaMultimedia.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#404040', fontSize: '0.75rem' }}>GALERÍA VACÍA</p>
              ) : (
                galeriaMultimedia.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', backgroundColor: '#000000', border: '1px solid #1a1a1a' }}>
                    <p style={{ margin: 0, color: '#ededed', fontSize: '0.75rem' }}>{item.tipo.toUpperCase()} - {item.nombre}</p>
                    <button style={{ background: 'transparent', border: 'none', color: '#737373', fontSize: '0.7rem', cursor: 'pointer' }}>ELIMINAR</button>
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
