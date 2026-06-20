// [BOTÓN DE COPIAR]
/* eslint-disable @next/next/no-img-element */
'use client';
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

// Definimos la estructura de nuestros cuadros
type Rect = { id: string; x: number; y: number; width: number; height: number };

export default function NaylaCore() {
  const [showIntro, setShowIntro] = useState(true);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [herramientaActiva, setHerramientaActiva] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoTerminado, setVideoTerminado] = useState<string | null>(null);

  // --- VARIABLES DEL ESCÁNER MULTI-OBJETIVO ---
  const containerRef = useRef<HTMLDivElement>(null);
  const [rects, setRects] = useState<Rect[]>([]); // Array para guardar múltiples marcas
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);
  const [resizingId, setResizingId] = useState<string | null>(null); // Para saber cuál estamos redimensionando

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
      setRects([]); // Limpiamos todos los cuadros si sube un video nuevo
    }
  };

  // --- LÓGICA DE DIBUJO Y REDIMENSIÓN ---
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!videoTerminado || !containerRef.current) return;
    const container = containerRef.current.getBoundingClientRect();
    const x = e.clientX - container.left;
    const y = e.clientY - container.top;
    
    // Iniciamos un nuevo cuadro
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
      // Estamos dibujando un cuadro nuevo
      const newX = Math.min(startPos.x, currentX);
      const newY = Math.min(startPos.y, currentY);
      const newWidth = Math.abs(currentX - startPos.x);
      const newHeight = Math.abs(currentY - startPos.y);
      setCurrentRect({ ...currentRect, x: newX, y: newY, width: newWidth, height: newHeight });
    } else if (resizingId) {
      // Estamos jalando la esquina para redimensionar un cuadro existente
      setRects(rects.map(r => {
        if (r.id === resizingId) {
          const newWidth = Math.max(15, currentX - r.x); // Mínimo 15px de ancho
          const newHeight = Math.max(15, currentY - r.y); // Mínimo 15px de alto
          return { ...r, width: newWidth, height: newHeight };
        }
        return r;
      }));
    }
  };

  const handlePointerUp = () => {
    if (isDrawing && currentRect && currentRect.width > 10 && currentRect.height > 10) {
      // Guardamos el cuadro solo si es lo suficientemente grande (evita clics accidentales)
      setRects([...rects, currentRect]);
    }
    setIsDrawing(false);
    setCurrentRect(null);
    setResizingId(null);
  };

  const removeRect = (id: string) => {
    setRects(rects.filter(r => r.id !== id));
  };
  // ------------------------------------------

  const processVideo = async () => {
    if (!videoFile) return;
    
    if (rects.length === 0) {
      alert("Por favor, dibuja al menos un cuadro sobre la marca de agua en el Monitor Central antes de ejecutar.");
      return;
    }

    setIsProcessing(true);
    
    const formData = new FormData();
    formData.append('video', videoFile);
    // Ahora enviamos la lista completa de cuadros al servidor
    formData.append('coordenadas', JSON.stringify(rects));

    try {
      const res = await fetch('/api/clean-video', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();

      if (res.ok && data.url) {
        console.log("¡ÉXITO! Video anclado en Supabase:", data.url);
        console.log("Múltiples coordenadas enviadas:", rects);
        alert(`¡Video y ${rects.length} Coordenadas subidos a la bóveda!\nEnlace: ${data.url}`);
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
        
        {/* MONITOR CENTRAL AVANZADO */}
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
            touchAction: 'none' // Clave para evitar el scroll en móviles al dibujar
          }}
        >
          {videoTerminado ? (
            <>
              <video src={videoTerminado} autoPlay loop muted style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
              
              {/* Renderizamos TODOS los cuadros guardados */}
              {rects.map((r) => (
                <div key={r.id} style={{
                  position: 'absolute', left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px`,
                  border: '2px solid #ef4444', backgroundColor: 'rgba(239, 68, 68, 0.2)', pointerEvents: 'auto'
                }}>
                  {/* Botón X para eliminar */}
                  <div 
                    onPointerDown={(e) => { e.stopPropagation(); removeRect(r.id); }}
                    style={{ position: 'absolute', top: '-12px', right: '-12px', width: '24px', height: '24px', backgroundColor: '#ef4444', color: '#fff', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', zIndex: 10 }}
                  >
                    X
                  </div>
                  {/* Circulito en la esquina inferior derecha para redimensionar */}
                  <div
                    onPointerDown={(e) => { e.stopPropagation(); setResizingId(r.id); }}
                    style={{ position: 'absolute', bottom: '-8px', right: '-8px', width: '20px', height: '20px', backgroundColor: '#ffffff', border: '2px solid #ef4444', borderRadius: '50%', cursor: 'nwse-resize', zIndex: 10 }}
                  />
                </div>
              ))}

              {/* El cuadro que se está dibujando en este instante */}
              {currentRect && isDrawing && (
                <div style={{ position: 'absolute', left: `${currentRect.x}px`, top: `${currentRect.y}px`, width: `${currentRect.width}px`, height: `${currentRect.height}px`, border: '2px dashed #ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', pointerEvents: 'none' }} />
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
              2. <b>Dibuja cuadros sobre las marcas</b>. Usa los círculos blancos para ajustar su tamaño.<br/>
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
