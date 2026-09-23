import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../pages/api/chat/editor-plan';
const mocks = vi.hoisted(() => ({ auth: vi.fn(), scope: vi.fn(), pending: vi.fn(), claim: vi.fn(), finish: vi.fn(), message: vi.fn() }));
vi.mock('../lib/firebaseAdmin', () => ({ requireFirebaseUser: mocks.auth }));
vi.mock('../lib/workspaceStore', () => ({ resolveOwnedWorkspaceScope: mocks.scope, insertChatMessageForUser: mocks.message }));
vi.mock('../lib/naylaUniversalActions', () => ({ getPendingNaylaActionPlan: mocks.pending, claimNaylaActionPlan: mocks.claim, finishNaylaActionPlan: mocks.finish }));
const projectId = '11111111-1111-4111-8111-111111111111';
const threadId = '22222222-2222-4222-8222-222222222222';
const planId = '33333333-3333-4333-8333-333333333333';
const payload = { action: 'BUILD_TIMELINE', assets: [{ type: 'foto', source: 'url', url: 'https://example.com/photo.jpg', durationInSeconds: 5, efecto: 'parallax-3d' }], subtitles: [{ text: 'Texto aprobado', start: 0, end: 5, style: 'karaoke' }], render: true };
const invoke = async (decision = 'accept') => {
  let status = 0; let data: any;
  const response = { status(code: number) { status = code; return response; }, json(value: unknown) { data = value; return response; }, setHeader() {} };
  await handler({ method: 'POST', body: { projectId, threadId, planId, decision } } as any, response as any);
  return { status, data };
};
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ uid: 'owner' }); mocks.scope.mockResolvedValue({ projectId, threadId });
  mocks.pending.mockResolvedValue({ plan: { id: planId, metadata: {} }, items: [{ payload }] }); mocks.claim.mockResolvedValue({ id: planId });
});
describe('editor plan acceptance', () => {
  it('returns the saved action with exact subtitle and treatment after ownership and claim', async () => {
    const result = await invoke();
    expect(result.status).toBe(200);
    expect(result.data.subtitles[0]).toMatchObject({ text: 'Texto aprobado', style: 'karaoke' });
    expect(result.data.assets[0].efecto).toBe('parallax-3d');
    expect(mocks.pending).toHaveBeenCalledWith({ userId: 'owner', projectId, module: 'editor', threadKey: threadId });
  });
  it('rejects stale plans before claiming', async () => {
    mocks.pending.mockResolvedValue({ plan: { id: 'newer' }, items: [{ payload }] });
    expect((await invoke()).status).toBe(409); expect(mocks.claim).not.toHaveBeenCalled();
  });
  it('rejects replay/double-click after an unsuccessful atomic claim', async () => {
    mocks.claim.mockResolvedValue(null);
    expect((await invoke()).status).toBe(409); expect(mocks.finish).not.toHaveBeenCalled();
  });
  it('cancels without returning an executable action', async () => {
    const result = await invoke('cancel');
    expect(result.data.status).toBe('cancelled'); expect(result.data.action).toBeUndefined();
  });
  it('rejects unauthenticated requests', async () => {
    mocks.auth.mockRejectedValue(new Error('invalid'));
    expect((await invoke()).status).toBe(401); expect(mocks.pending).not.toHaveBeenCalled();
  });
});
