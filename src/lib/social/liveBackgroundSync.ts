import { getWorkspaceSupabaseAdmin } from '../workspaceStore';
import { getZernioAnalytics } from './providers/zernio';

const PROGRAM_KEY = 'synthetic_soul';
const YOUTUBE_HANDLE = 'aria38000';
const PAGE_SIZE = 100;

type AnalyticsPost = Record<string, any>;

const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

const youtubeIdFromUrl = (value: unknown) => {
  const url = String(value || '').trim();
  if (!url) return '';
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/i);
  return match?.[1] || '';
};

const youtubePlatformRow = (post: AnalyticsPost) => {
  const rows = Array.isArray(post?.platformAnalytics) ? post.platformAnalytics : [];
  return rows.find((item: any) => String(item?.platform || '').toLowerCase() === 'youtube') || null;
};

const youtubePostId = (post: AnalyticsPost) => {
  const platformRow = youtubePlatformRow(post);
  const direct = String(
    platformRow?.platformPostId ||
    post?.platformPostId ||
    post?.externalPostId ||
    '',
  ).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(direct)) return direct;

  return youtubeIdFromUrl(
    platformRow?.platformPostUrl ||
    post?.platformPostUrl ||
    post?.url ||
    post?.permalink,
  );
};

const postUrl = (post: AnalyticsPost, videoId: string) => {
  const platformRow = youtubePlatformRow(post);
  const candidate = String(
    platformRow?.platformPostUrl ||
    post?.platformPostUrl ||
    post?.url ||
    post?.permalink ||
    '',
  ).trim();
  return candidate || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
};

const syntheticSoulContent = (post: AnalyticsPost) => {
  const candidates = [
    post?.content,
    post?.caption,
    post?.description,
    post?.title,
  ].filter((value) => typeof value === 'string' && value.trim());

  return candidates.join('\n').trim();
};

const cleanTitle = (post: AnalyticsPost, content: string) => {
  const explicit = String(post?.title || '').trim();
  if (explicit) return explicit.slice(0, 150);

  const beforeHashtags = content.split(/\s+#/)[0] || content;
  return beforeHashtags
    .replace(/[🌸🧬]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150) || 'Synthetic Soul';
};

async function loadWindow({
  accountId,
  fromDate,
  toDate,
}: {
  accountId: string;
  fromDate: string;
  toDate: string;
}) {
  const posts: AnalyticsPost[] = [];

  for (let page = 1; page <= 20; page += 1) {
    const payload = await getZernioAnalytics({
      accountId,
      platform: 'youtube',
      fromDate,
      toDate,
      page,
      limit: PAGE_SIZE,
      source: 'all',
    });

    const pagePosts = Array.isArray(payload?.posts)
      ? payload.posts
      : Array.isArray(payload?.data?.posts)
        ? payload.data.posts
        : [];

    posts.push(...pagePosts);

    const pagination = payload?.pagination || payload?.data?.pagination || {};
    const totalPages = Number(pagination?.pages || 0);
    const hasMore = typeof pagination?.hasMore === 'boolean'
      ? pagination.hasMore
      : totalPages > 0
        ? page < totalPages
        : pagePosts.length >= PAGE_SIZE;

    if (!hasMore || pagePosts.length === 0) break;
  }

  return posts;
}

export async function syncSyntheticSoulLiveLibrary() {
  const supabase = getWorkspaceSupabaseAdmin();

  const { data: account, error: accountError } = await supabase
    .from('social_accounts')
    .select('provider_account_id,handle,username,status')
    .eq('provider', 'zernio')
    .eq('platform', 'youtube')
    .eq('status', 'connected')
    .eq('handle', YOUTUBE_HANDLE)
    .maybeSingle();

  if (accountError) throw accountError;
  if (!account?.provider_account_id) {
    return { scanned: 0, matched: 0, upserted: 0, reason: 'youtube_account_not_found' };
  }

  const today = new Date();
  const windows = [
    { fromDate: '2025-05-01', toDate: '2026-04-30' },
    { fromDate: '2026-05-01', toDate: dateOnly(today) },
  ];

  const allPosts: AnalyticsPost[] = [];
  for (const window of windows) {
    allPosts.push(...await loadWindow({
      accountId: String(account.provider_account_id),
      ...window,
    }));
  }

  const unique = new Map<string, AnalyticsPost>();
  for (const post of allPosts) {
    const content = syntheticSoulContent(post);
    if (!/#SyntheticSoul\b/i.test(content)) continue;
    const videoId = youtubePostId(post);
    if (!videoId) continue;
    unique.set(videoId, post);
  }

  const rows = Array.from(unique.entries()).map(([videoId, post]) => {
    const content = syntheticSoulContent(post);
    const platformRow = youtubePlatformRow(post);
    const publishedAt = String(post?.publishedAt || platformRow?.publishedAt || '').trim();

    return {
      program_key: PROGRAM_KEY,
      platform: 'youtube',
      provider_post_id: videoId,
      video_id: videoId,
      source_url: postUrl(post, videoId),
      title: cleanTitle(post, content),
      caption: content.slice(0, 5000),
      published_at: publishedAt || null,
      duration_seconds: 60,
      enabled: true,
      priority: 100,
      metadata: {
        classification_source: 'zernio_analytics_hashtag',
        account_handle: YOUTUBE_HANDLE,
      },
      updated_at: new Date().toISOString(),
    };
  });

  if (rows.length) {
    const { error: upsertError } = await supabase
      .from('aria_live_background_tracks')
      .upsert(rows, { onConflict: 'platform,provider_post_id' });

    if (upsertError) throw upsertError;
  }

  return {
    scanned: allPosts.length,
    matched: rows.length,
    upserted: rows.length,
    windows,
  };
}
