import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { uploadR2Object } from '../../../lib/r2';
import { resolveOwnedWorkspaceScope } from '../../../lib/workspaceStore';

const MAX_PROXY_BYTES = 4 * 1024 * 1024;

const fieldSchema = z.object({
  mediaId: z.string().regex(/^[a-zA-Z0-9-]+$/),
  extension: z.string().regex(/^[a-z0-9]{1,10}$/),
  kind: z.enum(['foto', 'video', 'audio', 'modelo3d', 'documento']),
  projectId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
});

const fieldValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const detectMediaKind = ({
  contentType,
  extension,
}: {
  contentType: string;
  extension: string;
}): 'foto' | 'video' | 'audio' | 'modelo3d' | 'documento' | null => {
  const mime = contentType.toLowerCase();
  const ext = extension.toLowerCase();

  if (mime.startsWith('image/')) return 'foto';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'model/gltf-binary' || ext === 'glb') return 'modelo3d';
  if (
    mime === 'application/pdf' ||
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/rtf' ||
    mime.startsWith('text/') ||
    mime === 'application/json'
  ) return 'documento';

  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif'].includes(ext)) return 'foto';
  if (['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac'].includes(ext)) return 'audio';
  if (['pdf', 'txt', 'md', 'markdown', 'csv', 'json', 'rtf', 'doc', 'docx'].includes(ext)) return 'documento';

  return null;
};

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Usa POST.' });
  }

  try {
    const user = await requireFirebaseUser(req);
    const form = formidable({
      multiples: false,
      maxFiles: 1,
      maxFileSize: MAX_PROXY_BYTES,
      allowEmptyFiles: false,
    });

    const [fields, files] = await form.parse(req);
    const uploaded = Array.isArray(files.file) ? files.file[0] : files.file;

    if (!uploaded) {
      return res.status(400).json({ error: 'No se recibió ningún archivo.' });
    }

    const parsed = fieldSchema.safeParse({
      mediaId: fieldValue(fields.mediaId),
      extension: fieldValue(fields.extension),
      kind: fieldValue(fields.kind),
      projectId: fieldValue(fields.projectId) || undefined,
      threadId: fieldValue(fields.threadId) || undefined,
    });

    if (!parsed.success) {
      return res.status(400).json({ error: 'Datos de subida inválidos.' });
    }

    if (uploaded.size > MAX_PROXY_BYTES) {
      return res.status(413).json({
        error: 'Este archivo necesita la ruta de subida directa de Nayla.',
      });
    }

    const contentType = String(uploaded.mimetype || 'application/octet-stream').toLowerCase();
    const detectedKind = detectMediaKind({
      contentType,
      extension: parsed.data.extension,
    });

    if (!detectedKind || detectedKind !== parsed.data.kind) {
      return res.status(415).json({ error: 'Tipo de archivo no soportado.' });
    }

    const scope = await resolveOwnedWorkspaceScope({
      userId: user.uid,
      projectId: parsed.data.projectId,
      threadId: parsed.data.threadId,
    });

    const threadSegment = scope.threadId ? `threads/${scope.threadId}` : 'shared';
    const key =
      `${user.uid}/projects/${scope.projectId}/${threadSegment}/${parsed.data.kind}/` +
      `${parsed.data.mediaId}.${parsed.data.extension.toLowerCase()}`;

    const body = await readFile(uploaded.filepath);
    const stored = await uploadR2Object(key, new Uint8Array(body), contentType);

    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({
      key: stored.key,
      url: stored.readUrl,
      projectId: scope.projectId,
      threadId: scope.threadId || null,
      privacy: 'private',
      uploadMode: 'nayla-fallback',
    });
  } catch (error: any) {
    const message = String(error?.message || 'No se pudo completar la subida.');
    const isAuth = /token|Bearer|Firebase/i.test(message);
    const isTooLarge = /maxFileSize|too large|max file size/i.test(message);

    if (isTooLarge) {
      return res.status(413).json({
        error: 'Este archivo necesita la ruta de subida directa de Nayla.',
      });
    }

    if (!isAuth) console.error('Nayla upload fallback falló:', error);
    return res.status(isAuth ? 401 : 500).json({
      error: isAuth ? 'Sesión no válida.' : 'Nayla no pudo completar la subida en este intento.',
    });
  }
}
