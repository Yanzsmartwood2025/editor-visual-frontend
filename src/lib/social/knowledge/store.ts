import { createHash } from 'node:crypto';
import { getWorkspaceSupabaseAdmin, resolveOwnedWorkspaceScope } from '../../workspaceStore';

export const getKnowledgeConnection = async ({
  userId,
  projectId,
  provider = 'google_drive',
}: {
  userId: string;
  projectId: string;
  provider?: 'google_drive';
}) => {
  await resolveOwnedWorkspaceScope({ userId, projectId });
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('social_source_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('provider', provider)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

export const upsertKnowledgeConnection = async ({
  userId,
  projectId,
  provider = 'google_drive',
  patch,
}: {
  userId: string;
  projectId: string;
  provider?: 'google_drive';
  patch: Record<string, unknown>;
}) => {
  await resolveOwnedWorkspaceScope({ userId, projectId });
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('social_source_connections')
    .upsert({
      user_id: userId,
      project_id: projectId,
      provider,
      ...patch,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,project_id,provider' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

export const listKnowledgeSourceItems = async ({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('social_source_items')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('selected', true)
    .order('source_modified_at', { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) throw error;
  return data || [];
};

export const upsertKnowledgeSourceItem = async ({
  connectionId,
  userId,
  projectId,
  item,
}: {
  connectionId: string;
  userId: string;
  projectId: string;
  item: {
    providerItemId: string;
    itemKind?: 'file' | 'folder';
    name: string;
    mimeType?: string | null;
    webUrl?: string | null;
    sourceModifiedAt?: string | null;
    metadata?: Record<string, unknown>;
  };
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('social_source_items')
    .upsert({
      connection_id: connectionId,
      user_id: userId,
      project_id: projectId,
      provider: 'google_drive',
      provider_item_id: item.providerItemId,
      item_kind: item.itemKind || 'file',
      name: item.name,
      mime_type: item.mimeType || null,
      web_url: item.webUrl || null,
      selected: true,
      source_modified_at: item.sourceModifiedAt || null,
      metadata: item.metadata || {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'connection_id,provider_item_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

export const contentFingerprint = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export const saveProgramSummary = async ({
  userId,
  projectId,
  sourceItemId,
  sourceVersion,
  sourceModifiedAt,
  summary,
}: {
  userId: string;
  projectId: string;
  sourceItemId: string;
  sourceVersion: string;
  sourceModifiedAt?: string | null;
  summary: {
    programDate?: string | null;
    programName?: string | null;
    characterName?: string | null;
    channelName?: string | null;
    language?: string | null;
    theme?: string | null;
    song?: string | null;
    summary: string;
    keyPoints?: unknown[];
    baseHashtags?: string[];
    publicationNotes?: Record<string, unknown>;
  };
}) => {
  const supabase = getWorkspaceSupabaseAdmin();

  await supabase
    .from('social_program_summaries')
    .update({ status: 'superseded', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('source_item_id', sourceItemId)
    .eq('status', 'current')
    .neq('source_version', sourceVersion);

  const { data, error } = await supabase
    .from('social_program_summaries')
    .upsert({
      user_id: userId,
      project_id: projectId,
      source_item_id: sourceItemId,
      source_version: sourceVersion,
      program_date: summary.programDate || null,
      program_name: summary.programName || null,
      character_name: summary.characterName || null,
      channel_name: summary.channelName || null,
      language: summary.language || 'es',
      theme: summary.theme || null,
      song: summary.song || null,
      summary: summary.summary,
      key_points: summary.keyPoints || [],
      base_hashtags: summary.baseHashtags || [],
      publication_notes: summary.publicationNotes || {},
      source_modified_at: sourceModifiedAt || null,
      status: 'current',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'source_item_id,source_version' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

export const getLatestProgramSummary = async ({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('social_program_summaries')
    .select('*, social_source_items(name,web_url,mime_type,source_modified_at)')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('status', 'current')
    .order('program_date', { ascending: false, nullsFirst: false })
    .order('source_modified_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

export const savePublicationPackage = async ({
  userId,
  projectId,
  programId,
  platform,
  language,
  title,
  caption,
  hashtags,
  metadata = {},
}: {
  userId: string;
  projectId: string;
  programId: string;
  platform: string;
  language: string;
  title?: string | null;
  caption: string;
  hashtags: string[];
  metadata?: Record<string, unknown>;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('social_publication_packages')
    .upsert({
      user_id: userId,
      project_id: projectId,
      program_id: programId,
      platform,
      language,
      title: title || null,
      caption,
      hashtags,
      status: 'draft',
      generated_at: new Date().toISOString(),
      metadata,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'program_id,platform,language' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
};

export const listPublicationPackages = async ({
  userId,
  projectId,
  programId,
}: {
  userId: string;
  projectId: string;
  programId: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('social_publication_packages')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('program_id', programId)
    .order('platform');
  if (error) throw error;
  return data || [];
};
