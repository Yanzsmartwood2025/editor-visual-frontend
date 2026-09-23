import type { SocialProviderId } from './types';

export type SocialProviderStatus = {
  id: SocialProviderId;
  configured: boolean;
  label: string;
  accountLimit: number | null;
  profileLimit?: number | null;
  perPlatformAccountLimit?: number | null;
};

const positiveLimit = (raw: string | undefined, fallback: number): number | null => {
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
    // Upload-Post Free is profile-based, not capped at two connected social
    // accounts. Nayla currently owns one provider profile per project and that
    // profile can hold one connected account for each supported platform.
    accountLimit: null,
    profileLimit: positiveLimit(process.env.UPLOAD_POST_PROFILE_LIMIT, 2),
    perPlatformAccountLimit: 1,
  },
  {
    id: 'zernio',
    label: 'Ruta B',
    configured: Boolean(process.env.ZERNIO_API_KEY),
    // Zernio's current free tier includes the first two connected accounts.
    accountLimit: positiveLimit(process.env.ZERNIO_ACCOUNT_LIMIT, 2),
  },
];
