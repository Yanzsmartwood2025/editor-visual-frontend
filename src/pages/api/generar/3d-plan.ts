import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { createMediaJobPlan } from '../../../lib/mediaJobs';

const requestSchema = z.object({
  prompt: z.string().trim().min(3).max(3000),
  projectId: z.string().uuid().nullable().optional(),
  threadId: z.string().uuid().nullable().optional(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Usa POST.' });
  }

  let user;
  try {
    user = await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Sesión no válida.' });
  }

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Solicitud inválida.' });
  }

  try {
    const plan = await createMediaJobPlan({
      userId: user.uid,
      projectId: parsed.data.projectId || undefined,
      threadId: parsed.data.threadId || undefined,
      action: {
        action: 'GENERATE_3D',
        mode: 'text_to_3d',
        prompt: parsed.data.prompt,
      },
    });

    if (!plan || plan.status === 'unconfigured' || !plan.id) {
      return res.status(200).json({
        ready: false,
        message: 'Nayla Cloud todavía no tiene una ruta 3D disponible en este entorno.',
      });
    }

    return res.status(200).json({
      ready: true,
      jobId: plan.id,
      status: plan.status,
      message: 'Modelo 3D preparado. Confirma para iniciar la generación.',
      provider: plan.provider?.label || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo preparar el modelo 3D.';
    console.error('[generar/3d-plan] 3D plan failed', error);
    return res.status(500).json({
      error: /proyecto|sesión|usuario/i.test(message)
        ? message
        : 'Nayla no pudo preparar el modelo 3D en este intento.',
    });
  }
}
