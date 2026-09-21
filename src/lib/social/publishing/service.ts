import { getSocialNetwork } from '../types';
import { publishUploadPostVideo } from '../providers/uploadPost';
import { publishZernioVideo } from '../providers/zernio';
import {
  createIdempotencyKey,
  createSocialPostWithTargets,
  ensureSocialProfile,
  finishSocialPost,
  getOwnedPublishMedia,
  getSocialAccountForUser,
  recordSocialUsage,
  updateSocialTarget,
} from '../store';

const providerPostId = (value: any) =>
  value?.platformPostId || value?.post_id || value?.video_id || value?.publish_id || value?.id || null;

const providerPostUrl = (value: any) =>
  value?.platformPostUrl || value?.url || value?.permalink || null;

export const publishSocialVideo = async ({
  userId,
  projectId,
  mediaId,
  accountIds,
  title = '',
  caption = '',
  source = 'social_ui',
}: {
  userId: string;
  projectId: string;
  mediaId: string;
  accountIds: string[];
  title?: string;
  caption?: string;
  source?: string;
}) => {
  const media = await getOwnedPublishMedia({ userId, projectId, mediaId });
  const profile = await ensureSocialProfile(userId, projectId);
  const accounts = await Promise.all(
    accountIds.map((accountId) => getSocialAccountForUser({ userId, projectId, accountId }))
  );
  const activeAccounts = accounts.filter((account) => account.status === 'connected');
  if (!activeAccounts.length) throw new Error('No hay destinos conectados para publicar.');

  const { post, targets } = await createSocialPostWithTargets({
    userId,
    projectId,
    mediaId,
    mediaLabel: media.etiqueta,
    title,
    caption,
    accounts: activeAccounts,
  });

  const targetByAccount = new Map(targets.map((target: any) => [target.account_id, target]));
  let published = 0;
  let failed = 0;
  let unresolved = 0;

  const routeA = activeAccounts.filter((account) => account.provider === 'upload_post');
  if (routeA.length) {
    const routeTargets = routeA.map((account) => targetByAccount.get(account.id)).filter(Boolean) as any[];
    try {
      if (!process.env.UPLOAD_POST_API_KEY) throw new Error('La conexión social principal no está disponible.');
      const idempotencyKey = createIdempotencyKey();
      const result = await publishUploadPostVideo({
        username: profile.upload_post_username,
        videoUrl: media.url,
        title,
        caption,
        platforms: Array.from(new Set(routeA.map((account) => account.platform))) as any,
        idempotencyKey,
      });
      const results = result?.results || {};

      for (const account of routeA) {
        const target = targetByAccount.get(account.id);
        if (!target) continue;
        const mapped = getSocialNetwork(account.platform)?.uploadPostPublish || account.platform;
        const outcome = results[mapped] || results[account.platform];

        if (outcome?.success === true) {
          published += 1;
          await updateSocialTarget(target.id, {
            status: 'published',
            provider_request_id: result?.request_id || idempotencyKey,
            provider_post_id: providerPostId(outcome),
            post_url: providerPostUrl(outcome),
            published_at: new Date().toISOString(),
          });
        } else if (outcome?.success === false || outcome?.error || outcome?.skipped) {
          failed += 1;
          await updateSocialTarget(target.id, {
            status: outcome?.skipped ? 'skipped' : 'failed',
            provider_request_id: result?.request_id || idempotencyKey,
            error_message: String(outcome?.error || outcome?.message || 'Destino no publicado.'),
          });
        } else {
          unresolved += 1;
          await updateSocialTarget(target.id, {
            status: 'publishing',
            provider_request_id: result?.request_id || idempotencyKey,
          });
        }

        await recordSocialUsage({
          userId,
          projectId,
          action: 'publish_attempt',
          provider: 'upload_post',
          platform: account.platform,
          metadata: { socialPostId: post.id, targetId: target.id, source },
        });
      }
    } catch (error) {
      for (const target of routeTargets) {
        failed += 1;
        await updateSocialTarget(target.id, {
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'La publicación falló.',
        });
      }
    }
  }

  const routeB = activeAccounts.filter((account) => account.provider === 'zernio');
  if (routeB.length) {
    const routeTargets = routeB.map((account) => targetByAccount.get(account.id)).filter(Boolean) as any[];
    try {
      if (!process.env.ZERNIO_API_KEY) throw new Error('La conexión social secundaria no está disponible.');
      const idempotencyKey = createIdempotencyKey();
      const result = await publishZernioVideo({
        videoUrl: media.url,
        title,
        caption,
        accounts: routeB.map((account) => ({
          platform: account.platform,
          accountId: String(account.provider_account_id),
        })),
        idempotencyKey,
      });
      const outcomes = Array.isArray(result?.post?.platforms) ? result.post.platforms : [];

      for (const account of routeB) {
        const target = targetByAccount.get(account.id);
        if (!target) continue;
        const mapped = getSocialNetwork(account.platform)?.zernio || account.platform;
        const outcome = outcomes.find((item: any) => {
          const responseAccountId = String(item?.accountId?._id || item?.accountId || '');
          return responseAccountId === String(account.provider_account_id)
            || (
              String(item?.platform || '') === mapped &&
              routeB.filter((candidate) => candidate.platform === account.platform).length === 1
            );
        });

        if (outcome?.status === 'published') {
          published += 1;
          await updateSocialTarget(target.id, {
            status: 'published',
            provider_request_id: result?.post?._id || idempotencyKey,
            provider_post_id: providerPostId(outcome),
            post_url: providerPostUrl(outcome),
            published_at: outcome?.publishedAt || new Date().toISOString(),
          });
        } else if (outcome?.status === 'failed' || outcome?.error) {
          failed += 1;
          await updateSocialTarget(target.id, {
            status: 'failed',
            provider_request_id: result?.post?._id || idempotencyKey,
            error_message: String(outcome?.error || outcome?.message || 'Destino no publicado.'),
          });
        } else {
          unresolved += 1;
          await updateSocialTarget(target.id, {
            status: outcome?.status === 'scheduled' ? 'scheduled' : 'publishing',
            provider_request_id: result?.post?._id || idempotencyKey,
            provider_post_id: providerPostId(outcome),
            post_url: providerPostUrl(outcome),
          });
        }

        await recordSocialUsage({
          userId,
          projectId,
          action: 'publish_attempt',
          provider: 'zernio',
          platform: account.platform,
          metadata: { socialPostId: post.id, targetId: target.id, source },
        });
      }
    } catch (error) {
      for (const target of routeTargets) {
        failed += 1;
        await updateSocialTarget(target.id, {
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'La publicación falló.',
        });
      }
    }
  }

  if (!unresolved) {
    await finishSocialPost(
      post.id,
      published > 0 && failed > 0 ? 'partial' : published > 0 ? 'published' : 'failed'
    );
  }

  return {
    success: published > 0 || unresolved > 0,
    postId: post.id,
    mediaId,
    mediaLabel: media.etiqueta || null,
    published,
    failed,
    processing: unresolved,
  };
};
