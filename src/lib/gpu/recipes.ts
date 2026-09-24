import { GPU_VIDEO_RECIPE } from './videoContract';
import type { GpuProfile, GpuWorkload } from './profiles';

export type GpuRecipePlan = {
  id: string;
  workload: GpuWorkload;
  label: string;
  workerImage: string;
  profile: GpuProfile;
  bootstrapScript?: string;
  minInputs: number;
  maxInputs: number;
};

const TRIPOSR_IMAGE =
  'pytorch/pytorch:2.4.0-cuda12.4-cudnn9-devel';

const ACE_STEP_IMAGE =
  'ghcr.io/ace-step/ace-step-1.5:0.1.8';

const buildTripoSrBootstrap = () =>
  [
    'set -eu',
    'mkdir -p /opt/nayla',
    'python - <<\'PY\'',
    'import urllib.request',
    'url = "https://raw.githubusercontent.com/Yanzsmartwood2025/editor-visual-frontend/main/gpu-workers/triposr/run-job.sh"',
    'destination = "/opt/nayla/run-job"',
    'with urllib.request.urlopen(url, timeout=30) as response:',
    '    data = response.read()',
    'with open(destination, "wb") as handle:',
    '    handle.write(data)',
    'PY',
    'chmod +x /opt/nayla/run-job',
  ].join('\n');

const buildAceStepBootstrap = () =>
  [
    'set -eu',
    'mkdir -p /opt/nayla',
    'python - <<\'PY\'',
    'import urllib.request',
    'url = "https://raw.githubusercontent.com/Yanzsmartwood2025/editor-visual-frontend/main/gpu-workers/acestep/run-job.sh"',
    'destination = "/opt/nayla/run-job"',
    'with urllib.request.urlopen(url, timeout=30) as response:',
    '    data = response.read()',
    'with open(destination, "wb") as handle:',
    '    handle.write(data)',
    'PY',
    'chmod +x /opt/nayla/run-job',
  ].join('\n');

export const getGpuRecipePlan = (
  workload: GpuWorkload,
  recipe?: string
): GpuRecipePlan | null => {
  if (workload === 'video' && recipe === GPU_VIDEO_RECIPE) {
    const workerImage = 'pytorch/pytorch:2.4.0-cuda12.4-cudnn9-runtime';
    return {
      id: GPU_VIDEO_RECIPE, workload, label: 'Nayla Video · Imagen en movimiento', workerImage,
      profile: { workload, minGpuRamGb: 24, minCpuRamGb: 64, diskGb: 80, maxHourlyUsd: 0.60, maxRuntimeMinutes: 30,
        outputExtension: 'mp4', outputContentType: 'video/mp4', workerImage, backends: ['vast'] },
      minInputs: 1, maxInputs: 1,
      bootstrapScript: [
        'set -eu', 'mkdir -p /opt/nayla',
        "python - <<'PY'",
        'import urllib.request',
        'url = "https://raw.githubusercontent.com/Yanzsmartwood2025/editor-visual-frontend/main/gpu-workers/wan22/run-job.py"',
        'with urllib.request.urlopen(url, timeout=30) as response: data = response.read()',
        'with open("/opt/nayla/run-job", "wb") as handle: handle.write(data)',
        'PY', 'chmod +x /opt/nayla/run-job',
      ].join('\n'),
    };
  }

  if (workload === '3d' && recipe === 'triposr-image-to-3d') {
    return {
      id: 'triposr-image-to-3d',
      workload: '3d',
      label: 'TripoSR Image → 3D',
      workerImage: TRIPOSR_IMAGE,
      profile: {
        workload: '3d',
        minGpuRamGb: 8,
        diskGb: 30,
        maxHourlyUsd: 0.35,
        maxRuntimeMinutes: 25,
        outputExtension: 'glb',
        outputContentType: 'model/gltf-binary',
        workerImage: TRIPOSR_IMAGE,
      },
      bootstrapScript: buildTripoSrBootstrap(),
      minInputs: 1,
      maxInputs: 1,
    };
  }

  if (workload === 'audio' && recipe === 'ace-step-music') {
    return {
      id: 'ace-step-music',
      workload: 'audio',
      label: 'ACE-Step 1.5 Music',
      workerImage: ACE_STEP_IMAGE,
      profile: {
        workload: 'audio',
        minGpuRamGb: 8,
        diskGb: 35,
        maxHourlyUsd: 0.30,
        maxRuntimeMinutes: 25,
        outputExtension: 'wav',
        outputContentType: 'audio/wav',
        workerImage: ACE_STEP_IMAGE,
      },
      bootstrapScript: buildAceStepBootstrap(),
      minInputs: 0,
      maxInputs: 0,
    };
  }

  return null;
};

export const validateRecipeInputs = (
  plan: GpuRecipePlan,
  inputUrls: string[]
) => {
  if (inputUrls.length < plan.minInputs || inputUrls.length > plan.maxInputs) {
    if (plan.minInputs === 0 && plan.maxInputs === 0) {
      throw new Error(plan.label + ' no acepta archivos de entrada.');
    }

    if (plan.minInputs === plan.maxInputs) {
      throw new Error(
        plan.label +
          ' requiere exactamente ' +
          plan.minInputs +
          (plan.minInputs === 1 ? ' archivo de entrada.' : ' archivos de entrada.')
      );
    }

    throw new Error(
      plan.label +
        ' requiere entre ' +
        plan.minInputs +
        ' y ' +
        plan.maxInputs +
        ' archivos de entrada.'
    );
  }

  for (const value of inputUrls) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error('La entrada GPU no es una URL válida.');
    }

    if (parsed.protocol !== 'https:') {
      throw new Error('Las entradas GPU deben usar HTTPS.');
    }

    const host = parsed.hostname.toLowerCase();
    const match172 = host.match(/^172\.(\d{1,3})\./);
    const isPrivate172 = match172
      ? Number(match172[1]) >= 16 && Number(match172[1]) <= 31
      : false;

    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      isPrivate172
    ) {
      throw new Error('La entrada GPU debe ser una URL pública.');
    }
  }
};

export const buildRecipeBootstrap = (plan: GpuRecipePlan) =>
  plan.bootstrapScript || '';
