import type { GpuProfile } from './profiles';

const VULTR_BASE_URL =
  process.env.VULTR_API_BASE_URL?.trim().replace(/\/$/, '') ||
  'https://api.vultr.com/v2';

export type VultrGpuPlan = {
  id: string;
  vcpu_count?: number;
  ram?: number;
  disk?: number;
  bandwidth?: number;
  monthly_cost?: number;
  type?: string;
  gpu_vram?: number;
  gpu_vram_gb?: number;
  gpu_type?: string;
  locations?: string[];
  link_speed?: number;
  [key: string]: unknown;
};

export type VultrRegion = {
  id: string;
  city?: string;
  country?: string;
  continent?: string;
  options?: string[];
  [key: string]: unknown;
};

export type VultrOperatingSystem = {
  id: number;
  name?: string;
  arch?: string;
  family?: string;
  [key: string]: unknown;
};

export type VultrInstance = {
  id: string;
  label?: string;
  region?: string;
  plan?: string;
  status?: string;
  power_status?: string;
  server_status?: string;
  main_ip?: string;
  date_created?: string;
  [key: string]: unknown;
};

const getVultrApiKey = () => {
  const key = process.env.VULTR_API_KEY?.trim();
  if (!key) throw new Error('VULTR_API_KEY no está configurada en Vercel.');
  return key;
};

export const isVultrConfigured = () =>
  Boolean(process.env.VULTR_API_KEY?.trim());

const vultrRequest = async <T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 20_000
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(VULTR_BASE_URL + path, {
      ...init,
      headers: {
        Authorization: 'Bearer ' + getVultrApiKey(),
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: controller.signal,
    });

    const raw = await response.text();
    let payload: any = {};
    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = { error: raw.slice(0, 1000) };
      }
    }

    if (!response.ok) {
      const detail =
        payload?.error ||
        payload?.message ||
        payload?.error_description ||
        ('HTTP ' + response.status);
      const error = new Error(
        'Nayla Compute no pudo consultar una de sus redes GPU: ' +
          String(detail).slice(0, 800)
      );
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }

    return payload as T;
  } finally {
    clearTimeout(timer);
  }
};

export const getVultrAccountSummary = async () => {
  const data = await vultrRequest<{
    account?: {
      balance?: number;
      pending_charges?: number;
      [key: string]: unknown;
    };
  }>('/account', { method: 'GET' });

  const balance = Number(data.account?.balance);
  const pendingCharges = Number(data.account?.pending_charges);

  if (!Number.isFinite(balance)) {
    throw new Error(
      'Nayla Compute no pudo leer el saldo disponible de una de sus redes GPU.'
    );
  }

  const spendable = Math.max(
    0,
    balance - (Number.isFinite(pendingCharges) ? Math.max(0, pendingCharges) : 0)
  );

  return {
    balance: spendable,
    rawBalance: balance,
    pendingCharges: Number.isFinite(pendingCharges) ? pendingCharges : undefined,
  };
};

export const listVultrRegions = async (): Promise<VultrRegion[]> => {
  const data = await vultrRequest<{ regions?: VultrRegion[] }>(
    '/regions?per_page=500',
    { method: 'GET' }
  );
  return (data.regions || []).filter(
    (region) => typeof region.id === 'string' && region.id.trim()
  );
};

export const listVultrPlans = async (): Promise<VultrGpuPlan[]> => {
  const data = await vultrRequest<{ plans?: VultrGpuPlan[] }>(
    '/plans?per_page=500',
    { method: 'GET' }
  );

  return (data.plans || []).filter(
    (plan) => typeof plan.id === 'string' && plan.id.trim().length > 0
  );
};

export const listVultrOperatingSystems = async (): Promise<VultrOperatingSystem[]> => {
  const data = await vultrRequest<{ os?: VultrOperatingSystem[] }>(
    '/os?per_page=500',
    { method: 'GET' }
  );

  return (data.os || []).filter(
    (os) => Number.isInteger(Number(os.id)) && Number(os.id) > 0
  );
};

export const listVultrGpuPlans = async (): Promise<VultrGpuPlan[]> => {
  const plans = await listVultrPlans();

  return plans.filter((plan) => {
    const type = String(plan.type || '').toLowerCase();
    const gpuType = String(plan.gpu_type || '').trim();
    const gpuVram = Number(plan.gpu_vram_gb ?? plan.gpu_vram);
    return (
      typeof plan.id === 'string' &&
      plan.id.trim().length > 0 &&
      (type === 'vcg' || gpuType.length > 0 || Number.isFinite(gpuVram))
    );
  });
};

const normalizeGpuVramGb = (plan: VultrGpuPlan) => {
  const directGb = Number(plan.gpu_vram_gb);
  if (Number.isFinite(directGb) && directGb > 0) return directGb;

  const raw = Number(plan.gpu_vram);
  if (!Number.isFinite(raw) || raw <= 0) return undefined;

  // Vultr historically exposed this field in GB, but tolerate MB values too.
  return raw > 512 ? Math.round((raw / 1024) * 10) / 10 : raw;
};

export const searchVultrGpuPlans = async (
  profile: GpuProfile
): Promise<Array<{ plan: VultrGpuPlan; region: VultrRegion; hourlyPrice: number }>> => {
  const [plans, regions] = await Promise.all([
    listVultrGpuPlans(),
    listVultrRegions(),
  ]);

  const regionById = new Map(regions.map((region) => [region.id, region]));
  const candidates: Array<{
    plan: VultrGpuPlan;
    region: VultrRegion;
    hourlyPrice: number;
  }> = [];

  for (const plan of plans) {
    const gpuVramGb = normalizeGpuVramGb(plan);
    if (!gpuVramGb || gpuVramGb < profile.minGpuRamGb) continue;

    const monthlyCost = Number(plan.monthly_cost);
    if (!Number.isFinite(monthlyCost) || monthlyCost <= 0) continue;

    const hourlyPrice = monthlyCost / 730;
    const locations = Array.isArray(plan.locations) ? plan.locations : [];

    for (const regionId of locations) {
      const region = regionById.get(regionId);
      if (!region) continue;
      candidates.push({ plan, region, hourlyPrice });
    }
  }

  return candidates.sort(
    (a, b) =>
      a.hourlyPrice - b.hourlyPrice ||
      Number(normalizeGpuVramGb(b.plan) || 0) -
        Number(normalizeGpuVramGb(a.plan) || 0)
  );
};

const shellQuote = (value: string) =>
  "'" + value.replace(/'/g, "'\\''") + "'";

const encodeUserData = (value: string) =>
  Buffer.from(value, 'utf8').toString('base64');

export const buildVultrWorkerUserData = ({
  imageName,
  onstart,
  env,
}: {
  imageName: string;
  onstart: string;
  env: Record<string, string>;
}) => {
  const scriptPayload = Buffer.from(onstart, 'utf8').toString('base64');
  const envArgs = Object.entries(env)
    .map(([key, value]) => '--env ' + shellQuote(key + '=' + value))
    .join(' \\\n  ');

  const userData = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'until command -v docker >/dev/null 2>&1; do sleep 2; done',
    'until docker info >/dev/null 2>&1; do sleep 2; done',
    'docker pull ' + shellQuote(imageName),
    'docker run --rm --gpus all \\',
    '  ' + envArgs + ' \\',
    '  ' + shellQuote(imageName) + ' bash -lc ' +
      shellQuote('echo ' + shellQuote(scriptPayload) + ' | base64 -d | bash'),
  ].join('\n');

  return encodeUserData(userData);
};

export const createVultrGpuInstance = async ({
  planId,
  regionId,
  label,
  userData,
}: {
  planId: string;
  regionId: string;
  label: string;
  userData: string;
}) => {
  const osId = Number(process.env.VULTR_GPU_OS_ID || '1743');
  if (!Number.isInteger(osId) || osId <= 0) {
    throw new Error('VULTR_GPU_OS_ID no es válido.');
  }

  const data = await vultrRequest<{ instance?: VultrInstance }>(
    '/instances',
    {
      method: 'POST',
      body: JSON.stringify({
        region: regionId,
        plan: planId,
        os_id: osId,
        label: label.slice(0, 128),
        hostname: label.slice(0, 63),
        user_data: userData,
        activation_email: false,
      }),
    },
    40_000
  );

  if (!data.instance?.id) {
    throw new Error('Nayla Compute no recibió un identificador válido para la GPU.');
  }

  return data.instance;
};

export const createVultrInstance = async ({
  planId,
  regionId,
  osId,
  label,
  userData,
}: {
  planId: string;
  regionId: string;
  osId: number;
  label: string;
  userData?: string;
}) => {
  if (!Number.isInteger(osId) || osId <= 0) {
    throw new Error('El sistema operativo de Nayla PC no es válido.');
  }

  const body: Record<string, unknown> = {
    region: regionId,
    plan: planId,
    os_id: osId,
    label: label.slice(0, 128),
    hostname: label.slice(0, 63),
    activation_email: false,
  };

  if (userData) body.user_data = userData;

  const data = await vultrRequest<{ instance?: VultrInstance }>(
    '/instances',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    40_000
  );

  if (!data.instance?.id) {
    throw new Error('Nayla PC no recibió un identificador válido de la instancia.');
  }

  return data.instance;
};

export const getVultrInstance = async (
  instanceId: string
): Promise<VultrInstance | null> => {
  try {
    const data = await vultrRequest<{ instance?: VultrInstance }>(
      '/instances/' + encodeURIComponent(instanceId),
      { method: 'GET' }
    );
    return data.instance || null;
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 404) return null;
    throw error;
  }
};

export const deleteVultrInstance = async (
  instanceId: string
): Promise<void> => {
  try {
    await vultrRequest<unknown>(
      '/instances/' + encodeURIComponent(instanceId),
      { method: 'DELETE' },
      20_000
    );
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 404) return;
    throw error;
  }
};

export const parseVultrCandidateId = (value: string) => {
  const splitAt = value.indexOf('@');
  if (splitAt <= 0 || splitAt >= value.length - 1) return null;
  return {
    planId: value.slice(0, splitAt),
    regionId: value.slice(splitAt + 1),
  };
};

export const getVultrGpuVramGb = normalizeGpuVramGb;
