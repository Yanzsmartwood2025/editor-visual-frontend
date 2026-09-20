import { getProviderCandidates } from './registry';
import type {
  MediaCapability,
  StockMediaKind,
  StockMediaResult,
  StockSearchRequest,
  StockSearchResponse,
} from './types';

type JsonRecord = Record<string, any>;

const boundedLimit = (limit?: number) => Math.min(Math.max(Math.floor(limit || 12), 1), 40);

const capabilityForKind = (kind: StockMediaKind): MediaCapability => {
  if (kind === 'image') return 'stock_image';
  if (kind === 'video') return 'stock_video';
  return 'stock_audio';
};

const fetchJson = async (url: string, init?: RequestInit): Promise<JsonRecord> => {
  const response = await fetch(url, init);
  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${raw.replace(/\s+/g, ' ').slice(0, 180)}`);
  }

  if (!raw) return {};

  try {
    return JSON.parse(raw) as JsonRecord;
  } catch {
    throw new Error(`Respuesta JSON inválida de proveedor: ${raw.replace(/\s+/g, ' ').slice(0, 180)}`);
  }
};

const searchPexels = async (
  query: string,
  kind: StockMediaKind,
  limit: number
): Promise<StockMediaResult[]> => {
  const apiKey = process.env.PEXELS_API_KEY?.trim();
  if (!apiKey) throw new Error('PEXELS_API_KEY no está configurada.');

  if (kind === 'audio') return [];

  const endpoint =
    kind === 'image'
      ? 'https://api.pexels.com/v1/search'
      : 'https://api.pexels.com/v1/videos/search';

  const params = new URLSearchParams({
    query,
    per_page: String(limit),
  });

  const data = await fetchJson(`${endpoint}?${params.toString()}`, {
    headers: { Authorization: apiKey },
  });

  if (kind === 'image') {
    return (Array.isArray(data.photos) ? data.photos : []).map((photo: JsonRecord) => ({
      id: `pexels:image:${String(photo.id)}`,
      provider: 'pexels' as const,
      kind: 'image' as const,
      title: photo.alt || `Pexels ${photo.id}`,
      sourceUrl: photo.url,
      previewUrl: photo.src?.medium || photo.src?.small || photo.src?.tiny,
      mediaUrl: photo.src?.original || photo.src?.large2x || photo.src?.large,
      creator: photo.photographer,
      creatorUrl: photo.photographer_url,
      width: Number(photo.width) || undefined,
      height: Number(photo.height) || undefined,
      licenseName: 'Pexels License',
      licenseUrl: 'https://www.pexels.com/license/',
      attribution: photo.photographer
        ? `Photo by ${photo.photographer} on Pexels`
        : 'Photo provided by Pexels',
      metadata: {
        pexelsId: photo.id,
        avgColor: photo.avg_color,
      },
    }));
  }

  return (Array.isArray(data.videos) ? data.videos : []).map((video: JsonRecord) => {
    const files = Array.isArray(video.video_files) ? [...video.video_files] : [];
    files.sort((a: JsonRecord, b: JsonRecord) => (Number(b.width) || 0) - (Number(a.width) || 0));
    const preferred = files.find((file: JsonRecord) => file.quality === 'hd') || files[0];

    return {
      id: `pexels:video:${String(video.id)}`,
      provider: 'pexels' as const,
      kind: 'video' as const,
      title: `Pexels video ${video.id}`,
      sourceUrl: video.url,
      previewUrl: video.image,
      mediaUrl: preferred?.link,
      creator: video.user?.name,
      creatorUrl: video.user?.url,
      width: Number(video.width) || Number(preferred?.width) || undefined,
      height: Number(video.height) || Number(preferred?.height) || undefined,
      durationSeconds: Number(video.duration) || undefined,
      licenseName: 'Pexels License',
      licenseUrl: 'https://www.pexels.com/license/',
      attribution: video.user?.name
        ? `Video by ${video.user.name} on Pexels`
        : 'Video provided by Pexels',
      metadata: {
        pexelsId: video.id,
        fileType: preferred?.file_type,
        quality: preferred?.quality,
      },
    };
  });
};

const searchPixabay = async (
  query: string,
  kind: StockMediaKind,
  limit: number
): Promise<StockMediaResult[]> => {
  const apiKey = process.env.PIXABAY_API_KEY?.trim();
  if (!apiKey) throw new Error('PIXABAY_API_KEY no está configurada.');

  if (kind === 'audio') return [];

  const endpoint =
    kind === 'image'
      ? 'https://pixabay.com/api/'
      : 'https://pixabay.com/api/videos/';

  const params = new URLSearchParams({
    key: apiKey,
    q: query,
    per_page: String(Math.max(limit, 3)),
    safesearch: 'true',
  });
  if (kind === 'image') params.set('image_type', 'photo');

  const data = await fetchJson(`${endpoint}?${params.toString()}`);
  const hits = Array.isArray(data.hits) ? data.hits : [];

  if (kind === 'image') {
    return hits.map((hit: JsonRecord) => ({
      id: `pixabay:image:${String(hit.id)}`,
      provider: 'pixabay' as const,
      kind: 'image' as const,
      title: hit.tags || `Pixabay ${hit.id}`,
      sourceUrl: hit.pageURL,
      previewUrl: hit.webformatURL || hit.previewURL,
      mediaUrl: hit.largeImageURL || hit.webformatURL,
      creator: hit.user,
      creatorUrl: hit.user_id ? `https://pixabay.com/users/${hit.user}-${hit.user_id}/` : undefined,
      width: Number(hit.imageWidth) || undefined,
      height: Number(hit.imageHeight) || undefined,
      licenseName: 'Pixabay Content License',
      licenseUrl: 'https://pixabay.com/service/license-summary/',
      attribution: hit.user ? `Image by ${hit.user} from Pixabay` : 'Image from Pixabay',
      metadata: {
        pixabayId: hit.id,
        tags: hit.tags,
      },
    }));
  }

  return hits.map((hit: JsonRecord) => {
    const video = hit.videos?.medium || hit.videos?.large || hit.videos?.small || hit.videos?.tiny;
    const previewUrl = hit.picture_id
      ? `https://i.vimeocdn.com/video/${hit.picture_id}_295x166.jpg`
      : undefined;

    return {
      id: `pixabay:video:${String(hit.id)}`,
      provider: 'pixabay' as const,
      kind: 'video' as const,
      title: hit.tags || `Pixabay video ${hit.id}`,
      sourceUrl: hit.pageURL,
      previewUrl,
      mediaUrl: video?.url,
      creator: hit.user,
      creatorUrl: hit.user_id ? `https://pixabay.com/users/${hit.user}-${hit.user_id}/` : undefined,
      width: Number(video?.width) || undefined,
      height: Number(video?.height) || undefined,
      durationSeconds: Number(hit.duration) || undefined,
      licenseName: 'Pixabay Content License',
      licenseUrl: 'https://pixabay.com/service/license-summary/',
      attribution: hit.user ? `Video by ${hit.user} from Pixabay` : 'Video from Pixabay',
      metadata: {
        pixabayId: hit.id,
        tags: hit.tags,
        fileSize: video?.size,
      },
    };
  });
};

let openverseTokenCache:
  | { token: string; expiresAt: number }
  | undefined;

const getOpenverseAccessToken = async (): Promise<string | undefined> => {
  const clientId = process.env.OPENVERSE_CLIENT_ID?.trim();
  const clientSecret = process.env.OPENVERSE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return undefined;

  if (openverseTokenCache && openverseTokenCache.expiresAt > Date.now() + 60_000) {
    return openverseTokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  try {
    const data = await fetchJson('https://api.openverse.org/v1/auth_tokens/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!data.access_token) return undefined;

    const expiresIn = Math.max(Number(data.expires_in) || 3600, 60);
    openverseTokenCache = {
      token: String(data.access_token),
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return openverseTokenCache.token;
  } catch (error) {
    console.warn('[mediaProviders/openverse] OAuth falló; se continúa en modo anónimo.', error);
    return undefined;
  }
};

const searchOpenverse = async (
  query: string,
  kind: StockMediaKind,
  limit: number
): Promise<StockMediaResult[]> => {
  if (kind === 'video') return [];

  const endpoint =
    kind === 'image'
      ? 'https://api.openverse.org/v1/images/'
      : 'https://api.openverse.org/v1/audio/';

  const params = new URLSearchParams({
    q: query,
    page_size: String(limit),
  });

  const accessToken = await getOpenverseAccessToken();
  const headers = accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined;
  const data = await fetchJson(`${endpoint}?${params.toString()}`, { headers });
  const results = Array.isArray(data.results) ? data.results : [];

  return results.map((item: JsonRecord) => ({
    id: `openverse:${kind}:${String(item.id)}`,
    provider: 'openverse' as const,
    kind,
    title: item.title || `Openverse ${item.id}`,
    sourceUrl:
      item.frontend_redirect ||
      item.foreign_landing_url ||
      item.detail_url ||
      item.url,
    previewUrl: item.thumbnail || undefined,
    mediaUrl: item.url || undefined,
    creator: item.creator || undefined,
    creatorUrl: item.creator_url || undefined,
    width: Number(item.width) || undefined,
    height: Number(item.height) || undefined,
    durationSeconds: Number(item.duration) || undefined,
    licenseName: item.license ? String(item.license).toUpperCase() : 'Open license',
    licenseUrl: item.license_url || undefined,
    attribution: item.attribution || undefined,
    metadata: {
      source: item.source,
      providerName: item.provider,
      category: item.category,
      filetype: item.filetype,
    },
  }));
};

const dedupeResults = (items: StockMediaResult[]): StockMediaResult[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.sourceUrl || item.mediaUrl || item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const searchStockMedia = async (
  request: StockSearchRequest
): Promise<StockSearchResponse> => {
  const query = request.query.trim();
  if (!query) throw new Error('La búsqueda no puede estar vacía.');

  const limit = boundedLimit(request.limit);
  const capability = capabilityForKind(request.kind);
  const providers = getProviderCandidates(capability, request.providers);
  const providersTried: string[] = [];
  const errors: Array<{ provider: string; message: string }> = [];
  const collected: StockMediaResult[] = [];

  for (const provider of providers) {
    providersTried.push(provider.id);
    try {
      const perProviderLimit = Math.min(limit, 20);
      const batch =
        provider.id === 'pexels'
          ? await searchPexels(query, request.kind, perProviderLimit)
          : provider.id === 'pixabay'
            ? await searchPixabay(query, request.kind, perProviderLimit)
            : provider.id === 'openverse'
              ? await searchOpenverse(query, request.kind, perProviderLimit)
              : [];

      collected.push(...batch);
      if (dedupeResults(collected).length >= limit) break;
    } catch (error) {
      errors.push({
        provider: provider.id,
        message: error instanceof Error ? error.message : 'Error desconocido del proveedor.',
      });
    }
  }

  return {
    results: dedupeResults(collected).slice(0, limit),
    providersTried,
    errors,
  };
};
