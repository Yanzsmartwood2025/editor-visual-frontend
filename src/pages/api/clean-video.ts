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

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Llaves de Supabase ausentes.' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const form = formidable({
      keepExtensions: true, 
      maxFileSize: 50 * 1024 * 1024, 
    });

    const [, files] = await form.parse(req);
    const videoUpload = Array.isArray(files.video) ? files.video[0] : files.video;

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

    if (uploadError) {
      throw new Error("Supabase rechazó el archivo.");
    }

    const { data: urlData } = supabase.storage
      .from('temp-videos')
      .getPublicUrl(nombreUnico);

    fs.unlinkSync(videoUpload.filepath);

    const videoUrl = urlData.publicUrl;
    console.log("Video anclado. URL lista para las IAs:", videoUrl);

    // --- INICIO DEL MÓDULO ESCÁNER (REPLICATE) ---
    // Si la llave de Replicate no está en Coolify, frenamos aquí con éxito parcial
    if (!replicateToken) {
      return res.status(200).json({ 
        success: true, 
        url: videoUrl,
        status: 'URL_READY_NO_SCANNER'
      });
    }

    const replicateResponse = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Token ${replicateToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // El ID del cerebro de IA que hará el trabajo
        version: "ID_DEL_MODELO_AQUI", 
        input: {
          video: videoUrl
        }
      })
    });

    const replicateData = await replicateResponse.json();

    return res.status(200).json({ 
      success: true, 
      url: videoUrl,
      replicate_status: replicateData.status,
      scanner_id: replicateData.id
    });

  } catch (error) {
    console.error("Error en la tubería principal:", error);
    return res.status(500).json({ error: 'Error interno en la conexión con Supabase o Replicate.' });
  }
}
