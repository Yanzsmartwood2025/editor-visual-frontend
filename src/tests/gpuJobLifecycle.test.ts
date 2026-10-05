import { describe, expect, it } from 'vitest';
import { shouldStopGpuManifest } from '../lib/gpu/gpuJobLifecycle';

describe('GPU manifest lifecycle guard', () => {
  it('stops a manifest when the job already failed', () => {
    expect(shouldStopGpuManifest({ status: 'failed' })).toBe(true);
  });

  it('stops a stale processing job whose instance was destroyed', () => {
    expect(shouldStopGpuManifest({ status: 'processing', destroyedAt: '2026-10-05T21:32:34Z' })).toBe(true);
  });

  it('stops jobs that are being cancelled or cleaned up', () => {
    expect(shouldStopGpuManifest({ status: 'running', cancelRequested: true })).toBe(true);
    expect(shouldStopGpuManifest({ status: 'cleanup_pending' })).toBe(true);
  });

  it('allows active work to fetch its manifest', () => {
    expect(shouldStopGpuManifest({ status: 'booting' })).toBe(false);
    expect(shouldStopGpuManifest({ status: 'processing' })).toBe(false);
  });
});
