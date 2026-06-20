// [BOTÓN DE COPIAR]
/* eslint-disable @next/next/no-img-element */
'use client';
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

export default function NaylaCore() {
  const [showIntro, setShowIntro] = useState(true);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [herramientaActiva, setHerramientaActiva] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoTerminado, setVideoTerminado] = useState<string | null>(null);

  // --- NUEVAS VARIABLES PARA EL ESCÁNER MANUAL ---
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [rect, setRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowIntro(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setVideoFile(file);
      setVideoTerminado(URL.createObjectURL(file));
      setRect(null); // Limpiamos el cuadro si sube un video nuevo
    }
  };

  // --- LÓGICA PARA DIBUJAR EL CUADRO ROJO ---
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!videoTerminado || !containerRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const x = e.clientX - container.left;
    const y = e.clientY - container.top;
    
    setStartPos({ x, y });
    setRect({ x, y, width: 0, height: 0 });
    setIsDrawing(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDrawing || !videoTerminado || !containerRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    
    // Evitamos que el cuadro se salga del monitor
    const currentX = Math.max(0, Math.min(e.clientX - container.left, container.width));
    const currentY = Math.max(0, Math.min(e.clientY - container.top, container.height));
    
    const newX = Math.min(startPos.x, currentX);
    const newY = Math.min(startPos.y, currentY);
    const newWidth = Math.abs(currentX - startPos.x);
    const newHeight = Math.abs(currentY - startPos.y);
    
    setRect({ x: newX, y: newY, width: newWidth, height: newHeight });
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };
  // ------------------------------------------

  const processVideo = async () => {
    if (!videoFile) return;
    
    if (!rect || rect.width === 0 || rect.height === 0) {
      alert("Por favor, dibuja un cuadro sobre la marca de agua en el Monitor Central antes de ejecutar.");
      return;
    }

    setIsProcessing(true);
    
    const formData = new FormData();
    formData.append('video', videoFile);
    // Empaquetamos las coordenadas para mandarlas al servidor
    formData.append('coordenadas', JSON.stringify(rect));

    try {
      const res = await fetch('/api/clean-video', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();

      if (res.ok && data.url) {
        console.log("¡ÉXITO! Video anclado en Supabase:", data.url);
        console.log("Coordenadas enviadas:", rect);
        alert(`¡Video y Coordenadas subidos a la bóveda!\nEnlace: ${data.url}`);
      } else {
        console.error("Fallo de conexión o respuesta:", data);
        alert(`Fallo en el servidor: ${data.error || 'Desconocido'}`);
      }
    } catch (error) {
      console.error("Error en la transmisión general:", error);
      alert("Error crítico de transmisión. Revisa la consola o Coolify.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (showIntro) {
    return (
      <div style={{ height: '100vh', width: '100vw', backgroundColor: '#000000', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: 0, padding: 0 }}>
        <Head>
          <title>NAYLA CORE</title>
          <meta name="theme-color" content="#000000" />
          <link rel="manifest" href="/manifest.json" />
          <link rel="apple-touch-icon" href="/assets/imagenes/Icono-intro.jpeg" />
        </Head>
        <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA Logo" style={{ width: '250px', maxWidth: '80%', objectFit: 'contain' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#ededed', padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <Head>
        <title>NAYLA CORE</title>
        <meta name="theme-color" content="#000000" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/assets/imagenes/Icono-intro.jpeg" />
      </Head>

      <header style={{ borderBottom: '1px solid #262626', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA Pequeño" style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
        <div>
          <h1 style={{ margin: 0, color: '#ffffff', letterSpacing: '2px', fontSize: '1.2rem' }}>NAYLA CORE</h1>
          <p style={{ margin: '0', color: '#737373', fontSize: '0.8rem' }}>Módulo Operativo Visual</p>
        </div>
      </header>

      <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* MONITOR CENTRAL ACTUALIZADO CON TÁCTIL */}
        <section 
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{ 
            width: '100%', 
            aspectRatio: '16/9', 
            backgroundColor: '#050505', 
            border: '1px solid #262626', 
            borderRadius: '8px', 
            overflow: 'hidden', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            position: 'relative',
            touchAction: 'none' // Evita que la pantalla haga scroll mientras dibujas
          }}
        >
          {videoTerminado ? (
            <>
              {/* El punteroEvents='none' evita que el video intercepte tu dedo */}
              <video src={videoTerminado} autoPlay loop muted style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
              
              {/* Este es el recuadro rojo que dibujas */}
              {rect && (
                <div style={{
                  position: 'absolute',
                  left: `${rect.x}px`,
                  top: `${rect.y}px`,
                  width: `${rect.width}px`,
                  height: `${rect.height}px`,
                  border: '2px solid #ef4444',
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  pointerEvents: 'none'
                }} />
              )}
            </>
          ) : (
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', color: '#404040', pointerEvents: 'none' }}>
                 <p style={{ margin: 0, fontSize: '1.2rem', letterSpacing: '2px', fontWeight: 'bold' }}>MONITOR CENTRAL</p>
                 <p style={{ margin: 0, fontSize: '0.8rem' }}>Espacio reservado para B-Roll o Publicidad</p>
              </div>
            </div>
          )}
        </section>

        {/* MENÚ DE HERRAMIENTAS */}
        <section style={{ backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '8px', overflow: 'hidden' }}>
          <button onClick={() => setMenuAbierto(!menuAbierto)} style={{ width: '100%', padding: '1.2rem', backgroundColor: '#0a0a0a', color: '#ffffff', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', textAlign: 'left' }}>
            <span>Módulo de Herramientas</span>
            <span>{menuAbierto ? '▲' : '▼'}</span>
          </button>

          {menuAbierto && (
            <div style={{ borderTop: '1px solid #262626', backgroundColor: '#121212', padding: '0.5rem' }}>
              <button onClick={() => setHerramientaActiva(herramientaActiva === 'watermark' ? null : 'watermark')} style={{ width: '100%', padding: '1rem', backgroundColor: herramientaActiva === 'watermark' ? '#262626' : 'transparent', color: '#ffffff', border: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', fontSize: '1rem', fontWeight: herramientaActiva === 'watermark' ? 'bold' : 'normal' }}>
                🗙 Retirar Marcas de Agua (IA)
              </button>
            </div>
          )}
        </section>

        {/* PANEL DE PROCESAMIENTO */}
        {herramientaActiva === 'watermark' && (
          <section style={{ backgroundColor: '#0a0a0a', padding: '1.5rem', border: '1px solid #262626', borderRadius: '8px' }}>
            <h2 style={{ fontSize: '1.1rem', marginTop: 0, color: '#ffffff' }}>Retirar Marcas de Agua</h2>
            <p style={{ color: '#a3a3a3', fontSize: '0.9rem', marginBottom: '1rem' }}>
              1. Selecciona el video.<br/>
              2. <b>Dibuja un cuadro rojo sobre la marca</b> en el Monitor Central.<br/>
              3. Ejecuta la limpieza.
            </p>
            
            <input type="file" accept="video/*" onChange={handleFileChange} style={{ marginBottom: '1rem', width: '100%', color: '#d4d4d4' }} />
            
            <button onClick={processVideo} disabled={!videoFile || isProcessing} style={{ width: '100%', padding: '1rem', backgroundColor: videoFile && !isProcessing ? '#ffffff' : '#262626', color: videoFile && !isProcessing ? '#000000' : '#737373', border: 'none', borderRadius: '4px', cursor: videoFile && !isProcessing ? 'pointer' : 'not-allowed', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              {isProcessing ? 'Transmitiendo y Analizando...' : 'Ejecutar Limpieza General'}
            </button>
          </section>
        )}

      </main>
    </div>
  );
}
