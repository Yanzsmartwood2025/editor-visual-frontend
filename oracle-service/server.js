const express = require('express');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const ws = require('ws');

const app = express();
app.use(express.json());
app.use(cors());

// Configuración de Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: { transport: ws }
});

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

    try {
        console.log(`[Job ${jobId}] Iniciando procesamiento de recortes: ${videoUrl}`);

        const ytDlpArgs = [
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--download-sections', `*${startTime}-${endTime}`,
            videoUrl,
            '-o', outputPath,
            '--force-keyframes-at-cuts'
        ];

        console.log(`[Job ${jobId}] Ejecutando yt-dlp...`);

        const ytProcess = spawn('yt-dlp', ytDlpArgs);

        let stderrOutput = '';

        ytProcess.stderr.on('data', (data) => {
            stderrOutput += data.toString();
        });

        ytProcess.on('close', async (code) => {
            if (code !== 0) {
                console.error(`[Job ${jobId}] Error ejecutando yt-dlp. Exit code: ${code}. Output:`, stderrOutput);
                return;
            }

            console.log(`[Job ${jobId}] Video recortado exitosamente: ${outputPath}`);

            try {
                if (!fs.existsSync(outputPath)) {
                    console.error(`[Job ${jobId}] El archivo de salida no existe: ${outputPath}`);
                    return;
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
                    console.error(`[Job ${jobId}] Error al registrar en la base de datos:`, dbError);
                } else {
                    console.log(`[Job ${jobId}] Clip registrado exitosamente en memoria_nayla`);
                }

            } catch (e) {
                console.error(`[Job ${jobId}] Error durante subida/registro:`, e);
            } finally {
                if (fs.existsSync(outputPath)) {
                    fs.unlinkSync(outputPath);
                }
            }
        });

    } catch (e) {
        console.error(`[Job ${jobId}] Excepción inesperada:`, e);
    }
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
            '--no-progress',
            url,
            '-o', outputPath
        ];

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
        console.error(`[extract-meta] Error en yt-dlp o subida, procediendo a fallback regex...`, e.message);

        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }

        try {
            console.log(`[extract-meta] Iniciando fallback regex para: ${url}`);
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const html = await response.text();
            console.log(`[extract-meta] HTML descargado, longitud: ${html.length}`);

            const searchRegex = /(https:(?:\\\/|\/)(?:\\\/|\/)[^"'\s]+\.fbcdn\.net[^"'\s]+\.mp4[^"'\s]*)/gi;
            let match = searchRegex.exec(html);

            if (match && match[1]) {
                let finalUrl = match[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
                console.log(`[extract-meta] Encontrado via fbcdn regex: ${finalUrl}`);
                return res.status(200).json({ videoUrl: finalUrl });
            }

            const broadRegex = /(https:(?:\\\/|\/)(?:\\\/|\/)[^"'\s<>]+\.mp4[^"'\s<>]*)/gi;
            let matchBroad = broadRegex.exec(html);

            if (matchBroad && matchBroad[1]) {
                let finalUrl = matchBroad[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
                console.log(`[extract-meta] Encontrado via broad regex: ${finalUrl}`);
                return res.status(200).json({ videoUrl: finalUrl });
            }

            console.log(`[extract-meta] No se encontro video mp4 en el HTML de ${url}`);
            return res.status(404).json({ error: 'Video no encontrado en el HTML devuelto a Oracle' });

        } catch (fallbackError) {
            console.error(`[extract-meta] Error interno en fallback: `, fallbackError);
            return res.status(500).json({ error: 'Error interno en Oracle procesando la extraccion' });
        }
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Oracle Servidor iniciado en el puerto ${PORT}`);
});
