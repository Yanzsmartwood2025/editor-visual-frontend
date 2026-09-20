import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { searchStockMedia } from '../../../lib/mediaProviders/stock';

const providerSchema = z.enum(['pexels', 'pixabay', 'openverse']);

const requestSchema = z.object({
  query: z.string().trim().min(1).max(120),
  kind: z.enum(['image', 'video', 'audio']),
  limit: z.number().int().min(1).max(40).optional(),
  providers: z.array(providerSchema).max(3).optional(),
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

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Parámetros de búsqueda inválidos.',
    });
  }

  try {
    const response = await searchStockMedia(parsed.data);

    if (!response.results.length) {
      return res.status(200).json({
        ...response,
        message: response.errors.length
          ? 'No hubo resultados utilizables; uno o más proveedores fallaron.'
          : 'No se encontraron resultados para esa búsqueda.',
      });
    }

    return res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error buscando medios.';
    return res.status(500).json({ error: message });
  }
}
