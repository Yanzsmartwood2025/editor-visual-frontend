import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { executeWithApiKey, RateLimitError } from '../../utils/apiKeyManager';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // El frontend envía: prompt, apiKey (opcional), galeria
    const { prompt, apiKey, galeria } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Falta el parámetro requerido: prompt' });
    }

    try {
        const authHeader = req.headers.authorization;
        let isAuthorized = false;

        if (authHeader) {
            const token = authHeader.split(' ')[1] || '';
            const { data: { user } } = await supabase.auth.getUser(token);
            if (user?.email === 'ajn.liq.128@proton.me') {
                 isAuthorized = true;
            }
        }

        if (!isAuthorized && !apiKey) {
            return res.status(401).json({ error: 'No authorization header provided or invalid token, and no Premium API Key provided' });
        }

        const systemPrompt = `
Eres un asistente experto para NaylaEngine, un editor de video basado en código JavaScript.
Tu tarea es convertir el pedido natural del usuario en un script de JavaScript válido que el sistema pueda ejecutar mediante una función anónima (usando el objeto NaylaEngine que ya estará en el scope).

REGLAS ESTRICTAS:
1. SOLO debes devolver código JavaScript, sin bloques de markdown (\`\`\`), sin comentarios explicativos al inicio ni al final. Solo el código crudo.
2. Tienes disponibles las siguientes funciones en NaylaEngine:
   - await NaylaEngine.agregar(["ID1", "https://ejemplo.com/video.mp4"]) // Agrega clips por etiqueta o descarga URLs asíncronamente y los añade al timeline.
   - NaylaEngine.modificar("ID1", { volume: 0.5, fadeOut: true }) // Modifica propiedades del clip en la línea de tiempo.
   - NaylaEngine.agregarSubtitulos([{ texto: "Hola", inicioSec: 0, finSec: 2 }]) // Agrega subtítulos.
   - NaylaEngine.limpiar() // Borra la línea de tiempo.
   - NaylaEngine.limpiarSubtitulos() // Borra subtítulos.

NUEVOS ENDPOINTS PARA BÚSQUEDA AUTÓNOMA:
Si el usuario te pide fotos, videos de stock, música, noticias o fotos de un artista, NO uses NaylaEngine.agregar para ellos de inmediato, ya que primero deben descargarse asíncronamente en segundo plano. En su lugar, debes generar código usando fetch() para llamar a las APIs internas correspondientes, y los recursos se añadirán solos a la galería del usuario.
Ejemplos (recuerda que el frontend debe inyectar el email, para la IA esto no es necesario codificarlo en el backend ya que en el contexto de NaylaEngine, tú como IA puedes agregarlo si puedes, pero mejor: incluye el email = 'ajn.liq.128@proton.me' siempre en tus fetchs para que el backend pase la autenticación de administrador requerida por los endpoints de stock):
- "/api/buscar-fotos" (POST, { query: "gatos", email: "ajn.liq.128@proton.me" })
- "/api/buscar-videos-stock" (POST, { query: "naturaleza", email: "ajn.liq.128@proton.me" })
- "/api/buscar-musica-stock" (POST, { query: "rock", email: "ajn.liq.128@proton.me" })
- "/api/buscar-artista" (POST, { nombre: "Laura Pausini", email: "ajn.liq.128@proton.me" })
- "/api/buscar-noticias" (POST, { query: "tecnología", email: "ajn.liq.128@proton.me" })

Ejemplo de salida para "busca fotos de perros":
await fetch('/api/buscar-fotos', { method: 'POST', body: JSON.stringify({ query: 'perros', email: 'ajn.liq.128@proton.me' }), headers: { 'Content-Type': 'application/json' }});

Ejemplo de salida para "haz un video de Laura Pausini":
await fetch('/api/buscar-artista', { method: 'POST', body: JSON.stringify({ nombre: 'Laura Pausini', email: 'ajn.liq.128@proton.me' }), headers: { 'Content-Type': 'application/json' }});
await fetch('/api/buscar-videos-stock', { method: 'POST', body: JSON.stringify({ query: 'Laura Pausini', email: 'ajn.liq.128@proton.me' }), headers: { 'Content-Type': 'application/json' }});
await fetch('/api/buscar-musica-stock', { method: 'POST', body: JSON.stringify({ query: 'Laura Pausini', email: 'ajn.liq.128@proton.me' }), headers: { 'Content-Type': 'application/json' }});

Tu salida siempre debe ser código JS válido (si usas await, colócalo directamente, la ejecución soporta promesas si lo envolvemos en async de lado del cliente o es ejecutado en top-level en un entorno que lo soporte, pero por las dudas envuélvelo en un IIFE async si es necesario, así: \`(async () => { await fetch(...); })();\`).

Contexto adicional:
La galería actual del usuario contiene los siguientes elementos: ${JSON.stringify(galeria)}
`;

        const executeGemini = async (keyToUse: string) => {
            const genAI = new GoogleGenerativeAI(keyToUse);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
            try {
                const result = await model.generateContent([
                    systemPrompt,
                    "Prompt del usuario: " + prompt
                ]);
                let codeResponse = result.response.text();
                codeResponse = codeResponse.replace(/```javascript/g, '').replace(/```js/g, '').replace(/```/g, '').trim();
                if (codeResponse.includes('await') && !codeResponse.includes('async () =>')) {
                    codeResponse = `(async () => {\n${codeResponse}\n})();`;
                }
                return codeResponse;
            } catch (err: any) {
                if (err.status === 429 || err.message?.includes('429')) {
                    throw new RateLimitError(err.message, err.message?.toLowerCase().includes('quota'));
                }
                throw err;
            }
        };

        let finalCode = '';
        if (apiKey) {
            // User provided API key directly
            finalCode = await executeGemini(apiKey);
        } else {
            // Admin flow using pool
            const fallbackKey = process.env.GEMINI_API_KEY;
            finalCode = await executeWithApiKey(supabase, "gemini",
                executeGemini,
                fallbackKey ? () => executeGemini(fallbackKey) : undefined
            );
        }

        res.status(200).json({ code: finalCode });

    } catch (error: any) {
        console.error("Supervisor IA Error:", error);
        if (error.message?.includes('Límite de Gemini alcanzado')) {
           return res.status(429).json({ error: error.message });
        }
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
}
