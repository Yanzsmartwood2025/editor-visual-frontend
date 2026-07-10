import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { executeWithApiKey, logAiRateLimitError } from '../../utils/apiKeyManager';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, model } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt es requerido.' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[chat-nayla] Missing Supabase credentials.');
    return res.status(500).json({ error: 'Configuración de servidor incompleta.' });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  const apiUrl = 'https://api.manus.im/v1/chat/completions';

  const aiName = process.env.NEXT_PUBLIC_AI_NAME || 'Nayla';
  const flashModel = process.env.NAYLA_MODEL_FLASH || 'manus-flash';
  const proModel = process.env.NAYLA_MODEL_PRO || 'manus-pro';
  const targetModel = model === 'manus-flash' ? flashModel : proModel;

  const systemMessage = `Hola, soy ${aiName}. Estoy aquí para ayudarte a crear el mejor contenido y gestionar tus redes sociales.`;

  try {
    const manusResponseText = await executeWithApiKey(
      supabaseAdmin,
      'manus_ai',
      async (apiKey: string) => {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [
              { role: "system", content: systemMessage },
              { role: "user", content: prompt }
            ],
            stream: false
          })
        });

        if (!response.ok) {
          const errorData = await response.text();
          if (response.status === 429) {
            throw { status: 429, message: errorData || 'Rate limit' };
          }
          throw new Error(`Nayla API Error: ${response.status} - ${errorData}`);
        }

        const data = await response.json();
        // Assuming standard OpenAI format response
        return data.choices?.[0]?.message?.content || "";
      },
      async () => {
        // Fallback to env var if no key found in pool
        const fallbackKey = process.env.MANUS_API_KEY;
        if (!fallbackKey) {
           throw new Error('No MANUS_API_KEY in environment variables.');
        }

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${fallbackKey}`
          },
          body: JSON.stringify({
            model: targetModel,
            messages: [
              { role: "system", content: systemMessage },
              { role: "user", content: prompt }
            ],
            stream: false
          })
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Nayla API Fallback Error: ${response.status} - ${errorData}`);
        }

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "";
      }
    );

    // Intentamos parsear la respuesta de la IA por si devolvió un JSON con action/payload,
    // pero si es solo texto, lo enviamos como 'text'.
    let parsedResponse;
    try {
        // Limpiamos los backticks de markdown si la IA los incluye
        const cleanedText = manusResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedResponse = JSON.parse(cleanedText);
    } catch (e) {
        // No es JSON, lo enviamos como texto simple
        parsedResponse = { text: manusResponseText };
    }

    return res.status(200).json(parsedResponse);

  } catch (error: any) {
    console.error('[chat-nayla] Error procesando el chat:', error);

    // Loguear si es error de límite (rate limit)
    const isRateLimit = error?.message?.toLowerCase().includes('límite') || error?.status === 429;

    if (isRateLimit) {
        await logAiRateLimitError(supabaseAdmin, 'manus_ai', error.message || 'Rate Limit Exceeded');
        return res.status(429).json({ error: 'Límite de cuota alcanzado. Por favor, intenta de nuevo más tarde o cambia de cuenta.' });
    }

    return res.status(500).json({ error: 'Error interno en el chat de Nayla.', details: error.message });
  }
}
