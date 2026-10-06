import { describe, expect, it } from 'vitest';
import { getGpuResumePresentation } from '../lib/gpu/gpuResumePresentation';

describe('GPU resume card presentation', () => {
  it('offers return and cancellation for a GPU that is in use', () => {
    expect(getGpuResumePresentation({ status: 'processing' })).toEqual({
      badge: 'GPU EN USO',
      action: 'VOLVER AL TRABAJO 3D',
      canCancel: true,
    });
  });

  it('keeps the monitor available while cleanup runs but prevents duplicate cancellation', () => {
    expect(getGpuResumePresentation({ status: 'cleanup_pending' })).toEqual({
      badge: 'CERRANDO GPU',
      action: 'VER LIMPIEZA',
      canCancel: false,
    });
  });

  it('offers the saved result after a completed job and never offers cancellation', () => {
    expect(getGpuResumePresentation({ status: 'completed' })).toEqual({
      badge: 'TRABAJO TERMINADO',
      action: 'ABRIR ESTUDIO 3D',
      canCancel: false,
    });
  });

  it('does not present a stale action for an unknown status', () => {
    expect(getGpuResumePresentation({ status: 'unknown' })).toBeNull();
  });
});
