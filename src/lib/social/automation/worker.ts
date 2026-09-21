import { getWorkspaceSupabaseAdmin } from '../../workspaceStore';
import { generateSocialText } from '../ai/generate';
import { getPersonMemoryContext } from '../identity/service';
import { ensureSocialProfile, recordSocialUsage } from '../store';
import { replyUploadPostComment, sendUploadPostDm } from '../providers/uploadPost';
import { replyZernioComment, sendZernioMessage } from '../providers/zernio';

const cleanReply = (value: string) =>
  String(value || '')
    .trim()
    .replace(/^["“”']+|["“”']+$/g, '')
    .trim();

const startOfUtcDay = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
};

const buildMemoryText = (context: Awaited<ReturnType<typeof getPersonMemoryContext>>) => {
  const lines: string[] = [];
  if (context.summary?.summary) lines.push('Resumen de relación: ' + context.summary.summary);
  for (const memory of context.memories || []) {
    lines.push(`- ${memory.memory_key ? memory.memory_key + ': ' : ''}${memory.memory_value}`);
  }
  return lines.slice(0, 20).join('\n');
};

const markQueue = async (id: string, patch: Record<string, unknown>) => {
  const supabase = getWorkspaceSupabaseAdmin();
  await supabase
    .from('social_automation_queue')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
};

const addRun = async (job: any, action: string, outcome: string, detail: Record<string, unknown> = {}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  await supabase.from('social_automation_runs').insert({
    queue_id: job.id,
    user_id: job.user_id,
    project_id: job.project_id,
    account_id: job.account_id,
    person_id: job.person_id,
    action,
    outcome,
    detail,
  });
};

export const processDueAutomationJobs = async (limit = 20) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data: jobs, error } = await supabase.rpc('claim_social_automation_jobs', {
    batch_size: Math.max(1, Math.min(limit, 50)),
  });

  if (error) throw error;

  let sent = 0;
  let approval = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of jobs || []) {
    try {
      const [{ data: rule, error: ruleError }, { data: account, error: accountError }] = await Promise.all([
        supabase.from('social_automation_rules').select('*').eq('id', job.rule_id).maybeSingle(),
        supabase.from('social_accounts').select('*').eq('id', job.account_id).maybeSingle(),
      ]);

      if (ruleError) throw ruleError;
      if (accountError) throw accountError;

      if (!rule?.enabled || !account || account.status !== 'connected') {
        await markQueue(job.id, { status: 'cancelled', last_error: 'Regla o cuenta inactiva.' });
        await addRun(job, 'auto_reply', 'cancelled');
        skipped += 1;
        continue;
      }

      const allowed = Array.isArray(rule.allowed_categories) ? rule.allowed_categories : [];
      if (job.risk_level !== 'normal' || (rule.simple_only && !allowed.includes(job.category))) {
        await markQueue(job.id, { status: 'needs_approval' });
        await supabase.from('social_interactions').update({ automation_state: 'needs_approval' }).eq('id', job.interaction_id);
        await addRun(job, 'auto_reply', 'needs_approval', { category: job.category });
        approval += 1;
        continue;
      }

      const { count: dailyCount, error: dailyError } = await supabase
        .from('social_automation_runs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', job.user_id)
        .eq('project_id', job.project_id)
        .eq('account_id', job.account_id)
        .eq('outcome', 'sent')
        .gte('created_at', startOfUtcDay());

      if (dailyError) throw dailyError;

      if (Number(dailyCount || 0) >= Number(rule.daily_reply_limit || 20)) {
        const tomorrow = new Date(Date.now() + 6 * 60 * 60_000).toISOString();
        await markQueue(job.id, { status: 'pending', due_at: tomorrow, last_error: 'Límite diario alcanzado.' });
        skipped += 1;
        continue;
      }

      const cooldownMinutes = Number(rule.person_cooldown_minutes || 0);
      if (cooldownMinutes > 0) {
        const since = new Date(Date.now() - cooldownMinutes * 60_000).toISOString();
        const { data: recentRun, error: recentError } = await supabase
          .from('social_automation_runs')
          .select('created_at')
          .eq('person_id', job.person_id)
          .eq('outcome', 'sent')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentError) throw recentError;

        if (recentRun) {
          const due = new Date(new Date(recentRun.created_at).getTime() + cooldownMinutes * 60_000).toISOString();
          await markQueue(job.id, { status: 'pending', due_at: due, last_error: 'Enfriamiento por persona.' });
          skipped += 1;
          continue;
        }
      }

      const profile = await ensureSocialProfile(job.user_id, job.project_id);
      const { data: policy, error: policyError } = await supabase
        .from('social_ai_policies')
        .select('*')
        .eq('social_profile_id', profile.id)
        .maybeSingle();

      if (policyError) throw policyError;

      const memory = await getPersonMemoryContext(job.person_id);
      const memoryText = buildMemoryText(memory);

      const systemPrompt = [
        'Eres Nayla, inteligencia social de una cuenta conectada.',
        'Redacta UNA respuesta breve, natural y lista para publicar.',
        'No expliques tu razonamiento y no uses comillas.',
        'No inventes precios, promesas, disponibilidad ni datos no confirmados.',
        'Usa recuerdos únicamente para mantener continuidad; no menciones que guardas memoria ni reveles datos privados.',
        'Nunca conviertas una coincidencia de nombre en identidad entre redes.',
        `Tono: ${policy?.tone || 'amable, cercano y natural'}.`,
        policy?.instructions ? `Reglas de la cuenta: ${policy.instructions}` : '',
        rule.instructions ? `Reglas de automatización: ${rule.instructions}` : '',
      ].filter(Boolean).join('\n');

      const prompt = [
        `Plataforma: ${job.platform}`,
        `Tipo: ${job.channel}`,
        `Categoría: ${job.category}`,
        memoryText ? `Contexto conocido de esta persona:\n${memoryText}` : '',
        `Mensaje recibido: ${job.incoming_text}`,
      ].filter(Boolean).join('\n\n');

      const suggested = cleanReply(await generateSocialText({ prompt, systemPrompt }));
      if (!suggested) throw new Error('Nayla no generó una respuesta utilizable.');

      const { data: latestQueue, error: latestQueueError } = await supabase
        .from('social_automation_queue')
        .select('status')
        .eq('id', job.id)
        .maybeSingle();

      if (latestQueueError) throw latestQueueError;

      if (latestQueue?.status !== 'processing') {
        await addRun(job, 'auto_reply', 'cancelled_before_send', {
          status: latestQueue?.status || 'missing',
        });
        skipped += 1;
        continue;
      }

      let providerResponse: any;

      if (job.channel === 'comment') {
        if (!job.provider_post_id) throw new Error('Falta el ID de la publicación.');

        providerResponse = job.provider === 'upload_post'
          ? await replyUploadPostComment({
              username: profile.upload_post_username,
              platform: job.platform,
              postId: String(job.provider_post_id),
              commentId: String(job.source_id),
              message: suggested,
            })
          : await replyZernioComment({
              accountId: String(account.provider_account_id),
              postId: String(job.provider_post_id),
              commentId: String(job.source_id),
              message: suggested,
            });
      } else {
        const { data: interaction, error: interactionError } = await supabase
          .from('social_interactions')
          .select('*')
          .eq('id', job.interaction_id)
          .single();
        if (interactionError) throw interactionError;

        if (job.provider === 'zernio') {
          if (!job.provider_conversation_id) throw new Error('Falta conversationId.');
          providerResponse = await sendZernioMessage(
            String(job.provider_conversation_id),
            String(account.provider_account_id),
            suggested
          );
        } else {
          if (account.platform !== 'instagram' || !interaction.provider_parent_id) {
            throw new Error('DM automático no disponible para esta cuenta.');
          }
          providerResponse = await sendUploadPostDm({
            username: profile.upload_post_username,
            platform: account.platform,
            recipientId: String(interaction.provider_parent_id),
            message: suggested,
          });
        }
      }

      await markQueue(job.id, {
        status: 'sent',
        suggested_reply: suggested,
        provider_response: providerResponse || {},
        executed_at: new Date().toISOString(),
        last_error: null,
      });
      await supabase.from('social_interactions').update({ automation_state: 'processed' }).eq('id', job.interaction_id);

      await addRun(job, 'auto_reply', 'sent', {
        category: job.category,
        replyLength: suggested.length,
      });

      await recordSocialUsage({
        userId: job.user_id,
        projectId: job.project_id,
        action: 'auto_reply',
        provider: job.provider,
        platform: job.platform,
        metadata: { queueId: job.id, personId: job.person_id, channel: job.channel },
      });

      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error de automatización.';
      const attempts = Number(job.attempt_count || 1);

      if (attempts < 3) {
        await markQueue(job.id, {
          status: 'pending',
          due_at: new Date(Date.now() + 60 * 60_000).toISOString(),
          last_error: message,
        });
      } else {
        await markQueue(job.id, { status: 'failed', last_error: message });
        await supabase.from('social_interactions').update({ automation_state: 'failed' }).eq('id', job.interaction_id);
      }

      await addRun(job, 'auto_reply', 'failed', { error: message, attempts });
      failed += 1;
    }
  }

  return { claimed: (jobs || []).length, sent, approval, skipped, failed };
};
