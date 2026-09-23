import React, { Suspense, lazy, useState } from 'react';
import { ModuleBreaker } from './ModuleBreaker';
import type { GenerarEngine, GenerarModule } from './types';

const ApiWorkspace = lazy(() => import('./api/ApiWorkspace'));
const GpuWorkspace = lazy(() => import('./gpu/GpuWorkspace'));

export default function GenerarWorkspace({ onClose }: { onClose: () => void }) {
  const [engine, setEngine] = useState<GenerarEngine | null>(null);
  const [module, setModule] = useState<GenerarModule | null>(null);
  const chooseEngine = (next: GenerarEngine) => { setModule(null); setEngine(next); };
  return <div className="generar-workspace" role="dialog" aria-modal="true">
    <header><button onClick={() => engine ? (setEngine(null), setModule(null)) : onClose()} aria-label="Volver">←</button><div><small>GENERAR</small><strong>{engine ? engine.toUpperCase() : 'Motores'}</strong></div><button onClick={onClose} aria-label="Cerrar">×</button></header>
    {!engine ? <main className="generar-engine-grid">
      <button onClick={() => chooseEngine('api')}><strong>API</strong><span>Servicios conectados</span></button>
      <button onClick={() => chooseEngine('gpu')}><strong>GPU</strong><span>Procesamiento dedicado</span></button>
    </main> : <Suspense fallback={<div className="generar-loading">Cargando módulo…</div>}>
      <ModuleBreaker key={engine + ':' + (module || 'home')} moduleKey={engine + ':' + (module || 'home')} onReset={() => setModule(null)}>
        {engine === 'api' ? <ApiWorkspace activeModule={module} onModule={setModule} /> : <GpuWorkspace activeModule={module} onModule={setModule} />}
      </ModuleBreaker>
    </Suspense>}
    <style jsx global>{`.generar-workspace{position:fixed;inset:0;z-index:12000;background:#08090b;color:#fff;display:flex;flex-direction:column}.generar-workspace header{height:72px;display:flex;align-items:center;gap:18px;padding:0 22px;border-bottom:1px solid rgba(255,255,255,.1);background:rgba(10,11,14,.96)}.generar-workspace header div{display:flex;flex-direction:column;flex:1}.generar-workspace header small{opacity:.55;letter-spacing:.18em}.generar-workspace header button{width:42px;height:42px;border-radius:14px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#fff;font-size:22px}.generar-engine-grid,.generar-module-grid{flex:1;display:grid;place-content:center;grid-template-columns:repeat(2,minmax(220px,320px));gap:20px;padding:28px}.generar-engine-grid button,.generar-module-grid button{min-height:150px;border:1px solid rgba(255,255,255,.14);border-radius:24px;background:rgba(255,255,255,.045);color:#fff;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:24px;text-align:left}.generar-engine-grid strong,.generar-module-grid strong{font-size:24px}.generar-engine-grid span,.generar-module-grid span{opacity:.55}.generar-module-shell{flex:1;display:flex;flex-direction:column;min-height:0}.generar-module-placeholder,.generar-loading,.generar-breaker{flex:1;display:grid;place-content:center;text-align:center;padding:32px}.generar-module-placeholder span{opacity:.5;letter-spacing:.2em}.generar-module-placeholder h2{font-size:36px;margin:8px}.generar-module-placeholder p,.generar-breaker p{opacity:.6;max-width:520px}.generar-breaker button{margin:auto;padding:12px 20px;border-radius:12px}@media(max-width:650px){.generar-engine-grid,.generar-module-grid{grid-template-columns:1fr;align-content:center}.generar-engine-grid button,.generar-module-grid button{min-height:105px}}`}</style>
  </div>;
}
