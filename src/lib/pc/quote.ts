import { createHmac } from 'node:crypto';
import {
  getVultrGpuVramGb,
  isVultrConfigured,
  listVultrOperatingSystems,
  listVultrPlans,
  listVultrRegions,
  type VultrGpuPlan,
  type VultrOperatingSystem,
  type VultrRegion,
} from '../gpu/vultrApi';

export type PcOsFamily = 'linux' | 'windows';
export type PcBillingMode = 'hourly' | 'monthly';

export type NaylaPcRequest = {
  osFamily: PcOsFamily;
  cpu: number;
  ramGb: number;
  diskGb: number;
  gpuEnabled: boolean;
  minGpuVramGb: number;
  billingMode: PcBillingMode;
  durationHours: number;
};

export type NaylaPcCard = {
  id: string;
  cpu: number;
  ramGb: number;
  diskGb: number;
  gpuName?: string;
  gpuVramGb?: number;
  region: string;
  hourlyPrice: number;
  monthlyPrice: number;
  estimatedSessionPrice: number;
  available: boolean;
  recommended: boolean;
  billingCapHours: number;
};

export type NaylaPcQuote = {
  ready: boolean;
  request: NaylaPcRequest;
  cards: NaylaPcCard[];
  generatedAt: string;
  networksConfigured: number;
  networksEligible: number;
  networksReachable: number;
  os: {
    linux: { available: boolean; examples: string[] };
    windows: { available: boolean; examples: string[]; licenseIncluded: false };
  };
  pricing: {
    status: 'preview';
    complete: boolean;
    multiplier: number;
    fixedHourlyUsd: number;
    note: string;
  };
};

export type NaylaPcResolvedSelection = {
  request: NaylaPcRequest;
  card: NaylaPcCard;
  plan: VultrGpuPlan;
  region: VultrRegion;
  os: VultrOperatingSystem;
  providerMonthlyCost: number;
};

type InternalCandidate = {
  card: NaylaPcCard;
  plan: VultrGpuPlan;
  region: VultrRegion;
  providerMonthlyCost: number;
};

const clampNumber = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  step = 1
) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(max, Math.max(min, parsed));
  return Math.round(clamped / step) * step;
};

export const normalizeNaylaPcRequest = (
  input: Partial<NaylaPcRequest> = {}
): NaylaPcRequest => ({
  osFamily: input.osFamily === 'windows' ? 'windows' : 'linux',
  cpu: clampNumber(input.cpu, 2, 1, 64),
  ramGb: clampNumber(input.ramGb, 4, 1, 256),
  diskGb: clampNumber(input.diskGb, 80, 25, 2000, 5),
  gpuEnabled: Boolean(input.gpuEnabled),
  minGpuVramGb: clampNumber(input.minGpuVramGb, 8, 1, 96),
  billingMode: input.billingMode === 'monthly' ? 'monthly' : 'hourly',
  durationHours: clampNumber(input.durationHours, 1, 1, 24),
});

const envNumber = (key: string, fallback: number, min: number, max: number) => {
  const parsed = Number(process.env[key]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const priceMultiplier = () =>
  envNumber('NAYLA_PC_PRICE_MULTIPLIER', 1, 1, 10);

const fixedHourlyUsd = () =>
  envNumber('NAYLA_PC_FIXED_HOURLY_USD', 0, 0, 25);

const roundMoney = (value: number) => Math.ceil(value * 1000) / 1000;

const publicHourlyPrice = (internal: number) =>
  roundMoney(internal * priceMultiplier() + fixedHourlyUsd());

const publicMonthlyPrice = (internalMonthly: number, billingCapHours: number) =>
  roundMoney(
    internalMonthly * priceMultiplier() + fixedHourlyUsd() * billingCapHours
  );

const configuredNetworks = () =>
  [
    process.env.VAST_API_KEY?.trim(),
    process.env.RUNPOD_API_KEY?.trim(),
    process.env.VULTR_API_KEY?.trim(),
  ].filter(Boolean).length;

const secret = () => {
  const value =
    process.env.NAYLA_COMPUTE_SELECTION_SECRET?.trim() ||
    process.env.VULTR_API_KEY?.trim() ||
    process.env.VAST_API_KEY?.trim() ||
    process.env.RUNPOD_API_KEY?.trim();
  if (!value) throw new Error('Nayla PC no tiene configurado el secreto de selección.');
  return value;
};

const selectionId = ({
  planId,
  regionId,
  monthlyCost,
}: {
  planId: string;
  regionId: string;
  monthlyCost: number;
}) =>
  createHmac('sha256', secret())
    .update([planId, regionId, monthlyCost.toFixed(6)].join('|'))
    .digest('base64url');

const ramGb = (plan: VultrGpuPlan) => {
  const mb = Number(plan.ram);
  return Number.isFinite(mb) && mb > 0
    ? Math.round((mb / 1024) * 10) / 10
    : 0;
};

const isGpuPlan = (plan: VultrGpuPlan) => {
  const type = String(plan.type || '').toLowerCase();
  return (
    type === 'vcg' ||
    Boolean(String(plan.gpu_type || '').trim()) ||
    Number(getVultrGpuVramGb(plan) || 0) > 0
  );
};

const isWindowsBlockedPlan = (plan: VultrGpuPlan) => {
  const type = String(plan.type || '').toLowerCase();
  const id = String(plan.id || '').toLowerCase();
  return type === 'vx1' || id.startsWith('vx1');
};

const osFamily = (os: VultrOperatingSystem): PcOsFamily | null => {
  const text = [os.family, os.name].filter(Boolean).join(' ').toLowerCase();
  if (text.includes('windows')) return 'windows';
  if (/ubuntu|debian|fedora|centos|rocky|alma|arch|opensuse|linux/.test(text)) {
    return 'linux';
  }
  return null;
};

const osExamples = (systems: VultrOperatingSystem[], family: PcOsFamily) =>
  Array.from(
    new Set(
      systems
        .filter((os) => osFamily(os) === family)
        .map((os) => String(os.name || '').trim())
        .filter(Boolean)
    )
  ).slice(0, 6);

const chooseOperatingSystem = (
  systems: VultrOperatingSystem[],
  family: PcOsFamily
) => {
  const matching = systems.filter((os) => osFamily(os) === family);
  const x64 = matching.filter((os) => {
    const arch = String(os.arch || '').toLowerCase();
    return !arch || arch.includes('64') || arch.includes('amd');
  });
  const pool = x64.length ? x64 : matching;

  if (family === 'linux') {
    return (
      pool.find((os) => /ubuntu.*26\.04/i.test(String(os.name || ''))) ||
      pool.find((os) => /ubuntu.*24\.04/i.test(String(os.name || ''))) ||
      pool.find((os) => /ubuntu.*22\.04/i.test(String(os.name || ''))) ||
      pool.find((os) => /ubuntu/i.test(String(os.name || ''))) ||
      pool[0]
    );
  }

  return (
    pool.find((os) => /windows.*2025/i.test(String(os.name || ''))) ||
    pool.find((os) => /windows.*2022/i.test(String(os.name || ''))) ||
    pool[0]
  );
};

const loadCatalog = async (rawInput: Partial<NaylaPcRequest>) => {
  const request = normalizeNaylaPcRequest(rawInput);

  const [plans, regions, systems] = await Promise.all([
    listVultrPlans(),
    listVultrRegions(),
    listVultrOperatingSystems(),
  ]);

  const regionById = new Map(regions.map((region) => [region.id, region]));
  const candidates: InternalCandidate[] = [];

  for (const plan of plans) {
    const cpu = Number(plan.vcpu_count);
    const memory = ramGb(plan);
    const disk = Number(plan.disk);
    const providerMonthlyCost = Number(plan.monthly_cost);

    if (!Number.isFinite(cpu) || cpu < request.cpu) continue;
    if (!Number.isFinite(memory) || memory < request.ramGb) continue;
    if (!Number.isFinite(disk) || disk < request.diskGb) continue;
    if (!Number.isFinite(providerMonthlyCost) || providerMonthlyCost <= 0) continue;

    const gpu = isGpuPlan(plan);
    if (request.gpuEnabled) {
      if (!gpu) continue;
      if (Number(getVultrGpuVramGb(plan) || 0) < request.minGpuVramGb) {
        continue;
      }
    } else if (gpu) {
      continue;
    }

    if (request.osFamily === 'windows' && isWindowsBlockedPlan(plan)) continue;
    if (!Array.isArray(plan.locations) || plan.locations.length === 0) continue;

    const billingCapHours = gpu ? 730 : 672;
    const internalHourly = providerMonthlyCost / billingCapHours;
    const hourlyPrice = publicHourlyPrice(internalHourly);
    const monthlyPrice = publicMonthlyPrice(providerMonthlyCost, billingCapHours);

    for (const regionId of plan.locations) {
      const region = regionById.get(regionId);
      if (!region) continue;

      const regionLabel =
        [region.city, region.country].filter(Boolean).join(', ') || regionId;

      candidates.push({
        plan,
        region,
        providerMonthlyCost,
        card: {
          id: selectionId({
            planId: plan.id,
            regionId,
            monthlyCost: providerMonthlyCost,
          }),
          cpu,
          ramGb: memory,
          diskGb: disk,
          gpuName: gpu
            ? String(plan.gpu_type || 'GPU').trim() || 'GPU'
            : undefined,
          gpuVramGb: gpu ? getVultrGpuVramGb(plan) : undefined,
          region: regionLabel,
          hourlyPrice,
          monthlyPrice,
          estimatedSessionPrice: roundMoney(
            hourlyPrice * request.durationHours
          ),
          available: true,
          recommended: false,
          billingCapHours,
        },
      });
    }
  }

  candidates.sort((a, b) => {
    const priceA =
      request.billingMode === 'monthly'
        ? a.card.monthlyPrice
        : a.card.hourlyPrice;
    const priceB =
      request.billingMode === 'monthly'
        ? b.card.monthlyPrice
        : b.card.hourlyPrice;

    return (
      priceA - priceB ||
      a.card.cpu - b.card.cpu ||
      a.card.ramGb - b.card.ramGb ||
      a.card.diskGb - b.card.diskGb
    );
  });

  if (candidates[0]) candidates[0].card.recommended = true;

  return { request, candidates, systems };
};

export const resolveNaylaPcSelection = async ({
  rawInput,
  selectionId: selectedId,
}: {
  rawInput: Partial<NaylaPcRequest>;
  selectionId: string;
}): Promise<NaylaPcResolvedSelection> => {
  if (!isVultrConfigured()) {
    throw new Error('Nayla PC no tiene una red de máquina virtual disponible.');
  }

  const { request, candidates, systems } = await loadCatalog(rawInput);
  const candidate = candidates.find((item) => item.card.id === selectedId);
  if (!candidate) {
    const error = new Error(
      'La oferta seleccionada cambió o dejó de estar disponible. Actualiza la cotización.'
    );
    (error as Error & { code?: string }).code = 'PRICE_CHANGED';
    throw error;
  }

  const os = chooseOperatingSystem(systems, request.osFamily);
  if (!os) {
    throw new Error('No hay una imagen compatible para el sistema operativo elegido.');
  }

  return {
    request,
    card: candidate.card,
    plan: candidate.plan,
    region: candidate.region,
    os,
    providerMonthlyCost: candidate.providerMonthlyCost,
  };
};

export const quoteNaylaPc = async (
  rawInput: Partial<NaylaPcRequest> = {}
): Promise<NaylaPcQuote> => {
  const request = normalizeNaylaPcRequest(rawInput);
  const multiplier = priceMultiplier();
  const fixed = fixedHourlyUsd();

  if (!isVultrConfigured()) {
    return {
      ready: false,
      request,
      cards: [],
      generatedAt: new Date().toISOString(),
      networksConfigured: configuredNetworks(),
      networksEligible: 0,
      networksReachable: 0,
      os: {
        linux: { available: false, examples: [] },
        windows: { available: false, examples: [], licenseIncluded: false },
      },
      pricing: {
        status: 'preview',
        complete: request.osFamily !== 'windows',
        multiplier,
        fixedHourlyUsd: fixed,
        note: 'No hay una red de máquina virtual completa configurada para Nayla PC.',
      },
    };
  }

  const { candidates, systems } = await loadCatalog(request);
  const linuxExamples = osExamples(systems, 'linux');
  const windowsExamples = osExamples(systems, 'windows');
  const windowsSelected = request.osFamily === 'windows';
  const requestedOsAvailable = windowsSelected
    ? windowsExamples.length > 0
    : linuxExamples.length > 0;

  return {
    ready: candidates.length > 0 && requestedOsAvailable,
    request,
    cards: candidates.slice(0, 40).map((item) => item.card),
    generatedAt: new Date().toISOString(),
    networksConfigured: configuredNetworks(),
    networksEligible: 1,
    networksReachable: 1,
    os: {
      linux: {
        available: linuxExamples.length > 0,
        examples: linuxExamples,
      },
      windows: {
        available: windowsExamples.length > 0,
        examples: windowsExamples,
        licenseIncluded: false,
      },
    },
    pricing: {
      status: 'preview',
      complete: !windowsSelected,
      multiplier,
      fixedHourlyUsd: fixed,
      note: windowsSelected
        ? 'Precio base de cómputo en vivo. La licencia oficial de Windows se cobra aparte y todavía no está incluida en esta vista previa.'
        : 'Precio base de cómputo en vivo. La creación vuelve a validar disponibilidad y precio antes de desplegar.',
    },
  };
};
