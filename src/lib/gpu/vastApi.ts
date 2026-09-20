import type { GpuProfile } from './profiles';

const VAST_BASE_URL =
  process.env.VAST_API_BASE_URL?.trim().replace(/\/$/, '') ||
  'https://console.vast.ai/api/v0';

export type VastOffer = {
  id: number;
  gpu_name?: string;
  gpu_ram?: number;
  dph_total?: number;
  reliability?: number;
  inet_down?: number;
  disk_space?: number;
  num_gpus?: number;
  [key: string]: unknown;
};

const getVastApiKey = () => {
  const apiKey = process.env.VAST_API_KEY?.trim();
  if (!apiKey) throw new Error('VAST_API_KEY no está configurada en Vercel.');
  return apiKey;
};

const vastRequest = async <T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 20_000
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${VAST_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${getVastApiKey()}`,
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
        payload = { message: raw.slice(0, 500) };
      }
    }

    if (!response.ok) {
      const detail =
        payload?.msg ||
        payload?.message ||
        payload?.error ||
        `HTTP ${response.status}`;
      const error = new Error(`Vast.ai rechazó la operación: ${String(detail).slice(0, 500)}`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }

    return payload as T;
  } finally {
    clearTimeout(timer);
  }
};

export const getVastAccountSummary = async () => {
  const user = await vastRequest<Record<string, unknown>>('/users/current', { method: 'GET' });
  const credit = Number(user.credit);
  const rawBalance = Number(user.balance);
  const spendable = Number.isFinite(credit)
    ? credit
    : Number.isFinite(rawBalance)
      ? rawBalance
      : Number.NaN;

  if (!Number.isFinite(spendable)) {
    const hasCreditField = Object.prototype.hasOwnProperty.call(user, 'credit');
    const hasBalanceField = Object.prototype.hasOwnProperty.call(user, 'balance');
    throw new Error(
      hasCreditField || hasBalanceField
        ? 'Vast.ai devolvió un crédito/saldo no válido. Revisa la API key o los permisos de cuenta.'
        : 'La API key de Vast.ai no permite leer el crédito de la cuenta. Activa permiso de lectura de User/Billing para esta key.'
    );
  }

  return {
    balance: spendable,
    credit: Number.isFinite(credit) ? credit : undefined,
    rawBalance: Number.isFinite(rawBalance) ? rawBalance : undefined,
    id: typeof user.id === 'number' || typeof user.id === 'string' ? user.id : undefined,
  };
};

export const searchVastOffers = async (
  profile: GpuProfile,
  minReliability = 0.95
): Promise<VastOffer[]> => {
  const body = {
    verified: { eq: true },
    external: { eq: false },
    rentable: { eq: true },
    rented: { eq: false },
    num_gpus: { eq: 1 },
    // La REST API usa MB para gpu_ram. La CLI multiplica GB × 1000 antes de enviar.
    gpu_ram: { gte: profile.minGpuRamGb * 1000 },
    disk_space: { gte: profile.diskGb },
    reliability: { gte: minReliability },
    order: [
      ['dph_total', 'asc'],
      ['reliability', 'desc'],
    ],
    type: 'on-demand',
    allocated_storage: profile.diskGb,
  };

  const payload = await vastRequest<{ offers?: VastOffer[] }>('/bundles/', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return (payload.offers || [])
    .filter((offer) => Number.isFinite(Number(offer.id)))
    .filter((offer) => Number.isFinite(Number(offer.dph_total)))
    .sort((a, b) => Number(a.dph_total) - Number(b.dph_total));
};

export const createVastInstance = async ({
  offerId,
  image,
  diskGb,
  label,
  onstart,
  env = {},
}: {
  offerId: number;
  image: string;
  diskGb: number;
  label: string;
  onstart: string;
  env?: Record<string, string>;
}) => {
  const payload = await vastRequest<Record<string, unknown>>(`/asks/${offerId}/`, {
    method: 'PUT',
    body: JSON.stringify({
      client_id: 'me',
      image,
      disk: diskGb,
      label,
      // En runtype=args Vast interpreta "onstart" como ENTRYPOINT.
      // El patrón oficial es entrypoint=bash + args=-lc <script>.
      // Pasar el script completo como onstart hacía que la instancia quedara
      // arrancando sin ejecutar el worker.
      onstart: 'bash',
      force: false,
      cancel_unavail: true,
      runtype: 'args',
      args: ['-lc', onstart],
      env,
    }),
  });

  const instanceId = Number(payload.new_contract);
  if (!Number.isInteger(instanceId) || instanceId <= 0) {
    throw new Error('Vast.ai no devolvió un instance_id válido.');
  }

  return { instanceId, raw: payload };
};

export const getVastInstance = async (instanceId: number) => {
  const payload = await vastRequest<{ instances?: Record<string, unknown> | null }>(
    `/instances/${instanceId}/?owner=me`,
    { method: 'GET' }
  );
  return payload.instances || null;
};

export const destroyVastInstance = async (instanceId: number): Promise<void> => {
  try {
    await vastRequest<Record<string, unknown>>(
      `/instances/${instanceId}/`,
      { method: 'DELETE', body: JSON.stringify({}) },
      20_000
    );
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    // Si ya no existe, la meta de limpieza ya se cumplió.
    if (status === 404) return;
    throw error;
  }
};
