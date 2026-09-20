import type { NextApiRequest, NextApiResponse } from 'next';
import { randomUUID } from 'node:crypto';
import { requireFirebaseUser } from '../../lib/firebaseAdmin';
import { startVercelSandboxRender } from '../../lib/vercelSandboxRender';
import { getCanvasDimensionsFromRatio } from '../../lib/mediaMetadata';
import { getCompositionDurationInFrames } from '../../lib/timelineMetrics';
import { getWorkspaceSupabaseAdmin, resolveOwnedWorkspaceScope } from '../../lib/workspaceStore';

const MAX_TIMELINE_ITEMS = 250;
const MAX_RENDER_SECONDS = 20 * 60;
const MAX_LONG_EDGE = 4096;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_RENDERS_PER_WINDOW = 6;

class RenderValidationError extends Error {}

const validateInputProps = (inputProps: unknown) => {
  if (!inputProps || typeof inputProps !== 'object' || Array.isArray(inputProps)) {
    throw new RenderValidationError('inputProps debe ser un objeto.');
  }

  const props = inputProps as Record<string, unknown>;
  if (!Array.isArray(props.timeline) || props.timeline.length === 0) {
    throw new RenderValidationError('El timeline debe contener al menos un clip.');
  }
  if (props.timeline.length > MAX_TIMELINE_ITEMS) {
    throw new RenderValidationError(`El timeline supera el máximo de ${MAX_TIMELINE_ITEMS} elementos por render.`);
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
    canvasWidth,
    canvasHeight,
  };
};

const reserveRenderSlot = async ({
  userId,
  projectId,
  threadId,
}: {
  userId: string;
  projectId: string;
  threadId?: string;
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
      user_id: userId,
      project_id: projectId,
      thread_id: threadId || null,
      status: 'started',
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });

  let renderRequestId: string | null = null;
  let renderLedger: ReturnType<typeof getWorkspaceSupabaseAdmin> | null = null;

  try {
    const user = await requireFirebaseUser(req);
    const inputProps = validateInputProps(req.body?.inputProps);
    const scope = await resolveOwnedWorkspaceScope({
      userId: user.uid,
      projectId: typeof req.body?.projectId === 'string' ? req.body.projectId : undefined,
      threadId: typeof req.body?.threadId === 'string' ? req.body.threadId : undefined,
    });
    const slot = await reserveRenderSlot({
      userId: user.uid,
      projectId: scope.projectId,
      threadId: scope.threadId,
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
    const data = await startVercelSandboxRender(inputProps, {
      ownerId: user.uid,
      projectId: scope.projectId,
      threadId: scope.threadId,
    });

    const durationInFrames = getCompositionDurationInFrames(
      inputProps.timeline as any[],
      30,
      Array.isArray(inputProps.subtitles) ? inputProps.subtitles as any[] : [],
      Array.isArray(inputProps.logos) ? inputProps.logos as any[] : []
    );
    const durationInSeconds = durationInFrames / 30;

    const { count: renderCount, error: countError } = await renderLedger
      .from('galeria_multimedia')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.uid)
      .eq('project_id', scope.projectId)
      .eq('tipo', 'video')
      .like('fuente', 'render:%');

    if (countError) throw countError;

    const galleryItem = {
      id: randomUUID(),
      user_id: user.uid,
      project_id: scope.projectId,
      thread_id: scope.threadId || null,
      url: data.output.storageUrl,
      r2_key: data.output.r2Key,
      privacy: 'private',
      tipo: 'video',
      nombre: `Render CPU ${(renderCount || 0) + 1}.mp4`,
      creado_en: new Date().toISOString(),
      esOverlay: false,
      etiqueta: `R${(renderCount || 0) + 1}`,
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

    if (renderLedger && renderRequestId) {
      await renderLedger
        .from('render_requests')
        .update({
          status: 'failed',
          error_message: message.slice(0, 2000),
          completed_at: new Date().toISOString(),
        })
        .eq('id', renderRequestId);
    }

    if (error instanceof RenderValidationError) {
      return res.status(400).json({ error: message });
    }

    const status = message.includes('token') || message.includes('Bearer') || message.includes('Firebase') ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
