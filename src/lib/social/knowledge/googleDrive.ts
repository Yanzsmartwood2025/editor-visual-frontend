import { decryptConnectorSecret } from './crypto';

const OAUTH_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';

export type GoogleDriveScopeMode = 'selected' | 'readonly';

export const googleDriveScopeMode = (): GoogleDriveScopeMode =>
  String(process.env.GOOGLE_DRIVE_SCOPE_MODE || 'selected').toLowerCase() === 'readonly'
    ? 'readonly'
    : 'selected';

export const googleDriveConfigured = () =>
  Boolean(
    process.env.GOOGLE_DRIVE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim() &&
    process.env.NAYLA_CONNECTOR_ENCRYPTION_KEY?.trim()
  );

const clientId = () => {
  const value = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
  if (!value) throw new Error('Google Drive todavía no está configurado en Nayla.');
  return value;
};

const clientSecret = () => {
  const value = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();
  if (!value) throw new Error('Google Drive todavía no está configurado en Nayla.');
  return value;
};

export const googleDriveScopes = () => {
  const driveScope = googleDriveScopeMode() === 'readonly'
    ? 'https://www.googleapis.com/auth/drive.readonly'
    : 'https://www.googleapis.com/auth/drive.file';
  return ['openid', 'email', 'profile', driveScope];
};

export const buildGoogleDriveAuthorizeUrl = ({
  redirectUri,
  state,
}: {
  redirectUri: string;
  state: string;
}) => {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    scope: googleDriveScopes().join(' '),
  });
  return OAUTH_AUTHORIZE + '?' + params.toString();
};

const readJson = async (response: Response) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(payload?.error_description || payload?.error?.message || payload?.error || `Google HTTP ${response.status}`));
  }
  return payload;
};

export const exchangeGoogleDriveCode = async ({
  code,
  redirectUri,
}: {
  code: string;
  redirectUri: string;
}) => {
  const response = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  return readJson(response) as Promise<{
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    token_type?: string;
    id_token?: string;
  }>;
};

export const refreshGoogleDriveAccessToken = async (connection: any) => {
  if (
    !connection?.refresh_token_ciphertext ||
    !connection?.refresh_token_iv ||
    !connection?.refresh_token_tag
  ) {
    throw new Error('La conexión de Google necesita volver a autorizarse.');
  }

  const refreshToken = decryptConnectorSecret({
    ciphertext: String(connection.refresh_token_ciphertext),
    iv: String(connection.refresh_token_iv),
    tag: String(connection.refresh_token_tag),
  });

  const response = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: 'refresh_token',
    }),
  });

  const payload = await readJson(response);
  return String(payload.access_token || '');
};

export const getGoogleUserInfo = async (accessToken: string) => {
  const response = await fetch(USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return readJson(response) as Promise<{
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
  }>;
};

export type GoogleDriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
  md5Checksum?: string;
  version?: string;
  parents?: string[];
  capabilities?: { canDownload?: boolean };
};

const driveFetch = async (accessToken: string, path: string) => {
  const response = await fetch(DRIVE_API + path, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return readJson(response);
};

export const getGoogleDriveFile = async (accessToken: string, fileId: string): Promise<GoogleDriveFile> => {
  const fields = 'id,name,mimeType,modifiedTime,webViewLink,md5Checksum,version,parents,capabilities(canDownload)';
  return driveFetch(accessToken, `/files/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(fields)}&supportsAllDrives=true`);
};

export const listRecentGoogleDocuments = async ({
  accessToken,
  query,
  pageSize = 30,
}: {
  accessToken: string;
  query?: string;
  pageSize?: number;
}): Promise<GoogleDriveFile[]> => {
  const clauses = [
    'trashed = false',
    "(mimeType = 'application/vnd.google-apps.document' or mimeType = 'text/plain' or mimeType = 'text/markdown')",
  ];
  if (query?.trim()) {
    const safe = query.trim().replace(/'/g, "\\'");
    clauses.push(`name contains '${safe}'`);
  }
  const params = new URLSearchParams({
    q: clauses.join(' and '),
    orderBy: 'modifiedTime desc',
    pageSize: String(Math.max(1, Math.min(100, pageSize))),
    fields: 'files(id,name,mimeType,modifiedTime,webViewLink,md5Checksum,version,parents,capabilities(canDownload)),nextPageToken',
    spaces: 'drive',
  });
  const payload = await driveFetch(accessToken, '/files?' + params.toString());
  return Array.isArray(payload?.files) ? payload.files : [];
};

export const exportGoogleDriveText = async ({
  accessToken,
  file,
}: {
  accessToken: string;
  file: GoogleDriveFile;
}) => {
  let url = '';

  if (file.mimeType === 'application/vnd.google-apps.document') {
    url = `${DRIVE_API}/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent('text/plain')}`;
  } else if (['text/plain', 'text/markdown', 'application/json'].includes(file.mimeType)) {
    url = `${DRIVE_API}/files/${encodeURIComponent(file.id)}?alt=media`;
  } else {
    throw new Error(`"${file.name}" todavía no tiene un extractor de texto compatible.`);
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || `No se pudo leer "${file.name}".`);
  }
  return response.text();
};

export const googleDriveFileVersion = (file: GoogleDriveFile) =>
  String(file.version || file.md5Checksum || file.modifiedTime || 'unknown');
