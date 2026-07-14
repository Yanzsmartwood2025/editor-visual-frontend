import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // La UI pasa fotoBaseUrl, prompt, email
  const { prompt, email } = req.body;

  if (!prompt || !email) {
    return res.status(400).json({ error: 'El prompt y el email son requeridos.' });
  }

  if (email !== 'ajn.liq.128@proton.me') {
    return res.status(403).json({ error: 'Acceso denegado. Se requiere cuenta de administrador.' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Llaves de base de datos ausentes.' });
  }

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

    console.log(`[ia-fotos] Buscando en Pixabay con prompt "${prompt}"`);

    const pixabayUrl = `https://pixabay.com/api/?key=${pixabayKey}&q=${encodeURIComponent(prompt)}&image_type=photo&per_page=3`;
    const pixabayRes = await fetch(pixabayUrl);

    if (!pixabayRes.ok) {
        throw new Error(`Error en Pixabay API: ${pixabayRes.status}`);
    }

    const data = await pixabayRes.json();
    const hits = data.hits || [];

    if (hits.length === 0) {
        return res.status(404).json({ error: 'No se encontraron resultados en Pixabay para ese prompt.' });
    }

    const bestImageUrl = hits[0].largeImageURL || hits[0].webformatURL;

    res.status(200).json({ url: bestImageUrl, message: 'Foto obtenida de Pixabay exitosamente' });

  } catch (error: any) {
    console.error("Error en ia-fotos:", error);
    res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
}
