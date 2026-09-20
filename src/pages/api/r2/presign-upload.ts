import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import {
  createR2PresignedGetUrl,
  createR2PresignedPutUrl,
} from '../../../lib/r2';
import { resolveOwnedWorkspaceScope } from '../../../lib/workspaceStore';

const schema = z.object({
  mediaId: z.string().regex(/^[a-zA-Z0-9-]+$/),
  extension: z.string().regex(/^[a-z0-9]{1,10}$/),
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive().max(5 * 1024 * 1024 * 1024),
  kind: z.enum(['foto', 'video', 'audio', 'modelo3d']).optional().default('foto'),
  projectId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
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

    const scope = await resolveOwnedWorkspaceScope({
      userId: user.uid,
      projectId: parsed.data.projectId,
      threadId: parsed.data.threadId,
    });

    const { mediaId, extension, contentType, kind } = parsed.data;
    const threadSegment = scope.threadId ? `threads/${scope.threadId}` : 'shared';
    const key =
      `${user.uid}/projects/${scope.projectId}/${threadSegment}/${kind}/` +
      `${mediaId}.${extension.toLowerCase()}`;

    const signed = createR2PresignedPutUrl({
      key,
      contentType,
      expiresIn: 900,
    });
    const read = createR2PresignedGetUrl({ key, expiresIn: 900 });

    return res.status(200).json({
      ...signed,
      url: read.url,
      projectId: scope.projectId,
      threadId: scope.threadId || null,
      privacy: 'private',
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'No se pudo autorizar la subida.';
    const status =
      message.includes('token') ||
      message.includes('Bearer') ||
      message.includes('Firebase')
        ? 401
        : message.includes('no existe') || message.includes('no pertenece')
          ? 403
          : 500;

    return res.status(status).json({ error: message });
  }
}
