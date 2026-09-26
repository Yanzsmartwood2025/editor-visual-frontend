import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSocialUser } from '../../../../../lib/social/http';
import { refreshGoogleDriveAccessToken, googleDriveScopeMode } from '../../../../../lib/social/knowledge/googleDrive';
import { getKnowledgeConnection } from '../../../../../lib/social/knowledge/store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });
  const user = await requireSocialUser(req, res);
  if (!user) return;

  const projectId = String(req.query.projectId || '');
  if (!projectId) return res.status(400).json({ error: 'Falta projectId.' });

  try {
    const connection = await getKnowledgeConnection({ userId: user.uid, projectId });
    if (!connection || connection.status !== 'connected') {
      return res.status(409).json({ error: 'Google Drive no está conectado.' });
    }

    const accessToken = await refreshGoogleDriveAccessToken(connection);
    return res.status(200).json({
      accessToken,
      scopeMode: googleDriveScopeMode(),
      pickerApiKey: process.env.GOOGLE_DRIVE_PICKER_API_KEY || null,
      pickerAppId: process.env.GOOGLE_DRIVE_APP_ID || null,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo abrir Google Drive.',
    });
  }
}
