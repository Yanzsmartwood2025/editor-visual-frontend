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

export const listZernioProfiles = async (name?: string) => {
  const params = new URLSearchParams();
  if (name?.trim()) params.set('name', name.trim());
  params.set('limit', '100');
  const payload = await request('/profiles?' + params.toString());
  return Array.isArray(payload?.profiles)
    ? payload.profiles
    : Array.isArray(payload?.data)
      ? payload.data
      : [];
};

export const createZernioProfile = async (name: string, idempotencyKey?: string) => {
  const payload = await request('/profiles', {
    method: 'POST',
    headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
    body: JSON.stringify({ name }),
  });
  if (!payload?.profile?._id) throw new Error('Ruta B no devolvió el identificador del perfil.');
  return payload.profile;
};

export const ensureZernioProfile = async ({
  name,
  idempotencyKey,
}: {
  name: string;
  idempotencyKey: string;
}) => {
  const existing = await listZernioProfiles(name);
  const exact = existing.find((profile: any) => String(profile?.name || '') === name);
  if (exact?._id || exact?.id) return exact;

  try {
    return await createZernioProfile(name, idempotencyKey);
  } catch (error: any) {
    const status = Number(error?.status);
    const code = String(error?.payload?.code || error?.payload?.error_code || '');
    if (status === 409 || code === 'profilenameconflict') {
      const retry = await listZernioProfiles(name);
      const recovered = retry.find((profile: any) => String(profile?.name || '') === name);
      if (recovered?._id || recovered?.id) return recovered;
    }
    throw error;
  }
};

export const createZernioTelegramCode = async (profileId: string) => {
  return request(`/connect/telegram?profileId=${encodeURIComponent(profileId)}`);
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
      username: account.username
        ? String(account.username)
        : account.metadata?.profileData?.username
          ? String(account.metadata.profileData.username)
          : null,
      handle: account.username
        ? String(account.username)
        : account.metadata?.profileData?.username
          ? String(account.metadata.profileData.username)
          : null,
      displayName: account.displayName
        ? String(account.displayName)
        : account.metadata?.profileData?.displayName
          ? String(account.metadata.profileData.displayName)
          : null,
      avatarUrl: account.avatarUrl
        ? String(account.avatarUrl)
        : account.profilePicture
          ? String(account.profilePicture)
          : account.metadata?.profileData?.profilePicture
            ? String(account.metadata.profileData.profilePicture)
            : null,
      profileUrl: account.profileUrl
        ? String(account.profileUrl)
        : account.metadata?.profileData?.profileUrl
          ? String(account.metadata.profileData.profileUrl)
          : null,
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

type ZernioPublishVariant = {
  title?: string;
  caption?: string;
  hashtags?: string[];
};

const zernioVariantText = (variant?: ZernioPublishVariant) => {
  if (!variant) return '';
  return [
    String(variant.caption || '').trim(),
    Array.isArray(variant.hashtags) ? variant.hashtags.filter(Boolean).join(' ') : '',
  ].filter(Boolean).join('\n\n').trim();
};

export const publishZernioMedia = async ({
  mediaUrl,
  mediaType,
  caption,
  title,
  accounts,
  idempotencyKey,
  variants,
}: {
  mediaUrl: string;
  mediaType: 'video' | 'image';
  caption: string;
  title: string;
  accounts: { platform: SocialPlatform; accountId: string }[];
  idempotencyKey: string;
  variants?: Partial<Record<SocialPlatform, ZernioPublishVariant>>;
}) => {
  return request('/posts', {
    method: 'POST',
    headers: { 'x-request-id': idempotencyKey },
    body: JSON.stringify({
      content: caption || title || '',
      title: title || undefined,
      mediaItems: [{ type: mediaType, url: mediaUrl }],
      platforms: accounts.map(({ platform, accountId }) => {
        const variant = variants?.[platform];
        const customContent = zernioVariantText(variant);
        const variantTitle = String(variant?.title || title || '').trim();

        return {
          platform: getSocialNetwork(platform)?.zernio || platform,
          accountId,
          ...(customContent ? { customContent } : {}),
          ...(platform === 'youtube' && mediaType === 'video'
            ? {
                platformSpecificData: {
                  title: (variantTitle || 'Nayla').slice(0, 100),
                  visibility: 'public',
                },
              }
            : {}),
        };
      }),
      ...(accounts.some((account) => account.platform === 'tiktok')
        ? {
            tiktokSettings: {
              privacy_level: 'PUBLIC_TO_EVERYONE',
              allow_comment: true,
              allow_duet: mediaType === 'video',
              allow_stitch: mediaType === 'video',
              content_preview_confirmed: true,
              express_consent_given: true,
            },
          }
        : {}),
      publishNow: true,
    }),
  });
};

export const publishZernioVideo = async ({
  videoUrl,
  caption,
  title,
  accounts,
  idempotencyKey,
  variants,
}: {
  videoUrl: string;
  caption: string;
  title: string;
  accounts: { platform: SocialPlatform; accountId: string }[];
  idempotencyKey: string;
  variants?: Partial<Record<SocialPlatform, ZernioPublishVariant>>;
}) => publishZernioMedia({
  mediaUrl: videoUrl,
  mediaType: 'video',
  caption,
  title,
  accounts,
  idempotencyKey,
  variants,
});

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

export const listZernioMessages = async (conversationId: string, accountId: string) => {
  const params = new URLSearchParams({ accountId, limit: '100', sortOrder: 'asc' });
  return request(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`);
};

export const sendZernioMessage = async (conversationId: string, accountId: string, message: string) =>
  request(`/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ accountId, message }),
  });


export const syncZernioExternalPosts = async (accountId: string) =>
  request('/posts/sync-external', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });

const NAYLA_WEBHOOK_EVENTS = [
  'comment.received',
  'message.received',
  'message.sent',
  'reaction.received',
  'analytics.synced',
  'post.external.created',
  'post.external.updated',
  'post.platform.published',
  'post.platform.failed',
  'post.tiktok.url_resolved',
] as const;

export const ensureZernioWebhook = async (url: string) => {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET?.trim();
  if (!secret || !url) {
    return {
      configured: false,
      reason: !secret ? 'missing_secret' : 'missing_url',
    };
  }

  const payload = await request('/webhooks/settings');
  const webhooks = Array.isArray(payload?.webhooks)
    ? payload.webhooks
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : [];

  const normalizedUrl = url.replace(/\/+$/, '');
  const existing = webhooks.find((item: any) =>
    String(item?.url || '').replace(/\/+$/, '') === normalizedUrl &&
    item?.isActive !== false
  );

  if (existing) {
    return {
      configured: true,
      created: false,
      webhook: existing,
    };
  }

  const created = await request('/webhooks/settings', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Nayla Social Live',
      url: normalizedUrl,
      events: [...NAYLA_WEBHOOK_EVENTS],
      secret,
    }),
  });

  return {
    configured: true,
    created: true,
    webhook: created?.webhook || created,
  };
};
