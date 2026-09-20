import { afterEach, describe, expect, it } from 'vitest';
import {
  estimatedWorstCaseCost,
  getGpuBudgetPolicy,
  getGpuProfile,
} from '../lib/gpu/profiles';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('GPU budget profiles', () => {
  it('keeps the default Vast budget conservative', () => {
    delete process.env.VAST_MAX_JOB_USD;
    delete process.env.VAST_MIN_BALANCE_USD;
    delete process.env.VAST_MAX_CONCURRENT_JOBS;

    const policy = getGpuBudgetPolicy();
    expect(policy.maxJobUsd).toBe(0.4);
    expect(policy.minBalanceReserveUsd).toBe(1);
    expect(policy.maxConcurrentJobs).toBe(1);
  });

  it('requires more VRAM for video and 3D than image/audio', () => {
    expect(getGpuProfile('video').minGpuRamGb).toBeGreaterThanOrEqual(24);
    expect(getGpuProfile('3d').minGpuRamGb).toBeGreaterThanOrEqual(24);
    expect(getGpuProfile('image').minGpuRamGb).toBeLessThan(getGpuProfile('video').minGpuRamGb);
    expect(getGpuProfile('audio').minGpuRamGb).toBeLessThan(getGpuProfile('3d').minGpuRamGb);
  });

  it('does not assign a paid media worker image unless explicitly configured', () => {
    delete process.env.VAST_GPU_WORKER_IMAGE;
    delete process.env.VAST_VIDEO_WORKER_IMAGE;

    expect(getGpuProfile('video').workerImage).toBeUndefined();
    expect(getGpuProfile('probe').workerImage).toContain('pytorch/pytorch');
  });

  it('calculates a worst-case cost with a safety multiplier', () => {
    expect(estimatedWorstCaseCost(0.3, 30, 1.25)).toBe(0.1875);
  });
});
