import type { SocialProviderId } from './types';

export type SocialProviderStatus = {
  id: SocialProviderId;
  configured: boolean;
  label: string;
  accountLimit: number | null;
};

const accountLimit = (raw: string | undefined, fallback = 2): number | null => {
  const normalized = raw?.trim();
  const parsed = Number(normalized ? normalized : fallback);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return null;
  return Math.max(1, Math.floor(parsed));
};

export const socialProviderStatuses = (): SocialProviderStatus[] => [
  {
    id: 'upload_post',
    label: 'Ruta A',
    configured: Boolean(process.env.UPLOAD_POST_API_KEY),
    accountLimit: accountLimit(process.env.UPLOAD_POST_ACCOUNT_LIMIT),
  },
  {
    id: 'zernio',
    label: 'Ruta B',
    configured: Boolean(process.env.ZERNIO_API_KEY),
    accountLimit: accountLimit(process.env.ZERNIO_ACCOUNT_LIMIT),
  },
];
