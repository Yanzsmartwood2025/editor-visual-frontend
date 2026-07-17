import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { executeWithApiKey, RateLimitError } from '../../utils/apiKeyManager';

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
  } catch {
    return res.status(400).json({ error: 'Formato de URL inválido.' });
  }


  const checkDirectUrl = async (testUrl: string): Promise<{ isDirect: boolean; error?: string }> => {
    try {
      const parsed = new URL(testUrl);
      const pathname = parsed.pathname.toLowerCase();
      const hasExtension = pathname.endsWith('.mp4') || pathname.endsWith('.webm') || pathname.endsWith('.mov') ||
             pathname.endsWith('.mp3') || pathname.endsWith('.wav') ||
             pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') ||
             pathname.endsWith('.png') || pathname.endsWith('.webp');

      if (hasExtension) {
        return { isDirect: true };
      }

      // Si no tiene extensión, hacemos un HEAD request para ver el Content-Type
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      try {

        const headRes = await fetch(testUrl, {
          method: 'HEAD',
          signal: controller.signal
        });

        if (headRes.ok) {
          const contentType = headRes.headers.get('content-type') || '';
          if (contentType.startsWith('image/') || contentType.startsWith('video/') || contentType.startsWith('audio/')) {
            return { isDirect: true };
          }
        }
        return { isDirect: false };
      } catch (e: any) {
        if (e.name === 'AbortError') {
           return { isDirect: false, error: 'Timeout al verificar el tipo de archivo de la URL.' };
        }
        return { isDirect: false, error: 'Error al verificar el tipo de archivo de la URL.' };
      } finally {
        clearTimeout(timeoutId);
      }

    } catch {
      return { isDirect: false, error: 'Formato de URL inválido.' };
    }
  };

  const ORACLE_SERVER_URL = process.env.ORACLE_SERVER_URL || 'https://oracle-api.132.145.184.192.sslip.io';
  const ORACLE_SECRET = process.env.ORACLE_SECRET;

  if (!ORACLE_SERVER_URL || !ORACLE_SECRET) {
    console.error('[extract-video] ORACLE_SERVER_URL o ORACLE_SECRET no configurados.');
    return res.status(500).json({ error: 'El servicio de extracción (Oráculo) no está configurado.' });
  }

  const directCheck = await checkDirectUrl(url);

  if (directCheck.error) {
    return res.status(400).json({ error: directCheck.error });
  }

  if (directCheck.isDirect) {
    console.log(`[extract-video] URL detectada como archivo directo: ${url}. Delegando al Motor Manual de Oracle.`);
    try {
      const oracleRes = await fetch(`${ORACLE_SERVER_URL}/api/extract-direct`, {
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
        return res.status(200).json({ videoUrl: oracleData.videoUrl });
      } else {
        const err = await oracleRes.json().catch(() => ({}));
        return res.status(oracleRes.status).json(err);
      }
    } catch (e: any) {
      console.error('[extract-video] Error conectando al Motor Manual (Oracle)', e);
      return res.status(500).json({ error: 'Error conectando al servicio de Motor Manual.', details: e.message });
    }
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
    return await executeWithApiKey(supabase, "gemini",
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
