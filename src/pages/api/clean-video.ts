// [BOTÓN DE COPIAR]
import type { NextApiRequest, NextApiResponse } from 'next';

// Desactivamos el analizador por defecto para permitir archivos binarios
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Comando denegado. Se requiere POST.' });
  }

  try {
    // Aquí interceptaremos el stream del video para Fal.ai
    // Simulación de carga estable
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return res.status(200).json({ success: true, message: 'Datos multimedia recibidos en el servidor' });
  } catch (error) {
    console.error("Fallo de red en el puente trasero:", error);
    return res.status(500).json({ error: 'Colapso interno del servidor' });
  }
}
