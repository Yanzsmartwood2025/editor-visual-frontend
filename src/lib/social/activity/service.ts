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
  listZernioCommentThreads,
  listZernioConversations,
  listZernioMessages,
  syncZernioExternalPosts,
} from '../providers/zernio';
import { cacheSocialComments, cacheSocialConversation, extractSocialComments } from './cache';

type ReviewScope = {
  comments: boolean;
  messages: boolean;
  metrics: boolean;
};

type ActivitySample = {
  author: string;
  text: string;
};

type AccountActivity = {
  accountId: string;
  platform: string;
  label: string;
  comments: number;
  conversations: number;
  messages: number;
  inboundMessages: number;
  commentSamples: ActivitySample[];
  messageSamples: ActivitySample[];
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

  const socialObject =
    /\b(comentarios?|comentaron|mensajes?|notificaciones?|actividad|inbox|dm|dms|metricas?|estadisticas?|vistas?|alcance|interacciones?|redes?|seguidores?|impresiones?|likes?|me gusta|reacciones?|escribieron|dijeron)\b/.test(text);

  if (!socialObject) return false;

  const asksToInspect =
    /\b(revisa|revisar|mira|mirar|busca|buscar|trae|traer|lee|leer|verifica|verificar|actualiza|actualizar|consulta|consultar|chequea|chequear|muestra|mostrar|muestrame|dame|necesito|quiero|quiero ver|quiero saber|ensename|dime)\b/.test(text) ||
    /\b(que paso|que hay|como van|como esta|que escribieron|que me escribieron|que dijeron|que me dijeron|quien escribio|quienes escribieron|que comentaron|quien comento|cuales son)\b/.test(text);

  const directSocialRequest =
    /^(comentarios?|mensajes?|notificaciones?|inbox|metricas?|estadisticas?|actividad|redes?)\b/.test(text) ||
    /\b(comentarios?|mensajes?|notificaciones?)\s+(de|del|de los|de las)\s+(usuarios?|seguidores?|gente|personas?)\b/.test(text);

  return asksToInspect || directSocialRequest;
};

export const isExhaustiveSocialActivityRequest = (message: string) => {
  const text = normalize(message);
  const asksAll =
    /\b(todo|todos|toda|todas|completo|completa|completos|completas)\b/.test(text) ||
    /\b(todos los videos|todas las publicaciones|todo el inbox|toda la bandeja)\b/.test(text);
  const socialObject =
    /\b(notificaciones?|comentarios?|mensajes?|inbox|actividad|redes?)\b/.test(text);
  return asksAll && socialObject;
};

export const getSocialActivityReviewScope = (message: string): ReviewScope => {
  const text = normalize(message);

  const mentionsComments =
    /\b(comentarios?|comentaron|comento|comentario de usuarios?|comentarios de usuarios?)\b/.test(text);
  const mentionsMessages =
    /\b(mensajes?|inbox|dm|dms|mensaje privado|mensajes privados|me escribieron|escribieron por privado)\b/.test(text);
  const mentionsNotifications = /\b(notificaciones?|avisos?)\b/.test(text);
  const mentionsMetrics =
    /\b(metricas?|estadisticas?|vistas?|alcance|rendimiento|seguidores?|impresiones?|likes?|me gusta|reacciones?)\b/.test(text);

  const genericActivity =
    /\b(actividad|redes?)\b/.test(text) &&
    !mentionsComments &&
    !mentionsMessages &&
    !mentionsNotifications &&
    !mentionsMetrics;

  const asksEverything =
    /\b(todo|todos|toda|todas|completo|completa)\b/.test(text) &&
    /\b(redes?|actividad)\b/.test(text);

  return {
    comments: mentionsComments || mentionsNotifications || genericActivity || asksEverything,
    messages: mentionsMessages || mentionsNotifications || genericActivity || asksEverything,
    metrics: mentionsMetrics || asksEverything,
  };
};

const nextCursorFrom = (payload: any) =>
  String(
    payload?.pagination?.nextCursor ||
    payload?.pagination?.next_cursor ||
    payload?.pagination?.cursor ||
    payload?.nextCursor ||
    payload?.next_cursor ||
    ''
  ) || null;

const hasMoreFrom = (payload: any) =>
  payload?.pagination?.hasMore === true ||
  payload?.pagination?.has_next === true ||
  payload?.pagination?.hasNext === true ||
  Boolean(nextCursorFrom(payload));

const collectUploadPostMedia = async ({
  username,
  platform,
}: {
  username: string;
  platform: any;
}) => {
  const seen = new Map<string, { id: string; url: string | null }>();
  let cursor: string | null = null;
  let pages = 0;

  do {
    const payload = await listUploadPostMedia({
      username,
      platform,
      limit: 100,
      cursor,
    });
    for (const item of extractMedia(payload)) seen.set(item.id, item);
    cursor = nextCursorFrom(payload);
    pages += 1;
  } while (cursor && pages < 100);

  return Array.from(seen.values());
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

const summarizeExternalEngagement = (payload: any, account?: any) => {
  const posts =
    Array.isArray(payload?.posts) ? payload.posts :
    Array.isArray(payload?.synced?.posts) ? payload.synced.posts :
    Array.isArray(payload?.data?.posts) ? payload.data.posts :
    [];

  const totals = posts.reduce((sum: Record<string, number>, post: any) => {
    const analytics = post?.analytics || {};
    for (const key of ['likes', 'comments', 'shares', 'saves', 'views']) {
      const value = Number(analytics?.[key]);
      if (Number.isFinite(value)) sum[key] = (sum[key] || 0) + value;
    }
    return sum;
  }, {});

  const profileLikes = Number(
    account?.raw?.metadata?.profileData?.extraData?.likesCount ??
    account?.raw?.extraData?.likesCount
  );

  const metrics: Array<{ label: string; value: string | number }> = [];
  if (Number.isFinite(profileLikes)) metrics.push({ label: 'Me gusta', value: profileLikes });
  if (Number.isFinite(totals.comments)) metrics.push({ label: 'Comentarios recientes', value: totals.comments });
  if (Number.isFinite(totals.shares)) metrics.push({ label: 'Compartidos recientes', value: totals.shares });
  if (Number.isFinite(totals.views)) metrics.push({ label: 'Vistas recientes', value: totals.views });
  if (!Number.isFinite(profileLikes) && Number.isFinite(totals.likes)) {
    metrics.push({ label: 'Me gusta recientes', value: totals.likes });
  }
  return metrics;
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

const compactText = (value: unknown, max = 180) => {
  const text = cleanNaylaChatText(String(value || '')).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;
};

const commentSample = (comment: any): ActivitySample | null => {
  const text = compactText(comment?.message || comment?.text || comment?.content || '');
  if (!text) return null;
  const author = compactText(
    comment?.from?.name ||
    comment?.author?.name ||
    comment?.author?.username ||
    comment?.user?.display_name ||
    comment?.user?.username ||
    comment?.username ||
    'Usuario',
    60
  );
  return { author: author || 'Usuario', text };
};

const messageSample = (message: any, fallbackAuthor = 'Usuario'): ActivitySample | null => {
  const text = compactText(message?.message || message?.text || message?.content || message?.body || '');
  if (!text) return null;
  const direction = String(message?.direction || '').toLowerCase();
  if (direction === 'outbound' || message?.isFromMe === true || message?.fromMe === true) return null;
  const author = compactText(
    message?.sender?.name ||
    message?.sender?.username ||
    message?.from?.name ||
    message?.author?.name ||
    message?.user?.display_name ||
    message?.user?.username ||
    fallbackAuthor,
    60
  );
  return { author: author || fallbackAuthor, text };
};

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
  background = false,
  exhaustive = false,
}: {
  userId: string;
  projectId: string;
  account: any;
  username: string;
  background?: boolean;
  exhaustive?: boolean;
}) => {
  const media = exhaustive
    ? await collectUploadPostMedia({ username, platform: account.platform })
    : extractMedia(await listUploadPostMedia({
        username,
        platform: account.platform,
        limit: background ? 8 : 30,
      })).slice(0, background ? 5 : 20);
  let comments = 0;
  const samples: ActivitySample[] = [];

  for (const post of media) {
    try {
      let after: string | null = null;
      let page = 0;
      do {
        const payload = await getUploadPostComments({
          username,
          platform: account.platform,
          postId: post.id,
          postUrl: post.url,
          after,
          limit: 50,
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

        for (const comment of extractSocialComments(payload)) {
          const sample = commentSample(comment);
          if (sample && samples.length < 20) samples.push(sample);
        }

        after = exhaustive && hasMoreFrom(payload) ? nextCursorFrom(payload) : null;
        page += 1;
      } while (after && page < 100);
    } catch {
      // A single post should not abort the rest of the account scan.
    }
  }

  return { comments, inspectedPosts: media.length, samples };
};

const loadZernioComments = async ({
  userId,
  projectId,
  account,
  background = false,
  exhaustive = false,
}: {
  userId: string;
  projectId: string;
  account: any;
  background?: boolean;
  exhaustive?: boolean;
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
    .limit(background ? 6 : 20);

  if (error) throw error;

  const postMap = new Map<string, { postId: string; targetId: string | null }>();
  for (const target of targets || []) {
    const postId = String(target.provider_post_id || '');
    if (postId) postMap.set(postId, { postId, targetId: String(target.id) });
  }

  if (exhaustive) {
    try {
      let cursor: string | null = null;
      let pages = 0;
      do {
        const inbox = await listZernioCommentThreads({
          accountId: String(account.provider_account_id),
          cursor,
          limit: 100,
        });
        const rows =
          Array.isArray(inbox?.data) ? inbox.data :
          Array.isArray(inbox?.items) ? inbox.items :
          Array.isArray(inbox?.posts) ? inbox.posts :
          Array.isArray(inbox?.comments) ? inbox.comments :
          [];
        for (const row of rows) {
          const postId = String(
            row?.postId ||
            row?.platformPostId ||
            row?.platform_post_id ||
            row?.post?.id ||
            row?.post?._id ||
            row?.id ||
            ''
          );
          if (postId) postMap.set(postId, { postId, targetId: null });
        }
        cursor = hasMoreFrom(inbox) ? nextCursorFrom(inbox) : null;
        pages += 1;
      } while (cursor && pages < 100);
    } catch {
      // Fall back to known targets + recent external discovery below.
    }
  }

  try {
    const external = await syncZernioExternalPosts(String(account.provider_account_id));
    const externalPosts =
      Array.isArray(external?.posts) ? external.posts :
      Array.isArray(external?.synced?.posts) ? external.synced.posts :
      Array.isArray(external?.data?.posts) ? external.data.posts :
      [];

    for (const post of externalPosts.slice(0, background ? 8 : 30)) {
      const postId = String(
        post?.platformPostId ||
        post?.platform_post_id ||
        post?.postId ||
        post?.id ||
        ''
      );
      const commentCount = Number(post?.analytics?.comments || 0);
      if (
        postId &&
        !postMap.has(postId) &&
        (commentCount > 0 || externalPosts.length <= 10)
      ) {
        postMap.set(postId, { postId, targetId: null });
      }
    }
  } catch {
    // External-post discovery is a best-effort fallback. Known Nayla posts still work.
  }

  const posts = exhaustive
    ? Array.from(postMap.values())
    : Array.from(postMap.values()).slice(0, background ? 5 : 12);
  let comments = 0;
  const samples: ActivitySample[] = [];

  for (const post of posts) {
    try {
      let cursor: string | null = null;
      let page = 0;
      do {
        const payload = await getZernioComments({
          accountId: String(account.provider_account_id),
          postId: post.postId,
          cursor,
          limit: 100,
        });
        const cached = await cacheSocialComments({
          userId,
          projectId,
          provider: account.provider,
          platform: account.platform,
          account,
          postId: post.postId,
          targetId: post.targetId,
          payload,
        });
        comments += cached.length;

        for (const comment of extractSocialComments(payload)) {
          const sample = commentSample(comment);
          if (sample && samples.length < 20) samples.push(sample);
        }

        cursor = exhaustive && hasMoreFrom(payload) ? nextCursorFrom(payload) : null;
        page += 1;
      } while (cursor && page < 100);
    } catch {
      // A single inaccessible post should not abort the rest of the scan.
    }
  }

  return { comments, inspectedPosts: posts.length, samples };
};

const loadUploadPostMessages = async ({
  userId,
  projectId,
  account,
  username,
  background = false,
  exhaustive = false,
}: {
  userId: string;
  projectId: string;
  account: any;
  username: string;
  background?: boolean;
  exhaustive?: boolean;
}) => {
  if (account.platform !== 'instagram') {
    return { conversations: 0, messages: 0, inbound: 0, samples: [] as ActivitySample[], unavailable: true };
  }

  const payload = await listUploadPostConversations({
    username,
    platform: account.platform,
  });
  const conversations = exhaustive
    ? extractConversations(payload)
    : extractConversations(payload).slice(0, background ? 5 : 15);
  const selectedConversations = conversations;
  let totalMessages = 0;
  let inbound = 0;
  const samples: ActivitySample[] = [];

  for (const conversation of selectedConversations) {
    const cached = await cacheSocialConversation({
      userId,
      projectId,
      account,
      conversation,
    });
    totalMessages += cached.messages;
    inbound += cached.inbound;

    const preview =
      conversation?.lastMessage?.text ||
      conversation?.lastMessage ||
      conversation?.preview ||
      '';
    const author =
      conversation?.participant?.name ||
      conversation?.participant?.username ||
      conversation?.participantName ||
      conversation?.username ||
      'Usuario';
    if (preview && samples.length < 15) {
      samples.push({ author: compactText(author, 60) || 'Usuario', text: compactText(preview) });
    }
  }

  return {
    conversations: selectedConversations.length,
    messages: totalMessages,
    inbound,
    samples,
    unavailable: false,
  };
};

const loadZernioMessages = async ({
  userId,
  projectId,
  account,
  background = false,
  exhaustive = false,
}: {
  userId: string;
  projectId: string;
  account: any;
  background?: boolean;
  exhaustive?: boolean;
}) => {
  const conversations: any[] = [];
  let conversationCursor: string | null = null;
  let conversationPages = 0;

  do {
    const payload = await listZernioConversations({
      accountId: String(account.provider_account_id),
      cursor: conversationCursor,
      limit: exhaustive ? 100 : (background ? 5 : 15),
    });
    conversations.push(...extractConversations(payload));
    conversationCursor = exhaustive && hasMoreFrom(payload) ? nextCursorFrom(payload) : null;
    conversationPages += 1;
  } while (conversationCursor && conversationPages < 100);

  const selectedConversations = exhaustive
    ? conversations
    : conversations.slice(0, background ? 5 : 15);
  let totalMessages = 0;
  let inbound = 0;
  const samples: ActivitySample[] = [];

  for (const conversation of selectedConversations) {
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
      let messageCursor: string | null = null;
      let messagePages = 0;
      do {
        const messagePayload = await listZernioMessages({
          conversationId,
          accountId: String(account.provider_account_id),
          cursor: messageCursor,
          limit: 100,
          sortOrder: 'asc',
        });
        messages.push(...extractMessages(messagePayload));
        messageCursor = exhaustive && hasMoreFrom(messagePayload) ? nextCursorFrom(messagePayload) : null;
        messagePages += 1;
      } while (messageCursor && messagePages < 100);
      if (!exhaustive) messages = messages.slice(background ? -30 : -100);
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

    const fallbackAuthor =
      conversation?.participant?.name ||
      conversation?.participant?.username ||
      conversation?.participantName ||
      conversation?.username ||
      'Usuario';

    for (const rawMessage of messages) {
      const sample = messageSample(rawMessage, fallbackAuthor);
      if (sample && samples.length < 20) samples.push(sample);
    }
  }

  return {
    conversations: selectedConversations.length,
    messages: totalMessages,
    inbound,
    samples,
    unavailable: false,
  };
};

const formatActivity = (activity: AccountActivity[], scope: ReviewScope, exhaustive = false) => {
  if (!activity.length) {
    return 'No encontré cuentas conectadas para revisar.';
  }

  const totalComments = activity.reduce((sum, item) => sum + item.comments, 0);
  const totalInbound = activity.reduce((sum, item) => sum + item.inboundMessages, 0);
  const lines: string[] = [exhaustive
    ? 'Hice un barrido completo de la actividad accesible en tus cuentas conectadas.'
    : 'Revisé tus cuentas conectadas.'];

  for (const item of activity) {
    const details: string[] = [];
    if (scope.comments) details.push(exhaustive
      ? `${item.comments} comentario${item.comments === 1 ? '' : 's'} encontrado${item.comments === 1 ? '' : 's'}`
      : `${item.comments} comentario${item.comments === 1 ? '' : 's'} reciente${item.comments === 1 ? '' : 's'}`);
    if (scope.messages) details.push(`${item.inboundMessages} mensaje${item.inboundMessages === 1 ? '' : 's'} entrante${item.inboundMessages === 1 ? '' : 's'}`);
    if (scope.metrics && item.metrics.length) {
      details.push(item.metrics.slice(0, 4).map((metric) => `${metric.label}: ${metric.value}`).join(' · '));
    }

    lines.push('');
    lines.push(item.label);
    lines.push(details.length ? details.join(' · ') : 'Sin actividad compatible visible en esta conexión.');

    if (scope.comments && item.commentSamples.length) {
      lines.push(exhaustive ? 'Comentarios encontrados:' : 'Comentarios recientes:');
      for (const sample of item.commentSamples.slice(0, 12)) {
        lines.push(`${sample.author}: ${sample.text}`);
      }
      if (item.comments > 12) lines.push(`Y ${item.comments - 12} comentarios más guardados en Nayla.`);
    }

    if (scope.messages && item.messageSamples.length) {
      lines.push(exhaustive ? 'Mensajes encontrados:' : 'Mensajes recientes:');
      for (const sample of item.messageSamples.slice(0, 10)) {
        lines.push(`${sample.author}: ${sample.text}`);
      }
      if (item.inboundMessages > 10) lines.push(`Y ${item.inboundMessages - 10} mensajes más guardados en Nayla.`);
    }

    for (const note of item.notes.slice(0, 2)) lines.push(note);
  }

  lines.push('');
  if (scope.comments && scope.messages) {
    lines.push(`Total encontrado: ${totalComments} comentarios y ${totalInbound} mensajes entrantes.`);
  } else if (scope.comments) {
    lines.push(exhaustive
      ? `Total encontrado: ${totalComments} comentarios accesibles.`
      : `Total encontrado: ${totalComments} comentarios recientes disponibles.`);
  } else if (scope.messages) {
    lines.push(`Total encontrado: ${totalInbound} mensajes entrantes disponibles.`);
  }

  lines.push('La actividad encontrada quedó guardada para que puedas pedirme respuestas o preguntar por una persona después.');

  return cleanNaylaChatText(lines.join('\n'));
};

export const reviewConnectedSocialActivity = async ({
  userId,
  projectId,
  message,
  background = false,
}: {
  userId: string;
  projectId: string;
  message: string;
  background?: boolean;
}) => {
  const scope = getSocialActivityReviewScope(message);
  const exhaustive = !background && isExhaustiveSocialActivityRequest(message);
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

  const grouped = chooseActivityAccounts(accounts || []);
  const selected = exhaustive ? grouped : grouped.slice(0, background ? 6 : 12);
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
      commentSamples: [],
      messageSamples: [],
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
              background,
              exhaustive,
            })
          : await loadZernioComments({
              userId,
              projectId,
              account: routes.comments,
              background,
              exhaustive,
            });

        item.comments = result.comments;
        item.commentSamples = result.samples || [];
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
              background,
              exhaustive,
            })
          : await loadUploadPostMessages({
              userId,
              projectId,
              account: routes.messages,
              username: profile.upload_post_username,
              background,
              exhaustive,
            });

        item.conversations = result.conversations;
        item.messages = result.messages;
        item.inboundMessages = result.inbound;
        item.messageSamples = result.samples || [];
        if (result.unavailable) item.notes.push('Los mensajes privados no están disponibles en esta conexión.');
      } catch (error) {
        item.notes.push(error instanceof Error ? error.message : 'No pude leer mensajes en esta red.');
      }
    }

    if (scope.metrics && routes.metrics) {
      try {
        let metrics: Array<{ label: string; value: string | number }> = [];

        if (routes.metrics.provider === 'upload_post') {
          const payload = await getUploadPostAnalytics(profile.upload_post_username, [routes.metrics.platform]);
          metrics = summarizeMetrics(payload);
        } else {
          try {
            const payload = await getZernioAnalytics({
              profileId: profile.zernio_profile_id,
              accountId: routes.metrics.provider_account_id,
              platform: routes.metrics.platform,
            });
            metrics = summarizeMetrics(payload);
          } catch {
            metrics = [];
          }

          if (!metrics.length) {
            const external = await syncZernioExternalPosts(String(routes.metrics.provider_account_id));
            metrics = summarizeExternalEngagement(external, routes.metrics);
          }
        }

        item.metrics = metrics;
        if (item.metrics.length) {
          await supabase.from('social_metrics_snapshots').insert({
            user_id: userId,
            project_id: projectId,
            account_id: routes.metrics.id,
            provider: routes.metrics.provider,
            platform: routes.metrics.platform,
            metrics: Object.fromEntries(item.metrics.map((metric) => [metric.label, metric.value])),
            captured_at: new Date().toISOString(),
          });
        } else {
          item.notes.push('La red no devolvió métricas resumidas en este momento.');
        }
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
    exhaustive,
    activity,
    peopleCount: peopleCount || 0,
    text: formatActivity(activity, scope, exhaustive),
  };
};

export const syncInboundSocialActivity = async (limitWorkspaces = 8) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from('social_accounts')
    .select('user_id,project_id,last_synced_at')
    .eq('status', 'connected')
    .order('last_synced_at', { ascending: true, nullsFirst: true })
    .limit(Math.max(1, Math.min(100, limitWorkspaces * 12)));

  if (error) throw error;

  const workspaces = new Map<string, { userId: string; projectId: string }>();
  for (const row of rows || []) {
    const key = `${row.user_id}:${row.project_id}`;
    if (!workspaces.has(key)) {
      workspaces.set(key, { userId: String(row.user_id), projectId: String(row.project_id) });
    }
    if (workspaces.size >= limitWorkspaces) break;
  }

  let reviewed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const workspace of workspaces.values()) {
    try {
      await reviewConnectedSocialActivity({
        userId: workspace.userId,
        projectId: workspace.projectId,
        message: 'Revisa comentarios y mensajes de todas las redes.',
        background: true,
      });
      reviewed += 1;
    } catch (error) {
      failed += 1;
      if (errors.length < 5) {
        errors.push(error instanceof Error ? error.message : 'Error revisando actividad.');
      }
    }
  }

  return {
    workspaces: workspaces.size,
    reviewed,
    failed,
    errors,
  };
};
