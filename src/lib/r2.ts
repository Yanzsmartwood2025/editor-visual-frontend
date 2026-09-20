import { createHmac, createHash } from 'crypto';
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const r2Config = () => {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  const publicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    throw new Error('R2 no está configurado. Define las variables CLOUDFLARE_R2_*.');
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/$/, ''),
  };
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

export type R2PresignedUpload = {
  key: string;
  url: string;
  uploadUrl: string;
  contentType: string;
  expiresIn: number;
};

/**
 * Creates a short-lived AWS Signature V4 PUT URL for Cloudflare R2.
 *
 * The browser uploads directly to R2, so the file body never crosses a Vercel
 * Function and therefore does not hit Vercel's request payload limit.
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
  if (!key || key.startsWith('/')) {
    throw new Error('Clave R2 inválida.');
  }
  if (!contentType || /[\r\n]/.test(contentType)) {
    throw new Error('Content-Type inválido.');
  }
  if (!Number.isInteger(expiresIn) || expiresIn < 60 || expiresIn > 3600) {
    throw new Error('Expiración inválida para la URL de subida.');
  }

  const config = r2Config();
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const path = encodeObjectPath(`${config.bucket}/${key}`);
  const amzDate = amzTimestamp(now);
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const signedHeaders = 'content-type;host';

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

  const normalizedContentType = contentType.trim().toLowerCase();
  const canonicalHeaders =
    `content-type:${normalizedContentType}\n` +
    `host:${host}\n`;

  const canonicalRequest = [
    'PUT',
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
    key,
    url: `${config.publicBaseUrl}${encodeObjectPath(key)}`,
    uploadUrl: `https://${host}${path}?${canonicalQuery}&X-Amz-Signature=${signature}`,
    contentType: normalizedContentType,
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
  return { key, url: `${config.publicBaseUrl}${encodeObjectPath(key)}` };
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
