import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const worker = fs.readFileSync(path.join(root, 'gpu-workers/triposr/run-job.sh'), 'utf8');

describe('TripoSR worker runtime', () => {
  it('installs an ONNX Runtime backend before importing rembg', () => {
    expect(worker).toContain('python -m pip install --no-cache-dir onnxruntime');
    expect(worker.indexOf('python -m pip install --no-cache-dir onnxruntime')).toBeLessThan(
      worker.indexOf('report_progress 36 "Cargando el modelo de reconstrucción"')
    );
  });

  it('captures a TripoSR failure and reports a short diagnostic in progress', () => {
    expect(worker).toContain('triposr-run.log');
    expect(worker).toContain('triposr-run-diagnostic.txt');
    expect(worker).toContain('TRIPOSR_SHORT_ERROR=');
    expect(worker).toContain('report_progress 48 "Fallo TripoSR · $TRIPOSR_SHORT_ERROR"');
  });
});
