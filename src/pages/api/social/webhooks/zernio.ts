import type { NextApiRequest, NextApiResponse } from 'next';
import { bestEffortCacheZernioRealtime, readRawBody, storeWebhookEvent, verifyZernioWebhook } from '../../../../lib/social/webhooks';

export const config = { api: { bodyParser: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const rawBody = await readRawBody(req);
    const signature = String(req.headers['x-zernio-signature'] || '');
    if (!verifyZernioWebhook({ rawBody, signature })) return res.status(401).end();
    const payload = JSON.parse(rawBody.toString('utf8') || '{}');
    const eventType = String(payload?.event || payload?.type || 'unknown');
    const eventId = String(req.headers['x-zernio-event-id'] || payload?.id || '') || null;
    await storeWebhookEvent({ provider: 'zernio', eventId, eventType, payload });
    await bestEffortCacheZernioRealtime(payload);
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Webhook inválido.' });
  }
}
