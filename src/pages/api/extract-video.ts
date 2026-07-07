import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL no proporcionada o formato inválido.' });
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return res.status(400).json({ error: 'La URL debe usar el protocolo HTTP o HTTPS.' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Formato de URL inválido.' });
  }

  const ORACLE_SERVER_URL = process.env.ORACLE_SERVER_URL || 'http://oracle-service:3001';
  const ORACLE_SECRET = process.env.ORACLE_SECRET;

  if (!ORACLE_SERVER_URL || !ORACLE_SECRET) {
    console.error('[extract-video] ORACLE_SERVER_URL o ORACLE_SECRET no configurados.');
    return res.status(500).json({ error: 'El servicio de extracción (Oráculo) no está configurado.' });
  }

  let geminiApiKey = '';
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { data, error } = await supabase
        .from('api_keys_pool')
        .select('api_key, character_name')
        .ilike('service_provider', '%gemini%')
        .eq('resource_type', 'llm')
        .gt('monthly_limit', 0)
        .not('api_key', 'is', null)
        .order('monthly_limit', { ascending: false });

      if (error) {
        console.warn('[extract-video] Error al consultar la tabla api_keys_pool.', error);
      } else if (data && data.length > 0) {
        // Find the first valid non-empty key (since 'not null' doesn't cover empty strings)
        const validKeyRecord = data.find(row => row.api_key && row.api_key.trim() !== '');

        if (validKeyRecord) {
          geminiApiKey = validKeyRecord.api_key;
          console.log(`[extract-video] Gemini API Key seleccionada de la base de datos (character_name: '${validKeyRecord.character_name}').`);
        } else {
          console.warn('[extract-video] 0 keys de Gemini con cuota disponible (o todas vacías).');
        }
      } else {
        console.warn('[extract-video] 0 keys de Gemini con cuota disponible.');
      }
    } else {
      console.warn('[extract-video] Credenciales de Supabase no configuradas en Vercel, omitiendo búsqueda de IA.');
    }
  } catch (dbError) {
    console.error('[extract-video] Error al consultar api_keys_pool:', dbError);
  }

  // Delegar todo al Oráculo
  try {
    console.log(`[extract-video] Delegando extracción a Oracle: ${ORACLE_SERVER_URL}/api/extract-meta`);
    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ORACLE_SECRET}`
    };

    if (geminiApiKey) {
      requestHeaders['x-gemini-api-key'] = geminiApiKey;
    }

    console.log(`[extract-video] Vercel: Llave enviada en header (x-gemini-api-key): ${!!geminiApiKey}`);

    const oracleRes = await fetch(`${ORACLE_SERVER_URL}/api/extract-meta`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ url }),
      // Agregamos un timeout más largo (60s) ya que el Oráculo podría estar descargando/subiendo o usando IA
      signal: AbortSignal.timeout(60000)
    });

    if (oracleRes.ok) {
      const oracleData = await oracleRes.json();
      if (oracleData.videoUrl) {
        console.log(`[extract-video] Extracción exitosa desde Oracle: ${oracleData.videoUrl}`);
        return res.status(200).json({ videoUrl: oracleData.videoUrl });
      }
    }

    // Si llegamos acá, Oracle devolvió un error (ej 404, 500)
    const errorData = await oracleRes.json().catch(() => ({}));
    console.warn(`[extract-video] Oracle falló con status ${oracleRes.status}.`, errorData);
    return res.status(oracleRes.status).json(errorData);

  } catch (oracleError: any) {
    console.error('[extract-video] Error conectando al Oráculo.', oracleError);
    return res.status(500).json({ error: 'Error conectando al servicio de extracción (Oráculo).', details: oracleError.message });
  }
}
