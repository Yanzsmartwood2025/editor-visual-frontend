import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { executeWithApiKey } from '../../utils/apiKeyManager';
import { GroqProvider, MistralProvider } from '../../utils/llmProvider';
import { z } from 'zod';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

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
  provider: z.enum(['groq', 'mistral']).optional().default('groq')
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

    const { message, images, history, provider } = parsedBody.data;

    const systemPrompt = `
Eres un asistente de IA para un editor de video basado en código (NaylaEngine).
Debes ser conciso, amable y experto.
IMPORTANTE: Si el usuario te pide crear o generar una imagen, video, o audio, o buscar recursos multimedia, NO respondas con texto conversacional normal.
EN SU LUGAR, debes responder ÚNICAMENTE con un JSON válido con este formato, sin markdown, sin \`\`\`json, solo el objeto JSON crudo:
{"action": "generate_image", "prompt": "el prompt detallado para generar la imagen"}
{"action": "generate_video", "prompt": "el prompt detallado para el video"}
{"action": "generate_audio", "prompt": "el prompt para el audio"}
{"action": "search_media", "prompt": "términos de búsqueda"}

Solo responde en JSON si es estrictamente un pedido de generación o búsqueda multimedia.
Para todo lo demás (charlas, dudas sobre el editor, etc.), responde normalmente en texto.
`;

  // Construir historial para mandar al prompt si es necesario,
  // aunque nuestro provider actual toma un string, podemos concatenar el historial de forma básica
  // o pasarlo como parte del system prompt/context.
  let fullPrompt = message;
  if (history && Array.isArray(history) && history.length > 0) {
    const historyText = history.map((msg: any) => `${msg.role}: ${msg.content}`).join('\n');
    fullPrompt = `Historial de la conversación:\n${historyText}\n\nUsuario: ${message}`;
  }

    // Definimos cómo ejecutar con Groq
    const executeGroq = async (apiKey: string) => {
      const provider = new GroqProvider(apiKey);
      return await provider.generateText(fullPrompt, images, systemPrompt);
    };

    // Definimos cómo ejecutar con Mistral (como fallback o primario si se elige)
    const executeMistral = async (apiKey: string) => {
      const provider = new MistralProvider(apiKey);
      return await provider.generateText(fullPrompt, images, systemPrompt);
    };
    const executeMistralFallback = async () => {
      return await executeWithApiKey(
        supabaseAdmin,
        'mistral',
        executeMistral
      );
    };
    const executeGroqFallback = async () => {
      return await executeWithApiKey(
        supabaseAdmin,
        'groq',
        executeGroq
      );
    };

    let responseText = '';

    try {
      if (provider === 'mistral') {
        responseText = await executeWithApiKey(
          supabaseAdmin,
          'mistral',
          executeMistral,
          executeGroqFallback
        );
      } else {
        responseText = await executeWithApiKey(
          supabaseAdmin,
          'groq',
          executeGroq,
          executeMistralFallback
        );
      }
    } catch (error: any) {
      console.error('[chat.ts] Todos los proveedores fallaron:', error);
      return res.status(500).json({ error: 'Error al generar la respuesta. Ambos proveedores fallaron o están al límite.' });
    }

    // Intentamos parsear por si devolvió el JSON para acciones multimedia
    try {
       const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
       if (cleanedText.startsWith('{') && cleanedText.endsWith('}')) {
          const parsed = JSON.parse(cleanedText);
          if (parsed.action && parsed.prompt) {
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
