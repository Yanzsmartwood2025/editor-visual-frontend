import { describe, expect, it } from 'vitest';
import {
  getSocialActivityReviewScope,
  isSocialActivityReviewRequest,
} from '../lib/social/activity/service';

describe('Nayla Social activity review intent', () => {
  it('recognizes natural requests to inspect connected social activity', () => {
    expect(isSocialActivityReviewRequest('Hola, ayúdame a buscar comentarios')).toBe(true);
    expect(isSocialActivityReviewRequest('Revisa todas las notificaciones')).toBe(true);
    expect(isSocialActivityReviewRequest('Mira los mensajes del inbox')).toBe(true);
    expect(isSocialActivityReviewRequest('Revisa las métricas y vistas de mis redes')).toBe(true);
    expect(isSocialActivityReviewRequest('Necesito los comentarios de los usuarios')).toBe(true);
    expect(isSocialActivityReviewRequest('Dame los mensajes de los usuarios')).toBe(true);
    expect(isSocialActivityReviewRequest('Qué me escribieron')).toBe(true);
    expect(isSocialActivityReviewRequest('Comentarios de los usuarios')).toBe(true);
  });

  it('understands comments messages and notifications as different scopes', () => {
    expect(getSocialActivityReviewScope('Tráeme todos los comentarios de los usuarios')).toEqual({
      comments: true,
      messages: false,
      metrics: false,
    });
    expect(getSocialActivityReviewScope('Necesito los mensajes de los usuarios')).toEqual({
      comments: false,
      messages: true,
      metrics: false,
    });
    expect(getSocialActivityReviewScope('Revisa todas las notificaciones')).toEqual({
      comments: true,
      messages: true,
      metrics: false,
    });
  });

  it('does not intercept publishing or reply commands', () => {
    expect(isSocialActivityReviewRequest('Publica R2 en TikTok')).toBe(false);
    expect(isSocialActivityReviewRequest('Respóndele a José')).toBe(false);
    expect(isSocialActivityReviewRequest('Dale')).toBe(false);
  });
});
