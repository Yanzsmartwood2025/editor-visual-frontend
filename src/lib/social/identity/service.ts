import { createHash } from 'node:crypto';
import { getWorkspaceSupabaseAdmin } from '../../workspaceStore';

const normalize = (value: string) => value.trim().toLowerCase().replace(/^@/, '');

const fallbackKey = (displayName: string, platform: string) =>
  'name:' + createHash('sha256').update(platform + ':' + normalize(displayName || 'unknown')).digest('hex').slice(0, 24);

export const resolveSocialPerson = async ({
  userId,
  projectId,
  account,
  providerUserId,
  username,
  displayName,
  avatarUrl,
  profileUrl,
  occurredAt,
}: {
  userId: string;
  projectId: string;
  account: any;
  providerUserId?: string | null;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  profileUrl?: string | null;
  occurredAt?: string | null;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const identityKey = providerUserId
    ? 'id:' + String(providerUserId)
    : username
      ? 'user:' + normalize(String(username))
      : fallbackKey(String(displayName || 'Usuario'), String(account.platform || 'social'));

  const { data: existingIdentity, error: identityError } = await supabase
    .from('social_identities')
    .select('*, social_people(*)')
    .eq('account_id', account.id)
    .eq('identity_key', identityKey)
    .maybeSingle();

  if (identityError) throw identityError;

  const seenAt = occurredAt || new Date().toISOString();

  if (existingIdentity) {
    const person = existingIdentity.social_people;
    const nextCount = Number(person?.interaction_count || 0) + 1;

    await Promise.all([
      supabase
        .from('social_identities')
        .update({
          provider_user_id: providerUserId || existingIdentity.provider_user_id,
          username: username || existingIdentity.username,
          display_name: displayName || existingIdentity.display_name,
          avatar_url: avatarUrl || existingIdentity.avatar_url,
          profile_url: profileUrl || existingIdentity.profile_url,
          last_seen_at: seenAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingIdentity.id),
      supabase
        .from('social_people')
        .update({
          display_name: displayName || person?.display_name || username || 'Usuario',
          interaction_count: nextCount,
          last_seen_at: seenAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingIdentity.person_id),
    ]);

    return {
      person: { ...person, interaction_count: nextCount, last_seen_at: seenAt },
      identity: existingIdentity,
    };
  }

  const { data: person, error: personError } = await supabase
    .from('social_people')
    .insert({
      user_id: userId,
      project_id: projectId,
      display_name: displayName || username || 'Usuario',
      interaction_count: 1,
      first_seen_at: seenAt,
      last_seen_at: seenAt,
    })
    .select('*')
    .single();

  if (personError) throw personError;

  const { data: identity, error: createIdentityError } = await supabase
    .from('social_identities')
    .insert({
      person_id: person.id,
      user_id: userId,
      project_id: projectId,
      account_id: account.id,
      provider: account.provider,
      platform: account.platform,
      identity_key: identityKey,
      provider_user_id: providerUserId || null,
      username: username || null,
      display_name: displayName || null,
      avatar_url: avatarUrl || null,
      profile_url: profileUrl || null,
      last_seen_at: seenAt,
    })
    .select('*')
    .single();

  if (createIdentityError) {
    await supabase.from('social_people').delete().eq('id', person.id);
    throw createIdentityError;
  }

  await supabase.from('social_relationship_summaries').upsert({
    person_id: person.id,
    user_id: userId,
    project_id: projectId,
    interaction_count: 1,
  }, { onConflict: 'person_id' });

  return { person, identity };
};

export const getPersonMemoryContext = async (personId: string) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const now = new Date().toISOString();

  const [person, summary, memories] = await Promise.all([
    supabase.from('social_people').select('*').eq('id', personId).maybeSingle(),
    supabase.from('social_relationship_summaries').select('*').eq('person_id', personId).maybeSingle(),
    supabase
      .from('social_memory_items')
      .select('kind,memory_key,memory_value,confidence,last_confirmed_at')
      .eq('person_id', personId)
      .eq('sensitive', false)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .gte('confidence', 0.65)
      .order('last_confirmed_at', { ascending: false })
      .limit(20),
  ]);

  if (person.error) throw person.error;
  if (summary.error) throw summary.error;
  if (memories.error) throw memories.error;

  return {
    person: person.data,
    summary: summary.data,
    memories: memories.data || [],
  };
};
