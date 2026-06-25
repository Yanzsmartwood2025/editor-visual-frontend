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

    // Regex to find video URL. This looks for fbcdn.net URLs that contain .mp4
    // Many times in Facebook/Meta sources, the URL is escaped like \/ or similar, and ends with .mp4
    // We try a few common patterns.

    // Pattern 1: Look for "video_url":"https:\/\/..." or similar
    const videoUrlRegex = /(?:https?:)?\\?\/\\?\/[^"']*\.fbcdn\.net[^"']*\.mp4[^"']*/g;

    let match = videoUrlRegex.exec(html);

    if (match && match[0]) {
      // Unescape forward slashes if any
      let finalUrl = match[0].replace(/\\/g, '');
      // Ensure it has protocol
      if (finalUrl.startsWith('//')) {
          finalUrl = 'https:' + finalUrl;
      }

      return res.status(200).json({ videoUrl: finalUrl });
    }

    // Try a more general search for any .mp4 URL in fbcdn
    const genericMp4Regex = /https:\/\/[a-zA-Z0-9-.]+\.fbcdn\.net\/v\/[^"']+\.mp4[^"']*/g;
    match = genericMp4Regex.exec(html);

    if (match && match[0]) {
        const finalUrl = match[0].replace(/\\/g, '');
        return res.status(200).json({ videoUrl: finalUrl });
    }

    // If no direct .mp4 found, maybe they are encoded or we need to refine the search.
    // Meta sometimes puts these inside deeply nested JSONs.
    // Try catching any URL string that has fbcdn and ends with something before "
    const wideSearch = /(https?:\/\/[a-zA-Z0-9-.]+\.fbcdn\.net\/v\/[a-zA-Z0-9-_/.]+\.mp4[^"'\\]*)/gi;
    match = wideSearch.exec(html);

    if (match && match[1]) {
        return res.status(200).json({ videoUrl: match[1] });
    }

    // One more try looking for unescaped URLs
    const unescapedRegex = /https:\/\/[^"'\s]+\.fbcdn\.net[^"'\s]+\.mp4[^"'\s]*/gi;
    match = unescapedRegex.exec(html);
    if(match && match[0]) {
        return res.status(200).json({ videoUrl: match[0] });
    }

    return res.status(404).json({ error: 'No se pudo encontrar la URL del video en la página.' });

  } catch (error: any) {
    console.error('Error extracting video URL:', error);
    return res.status(500).json({ error: 'Error procesando la solicitud', details: error.message });
  }
}
