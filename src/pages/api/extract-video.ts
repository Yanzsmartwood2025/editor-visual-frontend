import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { executeWithApiKey, RateLimitError } from '../../utils/apiKeyManager';
import { z } from 'zod';

const requestSchema = z.object({
  url: z.string().url('URL no proporcionada o formato inválido.')
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

    const { url } = parsedBody.data;

    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        return res.status(400).json({ error: 'La URL debe usar el protocolo HTTP o HTTPS.' });
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

  const ORACLE_SERVER_URL = process.env.ORACLE_SERVER_URL;
  if (!ORACLE_SERVER_URL) {
      throw new Error('ORACLE_SERVER_URL no configurado en .env');
  }
  const ORACLE_SECRET = process.env.ORACLE_SECRET;

  if (!ORACLE_SECRET) {
    console.error('[extract-video] ORACLE_SECRET no configurado.');
    return res.status(500).json({ error: 'El servicio de extracción (Oráculo) no está configurado adecuadamente.' });
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
    return await executeWithApiKey(supabase, "groq",
      async (apiKey: string) => {
        console.log(`[extract-video] Delegando extracción a Oracle con IA (Groq): ${ORACLE_SERVER_URL}/api/extract-meta`);
        const oracleRes = await fetch(`${ORACLE_SERVER_URL}/api/extract-meta`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ORACLE_SECRET}`,
            'x-api-key': apiKey // Generico para que Oracle lo use
          },
          body: JSON.stringify({ url, provider: 'groq' }),
          signal: AbortSignal.timeout(60000)
        });

        if (oracleRes.status === 429) {
           const errData = await oracleRes.json().catch(() => ({ message: '429 Rate Limit' }));
           throw new RateLimitError(errData.message || '429 Rate Limit from Oracle/Groq');
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
      fallbackExecute // En el futuro Oracle puede fallar y lo pasamos al fallback directo sin IA
    );
  } catch (error: any) {
    if (error.message && error.message.includes('alcanzado en todas las cuentas disponibles')) {
       return res.status(429).json({ error: error.message });
    }
    console.error('[extract-video] Error conectando al Oráculo.', error);
    return res.status(500).json({ error: 'Error general en el servicio de extracción.', details: error.message || 'Error desconocido' });
  }
  } catch (error: any) {
    return res.status(500).json({ error: 'Error general en extract-video', details: error.message });
  }
}
