import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import { readFile } from 'fs/promises';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { uploadR2Object } from '../../../lib/r2';

export const config = {
  api: {
    bodyParser: false,
  },
};

const firstValue = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });

  try {
    const user = await requireFirebaseUser(req);
    const form = formidable({ maxFileSize: 50 * 1024 * 1024, allowEmptyFiles: false });
    const [fields, files] = await form.parse(req);
    const file = Array.isArray(files.file) ? files.file[0] : files.file;
    const mediaId = firstValue(fields.mediaId);
    const extension = firstValue(fields.extension)?.toLowerCase();

    if (!file) return res.status(400).json({ error: 'Se requiere un archivo.' });
    if (!mediaId || !/^[a-zA-Z0-9-]+$/.test(mediaId)) return res.status(400).json({ error: 'Identificador de archivo inválido.' });
    if (!extension || !/^[a-z0-9]{1,10}$/.test(extension)) return res.status(400).json({ error: 'Extensión de archivo inválida.' });

    // The key is always scoped to the authenticated Firebase user. This matches
    // the format used by the previous bucket and lets the delete endpoint use it directly.
    const key = `${user.uid}/${mediaId}.${extension}`;
    const stored = await uploadR2Object(key, new Uint8Array(await readFile(file.filepath)), file.mimetype || 'application/octet-stream');
    return res.status(201).json(stored);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No se pudo subir el archivo.';
    const status = message.includes('token') || message.includes('Bearer') || message.includes('Firebase') ? 401 : 500;
    return res.status(status).json({ error: message });
  }
}
