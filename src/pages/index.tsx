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
  
  // Nuevo estado para controlar lo que se ve en la pantalla principal
  const [videoTerminado, setVideoTerminado] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowIntro(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setVideoFile(event.target.files[0]);
    }
  };

  const processVideo = async () => {
    if (!videoFile) return;
    setIsProcessing(true);
    // Simulación del tiempo que tarda Fal.ai
    setTimeout(() => {
      // Cuando termina, cargamos el video en la pantalla principal
      setVideoTerminado(URL.createObjectURL(videoFile));
      setIsProcessing(false);
    }, 3000);
  };

  // ==========================================
  // PANTALLA DE INTRODUCCIÓN (5 SEGUNDOS)
  // ==========================================
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

  // ==========================================
  // INTERFAZ PRINCIPAL DEL SISTEMA
  // ==========================================
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#ededed', padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <Head>
        <title>NAYLA CORE</title>
        <meta name="theme-color" content="#000000" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/assets/imagenes/Icono-intro.jpeg" />
      </Head>

      {/* CABECERA */}
      <header style={{ borderBottom: '1px solid #262626', paddingBottom: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <img src="/assets/imagenes/Icono-intro.jpeg" alt="NAYLA Pequeño" style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} />
        <div>
          <h1 style={{ margin: 0, color: '#ffffff', letterSpacing: '2px', fontSize: '1.2rem' }}>NAYLA CORE</h1>
          <p style={{ margin: '0', color: '#737373', fontSize: '0.8rem' }}>Módulo Operativo Visual</p>
        </div>
      </header>

      <main style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* ========================================== */}
        {/* PANTALLA PRINCIPAL (INTOCABLE) */}
        {/* ========================================== */}
        <section style={{ 
          width: '100%', 
          aspectRatio: '16/9', 
          backgroundColor: '#050505', 
          border: '1px solid #262626', 
          borderRadius: '8px', 
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          position: 'relative'
        }}>
          {videoTerminado ? (
            // Muestra el video procesado y listo para revisar
            <video src={videoTerminado} controls autoPlay style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            // MODO REPOSO: Aquí irá tu publicidad en loop
            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
              {/* Cuando tengas el video de publicidad, solo descomenta la línea de abajo y pon la ruta correcta */}
              {/* <video src="/assets/videos/tu-publicidad.mp4" autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4 }} /> */}
              
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center', color: '#404040' }}>
                 <p style={{ margin: 0, fontSize: '1.2rem', letterSpacing: '2px', fontWeight: 'bold' }}>MONITOR CENTRAL</p>
                 <p style={{ margin: 0, fontSize: '0.8rem' }}>Espacio reservado para B-Roll o Publicidad</p>
              </div>
            </div>
          )}
        </section>

        {/* ========================================== */}
        {/* MENÚ DESPLEGABLE: HERRAMIENTAS */}
        {/* ========================================== */}
        <section style={{ backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: '8px', overflow: 'hidden' }}>
          <button 
            onClick={() => setMenuAbierto(!menuAbierto)}
            style={{ width: '100%', padding: '1.2rem', backgroundColor: '#0a0a0a', color: '#ffffff', border: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontWeight: 'bold', fontSize: '1.1rem', textAlign: 'left' }}
          >
            <span>Módulo de Herramientas</span>
            <span>{menuAbierto ? '▲' : '▼'}</span>
          </button>

          {menuAbierto && (
            <div style={{ borderTop: '1px solid #262626', backgroundColor: '#121212', padding: '0.5rem' }}>
              <button 
                onClick={() => setHerramientaActiva(herramientaActiva === 'watermark' ? null : 'watermark')}
                style={{ width: '100%', padding: '1rem', backgroundColor: herramientaActiva === 'watermark' ? '#262626' : 'transparent', color: '#ffffff', border: 'none', textAlign: 'left', cursor: 'pointer', borderRadius: '4px', fontSize: '1rem', fontWeight: herramientaActiva === 'watermark' ? 'bold' : 'normal' }}
              >
                🗙 Retirar Marcas de Agua (IA)
              </button>
              
              <button 
                disabled
                style={{ width: '100%', padding: '1rem', backgroundColor: 'transparent', color: '#404040', border: 'none', textAlign: 'left', cursor: 'not-allowed', fontSize: '1rem' }}
              >
                🗎 Extracción de B-Roll (Próximamente)
              </button>
            </div>
          )}
        </section>

        {/* CONTENEDOR DINÁMICO DE LA HERRAMIENTA SELECCIONADA */}
        {herramientaActiva === 'watermark' && (
          <section style={{ backgroundColor: '#0a0a0a', padding: '1.5rem', border: '1px solid #262626', borderRadius: '8px' }}>
            <h2 style={{ fontSize: '1.1rem', marginTop: 0, color: '#ffffff' }}>Retirar Marcas de Agua</h2>
            <p style={{ color: '#a3a3a3', fontSize: '0.9rem', marginBottom: '1rem' }}>Inyecta el archivo de video para procesar la limpieza en la granja de GPUs externa.</p>
            
            <input 
              type="file" 
              accept="video/*" 
              onChange={handleFileChange} 
              style={{ marginBottom: '1rem', width: '100%', color: '#d4d4d4' }} 
            />
            
            <button 
              onClick={processVideo} 
              disabled={!videoFile || isProcessing} 
              style={{ width: '100%', padding: '1rem', backgroundColor: videoFile && !isProcessing ? '#ffffff' : '#262626', color: videoFile && !isProcessing ? '#000000' : '#737373', border: 'none', borderRadius: '4px', cursor: videoFile && !isProcessing ? 'pointer' : 'not-allowed', fontWeight: 'bold', letterSpacing: '0.5px' }}
            >
              {isProcessing ? 'Limpiando y enviando al Monitor...' : 'Ejecutar Limpieza General'}
            </button>
          </section>
        )}

        {/* ========================================== */}
        {/* SECCIÓN DEL CHAT GUIONISTA / ASISTENTE */}
        {/* ========================================== */}
        <section style={{ backgroundColor: '#0a0a0a', padding: '1.5rem', border: '1px solid #262626', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem', margin: 0, color: '#ffffff' }}>Terminal de Edición Integrada</h2>
            <button style={{ padding: '0.4rem 0.8rem', backgroundColor: '#ffffff', color: '#000000', border: 'none', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
              Abrir Guionista
            </button>
          </div>
          <textarea 
            placeholder="Instrucciones del guion o cambios estructurales para la IA..."
            style={{ width: '100%', height: '100px', padding: '1rem', backgroundColor: '#000000', color: '#ffffff', border: '1px solid #262626', borderRadius: '4px', resize: 'none' }}
          />
        </section>

      </main>
    </div>
  );
}