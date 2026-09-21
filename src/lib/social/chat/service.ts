import { getWorkspaceSupabaseAdmin } from '../../workspaceStore';
import { generateSocialText } from '../ai/generate';
import { ensureSocialProfile } from '../store';
import { isUniversalNaylaConfirmation } from '../../naylaPlanConfirmation';
import { executePendingSocialPlan, planSocialCommand } from './actions';
import { cleanNaylaChatText } from '../../naylaText';
import {
  isSocialActivityReviewRequest,
  reviewConnectedSocialActivity,
} from '../activity/service';

export const getOrCreateSocialChatThread = async ({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const profile = await ensureSocialProfile(userId, projectId);

  const { data: existing, error } = await supabase
    .from('social_nayla_threads')
    .select('*')
    .eq('social_profile_id', profile.id)
    .eq('archived', false)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (existing) return existing;

  const { data, error: createError } = await supabase
    .from('social_nayla_threads')
    .insert({
      social_profile_id: profile.id,
      user_id: userId,
      project_id: projectId,
      title: 'Nayla Social',
    })
    .select('*')
    .single();

  if (createError) throw createError;
  return data;
};

export const getSocialChat = async ({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const thread = await getOrCreateSocialChatThread({ userId, projectId });

  const { data: messages, error } = await supabase
    .from('social_nayla_messages')
    .select('*')
    .eq('thread_id', thread.id)
    .order('created_at', { ascending: true })
    .limit(80);

  if (error) throw error;
  return { thread, messages: messages || [] };
};

const buildSocialContext = async (userId: string, projectId: string) => {
  const supabase = getWorkspaceSupabaseAdmin();

  const [accounts, people, memories, pending, recent] = await Promise.all([
    supabase
      .from('social_accounts')
      .select('id,platform,display_name,handle,status,capabilities')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .order('platform'),
    supabase
      .from('social_people')
      .select('id,display_name,preferred_name,summary,relationship_stage,interaction_count,last_seen_at')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .order('last_seen_at', { ascending: false })
      .limit(25),
    supabase
      .from('social_memory_items')
      .select('person_id,kind,memory_key,memory_value,confidence,last_confirmed_at')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .eq('sensitive', false)
      .gte('confidence', 0.65)
      .order('last_confirmed_at', { ascending: false })
      .limit(60),
    supabase
      .from('social_automation_queue')
      .select('id,platform,channel,category,status,due_at,incoming_text,person_id')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .in('status', ['pending','needs_approval'])
      .order('due_at', { ascending: true })
      .limit(30),
    supabase
      .from('social_interactions')
      .select('person_id,platform,channel,direction,body,occurred_at')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .order('occurred_at', { ascending: false })
      .limit(40),
  ]);

  for (const result of [accounts, people, memories, pending, recent]) {
    if (result.error) throw result.error;
  }

  const personName = new Map((people.data || []).map((person: any) => [person.id, person.preferred_name || person.display_name || 'Persona']));

  return {
    accounts: accounts.data || [],
    people: people.data || [],
    memories: (memories.data || []).map((memory: any) => ({
      person: personName.get(memory.person_id) || 'Persona',
      kind: memory.kind,
      key: memory.memory_key,
      value: memory.memory_value,
      confidence: memory.confidence,
    })),
    pending: (pending.data || []).map((item: any) => ({
      ...item,
      person: personName.get(item.person_id) || 'Persona',
    })),
    recent: (recent.data || []).map((item: any) => ({
      ...item,
      person: personName.get(item.person_id) || 'Persona',
    })),
  };
};

export const replyInSocialChat = async ({
  userId,
  projectId,
  message,
}: {
  userId: string;
  projectId: string;
  message: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const thread = await getOrCreateSocialChatThread({ userId, projectId });

  await supabase.from('social_nayla_messages').insert({
    thread_id: thread.id,
    user_id: userId,
    project_id: projectId,
    role: 'user',
    content: message,
  });

  if (isUniversalNaylaConfirmation(message)) {
    const execution = await executePendingSocialPlan({
      userId,
      projectId,
      threadId: thread.id,
    });

    const { data: assistantMessage, error: assistantError } = await supabase
      .from('social_nayla_messages')
      .insert({
        thread_id: thread.id,
        user_id: userId,
        project_id: projectId,
        role: 'assistant',
        content: execution.text,
        metadata: {
          responseType: execution.found ? 'action_result' : 'text',
          completed: execution.found ? execution.completed : 0,
          skipped: execution.found ? execution.skipped : 0,
          failed: execution.found ? execution.failed : 0,
        },
      })
      .select('*')
      .single();

    if (assistantError) throw assistantError;

    await supabase
      .from('social_nayla_threads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', thread.id);

    return { thread, message: assistantMessage, execution };
  }

  if (isSocialActivityReviewRequest(message)) {
    const review = await reviewConnectedSocialActivity({
      userId,
      projectId,
      message,
    });

    const { data: assistantMessage, error: assistantError } = await supabase
      .from('social_nayla_messages')
      .insert({
        thread_id: thread.id,
        user_id: userId,
        project_id: projectId,
        role: 'assistant',
        content: review.text,
        metadata: {
          responseType: 'activity_review',
          peopleCount: review.peopleCount,
          scope: review.scope,
          platforms: review.activity.map((item) => item.platform),
          comments: review.activity.reduce((sum, item) => sum + item.comments, 0),
          inboundMessages: review.activity.reduce((sum, item) => sum + item.inboundMessages, 0),
        },
      })
      .select('*')
      .single();

    if (assistantError) throw assistantError;

    await supabase
      .from('social_nayla_threads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', thread.id);

    return { thread, message: assistantMessage, activityReview: review };
  }

  const planned = await planSocialCommand({
    userId,
    projectId,
    threadId: thread.id,
    message,
  });

  if (planned) {
    const { data: assistantMessage, error: assistantError } = await supabase
      .from('social_nayla_messages')
      .insert({
        thread_id: thread.id,
        user_id: userId,
        project_id: projectId,
        role: 'assistant',
        content: planned.text,
        metadata: {
          responseType: planned.kind === 'plan' ? 'action_plan' : 'text',
          planId: planned.kind === 'plan' ? planned.planId : null,
          actionCount: planned.kind === 'plan' ? planned.count : 0,
          requiresConfirmation: planned.kind === 'plan',
        },
      })
      .select('*')
      .single();

    if (assistantError) throw assistantError;

    await supabase
      .from('social_nayla_threads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', thread.id);

    return { thread, message: assistantMessage, plan: planned };
  }

  const [{ data: history, error: historyError }, context] = await Promise.all([
    supabase
      .from('social_nayla_messages')
      .select('role,content,created_at')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: false })
      .limit(18),
    buildSocialContext(userId, projectId),
  ]);

  if (historyError) throw historyError;

  const systemPrompt = [
    'Eres Nayla, inteligencia social y asistente de comunidad del usuario.',
    'No eres únicamente una vendedora. Ayudas a entender personas, comunidad, contenido, relaciones, mensajes, comentarios, oportunidades, riesgos y estrategia.',
    'Usa únicamente el contexto suministrado; no inventes recuerdos ni unas identidades de diferentes redes por coincidencia de nombre.',
    'Cuando cites lo que sabes de una persona, diferencia hechos recordados de inferencias.',
    'Si el usuario pide una acción social ejecutable, el planificador la interceptará antes de llegar aquí. Para acciones no disponibles, explica brevemente el siguiente paso.',
    'Si las cuentas ya están conectadas, nunca pidas al usuario URLs, IDs de videos, IDs de publicaciones ni enlaces para revisar su propia actividad. Nayla debe usar los datos conectados cuando esa capacidad exista.',
    'No uses Markdown visible: nada de **, asteriscos, backticks, encabezados con # ni tablas.',
    'Evita cuestionarios largos y listas rígidas. Habla de forma natural, limpia y directa.',
    'Responde en español natural salvo que el usuario pida otro idioma.',
    'Sé concreta y útil. No expongas nombres internos de proveedores.',
  ].join('\n');

  const conversation = (history || [])
    .reverse()
    .map((item: any) => `${item.role === 'assistant' ? 'Nayla' : 'Usuario'}: ${item.content}`)
    .join('\n');

  const prompt = [
    'CONTEXTO SOCIAL NORMALIZADO:',
    JSON.stringify(context),
    '',
    'CONVERSACIÓN RECIENTE:',
    conversation,
    '',
    'Responde al último mensaje del usuario.',
  ].join('\n');

  const rawAnswer = await generateSocialText({ prompt, systemPrompt });
  const answer = cleanNaylaChatText(rawAnswer) ||
    'Puedo ayudarte desde las cuentas conectadas. Dime qué quieres revisar o qué acción quieres preparar.';

  const { data: assistantMessage, error: assistantError } = await supabase
    .from('social_nayla_messages')
    .insert({
      thread_id: thread.id,
      user_id: userId,
      project_id: projectId,
      role: 'assistant',
      content: answer,
      metadata: {
        context_people: context.people.length,
        context_accounts: context.accounts.length,
        pending_actions: context.pending.length,
      },
    })
    .select('*')
    .single();

  if (assistantError) throw assistantError;

  await supabase
    .from('social_nayla_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', thread.id);

  return { thread, message: assistantMessage };
};
