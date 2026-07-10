import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { registrarMemoriaUniversal, RegistrarMemoriaParams } from '../../utils/memoriaUniversal';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authHeader = req.headers.authorization;
    // Permitir auth via Oracle Secret (para el microservicio) o validar que es una llamada interna/admin
    const ORACLE_SECRET = process.env.ORACLE_SECRET;
    const isOracleCall = authHeader === `Bearer ${ORACLE_SECRET}`;

    // Si no es el oráculo, verificamos si mandaron el email de admin
    const { email } = req.body;

    if (!isOracleCall && email !== 'ajn.liq.128@proton.me') {
        return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const { url, tipo, nombre, metadata, personaje_id, contexto_programa, estado } = req.body as RegistrarMemoriaParams;

    if (!url || !tipo || !nombre) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos (url, tipo, nombre).' });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';
    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const result = await registrarMemoriaUniversal(supabase, {
            url,
            tipo,
            nombre,
            metadata,
            personaje_id,
            contexto_programa,
            estado
        });

        res.status(200).json({ success: true, data: result });
    } catch (error: any) {
        console.error("Error en registrar-memoria API:", error);
        res.status(500).json({ error: error.message || 'Error interno del servidor.' });
    }
}
