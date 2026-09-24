import { describe, expect, it } from 'vitest';
import { decorationsSchema, EMOJI_NAMES, SOUND_NAMES } from '../lib/naylaDecorations';
import { parseNaylaAction } from '../lib/naylaActions';
import { buildEditorReview } from '../lib/naylaEditorReview';
import { getCompositionDurationInFrames } from '../lib/timelineMetrics';
const examples = [
 { kind: 'emoji', emoji: 'sparkles' }, { kind: 'gif', label: 'F1' },
 { kind: 'annotation', mark: 'circle', text: 'Texto literal', fontFamily: 'Montserrat' },
 { kind: 'text-box', text: 'Dos\nlíneas' },
 { kind: 'svg-path', path: 'M 0 0 L 100 100' },
 { kind: 'svg-3d', path: 'M 0 0 L 100 0 L 50 100 Z' },
 { kind: 'starburst', rays: 12 }, { kind: 'sfx', sound: 'whoosh' },
];
describe('connected decorative and audio layers', () => {
 for (const example of examples) it(`keeps ${example.kind} through action, review and duration`, () => {
  const action = parseNaylaAction(JSON.stringify({ action: 'BUILD_TIMELINE', decorations: [{ ...example, start: 2, end: 6 }] }));
  if (action?.action !== 'BUILD_TIMELINE') throw new Error('Invalid action');
  expect(action.decorations?.[0].kind).toBe(example.kind);
  expect(buildEditorReview(action).duration).toBe(6);
  expect(getCompositionDurationInFrames([], 30, [], [], [], [], [], [], action.decorations)).toBe(180);
 });
 it('rejects unknown catalog entries, missing resources and invalid timing', () => {
  for (const item of [{kind:'emoji',emoji:'invented'}, {kind:'sfx',sound:'invented'}, {kind:'gif'}, {kind:'svg-path',path:'not a path'}]) expect(decorationsSchema.safeParse([{...item,start:0,end:2}]).success).toBe(false);
  expect(decorationsSchema.safeParse([{kind:'emoji',emoji:'sparkles',start:3,end:2}]).success).toBe(false);
  expect(EMOJI_NAMES.length).toBeGreaterThan(100);
  expect(SOUND_NAMES).toContain('whoosh');
 });
 it('preserves typography and requires a real URL for custom fonts', () => {
  const input = { action:'BUILD_TIMELINE', assets:[{type:'foto',source:'label',label:'F1',durationInSeconds:5}], subtitles:[{text:'Poema',start:0,end:5,fontFamily:'Playfair Display'}] };
  const result = parseNaylaAction(JSON.stringify(input));
  if(result?.action !== 'BUILD_TIMELINE') throw new Error('Invalid action');
  expect(result.subtitles?.[0].fontFamily).toBe('Playfair Display');
  input.subtitles[0].fontFamily='custom';
  expect(parseNaylaAction(JSON.stringify(input))).toBeNull();
 });
});
