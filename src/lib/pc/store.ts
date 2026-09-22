import { getWorkspaceSupabaseAdmin } from '../workspaceStore';
import {
  normalizeNaylaPcRequest,
  type NaylaPcRequest,
} from './quote';

export type NaylaPcProfileRow = {
  id: string;
  user_id: string;
  name: string;
  os_family: 'linux' | 'windows';
  cpu: number;
  ram_gb: number;
  disk_gb: number;
  gpu_enabled: boolean;
  min_gpu_vram_gb: number;
  billing_mode: 'hourly' | 'monthly';
  duration_hours: number;
  auto_destroy: boolean;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type SaveNaylaPcProfileInput = Partial<NaylaPcRequest> & {
  name?: string;
  autoDestroy?: boolean;
};

export const getDefaultNaylaPcProfile = async (
  userId: string
): Promise<NaylaPcProfileRow | null> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('name', 'Mi PC')
    .maybeSingle();

  if (error) throw error;
  return (data as NaylaPcProfileRow | null) || null;
};

export const saveDefaultNaylaPcProfile = async ({
  userId,
  input,
}: {
  userId: string;
  input: SaveNaylaPcProfileInput;
}): Promise<NaylaPcProfileRow> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const normalized = normalizeNaylaPcRequest(input);
  const name = String(input.name || 'Mi PC').trim().slice(0, 80) || 'Mi PC';

  const row = {
    user_id: userId,
    name,
    os_family: normalized.osFamily,
    cpu: normalized.cpu,
    ram_gb: normalized.ramGb,
    disk_gb: normalized.diskGb,
    gpu_enabled: normalized.gpuEnabled,
    min_gpu_vram_gb: normalized.minGpuVramGb,
    billing_mode: normalized.billingMode,
    duration_hours: normalized.durationHours,
    auto_destroy:
      normalized.billingMode === 'hourly'
        ? input.autoDestroy !== false
        : false,
    status: 'draft',
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('nayla_pc_profiles')
    .upsert(row, { onConflict: 'user_id,name' })
    .select('*')
    .single();

  if (error) throw error;
  return data as NaylaPcProfileRow;
};
