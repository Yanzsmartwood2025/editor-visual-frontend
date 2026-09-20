import { describe, expect, it } from 'vitest';
import {
  buildRecipeBootstrap,
  getGpuRecipePlan,
  validateRecipeInputs,
} from '../lib/gpu/recipes';
import { resolveGpuExecutionPlan } from '../lib/gpu/planner';

describe('GPU recipes', () => {
  it('enables TripoSR only for the explicit image-to-3D recipe', () => {
    const plan = getGpuRecipePlan('3d', 'triposr-image-to-3d');

    expect(plan).not.toBeNull();
    expect(plan?.profile.minGpuRamGb).toBe(8);
    expect(plan?.profile.outputExtension).toBe('glb');
    expect(plan?.workerImage).toContain('pytorch/pytorch');
    expect(buildRecipeBootstrap(plan!)).toContain('/opt/nayla/run-job');

    expect(getGpuRecipePlan('3d', 'unknown-recipe')).toBeNull();
    expect(getGpuRecipePlan('video', 'triposr-image-to-3d')).toBeNull();
  });

  it('never lets a recipe relax the global hourly price cap', () => {
    const original = process.env.VAST_MAX_HOURLY_USD;
    process.env.VAST_MAX_HOURLY_USD = '0.20';

    try {
      const plan = resolveGpuExecutionPlan({
        workload: '3d',
        recipe: 'triposr-image-to-3d',
        inputUrls: ['https://cdn.example/model-input.png'],
      });

      expect(plan.profile.maxHourlyUsd).toBe(0.20);
      expect(plan.workerImage).toContain('pytorch/pytorch');
    } finally {
      if (original === undefined) delete process.env.VAST_MAX_HOURLY_USD;
      else process.env.VAST_MAX_HOURLY_USD = original;
    }
  });

  it('requires exactly one public HTTPS input for TripoSR', () => {
    const plan = getGpuRecipePlan('3d', 'triposr-image-to-3d')!;

    expect(() =>
      validateRecipeInputs(plan, ['https://cdn.example/model-input.png'])
    ).not.toThrow();

    expect(() => validateRecipeInputs(plan, [])).toThrow('requiere exactamente');
    expect(() =>
      validateRecipeInputs(plan, [
        'https://cdn.example/a.png',
        'https://cdn.example/b.png',
      ])
    ).toThrow('requiere exactamente');

    expect(() =>
      validateRecipeInputs(plan, ['http://cdn.example/input.png'])
    ).toThrow('HTTPS');

    expect(() =>
      validateRecipeInputs(plan, ['https://127.0.0.1/private.png'])
    ).toThrow('pública');
  });
});
