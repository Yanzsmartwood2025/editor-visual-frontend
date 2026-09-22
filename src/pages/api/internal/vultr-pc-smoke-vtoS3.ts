import type { NextApiRequest, NextApiResponse } from 'next';
import {
  createVultrInstance,
  deleteVultrInstance,
  getVultrInstance,
  listVultrOperatingSystems,
  listVultrPlans,
  listVultrRegions,
} from '../../../lib/gpu/vultrApi';
import { getWorkspaceSupabaseAdmin } from '../../../lib/workspaceStore';

export const config = {
  maxDuration: 60,
};

const RUN_KEY = 'vtoS3_23wYcp1vCG6nql0RcutQC3dlK7';
const LOCK_USER = '__nayla_internal_smoke__';
const LOCK_NAME = 'vultr-pc-smoke-2026-09-21';
const EXPIRES_AT = Date.parse('2026-09-22T06:00:00Z');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isGpuPlan = (plan: Record<string, unknown>) => {
  const type = String(plan.type || '').toLowerCase();
  const gpuType = String(plan.gpu_type || '').trim();
  const gpuVram = Number(plan.gpu_vram_gb ?? plan.gpu_vram);
  return type === 'vcg' || gpuType.length > 0 || (Number.isFinite(gpuVram) && gpuVram > 0);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Usa GET.' });
  }

  if (Date.now() > EXPIRES_AT || req.query.key !== RUN_KEY) {
    return res.status(404).json({ error: 'No disponible.' });
  }

  const supabase = getWorkspaceSupabaseAdmin();
  const { error: lockError } = await supabase.from('nayla_pc_profiles').insert({
    user_id: LOCK_USER,
    name: LOCK_NAME,
    status: 'provisioning',
    metadata: {
      purpose: 'one-shot Vultr PC provisioning smoke test',
      started_at: new Date().toISOString(),
    },
  });

  if (lockError) {
    if (lockError.code === '23505') {
      return res.status(409).json({
        error: 'La prueba de una sola ejecución ya fue utilizada.',
      });
    }
    return res.status(500).json({ error: 'No se pudo adquirir el candado de prueba.' });
  }

  let instanceId = '';
  let cleanupOk = false;
  const observations: Array<Record<string, unknown>> = [];

  try {
    const [plans, regions, systems] = await Promise.all([
      listVultrPlans(),
      listVultrRegions(),
      listVultrOperatingSystems(),
    ]);

    const regionById = new Map(regions.map((region) => [region.id, region]));
    const preferredRegions = ['mia', 'atl', 'dfw', 'ewr'];
    const eligible = plans
      .filter((plan) => {
        const monthly = Number(plan.monthly_cost);
        const ram = Number(plan.ram);
        const disk = Number(plan.disk);
        const cpu = Number(plan.vcpu_count);
        return (
          !isGpuPlan(plan) &&
          Number.isFinite(monthly) &&
          monthly > 0 &&
          Number.isFinite(ram) &&
          ram >= 1024 &&
          Number.isFinite(disk) &&
          disk >= 25 &&
          Number.isFinite(cpu) &&
          cpu >= 1 &&
          Array.isArray(plan.locations) &&
          plan.locations.length > 0
        );
      })
      .sort((a, b) => Number(a.monthly_cost) - Number(b.monthly_cost));

    let chosenPlan = eligible[0];
    let chosenRegionId = '';

    for (const regionId of preferredRegions) {
      const match = eligible.find((plan) => plan.locations?.includes(regionId));
      if (match) {
        chosenPlan = match;
        chosenRegionId = regionId;
        break;
      }
    }

    if (!chosenPlan) throw new Error('No hay un plan Cloud Compute pequeño disponible.');

    if (!chosenRegionId) {
      chosenRegionId = chosenPlan.locations?.find((id) => regionById.has(id)) || '';
    }
    if (!chosenRegionId) throw new Error('El plan elegido no tiene una región utilizable.');

    const ubuntuCandidates = systems.filter((os) => {
      const name = String(os.name || '');
      const family = String(os.family || '').toLowerCase();
      const arch = String(os.arch || '').toLowerCase();
      return (
        (family.includes('ubuntu') || name.toLowerCase().includes('ubuntu')) &&
        (!arch || arch.includes('64'))
      );
    });

    const chosenOs =
      ubuntuCandidates.find((os) => /24\.04/i.test(String(os.name || ''))) ||
      ubuntuCandidates.find((os) => /22\.04/i.test(String(os.name || ''))) ||
      ubuntuCandidates[0];

    if (!chosenOs) throw new Error('No encontré una imagen Ubuntu x64 en el catálogo.');

    const label = 'nayla-pc-smoke-' + Date.now();
    const instance = await createVultrInstance({
      planId: chosenPlan.id,
      regionId: chosenRegionId,
      osId: Number(chosenOs.id),
      label,
    });

    instanceId = instance.id;

    await supabase
      .from('nayla_pc_profiles')
      .update({
        metadata: {
          purpose: 'one-shot Vultr PC provisioning smoke test',
          instance_id: instanceId,
          plan_id: chosenPlan.id,
          region_id: chosenRegionId,
          os_id: chosenOs.id,
          provider_accepted_at: new Date().toISOString(),
        },
      })
      .eq('user_id', LOCK_USER)
      .eq('name', LOCK_NAME);

    for (let i = 0; i < 10; i += 1) {
      const current = await getVultrInstance(instanceId);
      if (!current) {
        observations.push({ poll: i + 1, missing: true });
        break;
      }

      observations.push({
        poll: i + 1,
        status: current.status,
        power_status: current.power_status,
        server_status: current.server_status,
        has_ipv4: Boolean(current.main_ip),
      });

      const running =
        String(current.power_status || '').toLowerCase() === 'running' ||
        String(current.status || '').toLowerCase() === 'active';

      if (running && current.main_ip) break;
      await sleep(3500);
    }

    await deleteVultrInstance(instanceId);

    for (let i = 0; i < 6; i += 1) {
      const current = await getVultrInstance(instanceId);
      if (!current) {
        cleanupOk = true;
        break;
      }
      await sleep(1500);
    }

    const latest = observations[observations.length - 1] || {};
    const reachedRunning = observations.some(
      (item) =>
        String(item.power_status || '').toLowerCase() === 'running' ||
        String(item.status || '').toLowerCase() === 'active'
    );
    const gotIpv4 = observations.some((item) => item.has_ipv4 === true);

    await supabase
      .from('nayla_pc_profiles')
      .update({
        status: cleanupOk ? 'terminated' : 'error',
        metadata: {
          purpose: 'one-shot Vultr PC provisioning smoke test',
          instance_id: instanceId,
          plan_id: chosenPlan.id,
          region_id: chosenRegionId,
          os_id: chosenOs.id,
          provider_accepted: true,
          reached_running: reachedRunning,
          got_ipv4: gotIpv4,
          cleanup_ok: cleanupOk,
          completed_at: new Date().toISOString(),
        },
      })
      .eq('user_id', LOCK_USER)
      .eq('name', LOCK_NAME);

    return res.status(cleanupOk ? 200 : 500).json({
      ok: cleanupOk,
      providerAccepted: true,
      reachedRunning,
      gotIpv4,
      cleanupOk,
      computer: {
        cpu: Number(chosenPlan.vcpu_count),
        ramMb: Number(chosenPlan.ram),
        diskGb: Number(chosenPlan.disk),
        monthlyBaseUsd: Number(chosenPlan.monthly_cost),
        region: regionById.get(chosenRegionId)?.city || chosenRegionId,
        os: chosenOs.name || 'Ubuntu',
      },
      latest,
    });
  } catch (error) {
    if (instanceId && !cleanupOk) {
      try {
        await deleteVultrInstance(instanceId);
        cleanupOk = true;
      } catch {
        cleanupOk = false;
      }
    }

    const message = error instanceof Error ? error.message : 'Falló la prueba Vultr.';

    await supabase
      .from('nayla_pc_profiles')
      .update({
        status: cleanupOk || !instanceId ? 'terminated' : 'error',
        metadata: {
          purpose: 'one-shot Vultr PC provisioning smoke test',
          instance_id: instanceId || null,
          error: message.slice(0, 500),
          cleanup_ok: cleanupOk || !instanceId,
          completed_at: new Date().toISOString(),
        },
      })
      .eq('user_id', LOCK_USER)
      .eq('name', LOCK_NAME);

    return res.status(500).json({
      ok: false,
      error: message,
      providerAccepted: Boolean(instanceId),
      cleanupOk: cleanupOk || !instanceId,
    });
  }
}
