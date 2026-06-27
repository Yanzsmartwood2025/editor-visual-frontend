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
    const authHeader = req.headers.authorization || "";
    const token = authHeader.split(" ")[1] || "";

    if (!token) {
        return res.status(401).json({ error: "No authorization header provided" });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || user?.email !== "ajn.liq.128@proton.me") {
         return res.status(403).json({ error: "No autorizado. Solo el administrador puede acceder a Oracle." });
    }


    // Aceptamos tanto el flujo nuevo (prompt) como el flujo antiguo (videoUrl...)
    const { videoUrl, startTime, endTime, clipName, prompt, apiKey } = req.body;

    // Si viene prompt, es una llamada de Agente IA (prioridad 2)
    if (prompt) {
        try {
            // Se usa la api key enviada o se busca en BD si es admin
            let geminiKey = apiKey || process.env.GEMINI_API_KEY;

            // Si no hay key y hay auth, intentamos buscarla
            // (Para mantenerlo simple y como estaba en el flujo anterior)

            if (!geminiKey) {
                return res.status(400).json({ error: 'No se proporcionó API Key de Gemini' });
            }

            const systemPrompt = `Eres un agente clasificador para un editor de video.
El usuario te dará un prompt. Debes determinar si quiere BUSCAR un video en YouTube para agregarlo, o si quiere EDITAR la línea de tiempo.
Si quiere BUSCAR, devuelve un JSON con este formato exacto y NADA MAS: {"action": "search", "search_query": "consulta para youtube", "start_time": 0, "end_time": 10}
(Puedes inferir tiempos si el usuario los pide, si no usa 0 y 10).
Si quiere EDITAR, devuelve un JSON con formato: {"action": "code", "code": "NaylaEngine.agregarClip(...)"}`;

            const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    generationConfig: { responseMimeType: "application/json" }
                })
            });

            const geminiData = await geminiRes.json();
            if (!geminiRes.ok) throw new Error(geminiData.error?.message || 'Error en Gemini');

            const rawText = geminiData.candidates[0].content.parts[0].text;
            const parsed = JSON.parse(rawText);

            if (parsed.action === 'code') {
                return res.status(200).json({ code: parsed.code });
            }

            if (parsed.action === 'search') {
                const ytApiKey = process.env.YOUTUBE_API_KEY;
                if (!ytApiKey) {
                    return res.status(500).json({ error: 'YOUTUBE_API_KEY no está configurada en el servidor. El administrador debe agregarla en Vercel.' });
                }

                // Buscar en YouTube
                const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=${encodeURIComponent(parsed.search_query)}&type=video&key=${ytApiKey}`);
                const ytData = await ytRes.json();

                if (!ytRes.ok || !ytData.items || ytData.items.length === 0) {
                    return res.status(404).json({ error: 'No se encontraron videos en YouTube para esa búsqueda.' });
                }

                const videoId = ytData.items[0].id.videoId;
                const foundVideoUrl = `https://www.youtube.com/watch?v=${videoId}`;

                // Enviar a Oracle Service
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
                        videoUrl: foundVideoUrl,
                        startTime: parsed.start_time || 0,
                        endTime: parsed.end_time || 10,
                        clipName: ytData.items[0].snippet.title,
                        geminiApiKey: geminiKey
                    })
                });

                const data = await response.json();
                if (!response.ok) {
                    return res.status(response.status).json({ error: data.error || 'Error en el servidor de Oracle' });
                }

                return res.status(202).json({ action: 'search', message: 'Video encontrado en YouTube y enviado a procesar. Aparecerá en la bodega pronto.', url: foundVideoUrl });
            }

            return res.status(400).json({ error: 'Respuesta de IA no reconocida' });

        } catch (error: any) {
            console.error("IA Agent Error:", error);
            return res.status(500).json({ error: error.message || String(error) });
        }
    }

    // Si NO viene prompt, es el flujo original de puente directo
    if (!videoUrl || startTime === undefined || endTime === undefined) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos: videoUrl, startTime, endTime (o prompt para IA)' });
    }

    try {
        // 2. Extraer GEMINI_API_KEY y credenciales desde public.api_keys_pool
        const { data: keys } = await supabase
            .from('api_keys_pool')
            .select('*')
            .eq('service_provider', 'gemini')
            .eq('resource_type', 'ia')
            .single();

        const geminiKey = keys ? keys.api_key : process.env.GEMINI_API_KEY;

        // 3. Disparar orden asíncrona hacia el servidor de Oracle
        const oracleServerUrl = process.env.ORACLE_SERVER_URL;
        const oracleSecret = process.env.ORACLE_SECRET;

        if (!oracleServerUrl || !oracleSecret) {
            return res.status(500).json({ error: 'El puente hacia Oracle no está configurado' });
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
            return res.status(response.status).json({ error: data.error || 'Error en Oracle' });
        }

        res.status(202).json({ message: 'Orden enviada a Oracle exitosamente', oracleResponse: data });

    } catch (error: unknown) {
        console.error("Oracle Bridge Error:", error);
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
}
