import { getWorkspaceSupabaseAdmin } from '../../workspaceStore';
import { resolveSocialPerson } from '../identity/service';
import { scheduleAutomationForInteraction } from '../automation/service';

export const recordSocialInteraction = async ({
  userId,
  projectId,
  account,
  channel,
  direction,
  sourceId,
  body,
  providerUserId,
  username,
  displayName,
  avatarUrl,
  profileUrl,
  providerPostId,
  providerConversationId,
  providerParentId,
  occurredAt,
  raw,
}: {
  userId: string;
  projectId: string;
  account: any;
  channel: 'comment' | 'dm';
  direction: 'inbound' | 'outbound';
  sourceId: string;
  body: string;
  providerUserId?: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  providerPostId?: string | null;
  providerConversationId?: string | null;
  providerParentId?: string | null;
  occurredAt?: string | null;
  raw?: Record<string, unknown>;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();

  const { data: existing, error: existingError } = await supabase
    .from('social_interactions')
    .select('*')
    .eq('account_id', account.id)
    .eq('channel', channel)
    .eq('source_id', sourceId)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    return {
      interaction: existing,
      person: { id: existing.person_id },
      identity: { id: existing.identity_id },
      created: false,
    };
  }

  const { person, identity } = await resolveSocialPerson({
    userId,
    projectId,
    account,
    providerUserId,
    username,
    displayName,
    avatarUrl,
    profileUrl,
    occurredAt,
  });

  const row = {
    user_id: userId,
    project_id: projectId,
    account_id: account.id,
    person_id: person.id,
    identity_id: identity.id,
    provider: account.provider,
    platform: account.platform,
    channel,
    direction,
    source_id: sourceId,
    provider_post_id: providerPostId || null,
    provider_conversation_id: providerConversationId || null,
    provider_parent_id: providerParentId || null,
    body: body || '',
    occurred_at: occurredAt || new Date().toISOString(),
    raw: raw || {},
  };

  const { data: interaction, error } = await supabase
    .from('social_interactions')
    .upsert(row, { onConflict: 'account_id,channel,source_id' })
    .select('*')
    .single();

  if (error) throw error;

  if (direction === 'inbound') {
    await scheduleAutomationForInteraction(interaction).catch(() => undefined);
  } else {
    await supabase
      .from('social_interactions')
      .update({ memory_state: 'skipped', automation_state: 'skipped' })
      .eq('id', interaction.id);
  }

  return { interaction, person, identity, created: true };
};
