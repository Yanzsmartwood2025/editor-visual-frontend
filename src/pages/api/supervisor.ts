import { NextApiRequest, NextApiResponse } from 'next';
// import { createClient } from '@supabase/supabase-js';

// The Oracle Microservice URL from environment variables, fallback for local dev
const ORACLE_SERVICE_URL = process.env.ORACLE_SERVICE_URL || 'http://localhost:4000';
const ORACLE_SECRET = process.env.ORACLE_SECRET || 'dev_oracle_secret';

// const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
// const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';
// const supabase = createClient(supabaseUrl, supabaseKey); // Supabase client is not directly used here since we proxy to Oracle

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Obtenemos los campos clave
  const { action, ...payload } = req.body;

  // 1. Acciones del Supervisor Clásico (El código IA antiguo, si lo requieren aún)
  if (action === 'generate_code') {
    return handleGenerateCode(req, res, payload);
  }

  // 2. Acciones Nuevas: Solicitar a Oracle extraer medios
  if (action === 'extract_media') {
    const { token, type, url, startTime, endTime, metadata } = payload;
    if (token !== 'ajn.liq.128@proton.me') return res.status(403).json({ error: 'Unauthorized user' });

    // Verificamos identidad del admin con un token crudo simple (o email JWT si está disponible)
    // Para simplificar la arquitectura según el requerimiento:
    // "cuando se detecte el login de ajn.liq.128@proton.me"
    // Asumiremos que el frontend nos manda la data de sesión o nosotros validamos por un token.
    // Vamos a buscar si este request está autorizado.

    // Si necesitas validar un JWT del frontend, usaríamos:
    // const { data: { user } } = await supabase.auth.getUser(token);
    // if (user?.email !== 'ajn.liq.128@proton.me') return res.status(403)

    if (!type || !url) {
      return res.status(400).json({ error: 'Type and URL are required' });
    }

    try {
      // Disparamos la petición al Cerebro de Oracle y NO esperamos resultado final (Fire-and-forget proxy)
      const response = await fetch(`${ORACLE_SERVICE_URL}/api/process-media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ORACLE_SECRET}`
        },
        body: JSON.stringify({
          type,
          url,
          startTime,
          endTime,
          metadata
        })
      });

      if (!response.ok) {
        const errData = await response.text();
        throw new Error(`Oracle responded with status ${response.status}: ${errData}`);
      }

      // Oracle responde inmediatamente con un 202 Accepted
      const responseData = await response.json();
      return res.status(202).json(responseData);

    } catch (error: unknown) {
      console.error('Error forwarding to Oracle Cerebro:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  return res.status(400).json({ error: 'Invalid action specified' });
}

// Lógica de IA Original
async function handleGenerateCode(req: NextApiRequest, res: NextApiResponse, payload: any) {
  const { prompt, apiKey, galeria } = payload;
  const ownerApiKey = process.env.OPENAI_API_KEY;
  const effectiveKey = apiKey && apiKey.trim() !== '' ? apiKey : ownerApiKey;

  if (!effectiveKey) {
    return res.status(401).json({ error: 'No API Key provided and no owner API Key found.' });
  }

  const galeriaContext = galeria ? galeria.map((m: { tipo: string; etiqueta: string; nombre: string }) => `[${m.tipo}] ${m.etiqueta}: ${m.nombre}`).join('\n') : 'Galería vacía';

  const systemPrompt = `Eres el Supervisor IA de NaylaEngine, un sistema de renderizado de video web.
Tu único objetivo es responder EXCLUSIVAMENTE con código JavaScript puro que utiliza el objeto NaylaEngine. NO escribas explicaciones ni uses formato markdown (nada de \`\`\`js o similares). Solo código válido.

El objeto NaylaEngine tiene estos métodos:
- NaylaEngine.agregar(["ETIQUETA1", "ETIQUETA2"]); // Agrega medios a la pista.
- NaylaEngine.modificar("ETIQUETA1", { volume: 0.5 }); // Cambia propiedades del clip (0.0 a 1.0)
- NaylaEngine.agregarSubtitulos([{ texto: "Hola mundo", inicioSec: 0, finSec: 5 }]); // Agrega subtítulos superpuestos
- NaylaEngine.limpiarSubtitulos();
- NaylaEngine.limpiar(); // Borra todo

Aquí tienes la lista de medios disponibles en la galería (tipo, etiqueta, nombre):
${galeriaContext}

El usuario escribirá instrucciones en lenguaje natural. Interpreta sus requerimientos, asocia los conceptos con las etiquetas de la galería, y genera las llamadas a NaylaEngine correspondientes. No llames métodos que no existan.
`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${effectiveKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3
      })
    });

    const data = await response.json();

    if (!response.ok) {
       console.error("OpenAI API error:", data);
       return res.status(500).json({ error: data.error?.message || 'Error from OpenAI API' });
    }

    let code = data.choices[0].message.content.trim();

    if (code.startsWith('```')) {
       code = code.replace(/^```(js|javascript)?\n/, '').replace(/\n```$/, '');
    }

    res.status(200).json({ code });
  } catch (error: unknown) {
    console.error("Supervisor IA Error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
