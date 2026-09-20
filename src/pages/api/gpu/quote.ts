import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { sanitizeNaylaPublicText } from '../../../lib/naylaSystemCatalog';
import { quoteVastGpuJob } from '../../../lib/gpu/quote';

const safeUrl = z.string().url().max(4000).refine((value) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.')
    ) return false;

    const match172 = host.match(/^172\.(\d{1,3})\./);
    if (match172) {
      const second = Number(match172[1]);
      if (second >= 16 && second <= 31) return false;
    }

    return true;
  } catch {
    return false;
  }
}, 'Las entradas GPU deben usar una URL HTTPS pública.');

const schema = z.object({
  workload: z.enum(['probe', 'image', 'video', 'audio', '3d']),
  recipe: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._:-]+$/).optional(),
  prompt: z.string().max(5000).optional(),
  inputUrls: z.array(safeUrl).max(12).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Usa POST.' });
  }

  try {
    await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Cotización GPU inválida.',
    });
  }

  try {
    const quote = await quoteVastGpuJob(parsed.data);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({ quote });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'No se pudo cotizar Nayla Compute.';
    return res.status(500).json({ error: sanitizeNaylaPublicText(message) });
  }
}
