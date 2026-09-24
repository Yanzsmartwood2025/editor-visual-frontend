import { getWorkspaceSupabaseAdmin } from './workspaceStore';
import type { MediaProviderId } from './mediaProviders/types';

type VoiceRoute = {
  voiceId: string;
  language?: string | null;
  previewUrl?: string | null;
  capabilities?: string[];
};

export type PrivateVoiceRoutes = Partial<Record<MediaProviderId, VoiceRoute>>;

export type PublicNaylaVoice = {
  id: string;
  name: string;
  category: 'catalog' | 'cloned' | 'system';
  description: string | null;
  language: string | null;
  previewUrl: string | null;
  labels: Record<string, string>;
  isOwner: boolean;
  redundancy: number;
};

type CatalogVoice = {
  routeKey: string;
  name: string;
  language?: string | null;
  description?: string | null;
  previewUrl?: string | null;
  labels?: Record<string, string>;
  provider: MediaProviderId;
  voiceId: string;
};

const clean = (value: unknown, max = 160) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

const providerConfigured = (key: string) => Boolean(process.env[key]?.trim());

const deepgramVoices: CatalogVoice[] = [
  ['celeste','aura-2-celeste-es','es-co','Femenina · joven · clara y positiva'],
  ['estrella','aura-2-estrella-es','es-mx','Femenina · madura · natural y calmada'],
  ['carina','aura-2-carina-es','es-es','Femenina · adulta · profesional y enérgica'],
  ['diana','aura-2-diana-es','es-es','Femenina · adulta · expresiva y profesional'],
  ['selena','aura-2-selena-es','es-419','Femenina · joven · latina · amable y calmada'],
  ['gloria','aura-2-gloria-es','es-co','Femenina · joven · colombiana · natural'],
  ['olivia','aura-2-olivia-es','es-mx','Femenina · adulta · cálida y expresiva'],
  ['silvia','aura-2-silvia-es','es-es','Femenina · adulta · clara y cálida'],
  ['antonia','aura-2-antonia-es','es-ar','Femenina · adulta · argentina · natural'],
  ['nestor','aura-2-nestor-es','es-es','Masculina · adulta · profesional y clara'],
  ['sirio','aura-2-sirio-es','es-mx','Masculina · adulta · mexicana · calmada'],
  ['alvaro','aura-2-alvaro-es','es-es','Masculina · adulta · clara y profesional'],
  ['aquila','aura-2-aquila-es','es-419','Masculina · adulta · latina · expresiva'],
  ['javier','aura-2-javier-es','es-mx','Masculina · adulta · mexicana · amigable'],
  ['luciano','aura-2-luciano-es','es-mx','Masculina · adulta · energética y carismática'],
  ['valerio','aura-2-valerio-es','es-mx','Masculina · adulta · profunda y profesional'],
  ['thalia','aura-2-thalia-en','en-us','Femenina · adulta · clara y segura'],
  ['andromeda','aura-2-andromeda-en','en-us','Femenina · adulta · expresiva y casual'],
  ['helena','aura-2-helena-en','en-us','Femenina · adulta · cálida y natural'],
  ['cora','aura-2-cora-en','en-us','Femenina · adulta · melódica y cálida'],
  ['iris','aura-2-iris-en','en-us','Femenina · joven · positiva y cercana'],
  ['luna','aura-2-luna-en','en-us','Femenina · joven · natural y amigable'],
  ['apollo','aura-2-apollo-en','en-us','Masculina · adulta · segura y casual'],
  ['draco','aura-2-draco-en','en-gb','Masculina · adulta · británica · profunda'],
  ['orion','aura-2-orion-en','en-us','Masculina · adulta · calmada y cercana'],
  ['zeus','aura-2-zeus-en','en-us','Masculina · adulta · profunda y segura'],
].map(([name, voiceId, language, description]) => ({
  routeKey: `deepgram:${voiceId}`,
  name: name.charAt(0).toUpperCase() + name.slice(1),
  language,
  description,
  provider: 'deepgram' as const,
  voiceId,
  labels: { idioma: language },
}));

const fetchElevenCatalog = async (): Promise<CatalogVoice[]> => {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) return [];
  const response = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100&include_total_count=true', {
    headers: { 'xi-api-key': key },
  });
  if (!response.ok) throw new Error(`voice-catalog-a:${response.status}`);
  const payload = await response.json() as any;
  return (Array.isArray(payload?.voices) ? payload.voices : [])
    .map((voice: any): CatalogVoice | null => {
      const id = clean(voice?.voice_id, 240);
      if (!id) return null;
      const labels = voice?.labels && typeof voice.labels === 'object'
        ? Object.fromEntries(Object.entries(voice.labels).map(([k,v]) => [clean(k,40), clean(v,80)]))
        : {};
      return {
        routeKey: `elevenlabs:${id}`,
        name: clean(voice?.name, 80) || 'Voz Nayla',
        language: clean(labels.language || labels.locale, 30) || null,
        description: clean(voice?.description, 240) || null,
        previewUrl: clean(voice?.preview_url, 2000) || null,
        labels,
        provider: 'elevenlabs',
        voiceId: id,
      };
    })
    .filter((voice: CatalogVoice | null): voice is CatalogVoice => Boolean(voice));
};

const fetchCartesiaCatalog = async (): Promise<CatalogVoice[]> => {
  const key = process.env.CARTESIA_API_KEY?.trim();
  if (!key) return [];
  const response = await fetch('https://api.cartesia.ai/voices?limit=100&expand%5B%5D=preview_file_url', {
    headers: {
      Authorization: `Bearer ${key}`,
      'Cartesia-Version': process.env.CARTESIA_API_VERSION?.trim() || '2026-08-14',
    },
  });
  if (!response.ok) throw new Error(`voice-catalog-b:${response.status}`);
  const payload = await response.json() as any;
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.voices)
        ? payload.voices
        : [];
  return rows
    .map((voice: any): CatalogVoice | null => {
      const id = clean(voice?.id || voice?.voice_id, 240);
      if (!id) return null;
      const language = clean(voice?.language || voice?.primary_language, 30) || null;
      const gender = clean(voice?.gender, 30);
      const labels: Record<string,string> = {};
      if (language) labels.idioma = language;
      if (gender) labels.estilo = gender;
      return {
        routeKey: `cartesia:${id}`,
        name: clean(voice?.name, 80) || 'Voz Nayla',
        language,
        description: clean(voice?.description, 240) || null,
        previewUrl: clean(voice?.preview_file_url || voice?.preview_url, 2000) || null,
        labels,
        provider: 'cartesia',
        voiceId: id,
      };
    })
    .filter((voice: CatalogVoice | null): voice is CatalogVoice => Boolean(voice));
};

const upsertCatalog = async (voices: CatalogVoice[]) => {
  if (!voices.length) return;
  const supabase = getWorkspaceSupabaseAdmin();
  const rows = voices.map((voice) => ({
    route_key: voice.routeKey,
    user_id: null,
    name: voice.name,
    kind: 'catalog',
    language: voice.language || null,
    description: voice.description || null,
    traits: voice.labels || {},
    routes: {
      [voice.provider]: {
        voiceId: voice.voiceId,
        language: voice.language || null,
        previewUrl: voice.previewUrl || null,
        capabilities: voice.provider === 'deepgram'
          ? ['tts']
          : voice.provider === 'cartesia'
            ? ['tts','voice_change']
            : ['tts','voice_change','dialogue'],
      },
    },
    metadata: {
      previewUrl: voice.previewUrl || null,
      source: 'nayla-voice-catalog',
    },
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from('nayla_voice_profiles')
    .upsert(rows, { onConflict: 'route_key' });
  if (error) throw error;
};

export const syncNaylaVoiceCatalog = async () => {
  const catalogs = await Promise.allSettled([
    providerConfigured('ELEVENLABS_API_KEY') ? fetchElevenCatalog() : Promise.resolve([]),
    providerConfigured('CARTESIA_API_KEY') ? fetchCartesiaCatalog() : Promise.resolve([]),
  ]);

  const external = catalogs.flatMap((result) =>
    result.status === 'fulfilled' ? result.value : []
  );
  if (providerConfigured('DEEPGRAM_API_KEY')) external.push(...deepgramVoices);
  await upsertCatalog(external);
};

const rowToPublic = (row: any, userId: string): PublicNaylaVoice => {
  const routes = row?.routes && typeof row.routes === 'object' ? row.routes : {};
  const previewUrl =
    clean(row?.metadata?.previewUrl, 2000) ||
    Object.values(routes).map((route: any) => clean(route?.previewUrl, 2000)).find(Boolean) ||
    null;
  const traits = row?.traits && typeof row.traits === 'object'
    ? Object.fromEntries(
        Object.entries(row.traits)
          .map(([k,v]) => [clean(k,40), clean(v,80)])
          .filter(([k,v]) => k && v)
      )
    : {};

  return {
    id: String(row.id),
    name: clean(row.name, 80) || 'Voz Nayla',
    category: row.kind === 'cloned' ? 'cloned' : row.kind === 'system' ? 'system' : 'catalog',
    description: clean(row.description, 240) || null,
    language: clean(row.language, 30) || null,
    previewUrl,
    labels: traits,
    isOwner: row.user_id === userId,
    redundancy: Object.keys(routes).length,
  };
};

export const listNaylaVoices = async (userId: string): Promise<PublicNaylaVoice[]> => {
  const supabase = getWorkspaceSupabaseAdmin();
  const [{ data: catalog, error: catalogError }, { data: owned, error: ownedError }] = await Promise.all([
    supabase.from('nayla_voice_profiles').select('*').is('user_id', null).order('name'),
    supabase.from('nayla_voice_profiles').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
  ]);
  if (catalogError) throw catalogError;
  if (ownedError) throw ownedError;
  const seen = new Set<string>();
  return [...(owned || []), ...(catalog || [])]
    .map((row) => rowToPublic(row, userId))
    .filter((voice) => {
      const key = voice.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const getNaylaVoiceProfile = async (userId: string, id: string) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_voice_profiles')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.user_id !== null && data.user_id !== userId) return null;
  return data as {
    id: string;
    user_id: string | null;
    name: string;
    kind: string;
    language: string | null;
    description: string | null;
    traits: Record<string,string>;
    routes: PrivateVoiceRoutes;
    metadata: Record<string,unknown>;
  };
};

export const createNaylaClonedVoice = async ({
  userId,
  name,
  description,
  language,
  routes,
  metadata = {},
}: {
  userId: string;
  name: string;
  description?: string;
  language?: string;
  routes: PrivateVoiceRoutes;
  metadata?: Record<string,unknown>;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('nayla_voice_profiles')
    .insert({
      user_id: userId,
      name: name.trim().slice(0,80),
      kind: 'cloned',
      language: language?.trim().slice(0,30) || null,
      description: description?.trim().slice(0,240) || null,
      traits: { origen: 'clonada' },
      routes,
      metadata: { ...metadata, source: 'nayla-clone' },
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToPublic(data, userId);
};
