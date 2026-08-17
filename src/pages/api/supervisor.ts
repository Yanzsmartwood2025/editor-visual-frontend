import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { executeWithApiKey } from '../../utils/apiKeyManager';
import { GroqProvider, MistralProvider } from '../../utils/llmProvider';
import { z } from 'zod';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey;

const supabase = supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

const requestSchema = z.object({
    prompt: z.string().min(1, 'Falta el parámetro requerido o está vacío: prompt'),
    apiKey: z.string().optional(),
    galeria: z.any().optional()
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const parsedBody = requestSchema.safeParse(req.body);

        if (!parsedBody.success) {
            return res.status(400).json({ error: parsedBody.error.issues?.[0]?.message || 'Invalid parameters' });
        }

        const { prompt, apiKey, galeria } = parsedBody.data;

        const authHeader = req.headers.authorization;
        let isAuthorized = false;

        if (authHeader && supabase) {
            const token = authHeader.split(' ')[1] || '';
            const { data: { user } } = await supabase.auth.getUser(token);
            if (user?.email === 'ajn.liq.128@proton.me') {
                 isAuthorized = true;
            }
        }

        const hasServerProviderKey = Boolean(process.env.GROQ_API_KEY?.trim() || process.env.MISTRAL_API_KEY?.trim());

        if (!isAuthorized && !apiKey && !hasServerProviderKey) {
            return res.status(401).json({ error: 'Configura GROQ_API_KEY o MISTRAL_API_KEY en Vercel/Coolify, o envía una API key propia.' });
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

        const promptDelUsuario = "Prompt del usuario: " + prompt;

        const executeGroq = async (keyToUse: string) => {
            const provider = new GroqProvider(keyToUse, 'code');
            const result = await provider.generateText(promptDelUsuario, [], systemPrompt);
            let codeResponse = result.replace(/```javascript/g, '').replace(/```js/g, '').replace(/```/g, '').trim();
            if (codeResponse.includes('await') && !codeResponse.includes('async () =>')) {
                codeResponse = `(async () => {\n${codeResponse}\n})();`;
            }
            return codeResponse;
        };

        const executeMistralCode = async (keyToUse: string) => {
            const provider = new MistralProvider(keyToUse, 'code');
            const result = await provider.generateText(promptDelUsuario, [], systemPrompt);
            let codeResponse = result.replace(/```javascript/g, '').replace(/```js/g, '').replace(/```/g, '').trim();
            if (codeResponse.includes('await') && !codeResponse.includes('async () =>')) {
                codeResponse = `(async () => {
${codeResponse}
})();`;
            }
            return codeResponse;
        };

        const executeMistralFallback = async () => {
            const envMistralKey = process.env.MISTRAL_API_KEY?.trim();
            if (envMistralKey) {
                return await executeMistralCode(envMistralKey);
            }
            if (!supabase) {
                throw new Error('No hay MISTRAL_API_KEY configurada y tampoco está disponible el pool temporal de llaves.');
            }
            return await executeWithApiKey(supabase, "mistral", executeMistralCode);
        };

        const executeGroqFromEnvOrPool = async () => {
            const envGroqKey = process.env.GROQ_API_KEY?.trim();
            if (envGroqKey) {
                return await executeGroq(envGroqKey);
            }
            if (!supabase) {
                return await executeMistralFallback();
            }
            return await executeWithApiKey(supabase, "groq", executeGroq, executeMistralFallback);
        };

        let finalCode = '';
        if (apiKey) {
            // User provided API key directly, assuming Groq format for this manual case
            finalCode = await executeGroq(apiKey);
        } else {
            // Prefer Vercel/Coolify env keys. Keep the DB key pool only as a temporary fallback.
            finalCode = await executeGroqFromEnvOrPool();
        }

        res.status(200).json({ code: finalCode });

    } catch (error: any) {
        console.error("Supervisor IA Error:", error);
        if (error.message?.includes('alcanzado en todas las cuentas disponibles')) {
           return res.status(429).json({ error: error.message });
        }
        res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
}
