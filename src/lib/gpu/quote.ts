import { countActiveGpuJobs } from './jobStore';
import { resolveGpuExecutionPlan, type GpuExecutionInput } from './planner';
import {
  estimatedWorstCaseCost,
  getGpuBudgetPolicy,
} from './profiles';
import {
  getVastAccountSummary,
  searchVastOffers,
  type VastOffer,
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

export type NaylaComputeCard = {
  selectionId: string;
  gpuName: string;
  gpuRamGb?: number;
  hourlyPrice: number;
  estimatedMaxCost: number;
  available: boolean;
  unavailableReason?: string;
  recommended: boolean;
  selected: boolean;
};

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
  cards?: NaylaComputeCard[];
  maxRuntimeMinutes: number;
  bootGraceMinutes: number;
  pricingStatus: 'preview';
  energy: {
    enabled: false;
    balanceUsd: null;
    status: 'coming_soon';
  };
};

type EvaluatedOffer = {
  offer: VastOffer;
  selectionId: string;
  gpuName: string;
  gpuRamGb?: number;
  internalHourlyPrice: number;
  internalEstimatedMaxCost: number;
  publicHourlyPrice: number;
  publicEstimatedMaxCost: number;
  available: boolean;
  unavailableReason?: string;
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
      reason: 'Esta capacidad todavía no tiene un worker GPU compatible configurado.',
    };
  }

  const activeJobs = await countActiveGpuJobs();
  if (activeJobs >= policy.maxConcurrentJobs) {
    return {
      ...base,
      reason: 'Ya existe un trabajo GPU activo. Nayla espera a que termine antes de reservar otra tarjeta.',
    };
  }

  const [account, offers] = await Promise.all([
    getVastAccountSummary(),
    searchVastOffers(profile, policy.offerReliabilityMin),
  ]);

  const quoteRuntimeMinutes = profile.maxRuntimeMinutes + policy.bootGraceMinutes;

  const evaluated: EvaluatedOffer[] = offers.map((offer) => {
    const internalHourlyPrice = Number(offer.dph_total);
    const internalEstimatedMaxCost = estimatedWorstCaseCost(
      internalHourlyPrice,
      quoteRuntimeMinutes,
      policy.safetyMultiplier
    );

    const gpuRamMb = Number(offer.gpu_ram);
    const gpuRamGb = Number.isFinite(gpuRamMb)
      ? Math.round((gpuRamMb / 1000) * 10) / 10
      : undefined;

    let unavailableReason: string | undefined;
    if (internalHourlyPrice > profile.maxHourlyUsd) {
      unavailableReason = 'Supera el límite por hora configurado para este tipo de trabajo.';
    } else if (internalEstimatedMaxCost > policy.maxJobUsd) {
      unavailableReason = 'Supera el tope de gasto configurado para un solo trabajo.';
    } else if (account.balance - internalEstimatedMaxCost < policy.minBalanceReserveUsd) {
      unavailableReason = 'No entra dentro del saldo protegido actual de Nayla Compute.';
    }

    return {
      offer,
      selectionId: createComputeSelectionId(offer),
      gpuName:
        typeof offer.gpu_name === 'string' && offer.gpu_name.trim()
          ? offer.gpu_name.trim()
          : 'GPU',
      gpuRamGb,
      internalHourlyPrice,
      internalEstimatedMaxCost,
      publicHourlyPrice: toNaylaComputeHourlyPrice(internalHourlyPrice),
      publicEstimatedMaxCost: toNaylaComputeEstimatedPrice(
        internalEstimatedMaxCost,
        quoteRuntimeMinutes
      ),
      available: !unavailableReason,
      unavailableReason,
    };
  });

  const recommended = evaluated.find((candidate) => candidate.available) || null;
  const requestedOffer = requestedSelectionId
    ? findOfferByComputeSelectionId(offers, requestedSelectionId)
    : null;

  if (requestedSelectionId && !requestedOffer) {
    return {
      ...base,
      cards: evaluated.map((candidate) => ({
        selectionId: candidate.selectionId,
        gpuName: candidate.gpuName,
        gpuRamGb: candidate.gpuRamGb,
        hourlyPrice: candidate.publicHourlyPrice,
        estimatedMaxCost: candidate.publicEstimatedMaxCost,
        available: candidate.available,
        unavailableReason: candidate.unavailableReason,
        recommended: candidate.selectionId === recommended?.selectionId,
        selected: false,
      })),
      reason: 'La tarjeta seleccionada ya no está disponible. Elige otra de la lista actualizada.',
    };
  }

  const selected =
    (requestedOffer
      ? evaluated.find((candidate) => Number(candidate.offer.id) === Number(requestedOffer.id))
      : null) ||
    recommended ||
    evaluated[0] ||
    null;

  const cards: NaylaComputeCard[] = evaluated.map((candidate) => ({
    selectionId: candidate.selectionId,
    gpuName: candidate.gpuName,
    gpuRamGb: candidate.gpuRamGb,
    hourlyPrice: candidate.publicHourlyPrice,
    estimatedMaxCost: candidate.publicEstimatedMaxCost,
    available: candidate.available,
    unavailableReason: candidate.unavailableReason,
    recommended: candidate.selectionId === recommended?.selectionId,
    selected: candidate.selectionId === selected?.selectionId,
  }));

  if (!selected) {
    return {
      ...base,
      cards: [],
      reason: 'No hay una GPU compatible disponible en este momento.',
    };
  }

  if (!selected.available) {
    return {
      ...base,
      gpuName: selected.gpuName,
      gpuRamGb: selected.gpuRamGb,
      selectedSelectionId: selected.selectionId,
      cards,
      hourlyPrice: selected.publicHourlyPrice,
      estimatedMaxCost: selected.publicEstimatedMaxCost,
      reason: selected.unavailableReason || 'La tarjeta seleccionada no está disponible dentro de los límites actuales.',
    };
  }

  return {
    ...base,
    available: true,
    gpuName: selected.gpuName,
    gpuRamGb: selected.gpuRamGb,
    selectedSelectionId: selected.selectionId,
    cards,
    hourlyPrice: selected.publicHourlyPrice,
    estimatedMaxCost: selected.publicEstimatedMaxCost,
    reason: recipePlan ? sanitizeNaylaPublicText(recipePlan.label) : undefined,
  };
};
