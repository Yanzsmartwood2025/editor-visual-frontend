import { getWorkspaceSupabaseAdmin } from '../../workspaceStore';
import type { SocialPlatform } from '../types';
import {
  generateProgramPublicationPackages,
  syncLatestProgramFromGoogle,
} from './programs';

const normalize = (value: string) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9@]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const isProgramKnowledgeRequest = (message: string) => {
  const text = normalize(message);
  const sourceWord = /\b(programa|programas|google|drive|documento|documentos|nube|guion|guiones)\b/.test(text);
  const inspectWord = /\b(revisa|mira|lee|actualiza|sincroniza|busca|trae|conectate|conecta|que hicimos|que tenemos|cual es|ultimo|hoy)\b/.test(text);
  return sourceWord && inspectWord;
};

const languagesForProgram = (program: any) => {
  const raw = String(program?.language || '').toLowerCase();
  const hasEs = /(^|[^a-z])(es|espanol|spanish)([^a-z]|$)/.test(raw);
  const hasEn = /(^|[^a-z])(en|ingles|english)([^a-z]|$)/.test(raw);
  if (hasEs && hasEn) return ['es', 'en'];
  if (hasEn && !hasEs) return ['en'];
  return ['es'];
};

const connectedPlatforms = async ({
  userId,
  projectId,
}: {
  userId: string;
  projectId: string;
}) => {
  const supabase = getWorkspaceSupabaseAdmin();
  const { data, error } = await supabase
    .from('social_accounts')
    .select('platform')
    .eq('user_id', userId)
    .eq('project_id', projectId)
    .eq('status', 'connected');
  if (error) throw error;

  const connected = Array.from(new Set(
    (data || []).map((item: any) => String(item.platform))
  )) as SocialPlatform[];

  return connected.length
    ? connected
    : ['youtube', 'tiktok', 'facebook', 'instagram', 'threads'] as SocialPlatform[];
};

export const handleProgramKnowledgeRequest = async ({
  userId,
  projectId,
  message,
}: {
  userId: string;
  projectId: string;
  message: string;
}) => {
  const sync = await syncLatestProgramFromGoogle({
    userId,
    projectId,
    // Do not overfit natural requests such as "programa de hoy" to a filename.
    // Filename filtering can be added explicitly later.
  });

  if (!sync.connected) {
    return {
      kind: 'connection_required' as const,
      text: 'Google Drive todavía no está conectado a Fuentes de Nayla. Conéctalo una vez y después podré revisar tus programas desde aquí.',
      metadata: { source: 'google_drive', connectionRequired: true },
    };
  }

  if (!sync.found) {
    return {
      kind: 'no_source' as const,
      text: sync.reason === 'no_selected_documents'
        ? 'Google ya está conectado, pero todavía tienes que elegir qué documentos puede leer Nayla.'
        : 'Google ya está conectado, pero no encontré un documento de programa compatible.',
      metadata: { source: 'google_drive', reason: sync.reason },
    };
  }

  const platforms = await connectedPlatforms({ userId, projectId });
  const languages = languagesForProgram(sync.program);
  const packages = await generateProgramPublicationPackages({
    userId,
    projectId,
    program: sync.program,
    platforms,
    languages,
  });

  const byPlatform = new Map(packages.map((item: any) => [
    String(item.platform) + ':' + String(item.language),
    item,
  ]));
  const youtube = byPlatform.get('youtube:es') || byPlatform.get('youtube:en');
  const tiktok = byPlatform.get('tiktok:es') || byPlatform.get('tiktok:en');

  const lines = [
    'Ya revisé el programa y actualicé la ficha de Nayla.',
    sync.program.program_date ? `Fecha: ${sync.program.program_date}` : '',
    sync.program.character_name ? `Personaje: ${sync.program.character_name}` : '',
    sync.program.program_name ? `Programa: ${sync.program.program_name}` : '',
    sync.program.song ? `Música: ${sync.program.song}` : '',
    `Resumen: ${sync.program.summary}`,
    '',
    packages.length
      ? `Preparé ${packages.length} variante${packages.length === 1 ? '' : 's'} de publicación según cada red.`
      : 'El programa quedó actualizado. Cuando conectes cuentas sociales prepararé sus variantes.',
    youtube?.title ? `YouTube: ${youtube.title}` : '',
    tiktok?.caption ? `TikTok: ${String(tiktok.caption).slice(0, 220)}${String(tiktok.caption).length > 220 ? '…' : ''}` : '',
  ].filter(Boolean);

  return {
    kind: 'program' as const,
    text: lines.join('\n'),
    program: sync.program,
    packages,
    metadata: {
      source: 'google_drive',
      sourceName: sync.source?.name || null,
      programId: sync.program.id,
      packageCount: packages.length,
      reusedSummary: sync.reusedSummary,
      request: message,
    },
  };
};
