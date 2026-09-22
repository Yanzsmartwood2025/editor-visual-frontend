import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { GroqProvider, MistralProvider } from '../../utils/llmProvider';
import { requireFirebaseUser } from '../../lib/firebaseAdmin';
import { sanitizeNaylaPublicText } from '../../lib/naylaSystemCatalog';
import {
  findNaylaCapabilityMatches,
  getNaylaCapabilityBibleForPrompt,
  NAYLA_CAPABILITY_BIBLE_VERSION,
} from '../../lib/naylaCapabilityBible';
import { REMOTION_CPU_PUBLIC_CATALOG } from '../../lib/remotionEffects';
import { searchStockMedia } from '../../lib/mediaProviders/stock';
import {
  getAvailableProvidersForAction,
  parseNaylaAction,
  type NaylaAction,
} from '../../lib/naylaActions';
import { startComputeGpuJob } from '../../lib/gpu/orchestrator';
import { quoteComputeGpuJob } from '../../lib/gpu/quote';
import { resolveRequestPublicBaseUrl } from '../../lib/gpu/requestUrl';
import type { GpuWorkload } from '../../lib/gpu/profiles';
import { createMediaJobPlan } from '../../lib/mediaJobs';
import { createR2PresignedGetUrl } from '../../lib/r2';
import { canStartGpuCompute, getNaylaExecutionPolicyPrompt } from '../../lib/naylaExecutionPolicy';
import { assistantRequestsPlanConfirmation, isUniversalNaylaConfirmation } from '../../lib/naylaPlanConfirmation';
import {
  buildEvenSubtitleTiming,
  extractSubtitleBlocks,
  getRequestedTimelineSeconds,
  getRequestedVisualCount,
  hasNaturalProjectPhotoReference,
  timelinePlanRequestsRender,
  wantsAllProjectPhotos,
} from '../../lib/naylaTimelineIntent';
import {
  getOwnedMediaByLabelsForUser,
  getOwnedMediaForUser,
  getRecentOwnedMediaForUser,
  getRecentThreadAttachedMediaForUser,
  insertChatMessageForUser,
  listThreadMessagesForUser,
  resolveOwnedWorkspaceScope,
} from '../../lib/workspaceStore';



export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

const historyItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().max(12000),
});

const mediaLibraryItemSchema = z.object({
  id: z.string().optional(),
  tipo: z.enum(['foto', 'video', 'audio', 'modelo3d']),
  url: z.string().url(),
  nombre: z.string().max(500).optional(),
  etiqueta: z.string().max(100).optional(),
  fuente: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const requestSchema = z.object({
  message: z.string().trim().min(1, 'Falta el parámetro requerido o está vacío: message').max(12000),
  images: z.array(z.string().max(4_000_000)).max(4).optional(),
  history: z.array(historyItemSchema).max(30).optional(),
  provider: z.enum(['groq', 'mistral']).optional().default('groq'),
  engineMode: z.enum(['auto', 'cloud', 'compute']).optional().default('auto'),
  projectId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  attachmentIds: z.array(z.string().uuid()).max(12).optional(),
  mediaLibrary: z.array(mediaLibraryItemSchema).max(500).optional(),
  currentTimeline: z.array(z.object({
    id: z.string().optional(),
    tipo: z.enum(['foto', 'video', 'audio']),
    url: z.string().url(),
    nombre: z.string().max(500).optional(),
    etiqueta: z.string().max(100).optional(),
  })).max(250).optional(),
});

const generationActionNames = new Set([
  'GENERATE_IMAGE',
  'GENERATE_VIDEO',
  'GENERATE_AUDIO',
  'GENERATE_3D',
  'RUN_GPU_JOB',
]);

const hasExplicitVisionIntent = (message: string) =>
  /\b(analiza|analizar|analices|revisa|revisar|revises|mira|mirar|observa|observar|inspecciona|inspeccionar|describe|describir|compara|comparar|encuadre|composici[oó]n|colores?|rostro|ropa|fondo)\b/i.test(message) ||
  /\bqu[eé]\s+(?:hay|aparece|ves)\b/i.test(message);

const hasCreativeVisualIntent = (message: string) =>
  /\b(ordena|ordenar|organiza|organizar|elige|elegir|escoge|escoger|selecciona|seleccionar|acomoda|acomodar|combina|combinar)\b/i.test(message) ||
  /\b(c[oó]mo\s+(?:quede|quedar[ií]a)\s+mejor|como\s+creas|a\s+tu\s+criterio|criterio\s+creativo)\b/i.test(message) ||
  /\b(efectos?|transiciones?|movimiento|cinematogr[aá]fic[oa]|profesional|ritmo|montaje)\b/i.test(message) ||
  /\b(video|montaje|edici[oó]n)\b.{0,48}\b(estas?|mis|las)\s+(?:fotos?|im[aá]genes?)\b/i.test(message);

const getRequestedPhotoLabels = (message: string) => {
  const labels = new Set<string>();
  for (const match of message.matchAll(/\bF\s*(\d+)\b/gi)) {
    labels.add(`F${Number(match[1])}`);
  }
  for (const match of message.matchAll(/\b(?:foto|imagen)\s*(?:n(?:[uú]mero)?\s*)?(\d+)\b/gi)) {
    labels.add(`F${Number(match[1])}`);
  }
  return labels;
};

const normalizePlanningText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hasPriorNaylaPlan = (
  history: Array<{ role: 'user' | 'assistant'; content: string }>
) =>
  history
    .slice(-8)
    .some((item) => {
      if (item.role !== 'assistant') return false;
      const text = normalizePlanningText(item.content);
      return (
        /\b(plan|te recomiendo|propongo|podemos usar|podemos combinar|mi recomendacion|te parece|si te parece|cuando confirmes|cuando me confirmes|si quieres lo preparo|quedaria asi|generare la timeline|generare el video)\b/.test(text) ||
        assistantRequestsPlanConfirmation(item.content)
      );
    });

const hasExplicitPlanConfirmation = (
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
) => {
  if (!hasPriorNaylaPlan(history)) return false;

  const text = normalizePlanningText(message);
  if (!text) return false;

  return (
    isUniversalNaylaConfirmation(message) ||
    /\b(hazlo asi|renderiza ahora)\b/.test(text)
  );
};

const isBarePlanConfirmation = (message: string) => {
  const text = normalizePlanningText(message);
  return /^(si|si dale|ok|okay|dale|adelante|listo|perfecto|correcto|hazlo|procede|confirmo|acepto|continua|continua con el plan|sigue|sigue con el plan|adelante con el plan)$/.test(text);
};

const findLastUserPlanInstruction = (
  history: Array<{ role: 'user' | 'assistant'; content: string }>
) =>
  [...history]
    .reverse()
    .find((item) => {
      if (item.role !== 'user') return false;
      if (isBarePlanConfirmation(item.content)) return false;

      const labels = getOrderedMediaLabels(item.content);
      const naturalPhotos = hasNaturalProjectPhotoReference(item.content);
      if (!labels.length && !naturalPhotos) return false;

      const text = normalizePlanningText(item.content);
      return /\b(video|timeline|edicion|montaje|foto|imagen|clip|transicion|efecto|movimiento|duracion|segundos)\b/.test(text);
    })?.content || '';

const findLastAssistantPlan = (
  history: Array<{ role: 'user' | 'assistant'; content: string }>
) =>
  [...history]
    .reverse()
    .find((item) => {
      if (item.role !== 'assistant') return false;
      const text = normalizePlanningText(item.content);
      return (
        /\b(plan|te recomiendo|propongo|quedaria|cuando confirmes|cuando me confirmes|si te parece|generare la timeline|generare el video)\b/.test(text) ||
        assistantRequestsPlanConfirmation(item.content)
      );
    })?.content || '';

const actionNeedsConsultativeApproval = (action: NaylaAction) =>
  action.action !== 'SEARCH_MEDIA';

const buildPlanningFallback = (
  matches: ReturnType<typeof findNaylaCapabilityMatches>
) => {
  const ready = matches.filter((item) => item.status === 'ready').slice(0, 3);
  const selected = ready.length ? ready : matches.slice(0, 3);

  if (!selected.length) {
    return 'Sí, puedo ayudarte a armarlo. Primero definamos el estilo, el movimiento y cómo quieres que cambien las escenas. Cuando el plan quede como quieres, me dices adelante y lo ejecuto.';
  }

  const ideas = selected.map((item) => item.label.toLowerCase());
  const joined = ideas.length === 1
    ? ideas[0]
    : ideas.length === 2
      ? ideas.join(' y ')
      : ideas.slice(0, -1).join(', ') + ' y ' + ideas[ideas.length - 1];

  return 'Por lo que describes, te recomiendo combinar ' + joined + '. Puedo ajustar la intensidad y el ritmo contigo antes de procesar nada. Cuando el plan te guste, dime adelante y lo ejecuto.';
};

const getOrderedMediaLabels = (message: string) => {
  const found: Array<{ label: string; index: number }> = [];
  const patterns = [
    /\b([FVAM])\s*(\d+)\b/gi,
    /\b(foto|imagen|video|audio|m[uú]sica|modelo|3d)\s*(?:n(?:[uú]mero)?\s*)?(\d+)\b/gi,
  ];

  for (const pattern of patterns) {
    for (const match of message.matchAll(pattern)) {
      const rawType = match[1].toLowerCase();
      const prefix =
        rawType === 'f' || rawType === 'foto' || rawType === 'imagen'
          ? 'F'
          : rawType === 'v' || rawType === 'video'
            ? 'V'
            : rawType === 'a' || rawType === 'audio' || rawType === 'música' || rawType === 'musica'
              ? 'A'
              : 'M';
      found.push({ label: `${prefix}${Number(match[2])}`, index: match.index ?? 0 });
    }
  }

  found.sort((a, b) => a.index - b.index);
  return Array.from(new Set(found.map((item) => item.label)));
};

const buildLabelTimelineFallback = (
  message: string,
  mediaLibrary: Array<{
    tipo: 'foto' | 'video' | 'audio' | 'modelo3d';
    url: string;
    etiqueta?: string;
  }>
): NaylaAction | null => {
  const normalized = message.toLowerCase();
  const labels = getOrderedMediaLabels(message).filter((label) => !label.startsWith('M'));
  const naturalPhotos = hasNaturalProjectPhotoReference(message);
  const requestedVisualCount = getRequestedVisualCount(message);
  const editingIntent =
    (
      /\b(crea|crear|haz|hacer|arma|armar|monta|montar|edita|editar|compone|componer|renderiza|renderizar|genera|generar)\b/.test(normalized) &&
      /\b(video|timeline|edici[oó]n|montaje|render)\b/.test(normalized)
    ) ||
    (
      (labels.length > 0 || naturalPhotos) &&
      /\b(video|timeline|edici[oó]n|montaje|foto|imagen|clip|transici[oó]n|efecto|movimiento|duraci[oó]n|segundos?|minuto)\b/.test(normalized)
    );

  if (!editingIntent) return null;

  const byLabel = new Map(
    mediaLibrary
      .filter((item) => item.etiqueta && item.tipo !== 'modelo3d')
      .map((item) => [item.etiqueta!.trim().toUpperCase(), item])
  );

  let resolved: Array<(typeof mediaLibrary)[number] | undefined> = [];

  if (labels.length) {
    resolved = labels.map((label) => byLabel.get(label));
    if (resolved.some((item) => !item)) return null;
  } else if (naturalPhotos) {
    if (requestedVisualCount) {
      const expectedLabels = Array.from(
        { length: requestedVisualCount },
        (_, index) => `F${index + 1}`
      );
      const labeledSequence = expectedLabels.map((label) => byLabel.get(label));

      if (labeledSequence.every(Boolean)) {
        resolved = labeledSequence;
      } else {
        const photos = mediaLibrary.filter((item) => item.tipo === 'foto');
        if (photos.length < requestedVisualCount) return null;
        resolved = photos.slice(-requestedVisualCount);
      }
    } else if (wantsAllProjectPhotos(message)) {
      resolved = mediaLibrary.filter((item) => item.tipo === 'foto');
    }
  }

  if (!resolved.length || resolved.some((item) => !item)) return null;

  const perItemDurationMatch = message.match(
    /\b(?:cada|por)\s+(?:foto|imagen|video|clip)[^.\n]{0,48}?(\d+(?:[.,]\d+)?)\s*(?:segundos?|s)\b/i
  );
  const durationMatch = message.match(/\b(?:aproximadamente\s+|aprox\.?\s+|unos?\s+|de\s+)?(\d+(?:[.,]\d+)?)\s*(?:segundos?|s)\b/i);
  const requestedSeconds = getRequestedTimelineSeconds(message) ??
    (durationMatch ? Number(durationMatch[1].replace(',', '.')) : null);
  const perItemSeconds = perItemDurationMatch ? Number(perItemDurationMatch[1].replace(',', '.')) : null;
  const visualCount = resolved.filter((item) => item?.tipo === 'foto' || item?.tipo === 'video').length;
  const perVisualDuration =
    perItemSeconds && Number.isFinite(perItemSeconds) && perItemSeconds > 0
      ? perItemSeconds
      : requestedSeconds && Number.isFinite(requestedSeconds) && requestedSeconds > 0 && visualCount > 0
        ? requestedSeconds / visualCount
        : undefined;

  const wantsSoftMotion = /\b(ken[ -]?burns|movimiento\s+suave|zoom\s+suave|acercamiento\s+suave|desplazamiento\s+lento)\b/i.test(message);
  const wantsCinematic = /\b(cinematogr[aá]fic[oa]s?|pel[ií]cula)\b/i.test(message);
  const wantsFade = /\b(fade|fundido|transici[oó]n(?:es)?\s+suaves?|cinematogr[aá]fic[oa]s?)\b/i.test(message);
  const wantsColorCorrection = /\b(correcci[oó]n\s+de\s+color|colores?\s+uniformes?|uniformar\s+(?:el\s+)?color)\b/i.test(message);
  const wantsVignette = /\bvi(?:ñ|n)eta\b/i.test(message);
  const wantsGlow = /\b(glow|brillo\s+(?:muy\s+)?discreto|brillo\s+leve)\b/i.test(message);

  const assets = resolved.map((item) => {
    const asset: Record<string, unknown> = {
      type: item!.tipo,
      source: 'url',
      url: item!.url,
    };
    if (perVisualDuration && (item!.tipo === 'foto' || item!.tipo === 'video')) {
      asset.durationInSeconds = perVisualDuration;
    }
    if (item!.tipo === 'foto') {
      if (wantsSoftMotion) asset.efecto = 'ken-burns';
      else if (wantsCinematic) asset.efecto = 'cinematic';
      if (wantsFade) {
        asset.transitionType = 'fade';
        asset.transitionDuration = 0.5;
      }
      if (wantsVignette) {
        asset.overlay = 'vignette';
        asset.overlayIntensity = 0.18;
      }
      const professionalEffects: Array<Record<string, unknown>> = [];
      if (wantsColorCorrection) {
        professionalEffects.push({ type: 'color-correction', intensity: 0.35 });
      }
      if (wantsGlow) {
        professionalEffects.push({ type: 'glow', intensity: 0.16 });
      }
      if (professionalEffects.length) {
        asset.professionalEffects = professionalEffects;
      }
    }
    return asset;
  });

  const parsed = {
    action: 'BUILD_TIMELINE' as const,
    assets,
    render: timelinePlanRequestsRender(message),
  };

  const validated = parseNaylaAction(JSON.stringify(parsed));
  return validated;
};

const describeActionPlan = (action: NaylaAction) => {
  const routeCount = getAvailableProvidersForAction(action).length;

  return {
    action: action.action,
    status: 'planned' as const,
    executionReady: false,
    requiresConfirmation: generationActionNames.has(action.action),
    engine: action.action === 'RUN_GPU_JOB' ? 'nayla-compute' : 'nayla-cloud',
    availableRoutes: routeCount,
    text: routeCount
      ? `Nayla preparó la tarea y tiene ${routeCount} ruta${routeCount === 1 ? '' : 's'} interna${routeCount === 1 ? '' : 's'} disponible${routeCount === 1 ? '' : 's'}.`
      : 'Nayla preparó la tarea, pero esta capacidad todavía no está habilitada.',
  };
};

const inferGpuWorkload = (
  action: Extract<NaylaAction, { action: 'RUN_GPU_JOB' }>
): GpuWorkload | null => {
  if (action.workload) return action.workload;

  const normalized = action.jobType.toLowerCase();
  if (/\b(probe|test|prueba|diagnostic)/.test(normalized)) return 'probe';
  if (/\b(video|clip|movie|animation)/.test(normalized)) return 'video';
  if (/\b(3d|mesh|model|rig|texture)/.test(normalized)) return '3d';
  if (/\b(audio|voice|speech|music|sound|voz|musica|sonido)/.test(normalized)) return 'audio';
  if (/\b(image|photo|picture|foto|imagen)/.test(normalized)) return 'image';
  return null;
};

const executeValidatedAction = async (
  action: NaylaAction,
  context: {
    userId: string;
    projectId: string;
    threadId?: string;
    attachmentIds: string[];
    appBaseUrl: string;
  }
) => {
  if (action.action === 'SEARCH_MEDIA') {
    const search = await searchStockMedia({
      query: action.query,
      kind: action.kind,
      limit: action.limit,
      providers: action.providers,
    });

    return {
      ...action,
      status: 'completed' as const,
      ...search,
      text: search.results.length
        ? `Encontré ${search.results.length} resultado${search.results.length === 1 ? '' : 's'} para “${action.query}”.`
        : `No encontré resultados utilizables para “${action.query}”.`,
    };
  }

  if (action.action === 'BUILD_TIMELINE') {
    return {
      ...action,
      projectId: context.projectId,
      threadId: context.threadId || null,
      text: 'Timeline preparado con los medios del proyecto activo.',
    };
  }

  if (action.action === 'REMOVE_VIDEO_BACKGROUND') {
    return {
      ...action,
      label: action.label.toUpperCase(),
      projectId: context.projectId,
      threadId: context.threadId || null,
      status: 'browser_ready' as const,
      engine: 'nayla-browser' as const,
      text: 'Separación de fondo preparada para procesarse de forma local.',
    };
  }

  if (action.action === 'CREATE_AUTO_CAPTIONS') {
    return {
      ...action,
      label: action.label.toUpperCase(),
      projectId: context.projectId,
      threadId: context.threadId || null,
      status: 'browser_ready' as const,
      engine: 'nayla-browser' as const,
      text: 'Transcripción y subtítulos preparados para procesarse de forma local.',
    };
  }

  if (
    action.action === 'GENERATE_IMAGE' ||
    action.action === 'GENERATE_VIDEO' ||
    action.action === 'GENERATE_AUDIO' ||
    action.action === 'GENERATE_3D'
  ) {
    const base = describeActionPlan(action);
    const mediaJob = await createMediaJobPlan({
      userId: context.userId,
      projectId: context.projectId,
      threadId: context.threadId,
      action,
      attachmentIds: context.attachmentIds,
    });

    if (!mediaJob || mediaJob.status === 'unconfigured') {
      return {
        ...base,
        projectId: context.projectId,
        threadId: context.threadId || null,
        text: 'La tarea quedó clasificada, pero esta capacidad de Nayla Cloud todavía no está habilitada.',
      };
    }

    return {
      ...base,
      status: 'awaiting_confirmation' as const,
      projectId: context.projectId,
      threadId: context.threadId || null,
      mediaJobId: mediaJob.id,
      engine: 'nayla-cloud' as const,
      requiresConfirmation: true,
      executionReady: true,
      text:
        `Nayla Cloud preparó la tarea de ${mediaJob.domain}. ` +
        'Confirma para iniciar la generación; el resultado quedará guardado en la Bóveda privada.',
    };
  }

  if (action.action === 'RUN_GPU_JOB') {
    const workload = inferGpuWorkload(action);
    if (!workload) {
      return {
        ...describeActionPlan(action),
        projectId: context.projectId,
        threadId: context.threadId || null,
        text: 'Preparé la tarea GPU, pero necesito clasificarla como image, video, audio, 3d o probe antes de alquilar una máquina.',
      };
    }

    const gpuInput = {
      workload,
      recipe: action.jobType,
      prompt: action.prompt,
      inputUrls: action.inputUrls,
      options: action.options,
    };

    if (workload !== 'probe') {
      const quote = await quoteComputeGpuJob(gpuInput);
      return {
        action: action.action,
        workload,
        engine: 'nayla-compute' as const,
        projectId: context.projectId,
        threadId: context.threadId || null,
        status: 'awaiting_confirmation' as const,
        executionReady: quote.available,
        requiresConfirmation: true,
        quote,
        pendingGpuRequest: {
          ...gpuInput,
          projectId: context.projectId,
          threadId: context.threadId,
        },
        text: quote.available
          ? 'Nayla Compute encontró una GPU compatible dentro del presupuesto. Revisa el precio Nayla y confirma antes de reservarla.'
          : (quote.reason || 'No hay una GPU compatible disponible dentro de los límites de seguridad.'),
      };
    }

    const job = await startComputeGpuJob({
      userId: context.userId,
      projectId: context.projectId,
      threadId: context.threadId,
      input: gpuInput,
      appBaseUrl: context.appBaseUrl,
    });

    return {
      action: action.action,
      workload,
      engine: 'nayla-compute' as const,
      projectId: context.projectId,
      threadId: context.threadId || null,
      gpuJobId: job.id,
      status: job.status,
      executionReady: true,
      requiresConfirmation: false,
      job,
      text:
        'Nayla Compute inició la GPU con límite de gasto y vencimiento automático. La salida quedará dentro de este proyecto y la instancia se cerrará al terminar.',
    };
  }

  return describeActionPlan(action);
};

const executeDirectLlm = async ({
  provider,
  prompt,
  images,
  systemPrompt,
}: {
  provider: 'groq' | 'mistral';
  prompt: string;
  images?: string[];
  systemPrompt: string;
}) => {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const mistralKey = process.env.MISTRAL_API_KEY?.trim();

  const groq = async () => {
    if (!groqKey) throw new Error('GROQ_API_KEY no está configurada en Vercel.');
    return new GroqProvider(groqKey, 'dialog').generateText(prompt, images, systemPrompt);
  };

  const mistral = async () => {
    if (!mistralKey) throw new Error('MISTRAL_API_KEY no está configurada en Vercel.');
    return new MistralProvider(mistralKey, 'dialog').generateText(prompt, images, systemPrompt);
  };

  if (!groqKey && !mistralKey) {
    throw new Error('No hay ninguna clave LLM de servidor configurada en Vercel.');
  }

  return provider === 'mistral'
    ? mistral().catch(async () => groq())
    : groq().catch(async () => mistral());
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let firebaseUser;
  try {
    firebaseUser = await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  try {
    const parsedBody = requestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: parsedBody.error.issues?.[0]?.message || 'Invalid parameters',
      });
    }

    const {
      message,
      images,
      history,
      provider,
      engineMode,
      projectId,
      threadId,
      attachmentIds = [],
      mediaLibrary,
      currentTimeline,
    } = parsedBody.data;

    const scope = await resolveOwnedWorkspaceScope({
      userId: firebaseUser.uid,
      projectId,
      threadId,
    });

    const ownedAttachments = attachmentIds.length
      ? await getOwnedMediaForUser({
          userId: firebaseUser.uid,
          mediaIds: attachmentIds,
          projectId: scope.projectId,
        })
      : [];

    if (ownedAttachments.length !== new Set(attachmentIds).size) {
      return res.status(403).json({
        error: 'Uno o más adjuntos no pertenecen al usuario/proyecto activo.',
      });
    }

    const attachments = ownedAttachments.map((item: Record<string, any>) => ({
      id: item.id as string,
      tipo: item.tipo as 'foto' | 'video' | 'audio' | 'modelo3d',
      nombre: item.nombre as string,
      etiqueta: item.etiqueta as string | undefined,
      fuente: item.fuente as string | undefined,
      metadata: item.metadata || {},
      url: item.r2_key
        ? createR2PresignedGetUrl({ key: item.r2_key, expiresIn: 3600 }).url
        : item.url,
    }));

    // Never trust client-side media URLs as the render source of truth.
    // They may be expired signed URLs, internal r2:// URLs, or URLs copied by the LLM
    // without their signature query string. Re-hydrate owned project media server-side.
    const libraryIds = Array.from(new Set(
      (mediaLibrary || [])
        .map((item) => item.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    ));
    const ownedLibraryRows = libraryIds.length
      ? await getOwnedMediaForUser({
          userId: firebaseUser.uid,
          mediaIds: libraryIds,
          projectId: scope.projectId,
        })
      : [];
    const ownedLibraryById = new Map(
      ownedLibraryRows.map((item: Record<string, any>) => [String(item.id), item])
    );

    const secureMediaLibrary = (mediaLibrary || []).map((item) => {
      if (!item.id) return item;
      const owned = ownedLibraryById.get(item.id);
      if (!owned) return null;
      return {
        ...item,
        tipo: owned.tipo,
        nombre: owned.nombre,
        etiqueta: owned.etiqueta,
        fuente: owned.fuente,
        metadata: owned.metadata || item.metadata || {},
        url: owned.r2_key
          ? createR2PresignedGetUrl({ key: owned.r2_key, expiresIn: 3600 }).url
          : owned.url,
      };
    }).filter(Boolean) as typeof mediaLibrary;

    let persistedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (scope.threadId) {
      const stored = await listThreadMessagesForUser({
        userId: firebaseUser.uid,
        threadId: scope.threadId,
        limit: 30,
      });
      persistedHistory = stored.messages
        .filter((item: Record<string, any>) => item.role === 'user' || item.role === 'assistant')
        .map((item: Record<string, any>) => ({
          role: item.role as 'user' | 'assistant',
          content: String(item.content || ''),
        }));

      await insertChatMessageForUser({
        userId: firebaseUser.uid,
        projectId: scope.projectId,
        threadId: scope.threadId,
        role: 'user',
        content: message,
        attachmentIds,
        metadata: {
          attachmentTypes: attachments.map((item) => item.tipo),
        },
      });
    }

    const effectiveHistory = scope.threadId ? persistedHistory : (history || []);
    const executionConfirmed = hasExplicitPlanConfirmation(message, effectiveHistory);
    const priorUserPlanInstruction = executionConfirmed
      ? findLastUserPlanInstruction(effectiveHistory)
      : '';
    const priorAssistantPlan = executionConfirmed
      ? findLastAssistantPlan(effectiveHistory)
      : '';
    const activePlanningContext = executionConfirmed
      ? [priorUserPlanInstruction, priorAssistantPlan, message].filter(Boolean).join('\n\n')
      : message;
    const intentMatches = findNaylaCapabilityMatches(activePlanningContext);

    const recentPlanAttachmentRows =
      executionConfirmed && scope.threadId
        ? await getRecentThreadAttachedMediaForUser({
            userId: firebaseUser.uid,
            projectId: scope.projectId,
            threadId: scope.threadId,
          })
        : [];
    const recentPlanAttachments = recentPlanAttachmentRows.map((item: Record<string, any>) => ({
      id: item.id as string,
      tipo: item.tipo as 'foto' | 'video' | 'audio' | 'modelo3d',
      nombre: item.nombre as string,
      etiqueta: item.etiqueta as string | undefined,
      fuente: item.fuente as string | undefined,
      metadata: item.metadata || {},
      url: item.r2_key
        ? createR2PresignedGetUrl({ key: item.r2_key, expiresIn: 3600 }).url
        : item.url,
    }));

    const userPlanningContext = [
      ...effectiveHistory
        .filter((item) => item.role === 'user')
        .map((item) => item.content),
      message,
    ].join('\n\n');

    const requestedNaturalPhotoCount = getRequestedVisualCount(activePlanningContext);
    const naturalProjectPhotoReference = hasNaturalProjectPhotoReference(activePlanningContext);
    const recentNaturalPhotoRows = naturalProjectPhotoReference
      ? await getRecentOwnedMediaForUser({
          userId: firebaseUser.uid,
          projectId: scope.projectId,
          tipo: 'foto',
          limit: requestedNaturalPhotoCount || 40,
        })
      : [];

    const recentNaturalPhotos = recentNaturalPhotoRows.map((item: Record<string, any>) => ({
      id: item.id as string,
      tipo: item.tipo as 'foto',
      nombre: item.nombre as string,
      etiqueta: item.etiqueta as string | undefined,
      fuente: item.fuente as string | undefined,
      metadata: item.metadata || {},
      url: item.r2_key
        ? createR2PresignedGetUrl({ key: item.r2_key, expiresIn: 3600 }).url
        : item.url,
    }));

    const historyLabelContext = [
      message,
      ...effectiveHistory
        .slice(-12)
        .map((item) => item.content),
    ].join('\n');
    const referencedProjectLabels = getOrderedMediaLabels(historyLabelContext)
      .filter((label) => !label.startsWith('M'))
      .slice(0, 24);

    const ownedLabelRows = referencedProjectLabels.length
      ? await getOwnedMediaByLabelsForUser({
          userId: firebaseUser.uid,
          projectId: scope.projectId,
          labels: referencedProjectLabels,
        })
      : [];

    const ownedLabelMedia = ownedLabelRows.map((item: Record<string, any>) => ({
      id: item.id as string,
      tipo: item.tipo as 'foto' | 'video' | 'audio' | 'modelo3d',
      nombre: item.nombre as string,
      etiqueta: item.etiqueta as string | undefined,
      fuente: item.fuente as string | undefined,
      metadata: item.metadata || {},
      url: item.r2_key
        ? createR2PresignedGetUrl({ key: item.r2_key, expiresIn: 3600 }).url
        : item.url,
    }));

    const mergedLibraryMap = new Map<string, any>();
    (secureMediaLibrary || []).forEach((item: any, index: number) => {
      mergedLibraryMap.set(item.id ? `id:${item.id}` : `url:${item.url}:${index}`, item);
    });
    ownedLabelMedia.forEach((item) => {
      mergedLibraryMap.set(item.id ? `id:${item.id}` : `url:${item.url}`, item);
    });
    recentNaturalPhotos.forEach((item) => {
      mergedLibraryMap.set(item.id ? `id:${item.id}` : `url:${item.url}`, item);
    });
    attachments.forEach((item) => {
      mergedLibraryMap.set(item.id ? `id:${item.id}` : `url:${item.url}`, item);
    });
    recentPlanAttachments.forEach((item) => {
      mergedLibraryMap.set(item.id ? `id:${item.id}` : `url:${item.url}`, item);
    });
    const mergedLibrary = Array.from(mergedLibraryMap.values());

    const visualIntent =
      hasExplicitVisionIntent(activePlanningContext) ||
      hasCreativeVisualIntent(activePlanningContext);
    const requestedPhotoLabels = getRequestedPhotoLabels(activePlanningContext);
    const referencedVisionCandidates = requestedPhotoLabels.size
      ? mergedLibrary.filter((item) =>
          item.tipo === 'foto' &&
          typeof item.etiqueta === 'string' &&
          requestedPhotoLabels.has(item.etiqueta.trim().toUpperCase())
        )
      : attachments.some((item) => item.tipo === 'foto')
        ? attachments.filter((item) => item.tipo === 'foto')
        : recentPlanAttachments.some((item) => item.tipo === 'foto')
          ? recentPlanAttachments.filter((item) => item.tipo === 'foto')
          : recentNaturalPhotos;

    const visionCandidateUrls = visualIntent
      ? Array.from(new Set([
          ...referencedVisionCandidates.map((item) => item.url),
          ...(images || []),
        ]))
      : [];
    const visionImages = visionCandidateUrls.slice(0, 8);
    const visionWasTruncated = visionCandidateUrls.length > visionImages.length;

    const recentPromptHistory = effectiveHistory.slice(-8);
    const labelReferenceText = executionConfirmed
      ? [priorUserPlanInstruction, message].filter(Boolean).join('\n')
      : message;
    const referencedLabels = new Set(getOrderedMediaLabels(labelReferenceText));
    const promptMediaItems = referencedLabels.size
      ? mergedLibrary.filter((item: any) =>
          typeof item.etiqueta === 'string' &&
          referencedLabels.has(item.etiqueta.trim().toUpperCase())
        )
      : attachments.length
        ? attachments
        : recentPlanAttachments.length
          ? recentPlanAttachments
          : mergedLibrary
              .filter((item: any) => typeof item.etiqueta === 'string' && item.etiqueta.trim())
              .slice(0, 20);
    const availablePromptLabels = new Set(
      promptMediaItems
        .map((item: any) => typeof item.etiqueta === 'string' ? item.etiqueta.trim().toUpperCase() : '')
        .filter(Boolean)
    );
    const missingReferencedLabels = Array.from(referencedLabels)
      .filter((label) => !availablePromptLabels.has(label));

    const promptMediaSummary = promptMediaItems.length
      ? promptMediaItems.map((item: any, index: number) => {
          const label = typeof item.etiqueta === 'string' && item.etiqueta.trim()
            ? item.etiqueta.trim().toUpperCase()
            : `item-${index + 1}`;
          return `${label}: tipo=${item.tipo}; nombre=${item.nombre || ''}`;
        }).join('\n')
      : 'ninguno';

    const executionContext = [
      `Proyecto activo: ${scope.projectId}.`,
      scope.threadId ? `Chat activo: ${scope.threadId}.` : 'Chat persistente: todavía no seleccionado.',
      `Medios relevantes para este turno:\n${promptMediaSummary}`,
      missingReferencedLabels.length
        ? `Etiquetas solicitadas que no existen o no están disponibles: ${missingReferencedLabels.join(', ')}. No inventes sustitutos.`
        : 'No hay etiquetas solicitadas ausentes.',
      currentTimeline?.length
        ? `Timeline actual: ${currentTimeline.slice(0, 20).map((item) =>
            `${item.etiqueta || '?'}:${item.tipo}`
          ).join(', ')}`
        : 'Timeline actual: vacío.',
      visualIntent
        ? (
            visionImages.length
              ? `Visión solicitada explícitamente: se cargaron ${visionImages.length} foto(s) para análisis visual.${visionWasTruncated ? ' Hay más fotos referenciadas que el límite visual actual; no afirmes haber inspeccionado las que no fueron cargadas.' : ''}`
              : 'Visión solicitada explícitamente, pero no se encontró una foto válida con esa referencia. No inventes contenido visual.'
          )
        : 'Visión NO solicitada. No describas el contenido visual de las fotos; usa etiquetas y metadatos.',
    ].join('\n\n');

    const historyText = recentPromptHistory.length
      ? recentPromptHistory
          .map((msg) => `${msg.role}: ${msg.content.slice(0, 2500)}`)
          .join('\n')
      : '';

    const fullPrompt = [
      executionContext,
      historyText ? `Historial:\n${historyText}` : '',
      `Usuario: ${message}`,
    ].filter(Boolean).join('\n\n');

    const compactSystemPrompt = `
Eres Nayla, una editora multimedia consultiva. Entiende lenguaje cotidiano y recomienda soluciones usando solo capacidades reales del editor.

SEGURIDAD Y CONTEXTO:
- Nunca muestres secretos, API keys, proveedores externos, infraestructura interna ni URLs que no vengan del contexto.
- F1/F2... son fotos; V1/V2... videos; A1/A2... audios; M1/M2... modelos 3D.
- Nunca sustituyas una etiqueta inexistente por otro archivo. Si falta una etiqueta, dilo y no emitas una acción inventada.
- Si F1/F2/V1/A1 u otra etiqueta está disponible en el contexto del proyecto, úsala directamente. Nunca le pidas al usuario que copie o proporcione una URL para un medio ya guardado.
- Las fotos subidas no se analizan visualmente salvo que el usuario lo pida de forma explícita.
- Para editar medios existentes usa el timeline. Para crear contenido nuevo usa generación. GPU/Compute solo cuando realmente sea necesario.
- La cantidad de fotos/videos y la cantidad de subtítulos son pistas independientes. Nunca asumas que debe existir un subtítulo por cada foto.
- Si hay 9 fotos y 8 bloques de subtítulos, distribuye las 9 fotos durante la duración visual y distribuye los 8 bloques por tiempo de forma independiente.
- Si el usuario confirmó un plan cuyo objetivo es producir, renderizar, exportar o crear el video final, BUILD_TIMELINE debe llevar render:true.

MODO CONSULTIVO:
- EJECUCION_CONFIRMADA=${executionConfirmed ? 'SI' : 'NO'}.
- Si es NO, conversa primero: explica un plan breve, concreto y natural. No emitas JSON ejecutable.
- Si es SI, el usuario está confirmando un plan previo. Responde únicamente con un JSON válido de una acción.
- No digas que algo está procesando, renderizando o guardándose hasta que el servidor lo confirme.
- Si la petición es vaga, tradúcela tú a controles apropiados y recomienda 1 a 4 recursos útiles.
- Usa texto limpio: sin Markdown visible, sin asteriscos, backticks, tablas ni nombres técnicos internos innecesarios.

MAPA DE MEDIOS:
- F1/F2/... son identificadores estables de fotos.
- V1/V2/... son identificadores estables de videos.
- A1/A2/... son identificadores estables de audios.
- M1/M2/... son identificadores estables de modelos 3D.
- "foto 1", "primera foto" y F1 se refieren al mismo tipo de recurso cuando el contexto lo deja claro; lo mismo para video, audio y 3D.
- Las etiquetas son referencias internas: nunca deben aparecer como texto visible, título o subtítulo salvo que el usuario pida literalmente mostrar esa etiqueta.
- Si el usuario dice "estas fotos", "los archivos que subí" o algo equivalente, usa primero los adjuntos del plan activo. No sustituyas esos archivos por otros de la Bóveda.
- Las restricciones explícitas del usuario son obligatorias (orden, duración, recorte, medio concreto). Todo lo no especificado es terreno creativo: elige efectos, transiciones, movimiento, ritmo y acabado usando las capacidades reales disponibles.
- Si recibiste contexto visual, úsalo para decidir qué foto funciona mejor en cada momento y qué tratamiento le conviene. No apliques el mismo efecto mecánicamente a todas las escenas si no aporta.
- Texto de instrucciones, encabezados como BLOQUE 1/2 y notas técnicas nunca son subtítulos. Solo el contenido literal destinado a pantalla entra en subtitles/titles.

BIBLIA COMPLETA DE CAPACIDADES:
${JSON.stringify(getNaylaCapabilityBibleForPrompt())}

CATÁLOGO REAL DEL MOTOR REMOTION:
${JSON.stringify(REMOTION_CPU_PUBLIC_CATALOG)}

CAPACIDADES ESPECIALMENTE RELEVANTES PARA ESTE TURNO:
${JSON.stringify(intentMatches.map((item) => ({
  id: item.id,
  label: item.label,
  description: item.description,
  status: item.status,
  usefulFor: item.usefulFor,
})))}

ACCIONES:
1. BUILD_TIMELINE para editar fotos, videos o audio existentes.
Para medios guardados en el proyecto, prefiere etiquetas estables y deja que el servidor resuelva el archivo:
{"action":"BUILD_TIMELINE","assets":[{"type":"foto","source":"label","label":"F1","durationInSeconds":3}],"render":true}
Puedes mezclar F/V/A en el orden que pida el usuario o en el orden creativo que elijas cuando te dé libertad.
Cada asset puede usar durationInSeconds, volume, fadeIn, fadeOut, delay, startFrom, trimBefore, trimAfter, loop, playbackRate, efecto, transitionType, transitionDuration, overlay, overlayIntensity, professionalEffects, motionBlur, gsapMotion y proceduralMotion.
Puedes combinar de forma moderada varias capacidades reales cuando mejoren el resultado. No estás limitada a ken-burns/fade.
También puedes usar subtitles, titles, skiaGraphics, vectorAnimations y threeScenes cuando aporten al plan.
Para M1/M2 usa threeScenes y la etiqueta exacta; para una foto que solo debe parecer 3D usa profundidad/parallax, no una escena GLB.

2. REMOVE_VIDEO_BACKGROUND:
{"action":"REMOVE_VIDEO_BACKGROUND","label":"V1","model":"modnet","keepAudio":true,"quality":"high"}

3. CREATE_AUTO_CAPTIONS:
{"action":"CREATE_AUTO_CAPTIONS","label":"V1","language":"es","model":"base","style":"tiktok","position":"bottom","fontSize":48}

4. SEARCH_MEDIA:
{"action":"SEARCH_MEDIA","query":"descripción","kind":"image","limit":6}

5. Generación nueva:
{"action":"GENERATE_IMAGE","prompt":"descripción"}
{"action":"GENERATE_VIDEO","prompt":"descripción"}
{"action":"GENERATE_AUDIO","mode":"tts","text":"texto"}
{"action":"GENERATE_3D","mode":"image_to_3d","inputUrl":"URL_EXACTA"}

6. RUN_GPU_JOB solo para trabajo pesado que lo requiera:
{"action":"RUN_GPU_JOB","workload":"video","jobType":"proceso","inputUrls":["URL_EXACTA"]}

Para medios F/V/A existentes usa source:"label" y su etiqueta estable. No inventes etiquetas. Las URLs se resuelven internamente y no necesitas pedirlas al usuario.

POLÍTICA DE MOTOR:
${getNaylaExecutionPolicyPrompt(engineMode)}
MODO_MOTOR=${engineMode}
`;

    const fallbackExecutionContext = executionConfirmed
      ? [priorUserPlanInstruction, priorAssistantPlan, message].filter(Boolean).join('\n\n')
      : message;
    const confirmedTimelineContext = executionConfirmed
      ? activePlanningContext
      : message;
    const subtitleBlocks = extractSubtitleBlocks(
      executionConfirmed && priorUserPlanInstruction
        ? priorUserPlanInstruction
        : message
    );
    const requestedTimelineSeconds = getRequestedTimelineSeconds(activePlanningContext);
    const confirmedTimelineShouldRender =
      executionConfirmed && timelinePlanRequestsRender(confirmedTimelineContext);

    let responseText = '';
    try {
      responseText = await executeDirectLlm({
        provider,
        prompt: fullPrompt,
        images: visionImages,
        systemPrompt: compactSystemPrompt,
      });
    } catch (error: any) {
      console.error('[chat.ts] Todos los motores IA de Nayla fallaron:', error);
      if (!executionConfirmed) {
        return res.status(500).json({
          error: 'Nayla no pudo procesar esta solicitud en este momento. Inténtalo nuevamente.',
        });
      }
    }

    const parsedAction =
      parseNaylaAction(responseText) ||
      (executionConfirmed ? buildLabelTimelineFallback(fallbackExecutionContext, mergedLibrary) : null);

    const canonicalizeUrl = (value: string) => {
      const exact = mergedLibrary.find((item: any) => item.url === value);
      if (exact?.url) return exact.url;

      try {
        const requested = new URL(value);
        const requestedKey = requested.origin + requested.pathname;
        const byPath = mergedLibrary.find((item: any) => {
          try {
            const candidate = new URL(item.url);
            return candidate.origin + candidate.pathname === requestedKey;
          } catch {
            return false;
          }
        });
        if (byPath?.url) return byPath.url;
      } catch {
        // Non-HTTP URLs are handled by label fallback or validation below.
      }

      return value;
    };

    const action = parsedAction?.action === 'BUILD_TIMELINE'
      ? (() => {
          let assetResolutionFailed = false;
          let assets = parsedAction.assets.map((asset: any) => {
            if (asset?.source === 'label' && typeof asset?.label === 'string') {
              const label = asset.label.trim().toUpperCase();
              const expectedType = asset.type === 'image' ? 'foto' : asset.type;
              const media = mergedLibrary.find((item: any) =>
                item.tipo === expectedType &&
                typeof item.etiqueta === 'string' &&
                item.etiqueta.trim().toUpperCase() === label
              );
              if (!media?.url) {
                assetResolutionFailed = true;
                return asset;
              }
              const { label: _label, ...rest } = asset;
              return {
                ...rest,
                source: 'url' as const,
                url: media.url,
              };
            }

            if (asset?.source === 'url' && typeof asset?.url === 'string') {
              return {
                ...asset,
                url: canonicalizeUrl(asset.url),
              };
            }

            assetResolutionFailed = true;
            return asset;
          });

          if (assetResolutionFailed) return null;

          const photoOnly = assets.length > 0 && assets.every((asset: any) => asset.type === 'foto' || asset.type === 'image');
          if (photoOnly && requestedTimelineSeconds && requestedTimelineSeconds > 0) {
            const perPhoto = requestedTimelineSeconds / assets.length;
            assets = assets.map((asset: any) => ({
              ...asset,
              durationInSeconds: perPhoto,
            }));
          }

          const existingDuration = assets.reduce(
            (sum: number, asset: any) => sum + Math.max(0, Number(asset.durationInSeconds) || 0),
            0
          );
          const subtitleDuration =
            requestedTimelineSeconds ||
            (existingDuration > 0 ? existingDuration : Math.max(1, assets.length * 5));

          return {
            ...parsedAction,
            assets,
            render: Boolean(parsedAction.render || confirmedTimelineShouldRender),
            ...(subtitleBlocks.length
              ? { subtitles: buildEvenSubtitleTiming(subtitleBlocks, subtitleDuration) }
              : {}),
          } as NaylaAction;
        })()
      : parsedAction?.action === 'REMOVE_VIDEO_BACKGROUND'
        ? (() => {
            const label = parsedAction.label.trim().toUpperCase();
            const video = mergedLibrary.find((item: any) =>
              item.tipo === 'video' &&
              typeof item.etiqueta === 'string' &&
              item.etiqueta.trim().toUpperCase() === label
            );
            return video?.url
              ? ({ ...parsedAction, label, url: video.url } as NaylaAction)
              : null;
          })()
        : parsedAction?.action === 'CREATE_AUTO_CAPTIONS'
          ? (() => {
              const label = parsedAction.label.trim().toUpperCase();
              const media = mergedLibrary.find((item: any) =>
                (item.tipo === 'video' || item.tipo === 'audio') &&
                typeof item.etiqueta === 'string' &&
                item.etiqueta.trim().toUpperCase() === label
              );
              return media?.url
                ? ({ ...parsedAction, label, url: media.url } as NaylaAction)
                : null;
            })()
          : parsedAction;

    if (action?.action === 'RUN_GPU_JOB' && !canStartGpuCompute(engineMode)) {
      const cloudFirstText =
        'Voy a mantener esta tarea en Cloud primero. En este modo no se alquila GPU automáticamente. Si la operación realmente necesita Potencia, te lo indicaré antes de reservar una tarjeta.';

      if (scope.threadId) {
        await insertChatMessageForUser({
          userId: firebaseUser.uid,
          projectId: scope.projectId,
          threadId: scope.threadId,
          role: 'assistant',
          content: cloudFirstText,
          metadata: {
            responseType: 'planning',
            requiresCompute: true,
            engineMode,
          },
        });
      }

      return res.status(200).json({
        text: cloudFirstText,
        planning: true,
        requiresConfirmation: false,
        requiresCompute: true,
        engine: 'nayla-cloud',
        projectId: scope.projectId,
        threadId: scope.threadId || null,
      });
    }

    if (action && actionNeedsConsultativeApproval(action) && !executionConfirmed) {
      let planningText = sanitizeNaylaPublicText(responseText);
      if (!planningText || planningText.startsWith('{') || planningText.includes('"action"')) {
        planningText = buildPlanningFallback(intentMatches);
      }

      if (scope.threadId) {
        await insertChatMessageForUser({
          userId: firebaseUser.uid,
          projectId: scope.projectId,
          threadId: scope.threadId,
          role: 'assistant',
          content: planningText,
          metadata: {
            responseType: 'planning',
            bibleVersion: NAYLA_CAPABILITY_BIBLE_VERSION,
            matchedCapabilities: intentMatches.map((item) => item.id),
          },
        });
      }

      return res.status(200).json({
        text: planningText,
        planning: true,
        requiresConfirmation: true,
        matchedCapabilities: intentMatches.map((item) => ({
          id: item.id,
          label: item.label,
          status: item.status,
        })),
        projectId: scope.projectId,
        threadId: scope.threadId || null,
      });
    }

    if (action) {
      try {
        const executed = await executeValidatedAction(action, {
          userId: firebaseUser.uid,
          projectId: scope.projectId,
          threadId: scope.threadId,
          attachmentIds,
          appBaseUrl: resolveRequestPublicBaseUrl(req),
        });

        if (scope.threadId) {
          const persistedExecuted = { ...(executed as Record<string, unknown>) };
          if (
            executed.action === 'REMOVE_VIDEO_BACKGROUND' ||
            executed.action === 'CREATE_AUTO_CAPTIONS'
          ) {
            delete persistedExecuted.url;
          }

          await insertChatMessageForUser({
            userId: firebaseUser.uid,
            projectId: scope.projectId,
            threadId: scope.threadId,
            role: 'assistant',
            content: typeof executed.text === 'string' ? executed.text : 'Acción preparada.',
            action: persistedExecuted,
            metadata: { responseType: 'action' },
          });
        }

        return res.status(200).json({
          ...executed,
          projectId: scope.projectId,
          threadId: scope.threadId || null,
        });
      } catch (error) {
        const actionMessage = sanitizeNaylaPublicText(
          error instanceof Error ? error.message : 'La acción de Nayla no pudo ejecutarse.'
        );
        return res.status(502).json({
          error: actionMessage,
          action: action.action,
          projectId: scope.projectId,
          threadId: scope.threadId || null,
        });
      }
    }

    let publicResponseText = sanitizeNaylaPublicText(responseText);
    const looksLikeTechnicalAction =
      /^\s*\{/.test(responseText) &&
      /"action"\s*:/.test(responseText);
    if (looksLikeTechnicalAction) {
      publicResponseText = executionConfirmed
        ? 'No pude convertir ese plan en una edición segura. Conservé el plan sin mostrar detalles técnicos; revisa que las etiquetas del proyecto sigan disponibles y vuelve a decirme adelante.'
        : buildPlanningFallback(intentMatches);
    }
    if (
      /\b(en\s+marcha|renderiz(?:ando|aci[oó]n)|procesando|guard(?:ando|ar[aá]).*b[oó]veda|cuando\s+termine)\b/i.test(publicResponseText) &&
      /\b(video|render|timeline|edici[oó]n)\b/i.test(message)
    ) {
      publicResponseText = 'No se inició ningún procesamiento todavía. Puedes indicarme los medios por F/V/A o hablar de forma natural sobre las fotos, videos y audios del plan activo.';
    }

    if (scope.threadId) {
      await insertChatMessageForUser({
        userId: firebaseUser.uid,
        projectId: scope.projectId,
        threadId: scope.threadId,
        role: 'assistant',
        content: publicResponseText,
        metadata: { responseType: 'text' },
      });
    }

    return res.status(200).json({
      text: publicResponseText,
      projectId: scope.projectId,
      threadId: scope.threadId || null,
    });
  } catch (error: any) {
    console.error('[chat.ts] Error general:', error);
    const rawMessage = error?.message || 'Error interno de Nayla.';
    const message = sanitizeNaylaPublicText(rawMessage);
    const status = rawMessage.includes('no pertenece') || rawMessage.includes('no existe') ? 403 : 500;
    return res.status(status).json({ error: message });
  }
}
