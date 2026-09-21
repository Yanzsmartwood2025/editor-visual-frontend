import { getSocialNetwork, type NormalizedSocialAccount, type SocialPlatform } from '../types';

const BASE_URL = 'https://api.upload-post.com';

const apiKey = () => {
  const key = process.env.UPLOAD_POST_API_KEY;
  if (!key) throw new Error('Ruta A todavía no tiene credencial configurada.');
  return key;
};

const request = async (path: string, init: RequestInit = {}) => {
  const response = await fetch(BASE_URL + path, {
    ...init,
    headers: {
      Authorization: `Apikey ${apiKey()}`,
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(payload?.message || payload?.error || `Upload-Post HTTP ${response.status}`));
    (error as any).status = response.status;
    (error as any).payload = payload;
    throw error;
  }
  return payload;
};

export const ensureUploadPostProfile = async (username: string) => {
  try {
    const existing = await request(`/api/uploadposts/users/${encodeURIComponent(username)}`);
    return existing?.profile || existing;
  } catch (error: any) {
    if (error?.status !== 404) throw error;
  }
  const created = await request('/api/uploadposts/users', {
    method: 'POST',
    body: JSON.stringify({ username }),
  });
  return created?.profile || created;
};

export const getUploadPostProfile = async (username: string) => {
  const payload = await request(`/api/uploadposts/users/${encodeURIComponent(username)}`);
  return payload?.profile || payload;
};

export const createUploadPostConnectUrl = async ({
  username,
  platform,
  redirectUrl,
}: {
  username: string;
  platform: SocialPlatform;
  redirectUrl: string;
}) => {
  await ensureUploadPostProfile(username);
  const network = getSocialNetwork(platform);
  if (!network?.uploadPostConnect) throw new Error(`${network?.label || platform} no usa conexión OAuth en Ruta A.`);
  const payload = await request('/api/uploadposts/users/generate-jwt', {
    method: 'POST',
    body: JSON.stringify({
      username,
      redirect_url: redirectUrl,
      platforms: [network.uploadPostConnect],
      show_calendar: false,
      language: 'es',
      connect_title: 'Conecta tu cuenta a Nayla',
      connect_description: 'Autoriza esta red para publicar, medir resultados y gestionar actividad desde Nayla.',
      redirect_button_text: 'Volver a Nayla',
    }),
  });
  if (!payload?.access_url) throw new Error('Ruta A no devolvió una URL de conexión.');
  return String(payload.access_url);
};

const accountFromUploadPost = (
  platform: SocialPlatform,
  value: any
): NormalizedSocialAccount | null => {
  if (!value || typeof value !== 'object') return null;
  return {
    provider: 'upload_post',
    platform,
    providerAccountId: value.username ? String(value.username) : null,
    username: value.username ? String(value.username) : null,
    handle: value.handle ? String(value.handle) : null,
    displayName: value.display_name ? String(value.display_name) : null,
    avatarUrl: value.social_images ? String(value.social_images) : null,
    profileUrl: value.profile_url ? String(value.profile_url) : null,
    status: value.reauth_required ? 'reauth' : 'connected',
    capabilities: Array.isArray(value.capabilities) ? value.capabilities : {},
    raw: value,
  };
};

export const listUploadPostAccounts = async (username: string): Promise<NormalizedSocialAccount[]> => {
  const profile = await getUploadPostProfile(username);
  const socialAccounts = profile?.social_accounts || {};
  return Object.entries(socialAccounts)
    .map(([rawPlatform, value]) => {
      const platform = rawPlatform === 'twitter' ? 'x' : rawPlatform as SocialPlatform;
      return accountFromUploadPost(platform, value);
    })
    .filter(Boolean) as NormalizedSocialAccount[];
};

export const publishUploadPostVideo = async ({
  username,
  videoUrl,
  title,
  caption,
  platforms,
  idempotencyKey,
}: {
  username: string;
  videoUrl: string;
  title: string;
  caption: string;
  platforms: SocialPlatform[];
  idempotencyKey: string;
}) => {
  const form = new FormData();
  form.append('video', videoUrl);
  form.append('user', username);
  form.append('title', title || caption || 'Nayla');
  if (caption) form.append('description', caption);
  for (const platform of platforms) {
    const mapped = getSocialNetwork(platform)?.uploadPostPublish;
    if (mapped) form.append('platform[]', mapped);
  }
  return request('/api/upload', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: form,
  });
};

export const getUploadPostAnalytics = async (username: string, platforms: SocialPlatform[]) => {
  const mapped = platforms
    .map((platform) => getSocialNetwork(platform)?.uploadPostPublish)
    .filter(Boolean)
    .join(',');
  if (!mapped) return {};
  return request(`/api/analytics/${encodeURIComponent(username)}?platforms=${encodeURIComponent(mapped)}`);
};

export const getUploadPostComments = async ({
  username,
  platform,
  postId,
  postUrl,
}: {
  username: string;
  platform: SocialPlatform;
  postId?: string | null;
  postUrl?: string | null;
}) => {
  const mapped = getSocialNetwork(platform)?.uploadPostPublish || platform;
  const params = new URLSearchParams({ platform: mapped, user: username, limit: '50' });
  if (postId) params.set('post_id', postId);
  else if (postUrl) params.set('post_url', postUrl);
  else throw new Error('Falta el identificador de la publicación.');
  return request(`/api/uploadposts/comments?${params.toString()}`);
};

export const replyUploadPostComment = async ({
  username,
  platform,
  postId,
  commentId,
  message,
}: {
  username: string;
  platform: SocialPlatform;
  postId: string;
  commentId: string;
  message: string;
}) => {
  const mapped = getSocialNetwork(platform)?.uploadPostPublish || platform;
  return request('/api/uploadposts/comments/create', {
    method: 'POST',
    body: JSON.stringify({
      platform: mapped,
      user: username,
      post_id: postId,
      comment_id: commentId,
      message,
    }),
  });
};

export const listUploadPostConversations = async ({
  username,
  platform,
}: {
  username: string;
  platform: SocialPlatform;
}) => {
  const mapped = getSocialNetwork(platform)?.uploadPostPublish || platform;
  const params = new URLSearchParams({ platform: mapped, user: username });
  return request(`/api/uploadposts/dms/conversations?${params.toString()}`);
};

export const sendUploadPostDm = async ({
  username,
  platform,
  recipientId,
  message,
}: {
  username: string;
  platform: SocialPlatform;
  recipientId: string;
  message: string;
}) => {
  const mapped = getSocialNetwork(platform)?.uploadPostPublish || platform;
  return request('/api/uploadposts/dms/send', {
    method: 'POST',
    body: JSON.stringify({
      platform: mapped,
      user: username,
      recipient_id: recipientId,
      message,
    }),
  });
};
