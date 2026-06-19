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

    // SOLUCIÓN APLICADA: Eliminamos 'data' del desestructurado para que no sobre nada
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

    return res.status(200).json({ 
      success: true, 
      url: urlData.publicUrl,
      status: 'URL_READY'
    });

  } catch (error) {
    return res.status(500).json({ error: 'Error interno en la conexión con Supabase.' });
  }
}
