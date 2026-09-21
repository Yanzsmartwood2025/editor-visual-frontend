import { describe, expect, it } from 'vitest';
import {
  assistantRequestsPlanConfirmation,
  isUniversalNaylaConfirmation,
} from '../lib/naylaPlanConfirmation';

describe('Nayla universal Dale contract', () => {
  it('accepts the same short confirmations across modules', () => {
    for (const message of ['Dale', 'Adelante', 'Hazlo', 'Procede', 'Confirmo', 'Acepto']) {
      expect(isUniversalNaylaConfirmation(message)).toBe(true);
    }
  });

  it('accepts natural execution confirmations', () => {
    expect(isUniversalNaylaConfirmation('ejecuta el plan')).toBe(true);
    expect(isUniversalNaylaConfirmation('manda adelante')).toBe(true);
    expect(isUniversalNaylaConfirmation('continúa con el plan')).toBe(true);
  });

  it('does not turn ordinary conversation into execution', () => {
    expect(isUniversalNaylaConfirmation('dale un tono más cálido')).toBe(false);
    expect(isUniversalNaylaConfirmation('qué opinas del plan')).toBe(false);
    expect(isUniversalNaylaConfirmation('quiero revisar antes')).toBe(false);
  });

  it('keeps natural plan invitations compatible with the editor', () => {
    expect(
      assistantRequestsPlanConfirmation(
        'Cuando estés listo, dime “Dale” y procederé a generar y guardar el video en la Bóveda.'
      )
    ).toBe(true);
  });
});
