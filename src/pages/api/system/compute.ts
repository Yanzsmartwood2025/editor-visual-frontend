import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { getGpuBudgetPolicy, getGpuProfile, estimatedWorstCaseCost } from '../../../lib/gpu/profiles';
import { searchVastOffers } from '../../../lib/gpu/vastApi';
import { createComputeSelectionId } from '../../../lib/gpu/selection';
import {
  toNaylaComputeEstimatedPrice,
  toNaylaComputeHourlyPrice,
} from '../../../lib/naylaSystemCatalog';

const querySchema = z.object({
  workload: z.enum(['image', 'video', 'audio', '3d']),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Usa GET.' });

  try {
    await requireFirebaseUser(req);
  } catch {
    return res.status(401).json({ error: 'Token Firebase inválido.' });
  }

  const parsed = querySchema.safeParse({
    workload: Array.isArray(req.query.workload) ? req.query.workload[0] : req.query.workload,
  });
  if (!parsed.success) return res.status(400).json({ error: 'Selecciona image, video, audio o 3d.' });

  try {
    const profile = getGpuProfile(parsed.data.workload);
    const policy = getGpuBudgetPolicy();
    const offers = await searchVastOffers(profile, policy.offerReliabilityMin);

    const cards = offers.map((offer, offerIndex) => {
      const gpuName = typeof offer.gpu_name === 'string' && offer.gpu_name.trim()
        ? offer.gpu_name.trim()
        : 'GPU';
      const ramMb = Number(offer.gpu_ram);
      const ramGb = Number.isFinite(ramMb) ? Math.round((ramMb / 1000) * 10) / 10 : null;
      const internalHourly = Number(offer.dph_total);
      const internalEstimate = estimatedWorstCaseCost(
        internalHourly,
        profile.maxRuntimeMinutes + policy.bootGraceMinutes,
        policy.safetyMultiplier
      );

      return {
        selectionId: createComputeSelectionId(offer),
        gpuName,
        gpuRamGb: ramGb,
        naylaHourlyPriceUsd: toNaylaComputeHourlyPrice(internalHourly),
        naylaEstimatedMaxUsd: toNaylaComputeEstimatedPrice(
          internalEstimate,
          profile.maxRuntimeMinutes + policy.bootGraceMinutes
        ),
        recommended: offerIndex === 0,
      };
    });

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({
      engine: 'Nayla Compute',
      workload: parsed.data.workload,
      executionReady: Boolean(profile.workerImage),
      cards,
      pricingStatus: 'preview',
      note: profile.workerImage
        ? 'Tarjetas disponibles en este momento. La disponibilidad puede cambiar antes de confirmar.'
        : 'Hay tarjetas disponibles, pero este tipo de trabajo todavía necesita su worker antes de ejecutarse.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo consultar Nayla Compute.';
    return res.status(500).json({ error: message.replace(/Vast\.ai/gi, 'Nayla Compute').replace(/\bVast\b/gi, 'Nayla Compute') });
  }
}
