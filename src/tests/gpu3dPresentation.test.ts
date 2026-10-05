import { describe, expect, it } from 'vitest';
import { getGpu3DWorkflow, shouldOpen3DStudioOnCompletion } from '../lib/gpu/gpu3dPresentation';

describe('GPU 3D workflow presentation', () => {
  it('shows machine setup as active while the provider is booting', () => {
    const workflow = getGpu3DWorkflow('booting');

    expect(workflow.activeStepIndex).toBe(0);
    expect(workflow.steps[0].state).toBe('active');
    expect(workflow.percent).toBe(6);
  });

  it('maps worker progress to the real mesh, appearance, and vault stages', () => {
    expect(getGpu3DWorkflow('running', 48).steps[2].state).toBe('active');
    expect(getGpu3DWorkflow('running', 78).steps[3].state).toBe('active');
    expect(getGpu3DWorkflow('running', 90).steps[4].state).toBe('active');
  });

  it('marks all stages complete only after the job completes', () => {
    const workflow = getGpu3DWorkflow('completed', 100);

    expect(workflow.completed).toBe(true);
    expect(workflow.steps.every((step) => step.state === 'complete')).toBe(true);
  });

  it('opens the shared studio only after a completed result is available', () => {
    expect(shouldOpen3DStudioOnCompletion('completed', true, true)).toBe(true);
    expect(shouldOpen3DStudioOnCompletion('running', true, true)).toBe(false);
    expect(shouldOpen3DStudioOnCompletion('completed', false, true)).toBe(false);
    expect(shouldOpen3DStudioOnCompletion('completed', true, false)).toBe(false);
  });
});
