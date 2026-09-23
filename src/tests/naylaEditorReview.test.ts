import { describe, expect, it } from 'vitest';
import { parseNaylaAction } from '../lib/naylaActions';
import { buildEditorReview } from '../lib/naylaEditorReview';
import { NAYLA_EDITOR_CONTRACT } from '../lib/naylaEditorContract';

describe('complete review before acceptance', () => {
  it('publishes the full validator contract, including nested effects and all composition layers', () => {
    const schema = JSON.stringify(NAYLA_EDITOR_CONTRACT);
    for (const field of ['assets', 'subtitles', 'titles', 'threeScenes', 'vectorAnimations', 'skiaGraphics', 'professionalEffects', 'proceduralMotion', 'gsapMotion', 'volumeKeyframes', 'motionBlur']) expect(schema).toContain(`"${field}"`);
  });
  it('shows exact styled subtitles and accounts for transitions and concurrent audio', () => {
    const action = parseNaylaAction(JSON.stringify({ action: 'BUILD_TIMELINE', render: true, assets: [
      { type: 'foto', source: 'label', label: 'F1', durationInSeconds: 5 },
      { type: 'foto', source: 'label', label: 'F2', durationInSeconds: 5, transitionType: 'fade', transitionDuration: 1 },
      { type: 'audio', source: 'label', label: 'A1', delay: 2, durationInSeconds: 4 },
    ], subtitles: [{ text: 'Esto es el poema.\nSolo el poema.', start: 0, end: 4, style: 'karaoke', position: 'center', fontSize: 64 }] }));
    if (action?.action !== 'BUILD_TIMELINE') throw new Error('fixture');
    const review = buildEditorReview(action);
    expect(review.duration).toBe(9);
    expect(review.rows[1].start).toBe(4);
    expect(review.rows[2]).toMatchObject({ start: 2, end: 6, section: 'Sonidos' });
    expect(review.rows[3].text).toBe('Esto es el poema.\nSolo el poema.');
    expect(review.rows[3].details).toContain('karaoke');
    expect(review.rows[3].details).toContain('64');
    expect(review.status).toBe('pending');
  });
  it('does not claim exact duration for unmeasured media', () => {
    const action = parseNaylaAction('{"action":"BUILD_TIMELINE","assets":[{"type":"video","source":"label","label":"V1"}]}');
    if (action?.action !== 'BUILD_TIMELINE') throw new Error('fixture');
    expect(() => buildEditorReview(action)).toThrow('duración');
  });
});
