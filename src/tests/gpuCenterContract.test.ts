import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('GPU center contract', () => {
  it('mounts a dedicated toolbar launcher before Settings', () => {
    const source = read('src/components/GpuCenterLauncher.tsx');
    expect(source).toContain('button.main-btn[title="AJUSTES"]');
    expect(source).toContain('toolbar.insertBefore(slot, settings || null)');
    expect(source).toContain('CENTRO GPU');
    expect(source).toContain('activeCount');
  });

  it('loads active and historical jobs for the signed-in user', () => {
    const source = read('src/pages/api/gpu/overview.ts');
    expect(source).toContain('requireFirebaseUser');
    expect(source).toContain('listGpuJobsForUser');
    expect(source).toContain('activeCount');
    expect(source).toContain('historyCost');
    expect(source).toContain('currentCostEstimate');
  });

  it('keeps destructive actions behind the existing confirmed cancel endpoint', () => {
    const source = read('src/components/GpuCenter.tsx');
    expect(source).toContain("'/api/gpu/jobs/cancel'");
    expect(source).toContain('confirmDestroy: true');
    expect(source).toContain('window.confirm');
  });
});

describe('TripoSR full-body quality defaults', () => {
  it('adds extra subject margin and increases mesh resolution without requiring a stronger GPU', () => {
    const worker = read('gpu-workers/triposr/run-job.sh');
    expect(worker).toContain('QUALITY_MODE');
    expect(worker).toContain('FOREGROUND_RATIO="0.72"');
    expect(worker).toContain('MC_RESOLUTION="384"');
    expect(worker).toContain('--foreground-ratio "$FOREGROUND_RATIO"');
    expect(worker).toContain('--mc-resolution "$MC_RESOLUTION"');
    expect(worker).toContain('Preparando cuerpo completo');
  });
});
