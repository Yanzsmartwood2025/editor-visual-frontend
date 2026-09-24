import { decorationsSchema, fontSelectionSchema } from '../../lib/naylaDecorations';
import { volumeKeyframesSchema } from '../../lib/audioAutomation';
import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'node:crypto';
import { requireFirebaseUser } from '../../lib/firebaseAdmin';
import {
  pollVercelSandboxRenderDetached,
  startVercelSandboxRenderDetached,
  stopVercelSandboxRender,
} from '../../lib/vercelSandboxRender';
import { getCanvasDimensionsFromRatio } from '../../lib/mediaMetadata';
import { getCompositionDurationInFrames } from '../../lib/timelineMetrics';
import { getWorkspaceSupabaseAdmin, resolveOwnedWorkspaceScope } from '../../lib/workspaceStore';
import {
  createR2PresignedGetUrl,
  createR2PresignedPutUrl,
  headR2Object,
} from '../../lib/r2';

const MAX_TIMELINE_ITEMS = 250;
const MAX_RENDER_SECONDS = 20 * 60;
const MAX_LONG_EDGE = 4096;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_RENDERS_PER_WINDOW = 6;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class RenderValidationError extends Error {}

type ValidatedRenderProps = Record<string, unknown> & {
  timeline: any[];
  subtitles?: any[];
  logos?: any[];
  titles?: any[];
  threeScenes?: any[];
  vectorAnimations?: any[];
  skiaGraphics?: any[];
  canvasWidth: number;
  canvasHeight: number;
};

const FAST_RENDER_QUALITIES = new Set(['480p', '720p']);
const FAST_TRANSITION_FALLBACKS: Record<string, string> = {
  zoom: 'fade',
  'film-burn': 'push-cut',
  'blur-slide': 'slide',
  'cross-zoom': 'fade',
  'dreamy-zoom': 'fade',
  'linear-blur': 'slide',
};

const optimizeInputPropsForFastRender = (
  inputProps: ValidatedRenderProps
): { inputProps: ValidatedRenderProps; optimizedTransitions: number; motionBlurCaps: number } => {
  const quality = String(inputProps.exportQuality || '').toLowerCase();
  if (!FAST_RENDER_QUALITIES.has(quality)) {
    return { inputProps, optimizedTransitions: 0, motionBlurCaps: 0 };
  }

  let optimizedTransitions = 0;
  let motionBlurCaps = 0;
  const timeline = (inputProps.timeline || []).map((clip: any) => {
    const transitionType = String(clip?.transitionType || '');
    const fallback = FAST_TRANSITION_FALLBACKS[transitionType];
    const nextMotionBlur = clip?.motionBlur && typeof clip.motionBlur === 'object'
      ? {
          ...clip.motionBlur,
          samples: Math.min(2, Math.max(1, Number(clip.motionBlur.samples) || 2)),
        }
      : clip?.motionBlur;

    if (fallback) optimizedTransitions += 1;
    if (
      clip?.motionBlur &&
      Number.isFinite(Number(clip.motionBlur.samples)) &&
      Number(clip.motionBlur.samples) > 2
    ) {
      motionBlurCaps += 1;
    }

    if (!fallback && nextMotionBlur === clip?.motionBlur) return clip;
    return {
      ...clip,
      ...(fallback ? { transitionType: fallback } : {}),
      ...(nextMotionBlur !== undefined ? { motionBlur: nextMotionBlur } : {}),
    };
  });

  return {
    inputProps: { ...inputProps, timeline },
    optimizedTransitions,
    motionBlurCaps,
  };
};

const validateInputProps = (inputProps: unknown): ValidatedRenderProps => {
  if (!inputProps || typeof inputProps !== 'object' || Array.isArray(inputProps)) {
    throw new RenderValidationError('inputProps debe ser un objeto.');
  }

  const props = inputProps as Record<string, unknown>;
  const settings = props.settings && typeof props.settings === 'object' ? props.settings as Record<string, unknown> : {};
  const decorationResult = decorationsSchema.safeParse(settings.decorations ?? []);
  if (!decorationResult.success) throw new RenderValidationError('Las capas de biblioteca contienen datos inválidos.');
  props.settings = { ...settings, decorations: decorationResult.data };
  const decorations = decorationResult.data;
  const timeline = Array.isArray(props.timeline) ? props.timeline : [];
  for (const clip of timeline) {
    if (clip.volumeKeyframes !== undefined && !volumeKeyframesSchema.safeParse(clip.volumeKeyframes).success) {
      throw new RenderValidationError('La curva de volumen contiene tiempos o niveles inválidos.');
    }
  }
  const threeScenes = Array.isArray(props.threeScenes) ? props.threeScenes : [];
  const vectorAnimations = Array.isArray(props.vectorAnimations) ? props.vectorAnimations : [];
  const skiaGraphics = Array.isArray(props.skiaGraphics) ? props.skiaGraphics : [];

  if (timeline.length === 0 && threeScenes.length === 0 && vectorAnimations.length === 0 && skiaGraphics.length === 0 && decorations.length === 0) {
    throw new RenderValidationError('El render debe contener al menos un clip, una escena 3D, una animación vectorial o un gráfico Skia.');
  }
  if (timeline.length > MAX_TIMELINE_ITEMS) {
    throw new RenderValidationError(`El timeline supera el máximo de ${MAX_TIMELINE_ITEMS} elementos por render.`);
  }
  if (threeScenes.length > 24) {
    throw new RenderValidationError('El render supera el máximo de 24 escenas 3D.');
  }
  if (vectorAnimations.length > 40) {
    throw new RenderValidationError('El render supera el máximo de 40 animaciones vectoriales.');
  }
  for (const item of vectorAnimations) {
    const kind = String(item?.kind || '');
    const url = typeof item?.url === 'string' ? item.url.trim() : '';
    const start = Number(item?.start);
    const end = Number(item?.end);
    if (!['lottie', 'rive'].includes(kind) || !/^https?:\/\//i.test(url) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw new RenderValidationError('Una animación vectorial tiene datos inválidos.');
    }
    if (/^r2:\/\//i.test(url)) {
      throw new RenderValidationError('Una animación vectorial privada necesita una URL HTTPS firmada.');
    }
  }
  if (skiaGraphics.length > 40) {
    throw new RenderValidationError('El render supera el máximo de 40 gráficos Skia.');
  }
  for (const item of skiaGraphics) {
    const preset = String(item?.preset || '');
    const start = Number(item?.start);
    const end = Number(item?.end);
    if (
      !['glow-orb', 'rings', 'energy-pulse', 'spotlights'].includes(preset) ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end <= start
    ) {
      throw new RenderValidationError('Un gráfico Skia tiene datos inválidos.');
    }
  }

  const fps = 30;
  const subtitles = Array.isArray(props.subtitles) ? props.subtitles : [];
  const logos = Array.isArray(props.logos) ? props.logos : [];
  const titles = Array.isArray(props.titles) ? props.titles : [];
  if ([...subtitles, ...titles].some(item => !fontSelectionSchema.safeParse(item).success)) throw new RenderValidationError('La selección de fuente no es válida.');
  const durationInFrames = getCompositionDurationInFrames(
    timeline as any[],
    fps,
    subtitles as any[],
    logos as any[],
    titles as any[],
    threeScenes as any[],
    vectorAnimations as any[],
    skiaGraphics as any[],
    decorations
  );
  const durationInSeconds = durationInFrames / fps;

  if (!Number.isFinite(durationInSeconds) || durationInSeconds <= 0 || durationInSeconds > MAX_RENDER_SECONDS) {
    throw new RenderValidationError(`La duración del render debe estar entre 0 y ${MAX_RENDER_SECONDS / 60} minutos.`);
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
    throw new RenderValidationError(`Dimensiones de render inválidas. El máximo permitido es ${MAX_LONG_EDGE}px por lado.`);
  }

  if (canvasWidth % 2 !== 0 || canvasHeight % 2 !== 0) {
    throw new RenderValidationError('Las dimensiones del render deben ser pares para H.264.');
  }

  return {
    ...props,
    timeline: timeline as any[],
    threeScenes: threeScenes as any[],
    vectorAnimations: vectorAnimations as any[],
    skiaGraphics: skiaGraphics as any[],
    canvasWidth,
    canvasHeight,
  } as ValidatedRenderProps;
};

const hydrateOwnedRenderMedia = async ({
  supabase,
  userId,
  projectId,
  inputProps,
}: {
  supabase: ReturnType<typeof getWorkspaceSupabaseAdmin>;
  userId: string;
  projectId: string;
  inputProps: ValidatedRenderProps;
}): Promise<ValidatedRenderProps> => {
  const timeline = Array.isArray(inputProps.timeline) ? inputProps.timeline : [];
  const threeScenes = Array.isArray(inputProps.threeScenes) ? inputProps.threeScenes : [];
  const decorations = (inputProps.settings as any)?.decorations || [];
  const mediaIds = Array.from(new Set(
    [...timeline, ...threeScenes, ...decorations]
      .map((item: any) => typeof item?.mediaId === 'string' ? item.mediaId : '')
      .filter((id): id is string => UUID_RE.test(id))
  ));

  const byId = new Map<string, any>();
  if (mediaIds.length) {
    const { data: ownedMedia, error } = await supabase
      .from('galeria_multimedia')
      .select('id,tipo,url,r2_key,project_id,user_id')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .in('id', mediaIds);

    if (error) throw error;
    for (const item of ownedMedia || []) byId.set(String(item.id), item);
  }

  const hydratedDecorations = decorations.map((item: any) => {
    if (item.kind !== 'gif') return item;
    const owned = item.mediaId ? byId.get(item.mediaId) : null;
    if (item.mediaId && (!owned || owned.tipo !== 'foto')) throw new RenderValidationError('El GIF no pertenece al proyecto activo.');
    if (owned) return { ...item, url: owned.r2_key ? createR2PresignedGetUrl({ key: owned.r2_key, expiresIn: 3600 }).url : owned.url };
    if (!/^https?:\/\//i.test(item.url || '')) throw new RenderValidationError('El GIF necesita una dirección resuelta.');
    return item;
  });
  const hydratedTimeline = timeline.map((item: any) => {
    const mediaId = typeof item?.mediaId === 'string' ? item.mediaId : '';
    const owned = mediaId ? byId.get(mediaId) : null;

    if (owned) {
      return {
        ...item,
        tipo: owned.tipo || item.tipo,
        url: owned.r2_key
          ? createR2PresignedGetUrl({ key: owned.r2_key, expiresIn: 3600 }).url
          : owned.url,
      };
    }

    const url = typeof item?.url === 'string' ? item.url.trim() : '';
    if (/^r2:\/\//i.test(url)) {
      throw new RenderValidationError('Uno de los archivos privados necesita volver a resolverse desde la Bóveda.');
    }

    if (!/^https?:\/\//i.test(url)) {
      throw new RenderValidationError('Uno de los archivos del timeline no tiene una dirección válida.');
    }

    return item;
  });

  const hydratedThreeScenes = threeScenes.map((scene: any) => {
    const mediaId = typeof scene?.mediaId === 'string' ? scene.mediaId : '';
    const owned = mediaId ? byId.get(mediaId) : null;

    if (!owned || owned.tipo !== 'modelo3d') {
      throw new RenderValidationError('Una escena 3D no pertenece al proyecto activo o ya no está disponible.');
    }

    return {
      ...scene,
      url: owned.r2_key
        ? createR2PresignedGetUrl({ key: owned.r2_key, expiresIn: 3600 }).url
        : owned.url,
    };
  });

  return {
    ...inputProps,
    settings: { ...(inputProps.settings as any), decorations: hydratedDecorations },
    timeline: hydratedTimeline,
    threeScenes: hydratedThreeScenes,
  };
};

const reserveRenderSlot = async ({
  userId,
  projectId,
  threadId,
  requestId,
}: {
  userId: string;
  projectId: string;
  threadId?: string;
  requestId?: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const windowStartMs = Date.now() - RATE_LIMIT_WINDOW_MS;
  const windowStart = new Date(windowStartMs).toISOString();

  const { count, error: countError } = await supabase
    .from('render_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStart);

  if (countError) throw countError;

  if ((count || 0) >= MAX_RENDERS_PER_WINDOW) {
    const { data: oldest, error: oldestError } = await supabase
      .from('render_requests')
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (oldestError) throw oldestError;

    const oldestMs = oldest?.created_at ? new Date(oldest.created_at).getTime() : Date.now();
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((RATE_LIMIT_WINDOW_MS - (Date.now() - oldestMs)) / 1000)
    );

    return {
      allowed: false as const,
      retryAfterSeconds,
      supabase,
    };
  }

  const { data: request, error: insertError } = await supabase
    .from('render_requests')
    .insert({
      ...(requestId ? { id: requestId } : {}),
      user_id: userId,
      project_id: projectId,
      thread_id: threadId || null,
      status: 'started',
      usage: {
        stage: 'preparing',
        phase: 'Preparando edición',
        progress: 0,
      },
    })
    .select('id')
    .single();

  if (insertError) throw insertError;

  return {
    allowed: true as const,
    requestId: request.id as string,
    supabase,
  };
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};


const safeProjectFileBase = (value: unknown) => {
  const raw = String(value || 'Nayla').trim() || 'Nayla';
  const normalized = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return normalized || 'Nayla';
};

const publicRenderError = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return 'El procesamiento tardó más de lo esperado. Intenta nuevamente.';
  }
  if (normalized.includes('duration') || normalized.includes('duración') || normalized.includes('timeline')) {
    return 'No se pudo preparar correctamente la edición solicitada.';
  }
  if (
    normalized.includes('media') ||
    normalized.includes('archivo') ||
    normalized.includes('video') ||
    normalized.includes('image') ||
    normalized.includes('audio') ||
    normalized.includes('bóveda') ||
    normalized.includes('boveda') ||
    normalized.includes('orb') ||
    normalized.includes('decode')
  ) {
    return 'Uno de los archivos no pudo procesarse correctamente. Nayla renovará su acceso al volver a intentarlo.';
  }
  return 'No se pudo completar el procesamiento en este intento.';
};

const cancelRender = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const user = await requireFirebaseUser(req);
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Identificador de trabajo inválido.' });

    const supabase = getWorkspaceSupabaseAdmin();
    const { data: request, error } = await supabase
      .from('render_requests')
      .select('id,status,usage')
      .eq('id', id)
      .eq('user_id', user.uid)
      .maybeSingle();

    if (error) throw error;
    if (!request) return res.status(404).json({ error: 'Trabajo no encontrado.' });

    if (request.status !== 'started') {
      return res.status(200).json({
        requestId: request.id,
        status: request.status,
        cancelled: request.status === 'cancelled',
      });
    }

    const usage = request.usage && typeof request.usage === 'object' ? request.usage as Record<string, any> : {};
    const sandboxId = String(usage?.detached?.sandboxId || '');
    const { error: updateError } = await supabase
      .from('render_requests')
      .update({
        status: 'cancelled',
        usage: {
          ...usage,
          stage: 'cancelled',
          phase: 'Cancelado por el usuario',
          cancelRequested: true,
        },
        completed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('user_id', user.uid)
      .eq('status', 'started');

    if (updateError) throw updateError;
    if (sandboxId) await stopVercelSandboxRender(sandboxId);

    return res.status(200).json({
      requestId: id,
      status: 'cancelled',
      cancelled: true,
    });
  } catch {
    return res.status(500).json({ error: 'No se pudo cancelar el render.' });
  }
};

const hydrateRenderGalleryItem = async (
  supabase: ReturnType<typeof getWorkspaceSupabaseAdmin>,
  userId: string,
  galleryItemId?: string | null
) => {
  if (!galleryItemId) return null;

  const { data: item, error } = await supabase
    .from('galeria_multimedia')
    .select('*')
    .eq('id', galleryItemId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!item) return null;

  return {
    ...item,
    url: item.r2_key
      ? createR2PresignedGetUrl({ key: item.r2_key, expiresIn: 900 }).url
      : item.url,
  };
};

const renderStatusPayload = async (
  supabase: ReturnType<typeof getWorkspaceSupabaseAdmin>,
  userId: string,
  request: any
) => {
  const rawUsage = request.usage && typeof request.usage === 'object'
    ? request.usage as Record<string, any>
    : {};
  const { detached: _privateDetached, ...publicUsage } = rawUsage;

  return {
    requestId: request.id,
    status: request.status,
    engine: request.engine || 'nayla-render',
    usage: publicUsage,
    error: request.status === 'failed'
      ? publicRenderError(String(request.error_message || ''))
      : null,
    galleryItem: await hydrateRenderGalleryItem(supabase, userId, request.gallery_item_id),
    createdAt: request.created_at,
    completedAt: request.completed_at,
  };
};

const refreshDetachedRenderRequest = async ({
  supabase,
  userId,
  request,
}: {
  supabase: ReturnType<typeof getWorkspaceSupabaseAdmin>;
  userId: string;
  request: any;
}) => {
  if (!request || request.status !== 'started') return request;

  const usage = request.usage && typeof request.usage === 'object'
    ? request.usage as Record<string, any>
    : {};
  const detached = usage.detached && typeof usage.detached === 'object'
    ? usage.detached as Record<string, any>
    : null;

  if (!detached?.sandboxId) {
    const ageMs = Date.now() - new Date(request.created_at || Date.now()).getTime();
    if (ageMs > 6 * 60 * 1000) {
      const errorMessage = 'El render anterior quedó interrumpido por el límite de ejecución de la función.';
      const nextUsage = {
        ...usage,
        stage: 'failed',
        phase: 'Procesamiento interrumpido',
      };
      await supabase
        .from('render_requests')
        .update({
          status: 'failed',
          usage: nextUsage,
          error_message: errorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq('id', request.id)
        .eq('user_id', userId)
        .eq('status', 'started');
      return {
        ...request,
        status: 'failed',
        usage: nextUsage,
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      };
    }
    return request;
  }

  let polled;
  try {
    polled = await pollVercelSandboxRenderDetached({
      sandboxId: String(detached.sandboxId),
      logFile: typeof detached.logFile === 'string' ? detached.logFile : undefined,
      exitFile: typeof detached.exitFile === 'string' ? detached.exitFile : undefined,
    });
  } catch (error) {
    const ageMs = Date.now() - new Date(request.created_at || Date.now()).getTime();
    if (ageMs <= 46 * 60 * 1000) return request;

    const errorMessage = error instanceof Error ? error.message : 'El entorno de render dejó de estar disponible.';
    const nextUsage = {
      ...usage,
      stage: 'failed',
      phase: 'Procesamiento interrumpido',
    };
    await supabase
      .from('render_requests')
      .update({
        status: 'failed',
        usage: nextUsage,
        error_message: errorMessage.slice(0, 2000),
        completed_at: new Date().toISOString(),
      })
      .eq('id', request.id)
      .eq('user_id', userId)
      .eq('status', 'started');
    return {
      ...request,
      status: 'failed',
      usage: nextUsage,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    };
  }

  const framesTotal = Number(usage.framesTotal) || 0;
  const progress = Math.max(0, Math.min(1, Number(polled.progress) || 0));
  const nextUsage = {
    ...usage,
    stage: polled.stage,
    phase: polled.phase,
    progress,
    framesDone: framesTotal ? Math.min(framesTotal, Math.round(framesTotal * progress)) : undefined,
  };

  if (polled.state === 'running') {
    const previousProgress = Number(usage.progress) || 0;
    const shouldWrite =
      polled.stage !== usage.stage ||
      polled.phase !== usage.phase ||
      progress - previousProgress >= 0.005;

    if (shouldWrite) {
      await supabase
        .from('render_requests')
        .update({ usage: nextUsage })
        .eq('id', request.id)
        .eq('user_id', userId)
        .eq('status', 'started');
    }

    return { ...request, usage: nextUsage };
  }

  if (polled.state === 'failed') {
    const errorMessage = String(polled.error || 'El render se interrumpió.').slice(0, 2000);
    const failedUsage = {
      ...nextUsage,
      stage: 'failed',
      phase: polled.phase || 'Procesamiento interrumpido',
    };
    await supabase
      .from('render_requests')
      .update({
        status: 'failed',
        usage: failedUsage,
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', request.id)
      .eq('user_id', userId)
      .eq('status', 'started');
    await stopVercelSandboxRender(String(detached.sandboxId));
    return {
      ...request,
      status: 'failed',
      usage: failedUsage,
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    };
  }

  const r2Key = String(detached.r2Key || '');
  const galleryItemId = String(detached.galleryItemId || '');
  const renderLabel = String(detached.renderLabel || 'R');
  const projectFileBase = String(detached.projectFileBase || 'Nayla');
  const storageUrl = String(detached.storageUrl || '');
  if (!r2Key || !UUID_RE.test(galleryItemId) || !storageUrl) {
    throw new Error('El render terminó, pero faltan datos para registrar el archivo final.');
  }

  const storedObject = await headR2Object(r2Key);
  const completedUsage = {
    ...nextUsage,
    stage: 'completed',
    phase: 'Resultado listo',
    progress: 1,
    framesDone: framesTotal || undefined,
    outputBytes: Number(storedObject.contentLength) || undefined,
  };

  const galleryItem = {
    id: galleryItemId,
    user_id: userId,
    project_id: request.project_id,
    thread_id: request.thread_id || null,
    url: storageUrl,
    r2_key: r2Key,
    privacy: 'private',
    tipo: 'video',
    nombre: `${projectFileBase}_${renderLabel}.mp4`,
    creado_en: new Date().toISOString(),
    esOverlay: false,
    etiqueta: renderLabel,
    fuente: 'render:cpu',
    metadata: {
      width: Number(usage.canvasWidth) || null,
      height: Number(usage.canvasHeight) || null,
      durationInSeconds: Number(usage.mediaDurationSeconds) || null,
      fps: 30,
      renderEngine: 'remotion-cpu-sandbox-detached',
      outputBytes: Number(storedObject.contentLength) || null,
    },
  };

  const { data: insertedGalleryItem, error: galleryError } = await supabase
    .from('galeria_multimedia')
    .upsert(galleryItem, { onConflict: 'id' })
    .select('*')
    .single();

  if (galleryError) throw galleryError;

  const completedAt = new Date().toISOString();
  await supabase
    .from('render_requests')
    .update({
      status: 'completed',
      output_url: storageUrl,
      r2_key: r2Key,
      engine: 'remotion-cpu-sandbox-detached',
      usage: completedUsage,
      gallery_item_id: insertedGalleryItem.id,
      completed_at: completedAt,
    })
    .eq('id', request.id)
    .eq('user_id', userId)
    .eq('status', 'started');

  await stopVercelSandboxRender(String(detached.sandboxId));

  return {
    ...request,
    status: 'completed',
    engine: 'remotion-cpu-sandbox-detached',
    usage: completedUsage,
    gallery_item_id: insertedGalleryItem.id,
    r2_key: r2Key,
    output_url: storageUrl,
    completed_at: completedAt,
  };
};

const getRenderStatus = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    const user = await requireFirebaseUser(req);
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const threadId = typeof req.query.threadId === 'string' ? req.query.threadId : '';
    const supabase = getWorkspaceSupabaseAdmin();

    res.setHeader('Cache-Control', 'private, no-store');

    if (!id && threadId) {
      if (!UUID_RE.test(threadId)) {
        return res.status(400).json({ error: 'Identificador de chat inválido.' });
      }

      const scope = await resolveOwnedWorkspaceScope({
        userId: user.uid,
        threadId,
      });

      const { data: requests, error } = await supabase
        .from('render_requests')
        .select('id,user_id,project_id,thread_id,status,engine,usage,error_message,gallery_item_id,r2_key,created_at,completed_at')
        .eq('user_id', user.uid)
        .eq('project_id', scope.projectId)
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
        .limit(20);

      if (error) throw error;

      const renders = [];
      for (const request of requests || []) {
        renders.push(await renderStatusPayload(supabase, user.uid, request));
      }

      return res.status(200).json({ renders });
    }

    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: 'Identificador de trabajo inválido.' });
    }

    const { data: request, error } = await supabase
      .from('render_requests')
      .select('id,user_id,project_id,thread_id,status,engine,usage,error_message,gallery_item_id,r2_key,created_at,completed_at')
      .eq('id', id)
      .eq('user_id', user.uid)
      .maybeSingle();

    if (error) throw error;
    if (!request) return res.status(404).json({ error: 'Trabajo no encontrado.' });

    const refreshed = await refreshDetachedRenderRequest({
      supabase,
      userId: user.uid,
      request,
    });

    return res.status(200).json(
      await renderStatusPayload(supabase, user.uid, refreshed)
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No se pudo consultar el trabajo.';
    const status = message.includes('token') || message.includes('Bearer') || message.includes('Firebase') ? 401 : 500;
    return res.status(status).json({ error: status === 401 ? 'Sesión no válida.' : 'No se pudo consultar el trabajo.' });
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') return getRenderStatus(req, res);
  if (req.method === 'DELETE') return cancelRender(req, res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa GET, POST o DELETE.' });

  let renderRequestId: string | null = null;
  let renderLedger: ReturnType<typeof getWorkspaceSupabaseAdmin> | null = null;

  try {
    const user = await requireFirebaseUser(req);
    const requestedId = typeof req.body?.requestId === 'string' ? req.body.requestId : undefined;
    if (requestedId && !UUID_RE.test(requestedId)) {
      return res.status(400).json({ error: 'Identificador de trabajo inválido.' });
    }
    let inputProps = validateInputProps(req.body?.inputProps);
    const scope = await resolveOwnedWorkspaceScope({
      userId: user.uid,
      projectId: typeof req.body?.projectId === 'string' ? req.body.projectId : undefined,
      threadId: typeof req.body?.threadId === 'string' ? req.body.threadId : undefined,
    });
    const slot = await reserveRenderSlot({
      userId: user.uid,
      projectId: scope.projectId,
      threadId: scope.threadId,
      requestId: requestedId,
    });
    renderLedger = slot.supabase;

    if (!slot.allowed) {
      res.setHeader('Retry-After', String(slot.retryAfterSeconds));
      return res.status(429).json({
        error: 'Hay demasiados renders recientes. Intenta nuevamente cuando termine la ventana de seguridad.',
        retryAfterSeconds: slot.retryAfterSeconds,
      });
    }

    renderRequestId = slot.requestId;

    inputProps = await hydrateOwnedRenderMedia({
      supabase: renderLedger,
      userId: user.uid,
      projectId: scope.projectId,
      inputProps,
    });

    const fastOptimization = optimizeInputPropsForFastRender(inputProps);
    inputProps = fastOptimization.inputProps;

    const durationInFrames = getCompositionDurationInFrames(
      inputProps.timeline as any[],
      30,
      Array.isArray(inputProps.subtitles) ? inputProps.subtitles as any[] : [],
      Array.isArray(inputProps.logos) ? inputProps.logos as any[] : [],
      Array.isArray(inputProps.titles) ? inputProps.titles as any[] : [],
      Array.isArray(inputProps.threeScenes) ? inputProps.threeScenes as any[] : [],
      Array.isArray(inputProps.vectorAnimations) ? inputProps.vectorAnimations as any[] : [],
      Array.isArray(inputProps.skiaGraphics) ? inputProps.skiaGraphics as any[] : [],
      (inputProps.settings as any)?.decorations || []
    );
    const durationInSeconds = durationInFrames / 30;

    const { data: existingRenders, error: countError } = await renderLedger
      .from('galeria_multimedia')
      .select('etiqueta')
      .eq('user_id', user.uid)
      .eq('project_id', scope.projectId)
      .like('etiqueta', 'R%');

    if (countError) throw countError;

    const renderNumber = (existingRenders || []).reduce((max, item: any) => {
      const match = typeof item?.etiqueta === 'string'
        ? item.etiqueta.trim().toUpperCase().match(/^R(\d+)$/)
        : null;
      return match ? Math.max(max, Number(match[1]) || 0) : max;
    }, 0) + 1;
    const renderLabel = `R${renderNumber}`;

    const { data: projectRow, error: projectError } = await renderLedger
      .from('editor_projects')
      .select('name')
      .eq('id', scope.projectId)
      .eq('user_id', user.uid)
      .maybeSingle();

    if (projectError) throw projectError;
    const projectFileBase = safeProjectFileBase(projectRow?.name);
    const galleryItemId = randomUUID();
    const threadSegment = scope.threadId ? `threads/${scope.threadId}` : 'shared';
    const r2Key =
      `${user.uid}/projects/${scope.projectId}/${threadSegment}/renders/` +
      `${renderRequestId}.mp4`;
    const r2Upload = createR2PresignedPutUrl({
      key: r2Key,
      contentType: 'video/mp4',
      expiresIn: 3600,
    });

    const detached = await startVercelSandboxRenderDetached(
      inputProps,
      r2Upload.uploadUrl
    );

    const initialUsage = {
      stage: 'preparing',
      phase: 'Preparando motor de edición',
      progress: 0.1,
      framesDone: 0,
      framesTotal: durationInFrames,
      canvasWidth: inputProps.canvasWidth,
      canvasHeight: inputProps.canvasHeight,
      mediaDurationSeconds: durationInSeconds,
      renderQuality: String(inputProps.exportQuality || ''),
      fastRenderOptimizations: {
        optimizedTransitions: fastOptimization.optimizedTransitions,
        motionBlurCaps: fastOptimization.motionBlurCaps,
      },
      detached: {
        sandboxId: detached.sandboxId,
        cmdId: detached.cmdId,
        outputFile: detached.outputFile,
        logFile: detached.logFile,
        exitFile: detached.exitFile,
        r2Key,
        storageUrl: r2Upload.url,
        galleryItemId,
        renderLabel,
        projectFileBase,
      },
    };

    const { error: startedError } = await renderLedger
      .from('render_requests')
      .update({
        engine: detached.engine,
        usage: initialUsage,
      })
      .eq('id', renderRequestId)
      .eq('user_id', user.uid)
      .eq('status', 'started');

    if (startedError) {
      await stopVercelSandboxRender(detached.sandboxId);
      throw startedError;
    }

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(202).json({
      status: 'started',
      engine: detached.engine,
      requestId: renderRequestId,
      usage: {
        stage: initialUsage.stage,
        phase: initialUsage.phase,
        progress: initialUsage.progress,
        framesDone: initialUsage.framesDone,
        framesTotal: initialUsage.framesTotal,
        canvasWidth: initialUsage.canvasWidth,
        canvasHeight: initialUsage.canvasHeight,
        mediaDurationSeconds: initialUsage.mediaDurationSeconds,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error iniciando el renderizado.';
    const cancelled = message === 'NAYLA_RENDER_CANCELLED';

    if (renderLedger && renderRequestId) {
      if (cancelled) {
        await renderLedger
          .from('render_requests')
          .update({
            status: 'cancelled',
            completed_at: new Date().toISOString(),
          })
          .eq('id', renderRequestId)
          .eq('user_id', (await requireFirebaseUser(req)).uid);
      } else {
        await renderLedger
          .from('render_requests')
          .update({
            status: 'failed',
            error_message: message.slice(0, 2000),
            completed_at: new Date().toISOString(),
          })
          .eq('id', renderRequestId);
      }
    }

    if (cancelled) {
      return res.status(409).json({
        error: 'Render cancelado.',
        cancelled: true,
        requestId: renderRequestId,
      });
    }

    if (error instanceof RenderValidationError) {
      return res.status(400).json({ error: message });
    }

    const status = message.includes('token') || message.includes('Bearer') || message.includes('Firebase') ? 401 : 500;
    if (status === 500) console.error('Nayla Render falló:', error);
    return res.status(status).json({
      error: status === 401 ? 'Sesión no válida.' : publicRenderError(message),
      requestId: renderRequestId,
    });
  }
}
