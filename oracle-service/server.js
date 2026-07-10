const express = require('express');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const ws = require('ws');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(express.json());

// --- Cola de procesamiento (Queue) ---
const MAX_CONCURRENT_JOBS = 2;
let activeJobs = 0;
const jobQueue = [];

function processNextJob() {
    if (activeJobs >= MAX_CONCURRENT_JOBS || jobQueue.length === 0) {
        return;
    }
    activeJobs++;
    const job = jobQueue.shift();
    console.log(`[Queue] Iniciando job. Activos: ${activeJobs}, En espera: ${jobQueue.length}`);

    // Ejecutamos la tarea
    job().finally(() => {
        activeJobs--;
        console.log(`[Queue] Job finalizado. Activos: ${activeJobs}, En espera: ${jobQueue.length}`);
        processNextJob(); // Intentar procesar el siguiente
    });
}
app.use(cors());

// Configuración de Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: { transport: ws }
});

// --- Rotación de API Keys de Gemini ---
// Detecta si un error es por límite de cuota/rate-limit (para saber si vale la pena
// intentar con la siguiente key) vs. otro tipo de error (donde no tiene sentido rotar).
function isQuotaOrRateLimitError(err) {
    const status = err?.status || err?.response?.status;
    const message = (err?.message || '').toLowerCase();
    return (
        status === 429 ||
        message.includes('quota') ||
        message.includes('rate limit') ||
        message.includes('resource_exhausted') ||
        message.includes('too many requests')
    );
}

/**
 * Intenta generar contenido con Gemini usando una lista de API keys en orden.
 * Si una key falla por cuota/rate-limit, pasa automáticamente a la siguiente.
 * Si falla por otro motivo (prompt inválido, key inválida, etc.), se detiene y lanza el error.
 *
 * @param {string[]} apiKeys - Lista de keys a probar en orden de prioridad.
 * @param {any[]} promptParts - Contenido a enviar a generateContent (igual que hoy).
 * @param {string} modelName - Nombre del modelo, por defecto gemini-2.5-flash.
 * @returns {Promise<{text: string, keyIndexUsed: number}>}
 */
async function generateWithGeminiRotation(apiKeys, promptParts, modelName = 'gemini-2.5-flash') {
    const validKeys = apiKeys.filter(Boolean);

    if (validKeys.length === 0) {
        throw new Error('No hay ninguna GEMINI_API_KEY configurada.');
    }

    let lastError = null;

    for (let i = 0; i < validKeys.length; i++) {
        const key = validKeys[i];
        try {
            const genAI = new GoogleGenerativeAI(key);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(promptParts);
            const text = result.response.text();

            console.log(`[Gemini] Éxito usando key #${i + 1} de ${validKeys.length}`);
            return { text, keyIndexUsed: i };

        } catch (err) {
            lastError = err;

            if (isQuotaOrRateLimitError(err)) {
                console.warn(`[Gemini] Key #${i + 1} agotó su cuota o alcanzó el rate limit. Probando siguiente key...`);
                continue; // pasar a la siguiente key
            }

            // Error real (no de cuota): no tiene sentido seguir rotando, se detiene aquí.
            console.error(`[Gemini] Error no relacionado a cuota con key #${i + 1}:`, err.message);
            throw err;
        }
    }

    // Si llegamos aquí, todas las keys fallaron por cuota/rate-limit.
    console.error('[Gemini] Todas las API keys alcanzaron su límite de cuota.');
    throw lastError || new Error('Todas las API keys de Gemini alcanzaron su límite.');
}

app.post('/api/process-clip', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.ORACLE_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized: Invalid ORACLE_SECRET' });
    }

    const { videoUrl, startTime, endTime, clipName } = req.body;

    if (!videoUrl || startTime === undefined || endTime === undefined) {
        return res.status(400).json({ error: 'Missing required parameters: videoUrl, startTime, endTime' });
    }

    try {
        new URL(videoUrl);
    } catch(e) {
        return res.status(400).json({ error: 'Invalid videoUrl' });
    }

    res.status(202).json({ message: 'Procesamiento de clip iniciado en segundo plano' });

    const jobId = uuidv4();
    const outputFilename = `clip_${jobId}.mp4`;
    const outputPath = path.join('/tmp', outputFilename);

    const task = async () => {
        try {
            console.log(`[Job ${jobId}] Iniciando procesamiento de recortes: ${videoUrl}`);

            const ytDlpArgs = [
                '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                '--download-sections', `*${startTime}-${endTime}`
            ];

            if (process.env.YTDLP_COOKIES_PATH && fs.existsSync(process.env.YTDLP_COOKIES_PATH)) {
                ytDlpArgs.push('--cookies', process.env.YTDLP_COOKIES_PATH);
            }

            ytDlpArgs.push(
                videoUrl,
                '-o', outputPath,
                '--force-keyframes-at-cuts'
            );

            console.log(`[Job ${jobId}] Ejecutando yt-dlp...`);

            const ytProcess = spawn('yt-dlp', ytDlpArgs);

            let stderrOutput = '';

            ytProcess.stdout.on('data', () => {}); // Consumir stdout para evitar llenar el buffer

            ytProcess.stderr.on('data', (data) => {
                stderrOutput += data.toString();
            });

            await new Promise((resolve, reject) => {
                ytProcess.on('close', (code) => {
                    if (code !== 0) {
                        reject(new Error(`yt-dlp exit code: ${code}. Output: ${stderrOutput}`));
                    } else {
                        resolve();
                    }
                });
                ytProcess.on('error', (err) => {
                    reject(err);
                });
            });

            console.log(`[Job ${jobId}] Video recortado exitosamente: ${outputPath}`);

            if (!fs.existsSync(outputPath)) {
                 throw new Error(`El archivo de salida no existe: ${outputPath}`);
            }

            const fileBuffer = fs.readFileSync(outputPath);
            const storagePath = `recortes/${outputFilename}`;

            console.log(`[Job ${jobId}] Subiendo a Supabase Storage...`);
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('media_assets')
                .upload(storagePath, fileBuffer, {
                    contentType: 'video/mp4',
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) throw uploadError;

            const { data: publicUrlData } = supabase.storage
                .from('media_assets')
                .getPublicUrl(storagePath);

            const finalUrl = publicUrlData.publicUrl;
            console.log(`[Job ${jobId}] Archivo subido con éxito: ${finalUrl}`);

            const metadata = {
                originalUrl: videoUrl,
                startTime,
                endTime,
                clipName: clipName || 'Clip Generado'
            };

            // Call the centralized Next.js API for universal memory
            const memoryApiUrl = process.env.NEXT_PUBLIC_URL ? `${process.env.NEXT_PUBLIC_URL}/api/registrar-memoria` : 'http://localhost:3000/api/registrar-memoria';

            try {
                const response = await fetch(memoryApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.ORACLE_SECRET}`
                    },
                    body: JSON.stringify({
                        url: finalUrl,
                        tipo: 'video_clip',
                        nombre: clipName || 'Clip Generado',
                        metadata: metadata,
                        personaje_id: req.body.personaje_id || 'Nayla',
                        contexto_programa: req.body.contexto_programa || `Recorte de video: ${videoUrl}`,
                        estado: 'completado'
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`[Job ${jobId}] Error al registrar en la memoria universal:`, errorText);
                } else {
                    console.log(`[Job ${jobId}] Clip registrado exitosamente en memoria_nayla vía API centralizada`);
                }
            } catch (fetchErr) {
                console.error(`[Job ${jobId}] Failed to reach Next.js API:`, fetchErr.message);

                // Fallback to direct supabase insertion just in case
                const { error: dbError } = await supabase
                    .from('memoria_nayla')
                    .insert([
                        {
                            tipo: 'video_clip',
                            url: finalUrl,
                            metadata: metadata
                        }
                    ]);

                if (dbError) {
                    console.error(`[Job ${jobId}] Error al registrar directamente en la base de datos (fallback):`, dbError);
                } else {
                    console.log(`[Job ${jobId}] Clip registrado exitosamente mediante fallback directo`);
                }
            }

        } catch (e) {
            console.error(`[Job ${jobId}] Error durante procesamiento/subida/registro:`, e);
        } finally {
            if (fs.existsSync(outputPath)) {
                fs.unlinkSync(outputPath);
            }
        }
    };

    jobQueue.push(task);
    processNextJob();
});


app.post('/api/extract-meta', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.ORACLE_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized: Invalid ORACLE_SECRET' });
    }

    const { url } = req.body;
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'URL no proporcionada' });
    }

    console.log(`[extract-meta] Recibida solicitud para extraer: ${url}`);

    const jobId = uuidv4();
    const outputFilename = `meta_${jobId}.mp4`;
    const outputPath = path.join('/tmp', outputFilename);

    try {
        console.log(`[extract-meta] Intentando descargar con yt-dlp... ${url}`);

        const ytDlpArgs = [
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--no-progress'
        ];

        if (process.env.YTDLP_COOKIES_PATH && fs.existsSync(process.env.YTDLP_COOKIES_PATH)) {
            ytDlpArgs.push('--cookies', process.env.YTDLP_COOKIES_PATH);
        }

        ytDlpArgs.push(
            url,
            '-o', outputPath
        );

        const ytProcess = spawn('yt-dlp', ytDlpArgs);
        let stderrOutput = '';

        ytProcess.stdout.on('data', () => {}); // Consumir stdout para evitar llenar el buffer

        ytProcess.stderr.on('data', (data) => {
            stderrOutput += data.toString();
        });

        await new Promise((resolve, reject) => {
            ytProcess.on('error', (err) => {
                reject(new Error(`Fallo al ejecutar yt-dlp: ${err.message}`));
            });
            ytProcess.on('close', (code) => {
                if (code !== 0) {
                    reject(new Error(`yt-dlp exit code ${code}. Output: ${stderrOutput}`));
                } else {
                    resolve();
                }
            });
        });

        console.log(`[extract-meta] Video descargado exitosamente: ${outputPath}`);

        if (!fs.existsSync(outputPath)) {
             throw new Error(`El archivo de salida no existe: ${outputPath}`);
        }

        const fileStream = fs.createReadStream(outputPath);
        const storagePath = `media_bodega/${outputFilename}`;

        console.log(`[extract-meta] Subiendo a Supabase Storage mediante stream...`);
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('media_assets')
            .upload(storagePath, fileStream, {
                contentType: 'video/mp4',
                cacheControl: '3600',
                upsert: false,
                duplex: 'half'
            });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
            .from('media_assets')
            .getPublicUrl(storagePath);

        const finalUrl = publicUrlData.publicUrl;
        console.log(`[extract-meta] Archivo subido con éxito: ${finalUrl}`);

        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }

        return res.status(200).json({ videoUrl: finalUrl });

    } catch (e) {
        console.error(`[extract-meta] Error en yt-dlp o subida, procediendo a fallback de IA (Gemini)...`, e.message);

        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }

        try {
            console.log(`[extract-meta] Iniciando fallback IA para: ${url}`);
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            let html = await response.text();
            console.log(`[extract-meta] HTML descargado, longitud original: ${html.length}`);

            // Limpieza del HTML para ahorrar tokens
            html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
            html = html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
            html = html.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '');
            console.log(`[extract-meta] HTML limpio, longitud: ${html.length}`);

            console.log(`[extract-meta] Oráculo: Header x-gemini-api-key recibido: ${!!req.headers['x-gemini-api-key']}`);

            // Orden de prioridad: key del header (si el cliente manda una propia) primero,
            // luego las 3 keys configuradas en el entorno, rotando si alguna se queda sin cuota.
            const headerKey = req.headers['x-gemini-api-key'];
            const geminiKeys = [
                headerKey,
                process.env.GEMINI_API_KEY,
                process.env.GEMINI_API_KEY_2,
                process.env.GEMINI_API_KEY_3
            ].filter(Boolean);

            if (geminiKeys.length === 0) {
                console.error('[extract-meta] No hay ninguna GEMINI_API_KEY configurada (ni en env ni en el header) para el fallback.');
                return res.status(500).json({ error: 'Error interno: IA no configurada.' });
            }

            const systemPrompt = `
Eres un extractor experto de URLs de video.
Tu objetivo es encontrar el enlace directo al video (.mp4) de más alta calidad, sin marcas de agua si es posible, en el código HTML crudo proporcionado.
Busca propiedades de metadatos (como og:video, twitter:player:stream), URLs en variables JSON embebidas, o atributos 'src' dentro de etiquetas de video.
Si la URL está encodeada (ej. contiene \\u0026 o \/), decodifícala a un formato HTTP estándar válido.
Debes devolver ÚNICAMENTE un objeto JSON válido con la siguiente estructura, sin texto adicional ni bloques de markdown (como \`\`\`json):
{
  "videoUrl": "la_url_directa_al_mp4_aqui"
}
Si no encuentras ningún video, devuelve:
{
  "videoUrl": null
}
`;
            console.log(`[extract-meta] Consultando a Gemini 2.5 Flash (con rotación de ${geminiKeys.length} key(s) disponibles)...`);

            let textResponse;
            try {
                const { text, keyIndexUsed } = await generateWithGeminiRotation(
                    geminiKeys,
                    [systemPrompt, "HTML crudo:\n" + html],
                    "gemini-2.5-flash"
                );
                textResponse = text.trim();
                console.log(`[extract-meta] Respuesta obtenida usando la key en posición ${keyIndexUsed + 1}.`);
            } catch (geminiErr) {
                console.error(`[extract-meta] Todas las keys de Gemini fallaron:`, geminiErr.message);
                return res.status(503).json({ error: 'El servicio de IA no está disponible en este momento (límite de cuota alcanzado en todas las keys).' });
            }

            // Limpiar posibles bloques markdown que Gemini a veces devuelve de todos modos
            textResponse = textResponse.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

            console.log(`[extract-meta] Respuesta de Gemini:\n${textResponse}`);

            let jsonResponse;
            try {
                jsonResponse = JSON.parse(textResponse);
            } catch (jsonErr) {
                console.error(`[extract-meta] Error parseando JSON de Gemini:`, jsonErr);
                return res.status(500).json({ error: 'Respuesta inválida de la IA.' });
            }

            if (jsonResponse.videoUrl) {
                console.log(`[extract-meta] Extracción exitosa via IA: ${jsonResponse.videoUrl}`);
                return res.status(200).json({ videoUrl: jsonResponse.videoUrl });
            } else {
                console.log(`[extract-meta] La IA no encontró un video mp4 en el HTML de ${url}`);
                return res.status(404).json({ error: 'Video no encontrado en el HTML mediante IA.' });
            }

        } catch (fallbackError) {
            console.error(`[extract-meta] Error interno en fallback IA: `, fallbackError);
            return res.status(500).json({ error: 'Error interno en Oracle procesando el fallback.' });
        }
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Oracle Servidor iniciado en el puerto ${PORT}`);
});
