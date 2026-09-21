import { getWorkspaceSupabaseAdmin } from './workspaceStore';

export type NaylaUniversalModule = 'editor' | 'social' | string;

export type NaylaPlannedItem = {
  actionType: string;
  payload: Record<string, unknown>;
};

export const createNaylaActionPlan = async ({
  userId,
  projectId,
  module,
  threadKey,
  summary,
  sourceMessage,
  items,
  metadata = {},
  ttlHours = 24,
}: {
  userId: string;
  projectId: string;
  module: NaylaUniversalModule;
  threadKey: string;
  summary: string;
  sourceMessage: string;
  items: NaylaPlannedItem[];
  metadata?: Record<string, unknown>;
  ttlHours?: number;
}) => {
  if (!items.length) throw new Error('El plan de Nayla no contiene acciones.');

  const supabase = getWorkspaceSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: replacedPlans, error: replaceError } = await supabase
    .from('nayla_action_plans')
    .update({
      status: 'cancelled',
      updated_at: now,
      metadata: { replaced_by_new_plan: true },
    })
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('module', module)
    .eq('thread_key', threadKey)
    .eq('status', 'pending')
    .select('id');

  if (replaceError) throw replaceError;

  const replacedIds = (replacedPlans || []).map((plan: any) => plan.id);
  if (replacedIds.length) {
    const { error: cancelledItemsError } = await supabase
      .from('nayla_action_items')
      .update({
        status: 'cancelled',
        error: 'Plan reemplazado por una orden más reciente.',
        executed_at: now,
      })
      .in('plan_id', replacedIds)
      .eq('status', 'planned');

    if (cancelledItemsError) throw cancelledItemsError;
  }

  const expiresAt = new Date(Date.now() + Math.max(1, ttlHours) * 60 * 60_000).toISOString();

  const { data: plan, error: planError } = await supabase
    .from('nayla_action_plans')
    .insert({
      user_id: userId,
      project_id: projectId,
      module,
      thread_key: threadKey,
      status: 'pending',
      summary,
      source_message: sourceMessage,
      metadata,
      expires_at: expiresAt,
    })
    .select('*')
    .single();

  if (planError) throw planError;

  const rows = items.map((item, ordinal) => ({
    plan_id: plan.id,
    user_id: userId,
    project_id: projectId,
    ordinal,
    action_type: item.actionType,
    payload: item.payload,
    status: 'planned',
  }));

  const { data: actionItems, error: itemError } = await supabase
    .from('nayla_action_items')
    .insert(rows)
    .select('*')
    .order('ordinal');

  if (itemError) {
    await supabase.from('nayla_action_plans').delete().eq('id', plan.id);
    throw itemError;
  }

  return { plan, items: actionItems || [] };
};

export const getPendingNaylaActionPlan = async ({
  userId,
  projectId,
  module,
  threadKey,
}: {
  userId: string;
  projectId: string;
  module: NaylaUniversalModule;
  threadKey: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const now = new Date().toISOString();

  await supabase
    .from('nayla_action_plans')
    .update({ status: 'expired', updated_at: now })
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('module', module)
    .eq('thread_key', threadKey)
    .eq('status', 'pending')
    .lt('expires_at', now);

  const { data: plan, error } = await supabase
    .from('nayla_action_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('module', module)
    .eq('thread_key', threadKey)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!plan) return null;

  const { data: items, error: itemError } = await supabase
    .from('nayla_action_items')
    .select('*')
    .eq('plan_id', plan.id)
    .order('ordinal');

  if (itemError) throw itemError;
  return { plan, items: items || [] };
};

export const claimNaylaActionPlan = async (planId: string) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const now = new Date().toISOString();

  const { data: plan, error } = await supabase
    .from('nayla_action_plans')
    .update({
      status: 'executing',
      confirmed_at: now,
      updated_at: now,
    })
    .eq('id', planId)
    .eq('status', 'pending')
    .gt('expires_at', now)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  return plan;
};

export const updateNaylaActionItem = async ({
  itemId,
  status,
  result,
  error,
}: {
  itemId: string;
  status: 'executing' | 'completed' | 'failed' | 'skipped' | 'cancelled';
  result?: Record<string, unknown>;
  error?: string | null;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const patch: Record<string, unknown> = {
    status,
    result: result || {},
    error: error || null,
  };
  if (status === 'completed' || status === 'failed' || status === 'skipped' || status === 'cancelled') {
    patch.executed_at = new Date().toISOString();
  }

  const { error: updateError } = await supabase
    .from('nayla_action_items')
    .update(patch)
    .eq('id', itemId);

  if (updateError) throw updateError;
};

export const finishNaylaActionPlan = async ({
  planId,
  status,
  result,
}: {
  planId: string;
  status: 'completed' | 'failed' | 'cancelled';
  result?: Record<string, unknown>;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('nayla_action_plans')
    .update({
      status,
      metadata: result || {},
      executed_at: now,
      updated_at: now,
    })
    .eq('id', planId);

  if (error) throw error;
};
