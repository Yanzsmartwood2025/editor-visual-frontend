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
import { likeZernioComment, replyZernioComment, sendZernioMessage } from '../providers/zernio';
import { publishSocialVideo } from '../publishing/service';
import {
  getLatestProgramSummary,
  listPublicationPackages,
} from '../knowledge/store';
import type { SocialPlatform } from '../types';

type Candidate = {
  interactionId: string;
  personId: string;
  personName: string;
  platform: string;
  channel: 'comment' | 'dm';
  message: string;
  occurredAt: string;
  canLike: boolean;
  isLiked: boolean;
};

type PlannedReply = {
  interactionId?: string;
  reply?: string;
  like?: boolean;
};

const hasReplyCommandIntent = (message: string) =>
  /\b(responde|respondeles|respóndeles|responder|contesta|contéstale|contestale|contesten|dile|diles|escríbele|escribele)\b/i.test(message);

const hasLikeCommandIntent = (message: string) =>
  /\b(like|likes|me gusta|dale corazon|dales corazon|corazon a|reacciona|reaccionar)\b/i.test(message.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

const hasPlanAdjustmentIntent = (message: string) =>
  /\b(mas elaborad|mas corto|mas largo|cambia|cambial|modifica|ajusta|ponle|agrega|anade|quita|al final|sticker|emoji|tono|mas amable|mas serio|mas fuerte|mas frio)\b/i.test(
    message.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  );

export const isSocialExecutionStatusQuestion = (message: string) =>
  /\b(enviaste|se envio|ya envio|ya se envio|lo enviaste|los enviaste|mandaste|ya mandaste|publicaste|ya publicaste|se publico)\b/i.test(
    message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  );

const hasPublishCommandIntent = (message: string) =>
  /\b(publica|publicalo|publícalo|publicar|sube|subelo|súbelo|postea|postear|comparte|compartelo|compártelo)\b/i.test(message);

const loadCandidates = async ({
  userId,
  projectId,
  includeResponded = false,
}: {
  userId: string;
  projectId: string;
  includeResponded?: boolean;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('social_interactions')
    .select('id,person_id,platform,channel,body,occurred_at,response_state,raw,social_people(display_name,preferred_name)')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('direction', 'inbound')
    .in('response_state', includeResponded ? ['unanswered', 'planned', 'responded'] : ['unanswered', 'planned'])
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
      canLike: item.channel === 'comment' && item.raw?.canLike === true,
      isLiked: item.channel === 'comment' && item.raw?.isLiked === true,
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

const buildPlanText = (items: Array<{ candidate: Candidate; reply?: string; like?: boolean }>) => {
  const lines = items.map(({ candidate, reply, like }, index) => {
    const actions = [
      reply ? `“${reply}”` : '',
      like ? '♥ Dar Me gusta' : '',
    ].filter(Boolean).join(' · ');
    return `${index + 1}. ${candidate.personName} · ${candidate.platform} · ${candidate.channel === 'dm' ? 'mensaje' : 'comentario'}\n   ${actions}`;
  });

  return [
    `Preparé ${items.length} interacción${items.length === 1 ? '' : 'es'}:`,
    '',
    ...lines,
    '',
    'No he ejecutado nada todavía. Si está bien, dime “Dale” o “Sí envía” y lo ejecuto.',
  ].join('\n');
};

const revisePendingReplyPlan = async ({
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
  if (!hasPlanAdjustmentIntent(message)) return null;

  const pending = await getPendingNaylaActionPlan({
    userId,
    projectId,
    module: 'social',
    threadKey: threadId,
  });
  if (!pending) return null;

  const replyItems = pending.items.filter((item: any) =>
    item.action_type === 'SOCIAL_REPLY_INTERACTION' && item.status === 'planned'
  );
  if (!replyItems.length) return null;

  const systemPrompt = [
    'Editas un plan social ya existente. Devuelve SOLO JSON válido.',
    'Mantén exactamente los mismos itemId. No agregues ni elimines personas.',
    'Aplica la modificación del usuario a cada respuesta cuando corresponda.',
    'No afirmes que se envió nada.',
    'Formato: {"items":[{"itemId":"uuid","reply":"texto"}]}',
  ].join('\n');

  const prompt = [
    `CAMBIO PEDIDO:\n${message}`,
    '',
    'RESPUESTAS ACTUALES:',
    JSON.stringify(replyItems.map((item: any) => ({
      itemId: item.id,
      personName: item.payload?.personName,
      platform: item.payload?.platform,
      reply: item.payload?.reply,
    }))),
  ].join('\n');

  const raw = await generateSocialText({ systemPrompt, prompt });
  const parsed = parseJsonObject<{ items?: Array<{ itemId?: string; reply?: string }> }>(raw);
  if (!Array.isArray(parsed?.items) || !parsed!.items!.length) return null;

  const supabase = getWorkspaceSupabaseAdmin();
  const byId = new Map(replyItems.map((item: any) => [String(item.id), item]));
  const updated: any[] = [];

  for (const proposed of parsed!.items!) {
    const item = byId.get(String(proposed.itemId || ''));
    const reply = String(proposed.reply || '').trim().slice(0, 1800);
    if (!item || !reply) continue;
    const payload = { ...(item.payload || {}), reply };
    const { error } = await supabase
      .from('nayla_action_items')
      .update({ payload })
      .eq('id', item.id)
      .eq('status', 'planned');
    if (error) throw error;
    updated.push({ ...item, payload });
  }

  if (!updated.length) return null;

  const rows = pending.items.map((item: any) =>
    updated.find((candidate) => candidate.id === item.id) || item
  );
  const summaryItems = rows
    .filter((item: any) => ['SOCIAL_REPLY_INTERACTION', 'SOCIAL_LIKE_INTERACTION'].includes(item.action_type))
    .map((item: any) => ({
      candidate: {
        interactionId: String(item.payload?.interactionId || ''),
        personId: String(item.payload?.personId || ''),
        personName: String(item.payload?.personName || 'Persona'),
        platform: String(item.payload?.platform || 'social'),
        channel: item.payload?.channel === 'dm' ? 'dm' : 'comment',
        message: '',
        occurredAt: '',
        canLike: item.action_type === 'SOCIAL_LIKE_INTERACTION',
        isLiked: false,
      } as Candidate,
      reply: item.action_type === 'SOCIAL_REPLY_INTERACTION' ? String(item.payload?.reply || '') : undefined,
      like: item.action_type === 'SOCIAL_LIKE_INTERACTION',
    }));

  const summary = buildPlanText(summaryItems);
  const { error: planError } = await supabase
    .from('nayla_action_plans')
    .update({
      summary,
      updated_at: new Date().toISOString(),
      metadata: {
        ...(pending.plan.metadata || {}),
        revised: true,
        revision_message: message,
      },
    })
    .eq('id', pending.plan.id)
    .eq('status', 'pending');
  if (planError) throw planError;

  return {
    kind: 'plan' as const,
    text: summary,
    planId: pending.plan.id,
    count: summaryItems.length,
  };
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

  const latestProgram = await getLatestProgramSummary({ userId, projectId });
  const packageRows = latestProgram
    ? await listPublicationPackages({ userId, projectId, programId: latestProgram.id })
    : [];
  const packageByPlatform = new Map<string, any>();
  for (const item of packageRows) {
    const key = String(item.platform);
    const existing = packageByPlatform.get(key);
    if (!existing || String(item.language) === 'es') {
      packageByPlatform.set(key, item);
    }
  }

  const variants: Partial<Record<SocialPlatform, {
    title?: string;
    caption?: string;
    hashtags?: string[];
    language?: string;
  }>> = {};

  for (const accountId of accountIds) {
    const account = allowedAccounts.get(accountId) as any;
    if (!account) continue;
    const socialPackage = packageByPlatform.get(String(account.platform));
    if (!socialPackage) continue;
    variants[account.platform as SocialPlatform] = {
      title: String(socialPackage.title || ''),
      caption: String(socialPackage.caption || ''),
      hashtags: Array.isArray(socialPackage.hashtags) ? socialPackage.hashtags.map(String) : [],
      language: String(socialPackage.language || 'es'),
    };
  }

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

  const variantLines = Object.entries(variants).map(([platform, variant]) => {
    const cleanTitle = String(variant?.title || '').trim();
    const cleanCaption = String(variant?.caption || '').trim();
    const hashtags = Array.isArray(variant?.hashtags) ? variant!.hashtags!.join(' ') : '';
    const preview = [cleanTitle, cleanCaption, hashtags].filter(Boolean).join(' · ');
    return preview ? `${platform}: ${preview.slice(0, 360)}${preview.length > 360 ? '…' : ''}` : '';
  }).filter(Boolean);

  const summary = [
    `Voy a publicar ${label} en ${destinations.join(', ')}.`,
    variantLines.length
      ? 'Usaré un texto distinto para cada red:'
      : '',
    ...variantLines,
    !variantLines.length && title ? `Título: ${title}` : '',
    !variantLines.length && caption ? `Descripción: ${caption}` : '',
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
        variants,
        programId: latestProgram?.id || null,
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
  const revised = await revisePendingReplyPlan({ userId, projectId, threadId, message });
  if (revised) return revised;

  if (hasPublishCommandIntent(message)) {
    return planPublishCommand({ userId, projectId, threadId, message });
  }

  const wantsReply = hasReplyCommandIntent(message);
  const wantsLike = hasLikeCommandIntent(message);
  if (!wantsReply && !wantsLike) return null;

  const supabase = getWorkspaceSupabaseAdmin();
  const candidates = await loadCandidates({
    userId,
    projectId,
    includeResponded: wantsLike && !wantsReply,
  });
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
    'Máximo 10 interacciones por plan.',
    wantsReply ? 'El usuario pidió responder: redacta reply cuando corresponda.' : 'El usuario NO pidió responder: deja reply vacío.',
    wantsLike ? 'El usuario pidió Me gusta: marca like=true solo si canLike=true e isLiked=false.' : 'El usuario NO pidió Me gusta: marca like=false.',
    'Cada reply debe ser breve, natural, listo para publicar y coherente con el mensaje recibido.',
    'Usa la memoria no sensible solo para continuidad. Nunca menciones que guardas memoria.',
    'No inventes precios, promesas, disponibilidad ni hechos.',
    'Si una interacción es queja, reembolso, legal, médica, política, sexual, amenaza o delicada, no la incluyas automáticamente salvo que el usuario la haya señalado de forma inequívoca; aun así redacta de manera prudente y neutral.',
    'Formato exacto: {"intent":"engage|none","items":[{"interactionId":"uuid","reply":"texto opcional","like":true}],"note":"texto breve opcional"}',
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

  if (!parsed || parsed.intent !== 'engage' || !Array.isArray(parsed.items) || !parsed.items.length) {
    return null;
  }

  const byId = new Map(candidates.map((candidate) => [candidate.interactionId, candidate]));
  const seen = new Set<string>();
  const valid = parsed.items
    .slice(0, 10)
    .map((item) => {
      const id = String(item.interactionId || '');
      const candidate = byId.get(id);
      const reply = wantsReply ? String(item.reply || '').trim().slice(0, 1800) : '';
      const like = wantsLike && item.like === true && candidate?.canLike === true && candidate?.isLiked !== true;
      if (!candidate || (!reply && !like) || seen.has(id)) return null;
      seen.add(id);
      return { candidate, reply: reply || undefined, like };
    })
    .filter(Boolean) as Array<{ candidate: Candidate; reply?: string; like?: boolean }>;

  if (!valid.length) return null;

  const summary = buildPlanText(valid);
  const actionItems = valid.flatMap(({ candidate, reply, like }) => {
    const items: Array<{ actionType: string; payload: Record<string, unknown> }> = [];
    if (reply) {
      items.push({
        actionType: 'SOCIAL_REPLY_INTERACTION',
        payload: {
          interactionId: candidate.interactionId,
          personId: candidate.personId,
          personName: candidate.personName,
          platform: candidate.platform,
          channel: candidate.channel,
          reply,
        },
      });
    }
    if (like) {
      items.push({
        actionType: 'SOCIAL_LIKE_INTERACTION',
        payload: {
          interactionId: candidate.interactionId,
          personId: candidate.personId,
          personName: candidate.personName,
          platform: candidate.platform,
          channel: candidate.channel,
        },
      });
    }
    return items;
  });

  const stored = await createNaylaActionPlan({
    userId,
    projectId,
    module: 'social',
    threadKey: threadId,
    summary,
    sourceMessage: message,
    items: actionItems,
    metadata: {
      planner: 'nayla-social',
      count: actionItems.length,
    },
  });

  await supabase
    .from('social_interactions')
    .update({ response_state: 'unanswered' })
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('response_state', 'planned');

  const replyInteractionIds = valid
    .filter((item) => Boolean(item.reply))
    .map(({ candidate }) => candidate.interactionId);

  if (replyInteractionIds.length) {
    await supabase
      .from('social_interactions')
      .update({ response_state: 'planned' })
      .in('id', replyInteractionIds)
      .eq('response_state', 'unanswered');
  }

  return {
    kind: 'plan' as const,
    text: summary,
    planId: stored.plan.id,
    count: actionItems.length,
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

const executeLikeItem = async ({
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
  if (!interactionId) throw new Error('La acción de Me gusta está incompleta.');

  const { data: interaction, error: interactionError } = await supabase
    .from('social_interactions')
    .select('*')
    .eq('id', interactionId)
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .maybeSingle();
  if (interactionError) throw interactionError;
  if (!interaction) throw new Error('La interacción ya no existe.');
  if (interaction.channel !== 'comment' || interaction.direction !== 'inbound') {
    throw new Error('Esta interacción no admite Me gusta.');
  }
  if (interaction.raw?.isLiked === true) {
    return { skipped: true, reason: 'Ya tenía Me gusta.' };
  }
  if (interaction.raw?.canLike !== true) {
    throw new Error('La red no permite dar Me gusta a este comentario.');
  }
  if (!interaction.provider_post_id || !interaction.source_id) {
    throw new Error('Falta el identificador del comentario.');
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
  if (account.provider !== 'zernio') throw new Error('Me gusta todavía no está disponible por esta ruta social.');

  const providerResult = await likeZernioComment({
    accountId: String(account.provider_account_id),
    postId: String(interaction.provider_post_id),
    commentId: String(interaction.source_id),
  });

  const raw = interaction.raw && typeof interaction.raw === 'object' ? interaction.raw : {};
  const nextRaw = {
    ...raw,
    isLiked: true,
    ...(Number.isFinite(Number(raw?.likeCount))
      ? { likeCount: Number(raw.likeCount) + 1 }
      : {}),
  };

  await Promise.all([
    supabase.from('social_interactions').update({ raw: nextRaw }).eq('id', interaction.id),
    supabase
      .from('social_comments')
      .update({ raw: nextRaw })
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .eq('account_id', interaction.account_id)
      .eq('provider_comment_id', String(interaction.source_id)),
  ]);

  await recordSocialUsage({
    userId,
    projectId,
    action: 'comment_like',
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
  const variants = item.payload?.variants && typeof item.payload.variants === 'object'
    ? item.payload.variants
    : undefined;
  const programId = item.payload?.programId ? String(item.payload.programId) : null;

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
    variants,
    programId,
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
    if (!['SOCIAL_REPLY_INTERACTION', 'SOCIAL_LIKE_INTERACTION', 'SOCIAL_PUBLISH_VIDEO'].includes(item.action_type)) {
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

      if (item.action_type === 'SOCIAL_LIKE_INTERACTION') {
        const result = await executeLikeItem({ userId, projectId, item });
        if (result.skipped) {
          await updateNaylaActionItem({
            itemId: item.id,
            status: 'skipped',
            result: { reason: result.reason },
          });
          skipped += 1;
          details.push(`• ${item.payload?.personName || 'Persona'}: ya tenía Me gusta.`);
        } else {
          await updateNaylaActionItem({
            itemId: item.id,
            status: 'completed',
            result: {
              interactionId: result.interactionId,
              personId: result.personId,
              platform: result.platform,
              action: 'like',
            },
          });
          completed += 1;
          details.push(`• ${item.payload?.personName || 'Persona'}: Me gusta enviado.`);
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
        ? `Listo. Ejecuté ${completed} acción${completed === 1 ? '' : 'es'} y quedaron confirmadas.`
        : 'No se ejecutó ninguna acción.',
      skipped ? `${skipped} se omitieron porque ya no correspondía ejecutarlas.` : '',
      failed ? `${failed} fallaron y no se reintentaron automáticamente.` : '',
      ...details,
    ].filter(Boolean).join('\n'),
  };
};

export const getSocialExecutionStatus = async ({
  userId,
  projectId,
  threadId,
}: {
  userId: string;
  projectId: string;
  threadId: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data: plan, error } = await supabase
    .from('nayla_action_plans')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('module', 'social')
    .eq('thread_key', threadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;

  if (!plan) {
    return 'No encuentro una acción social reciente que pueda confirmar como enviada.';
  }

  const { data: items, error: itemError } = await supabase
    .from('nayla_action_items')
    .select('status,action_type,error,result')
    .eq('plan_id', plan.id)
    .order('ordinal');
  if (itemError) throw itemError;

  const statuses = items || [];
  const completed = statuses.filter((item: any) => item.status === 'completed').length;
  const failed = statuses.filter((item: any) => item.status === 'failed').length;
  const planned = statuses.filter((item: any) => item.status === 'planned').length;

  if (plan.status === 'pending' || planned > 0) {
    return 'No. El plan todavía está pendiente y no hay confirmación técnica de envío.';
  }
  if (plan.status === 'cancelled') {
    return 'No. Ese plan fue cancelado y no se ejecutó.';
  }
  if (plan.status === 'failed' || (failed > 0 && completed === 0)) {
    return `No. La ejecución falló (${failed || statuses.length} acción${(failed || statuses.length) === 1 ? '' : 'es'}).`;
  }
  if (completed > 0) {
    return failed
      ? `Sí, pero parcialmente: ${completed} acción${completed === 1 ? '' : 'es'} confirmada${completed === 1 ? '' : 's'} y ${failed} fallida${failed === 1 ? '' : 's'}.`
      : `Sí. Hay confirmación técnica de ${completed} acción${completed === 1 ? '' : 'es'} completada${completed === 1 ? '' : 's'}.`;
  }

  return 'No hay confirmación técnica de que esa acción se haya ejecutado.';
};
