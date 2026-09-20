import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import {
  getGpuJobStatusForUser,
  startVastGpuJob,
} from '../../../lib/gpu/orchestrator';
import { resolveRequestPublicBaseUrl } from '../../../lib/gpu/requestUrl';
import { resolveOwnedWorkspaceScope } from '../../../lib/workspaceStore';

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

const createSchema = z.object({
  projectId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  workload: z.enum(['probe', 'image', 'video', 'audio', '3d']),
  recipe: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._:-]+$/).optional(),
  prompt: z.string().max(5000).optional(),
  inputUrls: z.array(safeUrl).max(12).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

const querySchema = z.object({
  id: z.string().uuid(),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  let user;
  try {
    user = await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  if (req.method === 'GET') {
    const parsed = querySchema.safeParse({ id: Array.isArray(req.query.id) ? req.query.id[0] : req.query.id });
    if (!parsed.success) {
      return res.status(400).json({ error: 'Falta un id de trabajo GPU válido.' });
    }

    try {
      const job = await getGpuJobStatusForUser({
        jobId: parsed.data.id,
        userId: user.uid,
      });
      if (!job) return res.status(404).json({ error: 'Trabajo GPU no encontrado.' });
      return res.status(200).json({ job });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo leer el trabajo GPU.';
      return res.status(500).json({ error: message });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Usa GET o POST.' });
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: parsed.error.issues[0]?.message || 'Trabajo GPU inválido.',
    });
  }

  try {
    const scope = await resolveOwnedWorkspaceScope({
      userId: user.uid,
      projectId: parsed.data.projectId,
      threadId: parsed.data.threadId,
    });
    const { projectId: _projectId, threadId: _threadId, ...gpuInput } = parsed.data;
    const job = await startVastGpuJob({
      userId: user.uid,
      projectId: scope.projectId,
      threadId: scope.threadId,
      input: gpuInput,
      appBaseUrl: resolveRequestPublicBaseUrl(req),
    });

    return res.status(202).json({
      gpuJobId: job.id,
      job,
      text:
        'Nayla alquiló una GPU Vast.ai dentro del presupuesto y le asignó un vencimiento automático. ' +
        'Al terminar, el resultado irá a R2/Bóveda y la instancia se destruirá.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo iniciar la GPU.';
    const status =
      message.includes('no está configurada') ||
      message.includes('falta configurar') ||
      message.includes('No encontré') ||
      message.includes('límite') ||
      message.includes('Saldo protegido') ||
      message.includes('trabajo GPU activo')
        ? 409
        : 500;

    return res.status(status).json({ error: message });
  }
}
