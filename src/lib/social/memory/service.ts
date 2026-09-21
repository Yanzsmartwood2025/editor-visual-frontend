import { getWorkspaceSupabaseAdmin } from '../../workspaceStore';
import { generateSocialText, parseJsonObject } from '../ai/generate';

type ExtractedMemory = {
  kind?: string;
  key?: string;
  value?: string;
  confidence?: number;
};

const trivialPatterns = [
  /^hola[!. ]*$/i,
  /^hello[!. ]*$/i,
  /^hi[!. ]*$/i,
  /^gracias[!. ]*$/i,
  /^thanks[!. ]*$/i,
  /^[\p{Emoji}\s]+$/u,
];

const shouldAnalyze = (text: string) => {
  const clean = String(text || '').trim();
  if (!clean) return false;
  if (trivialPatterns.some((pattern) => pattern.test(clean))) return false;
  if (clean.length >= 45) return true;
  return /(cumple|birthday|me gusta|prefiero|amo |odio |mi favorito|my favorite|prefiero|soy de |vivo en |siempre |nunca )/i.test(clean);
};

export const ensureMemorySettings = async ({
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
    .from('social_memory_settings')
    .select('*')
    .eq('social_profile_id', profileId)
    .maybeSingle();

  if (error) throw error;
  if (existing) return existing;

  const { data, error: createError } = await supabase
    .from('social_memory_settings')
    .insert({
      social_profile_id: profileId,
      user_id: userId,
      project_id: projectId,
      enabled: true,
      auto_summarize: true,
      allow_cross_network_linking: false,
      store_sensitive: false,
      retention_days: 1095,
    })
    .select('*')
    .single();

  if (createError) throw createError;
  return data;
};

const saveMemories = async ({
  interaction,
  memories,
  summaryHint,
  retentionDays,
}: {
  interaction: any;
  memories: ExtractedMemory[];
  summaryHint?: string;
  retentionDays: number;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const expiresAt = new Date(Date.now() + retentionDays * 86_400_000).toISOString();

  for (const memory of memories.slice(0, 6)) {
    const value = String(memory.value || '').trim();
    if (!value) continue;

    const kind = ['fact','preference','date','relationship','habit','topic','note'].includes(String(memory.kind))
      ? String(memory.kind)
      : 'note';
    const key = String(memory.key || '').trim() || null;
    const confidence = Math.min(1, Math.max(0.5, Number(memory.confidence || 0.8)));

    let query = supabase
      .from('social_memory_items')
      .select('id')
      .eq('person_id', interaction.person_id)
      .eq('kind', kind)
      .eq('memory_value', value);

    query = key ? query.eq('memory_key', key) : query.is('memory_key', null);
    const { data: existing, error: existingError } = await query.maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      await supabase
        .from('social_memory_items')
        .update({
          confidence,
          last_confirmed_at: new Date().toISOString(),
          expires_at: expiresAt,
          interaction_id: interaction.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('social_memory_items').insert({
        user_id: interaction.user_id,
        project_id: interaction.project_id,
        person_id: interaction.person_id,
        identity_id: interaction.identity_id,
        interaction_id: interaction.id,
        kind,
        memory_key: key,
        memory_value: value,
        confidence,
        source_type: 'interaction',
        sensitive: false,
        expires_at: expiresAt,
      });
    }
  }

  if (summaryHint) {
    const { data: person } = await supabase
      .from('social_people')
      .select('interaction_count')
      .eq('id', interaction.person_id)
      .maybeSingle();

    await supabase.from('social_relationship_summaries').upsert({
      person_id: interaction.person_id,
      user_id: interaction.user_id,
      project_id: interaction.project_id,
      summary: summaryHint.slice(0, 1200),
      interaction_count: Number(person?.interaction_count || 0),
      last_compacted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'person_id' });

    await supabase
      .from('social_people')
      .update({ summary: summaryHint.slice(0, 1200), updated_at: new Date().toISOString() })
      .eq('id', interaction.person_id);
  }
};

export const processPendingMemoryInteractions = async (limit = 15) => {
  const supabase = getWorkspaceSupabaseAdmin();

  const { data: interactions, error } = await supabase
    .from('social_interactions')
    .select('*')
    .eq('direction', 'inbound')
    .eq('memory_state', 'pending')
    .order('occurred_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 50)));

  if (error) throw error;

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const interaction of interactions || []) {
    try {
      const { data: profile, error: profileError } = await supabase
        .from('social_profiles')
        .select('id')
        .eq('user_id', interaction.user_id)
        .eq('project_id', interaction.project_id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) {
        await supabase.from('social_interactions').update({ memory_state: 'skipped' }).eq('id', interaction.id);
        skipped += 1;
        continue;
      }

      const settings = await ensureMemorySettings({
        profileId: profile.id,
        userId: interaction.user_id,
        projectId: interaction.project_id,
      });

      if (!settings.enabled || !shouldAnalyze(interaction.body)) {
        await supabase.from('social_interactions').update({ memory_state: 'skipped' }).eq('id', interaction.id);
        skipped += 1;
        continue;
      }

      const systemPrompt = [
        'Eres el extractor de memoria social de Nayla.',
        'Devuelve SOLO JSON válido.',
        'Extrae únicamente información duradera y útil para una relación futura.',
        'Ejemplos: cumpleaños, preferencias, hábitos, temas favoritos, relación declarada o un hecho que la persona dijo sobre sí misma.',
        'NO guardes salud, religión, ideología política, orientación o vida sexual, datos financieros, documentos, contraseñas, dirección exacta, delitos ni otra información sensible.',
        'No inventes. Si no existe información duradera, memories debe ser [].',
        'Formato: {"memories":[{"kind":"fact|preference|date|relationship|habit|topic|note","key":"clave corta","value":"dato","confidence":0.0}],"summary_hint":"resumen breve no sensible de la relación, o cadena vacía"}.',
      ].join('\n');

      const raw = await generateSocialText({
        systemPrompt,
        prompt: `Red: ${interaction.platform}\nMensaje de la persona: ${interaction.body}`,
      });

      const parsed = parseJsonObject<{ memories?: ExtractedMemory[]; summary_hint?: string }>(raw);
      const memories = Array.isArray(parsed?.memories) ? parsed!.memories! : [];

      await saveMemories({
        interaction,
        memories,
        summaryHint: String(parsed?.summary_hint || '').trim(),
        retentionDays: Number(settings.retention_days || 1095),
      });

      await supabase
        .from('social_interactions')
        .update({ memory_state: 'processed' })
        .eq('id', interaction.id);

      processed += 1;
    } catch {
      await supabase
        .from('social_interactions')
        .update({ memory_state: 'failed' })
        .eq('id', interaction.id);
      failed += 1;
    }
  }

  return { processed, skipped, failed };
};
