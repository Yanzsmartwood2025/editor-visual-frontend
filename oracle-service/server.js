require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { exec, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const util = require('util');

const execAsync = util.promisify(exec);
const execFileAsync = util.promisify(execFile);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;
const ORACLE_SECRET = process.env.ORACLE_SECRET || 'dev_oracle_secret';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware de seguridad
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${ORACLE_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized: Invalid ORACLE_SECRET' });
  }
  next();
};

app.post('/api/process-media', authMiddleware, async (req, res) => {
  const { type, url, startTime, endTime, metadata } = req.body;

  if (!type || !url) {
    return res.status(400).json({ error: 'Missing type or url in body' });
  }

  // Respondemos inmediatamente a Vercel
  res.status(202).json({ status: 'processing', message: 'Task accepted by Oracle Cerebro' });

  // Procesamiento asíncrono
  (async () => {
    try {
      if (type === 'photo') {
        await processPhoto(url, metadata);
      } else if (type === 'video') {
        await processVideo(url, startTime, endTime, metadata);
      }
    } catch (err) {
      console.error(`Error processing task [${type}]:`, err);
    }
  })();
});

async function processPhoto(url, metadata) {
  console.log(`Processing photo: ${url}`);
  // Para fotos simplemente guardamos la URL directa en memoria_nayla
  const { data, error } = await supabase
    .from('memoria_nayla')
    .insert([
      {
        tipo: 'foto',
        url_archivo: url,
        titulo: metadata?.title || 'Foto de internet',
        etiquetas: metadata?.tags || [],
        descripcion: metadata?.description || ''
      }
    ]);

  if (error) {
    console.error('Error inserting photo to Supabase:', error);
  } else {
    console.log('Photo saved successfully to Supabase.');
  }
}

async function processVideo(url, startTime, endTime, metadata) {
  console.log(`Processing video: ${url}, from ${startTime} to ${endTime}`);

  const tmpId = Date.now().toString();
  const tmpVideoPath = path.join('/tmp', `video_${tmpId}.mp4`);

  try {
    // 1. Download and cut using yt-dlp
    // Format options: bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best
    // The --download-sections allows downloading only the specified range
    const timeRange = `*${startTime}-${endTime}`;
    const args = ['-f', 'best[ext=mp4]', '--download-sections', timeRange, '-o', tmpVideoPath, url];
    console.log(`Executing: yt-dlp ${args.join(' ')}`);
    await execFileAsync('yt-dlp', args);

    // 2. Read the file
    const fileBuffer = fs.readFileSync(tmpVideoPath);

    // 3. Upload to Supabase Storage
    const fileName = `clips/clip_${tmpId}.mp4`;
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('media') // Asegúrate de que el bucket 'media' existe en tu Supabase
      .upload(fileName, fileBuffer, {
        contentType: 'video/mp4',
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Upload error: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(fileName);
    const publicUrl = publicUrlData.publicUrl;

    // 4. Save metadata to memoria_nayla
    const { error: dbError } = await supabase
      .from('memoria_nayla')
      .insert([
        {
          tipo: 'video',
          url_archivo: publicUrl,
          titulo: metadata?.title || 'Clip de YouTube',
          etiquetas: metadata?.tags || [],
          descripcion: metadata?.description || ''
        }
      ]);

    if (dbError) {
      throw new Error(`DB Insert error: ${dbError.message}`);
    }

    console.log(`Video processing complete. URL: ${publicUrl}`);

  } catch (error) {
    console.error('Error in processVideo:', error);
  } finally {
    // 5. Cleanup
    if (fs.existsSync(tmpVideoPath)) {
      fs.unlinkSync(tmpVideoPath);
      console.log(`Cleaned up temp file: ${tmpVideoPath}`);
    }
  }
}

app.listen(PORT, () => {
  console.log(`Oracle Cerebro Microservice running on port ${PORT}`);
});
