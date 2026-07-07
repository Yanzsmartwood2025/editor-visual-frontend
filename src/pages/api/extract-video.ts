import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { executeWithGeminiKey, RateLimitError } from '../../utils/apiKeyManager';

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  const fallbackExecute = async () => {
    // Oráculo directo sin LLM key
    console.log(`[extract-video] Delegando extracción a Oracle sin LLM key: ${ORACLE_SERVER_URL}/api/extract-meta`);
    const oracleRes = await fetch(`${ORACLE_SERVER_URL}/api/extract-meta`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ORACLE_SECRET}`
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(60000)
    });

    if (oracleRes.ok) {
      const oracleData = await oracleRes.json();
      if (oracleData.videoUrl) {
        console.log(`[extract-video] Extracción exitosa desde Oracle: ${oracleData.videoUrl}`);
        return res.status(200).json({ videoUrl: oracleData.videoUrl });
      }
    }
    const errorData = await oracleRes.json().catch(() => ({}));
    console.warn(`[extract-video] Oracle falló con status ${oracleRes.status}.`, errorData);
    return res.status(oracleRes.status).json(errorData);
  };

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[extract-video] Credenciales de Supabase no configuradas, omitiendo LLM manager.');
    return await fallbackExecute();
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    return await executeWithGeminiKey(
      supabase,
      async (apiKey: string) => {
        console.log(`[extract-video] Delegando extracción a Oracle con IA: ${ORACLE_SERVER_URL}/api/extract-meta`);
        const oracleRes = await fetch(`${ORACLE_SERVER_URL}/api/extract-meta`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ORACLE_SECRET}`,
            'x-gemini-api-key': apiKey
          },
          body: JSON.stringify({ url }),
          signal: AbortSignal.timeout(60000)
        });

        if (oracleRes.status === 429) {
           const errData = await oracleRes.json().catch(() => ({ message: '429 Rate Limit' }));
           throw new RateLimitError(errData.message || '429 Rate Limit from Oracle/Gemini');
        }

        if (oracleRes.ok) {
          const oracleData = await oracleRes.json();
          if (oracleData.videoUrl) {
            console.log(`[extract-video] Extracción exitosa desde Oracle: ${oracleData.videoUrl}`);
            return res.status(200).json({ videoUrl: oracleData.videoUrl });
          }
        }

        const errorData = await oracleRes.json().catch(() => ({}));
        console.warn(`[extract-video] Oracle falló con status ${oracleRes.status}.`, errorData);
        return res.status(oracleRes.status).json(errorData);
      },
      fallbackExecute
    );
  } catch (error: any) {
    if (error.message.includes('Límite de Gemini alcanzado')) {
       return res.status(429).json({ error: error.message });
    }
    console.error('[extract-video] Error conectando al Oráculo.', error);
    return res.status(500).json({ error: 'Error conectando al servicio de extracción (Oráculo).', details: error.message });
  }
}
