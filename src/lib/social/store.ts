import { createHash, randomUUID } from 'node:crypto';
import { createR2PresignedGetUrl } from '../r2';
import { getWorkspaceSupabaseAdmin, resolveOwnedWorkspaceScope } from '../workspaceStore';
import type { NormalizedSocialAccount, SocialProviderId, SocialPlatform } from './types';

const stableUploadPostUsername = (userId: string, projectId: string) =>
  'nayla_' + createHash('sha256').update(userId + ':' + projectId).digest('hex').slice(0, 28);

export const ensureSocialProfile = async (userId: string, projectId: string) => {
  await resolveOwnedWorkspaceScope({ userId, projectId });
  const supabase = getWorkspaceSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from('social_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    if (!existing.upload_post_username) {
      const uploadPostUsername = stableUploadPostUsername(userId, projectId);
      const { data, error } = await supabase
        .from('social_profiles')
        .update({ upload_post_username: uploadPostUsername, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    }
    return existing;
  }

  const { data, error } = await supabase
    .from('social_profiles')
    .insert({
      user_id: userId,
      project_id: projectId,
      upload_post_username: stableUploadPostUsername(userId, projectId),
      metadata: { schema: 1 },
    })
    .select('*')
    .single();
  if (error) throw error;

  await supabase.from('social_ai_policies').upsert({
    social_profile_id: data.id,
    user_id: userId,
    project_id: projectId,
    mode: 'suggest',
  }, { onConflict: 'social_profile_id' });

  return data;
};

export const updateSocialProviderProfileId = async ({
  profileId,
  provider,
  providerProfileId,
}: {
  profileId: string;
  provider: SocialProviderId;
  providerProfileId: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const column = provider === 'upload_post' ? 'upload_post_username' : 'zernio_profile_id';
  const { data, error } = await supabase
    .from('social_profiles')
    .update({ [column]: providerProfileId, updated_at: new Date().toISOString() })
    .eq('id', profileId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

export const upsertSocialAccounts = async ({
  socialProfileId,
  userId,
  projectId,
  accounts,
}: {
  socialProfileId: string;
  userId: string;
  projectId: string;
  accounts: NormalizedSocialAccount[];
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const rows = accounts
    .filter((account) => account.providerAccountId)
    .map((account) => ({
      social_profile_id: socialProfileId,
      user_id: userId,
      project_id: projectId,
      provider: account.provider,
      platform: account.platform,
      provider_account_id: account.providerAccountId,
      username: account.username || null,
      handle: account.handle || null,
      display_name: account.displayName || null,
      avatar_url: account.avatarUrl || null,
      profile_url: account.profileUrl || null,
      status: account.status,
      capabilities: account.capabilities || {},
      raw: account.raw || {},
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
  if (!rows.length) return [];
  const { data, error } = await supabase
    .from('social_accounts')
    .upsert(rows, { onConflict: 'provider,provider_account_id' })
    .select('*');
  if (error) throw error;
  return data || [];
};

export const getSocialAccountForUser = async ({
  userId,
  projectId,
  accountId,
}: {
  userId: string;
  projectId: string;
  accountId: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', accountId)
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('La cuenta social no existe o no pertenece a este proyecto.');
  return data;
};

export const getSocialOverview = async (userId: string, projectId: string) => {
  const profile = await ensureSocialProfile(userId, projectId);
  const supabase = getWorkspaceSupabaseAdmin();
  const [accounts, posts, targets, comments, conversations, policy, usage] = await Promise.all([
    supabase.from('social_accounts').select('*').eq('user_id', userId).eq('project_id', projectId).order('platform'),
    supabase.from('social_posts').select('*').eq('user_id', userId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(20),
    supabase.from('social_post_targets').select('*').eq('user_id', userId).eq('project_id', projectId).order('updated_at', { ascending: false }).limit(80),
    supabase.from('social_comments').select('*').eq('user_id', userId).eq('project_id', projectId).order('received_at', { ascending: false }).limit(80),
    supabase.from('social_conversations').select('*').eq('user_id', userId).eq('project_id', projectId).order('last_message_at', { ascending: false }).limit(50),
    supabase.from('social_ai_policies').select('*').eq('social_profile_id', profile.id).maybeSingle(),
    supabase.from('social_usage_ledger').select('*').eq('user_id', userId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(100),
  ]);
  for (const result of [accounts, posts, targets, comments, conversations, policy, usage]) {
    if (result.error) throw result.error;
  }
  return {
    profile,
    accounts: accounts.data || [],
    posts: posts.data || [],
    targets: targets.data || [],
    comments: comments.data || [],
    conversations: conversations.data || [],
    policy: policy.data || null,
    usage: usage.data || [],
  };
};

export const getOwnedPublishMedia = async ({
  userId,
  projectId,
  mediaId,
}: {
  userId: string;
  projectId: string;
  mediaId: string;
}) => {
  await resolveOwnedWorkspaceScope({ userId, projectId });
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('galeria_multimedia')
    .select('id, tipo, nombre, etiqueta, url, r2_key, metadata')
    .eq('id', mediaId)
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('El resultado seleccionado no existe en este proyecto.');
  if (data.tipo !== 'video') throw new Error('Por ahora REDES publica resultados de video.');
  const url = data.r2_key
    ? createR2PresignedGetUrl({ key: data.r2_key, expiresIn: 1800 }).url
    : data.url;
  if (!url) throw new Error('El resultado no tiene una URL publicable.');
  return { ...data, url };
};

export const createSocialPostWithTargets = async ({
  userId,
  projectId,
  mediaId,
  mediaLabel,
  title,
  caption,
  accounts,
}: {
  userId: string;
  projectId: string;
  mediaId: string;
  mediaLabel?: string | null;
  title: string;
  caption: string;
  accounts: any[];
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data: post, error } = await supabase
    .from('social_posts')
    .insert({
      user_id: userId,
      project_id: projectId,
      media_id: mediaId,
      media_label: mediaLabel || null,
      title,
      caption,
      status: 'publishing',
    })
    .select('*')
    .single();
  if (error) throw error;

  const { data: targets, error: targetError } = await supabase
    .from('social_post_targets')
    .insert(accounts.map((account) => ({
      social_post_id: post.id,
      account_id: account.id,
      user_id: userId,
      project_id: projectId,
      provider: account.provider,
      platform: account.platform,
      status: 'publishing',
    })))
    .select('*');
  if (targetError) throw targetError;
  return { post, targets: targets || [] };
};

export const updateSocialTarget = async (targetId: string, patch: Record<string, unknown>) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('social_post_targets')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', targetId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

export const finishSocialPost = async (postId: string, status: 'published' | 'partial' | 'failed') => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { error } = await supabase
    .from('social_posts')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', postId);
  if (error) throw error;
};

export const recordSocialUsage = async ({
  userId,
  projectId,
  action,
  provider,
  platform,
  quantity = 1,
  metadata = {},
}: {
  userId: string;
  projectId: string;
  action: string;
  provider?: string | null;
  platform?: string | null;
  quantity?: number;
  metadata?: Record<string, unknown>;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { error } = await supabase.from('social_usage_ledger').insert({
    user_id: userId,
    project_id: projectId,
    action,
    provider: provider || null,
    platform: platform || null,
    quantity,
    metadata,
  });
  if (error) throw error;
};

export const createIdempotencyKey = () => randomUUID();

export const saveSocialPolicy = async ({
  userId,
  projectId,
  profileId,
  mode,
  tone,
  language,
  instructions,
}: {
  userId: string;
  projectId: string;
  profileId: string;
  mode: 'off' | 'suggest' | 'auto';
  tone: string;
  language: string;
  instructions: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('social_ai_policies')
    .upsert({
      social_profile_id: profileId,
      user_id: userId,
      project_id: projectId,
      mode,
      tone,
      language,
      instructions,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'social_profile_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};
