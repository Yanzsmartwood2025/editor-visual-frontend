import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

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
    // 1. Extraer la API key de Gemini de Supabase
    const { data: keysData, error: keyError } = await supabase
      .from('api_keys_pool')
      .select('api_key')
      .ilike('service_provider', '%gemini%')
      .eq('resource_type', 'llm')
      .gt('monthly_limit', 0)
      .not('api_key', 'is', null)
      .order('monthly_limit', { ascending: false });

    let dbKey = null;
    if (keyError) {
      console.warn("[ia-audio] Error al consultar la tabla api_keys_pool.", keyError);
    } else if (keysData && keysData.length > 0) {
      const validKeyRecord = keysData.find(row => row.api_key && row.api_key.trim() !== '');
      if (validKeyRecord) {
        dbKey = validKeyRecord.api_key;
      }
    }

    if (!dbKey) {
      console.warn("No se encontró Gemini API Key en Supabase, usando variable de entorno si existe o fallando.");
      const envKey = process.env.GEMINI_API_KEY;
      if(!envKey) {
          return res.status(500).json({ error: 'No se encontró la llave de API para el servicio de Audio IA.' });
      }
    }

    const effectiveKey = dbKey || process.env.GEMINI_API_KEY;

    // TODO: Implementar llamada real a servicio de TTS (Texto a voz) usando la API Key.
    // Por ahora retornamos un placeholder simulando un audio.
    console.log(`[ia-audio] Procesando texto para audio usando API Key terminando en ${effectiveKey?.substring(effectiveKey.length - 4)}`);

    // Placeholder URL para el audio generado
    const mockAudioUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

    res.status(200).json({ url: mockAudioUrl, message: 'Audio generado exitosamente (Placeholder)' });

  } catch (error: any) {
    console.error("Error en ia-audio:", error);
    res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
}
