import { createHmac, createHash } from 'crypto';
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const r2Config = () => {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  const publicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.replace(/\/$/, '');

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('R2 no está configurado. Define las variables CLOUDFLARE_R2_ACCOUNT_ID, ACCESS_KEY_ID, SECRET_ACCESS_KEY y BUCKET.');
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
};

async function client() {
  const config = r2Config();
  return {
    config,
    s3: new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
}

const encodeRfc3986 = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );

const encodeObjectPath = (key: string) =>
  '/' + key.split('/').map(encodeRfc3986).join('/');

const hmac = (key: Buffer | string, value: string) =>
  createHmac('sha256', key).update(value, 'utf8').digest();

const sha256Hex = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

const amzTimestamp = (date: Date) =>
  date.toISOString().replace(/[:-]|\.\d{3}/g, '');

const validateKey = (key: string) => {
  if (!key || key.startsWith('/') || key.includes('..')) {
    throw new Error('Clave R2 inválida.');
  }
};

const createPresignedUrl = ({
  method,
  key,
  contentType,
  expiresIn,
  now,
}: {
  method: 'GET' | 'PUT';
  key: string;
  contentType?: string;
  expiresIn: number;
  now: Date;
}) => {
  validateKey(key);
  if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > 604800) {
    throw new Error('Expiración inválida para la URL firmada.');
  }
  if (contentType && /[\r\n]/.test(contentType)) {
    throw new Error('Content-Type inválido.');
  }

  const config = r2Config();
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const path = encodeObjectPath(`${config.bucket}/${key}`);
  const amzDate = amzTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const signedHeaders = contentType ? 'content-type;host' : 'host';

  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresIn),
    'X-Amz-SignedHeaders': signedHeaders,
  };

  const canonicalQuery = Object.entries(queryParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${encodeRfc3986(name)}=${encodeRfc3986(value)}`)
    .join('&');

  const normalizedContentType = contentType?.trim().toLowerCase();
  const canonicalHeaders =
    (normalizedContentType ? `content-type:${normalizedContentType}\n` : '') +
    `host:${host}\n`;

  const canonicalRequest = [
    method,
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const kDate = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, 'auto');
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning)
    .update(stringToSign, 'utf8')
    .digest('hex');

  return {
    url: `https://${host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    normalizedContentType,
  };
};

export type R2PresignedUpload = {
  key: string;
  url: string;
  uploadUrl: string;
  contentType: string;
  expiresIn: number;
};

export type R2PresignedDownload = {
  key: string;
  url: string;
  expiresIn: number;
};

export const createR2StorageUrl = (key: string) => {
  validateKey(key);
  const config = r2Config();
  return `r2://${config.bucket}${encodeObjectPath(key)}`;
};

export const createR2PresignedGetUrl = ({
  key,
  expiresIn = 900,
  now = new Date(),
}: {
  key: string;
  expiresIn?: number;
  now?: Date;
}): R2PresignedDownload => {
  const signed = createPresignedUrl({
    method: 'GET',
    key,
    expiresIn,
    now,
  });

  return { key, url: signed.url, expiresIn };
};

/**
 * Creates a short-lived AWS Signature V4 PUT URL for Cloudflare R2.
 * The browser uploads directly to R2, so file bytes never cross a Vercel Function.
 */
export const createR2PresignedPutUrl = ({
  key,
  contentType,
  expiresIn = 900,
  now = new Date(),
}: {
  key: string;
  contentType: string;
  expiresIn?: number;
  now?: Date;
}): R2PresignedUpload => {
  if (!contentType) throw new Error('Content-Type inválido.');
  if (expiresIn > 3600) throw new Error('La URL de subida no puede exceder 1 hora.');

  const signed = createPresignedUrl({
    method: 'PUT',
    key,
    contentType,
    expiresIn,
    now,
  });

  const config = r2Config();
  const stableUrl = config.publicBaseUrl
    ? `${config.publicBaseUrl}${encodeObjectPath(key)}`
    : createR2StorageUrl(key);

  return {
    key,
    url: stableUrl,
    uploadUrl: signed.url,
    contentType: signed.normalizedContentType || contentType.trim().toLowerCase(),
    expiresIn,
  };
};

export async function uploadR2Object(key: string, body: Uint8Array, contentType: string) {
  const { config, s3 } = await client();
  await s3.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );

  return {
    key,
    url: config.publicBaseUrl
      ? `${config.publicBaseUrl}${encodeObjectPath(key)}`
      : createR2StorageUrl(key),
    privateUrl: createR2StorageUrl(key),
    readUrl: createR2PresignedGetUrl({ key, expiresIn: 900 }).url,
  };
}

export async function deleteR2Object(key: string) {
  const { config, s3 } = await client();
  await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}

export async function headR2Object(key: string) {
  const { s3, config } = await client();
  const result = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  return {
    contentType: result.ContentType,
    contentLength: result.ContentLength,
    etag: result.ETag,
  };
}
