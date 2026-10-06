export type GpuResumeState = { status?: unknown };

export function getGpuResumePresentation(job: GpuResumeState) {
  switch (job.status) {
    case 'renting':
    case 'booting':
    case 'running':
    case 'processing':
      return { badge: 'GPU EN USO', action: 'VOLVER AL TRABAJO 3D', canCancel: true };
    case 'cleanup_pending':
      return { badge: 'CERRANDO GPU', action: 'VER LIMPIEZA', canCancel: false };
    case 'completed':
      return { badge: 'TRABAJO TERMINADO', action: 'ABRIR ESTUDIO 3D', canCancel: false };
    case 'failed':
    case 'expired':
    case 'cancelled':
      return { badge: 'GPU LIBERADA', action: 'VER ESTADO', canCancel: false };
    default:
      return null;
  }
}
