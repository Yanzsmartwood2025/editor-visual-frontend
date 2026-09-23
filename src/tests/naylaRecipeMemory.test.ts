import { beforeEach, describe, expect, it, vi } from 'vitest';
import { findAcceptedEditorRecipes, recipeFromAction } from '../lib/naylaRecipeMemory';
import { EDITOR_LIBRARY_VERSION } from '../lib/naylaCapabilityLibrary';
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock('../lib/workspaceStore', () => ({ getWorkspaceSupabaseAdmin: () => ({ from: mocks.from }) }));
const action = { action: 'BUILD_TIMELINE', assets: [{ type: 'foto', source: 'url', url: 'https://private.example/photo?secret=abc', label: 'F9', durationInSeconds: 8, efecto: 'tilt-3d' }], subtitles: [{ text: 'Private poem', start: 0, end: 8, style: 'cinematic', position: 'center' }] };
function query(data: unknown) {
  const q: any = { then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) };
  for (const name of ['select', 'eq', 'order', 'limit', 'in']) q[name] = vi.fn(() => q);
  return q;
}
beforeEach(() => vi.resetAllMocks());
describe('private accepted-plan reference memory', () => {
  it('retains reusable controls but excludes media, text and placement', () => {
    const recipe = recipeFromAction(action);
    const text = JSON.stringify(recipe);
    expect(text).toContain('tilt-3d');
    expect(text).toContain('cinematic');
    for (const secret of ['private.example', 'secret', 'Private poem', 'F9', 'durationInSeconds', 'start']) expect(text).not.toContain(secret);
  });
  it('ignores invalid old instructions', () => {
    expect(recipeFromAction(undefined)).toBeNull();
    expect(recipeFromAction({ ...action, assets: [{ ...action.assets[0], efecto: 'invented' }] })).toBeNull();
  });
  it('scopes both tables to the owner and project, selecting only current accepted references', async () => {
    const plans = query([
      { id: 'current', metadata: { catalogVersion: EDITOR_LIBRARY_VERSION, chapters: ['motion'], dispatched: true } },
      { id: 'old', metadata: { catalogVersion: 'old', chapters: ['motion'], dispatched: true } },
      { id: 'cancelled', metadata: { catalogVersion: EDITOR_LIBRARY_VERSION, chapters: ['motion'], dispatched: false } },
    ]);
    const items = query([{ plan_id: 'current', payload: action }]);
    mocks.from.mockReturnValueOnce(plans).mockReturnValueOnce(items);
    const result = await findAcceptedEditorRecipes('owner', 'project', ['motion']);
    for (const q of [plans, items]) {
      expect(q.eq).toHaveBeenCalledWith('user_id', 'owner');
      expect(q.eq).toHaveBeenCalledWith('project_id', 'project');
    }
    expect(plans.eq).toHaveBeenCalledWith('status', 'completed');
    expect(items.in).toHaveBeenCalledWith('plan_id', ['current']);
    expect(result).toHaveLength(1);
    expect(result[0].basis).toBe('accepted_not_render_verified');
  });
  it('does not fetch payloads if there is no matching category', async () => {
    mocks.from.mockReturnValue(query([{ id: 'x', metadata: { catalogVersion: EDITOR_LIBRARY_VERSION, chapters: ['audio'], dispatched: true } }]));
    expect(await findAcceptedEditorRecipes('owner', 'project', ['three'])).toEqual([]);
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });
});
