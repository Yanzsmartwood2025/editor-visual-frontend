import { getWorkspaceSupabaseAdmin } from '../../workspaceStore';
import {
  claimNaylaActionPlan,
  createNaylaActionPlan,
  finishNaylaActionPlan,
  getPendingNaylaActionPlan,
  updateNaylaActionItem,
} from '../../naylaUniversalActions';
import { cancelPendingAutomation } from '../automation/service';
import { generateSocialText, parseJsonObject } from '../ai/generate';
import { getPersonMemoryContext } from '../identity/service';
import { ensureSocialProfile, recordSocialUsage } from '../store';
import { replyUploadPostComment, sendUploadPostDm } from '../providers/uploadPost';
import { replyZernioComment, sendZernioMessage } from '../providers/zernio';
import { publishSocialVideo } from '../publishing/service';

type Candidate = {
  interactionId: string;
  personId: string;
  personName: string;
  platform: string;
  channel: 'comment' | 'dm';
  message: string;
  occurredAt: string;
};

type PlannedReply = {
  interactionId?: string;
  reply?: string;
};

const hasReplyCommandIntent = (message: string) =>
  /\b(responde|respondeles|respóndeles|responder|contesta|contéstale|contestale|contesten|dile|diles|escríbele|escribele)\b/i.test(message);

const hasPublishCommandIntent = (message: string) =>
  /\b(publica|publicalo|publícalo|publicar|sube|subelo|súbelo|postea|postear|comparte|compartelo|compártelo)\b/i.test(message);

const loadCandidates = async ({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('social_interactions')
    .select('id,person_id,platform,channel,body,occurred_at,response_state,social_people(display_name,preferred_name)')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('direction', 'inbound')
    .eq('response_state', 'unanswered')
    .order('occurred_at', { ascending: false })
    .limit(40);

  if (error) throw error;

  return (data || []).map((item: any): Candidate => {
    const person = Array.isArray(item.social_people)
      ? item.social_people[0]
      : item.social_people;
    return {
      interactionId: String(item.id),
      personId: String(item.person_id),
      personName: String(person?.preferred_name || person?.display_name || 'Persona'),
      platform: String(item.platform || 'social'),
      channel: item.channel === 'dm' ? 'dm' : 'comment',
      message: String(item.body || ''),
      occurredAt: String(item.occurred_at || ''),
    };
  });
};

const memoryForCandidates = async (candidates: Candidate[]) => {
  const unique = Array.from(new Set(candidates.map((item) => item.personId))).slice(0, 12);
  const entries = await Promise.all(unique.map(async (personId) => {
    try {
      const context = await getPersonMemoryContext(personId);
      const personName =
        context.person?.preferred_name ||
        context.person?.display_name ||
        candidates.find((item) => item.personId === personId)?.personName ||
        'Persona';
      const facts = (context.memories || [])
        .slice(0, 8)
        .map((memory: any) => `${memory.memory_key ? memory.memory_key + ': ' : ''}${memory.memory_value}`);
      return {
        personId,
        personName,
        summary: context.summary?.summary || context.person?.summary || '',
        memories: facts,
      };
    } catch {
      return null;
    }
  }));
  return entries.filter(Boolean);
};

const buildPlanText = (items: Array<{ candidate: Candidate; reply: string }>) => {
  const lines = items.map(({ candidate, reply }, index) =>
    `${index + 1}. ${candidate.personName} · ${candidate.platform} · ${candidate.channel === 'dm' ? 'mensaje' : 'comentario'}\n   “${reply}”`
  );

  return [
    `Preparé ${items.length} respuesta${items.length === 1 ? '' : 's'}:`,
    '',
    ...lines,
    '',
    'No he enviado nada todavía. Si está bien, dime “Dale” y lo ejecuto.',
  ].join('\n');
};

const planPublishCommand = async ({
  userId,
  projectId,
  threadId,
  message,
}: {
  userId: string;
  projectId: string;
  threadId: string;
  message: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();

  const [mediaResult, accountResult] = await Promise.all([
    supabase
      .from('galeria_multimedia')
      .select('id,tipo,nombre,etiqueta,created_at')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .eq('tipo', 'video')
      .order('created_at', { ascending: false })
      .limit(40),
    supabase
      .from('social_accounts')
      .select('id,provider,platform,username,handle,display_name,status')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .eq('status', 'connected')
      .order('platform'),
  ]);

  if (mediaResult.error) throw mediaResult.error;
  if (accountResult.error) throw accountResult.error;

  const media = mediaResult.data || [];
  const rawAccounts = accountResult.data || [];

  const seenAccounts = new Set<string>();
  const accounts = rawAccounts.filter((account: any) => {
    const identity = String(
      account.handle ||
      account.username ||
      account.display_name ||
      account.provider_account_id ||
      account.id
    ).trim().toLowerCase();
    const key = `${account.platform}:${identity}`;
    if (seenAccounts.has(key)) return false;
    seenAccounts.add(key);
    return true;
  });

  if (!media.length) {
    return {
      kind: 'no_candidates' as const,
      text: 'No encuentro un video R1/R2 disponible en la Bóveda de este proyecto para publicar.',
    };
  }

  if (!accounts.length) {
    return {
      kind: 'no_candidates' as const,
      text: 'No hay cuentas sociales conectadas en este proyecto. Conecta una cuenta y después podré preparar la publicación.',
    };
  }

  const systemPrompt = [
    'Eres el planificador de publicación social de Nayla.',
    'Devuelve SOLO JSON válido y no publiques nada.',
    'Usa únicamente mediaId y accountId presentes en CANDIDATOS.',
    'Si el usuario menciona R1, R2 u otra etiqueta, elige exactamente esa etiqueta. No sustituyas un video por otro.',
    'Selecciona solamente las redes que el usuario pidió.',
    'Si hay ambigüedad entre varias cuentas de la misma red y el usuario no dio suficiente detalle, devuelve intent none.',
    'No inventes contenido del video. Si el usuario no dio título o descripción, puedes dejarlos vacíos.',
    'Formato exacto: {"intent":"publish|none","mediaId":"uuid","accountIds":["uuid"],"title":"texto","caption":"texto"}',
  ].join('\n');

  const prompt = [
    `ORDEN DEL USUARIO:\n${message}`,
    '',
    'VIDEOS DISPONIBLES:',
    JSON.stringify(media),
    '',
    'CUENTAS CONECTADAS:',
    JSON.stringify(accounts.map((account: any) => ({
      accountId: account.id,
      platform: account.platform,
      handle: account.handle || account.username || '',
      displayName: account.display_name || '',
    }))),
  ].join('\n');

  const raw = await generateSocialText({ systemPrompt, prompt });
  const parsed = parseJsonObject<{
    intent?: string;
    mediaId?: string;
    accountIds?: string[];
    title?: string;
    caption?: string;
  }>(raw);

  if (!parsed || parsed.intent !== 'publish') return null;

  const selectedMedia = media.find((item: any) => item.id === parsed.mediaId);
  const allowedAccounts = new Map(accounts.map((account: any) => [account.id, account]));
  const accountIds = Array.from(new Set((parsed.accountIds || []).map(String)))
    .filter((id) => allowedAccounts.has(id))
    .slice(0, 12);

  if (!selectedMedia || !accountIds.length) return null;

  const destinations = accountIds
    .map((id) => allowedAccounts.get(id))
    .filter(Boolean)
    .map((account: any) => {
      const who = account.handle || account.username || account.display_name || '';
      return who ? `${account.platform} (${who.startsWith('@') ? who : '@' + who})` : account.platform;
    });

  const title = String(parsed.title || '').trim().slice(0, 300);
  const caption = String(parsed.caption || '').trim().slice(0, 10000);
  const label = selectedMedia.etiqueta || selectedMedia.nombre || 'video';

  const summary = [
    `Voy a publicar ${label} en ${destinations.join(', ')}.`,
    title ? `Título: ${title}` : '',
    caption ? `Descripción: ${caption}` : '',
    '',
    'No he publicado nada todavía. Si está bien, dime “Dale” y lo ejecuto.',
  ].filter(Boolean).join('\n');

  const stored = await createNaylaActionPlan({
    userId,
    projectId,
    module: 'social',
    threadKey: threadId,
    summary,
    sourceMessage: message,
    items: [{
      actionType: 'SOCIAL_PUBLISH_VIDEO',
      payload: {
        mediaId: selectedMedia.id,
        mediaLabel: selectedMedia.etiqueta || null,
        accountIds,
        title,
        caption,
        destinations,
      },
    }],
    metadata: {
      planner: 'nayla-social-publish',
      mediaId: selectedMedia.id,
      destinations,
    },
  });

  return {
    kind: 'plan' as const,
    text: summary,
    planId: stored.plan.id,
    count: 1,
  };
};

export const planSocialCommand = async ({
  userId,
  projectId,
  threadId,
  message,
}: {
  userId: string;
  projectId: string;
  threadId: string;
  message: string;
}) => {
  if (hasPublishCommandIntent(message)) {
    return planPublishCommand({ userId, projectId, threadId, message });
  }

  if (!hasReplyCommandIntent(message)) return null;

  const supabase = getWorkspaceSupabaseAdmin();
  await supabase
    .from('social_interactions')
    .update({ response_state: 'unanswered' })
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('response_state', 'planned');

  const candidates = await loadCandidates({ userId, projectId });
  if (!candidates.length) {
    return {
      kind: 'no_candidates' as const,
      text: 'No tengo comentarios o mensajes pendientes registrados para ejecutar esa orden. Abre Inbox y carga la actividad de la cuenta; después puedo preparar las respuestas.',
    };
  }

  const memories = await memoryForCandidates(candidates);

  const systemPrompt = [
    'Eres el planificador de acciones sociales de Nayla.',
    'Devuelve SOLO JSON válido. No ejecutes nada.',
    'Selecciona únicamente interactionId que aparezcan en CANDIDATOS.',
    'La orden del usuario manda: si nombra personas, selecciona solo coincidencias claras; si dice todos/estos mensajes, selecciona únicamente los pendientes razonablemente cubiertos por la orden.',
    'Máximo 10 respuestas por plan.',
    'Cada reply debe ser breve, natural, listo para publicar y coherente con el mensaje recibido.',
    'Usa la memoria no sensible solo para continuidad. Nunca menciones que guardas memoria.',
    'No inventes precios, promesas, disponibilidad ni hechos.',
    'Si una interacción es queja, reembolso, legal, médica, política, sexual, amenaza o delicada, no la incluyas automáticamente salvo que el usuario la haya señalado de forma inequívoca; aun así redacta de manera prudente y neutral.',
    'Formato exacto: {"intent":"reply|none","items":[{"interactionId":"uuid","reply":"texto"}],"note":"texto breve opcional"}',
  ].join('\n');

  const prompt = [
    `ORDEN DEL USUARIO:\n${message}`,
    '',
    'CANDIDATOS:',
    JSON.stringify(candidates),
    '',
    'MEMORIA NO SENSIBLE DISPONIBLE:',
    JSON.stringify(memories),
  ].join('\n');

  const raw = await generateSocialText({ systemPrompt, prompt });
  const parsed = parseJsonObject<{ intent?: string; items?: PlannedReply[]; note?: string }>(raw);

  if (!parsed || parsed.intent !== 'reply' || !Array.isArray(parsed.items) || !parsed.items.length) {
    return null;
  }

  const byId = new Map(candidates.map((candidate) => [candidate.interactionId, candidate]));
  const seen = new Set<string>();
  const valid = parsed.items
    .slice(0, 10)
    .map((item) => {
      const id = String(item.interactionId || '');
      const candidate = byId.get(id);
      const reply = String(item.reply || '').trim().slice(0, 1800);
      if (!candidate || !reply || seen.has(id)) return null;
      seen.add(id);
      return { candidate, reply };
    })
    .filter(Boolean) as Array<{ candidate: Candidate; reply: string }>;

  if (!valid.length) return null;

  const summary = buildPlanText(valid);
  const stored = await createNaylaActionPlan({
    userId,
    projectId,
    module: 'social',
    threadKey: threadId,
    summary,
    sourceMessage: message,
    items: valid.map(({ candidate, reply }) => ({
      actionType: 'SOCIAL_REPLY_INTERACTION',
      payload: {
        interactionId: candidate.interactionId,
        personId: candidate.personId,
        personName: candidate.personName,
        platform: candidate.platform,
        channel: candidate.channel,
        reply,
      },
    })),
    metadata: {
      planner: 'nayla-social',
      count: valid.length,
    },
  });

  await supabase
    .from('social_interactions')
    .update({ response_state: 'planned' })
    .in('id', valid.map(({ candidate }) => candidate.interactionId))
    .eq('response_state', 'unanswered');

  return {
    kind: 'plan' as const,
    text: summary,
    planId: stored.plan.id,
    count: valid.length,
  };
};

const executeReplyItem = async ({
  userId,
  projectId,
  item,
}: {
  userId: string;
  projectId: string;
  item: any;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const interactionId = String(item.payload?.interactionId || '');
  const reply = String(item.payload?.reply || '').trim();
  if (!interactionId || !reply) throw new Error('La acción social está incompleta.');

  const { data: interaction, error: interactionError } = await supabase
    .from('social_interactions')
    .select('*')
    .eq('id', interactionId)
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .maybeSingle();

  if (interactionError) throw interactionError;
  if (!interaction) throw new Error('La interacción ya no existe.');
  if (interaction.direction !== 'inbound') throw new Error('La interacción no es entrante.');
  if (interaction.response_state === 'responded') {
    return { skipped: true, reason: 'Ya fue respondida.' };
  }

  const { data: account, error: accountError } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('id', interaction.account_id)
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .maybeSingle();

  if (accountError) throw accountError;
  if (!account || account.status !== 'connected') throw new Error('La cuenta social ya no está conectada.');

  const profile = await ensureSocialProfile(userId, projectId);
  let providerResult: any;

  await cancelPendingAutomation({
    accountId: account.id,
    channel: interaction.channel,
    sourceId: interaction.channel === 'comment' ? interaction.source_id : undefined,
    conversationId: interaction.channel === 'dm' ? interaction.provider_conversation_id : undefined,
    reason: 'Nayla ejecutó una orden confirmada por el usuario.',
  });

  if (interaction.channel === 'comment') {
    if (!interaction.provider_post_id) throw new Error('Falta el identificador de la publicación.');

    providerResult = account.provider === 'upload_post'
      ? await replyUploadPostComment({
          username: profile.upload_post_username,
          platform: interaction.platform,
          postId: String(interaction.provider_post_id),
          commentId: String(interaction.source_id),
          message: reply,
        })
      : await replyZernioComment({
          accountId: String(account.provider_account_id),
          postId: String(interaction.provider_post_id),
          commentId: String(interaction.source_id),
          message: reply,
        });
  } else {
    if (account.provider === 'zernio') {
      if (!interaction.provider_conversation_id) throw new Error('Falta la conversación del mensaje.');
      providerResult = await sendZernioMessage(
        String(interaction.provider_conversation_id),
        String(account.provider_account_id),
        reply
      );
    } else {
      if (account.platform !== 'instagram' || !interaction.provider_parent_id) {
        throw new Error('Esta cuenta no permite responder mensajes privados desde Nayla.');
      }
      providerResult = await sendUploadPostDm({
        username: profile.upload_post_username,
        platform: interaction.platform,
        recipientId: String(interaction.provider_parent_id),
        message: reply,
      });
    }
  }

  const respondedAt = new Date().toISOString();
  const { error: responseError } = await supabase
    .from('social_interactions')
    .update({
      response_state: 'responded',
      responded_at: respondedAt,
      response_text: reply,
      response_source: 'nayla_command',
      automation_state: 'processed',
    })
    .eq('id', interaction.id);

  if (responseError) throw responseError;

  await recordSocialUsage({
    userId,
    projectId,
    action: interaction.channel === 'comment' ? 'comment_reply' : 'direct_message',
    provider: account.provider,
    platform: interaction.platform,
    metadata: {
      source: 'nayla_universal_dale',
      interactionId: interaction.id,
      personId: interaction.person_id,
    },
  });

  return {
    skipped: false,
    interactionId: interaction.id,
    personId: interaction.person_id,
    platform: interaction.platform,
    channel: interaction.channel,
    providerResult,
  };
};

const executePublishItem = async ({
  userId,
  projectId,
  item,
}: {
  userId: string;
  projectId: string;
  item: any;
}) => {
  const mediaId = String(item.payload?.mediaId || '');
  const accountIds = Array.isArray(item.payload?.accountIds)
    ? item.payload.accountIds.map(String)
    : [];
  const title = String(item.payload?.title || '');
  const caption = String(item.payload?.caption || '');

  if (!mediaId || !accountIds.length) {
    throw new Error('La orden de publicación está incompleta.');
  }

  return publishSocialVideo({
    userId,
    projectId,
    mediaId,
    accountIds,
    title,
    caption,
    source: 'nayla_universal_dale',
  });
};

export const executePendingSocialPlan = async ({
  userId,
  projectId,
  threadId,
}: {
  userId: string;
  projectId: string;
  threadId: string;
}) => {
  const pending = await getPendingNaylaActionPlan({
    userId,
    projectId,
    module: 'social',
    threadKey: threadId,
  });

  if (!pending) {
    const supabase = getWorkspaceSupabaseAdmin();
    await supabase
      .from('social_interactions')
      .update({ response_state: 'unanswered' })
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .eq('response_state', 'planned');

    return {
      found: false as const,
      text: 'No tengo una orden pendiente para ejecutar. Dime qué quieres que haga y primero te mostraré el plan.',
    };
  }

  const claimed = await claimNaylaActionPlan(pending.plan.id);
  if (!claimed) {
    return {
      found: false as const,
      text: 'Ese plan ya fue ejecutado, cancelado o venció. Dime la orden nuevamente si quieres repetirla.',
    };
  }

  let completed = 0;
  let skipped = 0;
  let failed = 0;
  const details: string[] = [];

  for (const item of pending.items) {
    if (!['SOCIAL_REPLY_INTERACTION', 'SOCIAL_PUBLISH_VIDEO'].includes(item.action_type)) {
      await updateNaylaActionItem({
        itemId: item.id,
        status: 'skipped',
        error: 'Acción no reconocida por REDES.',
      });
      skipped += 1;
      continue;
    }

    await updateNaylaActionItem({ itemId: item.id, status: 'executing' });

    try {
      if (item.action_type === 'SOCIAL_PUBLISH_VIDEO') {
        const result = await executePublishItem({ userId, projectId, item });
        await updateNaylaActionItem({
          itemId: item.id,
          status: result.success ? 'completed' : 'failed',
          result: {
            postId: result.postId,
            mediaId: result.mediaId,
            published: result.published,
            failed: result.failed,
            processing: result.processing,
          },
          error: result.success ? null : 'La publicación no pudo completarse.',
        });

        if (result.success) {
          completed += 1;
          details.push(
            `• ${item.payload?.mediaLabel || 'Video'}: publicación enviada (${result.published} publicadas, ${result.processing} procesando).`
          );
        } else {
          failed += 1;
          details.push(`• ${item.payload?.mediaLabel || 'Video'}: no se pudo publicar.`);
        }
        continue;
      }

      const result = await executeReplyItem({ userId, projectId, item });
      if (result.skipped) {
        await updateNaylaActionItem({
          itemId: item.id,
          status: 'skipped',
          result: { reason: result.reason },
        });
        skipped += 1;
        details.push(`• ${item.payload?.personName || 'Persona'}: ya estaba respondido.`);
      } else {
        await updateNaylaActionItem({
          itemId: item.id,
          status: 'completed',
          result: {
            interactionId: result.interactionId,
            personId: result.personId,
            platform: result.platform,
            channel: result.channel,
          },
        });
        completed += 1;
        details.push(`• ${item.payload?.personName || 'Persona'}: enviado.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo ejecutar la respuesta.';
      await updateNaylaActionItem({
        itemId: item.id,
        status: 'failed',
        error: message,
      });
      const failedInteractionId = String(item.payload?.interactionId || '');
      if (failedInteractionId) {
        const supabase = getWorkspaceSupabaseAdmin();
        await supabase
          .from('social_interactions')
          .update({ response_state: 'unanswered' })
          .eq('id', failedInteractionId)
          .eq('response_state', 'planned');
      }
      failed += 1;
      details.push(`• ${item.payload?.personName || 'Persona'}: ${message}`);
    }
  }

  const finalStatus = failed > 0 && completed === 0 ? 'failed' : 'completed';
  await finishNaylaActionPlan({
    planId: pending.plan.id,
    status: finalStatus,
    result: { completed, skipped, failed },
  });

  return {
    found: true as const,
    completed,
    skipped,
    failed,
    text: [
      completed
        ? `Listo. Ejecuté ${completed} respuesta${completed === 1 ? '' : 's'}.`
        : 'No se envió ninguna respuesta.',
      skipped ? `${skipped} se omitieron porque ya no correspondía ejecutarlas.` : '',
      failed ? `${failed} fallaron y no se reintentaron automáticamente.` : '',
      ...details,
    ].filter(Boolean).join('\n'),
  };
};
