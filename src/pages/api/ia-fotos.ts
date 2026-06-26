import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fotoBaseUrl, prompt, email } = req.body;

  if (!fotoBaseUrl || !prompt || !email) {
    return res.status(400).json({ error: 'Foto base, prompt y email son requeridos.' });
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
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys_pool')
      .select('api_key')
      .eq('service_provider', 'gemini')
      .eq('resource_type', 'ia')
      .limit(1)
      .single();

    if (keyError || !keyData?.api_key) {
      console.warn("No se encontró Gemini API Key en Supabase, usando variable de entorno si existe o fallando.");
      const envKey = process.env.GEMINI_API_KEY;
      if(!envKey) {
          return res.status(500).json({ error: 'No se encontró la llave de API para el servicio de Fotos IA.' });
      }
    }

    const effectiveKey = keyData?.api_key || process.env.GEMINI_API_KEY;

    // TODO: Implementar llamada real a servicio de generación de imágenes usando la API Key y la imagen base.
    // Por ahora retornamos un placeholder simulando la nueva imagen.
    console.log(`[ia-fotos] Procesando imagen base con prompt "${prompt}" usando API Key terminando en ${effectiveKey?.substring(effectiveKey.length - 4)}`);

    // Placeholder URL para la foto generada
    const mockFotoUrl = 'https://picsum.photos/800/600';

    res.status(200).json({ url: mockFotoUrl, message: 'Foto generada exitosamente (Placeholder)' });

  } catch (error: any) {
    console.error("Error en ia-fotos:", error);
    res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
}
