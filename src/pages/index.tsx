// @ts-nocheck
/* eslint-disable */
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type MediaItem = { id: string; url: string; tipo: 'foto' | 'video' | 'audio'; nombre: string; etiqueta: string; duracion?: string };

export default function NaylaCore() {
  const [session, setSession] = useState(null);
  const [emailInput, setEmailInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [otpEnviado, setOtpEnviado] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setMessage] = useState('');
  
  // ESTADOS DEL MOTOR
  const [menuUsuarioAbierto, setMenuUsuarioAbierto] = useState(false);
  const [navActiva, setNavActiva] = useState<string | null>('galeria'); 
  const [codigoJsInput, setCodigoJsInput] = useState('// Inyecta comandos JS aquí\nNaylaEngine.render();');
  
  const [galeria, setGaleria] = useState<MediaItem[]>([]);
  const [pistaVideo, setPistaVideo] = useState<MediaItem[]>([]);
  const [pistaAudio, setPistaAudio] = useState<MediaItem[]>([]);
  
  const [clipSeleccionado, setClipSeleccionado] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  const [showIntro, setShowIntro] = useState(true);
  const [videoTerminado, setVideoTerminado] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState({ width: 1080, height: 1920 }); // Por defecto formato TikTok
  
  const containerRef = useRef<HTMLDivElement>(null);
  const reproductorAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const timer = setTimeout(() => setShowIntro(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleBiometricAuth = async () => {
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPasskey({ domain: window.location.hostname });
      if (error) throw error;
    } catch (err) {
      setMessage(`Biometría no disponible.`);
    } finally { setAuthLoading(false); }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email: emailInput, options: { shouldCreateUser: true } });
    if (!error) setOtpEnviado(true);
    setAuthLoading(false);
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    await supabase.auth.verifyOtp({ email: emailInput, token: otpInput, type: 'email' });
    setAuthLoading(false);
  };

  // SUBIDA MASIVA (Soporta múltiples archivos a la vez)
  const handleSubirMultimedia = (e: React.ChangeEvent<HTMLInputElement>, tipo: 'foto' | 'video' | 'audio') => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    
    const nuevosItems = files.map((file, index) => {
      const inicial = tipo === 'video' ? 'V' : tipo === 'foto' ? 'F' : 'A';
      return {
        id: Date.now().toString() + index,
        url: URL.createObjectURL(file),
        tipo: tipo,
        nombre: file.name,
        etiqueta: `${inicial}${galeria.filter(i => i.tipo === tipo).length + index + 1}`
      };
    });
    
    setGaleria([...galeria, ...nuevosItems]);
    if (tipo === 'video' && !videoTerminado) setVideoTerminado(nuevosItems[0].url);
  };

  const enviarAPista = (item: MediaItem) => {
    if (item.tipo === 'video' || item.tipo === 'foto') {
      setPistaVideo([...pistaVideo, item]);
      setVideoTerminado(item.url); // Muestra en el monitor central lo que envías a la pista
    } else {
      setPistaAudio([...pistaAudio, item]);
    }
  };

  // LÓGICA DE DRAG & DROP PARA REORDENAR LA PISTA DE VIDEO
  const onDragStart = (index: number) => setDraggedIndex(index);
  
  const onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const nuevosVideos = [...pistaVideo];
    const elementoArrastrado = nuevosVideos[draggedIndex];
    nuevosVideos.splice(draggedIndex, 1);
    nuevosVideos.splice(index, 0, elementoArrastrado);
    setDraggedIndex(index);
    setPistaVideo(nuevosVideos);
  };

  const onDragEnd = () => setDraggedIndex(null);

  // REPRODUCTOR DE AUDIO EN VIVO
  const togglePlayAudio = (url: string) => {
    if (reproductorAudioRef.current) {
      if (reproductorAudioRef.current.src !== url) {
        reproductorAudioRef.current.src = url;
        reproductorAudioRef.current.play();
      } else {
        reproductorAudioRef.current.paused ? reproductorAudioRef.current.play() : reproductorAudioRef.current.pause();
      }
    } else {
      const audio = new Audio(url);
      reproductorAudioRef.current = audio;
      audio.play();
    }
  };

  const quitarDePista = (id: string, tipo: 'video'|'audio') => {
    if(tipo === 'video') setPistaVideo(pistaVideo.filter(i => i.id !== id));
    else setPistaAudio(pistaAudio.filter(i => i.id !== id));
    setClipSeleccionado(null);
  };

  const globalStyles = `
    @keyframes breathing {
      0% { transform: scale(0.98); opacity: 0.8; }
      50% { transform: scale(1.02); opacity: 1; filter: drop-shadow(0 0 20px rgba(255,255,255,0.2)); }
      100% { transform: scale(0.98); opacity: 0.8; }
    }
    .btn-capsule { background: #0a0a0a; border: 1px solid #262626; color: #a3a3a3; font-size: 0.7rem; font-weight: bold; padding: 0.8rem 1.2rem; border-radius: 100px; cursor: pointer; text-transform: uppercase; transition: 0.3s; }
    .btn-capsule.active { background: #ffffff; color: #000000; border-color: #ffffff; }
    .timeline-track { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; min-height: 70px; align-items: center; }
    .clip-block { flex-shrink: 0; height: 60px; width: 100px; border-radius: 8px; background: #1a1a1a; border: 2px solid transparent; overflow: hidden; position: relative; cursor: grab; display: flex; justify-content: center; align-items: center; }
    .clip-block.selected { border-color: #ffffff; }
    .clip-block:active { cursor: grabbing; opacity: 0.8; }
    .audio-block { flex-shrink: 0; height: 40px; width: 150px; border-radius: 8px; background: #0a1526; border: 1px solid #0055ff; display: flex; align-items: center; justify-content: space-between; padding: 0 10px; cursor: pointer; }
    ::-webkit-scrollbar { height: 4px; }
    ::-webkit-scrollbar-thumb { background: #404040; border-radius: 10px; }
  `;

  if (showIntro || !session) {
    return (
      <div style={{ height: '100vh', width: '100vw', backgroundColor: '#000000', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <Head><title>NAYLA CORE</title></Head>
        <style>{globalStyles}</style>
        {showIntro ? (
          <img src="/assets/imagenes/Icono-intro.jpeg" style={{ width: '200px', borderRadius: '30px', animation: 'breathing 3s infinite' }} />
        ) : (
          <div style={{ width: '100%', maxWidth: '350px', border: '1px solid #262626', backgroundColor: '#050505', padding: '2rem', borderRadius: '24px', textAlign: 'center' }}>
             <h1 style={{ fontSize: '1rem', letterSpacing: '4px', color: '#fff', textTransform: 'uppercase' }}>NAYLA</h1>
             <p style={{ color: '#737373', fontSize: '0.7rem', marginBottom: '2rem' }}>LOGIC ENGINE</p>
             <input type="email" placeholder="CORREO MAESTRO" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} style={{ width: '100%', padding: '1rem', backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '16px', color: '#fff', textAlign: 'center', marginBottom: '1rem' }} />
             {!otpEnviado ? (
                <button onClick={handleEmailAuth} style={{ width: '100%', padding: '1rem', backgroundColor: '#fff', color: '#000', border: 'none', borderRadius: '100px', fontWeight: 'bold' }}>ENVIAR CÓDIGO</button>
             ) : (
               <>
                <input type="text" placeholder="000000" value={otpInput} onChange={(e) => setOtpInput(e.target.value)} style={{ width: '100%', padding: '1rem', backgroundColor: '#0a0a0a', border: '1px solid #fff', borderRadius: '16px', color: '#fff', textAlign: 'center', letterSpacing: '10px', marginBottom: '1rem' }} />
                <button onClick={handleOtpVerify} style={{ width: '100%', padding: '1rem', backgroundColor: '#fff', color: '#000', border: 'none', borderRadius: '100px', fontWeight: 'bold' }}>ENTRAR</button>
               </>
             )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#000000', color: '#ededed', fontFamily: 'system-ui, sans-serif' }}>
      <Head><title>NAYLA EDITOR</title></Head>
      <style>{globalStyles}</style>
      
      {/* HEADER TIPO CAPCUT */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid #1a1a1a' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}>←</button>
          <span style={{ fontSize: '0.7rem', padding: '4px 10px', border: '1px solid #fff', borderRadius: '100px', letterSpacing: '2px', fontWeight: 'bold' }}>LOGIC</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <span style={{ fontSize: '0.65rem', color: '#737373', letterSpacing: '1px' }}>1080P / 60FPS</span>
          <button style={{ backgroundColor: '#fff', color: '#000', border: 'none', padding: '8px 16px', borderRadius: '100px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}>EXPORTAR</button>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* ÁREA DE MONITOR (DINÁMICO) */}
        <section style={{ flex: 1, backgroundColor: '#050505', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px', overflow: 'hidden' }}>
          <div style={{ 
            width: videoTerminado ? 'auto' : '100%', maxWidth: '100%', 
            aspectRatio: videoTerminado ? `${videoMetadata.width}/${videoMetadata.height}` : '9/16', 
            height: '100%', maxHeight: '45vh',
            backgroundColor: '#0a0a0a', borderRadius: '16px', overflow: 'hidden', position: 'relative' 
          }}>
            {videoTerminado ? (
              <video src={videoTerminado} autoPlay loop muted onLoadedMetadata={(e) => setVideoMetadata({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })} style={{ width: '100%', height: '100%', objectFit: 'fill' }} />
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#404040', fontSize: '0.8rem', letterSpacing: '2px' }}>MONITOR VACÍO</div>
            )}
          </div>
        </section>

        {/* CONTROLES DE REPRODUCCIÓN */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 20px', alignItems: 'center', borderBottom: '1px solid #1a1a1a' }}>
          <span style={{ color: '#737373', fontSize: '0.75rem' }}>00:00:00</span>
          <button style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer' }}>▶</button>
          <span style={{ color: '#737373', fontSize: '0.75rem' }}>00:03:00</span>
        </div>

        {/* LÍNEA DE TIEMPO MULTITRACK (TIMELINE) */}
        <section style={{ height: '220px', backgroundColor: '#000000', padding: '15px', display: 'flex', flexDirection: 'column', gap: '5px', overflowY: 'auto' }}>
          
          {/* TRACK 1: VIDEO Y FOTOS (Con Drag & Drop) */}
          <div className="timeline-track">
            {/* BOTÓN STICKY PARA AÑADIR */}
            <div style={{ flexShrink: 0, width: '40px', height: '60px', background: '#ffffff', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#000', fontSize: '1.2rem', cursor: 'pointer', zIndex: 10 }}>+</div>
            
            {pistaVideo.length === 0 ? <p style={{ color: '#262626', fontSize: '0.7rem' }}>Arrastra videos desde la galería</p> : null}
            
            {pistaVideo.map((item, index) => (
              <div 
                key={item.id} 
                draggable
                onDragStart={() => onDragStart(index)}
                onDragOver={(e) => onDragOver(e, index)}
                onDragEnd={onDragEnd}
                onClick={() => setClipSeleccionado(item.id)}
                className={`clip-block ${clipSeleccionado === item.id ? 'selected' : ''}`}
              >
                {item.tipo === 'video' || item.tipo === 'foto' ? (
                  <img src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }} />
                ) : null}
                <span style={{ position: 'absolute', bottom: '4px', left: '6px', fontSize: '0.55rem', color: '#fff', fontWeight: 'bold', textShadow: '0 1px 2px #000' }}>{item.etiqueta}</span>
              </div>
            ))}
          </div>

          {/* TRACK 2: AUDIO (Ondas) */}
          <div className="timeline-track" style={{ minHeight: '50px' }}>
            <div style={{ flexShrink: 0, width: '40px', height: '40px', background: '#1a1a1a', borderRadius: '8px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#737373', fontSize: '1rem' }}>🎵</div>
            {pistaAudio.map(item => (
              <div 
                key={item.id} 
                onClick={() => setClipSeleccionado(item.id)}
                className="audio-block"
                style={{ borderColor: clipSeleccionado === item.id ? '#ffffff' : '#0055ff' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={(e) => { e.stopPropagation(); togglePlayAudio(item.url); }} style={{ background: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontSize: '0.5rem' }}>▶</button>
                  <span style={{ fontSize: '0.6rem', color: '#fff' }}>{item.etiqueta}</span>
                </div>
                {/* Simulación visual de onda de audio */}
                <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                  {[...Array(6)].map((_, i) => (
                    <div key={i} style={{ width: '2px', height: `${Math.random() * 15 + 5}px`, backgroundColor: '#fff', borderRadius: '2px' }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* BARRA INFERIOR CONTEXTUAL (La magia de herramientas) */}
        <section style={{ borderTop: '1px solid #1a1a1a', padding: '15px', backgroundColor: '#050505', display: 'flex', overflowX: 'auto', gap: '10px' }}>
          
          {/* SI HAY UN CLIP SELECCIONADO EN LA PISTA: */}
          {clipSeleccionado ? (
            <>
              <button onClick={() => setClipSeleccionado(null)} className="btn-capsule">← ATRÁS</button>
              <button className="btn-capsule">✂️ DIVIDIR</button>
              <button className="btn-capsule">🔊 VOLUMEN</button>
              <button className="btn-capsule">⏱️ VELOCIDAD</button>
              <button onClick={() => {
                const item = pistaVideo.find(i => i.id === clipSeleccionado) || pistaAudio.find(i => i.id === clipSeleccionado);
                if (item) quitarDePista(item.id, item.tipo === 'audio' ? 'audio' : 'video');
              }} style={{ background: 'transparent', border: '1px solid #ff4444', color: '#ff4444', borderRadius: '100px', padding: '0.8rem 1.2rem', fontSize: '0.7rem', fontWeight: 'bold' }}>🗑️ BORRAR</button>
            </>
          ) : (
            /* SI NO HAY NADA SELECCIONADO (Menú Principal): */
            <>
              <button className={`btn-capsule ${navActiva === 'galeria' ? 'active' : ''}`} onClick={() => setNavActiva('galeria')}>📁 BODEGA (MÚLTIPLE)</button>
              <button className={`btn-capsule ${navActiva === 'script' ? 'active' : ''}`} onClick={() => setNavActiva('script')}>⚡ SCRIPT JS</button>
              <button className={`btn-capsule ${navActiva === 'ia' ? 'active' : ''}`} onClick={() => setNavActiva('ia')}>🤖 CHAT IA</button>
              <button className={`btn-capsule ${navActiva === 'texto' ? 'active' : ''}`} onClick={() => setNavActiva('texto')}>T TEXTO</button>
            </>
          )}
        </section>

        {/* PANELES DESPLEGABLES (Galería / Script) */}
        {!clipSeleccionado && navActiva === 'galeria' && (
          <div style={{ position: 'absolute', bottom: '80px', left: 0, right: 0, height: '40vh', backgroundColor: '#000', borderTop: '1px solid #262626', padding: '1rem', zIndex: 100, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#737373', letterSpacing: '1px' }}>RECURSOS LOCALES</span>
              <button onClick={() => setNavActiva(null)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem' }}>×</button>
            </div>
            
            <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem' }}>
              <label style={{ flex: 1, textAlign: 'center', padding: '1rem', border: '1px dashed #404040', borderRadius: '12px', fontSize: '0.7rem', color: '#a3a3a3', cursor: 'pointer' }}>+ SUBIR VIDEOS <input type="file" multiple accept="video/*" onChange={(e) => handleSubirMultimedia(e, 'video')} style={{ display: 'none' }} /></label>
              <label style={{ flex: 1, textAlign: 'center', padding: '1rem', border: '1px dashed #404040', borderRadius: '12px', fontSize: '0.7rem', color: '#a3a3a3', cursor: 'pointer' }}>+ SUBIR FOTOS <input type="file" multiple accept="image/*" onChange={(e) => handleSubirMultimedia(e, 'foto')} style={{ display: 'none' }} /></label>
              <label style={{ flex: 1, textAlign: 'center', padding: '1rem', border: '1px dashed #404040', borderRadius: '12px', fontSize: '0.7rem', color: '#a3a3a3', cursor: 'pointer' }}>+ SUBIR AUDIOS <input type="file" multiple accept="audio/*" onChange={(e) => handleSubirMultimedia(e, 'audio')} style={{ display: 'none' }} /></label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {galeria.map(item => (
                <div key={item.id} onClick={() => enviarAPista(item)} style={{ aspectRatio: '1', backgroundColor: '#1a1a1a', borderRadius: '8px', overflow: 'hidden', position: 'relative', cursor: 'pointer' }}>
                  {item.tipo === 'video' || item.tipo === 'foto' ? (
                    <img src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'flex', height: '100%', justifyContent: 'center', alignItems: 'center', color: '#0055ff', fontSize: '2rem' }}>🎵</div>
                  )}
                  <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: 0, transition: '0.2s' }} onMouseOver={e => e.currentTarget.style.opacity = '1'} onMouseOut={e => e.currentTarget.style.opacity = '0'}>
                    <span style={{ color: '#fff', fontSize: '0.7rem', fontWeight: 'bold' }}>+ AÑADIR</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!clipSeleccionado && navActiva === 'script' && (
          <div style={{ position: 'absolute', bottom: '80px', left: 0, right: 0, height: '40vh', backgroundColor: '#050505', borderTop: '1px solid #262626', padding: '1.5rem', zIndex: 100 }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#737373' }}>JS INJECTOR</span>
              <button onClick={() => setNavActiva(null)} style={{ background: 'none', border: 'none', color: '#fff' }}>×</button>
            </div>
            <textarea value={codigoJsInput} onChange={(e) => setCodigoJsInput(e.target.value)} style={{ width: '100%', height: '60%', backgroundColor: '#000', border: '1px solid #262626', color: '#00ffcc', padding: '1rem', fontFamily: 'monospace', borderRadius: '12px' }} />
            <button style={{ width: '100%', padding: '1rem', backgroundColor: '#fff', color: '#000', border: 'none', borderRadius: '100px', fontWeight: 'bold', marginTop: '1rem' }}>EJECUTAR EN MOTOR</button>
          </div>
        )}

      </div>
    </div>
  );
}
