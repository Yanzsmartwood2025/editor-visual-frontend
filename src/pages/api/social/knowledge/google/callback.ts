import type { NextApiRequest, NextApiResponse } from 'next';
import { requestOrigin } from '../../../../../lib/social/http';
import {
  encryptConnectorSecret,
  verifyConnectorState,
} from '../../../../../lib/social/knowledge/crypto';
import {
  exchangeGoogleDriveCode,
  getGoogleUserInfo,
  googleDriveScopeMode,
} from '../../../../../lib/social/knowledge/googleDrive';
import {
  getKnowledgeConnection,
  upsertKnowledgeConnection,
} from '../../../../../lib/social/knowledge/store';

const redirectBack = (
  req: NextApiRequest,
  res: NextApiResponse,
  params: Record<string, string>
) => {
  const origin = requestOrigin(req);
  const query = new URLSearchParams(params).toString();
  res.redirect(302, origin + '/?' + query);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const state = verifyConnectorState(String(req.query.state || ''));
  if (!state) {
    return redirectBack(req, res, {
      social_google: 'error',
      reason: 'invalid_state',
    });
  }

  if (req.query.error) {
    return redirectBack(req, res, {
      social_google: 'error',
      reason: String(req.query.error),
      projectId: state.projectId,
    });
  }

  const code = String(req.query.code || '');
  if (!code) {
    return redirectBack(req, res, {
      social_google: 'error',
      reason: 'missing_code',
      projectId: state.projectId,
    });
  }

  try {
    const origin = requestOrigin(req);
    const redirectUri = origin + '/api/social/knowledge/google/callback';
    const token = await exchangeGoogleDriveCode({ code, redirectUri });
    if (!token.access_token) throw new Error('Google no devolvió un access token.');

    const info = await getGoogleUserInfo(token.access_token);
    const existing = await getKnowledgeConnection({
      userId: state.userId,
      projectId: state.projectId,
    });

    let tokenPatch: Record<string, unknown> = {};
    if (token.refresh_token) {
      const encrypted = encryptConnectorSecret(token.refresh_token);
      tokenPatch = {
        refresh_token_ciphertext: encrypted.ciphertext,
        refresh_token_iv: encrypted.iv,
        refresh_token_tag: encrypted.tag,
      };
    } else if (!existing?.refresh_token_ciphertext) {
      throw new Error('Google no devolvió permiso persistente. Vuelve a conectar la cuenta.');
    }

    await upsertKnowledgeConnection({
      userId: state.userId,
      projectId: state.projectId,
      patch: {
        status: 'connected',
        provider_user_id: info.sub || null,
        email: info.email || null,
        display_name: info.name || null,
        scopes: String(token.scope || '').split(/\s+/).filter(Boolean),
        last_error: null,
        metadata: {
          ...(existing?.metadata || {}),
          scope_mode: googleDriveScopeMode(),
          picture: info.picture || null,
        },
        ...tokenPatch,
      },
    });

    return redirectBack(req, res, {
      social_google: 'connected',
      projectId: state.projectId,
    });
  } catch (error) {
    console.error('[social-google-callback]', error);
    return redirectBack(req, res, {
      social_google: 'error',
      reason: 'callback_failed',
      projectId: state.projectId,
    });
  }
}
