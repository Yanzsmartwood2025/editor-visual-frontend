import { ensureUploadPostProfile, listUploadPostAccounts, listUploadPostProfiles } from './providers/uploadPost';
import { ensureZernioProfile, listZernioAccounts } from './providers/zernio';
import {
  ensureSocialProfile,
  updateSocialProviderProfileId,
  upsertSocialAccounts,
} from './store';
import { getWorkspaceSupabaseAdmin } from '../workspaceStore';

export type UploadPostRecoveryCandidate = {
  username: string;
  createdAt: string | null;
  connected: Array<{
    platform: string;
    handle: string | null;
    displayName: string | null;
  }>;
  matchScore: number;
  boundElsewhere: boolean;
};

const normalizeIdentity = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/\s+/g, ' ');

const uploadPostConnectedAccounts = (remoteProfile: any) =>
  Object.entries(remoteProfile?.social_accounts || {})
    .filter(([, value]) => value && typeof value === 'object')
    .map(([platform, value]: [string, any]) => ({
      platform: platform === 'twitter' ? 'x' : platform,
      handle: value?.handle ? String(value.handle) : null,
      displayName: value?.display_name ? String(value.display_name) : null,
    }));

export const getUploadPostRecoveryCandidates = async ({
  profile,
  userId,
  projectId,
}: {
  profile: any;
  userId: string;
  projectId: string;
}) => {
  const remote = await listUploadPostProfiles();
  const profiles = Array.isArray(remote.profiles) ? remote.profiles : [];
  if (!profiles.length) {
    return {
      candidates: [] as UploadPostRecoveryCandidate[],
      plan: remote.plan,
      limit: remote.limit,
    };
  }

  const supabase = getWorkspaceSupabaseAdmin();
  const usernames = profiles
    .map((item: any) => String(item?.username || '').trim())
    .filter(Boolean);

  const [{ data: bindings, error: bindingsError }, { data: localAccounts, error: accountsError }] = await Promise.all([
    supabase
      .from('social_profiles')
      .select('id,user_id,project_id,upload_post_username')
      .in('upload_post_username', usernames),
    supabase
      .from('social_accounts')
      .select('platform,username,handle,display_name')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .eq('status', 'connected'),
  ]);

  if (bindingsError) throw bindingsError;
  if (accountsError) throw accountsError;

  const candidates: UploadPostRecoveryCandidate[] = profiles
    .map((remoteProfile: any) => {
      const username = String(remoteProfile?.username || '').trim();
      if (!username) return null;

      const binding = (bindings || []).find(
        (item: any) => String(item.upload_post_username || '') === username
      );
      const boundElsewhere = Boolean(
        binding &&
        String(binding.id) !== String(profile.id) &&
        (
          String(binding.user_id) !== String(userId) ||
          String(binding.project_id) !== String(projectId)
        )
      );

      const connected = uploadPostConnectedAccounts(remoteProfile);
      let matchScore = 0;

      for (const remoteAccount of connected) {
        const samePlatform = (localAccounts || []).filter(
          (local: any) => String(local.platform) === String(remoteAccount.platform)
        );
        if (samePlatform.length) matchScore += 1;

        const remoteHandle = normalizeIdentity(remoteAccount.handle);
        const remoteDisplay = normalizeIdentity(remoteAccount.displayName);

        for (const local of samePlatform) {
          const localValues = [
            normalizeIdentity(local.handle),
            normalizeIdentity(local.username),
            normalizeIdentity(local.display_name),
          ].filter(Boolean);

          if (remoteHandle && localValues.includes(remoteHandle)) matchScore += 10;
          else if (remoteDisplay && localValues.includes(remoteDisplay)) matchScore += 6;
        }
      }

      return {
        username,
        createdAt: remoteProfile?.created_at ? String(remoteProfile.created_at) : null,
        connected,
        matchScore,
        boundElsewhere,
      };
    })
    .filter(Boolean) as UploadPostRecoveryCandidate[];

  return {
    candidates,
    plan: remote.plan,
    limit: remote.limit,
  };
};

export const recoverUploadPostProfileBinding = async ({
  profile,
  userId,
  projectId,
  preferredUsername,
}: {
  profile: any;
  userId: string;
  projectId: string;
  preferredUsername?: string | null;
}) => {
  const recovery = await getUploadPostRecoveryCandidates({ profile, userId, projectId });
  const available = recovery.candidates.filter((candidate) => !candidate.boundElsewhere);

  let selected: UploadPostRecoveryCandidate | null = null;

  if (preferredUsername) {
    selected = available.find(
      (candidate) => candidate.username === preferredUsername
    ) || null;

    if (!selected) {
      throw new Error('Ese perfil social ya no está disponible para este espacio de Nayla.');
    }
  } else if (available.length === 1) {
    selected = available[0];
  } else if (available.length > 1) {
    const ranked = [...available].sort((a, b) => b.matchScore - a.matchScore);
    if (
      ranked[0]?.matchScore >= 6 &&
      ranked[0].matchScore > (ranked[1]?.matchScore || 0)
    ) {
      selected = ranked[0];
    }
  }

  if (!selected) {
    return {
      recovered: false as const,
      requiresChoice: available.length > 1,
      candidates: available,
      plan: recovery.plan,
      limit: recovery.limit,
      profile,
    };
  }

  const updated = await updateSocialProviderProfileId({
    profileId: profile.id,
    provider: 'upload_post',
    providerProfileId: selected.username,
  });

  return {
    recovered: true as const,
    requiresChoice: false,
    candidates: available,
    selected,
    plan: recovery.plan,
    limit: recovery.limit,
    profile: updated,
  };
};

const zernioProfileIdFromAccount = (account: any) =>
  String(
    account?.raw?.profileId?._id ||
    account?.raw?.profileId?.id ||
    account?.raw?.profileId ||
    ''
  );

const zernioProfileName = (profile: any) =>
  `Nayla · ${String(profile.upload_post_username || profile.id).slice(-12)}`;

export const ensureZernioProfileBinding = async ({
  profile,
  userId,
  projectId,
}: {
  profile: any;
  userId: string;
  projectId: string;
}) => {
  if (profile.zernio_profile_id) return profile;

  // Recovery path for an app/database reset: if every visible connected account
  // belongs to one provider profile, it is safe to re-bind that profile locally.
  const existingAccounts = await listZernioAccounts();
  const visibleProfileIds = Array.from(new Set(
    existingAccounts
      .map(zernioProfileIdFromAccount)
      .filter(Boolean)
  ));

  if (visibleProfileIds.length === 1) {
    return updateSocialProviderProfileId({
      profileId: profile.id,
      provider: 'zernio',
      providerProfileId: visibleProfileIds[0],
    });
  }

  const stableName = zernioProfileName(profile);
  const remote = await ensureZernioProfile({
    name: stableName,
    idempotencyKey: `nayla-social-profile-${projectId}`,
  });

  return updateSocialProviderProfileId({
    profileId: profile.id,
    provider: 'zernio',
    providerProfileId: String(remote._id || remote.id),
  });
};

export const syncSocialAccounts = async (userId: string, projectId: string) => {
  let profile = await ensureSocialProfile(userId, projectId);
  const providerErrors: Record<string, string> = {};

  if (process.env.UPLOAD_POST_API_KEY) {
    try {
      await ensureUploadPostProfile(profile.upload_post_username);
      const accounts = await listUploadPostAccounts(profile.upload_post_username);
      await upsertSocialAccounts({
        socialProfileId: profile.id,
        userId,
        projectId,
        accounts,
      });
    } catch (error) {
      providerErrors.upload_post = error instanceof Error ? error.message : 'No se pudo sincronizar Ruta A.';
    }
  }

  if (process.env.ZERNIO_API_KEY) {
    try {
      profile = await ensureZernioProfileBinding({ profile, userId, projectId });
      const accounts = await listZernioAccounts(profile.zernio_profile_id);
      await upsertSocialAccounts({
        socialProfileId: profile.id,
        userId,
        projectId,
        accounts,
      });
    } catch (error) {
      providerErrors.zernio = error instanceof Error ? error.message : 'No se pudo sincronizar Ruta B.';
    }
  }

  return { profile, providerErrors };
};
