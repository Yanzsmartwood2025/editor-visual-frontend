import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireSocialUser } from '../../../../../lib/social/http';
import {
  generateProgramPublicationPackages,
  syncLatestProgramFromGoogle,
} from '../../../../../lib/social/knowledge/programs';
import { getWorkspaceSupabaseAdmin } from '../../../../../lib/workspaceStore';
import type { SocialPlatform } from '../../../../../lib/social/types';

const schema = z.object({
  projectId: z.string().uuid(),
  query: z.string().trim().max(200).optional(),
  generateCopies: z.boolean().optional().default(true),
  languages: z.array(z.string().trim().min(2).max(12)).max(3).optional().default(['es']),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST.' });
  const user = await requireSocialUser(req, res);
  if (!user) return;

  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Solicitud inválida.' });
  }

  try {
    const sync = await syncLatestProgramFromGoogle({
      userId: user.uid,
      projectId: parsed.data.projectId,
      query: parsed.data.query,
    });

    if (!sync.connected) {
      return res.status(409).json({
        error: 'Conecta Google Drive en Fuentes de Nayla antes de revisar programas.',
        code: sync.reason,
      });
    }

    if (!sync.found) {
      return res.status(404).json({
        error: sync.reason === 'no_selected_documents'
          ? 'Google está conectado, pero todavía no has seleccionado documentos para Nayla.'
          : 'No encontré documentos compatibles en Google Drive.',
        code: sync.reason,
      });
    }

    let packages: any[] = [];
    if (parsed.data.generateCopies) {
      const supabase = getWorkspaceSupabaseAdmin();
      const { data: accounts, error } = await supabase
        .from('social_accounts')
        .select('platform')
        .eq('user_id', user.uid)
        .eq('project_id', parsed.data.projectId)
        .eq('status', 'connected');
      if (error) throw error;

      const platforms = Array.from(new Set(
        (accounts || []).map((account: any) => String(account.platform))
      )) as SocialPlatform[];

      if (platforms.length) {
        packages = await generateProgramPublicationPackages({
          userId: user.uid,
          projectId: parsed.data.projectId,
          program: sync.program,
          platforms,
          languages: parsed.data.languages,
        });
      }
    }

    return res.status(200).json({
      program: sync.program,
      source: sync.source,
      reusedSummary: sync.reusedSummary,
      packages,
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Nayla no pudo actualizar el programa.',
    });
  }
}
