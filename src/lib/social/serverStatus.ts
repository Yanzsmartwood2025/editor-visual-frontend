import type { SocialProviderId } from './types';

export type SocialProviderStatus = {
  id: SocialProviderId;
  configured: boolean;
  label: string;
};

export const socialProviderStatuses = (): SocialProviderStatus[] => [
  { id: 'upload_post', label: 'Ruta A', configured: Boolean(process.env.UPLOAD_POST_API_KEY) },
  { id: 'zernio', label: 'Ruta B', configured: Boolean(process.env.ZERNIO_API_KEY) },
];
