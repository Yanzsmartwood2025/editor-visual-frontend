import { createHash } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createR2PresignedGetUrl,
  createR2PresignedPutUrl,
  deleteR2Object,
  headR2Object,
} from '../../../../lib/r2';
import { markNaylaPcDesktopReady } from '../../../../lib/pc/instances';
import {
  getNaylaPcDriveSessionByTokenHash,
  getNaylaPcInstanceById,
  listNaylaPcDriveFiles,
  patchNaylaPcInstance,
  softDeleteNaylaPcDriveFile,
  touchNaylaPcDriveSession,
  upsertNaylaPcDriveFile,
} from '../../../../lib/pc/store';

const hash = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

const normalizeRelativePath = (value: unknown) => {
  const raw = String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')
    .trim();

  if (
    !raw ||
    raw.length > 900 ||
    raw.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('Ruta de Nayla Drive inválida.');
  }

  return raw;
};

const expectedR2Key = (userId: string, relativePath: string) =>
  'pc-drive/' + hash(userId).slice(0, 32) + '/' + relativePath;

const authSession = async (req: NextApiRequest) => {
  const authorization = String(req.headers.authorization || '');
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  const instanceId = String(req.headers['x-nayla-pc-instance'] || '').trim();

  if (!token || !instanceId) return null;

  const session = await getNaylaPcDriveSessionByTokenHash(hash(token));
  if (!session || session.instance_id !== instanceId) return null;

  await touchNaylaPcDriveSession(session.id).catch(() => undefined);
  return session;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  const session = await authSession(req).catch(() => null);
  if (!session) {
    return res.status(401).json({ error: 'Sesión Nayla Drive inválida.' });
  }

  try {
    if (req.method === 'GET') {
      const [rows, instance] = await Promise.all([
        listNaylaPcDriveFiles(session.user_id),
        getNaylaPcInstanceById(session.instance_id),
      ]);

      const flushRequested =
        instance?.status === 'snapshotting' &&
        typeof instance.metadata?.drive_flush_requested_at === 'string';
      const flushCompleted =
        typeof instance?.metadata?.drive_flush_completed_at === 'string';

      return res.status(200).json({
        prepareSnapshot: Boolean(flushRequested && !flushCompleted),
        freezeForSnapshot: Boolean(flushRequested && flushCompleted),
        files: rows.slice(0, 5000).map((row) => ({
          relativePath: row.relative_path,
          sizeBytes: Number(row.size_bytes),
          contentType: row.content_type || undefined,
          contentSha256: row.content_sha256 || undefined,
          modifiedAt: row.modified_at || undefined,
          uploadedAt: row.uploaded_at,
          downloadUrl: createR2PresignedGetUrl({
            key: row.r2_key,
            expiresIn: 900,
          }).url,
        })),
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido.' });
    }

    const action = String(req.body?.action || '').trim().toLowerCase();

    if (action === 'desktop_ready') {
      const instance = await getNaylaPcInstanceById(session.instance_id);
      if (!instance || instance.user_id !== session.user_id) {
        return res.status(409).json({ error: 'La PC ya no está disponible.' });
      }

      if (
        !['provisioning', 'running', 'rebooting'].includes(String(instance.status))
      ) {
        return res.status(409).json({
          error: 'La PC no está en un estado válido para marcar el escritorio listo.',
        });
      }

      const ready = await markNaylaPcDesktopReady(instance);
      return res.status(200).json({
        ok: true,
        readyAt: ready.ready_at,
        billableStartedAt: ready.billable_started_at,
        expiresAt: ready.expires_at,
      });
    }

    if (action === 'snapshot_cache_flushed') {
      const instance = await getNaylaPcInstanceById(session.instance_id);
      if (
        !instance ||
        instance.user_id !== session.user_id ||
        instance.status !== 'snapshotting' ||
        typeof instance.metadata?.drive_flush_requested_at !== 'string'
      ) {
        return res.status(409).json({
          error: 'La PC ya no está preparando un snapshot.',
        });
      }

      const completedAt = new Date().toISOString();
      await patchNaylaPcInstance({
        instanceId: instance.id,
        patch: {
          metadata: {
            ...(instance.metadata || {}),
            drive_flush_completed_at: completedAt,
            save_stage: 'drive_flushed',
          },
        },
      });

      return res.status(200).json({ ok: true, completedAt });
    }

    const relativePath = normalizeRelativePath(req.body?.relativePath);
    const r2Key = expectedR2Key(session.user_id, relativePath);

    if (action === 'presign_upload') {
      const sizeBytes = Number(req.body?.sizeBytes);
      if (!Number.isFinite(sizeBytes) || sizeBytes < 0 || sizeBytes > 5 * 1024 ** 3) {
        return res.status(422).json({
          error: 'Este archivo supera el límite actual de 5 GB por archivo de Nayla Drive.',
        });
      }

      const contentType =
        String(req.body?.contentType || 'application/octet-stream')
          .trim()
          .slice(0, 180) || 'application/octet-stream';

      const upload = createR2PresignedPutUrl({
        key: r2Key,
        contentType,
        expiresIn: 900,
      });

      return res.status(200).json({
        r2Key,
        uploadUrl: upload.uploadUrl,
        expiresIn: upload.expiresIn,
      });
    }

    if (action === 'delete_file') {
      const row = (await listNaylaPcDriveFiles(session.user_id)).find(
        (item) => item.relative_path === relativePath
      );

      if (!row) {
        return res.status(200).json({ ok: true, deleted: false });
      }

      await deleteR2Object(row.r2_key);
      await softDeleteNaylaPcDriveFile({
        userId: session.user_id,
        relativePath,
      });

      return res.status(200).json({ ok: true, deleted: true });
    }

    if (action === 'confirm_upload') {
      if (String(req.body?.r2Key || '') !== r2Key) {
        return res.status(400).json({ error: 'Destino R2 inválido.' });
      }

      const head = await headR2Object(r2Key);
      const claimedSize = Number(req.body?.sizeBytes);
      const actualSize = Number(head.contentLength || 0);

      if (
        !Number.isFinite(claimedSize) ||
        claimedSize < 0 ||
        actualSize !== claimedSize
      ) {
        return res.status(409).json({
          error: 'El tamaño subido no coincide con el archivo confirmado.',
        });
      }

      const row = await upsertNaylaPcDriveFile({
        userId: session.user_id,
        relativePath,
        r2Key,
        contentType:
          String(req.body?.contentType || head.contentType || 'application/octet-stream')
            .trim()
            .slice(0, 180),
        sizeBytes: actualSize,
        etag:
          typeof head.etag === 'string'
            ? head.etag.replace(/^"|"$/g, '')
            : null,
        contentSha256: String(req.body?.contentSha256 || '').slice(0, 128) || null,
        modifiedAt:
          typeof req.body?.modifiedAt === 'string'
            ? req.body.modifiedAt
            : null,
      });

      return res.status(200).json({
        ok: true,
        file: {
          relativePath: row.relative_path,
          sizeBytes: Number(row.size_bytes),
          uploadedAt: row.uploaded_at,
        },
      });
    }

    return res.status(400).json({ error: 'Acción Nayla Drive no válida.' });
  } catch (error) {
    return res.status(500).json({
      error:
        error instanceof Error ? error.message : 'Nayla Drive no pudo sincronizar.',
    });
  }
}
