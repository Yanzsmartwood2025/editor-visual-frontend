// [BOTÓN DE COPIAR]
import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';

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
    console.log("Iniciando Protocolo de Recepción de Archivos...");

    const falKey = process.env.FAL_KEY;
    const replicateKey = process.env.REPLICATE_API_TOKEN;

    if (!falKey || !replicateKey) {
      console.error("ERROR CRÍTICO: Faltan llaves en el servidor.");
      return res.status(500).json({ error: 'Llaves no configuradas.' });
    }

    const form = formidable({
      keepExtensions: true, 
      maxFileSize: 50 * 1024 * 1024, 
    });

    // SOLUCIÓN APLICADA: Omitimos 'fields' dejando el espacio vacío antes de la coma
    const [, files] = await form.parse(req);
    
    const videoUpload = Array.isArray(files.video) ? files.video[0] : files.video;

    if (!videoUpload) {
      return res.status(400).json({ error: 'No se detectó ningún archivo de video en la transmisión.' });
    }

    console.log("=========================================");
    console.log(`¡VIDEO ATRAPADO CON ÉXITO!`);
    console.log(`Nombre original: ${videoUpload.originalFilename}`);
    console.log(`Peso del archivo: ${(videoUpload.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Ruta temporal en el servidor: ${videoUpload.filepath}`);
    console.log("=========================================");
    
    fs.unlinkSync(videoUpload.filepath);

    return res.status(200).json({ 
      success: true, 
      message: 'Video recibido, analizado y listo para la fase de IA.',
      status: 'FILE_RECEIVED'
    });

  } catch (error) {
    console.error("Fallo general en la recepción del archivo:", error);
    return res.status(500).json({ error: 'Colapso interno al procesar el archivo multimedia.' });
  }
}
