import { NextApiRequest, NextApiResponse } from 'next';
import { requireFirebaseUser } from '../../lib/firebaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { texto } = req.body;

  if (!texto) {
    return res.status(400).json({ error: 'Texto requerido.' });
  }

  try { await requireFirebaseUser(req); } catch { return res.status(401).json({ error: 'Token Firebase inválido.' }); }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Llaves de base de datos ausentes.' });
  }

  // const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // TODO: Implementar llamada real a servicio de Qwen3-TTS (Texto a voz) en Fase 2.
    // Por ahora retornamos un placeholder simulando un audio y limpiamos las dependencias viejas (Gemini).
    console.log(`[ia-audio] Procesando texto para audio de manera simulada`);

    // Placeholder URL para el audio generado
    const mockAudioUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

    res.status(200).json({ url: mockAudioUrl, message: 'Audio generado exitosamente (Placeholder)' });

  } catch (error: any) {
    console.error("Error en ia-audio:", error);
    res.status(500).json({ error: error.message || 'Error interno del servidor.' });
  }
}
