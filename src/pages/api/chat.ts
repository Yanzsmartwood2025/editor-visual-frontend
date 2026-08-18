import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { executeWithApiKey } from '../../utils/apiKeyManager';
import { GroqProvider, MistralProvider } from '../../utils/llmProvider';
import { z } from 'zod';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey;

// Avoid throwing error on module load if env vars are missing
const supabaseAdmin = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

const availableEffectsCatalog = {
  transiciones: {
    campo: 'transitionType',
    valores: ['fade', 'wipe', 'slide', 'zoom']
  },
  filtros: {
    campo: 'efecto',
    valores: ['grayscale', 'sepia', 'vintage', 'blur']
  },
  overlays: {
    campo: 'overlay',
    valores: ['vignette', 'film-grain', 'light-leak']
  }
};

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

const requestSchema = z.object({
  message: z.string().min(1, 'Falta el parámetro requerido o está vacío: message'),
  images: z.array(z.string()).optional(),
  history: z.array(z.any()).optional(),
  provider: z.enum(['groq', 'mistral']).optional().default('groq'),
  mediaLibrary: z.array(z.object({
    id: z.string().optional(),
    tipo: z.enum(['foto', 'video', 'audio']),
    url: z.string().url(),
    nombre: z.string().optional(),
    etiqueta: z.string().optional(),
    fuente: z.string().optional()
  })).optional(),
  currentTimeline: z.array(z.any()).optional()
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const parsedBody = requestSchema.safeParse(req.body);

    if (!parsedBody.success) {
      return res.status(400).json({ error: parsedBody.error.issues?.[0]?.message || 'Invalid parameters' });
    }

    const { message, images, history, provider, mediaLibrary, currentTimeline } = parsedBody.data;

    const systemPrompt = `
Eres Nayla, asistente de IA para un editor de video basado en Remotion.
Debes ser conciso, amable y experto.

PRIORIDAD ACTUAL:
- NO generes imagen, video, audio ni búsquedas multimedia nuevas.
- Solo puedes usar medios existentes que el frontend te entrega en mediaLibrary/currentTimeline.
- Si el usuario pide "arma el video", "crea el video con esto", "usa estos medios" o algo equivalente, responde ÚNICAMENTE con JSON válido, sin markdown ni bloques de código.
- Respeta el orden exacto en que aparecen los medios disponibles, salvo que el usuario pida otro orden explícito.
- Copia las URLs exactamente como llegan. No inventes URLs.

Contrato único ejecutable:
{
  "action": "BUILD_TIMELINE",
  "assets": [
    { "type": "foto", "source": "url", "url": "https://...", "efecto": "vintage", "transitionType": "fade", "transitionDuration": 0.5, "fadeIn": 0.5, "fadeOut": 0.5 },
    { "type": "video", "source": "url", "url": "https://...", "efecto": "grayscale", "transitionType": "slide", "transitionDuration": 0.5, "fadeIn": 0.5, "fadeOut": 0.5 },
    { "type": "audio", "source": "url", "url": "https://...", "fadeIn": 1, "fadeOut": 1 }
  ],
  "render": true
}

Usa type únicamente como "foto", "video" o "audio". Usa source únicamente como "url".
Campos opcionales por asset si el usuario pide efectos: "efecto", "transitionType", "transitionDuration", "fadeIn", "fadeOut", "overlay", "overlayIntensity". Usa "efecto" exactamente en español.

Catálogo real disponible hoy (usa solo estos nombres; no inventes Ken Burns, pan, rotate ni otros no implementados):
${JSON.stringify(availableEffectsCatalog, null, 2)}

Reglas para usar el catálogo:
- Para filtros visuales por foto/video, escribe el valor directamente en el campo "efecto".
- Para transiciones entre clips, escribe el valor en "transitionType" y acompáñalo con "transitionDuration" en segundos.
- Para overlays visuales, escribe el valor en el campo "overlay".
- Si el usuario pide efectos pero no especifica cuál, elige únicamente de este catálogo real.
Si no hay medios suficientes para armar el timeline, responde texto normal explicando qué falta.
Para todo lo que no sea construir el timeline con medios existentes, responde normalmente en texto.
`;

  // Construir historial para mandar al prompt si es necesario,
  // aunque nuestro provider actual toma un string, podemos concatenar el historial de forma básica
  // o pasarlo como parte del system prompt/context.
  let fullPrompt = message;
  const executionContext = [
    mediaLibrary?.length ? `Medios disponibles en orden de entrega:\n${mediaLibrary.map((item, index) => `${index + 1}. tipo=${item.tipo}; url=${item.url}; nombre=${item.nombre || ''}; etiqueta=${item.etiqueta || ''}; fuente=${item.fuente || ''}`).join('\n')}` : 'Medios disponibles en orden de entrega: ninguno.',
    currentTimeline?.length ? `Timeline actual en orden:\n${currentTimeline.map((item: any, index: number) => `${index + 1}. tipo=${item.tipo}; url=${item.url}; nombre=${item.nombre || ''}; etiqueta=${item.etiqueta || ''}`).join('\n')}` : 'Timeline actual: vacío.'
  ].join('\n\n');

  if (history && Array.isArray(history) && history.length > 0) {
    const historyText = history.map((msg: any) => `${msg.role}: ${msg.content}`).join('\n');
    fullPrompt = `${executionContext}\n\nHistorial de la conversación:\n${historyText}\n\nUsuario: ${message}`;
  } else {
    fullPrompt = `${executionContext}\n\nUsuario: ${message}`;
  }

    // Definimos cómo ejecutar con Groq
    const executeGroq = async (apiKey: string) => {
      const groqProvider = new GroqProvider(apiKey, 'dialog');
      return await groqProvider.generateText(fullPrompt, images, systemPrompt);
    };

    // Definimos cómo ejecutar con Mistral (como fallback o primario si se elige)
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

    const executeGroqDirectOrPool = () => executeDirectOrPool('groq', process.env.GROQ_API_KEY, executeGroq);
    const executeMistralDirectOrPool = () => executeDirectOrPool('mistral', process.env.MISTRAL_API_KEY, executeMistral);

    let responseText = '';

    try {
      if (provider === 'mistral') {
        responseText = await executeMistralDirectOrPool().catch(async () => executeGroqDirectOrPool());
      } else {
        responseText = await executeGroqDirectOrPool().catch(async () => executeMistralDirectOrPool());
      }
    } catch (error: any) {
      console.error('[chat.ts] Todos los proveedores fallaron:', error);
      return res.status(500).json({ error: error.message || 'Error al generar la respuesta. Ambos proveedores fallaron o están al límite.' });
    }

    // Intentamos parsear por si devolvió el JSON para acciones multimedia
    try {
       const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
       if (cleanedText.startsWith('{') && cleanedText.endsWith('}')) {
          const parsed = JSON.parse(cleanedText);
          if (parsed.action === 'BUILD_TIMELINE' && Array.isArray(parsed.assets)) {
              return res.status(200).json(parsed);
          }
       }
    } catch {
        // No es JSON, seguimos normal
    }

    // Respuesta de texto normal
    return res.status(200).json({ text: responseText });

  } catch (error: any) {
    console.error('[chat.ts] Error general:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
