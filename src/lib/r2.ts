const dynamicImport = (moduleName: string) => Function('name', 'return import(name)')(moduleName) as Promise<any>;

const r2Config = () => {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  const publicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) throw new Error('R2 no está configurado. Define las variables CLOUDFLARE_R2_*.');
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl: publicBaseUrl.replace(/\/$/, '') };
};

async function client() {
  const config = r2Config();
  const { S3Client } = await dynamicImport('@aws-sdk/client-s3');
  return { config, s3: new S3Client({ region: 'auto', endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }) };
}

export async function uploadR2Object(key: string, body: Uint8Array, contentType: string) {
  const { config, s3 } = await client();
  const { PutObjectCommand } = await dynamicImport('@aws-sdk/client-s3');
  await s3.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }));
  return { key, url: `${config.publicBaseUrl}/${key}` };
}

export async function deleteR2Object(key: string) {
  const { config, s3 } = await client();
  const { DeleteObjectCommand } = await dynamicImport('@aws-sdk/client-s3');
  await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
}
