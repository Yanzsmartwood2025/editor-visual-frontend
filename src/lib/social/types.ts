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
  zernioConnectMode?: 'oauth' | 'telegram_code' | 'credentials' | 'oauth_channel';
};

export const SOCIAL_NETWORKS: SocialNetworkDefinition[] = [
  { id: 'instagram', label: 'Instagram', short: '◎', domain: 'instagram.com', uploadPostConnect: 'instagram', uploadPostPublish: 'instagram', zernio: 'instagram', zernioConnectMode: 'oauth' },
  { id: 'tiktok', label: 'TikTok', short: '♪', domain: 'tiktok.com', uploadPostConnect: 'tiktok', uploadPostPublish: 'tiktok', zernio: 'tiktok', zernioConnectMode: 'oauth' },
  { id: 'youtube', label: 'YouTube', short: '▶', domain: 'youtube.com', uploadPostConnect: 'youtube', uploadPostPublish: 'youtube', zernio: 'youtube', zernioConnectMode: 'oauth' },
  { id: 'facebook', label: 'Facebook', short: 'f', domain: 'facebook.com', uploadPostConnect: 'facebook', uploadPostPublish: 'facebook', zernio: 'facebook', zernioConnectMode: 'oauth' },
  { id: 'x', label: 'X', short: 'X', domain: 'x.com', uploadPostConnect: 'x', uploadPostPublish: 'twitter', zernio: 'twitter', zernioConnectMode: 'oauth' },
  { id: 'threads', label: 'Threads', short: '@', domain: 'threads.net', uploadPostConnect: 'threads', uploadPostPublish: 'threads', zernio: 'threads', zernioConnectMode: 'oauth' },
  { id: 'linkedin', label: 'LinkedIn', short: 'in', domain: 'linkedin.com', uploadPostConnect: 'linkedin', uploadPostPublish: 'linkedin', zernio: 'linkedin', zernioConnectMode: 'oauth' },
  { id: 'pinterest', label: 'Pinterest', short: 'P', domain: 'pinterest.com', uploadPostPublish: 'pinterest', zernio: 'pinterest', zernioConnectMode: 'oauth' },
  { id: 'bluesky', label: 'Bluesky', short: '🦋', domain: 'bsky.app', uploadPostPublish: 'bluesky', zernio: 'bluesky', zernioConnectMode: 'credentials' },
  { id: 'reddit', label: 'Reddit', short: 'r', domain: 'reddit.com', zernio: 'reddit', zernioConnectMode: 'oauth' },
  { id: 'google_business', label: 'Google Business', short: 'G', domain: 'business.google.com', uploadPostConnect: 'google_business', uploadPostPublish: 'google_business', zernio: 'googlebusiness', zernioConnectMode: 'oauth' },
  { id: 'snapchat', label: 'Snapchat', short: '◉', domain: 'snapchat.com', zernio: 'snapchat', zernioConnectMode: 'oauth' },
  { id: 'discord', label: 'Discord', short: 'D', domain: 'discord.com', uploadPostPublish: 'discord', zernio: 'discord', zernioConnectMode: 'oauth_channel' },
  { id: 'telegram', label: 'Telegram', short: '✈', domain: 'telegram.org', uploadPostPublish: 'telegram', zernio: 'telegram', zernioConnectMode: 'telegram_code' },
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
