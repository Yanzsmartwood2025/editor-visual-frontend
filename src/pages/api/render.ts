// @ts-nocheck
/* eslint-disable */
import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createClient } from '@supabase/supabase-js';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Llaves ausentes.' });
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { pistaVideo } = req.body;
    if (!pistaVideo || pistaVideo.length === 0) return res.status(400).json({ error: 'Pista vacía.' });
    const jobId = Date.now().toString();
    const tmpDir = os.tmpdir();
    const archivosLocales = [];
    for (let i = 0; i < pistaVideo.length; i++) {
      const clip = pistaVideo[i];
      if (clip.tipo !== 'video') continue;
      const resArchivo = await fetch(clip.url);
      const buffer = await resArchivo.arrayBuffer();
      const rutaLocal = path.join(tmpDir, `clip_${jobId}_${i}.mp4`);
      fs.writeFileSync(rutaLocal, new Uint8Array(buffer));
      archivosLocales.push(rutaLocal);
    }
    if (archivosLocales.length === 0) return res.status(400).json({ error: 'Sin videos válidos.' });
    const listaTxtPath = path.join(tmpDir, `lista_${jobId}.txt`);
    fs.writeFileSync(listaTxtPath, archivosLocales.map(r => `file '${r}'`).join('\n'));
    const outputPath = path.join(tmpDir, `final_${jobId}.mp4`);
    await execPromise(`ffmpeg -y -f concat -safe 0 -i "${listaTxtPath}" -c copy "${outputPath}"`);
    const fileContentFinal = fs.readFileSync(outputPath);
    const nombreFinal = `render-maestro-${jobId}.mp4`;
    const { error: uploadError } = await supabase.storage.from('temp-videos').upload(nombreFinal, fileContentFinal, { contentType: 'video/mp4', upsert: true });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage.from('temp-videos').getPublicUrl(nombreFinal);
    archivosLocales.forEach(r => fs.unlinkSync(r));
    fs.unlinkSync(listaTxtPath);
    fs.unlinkSync(outputPath);
    return res.status(200).json({ success: true, url: urlData.publicUrl });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Error en renderizado.' });
  }
}
