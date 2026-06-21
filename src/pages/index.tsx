/* eslint-disable @next/next/no-img-element */
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

type Rect = { id: string; x: number; y: number; width: number; height: number };

export default function NaylaCore() {
  const [showIntro, setShowIntro] = useState(true);
  
  // NUEVO: Estado para abrir/cerrar el panel de herramientas
  const [herramientasAbiertas, setHerramientasAbiertas] = useState(false);
  const herramientaActiva = 'supresion_visual'; 
  
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoTerminado, setVideoTerminado] = useState<string | null>(null);
  const [progresoCarga, setProgresoCarga] = useState(0);

  const [videoMetadata, setVideoMetadata] = useState({ width: 1920, height: 1080 });

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null); 

  const [rects, setRects] = useState<Rect[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);
  const [resizingInfo, setResizingInfo] = useState<{ id: string, corner: string } | null>(null);

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
      setRects([]);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!videoTerminado || !containerRef.current || resizingInfo) return;
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
      const newX = Math.min(startPos.x, currentX);
      const newY = Math.min(startPos.y, currentY);
      const newWidth = Math.abs(currentX - startPos.x);
      const newHeight = Math.abs(currentY - startPos.y);
      setCurrentRect({ ...currentRect, x: newX, y: newY, width: newWidth, height: newHeight });
    } else if (resizingInfo) {
      setRects(rects.map(r => {
        if (r.id === resizingInfo.id) {
          let newX = r.x;
          let newY = r.y;
          let newWidth = r.width;
          let newHeight = r.height;

          if (resizingInfo.corner.includes('e')) newWidth = Math.max(15, currentX - r.x);
          if (resizingInfo.corner.includes('s')) newHeight = Math.max(15, currentY - r.y);
          if (resizingInfo.corner.includes('w')) {
            const deltaX = currentX - r.x;
            newWidth = Math.max(15, r.width - deltaX);
            if (newWidth > 15) newX = currentX;
          }
          if (resizingInfo.corner.includes('n')) {
            const deltaY = currentY - r.y;
            newHeight = Math.max(15, r.height - deltaY);
            if (newHeight > 15) newY = currentY;
          }
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
    setIsDrawing(false);
    setCurrentRect(null);
    setResizingInfo(null);
  };

  const removeRect = (id: string) => {
    setRects(rects.filter(r => r.id !== id));
  };

  const processVideo = async (motorElegido: 'nube' | 'local') => {
    if (!videoFile || !containerRef.current) return;
    
    if (motorElegido === 'nube' && rects.length === 0) {
      alert("Operación denegada: Defina las coordenadas del área a suprimir.");
      return;
    }

    setIsProcessing(true);
    setProgresoCarga(10);
    
    // Matemática de escalado
    const containerRect = containerRef.current.getBoundingClientRect();
    const scaleX = videoMetadata.width / containerRect.width;
    const scaleY = videoMetadata.height / containerRect.height;

    const rectangulosReales = rects.map(r => ({
      x: Math.round(r.x * scaleX),
      y: Math.round(r.y * scaleY),
      width: Math.round(r.width * scaleX),
      height: Math.round(r.height * scaleY)
    }));

    const intervaloCarga = setInterval(() => {
      setProgresoCarga(prev => (prev < 85 ? prev + 5 : prev));
    }, 500);

    const formData = new FormData();
    formData.append('video', videoFile);
    formData.append('coordenadas', JSON.stringify(rectangulosReales));
    formData.append('motor', motorElegido);

    try {
      const res = await fetch('/api/clean-video', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      
      clearInterval(intervaloCarga);
      setProgresoCarga(100);

      if (res.ok && data.url) {
        console.log("Transmisión exitosa", data);
        setTimeout(() => {
          if (data.motor === 'local_ffmpeg') {
             alert(`Procesamiento NATIVO completado con éxito.`);
          } else {
             alert(`Procesamiento IA completado.\nID: ${data.prediction_id || 'N/A'}`);
          }
          setProgresoCarga(0);
          setIsProcessing(false);
        }, 500);
      } else {
        alert(`Error en el servidor: ${data.error || 'Desconocido'}`);
        setProgresoCarga(0);
        setIsProcessing(false);
      }
    } catch (error) {
      clearInterval(intervaloCarga);
      setProgresoCarga(0);
      setIsProcessing(false);
      alert("Error crítico de transmisión. Consulte los logs del sistema.");
    }
  };

  if (showIntro) {
    return (
      <div style={{ height: '100vh', width: '100vw', backgroundColor: '#000000', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: 0 }}>
        <Head><title>NAYLA CORE</title></Head>
        <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA Logo" style={{ width: '250px', maxWidth: '80%', objectFit: 'contain' }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#ededed', padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <Head><title>NAYLA CORE</title></Head>

      <header style={{ borderBottom: '1px solid #262626', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA Pequeño" style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
        <div>
          <h1 style={{ margin: 0, color: '#ffffff', letterSpacing: '2px', fontSize: '1.2rem', textTransform: 'uppercase' }}>NAYLA CORE</h1>
          <p style={{ margin: '0', color: '#737373', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px' }}>Módulo Operativo Visual</p>
        </div>
      </header>

      <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* MONITOR CENTRAL */}
        <section 
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{ 
            width: '100%', 
            aspectRatio: videoTerminado ? `${videoMetadata.width}/${videoMetadata.height}` : '16/9', 
            maxHeight: '65vh', 
            backgroundColor: '#050505', 
            border: '1px solid #262626', 
            borderRadius: '4px', 
            overflow: 'hidden', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            position: 'relative', 
            touchAction: 'none',
            margin: '0 auto'
          }}
        >
          {videoTerminado ? (
            <>
              <video 
                ref={videoRef}
                src={videoTerminado} 
                autoPlay 
                loop 
                muted 
                onLoadedMetadata={(e) => {
                  setVideoMetadata({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight });
                }}
                style={{ width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' }} 
              />
              
              {/* Rectángulos de selección en blanco/gris para mantener la estética sobria */}
              {rects.map((r) => (
                <div key={r.id} style={{ position: 'absolute', left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px`, border: '1px solid #ffffff', backgroundColor: 'rgba(255, 255, 255, 0.1)', pointerEvents: 'auto' }}>
                  <div onPointerDown={(e) => { e.stopPropagation(); removeRect(r.id); }} style={{ position: 'absolute', top: '-24px', right: '0px', width: '20px', height: '20px', backgroundColor: '#ffffff', color: '#000', borderRadius: '2px', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontSize: '10px', fontWeight: 'bold', zIndex: 10 }}>X</div>
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'nw' }); }} style={{ position: 'absolute', top: '-4px', left: '-4px', width: '8px', height: '8px', backgroundColor: '#ffffff', cursor: 'nwse-resize', zIndex: 10 }} />
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'ne' }); }} style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', backgroundColor: '#ffffff', cursor: 'nesw-resize', zIndex: 10 }} />
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'sw' }); }} style={{ position: 'absolute', bottom: '-4px', left: '-4px', width: '8px', height: '8px', backgroundColor: '#ffffff', cursor: 'nesw-resize', zIndex: 10 }} />
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'se' }); }} style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '8px', height: '8px', backgroundColor: '#ffffff', cursor: 'nwse-resize', zIndex: 10 }} />
                </div>
              ))}

              {currentRect && isDrawing && (
                <div style={{ position: 'absolute', left: `${currentRect.x}px`, top: `${currentRect.y}px`, width: `${currentRect.width}px`, height: `${currentRect.height}px`, border: '1px dashed #ffffff', backgroundColor: 'rgba(255, 255, 255, 0.05)', pointerEvents: 'none' }} />
              )}
            </>
          ) : (
            <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <div style={{ position: 'relative', textAlign: 'center', color: '#ffffff', pointerEvents: 'none' }}>
                 <p style={{ margin: 0, fontSize: '1rem', letterSpacing: '3px', fontWeight: 'bold' }}>MONITOR CENTRAL</p>
                 <p style={{ margin: 0, fontSize: '0.75rem', color: '#737373', textTransform: 'uppercase', letterSpacing: '1px', marginTop: '8px' }}>Esperando archivo de origen</p>
              </div>
            </div>
          )}
        </section>

        {/* BOTÓN MAESTRO DE HERRAMIENTAS */}
        <button 
          onClick={() => setHerramientasAbiertas(!herramientasAbiertas)}
          style={{ 
            width: '100%', 
            padding: '1.2rem', 
            backgroundColor: herramientasAbiertas ? '#ffffff' : '#0a0a0a', 
            color: herramientasAbiertas ? '#000000' : '#ffffff', 
            border: '1px solid #262626', 
            borderRadius: '4px', 
            cursor: 'pointer', 
            fontWeight: 'bold',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            transition: 'all 0.3s ease'
          }}
        >
          {herramientasAbiertas ? 'CERRAR PANEL DE HERRAMIENTAS' : 'HERRAMIENTAS DE EDICIÓN'}
        </button>

        {/* CONTENEDOR DESPLEGABLE DE HERRAMIENTAS */}
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

                {/* BOTONES MONOCROMÁTICOS MINIMALISTAS */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  {/* Botón Nube (Blanco) */}
                  <button 
                    onClick={() => processVideo('nube')} 
                    disabled={!videoFile || isProcessing} 
                    style={{ 
                      flex: 1, 
                      padding: '1rem', 
                      backgroundColor: videoFile && !isProcessing ? '#ffffff' : '#171717', 
                      color: videoFile && !isProcessing ? '#000000' : '#404040', 
                      border: '1px solid #ffffff', 
                      borderRadius: '2px', 
                      cursor: videoFile && !isProcessing ? 'pointer' : 'not-allowed', 
                      fontWeight: 'bold',
                      fontSize: '0.8rem',
                      letterSpacing: '1px'
                    }}>
                    {isProcessing ? `CARGANDO... ${progresoCarga}%` : 'PROCESAMIENTO IA (NUBE)'}
                  </button>

                  {/* Botón Local (Negro con borde blanco) */}
                  <button 
                    onClick={() => processVideo('local')} 
                    disabled={!videoFile || isProcessing} 
                    style={{ 
                      flex: 1, 
                      padding: '1rem', 
                      backgroundColor: '#000000', 
                      color: videoFile && !isProcessing ? '#ffffff' : '#404040', 
                      border: videoFile && !isProcessing ? '1px solid #ffffff' : '1px solid #262626', 
                      borderRadius: '2px', 
                      cursor: videoFile && !isProcessing ? 'pointer' : 'not-allowed', 
                      fontWeight: 'bold',
                      fontSize: '0.8rem',
                      letterSpacing: '1px'
                    }}>
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
