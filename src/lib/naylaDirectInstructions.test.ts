import { describe, expect, it } from 'vitest';
import {
  isNaylaDirectInstruction,
  parseNaylaDirectInstruction,
  stripNaylaDirectMarker,
} from './naylaDirectInstructions';

describe('naylaDirectInstructions', () => {
  it('detecta y parsea un bloque directo simple', () => {
    const result = parseNaylaDirectInstruction(`@direct
ratio: 9:16
render: yes
assets:
- F1 | 7.5s | push-in | dreamy-zoom | 0.5s
- F2 | 7.5s | pan | fade | 0.4s
audio:
- A1 | 60s | volume=0.8 | fadeIn=1 | fadeOut=2
subtitles:
- 0-7.5 | Primera línea | cinematic | center | 54
titles:
- 0-3 | APERTURA | minimal | center | 68 | fade-up
`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.canvasRatio).toBe('9/16');
    expect(result.plan.action.action).toBe('BUILD_TIMELINE');
    expect(result.plan.action.render).toBe(true);
    expect(result.plan.action.assets).toHaveLength(3);
    expect(result.plan.action.assets[0]).toMatchObject({
      label: 'F1',
      source: 'label',
      durationInSeconds: 7.5,
      efecto: 'push-in',
      transitionType: 'dreamy-zoom',
      transitionDuration: 0.5,
    });
    expect(result.plan.action.assets[2]).toMatchObject({
      label: 'A1',
      type: 'audio',
      volume: 0.8,
      fadeIn: 1,
      fadeOut: 2,
    });
    expect(result.plan.action.subtitles?.[0]).toMatchObject({
      text: 'Primera línea',
      start: 0,
      end: 7.5,
      style: 'cinematic',
      position: 'center',
      fontSize: 54,
    });
  });

  it('acepta JSON BUILD_TIMELINE después de @direct', () => {
    const result = parseNaylaDirectInstruction(`@direct
{"action":"build-timeline","assets":[{"type":"foto","source":"label","label":"F1","durationInSeconds":5}],"render":true}`);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.source).toBe('json');
    expect(result.plan.action.action).toBe('BUILD_TIMELINE');
  });

  it('rechaza texto que no declara modo directo', () => {
    expect(isNaylaDirectInstruction('haz un video')).toBe(false);
    const result = parseNaylaDirectInstruction('haz un video');
    expect(result.ok).toBe(false);
  });

  it('puede retirar el marcador para enviarlo como chat normal', () => {
    expect(stripNaylaDirectMarker('@direct\nHaz un video con F1')).toBe('Haz un video con F1');
  });
});
