import { EDITOR_LIBRARY_VERSION, EDITOR_BOOK_INDEX, EDITOR_LIBRARY_ROUTING_PROMPT, editorSessionSchema, parseEditorSession, readEditorBooks, type EditorSession } from '../../lib/naylaCapabilityLibrary';
import { findAcceptedEditorRecipes } from '../../lib/naylaRecipeMemory';
import { createNaylaActionPlan, getPendingNaylaActionPlan } from '../../lib/naylaUniversalActions';
import { buildEditorReview } from '../../lib/naylaEditorReview';
import { NAYLA_EDITOR_CONTRACT, EDITOR_PLANNING_RULES } from '../../lib/naylaEditorContract';
import { NAYLA_EDITING_GUIDANCE } from '../../lib/naylaEditingLibrary';
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
  getRequestedVisualCount,
  hasNaturalProjectPhotoReference,
  timelinePlanRequestsRender,
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
  tipo: z.enum(['foto', 'video', 'audio', 'documento', 'modelo3d']),
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
  attachmentIds: z.array(z.string().uuid()).max(200).optional(),
  mediaLibrary: z.array(mediaLibraryItemSchema).max(500).optional(),
  currentEditorState: z.record(z.string(), z.unknown()).optional(),
  currentTimeline: z.array(z.object({
    id: z.string().optional(),
    tipo: z.enum(['foto', 'video', 'audio']),
    url: z.string().url(),
    nombre: z.string().max(500).optional(),
    etiqueta: z.string().max(100).optional(),
  }).passthrough()).max(250).optional(),
});

const generationActionNames = new Set([
  'GENERATE_IMAGE',
  'GENERATE_VIDEO',
  'GENERATE_AUDIO',
  'GENERATE_3D',
  'RUN_GPU_JOB',
]);

const hasExplicitVisionIntent = (message: string) =>
  !/\b(?:no|sin)\s+(?:analizar|analices|revisar|revises|mirar|mires|ver|vision)\b/i.test(message) &&
  /\b(?:fotos?|im[aá]genes?|F\s*\d+)\b/i.test(message) &&
  (/\b(analiza|analizar|analices|revisa|revisar|revises|mira|mirar|observa|observar|inspecciona|inspeccionar|describe|describir|compara|comparar)\b/i.test(message) ||
  /\bqu[eé]\s+(?:hay|aparece|ves)\b/i.test(message));

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
  action.action !== 'SEARCH_MEDIA' && action.action !== 'BUILD_TIMELINE';

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
    /\b([FVAMD])\s*(\d+)\b/gi,
    /\b(foto|imagen|video|audio|m[uú]sica|documento|archivo|pdf|modelo|3d)\s*(?:n(?:[uú]mero)?\s*)?(\d+)\b/gi,
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
              : rawType === 'd' || rawType === 'documento' || rawType === 'archivo' || rawType === 'pdf'
                ? 'D'
                : 'M';
      found.push({ label: `${prefix}${Number(match[2])}`, index: match.index ?? 0 });
    }
  }

  found.sort((a, b) => a.index - b.index);
  return Array.from(new Set(found.map((item) => item.label)));
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

const isAbortLikeError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const name = String((error as any).name || '');
  return name === 'AbortError' || name === 'TimeoutError';
};

const isLlmCapacityError = (error: unknown) => {
  if (!error) return false;
  const raw = [
    (error as any)?.message,
    (error as any)?.body,
    (error as any)?.status,
    (error as any)?.statusCode,
  ].filter(Boolean).join(' ');
  return (
    Number((error as any)?.status) === 429 ||
    Number((error as any)?.statusCode) === 429 ||
    /rate[_ -]?limit|too many requests|quota|insufficient.{0,24}(credit|balance)|credits? exhausted|limit-req-minute['": ]+0/i.test(raw)
  );
};

const executeDirectLlm = async ({
  provider,
  prompt,
  images,
  systemPrompt,
  signal,
  maxCompletionTokens = 12000,
}: {
  provider: 'groq' | 'mistral';
  prompt: string;
  images?: string[];
  systemPrompt: string;
  signal?: AbortSignal;
  maxCompletionTokens?: number;
}) => {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const mistralKeys = Array.from(new Set([
    process.env.MISTRAL_API_KEY?.trim(),
    process.env.MISTRAL_API_KEY_2?.trim(),
    process.env.MISTRAL_API_KEY_SECONDARY?.trim(),
    process.env.MISTRAL_API_KEY_BACKUP?.trim(),
  ].filter((value): value is string => Boolean(value))));

  const requestedImages = Array.isArray(images) ? images.filter(Boolean) : [];
  const groqImages = requestedImages.slice(0, 3);

  type Candidate = {
    id: string;
    provider: 'groq' | 'mistral';
    run: (withImages: boolean) => Promise<string>;
  };

  const candidates: Candidate[] = [];

  if (groqKey) {
    candidates.push({
      id: 'groq',
      provider: 'groq',
      run: async (withImages) => {
        signal?.throwIfAborted();
        return new GroqProvider(groqKey, 'dialog').generateText(
          prompt,
          withImages ? groqImages : [],
          systemPrompt,
          { maxCompletionTokens, maxContinuations: 2, maxTransientRetries: 2, signal }
        );
      },
    });
  }

  mistralKeys.forEach((key, index) => {
    candidates.push({
      id: `mistral-${index + 1}`,
      provider: 'mistral',
      run: async (withImages) => {
        signal?.throwIfAborted();
        return new MistralProvider(key, 'dialog').generateText(
          prompt,
          withImages ? requestedImages : [],
          systemPrompt,
          { maxCompletionTokens, maxContinuations: 2, maxTransientRetries: 2, signal }
        );
      },
    });
  });

  if (!candidates.length) {
    throw new Error('No hay ninguna clave LLM de servidor configurada en Vercel.');
  }

  const ordered = [
    ...candidates.filter((candidate) => candidate.provider === provider),
    ...candidates.filter((candidate) => candidate.provider !== provider),
  ];

  const attempts = async (withImages: boolean) => {
    let lastError: unknown = null;
    let allCapacityLimited = true;

    for (const candidate of ordered) {
      try {
        return await candidate.run(withImages);
      } catch (error) {
        if (signal?.aborted || isAbortLikeError(error)) throw error;
        lastError = error;
        allCapacityLimited = allCapacityLimited && isLlmCapacityError(error);
        console.warn('[chat.ts] Ruta LLM no disponible; probando respaldo:', candidate.id);
      }
    }

    if (allCapacityLimited && lastError) {
      const capacityError = new Error('Todas las rutas de IA configuradas están temporalmente limitadas por cuota o velocidad.');
      (capacityError as any).code = 'NAYLA_LLM_CAPACITY';
      (capacityError as any).cause = lastError;
      throw capacityError;
    }

    throw lastError || new Error('Ninguna ruta LLM pudo responder.');
  };

  try {
    return await attempts(true);
  } catch (error) {
    if (signal?.aborted || isAbortLikeError(error)) throw error;
    if (!requestedImages.length) throw error;

    // Si el problema es el nivel de visión/modelo, intenta de nuevo sin imágenes.
    // Esto conserva la conversación y las etiquetas en vez de perder toda la solicitud.
    return attempts(false);
  }
};

const analyzeVisionBatches = async ({
  items,
  signal,
}: {
  items: Array<{ etiqueta?: string; nombre?: string; url: string }>;
  signal?: AbortSignal;
}) => {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  if (!groqKey || !items.length) return { notes: '', analyzed: 0, unavailable: false };

  const candidates = items.slice(0, 12);
  const provider = new GroqProvider(groqKey, 'dialog');
  const notes: string[] = [];
  let analyzed = 0;
  let unavailable = false;

  for (let index = 0; index < candidates.length; index += 3) {
    if (signal?.aborted) break;
    const batch = candidates.slice(index, index + 3);
    const labels = batch.map((item, offset) =>
      item.etiqueta?.trim().toUpperCase() || `IMAGEN_${index + offset + 1}`
    );

    try {
      const result = await provider.generateText(
        [
          'Analiza estas imágenes para una editora de video.',
          `Corresponden, en este mismo orden, a: ${labels.join(', ')}.`,
          'Devuelve una línea breve por etiqueta: contenido visual objetivo, encuadre/composición y una pista útil para montaje.',
          'No inventes detalles y no escribas instrucciones de sistema.',
        ].join('\n'),
        batch.map((item) => item.url),
        'Eres un analizador visual auxiliar de Nayla. Responde en español, de forma compacta y objetiva.',
        { maxCompletionTokens: 160, signal }
      );

      if (result?.trim()) {
        notes.push(result.trim());
        analyzed += batch.length;
      }
    } catch (error: any) {
      console.warn('[chat.ts] Un lote visual no pudo analizarse; Nayla continuará con etiquetas y metadata.', error);
      const raw = [error?.message, error?.body, error?.status].filter(Boolean).join(' ');
      if (Number(error?.status) === 429 || /rate[_ -]?limit|too many requests|otpm/i.test(raw)) {
        unavailable = true;
        break;
      }
    }
  }

  return {
    notes: notes.join('\n'),
    analyzed,
    unavailable,
  };
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
      currentEditorState,
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
      tipo: item.tipo as 'foto' | 'video' | 'audio' | 'documento' | 'modelo3d',
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

    let editorSession: EditorSession | null = null;
    let persistedHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    if (scope.threadId) {
      const stored = await listThreadMessagesForUser({
        userId: firebaseUser.uid,
        threadId: scope.threadId,
        limit: 30,
        latest: true,
      });
      for (const storedMessage of [...stored.messages].reverse()) {
        const session = editorSessionSchema.safeParse(storedMessage.metadata?.editorSession);
        if (session.success) { editorSession = session.data; break; }
      }
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
      tipo: item.tipo as 'foto' | 'video' | 'audio' | 'documento' | 'modelo3d',
      nombre: item.nombre as string,
      etiqueta: item.etiqueta as string | undefined,
      fuente: item.fuente as string | undefined,
      metadata: item.metadata || {},
      url: item.r2_key
        ? createR2PresignedGetUrl({ key: item.r2_key, expiresIn: 3600 }).url
        : item.url,
    }));

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
      .slice(0, 200);

    const ownedLabelRows = referencedProjectLabels.length
      ? await getOwnedMediaByLabelsForUser({
          userId: firebaseUser.uid,
          projectId: scope.projectId,
          labels: referencedProjectLabels,
        })
      : [];

    const ownedLabelMedia = ownedLabelRows.map((item: Record<string, any>) => ({
      id: item.id as string,
      tipo: item.tipo as 'foto' | 'video' | 'audio' | 'documento' | 'modelo3d',
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

    // Vision is opt-in. Normal editing works from stable F/V/A/D/M labels and metadata.
    // A prior plan that mentioned vision must not make a later bare "Dale" re-analyze the same photos.
    const llmSignal = AbortSignal.timeout(180_000);
    const visualIntent = hasExplicitVisionIntent(message);
    const requestedPhotoLabels = getRequestedPhotoLabels(message);
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

    const uniqueReferencedVisionCandidates = Array.from(
      new Map(
        referencedVisionCandidates
          .filter((item: any) => typeof item?.url === 'string' && item.url)
          .map((item: any) => [item.url, item])
      ).values()
    ) as Array<{ etiqueta?: string; nombre?: string; url: string }>;

    const visionCandidateUrls = visualIntent
      ? Array.from(new Set([
          ...uniqueReferencedVisionCandidates.map((item) => item.url),
          ...(images || []),
        ]))
      : [];

    const shouldBatchVision = visualIntent && uniqueReferencedVisionCandidates.length > 3;
    const batchedVision = shouldBatchVision
      ? await analyzeVisionBatches({ items: uniqueReferencedVisionCandidates, signal: llmSignal })
      : { notes: '', analyzed: 0, unavailable: false };

    // Groq's current vision route accepts at most 3 images per request.
    // For larger sets, the auxiliary batched analysis is folded into the final text prompt.
    const visionImages = batchedVision.unavailable
      ? []
      : batchedVision.notes
        ? []
        : visionCandidateUrls.slice(0, 3);
    const inspectedVisualCount = batchedVision.notes
      ? batchedVision.analyzed
      : visionImages.length;
    const visionWasTruncated = visionCandidateUrls.length > inspectedVisualCount;

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
          const preview = item.tipo === 'documento' && typeof item?.metadata?.textPreview === 'string'
            ? `; texto=${item.metadata.textPreview.slice(0, 6000)}`
            : '';
          return `${label}: tipo=${item.tipo}; nombre=${item.nombre || ''}; duración=${item.durationInSeconds ?? item.metadata?.durationInSeconds ?? 'desconocida'}${preview}`;
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
        ? `Timeline actual (conserva sus controles al editar solo una parte): ${JSON.stringify(currentTimeline)}`
        : 'Timeline actual: vacío.',
      visualIntent
        ? (
            inspectedVisualCount
              ? `Visión activada para este plan: se inspeccionaron ${inspectedVisualCount} foto(s).${visionWasTruncated ? ' Hay más fotos adjuntas que las inspeccionadas visualmente en este turno; conserva todas por etiqueta y no inventes detalles de las restantes.' : ''}`
              : 'Visión requerida para este plan, pero no se pudo inspeccionar ninguna foto. Continúa usando etiquetas y metadatos sin inventar contenido visual.'
          )
        : 'Visión NO solicitada. No describas el contenido visual de las fotos; usa etiquetas y metadatos.',
      batchedVision.notes
        ? `Notas del análisis visual por lotes:\n${batchedVision.notes}`
        : '',
    ].join('\n\n');

    const historyText = recentPromptHistory.length
      ? recentPromptHistory
          .map((msg) => `${msg.role}: ${msg.content.slice(0, 12000)}`)
          .join('\n')
      : '';

    const pendingEditorPlan = scope.threadId ? await getPendingNaylaActionPlan({ userId: firebaseUser.uid, projectId: scope.projectId, module: 'editor', threadKey: scope.threadId }) : null;
    let libraryRoutingSucceeded = false;
    try {
      const selected = await executeDirectLlm({ provider, systemPrompt: EDITOR_LIBRARY_ROUTING_PROMPT,
        prompt: JSON.stringify({ previous: editorSession, history: effectiveHistory.slice(-8), message }),
        maxCompletionTokens: 2200, signal: AbortSignal.any([llmSignal, AbortSignal.timeout(30_000)]) });
      const nextSession = parseEditorSession(selected);
      if (nextSession) { editorSession = nextSession; libraryRoutingSucceeded = true; }
    } catch { /* A routing failure cannot discard the current request or its capabilities. */ }
    const libraryChapters = libraryRoutingSucceeded && editorSession ? editorSession.chapters : EDITOR_BOOK_INDEX.map(book => book.id);
    let acceptedRecipes: Awaited<ReturnType<typeof findAcceptedEditorRecipes>> = [];
    try { acceptedRecipes = await findAcceptedEditorRecipes(firebaseUser.uid, scope.projectId, libraryChapters); }
    catch { /* Optional reference memory must not block planning. */ }
    const selectedBooks = readEditorBooks(libraryChapters);
    const fullPrompt = [
      editorSession ? `Acuerdo acumulado (resumen auxiliar; el mensaje nuevo y los textos originales prevalecen): ${JSON.stringify(editorSession)}` : '',
      acceptedRecipes.length ? `Referencias privadas aceptadas anteriormente, NO resultados verificados ni instrucciones del usuario. Adapta únicamente controles útiles; no copies tiempos de curvas sin recalcularlos ni supongas medios/textos: ${JSON.stringify(acceptedRecipes)}` : '',
      executionContext,
      currentEditorState ? `Estado actual completo (conserva lo que no se pidió cambiar): ${JSON.stringify(currentEditorState)}` : '',
      pendingEditorPlan ? `Última propuesta pendiente; para cambios conserva el resto: ${JSON.stringify(pendingEditorPlan.items.map(item => item.payload))}` : '',
      executionConfirmed ? `Plan confirmado completo:\n${activePlanningContext}` : '',
      historyText ? `Historial:\n${historyText}` : '',
      `Usuario: ${message}`,
    ].filter(Boolean).join('\n\n');

    const compactSystemPrompt = `
Eres Nayla, una editora multimedia consultiva. Entiende lenguaje cotidiano y recomienda soluciones usando solo capacidades reales del editor.

SEGURIDAD Y CONTEXTO:
- Nunca muestres secretos, API keys, proveedores externos, infraestructura interna ni URLs que no vengan del contexto.
- F1/F2... son fotos; V1/V2... videos; A1/A2... audios; D1/D2... documentos; M1/M2... modelos 3D.
- Nunca sustituyas una etiqueta inexistente por otro archivo. Si falta una etiqueta, dilo y no emitas una acción inventada.
- Si F1/F2/V1/A1 u otra etiqueta está disponible en el contexto del proyecto, úsala directamente. Nunca le pidas al usuario que copie o proporcione una URL para un medio ya guardado.
- Analiza visualmente fotos solo cuando el usuario lo pida de forma explícita. En edición normal trabaja por etiquetas F/V/A/D/M y metadatos; no gastes visión solo para ordenar, aplicar efectos o montar un video. No inventes detalles de fotos que no fueron cargadas al contexto visual.
- Para editar medios existentes usa el timeline. Para crear contenido nuevo usa generación. GPU/Compute solo cuando realmente sea necesario.
- La cantidad de fotos/videos y la cantidad de subtítulos son pistas independientes. Nunca asumas que debe existir un subtítulo por cada foto.
- Si hay 9 fotos y 8 bloques de subtítulos, distribuye las 9 fotos durante la duración visual y distribuye los 8 bloques por tiempo de forma independiente.
- Si el usuario confirmó un plan cuyo objetivo es producir, renderizar, exportar o crear el video final, BUILD_TIMELINE debe llevar render:true.

${NAYLA_EDITING_GUIDANCE}

${EDITOR_PLANNING_RULES}

ÍNDICE DE LA BIBLIOTECA CONECTADA:
${JSON.stringify(EDITOR_BOOK_INDEX)}

CAPÍTULOS CONSULTADOS CON INSTRUCCIONES, OPCIONES, CONTRATOS Y EJEMPLOS:
${JSON.stringify(selectedBooks)}

${!libraryRoutingSucceeded || !editorSession || editorSession.mode === 'prepare' || executionConfirmed ? `CONTRATO COMPLETO PARA ESCRIBIR EL PLAN: ${JSON.stringify(NAYLA_EDITOR_CONTRACT)}` : 'Ahora asesora y explora las opciones de los capítulos consultados. No emitas BUILD_TIMELINE en este turno exploratorio.'}
- Recomienda pocas opciones explicando su resultado. Si pide más, amplía dentro del tema; si pide toda la lista, enumera todas sus opciones conectadas. No limites las propuestas a los ejemplos de las fichas.
- Conserva decisiones confirmadas y distingue recomendaciones aún sin elegir. La memoria es referencia, nunca una nueva orden.
- Si la capacidad solicitada no está en los capítulos disponibles, indica qué falta; no inventes controles.

MODO CONSULTIVO:
- EJECUCION_CONFIRMADA=${executionConfirmed ? 'SI' : 'NO'}.
- Si el usuario pide una edición concreta, prepara el JSON BUILD_TIMELINE para revisión. Si pide el video terminado, usa render:true; el sistema esperará el botón Aceptar antes de ejecutarlo.
- Si pregunta, compara opciones o pide ideas, conversa y propone un plan breve. Pregunta solo si falta información imprescindible. Las acciones de generación externa y Compute mantienen su confirmación.
- Si es SI, el usuario está confirmando un plan previo. Responde únicamente con un JSON válido de una acción.
- No digas que algo está procesando, renderizando o guardándose hasta que el servidor lo confirme.
- Interpreta el objetivo y el contexto, no solo palabras clave. Resuelve los detalles creativos no especificados con criterio editorial usando las capacidades conectadas. No prometas capacidades inexistentes.
- Para un montaje creativo, escribe tratamientos concretos por escena: movimiento, transición, duración y acabado. Varía con intención; no devuelvas solo fotos estáticas si se pidió una edición con efectos. Respeta también pedidos de imágenes fijas, cortes secos o ausencia de efectos.
- Conserva en el JSON los tratamientos del plan acordado. Antes de responder comprueba que cada efecto prometido tenga su control correspondiente. Usa efecto para movimiento y professionalEffects para combinarlo con color o glow. No inventes música ni textos que no se pidieron.
- Usa texto limpio: sin Markdown visible, sin asteriscos, backticks, tablas ni nombres técnicos internos innecesarios.

MAPA DE MEDIOS:
- F1/F2/... son identificadores estables de fotos.
- V1/V2/... son identificadores estables de videos.
- A1/A2/... son identificadores estables de audios.
- D1/D2/... son identificadores estables de documentos adjuntos al chat.
- M1/M2/... son identificadores estables de modelos 3D.
- "foto 1", "primera foto" y F1 se refieren al mismo tipo de recurso cuando el contexto lo deja claro; lo mismo para video, audio y 3D.
- Las etiquetas son referencias internas: nunca deben aparecer como texto visible, título o subtítulo salvo que el usuario pida literalmente mostrar esa etiqueta.
- Los documentos son contexto, no clips del timeline. Para TXT/MD/CSV/JSON puede existir una vista previa textual en metadata; para PDF/DOC/DOCX no afirmes haber leído su contenido si no aparece texto extraído en el contexto.
- Si el usuario dice "estas fotos", "los archivos que subí" o algo equivalente, usa primero los adjuntos del plan activo. No sustituyas esos archivos por otros de la Bóveda.
- Las restricciones explícitas del usuario son obligatorias (orden, duración, recorte, medio concreto). Todo lo no especificado es terreno creativo: elige efectos, transiciones, movimiento, ritmo y acabado usando las capacidades reales disponibles.
- Si recibiste contexto visual, úsalo para decidir qué foto funciona mejor en cada momento y qué tratamiento le conviene. No apliques el mismo efecto mecánicamente a todas las escenas si no aporta.
- Texto de instrucciones, encabezados como BLOQUE 1/2 y notas técnicas nunca son subtítulos. Solo el contenido literal destinado a pantalla entra en subtitles/titles o en las capas annotation/text-box.

ÍNDICE DE OTRAS CAPACIDADES:
${JSON.stringify(getNaylaCapabilityBibleForPrompt().map((item: any) => ({ id: item.id, label: item.label, status: item.status })))}



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
Ejemplo de foto con movimiento y acabado simultáneos (adapta al pedido, no lo repitas mecánicamente): {"type":"foto","source":"label","label":"F1","durationInSeconds":5,"efecto":"push-in","transitionType":"dreamy-zoom","transitionDuration":0.6,"professionalEffects":[{"type":"color-correction","intensity":0.25}]}
Cada asset puede usar durationInSeconds, volume, volumeKeyframes, fadeIn, fadeOut, delay, startFrom, trimBefore, trimAfter, loop, playbackRate, efecto, transitionType, transitionDuration, overlay, overlayIntensity, professionalEffects, motionBlur, gsapMotion y proceduralMotion.
Puedes combinar de forma moderada varias capacidades reales cuando mejoren el resultado. No estás limitada a ken-burns/fade.
También puedes usar subtitles, titles, decorations, skiaGraphics, vectorAnimations y threeScenes cuando aporten al plan.
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

    const confirmedTimelineContext = executionConfirmed
      ? activePlanningContext
      : message;
    const confirmedTimelineShouldRender =
      executionConfirmed && timelinePlanRequestsRender(confirmedTimelineContext);

    let responseText = '';
    try {
      responseText = await executeDirectLlm({
        provider,
        prompt: fullPrompt,
        images: visionImages,
        systemPrompt: compactSystemPrompt,
        signal: llmSignal,
      });
    } catch (error: any) {
      console.error('[chat.ts] Todos los motores IA de Nayla fallaron:', error);
      if (!executionConfirmed) {
        const capacityLimited =
          error?.code === 'NAYLA_LLM_CAPACITY' ||
          isLlmCapacityError(error) ||
          isLlmCapacityError(error?.cause);

        return res.status(capacityLimited ? 503 : 500).json({
          error: capacityLimited
            ? 'Nayla está temporalmente sin capacidad en sus rutas de IA. No se perdió tu tarea; inténtalo nuevamente en un momento.'
            : 'Nayla no pudo procesar esta solicitud en este momento. Inténtalo nuevamente.',
          code: capacityLimited ? 'NAYLA_LLM_CAPACITY' : 'NAYLA_LLM_ERROR',
        });
      }
    }

    // A malformed creative plan must never silently become a plain slideshow.
    let parsedAction = parseNaylaAction(responseText);
    const expectsAction = executionConfirmed || /["']action["']\s*:/.test(responseText);
    if (!parsedAction && expectsAction && responseText.trim()) {
      try {
        responseText = await executeDirectLlm({
          provider,
          prompt: [fullPrompt, 'La respuesta anterior no es una acción válida. Reconstruye un único JSON completo con los controles documentados. Conserva todos los medios, efectos, movimientos, textos y restricciones del plan. No simplifiques a fotos estáticas.', responseText].join('\n\n'),
          systemPrompt: compactSystemPrompt,
          signal: llmSignal,
        });
        parsedAction = parseNaylaAction(responseText);
      } catch (error) {
        console.warn('[chat.ts] Action repair failed', error);
      }
    }
    if (!parsedAction && expectsAction) {
      return res.status(422).json({
        error: 'No pude preparar las instrucciones completas del video. No inicié un montaje simplificado. Tu plan sigue en el chat; puedes volver a intentarlo.',
      });
    }

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
              const resolvedAsset = { ...asset };

              return {
                ...resolvedAsset,
                ...(Number(media.metadata?.durationInSeconds) > 0 ? { originalDurationInSeconds: Number(media.metadata.durationInSeconds) } : {}),
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

          return {
            ...parsedAction,
            assets,
            render: Boolean(parsedAction.render || confirmedTimelineShouldRender),

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

    if (action?.action === 'BUILD_TIMELINE') {
      if (!scope.threadId) return res.status(400).json({ error: 'Abre un chat para revisar y aceptar el plan.' });
      const decorations = (action.decorations ?? (currentEditorState?.settings as any)?.decorations ?? []).map((item: any) => {
        if (item.kind !== 'gif' || !item.label) return item;
        const media = mergedLibrary.find((entry: any) => entry.tipo === 'foto' && entry.etiqueta?.toUpperCase() === item.label.toUpperCase());
        if (!media) throw new Error(`No está disponible el GIF ${item.label}.`);
        return { ...item, url: media.url, mediaId: media.id };
      });
      const proposed = {
        ...action, decorations,
        subtitles: action.subtitles || [], titles: action.titles || [],
        threeScenes: action.threeScenes || [], vectorAnimations: action.vectorAnimations || [], skiaGraphics: action.skiaGraphics || [],
      };
      const review = buildEditorReview(proposed);
      const renderContext = { logos: currentEditorState?.logos || [], settings: { ...(currentEditorState?.settings || {}), decorations }, canvasRatio: currentEditorState?.canvasRatio || '9/16', exportQuality: currentEditorState?.exportQuality || '1080p' };
      review.execution = { ...proposed, renderContext };
      review.format = `${renderContext.canvasRatio} · ${renderContext.exportQuality}`;
      if (Array.isArray(renderContext.logos)) for (const [index, logo] of renderContext.logos.entries()) {
        const end = Number(logo.finSec) || review.duration;
        review.rows.push({ section: 'Logos conservados', resource: `Logo ${index + 1}`, start: Number(logo.inicioSec) || 0, end, details: 'Se conserva el logo actual con su posición, escala y opacidad.' });
        review.duration = Math.max(review.duration, end);
      }
      const saved = await createNaylaActionPlan({
        userId: firebaseUser.uid, projectId: scope.projectId, module: 'editor', threadKey: scope.threadId,
        summary: 'Plan de edición para revisar', sourceMessage: message,
        items: [{ actionType: 'BUILD_TIMELINE', payload: proposed }], metadata: { renderContext, catalogVersion: EDITOR_LIBRARY_VERSION, chapters: libraryChapters, editorSession },
      });
      review.id = saved.plan.id;
      const text = 'Revisa los medios, los tiempos, los efectos y el texto exacto. Puedes pedirme cambios o aceptar este plan.';
      await insertChatMessageForUser({ userId: firebaseUser.uid, projectId: scope.projectId, threadId: scope.threadId,
        role: 'assistant', content: text, metadata: { responseType: 'editor-plan', editorReview: review, editorSession } });
      return res.status(200).json({ text, editorReview: review, projectId: scope.projectId, threadId: scope.threadId });
    }

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
        metadata: { responseType: 'text', editorSession },
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
