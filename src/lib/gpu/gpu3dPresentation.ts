export const GPU_3D_WORKFLOW_STEPS = [
  'Preparar GPU',
  'Preparar entorno',
  'Crear malla 3D',
  'Color y movimiento',
  'Guardar en Bóveda',
  'Retirar GPU temporal',
] as const;

export type Gpu3DWorkflowStep = {
  label: (typeof GPU_3D_WORKFLOW_STEPS)[number];
  state: 'complete' | 'active' | 'pending';
};

export function getGpu3DWorkflow(status: string, progressPercent?: number | null) {
  const fallbackPercent =
    status === 'renting' ? 3 :
    status === 'booting' ? 6 :
    status === 'running' ? 8 :
    status === 'cleanup_pending' ? 96 :
    status === 'completed' ? 100 : 0;
  const hasReportedProgress = Number.isFinite(progressPercent) || status === 'completed';
  const percent = Math.min(100, Math.max(0, Math.round(progressPercent ?? fallbackPercent)));
  const completed = status === 'completed';
  const activeStepIndex = completed
    ? -1
    : status === 'renting' || status === 'booting'
      ? 0
      : status === 'cleanup_pending'
        ? 5
        : percent >= 90
          ? 4
          : percent >= 78
            ? 3
            : percent >= 48
              ? 2
              : 1;

  return {
    percent,
    hasReportedProgress,
    completed,
    activeStepIndex,
    steps: GPU_3D_WORKFLOW_STEPS.map((label, index): Gpu3DWorkflowStep => ({
      label,
      state: completed || index < activeStepIndex ? 'complete' : index === activeStepIndex ? 'active' : 'pending',
    })),
  };
}

export function canOpen3DStudio(status: string, hasResult: boolean, hasStudio: boolean) {
  return status === 'completed' && hasResult && hasStudio;
}
