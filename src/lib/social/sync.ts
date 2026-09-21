import { ensureUploadPostProfile, listUploadPostAccounts } from './providers/uploadPost';
import { createZernioProfile, listZernioAccounts } from './providers/zernio';
import {
  ensureSocialProfile,
  updateSocialProviderProfileId,
  upsertSocialAccounts,
} from './store';

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
      if (!profile.zernio_profile_id) {
        const remote = await createZernioProfile(`Nayla · ${String(profile.id).slice(0, 8)}`);
        profile = await updateSocialProviderProfileId({
          profileId: profile.id,
          provider: 'zernio',
          providerProfileId: String(remote._id),
        });
      }
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
