import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { executeWithApiKey, logAiRateLimitError } from '../../utils/apiKeyManager';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt es requerido.' });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[chat-nayla] Missing Supabase credentials.');
    return res.status(500).json({ error: 'Configuración de servidor incompleta.' });
  }

  let supabaseAdmin;
  try {
    console.log("[ORACLE-DIAG] Inicializando cliente con URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  } catch (err) {
    console.error("[ORACLE-DIAG] CRASH AL CREAR CLIENTE SUPABASE:", err);
    return res.status(500).json({ error: 'Error inicializando la base de datos.' });
  }

  let baseUrlStr = process.env.MANUS_API_URL || 'https://api.manus.ai';
  let cleanBaseUrl = 'https://api.manus.ai';
  try {
    // Extract just the origin to avoid appending to legacy paths like /v1/chat/completions
    // If baseUrlStr is not a valid URL (e.g. missing https://), it might throw.
    // We ensure it has a protocol first if it's missing one.
    if (!/^https?:\/\//i.test(baseUrlStr)) baseUrlStr = 'https://' + baseUrlStr;
    cleanBaseUrl = new URL(baseUrlStr).origin;
  } catch (e) {
    console.warn('[chat-nayla] Invalid MANUS_API_URL, falling back to https://api.manus.ai');
  }
  const createUrl = `${cleanBaseUrl}/v2/task.create`;
  const listMessagesUrl = `${cleanBaseUrl}/v2/task.listMessages`;

  const aiName = process.env.NEXT_PUBLIC_AI_NAME || 'Nayla';
  const systemMessage = `Instrucciones del sistema: Eres ${aiName}. Estás aquí para ayudar a crear el mejor contenido y gestionar redes sociales.\n\n`;
  const fullPrompt = systemMessage + prompt;

  const runManusTask = async (apiKey: string) => {
    // 1. Create the task
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-manus-api-key': apiKey,
      },
      body: JSON.stringify({
        message: {
          content: [
            { type: "text", text: fullPrompt }
          ]
        }
      })
    });

    if (!createRes.ok) {
      const errorData = await createRes.text();
      if (createRes.status === 429) {
        throw { status: 429, message: errorData || 'Rate limit' };
      }
      throw new Error(`Nayla API Create Task Error: ${createRes.status} - ${errorData}`);
    }

    const createData = await createRes.json();
    if (!createData.ok || !createData.task_id) {
      throw new Error(`Failed to create task: ${JSON.stringify(createData)}`);
    }

    const taskId = createData.task_id;

    // 2. Poll for results
    const maxPollingTime = 90000; // 90 seconds
    const startTime = Date.now();
    const pollInterval = 3000; // 3 seconds

    while (Date.now() - startTime < maxPollingTime) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      const pollRes = await fetch(`${listMessagesUrl}?task_id=${taskId}&order=asc`, {
        method: 'GET',
        headers: {
          'x-manus-api-key': apiKey,
        }
      });

      if (!pollRes.ok) {
        const errorData = await pollRes.text();
        console.warn(`[chat-nayla] Polling warning: ${pollRes.status} - ${errorData}`);
        continue; // Keep polling, maybe it's a transient error
      }

      const pollData = await pollRes.json();
      if (!pollData.ok) {
        console.warn(`[chat-nayla] Polling returned not ok: ${JSON.stringify(pollData)}`);
        continue;
      }

      const messages = pollData.messages || [];
      let isTaskFinished = false;

      // Check agent status
      for (const msg of messages) {
        if (msg.type === 'status_update' && msg.status_update?.agent_status) {
           const status = msg.status_update.agent_status;
           if (status === 'stopped' || status === 'error' || status === 'waiting') {
             isTaskFinished = true;
             break;
           }
        }
      }

      if (isTaskFinished) {
         // Find the last assistant message
         let finalAnswer = "";
         for (let i = messages.length - 1; i >= 0; i--) {
           const msg = messages[i];
           if (msg.type === 'assistant_message' && msg.assistant_message?.content) {
              finalAnswer = msg.assistant_message.content;
              break;
           }
         }

         if (finalAnswer) {
           return finalAnswer;
         } else {
           // Check if there's an error message
           for (const msg of messages) {
             if (msg.type === 'error_message' && msg.error_message?.content) {
               throw new Error(`Nayla Task Error: ${msg.error_message.content}`);
             }
           }
           // Check if it's waiting
           for (const msg of messages) {
            if (msg.type === 'status_update' && msg.status_update?.agent_status === 'waiting') {
              throw new Error(`Nayla Task is waiting for user input and cannot continue autonomously.`);
            }
          }
           throw new Error("Task completed but no assistant message found.");
         }
      }
    }

    throw new Error(`Timeout: Task did not complete within ${maxPollingTime / 1000} seconds.`);
  };

  try {
    const manusResponseText = await executeWithApiKey(
      supabaseAdmin,
      'manus_ai',
      async (apiKey: string) => {
        return await runManusTask(apiKey);
      },
      async () => {
        // Fallback to env var if no key found in pool
        const fallbackKey = process.env.MANUS_API_KEY;
        if (!fallbackKey) {
           throw new Error('No MANUS_API_KEY in environment variables.');
        }
        return await runManusTask(fallbackKey);
      }
    );

    // Intentamos parsear la respuesta de la IA por si devolvió un JSON con action/payload,
    // pero si es solo texto, lo enviamos como 'text'.
    let parsedResponse;
    try {
        // Limpiamos los backticks de markdown si la IA los incluye
        const cleanedText = manusResponseText.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedResponse = JSON.parse(cleanedText);
    } catch (e) {
        // No es JSON, lo enviamos como texto simple
        parsedResponse = { text: manusResponseText };
    }

    return res.status(200).json(parsedResponse);

  } catch (error: any) {
    console.error('[chat-nayla] Error procesando el chat:', error);

    // Loguear si es error de límite (rate limit)
    const isRateLimit = error?.message?.toLowerCase().includes('límite') || error?.status === 429;

    if (isRateLimit) {
        await logAiRateLimitError(supabaseAdmin, 'manus_ai', error.message || 'Rate Limit Exceeded');
        return res.status(429).json({ error: 'Límite de cuota alcanzado. Por favor, intenta de nuevo más tarde o cambia de cuenta.' });
    }

    return res.status(500).json({ error: 'Error interno en el chat de Nayla.', details: error.message });
  }
}
