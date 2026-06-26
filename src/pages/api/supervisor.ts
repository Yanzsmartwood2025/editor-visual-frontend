import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, apiKey, galeria } = req.body;
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

    // Limpieza agresiva por si la IA devuelve markdown
    if (code.startsWith('```')) {
       code = code.replace(/^```(js|javascript)?\n/, '').replace(/\n```$/, '');
    }

    res.status(200).json({ code });
  } catch (error: unknown) {
    console.error("Supervisor IA Error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
}
