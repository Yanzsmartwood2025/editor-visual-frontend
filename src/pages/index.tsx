/* eslint-disable @next/next/no-img-element */
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';

type Rect = { id: string; x: number; y: number; width: number; height: number };

export default function NaylaCore() {
  const [showIntro, setShowIntro] = useState(true);
  
  // Convertimos herramientaActiva en una constante directa para evitar el error de variable de estado sin uso
  const herramientaActiva = 'watermark'; 
  
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoTerminado, setVideoTerminado] = useState<string | null>(null);
  const [progresoCarga, setProgresoCarga] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
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

  const processVideo = async () => {
    if (!videoFile) return;
    if (rects.length === 0) {
      alert("Por favor, dibuja al menos un cuadro sobre la marca de agua.");
      return;
    }

    setIsProcessing(true);
    setProgresoCarga(10);
    
    const intervaloCarga = setInterval(() => {
      setProgresoCarga(prev => (prev < 85 ? prev + 5 : prev));
    }, 500);

    const formData = new FormData();
    formData.append('video', videoFile);
    formData.append('coordenadas', JSON.stringify(rects));

    try {
      const res = await fetch('/api/clean-video', {
        method: 'POST',
        body: formData,
      });
      
      const data = await res.json();
      
      clearInterval(intervaloCarga);
      setProgresoCarga(100);

      if (res.ok && data.url) {
        console.log("¡Misión Cumplida!", data);
        setTimeout(() => {
          alert(`¡Orden enviada a la IA exitosamente!\nTu video está siendo procesado en Replicate.\nID Tarea: ${data.prediction_id || 'N/A'}`);
          setProgresoCarga(0);
          setIsProcessing(false);
        }, 500);
      } else {
        alert(`Fallo en el servidor: ${data.error || 'Desconocido'}`);
        setProgresoCarga(0);
        setIsProcessing(false);
      }
    } catch (error) {
      clearInterval(intervaloCarga);
      setProgresoCarga(0);
      setIsProcessing(false);
      alert("Error crítico de transmisión. Revisa la consola o Coolify.");
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
          <h1 style={{ margin: 0, color: '#ffffff', letterSpacing: '2px', fontSize: '1.2rem' }}>NAYLA CORE</h1>
          <p style={{ margin: '0', color: '#737373', fontSize: '0.8rem' }}>Módulo Operativo Visual</p>
        </div>
      </header>

      <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <section 
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{ width: '100%', aspectRatio: '16/9', backgroundColor: '#050505', border: '1px solid #262626', borderRadius: '8px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', touchAction: 'none' }}
        >
          {videoTerminado ? (
            <>
              <video src={videoTerminado} autoPlay loop muted style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />
              
              {rects.map((r) => (
                <div key={r.id} style={{ position: 'absolute', left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px`, border: '2px solid #ef4444', backgroundColor: 'rgba(239, 68, 68, 0.2)', pointerEvents: 'auto' }}>
                  <div onPointerDown={(e) => { e.stopPropagation(); removeRect(r.id); }} style={{ position: 'absolute', top: '-28px', right: '-10px', width: '22px', height: '22px', backgroundColor: '#ef4444', color: '#fff', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', zIndex: 10 }}>X</div>
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'nw' }); }} style={{ position: 'absolute', top: '-6px', left: '-6px', width: '14px', height: '14px', backgroundColor: '#ffffff', border: '2px solid #ef4444', borderRadius: '50%', cursor: 'nwse-resize', zIndex: 10 }} />
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'ne' }); }} style={{ position: 'absolute', top: '-6px', right: '-6px', width: '14px', height: '14px', backgroundColor: '#ffffff', border: '2px solid #ef4444', borderRadius: '50%', cursor: 'nesw-resize', zIndex: 10 }} />
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'sw' }); }} style={{ position: 'absolute', bottom: '-6px', left: '-6px', width: '14px', height: '14px', backgroundColor: '#ffffff', border: '2px solid #ef4444', borderRadius: '50%', cursor: 'nesw-resize', zIndex: 10 }} />
                  <div onPointerDown={(e) => { e.stopPropagation(); setResizingInfo({ id: r.id, corner: 'se' }); }} style={{ position: 'absolute', bottom: '-6px', right: '-6px', width: '14px', height: '14px', backgroundColor: '#ffffff', border: '2px solid #ef4444', borderRadius: '50%', cursor: 'nwse-resize', zIndex: 10 }} />
                </div>
              ))}

              {currentRect && isDrawing && (
                <div style={{ position: 'absolute', left: `${currentRect.x}px`, top: `${currentRect.y}px`, width: `${currentRect.width}px`, height: `${currentRect.height}px`, border: '2px dashed #ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', pointerEvents: 'none' }} />
              )}
            </>
          ) : (
            <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <img src="/assets/imagenes/Icono-intro.jpeg" alt="Fondo" style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', opacity: 0.25 }} />
              <div style={{ position: 'relative', textAlign: 'center', color: '#ffffff', pointerEvents: 'none', textShadow: '0 2px 5px rgba(0,0,0,0.8)' }}>
                 <p style={{ margin: 0, fontSize: '1.2rem', letterSpacing: '2px', fontWeight: 'bold' }}>MONITOR CENTRAL</p>
                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#a3a3a3' }}>Esperando archivo de origen</p>
              </div>
            </div>
          )}
        </section>

        {herramientaActiva === 'watermark' && (
          <section style={{ backgroundColor: '#0a0a0a', padding: '1.5rem', border: '1px solid #262626', borderRadius: '8px' }}>
            <h2 style={{ fontSize: '1.1rem', marginTop: 0, color: '#ffffff' }}>Retirar Marcas de Agua</h2>
            <input type="file" accept="video/*" onChange={handleFileChange} style={{ marginBottom: '1rem', width: '100%', color: '#d4d4d4' }} />
            
            {isProcessing && (
              <div style={{ width: '100%', height: '6px', backgroundColor: '#262626', borderRadius: '3px', overflow: 'hidden', marginBottom: '1rem' }}>
                <div style={{ width: `${progresoCarga}%`, height: '100%', backgroundColor: '#ffffff', transition: 'width 0.5s ease-out' }} />
              </div>
            )}

            <button onClick={processVideo} disabled={!videoFile || isProcessing} style={{ width: '100%', padding: '1rem', backgroundColor: videoFile && !isProcessing ? '#ffffff' : '#262626', color: videoFile && !isProcessing ? '#000000' : '#737373', border: 'none', borderRadius: '4px', cursor: videoFile && !isProcessing ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>
              {isProcessing ? `Cargando... ${progresoCarga}%` : 'Ejecutar Limpieza General'}
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
