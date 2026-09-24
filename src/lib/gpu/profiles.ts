export type GpuWorkload = 'probe' | 'image' | 'video' | 'audio' | '3d';

export type GpuProfile = {
  workload: GpuWorkload;
  minGpuRamGb: number;
  minCpuRamGb?: number;
  backends?: Array<'vast' | 'runpod' | 'vultr'>;
  diskGb: number;
  maxHourlyUsd: number;
  maxRuntimeMinutes: number;
  outputExtension?: 'png' | 'mp4' | 'wav' | 'glb';
  outputContentType?: string;
  workerImage?: string;
};

export type GpuBudgetPolicy = {
  maxJobUsd: number;
  minBalanceReserveUsd: number;
  maxConcurrentJobs: number;
  offerReliabilityMin: number;
  safetyMultiplier: number;
  bootGraceMinutes: number;
};

const envNumber = (
  key: string,
  fallback: number,
  min: number,
  max: number
): number => {
  const raw = process.env[key];
  const parsed = raw ? Number(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

export const getGpuBudgetPolicy = (): GpuBudgetPolicy => ({
  // Con un saldo pequeño preferimos varias pruebas cortas a una sola máquina olvidada.
  maxJobUsd: envNumber('VAST_MAX_JOB_USD', 0.40, 0.02, 5),
  minBalanceReserveUsd: envNumber('VAST_MIN_BALANCE_USD', 1.0, 0, 100),
  maxConcurrentJobs: Math.floor(envNumber('VAST_MAX_CONCURRENT_JOBS', 1, 1, 4)),
  offerReliabilityMin: envNumber('VAST_MIN_RELIABILITY', 0.95, 0.8, 1),
  safetyMultiplier: envNumber('VAST_COST_SAFETY_MULTIPLIER', 1.25, 1, 2),
  bootGraceMinutes: Math.floor(envNumber('VAST_BOOT_GRACE_MINUTES', 8, 2, 20)),
});

const configuredWorkerImage = (workload: Exclude<GpuWorkload, 'probe'>): string | undefined => {
  const specificKey: Record<Exclude<GpuWorkload, 'probe'>, string> = {
    image: 'VAST_IMAGE_WORKER_IMAGE',
    video: 'VAST_VIDEO_WORKER_IMAGE',
    audio: 'VAST_AUDIO_WORKER_IMAGE',
    '3d': 'VAST_3D_WORKER_IMAGE',
  };
  return process.env[specificKey[workload]]?.trim() || process.env.VAST_GPU_WORKER_IMAGE?.trim() || undefined;
};

export const getGpuProfile = (workload: GpuWorkload): GpuProfile => {
  const globalHourlyCap = envNumber('VAST_MAX_HOURLY_USD', 0.60, 0.05, 10);

  const profiles: Record<GpuWorkload, GpuProfile> = {
    probe: {
      workload: 'probe',
      minGpuRamGb: 8,
      diskGb: 10,
      maxHourlyUsd: Math.min(globalHourlyCap, 0.25),
      maxRuntimeMinutes: 5,
      workerImage: 'pytorch/pytorch:2.4.0-cuda12.4-cudnn9-runtime',
    },
    image: {
      workload: 'image',
      minGpuRamGb: 12,
      diskGb: 30,
      maxHourlyUsd: Math.min(globalHourlyCap, 0.35),
      maxRuntimeMinutes: 15,
      outputExtension: 'png',
      outputContentType: 'image/png',
      workerImage: configuredWorkerImage('image'),
    },
    audio: {
      workload: 'audio',
      minGpuRamGb: 8,
      diskGb: 25,
      maxHourlyUsd: Math.min(globalHourlyCap, 0.30),
      maxRuntimeMinutes: 15,
      outputExtension: 'wav',
      outputContentType: 'audio/wav',
      workerImage: configuredWorkerImage('audio'),
    },
    video: {
      workload: 'video',
      minGpuRamGb: 24,
      diskGb: 60,
      maxHourlyUsd: Math.min(globalHourlyCap, 0.60),
      maxRuntimeMinutes: 30,
      outputExtension: 'mp4',
      outputContentType: 'video/mp4',
      workerImage: configuredWorkerImage('video'),
    },
    '3d': {
      workload: '3d',
      minGpuRamGb: 24,
      diskGb: 50,
      maxHourlyUsd: Math.min(globalHourlyCap, 0.60),
      maxRuntimeMinutes: 30,
      outputExtension: 'glb',
      outputContentType: 'model/gltf-binary',
      workerImage: configuredWorkerImage('3d'),
    },
  };

  return profiles[workload];
};

export const estimatedWorstCaseCost = (
  hourlyPrice: number,
  runtimeMinutes: number,
  safetyMultiplier: number
): number => {
  const raw = hourlyPrice * (runtimeMinutes / 60) * safetyMultiplier;
  return Math.ceil(raw * 10_000) / 10_000;
};
