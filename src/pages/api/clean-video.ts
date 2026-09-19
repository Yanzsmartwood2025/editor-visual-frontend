import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../lib/firebaseAdmin';

const requestSchema = z.object({
  videoUrl: z.string().url(),
  coordenadas: z.array(z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  })).min(1),
});

const assertOwnedR2Url = (videoUrl: string, userId: string) => {
  const publicBase = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (!publicBase) throw new Error('Cloudflare R2 no está configurado.');

  const expectedPrefix = `${publicBase}/${userId}/`;
  if (!videoUrl.startsWith(expectedPrefix)) {
    throw new Error('El video debe pertenecer a la Bóveda R2 del usuario autenticado.');
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });

  try {
    const user = await requireFirebaseUser(req);
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues?.[0]?.message || 'Parámetros inválidos.' });
    }

    const { videoUrl, coordenadas } = parsed.data;
    assertOwnedR2Url(videoUrl, user.uid);

    const replicateToken = process.env.REPLICATE_API_TOKEN;
    const falKey = process.env.FAL_KEY;
    const maskBoxes = coordenadas.map((c) => [c.x, c.y, c.width, c.height]);

    if (replicateToken) {
      const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          Authorization: `Token ${replicateToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: 'ccb3b1e360fbfbc7e5cfa8e718873fb2a20fc1d0c5a2c27732a31dcce411bd13',
          input: {
            video: videoUrl,
            masks: JSON.stringify(maskBoxes),
          },
        }),
      });

      const replicateData = await replicateResponse.json().catch(() => ({}));
      if (replicateResponse.ok) {
        return res.status(200).json({
          success: true,
          motor: 'replicate',
          url: videoUrl,
          prediction_id: replicateData.id,
          status: replicateData.status || 'processing',
        });
      }
      console.warn('[clean-video] Replicate rechazó la orden.', replicateData);
    }

    if (falKey) {
      const falResponse = await fetch('https://queue.fal.run/fal-ai/fast-video-inpaint', {
        method: 'POST',
        headers: {
          Authorization: `Key ${falKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_url: videoUrl,
          mask_coordinates: maskBoxes,
        }),
      });

      const falData = await falResponse.json().catch(() => ({}));
      if (falResponse.ok) {
        return res.status(200).json({
          success: true,
          motor: 'fal',
          url: videoUrl,
          prediction_id: falData.request_id,
          status: 'processing',
        });
      }
      console.warn('[clean-video] FAL rechazó la orden.', falData);
    }

    return res.status(503).json({ error: 'No hay un motor de supresión en la nube disponible.' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno procesando el video.';
    const status = message.includes('token') || message.includes('Bearer') || message.includes('Firebase') ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
