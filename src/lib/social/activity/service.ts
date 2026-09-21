import { getWorkspaceSupabaseAdmin } from '../../workspaceStore';
import { cleanNaylaChatText } from '../../naylaText';
import { getSocialNetwork } from '../types';
import { ensureSocialProfile } from '../store';
import {
  getUploadPostAnalytics,
  getUploadPostComments,
  listUploadPostConversations,
  listUploadPostMedia,
} from '../providers/uploadPost';
import {
  getZernioAnalytics,
  getZernioComments,
  listZernioConversations,
  listZernioMessages,
} from '../providers/zernio';
import { cacheSocialComments, cacheSocialConversation } from './cache';

type ReviewScope = {
  comments: boolean;
  messages: boolean;
  metrics: boolean;
};

type AccountActivity = {
  accountId: string;
  platform: string;
  label: string;
  comments: number;
  conversations: number;
  messages: number;
  inboundMessages: number;
  metrics: Array<{ label: string; value: string | number }>;
  notes: string[];
};

const normalize = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const isSocialActivityReviewRequest = (message: string) => {
  const text = normalize(message);
  if (!text) return false;

  const asksToInspect =
    /\b(revisa|revisar|mira|mirar|busca|buscar|trae|traer|lee|leer|verifica|verificar|actualiza|actualizar|consulta|consultar|chequea|chequear)\b/.test(text) ||
    /\b(que paso|que hay|como van|como esta)\b/.test(text);

  const socialObject =
    /\b(comentarios?|mensajes?|notificaciones?|actividad|inbox|metricas?|estadisticas?|vistas?|alcance|interacciones?|redes?)\b/.test(text);

  return asksToInspect && socialObject;
};

const reviewScope = (message: string): ReviewScope => {
  const text = normalize(message);
  const broad =
    /\b(actividad|redes|todo|todos|toda|todas|que paso|que hay|como van)\b/.test(text) &&
    !/\bsolo\b/.test(text);

  const comments = broad || /\b(comentarios?|comentaron|notificaciones?)\b/.test(text);
  const messages = broad || /\b(mensajes?|inbox|dm|dms|notificaciones?)\b/.test(text);
  const metrics =
    /\b(metricas?|estadisticas?|vistas?|alcance|rendimiento|seguidores?|impresiones?)\b/.test(text) ||
    (/\b(todo|todos|toda|todas)\b/.test(text) && /\b(redes?|actividad)\b/.test(text));

  return {
    comments,
    messages,
    metrics,
  };
};

const extractMedia = (payload: any) => {
  const source =
    Array.isArray(payload?.media) ? payload.media :
    Array.isArray(payload?.data) ? payload.data :
    Array.isArray(payload?.items) ? payload.items :
    [];

  return source
    .map((item: any) => ({
      id: String(item?.id || item?.media_id || item?.post_id || ''),
      url: item?.permalink || item?.url || item?.post_url || null,
    }))
    .filter((item: any) => item.id);
};

const extractConversations = (payload: any) =>
  Array.isArray(payload?.conversations) ? payload.conversations :
  Array.isArray(payload?.data?.conversations) ? payload.data.conversations :
  Array.isArray(payload?.data) ? payload.data :
  Array.isArray(payload?.items) ? payload.items :
  [];

const extractMessages = (payload: any) =>
  Array.isArray(payload?.messages) ? payload.messages :
  Array.isArray(payload?.data?.messages) ? payload.data.messages :
  Array.isArray(payload?.data) ? payload.data :
  Array.isArray(payload?.items) ? payload.items :
  [];

const metricLabels: Record<string, string> = {
  followers: 'Seguidores',
  follower_count: 'Seguidores',
  reach: 'Alcance',
  impressions: 'Impresiones',
  profileviews: 'Visitas al perfil',
  profile_views: 'Visitas al perfil',
  views: 'Vistas',
  videoviews: 'Vistas de video',
  video_views: 'Vistas de video',
  likes: 'Me gusta',
  comments: 'Comentarios',
  shares: 'Compartidos',
  saves: 'Guardados',
  clicks: 'Clics',
  engagement: 'Interacción',
};

const collectMetricScalars = (
  value: any,
  out: Array<{ key: string; value: string | number }> = [],
  prefix = '',
  depth = 0
) => {
  if (out.length >= 8 || depth > 3 || value == null) return out;

  if (typeof value === 'number' || typeof value === 'string') {
    const rawKey = prefix.split('.').pop() || 'valor';
    const numericLike = typeof value === 'number' || /^-?\d+(?:[.,]\d+)?$/.test(String(value));
    if (numericLike) out.push({ key: rawKey, value });
    return out;
  }

  if (Array.isArray(value)) {
    for (const item of value.slice(0, 3)) collectMetricScalars(item, out, prefix, depth + 1);
    return out;
  }

  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      collectMetricScalars(child, out, prefix ? `${prefix}.${key}` : key, depth + 1);
      if (out.length >= 8) break;
    }
  }

  return out;
};

const summarizeMetrics = (payload: any) => {
  const root = payload?.analytics || payload;
  const candidates =
    root?.totals ||
    root?.summary ||
    root?.metrics ||
    root?.data?.totals ||
    root?.data?.summary ||
    root?.data?.metrics ||
    root;

  const seen = new Set<string>();
  return collectMetricScalars(candidates)
    .map((item) => {
      const normalizedKey = normalize(item.key).replace(/\s/g, '_');
      const compact = normalizedKey.replace(/_/g, '');
      const label =
        metricLabels[normalizedKey] ||
        metricLabels[compact] ||
        item.key.replace(/_/g, ' ');
      return { label, value: item.value };
    })
    .filter((item) => {
      const key = item.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
};

const accountIdentity = (account: any) => {
  const identity = String(
    account.handle ||
    account.username ||
    account.display_name ||
    account.provider_account_id ||
    account.id
  )
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  return `${account.platform}:${identity}`;
};

const chooseActivityAccounts = (accounts: any[]) => {
  const groups = new Map<string, any[]>();

  for (const account of accounts) {
    const key = accountIdentity(account);
    const bucket = groups.get(key) || [];
    bucket.push(account);
    groups.set(key, bucket);
  }

  return Array.from(groups.values()).map((group) => ({
    comments:
      group.find((account) => account.provider === 'upload_post') ||
      group.find((account) => account.provider === 'zernio') ||
      group[0],
    messages:
      group.find((account) => account.provider === 'zernio') ||
      group.find((account) => account.provider === 'upload_post') ||
      group[0],
    metrics:
      group.find((account) => account.provider === 'upload_post') ||
      group.find((account) => account.provider === 'zernio') ||
      group[0],
  }));
};

const loadUploadPostComments = async ({
  userId,
  projectId,
  account,
  username,
}: {
  userId: string;
  projectId: string;
  account: any;
  username: string;
}) => {
  const mediaPayload = await listUploadPostMedia({
    username,
    platform: account.platform,
    limit: 12,
  });
  const media = extractMedia(mediaPayload).slice(0, 8);
  let comments = 0;

  for (const post of media) {
    try {
      const payload = await getUploadPostComments({
        username,
        platform: account.platform,
        postId: post.id,
        postUrl: post.url,
      });
      const cached = await cacheSocialComments({
        userId,
        projectId,
        provider: account.provider,
        platform: account.platform,
        account,
        postId: post.id,
        targetId: null,
        payload,
      });
      comments += cached.length;
    } catch {
      // A single post should not abort the rest of the account scan.
    }
  }

  return { comments, inspectedPosts: media.length };
};

const loadZernioComments = async ({
  userId,
  projectId,
  account,
}: {
  userId: string;
  projectId: string;
  account: any;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data: targets, error } = await supabase
    .from('social_post_targets')
    .select('id,provider_post_id')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('account_id', account.id)
    .not('provider_post_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(8);

  if (error) throw error;

  let comments = 0;
  for (const target of targets || []) {
    try {
      const postId = String(target.provider_post_id || '');
      if (!postId) continue;
      const payload = await getZernioComments({
        accountId: String(account.provider_account_id),
        postId,
      });
      const cached = await cacheSocialComments({
        userId,
        projectId,
        provider: account.provider,
        platform: account.platform,
        account,
        postId,
        targetId: target.id,
        payload,
      });
      comments += cached.length;
    } catch {
      // Continue scanning other known posts.
    }
  }

  return { comments, inspectedPosts: (targets || []).length };
};

const loadUploadPostMessages = async ({
  userId,
  projectId,
  account,
  username,
}: {
  userId: string;
  projectId: string;
  account: any;
  username: string;
}) => {
  if (account.platform !== 'instagram') {
    return { conversations: 0, messages: 0, inbound: 0, unavailable: true };
  }

  const payload = await listUploadPostConversations({
    username,
    platform: account.platform,
  });
  const conversations = extractConversations(payload).slice(0, 10);
  let totalMessages = 0;
  let inbound = 0;

  for (const conversation of conversations) {
    const cached = await cacheSocialConversation({
      userId,
      projectId,
      account,
      conversation,
    });
    totalMessages += cached.messages;
    inbound += cached.inbound;
  }

  return {
    conversations: conversations.length,
    messages: totalMessages,
    inbound,
    unavailable: false,
  };
};

const loadZernioMessages = async ({
  userId,
  projectId,
  account,
}: {
  userId: string;
  projectId: string;
  account: any;
}) => {
  const payload = await listZernioConversations(String(account.provider_account_id));
  const conversations = extractConversations(payload).slice(0, 10);
  let totalMessages = 0;
  let inbound = 0;

  for (const conversation of conversations) {
    const conversationId = String(
      conversation?.id ||
      conversation?._id ||
      conversation?.conversation_id ||
      conversation?.conversationId ||
      ''
    );
    if (!conversationId) continue;

    let messages: any[] = [];
    try {
      const messagePayload = await listZernioMessages(
        conversationId,
        String(account.provider_account_id)
      );
      messages = extractMessages(messagePayload).slice(-60);
    } catch {
      messages = [];
    }

    const cached = await cacheSocialConversation({
      userId,
      projectId,
      account,
      conversation,
      messages,
    });
    totalMessages += cached.messages;
    inbound += cached.inbound;
  }

  return {
    conversations: conversations.length,
    messages: totalMessages,
    inbound,
    unavailable: false,
  };
};

const formatActivity = (activity: AccountActivity[], scope: ReviewScope) => {
  if (!activity.length) {
    return 'No encontré cuentas conectadas para revisar.';
  }

  const totalComments = activity.reduce((sum, item) => sum + item.comments, 0);
  const totalInbound = activity.reduce((sum, item) => sum + item.inboundMessages, 0);
  const lines: string[] = ['Revisé tus cuentas conectadas.'];

  for (const item of activity) {
    const details: string[] = [];
    if (scope.comments) details.push(`${item.comments} comentario${item.comments === 1 ? '' : 's'} visible${item.comments === 1 ? '' : 's'}`);
    if (scope.messages) details.push(`${item.inboundMessages} mensaje${item.inboundMessages === 1 ? '' : 's'} entrante${item.inboundMessages === 1 ? '' : 's'}`);
    if (scope.metrics && item.metrics.length) {
      details.push(item.metrics.slice(0, 3).map((metric) => `${metric.label}: ${metric.value}`).join(' · '));
    }

    lines.push('');
    lines.push(item.label);
    lines.push(details.length ? details.join(' · ') : 'Sin actividad compatible visible en esta conexión.');
    for (const note of item.notes.slice(0, 2)) lines.push(note);
  }

  lines.push('');
  if (scope.comments || scope.messages) {
    lines.push(`Total encontrado: ${totalComments} comentarios y ${totalInbound} mensajes entrantes.`);
  }
  lines.push('Ya guardé la actividad nueva para que Nayla pueda reconocer a las personas y trabajar con esos comentarios o mensajes.');

  return cleanNaylaChatText(lines.join('\n'));
};

export const reviewConnectedSocialActivity = async ({
  userId,
  projectId,
  message,
}: {
  userId: string;
  projectId: string;
  message: string;
}) => {
  const scope = reviewScope(message);
  const supabase = getWorkspaceSupabaseAdmin();
  const profile = await ensureSocialProfile(userId, projectId);

  const { data: accounts, error } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('status', 'connected')
    .order('platform');

  if (error) throw error;

  const selected = chooseActivityAccounts(accounts || []).slice(0, 12);
  const activity: AccountActivity[] = [];

  for (const routes of selected) {
    const base = routes.comments || routes.messages || routes.metrics;
    if (!base) continue;

    const label = getSocialNetwork(base.platform)?.label || String(base.platform || 'Red');
    const handle = base.handle || base.username || base.display_name || '';
    const item: AccountActivity = {
      accountId: base.id,
      platform: base.platform,
      label: handle
        ? `${label} · ${String(handle).startsWith('@') ? handle : '@' + handle}`
        : label,
      comments: 0,
      conversations: 0,
      messages: 0,
      inboundMessages: 0,
      metrics: [],
      notes: [],
    };

    if (scope.comments && routes.comments) {
      try {
        const result = routes.comments.provider === 'upload_post'
          ? await loadUploadPostComments({
              userId,
              projectId,
              account: routes.comments,
              username: profile.upload_post_username,
            })
          : await loadZernioComments({
              userId,
              projectId,
              account: routes.comments,
            });

        item.comments = result.comments;
        if (!result.inspectedPosts) item.notes.push('No encontré publicaciones recientes accesibles para revisar comentarios.');
      } catch (error) {
        item.notes.push(error instanceof Error ? error.message : 'No pude leer comentarios en esta red.');
      }
    }

    if (scope.messages && routes.messages) {
      try {
        const result = routes.messages.provider === 'zernio'
          ? await loadZernioMessages({
              userId,
              projectId,
              account: routes.messages,
            })
          : await loadUploadPostMessages({
              userId,
              projectId,
              account: routes.messages,
              username: profile.upload_post_username,
            });

        item.conversations = result.conversations;
        item.messages = result.messages;
        item.inboundMessages = result.inbound;
        if (result.unavailable) item.notes.push('Los mensajes privados no están disponibles en esta conexión.');
      } catch (error) {
        item.notes.push(error instanceof Error ? error.message : 'No pude leer mensajes en esta red.');
      }
    }

    if (scope.metrics && routes.metrics) {
      try {
        const payload = routes.metrics.provider === 'upload_post'
          ? await getUploadPostAnalytics(profile.upload_post_username, [routes.metrics.platform])
          : await getZernioAnalytics({
              profileId: profile.zernio_profile_id,
              accountId: routes.metrics.provider_account_id,
              platform: routes.metrics.platform,
            });
        item.metrics = summarizeMetrics(payload);
        if (!item.metrics.length) item.notes.push('La red no devolvió métricas resumidas en este momento.');
      } catch (error) {
        item.notes.push(error instanceof Error ? error.message : 'No pude leer las métricas en esta red.');
      }
    }

    activity.push(item);
  }

  const { count: peopleCount } = await supabase
    .from('social_people')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('project_id', projectId);

  return {
    scope,
    activity,
    peopleCount: peopleCount || 0,
    text: formatActivity(activity, scope),
  };
};
