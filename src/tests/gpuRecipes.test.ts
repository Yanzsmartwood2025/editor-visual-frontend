import { describe, expect, it } from 'vitest';
import {
  buildRecipeBootstrap,
  getGpuRecipePlan,
  validateRecipeInputs,
} from '../lib/gpu/recipes';

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
