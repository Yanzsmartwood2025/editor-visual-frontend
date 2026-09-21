import type { NextApiRequest, NextApiResponse } from 'next';
import { readRawBody, storeWebhookEvent, verifyUploadPostWebhook } from '../../../../lib/social/webhooks';

export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const rawBody = await readRawBody(req);
    const timestamp = String(req.headers['x-upload-post-timestamp'] || '');
    const signature = String(req.headers['x-upload-post-signature'] || '');
    if (!verifyUploadPostWebhook({ rawBody, timestamp, signature })) return res.status(401).end();
    const payload = JSON.parse(rawBody.toString('utf8') || '{}');
    const eventType = String(req.headers['x-upload-post-event'] || payload?.event || 'unknown');
    const eventId = String(req.headers['x-upload-post-delivery'] || payload?.delivery_id || '') || null;
    await storeWebhookEvent({ provider: 'upload_post', eventId, eventType, payload });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Webhook inválido.' });
  }
}
