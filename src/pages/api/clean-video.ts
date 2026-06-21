import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

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
    
    // Leemos si el usuario presionó el botón de "Local" o "Nube"
    const motorDeseadoRaw = Array.isArray(fields.motor) ? fields.motor[0] : fields.motor;
    const motorDeseado = motorDeseadoRaw || 'nube'; // Por defecto se va a la nube

    if (!videoUpload) {
      return res.status(400).json({ error: 'Video no detectado.' });
    }

    // ============================================================================
    // 🛠️ MOTOR 1: PROCESAMIENTO LOCAL (FFMPEG)
    // ============================================================================
    if (motorDeseado === 'local') {
      console.log("Iniciando procesamiento LOCAL con FFMPEG...");
      
      const outputPath = path.join(os.tmpdir(), `cleaned-${Date.now()}.mp4`);
      
      // Armamos los filtros de difuminado (delogo) usando las coordenadas del frontend
      let filterString = '';
      if (coordenadas.length > 0) {
        filterString = coordenadas.map((c: any) => 
          // AQUÍ ESTÁ EL AJUSTE: Añadimos :band=10 para suavizar los bordes
          `delogo=x=${Math.floor(c.x)}:y=${Math.floor(c.y)}:w=${Math.floor(c.width)}:h=${Math.floor(c.height)}:band=10`
        ).join(',');
      } else {
        // Coordenadas de emergencia con suavizado
        filterString = 'delogo=x=750:y=200:w=250:h=90:band=10,delogo=x=400:y=1700:w=280:h=90:band=10';
      }

      // AQUÍ ESTÁ EL AJUSTE DE CALIDAD: -y (sobreescribir), -crf 18 (alta calidad), -preset slow (mejor compresión)
      const comando = `ffmpeg -y -i "${videoUpload.filepath}" -vf "${filterString}" -c:v libx264 -preset slow -crf 18 -c:a copy "${outputPath}"`;

      try {
        // Ejecutamos el comando FFMPEG en tu servidor Coolify
        await execPromise(comando);

        // Subimos EL RESULTADO ya limpio a Supabase
        const fileContentLocal = fs.readFileSync(outputPath);
        const localUploadName = `video-local-${Date.now()}.mp4`;

        const { error: localUploadError } = await supabase.storage
          .from('temp-videos')
          .upload(localUploadName, fileContentLocal, {
            contentType: 'video/mp4',
            upsert: true
          });

        if (localUploadError) throw new Error("Supabase rechazó el archivo local.");

        const { data: localUrlData } = supabase.storage
          .from('temp-videos')
          .getPublicUrl(localUploadName);

        // Limpieza de tu disco duro
        fs.unlinkSync(videoUpload.filepath);
        fs.unlinkSync(outputPath);

        return res.status(200).json({ 
          success: true, 
          motor: 'local_ffmpeg',
          url: localUrlData.publicUrl,
          status: 'succeeded' // El local termina instantáneamente, no hay que esperar predicción
        });

      } catch (localError) {
        console.error("FFMPEG falló localmente:", localError);
        if (fs.existsSync(videoUpload.filepath)) fs.unlinkSync(videoUpload.filepath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        throw new Error("Fallo en el procesamiento local. ¿Está instalado ffmpeg en el Docker?");
      }
    }

    // ============================================================================
    // ☁️ MOTOR 2: PROCESAMIENTO EN LA NUBE (REPLICATE / FAL)
    // ============================================================================
    
    // Si llegamos aquí, es porque motorDeseado === 'nube'.
    // Subimos el archivo ORIGINAL a Supabase para que la IA lo pueda leer.
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

    fs.unlinkSync(videoUpload.filepath); // Limpiamos el original del servidor local
    const videoUrl = urlData.publicUrl;
    const maskBoxes = coordenadas.map((c: any) => [c.x, c.y, c.width, c.height]);

    // --- REPLICATE ---
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
      }
    }

    // --- FAL.AI (Respaldo) ---
    if (falKey) {
      console.log("Activando rotación a FAL...");
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
