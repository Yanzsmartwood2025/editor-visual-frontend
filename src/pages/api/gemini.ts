import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, adminToken, isParsingMedia } = req.body;

  if (adminToken !== 'ajn.liq.128@proton.me') {
    return res.status(403).json({ error: 'Unauthorized user' });
  }

  // Fetch API key dynamically
  let finalApiKey = '';
  try {
    const { data: keys, error } = await supabase
      .from('api_keys_pool')
      .select('api_key')
      .eq('service_provider', 'gemini')
      .eq('resource_type', 'ia')
      .limit(1);

    if (!error && keys && keys.length > 0) {
      finalApiKey = keys[0].api_key;
    }
  } catch(e) {
    console.error(e);
  }

  if (!finalApiKey) {
     // Fallback if not found in db
     finalApiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
  }

  if (!finalApiKey) {
    return res.status(401).json({ error: 'No Gemini API Key provided.' });
  }

  if (isParsingMedia) {
    const systemPrompt = `Eres un asistente experto en parsear instrucciones en lenguaje natural para extraer metadatos de medios.
El usuario te dará una petición para descargar un video de YouTube o una foto.
Tu objetivo es devolver ESTRICTAMENTE un JSON válido sin markdown ni texto extra.
Si es un video, debes extraer el startTime (en formato HH:MM:SS), endTime (en formato HH:MM:SS), un title, description y tags.
Si es una foto, no necesitas tiempos, solo title, description y tags.

Ejemplo de entrada: "Sácame el gol de messi del minuto 1:20 al 1:50 y ponle etiquetas de futbol"
Ejemplo de salida JSON:
{
  "type": "video",
  "startTime": "00:01:20",
  "endTime": "00:01:50",
  "metadata": {
    "title": "Gol de Messi",
    "description": "Clip del gol de messi extraído automáticamente",
    "tags": ["futbol", "messi", "gol"]
  }
}
`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${finalApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: systemPrompt + "\n\nEntrada del usuario: " + prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(500).json({ error: data.error?.message || 'Error from Gemini API' });
      }

      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      return res.status(200).json(JSON.parse(content));

    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(400).json({ error: 'Invalid mode' });
}
