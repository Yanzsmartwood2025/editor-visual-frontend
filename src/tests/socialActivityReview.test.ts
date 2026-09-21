import { describe, expect, it } from 'vitest';
import { isSocialActivityReviewRequest } from '../lib/social/activity/service';

describe('Nayla Social activity review intent', () => {
  it('recognizes natural requests to inspect connected social activity', () => {
    expect(isSocialActivityReviewRequest('Hola, ayúdame a buscar comentarios')).toBe(true);
    expect(isSocialActivityReviewRequest('Revisa todas las notificaciones')).toBe(true);
    expect(isSocialActivityReviewRequest('Mira los mensajes del inbox')).toBe(true);
    expect(isSocialActivityReviewRequest('Revisa las métricas y vistas de mis redes')).toBe(true);
  });

  it('does not intercept publishing or reply commands', () => {
    expect(isSocialActivityReviewRequest('Publica R2 en TikTok')).toBe(false);
    expect(isSocialActivityReviewRequest('Respóndele a José')).toBe(false);
    expect(isSocialActivityReviewRequest('Dale')).toBe(false);
  });
});
