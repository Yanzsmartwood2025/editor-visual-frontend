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
      .eq('service_provider', 'newsapi')
      .limit(1)
      .single();

    if (keyError || !keyData?.api_key) {
        return res.status(500).json({ error: 'No se encontró la llave de API para NewsAPI.' });
    }

    const newsApiKey = keyData.api_key;

    const newsUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&apiKey=${newsApiKey}&pageSize=5`;
    const newsRes = await fetch(newsUrl);
    const data = await newsRes.json();

    if (data.status !== 'ok' || !data.articles || data.articles.length === 0) {
        return res.status(404).json({ error: 'No se encontraron noticias para esa búsqueda.' });
    }

    const resultados = [];

    // Descargamos las imágenes de las noticias y las agregamos a la bodega
    for (const article of data.articles) {
        const imageUrl = article.urlToImage;
        if (!imageUrl) continue;

        try {
            const imgFetchRes = await fetch(imageUrl);
            const imgBlob = await imgFetchRes.blob();
            const arrayBuffer = await imgBlob.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const fileName = `news-${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;

            const { error: uploadError } = await supabase.storage
                .from('media_bodega')
                .upload(fileName, buffer, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (uploadError) {
                console.error("Error subiendo foto de noticia a Supabase:", uploadError);
                continue;
            }

            const { data: publicUrlData } = supabase.storage
                .from('media_bodega')
                .getPublicUrl(fileName);

            const finalUrl = publicUrlData.publicUrl;

            // Extraemos un pedacito de texto para ponerle de título a la imagen en la bodega
            const title = article.title ? article.title.substring(0, 30) : query;

            try {
                await registrarMemoriaUniversal(supabase, {
                    url: finalUrl,
                    tipo: 'foto',
                    nombre: `Noticia: ${title}`,
                    estado: 'completado',
                    metadata: { originalUrl: imageUrl, source: 'newsapi', articleUrl: article.url },
                    personaje_id: personaje_id || 'Nayla',
                    contexto_programa: contexto_programa || `Búsqueda de noticias: ${query}`
                });
                resultados.push(finalUrl);
            } catch (dbError) {
                console.error("Error registrando en memoria universal:", dbError);
            }
        } catch (downloadError) {
             console.error("Error procesando imagen de noticia:", downloadError);
        }
    }

    res.status(200).json({ urls: resultados, message: 'Imágenes de noticias procesadas exitosamente.' });

  } catch (error: any) {
    console.error("Error en buscar-noticias:", error);
    res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
}
