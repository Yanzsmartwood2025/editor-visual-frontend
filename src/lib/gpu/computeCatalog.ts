import type { GpuProfile } from './profiles';
import {
  getVastAccountSummary,
  searchVastOffers,
  type VastOffer,
} from './vastApi';
import {
  getRunpodAccountSummary,
  isRunpodConfigured,
  searchRunpodGpuTypes,
  type RunpodGpuType,
} from './runpodApi';
import type { ComputeSelectionTarget } from './selection';
import {
  getVultrAccountSummary,
  getVultrGpuVramGb,
  isVultrConfigured,
  searchVultrGpuPlans,
  type VultrGpuPlan,
} from './vultrApi';

export type ComputeBackend = 'vast' | 'runpod' | 'vultr';

export type ComputeCandidate = ComputeSelectionTarget & {
  backend: ComputeBackend;
  backendId: string;
  gpuName: string;
  gpuRamGb?: number;
  hourlyPrice: number;
  balanceUsd: number;
  raw: VastOffer | RunpodGpuType | VultrGpuPlan;
  regionId?: string;
  regionLabel?: string;
  billingMinimumMinutes?: number;
  includedStorageGb?: number;
  includedBandwidthGb?: number;
  linkSpeedMbps?: number;
};

export type ComputeCatalog = {
  candidates: ComputeCandidate[];
  errors: string[];
};

const isVastConfigured = () => Boolean(process.env.VAST_API_KEY?.trim());

const loadVastCandidates = async (
  profile: GpuProfile,
  minReliability: number
): Promise<ComputeCandidate[]> => {
  if (!isVastConfigured()) return [];
  const [account, offers] = await Promise.all([
    getVastAccountSummary(),
    searchVastOffers(profile, minReliability),
  ]);

  return offers.map((offer) => ({
    backend: 'vast' as const,
    backendId: String(offer.id),
    gpuName:
      typeof offer.gpu_name === 'string' && offer.gpu_name.trim()
        ? offer.gpu_name.trim()
        : 'GPU',
    gpuRamGb: Number.isFinite(Number(offer.gpu_ram))
      ? Math.round((Number(offer.gpu_ram) / 1000) * 10) / 10
      : undefined,
    hourlyPrice: Number(offer.dph_total),
    balanceUsd: account.balance,
    raw: offer,
  }));
};

const loadRunpodCandidates = async (
  profile: GpuProfile
): Promise<ComputeCandidate[]> => {
  if (!isRunpodConfigured()) return [];
  const [account, gpuTypes] = await Promise.all([
    getRunpodAccountSummary(),
    searchRunpodGpuTypes(profile),
  ]);

  return gpuTypes.map((gpu) => ({
    backend: 'runpod' as const,
    backendId: gpu.id,
    gpuName:
      gpu.displayName?.trim() ||
      gpu.lowestPrice?.gpuName?.trim() ||
      'GPU',
    gpuRamGb: Number.isFinite(Number(gpu.memoryInGb))
      ? Number(gpu.memoryInGb)
      : undefined,
    hourlyPrice: Number(gpu.lowestPrice?.uninterruptablePrice),
    balanceUsd: account.balance,
    raw: gpu,
  }));
};

const loadVultrCandidates = async (
  profile: GpuProfile
): Promise<ComputeCandidate[]> => {
  if (!isVultrConfigured()) return [];

  const [account, options] = await Promise.all([
    getVultrAccountSummary(),
    searchVultrGpuPlans(profile),
  ]);

  return options.map(({ plan, region, hourlyPrice }) => ({
    backend: 'vultr' as const,
    backendId: plan.id + '@' + region.id,
    gpuName:
      String(plan.gpu_type || '').trim() ||
      'GPU',
    gpuRamGb: getVultrGpuVramGb(plan),
    hourlyPrice,
    balanceUsd: account.balance,
    raw: plan,
    regionId: region.id,
    regionLabel: [region.city, region.country].filter(Boolean).join(', ') || region.id,
    billingMinimumMinutes: 60,
    includedStorageGb: Number.isFinite(Number(plan.disk))
      ? Number(plan.disk)
      : undefined,
    includedBandwidthGb: Number.isFinite(Number(plan.bandwidth))
      ? Number(plan.bandwidth)
      : undefined,
    linkSpeedMbps: Number.isFinite(Number(plan.link_speed))
      ? Number(plan.link_speed)
      : undefined,
  }));
};

export const getComputeCatalog = async ({
  profile,
  minReliability,
}: {
  profile: GpuProfile;
  minReliability: number;
}): Promise<ComputeCatalog> => {
  const loaders: Array<Promise<ComputeCandidate[]>> = [];
  const labels: string[] = [];

  if (isVastConfigured()) {
    loaders.push(loadVastCandidates(profile, minReliability));
    labels.push('network-a');
  }
  if (isRunpodConfigured()) {
    loaders.push(loadRunpodCandidates(profile));
    labels.push('network-b');
  }
  if (isVultrConfigured()) {
    loaders.push(loadVultrCandidates(profile));
    labels.push('network-c');
  }

  if (!loaders.length) {
    return {
      candidates: [],
      errors: ['Nayla Compute no tiene ninguna red GPU configurada.'],
    };
  }

  const settled = await Promise.allSettled(loaders);
  const candidates: ComputeCandidate[] = [];
  const errors: string[] = [];

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      candidates.push(...result.value);
    } else {
      const message =
        result.reason instanceof Error
          ? result.reason.message
          : 'No se pudo consultar una red GPU.';
      errors.push(labels[index] + ': ' + message);
    }
  });

  const unique = new Map<string, ComputeCandidate>();
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate.hourlyPrice) || candidate.hourlyPrice <= 0) continue;
    const key = [
      candidate.backend,
      candidate.backendId,
      candidate.gpuName,
      candidate.hourlyPrice.toFixed(8),
    ].join('|');
    if (!unique.has(key)) unique.set(key, candidate);
  }

  return {
    candidates: [...unique.values()].sort(
      (a, b) =>
        a.hourlyPrice - b.hourlyPrice ||
        Number(b.gpuRamGb || 0) - Number(a.gpuRamGb || 0)
    ),
    errors,
  };
};
