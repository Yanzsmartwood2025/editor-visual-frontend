import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const ACTIVE_GPU_STATUSES = [
  'renting',
  'booting',
  'running',
  'processing',
  'cleanup_pending',
] as const;

export type GpuJobRow = {
  id: string;
  user_id: string;
  provider: string;
  workload: string;
  status: string;
  instance_id: number | null;
  offer_id: number | null;
  gpu_name: string | null;
  hourly_price: number | string | null;
  estimated_max_cost: number | string | null;
  runtime_cost_estimate: number | string | null;
  balance_before: number | string | null;
  lease_expires_at: string | null;
  callback_token_hash: string | null;
  output_url: string | null;
  output_content_type: string | null;
  gallery_item_id: string | null;
  error_message: string | null;
  metadata: Record<string, any>;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  destroyed_at: string | null;
};

let cachedAdmin: SupabaseClient | null = null;

export const getGpuSupabaseAdmin = () => {
  if (cachedAdmin) return cachedAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error('Supabase no está configurado para controlar trabajos GPU.');
  }

  cachedAdmin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
};

export const countActiveGpuJobs = async (): Promise<number> => {
  const supabase = getGpuSupabaseAdmin();
  const { count, error } = await supabase
    .from('gpu_jobs')
    .select('id', { count: 'exact', head: true })
    .in('status', [...ACTIVE_GPU_STATUSES]);

  if (error) throw error;
  return count || 0;
};

export const insertGpuJob = async (row: Record<string, unknown>): Promise<GpuJobRow> => {
  const supabase = getGpuSupabaseAdmin();
  const { data, error } = await supabase
    .from('gpu_jobs')
    .insert(row)
    .select('*')
    .single();

  if (error) throw error;
  return data as GpuJobRow;
};

export const updateGpuJob = async (
  jobId: string,
  patch: Record<string, unknown>
): Promise<GpuJobRow> => {
  const supabase = getGpuSupabaseAdmin();
  const { data, error } = await supabase
    .from('gpu_jobs')
    .update(patch)
    .eq('id', jobId)
    .select('*')
    .single();

  if (error) throw error;
  return data as GpuJobRow;
};

export const updateGpuJobIfStatus = async (
  jobId: string,
  expectedStatus: string,
  patch: Record<string, unknown>
): Promise<GpuJobRow | null> => {
  const supabase = getGpuSupabaseAdmin();
  const { data, error } = await supabase
    .from('gpu_jobs')
    .update(patch)
    .eq('id', jobId)
    .eq('status', expectedStatus)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return (data as GpuJobRow | null) || null;
};

export const getGpuJob = async (jobId: string): Promise<GpuJobRow | null> => {
  const supabase = getGpuSupabaseAdmin();
  const { data, error } = await supabase
    .from('gpu_jobs')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();

  if (error) throw error;
  return (data as GpuJobRow | null) || null;
};

export const getGpuJobForUser = async (
  jobId: string,
  userId: string
): Promise<GpuJobRow | null> => {
  const supabase = getGpuSupabaseAdmin();
  const { data, error } = await supabase
    .from('gpu_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return (data as GpuJobRow | null) || null;
};

export const listExpiredGpuJobs = async (limit = 20): Promise<GpuJobRow[]> => {
  const supabase = getGpuSupabaseAdmin();
  const { data, error } = await supabase
    .from('gpu_jobs')
    .select('*')
    .in('status', [...ACTIVE_GPU_STATUSES])
    .not('instance_id', 'is', null)
    .lt('lease_expires_at', new Date().toISOString())
    .order('lease_expires_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return (data || []) as GpuJobRow[];
};

export const getGalleryItemById = async (id: string) => {
  const supabase = getGpuSupabaseAdmin();
  const { data, error } = await supabase
    .from('galeria_multimedia')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};
