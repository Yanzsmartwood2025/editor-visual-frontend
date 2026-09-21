import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getSocialNetwork } from '../../../lib/social/types';
import { publishUploadPostVideo } from '../../../lib/social/providers/uploadPost';
import { publishZernioVideo } from '../../../lib/social/providers/zernio';
import { requireSocialUser } from '../../../lib/social/http';
import {
  createIdempotencyKey,
  createSocialPostWithTargets,
  finishSocialPost,
  getOwnedPublishMedia,
  getSocialAccountForUser,
  recordSocialUsage,
  updateSocialTarget,
  ensureSocialProfile,
} from '../../../lib/social/store';

const schema = z.object({
  projectId: z.string().uuid(),
  mediaId: z.string().uuid(),
  accountIds: z.array(z.string().uuid()).min(1).max(30),
  title: z.string().trim().max(300).default(''),
  caption: z.string().trim().max(10000).default(''),
});

const providerPostId = (value: any) =>
  value?.platformPostId || value?.post_id || value?.video_id || value?.publish_id || value?.id || null;

const providerPostUrl = (value: any) =>
  value?.platformPostUrl || value?.url || value?.permalink || null;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });
  const user = await requireSocialUser(req, res);
  if (!user) return;
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Publicación inválida.' });

  try {
    const { projectId, mediaId, title, caption } = parsed.data;
    const media = await getOwnedPublishMedia({ userId: user.uid, projectId, mediaId });
    const profile = await ensureSocialProfile(user.uid, projectId);
    const accounts = await Promise.all(parsed.data.accountIds.map((accountId) =>
      getSocialAccountForUser({ userId: user.uid, projectId, accountId })
    ));
    const activeAccounts = accounts.filter((account) => account.status === 'connected');
    if (!activeAccounts.length) return res.status(400).json({ error: 'No hay destinos conectados para publicar.' });

    const { post, targets } = await createSocialPostWithTargets({
      userId: user.uid,
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
        if (!process.env.UPLOAD_POST_API_KEY) throw new Error('Ruta A no tiene credencial configurada.');
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
            userId: user.uid,
            projectId,
            action: 'publish_attempt',
            provider: 'upload_post',
            platform: account.platform,
            metadata: { socialPostId: post.id, targetId: target.id },
          });
        }
      } catch (error) {
        for (const target of routeTargets) {
          failed += 1;
          await updateSocialTarget(target.id, {
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Ruta A falló.',
          });
        }
      }
    }

    const routeB = activeAccounts.filter((account) => account.provider === 'zernio');
    if (routeB.length) {
      const routeTargets = routeB.map((account) => targetByAccount.get(account.id)).filter(Boolean) as any[];
      try {
        if (!process.env.ZERNIO_API_KEY) throw new Error('Ruta B no tiene credencial configurada.');
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
              || (String(item?.platform || '') === mapped && routeB.filter((candidate) => candidate.platform === account.platform).length === 1);
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
            userId: user.uid,
            projectId,
            action: 'publish_attempt',
            provider: 'zernio',
            platform: account.platform,
            metadata: { socialPostId: post.id, targetId: target.id },
          });
        }
      } catch (error) {
        for (const target of routeTargets) {
          failed += 1;
          await updateSocialTarget(target.id, {
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Ruta B falló.',
          });
        }
      }
    }

    if (!unresolved) {
      await finishSocialPost(post.id, published > 0 && failed > 0 ? 'partial' : published > 0 ? 'published' : 'failed');
    }

    return res.status(200).json({
      success: published > 0 || unresolved > 0,
      postId: post.id,
      published,
      failed,
      processing: unresolved,
    });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'No se pudo publicar.' });
  }
}
