import type { GpuProfile } from './profiles';

const RUNPOD_GRAPHQL_URL =
  process.env.RUNPOD_GRAPHQL_URL?.trim() ||
  'https://api.runpod.io/graphql';

export type RunpodGpuType = {
  id: string;
  displayName?: string;
  manufacturer?: string;
  memoryInGb?: number;
  lowestPrice?: {
    gpuName?: string;
    gpuTypeId?: string;
    uninterruptablePrice?: number;
    stockStatus?: string;
    maxUnreservedGpuCount?: number;
    availableGpuCounts?: number[];
  } | null;
};

export type RunpodPod = {
  id: string;
  costPerHr?: number;
  desiredStatus?: string;
  imageName?: string;
  gpuCount?: number;
  memoryInGb?: number;
  lastStatusChange?: string;
};

const getRunpodApiKey = () => {
  const key = process.env.RUNPOD_API_KEY?.trim();
  if (!key) throw new Error('RUNPOD_API_KEY no está configurada en Vercel.');
  return key;
};

const runpodGraphql = async <T>(
  query: string,
  variables?: Record<string, unknown>,
  timeoutMs = 20_000
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(RUNPOD_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getRunpodApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: variables || {} }),
      signal: controller.signal,
    });

    const raw = await response.text();
    let payload: any = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { errors: [{ message: raw.slice(0, 1000) }] };
    }

    if (!response.ok || payload.errors?.length) {
      const detail =
        payload.errors?.[0]?.message ||
        payload.message ||
        `HTTP ${response.status}`;
      throw new Error(
        'Nayla Compute no pudo consultar una de sus redes GPU: ' +
          String(detail).slice(0, 800)
      );
    }

    return payload.data as T;
  } finally {
    clearTimeout(timer);
  }
};

export const isRunpodConfigured = () =>
  Boolean(process.env.RUNPOD_API_KEY?.trim());

export const getRunpodAccountSummary = async () => {
  const data = await runpodGraphql<{
    myself?: {
      clientBalance?: number;
      minBalance?: number;
      underBalance?: boolean;
      currentSpendPerHr?: number;
      spendLimit?: number;
    } | null;
  }>(`
    query NaylaRunpodAccount {
      myself {
        clientBalance
        minBalance
        underBalance
        currentSpendPerHr
        spendLimit
      }
    }
  `);

  const balance = Number(data.myself?.clientBalance);
  if (!Number.isFinite(balance)) {
    throw new Error(
      'Nayla Compute no pudo leer el saldo disponible de una de sus redes GPU.'
    );
  }

  return {
    balance,
    providerMinBalance: Number.isFinite(Number(data.myself?.minBalance))
      ? Number(data.myself?.minBalance)
      : undefined,
    underBalance: Boolean(data.myself?.underBalance),
    currentSpendPerHr: Number.isFinite(Number(data.myself?.currentSpendPerHr))
      ? Number(data.myself?.currentSpendPerHr)
      : undefined,
    spendLimit: Number.isFinite(Number(data.myself?.spendLimit))
      ? Number(data.myself?.spendLimit)
      : undefined,
  };
};

export const searchRunpodGpuTypes = async (
  profile: GpuProfile
): Promise<RunpodGpuType[]> => {
  const data = await runpodGraphql<{
    gpuTypes?: RunpodGpuType[];
  }>(
    `
      query NaylaRunpodGpuTypes($priceInput: GpuLowestPriceInput) {
        gpuTypes {
          id
          displayName
          manufacturer
          memoryInGb
          lowestPrice(input: $priceInput) {
            gpuName
            gpuTypeId
            uninterruptablePrice
            stockStatus
            maxUnreservedGpuCount
            availableGpuCounts
          }
        }
      }
    `,
    {
      priceInput: {
        gpuCount: 1,
        minDisk: profile.diskGb,
      },
    }
  );

  return (data.gpuTypes || [])
    .filter((gpu) => typeof gpu.id === 'string' && gpu.id.trim())
    .filter((gpu) => Number(gpu.memoryInGb) >= profile.minGpuRamGb)
    .filter((gpu) => {
      const price = Number(gpu.lowestPrice?.uninterruptablePrice);
      if (!Number.isFinite(price) || price <= 0) return false;

      const stockStatus = String(gpu.lowestPrice?.stockStatus || '').toLowerCase();
      if (stockStatus.includes('out')) return false;

      const availableCounts = gpu.lowestPrice?.availableGpuCounts;
      if (Array.isArray(availableCounts) && availableCounts.length > 0) {
        return availableCounts.some((count) => Number(count) >= 1);
      }

      const maxUnreserved = Number(gpu.lowestPrice?.maxUnreservedGpuCount);
      if (Number.isFinite(maxUnreserved)) return maxUnreserved >= 1;

      return true;
    })
    .sort(
      (a, b) =>
        Number(a.lowestPrice?.uninterruptablePrice) -
        Number(b.lowestPrice?.uninterruptablePrice)
    );
};

const shellQuote = (value: string) =>
  "'" + value.replace(/'/g, "'\\''") + "'";

export const createRunpodPod = async ({
  gpuTypeId,
  imageName,
  diskGb,
  name,
  onstart,
  env,
  terminateAfter,
}: {
  gpuTypeId: string;
  imageName: string;
  diskGb: number;
  name: string;
  onstart: string;
  env: Record<string, string>;
  terminateAfter: Date;
}) => {
  const data = await runpodGraphql<{
    podFindAndDeployOnDemand?: RunpodPod | null;
  }>(
    `
      mutation NaylaCreatePod($input: PodFindAndDeployOnDemandInput) {
        podFindAndDeployOnDemand(input: $input) {
          id
          costPerHr
          desiredStatus
          imageName
          gpuCount
          memoryInGb
          lastStatusChange
        }
      }
    `,
    {
      input: {
        cloudType: 'ALL',
        containerDiskInGb: Math.max(10, Math.ceil(diskGb)),
        gpuCount: 1,
        gpuTypeId,
        imageName,
        name,
        startJupyter: false,
        startSsh: false,
        supportPublicIp: false,
        dockerArgs: 'bash -lc ' + shellQuote(onstart),
        env: Object.entries(env).map(([key, value]) => ({ key, value })),
        terminateAfter: terminateAfter.toISOString(),
      },
    },
    35_000
  );

  const pod = data.podFindAndDeployOnDemand;
  if (!pod?.id) {
    throw new Error('Nayla Compute no recibió un identificador válido para la GPU.');
  }
  return pod;
};

export const getRunpodPod = async (podId: string): Promise<RunpodPod | null> => {
  const data = await runpodGraphql<{ pod?: RunpodPod | null }>(
    `
      query NaylaRunpodPod($input: PodFilter) {
        pod(input: $input) {
          id
          costPerHr
          desiredStatus
          imageName
          gpuCount
          memoryInGb
          lastStatusChange
        }
      }
    `,
    { input: { podId } }
  );
  return data.pod || null;
};

export const terminateRunpodPod = async (podId: string): Promise<void> => {
  await runpodGraphql<{ podTerminate?: null }>(
    `
      mutation NaylaTerminatePod($input: PodTerminateInput!) {
        podTerminate(input: $input)
      }
    `,
    { input: { podId } },
    20_000
  );
};
