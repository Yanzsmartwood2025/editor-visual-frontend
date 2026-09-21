export type SocialProviderId = 'upload_post' | 'zernio';

export type SocialPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'facebook'
  | 'x'
  | 'threads'
  | 'linkedin'
  | 'pinterest'
  | 'bluesky'
  | 'reddit'
  | 'google_business'
  | 'snapchat'
  | 'discord'
  | 'telegram';

export type SocialNetworkDefinition = {
  id: SocialPlatform;
  label: string;
  short: string;
  domain: string;
  uploadPostConnect?: string;
  uploadPostPublish?: string;
  zernio?: string;
};

export const SOCIAL_NETWORKS: SocialNetworkDefinition[] = [
  { id: 'instagram', label: 'Instagram', short: '◎', domain: 'instagram.com', uploadPostConnect: 'instagram', uploadPostPublish: 'instagram', zernio: 'instagram' },
  { id: 'tiktok', label: 'TikTok', short: '♪', domain: 'tiktok.com', uploadPostConnect: 'tiktok', uploadPostPublish: 'tiktok', zernio: 'tiktok' },
  { id: 'youtube', label: 'YouTube', short: '▶', domain: 'youtube.com', uploadPostConnect: 'youtube', uploadPostPublish: 'youtube', zernio: 'youtube' },
  { id: 'facebook', label: 'Facebook', short: 'f', domain: 'facebook.com', uploadPostConnect: 'facebook', uploadPostPublish: 'facebook', zernio: 'facebook' },
  { id: 'x', label: 'X', short: 'X', domain: 'x.com', uploadPostConnect: 'x', uploadPostPublish: 'twitter', zernio: 'twitter' },
  { id: 'threads', label: 'Threads', short: '@', domain: 'threads.net', uploadPostConnect: 'threads', uploadPostPublish: 'threads', zernio: 'threads' },
  { id: 'linkedin', label: 'LinkedIn', short: 'in', domain: 'linkedin.com', uploadPostConnect: 'linkedin', uploadPostPublish: 'linkedin', zernio: 'linkedin' },
  { id: 'pinterest', label: 'Pinterest', short: 'P', domain: 'pinterest.com', uploadPostConnect: 'pinterest', uploadPostPublish: 'pinterest', zernio: 'pinterest' },
  { id: 'bluesky', label: 'Bluesky', short: '🦋', domain: 'bsky.app', uploadPostPublish: 'bluesky', zernio: 'bluesky' },
  { id: 'reddit', label: 'Reddit', short: 'r', domain: 'reddit.com', uploadPostConnect: 'reddit', zernio: 'reddit' },
  { id: 'google_business', label: 'Google Business', short: 'G', domain: 'business.google.com', uploadPostConnect: 'google_business', uploadPostPublish: 'google_business', zernio: 'googlebusiness' },
  { id: 'snapchat', label: 'Snapchat', short: '◉', domain: 'snapchat.com', uploadPostConnect: 'snapchat', zernio: 'snapchat' },
  { id: 'discord', label: 'Discord', short: 'D', domain: 'discord.com', uploadPostPublish: 'discord', zernio: 'discord' },
  { id: 'telegram', label: 'Telegram', short: '✈', domain: 'telegram.org', uploadPostPublish: 'telegram', zernio: 'telegram' },
];

export const getSocialNetwork = (platform: string) =>
  SOCIAL_NETWORKS.find((network) => network.id === platform);

export type NormalizedSocialAccount = {
  provider: SocialProviderId;
  platform: SocialPlatform;
  providerAccountId: string | null;
  username?: string | null;
  handle?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  status: 'connected' | 'disconnected' | 'reauth' | 'error';
  capabilities: Record<string, unknown> | string[];
  raw: Record<string, unknown>;
};

export type SocialProviderStatus = {
  id: SocialProviderId;
  configured: boolean;
  label: string;
};

export const socialProviderStatuses = (): SocialProviderStatus[] => [
  { id: 'upload_post', label: 'Ruta A', configured: Boolean(process.env.UPLOAD_POST_API_KEY) },
  { id: 'zernio', label: 'Ruta B', configured: Boolean(process.env.ZERNIO_API_KEY) },
];
