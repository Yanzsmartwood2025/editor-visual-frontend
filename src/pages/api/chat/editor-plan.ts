import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { requireFirebaseUser } from '../../../lib/firebaseAdmin';
import { resolveOwnedWorkspaceScope, insertChatMessageForUser } from '../../../lib/workspaceStore';
import { getPendingNaylaActionPlan, claimNaylaActionPlan, finishNaylaActionPlan } from '../../../lib/naylaUniversalActions';
import { parseNaylaAction } from '../../../lib/naylaActions';

const input = z.object({ projectId: z.string().uuid(), threadId: z.string().uuid(), planId: z.string().uuid(), decision: z.enum(['accept', 'cancel']) });
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
  let user;
  try { user = await requireFirebaseUser(req); } catch { return res.status(401).json({ error: 'Sesión no válida.' }); }
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Plan inválido.' });
  const { projectId, threadId, planId, decision } = parsed.data;
  try {
    await resolveOwnedWorkspaceScope({ userId: user.uid, projectId, threadId });
    const pending = await getPendingNaylaActionPlan({ userId: user.uid, projectId, module: 'editor', threadKey: threadId });
    if (!pending || pending.plan.id !== planId) return res.status(409).json({ error: 'Este plan fue reemplazado, aceptado o venció. Revisa el plan más reciente.' });
    const action = parseNaylaAction(JSON.stringify(pending.items[0]?.payload));
    if (action?.action !== 'BUILD_TIMELINE') return res.status(422).json({ error: 'El plan guardado no es válido.' });
    // Atomic pending -> executing transition prevents double-click/replay dispatch.
    const claimed = await claimNaylaActionPlan(planId);
    if (!claimed) return res.status(409).json({ error: 'Este plan ya se está atendiendo.' });
    await finishNaylaActionPlan({ planId, status: decision === 'accept' ? 'completed' : 'cancelled', result: { ...pending.plan.metadata, dispatched: decision === 'accept', renderCompleted: false } });
    await insertChatMessageForUser({ userId: user.uid, projectId, threadId, role: 'user', content: decision === 'accept' ? 'Acepté el plan de edición.' : 'Cancelé el plan de edición.', metadata: { editorPlanId: planId, decision } });
    res.setHeader('Cache-Control', 'private, no-store');
    // Return the stored payload; never ask an LLM to regenerate accepted content.
    return res.status(200).json({ planId, status: decision === 'accept' ? 'accepted' : 'cancelled', ...(decision === 'accept' ? { ...action, renderContext: pending.plan.metadata?.renderContext, projectId, threadId } : {}) });
  } catch (error) {
    console.error('[editor-plan]', error);
    return res.status(500).json({ error: 'No se pudo aceptar el plan. Revisa el historial antes de volver a intentar.' });
  }
}
