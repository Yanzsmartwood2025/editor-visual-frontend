import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireSocialUser } from '../../../../../lib/social/http';
import { getGoogleDriveFile, refreshGoogleDriveAccessToken } from '../../../../../lib/social/knowledge/googleDrive';
import {
  getKnowledgeConnection,
  listKnowledgeSourceItems,
  upsertKnowledgeSourceItem,
} from '../../../../../lib/social/knowledge/store';

const schema = z.object({
  projectId: z.string().uuid(),
  fileIds: z.array(z.string().min(5).max(300)).min(1).max(50),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireSocialUser(req, res);
  if (!user) return;

  try {
    if (req.method === 'GET') {
      const projectId = String(req.query.projectId || '');
      if (!projectId) return res.status(400).json({ error: 'Falta projectId.' });
      const sources = await listKnowledgeSourceItems({ userId: user.uid, projectId });
      return res.status(200).json({ sources });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Usa GET o POST.' });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Selección inválida.' });

    const connection = await getKnowledgeConnection({
      userId: user.uid,
      projectId: parsed.data.projectId,
    });
    if (!connection || connection.status !== 'connected') {
      return res.status(409).json({ error: 'Google Drive no está conectado.' });
    }

    const accessToken = await refreshGoogleDriveAccessToken(connection);
    const saved = [];

    for (const fileId of Array.from(new Set(parsed.data.fileIds))) {
      const file = await getGoogleDriveFile(accessToken, fileId);
      if (![
        'application/vnd.google-apps.document',
        'text/plain',
        'text/markdown',
        'application/json',
      ].includes(file.mimeType)) {
        continue;
      }

      const item = await upsertKnowledgeSourceItem({
        connectionId: connection.id,
        userId: user.uid,
        projectId: parsed.data.projectId,
        item: {
          providerItemId: file.id,
          name: file.name,
          mimeType: file.mimeType,
          webUrl: file.webViewLink || null,
          sourceModifiedAt: file.modifiedTime || null,
          metadata: {
            version: file.version || null,
            md5Checksum: file.md5Checksum || null,
          },
        },
      });
      saved.push(item);
    }

    return res.status(200).json({
      saved: saved.length,
      sources: saved,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudieron guardar las fuentes.',
    });
  }
}
