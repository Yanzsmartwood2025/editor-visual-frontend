import { Suspense, lazy, useState } from 'react';
import type { FirebaseSession } from '../../lib/firebaseClient';
import GenerarIcon from './GenerarIcon';
import GenerarStyles from './GenerarStyles';
import { ModuleBreaker } from './ModuleBreaker';
import type {
  GenerarEngine,
  GenerarMediaItem,
  GenerarModule,
  GenerarModuleContext,
} from './types';

const ApiWorkspace = lazy(() => import('./api/ApiWorkspace'));
const GpuWorkspace = lazy(() => import('./gpu/GpuWorkspace'));

type Props = {
  onClose: () => void;
  session: FirebaseSession | null;
  projectId: string | null;
  threadId: string | null;
  onUseMedia?: (item: GenerarMediaItem) => void | Promise<void>;
};

export default function GenerarWorkspace({
  onClose,
  session,
  projectId,
  threadId,
  onUseMedia,
}: Props) {
  const [engine, setEngine] = useState<GenerarEngine | null>(null);
  const [module, setModule] = useState<GenerarModule | null>(null);

  const chooseEngine = (next: GenerarEngine) => {
    setModule(null);
    setEngine(next);
  };

  const goBack = () => {
    if (engine) {
      setModule(null);
      setEngine(null);
      return;
    }
    onClose();
  };

  const context: GenerarModuleContext = {
    session,
    projectId,
    threadId,
    onUseMedia,
  };

  return (
    <div className="generar-workspace" role="dialog" aria-modal="true" aria-label="Generar">
      <GenerarStyles />

      <header className="generar-header">
        <button
          type="button"
          className="generar-icon-button glass-glow-button"
          onClick={goBack}
          aria-label="Volver"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>

        <div className="generar-header-copy">
          <small>GENERAR</small>
          <strong>{engine ? (engine === 'api' ? 'NAYLA CLOUD' : 'NAYLA COMPUTE') : 'MOTORES'}</strong>
        </div>

        <button
          type="button"
          className="generar-icon-button glass-glow-button"
          onClick={onClose}
          aria-label="Cerrar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>

      {!engine ? (
        <main className="generar-engine-grid generar-choice-grid">
          <button
            type="button"
            className="generar-choice-card glass-glow-button"
            onClick={() => chooseEngine('api')}
          >
            <span className="generar-choice-icon"><GenerarIcon name="api" /></span>
            <strong>API</strong>
            <span>Servicios conectados de Nayla Cloud</span>
          </button>

          <button
            type="button"
            className="generar-choice-card glass-glow-button"
            onClick={() => chooseEngine('gpu')}
          >
            <span className="generar-choice-icon"><GenerarIcon name="gpu" /></span>
            <strong>GPU</strong>
            <span>Procesamiento dedicado de Nayla Compute</span>
          </button>
        </main>
      ) : (
        <Suspense fallback={<div className="generar-loading">Cargando módulo…</div>}>
          <ModuleBreaker
            key={engine + ':' + (module || 'home')}
            moduleKey={engine + ':' + (module || 'home')}
            onReset={() => setModule(null)}
          >
            {engine === 'api' ? (
              <ApiWorkspace activeModule={module} onModule={setModule} context={context} />
            ) : (
              <GpuWorkspace activeModule={module} onModule={setModule} context={context} />
            )}
          </ModuleBreaker>
        </Suspense>
      )}
    </div>
  );
}
