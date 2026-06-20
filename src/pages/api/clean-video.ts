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
    const falKey = process.env.FAL_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Llaves de almacenamiento (Supabase) ausentes.' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const form = formidable({
      keepExtensions: true, 
      maxFileSize: 50 * 1024 * 1024, 
    });

    const [fields, files] = await form.parse(req);
    const videoUpload = Array.isArray(files.video) ? files.video[0] : files.video;
    
    const coordenadasRaw = Array.isArray(fields.coordenadas) ? fields.coordenadas[0] : fields.coordenadas;
    const coordenadas = coordenadasRaw ? JSON.parse(coordenadasRaw) : [];

    if (!videoUpload) {
      return res.status(400).json({ error: 'Video no detectado.' });
    }

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

    fs.unlinkSync(videoUpload.filepath);
    const videoUrl = urlData.publicUrl;
    const maskBoxes = coordenadas.map((c: any) => [c.x, c.y, c.width, c.height]);

    // --- MOTOR PRINCIPAL: REPLICATE ---
    if (replicateToken) {
      console.log("Intentando procesar con Replicate...");
      const replicateResponse = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          "Authorization": `Token ${replicateToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          version: "ccb3b1e360fbfbc7e5cfa8e718873fb2a20fc1d0c5a2c27732a31dcce411bd13", 
          input: {
            video: videoUrl,
            masks: JSON.stringify(maskBoxes)
          }
        })
      });

      const replicateData = await replicateResponse.json();

      if (replicateResponse.ok) {
        return res.status(200).json({ 
          success: true, 
          motor: 'replicate',
          url: videoUrl,
          prediction_id: replicateData.id,
          status: replicateData.status
        });
      } else {
        console.warn("Replicate falló. Motivo:", replicateData.detail || "Desconocido");
        // Si falla, dejamos que el código siga hacia el Motor Secundario (FAL)
      }
    }

    // --- MOTOR SECUNDARIO: FAL.AI (Respaldo) ---
    if (falKey) {
      console.log("Replicate falló o no tiene llave. Activando rotación a FAL...");
      
      // Nota técnica: Aquí usamos un endpoint genérico de FAL. Dependiendo del modelo exacto de FAL que vayas a usar para video inpainting, esta URL podría necesitar un ajuste.
      const falResponse = await fetch("https://queue.fal.run/fal-ai/fast-video-inpaint", {
        method: "POST",
        headers: {
          "Authorization": `Key ${falKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          video_url: videoUrl,
          mask_coordinates: maskBoxes
        })
      });

      const falData = await falResponse.json();

      if (falResponse.ok) {
         return res.status(200).json({ 
          success: true, 
          motor: 'fal',
          url: videoUrl,
          prediction_id: falData.request_id,
          status: 'processing'
        });
      } else {
        throw new Error("Ambos motores de IA (Replicate y FAL) rechazaron la orden.");
      }
    }

    throw new Error("No hay llaves configuradas para ninguna inteligencia artificial.");

  } catch (error) {
    console.error("Error crítico en la tubería:", error);
    return res.status(500).json({ error: 'Error interno del servidor. Revisa los logs.' });
  }
}
