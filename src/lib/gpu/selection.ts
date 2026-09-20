import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VastOffer } from './vastApi';

const selectionSecret = () => {
  const value =
    process.env.NAYLA_COMPUTE_SELECTION_SECRET?.trim() ||
    process.env.VAST_API_KEY?.trim();
  if (!value) throw new Error('Nayla Compute no tiene configurado el secreto de selección.');
  return value;
};

const offerFingerprint = (offer: VastOffer) =>
  [
    Number(offer.id),
    String(offer.gpu_name || ''),
    Number(offer.gpu_ram || 0),
    Number(offer.dph_total || 0).toFixed(8),
  ].join('|');

export const createComputeSelectionId = (offer: VastOffer): string =>
  createHmac('sha256', selectionSecret())
    .update(offerFingerprint(offer), 'utf8')
    .digest('base64url');

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
};

export const findOfferByComputeSelectionId = (
  offers: VastOffer[],
  selectionId?: string | null
): VastOffer | null => {
  if (!selectionId) return offers[0] || null;
  return (
    offers.find((offer) => safeEqual(createComputeSelectionId(offer), selectionId)) ||
    null
  );
};
