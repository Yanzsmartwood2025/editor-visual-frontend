import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'node:crypto';
import { requireFirebaseUser } from '../../lib/firebaseAdmin';
import { startVercelSandboxRender } from '../../lib/vercelSandboxRender';
import { getCanvasDimensionsFromRatio } from '../../lib/mediaMetadata';
import { getCompositionDurationInFrames } from '../../lib/timelineMetrics';
import { getWorkspaceSupabaseAdmin, resolveOwnedWorkspaceScope } from '../../lib/workspaceStore';
import { createR2PresignedGetUrl } from '../../lib/r2';

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
  canvasWidth: number;
  canvasHeight: number;
};

const validateInputProps = (inputProps: unknown): ValidatedRenderProps => {
  if (!inputProps || typeof inputProps !== 'object' || Array.isArray(inputProps)) {
    throw new RenderValidationError('inputProps debe ser un objeto.');
  }

  const props = inputProps as Record<string, unknown>;
  const timeline = Array.isArray(props.timeline) ? props.timeline : [];
  const threeScenes = Array.isArray(props.threeScenes) ? props.threeScenes : [];
  const vectorAnimations = Array.isArray(props.vectorAnimations) ? props.vectorAnimations : [];

  if (timeline.length === 0 && threeScenes.length === 0 && vectorAnimations.length === 0) {
    throw new RenderValidationError('El render debe contener al menos un clip, una escena 3D o una animación vectorial.');
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

  const fps = 30;
  const subtitles = Array.isArray(props.subtitles) ? props.subtitles : [];
  const logos = Array.isArray(props.logos) ? props.logos : [];
  const titles = Array.isArray(props.titles) ? props.titles : [];
  const durationInFrames = getCompositionDurationInFrames(
    timeline as any[],
    fps,
    subtitles as any[],
    logos as any[],
    titles as any[],
    threeScenes as any[],
    vectorAnimations as any[]
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
  const mediaIds = Array.from(new Set(
    [...timeline, ...threeScenes]
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

    const usage = request.usage && typeof request.usage === 'object' ? request.usage : {};
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
) => ({
  requestId: request.id,
  status: request.status,
  engine: request.engine || 'nayla-render',
  usage: request.usage || {},
  error: request.status === 'failed'
    ? publicRenderError(String(request.error_message || ''))
    : null,
  galleryItem: await hydrateRenderGalleryItem(supabase, userId, request.gallery_item_id),
  createdAt: request.created_at,
  completedAt: request.completed_at,
});

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
        .select('id,status,engine,usage,error_message,gallery_item_id,r2_key,created_at,completed_at')
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
      .select('id,status,engine,usage,error_message,gallery_item_id,r2_key,created_at,completed_at')
      .eq('id', id)
      .eq('user_id', user.uid)
      .maybeSingle();

    if (error) throw error;
    if (!request) return res.status(404).json({ error: 'Trabajo no encontrado.' });

    return res.status(200).json(
      await renderStatusPayload(supabase, user.uid, request)
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

    const durationInFrames = getCompositionDurationInFrames(
      inputProps.timeline as any[],
      30,
      Array.isArray(inputProps.subtitles) ? inputProps.subtitles as any[] : [],
      Array.isArray(inputProps.logos) ? inputProps.logos as any[] : [],
      Array.isArray(inputProps.titles) ? inputProps.titles as any[] : [],
      Array.isArray(inputProps.threeScenes) ? inputProps.threeScenes as any[] : []
    );
    const durationInSeconds = durationInFrames / 30;

    let lastProgressWrite = 0;
    let lastProgressValue = -1;
    let lastCancelCheck = 0;
    let cancellationObserved = false;

    const shouldCancel = async () => {
      if (!renderLedger || !renderRequestId) return false;
      const now = Date.now();
      if (cancellationObserved) return true;
      if (now - lastCancelCheck < 450) return false;
      lastCancelCheck = now;

      const { data: current } = await renderLedger
        .from('render_requests')
        .select('status')
        .eq('id', renderRequestId)
        .eq('user_id', user.uid)
        .maybeSingle();

      cancellationObserved = current?.status === 'cancelled';
      return cancellationObserved;
    };

    const data = await startVercelSandboxRender(
      inputProps,
      {
        ownerId: user.uid,
        projectId: scope.projectId,
        threadId: scope.threadId,
      },
      async (update) => {
        if (!renderLedger || !renderRequestId) return;

        const now = Date.now();
        const progress = Math.max(0, Math.min(1, Number(update.progress) || 0));
        const shouldWrite =
          progress >= 1 ||
          progress - lastProgressValue >= 0.025 ||
          now - lastProgressWrite >= 900;

        if (!shouldWrite) return;
        lastProgressWrite = now;
        lastProgressValue = progress;

        await renderLedger
          .from('render_requests')
          .update({
            usage: {
              stage: update.stage,
              phase: update.phase,
              progress,
              framesDone: Math.min(durationInFrames, Math.round(durationInFrames * progress)),
              framesTotal: durationInFrames,
              canvasWidth: inputProps.canvasWidth,
              canvasHeight: inputProps.canvasHeight,
              mediaDurationSeconds: durationInSeconds,
            },
          })
          .eq('id', renderRequestId)
          .eq('user_id', user.uid);
      },
      shouldCancel
    );

    const { data: existingRenders, error: countError } = await renderLedger
      .from('galeria_multimedia')
      .select('etiqueta')
      .eq('user_id', user.uid)
      .eq('project_id', scope.projectId)
      .eq('tipo', 'video')
      .like('fuente', 'render:%');

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

    const galleryItem = {
      id: randomUUID(),
      user_id: user.uid,
      project_id: scope.projectId,
      thread_id: scope.threadId || null,
      url: data.output.storageUrl,
      r2_key: data.output.r2Key,
      privacy: 'private',
      tipo: 'video',
      nombre: `${projectFileBase}_${renderLabel}.mp4`,
      creado_en: new Date().toISOString(),
      esOverlay: false,
      etiqueta: renderLabel,
      fuente: 'render:cpu',
      metadata: {
        width: inputProps.canvasWidth,
        height: inputProps.canvasHeight,
        durationInSeconds,
        fps: 30,
        renderEngine: 'remotion-cpu-sandbox',
        usage: data.usage,
      },
    };

    const { data: insertedGalleryItem, error: galleryError } = await renderLedger
      .from('galeria_multimedia')
      .insert(galleryItem)
      .select('*')
      .single();

    if (galleryError) throw galleryError;

    await renderLedger
      .from('render_requests')
      .update({
        status: 'completed',
        output_url: data.output?.storageUrl || null,
        r2_key: data.output?.r2Key || null,
        engine: data.engine,
        usage: {
          ...data.usage,
          stage: 'completed',
          phase: 'Resultado listo',
          progress: 1,
          framesDone: durationInFrames,
          framesTotal: durationInFrames,
          mediaDurationSeconds: durationInSeconds,
          frames: durationInFrames,
          canvasWidth: inputProps.canvasWidth,
          canvasHeight: inputProps.canvasHeight,
        },
        gallery_item_id: insertedGalleryItem.id,
        completed_at: new Date().toISOString(),
      })
      .eq('id', renderRequestId);

    return res.status(200).json({
      ...data,
      requestId: renderRequestId,
      galleryItem: {
        ...insertedGalleryItem,
        url: data.output.url,
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
