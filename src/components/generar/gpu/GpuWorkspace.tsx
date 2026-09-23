import React, { lazy, Suspense } from 'react';
import type { GenerarModule } from '../types';
const modules: Record<GenerarModule, React.LazyExoticComponent<React.ComponentType>> = {
 imagen: lazy(() => import('./imagen')),
 video: lazy(() => import('./video')),
 audio: lazy(() => import('./audio')),
 musica: lazy(() => import('./musica')),
 '3d': lazy(() => import('./3d')),
};
export default function GpuWorkspace({ activeModule, onModule }: { activeModule: GenerarModule | null; onModule: (m: GenerarModule | null) => void }) {
 if (!activeModule) return <div className="generar-module-grid">{(['imagen','video','audio','musica','3d'] as GenerarModule[]).map(m=><button key={m} onClick={()=>onModule(m)}><strong>{m==='3d'?'3D':m.toUpperCase()}</strong><span>GPU</span></button>)}</div>;
 const Active=modules[activeModule]; return <div className="generar-module-shell"><button onClick={()=>onModule(null)} style={{alignSelf:'flex-start',margin:16}}>← GPU</button><Suspense fallback={<div className="generar-loading">Cargando…</div>}><Active /></Suspense></div>;
}
