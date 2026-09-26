import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSocialUser } from '../../../../../lib/social/http';
import {
  googleDriveConfigured,
  googleDriveScopeMode,
} from '../../../../../lib/social/knowledge/googleDrive';
import {
  getKnowledgeConnection,
  getLatestProgramSummary,
  listKnowledgeSourceItems,
} from '../../../../../lib/social/knowledge/store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });

  const user = await requireSocialUser(req, res);
  if (!user) return;

  const projectId = String(req.query.projectId || '');
  if (!projectId) return res.status(400).json({ error: 'Falta projectId.' });

  try {
    const [connection, sources, latestProgram] = await Promise.all([
      getKnowledgeConnection({ userId: user.uid, projectId }),
      listKnowledgeSourceItems({ userId: user.uid, projectId }),
      getLatestProgramSummary({ userId: user.uid, projectId }),
    ]);

    return res.status(200).json({
      configured: googleDriveConfigured(),
      scopeMode: googleDriveScopeMode(),
      connected: connection?.status === 'connected',
      status: connection?.status || 'disconnected',
      email: connection?.email || null,
      displayName: connection?.display_name || null,
      lastSyncAt: connection?.last_sync_at || null,
      lastError: connection?.last_error || null,
      sources: sources.map((item: any) => ({
        id: item.id,
        name: item.name,
        mimeType: item.mime_type,
        webUrl: item.web_url,
        modifiedAt: item.source_modified_at,
        lastSyncedAt: item.last_synced_at,
      })),
      latestProgram: latestProgram
        ? {
            id: latestProgram.id,
            date: latestProgram.program_date,
            name: latestProgram.program_name,
            character: latestProgram.character_name,
            channel: latestProgram.channel_name,
            theme: latestProgram.theme,
            song: latestProgram.song,
            summary: latestProgram.summary,
            source: Array.isArray(latestProgram.social_source_items)
              ? latestProgram.social_source_items[0]
              : latestProgram.social_source_items,
          }
        : null,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo revisar Google Drive.',
    });
  }
}
