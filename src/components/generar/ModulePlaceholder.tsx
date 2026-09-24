import type { GenerarEngine, GenerarModule } from './types';

export default function ModulePlaceholder({ engine, module }: { engine: GenerarEngine; module: GenerarModule }) {
  return (
    <section data-generar-module={module} className="generar-module-placeholder">
      <span className="generar-eyebrow">{engine.toUpperCase()}</span>
      <h2>{module === '3d' ? '3D' : module.toUpperCase()}</h2>
      <p>Este breaker ya está aislado. La conexión funcional se activará módulo por módulo.</p>
    </section>
  );
}
