import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { createR2PresignedGetUrl } from '../../../lib/r2';
import { getWorkspaceSupabaseAdmin } from '../../../lib/workspaceStore';

const querySchema = z.object({
  id: z.string().uuid(),
});

const safeFileName = (value: string) =>
  value
    .replace(/[\r\n"]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140) || 'nayla-audio';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Usa GET.' });
  }

  let user;
  try {
    user = await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Sesión no válida.' });
  }

  const parsed = querySchema.safeParse({ id: req.query.id });
  if (!parsed.success) {
    return res.status(400).json({ error: 'Archivo inválido.' });
  }

  try {
    const supabase = getWorkspaceSupabaseAdmin();
    const { data: item, error } = await supabase
      .from('galeria_multimedia')
      .select('id,nombre,r2_key,url,metadata,user_id')
      .eq('id', parsed.data.id)
      .eq('user_id', user.uid)
      .maybeSingle();

    if (error) throw error;
    if (!item) return res.status(404).json({ error: 'Archivo no encontrado.' });

    const sourceUrl =
      typeof item.r2_key === 'string' && item.r2_key
        ? createR2PresignedGetUrl({ key: item.r2_key, expiresIn: 300 }).url
        : typeof item.url === 'string' && item.url.startsWith('https://')
          ? item.url
          : null;

    if (!sourceUrl) {
      return res.status(400).json({ error: 'Ese archivo no tiene una fuente descargable.' });
    }

    const upstream = await fetch(sourceUrl);
    if (!upstream.ok) {
      throw new Error(`No se pudo leer el archivo (HTTP ${upstream.status}).`);
    }

    const declaredLength = Number(upstream.headers.get('content-length'));
    const maxBytes = 80 * 1024 * 1024;
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return res.status(413).json({ error: 'El archivo supera el límite temporal de descarga.' });
    }

    const bytes = Buffer.from(await upstream.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      return res.status(413).json({ error: 'El archivo supera el límite temporal de descarga.' });
    }

    const contentType =
      upstream.headers.get('content-type')?.split(';')[0] ||
      (typeof item.metadata?.contentType === 'string' ? item.metadata.contentType : '') ||
      'application/octet-stream';
    const fileName = safeFileName(String(item.nombre || 'nayla-audio'));

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', String(bytes.byteLength));
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).send(bytes);
  } catch (error) {
    console.error('[media/download] failed', error);
    return res.status(502).json({ error: 'Nayla no pudo preparar la descarga.' });
  }
}
