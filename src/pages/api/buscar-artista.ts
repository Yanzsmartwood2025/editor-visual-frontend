import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { nombre, email } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: 'El nombre del artista es requerido.' });
  }

  if (email !== 'ajn.liq.128@proton.me') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador.' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { data: keyData, error: keyError } = await supabase
      .from('api_keys_pool')
      .select('api_key, model_or_voice_id')
      .eq('service_provider', 'lastfm')
      .limit(1)
      .single();

    if (keyError || !keyData?.api_key) {
        return res.status(500).json({ error: 'No se encontró la llave de API para Last.fm.' });
    }

    const lastFmKey = keyData.api_key;
    // Shared secret en model_or_voice_id (no es estrictamente necesario para las llamadas públicas pero lo extraemos)
    // const sharedSecret = keyData.model_or_voice_id;

    // Llamada 1: artist.getInfo
    const infoUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=${encodeURIComponent(nombre)}&api_key=${lastFmKey}&format=json`;
    const infoRes = await fetch(infoUrl);
    const infoData = await infoRes.json();

    // Llamada 2: artist.getTopAlbums
    const albumsUrl = `https://ws.audioscrobbler.com/2.0/?method=artist.gettopalbums&artist=${encodeURIComponent(nombre)}&api_key=${lastFmKey}&format=json`;
    const albumsRes = await fetch(albumsUrl);
    const albumsData = await albumsRes.json();

    const imageUrlsToProcess: string[] = [];

    // Extraer imagen del artista (si la hay)
    // Last.fm a veces no trae fotos de artista directamente debido a cambios en su API, pero intentamos extraerlas si están presentes.
    if (infoData?.artist?.image) {
        const bestImage = infoData.artist.image.find((img: any) => img.size === 'extralarge') || infoData.artist.image[infoData.artist.image.length - 1];
        if (bestImage && bestImage['#text']) {
            imageUrlsToProcess.push(bestImage['#text']);
        }
    }

    // Extraer portadas de álbumes
    if (albumsData?.topalbums?.album) {
        const albums = albumsData.topalbums.album.slice(0, 5); // top 5 albums
        for (const album of albums) {
            if (album.image) {
                const bestImage = album.image.find((img: any) => img.size === 'extralarge') || album.image.find((img: any) => img.size === 'large');
                if (bestImage && bestImage['#text']) {
                    imageUrlsToProcess.push(bestImage['#text']);
                }
            }
        }
    }

    if (imageUrlsToProcess.length === 0) {
        return res.status(404).json({ error: 'No se encontraron imágenes para este artista.' });
    }

    const resultados = [];

    // Subir imágenes a Supabase
    for (const imgUrl of imageUrlsToProcess) {
        if (!imgUrl) continue;

        try {
            const imgFetchRes = await fetch(imgUrl);
            const imgBlob = await imgFetchRes.blob();
            const arrayBuffer = await imgBlob.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const fileName = `lastfm-${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;

            const { error: uploadError } = await supabase.storage
                .from('media_bodega')
                .upload(fileName, buffer, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (uploadError) {
                console.error("Error subiendo foto de Last.fm a Supabase:", uploadError);
                continue;
            }

            const { data: publicUrlData } = supabase.storage
                .from('media_bodega')
                .getPublicUrl(fileName);

            const finalUrl = publicUrlData.publicUrl;

            const { error: dbError } = await supabase
                .from('memoria_nayla')
                .insert({
                    url: finalUrl,
                    tipo: 'foto',
                    nombre: `Last.fm: ${nombre}`,
                    estado: 'completado'
                });

            if (!dbError) {
                resultados.push(finalUrl);
            }
        } catch (downloadError) {
             console.error("Error procesando imagen de Last.fm:", downloadError);
        }
    }

    res.status(200).json({ urls: resultados, message: 'Imágenes del artista procesadas exitosamente.' });

  } catch (error: any) {
    console.error("Error en buscar-artista:", error);
    res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
}
