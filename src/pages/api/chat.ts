import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { executeWithApiKey } from '../../utils/apiKeyManager';
import { GroqProvider, MistralProvider } from '../../utils/llmProvider';
import { requireFirebaseUser } from '../../lib/firebaseAdmin';
import { MEDIA_CAPABILITY_CATALOG } from '../../lib/mediaProviders/capabilities';
import { getConfiguredProviderSummary } from '../../lib/mediaProviders/registry';
import { searchStockMedia } from '../../lib/mediaProviders/stock';
import {
  getAvailableProvidersForAction,
  parseNaylaAction,
  type NaylaAction,
} from '../../lib/naylaActions';
import { startVastGpuJob } from '../../lib/gpu/orchestrator';
import { quoteVastGpuJob } from '../../lib/gpu/quote';
import { resolveRequestPublicBaseUrl } from '../../lib/gpu/requestUrl';
import type { GpuWorkload } from '../../lib/gpu/profiles';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey;

const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

const availableEffectsCatalog = {
  transiciones: {
    campo: 'transitionType',
    valores: ['fade', 'wipe', 'slide', 'zoom'],
  },
  filtros: {
    campo: 'efecto',
    valores: ['grayscale', 'sepia', 'vintage', 'blur', 'ken-burns', 'pan', 'rotate'],
  },
  overlays: {
    campo: 'overlay',
    valores: ['vignette', 'film-grain', 'light-leak'],
  },
};

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

const requestSchema = z.object({
  message: z.string().trim().min(1, 'Falta el parámetro requerido o está vacío: message').max(12000),
  images: z.array(z.string().max(4_000_000)).max(4).optional(),
  history: z.array(historyItemSchema).max(30).optional(),
  provider: z.enum(['groq', 'mistral']).optional().default('groq'),
  mediaLibrary: z.array(z.object({
    id: z.string().optional(),
    tipo: z.enum(['foto', 'video', 'audio']),
    url: z.string().url(),
    nombre: z.string().max(500).optional(),
    etiqueta: z.string().max(100).optional(),
    fuente: z.string().max(100).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })).max(500).optional(),
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
  const providers = getAvailableProvidersForAction(action).map((provider) => ({
    id: provider.id,
    label: provider.label,
  }));

  return {
    ...action,
    status: 'planned' as const,
    executionReady: false,
    requiresConfirmation: generationActionNames.has(action.action),
    availableProviders: providers,
    text: providers.length
      ? `Preparé la tarea. Puedo enrutarla por: ${providers.map((item) => item.label).join(', ')}. La ejecución de esta capacidad se habilitará en el adaptador correspondiente sin exponer la API key.`
      : 'Preparé la tarea, pero no hay un proveedor configurado para esa capacidad todavía.',
  };
};

const inferGpuWorkload = (action: Extract<NaylaAction, { action: 'RUN_GPU_JOB' }>): GpuWorkload | null => {
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
  context: { userId: string; appBaseUrl: string }
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
    return action;
  }

  if (action.action === 'RUN_GPU_JOB') {
    if (action.provider === 'runpod') {
      return describeActionPlan(action);
    }

    const workload = inferGpuWorkload(action);
    if (!workload) {
      return {
        ...describeActionPlan(action),
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
      const quote = await quoteVastGpuJob(gpuInput);
      return {
        ...action,
        workload,
        provider: 'vast' as const,
        status: 'awaiting_confirmation' as const,
        executionReady: quote.available,
        requiresConfirmation: true,
        quote,
        pendingGpuRequest: gpuInput,
        text: quote.available
          ? 'Encontré una GPU Vast.ai dentro del presupuesto. Revisa el costo y confirma antes de alquilarla.'
          : (quote.reason || 'No hay una GPU disponible dentro de los límites de seguridad.'),
      };
    }

    const job = await startVastGpuJob({
      userId: context.userId,
      input: gpuInput,
      appBaseUrl: context.appBaseUrl,
    });

    return {
      ...action,
      workload,
      provider: 'vast' as const,
      gpuJobId: job.id,
      status: job.status,
      executionReady: true,
      requiresConfirmation: false,
      job,
      text:
        'GPU Vast.ai iniciada con límite de gasto y vencimiento automático. Nayla guardará el resultado en R2/Bóveda y destruirá la instancia al terminar.',
    };
  }

  return describeActionPlan(action);
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

    const { message, images, history, provider, mediaLibrary, currentTimeline } = parsedBody.data;

    const providerSummary = getConfiguredProviderSummary();
    const capabilitySummary = MEDIA_CAPABILITY_CATALOG.map((item) => ({
      id: item.id,
      label: item.label,
      group: item.group,
      requiresConsent: Boolean(item.requiresConsent),
    }));

    const systemPrompt = `
Eres Nayla, orquestadora de IA para un editor multimedia basado en Remotion.

REGLAS DE SEGURIDAD Y EJECUCIÓN:
- Nunca pidas, muestres, inventes ni repitas API keys, tokens o secretos.
- Solo puedes usar proveedores y capacidades que aparecen en el catálogo seguro de este prompt.
- Si el usuario no elige proveedor, omite "provider": el servidor elegirá uno configurado.
- Usa RUN_GPU_JOB solo cuando el usuario pida explícitamente Vast/GPU/modelo propio/proceso local pesado, o cuando la tarea requiera un worker GPU propio. Para generación normal usa GENERATE_IMAGE / GENERATE_VIDEO / GENERATE_AUDIO / GENERATE_3D.
- Los trabajos Vast tienen presupuesto, lease y destrucción automática. No inventes precios ni prometas que una GPU fue alquilada: el servidor lo decide.
- No afirmes que una generación pagada terminó. Tu trabajo es devolver una acción validada; el servidor decide si la ejecuta.
- Clonación/cambio de voz debe tratarse como una función que requiere una muestra autorizada y consentimiento del titular.
- No inventes URLs. Para BUILD_TIMELINE copia solo URLs presentes en mediaLibrary/currentTimeline.
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
sourceImageUrl es opcional.

3) Generar video:
{
  "action": "GENERATE_VIDEO",
  "prompt": "descripción",
  "sourceImageUrl": "https://..."
}
sourceImageUrl es opcional.

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
mode puede ser: tts, music, sound_effects, speech_to_text, voice_clone, voice_design,
voice_change, voice_isolation, dubbing, text_to_dialogue, forced_alignment.
Incluye solo los campos necesarios.

5) 3D:
{
  "action": "GENERATE_3D",
  "mode": "image_to_3d",
  "prompt": "opcional",
  "inputUrl": "https://...",
  "inputUrls": ["https://..."]
}
mode: text_to_3d, image_to_3d, multiview_to_3d, texture, optimize, rig, animate, retarget.

6) GPU propia / Vast:
{
  "action": "RUN_GPU_JOB",
  "provider": "vast",
  "workload": "video",
  "jobType": "nombre-corto-del-proceso",
  "prompt": "opcional",
  "inputUrls": ["https://..."]
}
workload debe ser: "probe" | "image" | "video" | "audio" | "3d".
"probe" sirve únicamente para probar que la máquina GPU puede arrancar y apagarse correctamente.

RECETAS GPU PROPIAS HABILITADAS:
- Para generar música con nuestra GPU Vast usa exactamente:
{
  "action": "RUN_GPU_JOB",
  "provider": "vast",
  "workload": "audio",
  "jobType": "ace-step-music",
  "prompt": "descripción musical",
  "options": {
    "duration": 30,
    "instrumental": true
  }
}
La duración permitida en Nayla es de 10 a 90 segundos. Si el usuario entrega letra autorizada, puedes usar "lyrics" y poner "instrumental": false.
Esta acción SIEMPRE se cotiza primero y requiere confirmación humana antes de alquilar GPU.

- Para convertir UNA imagen existente en un GLB con nuestra GPU usa exactamente:
{
  "action": "RUN_GPU_JOB",
  "provider": "vast",
  "workload": "3d",
  "jobType": "triposr-image-to-3d",
  "inputUrls": ["URL HTTPS exacta de la imagen existente"]
}
No uses esta receta para texto→3D ni multivista. No inventes la URL.

7) Construir timeline con medios existentes:
{
  "action": "BUILD_TIMELINE",
  "assets": [
    {
      "type": "foto",
      "source": "url",
      "url": "https://...",
      "efecto": "vintage",
      "transitionType": "fade",
      "transitionDuration": 0.5,
      "fadeIn": 0.5,
      "fadeOut": 0.5
    }
  ],
  "render": true
}

Usa type únicamente "foto", "video" o "audio". source únicamente "url".
Efectos disponibles:
${JSON.stringify(availableEffectsCatalog)}

CATÁLOGO DE CAPACIDADES:
${JSON.stringify(capabilitySummary)}

PROVEEDORES DISPONIBLES (sin secretos):
${JSON.stringify(providerSummary)}

Si una petición combina pasos, elige la PRIMERA acción necesaria. El resultado volverá al chat y el siguiente turno puede continuar el flujo.
`;

    const executionContext = [
      mediaLibrary?.length
        ? `Medios disponibles en orden:\n${mediaLibrary.map((item, index) =>
            `${index + 1}. tipo=${item.tipo}; url=${item.url}; nombre=${item.nombre || ''}; etiqueta=${item.etiqueta || ''}; fuente=${item.fuente || ''}`
          ).join('\n')}`
        : 'Medios disponibles: ninguno.',
      currentTimeline?.length
        ? `Timeline actual:\n${currentTimeline.map((item, index) =>
            `${index + 1}. tipo=${item.tipo}; url=${item.url}; nombre=${item.nombre || ''}; etiqueta=${item.etiqueta || ''}`
          ).join('\n')}`
        : 'Timeline actual: vacío.',
    ].join('\n\n');

    const historyText = history?.length
      ? history.map((msg) => `${msg.role}: ${msg.content}`).join('\n')
      : '';

    const fullPrompt = [
      executionContext,
      historyText ? `Historial:\n${historyText}` : '',
      `Usuario: ${message}`,
    ].filter(Boolean).join('\n\n');

    const executeGroq = async (apiKey: string) => {
      const groqProvider = new GroqProvider(apiKey, 'dialog');
      return await groqProvider.generateText(fullPrompt, images, systemPrompt);
    };

    const executeMistral = async (apiKey: string) => {
      const mistralProvider = new MistralProvider(apiKey, 'dialog');
      return await mistralProvider.generateText(fullPrompt, images, systemPrompt);
    };

    const executeDirectOrPool = async (
      providerName: 'groq' | 'mistral',
      directApiKey: string | undefined,
      executor: (apiKey: string) => Promise<string>
    ) => {
      if (directApiKey?.trim()) {
        return await executor(directApiKey.trim());
      }

      if (!supabaseAdmin) {
        throw new Error(`No hay ${providerName.toUpperCase()}_API_KEY configurada en Vercel y tampoco hay conexión al pool temporal de llaves.`);
      }

      return await executeWithApiKey(supabaseAdmin, providerName, executor);
    };

    const executeGroqDirectOrPool = () =>
      executeDirectOrPool('groq', process.env.GROQ_API_KEY, executeGroq);
    const executeMistralDirectOrPool = () =>
      executeDirectOrPool('mistral', process.env.MISTRAL_API_KEY, executeMistral);

    let responseText = '';
    try {
      responseText = provider === 'mistral'
        ? await executeMistralDirectOrPool().catch(async () => executeGroqDirectOrPool())
        : await executeGroqDirectOrPool().catch(async () => executeMistralDirectOrPool());
    } catch (error: any) {
      console.error('[chat.ts] Todos los proveedores fallaron:', error);
      return res.status(500).json({
        error: error.message || 'Error al generar la respuesta. Ambos proveedores fallaron o están al límite.',
      });
    }

    const action = parseNaylaAction(responseText);
    if (action) {
      try {
        const executed = await executeValidatedAction(action, {
          userId: firebaseUser.uid,
          appBaseUrl: resolveRequestPublicBaseUrl(req),
        });
        return res.status(200).json(executed);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'La acción de Nayla no pudo ejecutarse.';
        return res.status(502).json({ error: message, action: action.action });
      }
    }

    return res.status(200).json({ text: responseText });
  } catch (error: any) {
    console.error('[chat.ts] Error general:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
