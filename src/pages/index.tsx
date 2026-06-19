// [BOTÓN DE COPIAR]
'use client';
import React, { useState, useEffect } from 'react';
import Head from 'next/head';

export default function NaylaCore() {
  const [showIntro, setShowIntro] = useState(true);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [herramientaActiva, setHerramientaActiva] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [videoTerminado, setVideoTerminado] = useState<string | null>(null);

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
      // Dispara la previsualización inmediata en el Monitor Central
      setVideoTerminado(URL.createObjectURL(file));
    }
  };

  const processVideo = async () => {
    if (!videoFile) return;
    setIsProcessing(true);
    
    // Empaquetado seguro del archivo para el servidor
    const formData = new FormData();
    formData.append('video', videoFile);

    try {
      const res = await fetch('/api/clean-video', {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        console.log("Archivo anclado en el servidor con éxito.");
      } else {
        console.error("Fallo de conexión con el backend.");
      }
    } catch (error) {
      console.error("Error en la transmisión:", error);
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
        
        {/* MONITOR CENTRAL */}
        <section style={{ width: '100%', aspectRatio: '16/9', backgroundColor: '#050505', border: '1px solid #262626', borderRadius: '8px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
          {videoTerminado ? (
            <video src={videoTerminado} controls autoPlay style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', color: '#404040' }}>
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
            <p style={{ color: '#a3a3a3', fontSize: '0.9rem', marginBottom: '1rem' }}>Inyecta el archivo de video para procesar la limpieza en la granja de GPUs externa.</p>
            
            <input type="file" accept="video/*" onChange={handleFileChange} style={{ marginBottom: '1rem', width: '100%', color: '#d4d4d4' }} />
            
            <button onClick={processVideo} disabled={!videoFile || isProcessing} style={{ width: '100%', padding: '1rem', backgroundColor: videoFile && !isProcessing ? '#ffffff' : '#262626', color: videoFile && !isProcessing ? '#000000' : '#737373', border: 'none', borderRadius: '4px', cursor: videoFile && !isProcessing ? 'pointer' : 'not-allowed', fontWeight: 'bold', letterSpacing: '0.5px' }}>
              {isProcessing ? 'Transmitiendo al backend...' : 'Ejecutar Limpieza General'}
            </button>
          </section>
        )}

      </main>
    </div>
  );
}
