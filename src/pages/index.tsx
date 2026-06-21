/* eslint-disable @next/next/no-img-element */
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type Rect = { id: string; x: number; y: number; width: number; height: number };

export default function NaylaCore() {
  const [session, setSession] = useState<any>(null);
  const [emailInput, setEmailInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showIntro, setShowIntro] = useState(true);
  const [herramientasAbiertas, setHerramientasAbiertas] = useState(false);
  const herramientaActiva = 'supresion_visual';
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

  // ✅ CORRECCIÓN: (supabase.auth as any) para evitar error de TypeScript
  const handleBiometricAuth = async () => {
    setAuthLoading(true);
    setMessage('Inicializando hardware biométrico...');
    try {
      const { data, error: signInError } = await (supabase.auth as any).signInWithPasskey({
        domain: window.location.hostname
      });
      if (signInError) {
        setMessage(`Error biométrico: ${signInError.message}`);
        setAuthLoading(false);
        return;
      }
      if (data) setMessage('Identidad biométrica verificada.');
    } catch (err: any) {
      setMessage(`Biometría no disponible o rechazada. Use enlace de respaldo.`);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput) return;
    setAuthLoading(true);
    setMessage('');
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: emailInput,
        options: { emailRedirectTo: window.location.origin }
      });
      if (error) { setMessage(`Error: ${error.message}`); setAuthLoading(false); return; }
      setMessage('Llave de acceso enviada. Revise su bandeja de entrada.');
    } catch (err: any) {
      setMessage(`Error crítico de verificación.`);
    } finally {
      setAuthLoading(false);
    }
  };

  const cargarProyectoGuardado = async (userId: string) => {
    const { data, error } = await supabase.from('plantillas_editor').select('*').eq('perfil_id', userId).single();
    if (data && !error) {
      if (data.video_base_url) { setVideoTerminado(data.video_base_url); setVideoResultadoUrl(data.video_base_url); }
      if (data.coordenadas) setRects(data.coordenadas);
    }
  };

  const guardarPlantillaEnNube = async () => {
    if (!session) return;
    setIsProcessing(true);
    const { error } = await supabase.from('plantillas_editor').upsert({
      perfil_id: session.user.id,
      video_base_url: videoResultadoUrl,
      coordenadas: rects,
      actualizado_en: new Date().toISOString()
    });
    setIsProcessing(false);
    if (!error) alert("PLANTILLA RESPALDADA EN SUPABASE CON ÉXITO.");
    else alert("Fallo al guardar en la base de datos.");
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

  const processVideo = async (motorElegido: 'nube' | 'local') => {
    if (!videoFile || !containerRef.current) return;
    if (motorElegido === 'nube' && rects.length === 0) { alert("Operación denegada: Defina las coordenadas del área a suprimir."); return; }
    setIsProcessing(true); setProgresoCarga(10);
    const containerRect = containerRef.current.getBoundingClientRect();
    const scaleX = videoMetadata.width / containerRect.width;
    const scaleY = videoMetadata.height / containerRect.height;
    const rectangulosReales = rects.map(r => ({ x: Math.round(r.x * scaleX), y: Math.round(r.y * scaleY), width: Math.round(r.width * scaleX), height: Math.round(r.height * scaleY) }));
    const intervaloCarga = setInterval(() => { setProgresoCarga(prev => (prev < 85 ? prev + 5 : prev)); }, 500);
    const formData = new FormData();
    formData.append('video', videoFile);
    formData.append('coordenadas', JSON.stringify(rectangulosReales));
    formData.append('motor', motorElegido);
    try {
      const res = await fetch('/api/clean-video', { method: 'POST', body: formData });
      const data = await res.json();
      clearInterval(intervaloCarga); setProgresoCarga(100);
      if (res.ok && data.url) {
        setVideoTerminado(data.url); setVideoResultadoUrl(data.url);
        setTimeout(() => { alert(data.motor === 'local_ffmpeg' ? `Procesamiento NATIVO completado.` : `Procesamiento IA completado.`); setProgresoCarga(0); setIsProcessing(false); }, 500);
      } else { alert(`Error: ${data.error}`); setProgresoCarga(0); setIsProcessing(false); }
    } catch (error) { clearInterval(intervaloCarga); setProgresoCarga(0); setIsProcessing(false); alert("Error crítico de transmisión."); }
  };

  if (showIntro) {
    return (
      <div style={{ height: '100vh', width: '100vw', backgroundColor: '#000000', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: 0 }}>
        <Head><title>NAYLA CORE</title></Head>
        <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA Logo" style={{ width: '250px', maxWidth: '80%', objectFit: 'contain' }} />
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#ffffff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
        <Head><title>NAYLA - AUTENTICACIÓN</title></Head>
        <div style={{ width: '100%', maxWidth: '400px', border: '1px solid #262626', backgroundColor: '#050505', padding: '2.5rem', borderRadius: '4px', textAlign: 'center' }}>
          <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA" style={{ width: '80px', height: '80px', borderRadius: '8px', marginBottom: '1.5rem', objectFit: 'cover' }} />
          <h1 style={{ fontSize: '1.1rem', letterSpacing: '3px', margin: '0 0 0.5rem 0', textTransform: 'uppercase' }}>NAYLA OPERATIVE SYSTEM</h1>
          <p style={{ color: '#737373', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '2rem' }}>Verificación de Identidad Requerida</p>
          <button onClick={handleBiometricAuth} disabled={authLoading} style={{ width: '100%', padding: '1rem', backgroundColor: '#ffffff', color: '#000000', border: 'none', borderRadius: '2px', fontWeight: 'bold', letterSpacing: '1px', fontSize: '0.8rem', cursor: 'pointer', marginBottom: '1.5rem', textTransform: 'uppercase' }}>
            {authLoading ? 'VERIFICANDO...' : '🔑 ACCESO BIOMÉTRICO NATIVO'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#404040', fontSize: '0.7rem', marginBottom: '1.5rem' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#262626' }} /> O <div style={{ flex: 1, height: '1px', backgroundColor: '#262626' }} />
          </div>
          <form onSubmit={handleEmailAuth} style={{ textAlign: 'left' }}>
            <label style={{ fontSize: '0.7rem', color: '#737373', textTransform: 'uppercase', letterSpacing: '1px', display: 'block', marginBottom: '0.5rem' }}>Canal de Respaldo (Email)</label>
            <input type="email" placeholder="nombre@dominio.com" value={emailInput} onChange={(e) => setEmailInput(e.target.value)} style={{ width: '100%', padding: '0.8rem', backgroundColor: '#000000', border: '1px solid #262626', borderRadius: '2px', color: '#ffffff', fontSize: '0.85rem', marginBottom: '1rem' }} />
            <button type="submit" disabled={authLoading} style={{ width: '100%', padding: '0.8rem', backgroundColor: '#000000', color: '#ffffff', border: '1px solid #ffffff', borderRadius: '2px', fontWeight: 'bold', fontSize: '0.75rem', letterSpacing: '1px', cursor: 'pointer', textTransform: 'uppercase' }}>
              SOLICITAR LLAVE DE ACCESO
            </button>
          </form>
          {message && <p style={{ marginTop: '1.5rem', marginBottom: 0, fontSize: '0.75rem', color: '#a3a3a3', letterSpacing: '0.5px' }}>{message}</p>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#ededed', padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <Head><title>NAYLA CORE</title></Head>
      <header style={{ borderBottom: '1px solid #262626', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA Pequeño" style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
          <div>
            <h1 style={{ margin: 0, color: '#ffffff', letterSpacing: '2px', fontSize: '1.2rem', textTransform: 'uppercase' }}>NAYLA CORE</h1>
            <p style={{ margin: '0', color: '#737373', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>ID OPERADOR: {session.user.email}</p>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ backgroundColor: 'transparent', border: '1px solid #262626', color: '#737373', padding: '0.5rem 1rem', fontSize: '0.7rem', cursor: 'pointer', borderRadius: '2px' }}>SALIR</button>
      </header>
      <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <section ref={containerRef} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerLeave={handlePointerUp}
          style={{ width: '100%', aspectRatio: videoTerminado ? `${videoMetadata.width}/${videoMetadata.height}` : '16/9', maxHeight: '65vh', backgroundColor: '#050505', border: '1px solid #262626', borderRadius: '4px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', touchAction: 'none', margin: '0 auto' }}>
          {videoTerminado ? (
            <>
              <video ref={videoRef} src={videoTerminado} autoPlay loop muted onLoadedMetadata={(e) => { setVideoMetadata({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight }); }} style={{ width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' }} />
              {!videoResultadoUrl && rects.map((r) => (
                <div key={r.id} onPointerDown={(e) => { e.stopPropagation(); if (!containerRef.current) return; const c = containerRef.current.getBoundingClientRect(); setDraggingInfo({ id: r.id, offsetX: (e.clientX - c.left) - r.x, offsetY: (e.clientY - c.top) - r.y }); }}
                  style={{ position: 'absolute', left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px`, border: '1px solid #ffffff', backgroundColor: 'rgba(255,255,255,0.1)', pointerEvents: 'auto', cursor: 'move' }}>
                  <div onPointerDown={(e) => { e.stopPropagation(); removeRect(r.id); }} style={{ position: 'absolute', top: '-28px', right: '-10px', width: '28px', height: '28px', backgroundColor: '#ffffff', color: '#000', borderRadius: '4px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', zIndex: 10 }}>X</div>
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'nw' }); }} style={{ position: 'absolute', top: '-8px', left: '-8px', width: '16px', height: '16px', backgroundColor: '#ffffff', cursor: 'nwse-resize', zIndex: 10, borderRadius: '50%' }} />
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'ne' }); }} style={{ position: 'absolute', top: '-8px', right: '-8px', width: '16px', height: '16px', backgroundColor: '#ffffff', cursor: 'nesw-resize', zIndex: 10, borderRadius: '50%' }} />
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'sw' }); }} style={{ position: 'absolute', bottom: '-8px', left: '-8px', width: '16px', height: '16px', backgroundColor: '#ffffff', cursor: 'nesw-resize', zIndex: 10, borderRadius: '50%' }} />
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'se' }); }} style={{ position: 'absolute', bottom: '-8px', right: '-8px', width: '16px', height: '16px', backgroundColor: '#ffffff', cursor: 'nwse-resize', zIndex: 10, borderRadius: '50%' }} />
                </div>
              ))}
              {currentRect && isDrawing && <div style={{ position: 'absolute', left: `${currentRect.x}px`, top: `${currentRect.y}px`, width: `${currentRect.width}px`, height: `${currentRect.height}px`, border: '1px dashed #ffffff', backgroundColor: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />}
            </>
          ) : (
            <div style={{ textAlign: 'center', color: '#ffffff', pointerEvents: 'none' }}>
              <p style={{ margin: 0, fontSize: '1rem', letterSpacing: '3px', fontWeight: 'bold' }}>MONITOR CENTRAL</p>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#737373', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '8px' }}>Esperando archivo de origen</p>
            </div>
          )}
        </section>

        {videoResultadoUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <a href={videoResultadoUrl} download target="_blank" rel="noopener noreferrer" style={{ display: 'block', textAlign: 'center', padding: '1rem', backgroundColor: '#ffffff', color: '#000000', borderRadius: '2px', textDecoration: 'none', fontWeight: 'bold', letterSpacing: '1px', fontSize: '0.8rem' }}>DESCARGAR VIDEO PROCESADO</a>
            <button onClick={guardarPlantillaEnNube} style={{ width: '100%', padding: '1rem', backgroundColor: '#000000', color: '#ffffff', border: '1px solid #262626', borderRadius: '2px', cursor: 'pointer', fontSize: '0.8rem', letterSpacing: '1px', fontWeight: 'bold' }}>💾 GUARDAR PROYECTO EN LA NUBE</button>
          </div>
        )}

        <button onClick={() => setHerramientasAbiertas(!herramientasAbiertas)} style={{ width: '100%', padding: '1.2rem', backgroundColor: herramientasAbiertas ? '#ffffff' : '#0a0a0a', color: herramientasAbiertas ? '#000000' : '#ffffff', border: '1px solid #262626', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', letterSpacing: '2px', textTransform: 'uppercase' }}>
          {herramientasAbiertas ? 'CERRAR PANEL DE HERRAMIENTAS' : 'HERRAMIENTAS DE EDICIÓN'}
        </button>

        {herramientasAbiertas && (
          <section style={{ backgroundColor: '#050505', padding: '1.5rem', border: '1px solid #262626', borderRadius: '4px' }}>
            {herramientaActiva === 'supresion_visual' && (
              <div>
                <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid #262626', paddingBottom: '1rem' }}>
                  <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0', color: '#ffffff', textTransform: 'uppercase', letterSpacing: '1px' }}>Supresión de Elementos Visuales</h2>
                  <p style={{ margin: 0, color: '#737373', fontSize: '0.8rem' }}>Aislamiento e interpolación de marcas de agua mediante coordenadas.</p>
                </div>
                <input type="file" accept="video/*" onChange={handleFileChange} style={{ marginBottom: '1.5rem', width: '100%', color: '#d4d4d4', fontSize: '0.9rem' }} />
                {isProcessing && (
                  <div style={{ width: '100%', height: '2px', backgroundColor: '#262626', marginBottom: '1.5rem' }}>
                    <div style={{ width: `${progresoCarga}%`, height: '100%', backgroundColor: '#ffffff', transition: 'width 0.5s ease-out' }} />
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => processVideo('nube')} disabled={!videoFile || isProcessing} style={{ flex: 1, padding: '1rem', backgroundColor: videoFile && !isProcessing ? '#ffffff' : '#171717', color: videoFile && !isProcessing ? '#000000' : '#404040', border: '1px solid #ffffff', borderRadius: '2px', cursor: videoFile && !isProcessing ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '0.8rem', letterSpacing: '1px' }}>
                    {isProcessing ? `CARGANDO... ${progresoCarga}%` : 'PROCESAMIENTO IA (NUBE)'}
                  </button>
                  <button onClick={() => processVideo('local')} disabled={!videoFile || isProcessing} style={{ flex: 1, padding: '1rem', backgroundColor: '#000000', color: videoFile && !isProcessing ? '#ffffff' : '#404040', border: videoFile && !isProcessing ? '1px solid #ffffff' : '1px solid #262626', borderRadius: '2px', cursor: videoFile && !isProcessing ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '0.8rem', letterSpacing: '1px' }}>
                    {isProcessing ? `EJECUTANDO...` : 'PROCESAMIENTO NATIVO'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
