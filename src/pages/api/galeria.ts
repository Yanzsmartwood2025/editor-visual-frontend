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
        .from('galeria_multimedia')
        .select('*')
        .eq('user_id', user.uid)
        .order('creado_en', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ data });
    }

    if (req.method === 'POST') {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!items.length) return res.status(400).json({ error: 'Se requiere al menos un elemento de galería.' });
      const { data, error } = await supabase
        .from('galeria_multimedia')
        .insert(items.map((item: Record<string, unknown>) => {
          const itemForUser = { ...item };
          delete itemForUser.user_id;
          return { ...itemForUser, user_id: user.uid };
        }))
        .select();
      if (error) throw error;
      return res.status(201).json({ data });
    }

    if (req.method === 'PATCH') {
      const { id, nombre } = req.body || {};
      if (typeof id !== 'string' || typeof nombre !== 'string') return res.status(400).json({ error: 'Se requieren id y nombre.' });
      const { error } = await supabase
        .from('galeria_multimedia')
        .update({ nombre })
        .eq('id', id)
        .eq('user_id', user.uid);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id: unknown): id is string => typeof id === 'string') : [];
      if (!ids.length) return res.status(400).json({ error: 'Se requiere al menos un id.' });
      const { error } = await supabase
        .from('galeria_multimedia')
        .delete()
        .in('id', ids)
        .eq('user_id', user.uid);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (error: unknown) {
    const message = error instanceof Error
      ? error.message
      : (typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : 'Error interno del servidor.');
    const status = message.includes('token') || message.includes('Bearer') || message.includes('Firebase') ? 401 : 500;
    console.error('Error en /api/galeria:', error);
    return res.status(status).json({ error: message });
  }
}
