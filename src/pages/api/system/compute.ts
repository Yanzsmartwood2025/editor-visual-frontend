import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import {
  estimatedWorstCaseCost,
  getGpuBudgetPolicy,
  getGpuProfile,
} from '../../../lib/gpu/profiles';
import { getComputeCatalog } from '../../../lib/gpu/computeCatalog';
import { createComputeTargetSelectionId } from '../../../lib/gpu/selection';
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
  if (!parsed.success) {
    return res.status(400).json({ error: 'Selecciona image, video, audio o 3d.' });
  }

  try {
    const profile = getGpuProfile(parsed.data.workload);
    const policy = getGpuBudgetPolicy();
    const catalog = await getComputeCatalog({
      profile,
      minReliability: policy.offerReliabilityMin,
    });

    const quoteRuntimeMinutes =
      profile.maxRuntimeMinutes + policy.bootGraceMinutes;

    const evaluated = catalog.candidates.map((candidate) => {
      const internalEstimate = estimatedWorstCaseCost(
        candidate.hourlyPrice,
        quoteRuntimeMinutes,
        policy.safetyMultiplier
      );

      let unavailableReason: string | undefined;
      if (candidate.hourlyPrice > profile.maxHourlyUsd) {
        unavailableReason =
          'Supera el límite por hora configurado para este tipo de trabajo.';
      } else if (internalEstimate > policy.maxJobUsd) {
        unavailableReason =
          'Supera el tope de gasto configurado para un solo trabajo.';
      } else if (
        candidate.balanceUsd - internalEstimate <
        policy.minBalanceReserveUsd
      ) {
        unavailableReason =
          'No entra dentro del saldo protegido actual de Nayla Compute.';
      }

      return {
        selectionId: createComputeTargetSelectionId(candidate),
        gpuName: candidate.gpuName,
        gpuRamGb: candidate.gpuRamGb ?? null,
        naylaHourlyPriceUsd: toNaylaComputeHourlyPrice(candidate.hourlyPrice),
        naylaEstimatedMaxUsd: toNaylaComputeEstimatedPrice(
          internalEstimate,
          quoteRuntimeMinutes
        ),
        available: !unavailableReason,
        unavailableReason,
      };
    });

    const recommendedId =
      evaluated.find((card) => card.available)?.selectionId || null;

    const cards = evaluated.map((card) => ({
      ...card,
      recommended: card.selectionId === recommendedId,
    }));

    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({
      engine: 'Nayla Compute',
      workload: parsed.data.workload,
      executionReady: Boolean(profile.workerImage),
      cards,
      pricingStatus: 'preview',
      note: profile.workerImage
        ? catalog.errors.length
          ? 'Se muestran las tarjetas obtenidas de las redes disponibles. Una red no respondió, pero las demás siguen operativas.'
          : 'Se muestran todas las tarjetas compatibles disponibles en este momento. La disponibilidad puede cambiar antes de confirmar.'
        : 'Hay tarjetas compatibles, pero este tipo de trabajo todavía necesita su worker antes de ejecutarse.',
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'No se pudo consultar Nayla Compute.';
    return res.status(500).json({
      error: message
        .replace(/Vast\.ai/gi, 'Nayla Compute')
        .replace(/RunPod/gi, 'Nayla Compute')
        .replace(/\bVast\b/gi, 'Nayla Compute'),
    });
  }
}
