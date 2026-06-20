// [BOTÓN DE COPIAR]
import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false, 
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Comando denegado. Se requiere método POST.' });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const replicateToken = process.env.REPLICATE_API_TOKEN;

    if (!supabaseUrl || !supabaseKey || !replicateToken) {
      return res.status(500).json({ error: 'Llaves maestras ausentes en el servidor.' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const form = formidable({
      keepExtensions: true, 
      maxFileSize: 50 * 1024 * 1024, 
    });

    // 1. Extraemos tanto el archivo (files) como los datos de texto (fields)
    const [fields, files] = await form.parse(req);
    const videoUpload = Array.isArray(files.video) ? files.video[0] : files.video;
    
    // Decodificamos los cuadros que dibujaste en la pantalla
    const coordenadasRaw = Array.isArray(fields.coordenadas) ? fields.coordenadas[0] : fields.coordenadas;
    const coordenadas = coordenadasRaw ? JSON.parse(coordenadasRaw) : [];

    if (!videoUpload) {
      return res.status(400).json({ error: 'Video no detectado.' });
    }

    // 2. Subimos el video a Supabase
    const fileContent = fs.readFileSync(videoUpload.filepath);
    const nombreUnico = `video-${Date.now()}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from('temp-videos')
      .upload(nombreUnico, fileContent, {
        contentType: 'video/mp4',
        upsert: true
      });

    if (uploadError) throw new Error("Supabase rechazó el archivo.");

    const { data: urlData } = supabase.storage
      .from('temp-videos')
      .getPublicUrl(nombreUnico);

    // Borramos el video local de Coolify para no llenar el disco duro
    fs.unlinkSync(videoUpload.filepath);

    const videoUrl = urlData.publicUrl;
    console.log(`Video anclado: ${videoUrl}`);
    console.log(`Marcas de agua detectadas: ${coordenadas.length}`, coordenadas);

    // 3. --- DISPARO A LA IA (REPLICATE) ---
    // Formateamos las coordenadas para que la IA las entienda (ej: [x, y, width, height])
    const maskBoxes = coordenadas.map((c: any) => [c.x, c.y, c.width, c.height]);

    const replicateResponse = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${replicateToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Este es el ID del modelo "ProPainter" (estándar de la industria para borrado de video)
        version: "ccb3b1e360fbfbc7e5cfa8e718873fb2a20fc1d0c5a2c27732a31dcce411bd13", 
        input: {
          video: videoUrl,
          masks: JSON.stringify(maskBoxes) // Le entregamos tus coordenadas
        }
      })
    });

    const replicateData = await replicateResponse.json();

    if (replicateResponse.ok) {
      // Éxito al contactar a la IA
      return res.status(200).json({ 
        success: true, 
        url: videoUrl,
        prediction_id: replicateData.id,
        status: replicateData.status
      });
    } else {
      console.error("Replicate rechazó la orden:", replicateData);
      throw new Error("Fallo en la comunicación con la IA.");
    }

  } catch (error) {
    console.error("Error en la tubería principal:", error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}
