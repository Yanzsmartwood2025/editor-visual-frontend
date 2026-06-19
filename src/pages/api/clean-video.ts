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
    console.log("Iniciando Protocolo de Enlace en la Nube...");

    // 1. Cargar todas las llaves blindadas
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error("ERROR CRÍTICO: Llaves de Supabase ausentes.");
      return res.status(500).json({ error: 'El servidor no encuentra las coordenadas de Supabase.' });
    }

    // 2. Conectar al nodo de Supabase
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 3. Atrapar el video (Ya funciona perfecto)
    const form = formidable({
      keepExtensions: true, 
      maxFileSize: 50 * 1024 * 1024, 
    });

    const [, files] = await form.parse(req);
    const videoUpload = Array.isArray(files.video) ? files.video[0] : files.video;

    if (!videoUpload) {
      return res.status(400).json({ error: 'Video no detectado.' });
    }

    console.log("Video interceptado. Transfiriendo a la bóveda de Supabase...");

    // 4. Leer el archivo atrapado y subirlo al Bucket
    const fileContent = fs.readFileSync(videoUpload.filepath);
    const nombreUnico = `video-${Date.now()}.mp4`; // Le damos un número único para no sobreescribir

    const { data, error: uploadError } = await supabase.storage
      .from('temp-videos') // Asegúrate de que el bucket en Supabase se llame exactamente así
      .upload(nombreUnico, fileContent, {
        contentType: 'video/mp4',
        upsert: true
      });

    if (uploadError) {
      console.error("Fallo la inyección a Supabase:", uploadError);
      throw new Error("Supabase rechazó el archivo.");
    }

    // 5. Extraer la URL Pública (El eslabón que necesitábamos para las IAs)
    const { data: urlData } = supabase.storage
      .from('temp-videos')
      .getPublicUrl(nombreUnico);

    const enlacePublico = urlData.publicUrl;
    console.log(`¡Puente establecido! El video está vivo en: ${enlacePublico}`);

    // 6. Destruir la evidencia local para no saturar Coolify
    fs.unlinkSync(videoUpload.filepath);

    return res.status(200).json({ 
      success: true, 
      message: 'Video subido a la nube correctamente.',
      url: enlacePublico,
      status: 'URL_READY'
    });

  } catch (error) {
    console.error("Colapso en la cadena de subida:", error);
    return res.status(500).json({ error: 'Error interno en la conexión con Supabase.' });
  }
}
