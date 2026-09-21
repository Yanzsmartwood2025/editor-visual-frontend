import { describe, expect, it } from 'vitest';
import {
  findNaylaCapabilityMatches,
  NAYLA_CAPABILITY_BIBLE,
  NAYLA_CAPABILITY_BIBLE_VERSION,
} from '../lib/naylaCapabilityBible';

describe('Nayla capability bible', () => {
  it('has a dated version and distinguishes connected from installed capabilities', () => {
    expect(NAYLA_CAPABILITY_BIBLE_VERSION).toMatch(/^2026-/);
    expect(NAYLA_CAPABILITY_BIBLE.some((item) => item.status === 'ready')).toBe(true);
    expect(NAYLA_CAPABILITY_BIBLE.some((item) => item.status === 'installed')).toBe(true);
  });

  it('maps vague 3D language to usable depth motion before real 3D integration', () => {
    const matches = findNaylaCapabilityMatches(
      'Quiero algo que parezca 3D, con profundidad y que se cruce entre las fotos'
    );

    expect(matches.map((item) => item.id)).toContain('motion-depth');
    expect(matches.map((item) => item.id)).toContain('transition-basic');
    expect(matches.find((item) => item.id === 'motion-depth')?.status).toBe('ready');
  });

  it('recognizes captions and background removal from everyday Spanish', () => {
    expect(findNaylaCapabilityMatches('quiero sacar subtítulos palabra por palabra').map((item) => item.id))
      .toContain('captions-professional');
    expect(findNaylaCapabilityMatches('quita el fondo del video y deja solo a la persona').map((item) => item.id))
      .toContain('background-removal');
  });
  it('recognizes advanced GSAP motion for complete clips', () => {
    const matches = findNaylaCapabilityMatches(
      'haz que la foto entre con elasticidad y el video salga girando'
    );

    expect(matches.map((item) => item.id)).toContain('motion-gsap');
    expect(NAYLA_CAPABILITY_BIBLE.find((item) => item.id === 'motion-gsap')?.status).toBe('ready');
  });


  it('marks procedural motion ready and recognizes particle language', () => {
    expect(NAYLA_CAPABILITY_BIBLE.find((item) => item.id === 'procedural-motion')?.status).toBe('ready');
    expect(
      findNaylaCapabilityMatches('pon partículas y estrellas moviéndose en el fondo').map((item) => item.id)
    ).toContain('procedural-motion');
  });

  it('marks real Three.js scenes ready and matches natural 3D requests', () => {
    expect(NAYLA_CAPABILITY_BIBLE.find((item) => item.id === 'three-real')?.status).toBe('ready');
    expect(
      findNaylaCapabilityMatches('usa mi modelo M1 con luces y cámara 3D').map((item) => item.id)
    ).toContain('three-real');
  });

});
