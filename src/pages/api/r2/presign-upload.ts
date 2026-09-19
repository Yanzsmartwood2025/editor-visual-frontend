import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { createR2PresignedPutUrl } from '../../../lib/r2';

const schema = z.object({
  mediaId: z.string().regex(/^[a-zA-Z0-9-]+$/),
  extension: z.string().regex(/^[a-z0-9]{1,10}$/),
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive().max(5 * 1024 * 1024 * 1024),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Usa POST.' });
  }

  try {
    const user = await requireFirebaseUser(req);
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues?.[0]?.message || 'Datos de subida inválidos.',
      });
    }

    const { mediaId, extension, contentType } = parsed.data;
    const key = `${user.uid}/${mediaId}.${extension.toLowerCase()}`;

    const signed = createR2PresignedPutUrl({
      key,
      contentType,
      expiresIn: 900,
    });

    return res.status(200).json(signed);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'No se pudo autorizar la subida.';
    const status =
      message.includes('token') ||
      message.includes('Bearer') ||
      message.includes('Firebase')
        ? 401
        : 500;

    return res.status(status).json({ error: message });
  }
}
