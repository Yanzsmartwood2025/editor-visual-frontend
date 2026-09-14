import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { requireFirebaseUser } from '../../lib/firebaseAdmin';

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Supabase no está configurado para acceso de servidor.');
  return createClient(url, serviceRoleKey);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await requireFirebaseUser(req);
    const supabase = getSupabase();

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('proyectos_usuario')
        .select('linea_de_tiempo')
        .eq('user_id', user.uid)
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'PUT') {
      const { linea_de_tiempo, actualizado_en } = req.body || {};
      if (!Array.isArray(linea_de_tiempo) || typeof actualizado_en !== 'string') {
        return res.status(400).json({ error: 'Se requieren linea_de_tiempo y actualizado_en.' });
      }
      const { error } = await supabase
        .from('proyectos_usuario')
        .upsert({ user_id: user.uid, linea_de_tiempo, actualizado_en }, { onConflict: 'user_id' });
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor.';
    const status = message.includes('token') || message.includes('Bearer') || message.includes('Firebase') ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
