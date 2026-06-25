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
    if (parsedUrl.protocol !== 'https:') {
        return res.status(400).json({ error: 'La URL debe usar el protocolo HTTPS.' });
    }

    if (parsedUrl.hostname !== 'www.meta.ai' && parsedUrl.hostname !== 'meta.ai') {
        return res.status(400).json({ error: 'La URL debe pertenecer al dominio meta.ai.' });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Formato de URL inválido.' });
  }

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

    console.log(`[extract-meta-video] HTML fetched successfully. Length: ${html.length}`);

    // Nueva Regex robusta para capturar URLs de .mp4 escapadas o sin escapar de fbcdn.net
    const searchRegex = /(https:(?:\\\/|\/)(?:\\\/|\/)[^"'\s]+\.fbcdn\.net[^"'\s]+\.mp4[^"'\s]*)/gi;
    let match = searchRegex.exec(html);

    if (match && match[1]) {
      // Procesamos la cadena extraída: reemplazamos \u0026 por & y quitamos los escapes de las barras \/
      let finalUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');

      console.log(`[extract-meta-video] Extracted Video URL: ${finalUrl}`);
      return res.status(200).json({ videoUrl: finalUrl });
    }

    console.log('[extract-meta-video] Fallo en la extracción. No se encontró ninguna URL de fbcdn.net terminada en .mp4 en el HTML.');
    console.log(`[extract-meta-video] HTML Snippet (primeros 500 chars): ${html.substring(0, 500)}`);
    return res.status(404).json({ error: 'No se pudo encontrar la URL del video en la página.' });

  } catch (error: any) {
    console.error('Error extracting video URL:', error);
    return res.status(500).json({ error: 'Error procesando la solicitud', details: error.message });
  }
}
