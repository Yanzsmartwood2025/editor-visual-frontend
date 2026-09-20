import { countActiveGpuJobs } from './jobStore';
import { resolveGpuExecutionPlan, type GpuExecutionInput } from './planner';
import {
  estimatedWorstCaseCost,
  getGpuBudgetPolicy,
} from './profiles';
import {
  getComputeCatalog,
  type ComputeCandidate,
} from './computeCatalog';
import {
  createComputeTargetSelectionId,
  findComputeTargetBySelectionId,
} from './selection';
import {
  sanitizeNaylaPublicText,
  toNaylaComputeEstimatedPrice,
  toNaylaComputeHourlyPrice,
} from '../naylaSystemCatalog';

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

export type ComputeGpuQuote = {
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

// Compatibility type for existing imports.
export type VastGpuQuote = ComputeGpuQuote;

type EvaluatedCandidate = ComputeCandidate & {
  selectionId: string;
  internalEstimatedMaxCost: number;
  publicHourlyPrice: number;
  publicEstimatedMaxCost: number;
  available: boolean;
  unavailableReason?: string;
};

export const quoteComputeGpuJob = async (
  input: GpuExecutionInput,
  requestedSelectionId?: string
): Promise<ComputeGpuQuote> => {
  const { profile, recipePlan, workerImage } = resolveGpuExecutionPlan(input);
  const policy = getGpuBudgetPolicy();

  const base: ComputeGpuQuote = {
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

  const catalog = await getComputeCatalog({
    profile,
    minReliability: policy.offerReliabilityMin,
  });

  const quoteRuntimeMinutes = profile.maxRuntimeMinutes + policy.bootGraceMinutes;

  const evaluated: EvaluatedCandidate[] = catalog.candidates.map((candidate) => {
    const internalEstimatedMaxCost = estimatedWorstCaseCost(
      candidate.hourlyPrice,
      quoteRuntimeMinutes,
      policy.safetyMultiplier
    );

    let unavailableReason: string | undefined;
    if (candidate.hourlyPrice > profile.maxHourlyUsd) {
      unavailableReason = 'Supera el límite por hora configurado para este tipo de trabajo.';
    } else if (internalEstimatedMaxCost > policy.maxJobUsd) {
      unavailableReason = 'Supera el tope de gasto configurado para un solo trabajo.';
    } else if (
      candidate.balanceUsd - internalEstimatedMaxCost <
      policy.minBalanceReserveUsd
    ) {
      unavailableReason = 'No entra dentro del saldo protegido actual de Nayla Compute.';
    }

    return {
      ...candidate,
      selectionId: createComputeTargetSelectionId(candidate),
      internalEstimatedMaxCost,
      publicHourlyPrice: toNaylaComputeHourlyPrice(candidate.hourlyPrice),
      publicEstimatedMaxCost: toNaylaComputeEstimatedPrice(
        internalEstimatedMaxCost,
        quoteRuntimeMinutes
      ),
      available: !unavailableReason,
      unavailableReason,
    };
  });

  const recommended = evaluated.find((candidate) => candidate.available) || null;
  const requested = requestedSelectionId
    ? findComputeTargetBySelectionId(evaluated, requestedSelectionId)
    : null;

  if (requestedSelectionId && !requested) {
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

  const selected = requested || recommended || evaluated[0] || null;

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
      reason: catalog.errors.length
        ? 'Nayla Compute no pudo obtener tarjetas GPU disponibles de sus redes configuradas.'
        : 'No hay una GPU compatible disponible en este momento.',
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
      reason:
        selected.unavailableReason ||
        'La tarjeta seleccionada no está disponible dentro de los límites actuales.',
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

// Keep the old exported name while callers migrate.
export const quoteVastGpuJob = quoteComputeGpuJob;
