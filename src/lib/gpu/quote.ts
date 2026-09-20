import { countActiveGpuJobs } from './jobStore';
import { resolveGpuExecutionPlan, type GpuExecutionInput } from './planner';
import {
  estimatedWorstCaseCost,
  getGpuBudgetPolicy,
} from './profiles';
import {
  getVastAccountSummary,
  searchVastOffers,
} from './vastApi';
import {
  sanitizeNaylaPublicText,
  toNaylaComputeEstimatedPrice,
  toNaylaComputeHourlyPrice,
} from '../naylaSystemCatalog';

export type VastGpuQuote = {
  provider: 'nayla-compute';
  workload: GpuExecutionInput['workload'];
  recipe?: string;
  available: boolean;
  reason?: string;
  gpuName?: string;
  gpuRamGb?: number;
  hourlyPrice?: number;
  estimatedMaxCost?: number;
  maxRuntimeMinutes: number;
  bootGraceMinutes: number;
  pricingStatus: 'preview';
  energy: {
    enabled: false;
    balanceUsd: null;
    status: 'coming_soon';
  };
};

export const quoteVastGpuJob = async (
  input: GpuExecutionInput
): Promise<VastGpuQuote> => {
  const { profile, recipePlan, workerImage } = resolveGpuExecutionPlan(input);
  const policy = getGpuBudgetPolicy();

  const base: VastGpuQuote = {
    provider: 'nayla-compute',
    workload: input.workload,
    recipe: input.recipe,
    available: false,
    maxRuntimeMinutes: profile.maxRuntimeMinutes,
    bootGraceMinutes: policy.bootGraceMinutes,
    pricingStatus: 'preview',
    energy: {
      enabled: false,
      balanceUsd: null,
      status: 'coming_soon',
    },
  };

  if (!workerImage) {
    return {
      ...base,
      reason:
        'Esta capacidad todavía no tiene un worker GPU compatible configurado.',
    };
  }

  const activeJobs = await countActiveGpuJobs();
  if (activeJobs >= policy.maxConcurrentJobs) {
    return {
      ...base,
      reason:
        'Ya existe un trabajo GPU activo. Nayla espera a que termine para proteger el saldo.',
    };
  }

  const [account, offers] = await Promise.all([
    getVastAccountSummary(),
    searchVastOffers(profile, policy.offerReliabilityMin),
  ]);

  const offer = offers[0];
  if (!offer) {
    return {
      ...base,
      reason:
        'No hay una GPU verificada disponible dentro del límite de precio actual.',
    };
  }

  const hourlyPrice = Number(offer.dph_total);
  const estimatedMaxCost = estimatedWorstCaseCost(
    hourlyPrice,
    profile.maxRuntimeMinutes + policy.bootGraceMinutes,
    policy.safetyMultiplier
  );

  const gpuRamMb = Number(offer.gpu_ram);
  const gpuRamGb = Number.isFinite(gpuRamMb)
    ? Math.round((gpuRamMb / 1000) * 10) / 10
    : undefined;

  if (estimatedMaxCost > policy.maxJobUsd) {
    return {
      ...base,
      gpuName:
        typeof offer.gpu_name === 'string' ? offer.gpu_name : undefined,
      gpuRamGb,
      hourlyPrice: toNaylaComputeHourlyPrice(hourlyPrice),
      estimatedMaxCost: toNaylaComputeEstimatedPrice(estimatedMaxCost),
      reason:
        'La GPU disponible supera el tope máximo permitido para este trabajo.',
    };
  }

  if (account.balance - estimatedMaxCost < policy.minBalanceReserveUsd) {
    return {
      ...base,
      gpuName:
        typeof offer.gpu_name === 'string' ? offer.gpu_name : undefined,
      gpuRamGb,
      hourlyPrice: toNaylaComputeHourlyPrice(hourlyPrice),
      estimatedMaxCost: toNaylaComputeEstimatedPrice(estimatedMaxCost),
      reason:
        'El trabajo podría reducir el crédito por debajo de la reserva protegida.',
    };
  }

  return {
    ...base,
    available: true,
    gpuName:
      typeof offer.gpu_name === 'string' ? offer.gpu_name : undefined,
    gpuRamGb,
    hourlyPrice: toNaylaComputeHourlyPrice(hourlyPrice),
    estimatedMaxCost: toNaylaComputeEstimatedPrice(estimatedMaxCost),
    reason: recipePlan
      ? sanitizeNaylaPublicText(recipePlan.label)
      : undefined,
  };
};
