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
  ready_at: string | null;
  billable_started_at: string | null;
  boot_deadline_at: string | null;
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
  provider_os_id: number | null;
  size_bytes: number | null;
  storage_monthly_usd: number | null;
  created_at: string;
  ready_at: string | null;
  deleted_at: string | null;
  updated_at: string;
  metadata: Record<string, unknown>;
};

export type NaylaPcBaseImageRow = {
  id: string;
  provider: string;
  provider_snapshot_id: string;
  os_family: 'linux' | 'windows';
  os_name: string;
  version: string;
  status: 'building' | 'available' | 'retiring' | 'retired' | 'error';
  provider_plan_id: string;
  provider_region_id: string;
  provider_os_id: number | null;
  min_disk_gb: number;
  min_ram_gb: number;
  desktop_stack: string | null;
  snapshot_size_bytes: number | null;
  storage_monthly_usd: number | null;
  created_at: string;
  ready_at: string | null;
  retired_at: string | null;
  updated_at: string;
  metadata: Record<string, unknown>;
};

export type NaylaPcDriveSessionRow = {
  id: string;
  instance_id: string;
  user_id: string;
  token_hash: string;
  status: 'active' | 'revoked' | 'expired';
  expires_at: string;
  created_at: string;
  revoked_at: string | null;
  last_seen_at: string | null;
};

export type NaylaPcDriveFileRow = {
  id: string;
  user_id: string;
  relative_path: string;
  r2_key: string;
  content_type: string | null;
  size_bytes: number;
  etag: string | null;
  content_sha256: string | null;
  modified_at: string | null;
  uploaded_at: string;
  deleted_at: string | null;
  created_at: string;
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
  bootDeadlineAt?: string | null;
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
      boot_deadline_at: input.bootDeadlineAt || null,
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
  providerOsId?: number | null;
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
      provider_os_id: input.providerOsId || null,
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

export const listOlderAvailableNaylaPcSnapshots = async ({
  userId,
  excludeId,
}: {
  userId: string;
  excludeId: string;
}): Promise<NaylaPcSnapshotRow[]> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_snapshots')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'available')
    .neq('id', excludeId)
    .order('created_at', { ascending: true })
    .limit(10);

  if (error) throw error;
  return (data as NaylaPcSnapshotRow[]) || [];
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

export const getAvailableNaylaPcBaseImage = async (
  osFamily: 'linux' | 'windows' = 'linux'
): Promise<NaylaPcBaseImageRow | null> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_base_images')
    .select('*')
    .eq('os_family', osFamily)
    .eq('status', 'available')
    .order('ready_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as NaylaPcBaseImageRow | null) || null;
};

export const getLatestNaylaPcBaseImage = async (
  statuses: Array<NaylaPcBaseImageRow['status']> = ['building', 'available']
): Promise<NaylaPcBaseImageRow | null> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_base_images')
    .select('*')
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as NaylaPcBaseImageRow | null) || null;
};

export const createNaylaPcBaseImage = async (input: {
  providerSnapshotId: string;
  osFamily: 'linux' | 'windows';
  osName: string;
  version: string;
  providerPlanId: string;
  providerRegionId: string;
  providerOsId?: number | null;
  minDiskGb: number;
  minRamGb: number;
  desktopStack?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<NaylaPcBaseImageRow> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_base_images')
    .insert({
      provider: 'vultr',
      provider_snapshot_id: input.providerSnapshotId,
      os_family: input.osFamily,
      os_name: input.osName,
      version: input.version,
      status: 'building',
      provider_plan_id: input.providerPlanId,
      provider_region_id: input.providerRegionId,
      provider_os_id: input.providerOsId || null,
      min_disk_gb: input.minDiskGb,
      min_ram_gb: input.minRamGb,
      desktop_stack: input.desktopStack || null,
      metadata: input.metadata || {},
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as NaylaPcBaseImageRow;
};

export const patchNaylaPcBaseImage = async ({
  baseImageId,
  patch,
}: {
  baseImageId: string;
  patch: Partial<NaylaPcBaseImageRow>;
}): Promise<NaylaPcBaseImageRow> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_base_images')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', baseImageId)
    .select('*')
    .single();

  if (error) throw error;
  return data as NaylaPcBaseImageRow;
};

export const retireAvailableNaylaPcBaseImages = async ({
  osFamily,
  exceptId,
}: {
  osFamily: 'linux' | 'windows';
  exceptId: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { error } = await supabase
    .from('nayla_pc_base_images')
    .update({
      status: 'retired',
      retired_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('os_family', osFamily)
    .eq('status', 'available')
    .neq('id', exceptId);

  if (error) throw error;
};

export const createNaylaPcDriveSession = async (input: {
  instanceId: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
}): Promise<NaylaPcDriveSessionRow> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_drive_sessions')
    .insert({
      instance_id: input.instanceId,
      user_id: input.userId,
      token_hash: input.tokenHash,
      status: 'active',
      expires_at: input.expiresAt,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as NaylaPcDriveSessionRow;
};

export const getNaylaPcDriveSessionByTokenHash = async (
  tokenHash: string
): Promise<NaylaPcDriveSessionRow | null> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_drive_sessions')
    .select('*')
    .eq('token_hash', tokenHash)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  return (data as NaylaPcDriveSessionRow | null) || null;
};

export const touchNaylaPcDriveSession = async (sessionId: string) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { error } = await supabase
    .from('nayla_pc_drive_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', sessionId);

  if (error) throw error;
};

export const revokeNaylaPcDriveSessionsForInstance = async (
  instanceId: string
) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { error } = await supabase
    .from('nayla_pc_drive_sessions')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
    })
    .eq('instance_id', instanceId)
    .eq('status', 'active');

  if (error) throw error;
};

export const listNaylaPcDriveFiles = async (
  userId: string
): Promise<NaylaPcDriveFileRow[]> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_pc_drive_files')
    .select('*')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('relative_path', { ascending: true })
    .limit(5000);

  if (error) throw error;
  return (data as NaylaPcDriveFileRow[]) || [];
};

export const upsertNaylaPcDriveFile = async (input: {
  userId: string;
  relativePath: string;
  r2Key: string;
  contentType?: string | null;
  sizeBytes: number;
  etag?: string | null;
  contentSha256?: string | null;
  modifiedAt?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<NaylaPcDriveFileRow> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data: existing, error: findError } = await supabase
    .from('nayla_pc_drive_files')
    .select('id')
    .eq('user_id', input.userId)
    .eq('relative_path', input.relativePath)
    .is('deleted_at', null)
    .maybeSingle();

  if (findError) throw findError;

  const row = {
    user_id: input.userId,
    relative_path: input.relativePath,
    r2_key: input.r2Key,
    content_type: input.contentType || null,
    size_bytes: input.sizeBytes,
    etag: input.etag || null,
    content_sha256: input.contentSha256 || null,
    modified_at: input.modifiedAt || null,
    uploaded_at: new Date().toISOString(),
    deleted_at: null,
    updated_at: new Date().toISOString(),
    metadata: input.metadata || {},
  };

  const query = existing?.id
    ? supabase.from('nayla_pc_drive_files').update(row).eq('id', existing.id)
    : supabase.from('nayla_pc_drive_files').insert(row);

  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return data as NaylaPcDriveFileRow;
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
