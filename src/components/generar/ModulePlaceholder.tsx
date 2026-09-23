import React from 'react';
import type { GenerarEngine, GenerarModule } from './types';

export default function ModulePlaceholder({ engine, module }: { engine: GenerarEngine; module: GenerarModule }) {
  return <section className="generar-module-placeholder"><span>{engine.toUpperCase()}</span><h2>{module === '3d' ? '3D' : module.toUpperCase()}</h2><p>Interfaz modular preparada. La conexión se activará en una tarea independiente.</p></section>;
}
