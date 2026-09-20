export type MediaKind = 'foto' | 'video' | 'audio';

export type MediaMetadata = {
  width?: number;
  height?: number;
  aspectRatio?: number;
  aspectRatioLabel?: string;
  durationInSeconds?: number;
  sourceProvider?: string;
  sourceUrl?: string;
  creator?: string;
  creatorUrl?: string;
  licenseName?: string;
  licenseUrl?: string;
  attribution?: string;
};

const gcd = (a: number, b: number): number => {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
};

const toEven = (value: number): number => {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded + 1;
};

export const getAspectRatioLabel = (width?: number, height?: number): string | undefined => {
  if (!width || !height || width <= 0 || height <= 0) return undefined;
  const divisor = gcd(width, height);
  return `${Math.round(width) / divisor}/${Math.round(height) / divisor}`;
};

export const buildMediaMetadata = (
  width?: number,
  height?: number,
  durationInSeconds?: number
): MediaMetadata => {
  const metadata: MediaMetadata = {};

  if (width && height && width > 0 && height > 0) {
    metadata.width = Math.round(width);
    metadata.height = Math.round(height);
    metadata.aspectRatio = width / height;
    metadata.aspectRatioLabel = getAspectRatioLabel(width, height);
  }

  if (durationInSeconds !== undefined && Number.isFinite(durationInSeconds) && durationInSeconds > 0) {
    metadata.durationInSeconds = durationInSeconds;
  }

  return metadata;
};

const shortEdgeForQuality = (quality?: string): number => {
  switch ((quality || '1080p').toLowerCase()) {
    case '480p':
      return 480;
    case '720p':
      return 720;
    case '4k':
    case '2160p':
      return 2160;
    case '1080p':
    default:
      return 1080;
  }
};

export const parseAspectRatioLabel = (ratioLabel?: string): { widthRatio: number; heightRatio: number } => {
  if (!ratioLabel) return { widthRatio: 9, heightRatio: 16 };
  const [rawWidth, rawHeight] = ratioLabel.split('/');
  const widthRatio = Number(rawWidth);
  const heightRatio = Number(rawHeight);

  if (!Number.isFinite(widthRatio) || !Number.isFinite(heightRatio) || widthRatio <= 0 || heightRatio <= 0) {
    return { widthRatio: 9, heightRatio: 16 };
  }

  return { widthRatio, heightRatio };
};

export const getCanvasDimensionsFromRatio = (
  ratioLabel?: string,
  quality?: string
): { width: number; height: number } => {
  const { widthRatio, heightRatio } = parseAspectRatioLabel(ratioLabel);
  const shortEdge = shortEdgeForQuality(quality);

  if (widthRatio === heightRatio) {
    return { width: toEven(shortEdge), height: toEven(shortEdge) };
  }

  if (widthRatio > heightRatio) {
    return {
      width: toEven(shortEdge * (widthRatio / heightRatio)),
      height: toEven(shortEdge),
    };
  }

  return {
    width: toEven(shortEdge),
    height: toEven(shortEdge * (heightRatio / widthRatio)),
  };
};

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

const withTimeout = <T>(promise: Promise<T>, timeoutMs = 15000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Tiempo de espera agotado leyendo metadata.')), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });

const probeImageUrl = async (url: string): Promise<MediaMetadata> => {
  if (!isBrowser()) return {};

  return withTimeout(new Promise<MediaMetadata>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(buildMediaMetadata(image.naturalWidth, image.naturalHeight));
    image.onerror = () => reject(new Error('No se pudo leer la metadata de la imagen.'));
    image.src = url;
  }));
};

const probeVideoUrl = async (url: string): Promise<MediaMetadata> => {
  if (!isBrowser()) return {};

  return withTimeout(new Promise<MediaMetadata>((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    video.onloadedmetadata = () => {
      const metadata = buildMediaMetadata(
        video.videoWidth,
        video.videoHeight,
        Number.isFinite(video.duration) ? video.duration : undefined
      );
      cleanup();
      resolve(metadata);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('No se pudo leer la metadata del video.'));
    };
    video.src = url;
  }));
};

const probeAudioUrl = async (url: string): Promise<MediaMetadata> => {
  if (!isBrowser()) return {};

  return withTimeout(new Promise<MediaMetadata>((resolve, reject) => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';

    const cleanup = () => {
      audio.removeAttribute('src');
      audio.load();
    };

    audio.onloadedmetadata = () => {
      const metadata = buildMediaMetadata(
        undefined,
        undefined,
        Number.isFinite(audio.duration) ? audio.duration : undefined
      );
      cleanup();
      resolve(metadata);
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error('No se pudo leer la metadata del audio.'));
    };
    audio.src = url;
  }));
};

export const probeMediaUrl = async (url: string, kind: MediaKind): Promise<MediaMetadata> => {
  if (!url) return {};
  if (kind === 'foto') return probeImageUrl(url);
  if (kind === 'video') return probeVideoUrl(url);
  return probeAudioUrl(url);
};

export const probeMediaFile = async (file: Blob, kind: MediaKind): Promise<MediaMetadata> => {
  if (!isBrowser()) return {};

  const objectUrl = URL.createObjectURL(file);
  try {
    return await probeMediaUrl(objectUrl, kind);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
