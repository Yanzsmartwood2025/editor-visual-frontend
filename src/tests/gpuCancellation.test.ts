import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelGpuJobForUser } from '../lib/gpu/orchestrator';

const state = vi.hoisted(() => ({
  job: null as any,
  destroy: vi.fn(),
}));

vi.mock('../lib/gpu/jobStore', async (original) => ({
  ...(await original<any>()),
  getGpuJobForUser: async () => state.job,
  updateGpuJobIfStatus: async (_id: string, expected: string, patch: any) => {
    if (!state.job || state.job.status !== expected) return null;
    state.job = { ...state.job, ...patch };
    return state.job;
  },
  updateGpuJob: async (_id: string, patch: any) => {
    state.job = { ...state.job, ...patch };
    return state.job;
  },
  getGalleryItemById: async () => null,
}));

vi.mock('../lib/gpu/vastApi', async (original) => ({
  ...(await original<any>()),
  destroyVastInstance: state.destroy,
}));

vi.mock('../lib/r2', () => ({
  createR2StorageUrl: () => 'https://storage.example/output.glb',
  createR2PresignedGetUrl: () => ({ url: 'https://storage.example/read' }),
  createR2PresignedPutUrl: () => ({ uploadUrl: 'https://storage.example/write', key: 'output', contentType: 'model/gltf-binary' }),
  headR2Object: async () => ({ contentLength: 10, contentType: 'model/gltf-binary' }),
}));

describe('GPU job cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.job = {
      id: 'job',
      user_id: 'owner',
      project_id: null,
      thread_id: null,
      provider: 'vast',
      workload: '3d',
      status: 'processing',
      instance_id: 123,
      offer_id: 44,
      gpu_name: 'GTX TITAN X',
      hourly_price: 0.06,
      estimated_max_cost: 0.03,
      runtime_cost_estimate: 0.01,
      balance_before: 1,
      lease_expires_at: new Date(Date.now() + 600_000).toISOString(),
      callback_token_hash: 'unused',
      output_url: null,
      output_content_type: 'model/gltf-binary',
      gallery_item_id: null,
      error_message: null,
      metadata: { progress: { percent: 18, stage: 'Preparando CUDA' } },
      created_at: new Date().toISOString(),
      started_at: new Date(Date.now() - 60_000).toISOString(),
      completed_at: null,
      destroyed_at: null,
    };
  });

  it('destroys the owned instance and marks the job cancelled', async () => {
    const result = await cancelGpuJobForUser({ jobId: 'job', userId: 'owner' });

    expect(state.destroy).toHaveBeenCalledWith(123);
    expect(result.status).toBe('cancelled');
    expect(result.destroyedAt).toBeTruthy();
  });

  it('does not destroy or reveal a job owned by another user', async () => {
    state.job = null;

    await expect(cancelGpuJobForUser({ jobId: 'job', userId: 'other' })).rejects.toThrow(
      'Trabajo GPU no encontrado.'
    );
    expect(state.destroy).not.toHaveBeenCalled();
  });

  it('does not destroy a job that has already completed', async () => {
    state.job.status = 'completed';

    const result = await cancelGpuJobForUser({ jobId: 'job', userId: 'owner' });

    expect(state.destroy).not.toHaveBeenCalled();
    expect(result.status).toBe('completed');
  });

  it('keeps failed cleanup retryable instead of claiming the GPU was destroyed', async () => {
    state.destroy.mockRejectedValueOnce(new Error('provider unavailable'));

    const result = await cancelGpuJobForUser({ jobId: 'job', userId: 'owner' });

    expect(result.status).toBe('cleanup_pending');
    expect(result.destroyedAt).toBeNull();
  });
});
