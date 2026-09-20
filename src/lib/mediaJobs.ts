import type { NaylaAction } from './naylaActions';
import {
  capabilityForNaylaAction,
  getAvailableProvidersForAction,
  requestedProviderForAction,
} from './naylaActions';
import type { MediaProviderId } from './mediaProviders/types';
import { getWorkspaceSupabaseAdmin, resolveOwnedWorkspaceScope } from './workspaceStore';

export type MediaJobDomain = 'image' | 'video' | 'audio' | '3d' | 'gpu';

export const domainForNaylaAction = (action: NaylaAction): MediaJobDomain | null => {
  if (action.action === 'GENERATE_IMAGE') return 'image';
  if (action.action === 'GENERATE_VIDEO') return 'video';
  if (action.action === 'GENERATE_AUDIO') return 'audio';
  if (action.action === 'GENERATE_3D') return '3d';
  if (action.action === 'RUN_GPU_JOB') return 'gpu';
  return null;
};

const envPreferenceForDomain = (domain: MediaJobDomain): string | undefined => {
  if (domain === 'image') return process.env.IMAGE_GENERATION_PROVIDER;
  if (domain === 'video') return process.env.VIDEO_GENERATION_PROVIDER;
  if (domain === 'audio') return process.env.AUDIO_GENERATION_PROVIDER || process.env.TTS_PROVIDER;
  if (domain === '3d') return process.env.THREED_GENERATION_PROVIDER;
  return process.env.GPU_PROCESSING_PROVIDER;
};

const chooseProvider = (
  action: NaylaAction,
  candidates: Array<{ id: MediaProviderId; label: string }>
) => {
  const requested = requestedProviderForAction(action);
  if (requested) {
    const exact = candidates.find((candidate) => candidate.id === requested);
    if (exact) return exact;
  }

  const domain = domainForNaylaAction(action);
  const envPreferred = domain ? envPreferenceForDomain(domain)?.trim() : undefined;
  if (envPreferred) {
    const preferred = candidates.find((candidate) => candidate.id === envPreferred);
    if (preferred) return preferred;
  }

  return candidates[0];
};

export const createMediaJobPlan = async ({
  userId,
  projectId,
  threadId,
  action,
}: {
  userId: string;
  projectId?: string;
  threadId?: string;
  action: NaylaAction;
}) => {
  const domain = domainForNaylaAction(action);
  const capability = capabilityForNaylaAction(action);
  if (!domain || !capability) return null;

  const scope = await resolveOwnedWorkspaceScope({ userId, projectId, threadId });
  const candidates = getAvailableProvidersForAction(action).map((provider) => ({
    id: provider.id,
    label: provider.label,
  }));
  const chosen = chooseProvider(action, candidates);

  if (!chosen) {
    return {
      id: null,
      domain,
      capability,
      projectId: scope.projectId,
      threadId: scope.threadId,
      provider: null,
      providers: candidates,
      status: 'unconfigured' as const,
    };
  }

  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('media_jobs')
    .insert({
      user_id: userId,
      project_id: scope.projectId,
      thread_id: scope.threadId || null,
      domain,
      capability,
      provider: chosen.id,
      status: 'awaiting_confirmation',
      input: action,
      metadata: {
        candidateProviders: candidates.map((candidate) => candidate.id),
        requestedProvider: requestedProviderForAction(action) || null,
      },
    })
    .select('*')
    .single();

  if (error) throw error;

  return {
    id: data.id as string,
    domain,
    capability,
    projectId: scope.projectId,
    threadId: scope.threadId,
    provider: chosen,
    providers: candidates,
    status: data.status as string,
  };
};

export const getMediaJobForUser = async ({
  userId,
  jobId,
}: {
  userId: string;
  jobId: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('media_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};
