// @ts-nocheck
/* eslint-disable */
import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

type MediaItem = {
  id: string; url: string; tipo: 'foto' | 'video' | 'audio';
  nombre: string; etiqueta: string;
};
type TrackItem = {
  trackId: string; mediaId: string; tipo: 'foto' | 'video' | 'audio';
  etiqueta: string; nombre: string; url: string;
};
type Rect = { id: string; x: number; y: number; width: number; height: number };

export default function NaylaApp() {
  const [session, setSession] = useState(null);
  const [showIntro, setShowIntro] = useState(true);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('email');
  const [authLoading, setAuthLoading] = useState(false);
  const [msg, setMsg] = useState('');

  // EDITOR STATES
  const [galeria, setGaleria] = useState<MediaItem[]>([]);
  const [pistaVideo, setPistaVideo] = useState<TrackItem[]>([]);
  const [pistaAudio, setPistaAudio] = useState<TrackItem[]>([]);
  const [clipSeleccionado, setClipSeleccionado] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [panelActivo, setPanelActivo] = useState<string | null>('galeria');
  const [monitorUrl, setMonitorUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duracionTotal, setDuracionTotal] = useState(0);
  const [script, setScript] = useState('// Comandos NaylaEngine\nNaylaEngine.play();\n// NaylaEngine.seek(5);\n// NaylaEngine.mute();');
  const [iaInput, setIaInput] = useState('');
  const [iaChat, setIaChat] = useState([]);
  const [iaLoading, setIaLoading] = useState(false);
  const [rects, setRects] = useState<Rect[]>([]);
  const [dibujando, setDibujando] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [rectActual, setRectActual] = useState<Rect | null>(null);

  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s));
    const t = setTimeout(() => setShowIntro(false), 3000);
    return () => { subscription.unsubscribe(); clearTimeout(t); };
  }, []);

  const sendOtp = async (e) => {
    e.preventDefault(); setAuthLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) setMsg(error.message); else { setStep('otp'); setMsg('Código enviado.'); }
    setAuthLoading(false);
  };

  const verifyOtp = async (e) => {
    e.preventDefault(); setAuthLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
    if (error) setMsg('Código incorrecto.');
    setAuthLoading(false);
  };

  const NaylaEngine = {
    play: () => { videoRef.current?.play(); setIsPlaying(true); },
    pause: () => { videoRef.current?.pause(); setIsPlaying(false); },
    mute: () => { if (videoRef.current) videoRef.current.muted = true; },
    unmute: () => { if (videoRef.current) videoRef.current.muted = false; },
    seek: (s) => { if (videoRef.current) videoRef.current.currentTime = s; },
    render: () => alert('NaylaEngine: Render iniciado.'),
    info: () => alert(`Clips: ${pistaVideo.length} | Audios: ${pistaAudio.length}`),
  };

  const ejecutarScript = () => {
    try { new Function('NaylaEngine', script)(NaylaEngine); }
    catch (e) { alert(`Error: ${e.message}`); }
  };

  const subirArchivos = (e, tipo) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    const inicial = tipo === 'video' ? 'V' : tipo === 'foto' ? 'F' : 'A';
    const base = galeria.filter(i => i.tipo === tipo).length;
    const nuevos = files.map((file, idx) => ({
      id: `${Date.now()}_${idx}`, url: URL.createObjectURL(file),
      tipo, nombre: file.name, etiqueta: `${inicial}${base + idx + 1}`
    }));
    setGaleria(prev => [...prev, ...nuevos]);
    if (tipo === 'video' && !monitorUrl) setMonitorUrl(nuevos[0].url);
  };

  const enviarAPistaVideo = (item) => {
    setPistaVideo(prev => [...prev, { trackId: `${Date.now()}`, mediaId: item.id, tipo: item.tipo, etiqueta: item.etiqueta, nombre: item.nombre, url: item.url }]);
    setMonitorUrl(item.url);
  };

  const enviarAPistaAudio = (item) => {
    setPistaAudio(prev => [...prev, { trackId: `${Date.now()}`, mediaId: item.id, tipo: item.tipo, etiqueta: item.etiqueta, nombre: item.nombre, url: item.url }]);
  };

  const quitarDeVideo = (trackId) => { setPistaVideo(prev => prev.filter(i => i.trackId !== trackId)); setClipSeleccionado(null); };
  const quitarDeAudio = (trackId) => { setPistaAudio(prev => prev.filter(i => i.trackId !== trackId)); setClipSeleccionado(null); };

  const onDragStart = (idx) => setDragIdx(idx);
  const onDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const arr = [...pistaVideo];
    const [item] = arr.splice(dragIdx, 1);
    arr.splice(idx, 0, item);
    setDragIdx(idx); setPistaVideo(arr);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) { videoRef.current.pause(); setIsPlaying(false); }
    else { videoRef.current.play(); setIsPlaying(true); }
  };

  const toggleAudio = (url) => {
    if (audioRef.current) { audioRef.current.paused ? audioRef.current.play() : audioRef.current.pause(); return; }
    const a = new Audio(url); audioRef.current = a; a.play();
  };

  const fmtTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}`;

  const onPointerDown = (e) => {
    if (!monitorUrl || !containerRef.current) return;
    const c = containerRef.current.getBoundingClientRect();
    const x = e.clientX - c.left, y = e.clientY - c.top;
    setStartPos({ x, y }); setDibujando(true);
    setRectActual({ id: `${Date.now()}`, x, y, width: 0, height: 0 });
  };
  const onPointerMove = (e) => {
    if (!dibujando || !rectActual || !containerRef.current) return;
    const c = containerRef.current.getBoundingClientRect();
    const cx = Math.max(0, Math.min(e.clientX - c.left, c.width));
    const cy = Math.max(0, Math.min(e.clientY - c.top, c.height));
    setRectActual({ ...rectActual, x: Math.min(startPos.x, cx), y: Math.min(startPos.y, cy), width: Math.abs(cx - startPos.x), height: Math.abs(cy - startPos.y) });
  };
  const onPointerUp = () => {
    if (rectActual && rectActual.width > 10 && rectActual.height > 10) setRects(prev => [...prev, rectActual]);
    setDibujando(false); setRectActual(null);
  };

  const enviarMensajeIA = async () => {
    if (!iaInput.trim()) return;
    const userMsg = iaInput.trim();
    setIaChat(prev => [...prev, { role: 'user', text: userMsg }]);
    setIaInput(''); setIaLoading(true);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 1000,
          system: 'Eres NAYLA, asistente de edición de video. Ayudas con el editor, sugieres comandos NaylaEngine y das consejos. Responde en español, de forma concisa.',
          messages: [{ role: 'user', content: userMsg }]
        })
      });
      const data = await res.json();
      const respuesta = data.content?.map(b => b.text).join('') || 'Sin respuesta.';
      setIaChat(prev => [...prev, { role: 'ia', text: respuesta }]);
    } catch { setIaChat(prev => [...prev, { role: 'ia', text: 'Error de conexión.' }]); }
    setIaLoading(false);
  };

  const css = `
    *{box-sizing:border-box}body{margin:0;background:#000}
    .pill{background:#0a0a0a;border:1px solid #242424;color:#666;font-size:.68rem;font-weight:700;padding:.7rem 1.1rem;border-radius:100px;cursor:pointer;text-transform:uppercase;letter-spacing:1px;transition:all .2s;white-space:nowrap}
    .pill:hover{border-color:#555;color:#ccc}
    .pill.on{background:#fff;color:#000;border-color:#fff}
    .clip{flex-shrink:0;width:90px;height:58px;border-radius:10px;background:#111;border:2px solid transparent;overflow:hidden;position:relative;cursor:grab;display:flex;justify-content:center;align-items:center;transition:border-color .15s}
    .clip.sel{border-color:#fff}
    .audio-clip{flex-shrink:0;height:38px;min-width:140px;border-radius:8px;background:#06101f;border:1px solid #0055ff;display:flex;align-items:center;gap:8px;padding:0 10px;cursor:pointer}
    .audio-clip.sel{border-color:#fff}
    .track-row{display:flex;gap:8px;overflow-x:auto;min-height:68px;align-items:center;padding-bottom:4px}
    .track-row::-webkit-scrollbar{height:3px}
    .track-row::-webkit-scrollbar-thumb{background:#333;border-radius:10px}
    .gallery-item{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#080808;border:1px solid #181818;border-radius:14px}
    .gallery-item:hover{border-color:#333}
    @keyframes breathe{0%,100%{transform:scale(.97);opacity:.7}50%{transform:scale(1.03);opacity:1;filter:drop-shadow(0 0 24px rgba(255,255,255,.35))}}
  `;

  const clipActivo = clipSeleccionado
    ? (pistaVideo.find(i => i.trackId === clipSeleccionado) || pistaAudio.find(i => i.trackId === clipSeleccionado))
    : null;

  // ── INTRO ──
  if (showIntro) return (
    <div style={{ height:'100vh',width:'100vw',background:'#000',display:'flex',justifyContent:'center',alignItems:'center' }}>
      <Head><title>NAYLA CORE</title></Head>
      <style>{css}</style>
      <img src="/assets/imagenes/Icono-intro.jpeg" style={{ width:200,borderRadius:30,animation:'breathe 3s ease-in-out infinite' }} />
    </div>
  );

  // ── LOGIN ──
  if (!session) return (
    <div style={{ height:'100vh',background:'#000',display:'flex',justifyContent:'center',alignItems:'center',fontFamily:'system-ui,sans-serif' }}>
      <Head><title>NAYLA</title></Head>
      <style>{css}</style>
      <div style={{ width:340,background:'#080808',border:'1px solid #222',borderRadius:24,padding:'2.5rem',textAlign:'center' }}>
        <h1 style={{ color:'#fff',fontSize:'.9rem',letterSpacing:4,margin:'0 0 4px' }}>NAYLA</h1>
        <p style={{ color:'#555',fontSize:'.65rem',letterSpacing:2,marginBottom:'2rem' }}>LOGIC ENGINE</p>
        {step === 'email' ? (
          <form onSubmit={sendOtp}>
            <input type="email" placeholder="CORREO MAESTRO" value={email} onChange={e=>setEmail(e.target.value)}
              style={{ width:'100%',padding:'1rem',background:'#0a0a0a',border:'1px solid #222',borderRadius:16,color:'#fff',textAlign:'center',marginBottom:'1rem',outline:'none',fontSize:'.8rem' }} />
            <button type="submit" disabled={authLoading}
              style={{ width:'100%',padding:'1rem',background:'#fff',color:'#000',border:'none',borderRadius:100,fontWeight:'bold',fontSize:'.75rem',cursor:'pointer' }}>
              {authLoading ? 'ENVIANDO...' : 'ENVIAR CÓDIGO'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp}>
            <input type="text" placeholder="000000" value={otp} onChange={e=>setOtp(e.target.value)} maxLength={6}
              style={{ width:'100%',padding:'1.2rem',background:'#0a0a0a',border:'1px solid #fff',borderRadius:16,color:'#fff',textAlign:'center',letterSpacing:'.8rem',fontSize:'1.4rem',marginBottom:'1rem',outline:'none' }} />
            <button type="submit" disabled={authLoading}
              style={{ width:'100%',padding:'1rem',background:'#fff',color:'#000',border:'none',borderRadius:100,fontWeight:'bold',fontSize:'.75rem',cursor:'pointer' }}>
              {authLoading ? 'VERIFICANDO...' : 'ENTRAR'}
            </button>
          </form>
        )}
        {msg && <p style={{ marginTop:'1rem',color:'#888',fontSize:'.7rem' }}>{msg}</p>}
      </div>
    </div>
  );

  // ── EDITOR ──
  return (
    <div style={{ height:'100vh',display:'flex',flexDirection:'column',background:'#000',color:'#ededed',fontFamily:'system-ui,sans-serif',overflow:'hidden' }}>
      <Head><title>NAYLA EDITOR</title></Head>
      <style>{css}</style>

      {/* HEADER */}
      <header style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 16px',borderBottom:'1px solid #141414',flexShrink:0 }}>
        <div style={{ display:'flex',alignItems:'center',gap:10 }}>
          <img src="/assets/imagenes/Icono-intro.jpeg" style={{ width:32,height:32,borderRadius:8,objectFit:'cover' }} />
          <span style={{ fontSize:'.6rem',padding:'3px 9px',border:'1px solid #fff',borderRadius:100,letterSpacing:2,fontWeight:700 }}>LOGIC</span>
        </div>
        <div style={{ display:'flex',alignItems:'center',gap:12 }}>
          <span style={{ fontSize:'.6rem',color:'#444',letterSpacing:1 }}>1080P · 60FPS</span>
          <button style={{ background:'#fff',color:'#000',border:'none',padding:'7px 16px',borderRadius:100,fontSize:'.7rem',fontWeight:700,cursor:'pointer' }}>EXPORTAR</button>
          <button onClick={()=>supabase.auth.signOut()} style={{ background:'transparent',color:'#444',border:'1px solid #222',padding:'7px 12px',borderRadius:100,fontSize:'.65rem',cursor:'pointer' }}>SALIR</button>
        </div>
      </header>

      {/* MONITOR */}
      <section ref={containerRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
        style={{ flex:1,background:'#050505',display:'flex',justifyContent:'center',alignItems:'center',position:'relative',overflow:'hidden',touchAction:'none',minHeight:0 }}>
        {monitorUrl ? (
          <>
            <video ref={videoRef} src={monitorUrl} loop muted
              onTimeUpdate={e=>setCurrentTime(e.currentTarget.currentTime)}
              onLoadedMetadata={e=>setDuracionTotal(e.currentTarget.duration)}
              style={{ maxWidth:'100%',maxHeight:'100%',borderRadius:12,objectFit:'contain' }} />
            {rects.map(r => (
              <div key={r.id} style={{ position:'absolute',left:r.x,top:r.y,width:r.width,height:r.height,border:'2px solid #fff',background:'rgba(255,255,255,.08)',borderRadius:8 }}>
                <div onClick={()=>setRects(prev=>prev.filter(x=>x.id!==r.id))}
                  style={{ position:'absolute',top:-12,right:-12,width:24,height:24,background:'#fff',color:'#000',borderRadius:'50%',display:'flex',justifyContent:'center',alignItems:'center',fontSize:10,fontWeight:700,cursor:'pointer',zIndex:10 }}>✕</div>
              </div>
            ))}
            {rectActual && dibujando && (
              <div style={{ position:'absolute',left:rectActual.x,top:rectActual.y,width:rectActual.width,height:rectActual.height,border:'1px dashed #fff',background:'rgba(255,255,255,.05)',borderRadius:8,pointerEvents:'none' }} />
            )}
          </>
        ) : (
          <div style={{ textAlign:'center',color:'#333' }}>
            <div style={{ fontSize:'2.5rem',marginBottom:8 }}>▶</div>
            <p style={{ fontSize:'.7rem',letterSpacing:3,textTransform:'uppercase' }}>Monitor vacío</p>
            <p style={{ fontSize:'.6rem',color:'#252525' }}>Sube un video desde la galería</p>
          </div>
        )}
      </section>

      {/* CONTROLES */}
      <div style={{ display:'flex',alignItems:'center',gap:12,padding:'8px 16px',borderTop:'1px solid #141414',borderBottom:'1px solid #0a0a0a',flexShrink:0 }}>
        <span style={{ fontSize:'.65rem',color:'#444',minWidth:40 }}>{fmtTime(currentTime)}</span>
        <div style={{ flex:1,height:3,background:'#1a1a1a',borderRadius:10,overflow:'hidden',cursor:'pointer' }}
          onClick={e=>{
            if(!videoRef.current||!duracionTotal) return;
            const rect=e.currentTarget.getBoundingClientRect();
            videoRef.current.currentTime=((e.clientX-rect.left)/rect.width)*duracionTotal;
          }}>
          <div style={{ width:duracionTotal?`${(currentTime/duracionTotal)*100}%`:'0%',height:'100%',background:'#fff',borderRadius:10,transition:'width .1s linear' }} />
        </div>
        <button onClick={togglePlay} style={{ background:'none',border:'none',color:'#fff',fontSize:'1.2rem',cursor:'pointer',padding:'0 4px' }}>
          {isPlaying?'⏸':'▶'}
        </button>
        <span style={{ fontSize:'.65rem',color:'#444',minWidth:40,textAlign:'right' }}>{fmtTime(duracionTotal)}</span>
      </div>

      {/* TIMELINE */}
      <section style={{ background:'#000',padding:'10px 14px',flexShrink:0,display:'flex',flexDirection:'column',gap:6 }}>
        <div style={{ fontSize:'.55rem',color:'#555',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:2 }}>📹 PISTA VIDEO</div>
        <div className="track-row">
          <label style={{ flexShrink:0,width:38,height:58,background:'#fff',borderRadius:10,display:'flex',justifyContent:'center',alignItems:'center',color:'#000',fontSize:'1.3rem',cursor:'pointer' }}>
            +<input type="file" multiple accept="video/*,image/*" onChange={e=>subirArchivos(e, e.target.files?.[0]?.type.startsWith('image')?'foto':'video')} style={{ display:'none' }} />
          </label>
          {pistaVideo.length===0 && <span style={{ color:'#252525',fontSize:'.7rem' }}>Arrastra clips aquí</span>}
          {pistaVideo.map((item,idx)=>(
            <div key={item.trackId} draggable onDragStart={()=>onDragStart(idx)} onDragOver={e=>onDragOver(e,idx)} onDragEnd={()=>setDragIdx(null)}
              onClick={()=>{setClipSeleccionado(item.trackId);setMonitorUrl(item.url);}}
              className={`clip ${clipSeleccionado===item.trackId?'sel':''}`}>
              {item.tipo==='video'
                ?<video src={item.url} style={{ width:'100%',height:'100%',objectFit:'cover',opacity:.6 }} muted />
                :<img src={item.url} style={{ width:'100%',height:'100%',objectFit:'cover',opacity:.7 }} />}
              <span style={{ position:'absolute',bottom:3,left:5,fontSize:'.5rem',color:'#fff',fontWeight:700,textShadow:'0 1px 3px #000' }}>{item.etiqueta}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize:'.55rem',color:'#555',letterSpacing:'1.5px',textTransform:'uppercase',marginBottom:2 }}>🎵 PISTA AUDIO</div>
        <div className="track-row" style={{ minHeight:48 }}>
          <label style={{ flexShrink:0,width:38,height:38,background:'#0a0a0a',borderRadius:10,border:'1px solid #222',display:'flex',justifyContent:'center',alignItems:'center',color:'#555',fontSize:'1rem',cursor:'pointer' }}>
            +<input type="file" multiple accept="audio/*" onChange={e=>subirArchivos(e,'audio')} style={{ display:'none' }} />
          </label>
          {pistaAudio.length===0 && <span style={{ color:'#252525',fontSize:'.7rem' }}>Sin audio</span>}
          {pistaAudio.map(item=>(
            <div key={item.trackId} onClick={()=>{setClipSeleccionado(item.trackId);toggleAudio(item.url);}}
              className={`audio-clip ${clipSeleccionado===item.trackId?'sel':''}`}>
              <span style={{ fontSize:'.6rem',color:'#fff',fontWeight:700 }}>{item.etiqueta}</span>
              <div style={{ display:'flex',gap:2,alignItems:'center' }}>
                {[8,14,10,18,7,12,16,9].map((h,i)=>(
                  <div key={i} style={{ width:2,height:h,background:'#0055ff',borderRadius:2 }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* BARRA INFERIOR */}
      <div style={{ borderTop:'1px solid #141414',padding:'10px 14px',background:'#050505',display:'flex',gap:8,overflowX:'auto',flexShrink:0 }}>
        {clipActivo ? (
          <>
            <button className="pill" onClick={()=>setClipSeleccionado(null)}>← ATRÁS</button>
            <button className="pill">✂️ DIVIDIR</button>
            <button className="pill">⏱ VELOCIDAD</button>
            <button className="pill">🔊 VOLUMEN</button>
            <button className="pill">🎨 FILTRO</button>
            <button className="pill" onClick={()=>{
              if(pistaVideo.find(i=>i.trackId===clipSeleccionado)) quitarDeVideo(clipSeleccionado);
              else quitarDeAudio(clipSeleccionado);
            }} style={{ border:'1px solid #ff3333',color:'#ff3333' }}>🗑 BORRAR</button>
          </>
        ) : (
          <>
            <button className={`pill ${panelActivo==='galeria'?'on':''}`} onClick={()=>setPanelActivo(panelActivo==='galeria'?null:'galeria')}>📁 GALERÍA</button>
            <button className={`pill ${panelActivo==='script'?'on':''}`} onClick={()=>setPanelActivo(panelActivo==='script'?null:'script')}>⚡ SCRIPT JS</button>
            <button className={`pill ${panelActivo==='ia'?'on':''}`} onClick={()=>setPanelActivo(panelActivo==='ia'?null:'ia')}>🤖 CHAT IA</button>
            <button className={`pill ${panelActivo==='texto'?'on':''}`} onClick={()=>setPanelActivo(panelActivo==='texto'?null:'texto')}>T TEXTO</button>
          </>
        )}
      </div>

      {/* PANEL GALERÍA */}
      {!clipActivo && panelActivo==='galeria' && (
        <div style={{ position:'fixed',bottom:0,left:0,right:0,height:'48vh',background:'#040404',borderTop:'1px solid #1a1a1a',zIndex:200,display:'flex',flexDirection:'column',borderRadius:'20px 20px 0 0',overflow:'hidden' }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 16px 10px',flexShrink:0 }}>
            <span style={{ fontSize:'.65rem',color:'#555',letterSpacing:2,textTransform:'uppercase' }}>RECURSOS</span>
            <button onClick={()=>setPanelActivo(null)} style={{ background:'none',border:'none',color:'#fff',fontSize:'1.3rem',cursor:'pointer' }}>×</button>
          </div>
          <div style={{ display:'flex',gap:8,padding:'0 16px 12px',flexShrink:0 }}>
            {['video','foto','audio'].map(tipo=>(
              <label key={tipo} style={{ flex:1,textAlign:'center',padding:'10px 6px',border:'1px dashed #2a2a2a',borderRadius:12,fontSize:'.65rem',color:'#666',cursor:'pointer',textTransform:'uppercase',letterSpacing:1 }}>
                + {tipo}
                <input type="file" multiple accept={tipo==='video'?'video/*':tipo==='foto'?'image/*':'audio/*'} onChange={e=>subirArchivos(e,tipo)} style={{ display:'none' }} />
              </label>
            ))}
          </div>
          <div style={{ flex:1,overflowY:'auto',padding:'0 16px 16px',display:'flex',flexDirection:'column',gap:8 }}>
            {galeria.length===0
              ? <p style={{ color:'#2a2a2a',fontSize:'.75rem',textAlign:'center',padding:'2rem' }}>Galería vacía. Sube archivos arriba.</p>
              : galeria.map(item=>(
                <div key={item.id} className="gallery-item">
                  <div style={{ width:52,height:52,borderRadius:8,background:'#111',flexShrink:0,overflow:'hidden',display:'flex',justifyContent:'center',alignItems:'center' }}>
                    {item.tipo==='foto' && <img src={item.url} style={{ width:'100%',height:'100%',objectFit:'cover' }} />}
                    {item.tipo==='video' && <video src={item.url} style={{ width:'100%',height:'100%',objectFit:'cover' }} muted />}
                    {item.tipo==='audio' && <span style={{ fontSize:'1.4rem' }}>🎵</span>}
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <p style={{ margin:0,fontSize:'.75rem',color:'#ddd',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{item.nombre}</p>
                    <span style={{ fontSize:'.6rem',color:'#444',background:'#111',padding:'2px 6px',borderRadius:4,marginTop:4,display:'inline-block' }}>{item.etiqueta}</span>
                  </div>
                  <div style={{ display:'flex',gap:6,flexShrink:0 }}>
                    {(item.tipo==='video'||item.tipo==='foto') && (
                      <button onClick={()=>enviarAPistaVideo(item)} style={{ background:'#fff',color:'#000',border:'none',borderRadius:100,padding:'5px 10px',fontSize:'.65rem',fontWeight:700,cursor:'pointer' }}>+ VIDEO</button>
                    )}
                    {item.tipo==='audio' && (
                      <button onClick={()=>enviarAPistaAudio(item)} style={{ background:'#0055ff',color:'#fff',border:'none',borderRadius:100,padding:'5px 10px',fontSize:'.65rem',fontWeight:700,cursor:'pointer' }}>+ AUDIO</button>
                    )}
                    <button onClick={()=>setGaleria(prev=>prev.filter(i=>i.id!==item.id))} style={{ background:'transparent',border:'none',color:'#ff3333',fontSize:'.8rem',cursor:'pointer',padding:'4px 6px' }}>✕</button>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* PANEL SCRIPT */}
      {!clipActivo && panelActivo==='script' && (
        <div style={{ position:'fixed',bottom:0,left:0,right:0,height:'42vh',background:'#040404',borderTop:'1px solid #1a1a1a',zIndex:200,display:'flex',flexDirection:'column',borderRadius:'20px 20px 0 0',padding:'14px 16px' }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10 }}>
            <span style={{ fontSize:'.65rem',color:'#555',letterSpacing:2 }}>⚡ JS INJECTOR</span>
            <button onClick={()=>setPanelActivo(null)} style={{ background:'none',border:'none',color:'#fff',fontSize:'1.3rem',cursor:'pointer' }}>×</button>
          </div>
          <div style={{ fontSize:'.58rem',color:'#333',marginBottom:8,fontFamily:'monospace' }}>
            play() · pause() · mute() · unmute() · seek(s) · render() · info()
          </div>
          <textarea value={script} onChange={e=>setScript(e.target.value)}
            style={{ flex:1,background:'#000',border:'1px solid #1a1a1a',borderRadius:12,color:'#00ffcc',padding:'1rem',fontFamily:'monospace',fontSize:'.8rem',resize:'none',outline:'none' }} />
          <button onClick={ejecutarScript} style={{ width:'100%',padding:'.9rem',background:'#fff',color:'#000',border:'none',borderRadius:100,fontWeight:700,fontSize:'.75rem',cursor:'pointer',marginTop:10 }}>
            EJECUTAR EN MOTOR
          </button>
        </div>
      )}

      {/* PANEL IA */}
      {!clipActivo && panelActivo==='ia' && (
        <div style={{ position:'fixed',bottom:0,left:0,right:0,height:'52vh',background:'#040404',borderTop:'1px solid #1a1a1a',zIndex:200,display:'flex',flexDirection:'column',borderRadius:'20px 20px 0 0',overflow:'hidden' }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 16px 10px',flexShrink:0 }}>
            <span style={{ fontSize:'.65rem',color:'#555',letterSpacing:2 }}>🤖 NAYLA IA</span>
            <button onClick={()=>setPanelActivo(null)} style={{ background:'none',border:'none',color:'#fff',fontSize:'1.3rem',cursor:'pointer' }}>×</button>
          </div>
          <div style={{ flex:1,overflowY:'auto',padding:'0 16px',display:'flex',flexDirection:'column',gap:8 }}>
            {iaChat.length===0 && <p style={{ color:'#2a2a2a',fontSize:'.75rem',textAlign:'center',paddingTop:'1.5rem' }}>Pregúntame sobre edición o comandos del motor.</p>}
            {iaChat.map((m,i)=>(
              <div key={i} style={{ background:m.role==='user'?'#fff':'#111',color:m.role==='user'?'#000':'#ddd',padding:'.6rem 1rem',borderRadius:m.role==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px',fontSize:'.75rem',maxWidth:'80%',alignSelf:m.role==='user'?'flex-end':'flex-start',border:m.role==='ia'?'1px solid #222':'none' }}>
                {m.text}
              </div>
            ))}
            {iaLoading && <div style={{ background:'#111',color:'#555',padding:'.6rem 1rem',borderRadius:'16px 16px 16px 4px',fontSize:'.75rem',maxWidth:'80%',border:'1px solid #222' }}>Procesando...</div>}
          </div>
          <div style={{ display:'flex',gap:8,padding:'10px 16px',flexShrink:0,borderTop:'1px solid #111' }}>
            <input value={iaInput} onChange={e=>setIaInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();enviarMensajeIA();}}}
              placeholder="Escribe a NAYLA..."
              style={{ flex:1,background:'#0a0a0a',border:'1px solid #222',borderRadius:100,color:'#fff',padding:'.7rem 1rem',fontSize:'.8rem',outline:'none' }} />
            <button onClick={enviarMensajeIA} disabled={iaLoading}
              style={{ background:'#fff',color:'#000',border:'none',borderRadius:100,padding:'.7rem 1.2rem',fontWeight:700,fontSize:'.75rem',cursor:'pointer' }}>↑</button>
          </div>
        </div>
      )}

      {/* PANEL TEXTO */}
      {!clipActivo && panelActivo==='texto' && (
        <div style={{ position:'fixed',bottom:0,left:0,right:0,height:'35vh',background:'#040404',borderTop:'1px solid #1a1a1a',zIndex:200,display:'flex',flexDirection:'column',borderRadius:'20px 20px 0 0',padding:'14px 16px' }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14 }}>
            <span style={{ fontSize:'.65rem',color:'#555',letterSpacing:2 }}>T TEXTO EN PANTALLA</span>
            <button onClick={()=>setPanelActivo(null)} style={{ background:'none',border:'none',color:'#fff',fontSize:'1.3rem',cursor:'pointer' }}>×</button>
          </div>
          <input placeholder="Escribe el texto..." style={{ padding:'1rem',background:'#0a0a0a',border:'1px solid #222',borderRadius:14,color:'#fff',fontSize:'1rem',outline:'none',marginBottom:12 }} />
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            {['Pequeño','Mediano','Grande','Negrita','Cursiva','Centrado'].map(op=>(
              <button key={op} className="pill">{op}</button>
            ))}
          </div>
          <button style={{ marginTop:12,padding:'.9rem',background:'#fff',color:'#000',border:'none',borderRadius:100,fontWeight:700,fontSize:'.75rem',cursor:'pointer' }}>
            AGREGAR AL VIDEO
          </button>
        </div>
      )}
    </div>
  );
}
