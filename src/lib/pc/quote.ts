import { createHmac } from 'node:crypto';
import {
  getVultrGpuVramGb,
  isVultrConfigured,
  listVultrOperatingSystems,
  listVultrPlans,
  listVultrRegions,
  type VultrGpuPlan,
  type VultrOperatingSystem,
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
  envNumber('NAYLA_PC_PRICE_MULTIPLIER', 1, 0.1, 10);

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
  // Vultr VX1 currently does not offer Windows images.
  return type === 'vx1' || id.startsWith('vx1');
};

const osFamily = (os: VultrOperatingSystem): PcOsFamily | null => {
  const text = [os.family, os.name].filter(Boolean).join(' ').toLowerCase();
  if (text.includes('windows')) return 'windows';
  if (
    /ubuntu|debian|fedora|centos|rocky|alma|arch|opensuse|linux/.test(text)
  ) {
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

  const [plans, regions, systems] = await Promise.all([
    listVultrPlans(),
    listVultrRegions(),
    listVultrOperatingSystems(),
  ]);

  const regionById = new Map(regions.map((region) => [region.id, region]));
  const linuxExamples = osExamples(systems, 'linux');
  const windowsExamples = osExamples(systems, 'windows');

  const eligiblePlans = plans.filter((plan) => {
    const cpu = Number(plan.vcpu_count);
    const memory = ramGb(plan);
    const disk = Number(plan.disk);
    const monthly = Number(plan.monthly_cost);

    if (!Number.isFinite(cpu) || cpu < request.cpu) return false;
    if (!Number.isFinite(memory) || memory < request.ramGb) return false;
    if (!Number.isFinite(disk) || disk < request.diskGb) return false;
    if (!Number.isFinite(monthly) || monthly <= 0) return false;

    const gpu = isGpuPlan(plan);
    if (request.gpuEnabled) {
      if (!gpu) return false;
      if (Number(getVultrGpuVramGb(plan) || 0) < request.minGpuVramGb) {
        return false;
      }
    } else if (gpu) {
      return false;
    }

    if (request.osFamily === 'windows' && isWindowsBlockedPlan(plan)) {
      return false;
    }

    return Array.isArray(plan.locations) && plan.locations.length > 0;
  });

  const candidates: NaylaPcCard[] = [];

  for (const plan of eligiblePlans) {
    const internalMonthly = Number(plan.monthly_cost);
    const gpu = isGpuPlan(plan);
    const billingCapHours = gpu ? 730 : 672;
    const internalHourly = internalMonthly / billingCapHours;
    const hourly = publicHourlyPrice(internalHourly);
    const monthly = publicMonthlyPrice(internalMonthly, billingCapHours);

    for (const regionId of plan.locations || []) {
      const region = regionById.get(regionId);
      if (!region) continue;
      const regionLabel =
        [region.city, region.country].filter(Boolean).join(', ') || regionId;

      candidates.push({
        id: selectionId({
          planId: plan.id,
          regionId,
          monthlyCost: internalMonthly,
        }),
        cpu: Number(plan.vcpu_count),
        ramGb: ramGb(plan),
        diskGb: Number(plan.disk),
        gpuName: gpu ? String(plan.gpu_type || 'GPU').trim() || 'GPU' : undefined,
        gpuVramGb: gpu ? getVultrGpuVramGb(plan) : undefined,
        region: regionLabel,
        hourlyPrice: hourly,
        monthlyPrice: monthly,
        estimatedSessionPrice: roundMoney(hourly * request.durationHours),
        available: true,
        recommended: false,
        billingCapHours,
      });
    }
  }

  candidates.sort((a, b) => {
    const priceA =
      request.billingMode === 'monthly' ? a.monthlyPrice : a.hourlyPrice;
    const priceB =
      request.billingMode === 'monthly' ? b.monthlyPrice : b.hourlyPrice;
    return (
      priceA - priceB ||
      a.cpu - b.cpu ||
      a.ramGb - b.ramGb ||
      a.diskGb - b.diskGb
    );
  });

  if (candidates[0]) candidates[0].recommended = true;

  const windowsSelected = request.osFamily === 'windows';
  const requestedOsAvailable = windowsSelected
    ? windowsExamples.length > 0
    : linuxExamples.length > 0;

  return {
    ready: candidates.length > 0 && requestedOsAvailable,
    request,
    cards: candidates.slice(0, 40),
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
        : 'Precio base de cómputo en vivo. El margen comercial de Nayla PC puede configurarse después sin cambiar el proveedor.',
    },
  };
};
