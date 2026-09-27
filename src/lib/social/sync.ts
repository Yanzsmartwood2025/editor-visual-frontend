import { ensureUploadPostProfile, listUploadPostAccounts } from './providers/uploadPost';
import { ensureZernioProfile, listZernioAccounts } from './providers/zernio';
import {
  ensureSocialProfile,
  updateSocialProviderProfileId,
  upsertSocialAccounts,
} from './store';

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
