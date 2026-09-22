import { getComputeCatalog, type ComputeCandidate } from '../gpu/computeCatalog';
import { getGpuBudgetPolicy, type GpuProfile } from '../gpu/profiles';

export type NaylaPlayGpuCard = {
  id: string;
  gpuName: string;
  gpuRamGb?: number;
  region?: string;
  hourlyPrice: number;
  available: boolean;
  recommended: boolean;
  performance: 'AAA' | 'AAA+';
  billingMinimumMinutes?: number;
  includedStorageGb?: number;
  includedBandwidthGb?: number;
};

export type NaylaPlayQuote = {
  ready: boolean;
  cards: NaylaPlayGpuCard[];
  networksConfigured: number;
  networksReachable: number;
  generatedAt: string;
  pricing: {
    status: 'preview';
    marginUsdPerHour: number;
    note: string;
  };
};

const envNumber = (
  key: string,
  fallback: number,
  min: number,
  max: number
) => {
  const raw = process.env[key];
  const value = raw ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

export const getNaylaPlayMarginUsd = () =>
  envNumber('NAYLA_PLAY_MARGIN_USD', 0.35, 0, 10);

export const getNaylaPlayProfile = (): GpuProfile => ({
  // Solo se usa para descubrir capacidad. PLAY no ejecuta el worker de video.
  workload: 'video',
  minGpuRamGb: envNumber('NAYLA_PLAY_MIN_VRAM_GB', 16, 8, 96),
  diskGb: envNumber('NAYLA_PLAY_MIN_DISK_GB', 100, 20, 1000),
  maxHourlyUsd: envNumber('NAYLA_PLAY_MAX_INTERNAL_HOURLY_USD', 3, 0.1, 20),
  maxRuntimeMinutes: 60,
});

const configuredNetworks = () =>
  [
    process.env.VAST_API_KEY?.trim(),
    process.env.RUNPOD_API_KEY?.trim(),
    process.env.VULTR_API_KEY?.trim(),
  ].filter(Boolean).length;

const networkKey = (candidate: ComputeCandidate) => candidate.backend;

const candidateRegion = (candidate: ComputeCandidate) => {
  if (candidate.regionLabel) return candidate.regionLabel;

  const raw = candidate.raw as Record<string, unknown>;
  for (const key of ['geolocation', 'location', 'datacenter', 'country', 'region']) {
    const value = raw?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return undefined;
};

const publicHourlyPrice = (internalHourlyPrice: number) => {
  const margin = getNaylaPlayMarginUsd();
  return Math.ceil((internalHourlyPrice + margin) * 1000) / 1000;
};

const performanceClass = (gpuRamGb?: number): 'AAA' | 'AAA+' =>
  Number(gpuRamGb || 0) >= 24 ? 'AAA+' : 'AAA';

export const quoteNaylaPlay = async (): Promise<NaylaPlayQuote> => {
  const profile = getNaylaPlayProfile();
  const policy = getGpuBudgetPolicy();
  const catalog = await getComputeCatalog({
    profile,
    minReliability: policy.offerReliabilityMin,
  });

  const maxInternal = profile.maxHourlyUsd;
  const usable = catalog.candidates
    .filter((candidate) => candidate.hourlyPrice <= maxInternal)
    .filter((candidate) => {
      const minimumHours = Math.max(1, Number(candidate.billingMinimumMinutes || 0) / 60);
      const reserve = candidate.hourlyPrice * minimumHours;
      return candidate.balanceUsd >= reserve;
    });

  const cheapest = usable[0] || null;

  const cards: NaylaPlayGpuCard[] = usable.slice(0, 40).map((candidate) => ({
    id: [
      candidate.backend,
      candidate.backendId,
      candidate.hourlyPrice.toFixed(8),
    ].join(':'),
    gpuName: candidate.gpuName,
    gpuRamGb: candidate.gpuRamGb,
    region: candidateRegion(candidate),
    hourlyPrice: publicHourlyPrice(candidate.hourlyPrice),
    available: true,
    recommended:
      Boolean(cheapest) &&
      candidate.backend === cheapest.backend &&
      candidate.backendId === cheapest.backendId,
    performance: performanceClass(candidate.gpuRamGb),
    billingMinimumMinutes: candidate.billingMinimumMinutes,
    includedStorageGb: candidate.includedStorageGb,
    includedBandwidthGb: candidate.includedBandwidthGb,
  }));

  const reachableNetworks = new Set(
    usable.map(networkKey)
  ).size;

  return {
    ready: cards.length > 0,
    cards,
    networksConfigured: configuredNetworks(),
    networksReachable: reachableNetworks,
    generatedAt: new Date().toISOString(),
    pricing: {
      status: 'preview',
      marginUsdPerHour: getNaylaPlayMarginUsd(),
      note:
        'Precio preliminar de Nayla Play. Antes de activar sesiones se añadirá el coste real de streaming/red cuando corresponda.',
    },
  };
};

export const getNaylaPlayHealth = async () => {
  const profile = getNaylaPlayProfile();
  const policy = getGpuBudgetPolicy();
  const catalog = await getComputeCatalog({
    profile,
    minReliability: policy.offerReliabilityMin,
  });

  const reachable = new Set(catalog.candidates.map(networkKey)).size;

  return {
    ready: catalog.candidates.length > 0,
    networksConfigured: configuredNetworks(),
    networksReachable: reachable,
    offers: catalog.candidates.length,
    errors: catalog.errors.length,
  };
};
