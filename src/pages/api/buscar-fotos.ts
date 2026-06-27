import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query, email } = req.body;

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
    // 1. Extraer la API key de Pixabay de Supabase
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

    // 2. Buscar fotos en Pixabay
    const pixabayUrl = `https://pixabay.com/api/?key=${pixabayKey}&q=${encodeURIComponent(query)}&image_type=photo&per_page=5`;
    const pixabayRes = await fetch(pixabayUrl);

    if (!pixabayRes.ok) {
        throw new Error(`Error en Pixabay API: ${pixabayRes.status}`);
    }

    const data = await pixabayRes.json();
    const hits = data.hits || [];

    if (hits.length === 0) {
        return res.status(404).json({ error: 'No se encontraron fotos para esa búsqueda.' });
    }

    const resultados = [];

    // 3. Procesar resultados y subirlos a Supabase
    for (const hit of hits) {
        const imageUrl = hit.largeImageURL || hit.webformatURL;
        if (!imageUrl) continue;

        try {
            const imageRes = await fetch(imageUrl);
            const imageBlob = await imageRes.blob();
            const arrayBuffer = await imageBlob.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            const fileName = `pixabay-foto-${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;

            const { error: uploadError } = await supabase.storage
                .from('media_bodega')
                .upload(fileName, buffer, {
                    contentType: 'image/jpeg',
                    upsert: true
                });

            if (uploadError) {
                console.error("Error subiendo foto a Supabase:", uploadError);
                continue;
            }

            const { data: publicUrlData } = supabase.storage
                .from('media_bodega')
                .getPublicUrl(fileName);

            const finalUrl = publicUrlData.publicUrl;

            // 4. Insertar en memoria_nayla o galeria_multimedia para que el frontend lo detecte
            // El frontend usa la tabla memoria_nayla para auto-ingestar, según la memoria:
            // "The frontend UI polls this table (public.memoria_nayla) every 5 seconds..."
            const { error: dbError } = await supabase
                .from('memoria_nayla')
                .insert({
                    url: finalUrl,
                    tipo: 'foto',
                    nombre: `Pixabay Foto: ${query}`,
                    estado: 'completado'
                });

            if (!dbError) {
                resultados.push(finalUrl);
            }
        } catch (downloadError) {
             console.error("Error procesando imagen individual:", downloadError);
        }
    }

    res.status(200).json({ urls: resultados, message: 'Fotos procesadas exitosamente.' });

  } catch (error: any) {
    console.error("Error en buscar-fotos:", error);
    res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
}
