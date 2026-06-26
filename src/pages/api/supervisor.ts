import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { videoUrl, startTime, endTime, clipName } = req.body;

    if (!videoUrl || startTime === undefined || endTime === undefined) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos: videoUrl, startTime, endTime' });
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No authorization header provided' });
        }

        const token = authHeader.split(' ')[1] || '';
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || user?.email !== 'ajn.liq.128@proton.me') {
             return res.status(403).json({ error: 'No autorizado. Solo el administrador puede acceder a Oracle.' });
        }

        // 2. Extraer GEMINI_API_KEY y credenciales desde public.api_keys_pool
        const { data: keys, error: keysError } = await supabase
            .from('api_keys_pool')
            .select('*')
            .eq('service_provider', 'gemini')
            .eq('resource_type', 'ia')
            .single();

        if (keysError || !keys) {
            console.error('Error fetching Gemini API Key from pool:', keysError);
        }

        const geminiKey = keys ? keys.api_key : process.env.GEMINI_API_KEY;

        // 3. Disparar orden asíncrona hacia el servidor de Oracle
        const oracleServerUrl = process.env.ORACLE_SERVER_URL;
        const oracleSecret = process.env.ORACLE_SECRET;

        if (!oracleServerUrl || !oracleSecret) {
            return res.status(500).json({ error: 'El puente hacia Oracle no está configurado (ORACLE_SERVER_URL / ORACLE_SECRET)' });
        }

        const oracleEndpoint = `${oracleServerUrl}/api/process-clip`;

        const response = await fetch(oracleEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${oracleSecret}`
            },
            body: JSON.stringify({
                videoUrl,
                startTime,
                endTime,
                clipName,
                geminiApiKey: geminiKey
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("Oracle API Error:", data);
            return res.status(response.status).json({ error: data.error || 'Error en el servidor de Oracle' });
        }

        res.status(202).json({ message: 'Orden enviada a Oracle exitosamente', oracleResponse: data });

    } catch (error: unknown) {
        console.error("Oracle Bridge Error:", error);
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
}
