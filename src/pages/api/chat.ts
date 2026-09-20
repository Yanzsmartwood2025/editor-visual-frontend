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

    const systemPrompt = `
Eres Nayla, orquestadora de IA para un editor multimedia basado en Remotion.

REGLAS DE SEGURIDAD Y EJECUCIÓN:
- Nunca pidas, muestres, inventes ni repitas API keys, tokens, claves R2 ni secretos.
- Todo trabajo pertenece al usuario y al proyecto activo. No mezcles archivos ni contexto entre proyectos/chats.
- Los adjuntos ya fueron validados por el servidor. Usa solo sus URLs temporales exactas y nunca inventes URLs.
- Clasifica adjuntos así: foto→imagen, video→video, audio→audio/voz/transcripción, modelo3d→3D.
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
- Para una petición ejecutable responde ÚNICAMENTE JSON válido, sin markdown ni texto adicional.
- Para conversación normal responde texto normal.

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
      "transitionType": "fade",
      "transitionDuration": 0.5,
      "fadeIn": 0.4,
      "fadeOut": 0.4,
      "overlay": "vignette",
      "overlayIntensity": 0.35
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
  "render": true
}

Usa type únicamente "foto", "video" o "audio". source únicamente "url".
Copia URLs exactas del proyecto. Para una orden sencilla decide tú los parámetros sin pedir nombres técnicos.
Catálogo Remotion CPU:
${JSON.stringify(REMOTION_CPU_PUBLIC_CATALOG)}

CATÁLOGO DE CAPACIDADES:
${JSON.stringify(capabilitySummary)}

SISTEMA NAYLA DISPONIBLE:
${JSON.stringify(systemCatalog)}

MODO_MOTOR=${engineMode}

Si una petición combina pasos, elige la PRIMERA acción necesaria. El resultado volverá al chat y el siguiente turno puede continuar el flujo.
`;

    const mergedLibrary = [
      ...(mediaLibrary || []),
      ...attachments.filter((attachment) =>
        !mediaLibrary?.some((item) => item.id && item.id === attachment.id)
      ),
    ];

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
    ].join('\n\n');

    const effectiveHistory = scope.threadId ? persistedHistory : (history || []);
    const historyText = effectiveHistory.length
      ? effectiveHistory.map((msg) => `${msg.role}: ${msg.content}`).join('\n')
      : '';

    const fullPrompt = [
      executionContext,
      historyText ? `Historial:\n${historyText}` : '',
      `Usuario: ${message}`,
    ].filter(Boolean).join('\n\n');

    const attachedImageUrls = attachments
      .filter((item) => item.tipo === 'foto')
      .map((item) => item.url);
    const visionImages = [...(images || []), ...attachedImageUrls].slice(0, 4);

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
        error: error.message || 'Error al generar la respuesta. Los motores IA están temporalmente al límite.',
      });
    }

    const action = parseNaylaAction(responseText);
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

    const publicResponseText = sanitizeNaylaPublicText(responseText);

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
