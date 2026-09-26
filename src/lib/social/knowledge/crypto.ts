import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const rawSecret = () => {
  const value = process.env.NAYLA_CONNECTOR_ENCRYPTION_KEY?.trim();
  if (!value) throw new Error('Fuentes de Nayla todavía no tienen clave segura configurada.');
  return value;
};

const key = () => createHash('sha256').update(rawSecret()).digest();

export const encryptConnectorSecret = (value: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64url'),
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
  };
};

export const decryptConnectorSecret = ({
  ciphertext,
  iv,
  tag,
}: {
  ciphertext: string;
  iv: string;
  tag: string;
}) => {
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
};

const stateSignature = (payload: string) =>
  createHmac('sha256', key()).update(payload).digest('base64url');

export const createConnectorState = ({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) => {
  const payload = Buffer.from(JSON.stringify({
    userId,
    projectId,
    nonce: randomBytes(12).toString('hex'),
    exp: Date.now() + 10 * 60_000,
  })).toString('base64url');
  return payload + '.' + stateSignature(payload);
};

export const verifyConnectorState = (state: string) => {
  const [payload, signature] = String(state || '').split('.');
  if (!payload || !signature) return null;
  const expected = stateSignature(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      userId?: string;
      projectId?: string;
      exp?: number;
    };
    if (!parsed.userId || !parsed.projectId || !parsed.exp || parsed.exp < Date.now()) return null;
    return {
      userId: String(parsed.userId),
      projectId: String(parsed.projectId),
    };
  } catch {
    return null;
  }
};
