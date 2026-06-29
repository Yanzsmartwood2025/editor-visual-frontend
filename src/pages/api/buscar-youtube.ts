import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Función para convertir duración ISO 8601 a string legible (ej: PT1H2M10S -> 1:02:10)
function parseISO8601Duration(duration: string) {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);

  if (!match) return '0:00';

  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, email } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query es requerido.' });
  }

  // Se permite que Supervisor IA pase este email y es la capa de proteccion actual según contexto (Toda IA feature en API lo requiere)
  if (email !== 'ajn.liq.128@proton.me') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador.' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys_pool')
      .select('api_key')
      .eq('service_provider', 'youtube')
      .limit(1)
      .single();

    if (keyError || !keyData?.api_key) {
        return res.status(500).json({ error: 'No se encontró la llave de API para YouTube.' });
    }

    const youtubeApiKey = keyData.api_key;

    // Llamada 1: Buscar videos
    const youtubeSearchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&type=video&key=${youtubeApiKey}`;
    const searchRes = await fetch(youtubeSearchUrl);

    if (!searchRes.ok) {
        throw new Error(`Error en YouTube API (search): ${searchRes.status}`);
    }

    const searchData = await searchRes.json();
    const items = searchData.items || [];

    if (items.length === 0) {
        return res.status(404).json({ error: 'No se encontraron videos para esa búsqueda.' });
    }

    // Extraer los IDs para obtener la duración
    const videoIds = items.map((item: any) => item.id.videoId).join(',');

    // Llamada 2: Obtener detalles del video (duración)
    const youtubeVideosUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds}&key=${youtubeApiKey}`;
    const videosRes = await fetch(youtubeVideosUrl);

    if (!videosRes.ok) {
         throw new Error(`Error en YouTube API (videos): ${videosRes.status}`);
    }

    const videosData = await videosRes.json();

    // Mapear duraciones por ID
    const durationMap: Record<string, string> = {};
    if (videosData.items) {
        for (const video of videosData.items) {
             durationMap[video.id] = video.contentDetails.duration;
        }
    }

    const resultados = items.map((item: any) => {
      const vId = item.id.videoId;
      const rawDuration = durationMap[vId] || 'PT0S';
      const formattedDuration = parseISO8601Duration(rawDuration);

      return {
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
        videoId: vId,
        url: `https://www.youtube.com/watch?v=${vId}`,
        duracion: formattedDuration,
        channelTitle: item.snippet.channelTitle
      };
    });

    res.status(200).json({
        resultados,
        message: 'Búsqueda en YouTube exitosa.'
    });

  } catch (error: any) {
    console.error("Error en buscar-youtube:", error);
    res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
}
