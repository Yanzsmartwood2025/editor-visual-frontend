import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { registrarMemoriaUniversal } from '../../utils/memoriaUniversal';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, email, personaje_id, contexto_programa } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Query es requerido.' });
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
      .select('api_key')
      .eq('service_provider', 'pixabay')
      .limit(1)
      .single();

    if (keyError || !keyData?.api_key) {
        return res.status(500).json({ error: 'No se encontró la llave de API para Pixabay.' });
    }

    const pixabayKey = keyData.api_key;

    const pixabayUrl = `https://pixabay.com/api/videos/?key=${pixabayKey}&q=${encodeURIComponent(query)}&per_page=3`;
    const pixabayRes = await fetch(pixabayUrl);

    if (!pixabayRes.ok) {
        throw new Error(`Error en Pixabay API: ${pixabayRes.status}`);
    }

    const data = await pixabayRes.json();
    const hits = data.hits || [];

    if (hits.length === 0) {
        return res.status(404).json({ error: 'No se encontraron videos para esa búsqueda.' });
    }

    const resultados = [];

    for (const hit of hits) {
        // Encontrar el mejor video, por ejemplo 'medium' o el que esté disponible
        const videoFiles = hit.videos;
        const videoObj = videoFiles.medium || videoFiles.large || videoFiles.small;
        const videoUrl = videoObj?.url;

        if (!videoUrl) continue;

        try {
            const fileName = `pixabay-video-${Date.now()}-${Math.floor(Math.random() * 1000)}.mp4`;

            // Realizamos la insercion del publicUrl de Supabase
            // Nota: En la bodega se pide insertar en memoria_nayla pero para los videos, en lugar de descargar todo en el serverless func (riesgo OOM de Node.js)
            // Subimos directamente o lo metemos. Si fallamos, le damos un public URL directo, pero lo mejor es fetch and upload si no son super gigantes o usar proxy.
            // Para mantener la lógica sencilla y dado que Vercel permite descargas si no son mas de 50MB, intentamos fetch simple.

            const videoFetchRes = await fetch(videoUrl);
            const videoBlob = await videoFetchRes.blob();
            const arrayBuffer = await videoBlob.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const { error: uploadError } = await supabase.storage
                .from('media_bodega')
                .upload(fileName, buffer, {
                    contentType: 'video/mp4',
                    upsert: true
                });

            if (uploadError) {
                console.error("Error subiendo video a Supabase:", uploadError);
                continue;
            }

            const { data: publicUrlData } = supabase.storage
                .from('media_bodega')
                .getPublicUrl(fileName);

            const finalUrl = publicUrlData.publicUrl;

            try {
                await registrarMemoriaUniversal(supabase, {
                    url: finalUrl,
                    tipo: 'video',
                    nombre: `Pixabay Video: ${query}`,
                    estado: 'completado',
                    metadata: { originalUrl: videoUrl, source: 'pixabay' },
                    personaje_id: personaje_id || 'Nayla',
                    contexto_programa: contexto_programa || `Búsqueda de videos stock: ${query}`
                });
                resultados.push(finalUrl);
            } catch (dbError) {
                console.error("Error registrando en memoria universal:", dbError);
            }
        } catch (downloadError) {
             console.error("Error procesando video individual:", downloadError);
        }
    }

    res.status(200).json({ urls: resultados, message: 'Videos procesados exitosamente.' });

  } catch (error: any) {
    console.error("Error en buscar-videos-stock:", error);
    res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
}
