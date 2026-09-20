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
import {
  createComputeSelectionId,
  findOfferByComputeSelectionId,
} from './selection';

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
  selectedSelectionId?: string;
  cards?: Array<{
    selectionId: string;
    gpuName: string;
    gpuRamGb?: number;
    hourlyPrice: number;
    estimatedMaxCost: number;
    recommended: boolean;
    selected: boolean;
  }>;
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
  input: GpuExecutionInput,
  requestedSelectionId?: string
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

  const quoteRuntimeMinutes = profile.maxRuntimeMinutes + policy.bootGraceMinutes;
  const selectedOffer = findOfferByComputeSelectionId(offers, requestedSelectionId);
  if (requestedSelectionId && !selectedOffer) {
    return {
      ...base,
      cards: offers.map((candidate, index) => {
        const candidateHourly = Number(candidate.dph_total);
        const candidateRamMb = Number(candidate.gpu_ram);
        const internalCandidateMax = estimatedWorstCaseCost(
          candidateHourly,
          quoteRuntimeMinutes,
          policy.safetyMultiplier
        );
        return {
          selectionId: createComputeSelectionId(candidate),
          gpuName:
            typeof candidate.gpu_name === 'string' && candidate.gpu_name.trim()
              ? candidate.gpu_name.trim()
              : 'GPU',
          gpuRamGb: Number.isFinite(candidateRamMb)
            ? Math.round((candidateRamMb / 1000) * 10) / 10
            : undefined,
          hourlyPrice: toNaylaComputeHourlyPrice(candidateHourly),
          estimatedMaxCost: toNaylaComputeEstimatedPrice(
            internalCandidateMax,
            quoteRuntimeMinutes
          ),
          recommended: index === 0,
          selected: false,
        };
      }),
      reason:
        'La tarjeta seleccionada ya no está disponible. Elige otra de la lista actualizada.',
    };
  }

  const offer = selectedOffer || offers[0] || null;
  const selectedSelectionId = offer ? createComputeSelectionId(offer) : undefined;
  const cards = offers.map((candidate, index) => {
    const candidateHourly = Number(candidate.dph_total);
    const candidateRamMb = Number(candidate.gpu_ram);
    const internalCandidateMax = estimatedWorstCaseCost(
      candidateHourly,
      quoteRuntimeMinutes,
      policy.safetyMultiplier
    );
    const selectionId = createComputeSelectionId(candidate);
    return {
      selectionId,
      gpuName:
        typeof candidate.gpu_name === 'string' && candidate.gpu_name.trim()
          ? candidate.gpu_name.trim()
          : 'GPU',
      gpuRamGb: Number.isFinite(candidateRamMb)
        ? Math.round((candidateRamMb / 1000) * 10) / 10
        : undefined,
      hourlyPrice: toNaylaComputeHourlyPrice(candidateHourly),
      estimatedMaxCost: toNaylaComputeEstimatedPrice(
        internalCandidateMax,
        quoteRuntimeMinutes
      ),
      recommended: index === 0,
      selected: selectionId === selectedSelectionId,
    };
  });

  if (!offer) {
    return {
      ...base,
      cards: [],
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
      selectedSelectionId,
      cards,
      hourlyPrice: toNaylaComputeHourlyPrice(hourlyPrice),
      estimatedMaxCost: toNaylaComputeEstimatedPrice(estimatedMaxCost, quoteRuntimeMinutes),
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
      selectedSelectionId,
      cards,
      hourlyPrice: toNaylaComputeHourlyPrice(hourlyPrice),
      estimatedMaxCost: toNaylaComputeEstimatedPrice(estimatedMaxCost, quoteRuntimeMinutes),
      reason:
        'El trabajo no está disponible dentro de los límites protegidos de Nayla Compute.',
    };
  }

  return {
    ...base,
    available: true,
    gpuName:
      typeof offer.gpu_name === 'string' ? offer.gpu_name : undefined,
    gpuRamGb,
    selectedSelectionId,
    cards,
    hourlyPrice: toNaylaComputeHourlyPrice(hourlyPrice),
    estimatedMaxCost: toNaylaComputeEstimatedPrice(estimatedMaxCost, quoteRuntimeMinutes),
    reason: recipePlan
      ? sanitizeNaylaPublicText(recipePlan.label)
      : undefined,
  };
};
