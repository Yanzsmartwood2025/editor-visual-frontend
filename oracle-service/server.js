const express = require('express');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// Configuración de Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

app.post('/api/process-clip', async (req, res) => {
    // 1. Validar Token de seguridad
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.ORACLE_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized: Invalid ORACLE_SECRET' });
    }

    const { videoUrl, startTime, endTime, clipName } = req.body;

    if (!videoUrl || startTime === undefined || endTime === undefined) {
        return res.status(400).json({ error: 'Missing required parameters: videoUrl, startTime, endTime' });
    }

    // Basic URL validation to prevent some obvious issues, but we primarily rely on `spawn` without shell=true to prevent command injection
    try {
        new URL(videoUrl);
    } catch(e) {
        return res.status(400).json({ error: 'Invalid videoUrl' });
    }

    // 2. Responder 202 (Accepted) inmediatamente
    res.status(202).json({ message: 'Procesamiento de clip iniciado en segundo plano' });

    // 3. Procesar en segundo plano
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
            // yt-dlp writes progress to stderr mostly
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

                // Subir a Supabase Storage
                const fileBuffer = fs.readFileSync(outputPath);
                const storagePath = `recortes/${outputFilename}`;

                console.log(`[Job ${jobId}] Subiendo a Supabase Storage...`);
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('media_assets') // Usaremos 'media_assets' u otro si se especifica
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

                // Registrar en la tabla public.memoria_nayla
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
                // Limpieza
                if (fs.existsSync(outputPath)) {
                    fs.unlinkSync(outputPath);
                }
            }
        });

    } catch (e) {
        console.error(`[Job ${jobId}] Excepción inesperada:`, e);
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Oracle Servidor iniciado en el puerto ${PORT}`);
});
