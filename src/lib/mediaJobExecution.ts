import { randomUUID } from 'node:crypto';
import { naylaActionSchema, type NaylaAction } from './naylaActions';
import { createR2PresignedGetUrl, createR2StorageUrl, uploadR2Object } from './r2';
import {
  getWorkspaceSupabaseAdmin,
  resolveOwnedWorkspaceScope,
} from './workspaceStore';
import type { MediaProviderId } from './mediaProviders/types';
import {
  pollCloudProviderExecution,
  providerCanExecuteAction,
  startCloudProviderExecution,
  UnsupportedCloudExecutionError,
  type CloudOutput,
} from './mediaProviders/execution';
import { sanitizeNaylaPublicText } from './naylaSystemCatalog';

type MediaJobRow = Record<string, any>;

const terminalStates = new Set(['completed', 'failed', 'cancelled']);

const galleryTypeForDomain = (domain: string) => {
  if (domain === 'image') return 'foto';
  if (domain === 'video') return 'video';
  if (domain === 'audio') return 'audio';
  if (domain === '3d') return 'modelo3d';
  return null;
};

const fallbackContentType = (domain: string) => {
  if (domain === 'image') return 'image/png';
  if (domain === 'video') return 'video/mp4';
  if (domain === 'audio') return 'audio/mpeg';
  if (domain === '3d') return 'model/gltf-binary';
  return 'application/octet-stream';
};

const fallbackExtension = (domain: string) => {
  if (domain === 'image') return 'png';
  if (domain === 'video') return 'mp4';
  if (domain === 'audio') return 'mp3';
  if (domain === '3d') return 'glb';
  return 'bin';
};

const extensionForContentType = (contentType: string, fallback: string) => {
  const normalized = contentType.toLowerCase().split(';')[0].trim();
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/ogg': 'ogg',
    'model/gltf-binary': 'glb',
    'model/gltf+json': 'gltf',
    'application/octet-stream': fallback,
  };
  return map[normalized] || fallback;
};

const parseAction = (job: MediaJobRow): NaylaAction => {
  const parsed = naylaActionSchema.safeParse(job.input);
  if (!parsed.success) throw new Error('El trabajo guardado tiene una acción inválida.');
  return parsed.data;
};

const updateMediaJob = async (id: string, patch: Record<string, unknown>) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('media_jobs')
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as MediaJobRow;
};

const readOutputBytes = async (
  output: Extract<CloudOutput, { kind: 'url' }>
): Promise<{
  bytes: Uint8Array;
  contentType: string;
  extension?: string;
}> => {
  const response = await fetch(output.url);
  if (!response.ok) {
    throw new Error(`No se pudo guardar el resultado generado (HTTP ${response.status}).`);
  }

  const declaredLength = Number(response.headers.get('content-length'));
  const maxBytes = 150 * 1024 * 1024;
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new Error('El resultado supera el límite temporal de 150 MB para guardarlo en la Bóveda.');
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new Error('El resultado supera el límite temporal de 150 MB para guardarlo en la Bóveda.');
  }
  if (!bytes.length) throw new Error('El resultado generado está vacío.');

  return {
    bytes,
    contentType:
      output.contentType ||
      response.headers.get('content-type')?.split(';')[0] ||
      'application/octet-stream',
    extension: output.extension,
  };
};

const saveOutputToGallery = async ({
  job,
  output,
}: {
  job: MediaJobRow;
  output: Exclude<CloudOutput, { kind: 'text' }>;
}) => {
  const galleryType = galleryTypeForDomain(String(job.domain));
  if (!galleryType) throw new Error('Tipo de salida no compatible con la Bóveda.');

  const file =
    output.kind === 'binary'
      ? {
          bytes: output.bytes,
          contentType: output.contentType,
          extension: output.extension,
        }
      : await readOutputBytes(output);

  const contentType = file.contentType || fallbackContentType(String(job.domain));
  const extension = file.extension || extensionForContentType(
    contentType,
    fallbackExtension(String(job.domain))
  );

  const projectId = String(job.project_id || 'unfiled');
  const threadSegment = job.thread_id ? `threads/${job.thread_id}` : 'shared';
  const key =
    `${job.user_id}/projects/${projectId}/${threadSegment}/cloud/${job.domain}/${job.id}.${extension}`;

  await uploadR2Object(key, file.bytes, contentType);

  const supabase = getWorkspaceSupabaseAdmin();
  let countQuery = supabase
    .from('galeria_multimedia')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', job.user_id)
    .eq('tipo', galleryType);
  if (job.project_id) countQuery = countQuery.eq('project_id', job.project_id);
  const { count, error: countError } = await countQuery;
  if (countError) throw countError;

  const prefix =
    job.domain === 'image'
      ? 'FC'
      : job.domain === 'video'
        ? 'VC'
        : job.domain === 'audio'
          ? 'AC'
          : 'MC';

  const galleryItem = {
    id: randomUUID(),
    user_id: job.user_id,
    project_id: job.project_id,
    thread_id: job.thread_id || null,
    url: createR2StorageUrl(key),
    r2_key: key,
    privacy: 'private',
    tipo: galleryType,
    nombre: `Nayla Cloud ${job.domain} ${String(job.id).slice(0, 8)}.${extension}`,
    creado_en: new Date().toISOString(),
    esOverlay: false,
    etiqueta: prefix + ((count || 0) + 1),
    fuente: 'nayla-cloud',
    metadata: {
      sourceProvider: 'nayla-cloud',
      mediaJobId: job.id,
      contentType,
      contentLength: file.bytes.byteLength,
      generation: 'nayla-cloud',
    },
  };

  const { data: inserted, error: insertError } = await supabase
    .from('galeria_multimedia')
    .insert(galleryItem)
    .select('*')
    .single();
  if (insertError) throw insertError;

  return {
    ...inserted,
    url: createR2PresignedGetUrl({ key, expiresIn: 3600 }).url,
  };
};

const completeMediaJob = async ({
  job,
  output,
  providerMetadata,
}: {
  job: MediaJobRow;
  output: CloudOutput;
  providerMetadata?: Record<string, unknown>;
}) => {
  if (output.kind === 'text') {
    return updateMediaJob(job.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      error_message: null,
      metadata: {
        ...(job.metadata || {}),
        providerExecution: {
          ...(job.metadata?.providerExecution || {}),
          ...(providerMetadata || {}),
        },
        textOutput: output.text,
      },
    });
  }

  const galleryItem = await saveOutputToGallery({ job, output });
  return updateMediaJob(job.id, {
    status: 'completed',
    output_gallery_item_id: galleryItem.id,
    completed_at: new Date().toISOString(),
    error_message: null,
    metadata: {
      ...(job.metadata || {}),
      providerExecution: {
        ...(job.metadata?.providerExecution || {}),
        ...(providerMetadata || {}),
      },
    },
  });
};

const getGalleryForJob = async (job: MediaJobRow) => {
  if (!job.output_gallery_item_id) return null;
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('galeria_multimedia')
    .select('*')
    .eq('id', job.output_gallery_item_id)
    .eq('user_id', job.user_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data.r2_key
    ? {
        ...data,
        fuente: 'nayla-cloud',
        metadata: {
          ...(data.metadata || {}),
          sourceProvider: 'nayla-cloud',
        },
        url: createR2PresignedGetUrl({ key: data.r2_key, expiresIn: 3600 }).url,
      }
    : {
        ...data,
        fuente: 'nayla-cloud',
        metadata: {
          ...(data.metadata || {}),
          sourceProvider: 'nayla-cloud',
        },
      };
};

export const publicMediaJob = async (job: MediaJobRow) => {
  const galleryItem = await getGalleryForJob(job);
  return {
    id: job.id,
    mediaJobId: job.id,
    engine: 'nayla-cloud' as const,
    domain: job.domain,
    capability: job.capability,
    status: job.status,
    projectId: job.project_id,
    threadId: job.thread_id,
    outputGalleryItemId: job.output_gallery_item_id || null,
    outputUrl: galleryItem?.url || null,
    galleryItem,
    textOutput:
      typeof job.metadata?.textOutput === 'string'
        ? job.metadata.textOutput
        : null,
    error:
      job.error_message
        ? sanitizeNaylaPublicText(String(job.error_message))
        : null,
    createdAt: job.created_at,
    completedAt: job.completed_at,
  };
};

export const getMediaJobRowForUser = async ({
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
  return data as MediaJobRow | null;
};

export const startMediaJobForUser = async ({
  userId,
  jobId,
}: {
  userId: string;
  jobId: string;
}) => {
  let job = await getMediaJobRowForUser({ userId, jobId });
  if (!job) throw new Error('Trabajo Nayla Cloud no encontrado.');

  await resolveOwnedWorkspaceScope({
    userId,
    projectId: job.project_id,
    threadId: job.thread_id,
  });

  if (terminalStates.has(String(job.status))) return publicMediaJob(job);
  if (!['awaiting_confirmation', 'planned'].includes(String(job.status))) {
    return publicMediaJob(job);
  }

  const action = parseAction(job);
  const candidateIds: MediaProviderId[] = Array.isArray(job.metadata?.candidateProviders)
    ? (job.metadata.candidateProviders as unknown[])
        .filter((value: unknown): value is MediaProviderId => typeof value === 'string')
    : [job.provider as MediaProviderId];

  const uniqueCandidates: MediaProviderId[] = Array.from(new Set<MediaProviderId>(candidateIds))
    .filter((provider) => providerCanExecuteAction(provider, action));

  if (!uniqueCandidates.length) {
    job = await updateMediaJob(job.id, {
      status: 'failed',
      error_message: 'Nayla Cloud no tiene todavía un ejecutor compatible para esta operación.',
      completed_at: new Date().toISOString(),
    });
    return publicMediaJob(job);
  }

  const errors: string[] = [];
  for (const provider of uniqueCandidates) {
    try {
      const started = await startCloudProviderExecution(provider, action);

      if (started.state === 'completed') {
        job = await updateMediaJob(job.id, {
          provider,
          status: 'running',
          metadata: {
            ...(job.metadata || {}),
            providerExecution: {
              provider,
              ...(started.metadata || {}),
            },
          },
        });
        job = await completeMediaJob({
          job,
          output: started.output,
          providerMetadata: started.metadata,
        });
        return publicMediaJob(job);
      }

      job = await updateMediaJob(job.id, {
        provider,
        provider_job_id: started.providerJobId,
        status: 'queued',
        error_message: null,
        metadata: {
          ...(job.metadata || {}),
          providerExecution: {
            provider,
            ...(started.metadata || {}),
          },
        },
      });
      return publicMediaJob(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      errors.push(`${provider}: ${message}`);
      if (error instanceof UnsupportedCloudExecutionError) {
        continue;
      }

      // Once a real provider request was attempted we do not cascade to another
      // paid route: an ambiguous network/provider failure could otherwise
      // create two billable generations.
      console.warn('[nayla-cloud] La ruta elegida falló; se detiene para evitar doble gasto:', provider, error);
      break;
    }
  }

  job = await updateMediaJob(job.id, {
    status: 'failed',
    error_message:
      'Nayla Cloud no pudo iniciar ninguna ruta compatible. ' +
      errors.map((item) => item.replace(/^\w+:/, '')).join(' | ').slice(0, 1600),
    completed_at: new Date().toISOString(),
    metadata: {
      ...(job.metadata || {}),
      executionErrors: errors.slice(0, 10),
    },
  });
  return publicMediaJob(job);
};

export const refreshMediaJobForUser = async ({
  userId,
  jobId,
}: {
  userId: string;
  jobId: string;
}) => {
  let job = await getMediaJobRowForUser({ userId, jobId });
  if (!job) throw new Error('Trabajo Nayla Cloud no encontrado.');

  if (terminalStates.has(String(job.status))) return publicMediaJob(job);
  if (!['queued', 'running'].includes(String(job.status))) return publicMediaJob(job);
  if (!job.provider_job_id) {
    job = await updateMediaJob(job.id, {
      status: 'failed',
      error_message: 'El trabajo perdió su identificador de ejecución.',
      completed_at: new Date().toISOString(),
    });
    return publicMediaJob(job);
  }

  const action = parseAction(job);
  const provider = job.provider as MediaProviderId;
  const providerMetadata =
    job.metadata?.providerExecution && typeof job.metadata.providerExecution === 'object'
      ? job.metadata.providerExecution as Record<string, unknown>
      : {};

  try {
    const result = await pollCloudProviderExecution({
      provider,
      action,
      providerJobId: String(job.provider_job_id),
      metadata: providerMetadata,
    });

    if (result.state === 'completed') {
      job = await completeMediaJob({
        job,
        output: result.output,
        providerMetadata: result.metadata,
      });
      return publicMediaJob(job);
    }

    if (result.state === 'failed') {
      job = await updateMediaJob(job.id, {
        status: 'failed',
        error_message: result.error,
        completed_at: new Date().toISOString(),
        metadata: {
          ...(job.metadata || {}),
          providerExecution: {
            ...providerMetadata,
            ...(result.metadata || {}),
          },
        },
      });
      return publicMediaJob(job);
    }

    if (job.status !== result.state) {
      job = await updateMediaJob(job.id, {
        status: result.state,
        metadata: {
          ...(job.metadata || {}),
          providerExecution: {
            ...providerMetadata,
            ...(result.metadata || {}),
          },
        },
      });
    }
    return publicMediaJob(job);
  } catch (error) {
    const raw = error instanceof Error ? error.message : 'No se pudo consultar el trabajo.';
    job = await updateMediaJob(job.id, {
      status: 'failed',
      error_message: raw.slice(0, 1800),
      completed_at: new Date().toISOString(),
    });
    return publicMediaJob(job);
  }
};
