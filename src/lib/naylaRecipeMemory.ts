import { getWorkspaceSupabaseAdmin } from './workspaceStore';
import { parseNaylaAction } from './naylaActions';
import { EDITOR_LIBRARY_VERSION } from './naylaCapabilityLibrary';

// Read only style controls from accepted plans; never replay URLs, labels or written content.
const assetKeys = ['type', 'visualTemplate', 'efecto', 'transitionType', 'transitionDuration', 'professionalEffects', 'overlay', 'overlayIntensity', 'motionBlur', 'gsapMotion', 'proceduralMotion', 'audioBus', 'volume', 'volumeKeyframes', 'fadeIn', 'fadeOut'];
const layerKeys = ['style', 'position', 'fontSize', 'animation', 'color', 'accentColor', 'preset', 'intensity', 'speed', 'scale', 'opacity', 'kind', 'fit', 'alignment', 'loop', 'playbackRate', 'direction', 'lighting', 'autoRotate', 'rotationSpeed', 'cameraDistance', 'cameraFov', 'modelScale', 'fontFamily', 'kind', 'mark', 'emoji', 'sound'];
const pick = (value: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]));
export function recipeFromAction(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;
  const action = parseNaylaAction(JSON.stringify(payload));
  if (action?.action !== 'BUILD_TIMELINE') return null;
  return {
    audioMix: action.audioMix,
    decorations: action.decorations?.slice(0, 6).map(item => pick(item, layerKeys)),
    assets: action.assets.slice(0, 12).map(asset => pick(asset, assetKeys)),
    subtitles: action.subtitles?.slice(0, 3).map(item => pick(item, layerKeys)),
    titles: action.titles?.slice(0, 3).map(item => pick(item, layerKeys)),
    threeScenes: action.threeScenes?.slice(0, 3).map(item => pick(item, layerKeys)),
    vectorAnimations: action.vectorAnimations?.slice(0, 3).map(item => pick(item, layerKeys)),
    skiaGraphics: action.skiaGraphics?.slice(0, 3).map(item => pick(item, layerKeys)),
  };
}
export async function findAcceptedEditorRecipes(userId: string, projectId: string, chapters: string[]) {
  if (!chapters.length) return [];
  const db = getWorkspaceSupabaseAdmin();
  const { data: plans, error } = await db.from('nayla_action_plans')
    .select('id, metadata').eq('user_id', userId).eq('project_id', projectId)
    .eq('module', 'editor').eq('status', 'completed')
    .order('created_at', { ascending: false }).limit(30);
  if (error) throw error;
  const matches = (plans || []).filter(plan => plan.metadata?.catalogVersion === EDITOR_LIBRARY_VERSION && plan.metadata?.dispatched === true)
    .map(plan => ({ ...plan, score: chapters.filter(id => plan.metadata?.chapters?.includes(id)).length }))
    .filter(plan => plan.score > 0).sort((a, b) => b.score - a.score).slice(0, 2);
  if (!matches.length) return [];
  const { data: items, error: itemError } = await db.from('nayla_action_items')
    .select('plan_id, payload').eq('user_id', userId).eq('project_id', projectId)
    .eq('action_type', 'BUILD_TIMELINE').in('plan_id', matches.map(plan => plan.id));
  if (itemError) throw itemError;
  return matches.flatMap(plan => {
    const recipe = recipeFromAction(items?.find(item => item.plan_id === plan.id)?.payload);
    return recipe ? [{ basis: 'accepted_not_render_verified', controls: recipe }] : [];
  });
}
