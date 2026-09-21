export type NaylaExecutionMode = 'auto' | 'cloud' | 'compute';

export const canStartGpuCompute = (mode: NaylaExecutionMode) => mode === 'compute';

export const getNaylaExecutionPolicyPrompt = (mode: NaylaExecutionMode) => {
  if (mode === 'compute') {
    return [
      'MODO POTENCIA ACTIVO.',
      'Puedes proponer RUN_GPU_JOB solo para tareas que realmente necesiten GPU.',
      'Para edición normal representable con BUILD_TIMELINE, render, subtítulos, transiciones, color, overlays, Skia, GSAP, Lottie/Rive o 3D ya soportado, sigue prefiriendo el motor de edición antes de alquilar GPU.',
      'Toda GPU requiere cotización y confirmación separada antes de reservar una tarjeta.',
    ].join(' ');
  }

  return [
    'MODO CLOUD ACTIVO.',
    'Prioridad absoluta: usa primero el motor de edición y render del Sandbox y las funciones locales/cloud disponibles.',
    'No emitas RUN_GPU_JOB y no alquiles GPU en este modo.',
    'Si una tarea no puede resolverse con las capacidades de Cloud, explica brevemente que necesita Potencia y espera a que el usuario cambie de modo.',
  ].join(' ');
};
