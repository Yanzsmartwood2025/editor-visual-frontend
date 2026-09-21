import { getSocialNetwork, type NormalizedSocialAccount, type SocialPlatform } from '../types';

const BASE_URL = 'https://zernio.com/api/v1';

const apiKey = () => {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) throw new Error('Ruta B todavía no tiene credencial configurada.');
  return key;
};

const request = async (path: string, init: RequestInit = {}) => {
  const response = await fetch(BASE_URL + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload?.message || payload?.error || `Zernio HTTP ${response.status}`));
    (error as any).status = response.status;
    (error as any).payload = payload;
    throw error;
  }
  return payload;
};

export const createZernioProfile = async (name: string) => {
  const payload = await request('/profiles', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  if (!payload?.profile?._id) throw new Error('Ruta B no devolvió el identificador del perfil.');
  return payload.profile;
};

export const createZernioConnectUrl = async ({
  profileId,
  platform,
  redirectUrl,
}: {
  profileId: string;
  platform: SocialPlatform;
  redirectUrl: string;
}) => {
  const mapped = getSocialNetwork(platform)?.zernio;
  if (!mapped) throw new Error(`${getSocialNetwork(platform)?.label || platform} no está disponible en Ruta B.`);
  const params = new URLSearchParams({ profileId, redirect_url: redirectUrl });
  const payload = await request(`/connect/${encodeURIComponent(mapped)}?${params.toString()}`);
  if (!payload?.authUrl) throw new Error('Ruta B no devolvió una URL de conexión.');
  return String(payload.authUrl);
};

const platformFromZernio = (value: string): SocialPlatform =>
  value === 'twitter' ? 'x' : value === 'googlebusiness' ? 'google_business' : value as SocialPlatform;

export const listZernioAccounts = async (profileId?: string | null): Promise<NormalizedSocialAccount[]> => {
  const payload = await request('/accounts');
  return (Array.isArray(payload?.accounts) ? payload.accounts : [])
    .filter((account: any) => !profileId || String(account?.profileId?._id || account?.profileId || '') === profileId)
    .map((account: any) => ({
      provider: 'zernio' as const,
      platform: platformFromZernio(String(account.platform || '')),
      providerAccountId: String(account._id || account.id || ''),
      username: account.username ? String(account.username) : null,
      handle: account.username ? String(account.username) : null,
      displayName: account.displayName ? String(account.displayName) : null,
      avatarUrl: account.avatarUrl ? String(account.avatarUrl) : null,
      profileUrl: account.profileUrl ? String(account.profileUrl) : null,
      status: account.isActive === false ? 'disconnected' as const : 'connected' as const,
      capabilities: {
        analytics: Boolean(account.hasAnalyticsAccess),
        canPost: account.canPost !== false,
        canFetchAnalytics: account.canFetchAnalytics !== false,
      },
      raw: account,
    }))
    .filter((account: NormalizedSocialAccount) => Boolean(account.providerAccountId));
};

export const publishZernioVideo = async ({
  videoUrl,
  caption,
  title,
  accounts,
  idempotencyKey,
}: {
  videoUrl: string;
  caption: string;
  title: string;
  accounts: { platform: SocialPlatform; accountId: string }[];
  idempotencyKey: string;
}) => {
  return request('/posts', {
    method: 'POST',
    headers: { 'x-request-id': idempotencyKey },
    body: JSON.stringify({
      content: caption || title || '',
      title: title || undefined,
      mediaItems: [{ type: 'video', url: videoUrl }],
      platforms: accounts.map(({ platform, accountId }) => ({
        platform: getSocialNetwork(platform)?.zernio || platform,
        accountId,
        ...(platform === 'youtube'
          ? { platformSpecificData: { title: (title || 'Nayla').slice(0, 100), visibility: 'public' } }
          : {}),
      })),
      publishNow: true,
    }),
  });
};

export const getZernioAnalytics = async ({
  profileId,
  accountId,
  platform,
}: {
  profileId?: string | null;
  accountId?: string | null;
  platform?: SocialPlatform | null;
}) => {
  const params = new URLSearchParams();
  if (profileId) params.set('profileId', profileId);
  if (accountId) params.set('accountId', accountId);
  if (platform) params.set('platform', getSocialNetwork(platform)?.zernio || platform);
  return request('/analytics?' + params.toString());
};

export const getZernioComments = async ({
  accountId,
  postId,
}: {
  accountId: string;
  postId: string;
}) => request(`/inbox/comments/${encodeURIComponent(postId)}?accountId=${encodeURIComponent(accountId)}`);

export const replyZernioComment = async ({
  accountId,
  postId,
  commentId,
  message,
}: {
  accountId: string;
  postId: string;
  commentId: string;
  message: string;
}) => request(`/inbox/comments/${encodeURIComponent(postId)}`, {
  method: 'POST',
  body: JSON.stringify({ accountId, commentId, message }),
});

export const listZernioConversations = async (accountId?: string | null) => {
  const params = new URLSearchParams();
  if (accountId) params.set('accountId', accountId);
  return request('/inbox/conversations?' + params.toString());
};

export const listZernioMessages = async (conversationId: string) =>
  request(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages`);

export const sendZernioMessage = async (conversationId: string, message: string) =>
  request(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
