import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { executeWithApiKey, logAiRateLimitError } from '../../utils/apiKeyManager';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt es requerido.' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[chat-manus] Missing Supabase credentials.');
    return res.status(500).json({ error: 'Configuración de servidor incompleta.' });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  const apiUrl = process.env.MANUS_API_URL || 'https://api.manus.ai/v1/chat/completions';

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
            model: "manus-1",
            messages: [
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
          throw new Error(`Manus API Error: ${response.status} - ${errorData}`);
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
            model: "manus-1",
            messages: [
              { role: "user", content: prompt }
            ],
            stream: false
          })
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Manus API Fallback Error: ${response.status} - ${errorData}`);
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
    console.error('[chat-manus] Error procesando el chat:', error);

    // Loguear si es error de límite (rate limit)
    const isRateLimit = error?.message?.toLowerCase().includes('límite') || error?.status === 429;

    if (isRateLimit) {
        await logAiRateLimitError(supabaseAdmin, 'manus_ai', error.message || 'Rate Limit Exceeded');
        return res.status(429).json({ error: 'Límite de cuota alcanzado. Por favor, intenta de nuevo más tarde o cambia de cuenta.' });
    }

    return res.status(500).json({ error: 'Error interno en el chat de Manus.', details: error.message });
  }
}
