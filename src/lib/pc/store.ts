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

export type NaylaPcInstanceStatus =
  | 'provisioning'
  | 'running'
  | 'stopped'
  | 'rebooting'
  | 'snapshotting'
  | 'terminating'
  | 'terminated'
  | 'error';

export type NaylaPcInstanceRow = {
  id: string;
  user_id: string;
  profile_id: string | null;
  provider: string;
  provider_instance_id: string | null;
  provider_plan_id: string;
  provider_region_id: string;
  provider_os_id: number;
  os_family: 'linux' | 'windows';
  cpu: number;
  ram_gb: number;
  disk_gb: number;
  gpu_enabled: boolean;
  gpu_name: string | null;
  gpu_vram_gb: number | null;
  billing_mode: 'hourly' | 'monthly';
  duration_hours: number;
  auto_destroy: boolean;
  status: NaylaPcInstanceStatus;
  main_ip: string | null;
  public_hourly_price: number;
  public_monthly_price: number;
  public_session_price: number;
  provider_monthly_cost: number;
  expires_at: string | null;
  last_synced_at: string | null;
  terminated_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type NaylaPcSnapshotStatus =
  | 'pending'
  | 'available'
  | 'restoring'
  | 'deleting'
  | 'deleted'
  | 'error';

export type NaylaPcSnapshotRow = {
  id: string;
  user_id: string;
  source_instance_id: string | null;
  provider: string;
  provider_snapshot_id: string;
  description: string;
  status: NaylaPcSnapshotStatus;
  os_family: 'linux' | 'windows';
  os_name: string | null;
  cpu: number;
  ram_gb: number;
  disk_gb: number;
  gpu_enabled: boolean;
  gpu_name: string | null;
  gpu_vram_gb: number | null;
  provider_plan_id: string;
  provider_region_id: string;
  size_bytes: number | null;
  storage_monthly_usd: number | null;
  created_at: string;
  ready_at: string | null;
  deleted_at: string | null;
  updated_at: string;
  metadata: Record<string, unknown>;
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

export const getActiveNaylaPcInstance = async (
  userId: string
): Promise<NaylaPcInstanceRow | null> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_instances')
    .select('*')
    .eq('user_id', userId)
    .in('status', [
      'provisioning',
      'running',
      'stopped',
      'rebooting',
      'snapshotting',
      'terminating',
    ])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as NaylaPcInstanceRow | null) || null;
};

export const getNaylaPcInstanceForUser = async ({
  userId,
  instanceId,
}: {
  userId: string;
  instanceId: string;
}): Promise<NaylaPcInstanceRow | null> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_instances')
    .select('*')
    .eq('id', instanceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as NaylaPcInstanceRow | null) || null;
};

export const createNaylaPcProvisioningInstance = async (input: {
  userId: string;
  profileId?: string | null;
  providerPlanId: string;
  providerRegionId: string;
  providerOsId: number;
  osFamily: 'linux' | 'windows';
  cpu: number;
  ramGb: number;
  diskGb: number;
  gpuEnabled: boolean;
  gpuName?: string | null;
  gpuVramGb?: number | null;
  billingMode: 'hourly' | 'monthly';
  durationHours: number;
  autoDestroy: boolean;
  publicHourlyPrice: number;
  publicMonthlyPrice: number;
  publicSessionPrice: number;
  providerMonthlyCost: number;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<NaylaPcInstanceRow> => {
  const supabase = getWorkspaceSupabaseAdmin();

  const { data, error } = await supabase
    .from('nayla_pc_instances')
    .insert({
      user_id: input.userId,
      profile_id: input.profileId || null,
      provider: 'vultr',
      provider_plan_id: input.providerPlanId,
      provider_region_id: input.providerRegionId,
      provider_os_id: input.providerOsId,
      os_family: input.osFamily,
      cpu: input.cpu,
      ram_gb: input.ramGb,
      disk_gb: input.diskGb,
      gpu_enabled: input.gpuEnabled,
      gpu_name: input.gpuName || null,
      gpu_vram_gb: input.gpuVramGb || null,
      billing_mode: input.billingMode,
      duration_hours: input.durationHours,
      auto_destroy: input.autoDestroy,
      status: 'provisioning',
      public_hourly_price: input.publicHourlyPrice,
      public_monthly_price: input.publicMonthlyPrice,
      public_session_price: input.publicSessionPrice,
      provider_monthly_cost: input.providerMonthlyCost,
      expires_at: input.expiresAt || null,
      metadata: input.metadata || {},
    })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      const duplicate = new Error('Ya tienes una Nayla PC activa o en proceso.');
      (duplicate as Error & { code?: string }).code = 'ACTIVE_INSTANCE_EXISTS';
      throw duplicate;
    }
    throw error;
  }

  return data as NaylaPcInstanceRow;
};

export const patchNaylaPcInstance = async ({
  instanceId,
  patch,
}: {
  instanceId: string;
  patch: Partial<NaylaPcInstanceRow>;
}): Promise<NaylaPcInstanceRow> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_instances')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', instanceId)
    .select('*')
    .single();

  if (error) throw error;
  return data as NaylaPcInstanceRow;
};

export const listExpiredNaylaPcInstances = async (
  limit = 20
): Promise<NaylaPcInstanceRow[]> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_instances')
    .select('*')
    .eq('auto_destroy', true)
    .lte('expires_at', new Date().toISOString())
    .in('status', ['provisioning', 'running', 'stopped', 'rebooting', 'terminating'])
    .not('provider_instance_id', 'is', null)
    .order('expires_at', { ascending: true })
    .limit(Math.max(1, Math.min(50, limit)));

  if (error) throw error;
  return (data as NaylaPcInstanceRow[]) || [];
};

export const createNaylaPcSnapshotRow = async (input: {
  userId: string;
  sourceInstanceId: string;
  providerSnapshotId: string;
  description: string;
  osFamily: 'linux' | 'windows';
  osName?: string | null;
  cpu: number;
  ramGb: number;
  diskGb: number;
  gpuEnabled: boolean;
  gpuName?: string | null;
  gpuVramGb?: number | null;
  providerPlanId: string;
  providerRegionId: string;
  metadata?: Record<string, unknown>;
}): Promise<NaylaPcSnapshotRow> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_snapshots')
    .insert({
      user_id: input.userId,
      source_instance_id: input.sourceInstanceId,
      provider: 'vultr',
      provider_snapshot_id: input.providerSnapshotId,
      description: input.description,
      status: 'pending',
      os_family: input.osFamily,
      os_name: input.osName || null,
      cpu: input.cpu,
      ram_gb: input.ramGb,
      disk_gb: input.diskGb,
      gpu_enabled: input.gpuEnabled,
      gpu_name: input.gpuName || null,
      gpu_vram_gb: input.gpuVramGb || null,
      provider_plan_id: input.providerPlanId,
      provider_region_id: input.providerRegionId,
      metadata: input.metadata || {},
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as NaylaPcSnapshotRow;
};

export const patchNaylaPcSnapshot = async ({
  snapshotId,
  patch,
}: {
  snapshotId: string;
  patch: Partial<NaylaPcSnapshotRow>;
}): Promise<NaylaPcSnapshotRow> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_snapshots')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', snapshotId)
    .select('*')
    .single();

  if (error) throw error;
  return data as NaylaPcSnapshotRow;
};

export const getLatestNaylaPcSnapshot = async (
  userId: string
): Promise<NaylaPcSnapshotRow | null> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_snapshots')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'available', 'restoring', 'deleting'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as NaylaPcSnapshotRow | null) || null;
};

export const getNaylaPcSnapshotForUser = async ({
  userId,
  snapshotId,
}: {
  userId: string;
  snapshotId: string;
}): Promise<NaylaPcSnapshotRow | null> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_snapshots')
    .select('*')
    .eq('id', snapshotId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as NaylaPcSnapshotRow | null) || null;
};

export const listPendingNaylaPcSnapshots = async (
  limit = 10
): Promise<NaylaPcSnapshotRow[]> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_snapshots')
    .select('*')
    .in('status', ['pending', 'deleting'])
    .order('updated_at', { ascending: true })
    .limit(Math.max(1, Math.min(25, limit)));

  if (error) throw error;
  return (data as NaylaPcSnapshotRow[]) || [];
};

export const getNaylaInternalSecret = async (
  name: string
): Promise<string | null> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_internal_secrets')
    .select('secret_value')
    .eq('name', name)
    .maybeSingle();

  if (error) throw error;
  return typeof data?.secret_value === 'string' ? data.secret_value : null;
};
