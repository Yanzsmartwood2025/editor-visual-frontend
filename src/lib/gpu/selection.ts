import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VastOffer } from './vastApi';

export type ComputeSelectionTarget = {
  backend: 'vast' | 'runpod' | 'vultr';
  backendId: string;
  gpuName: string;
  gpuRamGb?: number;
  hourlyPrice: number;
};

const selectionSecret = () => {
  const value =
    process.env.NAYLA_COMPUTE_SELECTION_SECRET?.trim() ||
    process.env.VAST_API_KEY?.trim() ||
    process.env.RUNPOD_API_KEY?.trim() ||
    process.env.VULTR_API_KEY?.trim();
  if (!value) throw new Error('Nayla Compute no tiene configurado el secreto de selección.');
  return value;
};

const targetFingerprint = (target: ComputeSelectionTarget) =>
  [
    target.backend,
    target.backendId,
    target.gpuName,
    Number(target.gpuRamGb || 0).toFixed(3),
    Number(target.hourlyPrice || 0).toFixed(8),
  ].join('|');

export const createComputeTargetSelectionId = (
  target: ComputeSelectionTarget
): string =>
  createHmac('sha256', selectionSecret())
    .update(targetFingerprint(target), 'utf8')
    .digest('base64url');

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
};

export const findComputeTargetBySelectionId = <T extends ComputeSelectionTarget>(
  targets: T[],
  selectionId?: string | null
): T | null => {
  if (!selectionId) return targets[0] || null;
  return (
    targets.find((target) =>
      safeEqual(createComputeTargetSelectionId(target), selectionId)
    ) || null
  );
};

// Compatibility wrappers for the existing Vast adapter/tests.
const vastTarget = (offer: VastOffer): ComputeSelectionTarget => ({
  backend: 'vast',
  backendId: String(offer.id),
  gpuName: String(offer.gpu_name || 'GPU'),
  gpuRamGb: Number.isFinite(Number(offer.gpu_ram))
    ? Math.round((Number(offer.gpu_ram) / 1000) * 10) / 10
    : undefined,
  hourlyPrice: Number(offer.dph_total || 0),
});

export const createComputeSelectionId = (offer: VastOffer): string =>
  createComputeTargetSelectionId(vastTarget(offer));

export const findOfferByComputeSelectionId = (
  offers: VastOffer[],
  selectionId?: string | null
): VastOffer | null => {
  if (!selectionId) return offers[0] || null;
  return (
    offers.find((offer) =>
      safeEqual(createComputeSelectionId(offer), selectionId)
    ) || null
  );
};
