import type { NextApiRequest, NextApiResponse } from 'next';

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

  const ORACLE_URL = process.env.ORACLE_URL || 'http://oracle-service:3001';
  const ORACLE_SECRET = process.env.ORACLE_SECRET;

  // Intento 1: Delegar al Oráculo si las variables están configuradas
  if (ORACLE_URL && ORACLE_SECRET) {
    try {
      console.log(`[extract-video] Intentando delegar extracción a Oracle: ${ORACLE_URL}/api/extract-meta`);
      const oracleRes = await fetch(`${ORACLE_URL}/api/extract-meta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ORACLE_SECRET}`
        },
        body: JSON.stringify({ url }),
        // Agregamos un timeout más largo (45s) ya que el Oráculo podría estar descargando/subiendo con yt-dlp
        signal: AbortSignal.timeout(45000)
      });

      if (oracleRes.ok) {
        const oracleData = await oracleRes.json();
        if (oracleData.videoUrl) {
          console.log(`[extract-video] Extracción exitosa desde Oracle: ${oracleData.videoUrl}`);
          return res.status(200).json({ videoUrl: oracleData.videoUrl });
        }
      } else {
        console.warn(`[extract-video] Oracle falló con status ${oracleRes.status}. Haciendo fallback a extracción local en Vercel.`);
      }
    } catch (oracleError) {
      console.warn('[extract-video] Error conectando al Oráculo. Haciendo fallback local.', oracleError);
    }
  } else {
     console.log('[extract-video] ORACLE_URL o ORACLE_SECRET no configurados. Procediendo con extracción local en Vercel.');
  }

  // Intento 2 (Fallback): Extracción local desde Vercel
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch HTML: ${response.status}`);
    }

    const html = await response.text();

    console.log(`[extract-video] HTML fetched successfully locally. Length: ${html.length}`);

    // Intentar primero con la regex original (fbcdn con mp4)
    const searchRegex = /(https:(?:\\\/|\/)(?:\\\/|\/)[^"'\s]+\.fbcdn\.net[^"'\s]+\.mp4[^"'\s]*)/gi;
    let match = searchRegex.exec(html);

    if (match && match[1]) {
      let finalUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
      console.log(`[extract-video] Extracted Video URL (fbcdn regex): ${finalUrl}`);
      return res.status(200).json({ videoUrl: finalUrl });
    }

    // Fallback regex: capturar cualquier https que termine en .mp4
    const broadRegex = /(https:(?:\\\/|\/)(?:\\\/|\/)[^"'\s<>]+\.mp4[^"'\s<>]*)/gi;
    let matchBroad = broadRegex.exec(html);

    if (matchBroad && matchBroad[1]) {
      let finalUrl = matchBroad[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
      console.log(`[extract-video] Extracted Video URL (broad regex): ${finalUrl}`);
      return res.status(200).json({ videoUrl: finalUrl });
    }

    console.log('[extract-video] Fallo en la extracción local. No se encontró URL .mp4 en el HTML.');
    return res.status(404).json({ error: 'No se pudo encontrar la URL del video en la página usando Vercel o el Oráculo.' });

  } catch (error: any) {
    console.error('Error extracting video URL:', error);
    return res.status(500).json({ error: 'Error procesando la solicitud', details: error.message });
  }
}
