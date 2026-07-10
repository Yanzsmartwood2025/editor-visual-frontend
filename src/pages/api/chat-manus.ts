import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt es requerido.' });
  }

  const lowerPrompt = prompt.toLowerCase();

  // Mock response logic based on the user's prompt
  try {
    // Si el usuario pide procesar un enlace específico con tiempos o un clip de youtube
    if (lowerPrompt.includes('youtube.com') || lowerPrompt.includes('youtu.be') || lowerPrompt.includes('clip')) {

        // Simular extraer una URL del prompt (esto es un mock muy básico)
        const urlMatch = prompt.match(/(https?:\/\/[^\s]+)/);
        const videoUrl = urlMatch ? urlMatch[0] : "https://www.youtube.com/watch?v=aqz-KE-bpKQ"; // Fallback URL

        return res.status(200).json({
          text: `Entendido. He procesado tu solicitud y he generado el clip curado que pediste de ${videoUrl}. Lo he enviado a tu bodega.`,
          action: "CLIP_VIDEO",
          payload: {
            url: videoUrl,
            start: "00:00:10", // Mock start time
            end: "00:00:25",   // Mock end time
            title: "Clip Curado por Manus",
            auto_add_to_timeline: true
          }
        });
    } else {
        // Respuesta normal de chat si no hay intención de clip
        return res.status(200).json({
          text: `Hola, soy Manus. He analizado tu mensaje: "${prompt}". ¿En qué más puedo ayudarte con la curaduría de contenido hoy? Puedes pedirme que extraiga clips de URLs específicas.`,
        });
    }

  } catch (error: any) {
    console.error('[chat-manus] Error procesando el chat:', error);
    return res.status(500).json({ error: 'Error interno en el chat de Manus.', details: error.message });
  }
}
