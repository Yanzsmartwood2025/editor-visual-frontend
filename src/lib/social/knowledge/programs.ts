import { generateSocialText, parseJsonObject } from '../ai/generate';
import type { SocialPlatform } from '../types';
import { fitGeneratedSocialCopy, socialCopyRulesForPrompt } from '../platformRules';
import {
  contentFingerprint,
  getKnowledgeConnection,
  getLatestProgramSummary,
  listKnowledgeSourceItems,
  saveProgramSummary,
  savePublicationPackage,
  upsertKnowledgeConnection,
  upsertKnowledgeSourceItem,
} from './store';
import {
  exportGoogleDriveText,
  getGoogleDriveFile,
  googleDriveFileVersion,
  googleDriveScopeMode,
  listRecentGoogleDocuments,
  refreshGoogleDriveAccessToken,
  type GoogleDriveFile,
} from './googleDrive';
import { getWorkspaceSupabaseAdmin } from '../../workspaceStore';

type ProgramExtraction = {
  programDate?: string | null;
  programName?: string | null;
  characterName?: string | null;
  channelName?: string | null;
  language?: string | null;
  theme?: string | null;
  song?: string | null;
  summary?: string | null;
  keyPoints?: unknown[];
  baseHashtags?: string[];
  publicationNotes?: Record<string, unknown>;
};

const cleanDate = (value: unknown) => {
  const raw = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

export const summarizeProgramText = async ({
  text,
  fileName,
  modifiedTime,
}: {
  text: string;
  fileName: string;
  modifiedTime?: string | null;
}) => {
  const source = String(text || '').trim().slice(0, 60_000);
  if (!source) throw new Error('El documento no tiene texto legible.');

  const systemPrompt = [
    'Eres la bibliotecaria de programas de Nayla.',
    'Lee un documento de trabajo y crea una ficha breve, durable y útil para publicar en redes.',
    'NO copies el documento completo ni párrafos largos. Resume.',
    'No inventes datos ausentes.',
    'Detecta si corresponde a Aria, Joziel, Nayla u otro personaje/canal solo si el documento lo indica.',
    'Si hay canción, tema, título, idioma, hashtags base o instrucciones de publicación, consérvalos.',
    'La fecha debe ser YYYY-MM-DD si puede inferirse con seguridad; si no, null.',
    'summary máximo 1200 caracteres; keyPoints máximo 12 elementos; baseHashtags máximo 10.',
    'Devuelve SOLO JSON válido con: programDate, programName, characterName, channelName, language, theme, song, summary, keyPoints, baseHashtags, publicationNotes.',
  ].join('\n');

  const prompt = [
    `ARCHIVO: ${fileName}`,
    modifiedTime ? `MODIFICADO: ${modifiedTime}` : '',
    '',
    'CONTENIDO:',
    source,
  ].filter(Boolean).join('\n');

  const raw = await generateSocialText({ systemPrompt, prompt });
  const parsed = parseJsonObject<ProgramExtraction>(raw);
  if (!parsed?.summary) throw new Error('Nayla no pudo resumir el programa.');

  return {
    programDate: cleanDate(parsed.programDate),
    programName: String(parsed.programName || '').trim().slice(0, 240) || null,
    characterName: String(parsed.characterName || '').trim().slice(0, 120) || null,
    channelName: String(parsed.channelName || '').trim().slice(0, 160) || null,
    language: String(parsed.language || 'es').trim().slice(0, 32) || 'es',
    theme: String(parsed.theme || '').trim().slice(0, 400) || null,
    song: String(parsed.song || '').trim().slice(0, 240) || null,
    summary: String(parsed.summary).trim().slice(0, 1200),
    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 12) : [],
    baseHashtags: Array.isArray(parsed.baseHashtags)
      ? parsed.baseHashtags.map(String).filter(Boolean).slice(0, 10)
      : [],
    publicationNotes: parsed.publicationNotes && typeof parsed.publicationNotes === 'object'
      ? parsed.publicationNotes
      : {},
  };
};

const selectLatestFile = async ({
  accessToken,
  userId,
  projectId,
  query,
}: {
  accessToken: string;
  userId: string;
  projectId: string;
  query?: string;
}) => {
  if (googleDriveScopeMode() === 'readonly') {
    const files = await listRecentGoogleDocuments({ accessToken, query, pageSize: 30 });
    return files[0] || null;
  }

  const selected = await listKnowledgeSourceItems({ userId, projectId });
  if (!selected.length) return null;

  const refreshed = await Promise.all(
    selected.slice(0, 30).map(async (item: any) => {
      try {
        return await getGoogleDriveFile(accessToken, String(item.provider_item_id));
      } catch {
        return null;
      }
    })
  );

  return refreshed
    .filter(Boolean)
    .sort((a: any, b: any) =>
      String(b?.modifiedTime || '').localeCompare(String(a?.modifiedTime || ''))
    )[0] as GoogleDriveFile | null;
};

export const syncLatestProgramFromGoogle = async ({
  userId,
  projectId,
  query,
}: {
  userId: string;
  projectId: string;
  query?: string;
}) => {
  const connection = await getKnowledgeConnection({ userId, projectId });
  if (!connection || connection.status !== 'connected') {
    return { connected: false as const, reason: 'google_not_connected' as const };
  }

  const accessToken = await refreshGoogleDriveAccessToken(connection);
  const file = await selectLatestFile({ accessToken, userId, projectId, query });
  if (!file) {
    return {
      connected: true as const,
      found: false as const,
      reason: googleDriveScopeMode() === 'readonly'
        ? 'no_documents'
        : 'no_selected_documents',
    };
  }

  const text = await exportGoogleDriveText({ accessToken, file });
  const fingerprint = contentFingerprint(text);
  const sourceItem = await upsertKnowledgeSourceItem({
    connectionId: connection.id,
    userId,
    projectId,
    item: {
      providerItemId: file.id,
      name: file.name,
      mimeType: file.mimeType,
      webUrl: file.webViewLink || null,
      sourceModifiedAt: file.modifiedTime || null,
      metadata: {
        version: file.version || null,
        md5Checksum: file.md5Checksum || null,
        fingerprint,
      },
    },
  });

  const sourceVersion = googleDriveFileVersion(file) + ':' + fingerprint.slice(0, 16);
  const supabase = getWorkspaceSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from('social_program_summaries')
    .select('*')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('source_item_id', sourceItem.id)
    .eq('source_version', sourceVersion)
    .maybeSingle();
  if (existingError) throw existingError;

  let program = existing;
  if (!program) {
    const extracted = await summarizeProgramText({
      text,
      fileName: file.name,
      modifiedTime: file.modifiedTime || null,
    });
    program = await saveProgramSummary({
      userId,
      projectId,
      sourceItemId: sourceItem.id,
      sourceVersion,
      sourceModifiedAt: file.modifiedTime || null,
      summary: extracted,
    });
  }

  await Promise.all([
    supabase
      .from('social_source_items')
      .update({
        content_fingerprint: fingerprint,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sourceItem.id),
    upsertKnowledgeConnection({
      userId,
      projectId,
      patch: {
        status: 'connected',
        last_sync_at: new Date().toISOString(),
        last_error: null,
      },
    }),
  ]);

  return {
    connected: true as const,
    found: true as const,
    program,
    source: sourceItem,
    reusedSummary: Boolean(existing),
  };
};

type PackageDraft = {
  platform?: string;
  language?: string;
  title?: string;
  caption?: string;
  hashtags?: string[];
};

export const generateProgramPublicationPackages = async ({
  userId,
  projectId,
  program,
  platforms,
  languages = ['es'],
}: {
  userId: string;
  projectId: string;
  program?: any;
  platforms: SocialPlatform[];
  languages?: string[];
}) => {
  const sourceProgram = program || await getLatestProgramSummary({ userId, projectId });
  if (!sourceProgram) throw new Error('Nayla todavía no tiene un programa resumido.');

  const uniquePlatforms = Array.from(new Set(platforms));
  if (!uniquePlatforms.length) return [];

  const systemPrompt = [
    'Eres Nayla Social. Convierte UNA ficha de programa en copies específicos por red.',
    'Devuelve SOLO JSON válido: {"items":[{"platform":"youtube","language":"es","title":"...","caption":"...","hashtags":["#..."]}]}',
    'No inventes hechos ni letras de canciones. No copies material protegido que no esté destinado explícitamente a publicarse.',
    'Cada red debe tener copy propio; no repitas ciegamente el mismo texto.',
    'Respeta estrictamente los límites suministrados.',
    'YouTube: título buscable y corto; descripción más completa; pocos hashtags relevantes.',
    'TikTok/Reels: gancho rápido, texto directo y hashtags específicos, no una nube de hashtags.',
    'LinkedIn: contexto profesional si aplica; no fuerces tono corporativo si el programa no lo pide.',
    'Pinterest: título y descripción orientados a búsqueda.',
    'Si una red no usa título, devuelve title como cadena vacía.',
    'El usuario aprobará el paquete antes de publicar.',
  ].join('\n');

  const prompt = [
    'PROGRAMA:',
    JSON.stringify({
      date: sourceProgram.program_date,
      name: sourceProgram.program_name,
      character: sourceProgram.character_name,
      channel: sourceProgram.channel_name,
      language: sourceProgram.language,
      theme: sourceProgram.theme,
      song: sourceProgram.song,
      summary: sourceProgram.summary,
      keyPoints: sourceProgram.key_points,
      baseHashtags: sourceProgram.base_hashtags,
      publicationNotes: sourceProgram.publication_notes,
    }),
    '',
    'REGLAS POR RED:',
    JSON.stringify(socialCopyRulesForPrompt(uniquePlatforms)),
    '',
    'IDIOMAS:',
    JSON.stringify(languages),
  ].join('\n');

  const raw = await generateSocialText({ systemPrompt, prompt });
  const parsed = parseJsonObject<{ items?: PackageDraft[] }>(raw);
  const items = Array.isArray(parsed?.items) ? parsed!.items! : [];

  const allowed = new Set(uniquePlatforms);
  const saved = [];

  for (const draft of items) {
    const platform = String(draft.platform || '') as SocialPlatform;
    const language = String(draft.language || 'es').trim() || 'es';
    if (!allowed.has(platform) || !languages.includes(language)) continue;

    const fitted = fitGeneratedSocialCopy({
      platform,
      title: draft.title,
      caption: draft.caption,
      hashtags: draft.hashtags,
    });

    const row = await savePublicationPackage({
      userId,
      projectId,
      programId: sourceProgram.id,
      platform,
      language,
      title: fitted.title,
      caption: fitted.caption,
      hashtags: fitted.hashtags,
      metadata: {
        source: 'nayla_program_generator',
      },
    });
    saved.push(row);
  }

  return saved;
};
