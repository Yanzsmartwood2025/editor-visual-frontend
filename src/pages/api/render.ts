import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../lib/firebaseAdmin';
import { startVercelSandboxRender } from '../../lib/vercelSandboxRender';
import { getCanvasDimensionsFromRatio } from '../../lib/mediaMetadata';
import { getCompositionDurationInFrames } from '../../lib/timelineMetrics';

const MAX_TIMELINE_ITEMS = 250;
const MAX_RENDER_SECONDS = 20 * 60;
const MAX_LONG_EDGE = 4096;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_RENDERS_PER_WINDOW = 3;

const renderAttempts = new Map<string, number[]>();

const rateLimit = (userId: string) => {
  const now = Date.now();
  const recent = (renderAttempts.get(userId) || []).filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= MAX_RENDERS_PER_WINDOW) {
    const retryAfterMs = Math.max(1000, RATE_LIMIT_WINDOW_MS - (now - recent[0]));
    return { allowed: false as const, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) };
  }

  recent.push(now);
  renderAttempts.set(userId, recent);
  return { allowed: true as const };
};

const validateInputProps = (inputProps: unknown) => {
  if (!inputProps || typeof inputProps !== 'object' || Array.isArray(inputProps)) {
    throw new Error('inputProps debe ser un objeto.');
  }

  const props = inputProps as Record<string, unknown>;
  if (!Array.isArray(props.timeline) || props.timeline.length === 0) {
    throw new Error('El timeline debe contener al menos un clip.');
  }
  if (props.timeline.length > MAX_TIMELINE_ITEMS) {
    throw new Error(`El timeline supera el máximo de ${MAX_TIMELINE_ITEMS} elementos por render.`);
  }

  const fps = 30;
  const subtitles = Array.isArray(props.subtitles) ? props.subtitles : [];
  const logos = Array.isArray(props.logos) ? props.logos : [];
  const durationInFrames = getCompositionDurationInFrames(
    props.timeline as any[],
    fps,
    subtitles as any[],
    logos as any[]
  );
  const durationInSeconds = durationInFrames / fps;

  if (!Number.isFinite(durationInSeconds) || durationInSeconds <= 0 || durationInSeconds > MAX_RENDER_SECONDS) {
    throw new Error(`La duración del render debe estar entre 0 y ${MAX_RENDER_SECONDS / 60} minutos.`);
  }

  const fallbackDimensions = getCanvasDimensionsFromRatio(
    typeof props.canvasRatio === 'string' ? props.canvasRatio : '9/16',
    typeof props.exportQuality === 'string' ? props.exportQuality : '1080p'
  );
  const canvasWidth = Number(props.canvasWidth) || fallbackDimensions.width;
  const canvasHeight = Number(props.canvasHeight) || fallbackDimensions.height;

  if (
    !Number.isInteger(canvasWidth) ||
    !Number.isInteger(canvasHeight) ||
    canvasWidth < 2 ||
    canvasHeight < 2 ||
    canvasWidth > MAX_LONG_EDGE ||
    canvasHeight > MAX_LONG_EDGE
  ) {
    throw new Error(`Dimensiones de render inválidas. El máximo permitido es ${MAX_LONG_EDGE}px por lado.`);
  }

  if (canvasWidth % 2 !== 0 || canvasHeight % 2 !== 0) {
    throw new Error('Las dimensiones del render deben ser pares para H.264.');
  }

  return {
    ...props,
    canvasWidth,
    canvasHeight,
  };
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });

  try {
    const user = await requireFirebaseUser(req);
    const limit = rateLimit(user.uid);

    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSeconds));
      return res.status(429).json({
        error: 'Hay demasiados renders recientes. Intenta nuevamente cuando termine la ventana de seguridad.',
        retryAfterSeconds: limit.retryAfterSeconds,
      });
    }

    const inputProps = validateInputProps(req.body?.inputProps);
    const data = await startVercelSandboxRender(inputProps, user.uid);
    return res.status(data.status === 'completed' ? 200 : 202).json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error iniciando el renderizado.';
    const status = message.includes('token') || message.includes('Bearer') || message.includes('Firebase') ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
