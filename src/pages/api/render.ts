import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: 'Llaves de Supabase ausentes.' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { pistaVideo } = req.body;

    if (!pistaVideo || pistaVideo.length === 0) {
      return res.status(400).json({ error: 'La pista de video está vacía.' });
    }

    console.log(`[NAYLA ENGINE] Iniciando renderizado de ${pistaVideo.length} clips...`);
    const jobId = Date.now().toString();
    const tmpDir = os.tmpdir();
    const archivosLocales: string[] = [];

    // 1. DESCARGAR LOS CLIPS A LA MEMORIA TEMPORAL DEL SERVIDOR
    for (let i = 0; i < pistaVideo.length; i++) {
      const clip = pistaVideo[i];
      if (clip.tipo !== 'video') continue; // Por ahora solo unimos videos
      
      const resArchivo = await fetch(clip.url);
      const buffer = await resArchivo.arrayBuffer();
      const rutaLocal = path.join(tmpDir, `clip_${jobId}_${i}.mp4`);
      
      fs.writeFileSync(rutaLocal, Buffer.from(buffer));
      archivosLocales.push(rutaLocal);
    }

    if (archivosLocales.length === 0) {
      return res.status(400).json({ error: 'No se encontraron videos válidos en la pista.' });
    }

    // 2. CREAR EL ARCHIVO DE INSTRUCCIONES PARA FFMPEG
    const listaTxtPath = path.join(tmpDir, `lista_${jobId}.txt`);
    const contenidoLista = archivosLocales.map(ruta => `file '${ruta}'`).join('\n');
    fs.writeFileSync(listaTxtPath, contenidoLista);

    // 3. EJECUTAR FFMPEG NATIVO PARA UNIR LOS VIDEOS (Concat Demuxer)
    const outputPath = path.join(tmpDir, `final_${jobId}.mp4`);
    const comando = `ffmpeg -y -f concat -safe 0 -i "${listaTxtPath}" -c copy "${outputPath}"`;

    await execPromise(comando);
    console.log(`[NAYLA ENGINE] Ensamblaje completado. Subiendo a Supabase...`);

    // 4. SUBIR EL RESULTADO A SUPABASE
    const fileContentFinal = fs.readFileSync(outputPath);
    const nombreFinal = `render-maestro-${jobId}.mp4`;

    const { error: uploadError } = await supabase.storage
      .from('temp-videos')
      .upload(nombreFinal, fileContentFinal, {
        contentType: 'video/mp4',
        upsert: true
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('temp-videos')
      .getPublicUrl(nombreFinal);

    // 5. LIMPIAR LA BASURA TEMPORAL
    archivosLocales.forEach(ruta => fs.unlinkSync(ruta));
    fs.unlinkSync(listaTxtPath);
    fs.unlinkSync(outputPath);

    return res.status(200).json({ 
      success: true, 
      url: urlData.publicUrl 
    });

  } catch (error: any) {
    console.error("[NAYLA ENGINE] Error crítico:", error);
    return res.status(500).json({ error: error.message || 'Error en el renderizado.' });
  }
}
