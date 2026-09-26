import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSocialUser, requestOrigin } from '../../../../../lib/social/http';
import { createConnectorState } from '../../../../../lib/social/knowledge/crypto';
import {
  buildGoogleDriveAuthorizeUrl,
  googleDriveConfigured,
  googleDriveScopeMode,
} from '../../../../../lib/social/knowledge/googleDrive';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });

  const user = await requireSocialUser(req, res);
  if (!user) return;

  const projectId = String(req.body?.projectId || '');
  if (!projectId) return res.status(400).json({ error: 'Falta projectId.' });

  if (!googleDriveConfigured()) {
    return res.status(503).json({
      error: 'Google Drive todavía no está configurado en Fuentes de Nayla.',
      code: 'google_drive_not_configured',
    });
  }

  try {
    const origin = requestOrigin(req);
    const redirectUri = origin + '/api/social/knowledge/google/callback';
    const state = createConnectorState({ userId: user.uid, projectId });
    const authUrl = buildGoogleDriveAuthorizeUrl({ redirectUri, state });

    return res.status(200).json({
      authUrl,
      mode: googleDriveScopeMode(),
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo iniciar Google Drive.',
    });
  }
}
