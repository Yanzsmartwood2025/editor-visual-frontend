import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { executeWithGeminiKey } from '../../utils/apiKeyManager';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { texto, email } = req.body;

  if (!texto || !email) {
    return res.status(400).json({ error: 'Texto y email son requeridos.' });
  }

  if (email !== 'ajn.liq.128@proton.me') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador.' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Llaves de base de datos ausentes.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const fallbackExecute = async () => {
      console.warn("[ia-audio] No se encontró Gemini API Key en Supabase, usando variable de entorno si existe o fallando.");
      const envKey = process.env.GEMINI_API_KEY;
      if (!envKey) {
        throw new Error('No se encontró la llave de API para el servicio de Audio IA.');
      }
      return envKey;
    };

    const effectiveKey = await executeWithGeminiKey(
      supabase,
      async (apiKey) => {
        // En una implementación real, aquí se llamaría al servicio de TTS.
        // Si el servicio devuelve 429, deberíamos lanzar un RateLimitError.
        // Por ahora, simplemente retornamos la key para usarla en el log.
        return apiKey;
      },
      fallbackExecute
    );

    // TODO: Implementar llamada real a servicio de TTS (Texto a voz) usando la API Key.
    // Por ahora retornamos un placeholder simulando un audio.
    console.log(`[ia-audio] Procesando texto para audio usando API Key terminando en ${effectiveKey?.substring(effectiveKey.length - 4)}`);

    // Placeholder URL para el audio generado
    const mockAudioUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

    res.status(200).json({ url: mockAudioUrl, message: 'Audio generado exitosamente (Placeholder)' });

  } catch (error: any) {
    console.error("Error en ia-audio:", error);
    if (error.message.includes('Límite de Gemini alcanzado')) {
       return res.status(429).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
}
