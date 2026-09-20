import { afterEach, describe, expect, it } from 'vitest';
import {
  createComputeSelectionId,
  createComputeTargetSelectionId,
  findComputeTargetBySelectionId,
  findOfferByComputeSelectionId,
} from '../lib/gpu/selection';
import type { VastOffer } from '../lib/gpu/vastApi';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('Nayla Compute selection tokens', () => {
  it('selects the exact offer through an opaque stable token', () => {
    process.env.NAYLA_COMPUTE_SELECTION_SECRET = 'test-only-secret';
    const offers: VastOffer[] = [
      {
        id: 101,
        gpu_name: 'RTX 4090',
        gpu_ram: 24000,
        dph_total: 0.22,
        reliability: 0.99,
      },
      {
        id: 202,
        gpu_name: 'A100',
        gpu_ram: 80000,
        dph_total: 0.55,
        reliability: 0.98,
      },
    ];

    const first = createComputeSelectionId(offers[0]);
    const second = createComputeSelectionId(offers[1]);

    expect(first).toBe(createComputeSelectionId(offers[0]));
    expect(first).not.toBe(second);
    expect(first).not.toBe(String(offers[0].id));
    expect(findOfferByComputeSelectionId(offers, second)?.id).toBe(202);
    expect(findOfferByComputeSelectionId(offers, 'invalid-selection')).toBeNull();
  });

  it('uses the cheapest sorted offer only when the user has not selected one', () => {
    process.env.NAYLA_COMPUTE_SELECTION_SECRET = 'test-only-secret';
    const offers: VastOffer[] = [
      { id: 1, gpu_name: 'GPU A', gpu_ram: 24000, dph_total: 0.1 },
      { id: 2, gpu_name: 'GPU B', gpu_ram: 48000, dph_total: 0.2 },
    ];

    expect(findOfferByComputeSelectionId(offers)?.id).toBe(1);
  });

  it('keeps GPU selections opaque and unique across Compute networks', () => {
    process.env.NAYLA_COMPUTE_SELECTION_SECRET = 'test-only-secret';
    const targets = [
      {
        backend: 'vast' as const,
        backendId: '101',
        gpuName: 'RTX 4090',
        gpuRamGb: 24,
        hourlyPrice: 0.22,
      },
      {
        backend: 'runpod' as const,
        backendId: 'NVIDIA GeForce RTX 4090',
        gpuName: 'RTX 4090',
        gpuRamGb: 24,
        hourlyPrice: 0.22,
      },
    ];

    const vastToken = createComputeTargetSelectionId(targets[0]);
    const runpodToken = createComputeTargetSelectionId(targets[1]);

    expect(vastToken).not.toBe(runpodToken);
    expect(vastToken).not.toContain('vast');
    expect(runpodToken).not.toContain('runpod');
    expect(findComputeTargetBySelectionId(targets, runpodToken)?.backend).toBe('runpod');
  });

});
