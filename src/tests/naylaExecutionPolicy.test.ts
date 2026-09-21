import { describe, expect, it } from 'vitest';
import { canStartGpuCompute, getNaylaExecutionPolicyPrompt } from '../lib/naylaExecutionPolicy';

describe('Nayla Cloud-first execution policy', () => {
  it('does not allow GPU rental in Cloud or Auto modes', () => {
    expect(canStartGpuCompute('cloud')).toBe(false);
    expect(canStartGpuCompute('auto')).toBe(false);
  });

  it('allows GPU jobs only in Potencia mode', () => {
    expect(canStartGpuCompute('compute')).toBe(true);
  });

  it('tells Cloud to prefer the editor before GPU', () => {
    const prompt = getNaylaExecutionPolicyPrompt('cloud');
    expect(prompt).toContain('Prioridad absoluta');
    expect(prompt).toContain('No emitas RUN_GPU_JOB');
  });
});
