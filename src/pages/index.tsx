// [BOTÓN DE COPIAR]
'use client';
import React, { useState, useEffect } from 'react';

export default function NaylaCore() {
  const [showIntro, setShowIntro] = useState(true);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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
    // Aquí conectaremos la API de Fal.ai en el siguiente paso
    console.log("Iniciando limpieza...");
    setTimeout(() => {
      alert("Simulación: Video enviado a procesar.");
      setIsProcessing(false);
    }, 2000);
  };

  // ==========================================
  // PANTALLA DE INTRODUCCIÓN (5 SEGUNDOS)
  // ==========================================
  if (showIntro) {
    return (
      <div style={{ 
        height: '100vh', width: '100vw', backgroundColor: '#000000', 
        display: 'flex', justifyContent: 'center', alignItems: 'center', margin: 0, padding: 0 
      }}>
        <img 
          src="/assets/imagenes/Icono-intro.jpeg" 
          alt="NAYLA Logo" 
          style={{ width: '250px', maxWidth: '80%', objectFit: 'contain' }} 
        />
      </div>
    );
  }

  // ==========================================
  // INTERFAZ PRINCIPAL DEL SISTEMA
  // ==========================================
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#000000', color: '#ededed', padding: '1.5rem', fontFamily: 'system-ui, sans-serif' }}>
      
      {/* CABECERA */}
      <header style={{ borderBottom: '1px solid #333', paddingBottom: '1rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <img 
          src="/assets/imagenes/Icono-intro.jpeg" 
          alt="NAYLA Pequeño" 
          style={{ width: '60px', height: '60px', borderRadius: '8px', objectFit: 'cover' }} 
        />
        <div>
          <h1 style={{ margin: 0, color: '#ffffff', letterSpacing: '2px', fontSize: '1.2rem' }}>NAYLA CORE</h1>
          <p style={{ margin: '0', color: '#737373', fontSize: '0.8rem' }}>Módulo Operativo Visual</p>
        </div>
      </header>

      {/* ZONA DE TRABAJO */}
      <main style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* MÓDULO: LIMPIEZA DE MATRIZ */}
        <section style={{ backgroundColor: '#121212', padding: '1.5rem', border: '1px solid #262626', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.1rem', marginTop: 0, color: '#e5e5e5' }}>1. Limpieza de Matriz (Facebook)</h2>
          <p style={{ color: '#737373', fontSize: '0.9rem', marginBottom: '1rem' }}>Sube el video para eliminar la marca de agua usando Fal.ai.</p>
          
          <input 
            type="file" 
            accept="video/*" 
            onChange={handleFileChange} 
            style={{ marginBottom: '1rem', width: '100%', color: '#a3a3a3' }} 
          />
          
          <button 
            onClick={processVideo} 
            disabled={!videoFile || isProcessing} 
            style={{ 
              width: '100%', padding: '1rem', 
              backgroundColor: videoFile && !isProcessing ? '#ca8a04' : '#262626', 
              color: '#fff', border: 'none', borderRadius: '4px', 
              cursor: videoFile && !isProcessing ? 'pointer' : 'not-allowed', 
              fontWeight: 'bold' 
            }}
          >
            {isProcessing ? 'Limpiando Video...' : 'Procesar y Limpiar Marca'}
          </button>
        </section>

        {/* MÓDULO: CHAT IA (VISUAL) */}
        <section style={{ backgroundColor: '#121212', padding: '1.5rem', border: '1px solid #262626', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem', margin: 0, color: '#e5e5e5' }}>2. Conexión Guionista</h2>
            <button style={{ padding: '0.4rem 0.8rem', backgroundColor: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', fontSize: '0.8rem' }}>
              Abrir Ventana
            </button>
          </div>
          <textarea 
            placeholder="Instrucciones para la IA..."
            style={{ width: '100%', height: '100px', padding: '1rem', backgroundColor: '#000', color: '#fff', border: '1px solid #404040', borderRadius: '4px', resize: 'none' }}
          />
        </section>

      </main>
    </div>
  );
}
