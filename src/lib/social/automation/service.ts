import { createHash } from 'node:crypto';
import { getWorkspaceSupabaseAdmin } from '../../workspaceStore';

type Classification = {
  category: string;
  riskLevel: 'normal' | 'review' | 'blocked';
};

const includesAny = (text: string, words: string[]) => words.some((word) => text.includes(word));

export const classifySocialInteraction = (input: string): Classification => {
  const text = String(input || '').trim().toLowerCase();

  if (!text) return { category: 'unknown', riskLevel: 'review' };

  if (includesAny(text, ['suicid', 'matarme', 'kill myself', 'violencia', 'amenaza', 'threat'])) {
    return { category: 'sensitive', riskLevel: 'blocked' };
  }
  if (includesAny(text, ['reembolso', 'devolución', 'refund', 'chargeback'])) {
    return { category: 'refund', riskLevel: 'review' };
  }
  if (includesAny(text, ['abogado', 'demanda', 'legal', 'lawsuit'])) {
    return { category: 'legal', riskLevel: 'review' };
  }
  if (includesAny(text, ['precio', 'cuánto cuesta', 'cuanto cuesta', 'cost', 'price', '$'])) {
    return { category: 'price', riskLevel: 'review' };
  }
  if (includesAny(text, ['médic', 'doctor', 'enfermedad', 'medic', 'health'])) {
    return { category: 'medical', riskLevel: 'review' };
  }
  if (includesAny(text, ['presidente', 'elección', 'eleccion', 'partido político', 'politic', 'vote'])) {
    return { category: 'political', riskLevel: 'review' };
  }
  if (includesAny(text, ['sexo', 'sexual', 'nudes', 'desnudo'])) {
    return { category: 'sexual', riskLevel: 'review' };
  }
  if (includesAny(text, ['estafa', 'fraude', 'terrible', 'pésimo', 'pesimo', 'queja', 'complaint', 'scam'])) {
    return { category: 'complaint', riskLevel: 'review' };
  }

  if (/^(hola|holi|hello|hi|hey|buenas|buen día|buen dia|buenas tardes|buenas noches)[!. ]*$/i.test(text)) {
    return { category: 'greeting', riskLevel: 'normal' };
  }
  if (includesAny(text, ['gracias', 'thank you', 'thanks', 'mil gracias'])) {
    return { category: 'thanks', riskLevel: 'normal' };
  }
  if (includesAny(text, ['qué linda', 'que linda', 'hermosa', 'preciosa', 'bonita', 'beautiful', 'gorgeous', 'lovely'])) {
    return { category: 'compliment', riskLevel: 'normal' };
  }
  if (text.length <= 80 && !text.includes('?')) {
    return { category: 'simple', riskLevel: 'normal' };
  }

  return { category: 'unknown', riskLevel: 'review' };
};

const deterministicDelayMinutes = ({
  sourceId,
  min,
  max,
}: {
  sourceId: string;
  min: number;
  max: number;
}) => {
  if (max <= min) return min;
  const hash = createHash('sha256').update(sourceId).digest();
  const n = hash.readUInt32BE(0) / 0xffffffff;
  return Math.round(min + (max - min) * n);
};

const getRuleForInteraction = async (interaction: any) => {
  const supabase = getWorkspaceSupabaseAdmin();

  const { data: accountRule, error: accountRuleError } = await supabase
    .from('social_automation_rules')
    .select('*')
    .eq('user_id', interaction.user_id)
    .eq('project_id', interaction.project_id)
    .eq('account_id', interaction.account_id)
    .eq('enabled', true)
    .maybeSingle();

  if (accountRuleError) throw accountRuleError;
  if (accountRule) return accountRule;

  const { data: globalRule, error: globalRuleError } = await supabase
    .from('social_automation_rules')
    .select('*')
    .eq('user_id', interaction.user_id)
    .eq('project_id', interaction.project_id)
    .is('account_id', null)
    .eq('enabled', true)
    .maybeSingle();

  if (globalRuleError) throw globalRuleError;
  return globalRule;
};

export const scheduleAutomationForInteraction = async (interaction: any) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const rule = await getRuleForInteraction(interaction);

  if (!rule) {
    await supabase
      .from('social_interactions')
      .update({ automation_state: 'skipped' })
      .eq('id', interaction.id);
    return null;
  }

  const channelAllowed =
    rule.channel === 'both' ||
    (rule.channel === 'comments' && interaction.channel === 'comment') ||
    (rule.channel === 'dms' && interaction.channel === 'dm');

  if (!channelAllowed) {
    await supabase
      .from('social_interactions')
      .update({ automation_state: 'skipped' })
      .eq('id', interaction.id);
    return null;
  }

  const classification = classifySocialInteraction(interaction.body);
  const allowed = Array.isArray(rule.allowed_categories) ? rule.allowed_categories : [];
  const approval = Array.isArray(rule.approval_categories) ? rule.approval_categories : [];

  const needsApproval =
    classification.riskLevel !== 'normal' ||
    approval.includes(classification.category) ||
    (rule.simple_only && !allowed.includes(classification.category));

  const delayMinutes = deterministicDelayMinutes({
    sourceId: String(interaction.source_id || interaction.id),
    min: Number(rule.min_delay_minutes || 0),
    max: Number(rule.max_delay_minutes || rule.min_delay_minutes || 0),
  });

  const base = new Date(interaction.occurred_at || Date.now()).getTime();
  const dueAt = new Date(base + delayMinutes * 60_000).toISOString();

  const { data: queue, error } = await supabase
    .from('social_automation_queue')
    .upsert({
      rule_id: rule.id,
      interaction_id: interaction.id,
      user_id: interaction.user_id,
      project_id: interaction.project_id,
      account_id: interaction.account_id,
      person_id: interaction.person_id,
      provider: interaction.provider,
      platform: interaction.platform,
      channel: interaction.channel,
      source_id: interaction.source_id,
      provider_post_id: interaction.provider_post_id,
      provider_conversation_id: interaction.provider_conversation_id,
      category: classification.category,
      risk_level: classification.riskLevel,
      incoming_text: interaction.body || '',
      status: needsApproval ? 'needs_approval' : 'pending',
      due_at: dueAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'rule_id,interaction_id' })
    .select('*')
    .single();

  if (error) throw error;

  await supabase
    .from('social_interactions')
    .update({ automation_state: needsApproval ? 'needs_approval' : 'queued' })
    .eq('id', interaction.id);

  return queue;
};

export const cancelPendingAutomation = async ({
  accountId,
  channel,
  sourceId,
  conversationId,
  reason = 'Respuesta manual enviada.',
}: {
  accountId: string;
  channel: 'comment' | 'dm';
  sourceId?: string | null;
  conversationId?: string | null;
  reason?: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();

  let query = supabase
    .from('social_automation_queue')
    .update({
      status: 'cancelled',
      last_error: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('channel', channel)
    .in('status', ['pending', 'processing', 'needs_approval']);

  if (sourceId) {
    query = query.eq('source_id', sourceId);
  } else if (conversationId) {
    query = query.eq('provider_conversation_id', conversationId);
  } else {
    return 0;
  }

  const { data, error } = await query.select('id,interaction_id');
  if (error) throw error;

  const interactionIds = (data || [])
    .map((item: any) => item.interaction_id)
    .filter(Boolean);

  if (interactionIds.length) {
    await supabase
      .from('social_interactions')
      .update({ automation_state: 'processed' })
      .in('id', interactionIds);
  }

  return (data || []).length;
};

export const ensureDefaultAutomationRule = async ({
  profileId,
  userId,
  projectId,
}: {
  profileId: string;
  userId: string;
  projectId: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data: existing, error } = await supabase
    .from('social_automation_rules')
    .select('*')
    .eq('social_profile_id', profileId)
    .is('account_id', null)
    .maybeSingle();

  if (error) throw error;
  if (existing) return existing;

  const { data, error: createError } = await supabase
    .from('social_automation_rules')
    .insert({
      social_profile_id: profileId,
      user_id: userId,
      project_id: projectId,
      enabled: false,
      channel: 'comments',
      min_delay_minutes: 180,
      max_delay_minutes: 240,
      daily_reply_limit: 20,
      person_cooldown_minutes: 180,
      simple_only: true,
      timezone: 'America/Guayaquil',
    })
    .select('*')
    .single();

  if (createError) throw createError;
  return data;
};
