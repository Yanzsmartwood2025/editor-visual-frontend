import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { deleteR2Object } from './r2';

let cachedAdmin: SupabaseClient | null = null;

export const getWorkspaceSupabaseAdmin = () => {
  if (cachedAdmin) return cachedAdmin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Supabase no está configurado para proyectos y chats privados.');
  }

  cachedAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedAdmin;
};

export type WorkspaceScope = {
  projectId: string;
  threadId?: string;
};

export const getOrCreateDefaultProject = async (userId: string) => {
  const supabase = getWorkspaceSupabaseAdmin();

  const { data: existing, error: existingError } = await supabase
    .from('editor_projects')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from('editor_projects')
    .insert({
      user_id: userId,
      name: 'Proyecto principal',
      metadata: { system: 'default' },
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

export const resolveOwnedWorkspaceScope = async ({
  userId,
  projectId,
  threadId,
}: {
  userId: string;
  projectId?: string | null;
  threadId?: string | null;
}): Promise<WorkspaceScope> => {
  const supabase = getWorkspaceSupabaseAdmin();

  if (threadId) {
    const { data: thread, error } = await supabase
      .from('chat_threads')
      .select('id, project_id, status')
      .eq('id', threadId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!thread) throw new Error('El chat no existe o no pertenece al usuario autenticado.');
    if (projectId && thread.project_id !== projectId) {
      throw new Error('El chat no pertenece al proyecto indicado.');
    }

    return { projectId: thread.project_id as string, threadId: thread.id as string };
  }

  if (projectId) {
    const { data: project, error } = await supabase
      .from('editor_projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!project) throw new Error('El proyecto no existe o no pertenece al usuario autenticado.');
    return { projectId: project.id as string };
  }

  const project = await getOrCreateDefaultProject(userId);
  return { projectId: project.id as string };
};

export const listProjectsForUser = async (userId: string) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('editor_projects')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const createProjectForUser = async ({
  userId,
  name,
}: {
  userId: string;
  name?: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const cleanName = name?.trim().slice(0, 120) || 'Nuevo proyecto';

  const { data, error } = await supabase
    .from('editor_projects')
    .insert({ user_id: userId, name: cleanName })
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

export const updateProjectForUser = async ({
  userId,
  projectId,
  name,
  status,
}: {
  userId: string;
  projectId: string;
  name?: string;
  status?: 'active' | 'archived';
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof name === 'string') patch.name = name.trim().slice(0, 120) || 'Proyecto';
  if (status) patch.status = status;

  const { data, error } = await supabase
    .from('editor_projects')
    .update(patch)
    .eq('id', projectId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Proyecto no encontrado.');
  return data;
};

export const deleteProjectForUser = async ({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();

  const { data: project, error: projectError } = await supabase
    .from('editor_projects')
    .select('id, name')
    .eq('id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (projectError) throw projectError;
  if (!project) throw new Error('Proyecto no encontrado.');

  const [{ data: gpuJobs, error: gpuJobsError }, { data: renderJobs, error: renderJobsError }] = await Promise.all([
    supabase
      .from('gpu_jobs')
      .select('id, status')
      .eq('user_id', userId)
      .eq('project_id', projectId),
    supabase
      .from('render_requests')
      .select('id, status')
      .eq('user_id', userId)
      .eq('project_id', projectId),
  ]);

  if (gpuJobsError) throw gpuJobsError;
  if (renderJobsError) throw renderJobsError;

  const terminalGpuStates = new Set(['completed', 'failed', 'expired', 'cancelled']);
  const activeGpuJobs = (gpuJobs || []).filter((job) => !terminalGpuStates.has(String(job.status || '').toLowerCase()));
  const activeRenderJobs = (renderJobs || []).filter((job) =>
    ['started', 'queued', 'running', 'processing'].includes(String(job.status || '').toLowerCase())
  );

  if (activeGpuJobs.length || activeRenderJobs.length) {
    throw new Error('Este proyecto tiene un proceso activo. Espera a que termine o cancélalo antes de eliminar el proyecto.');
  }

  const { data: media, error: mediaError } = await supabase
    .from('galeria_multimedia')
    .select('id, r2_key')
    .eq('user_id', userId)
    .eq('project_id', projectId);

  if (mediaError) throw mediaError;

  const r2Keys = (media || [])
    .map((item) => item.r2_key)
    .filter((key): key is string => typeof key === 'string' && key.startsWith(`${userId}/`));

  const r2Results = await Promise.allSettled(r2Keys.map((key) => deleteR2Object(key)));
  const r2DeleteFailures = r2Results.filter((result) => result.status === 'rejected').length;

  for (const table of ['media_jobs', 'gpu_jobs', 'render_requests', 'memoria_nayla']) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('user_id', userId)
      .eq('project_id', projectId);
    if (error) throw error;
  }

  const { error: galleryDeleteError } = await supabase
    .from('galeria_multimedia')
    .delete()
    .eq('user_id', userId)
    .eq('project_id', projectId);

  if (galleryDeleteError) throw galleryDeleteError;

  const { error: deleteError } = await supabase
    .from('editor_projects')
    .delete()
    .eq('id', projectId)
    .eq('user_id', userId);

  if (deleteError) throw deleteError;

  return {
    id: project.id as string,
    name: project.name as string,
    deletedMediaCount: (media || []).length,
    r2DeleteFailures,
  };
};

export const listThreadsForUser = async ({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) => {
  await resolveOwnedWorkspaceScope({ userId, projectId });
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('chat_threads')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data || [];
};

export const createThreadForUser = async ({
  userId,
  projectId,
  title,
}: {
  userId: string;
  projectId: string;
  title?: string;
}) => {
  await resolveOwnedWorkspaceScope({ userId, projectId });
  const supabase = getWorkspaceSupabaseAdmin();

  const { data, error } = await supabase
    .from('chat_threads')
    .insert({
      user_id: userId,
      project_id: projectId,
      title: title?.trim().slice(0, 160) || 'Nuevo chat',
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
};

export const updateThreadForUser = async ({
  userId,
  threadId,
  title,
  status,
}: {
  userId: string;
  threadId: string;
  title?: string;
  status?: 'active' | 'archived';
}) => {
  const scope = await resolveOwnedWorkspaceScope({ userId, threadId });
  const supabase = getWorkspaceSupabaseAdmin();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof title === 'string') patch.title = title.trim().slice(0, 160) || 'Chat';
  if (status) patch.status = status;

  const { data, error } = await supabase
    .from('chat_threads')
    .update(patch)
    .eq('id', threadId)
    .eq('user_id', userId)
    .eq('project_id', scope.projectId)
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Chat no encontrado.');
  return data;
};

export const listThreadMessagesForUser = async ({
  userId,
  threadId,
  limit = 50,
  latest = false,
}: {
  userId: string;
  threadId: string;
  limit?: number;
  latest?: boolean;
}) => {
  const scope = await resolveOwnedWorkspaceScope({ userId, threadId });
  const supabase = getWorkspaceSupabaseAdmin();

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', scope.projectId)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: !latest })
    .limit(Math.max(1, Math.min(limit, 100)));

  if (error) throw error;
  return { scope, messages: latest ? (data || []).reverse() : (data || []) };
};

export const getRecentThreadAttachedMediaForUser = async ({
  userId,
  threadId,
  projectId,
  messageLimit = 12,
}: {
  userId: string;
  threadId: string;
  projectId: string;
  messageLimit?: number;
}) => {
  const scope = await resolveOwnedWorkspaceScope({ userId, projectId, threadId });
  const supabase = getWorkspaceSupabaseAdmin();

  const { data: recentMessages, error: messageError } = await supabase
    .from('chat_messages')
    .select('id,created_at')
    .eq('user_id', userId)
    .eq('project_id', scope.projectId)
    .eq('thread_id', scope.threadId)
    .eq('role', 'user')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(messageLimit, 40)));

  if (messageError) throw messageError;
  const messageIds = (recentMessages || []).map((item: any) => String(item.id || '')).filter(Boolean);
  if (!messageIds.length) return [];

  const { data: links, error: linkError } = await supabase
    .from('chat_message_media')
    .select('message_id,media_id,created_at')
    .eq('user_id', userId)
    .in('message_id', messageIds)
    .order('created_at', { ascending: true });

  if (linkError) throw linkError;
  if (!links?.length) return [];

  const linkedByMessage = new Map<string, string[]>();
  for (const link of links) {
    const messageId = String(link.message_id || '');
    const mediaId = String(link.media_id || '');
    if (!messageId || !mediaId) continue;
    const list = linkedByMessage.get(messageId) || [];
    list.push(mediaId);
    linkedByMessage.set(messageId, list);
  }

  const latestMessageWithAttachments = messageIds.find((id) => (linkedByMessage.get(id) || []).length > 0);
  if (!latestMessageWithAttachments) return [];

  const mediaIds = linkedByMessage.get(latestMessageWithAttachments) || [];
  const { data: media, error: mediaError } = await supabase
    .from('galeria_multimedia')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', scope.projectId)
    .in('id', mediaIds);

  if (mediaError) throw mediaError;
  const byId = new Map((media || []).map((item: any) => [String(item.id), item]));
  return mediaIds.map((id) => byId.get(id)).filter(Boolean);
};

export const insertChatMessageForUser = async ({
  userId,
  projectId,
  threadId,
  role,
  content,
  action,
  metadata,
  attachmentIds = [],
}: {
  userId: string;
  projectId: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  action?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
  attachmentIds?: string[];
}) => {
  const scope = await resolveOwnedWorkspaceScope({ userId, projectId, threadId });
  const supabase = getWorkspaceSupabaseAdmin();

  const uniqueAttachmentIds = Array.from(new Set(attachmentIds));
  if (uniqueAttachmentIds.length) {
    const { data: ownedMedia, error: ownedMediaError } = await supabase
      .from('galeria_multimedia')
      .select('id')
      .eq('user_id', userId)
      .eq('project_id', scope.projectId)
      .in('id', uniqueAttachmentIds);

    if (ownedMediaError) throw ownedMediaError;
    if ((ownedMedia || []).length !== uniqueAttachmentIds.length) {
      throw new Error('Uno o más adjuntos no pertenecen a este usuario/proyecto.');
    }
  }

  const { data: message, error } = await supabase
    .from('chat_messages')
    .insert({
      user_id: userId,
      project_id: scope.projectId,
      thread_id: scope.threadId,
      role,
      content,
      action: action || null,
      metadata: metadata || {},
    })
    .select('*')
    .single();

  if (error) throw error;

  if (uniqueAttachmentIds.length) {
    const { error: linkError } = await supabase
      .from('chat_message_media')
      .insert(uniqueAttachmentIds.map((mediaId) => ({
        message_id: message.id,
        user_id: userId,
        media_id: mediaId,
      })));
    if (linkError) throw linkError;
  }

  await supabase
    .from('chat_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', scope.threadId)
    .eq('user_id', userId);

  return message;
};

export const getOwnedMediaForUser = async ({
  userId,
  mediaIds,
  projectId,
}: {
  userId: string;
  mediaIds: string[];
  projectId?: string;
}) => {
  if (!mediaIds.length) return [];
  const supabase = getWorkspaceSupabaseAdmin();

  let query = supabase
    .from('galeria_multimedia')
    .select('*')
    .eq('user_id', userId)
    .in('id', Array.from(new Set(mediaIds)));

  if (projectId) query = query.eq('project_id', projectId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};


export const getRecentOwnedMediaForUser = async ({
  userId,
  projectId,
  tipo,
  limit = 20,
}: {
  userId: string;
  projectId: string;
  tipo?: 'foto' | 'video' | 'audio' | 'documento' | 'modelo3d';
  limit?: number;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();

  let query = supabase
    .from('galeria_multimedia')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .order('creado_en', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 250)));

  if (tipo) query = query.eq('tipo', tipo);

  const { data, error } = await query;
  if (error) throw error;

  return (data || []).reverse();
};


export const getOwnedMediaByLabelsForUser = async ({
  userId,
  projectId,
  labels,
}: {
  userId: string;
  projectId: string;
  labels: string[];
}) => {
  const normalizedLabels = Array.from(new Set(
    labels
      .map((label) => String(label || '').trim().toUpperCase())
      .filter(Boolean)
  )).slice(0, 200);

  if (!normalizedLabels.length) return [];

  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('galeria_multimedia')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .in('etiqueta', normalizedLabels);

  if (error) throw error;
  return data || [];
};
