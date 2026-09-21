import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { GroqProvider, MistralProvider } from '../../utils/llmProvider';
import { requireFirebaseUser } from '../../lib/firebaseAdmin';
import { MEDIA_CAPABILITY_CATALOG } from '../../lib/mediaProviders/capabilities';
import {
  getNaylaPublicSystemCatalog,
  sanitizeNaylaPublicText,
} from '../../lib/naylaSystemCatalog';
import { REMOTION_CPU_PUBLIC_CATALOG } from '../../lib/remotionEffects';
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
import {
  getOwnedMediaForUser,
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
      return /\b(plan|te recomiendo|propongo|podemos usar|podemos combinar|mi recomendacion|si te parece|cuando me confirmes|si quieres lo preparo|quedaria asi)\b/.test(text);
    });

const hasExplicitPlanConfirmation = (
  message: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>
) => {
  if (!hasPriorNaylaPlan(history)) return false;

  const text = normalizePlanningText(message);
  if (!text) return false;

  return (
    /^(si|ok|okay|dale|adelante|listo|perfecto|correcto)(\b|$)/.test(text) ||
    /\b(hazlo|hazlo asi|procede|continua con el plan|sigue con el plan|aplica el plan|ejecuta el plan|confirmo|acepto|renderiza ahora|envialo|manda adelante|adelante con el plan)\b/.test(text)
  );
};

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
  const editingIntent =
    /\b(crea|crear|haz|hacer|arma|armar|monta|montar|edita|editar|compone|componer|renderiza|renderizar|genera|generar)\b/.test(normalized) &&
    /\b(video|timeline|edici[oó]n|montaje|render)\b/.test(normalized);

  if (!editingIntent) return null;

  const labels = getOrderedMediaLabels(message).filter((label) => !label.startsWith('M'));
  if (!labels.length) return null;

  const byLabel = new Map(
    mediaLibrary
      .filter((item) => item.etiqueta && item.tipo !== 'modelo3d')
      .map((item) => [item.etiqueta!.trim().toUpperCase(), item])
  );

  const resolved = labels.map((label) => byLabel.get(label));
  if (resolved.some((item) => !item)) return null;

  const durationMatch = message.match(/\b(?:aproximadamente\s+|aprox\.?\s+|unos?\s+|de\s+)?(\d+(?:[.,]\d+)?)\s*(?:segundos?|s)\b/i);
  const totalSeconds = durationMatch ? Number(durationMatch[1].replace(',', '.')) : null;
  const visualCount = resolved.filter((item) => item?.tipo === 'foto' || item?.tipo === 'video').length;
  const perVisualDuration =
    totalSeconds && Number.isFinite(totalSeconds) && totalSeconds > 0 && visualCount > 0
      ? totalSeconds / visualCount
      : undefined;

  const wantsSoftMotion = /\b(ken[ -]?burns|movimiento\s+suave|zoom\s+suave|acercamiento\s+suave)\b/i.test(message);
  const wantsCinematic = /\b(cinematogr[aá]fic[oa]s?|pel[ií]cula)\b/i.test(message);
  const wantsFade = /\b(fade|fundido|transici[oó]n(?:es)?\s+suaves?|cinematogr[aá]fic[oa]s?)\b/i.test(message);

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
    }
    return asset;
  });

  const parsed = {
    action: 'BUILD_TIMELINE' as const,
    assets,
    render: /\b(renderiza|renderizar|video\s+final|gu[aá]rd(?:a|alo).*b[oó]veda|crea\s+un\s+video|haz\s+un\s+video|monta\s+un\s+video)\b/i.test(message),
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

    const systemCatalog = getNaylaPublicSystemCatalog();
    const capabilitySummary = MEDIA_CAPABILITY_CATALOG.map((item) => ({
      id: item.id,
      label: item.label,
      group: item.group,
      requiresConsent: Boolean(item.requiresConsent),
    }));
    const capabilityBible = getNaylaCapabilityBibleForPrompt();
    const intentMatches = findNaylaCapabilityMatches(message);
    const effectiveHistory = scope.threadId ? persistedHistory : (history || []);
    const executionConfirmed = hasExplicitPlanConfirmation(message, effectiveHistory);

    const systemPrompt = `
Eres Nayla, orquestadora de IA para un editor multimedia basado en Remotion.

REGLAS DE SEGURIDAD Y EJECUCIÓN:
- Nunca pidas, muestres, inventes ni repitas API keys, tokens, claves R2 ni secretos.
- Todo trabajo pertenece al usuario y al proyecto activo. No mezcles archivos ni contexto entre proyectos/chats.
- Los adjuntos ya fueron validados por el servidor. Usa solo sus URLs temporales exactas y nunca inventes URLs.
- Clasifica adjuntos así: foto→imagen, video→video, audio→audio/voz/transcripción, modelo3d→3D.
- La mera presencia o subida de fotos NO autoriza análisis visual. Subir F1/F2/F3... sirve para referenciarlas, ordenarlas, editarlas y renderizarlas sin enviar sus píxeles al LLM.
- Activa visión únicamente cuando el usuario pida de forma explícita mirar, analizar, revisar, describir, inspeccionar o comparar el contenido visual de una foto concreta.
- Para montar videos con muchas fotos (por ejemplo F1–F30), trabaja con etiquetas, URLs y parámetros del timeline; no necesitas ver las imágenes.
- Videos, audios y modelos 3D se manejan por referencia y metadatos; no se envían como entrada visual al LLM.
- Si el usuario pide analizar o transformar un adjunto, usa primero la acción correspondiente a su tipo.
- Solo puedes usar capacidades que aparecen en el catálogo seguro de este prompt.
- Nunca menciones marcas, empresas, proveedores externos, nombres internos de recetas ni infraestructura de terceros al usuario. Habla únicamente de Nayla Cloud, Nayla Compute y Nayla Energy.
- Nunca reveles precios internos, saldo de infraestructura, márgenes ni costos de origen. Solo usa precios Nayla devueltos por el servidor.
- La edición y composición con medios existentes se hace por defecto con BUILD_TIMELINE y Nayla Render CPU (Remotion + Vercel Sandbox). No alquiles GPU para una edición normal.
- Si el usuario pide crear/editar/montar/renderizar un video con fotos, videos o audios que ya están en el proyecto, usa BUILD_TIMELINE. Si pide el archivo final, usa "render": true.
- El usuario no necesita conocer nombres técnicos de efectos. Traduce expresiones como "cinematográfico", "movimiento 3D", "suave", "dinámico", "acercamiento" o "película" a controles permitidos del catálogo Remotion CPU.
- Si MODO_MOTOR=cloud, usa GENERATE_IMAGE / GENERATE_VIDEO / GENERATE_AUDIO / GENERATE_3D solo cuando haga falta CREAR contenido nuevo; la edición de contenido existente sigue siendo BUILD_TIMELINE.
- Si MODO_MOTOR=compute, usa RUN_GPU_JOB para generación pesada, con workload acorde a image/video/audio/3d. BUILD_TIMELINE sigue siendo CPU salvo que el usuario pida explícitamente una edición GPU en una fase compatible.
- Si MODO_MOTOR=auto, usa BUILD_TIMELINE para edición normal, Nayla Cloud para generar contenido nuevo y Nayla Compute solo cuando el usuario pida GPU/Compute/proceso local pesado o una capacidad requiera worker propio.
- Los trabajos de Nayla Compute tienen presupuesto, lease y cierre automático. No inventes precios ni afirmes que se reservó una GPU si el servidor no lo confirmó.
- Ninguna generación externa pagada se considera ejecutada solo porque exista un proveedor: primero se registra el trabajo y el servidor controla su adaptador.
- Clonación/cambio de voz requiere una muestra autorizada y consentimiento del titular.
- Para BUILD_TIMELINE copia solo URLs presentes en adjuntos, mediaLibrary o currentTimeline.
- Las etiquetas del proyecto son referencias estables y prioritarias: F1/F2... son fotos, V1/V2... son videos, A1/A2... son audios y M1/M2... son modelos 3D.
- Interpreta "foto 1", "imagen 1" y "F1" como la etiqueta F1; "video 1" y "V1" como V1; "audio 1", "música 1" y "A1" como A1; "3D 1", "modelo 1" y "M1" como M1.
- Nunca sustituyas una etiqueta por otro archivo parecido. Si la etiqueta pedida no existe en el proyecto, indícalo en texto normal y no inventes una URL.
- Para cortes sobre un video existente puedes repetir la misma URL de video en varios assets usando trimBefore/trimAfter y colocar fotos o clips entre esos segmentos. Ejemplo conceptual: V1 tramo inicial → F1 → V1 tramo siguiente → F2 → V1 tramo final.
MODO CONSULTIVO Y PLANIFICACIÓN:
- EJECUCION_CONFIRMADA=${executionConfirmed ? 'SI' : 'NO'}.
- Por defecto conversa primero. Interpreta lo que el usuario quiere aunque use palabras vagas como "algo 3D", "que se cruce", "más profesional", "que tenga fuerza" o "que se mueva bonito".
- Consulta la BIBLIA DE CAPACIDADES y recomienda en lenguaje cotidiano entre 1 y 4 recursos que encajen con la intención. Explica brevemente qué aportaría cada uno.
- No obligues al usuario a conocer nombres técnicos. Si puedes inferir una buena solución, propónla.
- Si hay varias opciones razonables, ofrece una combinación concreta como recomendación y pregunta por una preferencia solo cuando realmente cambie el resultado.
- Las capacidades con status="ready" están conectadas y se pueden ejecutar hoy.
- Las capacidades con status="installed" están físicamente instaladas pero todavía necesitan su adaptador dentro del plan de edición. No las prometas como ejecutables. Si el usuario las pide explícitamente, explica de forma natural que están preparadas en Nayla pero aún no están activadas en ese flujo, y ofrece la alternativa ready más cercana.
- Si EJECUCION_CONFIRMADA=NO, NO emitas JSON ejecutable aunque la petición parezca una orden. Primero arma o refina el plan con el usuario.
- Si EJECUCION_CONFIRMADA=SI y el usuario está confirmando un plan ya conversado, responde ÚNICAMENTE con el JSON válido de la acción necesaria, sin texto adicional.
- Buscar recursos de stock puede ejecutarse directamente cuando el usuario lo pide; no necesita una fase de confirmación.
- Nunca afirmes que un render, generación o trabajo está "en marcha", "procesando", "guardándose" o "listo" dentro de una respuesta de texto normal. Esos estados solo los confirma el servidor después de crear un trabajo real.

ESTILO DE CONVERSACIÓN:
- Para conversación normal usa texto limpio y natural.
- No uses Markdown visible: no asteriscos, no dobles asteriscos, no backticks, no almohadillas de títulos, no tablas y no bloques de código.
- No escribas nombres internos de acciones, recetas, librerías, proveedores ni infraestructura.
- Usa párrafos cortos. Puedes enumerar con "1.", "2.", "3." solo si realmente ayuda.
- Habla como una editora experta que guía a una persona que puede saber mucho, poco o nada de edición.

ACCIONES EJECUTABLES:

1) Buscar stock:
{
  "action": "SEARCH_MEDIA",
  "query": "ciudad de noche",
  "kind": "image",
  "limit": 6
}
kind: "image" | "video" | "audio".
providers opcional: ["pexels","pixabay","openverse"].

2) Generar/editar imagen:
{
  "action": "GENERATE_IMAGE",
  "prompt": "descripción",
  "sourceImageUrl": "https://..."
}

3) Generar video:
{
  "action": "GENERATE_VIDEO",
  "prompt": "descripción",
  "sourceImageUrl": "https://..."
}

4) Audio/voz:
{
  "action": "GENERATE_AUDIO",
  "mode": "tts",
  "text": "texto",
  "prompt": "descripción opcional",
  "inputUrl": "https://...",
  "voiceId": "opcional",
  "targetLanguage": "opcional"
}
mode: tts, music, sound_effects, speech_to_text, voice_clone, voice_design,
voice_change, voice_isolation, dubbing, text_to_dialogue, forced_alignment.

5) 3D:
{
  "action": "GENERATE_3D",
  "mode": "image_to_3d",
  "prompt": "opcional",
  "inputUrl": "https://...",
  "inputUrls": ["https://..."]
}
mode: text_to_3d, image_to_3d, multiview_to_3d, texture, optimize, rig, animate, retarget.

6) Nayla Compute:
{
  "action": "RUN_GPU_JOB",
  "workload": "video",
  "jobType": "nombre-corto-del-proceso",
  "prompt": "opcional",
  "inputUrls": ["https://..."]
}
workload: "probe" | "image" | "video" | "audio" | "3d".

RECETAS INTERNAS DE NAYLA COMPUTE:
- Música:
{
  "action": "RUN_GPU_JOB",
  "workload": "audio",
  "jobType": "ace-step-music",
  "prompt": "descripción musical",
  "options": {
    "duration": 30,
    "instrumental": true
  }
}
Duración: 10–90 segundos. Con letra autorizada se puede usar "lyrics" e "instrumental": false.
Siempre cotiza primero y requiere confirmación humana.

- Una imagen existente a GLB:
{
  "action": "RUN_GPU_JOB",
  "workload": "3d",
  "jobType": "triposr-image-to-3d",
  "inputUrls": ["URL HTTPS exacta de la imagen existente"]
}
Solo una imagen. No usar para texto→3D ni multivista.

7) Editar/componer con Remotion CPU:
{
  "action": "BUILD_TIMELINE",
  "assets": [
    {
      "type": "foto",
      "source": "url",
      "url": "https://...",
      "durationInSeconds": 4,
      "efecto": "parallax-3d",
      "transitionType": "film-burn",
      "transitionDuration": 0.5,
      "fadeIn": 0.4,
      "fadeOut": 0.4,
      "overlay": "vignette",
      "overlayIntensity": 0.35,
      "professionalEffects": [
        {"type":"color-correction","intensity":0.55},
        {"type":"glow","intensity":0.25}
      ],
      "motionBlur": {"shutterAngle":180,"samples":5},
      "proceduralMotion": {
        "preset": "starfield",
        "intensity": 0.45,
        "speed": 0.8,
        "seed": 17,
        "color": "#ffffff",
        "accentColor": "#b8d8ff"
      },
      "gsapMotion": {
        "enter": "elastic",
        "exit": "fade",
        "enterDuration": 0.8,
        "exitDuration": 0.5,
        "intensity": 1
      }
    },
    {
      "type": "audio",
      "source": "url",
      "url": "https://...",
      "volume": 0.75,
      "fadeIn": 0.8,
      "fadeOut": 1.2
    }
  ],
  "subtitles": [
    {
      "text": "Texto del subtítulo",
      "start": 0,
      "end": 3.5,
      "style": "cinematic",
      "position": "bottom",
      "fontSize": 46
    }
  ],
  "titles": [
    {
      "text": "ST★RLIGHT LOG",
      "start": 0.4,
      "end": 3.2,
      "style": "cinematic",
      "animation": "word-rise",
      "position": "center",
      "fontSize": 76,
      "color": "#ffffff",
      "accentColor": "#ffffff"
    }
  ],
  "skiaGraphics": [
    {
      "preset": "energy-pulse",
      "start": 0,
      "end": 6,
      "x": 0,
      "y": 0,
      "scale": 1,
      "opacity": 0.9,
      "color": "#ffffff",
      "accentColor": "#7dd3fc",
      "intensity": 0.7,
      "speed": 1
    }
  ],
  "vectorAnimations": [
    {
      "kind": "lottie",
      "url": "https://.../animation.json",
      "start": 0.5,
      "end": 4.5,
      "x": 0,
      "y": 0,
      "scale": 0.8,
      "opacity": 1,
      "fit": "contain",
      "alignment": "center",
      "loop": true,
      "playbackRate": 1,
      "direction": "forward"
    },
    {
      "kind": "rive",
      "url": "https://.../animation.riv",
      "start": 4.5,
      "end": 8,
      "x": 0,
      "y": 0,
      "scale": 1,
      "opacity": 1,
      "fit": "contain",
      "alignment": "center",
      "artboard": "Main",
      "animation": "Idle"
    }
  ],
  "threeScenes": [
    {
      "label": "M1",
      "start": 0,
      "end": 6,
      "modelScale": 1,
      "position": {"x":0,"y":0,"z":0},
      "rotation": {"x":0,"y":0,"z":0},
      "autoRotate": true,
      "rotationSpeed": 24,
      "cameraDistance": 5,
      "cameraFov": 42,
      "lighting": "studio",
      "backgroundColor": "transparent"
    }
  ],
  "render": true
}

Dentro de assets usa type únicamente "foto", "video" o "audio". source únicamente "url". Los modelos 3D no van en assets: van en threeScenes mediante su etiqueta M1/M2.
Copia URLs exactas del proyecto. Para una orden sencilla decide tú los parámetros sin pedir nombres técnicos.
Puedes encadenar hasta 6 professionalEffects por clip. Usa solo los nombres publicados en el catálogo Remotion CPU.
motionBlur es opcional y debe reservarse para movimientos donde aporte valor; 5 muestras y 180 grados es un punto de partida equilibrado.
gsapMotion es opcional en fotos y videos completos. Presets: fade, slide-left, slide-right, slide-up, slide-down, zoom-in, zoom-out, bounce, elastic, spin y swing.
Usa enter y/o exit, con enterDuration/exitDuration e intensity de 0.25 a 2. Traduce lenguaje cotidiano: rebota→bounce, elástico→elastic, gira→spin, balanceo→swing, entra desde un lado→slide-*.
proceduralMotion es opcional para añadir motion graphics generativos sobre una foto o video sin buscar assets externos.
Presets: particles para partículas orgánicas, orbit para elementos girando alrededor del centro, pulse-grid para una rejilla rítmica y starfield para estrellas/puntos luminosos.
Controla intensity de 0 a 1, speed de 0.1 a 4, seed para repetibilidad y color/accentColor. Todo debe permanecer determinista por frame.
Las transiciones avanzadas disponibles incluyen film-burn, blur-slide, cross-zoom, dreamy-zoom, linear-blur y push-cut.
subtitles es opcional. Cada subtítulo usa text, start, end, style, position y fontSize.
style puede ser clean, cinematic, tiktok o karaoke. position puede ser top, center o bottom.
Si el usuario pide subtítulos normales y no especifica estilo, elige clean o cinematic según el tono del plan.
Para contenido social con palabra destacada usa tiktok. Para letra o lectura palabra a palabra usa karaoke.
Si el usuario pide quitar todos los subtítulos de un plan, usa "subtitles": [].
titles es opcional y sirve para títulos, rótulos y lower thirds animados con el motor de animación por frame.
Cada título usa text, start, end, style, animation, position, fontSize, color y accentColor.
style puede ser clean, cinematic, neon o minimal.
animation puede ser fade-up, slide-left, slide-right, pop, zoom-in, word-rise o lower-third.
Usa pop cuando el usuario pida rebote o entrada con fuerza; word-rise para palabras que aparecen/suben; lower-third para rótulos informativos; slide-left/right para entradas laterales.
Si el usuario pide quitar los títulos animados, usa "titles": [].
threeScenes es opcional y sirve para render 3D REAL de modelos GLB ya existentes en el proyecto.
Usa siempre la etiqueta exacta M1, M2, etc. No inventes modelos y no copies una URL privada manualmente.
Cada escena 3D usa label, start, end, modelScale, position, rotation, autoRotate, rotationSpeed, cameraDistance, cameraFov, lighting, backgroundColor y opcionalmente animationName.
lighting puede ser studio, soft o dramatic.
Si el usuario dice "que parezca 3D" sobre una foto, usa motion-depth/parallax. Si habla de M1/M2, GLB, modelo 3D real, luces o cámara 3D, usa threeScenes.
assets puede ser [] cuando threeScenes o vectorAnimations contengan al menos un elemento válido. Esto permite renders sin fotos ni videos base.
Si el usuario menciona una animación interna por nombre, usa animationName. Si no especifica una y el GLB contiene animaciones, el renderer puede usar la primera.
Si el usuario pide quitar las escenas 3D del plan, usa "threeScenes": [] siempre acompañado por al menos un asset normal o una animación vectorial.
vectorAnimations es opcional para Lottie JSON y Rive .riv remotos.
Cada animación usa kind, url, start, end, x, y, scale, opacity, fit y alignment.
Para Lottie también puedes usar loop, playbackRate y direction forward/backward. La URL debe apuntar al JSON y permitir CORS.
Para Rive puedes usar artboard y animation cuando el usuario conozca esos nombres. La URL debe apuntar al archivo .riv.
Usa Lottie/Rive para logos animados, iconos, UI, stickers y overlays vectoriales. No los confundas con una foto ni con un modelo GLB 3D.
assets puede ser [] si threeScenes o vectorAnimations contiene al menos un elemento válido.
Si el usuario pide quitar todas las animaciones vectoriales, usa "vectorAnimations": [] acompañado por un asset normal, una escena 3D o un gráfico Skia.
skiaGraphics es opcional para gráficos avanzados generados directamente por el motor Skia, sin archivo externo.
Presets: glow-orb para un orbe luminoso, rings para anillos, energy-pulse para pulsos de energía y spotlights para focos luminosos en movimiento.
Cada gráfico usa preset, start, end, x, y, scale, opacity, color, accentColor, intensity y speed.
Usa Skia cuando el usuario pida brillo gráfico, orbes, anillos, pulsos, luces abstractas, máscaras o composición gráfica avanzada; no lo confundas con partículas procedurales simples.
assets puede ser [] si threeScenes, vectorAnimations o skiaGraphics contienen al menos un elemento válido.
Si el usuario pide quitar los gráficos Skia, usa "skiaGraphics": [] acompañado por otro contenido válido.
Catálogo Remotion CPU:
${JSON.stringify(REMOTION_CPU_PUBLIC_CATALOG)}

BIBLIA DE CAPACIDADES NAYLA v${NAYLA_CAPABILITY_BIBLE_VERSION}:
${JSON.stringify(capabilityBible)}

CAPACIDADES QUE MÁS COINCIDEN CON ESTE MENSAJE:
${JSON.stringify(intentMatches.map((item) => ({
  id: item.id,
  label: item.label,
  description: item.description,
  status: item.status,
  engine: item.engine,
  usefulFor: item.usefulFor,
})))}

CATÁLOGO DE CAPACIDADES:
${JSON.stringify(capabilitySummary)}

SISTEMA NAYLA DISPONIBLE:
${JSON.stringify(systemCatalog)}

MODO_MOTOR=${engineMode}

Si una petición combina pasos, elige la PRIMERA acción necesaria. El resultado volverá al chat y el siguiente turno puede continuar el flujo.
`;

    const mergedLibraryMap = new Map<string, any>();
    (secureMediaLibrary || []).forEach((item: any, index: number) => {
      mergedLibraryMap.set(item.id ? `id:${item.id}` : `url:${item.url}:${index}`, item);
    });
    attachments.forEach((item) => {
      mergedLibraryMap.set(item.id ? `id:${item.id}` : `url:${item.url}`, item);
    });
    const mergedLibrary = Array.from(mergedLibraryMap.values());

    const visualIntent = hasExplicitVisionIntent(message);
    const requestedPhotoLabels = getRequestedPhotoLabels(message);
    const referencedVisionCandidates = requestedPhotoLabels.size
      ? mergedLibrary.filter((item) =>
          item.tipo === 'foto' &&
          typeof item.etiqueta === 'string' &&
          requestedPhotoLabels.has(item.etiqueta.trim().toUpperCase())
        )
      : attachments.filter((item) => item.tipo === 'foto');

    const visionCandidateUrls = visualIntent
      ? Array.from(new Set([
          ...referencedVisionCandidates.map((item) => item.url),
          ...(images || []),
        ]))
      : [];
    const visionImages = visionCandidateUrls.slice(0, 3);
    const visionWasTruncated = visionCandidateUrls.length > visionImages.length;

    const executionContext = [
      `Proyecto activo: ${scope.projectId}.`,
      scope.threadId ? `Chat activo: ${scope.threadId}.` : 'Chat persistente: todavía no seleccionado.',
      attachments.length
        ? `Adjuntos privados del mensaje:\n${attachments.map((item, index) =>
            `${index + 1}. id=${item.id}; tipo=${item.tipo}; url=${item.url}; nombre=${item.nombre || ''}; etiqueta=${item.etiqueta || ''}`
          ).join('\n')}`
        : 'Adjuntos privados del mensaje: ninguno.',
      mergedLibrary.length
        ? `Medios disponibles en el proyecto:\n${mergedLibrary.map((item, index) =>
            `${index + 1}. tipo=${item.tipo}; url=${item.url}; nombre=${item.nombre || ''}; etiqueta=${item.etiqueta || ''}; fuente=${item.fuente || ''}`
          ).join('\n')}`
        : 'Medios disponibles: ninguno.',
      currentTimeline?.length
        ? `Timeline actual:\n${currentTimeline.map((item, index) =>
            `${index + 1}. tipo=${item.tipo}; url=${item.url}; nombre=${item.nombre || ''}; etiqueta=${item.etiqueta || ''}`
          ).join('\n')}`
        : 'Timeline actual: vacío.',
      visualIntent
        ? (
            visionImages.length
              ? `Visión solicitada explícitamente: se cargaron ${visionImages.length} foto(s) para análisis visual.${visionWasTruncated ? ' Hay más fotos referenciadas que el límite visual actual; no afirmes haber inspeccionado las que no fueron cargadas.' : ''}`
              : 'Visión solicitada explícitamente, pero no se encontró una foto válida con esa referencia. No inventes contenido visual.'
          )
        : 'Visión NO solicitada. No inspecciones píxeles ni describas el contenido de fotos. Para editar, ordenar, cortar o renderizar usa únicamente etiquetas, URLs, tipos y las instrucciones del usuario.',
    ].join('\n\n');

    const historyText = effectiveHistory.length
      ? effectiveHistory.map((msg) => `${msg.role}: ${msg.content}`).join('\n')
      : '';

    const fullPrompt = [
      executionContext,
      historyText ? `Historial:\n${historyText}` : '',
      `Usuario: ${message}`,
    ].filter(Boolean).join('\n\n');

    let responseText = '';
    try {
      responseText = await executeDirectLlm({
        provider,
        prompt: fullPrompt,
        images: visionImages,
        systemPrompt,
      });
    } catch (error: any) {
      console.error('[chat.ts] Todos los motores IA de Nayla fallaron:', error);
      return res.status(500).json({
        error: 'Nayla no pudo procesar esta solicitud en este momento. Inténtalo nuevamente.',
      });
    }

    const parsedAction =
      parseNaylaAction(responseText) ||
      (executionConfirmed ? buildLabelTimelineFallback(message, mergedLibrary) : null);

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
      ? {
          ...parsedAction,
          assets: parsedAction.assets.map((asset: any) => ({
            ...asset,
            url: asset?.source === 'url' && typeof asset?.url === 'string'
              ? canonicalizeUrl(asset.url)
              : asset?.url,
          })),
        } as NaylaAction
      : parsedAction;

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
          await insertChatMessageForUser({
            userId: firebaseUser.uid,
            projectId: scope.projectId,
            threadId: scope.threadId,
            role: 'assistant',
            content: typeof executed.text === 'string' ? executed.text : 'Acción preparada.',
            action: executed as Record<string, unknown>,
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
    if (
      /\b(en\s+marcha|renderiz(?:ando|aci[oó]n)|procesando|guard(?:ando|ar[aá]).*b[oó]veda|cuando\s+termine)\b/i.test(publicResponseText) &&
      /\b(video|render|timeline|edici[oó]n)\b/i.test(message)
    ) {
      publicResponseText = 'No se inició ningún procesamiento todavía. Reformula la orden con las etiquetas F/V/A que quieres usar para que Nayla pueda crear el trabajo real.';
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
