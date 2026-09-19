import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

const requestSchema = z.object({
  url: z.string().url('URL no proporcionada o formato inválido.'),
});

const directExtensions = [
  '.mp4', '.webm', '.mov', '.m4v',
  '.mp3', '.wav', '.m4a', '.ogg', '.aac',
  '.jpg', '.jpeg', '.png', '.webp', '.avif',
];

const isDirectMediaUrl = async (url: string): Promise<boolean> => {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;

  const path = parsed.pathname.toLowerCase();
  if (directExtensions.some((ext) => path.endsWith(ext))) return true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
    if (!response.ok) return false;
    const contentType = response.headers.get('content-type') || '';
    return contentType.startsWith('image/') || contentType.startsWith('video/') || contentType.startsWith('audio/');
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Invalid parameters' });
  }

  const { url } = parsed.data;
  if (!(await isDirectMediaUrl(url))) {
    return res.status(400).json({
      error: 'Este enlace no apunta a un archivo multimedia directo. El extractor Oracle fue retirado; sube el archivo a la Bóveda o usa una URL directa.',
    });
  }

  return res.status(200).json({ videoUrl: url });
}
