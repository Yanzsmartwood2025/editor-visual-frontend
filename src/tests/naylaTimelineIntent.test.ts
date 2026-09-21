import { describe, expect, it } from 'vitest';
import {
  buildEvenSubtitleTiming,
  extractSubtitleBlocks,
  getRequestedTimelineSeconds,
  getRequestedVisualCount,
  hasNaturalProjectPhotoReference,
  timelinePlanRequestsRender,
} from '../lib/naylaTimelineIntent';

describe('Nayla natural timeline intent', () => {
  it('understands natural photo counts and project references', () => {
    expect(getRequestedVisualCount('usa las nueve fotos cargadas')).toBe(9);
    expect(getRequestedVisualCount('crea un video con 12 imágenes')).toBe(12);
    expect(hasNaturalProjectPhotoReference('usa las nueve fotos cargadas')).toBe(true);
  });

  it('understands total duration independently from photo count', () => {
    expect(getRequestedTimelineSeconds('haz un video de un minuto')).toBe(60);
    expect(getRequestedTimelineSeconds('duración total 90 segundos')).toBe(90);
  });

  it('keeps subtitle blocks independent and deduplicated', () => {
    const source = [
      'BLOQUE 1',
      'Primera parte',
      '',
      'BLOQUE 2',
      'Segunda parte',
      '',
      'BLOQUE 1',
      'Primera parte',
    ].join('\n');

    expect(extractSubtitleBlocks(source)).toEqual([
      'Primera parte',
      'Segunda parte',
    ]);

    expect(buildEvenSubtitleTiming(['Uno', 'Dos'], 60)).toEqual([
      { text: 'Uno', start: 0, end: 30, style: 'clean', position: 'center' },
      { text: 'Dos', start: 30, end: 60, style: 'clean', position: 'center' },
    ]);
  });

  it('recognizes final render/production intent from natural plans', () => {
    expect(timelinePlanRequestsRender('¿Confirmas que proceda con este timeline y lo renderice?')).toBe(true);
    expect(timelinePlanRequestsRender('Ayúdame a crear un video con estas fotos')).toBe(true);
    expect(timelinePlanRequestsRender('manda esto a producción')).toBe(true);
    expect(timelinePlanRequestsRender('solo organiza el timeline')).toBe(false);
  });
});
